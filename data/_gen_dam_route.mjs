/* v7.6 dam-route generator: derive the hero route for the dam-release water
   simulation — Hirakud dam -> Mahanadi -> Bay of Bengal.
   Sources (repo data only, no invented geometry):
     · data/rivers-cwc.geo.json — CWC WRIS network; the single feature with
       rivname == "Mahanadi River" (subbasin "Major River", len_km 1045.7) is a
       30-segment MultiLineString (no order); its recorded course runs from the
       origin near Sihawa (20.224,81.992) to the sea mouth (20.295,86.713).
     · data/dams.geo.json — CWC dam points; "Hirakud Dam" (Odisha, river Mahanadi).
   Steps: greedy downstream walk over the segments — start at the point nearest the
   dam, at every junction prefer the unvisited segment whose far end is nearest the
   sea — then prepend the exact dam point (river passes within SNAP_KM), simplify
   with Douglas-Peucker (DP_TOL_KM), write data/dam-route-hirakud.geo.json (route +
   recorded provenance + illustrative travel-speed meta).
   Run: node data/_gen_dam_route.mjs   (rewrites data/dam-route-hirakud.geo.json) */
import {readFileSync,writeFileSync} from "node:fs";

const RIVERS="data/rivers-cwc.geo.json";
const DAMS="data/dams.geo.json";
const OUT="data/dam-route-hirakud.geo.json";
const DAM_NAME="Hirakud Dam";
const RIVER_NAME="Mahanadi River";
const SPEED_M_S=1.5;            /* illustrative kinematic flood-wave speed (v1, not measured) */
const KM_DAY=SPEED_M_S*86.4;    /* -> 129.6 km/day */
const SNAP_KM=4;                /* prepend the dam point only if the river passes within this */
const LINK_KM=9;                /* max gap between segment ends to link them into one course */
const REACH_KM=3;               /* walk is done when this close to the recorded sea end */
const DP_TOL_KM=0.065;          /* ≈65 m — keeps bends at ~1 km scale, drops digitisation noise */

const R=6371.0088;
const rad=d=>d*Math.PI/180;
const hav=(a,b)=>{const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);const s=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(s));};

/* local equirectangular km-plane around the route (lat ≈21) for nearest-point / DP */
const LAT0=21.2,LONK=111.32*Math.cos(rad(LAT0)),LATK=111.19;
const P=p=>[p[0]*LONK,p[1]*LATK];
const dist2=(a,b)=>{const dx=a[0]-b[0],dy=a[1]-b[1];return dx*dx+dy*dy;};
/* nearest point on segment a->b to q (km-plane): {t,d} */
const segHit=(a,b,q)=>{const abx=b[0]-a[0],aby=b[1]-a[1],L2=abx*abx+aby*aby;const t=L2?Math.max(0,Math.min(1,((q[0]-a[0])*abx+(q[1]-a[1])*aby)/L2)):0;return{t,d:dist2(q,[a[0]+abx*t,a[1]+aby*t])};};

const rivers=JSON.parse(readFileSync(RIVERS,"utf8"));
const dams=JSON.parse(readFileSync(DAMS,"utf8"));

const damF=dams.features.find(f=>f.properties.name===DAM_NAME);
if(!damF)throw new Error("dam not found: "+DAM_NAME);
const DAM=damF.geometry.coordinates;                         /* [lon,lat] */
console.log("dam:",JSON.stringify(damF.properties),"at",DAM);

const rivF=rivers.features.find(f=>(f.properties.rivname||"").trim()===RIVER_NAME);
if(!rivF)throw new Error("river not found: "+RIVER_NAME);
const pr=rivF.properties;
console.log("river:",pr.rivname,"| basin",pr.basin,"| subbasin",pr.subbasin,"| len_km",pr.len_km,
"| recorded st",[pr.st_lon,pr.st_lat],"en",[pr.en_lon,pr.en_lat]);

const SEA=[pr.en_lon,pr.en_lat];
const parts=rivF.geometry.type==="LineString"?[rivF.geometry.coordinates]:rivF.geometry.coordinates.map(p=>p.slice());
if(parts.length<2)console.log("note: single-part course");

/* 1) nearest point on ANY segment to the dam — that locates the start + its segment */
const dpp=P(DAM);let start={pi:-1,si:-1,t:0,d:Infinity};
for(let pi=0;pi<parts.length;pi++)for(let si=0;si<parts[pi].length-1;si++){
  const h=segHit(P(parts[pi][si]),P(parts[pi][si+1]),dpp);
  if(h.d<start.d)start={pi,si,t:h.t,d:h.d};
}
const dkm=Math.sqrt(start.d);
console.log("nearest river point to dam: part",start.pi,"seg",start.si,"t",start.t.toFixed(3),"| distance km",dkm.toFixed(2));
const segA=parts[start.pi][start.si],segB=parts[start.pi][start.si+1];
const hit=[segA[0]+(segB[0]-segA[0])*start.t,segA[1]+(segB[1]-segA[1])*start.t];

/* 2) greedy downstream walk: always continue on the unvisited segment whose far end
      is nearest the sea (delta braids + duplicate stubs resolve to the main stem) */
