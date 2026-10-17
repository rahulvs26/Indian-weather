/* v7.24 — point about.html's Markdown links at the repository.

   GitHub Pages does not render .md as HTML. It serves it as plain text, so a link to
   CITATIONS.md from a published page lands the reader on an unstyled wall of raw Markdown. The
   repository URL renders the same file properly, and is where a reader would go to read or copy it.

   The visible link text stays the same, so the page still says what it points at. */
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "https://github.com/rahulvs26/Indian-weather/blob/main";
const DOCS = ["CITATIONS.md", "COPYRIGHT-AUDIT.md", "PERFORMANCE.md", "GAP-ANALYSIS.md"];

let h = readFileSync("about.html", "utf8");
let n = 0;
for (const d of DOCS) {
  const local = `href="${d}"`;
  if (!h.includes(local)) continue;
  const count = h.split(local).length - 1;
  h = h.split(local).join(`href="${REPO}/${d}"`);
  n += count;
  console.log("  " + d + ": " + count + " link(s) -> repo URL");
}
writeFileSync("about.html", h, "utf8");

const out = readFileSync("about.html", "utf8");
const stillLocal = DOCS.filter(d => out.includes(`href="${d}"`));
console.log("\nrewrote " + n + " links");
console.log("local .md links remaining: " + (stillLocal.length ? stillLocal.join(", ") : "none"));
for (const m of out.matchAll(/href="([^"]*\.md)"/g)) console.log("  -> " + m[1]);