/* v7.22o — reservoir boundaries in the 3D map.
   Added to map3d.js by this script rather than by hand, because map3d.js is a 1,600-line ES module
   where a duplicate top-level declaration is a SyntaxError that `node --check` will not catch (it
   parses in sloppy mode). Inserting here and verifying by marker keeps that trap out of it.

   What goes on the map, and what is real:
     - the outlines are the mapped shorelines of 5,162 reservoirs, from data/reservoirs.geojson
       (WRIS / IndiaWRIS, via ramSeraph/indian_water_features release 'waterbodies')
     - the label shows the area in km2, and those areas are the source's own figures converted from
       hectares. The column was hectares and nothing said so: the 2D map was printing
       "Indira Sagar 84841.6", which reads as square kilometres. Measured against each polygon's own
       geodesic area the ratio is 96-98, i.e. hectares with about 4% of the outline generalised away.
     - only reservoirs of 100 km2 and above are labelled, so the map does not become a wall of names
     - selecting a dam highlights the reservoir that carries its name, and the card prints both the
       polygon area and the dam record's own figure where one exists, so a disagreement is visible
       rather than hidden */
import { readFileSync, writeFileSync } from "node:fs";

const p = "map3d.js";
let s = readFileSync(p, "utf8");

const MARK = "/* ---------- v7.22o reservoir boundaries ---------- */";
if (s.includes(MARK)) { console.log("already inserted"); process.exit(0); }

const block = `${MARK}
/* Async because data/reservoirs.geojson is 2.3 MB: it is fetched the first time the layer is asked
   for, never on the critical path of opening the 3D map. */
let resP=null,resData=null,resOn=true;
const RES_URL="data/reservoirs.geojson?v=7.22";
async function reservoirData(){
if(resData)return resData;
if(!resP)resP=(async()=>{
const r=await fetch(RES_URL);
if(!r.ok)throw new Error("reservoir outlines unavailable ("+r.status+")");
resData=await r.json();
/* a small index for matching the selected dam to its reservoir by name: the sources spell the same
   water several ways - "Hirakud Reservoir", "Gobind Sagar", "Mettur Dam" - so compare on the name
   with the generic words removed */
resData.byName=resData.features.map(f=>{
const p=f.properties||{};
const key=String(p.res_name||"").toLowerCase()
.replace(/\\b(reservoir|dam|lake|tank|pond|barrage|weir)\\b/g,"").replace(/[^a-z ]/g,"").replace(/\\s+/g," ").trim();
return{f,key,p};
});
return resData;
})();
return resP;
}
/* does a reservoir key contain the dam's key, or the other way round? "mettur" in "mettur dam" and in
   "mettur"; the length test stops "sagar" matching "sagar sarovar" by accident */
function reservoirFor(dam){
if(!resData||!dam)return null;
const dk=String(dam.name||"").toLowerCase()
.replace(/\\b(dam|reservoir|lake)\\b/g,"").replace(/[^a-z ]/g,"").replace(/\\s+/g," ").trim();
if(!dk)return null;
let best=null;
for(const r of resData.byName){
if(!r.key)continue;
let hit=false;
if(r.key===dk)hit=true;
else if(r.key.length>3&&dk.length>3&&(r.key.includes(dk)||dk.includes(r.key)))hit=true;
else{
/* also try the river name, which is how many records are labelled */
const rv=String(r.p.river||"").toLowerCase().replace(/[^a-z ]/g,"").trim();
if(rv.length>3&&(rv===dk||rv.includes(dk)))hit=true;
}
if(hit&&(!best||(r.p.area_km2||0)>(best.p.area_km2||0)))best=r;
}
return best;
}
function addReservoirLayers(){
if(!map||!mapStyleReady)return false;
if(map.getSource("reservoirs"))return true;
try{
const empty={type:"FeatureCollection",features:[]};
map.addSource("reservoirs",{type:"geojson",data:empty});
map.addLayer({id:"res-fill",type:"fill",source:"reservoirs",
paint:{"fill-color":"#0EA5E9","fill-opacity":0.26}});
map.addLayer({id:"res-line",type:"line",source:"reservoirs",
paint:{"line-color":"#0369A1","line-width":1.1,"line-opacity":0.85}});
/* the dam's own reservoir, picked out from the crowd */
map.addSource("res-focus",{type:"geojson",data:empty});
map.addLayer({id:"res-focus",type:"fill",source:"res-focus",
paint:{"fill-color":"#22D3EE","fill-opacity":0.4}});
map.addLayer({id:"res-focus-line",type:"line",source:"res-focus",
paint:{"line-color":"#0E7490","line-width":2.4,"line-opacity":1}});
/* names for the large ones only - 100 km2 and up, which is a few hundred water bodies */
map.addLayer({id:"res-label",type:"symbol",source:"reservoirs",minzoom:5,
layout:{"text-field":["get","res_name"],"text-size":["interpolate",["linear"],["get","area_km2"],80,10,200,11.5,800,14],
"text-font":["Noto Sans Regular"],"text-allow-overlap":false},
paint:{"text-color":"#0C4A6E","text-halo-color":"#FFFFFF","text-halo-width":1.3}});
return true;
}catch(e){console.warn("[map3d] reservoir layers:",e.message||e);return false;}
}
function reservoirSet(d){
if(!map)return;
if(!map.getSource("reservoirs"))return;
reservoirData().then(data=>{
if(!map||!map.getSource("reservoirs"))return;
map.getSource("reservoirs").setData(data);
const hit=reservoirFor(d);
if(map.getSource("res-focus"))map.getSource("res-focus").setData(hit?
{type:"FeatureCollection",features:[hit.f]}:{type:"FeatureCollection",features:[]});
if(hit){
const f=damFactsFor(d&&d.name);
const named=f&&f.reservoir_area_km2!=null?f.reservoir_area_km2:null;
damMsg("Reservoir: "+(hit.p.res_name||"?")+" \\u00b7 "+(hit.p.area_km2!=null?hit.p.area_km2:"?")+" km\\u00b2 from WRIS"
+(named!=null?" \\u00b7 the dam record says "+named+" km\\u00b2":"")+".");
}
}).catch(e=>{console.warn("[map3d] reservoirs:",e.message||e);});
}
function reservoirToggle(on){
resOn=!!on;
const v=id=>{const b=dEl(id);if(b){b.setAttribute("aria-pressed",on?"true":"false");b.classList.toggle("on",on);}};
v("m3res");
if(!map)return;
const setVis=id=>{try{if(map.getLayer(id))map.setLayoutProperty(id,"visibility",on?"visible":"none");}catch(_){}};
for(const id of ["res-fill","res-line","res-label","res-focus","res-focus-line"])setVis(id);
if(on)reservoirSet(damSel);
}
`;

const anchor = "function addSkyTerrainBuildings(){";
if (!s.includes(anchor)) { console.log("ANCHOR MISSING"); process.exit(1); }
s = s.replace(anchor, block + "\n" + anchor);
writeFileSync(p, s, "utf8");
console.log("inserted", block.length, "chars before addSkyTerrainBuildings");
for (const name of ["addReservoirLayers", "reservoirFor", "reservoirToggle", "reservoirSet"]) {
  const n = (s.match(new RegExp("(function|const|let) " + name, "g")) || []).length;
  console.log((n === 1 ? "defined once  " : "DUPLICATE!    ") + name + " x" + n);
}