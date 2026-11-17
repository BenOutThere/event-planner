import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileIcon, Upload, Trash2, ExternalLink, RotateCw, X, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { indexDocument } from "@/lib/documents.functions";
import { fileTypeLabel, isIndexable, newDocId, previewKind, STATUS_INFO, type DocRecord } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { downloadStoredBlob, fetchStoredBlob, openStoredBlob } from "@/lib/blob-files";

export type StoredFile = DocRecord & { label: string; path: string };
type Upload = { id: string; file: File; progress: number; error?: string };

const BUCKET = "eventplanner-files";

export function fmtSize(n?: number) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function uploadWithProgress(path: string, file: File, onProgress: (p: number) => void, bucket: string = BUCKET) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired — sign in again.");
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.message ?? msg; } catch { /* ignore */ }
        if (xhr.status === 403 || /row-level security/i.test(msg)) msg = "You don't have permission to add files here.";
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and retry."));
    xhr.send(file);
  });
}

/** Storage path for a new upload. The first folder is the event (access), the second the area (restrictions). */
export function uploadPath(eventId: string, areaId: string | undefined, fileName: string) {
  const safe = fileName.replace(/[^\w.\- ]+/g, "_");
  return `${eventId}/${areaId ? `${areaId}/` : ""}${crypto.randomUUID()}-${safe}`;
}

function storedName(f: { path?: string; label?: string }) {
  return f.label || f.path?.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") || "download";
}

/** Opens a stored file as a local copy, so ad blockers that block storage links don't stop it. */
export async function openStoredFile(f: { path?: string; url?: string; label?: string }) {
  if (!f.path) { if (f.url) window.open(f.url, "_blank", "noopener"); return; }
  return openStoredBlob({ bucket: BUCKET, path: f.path, fileName: storedName(f) });
}

export async function downloadStoredFile(f: { path?: string; label?: string }) {
  if (!f.path) return;
  return downloadStoredBlob({ bucket: BUCKET, path: f.path, fileName: storedName(f) });
}

