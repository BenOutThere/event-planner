// Regenerates public/out-there-user-guide.pdf from the in-app Help page, so the
// PDF and the in-app guide always say the same thing.
//
//   npm run build && node scripts/user-guide-pdf.mjs
//
// Renders the Help page component to static HTML (with the router swapped for
// a tiny stand-in), styles it with the built CSS and prints it with Chromium.
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is used from wherever it's installed (a dev dependency or globally).
const { chromium } = createRequire(import.meta.url)("playwright");

const root = fileURLToPath(new URL("..", import.meta.url));
const shim = "\0guide-router-shim";

const vite = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  resolve: { alias: { "@": `${root}src` } },
  ssr: { noExternal: ["@tanstack/react-router"] },
  esbuild: { jsx: "automatic" },
  plugins: [{
    name: "guide-router-shim",
    enforce: "pre",
    resolveId: (id) => (id === "@tanstack/react-router" ? shim : null),
    load: (id) => id === shim ? `
      import { createElement } from "react";
      export const createFileRoute = () => (options) => ({ options });
      export const Link = ({ to, children, ...rest }) => createElement("a", { href: to, ...rest }, children);
    ` : null,
  }],
});

try {
  const { Route } = await vite.ssrLoadModule("/src/routes/_authenticated/help.tsx");
  const body = renderToStaticMarkup(React.createElement(Route.options.component));

  const assets = `${root}.output/public/assets/`;
  const cssFile = readdirSync(assets).find((f) => /^styles-.*\.css$/.test(f));
  if (!cssFile) throw new Error("Run `npm run build` first: no built stylesheet found.");
  const css = readFileSync(assets + cssFile, "utf8");
  const updated = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Event Planner User Guide</title>
<style>${css}</style>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  html, body { background: #fff; }
  aside, a[download] { display: none !important; }
  .max-w-6xl { max-width: none !important; padding: 0 !important; }
  section { break-inside: auto; }
  section > div:first-child { break-after: avoid; }
  li, dt, dd, p { break-inside: avoid; }
  .cover { height: 245mm; display: flex; flex-direction: column; justify-content: center; break-after: page; }
</style></head><body>
<div class="cover">
  <p style="letter-spacing:.2em;font-size:12px;text-transform:uppercase;color:#666">Out There Group</p>
  <h1 style="font-size:44px;font-weight:700;line-height:1.1;margin:12px 0">Event Planner<br>User Guide</h1>
  <p style="max-width:120mm;color:#444;font-size:15px">Find, read and keep event information current: Event Home, search, To do and readiness, event status and archiving, Documents &amp; links, operations plans, reviews and access.</p>
  <p style="margin-top:24px;color:#666;font-size:13px">Updated ${updated} · support@outthereadmin.com.au</p>
</div>
${body}</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.emulateMedia({ media: "print", colorScheme: "light" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="font-size:8px;color:#888;width:100%;text-align:center">Out There Event Planner — User guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  });
  await browser.close();
  writeFileSync(`${root}public/out-there-user-guide.pdf`, pdf);
  console.log(`Wrote public/out-there-user-guide.pdf (${Math.round(pdf.length / 1024)} KB)`);
} finally {
  await vite.close();
}
