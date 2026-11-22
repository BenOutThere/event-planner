import { describe, expect, it } from "vitest";
import { canFillFromDirectory, columnRole, contactFromRow, exactMatch, fillRow, type DirectoryContact } from "./directory";

const jo: DirectoryContact = { id: "1", kind: "person", name: "Jo Bloggs", organisation: "Acme Security", role_title: "Ops manager", phone: "0412 345 678", email: "jo@acme.com.au", website: null, notes: null, archived_at: null };
const acme: DirectoryContact = { id: "2", kind: "supplier", name: "Acme Security", organisation: null, role_title: null, phone: "02 6100 0000", email: "hello@acme.com.au", website: "acme.com.au", notes: null, archived_at: null };

describe("columnRole", () => {
  it("recognises common contact table columns", () => {
    expect(["Name", "Role", "Company", "Mobile", "Email", "Website"].map(columnRole))
      .toEqual(["name", "other", "organisation", "phone", "email", "website"]);
    expect(canFillFromDirectory(["Role", "Notes"])).toBe(false);
    expect(canFillFromDirectory(["Supplier", "Phone"])).toBe(true);
  });
});

describe("fillRow", () => {
  const cols = ["Role", "Name", "Company", "Mobile", "Email"];
  it("fills empty cells and leaves the event-specific role alone", () => {
    expect(fillRow(cols, ["Security lead", "Jo Bloggs", "", "", ""], jo)).toEqual(["Security lead", "Jo Bloggs", "Acme Security", "0412 345 678", "jo@acme.com.au"]);
  });
  it("doesn't overwrite what's already typed unless asked", () => {
    expect(fillRow(cols, ["", "Jo", "", "0400 111 222", ""], jo)[3]).toBe("0400 111 222");
    expect(fillRow(cols, ["", "Jo", "", "0400 111 222", ""], jo, true)[3]).toBe("0412 345 678");
  });
  it("puts a supplier's name in the company column", () => {
    expect(fillRow(cols, ["", "", "", "", ""], acme)).toEqual(["", "", "Acme Security", "02 6100 0000", "hello@acme.com.au"]);
  });
});

describe("exactMatch", () => {
  it("matches one entry by name, ignoring case", () => {
    expect(exactMatch(" jo bloggs ", "name", [jo, acme])?.id).toBe("1");
    expect(exactMatch("Acme Security", "organisation", [jo, acme])?.id).toBe("2");
    expect(exactMatch("Jo", "name", [jo])).toBeNull();
    expect(exactMatch("Jo Bloggs", "name", [jo, { ...jo, id: "3" }])).toBeNull();
    expect(exactMatch("Jo Bloggs", "name", [{ ...jo, archived_at: "2026-01-01" }])).toBeNull();
  });
});

describe("contactFromRow", () => {
  it("builds a person or a supplier from a row", () => {
    expect(contactFromRow(["Name", "Company", "Mobile"], ["Jo", "Acme", "0412 345 678"])).toMatchObject({ kind: "person", name: "Jo", organisation: "Acme", phone: "0412 345 678" });
    expect(contactFromRow(["Supplier", "Phone"], ["Acme", "02 6100 0000"])).toMatchObject({ kind: "supplier", name: "Acme" });
    expect(contactFromRow(["Role"], ["Security"])).toBeNull();
  });
});
