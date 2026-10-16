# HANDOFF — read this file first, nothing else

One-page state so a fresh session (or another agent) needs ~2k tokens instead of
re-reading the codebase. Do NOT read `app.js` end-to-end (~1220 lines) — grep for
the symbols named below (a lean session with targeted greps + live verify stays
well under 40k tokens; reading app.js whole adds ~75k — avoid).
Full build rules: `INDIAN_WEATHER_SPEC.md` (v7.9).
**v7.1 SHIPPED (2026-10-16):** 41 climate phenomena as pickable 2D/3D animated layers — implemented per `PHENOMENA_LAYERS_TODO.md` (its §1 design is the as-built record).
**v7.2 SHIPPED (2026-10-16):** rain is per-state — 2D streak density/speed and 3D drop seeding now follow each state's monthly average rainfall (IMD subdivision record 1901–2015 → `data/rain-state-avg.json`, mapped to GADM states — approximate; generator `data/_gen_rain_avg.mjs`).
**v7.3 SHIPPED (2026-10-16):** 3D dam hover labels — hover a major dam (top-300 recorded heights, the same ranked tier as the 2D labels) for its name, height, state and river (real CWC fields); hook `window.__t3.dams`.
**v7.4 SHIPPED (2026-10-16):** 3D crest polish + snow — spillway-pier width fixed to true scale (the v7.0 `ha` bug built ≈3,800 km slabs) and the 14 concrete/arch heroes (≥100 m) carry a soft pulsing crest glint (additive sprites, illustrative); terrain snow blends in from 4,400 m, fully white ≈5,700 m (schematic); near-plane floor fix (`max(2e-5,0.02·R)` — the old 0.002 floor sat at/above the orbit target below R≈0.1 and clipped crest-level detail); new hooks `__t3.colAt/flyTo/glint`.
**v7.5 SHIPPED (2026-10-16):** pastel 2D basemap + no fake-3D rain in the 2D map + a third view "3D map" — 2D base switched to Esri World_Terrain_Base (`maxNativeZoom:13`) under a pastel CSS grade (`saturate(.62) brightness(1) contrast(.95)` on `.leaflet-tile-pane`, chosen by in-page canvas A/B); the 2D rain-streak renderer is deleted (per-state pools remain → 3D rain; `__rainDbg()` reshaped — see the rain bullet); new `map3d.js` = MapLibre GL JS 6.14.0 + OpenFreeMap `bright` + Mapterhorn DEM terrain + OSM building extrusions, keyless (credits: MapLibre · OpenFreeMap · Mapterhorn), toggled by a third stage button via `setTerrainView`; hook `window.__map3d`.
**v7.6 SHIPPED (2026-10-17):** dam-release water simulation in the 3D map view — "Release water" at Hirakud dam runs a kinematic front down the REAL Mahanadi centre-line to the Bay of Bengal (`data/dam-route-hirakud.geo.json`, derived from the CWC "Mahanadi River" network by `data/_gen_dam_route.mjs`; 53 pts, 414.8 km, arrival ≈3.2 days at ≈1.5 m/s — illustrative); route/wet/head/end layers drape over terrain, "Day N" clock + km readout card, hook `window.__dam`; drive-by fix — the self-test line now reads `2D hidden (3D on)` in the 3D map view too. Verified headless (Edge 155 + SwiftShader WebGL2): 23/23 checks, 0 app console errors, journey 0→414.8 km over ≈25.6 s, day 3.201, wet line 53/53 coords, 2D⇄3D-map toggle round-trip ok.
**v7.7 SHIPPED (2026-10-17):** climate phenomena are now actually visible on the map + their interference with weather patterns — (a) ON layers render at BOLD family colour (region 2.2/1/.22, dot mesh r3/.95, band 2.6/1, track 2.4/.9, sea 1.8/.9 fill .13, points r4.6 w1.2, pulse r3.4, rings 1.8/.65) instead of the old faint look; (b) month not in an item's window → off-season = ~half opacity + `5 6` dash + an always-open `ID · off-season (months)` tag at the item's anchor (`.phenOff` ≈50 % now — grep `st.tag`, `phenAnchorOf`); (c) five off-map drivers draw a dashed interference arrow to their landing point with a note tooltip — data-driven `link:[lat,lng,note]` in `data/phenomena.json`: O1 ENSO→(22,79), O2 Modoki→(15,87), O3 IOD→(19.5,78), O5 PDO→(23.5,75), O7 NAO/AMO→(19.5,75); (d) Fig6 "Season" shows `#graphPhenBands` strips (one rect per window run of each ON item) and `#graphReadout` ends " · ON <ids>" (wrapper on `__graphCursor`); (e) panel rows carry a family-colour dot. Verified live July (13 saved picks on): 14 band rects (M8 = 2 runs), M3 off-season sample dash 5 6 / opacity .45 / tag "M3 · off-season (Sep–Dec)", readout ON list = the in-window subset exactly, 4 link polylines + 4 arrowheads on the 2D map, `window.__dam` present in the same page, console clean.
**v7.7.1 FIXES (2026-10-17):** gap fixes from the log review — (1) BOOT RACE (pre-existing since v7.1): `phenApply()` early-returns while `PHEN.env.map` is unset, the self-heal retries ran only at 1.2/2.6/5 s, and nothing applied the restored picks when the map bridge arrived → on a fresh load the panel read `0 / 41 on` with no layers for seconds while `#graphReadout` already listed `· ON …`. Now `__applyLayers` calls `__phen.apply()` right after it publishes `window.__phenEnv`, and the retry chain is 1.2/2.6/5/9/14 s (unconditional). (2) Fig6 season strips label each ON item ONCE (M8 has two runs → two identical `M8` labels before). (3) Log sync: SPEC ref, brand + `app.js?v=7.7.1`, a v7.7 verification recipe, the boot-race land-mine, and the corrected dim mechanism (shapes dim via INLINE opacity; `.phenOff` CSS class is dots/movers/rings ONLY — there is no double-dim). NOTE: the 5 driver arrows' landing points (22,79)/(15,87)/(19.5,78)/(23.5,75)/(19.5,75) are editorial placement — ILLUSTRATIVE; only the effect notes are sourced. VERIFIED: fresh load applies the picks at ≈0.7–0.95 s (`appliedAtMs` 716/947 — no 0/41 stall), Fig6 = 14 rects / 13 labels, and the 3D path was exercised for the first time (mountains build 6.5 s, `__phen3d.info()` → {built:true,objs:41}, toggle O7 with 3D up → on 13→14→13, self-test `2D hidden (3D on)`, 0 console errors).
**v7.8 SHIPPED (2026-10-17):** 3D-mountains navigation rebuilt so a non-technical user can move around — (a) TOUCH/trackpad gestures via a `ptrs` map: 1 finger = look around, 2 fingers = slide across, pinch = zoom (none of this existed — a phone user could not zoom at all); (b) TAP-to-fly on touch (press <600 ms, <10 px) with double-click kept for the mouse; tap the sky = home, tap a DAM = read its label instead of flying (hover and tap share `showDamTip`); (c) on-screen **− Zoom out / + Zoom in** (R ×/÷ 0.72) and a **? How to move** card (`#t3helpbox`) that opens once per session (`sessionStorage.t3help`); (d) keyboard — arrows look, `+ −` zoom, `Home` start over, `Space` auto-spin — guarded against INPUT/TEXTAREA/SELECT/BUTTON so the month slider keeps its arrows; (e) HUD buttons 13 px / 36 px tall. Pinch maths commit only when BOTH pointers have new positions (or after 120 ms): ungated per-event maths read a lopsided intermediate state and drifted the zoom ~33 % during a parallel slide, and a rAF-frame version was rejected because the render loop freezes in a backgrounded tab. `__t3.view()` now also returns `th`/`ph`; `nav()` returns `ptrs`. Verified live: pinch 4.4→2.0 and 2.75→3.78, parallel slide pans with `R` held exactly, one-finger rotate th +0.72, tap dam-free → fly, tap Jalaput dam → label "ht 61 m · river Sileru · CWC recorded" and NO fly, keyboard + zoom buttons + help toggle all fire, `2D hidden (3D on)`, 0 console errors).
**v7.9 SHIPPED (2026-10-17):** dam release now works for **ANY dam** — pick it by tapping a dot on the 3D map or typing its name, and the river course is derived **on demand**. Nothing loads until the feature is activated ("Find a dam" switch): that fetches `data/dams.geo.json` (13,002 dams → searchable list + clickable dots, ~1.3 s), then `data/dam-router-worker.js` fetches `rivers-cwc.geo.json` + `india-detailed.geo.json` in a **worker**, indexes once and answers each dam in ~6 ms; the page never blocks and routes are cached per dam. ALGORITHM (`data/_route-engine.mjs`, shared by the browser and the offline checker): bbox grid over the 30,395 river features → nearest point on the dam's river (6 km, retried at 12 km) → greedy downstream walk over the river's unordered parts (always the part whose far end is nearest the recorded `en_lon/en_lat`) → **chain** into the next river within 9 km when the walk ends inland (≤6 rivers) → coast test against the outline (≤25 km) → Douglas-Peucker 65 m → km by haversine → days = km ÷ 129.6 (illustrative). Measured: **389/400 tallest dams route at 6 km, 398/400 at 10 km, ~6 ms each**; chains work (Tehri → Bhagirathi → **Ganga 1715 km / 13.2 d**, Subansiri → **Brahmaputra 558 km / 4.3 d**, Bhavani → Cauvery 606 km). Inland ends (e.g. Luni → Banas) say "recorded river end", never "sea". Also in v7.9: **bird's-eye is the release default** (pitch 0, bearing 0 over the whole course) and the **zoom travels** with the front (fit → 0.55× fit by the sea, eased every 150 ms), both as card checkboxes; the run is wall-clock with a 120 ms timer fallback so it advances in a background tab. Verified live: nothing dam-related in the resource list before activation; activation 1.27 s / 13,002 dams; typed "hirakud" → 413.0 km / 3.19 d; "bhakra" → **BHAKRA (BBMB) 251.55 km / 1.94 d on the Satluj — identical to the Node check**; tap-a-dot → Jhiria N → Brahmani River; run sampled day 0.37→3.19, km 47→413, pitch 0 throughout, zoom 6.59→5.21, "Reached the sea in ≈3.2 days", 7 dam layers, 0 console errors.

