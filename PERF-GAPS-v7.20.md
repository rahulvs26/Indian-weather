# PERF-GAPS v7.20 — measured after the OSM shaping pass

Run: one tab, 3D map active, `window.__dam.perf(3)`, Hirakud (415 km) / Tehri (2,012 km) /
Srisailam / Nagarjunasagar. Same VM caveat as v7.17 (Intel HD 520 via ANGLE/D3D11, unreliable
frame pacing) — read these as "what changed", not as absolute numbers on the user's machine.

## Frame times

| state | p50 | p95 | max | vs v7.17 |
|---|---|---|---|---|
| 3D map idle | 16.7 ms | 17.5 ms | 188 ms | unchanged |
| dam mode, 13,002 dots | 16.6 ms | 18.6 ms | 91.8 ms | unchanged |
| route drawn | 16.7 ms | 21.7 ms | 135.4 ms | unchanged |
| during a release | 16.6 ms | 17.7 ms | 18.3 ms | unchanged |
| during a release, **profile mode on** | 16.7 ms | 17.3 ms | 17.9 ms | new — no cost |
| spike hunt over 580 frames (incl. dam switch) | — | — | 72 ms | 3 frames > 50 ms, 0 > 100 ms |

**p50 16.6-16.7 ms (60 fps) in every state.** The v7.19 slope profile and the v7.20 OSM shaping added
nothing to the frame budget.

### Pre-warm (shipped this round)

Resting a pointer on a search result for 900 ms now pre-warms that dam's course **and** its OSM shape,
so opening it is instant instead of an 11-21 s network wait. Measured: the CWC course went from
725 ms to **178 ms** on a pre-warmed dam (the routing result is cached too), and a cached shape
applies in ~0.4 s. Nothing is spent if the pointer only passes over, and the worker does the work
off-thread.

### Functional gap found while measuring — not a speed problem

**Sardar Sarovar's course cannot be shaped from the map's tiles.** Traced rather than guessed:

| stage | measured |
|---|---|
| tile fetch | 50 tiles, **101 ways** — succeeded |
| corridor filter at 4.5 km | **784 segments kept** |
| graph connectivity | **764 nodes in 764 components** — the ways do not share vertices |
| start snap | 0.28 km (a way sits at the dam) |
| nearest reachable node to the course end | **77.1 km** (corridor 4.5) / **58.6 km** (corridor 15) |

OSM's lower Narmada is not carried as connected `waterway=river` ways in those tiles, so no path
exists. Three fixes went in, all verified against the fixture test:

1. `endSnapKm` — the end snap budget is separate from the dam's (default 3×), because a river's
   *mapped end* can sit kilometres from the mapped channel while the dam sits on it.
2. **Reachable-end selection** — the end node is now chosen among nodes Dijkstra actually reached,
   rather than demanding a path to the node nearest the end point.
3. **Tapered corridor** near both ends (default 25 km or 20 % of the course), so a channel that OSM
   maps further out near a mouth can still be joined without loosening the middle of the reach.

None of the three was sufficient on its own for the Narmada, which is the honest finding: **the
refusal is correct behaviour**, not a bug. So the worker now falls back to Overpass when the tiles
cannot shape a course, and if that also fails the card says which reason it was
("No OpenStreetMap path for this course (…) — showing the CWC schematic line") instead of a bare
"unavailable". Verified: Vaigai still shapes from tiles in 626 ms, 0 console errors, p50 16.7 ms.

## Measured and dismissed (negative results — don't re-derive these)

- **Terrain is still free.** `setTerrain(null)` during a live release: 16.6 → 16.6 ms.
- **Buildings free.** Hiding `deck-3d-buildings`: 16.6 → 16.7 ms.
- **13,002 dam dots free.** Hiding `dam-pts`: 16.6 → 16.7 ms.
- **City labels, the wet line, and the camera follow are all free**: 16.6 ms in every case.
- **The DEM profile is cheap.** A full pass is 71 samples × 9 neighbourhood lookups = 639
  `queryTerrainElevation` calls in **2 ms**. Selecting Tehri costs 3,834 lookups (the retry chain
  rebuilds up to 4×) — still a few ms, hidden by the network wait.
- **`damProfMode` costs nothing.** Profile mode re-derives the day/km mapping every tick; measured
  identical p50 (16.7 ms) and p95 (17.3 vs 17.1 ms).
