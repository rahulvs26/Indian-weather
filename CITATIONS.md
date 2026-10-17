# Citations & Rights

All climate facts on this site are drawn from the sources below. Nothing is copied
verbatim at length; figures show studied values (dates, thresholds, counts) with
per-card source tags. If you reuse this material, cite the originals — not this site.

## IMD monographs & reports (© India Meteorological Department, Ministry of Earth
Sciences, Govt. of India — used for non-commercial study with attribution)

1. India Meteorological Department. (2026). *Monsoon 2025: A Report*
   (ESSO/MOES/IMD/SYNOPTICMET/01(2026)/33; Eds. M. Mohapatra, Naresh Kumar,
   Satya Prakash). New Delhi. — 2025 seasonal totals, onset/withdrawal, LPS counts.
2. Rao, Y. P. (1976). *Southwest Monsoon* (Met. Monograph, Synoptic Meteorology
   No. 1/1976). New Delhi. — onset march, Somali jet, heat low, trough, TEJ, breaks.
3. Rajeevan, M., et al. (2022). *Northeast Monsoon of South Asia* (IMD Met.
   Monograph No. MoES/IMD/Synoptic Met/02(2022)/27). New Delhi. — NE onset
   22 Oct ±7 d, TN share, synoptic climatology.
4. Rajeevan, M., et al. (2023). *Heat and Cold Waves in India: Processes and
   Predictability* (IMD Met. Monograph MoES/IMD/Synoptic Met/01(2023)/28). Pune.
   — HW/CW thresholds (Tables 2.1/2.2), core zones, trends.
5. Tyagi, A., Asnani, G. C., De, U. S., Hatwar, H. R., & Mazumdar, A. B. (Eds.).
   (2012). *Monsoon Monograph — Volume 2*. IMD, Pune. — dynamics, teleconnections,
   forecast ranges, drought cases.
6. Vinayachandran, P. N., Francis, P. A., & Rao, S. A. *Indian Ocean Dipole:
   Processes and Impacts* (ch. pp. 569–589). — DMI definition, pIOD/nIOD years,
   Kelvin/Rossby waves, SETIO feedback, EQUINOO.

## User-supplied GIS (study use; © respective agencies — CWC/India-WRIS family)

7. Central Water Commission basin & sub-basin polygons (KML: 25 basins, 98
   sub-basins), dam/barrage points (Dam.shp, DAM.shp, BWA.shp), river network
   polylines (River_Network.shp), reservoir polygons, glacial-lake polygons,
   riverbank polygons, Tamil Nadu waterbody polygons. Provided by the site owner
   from `Shape files/`; web extracts in `data/` are thinned derivatives. v6.2
   subset for the Arabian-Sea side: `data/india-rivers-west.geo.json` — 633
   River_Network lines of the west-flowing systems (Narmada, Tapi, Mahi, Sabarmati,
   Kutch–Saurashtra, Tapi–Tadri, Tadri–Kanyakumari basins), len ≥ 30 km,
   Douglas–Peucker ≈ 0.9 km (180 KB); used on the 2D map (z≥5) and the 3D relief.
   v7.0 uses `data/dams.geo.json` — 13,002 CWC/WRIS dam, barrage and weir points
   (names, types, 6,333 recorded heights) — to place a modelled dam cross-section at
   every real coordinate in the 3D relief; the missing heights use class medians
   (labelled illustrative). Section conventions: §12.

## Open data & services (accessed Oct 2026)

8. Esri World Light Gray Canvas — base tiles (Tiles © Esri — Esri, DeLorme, NAVTEQ;
   keyless via server.arcgisonline.com); re-tinted soft-grey in CSS (styles.css,
   tile pane only). Replaced OpenStreetMap volunteer tiles 2026-10-15 — their
   tile-usage policy 403-blocked the app after heavy testing (the block is what
   showed up on the map); do not point the layer back at OSM's servers.
9. Natural Earth (public domain) — river centerlines; GADM (non-commercial
   academic use) — state boundaries; Terrarium DEM tiles (AWS open data) — relief.
10. Bureau of Meteorology (Australia) — IOD definition, ±0.4 °C event rule;
    NOAA Climate.gov — IOD history; PIB/MoES — DWR counts and ranges;
    PMF IAS / IMD materials — monsoon branch dates.
11. India Meteorological Department — subdivision-wise monthly rainfall 1901–2015,
    published as Government of India open data (data.gov.in); fetched CSV mirror:
    https://raw.githubusercontent.com/ayushmauryaiitj/Monsoon-Drought-Analytics
    (Kaggle "rainfall-in-india-1901-2015"); local copy kept in git-ignored
    `data/_src/`. v7.2 derives each state's monthly mean from it — per subdivision,
    mean of all yearly values (NA skipped), combined with approximate area weights
    (or shared-subdivision values) where the mapping is not 1:1; built by
    `data/_gen_rain_avg.mjs` → `data/rain-state-avg.json`. Approximate mapping; a
    1901–2015 record mean, not the official 1971–2000 LPA.

## Engineering conventions for the 3D dam cross-sections (profiles illustrative)

