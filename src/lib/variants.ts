// R11: template variants (decided 19 Nov 2026: two of them).
export type Variant = "major" | "smaller";

export const VARIANTS: Array<{ key: Variant; label: string; description: string }> = [
  { key: "major", label: "Major event", description: "Festivals and multi-day events. Includes every area." },
  { key: "smaller", label: "Smaller event", description: "One-day and regional events. Includes the areas an admin has chosen for smaller events." },
];

export const ALL_VARIANTS: Variant[] = VARIANTS.map((v) => v.key);

export function variantLabel(v: string | null | undefined): string {
  return VARIANTS.find((x) => x.key === v)?.label ?? VARIANTS[0].label;
}

/** Does an area belong in this event's variant? No list means every variant. */
export function areaInVariant(areaVariants: string[] | null | undefined, variant: string | null | undefined): boolean {
  if (!variant || !areaVariants || areaVariants.length === 0) return true;
  return areaVariants.includes(variant);
}