## What this is
Static single-page study site (no build): `index.html` + `styles.css` + `app.js` +
`data/embedded.js` (bundle) + `data/*.geo.json`. Serve:
`python -m http.server 8000` → `http://127.0.0.1:8000/index.html?live=N`
(N++ every reload to beat cache; `?v=` must be bumped on EVERY asset change or a
browser can hold a stale same-version asset — if in doubt verify on a fresh origin,
e.g. `localhost` vs `127.0.0.1`). Brand in header shows version (now v7.9).

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

## Current verified state (2026-10-17, v7.9)
- Self-test line `#layerDebug`: `months=12 stations=23 states=36 rivers=109+633west
  basins=25 dams=13002 cwc=30395 mjo=8 rm=<0|1> · layers on=12/14 · phen=<N>/41 · rainavg=<N>/36 · zoom=<z> · vectors-ok`.
  `rm=1` means the system asks for reduced motion — relevant to animations.
  While 3D is on the vectors check reads `2D hidden (3D on)` (expected; both view
  toggles refresh the line at toggle-on and again ~350 ms after returning to 2D;
  v7.6 extended the check + refresh to the 3D MAP view — `map3d-on`).
- v7.1 PHENOMENA: panel "Climate phenomena · 41" sits between the chip row and
  card-foot; default all unchecked; `localStorage phen.on` restores picks; v7.7 look:
  ON = bold family colour; off-season = ~half strength + dashed + open `ID · off-season
  (months)` tag at the anchor (shapes dim by INLINE opacity `max(.4, base·.5)`;
  `styles.css` `.phenOff{opacity:.5}` covers ONLY the dot meshes / movers / rings — no
  double-dim; the old 0.12 dim is gone) as the
  month slider moves — they never hide. Debug: `window.__phen` (items/on/loaded/toggle(id,on)/apply()/
  month(m)), `__phen3d.info()` → `{built,objs:41,steps,on}`. Recipes:
  `__phen.toggle("M1",true)` → polygon + dot field appears; `__phenMonthSync(1)`
  dims M1 (window 6–9), `__phenMonthSync(7)` restores; after the 3D chip first
  builds, `__phen3d.info().built===true` (objs 41, steps climbing). BRIDGE: the
  module is OUTSIDE the app.js IIFE — the self-test line stashes
  `window.__phenEnv={map,rm,month}` (self-heal retries 1.2/2.6/5 s). Never reference
  map/RM/INDWeather/CLIM directly in appended code — they are IIFE-scoped.
- Map look (v7.5): Esri World_Terrain_Base tiles (keyless
  `server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}`,
  `maxNativeZoom:13` — the service stops at z13; attribution "Tiles © Esri — Esri, USGS, NOAA")
  graded pastel by `#osmMap .leaflet-tile-pane{filter:saturate(.62) brightness(1) contrast(.95)}`
  in styles.css — teal bathymetry + pale relief under the data overlays (the grade was picked
  by an in-page canvas A/B replaying the live tiles + filter). Replaced the v6.1 Light Gray
  Canvas + grayscale filter. Esri-only stands: tile.openstreetmap.org 403-BLOCKED the app on
  2026-10-15 (tile usage policy — heavy repeated test reloads). NEVER point the layer or a
  verification back at OSM, and keep verification reloads minimal. CARTO Positron stays
  rejected (keyless = "API KEY REQUIRED" watermarks); do not reintroduce it without a key.
