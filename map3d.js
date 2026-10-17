/* ================= v7.5 THIRD VIEW: TRUE-SCALE 3D MAP =================
   Open-source stack only — no API keys, no signup:
   · MapLibre GL JS 6.14.0 (BSD-3-Clause) — WebGL map engine
   · OpenFreeMap styles + vector tiles (tiles.openfreemap.org) — © OpenMapTiles,
     map data © OpenStreetMap contributors
   · Mapterhorn DEM (terrarium encoding) for terrain relief — © Mapterhorn
   · OSM 3D buildings (fill-extrusion) from the same vector tiles
   MapLibre (~1 MB ESM) and its CSS load lazily on the first activation of the
   "3D map" button, so the 2D deck stays light. The only obligation is
   attribution, shown in MapLibre's built-in corner control.
   Hooks for the deck + verification: window.__map3d = { setActive, map, ready,
   style, layers, terrain }. setActive(true) resolves true on success and false
   on any network/WebGL failure (app.js then restores the button state).

   ================= v7.6 DAM RELEASE (this file) =================
   Water released at the Hirakud dam travels the REAL Mahanadi centre-line to the
   Bay of Bengal. Route = data/dam-route-hirakud.geo.json — derived from
   data/rivers-cwc.geo.json ("Mahanadi River", CWC WRIS) + data/dams.geo.json
   ("Hirakud Dam"); see data/_gen_dam_route.mjs for provenance.
   Model = kinematic travel wave: the front advances along the polyline at ONE
   constant illustrative speed (≈1.5 m/s — not measured, labelled illustrative);
   days-to-sea = route km ÷ speed. Travel only — no inundation, no hydraulics.
   Layers (drape over terrain automatically): full route line (teal, dashed),
   the "wet" line that grows as the front advances, and a head dot at the front.
   UI: readout card + "Release water" button in the 3D map view (#damUI).
   Hook: window.__dam = { start(), reset(), state(), route() }. state() =
   {running, day, km, totalKm, arrivalDays, reached}. */
const ML_CSS="https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.css";
const ML_JS="https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.mjs";
const STYLE_URL="https://tiles.openfreemap.org/styles/bright"; /* pastel-leaning OpenMapTiles look; swap in "liberty" for the richer OMT palette */
const DEM_URL="https://tiles.mapterhorn.com/tilejson.json";    /* terrarium encoding, declared in Mapterhorn's tilejson */
const VIEW={center:[78.9,22.6],zoom:4.3,pitch:52,bearing:-8};  /* opens tilted so it reads as 3D immediately */
const DAM_SECONDS=24;                                          /* v7.6: whole journey plays in this many real seconds */
const DAM_RM=matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

let libP=null,map=null,mlRef=null,rsWired=false,mapStyleReady=false,terrainReady=false,damPickWired=false;
let route=null,damZAll=4.4,damLoaded=false,damRun=null;

const dEl=id=>document.getElementById(id);
const R_EARTH=6371.0088;
function hav(a,b){const rad=d=>d*Math.PI/180;const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);const s=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;return 2*R_EARTH*Math.asin(Math.sqrt(s));}

function loadLib(){
if(libP)return libP;
const p=(async()=>{
if(!document.getElementById("mlCss")){const l=document.createElement("link");l.id="mlCss";l.rel="stylesheet";l.href=ML_CSS;document.head.appendChild(l);}
const m=await import(ML_JS);return m.default||m;
})();
libP=p.catch(e=>{libP=null;throw e;});   /* allow a retry if the CDN fetch ever fails */
return libP;
}

function addSkyTerrainBuildings(){
try{map.setSky({   /* MapLibre v6: sky is a root-level style property (map.setSky), not a layer; fog only shows at pitch ≥60 */
"sky-color":"#cfe4f4","sky-horizon-blend":0.6,
"horizon-color":"#e9eff4","horizon-fog-blend":0.55,
"fog-color":"#e8eef4","fog-ground-blend":0.45});}catch(e){console.warn("[map3d] sky skipped:",e.message||e);}
map.addSource("deck-dem",{type:"raster-dem",url:DEM_URL,encoding:"terrarium"});
map.setTerrain({source:"deck-dem",exaggeration:1});terrainReady=true;   /* ×1 = true scale; this deck never exaggerates relief */
/* the OpenFreeMap style points at tiles.openfreemap.org/fonts/, which 404s and floods the console
   with "Unable to load glyph range" warnings; the same glyphs are served by fonts.openmaptiles.org,
   so redirect the style there (v7.13). Labels then render with real glyphs. */
try{ map.setGlyphs("https://fonts.openmaptiles.org/{fontstack}/{range}.pbf"); }catch(e){}
const st=map.getStyle()||{};
if(!(st.layers||[]).some(l=>l.type==="fill-extrusion")){   /* add OSM building extrusions if the style ships none */
const src=Object.keys(st.sources||{}).find(k=>st.sources[k].type==="vector");
if(src){
const anchor=(st.layers||[]).find(l=>l.type==="symbol");
try{map.addLayer({
id:"deck-3d-buildings",type:"fill-extrusion",source:src,"source-layer":"building",
minzoom:13.5,filter:["!=",["get","hide_3d"],true],
paint:{
"fill-extrusion-color":["interpolate",["linear"],["get","render_height"],0,"#e2dcd2",30,"#d9cfc4",120,"#cbbfae"],
"fill-extrusion-height":["interpolate",["linear"],["zoom"],13.5,0,15,["get","render_height"]],
"fill-extrusion-base":["get","render_min_height"],
"fill-extrusion-opacity":0.9
}
},anchor&&anchor.id);}catch(e){console.warn("[map3d] buildings layer skipped:",e.message||e);}
}
}
}

/* ---------- v7.9 dam release: ANY dam, course derived on demand (lazy) ----------
   Nothing heavy loads until the feature is used:
     1. "Find a dam" ON  → fetch data/dams.geo.json (2.8 MB): searchable list + clickable dots on the map
     2. first route      → data/dam-router-worker.js fetches rivers-cwc.geo.json + the coast outline,
        indexes them once (≈0.5 s in a worker), then answers each dam in ~6 ms
     3. every course is cached per dam; geometry, km and days come from the CWC network only.
   Travel time stays ILLUSTRATIVE (constant kinematic wave, not measured). */
const DAM_DAMS="data/dams.geo.json?v=7.9";
const DAM_WORKER="data/dam-router-worker.js?v=7.20";
const SNAP_NEAR_KM=6,SNAP_FAR_KM=12,DAM_SEARCH_MAX=14;

let damP=null,damList=null,damById=null,damCache={},damCacheOrder=[],damWorker=null,damWait={},damSeq=0,damMode=false,damSel=null,damIdleT=0;

const damMsg=t=>{const el=dEl("damMsg");if(el)el.textContent=t||"";};
const damBird=()=>{const b=dEl("damBird");return !b||b.checked;};
const damFollowOn=()=>{const b=dEl("damFollow");return !b||b.checked;};

/* ---- dam points (names for search + dots you can tap on the map) ---- */
async function damDams(){
if(damP)return damP;
damP=(async()=>{
  const j=await (await fetch(DAM_DAMS)).json();
  const list=[],byId={};
  (j.features||[]).forEach((f,i)=>{
    const p=f.properties||{},c=(f.geometry&&f.geometry.coordinates)||null;
    if(!c)return;
    const h=(p.height_m!=null?p.height_m:p.height);
    const d={id:"d"+i,name:p.name||"unnamed dam",state:p.state||"",river:p.river||"",
      lon:c[0],lat:c[1],h:typeof h==="number"?h:null};
    list.push(d);byId[d.id]=d;
  });
  damList=list;damById=byId;
  return list;
})();
return damP;
}

function damLayerVis(on){
if(!map)return;
for(const id of ["dam-pts","dam-pts-tall"]){
  if(!map.getLayer(id))continue;
  try{map.setLayoutProperty(id,"visibility",on?"visible":"none");}catch(_){}
}
try{map.getCanvas().style.cursor=on?"crosshair":"";}catch(_){}
}

function damLayerAdd(){
if(!map||!damList)return;
if(!map.getSource("dam-pts")){
  const feats=damList.map(d=>({
    type:"Feature",geometry:{type:"Point",coordinates:[d.lon,d.lat]},
    properties:{id:d.id,name:d.name,state:d.state,h:d.h||0}}));
  map.addSource("dam-pts",{type:"geojson",data:{type:"FeatureCollection",features:feats}});
  /* v7.13 perf: drawing 13,002 dots every frame is the deck's heaviest idle cost, so below zoom 6
     only the tall dams (height >= 30 m, ~700 of them) are rendered; every dam appears from zoom 6. */
  map.addSource("dam-pts-tall",{type:"geojson",data:{type:"FeatureCollection",
    features:feats.filter(f=>(f.properties.h||0)>=30)}});
  map.addLayer({id:"dam-pts-tall",type:"circle",source:"dam-pts-tall",maxzoom:6,
    paint:{"circle-radius":["interpolate",["linear"],["get","h"],30,2.4,300,6],
      "circle-color":"#B45309","circle-opacity":0.75,"circle-stroke-color":"#FAF9F6","circle-stroke-width":0.8}});
  map.addLayer({id:"dam-pts",type:"circle",source:"dam-pts",minzoom:6,
    paint:{"circle-radius":["interpolate",["linear"],["get","h"],0,1.7,60,3,150,5,300,7.5],
      "circle-color":"#B45309","circle-opacity":0.72,"circle-stroke-color":"#FAF9F6","circle-stroke-width":0.8}});
  /* v7.11: the layer click was removed — see damPickAt() below. At pitch 52 the terrain draws
     over these 1.7-7.5 px dots (measured: 0 dam features render at pitch 52, 4,525 at pitch 0),
     so MapLibre never delivered the event. Picking from the data works at every pitch and zoom. */
  map.on("mouseenter","dam-pts",()=>{try{map.getCanvas().style.cursor="pointer";}catch(_){}});
  map.on("mouseleave","dam-pts",()=>{try{map.getCanvas().style.cursor=damMode?"crosshair":"";}catch(_){}});
damPickWire();
}
damLayerVis(damMode);
}

/* ---- tap a dam in the 3D view (v7.11) -----------------------------------------
   Sweeps the 13,002 dam points in screen space and takes the nearest within DAM_PICK_PX.
   ~13k projections cost 1-2 ms and only happen on a click (throttled on hover). */
const DAM_PICK_PX=22;
function damPickAt(px,py){
  if(!map||!damList||!damList.length)return null;
  const cv=map.getCanvas(),r=cv.getBoundingClientRect();
  const x=px-r.left,y=py-r.top;
  if(x<0||y<0||x>r.width||y>r.height)return null;
  let best=null,bd=DAM_PICK_PX*DAM_PICK_PX;
  for(const d of damList){
    const p=map.project([d.lon,d.lat]);
    if(p.x<0||p.y<0||p.x>r.width||p.y>r.height)continue;
    const dx=p.x-x,dy=p.y-y,dd=dx*dx+dy*dy;
    if(dd<bd){bd=dd;best=d;}
  }
  return best;
}
function damPickWire(){
  if(!map||damPickWired)return;
  damPickWired=true;
  map.on("click",e=>{
    if(!damMode||!damList)return;
    /* a real hit on our own overlay (route, city, endpoint) wins over the dam sweep */
    if(e.features&&e.features.length){
      const l=e.features[0].layer||"";
      if(l.indexOf("dam-")===0&&l!=="dam-pts")return;
    }
    const d=damPickAt(e.point.x,e.point.y);
    if(d)damSelect(d);
    else damMsg("No dam within ~"+DAM_PICK_PX+" px of that point — zoom in, or type the name above.");
  });
  let last=0,lp={x:-99,y:-99};
  map.on("mousemove",e=>{
    if(!damMode||!damList)return;
    const t=e.timeStamp||0;
    if(Math.abs(e.point.x-lp.x)<5&&Math.abs(e.point.y-lp.y)<5)return;
    if(t-last<140)return;
    last=t;lp=e.point;
    try{map.getCanvas().style.cursor=damPickAt(e.point.x,e.point.y)?"pointer":"crosshair";}catch(_){}
  });
}

