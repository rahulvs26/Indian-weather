/* v7.20 — shape a course on OpenStreetMap geometry.
   The CWC network stays the authority for WHICH river to follow (basin, recorded source and mouth,
   length, topology); it is a schematic digitisation, so its reaches are often straight lines of
   5-25 km. OpenStreetMap — the very data the basemap tiles are drawn from — has the real shape.
   So: keep the CWC course as the spine, and route along the OSM ways that hug it.

   Algorithm (no dependencies, ~150 lines):
     1. index the OSM ways as segments in a 0.1° grid
     2. keep only segments whose midpoint is within `corridorKm` of the CWC spine — this is what
        keeps the refinement on the same river instead of wandering onto a neighbour
     3. nodes are OSM vertices (rounded to ~1 m); edges are consecutive vertices of the same way
     4. Dijkstra from the OSM node nearest the spine's start to the one nearest its end, with cost
        = length·(1 + 5·deviation/corridorKm): cheap to travel along the spine, expensive to leave it
     5. return null when no path exists — the caller then keeps the CWC line untouched
   Everything is measured afterwards: how far the refined line strays from the spine, and how much
   longer it is (a real river meanders, so the refined line must be LONGER than the straight spine). */
export function buildSegIndex(segs, cell = 0.1) {
  const m = new Map();
  const key = (i, j) => i + ":" + j;
  for (let s = 0; s < segs.length; s++) {
    const a = segs[s].a, b = segs[s].b;
    const i0 = Math.floor(Math.min(a[0], b[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0]) / cell);
    const j0 = Math.floor(Math.min(a[1], b[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1]) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let arr = m.get(k);
      if (!arr) { arr = []; m.set(k, arr); }
      arr.push(s);
    }
  }
  return { cell, m, key };
}
export function segsNear(index, pt, padCells = 1) {
  const i = Math.floor(pt[0] / index.cell), j = Math.floor(pt[1] / index.cell);
  const out = [];
  for (let di = -padCells; di <= padCells; di++) for (let dj = -padCells; dj <= padCells; dj++) {
    const arr = index.m.get(index.key(i + di, j + dj));
    if (arr) for (const s of arr) out.push(s);
  }
  return out;
}
/* distance from a point to a polyline, in km, using a grid over the polyline's own vertices */
export function polylineGrid(pts) {
  const cell = 0.1, buckets = new Map();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const k = Math.floor(p[0] / cell) + ":" + Math.floor(p[1] / cell);
    let a = buckets.get(k); if (!a) { a = []; buckets.set(k, a); }
    a.push(i);
  }
  return { cell, buckets, pts };
}
const LON_K = 111.32 * Math.cos(0 * Math.PI / 180);      /* replaced per call with cos(lat) */
export function nearestOnPolyline(pt, grid, lat0) {
  const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 111.19;
  const i = Math.floor(pt[0] / grid.cell), j = Math.floor(pt[1] / grid.cell);
  let best = Infinity, idx = 0;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const arr = grid.buckets.get((i + di) + ":" + (j + dj));
    if (!arr) continue;
    for (const i2 of arr) {
      const a = grid.pts[i2];
      const b = grid.pts[i2 + 1] || grid.pts[i2];
      const abx = (b[0] - a[0]) * kx, aby = (b[1] - a[1]) * ky;
      const L2 = abx * abx + aby * aby;
      let t = L2 ? (((pt[0] - a[0]) * kx * abx) + ((pt[1] - a[1]) * ky * aby)) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = (pt[0] - a[0]) * kx - abx * t, dy = (pt[1] - a[1]) * ky - aby * t;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; idx = i2; }
    }
  }
  return { dKm: best, idx };
}
export function distToPolyline(pt, grid, lat0) { return nearestOnPolyline(pt, grid, lat0).dKm; }

/**
 * @param {Array<[number,number]>} spine  the CWC course (authority)
 * @param {Array<Array<[number,number]>>} ways  OSM way geometries
 * @param {object} o  {corridorKm=4, snapKm=2.5, penalty=5, minGain=0}
 * @returns {null|{coords, km, spineKm, devKm, segs}}
 */
