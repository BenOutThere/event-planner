import { describe, expect, it } from "vitest";
import { coverageOf, fieldState, hasInformation, type FieldDef } from "./coverage";

const teamDefaults = {
  columns: ["Position", "Name", "Email"],
  rows: [["Event Manager", "", ""], ["Marketing Manager", "", ""]],
};
const teamField: FieldDef = { key: "team", label: "Key team members", kind: "table", default_table: teamDefaults };

describe("planning coverage", () => {
  it("an area with no fields is not configured and has no percentage", () => {
    const c = coverageOf([]);
    expect(c.configured).toBe(false);
    expect(c.pct).toBeNull();
  });

  it("template labels in a table do not count as entered information", () => {
    expect(hasInformation(teamField, { value_table: teamDefaults })).toBe(false);
  });

  it("empty rows and column headings do not count as entered information", () => {
    const v = { value_table: { columns: ["Name", "Email"], rows: [["", ""], ["  ", ""]] } };
    expect(hasInformation({ kind: "table" }, v)).toBe(false);
  });

  it("a real name typed into a template row counts as entered", () => {
    const v = { value_table: { ...teamDefaults, rows: [["Event Manager", "Grace", ""], ["Marketing Manager", "", ""]] } };
    expect(hasInformation(teamField, v)).toBe(true);
  });

  it("whitespace-only text does not count", () => {
    expect(hasInformation({ kind: "text" }, { value_text: "   " })).toBe(false);
  });

  it("blank or invalid links do not count", () => {
    expect(hasInformation({ kind: "links" }, { value_links: [{ label: "Budget", url: "" }] })).toBe(false);
    expect(hasInformation({ kind: "links" }, { value_links: [{ label: "x", url: "not a link" }] })).toBe(false);
    expect(hasInformation({ kind: "links" }, { value_links: [{ label: "", url: "https://app.smartsheet.com/b/1" }] })).toBe(true);
  });

  it("not applicable fields are excluded from the denominator", () => {
    const text: FieldDef = { key: "a", label: "A", kind: "text", allow_na: true };
    const c = coverageOf([
      { def: text, value: { not_applicable: true } },
      { def: { key: "b", label: "B", kind: "text" }, value: { value_text: "hi" } },
    ]);
    expect(c.total).toBe(1);
    expect(c.na).toBe(1);
    expect(c.pct).toBe(100);
  });

  it("not applicable is ignored when the field does not allow it", () => {
    const s = fieldState({ key: "a", label: "A", kind: "text" }, { not_applicable: true });
    expect(s.na).toBe(false);
  });

  it("optional blank fields never block required completion", () => {
    const c = coverageOf([
      { def: { key: "r", label: "R", kind: "text", is_required: true }, value: { value_text: "x" } },
      { def: { key: "o", label: "O", kind: "text" }, value: null },
    ]);
    expect(c.requiredTotal).toBe(1);
    expect(c.requiredMet).toBe(1);
  });

  it("table rules require the named columns on every listed row", () => {
    const def: FieldDef = { ...teamField, is_required: true, table_rules: { required_columns: ["Name"] } };
    const partly = { value_table: { ...teamDefaults, rows: [["Event Manager", "Grace", ""], ["Marketing Manager", "", ""]] } };
    const full = { value_table: { ...teamDefaults, rows: [["Event Manager", "Grace", ""], ["Marketing Manager", "Jacob", ""]] } };
    expect(fieldState(def, partly).requirementMet).toBe(false);
    expect(fieldState(def, partly).detail).toBe("1 of 2 rows have Name");
    expect(fieldState(def, full).requirementMet).toBe(true);
  });

  it("table rules honour a minimum number of rows", () => {
    const def: FieldDef = { key: "s", label: "Suppliers", kind: "table", is_required: true, table_rules: { required_columns: ["Supplier"], min_rows: 2 } };
    const one = { value_table: { columns: ["Item", "Supplier"], rows: [["Fencing", "ABC"], ["", ""]] } };
    expect(fieldState(def, one).requirementMet).toBe(false);
  });
});
