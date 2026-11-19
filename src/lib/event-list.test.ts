import { describe, expect, it } from "vitest";
import { addMonths, barFor, DEFAULT_FILTERS, eventsOn, filterEvents, inRange, monthGrid, timelineWindow, type ListEvent } from "./event-list";

const ev = (id: string, s: string | null, e: string | null, extra: Partial<ListEvent> = {}): ListEvent =>
  ({ id, name: id, stage: "in_planning", proposed_date: s, end_date: e, lead_user_id: null, ...extra });
const today = "2026-11-19";

describe("inRange", () => {
  it("handles upcoming, next N days and finished", () => {
    expect(inRange(ev("a", "2026-11-18", "2026-11-20"), "upcoming", today)).toBe(true);
    expect(inRange(ev("a", "2026-11-01", "2026-11-02"), "upcoming", today)).toBe(false);
    expect(inRange(ev("a", "2026-12-10", null), "next30", today)).toBe(true);
    expect(inRange(ev("a", "2027-02-24", "2027-02-28"), "next30", today)).toBe(false);
    expect(inRange(ev("a", "2027-02-10", "2027-02-12"), "next90", today)).toBe(true);
    expect(inRange(ev("a", "2026-11-01", "2026-11-02"), "past", today)).toBe(true);
    expect(inRange(ev("a", null, null), "nodate", today)).toBe(true);
    expect(inRange(ev("a", null, null), "next12m", today)).toBe(false);
  });
});

describe("filterEvents", () => {
  const rows = [
    ev("a", "2027-02-24", "2027-02-28", { lead_user_id: "u1" }),
    ev("b", "2027-03-10", null, { stage: "draft" }),
    ev("c", "2026-01-01", null, { stage: "archived" }),
  ];
  it("hides archived unless asked", () => {
    expect(filterEvents(rows, DEFAULT_FILTERS, today, new Set()).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filterEvents(rows, { ...DEFAULT_FILTERS, status: "archived" }, today, new Set()).map((e) => e.id)).toEqual(["c"]);
  });
  it("filters by status, lead and my events", () => {
    expect(filterEvents(rows, { ...DEFAULT_FILTERS, status: "draft" }, today, new Set()).map((e) => e.id)).toEqual(["b"]);
    expect(filterEvents(rows, { ...DEFAULT_FILTERS, lead: "u1" }, today, new Set()).map((e) => e.id)).toEqual(["a"]);
    expect(filterEvents(rows, { ...DEFAULT_FILTERS, lead: "none" }, today, new Set()).map((e) => e.id)).toEqual(["b"]);
    expect(filterEvents(rows, { ...DEFAULT_FILTERS, mine: true }, today, new Set(["b"])).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("calendar", () => {
  it("starts weeks on Monday and covers the whole month", () => {
    const g = monthGrid("2027-02");
    expect(g[0][0]).toBe("2027-02-01"); // 1 Feb 2027 is a Monday
    expect(g.flat()).toContain("2027-02-28");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid("2026-11")[0][0]).toBe("2026-10-26");
  });
  it("lists events on each day of their dates", () => {
    const rows = [ev("a", "2027-02-24", "2027-02-28"), ev("b", "2027-02-26", null)];
    expect(eventsOn("2027-02-26", rows).map((e) => e.id)).toEqual(["a", "b"]);
    expect(eventsOn("2027-02-27", rows).map((e) => e.id)).toEqual(["a"]);
  });
  it("adds months across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
  });
});

describe("timeline", () => {
  it("places bars inside the window and clips ones that run past it", () => {
    const w = timelineWindow("2026-11", 12);
    expect(w.start).toBe("2026-11-01");
    expect(w.end).toBe("2027-10-31");
    const b = barFor(ev("a", "2026-11-01", "2026-11-01"), w)!;
    expect(b.left).toBe(0);
    expect(barFor(ev("a", "2026-10-30", "2026-11-02"), w)!.clippedStart).toBe(true);
    expect(barFor(ev("a", "2027-12-01", null), w)).toBeNull();
    expect(barFor(ev("a", null, null), w)).toBeNull();
  });
});
