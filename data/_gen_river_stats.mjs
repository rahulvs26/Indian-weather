/* v7.22k — build data/river-stats.json: what we actually know about each river, measured from the
   CWC network, because the sub-basin tiles are far too coarse to be called a catchment.

   Why this exists (measured, see _subbasin_probe.mjs output):
     the tile that contains Irukkangudi dam is named "Vaippar and others" and holds 126 separate
     rivers and 2,366 km of channel over 19,937 km2, while the Vaippar itself is 79 km. Calling
     that tile the dam's catchment overstates the area by more than an order of magnitude, and the
     storm panel was printing 19,937 km2 as the catchment. The tile name says "and others" - the
     data was saying so and the first version did not look.

   This table gives, for every river name in the network:
     km        total mapped channel length (haversine over the coordinates)
     n         how many features carry that name
     tiles     the sub-basin tiles the river appears in, with each tile's river count and area
     composite TRUE when the river shares its tile with many other rivers, i.e. the tile is a
               catch-all and must never be presented as this river's catchment

   It ships as a small JSON (names + numbers only, no geometry) so the storm panel can say what it
   really knows without pulling the 14.6 MB network into the browser. */
import { readFileSync, writeFileSync } from "node:fs";

const havKm = (a, b) => {
  const R = 6371, rd = x => x * Math.PI / 180;
  const dLa = rd(b[1] - a[1]), dLo = rd(b[0] - a[0]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rd(a[1])) * Math.cos(rd(b[1])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const geomKm = f => {
  const g = f.geometry; if (!g) return 0;
  const cs = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  let s = 0;
  for (const c of cs) for (let i = 1; i < c.length; i++) s += havKm(c[i - 1], c[i]);
  return s;
};

const rivers = JSON.parse(readFileSync("data/rivers-cwc.geo.json", "utf8"));
const areas = JSON.parse(readFileSync("data/subbasin-areas.json", "utf8"));

/* how many distinct rivers sit in each tile, so a catch-all tile can be recognised */
const tileRivers = new Map();
for (const f of rivers.features) {
  const t = f.properties.subbasin || "";
  if (!tileRivers.has(t)) tileRivers.set(t, new Set());
  tileRivers.get(t).add(f.properties.rivname || "");
}
const tileArea = new Map(areas.subbasins.map(s => [s.name.replace(/^.*\/\s*/, ""), s.km2]));

const rows = new Map();
for (const f of rivers.features) {
  const p = f.properties || {};
  const name = (p.rivname || "").trim();
  if (!name) continue;
  let row = rows.get(name);
  if (!row) {
    row = { name, km: 0, n: 0, basins: new Set(), tiles: new Set() };
    rows.set(name, row);
  }
  row.km += geomKm(f);
  row.n += 1;
  if (p.basin) row.basins.add(p.basin);
  if (p.subbasin) row.tiles.add(p.subbasin);
}

const out = [];
for (const row of rows.values()) {
  const tiles = [...row.tiles].map(t => {
    const short = t.replace(/^.*\/\s*/, "");
    return {
      name: short,
      rivers: tileRivers.get(t) ? tileRivers.get(t).size : 0,
      km2: tileArea.get(short) ?? null,
      /* a tile whose own name ends in "and others" is a catch-all by its own admission */
      catchAll: /and others/i.test(t),
    };
  });
  /* composite: the river sits in a tile shared by many rivers, so tile area != this river's area */
  const worst = tiles.reduce((a, b) => (b.rivers > (a ? a.rivers : -1) ? b : a), null);
  out.push({
    name: row.name,
    km: +row.km.toFixed(1),
    n: row.n,
    basin: [...row.basins][0] || null,
    tiles,
    composite: !!worst && worst.rivers > 25,
    tileRivers: worst ? worst.rivers : 0,
    tileKm2: worst ? worst.km2 : null,
  });
}
out.sort((a, b) => b.km - a.km);

const payload = {
  note: "River lengths measured from data/rivers-cwc.geo.json (haversine over the coordinates). " +
    "'tiles' are CWRD sub-basin tiles from data/subbasins.geo.json with the number of distinct " +
    "rivers each one holds. A tile is NOT a catchment: where 'composite' is true the tile holds " +
    "more than 25 rivers, so its area must not be presented as this river's catchment area. No " +
    "per-river catchment area is recorded in the sources used.",
  rivers: out,
};
writeFileSync("data/river-stats.json", JSON.stringify(payload));
writeFileSync("data/_river-stats.json", JSON.stringify(payload));

console.log("rivers indexed:", out.length);
console.log("composite tiles (tile area must NOT be used as the catchment):", out.filter(r => r.composite).length);
console.log("\nthe rivers the deck's featured dams sit on:");
for (const q of ["Vaippar", "Kaveri", "Cauvery", "Sutlej", "Mahanadi", "Narmada", "Bhagirathi", "Krishna"]) {
  const hits = out.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  for (const h of hits.slice(0, 2))
    console.log("  ", h.name.padEnd(18), String(h.km).padStart(7), "km |", h.n, "features | tile",
      h.tileRivers, "rivers |", h.tileKm2, "km2 |", h.composite ? "COMPOSITE" : "single-river tile");
}