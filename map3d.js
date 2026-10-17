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
const DAM_WORKER="data/dam-router-worker.js?v=7.9";
const SNAP_NEAR_KM=6,SNAP_FAR_KM=12,DAM_SEARCH_MAX=14;

let damP=null,damList=null,damById=null,damCache={},damWorker=null,damWait={},damSeq=0,damMode=false,damSel=null;

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
    if(on){ map.setTerrain(null); map.easeTo({pitch:0,bearing:0},{duration:600}); }
    else if(terrainReady)map.setTerrain({source:"deck-dem",exaggeration:1});
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
  /* the canvas must be resized after the layout settles, or the map stays letterboxed */
  if(map){
    try{ map.resize(); }catch(_){}
    setTimeout(()=>{ try{ map.resize(); map._render&&map._render(performance.now()); }catch(_){} },60);
    setTimeout(()=>{ try{ map.resize(); }catch(_){} },260);
  }
}
addEventListener("resize",()=>{ if(map)mapFullscreenSync(); });

/* ---- the routing worker (heavy data lives here, not in the page) ---- */
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
  if(m.ok)w.resolve(m.route);else w.reject(new Error(m.error));
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

/* ---- researched dam facts (capacity + gates) — data/dam-facts.json, loaded once ---------- */
const DAM_FACTS_URL="data/dam-facts.json";
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
function damInputs(){
  const unit=(dEl("damUnit")||{}).value||"cms";
  const rateRaw=parseFloat((dEl("damRate")||{}).value)||0;
  const rateM3s=unit==="cfs"?rateRaw*CFS_M3S:rateRaw;
  const volRaw=parseFloat((dEl("damVol")||{}).value)||0;
  const volTmc=volRaw>0?volRaw:null;
  const gates=[];
  const box=dEl("damGates");
  if(box&&box.dataset.gateCount){
    const per=parseFloat(box.dataset.gateCfs||"0")||0;
    for(const inp of box.querySelectorAll("input[type=range]"))gates.push({pct:parseFloat(inp.value)/100,capacityCfs:per});
  }
  const gateBox=dEl("damGates");
  const gateCfs=Math.min(1,gates.reduce((s,g)=>s+g.pct,0))*((parseFloat((gateBox||{}).dataset.gateCfs))||0);
  /* while the sliders own the rate (their default), the typed box just mirrors the total */
  const gateDriven=!!(gates.length&&gateBox&&gateBox.dataset.gateDriven==="1");
  return {unit,rateRaw,rateM3s,volTmc,gates,gateCfs,gateDriven};
}
function damPlan(){
  const inp=damInputs();
  const rateM3s=inp.gateDriven?inp.gateCfs*M3S_CFS:inp.rateM3s;
  const waveKmDay=(route&&route.speedMps?route.speedMps:1.5)*86.4;
  const totalKm=route?route.totalKm:0;
  const up=!!(route&&route.upstream);
  const frontDays=rateM3s>0?totalKm/waveKmDay:Infinity;
  const gateDays=(rateM3s>0&&inp.volTmc!=null)?inp.volTmc*TMC_M3/rateM3s/86400:Infinity;
  return {rateM3s,volM3:inp.volTmc!=null?inp.volTmc*TMC_M3:null,frontDays,gateDays,waveKmDay,totalKm,
    daysToSea:frontDays,daysAllOut:frontDays+gateDays,upstream:up,inp};
}

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
function damReadout(){
  const box=dEl("damRead");
  damGateSum();
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
    +'<div class="damHint">Travel '+plan.waveKmDay.toFixed(0)+" km/day (1.5 m/s, illustrative) · 1 TMC = 28,317 m³ · 1 cfs = 0.0283 m³/s · travel only, no inundation</div>";
}

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
  cities:r.cities||[],upstream:!!r.upstream,source:r.source||null};
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
  }
  const nr=routeFromRoute(r,dam);
  if(!nr)throw new Error("no geometry");
  route=nr;damLoaded=false;
  const t=dEl("damTitle");if(t)t.textContent="💧 "+nr.dam.name+" release";
  const sub=dEl("damSub");
  if(sub)sub.textContent=(nr.chains.length?nr.chains.join(" → "):(nr.river||"river"))+" → "
    +(nr.upstream?"recorded river source (reservoir origin)":(nr.coastal?"coast":"recorded river end (inland)"))+" · "+nr.totalKm.toFixed(0)+" km course (CWC centre-line)"
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
  damReadout();
  if(map&&mapStyleReady){
    if(!map.getSource("dam-route")){if(addDamLayers()){} }
    else{
      const s=map.getSource("dam-route");
      if(s)s.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:nr.coords},properties:{}}]});
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
  try{damEnsureWorker();}catch(e){damMsg("Router unavailable in this browser: "+(e.message||e));}
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
return true;
}

