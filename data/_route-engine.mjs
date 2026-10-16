/* v7.9 dam→sea course solver — SHARED by the browser worker and the offline generator.
   Pure geometry on the repo's own shapefiles; no invented geometry, no network calls here.
   Inputs : CWC WRIS river network features (rivers-cwc.geo.json) + a coast polyline (india-detailed.geo.json)
   Output : the downstream course from a dam point to the coast, with km and (illustrative) days.

   Algorithm (ported from data/_gen_dam_route.mjs, generalised from one dam to every dam):
     1) bbox grid over FEATURES (cheap: ~30k entries)  -> nearest river to a point
     2) nearest point on that river (≤ SNAP_KM)
     3) greedy downstream walk over the river's unordered parts, always taking the
        unvisited part whose far end is nearest the river's recorded end (en_lon/en_lat)
     4) chaining: if the walk ends inland, take the river within LINK_KM whose recorded
        end is nearest the coast, and continue (≤ MAX_CHAINS rivers)
     5) coast test against the outline (≤ COAST_KM)  -> coastal true/false, honestly reported
     6) Douglas-Peucker simplify + haversine length + days = km / (speed × 86.4)
   The travel speed is ILLUSTRATIVE (kinematic, not measured) — say so in any readout. */

export const SNAP_KM=6;      /* dam → its river: give up beyond this */
export const LINK_KM=9;      /* max gap between parts/rivers to link into one course */
export const REACH_KM=3;     /* a walk is finished when this close to the recorded river end */
export const DP_TOL_KM=0.065;/* ≈65 m — keeps real bends, drops digitisation noise */
export const COAST_KM=25;    /* terminal point within this of the outline = reached the coast */
export const MAX_CHAINS=6;   /* rivers chained in one course (tributary → main stem → …) */
export const SPEED_M_S=1.5;  /* ILLUSTRATIVE kinematic flood-wave speed */
export const KM_DAY=SPEED_M_S*86.4;   /* 129.6 km/day */

const R_EARTH=6371.0088;
const rad=d=>d*Math.PI/180;
export function hav(a,b){
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R_EARTH*Math.asin(Math.sqrt(s));
}

/* local equirectangular km-plane (per query latitude) for nearest-point + DP tolerance */
const plane=lat0=>({LONK:111.32*Math.cos(rad(lat0)),LATK:111.19});
const toP=(P,p)=>[p[0]*P.LONK,p[1]*P.LATK];
/* nearest point on segment a→b to q, in the km-plane: {t, d2} */
function segHit(P,a,b,q){
  const ax=P.LONK*a[0],ay=P.LATK*a[1],bx=P.LONK*b[0],by=P.LATK*b[1];
  const qx=P.LONK*q[0],qy=P.LATK*q[1];
  const abx=bx-ax,aby=by-ay,L2=abx*abx+aby*aby;
  const t=L2?Math.max(0,Math.min(1,((qx-ax)*abx+(qy-ay)*aby)/L2)):0;
  const dx=qx-(ax+abx*t),dy=qy-(ay+aby*t);
  return {t,d2:dx*dx+dy*dy};
}

/* ---------------------------------------------------------------- index ---- */
/* One grid cell per FEATURE bbox (not per segment): ~30k inserts, ~0 MB of overhead,
   and a query returns only the handful of rivers that can possibly be nearby. */
export function buildIndex(features,cell=0.25){
  const cells=new Map(),boxes=[];
  for(let f=0;f<features.length;f++){
    const g=features[f].geometry;
    if(!g||!g.coordinates)continue;
    const parts=g.type==="LineString"?[g.coordinates]:g.coordinates;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const line of parts)for(const c of line){
      if(!c||c.length<2)continue;
      if(c[0]<x0)x0=c[0];if(c[0]>x1)x1=c[0];
      if(c[1]<y0)y0=c[1];if(c[1]>y1)y1=c[1];
    }
    if(!isFinite(x0))continue;
    boxes[f]=[x0,y0,x1,y1];
    const i0=Math.floor(x0/cell),i1=Math.floor(x1/cell),j0=Math.floor(y0/cell),j1=Math.floor(y1/cell);
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){
      const k=i*100000+j;
      let arr=cells.get(k);
      if(!arr){arr=[];cells.set(k,arr);}
      arr.push(f);
    }
  }
  return {cells,boxes,cell};
}

/* candidate feature indices near a point (deduped, bbox-checked) */
export function candidatesNear(idx,pt,padKm=0){
  const P=plane(pt[1]),cell=idx.cell;
  const i0=Math.floor((pt[0]-padKm/P.LONK)/cell),i1=Math.floor((pt[0]+padKm/P.LONK)/cell);
  const j0=Math.floor((pt[1]-padKm/P.LATK)/cell),j1=Math.floor((pt[1]+padKm/P.LATK)/cell);
  const seen=new Set();
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){
    const arr=idx.cells.get(i*100000+j);
    if(arr)for(const f of arr)seen.add(f);
  }
  const out=[];
  for(const f of seen){
    const b=idx.boxes[f];if(!b)continue;
    if(pt[0]<b[0]-padKm/P.LONK||pt[0]>b[2]+padKm/P.LONK||pt[1]<b[1]-padKm/P.LATK||pt[1]>b[3]+padKm/P.LATK)continue;
    out.push(f);
  }
  return out;
}