- MJO: tour (`▶ MJO` on map / `▶ propagate` in Fig5 loom) auto-fits the
  equatorial corridor, advances every 1.1 s (2.6 s + snap under reduced motion),
  wraps 8→1 with snap, glides otherwise; shuttle has CSS glide transition.
- Month slider ↔ MJO: `months.json` `mjoTyp` (ILLUSTRATIVE month-typical phase;
  anchors: Ph1–3 wet S peninsula/NE monsoon Oct–Dec, Ph4–5 SW break Jul–Sep).
  `setMonth()` calls `window.__mjoMonthSync` (skipped while a tour runs).
- MJO arrow influence zone: canvas wind arrows within ±30° lon of the pulse and
  |lat|<14 recolour violet (Ph1–3 enhanced) / muted grey (Ph4–5); the three
  pulse-feed burst arrows match; legend in the Fig-0 caption.
- Zoom hierarchy (Google-Maps style): rivers rivMaj/rivMed(≥5)/rivMin(≥7) + rivWest
  (CWC west-flowing subset, ≥5); dams dg0(top40)/dg1(<400)/dg2(all, ≥8) + labels ≥7;
  CWC network ≥6 bg-load; water (reservoirs/glacial/TN) lazy on chip only.
- 2D RAIN POOLS (v6.2 pool / v7.2 per-state averages, illustrative; v7.5: streak RENDERER
  deleted — no falling lines in the 2D map; the streak spawn/lean/speed block, `stepRain`,
  `nowS` and its call in `stepWind` are gone; the `(arabian+bay)` rf factor stays for the
  3D weather field only). The teal "raining now" tint over the month's `rainStates` (IMD
  month-typical teal list) is unchanged; the pool part builds/reseeds in ONE `__rainStates(d)`
  pass: sampled inside each state polygon
  (area-weighted ring pick + even-odd test) and cached WITH per-state weights in
  `window.__rainPoolCache[m]={byState:{state:{pts,w}},max}`. `w` = that state's mean rainfall
  for the month, mm, from `data/rain-state-avg.json` (IMD subdivision record 1901–2015, mapped
  to states — approximate; fetched once at map init into `window.__rainAvg`; pools are NOT
  cached until the averages exist, so weights never go stale — equal-weight fallback before);
  the pools feed the 3D relief rain only.
  `__rainDbg()` = {m,states,avg,w:{state→mm}} (v7.5 shape — `.rain`/`.k` GONE);
  `window.__rainSample()` draws a point from
  the CURRENT month's pool ∝ w → [lat,lng,weight] (3D uses this; null → uniform fallback).
  State popups now read "Avg <MON> rain ≈ N mm (IMD 1901–2015 subdivision mean, mapped to
  state — approximate)".
- 3D MAP VIEW (v7.5, new `map3d.js` — ESM, loaded ONLY on first activation): a third stage
  view "3D map" (buttons 2D ⇄ 3D mountains ⇄ 3D map, mutually exclusive via `setTerrainView`)
  = MapLibre GL JS 6.14.0 (BSD-3; dynamic `import` from unpkg, worker same-origin) +
  OpenFreeMap `bright` style/planet tiles + Mapterhorn terrarium DEM (`terrain`, exaggeration
  1 = true scale) + `deck-3d-buildings` fill-extrusion from the OMT `building` source-layer
  (minzoom 13.5, `render_height`, inserted before the first symbol layer). Sky =
  `map.setSky({...})` (root property). Activation resolves on `style.load` + 20 s timeout —
  NEVER `"load"` (see land-mines); `map.resize()` runs right after resolve. Credits:
  "MapLibre GL JS · OpenFreeMap tiles · Mapterhorn DEM" (© OpenMapTiles / © OpenStreetMap
  contributors / © Mapterhorn) — keyless. Hook `window.__map3d` =
  {setActive(on)→Promise<map|null>, map(), ready(), style(), layers(): ["id:type"],
  terrain()}. `__t3` (mountains) untouched.
- 3D DAM RELEASE (v7.6, illustrative travel — NOT measured, no inundation; grep `damStart`,`damTick`,`damSet`):
  in the 3D map view `#damUI` (card + "Release water") runs a kinematic front from the Hirakud dam
  along the REAL Mahanadi centre-line to the sea. Route = `data/dam-route-hirakud.geo.json` (53 pts,
  414.8 km; provenance in properties; built once by `node data/_gen_dam_route.mjs` — greedy
  downstream walk of the CWC "Mahanadi River" MultiLineString from the `Hirakud Dam` point in
  dams.geo.json, then Douglas-Peucker ≈65 m; Natural Earth has NO Mahanadi feature — the CWC file
  is the source). Model: ONE constant wave speed ≈1.5 m/s ("illustrative" in every readout) →
  arrival = 414.8/129.6 ≈ 3.2 days; the journey plays in `DAM_SECONDS=24` real seconds, driven by
  wall clock (`performance.now()`), so a slow/hidden tab jumps forward instead of stalling. Layers
  (GeoJSON sources setData'd per tick, drape over terrain): `dam-route-line` (teal dashed full
  course), `dam-wet-line` (sliced at the front), `dam-head-halo`/`-dot` (front point), `dam-end-dam`
  (amber)/`dam-end-sea` (blue). fitBounds left padding 290 px for the card (instant under reduced
  motion). Hook `window.__dam` = {start(),reset(),state(),route()}; state() = {running,day,km,
  totalKm,arrivalDays,reached}. The route fetch is try/caught — a missing route file never breaks the
  3D map. Verified headless (Edge 155 + SwiftShader, fresh load): route {n:53,totalKm:414.8,
  speedKmDay:129.6,arrivalDays:3.2}; timeline 0→58.6→…→414.8 km over ≈25.6 s wall; `#damStat`
  ="Reached the sea in ≈3.2 days (illustrative)", `#damDay`="Day 3.2"; reset() → {running:false,
  km:0,reached:false}; wet 53/53 coords, `dam-head` [86.71,20.3] ≈ sea end; camera zoom 7.29; 0 app errors.
