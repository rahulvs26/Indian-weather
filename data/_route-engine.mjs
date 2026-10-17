/* v7.10 dam→sea course solver — SHARED by the browser worker and the offline checker.
   Pure geometry on the repo's own shapefiles; no invented geometry, no network calls here.
   Inputs : CWC WRIS river network features (rivers-cwc.geo.json) + a coast polyline (india-detailed.geo.json)
   Output : the downstream course from a dam point to the coast, with km, (illustrative) days and
            the cities it passes.

   ALGORITHM
     1) bbox grid over FEATURES (≈30k entries, ~5k cells) -> the rivers that can be near a point
     2) nearest point on the dam's river (SNAP_KM, retried wider by the caller)
     3) FLOW AXIS: every vertex is projected onto the recorded source→mouth vector
        (st_lon/st_lat → en_lon/en_lat). Downstream = increasing projection. This is what fixed
        Mettur, where "nearest to the recorded sea end" inverted at a fork and ran the wave
        429 km UPSTREAM to the Cauvery's source.
     4) greedy downstream walk over the river's unordered parts; at every junction the candidate
        that (a) can still reach the COAST (bounded lookahead) and (b) has the greatest downstream
        projection wins — so a split follows the branch that finishes at the sea.
     5) chain into the next river within LINK_KM when the walk ends inland (≤ MAX_CHAINS rivers)
     6) coast test against the outline (≤ COAST_KM); inland ends are reported as inland, never "sea"
     7) UPFLOW GUARD: if a walk ends farther from the coast than it began, retry with the opposite
        start direction and keep the better one; if both fail, report the route as suspect.
     8) Douglas-Peucker simplify + haversine km + days = km / (speed × 86.4); cities within
        CORRIDOR_KM of the course are listed in route order.
   The travel speed is ILLUSTRATIVE (kinematic, not measured) — say so in any readout. */

export const SNAP_KM=6;
export const LINK_KM=9;
export const REACH_KM=3;
export const DP_TOL_KM=0.065;
export const COAST_KM=25;
export const MAX_CHAINS=6;
export const CORRIDOR_KM=8;     /* "crosses" radius for cities */
export const SPEED_M_S=1.5;
export const KM_DAY=SPEED_M_S*86.4;
/* A vertex-to-vertex hop longer than this is not a channel we are willing to draw silently.
   Measured in the source data itself: p50 2.2 km, p90 3.9 km, p99 8.0 km, p99.9 15.1 km,
   max 66.6 km over 204,384 consecutive-vertex gaps — so 15 km separates "normal sparse
   digitisation" from "this line is an invention". */
export const MAX_SEG_KM=15;
export const SPARSE_SEG_KM=10;  /* above this the card discloses that the mapped hop is long */

const R_EARTH=6371.0088;
const rad=d=>d*Math.PI/180;
export function hav(a,b){
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R_EARTH*Math.asin(Math.sqrt(s));
}
const plane=lat0=>({LONK:111.32*Math.cos(rad(lat0)),LATK:111.19});
const dist2=(a,b)=>{const dx=a[0]-b[0],dy=a[1]-b[1];return dx*dx+dy*dy;};
function segHit(P,a,b,q){
  const ax=a[0]*P.LONK,ay=a[1]*P.LATK,bx=b[0]*P.LONK,by=b[1]*P.LATK;
  const qx=q[0]*P.LONK,qy=q[1]*P.LATK;
  const abx=bx-ax,aby=by-ay,L2=abx*abx+aby*aby;
  const t=L2?Math.max(0,Math.min(1,((qx-ax)*abx+(qy-ay)*aby)/L2)):0;
  const dx=qx-(ax+abx*t),dy=qy-(ay+aby*t);
  return {t,d2:dx*dx+dy*dy};
}
const partsOf=g=>g.type==="LineString"?[g.coordinates]:g.coordinates;

