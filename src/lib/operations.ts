// Company-wide operations plans / SOPs (generic, not tied to one event).
// Who can do what is enforced in the database (row-level security and storage
// rules); these helpers only decide what the screens offer.

export const OPS_BUCKET = "eventplanner-ops-plans";

/** Uploading and maintaining operations plans: admins and leads (event managers). */
export function canManageOps(roles: readonly string[]) {
  return roles.includes("admin") || roles.includes("lead");
}

/** Reading and searching operations plans: staff only, never external stakeholders. */
export function canReadOps(roles: readonly string[]) {
  return roles.some((r) => r === "admin" || r === "lead" || r === "member" || r === "viewer");
}

export const OPS_ACCEPT = ".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";
export const OPS_MAX_BYTES = 50 * 1024 * 1024;

function ext(name: string) {
  return (/\.([a-z0-9]{1,6})$/i.exec(name)?.[1] ?? "").toLowerCase();
}

/** Operations plans are PDF and Word files. */
export function opsFileAllowed(name: string) {
  return ["pdf", "docx", "doc"].includes(ext(name));
}

/** Whether the text inside the file can be searched (old .doc files can't). */
export function opsSearchable(name: string) {
  return ["pdf", "docx"].includes(ext(name));
}

export function opsFileType(name: string) {
  const e = ext(name);
  return e === "pdf" ? "PDF" : e === "docx" || e === "doc" ? "Word" : e.toUpperCase() || "File";
}