/* nearest point on feature f to pt: {t, dKm, lon, lat} */
export function nearestOnFeature(feature,pt){
  const P=plane(pt[1]);
  const g=feature.geometry;
  const parts=g.type==="LineString"?[g.coordinates]:g.coordinates;
  let best={dKm:Infinity,t:0,lon:pt[0],lat:pt[1]};
  for(const line of parts)for(let s=0;s<line.length-1;s++){
    const a=line[s],b=line[s+1];
    if(!a||!b)continue;
    const h=segHit(P,a,b,pt);
    if(h.d2<best.dKm*best.dKm){
      best={dKm:Math.sqrt(h.d2),t:h.t,lon:a[0]+(b[0]-a[0])*h.t,lat:a[1]+(b[1]-a[1])*h.t};
    }
  }
  return best;
}

export function nearestRiver(idx,features,pt,maxKm,exclude){
  let best=null;
  for(const f of candidatesNear(idx,pt,maxKm)){
    if(exclude&&exclude.has(f))continue;
    const h=nearestOnFeature(features[f],pt);
    if(h.dKm<=maxKm&&(!best||h.dKm<best.dKm))best=Object.assign({f},h);
  }
  return best;
}

export function recordedEnd(feature){
  const p=feature.properties||{};
  if(typeof p.en_lon==="number"&&typeof p.en_lat==="number")return [p.en_lon,p.en_lat];
  const g=feature.geometry,parts=g.type==="LineString"?[g.coordinates]:g.coordinates;
  let far=null,fd=-1;
  for(const line of parts)for(const c of line){if(!c)continue;}
  /* fall back: the vertex furthest from the feature's start */
  const st=(typeof p.st_lon==="number")?[p.st_lon,p.st_lat]:(parts[0]&&parts[0][0]);
  if(st)for(const line of parts)for(const c of line){if(!c)continue;const d=hav(st,c);if(d>fd){fd=d;far=c;}}
  return far;
}

/* greedy walk inside ONE river feature, from a point on it to its recorded end */
export function walkFeature(feature,from){
  const p=feature.properties||{},SEA=recordedEnd(feature);
  if(!SEA)return {course:[from],endedAt:from};
  const g=feature.geometry;
  const parts=g.type==="LineString"?[g.coordinates]:g.coordinates.map(q=>q.slice());
  /* locate the part + segment holding `from` */
  let pi=-1,si=-1,t=0,dBest=Infinity;
  for(let i=0;i<parts.length;i++)for(let s=0;s<parts[i].length-1;s++){
    const a=parts[i][s],b=parts[i][s+1];if(!a||!b)continue;
    const h=segHit(plane(from[1]),a,b,from);
    if(h.d2<dBest){dBest=h.d2;pi=i;si=s;t=h.t;}
  }
  if(pi<0)return {course:[from],endedAt:from};
  const segA=parts[pi][si],segB=parts[pi][si+1];
  const hit=[segA[0]+(segB[0]-segA[0])*t,segA[1]+(segB[1]-segA[1])*t];
  const visited=new Set(),chain=[];
  visited.add(pi);
  const fwd=hav(segB,SEA)<hav(segA,SEA);
  let pts=fwd?parts[pi].slice(si+1):parts[pi].slice(0,si+1).reverse();
  chain.push(pts);
  let pos=pts[pts.length-1]||hit;
  for(let guard=0;guard<parts.length+2;guard++){
    if(hav(pos,SEA)<=REACH_KM)break;
    let best=null;
    for(let k=0;k<parts.length;k++){
      if(visited.has(k))continue;
      for(const rev of [false,true]){
        const s0=rev?parts[k][parts[k].length-1]:parts[k][0];
        const e0=rev?parts[k][0]:parts[k][parts[k].length-1];
        const gap=hav(pos,s0);if(gap>LINK_KM)continue;
        const score=hav(e0,SEA);
        if(!best||score<best.score-0.25||(Math.abs(score-best.score)<=0.25&&gap<best.gap))best={k,rev,gap,score};
      }
    }
    if(!best)break;
    visited.add(best.k);
    const nx=(best.rev?parts[best.k].slice().reverse():parts[best.k].slice());
    if(!nx.length)break;
    nx[0]=pos.slice();               /* bridge digitisation gaps */
    chain.push(nx);pos=nx[nx.length-1];
  }
  const course=chain.reduce((acc,q)=>acc.concat(acc.length?q.slice(1):q),[]);
  return {course,endedAt:pos,seaEnd:SEA,hit};
}

