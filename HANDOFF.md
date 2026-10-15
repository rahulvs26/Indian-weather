# HANDOFF — read this file first, nothing else

One-page state so a fresh session (or another agent) needs ~2k tokens instead of
re-reading the codebase. Do NOT read `app.js` end-to-end (~760 lines) — grep for
the symbols named below (a lean session with targeted greps + live verify stays
well under 40k tokens; reading app.js whole adds ~75k — avoid).
Full build rules: `INDIAN_WEATHER_SPEC.md` (v6.1).

## What this is
Static single-page study site (no build): `index.html` + `styles.css` + `app.js` +
`data/embedded.js` (bundle) + `data/*.geo.json`. Serve:
`python -m http.server 8000` → `http://127.0.0.1:8000/index.html?live=N`
(N++ every reload to beat cache; `?v=` must be bumped on EVERY asset change or a
browser can hold a stale same-version asset — if in doubt verify on a fresh origin,
e.g. `localhost` vs `127.0.0.1`). Brand in header shows version (now v6.1).

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

## Current verified state (2026-10-15, v6.1)
- Self-test line `#layerDebug`: `months=12 stations=23 states=36 rivers=109
  basins=25 dams=13002 cwc=30395 mjo=8 rm=<0|1> layers on=11/13 vectors-ok`.
  `rm=1` means the system asks for reduced motion — relevant to animations.
  While 3D is on the vectors check reads `2D hidden (3D on)` (expected; the 3D
  toggle refreshes the line at toggle-on and again ~350 ms after returning to 2D).
- Map look (v6.1): Esri World Light Gray Canvas tiles (keyless
  `server.arcgisonline.com/.../Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  maxNativeZoom 16, attribution "Tiles © Esri — Esri, DeLorme, NAVTEQ") re-tinted
  soft grey via `#osmMap .leaflet-tile-pane{filter:grayscale(1) brightness(1.04) contrast(0.92)}`
  in styles.css — the only colour on the map is the data overlays. Switched from OSM
  volunteer tiles: tile.openstreetmap.org 403-BLOCKED the app on 2026-10-15 (tile usage
  policy — heavy repeated test reloads). NEVER point the layer or a verification back at
  OSM, and keep verification reloads minimal. CARTO Positron stays rejected (keyless =
  "API KEY REQUIRED" watermarks); do not reintroduce it without a key.
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
- 3D TERRAIN PARAMS (all inside `buildTerrain()`; grep the names — do not re-read the file):
  `TB={lon0:66,lon1:98,lat0:5,lat1:38,z:6}` (Terrarium DEM, 7×8=56 tiles ≈2–4 MB, build
  a few seconds); blur = single-pass 3-tap ±1 px; mesh W=3.4 D=2.55 SX=640 SY=560;
  `yOf h=>max(0,h)/8849*1.15` — UNCLIPPED, Everest 8849 m = 1.15 = top of scale (old
  `min(1.1,…)` cap flattened everything >≈7174 m — do not reintroduce). Terrain bands:
  cA #5B8C5A / cB #A08B62 / cC #8A8F98 / cS #F2F3F5 at 400/1800/5200 m.
  `window.__t3={hAt,yOf,stats,view,hydro}` = read-only verification hooks.
- 3D CAMERA PARAMS (v6.0 deep zoom; grep `tgt`,`fly`,`startFly`,`tMesh` — all inside `buildTerrain()`):
  orbit target `tgt` starts (0,0.25,0) = old fixed lookAt (same math while tgt=HOME); wheel
  `R=max(0.01,min(12,R·e^{deltaY·0.003}))`; near plane `max(0.002,0.02·R)` refreshed each loop;
  auto-rotate `th+=0.0012·min(1,R/2.6)`; dblclick = raycast `tMesh` → 600 ms smoothstep fly to hit
  with `tr=max(0.01,R·0.35)`; dblclick miss (sky) → HOME, R=4.4; wheel/pointerdown cancels the fly.
  Zoom floor 0.01 ≈ 10 km camera distance = honest z6 DEM limit (~2.3 km/px, mesh cell ≈5.2 km).
  `__t3.view()` = {R,near,tgt,fly}.
- 3D DAM PARAMS (v5.9 minimalist, top-250 tallest by height) — TWO gates:
  (a) built ONLY if a draped river lies within ~0.05 units of the point (gate
  `if(!dir)return;` — riverless dams are skipped, so nothing floats on plains);
  (b) wall axis lies ⟂ the nearest river tangent (coarse xz grid CELL=0.1, ±2 cells).
  Wall: J=10 segments, STEP=0.006; k=√min(1,height/260); H=0.005+0.016k; half-thickness
  hb=0.003+0.0015k; crest cap htp=0.0018+0.001k; reach smax=0.016+0.030k (each end stops
  where terrain ≥ crest−0.001 = abutment); base sink snk=min(0.004,0.35H).
  Colours: body #6E7378, crest #D8DBDE (vertex-coloured, ONE merged non-indexed
  geometry, FrontSide; winding verified triangle-by-triangle — don't reorder).
  Reservoir (illustrative): walk upstream t=0.005→0.11 step 0.010; water only if terrain
  reaches crest−0.002 (valley closes) AND Lw≥0.02; lens half-width hw=w0·√(1−(t/Lw)²),
  w0=0.005+0.008k; #2dd4bf, DoubleSide. v6.1: ONE MESH PER DAM (`resMeshes`, world-baked
  geometry, `matrixAutoUpdate=false`, pivot {px:x0,py:wy,pz:z0} = dam mouth) so the level can
  scale by month — do NOT re-merge into one geometry. `__t3.stats.walls` = RENDERED count
  (≤250 after the river gate; 0 = gate/radius broken); `stats.gates` = release gates placed
  (0 = nearest-vertex search broke). Caption carries "(illustrative, height-scaled)".
  Basins block uses LOCAL XB/ZB helpers — do not "simplify" to X/Z (TDZ crash, fixed v5.3).
