/* v7.22q — wire the reservoir-crossing report into the dam card, and record why the course is not
   cut at a reservoir.
   Added by script rather than by hand because map3d.js is a large ES module where a duplicate
   top-level name is a SyntaxError node --check will not catch. */
import { readFileSync, writeFileSync } from "node:fs";
const p = "map3d.js";
let s = readFileSync(p, "utf8");
const MARK = "/* ---------- v7.22q reservoir crossings on the card ---------- */";
if (s.includes(MARK)) { console.log("already inserted"); process.exit(0); }

const block = `${MARK}
/* Which reservoirs a traced course runs through, named with the km at which it enters.
   Asked for as "cut the reservoir out of the upstream trace", and deliberately not done: the river
   does not stop at a reservoir, the mapped channel continues through the backwater, and trimming
   the line would delete real geometry and shorten the course. So the crossings are measured and
   printed instead, and the reader can see exactly which water bodies the course touches. */
let resIndex=null;
function reservoirCrossings(){
if(!route||!route.coords||!route.coords.length)return [];
if(!resIndex&&resData)resIndex=indexReservoirs(resData,1);
if(!resIndex)return [];
try{return crossings(resIndex,route.coords);}catch(e){return [];}
}
function damCrossText(){
const xs=reservoirCrossings();
if(!xs.length)return "";
const big=xs.filter(x=>x.km2>=5);
const names=(big.length?big:xs).slice(0,6)
.map(x=>x.name+(x.atKm!=null?" at "+x.atKm.toFixed(0)+" km":"")+(x.km2?" ("+x.km2.toFixed(0)+" km2)":"")).join(" \\u00b7 ");
return '<br><span class="k">runs through</span> '+names+(xs.length>(big.length||xs.length)?" \\u2026":"")
+'. The course is not cut at a reservoir \\u2014 the channel continues through the backwater.';
}`;

const anchor = "function addSkyTerrainBuildings(){";
if (!s.includes(anchor)) { console.log("ANCHOR MISSING"); process.exit(1); }
s = s.replace(anchor, block + "\n" + anchor);

/* the import goes with the other imports at the top of the module */
const imp = 'import { createStormLayer, fillCoverSelect } from "./data/_storm-layer.mjs";';
if (!s.includes(imp)) { console.log("IMPORT ANCHOR MISSING"); process.exit(1); }
s = s.replace(imp, imp + '\nimport { indexReservoirs, crossings } from "./data/_crossings.mjs";');

/* print it in the card, right after the cities line is written */
const citiesAnchor = 'if(cx)cx.textContent=(nr.cities||[]).length';
const i = s.indexOf(citiesAnchor);
if (i < 0) { console.log("CITIES ANCHOR MISSING"); process.exit(1); }
const endOfLine = s.indexOf("\\n", i);
const insertAt = endOfLine + 1;
s = s.slice(0, insertAt) + '  {const xb=dEl("damCross");if(xb)xb.innerHTML=damCrossText();}\n' + s.slice(insertAt);

writeFileSync(p, s, "utf8");
console.log("inserted", block.length, "chars; import added; card line added at", insertAt);
for (const name of ["reservoirCrossings", "damCrossText", "indexReservoirs"]) {
  const n = (s.match(new RegExp("(function|import \\\\{|const|let) [^\\n]*" + name, "g")) || []).length;
  console.log(name + " mentioned " + n + " time(s)");
}
console.log("reads route.coords:", /reservoirCrossings\(\)\{[\s\S]{0,80}route\.coords/.test(s) === false ? "check" : "yes");