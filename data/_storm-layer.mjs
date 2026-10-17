/* v7.22 — the second, opt-in layer: a catchment storm.
   ------------------------------------------------------------------------------------
   Asleep until the user opens the "Rainfall → runoff" block in the dam card and ticks the
   checkbox. Until then nothing is fetched, nothing is drawn and no animation runs.

   What it draws, and why that answers "how much area should the cloud cover?":
     the cloud is an extruded polygon whose footprint IS the catchment the storm falls on - the
     sub-basin that contains the dam, from data/subbasins.geo.json, with the area measured from
     that geometry (data/subbasin-areas.json). Rainfall intensity does not move the footprint; it
     sets the cloud's height, its opacity and how dense the rain streaks are, because a heavier
     storm falls over the same ground. The readout says this in as many words, so the picture
     cannot be misread as "the storm covers a different place".

   Speed: one requestAnimationFrame loop that writes a single paint property (line-pattern-offset).
   No per-frame feature updates, no per-feature JavaScript, streaks capped, everything torn down
   the moment the checkbox is cleared. */

import { stormModel, subbasinAt, CN_TABLE, COVER_KEYS, DEFAULT_THRESHOLD_M } from "./_hydrology.mjs";

const V = "?v=7.22";
const MAX_STREAKS = 360;      /* hard cap: 360 short segments is one cheap draw call */
const CLOUD_MIN_M = 900, CLOUD_MAX_M = 9000;

