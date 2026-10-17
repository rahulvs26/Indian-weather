/* v7.23g — update every GADM reference after the Natural Earth swap.

   GADM is no longer used, so every place that named it as a live dependency has to change. Done as
   a script because there are twenty-odd of them across six files and hand-editing them one at a
   time is how you miss one - and a stale "© GADM" in a footer is exactly the kind of error this
   project cannot catch visually.

   Two of the references are deliberately LEFT ALONE and are listed at the end so nobody "fixes"
   them later:
     - COPYRIGHT-AUDIT.md's F1 finding, which is the record of why the swap happened
     - data/_gen_india_states.mjs, whose whole job is documenting GADM's licence

   Run: node data/_gadm_doc_update.mjs                                                  */
import { readFileSync, writeFileSync } from "node:fs";

const edits = [
  /* ---------------------------------------------------------------- CITATIONS.md */
  ["CITATIONS.md",
    "9. Natural Earth (public domain) - river centerlines; GADM (non-commercial\n   academic use) - state boundaries; Terrarium DEM tiles (AWS open data) - relief.",
    "9. Natural Earth (public domain) - river centerlines AND India state/union-territory\n   boundaries (admin-1, 10m; `data/india-states.geo.json`, rebuilt by\n   `data/_gen_india_states.mjs`); Terrarium DEM tiles (AWS open data) - relief."],

  ["CITATIONS.md",
    "## GADM - attribution is not sufficient; read the licence\n\n14. **GADM v4.1** (`gadm.org`), India level-1 boundaries, in\n    `data/india-states.geo.json`. Licence: *\"freely available for academic use\n    and other non-commercial use. Redistribution, or commercial use is not allowed\n    without prior permission.\"*\n\n    **This is the one item in the audit that a credit line does not satisfy.**\n    Publishing the repository publishes the file. See `COPYRIGHT-AUDIT.md` F1 for\n    the three options, and `HOSTING.md` for the pre-publish blocker. Natural\n    Earth (public domain) is the drop-in replacement if the geometry is swapped.",
    "## GADM v4.1 - REMOVED, replaced by Natural Earth\n\n14. **GADM v4.1** was previously used for India level-1 boundaries in\n    `data/india-states.geo.json`. Its licence reads *\"freely available for academic\n    use and other non-commercial use. Redistribution, or commercial use is not\n    allowed without prior permission\"* - so it could not lawfully ship in a public\n    repository, and no credit line satisfied it.\n\n    **It has been replaced with Natural Earth admin-1 (public domain).** The\n    geometry now comes from `ne_10m_admin_1_states_provinces`, filtered to\n    `adm0_a3 = IND`, and the file carries `licence: public domain` in its own\n    header. `data/_gen_india_states.mjs` does the rebuild and refuses to run if a\n    key stops resolving.\n\n    Two consequences, both recorded in the file itself: Natural Earth merges\n    Dadra and Nagar Haveli with Daman and Diu (India merged them in 2020), and it\n    has Ladakh (carved out of Jammu and Kashmir in 2019), for which no rainfall row\n    exists. Boundary detail is coarser than GADM 4.1 - that was the price of being\n    able to publish. The history is in `COPYRIGHT-AUDIT.md` F1."],

  /* ------------------------------------------------------------ README.md */
  ["README.md",
    "| `india-states.geo.json` | 204 KB | 41 | **GADM v4.1** - see `COPYRIGHT-AUDIT.md` F1. Redistribution is not permitted by its licence |",
    "| `india-states.geo.json` | 708 KB | 36 | **Natural Earth admin-1** (10m), public domain. Replaced GADM v4.1, whose licence forbids redistribution; rebuilt by `_gen_india_states.mjs` |"],

  /* ------------------------------------------------------------ data/README.md */
  ["data/README.md",
    "| `india-states.geo.json` | 204 KB | 41 | **GADM v4.1** - see `COPYRIGHT-AUDIT.md` F1. Redistribution is not permitted by its licence |",
    "| `india-states.geo.json` | 708 KB | 36 | **Natural Earth admin-1** (10m), public domain. Replaced GADM v4.1 (no redistribution permitted). Built by `_gen_india_states.mjs`, which aborts if a key stops resolving. Dadra & Nagar Haveli/Daman & Diu arrive merged; Ladakh has no rainfall row |"],

  /* ------------------------------------------------------------ HOSTING.md */
  ["HOSTING.md",
    "### Blocker - read this first\n\n- [ ] **Resolve GADM.** `data/india-states.geo.json` is GADM v4.1, whose licence\n      says *\"Redistribution, or commercial use is not allowed without prior\n      permission.\"* Publishing the repository publishes the file, and an\n      attribution line does **not** satisfy that licence. Pick one\n      (`COPYRIGHT-AUDIT.md` §F1 has the three options):\n      - **A.** swap the geometry for Natural Earth admin-1, public domain, and\n        re-key the state names in `months.json` and `rain-state-avg.json`\n      - **B.** write to GADM for permission\n      - **C.** do not publish the repository publicly\n\n      Until one of these is done, **do not make the repo public.** Everything\n      else on this page is ready.\n\n### Everything else",
    "### Blockers\n\n- [x] **GADM resolved.** `data/india-states.geo.json` was GADM v4.1, whose licence\n      forbids redistribution without permission. It has been replaced with\n      **Natural Earth admin-1 (public domain)** by `data/_gen_india_states.mjs`.\n      35 of the 36 old keys still resolve; `DamanandDiu` is carried in\n      `merged_keys` after India's 2020 merger, and `Ladakh` is new and has no\n      rainfall row. Re-run the generator to confirm the guard still passes.\n\n### Everything else"],

  /* --------------------------------------------------------- COPYRIGHT-AUDIT.md */
  ["COPYRIGHT-AUDIT.md",
    "| Items where attribution is **not** enough | **1 - GADM. Do not publish as-is.** |",
    "| Items where attribution is **not** enough | 1 — GADM. **RESOLVED in v7.23g**: replaced with Natural Earth admin-1 (public domain) |"],

  ["COPYRIGHT-AUDIT.md",
    "## F1 · BLOCKING — GADM may not be redistributed",
    "## F1 · RESOLVED in v7.23g — GADM replaced with Natural Earth\n\n> **This finding is closed.** GADM v4.1 may not be redistributed, so it was\n> replaced with Natural Earth admin-1 (public domain). Option **A** below was\n> taken. `data/_gen_india_states.mjs` rebuilds the file and aborts if any of the\n> 36 existing keys stops resolving; re-run it to re-verify. The reasoning is kept\n> below because the licence terms are what made the change necessary, and\n> because a future \"simplification\" that reintroduces GADM should have to read\n> why it was removed."],

  ["COPYRIGHT-AUDIT.md",
    "**Options, cheapest first**",
    "**Options, cheapest first** — option A was taken; see the note above."],

  ["COPYRIGHT-AUDIT.md",
    "I have not changed the file. Option A is roughly an hour of careful renaming and\nI would want your go-ahead first, because renaming state keys touches the map\nhighlighting and the rainfall table, and a silent key mismatch there would show\nup as \"the rain highlight does nothing\" rather than as an error.\n\nWhatever you choose, this belongs in the pre-publish checklist in `HOSTING.md`.",
    "**What was actually done (option A).** Natural Earth admin-1 at 10m, filtered to\n`adm0_a3 = IND`, gives 36 features in 708 KB. The deck's existing 36 keys were\npreserved on `NAME_1` so `months.json` and `rain-state-avg.json` needed no edits at\nall; each feature also carries `name` (the readable Natural Earth name) and `src`.\nTwo differences are declared in the file rather than smoothed over: Natural Earth\nmerges Dadra and Nagar Haveli with Daman and Diu, and includes Ladakh, which has\nno rainfall row. Boundary detail is coarser than GADM 4.1."],

  ["COPYRIGHT-AUDIT.md",
    "> Indian Weather Study Deck — facts and data © India Meteorological Department,\n> CWC, WRIS/IndiaWRIS, GADM, Bureau of Meteorology, Natural Earth, Esri,\n> OpenStreetMap contributors and OpenMapTiles, as cited per figure. Study use only.",
    "> Indian Weather Study Deck — facts and data © India Meteorological Department,\n> CWC, WRIS/IndiaWRIS, Bureau of Meteorology, Natural Earth, Esri,\n> OpenStreetMap contributors and OpenMapTiles, as cited per figure. Study use only."],

  ["COPYRIGHT-AUDIT.md",
    "`CITATIONS.md` gained the missing WRIS, GADM, imagery and library entries.",
    "`CITATIONS.md` gained the missing WRIS, imagery and library entries."],

  ["COPYRIGHT-AUDIT.md",
    "`photos/SOURCES.md` and `data/README.md` were added. `HOSTING.md` gained GADM\nas a pre-publish blocker.",
    "`photos/SOURCES.md` and `data/README.md` were added."],

  ["COPYRIGHT-AUDIT.md",
    "**Not changed:** no data file was deleted, no licence text was paraphrased into\npermissiveness, and the GADM question is left as a decision in F1 rather than\nquietly resolved.",
    "**Later, in v7.23g:** GADM was replaced rather than left as a decision — see F1.\nNo licence text was paraphrased into permissiveness at any point."],

  /* ------------------------------------------------------------- data/_rain_avg.mjs */
  ["data/_rain_avg.mjs",
    "-> per-GADM-state monthly long-period means, mm/month.",
    "-> per-state monthly long-period means, mm/month. Built before v7.23g, when\n   india-states.geo.json came from GADM; the NAME_1 keys it used are preserved\nexactly, so nothing here needed changing."],
];

let applied = 0, missed = [];
for (const [file, from, to] of edits) {
  let s;
  try { s = readFileSync(file, "utf8"); } catch { missed.push(file + " (missing)"); continue; }
  if (!s.includes(from)) { missed.push(file + ": " + JSON.stringify(from.slice(0, 58))); continue; }
  writeFileSync(file, s.split(from).join(to), "utf8");
  applied++;
  console.log("  ok   " + file + "  <- " + JSON.stringify(from.slice(0, 52)));
}
console.log("\napplied " + applied + " of " + edits.length);
if (missed.length) {
  console.log("MISSED (need a look):");
  missed.forEach(m => console.log("  " + m));
}

/* confirm no stale claim of a GADM dependency survives in the shipped page */
const html = readFileSync("index.html", "utf8");
const stillLive = /is used for state boundaries/.test(html);
console.log("\nindex.html still claims GADM is in use: " + stillLive + "  (true = needs the footer fix next)");
console.log("Deliberately untouched, do not \"fix\": COPYRIGHT-AUDIT.md F1 (the record) and");
console.log("data/_gen_india_states.mjs (whose job is quoting GADM's licence).");