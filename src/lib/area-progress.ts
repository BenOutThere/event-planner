// R14: a one-glance completion state for each area in the event side menu.
import type { Coverage } from "@/lib/coverage";

export type AreaProgress = { state: "missing" | "empty" | "partial" | "complete" | "none"; label: string };

export function areaProgress(c: Coverage): AreaProgress {
  if (!c.configured || c.total === 0) return { state: "none", label: c.configured ? "All fields marked not applicable" : "Not set up" };
  const missing = c.requiredTotal - c.requiredMet;
  const base = `${c.entered} of ${c.total} fields have information`;
  if (missing > 0) return { state: "missing", label: `${base}; ${missing} required missing` };
  if (c.entered === 0) return { state: "empty", label: base };
  if (c.entered < c.total) return { state: "partial", label: base };
  return { state: "complete", label: "Every field has information" };
}
