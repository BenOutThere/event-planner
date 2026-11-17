import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleSchema = z.enum(["admin", "lead", "member", "supplier", "viewer"]);
const TemplateKindSchema = z.enum(["text", "kv", "links", "files", "table", "phone", "email", "date"]);
const TableDefaultSchema = z.object({
  columns: z.array(z.string().max(120)).min(1).max(20),
  rows: z.array(z.array(z.string().max(500)).max(20)).max(50),
}).nullable();

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || `item_${Date.now()}`;
}

function nextAvailableKey(baseKey: string, existingKeys: string[]) {
  const taken = new Set(existingKeys);
  if (!taken.has(baseKey)) return baseKey;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseKey}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseKey}_${Date.now()}`;
}

/**
 * Gives someone Event Planner. Event Planner shares its login with the OTG
 * Control Centre, so:
 * - Someone who already has an OTG login just gets the Event Planner tile and a role.
 * - Someone new gets the Control Centre's invite email (they choose a password
 *   there), with the Event Planner tile already ticked.
 */
export const inviteUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().email().max(255),
      role: RoleSchema.default("member"),
      display_name: z.string().trim().max(120).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin, findUserByEmail, grantEventPlannerTile } = await import("@/lib/admin.server");
    const { CONTROL_CENTRE_URL } = await import("@/lib/control-centre");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const email = data.email.toLowerCase();
    const existing = await findUserByEmail(email);
    let userId = existing?.id;
    if (!userId) {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: data.display_name || undefined, needs_password_setup: true },
        redirectTo: `${CONTROL_CENTRE_URL}/accept-invite`,
      });
      if (error || !invited.user) throw new Error(error?.message ?? "The invite couldn't be sent.");
      userId = invited.user.id;
    }
    await grantEventPlannerTile(userId, context.userId);
    const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
      { id: userId, email, ...(data.display_name ? { display_name: data.display_name } : {}), is_active: true },
      { onConflict: "id" },
    );
    if (pErr) throw new Error(pErr.message);
    const { error: rErr } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: data.role },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
    if (rErr) throw new Error(rErr.message);
    return { ok: true, userId, alreadyHadLogin: !!existing };
  });

/** Emails a "set a new password" link. The link opens the Control Centre, where everyone signs in. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().email().max(255),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    const { CONTROL_CENTRE_URL } = await import("@/lib/control-centre");
    await assertAdmin(context.userId);
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY']!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await client.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${CONTROL_CENTRE_URL}/accept-invite`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Turns someone's Event Planner access off or on. Their OTG login and other
 * apps are untouched (use the Control Centre to deactivate someone everywhere).
 */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      is_active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && !data.is_active) throw new Error("You can't deactivate yourself.");
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Removes someone from Event Planner: their roles, event assignments and the
 * Event Planner tile. Their OTG login, other apps and the history they
 * recorded are kept.
 */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin, revokeEventPlannerTile } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You can't remove yourself.");
    }
    const supabaseAdmin = await getSupabaseAdmin();
    for (const table of ["user_roles", "event_members"] as const) {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
    }
    await revokeEventPlannerTile(data.user_id);
    return { ok: true };
  });

