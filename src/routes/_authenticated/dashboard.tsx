import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, MapPin, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMyEventAccess } from "@/hooks/use-event-access";
import { ACCESS_INFO, canEditLevel } from "@/lib/access";
import { formatAuRange } from "@/lib/dates";
import { STAGE_INFO } from "@/lib/event-status";
import { buildEventStructure, areaFields } from "@/lib/event-structure";
import { coverageOf } from "@/lib/coverage";
import { cn } from "@/lib/utils";

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

function Dashboard() {
  const { isAdmin, roles } = useAuth();
  const canCreate = isAdmin || roles.includes("lead") || roles.includes("member");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const access = useMyEventAccess();

  const data = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const [ev, secs, flds, vals, extras, custom] = await Promise.all([
        supabase.from("events").select("*"),
        supabase.from("template_sections").select("*"),
        supabase.from("template_fields").select("*"),
        supabase.from("event_field_values").select("event_id, section_id, extra_section_id, field_key, value_text, value_kv, value_links, value_table, not_applicable"),
        supabase.from("event_section_extras").select("*"),
        supabase.from("event_custom_fields").select("*"),
      ]);
      if (ev.error) throw ev.error;
      const events = ev.data ?? [];
      return events.map((e) => {
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
        return { ...e, coverage };
      });
    },
  });

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (data.data ?? []).filter((e) => !needle || `${e.name} ${e.location ?? ""} ${e.venue ?? ""}`.toLowerCase().includes(needle));
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
  }, [data.data, q, sort]);

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

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or venue…" aria-label="Search events" className="pl-9" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-48" aria-label="Sort events"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Soonest first</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.isLoading ? (
        <div className="text-center py-12 text-muted-foreground" role="status">Loading events…</div>
      ) : data.error ? (
        <div className="text-center py-12 text-muted-foreground">Events couldn't be loaded. Check your connection and refresh.</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-3">
          <h2 className="font-display font-semibold text-lg">{q ? "No events match your search" : "No events yet"}</h2>
          {!q && canCreate && <Button asChild><Link to="/events/new"><Plus className="size-4" /> New event</Link></Button>}
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
      {canEditLevel(level) && c?.configured && c.pct !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Planning coverage</span>
            <span className="tabular-nums font-medium">{c.pct}% <span className="text-muted-foreground font-normal">({c.entered}/{c.total})</span></span>
          </div>
          <Progress value={c.pct} className="h-1.5" aria-label={`Planning coverage ${c.pct}%`} />
        </div>
      )}
    </Link>
  );
}
