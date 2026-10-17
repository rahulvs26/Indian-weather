/* Pull the provenance note out of each data file that carries one, so the registry quotes the file
   rather than paraphrasing it. Read-only. */
import { readFileSync } from "node:fs";

const files = [
  "data/reservoirs.geojson", "data/river-stats.json", "data/watershed-areas.json",
  "data/dam-facts.json", "data/phenomena.json", "data/subbasin-areas.json",
  "data/river-cities.json", "data/months.json", "data/content.json",
  "data/iod_events.json", "data/radars.json", "data/mjo.json",
  "data/live.example.json", "data/rain-state-avg.json",
];

for (const f of files) {
  let j;
  try { j = JSON.parse(readFileSync(f, "utf8")); } catch { console.log("\n### " + f + "  (unparsed)"); continue; }
  const keys = Object.keys(j);
  console.log("\n### " + f);
  console.log("  keys: " + keys.join(", "));
  for (const k of keys) {
    if (k === "features") continue;
    const v = j[k];
    if (typeof v === "string") console.log("  " + k + ": " + v.slice(0, 400));
    else if (typeof v === "number") console.log("  " + k + ": " + v);
    else if (Array.isArray(v)) console.log("  " + k + ": [" + v.length + " items] " + JSON.stringify(v[0]).slice(0, 160));
    else if (v && typeof v === "object") {
      const s = JSON.stringify(v);
      console.log("  " + k + ": " + s.slice(0, 400));
    }
  }
  /* geo files: read the first feature's property keys, which is where a copied licence string hides */
  if (j.features && j.features[0] && j.features[0].properties) {
    console.log("  first-feature props: " + Object.keys(j.features[0].properties).join(", ").slice(0, 300));
  }
}