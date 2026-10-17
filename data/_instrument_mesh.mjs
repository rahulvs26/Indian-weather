/* v7.23b — sub-instrument buildTerrain()'s `mesh` phase.

   Why: t3Stats reported mesh=4752 ms, the single largest phase, with nothing measured inside it.
   A 4.75-second phase with no breakdown is how a 9.3-second build stayed invisible. These timers
   answer one question - where inside the mesh phase does the time go - so the optimisation targets
   the real cost instead of the suspected one.

   Kept in, not thrown away after measuring: the next person to touch the terrain code will need
   these numbers, and this project has already had one profiler whose output nobody could read. */
const PATCHES = [
  ['const THREE=await import("three");', 'const THREE=await import("three");_t3("threeImport");'],
  ['const cv=document.createElement("canvas");cv.width=cv.height=T;',
   'const cv=document.createElement("canvas");cv.width=cv.height=T;_t3("tileFetch");'],
  ['const lonLT=(x0/Math.pow(2,TB.z))*360-180, spanLon=NX*360/Math.pow(2,TB.z);',
   '_t3("tileDecode");\nconst lonLT=(x0/Math.pow(2,TB.z))*360-180, spanLon=NX*360/Math.pow(2,TB.z);'],
  ['const W=3.4,D=2.55,SX=768,SY=672;',
   '_t3("blur");\nconst W=3.4,D=2.55,SX=768,SY=672;'],
  ['geo.computeVertexNormals();',
   '_t3("meshVerts");\ngeo.computeVertexNormals();_t3("normals");'],
];

import { readFileSync, writeFileSync } from "node:fs";
let s = readFileSync("app.js", "utf8");
if (s.includes('_t3("tileFetch")')) { console.log("already instrumented"); process.exit(0); }
for (const [from, to] of PATCHES) {
  if (!s.includes(from)) { console.log("MISS:", from.slice(0, 60)); process.exit(1); }
  s = s.replace(from, to);
}
writeFileSync("app.js", s, "utf8");
console.log("inserted " + PATCHES.length + " sub-timers into the mesh phase");
for (const [, to] of PATCHES) {
  const key = (to.match(/_t3\("([^"]+)"\)/) || [])[1];
  console.log("  " + (s.includes('_t3("' + key + '")') ? "ok  " : "MISS") + " " + key);
}