import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildEventStructure, areaFields, type StructArea, type StructField } from "@/lib/event-structure";
import { coverageOf } from "@/lib/coverage";
import { overdueCount, readiness, todoItems, type TodoInput } from "@/lib/readiness";
import type { AreaMeta } from "@/lib/currency";
import { toDateOnly } from "@/lib/dates";
import { displayEventName } from "@/lib/event-name";

/**
 * Every event the signed-in person can see, with its areas, To do items and
 * readiness, worked out the same way as inside the event. Used by the Events
 * page and My work so both always show the same numbers.
 */
export function useEventsOverview() {
  const { user } = useAuth();
  return useQuery({
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
      const assigned = new Set((mineQ.data ?? []).map((m) => m.event_id));
      const names = new Map<string, string>(((people.data ?? []) as any[]).map((p) => [p.id, (p.display_name?.trim() || p.email) as string]));
      const rows = (ev.data ?? []).map((e) => {
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
        const input: TodoInput = {
          areas, meta, today,
          getValue: (f: StructField) => (byKey.get(f.refKey) as any) ?? null,
          areaUpdatedAt: (a: StructArea) => areaFields(a).reduce<string | null>((at, f) => { const u = (byKey.get(f.refKey) as any)?.updated_at ?? null; return u && (!at || u > at) ? u : at; }, null),
        };
        const ready = readiness({ ...input, start: e.proposed_date, end: e.end_date, stage: e.stage });
        const items = todoItems(input);
        const responsible = user ? [...meta.values()].some((m) => m.responsible_user_id === user.id) : false;
        const mine = !!user && (e.lead_user_id === user.id || assigned.has(e.id) || responsible);
        return {
          ...e, name: displayEventName(e.name), coverage, ready, items, input,
          todo: items.length, overdue: overdueCount(items), mine,
        };
      });
      return { rows, names, today };
    },
  });
}

export type EventOverview = NonNullable<ReturnType<typeof useEventsOverview>["data"]>["rows"][number];
