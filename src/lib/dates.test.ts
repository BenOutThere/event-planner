import { describe, expect, it } from "vitest";
import { checkDateSequence, formatAuDate, formatAuRange, parseDateOnly, toDateOnly } from "./dates";

describe("date-only handling", () => {
  it("shows Australian format", () => {
    expect(formatAuDate("2027-02-24")).toBe("24 Feb 2027");
  });

  it("round-trips a date without shifting the day", () => {
    expect(toDateOnly(parseDateOnly("2027-02-24")!)).toBe("2027-02-24");
  });

  it("formats ranges compactly", () => {
    expect(formatAuRange("2027-02-24", "2027-02-28")).toBe("24–28 Feb 2027");
    expect(formatAuRange("2026-11-20", "2026-11-20")).toBe("20 Nov 2026");
    expect(formatAuRange(null, null)).toBe("Dates not set");
  });

  it("warns when bump-in is after event start, without changing anything", () => {
    const input = { bump_in_start_date: "2027-02-25", event_start_date: "2027-02-24" };
    const w = checkDateSequence(input);
    expect(w.length).toBe(1);
    expect(input.bump_in_start_date).toBe("2027-02-25");
  });

  it("accepts a correct sequence", () => {
    expect(checkDateSequence({
      bump_in_start_date: "2027-02-21", event_start_date: "2027-02-24",
      event_end_date: "2027-02-28", bump_out_end_date: "2027-03-01",
    })).toEqual([]);
  });
});
