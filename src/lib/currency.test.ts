import { describe, expect, it } from "vitest";
import { reviewState } from "./currency";

describe("reviewState", () => {
  const today = "2026-10-29";
  it("is 'not reviewed yet' when nobody has reviewed, even if edited", () => {
    const s = reviewState({ area_id: "a" }, "2026-10-20T01:00:00Z", today);
    expect(s.reason).toBe("never");
    expect(s.needsReview).toBe(false);
  });
  it("editing after a review flags 'changed since review'", () => {
    const s = reviewState({ area_id: "a", reviewed_at: "2026-10-01T00:00:00Z" }, "2026-10-02T00:00:00Z", today);
    expect(s.reason).toBe("changed");
    expect(s.needsReview).toBe(true);
  });
  it("a review after the last edit counts as reviewed", () => {
    const s = reviewState({ area_id: "a", reviewed_at: "2026-10-03T00:00:00Z", reviewed_by_name: "Grace" }, "2026-10-02T00:00:00Z", today);
    expect(s.reason).toBe("reviewed");
    expect(s.label).toContain("Grace");
  });
  it("a past review date is overdue", () => {
    const s = reviewState({ area_id: "a", review_due: "2026-10-28", reviewed_at: "2026-10-27T00:00:00Z" }, null, today);
    expect(s.reason).toBe("overdue");
    expect(s.needsReview).toBe(true);
  });
  it("a review date today is not yet overdue", () => {
    expect(reviewState({ area_id: "a", review_due: today }, null, today).reason).toBe("due");
  });
});
