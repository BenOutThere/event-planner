import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Tags, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Category = { id: string; name: string; sort_order: number };

/** Admin card for managing Operations plan categories (lives on the Admin page). */
export function OpsCategoriesCard() {
  const [open, setOpen] = useState(false);
  const cats = useQuery({
    queryKey: ["ops-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_categories").select("id, name, sort_order").order("sort_order").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
  const docs = useQuery({
    queryKey: ["ops-documents", "category-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select("category_id, sections");
      if (error) throw error;
      return (data ?? []) as Array<{ category_id: string | null; sections: Array<{ category_id?: string | null }> | null }>;
    },
  });
  const counts = new Map<string, number>();
  for (const d of docs.data ?? []) {
    const ids = new Set<string>();
    if (d.category_id) ids.add(d.category_id);
    for (const s of d.sections ?? []) if (s.category_id) ids.add(s.category_id);
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return (
    <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-display font-semibold">Operations plan categories</h3>
        <p className="text-sm text-muted-foreground">{cats.data ? `${cats.data.length} categories` : "Loading…"} used to group and filter Operations plans.</p>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}><Tags className="size-4" /> Manage categories</Button>
      <CategoriesDialog open={open} onOpenChange={setOpen} categories={cats.data ?? []} counts={counts} />
    </Card>
  );
}

export function CategoriesDialog({ open, onOpenChange, categories, counts }: { open: boolean; onOpenChange: (o: boolean) => void; categories: Category[]; counts: Map<string, number> }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ops-categories"] }); qc.invalidateQueries({ queryKey: ["ops-documents"] }); };
  const dupMsg = (m: string) => (/duplicate|unique/i.test(m) ? "A category with that name already exists." : "Couldn't save the category.");

  async function add() {
    const n = name.trim();
    if (!n) return;
    const max = Math.max(0, ...categories.map((c) => c.sort_order));
    const { error } = await supabase.from("ops_categories").insert({ name: n, sort_order: max + 1 });
    if (error) { toast.error(dupMsg(error.message)); return; }
    setName("");
    refresh();
  }
  async function rename(c: Category, next: string) {
    const n = next.trim();
    if (!n || n === c.name) return;
    const { error } = await supabase.from("ops_categories").update({ name: n }).eq("id", c.id);
    if (error) toast.error(dupMsg(error.message));
    refresh();
  }
  async function move(i: number, dir: -1 | 1) {
    const list = categories.slice();
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((c, k) => supabase.from("ops_categories").update({ sort_order: k + 1 }).eq("id", c.id)));
    refresh();
  }
  async function remove(c: Category) {
    const { error } = await supabase.from("ops_categories").delete().eq("id", c.id);
    if (error) toast.error("Couldn't delete the category.");
    setToDelete(null);
    refresh();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Categories</DialogTitle><DialogDescription>Group operations plans so people can browse them. Rename by editing a name.</DialogDescription></DialogHeader>
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {categories.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1">
                <Input defaultValue={c.name} key={`${c.id}-${c.name}`} aria-label={`Category name ${c.name}`} className="h-9"
                  onBlur={(e) => rename(c, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className="w-8 text-center text-xs text-muted-foreground tabular-nums" title="Plans in this category">{counts.get(c.id) ?? 0}</span>
                <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`}><ArrowUp className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" disabled={i === categories.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`}><ArrowDown className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setToDelete(c)} aria-label={`Delete ${c.name}`}><Trash2 className="size-4" /></Button>
              </li>
            ))}
            {categories.length === 0 && <li className="text-sm text-muted-foreground">No categories yet.</li>}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" aria-label="New category name" maxLength={80} />
            <Button type="submit" disabled={!name.trim()}><Plus className="size-4" /> Add</Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {(toDelete && counts.get(toDelete.id)) ? `Its ${counts.get(toDelete.id)} plan${counts.get(toDelete.id) === 1 ? "" : "s"} will no longer have a category. No plans are deleted.` : "No plans use this category."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep category</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove(toDelete)}>Delete category</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
