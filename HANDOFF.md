# HANDOFF — read this file first, nothing else

One-page state so a fresh session (or another agent) needs ~2k tokens instead of
re-reading the codebase. Do NOT read `app.js` end-to-end (~760 lines) — grep for
the symbols named below (a lean session with targeted greps + live verify stays
well under 40k tokens; reading app.js whole adds ~75k — avoid).
Full build rules: `INDIAN_WEATHER_SPEC.md` (v5.8).

## What this is
Static single-page study site (no build): `index.html` + `styles.css` + `app.js` +
`data/embedded.js` (bundle) + `data/*.geo.json`. Serve:
`python -m http.server 8000` → `http://127.0.0.1:8000/index.html?live=N`
(N++ every reload to beat cache; `?v=` must be bumped on EVERY asset change or a
browser can hold a stale same-version asset — if in doubt verify on a fresh origin,
e.g. `localhost` vs `127.0.0.1`). Brand in header shows version (now v5.8).

## Working rules (non-negotiable)
1. No invented data; every fact cites a source (6 IMD PDFs in `pdf/` + web). Any
   illustrative mapping must be labelled "(illustrative)" in its readout/note.
2. Verify EVERY change live in the browser (console level=error + readout/geometry
   check via `window.__t3` / `#layerDebug`) BEFORE claiming done. A screenshot is
   the fallback for visual bugs that numbers can't catch (the user asks to avoid
   routine screenshots — they cost tokens). Reload before evaluating (stale-cache
   race has burned us).
3. On asset change bump `?v=` on styles/app/embedded + brand + spec header.
4. `data/embedded.js` is a bundle whose keys SHADOW the files on disk. Editing
   `data/months.json`/`mjo.json` etc. requires patching the same key inside
   `embedded.js` (python: parse `window.IND_DATA=...`, swap key, dump back).
5. Palette: paper/ink/muted/teal + amber(heat) + blue(cold) + violet #6D28D9
   (MJO-enhanced zone ONLY).

## Current verified state (2026-10-15, v5.8)
- Self-test line `#layerDebug`: `months=12 stations=23 states=36 rivers=109
  basins=25 dams=13002 cwc=30395 mjo=8 rm=<0|1> layers on=11/13 vectors-ok`.
  `rm=1` means the system asks for reduced motion — relevant to animations.
  While 3D is on the vectors check reads `2D hidden (3D on)` (expected; the 3D
  toggle refreshes the line at toggle-on and again ~350 ms after returning to 2D).
- Map look (v5.6): OSM raster tiles re-tinted soft grey via
  `#osmMap .leaflet-tile-pane{filter:grayscale(1) brightness(1.04) contrast(0.92)}`
  in styles.css — the only colour on the map is the data overlays. CARTO Positron
  was tried and rejected: keyless CARTO tiles now stamp "API KEY REQUIRED"
  watermarks (seen live 2026-10-15); do not reintroduce it without a key.
- MJO: tour (`▶ MJO` on map / `▶ propagate` in Fig5 loom) auto-fits the
  equatorial corridor, advances every 1.1 s (2.6 s + snap under reduced motion),
  wraps 8→1 with snap, glides otherwise; shuttle has CSS glide transition.
- Month slider ↔ MJO: `months.json` `mjoTyp` (ILLUSTRATIVE month-typical phase;
  anchors: Ph1–3 wet S peninsula/NE monsoon Oct–Dec, Ph4–5 SW break Jul–Sep).
  `setMonth()` calls `window.__mjoMonthSync` (skipped while a tour runs).
- MJO arrow influence zone: canvas wind arrows within ±30° lon of the pulse and
  |lat|<14 recolour violet (Ph1–3 enhanced) / muted grey (Ph4–5); the three
  pulse-feed burst arrows match; legend in the Fig-0 caption.
- Zoom hierarchy (Google-Maps style): rivers rivMaj/rivMed(≥5)/rivMin(≥7);
  dams dg0(top40)/dg1(<400)/dg2(all, ≥8) + labels ≥7; CWC network ≥6 bg-load;
  water (reservoirs/glacial/TN) lazy on chip only.
- 3D terrain (v5.8, real relief): Terrarium DEM at z=6 (≈2.3 km/px, 7×8=56 tiles
  ≈2–4 MB on first 3D open → build takes a few seconds), relief mesh 640×560
  segments, single-pass ±1 px blur (heavy blur flattens summits — raw z6 holds
  Everest at 8121 m), and `yOf` UNCLIPPED — Everest 8849 m = 1.15
  world units, top of scale (old `min(1.1,…)` cap flattened everything above
  ≈7174 m into an upper-Himalaya plateau — do not reintroduce).
  `window.__t3={hAt,yOf,stats}` publishes read-only hooks for verification.
