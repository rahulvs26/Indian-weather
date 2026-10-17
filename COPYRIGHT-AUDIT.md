# Copyright & Rights Audit

Scope: every file that GitHub Pages would publish from this repository, as of
`eec26f0` + `c69c88c`. Written before any publishing decision.

**The short version**

| | |
|---|---|
| Files that ship | 99 tracked files, 35.8 MB |
| IMD PDFs, monographs, shapefiles in the tree | **none** — correctly git-ignored |
| Third-party text reproduced verbatim | **none found** |
| Items needing only an attribution line | 6 groups |
| Items where attribution is **not** enough | 1 — GADM. **RESOLVED in v7.23g**: replaced with Natural Earth admin-1 (public domain) |

---

## F1 · RESOLVED in v7.23g — GADM replaced with Natural Earth

> **This finding is closed.** GADM v4.1 may not be redistributed, so it was
> replaced with Natural Earth admin-1 (public domain). Option **A** below was
> taken. `data/_gen_india_states.mjs` rebuilds the file and aborts if any of the
> 36 existing keys stops resolving; re-run it to re-verify. The reasoning is kept
> below because the licence terms are what made the change necessary, and
> because a future "simplification" that reintroduces GADM should have to read
> why it was removed.

`data/india-states.geo.json` — 41 MultiPolygon features, 204 KB. Fields are
unmistakable GADM v4.1: `GID_1: "IND.1_1"`, `NAME_1`, `VARNAME_1`, `ENGTYPE_1`,
`ISO_1`.

GADM's licence states:

> The data are freely available for academic use and other non-commercial use.
> **Redistribution, or commercial use is not allowed without prior permission.**
> — gadm.org/license.html

Two things follow, and they are different in kind:

1. **The boundary geometry is redistribution.** Publishing a repository that
   contains this file is redistribution. Attribution does not satisfy this
   licence, because the licence does not offer a "credit and go" option. This
   is the one finding in the audit that citing cannot fix.
2. **The `NAME_1` keys are a separate question.** `data/months.json` and
   `data/rain-state-avg.json` are keyed by GADM `NAME_1` strings. A state name is
   a fact, not copyrightable expression, so keying by name is very likely fine.
   But it is not fine *by construction* — it is fine because the keys are names,
   and it stops being fine the moment someone puts a GADM-only identifier in a
   key.

**Options, cheapest first** — option A was taken; see the note above.

| Option | Work | Result |
|---|---|---|
| **A.** Replace the geometry with Natural Earth admin-1 (public domain) | Re-key `india-states.geo.json`, `months.json` `rainStates`, `rain-state-avg.json` to the new names | Fully clear to publish. Loses GADM's finer state/UT split detail |
| **B.** Write to GADM for redistribution permission | A letter | Unblocks publishing as-is; unbounded wait |
| **C.** Keep it private, do not publish | none | You can host on a private repo served to yourself, but not on a public GitHub Pages site |

**What was actually done (option A).** Natural Earth admin-1 at 10m, filtered to
`adm0_a3 = IND`, gives 36 features in 708 KB. The deck's existing 36 keys were
preserved on `NAME_1` so `months.json` and `rain-state-avg.json` needed no edits at
all; each feature also carries `name` (the readable Natural Earth name) and `src`.
Two differences are declared in the file rather than smoothed over: Natural Earth
merges Dadra and Nagar Haveli with Daman and Diu, and includes Ladakh, which has
no rainfall row. Boundary detail is coarser than GADM 4.1.

---

## F2 — Three Bureau of Meteorology images, unreferenced

`photos/iod-positive.png`, `iod-negative.png`, `iod-neutral.png`, 209 KB total.
All three carry **"© Commonwealth of Australia 2013"** printed on the image.

Nothing in the site references them. They are orphaned: they would be published
and would earn nothing.

Bureau of Meteorology publishes under **Creative Commons Attribution 3.0
Australia** (see `bom.gov.au/copyright`), which *does* permit reuse provided
the work is attributed. So this is a citation job, not a takedown job.

I have left them in place rather than deleting them, because they are your files
and they are perfectly reusable. Until they are either used or excluded:

- **`photos/SOURCES.md`** records what they are, where they came from and the
  exact attribution line required. See that file for the credit string.
- If you publish with them unreferenced, you still must not imply they are
  yours. They are in the audit and in the footer.

---

## F3 · Data derived from WRIS was never added to CITATIONS.md

The individual data files are exemplary — each one opens with a `note` field
naming its own source, licence and derivation. That discipline is why this audit
could be done quickly.

The human-facing `CITATIONS.md` never caught up. These shipped files are derived
from **WRIS / IndiaWRIS** via the `ramSeraph/indian_water_features` release
`hydro-boundaries`, CC0 with attribution to datameet and the original government
source, and none of them appear in `CITATIONS.md` or in the page footer:

| File | Size | What it is |
|---|---|---|
| `data/watersheds.geo.json` | 5.8 MB | 4,560 WRIS watershed polygons |
| `data/watershed-areas.json` | 285 KB | their published areas |
| `data/reservoirs.geojson` | 2.2 MB | 5,160 reservoir outlines |
| `data/rivers-cwc.geo.json` | 14.6 MB | 30,395 CWC/WRIS river lines |
| `data/river-stats.json` | 2.1 MB | lengths measured from the above |