- 3D WEATHER (v7.0, illustrative): rain = LineSegments `wxRGeo` N=36+330·rf falling to
  `wxFloor` (= terrain + MZ(90)); wind = LineSegments `wxWGeo` N=22+115·min(1.25,|vecFor(md)|)
  along `wxVec=(x:vx,z:vy)`; counts + vector set inside `applyHydro` (the month funnel),
  positions integrated by `stepWx(dtS)` in the loop; extras hidden via `setDrawRange`.
  v7.0: ALL wx distances/sizes are divided by `REL` (screen-relative — exaggeration chips
  must not stretch weather). `__t3.wx()` = {m,rf,rain,wind,vx,vz,pkt,west}. v7.2: raindrops
  SEED from the same per-state pool — `wxResetR` calls `window.__rainSample()` and maps
  lat/lng → X/Z via the wxInvLon/wxInvLat inverse (clamped ±0.49·W/D; uniform fallback when
  the pool is absent), storing `w` per drop; fall speed scales `×(0.7+0.6·w)`; `applyHydro`
  reseeds ALL drops on every month change (`wxRDrop.fill(null)`) so positions + weights follow
  the season.
- 3D WEST RIVERS (v6.2): `neCount=draped.length` is captured right after the Natural Earth
  drape and the CWC subset is appended AFTER it. Land-mine: packet seeding used one 200-cap
  fed in `draped` order — appended west lines would have been starved to ZERO packets; it now
  keeps two budgets (NE 200 / west 150). Never reorder `draped` before packets are seeded.
  `__t3.stats.west` counts draped LINE PARTS (file = 633 features = 376 LineString + 257
  MultiLineString = 1268 parts; verified).
- 3D TERRAIN PARAMS (all inside `buildTerrain()`; grep the names — do not re-read the file):
  `TB={lon0:66,lon1:98,lat0:5,lat1:38,z:6}` (Terrarium DEM, 7×8=56 tiles ≈2–4 MB); blur =
  single-pass 3-tap ±1 px; mesh W=3.4 D=2.55 SX=768 SY=672 (~1.03 M tris). v7.0 TRUE SCALE:
  `UPM=1e-6` (metres→world units; 1 unit ≈ 950 km), `yOf=h=>Math.max(0,h)*UPM` — Everest
  8849 m = 0.008849 u; `MZ=m=>m*UPM`. ALL 3D content is parented to `relG` (`relG.scale.y=REL`);
  `REL=1` default = honest scale; relief chips cycle `RELS=[1,5,20,100]` (vertical exaggeration
  ONLY — the old `/8849*1.15` units are DEAD: an old recipe value ×0.007695 → new). `hAt` is
  bilinear (4-corner). Terrain bands: cA #5B8C5A / cB #A08B62 / cC #8A8F98 / cS #F2F3F5 at
  400/1800/5200 m, plus v7.4 snow — `terrCol(h,c)` blends toward #F2F3F5 with
  `t=min(1,(h−1800)/3400·0.3+max(0,h−4400)/2000)` (faint from 4,400 m, full ≈5,700 m,
  schematic; `__t3.colAt(h)` reads it). `t3Stats.phases` = per-phase build ms (mesh ≈1.3 s
  warm-cache, damLoop ≈1.2 s, tail ≈0.9 s; whole ≈4.3 s on a VISIBLE focused tab — hidden
  tabs inflate timer measurements). Read-only hooks:
  `window.__t3={hAt,yOf,stats,view,hydro,wx,nav,setRel,setSpin,dams,colAt,flyTo,glint}`.
- 3D CAMERA PARAMS (v7.0; grep `tgt`,`fly`,`startFly`,`setRel`,`setSpin`,`panDrag` — inside `buildTerrain()`):
  orbit target `tgt` starts (0,0.0019,0) ≈1.9 km; wheel `R=max(0.01,min(12,R·e^{deltaY·0.003}))`;
  near plane `max(2e-5,0.02·R)` refreshed each loop (v7.4 floor fix — see land-mines); **auto-spin OFF by default** (`spin=false`,
  HUD `#t3spin` = "⟳ spin: off/on"; spin condition `if(spin&&!drag&&!RM&&!fly)`); PAN = middle/right
  button or shift+left drag (`panDrag`, `kp=0.0018·R` px→world; contextmenu prevented); dblclick =
  raycast `tMesh` → 600 ms smoothstep fly to hit, `tr=max(0.01,R·0.35)`; dblclick miss (sky) → HOME,
  R=4.4; wheel/pointerdown cancels the fly. HUD lives inside `#terrainWrap`: `#t3rel` cycles RELS
  (label "×1 relief · true" / "×N relief"), `#t3home` = fly home; `setRel(r)` scales
  `relG.scale.y` AND `tgt.y`/`HOME.y` by `k=r/REL`. Zoom floor 0.01 ≈ 10 km = honest z6 DEM limit
  (~2.3 km/px, mesh cell ≈5.2 km). `__t3.view()`={R,near,tgt,fly}; `__t3.nav()`={spin,rel,relScale,pan};
  `__t3.setRel(r)`, `__t3.setSpin(b)`.
  v7.8 GESTURES (grep `ptrs`/`applyPinch`): one pointer = orbit (`th+=dx·0.008`, `ph` clamped 0.25–1.25); a second
  pointer turns the gesture into slide+pinch — `panBy(dx,dy)` (same `kp=0.0018·R`) plus `R×(prevDist/curDist)`,
  committed only when every pointer has `seen:true` or 120 ms passed (`applyPinch`, baseline seeded when the
  SECOND pointer lands). Tap = `pointerdown`→`pointerup` under 600 ms/10 px with `pointerType!=="mouse"` →
  `flyToPt` (raycast `tMesh` → `startFly(hit.point,max(0.01,R·0.35))`, sky → `startFly(HOME,4.4)`), unless the
  pixel picks a dam (`pickDam`) in which case `showDamTip(fx,fy)` prints the CWC label and no fly happens.
  `showDamTip(mx,my)` is shared by the hover handler and the tap path — touch users read dams through it.
  Keys (guarded, window): ←/→ `th∓0.14`, ↑/↓ `ph±0.07`, `+`/`=` `R×0.8`, `-`/`_` `R×1.25`, `Home`/`0` home,
  `Space` spin. `clampR` = 0.01…12 everywhere.
