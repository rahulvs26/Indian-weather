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