// The one-off move from the Lovable Event Planner to OTG Shared: what moves,
// in what order, and the reconciliation counts compared before and after.

export const IMPORT_TABLES = [
  "profiles", "user_roles",
  "event_categories", "event_templates", "events", "event_members",
  "template_sections", "template_fields",
  "event_section_overrides", "event_section_extras", "event_custom_fields", "event_field_values",
  "event_area_meta", "event_pins", "event_changes", "document_text",
  "ops_categories", "ops_documents",
  "tasks", "suppliers", "budget_items", "timeline_milestones", "risks", "event_notes", "event_files",
  "event_roles", "event_contacts", "event_schedule_blocks", "event_deliverables", "event_power_pricing",
  "event_tickets", "event_entrant_info", "event_emergency_services", "event_revisions",
] as const;
export type ImportTable = (typeof IMPORT_TABLES)[number];

/** Old bucket -> new bucket. Paths inside stay exactly the same. */
export const BUCKET_MAP: Record<string, string> = {
  "event-files": "eventplanner-files",
  "operations-plans": "eventplanner-ops-plans",
};

/** Columns holding a person's account id, which changes in the move (matched by email). */
export const USER_COLUMNS: Partial<Record<ImportTable, string[]>> = {
  profiles: ["id"],
  user_roles: ["user_id"],
  events: ["created_by", "lead_user_id"],
  event_members: ["user_id"],
  event_area_meta: ["responsible_user_id", "reviewed_by"],
  event_changes: ["changed_by"],
  event_custom_fields: ["created_by"],
  event_field_values: ["updated_by"],
  event_pins: ["created_by"],
  event_section_extras: ["created_by"],
  ops_documents: ["uploaded_by"],
  event_files: ["uploaded_by"],
  risks: ["owner_id"],
  tasks: ["owner_id"],
  event_notes: ["author_id"],
};
/** Rows that make no sense without their person (skipped and reported if the person can't be matched). */
export const REQUIRED_USER_COLUMNS: Partial<Record<ImportTable, string>> = {
  profiles: "id",
  user_roles: "user_id",
  event_members: "user_id",
};

type Row = Record<string, any>;

/** Swaps old account ids for new ones. Returns null when a required person is missing. */
export function remapRow(table: ImportTable, row: Row, userMap: Record<string, string>): Row | null {
  const out = { ...row };
  for (const col of USER_COLUMNS[table] ?? []) {
    const old = out[col];
    if (old == null) continue;
    const mapped = userMap[old];
    if (mapped) out[col] = mapped;
    else if (REQUIRED_USER_COLUMNS[table] === col) return null;
    else out[col] = null;
  }
  return out;
}

/** Parents before sub-sections, so the template's own links are valid while loading. */
export function orderRows(table: ImportTable, rows: Row[]): Row[] {
  if (table !== "template_sections") return rows;
  return [...rows.filter((r) => !r.parent_id), ...rows.filter((r) => r.parent_id)];
}

/** Splits rows into batches small enough to send in one request. */
export function batches(rows: Row[], maxBytes = 2_000_000, maxRows = 500): Row[][] {
  const out: Row[][] = [];
  let cur: Row[] = [];
  let size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length;
    if (cur.length && (size + s > maxBytes || cur.length >= maxRows)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

function hasInfo(v: Row) {
  if (v.not_applicable) return true;
  if (typeof v.value_text === "string" && v.value_text.trim()) return true;
  if (Array.isArray(v.value_kv) && v.value_kv.length) return true;
  if (Array.isArray(v.value_links) && v.value_links.length) return true;
  const rows = v.value_table?.rows;
  return Array.isArray(rows) && rows.length > 0;
}

export type EventCounts = {
  name: string;
  fieldsWithInfo: number;
  tableRows: number;
  files: number;
  fileVersions: number;
  links: number;
  savedVersions: number;
  reviews: number;
  history: number;
  pins: number;
  assignments: number;
  indexedFiles: number;
};

/** Per-event counts used to check nothing was lost in the move. */
export function reconcile(tables: Partial<Record<ImportTable, Row[]>>): Record<string, EventCounts> {
  const out: Record<string, EventCounts> = {};
  for (const e of tables.events ?? []) {
    out[e.id] = { name: e.name, fieldsWithInfo: 0, tableRows: 0, files: 0, fileVersions: 0, links: 0, savedVersions: 0, reviews: 0, history: 0, pins: 0, assignments: 0, indexedFiles: 0 };
  }
  const get = (id: string) => out[id];
  for (const v of tables.event_field_values ?? []) {
    const c = get(v.event_id); if (!c) continue;
    if (hasInfo(v)) c.fieldsWithInfo += 1;
    c.savedVersions += Number(v.version ?? 1);
    if (Array.isArray(v.value_table?.rows)) c.tableRows += v.value_table.rows.length;
    for (const item of Array.isArray(v.value_links) ? v.value_links : []) {
      if (item?.path) { c.files += 1; c.fileVersions += Array.isArray(item.revisions) ? item.revisions.length : 0; }
      else if (item?.url) c.links += 1;
    }
  }
  for (const m of tables.event_area_meta ?? []) { const c = get(m.event_id); if (c && m.reviewed_at) c.reviews += 1; }
  for (const h of tables.event_changes ?? []) { const c = get(h.event_id); if (c) c.history += 1; }
  for (const p of tables.event_pins ?? []) { const c = get(p.event_id); if (c) c.pins += 1; }
  for (const m of tables.event_members ?? []) { const c = get(m.event_id); if (c) c.assignments += 1; }
  for (const d of tables.document_text ?? []) { const c = get(d.event_id); if (c) c.indexedFiles += 1; }
  return out;
}