/* ---- dam names: ONLY while a release is running (v7.11 request) ---- */
function damNameData(list){
  if(!map)return;
  const s=map.getSource("dam-names");if(!s)return;
  s.setData({type:"FeatureCollection",features:(list||[]).filter(d=>d&&d.lon!=null).map(d=>({
    type:"Feature",geometry:{type:"Point",coordinates:[d.lon,d.lat]},properties:{name:d.name}}))});
}
function damNamesShow(on){
  if(!map)return;
  try{if(map.getLayer("dam-name"))map.setLayoutProperty("dam-name","visibility",on?"visible":"none");}catch(_){}
}
/* ---- performance: a run only needs the course; drop the heavy per-frame work ---- */
function damPerf(on){
  if(!map)return;
  try{if(map.getLayer("deck-3d-buildings"))map.setLayoutProperty("deck-3d-buildings","visibility",on?"none":"visible");}catch(_){}
  for(const id of ["dam-pts","dam-pts-tall"]){
    try{if(map.getLayer(id))map.setLayoutProperty(id,"visibility",on?"none":(damMode?"visible":"none"));}catch(_){}
  }
  damNamesShow(on);
}
/* "Smooth (2D)" — drop the DEM entirely and flatten the camera for weak GPUs */
function damSmooth(on){
  if(!map)return;
  try{
    if(on){
      map.setTerrain(null);
      /* v7.16: also stop rendering at the display's full resolution — the biggest single win on
         high-DPI screens (DPR 2-3 means 4-9x the pixels) */
      if(typeof map.getPixelRatio==="function")map.setPixelRatio(1);
      map.easeTo({pitch:0,bearing:0},{duration:600});
    }else{
      if(terrainReady)map.setTerrain({source:"deck-dem",exaggeration:1});
      if(typeof map.getPixelRatio==="function")map.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    }
  }catch(_){}
}

/* ---- full screen (v7.14): the stage holds the map, the dam card and the caption, so putting
   the STAGE in full screen keeps every control reachable. MapLibre needs a resize to fill it. ---- */
function mapFullscreenToggle(ev){
  const stage=map?map.getContainer().parentNode:null;
  if(!stage)return false;
  const api=!!(document.fullscreenElement||document.webkitFullscreenElement);
  const cinema=stage.classList.contains("fsmode");
  if(api){ try{(document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document);}catch(_){} }
  /* the CSS class is the fallback (and the layout driver): some webviews block the API entirely */
  stage.classList.toggle("fsmode",!cinema);
  if(document.body)document.body.classList.toggle("fsmode",!cinema);
  /* only a trusted gesture (real click / keypress) may call the Fullscreen API — otherwise the
     browser logs a permission error; the .fsmode class still gives the full-screen layout */
  if(!cinema&&ev&&ev.isTrusted){
    try{
      const req=stage.requestFullscreen||stage.webkitRequestFullscreen;
      if(req)req.call(stage);
    }catch(_){}
  }
  mapFullscreenSync();
  return !cinema;
}
function mapFullscreenSync(){
  const api=!!(document.fullscreenElement||document.webkitFullscreenElement);
  const stage=map?map.getContainer().parentNode:null;
  const cinema=!!(stage&&stage.classList.contains("fsmode"));
  const btn=dEl("m3fs");
  if(btn)btn.textContent=(api||cinema)?"✕ Exit full screen":"⛶ Full screen";
  damPanelFit();
  /* the canvas must be resized after the layout settles, or the map stays letterboxed */
  if(map){
    try{ map.resize(); }catch(_){}
    setTimeout(()=>{ try{ map.resize(); map._render&&map._render(performance.now()); }catch(_){} },60);
    setTimeout(()=>{ try{ map.resize(); }catch(_){} },260);
  }
}
/* v7.18: the console must fit its CONTAINER, not the window — the 3D stage is 420 px tall inline
   and the full window in cinema mode, and a viewport-sized max-height made it spill out of both. */
function damPanelFit(){
  const ui=dEl("damUI");
  if(!ui)return;
  const stage=ui.parentElement;
  const h=stage&&stage.clientHeight?stage.clientHeight:420;
  ui.style.maxHeight=Math.max(160,h-14)+"px";
}
addEventListener("resize",()=>{ if(map)mapFullscreenSync(); else damPanelFit(); });
addEventListener("load",()=>damPanelFit());

/* ---- the routing worker (heavy data lives here, not in the page) ---- */
/* v7.16 B5: the worker holds the 14 MB network + bbox index resident. Release it after 5 idle
   minutes (no dam mode, nothing waiting) and re-create it on demand — same behaviour, less memory. */
const DAM_WORKER_IDLE_MS=5*60*1000,DAM_CACHE_MAX=80;
function damCachePut(k,v){
  if(damCache[k])return;
  damCache[k]=v;
  damCacheOrder.push(k);
  while(damCacheOrder.length>DAM_CACHE_MAX){          /* B4: LRU cap, never unbounded */
    const old=damCacheOrder.shift();
    delete damCache[old];
  }
}
function damWorkerIdleTimer(){
  clearTimeout(damIdleT);
  damIdleT=setTimeout(()=>{
    if(damMode||Object.keys(damWait).length){damWorkerIdleTimer();return;}
    try{if(damWorker){damWorker.terminate();damWorker=null;damMsg("River network released (idle) — it reloads when you use it again.");}}catch(_){}
  },DAM_WORKER_IDLE_MS);
}
function damEnsureWorker(){
if(damWorker)return damWorker;
damWorker=new Worker(DAM_WORKER,{type:"module"});
damWorker.onmessage=e=>{
  const m=e.data||{};
  if(m.type==="progress"){
    damMsg(m.phase==="ready"?"River network ready — tap a dam or type a name":"Loading river network · "+m.phase+(m.detail?" · "+m.detail:""));
    return;
  }
  if(m.type==="error"){damMsg("River network failed: "+m.error);return;}
  const w=damWait[m.id];
  if(!w)return;
  delete damWait[m.id];
  if(m.ok)w.resolve(m.route!==undefined?m.route:(m.osm!==undefined?{osm:m.osm,ways:m.ways}:m));
  else w.reject(new Error(m.error));
};
damWorker.onerror=e=>{damMsg("Router error: "+(e.message||"worker failed"));};
damWorker.postMessage({cmd:"preload"});
return damWorker;
}

function damAsk(dam,snap,opts){
const w=damEnsureWorker(),id="q"+(++damSeq);
return new Promise((resolve,reject)=>{
  damWait[id]={resolve,reject};
  w.postMessage({cmd:"route",id,dam:{lon:dam.lon,lat:dam.lat,name:dam.name},opts:Object.assign({},opts||{},{snapKm:snap})});
});
}

/* v7.20: ask the worker to re-shape the course on OpenStreetMap geometry (lazy, only when the
   toggle is on and a dam is selected). Cached per dam+direction so a repeat is instant. */
let osmCache=new Map(),osmInFlight=null,damOsmSrc="";
const OSM_CACHE_MAX=12;
function damAskOsm(coords){
  const w=damEnsureWorker(),id="o"+(++damSeq);
  return new Promise((resolve,reject)=>{
    damWait[id]={resolve,reject};
    w.postMessage({cmd:"osm",id,coords,opts:{corridorKm:4.5}});
  });
}
function damOsmOn(){const b=dEl("damOsm");return !!(b&&b.checked);}

/* apply an OSM-shaped course: swap the drawn geometry, keep the CWC line as a thin reference so
   the user can see the schematic source it was shaped from, and state both lengths. */
function damApplyOsm(res,meta){
  if(!res||!res.coords||res.coords.length<3){damOsmNote(null,"OpenStreetMap shape unavailable — showing the CWC schematic line.");return false;}
  const cwc=route.coords;
  if(!route.osmCwc)route.osmCwc={coords:cwc.slice(),cum:route.cum.slice(),totalKm:route.totalKm};
  const cum=[0];let km=0;
  for(let i=1;i<res.coords.length;i++){km+=hav(res.coords[i-1],res.coords[i]);cum.push(km);}
  route.osm={coords:res.coords,cum,totalKm:km,spineKm:cwc.length?route.totalKm:null,devKm:res.devKm,segs:res.segs,ways:meta&&meta.ways};
  route.coords=res.coords;route.cum=cum;route.totalKm=km;
  route.arrivalDays=damTimingTotal();
  if(map){
    const s=map.getSource("dam-route");
    if(s)s.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:res.coords},properties:{}}]});
    const ref=map.getSource("dam-cwc");
    if(ref)ref.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:cwc},properties:{}}]});
    const g2=map.getSource("dam-gaps");
    if(g2)g2.setData({type:"FeatureCollection",features:damGapFeatures(route)});
    damEndPoints();
  }
  damOsmNote(res,"Course shape from OpenStreetMap ("
    +(meta&&meta.src==="overpass"?"Overpass fallback":"the map's own OpenFreeMap tiles")+") · "
    +km.toFixed(0)+" km against the CWC schematic line's "+(route.osm.spineKm||0).toFixed(0)+" km"
    +(res.devKm!=null?" · stays within "+res.devKm.toFixed(1)+" km of it":""));
  const sub0=dEl("damSub");          /* the course label must say which geometry is on screen */
  if(sub0)sub0.textContent=sub0.textContent.replace(/CWC centre-line/,"OpenStreetMap shape, CWC routing")
    .replace(/CWC schematic ([\d.]+) km/,(m,n)=>"CWC schematic "+n+" km");
  damReadout();
  return true;
}
function damEndPoints(){
  if(!map||!route)return;
  const last=route.coords[route.coords.length-1];
  const e2=map.getSource("dam-ends");
  if(e2)e2.setData({type:"FeatureCollection",features:[
    {type:"Feature",geometry:{type:"Point",coordinates:[route.dam.lon,route.dam.lat]},properties:{kind:"dam"}},
    {type:"Feature",geometry:{type:"Point",coordinates:[last[0],last[1]]},properties:{kind:"sea"}}]});
}
function damTimingTotal(){
  const p=damProfile();
  if(p&&p.totalDays)return p.totalDays;
  return route.totalKm/(damVelocity()*86.4);
}
function damOsmNote(res,text){
  const box=dEl("damOsmNote");
  if(box)box.textContent=text||"";
  if(res&&res.src)damOsmSrc=res.src;
}
/* the OSM pass runs after the CWC route is already on screen, so nothing waits for the network:
   if Overpass is slow the card keeps saying so and the shaped line simply arrives later. Results are
   cached in memory (LRU) and in localStorage, so a dam looked at twice needs no network at all. */
const OSM_LS="t3osm";
/* the cache stores the shaping RESULT, so which source produced it (tiles or Overpass) goes with it —
   otherwise a result shaped by the fallback would be reported as coming from the map's own tiles */
