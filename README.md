# Indian Weather — Interactive Study Deck

Minimalist single-page study site for Indian monsoon, IOD, MJO, heat/cold waves,
rivers, dams and basins. See `INDIAN_WEATHER_SPEC.md` (build rules),
`SHAPE_INTEGRATION.md` (shapefile checklist) and `CITATIONS.md` (all sources).
Continuing work in a new session: start by reading `HANDOFF.md` only.

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000 (file:// works for layout, but data fetch needs http)
```

No build step. Only CDN deps: Leaflet 1.9.4, Three.js 0.160.0, Esri Light Gray
Canvas tiles (re-tinted soft-grey via CSS for the minimalist look), Terrarium DEM
tiles (all keyless).

## Section 2 — the MJO reference article

Section 2 used to be three mechanical metaphors drawn in SVG: a gantry "monsoon
advance plotter", a brass calendar wheel, and an "MJO loom". They were removed on
request. The plotter's sourced onset dates were real, so they are kept verbatim in
`data/_removed_plotter.html` rather than deleted with the figure.

In their place is an encyclopaedic interactive article: prose, an eight-sector
phase diagram you can tap, an amplitude control, and a sourced fact table.

- **Prose** — `data/_mjo-article.mjs`, written for the article.
- **Per-phase India effects and their sources** — read at runtime from
  `data/mjo.json`, the same file the map's MJO pulse layer uses, so the article
  and the map cannot contradict each other.
- **Phase numbering** — this deck follows `data/mjo.json` (1 = Africa/W Indian
  Ocean … 5 = west Pacific). The Wheeler–Malanotte-Rossa RMM diagram numbers the
  same eight positions in the *opposite* direction, with 1 in the west Pacific.
  Both are in circulation; the disagreement is printed on the card rather than
  left for a reader to trip over. **If you change one, change both.**

The diagram is schematic. The deck ships no RMM time series, so no observed
trajectory is drawn and nothing on the diagram is an observation.

### Reading the 41 phenomena

The phenomena panel in section 1 lists 41 climate phenomena. Tapping any one
writes its full sourced explanation into the reader panel below the list. That
text used to exist only as a hover `title`, which is invisible on touch — the
reason the list read as broken. `window.__phen.info(id)` is the same call in
script.

The category chips are a show-only filter (tap a category to see only it, tap
again or tap **All** to return). They used to be hide-toggles, which is the
opposite of what that row of buttons means.

## Git & hosting (private)

- `.gitignore` keeps out `pdf/` (159 MB, © IMD — do not publish) and
  `Shape files/` (1.1 GB incl. a >100 MB file GitHub would reject).
- A **private** GitHub repo works for code + derived `data/*.geo.json`.
  Note: GitHub Pages on a *private* repo needs a paid (Pro/Team) plan.
  Free options: keep the repo private and deploy from it with Netlify,
  Vercel or Cloudflare Pages (all build static sites from private repos
  on their free tiers), or go public later *after* confirming no
  copyrighted PDFs are tracked.
- Never commit API keys; live-data hooks read keys from `localStorage` only
  (see `data/live.example.json`).
