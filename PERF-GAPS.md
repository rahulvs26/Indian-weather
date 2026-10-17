# PERF-GAPS — ultra smooth / ultra speed audit

Measured on this deck (2026-10-17, headless Chrome, viewport 912×678, DPR 1.25) — numbers first,
then the gaps. Order is by expected win, cheapest verification first.

## Measured baseline

| item | measured |
|---|---|
| MapLibre style | **131 layers** (73 line · 27 symbol · 22 fill · 7 circle · 1 fill-extrusion), **11 sources** |
| Our own extra layer | `deck-3d-buildings` fill-extrusion, already `minzoom 13.5` |
| Terrain | raster-dem (Mapterhorn, terrarium), always on, exaggeration 1 (true scale) |
| Glyphs | redirected to `fonts.openmaptiles.org` (works) → 0 console errors |
| MapLibre canvas | 1069×525 device px for 855×420 CSS px (DPR 1.25) |
| Page JS heap | **127 MB used / 138 MB total** after dams + routing worker active |
| Canvases | `maplibregl-canvas` (visible) · `windCanvas` (855×420, hidden) · `terrain3d` (THREE, hidden) |
| Stages on the page | 7 `.stage` blocks, each with its own map/canvas |
| Dam dots | 13,002 (source) + ~700 tall (source) — thinned below zoom 6 |
| Route solve | ~11 ms per dam, 0 up-flow regressions over 400 dams |

**Measurement blocker:** this harness runs a background tab, where `requestAnimationFrame` never
fires — so real FPS/p95 cannot be measured here. Everything below must be verified in a real
foreground window; see E1.

## A. Largest wins

- [ ] **A1 Curate the style.** 131 layers are evaluated per tile; the 27 symbol layers (text shaping +
      collision) dominate. Fetch `https://tiles.openfreemap.org/styles/bright` once, keep the ~35
      layers the deck actually needs, save as `data/style-deck.json` and point `STYLE_URL` at it.
      *Verify:* layer count in `map.getStyle()`, visual diff, bandwidth per tile.
      *Expected:* the biggest single speed win; also fewer bytes.
- [ ] **A2 Pause everything off-screen.** There is no `IntersectionObserver` anywhere, so
      `stepWind` (app.js:87) and `phenStep2` (app.js:1294) keep rAF loops alive for sections the user
      is not looking at, and the THREE.js terrain renderer stays live. Add one observer that sets
      `data-live` per `.stage`; loops early-return when not live; `renderer.setAnimationLoop(null)` for
      terrain3d; `map.stop()` + `triggerRepaint()` on the MapLibre map.
      *Verify:* rAF callback count drops to ~0 while the quiz section is in view.
- [ ] **A3 Wind particle budget.** 340 particles at DPR ≤ 1.5 over a full-width canvas, plus a
      `setInterval` watchdog (app.js:138) that re-arms rAF. Scale the count with viewport area, cap
      DPR at 1.25, and idle the watchdog. *Verify:* particle count shown in the HUD.

## B. Map-specific

- [ ] **B1 DEM tile size.** `deck-dem` uses the raster-dem default. Try `tileSize: 512` (half the
      tiles, half the draw calls) and compare crispness at zoom 5 and 8.
- [ ] **B2 Pixel ratio.** MapLibre renders at `devicePixelRatio` (up to 3 on phones). Add
      `map.setPixelRatio(Math.min(devicePixelRatio, 2))`, and have "Smooth (flat 2D)" drop it to 1.
- [ ] **B3 Pick-sweep cache.** `damPickAt` projects 13,002 points per click and per throttled hover
      tick. Cache the projected array on `moveend` and reuse it for the next few seconds.
- [ ] **B4 Route cache cap.** `damCache` is unbounded — 200 explored dams means 200 stored routes.
      Make it an LRU capped at ~80 entries.
- [ ] **B5 Worker footprint.** The routing worker keeps the 14 MB network + bbox index resident
      (~50-80 MB). Add an idle timer: terminate after ~5 min with no dam mode; re-created on demand.
- [ ] **B6 Buildings.** Already `minzoom: 13.5`; also set `visibility:none` below zoom 13 so the
      expression is not evaluated at all while zoomed out.

## C. Animation smoothness

- [ ] **C1 One camera animation, not six per second.** `damFollowStep` starts a new `easeTo` every
      150 ms, so camera animations overlap. Use a single longer `easeTo` (or `jumpTo`) per step.
      *Verify:* the bird's-eye zoom-out during a run no longer stutters.
- [ ] **C2 Card writes.** `damTick` writes several `textContent`s 6×/second — batch into one rAF write.
- [ ] **C3 Reduced motion.** `prefers-reduced-motion` is honoured for flights; extend it to the
      full-screen transition and the release camera.

## D. Memory

- [ ] **D1 Heap.** 127 MB used. Contributors: 13k dam objects + a 13k-feature GeoJSON source + the
      ~700-feature tall source + Leaflet/embedded data. Verify after 50 selections; drop the
      duplicate `dam-pts-tall` array by referencing a shared features list.
- [ ] **D2 Unused datasets.** Confirm which `data/*.geo.json` files are still fetched (reservoirs,
      subbasins, india-rivers) and lazy-load or drop the ones no section needs.

## E. Make performance measurable (do this first)

- [ ] **E1 `?perf=1` mode + `window.__deck.perf()`.** Sample frame times for 5 s, report p50/p95 and
      the number of active render loops; print to a small overlay. Without this, every item above is
      unverifiable in this environment and only guesses can be made about its effect.

## Definition of done

- [ ] p95 frame time under 16 ms while panning the 3D map with terrain on (real foreground window).
- [ ] Idle rAF loops ≈ 0 when no map section is in view.
- [ ] Page heap under ~80 MB after 50 dam selections.
- [ ] Style layers cut from 131 to ≤ 45 with no visual loss on the deck's sections.