/* point-in-ring, for placing rain inside the catchment */
function inRing(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function geomRings(g) {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.map(p => p[0]);
  return [];
}
function geomContains(g, x, y) {
  for (const r of geomRings(g)) if (r && r.length > 3 && inRing(r, x, y)) return true;
  return false;
}
function geomBBox(g) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const r of geomRings(g)) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return minX === 1e9 ? null : { minX, maxX, minY, maxY };
}
const fmt = (n, d = 0) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export function createStormLayer(ctx) {
  const getMap = ctx.getMap, getDam = ctx.getDam, el = ctx.el;
  let data = null, loading = null;        /* sub-basins + areas, fetched only when asked */
  let raf = 0, shown = false, lastKey = "", lastErr = "";
  let baseP = null, baseKey = "", cloudBase = 1500, tries = 0;

  const ids = ["storm-catch", "storm-cloud", "storm-rain"];

  async function load() {
    if (data) return data;
    if (!loading) loading = (async () => {
      const get = async u => { try { const r = await fetch(u + V); return r.ok ? await r.json() : null; } catch (_) { return null; } };
      const [subs, areas] = await Promise.all([get("data/subbasins.geo.json"), get("data/subbasin-areas.json")]);
      data = subs && subs.features && subs.features.length ? { subs, areas } : null;
      return data;
    })();
    return loading;
  }

  /* rain columns inside the catchment, thinned by intensity; deterministic so the picture does
     not change between frames */
  function streaks(geom, intensity) {
    const bb = geomBBox(geom); if (!bb) return null;
    const want = Math.max(50, Math.min(MAX_STREAKS, Math.round(intensity * 2.2)));
    const M_PER_DEG = 111320;
    const cells = [];
    let seed = 1337;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let tries = 0;
    while (cells.length < want && tries < want * 80) {
      tries++;
      const x = bb.minX + rnd() * (bb.maxX - bb.minX);
      const y = bb.minY + rnd() * (bb.maxY - bb.minY);
      if (!geomContains(geom, x, y)) continue;
      const w = (RAIN_W_M / M_PER_DEG) / 2;
      cells.push([[[x - w, y - w], [x + w, y - w], [x + w, y + w], [x - w, y + w], [x - w, y - w]]]);
    }
    if (!cells.length) return null;
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "MultiPolygon", coordinates: cells } }] };
  }

  /* Rain, the only way MapLibre 6 will actually draw it.
     Three dead ends, all measured rather than assumed:
       line-pattern-offset  - does not exist in this build; every addLayer and every frame logged
                               "unknown property" and no rain appeared.
       line-z-offset        - same trap: addLayer returns, the style rejects it asynchronously and
                               the layer silently disappears. MapLibre accepts the call and then
                               throws the layer away.
       a line at elevation 0 - with Mapterhorn terrain on, geometry at sea level is buried inside
                               the ground and never drawn at all.
     So the rain is a set of thin extruded columns at a real altitude, one fill-extrusion layer, one
     draw call, and the fall is one paint property per frame. */
    const RAIN_LEN_M = 900;         /* how far each column hangs below the cloud */
  const RAIN_W_M = 260;           /* column width */

  function teardown(map) {
    cancelAnimationFrame(raf); raf = 0;
    if (!map) return;
    for (const l of ids) { try { if (map.getLayer(l)) map.removeLayer(l); } catch (_) {} }
    for (const s of ids) { try { if (map.getSource(s)) map.removeSource(s); } catch (_) {} }
  }

  /* the columns slide down from the cloud and wrap. One paint property per frame, so a heavy storm
     can run fast without costing anything per feature; the whole curtain shares a phase, which is
     why it reads as a sheet of rain rather than individual drops. */
  function animate(map, intensity) {
    cancelAnimationFrame(raf);
    const cycles = 0.5 + Math.min(intensity, 160) / 40;   /* falls per second */
    let last = -1;
    const step = t => {
      if (!shown) return;
      const phase = ((t / 1000) * cycles) % 1;
      if (Math.abs(phase - last) > 0.01) {               /* ~100 updates/s: plenty, and cheap */
        last = phase;
        try { map.setPaintProperty("storm-rain", "fill-extrusion-base",
          Math.round(cloudBase - phase * RAIN_LEN_M)); } catch (_) {}
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* returns the model, and draws when the checkbox is on */
  async function compute() {
    const dam = getDam && getDam();
    const out = el("stormOut");
    if (!dam) { if (out) out.textContent = "Choose a dam first — the storm falls on the catchment above it."; return null; }
    const d = await load();
    if (!d) { if (out) out.innerHTML = '<span class="warn">Could not load the sub-basin polygons, so the catchment area is unknown. The runoff numbers need it.</span>'; return null; }
    const hit = subbasinAt(d.subs, d.areas, dam.lon, dam.lat);
    if (!hit) {
      if (out) out.innerHTML = '<span class="warn">This dam sits outside the mapped sub-basins, so its catchment area is not recorded in the sources used. Type an area to go on.</span>';
      return null;
    }
    const rain = Math.max(0, +val("stormRain") || 0);
    const dur = Math.max(0.1, +val("stormDur") || 1);
    const cover = el("stormCover") ? el("stormCover").value : "forest";
    const th = val("stormMt") == null ? DEFAULT_THRESHOLD_M : Math.max(0, +val("stormMt"));
    const m = stormModel({ areaKm2: hit.km2, areaLabel: hit.name, rainMm: rain, durationH: dur, cover, thresholdM: th });
    if (out) out.innerHTML = text(m, hit);
    if (shown) {
      /* a draw failure must be visible, not a silent half-applied storm */
      draw(m, hit).catch(e => {
        lastErr = (e && e.message) || String(e);
        const box = el("stormOut");
        if (box) box.innerHTML += '<br><span class="warn">The 3D storm could not be drawn: ' + esc(lastErr) + "</span>";
      });
    }
    lastKey = m.areaLabel + "|" + m.rainMm + "|" + m.durationH + "|" + m.cover + "|" + m.mountain.thresholdM;
    return m;
  }

  function val(id) { const e = el(id); return e ? e.value : null; }

  function text(m, hit) {
    const run = m.runoffMm > 0;
    const pct = m.areaKm2 > 0 ? (m.runoffMm / m.rainMm) * 100 : 0;
    return '<b class="big">' + fmt(m.intensityMmH, 1) + ' mm/h over ' + fmt(m.areaKm2) + ' km²</b>'
      + '<br><span class="k">catchment</span> ' + esc(m.areaLabel)
      + '<br><span class="k">runoff</span> ' + (run ? fmt(m.runoffMm, 1) + ' mm (' + pct.toFixed(0) + '% of the rain, the rest soaks in or is held back)'
        : (m.rainMm > 0 ? 'nothing yet — the storm has not beaten the ' + fmt(m.initialAbsMm, 1) + ' mm the ground soaks up first' : 'enter a rainfall to see runoff'))
      + '<br><span class="k">volume</span> ' + (run ? fmt(m.volumeM3 / 1e6, 2) + ' million m³' : '—')
      + '<br><span class="k">peak flow</span> ' + (run ? fmt(m.peakM3s) + ' m³/s' : '—')
      + '<br><span class="k">mountain / plain</span> ' + (m.upstreamKm > 0
        ? fmt(m.mountain.mtKm, 0) + ' km of river above ' + fmt(m.mountain.thresholdM) + ' m vs ' + fmt(m.mountain.plKm, 0) + ' km below it'
        : 'needs the upstream trace (Trace: Upstream)')
      + (m.upstreamKm > 0 ? ' (' + (m.mountain.mountainFrac * 100).toFixed(0) + '% mountain)' : '')
      + '<br><span class="k">land cover</span> ' + esc(m.coverLabel) + ' — curve number ' + m.cn + ', coefficient ' + m.c
      + '<br><span class="k">cloud area</span> ' + (shown
        ? 'the ' + fmt(m.areaKm2) + ' km² catchment above; intensity sets its height and drop density, not its footprint'
        : 'tick “show it in 3D” to place the cloud over the catchment');
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* Measured, and invisible without a comment: the 3D map has Mapterhorn terrain on, so anything at
     elevation 0 is buried inside the ground and never drawn - the first version of the storm was
     invisible for exactly that reason (the catchment fill showed, the cloud and rain did not). The
     cloud therefore sits above the highest ground in its own catchment, found by asking the map for
     real terrain elevations, and the rain hangs just under it. A cloud does sit above the peaks,
     so this is also the honest picture. Cached per catchment, so it costs 16 queries once. */
  async function terrainBase(geom) {
    const key = geom ? geom.type + ":" + geom.coordinates.length : "none";
    if (baseKey === key && baseP) return baseP;
    baseKey = key;
    const m = getMap();
    baseP = (async () => {
      const bb = geom ? geomBBox(geom) : null;
      if (!m || !m.queryTerrainElevation || !bb) return 1500;
      try {
        const pts = [];
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++)
          pts.push({ lng: bb.minX + (bb.maxX - bb.minX) * (gx + 0.5) / 5,
                     lat: bb.minY + (bb.maxY - bb.minY) * (gy + 0.5) / 5 });
        /* Measured: queryTerrainElevation THROWS SYNCHRONOUSLY for a point with no resident DEM
           tile rather than returning a rejected promise, so a plain .catch on the call is not
           enough - the throw happens before any promise exists and kills the whole batch, which is
           why the base used to fall back to 1,500 m every time. Each point is therefore called
           inside its own try/catch. */
        const els = await Promise.all(pts.map(p => {
          try { return Promise.resolve(m.queryTerrainElevation(p)).catch(() => null); }
          catch (_) { return Promise.resolve(null); }
        }));
        let max = 0, ok = 0;
        for (const e of els) if (typeof e === "number" && isFinite(e)) { if (e > max) max = e; ok++; }
        /* few DEM tiles are resident across a 57,000 km2 basin, so accept a single reading and
           fall back to the Western Ghats' own order of magnitude only if none arrive */
        return ok >= 1 ? Math.round(max + 250) : 1500;
      } catch (_) { return 1500; }
    })();
    return baseP;
  }

  /* GeoJSON exterior rings must run counter-clockwise. The sub-basin shapefile's rings are wound the
     other way, which a plain fill tolerates but a fill-extrusion silently culls - so the cloud was
     drawn with no error and simply never appeared. Normalise the winding before using a polygon
     for an extrusion, and say so in the code because the symptom is invisible. */
  function ccw(ring) {
    let a = 0;
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++)
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    return a > 0 ? ring.slice().reverse() : ring;
  }
  function asExtrusion(geom) {
    if (!geom) return null;
    if (geom.type === "Polygon")
      return { type: "Polygon", coordinates: geom.coordinates.map((r, i) => i === 0 ? ccw(r) : ccw(r).slice().reverse()) };
    if (geom.type === "MultiPolygon")
      return { type: "MultiPolygon", coordinates: geom.coordinates.map(p =>
        p.map((r, i) => i === 0 ? ccw(r) : ccw(r).slice().reverse())) };
    return null;
  }

async function draw(m, hit) {
    const map = getMap();
    /* Measured: MapLibre's isStyleLoaded() is false whenever any tile is in flight, so gating on
       it meant the storm drew once and then silently refused every update (the cloud never grew).
       The deck already tracks the style-ready moment itself, so ask for that instead. */
    if (!map || !(ctx.ready ? ctx.ready() : map.isStyleLoaded())) {
      /* the style can still be loading when the user ticks the box; drop the draw then and the
         storm simply never appears, so retry a bounded number of times instead */
      if (++tries < 25) setTimeout(() => { draw(m, hit); }, 400);
      return;
    }
    tries = 0;
    const geom = geomOf(hit);
    cloudBase = await terrainBase(geom);
    const feature = d_f(hit);
    const solid = { type: "FeatureCollection", features: (() => {
      const g = asExtrusion(geomOf(hit));
      return g ? [{ type: "Feature", properties: {}, geometry: g }] : [];
    })() };
    const src = map.getSource("storm-catch");
    if (!src) {
      map.addSource("storm-catch", { type: "geojson", data: feature });
      map.addLayer({ id: "storm-catch", type: "fill", source: "storm-catch",
        paint: { "fill-color": "#38BDF8", "fill-opacity": 0.1 } });
      /* the footprint is the answer to "how much area does the cloud cover", so it gets a crisp
         edge of its own rather than relying on a translucent fill to be legible */
      map.addLayer({ id: "storm-catch", type: "line", source: "storm-catch",
        layout: { "line-join": "round" },
        paint: { "line-color": "#0EA5E9", "line-width": 2, "line-opacity": 0.95, "line-dasharray": [3, 2] } });
      map.addSource("storm-cloud", { type: "geojson", data: solid });
      map.addLayer({ id: "storm-cloud", type: "fill-extrusion", source: "storm-cloud",
        paint: { "fill-extrusion-color": "#E0F2FE", "fill-extrusion-opacity": 0.55,
          "fill-extrusion-vertical-gradient": true,
          "fill-extrusion-base": cloudBase, "fill-extrusion-height": 2000 } });
      map.addSource("storm-rain", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "storm-rain", type: "fill-extrusion", source: "storm-rain",
        paint: { "fill-extrusion-color": "#BAE6FD", "fill-extrusion-opacity": 0.5,
          "fill-extrusion-base": cloudBase - RAIN_LEN_M, "fill-extrusion-height": RAIN_LEN_M } });
    } else {
      src.setData(feature);
      const cs = map.getSource("storm-cloud"); if (cs) cs.setData(solid);
    }
    const rs = map.getSource("storm-rain");
    const sk = streaks(geom, m.intensityMmH);
    if (rs && sk) rs.setData(sk);
    const h = Math.round(Math.max(CLOUD_MIN_M, Math.min(CLOUD_MAX_M, 500 + m.intensityMmH * 45)));
    try {
      map.setPaintProperty("storm-cloud", "fill-extrusion-base", cloudBase);
      map.setPaintProperty("storm-cloud", "fill-extrusion-height", h);
      map.setPaintProperty("storm-cloud", "fill-extrusion-opacity", 0.4 + Math.min(0.35, m.intensityMmH / 300));
      /* the columns hang just under the cloud, at a real altitude, so the terrain cannot hide them */
      map.setPaintProperty("storm-rain", "fill-extrusion-base", cloudBase - RAIN_LEN_M);
    } catch (_) {}
    animate(map, m.intensityMmH);
  }

  /* recover the polygon geometry for the sub-basin we matched */
  function geomOf(hit) {
    if (!data) return null;
    for (const f of data.subs.features) {
      const p = f.properties || {};
      const name = (p.ba_name ? p.ba_name + " / " : "") + (p.sub_basin || p.ba_name || "");
      if (name === hit.name) return f.geometry;
    }
    return null;
  }
  const d_f = hit => ({ type: "FeatureCollection", features: geomOf(hit)
    ? [{ type: "Feature", properties: {}, geometry: geomOf(hit) }] : [] });

  return {
    async refresh() { return compute(); },
    async setShown(on) {
      shown = !!on;
      if (!shown) { teardown(getMap()); return false; }
      return compute();
    },
    isShown: () => shown,
    lastError: () => lastErr,
    dispose() { shown = false; teardown(getMap()); },
  };
}

/* fill the land-cover menu from the same table the model uses, so they cannot drift apart */
export function fillCoverSelect(select) {
  if (!select) return;
  select.innerHTML = COVER_KEYS.map(k =>
    '<option value="' + k + '"' + (k === "forest" ? " selected" : "") + ">" + esc(CN_TABLE[k].label) +
    " — CN " + CN_TABLE[k].cn + ", C " + CN_TABLE[k].c + "</option>").join("");
}
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));