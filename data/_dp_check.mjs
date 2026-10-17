/* is the long hop real, or an artefact of Douglas-Peucker simplification?
   Compare the raw walked course with the simplified one for a sample of dams. */
import {readFileSync} from "node:fs";
import {buildIndex,coastSegments,hav,walkFeature,nearestRiver,makeCoastTest,simplifyDP,DP_TOL_KM,recordedEnd} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coastTest=makeCoastTest(coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8"))));
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;

const mx=arr=>{let m=0;for(let i=1;i<arr.length;i++)m=Math.max(m,hav(arr[i-1],arr[i]));return m;};
let rows=[],rawBig=0,simpBig=0,n=0;
for(let i=0;i<dams.length&&rows.length<400;i+=7){
  const d=dams[i];const c=d.geometry&&d.geometry.coordinates;
  if(!c)continue;
  const h=nearestRiver(idx,rivers,c,6,null);
  if(!h)continue;
  const w=walkFeature(rivers[h.f],[h.lon,h.lat],{coastTest,coastKm:25,linkKm:9});
  if(w.course.length<3)continue;
  const raw=mx(w.course);
  const simp=mx(simplifyDP(w.course,DP_TOL_KM,c[1]));
  n++;
  if(raw>15)rawBig++;
  if(simp>15)simpBig++;
  if(rows.length<12)rows.push((d.properties.name||"?").padEnd(22)+" raw "+raw.toFixed(1)+" km | simplified "+simp.toFixed(1)+" km | pts "+w.course.length+"->"+simplifyDP(w.course,DP_TOL_KM,c[1]).length+(w.gapped?" | GAPPED "+w.worstKm.toFixed(1):"" ));
}
for(const r of rows)console.log(" ",r);
console.log("\nsample",n,"| raw course hops > 15 km:",rawBig,"("+(rawBig/n*100).toFixed(1)+"%) | after DP:",simpBig,"("+(simpBig/n*100).toFixed(1)+"%)");