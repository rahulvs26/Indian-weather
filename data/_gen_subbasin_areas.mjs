/* v7.22 — build data/subbasin-areas.json: the geodesic area of every sub-basin and basin polygon
   we already ship. This replaces a bad estimate (Hack's law, which produced 2.25 million km² for
   one basin) with measured geometry: the polygons are the real CWRD-style basins, and the area is
   computed from their coordinates, so every figure can be checked against the published total.
   Sanity check at the end: the sum of basin areas should land near India's 3,287,263 km². */
import {readFileSync, writeFileSync} from "node:fs";

/* spherical excess area of a ring (spherical polygon formula, R = 6371.0088 km) */
function ringAreaKm2(ring) {
  if (!ring || ring.length < 3) return 0;
  const R = 6371.0088, rad = d => d * Math.PI / 180;
  let total = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    total += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(total * R * R / 2);
}
function geomAreaKm2(g) {
  if (!g) return 0;
  if (g.type === "Polygon") return ringAreaKm2(g.coordinates[0]);
  if (g.type === "MultiPolygon") return g.coordinates.reduce((s, poly) => s + ringAreaKm2(poly[0]), 0);
  return 0;
}
const nameOf = f => {
  const p = f.properties || {};
  return (p.ba_name ? p.ba_name + " / " : "") + (p.sub_basin || p.ba_name || "unnamed");
};

const out = { note: "Areas computed geodesically from the polygon geometry in subbasins.geo.json / basins.geo.json (sphere R=6371.0088 km). Basin rows also carry the published area_sqkm where the shapefile stated one.", subbasins: [], basins: [] };

const sub = JSON.parse(readFileSync("data/subbasins.geo.json", "utf8"));
for (const f of sub.features) {
  const km2 = geomAreaKm2(f.geometry);
  if (km2 > 0) out.subbasins.push({ name: nameOf(f), basin: (f.properties || {}).ba_name || null, km2: Math.round(km2) });
}
out.subbasins.sort((a, b) => b.km2 - a.km2);

const bas = JSON.parse(readFileSync("data/basins.geo.json", "utf8"));
for (const f of bas.features) {
  const p = f.properties || {};
  out.basins.push({ name: p.ba_name, km2: Math.round(geomAreaKm2(f.geometry)), publishedKm2: p.area_sqkm == null ? null : +p.area_sqkm, state: p.state });
}
out.basins.sort((a, b) => b.km2 - a.km2);

const subSum = out.subbasins.reduce((s, r) => s + r.km2, 0);
const basSum = out.basins.reduce((s, r) => s + r.km2, 0);
const pubSum = out.basins.reduce((s, r) => s + (r.publishedKm2 || 0), 0);
out.meta = {
  subbasins: out.subbasins.length,
  basins: out.basins.length,
  subbasinSumKm2: subSum,
  basinSumKm2: basSum,
  publishedSumKm2: pubSum,
  indiaKm2: 3287263,
  note: "The sub-basins tile India, so their areas should sum to the country; the basins tile it too."
};
writeFileSync("data/subbasin-areas.json", JSON.stringify(out, null, 1));

console.log("subbasins", out.subbasins.length, "sum", Math.round(subSum), "km2");
console.log("basins    ", out.basins.length, "geometry sum", Math.round(basSum), "km2 | published sum", Math.round(pubSum), "km2");
console.log("India     ", 3287263, "km2");
console.log("\nlargest sub-basins:");
for (const r of out.subbasins.slice(0, 8)) console.log("  ", r.name.padEnd(44), r.km2, "km2");
console.log("\nbasin geometry vs published (top 8):");
for (const r of out.basins.slice(0, 8)) console.log("  ", String(r.name).slice(0, 34).padEnd(35), "geom", String(r.km2).padStart(8), "published", String(r.publishedKm2).padStart(8));