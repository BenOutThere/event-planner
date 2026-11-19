// R6: spot dates written in free text (e.g. a marketing description saying
// "February 26–28") and check them against the event's public or event dates.
// It only warns; it never changes anything.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const SEP = "\\s*(?:-|–|—|to|until|and|&)\\s*";
const YEAR = "(?:,?\\s+(\\d{4}))?";

export type DateMention = { text: string; month: number; from: number; to: number; year: number | null };

/** Finds "26–28 February", "February 26–28", "26 Feb", "Feb 26" (with an optional year). */
export function findDateMentions(text: string | null | undefined): DateMention[] {
  const s = text ?? "";
  const out: DateMention[] = [];
  const taken: Array<[number, number]> = [];
  const add = (m: RegExpExecArray, month: string, from: string, to: string | undefined, year: string | undefined) => {
    const start = m.index, end = m.index + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) return;
    const mi = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
    const f = Number(from), t = Number(to ?? from);
    if (mi < 0 || f < 1 || f > 31 || t < 1 || t > 31 || t < f) return;
    taken.push([start, end]);
    out.push({ text: m[0].trim(), month: mi + 1, from: f, to: t, year: year ? Number(year) : null });
  };
  const patterns: Array<[RegExp, (m: RegExpExecArray) => void]> = [
    [new RegExp(`\\b${DAY}${SEP}${DAY}\\s+${MONTH}\\b${YEAR}`, "gi"), (m) => add(m, m[3], m[1], m[2], m[4])],
    [new RegExp(`\\b${MONTH}\\s+${DAY}${SEP}${DAY}\\b${YEAR}`, "gi"), (m) => add(m, m[1], m[2], m[3], m[4])],
    [new RegExp(`\\b${DAY}\\s+${MONTH}\\b${YEAR}`, "gi"), (m) => add(m, m[2], m[1], undefined, m[3])],
    [new RegExp(`\\b${MONTH}\\s+${DAY}\\b${YEAR}`, "gi"), (m) => add(m, m[1], m[2], undefined, m[3])],
  ];
  for (const [re, fn] of patterns) { let m: RegExpExecArray | null; while ((m = re.exec(s))) fn(m); }
  return out.sort((a, b) => s.indexOf(a.text) - s.indexOf(b.text));
}

/**
 * Mentions that disagree with the reference dates ("YYYY-MM-DD"). A range must
 * match the start and end exactly; a single day must fall inside the dates.
 * Mentions in other months than the reference dates are ignored (they're
 * usually about something else, like an on-sale date).
 */
export function conflictingMentions(text: string | null | undefined, start: string | null, end: string | null): DateMention[] {
  if (!start) return [];
  const s = start.slice(0, 10), e = (end ?? start).slice(0, 10);
  const [sy, sm, sd] = s.split("-").map(Number);
  const [ey, em, ed] = e.split("-").map(Number);
  return findDateMentions(text).filter((m) => {
    if (m.month !== sm && m.month !== em) return false;
    if (m.year && m.year !== sy && m.year !== ey) return false;
    const key = (mo: number, d: number) => mo * 100 + d;
    const from = key(m.month, m.from), to = key(m.month, m.to);
    const rs = key(sm, sd), re = key(em, ed);
    if (m.from !== m.to) return from !== rs || to !== re;
    return from < rs || from > re;
  });
}