- **Card writes are negligible.** A 4-second run on the 2,012 km Tehri course: 68 `textContent`
  writes (17/s) and 2 `innerHTML` (0.5/s) across `damDay`/`damStat`/`damRead`/`damLim`. That is
  ~17 Hz against an 8 Hz tick, i.e. the tick writes the day clock twice and nothing else per tick.
  The open C2 item (batch into one rAF write) would buy nothing measurable — **close it**.
- **localStorage parse of the OSM cache** (29.7 kB, two dams) is **0.3 ms**.

## Where the time actually goes now — selection cost, not frame cost

This is the real remaining cost, and it is all network-bound:

| dam | CWC course drawn | OSM shape arrived after | shaped length |
|---|---|---|---|
| Srisailam | 725 ms | **21,400 ms** (still pending at cut-off) | — |
| Nagarjunasagar | 723 ms | 11,638 ms | 300 km vs 273 km |
| Vaigai (cached) | ~720 ms | ~0.4 s (localStorage) | 212 km vs 190 km |
| Mettur (cached) | ~720 ms | instant | 347 km vs 325 km |

**The CWC course is on screen in ~0.7 s and never waits** — that is the design working. The shape
pass is deliberately off the critical path: it fetches OpenFreeMap vector tiles for the course's
bbox (zoom picked so the tile count stays ≤ 64; a fixed z12 made the Vaigai span 330 tiles and never
finish). Repeat visits are instant from `localStorage` (24 entries, LRU).

**Gap G1 — cold shape pass is 11-21 s.** Not a frame-rate problem and not a main-thread problem (the
worker decodes tiles off-thread and the page stays at 60 fps), but the user waits a long time to see
the real river. Options, in order of cost:
  - G1a Cache decoded tile geometry in the worker across dams (`tileCache` already keys `z/x/y`, but
    dies with the 5-minute worker release) — a warm worker makes the second dam in the same basin
    fast.
  - G1b Request a lower-zoom tile for long courses (detail loss) — not worth it; detail is the point.
  - G1c Show partial shaping: apply the OSM shape progressively per tile instead of at the end.
  - G1d Pre-warm on hover/dam-list focus — the cheapest real win.

**Gap G2 — 3 spike frames > 50 ms per selection** (max 72 ms over 580 frames, 0 over 100 ms).
Not reproduced by any subsystem toggle above, so it is very likely tile decode/DOM work at the
moment the shaped line is applied (571-941 point line + `setData`). Worth one `performance.mark`
around `damApplyOsm` to confirm before acting; at 3 frames per selection it is not user-visible.

**Gap G3 — heap 145-179 MB.** Down from 225 MB (fewer dam selections in this session). Route LRU is
capped at 80, the OSM localStorage cache at 24 entries (29.7 kB for two long courses → ~350 kB for
24), the worker terminates after 5 idle minutes. No unbounded growth path found.

**Gap G4 — style is 133 layers** (131 + the two v7.20 route layers). v7.17 measured that hiding 122
of them changed nothing (51.2 → 48.7 ms), and re-confirmed this run: every subsystem toggle is
16.6 ms. Do not curate the style for speed.

## Closed this round

- [x] C2 card writes — measured at 17 Hz with no frame cost; batching gains nothing
- [x] B1 DEM `tileSize: 512` — DEM is not a bottleneck (2 ms for 639 lookups); not needed
- [x] D1/D2 memory — route LRU, OSM cache and worker lifetime all bounded; heap measured
- [ ] B3 pick-sweep cache — 13,002 points project in ~1-2 ms per click; below the noise floor of
      this VM, and no input lag was observed. Keep as a one-liner if a real machine complains.
- [ ] C3 reduced motion — worth doing for accessibility, not for speed.
- [ ] Re-run `?perf=1` on the user's machine (this VM's pacing is indicative only).

## Recommended next

1. ~~G1d pre-warm the shape pass~~ — **done**, 725 ms → 178 ms on a pre-warmed dam.
2. **G1a keep decoded tiles alive across worker restarts** — `tileCache` dies with the 5-minute
   worker release, so a basin looked at earlier has to refetch. Worth doing: it is the same win as
   G1d for a dam you return to later.
3. **G5 real shapefile for the shape source.** The remaining refusal (Sardar Sarovar) is a *data
   coverage* problem, not a speed one: the map's tiles carry OSM's OSM, and OSM's lower Narmada is
   not connected waterway geometry there. A proper fix is a river-geometry extract (e.g. HydroSHEDS
   or a national dataset) served as a static file alongside `rivers-cwc.geo.json` — same architecture
   as the CWC file, no network dependency, and it would shape every dam.
4. Add one `performance.mark` around `damApplyOsm` to close G2 with a number rather than a guess.