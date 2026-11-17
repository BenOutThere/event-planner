import { describe, expect, it } from "vitest";
import { chunkPlan, isQuestion, keywordTerms, pickExcerpts } from "./ops-ask";
import { detectPlanSections, parseContents, printedPages } from "./operations";

describe("questions in search", () => {
  it("recognises questions", () => {
    expect(isQuestion("what are the rules for the burnout competition?")).toBe(true);
    expect(isQuestion("Who runs medical operations")).toBe(true);
    expect(isQuestion("burnout rules?")).toBe(false); // too short to be worth an AI answer
    expect(isQuestion("medical evacuation gate")).toBe(false);
  });
  it("reduces a question to its key words", () => {
    expect(keywordTerms("what are the rules for the burnout competition?")).toEqual(["burnout", "competition"]);
  });
  it("leaves keyword searches as typed", () => {
    expect(keywordTerms("bump-in jane@otg.com.au")).toEqual(["bump-in", "jane@otg.com.au"]);
  });
});

const filler = (w: string, n = 30) => `${w} `.repeat(n).trim();
// A plan laid out like the Summernats plan: running header with page number, contents page, letter-spaced headings.
const PAGES_TEXT = [
  "EVENT OPERATIONS PLAN\nSUMMERNATS",
  "OTG | Operations Plan i\nSection Topic Page\n11 Burnout operations 1\n17 Medical operations 2\n19 Fire response 3",
  `OTG | Operations Plan 1\n1 1 B U R N O U T O P E R A T I O N S\nCompetitors must hold a current licence. ${filler("track")}`,
  `OTG | Operations Plan 2\n1 7 M E D I C A L O P E R A T I O N S\nThe medical tent is beside gate 2. ${filler("care")}`,
  `OTG | Operations Plan 3\nFire crews stand by at the burnout pad. ${filler("water")}`,
];
const pages: number[] = [];
let content = "";
for (const t of PAGES_TEXT) { pages.push(content.length ? content.length + 1 : 0); content = content.length ? `${content}\n${t}` : t; }

describe("an event's own operations plan", () => {
  it("reads sections from the plan's contents page", () => {
    expect(parseContents(content).map((e) => [e.code, e.title, e.page])).toEqual([
      ["11", "Burnout operations", 1], ["17", "Medical operations", 2], ["19", "Fire response", 3],
    ]);
  });
  it("reads printed page numbers from the running header", () => {
    expect(printedPages(content, pages)).toEqual([null, null, 1, 2, 3]);
  });
  it("finds letter-spaced headings, and falls back to the printed page", () => {
    const s = detectPlanSections(content, pages, []);
    expect(s.map((x) => x.code)).toEqual(["11", "17", "19"]);
    expect(content.slice(s[0].start).startsWith("1 1 B U R N O U T")).toBe(true);
    expect(s[2].start).toBe(pages[4]); // "19 Fire response" has no heading: starts on printed page 3
  });
  it("answers from the passages about the question", () => {
    const s = detectPlanSections(content, pages, []);
    const picked = pickExcerpts(chunkPlan(content, s, pages, 200), "what are the rules for the burnout competition?");
    expect(picked.map((p) => p.section?.code)).toContain("11");
    expect(picked.some((p) => p.section?.code === "17")).toBe(false);
  });
});