function damOsmLsGet(ck){
  try{
    const all=JSON.parse(localStorage.getItem(OSM_LS)||"{}");
    const e=all[ck];
    return e&&e.coords&&e.coords.length>2?e:null;
  }catch(_){ return null; }
}
function damOsmLsPut(ck,rec){
  try{
    const all=JSON.parse(localStorage.getItem(OSM_LS)||"{}");
    all[ck]={coords:rec.coords.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)]),devKm:rec.devKm,spineKm:rec.spineKm,
    km:rec.km,segs:rec.segs,src:rec.src||"",t:Date.now()};
    const keys=Object.keys(all);
    if(keys.length>24){keys.sort((a,b)=>(all[a].t||0)-(all[b].t||0)).slice(0,keys.length-24).forEach(k=>delete all[k]);}
    localStorage.setItem(OSM_LS,JSON.stringify(all));
  }catch(_){}
}
function damOsmMaybe(){
  const ck=damSel?damSel.id+(route&&route.upstream?"#up":""):null;
  if(!damOsmOn()||!route||!ck){damOsmNote(null,"");return;}
  const mem=osmCache.get(ck);
  if(mem){damApplyOsm(mem,{ways:mem.ways});return;}
  const stored=damOsmLsGet(ck);
  if(stored){osmCache.set(ck,stored);damApplyOsm(stored,{ways:stored.ways});damOsmNote(stored,"Course shape from OpenStreetMap (cached"
    +(stored.src?" · "+stored.src:"")+") · "
    +stored.km.toFixed(0)+" km against the CWC schematic line's "+stored.spineKm.toFixed(0)+" km"
    +(stored.devKm!=null?" · stays within "+stored.devKm.toFixed(1)+" km of it":""));return;}
  if(route.osmCwc)return;                      /* already shaped once; do not refetch */
  damOsmNote(null,"shaping the course on OpenStreetMap (Overpass is often slow)…");
  const slow=setTimeout(()=>{damOsmNote(null,"still shaping on OpenStreetMap — the CWC line stays until it arrives");},9000);
  damAskOsm(route.coords).then(res=>{
    clearTimeout(slow);
    if(!damSel||(damSel.id+(route&&route.upstream?"#up":""))!==ck)return;   /* the user moved on */
    if(res&&res.osm){
      const rec={coords:res.osm.coords,devKm:res.osm.devKm,segs:res.osm.segs,km:res.osm.km,spineKm:res.osm.spineKm,
        ways:res.ways,src:res.src};
      osmCache.set(ck,rec);
      while(osmCache.size>OSM_CACHE_MAX)osmCache.delete(osmCache.keys().next().value);
      damOsmLsPut(ck,rec);
      damApplyOsm(rec,{ways:res.ways});
    }else{
      damOsmNote(null,"OpenStreetMap shape unavailable — showing the CWC schematic line.");
    }
  }).catch(()=>{clearTimeout(slow);damOsmNote(null,"OpenStreetMap shape unavailable — showing the CWC schematic line.");});
}
/* ---- researched dam facts (capacity + gates) — data/dam-facts.json, loaded once ---------- */
const DAM_FACTS_URL="data/dam-facts.json?v=7.19";
let damFactsP=null,damFactsById=null;
function damLoadFacts(){
  if(damFactsP)return damFactsP;
  damFactsP=(async()=>{
    try{
      const j=await (await fetch(DAM_FACTS_URL)).json();
      const norm=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      const by={};
      for(const d of (j.dams||[])){
        const k=norm(d.name);
        if(!k)continue;
        by[k]=d;
        const short=k.replace(/DAM$/,"");
        if(short&&!by[short])by[short]=d;
      }
      damFactsById=by;
      return j;
    }catch(e){damFactsById={};return null;}
  })();
  return damFactsP;
}
function damFactsFor(name){
  if(!damFactsById||!name)return null;
  const norm=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const k=norm(name);
  const direct=damFactsById[k]||damFactsById[k.replace(/DAM$/,"")];
  if(direct)return direct;
  /* CWC names carry suffixes the fact list does not ('TEHRI HPP', 'SARDAR SAROVAR DAM (SSNNL)',
     'RANGALI S.T.'): fall back to the longest shared word, and only when it is distinctive */
  const words=String(name||"").toUpperCase().split(/[^A-Z0-9]+/).filter(w=>w.length>3&&!/^(DAM|HPP|PROJECT|ST|BARRAGE|WEIR)$/.test(w));
  let best=null,bestHit=0;
  for(const key in damFactsById){
    if(!damFactsById[key])continue;
    const kw=key.split(/(?=[A-Z]{2,})/);
    let hit=0;
    for(const w of words)if(kw.indexOf(w)>=0||key.indexOf(w)>=0)hit++;
    if(hit>bestHit){bestHit=hit;best=damFactsById[key];}
  }
  return bestHit>=1&&words.length?best:null;
}
/* only figures that carry a source are shown; anything else says so */
function damFactsText(f){
  if(!f)return "No published capacity found for this dam in the sources used — the rate below is your input.";
  const bits=[];
  if(f.gross_tmc!=null)bits.push("gross "+f.gross_tmc+" TMC");
  if(f.live_tmc!=null)bits.push("live "+f.live_tmc+" TMC");
  if(f.capacity_note)bits.push(f.capacity_note);
  if(!bits.length)return "Capacity not recorded in the sources used for this dam.";
  let s=bits.join(" · ");
  if(f.reservoir_area_km2!=null)s+=" · reservoir "+f.reservoir_area_km2+" km²";
  s+="  [source: "+(f.source_type||"recorded")
    +(f.verify_status==="verified"?" · checked against the source page":" · compiled, not re-checked")+"]";
  return s;
}

/* ---- release inputs: unit, rate, volume cap, gate openings ---- */
const CFS_M3S=0.0283168466,TMC_M3=28316.8466,M3S_CFS=1/CFS_M3S;
/* v7.18 travel-wave speed. Sources for the band shown in the panel:
     · CWC publishes gauged river velocity and discharge daily (National Water Data Portal,
       "River Velocity & Discharge (Manual - Daily)") — measured per station;
     · flood-routing literature puts plains flood waves at "hundreds of kilometres in 2-3 days",
       i.e. roughly 1.2-1.8 m/s (Reso, Indian Academy of Sciences — flood hydrology).
   0.5-3.0 m/s is therefore the ordinary band for a travel front in an alluvial river; the panel
   allows 0.2-5.0 and every day count stays labelled illustrative. */
const VEL_MIN=0.2,VEL_MAX=5.0,VEL_TYP_LO=0.5,VEL_TYP_HI=3.0;
function damVelocity(){
  const raw=parseFloat((dEl("damVel")||{}).value);
  if(!isFinite(raw))return 1.5;
  return Math.min(VEL_MAX,Math.max(VEL_MIN,raw));
}
function damInputs(){
  const unit=(dEl("damUnit")||{}).value||"cms";
  const rateRaw=parseFloat((dEl("damRate")||{}).value)||0;
  /* cms | cfs | cm — "cumec" is the same quantity as m³/s, only the unit label differs */
  const rateM3s=unit==="cfs"?rateRaw*CFS_M3S:rateRaw;
  const volRaw=parseFloat((dEl("damVol")||{}).value)||0;
  const volTmc=volRaw>0?volRaw:null;
  const gates=[];
  const gateBox=dEl("damGates");
  if(gateBox&&gateBox.dataset.gateCount){
    const per=parseFloat(gateBox.dataset.gateCfs||"0")||0;
    for(const inp of gateBox.querySelectorAll("input[type=range]"))gates.push({pct:parseFloat(inp.value)/100,capacityCfs:per});
  }
  const gateCfs=Math.min(1,gates.reduce((s,g)=>s+g.pct,0))*((parseFloat((gateBox||{}).dataset.gateCfs))||0);
  /* while the sliders own the rate (their default), the typed box just mirrors the total */
  const gateDriven=!!(gates.length&&gateBox&&gateBox.dataset.gateDriven==="1");
  const velMps=damVelocity();
  return {unit,rateRaw,rateM3s,volTmc,gates,gateCfs,gateDriven,velMps,velKmDay:velMps*86.4};
}
/* ---- v7.19 longitudinal profile: published reservoir level -> mean sea level ----
   ANCHORS are real: `frl_m` from data/dam-facts.json (full reservoir level in metres above mean
   sea level, published rows only) and 0 m at the mouth. THE SHAPE BETWEEN THEM is read from the
   terrain DEM already loaded for the 3D view — the lowest of a 3x3 neighbourhood at points ~3 km
   apart, because the DEM stores land surface and a single sample inside a gorge can sit on a
   hillside. The series is then forced monotonically downhill and scaled so both anchors are exact.
   PHYSICS: Manning v = R^(2/3)·√S ⁄ n, n and R as stated engineering defaults the user can change.
   Every number derived here is illustrative — this is a study tool, not a hydraulic model. */