export function FilePreviewDialog({ file, open, onOpenChange }: { file: { path?: string; label?: string; url?: string } | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = previewKind(file?.label || file?.path);
  useEffect(() => {
    if (!open || !file) return;
    setUrl(null); setText(null); setError(null);
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (file.path) {
          const blob = await fetchStoredBlob(BUCKET, file.path, storedName(file));
          if (cancelled) return;
          if (kind === "text") setText((await blob.text()).slice(0, 200_000));
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else {
          const u = file.url ?? null;
          setUrl(u);
          if (kind === "text" && u) setText((await (await fetch(u)).text()).slice(0, 200_000));
        }
      } catch (e: any) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [open, file?.path]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{file?.label}</DialogTitle>
          <DialogDescription>Preview. Use Open or Download for the full file.</DialogDescription>
        </DialogHeader>
        <div className="h-[70vh] rounded-md border bg-muted/30 overflow-hidden grid place-items-center">
          {error ? <p className="text-sm text-destructive p-4">{error}</p>
            : !url ? <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading preview" />
              : kind === "pdf" ? <iframe title={`Preview of ${file?.label}`} src={url} className="w-full h-full bg-background" />
                : kind === "image" ? <img src={url} alt={file?.label ?? "Preview"} className="max-h-full max-w-full object-contain" />
                  : kind === "text" ? <pre className="w-full h-full overflow-auto p-4 text-xs whitespace-pre-wrap bg-background">{text ?? "Loading…"}</pre>
                    : <p className="text-sm text-muted-foreground p-4">This file type can't be previewed here. Use Open or Download.</p>}
        </div>
        <div className="flex justify-end gap-2">
          {file && <Button variant="outline" onClick={() => openStoredFile(file)}><ExternalLink className="size-4" /> Open</Button>}
          {file?.path && <Button variant="outline" onClick={() => downloadStoredFile(file)}><Download className="size-4" /> Download</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileRow({ f, onPreview, actions }: { f: StoredFile; onPreview: () => void; actions?: React.ReactNode }) {
  const canPreview = !!previewKind(f.label || f.path);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-background px-3 py-2">
      <FileIcon className="size-4 text-muted-foreground shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium break-words flex flex-wrap items-center gap-1.5">
          {f.label}
          {f.version && <span className="text-xs font-normal text-muted-foreground">{f.version}</span>}
          {f.status && f.status !== "current" && <Badge variant="outline" className={cn("text-[10px] font-normal", STATUS_INFO[f.status].tone)}>{STATUS_INFO[f.status].label}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{[fileTypeLabel(f.label || f.path), fmtSize(f.size)].filter(Boolean).join(" · ")}</div>
        {f.description && <p className="text-xs text-foreground/80 mt-0.5">{f.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        {canPreview && <Button type="button" size="sm" variant="ghost" onClick={onPreview} aria-label={`Preview ${f.label}`}><Eye className="size-3.5" /> Preview</Button>}
        <Button type="button" size="sm" variant="outline" onClick={() => openStoredFile(f)} aria-label={`Open ${f.label}`}>Open <ExternalLink className="size-3.5" /></Button>
        {f.path && <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => downloadStoredFile(f)} aria-label={`Download ${f.label}`}><Download className="size-4" /></Button>}
        {actions}
      </div>
    </li>
  );
}

export function FilesDisplay({ files, emptyText = "No files uploaded yet." }: { files: StoredFile[]; emptyText?: string }) {
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const list = (Array.isArray(files) ? files : []).filter((f) => f && (f.path || f.url) && f.status !== "superseded");
  if (!list.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <>
      <ul className="space-y-1.5">{list.map((f, i) => <FileRow key={f.id ?? f.path ?? i} f={f} onPreview={() => setPreview(f)} />)}</ul>
      <FilePreviewDialog file={preview} open={!!preview} onOpenChange={(o) => !o && setPreview(null)} />
    </>
  );
}

export function FilesField({
  eventId, areaId, value, onChange, canEdit, disabled, preview, fieldLabel,
}: {
  eventId: string;
  areaId?: string;
  value: StoredFile[];
  onChange: (v: StoredFile[]) => void;
  canEdit: boolean;
  disabled?: boolean;
  preview?: boolean;
  fieldLabel: string;
}) {
  const files: StoredFile[] = Array.isArray(value) ? value : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);
  const latest = useRef(files);
  latest.current = files;
  const { user } = useAuth();
  const index = useServerFn(indexDocument);
  const qc = useQueryClient();

  async function start(u: Upload) {
    if (preview) {
      onChange([...latest.current, { id: newDocId(), label: u.file.name, path: "", url: URL.createObjectURL(u.file), size: u.file.size }]);
      setUploads((l) => l.filter((x) => x.id !== u.id));
      return;
    }
    const path = uploadPath(eventId, areaId, u.file.name);
    setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, progress: 0, error: undefined } : x)));
    try {
      await uploadWithProgress(path, u.file, (p) => setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, progress: p } : x))));
      onChange([...latest.current, {
        id: newDocId(), label: u.file.name, path, size: u.file.size, uploaded_at: new Date().toISOString(),
        uploaded_by_name: (user?.user_metadata as any)?.display_name ?? user?.email ?? undefined, status: "current",
      }]);
      setUploads((l) => l.filter((x) => x.id !== u.id));
      if (isIndexable(u.file.name)) {
        index({ data: { event_id: eventId, path, file_name: u.file.name } })
          .then(() => qc.invalidateQueries({ queryKey: ["doc-text", eventId] }))
          .catch(() => { /* status shows in Documents & links */ });
      }
    } catch (e: any) {
      setUploads((l) => l.map((x) => (x.id === u.id ? { ...x, error: e?.message ?? "Upload failed" } : x)));
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    const items = list.map((file) => ({ id: crypto.randomUUID(), file, progress: 0 }));
    setUploads((l) => [...l, ...items]);
    items.forEach((u) => void start(u));
  }

  async function remove(idx: number) {
    const f = files[idx];
    onChange(files.filter((_, i) => i !== idx));
    const paths = [f.path, ...(f.revisions ?? []).map((r) => r.path)].filter(Boolean) as string[];
    if (paths.length && !preview) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) toast.error("The file was removed from this field, but couldn't be deleted from storage.");
      await supabase.from("document_text").delete().in("path", paths);
    }
  }

  if (!canEdit) return <FilesDisplay files={files} />;

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <FileRow key={f.id ?? f.path ?? i} f={f} onPreview={() => setPreviewFile(f)} actions={
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="size-8" disabled={disabled} aria-label={`Delete ${f.label}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {f.label}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The file{f.revisions?.length ? ` and its ${f.revisions.length} earlier version${f.revisions.length === 1 ? "" : "s"}` : ""} will be permanently removed from this event for everyone. To keep history, use “Replace with new version” in Documents &amp; links instead.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep file</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(i)}>Delete file</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            } />
          ))}
        </ul>
      )}
      {uploads.map((u) => (
        <div key={u.id} className="rounded-md border px-3 py-2 space-y-1.5" role="status">
          <div className="flex items-center gap-2 text-sm">
            <Upload className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1 min-w-0 truncate">{u.file.name}</span>
            {u.error ? (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => start(u)}><RotateCw className="size-3.5" /> Retry</Button>
                <Button type="button" size="icon" variant="ghost" aria-label={`Dismiss ${u.file.name}`}
                  onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))}><X className="size-4" /></Button>
              </>
            ) : <span className="text-xs text-muted-foreground tabular-nums">{u.progress}%</span>}
          </div>
          {u.error ? <p className="text-xs text-destructive">{u.error}</p> : <Progress value={u.progress} className="h-1.5" aria-label={`Uploading ${u.file.name}`} />}
        </div>
      ))}
      <input ref={inputRef} type="file" multiple className="hidden" onChange={pick} aria-label={`Upload files to ${fieldLabel}`} />
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" /> Upload files
      </Button>
      <FilePreviewDialog file={previewFile} open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)} />
    </div>
  );
}
