// Optional starter fields an admin can adopt for common areas. Nothing is added
// automatically; adopting them adds empty fields to the shared template only.

import type { FieldKind } from "@/lib/coverage";

export type Starter = { label: string; kind: FieldKind; why: string };

const SETS: Array<{ match: RegExp; fields: Starter[] }> = [
  { match: /operations|site/i, fields: [
    { label: "Site map", kind: "files", why: "Upload the current site or floor plan." },
    { label: "Site access & parking", kind: "text", why: "Gates, deliveries, staff and public parking." },
    { label: "Accreditation & wristbands", kind: "text", why: "Who needs what pass, and where to collect it." },
    { label: "Power & water", kind: "text", why: "Supply points, generators, outlets." },
    { label: "Waste & cleaning", kind: "text", why: "Bins, contractors, schedules." },
  ] },
  { match: /marketing|comms|communication/i, fields: [
    { label: "Key messages", kind: "text", why: "What every department should say about the event." },
    { label: "Brand & media assets", kind: "links", why: "Logos, photos and templates." },
    { label: "Campaign timeline", kind: "text", why: "Announcements and on-sale milestones." },
  ] },
  { match: /commercial|sponsor/i, fields: [
    { label: "Sponsors & partners", kind: "text", why: "Who's involved and their key entitlements." },
    { label: "Commercial agreements", kind: "links", why: "Links to signed agreements (consider restricting this area)." },
    { label: "Merchandise", kind: "text", why: "Range, suppliers and selling points." },
  ] },
  { match: /scope/i, fields: [
    { label: "In scope", kind: "text", why: "What this event includes." },
    { label: "Out of scope", kind: "text", why: "What it doesn't, to avoid assumptions." },
  ] },
  { match: /audience/i, fields: [
    { label: "Target audience", kind: "text", why: "Who the event is for." },
    { label: "Expected attendance", kind: "text", why: "Spectators, entrants, crew." },
  ] },
  { match: /event dates|^dates/i, fields: [
    { label: "Public event dates", kind: "text", why: "Days open to the public or on sale, if different from the event start and end dates." },
  ] },
];

export function startersFor(title: string, existingLabels: string[]): Starter[] {
  const have = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  const set = SETS.find((s) => s.match.test(title));
  return (set?.fields ?? []).filter((f) => !have.has(f.label.toLowerCase()));
}
