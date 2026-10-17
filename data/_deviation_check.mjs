/* v7.18 — does the DRAWN course stay on the river? For a list of dams, report:
     · offKm   the worst distance from the drawn line to the nearest mapped river (segment sampling)
     · gaps    straight connectors longer than GAP_KM, i.e. where the source digitisation breaks
   Vertex-only checks read ~0 km and hide exactly the jumps the viewer complains about. */
import {readFileSync} from "node:fs";
import {buildIndex,coastSegments,makeCoastTest,solveRoute,hav,lineKm} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coastSegs=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const coastTest=makeCoastTest(coastSegs);
const cities=JSON.parse(readFileSync("data/river-cities.json","utf8")).cities;
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;

const names=(process.argv[2]||"Mettur,Hirakud,Vaigai Dam,Tehri,Sardar Sarovar,Nagarjuna Sagar,Chembarambakkam").split(",");
let rows=[];
for(const nm of names){
  const d=dams.find(x=>new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i").test((x.properties||{}).name||""));
  if(!d){console.log("no dam:",nm);continue;}
  const c=d.geometry.coordinates;
  const t0=Date.now();
  const r=solveRoute(idx,rivers,coastSegs,{lon:c[0],lat:c[1],name:(d.properties||{}).name},{coastTest,cities});
  const ms=Date.now()-t0;
  rows.push({dam:(d.properties||{}).name,km:r.totalKm,off:r.offKm,gaps:r.gapCount,maxSeg:r.maxSegKm,sparse:r.sparse,suspect:r.suspect,ms});
}
console.log("dam".padEnd(22),"km".padStart(8),"offKm".padStart(7),"gaps".padStart(5),"maxSeg".padStart(7),"ms".padStart(5),"flags");
for(const r of rows){
  console.log(r.dam.padEnd(22),String(r.km).padStart(8),String(r.off==null?"-":r.off).padStart(7),
    String(r.gaps).padStart(5),String(r.maxSeg).padStart(7),String(r.ms).padStart(5),
    [r.suspect?"SUSPECT":"",r.sparse?"sparse":""].filter(Boolean).join(","));
}
const offs=rows.map(r=>r.off).filter(v=>v!=null).sort((a,b)=>a-b);
if(offs.length){
  const pct=p=>offs[Math.min(offs.length-1,Math.floor(offs.length*p))];
  console.log("\noffKm  p50",pct(0.5),"p90",pct(0.9),"max",offs[offs.length-1],
    "| gaps  total",rows.reduce((s,r)=>s+r.gaps,0),"max",Math.max(...rows.map(r=>r.gaps)));
}