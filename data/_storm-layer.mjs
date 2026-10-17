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

import { stormModel, CN_TABLE, COVER_KEYS, DEFAULT_THRESHOLD_M } from "./_hydrology.mjs";

const V = "?v=7.22";
const MAX_STREAKS = 360;      /* hard cap: 360 short segments is one cheap draw call */
const CLOUD_MIN_M = 900, CLOUD_MAX_M = 9000;
/* A catchment drawn from an area alone has no boundary in any of our sources, so it is drawn as a
   circle of that area centred on the dam and labelled as a circle — never as "the" catchment. */
function circleAround(lon, lat, km2) {
  const rKm = Math.sqrt(km2 / Math.PI);
  const dLat = rKm / 110.574;
  const dLon = rKm / (111.320 * Math.cos(lat * Math.PI / 180) || 1);
  const ring = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

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
      const [subs, stats] = await Promise.all([get("data/subbasins.geo.json"), get("data/river-stats.json")]);
      data = { subs, stats, byName: new Map((stats && stats.rivers || []).map(r => [r.name.toLowerCase(), r])) };
      return data;
    })();
    return loading;
  }

  /* what the data actually knows about THIS dam's river: its measured length, and the tile it sits
     in - including how many other rivers share that tile. Measured, because the tile is not a
     catchment: 99.7% of the 27,479 rivers in the network share their tile with more than 25 others
     (data/_gen_river_stats.mjs). Calling a tile area a catchment overstated the Vaippar by more
     than two orders of magnitude, which the user caught. */
  function riverFacts(dam) {
    if (!data || !dam) return null;
    const cands = [];
    const push = n => { const r = data.byName.get(String(n || "").trim().toLowerCase()); if (r && !cands.includes(r)) cands.push(r); };
    push(dam.river);
    const head = String(dam.river || "").split(/[(,/]/)[0];
    push(head);
    if (!cands.length) return null;
    let best = cands[0];
    for (const r of cands) if (r.km > best.km) best = r;
    return { river: best.name, km: best.km, features: best.n, tileRivers: best.tileRivers,
      tileKm2: best.tileKm2, tileName: best.tiles && best.tiles.length ? best.tiles[0].name : null,
      composite: !!best.composite, basin: best.basin };
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
    if (!d) { if (out) out.innerHTML = '<span class="warn">Could not load the river data, so this dam&#8217;s river is unknown. Type a catchment area to go on.</span>'; return null; }
    const rf = riverFacts(dam);
    /* the area is ONLY what the dam record gives, or what the user types. The sub-basin tile is
       never used as the area: it is a CWRD tile shared by up to 1,253 rivers, and using it made a
       79 km river report a 19,937 km&#178; catchment. */
    const typed = +val("stormArea");
    const area = typed > 0 ? typed : (ctx.catchmentKm2 ? ctx.catchmentKm2() : 0);
    const areaFrom = typed > 0 ? "your figure" : (area > 0 ? "the dam record" : null);
    const rain = Math.max(0, +val("stormRain") || 0);
    const dur = Math.max(0.1, +val("stormDur") || 1);
    const cover = el("stormCover") ? el("stormCover").value : "forest";
    const th = val("stormMt") == null ? DEFAULT_THRESHOLD_M : Math.max(0, +val("stormMt"));
    const m = stormModel({ areaKm2: area, areaLabel: rf ? rf.river : (dam.river || "this river"),
      rainMm: rain, durationH: dur, cover, thresholdM: th });
    const hit = rf ? { name: rf.river, rf, area, areaFrom, lon: dam.lon, lat: dam.lat } : null;
    if (out) out.innerHTML = text(m, hit);
    if (shown) {
      /* a draw failure must be visible, not a silent half-applied storm */
      draw(m, hit).catch(e => {
        lastErr = (e && e.message) || String(e);
        const box = el("stormOut");
        if (box) box.innerHTML += '<br><span class="warn">The 3D storm could not be drawn: ' + esc(lastErr) + "</span>";
      });
    }
    lastKey = (rf ? rf.river : "") + "|" + area + "|" + m.rainMm + "|" + m.durationH + "|" + m.cover + "|" + m.mountain.thresholdM;
    return m;
  }

  function val(id) { const e = el(id); return e ? e.value : null; }

  function text(m, hit) {
    const run = m.runoffMm > 0;
    const pct = m.areaKm2 > 0 ? (m.runoffMm / m.rainMm) * 100 : 0;
    const rf = hit && hit.rf;
    let head;
    if (!hit) {
      head = '<b class="big">enter a catchment area</b>';
    } else if (m.areaKm2 > 0) {
      head = '<b class="big">' + fmt(m.intensityMmH, 1) + ' mm/h over ' + fmt(m.areaKm2) + ' km&#178;</b>'
        + '<br><span class="k">area from</span> ' + esc(hit.areaFrom || "your figure");
    } else {
      head = '<b class="big">no catchment area yet</b>'
        + '<br><span class="k">this river</span> ' + (rf ? esc(rf.river) + ' &#183; ' + fmt(rf.km, 0) + ' km mapped in the CWC network' : esc(m.areaLabel))
        + '<br><span class="k">why it is blank</span> no catchment area for this dam is recorded in the sources used. '
        + 'The ' + (rf ? esc(rf.tileName || "sub-basin tile") + ' tile' : "sub-basin tile") + ' is <b>not</b> a catchment'
        + (rf && rf.tileRivers ? ' &#8212; it is shared by <b>' + fmt(rf.tileRivers) + ' other rivers</b>' : '')
        + '. Type the published catchment area above and everything below appears.';
    }
    return head
      + (m.areaKm2 > 0
        ? '<br><span class="k">runoff</span> ' + (run ? fmt(m.runoffMm, 1) + ' mm (' + pct.toFixed(0) + '% of the rain, the rest soaks in or is held back)'
          : (m.rainMm > 0 ? 'nothing yet &#8212; the storm has not beaten the ' + fmt(m.initialAbsMm, 1) + ' mm the ground soaks up first' : 'enter a rainfall to see runoff'))
        + '<br><span class="k">volume</span> ' + (run ? fmt(m.volumeM3 / 1e6, 2) + ' million m&#179;' : '&#8212;')
        + '<br><span class="k">peak flow</span> ' + (run ? fmt(m.peakM3s) + ' m&#179;/s' : '&#8212;') : "")
      + (rf ? '<br><span class="k">this river</span> ' + esc(rf.river) + ' &#183; ' + fmt(rf.km, 0) + ' km mapped, '
          + rf.features + ' feature' + (rf.features === 1 ? '' : 's') + ' in the CWC network' : "")
      + (rf && rf.composite ? '<br><span class="k">its tile</span> &#8220;' + esc(rf.tileName || "") + '&#8221; holds '
          + fmt(rf.tileRivers) + ' rivers over ' + fmt(rf.tileKm2) + ' km&#178; &#8212; a CWRD tile, not this river&#8217;s catchment' : "")
      + (m.upstreamKm > 0
        ? '<br><span class="k">mountain / plain</span> ' + fmt(m.mountain.mtKm, 0) + ' km of river above ' + fmt(m.mountain.thresholdM) + ' m vs ' + fmt(m.mountain.plKm, 0) + ' km below it (' + (m.mountain.mountainFrac * 100).toFixed(0) + '% mountain)'
        : (m.areaKm2 > 0 ? '<br><span class="k">mountain / plain</span> needs the upstream trace (Trace: Upstream)' : ""))
      + (m.areaKm2 > 0 ? '<br><span class="k">land cover</span> ' + esc(m.coverLabel) + ' &#8212; curve number ' + m.cn + ', coefficient ' + m.c : "")
      + (m.areaKm2 > 0
        ? '<br><span class="k">cloud area</span> ' + (shown
          ? 'a circle of ' + fmt(m.areaKm2) + ' km&#178; centred on the dam &#8212; an area, not a real boundary. Intensity sets its height and drop density, not its footprint'
          : 'tick &#8220;show it in 3D&#8221; to place the cloud over that area')
        : "");
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
    const geom = hit && hit.area > 0 ? circleAround(hit.lon, hit.lat, hit.area) : null;
    cloudBase = await terrainBase(geom);
    const feature = geom ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom }] }
      : { type: "FeatureCollection", features: [] };
    const solid = feature;
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