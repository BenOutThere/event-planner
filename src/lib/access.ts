// Event access, as enforced by the database (row-level security and storage rules).
// The app reads each person's effective access from `my_event_access()` rather
// than re-implementing the rules in the browser.

export type AccessLevel = "view" | "edit" | "manage";

export const ACCESS_INFO: Record<AccessLevel, { label: string; description: string }> = {
  view: { label: "Can view", description: "Reads the event's information, documents and links. Can't change anything." },
  edit: { label: "Can edit", description: "Also adds and updates information, files and links in areas they can see, and marks areas reviewed." },
  manage: { label: "Can manage", description: "Also changes status, responsible people, pins and who has access to this event." },
};

export const ACCESS_ORDER: AccessLevel[] = ["view", "edit", "manage"];

export function canEditLevel(a: AccessLevel | null | undefined) {
  return a === "edit" || a === "manage";
}

/** Global roles. "supplier" is shown as External stakeholder. */
export const GLOBAL_ROLE_INFO: Record<string, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Manages every event, the shared template and users. Sees every area." },
  lead: { label: "Lead (staff)", description: "Everything a Member can do, plus manages the Operations plans library and its categories." },
  member: { label: "Member (staff)", description: "Views every event and creates events. Manages events they lead or created; edits others only where assigned. Can't manage the Operations plans library." },
  viewer: { label: "Viewer (staff)", description: "Views every event, including staff-only areas. Can't create events. Edits only where assigned with Can edit." },
  supplier: { label: "External stakeholder", description: "Sees only the events they're assigned to, at the assigned level. Never sees staff-only or manager-only areas." },
};
