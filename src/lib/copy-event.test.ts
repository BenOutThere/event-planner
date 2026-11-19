import { describe, expect, it } from "vitest";
import { nextEdition } from "./copy-event";

describe("nextEdition", () => {
  it("moves the year on in the name and dates", () => {
    expect(nextEdition("Summernats 2027", "2027-01-01", "2027-01-04")).toEqual({ name: "Summernats 2028", start: "2028-01-01", end: "2028-01-04" });
  });
  it("counts editions up", () => {
    expect(nextEdition("Summernats 39", "2026-01-01", null).name).toBe("Summernats 40");
  });
  it("adds the year otherwise, and handles 29 February", () => {
    expect(nextEdition("Northern Nats", "2028-02-29", null)).toEqual({ name: "Northern Nats 2029", start: "2029-02-28", end: null });
  });
});