export const assignUserToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      event_id: z.string().uuid(),
      access_level: z.enum(["view", "edit", "manage"]).default("view"),
      role_on_event: z.string().trim().max(80).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    // An admin setting the level explicitly also resolves any "needs review" flag.
    const { error } = await supabaseAdmin
      .from("event_members")
      .upsert(
        { user_id: data.user_id, event_id: data.event_id, access_level: data.access_level, role_on_event: data.role_on_event || null, needs_review: false, review_note: null },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeUserFromEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      event_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("event_members")
      .delete()
      .eq("user_id", data.user_id)
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Shared template. Every function below changes the template used by ALL events
// (existing and future) and therefore requires the admin role on the server.
// Saved event information is never deleted by template changes: items with
// saved information are archived instead, and values are matched by stable keys.
// ---------------------------------------------------------------------------

const TableRulesSchema = z.object({
  required_columns: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  min_rows: z.number().int().min(0).max(50).nullable().optional(),
}).nullable();

async function sectionHasValues(supabaseAdmin: any, sectionIds: string[]) {
  if (!sectionIds.length) return 0;
  const { count } = await supabaseAdmin
    .from("event_field_values")
    .select("id", { count: "exact", head: true })
    .in("section_id", sectionIds);
  return count ?? 0;
}

async function insertSection(supabaseAdmin: any, data: { title: string; description?: string | null; parent_id?: string | null; nav_group?: string | null }) {
  if (data.parent_id) {
    const { data: parent, error: pErr } = await supabaseAdmin
      .from("template_sections").select("id, parent_id").eq("id", data.parent_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) throw new Error("Parent section not found");
    if (parent.parent_id) throw new Error("Only one level of nesting is supported");
  }
  const baseKey = slugify(data.title);
  const parentFilter = data.parent_id ?? null;
  const [{ data: existing }, { data: last }] = await Promise.all([
    supabaseAdmin.from("template_sections").select("key").like("key", `${baseKey}%`),
    parentFilter
      ? supabaseAdmin.from("template_sections").select("sort_order").eq("parent_id", parentFilter).order("sort_order", { ascending: false }).limit(1).maybeSingle()
      : supabaseAdmin.from("template_sections").select("sort_order").is("parent_id", null).order("sort_order", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const key = nextAvailableKey(baseKey, (existing ?? []).map((row: any) => row.key));
  const sortOrder = (last?.sort_order ?? 0) + 10;
  const { data: section, error } = await supabaseAdmin
    .from("template_sections")
    .insert({ key, title: data.title, description: data.description || null, sort_order: sortOrder, parent_id: data.parent_id ?? null, nav_group: data.nav_group ?? null })
    .select("*").single();
  if (error) throw new Error(error.message);
  return section;
}

async function insertField(supabaseAdmin: any, data: { section_id: string; kind: string; label: string }) {
  const baseKey = slugify(data.label);
  const [{ data: existing }, { data: last }] = await Promise.all([
    supabaseAdmin.from("template_fields").select("key").eq("section_id", data.section_id).like("key", `${baseKey}%`),
    supabaseAdmin.from("template_fields").select("sort_order").eq("section_id", data.section_id).order("sort_order", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const key = nextAvailableKey(baseKey, (existing ?? []).map((row: any) => row.key));
  const sortOrder = (last?.sort_order ?? 0) + 10;
  const multiline = data.kind === "text" && !/name|provider|entity|title|address/i.test(data.label) ? true : data.kind === "text" ? false : true;
  const { data: field, error } = await supabaseAdmin
    .from("template_fields")
    .insert({ section_id: data.section_id, key, label: data.label, kind: data.kind, sort_order: sortOrder, multiline })
    .select("*").single();
  if (error) throw new Error(error.message);
  return field;
}

export const createTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional().nullable(),
      parent_id: z.string().uuid().optional().nullable(),
      nav_group: z.string().trim().max(60).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const section = await insertSection(await getSupabaseAdmin(), data);
    return { section };
  });

export const updateTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        is_active: z.boolean().optional(),
        show_in_wizard: z.boolean().optional(),
        sort_order: z.number().int().optional(),
        nav_group: z.string().trim().max(60).nullable().optional(),
        restricted_to: z.enum(["staff", "managers"]).nullable().optional(),
      }).refine((patch) => Object.keys(patch).length > 0, "No changes supplied"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("template_sections").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Removes a section from the template. If any event has information in it, it is archived instead. */
export const deleteTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: kids } = await supabaseAdmin.from("template_sections").select("id").eq("parent_id", data.id);
    const ids = [data.id, ...(kids ?? []).map((k: any) => k.id)];
    const withValues = await sectionHasValues(supabaseAdmin, ids);
    if (withValues > 0) {
      const { error } = await supabaseAdmin.from("template_sections").update({ is_active: false }).in("id", ids);
      if (error) throw new Error(error.message);
      return { archived: true };
    }
    const { error } = await supabaseAdmin.from("template_sections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { archived: false };
  });

export const restoreTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: kids } = await supabaseAdmin.from("template_sections").select("id").eq("parent_id", data.id);
    const ids = [data.id, ...(kids ?? []).map((k: any) => k.id)];
    const { error } = await supabaseAdmin.from("template_sections").update({ is_active: true }).in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createTemplateField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      section_id: z.string().uuid(),
      kind: TemplateKindSchema,
      label: z.string().trim().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const field = await insertField(await getSupabaseAdmin(), data);
    return { field };
  });

