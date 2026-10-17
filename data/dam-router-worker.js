/* v7.9 dam router worker — owns the heavy shapefiles so the page never freezes.
   Nothing is downloaded until the dam feature is actually used:
     on first route request → fetch rivers-cwc.geo.json + india-detailed.geo.json,
     build the bbox index once, then answer every dam in milliseconds.
   The walk/simplify maths is the shared engine (data/_route-engine.mjs), the same code the
   offline generator uses. Protocol: postMessage({cmd, dam}) → {ok, route} / {ok:false, error}. */
import {buildIndex,solveRoute,coastSegments} from "./_route-engine.mjs";

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

self.onmessage=async(e)=>{
  const m=e.data||{};
  if(m.cmd==="preload"){ try{ await loadAll(); post({type:"ready"}); }catch(err){ post({type:"error",error:String(err.message||err)}); } return; }
  if(m.cmd!=="route")return;
  try{
    await loadAll();
    const r=solveRoute(idx,features,coast,m.dam||{},Object.assign({},m.opts||{},{cities}));
    post({ok:true,id:m.id,route:r});
  }catch(err){
    post({ok:false,id:m.id,error:String(err.message||err)});
  }
};