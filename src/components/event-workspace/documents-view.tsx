import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download, Eye, ExternalLink, FileIcon, History, Link2, Loader2, MoreHorizontal, Pencil, Pin, PinOff, RefreshCw, Search, ShieldCheck, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { useSaver } from "@/hooks/use-event-saver";
import {
  collectDocuments, filterDocuments, isIndexable, newDocId, previewKind, STATUS_INFO, withNewRevision, type DocItem, type DocRecord, type DocStatus,
} from "@/lib/documents";
import { formatAuTimestamp, formatAuTimestampDate } from "@/lib/currency";
import { indexDocument } from "@/lib/documents.functions";
import { downloadStoredFile, FilePreviewDialog, fmtSize, openStoredFile, uploadPath, uploadWithProgress } from "@/components/fields/files-field";
import { cn } from "@/lib/utils";
import { usePeopleNames } from "@/components/fields/people-context";
import { useWorkspace } from "./context";
import { openDoc } from "./event-home";

export function DocumentsView() {
  const w = useWorkspace();
  const saver = useSaver();
  const index = useServerFn(indexDocument);
  const items = collectDocuments(w.areas, w.getValue);
  const [q, setQ] = useState("");
  const [areaId, setAreaId] = useState("all");
  const [kind, setKind] = useState<"" | "file" | "link">("");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [preview, setPreview] = useState<DocRecord | null>(null);
  const [editing, setEditing] = useState<DocItem | null>(null);
  const [history, setHistory] = useState<DocItem | null>(null);
  const [indexing, setIndexing] = useState<string | null>(null);
  const focusDoc = w.search.doc;
  const target = focusDoc ? items.find((d) => d.id === focusDoc) : null;
  const list = filterDocuments(items, { q, areaId: areaId === "all" ? "" : areaId, kind, showSuperseded: showSuperseded || target?.status === "superseded" });
  const areasWithDocs = w.areas.filter((a) => items.some((d) => d.area.id === a.id));
  const supersededCount = items.filter((d) => d.status === "superseded").length;

  useEffect(() => {
    if (!focusDoc) return;
    const t = setTimeout(() => document.getElementById(`doc-${focusDoc}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 100);
    return () => clearTimeout(t);
  }, [focusDoc]);

  function save(d: DocItem, next: DocRecord) {
    const v = w.getValue(d.field);
    const listNow: DocRecord[] = Array.isArray(v?.value_links) ? [...v.value_links] : [];
    const idx = d.record.id ? listNow.findIndex((x) => x?.id === d.record.id) : d.index;
    if (idx < 0 || !listNow[idx]) { toast.error("This item was changed by someone else. Refresh and try again."); return false; }
    listNow[idx] = { ...next, id: next.id ?? d.record.id ?? newDocId() };
    saver.queue(d.field.ref, { label: d.field.label, kind: d.field.kind }, { value_links: listNow }, 0);
    return true;
  }

  // Replacing keeps the previous file in the item's version history.
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DocItem | null>(null);
  function startReplace(d: DocItem) {
    replaceTarget.current = d;
    setTimeout(() => replaceInput.current?.click(), 0);
  }
  async function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const d = replaceTarget.current;
    if (replaceInput.current) replaceInput.current.value = "";
    if (!file || !d) return;
    const t = toast.loading(`Uploading ${file.name}…`);
    try {
      const path = uploadPath(w.eventId, d.area.id, file.name);
      await uploadWithProgress(path, file, () => {});
      const oldPath = d.record.path;
      if (save(d, withNewRevision(d.record, { path, label: file.name, size: file.size, uploaded_at: new Date().toISOString(), uploaded_by_name: w.userName }))) {
        toast.success("New version saved. The previous version is kept in version history.", { id: t });
        if (oldPath) await supabase.from("document_text").update({ superseded: true }).eq("path", oldPath);
        if (isIndexable(file.name)) index({ data: { event_id: w.eventId, path, file_name: file.name } }).then(() => w.invalidate("docText")).catch(() => {});
      } else toast.dismiss(t);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed", { id: t });
    }
  }

  async function markChecked(d: DocItem) {
    if (save(d, { ...d.record, checked_at: new Date().toISOString(), checked_by_name: w.userName })) toast.success("Recorded that you checked this link");
  }

  async function runIndex(d: DocItem) {
    if (!d.record.path) return;
    setIndexing(d.id);
    try {
      const r = await index({ data: { event_id: w.eventId, path: d.record.path, file_name: d.record.label } });
      toast[r.status === "indexed" ? "success" : "message"](r.status === "indexed" ? "Contents are now searchable" : r.status === "unsupported" ? "This file type can't be searched" : r.status === "empty" ? "No readable text found in this file" : "Couldn't read this file's contents");
      w.invalidate("docText");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't index this file");
    } finally { setIndexing(null); }
  }

  async function togglePin(d: DocItem) {
    const pin = w.pins.find((p) => p.pin_kind === "document" && p.target === d.id);
    const { error } = pin
      ? await supabase.from("event_pins").delete().eq("id", pin.id)
      : await supabase.from("event_pins").insert({ event_id: w.eventId, pin_kind: "document", target: d.id, label: d.title, area_id: d.area.id, sort_order: w.pins.length });
    if (error) return toast.error(/up to 6/.test(error.message) ? "Event Home can show up to 6 pinned items. Unpin one first." : "Couldn't update the pin.");
    if (!pin) toast.success("Pinned to Event Home");
    w.invalidate("pins");
  }

  async function copyLink(d: DocItem) {
    try { await navigator.clipboard.writeText(w.absoluteLink({ view: "documents", doc: d.id })); toast.success("Link to this document copied"); }
    catch { toast.error("Couldn't copy the link"); }
  }

  return (
    <section aria-labelledby="docs-title" className="rounded-xl border bg-card">
      <div className="border-b px-4 sm:px-6 py-4 space-y-3">
        <div>
          <h2 id="docs-title" className="text-xl font-display font-semibold">Documents &amp; links</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Every file and link saved anywhere in this event, in one list. Each item lives in its section — opening or updating it here changes the same item.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Filter documents and links" placeholder="Filter by title, description, file name…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger className="w-48" aria-label="Section"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {areasWithDocs.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kind || "all"} onValueChange={(v) => setKind(v === "all" ? "" : (v as any))}>
            <SelectTrigger className="w-36" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Files and links</SelectItem>
              <SelectItem value="file">Files only</SelectItem>
              <SelectItem value="link">Links only</SelectItem>
            </SelectContent>
          </Select>
          {supersededCount > 0 && (
            <span className="flex items-center gap-2 text-sm">
              <Switch id="superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="superseded" className="font-normal">Show superseded ({supersededCount})</Label>
            </span>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="px-4 sm:px-6 py-10 text-center text-sm text-muted-foreground space-y-2">
          <p>{items.length === 0 ? "No documents or links have been added to this event yet." : "Nothing matches these filters."}</p>
          {items.length > 0 && <Button size="sm" variant="outline" onClick={() => { setQ(""); setAreaId("all"); setKind(""); }}><X className="size-3.5" /> Clear filters</Button>}
        </div>
      ) : (
        <ul className="divide-y">
          {list.map((d) => {
            const r = d.record;
            const dt = r.path ? w.docText.get(r.path) : undefined;
            const pinned = w.pins.some((p) => p.pin_kind === "document" && p.target === d.id);
            return (
              <li key={d.id} id={`doc-${d.id}`} className={cn("px-4 sm:px-6 py-3 scroll-mt-24", focusDoc === d.id && "bg-accent/10 ring-2 ring-inset ring-accent/50")}>
                <div className="flex flex-wrap items-start gap-3">
                  {d.kind === "file" ? <FileIcon className="size-5 text-muted-foreground mt-0.5" aria-hidden /> : <Link2 className="size-5 text-muted-foreground mt-0.5" aria-hidden />}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium break-words">{d.title}</span>
                      {r.version && <span className="text-xs text-muted-foreground">{r.version}</span>}
                      <Badge variant="outline" className={cn("text-[10px] font-normal", STATUS_INFO[d.status].tone)}>{STATUS_INFO[d.status].label}</Badge>
                      {pinned && <Badge variant="outline" className="text-[10px] font-normal gap-1"><Pin className="size-2.5" aria-hidden /> Pinned</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>{d.kind === "file" ? [d.typeLabel, fmtSize(r.size)].filter(Boolean).join(" · ") : `External link · ${d.host}`}</span>
                      <span>·</span>
                      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => w.openArea(d.area.id, { field: d.field.refKey })}>
                        {d.area.title}{d.area.hasSubsections ? ` › ${d.section.title}` : ""} › {d.field.label}
                      </button>
                      {r.responsible && <><span>·</span><span>Responsible: {r.responsible}</span></>}
                      {d.updatedAt && <><span>·</span><span>{d.kind === "file" ? "Uploaded" : "Updated"} {formatAuTimestamp(d.updatedAt)}{d.updatedBy ? ` by ${d.updatedBy}` : ""}</span></>}
                    </div>
                    {r.description && <p className="text-sm text-foreground/85">{r.description}</p>}
                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3">
                      {d.kind === "link" ? (
                        <>
                          <span>Contents aren't searched — only the title, address and details.</span>
                          {r.checked_at
                            ? <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" aria-hidden /> Link checked {formatAuTimestampDate(r.checked_at)}{r.checked_by_name ? ` by ${r.checked_by_name}` : ""}</span>
                            : <span>Not recorded as checked. A saved link doesn't confirm the target is accessible, approved or current.</span>}
                        </>
                      ) : (
                        <IndexStatus name={r.label || r.path} status={dt?.status} error={dt?.error} canEdit={w.canEdit} busy={indexing === d.id} onIndex={() => runIndex(d)} />
                      )}
                      {(r.revisions?.length ?? 0) > 0 && <button type="button" className="underline underline-offset-2" onClick={() => setHistory(d)}>{r.revisions!.length} earlier version{r.revisions!.length === 1 ? "" : "s"}</button>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {d.kind === "file" && previewKind(r.label || r.path) && <Button size="sm" variant="ghost" onClick={() => setPreview(r)} aria-label={`Preview ${d.title}`}><Eye className="size-3.5" /> Preview</Button>}
                    <Button size="sm" variant="outline" onClick={() => openDoc(d)} aria-label={`Open ${d.title}`}>Open <ExternalLink className="size-3.5" /></Button>
                    {d.kind === "file" && <Button size="icon" variant="ghost" className="size-8" onClick={() => downloadStoredFile(r)} aria-label={`Download ${d.title}`}><Download className="size-4" /></Button>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label={`More actions for ${d.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuItem onSelect={() => copyLink(d)}><Link2 className="size-4" /> Copy link to this item</DropdownMenuItem>
                        {d.kind === "file" && <DropdownMenuItem onSelect={() => setHistory(d)}><History className="size-4" /> Version history</DropdownMenuItem>}
                        {w.canEdit && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setEditing(d)}><Pencil className="size-4" /> Edit details…</DropdownMenuItem>
                            {d.kind === "file" && <DropdownMenuItem onSelect={() => startReplace(d)}><Upload className="size-4" /> Replace with new version…</DropdownMenuItem>}
                            {d.kind === "link" && <DropdownMenuItem onSelect={() => markChecked(d)}><ShieldCheck className="size-4" /> I checked this link opens</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => togglePin(d)}>{pinned ? <><PinOff className="size-4" /> Unpin from Event Home</> : <><Pin className="size-4" /> Pin to Event Home</>}</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <input ref={replaceInput} type="file" className="hidden" onChange={onReplaceFile} aria-label="Upload a new version" />
      <FilePreviewDialog file={preview as any} open={!!preview} onOpenChange={(o) => !o && setPreview(null)} />
      {editing && <EditDetailsDialog d={editing} onClose={() => setEditing(null)} onSave={(next) => {
        if (!save(editing, next)) return;
        if (editing.record.path && next.status !== editing.status) void supabase.from("document_text").update({ superseded: next.status === "superseded" }).eq("path", editing.record.path);
        setEditing(null);
      }} />}
      {history && <VersionHistoryDialog d={history} onClose={() => setHistory(null)} onPreview={(r) => setPreview(r as any)} />}
    </section>
  );
}

function IndexStatus({ name, status, error, canEdit, busy, onIndex }: { name?: string; status?: string; error?: string | null; canEdit: boolean; busy: boolean; onIndex: () => void }) {
  if (!isIndexable(name)) return <span>Contents can't be searched for this file type — only its title and details.</span>;
  const action = canEdit && (
    <button type="button" className="underline underline-offset-2 inline-flex items-center gap-1" onClick={onIndex} disabled={busy}>
      {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />} {status ? "Re-index" : "Make contents searchable"}
    </button>
  );
  if (status === "indexed") return <span className="inline-flex items-center gap-2">Contents searchable {action}</span>;
  if (status === "failed") return <span className="inline-flex items-center gap-2 text-destructive">{error ?? "Couldn't read the contents."} {action}</span>;
  if (status === "empty") return <span className="inline-flex items-center gap-2">{error ?? "No readable text found."} {action}</span>;
  return <span className="inline-flex items-center gap-2">Contents not searchable yet {action}</span>;
}

function EditDetailsDialog({ d, onClose, onSave }: { d: DocItem; onClose: () => void; onSave: (next: DocRecord) => void }) {
  const [label, setLabel] = useState(d.record.label ?? "");
  const [description, setDescription] = useState(d.record.description ?? "");
  const [responsible, setResponsible] = useState(d.record.responsible ?? "");
  const people = usePeopleNames();
  const [version, setVersion] = useState(d.record.version ?? "");
  const [status, setStatus] = useState<DocStatus>(d.status);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Document details</DialogTitle>
          <DialogDescription>Saved with the item in {d.area.title} › {d.field.label}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="doc-title">Title</Label><Input id="doc-title" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="doc-desc">Description</Label><Textarea id="doc-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it is and when to use it" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="doc-resp">Responsible person</Label><Input id="doc-resp" list="doc-resp-people" autoComplete="off" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Choose an OTG person or type a name" /><datalist id="doc-resp-people">{people.map((p) => <option key={p} value={p} />)}</datalist></div>
            <div className="space-y-1"><Label htmlFor="doc-ver">Version or revision</Label><Input id="doc-ver" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v3 or Rev B" /></div>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DocStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current — the version to use</SelectItem>
                <SelectItem value="draft">Draft — work in progress</SelectItem>
                <SelectItem value="superseded">Superseded — kept for reference, hidden from normal lists</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...d.record, label: label.trim() || d.record.label, description: description.trim() || undefined, responsible: responsible.trim() || undefined, version: version.trim() || undefined, status })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistoryDialog({ d, onClose, onPreview }: { d: DocItem; onClose: () => void; onPreview: (r: { path: string; label: string }) => void }) {
  const r = d.record;
  const versions = [{ path: r.path!, label: r.label ?? "", version: r.version, uploaded_at: r.uploaded_at, uploaded_by_name: r.uploaded_by_name, current: true }, ...(r.revisions ?? []).map((x) => ({ ...x, current: false }))];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history — {d.title}</DialogTitle>
          <DialogDescription>The newest version is the one shown everywhere. Earlier versions stay available here.</DialogDescription>
        </DialogHeader>
        <ol className="divide-y max-h-[60vh] overflow-y-auto">
          {versions.map((v, i) => (
            <li key={`${v.path}-${i}`} className="py-2.5 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium break-words flex items-center gap-1.5">{v.label} {v.version && <span className="text-xs text-muted-foreground">{v.version}</span>}
                  {v.current && <Badge variant="outline" className={cn("text-[10px] font-normal", STATUS_INFO.current.tone)}>Latest</Badge>}</div>
                <div className="text-xs text-muted-foreground">{v.uploaded_at ? `Uploaded ${formatAuTimestamp(v.uploaded_at)}` : "Upload date not recorded"}{v.uploaded_by_name ? ` by ${v.uploaded_by_name}` : ""}</div>
              </div>
              {previewKind(v.label || v.path) && <Button size="sm" variant="ghost" onClick={() => onPreview(v)}><Eye className="size-3.5" /> Preview</Button>}
              <Button size="sm" variant="outline" onClick={() => openStoredFile(v)}>Open</Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => downloadStoredFile(v)} aria-label={`Download ${v.label}`}><Download className="size-4" /></Button>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
