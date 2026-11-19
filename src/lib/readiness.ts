// R3 + R4: one honest picture of where an event's planning is at.
//
// "To do" lists every open item (required information missing, reviews due,
// areas not set up, contact details that don't look right) with a breakdown,
// so its count always agrees with the text next to it.
//
// "Readiness" combines three things, weighted:
//   required fields with information   50%
//   areas set up (with fields)         25%
//   areas with reviews up to date      25%
// A part with nothing to count is left out and the others share its weight.
// It's shown against days to go with a red / amber / green state. Like
// coverage, it never changes the event status.

import { areaFields, type StructArea, type StructField } from "@/lib/event-structure";
import { asTable, fieldState } from "@/lib/coverage";
import { reviewState, type AreaMeta } from "@/lib/currency";
import { cellProblem, emailProblem, phoneProblem } from "@/lib/contact-checks";
import type { EventStage } from "@/lib/event-status";

export type TodoItem =
  | { kind: "required"; area: StructArea; field: StructField; detail?: string }
  | { kind: "review"; area: StructArea; detail: string }
  | { kind: "unconfigured"; area: StructArea }
  | { kind: "contact"; area: StructArea; field: StructField; detail: string; row?: number };

export type TodoInput = {
  areas: StructArea[];
  getValue: (f: StructField) => any;
  meta: Map<string, AreaMeta>;
  today: string;
  areaUpdatedAt: (area: StructArea) => string | null;
};

export function todoItems(w: TodoInput): TodoItem[] {
  const out: TodoItem[] = [];
  for (const area of w.areas) {
    const fields = areaFields(area);
    if (!fields.length) { out.push({ kind: "unconfigured", area }); continue; }
    for (const f of fields) {
      const v = w.getValue(f);
      const s = fieldState(f, v);
      if (s.required && !s.requirementMet) out.push({ kind: "required", area, field: f, detail: s.detail });
      if (s.na) continue;
      const text = v?.value_text ?? "";
      if (f.kind === "email" && emailProblem(text)) out.push({ kind: "contact", area, field: f, detail: `“${text.trim()}” isn't an email address` });
      if (f.kind === "phone" && phoneProblem(text)) out.push({ kind: "contact", area, field: f, detail: `“${text.trim()}”: ${phoneProblem(text)}` });
      if (f.kind === "table") {
        const t = asTable(v?.value_table);
        t?.rows.forEach((row, ri) => t.columns.forEach((c, ci) => {
          const p = cellProblem(c, row[ci]);
          if (p) out.push({ kind: "contact", area, field: f, row: ri, detail: `${c}, row ${ri + 1}: “${String(row[ci]).trim()}”` });
        }));
      }
    }
    const r = reviewState(w.meta.get(area.id), w.areaUpdatedAt(area), w.today);
    if (r.needsReview) out.push({ kind: "review", area, detail: r.label });
  }
  return out;
}

export type TodoCounts = { required: number; review: number; unconfigured: number; contact: number; total: number };

export function todoCounts(items: TodoItem[]): TodoCounts {
  const c = { required: 0, review: 0, unconfigured: 0, contact: 0, total: items.length };
  for (const i of items) c[i.kind] += 1;
  return c;
}

/** "3 to do: 1 required field, 2 areas not set up" — the same numbers everywhere. */
export function todoBreakdown(c: TodoCounts): string[] {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts: string[] = [];
  if (c.required) parts.push(n(c.required, "required field missing", "required fields missing"));
  if (c.unconfigured) parts.push(n(c.unconfigured, "area not set up", "areas not set up"));
  if (c.review) parts.push(n(c.review, "review due", "reviews due"));
  if (c.contact) parts.push(n(c.contact, "contact detail to check", "contact details to check"));
  return parts;
}

export type Rag = "red" | "amber" | "green" | "none";

export type Readiness = {
  /** 0–100, or null when there's nothing to measure. */
  score: number | null;
  parts: {
    required: { met: number; total: number };
    setUp: { done: number; total: number };
    reviews: { current: number; total: number };
  };
  daysToGo: number | null;
  rag: Rag;
  /** Short state, e.g. "On track", "Behind", "At risk", "On now", "Finished". */
  label: string;
};

const WEIGHTS = { required: 0.5, setUp: 0.25, reviews: 0.25 };

export function readiness(w: TodoInput & { start?: string | null; end?: string | null; stage?: EventStage }): Readiness {
  let reqMet = 0, reqTotal = 0, setUp = 0, current = 0;
  for (const area of w.areas) {
    const fields = areaFields(area);
    if (fields.length) {
      setUp += 1;
      if (!reviewState(w.meta.get(area.id), w.areaUpdatedAt(area), w.today).needsReview) current += 1;
    }
    for (const f of fields) {
      const s = fieldState(f, w.getValue(f));
      if (s.required) { reqTotal += 1; if (s.requirementMet) reqMet += 1; }
    }
  }
  const areasTotal = w.areas.length;
  const parts = {
    required: { met: reqMet, total: reqTotal },
    setUp: { done: setUp, total: areasTotal },
    reviews: { current, total: setUp },
  };
  let weight = 0, sum = 0;
  if (reqTotal) { weight += WEIGHTS.required; sum += WEIGHTS.required * (reqMet / reqTotal); }
  if (areasTotal) { weight += WEIGHTS.setUp; sum += WEIGHTS.setUp * (setUp / areasTotal); }
  if (setUp) { weight += WEIGHTS.reviews; sum += WEIGHTS.reviews * (current / setUp); }
  const score = weight ? Math.round((sum / weight) * 100) : null;

  const start = w.start?.slice(0, 10) || null;
  const end = w.end?.slice(0, 10) || start;
  const daysToGo = start ? daysBetween(w.today, start) : null;
  const finished = w.stage === "completed" || w.stage === "archived" || (end ? w.today > end : false);
  if (finished) return { score, parts, daysToGo, rag: "none", label: "Finished" };
  if (start && w.today >= start) return { score, parts, daysToGo, rag: "none", label: "On now" };
  if (score === null) return { score, parts, daysToGo, rag: "none", label: "Nothing to measure yet" };
  const [green, amber] = thresholds(daysToGo);
  const rag: Rag = score >= green ? "green" : score >= amber ? "amber" : "red";
  return { score, parts, daysToGo, rag, label: rag === "green" ? "On track" : rag === "amber" ? "Behind" : "At risk" };
}

/** How ready an event should be by now: the closer it is, the higher the bar. */
export function thresholds(daysToGo: number | null): [green: number, amber: number] {
  if (daysToGo === null) return [50, 25];
  if (daysToGo <= 14) return [90, 70];
  if (daysToGo <= 60) return [75, 50];
  if (daysToGo <= 180) return [50, 30];
  return [25, 10];
}

export function daysToGoLabel(d: number | null): string | null {
  if (d === null) return null;
  if (d > 1) return `${d} days to go`;
  if (d === 1) return "Tomorrow";
  if (d === 0) return "Today";
  return null;
}

export const RAG_INFO: Record<Rag, { tone: string; bar: string }> = {
  green: { tone: "bg-success/15 text-foreground border-success/40", bar: "[&>div]:bg-success" },
  amber: { tone: "bg-warning/25 text-foreground border-warning/50", bar: "[&>div]:bg-warning" },
  red: { tone: "bg-destructive/15 text-foreground border-destructive/40", bar: "[&>div]:bg-destructive" },
  none: { tone: "bg-muted text-foreground border-border", bar: "" },
};

function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
