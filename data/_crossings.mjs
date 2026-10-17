/* v7.22q — which reservoirs does a traced course actually pass through?
   THIS FILE RUNS IN THE BROWSER. It must not import anything that reaches for node:fs - an earlier
   version imported data/_shp.mjs for a helper it never called, and because _shp.mjs opens with
   `import {readFileSync} from "node:fs"` the browser refused the module, which took down
   map3d.js with it: window.__map3d, __storm and __dam all went undefined and the whole 3D map
   stopped existing. Kept as a comment because the symptom was nowhere near the cause.

   Reported on the course rather than removed from it. Cutting the line at a reservoir was asked for
   and is deliberately not done: the river does not stop at a reservoir, the mapped channel continues
   through the backwater, and deleting the reach would hide real geometry and shorten the course. So
   the crossings are measured and named instead, and the card says where they are.

   A "crossing" is a reservoir polygon that contains at least one point of a 200 m sampling of the
   course - sampled rather than using the course's own vertices, because a reservoir is usually
   wider than the vertex spacing and would then contain no vertex at all. The big bounding boxes are
   pruned first so this stays fast over 5,160 polygons. */

const inRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const havKm = (a, b) => {
  const R = 6371, rd = x => x * Math.PI / 180;
  const dLa = rd(b[1] - a[1]), dLo = rd(b[0] - a[0]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rd(a[1])) * Math.cos(rd(b[1])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* points along the course, about every `stepKm`, each with its distance from the start in km.
   The km matters: the first version indexed the caller's 2-element cumulative array with a sample
   index and reported 45 km where the answer was 11. */
export function sampleCourse(coords, stepKm = 0.2) {
  const pts = [], km = [];
  if (!coords || coords.length < 2) return { pts, km };
  let carry = 0, total = 0;
  pts.push(coords[0]); km.push(0);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const seg = havKm(a, b);
    if (seg <= 0) continue;
    total += seg;
    let d = carry;
    while (d < seg) {
      const t = d / seg;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      km.push(total - seg + d);
      d += stepKm;
    }
    carry = d - seg;
  }
  pts.push(coords[coords.length - 1]); km.push(total);
  return { pts, km };
}

/* index the reservoir polygons once, with bounding boxes, and keep only those big enough to be worth
   crossing - a 0.05 km2 tank will not be noticed on a 100 km course */
export function indexReservoirs(fc, minKm2 = 1) {
  const idx = [];
  for (const f of fc.features || []) {
    const p = f.properties || {};
    if (!(p.area_km2 > minKm2)) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
      : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    idx.push({ f, p, polys, minX, maxX, minY, maxY });
  }
  return idx;
}

/* returns [{name, km2, atKm}] for each reservoir the course runs through, in order along it */
export function crossings(idx, coords) {
  const { pts, km } = sampleCourse(coords, 0.2);
  if (!pts.length || !idx || !idx.length) return [];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const out = [];
  for (const e of idx) {
    if (e.maxX < minX || e.minX > maxX || e.maxY < minY || e.minY > maxY) continue;
    /* Keep looking: a sample can be inside the outer ring and inside a hole at the same time, which
       is the water of an island and not the reservoir. The first version stopped at the first
       outer-ring hit and so reported a course that only clipped an island as a crossing. */
    let at = null;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (x < e.minX || x > e.maxX || y < e.minY || y > e.maxY) continue;
      for (const poly of e.polys) {
        if (!poly.length || !inRing(poly[0], x, y)) continue;
        let hole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(poly[h], x, y)) { hole = true; break; }
        if (!hole) { at = km[i]; break; }
      }
      if (at !== null) break;
    }
    if (at === null) continue;
    out.push({ name: e.p.res_name || "reservoir", km2: e.p.area_km2, atKm: at, river: e.p.river || "" });
  }
  out.sort((a, b) => a.atKm - b.atKm);
  return out;
}