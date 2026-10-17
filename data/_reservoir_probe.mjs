/* v7.22o — what do we have for reservoirs, and is the shapefile in Shape files/ better?
   The deck draws data/reservoirs.geo.json on the 2D map already (app.js:422), but the 3D map has no
   reservoir layer at all. Before building one, measure:
     - how many polygons, how many carry a published area, and how those areas sum
     - whether Shape files/reservoir/Reservoir.shp adds features or attributes we lack
   Answer decides whether to convert the shapefile (6,152 features, needs the LCC inverse) or to use
   what is already shipped. */
import { readFileSync } from "node:fs";
import { readDbf, readShp, makeLccInverse, ringAreaKm2, toGeoJSON } from "./_shp.mjs";

const cur = JSON.parse(readFileSync("data/reservoirs.geo.json", "utf8"));
console.log("data/reservoirs.geo.json:", cur.features.length, "features");
console.log("  properties:", Object.keys(cur.features[0].properties || {}).join(", "));
const types = {};
for (const f of cur.features) types[f.geometry.type] = (types[f.geometry.type] || 0) + 1;
console.log("  geometry:", JSON.stringify(types));
const withArea = cur.features.filter(f => f.properties && f.properties.area > 0);
const areaSum = withArea.reduce((s, f) => s + (+f.properties.area), 0);
console.log("  with a published area:", withArea.length, "| summed:", Math.round(areaSum).toLocaleString("en-IN"), "km2");
const geos = withArea.filter(f => f.geometry.type === "Polygon");
let geoSum = 0, nGeo = 0;
const R = 6371.0088, rad = d => d * Math.PI / 180;
const ringArea = ring => {
  let t = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    t += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(t * R * R / 2);
};
for (const f of geos) { geoSum += ringArea(f.geometry.coordinates[0]); nGeo++; }
console.log("  geodesic area of", nGeo, "Polygon features:", Math.round(geoSum).toLocaleString("en-IN"), "km2");
console.log("  largest published areas:");
for (const f of withArea.sort((a, b) => (+b.properties.area) - (+a.properties.area)).slice(0, 8))
  console.log("   ", String(f.properties.res_name).slice(0, 26).padEnd(27), String(f.properties.area).padStart(9), "km2 |", String(f.properties.river || "").slice(0, 22));

console.log("\nShape files/reservoir/Reservoir.shp:");
const shp = readShp("Shape files/reservoir/Reservoir.shp");
const dbf = readDbf("Shape files/reservoir/Reservoir.dbf");
console.log("  records", shp.records.length, "| fields:", dbf.fields.map(f => f.name).join(", "));
const inv = makeLccInverse();
let sArea = 0, sWith = 0, sGeo = 0;
for (let i = 0; i < shp.records.length; i++) {
  const r = shp.records[i], a = dbf.rows[i] || {};
  if (a.area > 0) { sArea += +a.area; sWith++; }
  if (r.rings) {
    const ring = r.rings[0].coords.map(p => inv(p[0], p[1]));
    sGeo += ringArea(ring);
  }
}
console.log("  with a published area:", sWith, "| summed:", Math.round(sArea).toLocaleString("en-IN"), "km2");
console.log("  geodesic area, all records:", Math.round(sGeo).toLocaleString("en-IN"), "km2");

/* does the shapefile know about the dams the deck features? */
const feats = ["Hirakud", "Sardar Sarovar", "Tehri", "Bhakra", "Mettur", "Nagarjuna", "Srisailam", "Tawa"];
console.log("\n  the deck's featured dams, by name in either source:");
for (const q of feats) {
  const inShp = dbf.rows.filter(r => /" + q + /i.test(r.res_name || "")).length;
  const inCur = cur.features.filter(f => /" + q + /i.test(f.properties.res_name || "")).length;
  console.log("   ", q.padEnd(16), "shapefile:", inShp, "| current:", inCur);
}