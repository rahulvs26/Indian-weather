/* v7.22 — the opt-in hydrology layer, part 1: rainfall → runoff for the catchment above a dam.
   ------------------------------------------------------------------------------------
   THIS IS A STUDY TOOL, NOT A HYDRAULIC MODEL. Every number it prints is labelled in the card.
   What is real, what is derived, what is the user's:

   real      catchment area. The area is the geodesic area of the sub-basin polygon that contains
             the dam (data/subbasin-areas.json, computed from data/subbasins.geo.json by
             data/_gen_subbasin_areas.mjs). Those 98 polygons tile India to within 0.46%
             (3,272,064 km² vs 3,287,263 km²) and the 25 basin polygons match their published
             areas within ~2%, so the geometry is sound. It is still the SUB-BASIN, not the dam's
             true catchment, which is smaller — the card says so.
   derived   runoff depth by the NRCS / SCS Curve Number method (National Engineering Handbook
             Part 630 Ch. 2): S = 25400/CN − 254 mm, Ia = 0.2·S, Q = (P − Ia)²/(P − Ia + S)
   derived   peak discharge by the rational method, Q = C·i·A (same chapter), i = P/t
   real      the mountain / plain split uses the Mapterhorn DEM already loaded for the 3D view;
             the elevation threshold that defines "mountain" is the user's, not a published line
   user      rainfall depth (mm), duration (hours), land cover, and the threshold
   estimated curve numbers and runoff coefficients are the usual NRCS TR-55 ranges, one per land
             cover, and the card prints which one was used

   SWMM (https://github.com/USEPA/Stormwater-Management-Model — EPA's C engine, plus the
   community continuation https://github.com/HydroCouple/openswmm.engine) is the right tool for a
   real routed hydrograph, and is deliberately NOT run here: it needs a compiled WASM build or an
   offline run, and the deck would be shipping someone else's model. The honest split is that this
   module estimates volume and peak for teaching, and a SWMM run per scenario can later supply the
   hydrograph a second animation layer would route. */

export const CN_TABLE = {
  urban:    { label: "City / built-up",      cn: 95, c: 0.85 },
  bare:     { label: "Bare rock / sand",    cn: 85, c: 0.80 },
  cropland: { label: "Cultivated cropland", cn: 78, c: 0.55 },
  pasture:  { label: "Pasture / grassland", cn: 65, c: 0.40 },
  forest:   { label: "Forest / hillslope",  cn: 45, c: 0.25 },
};
export const COVER_KEYS = Object.keys(CN_TABLE);
export const DEFAULT_THRESHOLD_M = 500;   /* a usable default, not a published boundary */

/* ---------------- runoff depth: NRCS Curve Number, metric ---------------- */
export function runoffDepth(Pmm, cn) {
  if (!(Pmm > 0) || !(cn > 0)) return { Q: 0, S: 0, Ia: 0, excess: 0 };
  const S = 25400 / cn - 254;          /* potential maximum retention, mm */
  const Ia = 0.2 * S;                  /* initial abstraction, mm */
  const excess = Math.max(0, Pmm - Ia);
  const Q = excess <= 0 ? 0 : (excess * excess) / (excess + S);
  return { Q: +Q.toFixed(2), S: +S.toFixed(2), Ia: +Ia.toFixed(2), excess: +excess.toFixed(2) };
}

/* ---------------- peak discharge: rational method Q = C·i·A ---------------- */
export function peakDischarge(areaKm2, Pmm, durationH, c) {
  const t = Math.max(0.1, durationH || 0.1);
  const iMmH = Math.max(0, Pmm) / t;               /* mm/h */
  const iMs = (iMmH / 1000) / 3600;                /* m/s */
  return +(c * iMs * areaKm2 * 1e6).toFixed(1);    /* m³/s */
}

/* ---------------- mountain / plain split of the upstream channel ---------------- */
/* `reaches` is [{km, midElev}] per upstream reach; midElev may be null when the DEM had no
   sample, and those reaches are counted as plain rather than silently dropped. */
export function mountainSplit(reaches, thresholdM) {
  const th = thresholdM == null ? DEFAULT_THRESHOLD_M : thresholdM;
  let mtKm = 0, plKm = 0, mtN = 0, plN = 0, noElev = 0;
  for (const r of reaches || []) {
    if (!(r.km > 0)) continue;
    const mid = typeof r.midElev === "number" ? r.midElev : null;
    if (mid == null) { plKm += r.km; plN++; noElev++; continue; }
    if (mid >= th) { mtKm += r.km; mtN++; } else { plKm += r.km; plN++; }
  }
  const f = mtKm + plKm > 0 ? mtKm / (mtKm + plKm) : 0;
  return { thresholdM: th, mtKm: +mtKm.toFixed(1), plKm: +plKm.toFixed(1),
    mountainFrac: +f.toFixed(3), mtReaches: mtN, plReaches: plN, noElevReaches: noElev };
}

/* ---------------- one call: everything the panel prints ---------------- */
/* o = { areaKm2, areaLabel, rainMm, durationH, cover, thresholdM, reaches, upstreamKm } */
export function stormModel(o = {}) {
  const coverKey = CN_TABLE[o.cover] ? o.cover : "forest";
  const tab = CN_TABLE[coverKey];
  const area = Math.max(0, +(o.areaKm2 || 0).toFixed(1));
  const rain = Math.max(0, +(o.rainMm || 0).toFixed(1));
  const dur = Math.max(0.1, +(o.durationH || 1).toFixed(2));
  const ro = runoffDepth(rain, tab.cn);
  const peak = peakDischarge(area, rain, dur, tab.c);
  const split = mountainSplit(o.reaches, o.thresholdM);
  return {
    areaKm2: area, areaLabel: o.areaLabel || "unknown area",
    cover: coverKey, coverLabel: tab.label, cn: tab.cn, c: tab.c,
    rainMm: rain, durationH: dur, intensityMmH: +(rain / dur).toFixed(1),
    runoffMm: ro.Q, retentionMm: ro.S, initialAbsMm: ro.Ia, excessMm: ro.excess,
    volumeM3: Math.round(ro.Q / 1000 * area * 1e6),
    peakM3s: peak,
    upstreamKm: +(o.upstreamKm || 0).toFixed(1),
    mountain: split,
    method: "NRCS Curve Number (NEH 630-2) for depth · rational method for peak",
  };
}

/* ---------------- locate the sub-basin polygon that contains a point ---------------- */
/* Ray-casting point-in-polygon. `subs` is the GeoJSON FeatureCollection from subbasins.geo.json;
   `areas` the {subbasins:[{name,km2}]} table from subbasin-areas.json. Returns the containing
   sub-basin's name and measured area, or null. Where two polygons both contain the point (they
   share edges) the larger one wins, which is the honest choice for a runoff area. */
export function subbasinAt(subs, areas, lon, lat) {
  if (!subs || !subs.features) return null;
  let best = null;
  const inside = (ring, x, y) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (const f of subs.features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      if (!poly || !poly[0]) continue;
      const hit = inside(poly[0], lon, lat) && poly.slice(1).every(r => !inside(r, lon, lat));
      if (!hit) continue;
      const p = f.properties || {};
      const name = (p.ba_name ? p.ba_name + " / " : "") + (p.sub_basin || p.ba_name || "unnamed");
      const row = (areas?.subbasins || []).find(r => r.name === name);
      const km2 = row ? row.km2 : 0;
      if (!best || km2 > best.km2) best = { name, basin: p.ba_name || null, km2 };
    }
  }
  return best;
}