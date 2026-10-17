/* v7.22v — value engineering pass 1: remove weight that delivers nothing, and fix the regression
   the reservoir work introduced.

   Found by measurement (data/_payload_audit.mjs), not by opinion:

   1. A LIVE REGRESSION I caused. data/reservoirs.geo.json (the old file) and data/reservoirs.geojson
      (the repaired one, written in v7.22o) are two copies of the same 5,160 reservoirs. The 2D map
      reads the OLD one; the popup I edited in v7.22o prints p.area_km2, which only the NEW one has.
      So clicking a reservoir on the 2D map shows no area at all - I fixed the units and broke the
      field. One file, the repaired one, and the old one goes.

   2. river-stats.json is 5,209 KB and the storm panel reads six fields out of it. The tiles array
      alone is 1,972 KB and only one tile's name is ever shown. The trimmed table is ~500 KB.

   3. riverbanks.geo.json is 1,952 KB and nothing fetches it - it has been dead weight since it was
      added.

   Total avoidable payload: about 8.8 MB out of 39.3 MB the app can fetch, roughly 22%. */
import { readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from "node:fs";

/* ---- 1. one reservoir file ---- */
const oldP = "data/reservoirs.geo.json", newP = "data/reservoirs.geojson";
const appPath = "app.js";
let app = readFileSync(appPath, "utf8");
if (app.includes(oldP)) {
  app = app.split(oldP).join(newP);
  writeFileSync(appPath, app, "utf8");
  console.log("app.js now reads", newP);
}
unlinkSync(oldP);   /* the repaired file supersedes it */
console.log("deleted the stale", oldP, "-", (5195 / 1024).toFixed(1), "MB of duplicate reservoirs gone");

/* ---- 2. trim river-stats to what is read ---- */
const rs = JSON.parse(readFileSync("data/river-stats.json", "utf8"));
const trimmed = {
  note: rs.note + " Trimmed in v7.22v to the fields the storm panel reads: the tiles array was 1,972 KB " +
    "of the 5,209 KB and only one tile name is ever shown, so it is now a single tile per river.",
  rivers: rs.rivers.map(r => ({
    name: r.name, km: r.km, n: r.n, basin: r.basin,
    tile: r.tiles && r.tiles.length ? r.tiles[0].name : null,
    tileRivers: r.tileRivers, tileKm2: r.tileKm2, composite: !!r.composite,
  })),
};
const before = statSync("data/river-stats.json").size;
writeFileSync("data/river-stats.json", JSON.stringify(trimmed));
const after = statSync("data/river-stats.json").size;
console.log("river-stats.json:", (before / 1024).toFixed(0), "KB ->", (after / 1024).toFixed(0), "KB",
  "| rivers kept:", trimmed.rivers.length);

/* the storm panel reads tiles[0].name - point it at the new single-tile field */
const stormPath = "data/_storm-layer.mjs";
let storm = readFileSync(stormPath, "utf8");
const beforeStorm = storm;
storm = storm.replace("tileName: best.tiles && best.tiles.length ? best.tiles[0].name : null",
  "tileName: best.tile || null");
if (storm === beforeStorm) console.log("NOTE: the storm layer's tileName expression did not match");
writeFileSync(stormPath, storm, "utf8");
console.log("storm layer reads the trimmed field:", storm.includes("tileName: best.tile || null"));

/* ---- 3. the dead file ---- */
unlinkSync("data/riverbanks.geo.json");
console.log("deleted data/riverbanks.geo.json - 1,952 KB, fetched by nothing");