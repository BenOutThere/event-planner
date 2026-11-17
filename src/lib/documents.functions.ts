import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 20 * 1024 * 1024;
const INDEXABLE = ["pdf", "docx", "xlsx", "pptx", "txt", "md", "csv"];

/**
 * Makes an uploaded file's contents searchable. Runs as the signed-in person, so
 * the file is only read if they're allowed to open it, and the result is only
 * stored if they can edit the event. Who can search it follows the area's access.
 */
export const indexDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      event_id: z.string().uuid(),
      path: z.string().min(3).max(600),
      file_name: z.string().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    if (!data.path.startsWith(`${data.event_id}/`)) throw new Error("That file doesn't belong to this event.");
    const name = data.file_name || data.path.split("/").pop() || "";
    const ext = (/\.([a-z0-9]{1,6})$/i.exec(name)?.[1] ?? "").toLowerCase();
    const save = async (row: { status: string; content?: string | null; error?: string | null }) => {
      const { error } = await supabase.from("document_text").upsert(
        { event_id: data.event_id, path: data.path, file_name: name, content: row.content ?? null, error: row.error ?? null, status: row.status },
        { onConflict: "path" },
      );
      if (error) throw new Error(/row-level security/i.test(error.message) ? "You need edit access to this event to index its documents." : error.message);
    };

    if (!INDEXABLE.includes(ext)) {
      await save({ status: "unsupported", error: "Contents of this file type can't be searched. Its title and details can." });
      return { status: "unsupported" as const };
    }
    const { data: blob, error: dlError } = await supabase.storage.from("eventplanner-files").download(data.path);
    if (dlError || !blob) {
      await save({ status: "failed", error: "The file couldn't be read." });
      return { status: "failed" as const };
    }
    if (blob.size > MAX_BYTES) {
      await save({ status: "failed", error: "This file is too large to search (over 20 MB)." });
      return { status: "failed" as const };
    }
    try {
      const { extractDocumentText } = await import("@/lib/document-text.server");
      const raw = await extractDocumentText(ext, new Uint8Array(await blob.arrayBuffer()));
      const text = raw.replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, 400_000);
      await save({ status: text ? "indexed" : "empty", content: text || null, error: text ? null : "No readable text was found (it may be a scanned image)." });
      return { status: text ? ("indexed" as const) : ("empty" as const) };
    } catch (e: any) {
      console.error("indexDocument failed", e?.message);
      await save({ status: "failed", error: "The file's text couldn't be read. It may be password-protected or damaged." });
      return { status: "failed" as const };
    }
  });
