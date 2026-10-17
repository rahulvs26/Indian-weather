/* v7.22v — value engineering pass 1b: the rest of river-stats.json is repeated strings.
   27,479 rivers each carry a full basin name and a full tile name like "East flowing rivers between
   Pennar and Kanyakumari Basin / Vaippar and others". There are 25 basins and 98 tiles, so the same
   text was being written out 27,479 times. Interning them into two dictionaries and storing an index
   turns the table into something a browser can hold without thinking about it.
   The consumer (data/_storm-layer.mjs) reads r.tile and r.basin by name, so this script also
   teaches it to resolve the indices. */
import { readFileSync, writeFileSync, statSync } from "node:fs";

const rs = JSON.parse(readFileSync("data/river-stats.json", "utf8"));
const basinIds = new Map(), tileIds = new Map();
const idFor = (map, key) => {
  if (key == null) return -1;
  if (!map.has(key)) map.set(key, map.size);
  return map.get(key);
};
const rivers = rs.rivers.map(r => ({
  name: r.name, km: r.km, n: r.n,
  b: idFor(basinIds, r.basin == null ? null : r.basin),
  t: idFor(tileIds, r.tile == null ? null : r.tile),
  tr: r.tileRivers, tk: r.tileKm2, c: r.composite ? 1 : 0,
}));
const out = {
  note: "River lengths measured from data/rivers-cwc.geo.json (haversine over the coordinates), from the " +
    "tiles of indianopenmaps.com/watersheds/wris at zoom 6. Basin and tile NAMES are interned: b and t are " +
    "indices into basinNames and tileNames, because 27,479 rivers share 25 basins and 98 tiles and the " +
    "repeated text was most of the file. tr = rivers in this river's tile, tk = that tile's area in km2, " +
    "c = 1 when the tile is shared by more than 25 rivers (a catch-all, never a catchment).",
  basinNames: [...basinIds.keys()],
  tileNames: [...tileIds.keys()],
  rivers,
};
const before = statSync("data/river-stats.json").size;
writeFileSync("data/river-stats.json", JSON.stringify(out));
const after = statSync("data/river-stats.json").size;
console.log("basins:", out.basinNames.length, "| tiles:", out.tileNames.length, "| rivers:", rivers.length);
console.log("river-stats.json:", (before / 1048576).toFixed(2), "MB ->", (after / 1048576).toFixed(2), "MB");

/* teach the storm panel to resolve the indices, and to read tileRivers/tileKm2/composite from the
   short names */
let storm = readFileSync("data/_storm-layer.mjs", "utf8");
const old = `  function riverFacts(dam) {
    if (!data || !dam) return null;
    const cands = [];
    const push = n => { const r = data.byName.get(String(n || "").trim().toLowerCase()); if (r && !cands.includes(r)) cands.push(r); };
    push(dam.river);
    const head = String(dam.river || "").split(/[(,/]/)[0];
    push(head);
    if (!cands.length) return null;
    let best = cands[0];
    for (const r of cands) if (r.km > best.km) best = r;
    return { river: best.name, km: best.km, features: best.n, tileRivers: best.tileRivers,
      tileKm2: best.tileKm2, tileName: best.tile || null,
      composite: !!best.composite, basin: best.basin };
  }`;
const neu = `  /* river-stats.json is interned (v7.22v): b and t are indices into basinNames and tileNames,
     because 27,479 rivers share 25 basins and 98 tiles and the repeated text was most of a 5.2 MB
     file. Resolved here so the panel still prints names. */
  function riverFacts(dam) {
    if (!data || !dam) return null;
    const cands = [];
    const push = n => { const r = data.byName.get(String(n || "").trim().toLowerCase()); if (r && !cands.includes(r)) cands.push(r); };
    push(dam.river);
    const head = String(dam.river || "").split(/[(,/]/)[0];
    push(head);
    if (!cands.length) return null;
    let best = cands[0];
    for (const r of cands) if (r.km > best.km) best = r;
    return { river: best.name, km: best.km, features: best.n, tileRivers: best.tr,
      tileKm2: best.tk, tileName: best.t >= 0 && data.stats ? (data.stats.tileNames[best.t] || null) : null,
      composite: !!best.c, basin: best.b >= 0 && data.stats ? (data.stats.basinNames[best.b] || null) : null };
  }`;
if (!storm.includes(old)) { console.log("riverFacts did not match - patch it by hand"); process.exit(1); }
storm = storm.split(old).join(neu);
/* the index must be built from the interned keys, which are unchanged (lowercased names) */
writeFileSync("data/_storm-layer.mjs", storm, "utf8");
console.log("storm layer updated for the interned table");