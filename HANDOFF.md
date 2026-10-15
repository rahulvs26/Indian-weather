# HANDOFF — read this file first, nothing else

One-page state so a fresh session (or another agent) needs ~2k tokens instead of
re-reading the codebase. Do NOT read `app.js` end-to-end (~760 lines) — grep for
the symbols named below (a lean session with targeted greps + live verify stays
well under 40k tokens; reading app.js whole adds ~75k — avoid).
Full build rules: `INDIAN_WEATHER_SPEC.md` (v5.7).

## What this is
Static single-page study site (no build): `index.html` + `styles.css` + `app.js` +
`data/embedded.js` (bundle) + `data/*.geo.json`. Serve:
`python -m http.server 8000` → `http://127.0.0.1:8000/index.html?live=N`
(N++ every reload to beat cache; `?v=` must be bumped on EVERY asset change or a
browser can hold a stale same-version asset — if in doubt verify on a fresh origin,
e.g. `localhost` vs `127.0.0.1`). Brand in header shows version (now v5.7).

## Working rules (non-negotiable)
1. No invented data; every fact cites a source (6 IMD PDFs in `pdf/` + web). Any
   illustrative mapping must be labelled "(illustrative)" in its readout/note.
2. Verify EVERY change live in the browser (console level=error + screenshot)
   BEFORE claiming done. Reload before evaluating (stale-cache race has burned us).
3. On asset change bump `?v=` on styles/app/embedded + brand + spec header.
4. `data/embedded.js` is a bundle whose keys SHADOW the files on disk. Editing
   `data/months.json`/`mjo.json` etc. requires patching the same key inside
   `embedded.js` (python: parse `window.IND_DATA=...`, swap key, dump back).
5. Palette: paper/ink/muted/teal + amber(heat) + blue(cold) + violet #6D28D9
   (MJO-enhanced zone ONLY).

## Current verified state (2026-10-15, v5.7)
- Self-test line `#layerDebug`: `months=12 stations=23 states=36 rivers=109
  basins=25 dams=13002 cwc=30395 mjo=8 rm=<0|1> layers on=11/13 vectors-ok`.
  `rm=1` means the system asks for reduced motion — relevant to animations.
  While 3D is on the vectors check reads `2D hidden (3D on)` (expected; the 3D
  toggle refreshes the line ~350 ms after returning to 2D).
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
- 3D terrain: sea plane (0 m MSL), draped basin washes + rims + tags, rivers +
  packets, cities/peaks. Dams (v5.7, top-250 tallest): aligned barrage walls —
  bronze body + lit amber crest (matches city dots) + illustrative teal upstream
  pools; wall long-axis ⟂ nearest draped river (coarse xz tangent grid), pools on
  the uphill side; caption carries "(illustrative, height-scaled)".
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

## Next up (for the next session)
- Nothing blocking; site is green (v5.7, everything live-verified).
- If asked to keep polishing the 3D dams: candidates are hover labels for the
  top-40 dams, a soft spillway glint, or a per-height colour ramp — if any option
  conveys new info, keep the "(illustrative)" label.
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
- 3D dams: fresh load → `3D mountains` → `#terrainCap` ends with "Dam walls +
  pools (illustrative, height-scaled)."; dams render as amber-crest walls across
  the blue river lines with teal pools uphill (visual check; the pre-v5.7
  matchstick look meant the extrude axis was swapped).
- Self-test in 3D: expect `2D hidden (3D on)`; toggling back to 2D auto-refreshes
  to `vectors-ok` (~350 ms).
- Commands used previously run clean: `node --check app.js`.

## Repo layout cheat-sheet
- Site: `index.html`, `styles.css`, `app.js`
- Data: `data/embedded.js` (bundle), `data/*.geo.json` (shapefile extracts —
  see `SHAPE_INTEGRATION.md`), `data/months.json`, `data/mjo.json`, etc.
- Docs: `INDIAN_WEATHER_SPEC.md` (frozen build spec, v5.7), `SHAPE_INTEGRATION.md`
  (shapefile checklist, all ticked), `CITATIONS.md` (all sources/©), `README.md`.
- NEVER commit: `pdf/` (IMD ©), `Shape files/` (1.1 GB) — both git-ignored.
