// R17: shared contacts & suppliers directory. Picking an entry in an event's
// contact table copies its details into that row; the event-specific role
// column is left for the person to fill in.

import { columnKind } from "@/lib/contact-checks";

export type DirectoryContact = {
  id: string;
  kind: "person" | "supplier";
  name: string;
  organisation: string | null;
  role_title: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  archived_at: string | null;
  updated_at?: string;
};

const ORG_COL = /company|organi[sz]ation|business|supplier|vendor|contractor|provider|^org/i;
const WEBSITE_COL = /website|web site|url/i;

export type ColumnRole = "name" | "organisation" | "phone" | "email" | "website" | "other";

export function columnRole(column: string): ColumnRole {
  const k = columnKind(column);
  if (k === "email") return "email";
  if (k === "tel") return "phone";
  if (WEBSITE_COL.test(column)) return "website";
  if (ORG_COL.test(column)) return "organisation";
  if (k === "person") return "name";
  return "other";
}

/** Contact tables need a name or organisation column to be filled from the directory. */
export function canFillFromDirectory(columns: string[]): boolean {
  return columns.some((c) => { const r = columnRole(c); return r === "name" || r === "organisation"; });
}

/** The one directory entry whose name matches exactly: people for name columns, suppliers for company columns. */
export function exactMatch(value: string, role: ColumnRole, contacts: DirectoryContact[]): DirectoryContact | null {
  const v = value.trim().toLowerCase();
  if (!v || (role !== "name" && role !== "organisation")) return null;
  const hits = contacts.filter((c) => !c.archived_at && (role === "name"
    ? c.name.trim().toLowerCase() === v
    : c.kind === "supplier" && c.name.trim().toLowerCase() === v));
  return hits.length === 1 ? hits[0] : null;
}

/** Copy a contact's details into a table row. Only empty cells are filled unless `overwrite`. */
export function fillRow(columns: string[], row: string[], c: DirectoryContact, overwrite = false): string[] {
  const values: Record<ColumnRole, string | null> = {
    name: c.kind === "person" ? c.name : null,
    organisation: c.kind === "supplier" ? c.name : c.organisation,
    phone: c.phone,
    email: c.email,
    website: c.website,
    other: null,
  };
  const used = new Set<ColumnRole>();
  return columns.map((col, i) => {
    const cur = row[i] ?? "";
    const role = columnRole(col);
    const v = values[role];
    if (!v || used.has(role)) return cur;
    used.add(role);
    return overwrite || !cur.trim() ? v : cur;
  });
}

/** A directory entry made from a table row, for "Save to directory". */
export function contactFromRow(columns: string[], row: string[]): Omit<DirectoryContact, "id" | "archived_at"> | null {
  const get = (role: ColumnRole) => {
    const i = columns.findIndex((c) => columnRole(c) === role);
    return i >= 0 ? (row[i] ?? "").trim() || null : null;
  };
  const name = get("name");
  const org = get("organisation");
  if (!name && !org) return null;
  return {
    kind: name ? "person" : "supplier",
    name: (name ?? org)!,
    organisation: name ? org : null,
    role_title: null,
    phone: get("phone"),
    email: get("email"),
    website: get("website"),
    notes: null,
  };
}

/** "Jo Bloggs · Acme Security" */
export function contactLabel(c: Pick<DirectoryContact, "name" | "organisation" | "kind">): string {
  return c.kind === "person" && c.organisation ? `${c.name} · ${c.organisation}` : c.name;
}
