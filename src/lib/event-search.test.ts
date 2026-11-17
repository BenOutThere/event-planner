import { describe, expect, it } from "vitest";
import { searchEvent, highlightParts } from "./event-search";
import { contactsFrom, quickAccess } from "./event-home";
import type { StructArea, StructField } from "./event-structure";

function field(key: string, label: string, kind: StructField["kind"], sectionId = "s1"): StructField {
  const ref = { section_id: sectionId, extra_section_id: null, field_key: key };
  return { id: key, key, label, kind, ref, refKey: `${sectionId}::${key}`, scope: "template" } as StructField;
}

const team = field("table_1", "Key team members", "table", "team");
const desc = field("marketing_event_description", "Marketing description", "text", "ov");
const schedule = field("event_master_schedule", "Event Master Schedule", "links", "sched");

const areas: StructArea[] = [
  { id: "ov", key: "overview", title: "Event Overview", navGroup: null, hasSubsections: false, sections: [{ id: "ov", title: "Event Overview", scope: "template", fields: [desc] }] },
  { id: "team", key: "key_roles_responsibilities", title: "Key Team Members", navGroup: "People & contacts", hasSubsections: false, sections: [{ id: "team", title: "Key Team Members", scope: "template", fields: [team] }] },
  { id: "sched", key: "event_master_schedule", title: "Event Master Schedule", navGroup: "Dates & schedule", hasSubsections: false, sections: [{ id: "sched", title: "Event Master Schedule", scope: "template", fields: [schedule] }] },
];

const values: Record<string, any> = {
  [team.refKey]: { value_table: { columns: ["Role", "Name", "Email"], rows: [["Event Manager", "Grace Prosser", "grace@outthere.com.au"], ["Camping Manager", "Clare Lawrence", "clare@outthere.com.au"], ["Ticketing Coordinator", "", ""]] } },
  [desc.refKey]: { value_text: "The biggest street machine festival in New Zealand." },
  [schedule.refKey]: { value_links: [{ id: "doc1", label: "Master schedule v3", url: "https://contoso.sharepoint.com/ms.xlsx" }] },
};
const get = (f: StructField) => values[f.refKey] ?? null;

describe("searchEvent", () => {
  it("finds a contact by name inside a table and points to the row", () => {
    const [hit] = searchEvent(areas, get, "clare");
    expect(hit.type).toBe("contact");
    expect(hit.row).toBe(1);
    expect(hit.snippet).toContain("Clare Lawrence");
  });
  it("finds a contact by responsibility", () => {
    const hits = searchEvent(areas, get, "camping manager");
    expect(hits[0].row).toBe(1);
    expect(hits[0].type).toBe("contact");
  });
  it("finds a document by its title and returns its id", () => {
    const [hit] = searchEvent(areas, get, "schedule v3");
    expect(hit.type).toBe("document");
    expect(hit.docId).toBe("doc1");
  });
  it("matches section names even without saved information", () => {
    const hits = searchEvent(areas, () => null, "key team");
    expect(hits).toHaveLength(1);
    expect(hits[0].matchedLabel).toBe(true);
  });
  it("requires every word to match", () => {
    expect(searchEvent(areas, get, "grace camping")).toHaveLength(0);
  });
});

describe("highlightParts", () => {
  it("marks matching words case-insensitively", () => {
    expect(highlightParts("Grace Prosser", ["grace"])).toEqual([{ text: "Grace", match: true }, { text: " Prosser", match: false }]);
  });
});

describe("Event Home", () => {
  it("lists contacts with a name, skipping template rows with no person", () => {
    const c = contactsFrom(areas, get);
    expect(c.map((x) => x.name)).toEqual(["Grace Prosser", "Clare Lawrence"]);
    expect(c[0].role).toBe("Event Manager");
    expect(c[0].email).toBe("grace@outthere.com.au");
  });
  it("shows the master schedule document and an honest empty state for the program", () => {
    const q = quickAccess(areas, get);
    expect(q.find((x) => x.key === "schedule")?.docs[0].title).toBe("Master schedule v3");
    const program = q.find((x) => x.key === "program")!;
    expect(program.area).toBeNull();
    expect(program.emptyLabel).toMatch(/isn't set up/);
  });
});
