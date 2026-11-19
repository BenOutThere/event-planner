import { describe, expect, it } from "vitest";
import { stagePrompt, SETTABLE_STAGES } from "./event-status";

describe("stagePrompt", () => {
  it("suggests Live during the event", () => {
    expect(stagePrompt("confirmed", "2027-02-24", "2027-02-28", "2027-02-25")?.to).toBe("live");
  });
  it("suggests Completed once the dates have passed", () => {
    expect(stagePrompt("live", "2027-02-24", "2027-02-28", "2027-03-01")?.to).toBe("completed");
    expect(stagePrompt("draft", "2027-02-24", null, "2027-02-25")?.to).toBe("completed");
  });
  it("suggests archiving 30 days after a completed event ends, not before", () => {
    expect(stagePrompt("completed", "2027-02-24", "2027-02-28", "2027-03-20")).toBeNull();
    expect(stagePrompt("completed", "2027-02-24", "2027-02-28", "2027-03-30")?.to).toBe("archived");
  });
  it("nudges a draft within 90 days of the start", () => {
    expect(stagePrompt("draft", "2027-02-24", "2027-02-28", "2027-01-01")?.to).toBe("in_planning");
    expect(stagePrompt("draft", "2027-02-24", "2027-02-28", "2026-06-01")).toBeNull();
  });
  it("says nothing without a start date or once archived", () => {
    expect(stagePrompt("draft", null, null, "2027-01-01")).toBeNull();
    expect(stagePrompt("archived", "2020-01-01", "2020-01-02", "2027-01-01")).toBeNull();
  });
  it("never offers Archived as a plain status choice", () => {
    expect(SETTABLE_STAGES).not.toContain("archived");
  });
});
