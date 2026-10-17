/* v7.22m — build data/watersheds.json from the WRIS watershed tiles.

   The source: https://indianopenmaps.com/watersheds/wris/{z}/{x}/{y}.pbf, published in
   https://github.com/ramSeraph/indian_water_features/releases/tag/hydro-boundaries as
   WRIS_Watershed.geojsonl.7z (source IndiaWRIS, licence CC0 with attribution). The tile form is
   used deliberately: it is only what covers India, it decodes with the repo's own data/_mvt.mjs, and
   it avoids pulling a bulk archive.

   Each feature carries its own published catchment area, which is the whole point:
       wsconc      watershed code, e.g. A01GIL07
       sbcode      sub-basin code      bacode  basin code
       area_sqkm   the catchment area, from the source
       st_area(shape)  the same number in m2, and st_length(shape) its perimeter

   Three tile realities this has to handle, all measured:
     1. Tiles carry a buffer, so one watershed appears in several tiles as a fragment, and the same
        fragment can appear in two tiles verbatim. Areas are therefore taken from area_sqkm, never
        summed from geometry - summing fragments would count a basin once per tile that clips it.
     2. Fragments are cut on tile boundaries, so their end points coincide exactly. The boundary is
        rebuilt by chaining fragments whose end point matches the next fragment's start.
     3. data/_mvt.mjs skipped polygon geometry entirely (it kept only points and lines), which is why
        the first run of this script reported zero layers. Polygon support (MoveTo/LineTo/ClosePath)
        has been added there.

   Sanity checks printed at the end, because a catchment set that does not add up to India is
   worse than no catchment set:
     - the summed published area against India's 3,287,263 km2
     - how many watersheds have a stitched boundary versus a single fragment
     - the watershed containing a known dam, as a spot check against the deck's own dam table */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { decodeTile } from "./_mvt.mjs";

const Z = 6;   /* fine level */
const CACHE = "data/_wtiles";
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => {
  const r = Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2 * 2 ** z);
};
const xs = [], ys = [];
for (let lon = 67; lon <= 98; lon += 0.5) xs.push(lon2x(lon, Z));
for (let lat = 5; lat <= 38; lat += 0.5) ys.push(lat2y(lat, Z));

const fetchTile = async (z, x, y) => {
  const file = `${CACHE}/${z}-${x}-${y}.pbf`;
  if (existsSync(file)) return readFileSync(file);
  try {
    const r = await fetch(`https://indianopenmaps.com/watersheds/wris/${z}/${x}/${y}.pbf`);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length) writeFileSync(file, b);
    return b;
  } catch (_) { return null; }
};

/* Two zoom levels are read. Measured: at z6 ten tiles over land return 404 - the published pyramid
   is sparse - which left whole districts (Mettur among them) with no watershed at all and the total
   at 96.6% of India. So after the z6 pass the z5 parent tiles are read as well, and any watershed
   code the finer level did not supply is taken from them. Areas always come from area_sqkm, so the
   coarser geometry that fills a gap costs accuracy of shape only, never of number. */
async function collect(z, label) {
  const tiles0 = [], miss = [];
  const xs = [], ys = [];
  for (let lon = 67; lon <= 98; lon += 0.5) xs.push(lon2x(lon, z));
  for (let lat = 5; lat <= 38; lat += 0.5) ys.push(lat2y(lat, z));
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) tiles0.push([x, y]);
  let got = 0;
  for (const [x, y] of tiles0) {
    const buf = await fetchTile(z, x, y);
    if (!buf) { miss.push([x, y]); continue; }
    got++;
    for (const f of decodeTile(buf, z, x, y)) {
      if (!f.tags || !f.geom || !f.geom.length) continue;
      const code = f.tags.wsconc || String(f.tags.objectid);
      let w = byCode.get(code);
      if (!w) {
        w = { code, area: +(f.tags.area_sqkm || 0), sb: f.tags.sbcode || null, ba: f.tags.bacode || null, parts: [], seen: new Set(), from: z };
        byCode.set(code, w);
      }
      if (w.area < +(f.tags.area_sqkm || 0)) w.area = +(f.tags.area_sqkm || 0);
      for (const ring of f.geom) {
        const key = ring.length + ":" + ring[0][0] + "," + ring[0][1] + ":" + ring[ring.length - 1][0] + "," + ring[ring.length - 1][1];
        if (w.seen.has(key)) { dup++; continue; }     /* the same fragment twice: a buffered overlap */
        w.seen.add(key);
        w.parts.push(ring);
        frags++;
      }
    }
  }
  console.log(label + ": " + got + "/" + tiles0.length + " tiles read, " + miss.length + " unreachable");
  return miss;
}

