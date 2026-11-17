import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPlanSections } from "@/lib/operations";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Reads the text inside an operations plan (PDF or Word .docx) so it can be searched.
 * Runs as the signed-in person: storage and table rules mean only admins and
 * leads can store the result.
 */
export const indexOpsDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: doc, error } = await supabase.from("ops_documents").select("id, storage_path, file_name").eq("id", data.id).maybeSingle();
    if (error || !doc) throw new Error("That operations plan couldn't be found.");
    const ext = (/\.([a-z0-9]{1,6})$/i.exec(doc.file_name)?.[1] ?? "").toLowerCase();
    const save = async (row: { status: string; content?: string | null; error?: string | null; sections?: unknown; pages?: number[] | null }) => {
      const { error: upErr } = await supabase.from("ops_documents")
        .update({ status: row.status, content: row.content ?? null, error: row.error ?? null, sections: (row.sections ?? null) as any, pages: row.pages ?? null })
        .eq("id", doc.id);
      if (upErr) throw new Error(/row-level security|permission/i.test(upErr.message) ? "Only admins, leads and the event's managers can update this operations plan." : upErr.message);
    };

    if (!["pdf", "docx"].includes(ext)) {
      await save({ status: "unsupported", error: "The text inside older .doc files can't be searched. Save it as .docx and replace the file." });
      return { status: "unsupported" as const };
    }
    const { data: blob, error: dlError } = await supabase.storage.from("eventplanner-ops-plans").download(doc.storage_path);
    if (dlError || !blob) {
      await save({ status: "failed", error: "The file couldn't be read." });
      return { status: "failed" as const };
    }
    if (blob.size > MAX_BYTES) {
      await save({ status: "failed", error: "This file is too large to search (over 50 MB)." });
      return { status: "failed" as const };
    }
    try {
      const { extractDocumentText, extractPdfPages } = await import("@/lib/document-text.server");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const norm = (s: string) => s.replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
      let text = "";
      let pages: number[] | null = null;
      if (ext === "pdf") {
        pages = [];
        for (const pageText of await extractPdfPages(bytes)) {
          if (text.length >= 1_000_000) break;
          pages.push(text.length ? text.length + 1 : 0);
          text = text.length ? `${text}\n${norm(pageText)}` : norm(pageText);
        }
      } else {
        text = norm(await extractDocumentText(ext, bytes));
      }
      text = text.slice(0, 1_000_000);
      // Where each section starts (from the plan's own contents page, else the shared
      // categories), so matches and answers can be shown by section and page.
      const { data: cats } = await supabase.from("ops_categories").select("id, name").order("sort_order").order("name");
      const sections = text ? detectPlanSections(text, pages, cats ?? []) : [];
      await save({
        status: text ? "indexed" : "empty", content: text || null, pages: text ? pages : null, sections: sections.length ? sections : null,
        error: text ? null : "No readable text was found (it may be a scanned image).",
      });
      return { status: text ? ("indexed" as const) : ("empty" as const) };
    } catch (e: any) {
      console.error("indexOpsDocument failed", e?.message);
      await save({ status: "failed", error: "The file's text couldn't be read. It may be password-protected or damaged." });
      return { status: "failed" as const };
    }
  });