const PROF_STEP_KM=3,PROF_MAX=70,S_FLOOR=1e-5,S_CEIL=0.06,V_FLOOR=0.05,V_CEIL=12;
function damSlopeInputs(){
  const facts=damFactsFor(damSel&&damSel.name);
  const frlBox=dEl("damFrl"),endBox=dEl("damEnd");
  const typed=parseFloat(frlBox&&frlBox.value);
  const published=facts&&typeof facts.frl_m==="number"?facts.frl_m:null;
  const frl=isFinite(typed)&&frlBox.value!==""?typed:published;
  const coastal=!!(route&&route.coastal);
  const endTyped=parseFloat(endBox&&endBox.value);
  const end=coastal?0:(isFinite(endTyped)&&endBox.value!==""?endTyped:null);
  const n=Math.min(0.1,Math.max(0.005,parseFloat((dEl("damMann")||{}).value)||0.03));
  const R=Math.min(30,Math.max(0.5,parseFloat((dEl("damDepth")||{}).value)||3));
  return {frl,published,typedFrl:isFinite(typed)&&frlBox&&frlBox.value!=="",end,coastal,n,R,
    frlNote:(facts&&facts.frl_note)||null,frlSource:(facts&&facts.sources&&facts.sources.frl_m)||null};
}
/* sample points every ~PROF_STEP_KM along the course (never fewer than PROF_MAX) */
function damProfilePoints(){
  if(!route||!route.coords||route.coords.length<2||!map)return [];
  const step=Math.max(PROF_STEP_KM,route.totalKm/PROF_MAX);
  const out=[];
  let km=0,i=0;
  const q=map.queryTerrainElevation?map.queryTerrainElevation.bind(map):null;
  while(km<=route.totalKm&&out.length<PROF_MAX+2){
    while(i<route.cum.length-2&&route.cum[i+1]<km)i++;
    const a=route.coords[i],b=route.coords[i+1]||route.coords[i];
    const seg=Math.max(1e-6,route.cum[i+1]-route.cum[i]);
    const t=Math.min(1,Math.max(0,(km-route.cum[i])/seg));
    const c=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    let z=null;
    if(q){
      let lo=Infinity;
      for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++){
        const e=q([c[0]+di*0.009,c[1]+dj*0.009]);
        if(typeof e==="number"&&isFinite(e)&&e<lo)lo=e;
      }
      if(lo<Infinity)z=lo;
    }
    out.push({km:+km.toFixed(3),lon:c[0],lat:c[1],z});
    km+=step;
  }
  if(!out.length||out[out.length-1].km<route.totalKm-0.5){
    const last=route.coords[route.coords.length-1];
    let z=null;
    if(q){const e=q(last);if(typeof e==="number"&&isFinite(e))z=e;}
    out.push({km:+route.totalKm.toFixed(3),lon:last[0],lat:last[1],z});
  }
  return out;
}
/* the whole slope -> velocity -> days chain; null when the reservoir level is not known */
let PROF_CACHE=null;
function damProfile(){
  const inp0=damSlopeInputs();
  const key=[damSel?damSel.id+(route&&route.upstream?"#up":""):"",route?route.totalKm:0,
    inp0.frl,inp0.end,inp0.n,inp0.R].join("|");
  if(PROF_CACHE&&PROF_CACHE.key===key)return PROF_CACHE.prof;   /* ~630 DEM queries per build, so cache */
  const inp=inp0;
  if(inp.frl==null||inp.end==null)return (PROF_CACHE={key,prof:null},null);
  const pts=damProfilePoints();
  if(pts.length<2)return (PROF_CACHE={key,prof:null},null);
  /* forced downhill: elevation must not rise downstream. A DEM spur or a bar next to the channel
     can read higher than the water a kilometre downstream; walking from the sea back upstream and
     lifting any upstream value that sits below its neighbour removes those steps without touching
     the overall fall. (Walking the other way — clamping upstream values DOWN to the next one —
     flattens the whole profile to a single number, which is what an earlier version did.) */
  const zs=pts.map(p=>p.z);
  const haveDem=zs.filter(z=>typeof z==="number"&&isFinite(z)).length>=zs.length*0.6;
  if(haveDem){
    for(let i=zs.length-2;i>=0;i--){
      const z=typeof zs[i]==="number"&&isFinite(zs[i])?zs[i]:null;
      const below=zs[i+1];
      if(z==null)zs[i]=below;
      else if(z<below)zs[i]=below;
    }
  }else{
    for(let i=0;i<zs.length;i++)zs[i]=null;
  }
  /* scale the shape onto the two anchors exactly */
  const zFirst=haveDem?zs[0]:null,zLast=haveDem?zs[zs.length-1]:null;
  const span=(zFirst!=null&&zLast!=null)?(zFirst-zLast):0;
  const prof=pts.map((p,i)=>({km:p.km,lon:p.lon,lat:p.lat,
    z:haveDem&&span>1
      ? inp.end+(zs[i]-zLast)*(inp.frl-inp.end)/span
      : inp.frl+(inp.end-inp.frl)*(p.km/Math.max(1e-6,route.totalKm))}));
  /* per-reach slope -> Manning velocity -> days.
     A reach cannot fall more slowly than a small fraction of the course's overall fall: the DEM
     bed in a plain is nearly level, but the water surface keeps a working slope there. So the
     local slope is held between S_mean/10 and 20·S_mean and every clamped reach is counted and
     disclosed — without this the Ganga plain reaches collapse to the 0.05 m/s floor and the course
     "takes" 61 days, which is an artefact of the bed DEM, not a property of the river. */
  const Smean=(inp.frl-inp.end)/Math.max(1e-6,route.totalKm*1000);
  const Slo=Math.max(S_FLOOR,Smean/10),Shi=Math.min(S_CEIL,Math.max(Smean*20,Smean*2));
  const reaches=[];
  let t=0,clamped=0,flat=0,floored=0;
  for(let i=1;i<prof.length;i++){
    const ds=Math.max(1,(prof[i].km-prof[i-1].km)*1000);
    const dz=prof[i-1].z-prof[i].z;
    let S=dz/ds;
    if(!(S>0)){S=S_FLOOR;flat++;}
    if(S<Slo){S=Slo;floored++;}
    if(S>Shi){S=Shi;clamped++;}
    const v=Math.min(V_CEIL,Math.max(V_FLOOR,(1/inp.n)*Math.pow(inp.R,2/3)*Math.sqrt(S)));
    const days=(ds/v)/86400;
    t+=days;
    reaches.push({km:prof[i].km,v:+v.toFixed(3),S:S,days:+days.toFixed(4)});
  }
  const totalDays=t>0?t:null;
  let steep=reaches[0],steepS=-1;
  for(const r of reaches)if(r.S>steepS){steepS=r.S;steep=r;}
  const meanV=totalDays?route.totalKm/totalDays/86.4:null;   /* m/s */
  const out={key,prof,reaches,totalDays,meanV,steepKm:steep?steep.km:null,steepS:steepS>0?steepS:null,
    dem:haveDem,clamped,flat,floored,inp,Slo,Shi,raw:pts.map(q=>q.z),
    headM:inp.frl-inp.end,slopeMean:(inp.frl-inp.end)/Math.max(1e-6,route.totalKm*1000)};
  /* never cache a build made before the DEM tiles for this course arrived: those come back null
     and the straight FRL-to-sea fallback would stick for the rest of the session */
  const terrainOn=!!(map&&map.getTerrain&&map.getTerrain());
  if(haveDem||!terrainOn)PROF_CACHE={key,prof:out};
  return out;
}
/* rebuild the profile once the camera has settled and the DEM tiles exist */
let PROF_RETRY=0,DAM_SPEED_AUTO=true;
function damSlopeSeed(){
  const p=damProfile(),box=dEl("damVel"),hint=dEl("damVelRange");
  if(!p||!p.meanV||!box||!DAM_SPEED_AUTO||document.activeElement===box)return;
  box.value=Math.min(VEL_MAX,Math.max(VEL_MIN,+p.meanV.toFixed(2)));
  if(hint)hint.textContent="from slope "+p.meanV.toFixed(2)+" m/s";
}
function damSlopeRefresh(){
  PROF_CACHE=null;
  damSlopeUI();
  damSlopeSeed();
  damReadout();
  if(map&&PROF_RETRY<3&&damSel){
    PROF_RETRY++;
    try{map.once("idle",()=>{if(PROF_RETRY<=3)damSlopeRefresh();});}catch(_){}
    setTimeout(()=>{if(PROF_RETRY<=3)damSlopeRefresh();},1400);
  }
}
/* km <-> day over the profile, so the clock is not linear when the river is not */
function damTiming(){
  const useProf=dEl("damProfMode")&&dEl("damProfMode").checked;
  const waveKmDay=damVelocity()*86.4;
  const p=useProf?damProfile():null;
  if(!p||!p.totalDays){
    return {mode:"flat",waveKmDay,totalDays:route?route.totalKm/waveKmDay:0,prof:null,
      dayAt:km=>waveKmDay>0?km/waveKmDay:0,kmAt:day=>day*waveKmDay};
  }
  const pts=p.prof;
  const rKm=(p2,i)=>p2.prof[i+1]?p2.prof[i+1].km:p2.prof[p2.prof.length-1].km;
  const dayAt=km=>{                       /* cumulative days at each profile point */
    let acc=0,i=0;
    for(;i<p.reaches.length;i++){const r=p.reaches[i];if(r.km>=km)break;acc+=r.days;}
    if(i>=p.reaches.length)return p.totalDays;
    const prev=i>0?p.reaches[i-1].km:0,frac=(km-prev)/Math.max(1e-9,rKm(p,i)-prev);
    return acc+p.reaches[i].days*Math.min(1,Math.max(0,frac));
  };
  const kmAt=day=>{
    let acc=0;
    for(let i=0;i<p.reaches.length;i++){
      if(acc+p.reaches[i].days>=day){
        const f=(day-acc)/Math.max(1e-9,p.reaches[i].days);
        const prev=i>0?p.reaches[i-1].km:0;
        return prev+(rKm(p,i)-prev)*Math.min(1,Math.max(0,f));
      }
      acc+=p.reaches[i].days;
    }
    return route?route.totalKm:0;
  };
  return {mode:"profile",waveKmDay,totalDays:p.totalDays,prof:p,dayAt,kmAt};
}
/* ---- v7.19 the slope block: head, mean slope, Manning velocity, and the drawn profile ---- */
function damSlopeUI(){
  const out=dEl("damSlopeOut"),svg=dEl("damProf"),frlTag=dEl("damFrlTag"),endTag=dEl("damEndTag");
  if(!out)return;
  const inp=damSlopeInputs();
  if(frlTag)frlTag.textContent=inp.published!=null
    ?(inp.typedFrl?"yours (published "+inp.published+" m)":"published")
    :"not published";
  if(endTag)endTag.textContent=inp.coastal?"sea = 0 m":"type it";
  const frlBox=dEl("damFrl");
  if(frlBox&&!inp.typedFrl&&document.activeElement!==frlBox)
    frlBox.value=inp.published!=null?inp.published:"";
  const endBox=dEl("damEnd");
  if(endBox&&inp.coastal&&document.activeElement!==endBox)endBox.value="0";
  const p=damProfile();
  if(!p){
    out.innerHTML=inp.frl==null
      ?'<span class="warnc">No published reservoir level for this dam</span> — type the full reservoir level (m above sea level) above, or pick a dam that has one. Without it there is no head, and without head there is no slope.'
      :'This course does not reach the sea, so there is no sea-level datum — type the level of the course’s end above to get a slope.';
    if(svg)svg.innerHTML="";
    return;
  }
  const oneIn=p.slopeMean>0?Math.round(1/p.slopeMean):null;
  const pct=(p.slopeMean*100);
  const daysTxt=p.totalDays<1?(p.totalDays*24).toFixed(1)+" h":p.totalDays.toFixed(1)+" d";
  const notes=[];
  notes.push(p.dem?"relief from the terrain DEM (land surface — a proxy for the water surface)"
    :"no terrain data yet: straight profile between the two levels");
  if(p.floored)notes.push(p.floored+" flat reach(es) held at 1/10 of the mean slope");
  if(p.clamped)notes.push(p.clamped+" reach(es) at the 20× mean-slope ceiling");
  out.innerHTML="head <b>"+p.headM.toFixed(1)+" m</b> over "+route.totalKm.toFixed(0)+" km → mean slope "
    +(oneIn?"1 : "+oneIn.toLocaleString("en-IN"):"")+" ("+pct.toFixed(4)+"%)<br>"
    +"Manning n="+inp.n+", R="+inp.R+" m → normal flow <b>"+p.meanV.toFixed(2)+" m/s</b> ("
    +(p.meanV*86.4).toFixed(0)+" km/day) → whole course <b>"+daysTxt+"</b>; steepest reach "
    +p.steepKm.toFixed(0)+" km at 1 : "+Math.round(1/Math.max(1e-9,p.steepS)).toLocaleString("en-IN")+"<br>"
    +'<span class="dim">'+notes.join(" · ").replace(/</g,"&lt;")
    +" · a flood wave is faster than this: measured plains flood waves travel ~100–150 km/day (≈1.2–1.8 m/s)</span>";
  /* sparkline: the profile, with the two anchors marked */
  if(svg){
    const w=240,h=46,pad=3;
    if(!p.prof.length){svg.innerHTML="";return;}
    const zs=p.prof.map(q=>q.z),lo=Math.min.apply(null,zs.concat([0])),hi=Math.max.apply(null,zs.concat([inp.frl]));
    const X=km=>pad+(km/Math.max(1e-6,route.totalKm))*(w-2*pad);
    const Y=z=>h-pad-((z-lo)/Math.max(1e-6,hi-lo))*(h-2*pad);
    let d="M"+X(0).toFixed(1)+" "+Y(p.prof[0].z).toFixed(1);
    for(let i=1;i<p.prof.length;i++)d+=" L"+X(p.prof[i].km).toFixed(1)+" "+Y(p.prof[i].z).toFixed(1);
    svg.innerHTML='<path d="'+d+' L'+(w-pad)+' '+h+' L'+pad+' '+h+' Z" fill="rgba(45,212,191,.14)"/>'
      +'<path d="'+d+'" fill="none" stroke="#2DD4BF" stroke-width="1.2"/>'
      +'<circle cx="'+X(0).toFixed(1)+'" cy="'+Y(inp.frl).toFixed(1)+'" r="2.4" fill="#F59E0B"/>'
      +'<circle cx="'+(w-pad).toFixed(1)+'" cy="'+Y(inp.end).toFixed(1)+'" r="2.4" fill="#1D4ED8"/>';
  }
}
function damUseSpeed(){
  const p=damProfile();
  if(!p||!p.meanV)return;
  const box=dEl("damVel");
  if(box){box.value=Math.min(VEL_MAX,Math.max(VEL_MIN,+p.meanV.toFixed(2)));box.dispatchEvent(new Event("input"));}
  damMsg("Speed set from the slope profile ("+p.meanV.toFixed(2)+" m/s mean, illustrative).");
}

