# `data/` — what each file is, where it came from, and who owns it

Registry of the 47 data files the site ships. Read with `CITATIONS.md` (the
full bibliography) and `COPYRIGHT-AUDIT.md` (what is and is not clear to
publish).

Two rules this folder follows, which is why most files can be audited at all:

1. **Every generated file names its own source.** GeoJSON carries a top-level
   `note`; other JSON carries `meta.note`. If you find a file here without one,
   that is a bug — report it.
2. **Measured and published are kept apart.** Where a published figure exists it
   is copied verbatim into its own field. Where this project measured something
   itself, the field name says so (`area_km2` published vs `area_geom_km2`
   measured vs `km2` derived from geometry).

---

## Provenance groups

### WRIS / IndiaWRIS — via `ramSeraph/indian_water_features`
Release `hydro-boundaries` (watersheds, rivers) and `waterbodies` (reservoirs).
**CC0 with attribution to datameet and the original government source.** Derived
here by thinning and by measurement; see each file's `note`.

| File | Size | Features | What it is |
|---|---|---|---|
| `rivers-cwc.geo.json` | 14.6 MB | 30,395 | CWC/WRIS river network. The largest file and the source for every measured length |
| `watersheds.geo.json` | 5.8 MB | 4,560 | WRIS watershed polygons |
| `watershed-areas.json` | 285 KB | 4,560 | `area_km2` **as published by the source** — never re-derived from the polygon |
| `reservoirs.geojson` | 2.2 MB | 5,160 | reservoir outlines. `area` (hectares, source's own), `area_km2` (÷100), `area_geom_km2` (measured) |
| `dams.geo.json` | 2.9 MB | 13,002 | CWC/WRIS dam, barrage and weir points |

### User-supplied GIS — from `Shape files/`, git-ignored
Derivatives only. The originals are never published.

| File | Size | Features | What it is |
|---|---|---|---|
| `subbasins.geo.json` | 3.9 MB | 98 | CWC sub-basin polygons |
| `basins.geo.json` | 1.4 MB | 25 | CWC basin polygons |
| `glacial.geo.json` | 613 KB | 522 | glacial lake polygons |
| `tn-water.geo.json` | 492 KB | 1,771 | Tamil Nadu waterbodies |
| `subbasin-areas.json` | 16 KB | 123 | areas **computed geodesically** from the polygons above (sphere R=6371.0088 km), plus `publishedKm2` where the shapefile stated one |

### Open data
| File | Size | Features | Source |
|---|---|---|---|
| `india-states.geo.json` | 204 KB | 41 | **GADM v4.1** — see `COPYRIGHT-AUDIT.md` F1. Redistribution is not permitted by its licence |
| `india-detailed.geo.json` | 280 KB | 1 | India outline + coast, used for the coastal routing test |
| `india-rivers.geo.json` | 83 KB | 109 | Natural Earth river centrelines (public domain) |
| `india-rivers-west.geo.json` | 181 KB | 633 | west-flowing subset, ≥30 km, Douglas–Peucker ≈0.9 km |

### Measured by this project
These are *this site's* own outputs. They are not a source's data; they are
measurements taken from a source's data, and they say so.

| File | Size | Records | Built by | Method |
|---|---|---|---|---|
| `river-stats.json` | 2.1 MB | 27,479 | `_gen_river_stats.mjs` | haversine over `rivers-cwc.geo.json` coordinates + WRIS tile areas. Basin/tile names interned |
| `rain-state-avg.json` | 7.5 KB | 36 | `_gen_rain_avg.mjs` | mean of IMD subdivision rainfall 1901–2015, area-weighted to states. **A 1901–2015 record mean, not the official 1971–2000 LPA** |
| `dam-route-hirakud.geo.json` | 1.9 KB | 1 | `_gen_dam_route.mjs` | course derived from the CWC Mahanadi centreline. **Travel speed illustrative** |
| `dam-facts.json` | 58 KB | 39 | hand-compiled | published capacities and gate data, each figure carrying its source URL. Null = not stated in the sources used |

### The site's own authored content
| File | Size | What it is |
|---|---|---|
| `phenomena.json` | 31 KB | 41 climate phenomena: geometry, season window, sourced `info` text |
| `months.json` | 7.8 KB | 12-month wind + rainfall model. No invented mm values — rainfall is qualitative |
| `mjo.json` | 1.3 KB | 8 MJO phases with their India effects. Feeds both the map layer and the section 2 article |
| `content.json` | 4.9 KB | cards, isochrones, thresholds, LPS counts, flashcard deck, quiz |
| `iod_events.json` | 2.1 KB | 13 landmark IOD events. **A study selection, not a 50-year series** |
| `radars.json` | 1.6 KB | 23 DWR stations, city-approximate coordinates |
| `river-cities.json` | 13 KB | 128 city reference points, used **only** to label which cities a course passes |
| `embedded.js` | 520 KB | the site's own data inlined as `window.IND_DATA` for offline/`file://` use |
| `_mjo-article.mjs` | 7.4 KB | prose for the section 2 article (shipped as a module, authored here) |
| `live.example.json` | 0.9 KB | key placeholders. Real keys live in the git-ignored `live.json` |

---

## Scripts

| Script | Reads | Writes |
|---|---|---|
| `_gen_phenomena.mjs` | authored list | `phenomena.json` |
| `_gen_rain_avg.mjs` | `_src/` rainfall CSV | `rain-state-avg.json` |
| `_gen_river_stats.mjs` | `rivers-cwc.geo.json` | `river-stats.json` |
| `_gen_watersheds.mjs` | WRIS vector tiles | `watersheds.geo.json`, `watershed-areas.json` |
| `_slim_watersheds.mjs` | `watersheds.geo.json` | `watersheds.geo.json` (thinner) |
| `_gen_subbasin_areas.json` | `subbasins.geo.json` | `subbasin-areas.json` |
| `_gen_reservoirs_km2.mjs` | `reservoirs.geojson` | same, with `area_km2` |
| `_repair_reservoirs.mjs` | `reservoirs.geojson` | same, invalid rings fixed |
| `_gen_dam_route.mjs` | `rivers-cwc.geo.json` | `dam-route-hirakud.geo.json` |
| `_add_frl.mjs`, `_reservoir_units.mjs`, `_add_reservoir_layers.mjs` | `dam-facts.json`, reservoirs | add FRL / unit fields |

**`gen` means build from source. The rest are one-shot migrations** — they were
run once to transform a file and are kept because the transformation they did is
not obvious from the output. They are not part of any test.

### Libraries that run in the browser
| File | Role | Node only? |
|---|---|---|
| `_catchment.mjs` | `loadWatersheds` / `watershedAt` — smallest containing watershed unit | browser |
| `_crossings.mjs` | reservoir crossings on a river course | browser |
| `_hydrology.mjs` | NRCS Curve Number depth + rational peak | browser |
| `_route-engine.mjs`, `dam-router-worker.js` | dam routing | browser + worker |
| `_mvt.mjs` | vector-tile reader | browser |
| `_osm-refine.mjs` | OpenStreetMap corridor refinement | browser |
| `_shp.mjs` | shapefile + dbf reader, India LCC inverse | **Node only — must never be imported by browser code** |

> `_shp.mjs` reads `node:fs`. A browser module that reaches it once deleted the
> entire 3D map with a CORS error that pointed at the wrong file.
> `data/_smoke.mjs` now fails the build if a browser entry point can reach it.

### Tests
`_run_tests.mjs` runs six suites: static smoke (39 checks), hydrology (44),
crossings (11), route engine, OSM refiner, projection. `_probe.mjs` is the
browser-side performance and smoke probe — it needs a running page, so it is not
a child process. `_smoke.mjs` is the one that catches wiring mistakes; each of
its checks maps to a defect that reached a user.