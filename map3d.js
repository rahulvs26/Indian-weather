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
   on any network/WebGL failure (app.js then restores the button state). */
const ML_CSS="https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.css";
const ML_JS="https://unpkg.com/maplibre-gl@6.14.0/dist/maplibre-gl.mjs";
const STYLE_URL="https://tiles.openfreemap.org/styles/bright"; /* pastel-leaning OpenMapTiles look; swap in "liberty" for the richer OMT palette */
const DEM_URL="https://tiles.mapterhorn.com/tilejson.json";    /* terrarium encoding, declared in Mapterhorn's tilejson */
const VIEW={center:[78.9,22.6],zoom:4.3,pitch:52,bearing:-8};  /* opens tilted so it reads as 3D immediately */

let libP=null,map=null,rsWired=false;

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

async function ensure(){
if(map)return map;
const ml=await loadLib();
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
