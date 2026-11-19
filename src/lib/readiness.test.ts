import { describe, expect, it } from "vitest";
import { readiness, thresholds, todoBreakdown, todoCounts, todoItems } from "./readiness";
import type { StructArea, StructField } from "./event-structure";

const field = (key: string, kind: any, required = false): StructField => ({
  id: key, key, label: key, kind, is_required: required, allow_na: false,
  ref: { section_id: "s", extra_section_id: null, field_key: key }, refKey: `s::${key}`, scope: "template",
} as any);
const area = (id: string, fields: StructField[]): StructArea => ({
  id, key: id, title: id, navGroup: null, hasSubsections: false, sections: [{ id, title: id, scope: "template", fields } as any],
});

const base = (areas: StructArea[], values: Record<string, any> = {}) => ({
  areas, getValue: (f: StructField) => values[f.key] ?? null, meta: new Map(), today: "2027-01-01", areaUpdatedAt: () => null,
});

describe("todo items", () => {
  it("counts every kind and the breakdown agrees with the count", () => {
    const areas = [
      area("overview", [field("name", "text", true), field("email", "email")]),
      area("ops", []), area("marketing", []), area("scope", []), area("commercial", []),
    ];
    const items = todoItems(base(areas, { name: { value_text: "Summernats" }, email: { value_text: "azhar" } }));
    const c = todoCounts(items);
    expect(c).toEqual({ required: 0, review: 0, unconfigured: 4, contact: 1, dates: 0, total: 5 });
    expect(todoBreakdown(c)).toEqual(["4 areas not set up", "1 contact detail to check"]);
  });
  it("checks email and phone cells in tables", () => {
    const areas = [area("team", [field("team", "table")])];
    const items = todoItems(base(areas, { team: { value_table: { columns: ["Name", "Email", "Mobile"], rows: [["Clare", "clare", "0412 345 678"]] } } }));
    expect(items.map((i) => i.kind)).toEqual(["contact"]);
  });
});

describe("readiness", () => {
  it("weights required fields, areas set up and reviews", () => {
    const areas = [area("a", [field("x", "text", true), field("y", "text", true)]), area("b", [])];
    const r = readiness({ ...base(areas, { x: { value_text: "yes" } }), start: "2027-06-01" });
    // required 1/2 (50%), set up 1/2 (25%), reviews 1/1 (25%) => (.25 + .125 + .25) = 62.5 => 63
    expect(r.score).toBe(63);
    expect(r.daysToGo).toBe(151);
    expect(r.rag).toBe("green");
  });
  it("expects more as the event gets closer", () => {
    const areas = [area("a", [field("x", "text", true), field("y", "text", true)]), area("b", [])];
    const close = readiness({ ...base(areas, { x: { value_text: "yes" } }), start: "2027-01-04" });
    expect(close.daysToGo).toBe(3);
    expect(close.rag).toBe("red");
    expect(close.label).toBe("At risk");
  });
  it("doesn't grade events that are on or finished", () => {
    const areas = [area("a", [field("x", "text", true)])];
    expect(readiness({ ...base(areas), start: "2026-12-30", end: "2027-01-02" }).label).toBe("On now");
    expect(readiness({ ...base(areas), start: "2026-12-01", end: "2026-12-02" }).label).toBe("Finished");
  });
  it("has sensible thresholds", () => {
    expect(thresholds(3)).toEqual([90, 70]);
    expect(thresholds(400)).toEqual([25, 10]);
  });
});

describe("description dates", () => {
  it("adds a To do item when the description disagrees with the dates", () => {
    const areas = [area("overview", [field("event_start_date", "date"), field("event_end_date", "date"), field("marketing_event_description", "text")])];
    const values = { event_start_date: { value_text: "2027-02-24" }, event_end_date: { value_text: "2027-02-28" }, marketing_event_description: { value_text: "Summernats, February 26–28" } };
    const items = todoItems(base(areas, values));
    expect(items.map((i) => i.kind)).toEqual(["dates"]);
    const fixed = todoItems(base([area("overview", [...areas[0].sections[0].fields, field("public_start_date", "date"), field("public_end_date", "date")])],
      { ...values, public_start_date: { value_text: "2027-02-26" }, public_end_date: { value_text: "2027-02-28" } }));
    expect(fixed).toEqual([]);
  });
});
