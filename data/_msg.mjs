/* v7.22v — commit message in a file: PowerShell mangles quotes and parentheses inside a long git -m. */
import { writeFileSync } from "node:fs";

writeFileSync("data/_msg.txt", `v7.22v: gap analysis and value engineering, with 9.3 MB of measured waste removed and a regression fixed

GAP-ANALYSIS.md, rewritten against measurements rather than memory. Two scripts produce the numbers:
data/_cost_audit.mjs for bytes and lines, data/_payload_audit.mjs for who actually fetches what.

A REGRESSION I INTRODUCED, FOUND BY THE AUDIT RATHER THAN BY A USER. v7.22o wrote the repaired
reservoir file as reservoirs.geojson while the 2D map reads reservoirs.geo.json - two copies of the
same 5,160 reservoirs - and edited the 2D popup to print area_km2, a field only the new copy has. So
clicking any reservoir on the 2D map showed no area at all. I fixed the units last turn and broke the
field with it, and it survived a full verification pass because the popup is only built on click and
every check I ran was on the 3D map. One file now; the stale one is deleted; app.js points at the
repaired one and the audit asserts they agree.

VALUE ENGINEERING - 9.3 MB removed, no feature lost:
  river-stats.json   5,209 -> 2,064 KB. 27,479 rivers each carried a full basin name and a full tile
                     name; there are 25 basins and 96 tiles, so the same text was written out 27,479
                     times. Interned into two dictionaries, and the tiles array - 1,972 KB, of which
                     the panel shows one entry - reduced to that entry.
  reservoirs.geo.json  2,272 KB deleted, duplicate.
  riverbanks.geo.json  1,952 KB deleted, referenced by nothing since it was added.
  Fetchable payload: 39.3 MB across 25 files -> 34.0 MB across 24, re-measured after the change.

WHAT THE ANALYSIS FOUND, ranked by consequence:
  G3  1 of 39 dam records hand-verified. Every figure the deck prints about a dam comes from that
      file. Hirakud's live_tmc still looks like the gross figure in the wrong field and eight rows
      record the kind of number unconfirmed. The highest-consequence gap in the project.
  G6  The 3,356 lines of app.js and map3d.js have no tests. All eight suites cover data and engines.
      Every defect that ever reached a user was in the untested half - the dead search box, the four
      MapLibre property traps, the node:fs import that deleted the 3D map, the two-reservoir split,
      the contrast rule that styled a container instead of a span. The tests catch bad arithmetic; the
      shipped bugs are all wiring and lifecycle.
  G7  Nothing in this project can see itself. The screenshot tool refused throughout the reservoir and
      catchment work, readPixels returns black because MapLibre is not created with
      preserveDrawingBuffer, and three of the six MapLibre query APIs return 0 for GeoJSON sources in
      this build - including a layer that demonstrably draws. So the visual state of every 3D change
      rests on the user looking at it. This is the blind spot that let G1 through.
  G2  The catchment is the watershed UNIT containing the dam, not the dam's catchment - Bhakra is
      966 km2 against a published 4,480 km2 - so every volume and peak figure is a floor. The card
      says so; closing it needs flow accumulation onto the river network. Not started.
  G4  Mettur's reservoir is 123.86 km2 in the WRIS outline and 42.5 km2 in the dam record, nearly 3x,
      and nothing explains the difference. The 3D card prints both; the 2D popup prints one.
  G5  No rainfall events anywhere - monthly averages and monsoon indices only, so the storm panel has
      no observed counterpart to check itself against.
  G8  catchment_km2 is wired into the panel and empty in every row. Correct to leave null, but the
      panel asks the user to type a figure without saying why it cannot supply one.
  G9  ~2,900 lines of build script in data/ with no registry saying which produces which.

QUESTIONED, NOT ACTED ON: subbasins.geo.json plus basins.geo.json are 5.3 MB for one click-to-
highlight layer, and since the storm layer stopped using sub-basins they serve nothing else. Either
give that layer more to do or chip-gate it. Also flagged for a decision: the 3D-mountains view now
overlaps the 3D map, and the procedural one invents reservoir shapes - the exact thing this project
stopped doing when real outlines arrived. Retiring it would remove ~500 lines and a source of
invented geometry.

RECOMMENDED ORDER, value per effort: a smoke test on the real page first, which needs no screenshot
tool and would have caught G1 and the node:fs import; then the build-script registry; then verifying
the dam records; then the basin layer; then retiring the 3D-mountains view; then dam catchments by
flow accumulation.

The audit scripts themselves were made tolerant of the files they exist to notice being deleted -
the first run of _payload_audit.mjs crashed on the reservoir file the pass had just removed.

Verified live after the pass: the 2D reservoir feature exposes area_km2 (Mettur Dam 123.86 km2,
mapped 128.25), the storm panel still resolves Manimuthar to WRIS watershed C19VAI21 at 612 km2, the
crossings still read Kodayar-I at 20 km and Pechipparai at 35 km, and there are 0 console errors
apart from the pre-existing Overpass CORS refusals.
`);
console.log("written");