const byCode = new Map();
let frags = 0, dup = 0;
const missing6 = await collect(6, "zoom 6 (fine)");
/* fill the holes from the coarser parent level, which does exist for those areas */
await collect(5, "zoom 5 (fills the z6 gaps)");
void missing6;
console.log("distinct watersheds:", byCode.size);

/* Stitching fragments on shared endpoints was tried and dropped. Measured against the published
   areas it reproduced them for 72% of watersheds (median ratio 1.04) but collapsed to a degenerate
   4-14 point ring for some and merged wrongly for others, up to 3.9x too large - and a bad ring also
   breaks the point-in-polygon test, which is how a dam stopped finding its watershed at all.
   Since the areas come from the source and never from geometry, there is nothing to gain by
   stitching: the fragments are kept as they are, in a MultiPolygon, which draws seamlessly (they
   were cut on tile boundaries and share their edges) and contains the dam correctly. */
const out = [];
for (const w of byCode.values()) {
  if (!w.parts.length) continue;
  out.push({ code: w.code, area_km2: +w.area.toFixed(2), sb: w.sb, ba: w.ba, parts: w.parts.length, rings: w.parts });
}
out.sort((a, b) => b.area_km2 - a.area_km2);

const total = out.reduce((s, w) => s + w.area_km2, 0);
console.log("\nsum of published areas:", Math.round(total).toLocaleString("en-IN"), "km2"
  + " | India 3,287,263 km2 |", ((total / 3287263) * 100).toFixed(1) + "% of the country");
const partCounts = out.map(w => w.parts).sort((a, b) => a - b);
console.log("watersheds:", out.length, "| fragments each: median", partCounts[Math.floor(partCounts.length / 2)],
  "| p90", partCounts[Math.floor(partCounts.length * 0.9)], "| max", partCounts[partCounts.length - 1]);
console.log("largest 6 by published area:");
for (const w of out.slice(0, 6)) console.log("  ", w.code.padEnd(12), String(w.area_km2).padStart(9), "km2 | fragments", w.parts);

/* spot check: which watershed holds the dam - smallest containing wins, because fragments spill into
   the tile buffer and a larger neighbour can therefore contain the point by up to ~8 km */
const inRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const holds = (w, lon, lat) => w.rings.some(r => inRing(r, lon, lat));
for (const [name, lon, lat] of [["Irukkangudi (Vaippar)", 77.9815, 9.3363], ["Mettur (Kaveri)", 77.8085, 11.8017],
  ["Hirakud (Mahanadi)", 83.8539, 21.5184], ["Sardar Sarovar (Narmada)", 73.7241, 21.8585],
  ["Bhakra (Sutlej)", 76.4334, 31.4115], ["Tehri (Bhagirathi)", 78.4777, 30.3779],
  ["Nagarjuna Sagar (Krishna)", 79.2, 16.9], ["Nagarjunasagar check", 78.8, 16.87]]) {
  const hits = out.filter(w => holds(w, lon, lat)).sort((a, b) => a.area_km2 - b.area_km2);
  const h = hits[0];
  console.log("\n" + name + " ->", h ? `${h.code} = ${h.area_km2} km2 (smallest of ${hits.length} containing)`
    : "NO WATERSHED FOUND");
  if (h) console.log("   others containing:", hits.slice(1, 4).map(w => w.code + " " + w.area_km2).join(", ") || "none");
}

/* write: areas in a small lazy-loaded table, geometry in its own file */
const meta = out.map(w => ({ code: w.code, km2: w.area_km2, sb: w.sb, ba: w.ba, parts: w.parts }));
writeFileSync("data/watershed-areas.json", JSON.stringify({
  note: "Published WRIS watershed catchment areas. area_km2 is the source's own field, read from the feature properties of indianopenmaps.com/watersheds/wris tiles (zoom 6 with zoom 5 filling gaps). Source: IndiaWRIS via ramSeraph/indian_water_features, release 'hydro-boundaries'; CC0 with attribution to datameet and the original government source.",
  totalKm2: Math.round(total), indiaKm2: 3287263, count: out.length, watersheds: meta,
}));
const geo = { type: "FeatureCollection", features: out.map(w => ({
  type: "Feature", properties: { code: w.code, km2: w.area_km2, sb: w.sb, ba: w.ba, parts: w.parts },
  geometry: w.rings.length === 1
    ? { type: "Polygon", coordinates: [w.rings[0]] }
    : { type: "MultiPolygon", coordinates: w.rings.map(r => [r]) },
})) };
writeFileSync("data/watersheds.geo.json", JSON.stringify(geo));
console.log("\nwrote data/watershed-areas.json (" + (JSON.stringify(meta).length / 1024).toFixed(0) + " KB)"
  + " and data/watersheds.geo.json (" + (JSON.stringify(geo).length / 1048576).toFixed(1) + " MB)");