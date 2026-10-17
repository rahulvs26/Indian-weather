/* v7.19 — add PUBLISHED full-reservoir levels (elevation above mean sea level) with sources.
   The slope-to-sea calculation needs a level in metres above MSL, not a dam height and not a
   "full storage depth" in feet from a local datum. Only rows with an explicit RL are filled in;
   everything else stays null and the UI says "not recorded in the sources used".

   Sources checked in this session:
     tehri      830.0 m   THDC India press note, 24 Sep 2021 ("reservoir has touched the level of
                           830m, its Full Reservoir Level")
     bhakra     1,680 ft = 512.06 m   BBMB reservoir data ("FRL- 1680 ft", MWL 1690 ft)
     sardarsarovar 138.68 m  SSNNL project page + NCA clearance reported by The Indian Express
                           (15 Sep 2019: "full reservoir level (FRL) of 138.68 metres")
     nagarjunasagar 590.00 ft = 179.832 m  KRMB project page, which prints both units

   Also corrects a mislabelled figure: dam-facts `max_ow_level_m` had 179.83 for Nagarjunasagar,
   which is its FRL, not a maximum water level (KRMB: MWL +594.00 ft = +181.051 m). */
import {readFileSync, writeFileSync} from "node:fs";

const p = "data/dam-facts.json";
const j = JSON.parse(readFileSync(p, "utf8"));
const FT = 0.3048;
const byId = id => j.dams.find(d => d.id === id);

const frl = {
  tehri: {
    frl_m: 830.0,
    frl_source: "https://www.thdc.co.in/en/media/tehri-dam-achieved-its-full-potential-first-time-24th-sept-2021",
    frl_note: "THDC India press note, 24 Sep 2021: the reservoir 'has touched the level of 830m, its Full Reservoir Level' — first time since filling began. Earlier operating level was capped at EL 828 m by the state until Aug 2021. Same project's rule curve gives MDDL EL 740 m, MWL EL 835 m.",
  },
  bhakra: {
    frl_m: +(1680 * FT).toFixed(2),
    frl_ft: 1680,
    frl_source: "http://bbmb.gov.in/writereaddata/Portal/Images/pdf/res_data.pdf",
    frl_note: "BBMB reservoir data sheet: 'Bhakra Dam FRL- 1680 ft, MWL- 1690 ft, Top of Dam- 1700 ft'. Converted at 0.3048 m/ft. Note: the Bhakra course in the deck ends inland (Satluj to Sukar Drain), so there is no sea-level datum for its slope.",
  },
  sardarsarovar: {
    frl_m: 138.68,
    frl_source: "https://demo.ssnnl.in/project.aspx",
    frl_note: "SSNNL project page lists 'Full Reservoir Level (FRL): 138.68 metres (455 feet)', Maximum Water Level 140.21 m. The Narmada Control Authority cleared filling to FRL 138.68 m on 17 June 2017; the level was reached on 15 September 2019 (reported by The Indian Express).",
  },
  nagarjunasagar: {
    frl_m: 179.832,
    frl_ft: 590,
    frl_source: "https://krmb.gov.in/html/project39.html",
    frl_note: "Krishna River Water Board project page: 'F.R.L. +590.00 Ft. (+179.832 Mt.)', maximum water level +594.00 ft (+181.051 m), MDDL +510 ft.",
  },
};

for (const [id, f] of Object.entries(frl)) {
  const d = byId(id);
  if (!d) { console.log("MISSING row:", id); continue; }
  d.frl_m = f.frl_m;
  if (f.frl_ft != null) d.frl_ft = f.frl_ft;
  d.sources = d.sources || {};
  d.sources.frl_m = f.frl_source;
  d.frl_note = f.frl_note;
  d.verify_status = d.verify_status === "verified" ? "verified" : "frl verified by hand; other figures compiled";
  console.log("frl_m", String(d.frl_m).padStart(7), d.name);
}

/* the mislabelled level: Nagarjunasagar's 179.83 was its FRL, not a maximum water level */
const ns = byId("nagarjunasagar");
ns.max_ow_level_m = 181.051;
ns.max_ow_level_kind = "maximum water level +594.00 ft (KRMB)";
ns.sources.max_ow_level_m = "https://krmb.gov.in/html/project39.html";
ns.notes = (ns.notes || "").replace(/\s+/g, " ").trim()
  + " v7.19: max_ow_level_m corrected to the published maximum water level (+594.00 ft = +181.051 m); the previous 179.83 was the FRL and now lives in frl_m.";

/* say what the other max_ow_level_m values actually are, so nothing is misread as a level */
const kind = {
  mettur: "dam height 120 ft (36.6 m) — NOT a reservoir level; Mettur's FRL as an elevation above MSL is not stated in the sources used",
  sardarsarovar: "maximum water level 140.21 m (SSNNL)",
  tawa: "dam crest level, kind unconfirmed in the sources used",
  gandhisagar: "dam height, kind unconfirmed in the sources used",
  krishnagiri: "dam height, kind unconfirmed in the sources used",
  pamba: "level above MSL, kind unconfirmed in the sources used",
  ghataprabha: "level above MSL, kind unconfirmed in the sources used",
  tungabhadra: "level above MSL, kind unconfirmed in the sources used",
};
for (const [id, k] of Object.entries(kind)) {
  const d = byId(id);
  if (d && d.max_ow_level_m != null) d.max_ow_level_kind = k;
}

/* teach the meta what frl_m means, so nothing downstream mistakes it for a height */
j.meta.units.frl_m = "full reservoir level, metres above mean sea level (published only)";
j.meta.integrity += " v7.19 added frl_m (published full reservoir level above mean sea level) for 4 dams that state one in an official source; every other row keeps null and the deck says so. max_ow_level_kind records what each max_ow_level_m figure actually is, because the field had mixed dam heights and water levels.";

writeFileSync(p, JSON.stringify(j, null, 1));
const filled = j.dams.filter(d => d.frl_m != null);
console.log("\nfrl_m filled:", filled.length, filled.map(d => d.name + " " + d.frl_m + " m").join(" | "));
console.log("rows still without a published reservoir level:", j.dams.length - filled.length);