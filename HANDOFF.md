# HANDOFF — read this file first, nothing else

One-page state so a fresh session (or another agent) needs ~2k tokens instead of
re-reading the codebase. Do NOT read `app.js` end-to-end (~760 lines) — grep for
the symbols named below (a lean session with targeted greps + live verify stays
well under 40k tokens; reading app.js whole adds ~75k — avoid).
Full build rules: `INDIAN_WEATHER_SPEC.md` (v7.0).

## What this is
Static single-page study site (no build): `index.html` + `styles.css` + `app.js` +
`data/embedded.js` (bundle) + `data/*.geo.json`. Serve:
`python -m http.server 8000` → `http://127.0.0.1:8000/index.html?live=N`
(N++ every reload to beat cache; `?v=` must be bumped on EVERY asset change or a
browser can hold a stale same-version asset — if in doubt verify on a fresh origin,
e.g. `localhost` vs `127.0.0.1`). Brand in header shows version (now v7.0).

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

## Current verified state (2026-10-16, v7.0)
- Self-test line `#layerDebug`: `months=12 stations=23 states=36 rivers=109+633west
  basins=25 dams=13002 cwc=30395 mjo=8 rm=<0|1> layers on=12/14 vectors-ok`.
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
- Zoom hierarchy (Google-Maps style): rivers rivMaj/rivMed(≥5)/rivMin(≥7) + rivWest
  (CWC west-flowing subset, ≥5); dams dg0(top40)/dg1(<400)/dg2(all, ≥8) + labels ≥7;
  CWC network ≥6 bg-load; water (reservoirs/glacial/TN) lazy on chip only.
- 2D RAIN STREAKS (v6.2, illustrative): `stepRain(nowS)` runs inside the wind-canvas
  loop (only while the Winds chip is on). Drops fall over the month's `rainStates` —
  the same IMD month-typical list as the teal highlight. Pool sampled inside each state
  polygon (area-weighted ring pick + even-odd test), cached per month in
  `window.__rainPoolCache`; count `min(320,40+250·rf)`, `rf=max(0.12,min(1,(arabian+bay)/200))`;
  streak lean follows `curVec`. Rebuild happens inside `window.__rainStates`. `__rainDbg()`
  = {m,rain,pool,k}.
- 3D WEATHER (v7.0, illustrative): rain = LineSegments `wxRGeo` N=36+330·rf falling to
  `wxFloor` (= terrain + MZ(90)); wind = LineSegments `wxWGeo` N=22+115·min(1.25,|vecFor(md)|)
  along `wxVec=(x:vx,z:vy)`; counts + vector set inside `applyHydro` (the month funnel),
  positions integrated by `stepWx(dtS)` in the loop; extras hidden via `setDrawRange`.
  v7.0: ALL wx distances/sizes are divided by `REL` (screen-relative — exaggeration chips
  must not stretch weather). `__t3.wx()` = {m,rf,rain,wind,vx,vz,pkt,west}.
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
  bilinear (4-corner). Terrain bands unchanged: cA #5B8C5A / cB #A08B62 / cC #8A8F98 /
  cS #F2F3F5 at 400/1800/5200 m. `t3Stats.phases` = per-phase build ms (mesh ≈4.1 s,
  damLoop ≈1.0 s, tail ≈0.8 s; whole build ≈6.5 s on a VISIBLE tab — hidden tabs inflate
  timer measurements, so measure on a focused tab). Read-only hooks:
  `window.__t3={hAt,yOf,stats,view,hydro,wx,nav,setRel,setSpin}`.
- 3D CAMERA PARAMS (v7.0; grep `tgt`,`fly`,`startFly`,`setRel`,`setSpin`,`panDrag` — inside `buildTerrain()`):
  orbit target `tgt` starts (0,0.0019,0) ≈1.9 km; wheel `R=max(0.01,min(12,R·e^{deltaY·0.003}))`;
  near plane `max(0.002,0.02·R)` refreshed each loop; **auto-spin OFF by default** (`spin=false`,
  HUD `#t3spin` = "⟳ spin: off/on"; spin condition `if(spin&&!drag&&!RM&&!fly)`); PAN = middle/right
  button or shift+left drag (`panDrag`, `kp=0.0018·R` px→world; contextmenu prevented); dblclick =
  raycast `tMesh` → 600 ms smoothstep fly to hit, `tr=max(0.01,R·0.35)`; dblclick miss (sky) → HOME,
  R=4.4; wheel/pointerdown cancels the fly. HUD lives inside `#terrainWrap`: `#t3rel` cycles RELS
  (label "×1 relief · true" / "×N relief"), `#t3home` = fly home; `setRel(r)` scales
  `relG.scale.y` AND `tgt.y`/`HOME.y` by `k=r/REL`. Zoom floor 0.01 ≈ 10 km = honest z6 DEM limit
  (~2.3 km/px, mesh cell ≈5.2 km). `__t3.view()`={R,near,tgt,fly}; `__t3.nav()`={spin,rel,relScale,pan};
  `__t3.setRel(r)`, `__t3.setSpin(b)`.
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
  crest 0xd9dcdf); hero piers for conc/arch hm≥100 (=14). Gates: `nearRiver(x0,z0,0.0025)`
  (≤0.05 u) stored as ORIENTED param t (rev flips 1−t). `stats` (build-time, month-independent):
  walls=13002, reservoirs≈1813, gates≈10630, animLakes=240, heroes=14, tris≈650926 (dam+lake).
  Basins block uses LOCAL XB/ZB helpers — do not "simplify" to X/Z (TDZ crash, fixed v5.3).
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

## Next up (for the next session)
- v7.0 is green (true-scale relief, all 13,002 dam models, spin-off by default + pan tools) —
  commit + push done; site re-verified live (battery above).
- USER ACTION pending: restart OpenCode so the global claude-mem plugin loads in every
  project at startup (core features already live).
- If asked to keep polishing the 3D view: candidates are hover labels for major dams, a soft
  spillway glint, or snow-cap tinting tied to `yOf` bands — if any option conveys new info,
  keep the "(illustrative)" label.
- Otherwise pick from the standing optional items below.

## Open items (not bugs)
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
- v6.2 weather animations: `__rainDbg()` month 7 → {m:7, rain≈278, pool≈360}; slider 1 →
  {m:1, rain≈103, pool≈48}. 3D on: `__t3.wx()` month 7 → {rain≈350, wind≈166, vx≈1.45, vz≈-0.84};
  slider 1 → {rain≈119, wind≈61, vx≈-0.26, vz≈0.21}. Values are ballpark — the month-to-month
  FLIP in density/direction is what must hold; console stays clean.
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
- Commands used previously run clean: `node --check app.js`.

## Repo layout cheat-sheet
- Site: `index.html`, `styles.css`, `app.js`
- Data: `data/embedded.js` (bundle), `data/*.geo.json` (shapefile extracts —
  see `SHAPE_INTEGRATION.md`), `data/months.json`, `data/mjo.json`, etc.
- Docs: `INDIAN_WEATHER_SPEC.md` (frozen build spec, v7.0), `SHAPE_INTEGRATION.md`
  (shapefile checklist, all ticked), `CITATIONS.md` (all sources/©), `README.md`.
- NEVER commit: `pdf/` (IMD ©), `Shape files/` (1.1 GB) — both git-ignored.
