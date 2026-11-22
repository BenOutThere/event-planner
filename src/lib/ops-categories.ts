// R19: eight main categories for operations plans (decided 19 Nov 2026).
// Older, more detailed categories are grouped under one of them; they're kept
// because large plans use them as section names.

export const MAIN_CATEGORIES = ["Safety", "Medical", "Traffic", "Site", "Competition", "Security", "Comms", "SOP"] as const;
export type MainCategory = (typeof MAIN_CATEGORIES)[number];

export type OpsCategory = { id: string; name: string; sort_order: number; is_main?: boolean | null; main_category_id?: string | null };

// Checked in this order; the first match wins. Anything else is a standard procedure (SOP).
const RULES: Array<[MainCategory, RegExp]> = [
  ["Medical", /medic|first aid|health|ambulance|paramedic|injur|hospital|drug|alcohol|welfare|wellbeing/i],
  ["Security", /secur|crowd|guard|police|access control|accredit|wristband|cash|ticket check|gate|prohibited/i],
  ["Traffic", /traffic|parking|road|transport|shuttle|\bbus|vehicle movement|pedestrian|car park/i],
  ["Competition", /competi|burnout|judg|award|entrant|race|racing|track|drag|cruise|shine|elite|scrutin|motorkhana|pit/i],
  ["Comms", /comm(s|unication)|radio|media|marketing|signage|\bpa\b|announc|social|channel|stakeholder|call ?sign/i],
  ["Safety", /safe|emergenc|evacuat|risk|fire|weather|incident|whs|hazard|lost (child|person)|heat|lightning|storm|spill|chemical/i],
  ["Site", /site|venue|layout|bump|infrastructure|power|water|waste|clean|camp|facilit|toilet|map|build|overlay|lighting/i],
];

export function suggestMain(name: string): MainCategory {
  const text = name.replace(/^\s*\d+[A-Z]?\s*/, "");
  for (const [main, re] of RULES) if (re.test(text)) return main;
  return "SOP";
}

/** The category a plan or section is filed under: its main category once grouped, otherwise itself. */
export function resolveCategory(id: string | null | undefined, byId: Map<string, OpsCategory>): string | null {
  if (!id) return null;
  const c = byId.get(id);
  if (!c) return null;
  return c.is_main ? c.id : c.main_category_id ?? c.id;
}

/** Categories shown in filters and pickers: the main ones, plus any not grouped yet. */
export function visibleCategories(all: OpsCategory[]): OpsCategory[] {
  const main = all.filter((c) => c.is_main).sort((a, b) => MAIN_CATEGORIES.indexOf(a.name as MainCategory) - MAIN_CATEGORIES.indexOf(b.name as MainCategory));
  const rest = all.filter((c) => !c.is_main && !c.main_category_id);
  return [...main, ...rest];
}
