import { describe, expect, it } from "vitest";
import { autoMerge, mergeItems, mergeTables } from "./merge";

const base = { columns: ["Name", "Role"], rows: [["Grace", "Event Manager"], ["", ""]] };

describe("mergeTables", () => {
  it("combines edits to different rows", () => {
    const mine = { columns: base.columns, rows: [["Grace", "Event Manager"], ["Jacob", ""]] };
    const theirs = { columns: base.columns, rows: [["Grace Prosser", "Event Manager"], ["", ""]] };
    expect(mergeTables(base, mine, theirs)).toEqual({ columns: base.columns, rows: [["Grace Prosser", "Event Manager"], ["Jacob", ""]] });
  });
  it("refuses when the same cell changed differently", () => {
    const mine = { columns: base.columns, rows: [["Grace A", "Event Manager"], ["", ""]] };
    const theirs = { columns: base.columns, rows: [["Grace B", "Event Manager"], ["", ""]] };
    expect(mergeTables(base, mine, theirs)).toBeNull();
  });
  it("keeps rows both people added", () => {
    const mine = { columns: base.columns, rows: [...base.rows, ["Ben", "Commercial"]] };
    const theirs = { columns: base.columns, rows: [...base.rows, ["Clare", "Camping"]] };
    expect(mergeTables(base, mine, theirs)?.rows.slice(2)).toEqual([["Clare", "Camping"], ["Ben", "Commercial"]]);
  });
  it("refuses when columns were changed by someone else", () => {
    const theirs = { columns: ["Name", "Role", "Email"], rows: [["Grace", "Event Manager", ""], ["", "", ""]] };
    expect(mergeTables(base, { ...base, rows: [["Grace", "EM"], ["", ""]] }, theirs)).toBeNull();
  });
  it("refuses when rows were deleted", () => {
    expect(mergeTables(base, { columns: base.columns, rows: [["Grace", "Event Manager"]] }, { ...base, rows: [["Grace", "X"], ["", ""]] })).toBeNull();
  });
});

describe("mergeItems", () => {
  const a = { id: "a", label: "Site map", url: "https://x.com/a" };
  const b = { id: "b", label: "Program", url: "https://x.com/b" };
  it("combines changes to different documents", () => {
    const mine = [{ ...a, status: "current" }, b];
    const theirs = [a, { ...b, label: "Program v2" }];
    expect(mergeItems([a, b], mine, theirs)).toEqual([{ ...a, status: "current" }, { ...b, label: "Program v2" }]);
  });
  it("refuses when the same document changed differently", () => {
    expect(mergeItems([a], [{ ...a, label: "X" }], [{ ...a, label: "Y" }])).toBeNull();
  });
  it("keeps a document added by each person", () => {
    const c = { id: "c", label: "New", url: "https://x.com/c" };
    expect(mergeItems([a], [a, c], [a, b])?.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("autoMerge", () => {
  it("keeps my change when they changed a different part", () => {
    expect(autoMerge({ value_text: "a", not_applicable: false }, { not_applicable: true }, { value_text: "b", not_applicable: false })).toEqual({ not_applicable: true });
  });
  it("asks when both changed the same text", () => {
    expect(autoMerge({ value_text: "a" }, { value_text: "mine" }, { value_text: "theirs" })).toBeNull();
  });
});
