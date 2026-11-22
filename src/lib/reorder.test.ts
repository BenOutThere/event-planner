import { describe, expect, it } from "vitest";
import { reorder, sortOrderChanges } from "./reorder";

const list = [{ id: "a", sort_order: 10 }, { id: "b", sort_order: 20 }, { id: "c", sort_order: 30 }, { id: "d", sort_order: 40 }];
const ids = (l: { id: string }[]) => l.map((x) => x.id).join("");

describe("reorder", () => {
  it("moves an item down to the target's place", () => {
    expect(ids(reorder(list, "a", "c"))).toBe("bcad");
  });
  it("moves an item up to the target's place", () => {
    expect(ids(reorder(list, "d", "b"))).toBe("adbc");
  });
  it("ignores unknown or same ids", () => {
    expect(reorder(list, "a", "a")).toBe(list);
    expect(reorder(list, "x", "a")).toBe(list);
  });
});

describe("sortOrderChanges", () => {
  it("only saves items whose order changed", () => {
    expect(sortOrderChanges(reorder(list, "d", "c"))).toEqual([{ id: "d", sort_order: 30 }, { id: "c", sort_order: 40 }]);
  });
  it("renumbers uneven orders", () => {
    expect(sortOrderChanges([{ id: "a", sort_order: 5 }, { id: "b", sort_order: 20 }])).toEqual([{ id: "a", sort_order: 10 }]);
  });
});
