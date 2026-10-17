/* v7.22 — check the hydrology module against arithmetic done by hand and against the published
   basin areas, not against the module's own output.
   Hand checks (metric NRCS Curve Number, NEH Part 630 Ch. 2):
     CN 70, P 25 mm  -> S = 25400/70 - 254 = 108.86 mm, Ia = 21.77 mm, excess 3.23 mm,
                        Q = 3.23²/(3.23 + 108.86) = 0.093 mm
     CN 80, P 50 mm  -> S = 63.50, Ia = 12.70, excess 37.30, Q = 37.3²/100.80 = 13.80 mm
     CN 45, P 100 mm -> S = 310.44, Ia = 62.09, excess 37.91, Q = 37.91²/348.36 = 4.13 mm
     CN 95, P 10 mm  -> S = 13.37, Ia = 2.67, excess 7.33, Q = 7.33²/20.70 = 2.59 mm
   Peak, rational method Q = C·i·A:
     C 0.60, 60 mm/h over 25 km²  -> 250.0 m³/s
     C 0.25, 30 mm/h over 100 km² -> 208.3 m³/s */
import { readFileSync } from "node:fs";
import { runoffDepth, peakDischarge, mountainSplit, stormModel, subbasinAt, CN_TABLE } from "./_hydrology.mjs";

let fails = 0;
const eq = (label, got, want) => {
  if (got !== want) fails++;
  console.log((got === want ? "OK   " : "FAIL ") + label.padEnd(44), "got", String(got), "expected", want);
};
const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log((ok ? "OK   " : "FAIL ") + label.padEnd(44), "got", String(got).padStart(10), "expected", want);
};

console.log("runoff depth (NRCS Curve Number, metric)");
near("CN 70, P 25 mm -> S", runoffDepth(25, 70).S, 108.86, 0.01);
near("CN 70, P 25 mm -> Ia", runoffDepth(25, 70).Ia, 21.77, 0.01);
near("CN 70, P 25 mm -> Q", runoffDepth(25, 70).Q, 0.09, 0.005);
near("CN 80, P 50 mm -> Q", runoffDepth(50, 80).Q, 13.80, 0.01);
near("CN 45, P 100 mm -> Q", runoffDepth(100, 45).Q, 4.13, 0.01);
near("CN 95, P 10 mm -> Q", runoffDepth(10, 95).Q, 2.59, 0.01);
near("no rain -> no runoff", runoffDepth(0, 70).Q, 0, 0);
near("rain below Ia -> no runoff", runoffDepth(10, 45).Q, 0, 0);
near("no curve number -> no runoff", runoffDepth(50, 0).Q, 0, 0);

console.log("\npeak discharge (rational, Q = C*i*A)");
near("C 0.6, 60 mm/h, 25 km2", peakDischarge(25, 60, 1, 0.6), 250.0, 0.5);
near("C 0.25, 30 mm/h, 100 km2", peakDischarge(100, 30, 1, 0.25), 208.3, 0.6);
near("no rain -> no peak", peakDischarge(25, 0, 1, 0.6), 0, 0);
near("no area -> no peak", peakDischarge(0, 60, 1, 0.6), 0, 0);
near("zero duration clamps to 0.1 h, so 10x the intensity", peakDischarge(25, 60, 0, 0.6), 2500.0, 1);

console.log("\nmountain / plain split");
const split = mountainSplit([{ km: 100, midElev: 900 }, { km: 250, midElev: 300 }, { km: 50, midElev: 40 }], 500);
near("mountain km", split.mtKm, 100, 0.1);
near("plain km", split.plKm, 300, 0.1);
near("mountain fraction", split.mountainFrac, 0.25, 0.001);
const noElev = mountainSplit([{ km: 10 }, { km: 20, midElev: 1000 }], 500);
near("reach without elevation counts as plain", noElev.plKm, 10, 0.1);
near("  and is counted, not dropped", noElev.noElevReaches, 1, 0);
const empty = mountainSplit([], 500);
near("no reaches -> no fraction", empty.mountainFrac, 0, 0);
near("no reaches -> threshold is the default", empty.thresholdM, 500, 0);

console.log("\nfull model (Godavari-sized sub-basin: 60,827 km2, 150 mm over 12 h, cropland)");
const m = stormModel({ areaKm2: 60827, areaLabel: "Ganga Basin / Ghaghara", rainMm: 150, durationH: 12,
  cover: "cropland", thresholdM: 500, upstreamKm: 2200,
  reaches: [{ km: 1200, midElev: 1400 }, { km: 1000, midElev: 220 }] });
console.log("  area", m.areaKm2, "km2 | runoff", m.runoffMm, "mm | volume", (m.volumeM3 / 1e6).toFixed(1), "Mm3");
console.log("  peak", m.peakM3s, "m3/s | intensity", m.intensityMmH, "mm/h | mountain fraction", m.mountain.mountainFrac);
near("volume = runoff depth x area", m.volumeM3, Math.round(m.runoffMm / 1000 * m.areaKm2 * 1e6), 1);
near("peak matches the rational call", m.peakM3s, peakDischarge(60827, 150, 12, 0.55), 0.5);
near("runoff matches the CN call", m.runoffMm, runoffDepth(150, 78).Q, 0.01);
near("mountain fraction", m.mountain.mountainFrac, 1200 / 2200, 0.001);
near("cover default is a valid key", CN_TABLE[m.cover] ? 1 : 0, 1, 0);
eq("unknown cover falls back to forest", stormModel({ areaKm2: 10, cover: "moon" }).cover, "forest");
near("negative area clamps to zero", stormModel({ areaKm2: -5 }).areaKm2, 0, 0);
near("missing reaches do not throw", stormModel({ areaKm2: 10, rainMm: 50 }).mountain.mountainFrac, 0, 0);

