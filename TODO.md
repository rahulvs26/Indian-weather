# TODO — dam release that behaves like a real dam

Status legend: [ ] todo · [~] in progress · [x] done · [!] blocked/needs data

## A. Bugs reported
- [x] A1 Mettur ran upstream (v7.10) — flow-axis + exact part-graph search; 0 up-flow regressions
- [ ] B1 **Tap a dam dot in the 3D map does nothing** — the card says "tap a dot on the map" but
      map3d.js has no map click handler for `dam-pts` (only the 2D Leaflet map has popups).
      Add pick-on-click/tap (with hover cursor) for `dam-pts`, then select + derive.
- [ ] B2 **Capacity shown wrong / missing** — the app shows no capacity at all (only dam height), so
      "60 TMC" is not in the deck. Add researched gross/live storage per dam with a source for each
      figure, and show "not recorded in the sources used" where nothing is published.

## C. Release physics — a dam does not empty at once
- [ ] C1 Rate-based release. Release is a DISCHARGE (m³/s or cfs), not the whole pool at t=0.
- [ ] C2 User control: units (m³/s | cfs), rate value, duration or volume cap.
- [ ] C3 Per-gate control: gates × opening %, each gate at 100% = its researched gate capacity
      (cfs); the headline rate is the sum of the open gates.
- [ ] C4 Readout: volume released (TMC), days to reach the sea at that rate, reservoir level drawdown
      (from live storage), and what is left.
- [ ] C5 Upstream release → **how many days to fill the next downstream reservoir** (fill routing).
- [ ] C6 Rates must stay labelled (illustrative) — they are user inputs, not measurements.

## D. Trace direction
- [ ] D1 Toggle: trace DOWNSTREAM (to the sea) or UPSTREAM (to the reservoir origin / source).
- [ ] D2 Upstream walk: reverse direction solver, show the source (recorded st_ of the river).
- [ ] D3 When tracing upstream, do not run a release animation backwards without saying so.

## E. Performance (3D map is not smooth)
- [ ] E1 Only the SELECTED river course gets the expensive rendering; everything else stays
      low-poly 2D lines (no per-feature 3D extrusion, no second terrain).
- [ ] E2 Drop the heavy global fill-extrusion/terrain cost when a dam run is active, restore after.
- [ ] E3 Measure frame cost before/after (no regression on the non-dam views).
- [ ] E4 Keep the rest of the deck (2D map, layers) cheap.

## F. UI behaviour
- [ ] F1 Dam names show ONLY while water is being released (not the full label set).
- [ ] F2 Card shows: dam, capacity (with source), river, course length, cities, release controls,
      live readout.
- [ ] F3 Researched-data badges: every capacity/gate number carries its source; unknowns say so.

## G. Skill (global, reusable across projects)
- [ ] G1 Author a global skill: "interactive study deck" build recipe — MapLibre 3D + 2D Leaflet +
      on-demand worker data + truth-labelled derived values + verification recipes.
- [ ] G2 Save it to the global skills directory so every project can use it.
- [ ] G3 Use the skill for the rest of this build.

## Data research (blocks B2, C3, C5)
- [~] R1 Dam storage capacities (gross / live, TMC) + spillway gate counts + outlet capacities
      (cfs) for ~40 major dams, each figure with a source URL.
- [ ] R2 Downstream reservoir order (which reservoir is downstream of which) for fill routing.

## Definition of done
- [ ] Tap any dam in 3D → course derived, no upstream error, names appear with the release.
- [ ] Release at a chosen m³/s → honest days-to-sea; gates adjustable per gate.
- [ ] Upstream trace reaches the source; downstream fill days reported.
- [ ] Map stays smooth during a run (measured), heavy rendering limited to the active course.
- [ ] Skill installed globally and used for the later slices.