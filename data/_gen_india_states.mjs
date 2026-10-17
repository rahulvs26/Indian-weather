/* v7.23g — replace GADM with Natural Earth admin-1 for the India state boundaries.

   WHY THIS EXISTS

   COPYRIGHT-AUDIT.md F1: data/india-states.geo.json is GADM v4.1, and GADM's licence reads

     "freely available for academic use and other non-commercial use.
      Redistribution, or commercial use is not allowed without prior permission."

   There is no attribution-that-satisfies-it option, so this file could not lawfully ship in a
   public repository. Natural Earth is public domain, so this removes the problem rather than
   documenting it.

   WHAT CHANGES AND WHAT DOES NOT

   The deck keys its rainfall data by state: data/months.json `rainStates` and
   data/rain-state-avg.json both use 36 keys, and they are read straight off this polygon's
   NAME_1. Natural Earth names the same 36 units differently ("Andaman and Nicobar" vs
   "AndamanandNicobar", "Delhi" vs "NCTofDelhi"), and splitting them apart here would mean editing
   two data files for no benefit.

   So the geometry is replaced and the EXISTING keys are preserved on NAME_1. Every downstream
   file keeps working untouched. Each feature also carries `name`, the readable Natural Earth
   name, plus `ne_name` and `src` so the provenance is on the data itself and not only in a
   document.

   Two honest mismatches, not papered over:

   1. Natural Earth merges "Dadra and Nagar Haveli" and "Daman and Diu" into one feature, because
      India merged them in 2020. GADM had them as two keys. The merged feature keeps the
      DadraandNagarHaveli key and carries `merged_keys`, so nothing looks lost - it is one
      territory now, and drawing it as one is correct.
   2. Natural Earth has "Ladakh", carved out of Jammu and Kashmir in 2019. There is no GADM key
      and no row in rain-state-avg.json for it, so it gets its own key and simply never matches a
      rainfall highlight. Splitting J&K's rainfall figure across a new unit would be inventing a
      number, so it is left unmatched instead.

   Natural Earth admin-1 at 10m is coarser than GADM 4.1 in places. That is a real downgrade in
   boundary detail and is the price of being able to publish the file at all.

   Run: node data/_gen_india_states.mjs   (needs network)                          */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const OUT = "data/india-states.geo.json";

/* Natural Earth name -> the key this deck already uses. 35 exact pairs plus the two special
   cases handled after the table is built. Keys are taken from the file being replaced, so this
   is a mapping, not a renaming. */
const NE_TO_KEY = {
  "Andaman and Nicobar": "AndamanandNicobar",
  "Andhra Pradesh": "AndhraPradesh",
  "Arunachal Pradesh": "ArunachalPradesh",
  Assam: "Assam",
  Bihar: "Bihar",
  Chandigarh: "Chandigarh",
  Chhattisgarh: "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu": "DadraandNagarHaveli",
  Delhi: "NCTofDelhi",
  Goa: "Goa",
  Gujarat: "Gujarat",
  Haryana: "Haryana",
  "Himachal Pradesh": "HimachalPradesh",
  "Jammu and Kashmir": "JammuandKashmir",
  Jharkhand: "Jharkhand",
  Ladakh: "Ladakh",
  Karnataka: "Karnataka",
  Kerala: "Kerala",
  Lakshadweep: "Lakshadweep",
  "Madhya Pradesh": "MadhyaPradesh",
  Maharashtra: "Maharashtra",
  Manipur: "Manipur",
  Meghalaya: "Meghalaya",
  Mizoram: "Mizoram",
  Nagaland: "Nagaland",
  Odisha: "Odisha",
  Puducherry: "Puducherry",
  Punjab: "Punjab",
  Rajasthan: "Rajasthan",
  Sikkim: "Sikkim",
  "Tamil Nadu": "TamilNadu",
  Telangana: "Telangana",
  Tripura: "Tripura",
  "Uttar Pradesh": "UttarPradesh",
  Uttarakhand: "Uttarakhand",
  "West Bengal": "WestBengal",
};

/* The 36 keys this deck used under GADM, hardcoded rather than read from the file being replaced.
   Reading them from the current file made the guard non-idempotent: after the first run the file
   holds the new keys, so a second run would compare the new set against itself and report success
   without ever checking the original 36. The whole point of the guard is that a key can never
   quietly stop resolving, so it has to compare against the historical set. */
