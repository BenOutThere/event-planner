import { describe, expect, it } from "vitest";
import { collectDocuments, filterDocuments, withNewRevision } from "./documents";
import type { StructArea, StructField } from "./event-structure";

const files = { id: "f", key: "site_files", label: "Site files", kind: "files", ref: { section_id: "a", extra_section_id: null, field_key: "site_files" }, refKey: "a::site_files", scope: "template" } as StructField;
const links = { id: "l", key: "links", label: "Links", kind: "links", ref: { section_id: "a", extra_section_id: null, field_key: "links" }, refKey: "a::links", scope: "template" } as StructField;
const areas: StructArea[] = [{ id: "a", key: "ops", title: "Operations", navGroup: "Delivery", hasSubsections: false, sections: [{ id: "a", title: "Operations", scope: "template", fields: [files, links] }] }];

const vals: Record<string, any> = {
  [files.refKey]: { value_links: [
    { id: "1", label: "Site map.pdf", path: "ev/a/x-Site map.pdf", status: "current" },
    { id: "2", label: "Old site map.pdf", path: "ev/a/y-Old.pdf", status: "superseded" },
  ] },
  [links.refKey]: { value_links: [{ id: "3", label: "Budget", url: "https://contoso.sharepoint.com/b" }, { label: "", url: "not a url" }] },
};

describe("documents index", () => {
  const items = collectDocuments(areas, (f) => vals[f.refKey]);
  it("lists the original saved files and valid links with their source", () => {
    expect(items.map((d) => d.id)).toEqual(["1", "2", "3"]);
    expect(items[0].area.title).toBe("Operations");
    expect(items[2].typeLabel).toBe("External link");
  });
  it("hides superseded documents unless asked", () => {
    expect(filterDocuments(items, {}).map((d) => d.id)).toEqual(["1", "3"]);
    expect(filterDocuments(items, { showSuperseded: true })).toHaveLength(3);
  });
  it("replacing a file keeps the previous version in its history", () => {
    const next = withNewRevision(items[0].record, { path: "ev/a/z-Site map v2.pdf", label: "Site map v2.pdf", uploaded_at: "2026-10-29T00:00:00Z" });
    expect(next.id).toBe("1");
    expect(next.path).toBe("ev/a/z-Site map v2.pdf");
    expect(next.revisions?.[0].path).toBe("ev/a/x-Site map.pdf");
    expect(next.version).toBe("v2");
  });
});