export const updateTemplateField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        label: z.string().trim().min(1).max(120).optional(),
        kind: TemplateKindSchema.optional(),
        sort_order: z.number().int().optional(),
        default_table: TableDefaultSchema.optional(),
        help_text: z.string().trim().max(500).nullable().optional(),
        is_required: z.boolean().optional(),
        allow_na: z.boolean().optional(),
        multiline: z.boolean().optional(),
        table_rules: TableRulesSchema.optional(),
      }).refine((patch) => Object.keys(patch).length > 0, "No changes supplied"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    // The field key never changes, so renaming keeps every event's saved values attached.
    const { error } = await supabaseAdmin.from("template_fields").update(data.patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Removes a field from the template. If any event has information in it, it is archived instead. */
export const deleteTemplateField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: f, error: fErr } = await supabaseAdmin.from("template_fields").select("section_id, key").eq("id", data.id).maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!f) return { archived: false };
    const { count } = await supabaseAdmin.from("event_field_values")
      .select("id", { count: "exact", head: true }).eq("section_id", f.section_id).eq("field_key", f.key);
    if ((count ?? 0) > 0) {
      const { error } = await supabaseAdmin.from("template_fields").update({ archived_at: new Date().toISOString() } as any).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { archived: true };
    }
    const { error } = await supabaseAdmin.from("template_fields").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { archived: false };
  });

export const restoreTemplateField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("template_fields").update({ archived_at: null } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** How many events a template change would touch, and how many hold information there. */
export const getTemplateImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      section_id: z.string().uuid().optional(),
      field_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const supabaseAdmin = await getSupabaseAdmin();
    const { count: events } = await supabaseAdmin.from("events").select("id", { count: "exact", head: true });
    let q = supabaseAdmin.from("event_field_values").select("event_id, value_text, value_kv, value_links, value_table");
    if (data.field_id) {
      const { data: f } = await supabaseAdmin.from("template_fields").select("section_id, key").eq("id", data.field_id).maybeSingle();
      if (!f) return { events: events ?? 0, eventsWithData: 0 };
      q = q.eq("section_id", f.section_id).eq("field_key", f.key);
    } else if (data.section_id) {
      const { data: kids } = await supabaseAdmin.from("template_sections").select("id").eq("parent_id", data.section_id);
      q = q.in("section_id", [data.section_id, ...(kids ?? []).map((k: any) => k.id)]);
    }
    const { data: rows } = await q;
    const has = (r: any) =>
      (r.value_text && String(r.value_text).trim()) ||
      (Array.isArray(r.value_kv) && r.value_kv.length) ||
      (Array.isArray(r.value_links) && r.value_links.length) ||
      r.value_table;
    const withData = new Set((rows ?? []).filter(has).map((r: any) => r.event_id));
    return { events: events ?? 0, eventsWithData: withData.size };
  });

// Adding to the shared template from inside an event. Admin only — other event
// editors add fields and sub-sections to their event only (event_custom_fields /
// event_section_extras, protected by row-level security).
export const addTemplateSubsectionFromEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      parent_id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const section = await insertSection(await getSupabaseAdmin(), { title: data.title, parent_id: data.parent_id });
    return { section };
  });

export const addTemplateFieldFromEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      section_id: z.string().uuid(),
      kind: TemplateKindSchema,
      label: z.string().trim().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, getSupabaseAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.userId);
    const field = await insertField(await getSupabaseAdmin(), data);
    return { field };
  });