console.log("\nmonotonicity (runoff must rise with curve number and with rain)");
const byCn = [45, 65, 78, 95].map(cn => runoffDepth(60, cn).Q);
const rises1 = byCn.every((v, i) => i === 0 || v > byCn[i - 1]);
console.log((rises1 ? "OK   " : "FAIL ") + "Q rises with CN:", byCn.join(" < "));
if (!rises1) fails++;
const byRain = [10, 30, 60, 120].map(p => runoffDepth(p, 78).Q);
const rises2 = byRain.every((v, i) => i === 0 || v > byRain[i - 1]);
console.log((rises2 ? "OK   " : "FAIL ") + "Q rises with rain:", byRain.join(" < "));
if (!rises2) fails++;
const byArea = [100, 1000, 10000].map(a => peakDischarge(a, 60, 1, 0.6));
const rises3 = byArea.every((v, i) => i === 0 || v > byArea[i - 1]);
console.log((rises3 ? "OK   " : "FAIL ") + "peak rises with area:", byArea.join(" < "));
if (!rises3) fails++;

console.log("\nsub-basin lookup, synthetic square (75-76E, 20-21N)");
const sq = { type: "FeatureCollection", features: [{ type: "Feature",
  properties: { ba_name: "Test Basin", sub_basin: "Test Upper" },
  geometry: { type: "Polygon", coordinates: [[[75, 20], [76, 20], [76, 21], [75, 21], [75, 20]]] } }] };
const areas = { subbasins: [{ name: "Test Basin / Test Upper", km2: 1234 }] };
near("inside the square", subbasinAt(sq, areas, 75.5, 20.5)?.km2, 1234, 0);
console.log((subbasinAt(sq, areas, 70, 20.5) === null ? "OK   " : "FAIL ") + "outside the square -> null");
if (subbasinAt(sq, areas, 70, 20.5) !== null) fails++;
console.log((subbasinAt(null, null, 75.5, 20.5) === null ? "OK   " : "FAIL ") + "no data -> null");
if (subbasinAt(null, null, 75.5, 20.5) !== null) fails++;

console.log("\nreal geometry: the areas table must match the shapefiles, and tile India");
const subs = JSON.parse(readFileSync("data/subbasins.geo.json", "utf8"));
const bas = JSON.parse(readFileSync("data/basins.geo.json", "utf8"));
const tab = JSON.parse(readFileSync("data/subbasin-areas.json", "utf8"));
console.log("  sub-basins", tab.subbasins.length, "| sum", Math.round(tab.meta.subbasinSumKm2), "km2");
near("sub-basin count matches the shapefile", tab.subbasins.length, subs.features.length, 0);
near("sub-basins tile India (0.5% tolerance)", Math.abs(tab.meta.subbasinSumKm2 - 3287263) / 3287263 < 0.005 ? 1 : 0, 1, 0);
near("basins tile India (0.5% tolerance)", Math.abs(tab.meta.basinSumKm2 - 3287263) / 3287263 < 0.005 ? 1 : 0, 1, 0);
const gv = tab.basins.find(b => b.name === "Godavari");
near("Godavari polygon vs published area", gv.km2, gv.publishedKm2, gv.publishedKm2 * 0.03);
const kr = tab.basins.find(b => b.name === "Krishna");
near("Krishna polygon vs published area", kr.km2, kr.publishedKm2, kr.publishedKm2 * 0.03);
/* Every polygon must resolve to itself from a point well inside it. The 98 sub-basins share
   boundaries, so an arbitrary grid point can legitimately fall in a neighbour — the test point is
   therefore the one furthest from any edge (a cheap pole-of-inaccessibility), which is unambiguous. */
const insideRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const edgeDist = (ring, x, y) => {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
};
let checked = 0, selfOk = 0, noInterior = 0;
for (const f of subs.features) {
  const g = f.geometry; if (!g || g.type !== "Polygon") continue;
  const ring = g.coordinates[0]; if (!ring || ring.length < 4) continue;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let inner = null, innerD = 0;
  for (let gy = 0; gy <= 12 && !inner; gy++) for (let gx = 0; gx <= 12; gx++) {
    const cx = minX + (maxX - minX) * gx / 12, cy = minY + (maxY - minY) * gy / 12;
    if (!insideRing(ring, cx, cy)) continue;
    const d = edgeDist(ring, cx, cy);
    if (d > innerD) { innerD = d; inner = [cx, cy]; }
    if (gy === 6) break;
  }
  if (!inner) { noInterior++; continue; }
  checked++;
  const want = (f.properties.ba_name ? f.properties.ba_name + " / " : "") + (f.properties.sub_basin || "");
  const hit = subbasinAt(subs, tab, inner[0], inner[1]);
  if (hit && hit.name === want) selfOk++;
  else console.log("     miss:", want.padEnd(40), "->", hit ? hit.name : "null",
    "(point", inner.map(v => v.toFixed(3)).join(","), "inward", innerD.toFixed(3), "deg)");
}
eq("every polygon has an interior point", noInterior, 0);
console.log((selfOk === checked ? "OK   " : "FAIL ") + "a point deep inside a polygon resolves to that polygon:",
  selfOk + "/" + checked);
if (selfOk !== checked) fails++;
const zeroArea = tab.subbasins.filter(r => !(r.km2 > 0)).length;
near("no zero-area rows in the table", zeroArea, 0, 0);
console.log((bas.features.length === tab.basins.length ? "OK   " : "FAIL ") + "basin count matches the shapefile");
if (bas.features.length !== tab.basins.length) fails++;

console.log(fails ? "\nFAILURES: " + fails : "\nall checks passed");