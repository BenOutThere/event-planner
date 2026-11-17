import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, Loader2,
  MoreHorizontal, Pencil, RefreshCw, Search, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtSize, uploadWithProgress } from "@/components/fields/files-field";
import { AskAnswer, type Citation } from "@/components/ops/ask-answer";
import { highlightParts } from "@/lib/event-search";
import {
  OPS_ACCEPT, OPS_BUCKET, OPS_MAX_BYTES, OPS_STATUS_INFO, findPassages, opsFileAllowed, opsFileType,
  opsSearchable, opsStoragePath, pageAt, sectionHits, type OpsSection, type OpsStatus,
} from "@/lib/operations";
import { indexOpsDocument } from "@/lib/operations.functions";
import { isQuestion, keywordTerms } from "@/lib/ops-ask";
import { downloadOpsFile, eventOpsPath, openOpsFile } from "@/lib/ops-files";
import { opsFullQuery, type EventOpsDoc } from "@/hooks/use-ops-search";
import { cn } from "@/lib/utils";

const EXAMPLES = ["What are the rules for the burnout competition?", "Who is in charge of medical operations?", "What happens if severe weather is forecast?"];

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => p.match ? <mark key={i} className="bg-accent/25 text-foreground rounded-sm px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>;
}

/** End offset of a section (start of the next one, or the end of the text). */
function sectionEnd(sections: OpsSection[], i: number, len: number) {
  return sections[i + 1]?.start ?? len;
}

/**
 * Section text for reading: drops the letter-spaced heading ("1 1 B U R N O U T …")
 * and repeating page header/footer lines; short all-caps lines become sub-headings.
 */
function readableLines(text: string, footer: RegExp | null) {
  const out: Array<{ kind: "h" | "p"; text: string }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:\S ){4,}\S$/.test(line)) continue;
    if (footer && footer.test(line)) continue;
    const heading = line.length <= 60 && /[A-Z]{3}/.test(line) && !/[a-z]/.test(line);
    const last = out[out.length - 1];
    if (!heading && last?.kind === "p" && !/[.:;!?]$/.test(last.text)) last.text += ` ${line}`;
    else out.push({ kind: heading ? "h" : "p", text: line });
  }
  return out;
}

