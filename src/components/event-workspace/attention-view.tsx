import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Info, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { areaFields, type StructArea, type StructField } from "@/lib/event-structure";
import { coverageOf, fieldState } from "@/lib/coverage";
import { reviewState } from "@/lib/currency";
import { useWorkspace, type WorkspaceCtx } from "./context";

export type AttentionItem =
  | { kind: "required"; area: StructArea; field: StructField; detail?: string }
  | { kind: "review"; area: StructArea; detail: string }
  | { kind: "unconfigured"; area: StructArea };

export function attentionItems(w: Pick<WorkspaceCtx, "areas" | "getValue" | "meta" | "today" | "areaUpdated">): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const area of w.areas) {
    const fields = areaFields(area);
    if (!fields.length) { out.push({ kind: "unconfigured", area }); continue; }
    for (const f of fields) {
      const s = fieldState(f, w.getValue(f));
      if (s.required && !s.requirementMet) out.push({ kind: "required", area, field: f, detail: s.detail });
    }
    const r = reviewState(w.meta.get(area.id), w.areaUpdated(area).at, w.today);
    if (r.needsReview) out.push({ kind: "review", area, detail: r.label });
  }
  return out;
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

  return (
    <section aria-labelledby="attention-title" className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="attention-title" className="text-xl font-display font-semibold">Needs attention</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Editor checklist for this event. Only people who can edit see this.</p>
        <div className="mt-3"><CoverageSummary /></div>
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
