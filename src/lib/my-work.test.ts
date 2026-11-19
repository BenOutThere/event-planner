import { describe, expect, it } from "vitest";
import { isResponsible, myWork, openCount } from "./my-work";
import type { StructArea } from "./event-structure";

const area = (id: string, fields: any[] = []): StructArea =>
  ({ id, key: id, title: id, navGroup: null, sections: [{ id, key: id, title: id, fields }] } as any);
const field = (key: string, required = false) => ({ key, refKey: `${key}`, label: key, kind: "text", required } as any);

describe("isResponsible", () => {
  it("matches a picked person, or an older typed name", () => {
    expect(isResponsible({ area_id: "a", responsible_user_id: "u1" }, "u1", null)).toBe(true);
    expect(isResponsible({ area_id: "a", responsible_user_id: "u2", responsible_name: "Ben" }, "u1", "Ben")).toBe(false);
    expect(isResponsible({ area_id: "a", responsible_name: " ben smith " }, "u1", "Ben Smith")).toBe(true);
    expect(isResponsible(undefined, "u1", "Ben")).toBe(false);
  });
});

describe("myWork", () => {
  const areas = [area("ops", [field("plan", true)]), area("comms"), area("site")];
  const meta = new Map([
    ["ops", { area_id: "ops", responsible_user_id: "u1", review_due: "2026-11-01" }],
    ["comms", { area_id: "comms", responsible_user_id: "u2" }],
  ]);
  const input = { areas, meta, today: "2026-11-19", getValue: () => null, areaUpdatedAt: () => null } as any;
  const items = [
    { kind: "required", area: areas[0], field: areas[0].sections[0].fields[0] },
    { kind: "review", area: areas[0], detail: "Review overdue", overdue: true },
    { kind: "unconfigured", area: areas[2] },
  ] as any;
  it("lists my areas with their open items", () => {
    const w = myWork(input, items, { userId: "u1", myName: null, isLead: false });
    expect(w.areas.map((a) => a.area.id)).toEqual(["ops"]);
    expect(openCount(w)).toBe(2);
    expect(w.areas[0].review.reason).toBe("overdue");
    expect(w.unowned).toBe(0);
  });
  it("counts areas with no one responsible for the event lead", () => {
    expect(myWork(input, items, { userId: "u9", myName: null, isLead: true }).unowned).toBe(1);
  });
});
