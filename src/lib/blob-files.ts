// Opens and downloads stored files as local browser copies (blob: URLs) instead of
// sending the browser straight to the storage server. Ad blockers and privacy
// extensions often block those direct storage links (ERR_BLOCKED_BY_CLIENT); a
// blob URL lives on the app's own origin, so it isn't blocked.
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeFor(name?: string | null, fallback = "application/octet-stream") {
  const ext = (name ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? fallback;
}

/** Types a browser tab can show by itself; anything else is downloaded instead. */
export function canShowInTab(name?: string | null) {
  const m = mimeFor(name, "");
  return m === "application/pdf" || m.startsWith("image/") || m.startsWith("text/");
}

/** Fetches a private stored file into a correctly typed Blob. */
export async function fetchStoredBlob(bucket: string, path: string, name?: string | null): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Couldn't open this file. You may not have access to it.");
  const type = mimeFor(name ?? path, data.type || "application/octet-stream");
  return data.type === type ? data : new Blob([data], { type });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function writeLoading(w: Window, fileName: string) {
  try {
    w.document.title = fileName;
    const p = w.document.createElement("p");
    p.textContent = `Opening ${fileName}…`;
    p.style.cssText = "font:14px system-ui,sans-serif;color:#555;margin:2rem;";
    w.document.body.appendChild(p);
  } catch { /* the tab may not be scriptable; it just stays blank until ready */ }
}

/**
 * Opens a stored file in a new tab. The tab is opened straight away (so the
 * popup blocker allows it), then pointed at the local copy once it's fetched.
 * PDFs can open at a page. Files a tab can't show are downloaded instead.
 */
export async function openStoredBlob(opts: { bucket: string; path: string; fileName: string; page?: number | null }) {
  const { bucket, path, fileName, page } = opts;
  if (!canShowInTab(fileName)) return downloadStoredBlob(opts);
  const w = window.open("", "_blank");
  if (w) writeLoading(w, fileName);
  try {
    const blob = await fetchStoredBlob(bucket, path, fileName);
    const url = URL.createObjectURL(blob);
    const target = `${url}${page && blob.type === "application/pdf" ? `#page=${page}` : ""}`;
    if (w && !w.closed) w.location.href = target;
    else downloadBlob(blob, fileName); // popup blocked: fall back to a download
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  } catch (e: any) {
    if (w && !w.closed) w.close();
    toast.error(e?.message ?? "Couldn't open this file.");
  }
}

export async function downloadStoredBlob(opts: { bucket: string; path: string; fileName: string }) {
  const id = toast.loading(`Preparing ${opts.fileName}…`);
  try {
    const blob = await fetchStoredBlob(opts.bucket, opts.path, opts.fileName);
    downloadBlob(blob, opts.fileName);
    toast.dismiss(id);
  } catch (e: any) {
    toast.error(e?.message ?? "Couldn't download this file.", { id });
  }
}
