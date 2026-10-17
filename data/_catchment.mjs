/* v7.22n — real catchment lookup, from the WRIS watershed tiles.

   What replaced what, and why (all measured):
     v7.22 used the CWRD sub-basin tile that contains the dam, which for Irukkangudi is
     "Vaippar and others": 126 rivers, 19,937 km2, for a 79 km river. Wrong by a factor of ~46.
     These are the WRIS watershed units instead - a proper hydrological unit with its own published
     catchment area, read from
       https://indianopenmaps.com/watersheds/wris/{z}/{x}/{y}.pbf
     (source IndiaWRIS, published in ramSeraph/indian_water_features, release "hydro-boundaries",
     CC0 with attribution to datameet and the original government source).
     4,560 units, their published areas summing to 3,176,557 km2 = 96.6% of India.

   The area is the source's own area_km2 field, never one derived from the geometry: a watershed cut
   across tile boundaries arrives as fragments that overlap by the tile buffer, so summing or
   stitching them is wrong, while the published number is simply right.

   What the number is and is not, which the panel states: this is the watershed UNIT the dam sits in.
   A large dam's true catchment can span several units, so this is a floor, not the whole catchment. */
let cache = null, loading = null;

export function loadWatersheds(url = "data/watersheds.geo.json", version = "?v=7.22") {
  if (cache) return Promise.resolve(cache);
  if (!loading) loading = (async () => {
    /* REVERTED IN THE SAME HOUR. Deferring this fetch with requestIdleCallback was tried to take the
       parse off the critical path - selecting a dam measures 1 fps (1,016 ms median frame) and the
       heap goes 108 MB to 200 MB - and it broke the feature instead: requestIdleCallback does not
       run in a background or throttled tab, so the crossings line stayed empty and the river facts
       never appeared. The stall is real and is recorded in PERFORMANCE.md as an open gap; the fix
       for it is to parse in the dam-router worker, which already exists, not to hope for idle time.
       Fetching immediately is the honest behaviour. */
    const r = await fetch(url + version);
    if (!r.ok) throw new Error("watershed tiles unavailable (" + r.status + ")");
    const fc = await r.json();
    /* index by bounding box so the point test only touches candidates that can contain it */
    const idx = [];
    for (const f of fc.features) {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      idx.push({ f, minX, maxX, minY, maxY, polys });
    }
    cache = { fc, idx };
    return cache;
  })();
  return loading;
}

const inRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/* The smallest watershed unit containing the point. "Smallest" matters because fragments spill into
   the tile buffer, so a bigger neighbour can also contain the point; the finest unit that does is
   the one the dam is actually in. Measured: at Mettur both C05CAM48 (805.72 km2) and C05CAM49
   (614.54 km2) contain the dam, and the smaller is correct. */
export function watershedAt(data, lon, lat) {
  if (!data) return null;
  const hits = [];
  for (const e of data.idx) {
    if (lon < e.minX || lon > e.maxX || lat < e.minY || lat > e.maxY) continue;
    let inside = false;
    for (const poly of e.polys) {
      if (!poly.length) continue;
      if (inRing(poly[0], lon, lat)) {
        /* holes: a point in a hole of an outer ring is not inside */
        let inHole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(poly[h], lon, lat)) { inHole = true; break; }
        if (!inHole) { inside = true; break; }
      }
    }
    if (inside) hits.push(e);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => (a.f.properties.km2 || 0) - (b.f.properties.km2 || 0));
  const e = hits[0];
  const p = e.f.properties;
  return {
    code: p.code, km2: p.km2, sb: p.sb, ba: p.ba, parts: p.parts,
    geometry: e.f.geometry, alsoContains: hits.length,
    /* the boundary as drawn, whichever GeoJSON shape it arrived in */
    polygons: e.polys,
  };
}