/* v7.22n — slim the watershed geometry down to something a browser can actually load.
   The full tile-assembled geometry is 33.3 MB, which is larger than the rest of the deck put
   together. Two reductions, both measured rather than guessed:
     - coordinates are written with 4 decimals (about 11 m), not 6
     - rings are thinned with Douglas-Peucker at a few tolerances
   The published area_km2 is never touched - it is the source's number, not a geometric one - so the
   only thing at risk here is the shape of the drawn boundary. That risk is measured: the geometric
   area of every simplified ring is compared with the published area, before and after. */
import { readFileSync, writeFileSync } from "node:fs";

const R = 6371.0088, rad = d => d * Math.PI / 180;
const ringKm2 = ring => {
  if (!ring || ring.length < 4) return 0;
  let t = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    t += (rad(p2[0]) - rad(p1[0])) * (2 + Math.sin(rad(p1[1])) + Math.sin(rad(p2[1])));
  }
  return Math.abs(t * R * R / 2);
};

/* Douglas-Peucker on lon/lat treated as planar metres - fine at these tolerances */
function dp(pts, tolM) {
  if (pts.length < 3) return pts;
  const kx = 111320 * Math.cos(rad(pts[0][1])), ky = 110574;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = (bx - ax) * kx, dy = (by - ay) * ky;
    const len2 = dx * dx + dy * dy;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const px = (pts[i][0] - ax) * kx, py = (pts[i][1] - ay) * ky;
      let d;
      if (len2 === 0) d = Math.hypot(px, py);
      else {
        let t = (px * dx + py * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d = Math.hypot(px - t * dx, py - t * dy);
      }
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolM) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const src = JSON.parse(readFileSync("data/watersheds.geo.json", "utf8"));
const before = JSON.stringify(src).length;
let ptsBefore = 0, ptsAfter = 0;

for (const tol of [200, 500, 1000]) {
  ptsBefore = 0; ptsAfter = 0;
  let devBefore = 0, devAfter = 0, n = 0;
  const feats = src.features.map(f => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let gBefore = 0, gAfter = 0;
    const newPolys = polys.map(poly => poly.map(r => {
      ptsBefore += r.length;
      const s = dp(r, tol);
      if (s.length < 4) s.push(s[0]);           /* keep it a ring */
      ptsAfter += s.length;
      gBefore += ringKm2(r);
      gAfter += ringKm2(s);
      return s.map(pt => [+pt[0].toFixed(4), +pt[1].toFixed(4)]);
    }));
    const pub = f.properties.km2;
    if (pub > 5) { devBefore += Math.abs(gBefore / pub - 1); devAfter += Math.abs(gAfter / pub - 1); n++; }
    return {
      type: "Feature",
      properties: f.properties,
      geometry: newPolys.length === 1
        ? { type: "Polygon", coordinates: newPolys[0] }
        : { type: "MultiPolygon", coordinates: newPolys },
    };
  });
  const out = JSON.stringify({ type: "FeatureCollection", features: feats });
  console.log("tolerance " + tol + " m:");
  console.log("  points", ptsBefore, "->", ptsAfter, "(" + (ptsAfter / ptsBefore * 100).toFixed(1) + "% kept)");
  console.log("  size  " + (before / 1048576).toFixed(1), "MB ->", (out.length / 1048576).toFixed(1), "MB");
  console.log("  mean |geometric/published - 1|: " + (devBefore / n * 100).toFixed(1) + "% -> "
    + (devAfter / n * 100).toFixed(1) + "%  (only the drawn shape is affected)");
  if (tol === Number(process.env.WTOL || 1000)) {
    writeFileSync("data/watersheds.geo.json", out);
    console.log("  -> written at " + tol + " m");
  }
}