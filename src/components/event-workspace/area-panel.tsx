import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, History, Link2, Lock, MoreHorizontal, Pencil, Pin, PinOff, Plus, Settings2, User,
} from "lucide-react";
import { toast } from "sonner";
import { useSaver } from "@/hooks/use-event-saver";
import { coverageOf, fieldState, hasInformation } from "@/lib/coverage";
import { areaFields, type StructArea, type StructField } from "@/lib/event-structure";
import { checkDateSequence } from "@/lib/dates";
import { formatAuTimestamp, RESTRICTION_INFO, reviewState } from "@/lib/currency";
import { FieldEditor } from "@/components/fields/field-editor";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./context";

const DATE_KEYS = ["bump_in_start_date", "event_start_date", "event_end_date", "bump_out_end_date"] as const;

export function AreaPanel({ area, highlight }: { area: StructArea; highlight: { field: string; row?: number } | null }) {
  const w = useWorkspace();
  const saver = useSaver();
  const editing = w.canEdit && !!w.search.edit;
  const onlyIncomplete = editing && !!w.search.incomplete;
  const m = w.meta.get(area.id);
  const upd = w.areaUpdated(area);
  const review = reviewState(m, upd.at, w.today);
  const restricted = w.areaPerms?.get(area.id)?.restricted_to ?? null;
  const pinned = w.pins.find((p) => p.pin_kind === "area" && p.target === area.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fields = areaFields(area);
  const coverage = coverageOf(fields.map((def) => ({ def, value: w.getValue(def) })));
  const missingRequired = fields.filter((f) => { const s = fieldState(f, w.getValue(f)); return s.required && !s.requirementMet; }).length;

  const linkFor = w.preview ? undefined : (rk: string) => w.absoluteLink({ area: area.id, field: rk });

  async function copyAreaLink() {
    try { await navigator.clipboard.writeText(w.absoluteLink({ area: area.id })); toast.success("Link to this section copied"); }
    catch { toast.error("Couldn't copy the link"); }
  }

  async function markReviewed() {
    setBusy(true);
    await saver.flush();
    const { error } = await supabase.from("event_area_meta").upsert({
      event_id: w.eventId, area_id: area.id, reviewed_at: new Date().toISOString(), reviewed_by: w.userId, reviewed_by_name: w.userName,
    } as any, { onConflict: "event_id,area_id" });
    setBusy(false);
    if (error) return toast.error("Couldn't mark this section reviewed.");
    toast.success(`${area.title} marked reviewed`);
    w.invalidate("meta"); w.invalidate("changes");
  }

  async function togglePin() {
    if (pinned) {
      const { error } = await supabase.from("event_pins").delete().eq("id", pinned.id);
      if (error) return toast.error("Couldn't unpin.");
    } else {
      const { error } = await supabase.from("event_pins").insert({ event_id: w.eventId, pin_kind: "area", target: area.id, label: area.title, area_id: area.id, sort_order: w.pins.length });
      if (error) return toast.error(/up to 6/.test(error.message) ? "Event Home can show up to 6 pinned items. Unpin one first." : "Couldn't pin this section.");
      toast.success("Pinned to Event Home");
    }
    w.invalidate("pins");
  }

  const isIncomplete = (f: StructField) => {
    const s = fieldState(f, w.getValue(f));
    return !s.na && (!s.entered || (s.required && !s.requirementMet));
  };
  const sections = area.sections
    .map((s) => ({ ...s, shown: onlyIncomplete ? s.fields.filter((f) => isIncomplete(f) || f.refKey === highlight?.field) : s.fields }))
    .filter((s) => !onlyIncomplete || s.shown.length > 0);

  const reviewTone = review.reason === "overdue" || review.reason === "changed" ? "text-warning-foreground bg-warning/20 border-warning/50"
    : review.reason === "reviewed" ? "text-foreground bg-success/10 border-success/40" : "text-muted-foreground bg-muted border-border";

  return (
    <section aria-labelledby="area-title" className="rounded-xl border bg-card">
      {w.search.q && w.search.view !== "search" && (
        <div className="px-4 sm:px-6 pt-3">
          <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => w.go({ view: "search", area: undefined, field: undefined, row: undefined, edit: undefined })}>
            <ArrowLeft className="size-3.5" /> Back to results for “{w.search.q}”
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 sm:px-6 py-4">
        <div className="min-w-0 space-y-1">
          {area.navGroup && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{area.navGroup}</p>}
          <h2 id="area-title" className="text-xl font-display font-semibold flex flex-wrap items-center gap-2">
            {area.title}
            {restricted && <Badge variant="outline" className="text-[10px] font-normal gap-1"><Lock className="size-3" aria-hidden /> {RESTRICTION_INFO[restricted]?.short}</Badge>}
            {area.archived && <Badge variant="outline" className="text-[10px] font-normal">Removed from template</Badge>}
          </h2>
          {!w.preview && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {m?.responsible_name && <span className="inline-flex items-center gap-1"><User className="size-3.5" aria-hidden /> Responsible: <span className="text-foreground">{m.responsible_name}</span></span>}
              <span>{upd.at ? `Updated ${formatAuTimestamp(upd.at)}${upd.by ? ` by ${upd.by}` : ""}` : "No information saved yet"}</span>
              {(w.canEdit || review.reason === "reviewed" || review.reason === "changed") && (
                <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-px", reviewTone)}>
                  {review.reason === "reviewed" ? <CheckCircle2 className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />} {review.label}
                </span>
              )}
            </div>
          )}
          {editing && area.description && <p className="text-sm text-muted-foreground">{area.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {w.canEdit && (editing ? (
            <Button size="sm" onClick={async () => { await saver.flush(); w.go({ edit: undefined, incomplete: undefined }, { replace: true }); }}>
              <Check className="size-4" /> Done editing
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={() => w.go({ edit: true }, { replace: true })}>
              <Pencil className="size-4" /> Edit section
            </Button>
          ))}
          {w.canEdit && !w.preview && fields.length > 0 && review.reason !== "reviewed" && (
            <Button size="sm" variant="outline" onClick={markReviewed} disabled={busy} title="Confirms someone has checked this section's information is current. Editing doesn't do this automatically.">
              <CheckCircle2 className="size-4" /> Mark reviewed
            </Button>
          )}
          {!w.preview && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-9" aria-label={`More actions for ${area.title}`}><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={copyAreaLink}><Link2 className="size-4" /> Copy link to this section</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)}><History className="size-4" /> Change history</DropdownMenuItem>
                {w.canEdit && (
                  <>
                    <DropdownMenuItem onSelect={togglePin}>{pinned ? <><PinOff className="size-4" /> Unpin from Event Home</> : <><Pin className="size-4" /> Pin to Event Home</>}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => w.openAreaSettings(area)}><Settings2 className="size-4" /> Responsible person &amp; review date…</DropdownMenuItem>
                    {review.reason === "reviewed" && <DropdownMenuItem onSelect={markReviewed}><CheckCircle2 className="size-4" /> Mark reviewed again</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={() => w.openStructure(area)}><Plus className="size-4" /> Add field or sub-section…</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {editing && coverage.configured && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 sm:px-6 py-2 text-xs text-muted-foreground">
          <span>
            {coverage.total === 0 ? "Every field here is marked not applicable."
              : `${coverage.entered} of ${coverage.total} fields have information${coverage.na ? ` · ${coverage.na} not applicable` : ""}`}
            {missingRequired ? <span className="text-destructive"> · {missingRequired} required missing</span> : null}
            <span> · Fields marked <span className="text-destructive">*</span> are required</span>
          </span>
          <span className="flex items-center gap-2">
            <Label htmlFor="only-incomplete" className="text-xs font-normal">Only fields still to fill</Label>
            <Switch id="only-incomplete" checked={onlyIncomplete} onCheckedChange={(c) => w.go({ incomplete: c || undefined }, { replace: true })} />
          </span>
        </div>
      )}
      {(/people|contact/i.test(area.navGroup ?? "") || /contact|team|supplier/i.test(area.title)) && coverage.configured && editing && (
        <p className="px-4 sm:px-6 pt-3 text-xs text-muted-foreground">People listed here are contacts for this event. Listing someone doesn't give them access to this app.</p>
      )}

      <div className="divide-y">
        {!coverage.configured && (
          <div className="px-4 sm:px-6 py-8 text-center text-sm text-muted-foreground space-y-2">
            <p>{w.canEdit ? "Not set up yet — this area doesn't have any fields." : "This section hasn't been set up yet."}</p>
            {w.canEdit && !w.preview && <Button size="sm" variant="outline" onClick={() => w.openStructure(area)}><Plus className="size-4" /> Add a field</Button>}
          </div>
        )}
        {coverage.configured && onlyIncomplete && sections.length === 0 && (
          <div className="px-4 sm:px-6 py-8 text-center text-sm text-muted-foreground">Every field in this area has information or is marked not applicable.</div>
        )}
        {sections.map((s) => {
          const dateWarnings = w.canEdit && s.fields.some((f) => (DATE_KEYS as readonly string[]).includes(f.key))
            ? checkDateSequence(Object.fromEntries(s.fields.filter((f) => (DATE_KEYS as readonly string[]).includes(f.key)).map((f) => [f.key, w.getValue(f)?.value_text ?? null])))
            : [];
          const nothing = !editing && s.shown.length > 0 && !s.shown.some((f) => hasInformation(f, w.getValue(f)) || w.getValue(f)?.not_applicable || f.refKey === highlight?.field);
          return (
            <div key={s.id} className={cn("px-4 sm:px-6", editing ? "py-4" : "py-3")}>
              {area.hasSubsections && (
                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-display font-semibold">{s.title}</h3>
                  {editing && s.scope === "event" && <Badge variant="outline" className="text-[10px] font-normal">This event only</Badge>}
                  {s.archived && <Badge variant="outline" className="text-[10px] font-normal">Removed from template</Badge>}
                </div>
              )}
              {editing && area.hasSubsections && s.description && <p className="text-xs text-muted-foreground mb-2">{s.description}</p>}
              {dateWarnings.length > 0 && (
                <div className="mb-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs" role="alert">
                  <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="size-3.5" aria-hidden /> Check these dates</p>
                  <ul className="list-disc pl-5 mt-1">{dateWarnings.map((d) => <li key={d}>{d}</li>)}</ul>
                  <p className="text-muted-foreground mt-1">The dates haven't been changed.</p>
                </div>
              )}
              {s.shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">{w.canEdit ? "No fields in this sub-section yet." : "Not set up yet."}</p>
              ) : nothing ? (
                <p className="text-sm text-muted-foreground">Not provided yet: {s.shown.map((f) => f.label).join(", ")}</p>
              ) : (
                <div className={cn(editing ? "space-y-1" : "grid gap-x-8 sm:grid-cols-2")}>
                  {s.shown.map((f) => (
                    <div key={f.refKey} className={cn(!editing && (f.kind === "table" || f.kind === "files" || f.kind === "links" || f.kind === "kv" || (f.kind === "text" && f.multiline)) && "sm:col-span-2")}>
                      <FieldEditor
                        field={f}
                        eventId={w.eventId}
                        areaId={area.id}
                        canEdit={w.canEdit}
                        mode={editing ? "edit" : "read"}
                        showHelp={editing}
                        highlighted={highlight?.field === f.refKey && highlight.row === undefined}
                        highlightRow={highlight?.field === f.refKey ? highlight.row ?? null : null}
                        linkFor={linkFor}
                        hideLabel={s.shown.length === 1 && [area.title, s.title].some((t) => t.trim().toLowerCase() === f.label.trim().toLowerCase())}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <HistoryDialog area={area} open={historyOpen} onOpenChange={setHistoryOpen} />
    </section>
  );
}

function HistoryDialog({ area, open, onOpenChange }: { area: StructArea; open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorkspace();
  const list = w.changes.filter((c) => c.area_id === area.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{area.title} — change history</DialogTitle>
          <DialogDescription>Recent changes, newest first. Several quick edits by the same person are grouped. Times are in your local time.</DialogDescription>
        </DialogHeader>
        {list.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : (
          <ol className="max-h-[60vh] overflow-y-auto divide-y">
            {list.map((c) => (
              <li key={c.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.change_kind === "review" ? "Marked reviewed" : c.field_label}</span>
                  <span className="text-xs text-muted-foreground">{formatAuTimestamp(c.updated_at)}</span>
                </div>
                {c.change_kind !== "review" && c.summary && <p className="text-xs text-foreground/80 mt-0.5 line-clamp-2">{c.summary}</p>}
                <p className="text-xs text-muted-foreground">{c.changed_by_name ?? "Unknown"}</p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
