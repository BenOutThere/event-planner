import { describe, expect, it } from "vitest";
import { canManageOps, canReadOps, detectSections, findPassages, pageAt, parseSectionName, sectionAt, sectionHits, opsFileAllowed, opsSearchable, titleFromFileName } from "./operations";

describe("operations plans access", () => {
  it("admins and leads (event managers) can upload", () => {
    expect(canManageOps(["admin"])).toBe(true);
    expect(canManageOps(["lead"])).toBe(true);
  });
  it("other staff can only read", () => {
    expect(canManageOps(["member"])).toBe(false);
    expect(canManageOps(["viewer"])).toBe(false);
    expect(canReadOps(["member"])).toBe(true);
    expect(canReadOps(["viewer"])).toBe(true);
  });
  it("external stakeholders can't see operations plans", () => {
    expect(canReadOps(["supplier"])).toBe(false);
    expect(canManageOps(["supplier"])).toBe(false);
  });
});

describe("operations plan files", () => {
  it("accepts PDF and Word only", () => {
    expect(opsFileAllowed("Plan.PDF")).toBe(true);
    expect(opsFileAllowed("SOP.docx")).toBe(true);
    expect(opsFileAllowed("Old SOP.doc")).toBe(true);
    expect(opsFileAllowed("photo.jpg")).toBe(false);
    expect(opsFileAllowed("budget.xlsx")).toBe(false);
  });
  it("searches the text of PDF and .docx, not old .doc", () => {
    expect(opsSearchable("a.pdf")).toBe(true);
    expect(opsSearchable("a.docx")).toBe(true);
    expect(opsSearchable("a.doc")).toBe(false);
  });
  it("titles new uploads from the file name", () => {
    expect(titleFromFileName("Crowd_Management_SOP.docx")).toBe("Crowd Management SOP");
  });
});

describe("findPassages", () => {
  const text = "Intro text. ".repeat(40) + "The medical tent is staffed by St John. " + "Filler words here. ".repeat(40) + "Medical evacuation uses the north gate.";
  it("returns passages around each match", () => {
    const p = findPassages(text, ["medical"]);
    expect(p).toHaveLength(2);
    expect(p[0].text).toContain("medical tent");
    expect(p[1].text).toContain("north gate");
  });
  it("ranks passages with more of the search words first", () => {
    const p = findPassages(text, ["medical", "gate"]);
    expect(p[0].text).toContain("north gate");
  });
  it("returns nothing for no terms", () => {
    expect(findPassages(text, [])).toEqual([]);
  });
});


const CATS = [
  { id: "c16", name: "16 Security and entrant behaviour" },
  { id: "c17", name: "17 Medical operations" },
  { id: "c18", name: "18 Emergency management and venue interface" },
  { id: "c21b", name: "21B Food traders bars and hospitality" },
];
const filler = (w: string) => `${w} `.repeat(60);
const PLAN = [
  "CONTENTS AND QUICK REFERENCE Section Topic Page",
  "16 Security and entrant behaviour 24",
  "17 Medical operations 25",
  "18 Emergency management and venue interface 26",
  "21B Food traders bars and hospitality 32",
  "16 SECURITY AND ENTRANT BEHAVIOUR", filler("guards") + "Medical staff are briefed by security.",
  "17 MEDICAL OPERATIONS", filler("care") + "St John run the medical tent near gate 2.",
  "18 EMERGENCY MANAGEMENT AND VENUE INTERFACE", filler("plans") + "Evacuation via the north gate.",
  "21B FOOD TRADERS, BARS & HOSPITALITY", filler("food") + "Bars close at 10pm.",
].join("\n");

describe("Operations Plan sections", () => {
  it("reads the section number and topic from a category name", () => {
    expect(parseSectionName("17 Medical operations")).toEqual({ code: "17", title: "Medical operations" });
    expect(parseSectionName("00A–C Reader guide and key terms")).toEqual({ code: "00A–C", title: "Reader guide and key terms" });
  });
  it("finds each section heading in the body, not on the contents page", () => {
    const s = detectSections(PLAN, CATS);
    expect(s.map((x) => x.code)).toEqual(["16", "17", "18", "21B"]);
    expect(PLAN.slice(s[1].start, s[1].start + 21)).toBe("17 MEDICAL OPERATIONS");
    expect(s[0].start).toBeGreaterThan(PLAN.indexOf("21B Food traders bars and hospitality 32"));
  });
  it("recognises short sections and contents pages without page numbers", () => {
    const plan = ["Medical operations", "Fire response", "MEDICAL OPERATIONS", "St John run the medical tent near the gate.", "FIRE RESPONSE", "Extinguishers at each zone."].join("\n");
    const s = detectSections(plan, [{ id: "a", name: "17 Medical operations" }, { id: "b", name: "19 Fire response" }]);
    expect(s.map((x) => plan.slice(x.start, x.start + 8))).toEqual(["MEDICAL ", "FIRE RES"]);
  });
  it("matches headings with punctuation and & for and", () => {
    const s = detectSections(PLAN, CATS);
    expect(PLAN.slice(s[3].start).startsWith("21B FOOD TRADERS, BARS & HOSPITALITY")).toBe(true);
  });
  it("says which section a match is in", () => {
    const s = detectSections(PLAN, CATS);
    expect(sectionAt(s, PLAN.indexOf("medical tent"))?.code).toBe("17");
    expect(sectionAt(s, PLAN.indexOf("north gate"))?.code).toBe("18");
    expect(sectionAt(s, 5)).toBeNull();
  });
  it("groups search matches by section, keeping sections with every word", () => {
    const s = detectSections(PLAN, CATS);
    const hits = sectionHits(PLAN, s, null, ["medical", "gate"]);
    expect(hits.map((h) => h.section?.code)).toEqual(["17"]);
    const any = sectionHits(PLAN, s, null, ["medical"]);
    expect(any.map((h) => h.section?.code ?? "front")).toEqual(["front", "16", "17"]);
  });
  it("works out the PDF page from page start offsets", () => {
    expect(pageAt([0, 100, 200], 0)).toBe(1);
    expect(pageAt([0, 100, 200], 150)).toBe(2);
    expect(pageAt([0, 100, 200], 999)).toBe(3);
    expect(pageAt(null, 10)).toBeNull();
  });
});
