/* inspect one river feature's parts and what the walk does from a point on it */
import {readFileSync} from "node:fs";
import {buildIndex,makeCoastTest,coastSegments,hav,walkFeature,lineKm,recordedEnd} from "./_route-engine.mjs";

const want=process.argv[2]||"Tambraparni";
const from=process.argv[3]?process.argv[3].split(",").map(Number):null;
const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const coastTest=makeCoastTest(coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8"))));
const re=new RegExp(want,"i");
const f=rivers.find(x=>re.test((x.properties||{}).rivname||""));
console.log("feature:",(f.properties||{}).rivname,"len_km",(f.properties||{}).len_km,
  "type",f.geometry.type,"st",[f.properties.st_lon,f.properties.st_lat],"en",[f.properties.en_lon,f.properties.en_lat]);
const parts=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
console.log("parts:",parts.length);
console.log("total vertices:",parts.reduce((s,p)=>s+p.length,0));
let prev=null;
for(let i=0;i<Math.min(parts.length,25);i++){
  const a=parts[i][0],b=parts[i][parts[i].length-1];
  const gap=prev?hav(prev,a):0;
  console.log("  part",i,"pts",parts[i].length,"km",lineKm(parts[i]).toFixed(1),
    "|",a.map(v=>+v.toFixed(3)).join(","),"->",b.map(v=>+v.toFixed(3)).join(","),
    "| gap from previous part start:",gap.toFixed(2),"km");
  prev=b;
}
const longest=[];
for(let i=1;i<parts.length;i++)longest.push({i,gap:+hav(parts[i-1][parts[i-1].length-1],parts[i][0]).toFixed(2)});
longest.sort((a,b)=>b.gap-a.gap);
console.log("largest gaps between consecutive parts:",longest.slice(0,5).map(x=>"p"+(x.i-1)+"->p"+x.i+" "+x.gap+" km").join(", "));
if(from){
  const w=walkFeature(f,from,{coastTest,coastKm:25,linkKm:9});
  console.log("\nwalk from",from,":",w.method,"pts",w.course.length,"km",lineKm(w.course).toFixed(1));
  let mx=0,mxi=-1;
  for(let i=1;i<w.course.length;i++){const d=hav(w.course[i-1],w.course[i]);if(d>mx){mx=d;mxi=i;}}
  console.log("  longest segment",mx.toFixed(2),"km at",mxi);
  console.log("  first pts",w.course.slice(0,3).map(p=>p.map(v=>+v.toFixed(3)).join(",")));
  console.log("  last pts",w.course.slice(-3).map(p=>p.map(v=>+v.toFixed(3)).join(",")));
}