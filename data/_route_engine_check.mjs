/* v7.9 coverage check: how many dams actually find a downstream river course, and how fast?
   Run: node data/_route_engine_check.mjs   (read-only; prints stats) */
import {readFileSync} from "node:fs";
import {buildIndex,solveRoute,coastSegments,nearestRiver} from "./_route-engine.mjs";

const t0=Date.now();
const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8"));
const features=(rivers.features||[]).filter(f=>f.geometry&&f.geometry.coordinates);
const idx=buildIndex(features);
let coast=null;
try{coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));}catch(e){}
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;
const H=d=>d.properties&&(d.properties.height_m!=null?d.properties.height_m:d.properties.height);
const withH=dams.filter(d=>typeof H(d)==="number"&&H(d)>0);
console.log("river features",features.length,"| dam records",dams.length,"| with height",withH.length,"| load+index s",((Date.now()-t0)/1000).toFixed(1));

/* coverage of the tallest 400 dams, at two snap radii */
for(const snap of [6,10]){
  let ok=0,fail=0,inland=0;const t=Date.now();const misses=[];
  const top=withH.slice().sort((a,b)=>H(b)-H(a)).slice(0,400);
  for(const d of top){
    const c=d.geometry.coordinates;
    try{
      const r=solveRoute(idx,features,coast,{lon:c[0],lat:c[1],name:d.properties.name,state:d.properties.state,height:H(d)},{snapKm:snap});
      ok++;if(!r.coastal)inland++;
    }catch(e){fail++;if(misses.length<8)misses.push(d.properties.name+" ("+(e.message||"")+")");}
  }
  console.log(`snap ${snap} km → routed ${ok}/400, failed ${fail}, of the routed ${inland} ended inland (${((Date.now()-t)/400).toFixed(1)} ms each)`);
  if(misses.length)console.log("   misses:",misses.join(" | "));
}

/* sample across the tallest dam of each basin */
const byBasin=new Map();
for(const d of withH){const nm=d.properties.name||"";const b=d.properties.basin||d.properties.subbasin||"?";const cur=byBasin.get(b);
  if(!cur||H(d)>H(cur))byBasin.set(b,d);}
let shown=0;
for(const [b,d] of [...byBasin.entries()].sort()){
  if(shown>=12)break;
  const c=d.geometry.coordinates;
  try{
    const r=solveRoute(idx,features,coast,{lon:c[0],lat:c[1],name:d.properties.name,state:d.properties.state,height:H(d)});
    console.log(String(b).padEnd(22),String(d.properties.name).slice(0,26).padEnd(27),String(r.totalKm).padStart(7),"km",String(r.arrivalDays).padStart(6),"d  coastal",r.coastal,"|",r.chains.join(" → ").slice(0,44));
    shown++;
  }catch(e){}
}
console.log("total s",((Date.now()-t0)/1000).toFixed(1));