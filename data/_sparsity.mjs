/* how sparse is the source geometry itself? distribution of consecutive-vertex distances across
   all CWC river features, and the same for the courses we build. Tells solver bugs from data gaps. */
import {readFileSync} from "node:fs";
import {buildIndex,solveRoute,coastSegments,hav} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;

const gaps=[];
for(const f of rivers){
  const parts=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const line of parts){
    for(let i=1;i<line.length;i++){
      const d=hav(line[i-1],line[i]);
      if(d>0.01)gaps.push(d);
    }
  }
}
gaps.sort((a,b)=>a-b);
const pct=p=>(gaps[Math.floor(gaps.length*p)]||0).toFixed(2);
console.log("source geometry: consecutive-vertex gaps, n =",gaps.length);
console.log("  p50",pct(0.5),"km | p90",pct(0.9),"| p99",pct(0.99),"| p99.9",pct(0.999),"| max",(gaps[gaps.length-1]||0).toFixed(1));
const over=th=>gaps.filter(g=>g>th).length;
console.log("  gaps > 5 km:",over(5),"| > 10 km:",over(10),"| > 15 km:",over(15),"| > 30 km:",over(30));

/* now the courses */
const sample=dams.filter((d,i)=>i%9===0);
const cg=[];
for(const d of sample){
  const c=d.geometry&&d.geometry.coordinates;
  if(!c)continue;
  try{
    const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:(d.properties||{}).name});
    for(let i=1;i<r.coords.length;i++)cg.push(hav(r.coords[i-1],r.coords[i]));
  }catch(_){}
}
cg.sort((a,b)=>a-b);
const cp=p=>(cg[Math.floor(cg.length*p)]||0).toFixed(2);
console.log("derived courses (1,445 dams): n =",cg.length);
console.log("  p50",cp(0.5),"| p90",cp(0.9),"| p99",cp(0.99),"| max",(cg[cg.length-1]||0).toFixed(1));
console.log("  course gaps > 10 km:",cg.filter(g=>g>10).length,"(",(cg.filter(g=>g>10).length/cg.length*100).toFixed(1),"%)");