// R18: suggested name and dates for the next edition of an event.

function addYear(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  // 29 Feb moves to 28 Feb.
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** "Summernats 2027" -> "Summernats 2028"; "Summernats 39" -> "Summernats 40"; otherwise adds the year. */
export function nextEdition(name: string, start: string | null, end: string | null) {
  const nextStart = addYear(start);
  const nextEnd = addYear(end);
  const year = start ? Number(start.slice(0, 4)) : null;
  let next = name.trim();
  const m = /^(.*?)(\d+)\s*$/.exec(next);
  if (m && year && Number(m[2]) === year) next = `${m[1]}${year + 1}`;
  else if (m && Number(m[2]) < 1000) next = `${m[1]}${Number(m[2]) + 1}`;
  else if (nextStart) next = `${next} ${nextStart.slice(0, 4)}`;
  return { name: next, start: nextStart, end: nextEnd };
}
