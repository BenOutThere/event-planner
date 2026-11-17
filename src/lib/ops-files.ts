// Browser helpers for operations plan files (company-wide and per event).
import { supabase } from "@/integrations/supabase/client";
import { OPS_BUCKET, opsStoragePath } from "@/lib/operations";
import { downloadStoredBlob, openStoredBlob } from "@/lib/blob-files";

export const OPS_DOC_COLS =
  "id, title, description, category_id, file_name, file_size, status, error, storage_path, uploaded_by_name, created_at, updated_at, sections, pages, event_id";

/** Where an event's own plan file is stored (storage rules read the event from the path). */
export function eventOpsPath(eventId: string, fileName: string) {
  return `events/${eventId}/${opsStoragePath(fileName)}`;
}

function fileNameOf(d: { storage_path: string; file_name?: string | null }) {
  return d.file_name || d.storage_path.split("/").pop() || "operations-plan";
}

/** Opens the file in a new tab (as a local copy, so ad blockers don't stop it); PDFs can open at a page. */
export function openOpsFile(d: { storage_path: string; file_name?: string | null }, page?: number | null) {
  return openStoredBlob({ bucket: OPS_BUCKET, path: d.storage_path, fileName: fileNameOf(d), page });
}

export function downloadOpsFile(d: { storage_path: string; file_name: string }) {
  return downloadStoredBlob({ bucket: OPS_BUCKET, path: d.storage_path, fileName: fileNameOf(d) });
}

/**
 * Makes a plan from the library an event's own operations plan (or moves it back
 * to company-wide with eventId null). The file moves to the matching folder so the
 * event's access rules apply to it.
 */
export async function assignOpsDocToEvent(doc: { id: string; storage_path: string; file_name: string }, eventId: string | null) {
  const newPath = eventId ? eventOpsPath(eventId, doc.file_name) : opsStoragePath(doc.file_name);
  const { error: mvErr } = await supabase.storage.from(OPS_BUCKET).move(doc.storage_path, newPath);
  if (mvErr) throw new Error("Couldn't move the file. You may not have permission.");
  const { error } = await supabase.from("ops_documents").update({ event_id: eventId, storage_path: newPath }).eq("id", doc.id);
  if (error) {
    await supabase.storage.from(OPS_BUCKET).move(newPath, doc.storage_path);
    throw new Error(/duplicate|unique/i.test(error.message) ? "That event already has an operations plan. Remove or replace it first." : "Couldn't update the plan.");
  }
}
