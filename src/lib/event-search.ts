import { asTable } from "@/lib/coverage";
import type { StructArea, StructField, StructSection } from "@/lib/event-structure";
import { formatAuDate } from "@/lib/dates";

export type HitType = "contact" | "document" | "info";

export type SearchHit = {
  key: string;
  type: HitType;
  area: StructArea;
  section: StructSection;
  field: StructField;
  snippet: string;
  matchedLabel: boolean;
  /** Table row (0-based) the match is in. */
  row?: number;
  /** Saved file/link the match is in. */
  docId?: string;
};

type Piece = { text: string; row?: number; docId?: string; doc?: boolean };

const CONTACT_COL = /e-?mail|phone|mobile|\bmob\b/i;

export function isContactTable(area: StructArea, field: StructField, columns: string[]) {
  return (
    /people|contact/i.test(area.navGroup ?? "") ||
    /contact|team|supplier|staff|crew|roles/i.test(`${area.title} ${field.label}`) ||
    columns.some((c) => CONTACT_COL.test(c))
  );
}

function pieces(field: StructField, v: any): Piece[] {
  if (!v || v.not_applicable) return [];
  const out: Piece[] = [];
  if (v.value_text && String(v.value_text).trim()) {
    out.push({ text: field.kind === "date" ? `${formatAuDate(v.value_text)} ${v.value_text}` : String(v.value_text) });
  }
  if (Array.isArray(v.value_kv)) for (const r of v.value_kv) if (r?.value || r?.key) out.push({ text: `${r?.key ?? ""}: ${r?.value ?? ""}` });
  if (Array.isArray(v.value_links)) {
    v.value_links.forEach((l: any, i: number) => {
      if (!l || typeof l !== "object") return;
      const file = l.path ? String(l.path).split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") : "";
      const text = [l.label, l.description, l.url, file, l.responsible, l.version].filter(Boolean).join(" · ");
      if (text.trim()) out.push({ text, docId: l.id ?? `${field.refKey}#${i}`, doc: true });
    });
  }
  const t = asTable(v.value_table);
  if (t) t.rows.forEach((row, ri) => {
    const cells = row.map((c, i) => (c?.trim() ? `${t.columns[i] ?? ""}: ${c.trim()}` : "")).filter(Boolean);
    if (cells.length) out.push({ text: cells.join(" · "), row: ri });
  });
  return out;
}

const excerpt = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);

export function searchTerms(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function searchEvent(
  areas: StructArea[],
  getValue: (f: StructField) => any,
  query: string,
): SearchHit[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const area of areas) {
    for (const section of area.sections) {
      for (const field of section.fields) {
        const labelText = `${area.title} ${section.title} ${field.label}`.toLowerCase();
        const v = getValue(field);
        const ps = pieces(field, v);
        const table = asTable(v?.value_table);
        const contactTable = field.kind === "table" && !!table && isContactTable(area, field, table.columns);
        const typeFor = (p?: Piece): HitType =>
          p?.doc || ((field.kind === "files" || field.kind === "links") && !p) ? "document"
            : p?.row !== undefined && contactTable ? "contact" : "info";

        let found = 0;
        for (const p of ps) {
          const lower = p.text.toLowerCase();
          if (!terms.some((t) => lower.includes(t))) continue;
          if (!terms.every((t) => lower.includes(t) || labelText.includes(t))) continue;
          hits.push({
            key: `${field.refKey}|${p.row ?? ""}|${p.docId ?? ""}`,
            type: typeFor(p), area, section, field, snippet: excerpt(p.text), matchedLabel: false, row: p.row, docId: p.docId,
          });
          if (++found >= 8) break;
        }
        if (found) continue;
        // Table rows are matched one at a time, so words from different rows don't combine.
        const all = field.kind === "table" ? labelText : `${labelText} ${ps.map((p) => p.text).join(" ").toLowerCase()}`;
        if (!terms.every((t) => all.includes(t))) continue;
        const piece = ps.find((p) => terms.some((t) => p.text.toLowerCase().includes(t)));
        hits.push({
          key: `${field.refKey}||`,
          type: typeFor(piece), area, section, field,
          snippet: piece ? excerpt(piece.text) : "",
          matchedLabel: !piece, row: piece?.row, docId: piece?.docId,
        });
      }
    }
  }
  // Content matches first, then label-only matches.
  return hits.sort((a, b) => Number(a.matchedLabel) - Number(b.matchedLabel));
}

/** Split text into plain and matching parts for highlighting. */
export function highlightParts(text: string, terms: string[]): Array<{ text: string; match: boolean }> {
  const ts = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ts.length || !text) return [{ text, match: false }];
  const re = new RegExp(`(${ts.join("|")})`, "gi");
  return text.split(re).filter((s) => s !== "").map((s) => ({ text: s, match: ts.some((t) => new RegExp(`^${t}$`, "i").test(s)) }));
}

export type EventFact = { id: string; areaId: string; areaTitle: string; sectionTitle: string; fieldLabel: string; refKey: string; row?: number; text: string };

/** Every piece of saved information in an event, as short labelled facts for answering questions. */
export function eventFacts(areas: StructArea[], getValue: (f: StructField) => any): EventFact[] {
  const out: EventFact[] = [];
  for (const area of areas) for (const section of area.sections) for (const field of section.fields) {
    for (const p of pieces(field, getValue(field))) {
      out.push({ id: `F${out.length + 1}`, areaId: area.id, areaTitle: area.title, sectionTitle: section.title, fieldLabel: field.label, refKey: field.refKey, row: p.row, text: p.text.slice(0, 1500) });
    }
  }
  return out;
}

/** Keeps the facts most related to the question, within a size budget (all of them if they fit). */
export function pickFacts(facts: EventFact[], terms: string[], budget = 60000): EventFact[] {
  const size = (f: EventFact) => f.text.length + f.fieldLabel.length + f.sectionTitle.length + f.areaTitle.length + 20;
  if (facts.reduce((n, f) => n + size(f), 0) <= budget) return facts;
  const score = (f: EventFact) => { const s = `${f.areaTitle} ${f.sectionTitle} ${f.fieldLabel} ${f.text}`.toLowerCase(); return terms.reduce((n, t) => n + (s.includes(t) ? 1 : 0), 0); };
  const ranked = [...facts].sort((a, b) => score(b) - score(a));
  const kept: EventFact[] = []; let used = 0;
  for (const f of ranked) { if (used + size(f) > budget) continue; kept.push(f); used += size(f); }
  return kept;
}
