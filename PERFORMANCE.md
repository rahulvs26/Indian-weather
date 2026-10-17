# Performance and test suite — v7.22w

Everything here was measured in a real browser against the running deck. Nothing is estimated, and
two of the numbers below contradicted the obvious reading, which is why the controls are described.

Run the whole thing:

```
node data/_smoke.mjs                # static checks, ~1 s, no browser
node data/_hydrology.test.mjs        # Curve Number arithmetic vs hand-worked values
node data/_crossings.test.mjs        # reservoir crossings vs known geometry
node data/_route_engine_check.mjs    # 400 dams: routing, up-flow regressions, timing
node data/_watershed_check.mjs       # published catchment areas vs the tile geometry
node data/_crs_check.mjs             # the India LCC inverse vs the Dam file's own lat/lon
node data/_osm-refine.test.mjs       # the OSM refiner on a fixture
```

Live probe (`data/_probe.mjs` — importable from any page, including a deployment):

```js
const p = await import("/data/_probe.mjs");
const report = p.report(p.makeProbe());     // timings, long tasks, memory, smoke
await p.measureFrames(3);                    // fps, median, p95, worst frame
await p.timeFetches(["/data/rivers-cwc.geo.json", ...]);
```

---

## 1. Measured results

### First view — good
| | |
|---|---|
| First contentful paint | **876 ms** |
| DOMContentLoaded | 655 ms |
| load | 689 ms |
| Long tasks (>50 ms) during load | **none** |
| JS heap after first view | 108 MB |

### 3D map — good
| state | fps | median frame | p95 | worst | frames >50 ms |
|---|---|---|---|---|---|
| idle, no dam | **60.0** | 16.7 ms | 17.2 ms | 17.4 ms | 0 |
| settled after selecting a dam | **59.5** | 16.7 ms | 17.1 ms | 33.3 ms | 0 |

### The one real performance defect
**Selecting the first dam stalls the main thread.** Measured during the selection:
1 fps, **1,016 ms median frame**, heap 108 → 200 MB.

The cause is main-thread JSON work, not the map. In that window the deck:
- parses **14.6 MB** of `rivers-cwc.geo.json` in the worker (already off-thread — good),
- parses **2.1 MB** of `reservoirs.geojson` **on the main thread**, and builds a name index,
- parses **5.8 MB** of `watersheds.geojson` **on the main thread**, and builds a 4,560-entry
  bounding-box index,
- then samples the traced course every 200 m and tests it against 1,918 indexed polygons.

**The fix, and why it is not shipped:** defer the watershed fetch with `requestIdleCallback`.
Tried, measured, reverted — `requestIdleCallback` does not run in a background or throttled tab, so
the crossings line came back empty and the river facts never appeared. Shipping a change that trades
a visible stall for a silently missing feature is not a trade.
**The right fix is to move both parses into `dam-router-worker.js`**, which already exists, already
speaks `postMessage`, and already holds the route engine. That is a known piece of work, not a guess.

### Two numbers that looked bad and were not
- **"The 2D map runs at 22.9 fps."** A *bare, empty* `requestAnimationFrame` loop on the same page
  measures a 49.9 ms median frame — because the harness browser has `document.hasFocus() === false`
  and throttles rAF to 20 Hz. The deck's 2D view was never the problem; the instrument was. Every
  frame number is therefore reported next to the control measurement.
- **"Long tasks: none."** True, and also a limitation: the observer is installed after load, so it
  only sees work that happens after it. It caught nothing here, which is not the same as there being
  none during startup.

### Payload, and what a phone pays for it
| file | size | when |
|---|---|---|
| `rivers-cwc.geo.json` | 14.30 MB | first dam selected |
| `watersheds.geo.json` | 5.62 MB | storm block opened |
| `subbasins.geo.json` | 3.83 MB | basin view |
| `dams.geo.json` | 2.83 MB | dam search |
| `reservoirs.geojson` | 2.13 MB | 3D map |
| `river-stats.json` | 2.02 MB | storm block opened |
| **total the app can fetch** | **34.0 MB** | |

Measured fetch times on this machine (local, so these are a floor, not a phone): 14.6 MB in 1,821 ms,
5.8 MB in 646 ms, 2.9 MB in 398 ms. **On a 3G connection at ~400 kB/s, that 14.6 MB is about 36
seconds.** This is the single largest risk in the project and it is the first thing to fix on a real
network. The fix is not compression — it is not asking for the rivers until the dam console is opened.

---

## 2. What the smoke suite checks, and why each one exists

`data/_smoke.mjs` — 36 checks, all passing. Every check corresponds to a defect that actually
reached a user, because the arithmetic tests caught none of them:

