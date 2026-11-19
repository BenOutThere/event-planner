import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Info, ListTodo, Mail, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { areaFields } from "@/lib/event-structure";
import { coverageOf } from "@/lib/coverage";
import { daysToGoLabel, RAG_INFO, readiness, todoBreakdown, todoCounts, todoItems, type TodoItem } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspaceCtx } from "./context";

export type AttentionItem = TodoItem;

/** Everything on the event's To do list (see src/lib/readiness.ts). */
export function attentionItems(w: Pick<WorkspaceCtx, "areas" | "getValue" | "meta" | "today" | "areaUpdated">): AttentionItem[] {
  return todoItems({ areas: w.areas, getValue: w.getValue, meta: w.meta, today: w.today, areaUpdatedAt: (a) => w.areaUpdated(a).at });
}

/** Readiness for this event, from the same items as the To do list. */
export function useReadiness() {
  const w = useWorkspace();
  return readiness({
    areas: w.areas, getValue: w.getValue, meta: w.meta, today: w.today, areaUpdatedAt: (a) => w.areaUpdated(a).at,
    start: w.event.proposed_date, end: w.event.end_date, stage: w.event.stage,
  });
}

export function ReadinessSummary({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace();
  const r = useReadiness();
  const counts = todoCounts(attentionItems(w));
  const days = daysToGoLabel(r.daysToGo);
  const { required, setUp, reviews } = r.parts;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">Readiness {r.score ?? 0}%</span>
        <span className={cn("rounded border px-1.5 py-px text-[11px] font-medium", RAG_INFO[r.rag].tone)}>{r.label}</span>
        {days && <span className="text-xs text-muted-foreground">{days}</span>}
        <Progress value={r.score ?? 0} className={cn("h-1.5 w-32", RAG_INFO[r.rag].bar)} aria-label={`Readiness ${r.score ?? 0}%`} />
      </div>
      <ul className="text-xs text-muted-foreground space-y-0.5">
        <li>Required fields with information: {required.total ? `${required.met} of ${required.total}` : "none set as required"}</li>
        <li>Areas set up: {setUp.done} of {setUp.total}</li>
        <li>Areas with reviews up to date: {reviews.current} of {reviews.total}</li>
      </ul>
      <p className="text-xs flex items-start gap-1.5">
        {counts.total === 0
          ? <><CheckCircle2 className="size-3.5 text-success mt-px shrink-0" aria-hidden /> Nothing on the To do list.</>
          : <><ListTodo className="size-3.5 mt-px shrink-0" aria-hidden /> {counts.total} to do: {todoBreakdown(counts).join(", ")}.</>}
      </p>
      {!compact && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><Info className="size-3.5 mt-px shrink-0" aria-hidden />
          Readiness weighs required information (half), areas set up (a quarter) and up-to-date reviews (a quarter), and expects more as the event gets closer. It never changes the event status.</p>
      )}
    </div>
  );
}

export function CoverageSummary({ compact = false }: { compact?: boolean }) {
  const w = useWorkspace();
  const overall = coverageOf(w.areas.flatMap((a) => areaFields(a).map((def) => ({ def, value: w.getValue(def) }))));
  if (!overall.configured) return null;
  const missing = overall.requiredTotal - overall.requiredMet;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">Planning coverage {overall.pct ?? 0}%</span>
        <span className="text-xs text-muted-foreground">{overall.entered} of {overall.total} fields have information entered</span>
        <Progress value={overall.pct ?? 0} className="h-1.5 w-32" aria-label="Planning coverage" />
      </div>
      {overall.requiredTotal > 0 && (missing === 0 ? (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><CheckCircle2 className="size-3.5 text-success mt-px shrink-0" aria-hidden />
          All configured required fields have information. This doesn't mean the event information is complete, checked or operationally ready.</p>
      ) : (
        <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="size-3.5" aria-hidden /> {missing} configured required field{missing === 1 ? "" : "s"} still need information.</p>
      ))}
      {!compact && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><Info className="size-3.5 mt-px shrink-0" aria-hidden />
          Coverage only counts what's been written down. Fields marked not applicable, template labels and empty rows don't count. It never changes the event status or review status.</p>
      )}
    </div>
  );
}

