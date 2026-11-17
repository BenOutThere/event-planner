// "Documents & links" is an index over the files and links already saved in
// event fields. It never copies them: every item points back to the field it
// lives in, and edits from the index are saved to that same field.

import type { StructArea, StructField, StructSection } from "@/lib/event-structure";
import { validateUrl, linkHost, linkTitle } from "@/lib/links";

export type DocStatus = "draft" | "current" | "superseded";

export type DocRevision = {
  path: string;
  label: string;
  size?: number;
  uploaded_at?: string;
  uploaded_by_name?: string;
  version?: string;
};

/** Shape of one saved file or link inside a field's value_links list. */
export type DocRecord = {
  id?: string;
  label?: string;
  url?: string;
  path?: string;
  size?: number;
  uploaded_at?: string;
  uploaded_by_name?: string;
  description?: string;
  status?: DocStatus;
  version?: string;
  responsible?: string;
  checked_at?: string;
  checked_by_name?: string;
  revisions?: DocRevision[];
};

export type DocItem = {
  id: string;
  kind: "file" | "link";
  title: string;
  record: DocRecord;
  index: number;
  area: StructArea;
  section: StructSection;
  field: StructField;
  status: DocStatus;
  typeLabel: string;
  host: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const STATUS_INFO: Record<DocStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-warning/20 text-foreground border-warning/50" },
  current: { label: "Current", tone: "bg-success/15 text-foreground border-success/40" },
  superseded: { label: "Superseded", tone: "bg-muted text-muted-foreground border-border" },
};

export function newDocId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(36).slice(2)}`;
}

/** Stable id for an item; older items without an id fall back to their position. */
export function docId(field: StructField, rec: DocRecord, index: number) {
  return rec.id ?? `${field.refKey}#${index}`;
}

export function extOf(name: string | undefined) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "";
}

export function fileTypeLabel(name: string | undefined): string {
  const e = extOf(name);
  if (e === "pdf") return "PDF";
  if (["doc", "docx", "odt", "rtf"].includes(e)) return "Word document";
  if (["xls", "xlsx", "ods", "csv"].includes(e)) return e === "csv" ? "CSV" : "Spreadsheet";
  if (["ppt", "pptx", "odp", "key"].includes(e)) return "Presentation";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(e)) return "Image";
  if (["txt", "md"].includes(e)) return "Text";
  if (["mp4", "mov", "webm"].includes(e)) return "Video";
  if (["zip"].includes(e)) return "ZIP archive";
  return e ? e.toUpperCase() : "File";
}

export function previewKind(name: string | undefined): "pdf" | "image" | "text" | null {
  const e = extOf(name);
  if (e === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "image";
  if (["txt", "md", "csv"].includes(e)) return "text";
  return null;
}

/** Formats whose contents can be searched after upload. */
export function isIndexable(name: string | undefined) {
  return ["pdf", "docx", "xlsx", "pptx", "txt", "md", "csv"].includes(extOf(name));
}

function usable(kind: StructField["kind"], r: DocRecord) {
  if (!r || typeof r !== "object") return false;
  if (kind === "files") return !!(r.path || r.url);
  return !!(r.url && validateUrl(r.url) === null);
}

export function collectDocuments(
  areas: StructArea[],
  getValue: (f: StructField) => any,
): DocItem[] {
  const out: DocItem[] = [];
  for (const area of areas) {
    for (const section of area.sections) {
      for (const field of section.fields) {
        if (field.kind !== "files" && field.kind !== "links") continue;
        const v = getValue(field);
        if (v?.not_applicable) continue;
        const list: DocRecord[] = Array.isArray(v?.value_links) ? v.value_links : [];
        list.forEach((rec, index) => {
          if (!usable(field.kind, rec)) return;
          const kind = field.kind === "files" ? "file" : "link";
          out.push({
            id: docId(field, rec, index),
            kind,
            title: kind === "file" ? (rec.label || "Untitled file") : linkTitle({ label: rec.label ?? "", url: rec.url ?? "" }),
            record: rec,
            index,
            area, section, field,
            status: rec.status ?? "current",
            typeLabel: kind === "file" ? fileTypeLabel(rec.label || rec.path) : "External link",
            host: kind === "link" ? linkHost(rec.url ?? "") : "",
            updatedAt: rec.uploaded_at ?? v?.updated_at ?? null,
            updatedBy: rec.uploaded_by_name ?? null,
          });
        });
      }
    }
  }
  return out;
}

export function filterDocuments(items: DocItem[], opts: { q?: string; areaId?: string; kind?: "file" | "link" | ""; showSuperseded?: boolean }) {
  const terms = (opts.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((d) => {
    if (!opts.showSuperseded && d.status === "superseded") return false;
    if (opts.areaId && d.area.id !== opts.areaId) return false;
    if (opts.kind && d.kind !== opts.kind) return false;
    if (!terms.length) return true;
    const hay = [d.title, d.record.description, d.record.label, d.record.url, d.record.path?.split("/").pop(), d.area.title, d.section.title, d.field.label, d.record.responsible, d.record.version]
      .filter(Boolean).join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Replace a file with a new revision; the previous file is kept in its history. */
export function withNewRevision(rec: DocRecord, next: { path: string; label: string; size?: number; uploaded_at: string; uploaded_by_name?: string }, version?: string): DocRecord {
  const prev: DocRevision | null = rec.path
    ? { path: rec.path, label: rec.label ?? "", size: rec.size, uploaded_at: rec.uploaded_at, uploaded_by_name: rec.uploaded_by_name, version: rec.version }
    : null;
  return {
    ...rec,
    id: rec.id ?? newDocId(),
    path: next.path,
    label: next.label,
    size: next.size,
    uploaded_at: next.uploaded_at,
    uploaded_by_name: next.uploaded_by_name,
    version: version || bumpVersion(rec.version, (rec.revisions?.length ?? 0) + (prev ? 1 : 0)),
    status: rec.status === "superseded" ? "current" : rec.status ?? "current",
    revisions: prev ? [prev, ...(rec.revisions ?? [])] : rec.revisions ?? [],
  };
}

function bumpVersion(v: string | undefined, count: number) {
  const m = /^(.*?)(\d+)$/.exec((v ?? "").trim());
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `v${count + 1}`;
}