12. Bureau of Reclamation — *Design of Small Dams* (3rd ed., 1987): earthfill
    embankments commonly ≈2.5–3H:1V upstream / 2–2.5H:1V downstream, with a
    freeboard allowance above the design flood; *Design of Gravity Dams* (1976):
    near-vertical upstream and ≈0.75H:1V battered downstream faces for concrete
    gravity dams. Concrete-face rockfill dams (CFRD) typically use ≈1.3–1.4H:1V
    face slopes (Sherard & Cooke, J. Geotech. Eng., 1987; Shuibuya Dam project
    literature). The site applies stylised versions of these conventions to build
    every dam's 3D section: positions and CWC heights are real; all profile
    geometry is (illustrative).

## Site's own content

Page text, instruments and code are the author's study notes. Suggested credit:
"Indian Weather Study Deck (2026), facts © IMD et al. as cited."

---

# Added by the copyright audit

## WRIS / IndiaWRIS — the largest data group, previously uncited

Sourced from the `ramSeraph/indian_water_features` releases
`hydro-boundaries` and `waterbodies`. **CC0 with attribution to datameet and the
original government source.** The individual files each name this in their own
`note` field; it is recorded here because `CITATIONS.md` had not caught up.

13. **IndiaWRIS** (National River Water Institute / Ministry of Jal Shakti),
    via `github.com/ramSeraph/indian_water_features`, releases `hydro-boundaries`
    and `waterbodies`. CC0 with attribution to datameet and the original
    government source. Supplies: `data/watersheds.geo.json` (4,560 watershed
    polygons) and `data/watershed-areas.json` (their **published** `area_km2`,
    never re-derived from geometry); `data/reservoirs.geojson` (5,160 outlines);
    `data/rivers-cwc.geo.json` (30,395 river lines); `data/dams.geo.json`
    (13,002 dam/barrage/weir points); `data/river-stats.json` (27,479 measured
    lengths, haversine over those coordinates).

    **Catchment caveat, stated on every affected card:** a WRIS watershed is the
    mapped *watershed unit*, a floor — not the full catchment above a dam. Where
    the two disagree, the published dam figure is the one shown and the
    discrepancy is named.

## GADM — attribution is not sufficient; read the licence

14. **GADM v4.1** (`gadm.org`), India level-1 boundaries, in
    `data/india-states.geo.json`. Licence: *"freely available for academic use
    and other non-commercial use. Redistribution, or commercial use is not allowed
    without prior permission."*

    **This is the one item in the audit that a credit line does not satisfy.**
    Publishing the repository publishes the file. See `COPYRIGHT-AUDIT.md` F1 for
    the three options, and `HOSTING.md` for the pre-publish blocker. Natural
    Earth (public domain) is the drop-in replacement if the geometry is swapped.

## Bureau of Meteorology (Australia) — diagrams held in `photos/`

15. **Bureau of Meteorology**, Indian Ocean Dipole positive / negative / neutral
    diagrams, `photos/iod-*.png`. © Commonwealth of Australia 2013, published
    under **Creative Commons Attribution 3.0 Australia** (`bom.gov.au/copyright`).
    Reuse permitted **with visible attribution**. Required credit:

    > Indian Ocean Dipole diagrams: Bureau of Meteorology, © Commonwealth of
    > Australia 2013, used under Creative Commons Attribution 3.0 Australia
    > (CC BY 3.0 AU).

    Currently **unreferenced by the site** — see `photos/SOURCES.md`.

## Libraries and tile services — licence obligations, not just credit

16. **Leaflet 1.9.4** (BSD-2-Clause) · **Three.js r160** (MIT) · **MapLibre GL JS**
    (BSD-3-Clause). Loaded from unpkg. The licence notices must be kept.
17. **OpenStreetMap** building extrusions (ODbL 1.0). *"© OpenStreetMap
    contributors"* must be **visible on the page with a link to
    openstreetmap.org/copyright**. That is an attribution obligation, not just a
    credit.
18. **OpenMapTiles / OpenFreeMap** vector tiles (`tiles.openfreemap.org`).
    OpenMapTiles Data Licence: free with attribution, but not for building a
    competing tile service and not for bulk redistribution of the tiles.
19. **Esri World Terrain Base** (`server.arcgisonline.com`). The Esri terms cover
    *viewing the service*; the tiles are **not** redistributable. The deck
    re-tints them in CSS and commits no tile data.
20. **Terrarium DEM** (AWS Open Data, `s3.amazonaws.com`) · **Mapterhorn DEM**
    (`tiles.mapterhorn.com`) · **OpenMapTiles fonts** (`fonts.openmaptiles.org`,
    attribution owed).

> **Unverified:** there is no shell network access in this environment, so items
> 18–20 are from memory and search results, not from reading current licence
> text. Read `github.com/openfreemap/terms` and Esri's terms yourself before
> publishing. If either tightened, it affects the 3D basemap only — the 2D map
> and all data files are unaffected.

## Provenance weakness, recorded not fixed

21. The 41 entries in `data/phenomena.json` and the 8 phases in `data/mjo.json`
    cite sources as `"web · Pai 2011"` — no journal, no page. That is not
    checkable from the deck, and one cited source (TransRe) is a commercial
    re-insurer rather than a climate-science authority. Every other number in the
    deck cites a PDF and a page. Re-sourcing these against the monographs is open
    work; see `CLIMATE_PHENOMENA_TODO.md` and `COPYRIGHT-AUDIT.md` F4.