export function titleFromFileName(name: string) {
  return name.replace(/\.[a-z0-9]{1,6}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || name;
}

export function opsStoragePath(fileName: string) {
  const safe = fileName.replace(/[^\w.\- ]+/g, "_");
  return `${crypto.randomUUID()}-${safe}`;
}

export type OpsStatus = "pending" | "indexed" | "empty" | "failed" | "unsupported";

export const OPS_STATUS_INFO: Record<OpsStatus, { label: string; searchable: boolean }> = {
  pending: { label: "Reading text…", searchable: false },
  indexed: { label: "Text searchable", searchable: true },
  empty: { label: "No readable text (scanned?)", searchable: false },
  failed: { label: "Text couldn't be read", searchable: false },
  unsupported: { label: "Title only (save as .docx to search text)", searchable: false },
};

export type Passage = { text: string; start: number; matches: number };

/**
 * Passages of `content` around the search terms, best first (most distinct terms,
 * then earliest). Each passage is about `radius` characters either side of a match.
 */
export function findPassages(content: string, terms: string[], max = 8, radius = 140): Passage[] {
  const lower = content.toLowerCase();
  const ts = terms.map((t) => t.toLowerCase()).filter(Boolean);
  if (!ts.length || !content) return [];
  const hits: Array<{ at: number; term: string }> = [];
  for (const t of ts) {
    let i = lower.indexOf(t);
    while (i >= 0 && hits.length < 2000) { hits.push({ at: i, term: t }); i = lower.indexOf(t, i + t.length); }
  }
  hits.sort((a, b) => a.at - b.at);
  const windows: Array<{ s: number; e: number; terms: Set<string> }> = [];
  for (const h of hits) {
    const s = Math.max(0, h.at - radius);
    const e = Math.min(content.length, h.at + h.term.length + radius);
    const last = windows[windows.length - 1];
    if (last && s <= last.e) { last.e = Math.max(last.e, e); last.terms.add(h.term); }
    else windows.push({ s, e, terms: new Set([h.term]) });
  }
  return windows
    .map((w) => {
      let s = w.s, e = w.e;
      if (s > 0) { const sp = content.indexOf(" ", s); if (sp > 0 && sp < s + 30) s = sp + 1; }
      if (e < content.length) { const sp = content.lastIndexOf(" ", e); if (sp > e - 30 && sp > s) e = sp; }
      const text = `${s > 0 ? "…" : ""}${content.slice(s, e).replace(/\s+/g, " ").trim()}${e < content.length ? "…" : ""}`;
      return { text, start: s, matches: w.terms.size };
    })
    .sort((a, b) => b.matches - a.matches || a.start - b.start)
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Sections inside one large Operations Plan
// ---------------------------------------------------------------------------

export type OpsSection = { category_id: string | null; code: string; title: string; start: number };

/** "17 Medical operations" → { code: "17", title: "Medical operations" }. */
export function parseSectionName(name: string): { code: string; title: string } | null {
  const m = /^(\d{1,2}[A-Z]?(?:\s*[–-]\s*[A-Z])?)\s+(.+)$/.exec(name.trim());
  return m ? { code: m[1].replace(/\s+/g, ""), title: m[2].trim() } : null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Letters of a word, also matching letter-spaced headings ("B U R N O U T"). */
function spaced(word: string) {
  return [...word].map(esc).join("\\s?");
}

/**
 * Heading words, tolerant of punctuation, "&" for "and", line breaks between words
 * and letter-spaced display headings ("1 1 B U R N O U T O P E R A T I O N S").
 */
function titlePattern(title: string) {
  const SEP = "[\\s,;:/&–—-]*";
  const words = title.split(/\s+/).filter(Boolean);
  let out = "";
  words.forEach((w, i) => {
    if (w.toLowerCase() === "and" && i > 0) out += `(?:${SEP}(?:a\\s?n\\s?d))?`;
    else out += (i > 0 ? SEP : "") + spaced(w);
  });
  return out;
}

type Wanted = { id: string | null; code: string; title: string; page?: number | null };

/**
 * Finds where each section starts, in contents order. Contents-page entries are
 * skipped: they end in a page number, or the next entry follows at once.
 * Prefers headings that carry the section number ("17 Medical operations"); then
 * the printed page the contents gives; then a heading with the topic alone.
 */
function locateSections(content: string, list: Wanted[], pageStart: ((page: number, after: number) => number | null) | null, contentsGap = 40): OpsSection[] {
  const out: OpsSection[] = [];
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const pat = titlePattern(w.title);
    const nextPat = list[i + 1] ? new RegExp(titlePattern(list[i + 1].title), "i") : null;
    const codePat = [...w.code].map((ch) => (/[–-]/.test(ch) ? "[–-]" : esc(ch))).join("\\s?");
    const find = (re: RegExp) => {
      re.lastIndex = from;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const pos = m.index + m[0].indexOf(m[1]);
        const after = content.slice(pos + m[1].length, pos + m[1].length + contentsGap);
        // Contents entries end with a page number ("… 25", "… 39–47") or run straight into the next entry.
        const pageNo = /^[\s.·…]*\d{1,3}(?:\s*[–-]\s*\d{1,3})?[ \t]*(?:\n|$)/.test(after);
        if (!pageNo && (!nextPat || !nextPat.test(after))) return pos;
        re.lastIndex = m.index + 1;
      }
      return -1;
    };
    let found = find(new RegExp(`(?:^|[^\\w])(${codePat}\\.?\\s*[–—:.-]?\\s*${pat})(?![\\w])`, "gi"));
    if (found < 0 && w.page && pageStart) found = pageStart(w.page, from) ?? -1;
    if (found < 0) found = find(new RegExp(`(?:^|[^\\w])(${pat})(?![\\w])`, "gi"));
    if (found >= 0) {
      out.push({ category_id: w.id, code: w.code, title: w.title, start: found });
      from = found + 1;
    }
  }
  return out;
}

/** Section starts for the given categories ("17 Medical operations"), in category order. */
export function detectSections(content: string, categories: Array<{ id: string; name: string }>, contentsGap = 40): OpsSection[] {
  const list = categories
    .map((c) => ({ id: c.id, parsed: parseSectionName(c.name) }))
    .filter((c): c is { id: string; parsed: { code: string; title: string } } => !!c.parsed)
    .map((c) => ({ id: c.id, code: c.parsed.code, title: c.parsed.title }));
  return locateSections(content, list, null, contentsGap);
}

export type ContentsEntry = { code: string; title: string; page: number | null };

/**
 * The plan's own contents page: lines like "11 Burnout operations 18" near the
 * start of the document, in order. Needs at least three entries.
 */
export function parseContents(content: string, scan = 30000): ContentsEntry[] {
  const head = content.slice(0, scan);
  const re = /^[ \t]*(\d{1,2}[A-Z]?(?:\s*[–-]\s*[A-Z])?)[ \t]+([A-Za-z][^\n]{2,100}?)[ \t.·…]+(\d{1,3})(?:\s*[–-]\s*\d{1,3})?[ \t]*$/gm;
  const out: ContentsEntry[] = [];
  const seen = new Set<string>();
  let lastPage = 0;
  for (const m of head.matchAll(re)) {
    const code = m[1].replace(/\s+/g, "");
    const page = Number(m[3]);
    if (seen.has(code) || page < lastPage) continue;
    seen.add(code);
    lastPage = page;
    out.push({ code, title: m[2].trim(), page });
  }
  return out.length >= 3 ? out : [];
}

/**
 * Printed page number of each PDF page, read from the footer/header line that
 * repeats on most pages ("… Operations Plan 18"). Null where none is found.
 */
export function printedPages(content: string, pages: number[] | null | undefined): Array<number | null> {
  if (!pages?.length) return [];
  const lines = pages.map((p, i) => {
    const text = content.slice(p, pages[i + 1] ?? content.length).trim();
    const ls = text.split("\n");
    return [ls[0] ?? "", ls[ls.length - 1] ?? ""];
  });
  const parse = (l: string) => {
    const m = /^(.{3,120}?\D)(\d{1,3})\s*$/.exec(l.trim());
    return m && /[a-z]{3}/i.test(m[1]) ? { prefix: m[1].trim().toLowerCase(), n: Number(m[2]) } : null;
  };
  const freq = new Map<string, number>();
  for (const pair of lines) for (const l of pair) { const p = parse(l); if (p) freq.set(p.prefix, (freq.get(p.prefix) ?? 0) + 1); }
  const [footer, count] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (count < 3) return pages.map(() => null);
  return lines.map((pair) => {
    for (const l of pair) { const p = parse(l); if (p && p.prefix === footer) return p.n; }
    return null;
  });
}

/**
 * Sections of one plan. Uses the plan's own contents page when it has one (so each
 * event's plan can have its own sections), otherwise the shared categories.
 */
export function detectPlanSections(content: string, pages: number[] | null | undefined, categories: Array<{ id: string; name: string }>): OpsSection[] {
  const entries = parseContents(content);
  if (!entries.length) return detectSections(content, categories);
  const byCode = new Map(categories.map((c) => [parseSectionName(c.name)?.code ?? "", c.id]));
  const printed = printedPages(content, pages);
  const pageStart = (page: number, after: number) => {
    for (let i = 0; i < printed.length; i++) if (printed[i] === page && pages![i] >= after) return pages![i];
    return null;
  };
  return locateSections(content, entries.map((e) => ({ id: byCode.get(e.code) ?? null, code: e.code, title: e.title, page: e.page })), pages?.length ? pageStart : null);
}

/** The section a character position falls in (null before the first section, e.g. cover and contents). */
export function sectionAt(sections: OpsSection[] | null | undefined, pos: number): OpsSection | null {
  let hit: OpsSection | null = null;
  for (const s of sections ?? []) { if (s.start <= pos) hit = s; else break; }
  return hit;
}

/** 1-based PDF page for a character position, from page start offsets. */
export function pageAt(pages: number[] | null | undefined, pos: number): number | null {
  if (!pages?.length) return null;
  let n = 0;
  for (const p of pages) { if (p <= pos) n++; else break; }
  return Math.max(1, n);
}

export type SectionHit = { section: OpsSection | null; start: number; snippet: string; count: number; page: number | null };

/**
 * Search matches grouped by section. Keeps sections containing every search word;
 * if none do, the sections containing the most of them.
 */
export function sectionHits(content: string, sections: OpsSection[], pages: number[] | null | undefined, terms: string[]): SectionHit[] {
  const ts = terms.map((t) => t.toLowerCase()).filter(Boolean);
  if (!ts.length || !content) return [];
  const lower = content.toLowerCase();
  const bounds: Array<{ section: OpsSection | null; start: number; end: number }> = [];
  if (!sections.length || sections[0].start > 0) bounds.push({ section: null, start: 0, end: sections[0]?.start ?? content.length });
  sections.forEach((s, i) => bounds.push({ section: s, start: s.start, end: sections[i + 1]?.start ?? content.length }));
  const scored = bounds.map((b) => {
    const slice = lower.slice(b.start, b.end);
    return { ...b, present: ts.filter((t) => slice.includes(t)).length };
  });
  const best = Math.max(0, ...scored.map((b) => b.present));
  if (!best) return [];
  const want = scored.some((b) => b.present === ts.length) ? ts.length : best;
  return scored
    .filter((b) => b.present === want)
    .map((b) => {
      const ps = findPassages(content.slice(b.start, b.end), ts, 50);
      const first = ps[0];
      const at = b.start + (first?.start ?? 0);
      return { section: b.section, start: at, snippet: first?.text ?? "", count: ps.length, page: pageAt(pages, at) };
    })
    .filter((h) => h.count > 0);
}

export function sectionLabel(s: Pick<OpsSection, "code" | "title"> | null) {
  return s ? `${s.code} ${s.title}` : "Front pages";
}
