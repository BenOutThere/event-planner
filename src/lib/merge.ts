// Automatic merging of simultaneous edits.
//
// When two people save the same event field at once, the saver compares
// three versions: the one both started from (base), mine and theirs.
// Changes that don't overlap are combined. Edits that touch the same table
// cell, the same link/file, or a table whose columns were changed are left
// for the person to resolve — nothing is ever overwritten silently.

import { asTable, type TableValue } from "@/lib/coverage";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function mergeTables(base: unknown, mine: unknown, theirs: unknown): TableValue | null {
  const m = asTable(mine), t = asTable(theirs);
  if (!m || !t) return same(mine, theirs) ? (m ?? t) : null;
  const b = asTable(base);
  if (!b) return same(m, t) ? m : null;
  if (!same(b.columns, m.columns) || !same(b.columns, t.columns)) return same(m, t) ? m : null;
  if (m.rows.length < b.rows.length || t.rows.length < b.rows.length) return null; // rows deleted — ask
  const width = b.columns.length;
  const rows: string[][] = [];
  for (let i = 0; i < b.rows.length; i++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) {
      const bv = b.rows[i][c] ?? "", mv = m.rows[i][c] ?? "", tv = t.rows[i][c] ?? "";
      if (mv === tv) row.push(mv);
      else if (mv === bv) row.push(tv);
      else if (tv === bv) row.push(mv);
      else return null; // same cell changed differently
    }
    rows.push(row);
  }
  const extraM = m.rows.slice(b.rows.length), extraT = t.rows.slice(b.rows.length);
  if (same(extraM, extraT)) rows.push(...extraM);
  else rows.push(...extraT, ...extraM);
  return { columns: b.columns, rows };
}

type Item = Record<string, unknown> & { id?: string };

/** Merge lists of links/files by item id. Returns null when the same item changed differently. */
export function mergeItems(base: unknown, mine: unknown, theirs: unknown): Item[] | null {
  const arr = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);
  const b = arr(base), m = arr(mine), t = arr(theirs);
  if ([...b, ...m, ...t].some((x) => !x || typeof x !== "object" || !x.id)) return same(m, t) ? m : null;
  const byId = (l: Item[]) => new Map(l.map((x) => [x.id as string, x]));
  const B = byId(b), M = byId(m), T = byId(t);
  const out: Item[] = [];
  const decide = (id: string): Item | undefined | null => {
    const bi = B.get(id), mi = M.get(id), ti = T.get(id);
    if (same(mi, ti)) return mi;
    if (same(mi, bi)) return ti;
    if (same(ti, bi)) return mi;
    return null;
  };
  const order = [...t.map((x) => x.id as string), ...m.map((x) => x.id as string).filter((id) => !T.has(id))];
  for (const id of b.map((x) => x.id as string)) if (!order.includes(id)) order.push(id);
  for (const id of order) {
    const r = decide(id);
    if (r === null) return null;
    if (r) out.push(r);
  }
  return out;
}

export type Patch = Record<string, unknown>;

/**
 * Combine my unsaved changes with someone else's newer save.
 * Returns the patch to save on top of `theirs`, or null when the person must choose.
 */
export function autoMerge(base: Patch | null, mine: Patch, theirs: Patch): Patch | null {
  const out: Patch = {};
  for (const [k, mv] of Object.entries(mine)) {
    const bv = base?.[k] ?? null, tv = theirs[k] ?? null;
    if (same(tv, bv)) { out[k] = mv; continue; }      // they didn't touch this part
    if (same(mv, tv)) continue;                       // we made the same change
    if (k === "value_table") {
      const merged = mergeTables(bv, mv, tv);
      if (!merged) return null;
      out[k] = merged;
    } else if (k === "value_links") {
      const merged = mergeItems(bv, mv, tv);
      if (!merged) return null;
      out[k] = merged;
    } else {
      return null;
    }
  }
  return out;
}
