/* v7.22q — does the crossing detection find the reservoirs a course actually runs through?
   Tested against geometry rather than against itself: a synthetic course drawn straight through a
   known polygon must be reported, a course 50 km away must not be, and a course clipped by the
   reservoir's hole must not be reported as inside. */
import { readFileSync } from "node:fs";
import { indexReservoirs, crossings, sampleCourse } from "./_crossings.mjs";

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "OK   " : "FAIL ") + label.padEnd(50), "got", JSON.stringify(got), ok ? "" : "expected " + JSON.stringify(want));
};

/* a square reservoir, and one with a hole in it */
const square = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const fc = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { res_name: "Test Res", area_km2: 100, river: "Test" },
      geometry: { type: "Polygon", coordinates: square(77.0, 8.5, 77.2, 8.7) } },
    { type: "Feature", properties: { res_name: "Hole Res", area_km2: 50, river: "Test" },
      geometry: { type: "Polygon", coordinates: [
        square(78.0, 9.0, 78.3, 9.3)[0],
        square(78.1, 9.1, 78.2, 9.2)[0].slice().reverse(),
      ] } },
    { type: "Feature", properties: { res_name: "Tiny Tank", area_km2: 0.2, river: "Test" },
      geometry: { type: "Polygon", coordinates: square(77.5, 8.55, 77.51, 8.56) } },
  ],
};
const idx = indexReservoirs(fc, 1);
console.log("reservoirs indexed (>= 1 km2):", idx.length, "of 3 — the 0.2 km2 tank is skipped");
eq("tiny reservoir is not indexed", idx.length, 2);

/* a course straight through the square, west to east at lat 8.6 */
const through = [[76.9, 8.6], [77.3, 8.6]];
const cum = [0, 44.5];
const hit = crossings(idx, through);
console.log("\na course straight through Test Res ->", JSON.stringify(hit));
eq("finds exactly one crossing", hit.length, 1);
eq("  and it is the right one", hit[0] && hit[0].name, "Test Res");
eq("  reported at the right km", hit[0] && Math.round(hit[0].atKm), 11);

/* a course 50 km north of everything */
const far = [[76.9, 9.4], [77.3, 9.4]];
eq("a course well away finds nothing", crossings(idx, far).length, 0);

/* a course through the hole of Hole Res must not count as inside */
const holeLine = [[78.12, 9.15], [78.18, 9.15]];
eq("a course inside a hole is not a crossing", crossings(idx, holeLine).length, 0);
/* and one across the ring of the same reservoir must count */
const ringLine = [[78.02, 9.02], [78.28, 9.02]];
eq("a course across the ring is a crossing", crossings(idx, ringLine).length, 1);
/* the first version of this test ran the line from 78.05 to 78.25 and expected no crossing, which was
   wrong: that course enters the water at 78.05-78.10 and again at 78.20-78.25, so it does cross. */
eq("a course over the island still crosses the water", crossings(idx, [[78.02, 9.15], [78.28, 9.15]]).length, 1);

/* sampling density: a wide reservoir with no vertex of the course inside it */
console.log("\nsampling every 0.2 km:", sampleCourse([[0, 0], [0, 1]], 0.2).pts.length, "points over 111 km");
const okLen = sampleCourse([[0, 0], [0, 1]], 0.2).pts.length > 500;
console.log((okLen ? "OK   " : "FAIL ") + "dense enough to fall inside a reservoir wider than the vertex spacing");
if (!okLen) fails++;
eq("no coordinates -> no crossings", crossings(idx, []).length, 0);
eq("no index -> no crossings", crossings(null, through).length, 0);

console.log("\nthe real reservoir file:");
const real = JSON.parse(readFileSync("data/reservoirs.geojson", "utf8"));
const ridx = indexReservoirs(real, 1);
console.log("  indexed for crossing tests:", ridx.length, "of", real.features.length);
/* the Neyyar reservoir is on the Manimuthar upstream course the user reported */
const vm = ridx.filter(e => /neyyar/i.test(e.p.res_name || ""));
console.log("  Neyyar records:", vm.length, vm.slice(0, 3).map(e => e.p.res_name + " " + e.p.area_km2 + " km2 at " +
  e.minX.toFixed(2) + "," + e.minY.toFixed(2)).join(" | "));

console.log(fails ? "\nFAILURES: " + fails : "\nall checks passed");