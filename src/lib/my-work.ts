// R13: "My work" — the areas a person is responsible for across every event,
// and what's open in them. Built from the same To do items as each event.

import type { StructArea } from "@/lib/event-structure";
import { reviewState, type AreaMeta } from "@/lib/currency";
import type { TodoInput, TodoItem } from "@/lib/readiness";

export type MyArea = {
  area: StructArea;
  review: ReturnType<typeof reviewState>;
  items: TodoItem[];
};

export type MyEventWork = {
  areas: MyArea[];
  /** Areas with nobody responsible, counted only for events the person leads. */
  unowned: number;
};

/** Is this person responsible for the area? A picked user wins; an older typed name matches by name. */
export function isResponsible(meta: AreaMeta | undefined, userId: string, myName: string | null): boolean {
  if (!meta) return false;
  if (meta.responsible_user_id) return meta.responsible_user_id === userId;
  const typed = meta.responsible_name?.trim().toLowerCase();
  return !!typed && !!myName && typed === myName.trim().toLowerCase();
}

export function myWork(input: TodoInput, items: TodoItem[], opts: { userId: string; myName: string | null; isLead: boolean }): MyEventWork {
  const areas: MyArea[] = [];
  let unowned = 0;
  for (const area of input.areas) {
    const meta = input.meta.get(area.id);
    if (isResponsible(meta, opts.userId, opts.myName)) {
      areas.push({
        area,
        review: reviewState(meta, input.areaUpdatedAt(area), input.today),
        items: items.filter((i) => i.area.id === area.id && i.kind !== "unconfigured"),
      });
    } else if (opts.isLead && !meta?.responsible_user_id && !meta?.responsible_name?.trim()) {
      unowned += 1;
    }
  }
  return { areas, unowned };
}

export function openCount(w: MyEventWork): number {
  return w.areas.reduce((n, a) => n + a.items.length, 0);
}
