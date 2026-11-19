// One-off import of the Lovable Event Planner export into OTG Shared.
// Event Planner admins only. Running it again updates the same records
// (matched by id), so it never makes duplicates.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMPORT_TABLES, BUCKET_MAP } from "@/lib/move";

async function adminOnly(userId: string) {
  const { assertAdmin } = await import("@/lib/admin.server");
  await assertAdmin(userId);
}

const Person = z.object({ old_id: z.string().uuid(), email: z.string().email().max(255), display_name: z.string().max(200).nullable().optional() });

/**
 * Matches each Event Planner person to their OTG login by email. People
 * without one get a login created quietly (no email), keeping their old id
 * when it's free, so their roles, event access and history all come across.
 * With invite on, they're also sent the Control Centre invite email now;
 * otherwise they can be invited at switch-over (or use Forgot password).
 * Everyone matched gets the Event Planner tile.
 */
export const importPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ people: z.array(Person).max(2000), invite: z.boolean(), dryRun: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await adminOnly(context.userId);
    const { getSupabaseAdmin, grantEventPlannerTile } = await import("@/lib/admin.server");
    const { CONTROL_CENTRE_URL } = await import("@/lib/control-centre");
    const admin = await getSupabaseAdmin();
    const byEmail = new Map<string, string>();
    const ids = new Set<string>();
    for (let page = 1; page < 100; page++) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of list.users) { ids.add(u.id); if (u.email) byEmail.set(u.email.toLowerCase(), u.id); }
      if (list.users.length < 1000) break;
    }
    const map: Record<string, string> = {};
    const people: Array<{ email: string; status: "has login" | "login will be created" | "login created" | "login created and invited" | "failed"; note?: string }> = [];
    for (const p of data.people) {
      const email = p.email.toLowerCase();
      let id = byEmail.get(email);
      if (id) people.push({ email, status: "has login" });
      else if (data.dryRun) { people.push({ email, status: "login will be created" }); continue; }
      else {
        const { data: made, error } = await admin.auth.admin.createUser({
          ...(ids.has(p.old_id) ? {} : { id: p.old_id }),
          email,
          email_confirm: true,
          user_metadata: { full_name: p.display_name || undefined, needs_password_setup: true },
        } as any);
        if (error || !made.user) { people.push({ email, status: "failed", note: error?.message }); continue; }
        id = made.user.id;
        byEmail.set(email, id);
        let status: "login created" | "login created and invited" = "login created";
        let note: string | undefined;
        if (data.invite) {
          const { error: e2 } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${CONTROL_CENTRE_URL}/accept-invite` });
          if (e2) note = `invite email failed: ${e2.message}`; else status = "login created and invited";
        }
        people.push({ email, status, note });
      }
      map[p.old_id] = id;
      if (!data.dryRun) await grantEventPlannerTile(id, context.userId);
    }
    return { map, people };
  });

/** A one-time upload link for one file, so large files go straight to storage. */
export const importUploadLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ bucket: z.string().refine((b) => b in BUCKET_MAP), path: z.string().min(1).max(1024) }).parse(input))
  .handler(async ({ data, context }) => {
    await adminOnly(context.userId);
    const { getSupabaseAdmin } = await import("@/lib/admin.server");
    const admin = await getSupabaseAdmin();
    const bucket = BUCKET_MAP[data.bucket];
    const { data: link, error } = await admin.storage.from(bucket).createSignedUploadUrl(data.path, { upsert: true });
    if (error || !link) throw new Error(error?.message ?? "No upload link");
    return { bucket, path: link.path, token: link.token };
  });

const KEEP_EXISTING = new Set<string>(["template_sections", "template_fields", "ops_categories", "event_categories", "event_templates"]);

/** Writes one batch of rows exactly as they were (ids, dates, versions, history). */
export const importRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ table: z.enum(IMPORT_TABLES), json: z.string().max(4_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    await adminOnly(context.userId);
    const rows = JSON.parse(data.json);
    if (!Array.isArray(rows) || !rows.length) return { written: 0 };
    const { moveImportAdmin } = await import("@/integrations/supabase/client.server");
    // A role the new app already gave someone (for example the first admin,
    // set up automatically) is the same role, so keep the one that's there.
    // The shared template and categories are only added to, never overwritten,
    // so changes made in the new app (e.g. R7's "Operating entity") survive a
    // second import at switch-over.
    const opts = data.table === "user_roles" ? { onConflict: "user_id,role", ignoreDuplicates: true }
      : KEEP_EXISTING.has(data.table) ? { onConflict: "id", ignoreDuplicates: true }
      : { onConflict: "id" };
    const { error } = await moveImportAdmin().from(data.table).upsert(rows, opts);
    if (error) throw new Error(`${data.table}: ${error.message}`);
    return { written: rows.length };
  });

/** Reads back what's now in OTG Shared, for the reconciliation report. */
export const importReadBack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await adminOnly(context.userId);
    const { getSupabaseAdmin } = await import("@/lib/admin.server");
    const admin: any = await getSupabaseAdmin();
    const tables: Record<string, unknown[]> = {};
    for (const t of IMPORT_TABLES) {
      const rows: unknown[] = [];
      const cols = t === "document_text" || t === "ops_documents" ? "id, event_id" : "*";
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from(t).select(cols).order("id").range(from, from + 999);
        if (error) throw new Error(`${t}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      tables[t] = rows;
    }
    const files: Array<{ bucket: string; path: string }> = [];
    for (const bucket of Object.values(BUCKET_MAP)) {
      const queue = [""];
      while (queue.length) {
        const prefix = queue.shift()!;
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
          if (error) throw new Error(`${bucket}: ${error.message}`);
          for (const item of data ?? []) {
            const path = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id == null) queue.push(path);
            else if (item.name !== ".emptyFolderPlaceholder") files.push({ bucket, path });
          }
          if (!data || data.length < 1000) break;
        }
      }
    }
    return { json: JSON.stringify({ tables, files }) };
  });
