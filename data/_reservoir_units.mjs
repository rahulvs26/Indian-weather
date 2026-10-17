/* v7.22o — units check, and a name-match check done properly.
   The first probe read "Indira Sagar 84,841.6 km2", which is absurd - the reservoir is about 600-850
   km2. Two suspects: a wrong column in data/reservoirs.geo.json, or a unit nobody has stated.
   Decided by measurement: compare each source's stated area against the geodesic area of its own
   geometry. Whichever ratio is near a round number is the true unit. */
import { readFileSync } from "node:fs";
import { readDbf, readShp, makeLccInverse } from "./_shp.mjs";

const R = 6371.0088, rad = d => d * Math.PI / 180;
const ringArea = ring => {
  let t = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    t += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(t * R * R / 2);
};
const geoAreaKm2 = f => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let s = 0;
  for (const p of polys) for (const r of p) s += ringArea(r);
  return s;
};

console.log("A. data/reservoirs.geo.json - stated area vs its own geometry");
const cur = JSON.parse(readFileSync("data/reservoirs.geo.json", "utf8"));
const pairs = cur.features.filter(f => f.properties && f.properties.area > 0 && f.geometry.type === "Polygon")
  .map(f => ({ n: f.properties.res_name, s: +f.properties.area, g: geoAreaKm2(f) }))
  .filter(p => p.g > 0.01);
const rCur = pairs.map(p => p.s / p.g).sort((a, b) => a - b);
console.log("   features compared:", pairs.length);
console.log("   stated/geometric ratio: p05", rCur[Math.floor(rCur.length * .05)].toFixed(1),
  "| median", rCur[Math.floor(rCur.length / 2)].toFixed(1), "| p95", rCur[Math.floor(rCur.length * .95)].toFixed(1));
console.log("   -> the column is therefore about", Math.round(rCur[Math.floor(rCur.length / 2)]), "x the real area");

console.log("\nB. Shape files/reservoir/Reservoir.shp - stated area vs its own geometry");
const shp = readShp("Shape files/reservoir/Reservoir.shp");
const dbf = readDbf("Shape files/reservoir/Reservoir.dbf");
const inv = makeLccInverse();
const pairs2 = [];
for (let i = 0; i < shp.records.length; i++) {
  const r = shp.records[i], a = dbf.rows[i] || {};
  if (!(a.area > 0) || !r.rings) continue;
  let g = 0;
  for (const ring of r.rings) g += ringArea(ring.coords.map(p => inv(p[0], p[1])));
  if (g > 0.01) pairs2.push({ n: a.res_name, s: +a.area, g });
}
const r2 = pairs2.map(p => p.s / p.g).sort((a, b) => a - b);
console.log("   features compared:", pairs2.length);
console.log("   stated/geometric ratio: p05", r2[Math.floor(r2.length * .05)].toFixed(2),
  "| median", r2[Math.floor(r2.length / 2)].toFixed(2), "| p95", r2[Math.floor(r2.length * .95)].toFixed(2));
console.log("   -> 100 means the column is hectares; 1 means km2");

console.log("\nC. the deck's featured dams, matched properly this time");
const curNames = cur.features.map(f => (f.properties.res_name || "").toLowerCase());
const shpNames = dbf.rows.map(r => (r.res_name || "").toLowerCase());
const probe = ["Hirakud", "Sardar Sarovar", "Tehri", "Bhakra", "Gobind Sagar", "Mettur", "Nagarjuna",
  "Srisailam", "Tawa", "Indira Sagar", "Gandhi Sagar", "Omkareshwar", "Idukki"];
for (const q of probe) {
  const key = q.toLowerCase().replace(/[^a-z ]/g, "");
  const c = curNames.filter(n => n.includes(key)).slice(0, 2);
  const s = shpNames.filter(n => n.includes(key)).slice(0, 2);
  console.log("   ", q.padEnd(17), "current:", (c.join(" | ") || "-").padEnd(34), "shapefile:", s.join(" | ") || "-");
}

console.log("\nD. biggest reservoirs with a verified area (shapefile, hectares -> km2)");
const big = pairs2.sort((a, b) => b.g - a.g).slice(0, 10);
for (const p of big)
  console.log("   ", String(p.n).slice(0, 28).padEnd(29), "stated", String(p.s).padStart(9), "ha =",
    (p.s / 100).toFixed(1).padStart(8), "km2 | geometry", p.g.toFixed(1).padStart(7), "km2");