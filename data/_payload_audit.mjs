/* v7.22v — which data files does the RUNNING app actually fetch?
   The first audit counted a file as "used" if any file mentioned its name, and that counted build
   scripts. A generator mentioning subbasin-areas.json is not the browser downloading it. So this
   checks only the files the browser executes: index.html, app.js, map3d.js, styles.css and the
   modules those import. Anything that only a _gen_*.mjs mentions is weight on disk that a user never
   pays for and a maintainer still has to reason about. */
import { readFileSync, readdirSync, statSync } from "node:fs";

/* the browser-executed set, following imports from the two entry modules */
const entry = ["index.html", "app.js", "map3d.js"];
const seen = new Set();
const findImports = (src) => [...src.matchAll(/from\s+"([^"]+)"/g)].map(m => m[1])
  .filter(p => p.startsWith("./") || p.startsWith("../"));
const queue = [...entry];
const loaded = new Map();          /* path -> bytes, for every JS file the browser runs */
while (queue.length) {
  const f = queue.shift();
  if (seen.has(f) || !exists(f)) continue;
  seen.add(f);
  loaded.set(f, statSync(f).size);
  const src = readFileSync(f, "utf8");
  for (const imp of findImports(src)) {
    const base = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
    queue.push(base + imp.replace("./", ""));
  }
}
function exists(f) { try { statSync(f); return true; } catch { return false; } }

console.log("modules the browser executes:");
for (const [f, b] of [...loaded].sort((a, b) => b[1] - a[1]))
  console.log("  " + f.padEnd(30), (b / 1024).toFixed(1).padStart(8) + " KB");

/* now every data file, and whether the running app fetches it */
const appSrc = [...loaded.keys()].map(f => readFileSync(f, "utf8")).join("\n");
const genSrc = readdirSync("data").filter(f => /^_(gen|repair|slim|add|wire|fix|validate|probe|inspect|reservoir|polygon|subbasin|kml|shp|watershed|crs|strip|cost|commit)/i.test(f))
  .map(f => { try { return readFileSync("data/" + f, "utf8"); } catch { return ""; } }).join("\n");

console.log("\ndata files, and who asks for them:");
const rows = [];
for (const f of readdirSync("data")) {
  if (!f.endsWith(".json") && !f.endsWith(".geo.json") && !f.endsWith(".geojson")) continue;
  const kb = statSync("data/" + f).size / 1024;
  const inApp = appSrc.includes(f);
  const inGen = genSrc.includes(f);
  rows.push({ f, kb, state: inApp ? "LOADED BY APP" : (inGen ? "only a build script" : "nothing at all") });
}
rows.sort((a, b) => b.kb - a.kb);
let loadedKb = 0, genKb = 0, noneKb = 0;
for (const r of rows) {
  if (r.state === "LOADED BY APP") loadedKb += r.kb;
  else if (r.state === "only a build script") genKb += r.kb;
  else noneKb += r.kb;
  if (r.kb > 100 || r.state !== "LOADED BY APP")
    console.log("  " + r.f.padEnd(30), r.kb.toFixed(0).padStart(7) + " KB  " + r.state);
}
console.log("\n  fetched by the app:      " + (loadedKb / 1024).toFixed(1) + " MB across " +
  rows.filter(r => r.state === "LOADED BY APP").length + " files");
console.log("  build-script intermediates: " + (genKb / 1024).toFixed(1) + " MB across " +
  rows.filter(r => r.state === "only a build script").length + " files");
console.log("  referenced by nothing:    " + (noneKb / 1024).toFixed(1) + " MB across " +
  rows.filter(r => r.state === "nothing at all").length + " files");

/* the reservoir duplication in particular, and whether the 2D popup's field exists in the file it reads */
console.log("\nthe two reservoir files (tolerant of one being gone - this audit exists to notice that):");
for (const f of ["data/reservoirs.geo.json", "data/reservoirs.geojson"]) {
  let j;
  try { j = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log("  " + f.padEnd(28), "absent -", e.code); continue; }
  const p = j.features[0].properties;
  console.log("  " + f.padEnd(28), j.features.length, "features | fields:", Object.keys(p).join(","),
    "| area_km2 present:", "area_km2" in p);
}
const twoDreads = /getJSON\("data\/reservoirs\.geojson?"/.test(appSrc);
const twoDFile = (appSrc.match(/getJSON\("(data\/reservoirs\.geojson?)"/) || [])[1] || "";
let mismatch = false;
try {
  const j = JSON.parse(readFileSync(twoDFile, "utf8"));
  const p = j.features[0].properties;
  if (appSrc.includes("area_km2") && !("area_km2" in p)) mismatch = true;
} catch (_) { mismatch = true; }
console.log("  the 2D map reads:", twoDFile || "?", "| mismatch with the fields it prints:", mismatch ? "YES - a bug" : "no");

/* river-stats: how big is it versus what the storm panel actually asks of it */
console.log("\nriver-stats.json:");
const rs = JSON.parse(readFileSync("data/river-stats.json", "utf8"));
console.log("  rivers:", rs.rivers.length, "| bytes:", (JSON.stringify(rs).length / 1024).toFixed(0), "KB");
console.log("  fields per river:", Object.keys(rs.rivers[0]).join(","));
const needed = rs.rivers.map(r => [r.name, r.km, r.n, r.tileRivers, r.composite]);
console.log("  a name/length/area lookup table would be:",
  (JSON.stringify(Object.fromEntries(needed)).length / 1024).toFixed(0), "KB");
console.log("  the fields the storm panel never reads (tiles array):",
  (JSON.stringify(rs.rivers.map(r => r.tiles)).length / 1024).toFixed(0), "KB");