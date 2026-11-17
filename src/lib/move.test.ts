import { describe, expect, it } from "vitest";
import { batches, orderRows, reconcile, remapRow } from "./move";

describe("move import helpers", () => {
  it("swaps account ids and drops rows whose person can't be matched", () => {
    const map = { old1: "new1" };
    expect(remapRow("events", { id: "e", created_by: "old1", lead_user_id: "gone" }, map)).toEqual({ id: "e", created_by: "new1", lead_user_id: null });
    expect(remapRow("user_roles", { id: "r", user_id: "gone", role: "admin" }, map)).toBeNull();
    expect(remapRow("template_fields", { id: "f", key: "k" }, map)).toEqual({ id: "f", key: "k" });
  });

  it("loads template parents before their sub-sections", () => {
    const rows = orderRows("template_sections", [{ id: "child", parent_id: "p" }, { id: "p", parent_id: null }]);
    expect(rows.map((r) => r.id)).toEqual(["p", "child"]);
  });

  it("splits large uploads into batches", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i, text: "x".repeat(100) }));
    expect(batches(rows, 150).length).toBe(5);
    expect(batches(rows, 10_000, 2).length).toBe(3);
  });

  it("counts what each event holds", () => {
    const counts = reconcile({
      events: [{ id: "a", name: "A" }],
      event_field_values: [
        { event_id: "a", value_text: "hi", version: 3 },
        { event_id: "a", value_text: "  ", version: 1 },
        { event_id: "a", value_table: { rows: [["1"], ["2"]] }, version: 1 },
        { event_id: "a", value_links: [{ path: "a/x.pdf", revisions: [{ path: "a/old.pdf" }] }, { url: "https://x" }], version: 2 },
      ],
      event_area_meta: [{ event_id: "a", reviewed_at: "2026-01-01" }, { event_id: "a", reviewed_at: null }],
      event_changes: [{ event_id: "a" }],
    });
    expect(counts.a).toMatchObject({ fieldsWithInfo: 3, tableRows: 2, files: 1, fileVersions: 1, links: 1, savedVersions: 7, reviews: 1, history: 1 });
  });
});
