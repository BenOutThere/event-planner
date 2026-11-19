import { describe, expect, it } from "vitest";
import { isPlaceholderLabel, parseOptions } from "./labels";

describe("isPlaceholderLabel", () => {
  it("catches placeholders", () => {
    for (const l of ["OTPME", "TBC", "TODO later", "[name]", "XXXX", "{field}"]) expect(isPlaceholderLabel(l)).toBe(true);
  });
  it("allows real wording and short acronyms", () => {
    for (const l of ["Operating entity", "ABN", "GST No", "URL", "SOP", "NSW", "Todos and notes", "Event name"]) expect(isPlaceholderLabel(l)).toBe(false);
  });
});

describe("parseOptions", () => {
  it("trims, drops blanks and duplicates", () => {
    expect(parseOptions(" Summernats \n\nRocky Nats\nsummernats\n")).toEqual(["Summernats", "Rocky Nats"]);
  });
});
