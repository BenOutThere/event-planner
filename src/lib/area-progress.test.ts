import { describe, expect, it } from "vitest";
import { areaProgress } from "./area-progress";

const cov = (o: Partial<{ total: number; entered: number; requiredTotal: number; requiredMet: number; configured: boolean }>) =>
  ({ configured: true, total: 4, entered: 0, na: 0, pct: 0, requiredTotal: 0, requiredMet: 0, ...o });

describe("areaProgress", () => {
  it("puts missing required information first", () => {
    expect(areaProgress(cov({ entered: 3, requiredTotal: 2, requiredMet: 1 })).state).toBe("missing");
  });
  it("shows empty, partial and complete", () => {
    expect(areaProgress(cov({})).state).toBe("empty");
    expect(areaProgress(cov({ entered: 2 })).label).toBe("2 of 4 fields have information");
    expect(areaProgress(cov({ entered: 4 })).state).toBe("complete");
  });
  it("has nothing to show for an area that isn't set up", () => {
    expect(areaProgress(cov({ configured: false, total: 0 })).state).toBe("none");
  });
});
