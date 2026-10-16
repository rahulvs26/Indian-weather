# DAM_RELEASE_TODO — dam-release water simulation (queued 2026-10-16; NOT yet designed)

**Goal (user's ask):** "if we release water from the dam it need to travel along the river
path and need to record like how many days it required the water to reach the sea."
Named target: the 3D map ("3d map also need to put the 3d map we need to simulate water").
Purpose: "help to understand" floods / river behaviour.

**How to use this file:** queued request capture — no tasks, no design decisions yet. On
pickup: run the house design conversation first (brainstorm → design → plan → build).
Do NOT implement straight from this file.

## §1 Design + as-built (v7.6, shipped 2026-10-17)
The v7.6 session was handed the design defaults directly (venue, hero route candidates,
kinematic model, readout) — this section records what shipped and what the data forced.
- **Venue:** the 3D map ONLY (`map3d.js`, MapLibre view, hook `__map3d`). The 2D map,
  the 3D mountains view (`__t3`), the phenomena module and the rain systems are untouched.
- **Hero route:** Hirakud → Mahanadi → Bay of Bengal. What the data forced: the Natural
  Earth file `data/india-rivers.geo.json` has NO feature named "Mahanadi" (its NE
  "Mahäna Nadï" segments are upstream/degraded), so the route was derived from the repo's
  CWC network instead — `data/rivers-cwc.geo.json`, feature `rivname="Mahanadi River"`
  (subbasin "Major River", recorded len 1045.7 km, origin→sea). That feature is a 30-part
  unordered MultiLineString; `data/_gen_dam_route.mjs` walks it greedily downstream from
  the point nearest the Hirakud dam (hit distance 0.18 km) to the recorded sea end
  (86.713, 20.295 — Mahanadi delta, near Paradip), snapping the exact dam point from
  `data/dams.geo.json` ("Hirakud Dam", OD, river Mahanadi) as the first vertex.
  Output: `data/dam-route-hirakud.geo.json` — 53 points, **414.8 km**, provenance in
  properties. Sanity (drive-by distances to the route): Sambalpur 2.2 km, Cuttack 3.0 km,
  Paradip 0.9 km, recorded sea end 0.6 km — the path follows the real bends.
- **Model:** kinematic travel wave — the front advances along the polyline at ONE constant
  **illustrative** speed ≈1.5 m/s (flood-wave celerity ballpark, NOT measured for this
  release) → speedKmDay = 129.6 km/day → **arrival ≈3.2 days**. Travel only; no inundation,
  no hydraulics. openswmm/SWMM NOT touched in v1 (the credit block there applies only if
  that code is ever actually reused; none was).
- **The record:** running "Day N" clock + "km / total" while the wave travels; final readout
  "Reached the sea in ≈3.2 days (illustrative)". Small dark card + "Release water" button
  (`#damUI`, `#damBtn`, 3D map view only), journey plays in 24 s real time, re-run via the
  same button (reset → start).
- **Render:** four GeoJSON sources/layers in `map3d.js` — `dam-route-line` (teal dashed
  full route, drapes over terrain), `dam-wet-line` (brighter teal, re-`setData` sliced at
  the advanced km), `dam-head-halo/dot` (front marker), `dam-end-dam/sea` (endpoint dots).
  Hook `window.__dam = {start(),reset(),state(),route()}`; `state()` =
  {running, day, km, totalKm, arrivalDays, reached}.
- **Open for v2:** month-aware speed (monsoon vs dry), more hero routes (Narmada/Krishna
  verified in the NE file), a day-per-second timeline scrub, maybe the real marcher later.

## What the deck already has that this can ride on
- Rivers: `data/india-rivers.geo.json` (109 Natural Earth majors), `data/india-rivers-west.geo.json`
  (633 CWC west-flowing lines — live in 2D and 3D), `data/rivers-cwc.geo.json` (full CWC network,
  fetch-only ≈14.6 MB).
- Dams: `data/dams.geo.json` — 13,002 CWC/WRIS points, 6,333 recorded heights (rest = class
  medians, illustrative). The 3D relief already places a wall + reservoir at every dam and stores
  an oriented gate parameter `t` on the nearest river line (`relGates` — see HANDOFF "3D DAM PARAMS").
- Motion: 3D river packets already flow on draped lines under a month-typical release factor
  `relOf(m)` (illustrative). The release GATING exists conceptually; missing is a routed wave
  with a travel clock and a sea endpoint.
- Venues: 2D Leaflet map · 3D mountains (three.js `__t3`) · 3D map (MapLibre, `map3d.js`,
  `__map3d`). The 3D map would need its own river layers — it currently shows only basemap,
  terrain and buildings.

## Reference (user's prior work + upstream)
- HydroCouple/openswmm.engine (Apache 2.0) — explicit local-inertial marcher; branch `swmm6_rel`,
  commit `c23ecd53`, engine 6.0.0-alpha.4. The user has ALREADY translated InertialKernels.hpp,
  InertialEdges.cpp, ExplicitInertialSolver.cpp and MeshBuilder.cpp to JS + WGSL once, for a
  standalone flood page ("alpha of an alpha", 2026-10-08). Ask to see that page — its solver may
  be reusable, or its approach copied at lower fidelity.
- If any openswmm-derived code enters this deck → uniform credit block (global `app-credits`
  skill: authors · scheme / source + branch + commit + version + license / changes made / not
  endorsed) + a CITATIONS.md entry. No engine binary.

## Open questions for the design session
1. Venue(s): the 3D map was named — but should the readout live in the 2D map? Does the 3D
   mountains view (draped rivers) get the wave too?
2. Scope: one hero dam (e.g. Hirakud–Mahanadi, Sardar Sarovar–Narmada, Nagarjuna Sagar–Krishna)
   or any dam? What happens when a path leaves the deck's area or hits a data gap (5 rivers have
   no centerline: Kosi, Luni, Damodar, Subarnarekha, Vaigai).
3. Model fidelity: kinematic travel-wave on the real polylines (light, illustrative) vs the
   local-inertial marcher (heavy, but proven in the user's alpha). What backs the travel speed —
   measurement, typical values, or an explicit "(illustrative)" label?
4. The record: "days to reach the sea" — running day clock + arrival day; where shown (readout
   card / HUD / timeline)? Does wave speed follow the month (monsoon vs dry season)?
5. Flood vs travel: the user said "simulate flood or rivers" — is inundation extent in scope,
   or river travel only?
6. Sea endpoints: identify each candidate route's true sea mouth (NE 109 reach the sea; the CWC
   network needs a connectivity pass).

## Standing constraints (from HANDOFF)
- No invented data; every number sourced or labelled "(illustrative)".
- Bump `?v=` on every changed asset; verify live before claiming done.
- Tiles: Esri only (2D) — never OSM; keep test reloads minimal.
