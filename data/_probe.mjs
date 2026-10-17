/* v7.22w — the live performance and smoke probe.
   --------------------------------------------------------------------------------
   Pasted into the page by the test runner (data/_run_tests.mjs) rather than being a page, so it
   needs no build step and can run against any deployment - including GitHub Pages - by pointing it
   at a URL. What it measures, and why each one is here:

     navigation timings   first paint, DOMContentLoaded, load. From the browser, not guessed.
     long tasks           any main-thread block over 50 ms. This is what a user feels as jank, and it
                          is invisible to a static check.
     fetch cost           every data file the deck can ask for, timed. 14.3 MB of rivers on a phone
                          connection is the single biggest risk in this project and it is measurable.
     frame timing         on the 3D map, where the work is. Frames per second and the worst frame,
                          with and without the dam trace running.
     memory               where the JS heap sits after the heavy loads, because a 14 MB GeoJSON parse
                          is where a browser tab usually dies.
     smoke assertions     the things that broke this project before: the 3D map must exist, a
                          reservoir feature must expose an area, the search box must work unticked.

   Usage in a page console or via automation:
     await window.__probe()          -> the object below
*/
export function makeProbe() {
  const out = { when: new Date().toISOString(), url: location.href, nav: {}, longTasks: [], fetch: [], frames: {}, memory: {}, smoke: {}, errors: [] };

  /* ---- navigation ---- */
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav) out.nav = {
    domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
    loadMs: Math.round(nav.loadEventEnd),
    transferKB: Math.round((nav.transferSize || 0) / 1024),
    resources: performance.getEntriesByType("resource").length,
    firstPaintMs: Math.round((performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0),
  };

  /* ---- long tasks: anything over 50 ms of main-thread work ---- */
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) out.longTasks.push({ ms: Math.round(e.duration), name: e.name });
    }).observe({ entryTypes: ["longtask"] });
  } catch (_) { out.errors.push("longtask observer unavailable"); }

  /* ---- transfer size of everything loaded so far ---- */
  out.resources = performance.getEntriesByType("resource").map(r => ({
    name: r.name.split("/").pop().slice(0, 46),
    ms: Math.round(r.duration),
    kb: Math.round((r.transferSize || 0) / 1024),
  })).sort((a, b) => b.kb - a.kb).slice(0, 18);

  /* ---- memory, where it can be read ---- */
  if (performance.memory) {
    out.memory = {
      usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      limitMB: +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0),
    };
  }

  /* ---- smoke: the things that broke before ---- */
  const S = id => document.getElementById(id);
  out.smoke.brandPresent = !!document.querySelector(".brand");
  out.smoke.mapStagePresent = !!document.querySelector("#map .stage");
  out.smoke.viewSwitchPresent = !!S("m3v2d");
  out.smoke.damConsolePresent = !!S("damSearch");
  out.smoke.stormBlockPresent = !!S("stormBlk");
  out.smoke.scriptTags = [...document.querySelectorAll("script[src]")].map(s => s.src.split("/").pop());
  /* the MapLibre module must have evaluated - this is what the node:fs import destroyed */
  out.smoke.map3dLoaded = typeof window.__map3d === "object";
  out.smoke.setMapView = typeof window.__setMapView === "function";
  /* and every data path the HTML names must have been fetchable */
  out.smoke.dataPaths = [...new Set([...document.documentElement.innerHTML.matchAll(/data\/[A-Za-z0-9_.-]+\.(?:json|geojson)/g)]
    .map(m => m[0]))];

  return out;
}

/* time each data file the deck can ask for, so the payload risk is a number rather than a worry */
export async function timeFetches(paths) {
  const rows = [];
  for (const p of paths) {
    const t0 = performance.now();
    try {
      const r = await fetch(p, { cache: "no-store" });
      const text = await r.text();
      rows.push({ path: p.split("/").pop(), ok: r.ok, ms: Math.round(performance.now() - t0), kb: Math.round(text.length / 1024) });
    } catch (e) {
      rows.push({ path: p.split("/").pop(), ok: false, ms: Math.round(performance.now() - t0), kb: 0, err: String(e.message || e).slice(0, 60) });
    }
  }
  return rows.sort((a, b) => b.ms - a.ms);
}

/* frame timing on the 3D map - the only honest way to know whether it is smooth, because the deck's
   own FPS counters did not exist and readPixels returns black on this build */
export async function measureFrames(seconds = 4) {
  const times = [];
  let last = 0;
  const stop = performance.now() + seconds * 1000;
  await new Promise(done => {
    const step = t => {
      if (last) times.push(t - last);
      last = t;
      if (t < stop) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  if (!times.length) return { frames: 0 };
  const sorted = times.slice().sort((a, b) => a - b);
  const q = p => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
  return {
    frames: times.length,
    seconds: +(times.reduce((a, b) => a + b, 0) / 1000).toFixed(2),
    fps: +(1000 / (times.reduce((a, b) => a + b, 0) / times.length)).toFixed(1),
    medianMs: q(0.5), p95Ms: q(0.95), worstMs: q(0.999),
    over50ms: times.filter(t => t > 50).length,
  };
}

export function report(p) {
  const lines = [];
  lines.push("=== NAVIGATION ===");
  lines.push(`  first contentful paint ${p.nav.firstPaintMs} ms | DOMContentLoaded ${p.nav.domContentLoadedMs} ms | load ${p.nav.loadMs} ms`);
  lines.push(`  ${p.nav.resources} resources, ${p.nav.transferKB} KB transferred for the first view`);
  lines.push("=== LONG TASKS (main-thread blocks over 50 ms) ===");
  if (!p.longTasks.length) lines.push("  none recorded");
  else for (const t of p.longTasks.sort((a, b) => b.ms - a.ms).slice(0, 8)) lines.push(`  ${t.ms} ms  ${t.name}`);
  lines.push("=== BIGGEST RESOURCES ===");
  for (const r of p.resources.slice(0, 10)) lines.push(`  ${String(r.kb).padStart(7)} KB  ${String(r.ms).padStart(6)} ms  ${r.name}`);
  lines.push("=== MEMORY ===");
  lines.push(`  heap ${p.memory.usedMB || "?"} MB used of ${p.memory.limitMB || "?"} MB`);
  lines.push("=== SMOKE ===");
  for (const [k, v] of Object.entries(p.smoke)) {
    if (k === "dataPaths" || k === "scriptTags") continue;
    lines.push(`  ${v === true ? "OK  " : v === false ? "MISS" : "    "} ${k}: ${v}`);
  }
  return lines.join("\n");
}