export function AttentionView() {
  const w = useWorkspace();
  const items = attentionItems(w);
  const required = items.filter((i) => i.kind === "required") as Extract<AttentionItem, { kind: "required" }>[];
  const reviews = items.filter((i) => i.kind === "review") as Extract<AttentionItem, { kind: "review" }>[];
  const unconfigured = items.filter((i) => i.kind === "unconfigured");
  const contacts = items.filter((i) => i.kind === "contact") as Extract<AttentionItem, { kind: "contact" }>[];
  const dates = items.filter((i) => i.kind === "dates") as Extract<AttentionItem, { kind: "dates" }>[];

  return (
    <section aria-labelledby="attention-title" className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="attention-title" className="text-xl font-display font-semibold">To do</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Everything still open for this event. Only people who can edit see this.</p>
        <div className="mt-3"><ReadinessSummary /></div>
        <div className="mt-3 pt-3 border-t"><CoverageSummary compact /></div>
      </div>

      <Group title="Required information missing" icon={AlertTriangle} count={required.length} empty="Every configured required field has information.">
        {required.map((i) => (
          <Row key={i.field.refKey} title={i.field.label} sub={`${i.area.title}${i.detail ? ` · ${i.detail}` : ""}`}
            action={<Button size="sm" variant="outline" onClick={() => w.openArea(i.area.id, { field: i.field.refKey, edit: true })}>Add information</Button>} />
        ))}
      </Group>

      <Group title="Reviews due or out of date" icon={Clock} count={reviews.length} empty="No areas are overdue for review or changed since their last review.">
        {reviews.map((i) => (
          <Row key={i.area.id} title={i.area.title} sub={i.detail}
            action={<Button size="sm" variant="outline" onClick={() => w.openArea(i.area.id)}>Open to review</Button>} />
        ))}
      </Group>

      {dates.length > 0 && (
        <Group title="Dates to check" icon={CalendarDays} count={dates.length} empty="">
          {dates.map((i, n) => (
            <Row key={`dates-${n}`} title={i.field.label} sub={i.detail}
              action={<Button size="sm" variant="outline" onClick={() => w.go({ view: undefined, area: undefined, field: undefined })}>See dates</Button>} />
          ))}
        </Group>
      )}

      <Group title="Contact details to check" icon={Mail} count={contacts.length} empty="Every email address and phone number looks right.">
        {contacts.map((i, n) => (
          <Row key={`${i.field.refKey}-${i.row ?? "f"}-${n}`} title={i.field.label} sub={`${i.area.title} · ${i.detail}`}
            action={<Button size="sm" variant="outline" onClick={() => w.openArea(i.area.id, { field: i.field.refKey, row: i.row, edit: true })}>Fix</Button>} />
        ))}
      </Group>

      <Group title="Areas not set up yet" icon={Wrench} count={unconfigured.length} empty="Every area has at least one field.">
        {unconfigured.map((i) => (
          <Row key={i.area.id} title={i.area.title} sub="No fields have been added to this area."
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => w.openStructure(i.area)}>Add a field for this event</Button>
                {w.isAdmin && <Button asChild size="sm" variant="ghost"><Link to="/admin/templates"><Settings2 className="size-3.5" /> Template builder</Link></Button>}
              </div>
            } />
        ))}
      </Group>
    </section>
  );
}

function Group({ title, icon: Icon, count, empty, children }: { title: string; icon: React.ComponentType<{ className?: string }>; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card">
      <h3 className="px-4 sm:px-5 py-3 border-b font-display font-semibold flex items-center gap-2 text-base">
        <Icon className="size-4 text-muted-foreground" /> {title} <span className="text-xs font-normal text-muted-foreground">({count})</span>
      </h3>
      {count === 0 ? <p className="px-4 sm:px-5 py-4 text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y">{children}</ul>}
    </div>
  );
}

function Row({ title, sub, action }: { title: string; sub: string; action: React.ReactNode }) {
  return (
    <li className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0"><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground">{sub}</div></div>
      {action}
    </li>
  );
}
