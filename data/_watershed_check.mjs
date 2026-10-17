/* v7.22m — does the stitched tile geometry actually match the published area?
   The tiles give fragments; the areas give the truth. For every watershed, compute the geodesic area
   of the ring this script stitched and compare it with area_km2 from the source. If the ring is the
   whole watershed the two agree; if fragments were dropped or rings were mis-split, the geometric
   area falls short. Anything that fails badly is reported rather than quietly shipped. */
import { readFileSync } from "node:fs";

const R = 6371.0088, rad = d => d * Math.PI / 180;
function ringKm2(ring) {
  if (!ring || ring.length < 4) return 0;
  let t = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    t += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(t * R * R / 2);
}

const geo = JSON.parse(readFileSync("data/watersheds.geo.json", "utf8"));
const meta = JSON.parse(readFileSync("data/watershed-areas.json", "utf8"));
const byCode = new Map(meta.watersheds.map(w => [w.code, w]));

const ratios = [];
const bad = [];
for (const f of geo.features) {
  const ring = f.geometry.coordinates[0];
  const g = ringKm2(ring);
  const p = f.properties.km2;
  const ratio = p > 0 ? g / p : 0;
  ratios.push(ratio);
  if (p > 5 && (ratio < 0.55 || ratio > 1.8)) bad.push({ code: f.properties.code, published: +p.toFixed(1), geometric: +g.toFixed(1), ratio: +ratio.toFixed(2), pts: ring.length });
}
ratios.sort((a, b) => a - b);
const pct = q => ratios[Math.floor(ratios.length * q)];
console.log("watersheds compared:", ratios.length);
console.log("geometric area / published area:");
console.log("  p05", pct(0.05).toFixed(3), "| p25", pct(0.25).toFixed(3), "| median", pct(0.5).toFixed(3),
  "| p75", pct(0.75).toFixed(3), "| p95", pct(0.95).toFixed(3));
const good = ratios.filter(r => r > 0.8 && r < 1.25).length;
console.log("  within 0.8-1.25 of the published area:", good, "(" + (good / ratios.length * 100).toFixed(1) + "%)");
console.log("  outside 0.55-1.8:", bad.length, "(" + (bad.length / ratios.length * 100).toFixed(1) + "%)");
if (bad.length) {
  console.log("\n  worst 12 by ratio:");
  bad.sort((a, b) => a.ratio - b.ratio);
  for (const b of bad.slice(0, 6)) console.log("   ", b.code.padEnd(12), "published", String(b.published).padStart(9), "geometric", String(b.geometric).padStart(9), "ratio", b.ratio, "pts", b.pts);
  for (const b of bad.slice(-6)) console.log("   ", b.code.padEnd(12), "published", String(b.published).padStart(9), "geometric", String(b.geometric).padStart(9), "ratio", b.ratio, "pts", b.pts);
}

/* how many rings does the raw geometry actually have, and how big is the largest gap? */
const parts = geo.features.map(f => f.properties.parts);
parts.sort((a, b) => b - a);
console.log("\nfragments per watershed: median", parts[Math.floor(parts.length / 2)], "| p90", parts[Math.floor(parts.length * 0.9)], "| max", parts[0]);
console.log("total", parts.reduce((a, b) => a + b, 0), "fragments across", parts.length, "watersheds");

/* the numbers that matter for the deck: the smallest published watershed containing each of a few
   real dams, and whether the stitched ring actually contains the dam point */
const inRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
console.log("\nspot checks (stitched ring must contain the dam):");
for (const [name, lon, lat] of [["Irukkangudi", 77.9815, 9.3363], ["Mettur", 77.8085, 11.8017],
  ["Hirakud", 83.8539, 21.5184], ["Sardar Sarovar", 73.7241, 21.8585], ["Bhakra", 76.4334, 31.4115]]) {
  const hits = geo.features.filter(f => inRing(f.geometry.coordinates[0], lon, lat)).sort((a, b) => a.properties.km2 - b.properties.km2);
  const h = hits[0];
  console.log("  ", name.padEnd(16), h ? `${h.properties.code} ${h.properties.km2} km2` : "none", h ? `(geometric ${ringKm2(h.geometry.coordinates[0]).toFixed(1)} km2)` : "");
}