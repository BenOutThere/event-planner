// Date-only helpers. Dates are stored as "YYYY-MM-DD" strings and must never
// shift because of the viewer's timezone.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_ONLY.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** Parse "YYYY-MM-DD" into a local-midnight Date (no UTC shift). */
export function parseDateOnly(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const s = String(v).slice(0, 10);
  if (!isDateOnly(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a local Date as "YYYY-MM-DD" using its local calendar day. */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "2027-02-24" -> "24 Feb 2027" */
export function formatAuDate(v: string | null | undefined, fallback = "Not set"): string {
  const d = parseDateOnly(v);
  if (!d) return fallback;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "24–28 Feb 2027", "30 Jan – 2 Feb 2027", "20 Nov 2026" */
export function formatAuRange(start: string | null | undefined, end: string | null | undefined): string {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (!s && !e) return "Dates not set";
  if (s && !e) return formatAuDate(start);
  if (!s && e) return `Ends ${formatAuDate(end)}`;
  const a = s!, b = e!;
  if (toDateOnly(a) === toDateOnly(b)) return formatAuDate(start);
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${formatAuDate(start)} – ${formatAuDate(end)}`;
}

export type DateSequenceInput = {
  bump_in_start_date?: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  bump_out_end_date?: string | null;
};

/** Returns human-readable warnings when the dates are out of order. Never changes the dates. */
export function checkDateSequence(d: DateSequenceInput): string[] {
  const order: Array<[keyof DateSequenceInput, string]> = [
    ["bump_in_start_date", "Bump-in start"],
    ["event_start_date", "Event start"],
    ["event_end_date", "Event end"],
    ["bump_out_end_date", "Bump-out end"],
  ];
  const warnings: string[] = [];
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = d[order[i][0]], b = d[order[j][0]];
      if (isDateOnly(a) && isDateOnly(b) && a > b) {
        warnings.push(`${order[i][1]} (${formatAuDate(a)}) is after ${order[j][1]} (${formatAuDate(b)}).`);
      }
    }
  }
  return warnings;
}
