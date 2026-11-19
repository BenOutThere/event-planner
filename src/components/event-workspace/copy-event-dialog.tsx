import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/fields/date-field";
import { nextEdition } from "@/lib/copy-event";

export type CopySource = { id: string; name: string; proposed_date: string | null; end_date: string | null };

/** R18: start a new event from a previous edition. */
export function CopyEventDialog({ source, open, onOpenChange }: { source: CopySource | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sections = useQuery({
    queryKey: ["tpl-sections"],
    enabled: open,
    queryFn: async () => (await supabase.from("template_sections").select("*").order("sort_order")).data ?? [],
  });
  const areas = useMemo(() => (sections.data ?? []).filter((s: any) => !s.parent_id && s.is_active), [sections.data]);
  const [name, setName] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    const n = nextEdition(source.name, source.proposed_date, source.end_date);
    setName(n.name); setStart(n.start); setEnd(n.end); setPicked(null);
  }, [open, source]);
  const chosen = picked ?? new Set(areas.map((a: any) => a.id));
  const toggle = (id: string, on: boolean) => { const next = new Set(chosen); if (on) next.add(id); else next.delete(id); setPicked(next); };

  const nameError = !name.trim() ? "Enter the new event's name" : /^untitled( event)?$/i.test(name.trim()) ? "Give the event its real name" : null;
  const dateError = !start ? "Enter the start date" : end && end < start ? "The end date is before the start date" : null;

  async function copy() {
    if (!source || nameError || dateError || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("copy_event", {
      _source: source.id, _name: name.trim(), _start: start!, _end: end ?? undefined, _areas: [...chosen],
    } as any);
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Couldn't copy the event.");
    toast.success(`${name.trim()} created from ${source.name}`);
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["my-event-access"] });
    onOpenChange(false);
    navigate({ to: "/events/$id", params: { id: data as unknown as string }, search: {} as any });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy to a new event</DialogTitle>
          <DialogDescription>
            Starts the next edition of {source?.name} as a Draft that you lead. Its own sections and fields, who's responsible for each area
            and who can see restricted areas come across, plus the information in the areas you tick.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void copy(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="copy-name">New event name</Label>
            <Input id="copy-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="copy-start">Start date</Label>
              <DateField id="copy-start" ariaLabel="Start date" value={start} onChange={setStart} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="copy-end">End date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <DateField id="copy-end" ariaLabel="End date" value={end} onChange={setEnd} />
            </div>
          </div>
          {dateError && <p className="text-xs text-destructive">{dateError}</p>}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Copy the information in</legend>
            <div className="flex gap-3 text-xs">
              <button type="button" className="underline underline-offset-2" onClick={() => setPicked(new Set(areas.map((a: any) => a.id)))}>All areas</button>
              <button type="button" className="underline underline-offset-2" onClick={() => setPicked(new Set())}>None (structure only)</button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border p-2 grid sm:grid-cols-2 gap-1.5">
              {areas.map((a: any) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={chosen.has(a.id)} onCheckedChange={(c) => toggle(a.id, !!c)} /> {a.title}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Not copied: dates, uploaded files, reviews (they start again) and people with access. Only areas you can see are copied.
            </p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !!nameError || !!dateError}>{busy && <Loader2 className="size-4 animate-spin" />} Create the new event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
