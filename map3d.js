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

let libP=null,map=null,mlRef=null,rsWired=false;
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
map.setTerrain({source:"deck-dem",exaggeration:1});   /* ×1 = true scale; this deck never exaggerates relief */
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
if(!map||!map.getLayer("dam-pts"))return;
try{map.setLayoutProperty("dam-pts","visibility",on?"visible":"none");}catch(_){}
try{map.getCanvas().style.cursor=on?"crosshair":"";}catch(_){}
}

function damLayerAdd(){
if(!map||!damList)return;
if(!map.getSource("dam-pts")){
  map.addSource("dam-pts",{type:"geojson",data:{type:"FeatureCollection",features:damList.map(d=>({
    type:"Feature",geometry:{type:"Point",coordinates:[d.lon,d.lat]},
    properties:{id:d.id,name:d.name,state:d.state,h:d.h||0}}))}});
  map.addLayer({id:"dam-pts",type:"circle",source:"dam-pts",
    paint:{"circle-radius":["interpolate",["linear"],["get","h"],0,1.7,60,3,150,5,300,7.5],
      "circle-color":"#B45309","circle-opacity":0.72,"circle-stroke-color":"#FAF9F6","circle-stroke-width":0.8}});
  map.on("click","dam-pts",e=>{
    const f=e.features&&e.features[0];
    if(!f)return;
    const d=damById&&damById[f.properties.id];
    if(d)damSelect(d);
  });
  map.on("mouseenter","dam-pts",()=>{try{map.getCanvas().style.cursor="pointer";}catch(_){}});
  map.on("mouseleave","dam-pts",()=>{try{map.getCanvas().style.cursor=damMode?"crosshair":"";}catch(_){}});
}
damLayerVis(damMode);
}

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

function damAsk(dam,snap){
const w=damEnsureWorker(),id="q"+(++damSeq);
return new Promise((resolve,reject)=>{
  damWait[id]={resolve,reject};
  w.postMessage({cmd:"route",id,dam:{lon:dam.lon,lat:dam.lat,name:dam.name},opts:{snapKm:snap}});
});
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
  sea:{lon:last[0],lat:last[1]},name:dam.name+" → "+(r.coastal?"coast":"recorded river end"),
  river:dam.river,basin:dam.basin,chains:r.chains||[],coastal:!!r.coastal,snapKm:r.snapKm,to:r.to,src:r.src||""};
}

async function damSelect(dam){
if(damRun&&damRun.on)damReset();
damSel=dam;
const btn=dEl("damBtn");if(btn)btn.disabled=true;
damMsg(damCache[dam.id]?"Course ready…":"Deriving the river course for "+dam.name+"…");
try{
  let r=damCache[dam.id];
  if(!r){
    try{ r=await damAsk(dam,SNAP_NEAR_KM); }
    catch(e1){ r=await damAsk(dam,SNAP_FAR_KM); }   /* widen once — many dams sit off the mapped line */
    damCache[dam.id]=r;
  }
  const nr=routeFromRoute(r,dam);
  if(!nr)throw new Error("no geometry");
  route=nr;damLoaded=false;
  const t=dEl("damTitle");if(t)t.textContent="💧 "+nr.dam.name+" release";
  const sub=dEl("damSub");
  if(sub)sub.textContent=(nr.chains.length?nr.chains.join(" → "):(nr.river||"river"))+" → "
    +(nr.coastal?"coast":"recorded river end (inland)")+" · "+nr.totalKm.toFixed(0)+" km route (CWC centre-line)"
    +(nr.dam.state?" · "+nr.dam.state:"");
  const dayEl=dEl("damDay");if(dayEl)dayEl.textContent="Day 0.0";
  idleStat();
  damMsg(r.snapKm>SNAP_NEAR_KM?("course joins the mapped river "+r.snapKm.toFixed(1)+" km from the dam — illustrative snap)"):"");
  if(map&&map.isStyleLoaded()){
    if(!map.getSource("dam-route")){if(addDamLayers()){} }
    else{
      const s=map.getSource("dam-route");
      if(s)s.setData({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"LineString",coordinates:nr.coords},properties:{}}]});
      const e2=map.getSource("dam-ends");
      if(e2)e2.setData({type:"FeatureCollection",features:[
        {type:"Feature",geometry:{type:"Point",coordinates:[nr.dam.lon,nr.dam.lat]},properties:{kind:"dam"}},
        {type:"Feature",geometry:{type:"Point",coordinates:[nr.sea.lon,nr.sea.lat]},properties:{kind:"sea"}}]});
      damLoaded=true;damSet(0,false);damFrameAll();
    }
  }
}catch(e){
  route=null;
  const st=dEl("damStat");if(st)st.textContent="—";
  damMsg("No mapped river within "+SNAP_FAR_KM+" km of "+dam.name+" — course not derived (honest gap).");
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
if(!map||!route||!map.isStyleLoaded())return false;
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
}
damLoaded=true;
damSet(0,false);
return true;
}

