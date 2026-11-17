import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ACCESS_INFO, GLOBAL_ROLE_INFO, type AccessLevel } from "@/lib/access";
import { useWorkspace } from "./context";

export function AccessDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWorkspace();
  const qc = useQueryClient();
  const [pick, setPick] = useState("");
  const [level, setLevel] = useState<AccessLevel>("view");
  const data = useQuery({
    queryKey: ["event-access", w.eventId],
    enabled: open,
    queryFn: async () => {
      const [m, p, r] = await Promise.all([
        supabase.from("event_members").select("*").eq("event_id", w.eventId),
        supabase.from("profiles").select("id, display_name, email, is_active"),
        w.isAdmin ? supabase.from("user_roles").select("user_id, role") : Promise.resolve({ data: [] as any[] }),
      ]);
      return { members: m.data ?? [], profiles: p.data ?? [], roles: (r as any).data ?? [] };
    },
  });
  const members = data.data?.members ?? [];
  const profiles = data.data?.profiles ?? [];
  const nameOf = (id: string) => { const p = profiles.find((x: any) => x.id === id); return (p ? (p.display_name?.trim() || p.email) : null) ?? "Unknown user"; };
  const rolesOf = (id: string) => (data.data?.roles ?? []).filter((r: any) => r.user_id === id).map((r: any) => r.role as string);
  const assignable = profiles.filter((p: any) => !members.some((m: any) => m.user_id === p.id) && p.id !== w.event.lead_user_id && p.id !== w.event.created_by);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["event-access", w.eventId] }); qc.invalidateQueries({ queryKey: ["admin-users"] }); };

  async function add() {
    if (!pick) return;
    const { error } = await supabase.from("event_members").insert({ event_id: w.eventId, user_id: pick, access_level: level, role_on_event: null });
    if (error) return toast.error(level === "manage" && !w.isAdmin ? "Only admins can give someone manage access." : "Couldn't add this person.");
    toast.success(`${nameOf(pick)} now ${ACCESS_INFO[level].label.toLowerCase()} this event`);
    setPick(""); refresh();
  }
  async function change(id: string, access_level: AccessLevel) {
    const { error } = await supabase.from("event_members").update({ access_level, needs_review: false, review_note: null }).eq("id", id);
    if (error) return toast.error(access_level === "manage" && !w.isAdmin ? "Only admins can give someone manage access." : "Couldn't change access.");
    refresh();
  }
  async function confirm(id: string) {
    const { error } = await supabase.from("event_members").update({ needs_review: false, review_note: null }).eq("id", id);
    if (error) return toast.error("Couldn't confirm.");
    refresh();
  }
  async function remove(id: string, name: string) {
    const { error } = await supabase.from("event_members").delete().eq("id", id);
    if (error) return toast.error("Couldn't remove access.");
    toast.success(`Removed ${name}'s assignment`);
    refresh();
  }

  const levels: AccessLevel[] = w.isAdmin ? ["view", "edit", "manage"] : ["view", "edit"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>People with access to {w.event.name}</DialogTitle>
          <DialogDescription>Assignments give someone a specific level for this event only. Restricted areas stay hidden from people who don't meet the area's rule.</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 text-muted-foreground">
          <p><strong className="text-foreground">Also able to see this event without an assignment:</strong> admins (manage every event), the event lead and the person who created it (manage), and everyone with a staff role — Lead, Member or Viewer (view).</p>
          <p>External stakeholders only see events they're assigned to. Names in contact tables are information only and never grant access.</p>
        </div>

        {data.isLoading ? <p className="text-sm text-muted-foreground" role="status">Loading who has access…</p> : (
        <div className="space-y-2 max-h-[45vh] overflow-y-auto">
          {[...new Set([w.event.lead_user_id, w.event.created_by].filter((v): v is string => !!v))].map((id) => (
            <div key={`implicit-${id}`} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 font-medium">{nameOf(id)}</span>
              <Badge variant="secondary">{id === w.event.lead_user_id ? "Event lead" : "Created the event"}</Badge>
              <span className="text-xs text-muted-foreground">{ACCESS_INFO.manage.label}</span>
            </div>
          ))}
          {members.length === 0 && <p className="text-sm text-muted-foreground px-1">No one is assigned to this event yet.</p>}
          {members.map((m: any) => {
            const name = nameOf(m.user_id);
            const roles = rolesOf(m.user_id);
            const managerLocked = !w.isAdmin && m.access_level === "manage";
            return (
              <div key={m.id} className="rounded-md border px-3 py-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 font-medium">{name}{roles.length ? <span className="text-xs font-normal text-muted-foreground"> · {roles.map((r: string) => GLOBAL_ROLE_INFO[r]?.label ?? r).join(", ")}</span> : null}</span>
                  <Select value={m.access_level} onValueChange={(v) => change(m.id, v as AccessLevel)} disabled={managerLocked}>
                    <SelectTrigger className="w-36 h-8" aria-label={`Access level for ${name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{(managerLocked ? ["manage" as AccessLevel] : levels).map((l) => <SelectItem key={l} value={l}>{ACCESS_INFO[l].label}</SelectItem>)}</SelectContent>
                  </Select>
                  {!managerLocked && <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove ${name}`} onClick={() => remove(m.id, name)}><Trash2 className="size-4" /></Button>}
                </div>
                {m.needs_review && (
                  <div className="flex flex-wrap items-center gap-2 rounded bg-warning/15 border border-warning/40 px-2 py-1.5 text-xs">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    <span className="flex-1 min-w-[12rem]">{m.review_note ?? "Please confirm this person's access level."}</span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => confirm(m.id)}>Keep {ACCESS_INFO[m.access_level as AccessLevel].label.toLowerCase()}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Assign someone</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger aria-label="Person"><SelectValue placeholder="Choose a person…" /></SelectTrigger>
              <SelectContent>{assignable.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.display_name?.trim() || p.email}{p.is_active === false ? " (deactivated)" : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={level} onValueChange={(v) => setLevel(v as AccessLevel)}>
              <SelectTrigger aria-label="Access level"><SelectValue /></SelectTrigger>
              <SelectContent>{levels.map((l) => <SelectItem key={l} value={l}>{ACCESS_INFO[l].label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={add} disabled={!pick}><Plus className="size-4" /> Assign</Button>
          </div>
          <p className="text-xs text-muted-foreground">{ACCESS_INFO[level].description}</p>
          {w.isAdmin && <p className="text-xs text-muted-foreground">To invite someone new, use <Link to="/admin/users" className="underline underline-offset-2">Admin</Link>.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
