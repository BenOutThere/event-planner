import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Building2, Globe, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDirectoryQuery } from "@/components/fields/directory-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { canReadOps } from "@/lib/operations";
import { emailProblem, phoneProblem } from "@/lib/contact-checks";
import type { DirectoryContact } from "@/lib/directory";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts & suppliers — OTG Event Planner" },
      { name: "description", content: "Shared directory of contacts and suppliers used across Out There Group events." },
    ],
  }),
  component: ContactsPage,
});

type Draft = Omit<DirectoryContact, "id" | "archived_at"> & { id?: string };
const EMPTY: Draft = { kind: "person", name: "", organisation: null, role_title: null, phone: null, email: null, website: null, notes: null };

function ContactsPage() {
  const { roles } = useAuth();
  const staff = canReadOps(roles);
  const { query, value } = useDirectoryQuery(staff);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "person" | "supplier">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DirectoryContact | null>(null);
  const { isAdmin } = useAuth();

  const all = query.data ?? [];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((c) => showArchived || !c.archived_at)
      .filter((c) => kind === "all" || c.kind === kind)
      .filter((c) => !needle || [c.name, c.organisation, c.role_title, c.phone, c.email, c.notes].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [all, q, kind, showArchived]);
  const archivedCount = all.filter((c) => c.archived_at).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["directory-contacts"] });

  async function save(d: Draft) {
    const { id, ...row } = d;
    const clean = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) as any;
    clean.name = d.name.trim();
    const { error } = id
      ? await supabase.from("directory_contacts").update(clean).eq("id", id)
      : await supabase.from("directory_contacts").insert(clean);
    if (error) return toast.error("Couldn't save. Only Admins, Leads and Members can change the directory.");
    toast.success(id ? "Saved" : `${clean.name} added`);
    setDraft(null);
    refresh();
  }
  async function setArchived(c: DirectoryContact, archived: boolean) {
    const { error } = await supabase.from("directory_contacts").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", c.id);
    if (error) return toast.error("Couldn't change it.");
    toast.success(archived ? `${c.name} archived. Events that use these details keep them.` : `${c.name} restored`);
    refresh();
  }
  async function remove(c: DirectoryContact) {
    const { error } = await supabase.from("directory_contacts").delete().eq("id", c.id);
    setConfirmDelete(null);
    if (error) return toast.error("Couldn't delete it. Only admins can.");
    toast.success(`${c.name} deleted from the directory`);
    refresh();
  }

  if (!staff) {
    return <div className="p-12 text-center text-muted-foreground">The contacts directory is for OTG staff.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">Contacts &amp; suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Type a person or company once and reuse them in any event. In an event's contact table, start typing a name or use <em>Fill from directory</em> on a row; you add their role for that event.
          </p>
        </div>
        {value.canEdit && <Button onClick={() => setDraft({ ...EMPTY })}><Plus className="size-4" /> Add</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem] max-w-md">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, phone…" aria-label="Search contacts" className="pl-9" />
        </div>
        <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as typeof kind)} aria-label="Show">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="person">People</ToggleGroupItem>
          <ToggleGroupItem value="supplier">Suppliers</ToggleGroupItem>
        </ToggleGroup>
        {archivedCount > 0 && (
          <div className="flex items-center gap-2">
            <Switch id="dir-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="dir-archived" className="text-sm font-normal">Show archived ({archivedCount})</Label>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div className="text-center py-12 text-muted-foreground" role="status">Loading the directory…</div>
      ) : query.error ? (
        <div className="text-center py-12 text-muted-foreground">The directory couldn't be loaded. Check your connection and refresh.</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-2">
          <h2 className="font-display font-semibold text-lg">{all.length ? "No one matches" : "The directory is empty"}</h2>
          {!all.length && <p className="text-sm text-muted-foreground">Add people and suppliers here, or use <em>Save to directory</em> on a row in any event's contact table.</p>}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id} className={cn("rounded-xl border bg-card p-4 space-y-2", c.archived_at && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {c.kind === "supplier" ? <Building2 className="size-4 text-muted-foreground shrink-0" aria-label="Supplier" /> : <UserRound className="size-4 text-muted-foreground shrink-0" aria-label="Person" />}
                    <h2 className="font-medium break-words">{c.name}</h2>
                    {c.archived_at && <span className="text-[11px] rounded border px-1.5 text-muted-foreground">Archived</span>}
                  </div>
                  {(c.role_title || c.organisation) && <p className="text-sm text-muted-foreground">{[c.role_title, c.organisation].filter(Boolean).join(", ")}</p>}
                </div>
                {value.canEdit && (
                  <div className="flex shrink-0">
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${c.name}`} onClick={() => setDraft({ ...c })}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" aria-label={c.archived_at ? `Restore ${c.name}` : `Archive ${c.name}`} onClick={() => setArchived(c, !c.archived_at)}>
                      {c.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    </Button>
                    {isAdmin && c.archived_at && (
                      <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Delete ${c.name}`} onClick={() => setConfirmDelete(c)}><Trash2 className="size-4" /></Button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-primary underline underline-offset-2 inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden /> {c.phone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="text-primary underline underline-offset-2 inline-flex items-center gap-1 break-all"><Mail className="size-3.5" aria-hidden /> {c.email}</a>}
                {c.website && <a href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-1 break-all"><Globe className="size-3.5" aria-hidden /> {c.website}</a>}
              </div>
              {c.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <EditDialog draft={draft} onClose={() => setDraft(null)} onSave={save} />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>This removes them from the directory for good. Details already copied into events stay in those events.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && remove(confirmDelete)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({ draft, onClose, onSave }: { draft: Draft | null; onClose: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [lastId, setLastId] = useState<string | undefined | null>(null);
  if (draft && (draft.id ?? "new") !== lastId) { setD(draft); setLastId(draft.id ?? "new"); }
  if (!draft && lastId !== null) setLastId(null);
  const set = (k: keyof Draft, v: string) => setD((cur) => ({ ...cur, [k]: v }));
  const person = d.kind === "person";
  const phoneErr = phoneProblem(d.phone);
  const emailErr = emailProblem(d.email);
  return (
    <Dialog open={!!draft} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft?.id ? `Edit ${draft.name}` : "Add to the directory"}</DialogTitle>
          <DialogDescription>Changes here don't alter details already copied into events.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (d.name.trim()) onSave(d); }}>
          <ToggleGroup type="single" variant="outline" value={d.kind} onValueChange={(v) => v && setD({ ...d, kind: v as Draft["kind"] })} aria-label="Type" className="justify-start">
            <ToggleGroupItem value="person"><UserRound className="size-4" /> Person</ToggleGroupItem>
            <ToggleGroupItem value="supplier"><Building2 className="size-4" /> Supplier</ToggleGroupItem>
          </ToggleGroup>
          <div className="space-y-1">
            <Label htmlFor="dc-name">{person ? "Full name" : "Company name"} <span className="text-destructive" aria-hidden>*</span></Label>
            <Input id="dc-name" value={d.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {person && (
              <div className="space-y-1">
                <Label htmlFor="dc-org">Company</Label>
                <Input id="dc-org" value={d.organisation ?? ""} onChange={(e) => set("organisation", e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="dc-role">{person ? "Usual role" : "What they supply"}</Label>
              <Input id="dc-role" value={d.role_title ?? ""} onChange={(e) => set("role_title", e.target.value)} placeholder={person ? "e.g. Security manager" : "e.g. Fencing and barriers"} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dc-phone">Phone</Label>
              <Input id="dc-phone" type="tel" value={d.phone ?? ""} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!phoneErr} />
              {phoneErr && <p className="text-xs text-destructive">{phoneErr}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dc-email">Email</Label>
              <Input id="dc-email" type="email" value={d.email ?? ""} onChange={(e) => set("email", e.target.value)} aria-invalid={!!emailErr} />
              {emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
            </div>
            {!person && (
              <div className="space-y-1">
                <Label htmlFor="dc-web">Website</Label>
                <Input id="dc-web" value={d.website ?? ""} onChange={(e) => set("website", e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="dc-notes">Notes</Label>
            <Textarea id="dc-notes" rows={2} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Account number, after-hours contact" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!d.name.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
