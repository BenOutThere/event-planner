import { conflictingMentions } from "@/lib/date-mentions";
// Event Home summary. Built entirely from the event's saved fields — there is
// no second copy of event details to maintain.

import { asTable, hasInformation } from "@/lib/coverage";
import type { StructArea, StructField, StructSection } from "@/lib/event-structure";
import { collectDocuments, type DocItem } from "@/lib/documents";
import { isContactTable } from "@/lib/event-search";

export type FieldLoc = { area: StructArea; section: StructSection; field: StructField };

export function findField(areas: StructArea[], keys: string[]): FieldLoc | null {
  for (const key of keys) {
    for (const area of areas) for (const section of area.sections) for (const field of section.fields) {
      if (field.key === key && !field.archived) return { area, section, field };
    }
  }
  return null;
}

export type Contact = {
  name: string;
  role?: string;
  org?: string;
  phone?: string;
  email?: string;
  loc: FieldLoc;
  row: number;
};

const NAME_COL = /^(full )?name$|contact name|person|^contact$|^name /i;
const ROLE_COL = /role|position|title|responsib|job|area/i;
const ORG_COL = /company|organi[sz]ation|business|supplier|^org/i;
const PHONE_COL = /phone|mobile|\bmob\b|\bcell\b/i;
const EMAIL_COL = /e-?mail/i;

function colIndex(columns: string[], re: RegExp, exclude: number[] = []) {
  return columns.findIndex((c, i) => !exclude.includes(i) && re.test(c.trim()));
}

export function contactsFrom(areas: StructArea[], getValue: (f: StructField) => any, limit = 8): Contact[] {
  const out: Contact[] = [];
  for (const area of areas) {
    for (const section of area.sections) {
      for (const field of section.fields) {
        if (field.kind !== "table") continue;
        const v = getValue(field);
        if (v?.not_applicable) continue;
        const t = asTable(v?.value_table);
        if (!t || !isContactTable(area, field, t.columns)) continue;
        let name = colIndex(t.columns, NAME_COL);
        if (name < 0) name = colIndex(t.columns, /name/i);
        if (name < 0) continue;
        const role = colIndex(t.columns, ROLE_COL, [name]);
        const org = colIndex(t.columns, ORG_COL, [name, role]);
        const phone = colIndex(t.columns, PHONE_COL);
        const email = colIndex(t.columns, EMAIL_COL);
        t.rows.forEach((r, ri) => {
          const n = (r[name] ?? "").trim();
          if (!n || out.length >= limit) return;
          const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() || undefined : undefined);
          out.push({ name: n, role: cell(role), org: cell(org), phone: cell(phone), email: cell(email), loc: { area, section, field }, row: ri });
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export type QuickKey = "program" | "schedule" | "site";
export type QuickItem = {
  key: QuickKey;
  title: string;
  area: StructArea | null;
  docs: DocItem[];
  hasInfo: boolean;
  emptyLabel: string;
};

const QUICK: Array<{ key: QuickKey; title: string; emptyLabel: string; match: (a: StructArea) => boolean }> = [
  { key: "program", title: "Event program", emptyLabel: "Event program not added", match: (a) => a.key === "event_program" || /\bprogram/i.test(a.title) },
  { key: "schedule", title: "Master schedule", emptyLabel: "Master schedule not added", match: (a) => a.key === "event_master_schedule" || /master schedule|run ?sheet/i.test(a.title) },
  { key: "site", title: "Site information", emptyLabel: "Site information not added", match: (a) => /\bsite\b|site map|floor plan|venue info/i.test(a.title) },
];

export function quickAccess(areas: StructArea[], getValue: (f: StructField) => any): QuickItem[] {
  return QUICK.map((q) => {
    const area = areas.find(q.match) ?? null;
    if (!area) return { key: q.key, title: q.title, area: null, docs: [], hasInfo: false, emptyLabel: `${q.title} isn't set up for events yet` };
    const docs = collectDocuments([area], getValue).filter((d) => d.status !== "superseded");
    const hasInfo = area.sections.some((s) => s.fields.some((f) => hasInformation(f, getValue(f))));
    return { key: q.key, title: area.title, area, docs, hasInfo, emptyLabel: q.emptyLabel };
  });
}

export function mapUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function textOf(loc: FieldLoc | null, getValue: (f: StructField) => any): string | null {
  if (!loc) return null;
  const v = getValue(loc.field);
  if (v?.not_applicable) return null;
  const t = (v?.value_text ?? "").trim();
  return t || null;
}

export const HOME_KEYS = {
  name: ["event_name"],
  description: ["marketing_event_description", "event_description", "short_description"],
  venue: ["venue_name"],
  address: ["venue_address", "address"],
  start: ["event_start_date"],
  end: ["event_end_date"],
  bumpIn: ["bump_in_start_date"],
  bumpOut: ["bump_out_end_date"],
  publicDates: ["public_event_dates", "dates_open_to_the_public"],
  publicStart: ["public_start_date"],
  publicEnd: ["public_end_date"],
};

/**
 * R6: public vs event dates, and any dates in the description that disagree.
 * The description is checked against the public dates when they're set,
 * otherwise against the event dates.
 */
export function dateCheck(areas: StructArea[], getValue: (f: StructField) => any, fallback?: { start?: string | null; end?: string | null }) {
  const startLoc = findField(areas, HOME_KEYS.start);
  const descLoc = findField(areas, HOME_KEYS.description);
  const start = textOf(startLoc, getValue) ?? fallback?.start ?? null;
  const end = textOf(findField(areas, HOME_KEYS.end), getValue) ?? fallback?.end ?? null;
  const publicStart = textOf(findField(areas, HOME_KEYS.publicStart), getValue);
  const publicEnd = textOf(findField(areas, HOME_KEYS.publicEnd), getValue);
  const hasPublic = !!publicStart;
  const refStart = hasPublic ? publicStart : start;
  const refEnd = hasPublic ? (publicEnd ?? publicStart) : end;
  const conflicts = descLoc ? conflictingMentions(textOf(descLoc, getValue), refStart, refEnd) : [];
  return { start, end, publicStart, publicEnd, hasPublic, conflicts, descLoc, startLoc, reference: hasPublic ? "public" as const : "event" as const };
}
