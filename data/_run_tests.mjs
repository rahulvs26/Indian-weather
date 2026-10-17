/* v7.22w — run every suite that needs no browser, and print one verdict.
   The browser-side probe lives in data/_probe.mjs and is run separately against a live page. */
import { spawnSync } from "node:child_process";

const suites = [
  ["static smoke", "_smoke.mjs", "wiring, contracts, payload"],
  ["hydrology", "_hydrology.test.mjs", "Curve Number arithmetic vs hand-worked values"],
  ["crossings", "_crossings.test.mjs", "reservoir crossings vs known geometry"],
  ["dem sampler", "_dem_sampler.test.mjs", "tabled mesh sampler is bit-identical to hAt()"],
  ["route engine", "_route_engine_check.mjs", "400 dams: routing, up-flow, timing"],
  ["OSM refiner", "_osm-refine.test.mjs", "corridor, end snap, max-deviation cap"],
  ["projection", "_crs_check.mjs", "India LCC inverse vs the Dam file's own lat/lon"],
];

let bad = 0;
const rows = [];
for (const [name, file, what] of suites) {
  const r = spawnSync(process.execPath, ["data/" + file], { encoding: "utf8", timeout: 600000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const okExit = r.status === 0;
  const fails = (out.match(/^FAIL/gm) || []).length;
  const passed = (out.match(/\bOK\b/g) || []).length;
  const line = okExit ? (out.includes("all checks passed") ? "all passed" : `no failures reported`)
    : `${fails} FAIL`;
  rows.push({ name, ok: okExit, line, passed });
  if (!okExit) bad++;
}
console.log("TEST SUITE".padEnd(16) + "RESULT".padEnd(22) + "CHECKS   COVERS");
console.log("-".repeat(88));
for (const r of rows) {
  console.log(r.name.padEnd(16) + (r.ok ? "pass  " : "FAIL  ") + r.line.padEnd(22) +
    String(r.passed).padStart(5) + "   " + suites.find(s => s[0] === r.name)[2]);
}
console.log("-".repeat(88));
console.log(rows.filter(r => r.ok).length + " of " + rows.length + " suites pass" +
  (bad ? "  -- " + bad + " FAILING" : ""));
console.log("\nNot covered here, by design:");
console.log("  data/_probe.mjs  - the browser-side performance and smoke probe. It needs a running page,");
console.log("                     so it is not a child process. See PERFORMANCE.md for how to run it");
console.log("                     against any URL, local or deployed.");
console.log("  visual layout    - nothing in this project can see itself. Screenshots were unavailable and");
console.log("                     readPixels returns black on this MapLibre build. See PERFORMANCE.md 3.");