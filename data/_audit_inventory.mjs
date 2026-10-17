/* Copyright audit inventory — read-only. Lists every tracked file that would be published, with size
   and feature count, so the provenance registry in data/README.md and COPYRIGHT-AUDIT.md is built from
   what is actually in the tree rather than from what is remembered. Run: node data/_audit_inventory.mjs */
import { readFileSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean);

const DATA = files.filter(f => f.startsWith("data/") && !/\.(mjs|js|md)$/.test(f));
const rows = [];

for (const f of files) {
  let kb = 0;
  try { kb = statSync(f).size / 1024; } catch { }
  let features = "";
  if (f.endsWith(".json") || f.endsWith(".geojson") || f.endsWith(".geo.json")) {
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      const n = Array.isArray(j) ? j.length
        : (j.features ? j.features.length
          : Object.keys(j).reduce((a, k) => a + (Array.isArray(j[k]) ? j[k].length : 0), 0));
      features = String(n);
      /* a provenance note embedded in the file is the strongest evidence available */
      if (j.meta || j.note || j.source || j.sources) {
        const bits = [];
        if (j.meta) bits.push("meta");
        if (j.note) bits.push("note");
        if (j.source) bits.push("source");
        if (j.sources) bits.push("sources");
        features += " [" + bits.join(",") + "]";
      }
    } catch (e) { features = "unparsed"; }
  }
  rows.push({ f, kb, features });
}

const pad = (s, n) => String(s).padEnd(n);
console.log("=== every tracked file that ships (" + rows.length + ") ===");
console.log(pad("KB", 10) + pad("FEATURES", 14) + "PATH");
for (const r of rows.sort((a, b) => b.kb - a.kb)) {
  console.log(pad(r.kb.toFixed(1), 10) + pad(r.features, 14) + r.f);
}
const total = rows.reduce((a, r) => a + r.kb, 0);
console.log("\ntotal tracked payload: " + (total / 1024).toFixed(1) + " MB across " + rows.length + " files");

/* binary files: the ones that are not text and therefore cannot be self-attributing */
const BIN = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".ico", ".woff", ".woff2", ".ttf"];
const bins = files.filter(f => BIN.some(e => f.toLowerCase().endsWith(e)));
console.log("\n=== binary files in the published tree (need explicit rights) ===");
for (const b of bins) {
  let kb = 0; try { kb = statSync(b).size / 1024; } catch { }
  const referenced = files.some(g => /\.(html|js|mjs|css|json|md)$/.test(g) &&
    readFileSync(g, "utf8").includes(b));
  console.log("  " + pad(kb.toFixed(1), 8) + pad(referenced ? "referenced" : "ORPHANED", 12) + b);
}
if (!bins.length) console.log("  none");

/* anything that looks like it should not be here */
const suspicious = files.filter(f => /\.(pdf|doc|docx|xls|xlsx|zip|csv)$/i.test(f));
console.log("\n=== document/spreadsheet files in the published tree ===");
console.log(suspicious.length ? suspicious.map(s => "  " + s).join("\n") : "  none");
if (!existsSync("COPYRIGHT-AUDIT.md")) console.log("\n(COPYRIGHT-AUDIT.md does not exist yet)");