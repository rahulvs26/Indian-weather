# GAP-ANALYSIS — what is still missing or weak, measured (v7.21)

Companion to `PERF-GAPS-v7.20.md` (frame budget) and `PERF-GAPS.md` (the v7.17 sweep). This file
covers everything else: correctness, data coverage, capability that is wired to nothing, and the
work the user has asked for that has not been built. Every line is a measurement or a code fact,
not an impression. Severity: **S1** breaks a promise the UI makes · **S2** visibly limits a feature ·
**S3** hygiene.

---

## S1 — the OSM shaping works for about one course in three

The v7.20 promise is "the line follows the real river". Measured over the dams that have researched
facts, asking the worker for a shape:

| dam | CWC course | shaped | gain | corridor used | outcome |
|---|---|---|---|---|---|
| Mettur | 325 km | **347 km** | 1.07× | 4.5 km | works |
| Hirakud | 400 km | — | — | 4.5 km | refused |
| Sardar Sarovar | 140 km | — | — | 4.5 km (also 9, 18) | refused |

**1 of 3 shaped.** The deck does the honest thing when it fails (it keeps the CWC line and says so),
but a feature that works for a third of its inputs is not finished.

Measured causes, in order of size:

1. **The corridor filter fragments the graph.** Sardar Sarovar: 784 segments kept inside 4.5 km form
   **764 separate components** — in a braided or deltaic reach the surviving pieces need not touch.
   Widening the corridor to 9 and 18 km did not reconnect them.
2. **The reachable network stops short of the end.** On Sardar Sarovar the nearest reachable node to
   the course's end is **77 km** away (58.6 km even at a 15 km corridor): OSM's lower Narmada is not
   carried as connected `waterway=river` geometry in those tiles.
3. **Tile zoom is capped by the tile budget.** A 400 km course must drop to z9 (77 tiles at z10, 612
   at z12), and OpenMapTiles generalises geometry with zoom, so long courses get the least detail
   exactly where they need the most.
4. **Overpass is not a reliable fallback** from this machine: `overpass-api.de` times out,
   `overpass.osm.ch` holds Switzerland only, two further mirrors refuse the request.

Fixes already shipped this round (each verified against `data/_osm-refine.test.mjs`): a separate
end-snap budget, end-node selection among *reachable* nodes, a corridor tapered near both ends, and
corridor widening at 1× / 2× / 4×.

**Recommended:** ship a real river-geometry extract as a static file beside `rivers-cwc.geo.json` —
HydroSHEDS or a national dataset, indexed in the worker like CWC is today. That removes the network
dependency, removes the zoom/generalisation problem, and would shape every dam. Until then the
"Real shape" toggle should be described in the UI as *best effort*.

---

## S1 — 35 of 39 dam rows still need a published reservoir level

`data/dam-facts.json`: 39 dams, and the slope→velocity feature (v7.19) needs a full-reservoir level.

| figure | filled | missing |
|---|---|---|
| gross capacity | 31 | 8 |
| live storage | 13 | 26 |
| gate count / capacity | 3 / 2 | 36 / 37 |
| `frl_m` (reservoir level, v7.19) | **4** | **35** |
| human-verified (`verify_status: "verified"`) | **1** (Mettur) | 38 |

Known-bad row still to fix: Hirakud's `live_tmc` 205.56 TMC looks like the gross figure. The mixed
`max_ow_level_m` field now has a `max_ow_level_kind` note per row, but 8 rows are still
"kind unconfirmed".

Effort: ~30 min per dam of reading and cross-checking, so this is a research task, not a code task.
Priority order should follow what users actually open: Mettur (done), Sardar Sarovar (done), Bhakra
(done), Tehri (done), then Hirakud, Nagarjunasagar (done), Srisailam, Idukki, Indira Sagar.

---

## S2 — catchments exist only as basin polygons, so there is nothing to put a cloud over

The user asked for reservoir catchments, a rain cloud sized to intensity, and runoff into the streams.
What the repo actually has, measured:

| file | features | keys | used by |
|---|---|---|---|
| `data/subbasins.geo.json` | **98** | `ba_name`, `sub_basin` | `app.js` (2D map) |
| `data/basins.geo.json` | **25** | `ba_name`, `area_sqkm`, `state` | `app.js` |
| `data/reservoirs.geo.json` | 5,162 | `res_name`, `river`, `basin`, `area` | `app.js` |
| `data/riverbanks.geo.json` | 1,032 | `rivname` | **nothing** |