/* paint the current front (km) into the layers + the card; final=true freezes the readout */
function damSet(km,final){
if(!route)return;
const dayEl=dEl("damDay"),stat=dEl("damStat");
const waveKmDay=(route.speedMps||1.5)*86.4,day=km/waveKmDay;
if(dayEl)dayEl.textContent="Day "+day.toFixed(1);
const plan=damPlan();
const volOut=(plan.volM3!=null&&plan.rateM3s>0)?Math.min(plan.volM3,plan.rateM3s*day*86400):null;
if(stat)stat.textContent=final
?(route.coastal?"Reached the sea in ≈":"Reached the recorded river end in ≈")+plan.daysToSea.toFixed(1)+" days (illustrative)"
:Math.round(km)+" / "+route.totalKm.toFixed(0)+" km · day "+day.toFixed(1)
+(volOut!=null?" · released "+(volOut/TMC_M3).toFixed(1)+" TMC":"")
+(plan.rateM3s>0?(" · "+plan.rateM3s.toFixed(0)+" m³/s"):" · wave 1.5 m/s (illustrative)");
if(!map||!damLoaded)return;
const s=sliceAt(km),wet=map.getSource("dam-wet"),head=map.getSource("dam-head");
if(wet)wet.setData(s.wet);
if(head)head.setData(s.head);
}

const indexAtKm=km=>{const c=route.coords;let i=0;while(i<c.length-2&&route.cum[i+1]<km)i++;return i;};

/* v7.9: the zoom TRAVELS with the wave — bird's-eye, easing in as the front advances */
function damFollowStep(km){
if(!map||!route||!damRun||!damFollowOn())return;
const now=performance.now();
if(damRun.camAt&&now-damRun.camAt<150)return;
damRun.camAt=now;
const head=route.coords[indexAtKm(km)];
const frac=route.totalKm?Math.min(1,km/route.totalKm):0;
const z0=damRun.zAll||damZAll||map.getZoom(),b=damBird();
map.easeTo({center:[head[0],head[1]],zoom:Math.max(z0-1.7,z0*(1-0.45*frac)),
  pitch:b?0:map.getPitch(),bearing:b?0:map.getBearing()},{duration:DAM_RM?0:420});
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
  if(btn){btn.disabled=false;btn.textContent="Release water";}
  damMsg("Pick a dam first: turn on “Find a dam”, then tap a dot or type a name.");
  return false;
}
try{
  await ensure();
  for(let i=0;i<40&&!addDamLayers();i++)await new Promise(r=>setTimeout(r,150));   /* the style may still be loading */
  if(!damLoaded)throw new Error("map style not ready for route layers");
}catch(e){
  if(btn){btn.disabled=false;btn.textContent="Release water";}
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
const btn=dEl("damBtn");if(btn){btn.disabled=!route;btn.textContent="Release water";}
}

window.__dam={
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
plan:()=>{const p=damPlan();return {rate_m3s:+p.rateM3s.toFixed(1),rate_cfs:+(p.rateM3s*M3S_CFS).toFixed(0),volTmc:p.inp.volTmc,frontDays:+p.frontDays.toFixed(2),gateDays:isFinite(p.gateDays)?+p.gateDays.toFixed(3):null,daysToSea:+p.daysToSea.toFixed(2),daysAllOut:isFinite(p.daysAllOut)?+p.daysAllOut.toFixed(2):null,upstream:p.upstream};},
downstream:()=>damDownstream(6).map(x=>({name:x.dam.name,atKm:+x.atKm.toFixed(1),distKm:+x.distKm.toFixed(1),live:(damFactsFor(x.dam.name)||{}).live_tmc||null})),
damCount:()=>damList?damList.length:0,
cached:()=>Object.keys(damCache).length,
state:()=>({running:!!(damRun&&damRun.on),day:+((damRun?damRun.km:0)/(route?route.speedMps*86.4:129.6)).toFixed(3),
  km:+((damRun?damRun.km:0)).toFixed(2),totalKm:route?+route.totalKm.toFixed(2):null,
  arrivalDays:route?+route.arrivalDays.toFixed(2):null,reached:!!(damRun&&damRun.reached),
  pitch:map?+map.getPitch().toFixed(1):null,zoom:map?+map.getZoom().toFixed(2):null}),
route:()=>route?{id:route.id,n:route.coords.length,totalKm:+route.totalKm.toFixed(2),speedKmDay:+(route.speedMps*86.4).toFixed(1),
  arrivalDays:+route.arrivalDays.toFixed(2),dam:route.dam,sea:route.sea,river:route.river,
  coastal:route.coastal,chains:route.chains,snapKm:route.snapKm,
  upstream:!!route.upstream,source:route.source||null,
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
