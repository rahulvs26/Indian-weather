/* v7.16 route-quality audit: find courses that are NOT river paths, across all 13,002 dams.
   A real course follows a mapped channel with many vertices. Degenerate cases:
     - 2-point courses (dam -> snap, no channel walked) drawn as a straight line
     - courses whose max deviation from the straight dam->end chord is tiny (a chord, not a river)
     - courses the engine flags `suspect` (a vertex-to-vertex hop longer than the gate)
   usage: node data/_route_quality.mjs [nameFilter] */
import {readFileSync} from "node:fs";
import {buildIndex,solveRoute,coastSegments} from "./_route-engine.mjs";

const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;

function maxDeviationKm(coords){
  if(!coords||coords.length<3)return 0;
  const a=coords[0],b=coords[coords.length-1];
  const LON=111.32*Math.cos(a[1]*Math.PI/180),LAT=111.19;
  const ax=a[0]*LON,ay=a[1]*LAT,bx=b[0]*LON,by=b[1]*LAT;
  const abx=bx-ax,aby=by-ay,L=Math.hypot(abx,aby);
  if(!(L>1))return 0;
  let mx=0;
  for(const p of coords){
    const d=Math.abs((p[0]*LON-ax)*aby-(p[1]*LAT-ay)*abx)/L;
    if(d>mx)mx=d;
  }
  return mx;
}

const filter=process.argv[2];
const re=filter?new RegExp(filter,"i"):null;
const list=re?dams.filter(d=>re.test((d.properties||{}).name||"")):dams;
console.log("auditing",list.length,"dams"+(filter?" matching "+filter:""));
const t0=Date.now();
let ok=0,twoPoint=0,straight=0,fail=0,coastal=0,suspect=0;
const maxSegs=[],pts=[];
const samples={two:[],straight:[],fail:[],sus:[]};
for(const d of list){
  const c=d.geometry&&d.geometry.coordinates;
  if(!c){fail++;continue;}
  try{
    const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:(d.properties||{}).name});
    ok++;
    if(r.coastal)coastal++;
    if(r.suspect){suspect++;if(samples.sus.length<8)samples.sus.push((d.properties||{}).name+" seg "+r.maxSegKm+" km");}
    const n=(r.coords||[]).length;
    const dev=maxDeviationKm(r.coords);
    maxSegs.push(r.maxSegKm||0);
    pts.push(n);
    if(n<=2){twoPoint++;if(samples.two.length<8)samples.two.push((d.properties||{}).name+" "+n+" pts "+r.totalKm+" km chains["+r.chains.join(">")+"]");}
    else if(dev<1&&n<=4){straight++;if(samples.straight.length<8)samples.straight.push((d.properties||{}).name+" "+n+" pts dev "+dev.toFixed(2)+" km "+r.totalKm+" km");}
  }catch(e){fail++;if(samples.fail.length<6)samples.fail.push((d.properties||{}).name+": "+(e.message||e));}
}
const pct=(arr,p)=>{const a=arr.slice().sort((x,y)=>x-y);return +(a[Math.floor(a.length*p)]||0).toFixed(1);};
console.log("routed",ok,"| failed",fail,"| coastal",coastal,"| SUSPECT (not drawn)",suspect);
console.log("DEGENERATE 2-point (straight dam->snap, no channel):",twoPoint,"("+(twoPoint/Math.max(1,list.length)*100).toFixed(2)+"%)");
console.log("near-straight (dev < 1 km, <= 4 pts):",straight);
console.log("course vertices: p50",pct(pts,0.5),"p95",pct(pts,0.95));
console.log("longest segment km: p50",pct(maxSegs,0.5),"p95",pct(maxSegs,0.95),"p99",pct(maxSegs,0.99),"max",Math.max(...maxSegs).toFixed(1));
if(samples.two.length)console.log("  2-point examples:",samples.two.join(" | "));
if(samples.straight.length)console.log("  straight examples:",samples.straight.join(" | "));
if(samples.sus.length)console.log("  suspect examples:",samples.sus.join(" | "));
if(samples.fail.length)console.log("  failures:",samples.fail.join(" | "));
console.log("elapsed",((Date.now()-t0)/1000).toFixed(1),"s");