- 3D DAM PARAMS (v7.0 anatomy — ALL 13,002 in-bbox CWC dams/barrages/weirs; the v5.9 top-250
  slice + river gate are GONE). Class from name/type (`CHERUTHONI`→conc, `IDUKKI`→arch,
  CFRD/ROCKFILL/EARTHEN/EARTHFILL/ZONED/HOMOGENEOUS/PG/GRAVITY/MASONRY patterns, fallback
  `h>=80?conc:earth`); the 6,669 rows without a height use class medians
  `H_MED={earth:16.5,rock:19.5,cfrd:31.7,conc:90,arch:168.9}` (ILLUSTRATIVE — caption says
  "CWC heights where the file has one, class medians elsewhere — illustrative").
  Sections (upstream/downstream H:V): earth 2.5/2.0, rock 1.5/1.5, cfrd 1.4/1.4 (+upstream slab),
  conc+arch 0.08/0.75 with stepped downstream (step at 45 % height, 0.45·sd·hL); crest half-width
  3 u concrete / 4 u earth; arch bow `0.18·span·(1−(2t−1)²)` upstream. Wall axis: river tangent
  `nearRiver(x,z,bd)` (≤4 km) else DEM gradient; upstream flip via ±1.5 km probe; reach
  `STEP=0.0006 SMAX=0.03 TOL=1e-6`; `J=max(3,min(8,round(span/0.004)+2))`. Lakes: freeboard
  `fb=min(15,max(1.5,0.12·hm))·UPM`; closure walk `t=0.0016→0.025` step 0.0016, width fit
  `hw 0.0006→0.012` step 0.0006, need `Lw≥0.003`; top-240 by Lw = animated meshes (`resMeshes`,
  world-baked, pivot at dam mouth, `matrixAutoUpdate=false`, carry `hm`), the rest merge into ONE
  static batch (static lakes do NOT draw down). 6 merged section batches
  `MB={eu,ed,ru,rd,cm,cr}` (earth 0x6f6a60/0x6f8058, rock 0x63686d/0x7a8086, conc 0x999fa5,
  crest 0xd9dcdf); hero piers for conc/arch hm≥100 (=14; width/obox fixed v7.4 — see crest-detail bullet). Gates: `nearRiver(x0,z0,0.0025)`
  (≤0.05 u) stored as ORIENTED param t (rev flips 1−t). `stats` (build-time, month-independent):
  walls=13002, reservoirs≈1813, gates≈10630, animLakes=240, heroes=14, tris≈650926 (dam+lake).
  Basins block uses LOCAL XB/ZB helpers — do not "simplify" to X/Z (TDZ crash, fixed v5.3).