/* paint the current front (km) into the layers + the card; final=true freezes the readout */
function damSet(km,final){
if(!route)return;
const dayEl=dEl("damDay"),stat=dEl("damStat");
if(dayEl)dayEl.textContent="Day "+(km/(route.speedMps*86.4)).toFixed(1);
if(stat)stat.textContent=final
?(route.coastal?"Reached the sea in ≈":"Reached the recorded river end in ≈")+route.arrivalDays.toFixed(1)+" days (illustrative)"
:Math.round(km)+" / "+route.totalKm.toFixed(0)+" km · wave ≈"+route.speedMps+" m/s (illustrative)";
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
damSet(0,false);
damKick(damTick);
return true;
}

function damReset(){
if(damRun){damRun.on=false;if(damRun.raf)cancelAnimationFrame(damRun.raf);if(damRun.iv)clearInterval(damRun.iv);}
damRun=null;
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
modeOn:()=>damMode,
search:q=>{damSearchRender(q);return (dEl("damResults")||{}).childElementCount||0;},
pick:id=>damSelect(damById[id]),
selected:()=>damSel?{id:damSel.id,name:damSel.name,state:damSel.state,river:damSel.river,h:damSel.h}:null,
damCount:()=>damList?damList.length:0,
cached:()=>Object.keys(damCache).length,
state:()=>({running:!!(damRun&&damRun.on),day:+((damRun?damRun.km:0)/(route?route.speedMps*86.4:129.6)).toFixed(3),
  km:+((damRun?damRun.km:0)).toFixed(2),totalKm:route?+route.totalKm.toFixed(2):null,
  arrivalDays:route?+route.arrivalDays.toFixed(2):null,reached:!!(damRun&&damRun.reached),
  pitch:map?+map.getPitch().toFixed(1):null,zoom:map?+map.getZoom().toFixed(2):null}),
route:()=>route?{id:route.id,n:route.coords.length,totalKm:+route.totalKm.toFixed(2),speedKmDay:+(route.speedMps*86.4).toFixed(1),
  arrivalDays:+route.arrivalDays.toFixed(2),dam:route.dam,sea:route.sea,river:route.river,
  coastal:route.coastal,chains:route.chains,snapKm:route.snapKm}:null
};

const damBtn=dEl("damBtn");
if(damBtn)damBtn.addEventListener("click",()=>{damRun&&damRun.on?damReset():damStart();});
const damModeBox=dEl("damMode");
if(damModeBox)damModeBox.addEventListener("change",()=>damSetMode(damModeBox.checked));
const damSearchBox=dEl("damSearch");
if(damSearchBox)damSearchBox.addEventListener("input",()=>damSearchRender(damSearchBox.value));

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
map.on("style.load",()=>{try{addSkyTerrainBuildings();}catch(e){console.warn("[map3d] style extras failed:",e.message||e);}});
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
