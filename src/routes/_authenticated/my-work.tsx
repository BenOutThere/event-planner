import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Mail, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEventsOverview } from "@/hooks/use-events-overview";
import { formatAuRange } from "@/lib/dates";
import { daysToGoLabel, type TodoItem } from "@/lib/readiness";
import { myWork, openCount } from "@/lib/my-work";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-work")({
  head: () => ({
    meta: [
      { title: "My work — OTG Event Planner" },
      { name: "description", content: "The event areas you're responsible for, with reviews due and information still needed." },
    ],
  }),
  component: MyWorkPage,
});

function MyWorkPage() {
  const { user } = useAuth();
  const data = useEventsOverview();

  const events = useMemo(() => {
    if (!user || !data.data) return [];
    const { rows, names, today } = data.data;
    const myName = names.get(user.id) ?? null;
    return rows
      .filter((e) => e.stage !== "archived" && e.stage !== "completed" && !((e.end_date ?? e.proposed_date ?? "9999") < today))
      .map((e) => ({ e, work: myWork(e.input, e.items, { userId: user.id, myName, isLead: e.lead_user_id === user.id }) }))
      .filter((r) => r.work.areas.length || r.work.unowned)
      .sort((a, b) => (a.e.proposed_date ?? "9999").localeCompare(b.e.proposed_date ?? "9999"));
  }, [data.data, user]);

  const totals = events.reduce((t, { work }) => {
    for (const a of work.areas) {
      t.areas += 1;
      for (const i of a.items) {
        if (i.kind === "review") t.reviews += 1;
        else if (i.kind === "required") t.required += 1;
        else t.other += 1;
      }
    }
    return t;
  }, { areas: 0, reviews: 0, required: 0, other: 0 });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">My work</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The areas you're responsible for in upcoming events, and what's still open in them. Soonest event first.
        </p>
      </div>

      {data.isLoading ? (
        <div className="text-center py-12 text-muted-foreground" role="status">Loading your work…</div>
      ) : data.error ? (
        <div className="text-center py-12 text-muted-foreground">Your work couldn't be loaded. Check your connection and refresh.</div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-2">
          <h2 className="font-display font-semibold text-lg">Nothing assigned to you</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            When someone makes you responsible for an area of an upcoming event (in its area settings), it appears here with any reviews or information it needs.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm">
            {totals.areas === 0 ? "You're not responsible for any areas yet." : (
              <>
                <strong>{totals.areas}</strong> area{totals.areas === 1 ? "" : "s"}:{" "}
                {[
                  `${totals.reviews} review${totals.reviews === 1 ? "" : "s"} due`,
                  `${totals.required} required field${totals.required === 1 ? "" : "s"} missing`,
                  totals.other ? `${totals.other} other item${totals.other === 1 ? "" : "s"} to check` : null,
                ].filter(Boolean).join(", ")}.
              </>
            )}
          </p>
          <ul className="space-y-4">
            {events.map(({ e, work }) => (
              <li key={e.id} className="rounded-xl border bg-card">
                <div className="px-4 sm:px-5 py-3 border-b flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link to="/events/$id" params={{ id: e.id }} className="font-display font-semibold text-lg hover:underline underline-offset-4">{e.name}</Link>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden /> {formatAuRange(e.proposed_date, e.end_date)}
                    {daysToGoLabel(e.ready.daysToGo) && <> · <span className="font-medium text-foreground">{daysToGoLabel(e.ready.daysToGo)}</span></>}
                  </span>
                </div>
                <ul className="divide-y">
                  {work.areas.map(({ area, review, items }) => (
                    <li key={area.id} className="px-4 sm:px-5 py-3 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link to="/events/$id" params={{ id: e.id }} search={{ area: area.id }} className="font-medium hover:underline underline-offset-4">{area.title}</Link>
                        <span className={cn("text-xs", review.needsReview ? "text-destructive font-medium" : "text-muted-foreground")}>{review.label}</span>
                      </div>
                      {openCount({ areas: [{ area, review, items }], unowned: 0 }) === 0 ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-success" aria-hidden /> Nothing open in this area.</p>
                      ) : (
                        <ul className="space-y-1">
                          {items.filter((i) => i.kind !== "review").map((i, n) => <ItemRow key={n} eventId={e.id} item={i} />)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {work.unowned > 0 && (
                  <div className="px-4 sm:px-5 py-2.5 border-t text-xs text-muted-foreground flex items-center gap-1.5">
                    <UserRound className="size-3.5" aria-hidden />
                    You lead this event and {work.unowned} area{work.unowned === 1 ? " has" : "s have"} no one responsible.{" "}
                    <Link to="/events/$id" params={{ id: e.id }} className="underline underline-offset-2">Open the event</Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ItemRow({ eventId, item }: { eventId: string; item: TodoItem }) {
  if (item.kind === "unconfigured" || item.kind === "review") return null;
  const Icon = item.kind === "required" ? AlertTriangle : item.kind === "contact" ? Mail : Clock;
  const text = item.kind === "required" ? `${item.field.label}: information needed` : `${item.field.label}: ${item.detail}`;
  return (
    <li className="text-sm flex items-start gap-1.5">
      <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      <Link to="/events/$id" params={{ id: eventId }} search={{ area: item.area.id, field: item.field.refKey, edit: true, ...("row" in item && item.row !== undefined ? { row: item.row } : {}) }}
        className="hover:underline underline-offset-2 break-words">{text}</Link>
    </li>
  );
}
