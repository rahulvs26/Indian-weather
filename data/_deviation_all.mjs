/* v7.20 — sweep every dam and report the courses whose drawn line leaves the mapped network.
   For each dam: the worst distance from any sampled point along the drawn course to the nearest
   mapped river (segment sampling, not vertices), and the segment that causes it. Reported as a
   distribution plus the worst 25 dams, because "make it real for ALL the rivers" needs a number,
   not an impression. */
import {readFileSync} from "node:fs";
import {buildIndex,coastSegments,makeCoastTest,solveRoute,courseDeviation,courseGaps} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const coastTest=makeCoastTest(coast);
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;

const rows=[];
let t0=Date.now(),ok=0,fail=0;
for(const d of dams){
  const c=d.geometry.coordinates,p=d.properties||{};
  try{
    const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:p.name,state:p.state},{coastTest,measure:false});
    const dev=courseDeviation(idx,rivers,r.coords);
    rows.push({name:p.name,river:p.river||"",km:r.totalKm,off:dev.worstKm,gaps:r.gapCount,
      maxSeg:r.maxSegKm,chains:r.chains.join("+"),suspect:r.suspect,sparse:r.sparse});
    ok++;
  }catch(e){fail++;}
}
rows.sort((a,b)=>b.off-a.off);
const offs=rows.map(r=>r.off);
const pct=p=>offs[Math.min(offs.length-1,Math.floor(offs.length*p))];
console.log("dams routed",ok,"failed",fail,"in",((Date.now()-t0)/1000).toFixed(0),"s  ("+((Date.now()-t0)/ok).toFixed(1)+" ms each)");
console.log("worst sampled distance from the drawn line to a mapped river:");
console.log("  p50",pct(0.5),"km  p75",pct(0.75),"km  p90",pct(0.9),"km  p99",pct(0.99),"km  max",offs[0],"km");
for(const t of [0.5,1,2,3,5,8,12]){
  const n=offs.filter(v=>v>t).length;
  console.log("  >"+t+" km:",n,"("+(100*n/offs.length).toFixed(1)+"%)");
}
console.log("\nworst 25:");
console.log("  off_km  maxSeg  gaps   km     dam / river / chains");
for(const r of rows.slice(0,25)){
  console.log("  "+String(r.off).padStart(6)+"  "+String(r.maxSeg).padStart(6)+"  "+String(r.gaps).padStart(5)+"  "
    +String(r.km).padStart(6)+"  "+r.name.slice(0,30).padEnd(30)+" / "+String(r.river).slice(0,16).padEnd(16)+" / "+r.chains.slice(0,44));
}
/* which rivers dominate the bad tail? */
const byRiver={};
for(const r of rows)if(r.off>2){const k=r.river||"(blank)";byRiver[k]=(byRiver[k]||0)+1;}
const top=Object.entries(byRiver).sort((a,b)=>b[1]-a[1]).slice(0,18);
console.log("\ndams over 2 km off, by dam river field:");
console.log("  "+top.map(([k,v])=>k+":"+v).join("  "));
console.log("\nwrite:", "data/_deviation_all.json");