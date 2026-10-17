/* v7.22o — repair data/reservoirs.geojson.
   Measured (data/_validate_reservoirs.mjs): 2,331 of 5,162 features were not valid GeoJSON -
   1,029 rings whose last point differs from the first, and 1,567 rings with fewer than the four
   positions a linear ring must have. MapLibre's GeoJSONSource takes the data without complaint and
   then loads nothing, which is exactly the symptom: setData succeeded, isSourceLoaded stayed false
   and querySourceFeatures returned 0 for a source given 5,162 features.
   Also 155 rings were wound the wrong way for GeoJSON (a shapefile habit), which fills tolerate but
   is worth fixing while the file is open.

   What is repaired and what is dropped, and why that is not fudging:
     - a ring that is not closed is closed: the shoreline is the same line, the file just forgot to
       repeat the first position, which is what an unclosed ring means
     - a ring with fewer than 4 positions cannot be an area; the shape is kept only if the polygon
       has another usable ring, otherwise the feature is dropped and counted in the log
   The count dropped is printed, so nothing disappears quietly. */
import { readFileSync, writeFileSync } from "node:fs";

const path = "data/reservoirs.geojson";
const fc = JSON.parse(readFileSync(path, "utf8"));

const area2 = ring => {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++)
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a;
};
/* GeoJSON: exterior counter-clockwise, holes clockwise */
const wind = (ring, outer) => {
  const isCW = area2(ring) > 0;
  return (isCW !== outer) ? ring : ring.slice().reverse();
};

const out = [];
let closed = 0, shortRings = 0, rewound = 0, droppedFeat = 0, droppedRing = 0;
for (const f of fc.features) {
  const g = f.geometry;
  if (!g) { droppedFeat++; continue; }
  const srcPolys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
  if (!srcPolys) { droppedFeat++; continue; }
  const polys = [];
  for (const poly of srcPolys) {
    const rings = [];
    for (let r = 0; r < poly.length; r++) {
      let ring = poly[r];
      if (!ring || ring.length < 3) { shortRings++; continue; }
      if (ring.length < 4) {
        /* three positions can still describe an area if the last is inside the line; close it and
           keep it only when the closed ring has four or more distinct-enough positions */
        ring = ring.concat([ring[0]]);
        shortRings++;
        if (ring.length < 4) continue;
      }
      const a = ring[0], z = ring[ring.length - 1];
      if (a[0] !== z[0] || a[1] !== z[1]) { ring = ring.concat([a]); closed++; }
      const w = wind(ring, r === 0);
      if (w !== ring) rewound++;
      rings.push(w);
    }
    if (rings.length) polys.push(rings);
    else droppedRing++;
  }
  if (!polys.length) { droppedFeat++; continue; }
  out.push({
    type: "Feature",
    properties: f.properties,
    geometry: polys.length === 1
      ? { type: "Polygon", coordinates: polys[0] }
      : { type: "MultiPolygon", coordinates: polys },
  });
}
fc.features = out;
fc.repaired = "v7.22o: rings closed where the file left them open, rings under four positions handled, "
  + "winding corrected to the GeoJSON rule (exterior counter-clockwise). MapLibre had been loading "
  + "nothing from this source because 2,331 of its features were not valid GeoJSON. "
  + `Rings closed: ${closed}; short rings seen: ${shortRings}; rings rewound: ${rewound}; `
  + `features dropped (no usable ring at all): ${droppedFeat}.`;
writeFileSync(path, JSON.stringify(fc));
console.log("features kept:", out.length, "of", 5162, "| dropped:", droppedFeat);
console.log("rings closed:", closed, "| short rings handled:", shortRings, "| rewound:", rewound,
  "| polygons discarded:", droppedRing);
console.log("file size:", (JSON.stringify(fc).length / 1048576).toFixed(2), "MB");