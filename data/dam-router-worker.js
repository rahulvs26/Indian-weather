/* v7.9 dam router worker — owns the heavy shapefiles so the page never freezes.
   Nothing is downloaded until the dam feature is actually used:
     on first route request → fetch rivers-cwc.geo.json + india-detailed.geo.json,
     build the bbox index once, then answer every dam in milliseconds.
   The walk/simplify maths is the shared engine (data/_route-engine.mjs), the same code the
   offline generator uses. Protocol: postMessage({cmd, dam}) → {ok, route} / {ok:false, error}. */
import {buildIndex,solveRoute,coastSegments} from "./_route-engine.mjs?v=7.18";
import {osmRefineCourse} from "./_osm-refine.mjs?v=7.20";
import {decodeTile} from "./_mvt.mjs?v=7.20";

let idx=null,features=null,coast=null,cities=[],loading=null;

const post=(m)=>self.postMessage(m);
const progress=(phase,detail)=>post({type:"progress",phase,detail});

async function loadAll(){
  if(idx)return;
  if(loading)return loading;
  loading=(async()=>{
    progress("fetch","rivers-cwc.geo.json (14 MB)");
    const r1=await fetch(new URL("rivers-cwc.geo.json",import.meta.url));
    if(!r1.ok)throw new Error("rivers-cwc.geo.json "+r1.status);
    const rivers=await r1.json();
    features=(rivers.features||[]).filter(f=>f.geometry&&f.geometry.coordinates);
    progress("index",features.length+" river features");
    idx=buildIndex(features);
    progress("fetch","india-detailed.geo.json (coast test)");
    try{
      const r2=await fetch(new URL("india-detailed.geo.json",import.meta.url));
      if(r2.ok)coast=coastSegments(await r2.json());
    }catch(e){ coast=null; }
    try{   /* v7.10: city reference points, used only to label the cities a course passes */
      const r3=await fetch(new URL("river-cities.json",import.meta.url));
      if(r3.ok){const j=await r3.json();cities=(j.cities||[]).map(c=>({name:c.name,lon:c.lon,lat:c.lat}));}
    }catch(e){ cities=[]; }
    progress("ready",features.length+" rivers indexed"+(coast?" · coast loaded":" · no coast file (all routes inland)")
      +(cities.length?" · "+cities.length+" city labels":""));
  })();
  try{ await loading; }finally{ loading=null; }
}

/* ---- v7.20: shape the course on OpenStreetMap geometry -------------------------
   The CWC network is schematic — measured: it has straight reaches of 5-25 km and the walk skips
   no meander that exists in it, so the "diverted" look is the source, not the solver. The basemap
   tiles are OpenStreetMap, so the real shape is fetched for the selected reach only (lazy, cached
   by bbox) and used to re-shape the drawn line while CWC keeps authority over which river it is.
   Overpass mirrors are tried in turn; on any failure the caller keeps the CWC line unchanged. */
/* ---- v7.20: shape the course on the map's OWN river geometry ---------------------------
   Measured: the CWC network is schematic (straight reaches of 5-25 km; the walk skips no meander
   that exists in it), while the blue river on screen is OpenStreetMap — the very data the
   OpenFreeMap vector tiles carry. So the shaped course is read straight out of those tiles
   (source-layer `waterway`, class river/stream), decoded locally: no third-party API, no CORS, and
   no download beyond tiles the map already needs. Overpass is kept as a fallback for when a tile is
   unavailable, but it is never on the critical path. */
/* the tile template lives in the TileJSON, not in the style (the style only points at the source),
   and it carries a dated snapshot prefix — read it once, so a planet refresh cannot break us */
const TILE_MAX=64;                     /* never fetch more than this many tiles for one course */
const TILE_FALLBACK="https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf";
let tileTemplate=null;
async function tileUrlTemplate(){
  if(tileTemplate)return tileTemplate;
  try{
    const j=await (await fetch(new URL("https://tiles.openfreemap.org/planet",import.meta.url))).json();
    if(j&&j.tiles&&j.tiles.length)tileTemplate=j.tiles[0];
  }catch(_){}
  tileTemplate=tileTemplate||TILE_FALLBACK;
  return tileTemplate;
}
const tileCache=new Map();             /* "z/x/y" -> ways[] | null */
const lon2x=(lon,z)=>Math.floor((lon+180)/360*Math.pow(2,z));
const lat2y=(lat,z)=>{const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z));};

async function tileWays(z,x,y){
  const key=z+"/"+x+"/"+y;
  if(tileCache.has(key))return tileCache.get(key);
  let ways=null;
  try{
    const tpl=await tileUrlTemplate();
    const res=await fetch(tpl.replace("{z}",z).replace("{x}",x).replace("{y}",y));
    if(res.ok){
      const buf=new Uint8Array(await res.arrayBuffer());
      const feats=decodeTile(buf,z,x,y,name=>name==="waterway");
      ways=[];
      for(const f of feats){
        if(f.type!==2)continue;                              /* lines only */
        const cls=f.tags&&f.tags.class;
        if(cls!=="river"&&cls!=="stream")continue;
        for(const line of f.geom)if(line.length>1)ways.push(line);
      }
    }
  }catch(e){ ways=null; }
  tileCache.set(key,ways);
  return ways;
}
/* every tile the course's bbox touches, plus its neighbours so a reach that runs along a tile edge
   is still complete. The zoom is chosen from the course length: a fixed z12 made a 190 km Vaigai
   course span 330 tiles, which never finishes; measured cost is one tile fetch per ~30 ms, so the
   tile count is the thing to bound. Highest zoom that stays under TILE_MAX wins, because a higher
   zoom carries more of the river's detail. */
