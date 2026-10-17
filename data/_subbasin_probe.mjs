/* v7.22k — why the storm layer printed a catchment far too large for a small river.
   Question to answer from the data: is the polygon matched by subbasinAt() actually the dam's
   catchment, or a much coarser tile? Prints the tile name, how many separate rivers it holds and
   the total mapped channel inside it, so the answer is measured rather than argued. */
import { readFileSync } from "node:fs";

const r = JSON.parse(readFileSync("data/rivers-cwc.geo.json", "utf8"));
const hav = (a, b) => {
  const R = 6371, rd = x => x * Math.PI / 180;
  const dLa = rd(b[1] - a[1]), dLo = rd(b[0] - a[0]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rd(a[1])) * Math.cos(rd(b[1])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const lenKm = f => {
  const g = f.geometry;
  const cs = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  let s = 0;
  for (const c of cs) for (let i = 1; i < c.length; i++) s += hav(c[i - 1], c[i]);
  return s;
};

const hits = r.features.filter(f => /vaippar/i.test(f.properties.subbasin || ""));
const tileName = hits.length ? hits[0].properties.subbasin : "(none)";
const rivers = [...new Set(hits.map(f => f.properties.rivname))];
console.log("features whose SUBBASIN name contains 'vaippar':", hits.length);
console.log("that one tile is called:", tileName);
console.log("separate rivers inside it:", rivers.length);
console.log("  e.g.", rivers.slice(0, 8).join(", "));
console.log("  and:", rivers.slice(-6).join(", "));
console.log("total mapped channel inside that single tile:", hits.reduce((s, f) => s + lenKm(f), 0).toFixed(0), "km");

const areas = JSON.parse(readFileSync("data/subbasin-areas.json", "utf8"));
const row = areas.subbasins.find(s => /vaippar/i.test(s.name));
console.log("\nthe polygon subbasinAt() matched for Irukkangudi:", JSON.stringify(row));
console.log("basin:", row && row.basin);

/* the Vaippar river itself, for scale */
const vp = r.features.filter(f => /^vaippar$/i.test(f.properties.rivname || ""));
console.log("\nfeatures NAMED Vaippar:", vp.length, "=", vp.reduce((s, f) => s + lenKm(f), 0).toFixed(0), "km");