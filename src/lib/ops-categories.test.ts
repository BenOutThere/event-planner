import { describe, expect, it } from "vitest";
import { resolveCategory, suggestMain, visibleCategories, type OpsCategory } from "./ops-categories";

describe("suggestMain", () => {
  it("groups detailed section names", () => {
    expect(suggestMain("17 Medical operations")).toBe("Medical");
    expect(suggestMain("11 Burnout operations")).toBe("Competition");
    expect(suggestMain("Traffic management plan")).toBe("Traffic");
    expect(suggestMain("8 Emergency evacuation")).toBe("Safety");
    expect(suggestMain("Radio call signs")).toBe("Comms");
    expect(suggestMain("Bump in and bump out")).toBe("Site");
    expect(suggestMain("Crowd management")).toBe("Security");
    expect(suggestMain("1 Introduction")).toBe("SOP");
  });
});

describe("resolveCategory", () => {
  const cats: OpsCategory[] = [
    { id: "m", name: "Medical", sort_order: 1, is_main: true },
    { id: "a", name: "17 Medical operations", sort_order: 2, main_category_id: "m" },
    { id: "b", name: "Old thing", sort_order: 3 },
  ];
  const byId = new Map(cats.map((c) => [c.id, c]));
  it("files a grouped category under its main category", () => {
    expect(resolveCategory("a", byId)).toBe("m");
    expect(resolveCategory("m", byId)).toBe("m");
    expect(resolveCategory("b", byId)).toBe("b");
    expect(resolveCategory(null, byId)).toBeNull();
  });
  it("shows main categories and ungrouped ones only", () => {
    expect(visibleCategories(cats).map((c) => c.id)).toEqual(["m", "b"]);
  });
});
