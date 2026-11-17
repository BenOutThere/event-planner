import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DateField } from "@/components/fields/date-field";
import { RESTRICTION_INFO } from "@/lib/currency";
import type { StructArea } from "@/lib/event-structure";
import { useWorkspace } from "./context";

export function AreaSettingsDialog({ area, open, onOpenChange }: { area: StructArea; open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorkspace();
  const m = w.meta.get(area.id);
  const templateDefault = (w.areaPerms?.get(area.id) && !m?.restricted_to) ? w.areaPerms.get(area.id)!.restricted_to : null;
  const [responsible, setResponsible] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [restriction, setRestriction] = useState<string>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResponsible(m?.responsible_name ?? "");
    setDue(m?.review_due ?? null);
    setRestriction(m?.restricted_to ?? "default");
  }, [open]);

  async function save() {
    setBusy(true);
    const row: Record<string, unknown> = { event_id: w.eventId, area_id: area.id, responsible_name: responsible.trim() || null, review_due: due };
    if (w.isAdmin) row.restricted_to = restriction === "default" ? null : restriction;
    const { error } = await supabase.from("event_area_meta").upsert(row as any, { onConflict: "event_id,area_id" });
    setBusy(false);
    if (error) return toast.error(/admin/i.test(error.message) ? error.message : "Couldn't save these settings. You may not have permission.");
    toast.success("Section settings saved");
    w.invalidate("meta");
    onOpenChange(false);
  }

  const people = [...new Set([...w.profiles.values()])].sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{area.title} — section settings</DialogTitle>
          <DialogDescription>Applies to this event only. Optional — use it for areas where it helps to know who keeps the information current.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="resp">Responsible person</Label>
            <Input id="resp" list="resp-people" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Name or team" />
            <datalist id="resp-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
            <p className="text-xs text-muted-foreground">Shown to everyone who can see this area. It doesn't change anyone's access.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">Review by</Label>
            <DateField id="due" ariaLabel="Review by" value={due} onChange={setDue} />
            <p className="text-xs text-muted-foreground">After this date the area shows as needing review until someone marks it reviewed.</p>
          </div>
          {w.isAdmin && (
            <div className="space-y-1.5">
              <Label>Who can see this area</Label>
              <Select value={restriction} onValueChange={setRestriction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Template default ({templateDefault ? RESTRICTION_INFO[templateDefault].label : "everyone who can see the event"})</SelectItem>
                  <SelectItem value="everyone">{RESTRICTION_INFO.everyone.label}</SelectItem>
                  <SelectItem value="staff">{RESTRICTION_INFO.staff.label}</SelectItem>
                  <SelectItem value="managers">{RESTRICTION_INFO.managers.label}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {restriction !== "default" ? RESTRICTION_INFO[restriction].description : "Uses the setting from the Template builder."} Applies to the area's information, files, search results and history.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
