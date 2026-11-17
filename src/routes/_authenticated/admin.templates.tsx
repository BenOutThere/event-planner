import { RESTRICTION_INFO } from "@/lib/currency";
import { startersFor, type Starter } from "@/lib/starter-fields";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, ArrowUp, ArrowDown, Eye, Search, ChevronDown, ChevronRight, RotateCcw, Archive, FolderOpen, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  createTemplateSection, updateTemplateSection, deleteTemplateSection, restoreTemplateSection,
  createTemplateField, updateTemplateField, deleteTemplateField, restoreTemplateField, getTemplateImpact,
} from "@/lib/admin.functions";
import { TableField } from "@/components/fields/table-field";
import { FIELD_KINDS, kindMeta, type FieldKindValue } from "@/lib/field-kinds";
import { asTable, type TableValue } from "@/lib/coverage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/templates")({
  head: () => ({
    meta: [
      { title: "Template builder — OTG Event Planner" },
      { name: "description", content: "Set up the shared event areas, sub-sections and fields used by every event." },
      { property: "og:title", content: "Template builder — OTG Event Planner" },
      { property: "og:description", content: "Set up the shared event areas, sub-sections and fields used by every event." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplateBuilder,
});

type Confirm = { title: string; body: string; action: string; destructive?: boolean; run: () => Promise<void> } | null;

function TemplateBuilder() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const fns = {
    createSection: useServerFn(createTemplateSection),
    updateSection: useServerFn(updateTemplateSection),
    deleteSection: useServerFn(deleteTemplateSection),
    restoreSection: useServerFn(restoreTemplateSection),
    createField: useServerFn(createTemplateField),
    updateField: useServerFn(updateTemplateField),
    deleteField: useServerFn(deleteTemplateField),
    restoreField: useServerFn(restoreTemplateField),
    impact: useServerFn(getTemplateImpact),
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newArea, setNewArea] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showArchived, setShowArchived] = useState(false);

  const sections = useQuery({
    queryKey: ["tpl-sections"],
    queryFn: async () => (await supabase.from("template_sections").select("*").order("sort_order")).data ?? [],
  });
  const fields = useQuery({
    queryKey: ["tpl-fields"],
    queryFn: async () => (await supabase.from("template_fields").select("*").order("sort_order")).data ?? [],
  });

  const all = (sections.data ?? []) as any[];
  const allFields = (fields.data ?? []) as any[];
  const active = all.filter((s) => s.is_active);
  const heads = active.filter((s) => !s.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const subsOf = (id: string) => active.filter((s) => s.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);
  const fieldsOf = (id: string) => allFields.filter((f) => f.section_id === id && !f.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  const groups = useMemo(() => Array.from(new Set(all.map((s) => s.nav_group).filter(Boolean))) as string[], [all]);

  useEffect(() => {
    if (!selected && heads[0]) setSelected(heads[0].id);
  }, [heads.length]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const invalidate = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["tpl-sections"] }),
    qc.invalidateQueries({ queryKey: ["tpl-fields"] }),
  ]);
  const attempt = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); await invalidate(); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't save the template change"); }
  };

  const needle = filter.trim().toLowerCase();
  const matches = (s: any) => !needle || s.title.toLowerCase().includes(needle) || fieldsOf(s.id).some((f) => f.label.toLowerCase().includes(needle));
  const sel = all.find((s) => s.id === selected) ?? null;

  async function addArea() {
    const title = newArea.trim();
    if (!title) return;
    await attempt(async () => {
      const r: any = await fns.createSection({ data: { title } });
      setSelected(r.section.id);
      setNewArea("");
    }, "Area added to the shared template");
  }

  async function move(list: any[], id: string, dir: -1 | 1, kind: "section" | "field") {
    const idx = list.findIndex((x) => x.id === id);
    const other = list[idx + dir];
    if (!other) return;
    const a = list[idx].sort_order, b = other.sort_order === a ? a + dir : other.sort_order;
    await attempt(() => Promise.all(kind === "section"
      ? [fns.updateSection({ data: { id, patch: { sort_order: b } } }), fns.updateSection({ data: { id: other.id, patch: { sort_order: a } } })]
      : [fns.updateField({ data: { id, patch: { sort_order: b } } }), fns.updateField({ data: { id: other.id, patch: { sort_order: a } } })]));
  }

  async function removeSection(s: any) {
    const impact: any = await fns.impact({ data: { section_id: s.id } }).catch(() => null);
    const withData = impact?.eventsWithData ?? 0;
    setConfirm({
      title: `Remove “${s.title}” from the template?`,
      body: withData > 0
        ? `${withData} event${withData === 1 ? " has" : "s have"} information here. It will be archived: hidden from new events, but kept and still shown in events that have information. You can restore it later.`
        : `No event has information here. It will be removed from all ${impact?.events ?? ""} events, including its sub-sections and fields.`,
      action: withData > 0 ? "Archive" : "Remove",
      destructive: withData === 0,
      run: () => attempt(async () => { await fns.deleteSection({ data: { id: s.id } }); if (selected === s.id) setSelected(s.parent_id ?? null); }, withData > 0 ? "Archived — saved information kept" : "Removed"),
    });
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold">Template builder</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The shared template is used by every event. Changes here apply to all existing and future events. Saved event information is never deleted — removed items with information are archived.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/template-preview" search={{ area: sel ? (sel.parent_id ?? sel.id) : undefined }}><Eye className="size-4" /> Preview</Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] items-start">
        <aside className="rounded-xl border bg-card p-3 space-y-3 lg:sticky lg:top-4">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search the template" placeholder="Search areas and fields…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8" />
          </div>
          <nav aria-label="Template outline" className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            <ul className="space-y-0.5">
              {heads.filter((h) => matches(h) || subsOf(h.id).some(matches)).map((h, i, arr) => {
                const subs = subsOf(h.id);
                const expanded = open[h.id] ?? (selected === h.id || subs.some((s) => s.id === selected) || !!needle);
                return (
                  <li key={h.id}>
                    <div className={cn("flex items-center rounded-md", selected === h.id && "bg-primary text-primary-foreground")}>
                      <button type="button" className="p-1.5" aria-label={expanded ? `Collapse ${h.title}` : `Expand ${h.title}`}
                        onClick={() => setOpen((o) => ({ ...o, [h.id]: !expanded }))} disabled={subs.length === 0}>
                        {subs.length === 0 ? <span className="inline-block size-4" /> : expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                      <button type="button" onClick={() => setSelected(h.id)} className="flex-1 text-left text-sm font-medium py-1.5 pr-2 min-w-0">
                        <span className="break-words">{h.title}</span>
                      </button>
                    </div>
                    {expanded && subs.length > 0 && (
                      <ul className="ml-6 border-l pl-1 my-0.5 space-y-0.5">
                        {subs.filter((s) => !needle || matches(s) || matches(h)).map((s) => (
                          <li key={s.id}>
                            <button type="button" onClick={() => setSelected(s.id)}
                              className={cn("w-full text-left text-sm rounded-md px-2 py-1", selected === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                              {s.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex gap-2 pt-2 border-t">
            <Input aria-label="New area name" placeholder="New area…" value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} />
            <Button size="sm" onClick={addArea} disabled={!newArea.trim()}><Plus className="size-4" /> Area</Button>
          </div>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="size-3.5" aria-hidden /> {showArchived ? "Hide archived" : "Show archived"}
          </button>
          {showArchived && (
            <ArchivedList
              sections={all.filter((s) => !s.is_active && (!s.parent_id || all.find((p) => p.id === s.parent_id)?.is_active))}
              fields={allFields.filter((f) => f.archived_at)}
              sectionTitle={(id) => all.find((s) => s.id === id)?.title ?? ""}
              onRestoreSection={(id) => attempt(() => fns.restoreSection({ data: { id } }), "Restored")}
              onRestoreField={(id) => attempt(() => fns.restoreField({ data: { id } }), "Restored")}
            />
          )}
        </aside>

        <main className="min-w-0">
          {!sel ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Add an area to get started.</div>
          ) : (
            <SectionSettings
              key={sel.id}
              section={sel}
              isArea={!sel.parent_id}
              parent={sel.parent_id ? all.find((s) => s.id === sel.parent_id) : null}
              subs={!sel.parent_id ? subsOf(sel.id) : []}
              fields={fieldsOf(sel.id)}
              groups={groups}
              siblings={sel.parent_id ? subsOf(sel.parent_id) : heads}
              fns={fns}
              attempt={attempt}
              onSelect={setSelected}
              onMove={(dir) => move(sel.parent_id ? subsOf(sel.parent_id) : heads, sel.id, dir, "section")}
              onMoveField={(id, dir) => move(fieldsOf(sel.id), id, dir, "field")}
              onRemove={() => removeSection(sel)}
              setConfirm={setConfirm}
            />
          )}
        </main>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={async () => { const c = confirm; setConfirm(null); await c?.run(); }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ArchivedList({ sections, fields, sectionTitle, onRestoreSection, onRestoreField }: {
  sections: any[]; fields: any[]; sectionTitle: (id: string) => string;
  onRestoreSection: (id: string) => void; onRestoreField: (id: string) => void;
}) {
  if (!sections.length && !fields.length) return <p className="text-xs text-muted-foreground">Nothing archived.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {sections.map((s) => (
        <li key={s.id} className="flex items-center gap-2"><FolderOpen className="size-3.5 text-muted-foreground" aria-hidden /><span className="flex-1 min-w-0 break-words">{s.title}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => onRestoreSection(s.id)}><RotateCcw className="size-3.5" /> Restore</Button></li>
      ))}
      {fields.map((f) => (
        <li key={f.id} className="flex items-center gap-2"><FileText className="size-3.5 text-muted-foreground" aria-hidden /><span className="flex-1 min-w-0 break-words">{f.label} <span className="text-xs text-muted-foreground">in {sectionTitle(f.section_id)}</span></span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => onRestoreField(f.id)}><RotateCcw className="size-3.5" /> Restore</Button></li>
      ))}
    </ul>
  );
}

function SectionSettings({
  section, isArea, parent, subs, fields, groups, siblings, fns, attempt, onSelect, onMove, onMoveField, onRemove, setConfirm,
}: {
  section: any; isArea: boolean; parent: any; subs: any[]; fields: any[]; groups: string[]; siblings: any[];
  fns: any; attempt: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onSelect: (id: string) => void; onMove: (dir: -1 | 1) => void; onMoveField: (id: string, dir: -1 | 1) => void;
  onRemove: () => void; setConfirm: (c: Confirm) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [desc, setDesc] = useState(section.description ?? "");
  const [group, setGroup] = useState<string>(section.nav_group ?? "");
  const [newSub, setNewSub] = useState("");
  const [newField, setNewField] = useState<{ label: string; kind: FieldKindValue }>({ label: "", kind: "text" });
  const idx = siblings.findIndex((s) => s.id === section.id);
  const hasSubs = subs.length > 0;

  const saveSection = (patch: any, ok = "Saved to the shared template") => attempt(() => fns.updateSection({ data: { id: section.id, patch } }), ok);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5 space-y-4" aria-label={isArea ? "Area settings" : "Sub-section settings"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {isArea ? "Area" : <>Sub-section of <button type="button" className="underline" onClick={() => onSelect(parent.id)}>{parent?.title}</button></>}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={idx <= 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="size-4" /> Up</Button>
            <Button size="sm" variant="ghost" disabled={idx === siblings.length - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="size-4" /> Down</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}><Trash2 className="size-4" /> Remove</Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sec-title">Name</Label>
            <Input id="sec-title" value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== section.title && saveSection({ title: title.trim() }, "Renamed — saved information stays attached")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sec-desc">Help text for people filling in the event</Label>
            <Textarea id="sec-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== (section.description ?? "") && saveSection({ description: desc.trim() || null })}
              placeholder="e.g. Add the link to the Smartsheet budget" />
            <p className="text-xs text-muted-foreground">Shown to people who can edit the event, not to view-only users.</p>
          </div>
          {isArea && (
            <div className="space-y-1.5">
              <Label htmlFor="sec-group">Navigation group</Label>
              <Input id="sec-group" list="nav-groups" value={group} onChange={(e) => setGroup(e.target.value)}
                onBlur={() => group !== (section.nav_group ?? "") && saveSection({ nav_group: group.trim() || null })}
                placeholder="e.g. People & contacts" />
              <datalist id="nav-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
              <p className="text-xs text-muted-foreground">Groups areas under a heading in the event navigator.</p>
            </div>
          )}
          {isArea && (
            <div className="space-y-1.5">
              <Label>Who can see this area</Label>
              <Select value={section.restricted_to ?? "everyone"} onValueChange={(v) => saveSection({ restricted_to: v === "everyone" ? null : v }, "Visibility saved for every event")}>
                <SelectTrigger aria-label="Who can see this area"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">{RESTRICTION_INFO.everyone.label}</SelectItem>
                  <SelectItem value="staff">{RESTRICTION_INFO.staff.label}</SelectItem>
                  <SelectItem value="managers">{RESTRICTION_INFO.managers.label}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Default for every event — e.g. budgets or commercial agreements. Admins can override it for one event in that section's settings. Enforced for information, files, search and history.</p>
            </div>
          )}
        </div>
      </section>

      {isArea && (
        <section className="rounded-xl border bg-card p-5 space-y-3" aria-label="Sub-sections">
          <h2 className="font-display font-semibold">Sub-sections</h2>
          {hasSubs ? (
            <ul className="divide-y rounded-md border">
              {subs.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSelect(s.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2">
                    <span>{s.title}</span><ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sub-sections. Fields can sit directly in this area, or add sub-sections to group them.</p>
          )}
          <div className="flex gap-2">
            <Input aria-label="New sub-section name" placeholder="New sub-section…" value={newSub} onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newSub.trim()) { void attempt(() => fns.createSection({ data: { title: newSub.trim(), parent_id: section.id } }), "Sub-section added"); setNewSub(""); } }} />
            <Button size="sm" variant="outline" disabled={!newSub.trim()}
              onClick={() => { void attempt(() => fns.createSection({ data: { title: newSub.trim(), parent_id: section.id } }), "Sub-section added"); setNewSub(""); }}>
              <Plus className="size-4" /> Sub-section
            </Button>
          </div>
        </section>
      )}

      {(!isArea || !hasSubs || fields.length > 0) && (
        <section className="rounded-xl border bg-card p-5 space-y-3" aria-label="Fields">
          <h2 className="font-display font-semibold">Fields</h2>
          {fields.length === 0 && <p className="text-sm text-muted-foreground">No fields yet. Events show this as “Not configured”.</p>}
          <ul className="space-y-2">
            {fields.map((f, i) => (
              <FieldSettings key={f.id} field={f} first={i === 0} last={i === fields.length - 1}
                fns={fns} attempt={attempt} onMove={(dir) => onMoveField(f.id, dir)} setConfirm={setConfirm} />
            ))}
          </ul>
          <StarterFields title={`${parent?.title ?? ""} ${section.title}`} existing={fields.map((f) => f.label)}
            onAdd={(list) => attempt(async () => { for (const st of list) await fns.createField({ data: { section_id: section.id, kind: st.kind, label: st.label } }); }, `Added ${list.length} field${list.length === 1 ? "" : "s"} to the shared template`)} />
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Input aria-label="New field name" placeholder="New field name…" value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && newField.label.trim()) { void attempt(() => fns.createField({ data: { section_id: section.id, kind: newField.kind, label: newField.label.trim() } }), "Field added"); setNewField({ ...newField, label: "" }); } }} />
            <Select value={newField.kind} onValueChange={(v) => setNewField({ ...newField, kind: v as FieldKindValue })}>
              <SelectTrigger className="sm:w-48" aria-label="New field type"><SelectValue /></SelectTrigger>
              <SelectContent>{FIELD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="sm:h-9" disabled={!newField.label.trim()}
              onClick={() => { void attempt(() => fns.createField({ data: { section_id: section.id, kind: newField.kind, label: newField.label.trim() } }), "Field added"); setNewField({ ...newField, label: "" }); }}>
              <Plus className="size-4" /> Field
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function StarterFields({ title, existing, onAdd }: { title: string; existing: string[]; onAdd: (list: Starter[]) => Promise<void> }) {
  const suggestions = startersFor(title, existing);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!suggestions.length) return null;
  const chosen = suggestions.filter((s) => picked.has(s.label));
  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <p className="text-sm font-medium">Suggested starter fields</p>
      <p className="text-xs text-muted-foreground">Optional. Adding them puts empty fields in the shared template for every event — nothing is filled in, and they count as “not entered” until someone adds information.</p>
      <ul className="space-y-1">
        {suggestions.map((s) => (
          <li key={s.label}>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={picked.has(s.label)} onCheckedChange={(c) => setPicked((p) => { const n = new Set(p); c ? n.add(s.label) : n.delete(s.label); return n; })} className="mt-0.5" />
              <span><span className="font-medium">{s.label}</span> <span className="text-xs text-muted-foreground">({kindMeta(s.kind).label}) — {s.why}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" disabled={!chosen.length} onClick={async () => { await onAdd(chosen); setPicked(new Set()); }}>
        <Plus className="size-4" /> Add {chosen.length || ""} selected
      </Button>
    </div>
  );
}

function FieldSettings({ field, first, last, fns, attempt, onMove, setConfirm }: {
  field: any; first: boolean; last: boolean; fns: any;
  attempt: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  onMove: (dir: -1 | 1) => void; setConfirm: (c: Confirm) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [help, setHelp] = useState(field.help_text ?? "");
  const meta = kindMeta(field.kind);
  const Icon = meta.icon;
  const save = (patch: any, ok = "Saved to the shared template") => attempt(() => fns.updateField({ data: { id: field.id, patch } }), ok);

  async function changeKind(kind: FieldKindValue) {
    if (kind === field.kind) return;
    const impact: any = await fns.impact({ data: { field_id: field.id } }).catch(() => null);
    const n = impact?.eventsWithData ?? 0;
    setConfirm({
      title: `Change “${field.label}” to ${kindMeta(kind).label}?`,
      body: n > 0
        ? `${n} event${n === 1 ? " has" : "s have"} information in this field. It won't be deleted — events will show it as “kept from when this field was a different type” until someone re-enters it.`
        : "No event has information in this field yet.",
      action: "Change type",
      run: () => save({ kind }, "Field type changed — existing information kept"),
    });
  }

  async function remove() {
    const impact: any = await fns.impact({ data: { field_id: field.id } }).catch(() => null);
    const n = impact?.eventsWithData ?? 0;
    setConfirm({
      title: `Remove “${field.label}” from the template?`,
      body: n > 0
        ? `${n} event${n === 1 ? " has" : "s have"} information in this field. It will be archived: hidden from new events but kept in events that have information. You can restore it later.`
        : `No event has information here. It will be removed from all ${impact?.events ?? ""} events.`,
      action: n > 0 ? "Archive field" : "Remove field",
      destructive: n === 0,
      run: () => attempt(() => fns.deleteField({ data: { id: field.id } }), n > 0 ? "Archived — saved information kept" : "Removed"),
    });
  }

  return (
    <li className="rounded-md border bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="flex-1 min-w-0 flex items-center gap-2 text-left">
          {expanded ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
          <Icon className="size-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-sm font-medium break-words">{field.label}</span>
          <span className="text-xs text-muted-foreground shrink-0">{meta.label}</span>
          {field.is_required && <Badge variant="outline" className="text-[10px] font-normal">Required</Badge>}
          {field.allow_na && <Badge variant="outline" className="text-[10px] font-normal">N/A allowed</Badge>}
        </button>
        <Button size="icon" variant="ghost" className="size-8" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${field.label} up`}><ArrowUp className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${field.label} down`}><ArrowDown className="size-4" /></Button>
      </div>
      {expanded && (
        <div className="border-t px-3 py-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`f-label-${field.id}`}>Field name</Label>
              <Input id={`f-label-${field.id}`} value={label} onChange={(e) => setLabel(e.target.value)}
                onBlur={() => label.trim() && label.trim() !== field.label && save({ label: label.trim() }, "Renamed — saved information stays attached")} />
            </div>
            <div className="space-y-1.5">
              <Label>Field type</Label>
              <Select value={field.kind} onValueChange={(v) => changeKind(v as FieldKindValue)}>
                <SelectTrigger aria-label="Field type"><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`f-help-${field.id}`}>Help text</Label>
              <Input id={`f-help-${field.id}`} value={help} onChange={(e) => setHelp(e.target.value)}
                onBlur={() => help !== (field.help_text ?? "") && save({ help_text: help.trim() || null })}
                placeholder="Explain what to enter, e.g. what an abbreviation means" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!field.is_required} onCheckedChange={(c) => save({ is_required: c })} /> Required</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!field.allow_na} onCheckedChange={(c) => save({ allow_na: c })} /> Allow “Not applicable”</label>
            {field.kind === "text" && (
              <label className="flex items-center gap-2 text-sm"><Switch checked={field.multiline !== false} onCheckedChange={(c) => save({ multiline: c })} /> Long text (multiple lines)</label>
            )}
          </div>
          {field.kind === "table" && <TableDefaults field={field} save={save} />}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}><Trash2 className="size-4" /> Remove field</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function TableDefaults({ field, save }: { field: any; save: (patch: any, ok?: string) => Promise<void> }) {
  const saved = asTable(field.default_table);
  const [draft, setDraft] = useState<TableValue | null>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const rules = field.table_rules ?? { required_columns: [], min_rows: null };
  const cols = draft?.columns ?? saved?.columns ?? [];
  const req: string[] = rules.required_columns ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Starting rows for new events</h3>
          <p className="text-xs text-muted-foreground">Column headings and labels typed here appear in every event's table. They don't count as event information.</p>
        </div>
        <TableField fieldLabel={`${field.label} — template starting rows`} value={draft} onChange={(v) => setDraft(v)} />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty} onClick={() => save({ default_table: draft }, "Starting rows saved to the template")}>Save starting rows</Button>
          {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>Discard changes</Button>}
          {dirty && <span className="text-xs text-warning-foreground bg-warning/20 rounded px-2 py-0.5">Unsaved changes</span>}
        </div>
        <p className="text-xs text-muted-foreground">Events that already have their own table keep it; new starting rows apply to events that haven't filled in this table yet.</p>
      </div>
      {cols.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Completion rules (optional)</h3>
            <p className="text-xs text-muted-foreground">Used when the field is required. Without rules, the table is only described as having information entered.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {cols.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox checked={req.includes(c)} onCheckedChange={(v) => {
                  const next = v ? [...req, c] : req.filter((x) => x !== c);
                  void save({ table_rules: { ...rules, required_columns: next } }, "Completion rule saved");
                }} />
                Every listed row needs “{c}”
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor={`minrows-${field.id}`} className="font-normal">At least</Label>
            <Input id={`minrows-${field.id}`} type="number" min={0} max={50} className="w-20 h-8" defaultValue={rules.min_rows ?? ""}
              onBlur={(e) => {
                const n = e.target.value === "" ? null : Math.max(0, Math.min(50, parseInt(e.target.value) || 0));
                if (n !== (rules.min_rows ?? null)) void save({ table_rules: { ...rules, required_columns: req, min_rows: n } }, "Completion rule saved");
              }} />
            <span>complete row(s)</span>
          </div>
        </div>
      )}
    </div>
  );
}
