// Helpers for asking questions of an operations plan: spotting questions, turning
// them into search words, and choosing the passages the answer is based on.
import { pageAt, sectionAt, type OpsSection } from "@/lib/operations";

const QUESTION_START = /^(what|whats|what's|how|when|where|who|whom|whose|why|which|can|could|is|are|was|were|does|do|did|should|will|would|may|must|tell|explain|list|describe|give|show)\b/i;

/** Whether the search text reads like a question ("what are the rules for the burnout competition?"). */
export function isQuestion(q: string) {
  const t = q.trim();
  if (t.split(/\s+/).length < 3) return false;
  return /\?\s*$/.test(t) || QUESTION_START.test(t);
}

const STOP = new Set(
  ("a an the and or but if of to in on at by for from with without about into onto over under is are was were be been being am do does did done " +
    "what whats what's how when where who whom whose why which can could should would will shall may might must need needs " +
    "i me my we our us you your they them their it its this that these those there here any some all each every " +
    "tell explain list describe give show please know find get got have has had also just than then so such as not no yes " +
    "rules rule information info details detail say says said happen happens").split(/\s+/),
);

/**
 * Search words. Keyword searches are split as typed; questions lose punctuation and
 * question/filler words (keeping the original words if nothing is left).
 */
export function keywordTerms(q: string): string[] {
  if (!isQuestion(q)) return q.toLowerCase().split(/\s+/).filter(Boolean);
  const words = q.toLowerCase().replace(/[“”"'’?!.,;:()[\]{}]/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w) && w.length > 1);
  return kept.length ? [...new Set(kept)] : words;
}

/** Rough word stem so "competitions"/"competition", "burnouts"/"burnout" match. */
export function stem(w: string) {
  return w.length > 4 ? w.replace(/(?:ies|es|s|ing|ed)$/, "") : w;
}

export type Excerpt = { id: string; section: OpsSection | null; page: number | null; start: number; text: string };

/** Splits a plan into passages of about `size` characters that never cross a section boundary. */
export function chunkPlan(content: string, sections: OpsSection[], pages: number[] | null | undefined, size = 1600): Excerpt[] {
  const bounds = [0, ...sections.map((s) => s.start).filter((s) => s > 0), content.length];
  const out: Excerpt[] = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    let s = bounds[b];
    const end = bounds[b + 1];
    while (s < end) {
      let e = Math.min(end, s + size);
      if (e < end) {
        const nl = content.lastIndexOf("\n", e);
        if (nl > s + size * 0.5) e = nl;
      }
      const text = content.slice(s, e).trim();
      if (text) out.push({ id: `E${out.length + 1}`, section: sectionAt(sections, s), page: pageAt(pages, s), start: s, text });
      s = e;
    }
  }
  return out;
}

/**
 * The passages most likely to answer the question, in document order, within a
 * character budget. Scores by distinct search words present (rarer words count
 * more), with a bonus when the section title itself matches.
 */
export function pickExcerpts(chunks: Excerpt[], question: string, budget = 60000): Excerpt[] {
  const terms = [...new Set(keywordTerms(question).map(stem))].filter((t) => t.length > 1);
  if (!terms.length) return [];
  const lower = chunks.map((c) => c.text.toLowerCase());
  const df = new Map(terms.map((t) => [t, lower.filter((l) => l.includes(t)).length]));
  const scored = chunks.map((c, i) => {
    const title = c.section ? c.section.title.toLowerCase() : "";
    let score = 0;
    for (const t of terms) {
      const n = df.get(t) ?? 0;
      if (!n) continue;
      const w = Math.log(1 + chunks.length / n);
      if (lower[i].includes(t)) score += w * (1 + Math.min(3, lower[i].split(t).length - 2) * 0.15);
      if (title.includes(t)) score += w * 1.5;
    }
    // Cover and contents pages repeat section titles; only use them when nothing else matches.
    return { c, score: !c.section && chunks.some((x) => x.section) ? score * 0.3 : score };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const picked: Excerpt[] = [];
  let used = 0;
  for (const { c } of ranked) {
    if (used + c.text.length > budget) continue;
    picked.push(c);
    used += c.text.length;
  }
  return picked.sort((a, b) => a.start - b.start);
}