export function osmRefineCourse(spine, ways, o) {
  o = o || {};
  const corridorKm = o.corridorKm == null ? 4 : o.corridorKm;
  const snapKm = o.snapKm == null ? 2.5 : o.snapKm;
  const penalty = o.penalty == null ? 5 : o.penalty;
  if (!spine || spine.length < 2 || !ways || !ways.length) return null;
  const lat0 = spine[0][1];
  const kx0 = 111.32 * Math.cos(lat0 * Math.PI / 180), ky0 = 111.19;

  /* 1. flatten the ways into segments */
  const segs = [];
  for (let w = 0; w < ways.length; w++) {
    const g = ways[w];
    if (!g || g.length < 2) continue;
    for (let i = 1; i < g.length; i++) segs.push({ a: g[i - 1], b: g[i], w, i });
  }
  if (!segs.length) return null;
  const sidx = buildSegIndex(segs);

  /* 2. corridor test: the segment's midpoint must hug the spine — WIDENED near both ends.
     Near a river's mouth (or a dam's snap point) OSM often maps the channel well away from the
     schematic line: for Sardar Sarovar the Narmada's mouth sits further than corridorKm from any
     mapped way, so a constant corridor leaves the graph with no node near the end and the whole
     course is refused (measured: 784 corridor segments available, end unreachable). The allowance
     therefore grows to maxDevKm over the last/first END_TAPER_KM of the course, which lets the path
     hook onto the real channel there without loosening the middle of the reach. */
  const spineGrid = polylineGrid(spine);
  const along=[0];
  for(let i=1;i<spine.length;i++)along.push(along[i-1]+Math.sqrt(
    ((spine[i][0]-spine[i-1][0])*kx0)**2+((spine[i][1]-spine[i-1][1])*ky0)**2));
  const spineKm=along[along.length-1];
  const END_TAPER_KM=o.endTaperKm==null?Math.max(25,spineKm*0.2):o.endTaperKm;
  const keep = [];
  for (let s = 0; s < segs.length; s++) {
    const g = segs[s];
    const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    const near = nearestOnPolyline(mid, spineGrid, lat0);
    const pos = along[Math.min(near.idx, along.length - 1)];
    const nearEnd = Math.min(pos, spineKm - pos) <= END_TAPER_KM;
    const allow = nearEnd ? Math.max(corridorKm, o.maxDevKm == null ? corridorKm * 2 : o.maxDevKm) : corridorKm;
    if (near.dKm <= allow) keep.push(s);
  }
  if (keep.length < 2) return null;

  /* 3. graph over the kept segments: nodes are OSM vertices rounded to ~1 m */
  const idOf = p => Math.round(p[0] * 1e5) + "," + Math.round(p[1] * 1e5);
  const nodes = new Map();                      /* id -> [lon,lat] */
  const adj = new Map();                        /* id -> [{to, cost, seg}] */
  const nodeOf = p => {
    const id = idOf(p);
    if (!nodes.has(id)) nodes.set(id, p);
    if (!adj.has(id)) adj.set(id, []);
    return id;
  };
  const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 111.19;
  for (const s of keep) {
    const g = segs[s];
    const ia = nodeOf(g.a), ib = nodeOf(g.b);
    if (ia === ib) continue;
    const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    const dev = distToPolyline(mid, spineGrid, lat0);
    const km = Math.sqrt(((g.b[0] - g.a[0]) * kx) ** 2 + ((g.b[1] - g.a[1]) * ky) ** 2);
    const cost = km * (1 + penalty * (dev / corridorKm));
    adj.get(ia).push({ to: ib, cost, seg: s });
    adj.get(ib).push({ to: ia, cost, seg: s });
  }

  /* 4. nearest kept node to each spine end.
     snapKm is the budget for snapping a course END to the nearest OSM node. A dam's snapped start is
     on the river (0.28 km for Sardar Sarovar) but a river's MAPPED END can sit kilometres inland of
     the OSM waterway — the Narmada's recorded end is 4.01 km from the nearest OSM node, which made
     the 3 km budget refuse the entire course even though 784 corridor segments were available. So
     the budget is applied to the side that must be exact (the dam) and a wider, separate budget
     (endSnapKm, default 3× snapKm) applies to the other end, with the connection drawn explicitly
     so the line still starts and finishes where the CWC course does. */
  const endSnapKm = o.endSnapKm == null ? Math.max(snapKm, 9) : o.endSnapKm;
  const nearestNode = (p, budget) => {
    let best = null, bestD = Infinity;
    for (const [id, q] of nodes) {
      const d = Math.sqrt(((q[0] - p[0]) * kx) ** 2 + ((q[1] - p[1]) * ky) ** 2);
      if (d < bestD) { bestD = d; best = id; }
    }
    return bestD <= budget ? { id: best, km: bestD } : null;
  };
  const start = nearestNode(spine[0], snapKm);
  if (!start) return null;
  const endNear = nearestNode(spine[spine.length - 1], endSnapKm);

  /* 5. Dijkstra from the start node, then pick the best REACHABLE node for the end.
     The corridor graph is often split: where OSM maps a wide braided river further from the
     schematic line than corridorKm, no kept segment reaches the course's last leg, and demanding a
     path to the node nearest the end point refuses the whole course (measured: Sardar Sarovar, the
     Narmada's mouth, 784 corridor segments available, 0 reachable end). So the end is chosen among
     the nodes Dijkstra actually reached, nearest the course's end, within endSnapKm — and the last
     stretch is then a straight connector the card already discloses as not-mapped. */
  const dist = new Map([[start.id, 0]]);
  const prev = new Map();
  const pq = [[0, start.id]];
  const seen = new Set();
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    for (const e of adj.get(u) || []) {
      const nd = d + e.cost;
      if (nd < (dist.get(e.to) == null ? Infinity : dist.get(e.to))) {
        dist.set(e.to, nd); prev.set(e.to, u); pq.push([nd, e.to]);
      }
    }
  }
  const endPt = spine[spine.length - 1];
  let endId = null, endD = Infinity, endKm = 0;
  if (endNear && seen.has(endNear.id)) {
    endId = endNear.id; endKm = endNear.km;
  } else {
    for (const id of seen) {
      const q = nodes.get(id);
      const d = Math.sqrt(((q[0] - endPt[0]) * kx) ** 2 + ((q[1] - endPt[1]) * ky) ** 2);
      if (d < endD) { endD = d; endId = id; }
    }
    if (endId == null || endD > endSnapKm) return null;
    endKm = endD;
  }

  /* 6. walk the path back and emit coordinates */
  const path = [];
  for (let u = endId; u != null; u = prev.get(u)) path.push(u);
  path.reverse();
  if (path.length < 2) return null;
  const coords = [spine[0]];
  for (let i = 0; i < path.length; i++) coords.push(nodes.get(path[i]));
  coords.push(spine[spine.length - 1]);

  /* 7. measure what we produced */
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += Math.sqrt(((coords[i][0] - coords[i-1][0]) * kx) ** 2 + ((coords[i][1] - coords[i-1][1]) * ky) ** 2);
  const grid2 = polylineGrid(spine);
  let devKm = 0;
  for (const p of coords) { const d = distToPolyline(p, grid2, lat0); if (d > devKm) devKm = d; }
  /* a refined river should be at least as long as the schematic spine; if it is dramatically
     shorter the path took a shortcut, so refuse it rather than draw something wrong */
  if (o.minGain != null && km < spineKm * (1 + o.minGain)) return null;
  /* The corridor bounds every EDGE, but the RESULT can still wander: a meander loop near the start
     can be entered and left 20 km from the spine, and summing edge costs rewards that detour.
     Measured on the Vaigai — the refined path reached 21.7 km off a 190 km course. So the path is
     accepted only if every point stays within maxDevKm of the spine (default 2×corridorKm). */
  const maxDevKm = o.maxDevKm == null ? corridorKm * 2 : o.maxDevKm;
  if (devKm > maxDevKm) return null;
  return { coords, km: +km.toFixed(2), spineKm: +spineKm.toFixed(2), devKm: +devKm.toFixed(2),
           segs: keep.length, maxDevKm };
}