- 3D DAM HOVER (v7.3): `damHover` (declared with `resMeshes`/`relGates`, filled in the dam
  loop) holds the top-300 recorded-height dams — the SAME ranked tier as the 2D labels
  (`hovSet` = in-bbox ∩ height>0, sort desc, slice 300; land-mine: `hovSet` must be built
  from `dl` BEFORE `dl.forEach`, and the push sits right after `x0/z0/gy` because `HU` is
  already defined there). Anchor = wall crest `gy+HU`. Hover: `cv3` pointermove guarded by
  `terrainOn` && !`drag` → `pickDam()` projects all 300 like `tag()` does (y×REL,
  `cv3.clientWidth`, 420 px, z>1 culled), nearest within 18 px wins; `#damTip` (appended to
  `#terrainWrap`, z-index 7 above the HUD's 6; CSS mirrors the canvas labels) shows
  "<name> · ht N m" / "state · river R · CWC recorded" (real fields); hides on miss /
  pointerleave / pointerdown. Hook `__t3.dams` = {n(), pick(x,y), at(i), tip()} — `dams.n` is a FUNCTION (call it; the glint sibling `glint.n` is a NUMBER — they burned us once).
- 3D CREST DETAIL + SNOW (v7.4): spillway piers on the 14 conc/arch heroes (hm≥100) had a v7.0
  units bug — `ha` missed its `*UPM` (`Math.max(4,…)` raw → ≈3,800 km slabs); now
  `ha=Math.max(4*UPM,Math.min(24*UPM,span*0.012))` (≈46 m-wide nubs) and the pier `obox` is
  axis-aligned to the dam axis f, g=(−fz,fx). Crest glint: 14 scene-level additive sprites on
  ONE shared SpriteMaterial (64 px radial-gradient canvas), `s=clamp(span*0.3,2.5e-4,8e-4)`,
  anchored `(x0,crest+MZ(3),z0)`, y re-applied every frame `×REL` (scene-level precisely so the
  `relG.scale.y` chips cannot deform the billboards); `glintMat.opacity=RM?0.18:0.18+0.08·sin(tw·1.6)`
  (0.10–0.26, period ≈3.9 s) — illustrative. Snow: `terrCol(h,c)` `t=min(1,(h−1800)/3400·0.3+
  max(0,h−4400)/2000)` — faint from 4,400 m, fully white ≈5,700 m (schematic). Hooks: `__t3.colAt(h)`,
  `__t3.flyTo(lo,la,r)` (r default 0.004), `__t3.glint` = {n NUMBER, o(), at(i)→{x,y,z,s,py},
  sp(i)→live sprite, mat()→live material}. Verified live at r=0.002 top-down: glint renders +
  pulses — A/B/A captures 252,565 / 239,873 / 235,464 bytes at opacity ≈0.26 / 0.19 / 0.10 —
  piers visible, no slab, near=4e-5.
- 3D HYDRO (v6.1, illustrative month-typical — NOT measured; grep `applyHydro`,`fillOf`,`relOf`,`relGates`):
  `fillOf(m)=0.28+0.72·e^(−(cd12(m,9.5)/2.3)²)` (fills Jun–Sep, peak late Sep/Oct, trough May);
  `relOf(m)=0.55+0.85·fillOf³` (release below a dam: ≈1.32 spills when full, ≈0.57 lean dry);
  rain factor `rf=(arabian+bay)/200` from months.json (clamped 0.12–1). Rivers: per-packet
  positions integrate du=(0.02+0.11·rf)·rel·dt (dt clamped 0.1 s); v7.0: point size is set per
  FRAME in the render loop, screen-relative — `max(0.0008,(0.0052+0.0072·rf)·R)`. Gates: in the
  dam loop, nearest draped vertex within 0.05 u (bd=0.0025) → `relGates` {gi,t} with t as ORIENTED
  param (rev flips 1−t); packets carry {g,u,gates}; v7.0 uses ONE progression factor per packet
  (`if(gN)k=rel` — any upstream gate fires ⇒ downstream flow ≡ rel). Reservoirs: s=0.35+0.65·fill
  minus v7.0 DRAWDOWN — matrix `T(px,py−dr,pz)·S(s,1,s)·T(−px,−py,−pz)` with `dr=hm·0.22·(1−fill)·UPM`
  (the 240 animated lakes only) + `matrixWorldNeedsUpdate` (manual matrix ⇒ matrixAutoUpdate MUST
  stay false); `resMat.opacity=0.45+0.42·fill`.
  `applyHydro(m)` early-outs unless the month changed; seeded after `pktPts` creation.
  `__t3.hydro()` = {m,rf,fill,rel,scale,res0,gates}; res0 = live matrix x-scale of reservoir 0.

## Known land-mines (already fixed once — do not reintroduce)
- `.stage svg` CSS collapsed Leaflet vectors → keep `#osmMap svg` id-scoped rule.
- Tile re-tint filter must stay scoped to `.leaflet-tile-pane` — on `#osmMap` or
  `.stage` it would re-tint the overlay SVG + markers too.
- 2D tiles: `maxNativeZoom:13` on World_Terrain_Base is load-bearing — the service
  stops at z13; without it the map blanks past z13 (tile 404s).
- MapLibre v6 sky: `map.setSky({...})` — a `type:"sky"` LAYER THROWS ("expected one of
  [fill, line, symbol, …]"); keep it a root property.
- `map3d.js` activation must await `style.load`, not `"load"`: backgrounded/hidden tabs
  never paint a frame, so `"load"` never fires and the button sticks at "3D map…" until
  the tab is visible. Render checks in hidden tabs need a forced
  `map._render(performance.now())` before `getCanvas().toDataURL()` (the draw buffer is
  cleared by compositing; `queryRenderedFeatures` counts are frame-dependent too).
- `__rainDbg()` v7.5 shape is {m,states,avg,w} — anything reading `.rain`/`.k` breaks
  (the old shape is described only in history entries above).
- `window.__mjo*` layer refs must be published AFTER creation (TDZ crash v3.7).
- Wind loop global `mjoG` scope bug + 4 s watchdog (`stepWind._t`) — leave intact.
- 3D terrain: `draped` scope; basins X/Z TDZ (use XB/ZB); the dams block reads
  `draped` (river polylines) for wall orientation + pool side — keep it AFTER the
  rivers block inside `buildTerrain()`.
- Elevation scale v7.0: `yOf=Math.max(0,h)*UPM` (UPM=1e-6) must stay UNCLIPPED — true metre
  scale; never reintroduce the old `/8849*1.15` units (the old 1.15 recipe value now reads
  0.008849). Vertical exaggeration lives ONLY in the `relG.scale.y` chips (×1 true default,
  ×5/×20/×100). `relG` is created right after `scene` — EVERY 3D object must be added to
  `relG`, never directly to `scene` (else it escapes the chips). If tiles 404, check
  `TB.z`/tileURL, not the formula.
- Map tiles: Esri only (v6.1) — OSM 403-blocked us 2026-10-15 (usage policy); never
  restore OSM or hammer any tile server with test reloads.
- 3D hydro: reservoir meshes need `matrixAutoUpdate=false` + manual `matrixWorldNeedsUpdate`
  (the drawdown+level matrix is T(px,py−dr,pz)·S(s,1,s)·T(−px,−py,−pz) about the dam mouth);
  gate params must stay ORIENTED (rev flips t) or downstream packets end up on the wrong side;
  `resMeshes`/`relGates` are declared OUTSIDE the dams `try{}` — do not move them back inside.
- v7.0 exaggeration coupling: weather streaks, rain fall distances, packet/marker/city sizes are
  screen-relative — when touching any 3D size constant, divide by `REL` (`/REL`) or exaggeration
  chips will visually stretch/detach the animation. `relG` holds the terrain, dams, lakes,
  rivers, markers, weather — scene-level objects are only backdrop (sea, stars, lights).
- v7.4 near-plane floor: keep `cam.near=Math.max(2e-5,0.02·R)` — the v6.0 floor 0.002 exceeded R
  below R≈0.1, so the near plane sat at/above the orbit target and silently clipped everything
  raised toward the camera (crest, piers, glints); a sprite fully behind the near plane vanishes
  regardless of scale, and numbers can't see it — a screenshot A/B caught it (frames stayed
  byte-identical even after forcing a 19 km-wide sprite). Never let the floor approach R.
- v7.4 glint sprites are a sanctioned SCENE-level exception (sprites only — `relG.scale.y=REL`
  would vertically deform the billboards); their y is instead re-applied each loop as
  `(crest+MZ(3))·REL`. Keep both halves of that pair.
- v7.7.1 phenomena BOOT RACE: `phenApply()` is a no-op until BOTH `PHEN.env.map` (bridged
  through `window.__phenEnv`, published by `__applyLayers`) and `PHEN.g2` exist — never
  assume phenApply has run at boot. It now re-applies right after the bridge publish, and
  the retry chain (1.2/2.6/5/9/14 s) is unconditional. Symptom when broken: `#phenCount`
  reads `0 / 41 on` with no phenomena layers on the map while `#graphReadout` already
  lists `· ON …` — poll the count on a fresh load instead of trusting a single read.
- v7.8 two-finger maths must COMMIT only when both pointers moved (or 120 ms passed). Ungated per-event maths
  applies the distance of a lopsided intermediate state (one finger moved, the other not yet) and drifts the
  zoom ~33 % during a parallel slide; do not "simplify" the `seen` gate away. Do NOT move the pinch maths into
  the rAF loop either — `loop()` early-returns while `document.hidden`, so gestures would die in a backgrounded
  tab (verified: a frame-batched build did nothing there).
- v7.8 build order: `window.__t3.dams` is assigned AFTER `window.__t3={…view…}`, so wait for
  `__t3.dams.at(0)` in probes — `__t3.view` existing does not mean the dam picker does.
- v7.9 two host quirks the dam code had to absorb: (1) the rAF timestamp is NOT on `performance.now()`'s
  clock in every host — taking it verbatim made runs finish instantly with NaN day/km; `damTick` now uses
  `performance.now()` only, with a 120 ms `setInterval` fallback because rAF freezes in background tabs;
  (2) `map.addSource` throws while the style is still loading, so `damStart` retries `addDamLayers()` for
  up to 6 s instead of failing on the first call.
- v7.2 rain weights: `applyHydro` also reseeds 3D drops (`wxRDrop.fill(null)`) — applyHydro is
  defined before `wxRDrop` exists but is only CALLED after the wx block (first call = the seed
  line right after it); never call applyHydro earlier or the reseed hits a TDZ. `__rainSample`
  reads `INDWeather.month` and pools exist only for months the 2D layer has visited (null →
  uniform fallback — never crash). Do NOT cache a month's rain pool before `window.__rainAvg`
  loads — pooled weights would freeze at 1.
- v7.6 self-test: the `svgOk` check in `__applyLayers` must treat BOTH `.terrain-on` and
  `.map3d-on` as "2D hidden (3D on)" — any later call while the 3D MAP is up (the 14.6 MB
  CWC fetch lands seconds after boot, chip clicks, …) otherwise measures the hidden 2D
  overlay SVG and prints `VECTORS-BROKEN`. The 3D-map toggle also refreshes the line at
  toggle-on (mirrors the mountains toggle).

## Next up (for the next session)
- v7.7 shipped (phenomena visibility + interference — bold ON, off-season tags + dashes,
  driver interference arrows, Fig6 season bands, ON readout; state bullet above; committed locally).
- v7.8 shipped (3D-mountains navigation for non-technical users — 1-finger look, 2-finger slide, pinch
  zoom, tap-to-fly, on-screen zoom buttons + help card, keyboard; state bullet above; committed locally).
- v7.9 shipped (dam release for ANY dam — tap a dot or type a name, course derived on demand in a worker,
  bird's-eye default + travelling zoom; state bullet above; committed locally).
- v7.7.1 shipped (phenomena boot-race fix + Fig6 label dedupe + log sync; `app.js?v=7.7.1`;
  committed locally).
- v7.6 shipped (dam-release water simulation in the 3D map view + self-test-line fix; state
  bullet above; committed locally — GitHub push hangs on this machine, do not retry).
- v7.6 dam-release v2 ideas (not designed): month-coupled wave speed (reuse the hydro funnel
  `fillOf`/`relOf` instead of one constant 1.5 m/s), a wide wave front instead of a line,
  distance-to-go markers (Cuttack/Paradip), a second hero route (e.g. Ganga), optional CWC
  release-rate input.
- USER ACTION pending: restart OpenCode so the global claude-mem plugin loads in every
  project at startup (core features already live).
- Otherwise pick from the standing optional items below.

## Open items (not bugs)
- Verification runs leave picks in `localStorage phen.on` on this dev browser (13 on as of
  v7.7) — uncheck all / clear the key before handing the deck over.
- 6 rivers had no centerlines in older sources (Kosi, Sabarmati, Luni, Damodar,
  Subarnarekha, Vaigai); v6.2 gave Sabarmati a real centerline (west subset), the other
  five keep origin dots only — honest gap, documented.
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
  wait for `#terrainCap` to include "true scale at ×1" and "Every CWC dam is a modelled
  cross-section". Then evaluate `__t3.yOf(8849)` → exactly `0.008849` (v7.0 true scale);
  `__t3.hAt` at Everest (86.925,27.988) → ≈7400–7800 after mesh resampling (v7.0 measured
  7502; raw z6 summit pixel is 8121), K2 (76.51,35.88) > 6000; Mumbai/Chennai coasts < 100 m.
- 3D dams (v7.0 all-dam anatomy): `__t3.stats.walls` → EXACTLY 13002 (the river gate is gone —
  every in-bbox dam is modelled; only lakes keep a valley gate). Walls must sit IN the terrain —
  small, dark earth/concrete tones with light crests; ends vanish into hillsides; water in
  closed valleys only. If they scream orange or protrude like pins, the palette/H constants
  regressed; if they look perpendicular-matchstick, check the `w2` mapping (`cosA=ax, sinA=-az`)
  and that `draped` is still in scope before them.
- 3D dam hover (v7.3): `__t3.dams.n()` → 300. `__t3.dams.at(0)` → {n,h,px,py,z} (canvas
  coords); dispatch `new PointerEvent("pointermove",{clientX:rect.left+px,clientY:rect.top+py})`
  on `#terrain3d` → `__t3.dams.tip()` returns the name + "ht N m" and `#damTip` display=block at
  pointer +14/+10; the same coords through `pick(px,py)` return the SAME dam as `at(i)`. Corner
  dispatch / `pointerleave` → tip() null. (textContent glues `<br>` lines — "mAP" is height +
  state "AP", not a bug.)
- 3D deep zoom: `__t3.view()` starts {R≈4.4, near≈0.1, tgt=[0,0.0019,0]}. 25 negative wheel
  deltas on `#terrain3d` → R clamps 0.01, near settles 0.002; 25 positive → clamps 12. dblclick
  canvas centre → after ~0.8 s fly=false and tgt ≠ [0,0.0019,0]; dblclick a top corner (sky) →
  tgt back to [0,0.0019,0], R≈4.4. Console must show 0 errors throughout.
- 3D hydro: default month 7 → `__t3.hydro()` {m:7, fill≈0.501, rel≈0.657, gates≈10630};
  set `#monthSlider` 9 (dispatch `input`) → fill≈0.967, rel≈1.318, scale≈0.979, res0≈0.979
  (matrix really applied to a reservoir); month 5 → fill≈0.296, rel≈0.572, scale≈0.542,
  res0≈0.542; month 1 (seeded build) → fill≈0.351, rel≈0.587, scale/res0≈0.578. rf follows
  months.json; packets keep advancing in every month. v7.0: identical funnel — the only
  additions are the drawdown term (animated lakes DROP by dr=h·0.22·(1−fill)) and a single
  release factor per gated packet. Merged static lakes never move (position-only).
- v6.2 west rivers: fresh load → `__t3.stats.west` = 1268 line parts (of the 633 features) and
  `__t3.wx().west` must equal it; self-test reads `rivers=109+633west`; at z5 the overlay pane
  shows ~880 paths (≈633 west + 109 NE + 36 states + markers) — the Konkan/Goa/Karnataka/Kerala
  coast now carries rivers (rivWest, 2D only).
- v7.2 per-state rain: `__rainDbg()` month 7 → {m:7, rain≈325, states:30, avg:true,
  w:{Kerala:701, Goa:1073, Meghalaya:495, Rajasthan:153, ...}}; slider 11 → {rain≈193, states:7,
  w:{TamilNadu:177, Puducherry:177, AndamanandNicobar:234, Kerala:164, ...}}. `__rainSample()`
  ×300 in Nov → lats 7–19 (peninsula + Andaman only); Jul samples span lats 7–35. State popup
  (reach layers via `__phenEnv.map`) reads "Avg JUL rain ≈ 701 mm". 3D on: `__t3.wx()` month 7
  → {rain:350, wind:166, vx:1.45, vz:-0.84}; slider 11 → {m:11, rain:193, rf:0.475, vx:-0.5,
  vz:0.36}. Values are ballpark — the month-to-month FLIP in density/direction is what must
  hold; console stays clean. GOTCHA: the 3D loop is rAF-driven — a BACKGROUNDED tab freezes it
  (`wx()` then keeps reporting the old month); focus the tab before asserting.
- v7.0 true scale + navigation: fresh load → `__t3.yOf(8849)` exactly `0.008849`;
  `__t3.nav()` → {spin:false, rel:1, relScale:1, pan:false} (auto-spin OFF by default);
  `__t3.setRel(5)` → relScale 5, `__t3.view().tgt[1]` goes 0.0019→0.0095 (×5), `#t3rel` reads
  "×5 relief"; setRel(1) → back to true ("×1 relief · true"); `#t3rel` click cycles
  1→5→20→100→1. `__t3.setSpin(true)` → `#t3spin` reads "⟳ spin: on". PAN: dispatch `pointerdown`
  (shiftKey true, or button 2) on `#terrain3d` → `nav().pan` true → `pointermove` ±60 px →
  `tgt` shifts (kp=0.0018·R) → `pointerup` clears; a plain left-drag must rotate WITHOUT
  moving `tgt`.
- v7.0 build phases: `t3Stats.phases` → mesh ≈4.1 s, damLoop ≈1.0 s, damBuild ≈0.2 s,
  tail ≈0.8 s (whole build ≈6.5 s). NOTE: hidden/background tabs inflate timer-based numbers
  (we once measured a bogus 48 s in a hidden tab) — always measure on a FOCUSED tab.
- Self-test in 3D: expect `2D hidden (3D on)`; toggling back to 2D auto-refreshes
  to `vectors-ok` (~350 ms).
- v7.6 dam release (measured headless Edge 155 + SwiftShader; 23/23 checks): fresh load → `3D map`
  → wait `__map3d.ready()` → `__dam.route()` = {n:53,totalKm:414.8,speedKmDay:129.6,arrivalDays:3.2}
  → `__dam.start()` → `__dam.state()` climbs (measured 0→58.6→…→414.8 km over ≈25.6 s wall;
  24 s nominal — headless frame granularity) → reached:true, day:3.201 → `#damStat` = "Reached the
  sea in ≈3.2 days (illustrative)", `#damDay` = "Day 3.2", `#damBtn` = "⟲ Release again" →
  `__dam.reset()` → {running:false,km:0,reached:false} + stat back to "wave ≈1.5 m/s…≈3.2 days".
  Source-data probe: `getSource(id).serialize().data` (v6 `._data` misbehaved in the probe); wet
  line ends 53/53 coords, `dam-head` at [86.71,20.3]. Self-test must read `2D hidden (3D on)`
  while the 3D map is up — ALSO after the 14.6 MB CWC fetch lands; the 2D⇄3D-map toggle round-trip
  restores `vectors-ok` (~350 ms).
- v7.8 3D navigation (drive it with synthesised PointerEvents on `#terrain3d`, `pointerType:'touch'`; wait for
  `__t3.dams`, not just `__t3.view`): two pointers ±50 px spread to ±110 → `__t3.view().R` shrinks (4.4→2.0);
  two pointers at ±80 moved by the SAME vector → `tgt` moves and `R` is unchanged (<0.001 — the commit gate;
  ungated maths drifted ~33 %); one pointer ±90 px → `th` +0.72; tap a dam-free pixel → `view().fly===true`;
  tap `__t3.dams.at(0)`'s pixel → fly stays false AND `dams.tip()` returns "… · ht N m · river R · CWC recorded";
  keys `ArrowRight` (th +0.14), `+` (R ×0.8), `Home` (fly), `Space` (spin); `#t3zin`/`#t3zout` → ×0.72 / ÷0.72;
  `#t3help` toggles `.open` on `#t3helpbox`.
- v7.9 any-dam release (fresh load → 3D map): `performance.getEntriesByType("resource")` must show NO
  `dams.geo.json` / `rivers-cwc.geo.json` / `dam-router-worker.js` before activation. `__dam.mode(true)` →
  `__dam.damCount()` = 13002 and `dam-pts` layer appears. `__dam.search("hirakud")` → 2 hits; click →
  `__dam.route()` = {totalKm:≈413, arrivalDays:≈3.19, coastal:true, chains:["Mahanadi River"]};
  `__dam.search("bhakra")` → BHAKRA (BBMB) 251.55 km / 1.94 d on the Satluj (must match
  `node data/_route_engine_check.mjs` exactly — browser and Node share the engine). `__dam.start()` →
  sample every ~3 s: `day` and `km` climb linearly to 413 / 3.19, `pitch` stays 0, `zoom` falls from
  ≈6.6 to ≈5.2, `reached` true, `#damStat` = "Reached the sea in ≈3.2 days (illustrative)", `#damDay`
  = "Day 3.2", layers `dam-route-line / dam-wet-line / dam-head-* / dam-end-*` present, 0 console errors.
  Tap-a-dot: `map.queryRenderedFeatures([x,y],{layers:["dam-pts"]})` then a canvas click selects it.

- v7.7 phenomena visibility (2D + Fig6 + boot): with saved picks on, a FRESH load must
  reach `#phenCount` = `13 / 41 on` (or `N / 41 on`) within ~2 s of the map bridge — poll
  it; if it still reads `0 / …` the v7.7.1 boot race is back. Then `#graphPhenBands rect`
  = one per ON item's season run (13 picks → 14 rects, M8 has 2 runs) and
  `#graphPhenBands text` = exactly ONE label per ON item (13 for 13); `path.phenLink` +
  `.phenArrow` = one per ON linked driver (O1/O2/O3/O5 = 4 while O7 is off); at July an ON
  off-season item (e.g. M3, window 9–12) → `paths[0].options.opacity` ≈ .45, `dashArray`
  `5 6`, tag open reading `M3 · off-season (Sep–Dec)`; the `#graphReadout` tail `· ON …`
  lists ONLY in-window items (the 3 off-season ones excluded); `#phenList .pdot` = 41 with
  computed width 9px (proves styles.css loaded). 3D side: activate `#btn3d`, wait
  `__phen3d.info().built`, toggle a phenomenon → `info().on` follows + console clean (the
  3D dim VALUE is not exposed by the public hook — assert behaviour, not pixels).
- Commands used previously run clean: `node --check app.js`.

## Repo layout cheat-sheet
- Site: `index.html`, `styles.css`, `app.js`
- Data: `data/embedded.js` (bundle), `data/*.geo.json` (shapefile extracts —
  see `SHAPE_INTEGRATION.md`), `data/months.json`, `data/mjo.json`, etc.
- Dam route: `data/dam-route-hirakud.geo.json` (v7.6 hero route; provenance in properties)
  + `data/_gen_dam_route.mjs` (re-runnable generator: CWC walk + DP simplify).
- v7.9 any-dam routing: `data/_route-engine.mjs` (shared solver — bbox grid, greedy walk, chaining,
  coast test, DP), `data/dam-router-worker.js` (module worker owning the 14 MB network),
  `data/_route_engine_check.mjs` (read-only coverage check: run `node data/_route_engine_check.mjs`).
- Rain averages: `data/rain-state-avg.json` (36 states × 12 months, mm/month) regenerated by
  `node data/_gen_rain_avg.mjs` from the fetched IMD 1901–2015 subdivision CSV kept local in
  git-ignored `data/_src/` (mirror URL in the JSON meta + CITATIONS 11).
- Docs: `INDIAN_WEATHER_SPEC.md` (frozen build spec, v7.9), `SHAPE_INTEGRATION.md`
  (shapefile checklist, all ticked), `CITATIONS.md` (all sources/©), `README.md`.
- NEVER commit: `pdf/` (IMD ©), `Shape files/` (1.1 GB) — both git-ignored.
