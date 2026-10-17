/* v7.22o — put the reservoir areas in km2 and say where they come from.
   Measured (data/_reservoir_units.mjs): the `area` column in data/reservoirs.geo.json and in
   Shape files/reservoir/Reservoir.shp is in HECTARES, and nobody had said so. The ratio of the stated
   number to the geodesic area of the same polygon is 98.5 for the shipped file and 96.1 for the
   shapefile (p05-p95 94-98), i.e. ~100 with the mapped outline about 4% small, which is what a
   generalised shoreline does. So:
     Indira Sagar 84,841 -> 848 km2   (published 848)
     Hirakud      64,526 -> 645 km2   (published ~641)
     Srisailam    48,554 -> 485 km2   (published ~475)
   Left alone, every one of those was printed as if it were square kilometres - "Indira Sagar
   84,841 km2", a reservoir the size of a small country.

   This adds `area_km2` (the stated figure converted) and `area_geom_km2` (measured from the polygon)
   to every feature, and keeps `area` untouched so nothing that already reads it breaks. The 2D popup
   and the new 3D layer both use area_km2. */
import { readFileSync, writeFileSync } from "node:fs";

const R = 6371.0088, rad = d => d * Math.PI / 180;
const ringArea = ring => {
  if (!ring || ring.length < 4) return 0;
  let t = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    t += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(t * R * R / 2);
};

const path = "data/reservoirs.geojson";
let fc;
try { fc = JSON.parse(readFileSync("data/reservoirs.geo.json", "utf8")); }
catch { fc = JSON.parse(readFileSync("data/reservoirs.geo.json", "utf8")); }

let statedKm2 = 0, geomKm2 = 0, n = 0;
for (const f of fc.features) {
  const p = f.properties || (f.properties = {});
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let g = 0;
  for (const poly of polys) for (const r of poly) g += ringArea(r);
  if (p.area > 0) { p.area_km2 = +(p.area / 100).toFixed(2); statedKm2 += p.area_km2; }
  if (g > 0) { p.area_geom_km2 = +g.toFixed(2); geomKm2 += g; }
  n++;
}
fc.note = "Water bodies from WRIS / IndiaWRIS (reservoirs.geojson in ramSeraph/indian_water_features, "
  + "release 'waterbodies'; CC0 with attribution to datameet and the original government source). "
  + "The source's `area` field is in HECTARES and is kept unchanged for compatibility; `area_km2` is "
  + "that figure divided by 100, and `area_geom_km2` is the geodesic area of the polygon as mapped "
  + "(about 4% smaller, because shorelines are generalised). Units established by measurement in "
  + "data/_reservoir_units.mjs, not assumed.";
writeFileSync(path, JSON.stringify(fc));
console.log("reservoirs:", n);
console.log("stated area as km2:", Math.round(statedKm2).toLocaleString("en-IN"));
console.log("measured from the polygons:", Math.round(geomKm2).toLocaleString("en-IN"), "km2");
console.log("wrote", path);
const big = fc.features.filter(f => f.properties.area_km2).sort((a, b) => b.properties.area_km2 - a.properties.area_km2).slice(0, 5);
for (const f of big) console.log("  ", String(f.properties.res_name).slice(0, 26).padEnd(27), f.properties.area_km2, "km2 (mapped", f.properties.area_geom_km2, ")");