const GADM_KEYS = ["AndamanandNicobar", "AndhraPradesh", "ArunachalPradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "DadraandNagarHaveli", "DamanandDiu", "Goa", "Gujarat", "Haryana",
  "HimachalPradesh", "JammuandKashmir", "Jharkhand", "Karnataka", "Kerala", "Lakshadweep",
  "MadhyaPradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "NCTofDelhi", "Nagaland",
  "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "TamilNadu", "Telangana", "Tripura",
  "UttarPradesh", "Uttarakhand", "WestBengal"];

/* Losses that are real and were declared up front. Anything else that disappears is a bug. */
const EXPECTED_LOSS = {
  DamanandDiu: "merged into DadraandNagarHaveli by India in 2020; carried in merged_keys",
};

const res = await fetch(SRC);
if (!res.ok) { console.log("fetch failed: HTTP", res.status); process.exit(1); }
const ne = await res.json();
const india = ne.features.filter(f => (f.properties.adm0_a3 || "") === "IND");
console.log("  Natural Earth India features:", india.length);

const features = india.map(f => {
  const p = f.properties, name = p.name, key = NE_TO_KEY[name];
  if (!key) throw new Error("no key mapped for Natural Earth name: " + name);
  return {
    type: "Feature",
    properties: {
      NAME_1: key,
      name,
      ne_name: name,
      type: p.type_en || p.type || null,
      iso_3166_2: p.iso_3166_2 || null,
      src: "Natural Earth admin-1 (10m), public domain",
      ...(name === "Dadra and Nagar Haveli and Daman and Diu"
        ? { merged_keys: "DadraandNagarHaveli + DamanandDiu (merged by India in 2020)" } : {}),
      ...(name === "Ladakh"
        ? { note: "Carved out of Jammu and Kashmir in 2019. No row in rain-state-avg.json, so it never matches a rainfall highlight - inventing one is not an option." } : {}),
    },
    geometry: f.geometry,
  };
});

/* the check that matters: every key the deck's data files use must still resolve */
const newKeys = [...new Set(features.map(f => f.properties.NAME_1))].sort();
const lost = GADM_KEYS.filter(k => !newKeys.includes(k));
const unexpected = lost.filter(k => !EXPECTED_LOSS[k]);
const added = newKeys.filter(k => !GADM_KEYS.includes(k));
console.log("  GADM keys:", GADM_KEYS.length, "| still resolving:", GADM_KEYS.length - lost.length);
console.log("  keys dropped:", lost.length ? lost.map(k => k + " (" + EXPECTED_LOSS[k] + ")").join("; ") : "none");
console.log("  keys added  :", added.length ? added.join(", ") : "none");
for (const k of added) {
  const f = features.find(x => x.properties.NAME_1 === k);
  if (f.properties.merged_keys) console.log("    " + k + " carries merged_keys: " + f.properties.merged_keys);
  if (f.properties.note) console.log("    " + k + ": " + f.properties.note);
}

const avg = JSON.parse(readFileSync("data/rain-state-avg.json", "utf8"));
const avgKeys = Object.keys(avg.states);
const unmatched = newKeys.filter(k => !avgKeys.includes(k));
console.log("  keys with no rainfall row:", unmatched.length ? unmatched.join(", ") : "none");

const out = {
  type: "FeatureCollection",
  note: "India state and union-territory boundaries from Natural Earth admin-1 at 10m resolution, "
    + "PUBLIC DOMAIN. Replaces GADM v4.1, whose licence forbids redistribution without permission "
    + "(see COPYRIGHT-AUDIT.md F1). NAME_1 keeps this deck's existing 36 keys so months.json and "
    + "rain-state-avg.json are unaffected; `name` is the readable Natural Earth name. Boundary detail "
    + "is coarser than GADM 4.1 - the cost of being able to publish this file.",
  src: "Natural Earth, ne_10m_admin_1_states_provinces (public domain), filtered to adm0_a3=IND",
  licence: "Public domain (Natural Earth terms: free to use, no permission needed)",
  replaces: "GADM v4.1 (non-commercial, no redistribution without permission)",
  count: features.length,
  features,
};
writeFileSync(OUT, JSON.stringify(out) + "\n", "utf8");

const kb = (JSON.stringify(out).length / 1024).toFixed(1);
console.log("wrote " + OUT + ": " + features.length + " features, " + kb + " KB");
if (unexpected.length) {
  console.log("\nSTOP: undeclared key loss - " + unexpected.join(", ") + ". The rainfall highlight would silently stop working.");
  process.exit(1);
}
console.log("OK: every GADM key resolves, except " + lost.length + " declared merge(s). Re-running is safe.");