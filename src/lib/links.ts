export type LinkItem = { label: string; url: string };

/** Returns an error message, or null when the URL is a usable web address. */
export function validateUrl(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return "Enter a web address";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "Enter a full web address starting with https://";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Only http:// or https:// links are supported";
  if (!u.hostname.includes(".")) return "That web address looks incomplete";
  return null;
}

export function linkTitle(l: LinkItem): string {
  const label = (l.label ?? "").trim();
  if (label) return label;
  try {
    const u = new URL(l.url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last ? `${last} (${u.hostname})` : u.hostname;
  } catch {
    return l.url;
  }
}

export function linkHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("sharepoint") || h.includes("onedrive") || h === "1drv.ms") return "OneDrive / SharePoint";
    if (h.includes("smartsheet")) return "Smartsheet";
    return h;
  } catch {
    return "";
  }
}