/** Most common first line of the plan's pages without its page number (the running header). */
function footerPattern(content: string, pages: number[] | null) {
  if (!pages?.length) return null;
  const freq = new Map<string, number>();
  for (const p of pages) {
    const first = content.slice(p, content.indexOf("\n", p) >>> 0).trim();
    const m = /^(.{6,120}?)\s*(?:\d{1,3}|[ivxlc]{1,6})$/i.exec(first);
    if (m) freq.set(m[1], (freq.get(m[1]) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 3) return null;
  return new RegExp(`^${top[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:\\d{1,3}|[ivxlc]{1,6})$`, "i");
}

export type PlanUrlState = { ask?: string; sec?: string };

type ResultGroup = { key: string; section: OpsSection | null; page: number | null; count: number; passages: Array<{ text: string; start: number; page: number | null }> };

/**
 * One operations plan, full page: contents, section reader, keyword search scoped
 * to this plan, and questions answered from it with section/page citations.
 * What's shown is driven by the URL (`ask`, `sec`) so links and Back work.
 */
export function PlanReader({ doc, eyebrow, canManage, userName, state, go, onEditDetails, onMoveToEvent, onRemoved, note }: {
  doc: EventOpsDoc;
  eyebrow: string;
  canManage: boolean;
  userName: string | null;
  state: PlanUrlState;
  go: (patch: PlanUrlState, opts?: { replace?: boolean }) => void;
  onEditDetails?: () => void;
  onMoveToEvent?: () => void;
  onRemoved: () => void;
  note?: ReactNode;
}) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ops-documents"] }); qc.invalidateQueries({ queryKey: ["ops-search"] }); };
  const index = useServerFn(indexOpsDocument);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const full = useQuery({ ...opsFullQuery(doc.id, doc.updated_at), enabled: doc.status === "indexed" });
  const content = full.data?.content ?? "";
  const sections = full.data?.sections ?? [];
  const pages = full.data?.pages ?? null;
  const footer = useMemo(() => footerPattern(content, pages), [content, pages]);

  const urlAsk = state.ask ?? "";
  const [text, setText] = useState(urlAsk);
  useEffect(() => { setText(urlAsk); }, [urlAsk]);
  const [asked, setAsked] = useState<string | null>(isQuestion(urlAsk) ? urlAsk.trim() : null);
  useEffect(() => { if (isQuestion(urlAsk) && urlAsk.trim() !== asked && state.sec === undefined) setAsked(urlAsk.trim()); }, [urlAsk]);
  const query = urlAsk.trim();
  const terms = query.length >= 2 ? keywordTerms(query) : [];
  const question = isQuestion(query);

  const setQuery = (v: string) => { setText(v); go({ ask: v || undefined, sec: undefined }, { replace: true }); };
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = text.trim();
    go({ ask: v || undefined, sec: undefined }, { replace: true });
    if (isQuestion(v)) setAsked(v);
  };
  const openSection = (code: string) => go({ sec: code });

  const groups = useMemo<ResultGroup[]>(() => {
    if (!content || !terms.length) return [];
    if (!sections.length) {
      const ps = findPassages(content, terms, 12).map((p) => ({ ...p, page: pageAt(pages, p.start) }));
      return ps.length ? [{ key: "all", section: null, page: null, count: ps.length, passages: ps }] : [];
    }
    return sectionHits(content, sections, pages, terms).map((h) => {
      const i = h.section ? sections.indexOf(h.section) : -1;
      const start = h.section?.start ?? 0;
      const end = h.section ? sectionEnd(sections, i, content.length) : sections[0].start;
      const ps = findPassages(content.slice(start, end), terms, 3).map((p) => ({ text: p.text, start: start + p.start, page: pageAt(pages, start + p.start) }));
      return { key: h.section?.code ?? "front", section: h.section, page: h.page, count: h.count, passages: ps };
    });
  }, [content, sections, pages, terms.join(" ")]);

  const secIndex = state.sec ? sections.findIndex((s) => s.code === state.sec) : -1;
  const current = secIndex >= 0 ? sections[secIndex] : null;

  async function reindex() {
    setBusy("Reading the plan's text…");
    try { await index({ data: { id: doc.id } }); toast.success("Text updated"); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't read the file"); }
    finally { setBusy(null); refresh(); }
  }

  async function replace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (replaceRef.current) replaceRef.current.value = "";
    if (!file) return;
    if (!opsFileAllowed(file.name)) { toast.error("Operations plans must be PDF or Word files."); return; }
    if (file.size > OPS_MAX_BYTES) { toast.error("Files can be up to 50 MB."); return; }
    // Keep the file in the same folder so the same access rules apply.
    const path = doc.event_id ? eventOpsPath(doc.event_id, file.name) : opsStoragePath(file.name);
    const oldPath = doc.storage_path;
    setBusy("Uploading the new version…");
    try {
      await uploadWithProgress(path, file, () => {}, OPS_BUCKET);
      const searchable = opsSearchable(file.name);
      const { error } = await supabase.from("ops_documents").update({
        storage_path: path, file_name: file.name, file_size: file.size, content: null, sections: null, pages: null,
        status: searchable ? "pending" : "unsupported",
        error: searchable ? null : "The text inside older .doc files can't be searched. Save it as .docx and replace the file.",
        uploaded_by_name: userName,
      }).eq("id", doc.id);
      if (error) throw new Error("Couldn't save the new version.");
      await supabase.storage.from(OPS_BUCKET).remove([oldPath]);
      toast.success("Operations plan replaced");
      go({ sec: undefined }, { replace: true });
      refresh();
      if (searchable) { setBusy("Reading the plan's text…"); await index({ data: { id: doc.id } }).catch(() => {}); refresh(); }
    } catch (err: any) {
      await supabase.storage.from(OPS_BUCKET).remove([path]);
      toast.error(err?.message ?? "Couldn't replace the file");
    } finally { setBusy(null); }
  }

  async function remove() {
    const { error } = await supabase.from("ops_documents").delete().eq("id", doc.id);
    if (error) { toast.error("Couldn't delete this plan."); return; }
    await supabase.storage.from(OPS_BUCKET).remove([doc.storage_path]);
    toast.success(`Deleted ${doc.title}`);
    refresh();
    onRemoved();
  }

  const onCite = (c: Citation) => { if (c.code) openSection(c.code); else void openOpsFile(doc, c.page); };
  const status = OPS_STATUS_INFO[doc.status as OpsStatus];
  const totalPages = pages?.length ?? null;

  return (
    <div className="space-y-4">
      {/* Plan details */}
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="ops-plan-title">
        <div className="flex flex-wrap items-start gap-3">
          <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0"><ClipboardList className="size-5" aria-hidden /></div>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
            <h1 id="ops-plan-title" className="font-display font-semibold text-xl sm:text-2xl leading-snug break-words">{doc.title}</h1>
            <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
              <span>{opsFileType(doc.file_name)}{doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ""}{totalPages ? ` · ${totalPages} pages` : ""}</span>
              <span>Updated {fmtDate(doc.updated_at)}{doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ""}</span>
              {sections.length > 0 && <span>{sections.length} sections</span>}
              {doc.status !== "indexed" && (
                <span className={cn("inline-flex items-center gap-1", doc.status === "failed" && "text-destructive")}>
                  {doc.status === "pending" && <Loader2 className="size-3 animate-spin" aria-hidden />}{status?.label ?? doc.status}
                </span>
              )}
            </p>
            {doc.description && <p className="text-sm mt-2 whitespace-pre-wrap">{doc.description}</p>}
            {doc.error && doc.status !== "indexed" && <p className="text-xs text-muted-foreground mt-1">{doc.error}</p>}
            {note}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openOpsFile(doc)}><ExternalLink className="size-4" /> Open</Button>
            <Button variant="outline" size="sm" onClick={() => downloadOpsFile(doc)} aria-label="Download"><Download className="size-4" /> <span className="hidden sm:inline">Download</span></Button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="More plan actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEditDetails && <DropdownMenuItem onSelect={onEditDetails}><Pencil className="size-4" /> Edit details</DropdownMenuItem>}
                  <DropdownMenuItem onSelect={() => replaceRef.current?.click()}><Upload className="size-4" /> Replace with a new version</DropdownMenuItem>
                  {opsSearchable(doc.file_name) && <DropdownMenuItem onSelect={() => void reindex()}><RefreshCw className="size-4" /> Re-read text and sections</DropdownMenuItem>}
                  {onMoveToEvent && <DropdownMenuItem onSelect={onMoveToEvent}><ClipboardList className="size-4" /> {doc.event_id ? "Change or remove event" : "Link to an event"}</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirmRemove(true)} className="text-destructive focus:text-destructive"><Trash2 className="size-4" /> Delete plan</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <input ref={replaceRef} type="file" accept={OPS_ACCEPT} className="hidden" onChange={replace} aria-label="Choose the new version" />
          </div>
        </div>
        {busy && <p className="mt-3 text-sm text-muted-foreground inline-flex items-center gap-1.5" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> {busy}</p>}
      </section>

      {doc.status === "indexed" ? (
        <>
          {/* Search or ask */}
          <form onSubmit={submit} role="search" className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
            <label htmlFor="ops-ask-input" className="text-sm font-medium">Search this plan or ask a question</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="ops-ask-input" value={text} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setAsked(null); } }}
                  placeholder="e.g. burnout, evacuation — or “What are the rules for the burnout competition?”"
                  className="pl-9 pr-9 h-11" autoComplete="off" />
                {text && (
                  <button type="button" onClick={() => { setQuery(""); setAsked(null); }} aria-label="Clear"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <Button type="submit" className="h-11" disabled={!text.trim()}>
                {isQuestion(text) ? <><Sparkles className="size-4" /> Ask</> : <><Search className="size-4" /> Search</>}
              </Button>
            </div>
            {!query && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => { setText(ex); go({ ask: ex, sec: undefined }, { replace: true }); setAsked(ex); }}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ex}</button>
                ))}
              </div>
            )}
            {question && asked !== query && (
              <p className="text-xs text-muted-foreground">Press <kbd className="rounded border px-1">Enter</kbd> or Ask for an answer written from this plan. Keyword matches are shown below.</p>
            )}
          </form>

          {current ? (
            <SectionReader
              doc={doc} content={content} sections={sections} pages={pages} index={secIndex} footer={footer} terms={terms}
              onBack={() => go({ sec: undefined })}
              backLabel={query ? "Results" : "Contents"}
              onSection={(code) => go({ sec: code }, { replace: true })}
            />
          ) : query ? (
            <div className="space-y-4">
              {asked && asked === query && <AskAnswer docId={doc.id} question={asked} onCite={onCite} />}
              <section className="rounded-xl border bg-card" aria-labelledby="ops-matches">
                <div className="border-b px-4 sm:px-5 py-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="ops-matches" className="font-display font-semibold">Matching sections</h2>
                  <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                    {full.isLoading ? "Searching…" : `${groups.length} section${groups.length === 1 ? "" : "s"} mention ${terms.map((t) => `“${t}”`).join(" ")}`}
                  </p>
                </div>
                {!full.isLoading && groups.length === 0 ? (
                  <p className="px-4 sm:px-5 py-8 text-center text-sm text-muted-foreground">No part of the plan contains {terms.length > 1 ? "all of these words" : "this word"}. Try fewer or different words{question ? "" : ", or ask a question"}.</p>
                ) : (
                  <ul className="divide-y">
                    {groups.map((g) => (
                      <li key={g.key} className="px-4 sm:px-5 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold break-words">{g.section ? `${g.section.code} ${g.section.title}` : g.key === "all" ? "In the plan" : "Front pages"}</h3>
                            <p className="text-xs text-muted-foreground">{g.count} match{g.count === 1 ? "" : "es"}{g.page ? ` · from page ${g.page}` : ""}</p>
                          </div>
                          {g.section && <Button size="sm" variant="outline" className="shrink-0" onClick={() => openSection(g.section!.code)}>Read section</Button>}
                        </div>
                        <ol className="space-y-1.5">
                          {g.passages.map((p) => (
                            <li key={p.start} className="rounded-md bg-muted/40 px-3 py-2 text-sm leading-relaxed break-words">
                              <Highlight text={p.text} terms={terms} />
                              {p.page && (
                                <button type="button" onClick={() => openOpsFile(doc, p.page)} className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                                  <ExternalLink className="size-3" aria-hidden /> Open at page {p.page}
                                </button>
                              )}
                            </li>
                          ))}
                        </ol>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <Contents doc={doc} sections={sections} pages={pages} loading={full.isLoading} onOpen={openSection} />
          )}
        </>
      ) : (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {doc.status === "pending" ? "Reading this plan's text — search and questions will be ready in a moment." : "This plan's text can't be searched, so only the file itself is available. Use Open or Download above."}
        </p>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {doc.title}?</AlertDialogTitle>
            <AlertDialogDescription>The plan and its file will be permanently removed for everyone. To update it instead, use “Replace with a new version”.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep plan</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void remove()}>Delete plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Contents({ doc, sections, pages, loading, onOpen }: { doc: EventOpsDoc; sections: OpsSection[]; pages: number[] | null; loading: boolean; onOpen: (code: string) => void }) {
  if (loading) return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground" role="status">Loading contents…</p>;
  if (!sections.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground space-y-2">
        <p>The plan's sections couldn't be recognised, but its full text is searchable above.</p>
        <p className="text-xs">Sections are read from the plan's contents page (lines such as “11 Burnout operations 18”).</p>
        <Button variant="outline" size="sm" onClick={() => openOpsFile(doc)}><ExternalLink className="size-4" /> Open the plan</Button>
      </div>
    );
  }
  return (
    <section className="rounded-xl border bg-card" aria-labelledby="ops-contents">
      <h2 id="ops-contents" className="border-b px-4 sm:px-5 py-3 font-display font-semibold flex items-baseline justify-between gap-2">
        Contents <span className="text-xs font-normal text-muted-foreground">Choose a section to read it</span>
      </h2>
      <ul className="grid sm:grid-cols-2 gap-px bg-border sm:[&>li:last-child:nth-child(odd)]:col-span-2">
        {sections.map((s) => {
          const pg = pageAt(pages, s.start);
          return (
            <li key={s.code} className="bg-card">
              <button type="button" onClick={() => onOpen(s.code)}
                className="w-full min-h-11 flex items-center gap-3 px-4 sm:px-5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-primary">{s.code}</span>
                <span className="flex-1 min-w-0 text-sm break-words">{s.title}</span>
                {pg && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">p. {pg}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SectionReader({ doc, content, sections, pages, index, footer, terms, onBack, backLabel, onSection }: {
  doc: EventOpsDoc; content: string; sections: OpsSection[]; pages: number[] | null; index: number; footer: RegExp | null;
  terms: string[]; onBack: () => void; backLabel: string; onSection: (code: string) => void;
}) {
  const s = sections[index];
  const end = sectionEnd(sections, index, content.length);
  const first = pageAt(pages, s.start);
  const last = pageAt(pages, Math.max(s.start, end - 1));
  const lines = useMemo(() => readableLines(content.slice(s.start, end), footer), [content, s.start, end, footer]);
  const prev = sections[index - 1];
  const next = sections[index + 1];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [s.code]);

  return (
    <article ref={ref} className="rounded-xl border bg-card scroll-mt-24" aria-labelledby="ops-section-title">
      <div className="border-b px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="size-4" /> {backLabel}</Button>
        <Select value={s.code} onValueChange={onSection}>
          <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[18rem] sm:max-w-md flex-1" aria-label="Go to section"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            {sections.map((x) => <SelectItem key={x.code} value={x.code}>{x.code} {x.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Button size="icon" variant="outline" className="size-9" disabled={!prev} onClick={() => prev && onSection(prev.code)} aria-label="Previous section"><ChevronLeft className="size-4" /></Button>
          <Button size="icon" variant="outline" className="size-9" disabled={!next} onClick={() => next && onSection(next.code)} aria-label="Next section"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tabular-nums text-primary">Section {s.code}</p>
            <h2 id="ops-section-title" className="font-display font-semibold text-xl leading-snug">{s.title}</h2>
            {first && <p className="text-xs text-muted-foreground">{last && last !== first ? `Pages ${first}–${last}` : `Page ${first}`} of the PDF</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => openOpsFile(doc, first)}><ExternalLink className="size-4" /> {first ? `Open at page ${first}` : "Open the plan"}</Button>
        </header>
        <div className="space-y-2.5 text-sm leading-relaxed max-w-prose">
          {lines.map((l, i) => l.kind === "h"
            ? <h3 key={i} className="pt-2 text-xs font-semibold uppercase tracking-wider text-foreground">{l.text}</h3>
            : <p key={i} className="break-words"><Highlight text={l.text} terms={terms} /></p>)}
          {lines.length === 0 && <p className="text-muted-foreground">This section has no readable text. Open the plan to see it.</p>}
        </div>
        <div className="flex justify-between gap-2 border-t pt-3">
          {prev ? <Button variant="ghost" size="sm" onClick={() => onSection(prev.code)} className="min-w-0"><ChevronLeft className="size-4 shrink-0" /> <span className="truncate">{prev.code} {prev.title}</span></Button> : <span />}
          {next && <Button variant="ghost" size="sm" onClick={() => onSection(next.code)} className="min-w-0"><span className="truncate">{next.code} {next.title}</span> <ChevronRight className="size-4 shrink-0" /></Button>}
        </div>
      </div>
    </article>
  );
}