const visited=new Set(),chain=[];
let pi=start.pi,pos;
{/* first part: from the hit point toward the seaward end of its segment */
  visited.add(pi);
  const fwd=hav(segB,SEA)<hav(segA,SEA);
  const pts=fwd?parts[pi].slice(start.si+1):parts[pi].slice(0,start.si+1).reverse();
  chain.push(pts);pos=pts[pts.length-1];
}
const routeIdx=[start.pi];
for(let guard=0;guard<parts.length+2;guard++){
  if(hav(pos,SEA)<=REACH_KM)break;
  let best=null;
  for(let k=0;k<parts.length;k++){
    if(visited.has(k))continue;
    for(const rev of [false,true]){
      const s=rev?parts[k][parts[k].length-1]:parts[k][0];
      const e=rev?parts[k][0]:parts[k][parts[k].length-1];
      const gap=hav(pos,s);if(gap>LINK_KM)continue;
      const score=hav(e,SEA);      /* prefer the branch that lands closest to the sea */
      if(!best||score<best.score-0.25||(Math.abs(score-best.score)<=0.25&&gap<best.gap))best={k,rev,gap,score};
    }
  }
  if(!best)throw new Error("walk stuck at "+pos+" — no unvisited segment within "+LINK_KM+" km");
  visited.add(best.k);routeIdx.push(best.k);
  const pts=(best.rev?parts[best.k].slice().reverse():parts[best.k].slice());
  pts[0]=pos.slice();               /* bridge digitisation gaps with the previous end */
  chain.push(pts);pos=pts[pts.length-1];
}
console.log("walk parts:",routeIdx.join(" -> "));
if(hav(pos,SEA)>REACH_KM)throw new Error("walk ended "+hav(pos,SEA).toFixed(1)+" km short of the recorded sea end");
const course=chain.reduce((acc,pts)=>acc.concat(acc.length?pts.slice(1):pts),[]);
console.log("walked course:",course.length,"pts | first",course[0],"| sea end",pos);

/* 3) assemble the route: exact dam point (when close enough) + hit on the river + walked tail */
const route=(dkm<=SNAP_KM?[[DAM[0],DAM[1]]]:[]).concat([hit],course);
const sea=route[route.length-1];
console.log("route pts (raw)",route.length,"| first",route[0],"| sea mouth",sea);

/* 4) Douglas-Peucker in km-plane */
function dp(pts,tol){
  if(pts.length<3)return pts.slice();
  const a=P(pts[0]),b=P(pts[pts.length-1]);
  const abx=b[0]-a[0],aby=b[1]-a[1],L=Math.hypot(abx,aby)||1e-9;
  let mi=0,md=-1;
  for(let i=1;i<pts.length-1;i++){
    const q=P(pts[i]);
    const d=Math.abs((q[0]-a[0])*aby-(q[1]-a[1])*abx)/L;
    if(d>md){md=d;mi=i;}
  }
  if(md<=tol)return [pts[0],pts[pts.length-1]];
  return dp(pts.slice(0,mi+1),tol).slice(0,-1).concat(dp(pts.slice(mi),tol));
}
const rawKm=route.reduce((s,q,i)=>i?s+hav(route[i-1],q):0,0);
const simp=dp(route,DP_TOL_KM).map(q=>[+q[0].toFixed(5),+q[1].toFixed(5)]);
const lenKm=simp.reduce((s,q,i)=>i?s+hav(simp[i-1],q):0,0);
const arrival=lenKm/KM_DAY;
console.log("simplified",route.length,"->",simp.length,"pts | length raw",rawKm.toFixed(1),"km | simplified",lenKm.toFixed(1),"km | arrival days @1.5 m/s:",arrival.toFixed(2));

/* 5) drive-by sanity: known Mahanadi towns must lie near the route (not written to the file) */
const towns={Sambalpur:[83.975,21.4665],Cuttack:[85.879,20.462],Paradip:[86.61,20.316],"sea-end checkpoint":[86.713,20.295]};
for(const [n,t] of Object.entries(towns)){
  let m=Infinity;
  for(let i=0;i<simp.length-1;i++){
    const h=segHit(P(simp[i]),P(simp[i+1]),P(t));m=Math.min(m,Math.sqrt(h.d));
  }
  console.log("sanity · distance",n,"-> route",m.toFixed(1),"km");
}

const out={
  type:"FeatureCollection",
  features:[{
    type:"Feature",
    properties:{
      name:"Hirakud dam → Mahanadi → Bay of Bengal",
      river:"Mahanadi",
      dam:{name:damF.properties.name,lon:DAM[0],lat:DAM[1],src:"data/dams.geo.json — CWC/WRIS point (name 'Hirakud Dam', Odisha, river 'Mahanadi', year 1957)"},
      sea_mouth:{name:"Bay of Bengal — Mahanadi delta mouth (near Paradip, Odisha)",lon:SEA[0],lat:SEA[1],src:`CWC '${RIVER_NAME}' recorded sea end (en_lon/en_lat); the walked course ends at ${sea[0]},${sea[1]}`},
      derived_from:`data/rivers-cwc.geo.json — feature rivname '${RIVER_NAME}' (CWC WRIS, subbasin '${pr.subbasin}', len_km ${pr.len_km}, 30-part MultiLineString): greedy downstream walk from the point nearest the ${DAM_NAME} to the recorded sea end, then Douglas-Peucker ≈${(DP_TOL_KM*1000)|0} m`,
      length_km:+lenKm.toFixed(1),
      speed_m_s:SPEED_M_S,
      arrival_days:+arrival.toFixed(2),
      speed_note:"ILLUSTRATIVE kinematic flood-wave speed (constant, v1 — not measured for this release); days = length_km ÷ (speed × 86.4 km/day)",
      note:"Route geometry = real CWC centre-line (bends preserved). Travel only — no inundation, no hydraulics in v1."
    },
    geometry:{type:"LineString",coordinates:simp}
  }]
};
writeFileSync(OUT,JSON.stringify(out));
console.log("wrote",OUT,"(",simp.length,"pts,",lenKm.toFixed(1),"km )");
