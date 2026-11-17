// Planning coverage rules.
//
// "Planning coverage" measures how much event information has been entered.
// It does NOT measure readiness, approval or safety compliance.
//
// Rules:
// - A field counts as "entered" only when it holds real event information:
//   whitespace, blank links, empty table rows, column headings and prefilled
//   template labels do not count.
// - Fields marked "Not applicable" are excluded from the denominator.
// - An area or section with no fields is "Not configured" (no percentage).
// - Required fields are tracked separately. A table field can carry rules
//   (required columns + minimum rows); without rules a table is only ever
//   described as "has information entered".

import { validateUrl } from "@/lib/links";

export type FieldKind = "text" | "kv" | "links" | "files" | "table" | "phone" | "email" | "date";
export type TableValue = { columns: string[]; rows: string[][] };
export type TableRules = { required_columns?: string[]; min_rows?: number | null };

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  is_required?: boolean | null;
  allow_na?: boolean | null;
  default_table?: TableValue | null;
  table_rules?: TableRules | null;
};

export type FieldValue = {
  value_text?: string | null;
  value_kv?: unknown;
  value_links?: unknown;
  value_table?: unknown;
  not_applicable?: boolean | null;
} | null | undefined;

export type FieldState = {
  /** Field holds real event information. */
  entered: boolean;
  /** Field marked as not applicable for this event. */
  na: boolean;
  /** Field is required (and not N/A). */
  required: boolean;
  /** For required fields: whether the requirement is met. Always true for optional fields. */
  requirementMet: boolean;
  /** Short explanation, e.g. "3 of 8 rows have Name". */
  detail?: string;
};

const blank = (v: unknown) => v == null || String(v).trim() === "";
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function asTable(v: unknown): TableValue | null {
  if (!v || typeof v !== "object") return null;
  const t = v as any;
  if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;
  return {
    columns: t.columns.map((c: unknown) => String(c ?? "")),
    rows: t.rows.map((r: unknown) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])),
  };
}

/** Values prefilled by the template for each column (by column name). */
function scaffoldByColumn(defaults: TableValue | null | undefined): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const d = asTable(defaults);
  if (!d) return map;
  d.columns.forEach((col, ci) => {
    const set = new Set<string>();
    for (const row of d.rows) {
      const cell = row[ci];
      if (!blank(cell)) set.add(norm(cell));
    }
    map.set(norm(col), set);
  });
  return map;
}

/** True when a cell holds information beyond the template's prefilled label. */
export function isEventCell(value: unknown, column: string, scaffold: Map<string, Set<string>>): boolean {
  if (blank(value)) return false;
  const set = scaffold.get(norm(column));
  return !(set && set.has(norm(value)));
}

export function tableStats(value: unknown, defaults?: TableValue | null, rules?: TableRules | null) {
  const t = asTable(value);
  const scaffold = scaffoldByColumn(defaults);
  if (!t) return { hasInfo: false, rowsInUse: 0, rowsComplete: 0, requiredColumns: [] as string[] };
  let hasInfo = false;
  const requiredColumns = (rules?.required_columns ?? [])
    .map((c) => c.trim())
    .filter((c) => t.columns.some((col) => norm(col) === norm(c)));
  const reqIdx = requiredColumns.map((c) => t.columns.findIndex((col) => norm(col) === norm(c)));
  let rowsInUse = 0;
  let rowsComplete = 0;
  for (const row of t.rows) {
    const anyCell = row.some((c) => !blank(c));
    if (!anyCell) continue; // completely empty rows are ignored
    rowsInUse++;
    if (row.some((c, ci) => isEventCell(c, t.columns[ci] ?? "", scaffold))) hasInfo = true;
    if (reqIdx.length > 0 && reqIdx.every((ci) => isEventCell(row[ci], t.columns[ci] ?? "", scaffold))) rowsComplete++;
  }
  return { hasInfo, rowsInUse, rowsComplete, requiredColumns };
}

export function hasInformation(def: Pick<FieldDef, "kind" | "default_table">, v: FieldValue): boolean {
  if (!v) return false;
  switch (def.kind) {
    case "text":
    case "phone":
    case "email":
    case "date":
      return !blank(v.value_text);
    case "kv":
      return Array.isArray(v.value_kv) && v.value_kv.some((r: any) => !blank(r?.value));
    case "links":
      return Array.isArray(v.value_links) && v.value_links.some((l: any) => !blank(l?.url) && validateUrl(l.url) === null);
    case "files":
      return Array.isArray(v.value_links) && v.value_links.some((f: any) => !blank(f?.path) || !blank(f?.url));
    case "table":
      return tableStats(v.value_table, def.default_table).hasInfo;
    default:
      return false;
  }
}

export function fieldState(def: FieldDef, v: FieldValue): FieldState {
  const na = !!(def.allow_na && v?.not_applicable);
  const entered = !na && hasInformation(def, v);
  const required = !!def.is_required && !na;
  if (!required) return { entered, na, required: false, requirementMet: true };

  if (def.kind === "table") {
    const rules = def.table_rules ?? null;
    const s = tableStats(v?.value_table, def.default_table, rules);
    if (s.requiredColumns.length > 0) {
      const min = Math.max(1, rules?.min_rows ?? 1);
      const met = s.rowsInUse > 0 && s.rowsComplete === s.rowsInUse && s.rowsComplete >= min;
      const cols = s.requiredColumns.join(", ");
      const detail = s.rowsInUse === 0
        ? `Needs at least ${min} row${min === 1 ? "" : "s"} with ${cols}`
        : `${s.rowsComplete} of ${s.rowsInUse} rows have ${cols}`;
      return { entered, na, required: true, requirementMet: met, detail };
    }
  }
  return { entered, na, required: true, requirementMet: entered };
}

export type Coverage = {
  configured: boolean;
  total: number;        // fields counted (excludes N/A)
  entered: number;
  na: number;
  pct: number | null;   // null when not configured or nothing to count
  requiredTotal: number;
  requiredMet: number;
};

export function coverageOf(items: Array<{ def: FieldDef; value: FieldValue }>): Coverage {
  if (items.length === 0) {
    return { configured: false, total: 0, entered: 0, na: 0, pct: null, requiredTotal: 0, requiredMet: 0 };
  }
  let total = 0, entered = 0, na = 0, requiredTotal = 0, requiredMet = 0;
  for (const { def, value } of items) {
    const s = fieldState(def, value);
    if (s.na) { na++; continue; }
    total++;
    if (s.entered) entered++;
    if (s.required) {
      requiredTotal++;
      if (s.requirementMet) requiredMet++;
    }
  }
  return {
    configured: true,
    total,
    entered,
    na,
    pct: total === 0 ? null : Math.round((entered / total) * 100),
    requiredTotal,
    requiredMet,
  };
}

export function coverageLabel(c: Coverage): string {
  if (!c.configured) return "Not configured";
  if (c.total === 0) return "All not applicable";
  return `${c.entered} of ${c.total} fields have information`;
}
