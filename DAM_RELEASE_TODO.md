# DAM_RELEASE_TODO — dam-release water simulation (queued 2026-10-16; NOT yet designed)

**Goal (user's ask):** "if we release water from the dam it need to travel along the river
path and need to record like how many days it required the water to reach the sea."
Named target: the 3D map ("3d map also need to put the 3d map we need to simulate water").
Purpose: "help to understand" floods / river behaviour.

**How to use this file:** queued request capture — no tasks, no design decisions yet. On
pickup: run the house design conversation first (brainstorm → design → plan → build).
Do NOT implement straight from this file.

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
