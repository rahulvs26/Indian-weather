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
const ROUTE_URL="data/dam-route-hirakud.geo.json?v=7.6";
const DAM_SECONDS=24;                                          /* v7.6: whole journey plays in this many real seconds */
const DAM_RM=matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

let libP=null,map=null,mlRef=null,rsWired=false;
let route=null,damLoaded=false,damRun=null;

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

/* ---------- v7.6 dam release: route load + layers + kinematic wave ---------- */

async function loadRoute(){
if(route)return route;
const j=await (await fetch(ROUTE_URL)).json();
const f=(j.features||[])[0];
if(!f||!f.geometry)throw new Error("route file has no line feature");
const coords=f.geometry.coordinates;
const cum=[0];let km=0;
for(let i=1;i<coords.length;i++){km+=hav(coords[i-1],coords[i]);cum.push(km);}
const p=f.properties||{};
route={coords,cum,totalKm:km,
speedMps:p.speed_m_s||1.5,
arrivalDays:km/((p.speed_m_s||1.5)*86.4),   /* days = km ÷ (m/s × 86.4 km/day) */
dam:p.dam,sea:p.sea_mouth,name:p.name};
const sub=dEl("damSub");
if(sub)sub.textContent=(p.river||"route")+" → Bay of Bengal · "+km.toFixed(0)+" km route (CWC centre-line)";
const dayEl=dEl("damDay");if(dayEl)dayEl.textContent="Day 0.0";
idleStat();
return route;
}

function idleStat(){
const st=dEl("damStat");
if(st&&route)st.textContent="wave ≈"+route.speedMps+" m/s (illustrative) → arrival ≈"+route.arrivalDays.toFixed(1)+" days";
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
?"Reached the sea in ≈"+route.arrivalDays.toFixed(1)+" days (illustrative)"
:Math.round(km)+" / "+route.totalKm.toFixed(0)+" km · wave ≈"+route.speedMps+" m/s (illustrative)";
if(!map||!damLoaded)return;
const s=sliceAt(km),wet=map.getSource("dam-wet"),head=map.getSource("dam-head");
if(wet)wet.setData(s.wet);
if(head)head.setData(s.head);
}

function damTick(ts){
if(!damRun||!damRun.on)return;
const f=Math.min(1,(ts-damRun.t0)/(DAM_SECONDS*1000)),km=f*route.totalKm;
damRun.km=km;
damSet(km,false);
if(f<1)damRun.raf=requestAnimationFrame(damTick);
else{
damRun.on=false;damRun.reached=true;
damSet(route.totalKm,true);
const btn=dEl("damBtn");if(btn)btn.textContent="⟲ Release again";
}
}

async function damStart(){
const btn=dEl("damBtn");
if(damRun&&damRun.on)damReset();
if(!route){if(btn){btn.disabled=true;btn.textContent="Loading route…";}}
try{
await ensure();
await loadRoute();
if(!addDamLayers())throw new Error("map style not ready for route layers");
}catch(e){
if(btn){btn.disabled=false;btn.textContent="Release water";}
const st=dEl("damStat");if(st)st.textContent="Route/map not loaded — needs the 3D map (MapLibre + tiles) and "+ROUTE_URL+".";
console.warn("[dam]",e.message||e);
return false;
}
if(btn)btn.disabled=false;
try{   /* frame the whole route, leaving room on the left for the readout card */
const c=route.coords;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
for(const p of c){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
map.fitBounds([[x0,y0],[x1,y1]],{padding:{top:60,bottom:70,left:290,right:70},maxZoom:8.6,duration:DAM_RM?0:1500});
}catch(_){}
damRun={on:true,reached:false,km:0,t0:performance.now(),raf:0};
if(btn)btn.textContent="⟲ Reset";
damSet(0,false);
damRun.raf=requestAnimationFrame(damTick);
return true;
}

function damReset(){
if(damRun){damRun.on=false;if(damRun.raf)cancelAnimationFrame(damRun.raf);}
damRun=null;
damSet(0,false);
const dayEl=dEl("damDay");if(dayEl)dayEl.textContent="Day 0.0";
idleStat();
const btn=dEl("damBtn");if(btn){btn.disabled=false;btn.textContent="Release water";}
}

window.__dam={
start:()=>damStart(),
reset:()=>{damReset();return true;},
state:()=>({running:!!(damRun&&damRun.on),day:+((damRun?damRun.km:0)/(route?route.speedMps*86.4:129.6)).toFixed(3),
km:+((damRun?damRun.km:0)).toFixed(2),totalKm:route?+route.totalKm.toFixed(2):null,
arrivalDays:route?+route.arrivalDays.toFixed(2):null,reached:!!(damRun&&damRun.reached)}),
route:()=>route?{n:route.coords.length,totalKm:+route.totalKm.toFixed(2),speedKmDay:+(route.speedMps*86.4).toFixed(1),
arrivalDays:+route.arrivalDays.toFixed(2),dam:route.dam,sea:route.sea}:null
};

const damBtn=dEl("damBtn");
if(damBtn)damBtn.addEventListener("click",()=>{damRun&&damRun.on?damReset():damStart();});

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
try{await loadRoute();addDamLayers();}catch(e){console.warn("[dam] route skipped:",e.message||e);}   /* the map must work even if the route file fails */
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
