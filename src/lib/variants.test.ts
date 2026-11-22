import { describe, expect, it } from "vitest";
import { areaInVariant } from "./variants";
import { buildEventStructure } from "./event-structure";

const sec = (id: string, variants?: string[]) => ({ id, key: id, title: id, description: null, parent_id: null, sort_order: 0, is_active: true, variants });
const fld = (section_id: string) => ({ id: `${section_id}-f`, section_id, key: "notes", label: "Notes", kind: "text", sort_order: 0, is_required: false });

describe("template variants", () => {
  it("treats an area with no list as part of every variant", () => {
    expect(areaInVariant(null, "smaller")).toBe(true);
    expect(areaInVariant(["major"], "smaller")).toBe(false);
    expect(areaInVariant(["major"], null)).toBe(true);
  });
  it("leaves out areas outside the event's variant, unless they hold information", () => {
    const sections = [sec("core"), sec("big", ["major"]), sec("filled", ["major"])];
    const fields = [fld("core"), fld("big"), fld("filled")];
    const values = [{ section_id: "filled", extra_section_id: null, field_key: "notes", value_text: "Kept" }];
    const ids = (variant: string) => buildEventStructure({ sections, fields, values, variant }).map((a) => a.id);
    expect(ids("major")).toEqual(["core", "big", "filled"]);
    expect(ids("smaller")).toEqual(["core", "filled"]);
  });
});
