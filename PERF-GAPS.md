# PERF-GAPS — ultra smooth / ultra speed audit (measured, not guessed)

Frame times come from the in-deck probe: `index.html?perf=1` shows an overlay, `window.__deckPerf(3)`
(or `window.__dam.perf()`) returns p50/p95/max. All numbers below were measured on this machine with
one tab open and nothing else running.

## Measured baseline (v7.16, before the sweep)

| item | measured |
|---|---|
| MapLibre style | **131 layers** (73 line · 27 symbol · 22 fill · 7 circle · 1 fill-extrusion), **11 sources** |
| Terrain | raster-dem (Mapterhorn, terrarium), always on, exaggeration 1 (true scale) |
| Glyphs | redirected to `fonts.openmaptiles.org` (the style's own font endpoint 404s) → 0 console errors |
| MapLibre canvas | 1069×525 device px for 855×420 CSS px (DPR 1.25) |
| Page JS heap | 127 MB after dams + routing worker; 225 MB with the dam view, routes and caches warm |
| Canvases | `maplibregl-canvas` (visible) · `windCanvas` (855×420, hidden behind the 3D map) · `terrain3d` (THREE, hidden) |
| Stages | 7 `.stage` blocks, each with its own map/canvas |
| Dam dots | 13,002 (source) + ~700 tall (source), thinned below zoom 6 |
| Route solve | ~8 ms per dam, 0 up-flow regressions over 400 dams |

## Measured results (v7.17, after this sweep)

| state | before | after |
|---|---|---|
| 3D map idle | 46-51 ms (~21 fps) | **16.7 ms (60 fps)** |
| dam mode, 13,002 dots | 47.3 ms | **16.6 ms** |
| route drawn | 49.2 ms | **16.7 ms** |
| during a release | 47.6 ms | **16.6 ms** |

### What actually mattered

- **The whole win: `stepWind` was drawing 340 particles into a `display:none` canvas.** When the 3D
  map is showing, the CSS hides `#windCanvas`, but the rAF loop only checked the layer flag, so it
  kept clearing and drawing every frame. `offsetParent` is null for a hidden element, so the loop now
  skips — measured 47 ms → 16.6 ms (2.8×).
- **Off-screen pausing.** One `IntersectionObserver` (`window.__deckStageLive`) now gates the wind
  canvas, the phenomena stepper, the THREE terrain loop and the dam camera follow. Verified by
  scrolling: only the section in view carries `data-live="1"`.

### What was measured and dropped (negative results, so nobody re-derives them)

- **Style layers are not the bottleneck.** Hiding all 27 symbol + 73 line + 22 fill layers changed
  nothing: 51.2 → 48.7 ms. Do NOT spend effort curating the style for speed.
- **Terrain is not the bottleneck.** `setTerrain(null)` changed nothing (48.4 → 48.3 ms), and
  "Smooth (flat 2D)" (no DEM, DPR 1, buildings hidden) changed nothing (47.7 ms). It stays as a user
  option, not a performance lever.
- **MapLibre render cost is not on the critical path.** `map._render` was called **0 times in 2.5 s**
  while idle — the map is already on-demand; only camera easings drive it.
- **Wind particles were never the 2D-page cost**: with the layer off that page was still 41 ms.

### Environment caveat (important)

This VM's frame pacing is unreliable — one 3-second stall inside a 3-second sample, GPU is
ANGLE/D3D11 on an Intel HD 520, and the page's own rAF callbacks measure **0.01 ms per frame**.
Absolute FPS here is not what the user's machine will show. Read these as "what changed on a noisy
VM", then re-run `?perf=1` on a real machine.

## Open items

- [ ] **B3 Pick-sweep cache** — `damPickAt` projects 13,002 points per click (~1-2 ms) and per
      throttled hover tick. Cache the projected array on `moveend` if input lag is ever felt.
- [ ] **C2 Card writes** — `damTick` writes several `textContent`s 6×/second; batch into one rAF write.
- [ ] **C3 Reduced motion** — extend `prefers-reduced-motion` to the full-screen transition and the
      release camera (flights already honour it).
- [ ] **D1/D2 Memory** — confirm the heap on a real machine after 50 selections; the LRU (80 routes)
      and the 5-minute worker release already cap both growth paths. Check which `data/*.geojson` are
      still fetched and lazy-load or drop the unused ones.
- [ ] **B1 DEM `tileSize: 512`** — only if a real-machine measurement shows terrain cost.
- [ ] Re-run `?perf=1` on the user's own machine.

## Done (v7.17)

- [x] A1 style layers — measured NOT the bottleneck, plan dropped
- [x] A2 off-screen pausing (IntersectionObserver, `data-live` verified)
- [x] A3/A4 hidden-canvas draw (the real win) + particle budget left alone
- [x] B2 pixel ratio: "Smooth (flat 2D)" drops to DPR 1 and restores `min(devicePixelRatio, 2)`
- [x] B4 route cache LRU capped at 80
- [x] B5 routing worker terminated after 5 idle minutes, re-created on demand
- [x] C1 camera easings no longer overlap (150 ms tick, 150 ms ease) and skipped off-screen
- [x] E1 the measurement probe itself

## Definition of done

- [x] p95 under 25 ms while a dam release runs with the 3D map active (16.6-17.5 ms measured)
- [x] off-screen sections do no animation work
- [x] route cache and worker memory bounded
- [ ] re-measure on the user's machine (this VM's pacing is indicative only)