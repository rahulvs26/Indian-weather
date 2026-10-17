/* v7.20 — no duplicated / missing top-level functions in map3d.js */
import {readFileSync} from "node:fs";
const s = readFileSync("map3d.js", "utf8");
const counts = new Map();
for (const m of s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
let bad = 0;
for (const [n, c] of counts) {
  if (c > 1) { console.log("DUPLICATED", n, c); bad++; }
}
const want = ["damOsmPrewarm","damOsmMaybe","damApplyOsm","damAskOsm","damConverter","damSlopeUI",
  "damProfile","damTiming","damReadout","damLimits","damPlan","damSelect","damSearchRender"];
for (const n of want) if (!counts.has(n)) { console.log("MISSING", n); bad++; }
console.log(bad ? "problems: " + bad : "no duplicates, all key functions present (" + counts.size + " functions)");