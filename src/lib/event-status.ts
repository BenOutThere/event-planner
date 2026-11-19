import type { Database } from "@/integrations/supabase/types";

export type EventStage = Database["eventplanner"]["Enums"]["event_stage"];

/** The order an event moves through. Archived is reached only from Completed (⋯ → Archive event). */
export const STAGE_ORDER: EventStage[] = ["draft", "in_planning", "confirmed", "delivery_ready", "live", "completed", "archived"];

/** Statuses offered in "Change status". Archiving and restoring have their own actions. */
export const SETTABLE_STAGES: EventStage[] = STAGE_ORDER.filter((s) => s !== "archived");

/** Event lifecycle status. Set by people, never derived from planning coverage. */
export const STAGE_INFO: Record<EventStage, { label: string; description: string; tone: string }> = {
  draft: {
    label: "Draft",
    description: "Newly created. Key details are still being gathered and the event isn't confirmed yet.",
    tone: "bg-muted text-foreground border-border",
  },
  in_planning: {
    label: "In planning",
    description: "The event is going ahead in principle and planning is underway.",
    tone: "bg-info/15 text-foreground border-info/40",
  },
  confirmed: {
    label: "Confirmed",
    description: "The event is confirmed (dates, venue and approvals agreed by the event lead).",
    tone: "bg-accent/15 text-foreground border-accent/40",
  },
  delivery_ready: {
    label: "Delivery ready",
    description: "The event lead has signed off that planning is ready for delivery.",
    tone: "bg-success/15 text-foreground border-success/40",
  },
  live: {
    label: "Live",
    description: "The event is happening now (from bump-in to bump-out).",
    tone: "bg-primary/15 text-foreground border-primary/40",
  },
  completed: {
    label: "Completed",
    description: "The event has finished and wrap-up is underway (debriefs, final documents). Once wrap-up is done, it can be archived.",
    tone: "bg-secondary text-secondary-foreground border-border",
  },
  archived: {
    label: "Archived",
    description: "The event is finished and filed away. Everything is kept and can be read, but nothing can be changed until someone who manages it restores it.",
    tone: "bg-muted text-muted-foreground border-border",
  },
};

export function stageIndex(s: EventStage) {
  return STAGE_ORDER.indexOf(s);
}

/** Days after the event ends before archiving is suggested. */
export const ARCHIVE_PROMPT_DAYS = 30;

export type StagePrompt = { to: EventStage; message: string; action: string };

/**
 * A gentle, date-based suggestion for the next status. Never changes the
 * status itself: people who manage the event decide. `today`, `start` and
 * `end` are "YYYY-MM-DD" strings (compared as text, so no timezone shifts).
 */
export function stagePrompt(stage: EventStage, start: string | null | undefined, end: string | null | undefined, today: string): StagePrompt | null {
  const s = start?.slice(0, 10) || null;
  const e = end?.slice(0, 10) || s;
  if (!s || stage === "archived") return null;
  const i = stageIndex(stage);
  if (e && today > e) {
    if (i < stageIndex("completed")) return { to: "completed", message: "This event's dates have passed.", action: "Mark as Completed" };
    if (stage === "completed" && daysBetween(e, today) >= ARCHIVE_PROMPT_DAYS)
      return { to: "archived", message: `This event finished more than ${ARCHIVE_PROMPT_DAYS} days ago.`, action: "Archive event" };
    return null;
  }
  if (today >= s && (!e || today <= e) && i < stageIndex("live")) return { to: "live", message: "This event is on now.", action: "Mark as Live" };
  if (today < s && stage === "draft" && daysBetween(today, s) <= 90)
    return { to: "in_planning", message: `This event starts in ${daysBetween(today, s)} days and is still a draft.`, action: "Mark as In planning" };
  return null;
}

function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
