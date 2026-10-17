# Hosting this deck — GitHub Pages, and a domain if you want one

Short answer: **yes, GitHub Pages will host it, free, and it needs no build step.** The deck is plain
HTML, CSS and ES modules with relative `data/…` paths, which is exactly what Pages serves.

---

## 1. Will it fit and work on GitHub Pages?

| | |
|---|---|
| Repo size limit | 1 GB soft, 100 MB per file. **This repo is 35.7 MB tracked** — comfortably inside |
| Bandwidth | 100 GB/month soft limit. At 34 MB per full visit that is ~3,000 visits/month before the soft limit; above it GitHub may ask you to move to a CDN |
| HTTPS | included, free |
| Build step | **none needed** — Pages serves the files as they are |
| Sub-path URLs | fine — every path in the deck is relative (`data/…`), so `https://you.github.io/deck/` works |
| The `Shape files/` and `pdf/` folders | already `.gitignore`d — ~300 MB of shapefiles and PDFs stay local, which is correct |
| `data/_wtiles/` | gitignored: a fetch cache, not source |

One caveat worth knowing before you publish: **the deck needs network access to OpenFreeMap,
Mapterhorn and OpenStreetMap tiles.** GitHub Pages serves your files; the basemap, terrain and
buildings come from those three services at runtime. If any of them is down or blocked on a user's
network, the deck still loads and the release console still works, but the 3D map will not draw.

---

## 2. Publishing, in the order that works

**Step 1 — put it in a repository.** If it isn't already a public repo:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

**Step 2 — turn on Pages.** In the repo: *Settings → Pages → Build and deployment → Source: Deploy
from a branch*, branch `main`, folder `/ (root)`, Save. It publishes in about a minute.

**Step 3 — use the URL GitHub gives you**, of the form
`https://<you>.github.io/<repo>/`.

Verify it by running the probe from §4 of `PERFORMANCE.md` against the live URL. That is the check
that matters: the local numbers in this repository were measured on a fast machine, and the published
one is what your users get.

---

## 3. If you want your own domain

You do not need one — `username.github.io/repo` works and costs nothing. If you want a name:

1. **Buy the domain.** A `.in` or `.com` runs roughly ₹700–1,500 per year through any registrar
   (GoDaddy, Namecheap, Hostinger, BigRock for `.in`). Nothing in this project requires a cheap TLD
   — Pages serves any A/AAAA/CNAME you point at it.
2. **Point it at GitHub.** Add a `CNAME` file at the repository root containing just the domain, e.g.
   `indianweather.example`, commit it, and in Pages settings set the custom domain. GitHub then issues
   an HTTPS certificate automatically — **free, and automatic**, which is the main reason people use
   Pages rather than rolling their own.
3. **Add `www` as a second custom domain** if you want both forms to work; GitHub redirects one to
   the other for you.

**What that costs, plainly:** the domain registration only. There is no hosting bill, no server, no
maintenance, because there is no server — Pages serves the files.

---

## 4. Alternatives, and when they are worth it

| option | free tier | when to prefer it |
|---|---|---|
| **GitHub Pages** | unlimited static hosting, 100 GB/mo | the repo is already here; simplest; automatic HTTPS |
| **Cloudflare Pages** | very generous, global CDN | if you want a CDN in front of it and a custom domain without registrar-side DNS juggling |
| **Netlify** | 100 GB/mo | drag-and-drop deploys, no git push needed; good for sharing a build |
| **GitHub Actions → Pages** | same | if you ever add a build step; not needed now |

All three serve the files identically — there is no build in this project to run.

---

## 5. Before you publish: the short checklist

### Blockers

- [x] **GADM resolved.** `data/india-states.geo.json` was GADM v4.1, whose licence
      forbids redistribution without permission. It has been replaced with
      **Natural Earth admin-1 (public domain)** by `data/_gen_india_states.mjs`.
      35 of the 36 old keys still resolve; `DamanandDiu` is carried in
      `merged_keys` after India's 2020 merger, and `Ladakh` is new and has no
      rainfall row. Re-run the generator to confirm the guard still passes.

### Everything else

### Everything else

- [x] **`.nojekyll` is committed.** GitHub Pages runs Jekyll by default, and Jekyll silently skips
      every file starting with `_`. This site loads three such files at runtime —
      `data/_mjo-article.mjs` (the section 2 article), `data/_crossings.mjs` and
      `data/_storm-layer.mjs` (imported by `map3d.js`). Without the empty `.nojekyll` file they
      would all 404 **in production only**: no MJO article, no storm layer, and the 3D map's module
      graph would fail to resolve. Locally there is no Jekyll, so everything works — which is
      exactly how this hides until after you publish. `data/_smoke.mjs` section 11 asserts it.
- [ ] `node data/_smoke.mjs` — 67 checks, all passing
- [ ] `node data/_run_tests.mjs` — 6 of 6 suites
- [ ] `git ls-files | wc -l` and confirm `Shape files/` and `pdf/` are **not** in the list
- [ ] `node data/_audit_inventory.mjs` — confirms no document or spreadsheet has crept in, and
      lists any binary file in the published tree that needs its own credit line
- [ ] confirm no secrets: `data/live.json` is gitignored (it holds API keys)
- [ ] decide what to do with `photos/iod-*.png` — they are Bureau of Meteorology
      diagrams, CC BY 3.0 AU, **referenced by nothing**. Use them with the credit
      in `photos/SOURCES.md`, or add `photos/` to `.gitignore`
- [ ] open the published URL and **click a dam, open the storm block, and look at the reservoirs** —
      the automated checks cannot see that anything is drawn in the right place, and that gap is
      documented in `PERFORMANCE.md` §3
- [ ] run the probe from `PERFORMANCE.md` against the live URL and compare the numbers with the local
      ones, especially the 14.6 MB river file
- [ ] read the current OpenMapTiles and Esri tile terms yourself if you use the 3D map — this
      machine could not reach them, so `COPYRIGHT-AUDIT.md` §F5 is marked unverified

If you want, I can add the `CNAME` file, a one-command publish script, or a small banner that names
the data sources — say which and I'll do it.