function damConverter(){
  const g=id=>dEl(id);
  if(!g("cvQ"))return;
  const FACT={cms:1,cfs:CFS_M3S,cm:1,tmcday:TMC_M3/86400,tmc:TMC_M3,m3:1,mcmday:1000*TMC_M3/86400};
  const UNIT={cms:"m³/s",cfs:"cfs",cm:"cumec",tmcday:"TMC/day",tmc:"TMC",m3:"m³",mcmday:"MCM/day"};
  const KIND={cms:"q",cfs:"q",cm:"q",tmcday:"q",tmc:"v",m3:"v",mcmday:"q"};
  function run(){
    const v=parseFloat(g("cvQ").value),from=g("cvFrom").value,to=g("cvTo").value;
    const outEl=g("cvOut"),eqEl=g("cvOutEq");
    if(!isFinite(v)){outEl.textContent="—";eqEl.textContent="";return;}
    const ff=FACT[from],ft=FACT[to];
    const kFrom=KIND[from],kTo=KIND[to];
    let val,note;
    if(kFrom===kTo){
      val=v*ff/ft;                       /* same quantity: a straight factor */
      note="1 "+UNIT[from]+" = "+(ff/ft).toPrecision(6)+" "+UNIT[to];
    }else if(kFrom==="q"&&kTo==="v"){
      val=v*ff*86400/ft;                 /* a rate sustained for one day is a volume */
      note="rate × 1 day (86,400 s) = volume";
    }else{
      val=v*ff/(86400*ft);               /* a volume spread over one day is a rate */
      note="volume ÷ 1 day (86,400 s) = rate";
    }
    outEl.textContent=val.toLocaleString("en-IN",{maximumFractionDigits:Math.abs(val)>=1000?1:4})+" "+UNIT[to];
    eqEl.textContent=note;
  }
  for(const id of ["cvQ","cvFrom","cvTo"]){
    const el=g(id);
    if(el){el.addEventListener("input",run);el.addEventListener("change",run);}
  }
  run();
}
function damPlan(){
  const inp=damInputs();
  const rateM3s=inp.gateDriven?inp.gateCfs*M3S_CFS:inp.rateM3s;
  /* v7.18/v7.19: the travel time is the user's speed, or the slope-derived profile when
     "travel by slope" is on (steep reaches then take longer than flat ones) */
  const tm=damTiming();
  const totalKm=route?route.totalKm:0;
  const up=!!(route&&route.upstream);
  const frontDays=tm.totalDays;
  const gateDays=(rateM3s>0&&inp.volTmc!=null)?inp.volTmc*TMC_M3/rateM3s/86400:Infinity;
  return {rateM3s,volM3:inp.volTmc!=null?inp.volTmc*TMC_M3:null,frontDays,gateDays,
    waveKmDay:inp.velKmDay,totalKm,timing:tm,meanV:tm.prof&&tm.prof.meanV,
    daysToSea:frontDays,daysAllOut:frontDays+gateDays,upstream:up,velMps:inp.velMps,inp};
}

/* ---- v7.18 input limits: check every release parameter against what is published ---- */
function damLimits(){
  const box=dEl("damLim");
  if(!box)return;
  const plan=damPlan(),facts=damFactsFor(damSel&&damSel.name),inp=plan.inp;
  const notes=[];
  /* rate vs published gate capacity */
  if(inp.gates.length){
    const capM3s=parseFloat((dEl("damGates").dataset.gateCfs||"0"))*M3S_CFS;
    if(capM3s>0&&plan.rateM3s>capM3s*1.001){
      notes.push('<span class="bad">Rate '+plan.rateM3s.toFixed(0)+" m³/s is above the published "
        +capM3s.toFixed(0)+" m³/s full-open capacity — the gates cannot pass it.</span>");
    }else{
      notes.push('<span class="ok">Rate '+plan.rateM3s.toFixed(0)+" m³/s · gates can pass up to "
        +capM3s.toFixed(0)+" m³/s.</span>");
    }
  }else if(plan.rateM3s>0){
    notes.push('<span class="warn">No gate capacity published for this dam — the rate is your input.</span>');
  }
  /* volume vs live storage */
  if(facts&&facts.live_tmc!=null&&inp.volTmc!=null){
    if(inp.volTmc>facts.live_tmc){
      notes.push('<span class="bad">Volume '+inp.volTmc+" TMC exceeds the published live storage "
        +facts.live_tmc+" TMC.</span>");
    }else{
      notes.push('<span class="ok">Volume '+inp.volTmc+" of "+facts.live_tmc+" TMC live storage.</span>");
    }
  }else if(inp.volTmc!=null){
    notes.push('<span class="warn">Live storage not published — volume is unchecked.</span>');
  }
  /* wave speed band */
  const v=plan.velMps;
  if(v<VEL_TYP_LO||v>VEL_TYP_HI){
    notes.push('<span class="warn">Wave '+v.toFixed(1)+" m/s is outside the usual alluvial band "
      +VEL_TYP_LO+"-"+VEL_TYP_HI+" m/s.</span>");
  }else{
    notes.push('<span class="ok">Wave '+v.toFixed(1)+" m/s ("+plan.waveKmDay.toFixed(0)+" km/day), inside the usual 0.5-3.0 m/s band.</span>");
  }
  /* highlight the offending inputs */
  const rateEl=dEl("damRate"),volEl=dEl("damVol"),velEl=dEl("damVel");
  if(rateEl)rateEl.classList.toggle("bad",!!(inp.gates.length&&plan.rateM3s>parseFloat((dEl("damGates").dataset.gateCfs||"0"))*M3S_CFS*1.001));
  if(volEl)volEl.classList.toggle("bad",!!(facts&&facts.live_tmc!=null&&inp.volTmc!=null&&inp.volTmc>facts.live_tmc));
  if(velEl)velEl.classList.toggle("bad",v<VEL_TYP_LO||v>VEL_TYP_HI);
  box.innerHTML=notes.join("<br>");
}

/* gate sliders — one per PUBLISHED gate; each 0-100% of that gate's full-open discharge */
function damGateUI(f){
  const box=dEl("damGates");if(!box)return;
  const n=(f&&f.gate_count)||0,per=(f&&f.gate_capacity_cfs)||0;
  if(!n||!per){
    box.innerHTML='<div class="damGateNote">'+(
      f&&f.gate_count
        ?(n+" spillway gates recorded, but the full-open discharge is not published — set a rate instead.")
        :"Gate count / discharge not recorded in the sources used for this dam — set a rate instead.")+"</div>";
    box.removeAttribute("data-gate-count");box.removeAttribute("data-gate-cfs");box.removeAttribute("data-gate-driven");
    return;
  }
  box.dataset.gateCount=String(n);box.dataset.gateCfs=String(per);box.dataset.gateDriven="1";
  const each=Math.round(per/n),def=Math.max(1,Math.round(100/n));
  let h='<div class="damGateHead">'+n+" spillway gates · "+per.toLocaleString("en-IN")
    +" cfs fully open ("+each.toLocaleString("en-IN")+" cfs each, even split) — <span id=\"damGateSum\"></span></div><div class=\"damGateGrid\">";
  for(let i=1;i<=n;i++)h+='<label class="damGate"><span>G'+i+'</span><input type="range" min="0" max="100" step="5" value="'+def+'"></label>';
  box.innerHTML=h+"</div>";
  for(const inp of box.querySelectorAll("input[type=range]"))inp.addEventListener("input",()=>damReadout());
  const rate=dEl("damRate");
  if(rate&&(dEl("damVol")||{}).value!==undefined)rate.value=Math.round(per*def/100*M3S_CFS).toString();
  damReadout();
}
function damGateSum(){
  const box=dEl("damGates"),sum=dEl("damGateSum");
  if(!box||!sum)return;
  if(!box.dataset.gateCount){sum.textContent="";return;}
  const inp=damInputs();
  const pct=inp.gateCfs/parseFloat(box.dataset.gateCfs)*100;
  sum.textContent=(inp.gateCfs*M3S_CFS).toFixed(0)+" m³/s ("+inp.gateCfs.toFixed(0)+" cfs) · "+pct.toFixed(0)+"% open";
}

/* the readout: timings, volume, drawdown and which downstream dam fills when */

/* the readout: timings, volume, drawdown and which downstream dam fills when */
function damReadout(){
  const box=dEl("damRead");
  damGateSum();
  damLimits();
  if(!box)return;
  if(!route){box.innerHTML="";return;}
  const plan=damPlan(),facts=damFactsFor(damSel&&damSel.name),up=plan.upstream;
  if(!(plan.rateM3s>0)){
    box.innerHTML='<b class="warn">Set a release rate (or open the gates) to get timings.</b>';
    return;
  }
  const parts=[];
  parts.push(up
    ?"Front reaches the <b>source</b> in ≈<b>"+plan.frontDays.toFixed(1)+" d</b>"
    :"Front reaches the <b>sea</b> in ≈<b>"+plan.frontDays.toFixed(1)+" d</b>");
  if(plan.volM3!=null){
    parts.push("gates open <b>"+plan.gateDays.toFixed(2)+" d</b> for "+plan.inp.volTmc+" TMC");
    if(!up)parts.push("last water past the mouth ≈<b>"+plan.daysAllOut.toFixed(1)+" d</b>");
  }
  parts.push("rate <b>"+plan.rateM3s.toFixed(0)+" m³/s</b> ("+(plan.rateM3s*M3S_CFS).toFixed(0)+" cfs)");
  if(facts&&facts.live_tmc!=null&&plan.volM3!=null){
    parts.push("live storage "+facts.live_tmc+" TMC → ≈"
      +Math.max(0,facts.live_tmc-plan.volM3/TMC_M3).toFixed(1)+" TMC left (illustrative drawdown)");
  }
  const ds=damDownstream(6);
  if(ds.length&&!up){
    let rows="";
    for(const x of ds){
      const f=damFactsFor(x.dam.name);
      const travel=x.atKm/plan.waveKmDay;
      const need=(f&&f.live_tmc!=null)?f.live_tmc*TMC_M3/plan.rateM3s/86400:null;
      const full=need!=null?travel+Math.min(Math.max(need,isFinite(plan.gateDays)?plan.gateDays:need),Math.max(need,isFinite(plan.gateDays)?plan.gateDays:need)):null;
      rows+="<tr><td>"+x.dam.name+"</td><td>"+x.atKm.toFixed(0)+"</td><td>"+travel.toFixed(1)
        +(full!=null?"</td><td>"+full.toFixed(1)+"</td><td>"+f.live_tmc+" TMC":"</td><td>—</td><td class=\"dim\">not recorded")
        +"</td></tr>";
    }
    parts.push('<table class="damFill"><tr><th>dam on the course</th><th>at km</th><th>front (d)</th><th>full (d)</th><th>storage</th></tr>'+rows+"</table>");
  }else if(ds.length&&up){
    parts.push('<i class="dim">'+ds.length+" dam(s) lie on this upstream course — a release only runs downstream.</i>");
  }
  box.innerHTML=parts.join("<br>")
    +'<div class="damHint">Travel '+plan.waveKmDay.toFixed(0)+" km/day ("+plan.velMps.toFixed(1)
    +" m/s, user-set, illustrative) · 1 TMC = 28,317 m³ · 1 cfs = 0.0283 m³/s · travel only, no inundation</div>";
}

/* direction: downstream to the sea, or upstream to the reservoir origin (v7.12) */

/* dams that lie ON this course, ordered by distance along it (v7.12) */
function damDownstream(maxN){
  if(!route||!damList||!route.coords)return [];
  const c=route.coords;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of c){
    if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];
  }
  const LON=111.32*Math.cos(y0*Math.PI/180),LAT=111.19;
  const out=[];
  for(const d of damList){
    if(d.lon<x0-8/LON||d.lon>x1+8/LON||d.lat<y0-8/LAT||d.lat>y1+8/LAT)continue;
    let best=Infinity,at=0,run=0;
    for(let i=1;i<c.length;i++){
      const a=c[i-1],b=c[i];
      const abx=(b[0]-a[0])*LON,aby=(b[1]-a[1])*LAT;
      const seg=Math.hypot(abx,aby),L2=seg*seg;
      const t=L2?Math.max(0,Math.min(1,(((d.lon-a[0])*LON)*abx+((d.lat-a[1])*LAT)*aby)/L2)):0;
      const dx=d.lon*LON-(a[0]*LON+abx*t),dy=d.lat*LAT-(a[1]*LAT+aby*t);
      const dd=dx*dx+dy*dy;
      if(dd<best){best=dd;at=run+seg*t;}
      run+=seg;
    }
    const km=Math.sqrt(best);
    if(km>8)continue;
    if(damSel&&hav([d.lon,d.lat],[damSel.lon,damSel.lat])<2)continue;   /* skip the dam itself */
    out.push({dam:d,atKm:at,distKm:km,key:(d.name||"").toUpperCase().replace(/[^A-Z]/g,"").replace(/DAM$/,"")});
  }
  /* dams.geo.json carries near-duplicate records (Karjan / KARJAN, Tumaria Dam / TUMARIA DAM) —
     keep the nearest instance of each name so the fill table reads once per structure */
  const seen={},uniq=[];
  for(const x of out.sort((a,b)=>a.atKm-b.atKm)){
    if(seen[x.key])continue;
    seen[x.key]=1;uniq.push(x);
  }
  return uniq.slice(0,maxN||6);
}

