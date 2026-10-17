/* print a walked course next to the feature's own vertices, to see where a long hop comes from */
import {readFileSync} from "node:fs";
import {buildIndex,coastSegments,makeCoastTest,hav,walkFeature,nearestRiver} from "./_route-engine.mjs";

const damName=process.argv[2]||"Chaker Dam";
const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coastTest=makeCoastTest(coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8"))));
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;
const d=dams.find(x=>new RegExp(damName,"i").test((x.properties||{}).name||""));
const c=d.geometry.coordinates;
const h=nearestRiver(idx,rivers,c,6,null);
const f=rivers[h.f];
console.log("dam",(d.properties||{}).name,"-> feature",(f.properties||{}).rivname,"snap",h.dKm.toFixed(2),"km at",h.lon.toFixed(3),h.lat.toFixed(3));
const parts=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
console.log("parts:",parts.length,"total vertices:",parts.reduce((s,p)=>s+p.length,0));
/* which part/segment holds the snap? */
let best={d:Infinity};
for(let i=0;i<parts.length;i++)for(let s=0;s<parts[i].length-1;s++){
  const a=parts[i][s],b=parts[i][s+1];
  const abx=(b[0]-a[0])*111.32*Math.cos(c[1]*Math.PI/180),aby=(b[1]-a[1])*111.19;
  const L2=abx*abx+aby*aby;
  const t=L2?Math.max(0,Math.min(1,(((h.lon-a[0])*111.32*Math.cos(c[1]*Math.PI/180))*abx+((h.lat-a[1])*111.19)*aby)/L2)):0;
  const dx=h.lon*111.32*Math.cos(c[1]*Math.PI/180)-(a[0]*111.32*Math.cos(c[1]*Math.PI/180)+abx*t);
  const dy=h.lat*111.19-(a[1]*111.19+aby*t);
  const dd=Math.hypot(dx,dy);
  if(dd<best.d)best={d:dd,i,s};
}
console.log("snap sits in part",best.i,"segment",best.s,"of",parts[best.i].length-1,"| that part starts",parts[best.i][0].map(v=>+v.toFixed(3)),"ends",parts[best.i][parts[best.i].length-1].map(v=>+v.toFixed(3)));
console.log("part vertex spacing (km):",parts[best.i].map((q,j)=>j?hav(parts[best.i][j-1],q).toFixed(1):"-").join(" "));
const w=walkFeature(f,[h.lon,h.lat],{coastTest,coastKm:25,linkKm:9});
console.log("\nwalk",w.method,"pts",w.course.length,"gapped",w.gapped,"worst",w.worstKm);
console.log("course:");
w.course.forEach((p,i)=>{const prev=i?hav(w.course[i-1],p):0;console.log("  ",i,p.map(v=>+v.toFixed(3)).join(","),(i?"hop "+prev.toFixed(1)+" km":""))});