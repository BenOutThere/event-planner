// Server-only: pull plain text out of uploaded documents so their contents can be searched.
// Supported: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), plain text, Markdown and CSV.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function xmlToText(xml: string, paragraphTag?: RegExp) {
  let s = xml;
  if (paragraphTag) s = s.replace(paragraphTag, "\n");
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? " ";
    });
}

export async function extractDocumentText(ext: string, bytes: Uint8Array): Promise<string> {
  if (["txt", "md", "csv"].includes(ext)) return new TextDecoder().decode(bytes);
  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (["docx", "xlsx", "pptx"].includes(ext)) {
    const { unzipSync, strFromU8 } = await import("fflate");
    const wanted = (name: string) =>
      ext === "docx" ? /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(name)
        : ext === "xlsx" ? /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)
          : /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name);
    const files = unzipSync(bytes, { filter: (f) => wanted(f.name) });
    const names = Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const parts = names.map((n) => {
      const xml = strFromU8(files[n]);
      if (ext === "docx") return xmlToText(xml, /<\/w:p>/g);
      if (ext === "pptx") return (xml.match(/<a:t>[^<]*<\/a:t>/g) ?? []).map((t) => xmlToText(t)).join(" ");
      // xlsx: shared strings + inline strings/numbers in sheets
      if (n.endsWith("sharedStrings.xml")) return xmlToText(xml, /<\/si>/g);
      return (xml.match(/<(is|v)>[\s\S]*?<\/(is|v)>/g) ?? []).map((t) => xmlToText(t)).join(" ");
    });
    return parts.join("\n");
  }
  throw new Error("This file type can't be searched");
}

/** Text of each PDF page, in order (used to say which page a search match is on). */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}
