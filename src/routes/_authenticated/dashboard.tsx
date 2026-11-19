import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, ChevronLeft, ChevronRight, GanttChart, LayoutGrid, MapPin, Plus, Search, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { useMyEventAccess } from "@/hooks/use-event-access";
import { ACCESS_INFO, canEditLevel } from "@/lib/access";
import { formatAuRange } from "@/lib/dates";
import { STAGE_INFO, STAGE_ORDER } from "@/lib/event-status";
import { buildEventStructure, areaFields, type StructArea, type StructField } from "@/lib/event-structure";
import { coverageOf } from "@/lib/coverage";
import { daysToGoLabel, overdueCount, RAG_INFO, readiness, todoItems } from "@/lib/readiness";
import type { AreaMeta } from "@/lib/currency";
import { toDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayEventName } from "@/lib/event-name";
import {
  activeFilterCount, addMonths, barFor, DATE_RANGES, DEFAULT_FILTERS, dayDiff, eventsOn, filterEvents, monthGrid, monthLabel,
  timelineWindow, type DateRange, type Filters,
} from "@/lib/event-list";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Events — OTG Event Planner" },
      { name: "description", content: "All Out There Group events with dates, venues, status and planning coverage." },
      { property: "og:title", content: "Events — OTG Event Planner" },
      { property: "og:description", content: "All Out There Group events with dates, venues, status and planning coverage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Sort = "date" | "updated" | "name";
type View = "cards" | "calendar" | "timeline";

const PREFS_KEY = "ep.dashboard.v1";
type Prefs = { view: View; sort: Sort; filters: Filters };
function loadPrefs(): Prefs {
  const base: Prefs = { view: "cards", sort: "date", filters: DEFAULT_FILTERS };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PREFS_KEY) : null;
    if (!raw) return base;
    const p = JSON.parse(raw);
    return { view: p.view ?? base.view, sort: p.sort ?? base.sort, filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) } };
  } catch { return base; }
}
function savePrefs(p: Prefs) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private window */ }
}

