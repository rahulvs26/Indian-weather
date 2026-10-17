/* v7.23f — add a frame-time benchmark to the 3D mountains.

   WHY THIS EXISTS, because it is the third measurement attempt on this problem.

   Attempt 1 (v7.23b) measured fps with requestAnimationFrame and got a confident 61 fps. That was
   the wrong loop entirely - it was the app's global rAF, and the terrain renderer was gated off.
   A dead loop measures as a perfect 60.

   Attempt 2 assumed the harness tab could be made visible. It cannot: document.hidden is true and
   stays true even after tabs.focus(), and rAF fires exactly once then stops. So no rAF-based fps
   number is obtainable here at all.

   Attempt 3, this. A WebGL render does not need rAF to happen - renderer.render() draws to the
   framebuffer whether or not the page is compositing. So the render cost is measured directly:
   draw N frames back to back and time them. ms/frame is what determines fps, and unlike the rAF
   figure it cannot be confused with some other loop's frame rate.

   THE HONEST CAVEAT, which the hook returns rather than hides: this environment almost certainly
   renders through software GL (SwiftShader), not a GPU. Software rasterisation of 1.68 M triangles
   will be far slower than any real machine, so the absolute numbers here are a floor, not a
   prediction. What IS valid is the comparison between configurations - which layer costs what, and
   how cost scales with pixel count - because those ratios are hardware-independent-ish and are
   exactly what is needed to decide what to optimise.

   bench(n, opts) accepts:
     w, h   - resize the drawing buffer before measuring (default: current size)
     hide   - array of scene subtree names to hide, to attribute cost per layer:
              ["dams","reservoirs","rivers","markers","weather","terrain"]
     warm   - frames to draw before timing (default 3, so shader compilation is excluded) */
import { readFileSync, writeFileSync } from "node:fs";

const ANCHOR = "/* v7.3: dam hover labels — the top-300 recorded-height tier (same set as the 2D dam labels).";

const BENCH = `/* v7.23f: frame-time benchmark for the 3D mountains. See data/_terrain_bench.mjs for why
   this exists and, more importantly, for the caveat attached to the numbers it returns: this
   environment renders through software GL, so absolute ms/frame is a pessimistic floor, not a
   prediction for a real machine. The per-layer comparison is the usable part. */
window.__t3.bench=function(n,opts){
opts=opts||{};const nFrames=Math.max(1,Math.min(400,n||30)),warm=opts.warm==null?3:opts.warm;
const w=opts.w||0,h=opts.h||0;
if(w&&h){renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
/* name the subtrees so a layer can be switched off and its cost attributed */
const bank={terrain:[],dams:[],reservoirs:[],rivers:[],markers:[],weather:[]};
relG.traverse(o=>{
  if(o===tMesh){bank.terrain.push(o);return;}
  if(o.isMesh||o.isLine||o.isPoints){
    const g=o.geometry,m=o.material;
    const tris=g&&g.attributes&&g.attributes.position?g.attributes.position.count:0;
    if(o.userData&&o.userData.bench)return;
    o.userData=o.userData||{};o.userData.bench=true;o.userData.benchTris=tris;
    if(m&&m.transparent)bank.weather.push(o);
    else if(tris>200000)bank.terrain.push(o);
    else if(tris>2000)bank.reservoirs.push(o);
    else bank.dams.push(o);
  }});
const hidden=(opts.hide||[]).map(k=>bank[k]||[]).flat();
hidden.forEach(o=>{o.userData.__wasVis=o.visible;o.visible=false;});
const draw=()=>renderer.render(scene,cam);
for(let i=0;i<warm;i++)draw();
const t0=performance.now();
for(let i=0;i<nFrames;i++)draw();
const total=performance.now()-t0;
hidden.forEach(o=>{o.visible=o.userData.__wasVis;});
const per=total/nFrames;
const tri=renderer.info.render.triangles,call=renderer.info.render.calls;
return {frames:nFrames,totalMs:+total.toFixed(1),meanMs:+per.toFixed(2),
  impliedFps:Math.round(1000/per),
  triangles:tri,drawCalls:call,
  buffer:cv3.width+"x"+cv3.height,
  sizeAt:renderer.getSize(new THREE.Vector2()).x+"x"+renderer.getSize(new THREE.Vector2()).y,
  banks:Object.keys(bank).map(k=>k+":"+bank[k].length),
  glInfo:{renderer:(function(){try{const g=renderer.getContext();const d=g.getExtension("WEBGL_debug_renderer_info");return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):"unknown";}catch(e){return "unknown";}})()},
  caveat:"software GL in this harness: absolute ms/frame is a pessimistic floor, not a real-GPU prediction"};
};
`;

let s = readFileSync("app.js", "utf8");
if (s.includes("window.__t3.bench=")) { console.log("bench already present"); process.exit(0); }
if (!s.includes(ANCHOR)) { console.log("anchor not found"); process.exit(1); }
s = s.replace(ANCHOR, BENCH + ANCHOR);
writeFileSync("app.js", s, "utf8");
console.log("bench() added to window.__t3");
console.log("  present:", s.includes("window.__t3.bench=function"));