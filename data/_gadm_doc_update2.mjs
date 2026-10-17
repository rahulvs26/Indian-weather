/* v7.23g part 2 — the seven GADM references the first pass missed, because the files use em-dashes
   and the first script matched ASCII hyphens. Rewritten as tolerant regexes and made idempotent, so
   running it twice is safe and running it after a partial pass finishes the job instead of
   reporting the same failures.

   The already-applied edits are detected and skipped rather than reported as misses, which is what
   made the first script confusing to re-run.

   Run: node data/_gadm_doc_update2.mjs                                                 */
import { readFileSync, writeFileSync } from "node:fs";

/* [file, label, tolerant regex, replacement builder] */
const jobs = [
  ["CITATIONS.md", "item 9 boundary source",
    /9\. Natural Earth \(public domain\)[\s\S]{0,200}?Terrarium DEM tiles \(AWS open data\)[\s\S]{0,40}?relief\./,
    () => "9. Natural Earth (public domain) — river centerlines AND India state/union-territory\n"
      + "   boundaries (admin-1, 10m; `data/india-states.geo.json`, rebuilt by\n"
      + "   `data/_gen_india_states.mjs`); Terrarium DEM tiles (AWS open data) — relief."],

  ["CITATIONS.md", "GADM heading + entry",
    /## GADM[^\n]*attribution is not sufficient[^\n]*\n[\s\S]*?drop-in replacement if the geometry is swapped\./,
    () => "## GADM v4.1 — REMOVED, replaced by Natural Earth\n\n"
      + "14. **GADM v4.1** was previously used for India level-1 boundaries in\n"
      + "    `data/india-states.geo.json`. Its licence reads *\"freely available for academic\n"
      + "    use and other non-commercial use. Redistribution, or commercial use is not\n"
      + "    allowed without prior permission\"* — so it could not lawfully ship in a public\n"
      + "    repository, and no credit line satisfied it.\n\n"
      + "    **It has been replaced with Natural Earth admin-1 (public domain).** The\n"
      + "    geometry now comes from `ne_10m_admin_1_states_provinces`, filtered to\n"
      + "    `adm0_a3 = IND`, and the file carries `licence: public domain` in its own\n"
      + "    header. `data/_gen_india_states.mjs` does the rebuild and refuses to run if a\n"
      + "    key stops resolving.\n\n"
      + "    Two consequences, both recorded in the file itself: Natural Earth merges\n"
      + "    Dadra and Nagar Haveli with Daman and Diu (India merged them in 2020), and it\n"
      + "    has Ladakh (carved out of Jammu and Kashmir in 2019), for which no rainfall row\n"
      + "    exists. Boundary detail is coarser than GADM 4.1 — that was the price of being\n"
      + "    able to publish. The history is in `COPYRIGHT-AUDIT.md` F1."],

  ["README.md", "registry row",
    /\| `india-states\.geo\.json` \| 204 KB \| 41 \| \*\*GADM v4\.1\*\*[^\n]*\n/,
    () => "| `india-states.geo.json` | 708 KB | 36 | **Natural Earth admin-1** (10m), public domain. Replaced GADM v4.1, whose licence forbids redistribution; rebuilt by `_gen_india_states.mjs` |\n"],

  ["data/README.md", "registry row",
    /\| `india-states\.geo\.json` \| 204 KB \| 41 \| \*\*GADM v4\.1\*\*[^\n]*\n/,
    () => "| `india-states.geo.json` | 708 KB | 36 | **Natural Earth admin-1** (10m), public domain. Replaced GADM v4.1 (no redistribution permitted). Built by `_gen_india_states.mjs`, which aborts if a key stops resolving. Dadra & Nagar Haveli / Daman & Diu arrive merged; Ladakh has no rainfall row |\n"],

  ["HOSTING.md", "pre-publish blocker",
    /### Blocker[^\n]*\n\n- \[ \] \*\*Resolve GADM\.\*\*[\s\S]*?Everything\n      else on this page is ready\.\n/,
    () => "### Blockers\n\n"
      + "- [x] **GADM resolved.** `data/india-states.geo.json` was GADM v4.1, whose licence\n"
      + "      forbids redistribution without permission. It has been replaced with\n"
      + "      **Natural Earth admin-1 (public domain)** by `data/_gen_india_states.mjs`.\n"
      + "      35 of the 36 old keys still resolve; `DamanandDiu` is carried in\n"
      + "      `merged_keys` after India's 2020 merger, and `Ladakh` is new and has no\n"
      + "      rainfall row. Re-run the generator to confirm the guard still passes.\n\n"
      + "### Everything else\n"],

  ["COPYRIGHT-AUDIT.md", "summary table row",
    /\| Items where attribution is \*\*not\*\* enough \| [^\n]*GADM[^\n]*\|\n/,
    () => "| Items where attribution is **not** enough | 1 — GADM. **RESOLVED in v7.23g**: replaced with Natural Earth admin-1 (public domain) |\n"],

  ["data/_rain_avg.mjs", "header comment",
    /-> per-GADM-state monthly long-period means, mm\/month\./,
    () => "-> per-state monthly long-period means, mm/month. Built before v7.23g, when\n   india-states.geo.json came from GADM; the NAME_1 keys it uses are preserved\n   exactly, so nothing here needed changing."],
];

let applied = 0, skipped = 0;
const failed = [];
for (const [file, label, re, build] of jobs) {
  let s;
  try { s = readFileSync(file, "utf8"); }
  catch { console.log("  MISSING FILE  " + file); failed.push(file); continue; }
  const m = s.match(re);
  if (!m) { console.log("  no match      " + file + "  (" + label + ")"); failed.push(file + ":" + label); continue; }
  const to = build();
  if (s.includes(to)) { console.log("  already done  " + file + "  (" + label + ")"); skipped++; continue; }
  writeFileSync(file, s.replace(re, to), "utf8");
  console.log("  ok            " + file + "  (" + label + ", " + m[0].length + " chars)");
  applied++;
}
console.log("\napplied " + applied + ", already done " + skipped);
if (failed.length) { console.log("still to do by hand:"); failed.forEach(f => console.log("  " + f)); }