/* gate sliders — one per PUBLISHED gate; each 0-100% of that gate's full-open discharge */

/* direction: downstream to the sea, or upstream to the reservoir origin (v7.12) */
function damDirection(){
  const up=dEl("damDirUp");
  return (up&&up.checked)?"up":"down";
}
async function damReselect(){
  if(!damSel)return;
  await damSelect(damSel);
}

/* ---- select a dam (tap or type) → course → card + layers + bird's-eye frame ---- */
function routeFromRoute(r,dam){
const coords=r.coords||[];
if(coords.length<2)return null;
const cum=[0];let km=0;
for(let i=1;i<coords.length;i++){km+=hav(coords[i-1],coords[i]);cum.push(km);}
const last=coords[coords.length-1],speed=r.speed_m_s||1.5;
return {id:dam.id,coords,cum,totalKm:km,speedMps:speed,arrivalDays:km/(speed*86.4),
  dam:{name:dam.name,lon:dam.lon,lat:dam.lat,state:dam.state,height:dam.h,river:dam.river},
  sea:{lon:last[0],lat:last[1]},name:dam.name+" → "+(r.upstream?"river source":(r.coastal?"coast":"recorded river end")),
  river:dam.river,basin:dam.basin,chains:r.chains||[],coastal:!!r.coastal,snapKm:r.snapKm,to:r.to,src:r.src||"",
  cities:r.cities||[],upstream:!!r.upstream,source:r.source||null,
  suspect:!!r.suspect,sparse:!!r.sparse,maxSegKm:r.maxSegKm||0,maxSegLimitKm:r.maxSegLimitKm||15,
    /* v7.18: measured quality of the drawn course — how far it strays from the mapped channel and
       where the source digitisation is broken. Computed in the worker (it has the full index). */
    offKm:(typeof r.offKm==="number"?r.offKm:null),gapKm:r.gapKm||4,gapCount:r.gapCount||0};
}

async function damSelect(dam){
if(damRun&&damRun.on)damReset();
damSel=dam;
const dir=damDirection(),ck=dam.id+(dir==="up"?"#up":"");
const btn=dEl("damBtn");if(btn)btn.disabled=true;
damMsg(damCache[ck]?"Course ready…":"Deriving the river course for "+dam.name+"…");
try{
  let r=damCache[ck];
  if(!r){
    try{ r=await damAsk(dam,SNAP_NEAR_KM,{upstream:dir==="up"}); }
    catch(e1){ r=await damAsk(dam,SNAP_FAR_KM,{upstream:dir==="up"}); }   /* widen once — many dams sit off the mapped line */
    damCache[ck]=r;
    damCachePut(ck,r);
  }
  const nr=routeFromRoute(r,dam);
  if(!nr)throw new Error("no geometry");
  route=nr;damLoaded=false;
  damPanelFit();
  /* v7.16: never draw a line the solver invented. A "suspect" course is either a bare dam->snap
     stub (the mapped reach ends there) or one that would need an invented bridge; either way the
     card explains it and the release is disabled. A "sparse" course follows the real channel but
     the digitisation is coarse there, so the card says how coarse. */
  if(nr.suspect){
    /* v7.18: the bar is the tool label, so the dam name goes beside it ("Release · Mettur Dam") */
    const t0=dEl("damTitle");if(t0)t0.textContent="Release · "+nr.dam.name;
    const s0=dEl("damSub");
    if(s0)s0.textContent=nr.to||"no continuous mapped channel from this dam";
    const st0=dEl("damStat");if(st0)st0.textContent="—";
    const c0=dEl("damCities");if(c0)c0.textContent="";
    const rd0=dEl("damRead");if(rd0)rd0.innerHTML="";
    const gt0=dEl("damGates");if(gt0)gt0.innerHTML="";
    const fx0=dEl("damFacts");
    if(fx0)fx0.innerHTML=damFactsText(damFactsFor(nr.dam.name));
    damMsg("Course not drawn — nothing would be shown that the river data does not contain.");
    const b0=dEl("damBtn");if(b0){b0.disabled=true;b0.textContent="No course";}
    return route;
  }
  if(nr.sparse){
    damMsg("Mapped geometry is coarse on this reach (longest mapped hop "
      +nr.maxSegKm.toFixed(0)+" km, limit "+nr.maxSegLimitKm+" km) — the course follows the source data.");
  }
  const t=dEl("damTitle");if(t)t.textContent="Release · "+nr.dam.name;
  const sub=dEl("damSub");
  if(sub)sub.textContent=(nr.chains.length?nr.chains.join(" → "):(nr.river||"river"))+" → "
    +(nr.upstream?"recorded river source (reservoir origin)":(nr.coastal?"coast":"recorded river end (inland)"))+" · "
    +nr.totalKm.toFixed(0)+" km course ("+(damOsmSrc?"OpenStreetMap shape, CWC routing":(nr.osm?"OpenStreetMap shape":"CWC centre-line"))+")"
    +(nr.osmCwc&&!nr.osm?" · CWC schematic "+nr.osmCwc.totalKm.toFixed(0)+" km":"")
    +" · "+damCourseNote(nr)
    +(nr.dam.state?" · "+nr.dam.state:"");
  const dayEl=dEl("damDay");if(dayEl)dayEl.textContent="Day 0.0";
  idleStat();
  damMsg(r.snapKm>SNAP_NEAR_KM?("course joins the mapped river "+r.snapKm.toFixed(1)+" km from the dam — illustrative snap)"):"");
  /* v7.10: mark the cities this course passes (markers + labels on the map, names in the card) */
  const cx=dEl("damCities");
  if(cx)cx.textContent=(nr.cities||[]).length
    ?"Crosses: "+nr.cities.map(c=>c.name+" ("+c.km.toFixed(0)+" km)").join(" · ")
    :"No city marker within 8 km of this course.";
  /* v7.12: researched capacity + gate controls + release timing */
  await damLoadFacts();
  const facts=damFactsFor(nr.dam.name);
  const fx=dEl("damFacts");
  if(fx)fx.innerHTML=damFactsText(facts)+' <a class="damSrc" href="data/dam-facts.json" target="_blank" rel="noopener">source list</a>';
  damGateUI(facts);
  /* v7.19: the slope block first, so the Speed box can be seeded with the slope-derived mean */
  PROF_RETRY=0;
  DAM_SPEED_AUTO=true;
  damSlopeRefresh();
  damOsmMaybe();
  damReadout();
  if(map&&mapStyleReady){
    if(!map.getSource("dam-route")){if(addDamLayers()){} }
    else{
      const s=map.getSource("dam-route");
      if(s)s.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:nr.coords},properties:{}}]});
      const g2=map.getSource("dam-gaps");
      if(g2)g2.setData({type:"FeatureCollection",features:damGapFeatures(nr)});
      const e2=map.getSource("dam-ends");
      if(e2)e2.setData({type:"FeatureCollection",features:[
        {type:"Feature",geometry:{type:"Point",coordinates:[nr.dam.lon,nr.dam.lat]},properties:{kind:"dam"}},
        {type:"Feature",geometry:{type:"Point",coordinates:[nr.sea.lon,nr.sea.lat]},properties:{kind:"sea"}}]});
      const c2=map.getSource("dam-cities");
      if(c2)c2.setData({type:"FeatureCollection",features:(nr.cities||[]).map(c=>({
        type:"Feature",geometry:{type:"Point",coordinates:[c.lon,c.lat]},properties:{name:c.name,km:c.km}}))});
      damLoaded=true;damSet(0,false);damFrameAll();
    }
  }
}catch(e){
  route=null;
  const st=dEl("damStat");if(st)st.textContent="—";
  damMsg("Course not derived: "+(e&&e.message?e.message:e));
}finally{
  const b2=dEl("damBtn");if(b2)b2.disabled=!route;
}
return route;
}

/* ---- name search ---- */
function damSearchRender(q){
const box=dEl("damResults");
if(!box||!damList)return;
const s=(q||"").trim().toLowerCase();
let out=[];
if(s){
  const scored=[];
  for(const d of damList){
    const nm=d.name.toLowerCase(),st=(d.state||"").toLowerCase(),rv=(d.river||"").toLowerCase();
    let sc=-1;
    if(nm.indexOf(s)===0)sc=0;else if(nm.indexOf(s)>=0)sc=1;else if(rv.indexOf(s)>=0)sc=2;else if(st.indexOf(s)>=0)sc=3;
    if(sc>=0)scored.push({sc,h:d.h||0,d});
  }
  scored.sort((a,b)=>a.sc-b.sc||b.h-a.h);
  out=scored.slice(0,DAM_SEARCH_MAX).map(x=>x.d);
}
if(!out.length){box.innerHTML=s?'<div class="damNo">no dam matches that name</div>':"";return;}
let h="";
for(const d of out)h+='<button class="damRes" type="button" data-id="'+d.id+'"><b>'+d.name+"</b><span>"
  +(d.state||"—")+(d.river?" · "+d.river:"")+(d.h?" · "+d.h+" m":"")+"</span></button>";
box.innerHTML=h;
for(const b of box.querySelectorAll(".damRes"))b.addEventListener("click",()=>{
  const d=damById[b.getAttribute("data-id")];
  if(d)damSelect(d);
});
}

/* ---- the activation switch: everything heavy hangs off this ---- */
async function damSetMode(on){
damMode=!!on;
const box=dEl("damMode");
if(box&&box.checked!==damMode)box.checked=damMode;
if(on){
  damMsg("Loading the dam list (2.8 MB, once)…");
  try{
    await damDams();
    damLayerAdd();
    damMsg(damList.length.toLocaleString()+" dams · tap a dot on the map or type a name below.");
  }catch(e){damMsg("Dam list unavailable: "+(e.message||e));}
  try{damEnsureWorker();damWorkerIdleTimer();}catch(e){damMsg("Router unavailable in this browser: "+(e.message||e));}
}else{
  damLayerVis(false);
  damMsg("");
}
return damMode;
}

/* ---------- route geometry helpers (unchanged geometry, v7.6 layers) ---------- */
function damBounds(){
const c=route.coords;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
for(const p of c){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
return [[x0,y0],[x1,y1]];
}

function damFrameAll(){
if(!map||!route)return;
const b=damBird(),dur=DAM_RM?0:1400,pad={top:60,bottom:70,left:290,right:70};
try{
  const cb=map.cameraForBounds(damBounds(),{padding:pad,maxZoom:8.6});
  if(cb&&cb.zoom){damZAll=cb.zoom;map.easeTo({center:cb.center,zoom:cb.zoom,pitch:b?0:52,bearing:b?0:-8},{duration:dur});return;}
}catch(_){}
try{map.fitBounds(damBounds(),{padding:pad,maxZoom:8.6,duration:dur});}catch(_){}
if(b){try{map.easeTo({pitch:0,bearing:0},{duration:dur});}catch(_){}}
}

function idleStat(){
const st=dEl("damStat");
if(st&&route)st.textContent="wave ≈"+route.speedMps+" m/s (illustrative) → "
  +(route.coastal?"sea in ≈":"river end in ≈")+route.arrivalDays.toFixed(1)+" days";
}

/* the "wet" polyline sliced at km + the single head point (FeatureCollections for setData) */
function sliceAt(km){
if(!route||km<=0)return{wet:{type:"FeatureCollection",features:[]},head:{type:"FeatureCollection",features:[]}};
const c=route.coords,cum=route.cum,out=[c[0]];
for(let i=0;i<c.length-1;i++){
  if(cum[i]>=km)break;
  if(cum[i+1]<=km){out.push(c[i+1]);continue;}
  const seg=cum[i+1]-cum[i],t=seg>1e-9?(km-cum[i])/seg:0;
  out.push([c[i][0]+(c[i+1][0]-c[i][0])*t,c[i][1]+(c[i+1][1]-c[i][1])*t]);
  break;
}
const tip=out[out.length-1];
return{wet:{type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:out},properties:{}}]},
  head:{type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"Point",coordinates:tip},properties:{}}]}};
}

