# PHENOMENA_LAYERS_TODO — v7.1 implementation plan (frozen)

**Goal (user's exact ask):** show all 41 researched climate phenomena on the map — in 2D *and* 3D — **animated, as user-pickable layers**.

**How to use this file:** it is the single source of truth for this feature. A fresh session executes tasks T1→T7 top-to-bottom and checks boxes. Read THIS file first, then `CLIMATE_PHENOMENA_TODO.md` only per-item (line M1/O3/… ) to condense popup sentences. Never read `app.js` end-to-end (1047 lines / 93.5 KB).

**Verified anchors (grep again before splicing; ±3 lines drift is normal):**
- `app.js` (1047 lines): `getJSON` L14 · `setMonth()` L26–44 (hook goes after L43) · chips wiring L54 · `layers` obj L52-ish · `window.__applyLayers` L445 · self-test L472 · `allBtn` L478 · `setMonth(7)` L481 · `initMap()` L487 · `buildTerrain()` L578 · `relG` L613 · `MZ` L621 · `X`/`Z`/`yOf`/`hAt` in scope by L666–667 · PEAKS L700–702 · CITIES L705–707 (`_t3("markers")` L707, `_t3("preDams")` L709 → insert between) · render loop `stepWx(dtS)` L975 · `window.__t3` L993 · file ends L1047.
- `index.html` (239 lines): `styles.css?v=7.0` L10 · brand `v7.0` L14 · chips div closes L52 · card-foot L53 · `embedded.js?v=7.0` L238 · `app.js?v=7.0` L239.
- `styles.css` (105 lines): last line L105 = global reduced-motion media query. **Append new styles at end** (after it is fine — its `!important` still wins).

**Token rules for the executing session:** grep anchors instead of reading; read ≤60-line windows; `node --check app.js` after every splice; ≤4 live reloads total (use `?live=N`). Session batching in §6.

---

## 1. Frozen design

### 1.1 Files & versioning
- **NEW `data/phenomena.json`** — fetched directly: `fetch("data/phenomena.json?v=7.1")`. **NOT** a key in `data/embedded.js` (do not add one — direct fetch sidesteps the shadow-bundle rule).
- Bump `?v=` 7.0→**7.1** at index.html L10, L14 (brand text), L238, L239; spec header v7.0→v7.1.
- Self-test L472 appends ` · phen=${__phen.on.size}/41` (update HANDOFF.md expected output after verify).
- **Never** touch the `layers` object, `allBtn`, or chip wiring L54 — the documented `layers on=n/14` self-test must stay intact. Phenomena state is separate.

### 1.2 JSON schema (frozen)
```json
{ "v":"7.1",
  "note":"Schematic/illustrative geometry for study. Seasons follow the month slider. Sources: CLIMATE_PHENOMENA_TODO.md",
  "cats":{"M":"Monsoon","O":"Oscillations","S":"Storms","X":"Heat & cold","L":"Climate trends"},
  "items":[ { "id":"M1","cat":"M","name":"…","kind":"region","color":"#0F766E",
    "window":[6,7,8,9],"label":"…","labelAt":[la,lo],"h3d":1200,
    "info":"1–2 sentence popup body (condensed from TODO.md line)","src":"CLIMATE_PHENOMENA_TODO.md · M1",
    "geo":{ } } ] }
```
`window` = months when bright (empty `[]` = all year). `h3d` = metres to lift in 3D (default 900). `labelAt` optional (default bbox centre).

### 1.3 Kinds — `geo` shapes
| kind | geo | 2D | 3D |
|---|---|---|---|
| `region` | `{"poly":[[la,lo],…],"field":true}` | filled polygon (fill .18, weight 1.5) + animated dot field (grid ~1.2° inside poly, small circleMarkers, CSS pulse w/ staggered delay) | dot field as one `THREE.Points` sampling `hAt` per point, y=`yOf(max(0,hAt))+MZ(60)` |
| `band` | `{"line":[[la,lo],…]}` | dashed marching polyline (`dashArray "6 6"`, CSS `phenDash`) | `Line` + `LineDashedMaterial` (call `computeLineDistances()`), lifted `MZ(h3d)` |
| `track` | `{"line":[…],"motion":"loop"\|"month","anchors":[{"m":9,"i":0},…]}` | base polyline + moving dot marker (`phenMover`), `loop`=constant speed rAF, `month`=position from slider via `anchors` (linear between) | `Line` + small sphere mover at `MZ(h3d)` |
| `sea` | `{"boxes":[[s,w,n,e],…],"colors":["#B45309","#1D4ED8"]}` | boxes as polygons, low fill, label tag; `colors[k]` per box | flat `LineLoop` rects at `yOf(0)+MZ(30)` + translucent fill planes |
| `points` | `{"pts":[{"la":…,"lo":…,"t":"Short tag"}]}` | circleMarkers + click popup; permanent tag when `t` present | small spheres (scale 0.014, same pattern as CITIES) |
| `pulse` | `{"pts":[{"la":…,"lo":…,"r":300}]}` | centre dot + expanding `L.circle` rings (r in km, period 2.6 s, 2 rings staggered) | `RingGeometry` flat meshes, scale animated in `step()` |

Popups (all kinds): `<b>{id} · {name}</b><br>{info}<br><i>{src} · (illustrative)</i>`. Permanent label tags use class `phenTag`.

### 1.4 Palette
- M `#0F766E` (teal) · O `#6B7280` (grey) · S `#B45309` (amber) · X heat `#B91C1C` / cold `#1D4ED8` · L `#6B7280`.
- Overrides: O3 west box `#B45309` / east box `#1D4ED8` (via `geo.colors`); O4 violet `#6D28D9` (violet is MJO-only — keep it that way); X4 winter fog grey `#6B7280`; X6 mango showers teal `#0F766E` (beneficial rain).

### 1.5 2D engine contract (append as module at end of app.js)
- `PHEN = {items:[],on:new Set(),g2:L.layerGroup().addTo(map)? created after initMap, movers:[],raf:0,loaded:false}`
- `window.__phen = {items, on, apply:phenApply, month:m=>phenSync(m), toggle(id,bool), loaded}` — debug surface.
- `phenInit()` (called at file end, try/catch): fetch JSON → build panel list (grouped by cat, checkboxes `data-id`) → restore `localStorage["phen.on"]` (JSON array, guarded parse) → `phenBuild2()` → `phenApply()`.
- `phenBuild2()`: one sub `L.layerGroup` per item into `PHEN.g2`; stash `item._2d={group,paths:[],marker,rings:[]}`; `map` and `L` are in scope.
- `phenApply()`: add/remove sub-groups per `on` set; update `#phenCount`; (re)start `phenStep2` rAF iff any on && !RM.
- `phenStep2(ts)`: early-return/slow-schedule under `RM||document.hidden`; move `loop` movers along cumulative polyline length (MJO period 12 s, WD 16 s); expand pulse rings via `setRadius(phase*r)` km (phase=(ts/2600+stagger)%1).
- `phenSync(m)`: per item: in-window → bright (`opacity/fillOpacity` from base), off-window → dim (`opacity:.12`, marker element class `phenOff`); `month` movers positioned by `anchors` interpolation (M3, M12).
- Point-in-poly helper `ptInPoly(pt, poly)` used by dot fields (2D + 3D).
- Default state: **nothing checked**; panel starts collapsed.

### 1.6 3D engine contract
- `window.__phen3d = {build(ctx), step(dtS), info()}` — `ctx={relG,X,Z,yOf,hAt,MZ,UPM}` captured inside `buildTerrain` (all initialized by insert point L708).
- `build()`: one `THREE.Group` per item parented to a single `phen3dG` added to `relG` (NEVER `scene`). Same kind recipes as §1.3. Store `{mat, mover, pulses, line, t}` per item.
- `step(dtS)`: skip if no items on; update loop movers + pulse phases; read global `CLIM.M` (cached `lastM`) for season gating → set `material.opacity` (dim `.08`, not hide); under `RM` snap pulses to phase 0.5 and don't advance movers.
- `info()` → `{built:true, objs:nGroups, steps:stepCount, on:__phen.on.size}`.
- Splice A (inside `buildTerrain`, between L707 and L709): `try{ if(window.__phen3d) await window.__phen3d.build({relG,X,Z,yOf,hAt,MZ,UPM}); }catch(e){console.warn("phen3d",e);} _t3("phen3d");`
- Splice B (render loop, after `stepWx(dtS);` L975): `try{ if(window.__phen3d) window.__phen3d.step(dtS); }catch(_){}`

### 1.7 UI panel (index.html, insert between L52 and L53)
```html
<details class="phenPanel" id="phenPanel">
  <summary>Climate phenomena · 41 <span class="phenCount" id="phenCount">0 on</span></summary>
  <div class="pchips">
    <button class="pchip" data-cat="all" aria-pressed="true">All</button>
    <button class="pchip" data-cat="M" aria-pressed="true">Monsoon</button>
    <button class="pchip" data-cat="O" aria-pressed="true">Oscillations</button>
    <button class="pchip" data-cat="S" aria-pressed="true">Storms</button>
    <button class="pchip" data-cat="X" aria-pressed="true">Heat &amp; cold</button>
    <button class="pchip" data-cat="L" aria-pressed="true">Trends</button>
    <button class="pchip" id="phenClear">clear</button>
  </div>
  <div class="phenList" id="phenList"><!-- JS fills: group headers + <label class="phenItem"><input type="checkbox" data-id="M1"> M1 · name</label> --></div>
  <div class="phenNote">Schematic (illustrative) geometry · seasons follow the month slider · sources: CLIMATE_PHENOMENA_TODO.md</div>
</details>
```
`pchip[data-cat]` toggles visibility filtering of the list only (not check state). `#phenClear` unchecks all.

### 1.8 Season gating + reduced motion
- Gating months vs `setMonth(m)` via hook `if(window.__phenMonthSync)window.__phenMonthSync(m);` added in `setMonth` (after L43, before closing brace L44). Called before init’s `setMonth(7)` → guard handles undefined.
- Reduced motion: CSS `*{animation:none!important}` (styles.css L105) kills dash/pulse CSS automatically. JS: `RM` (app.js L5) → no rAF stepping; loop movers snap to mid/current position; pulses fixed phase 0.5. Month-driven positions still move (user action, not ambient animation).

### 1.9 CSS to append (styles.css end)
`.phenPanel` (details block, borders like `.fallback`) · `summary` cursor+bold · `.phenCount` mono muted · `.pchips`/`.pchip` small pill buttons w/ `[aria-pressed=false]` dim · `.phenList` scroll `max-height:300px` · `.phenItem` label rows (checkbox + text, hover bg) · `.phenItem .off`/group headers `.phenHead` small caps muted · `.phenNote` 12 px muted italic · path/marker classes: `.phenRegion` `.phenDash` (dash marching keyframes `phenDashMove` background-position trick won't work on SVG stroke → use `stroke-dashoffset` keyframes on the SVG path element instead) `.phenDot` (pulse keyframes 2.4 s, `transform-origin:center`) `.phenMover` (glowing dot) `.phenRing` (handled by JS radius, no CSS) `.phenTag` (Leaflet tooltip override, 11 px) `.phenOff` (`opacity:.25`). **SVG note:** Leaflet vector layers are SVG `<path>`; animate with `stroke-dashoffset` (dash marching) and `opacity` pulses on circle elements — keep `vector:true` (default).

---

## 2. The 41 items — build spec (coordinates schematic, on land/sea as noted)

Format: `id | kind | window | color | geo | label`. Coordinates `[lat,lon]`.

**M — Monsoon (teal #0F766E)**
- M1 | region field | 6-9 | teal | poly [[12.8,74.9],[12.0,75.2],[10.5,76.2],[8.3,76.9],[8.1,77.6],[9.6,77.1],[11.3,75.8]] | "SW monsoon onset — Kerala (normal 1 Jun)"
- M2 | band | 6-7 | teal | [[23,68.5],[25.5,71.5],[28,76],[28.8,81],[28.3,85.5],[27.5,88.5],[26.5,89.8]] | "Northern Limit of Monsoon — normal mid-July cover"
- M3 | track month | 9-12 | teal | line [[31,72.5],[27,74],[23,76],[18,78.5],[13,79.5],[9,77.5]]; anchors m9→i0, m10→i2, m11→i3.5, m12→i5 | "Withdrawal — NW first, peninsula last (Oct–Dec)"
- M4 | region field | 6-9 | teal | poly [[23.5,73.5],[24.5,78],[23,82],[20,82.5],[17.8,79],[19,74.5]] | "Active/break core — central India"
- M5 | band | 6-9 | teal | [[29.9,73.9],[27.5,78],[25.4,81.9],[23.5,85.5],[22.6,88.4],[21.6,89.6]] | "Monsoon trough — Ganganagar→Head Bay"
- M6 | pulse | 7-9 | teal | (17.5,86.5) r260 | "Monsoon lows/depressions — NW Bay genesis"
- M7 | region field | 10-12 | teal | poly [[13.5,74.6],[15.8,77.2],[15.6,80.2],[13.5,80.3],[11,79.6],[8.8,77.6],[9.8,76.1],[12.2,75.0]] | "NE (winter) monsoon — Oct–Dec"
- M8 | band | 12-2 | teal | [[27,68],[27.5,75],[28,82],[27.5,89],[27,95]]; h3d 12000 | "Subtropical westerly jet ~27N, ~12 km (winter)"
- M9 | band | 6-9 | teal | [[13,60],[13,70],[13,80],[13,90],[13,98]]; h3d 15000 | "Tropical easterly jet ~13N, ~15 km (Jul)"
- M10 | band | 6-9 | teal | [[13,58],[13,70],[13,82],[13,94]]; h3d 1500 | "ITCZ at Jul normal (~13N; migrates 5S→13N)"
- M11 | region field | 6-9 | teal | poly [[30.5,79],[33,78],[35,76.5],[35.5,81],[34,87],[31,92],[28.5,89],[28,83]]; h3d 4500 | "Tibetan Plateau heating → Tibetan High"
- M12 | track month | 3-6 | teal | line [[18,76],[20.5,79],[27,74.5],[28.5,72.5]]; anchors m3→i0, m4→i1, m5→i2, m6→i3 | "Heat low migrates: Mar peninsula → Jun NW Rajasthan" (h3d 300)
- M13 | band | 6-9 | teal | [[8.6,77.0],[11,76.5],[14,75.5],[17,74.3],[20,73.7],[21.2,73]] | "Western Ghats orographic rain + rain shadow"
- M14 | points | 6-9 | teal | (25.28,91.73) Mawsynram; (25.27,91.72) Cherrapunji | "Khasi Hills — world-class rain"

**O — Oscillations & teleconnections (grey #6B7280)**
- O1 | points | all | grey | (12,101.5) | "ENSO (Pacific, off-map edge) — El Niño ⇢ weak ISM"
- O2 | points | all | grey | (9,102.5) | "ENSO Modoki (central-Pacific)"
- O3 | sea | 6-11 | west #B45309 / east #1D4ED8 | boxes [-10,50,10,70], [-10,90,0,110] | "IOD poles — DMI = west−east SST anomaly (±0.4 °C)"
- O4 | track loop | all | #6D28D9 | [[-5,45],[0,55],[5,65],[10,73],[12,80],[12,88],[8,95],[3,105],[2,115],[5,125],[8,134]]; period 12 s; h3d 3000 | "MJO — eastward 30–60-day pulse"
- O5 | points | all | grey | (6,103.5) | "PDO (Pacific) — year-to-year ISM factor"
- O6 | sea | 3-6 | grey | box [-10,40,20,100] | "Indian Ocean Basin Mode — basin-wide warm anomaly"
- O7 | points | all | grey | (34,58) | "NAO / AMO (Atlantic, off-map edge)"

**S — Storms (amber #B45309)**
- S1 | pulse | 4-5,10-12 | amber | (15,87) r300; (15,65) r250 | "NIO cyclones — Apr–May & Oct–Dec peaks (Nov max)"
- S2 | points | all | amber | (12.5,80.0) | "IMD scale: D→DD→CS→SCS→VSCS→ESCS→SuCS"
- S3 | region | 4-5,10-12 | amber | poly east coast [[22.0,88.1],[19.2,85.2],[16.8,82.4],[13.2,80.4],[13.0,80.1],[16.5,81.9],[19.0,84.6],[21.8,87.6]] (no field) + Gujarat [[23.5,68.6],[22.3,69.6],[21.0,72.4],[21.4,72.6],[22.7,69.9],[23.8,68.9]] | "Storm-surge coasts — deltas (illustrative strips)"
- S4 | track loop | 12-2 | amber | [[36,56],[35,60],[34,64],[32,68],[30,71],[28.8,74]]; period 16 s; h3d 2600 | "Western disturbance — Mediterranean → NW India"
- S5 | pulse | 3-5 | amber | (23.5,88.5) r220 | "Nor'wester / Kalbaisakhi (max May)"
- S6 | pulse | 4-6 | amber | (26.5,72.5) r300 | "Andhi / dust storms — Rajasthan"
- S7 | pulse | 3-5 | amber | (26,92.5) r260; (23.8,86.5) r200 | "Pre-monsoon thunderstorms / hail zones"
- S8 | points | 3-5 | amber | (24.6,88.6),(25.4,89.6),(26.2,90.9),(23.2,87.6),(22.6,88.4) | "Tornado cases (44 in IMD record; cluster illustrative)"

**X — Heat & cold extremes (heat #B91C1C / cold #1D4ED8)**
- X1 | pulse | 3-6 | red | (28,72) r350; (23,78) r300; (17,82) r200 | "Heat-wave zones — NW+central, AP/Odisha coast (peak May)"
- X2 | pulse | 4-6 | red | (29.5,75.5) r300 | "Loo — Punjab/Haryana/E.Rajasthan/UP"
- X3 | pulse | 11-3 | blue | (28,76) r320; (25,80) r280 | "Cold-wave zone — NW & central (worst Dec–Jan)"
- X4 | region | 12-1 | grey | poly [[30.5,74.5],[29.3,77.4],[27.8,79.8],[26.4,83.0],[25.6,86.5],[24.6,88.6],[25.2,89.9],[26.6,89.0],[27.6,85.0],[28.8,81.5],[29.9,78.2],[31.0,75.3]] (no field) | "Winter fog — Indo-Gangetic plains"
- X5 | pulse | 12-2 | blue | (29,76.5) r280 | "Frost / ground frost — NW plains & foothills"
- X6 | pulse | 3-5 | teal override | (10.5,76.5) r150; (13.5,74.8) r130 | "Mango / blossom showers — Kerala & coastal Karnataka"
- X7 | region | 10-11 | red | poly [[24,73],[24.5,78],[22.5,80.5],[19,80],[16,78.8],[13.5,77.3],[15.5,74.6],[19,73.4]] (no field) | "October heat — post-monsoon peninsula"
- X8 | points | 3-6 | red | Delhi 28.61,77.21; Mumbai 19.08,72.88; Chennai 13.08,80.27; Bengaluru 12.97,77.59; Kolkata 22.57,88.36; Ahmedabad 23.02,72.57; Jaipur 26.91,75.79 | "Urban heat island — major metros"
- X9 | sea | 11-2 | grey | box [10,55,31,93] | "Atmospheric brown cloud — IGP + N Indian Ocean (winter)"

**L — Climate trends (grey #6B7280)**
- L1 | region field | all | grey | poly [[35,74],[35.5,80],[33,86],[29.5,92],[27,95.5],[24.5,94],[22,92],[19,88.5],[16,85],[12.5,80.5],[9.5,78.5],[8,77],[11,75.5],[15,73.5],[20,71],[23,68.5],[27,69],[31,70],[34,72]] | "India warming ~0.7 °C (1901–2018), rising extremes"
- L2 | points | 5-10 | grey | South Lhonak (27.95,88.6); Shako Cho (27.6,88.5); Gangotri (30.9,79.1) | "Glacier retreat & GLOF monitoring lakes"
- L3 | points | all | grey | Mumbai (19.05,72.8) 4.1mm/yr; Mormugao (15.4,73.8) 4.3; Kochi (9.96,76.25) 4.4; Chennai (13.1,80.3) 4.2; Visakhapatnam (17.7,83.3) 4.5; Paradip (20.3,86.6) 4.6 | "Sea level — tide-gauge trends 1993–2020"

Window notation: `6-9` = months 6,7,8,9; `11-3` = 11,12,1,2,3; `all` = `[]`.

---

## 3. Tasks (check as you go)

### [ ] T1 — Write `data/phenomena.json` (41 items)
- **Recommended (token-cheap, reproducible):** create `data/_gen_phenomena.mjs` with the §2 rows as compact arrays, run `node data/_gen_phenomena.mjs > data/phenomena.json`, spot-check `node -e "const j=require('./data/phenomena.json');console.log(j.items.length, j.items.map(i=>i.id).join(','))"` (must print 41 and all IDs). Keep the generator committed (harmless; delete if asked).
- `info` bodies: condense 1–2 sentences from the matching line in `CLIMATE_PHENOMENA_TODO.md`; every popup gets `src` + the note carries "(illustrative)".
- All-year items: `"window":[]`. Add `"labelAt"` only where bbox centre is misleading (e.g. O3 west/east boxes → (0,60) and (-5,100)).
- **Fallback:** write JSON directly in 2 `write`/`edit` passes (M/O/S then X/L) if the script route is unwanted.

### [ ] T2 — `index.html`
- L10 → `styles.css?v=7.1`; L14 brand → `study deck · v7.1`; L238 → `embedded.js?v=7.1`; L239 → `app.js?v=7.1`.
- Insert the §1.7 panel block between L52 (`</div>` closing chips) and L53 (`card-foot`).

### [ ] T3 — `styles.css`
- Append the §1.9 rules at end of file. Include `@keyframes phenDashMove` (stroke-dashoffset), `@keyframes phenDotPulse`. No new media query needed (L105 handles reduced motion).

### [ ] T4 — `app.js` — 2D engine + UI + hooks
- **4a.** In `setMonth`, after L43 (`__terrainMonth`) add: `if(window.__phenMonthSync)window.__phenMonthSync(m);`
- **4b.** L472 self-test: append ` · phen=${(window.__phen&&window.__phen.on)?window.__phen.on.size:0}/41` inside the template string.
- **4c.** Append module at **end of file** (after L1047): `/* ==== v7.1 phenomena layers ==== */` — `ptInPoly`, `PHEN`, `window.__phen`, `phenInit`, `phenBuild2`, `phenApply`, `phenSync`, `phenStep2`, `window.__phenMonthSync=phenSync`, UI builder (list grouped by cat, checkboxes, filters, clear), localStorage `phen.on` persistence, then `try{phenInit();}catch(e){console.warn("phen",e);}`.
- **4d.** `node --check app.js` → fix any syntax issue before live test.
- Live check (reload 1): panel shows 41 rows; toggle 3 items incl. O3/O4/S1 → shapes appear; `__phen.on.size` matches; self-test shows `phen=3/41`; no console errors. Month slider to 1 and 9 → O3 right style swaps bright/dim.

### [ ] T5 — `app.js` — 3D engine
- Insert Splice A between L707 and L709 (after `_t3("markers")`).
- Insert Splice B after `stepWx(dtS);` (L975).
- Append `window.__phen3d={build,step,info}` to the §4c module (before its `phenInit()` call). Reuse `phenBuild2` item list; loop movers store cumulative lengths; pulses store phase offsets.
- `node --check app.js`.
- Live check (reload 2): enable 3D → `__phen3d.info()` `{built:true,objs:41,steps>0}`; toggle O4/M5/S4 → visible; month slider dims X3 vs X1 appropriately; `__t3.wx()` unchanged shape; no console errors.

### [ ] T6 — Final verify (reload 3)
- Fresh tab `index.html?live=3`: 0 console errors; self-test line intact + `phen=N/41`; `__phen.loaded===true`; O4 mover advances (watch `O4._2d.marker.getLatLng()` twice 2 s apart, changes); reduced-motion via devtools emulation optional.
- Check 2D+3D co-existence: 3D on hides 2D (existing behavior) — toggling phenomena while 3D is on must not throw; back to 2D → layers re-render.

### [ ] T7 — Docs + commit
- `HANDOFF.md`: state line → v7.1; self-test expected string now ends `phen=n/41`; add recipes `window.__phen`, `__phen3d.info()`, panel behavior; note phenomena ≠ `layers` counts.
- `INDIAN_WEATHER_SPEC.md`: header v7.0→v7.1 + 2-line feature note.
- Commit 1 (if not yet): `research: 41 climate phenomena checklist + IMD sources` (CLIMATE_PHENOMENA_TODO.md).
- Commit 2: `v7.1: 41 climate phenomena as pickable 2D/3D animated layers`. Push if user confirms (they pushed v7.0).

---

## 4. Verification recipes (copy-paste)
```js
// 2D
__phen.items.length                         // 41
__phen.loaded                               // true
__phen.toggle('O3',true); __phen.on.size    // 1
document.querySelector('#phenCount').textContent  // "1 on"
document.querySelector('#layerDebug').textContent.includes('phen=1/41')  // true
// off-season dim check
__phen.month(1);  __phen.items.find(i=>i.id==='O3')._2d.paths[0].options.opacity  // ~0.12
__phen.month(9);  // opacity back to base
// 3D (after enabling terrain)
__phen3d.info()                             // {built:true,objs:41,steps:3,on:n}
__t3.stats()                                // unchanged phase list gains "phen3d"
```
Server: `python -m http.server 8000` from repo root; open `http://127.0.0.1:8000/index.html?live=N`.

## 5. Land-mines (from HANDOFF + recon)
1. Every 3D object → `relG` (never `scene`); `phen3dG` single child group.
2. `X`/`Z` TDZ: only use them after L666 within `buildTerrain`; phen3d receives them as params — never reference from module scope.
3. Keep screen-relative sizes: markers scaled tiny (0.012–0.02) like PEAKS/CITIES; relief chips scale `relG`, don’t bake absolute metres into mesh scales.
4. `getJSON` shadows via `IND_DATA` — phenomena.json must be a **direct fetch** with `?v=7.1`.
5. Do not touch `layers`/`allBtn`/chips (L54) — self-test `layers on=n/14` is a documented contract.
6. `setMonth(7)` runs at L481 **before** `initMap()` (L487) and before the module tail defines `__phenMonthSync` → the hook must be guarded (it is).
7. localStorage parse guarded try/catch; key exactly `phen.on`.
8. Popups/labels must carry "(illustrative)" wording via the note + src line.
9. `node --check` after every splice; reloads with `?live=N` only.
10. If `embedded.js` stays unchanged content-wise, still bump its `?v=` (repo rule: every asset change bumps all four).
11. Leaflet SVG vector animation: use `stroke-dashoffset` keyframes (not `background-position`); tooltips need `className:"phenTag"` option.
12. Flashcard frailty at L1045-46 and other known issues — **not** in scope; don’t "fix" anything else.

## 6. Resume / session batching (token economy)
- **S1:** T1+T2+T3 → reload → 41 rows listed, no JS errors, toggles inert (module not yet added is OK — checkboxes just won’t draw).
- **S2:** T4 → live 2D verify (§4 first block).
- **S3:** T5 → live 3D verify.
- **S4:** T6+T7 → docs + commits.
- Each session starts by reading **this file only** + the specific task row; grep anchors fresh (lines drift after edits).
- Target ≤15 tool calls per session; never print full files into context.

## 7. Unrelated pending decisions (for the user, not this feature)
1. Delete `C:\Users\rahul\Downloads\Token-Monitor-Setup-0.72.0.exe`?
2. Relaunch agentplay viewer (`C:\Users\rahul\.agentplay-shim\view.cmd`) when wanted.
3. pi-subagents install (`npm.cmd install -g @earendil-works/pi-coding-agent` + `pi install npm:@tintinweb/pi-subagents`).
4. Hide 5 extra repo skills via permissions deny in `opencode.json`.
5. "outside"-style subagent variant demo (optional).
