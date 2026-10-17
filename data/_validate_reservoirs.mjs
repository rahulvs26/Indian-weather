/* v7.22o — validate data/reservoirs.geojson the way MapLibre will, because the source accepts the
   data and then loads nothing: GeoJSONSource drops features it cannot turn into tiles, and a single
   broken ring can leave the whole source empty with nothing thrown. Checks every polygon and ring:
   the positions are finite lon/lat inside India's envelope, the ring is closed, and it has at least
   four positions (the linear ring minimum). */
import { readFileSync } from "node:fs";

const fc = JSON.parse(readFileSync("data/reservoirs.geojson", "utf8"));
console.log("features:", fc.features.length);
let bad = 0, open = 0, short = 0, oob = 0, nonFinite = 0, holes = 0, totalRings = 0;
const badList = [];
for (let i = 0; i < fc.features.length; i++) {
  const f = fc.features[i], g = f.geometry;
  if (!g) { bad++; continue; }
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
  if (!polys) { bad++; badList.push([i, "geometry type " + g.type]); continue; }
  let fBad = null;
  for (const poly of polys) {
    if (poly.length > 1) holes++;
    for (let r = 0; r < poly.length; r++) {
      totalRings++;
      const ring = poly[r];
      if (!ring || ring.length < 4) { short++; fBad = fBad || "ring with " + (ring ? ring.length : 0) + " points"; continue; }
      const a = ring[0], z = ring[ring.length - 1];
      if (a[0] !== z[0] || a[1] !== z[1]) { open++; fBad = fBad || "ring not closed"; }
      for (const p of ring) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) { nonFinite++; fBad = fBad || "non-finite position"; break; }
        if (p[0] < 66 || p[0] > 99 || p[1] < 4 || p[1] > 39) { oob++; fBad = fBad || "position outside India " + p; break; }
      }
    }
  }
  if (fBad) { bad++; if (badList.length < 10) badList.push([i, fBad, (f.properties || {}).res_name]); }
}
console.log("rings:", totalRings, "| polygons with holes:", holes);
console.log("features with a problem:", bad, "| open rings:", open, "| rings under 4 points:", short,
  "| non-finite:", nonFinite, "| outside India's envelope:", oob);
for (const b of badList) console.log("   feature", b[0], "|", b[1], "|", b[2]);

/* What MapLibre also insists on: winding. Exterior rings counter-clockwise, holes clockwise. */
let wrongWind = 0;
for (const f of fc.features) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const poly of polys) for (let r = 0; r < poly.length; r++) {
    const ring = poly[r];
    let a2 = 0;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++)
      a2 += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    const isOuterCW = a2 > 0;           /* shapefile/source convention */
    if ((r === 0) === isOuterCW) wrongWind++;   /* GeoJSON wants the opposite */
  }
}
console.log("\nrings wound the wrong way for GeoJSON:", wrongWind, "of", totalRings);