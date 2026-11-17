import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assignOpsDocToEvent } from "@/lib/ops-files";

export type OpsCategory = { id: string; name: string; sort_order: number };
export const NO_CATEGORY = "none";

export function CategorySelect({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: OpsCategory[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="ops-category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NO_CATEGORY}>No category</SelectItem>
        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

type DocDetails = { id: string; title: string; description: string | null; category_id: string | null };

export function EditPlanDialog({ open, onOpenChange, doc, categories, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; doc: DocDetails; categories: OpsCategory[]; onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState(doc.category_id ?? NO_CATEGORY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setTitle(doc.title); setDescription(doc.description ?? ""); setCategory(doc.category_id ?? NO_CATEGORY); } }, [open, doc.id]);
  async function save() {
    if (!title.trim()) { toast.error("Add a title."); return; }
    setSaving(true);
    const { error } = await supabase.from("ops_documents").update({
      title: title.trim(), description: description.trim() || null, category_id: category === NO_CATEGORY ? null : category,
    }).eq("id", doc.id);
    setSaving(false);
    if (error) { toast.error("Couldn't save the details."); return; }
    toast.success("Details saved");
    onSaved();
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit details</DialogTitle><DialogDescription>Title, category and description are also searched.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="ops-title">Title</Label><Input id="ops-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ops-category">Category</Label><CategorySelect value={category} onChange={setCategory} categories={categories} /></div>
          <div className="space-y-1.5"><Label htmlFor="ops-desc">Description (optional)</Label><Textarea id="ops-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COMPANY = "company";

/** Links a plan to one event (only people with access to that event can read it), or back to company-wide. */
export function LinkEventDialog({ open, onOpenChange, doc, onMoved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doc: { id: string; title: string; storage_path: string; file_name: string; event_id: string | null }; onMoved: () => void;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const events = useQuery({
    queryKey: ["events-for-ops"],
    enabled: open,
    queryFn: async () => {
      const [ev, plans] = await Promise.all([
        supabase.from("events").select("id, name, proposed_date").order("proposed_date", { nullsFirst: false }),
        supabase.from("ops_documents").select("id, event_id").not("event_id", "is", null),
      ]);
      const taken = new Map((plans.data ?? []).map((p) => [p.event_id, p.id]));
      return (ev.data ?? []).map((e) => ({ ...e, taken: taken.has(e.id) && taken.get(e.id) !== doc.id }));
    },
  });
  useEffect(() => { if (open) setTarget(doc.event_id ?? COMPANY); }, [open, doc.event_id]);
  const current = doc.event_id ?? COMPANY;
  async function save() {
    setSaving(true);
    try {
      await assignOpsDocToEvent(doc, target === COMPANY ? null : target);
      toast.success(target === COMPANY ? "It's now a company-wide plan" : "Linked to the event");
      qc.invalidateQueries({ queryKey: ["ops-documents"] });
      qc.invalidateQueries({ queryKey: ["ops-search"] });
      onOpenChange(false);
      onMoved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{doc.event_id ? "Change the plan's event" : "Link to an event"}</DialogTitle>
          <DialogDescription>
            An event's operations plan can only be read by people who can see that event. Company-wide plans are readable by all staff. It stays in Operations plans either way.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ops-move-event">Plan belongs to</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="ops-move-event"><SelectValue placeholder="Choose an event" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={COMPANY}>Company-wide (all staff)</SelectItem>
              {(events.data ?? []).map((e) => <SelectItem key={e.id} value={e.id} disabled={e.taken}>{e.name}{e.taken ? " (already has a plan)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!target || target === current || saving}>{saving && <Loader2 className="size-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