function tileBoxOf(coords,z){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of coords){
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  }
  const tx0=lon2x(x0,z),tx1=lon2x(x1,z),ty0=lat2y(y1,z),ty1=lat2y(y0,z);
  return {tx0,tx1,ty0,ty1,n:(tx1-tx0+3)*(ty1-ty0+3)};
}
function pickTileZoom(coords){
  for(let z=14;z>=8;z--){
    const b=tileBoxOf(coords,z);
    if(b.n<=TILE_MAX)return z;
  }
  return 8;
}
async function tileWaysFor(coords){
  const z=pickTileZoom(coords),b=tileBoxOf(coords,z);
  const ways=[];
  for(let x=b.tx0-1;x<=b.tx1+1;x++)for(let y=b.ty0-1;y<=b.ty1+1;y++){
    const w=await tileWays(z,x,y);
    if(w&&w.length)ways.push(...w);
  }
  return ways;
}

/* Overpass fallback — mirrors measured from this machine (2026-10-17): overpass.osm.ch answered in
   0.85 s but holds Switzerland only, overpass-api.de timed out under load, and two further mirrors
   refused the request. Kept because on another network it may be the only route; never on the
   critical path, and its absence changes nothing but the shape of the line. */
const OSM_HOSTS=["https://overpass-api.de/api/interpreter",
                 "https://overpass.kumi.systems/api/interpreter",
                 "https://overpass.private.coffee/api/interpreter"];
const OSM_TIMEOUT_MS=22000;
const osmTileCache=new Map();           /* course key -> ways[] */

/* A bounding box over a whole basin returns tens of thousands of ways and takes 30 s+. Overpass
   accepts `around` with a LIST of points, so we sample the course every ~4 km and ask only for
   rivers and streams within 4 km of it: a few hundred ways, usually under 2 s. */
function sampleCourse(coords,stepKm,maxPts){
  const cum=[0];
  let total=0;
  for(let i=1;i<coords.length;i++){total+=hav(coords[i-1],coords[i]);cum.push(total);}
  const step=Math.max(stepKm,total/Math.max(1,maxPts));
  const out=[];
  let next=0;
  for(let i=0;i<coords.length;i++){
    if(i===0||cum[i]>=next){out.push(coords[i]);next=cum[i]+step;}
    if(out.length>=maxPts)break;
  }
  const last=coords[coords.length-1];
  if(!out.length||hav(out[out.length-1],last)>0.01)out.push(last);
  return out;
}
function hav(a,b){
  const R=6371.0088,rad=d=>d*Math.PI/180;
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const s=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}

async function osmWaysFor(coords){
  const ways=await tileWaysFor(coords);
  if(ways.length)return {ways,src:"openfreemap tiles"};
  return {ways:await overpassWaysFor(coords),src:"overpass"};
}
async function overpassWaysFor(coords){
  const key=coords[0].map(v=>v.toFixed(3)).join()+"|"+coords[coords.length-1].map(v=>v.toFixed(3)).join();
  if(osmTileCache.has(key)){const v=osmTileCache.get(key);if(v)return v;}
  const pts=sampleCourse(coords,6,26);
  const around=pts.map(p=>p[1].toFixed(4)+","+p[0].toFixed(4)).join(",");
  const q='[out:json][timeout:60];way["waterway"~"^(river|stream)$"](around:4000,'+around+');out geom;';
  let lastErr=null;
  for(const host of OSM_HOSTS){
    const ctrl=typeof AbortController!=="undefined"?new AbortController():null;
    const timer=ctrl?setTimeout(()=>ctrl.abort(),OSM_TIMEOUT_MS):null;
    try{
      const res=await fetch(host+"?data="+encodeURIComponent(q),ctrl?{signal:ctrl.signal}:undefined);
      if(timer)clearTimeout(timer);
      if(!res.ok){lastErr=host+" HTTP "+res.status;continue;}
      const j=await res.json();
      const ways=[];
      for(const el of (j.elements||[])){
        if(el.type!=="way"||!el.geometry)continue;
        ways.push(el.geometry.map(g=>[g.lon,g.lat]));
      }
      osmTileCache.set(key,ways);
      return ways;
    }catch(e){ if(timer)clearTimeout(timer); lastErr=host+" "+(e&&e.message||e); }
  }
  osmTileCache.set(key,null);
  throw new Error("Overpass unreachable: "+lastErr);
}

self.onmessage=async(e)=>{
  const m=e.data||{};
  if(m.cmd==="preload"){ try{ await loadAll(); post({type:"ready"}); }catch(err){ post({type:"error",error:String(err.message||err)}); } return; }
  if(m.cmd==="osm"){
    try{
      const coords=(m.coords||[]).filter(p=>Array.isArray(p)&&p.length===2);
      if(coords.length<2)throw new Error("no course to shape");
      const got=await osmWaysFor(coords);
      const r=osmRefineCourse(coords,got.ways,{corridorKm:(m.opts&&m.opts.corridorKm)||4.5,snapKm:3});
      post({ok:true,id:m.id,osm:r,ways:got.ways.length,src:got.src});
    }catch(err){
      post({ok:false,id:m.id,error:String(err.message||err)});
    }
    return;
  }
  if(m.cmd!=="route")return;
  try{
    await loadAll();
    const r=solveRoute(idx,features,coast,m.dam||{},Object.assign({},m.opts||{},{cities}));
    post({ok:true,id:m.id,route:r});
  }catch(err){
    post({ok:false,id:m.id,error:String(err.message||err)});
  }
};