import { Home, FolderOpen, ListTodo, Lock, Clock, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { areaFields, type StructArea } from "@/lib/event-structure";
import { fieldState } from "@/lib/coverage";
import { reviewState, RESTRICTION_INFO } from "@/lib/currency";
import { collectDocuments } from "@/lib/documents";
import { useWorkspace, type WorkspaceSearch, type WorkspaceView } from "./context";
import { attentionItems } from "./attention-view";

export function currentSectionLabel(view: WorkspaceView, active: StructArea | null, search: WorkspaceSearch) {
  if (view === "search") return search.q ? `Results: ${search.q}` : "Search";
  if (view === "documents") return "Documents & links";
  if (view === "ops") return "Operations plan";
  if (view === "attention") return "To do";
  if (view === "area") return active?.title ?? "Section";
  return "Event Home";
}

export function groupAreas<T extends { area: StructArea }>(items: T[]) {
  const groups: Array<{ name: string | null; items: T[] }> = [];
  for (const s of items) {
    const name = s.area.navGroup ?? null;
    const last = groups[groups.length - 1];
    const existing = groups.find((g) => g.name === name);
    if (name && existing) existing.items.push(s);
    else if (!name && last && last.name === null) last.items.push(s);
    else groups.push({ name, items: [s] });
  }
  return groups;
}

function NavButton({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full min-h-10 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EventNav() {
  const w = useWorkspace();
  const { areas, search, go, openArea, canEdit, getValue, meta, areaPerms, today } = w;
  const view = search.view ?? (search.area ? "area" : "home");
  const docs = collectDocuments(areas, getValue).filter((d) => d.status !== "superseded").length;
  const attention = canEdit ? attentionItems(w).length : 0;

  const items = areas.map((area) => {
    const fields = areaFields(area);
    const missingRequired = canEdit ? fields.filter((f) => { const s = fieldState(f, getValue(f)); return s.required && !s.requirementMet; }).length : 0;
    const restricted = areaPerms?.get(area.id)?.restricted_to ?? null;
    const review = canEdit ? reviewState(meta.get(area.id), w.areaUpdated(area).at, today) : null;
    return { area, configured: fields.length > 0, missingRequired, restricted, needsReview: !!review?.needsReview };
  });
  const activeId = view === "area" ? areas.find((a) => a.id === search.area || a.key === search.area)?.id : null;

  return (
    <nav aria-label="Event sections" className="space-y-4">
      <ul className="space-y-0.5">
        <li>
          <NavButton active={view === "home"} onClick={() => go({ view: undefined, area: undefined, field: undefined, row: undefined, q: undefined, edit: undefined, doc: undefined })}>
            <Home className="size-4 shrink-0" aria-hidden /> <span className="flex-1 font-medium">Event Home</span>
          </NavButton>
        </li>
        <li>
          <NavButton active={view === "documents"} onClick={() => go({ view: "documents", area: undefined, field: undefined, q: undefined, edit: undefined })}>
            <FolderOpen className="size-4 shrink-0" aria-hidden /> <span className="flex-1">Documents &amp; links</span>
            <span className={cn("text-[11px] tabular-nums", view === "documents" ? "text-primary-foreground/80" : "text-muted-foreground")}>{docs}</span>
          </NavButton>
        </li>
        {canEdit && (
          <li>
            <NavButton active={view === "attention"} onClick={() => go({ view: "attention", area: undefined, field: undefined, q: undefined, edit: undefined })}>
              <ListTodo className="size-4 shrink-0" aria-hidden /> <span className="flex-1">To do</span>
              {attention > 0 && <span className={cn("text-[11px] tabular-nums rounded px-1", view === "attention" ? "bg-primary-foreground/20" : "bg-muted text-foreground")}>{attention}</span>}
            </NavButton>
          </li>
        )}
      </ul>

      {groupAreas(items).map((g, gi) => (
        <div key={`${g.name}-${gi}`}>
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.name ?? "Event"}</div>
          <ul className="space-y-0.5">
            {g.items.map(({ area, configured, missingRequired, restricted, needsReview }) => {
              const active = area.id === activeId;
              return (
                <li key={area.id}>
                  <NavButton active={active} onClick={() => openArea(area.id)}>
                    <span className="flex-1 min-w-0 leading-snug">{area.title}</span>
                    {restricted && (
                      <span title={RESTRICTION_INFO[restricted]?.label}><Lock className={cn("size-3.5", active ? "text-primary-foreground/80" : "text-muted-foreground")} aria-label={RESTRICTION_INFO[restricted]?.label} /></span>
                    )}
                    {canEdit && !configured && <span className={cn("text-[10px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>Not set up</span>}
                    {needsReview && <span title="Needs review"><Clock className={cn("size-3.5", active ? "text-primary-foreground/80" : "text-warning-foreground")} aria-label="Needs review" /></span>}
                    {missingRequired > 0 && (
                      <span className={cn("size-2 rounded-full shrink-0", active ? "bg-primary-foreground" : "bg-destructive")} title={`${missingRequired} required item${missingRequired === 1 ? "" : "s"} missing`}>
                        <span className="sr-only">{missingRequired} required missing</span>
                      </span>
                    )}
                  </NavButton>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {areas.length === 0 && <p className="px-2 text-sm text-muted-foreground">No event areas are set up yet.</p>}
    </nav>
  );
}
