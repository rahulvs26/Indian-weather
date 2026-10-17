# Gap analysis and value engineering — v7.22v

Measured, not estimated. Every number below comes from a script in `data/` that can be re-run:
`data/_cost_audit.mjs` (bytes and lines), `data/_payload_audit.mjs` (who fetches what), and the
existing check suites. Findings that changed the build are marked **[fixed in this pass]**.

---

## 1. The cost base

| | |
|---|---|
| Code the browser executes | 291 KB, 3,356 lines (`app.js` 1,533 · `map3d.js` 1,823) |
| Modules the browser imports | 37 KB, 4 modules (`_storm-layer` · `_hydrology` · `_crossings` · `_catchment`) |
| Build and check scripts (not shipped) | 47 KB, ~2,900 lines, 8 test suites |
| Data the app can fetch | **39.3 MB across 25 files** before this pass |
| Files over 500 KB | 10 |
| First-paint shell | 799 KB (HTML + CSS + JS); MapLibre and its style load only on the first 3D-map activation |

The payload is the number that matters. It is fetched over a phone connection in a country where
large parts of the deck's subject matter are still metered.

---

## 2. Gap analysis

### G1 — the 2D reservoir popup had lost its area **[fixed in this pass]**
`v7.22o` added `area_km2` to the *repaired* reservoir file and edited the 2D popup to print it — but
the 2D map reads a **second, older copy** of the same 5,160 reservoirs. The popup asked for a field
the file it was reading does not have, so clicking any reservoir on the 2D map printed no area at
all. I fixed the units last turn and broke the field with it, and it survived a full verification pass
because the popup is only built on click and my checks were all on the 3D map.

### G2 — the catchment is a watershed *unit*, not the dam's catchment
The storm panel now reports the published WRIS watershed unit containing the dam (Vaippar 435 km²,
Mettur 615 km², Bhakra 966 km²). That is the finest unit the source publishes. A large dam's own
catchment spans several of them — Bhakra's is about 4,480 km² against the 966 km² unit found here. So
every volume and peak figure in the panel is a **floor**, and the card says so. Closing this properly
means summing the units that drain to the dam, which needs flow routing from the DEM onto the river
network. Not started.

### G3 — 1 of 39 dam records hand-verified
`data/dam-facts.json` holds 39 researched rows. Exactly one has been checked by hand against its
source page. Hirakud's `live_tmc` 205.56 looks like the gross figure printed in the wrong field, and
eight rows still record the *kind* of number unconfirmed. Everything the deck prints about a dam comes
from this file, so this is the single highest-consequence gap in the project.

### G4 — the reservoir area and the dam record disagree, and nothing shows it
Mettur Dam's reservoir is 123.86 km² in the WRIS outline and 42.5 km² in the dam record — nearly 3×.
Both are sourced; they measure different things (full-pool extent versus something else). At present
the 3D card prints both when a dam is selected, but the 2D popup prints only the outline's figure, and
nowhere is the disagreement explained. This is exactly the class of thing that teaches a reader
something false by accident.

### G5 — no rainfall events anywhere
The deck holds monthly average rainfall by state (`rain-state-avg.json`) and monsoon/MJO phenomena.
There is no event rainfall, no hyetograph, no observed discharge series. So the storm panel can only
model a storm the *user* invents. That is honest, but it means the headline hydrology feature has no
observed counterpart to check itself against.

### G6 — the 3,356 lines of UI have no tests
All eight suites cover data and engines: the route solver, the OSM refiner, the projection, the
Curve Number arithmetic, the crossing detector. **Nothing covers `app.js` or `map3d.js`.** Every bug in
this log that reached a user was in the untested half: the dead search box, the four MapLibre property
traps, the `node:fs` import that deleted the 3D map, the two-reservoir-file split, the contrast rule
that styled a container instead of a span. The tests catch bad arithmetic; the shipped defects are
all wiring and lifecycle.

### G7 — nothing in this project can see itself
The screenshot tool failed ("needs a visible tab") through the whole reservoir and catchment work, and
`readPixels` returns a black buffer because MapLibre is not created with `preserveDrawingBuffer`. Three
of the six MapLibre query APIs return 0 for GeoJSON sources in this build — including for a layer that
demonstrably draws. So the final visual state of every 3D change in this log is unverified by machine
and rests on the user looking at it. **This is the risk that would have caught G1.**

### G8 — an empty field with a live consumer
`catchment_km2` is wired into the dam card and reads from `dam-facts.json`, where no row has a value.
It is correct to leave it null rather than invent numbers, but the panel should say *why* it is asking
the user to type the figure — currently it just asks.

