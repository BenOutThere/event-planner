import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveCategory, visibleCategories, type OpsCategory } from "@/lib/ops-categories";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList, ExternalLink, FileText, Loader2, Plus, Search, Upload, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtSize, uploadWithProgress } from "@/components/fields/files-field";
import { highlightParts, searchTerms } from "@/lib/event-search";
import {
  OPS_ACCEPT, OPS_BUCKET, OPS_MAX_BYTES, OPS_STATUS_INFO, canManageOps, canReadOps,
  opsFileAllowed, opsFileType, opsSearchable, opsStoragePath, titleFromFileName, type OpsStatus,
  pageAt, sectionLabel, type OpsSection,
} from "@/lib/operations";
import { indexOpsDocument } from "@/lib/operations.functions";
import { useOpsHits, type OpsHit } from "@/hooks/use-ops-search";
import { openOpsFile } from "@/lib/ops-files";
import { CategorySelect } from "@/components/ops/plan-dialogs";
import { cn } from "@/lib/utils";

type OpsSearch = { q?: string; category?: string; doc?: string; section?: string };

export const Route = createFileRoute("/_authenticated/operations")({
  validateSearch: (s: Record<string, unknown>): OpsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    category: typeof s.category === "string" && s.category ? s.category : undefined,
    doc: typeof s.doc === "string" && s.doc ? s.doc : undefined,
    section: typeof s.section === "string" && s.section ? s.section : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Operations plans — OTG Event Planner" },
      { name: "description", content: "Search Out There Group's company-wide operations plans and SOPs, read-only for all staff." },
      { property: "og:title", content: "Operations plans — OTG Event Planner" },
      { property: "og:description", content: "Search Out There Group's company-wide operations plans and SOPs, read-only for all staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationsPage,
});

type Category = { id: string; name: string; sort_order: number };
type OpsDoc = {
  id: string; title: string; description: string | null; category_id: string | null; file_name: string;
  file_size: number | null; status: string; error: string | null; storage_path: string;
  uploaded_by_name: string | null; created_at: string; updated_at: string;
  sections: OpsSection[] | null; pages: number[] | null;
};

const UNCATEGORISED = "none";
const DOC_COLS = "id, title, description, category_id, file_name, file_size, status, error, storage_path, uploaded_by_name, created_at, updated_at, sections, pages";

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => p.match ? <mark key={i} className="bg-accent/25 text-foreground rounded-sm px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>;
}

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

const openDoc = openOpsFile;

function OperationsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/operations" });
  const { roles, user, loading } = useAuth();
  const canRead = canReadOps(roles);
  const canManage = canManageOps(roles);
  const setSearch = (patch: Partial<OpsSearch>, replace = true) =>
    navigate({ search: (s: OpsSearch) => ({ ...s, ...patch }), replace });

  const q = search.q ?? "";
  const dq = useDebounced(q.trim(), 250);
  const terms = searchTerms(q);
  const [uploadOpen, setUploadOpen] = useState(false);

  const cats = useQuery({
    queryKey: ["ops-categories"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_categories").select("id, name, sort_order, is_main, main_category_id").order("sort_order").order("name");
      if (error) throw error;
      return data as OpsCategory[];
    },
  });
  const docs = useQuery({
    queryKey: ["ops-documents"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select(DOC_COLS).order("title");
      if (error) throw error;
      return data as OpsDoc[];
    },
    refetchInterval: (query) => ((query.state.data as OpsDoc[] | undefined)?.some((d) => d.status === "pending") ? 3000 : false),
  });
  const results = useOpsHits(dq, canRead);

  // R19: plans and sections are filed under their main category once grouped.
  const catById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const shownCats = useMemo(() => visibleCategories(cats.data ?? []), [cats.data]);
  const resolve = (id: string | null | undefined) => resolveCategory(id, catById);
  const catName = useMemo(() => new Map(shownCats.map((c) => [c.id, c.name])), [shownCats]);
  const byId = useMemo(() => new Map((docs.data ?? []).map((d) => [d.id, d])), [docs.data]);
  const inCategory = (catId: string | null) =>
    !search.category || (search.category === UNCATEGORISED ? !resolve(catId) : resolve(catId) === search.category);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs.data ?? []) {
      const own = resolve(d.category_id);
      const k = own ?? UNCATEGORISED;
      m.set(k, (m.get(k) ?? 0) + 1);
      // Sections inside a large plan count towards their category too.
      for (const c of new Set((d.sections ?? []).map((x) => resolve(x.category_id)).filter((x): x is string => !!x && x !== own))) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.data, catById]);

  const groups = useMemo(() => {
    const list = (docs.data ?? []).filter((d) => inCategory(d.category_id));
    const out: Array<{ id: string; name: string; items: OpsDoc[] }> = [];
    for (const c of shownCats) {
      const items = list.filter((d) => resolve(d.category_id) === c.id);
      if (items.length) out.push({ id: c.id, name: c.name, items });
    }
    const rest = list.filter((d) => !resolve(d.category_id));
    if (rest.length) out.push({ id: UNCATEGORISED, name: "", items: rest });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.data, shownCats, catById, search.category]);

  const searching = dq.length >= 2;
  const hitCategory = (h: OpsHit) => (h.section !== undefined ? h.section?.category_id ?? null : h.docCategoryId);
  const shownResults = results.hits.filter((h) => inCategory(hitCategory(h)));
  // Browsing a category also lists that section inside large plans.
  const sectionRows = search.category && search.category !== UNCATEGORISED
    ? (docs.data ?? []).flatMap((d) => (d.sections ?? []).filter((x) => resolve(x.category_id) === search.category).map((x) => ({ d, s: x, page: pageAt(d.pages, x.start) })))
    : [];
  // Older links (?doc=…&section=…) open the plan's own page.
  useEffect(() => {
    if (!search.doc) return;
    navigate({ to: "/operations/$docId", params: { docId: search.doc }, search: { ask: search.q || undefined, sec: search.section && search.section !== "front" ? search.section : undefined }, replace: true });
  }, [search.doc]);
  const openPlan = (docId: string, sec?: string | null) =>
    navigate({ to: "/operations/$docId", params: { docId }, search: { ask: q.trim() || undefined, sec: sec && sec !== "front" ? sec : undefined } });

  if (!loading && !canRead) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="rounded-xl border bg-card p-8 text-center space-y-2">
          <h1 className="font-display font-semibold text-xl">Operations plans</h1>
          <p className="text-sm text-muted-foreground">The company-wide operations plans are available to Out There Group staff only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">Operations plans</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every event's operations plan and the company-wide SOPs. Search finds the exact passage across all plans — open a plan to read it by section, search just that plan, or ask it a question.
            {canManage ? " As an admin or lead you can upload and maintain them." : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setUploadOpen(true)}><Upload className="size-4" /> Upload plans</Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch({ q: undefined }); }}
            placeholder="Search operations plans, e.g. medical, evacuation, bump-in…"
            aria-label="Search operations plans"
            className="pl-9 pr-9"
          />
          {q && (
            <button type="button" onClick={() => setSearch({ q: undefined })} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={search.category ?? "all"} onValueChange={(v) => setSearch({ category: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-full sm:w-[26rem]" aria-label="Filter by category"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All categories ({docs.data?.length ?? 0})</SelectItem>
              {shownCats.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({counts.get(c.id) ?? 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {search.category && <Button variant="ghost" size="sm" onClick={() => setSearch({ category: undefined })}><X className="size-3.5" /> Show all</Button>}
        </div>
      </div>

      {docs.isLoading ? (
        <p className="text-center py-12 text-muted-foreground" role="status">Loading operations plans…</p>
      ) : docs.error ? (
        <p className="text-center py-12 text-muted-foreground">Operations plans couldn't be loaded. Check your connection and refresh.</p>
      ) : (docs.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-3">
          <ClipboardList className="size-8 mx-auto text-muted-foreground" aria-hidden />
          <h2 className="font-display font-semibold text-lg">No operations plans yet</h2>
          <p className="text-sm text-muted-foreground">{canManage ? "Upload your PDF and Word operations plans to make them searchable for every department." : "Admins and leads add the company-wide operations plans here."}</p>
          {canManage && <Button onClick={() => setUploadOpen(true)}><Upload className="size-4" /> Upload plans</Button>}
        </div>
      ) : searching ? (
        <section className="rounded-xl border bg-card" aria-labelledby="ops-results">
          <div className="border-b px-4 sm:px-6 py-3 flex items-baseline justify-between gap-2">
            <h2 id="ops-results" className="font-display font-semibold">Results</h2>
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {results.isFetching || q.trim() !== dq ? "Searching…" : `${shownResults.length} result${shownResults.length === 1 ? "" : "s"} for “${dq}”`}
            </p>
          </div>
          {!results.isFetching && shownResults.length === 0 ? (
            <p className="px-4 sm:px-6 py-10 text-center text-sm text-muted-foreground">No operations plans match “{dq}”{search.category ? " in this category" : ""}.</p>
          ) : (
            <ul className="divide-y">
              {shownResults.map((h) => (
                <li key={h.key} className="flex items-start gap-2 px-4 sm:px-6 py-3 hover:bg-muted/50">
                  <button type="button" onClick={() => openPlan(h.docId, h.section?.code)}
                    className="flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="text-sm font-medium break-words"><Highlight text={h.section !== undefined ? sectionLabel(h.section) : h.title} terms={terms} /></div>
                    <div className="text-xs text-muted-foreground">
                      {(h.section !== undefined
                        ? [h.title, h.page ? `page ${h.page}` : null, `${h.count} match${h.count === 1 ? "" : "es"}`]
                        : [h.docCategoryName, opsFileType(h.fileName)]).filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-sm mt-1 text-foreground/80 line-clamp-2 break-words">
                      {h.snippet ? <Highlight text={h.snippet} terms={terms} /> : <span className="text-muted-foreground">Title, description or category matches</span>}
                    </div>
                  </button>
                  {h.page && byId.get(h.docId) && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => openDoc(byId.get(h.docId)!, h.page)}>
                      <ExternalLink className="size-4" /> <span className="hidden sm:inline">Page {h.page}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : groups.length === 0 && sectionRows.length === 0 ? (
        <p className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No operations plans in this category yet.</p>
      ) : (
        <div className="space-y-5">
          {sectionRows.length > 0 && (
            <section className="rounded-xl border bg-card" aria-labelledby="cat-sections">
              <h2 id="cat-sections" className="border-b px-4 sm:px-6 py-3 font-display font-semibold">{catName.get(search.category!) ?? "Section"} — in operations plans</h2>
              <ul className="divide-y">
                {sectionRows.map(({ d, s: sec, page }) => (
                  <li key={`${d.id}|${sec.code}`} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <button type="button" onClick={() => openPlan(d.id, sec.code)} className="flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="text-sm font-medium break-words hover:underline underline-offset-4">{sectionLabel(sec)}</div>
                      <div className="text-xs text-muted-foreground">{d.title}{page ? ` · starts on page ${page}` : ""}</div>
                    </button>
                    <Button size="sm" variant="outline" onClick={() => openDoc(d, page)}><ExternalLink className="size-4" /> <span className="hidden sm:inline">{page ? `Page ${page}` : "Open"}</span></Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.id} className="rounded-xl border bg-card" aria-labelledby={g.name ? `cat-${g.id}` : undefined}>
              {g.name && (
                <h2 id={`cat-${g.id}`} className="border-b px-4 sm:px-6 py-3 font-display font-semibold flex items-center justify-between gap-2">
                  {g.name} <span className="text-xs font-normal text-muted-foreground tabular-nums">{g.items.length}</span>
                </h2>
              )}
              <ul className="divide-y">
                {g.items.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <button type="button" onClick={() => navigate({ to: "/operations/$docId", params: { docId: d.id }, search: {} })} className="flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="text-sm font-medium break-words hover:underline underline-offset-4">{d.title}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        <span>{opsFileType(d.file_name)}{d.file_size ? ` · ${fmtSize(d.file_size)}` : ""}</span>
                        <span>Updated {fmtDate(d.updated_at)}</span>
                        {(d.sections?.length ?? 0) > 0 && <span>{d.sections!.length} sections</span>}
                        <StatusText status={d.status} />
                      </div>
                    </button>
                    <Button size="sm" variant="outline" onClick={() => openDoc(d)}><ExternalLink className="size-4" /> <span className="hidden sm:inline">Open</span></Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {canManage && <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} categories={shownCats} defaultCategory={search.category && search.category !== UNCATEGORISED ? search.category : undefined}
        userName={(user?.user_metadata as any)?.display_name ?? user?.email ?? null} />}
    </div>
  );
}

function StatusText({ status }: { status: string }) {
  const info = OPS_STATUS_INFO[status as OpsStatus];
  if (!info || status === "indexed") return null;
  return (
    <span className={cn("inline-flex items-center gap-1", status === "failed" ? "text-destructive" : "")}>
      {status === "pending" && <Loader2 className="size-3 animate-spin" aria-hidden />}{info.label}
    </span>
  );
}

type Pending = { id: string; file: File; title: string; progress: number; state: "ready" | "uploading" | "done" | "error"; error?: string };

function UploadDialog({ open, onOpenChange, categories, defaultCategory, userName }: {
  open: boolean; onOpenChange: (o: boolean) => void; categories: Category[]; defaultCategory?: string; userName: string | null;
}) {
  const qc = useQueryClient();
  const index = useServerFn(indexOpsDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Pending[]>([]);
  const [category, setCategory] = useState(defaultCategory ?? UNCATEGORISED);
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  useEffect(() => { if (open) { setItems([]); setDescription(""); setCategory(defaultCategory ?? UNCATEGORISED); } }, [open]);
  const patch = (id: string, p: Partial<Pending>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    const rejected = files.filter((f) => !opsFileAllowed(f.name) || f.size > OPS_MAX_BYTES);
    if (rejected.length) toast.error(`${rejected.map((f) => f.name).join(", ")} ${rejected.length === 1 ? "isn't" : "aren't"} a PDF or Word file under 50 MB.`);
    setItems((l) => [...l, ...files.filter((f) => !rejected.includes(f)).map((file) => ({ id: crypto.randomUUID(), file, title: titleFromFileName(file.name), progress: 0, state: "ready" as const }))]);
  }

  async function uploadOne(it: Pending) {
    const path = opsStoragePath(it.file.name);
    patch(it.id, { state: "uploading", progress: 0, error: undefined });
    try {
      await uploadWithProgress(path, it.file, (p) => patch(it.id, { progress: p }), OPS_BUCKET);
      const searchable = opsSearchable(it.file.name);
      const { data, error } = await supabase.from("ops_documents").insert({
        title: it.title.trim() || titleFromFileName(it.file.name),
        description: description.trim() || null,
        category_id: category === UNCATEGORISED ? null : category,
        storage_path: path, file_name: it.file.name, file_size: it.file.size,
        status: searchable ? "pending" : "unsupported",
        error: searchable ? null : "The text inside older .doc files can't be searched. Save it as .docx and replace the file.",
        uploaded_by_name: userName,
      }).select("id").single();
      if (error || !data) { await supabase.storage.from(OPS_BUCKET).remove([path]); throw new Error("Couldn't save this plan."); }
      patch(it.id, { state: "done", progress: 100 });
      if (searchable) index({ data: { id: data.id } }).finally(() => { qc.invalidateQueries({ queryKey: ["ops-documents"] }); qc.invalidateQueries({ queryKey: ["ops-search"] }); });
    } catch (e: any) {
      patch(it.id, { state: "error", error: e?.message ?? "Upload failed" });
    }
  }

  async function start() {
    setRunning(true);
    for (const it of items.filter((x) => x.state === "ready" || x.state === "error")) await uploadOne(it);
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["ops-documents"] });
  }

  const allDone = items.length > 0 && items.every((x) => x.state === "done");
  useEffect(() => {
    if (allDone) { toast.success(`${items.length} plan${items.length === 1 ? "" : "s"} uploaded. Text becomes searchable in a moment.`); onOpenChange(false); }
  }, [allDone]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload operations plans</DialogTitle>
          <DialogDescription>PDF or Word files, up to 50 MB each. Everyone on staff can read and search them; only admins and leads can change them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={running}><Plus className="size-4" /> Choose files</Button>
            <input ref={inputRef} type="file" multiple accept={OPS_ACCEPT} className="hidden" onChange={pick} aria-label="Choose operations plan files" />
          </div>
          {items.length > 0 && (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {items.map((it) => (
                <li key={it.id} className="rounded-md border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Input value={it.title} aria-label={`Title for ${it.file.name}`} onChange={(e) => patch(it.id, { title: e.target.value })} disabled={it.state !== "ready" && it.state !== "error"} className="h-8" />
                    {it.state === "ready" && <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}><X className="size-4" /></Button>}
                  </div>
                  <p className="text-xs text-muted-foreground break-all">{it.file.name} · {fmtSize(it.file.size)}{!opsSearchable(it.file.name) ? " · title only (old .doc)" : ""}</p>
                  {it.state === "uploading" && <Progress value={it.progress} className="h-1.5" />}
                  {it.state === "error" && <p className="text-xs text-destructive">{it.error}</p>}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1.5"><Label htmlFor="ops-category">Category</Label><CategorySelect value={category} onChange={setCategory} categories={categories} />
            {categories.length === 0 && <p className="text-xs text-muted-foreground">No categories yet — add them with the Categories button.</p>}
          </div>
          <div className="space-y-1.5"><Label htmlFor="ops-up-desc">Description (optional{items.length > 1 ? ", applies to all" : ""})</Label><Textarea id="ops-up-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
          <Button onClick={start} disabled={running || !items.some((x) => x.state === "ready" || x.state === "error")}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload {items.length > 1 ? `${items.length} plans` : "plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