export function buildIndex(features,cell=0.25){
  const cells=new Map(),boxes=[];
  for(let f=0;f<features.length;f++){
    const g=features[f].geometry;
    if(!g||!g.coordinates)continue;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const line of partsOf(g))for(const c of line){
      if(!c||c.length<2)continue;
      if(c[0]<x0)x0=c[0];if(c[0]>x1)x1=c[0];
      if(c[1]<y0)y0=c[1];if(c[1]>y1)y1=c[1];
    }
    if(!isFinite(x0))continue;
    boxes[f]=[x0,y0,x1,y1];
    for(let i=Math.floor(x0/cell);i<=Math.floor(x1/cell);i++)
      for(let j=Math.floor(y0/cell);j<=Math.floor(y1/cell);j++){
        const k=i*100000+j;let arr=cells.get(k);
        if(!arr){arr=[];cells.set(k,arr);}
        arr.push(f);
      }
  }
  return {cells,boxes,cell};
}

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

export function nearestOnFeature(feature,pt){
  const P=plane(pt[1]);
  let best={dKm:Infinity,t:0,lon:pt[0],lat:pt[1]};
  for(const line of partsOf(feature.geometry))
    for(let s=0;s<line.length-1;s++){
      const a=line[s],b=line[s+1];
      if(!a||!b)continue;
      const h=segHit(P,a,b,pt);
      if(h.d2<best.dKm*best.dKm)best={dKm:Math.sqrt(h.d2),t:h.t,lon:a[0]+(b[0]-a[0])*h.t,lat:a[1]+(b[1]-a[1])*h.t};
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
  const st=(typeof p.st_lon==="number")?[p.st_lon,p.st_lat]:null;
  let far=null,fd=-1;
  for(const line of partsOf(feature.geometry))for(const c of line){
    if(!c)continue;
    if(!st){far=c;break;}
    const d=hav(st,c);if(d>fd){fd=d;far=c;}
  }
  return far;
}

/* ---- flow axis: downstream = increasing projection onto st → en ---- */
function makeAxis(feature,lat0){
  const p=feature.properties||{};
  const st=(typeof p.st_lon==="number")?[p.st_lon,p.st_lat]:null;
  const en=recordedEnd(feature);
  if(!st||!en)return null;
  const P=plane(lat0);
  const ax=(en[0]-st[0])*P.LONK,ay=(en[1]-st[1])*P.LATK;
  const L=Math.hypot(ax,ay);
  if(!(L>1e-6))return null;
  const ux=ax/L,uy=ay/L;
  const proj=pt=>((pt[0]-st[0])*P.LONK)*ux+((pt[1]-st[1])*P.LATK)*uy;
  return {st,en,proj,lengthKm:L/P.LATK};
}

/* flatten any geometry into a flat [lon,lat,lon,lat,…] segment list (coast test input) */
export function recordedStart(feature){
  const p=feature.properties||{};
  if(typeof p.st_lon==="number"&&typeof p.st_lat==="number")return [p.st_lon,p.st_lat];
  const en=recordedEnd(feature);
  let near=null,nd=Infinity;
  for(const line of partsOf(feature.geometry))for(const c of line){
    if(!c)continue;
    const d=hav(en,c);
    if(d<nd){nd=d;near=c;}
  }
  return near;
}

/* ---- units (exact conversions, not estimates) ----------------------------------
   1 TMC = 1,000,000 ft3 = 28,316.8466 m3   ·   1 cfs = 1 ft3/s = 0.0283168466 m3/s */
export const TMC_M3=28316.8466;
export const CFS_M3S=0.0283168466;
export const M3S_CFS=1/CFS_M3S;

/* ---------------------------------------------------------------- release ---- */
/* A dam does not empty at once: it releases through gates at a DISCHARGE rate.
   Given the course length, a release rate and (optionally) a volume cap, this returns the
   honest, clearly illustrative timings:
     frontDays  = how long the leading edge takes to travel the course (kinematic wave)
     gateDays   = how long the gates stay open for the released volume
     daysToSea  = when the leading edge reaches the mouth
     daysAllOut = when the last of the released water has passed the mouth
   The fill time of any downstream reservoir is travel time + volume-to-fill / rate. */
export function releasePlan(totalKm,o){
  o=o||{};
  const waveKmDay=o.waveKmDay||129.6;          /* 1.5 m/s kinematic wave — illustrative */
  const rateM3s=Math.max(0,o.rate_m3s||0);
  const volCapM3=(o.volumeCapTmc!=null&&o.volumeCapTmc>0)?o.volumeCapTmc*TMC_M3:null;
  const gateDays=rateM3s>0?(volCapM3!=null?volCapM3/rateM3s:Infinity)/86400:Infinity;
  const frontDays=totalKm/waveKmDay;
  return {
    rate_m3s:rateM3s,rate_cfs:rateM3s*M3S_CFS,waveKmDay,
    volume_m3:volCapM3!=null?Math.min(volCapM3,rateM3s*86400*(isFinite(gateDays)?gateDays:0)):null,
    gateOpenDays:gateDays,frontDays,
    daysToSea:frontDays,daysAllOut:frontDays+gateDays,
    /* days until a reservoir `atKm` along the course is full (volume needed / rate) */
    fillDays:(atKm,liveTmc)=>{
      if(!(rateM3s>0))return null;
      const travel=atKm/waveKmDay;
      const need=(liveTmc!=null&&liveTmc>0)?liveTmc*TMC_M3/rateM3s/86400:gateDays;
      return travel+Math.min(need,isFinite(gateDays)?gateDays:need);
    }
  };
}

/* flatten any geometry into a flat [lon,lat,lon,lat,…] segment list (coast test input) */
export function coastSegments(geojson){
  const segs=[];
  const pushRing=r=>{for(let i=0;i<r.length-1;i++){if(r[i]&&r[i+1]){segs.push(r[i]);segs.push(r[i+1]);}}};
  const push=g=>{
    if(!g||!g.coordinates)return;
    if(g.type==="Polygon")g.coordinates.forEach(pushRing);
    else if(g.type==="MultiPolygon")g.coordinates.forEach(poly=>poly.forEach(pushRing));
    else if(g.type==="LineString")pushRing(g.coordinates);
    else if(g.type==="MultiLineString")g.coordinates.forEach(pushRing);
  };
  const fc=geojson&&geojson.features?geojson.features:[geojson];
  for(const f of fc)push(f.geometry||f);
  return segs;
}

export function coastDistKm(pt,segs){
  if(!segs||!segs.length)return Infinity;
  const P=plane(pt[1]);
  let best=Infinity;
  for(let i=0;i<segs.length;i+=2){
    const h=segHit(P,segs[i],segs[i+1],pt);
    if(h.d2<best)best=h.d2;
  }
  return Math.sqrt(best);
}

/* memoised coast test — the raw scan is 18k segments per call and the search calls it a lot */
export function makeCoastTest(segs){
  const memo=new Map();
  return function(pt){
    const k=pt[0].toFixed(4)+","+pt[1].toFixed(4);
    let v=memo.get(k);
    if(v===undefined){v=coastDistKm(pt,segs);memo.set(k,v);}
    return v;
  };
}

/* "Is this the sea, or the land border?" — india-detailed.geo.json is the COUNTRY outline, so a
   point near the Pakistan/Bangladesh/Myanmar border also sits ~0 km from it (Rajasthan read
   "1.4 km from the coast"). The Indian Ocean only washes the peninsula (S of ~21.5°N), the
   Gujarat/Kutch coast (W of ~73.6°E) and the Bay east of the Bangladesh border (~88.6°E).
   This sector test is a documented heuristic — the outline distance alone is never trusted. */
export function seaSide(p){
  if(p[1]<21.5)return true;                              /* the peninsula and Deccan — always seaward */
  if(p[0]<73.6&&p[1]<24.5)return true;                 /* Gujarat · Kutch · Saurashtra coast */
  if(p[0]>88.6&&p[1]<26.5)return true;                  /* Bay of Bengal, east of the Bangladesh border */
  return false;                                          /* Himalaya / NW / NE borders: no sea */
}
/* the honest test: near the outline AND on the maritime side */
export function reachesSea(pt,coastTest,coastKm){
  if(!coastTest)return false;
  return seaSide(pt)&&coastTest(pt)<=(coastKm||COAST_KM);
}

export function simplifyDP(pts,tolKm,lat0){
  if(pts.length<3)return pts.slice();
  const P=plane(lat0||pts[0][1]);
  const ax=pts[0][0]*P.LONK,ay=pts[0][1]*P.LATK,bx=pts[pts.length-1][0]*P.LONK,by=pts[pts.length-1][1]*P.LATK;
  const abx=bx-ax,aby=by-ay,L=Math.hypot(abx,aby)||1e-9;
  let mi=0,md=-1;
  for(let i=1;i<pts.length-1;i++){
    const qx=pts[i][0]*P.LONK,qy=pts[i][1]*P.LATK;
    const d=Math.abs((qx-ax)*aby-(qy-ay)*abx)/L;
    if(d>md){md=d;mi=i;}
  }
  if(md<=tolKm&&L<=MAX_SEG_KM)return [pts[0],pts[pts.length-1]];   /* never create a longer hop than the data has */
  return simplifyDP(pts.slice(0,mi+1),tolKm,lat0).slice(0,-1).concat(simplifyDP(pts.slice(mi),tolKm,lat0));
}

export function lineKm(coords){
  let km=0;
  for(let i=1;i<coords.length;i++)km+=hav(coords[i-1],coords[i]);
  return km;
}

/* cities the course passes, in route order (city set is supplied by the caller) */
export function crossCities(coords,cities,maxKm){
  const out=[];
  if(!cities||!cities.length)return out;
  const P=plane(coords[0][1]);
  for(const c of cities){
    const q=[c.lon,c.lat];let best=Infinity,at=-1;
    for(let i=0;i<coords.length-1;i++){
      const h=segHit(P,coords[i],coords[i+1],q);
      if(h.d2<best){best=h.d2;at=i;}
    }
    const km=Math.sqrt(best);
    if(km<=maxKm)out.push({name:c.name,lon:c.lon,lat:c.lat,km:+km.toFixed(1),at});
  }
  out.sort((a,b)=>a.at-b.at);
  return out;
}

const MAX_SEG_LOCAL=MAX_SEG_KM;

/* v7.16 — why the walk skipped the river: the start part's own remainder was never traversed.
   seq excluded the start part, so the course jumped from the snap point straight to the next part
   and the splice drew that gap as a straight line (Papanasam: 89 km of empty line across Tamil
   Nadu, because the Tambraparni trunk is ONE 37-vertex part whose lower end sits within 2 km of a
   delta fragment). Two fixes:
     A) the path now INCLUDES the start part, cropped to begin at the snap point and oriented by
        the end that continues downstream;
     B) every splice is guarded by the link tolerance and any segment longer than MAX_SEG_KM marks
        the course gapped, so the caller can refuse to draw a fake channel. */
/* v7.16 — the walk, with three separate verdicts so the UI never draws an invented line.

   MEASURED FACTS that drive this code (see PERF-GAPS / HANDOFF):
     * the CWC source itself is sparse on big rivers — consecutive-vertex gaps run p50 2.2 km,
       p90 3.9, p99 8.0, p99.9 15.1, max 66.6 km over 204,384 gaps. The Mahanadi alone contains five
       gaps over 15 km (max 20.6 km) and the Godavari 29.4 km.
     * so a long hop is usually REAL DATA, and we must draw it and say so;
     * only a hop the SOLVER invents (splicing two parts it merely linked) is refused outright.

   Two bugs fixed here:
     A) the start part's own remainder was never walked — the course jumped from the snap point to
        the next part and drew that gap as a straight line (Papanasam: 89 km across Tamil Nadu);
     B) the exit end was taken from the NEXT part, which oriented the start part backwards and sent
        the walk upstream (Tambraparni: 77.31E -> the river's recorded source).

   Verdicts returned by walkFeature:
     method    "graph" | "greedy" | "none"
     stopped   the walk could not continue (a splice would have needed > linkKm) — the course stops
     synthKm   longest hop the walk INVENTED (a bridge between two parts that the source does not
               contain) — the course is not drawn when this exceeds MAX_SEG_KM
     worstKm   longest hop in the course, whatever its origin (source-sparse hops included)
     gapped    true when either of the above happened (kept for the audit)                */

function courseFromParts(parts,hit0,hit,seq,sideIn,SEA,linkKm){
  const E0=i=>parts[i][0],E1=i=>parts[i][parts[i].length-1];
  const pts=[hit];
  let pos=hit,worstKm=0,synthKm=0,stopped=false;
  const ownMaxGap=pi=>{                       /* the feature's own biggest vertex gap */
    let m=0;
    const raw=parts[pi];
    for(let k=1;k<raw.length;k++){const g=hav(raw[k-1],raw[k]);if(g>m)m=g;}
    return m;
  };
  const push=q=>{
    const seg=hav(pts[pts.length-1],q);
    if(seg>worstKm)worstKm=seg;
    pts.push(q);
  };
  const emitPart=(pi,exitEnd,entryIsHit)=>{
    const raw=parts[pi];
    const own=ownMaxGap(pi);
    let line;
    if(entryIsHit){
      /* the start part: begin at the snap point and keep only the vertices beyond it, in the
         direction of exitEnd. Every hop here is a real source hop. */
      const forwardExit=(exitEnd===E1(pi));
      line=forwardExit?raw.slice():raw.slice().reverse();
      const idx=forwardExit?hit0.si:(raw.length-2-hit0.si);
      for(let k=idx+1;k<line.length;k++)push(line[k]);
      pos=line[line.length-1];
      return true;
    }
    /* subsequent parts: join only where the digitisation actually touches (within linkKm) */
    const d0=hav(pos,E0(pi)),d1=hav(pos,E1(pi));
    if(Math.min(d0,d1)>linkKm+0.5){stopped=true;worstKm=Math.max(worstKm,Math.min(d0,d1));return false;}
    const startEnd=d0<=d1?E0(pi):E1(pi);
    line=(startEnd===E0(pi))?raw.slice():raw.slice().reverse();
    if(hav(line[line.length-1],exitEnd)>hav(line[0],exitEnd))line=line.slice().reverse();
    const gap=hav(pos,line[0]);
    if(gap>linkKm+0.5){stopped=true;worstKm=Math.max(worstKm,gap);return false;}
    /* the splice point: the hop from where we are to this part's first real vertex is the only
       place the walk can invent distance — flag it when it exceeds both the link tolerance and
       the feature's own spacing */
    const bridge=line.length>1?hav(pos,line[1]):0;
    if(bridge>Math.max(linkKm,own))synthKm=Math.max(synthKm,bridge);
    line[0]=pos.slice();
    for(let k=1;k<line.length;k++)push(line[k]);
    pos=line[line.length-1];
    return true;
  };
  for(let i=0;i<seq.length;i++){
    const pi=seq[i];
    let exitEnd;
    if(i<seq.length-1){
      const nx=seq[i+1];
      const nxEntry=(sideIn[nx]==="0")?E0(nx):E1(nx);
      exitEnd=(hav(E0(pi),nxEntry)<=hav(E1(pi),nxEntry))?E0(pi):E1(pi);
    }else if(SEA){
      exitEnd=(hav(E0(pi),SEA)<=hav(E1(pi),SEA))?E0(pi):E1(pi);
    }else{
      exitEnd=(hav(E0(pi),pos)<=hav(E1(pi),pos))?E0(pi):E1(pi);
    }
    if(!emitPart(pi,exitEnd,i===0))break;
  }
  return {pts,endedAt:pos,stopped,synthKm:+synthKm.toFixed(2),worstKm:+worstKm.toFixed(2),
          gapped:stopped||synthKm>0};
}

/* ---------------------------------------------------------------- walk ---- */
/* Inside ONE river feature, downstream from `from`.
   WHY THIS EXISTS: the old local-greedy rule walked 90 km UP the Bhagirathi into its recorded
   headwater, because "distance to the river's recorded end" is not monotonic along a looping
   course — and earlier it sent Mettur 429 km upstream to the Cauvery's source. So the part graph
   is now searched EXACTLY: parts are nodes, parts whose ends touch within LINK_KM are edges, and
   the fewest-hops path from the start part to the part carrying this river's recorded end wins.
   Such a path cannot wander upstream. Ties are broken by the sea-bound preference (`coastTest`):
   among equal-hop paths, the branch whose continuation can still reach the coast comes first. */
export function walkFeature(feature,from,o){
  o=o||{};
  const coast=(o.upstream?null:o.coastTest)||null;   /* an upstream walk has no sea preference */
  const coastKm=o.coastKm||COAST_KM,linkKm=o.linkKm||LINK_KM;
  const parts=partsOf(feature.geometry).map(q=>q.slice());
  const ax=makeAxis(feature,from[1]);
  /* downstream walk: the target is the river's recorded END (its mouth/lower end).
     upstream walk (v7.12): the target is the recorded START, so the path runs to the source. */
  const SEA=o.upstream?recordedStart(feature):recordedEnd(feature);
  const proj=ax?ax.proj:(pt=>-hav(pt,SEA));
  const reach=coast?(pt=>reachesSea(pt,coast,coastKm)):(pt=>false);
  const P=plane(from[1]);

  const segOf=pt=>{
    let pi=-1,si=-1,t=0,db=Infinity;
    for(let i=0;i<parts.length;i++)for(let s=0;s<parts[i].length-1;s++){
      const h=segHit(P,parts[i][s],parts[i][s+1],pt);
      if(h.d2<db){db=h.d2;pi=i;si=s;t=h.t;}
    }
    return {pi,si,t,dKm:Math.sqrt(db)};
  };
  const hit0=segOf(from);
  if(hit0.pi<0)return{course:[from],endedAt:from,reachesCoast:false,method:"none"};
  const a0=parts[hit0.pi][hit0.si],b0=parts[hit0.pi][hit0.si+1];
  const hit=[a0[0]+(b0[0]-a0[0])*hit0.t,a0[1]+(b0[1]-a0[1])*hit0.t];

  const E0=i=>{const p=parts[i];if(!p){if(!E0.warned){E0.warned=1;console.warn("[route] missing part",i,"of",parts.length);}return null;}return p[0];};
  const E1=i=>{const p=parts[i];if(!p){if(!E1.warned){E1.warned=1;console.warn("[route] missing part",i,"of",parts.length);}return null;}return p[p.length-1];};

  let course=null,endedAt=null,builtInfo=null;
  const endSeg=SEA?segOf(SEA):null;
  if(endSeg&&endSeg.pi>=0&&endSeg.dKm<=REACH_KM+3&&endSeg.pi!==hit0.pi){
    const n=parts.length;
    const adj=new Array(n);for(let i=0;i<n;i++)adj[i]=[];
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
      let bg=null;
      for(const pr of [[E0(i),E0(j)],[E0(i),E1(j)],[E1(i),E0(j)],[E1(i),E1(j)]]){
        const g=hav(pr[0],pr[1]);
        if(g<=linkKm&&(bg===null||g<bg.g))bg={g};
      }
      if(bg){
        /* both directions carry {v,side} — reading the wrong key here silently drops half the graph */
        adj[i].push({v:j,side:hav(E0(i),E0(j))<=hav(E1(i),E0(j))?"0":"1"});
        adj[j].push({v:i,side:hav(E0(j),E0(i))<=hav(E1(j),E0(i))?"0":"1"});
      }
    }
    /* Dijkstra over parts: cost 1 per hop + 1 if neither end of the next part can still reach the sea */
    const dist=new Array(n).fill(Infinity),prev=new Array(n).fill(null),sideIn=new Array(n).fill(null);
    dist[hit0.pi]=0;
    const open=[hit0.pi];
    while(open.length){
      let bi=0;for(let k=1;k<open.length;k++)if(dist[open[k]]<dist[open[bi]])bi=k;
      const u=open.splice(bi,1)[0];
      for(const e of adj[u]){
        const v=e.v;
        if(!(v>=0&&v<n))continue;              /* defensive: never index outside the part list */
        const arrive=(e.side==="0")?E1(v):E0(v);
        const leave=(e.side==="0")?E0(v):E1(v);
        if(!arrive||!leave)continue;
        const pen=coast?(reach(arrive)||reach(leave)?0:1):0;
        const nd=dist[u]+1+pen;
        if(nd<dist[v]){dist[v]=nd;prev[v]=u;sideIn[v]=e.side;open.push(v);}
      }
    }
    if(isFinite(dist[endSeg.pi])){
      const rest=[];let cur=endSeg.pi;
      while(cur!==null&&cur!==hit0.pi){rest.unshift(cur);cur=prev[cur];}
      if(cur===hit0.pi){
        /* v7.16: the start part belongs to the walk — without it the course jumped over the trunk */
        const seq=[hit0.pi].concat(rest);
        const built=courseFromParts(parts,hit0,hit,seq,sideIn,SEA,linkKm);
        course=built.pts;
        endedAt=built.endedAt;
        builtInfo=built;
      }
    }
  }

  if(course){
    return{course,endedAt,reachesCoast:coast?reach(endedAt):false,method:"graph",
      startPoint:hit,axisKm:ax?ax.lengthKm:null,
      gapped:!!(builtInfo&&builtInfo.gapped),worstKm:builtInfo?+builtInfo.worstKm.toFixed(2):0};
  }

  /* ---- fallback for digitisation that is not connected: greedy with an upflow veto ---- */
  const firstFwd=proj(E1(hit0.pi))>proj(E0(hit0.pi));
  const visited=new Set([hit0.pi]);
  let pts=firstFwd?parts[hit0.pi].slice(hit0.si+1):parts[hit0.pi].slice(0,hit0.si+1).reverse();
  const chain=pts.length?[pts]:[];
  let pos=pts.length?pts[pts.length-1]:hit;
  for(let guard=0;guard<parts.length+2;guard++){
    if(SEA&&hav(pos,SEA)<=REACH_KM)break;
    if(coast&&reach(pos))break;
    let best=null;
    for(let k=0;k<parts.length;k++){
      if(visited.has(k))continue;
      for(const rev of [false,true]){
        const s0=rev?E1(k):E0(k);
        const e0=rev?E0(k):E1(k);
        const gap=hav(pos,s0);if(gap>linkKm)continue;
        /* on an upstream walk the target is the source, so "moving away from it" is normal meander —
       the upflow veto only applies to the downstream walk */
    const upflow=(SEA&&!o.upstream)?(hav(e0,SEA)>hav(pos,SEA)+2):false;
        const score=(upflow?1e7:0)+3*(SEA?hav(e0,SEA):0)-10*(proj(e0)-proj(pos))+gap*0.01;
        if(!best||score<best.score)best={k,rev,gap,score};
      }
    }
    if(!best)break;
    visited.add(best.k);
    const nx=(best.rev?parts[best.k].slice().reverse():parts[best.k].slice());
    if(!nx.length)break;
    nx[0]=pos.slice();
    chain.push(nx);pos=nx[nx.length-1];
  }
  const course2=chain.reduce((acc,q)=>acc.concat(acc.length?q.slice(1):q),[]);
  return{course:course2.length?course2:[hit],endedAt:pos,reachesCoast:coast?reach(pos):false,method:"greedy",
    startPoint:hit,axisKm:ax?ax.lengthKm:null};
}