### G9 — build scripts with no index
~2,900 lines across 40 scripts in `data/`, including three that exist only to patch another script
(`_wire_crossings.mjs`, `_fix_crossings.mjs`, `_add_reservoir_layers.mjs`) and were deleted in the
commits that used them. There is no registry saying which script produces which file, so the next
person cannot tell a build step from a one-off. `_payload_audit.mjs` half does this now.

---

## 3. Value engineering

### Removed in this pass — 9.3 MB of payload, all of it measured waste

| | before | after | why |
|---|---|---|---|
| `river-stats.json` | 5,209 KB | **2,064 KB** | 27,479 rivers each carried a full basin name and tile name; there are 25 basins and 98 tiles. Interned into two dictionaries, plus the `tiles` array (1,972 KB) reduced to the one tile ever shown |
| `reservoirs.geo.json` | 2,272 KB | **deleted** | duplicate of `reservoirs.geojson`, and the stale copy was the one the 2D map read — the cause of G1 |
| `riverbanks.geo.json` | 1,952 KB | **deleted** | referenced by nothing, ever |

Net, measured after the pass: the app's fetchable payload goes from **39.3 MB across 25 files to
34.0 MB across 24** (`data/_payload_audit.mjs`), with no feature lost and one bug fixed. The
reservoir file that survives is the repaired one: 0 invalid features, areas in km², and the published
figure alongside the measured outline.

### What earns its bytes

| Feature | Cost | Value |
|---|---|---|
| `rivers-cwc.geo.json` | 14.6 MB | the whole routing, release, catchment and crossing story. 400/400 dams route, 0 up-flow regressions. Irreplaceable |
| `dams.geo.json` | 2.9 MB | 13,002 searchable dams; the only route into every downstream feature |
| `watersheds.geo.json` | 5.8 MB | real published catchments, replacing a number that was 46× wrong. Fetched **only** when the storm block opens |
| `river-stats.json` | 2.0 MB | the panel's "this river is 79 km in 1 feature" line. Still the largest item per line of value it supports |

### What should be questioned

- **`subbasins.geo.json` 3.9 MB + `basins.geo.json` 1.4 MB = 5.3 MB** for the basin-view layer. Since
  the storm layer stopped using sub-basins, these now serve one click-to-highlight feature. That is a
  lot of bytes for a highlight. Either give it more to do (per-basin rainfall totals, reservoir counts
  per basin) or move it behind a chip so it is never fetched by default.
- **`india-rivers-west.geojson` 181 KB and `india-rivers.geojson` 83 KB** both exist alongside
  `rivers-cwc` — a third and fourth rendering of the same rivers. Candidates for consolidation.
- **The 3D-mountains view** (procedural terrain, ~500 lines in `app.js`) now overlaps the 3D map,
  which uses real DEM tiles and real buildings. Two 3D views is a maintenance cost paid for
  comparison, and the procedural one invents reservoir shapes — which is exactly the thing this
  project stopped doing when the real outlines arrived. *Recommendation: retire it, keep the view
  switch that reaches the real one.*

### The expensive lesson, priced

Every one of the four bugs in G1, G6 and G7 sat in the wiring, and every one cost more to find than it
would have cost to prevent. Two were invisible to my verification because verification itself was
blind. The cheapest available insurance is a smoke test that runs the real page and asserts the things
a user would notice — that the 2D popup has an area, that the 3D map exists at all, that the modules
the browser imports do not reach for `node:` — and it needs no screenshot tool to run.

---

## 4. Recommended order, by value per effort

1. **Smoke test the real page** (cheap, closes G6 and G7 going forward). Assert: `window.__map3d`
   exists after activation; no browser-executed module imports `node:*`; every data file the HTML
   names is fetchable; a reservoir feature exposes `area_km2`.
2. **Build script registry** (cheap, closes G9). One table: script → output file → what it measures.
3. **Verify the dam records** (expensive, closes G3 — highest consequence in the project).
4. **Slim the basin layer** (cheap, reclaims up to 5.3 MB): chip-gated, or extend it so the bytes earn
   themselves.
5. **Retire the 3D-mountains view** (moderate, removes invented geometry and ~500 lines).
6. **Dam catchments by flow accumulation** (expensive, closes G2 and makes the volume figures true
   rather than a floor).

---

## 5. Reproducing this

```
node data/_cost_audit.mjs       # bytes, lines, what is referenced
node data/_payload_audit.mjs    # which files the browser fetches, and the two-reservoir check
node data/_hydrology.test.mjs   # Curve Number arithmetic against hand-worked values
node data/_crossings.test.mjs   # reservoir crossings against known geometry
node data/_route_engine_check.mjs  # 400 dams: routing, up-flow regressions, timing
node data/_watershed_check.mjs  # published watershed areas vs the tile geometry
node data/_crs_check.mjs        # the India LCC inverse against the Dam file's own lat/lon
```