| check | the bug it would have caught |
|---|---|
| no `node:` import in any module the browser runs | `node:fs` in `_crossings.mjs` → **the entire 3D map ceased to exist**, with a CORS error pointing at `node:fs` and nothing pointing at the file that caused it |
| every data path named in code exists | a renamed file that 404s on a user's first click |
| popup fields exist in the file it reads | two files holding the same reservoirs → **the 2D reservoir popup printed no area at all** |
| no unclosed or short rings in that file | 2,331 of 5,162 invalid features → MapLibre accepts the data and silently draws nothing |
| storm panel's fields exist in `river-stats.json` | the interning pass renaming `tileRivers` → the river line silently empties |
| `.damLim .warn` exists as a span rule | `.damLim.warn` styling the **container** left the spans unstyled → unreadable text on a dark panel |
| no `#B45309` | the dark brown that caused it |
| every `<script src>` has `?v=` | the stale-cache bug that cost an afternoon: `map3d.js?v=7.22i` vs `7.22j` |
| fetchable payload under 40 MB, no file over 20 MB | silent payload growth |

Two things the suite got wrong on its first run, which is worth recording: it flagged
`data/_crossings.mjs` for importing `node:fs` when the file only *mentions* it in a comment, and I
had left a nonsense placeholder assertion in it. Both were defects in the test. It now strips
comments before checking, because a test that cries wolf gets ignored.

---

## 3. What is still unverified

- **No visual verification.** The screenshot tool refused through the reservoir and catchment work,
  and `readPixels` returns black because MapLibre is not created with `preserveDrawingBuffer`. Frame
  timings and DOM assertions cannot tell you a layer is in the wrong place.
- **No accessibility or mobile-viewport test.** Not started.
- **No cross-browser test.** Everything above is Chromium.
- **The 1 fps stall is measured but not fixed** (see above).

---

# 5. The 3D mountains control layout, measured

Reported as "in the 3D mountains button there is no other buttons". True, and the cause was a CSS
visibility rule rather than missing code.

The three view buttons - `m3v2d`, `m3v3d`, `m3vmap` - had their markup and their click handlers
since v7.21. The CSS showed `.m3tools` only for `.stage.map3d-on`. The mountains view puts
`terrain-on` on the stage instead, so the strip was `display:none` there. In the 3D mountains the
only control was the 2D map's own button, which goes back - the 3D map was unreachable. That is the
one-way-door problem v7.21 had just fixed, reintroduced one view over, and it survived because the
code drawing the buttons worked perfectly and the rule deciding whether you could *see* them never
ran.

Showing it immediately exposed two further problems, both found by hit-testing every control at its
own centre with `elementFromPoint`:

| arrangement | measured | verdict |
|---|---|---|
| top-right, horizontal | 428 px wide against **256 px** of clear space beside the HUD, so a **180 px overlap** | rejected |
| HUD narrowed to `calc(100% - 460px)` | the HUD has `flex-wrap`, so it wrapped; `spin`, `relief` and `help` fell below the fold, `elementFromPoint` returned `null` | rejected - trading an overlap for three unreachable controls is worse |
| bottom-right | the stage's bottom edge is at **y=1055** in a 700 px viewport, so the strip landed below the fold; bottom-left is the long `#terrainCap` caption | rejected |
| **top-right, vertical** | **102 x 140 px**, in **108 px** of clear space beside the HUD, inside the 420 px stage | adopted |

A second, older bug surfaced with it: the six HUD buttons need about 712 px on one line, but the HUD
was capped at `max-width:72%` (679 px), so `? How to move` wrapped to a second row. The help box is
positioned at a fixed `top:52px`, which assumes a single row - so once the button wrapped, the
**open help box sat on top of its own `?` toggle**, and the box's own instruction read "Tap ? to
close". Widening the HUD to `76%` (717 px) puts all six buttons on one line and restores the
geometry that fixed offset was written for.

Final measured geometry at a 943 px stage: HUD `29..746`, switch strip `854..956`, caption
bottom-left. All eleven controls hit-testable, no overlaps.

**Still unverified:** the harness will not scroll while the mountains view is active (`scrollY`
stays 0), so the scrolled position could not be measured. The geometry is sound on inspection - both
strips sit inside the 420 px stage, 108 px apart - but a human should confirm on a real screen.

`data/_smoke.mjs` sections 12 and 13 (87 checks) now assert the switch is visible in both 3D views,
that the HUD is wide enough not to wrap, and that the wireframe in `about.html` still names only
sections and buttons that really exist. That last check earned its place immediately: it caught the
diagram labelling three layer chips "Winds", "Heat / Cold" and "Radars" where the page actually says
"Winds + arrows", "Heat / Cold zones" and "Doppler radars".

---

# 4. The 3D mountains: measured v7.23b

Reported as "the 3D mountains are dead slow". They were not slow. **They never
rendered a frame at all.**

## The defect

A v7.16 performance optimisation added a visibility gate so off-screen renderers
would not waste work:

```js
window.__deckStageLive = el => DECK_VIS.stages.has(el);
```

`DECK_VIS.stages` is populated by an IntersectionObserver that watches only
elements with class `stage`. The three call sites passed elements that are
**inside** a `.stage`, not ones that are:

