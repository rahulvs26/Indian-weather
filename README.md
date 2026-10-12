# Indian Weather — Interactive Study Deck

Minimalist single-page study site for Indian monsoon, IOD, MJO, heat/cold waves,
rivers, dams and basins. See `INDIAN_WEATHER_SPEC.md` (build rules),
`SHAPE_INTEGRATION.md` (shapefile checklist) and `CITATIONS.md` (all sources).

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000 (file:// works for layout, but data fetch needs http)
```

No build step. Only CDN deps: Leaflet 1.9.4, Three.js 0.160.0, OSM tiles,
Terrarium DEM tiles (all keyless).

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