/* v7.18 — the "not mapped" connectors. GAP_KM (4 km) is the same threshold the solver uses, so the
   dashed amber hops are exactly the places where the source geometry is broken. */
function damGapFeatures(r){
  const out=[];
  if(!r||!r.coords)return out;
  const coords=r.coords,limit=r.gapKm||4;
  for(let i=1;i<coords.length;i++){
    const a=coords[i-1],b=coords[i];
    const km=damHavKm(a,b);
    if(km<=limit)continue;
    out.push({type:"Feature",geometry:{type:"LineString",coordinates:[a,b]},
      properties:{km:+km.toFixed(1)}});
  }
  return out;
}
function damHavKm(a,b){
  const R=6371.0088,rad=d=>d*Math.PI/180;
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
/* one honest sentence about how well the drawn course tracks the mapped channel */
function damCourseNote(r){
  if(!r||!r.coords)return "";
  const gaps=typeof r.gapCount==="number"?r.gapCount:(damGapFeatures(r).length);
  const longGap=gaps?Math.max(...damGapFeatures(r).map(f=>f.properties.km)):0;
  const off=typeof r.offKm==="number"?r.offKm:null;
  let s=gaps
    ?"amber = "+gaps+" not-mapped connector"+(gaps>1?"s":"")+" (longest "+longGap.toFixed(0)+" km)"
    :"every drawn segment follows the mapped channel";
  if(off!=null)s+=" · max "+off.toFixed(1)+" km off the mapped river";
  return s;
}

function addDamLayers(){
/* isStyleLoaded() waits for SOURCES too, so it stays false while vector tiles stream and the
   route layers were never added; the style.load flag is the honest readiness signal */
if(!map||!route||!mapStyleReady)return false;
if(!map.getSource("dam-route")){
  const emptyFC={type:"FeatureCollection",features:[]};
  map.addSource("dam-route",{type:"geojson",data:{type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:route.coords},properties:{}}]}});
  map.addLayer({id:"dam-route-line",type:"line",source:"dam-route",
    layout:{"line-cap":"round","line-join":"round"},
    paint:{"line-color":"#0F766E","line-width":2.2,"line-opacity":0.6,"line-dasharray":[1.7,1.3]}});
  /* v7.18: the places where the source digitisation breaks and the line has to jump. They are
     drawn in a different colour and dash so an invented connector is never mistaken for a mapped
     reach — measured offKm/gaps for the selected dam are printed in the card. */
  map.addSource("dam-gaps",{type:"geojson",data:{type:"FeatureCollection",features:damGapFeatures(route)}});
  map.addLayer({id:"dam-gap-line",type:"line",source:"dam-gaps",
    layout:{"line-cap":"butt","line-join":"round"},
    paint:{"line-color":"#F59E0B","line-width":2.4,"line-opacity":0.95,"line-dasharray":[0.6,1.6]}});
  /* v7.20: the CWC schematic line stays on the map as a thin grey reference once the course has
     been shaped on OpenStreetMap, so the difference between the source and the real shape is visible */
  map.addSource("dam-cwc",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"dam-cwc-line",type:"line",source:"dam-cwc",
    layout:{"line-cap":"butt","line-join":"round"},
    paint:{"line-color":"#94A3B8","line-width":1.1,"line-opacity":0.75,"line-dasharray":[0.4,1.2]}});
  map.addSource("dam-ends",{type:"geojson",data:{type:"FeatureCollection",features:[
    {type:"Feature",geometry:{type:"Point",coordinates:[route.dam.lon,route.dam.lat]},properties:{kind:"dam"}},
    {type:"Feature",geometry:{type:"Point",coordinates:[route.sea.lon,route.sea.lat]},properties:{kind:"sea"}}]}});
  map.addLayer({id:"dam-end-dam",type:"circle",source:"dam-ends",filter:["==",["get","kind"],"dam"],
    paint:{"circle-radius":4.5,"circle-color":"#B45309","circle-stroke-color":"#FAF9F6","circle-stroke-width":1.2}});
  map.addLayer({id:"dam-end-sea",type:"circle",source:"dam-ends",filter:["==",["get","kind"],"sea"],
    paint:{"circle-radius":4.5,"circle-color":"#1D4ED8","circle-stroke-color":"#FAF9F6","circle-stroke-width":1.2}});
  map.addSource("dam-wet",{type:"geojson",data:emptyFC});
  map.addLayer({id:"dam-wet-line",type:"line",source:"dam-wet",
    layout:{"line-cap":"round","line-join":"round"},
    paint:{"line-color":"#2DD4BF","line-width":4.6,"line-opacity":0.95}});
  map.addSource("dam-head",{type:"geojson",data:emptyFC});
  map.addLayer({id:"dam-head-halo",type:"circle",source:"dam-head",
    paint:{"circle-radius":15,"circle-color":"#5EEAD4","circle-opacity":0.25}});
  map.addLayer({id:"dam-head-dot",type:"circle",source:"dam-head",
    paint:{"circle-radius":6,"circle-color":"#0F766E","circle-stroke-color":"#FAF9F6","circle-stroke-width":1.8}});
  map.addSource("dam-cities",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"dam-city-dot",type:"circle",source:"dam-cities",
    paint:{"circle-radius":3.6,"circle-color":"#FAF9F6","circle-stroke-color":"#1A1A1A","circle-stroke-width":1.6}});
  try{map.addLayer({id:"dam-city-label",type:"symbol",source:"dam-cities",
    layout:{"text-field":["get","name"],"text-size":11,"text-offset":[0,1.2],"text-anchor":"top","text-max-width":9,
      "text-allow-overlap":false},
    paint:{"text-color":"#14181A","text-halo-color":"#FAF9F6","text-halo-width":1.5}});}catch(e){}   /* needs style glyphs — circles still show */
  map.addSource("dam-names",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  try{map.addLayer({id:"dam-name",type:"symbol",source:"dam-names",
    layout:{"text-field":["get","name"],"text-size":11.5,"text-offset":[0,1.4],"text-anchor":"top","text-max-width":11},
    paint:{"text-color":"#0B3B36","text-halo-color":"#FAF9F6","text-halo-width":1.7}});}catch(e){}
  try{map.setLayoutProperty("dam-name","visibility","none");}catch(_){}   /* names only while releasing */
}
damLoaded=true;
/* v7.10: the city markers are filled here as well — damSelect may have run before the layers existed */
const csrc=map.getSource("dam-cities");
if(csrc)csrc.setData({type:"FeatureCollection",features:(route.cities||[]).map(c=>({
  type:"Feature",geometry:{type:"Point",coordinates:[c.lon,c.lat]},properties:{name:c.name,km:c.km}}))});
damSet(0,false);
/* v7.18 fix: on the FIRST selection this is the branch damSelect takes (it only calls damFrameAll
   when the route layers already exist), so without this the camera stayed on the default India view
   while the card described a course 1,000 km away. */
damFrameAll();
return true;
}

/* paint the current front (km) into the layers + the card; final=true freezes the readout */
function damSet(km,final){
if(!route)return;
const dayEl=dEl("damDay"),stat=dEl("damStat");
const tm=damTiming();
const day=tm.dayAt(km);
if(dayEl)dayEl.textContent="Day "+day.toFixed(1);
const plan=damPlan();
const volOut=(plan.volM3!=null&&plan.rateM3s>0)?Math.min(plan.volM3,plan.rateM3s*day*86400):null;
if(stat)stat.textContent=final
?(route.coastal?"Reached the sea in ≈":"Reached the recorded river end in ≈")+plan.daysToSea.toFixed(1)+" days (illustrative)"
:Math.round(km)+" / "+route.totalKm.toFixed(0)+" km · day "+day.toFixed(1)+" of "+tm.totalDays.toFixed(1)
+(volOut!=null?" · released "+(volOut/TMC_M3).toFixed(1)+" TMC":"")
+(plan.rateM3s>0?(" · "+plan.rateM3s.toFixed(0)+" m³/s"):(tm.mode==="profile"?" · slope profile (illustrative)":" · "+damVelocity().toFixed(1)+" m/s (illustrative)"));
if(!map||!damLoaded)return;
const s=sliceAt(km),wet=map.getSource("dam-wet"),head=map.getSource("dam-head");
if(wet)wet.setData(s.wet);
if(head)head.setData(s.head);
}

const indexAtKm=km=>{const c=route.coords;let i=0;while(i<c.length-2&&route.cum[i+1]<km)i++;return i;};

/* v7.9: the zoom TRAVELS with the wave — bird's-eye, easing in as the front advances */
function damFollowStep(km){
if(!map||!route||!damRun||!damFollowOn())return;
if(window.__deckStageLive&&!window.__deckStageLive(map.getContainer()))return;   /* v7.16: no camera work off-screen */
const now=performance.now();
if(damRun.camAt&&now-damRun.camAt<150)return;
damRun.camAt=now;
const head=route.coords[indexAtKm(km)];
const frac=route.totalKm?Math.min(1,km/route.totalKm):0;
const z0=damRun.zAll||damZAll||map.getZoom(),b=damBird();
map.easeTo({center:[head[0],head[1]],zoom:Math.max(z0-1.7,z0*(1-0.45*frac)),
  pitch:b?0:map.getPitch(),bearing:b?0:map.getBearing()},{duration:DAM_RM?0:150});   /* C1: match the tick so eases never overlap */
}

/* rAF paints it, but a backgrounded tab freezes rAF — a 120 ms timer keeps the day clock
   advancing there too (both are cancelled when the run ends or is reset). */
function damKick(fn){
if(damRun.raf)cancelAnimationFrame(damRun.raf);
if(damRun.iv)clearInterval(damRun.iv);
damRun.raf=requestAnimationFrame(fn);
damRun.iv=setInterval(fn,120);
}
function damTick(){
if(!damRun||!damRun.on)return;
const now=performance.now();   /* wall clock only — rAF's timestamp is not on this clock in every host */
const f=Math.min(1,(now-damRun.t0)/(DAM_SECONDS*1000)),km=f*route.totalKm;
damRun.km=km;
damSet(km,false);
damFollowStep(km);
if(f<1)return;
damRun.on=false;damRun.reached=true;
if(damRun.iv){clearInterval(damRun.iv);damRun.iv=0;}
damRun.raf=0;
damSet(route.totalKm,true);
const btn=dEl("damBtn");if(btn)btn.textContent="⟲ Release again";
}

async function damStart(){
const btn=dEl("damBtn");
if(damRun&&damRun.on)damReset();
if(!route){
  if(btn){btn.disabled=false;btn.textContent="Release";}
  damMsg("Pick a dam first: turn on “Find a dam”, then tap a dot or type a name.");
  return false;
}
try{
  await ensure();
  for(let i=0;i<40&&!addDamLayers();i++)await new Promise(r=>setTimeout(r,150));   /* the style may still be loading */
  if(!damLoaded)throw new Error("map style not ready for route layers");
}catch(e){
  if(btn){btn.disabled=false;btn.textContent="Release";}
  const st=dEl("damStat");if(st)st.textContent="Route/map not loaded — needs the 3D map (MapLibre + tiles).";
  console.warn("[dam]",e.message||e);
  return false;
}
if(btn)btn.disabled=false;
try{ damFrameAll(); }catch(_){}   /* bird's-eye frame of the whole course, card padding on the left */
damRun={on:true,reached:false,km:0,t0:performance.now(),raf:0,iv:0,camAt:0,zAll:damZAll};
if(btn)btn.textContent="⟲ Reset";
damPerf(true);                                   /* drop buildings + 13k dots while the wave runs */
damNameData([{name:route.dam.name,lon:route.dam.lon,lat:route.dam.lat}]);
damSet(0,false);
damKick(damTick);
return true;
}

function damReset(){
if(damRun){damRun.on=false;if(damRun.raf)cancelAnimationFrame(damRun.raf);if(damRun.iv)clearInterval(damRun.iv);}
damRun=null;
damPerf(false);
damNameData([]);
damSet(0,false);
const dayEl=dEl("damDay");if(dayEl)dayEl.textContent="Day 0.0";
try{ damFrameAll(); }catch(_){}
idleStat();
const btn=dEl("damBtn");if(btn){btn.disabled=!route;btn.textContent="Release";}
}

