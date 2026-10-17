/* commit message in a file: PowerShell mangles quotes and parentheses inside a long git -m */
import { writeFileSync } from "node:fs";
writeFileSync("data/_msg.txt", `v7.22w: performance measured, a smoke suite for the defects that actually reach users, and the hosting answer

WHY A SMOKE SUITE. Every defect that ever reached a user in this project was in the wiring, and all
eight existing suites covered arithmetic and engines:
  the dam search box did nothing until an unrelated checkbox was ticked
  four MapLibre paint properties that do not exist in the installed version
  a data/_crossings.mjs import of node:fs, which stopped the entire 3D map from existing
  two files holding the same reservoirs, so the 2D popup printed no area
  a .damLim.warn rule styling the container while the spans inside it went unstyled
data/_smoke.mjs checks those classes of failure statically, in about a second, with no browser:
  no node: import in any module the browser runs, comments stripped first
  every data path named in code exists on disk
  the fields a popup prints exist in the file it reads
  that file has no unclosed or short rings (MapLibre accepts invalid GeoJSON and draws nothing)
  the storm panel's fields exist in river-stats.json
  .damLim .warn exists as a span rule, and #B45309 is gone
  every <script src> carries ?v=, so a stale cache cannot ship
  fetchable payload under 40 MB with no file over 20 MB
36 checks, all passing. It found two defects in itself on its first run - it flagged
data/_crossings.mjs for a node:fs mention that was only in a comment, and I had left a nonsense
placeholder assertion in it - which is why it now strips comments before checking.

data/_run_tests.mjs runs all six non-browser suites and prints one table. 6 of 6 pass.

PERFORMANCE.md, measured in a real browser rather than estimated:
  first view        first contentful paint 876 ms, DOMContentLoaded 655 ms, no long tasks
  3D map idle       60.0 fps, median frame 16.7 ms, p95 17.2 ms, worst 17.4 ms, nothing over 50 ms
  settled with dam  59.5 fps, median 16.7 ms, worst 33.3 ms, nothing over 50 ms
  ONE REAL DEFECT   selecting the first dam stalls the main thread: 1 fps, 1,016 ms median frame,
                    heap 108 MB to 200 MB. It is main-thread JSON, not the map - the route is
                    already parsed in the worker, but 2.1 MB of reservoirs and 5.8 MB of watershed
                    boundaries are parsed on the main thread and then indexed.
                    The fix was tried and REVERTED: deferring the watershed fetch with
                    requestIdleCallback does not run in a background or throttled tab, so the
                    crossings line came back empty. The right fix is to move both parses into
                    dam-router-worker.js, which already exists. Recorded as open, not shipped.
  TWO MISREADINGS CORRECTED, with the control measurement kept next to the result:
    "the 2D map runs at 22.9 fps" - a bare empty requestAnimationFrame loop on the same page measures
      a 49.9 ms median frame, because the harness browser has document.hasFocus() === false and
      throttles rAF to 20 Hz. The instrument was the problem, not the deck.
    "long tasks: none" - true, and also a limitation: the observer is installed after load.
  PAYLOAD, and what a phone pays: 34.0 MB the app can fetch; the 14.6 MB river file alone is about
    36 seconds at 400 kB/s. That is the largest risk in the project and the fix is not compression,
    it is not asking for the rivers until the dam console is opened.

HOSTING.md - yes, GitHub Pages hosts this, free, with no build step. 35.7 MB tracked against a 1 GB
limit; Shape files/ and pdf/ are already gitignored and must stay local; the deck needs OpenFreeMap,
Mapterhorn and OpenStreetMap at runtime, so those outages would affect the 3D map only. A custom
domain needs no hosting bill - buy the name (about 700-1,500 rupees a year for .in or .com), add a
CNAME file, and GitHub issues the HTTPS certificate automatically. Cloudflare Pages or Netlify are the
alternatives and serve these files identically, since there is no build step. The doc ends with a
pre-publish checklist, and says plainly that a human should click a dam and look at it, because the
automated checks cannot see whether anything is drawn in the right place.
`);
console.log("written");