CC0 asks for nothing, but datameet and the government source ask for
attribution, so the credit line is owed. **Now added to `CITATIONS.md` and to
the page footer.**

---

## F4 · The 41 phenomena cite the web, not the monographs

Every other number in the deck cites a PDF and a page, e.g.
`monsoon_report_2025_2.pdf p38`. The phenomena cite things like
`"web · Pai 2011"` and `"web · TransRe; AGU 2018"`.

Two consequences:

1. **Not checkable from here.** "web · Pai 2011" does not tell a reader which
   paper, which journal or which page, so the claim cannot be verified without
   re-finding it.
2. **Weaker than it looks.** `TransRe` is a commercial re-insurance provider —
   a reasonable explainer of ENSO, but not a citable authority for climate
   science.

`CLIMATE_PHENOMENA_TODO.md` holds the working notes. This is a real
provenance weakness, not a blocker: the per-phase MJO text now shown in section 2
reads from `data/mjo.json`, which carries the same weakness. Recorded, not
fixed — fixing it means re-sourcing 41 entries against the monographs, which is
a day's work and should be its own task.

---

## F5 · External services: what each one's terms actually require

| Service | Used for | Terms, as I read them |
|---|---|---|
| Leaflet 1.9.4 (unpkg) | 2D map | BSD-2-Clause — keep the copyright notice |
| Three.js r160 (unpkg, importmap) | 3D relief | MIT |
| MapLibre GL JS | 3D map | BSD-3-Clause |
| **OpenStreetMap** building extrusions | 3D buildings | **ODbL 1.0** — "© OpenStreetMap contributors" required, visible, with a link |
| **OpenMapTiles / OpenFreeMap** vector tiles | 3D basemap | OpenMapTiles Data Licence: free with attribution, but **not** for building a competing tile service, and not for bulk redistribution of the tiles |
| Esri World Terrain Base | 2D basemap | Esri tile terms cover *viewing the service*. The tiles are **not** redistributable — do not commit them |
| Terrarium DEM (AWS `s3.amazonaws.com`) | 3D relief | AWS Open Data |
| Mapterhorn DEM | 3D map terrain | service terms |
| Natural Earth | river centrelines, coast | public domain |
| fonts.openmaptiles.org | 3D map glyphs | OpenMapTiles fonts — attribution owed |

Two of these (OSM, OpenMapTiles) carry **attribution obligations**, not merely
redistribution limits. The footer now prints both credit lines.

**One thing I could not verify:** I have no network access from the shell, so
the OpenMapTiles and Esri terms above are from memory and from search results,
not from reading the current licence text. Before publishing, read
`github.com/openfreemap/terms` and `esri.com` terms yourself. If either has
tightened, that affects the 3D basemap only — the 2D map and all data are
unaffected.

---

## F6 · Clean bill of health

Verified by `data/_audit_inventory.mjs` (re-runnable — it reads `git ls-files`,
so it always reports the tree as it actually is, not as it is remembered) and
`data/_audit_notes.mjs` (dumps the provenance note each data file carries about
itself):

- **No PDFs, `.doc`, `.xls`, `.zip` or `.csv` anywhere in the tracked tree.**
  The 159 MB of IMD monographs live in `pdf/`, which is git-ignored. The 1.1 GB
  of shapefiles lives in `Shape files/`, also git-ignored. `data/_src/` — fetched
  source copies including the 1901–2015 rainfall CSV mirror — is git-ignored too.
- **No photographs, satellite imagery or scanned figures** other than the three
  BoM diagrams in F2.
- **No third-party prose reproduced at length.** Climate facts appear as studied
  values — dates, thresholds, counts — each with a source tag. Page text,
  instruments and code are the author's own.
- **No API keys.** `data/live.json` is git-ignored; `data/live.example.json` is
  placeholders.
- **`data/embedded.js`** (520 KB) is the site's *own* data inlined as
  `window.IND_DATA` for offline use — a build artefact of files already listed,
  not new third-party content.

---

## What was changed, and what was not

**Changed:** the page footer was replaced with a readable disclosure — the four
things a reader must be told, then two collapsible source lists, with the
licence obligations that are legally stronger than a credit line (OSM's ODbL,
GADM's no-redistribution, the BoM CC BY requirement) marked in place.
`CITATIONS.md` gained the missing WRIS, imagery and library entries.
`photos/SOURCES.md` and `data/README.md` were added.

`data/_smoke.mjs` gained a section 8 that fails the build if the required rights
notices go missing. Attribution is the one defect in this project that no other
test can see: the page renders, every other test passes, and the site is quietly
non-compliant. It also fails if a binary file appears in the published tree
without being named in a SOURCES note — a raster cannot carry its own credit,
which is how the three orphaned BoM diagrams went unnoticed.

**Later, in v7.23g:** GADM was replaced rather than left as a decision — see F1.
No licence text was paraphrased into permissiveness at any point.

**Re-run the audit any time:**

```bash
node data/_audit_inventory.mjs   # what ships, how big, what is binary, what is orphaned
node data/_audit_notes.mjs       # each data file's own statement of where it came from
node data/_smoke.mjs             # are the required notices still on the page
```

**Suggested credit line for anything you reuse:**

> Indian Weather Study Deck — facts and data © India Meteorological Department,
> CWC, WRIS/IndiaWRIS, Bureau of Meteorology, Natural Earth, Esri,
> OpenStreetMap contributors and OpenMapTiles, as cited per figure. Study use only.