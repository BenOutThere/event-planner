import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { addTemplateFieldFromEvent, addTemplateSubsectionFromEvent } from "@/lib/admin.functions";
import type { StructArea } from "@/lib/event-structure";
import { FIELD_KINDS, type FieldKindValue } from "@/lib/field-kinds";

type Scope = "event" | "template";

function slug(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
}

export function StructureDialog({
  open, onOpenChange, eventId, area, isAdmin, userId, eventCount, initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  area: StructArea;
  isAdmin: boolean;
  userId: string | null;
  eventCount: number;
  initial?: "field" | "subsection";
}) {
  const qc = useQueryClient();
  const addTplField = useServerFn(addTemplateFieldFromEvent);
  const addTplSub = useServerFn(addTemplateSubsectionFromEvent);
  const [what, setWhat] = useState<"field" | "subsection">(initial ?? "field");
  const [scope, setScope] = useState<Scope>("event");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FieldKindValue>("text");
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmShared, setConfirmShared] = useState(false);

  const targets = area.sections.map((s) => ({ value: `${s.scope}:${s.id}`, label: area.hasSubsections ? s.title : area.title, section: s }));
  useEffect(() => {
    if (open) {
      setWhat(initial ?? "field"); setScope("event"); setLabel(""); setKind("text"); setConfirmShared(false);
      setTarget(targets[0]?.value ?? `template:${area.id}`);
    }
  }, [open]);

  const chosen = targets.find((t) => t.value === target)?.section;
  const sharedNotAllowed = scope === "template" && what === "field" && chosen?.scope === "event";

  async function submit() {
    const title = label.trim();
    if (!title || busy) return;
    if (scope === "template" && !confirmShared) { setConfirmShared(true); return; }
    setBusy(true);
    try {
      if (scope === "template") {
        if (what === "subsection") await addTplSub({ data: { parent_id: area.id, title } });
        else await addTplField({ data: { section_id: chosen?.templateSectionId ?? area.id, kind, label: title } });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["tpl-sections"] }),
          qc.invalidateQueries({ queryKey: ["tpl-fields"] }),
        ]);
        toast.success("Added to the shared template — it now appears in every event");
      } else if (what === "subsection") {
        const { error } = await supabase.from("event_section_extras").insert({
          event_id: eventId, title, parent_section_id: area.id, sort_order: 1000 + Date.now() % 100000, created_by: userId,
        } as any);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["event-extras", eventId] });
        toast.success("Sub-section added to this event only");
      } else {
        const s = chosen;
        const { error } = await supabase.from("event_custom_fields").insert({
          event_id: eventId,
          section_id: s?.scope === "template" ? s.templateSectionId ?? s.id : null,
          extra_section_id: s?.scope === "event" ? s.extraSectionId ?? s.id : null,
          key: `evt_${slug(title)}_${crypto.randomUUID().slice(0, 6)}`,
          label: title,
          kind,
          multiline: kind === "text",
          created_by: userId,
        } as any);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["event-custom-fields", eventId] });
        toast.success("Field added to this event only");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "You don't have permission to change this event's structure." : e?.message ?? "Couldn't add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customise “{area.title}”</DialogTitle>
          <DialogDescription>Add a field or sub-section. Choose whether it's for this event only or the shared template.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What to add</Label>
            <RadioGroup value={what} onValueChange={(v) => { setWhat(v as any); setConfirmShared(false); }} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="field" /> Field</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="subsection" /> Sub-section</label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="struct-label">{what === "field" ? "Field name" : "Sub-section name"}</Label>
            <Input id="struct-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={what === "field" ? "e.g. Site map" : "e.g. Accessibility"} />
          </div>

          {what === "field" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as FieldKindValue)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {area.hasSubsections && (
                <div className="space-y-1.5">
                  <Label>Put it in</Label>
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{targets.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Who sees this</Label>
            <RadioGroup value={scope} onValueChange={(v) => { setScope(v as Scope); setConfirmShared(false); }} className="space-y-2">
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                <RadioGroupItem value="event" className="mt-0.5" />
                <span><span className="font-medium">This event only</span><br /><span className="text-muted-foreground">Other events and the shared template are not changed.</span></span>
              </label>
              <label className={`flex items-start gap-2 rounded-md border p-3 text-sm ${isAdmin ? "cursor-pointer" : "opacity-60"}`}>
                <RadioGroupItem value="template" disabled={!isAdmin} className="mt-0.5" />
                <span>
                  <span className="font-medium">Shared template</span><br />
                  <span className="text-muted-foreground">
                    {isAdmin ? `Adds it to all ${eventCount} events and every future event.` : "Only admins can change the shared template."}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {sharedNotAllowed && (
            <p className="text-sm text-muted-foreground">This sub-section belongs to this event only, so new fields in it can only be added to this event.</p>
          )}
          {confirmShared && !sharedNotAllowed && (
            <p className="rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm" role="alert">
              This changes the shared template. “{label.trim()}” will appear in all {eventCount} events and future events. Existing information is not affected. Select the button again to confirm.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!label.trim() || busy || sharedNotAllowed}>
            {scope === "template" ? (confirmShared ? "Confirm — add to shared template" : "Add to shared template…") : "Add to this event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
