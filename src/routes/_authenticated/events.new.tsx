import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/fields/date-field";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { checkDateSequence } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/events/new")({
  head: () => ({
    meta: [
      { title: "New event — OTG Event Planner" },
      { name: "description", content: "Create a new event plan with its name, venue and dates." },
      { property: "og:title", content: "New event — OTG Event Planner" },
      { property: "og:description", content: "Create a new event plan with its name, venue and dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewEvent,
});

function NewEvent() {
  const { user, roles, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  // One id per form: retries and double-clicks can never create a second event.
  const eventId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);

  const canCreate = isAdmin || roles.includes("lead") || roles.includes("member");
  const nameError = touched && !name.trim() ? "Enter the event name" : touched && /^untitled( event)?$/i.test(name.trim()) ? "Give the event its real name" : null;
  const startError = touched && !start ? "Enter the start date (a best guess is fine; you can change it later)" : null;
  const dateWarnings = checkDateSequence({ event_start_date: start, event_end_date: end });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || /^untitled( event)?$/i.test(name.trim()) || !start || !user || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const id = eventId.current;
    try {
      const { error } = await supabase.from("events").insert({
        id,
        name: name.trim(),
        location: venue.trim() || null,
        venue: venue.trim() || null,
        proposed_date: start,
        end_date: end,
        lead_user_id: user.id,
        created_by: user.id,
        stage: "draft",
      });
      // 23505 = already created by an earlier attempt of this same form.
      if (error && (error as any).code !== "23505") throw error;

      // Record the same details in Event Overview so they appear in the event.
      const { data: tpl } = await supabase.from("template_fields").select("section_id, key, label, kind")
        .in("key", ["event_name", "venue_name", "event_start_date", "event_end_date"]).is("archived_at", null);
      const valueFor: Record<string, string | null> = {
        event_name: name.trim(), venue_name: venue.trim() || null, event_start_date: start, event_end_date: end,
      };
      const rows = (tpl ?? [])
        .filter((f) => valueFor[f.key])
        .map((f) => ({ event_id: id, section_id: f.section_id, field_key: f.key, label: f.label, kind: f.kind, value_text: valueFor[f.key] }));
      if (rows.length) {
        await supabase.from("event_field_values").upsert(rows as any, { onConflict: "event_id,section_id,field_key", ignoreDuplicates: true });
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["events-count"] });
      toast.success("Event created");
      navigate({ to: "/events/$id", params: { id }, search: {}, replace: true });
    } catch (err: any) {
      inFlight.current = false;
      setBusy(false);
      toast.error(/row-level security/i.test(err?.message ?? "") ? "You don't have permission to create events." : err?.message ?? "Couldn't create the event. Try again.");
    }
  }

  if (!canCreate) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-display font-semibold">New event</h1>
        <p className="text-muted-foreground mt-2">Your account can view events but not create them. Ask an admin if you need to create events.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/dashboard">Back to events</Link></Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-3.5" aria-hidden /> All events
      </Link>
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">New event</h1>
        <p className="text-sm text-muted-foreground mt-1">Start with the basics. You can add everything else inside the event.</p>
      </div>

      <form onSubmit={create} className="rounded-xl border bg-card p-5 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="ev-name">Event name <span className="text-destructive" aria-hidden>*</span></Label>
          <Input id="ev-name" value={name} autoFocus required aria-invalid={!!nameError} aria-describedby={nameError ? "ev-name-err" : undefined}
            onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="e.g. Summernats 39" />
          {nameError && <p id="ev-name-err" className="text-xs text-destructive">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-venue">Venue or location <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="ev-venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Exhibition Park in Canberra" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-start">Event start date <span className="text-destructive" aria-hidden>*</span></Label>
            <DateField id="ev-start" ariaLabel="Event start date" value={start} onChange={setStart} />
            {startError && <p className="text-xs text-destructive">{startError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-end">Event end date <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <DateField id="ev-end" ariaLabel="Event end date" value={end} onChange={setEnd} />
          </div>
        </div>
        {dateWarnings.length > 0 && (
          <p className="text-xs rounded-md border border-warning/50 bg-warning/15 px-3 py-2 flex items-start gap-1.5" role="alert">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden /> {dateWarnings[0]} You can still create the event.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => navigate({ to: "/dashboard" })}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Creating…</> : "Create event"}
          </Button>
        </div>
      </form>
    </div>
  );
}
