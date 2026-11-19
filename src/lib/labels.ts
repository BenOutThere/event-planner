// Field and area names must be real wording, never placeholders such as
// "OTPME", "TBC" or "[name]". The database applies the same rule
// (eventplanner_private.is_placeholder_label), so keep the two in step.

const PLACEHOLDER_WORD = /^(tbc|tba|tbd|todo|xxx+|placeholder|lorem|otpme)\b/i;

export function isPlaceholderLabel(label: string | null | undefined): boolean {
  const s = (label ?? "").trim();
  return PLACEHOLDER_WORD.test(s) || /^[[{<]/.test(s) || /^[A-Z0-9]{4,}$/.test(s);
}

export function placeholderMessage(label: string) {
  return `"${label.trim()}" looks like a placeholder. Use the full wording people will understand, e.g. "Operating entity" rather than "OTPME".`;
}

/** Cleans a list of dropdown choices typed one per line. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const v = line.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.slice(0, 50);
}

/** A readable message from a failed save (validation errors arrive as JSON). */
export function errorText(e: unknown, fallback: string): string {
  const m = (e as any)?.message;
  if (typeof m !== "string" || !m) return fallback;
  if (m.trim().startsWith("[")) {
    try { const first = JSON.parse(m)[0]; if (first?.message) return String(first.message); } catch { /* not JSON */ }
  }
  return m;
}
