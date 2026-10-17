/* v7.22l — are the 40,898 NWIC polygons in river_polygon_shp catchments, or ribbons of river surface?
   Decided by measurement, not by the field names:
     a catchment is compact  - its area grows roughly as the square of its span
     a channel ribbon is long and thin - area is span x width
   So: compute each polygon's own geodesic area and the span of its bounding box, and look at the
   ratio. Also group by ripcode (features sharing a ripcode belong to one river) and total them. */
import { readDbf, readShp, ringAreaKm2, makeLccInverse } from "./_shp.mjs";

const inv = makeLccInverse();          /* the shape files are in India LCC, not lat/lon */
const DIR = "Shape files/river_polygon_shp/";
const shp = readShp(DIR + "river_polygon.shp");
const dbf = readDbf(DIR + "river_polygon.dbf");

const feat = [];
for (let i = 0; i < shp.records.length; i++) {
  const r = shp.records[i], a = dbf.rows[i] || {};
  if (!r.rings) continue;
  const ring = r.rings[0].coords.map(p => inv(p[0], p[1]));   /* projected metres -> lon/lat */
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const spanKm = Math.max((maxX - minX) * 108, (maxY - minY) * 108);
  feat.push({
    name: a.rivname, rip: a.ripcode, areaKm2: ringAreaKm2(ring), spanKm,
    dbArea: a.shape_area == null ? null : +a.shape_area / 1e6,
  });
}

console.log("polygons read:", feat.length);
console.log("geodesic area vs the shapefile's own shape_area (m2 -> km2):");
const ratio = feat.filter(f => f.dbArea > 0.5).map(f => f.areaKm2 / f.dbArea);
ratio.sort((x, y) => x - y);
console.log("  median geodesic/shape_area ratio:", ratio[Math.floor(ratio.length / 2)]?.toFixed(3),
  "(~1 means my reader and the shapefile agree)");

console.log("\ncompactness = area / span^2.  A circle is 0.785; a long ribbon is far below 0.05.");
const comp = feat.filter(f => f.spanKm > 0.5).map(f => f.areaKm2 / (f.spanKm * f.spanKm)).sort((a, b) => a - b);
const pct = p => comp[Math.floor(comp.length * p)]?.toFixed(4);
console.log("  p10", pct(0.1), "| p50", pct(0.5), "| p90", pct(0.9), "| p99", pct(0.99));

console.log("\ntotal area of all polygons:", feat.reduce((s, f) => s + f.areaKm2, 0).toFixed(0), "km2"
  + "   (India is 3,287,263 km2 - so these cannot be catchments)");
console.log("largest single polygon:", Math.max(...feat.map(f => f.areaKm2)).toFixed(0), "km2");
console.log("median polygon:", comp.length ? "" : "", feat.map(f => f.areaKm2).sort((a, b) => a - b)[Math.floor(feat.length / 2)].toFixed(3), "km2");

/* group by ripcode = one river */
const byRip = new Map();
for (const f of feat) {
  const k = f.rip;
  let g = byRip.get(k);
  if (!g) { g = { rip: k, name: f.name, km2: 0, n: 0 }; byRip.set(k, g); }
  g.km2 += f.areaKm2; g.n++;
}
const rivers = [...byRip.values()].sort((a, b) => b.km2 - a.km2);
console.log("\nripcode groups (one per river):", rivers.length);
console.log("total across all rivers:", rivers.reduce((s, g) => s + g.km2, 0).toFixed(0), "km2");
console.log("largest 8 river groups:");
for (const g of rivers.slice(0, 8)) console.log("   rip", String(g.rip).padStart(3), g.name.padEnd(26),
  g.km2.toFixed(0).padStart(8), "km2 from", g.n, "polygons");

console.log("\nthe Vaippar specifically:");
const v = rivers.filter(g => /vaippar/i.test(g.name || ""));
for (const g of v) console.log("   rip", g.rip, g.name, g.km2.toFixed(1), "km2 from", g.n, "polygons");