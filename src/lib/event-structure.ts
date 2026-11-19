import { areaInVariant } from "@/lib/variants";
// Builds the structure an event displays: shared template areas/sub-sections/fields,
// plus anything customised for this event only. Values are matched by stable keys
// (section id + field key), so renaming or reordering never loses information.

import type { FieldDef, FieldKind, FieldValue, TableRules, TableValue } from "@/lib/coverage";

export type ValueRef = { section_id: string | null; extra_section_id: string | null; field_key: string };

export function refKey(r: ValueRef) {
  return `${r.section_id ?? `x:${r.extra_section_id}`}::${r.field_key}`;
}

export type StructField = FieldDef & {
  id: string;
  ref: ValueRef;
  refKey: string;
  help_text?: string | null;
  multiline?: boolean;
  /** Fixed choices for a text field (shown as a dropdown). */
  options?: string[] | null;
  scope: "template" | "event";
  archived?: boolean;
  templateFieldId?: string;
  customFieldId?: string;
};

export type StructSection = {
  id: string; // template section id or extra id
  title: string;
  description?: string | null;
  scope: "template" | "event";
  archived?: boolean;
  fields: StructField[];
  templateSectionId?: string;
  extraSectionId?: string;
};

export type StructArea = {
  id: string; // template head section id
  key: string;
  title: string;
  description?: string | null;
  navGroup: string | null;
  archived?: boolean;
  /** When the area has no sub-sections, its fields live on the area itself (one section). */
  sections: StructSection[];
  hasSubsections: boolean;
};

type Tpl = { id: string; key: string; title: string; description: string | null; parent_id: string | null; sort_order: number; is_active: boolean; nav_group?: string | null; variants?: string[] | null };
type TplField = { id: string; section_id: string; key: string; label: string; kind: string; sort_order: number; is_required: boolean; allow_na?: boolean; multiline?: boolean; help_text?: string | null; default_table?: unknown; table_rules?: unknown; archived_at?: string | null; options?: unknown };
type Extra = { id: string; title: string; description: string | null; sort_order: number; parent_section_id: string | null };
type Custom = { id: string; section_id: string | null; extra_section_id: string | null; key: string; label: string; kind: string; sort_order: number; is_required: boolean; allow_na: boolean; multiline: boolean; help_text: string | null; default_table: unknown; table_rules: unknown };
type Val = { section_id: string | null; extra_section_id: string | null; field_key: string } & Record<string, any>;

function hasAnyValue(v: Val | undefined) {
  if (!v) return false;
  return !!(
    (v.value_text && String(v.value_text).trim()) ||
    (Array.isArray(v.value_kv) && v.value_kv.length) ||
    (Array.isArray(v.value_links) && v.value_links.length) ||
    v.value_table
  );
}

export function buildEventStructure(opts: {
  sections: Tpl[];
  fields: TplField[];
  extras?: Extra[];
  customFields?: Custom[];
  values?: Val[];
  /** R11: the event's template variant. Areas outside it are left out unless they hold information. */
  variant?: string | null;
}): StructArea[] {
  const { sections, fields, extras = [], customFields = [], values = [], variant = null } = opts;
  const valueByKey = new Map<string, Val>();
  for (const v of values) valueByKey.set(refKey(v), v);

  const mkTplField = (f: TplField, sectionId: string): StructField => {
    const ref = { section_id: sectionId, extra_section_id: null, field_key: f.key };
    return {
      id: f.id, key: f.key, label: f.label, kind: f.kind as FieldKind,
      is_required: f.is_required, allow_na: !!f.allow_na, multiline: f.multiline !== false,
      help_text: f.help_text ?? null,
      options: Array.isArray(f.options) ? (f.options as unknown[]).filter((o): o is string => typeof o === "string") : null,
      default_table: (f.default_table as TableValue | null) ?? null,
      table_rules: (f.table_rules as TableRules | null) ?? null,
      ref, refKey: refKey(ref), scope: "template", archived: !!f.archived_at, templateFieldId: f.id,
    };
  };
  const mkCustom = (c: Custom): StructField => {
    const ref = { section_id: c.section_id, extra_section_id: c.extra_section_id, field_key: c.key };
    return {
      id: c.id, key: c.key, label: c.label, kind: c.kind as FieldKind,
      is_required: c.is_required, allow_na: c.allow_na, multiline: c.multiline,
      help_text: c.help_text, default_table: (c.default_table as TableValue | null) ?? null,
      table_rules: (c.table_rules as TableRules | null) ?? null,
      ref, refKey: refKey(ref), scope: "event", customFieldId: c.id,
    };
  };

  // Archived template items stay visible in an event only when it holds information there.
  const keepField = (f: StructField) => !f.archived || hasAnyValue(valueByKey.get(f.refKey));
  const sectionFields = (sectionId: string) => [
    ...fields.filter((f) => f.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order).map((f) => mkTplField(f, sectionId)),
    ...customFields.filter((c) => c.section_id === sectionId).sort((a, b) => a.sort_order - b.sort_order).map(mkCustom),
  ].filter(keepField);

  const heads = sections.filter((s) => !s.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const areas: StructArea[] = [];
  for (const h of heads) {
    const subs = sections.filter((s) => s.parent_id === h.id).sort((a, b) => a.sort_order - b.sort_order);
    const evSubs = extras.filter((e) => e.parent_section_id === h.id).sort((a, b) => a.sort_order - b.sort_order);
    const built: StructSection[] = [];
    if (subs.length === 0 && evSubs.length === 0) {
      built.push({ id: h.id, title: h.title, description: h.description, scope: "template", fields: sectionFields(h.id), templateSectionId: h.id, archived: !h.is_active });
    } else {
      const direct = sectionFields(h.id);
      if (direct.length) built.push({ id: h.id, title: h.title, description: null, scope: "template", fields: direct, templateSectionId: h.id });
      for (const s of subs) {
        const sf = sectionFields(s.id);
        const archived = !s.is_active;
        if (archived && !sf.some((f) => hasAnyValue(valueByKey.get(f.refKey)))) continue;
        built.push({ id: s.id, title: s.title, description: s.description, scope: "template", fields: sf, templateSectionId: s.id, archived });
      }
      for (const e of evSubs) {
        built.push({
          id: e.id, title: e.title, description: e.description, scope: "event", extraSectionId: e.id,
          fields: customFields.filter((c) => c.extra_section_id === e.id).sort((a, b) => a.sort_order - b.sort_order).map(mkCustom),
        });
      }
    }
    const archived = !h.is_active;
    const holdsInfo = () => built.some((s) => s.fields.some((f) => hasAnyValue(valueByKey.get(f.refKey))));
    if (archived && !holdsInfo()) continue;
    if (!areaInVariant(h.variants, variant) && evSubs.length === 0 && !holdsInfo()) continue;
    areas.push({
      id: h.id, key: h.key, title: h.title, description: h.description,
      navGroup: h.nav_group ?? null, archived,
      sections: built, hasSubsections: subs.length + evSubs.length > 0,
    });
  }
  return areas;
}

export function areaFields(a: StructArea) {
  return a.sections.flatMap((s) => s.fields);
}

export type { FieldValue };
