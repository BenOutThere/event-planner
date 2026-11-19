import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ClipboardList, FileSearch, FileText, Info, Loader2, Search, User, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canReadOps, opsFileType, sectionLabel } from "@/lib/operations";
import { useOpsHits } from "@/hooks/use-ops-search";
import { isQuestion, keywordTerms } from "@/lib/ops-ask";
import { EventAskAnswer } from "./event-ask-answer";
import { Sparkles } from "lucide-react";
import { buildEventStructure, refKey } from "@/lib/event-structure";
import { highlightParts, searchEvent, searchTerms, type HitType, type SearchHit } from "@/lib/event-search";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./context";
import { displayEventName } from "@/lib/event-name";

type Result = { key: string; eventId: string; eventName: string; hit?: SearchHit; content?: { path: string; file_name: string | null; snippet: string; areaTitle: string | null }; ops?: { id: string; title: string; file_name: string; category: string | null; snippet: string | null; section?: string; sectionCode?: string; page: number | null; count: number; eventId: string | null; eventName: string | null } };
type Filter = "all" | HitType | "content" | "ops";

const TYPE_INFO: Record<Filter, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  all: { label: "All results", icon: Search },
  contact: { label: "Contacts", icon: User },
  document: { label: "Documents & links", icon: FileText },
  info: { label: "Event information", icon: Info },
  content: { label: "Inside uploaded documents", icon: FileSearch },
  ops: { label: "Operations plans", icon: ClipboardList },
};

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlightParts(text, terms).map((p, i) => p.match ? <mark key={i} className="bg-accent/25 text-foreground rounded-sm px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>;
}

const POS_KEY = "otg:search-last";