- 3D dams (v5.8, top-250 tallest): valley-fitted crest-level walls — bases follow
  the terrain, ends die into hillsides at abutments (search stops when terrain
  reaches crest), battered cross-section, bronze body + lit amber crest via vertex
  colours in ONE merged non-indexed geometry (FrontSide; winding was verified
  triangle-by-triangle — don't casually reorder). Wall axis ⟂ nearest draped river
  (coarse xz tangent grid). Reservoir water = flat surfaces just below crest only
  where the valley closes upstream; the terrain itself carves the shoreline.
  Caption carries "(illustrative, height-scaled)".
  Basins block uses LOCAL XB/ZB helpers — do not "simplify" to X/Z (TDZ crash,
  fixed v5.3).

## Known land-mines (already fixed once — do not reintroduce)
- `.stage svg` CSS collapsed Leaflet vectors → keep `#osmMap svg` id-scoped rule.
- Tile re-tint filter must stay scoped to `.leaflet-tile-pane` — on `#osmMap` or
  `.stage` it would re-tint the overlay SVG + markers too.
- `window.__mjo*` layer refs must be published AFTER creation (TDZ crash v3.7).
- Wind loop global `mjoG` scope bug + 4 s watchdog (`stepWind._t`) — leave intact.
- 3D terrain: `draped` scope; basins X/Z TDZ (use XB/ZB); the dams block reads
  `draped` (river polylines) for wall orientation + pool side — keep it AFTER the
  rivers block inside `buildTerrain()`.
- Elevation scale: `yOf` must stay unclipped (v5.8) — heights are relative to
  Everest 8849 m; the visual gains come from z=6 tiles + fine mesh + light blur,
  not from rescaling. If tiles ever 404, check `TB.z`/tileURL, not the formula.

## Next up (for the next session)
- Nothing blocking; site is green (v5.8, everything live-verified).
- If asked to keep polishing the 3D view: candidates are hover labels for the
  top-40 dams, a soft spillway glint, or snow-cap tinting tied to `yOf` bands —
  if any option conveys new info, keep the "(illustrative)" label.
- Otherwise pick from the standing optional items below.

## Open items (not bugs)
- 6 rivers have no centerlines in any source (Kosi, Sabarmati, Luni, Damodar,
  Subarnarekha, Vaigai) → origin dots only; honest gap, documented.
- Big layers stay fetch-only (14.6 MB CWC, 2.3 MB reservoirs, 2 MB banks,
  0.5 MB TN) — intentional for first-paint speed.
- Optional future: thinner cwc file, mobile pass, live-API hooks
  (`window.INDWeather.live` placeholders + `data/live.example.json`).

## Quick browser verification recipes
- MJO month link: set `#monthSlider` value 10 → expect `INDWeather.mjo==1`,
  `__mjoAnim.tlon==15`; value 9 → 5 / 83; value 1 → 3 / 49.
- MJO tour: click `#mjoPlayMap`; sampled `INDWeather.mjo` must change within
  ~1.5 s; button text flips ▶/■.
- Map minimalism: `getComputedStyle(document.querySelector("#osmMap .leaflet-tile-pane")).filter`
  == `grayscale(1) brightness(1.04) contrast(0.92)`; overlay pane filter stays `none`.
- 3D terrain + elevation (no screenshot needed): fresh load → `3D mountains` →
  wait for `#terrainCap` to include "Valley-fitted dam walls + reservoir water
  (illustrative, height-scaled)." Then evaluate `__t3.yOf(8849)` → exactly `1.15`
  (clip gone); `__t3.hAt` at Everest (86.925,27.988) → ≈7400–7600 after mesh
  resampling (raw z6 summit pixel is 8121; the old pipeline rendered ≈6830 under
  a 7174 ceiling), K2 (76.51,35.88) > 6000; Mumbai/Chennai coasts < 100 m;
  `__t3.stats.walls` → 250, `__t3.stats.reservoirs` → >0 (0 means the
  valley-closure gate never fired — inspect `LMAX`/`wy`).
- 3D dam look: walls should sit IN the terrain — bottoms follow the slope, ends
  vanish into hillsides, amber crest strip on top; water only in closed valleys.
  If walls float or look perpendicular-matchstick again, check the `w2` mapping
  (`cosA=ax, sinA=-az`) and that `draped` is still in scope before them.
- Self-test in 3D: expect `2D hidden (3D on)`; toggling back to 2D auto-refreshes
  to `vectors-ok` (~350 ms).
- Commands used previously run clean: `node --check app.js`.

## Repo layout cheat-sheet
- Site: `index.html`, `styles.css`, `app.js`
- Data: `data/embedded.js` (bundle), `data/*.geo.json` (shapefile extracts —
  see `SHAPE_INTEGRATION.md`), `data/months.json`, `data/mjo.json`, etc.
- Docs: `INDIAN_WEATHER_SPEC.md` (frozen build spec, v5.8), `SHAPE_INTEGRATION.md`
  (shapefile checklist, all ticked), `CITATIONS.md` (all sources/©), `README.md`.
- NEVER commit: `pdf/` (IMD ©), `Shape files/` (1.1 GB) — both git-ignored.