function Dashboard() {
  const { isAdmin, roles, user } = useAuth();
  const canCreate = isAdmin || roles.includes("lead") || roles.includes("member");
  const [q, setQ] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({ view: "cards", sort: "date", filters: DEFAULT_FILTERS });
  // Read saved choices after the first render so server and browser agree.
  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const { view, sort, filters } = prefs;
  const update = (p: Partial<Prefs>) => setPrefs((cur) => { const next = { ...cur, ...p }; savePrefs(next); return next; });
  const setFilter = (f: Partial<Filters>) => update({ filters: { ...filters, ...f } });
  const access = useMyEventAccess();
  const today = toDateOnly(new Date());

  const data = useQuery({
    queryKey: ["events", user?.id],
    queryFn: async () => {
      const [ev, secs, flds, vals, extras, custom, metaQ, mineQ, people] = await Promise.all([
        supabase.from("events").select("*"),
        supabase.from("template_sections").select("*"),
        supabase.from("template_fields").select("*"),
        supabase.from("event_field_values").select("event_id, section_id, extra_section_id, field_key, kind, value_text, value_kv, value_links, value_table, not_applicable, updated_at"),
        supabase.from("event_section_extras").select("*"),
        supabase.from("event_custom_fields").select("*"),
        supabase.from("event_area_meta").select("*"),
        user ? supabase.from("event_members").select("event_id").eq("user_id", user.id) : Promise.resolve({ data: [] as { event_id: string }[] }),
        supabase.from("profiles").select("id, display_name, email"),
      ]);
      const today = toDateOnly(new Date());
      if (ev.error) throw ev.error;
      const events = ev.data ?? [];
      const assigned = new Set((mineQ.data ?? []).map((m) => m.event_id));
      const names = new Map<string, string>(((people.data ?? []) as any[]).map((p) => [p.id, (p.display_name?.trim() || p.email) as string]));
      const rows = events.map((e) => {
        const values = (vals.data ?? []).filter((v) => v.event_id === e.id);
        const areas = buildEventStructure({
          sections: (secs.data ?? []) as any,
          fields: (flds.data ?? []) as any,
          extras: ((extras.data ?? []) as any[]).filter((x) => x.event_id === e.id),
          customFields: ((custom.data ?? []) as any[]).filter((x) => x.event_id === e.id),
          values: values as any,
        });
        const byKey = new Map(values.map((v) => [`${v.section_id ?? `x:${v.extra_section_id}`}::${v.field_key}`, v]));
        const coverage = coverageOf(areas.flatMap((a) => areaFields(a).map((def) => ({ def, value: byKey.get(def.refKey) as any }))));
        const meta = new Map<string, AreaMeta>(((metaQ.data ?? []) as any[]).filter((m) => m.event_id === e.id).map((m) => [m.area_id, m]));
        const input = {
          areas, meta, today,
          getValue: (f: StructField) => (byKey.get(f.refKey) as any) ?? null,
          areaUpdatedAt: (a: StructArea) => areaFields(a).reduce<string | null>((at, f) => { const u = (byKey.get(f.refKey) as any)?.updated_at ?? null; return u && (!at || u > at) ? u : at; }, null),
        };
        const ready = readiness({ ...input, start: e.proposed_date, end: e.end_date, stage: e.stage });
        const items = todoItems(input);
        const responsible = user ? [...meta.values()].some((m) => m.responsible_user_id === user.id) : false;
        const mine = !!user && (e.lead_user_id === user.id || assigned.has(e.id) || responsible);
        return { ...e, name: displayEventName(e.name), coverage, ready, todo: items.length, overdue: overdueCount(items), mine };
      });
      return { rows, names };
    },
  });
  const all = data.data?.rows ?? [];
  const mineIds = useMemo(() => new Set(all.filter((e) => e.mine).map((e) => e.id)), [all]);
  const leads = useMemo(() => {
    const names = data.data?.names ?? new Map<string, string>();
    const ids = [...new Set(all.map((e) => e.lead_user_id).filter((v): v is string => !!v))];
    return ids.map((id) => ({ id, name: names.get(id) ?? "Unknown person" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, data.data?.names]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = filterEvents(all, filters, today, mineIds)
      .filter((e) => !needle || `${e.name} ${e.location ?? ""} ${(e as any).venue ?? ""}`.toLowerCase().includes(needle));
    const byName = (a: any, b: any) => a.name.localeCompare(b.name);
    return rows.slice().sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "updated") return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      // Soonest first; events without dates go last.
      if (!a.proposed_date && !b.proposed_date) return byName(a, b);
      if (!a.proposed_date) return 1;
      if (!b.proposed_date) return -1;
      return a.proposed_date.localeCompare(b.proposed_date);
    });
  }, [all, q, sort, filters, today, mineIds]);
  const archivedCount = all.filter((e) => e.stage === "archived").length;
  const filtered = activeFilterCount(filters) > 0 || !!q.trim();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">Open an event for its key information, contacts and documents. Inside an event, search covers that event or every event you can access.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/events/new"><Plus className="size-4" /> New event</Link>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[14rem] max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or venue…" aria-label="Search events" className="pl-9" />
          </div>
          <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && update({ view: v as View })} aria-label="Show events as">
            <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="size-4" /><span className="hidden sm:inline">Cards</span></ToggleGroupItem>
            <ToggleGroupItem value="calendar" aria-label="Calendar"><CalendarDays className="size-4" /><span className="hidden sm:inline">Calendar</span></ToggleGroupItem>
            <ToggleGroupItem value="timeline" aria-label="Timeline"><GanttChart className="size-4" /><span className="hidden sm:inline">Timeline</span></ToggleGroupItem>
          </ToggleGroup>
          {view === "cards" && (
            <Select value={sort} onValueChange={(v) => update({ sort: v as Sort })}>
              <SelectTrigger className="w-44" aria-label="Sort events"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Soonest first</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={filters.status} onValueChange={(v) => setFilter({ status: v as Filters["status"] })}>
            <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STAGE_ORDER.map((st) => <SelectItem key={st} value={st}>{STAGE_INFO[st].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.lead} onValueChange={(v) => setFilter({ lead: v })}>
            <SelectTrigger className="w-44" aria-label="Filter by event lead"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any event lead</SelectItem>
              {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              <SelectItem value="none">No lead set</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.range} onValueChange={(v) => setFilter({ range: v as DateRange })}>
            <SelectTrigger className="w-48" aria-label="Filter by dates"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="mine" checked={filters.mine} onCheckedChange={(v) => setFilter({ mine: v })} />
            <Label htmlFor="mine" className="text-sm font-normal">My events</Label>
          </div>
          {archivedCount > 0 && filters.status !== "archived" && (
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={filters.showArchived} onCheckedChange={(v) => setFilter({ showArchived: v })} />
              <Label htmlFor="show-archived" className="text-sm font-normal">Show archived ({archivedCount})</Label>
            </div>
          )}
          {activeFilterCount(filters) > 0 && (
            <Button variant="ghost" size="sm" onClick={() => update({ filters: { ...DEFAULT_FILTERS, showArchived: filters.showArchived } })}>
              <X className="size-4" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {data.isLoading ? (
        <div className="text-center py-12 text-muted-foreground" role="status">Loading events…</div>
      ) : data.error ? (
        <div className="text-center py-12 text-muted-foreground">Events couldn't be loaded. Check your connection and refresh.</div>
      ) : view === "calendar" ? (
        <CalendarView events={list} today={today} />
      ) : view === "timeline" ? (
        <TimelineView events={list} today={today} />
      ) : list.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-3">
          <h2 className="font-display font-semibold text-lg">{filtered ? "No events match your search or filters" : "No events yet"}</h2>
          {!filtered && canCreate && <Button asChild><Link to="/events/new"><Plus className="size-4" /> New event</Link></Button>}
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((e) => <li key={e.id}><EventCard event={e} level={access.data?.get(e.id)?.access ?? null} /></li>)}
        </ul>
      )}
    </div>
  );
}

function EventCard({ event, level }: { event: any; level: keyof typeof ACCESS_INFO | null }) {
  const info = STAGE_INFO[event.stage as keyof typeof STAGE_INFO] ?? STAGE_INFO.draft;
  const c = event.coverage;
  const r = event.ready as import("@/lib/readiness").Readiness | undefined;
  const days = daysToGoLabel(r?.daysToGo ?? null);
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className="group block h-full rounded-xl border bg-card p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display font-semibold text-lg leading-snug break-words group-hover:underline underline-offset-4">{event.name}</h2>
        <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium", info.tone)}>{info.label}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden /> {formatAuRange(event.proposed_date, event.end_date)}</div>
        {event.location && <div className="flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden /> <span className="break-words">{event.location}</span></div>}
      </div>
      {level && <p className="mt-3 text-xs text-muted-foreground">Your access: {ACCESS_INFO[level].label}</p>}
      {r && r.label !== "Finished" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {days && <span className="font-medium">{days}</span>}
          {canEditLevel(level) && r.rag !== "none" && <span className={cn("rounded border px-1.5 py-px font-medium", RAG_INFO[r.rag].tone)}>{r.label}</span>}
          {canEditLevel(level) && event.overdue > 0 && <span className="rounded border border-destructive/40 bg-destructive/15 px-1.5 py-px font-medium">{event.overdue} overdue</span>}
          {canEditLevel(level) && event.todo > 0 && <span className="text-muted-foreground">{event.todo} to do</span>}
        </div>
      )}
      {canEditLevel(level) && r?.score != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Readiness</span>
            <span className="tabular-nums font-medium">{r.score}%</span>
          </div>
          <Progress value={r.score} className={cn("h-1.5", RAG_INFO[r.rag].bar)} aria-label={`Readiness ${r.score}%`} />
          {c?.configured && c.pct !== null && <p className="mt-1 text-[11px] text-muted-foreground">Planning coverage {c.pct}% ({c.entered}/{c.total} fields)</p>}
        </div>
      )}
    </Link>
  );
}