- 3D HYDRO (v6.1, illustrative month-typical — NOT measured; grep `applyHydro`,`fillOf`,`relOf`,`relGates`):
  `fillOf(m)=0.28+0.72·e^(−(cd12(m,9.5)/2.3)²)` (fills Jun–Sep, peak late Sep/Oct, trough May);
  `relOf(m)=0.55+0.85·fillOf³` (release below a dam: ≈1.32 spills when full, ≈0.57 lean dry);
  rain factor `rf=(arabian+bay)/200` from months.json (clamped 0.12–1). Rivers: per-packet
  positions integrate du=(0.02+0.11·rf)·rel·dt (dt clamped 0.1 s); point size 0.02+0.028·rf,
  opacity 0.45+0.5·rf. Gates: in the dam loop, nearest draped vertex within 0.05 u → `relGates`
  {gi,t} with t as ORIENTED param (rev flips 1−t); packets carry {g,u,gates}; u>t ⇒ factor.
  Reservoirs: s=0.35+0.65·fill, matrix T(p)·S(s,1,s)·T(−p) + `matrixWorldNeedsUpdate`
  (manual matrix ⇒ matrixAutoUpdate MUST stay false); `resMat.opacity=0.45+0.42·fill`.
  `applyHydro(m)` early-outs unless the month changed; seeded after `pktPts` creation.
  `__t3.hydro()` = {m,rf,fill,rel,scale,res0,gates}; res0 = live matrix x-scale of reservoir 0.

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
- Map tiles: Esri only (v6.1) — OSM 403-blocked us 2026-10-15 (usage policy); never
  restore OSM or hammer any tile server with test reloads.
- 3D hydro: reservoir meshes need `matrixAutoUpdate=false` + manual
  `matrixWorldNeedsUpdate` (a plain `scale.set` fights the world-baked geometry — the
  level is the T·S·T⁻¹ matrix about the dam mouth); gate params must stay ORIENTED
  (rev flips t) or downstream packets end up on the wrong side of the dam; `resMeshes`
  / `relGates` are declared OUTSIDE the dams `try{}` — do not move them back inside.

## Next up (for the next session)
- Nothing blocking; site is green (v6.1, everything live-verified).
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
  wait for `#terrainCap` to include "river flow and reservoir levels follow the
  rainfall month + dam release (illustrative)." Then evaluate `__t3.yOf(8849)` → exactly `1.15`
  (clip gone); `__t3.hAt` at Everest (86.925,27.988) → ≈7400–7600 after mesh
  resampling (raw z6 summit pixel is 8121; the old pipeline rendered ≈6830 under
  a 7174 ceiling), K2 (76.51,35.88) > 6000; Mumbai/Chennai coasts < 100 m.
- 3D dams: `__t3.stats.walls` → >0 and ≤250 (the RIVER-GATED rendered count —
  record the number; 0 = gate/radius broke, 250 = gate never fired),
  `__t3.stats.reservoirs` → >0 (0 means the valley-closure gate never fired —
  inspect `LMAX`/`wy`). Walls must sit IN the terrain — small, low, concrete-grey
  with a light crest; ends vanish into hillsides; water only in closed valleys.
  If they scream orange or protrude like pins, the palette/H constants regressed;
  if they look perpendicular-matchstick, check the `w2` mapping
  (`cosA=ax, sinA=-az`) and that `draped` is still in scope before them.
- 3D deep zoom: `__t3.view()` starts {R≈4.4, near≈0.088, tgt=[0,0.25,0]}. 25 negative wheel
  deltas on `#terrain3d` → R clamps 0.01, near settles 0.002; 25 positive → clamps 12. dblclick
  canvas centre → after ~0.8 s fly=false and tgt ≠ [0,0.25,0]; dblclick a top corner (sky) →
  tgt back to [0,0.25,0], R≈4.4. Console must show 0 errors throughout.
- 3D hydro (v6.1): default month 7 → `__t3.hydro()` {m:7, fill≈0.501, rel≈0.657, gates>0};
  set `#monthSlider` 9 (dispatch `input`) → fill≈0.967, rel≈1.318, scale≈0.979, res0≈0.979
  (matrix really applied to a reservoir); month 5 → fill≈0.296, rel≈0.572, scale≈0.542,
  res0≈0.542. rf follows months.json; packets keep advancing in every month.
- Self-test in 3D: expect `2D hidden (3D on)`; toggling back to 2D auto-refreshes
  to `vectors-ok` (~350 ms).
- Commands used previously run clean: `node --check app.js`.

## Repo layout cheat-sheet
- Site: `index.html`, `styles.css`, `app.js`
- Data: `data/embedded.js` (bundle), `data/*.geo.json` (shapefile extracts —
  see `SHAPE_INTEGRATION.md`), `data/months.json`, `data/mjo.json`, etc.
- Docs: `INDIAN_WEATHER_SPEC.md` (frozen build spec, v6.1), `SHAPE_INTEGRATION.md`
  (shapefile checklist, all ticked), `CITATIONS.md` (all sources/©), `README.md`.
- NEVER commit: `pdf/` (IMD ©), `Shape files/` (1.1 GB) — both git-ignored.
