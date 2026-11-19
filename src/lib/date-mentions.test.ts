import { describe, expect, it } from "vitest";
import { conflictingMentions, findDateMentions } from "./date-mentions";

describe("findDateMentions", () => {
  it("reads common ways of writing dates", () => {
    expect(findDateMentions("Join us February 26–28 at the track").map((m) => [m.month, m.from, m.to])).toEqual([[2, 26, 28]]);
    expect(findDateMentions("26-28 Feb 2027").map((m) => [m.month, m.from, m.to, m.year])).toEqual([[2, 26, 28, 2027]]);
    expect(findDateMentions("On Saturday 27th February").map((m) => [m.from, m.to])).toEqual([[27, 27]]);
    expect(findDateMentions("No dates here, just 3 cars and 26 people")).toEqual([]);
  });
});

describe("conflictingMentions", () => {
  it("flags the Summernats case: description 26–28 vs event dates 24–28", () => {
    expect(conflictingMentions("February 26–28", "2027-02-24", "2027-02-28").map((m) => m.text)).toEqual(["February 26–28"]);
  });
  it("is happy when the description matches the public dates", () => {
    expect(conflictingMentions("February 26–28", "2027-02-26", "2027-02-28")).toEqual([]);
    expect(conflictingMentions("Burnouts on 27 Feb", "2027-02-26", "2027-02-28")).toEqual([]);
  });
  it("ignores mentions in other months", () => {
    expect(conflictingMentions("Tickets on sale 1 November", "2027-02-26", "2027-02-28")).toEqual([]);
  });
});