type Ev = { id: string; name: string; stage: string; proposed_date: string | null; end_date: string | null; location?: string | null };

function stageTone(stage: string) {
  return (STAGE_INFO[stage as keyof typeof STAGE_INFO] ?? STAGE_INFO.draft).tone;
}

export function CalendarView({ events, today }: { events: Ev[]; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const weeks = monthGrid(ym);
  const inMonth = events.filter((e) => weeks.flat().some((d) => d.startsWith(ym) && eventsOn(d, [e as any]).length));
  const undated = events.filter((e) => !e.proposed_date);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setYm(addMonths(ym, -1))}><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setYm(addMonths(ym, 1))}><ChevronRight className="size-4" /></Button>
        <h2 className="font-display font-semibold text-lg ml-1" aria-live="polite">{monthLabel(ym)}</h2>
        {ym !== today.slice(0, 7) && <Button variant="ghost" size="sm" onClick={() => setYm(today.slice(0, 7))}>This month</Button>}
      </div>

      <div className="hidden sm:block rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="grid grid-cols-7 border-b last:border-b-0">
            {w.map((d) => {
              const on = eventsOn(d, events as any[]) as Ev[];
              const out = !d.startsWith(ym);
              return (
                <div key={d} className={cn("min-h-24 border-r last:border-r-0 p-1.5 space-y-1", out && "bg-muted/40")}>
                  <div className={cn("text-xs tabular-nums", out ? "text-muted-foreground" : "text-foreground", d === today && "inline-grid place-items-center size-5 rounded-full bg-primary text-primary-foreground")}>{Number(d.slice(8))}</div>
                  {on.slice(0, 3).map((e) => (
                    <Link key={e.id} to="/events/$id" params={{ id: e.id }} title={`${e.name} · ${formatAuRange(e.proposed_date, e.end_date)}`}
                      className={cn("block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium hover:underline", stageTone(e.stage))}>
                      {e.name}
                    </Link>
                  ))}
                  {on.length > 3 && <div className="text-[11px] text-muted-foreground">+{on.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="sm:hidden space-y-2">
        {inMonth.length === 0 && <li className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No events in {monthLabel(ym)}.</li>}
        {inMonth.map((e) => (
          <li key={e.id}>
            <Link to="/events/$id" params={{ id: e.id }} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <span className="font-medium break-words">{e.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatAuRange(e.proposed_date, e.end_date)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {undated.length > 0 && <UndatedNote events={undated} />}
    </div>
  );
}

export function TimelineView({ events, today }: { events: Ev[]; today: string }) {
  const [from, setFrom] = useState(addMonths(today.slice(0, 7), -1));
  const w = timelineWindow(from, 12);
  const rows = events
    .map((e) => ({ e, bar: barFor(e as any, w) }))
    .filter((r) => r.bar)
    .sort((a, b) => (a.e.proposed_date ?? "").localeCompare(b.e.proposed_date ?? ""));
  const todayPos = today >= w.start && today <= w.end ? (dayDiff(w.start, today) / w.days) * 100 : null;
  const undated = events.filter((e) => !e.proposed_date);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Earlier" onClick={() => setFrom(addMonths(from, -3))}><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="icon" aria-label="Later" onClick={() => setFrom(addMonths(from, 3))}><ChevronRight className="size-4" /></Button>
        <h2 className="font-display font-semibold text-lg ml-1" aria-live="polite">{monthLabel(from)} – {monthLabel(addMonths(from, 11))}</h2>
        {from !== addMonths(today.slice(0, 7), -1) && <Button variant="ghost" size="sm" onClick={() => setFrom(addMonths(today.slice(0, 7), -1))}>Today</Button>}
      </div>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-[9rem_minmax(0,1fr)] sm:grid-cols-[13rem_minmax(0,1fr)] border-b text-[11px] text-muted-foreground">
            <div className="px-3 py-1.5 font-medium">Event</div>
            <div className="relative h-7">
              {w.months.map((m) => (
                <div key={m.ym} className="absolute top-0 bottom-0 border-l px-1 py-1.5 truncate" style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>
              ))}
            </div>
          </div>
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No events in these months.</p>}
          {rows.map(({ e, bar }) => (
            <div key={e.id} className="grid grid-cols-[9rem_minmax(0,1fr)] sm:grid-cols-[13rem_minmax(0,1fr)] border-b last:border-b-0">
              <Link to="/events/$id" params={{ id: e.id }} className="px-3 py-2 text-sm font-medium truncate hover:underline" title={e.name}>{e.name}</Link>
              <div className="relative">
                {w.months.map((m) => <div key={m.ym} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: `${m.left}%` }} aria-hidden />)}
                {todayPos !== null && <div className="absolute top-0 bottom-0 w-px bg-primary" style={{ left: `${todayPos}%` }} aria-hidden />}
                <Link to="/events/$id" params={{ id: e.id }}
                  title={`${e.name} · ${formatAuRange(e.proposed_date, e.end_date)}`}
                  aria-label={`${e.name}, ${formatAuRange(e.proposed_date, e.end_date)}`}
                  className={cn("absolute top-1.5 bottom-1.5 rounded border-2", stageTone(e.stage), bar!.clippedStart && "rounded-l-none", bar!.clippedEnd && "rounded-r-none")}
                  style={{ left: `${bar!.left}%`, width: `${bar!.width}%`, minWidth: 8 }} />
                <span className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-[11px] text-muted-foreground whitespace-nowrap pointer-events-none"
                  style={bar!.left + bar!.width > 75 ? { right: `${100 - bar!.left}%`, paddingRight: 6 } : { left: `${bar!.left + bar!.width}%` }} aria-hidden>
                  {formatAuRange(e.proposed_date, e.end_date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Bars show each event's dates, coloured by status. The line marks today.</p>
      {undated.length > 0 && <UndatedNote events={undated} />}
    </div>
  );
}

function UndatedNote({ events }: { events: Ev[] }) {
  return (
    <p className="text-sm text-muted-foreground">
      No dates set:{" "}
      {events.map((e, i) => (
        <span key={e.id}>{i > 0 && ", "}<Link to="/events/$id" params={{ id: e.id }} className="underline underline-offset-2">{e.name}</Link></span>
      ))}
    </p>
  );
}
