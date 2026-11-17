import type { Database } from "@/integrations/supabase/types";

export type EventStage = Database["eventplanner"]["Enums"]["event_stage"];

export const STAGE_ORDER: EventStage[] = ["draft", "in_planning", "confirmed", "delivery_ready", "completed"];

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
  completed: {
    label: "Completed",
    description: "The event has finished.",
    tone: "bg-secondary text-secondary-foreground border-border",
  },
};