/* ---------------------------------------------------------------- main ---- */
export function solveRoute(idx,features,coastSegs,dam,opts){
  const o=opts||{};
  const up=!!o.upstream;                      /* v7.12: trace back to the reservoir origin */
  const snap=o.snapKm||SNAP_KM,link=o.linkKm||LINK_KM,coastKm=o.coastKm||COAST_KM;
  const coastTest=o.coastTest||(coastSegs&&coastSegs.length?makeCoastTest(coastSegs):null);
  const hit=nearestRiver(idx,features,[dam.lon,dam.lat],snap,null);
  if(!hit)throw new Error("no river within "+snap+" km of "+(dam.name||"the dam"));
  const used=new Set();
  let course=[[dam.lon,dam.lat],[hit.lon,hit.lat]];
  const chains=[];let coastal=false,to=null,f=hit.f,from=[hit.lon,hit.lat],stoppedWalk=false,worstKm=0,synthKm=0;
  for(let c=0;c<(o.maxChains||MAX_CHAINS);c++){
    const feat=features[f];
    if(!feat)break;
    const nm=(feat.properties&&feat.properties.rivname)||"river";
    chains.push(nm);used.add(f);
    const w=walkFeature(feat,from,{coastTest,coastKm,linkKm:link,upstream:up});
    /* the walk always starts at the snap point and runs toward the target in BOTH modes (the target is
       the river's recorded end downstream, its recorded start upstream), so the course always
       begins at the dam — no reversal needed. */
    const leg=w.course;
    for(let i=1;i<leg.length;i++)course.push(leg[i]);
    if(w.stopped){stoppedWalk=true;worstKm=Math.max(worstKm,w.worstKm||0);}
    if(w.synthKm)synthKm=Math.max(synthKm,w.synthKm||0);
    const end=w.endedAt||w.course[w.course.length-1];
    if(!up&&reachesSea(end,coastTest,coastKm)){coastal=true;to=nm+" → coast";break;}
    let pick=null;
    const cands=candidatesNear(idx,end,link).map(cf=>({cf,h:nearestOnFeature(features[cf],end)}))
      .filter(x=>x.h.dKm<=link)
      .sort((a,b)=>a.h.dKm-b.h.dKm).slice(0,8);
    for(const x of cands){
      if(used.has(x.cf))continue;
      const feat=features[x.cf],p=feat.properties||{};
      /* downstream: keep the main stem that can still reach the sea.
         upstream: keep the main stem whose recorded START is the highest/furthest back. */
      if(up){
        const s2=recordedStart(feat);
        if(!s2)continue;
        const len=typeof p.len_km==="number"?p.len_km:0;
        /* only chain into a real tributary, not every 8-km gully (CWC "Hole"/"Hole stream"
           features otherwise chain the walk into dozens of headwater branches) */
        const here=typeof (features[f].properties||{}).len_km==="number"?features[f].properties.len_km:0;
        if(len<here*0.4)continue;
        const score=-Math.min(len,1200)*2-x.h.dKm;
        if(!pick||score<pick.score)pick={f:x.cf,score,hit:x.h};
      }else{
        const e2=recordedEnd(feat);
        if(!e2)continue;
        const len=typeof p.len_km==="number"?p.len_km:0;
        const atSea=reachesSea(e2,coastTest,coastKm);
        const score=-Math.min(len,1200)*2+(atSea?-1e5:0)+x.h.dKm;
        if(!pick||score<pick.score)pick={f:x.cf,score,hit:x.h};
      }
    }
    if(!pick||pick.f===f)break;
    f=pick.f;from=[pick.hit.lon,pick.hit.lat];
  }
  if(!coastal&&chains.length)to=up
    ?chains[chains.length-1]+" → recorded river source"
    :chains[chains.length-1]+" → recorded river end (inland)";
  /* v7.16 verdicts, measured on the RAW walked course:
     maxSegKm  longest vertex-to-vertex hop in the mapped channel (source sparsity included)
     suspect   we will NOT draw it: a stub (dam->snap only) or an invented bridge over the gate
     sparse    the source geometry itself is coarse here — drawn, but the card discloses it
   Measured: 2,930 of 3,056 long hops in a 600-dam sample are in the source (the Mahanadi alone has
   five over 15 km, max 20.6); only 126 were solver bridges. So refusing everything would hide real
   rivers, and accepting everything would redraw the 89 km Papanasam line. Hence three verdicts. */
  let maxSegKm=0;
  for(let i=1;i<course.length;i++){
    const s=hav(course[i-1],course[i]);
    if(s>maxSegKm)maxSegKm=s;
  }
  const stub=course.length<=2;
  const invented=synthKm>MAX_SEG_KM;
  const suspect=stub||invented;
  const sparse=!suspect&&(maxSegKm>SPARSE_SEG_KM||stoppedWalk);
  if(suspect)to=stub
    ?"mapped reach ends at the dam — no continuous channel to draw"
    :"channel not continuous here (a "+synthKm.toFixed(0)+" km bridge would be invented) — course not drawn";
  else if(sparse&&to)to+=" · mapped geometry is coarse here (longest hop "+maxSegKm.toFixed(0)+" km"
    +(stoppedWalk?", walk stopped where the digitisation breaks":"")+")";
  const simp=simplifyDP(course,DP_TOL_KM,dam.lat).map(q=>[+q[0].toFixed(5),+q[1].toFixed(5)]);
  const km=lineKm(simp);
  const src=up?recordedStart(features[f]):null;
  return {coords:simp,totalKm:+km.toFixed(2),arrivalDays:+(km/KM_DAY).toFixed(2),coastal:up?false:coastal,chains,to,
    snapKm:+hit.dKm.toFixed(2),speed_m_s:SPEED_M_S,upstream:up,source:src,
    suspect,sparse,maxSegKm:+maxSegKm.toFixed(2),synthKm:+synthKm.toFixed(2),
    stoppedWalk,maxSegLimitKm:MAX_SEG_KM,
    cities:crossCities(simp,o.cities||[],o.corridorKm||CORRIDOR_KM)};
}