export function SearchView() {
  const w = useWorkspace();
  const navigate = useNavigate();
  const q = w.search.q ?? "";
  const scope = w.search.scope === "all" ? "all" : "event";
  const filter = ((w.search.type as Filter) in TYPE_INFO ? w.search.type : "all") as Filter;
  // Questions ("what are the rules for…?") are searched by their key words.
  const question = isQuestion(q);
  const kq = question ? keywordTerms(q).join(" ") : q;
  const terms = searchTerms(kq);
  const dq = useDebounced(kq.trim(), 250);
  const ready = dq.length >= 2 && !w.preview;
  const { roles } = useAuth();
  const opsAllowed = canReadOps(roles);

  const localHits = useMemo(() => (scope === "event" ? searchEvent(w.areas, w.getValue, kq) : []), [scope, w.areas, w.getValue, kq]);

  const tpl = useQuery({
    queryKey: ["tpl-sections-min"],
    enabled: ready,
    queryFn: async () => new Map(((await supabase.from("template_sections").select("id, title")).data ?? []).map((s) => [s.id, s.title])),
  });

  const contentQ = useQuery({
    queryKey: ["doc-search", scope === "all" ? null : w.eventId, dq],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_document_text", { _q: dq, _event_id: scope === "all" ? undefined : w.eventId });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Company-wide operations plans apply to every event, so they're included whichever scope is chosen,
  // with this event's own plan (or every event plan you can see, for "All events").
  const opsQ = useOpsHits(dq, ready, { eventId: w.eventId, allEvents: scope === "all" });

  // Questions are answered from this event's own information (what you can see).
  const full = q.trim();
  const settled = useDebounced(full, 900);
  const [askedQ, setAskedQ] = useState<string | null>(null);
  const showAnswer = question && scope === "event" && (askedQ === full || (settled === full && /\?$/.test(full)));

  const allQ = useQuery({
    queryKey: ["all-event-search", dq],
    enabled: ready && scope === "all",
    queryFn: async () => {
      const [vals, events, secs, flds, extras, custom, perms] = await Promise.all([
        supabase.rpc("search_event_values", { _q: dq }),
        supabase.from("events").select("id, name, template_variant").neq("stage", "archived"),
        supabase.from("template_sections").select("*"),
        supabase.from("template_fields").select("*"),
        supabase.from("event_section_extras").select("*"),
        supabase.from("event_custom_fields").select("*"),
        supabase.rpc("my_area_permissions"),
      ]);
      if (vals.error) throw vals.error;
      const canRead = new Map((perms.data ?? []).map((p: any) => [`${p.event_id}:${p.area_id}`, !!p.can_read]));
      const out: Array<{ eventId: string; eventName: string; hits: SearchHit[] }> = [];
      for (const e of events.data ?? []) {
        const rows = (vals.data ?? []).filter((v: any) => v.event_id === e.id);
        const areas = buildEventStructure({
          sections: (secs.data ?? []).filter((s: any) => s.is_active) as any,
          fields: (flds.data ?? []).filter((f: any) => !f.archived_at) as any,
          extras: (extras.data ?? []).filter((x: any) => x.event_id === e.id) as any,
          customFields: (custom.data ?? []).filter((x: any) => x.event_id === e.id) as any,
          values: rows as any,
          variant: (e as any).template_variant ?? null,
        }).filter((a) => canRead.get(`${e.id}:${a.id}`) !== false);
        const byKey = new Map(rows.map((r: any) => [refKey(r), r]));
        const hits = searchEvent(areas, (f) => byKey.get(f.refKey) ?? null, dq);
        if (hits.length) out.push({ eventId: e.id, eventName: displayEventName(e.name), hits });
      }
      return out;
    },
  });

  const results: Result[] = useMemo(() => {
    const list: Result[] = [];
    if (scope === "event") for (const h of localHits) list.push({ key: `${w.eventId}|${h.key}`, eventId: w.eventId, eventName: w.event.name, hit: h });
    else for (const g of allQ.data ?? []) for (const h of g.hits) list.push({ key: `${g.eventId}|${h.key}`, eventId: g.eventId, eventName: g.eventName, hit: h });
    const names = new Map<string, string>([[w.eventId, w.event.name], ...((allQ.data ?? []).map((g) => [g.eventId, g.eventName] as [string, string]))]);
    for (const c of contentQ.data ?? []) {
      list.push({ key: `${c.event_id}|content|${c.path}`, eventId: c.event_id, eventName: names.get(c.event_id) ?? "Another event", content: { path: c.path, file_name: c.file_name, snippet: c.snippet ?? "", areaTitle: c.area_id ? tpl.data?.get(c.area_id) ?? null : null } });
    }
    // This event's own plan first, then other events' plans, then company-wide plans.
    const rank = (id: string | null) => (id === w.eventId ? 0 : id ? 1 : 2);
    for (const o of [...opsQ.hits].sort((a, b) => rank(a.eventId) - rank(b.eventId))) {
      list.push({ key: `ops|${o.key}`, eventId: "", eventName: "", ops: {
        id: o.docId, title: o.title, file_name: o.fileName, category: o.docCategoryName, snippet: o.snippet, page: o.page, count: o.count,
        section: o.section !== undefined ? sectionLabel(o.section) : undefined, sectionCode: o.section !== undefined ? o.section?.code ?? "front" : undefined,
        eventId: o.eventId, eventName: o.eventName,
      } });
    }
    return list;
  }, [scope, localHits, allQ.data, contentQ.data, opsQ.hits, tpl.data, w.eventId, w.event.name]);

  const typeOf = (r: Result): Filter => (r.ops ? "ops" : r.content ? "content" : r.hit!.type);
  const counts = results.reduce<Record<string, number>>((m, r) => { m[typeOf(r)] = (m[typeOf(r)] ?? 0) + 1; return m; }, {});
  const shown = filter === "all" ? results : results.filter((r) => typeOf(r) === filter);
  const groups: Filter[] = filter === "all" ? ["contact", "document", "info", "content", "ops"] : [filter];
  const loading = (scope === "all" && allQ.isFetching) || contentQ.isFetching || opsQ.isFetching || kq.trim() !== dq;

  // Return to the result that was opened last.
  useEffect(() => {
    try {
      const last = sessionStorage.getItem(POS_KEY);
      if (!last) return;
      const [lq, key] = last.split("\u0001");
      if (lq !== q) return;
      const el = document.querySelector<HTMLElement>(`[data-search-key="${CSS.escape(key)}"]`);
      if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); }
    } catch { /* ignore */ }
  }, [results.length]);

  function open(r: Result) {
    try { sessionStorage.setItem(POS_KEY, `${q}\u0001${r.key}`); } catch { /* ignore */ }
    if (r.ops) {
      navigate({ to: "/operations/$docId", params: { docId: r.ops.id }, search: { ask: kq.trim() || undefined, sec: r.ops.sectionCode && r.ops.sectionCode !== "front" ? r.ops.sectionCode : undefined } });
      return;
    }
    const sameEvent = r.eventId === w.eventId;
    if (r.content) {
      if (sameEvent) w.go({ view: "documents", doc: undefined, area: undefined });
      else navigate({ to: "/events/$id", params: { id: r.eventId }, search: { view: "documents" } as any });
      return;
    }
    const h = r.hit!;
    if (sameEvent) w.openArea(h.area.id, { field: h.field.refKey, row: h.row, keepQuery: true });
    else navigate({ to: "/events/$id", params: { id: r.eventId }, search: { area: h.area.id, field: h.field.refKey, row: h.row, q, scope: "all" } as any });
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-search-result]"));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) { document.getElementById("event-search-input")?.focus(); return; }
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }

  const reset = () => w.go({ type: undefined, scope: undefined }, { replace: true });

  return (
    <section aria-labelledby="search-title" className="rounded-xl border bg-card">
      <div className="border-b px-4 sm:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="search-title" className="text-xl font-display font-semibold">Search</h2>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {!q.trim() ? "Type in the search box above." : loading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"} for “${q.trim()}”`}
          </p>
        </div>
        {!w.preview && (
          <div role="radiogroup" aria-label="Where to search" className="inline-flex rounded-lg border p-0.5 bg-muted/40">
            {(["event", "all"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s}
                onClick={() => w.go({ scope: s === "all" ? "all" : undefined }, { replace: true })}
                className={cn("px-3 py-1.5 text-sm rounded-md min-h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", scope === s ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}>
                {s === "event" ? "This event" : "All events I can access"}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Result type">
          {(Object.keys(TYPE_INFO) as Filter[]).filter((t) => t !== "ops" || opsAllowed || (counts.ops ?? 0) > 0).map((t) => {
            const n = t === "all" ? results.length : counts[t] ?? 0;
            const Icon = TYPE_INFO[t].icon;
            return (
              <button key={t} type="button" aria-pressed={filter === t} onClick={() => w.go({ type: t === "all" ? undefined : t }, { replace: true })}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                <Icon className="size-3.5" aria-hidden /> {TYPE_INFO[t].label} <span className="tabular-nums opacity-80">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!w.preview && (
        <div className="px-4 sm:px-6 pt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            <span>Ask a question about this event (end it with “?”), e.g. “Who is the site manager?”</span>
          </div>
          {question && (showAnswer ? (
            <EventAskAnswer question={full} />
          ) : (
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3">
              <Sparkles className="size-4 text-accent shrink-0" aria-hidden />
              <p className="flex-1 min-w-[12rem] text-sm">Ask this event: <span className="font-medium">“{full}”</span></p>
              <Button size="sm" onClick={() => setAskedQ(full)}><Sparkles className="size-3.5" /> Ask</Button>
            </div>
          ))}
        </div>
      )}

      {q.trim() && !loading && shown.length === 0 ? (
        <div className="px-4 sm:px-6 py-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No {filter === "all" ? "" : `${TYPE_INFO[filter].label.toLowerCase()} `}results for “{q.trim()}”{scope === "event" ? " in this event" : " in the events you can access"}.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {filter !== "all" && <Button size="sm" variant="outline" onClick={reset}>Show all result types</Button>}
            {scope === "event" && !w.preview && <Button size="sm" variant="outline" onClick={() => w.go({ scope: "all" }, { replace: true })}>Search all events</Button>}
            <Button size="sm" variant="ghost" onClick={() => w.go({ q: undefined, view: undefined, type: undefined, scope: undefined })}><X className="size-3.5" /> Clear search</Button>
          </div>
        </div>
      ) : (
        <div onKeyDown={onListKey}>
          {groups.map((g) => {
            const items = shown.filter((r) => typeOf(r) === g);
            if (!items.length) return null;
            const Icon = TYPE_INFO[g].icon;
            return (
              <div key={g}>
                {filter === "all" && <h3 className="px-4 sm:px-6 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Icon className="size-3.5" aria-hidden /> {TYPE_INFO[g].label}</h3>}
                <ul className="divide-y">
                  {items.map((r) => <ResultRow key={r.key} r={r} terms={terms} showEvent={scope === "all"} onOpen={() => open(r)} />)}
                </ul>
              </div>
            );
          })}
          {loading && <p className="px-4 sm:px-6 py-3 text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…</p>}
        </div>
      )}

      <p className="border-t px-4 sm:px-6 py-3 text-[11px] text-muted-foreground">
        Searches section names, field labels, saved text, table cells, contacts and document titles, descriptions and file names. “Inside uploaded documents” searches the text of uploaded PDF, Word, Excel, PowerPoint and text files once they've been indexed. Linked documents (OneDrive, Smartsheet, websites) are matched by title and address only — their contents aren't searched. “Operations plans” searches this event's own operations plan (or every event's plan, with All events) and the company-wide OTG plans. Type a question — for example “Who is the site manager?” — to get an answer written from this event’s own information, with links to the fields it comes from. Results only include information you're allowed to see.
      </p>
    </section>
  );
}

function ResultRow({ r, terms, showEvent, onOpen }: { r: Result; terms: string[]; showEvent: boolean; onOpen: () => void }) {
  let title: string, crumb: string, snippet = "";
  if (r.ops) {
    const where = r.ops.eventId ? [r.ops.eventName ?? "Event", "Operations plan"].join(" › ") : "Company operations plan";
    if (r.ops.section) {
      title = r.ops.section;
      crumb = [where, r.ops.eventId ? null : r.ops.title].filter(Boolean).join(" › ") + [r.ops.page ? ` · page ${r.ops.page}` : "", ` · ${r.ops.count} match${r.ops.count === 1 ? "" : "es"}`].join("");
    } else {
      title = r.ops.title;
      crumb = [where, r.ops.eventId ? null : r.ops.category, opsFileType(r.ops.file_name)].filter(Boolean).join(" › ");
    }
    snippet = r.ops.snippet ?? "Title, description or category matches";
  } else if (r.content) {
    title = r.content.file_name ?? "Document";
    crumb = [showEvent ? r.eventName : null, r.content.areaTitle, "Text inside the file"].filter(Boolean).join(" › ");
    snippet = r.content.snippet.replace(/\s+/g, " ").trim();
  } else {
    const h = r.hit!;
    const where = [showEvent ? r.eventName : null, h.area.title, h.area.hasSubsections ? h.section.title : null, h.field.label].filter(Boolean).join(" › ");
    if (h.type === "contact") { title = h.snippet; crumb = `${where}${h.row !== undefined ? ` · row ${h.row + 1}` : ""}`; }
    else if (h.type === "document" && h.snippet) { const [first, ...rest] = h.snippet.split(" · "); title = first; snippet = rest.join(" · "); crumb = where; }
    else { title = h.field.label; snippet = h.snippet; crumb = [showEvent ? r.eventName : null, h.area.title, h.area.hasSubsections ? h.section.title : null].filter(Boolean).join(" › ") || h.area.title; }
    if (h.matchedLabel) snippet = "Section or field name matches — no saved information matches";
  }
  return (
    <li>
      <button type="button" data-search-result data-search-key={r.key} onClick={onOpen}
        className="w-full text-left px-4 sm:px-6 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <div className="text-sm font-medium break-words"><Highlight text={title} terms={terms} /></div>
        <div className="text-xs text-muted-foreground">{crumb}</div>
        {snippet && <div className="text-sm mt-1 text-foreground/80 line-clamp-2 break-words"><Highlight text={snippet} terms={terms} /></div>}
      </button>
    </li>
  );
}