window.__dam={
  perf:s=>window.__deckPerf?window.__deckPerf(s||3):Promise.resolve({note:"perf probe not available"}),
start:()=>damStart(),
reset:()=>{damReset();return true;},
mode:on=>damSetMode(on),
smooth:on=>{damSmooth(on);return true;},
fullscreen:()=>mapFullscreenToggle(),
fullscreenOn:()=>!!(document.fullscreenElement||document.webkitFullscreenElement)||
  !!(map&&map.getContainer().parentNode.classList.contains("fsmode")),
pickAt:(x,y)=>{const d=damPickAt(x,y);if(d)damSelect(d);return d?d.name:null;},
modeOn:()=>damMode,
search:q=>{damSearchRender(q);return (dEl("damResults")||{}).childElementCount||0;},
pick:id=>damSelect(damById[id]),
selected:()=>damSel?{id:damSel.id,name:damSel.name,state:damSel.state,river:damSel.river,h:damSel.h}:null,
facts:()=>{const f=damFactsFor(damSel&&damSel.name);return f?{name:f.name,gross_tmc:f.gross_tmc,live_tmc:f.live_tmc,gates:f.gate_count,gate_cfs:f.gate_capacity_cfs,verified:f.verify_status}:null;},
plan:()=>{const p=damPlan();return {rate_m3s:+p.rateM3s.toFixed(1),rate_cfs:+(p.rateM3s*M3S_CFS).toFixed(0),volTmc:p.inp.volTmc,frontDays:+p.frontDays.toFixed(2),gateDays:isFinite(p.gateDays)?+p.gateDays.toFixed(3):null,daysToSea:+p.daysToSea.toFixed(2),daysAllOut:isFinite(p.daysAllOut)?+p.daysAllOut.toFixed(2):null,upstream:p.upstream,mode:p.timing.mode,speed_mps:+damVelocity().toFixed(2)};},
/* v7.19: the measured slope chain, exposed so verification can read the numbers */
timing:()=>{const tm=damTiming();return {mode:tm.mode,totalDays:+tm.totalDays.toFixed(3),
  dayAtFrac:f=>+tm.dayAt(f*(route?route.totalKm:0)).toFixed(3)};},
profile:()=>{const p=damProfile();if(!p)return null;return {frl:p.inp.frl,end:p.inp.end,n:p.inp.n,R:p.inp.R,
  dem0:p.raw?p.raw.filter((_,i)=>i%6===0):null,
  published:p.inp.published,head:+p.headM.toFixed(2),slopeMean:+p.slopeMean.toExponential(3),
  oneIn:Math.round(1/Math.max(1e-9,p.slopeMean)),meanV:+p.meanV.toFixed(3),
  meanKmDay:+(p.meanV*86.4).toFixed(1),totalDays:+p.totalDays.toFixed(2),
  steepKm:p.steepKm,steepS:+p.steepS.toExponential(2),steepV:p.reaches?null:null,
  dem:p.dem,clamped:p.clamped,floored:p.floored,flat:p.flat,points:p.prof.length,
  shape:p.prof.filter((q,i)=>i%Math.max(1,Math.round(p.prof.length/12))===0).map(q=>[q.km,+q.z.toFixed(1)]),
  vRange:[Math.min.apply(null,p.reaches.map(r=>r.v)),Math.max.apply(null,p.reaches.map(r=>r.v))].map(v=>+v.toFixed(2))};},
downstream:()=>damDownstream(6).map(x=>({name:x.dam.name,atKm:+x.atKm.toFixed(1),distKm:+x.distKm.toFixed(1),live:(damFactsFor(x.dam.name)||{}).live_tmc||null})),
damCount:()=>damList?damList.length:0,
cached:()=>Object.keys(damCache).length,
state:()=>({running:!!(damRun&&damRun.on),day:+damTiming().dayAt(damRun?damRun.km:0).toFixed(3),
  km:+((damRun?damRun.km:0)).toFixed(2),totalKm:route?+route.totalKm.toFixed(2):null,
  arrivalDays:route?+route.arrivalDays.toFixed(2):null,reached:!!(damRun&&damRun.reached),
  pitch:map?+map.getPitch().toFixed(1):null,zoom:map?+map.getZoom().toFixed(2):null}),
route:()=>route?{id:route.id,n:route.coords.length,totalKm:+route.totalKm.toFixed(2),speedKmDay:+(route.speedMps*86.4).toFixed(1),
  arrivalDays:+route.arrivalDays.toFixed(2),dam:route.dam,sea:route.sea,river:route.river,
  coastal:route.coastal,chains:route.chains,snapKm:route.snapKm,
  upstream:!!route.upstream,source:route.source||null,
  /* v7.18 course-quality numbers, so verification can read the measured values */
  suspect:!!route.suspect,sparse:!!route.sparse,maxSegKm:route.maxSegKm||0,
  gapCount:route.gapCount||0,gapKm:route.gapKm||4,offKm:route.offKm==null?null:route.offKm,
  cities:(route.cities||[]).map(c=>({name:c.name,km:c.km}))}:null
};

const damBtn=dEl("damBtn");
if(damBtn)damBtn.addEventListener("click",()=>{damRun&&damRun.on?damReset():damStart();});
const damModeBox=dEl("damMode");
if(damModeBox)damModeBox.addEventListener("change",()=>damSetMode(damModeBox.checked));
const damSearchBox=dEl("damSearch");
if(damSearchBox)damSearchBox.addEventListener("input",()=>damSearchRender(damSearchBox.value));
const damSmoothBox=dEl("damSmooth");
if(damSmoothBox)damSmoothBox.addEventListener("change",()=>damSmooth(damSmoothBox.checked));
/* v7.12: release controls — typing a rate takes over from the gate sliders, typing again hands it back */
for(const id of ["damUnit","damVol"])dEl(id)&&dEl(id).addEventListener("input",()=>damReadout());
dEl("damRate")&&dEl("damRate").addEventListener("input",()=>{
  const box=dEl("damGates");
  if(box)box.dataset.gateDriven="0";          /* the typed rate now drives the sim */
  damReadout();
});
dEl("damVel")&&dEl("damVel").addEventListener("input",()=>{DAM_SPEED_AUTO=false;damReadout();});
/* v7.19: the slope block is the source of the suggested speed, so every one of its inputs redraws
   the profile, the numbers and the suggested velocity */
for(const id of ["damFrl","damEnd","damMann","damDepth"]){
  const el=dEl(id);
  if(el)el.addEventListener("input",()=>{PROF_CACHE=null;damSlopeUI();damSlopeSeed();damReadout();});
}
dEl("damUseSpeed")&&dEl("damUseSpeed").addEventListener("click",()=>damUseSpeed());
/* v7.20: "Real shape" toggles the OpenStreetMap re-shape; turning it off restores the CWC line */
dEl("damOsm")&&dEl("damOsm").addEventListener("change",()=>{
  if(!route)return;
  if(!damOsmOn()){
    if(route.osm&&route.osmCwc){
      route.coords=route.osmCwc.coords;route.cum=route.osmCwc.cum;route.totalKm=route.osmCwc.totalKm;
      const s=map&&map.getSource("dam-route");
      if(s)s.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:route.coords},properties:{}}]});
      const ref=map&&map.getSource("dam-cwc");
      if(ref)ref.setData({type:"FeatureCollection",features:[]});
      const g2=map&&map.getSource("dam-gaps");
      if(g2)g2.setData({type:"FeatureCollection",features:damGapFeatures(route)});
      damEndPoints();
    }
    damOsmNote(null,"Showing the CWC schematic line.");
    damReadout();
    return;
  }
  if(route.osm&&!route.osmCwc)route.osmCwc={coords:route.coords.slice(),cum:route.cum.slice(),totalKm:route.totalKm};
  PROF_CACHE=null;
  damOsmMaybe();
});
dEl("damProfMode")&&dEl("damProfMode").addEventListener("change",()=>{damReset();damReadout();});
/* v7.18: collapse / expand the console (remembered per session; ?fold=1 starts folded) */
dEl("damFold")&&dEl("damFold").addEventListener("click",()=>{
  const ui=dEl("damUI"),btn=dEl("damFold");
  const folded=ui.classList.toggle("folded");
  btn.textContent=folded?"▸":"▾";
  btn.setAttribute("aria-expanded",folded?"false":"true");
  try{sessionStorage.setItem("t3consoleFold",folded?"1":"0");}catch(_){}
});
(function(){
  const ui=dEl("damUI"),btn=dEl("damFold");
  if(!ui||!btn)return;
  let folded=/[?&]fold=1/.test(location.search);
  try{const v=sessionStorage.getItem("t3consoleFold");if(v==="1")folded=true;else if(v==="0"&&!/[?&]fold=1/.test(location.search))folded=false;}catch(_){}
  ui.classList.toggle("folded",folded);
  btn.textContent=folded?"▸":"▾";
  btn.setAttribute("aria-expanded",folded?"false":"true");
})();
damConverter();
for(const id of ["damDirDown","damDirUp"])dEl(id)&&dEl(id).addEventListener("change",()=>damReselect());
/* v7.14 full screen: button, F key, and resize on every full-screen change */
dEl("m3fs")&&dEl("m3fs").addEventListener("click",(e)=>mapFullscreenToggle(e));
document.addEventListener("fullscreenchange",mapFullscreenSync);
document.addEventListener("webkitfullscreenchange",mapFullscreenSync);
addEventListener("keydown",e=>{
  const tag=(e.target&&e.target.tagName)||"";
  if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA"||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==="f"||e.key==="F"){ e.preventDefault(); mapFullscreenToggle(e); }
});

/* ---------- end v7.6 dam release ---------- */

async function ensure(){
if(map)return map;
const ml=await loadLib();
mlRef=ml;
map=new ml.Map({
container:"map3d",style:STYLE_URL,
center:VIEW.center,zoom:VIEW.zoom,pitch:VIEW.pitch,bearing:VIEW.bearing,
maxPitch:80,antialias:true,attributionControl:{compact:true}
});
map.addControl(new ml.NavigationControl({visualizePitch:true}),"top-right");
map.addControl(new ml.ScaleControl({maxWidth:90,unit:"metric"}),"bottom-left");
map.on("style.load",()=>{mapStyleReady=true;try{addSkyTerrainBuildings();}catch(e){console.warn("[map3d] style extras failed:",e.message||e);}});
map.on("error",e=>{if(e&&e.error)console.warn("[map3d]",e.error.message||e.error);});
if(!rsWired){rsWired=true;addEventListener("resize",()=>{if(map)map.resize();});}
/* resolve once the style + sources are ready — style.load fires even in background
   tabs, where no first frame paints until the tab is visible (tiles then stream in);
   waiting for "load" here would hang the button forever in a hidden tab */
await Promise.race([
new Promise(r=>{if(map.isStyleLoaded())r();else map.once("style.load",r);}),
new Promise((_,rej)=>setTimeout(()=>rej(new Error("3D map did not finish loading in time")),20000))
]);
map.resize();
return map;
}

window.__map3d={
async setActive(on){
if(!on)return true;
try{
await ensure();
map.resize();
/* v7.9: nothing dam-related loads here — the feature is fully lazy (see the dam section) */
const cap=document.getElementById("map3dCap");
if(cap)cap.textContent="MapLibre GL JS · OpenFreeMap tiles · Mapterhorn DEM — true scale · drag rotate · right-drag pan · scroll zoom";
return true;
}catch(e){
console.warn("[map3d]",e.message||e);
try{if(map)map.remove();}catch(_){}
map=null;
return false;
}
},
map:()=>map,
ready:()=>!!(map&&map.isStyleLoaded&&map.isStyleLoaded()),
style:()=>STYLE_URL,
layers:()=>map?map.getStyle().layers.map(l=>l.id+":"+l.type):null,
terrain:()=>!!(map&&map.getTerrain&&map.getTerrain())
};
