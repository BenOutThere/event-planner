import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Mail, UserCog, AlertTriangle, Eye } from "lucide-react";
import { ACCESS_INFO, GLOBAL_ROLE_INFO, type AccessLevel } from "@/lib/access";
import { toast } from "sonner";
import { OpsCategoriesCard } from "@/components/ops/categories-dialog";
import {
  inviteUserByEmail, setUserActive, assignUserToEvent, removeUserFromEvent, deleteUser,
  sendPasswordReset,
} from "@/lib/admin.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Admin — OTG Event Planner" },
      { name: "description", content: "Invite people, set roles, assign them to events and manage Operations plan categories." },
      { property: "og:title", content: "Admin — OTG Event Planner" },
      { property: "og:description", content: "Invite people, set roles, assign them to events and manage Operations plan categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsers,
});

// Wording for the database access rules (row-level security). Keep in sync with app_private.event_access().
const ROLE_RULES = (["admin", "lead", "member", "viewer", "supplier"] as const).map((r) => ({ role: GLOBAL_ROLE_INFO[r].label, text: GLOBAL_ROLE_INFO[r].description }));

const ROLES = ["admin", "lead", "member", "supplier", "viewer"] as const;
type Role = typeof ROLES[number];

function AdminUsers() {
  const { isAdmin, loading, user: currentUser } = useAuth();
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteUserByEmail);
  const setActiveFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUser);
  const resetFn = useServerFn(sendPasswordReset);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  const data = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: members }, { data: events }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
        supabase.from("event_members").select("*"),
        supabase.from("events").select("id, name").order("name"),
      ]);
      return {
        users: (profiles ?? []).map((p) => ({
          ...p,
          roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role),
          memberships: (members ?? []).filter((m) => m.user_id === p.id),
        })),
        events: events ?? [],
      };
    },
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  async function toggleRole(uid: string, role: Role, has: boolean) {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
      if (error) return toast.error(error.message);
    }
    invalidate();
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      const res = await inviteFn({
        data: { email, role: inviteRole },
      });
      toast.success(res?.alreadyHadLogin ? `${email} can now open Event Planner from the Control Centre` : `Invite sent to ${email}`);
      setInviteEmail("");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add this person");
    }
  }

  async function handleReset(email: string) {
    try {
      await resetFn({ data: { email } });
      toast.success(`Password link sent to ${email}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send password link");
    }
  }

  async function handleActive(uid: string, is_active: boolean) {
    try {
      await setActiveFn({ data: { user_id: uid, is_active } });
      toast.success(is_active ? "Event Planner access turned back on" : "Event Planner access turned off");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  }

  async function handleDelete(uid: string, label: string) {
    try {
      await deleteFn({ data: { user_id: uid } });
      toast.success(`Removed ${label} from Event Planner`);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't remove this person");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold">Admin</h1>
        <p className="text-muted-foreground mt-1">Add people, change roles, turn access off, and assign people to events. Everyone signs in through the Control Centre.</p>
      </div>

      <OpsCategoriesCard />

      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold">How access works</h3>
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Global role — what someone can do across the app</p>
            <dl className="space-y-1.5">
              {ROLE_RULES.map((r) => (
                <div key={r.role}><dt className="inline font-medium">{r.role}: </dt><dd className="inline text-muted-foreground">{r.text}</dd></div>
              ))}
            </dl>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Event assignment — access to one event</p>
            <dl className="space-y-1">
              {(["view", "edit", "manage"] as AccessLevel[]).map((l) => (
                <div key={l}><dt className="inline font-medium">{ACCESS_INFO[l].label}: </dt><dd className="inline text-muted-foreground">{ACCESS_INFO[l].description}</dd></div>
              ))}
            </dl>
            <p className="text-muted-foreground">An assignment never gives access to other events. External stakeholders see only events they're assigned to. Areas marked <em>Staff only</em> or <em>Managers only</em> stay hidden from people who don't qualify — including in search, downloads and history.</p>
            <p className="font-medium pt-2">Contacts aren't app users</p>
            <p className="text-muted-foreground">Names typed into an event's contact or team tables are information only — they don't give that person access. To give someone access, add them here.</p>
          </div>
        </div>
      </Card>

      <NeedsReview users={data.data?.users ?? []} events={data.data?.events ?? []} onChanged={invalidate} />

      <Card className="p-5 space-y-3">
        <h3 className="font-display font-semibold flex items-center gap-2"><Mail className="size-4" /> Add a person</h3>
        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-2">
          <Input
            type="email"
            placeholder="name@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{GLOBAL_ROLE_INFO[r].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleInvite}><Plus className="size-4" /> Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If they already have an OTG Control Centre login, they get the Event Planner tile straight away. If not, they get the Control Centre invite email to set a password.
        </p>
      </Card>

      <Card className="p-3 space-y-2">
        {(data.data?.users ?? []).map((u: any) => (
          <Accordion key={u.id} type="single" collapsible>
            <AccordionItem value={u.id} className="border-b last:border-b-0">
              <div className="flex items-center gap-3 px-2">
                <AccordionTrigger className="flex-1 hover:no-underline py-3">
                  <div className="flex-1 text-left">
                    <div className="font-medium flex items-center gap-2">
                      {u.display_name ?? u.email}
                      {u.is_active === false && <Badge variant="destructive" className="text-[10px]">Deactivated</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex gap-1 mr-3">
                    {u.roles.map((r: Role) => <Badge key={r} variant="outline">{GLOBAL_ROLE_INFO[r]?.label ?? r}</Badge>)}
                    {u.memberships.some((m: any) => m.needs_review) && <Badge variant="outline" className="border-warning/60 bg-warning/15">Check access</Badge>}
                  </div>
                </AccordionTrigger>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={u.is_active !== false}
                    onCheckedChange={(v) => handleActive(u.id, v)}
                  />
                  Active
                  {currentUser?.id !== u.id && (
                    <DeleteUserButton
                      label={u.display_name ?? u.email}
                      iconOnly
                      onConfirm={() => handleDelete(u.id, u.display_name ?? u.email)}
                    />
                  )}
                </div>
              </div>
              <AccordionContent className="pt-2 pb-4 px-2 space-y-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <UserCog className="size-3.5" /> Global roles
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <Button key={r} size="sm" variant={has ? "default" : "outline"} onClick={() => toggleRole(u.id, r, has)}>
                          {has ? "−" : "+"} {GLOBAL_ROLE_INFO[r].label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <EventAssignments
                  user={u}
                  events={data.data?.events ?? []}
                  onChanged={invalidate}
                />

                <EffectiveAccess userId={u.id} />

                {currentUser?.id !== u.id && (
                  <div className="pt-2 border-t flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Email this person a link to set a new OTG password (it opens the Control Centre).
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleReset(u.email)}>
                      <Mail className="size-4" /> Send password reset
                    </Button>
                  </div>
                )}

                {currentUser?.id !== u.id && (
                  <div className="pt-2 border-t flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Remove this person from Event Planner. Their OTG login, other apps and the history they recorded are kept.
                    </div>
                    <DeleteUserButton
                      label={u.display_name ?? u.email}
                      onConfirm={() => handleDelete(u.id, u.display_name ?? u.email)}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </Card>
    </div>
  );
}

function DeleteUserButton({
  label, onConfirm, iconOnly = false,
}: { label: string; onConfirm: () => void; iconOnly?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {iconOnly ? (
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remove ${label}`}>
            <Trash2 className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="destructive">
            <Trash2 className="size-4" /> Remove from Event Planner
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {label} from Event Planner?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes their Event Planner roles, event assignments and the
            Event Planner tile. Their OTG login and other apps are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NeedsReview({ users, events, onChanged }: { users: any[]; events: { id: string; name: string }[]; onChanged: () => void }) {
  const assignFn = useServerFn(assignUserToEvent);
  const flagged = users.flatMap((u) => u.memberships.filter((m: any) => m.needs_review).map((m: any) => ({ u, m })));
  if (!flagged.length) return null;
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? "Unknown event";
  async function set(u: any, m: any, level: AccessLevel) {
    try { await assignFn({ data: { user_id: u.id, event_id: m.event_id, access_level: level, role_on_event: m.role_on_event } }); toast.success("Access confirmed"); onChanged(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  return (
    <Card className="p-5 space-y-3 border-warning/50">
      <h3 className="font-display font-semibold flex items-center gap-2"><AlertTriangle className="size-4" /> Assignments to check ({flagged.length})</h3>
      <p className="text-sm text-muted-foreground">These assignments gave editing access automatically under the old rules. They still have that access. Choose the level each person should have.</p>
      <ul className="divide-y rounded-md border">
        {flagged.map(({ u, m }) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="flex-1 min-w-[12rem]"><strong>{u.display_name ?? u.email}</strong> on {eventName(m.event_id)} <span className="text-xs text-muted-foreground">· now {ACCESS_INFO[m.access_level as AccessLevel].label.toLowerCase()}</span></span>
            {(["view", "edit", "manage"] as AccessLevel[]).map((l) => (
              <Button key={l} size="sm" variant={m.access_level === l ? "default" : "outline"} onClick={() => set(u, m, l)}>{ACCESS_INFO[l].label}</Button>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EffectiveAccess({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["user-event-access", userId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("user_event_access", { _user_id: userId });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="size-3.5" /> What this person can see</div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show effective access"}</Button>
      </div>
      {open && (q.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
        (q.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground italic">No events. This person can't see any event.</p> : (
          <ul className="mt-1 space-y-1">
            {(q.data ?? []).map((r: any) => (
              <li key={r.event_id} className="flex flex-wrap items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-sm">
                <span className="flex-1 min-w-0">{r.event_name}</span>
                <Badge variant="secondary">{ACCESS_INFO[r.access as AccessLevel]?.label ?? r.access}</Badge>
                <span className="text-xs text-muted-foreground">{r.source}</span>
                {r.restricted_areas > 0 && <span className="text-xs text-muted-foreground">· {r.restricted_areas} restricted area{r.restricted_areas === 1 ? "" : "s"} hidden</span>}
              </li>
            ))}
          </ul>
        )
      ))}
    </div>
  );
}

function EventAssignments({
  user, events, onChanged,
}: { user: any; events: { id: string; name: string }[]; onChanged: () => void }) {
  const assignFn = useServerFn(assignUserToEvent);
  const removeFn = useServerFn(removeUserFromEvent);
  const [eventId, setEventId] = useState<string>("");
  const [level, setLevel] = useState<AccessLevel>("view");

  async function assign(evId = eventId, lvl = level, role?: string | null) {
    if (!evId) return;
    try {
      await assignFn({ data: { user_id: user.id, event_id: evId, access_level: lvl, role_on_event: role ?? null } });
      toast.success(`${ACCESS_INFO[lvl].label} saved`);
      setEventId("");
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }
  async function remove(evId: string) {
    try {
      await removeFn({ data: { user_id: user.id, event_id: evId } });
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? id;
  const available = events.filter((e) => !user.memberships.some((m: any) => m.event_id === e.id));

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">Event assignments</div>
      <div className="space-y-1 mb-3">
        {user.memberships.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Not assigned to any events.</p>
        ) : user.memberships.map((m: any) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 p-2 rounded bg-muted/40 text-sm">
            <span className="flex-1 min-w-0">{eventName(m.event_id)}</span>
            {m.needs_review && <Badge variant="outline" className="border-warning/60 bg-warning/15 text-[10px]">Check level</Badge>}
            <Select value={m.access_level} onValueChange={(v) => assign(m.event_id, v as AccessLevel, m.role_on_event)}>
              <SelectTrigger className="w-36 h-8" aria-label={`Access to ${eventName(m.event_id)}`}><SelectValue /></SelectTrigger>
              <SelectContent>{(["view", "edit", "manage"] as AccessLevel[]).map((l) => <SelectItem key={l} value={l}>{ACCESS_INFO[l].label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="icon" variant="ghost" onClick={() => remove(m.event_id)} aria-label={`Remove from ${eventName(m.event_id)}`}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_150px_auto] gap-2">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger aria-label="Event"><SelectValue placeholder="Pick an event…" /></SelectTrigger>
          <SelectContent>
            {available.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={(v) => setLevel(v as AccessLevel)}>
          <SelectTrigger aria-label="Access level"><SelectValue /></SelectTrigger>
          <SelectContent>{(["view", "edit", "manage"] as AccessLevel[]).map((l) => <SelectItem key={l} value={l}>{ACCESS_INFO[l].label}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => assign()} disabled={!eventId}><Plus className="size-4" /> Assign</Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{ACCESS_INFO[level].description}</p>
    </div>
  );
}
