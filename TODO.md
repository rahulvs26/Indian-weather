# TODO — dam release that behaves like a real dam

Status legend: [ ] todo · [~] in progress · [x] done · [!] needs data/review

## A. Bugs reported
- [x] A1 Mettur ran upstream (v7.10) — flow axis + exact part-graph search; 0 up-flow regressions
- [x] B1 Tapping a dam in the 3D map did nothing — the dots are occluded by terrain at pitch, so
      MapLibre delivered no click. Now picked from the data in screen space (22 px), works at any
      pitch/zoom. Second-dam redraw was also gated on `isStyleLoaded()` (false while tiles stream).
- [x] B2 Capacity — the deck showed NO capacity at all (never 60 TMC). Now shows researched figures
      with a source URL per figure; Mettur hand-verified (93.47 TMC gross, 70.5 TMC after siltation);
      "not recorded in the sources used" where nothing is published.

## C. Release physics — a dam does not empty at once
- [x] C1 Rate-based release (m³/s or cfs), not "everything at t=0"
- [x] C2 User control: unit, rate, volume cap in TMC
- [x] C3 Per-gate control where a gate capacity is published (Sardar Sarovar: 30 gates, 3,000,000 cfs)
- [x] C4 Readout: volume, gates-open days, days to the sea, live-storage drawdown
- [x] C5 Upstream release → days to fill each downstream dam (travel + storage/rate)
- [x] C6 Everything labelled (illustrative)

## D. Trace direction
- [x] D1/D2/D3 Downstream ↔ upstream toggle; upstream walks to the recorded river source
      (Mettur 336 km back to 75.49E 12.40N)

## E. Performance
- [x] E1 Only the active course is expensive: buildings + all dam dots hidden during a run
- [x] E2 Below zoom 6 only dams ≥ 30 m are drawn (~700 instead of 13,002 dots)
- [x] E3 "Smooth (flat 2D)" switch drops the DEM and flattens the camera
- [x] E4 Glyph 404 flood fixed: style glyphs redirected to the working host → 0 console errors
- [!] E5 FPS numbers cannot be measured honestly in this headless background tab (rAF frozen);
      needs a check in a real foreground window

## F. UI behaviour
- [x] F1 Dam names only while releasing
- [x] F2 Card: capacity + source, gates, rate/volume, city crossings, readout, downstream table
- [x] F3 Source tags shown ("compiled, not re-checked" / "checked against the source page")

## G. Skill (global, reusable)
- [x] G1/G2 `map-study-deck` installed at `~/.config/opencode/skills/map-study-deck`
      (SKILL.md + references/traps.md, data-integrity.md, verify-recipes.md +
      scripts/splice_section.mjs, check_facts.mjs)
- [x] G3 Used for the v7.11–v7.13 slices (its checker found the unsourced reservoir-area fields)

## Data research
- [x] R1 `data/dam-facts.json`: 39 dams, 31 with a capacity figure, every field source-tagged
- [!] R2 **Review needed**: only Mettur is human-verified (`verify_status: "verified"`). The other
      38 rows were compiled automatically; some have gross/live swapped (Hirakud's "live 205.56 TMC"
      looks like the gross figure) and several are secondary sources. Fix by fetching each page by
      hand — start with the ones users ask about.
- [x] R3 Downstream reservoir order computed from geometry (no research needed)

## Definition of done — status
- [x] Tap any dam in 3D → course derived, no upstream error, names appear with the release
- [x] Release at a chosen m³/s → honest days-to-sea; gates adjustable per gate
- [x] Upstream trace reaches the source; downstream fill days reported
- [x] Map lighter during a run; user-facing flat mode
- [x] Skill installed globally and used

## Still queued
- [x] **Console + accuracy slice (v7.18)** — panel fits its container and folds; the drawn course is
      measured (segment sampling, not vertex sampling) and the source's holes are drawn as amber
      "not mapped" connectors instead of passing for river; Madurai and 47 other missing river cities
      added; wave speed, input limits and the cfs⇄TMC converter added.
- [x] **Performance sweep (v7.17)** — measured with the in-deck probe: the 3D map went from
      **47 ms/frame (~21 fps) to 16.6 ms (60 fps)** because `stepWind` kept drawing 340 particles
      into a `display:none` canvas. Off-screen pausing added (IntersectionObserver), route cache
      LRU-capped at 80, routing worker released after 5 idle minutes, camera easings no longer
      overlap. Measured and *dropped* as non-issues: the 131 style layers, terrain, and MapLibre's
      own render cost (`map._render` called 0 times in 2.5 s idle). Details and the remaining items
      in `PERF-GAPS.md`. **Open:** re-run `index.html?perf=1` on a real machine (this VM stalls).
- [ ] Heavier flood simulation from the user's own flood page (openswmm territory — needs the
      `app-credits` block if openswmm-derived code enters the deck)
- [ ] Hand-verify the 38 unverified dam-capacity rows page by page