98 sub-basins cannot be per-dam catchments: the Vaigai sub-basin contains every dam on the Vaigai and
its tributaries. So **the catchment feature cannot be built from what is here** — it needs either a
sub-basin polygon dataset with per-dam allocation, or a derived catchment from the river network
(upstream graph walk + buffer), which would be explicitly illustrative, not an official boundary.

The rainfall→runoff→cloud feature is therefore **not started**, and it is not a small piece of work:
it needs an event rainfall source (the deck holds monthly averages in `rain-state-avg.json`, which is
not an event), a runoff method with cited parameters, and the catchment geometry. EPA SWMM would do
the hydrograph properly but is a numerical engine and would need the `app-credits` block.

---

## S2 — two data files are wired to nothing

- `data/riverbanks.geo.json` — 1.032 MB, 1,032 features, **not referenced by any source file**. It
  is riverbank geometry (the wide, braided outline) and would be genuinely useful for the S1 shaping
  problem above, or for drawing the valley floor. Either wire it in or delete it.
- `data/live.example.json` — a template for a live-data feed, referenced 0 times. Keep as a template
  and document it, or delete.

Neither costs runtime (a file nothing fetches), so this is repo hygiene, not performance.

---

## S2 — the derived course is honest but still schematic where CWC is

v7.18 disclosed the CWC schematic line as amber "not mapped" connectors, and v7.20 shaped the course
on the map's own OSM geometry where possible. The residual, measured over the 400 tallest dams
(`node data/_route_engine_check.mjs`):

- **0** up-flow regressions; 400/400 routed at 12 km snap; ~11 ms per dam.
- Course length drawn vs the mapped channel: p90 0.73 km off, **max 7.37 km** across 11,997 dams.
- Tehri still carries **203 connectors** (longest 34 km) and Hirakud 47 — the Ganga plain's
  digitisation is coarse, and no solver can invent what the source does not contain.

So the honest statement is: *where the shape pass succeeds the line follows the real river; where it
does not, the line follows the schematic source and the card says so.* Closing this fully is the same
static-extract item as S1.

---

## S3 — accessibility and hygiene

- **`prefers-reduced-motion` is honoured in 3 places** (`app.js:5/524/621`, `map3d.js:34`,
  `styles.css:138`) but not in the full-screen transition or the release camera — the old C3 item,
  still open and worth doing for accessibility rather than speed.
- **46 `aria-*` attributes and 0 `<img>`/`alt=`** — the deck is vector/SVG built, so there is no
  `<img>` to describe; the gap is figure descriptions for screen readers, which exist as text.
- **Five throwaway debug scripts remain** in `data/`: `_debug_feature.mjs`, `_debug_straight.mjs`,
  `_debug_walk2.mjs`, `_dp_check.mjs`, `_hop_source.mjs`. Two are useful regression tools
  (`_dp_check`, `_hop_source`), three are one-off debugging and should go.
- **`PERF-GAPS.md` (v7.17) and `PERF-GAPS-v7.20.md` overlap.** Merge them so there is one
  performance document; the v7.20 file supersedes it except for the environment caveat.

---

## S3 — measured and *not* gaps (so nobody re-investigates them)

- Frame budget: **p50 16.6-16.7 ms (60 fps)** in every state, including profile mode and during a
  release. Terrain, buildings, 13,002 dam dots, city labels, the wet line and the camera follow are
  each free when switched off.
- A full DEM profile pass is 639 elevation lookups in **2 ms**; the slope feature is not a cost.
- Card writes during a release: 17/s, no frame effect (closes the old C2 item).
- Route solve: ~11 ms per dam, worker off the main thread; route cache LRU 80, OSM cache 24 entries,
  worker terminated after 5 idle minutes; heap 145-179 MB with no unbounded growth path.
- Style curation: 133 layers, measured repeatedly as irrelevant to frame time — **do not** spend
  effort here.

---

## Ranked next actions

1. **Static river-geometry extract** (closes S1 shaping coverage and the residual schematic courses).
   One download step, then it is offline and fast like `rivers-cwc.geo.json`.
2. **`frl_m` research for the next 6-8 dams** the users open most (unlocks slope→velocity for them).
3. **Catchment decision** — either source per-dam catchments, or take the derived-and-labelled route
   and build the cloud/rainfall layer on top of it. Then, and only then, the second opt-in hydrology
   layer.
4. **Merge the two perf documents**, delete the three one-off debug scripts, wire or delete
   `riverbanks.geo.json`.
5. **`prefers-reduced-motion` for the full-screen transition and the release camera.**
6. **Hand-verify the 38 dam-facts rows**, starting with Hirakud's suspect live storage.