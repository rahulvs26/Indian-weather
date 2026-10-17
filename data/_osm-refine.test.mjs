/* v7.20 — offline fixture test for the OSM course refiner. Synthetic river that meanders hard,
   spine = 3 long straight chords (like the CWC schematic). The refiner must return the meander. */
import {osmRefineCourse} from "./_osm-refine.mjs";

/* a meandering river: a sine wave, 0.02° amplitude, ~0.3° long */
const ways = [];
const n = 400;
const line = [];
for (let i = 0; i <= n; i++) {
  const t = i / n;
  line.push([77.5 + t * 0.30, 10.0 + Math.sin(t * Math.PI * 9) * 0.020]);
}
ways.push(line);

/* a decoy river 25 km north — outside the corridor, must be ignored */
const decoy = [];
for (let i = 0; i <= 60; i++) { const t = i / 60; decoy.push([77.5 + t * 0.30, 10.25 + t * 0.05]); }
ways.push(decoy);

/* the schematic spine: 6 chords straight across the meanders */
const spine = [];
for (let i = 0; i <= 6; i++) spine.push([77.5 + (i / 6) * 0.30, 10.0]);
/* ...with the true ends on the river */
spine[0] = line[0]; spine[spine.length - 1] = line[line.length - 1];

const r = osmRefineCourse(spine, ways, { corridorKm: 4, snapKm: 2.5 });
if (!r) { console.log("FAIL: refiner returned null"); process.exit(1); }
console.log("refined km", r.km, "| spine km", r.spineKm, "| max deviation from spine", r.devKm, "km | kept segs", r.segs);
const gain = r.km / r.spineKm;
console.log("gain", gain.toFixed(3), gain > 1.2 ? "OK (real meander found)" : "FAIL (took the straight shortcut)");
/* how close is every refined point to the true river? */
let worst = 0;
for (const p of r.coords) {
  let d = Infinity;
  for (const q of line) {
    const dx = (p[0] - q[0]) * 111.32 * Math.cos(10 * Math.PI / 180), dy = (p[1] - q[1]) * 111.19;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < d) d = dd;
  }
  if (d > worst) worst = d;
}
console.log("worst refined point off the TRUE river:", worst.toFixed(3), "km", worst < 0.35 ? "OK" : "FAIL");
/* and the decoy must not appear */
const anyNorth = r.coords.some(p => p[1] > 10.12);
console.log("decoy river used:", anyNorth ? "FAIL" : "no");
/* no-OSM fallback: an empty way list must return null so the caller keeps the CWC line */
console.log("empty ways ->", osmRefineCourse(spine, [], {}) === null ? "null (caller keeps the spine) OK" : "FAIL");
/* a spine far from any way must also return null */
console.log("far spine  ->", osmRefineCourse([[60, 20], [60.3, 20]], ways, {}) === null ? "null OK" : "FAIL");