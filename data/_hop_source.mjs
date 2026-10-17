/* where does the long hop come from — inside a feature, or at a chain boundary?
   Reproduces solveRoute's walk chain and reports the km of every hop that exceeds the gate. */
import {readFileSync} from "node:fs";
import {buildIndex,coastSegments,makeCoastTest,hav,walkFeature,nearestRiver,nearestOnFeature,recordedEnd,candidatesNear,reachesSea} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coastTest=makeCoastTest(coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8"))));
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;
const LINK=9,COAST=25;

let inside=0,atBoundary=0,damToSnap=0,n=0,synth=0,srcSparse=0;
const ex=[];
for(let i=0;i<dams.length&&n<600;i+=11){
  const d=dams[i];const c=d.geometry&&d.geometry.coordinates;
  if(!c)continue;
  const hit=nearestRiver(idx,rivers,c,6,null);
  if(!hit)continue;
  let course=[[c[0],c[1]],[hit.lon,hit.lat]];
  const used=new Set();let f=hit.f,from=[hit.lon,hit.lat];
  n++;
  let prevEnd=[hit.lon,hit.lat];
  for(let ci=0;ci<6;ci++){
    const feat=rivers[f];
    if(!feat)break;
    used.add(f);
    const w=walkFeature(feat,from,{coastTest,coastKm:COAST,linkKm:LINK});
    /* the feature's own largest vertex gap, for comparison with what the walk produced */
    const fparts=feat.geometry.type==="LineString"?[feat.geometry.coordinates]:feat.geometry.coordinates;
    let featMax=0;
    for(const line of fparts)for(let k=1;k<line.length;k++)featMax=Math.max(featMax,hav(line[k-1],line[k]));
    /* measure hops inside this leg */
    for(let k=1;k<w.course.length;k++){
      const s=hav(w.course[k-1],w.course[k]);
      if(s>15){
        inside++;
        if(s>featMax+1)synth++;else srcSparse++;
        if(ex.length<10)ex.push((d.properties.name||"?")+" INSIDE "+feat.properties.rivname+" hop "+s.toFixed(1)+" km | feature's own max vertex gap "+featMax.toFixed(1)+" km");
      }
    }
    for(let k=1;k<w.course.length;k++)course.push(w.course[k]);
    const end=w.endedAt||w.course[w.course.length-1];
    prevEnd=end;
    if(reachesSea(end,coastTest,COAST))break;
    let pick=null;
    const cands=candidatesNear(idx,end,LINK).map(cf=>({cf,h:nearestOnFeature(rivers[cf],end)}))
      .filter(x=>x.h.dKm<=LINK).sort((a,b)=>a.h.dKm-b.h.dKm).slice(0,8);
    for(const x of cands){
      if(used.has(x.cf))continue;
      const p=rivers[x.cf].properties||{};
      const len=typeof p.len_km==="number"?p.len_km:0;
      const score=-Math.min(len,1200)*2+(reachesSea(recordedEnd(rivers[x.cf]),coastTest,COAST)?-1e5:0)+x.h.dKm;
      if(!pick||score<pick.score)pick={f:x.cf,score,hit:x.h};
    }
    if(!pick||pick.f===f)break;
    /* the boundary hop: previous walk end -> this feature's snap */
    const b=hav(prevEnd,[pick.hit.lon,pick.hit.lat]);
    if(b>15){atBoundary++;if(ex.length<20)ex.push((d.properties.name||"?")+" BOUNDARY "+rivers[pick.f].properties.rivname+" "+b.toFixed(1)+" km");}
    f=pick.f;from=[pick.hit.lon,pick.hit.lat];
  }
  if(hav([c[0],c[1]],course[1])>15)damToSnap++;
}
console.log("sampled dams",n);
console.log("hops > 15 km INSIDE a walked feature:",inside,"| synthetic (worse than the feature itself):",synth,"| present in the source:",srcSparse);
console.log("hops > 15 km at a CHAIN boundary:",atBoundary);
console.log("dam->snap hops > 15 km:",damToSnap);
for(const e of ex)console.log("  ",e);