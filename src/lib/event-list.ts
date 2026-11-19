// R12: Events dashboard filters and the calendar / timeline layouts.
// Pure helpers so the rules are easy to test. Dates are "YYYY-MM-DD" strings
// compared as text (no timezone shifts).

import type { EventStage } from "@/lib/event-status";

export type DateRange = "any" | "upcoming" | "next30" | "next90" | "next12m" | "past" | "nodate";

export const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "any", label: "Any dates" },
  { value: "upcoming", label: "Upcoming and on now" },
  { value: "next30", label: "Next 30 days" },
  { value: "next90", label: "Next 90 days" },
  { value: "next12m", label: "Next 12 months" },
  { value: "past", label: "Finished" },
  { value: "nodate", label: "No dates set" },
];

export type ListEvent = {
  id: string;
  name: string;
  stage: EventStage;
  proposed_date: string | null;
  end_date: string | null;
  lead_user_id?: string | null;
};

export type Filters = {
  status: EventStage | "all";
  lead: string | "all";
  range: DateRange;
  mine: boolean;
  showArchived: boolean;
};

export const DEFAULT_FILTERS: Filters = { status: "all", lead: "all", range: "any", mine: false, showArchived: false };

export function span(e: Pick<ListEvent, "proposed_date" | "end_date">): [string, string] | null {
  const s = e.proposed_date?.slice(0, 10) || null;
  const end = e.end_date?.slice(0, 10) || s;
  if (!s || !end) return null;
  return [s, end < s ? s : end];
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function inRange(e: ListEvent, range: DateRange, today: string): boolean {
  const sp = span(e);
  if (range === "any") return true;
  if (range === "nodate") return !sp;
  if (!sp) return false;
  const [s, end] = sp;
  if (range === "past") return end < today;
  if (end < today) return false;
  if (range === "upcoming") return true;
  const horizon = range === "next30" ? addDays(today, 30) : range === "next90" ? addDays(today, 90) : addDays(today, 365);
  return s <= horizon;
}

/** `mine`: ids of events the viewer leads, is assigned to, or is responsible for an area in. */
export function filterEvents<T extends ListEvent>(rows: T[], f: Filters, today: string, mine: Set<string>): T[] {
  return rows.filter((e) =>
    (f.showArchived || f.status === "archived" || e.stage !== "archived")
    && (f.status === "all" || e.stage === f.status)
    && (f.lead === "all" || (f.lead === "none" ? !e.lead_user_id : e.lead_user_id === f.lead))
    && (!f.mine || mine.has(e.id))
    && inRange(e, f.range, today));
}

export function activeFilterCount(f: Filters): number {
  return (f.status !== "all" ? 1 : 0) + (f.lead !== "all" ? 1 : 0) + (f.range !== "any" ? 1 : 0) + (f.mine ? 1 : 0);
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "2027-02" + n months -> "YYYY-MM". */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Weeks (Monday first) covering the month, as "YYYY-MM-DD" days, including the days either side. */
export function monthGrid(ym: string): string[][] {
  const first = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = Monday
  const last = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  const weeks: string[][] = [];
  let day = addDays(first, -dow);
  while (day <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
    weeks.push(week);
  }
  return weeks;
}

/** Events whose dates include this day. */
export function eventsOn<T extends ListEvent>(day: string, rows: T[]): T[] {
  return rows.filter((e) => { const sp = span(e); return !!sp && sp[0] <= day && day <= sp[1]; });
}

export type TimelineWindow = { start: string; end: string; days: number; months: Array<{ ym: string; label: string; left: number; width: number }> };

/** A window of whole months starting at `fromYm`. Positions are percentages. */
export function timelineWindow(fromYm: string, count: number): TimelineWindow {
  const start = `${fromYm}-01`;
  const endYm = addMonths(fromYm, count);
  const endExclusive = `${endYm}-01`;
  const days = dayDiff(start, endExclusive);
  const months = Array.from({ length: count }, (_, i) => {
    const ym = addMonths(fromYm, i);
    const offset = dayDiff(start, `${ym}-01`);
    const [y, m] = ym.split("-").map(Number);
    return { ym, label: m === 1 || i === 0 ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1], left: (offset / days) * 100, width: (daysInMonth(ym) / days) * 100 };
  });
  return { start, end: addDays(endExclusive, -1), days, months };
}

/** Where an event's bar sits in the window, or null when it's outside it. */
export function barFor(e: ListEvent, w: TimelineWindow): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const sp = span(e);
  if (!sp || sp[1] < w.start || sp[0] > w.end) return null;
  const s = sp[0] < w.start ? w.start : sp[0];
  const end = sp[1] > w.end ? w.end : sp[1];
  const left = (dayDiff(w.start, s) / w.days) * 100;
  const width = Math.max(((dayDiff(s, end) + 1) / w.days) * 100, 0.6);
  return { left, width, clippedStart: sp[0] < w.start, clippedEnd: sp[1] > w.end };
}

export function dayDiff(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