| line | call site | is it a `.stage`? |
|---|---|---|
| ~147 | wind canvas | no — parent is |
| ~1180 | `#terrainWrap` | no — parent is |
| ~1490 | `#osmMap` | no — parent is |

So the lookup was permanently `false`, every call returned `false`, and each of
those loops returned before doing any work **on every frame, forever**.

What that looks like from outside: `buildTerrain()` spends 9.3 s decoding 56 DEM
tiles and building 1.03 M terrain triangles plus 651 K dam triangles, then the
render loop is gated off, so the canvas keeps Three's constructor default of
300×150 and the reader waits a long time for a frame that never arrives. A long
wait followed by no result is indistinguishable from being slow.

Fixed by walking up to the nearest `.stage` ancestor, which is what the observer
actually tracks, falling back to `offsetParent` when there is no such ancestor.

## Two misreadings, recorded because both sent me the wrong way

**1. The fps was never measured.** The harness browser reported a steady 61 fps
for the 3D mountains. That was the *global* rAF loop, not the terrain renderer.
A dead loop measures as a perfect 60 — no frame-rate number can detect this
class of defect, which is why it survived from v7.16.

**2. The blur was not the bottleneck.** A Node benchmark at real array size
(1792 × 2048 = 3.67 M samples) predicted the separable blur was the dominant
cost. Sub-instrumenting the `mesh` phase showed the blur was **139 ms** and the
per-vertex mesh loop was 491 ms. In the browser the blur is not the hot spot.

## Measured build, after sub-instrumenting the `mesh` phase

It was one 4.75 s black box. Now:

| phase | ms | note |
|---|---|---|
| `damLoop` | ~1550 | 13,002 dam cross-sections, ~651 K triangles |
| `meshVerts` | ~880 | 517,537 vertices, was ~490 before the sampler change on a quieter machine — see A/B |
| `blur` | ~570 | separable 3×3 over 3.67 M samples |
| `damBuild` | ~500 | |
| `normals` | ~410 | `computeVertexNormals` over 1.03 M triangles |
| `tileDecode` | ~400 | 56 Terrarium tiles |
| `basins` | ~270 | |
| `threeImport` | ~60 | cached after first load |

Warm total ≈ **4.9 s**. Cold ≈ **9.3 s**: the extra ~4 s is 56 PNG tile
downloads from `s3.amazonaws.com`.

## The sampler change, and an honest A/B

The per-vertex loop called `hAt(lon,lat)`, and `hAt` evaluates a Mercator
projection — two trig calls and a log — once per vertex, to compute 672 lat and
768 lon values that are each reused along a whole row or column. Tabling the two
axes removes ~1.55 M transcendental evaluations.

Controlled A/B, same session, alternated:

| variant | `meshVerts` | total build |
|---|---|---|
| old | 973 / 990 / 1367 ms | 4725 / 4841 / 5659 ms |
| new | 863 / 899 / 908 ms | 4987 / 4996 / 5013 ms |

**~110 ms, about 2 % of the build.** The Node benchmark had predicted 141 → 28 ms
for that phase; in the browser, V8 had already optimised the original loop well.
The change is kept because it is free and provably harmless, not because it is
significant. `data/_dem_sampler.test.mjs` asserts the heights are **bit-identical**
to `hAt()` across all 517,537 vertices, 20,000 randomised sub-grid points and
every edge — not "close enough".

That test earned its place immediately: the first version used `Float32Array` and
four of six tests failed, because 187.62857142857143 does not survive a 24-bit
mantissa. The tables are `Float64Array` now, and the test asserts it so nobody
narrows them back.

## What was deliberately NOT changed

Three candidates would help more and were left alone, because each changes what
appears on screen and **nothing in this project can see its own output**:

1. **DEM zoom 6 → 5.** 56 tiles → 16, cutting most of the 4 s cold fetch. The
   z6 grid is 2.3 km/px against a mesh spacing of ~4.6 km, so it is roughly 2×
   oversampled — but the result would be a different, smoother surface.
2. **A relief-detail control** for the 1.03 M terrain triangles. This is the
   honest lever for "slow on my machine": it hands the choice to whoever is
   looking, instead of guessing their GPU.
3. **Rebuilding the 13,002 dams by importance tier.** ~1.55 s of the build.

## Still unverified after all of this

**The frame rate of the 3D mountains.** `document.hidden === true` in the
harness tab, and a hidden document gets no IntersectionObserver callbacks and no
`requestAnimationFrame` — rAF does not fire at all, verified by a probe whose
promise never resolved. The loop was forced open by adding the stage to the live
set and overriding `document.hidden`, which proved the gate now resolves
(`gateOpen: true`) but cannot produce a trustworthy fps: the canvas would be
rendering 1.68 M triangles through software GL.

So: the fix is verified logically and by DOM side-effects, and the build time is
measured. **The resulting frame rate is not measured and needs a human with a
real GPU.** If it is still slow after this, candidate 2 above is the first thing
to reach for.