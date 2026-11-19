// R8: event names typed in capitals ("SUMMERNATS NEW ZEALAND") are shown in
// title case ("Summernats New Zealand"). Only the display changes; the saved
// name is left as typed. Names already in mixed case are shown as they are.

const KEEP_UPPER = new Set(["NZ", "OTG", "OTPME", "NSW", "QLD", "ACT", "WA", "SA", "NT", "VIC", "TAS", "USA", "UK", "AU", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "NDRC", "AGM", "SOP", "VIP", "4WD", "TV", "FM"]);
const SMALL = new Set(["of", "the", "and", "at", "in", "on", "for", "to", "a", "an", "by", "vs"]);

export function displayEventName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Untitled event";
  const words = n.match(/[A-Za-z][A-Za-z']*/g) ?? [];
  const shouty = (w: string) => w.length >= 3 && w === w.toUpperCase() && !KEEP_UPPER.has(w.toUpperCase());
  const allCaps = words.join("").length >= 4 && words.every((w) => w === w.toUpperCase());
  // Fix the whole name when it's all capitals, or just the capitalised words
  // when two or more were typed in capitals ("NORTHERN NATS 11 Starring …").
  if (!allCaps && words.filter(shouty).length < 2) return n;
  let first = true;
  return n.replace(/[A-Za-z][A-Za-z']*/g, (w) => {
    const upper = w.toUpperCase();
    const lower = w.toLowerCase();
    let out = w;
    if (KEEP_UPPER.has(upper)) out = upper;
    else if (allCaps && !first && SMALL.has(lower)) out = lower;
    else if (allCaps || shouty(w)) out = upper[0] + lower.slice(1);
    first = false;
    return out;
  });
}
