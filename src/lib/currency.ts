// Information currency for an event area: who is responsible, when it was last
// updated and whether someone has explicitly reviewed it. "Updated" and
// "reviewed" are separate: editing never marks an area as reviewed.

import { formatAuDate } from "@/lib/dates";

export type AreaMeta = {
  area_id: string;
  responsible_name?: string | null;
  review_due?: string | null;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  restricted_to?: string | null;
};

export type ReviewState = {
  needsReview: boolean;
  reason: "overdue" | "changed" | "due" | "reviewed" | "never";
  label: string;
};

/** today: "YYYY-MM-DD" in the viewer's calendar. lastUpdatedAt / reviewedAt: ISO timestamps. */
export function reviewState(meta: AreaMeta | null | undefined, lastUpdatedAt: string | null, today: string): ReviewState {
  const reviewedAt = meta?.reviewed_at ?? null;
  const due = meta?.review_due ?? null;
  const changed = !!(reviewedAt && lastUpdatedAt && new Date(lastUpdatedAt).getTime() > new Date(reviewedAt).getTime() + 1000);
  if (due && due < today) return { needsReview: true, reason: "overdue", label: `Review overdue (due ${formatAuDate(due)})` };
  if (changed) return { needsReview: true, reason: "changed", label: `Changed since review on ${formatAuTimestampDate(reviewedAt)}` };
  if (reviewedAt) {
    const who = meta?.reviewed_by_name ? ` by ${meta.reviewed_by_name}` : "";
    return { needsReview: false, reason: "reviewed", label: `Reviewed ${formatAuTimestampDate(reviewedAt)}${who}` };
  }
  if (due) return { needsReview: false, reason: "due", label: `Review due ${formatAuDate(due)}` };
  return { needsReview: false, reason: "never", label: "Not reviewed yet" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Timestamp -> "12 Oct 2026" in the viewer's local calendar. */
export function formatAuTimestampDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Timestamp -> "12 Oct, 3:04 pm" (adds the year when it isn't this year). */
export function formatAuTimestamp(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${time}`;
}

export function localTimeZoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export const RESTRICTION_INFO: Record<string, { label: string; short: string; description: string }> = {
  everyone: { label: "Everyone who can see the event", short: "", description: "Anyone with access to this event can read this area." },
  staff: { label: "OTG staff only", short: "Staff only", description: "Hidden from external stakeholders. Staff, event managers and admins can read it." },
  managers: { label: "Event managers and admins only", short: "Managers only", description: "Only people who manage this event and admins can read it." },
};
