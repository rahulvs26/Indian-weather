/* why is one course a straight line? print the matched feature, its parts, and the per-segment
   lengths of the produced course. */
import {readFileSync} from "node:fs";
import {buildIndex,solveRoute,coastSegments,makeCoastTest,hav,nearestRiver,nearestOnFeature,recordedEnd,recordedStart,walkFeature,lineKm} from "./_route-engine.mjs";

const name=process.argv[2]||"Papanasam Dam";
const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const coastTest=makeCoastTest(coast);
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;
const d=dams.find(x=>new RegExp(name,"i").test((x.properties||{}).name||""));
const c=d.geometry.coordinates;
console.log("dam",(d.properties||{}).name,(d.properties||{}).river,"pt",c);
const hit=nearestRiver(idx,rivers,c,6,null);
const f=rivers[hit.f],p=f.properties||{};
console.log("matched feature:",p.rivname,"| basin:",p.subbasin,"| len_km:",p.len_km);
console.log("  recorded start",[p.st_lon,p.st_lat],"end",[p.en_lon,p.en_lat]);
console.log("  snap",hit.dKm.toFixed(2),"km");
const parts=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
console.log("  parts:",parts.length,"vertex counts:",parts.map(x=>x.length).slice(0,20).join(","));
/* how straight is each part? */
const LON=111.32*Math.cos(c[1]*Math.PI/180),LAT=111.19;
function devOf(line){
  if(line.length<3)return 0;
  const a=line[0],b=line[line.length-1];
  const ax=a[0]*LON,ay=a[1]*LAT,bx=b[0]*LON,by=b[1]*LAT;
  const abx=bx-ax,aby=by-ay,L=Math.hypot(abx,aby);if(!(L>1))return 0;
  let mx=0;
  for(const q of line){
    const d=Math.abs((q[0]*LON-ax)*aby-(q[1]*LAT-ay)*abx)/L;
    if(d>mx)mx=d;
  }
  return mx;
}
for(let i=0;i<Math.min(6,parts.length);i++){
  console.log("   part",i,"pts",parts[i].length,"km",lineKm(parts[i]).toFixed(1),
    "maxDevFromChord",devOf(parts[i]).toFixed(2),"km","start",parts[i][0].map(v=>+v.toFixed(3)),"end",parts[i][parts[i].length-1].map(v=>+v.toFixed(3)));
}
const w=walkFeature(f,[hit.lon,hit.lat],{coastTest,coastKm:25,linkKm:9});
console.log("walk:",w.method,"pts",w.course.length,"km",lineKm(w.course).toFixed(1),"ends",w.endedAt.map(v=>+v.toFixed(3)),"reachesCoast",w.reachesCoast);
let mx=0,mxi=-1;
for(let i=1;i<w.course.length;i++){const d=hav(w.course[i-1],w.course[i]);if(d>mx){mx=d;mxi=i;}}
console.log("  longest single segment:",mx.toFixed(2),"km at step",mxi);
const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:(d.properties||{}).name});
console.log("solveRoute:",r.totalKm,"km",r.coastal?"COASTAL":"inland","chains",r.chains.join(" -> "));
console.log("  coords",r.coords.length,"start",r.coords[0].map(v=>+v.toFixed(3)),"end",r.coords[r.coords.length-1].map(v=>+v.toFixed(3)));
let m2=0;
for(let i=1;i<r.coords.length;i++)m2=Math.max(m2,hav(r.coords[i-1],r.coords[i]));
console.log("  longest segment after DP:",m2.toFixed(2),"km");
/* what rivers actually exist near this dam? */
console.log("\nnearby CWC features within 12 km:");
for(const cf of (function(){
  const P={LONK:LON,LATK:LAT};const out=[];
  for(let i=0;i<rivers.length;i++){const g=rivers[i].geometry;if(!g)continue;
    for(const line of (g.type==="LineString"?[g.coordinates]:g.coordinates)){
      for(const q of line){ if(!q)continue;
        if(Math.abs(q[0]-c[0])<0.35&&Math.abs(q[1]-c[1])<0.35){const h=nearestOnFeature(rivers[i],c);out.push({i,d:h.dKm,riv:(rivers[i].properties||{}).rivname,len:(rivers[i].properties||{}).len_km});break;} } }
  }
  return out.sort((a,b)=>a.d-b.d).slice(0,10);
})())console.log("  ",String(cf.riv).padEnd(28),cf.d.toFixed(2),"km  len_km",cf.len);