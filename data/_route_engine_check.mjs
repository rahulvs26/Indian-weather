/* v7.10 regression + coverage check for the dam→sea solver.
   Run: node data/_route_engine_check.mjs   (read-only; prints stats)
   Checks, over the tallest dams: routing success at 6/12 km, UP-FLOW regressions
   (course ending farther from the sea than it started), coastal vs inland, city crossings. */
import {readFileSync} from "node:fs";
import {buildIndex,solveRoute,coastSegments,makeCoastTest,reachesSea,seaSide} from "./_route-engine.mjs";

const t0=Date.now();
const rivers=JSON.parse(readFileSync("data/rivers-cwc.geo.json","utf8")).features;
const idx=buildIndex(rivers);
const coast=coastSegments(JSON.parse(readFileSync("data/india-detailed.geo.json","utf8")));
const coastTest=makeCoastTest(coast);
let cities=[];
try{cities=JSON.parse(readFileSync("data/river-cities.json","utf8")).cities.map(c=>({name:c.name,lon:c.lon,lat:c.lat}));}catch(e){}
const dams=JSON.parse(readFileSync("data/dams.geo.json","utf8")).features;
const H=d=>d.properties&&(d.properties.height_m!=null?d.properties.height_m:d.properties.height);
const withH=dams.filter(d=>typeof H(d)==="number"&&H(d)>0);
console.log("river features",rivers.length,"| dams",dams.length,"| with height",withH.length,"| cities",cities.length,"| load+index",((Date.now()-t0)/1000).toFixed(1),"s");
console.log("seaSide sanity — Jaipur",seaSide([75.79,26.91]),"| Rajasthan border",seaSide([74.55,30.99]),
  "| Delhi",seaSide([77.21,28.61]),"| Mahanadi delta",seaSide([86.71,20.3]),"| Kaveri delta",seaSide([79.86,11.14]));

const top=withH.slice().sort((a,b)=>H(b)-H(a)).slice(0,400);
for(const snap of [6,12]){
  let ok=0,fail=0,coastal=0,upflow=0,withCity=0,t=Date.now();
  const bad=[],up=[];
  for(const d of top){
    const c=d.geometry.coordinates;
    try{
      const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:d.properties.name,state:d.properties.state,height:H(d)},{snapKm:snap,cities,measure:false});
      ok++;
      if(r.coastal)coastal++;
      if((r.cities||[]).length)withCity++;
      const ds=coastTest(c),de=coastTest(r.coords[r.coords.length-1]);
      if(de>ds+25&&!r.coastal){upflow++;if(up.length<6)up.push(d.properties.name+" "+de.toFixed(0)+"km (start "+ds.toFixed(0)+")");}
    }catch(e){fail++;if(bad.length<5)bad.push(d.properties.name+" ("+(e.message||"")+")");}
  }
  console.log(`\nsnap ${snap} km → routed ${ok}/400 · failed ${fail} · coastal ${coastal} · inland ${ok-coastal} · with city crossings ${withCity} · UP-FLOW regressions ${upflow}  (${((Date.now()-t)/400).toFixed(1)} ms each)`);
  if(bad.length)console.log("   failed:",bad.join(" | "));
  if(up.length)console.log("   up-flow:",up.join(" | "));
}
console.log("\nspot checks:");
for(const nm of ["METTUR","Hirakud","Tehri","BHAKRA","Sardar Sarovar","Srisailam","Idukki","RANGALI","Bhakra Dam"]){
  const d=dams.find(x=>x.properties&&new RegExp(nm,"i").test(x.properties.name||""));
  if(!d)continue;
  const c=d.geometry.coordinates;
  try{
    const r=solveRoute(idx,rivers,coast,{lon:c[0],lat:c[1],name:d.properties.name},{cities});
    console.log(" ",d.properties.name.padEnd(24),String(r.totalKm).padStart(8),"km",String(r.arrivalDays).padStart(6),"d",
      r.coastal?"COASTAL":"inland ","|",String(r.chains.join(" → ")).slice(0,34).padEnd(34),
      "| cities:",(r.cities||[]).map(x=>x.name+" "+x.km+"km").join(", ")||"—",
      "| gaps",r.gapCount,"off",r.offKm+"km");
  }catch(e){console.log(" ",d.properties.name,"FAILED",e.message);}
}
console.log("total s",((Date.now()-t0)/1000).toFixed(1));