/* Douglas-Peucker in the km-plane */
export function simplifyDP(pts,tolKm,lat0){
  if(pts.length<3)return pts.slice();
  const P=plane(lat0||pts[0][1]);
  const a=toP(P,pts[0]),b=toP(P,pts[pts.length-1]);
  const abx=b[0]-a[0],aby=b[1]-a[1],L=Math.hypot(abx,aby)||1e-9;
  let mi=0,md=-1;
  for(let i=1;i<pts.length-1;i++){
    const q=toP(P,pts[i]);
    const d=Math.abs((q[0]-a[0])*aby-(q[1]-a[1])*abx)/L;
    if(d>md){md=d;mi=i;}
  }
  if(md<=tolKm)return [pts[0],pts[pts.length-1]];
  return simplifyDP(pts.slice(0,mi+1),tolKm,lat0).slice(0,-1).concat(simplifyDP(pts.slice(mi),tolKm,lat0));
}

export function lineKm(coords){
  let km=0;
  for(let i=1;i<coords.length;i++)km+=hav(coords[i-1],coords[i]);
  return km;
}

/* distance from a point to a coast polyline (km) — used for the honest coastal test */
export function coastDistKm(pt,coastSegs){
  const P=plane(pt[1]);
  let best=Infinity;
  for(let i=0;i<coastSegs.length;i+=2){
    const h=segHit(P,coastSegs[i],coastSegs[i+1],pt);
    if(h.d2<best)best=h.d2;
  }
  return Math.sqrt(best);
}

/* flatten any FeatureCollection/Feature geometry into a flat [lon,lat,lon,lat,…] segment list */
export function coastSegments(geojson){
  const segs=[];
  const push=g=>{
    if(!g||!g.coordinates)return;
    if(g.type==="Polygon")g.coordinates.forEach(r=>pushRing(r));
    else if(g.type==="MultiPolygon")g.coordinates.forEach(poly=>poly.forEach(r=>pushRing(r)));
    else if(g.type==="LineString")pushRing(g.coordinates);
    else if(g.type==="MultiLineString")g.coordinates.forEach(r=>pushRing(r));
  };
  const pushRing=r=>{for(let i=0;i<r.length-1;i++){if(r[i]&&r[i+1]){segs.push(r[i]);segs.push(r[i+1]);}}};
  const fc=geojson&&geojson.features?geojson.features:[geojson];
  for(const f of fc)push(f.geometry||f);
  return segs;
}

/* ------------------------------------------------------------------ main ---- */
/* dam = {lon, lat, name, state, height}  →  {coords, totalKm, arrivalDays, coastal, chains, to, snapKm} */
export function solveRoute(idx,features,coastSegs,dam,opts){
  const o=opts||{};
  const snap=o.snapKm||SNAP_KM,link=o.linkKm||LINK_KM,coastKm=o.coastKm||COAST_KM;
  const hit=nearestRiver(idx,features,[dam.lon,dam.lat],snap,null);
  if(!hit)throw new Error("no river within "+snap+" km of "+dam.name);
  const used=new Set();
  let course=[[dam.lon,dam.lat],[hit.lon,hit.lat]];
  const chains=[];let coastal=false,to=null;
  let f=hit.f,from=[hit.lon,hit.lat];
  for(let c=0;c<(o.maxChains||MAX_CHAINS);c++){
    const feat=features[f];
    if(!feat)break;
    const nm=(feat.properties&&feat.properties.rivname)||"river";
    chains.push(nm);used.add(f);
    const w=walkFeature(feat,from);
    for(let i=1;i<w.course.length;i++)course.push(w.course[i]);
    const end=w.endedAt||w.course[w.course.length-1];
    if(coastSegs&&coastDistKm(end,coastSegs)<=coastKm){coastal=true;to=nm+" → coast";break;}
    /* chain: another river within LINK_KM whose recorded end is nearest the coast */
    let pick=null;
    for(const cf of candidatesNear(idx,end,link)){
      if(used.has(cf))continue;
      const h=nearestOnFeature(features[cf],end);
      if(h.dKm>link)continue;
      const e2=recordedEnd(features[cf]);
      if(!e2)continue;
      const d2=coastSegs?coastDistKm(e2,coastSegs):0;
      if(!pick||d2<pick.d2)pick={f:cf,d2,hit:h};
    }
    if(!pick||pick.f===f)break;
    f=pick.f;from=[pick.hit.lon,pick.hit.lat];
  }
  if(!coastal&&chains.length)to=chains[chains.length-1]+" → recorded river end (inland)";
  const simp=simplifyDP(course,DP_TOL_KM,dam.lat).map(q=>[+q[0].toFixed(5),+q[1].toFixed(5)]);
  const km=lineKm(simp);
  return {coords:simp,totalKm:+km.toFixed(2),arrivalDays:+(km/KM_DAY).toFixed(2),coastal,chains,to,
    snapKm:+hit.dKm.toFixed(2),speed_m_s:SPEED_M_S};
}