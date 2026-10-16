/* Indian Weather v3 — full year + arrows + MJO + accurate zones. Strict to INDIAN_WEATHER_SPEC.md v3.0 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
window.INDWeather=window.INDWeather||{month:7,mjo:2};
INDWeather.live={imdWMS(){throw new Error("stub — add OSM/IMD WMS URL later")},openMeteo(){throw new Error("stub")}};

/* ---------- springs ---------- */
const springs=[];
function spring(set,target,k){const s={set,cur:target,target,k:k||0.14};springs.push(s);return s;}
(function loop(){for(const s of springs){s.cur+=(s.target-s.cur)*s.k;s.set(s.cur);}requestAnimationFrame(loop);})();
const lerp=(a,b,t)=>a+(b-a)*t;
async function getJSON(path,key){try{if(window.IND_DATA&&window.IND_DATA[key]!==undefined)return window.IND_DATA[key];}catch(_){}return(await fetch(path)).json();}
const CLIM={dmi:0.8,m:7,mjo:2,mjoBoost:1};
window.__oroHeads=[];
const HEAT_K={1:.05,2:.08,3:.35,4:.7,5:1,6:.8,7:.3,8:.25,9:.2,10:.1,11:.05,12:.05};
const COLD_K={1:1,2:.8,3:.15,4:0,5:0,6:0,7:0,8:0,9:0,10:.1,11:.5,12:.9};
const IOD_SEASON={1:.15,2:.15,3:.25,4:.4,5:.6,6:.8,7:.9,8:1,9:1,10:.9,11:.5,12:.25};

/* ================= MONTH MODEL (1–12, shared) ================= */
let MONTHS=[];
const monthSlider=$("monthSlider"),monthReadout=$("monthReadout"),wheelLabel=$("wheelLabel"),
wheelRotor=$("wheelRotor"),wheelReadout=$("wheelReadout"),monthWheelMini=$("monthWheelMini");
function monthByNum(m){return MONTHS.find(x=>x.m===m)||MONTHS[0];}
function setMonth(m){
m=Math.max(1,Math.min(12,m));INDWeather.month=m;
const d=monthByNum(m);if(!d)return;
monthSlider.value=m;monthWheelMini.textContent=d.label;wheelLabel.textContent=d.label;
wheelRotor.setAttribute("transform",`rotate(${(-80+(m-1)*(160/11)).toFixed(1)})`);
monthReadout.textContent=`${d.label} · ${d.season} · wind: ${d.wind} · rain: ${d.rain} · AS ${d.arabian}% / BoB ${d.bay}% · ${d.s}`;
wheelReadout.textContent=`${d.label} · ${d.note}`;
CLIM.m=m;
if(window.__windVec)window.__windVec(d);
if(window.__branchSize)window.__branchSize(d);
if(window.__zoneMonth)window.__zoneMonth(m);
if(window.__iodSeason)window.__iodSeason(m);
if(window.__currentMonth)window.__currentMonth(d);
if(window.__mjoMonthSync)window.__mjoMonthSync(d);
if(window.__graphCursor)window.__graphCursor(m);
if(window.__rainStates)window.__rainStates(d);
if(window.__riverMonth)window.__riverMonth(d);
if(window.__terrainMonth)window.__terrainMonth(d);
if(window.__phenMonthSync)window.__phenMonthSync(m);
}
(function(){let h="";for(let i=0;i<12;i++){const a=-80+i*(160/11);h+=`<line x1="0" y1="-64" x2="0" y2="-52" transform="rotate(${a})" stroke="#1A1A1A" stroke-width="1.4"/>`;}$("wheelTicks").innerHTML=h;})();
$("wheelPrev").addEventListener("click",()=>setMonth(INDWeather.month-1));
$("wheelNext").addEventListener("click",()=>setMonth(INDWeather.month+1));
monthSlider.addEventListener("input",e=>setMonth(+e.target.value));

/* ================= OSM MAP + WIND PARTICLES + ARROWS ================= */
const chips=[...document.querySelectorAll(".chip")];
const layers={winds:true,heatcold:true,radar:true,iod:true,mjo:true,rivers:true,basins:true,dams:true,water:false};
const FLY={heatcold:[[22.5,79.5],5],radar:[[22.5,79.5],5],iod:[[[-12,45],[12,112]],null],mjo:[[[-15,10],[15,140]],null],rivers:[[22.5,79.5],5],basins:[[22.5,79.5],5],dams:[[22.5,79.5],5],water:[[22.5,79.5],5]};
chips.forEach(c=>c.addEventListener("click",()=>{const k=c.dataset.layer;layers[k]=!layers[k];c.setAttribute("aria-pressed",layers[k]);if(window.__applyLayers)window.__applyLayers();if(k==="water"&&layers[k]&&window.__loadWater)window.__loadWater();if(layers[k]&&map&&FLY[k]){const f=FLY[k];if(f[1])map.flyTo(f[0],f[1],{duration:1});else map.flyToBounds(f[0],{duration:1});}}));
let map=null,windParts=[],wctx=null,curVec={vx:1,vy:-0.6};
const ARAB_COL="#0F766E",BOB_COL="#6B7280",BOB_WIND="#B45309",HEAT_COL="#B91C1C",COLD_COL="#1D4ED8";
function vecFor(d){
let base;
if(d.m<=2)base={vx:-0.9,vy:0.7};
else if(d.m<=4)base={vx:0.25,vy:0.15};
else if(d.m===5)base={vx:0.7,vy:-0.5};
else if(d.m<=8)base={vx:1.3,vy:-0.75};
else if(d.m===9)base={vx:0.6,vy:-0.35};
else if(d.m===10)base={vx:-0.25,vy:0.2};
else base={vx:-0.9,vy:0.65};
const k=(d.arabian+d.bay)/170;
return{vx:base.vx*k,vy:base.vy*k};
}
window.__windVec=d=>{curVec=vecFor(d);};
function sizeCanvas(){const st=document.querySelector("#map .stage");const c=$("windCanvas");c.width=st.clientWidth;c.height=420;wctx=c.getContext("2d");}
addEventListener("resize",()=>{if(wctx)sizeCanvas();});
function seedParts(n){const c=$("windCanvas");windParts=[];for(let i=0;i<n;i++)windParts.push({x:Math.random()*c.width,y:Math.random()*c.height,west:Math.random()<0.5,sp:0.6+Math.random()*0.8});}
function drawArrow(x,y,vx,vy,col){
const len=Math.min(20,Math.max(5,Math.hypot(vx,vy)*9));
const a=Math.atan2(vy,vx);
wctx.strokeStyle=col;wctx.fillStyle=col;wctx.globalAlpha=0.85;wctx.lineWidth=1.6;
wctx.beginPath();wctx.moveTo(x,y);wctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);wctx.stroke();
const hx=x+Math.cos(a)*len,hy=y+Math.sin(a)*len;
wctx.beginPath();wctx.moveTo(hx,hy);
wctx.lineTo(hx-Math.cos(a-0.42)*6,hy-Math.sin(a-0.42)*6);
wctx.lineTo(hx-Math.cos(a+0.42)*6,hy-Math.sin(a+0.42)*6);
wctx.closePath();wctx.fill();wctx.globalAlpha=1;
}
function stepWind(){
stepWind._t=true;
if(!wctx){requestAnimationFrame(stepWind);return;}
const c=$("windCanvas");
if(!layers.winds){wctx.clearRect(0,0,c.width,c.height);requestAnimationFrame(stepWind);return;}
wctx.clearRect(0,0,c.width,c.height);
for(const p of windParts){
const wob=Math.sin((p.x+p.y)*0.02+Date.now()*0.0004)*0.3;
p.x+=(curVec.vx*p.sp+wob*0.3);p.y+=(curVec.vy*p.sp+wob*0.2);
if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;
wctx.fillStyle=p.west?ARAB_COL:BOB_WIND;wctx.globalAlpha=0.5;
wctx.fillRect(p.x,p.y,2.2,1.4);
}
wctx.globalAlpha=1;
/* arrow grid mirrors the same vector (text equivalent lives in month readout) */
const gx=90,gy=105;
const MJO_ENH="#6D28D9";
for(let ix=0;ix<Math.floor(c.width/gx);ix++)for(let iy=0;iy<4;iy++){
const x=ix*gx+45+(iy%2)*30,y=iy*gy+55;
const wob=Math.sin(Date.now()*0.001+x*0.01)*0.15;
let ax=curVec.vx+wob*0.3,ay=curVec.vy+wob*0.2;
let col=x<c.width*0.45?ARAB_COL:(x>c.width*0.55?BOB_WIND:"#9CA3AF");
if(map){try{const ll=map.containerPointToLatLng([x,y]);
if(ll.lat>-12&&ll.lat<12&&ll.lng>40&&ll.lng<115)ax+=-CLIM.dmi*0.9;
/* MJO influence zone follows the pulse: violet = enhanced Ph1-3, muted grey = suppressed Ph4-5 */
if(window.__mjoAnim&&ll.lat>-14&&ll.lat<14&&Math.abs(ll.lng-window.__mjoAnim.lon)<=30){const p=INDWeather.mjo;if(p<=3)col=MJO_ENH;else if(p<=5)col=BOB_COL;}
}catch(_){}}
drawArrow(x,y,ax,ay,col);
}
/* MJO glide: blob + ghost travel toward phase targets; westerly bursts feed the blob */
if(window.__mjoAnim&&window.__mjoBlob&&map){
const A=window.__mjoAnim;
const k=RM?1:0.06; /* reduced motion: snap to the new phase, no glide */
A.lon+=((A.tlon??A.lon)-A.lon)*k;
A.sup+=((A.tsup??A.sup)-A.sup)*k;
try{
window.__mjoBlob.setLatLng([-5,A.lon]);
if(window.__mjoSup)window.__mjoSup.setLatLng([-5,A.sup]);
if(window.__mjoLbl)window.__mjoLbl.setLatLng([6,A.lon]);
if(window.__mjoG&&map.hasLayer(window.__mjoG)){
const zc=INDWeather.mjo<=3?MJO_ENH:(INDWeather.mjo<=5?BOB_COL:"#0F766E");
const bp=map.latLngToContainerPoint([-5,A.lon]);
const burst=(dx,dy,vx,vy,col)=>{const sx=bp.x+dx,sy=bp.y+dy;if(sx>-40&&sx<c.width+40&&sy>-40&&sy<c.height+40)drawArrow(sx,sy,vx,vy,col);};
burst(-70,0,2.2,-0.4,zc);
burst(-38,14,2.0,-0.3,zc);
burst(44,10,-1.6,-0.3,zc);
}
}catch(_){}
}
if(window.__mjoBlob&&map&&window.__mjoG&&map.hasLayer(window.__mjoG)){try{window.__mjoBlob.setRadius(RM?12:Math.max(6,(INDWeather.mjo<=3?16:(INDWeather.mjo<=5?12:9))+Math.sin(Date.now()*0.005)*2.5));}catch(_){}}
if(!RM&&!document.hidden)requestAnimationFrame(stepWind);else setTimeout(()=>requestAnimationFrame(stepWind),500);
}
/* watchdog: if any frame ever kills the wind loop, restart it within 4s */
setInterval(()=>{try{if(wctx&&!stepWind._t)requestAnimationFrame(stepWind);stepWind._t=false;}catch(_){}},4000);
async function initMap(){
sizeCanvas();seedParts(RM?60:340);requestAnimationFrame(stepWind);
try{
const months=await getJSON("data/months.json","months");
let radars={stations:[],meta:{bands:{C:250,S:250,X:100}}};
try{radars=await getJSON("data/radars.json","radars");}catch(e){console.warn("radars.json failed, map continues without pins",e);}
MONTHS=months.months;
const tbl=$("monthTable");
MONTHS.forEach(d=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${d.label}</td><td>${d.season}</td><td>${d.wind}</td><td>${d.arabian}%</td><td>${d.bay}%</td><td>${d.rain}</td><td>${d.dmiTyp}</td>`;tbl.appendChild(tr);});
setMonth(7);
buildGraph();
if(typeof L==="undefined")throw new Error("Leaflet CDN blocked");
map=L.map("osmMap",{scrollWheelZoom:true}).setView([22.5,79.5],5);
/* v7.5: pastel relief base (World Terrain Base — shaded relief + bathymetry, service levels 0-13) replaces the grey Canvas plate; CSS re-tints it pastel */
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",{maxNativeZoom:13,attribution:'Tiles © <a href="https://www.esri.com/">Esri</a> — Esri, USGS, NOAA'}).addTo(map);
try{
const reg=await getJSON("data/region.geo.json","region");
L.geoJSON(reg,{style:{color:"#9CA3AF",weight:1,fillColor:"#E8E5DE",fillOpacity:0.5}}).addTo(map);
const ind=await getJSON("data/india-detailed.geo.json","indiaDetailed");
L.geoJSON(ind,{style:{color:"#1A1A1A",weight:1.6,fillColor:"#0F766E",fillOpacity:0.10}}).addTo(map);
}catch(e){console.warn("geojson overlay failed",e);}
/* state boundaries (GADM) + per-month rain highlight; tap a state for its name */
let stateLayers={};
try{
const st=await getJSON("data/india-states.geo.json","indiaStates");
L.geoJSON(st,{style:{color:"#1A1A1A",weight:0.7,fillColor:"#FAF9F6",fillOpacity:0.12}}).eachLayer(l=>{const n=l.feature&&l.feature.properties&&l.feature.properties.NAME_1;if(n){stateLayers[n]=l;l.bindPopup(()=>{const mm=INDWeather.month||7,sc=window.__rainAvg&&window.__rainAvg.states&&window.__rainAvg.states[n],rv=sc&&sc.m?sc.m[mm-1]:null,lab=(MONTHS.find(x=>x.m===mm)||{}).label||("m"+mm);return `<b>${n.replace(/([a-z])([A-Z])/g,"$1 $2")}</b><br>State boundary (GADM). Teal = receiving rain this month.`+(rv!=null?`<br>Avg ${lab} rain ≈ <b>${Math.round(rv)} mm</b> (IMD 1901–2015 subdivision mean, mapped to state — approximate).`:`<br>Avg monthly rain: loading…`);});}}).addTo(map);
}catch(e){console.warn("states overlay failed",e);}
window.__rainStates=d=>{
const want=new Set(d.rainStates||[]);
for(const n in stateLayers){const on=want.has(n);try{stateLayers[n].setStyle({fillColor:on?"#0F766E":"#FAF9F6",fillOpacity:on?0.45:0.12,weight:on?1.4:0.7});}catch(_){}}
/* v7.2 rain pools: sample points inside the month's rain-receiving states (IMD
   month-typical list), each state weighted by its monthly average rainfall
   (data/rain-state-avg.json — IMD subdivision 1901-2015 means mapped to states,
   approximate). Equal weights until the averages load. Cached per month.
   v7.5: the 2D falling-streak renderer was removed (read as fake-3D rain on the flat
   map); the pools now feed the 3D relief rain only, via window.__rainSample. */
try{
const avg=window.__rainAvg&&window.__rainAvg.states,li=(d.m||1)-1;
const wOf=n=>{const s=avg&&avg[n];return s&&s.m?Math.max(0,s.m[li]||0):0;};
const cache=window.__rainPoolCache||(window.__rainPoolCache={});
let P=cache[d.m];
if(!P){
P={byState:{},max:1};const haveAvg=!!avg;
for(const n of (d.rainStates||[])){
const ly=stateLayers[n];if(!ly)continue;
const w=haveAvg?wOf(n):1;if(haveAvg&&w<=0)continue;
const rings=[];(function w2(a){if(!a||!a.length)return;if(typeof a[0].lat==="number"){rings.push(a);return;}for(const x of a)w2(x);})(ly.getLatLngs());
if(!rings.length)continue;
const boxes=rings.map(a=>{let a1=91,a2=-91,b1=999,b2=-999;for(const p of a){if(p.lat<a1)a1=p.lat;if(p.lat>a2)a2=p.lat;if(p.lng<b1)b1=p.lng;if(p.lng>b2)b2=p.lng;}return[a1,a2,b1,b2,Math.max(0.0001,(a2-a1)*(b2-b1))];});
const totA=boxes.reduce((s,b)=>s+b[4],0),pts=[];let got=0,tries=0;
while(got<14&&tries<300){tries++;let rr=Math.random()*totA,bi=0;while(bi<boxes.length-1&&rr>boxes[bi][4]){rr-=boxes[bi][4];bi++;}
const b=boxes[bi],la=b[0]+Math.random()*(b[1]-b[0]),lo=b[2]+Math.random()*(b[3]-b[2]);
let c=false;const r=rings[bi];for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i].lng,yi=r[i].lat,xj=r[j].lng,yj=r[j].lat;if((yi>la)!==(yj>la)&&lo<(xj-xi)*(la-yi)/(yj-yi)+xi)c=!c;}
if(c){pts.push([la,lo]);got++;}}
if(pts.length){P.byState[n]={pts,w};if(w>P.max)P.max=w;}
}
if(haveAvg)cache[d.m]=P;
}
const es=Object.entries(P.byState);
window.__rainDbg=()=>({m:d.m,states:es.length,avg:!!avg,w:Object.fromEntries(es.map(([n2,v])=>[n2,Math.round(v.w)]))});
window.__rainSample=()=>{const Q=window.__rainPoolCache&&window.__rainPoolCache[INDWeather.month||7];if(!Q)return null;const qs=Object.entries(Q.byState);if(!qs.length)return null;let t2=0;for(const[,v]of qs)t2+=v.w;let r=Math.random()*t2,uk=qs[qs.length-1];
for(const kv of qs){uk=kv;r-=kv[1].w;if(r<=0)break;}
const v=uk[1],p=v.pts[(Math.random()*v.pts.length)|0];return[p[0],p[1],Math.min(1,v.w/Q.max)];};
}catch(e){console.warn("rain pools failed",e);}
};
window.__rainStates(monthByNum(INDWeather.month||7));
fetch("data/rain-state-avg.json?v=7.2").then(r=>r.json()).then(j=>{window.__rainAvg=j;try{window.__rainStates(monthByNum(INDWeather.month||7));}catch(_){}}).catch(e=>console.warn("rain-state-avg failed",e));
[["ARABIAN SEA",12.5,62],["BAY OF BENGAL",14.5,88.5],["INDIAN OCEAN",-3,74]].forEach(([t,la,lo])=>L.marker([la,lo],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:t})}).addTo(map));
/* branch flows with head markers (sized by month); small text labels live in textG (zoom>=5 only) */
const textG=L.layerGroup();
const asLine=L.polyline([[5,60],[12,68],[20,72]],{color:ARAB_COL,weight:5}).addTo(map);
const bobLine=L.polyline([[8,92],[14,88],[22,86]],{color:BOB_WIND,weight:4}).addTo(map);
const headCss=(c,s)=>`display:inline-block;transform:rotate(38deg);color:${c};font-size:${s}px;line-height:1`;
const asHead=L.marker([20,72],{interactive:false,icon:L.divIcon({className:"",html:`<span style="${headCss(ARAB_COL,16)}">▲</span>`})}).addTo(map);
const bobHead=L.marker([22,86],{interactive:false,icon:L.divIcon({className:"",html:`<span style="${headCss(BOB_COL,14)}">▲</span>`})}).addTo(map);
L.marker([20.5,69.2],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"AS branch"})}).addTo(textG);
L.marker([22.5,83.2],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"BoB branch"})}).addTo(textG);
window.__branchSize=d=>{
asLine.setStyle({weight:1+d.arabian/18,opacity:0.35+d.arabian/160});
bobLine.setStyle({weight:1+d.bay/18,opacity:0.35+d.bay/160});
asHead.setIcon(L.divIcon({className:"",html:`<span style="${headCss(ARAB_COL,10+d.arabian/12)}">▲</span>`}));
bobHead.setIcon(L.divIcon({className:"",html:`<span style="${headCss(BOB_WIND,10+d.bay/12)}">▲</span>`}));
(window.__oroHeads||[]).forEach(m=>{try{m.setIcon(L.divIcon({className:"",html:`<span style="display:inline-block;transform:rotate(45deg);color:#0F766E;font-size:${(10+d.arabian/10).toFixed(0)}px;line-height:1">▲</span>`}));}catch(_){}});
};
window.__branchSize(monthByNum(7));
/* sea currents: Somali Current + Monsoon Current flip with the monsoon (symbols with heads) */
const curG=L.layerGroup();
const somLine=L.polyline([[-5,51],[0,51.5],[5,52],[10,54]],{color:"#0F766E",weight:3,dashArray:"2 5"}).addTo(curG);
const monLine=L.polyline([[3,55],[4,70],[5,85],[6,96]],{color:"#6B7280",weight:3,dashArray:"2 5"}).addTo(curG);
const somHeadN=L.marker([10,54],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"▲"})}).addTo(curG);
const somHeadS=L.marker([-5,51],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"▲"})}).addTo(curG);
const monHeadE=L.marker([6,96],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"▲"})}).addTo(curG);
const monHeadW=L.marker([3,55],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"▲"})}).addTo(curG);
const curLbl=L.marker([13,46],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"currents"})}).addTo(curG);
window.__currentMonth=d=>{
const summer=d.m>=5&&d.m<=9;
const b=CLIM.mjoBoost||1,w=Math.min(4.5,Math.max(1.5,3*b));
somHeadN.setOpacity(summer?1:0);somHeadS.setOpacity(summer?0:1);
monHeadE.setOpacity(summer?1:0);monHeadW.setOpacity(summer?0:1);
somLine.setStyle({color:summer?ARAB_COL:BOB_COL,weight:w});
monLine.setStyle({color:summer?ARAB_COL:BOB_COL,weight:w});
curLbl.setIcon(L.divIcon({className:"oceanLbl",html:(summer?"Somali Cur →N · Monsoon Cur →E":"Somali Cur →S · Monsoon Cur →W")+(b!==1?` · MJO×${b}`:"")}));
};
window.__currentMonth(monthByNum(7));
/* Western Ghats ridge: windward heavy west, leeward rain-shadow east; heads scale with AS strength */
const ghatsLine=L.polyline([[8,77.2],[12,76],[16,73.8],[21,73.5]],{color:"#1A1A1A",weight:2}).addTo(curG);
ghatsLine.bindPopup("<b>Western Ghats</b><br>SW flow lifts on the windward (west) side → heavy rain (Kerala/Konkan); leeward Deccan sits in rain-shadow.<br>Source: swmonsoon_yprao.pdf Ch.10");
L.marker([14,71.6],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"WINDWARD · heavy"})}).addTo(textG);
L.marker([15,78.8],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"LEEWARD · rain-shadow"})}).addTo(textG);
[[10,74.6],[14,73.2],[18,72.5]].forEach(([la,lo])=>{const m=L.marker([la,lo],{interactive:false,icon:L.divIcon({className:"",html:"<span>▲</span>"})}).addTo(curG);window.__oroHeads.push(m);});
window.__branchSize(monthByNum(INDWeather.month||7));
/* ACCURATE zones: CHZ state-approx polygon; CCZ exact IMD box 72.5-82.5E x 20.5-35N.
   Persistent groups (heatG/radarG/iodG/lpsG/mjoG) so chips can add AND remove. */
const chz=L.polygon([[32,74],[31.5,77.5],[29.5,79],[28,81],[26,84],[24,87],[21.5,87],[19.5,85],[17.5,81],[17.8,78],[20,74],[23,71],[27,70.5],[30,73]],{color:HEAT_COL,weight:2.5,dashArray:"7 4",fillOpacity:0.12});
chz.bindPopup("<b>Core Heatwave Zone (state-approx)</b><br>Punjab, Haryana, HP, Uttarakhand, Delhi, Rajasthan, UP, Gujarat, MP, Chhattisgarh, Bihar, Jharkhand, WB, Odisha, Telangana (+coastal AP 2nd zone) · Mar–Jun, peak May.<br>HW: plains ≥40°C + dep +4.5–6.4°C; SHW &gt;6.4°C / ≥45°C; 2 stns × 2 days.<br>Source: Cold_Heat_Waves.pdf p42–48; web · IMD/ToI Oct 2026");
const ccz=L.rectangle([[20.5,72.5],[35,82.5]],{color:COLD_COL,weight:2.5,dashArray:"7 4",fillOpacity:0.08});
ccz.bindPopup("<b>Core Coldwave Zone — IMD box 72.5–82.5°E × 20.5–35°N</b><br>NDMA 17 states/UTs: J&K, Ladakh, HP, Uttarakhand, Punjab, Haryana, Delhi, Rajasthan, UP, Bihar, MP, Telangana (+MH/GJ subdiv). Nov–Mar, peak Jan.<br>CW: dep −4.5…−6.4°C; area-avg trend −0.36/dec.<br>Source: Cold_Heat_Waves.pdf p23–29; web · NDMA/Drishti");
const heatG=L.layerGroup([chz,ccz]);
const radarG=L.layerGroup();
(radars.stations||[]).forEach(s=>{
const r=((radars.meta&&radars.meta.bands&&radars.meta.bands[s.band])||250)*1000;
L.circle([s.lat,s.lon],{radius:r,color:s.band==="X"?"#6B7280":"#0F766E",weight:2,fillOpacity:0.10}).addTo(radarG);
L.circleMarker([s.lat,s.lon],{radius:6,color:"#1A1A1A",fillColor:"#fff",fillOpacity:1,weight:2}).addTo(radarG)
.bindPopup(`<b>${s.name} (approx)</b><br>${s.band}-band · radius ${r/1000} km<br>Source: web · PIB/MoES Oct 2026`);
});
const radarLblG=L.layerGroup();
(radars.stations||[]).forEach(s=>{L.marker([s.lat,s.lon],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:`<span style="font-size:10px">◉ ${s.name.split(" (")[0]}</span>`})}).addTo(radarLblG);});
const syncRadarLbl=()=>{if(!map)return;const on=map.getZoom()>=6&&layers.radar;if(on){if(!map.hasLayer(radarLblG))radarLblG.addTo(map);}else{if(map.hasLayer(radarLblG))map.removeLayer(radarLblG);}};
map.on("zoomend",()=>{if(window.__applyLayers)window.__applyLayers();});
/* rivers (Natural Earth centerlines, schematic flow) + studied origins (NCERT) */
const riverG=L.layerGroup();
const MAJORS=new Set(["ganges","brahmaputra","indus","yamuna","godavari","krishna","cauvery","narmada","tapi","mahana nadi","ghaghara","gandak","chambal","son","brahmani","chenab","sutlej","penner","tungabhadra","tista","mahi","beas","ravi","jhelum","palar","wainganga","kolidam","luhit"]);
const rnorm=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const rivMaj=L.layerGroup(),rivMed=L.layerGroup(),rivMin=L.layerGroup(),rivWest=L.layerGroup();
let riverCount=0,westCount=0;
const RORIG=[
{n:"Ganga",o:"Gaumukh · Gangotri glacier",st:"Uttarakhand",la:30.93,lo:79.47,note:"Mouth: Bay of Bengal; snowmelt + monsoon fed"},
{n:"Yamuna",o:"Yamunotri glacier",st:"Uttarakhand",la:31.01,lo:78.45,note:"Largest Ganga tributary; meets at Prayagraj"},
{n:"Brahmaputra",o:"Angsi glacier, Tibet (Yarlung Tsangpo)",st:"enters at Gelling, Arunachal",la:29.3,lo:94.6,note:"Snowmelt + SW rains; braided flows in Assam"},
{n:"Indus",o:"Senge Khabab, Tibetan plateau",st:"via Leh, Ladakh",la:34.15,lo:77.58,note:"Glacier-fed; bulk flow outside India"},
{n:"Godavari",o:"Trimbakeshwar, Nashik",st:"Maharashtra",la:19.93,lo:73.53,note:"Longest peninsular river; monsoon-fed"},
{n:"Krishna",o:"Mahabaleshwar",st:"Maharashtra",la:17.92,lo:73.66,note:"W Ghats origin; leeward Deccan course"},
{n:"Kaveri",o:"Talakaveri, Coorg",st:"Karnataka",la:12.38,lo:75.48,note:"Rains from both SW + NE monsoons"},
{n:"Narmada",o:"Amarkantak",st:"Madhya Pradesh",la:22.68,lo:81.75,note:"West-flowing rift river to Gulf of Khambhat"},
{n:"Tapi",o:"Multai, Satpura",st:"Madhya Pradesh",la:21.77,lo:78.23,note:"West-flowing to the Arabian Sea"},
{n:"Mahanadi",o:"Sihawa, Dhamtari",st:"Chhattisgarh",la:20.28,lo:81.98,note:"Delta in Odisha; flood-prone in peak monsoon"},
{n:"Sabarmati",o:"Dhebar Lake, Udaipur",st:"Rajasthan",la:24.58,lo:73.72,note:"Monsoon-fed; Gulf of Khambhat"},
{n:"Mahi",o:"Minda, Dhar",st:"Madhya Pradesh",la:22.7,lo:75.0,note:"Gulf of Khambhat"},
{n:"Luni",o:"Pushkar valley, Ajmer",st:"Rajasthan",la:26.45,lo:74.62,note:"Ephemeral; ends in Rann of Kutch, no sea mouth"},
{n:"Chambal",o:"Janapav, Mhow",st:"Madhya Pradesh",la:22.55,lo:75.76,note:"Joins Yamuna in UP"},
{n:"Betwa",o:"Vindhya, Raisen",st:"Madhya Pradesh",la:23.0,lo:77.9,note:"Joins Yamuna at Hamirpur"},
{n:"Son",o:"Amarkantak",st:"Madhya Pradesh",la:22.68,lo:81.75,note:"Joins Ganga near Patna"},
{n:"Ghaghara",o:"Mapchachungo glacier",st:"Tibet, near Mansarovar",la:30.6,lo:80.7,note:"Snowmelt-fed Ganga tributary"},
{n:"Gandak",o:"Nhubine Himal",st:"Tibet–Nepal border",la:29.35,lo:85.15,note:"Joins Ganga at Hajipur"},
{n:"Kosi",o:"Saptakoshi headwaters",st:"Tibet–Nepal Himalaya",la:28.0,lo:86.5,note:"Shifting channels; meets Ganga in Bihar"},
{n:"Damodar",o:"Khamarpat, Palamu",st:"Jharkhand",la:23.6,lo:84.2,note:"Damodar Valley; joins Hooghly"},
{n:"Subarnarekha",o:"Nagri, Ranchi plateau",st:"Jharkhand",la:23.3,lo:85.35,note:"Meets Bay of Bengal at Talsari"},
{n:"Brahmani",o:"South Koel + Sankh, Chotanagpur",st:"Jharkhand–Odisha",la:22.6,lo:84.5,note:"Delta at Dhamra"},
{n:"Penna",o:"Nandi Hills",st:"Karnataka",la:13.37,lo:77.68,note:"Rain-shadow river to the Bay of Bengal"},
{n:"Vaigai",o:"Varushanad valley, Theni",st:"Tamil Nadu",la:9.65,lo:77.35,note:"Seasonal; Vaigai dam"}];
try{
const rv=await getJSON("data/india-rivers.geo.json","rivers");
L.geoJSON(rv,{style:f=>({color:"#0284C7",weight:(f.properties&&f.properties.scalerank<=3)?3:1.6,opacity:0.9,smoothFactor:2,className:"river-flow"}),onEachFeature:(f,l)=>{(f.properties.scalerank<=3?rivMaj:(f.properties.scalerank<=5?rivMed:rivMin)).addLayer(l);}});
riverCount=rv.features.length;
rv.features.forEach(f=>{
if(!MAJORS.has(rnorm(f.properties.name)))return;
const lines=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
let best=null,bl=0;
for(const ln of lines){let L=0;for(let i=1;i<ln.length;i++)L+=Math.hypot(ln[i][0]-ln[i-1][0],ln[i][1]-ln[i-1][1]);if(L>bl){bl=L;best=ln;}}
if(!best||best.length<4)return;
const i=Math.floor(best.length/2),a=best[i],b=best[i+1];
const ang=Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI;
L.marker([a[1],a[0]],{interactive:false,icon:L.divIcon({className:"",html:`<span style="display:inline-block;transform:rotate(${ang.toFixed(0)}deg);color:#0284C7;font-size:13px;line-height:1">▲</span>`})}).addTo(riverG);
});
}catch(e){console.warn("rivers failed",e);}
/* v6.2 west-flowing rivers (Arabian-Sea side): the CWC River_Network subset that Natural
   Earth lacks (Konkan/Goa/Karnataka/Kerala + Kutch/Saurashtra coast, Narmada–Tapi inland).
   Shown from z5 with the other rivers so the west coast reads like the east. */
try{
const rw=await getJSON("data/india-rivers-west.geo.json","riversWest");
L.geoJSON(rw,{style:{color:"#0284C7",weight:1.1,opacity:0.8,smoothFactor:2},onEachFeature:(f,l)=>{l.bindPopup(`<b>${f.properties.rivname||"River"}</b> · ${f.properties.len_km} km<br>basin: ${f.properties.basin||"—"}<br>Source: user River_Network shapefile (west-flowing subset)`);}}).eachLayer(l=>rivWest.addLayer(l));
westCount=rw.features.length;
}catch(e){console.warn("west rivers failed",e);}
RORIG.forEach(o=>{L.circleMarker([o.la,o.lo],{radius:4,color:"#1A1A1A",fillColor:"#0284C7",fillOpacity:1,weight:2}).addTo(riverG).bindPopup(`<b>${o.n} origin (approx)</b><br>${o.o} — ${o.st}<br>${o.note}<br>Source: web · NCERT Oct 2026`);});
const MOUTHS=[["Ganga","Sagar Island",21.6,88.08],["Brahmaputra","confluence with Ganga",23.8,89.75],["Indus","Kotri creek, Arabian Sea",23.99,67.42],["Godavari","Yanam",16.73,82.28],["Krishna","Hamsaladeevi",15.91,80.91],["Kaveri","Poompuhar",11.14,79.85],["Narmada","Gulf of Khambhat",21.65,72.53],["Tapi","Surat",21.2,72.62],["Mahanadi","Paradip",20.26,86.65],["Sabarmati","Gulf of Khambhat",22.16,72.55],["Mahi","Gulf of Khambhat",22.23,72.62],["Brahmani","Dhamra",20.78,86.95],["Subarnarekha","Talsari",21.58,87.28]];
MOUTHS.forEach(([n,o,la,lo])=>{L.circleMarker([la,lo],{radius:5,color:"#0284C7",fillColor:"#fff",fillOpacity:1,weight:2}).addTo(riverG).bindPopup(`<b>${n} meets the sea (approx)</b><br>${o}<br>Source: web · NCERT Oct 2026`);});
window.__riverMonth=d=>{const fast=d.m>=6&&d.m<=9;try{document.querySelectorAll(".river-flow").forEach(p=>{p.style.animationDuration=fast?"0.7s":"1.6s";});}catch(_){}};
/* user shapefiles: basins + sub-basin drill-down, dams, water bodies, CWC river network */
const basinG=L.layerGroup(),subG=L.layerGroup(),damG=L.layerGroup(),waterG=L.layerGroup(),cwcG=L.layerGroup();
let basinCount=0,damCount=0,SUBS=null,SUBS_LOADING=null,dg0=null,dg1=null,dg2=null;
try{
const bs=await getJSON("data/basins.geo.json","basins");
L.geoJSON(bs,{style:{color:"#1A1A1A",weight:1.2,fillColor:"#0F766E",fillOpacity:0.07}}).eachLayer(l=>{const p=l.feature.properties;l.bindPopup(`<b>${p.ba_name} Basin</b><br>code ${p.bacode} · ${Number(p.area_sqkm).toLocaleString("en-IN")} km²<br>${p.state}<br>Sub-basins load on click.<br>Source: user CWC basins`);l.on("click",()=>{if(window.__showSub)window.__showSub(p.bacode,p.ba_name);});}).addTo(basinG);
basinCount=bs.features.length;
}catch(e){console.warn("basins failed",e);}
window.__showSub=async(bacode,ba_name)=>{
if(!SUBS){if(!SUBS_LOADING)SUBS_LOADING=getJSON("data/subbasins.geo.json","subbasins").catch(()=>null);SUBS=await SUBS_LOADING;}
subG.clearLayers();
if(!SUBS)return;
const list=SUBS.features.filter(f=>f.properties.bacode===bacode);
L.geoJSON({type:"FeatureCollection",features:list},{style:{color:"#0F766E",weight:1.4,dashArray:"4 3",fillOpacity:0.10}}).bindPopup(l=>`<b>${l.feature.properties.sub_basin}</b><br>${ba_name} Basin (${bacode})<br>Source: user CWC sub-basins`).addTo(subG);
if(!map.hasLayer(subG))subG.addTo(map);
monthReadout.textContent=`${ba_name} Basin · ${list.length} sub-basins: `+list.slice(0,8).map(f=>f.properties.sub_basin).join(" · ")+` · user CWC`;
};
try{
const dm=await getJSON("data/dams.geo.json","dams");
const ranked=[...dm.features].sort((a,b)=>((b.properties.height)||0)-((a.properties.height)||0));
const dg=dg0=L.layerGroup();dg1=L.layerGroup();dg2=L.layerGroup();
const mkPin=f=>{const p=f.properties,c=f.geometry.coordinates;
return L.circleMarker([c[1],c[0]],{radius:3.5,color:"#B45309",fillColor:"#fff",fillOpacity:1,weight:1.6})
.bindPopup(`<b>${p.name}</b><br>${p.state||""} ${p.district||""}<br>river: ${p.river||"—"} · basin: ${p.basin||"—"}${p.height?" · ht "+p.height+" m":""}${p.year?" · "+p.year:""}<br>Source: user dam shapefiles`);};
ranked.forEach((f,i)=>{(i<40?dg0:(i<400?dg1:dg2)).addLayer(mkPin(f));});
const tall=dm.features.filter(f=>(f.properties.height||0)>0).sort((a,b)=>b.properties.height-a.properties.height).slice(0,300);
const damLblG=L.layerGroup();
tall.forEach(f=>{const c=f.geometry.coordinates;L.marker([c[1],c[0]],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:`<span style="font-size:9px">▲ ${f.properties.name}</span>`})}).addTo(damLblG);});
damG.addLayer(damLblG);
damCount=dm.features.length;
window.__damLbl=on=>{if(!map)return;if(on&&map.getZoom()>=7){if(!map.hasLayer(damLblG))damLblG.addTo(map);}else{if(map.hasLayer(damLblG))map.removeLayer(damLblG);}};
}catch(e){console.warn("dams failed",e);}
window.__waterDone=false;
window.__loadWater=async()=>{
if(window.__waterDone)return;window.__waterDone=true;
try{
const res=await getJSON("data/reservoirs.geo.json","reservoirs");
L.geoJSON(res,{style:{color:"#0284C7",weight:1,fillColor:"#0284C7",fillOpacity:0.25,smoothFactor:2}}).bindPopup(l=>{const p=l.feature.properties;return `<b>${p.res_name||"Reservoir"}</b><br>river: ${p.river||"—"} · basin: ${p.basin||"—"} · area ${p.area}<br>Source: user reservoir shapefile`;}).addTo(waterG);
const gl=await getJSON("data/glacial.geo.json","glacial");
L.geoJSON(gl,{style:{color:"#1D4ED8",weight:1,fillColor:"#BAE6FD",fillOpacity:0.5}}).bindPopup(l=>{const p=l.feature.properties;return `<b>${p.name||"Glacial lake"}</b><br>${p.state} · ${p.basin} basin · ${p.elev} m · ${p.area_ha} ha<br>Source: user glacial-lake shapefile`;}).addTo(waterG);
const tn=await getJSON("data/tn-water.geo.json","tnwater");
L.geoJSON(tn,{style:{color:"#0F766E",weight:0.8,fillOpacity:0.2}}).bindPopup(l=>{const p=l.feature.properties;return `<b>${p.village||"Waterbody"}</b> · ${p.district}<br>river: ${p.river||"—"} · basin: ${p.basin||"—"}<br>Source: user TN waterbody shapefile`;}).addTo(waterG);
}catch(e){console.warn("water failed",e);}
};
window.__cwcCount=0;
getJSON("data/rivers-cwc.geo.json","riverscwc").then(cw=>{
L.geoJSON(cw,{style:{color:"#0284C7",weight:1.2,opacity:0.75,smoothFactor:3}}).bindPopup(l=>{const p=l.feature.properties;return `<b>${p.rivname||"River"}</b> · ${p.len_km} km<br>basin: ${p.basin||"—"} · sub: ${p.subbasin||"—"}${p.origin?"<br>origin: "+p.origin:""}${p.trib?"<br>trib: "+p.trib:""}<br>Source: user River_Network shapefile`;}).addTo(cwcG);
window.__cwcCount=cw.features.length;
if(window.__applyLayers)window.__applyLayers();
}).catch(e=>console.warn("cwc failed",e));
/* BOM-verified IOD boxes: W 10S-10N 50-70E; E 10S-0 90-108E */
const iodG=L.layerGroup();
const iodWestRect=L.rectangle([[-10,50],[10,70]],{color:"#6B7280",weight:2.5,dashArray:"5 4",fillOpacity:0.10}).addTo(iodG).bindPopup("<b>IOD West box 50–70°E, 10°S–10°N (BOM)</b><br>DMI = W − E (Saji 1999). BOM: sustained &gt;+0.4°C = pIOD.<br>Warm = amber, cold = blue (live from DMI slider).<br>Source: 569-589.pdf p573; web · BOM/NOAA Oct 2026");
const iodEastRect=L.rectangle([[-10,90],[0,108]],{color:"#6B7280",weight:2.5,dashArray:"5 4",fillOpacity:0.10}).addTo(iodG).bindPopup("<b>IOD East box 90–108°E, 10°S–0° (BOM)</b><br>pIOD: cold east / warm west; Kelvin upwelling off Sumatra/Java.<br>Warm = amber, cold = blue (live from DMI slider).<br>Source: 569-589.pdf p571–577; web · BOM Oct 2026");
const iodLblW=L.marker([0,60],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"W"})}).addTo(iodG);
const iodLblE=L.marker([-5,99],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"E"})}).addTo(iodG);
/* dedicated IOD wind streams: equatorial + Sumatra SE trades; heads flip with DMI sign */
const iodEq=L.polyline([[-2,52],[-2,68]],{color:"#1A1A1A",weight:2,dashArray:"1 5"}).addTo(iodG);
const iodEqH=L.marker([-2,68],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"◀"})}).addTo(iodG);
const iodSum=L.polyline([[-9,102],[-3,96]],{color:"#1A1A1A",weight:2,dashArray:"1 5"}).addTo(iodG);
const iodSumH=L.marker([-3,96],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"↖"})}).addTo(iodG);
const lpsG=L.layerGroup();
[[19,88],[18,89],[17,90],[16,91],[20,87],[15,88],[21,89],[18.5,86.5]].forEach(([la,lo])=>L.circleMarker([la,lo],{radius:3.5,color:"#1A1A1A",fillColor:"#1A1A1A",fillOpacity:1}).addTo(lpsG).bindPopup("LPS genesis 2025 (of 19). Source: monsoon_report_2025_2.pdf p47"));
/* MJO pulse on the map: convection blob travels the equator with Fig5 phase */
const mjoG=L.layerGroup();window.__mjoG=mjoG;
const mjoBlob=L.circleMarker([-5,32],{radius:14,color:"#0F766E",fillColor:"#0F766E",fillOpacity:0.35,weight:2}).addTo(mjoG);
mjoBlob.bindPopup("MJO convection — see Fig5 loom.");
window.__mjoAnim=window.__mjoAnim||{lon:32,sup:-148,tlon:32,tsup:-148};
const mjoTrack=L.polyline([[-5,15],[-5,60],[-5,99],[-5,134]],{color:"#0F766E",weight:1.5,dashArray:"3 5",opacity:0.7}).addTo(mjoG);
const mjoSup=L.circleMarker([-5,212],{radius:10,color:"#6B7280",fillColor:"#6B7280",fillOpacity:0.15,weight:2,dashArray:"4 3"}).addTo(mjoG);
mjoSup.bindPopup("MJO suppressed phase (opposite side of globe). Ph4–5 dry for India.");
const mjoLbl=L.marker([3,32],{interactive:false,icon:L.divIcon({className:"oceanLbl",html:"MJO"})}).addTo(mjoG);
window.__mjoBlob=mjoBlob;window.__mjoSup=mjoSup;window.__mjoLbl=mjoLbl;
window.__mjoMap=(p,d)=>{
const lon=15+(p-1)*17;
let sl=lon-180;if(sl<-180)sl+=360;if(sl>180)sl-=360;
const A=window.__mjoAnim||(window.__mjoAnim={lon,sup:sl,tlon:lon,tsup:sl});
A.tlon=lon;A.tsup=sl;
/* wrap 8→1: snap to Africa instead of sliding backwards across the ocean */
if(Math.abs(lon-A.lon)>80)A.lon=lon;if(Math.abs(sl-A.sup)>80)A.sup=sl;
CLIM.mjoBoost=(p<=3?1.25:(p<=5?0.8:1));
if(window.__currentMonth){try{window.__currentMonth(monthByNum(INDWeather.month||7));}catch(_){}}
mjoBlob.setPopupContent(`<b>MJO Phase ${p} (enhanced)</b> over ${d?d.over:"—"}<br>${d?d.india:""}<br>Westerly bursts feed it from the west; currents run with MJO boost.<br>Source: data/mjo.json`);
mjoSup.setPopupContent(`<b>MJO suppressed zone</b> opposite Phase ${p}<br>Dry side of the pulse.`);
mjoLbl.setIcon(L.divIcon({className:"oceanLbl",html:`MJO Ph${p}`}));
};
if(INDWeather.mjo)window.__mjoMap(INDWeather.mjo,{over:"—",india:"Fig5 loom drives this blob"});
window.__zoneMonth=m=>{
chz.setStyle({fillOpacity:0.04+HEAT_K[m]*0.14,opacity:0.4+HEAT_K[m]*0.6,weight:1.5+HEAT_K[m]*1.5});
ccz.setStyle({fillOpacity:0.03+COLD_K[m]*0.12,opacity:0.4+COLD_K[m]*0.6,weight:1.5+COLD_K[m]*1.5});
};
window.__iodMap=dmi=>{
const k=0.3+Math.min(1,Math.abs(dmi)/1.5)*0.7;
const WARM="#B45309",COLD="#1D4ED8",NEU="#6B7280";
const f=v=>(v>=0?"+":"")+v.toFixed(1)+"°";
let wc=NEU,ec=NEU,ph="NEUTRAL (BOM |DMI|<0.4)";
if(dmi>=0.4){wc=WARM;ec=COLD;ph="POSITIVE IOD";}else if(dmi<=-0.4){wc=COLD;ec=WARM;ph="NEGATIVE IOD";}
try{
iodWestRect.setStyle({color:wc,fillColor:wc,opacity:k,fillOpacity:0.04+0.16*k});
iodEastRect.setStyle({color:ec,fillColor:ec,opacity:k,fillOpacity:0.04+0.16*k});
iodWestRect.setPopupContent(`<b>IOD West box — ${ph}</b><br>anomaly ${f(dmi/2)} (${dmi/2>=0?"warm":"cool"})<br>Driven by Fig2 slider/cycle, nothing else moves.<br>Source: 569-589.pdf p573; BOM ±0.4`);
iodEastRect.setPopupContent(`<b>IOD East box — ${ph}</b><br>anomaly ${f(-dmi/2)} (${-dmi/2>=0?"warm":"cool"})<br>Kelvin upwelling off Sumatra/Java in pIOD.<br>Source: 569-589.pdf p571; BOM`);
}catch(_){}
iodLblW.setIcon(L.divIcon({className:"oceanLbl",html:"W "+f(dmi/2)}));
iodLblE.setIcon(L.divIcon({className:"oceanLbl",html:"E "+f(-dmi/2)}));
iodEqH.setIcon(L.divIcon({className:"oceanLbl",html:dmi>=0.4?"◀":(dmi<=-0.4?"▶":"·")}));
iodSumH.setIcon(L.divIcon({className:"oceanLbl",html:dmi>=0.4?"↖":(dmi<=-0.4?"↘":"·")}));
};
window.__iodSeason=m=>{if(window.__iodMap)window.__iodMap(CLIM.dmi);};
window.__zoneMonth(INDWeather.month||7);window.__iodMap(CLIM.dmi);
window.__applyLayers=()=>{
const sync=(layer,on)=>{if(!map||!layer)return;if(on){if(!map.hasLayer(layer))layer.addTo(map);}else{if(map.hasLayer(layer))map.removeLayer(layer);}};
sync(heatG,layers.heatcold);
sync(radarG,layers.radar);
sync(iodG,layers.iod);
sync(lpsG,layers.iod);
sync(mjoG,layers.mjo);
sync(riverG,layers.rivers);
const zd=map.getZoom();
sync(rivMaj,layers.rivers);
sync(rivMed,layers.rivers&&zd>=5);
sync(rivWest,layers.rivers&&zd>=5);
sync(rivMin,layers.rivers&&zd>=7);
sync(curG,layers.winds);
sync(textG,layers.winds&&zd>=5);
sync(basinG,layers.basins);
if(layers.dams){[dg0,dg1,dg2].filter(Boolean).forEach(g=>{if(map.hasLayer(g))map.removeLayer(g);});(zd<6?[dg0]:(zd<8?[dg0,dg1]:[dg0,dg1,dg2])).filter(Boolean).forEach(g=>g.addTo(map));}else{[dg0,dg1,dg2].filter(Boolean).forEach(g=>{if(map.hasLayer(g))map.removeLayer(g);});}
sync(waterG,layers.water);
sync(cwcG,layers.rivers&&map.getZoom()>=6);
if(!layers.basins&&map.hasLayer(subG))map.removeLayer(subG);
syncRadarLbl();
if(window.__damLbl)window.__damLbl(layers.dams);
const n=[heatG,radarG,iodG,lpsG,mjoG,curG,textG,riverG,rivMaj,rivWest,basinG,dg0,waterG,cwcG].filter(g=>{try{return map.hasLayer(g);}catch(_){return false;}}).length;
monthReadout.title=`layers on map: ${n}/14`;
let svgOk="svg-?";
try{const stg=document.querySelector("#map .stage");if(stg.classList.contains("terrain-on")||stg.classList.contains("map3d-on"))svgOk="2D hidden (3D on)";else{const s=document.querySelector("#osmMap .leaflet-overlay-pane svg");if(s){const r=s.getBoundingClientRect(),m=$("osmMap").getBoundingClientRect();svgOk=(r.width>m.width*0.8&&r.height>m.height*0.8)?"vectors-ok":"VECTORS-BROKEN";}}}catch(_){}
const dbg=$("layerDebug");
if(dbg)dbg.textContent=`self-test: months=${MONTHS.length} stations=${(radars.stations||[]).length} states=${Object.keys(stateLayers).length} rivers=${riverCount}+${westCount}west basins=${basinCount} dams=${damCount} cwc=${window.__cwcCount||"…loading"} mjo=${MJOP.length} rm=${RM?1:0} · layers on=${n}/14 · phen=${(window.__phen&&window.__phen.on)?window.__phen.on.size:0}/41 · rainavg=${window.__rainAvg?Object.keys(window.__rainAvg.states).length:0}/36 · zoom=${map.getZoom()} · ${svgOk}`;
try{window.__phenEnv={map,month:(typeof INDWeather!=="undefined"&&INDWeather.month)||7};window.__phenEnv.rm=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);}catch(_){}
};
window.__applyLayers();
setTimeout(()=>window.__applyLayers(),1200);
if($("basinBtn"))$("basinBtn").addEventListener("click",()=>map.flyToBounds([[-12,38],[32,112]],{duration:1.2}));
if($("homeBtn"))$("homeBtn").addEventListener("click",()=>map.flyTo([22.5,79.5],5,{duration:1.2}));
if($("allBtn"))$("allBtn").addEventListener("click",()=>{for(const k in layers)layers[k]=true;document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed","true"));if(window.__applyLayers)window.__applyLayers();map.flyTo([22.5,79.5],5,{duration:1.2});});
}catch(err){
console.warn(err);
try{MONTHS=(await getJSON("data/months.json","months")).months;setMonth(7);}catch(e2){}
const fb=document.createElement("div");fb.className="fallback";
fb.innerHTML="Map tiles blocked — offline fallback: month table below still works. "+err;
document.querySelector("#map .card").appendChild(fb);
}
}
initMap();

/* ================= Fig1 plotter ================= */
const ISO=[
{label:"Andaman Sea",date:"13 May",x:0.06,s:"monsoon_report_2025_2.pdf p38"},
{label:"Kerala onset",date:"24 May",x:0.20,s:"monsoon_report_2025_2.pdf p38"},
{label:"Hiatus pause",date:"29 May–16 Jun",x:0.32,s:"monsoon_report_2025_2.pdf p38"},
{label:"Konkan / Bengal",date:"7–8 Jun",x:0.45,s:"swmonsoon_yprao.pdf p39"},
{label:"Vidarbha / MP",date:"12 Jun",x:0.58,s:"swmonsoon_yprao.pdf p39"},
{label:"E. UP",date:"15 Jun",x:0.68,s:"swmonsoon_yprao.pdf p39"},
{label:"Full cover",date:"27 Jun",x:0.80,s:"monsoon_report_2025_2.pdf p38"},
{label:"Delhi / NW",date:"~3 Jul",x:0.92,s:"swmonsoon_yprao.pdf p39"}];
(function(){let h="";for(let i=0;i<=24;i++){const x=120+i*20,maj=i%5===0;h+=`<line x1="${x}" y1="252" x2="${x}" y2="${maj?266:260}" stroke-width="${maj?1.6:1}"/>`;}$("plotTicks").innerHTML=h;
let w="";ISO.forEach((s,i)=>{const wx=120+s.x*480;w+=`<g><circle cx="${wx}" cy="290" r="7" fill="${i===1?"#0F766E":"#FAF9F6"}" stroke="#1A1A1A" stroke-width="1.5"/><circle cx="${wx}" cy="290" r="2" fill="#1A1A1A"/><text x="${wx}" y="278" font-size="9" text-anchor="middle" font-family="monospace" fill="#6B7280">${i+1}</text></g>`;});$("plotWells").innerHTML=w;})();
const beam=$("plotBeam"),head=$("plotHead"),dateSlider=$("dateSlider"),monsoonReadout=$("monsoonReadout");
const beamS=spring(v=>beam.setAttribute("transform",`translate(${v},150)`),0);
const headS=spring(v=>head.setAttribute("transform",`translate(${v},196)`),0);
function setDate(i){i=Math.max(0,Math.min(7,+i));const s=ISO[i];const bx=120+s.x*480;beamS.target=bx-260;headS.target=bx;monsoonReadout.textContent=`${i+1}/8 · ${s.label} · ${s.date} · ${s.s}`;head.querySelector("rect").setAttribute("fill",s.label.includes("Hiatus")?"#B91C1C":"#0F766E");}
dateSlider.addEventListener("input",e=>setDate(e.target.value));setDate(1);
let tour=null;$("playBtn").addEventListener("click",()=>{if(tour){clearInterval(tour);tour=null;$("playBtn").textContent="▶ tour";return;}$("playBtn").textContent="■ stop";let i=+dateSlider.value;tour=setInterval(()=>{i=(i+1)%8;dateSlider.value=i;setDate(i);},RM?99999:900);});

/* ================= Fig2 seesaw (BOM ±0.4) ================= */
(function(){let t="";for(let i=-5;i<=5;i++){const a=i*14;t+=`<line x1="0" y1="-38" x2="0" y2="-32" transform="rotate(${a})"/>`;}$("iodTicks").innerHTML=t;})();
const dmiSlider=$("dmiSlider"),iodReadout=$("iodReadout"),seeBeam=$("seeBeam"),waterW=$("waterW"),waterE=$("waterE"),iodNeedle=$("iodNeedle"),kelvinDot=$("kelvinDot");
function setDMI(v10){const dmi=v10/10;const ang=Math.max(-45,Math.min(45,dmi*30));iodNeedle.setAttribute("transform",`rotate(${ang})`);seeBeam.setAttribute("transform",`translate(360,208) rotate(${(-dmi*5).toFixed(2)}) translate(-360,-208)`);const hW=Math.max(10,Math.min(100,66+dmi*20)),hE=Math.max(10,Math.min(100,66-dmi*20));waterW.setAttribute("height",hW);waterW.setAttribute("y",106-hW);waterE.setAttribute("height",hE);waterE.setAttribute("y",106-hE);let cls="neutral (BOM: |DMI|<0.4)";if(dmi>=0.4)cls="positive IOD — BOM sustained ≥+0.4";else if(dmi<=-0.4)cls="negative IOD — BOM ≤−0.4";iodReadout.textContent=`DMI ${dmi>=0?"+":""}${dmi.toFixed(1)}°C · ${cls} · 569-589.pdf p573 + BOM`;iodReadout.title="W box 50-70E 10S-10N; E box 90-108E 10S-0 (BOM map-indices)";
CLIM.dmi=dmi;if(window.__iodMap)window.__iodMap(dmi);}
dmiSlider.addEventListener("input",e=>setDMI(+e.target.value));setDMI(8);
document.querySelectorAll("[data-dmi]").forEach(b=>b.addEventListener("click",()=>{dmiSlider.value=b.dataset.dmi;setDMI(+b.dataset.dmi);}));
Promise.resolve(getJSON("data/iod_events.json","iodEvents")).then(j=>{
const sel=$("iodEvent");if(!sel)return;
j.events.forEach(e=>{const o=document.createElement("option");o.value=e.slider;o.textContent=`${e.year} ${e.phase} (${e.level})`;o.dataset.note=e.note;o.dataset.src=e.s;sel.appendChild(o);});
sel.addEventListener("change",()=>{if(sel.value==="")return;const o=sel.selectedOptions[0];dmiSlider.value=sel.value;setDMI(+sel.value);iodReadout.textContent+=` · ${o.textContent}: ${o.dataset.note} · ${o.dataset.src}`;});
}).catch(()=>{});
$("kelvinBtn").addEventListener("click",()=>{if(RM){kelvinDot.setAttribute("cx",520);return;}const t0=performance.now();(function step(t){const p=Math.min(1,(t-t0)/1200);kelvinDot.setAttribute("cx",lerp(200,520,p));kelvinDot.setAttribute("cy",180-Math.sin(p*Math.PI)*26);if(p<1)requestAnimationFrame(step);else setTimeout(()=>kelvinDot.setAttribute("cx",200),600);})(t0);});
let iodTour=null;
const iodPlayBtn=$("iodPlay");
if(iodPlayBtn)iodPlayBtn.addEventListener("click",()=>{
if(iodTour){clearInterval(iodTour);iodTour=null;iodPlayBtn.textContent="▶ pIOD⇄nIOD cycle";return;}
iodPlayBtn.textContent="■ stop (month/MJO untouched)";let a=0;
iodTour=setInterval(()=>{a+=0.5;const v=Math.round(Math.sin(a)*12);dmiSlider.value=v;setDMI(v);},700);
});

/* ================= Fig3 dial ================= */
(function(){let t="";for(let i=0;i<=12;i++){const a=-75+i*12.5;t+=`<line x1="0" y1="-70" x2="0" y2="-63" transform="rotate(${a})"/>`;}$("heatTicks").innerHTML=t;})();
const modeSel=$("modeSel"),tVal=$("tVal"),depVal=$("depVal"),heatReadout=$("heatReadout"),heatNeedle=$("heatNeedle"),heatClass=$("heatClass"),coreLamp=$("coreLamp");
function setDial(){const mode=modeSel.value,t=+tVal.value,dep=+depVal.value;let cls="NORMAL",ang=-60;
if(mode==="heat"){ang=Math.max(-75,Math.min(75,-60+(t-30)*9+dep*3));if((t>=40&&dep>=6)||(t>=45&&dep>=5))cls="SEVERE HW";else if(t>=40&&dep>=4||t>=45)cls="HEAT WAVE";else if(t>=37&&dep>=4)cls="HW (coast)";heatClass.setAttribute("fill",cls.includes("HW")?"#B91C1C":"#0F766E");}
else{ang=Math.max(-75,Math.min(75,60+dep*6));if(dep<=-6.4)cls="SEVERE CW";else if(dep<=-4.5)cls="COLD WAVE";heatClass.setAttribute("fill",cls.includes("COLD")?"#1D4ED8":"#0F766E");}
heatNeedle.setAttribute("transform",`rotate(${ang.toFixed(1)})`);heatClass.textContent=cls;const core=cls.includes("HW")||cls.includes("COLD");coreLamp.setAttribute("fill",core?"#0F766E":"#E5E7EB");heatReadout.textContent=`${mode==="heat"?"Tmax":"Tmin"} ${t}°C · dep ${dep>=0?"+":""}${dep}°C → ${cls} · Cold_Heat_Waves.pdf p18–24`;}
[modeSel,tVal,depVal].forEach(el=>el.addEventListener("input",setDial));
document.querySelectorAll("[data-preset]").forEach(b=>b.addEventListener("click",()=>{const p=b.dataset.preset;if(p==="2015"){modeSel.value="heat";tVal.value=42;depVal.value=7;}if(p==="2022"){modeSel.value="heat";tVal.value=44;depVal.value=5;}if(p==="jan"){modeSel.value="cold";tVal.value=3;depVal.value=-5;}setDial();}));setDial();

/* ================= Fig5 MJO LOOM ================= */
let MJOP=[];
const mjoSlider=$("mjoSlider"),mjoReadout=$("mjoReadout"),mjoCells=$("mjoCells"),mjoShuttle=$("mjoShuttle");
function mjoPhase(p){p=Math.max(1,Math.min(8,p));INDWeather.mjo=p;const d=MJOP.find(x=>x.p===p);if(!d)return;
mjoSlider.value=p;
mjoShuttle.setAttribute("transform",`translate(${(110+(p-1)*(500/7)).toFixed(1)},130)`);
[...mjoCells.children].forEach((g,i)=>{const r=g.querySelector("rect");const ph=i+1;let fill="#FAF9F6";if(ph<=3)fill="#DCEDE9";else if(ph<=5)fill="#F6E8D8";r.setAttribute("fill",fill);r.setAttribute("stroke-width",ph===p?"2.5":"1");});
mjoReadout.textContent=`Ph${p} over ${d.over} → India: ${d.india} · ${d.s}`;
mjoReadout.title="30-60-day eastward pulse; Ph1-3 wet S peninsula, Ph4-5 dry/break (Pai 2011). Map zone arrows: violet = MJO-enhanced (Ph1-3), grey = suppressed (Ph4-5).";
if(window.__mjoMap)window.__mjoMap(p,d);
/* if the pulse is off-screen, pan gently so the phase change is visible */
try{if(window.__mjoG&&map.hasLayer(window.__mjoG)){const t=[-5,15+(p-1)*17],pp=map.latLngToContainerPoint(t),s=map.getSize();if(pp.x<-30||pp.x>s.x+30||pp.y<-30||pp.y>s.y+30)map.panInside(t,{animate:true,paddingTopLeft:[100,70],paddingBottomRight:[70,100]});}}catch(_){}
if(window.__graphCursor)window.__graphCursor(INDWeather.month||7);
}
Promise.resolve(getJSON("data/mjo.json","mjo")).then(j=>{
MJOP=j.phases;
let h="";const names=["AFR","W-IO","C-IO","E-IO","MC","W-PAC","E-PAC","ATL"];
MJOP.forEach((d,i)=>{const x=90+i*(500/7);h+=`<g><rect x="${(x-30).toFixed(1)}" y="90" width="60" height="80" fill="#FAF9F6" stroke="#1A1A1A"/><text x="${x.toFixed(1)}" y="112" font-size="10" text-anchor="middle" font-family="monospace" fill="#1A1A1A">Ph${d.p}</text><text x="${x.toFixed(1)}" y="126" font-size="8" text-anchor="middle" font-family="monospace" fill="#6B7280">${names[i]}</text><text x="${x.toFixed(1)}" y="158" font-size="8" text-anchor="middle" font-family="monospace" fill="#6B7280">${d.p<=3?"WET":(d.p<=5?"DRY":"—")}</text></g>`;});
mjoCells.innerHTML=h;
mjoSlider.addEventListener("input",e=>mjoPhase(+e.target.value));
mjoPhase((monthByNum(INDWeather.month||7)||{}).mjoTyp||2);
}).catch(()=>{mjoReadout.textContent="mjo.json failed to load — use local server.";});
let mjoTourShared=null;
/* month slider → month-typical MJO phase (illustrative linkage; a running tour wins) */
window.__mjoMonthSync=d=>{if(!d||!d.mjoTyp||mjoTourShared)return;try{mjoPhase(d.mjoTyp);mjoReadout.textContent+=" · month-typical phase (illustrative)";}catch(_){}};
function paintMjoBtns(running){["mjoPlay","mjoPlayMap"].forEach(id=>{const b=$(id);if(!b)return;if(id==="mjoPlay")b.textContent=running?"■ stop":"▶ propagate";else b.textContent=running?"■ MJO":"▶ MJO";});}
window.__toggleMjo=()=>{if(mjoTourShared){clearInterval(mjoTourShared);mjoTourShared=null;paintMjoBtns(false);return;}
/* tour starts: bring the whole MJO corridor (Africa→Pacific) into view if it is not already */
try{if(window.__mjoG&&map.hasLayer(window.__mjoG)){const cb=L.latLngBounds([[-16,6],[14,144]]);if(!map.getBounds().contains(cb))map.flyToBounds(cb,{duration:1.5,padding:[24,24]});}}catch(_){}
/* advance every 1.1s; under prefers-reduced-motion still advance (2.6s) but the blob snaps */
paintMjoBtns(true);mjoTourShared=setInterval(()=>{INDWeather.mjo=INDWeather.mjo%8+1;mjoPhase(INDWeather.mjo);},RM?2600:1100);};
$("mjoPlay").addEventListener("click",window.__toggleMjo);
if($("mjoPlayMap"))$("mjoPlayMap").addEventListener("click",window.__toggleMjo);

/* ================= 3D TERRAIN — Himalaya/Ghats relief from keyless Terrarium DEM ================= */
let terrainOn=false,terrainBuilt=false,terrainBuilding=false;
const t3Stats={walls:0,reservoirs:0};
const TB={lon0:66,lon1:98,lat0:5,lat1:38,z:6};
const tileXY=(lon,lat,z)=>{const n=2**z;return[Math.floor((lon+180)/360*n),Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n)];};
async function buildTerrain(){
const _t3p={};let _t3s=performance.now();const _t3=k=>{_t3p[k]=Math.round(performance.now()-_t3s);_t3s=performance.now();};   /* v7.0 phase timings → t3Stats.phases */
const cap=$("terrainCap");cap.textContent="loading elevation…";
const THREE=await import("three");
const [x0,y0]=tileXY(TB.lon0,TB.lat1,TB.z),[x1,y1]=tileXY(TB.lon1,TB.lat0,TB.z);
const NX=x1-x0+1,NY=y1-y0+1,T=256,Wpx=NX*T,Hpx=NY*T;
const H=new Float32Array(Wpx*Hpx);
const load=(x,y)=>new Promise((res,rej)=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>res(im);im.onerror=rej;im.src=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TB.z}/${x}/${y}.png`;});
const jobs=[];for(let ty=0;ty<NY;ty++)for(let tx=0;tx<NX;tx++)jobs.push(load(x0+tx,y0+ty).then(im=>({tx,ty,im})));
const cv=document.createElement("canvas");cv.width=cv.height=T;
const cx2=cv.getContext("2d",{willReadFrequently:true});
for(const{tx,ty,im}of await Promise.all(jobs)){
cx2.clearRect(0,0,T,T);cx2.drawImage(im,0,0);
const d=cx2.getImageData(0,0,T,T).data;
for(let j=0;j<T;j++)for(let i=0;i<T;i++){const o=(j*T+i)*4;H[(ty*T+j)*Wpx+tx*T+i]=d[o]*256+d[o+1]+d[o+2]/256-32768;}
}
const lonLT=(x0/Math.pow(2,TB.z))*360-180, spanLon=NX*360/Math.pow(2,TB.z);
const y2lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/Math.pow(2,TB.z))))*180/Math.PI;
const mY=la=>Math.log(Math.tan(la*Math.PI/180)+1/Math.cos(la*Math.PI/180));
const myT=mY(y2lat(y0)),myB=mY(y2lat(y1+1));
/* v7.0 BILINEAR DEM sample (was nearest-pixel): valleys, ridges and gorges resolve between
   pixels, so the true-scale relief, the dam walls and the reservoir shorelines all sit on
   the real ground surface. */
const hAt=(lon,lat)=>{const fx=Math.min(Wpx-1,Math.max(0,(lon-lonLT)/spanLon*(Wpx-1))),fz=Math.min(Hpx-1,Math.max(0,(myT-mY(Math.max(-85,Math.min(85,lat))))/(myT-myB)*(Hpx-1)));const ix=Math.floor(fx),iz=Math.floor(fz),ix1=Math.min(Wpx-1,ix+1),iz1=Math.min(Hpx-1,iz+1),xa=fx-ix,za=fz-iz,r0=iz*Wpx,r1=iz1*Wpx;return H[r0+ix]*(1-xa)*(1-za)+H[r0+ix1]*xa*(1-za)+H[r1+ix]*(1-xa)*za+H[r1+ix1]*xa*za;};
const tmp=new Float32Array(Math.max(Wpx,Hpx));
for(let j=0;j<Hpx;j++){for(let i=0;i<Wpx;i++){let s=0;for(let k=-1;k<=1;k++)s+=H[j*Wpx+Math.min(Wpx-1,Math.max(0,i+k))];tmp[i]=s/3;}for(let i=0;i<Wpx;i++)H[j*Wpx+i]=tmp[i];}
for(let i=0;i<Wpx;i++){for(let j=0;j<Hpx;j++){let s=0;for(let k=-1;k<=1;k++)s+=H[Math.min(Hpx-1,Math.max(0,j+k))*Wpx+i];tmp[j]=s/3;}for(let j=0;j<Hpx;j++)H[j*Wpx+i]=tmp[j];}
const W=3.4,D=2.55,SX=768,SY=672;   /* v7.0 mesh 768×672 ≈ 1.03 M tris — resolves the z6 DEM under true scale */
const renderer=new THREE.WebGLRenderer({canvas:$("terrain3d"),antialias:true});
renderer.setPixelRatio(Math.min(1.5,devicePixelRatio||1));
const scene=new THREE.Scene();scene.background=new THREE.Color("#0e1513");
/* v7.0 TRUE SCALE: 1 world unit ≈ 954 km on the ground (W=3.4 u spans 32° longitude).
   Mountains, dams, reservoirs and weather are built in real metres (metres × 1e-6 = units)
   and parented to `relG`; the relief chips multiply ONLY relG.scale.y (vertical
   exaggeration), so ×1 is the honest 1:1 elevation — nothing else needs rebuilding. */
const relG=new THREE.Group();scene.add(relG);let REL=1;
scene.add(new THREE.AmbientLight(0xffffff,0.8));
const sun=new THREE.DirectionalLight(0xffffff,1.05);sun.position.set(-3,4,2);scene.add(sun);
const geo=new THREE.PlaneGeometry(W,D,SX,SY);geo.rotateX(-Math.PI/2);
const pos=geo.attributes.position,cols=[];
const cA=new THREE.Color("#5B8C5A"),cB=new THREE.Color("#A08B62"),cC=new THREE.Color("#8A8F98"),cS=new THREE.Color("#F2F3F5"),tc=new THREE.Color();
const UPM=1e-6;                          /* metres → world units (true scale: 1 u ≈ 954 km) */
/* v7.4 snow caps: the old hard step at 5200 m becomes a smooth cC→cS ramp (full white ≈5,700 m) */
const terrCol=(h,c)=>{if(h>1800)c.copy(cC).lerp(cS,Math.min(1,(h-1800)/3400*0.3+Math.max(0,h-4400)/2000));else if(h>400)c.copy(cB).lerp(cC,(h-400)/1400*0.5);else c.copy(cA).lerp(cB,Math.min(1,h/400)*0.5);return c;};
const yOf=h=>Math.max(0,h)*UPM;          /* v7.0 true metres: Everest 8849 m = 0.008849 u (was 1.15 u) — unclipped */
const MZ=m=>m*UPM;                       /* metric offsets: sea level, water levels, label lifts */
for(let k=0;k<pos.count;k++){
const ix=k%(SX+1),iz=Math.floor(k/(SX+1));
const lon=TB.lon0+(TB.lon1-TB.lon0)*ix/SX,lat=TB.lat1-(TB.lat1-TB.lat0)*iz/SY;
const h=Math.max(0,hAt(lon,lat));
pos.setY(k,yOf(h));
terrCol(h,tc);
cols.push(tc.r,tc.g,tc.b);
}
geo.setAttribute("color",new THREE.Float32BufferAttribute(cols,3));
geo.computeVertexNormals();
const tMesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}));relG.add(tMesh);_t3("mesh");
/* Indian MSL datum: translucent sea plane at 0 m — relief reads against mean sea level */
const sea=new THREE.Mesh(new THREE.PlaneGeometry(W*1.25,D*1.25),new THREE.MeshStandardMaterial({color:0x0b3b5c,transparent:true,opacity:0.88,roughness:0.55,metalness:0}));
sea.rotation.x=-Math.PI/2;sea.position.y=MZ(15);relG.add(sea);
/* CWC basins draped on the relief: translucent wash + dark rim + name tag */
const BS_C=["#5B8C5A","#0F766E","#B45309","#0284C7","#8A8F98","#A08B62"];
const bsObjs=[];
const XB=lon=>(lon-(TB.lon0+TB.lon1)/2)/(TB.lon1-TB.lon0)*W;
const ZB=lat=>-((lat-(TB.lat0+TB.lat1)/2)/(TB.lat1-TB.lat0))*D;
try{
const bs3=await getJSON("data/basins.geo.json","basins");
bs3.features.forEach((f,bi)=>{
const all=f.geometry.type==="Polygon"?f.geometry.coordinates:f.geometry.coordinates.flat();
if(!all.length)return;
let big=all[0],ba=0;
for(const r of all){const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]);const a=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));if(a>ba){ba=a;big=r;}}
const pts=big.filter((_,i)=>i%2===0);
if(pts.length<4)return;
const sh=new THREE.Shape(pts.map(([lo,la])=>new THREE.Vector2(XB(lo),((la-(TB.lat0+TB.lat1)/2)/(TB.lat1-TB.lat0))*D)));
const gg=new THREE.ShapeGeometry(sh);
gg.rotateX(-Math.PI/2);
const pp=gg.attributes.position;
for(let k=0;k<pp.count;k++){const lo=(pp.getX(k)/W)*(TB.lon1-TB.lon0)+(TB.lon0+TB.lon1)/2;const la=(TB.lat0+TB.lat1)/2-(pp.getZ(k)/D)*(TB.lat1-TB.lat0);pp.setY(k,yOf(Math.max(0,hAt(lo,la)))+MZ(230));}
gg.computeVertexNormals();
const col=new THREE.Color(BS_C[bi%BS_C.length]);
relG.add(new THREE.Mesh(gg,new THREE.MeshStandardMaterial({color:col,transparent:true,opacity:0.34,roughness:1,depthWrite:false})));
const epts=pts.map(([lo,la])=>new THREE.Vector3(XB(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(270),ZB(la)));
relG.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(epts),new THREE.LineBasicMaterial({color:0x1a1a1a,transparent:true,opacity:0.8})));
const nm=(f.properties.ba_name||"").replace(/\s*Basin\s*/gi,"")||f.properties.bacode;
const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
bsObjs.push({n:nm,s:{position:new THREE.Vector3(XB(cx),yOf(Math.max(0,hAt(cx,cy)))+MZ(540),ZB(cy))}});
});
$("peakLbls").innerHTML+=bsObjs.map((p,i)=>`<span class="bsLbl" id="bsl${i}">${p.n}</span>`).join("");
}catch(e){console.warn("terrain basins",e);}_t3("basins");
const X=lon=>(lon-(TB.lon0+TB.lon1)/2)/(TB.lon1-TB.lon0)*W;
const Z=lat=>-((lat-(TB.lat0+TB.lat1)/2)/(TB.lat1-TB.lat0))*D;
const draped=[],riverObjs=[];
const IND_MAJ=new Set(["ganges","brahmaputra","indus","yamuna","godavari","krishna","cauvery","kolidam","narmada","tapi","mahana nadi","mahanadi","ghaghara","gandak","kosi","chambal","son","brahmani","chenab","sutlej","beas","ravi","jhelum","penner","tungabhadra","tista","mahi","palar","luhit","dihang","betwa","wainganga","bhima","indravati","banas","sankh","tel","sapt","parbati"]);
const nmN=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
try{
const rv=await getJSON("data/india-rivers.geo.json","rivers");
const rmat=new THREE.LineBasicMaterial({color:0x38bdf8});
for(const f of rv.features){
if(!f.geometry)continue;
const lines=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
for(const ln of lines){const g=[];for(let i=0;i<ln.length;i+=2){const lo=ln[i][0],la=ln[i][1];if(lo<TB.lon0||lo>TB.lon1||la<TB.lat0||la>TB.lat1)continue;g.push(new THREE.Vector3(X(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(92),Z(la)));}if(g.length>1){const isMajor=(f.properties.scalerank??9)<=3||IND_MAJ.has(nmN(f.properties.name));const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(g),isMajor?new THREE.LineBasicMaterial({color:0x38bdf8}):rmat);relG.add(mesh);draped.push(g);let rec=riverObjs.find(r=>r.name===f.properties.name);if(!rec){rec={name:f.properties.name,meshes:[],mid:null};riverObjs.push(rec);}rec.meshes.push(mesh);if(isMajor&&!rec.mid)rec.mid=g[Math.floor(g.length/2)];}}
}
}catch(e){console.warn("terrain rivers",e);}_t3("riversNE");
/* v6.2 west-flowing rivers (Arabian-Sea side, from the CWC River_Network): real centre-lines
   the Natural Earth set lacks — Konkan/Goa/Karnataka/Kerala + Kutch/Saurashtra coast. Drawn as
   ONE LineSegments batch (hundreds of small rivers = 1 draw call) and appended to `draped` so
   dams gate on them and the flow packets run on them exactly like the other rivers. */
const neCount=draped.length;
let westDragged=0;
try{
const rw=await getJSON("data/india-rivers-west.geo.json","riversWest");
const segs=[];
for(const f of rw.features){
const lines=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
for(const ln of lines){
const g=[];
for(let i=0;i<ln.length;i++){const lo=ln[i][0],la=ln[i][1];if(lo<TB.lon0||lo>TB.lon1||la<TB.lat0||la>TB.lat1)continue;g.push(new THREE.Vector3(X(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(77),Z(la)));}
if(g.length>1){for(let i=1;i<g.length;i++){segs.push(g[i-1].x,g[i-1].y,g[i-1].z,g[i].x,g[i].y,g[i].z);}draped.push(g);westDragged++;}
}
}
if(segs.length){const gW2=new THREE.BufferGeometry();gW2.setAttribute("position",new THREE.Float32BufferAttribute(segs,3));relG.add(new THREE.LineSegments(gW2,new THREE.LineBasicMaterial({color:0x38bdf8,transparent:true,opacity:0.6})));}
}catch(e){console.warn("terrain west rivers",e);}_t3("riversWest");
t3Stats.west=westDragged;
const PEAKS=[["Everest 8849m",27.988,86.925],["Kanchenjunga 8586m",27.702,88.148],["Nanda Devi 7816m",30.375,79.969],["K2 8611m",35.88,76.51],["Nanga Parbat 8126m",35.24,74.59],["Anamudi 2695m",10.169,77.062]];
const pkMat=new THREE.MeshBasicMaterial({color:0xffffff});
const pkObjs=PEAKS.map(([n,la,lo])=>{const s=new THREE.Mesh(new THREE.SphereGeometry(1,10,10),pkMat);s.scale.setScalar(0.02);s.position.set(X(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(230),Z(la));relG.add(s);return{n,s};});
$("peakLbls").innerHTML=pkObjs.map((p,i)=>`<span class="${p.city?"ctLbl":"pkLbl"}" id="pkl${i}">${p.n}</span>`).join("");
/* cities for orientation on the relief */
const CITIES=[["Delhi",28.61,77.21],["Mumbai",19.08,72.88],["Kolkata",22.57,88.36],["Chennai",13.08,80.27],["Bengaluru",12.97,77.59],["Hyderabad",17.39,78.49],["Leh",34.15,77.58],["Guwahati",26.18,91.76]];
const ctMat=new THREE.MeshBasicMaterial({color:0xfbbf24});
const ctObjs=CITIES.map(([n,la,lo])=>{const s=new THREE.Mesh(new THREE.SphereGeometry(1,8,8),ctMat);s.scale.setScalar(0.016);s.position.set(X(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(190),Z(la));relG.add(s);return{n,s};});_t3("markers");
$("peakLbls").innerHTML+=ctObjs.map((p,i)=>`<span class="ctLbl" id="ctl${i}">${p.n}</span>`).join("");
/* v7.1: phenomena layers (3D) */
try{ if(window.__phen3d) await window.__phen3d.build({THREE,relG,X,Z,yOf,hAt,MZ}); }catch(e){console.warn("phen3d",e);} _t3("phen3d");
_t3("preDams");
/* v7.0 DAMS — every CWC dam/barrage/weir in the bbox becomes an anatomy model at its real
   coordinates (all 13,002 of them). Class from the CWC `type` column; height = the real CWC
   height where the row has one, else the class median (illustrative). Cross-sections follow
   real construction: earth 1V:2.5H upstream / 1V:2H downstream with a wide crest, rockfill
   1V:1.5H both faces, CFRD a concrete slab upstream + rockfill downstream, concrete/masonry
   gravity near-vertical upstream with a stepped downstream face; Idukki bows upstream as its
   arch type dictates. The dam is exactly as long as the gap it closes: stations walk the axis
   until the ground reaches crest level, so abutments die into the hillsides (30 km cap).
   Axis = nearest draped-river tangent (≤4 km) else the DEM gradient — every wall lies across
   its valley, none float. Reservoir level = crest − freeboard (12% of height, 1.5–15 m); the
   terrain itself carves the shoreline. The 240 longest lakes are month-animated meshes; all
   others merge into one static batch. Where the shapefile is silent the model is illustrative. */
const resMeshes=[],relGates=[],damHover=[],heroGl=[];let glintMat=null;   /* v7.3: damHover = hover-label candidates (top-300 recorded heights); v7.4: heroGl = spillway-glint anchors */
const resMat=new THREE.MeshBasicMaterial({color:0x2dd4bf,transparent:true,opacity:0.8,side:THREE.DoubleSide});
try{
const dm3=await getJSON("data/dams.geo.json","dams");
const dl=dm3.features.filter(f=>{const c=f.geometry&&f.geometry.coordinates;return c&&c[0]>=TB.lon0&&c[0]<=TB.lon1&&c[1]>=TB.lat0&&c[1]<=TB.lat1;});
/* xz grid of river tangent samples (draped polylines): dam-axis orientation (≤4 km radius)
   and the release gates (≤50 km — v6.1 semantics kept) */
const CELL=0.1,RG=new Map();
for(let gi=0;gi<draped.length;gi++){const g=draped[gi];for(let i=0;i<g.length-1;i++){const a=g[i],b=g[i+1];const tx=b.x-a.x,tz=b.z-a.z;const lr=Math.hypot(tx,tz);if(lr<1e-6)continue;const kk=Math.floor(a.x/CELL)+":"+Math.floor(a.z/CELL);let r=RG.get(kk);if(!r)RG.set(kk,r=[]);r.push(a.x,a.z,tx/lr,tz/lr,gi,i);}}
const nearRiver=(x,z,bd)=>{let best=null;const gx=Math.floor(x/CELL),gz=Math.floor(z/CELL);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const r=RG.get((gx+dx)+":"+(gz+dz));if(!r)continue;for(let i=0;i<r.length;i+=6){const ddx=r[i]-x,ddz=r[i+1]-z,d2=ddx*ddx+ddz*ddz;if(d2<bd){bd=d2;best=[r[i+2],r[i+3],r[i+4],r[i+5]];}}}return best;};
const dLonPerW=(TB.lon1-TB.lon0)/W,dLatPerW=(TB.lat1-TB.lat0)/D;
const terrAt=(lon,lat)=>yOf(Math.max(0,hAt(lon,lat)));
/* class-median heights (m) for the 6,669 rows without a height value — illustrative */
const H_MED={earth:16.5,rock:19.5,cfrd:31.7,conc:90,arch:168.9};
const MB={eu:[],ed:[],ru:[],rd:[],cm:[],cr:[]};   /* 6 merged batches = ~6 draw calls */
const lakes=[];let nRes=0,nWall=0,nHero=0,nTri=0;
const tri=(b,p0,p1,p2)=>{b.push(p0[0],p0[1],p0[2],p1[0],p1[1],p1[2],p2[0],p2[1],p2[2]);nTri++;};
const obox=(b,cx0,cy0,cz0,fx,fz,ha,ht,hy)=>{/* v7.4: box aligned to the dam axis (f); vertex ring matches the old axis-aligned layout when fx=1,fz=0 */const gx=-fz,gz=fx,P=[[-1,-1],[1,-1],[1,1],[-1,1]],v=[];for(let u2=0;u2<2;u2++)for(const p of P)v.push([cx0+fx*ha*p[0]+gx*ht*p[1],cy0+hy*u2,cz0+fz*ha*p[0]+gz*ht*p[1]]);const F=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];for(const fc of F)tri(b,v[fc[0]],v[fc[1]],v[fc[2]]);};
/* v7.3: hover-label set — the same top-300 recorded-height tier as the 2D dam labels (ranked) */
const hovSet=new Set(dl.filter(f=>(f.properties.height||0)>0).sort((a,b)=>b.properties.height-a.properties.height).slice(0,300));
dl.forEach(f=>{
const c=f.geometry.coordinates,lo=c[0],la=c[1];
if(!isFinite(lo)||!isFinite(la))return;
const nm=(f.properties.name||"").toUpperCase(),tp=(f.properties.type||"").toUpperCase();
let cls;
if(nm.indexOf("CHERUTHONI")>=0)cls="conc";
else if(nm.indexOf("IDUKKI")>=0)cls="arch";
else if(tp.indexOf("CFRD")>=0)cls="cfrd";
else if(tp.indexOf("ROCKFILL")>=0)cls="rock";
else if(tp.indexOf("EARTHEN")>=0||tp.indexOf("EARTHFILL")>=0||tp.indexOf("ZONED")>=0||tp.indexOf("HOMOGENEOUS")>=0)cls="earth";
else if(tp.indexOf("GRAVITY")>=0||tp.indexOf("MASONRY")>=0||tp.indexOf("PG")>=0)cls="conc";
else cls=((f.properties.height)||0)>=80?"conc":"earth";
const hm=(f.properties.height>0)?f.properties.height:H_MED[cls];
const HU=hm*UPM;
const x0=X(lo),z0=Z(la),gy=terrAt(lo,la);
if(hovSet.has(f))damHover.push({x:x0,y:gy+HU,z:z0,n:f.properties.name,h:f.properties.height,s:f.properties.state||"",r:f.properties.river||""});
/* upstream = the higher side: nearest river tangent (≤4 km) else the DEM gradient */
let ux=0,uz=1;
const rv=nearRiver(x0,z0,1.6e-5);
if(rv){let fx=rv[0],fz=rv[1];const dh=0.0015;
const hP=terrAt(lo+fx*dh*dLonPerW,la-fz*dh*dLatPerW),hM=terrAt(lo-fx*dh*dLonPerW,la+fz*dh*dLatPerW);
if(hP<hM){fx=-fx;fz=-fz;}
ux=fx;uz=fz;}
else{const e=0.0012,dE=e*dLonPerW,dN=e*dLatPerW;
const gx=terrAt(lo+dE,la)-terrAt(lo-dE,la),gz=terrAt(lo,la-dN)-terrAt(lo,la+dN);
const gm=Math.hypot(gx,gz);
if(gm>1e-12){ux=gx/gm;uz=gz/gm;}
else{ux=0;uz=1;}}
const ax=-uz,az=ux;                                          /* the dam axis, across the valley */
const crest=gy+HU;
const STEP=0.0006,SMAX=0.03,TOL=1e-6;
const reach=sg=>{let s=STEP;for(;s<=SMAX;s+=STEP){const lon2=lo+ax*s*sg*dLonPerW,lat2=la-az*s*sg*dLatPerW;if(terrAt(lon2,lat2)>=crest-TOL)break;}return Math.min(s,SMAX);};
const sL=reach(-1),sR=reach(1),span=sL+sR;
const J=Math.max(3,Math.min(8,Math.round(span/0.004)+2));
const wcp=((cls==="conc"||cls==="arch")?3:4)*UPM;           /* crest half-width: 6 m / 8 m */
const su=cls==="earth"?2.5:cls==="rock"?1.5:cls==="cfrd"?1.4:0.08;
const sd=cls==="earth"?2.0:cls==="rock"?1.5:cls==="cfrd"?1.4:0.75;
const bU=(cls==="earth")?MB.eu:(cls==="rock")?MB.ru:MB.cm;   /* upstream-face material */
const bD=(cls==="earth")?MB.ed:(cls==="rock")?MB.rd:(cls==="cfrd")?MB.rd:MB.cm;
const st=[];
for(let j=0;j<=J;j++){
const t=j/J,s=-sL+span*t;
let cx=x0+ax*s,cz=z0+az*s;
if(cls==="arch"){const bw=0.18*span*(1-Math.pow(2*t-1,2));cx+=ux*bw;cz+=uz*bw;}
const g=terrAt(lo+ax*s*dLonPerW,la-az*s*dLatPerW);
st.push({cx:cx,cz:cz,g:g,hL:Math.max(0,crest-g)});
}
for(let j=0;j<J;j++){
const A=st[j],B2=st[j+1];
const toUA=[A.cx+ux*su*A.hL,A.g,A.cz+uz*su*A.hL],toUB=[B2.cx+ux*su*B2.hL,B2.g,B2.cz+uz*su*B2.hL];
const toDA=[A.cx-ux*sd*A.hL,A.g,A.cz-uz*sd*A.hL],toDB=[B2.cx-ux*sd*B2.hL,B2.g,B2.cz-uz*sd*B2.hL];
const crUA=[A.cx+ux*wcp,crest,A.cz+uz*wcp],crDA=[A.cx-ux*wcp,crest,A.cz-uz*wcp];
const crUB=[B2.cx+ux*wcp,crest,B2.cz+uz*wcp],crDB=[B2.cx-ux*wcp,crest,B2.cz-uz*wcp];
tri(bU,toUA,crUB,toUB);tri(bU,toUA,crUA,crUB);               /* upstream face */
if(cls==="conc"||cls==="arch"){                              /* gravity: steep, stepped downstream */
const sa=[A.cx-ux*0.45*sd*A.hL,crest-0.45*A.hL,A.cz-uz*0.45*sd*A.hL];
const sb=[B2.cx-ux*0.45*sd*B2.hL,crest-0.45*B2.hL,B2.cz-uz*0.45*sd*B2.hL];
tri(bD,crDA,crDB,sb);tri(bD,crDA,sb,sa);
tri(bD,sa,sb,toDB);tri(bD,sa,toDB,toDA);
}else{tri(bD,crDA,crDB,toDB);tri(bD,crDA,toDB,toDA);}
tri(MB.cr,crUA,crDA,crDB);tri(MB.cr,crUA,crDB,crUB);         /* lit crest */
if(j===0){const P0=toUA,P1=crUA,P2=crDA,P3=toDA;tri(bD,P0,P2,P1);tri(bD,P0,P3,P2);}
if(j===J-1){const P0=toUB,P1=crUB,P2=crDB,P3=toDB;tri(bD,P0,P1,P2);tri(bD,P0,P2,P3);}
}
nWall++;
/* hero extras (h ≥ 100 m concrete/arch): three crest piers hint the spillway */
if((cls==="conc"||cls==="arch")&&hm>=100){nHero++;
/* v7.4 fix: ha was missing ×UPM — `Math.max(4,…)` built 4-unit (≈3,800 km) slabs; now 8–48 m wide crest piers */
const ha=Math.max(4*UPM,Math.min(24*UPM,span*0.012)),ht=5*UPM,hy=7*UPM;
[-0.12,0,0.12].forEach(fr=>{const s=span*fr;obox(MB.cm,x0+ax*s,crest,z0+az*s,ax,az,ha,ht,hy);});
heroGl.push([x0,crest,z0,Math.max(0.00025,Math.min(0.0008,span*0.3))]);   /* v7.4: glint anchor = centre pier */
}
/* reservoir: water level = crest − freeboard; walk upstream until the valley closes, then
   fit the lens to the real shoreline at every station (the terrain carves it — nothing floats) */
const fb=Math.min(15,Math.max(1.5,0.12*hm))*UPM;
const wy=crest-fb;
let Lw=0,closed=false;const ts=[];
for(let t=0.0016;t<=0.025;t+=0.0016){const lon2=lo+ux*t*dLonPerW,lat2=la-uz*t*dLatPerW;if(terrAt(lon2,lat2)>=wy){closed=true;break;}ts.push(t);Lw=t;}
if(closed&&ts.length>=3&&Lw>=0.003){
const wid=[];
for(let i=0;i<ts.length;i++){
const t=ts[i],lon2=lo+ux*t*dLonPerW,lat2=la-uz*t*dLatPerW;let hw=0.0006;
for(;hw<=0.012;hw+=0.0006){const o1=terrAt(lon2+ax*hw*dLonPerW,lat2-az*hw*dLatPerW),o2=terrAt(lon2-ax*hw*dLonPerW,lat2+az*hw*dLatPerW);if(o1>=wy||o2>=wy)break;}
wid.push(Math.min(hw,0.012));
}
const lv=[];
for(let i=0;i<ts.length-1;i++){
const ta=ts[i],tb=ts[i+1],wa=wid[i],wb=wid[i+1];
const xa=x0+ux*ta,za=z0+uz*ta,xb=x0+ux*tb,zb=z0+uz*tb;
const A=[xa+ax*wa,wy,za+az*wa],Bv=[xa-ax*wa,wy,za-az*wa],Cv=[xb-ax*wb,wy,zb-az*wb],Dv=[xb+ax*wb,wy,zb+az*wb];
tri(lv,A,Cv,Bv);tri(lv,A,Dv,Cv);
}
if(lv.length){lakes.push({v:lv,Lw:Lw,x:x0,z:z0,wy:wy,hm:hm});nRes++;}
}
/* v6.1 gate: nearest draped-river vertex within ~0.05 u, stored as ORIENTED param t
   (packets with u>t are downstream of this dam and follow its release) */
const gt=nearRiver(x0,z0,0.0025);
if(gt){const gg=draped[gt[2]],tt=gg.length>1?gt[3]/(gg.length-1):0;relGates.push({gi:gt[2],t:gg[gg.length-1].y>gg[0].y?1-tt:tt});}
});
_t3("damLoop");
/* lakes: the 240 longest become month-animated meshes; all the rest merge into ONE static batch */
lakes.sort((a,b2)=>b2.Lw-a.Lw);
const stat=[];
for(let i=0;i<lakes.length;i++){const L=lakes[i];
if(i<240){const gL=new THREE.BufferGeometry();gL.setAttribute("position",new THREE.Float32BufferAttribute(L.v,3));const mL=new THREE.Mesh(gL,resMat);mL.matrixAutoUpdate=false;relG.add(mL);resMeshes.push({m:mL,px:L.x,py:L.wy,pz:L.z,hm:L.hm});}
else for(let k2=0;k2<L.v.length;k2++)stat.push(L.v[k2]);
}
if(stat.length){const gS=new THREE.BufferGeometry();gS.setAttribute("position",new THREE.Float32BufferAttribute(stat,3));relG.add(new THREE.Mesh(gS,resMat));}
const addB=(v,col,ro)=>{if(!v.length)return;const gB=new THREE.BufferGeometry();gB.setAttribute("position",new THREE.Float32BufferAttribute(v,3));gB.computeVertexNormals();relG.add(new THREE.Mesh(gB,new THREE.MeshStandardMaterial({color:col,roughness:ro,metalness:0.05})));};
addB(MB.eu,0x6f6a60,0.95);addB(MB.ed,0x6f8058,1.0);addB(MB.ru,0x63686d,0.85);addB(MB.rd,0x7a8086,0.9);addB(MB.cm,0x999fa5,0.62);addB(MB.cr,0xd9dcdf,0.7);_t3("damBuild");
t3Stats.walls=nWall;t3Stats.reservoirs=nRes;t3Stats.gates=relGates.length;t3Stats.tris=nTri;t3Stats.animLakes=Math.min(240,lakes.length);t3Stats.heroes=nHero;
}catch(e){console.warn("terrain dams",e);}
/* v7.4: soft spillway glint — one additive billboard per hero dam, over the centre pier (illustrative).
   Sprites sit at SCENE level so billboarding isn't squashed by relG's vertical exaggeration; their
   y is re-applied per frame as (crest+3 m)×REL, and opacity pulses in the loop (fixed under RM). */
{
const gcv=document.createElement("canvas");gcv.width=gcv.height=64;
const gcx=gcv.getContext("2d"),grg=gcx.createRadialGradient(32,32,2,32,32,30);
grg.addColorStop(0,"rgba(255,246,218,0.95)");grg.addColorStop(0.45,"rgba(255,240,200,0.32)");grg.addColorStop(1,"rgba(255,240,200,0)");
gcx.fillStyle=grg;gcx.fillRect(0,0,64,64);
glintMat=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(gcv),transparent:true,opacity:0.18,blending:THREE.AdditiveBlending,depthWrite:false});
heroGl.forEach(g=>{const sp=new THREE.Sprite(glintMat);sp.scale.set(g[3],g[3],1);sp.position.set(g[0],(g[1]+MZ(3))*REL,g[2]);scene.add(sp);g[4]=sp;});
_t3("glint");
}
/* v6.1 hydro (illustrative, month-typical — NOT measured): river flow follows the rainfall
   month (rf=(arabian+bay)/200); reservoir level follows a monsoon fill curve (fills Jun–Sep,
   peaks late Sep/Oct, trough May, fillOf); reaches downstream of a dam follow that dam's
   release (relOf: spills when full, regulated lean release in the dry season). */
const cd12=(a,b)=>{const d=Math.abs(a-b);return Math.min(d,12-d);};
const fillOf=m=>0.28+0.72*Math.exp(-Math.pow(cd12(m,9.5)/2.3,2));
const relOf=m=>0.55+0.85*Math.pow(fillOf(m),3);
let hydroM=0,hydroF=1,hydroR=1,hydroRF=0.6;
const applyHydro=(m,force)=>{
if(!force&&m===hydroM)return;
hydroM=m;hydroF=fillOf(m);hydroR=relOf(m);
const md=monthByNum(m);hydroRF=md?Math.max(0.12,Math.min(1,(md.arabian+md.bay)/200)):0.6;
const s=0.35+0.65*hydroF,M4=new THREE.Matrix4(),S4=new THREE.Matrix4();
/* v7.0: shoreline-fitted lakes shrink toward the dam AND drop with drawdown —
   22% of dam height when the reservoir is empty (real metres, illustrative curve) */
resMeshes.forEach(r=>{const dr=r.hm?r.hm*0.22*(1-hydroF)*UPM:0;M4.makeTranslation(r.px,r.py-dr,r.pz);S4.makeScale(s,1,s);M4.multiply(S4);S4.makeTranslation(-r.px,-r.py,-r.pz);M4.multiply(S4);r.m.matrix.copy(M4);r.m.matrixWorldNeedsUpdate=true;});
resMat.opacity=0.45+0.42*hydroF;
pktPts.material.opacity=0.45+0.5*hydroRF;
const vd=md?vecFor(md):curVec;
wxVec={x:vd.vx,z:vd.vy};
wxRN=Math.round((36+330*hydroRF)*(RM?0.5:1));if(wxRDrop)wxRDrop.fill(null);   /* v7.2: reseed from per-state averages */
wxWN=Math.round(22+115*Math.min(1.25,Math.hypot(vd.vx,vd.vy)));
};
/* named river labels + tap-to-trace list */
const lblRivers=riverObjs.filter(r=>r.mid);
const PRIO=["ganges","brahmaputra","indus","yamuna","godavari","krishna","cauvery","kolidam","narmada","tapi","mahana nadi","mahanadi","ghaghara","gandak","kosi","chambal","son","brahmani","chenab","sutlej","beas","ravi","jhelum","penner","tungabhadra","tista","mahi","palar","luhit","dihang","betwa","wainganga","bhima","indravati","banas","sankh","tel","sapt","parbati"];
const rn2=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const pi=n=>{const i=PRIO.indexOf(n);return i<0?99:i;};
lblRivers.sort((a,b)=>pi(rn2(a.name))-pi(rn2(b.name)));
$("peakLbls").innerHTML+=lblRivers.map((r,i)=>{r.li=i;return `<span class="rvLbl" id="rvl${i}">${r.name}</span>`;}).join("");
$("riverListItems").innerHTML=lblRivers.map(r=>`<button class="rlBtn" data-r="${String(r.name).replace(/"/g,"")}">${r.name}</button>`).join("");
document.querySelectorAll(".rlBtn").forEach(b=>b.addEventListener("click",()=>{
const rec=riverObjs.find(r=>r.name===b.dataset.r);if(!rec)return;
riverObjs.forEach(r=>r.meshes.forEach(m=>{try{m.material.color.setHex(0x38bdf8);}catch(_){}}));
rec.meshes.forEach(m=>{try{m.material.color.setHex(0xffffff);}catch(_){}});
if(window.__riverLbl)window.__riverLbl(rec);
clearTimeout(window.__riverT);window.__riverT=setTimeout(()=>rec.meshes.forEach(m=>{try{m.material.color.setHex(0x38bdf8);}catch(_){}}),3500);
}));
window.__riverLbl=rec=>{const el=document.getElementById("rvl"+rec.li);if(!el)return;el.style.color="#fff";el.style.fontSize="13px";clearTimeout(window.__riverLT);window.__riverLT=setTimeout(()=>{el.style.color="";el.style.fontSize="";},3500);};
/* living flow packets: oriented source→sea by elevation; per-packet speed follows the
   rainfall month, packets downstream of a dam follow that dam's release (v6.1) */
function orientSrc(g){return g[g.length-1].y>g[0].y?[...g].reverse():g;}
const pktAsn=[];
{let tot=0,totW=0;const Ls=draped.map((g,gi)=>{let L=0;for(let i=1;i<g.length;i++)L+=g[i].distanceTo(g[i-1]);if(gi<neCount)tot+=L;else totW+=L;return L;});
/* v6.2: two budgets — the Natural Earth majors keep their 200-packet share; the west subset
   gets its own 150 so the new coast rivers actually have living flow instead of falling off
   the old single cap (features are pre-sorted longest-first in the file). */
let neUsed=0,wUsed=0;
draped.forEach((g,gi)=>{const og=orientSrc(g);const west=gi>=neCount;const n=Math.max(west?1:3,Math.round((west?150:200)*(Ls[gi]/((west?totW:tot)||1))));const gt=relGates.filter(x=>x.gi===gi).map(x=>x.t);
if(west){for(let k=0;k<n&&wUsed<150;k++,wUsed++)pktAsn.push({g:og,u:Math.random(),gates:gt});}
else{for(let k=0;k<n&&neUsed<200;k++,neUsed++)pktAsn.push({g:og,u:Math.random(),gates:gt});}});}
const pktN=pktAsn.length,pktPos=new Float32Array(Math.max(3,pktN)*3);
const pktGeo=new THREE.BufferGeometry();
pktGeo.setAttribute("position",new THREE.BufferAttribute(pktPos,3));
const pktPts=new THREE.Points(pktGeo,new THREE.PointsMaterial({color:0xffffff,size:0.035,transparent:true,opacity:0.95,sizeAttenuation:true}));
pktPts.frustumCulled=false;scene.add(pktPts);
/* v6.2 3D weather field (illustrative month-typical): rain streaks fall over the relief and
   wind streaks drift with the month's branch vector — both density-driven by the same
   months.json numbers as the 2D wind/rain (rf=(arabian+bay)/200, vecFor(d) direction). */
const wxRMax=400,wxWMax=150;
const wxRPos=new Float32Array(wxRMax*6),wxRDrop=new Array(wxRMax).fill(null);
const wxRGeo=new THREE.BufferGeometry();wxRGeo.setAttribute("position",new THREE.BufferAttribute(wxRPos,3));
const wxR=new THREE.LineSegments(wxRGeo,new THREE.LineBasicMaterial({color:0x7cc4e3,transparent:true,opacity:0.4,depthWrite:false}));
wxR.frustumCulled=false;scene.add(wxR);
const wxWPos=new Float32Array(wxWMax*6),wxWDrop=new Array(wxWMax).fill(null);
const wxWGeo=new THREE.BufferGeometry();wxWGeo.setAttribute("position",new THREE.BufferAttribute(wxWPos,3));
const wxW=new THREE.LineSegments(wxWGeo,new THREE.LineBasicMaterial({color:0x9fb4c7,transparent:true,opacity:0.24,depthWrite:false}));
wxW.frustumCulled=false;scene.add(wxW);
let wxRN=0,wxWN=0,wxVec={x:0,z:0};
const wxInvLon=x=>(x/W)*(TB.lon1-TB.lon0)+(TB.lon0+TB.lon1)/2;
const wxInvLat=z=>(TB.lat0+TB.lat1)/2-(z/D)*(TB.lat1-TB.lat0);
const wxFloor=(x,z)=>yOf(Math.max(0,hAt(wxInvLon(x),wxInvLat(z))))+MZ(90);
const wxResetR=i=>{/* v7.2: seed 3D raindrops from the per-state average pool (same weights as 2D,
   lat/lng -> terrain X/Z via the wxInvLon/wxInvLat inverse); uniform fallback without the pool */
const s=window.__rainSample?window.__rainSample():null;
if(s){const x=Math.max(-W*0.49,Math.min(W*0.49,(s[1]-(TB.lon0+TB.lon1)/2)/(TB.lon1-TB.lon0)*W));
const z=Math.max(-D*0.49,Math.min(D*0.49,((TB.lat0+TB.lat1)/2-s[0])/(TB.lat1-TB.lat0)*D));
wxRDrop[i]={x,z,y:(tgt.y+R*(0.15+0.40*Math.random()))/REL,w:s[2]};return;}
wxRDrop[i]={x:(Math.random()-0.5)*W*0.96,z:(Math.random()-0.5)*D*0.96,y:(tgt.y+R*(0.15+0.40*Math.random()))/REL,w:0.4};};
const wxResetW=i=>{wxWDrop[i]={x:(Math.random()-0.5)*W*0.94,z:(Math.random()-0.5)*D*0.94,y:MZ(1400+5200*Math.random())};};
const stepWx=dt=>{
if(wxRN>0){wxRGeo.setDrawRange(0,Math.min(wxRN,wxRMax)*2);
for(let i=0;i<wxRN&&i<wxRMax;i++){const d=wxRDrop[i]||(wxResetR(i),wxRDrop[i]);
d.y-=(R*(0.35+0.20*hydroRF)*(0.7+0.6*(d.w==null?0.4:d.w))/REL)*dt;if(d.y<wxFloor(d.x,d.z)){wxResetR(i);continue;}
const ln=Math.max(0.0006,0.0102*R)/REL;
const o=i*6;wxRPos[o]=d.x;wxRPos[o+1]=d.y;wxRPos[o+2]=d.z;wxRPos[o+3]=d.x+wxVec.x*ln*0.25;wxRPos[o+4]=d.y+ln;wxRPos[o+5]=d.z+wxVec.z*ln*0.25;}
wxRGeo.attributes.position.needsUpdate=true;}
if(wxWN>0){wxWGeo.setDrawRange(0,Math.min(wxWN,wxWMax)*2);
const hb=Math.max(1e-6,Math.hypot(wxVec.x,wxVec.z)),spd=R*(0.028+0.10*Math.min(1.3,hb))/REL;
for(let i=0;i<wxWN&&i<wxWMax;i++){const d=wxWDrop[i]||(wxResetW(i),wxWDrop[i]);
d.x+=wxVec.x*spd*dt;d.z+=wxVec.z*spd*dt;
if(d.x>W/2)d.x-=W*1.02;if(d.x<-W/2)d.x+=W*1.02;if(d.z>D/2)d.z-=D*1.02;if(d.z<-D/2)d.z+=D*1.02;
const lh=Math.max(0.0005,0.0125*R)/REL,lx=wxVec.x/hb*lh,lz=wxVec.z/hb*lh;const o=i*6;
wxWPos[o]=d.x-lx;wxWPos[o+1]=d.y;wxWPos[o+2]=d.z-lz;wxWPos[o+3]=d.x+lx;wxWPos[o+4]=d.y;wxWPos[o+5]=d.z+lz;}
wxWGeo.attributes.position.needsUpdate=true;}
};
applyHydro(INDWeather.month||7,true);   /* v6.1: seed flow + reservoir levels for the current month */
const cam=new THREE.PerspectiveCamera(42,2,0.1,50);
let th=0,ph=0.62,R=4.4,drag=false,px=0,py=0,lastW=0,spin=false,panDrag=false;   /* v7.0: spin OFF by default (user feedback) + pan state */
/* v6.0 deep zoom: movable orbit target (double-click a spot to fly to it; double-click empty sky
   resets home), exponential wheel zoom over R 12→0.01 (0.01 ≈ 10 km — the z6 DEM's honest floor),
   near plane scales with R so ultra-close views never clip. */
const tgt=new THREE.Vector3(0,0.0019,0),HOME=new THREE.Vector3(0,0.0019,0);   /* v7.0: orbit target at ≈1,900 m — the true mid-relief height (was 0.25 old units) */
let fly=null;
const startFly=(tt,tr)=>{fly={t0:performance.now(),ft:tgt.clone(),tt:tt.clone(),fr:R,tr};};
const cv3=$("terrain3d");
const fit=()=>{const w=cv3.clientWidth||cv3.parentElement.clientWidth;if(w===lastW)return;lastW=w;renderer.setSize(w,420,false);cam.aspect=w/420;cam.updateProjectionMatrix();};
cv3.addEventListener("pointerdown",e=>{fly=null;drag=true;panDrag=(e.button===1||e.button===2||e.shiftKey);px=e.clientX;py=e.clientY;try{cv3.setPointerCapture(e.pointerId);}catch(_){}});
cv3.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-px,dy=e.clientY-py;px=e.clientX;py=e.clientY;if(panDrag){const kp=0.0018*R;tgt.x+=kp*(Math.cos(th)*dx+Math.sin(th)*dy);tgt.z+=kp*(-Math.sin(th)*dx+Math.cos(th)*dy);}else{th+=dx*0.008;ph=Math.max(0.25,Math.min(1.25,ph-dy*0.006));}});
addEventListener("pointerup",()=>{drag=false;panDrag=false;});
cv3.addEventListener("contextmenu",e=>e.preventDefault());
cv3.addEventListener("wheel",e=>{e.preventDefault();fly=null;R=Math.max(0.01,Math.min(12,R*Math.exp(e.deltaY*0.003)));},{passive:false});
const ray=new THREE.Raycaster();
cv3.addEventListener("dblclick",e=>{const r=cv3.getBoundingClientRect();ray.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},cam);const hit=ray.intersectObject(tMesh)[0];hit?startFly(hit.point,Math.max(0.01,R*0.35)):startFly(HOME,4.4);});
/* v7.0 HUD: spin (default OFF), relief-exaggeration chips ×1…×100 (×1 = true 1:1), home */
const setRel=r=>{r=Math.max(1,r);const kr=r/REL;REL=r;relG.scale.y=r;tgt.y*=kr;HOME.y*=kr;const b=$("t3rel");if(b)b.textContent=r===1?"×1 relief · true":"×"+r+" relief";};
const setSpin=v=>{spin=v;const b=$("t3spin");if(b)b.textContent=v?"⟳ spin: on":"⟳ spin: off";};
if($("t3rel"))$("t3rel").addEventListener("click",()=>{const RELS=[1,5,20,100],i=RELS.indexOf(REL);setRel(RELS[(i+1)%RELS.length]);});
if($("t3spin"))$("t3spin").addEventListener("click",()=>setSpin(!spin));
if($("t3home"))$("t3home").addEventListener("click",()=>startFly(HOME,4.4));
const proj=new THREE.Vector3();let tmLast=performance.now()/1000;
(function loop(){
requestAnimationFrame(loop);
if(!terrainOn||document.hidden)return;
if(spin&&!drag&&!RM&&!fly)th+=0.0012*Math.min(1,R/2.6);   /* v7.0: auto-rotation OFF by default — the ⟳ chip turns it on */
if(fly){const k=Math.min(1,(performance.now()-fly.t0)/600),e=k*k*(3-2*k);tgt.lerpVectors(fly.ft,fly.tt,e);R=fly.fr+(fly.tr-fly.fr)*e;if(k>=1)fly=null;}
const nNear=Math.max(2e-5,R*0.02);if(Math.abs(cam.near-nNear)>nNear*0.05){cam.near=nNear;cam.updateProjectionMatrix();}   /* v7.4: floor 2e-5 (was 0.002) — the old floor sat AT/above the orbit target once R<0.1, clipping crest-level detail (piers/glint) in front of it */
cam.position.set(tgt.x+R*Math.sin(ph)*Math.sin(th),tgt.y+R*Math.cos(ph),tgt.z+R*Math.sin(ph)*Math.cos(th));
const mNow=INDWeather.month||7;
applyHydro(mNow);                                            /* v6.1: flow + reservoir levels follow the month (no-op unless changed) */
const tw=performance.now()/1000,dtS=Math.min(0.1,tw-tmLast||0.016);tmLast=tw;
const vF=(0.02+0.11*hydroRF)*dtS;
stepWx(dtS);
try{if(window.__phen3d)window.__phen3d.step(dtS);}catch(_){}          /* v7.1: phenomena motion */                                                 /* v6.2: rain + wind streaks follow the month */
for(let i=0;i<pktN;i++){const P=pktAsn[i];if(!P)continue;const g=P.g;let k=1,gN=0;const gt=P.gates;for(let j=0;j<gt.length;j++)if(P.u>gt[j])gN++;if(gN)k=hydroR;P.u=(P.u+vF*k)%1;const s=P.u*(g.length-1),i0=Math.floor(s),fr=s-i0,a=g[i0],b=g[Math.min(g.length-1,i0+1)];pktPos[i*3]=a.x+(b.x-a.x)*fr;pktPos[i*3+1]=a.y+(b.y-a.y)*fr+MZ(62);pktPos[i*3+2]=a.z+(b.z-a.z)*fr;}
pktGeo.attributes.position.needsUpdate=true;
/* v7.0: markers & packets resize per frame — true scale at every zoom (radius-1 spheres,
   flat in Y so vertical exaggeration can't turn them into eggs) */
{const mr=Math.max(0.0005,0.0045*R);pkObjs.forEach(o=>o.s.scale.set(mr,mr/REL,mr));const mc=Math.max(0.0004,0.0037*R);ctObjs.forEach(o=>o.s.scale.set(mc,mc/REL,mc));pktPts.material.size=Math.max(0.0008,(0.0052+0.0072*hydroRF)*R);}
if(glintMat){glintMat.opacity=RM?0.18:0.18+0.08*Math.sin(tw*1.6);heroGl.forEach(g=>{if(g[4])g[4].position.y=(g[1]+MZ(3))*REL;});}   /* v7.4 spillway glint */
cam.lookAt(tgt);fit();renderer.render(scene,cam);
const w=cv3.clientWidth,h=420;
const tag=(arr,pre)=>arr.forEach((p,i)=>{proj.set(p.s.position.x,p.s.position.y*REL,p.s.position.z).project(cam);const el=document.getElementById(pre+i);if(!el)return;if(proj.z>1){el.style.display="none";return;}el.style.display="block";el.style.left=((proj.x*0.5+0.5)*w)+"px";el.style.top=((-proj.y*0.5+0.5)*h)+"px";el.style.marginTop=((i%3)*13)+"px";});
tag(pkObjs,"pkl");tag(ctObjs,"ctl");tag(bsObjs,"bsl");
if(typeof lblRivers!=="undefined")lblRivers.forEach((r)=>{proj.set(r.mid.x,r.mid.y*REL,r.mid.z).project(cam);const el=document.getElementById("rvl"+r.li);if(!el)return;if(proj.z>1){el.style.display="none";return;}el.style.display="block";el.style.left=((proj.x*0.5+0.5)*w)+"px";el.style.top=((-proj.y*0.5+0.5)*h)+"px";});
})();
window.__terrainMonth=d=>{
const m=d.m;
cap.textContent=((m>=6&&m<=9)?`${d.label}: monsoon — Himalayan snowmelt + rains swell the Ganga–Brahmaputra; Ghats force orographic rain (see windward tags).`:(m>=10&&m<=12)?`${d.label}: retreat — northern rivers recede; Kaveri peaks with the NE rains.`:(m<=2)?`${d.label}: winter — high Himalaya snowbound; lean river flows.`:`${d.label}: pre-monsoon — lean flows, first melt; peninsular rivers at their lowest.`)+" Relief vs Indian MSL datum; sea plane = 0 m — true scale at ×1 (1 unit ≈ 950 km E-W; relief chips exaggerate only the vertical). Every CWC dam is a modelled cross-section at its real coordinates (CWC heights where the file has one, class medians elsewhere — illustrative); reservoir shorelines are carved by the terrain. River flow, reservoir levels, rain and wind streaks follow the rainfall month + dam release (illustrative). Hover a major dam (top-300 recorded heights — same tier as the 2D labels) for its name, height, state and river: recorded CWC fields. Crest detail: concrete/arch dams ≥100 m carry spillway piers and a soft crest glint (illustrative); snow caps fade in from ≈4,400 m, fully white ≈5,700 m (schematic).";
};
window.__terrainMonth(monthByNum(INDWeather.month||7));
_t3("tail");t3Stats.phases=_t3p;
window.__t3={hAt,yOf,stats:t3Stats,view:()=>({R:+R.toFixed(4),near:+cam.near.toFixed(5),tgt:[+tgt.x.toFixed(4),+tgt.y.toFixed(6),+tgt.z.toFixed(4)],fly:!!fly}),nav:()=>({spin:spin,rel:REL,relScale:+relG.scale.y.toFixed(2),pan:panDrag}),setRel:setRel,setSpin:setSpin,hydro:()=>({m:hydroM,rf:+hydroRF.toFixed(3),fill:+hydroF.toFixed(3),rel:+hydroR.toFixed(3),scale:+(0.35+0.65*hydroF).toFixed(3),res0:resMeshes.length?+resMeshes[0].m.matrix.elements[0].toFixed(3):null,gates:relGates.length}),wx:()=>({m:hydroM,rf:+hydroRF.toFixed(3),rain:wxRN,wind:wxWN,vx:+wxVec.x.toFixed(2),vz:+wxVec.z.toFixed(2),pkt:pktN,west:draped.length-neCount}),colAt:h=>"#"+terrCol(h,new THREE.Color()).getHexString(),flyTo:(lo,la,r)=>startFly(new THREE.Vector3(X(lo),yOf(Math.max(0,hAt(lo,la)))*REL,Z(la)),r||0.004),glint:{n:heroGl.length,o:()=>glintMat?+glintMat.opacity.toFixed(3):null,at:i=>{const g=heroGl[i];return g?{x:+g[0].toFixed(5),y:+g[1].toFixed(6),z:+g[2].toFixed(5),s:+g[3].toFixed(6),py:g[4]?+g[4].position.y.toFixed(6):null}:null},sp:i=>heroGl[i]?heroGl[i][4]:null,mat:()=>glintMat}};
/* v7.3: dam hover labels — the top-300 recorded-height tier (same set as the 2D dam labels).
   Projection mirrors tag() exactly (y × REL, 420 px canvas); the label text is real CWC data. */
const damTip=document.createElement("div");damTip.id="damTip";damTip.style.display="none";
cv3.parentNode.appendChild(damTip);
const pickDam=(mx,my)=>{let best=null,bd=324;const cw=cv3.clientWidth;for(let i=0;i<damHover.length;i++){const d=damHover[i];proj.set(d.x,d.y*REL,d.z).project(cam);if(proj.z>1)continue;const dx=(proj.x*0.5+0.5)*cw-mx,dy=(-proj.y*0.5+0.5)*420-my,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;best=d;}}return best;};
const hideDamTip=()=>{damTip.style.display="none";};
cv3.addEventListener("pointermove",e=>{
if(!terrainOn||drag){hideDamTip();return;}
const cr=cv3.getBoundingClientRect(),wr=cv3.parentNode.getBoundingClientRect();
const d=pickDam(e.clientX-cr.left,e.clientY-cr.top);
if(!d){hideDamTip();return;}
damTip.innerHTML=`<b>${d.n}</b> · <span class="dh">ht ${d.h} m</span><br><span class="dms">${d.s?d.s+" · ":""}river ${d.r||"—"} · CWC recorded</span>`;
damTip.style.display="block";
damTip.style.left=(e.clientX-wr.left+14)+"px";damTip.style.top=(e.clientY-wr.top+10)+"px";
});
cv3.addEventListener("pointerleave",hideDamTip);
cv3.addEventListener("pointerdown",hideDamTip);
window.__t3.dams={n:()=>damHover.length,pick:(x,y)=>{const d=pickDam(x,y);return d?{n:d.n,h:d.h}:null;},at:i=>{const d=damHover[i];if(!d)return null;proj.set(d.x,d.y*REL,d.z).project(cam);return{n:d.n,h:d.h,px:(proj.x*0.5+0.5)*cv3.clientWidth,py:(-proj.y*0.5+0.5)*420,z:proj.z};},tip:()=>damTip.style.display==="none"?null:damTip.textContent};
}
async function setTerrainView(on){
const stage=document.querySelector("#map .stage");
if(on&&stage.classList.contains("map3d-on")){stage.classList.remove("map3d-on");if(window.__map3d)window.__map3d.setActive(false);if($("btn3dm"))$("btn3dm").textContent="3D map";}
terrainOn=on;
stage.classList.toggle("terrain-on",terrainOn);
$("btn3d").textContent=terrainOn?"2D map":"3D mountains";
if(terrainOn&&window.__applyLayers)window.__applyLayers();   /* refresh self-test: 2D hidden (3D on) */
if(terrainOn){if(window.__terrainMonth)window.__terrainMonth(monthByNum(INDWeather.month||7));if(!terrainBuilt&&!terrainBuilding){terrainBuilding=true;try{await buildTerrain();terrainBuilt=true;}catch(e){console.warn(e);terrainBuilding=false;$("terrainCap").textContent="3D needs network for elevation tiles — back to 2D.";terrainOn=false;stage.classList.remove("terrain-on");$("btn3d").textContent="3D mountains";}}}
else if(map){map.invalidateSize();setTimeout(()=>window.__applyLayers&&window.__applyLayers(),350);}
}
if($("btn3d"))$("btn3d").addEventListener("click",()=>setTerrainView(!terrainOn));
/* v7.5 third view: true-scale 3D map — MapLibre GL JS + OpenFreeMap vector tiles + Mapterhorn DEM
   + OSM buildings (all keyless). Mutually exclusive with the 3D-mountains view; MapLibre (map3d.js)
   loads lazily on first activation, and only the attribution obligation applies. */
if($("btn3dm"))$("btn3dm").addEventListener("click",async()=>{
const stage=document.querySelector("#map .stage"),cap=$("map3dCap");
if(!stage.classList.contains("map3d-on")){
if(terrainOn)await setTerrainView(false);
stage.classList.add("map3d-on");$("btn3dm").textContent="3D map…";if(cap)cap.textContent="";
if(window.__applyLayers)window.__applyLayers();   /* refresh self-test: 2D hidden (3D on) */
const ok=window.__map3d?await window.__map3d.setActive(true).catch(()=>false):false;
if(stage.classList.contains("map3d-on")){   /* guard: user may have toggled back off while loading */
if(!ok){stage.classList.remove("map3d-on");$("btn3dm").textContent="3D map";if(cap)cap.textContent="3D map needs network (OpenFreeMap tiles + Mapterhorn DEM) — staying on 2D.";}
else $("btn3dm").textContent="2D map";
}
}else{
stage.classList.remove("map3d-on");if(window.__map3d)window.__map3d.setActive(false);$("btn3dm").textContent="3D map";
if(map){map.invalidateSize();setTimeout(()=>window.__applyLayers&&window.__applyLayers(),350);}
}
});

/* ================= Fig6 CLIMATE CONDUCTOR (links every phenomenon) ================= */
function buildGraph(){
if(!MONTHS.length||!$("graphLines")||buildGraph.done)return;buildGraph.done=true;
const X=m=>70+(m-1)*(580/11),Y=v=>200-v*140;
const sw=MONTHS.map(d=>({m:d.m,v:(d.arabian+d.bay)/200}));
const ne=MONTHS.map(d=>({m:d.m,v:d.m===11?0.95:d.m===10?0.7:d.m===12?0.55:d.m===1?0.25:0.08}));
const hk=MONTHS.map(d=>({m:d.m,v:HEAT_K[d.m]}));
const ck=MONTHS.map(d=>({m:d.m,v:COLD_K[d.m]}));
const dm=MONTHS.map(d=>({m:d.m,v:IOD_SEASON[d.m]*0.8}));
const line=(pts,col,dash)=>`<polyline points="${pts.map(p=>X(p.m).toFixed(1)+","+Y(p.v).toFixed(1)).join(" ")}" fill="none" stroke="${col}" stroke-width="2.5"${dash?` stroke-dasharray="${dash}"`:""}/>`;
let h=line(sw,"#0F766E")+line(ne,"#6B7280")+line(hk,"#B45309")+line(ck,"#1D4ED8")+line(dm,"#9CA3AF","5 4");
for(let m=1;m<=12;m++)h+=`<text x="${X(m)}" y="218" font-size="9" text-anchor="middle" font-family="monospace" fill="#6B7280">${MONTHS[m-1].label}</text>`;
h+=`<g font-family="monospace" font-size="10"><circle cx="70" cy="18" r="4" fill="#0F766E"/><text x="78" y="22" fill="#1A1A1A">SW rain</text><circle cx="165" cy="18" r="4" fill="#6B7280"/><text x="173" y="22" fill="#1A1A1A">NE rain</text><circle cx="258" cy="18" r="4" fill="#B45309"/><text x="266" y="22" fill="#1A1A1A">Heat risk</text><circle cx="358" cy="18" r="4" fill="#1D4ED8"/><text x="366" y="22" fill="#1A1A1A">Cold risk</text><text x="458" y="22" fill="#6B7280">- - DMI typical</text></g>`;
h+=`<line id="graphCursor" x1="${X(7)}" y1="30" x2="${X(7)}" y2="205" stroke="#1A1A1A" stroke-width="2"/>`;
$("graphLines").innerHTML=h;
window.__graphBands=function(){
const host=$("graphLines");if(!host)return;
const oldB=document.getElementById("graphPhenBands");if(oldB&&oldB.parentNode)oldB.parentNode.removeChild(oldB);
let g='<g id="graphPhenBands" pointer-events="none">';
if(window.__phen)for(const it of PHEN.items){if(!PHEN.on.has(it.id))continue;
 for(const r of phenWinRuns(it.window)){const x1=Math.max(70,X(r[0])-26.4),x2=Math.min(650,X(r[1])+26.4);if(x2-x1<6)continue;
  g+=`<rect x="${x1.toFixed(1)}" y="60" width="${(x2-x1).toFixed(1)}" height="140" fill="${it.color}" opacity="0.07" rx="2"/>`;
  g+=`<text x="${(x1+3).toFixed(1)}" y="70" font-size="8" font-family="monospace" fill="${it.color}" opacity="0.9">${it.id}</text>`;}}
g+="</g>";host.insertAdjacentHTML("afterbegin",g);
};
try{window.__graphBands();}catch(_){}
window.__graphCursor=m=>{const c=$("graphCursor");if(c){c.setAttribute("x1",X(m));c.setAttribute("x2",X(m));}const d=monthByNum(m);if(d&&$("graphReadout"))$("graphReadout").textContent=`${d.label}: SW flow ${((d.arabian+d.bay)/2).toFixed(0)}% · NE bay ${d.bay}% · heat ${(HEAT_K[m]*100).toFixed(0)}% · cold ${(COLD_K[m]*100).toFixed(0)}% · DMI-typ ${d.dmiTyp} · MJO Ph${INDWeather.mjo} · rain-states ${(d.rainStates||[]).length}`;};
{const _gc=window.__graphCursor;window.__graphCursor=m=>{_gc(m);const d=monthByNum(m);if(d&&$("graphReadout")&&window.__phen){try{const act=PHEN.items.filter(x=>PHEN.on.has(x.id)&&(!(x.window||[]).length||x.window.indexOf(m)>=0)).map(x=>x.id);if(act.length)$("graphReadout").textContent+=" · ON "+act.join(",");}catch(_){}}}};
window.__graphCursor(INDWeather.month||7);
const svg=$("graphSvg");
const toMonth=e=>{const r=svg.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*720;return Math.max(1,Math.min(12,Math.round((x-70)/(580/11))+1));};
let drag=false;
svg.addEventListener("pointerdown",e=>{drag=true;try{svg.setPointerCapture(e.pointerId);}catch(_){}setMonth(toMonth(e));});
svg.addEventListener("pointermove",e=>{if(drag)setMonth(toMonth(e));});
svg.addEventListener("pointerup",()=>drag=false);
svg.style.touchAction="none";svg.style.cursor="ew-resize";
}

/* ================= Deck ================= */
Promise.all([getJSON("data/content.json","content"),getJSON("data/months.json","months").catch(()=>null),getJSON("data/radars.json","radars").catch(()=>null),getJSON("data/mjo.json","mjo").catch(()=>null)]).then(([d,mm,rr,mj])=>{
const cards=[...d.flashcards];
cards.push({q:"Why does the slider run JAN–DEC (not stop at SEP)?",a:"SEP ends SW monsoon; OCT reverses to NE monsoon (onset ~22 Oct), NOV peaks over TN/AP, DEC retreats. Full-year slider shows both monsoons.",s:"met_monograph.pdf p99; data/months.json"});
cards.push({q:"Which states get NE monsoon rain (Oct–Dec)?",a:"Tamil Nadu (~48% of its annual rain), Coastal AP, Rayalaseema, S Interior Karnataka, Kerala (+ Sri Lanka). NOV wettest (>300mm TN/CAP).",s:"met_monograph.pdf p10,37-39"});
cards.push({q:"MJO vs Indian rainfall?",a:"Ph1–3 enhance S-peninsula/NE rain; Ph4–5 suppress (~83% of breaks tied to strong MJO — Pai 2011). 30–60-day eastward pulse; onset-timing lever.",s:"web · Pai 2011; AGU 2018; data/mjo.json"});
cards.push({q:"IOD boxes (BOM)?",a:"West 10S–10N 50–70E; East 10S–0 90–108E. Sustained |DMI|≥0.4 = event (BOM).",s:"web · BOM/NOAA Oct 2026; 569-589.pdf p573"});
if(mm)cards.push({q:"Wind JAN vs JUL vs NOV?",a:`JAN: ${mm.months[0].wind}. JUL: ${mm.months[6].wind}. NOV: ${mm.months[10].wind}.`,s:"data/months.json · IMD"});
cards.push({q:"CHZ vs CCZ?",a:"CHZ: 15 states (PB→OD→TG +). CCZ: IMD box 72.5–82.5E × 20.5–35N, NDMA 17 states/UTs incl J&K/Ladakh.",s:"Cold_Heat_Waves.pdf p23–48"});
cards.push({q:"Which states get rain in NOV?",a:"Tamil Nadu, Coastal AP, Rayalaseema, S Karnataka, Kerala — teal on the map. Drag months to animate.",s:"met_monograph.pdf p37-39; data/months.json"});
cards.push({q:"Windward vs leeward (Western Ghats)?",a:"SW flow lifts on the windward west side: heavy rain Kerala/Konkan; leeward Deccan plateau sits in rain-shadow. Arrow size follows AS strength.",s:"swmonsoon_yprao.pdf Ch.10; map"});
cards.push({q:"IOD winds?",a:"pIOD: equatorial easterlies point west + SE trades off Sumatra; nIOD reverses both. Dashed streams inside the IOD boxes.",s:"569-589.pdf p571-577"});
cards.push({q:"How many dams and basins?",a:"25 CWC basins, 98 sub-basins, 13,002 dams/barrages/weirs from your shapefiles — all plotted. Click a basin for its sub-basins.",s:"user shapefiles; map"});
cards.push({q:"River origins to remember?",a:"Ganga–Gaumukh, Yamuna–Yamunotri, Brahmaputra–Tibet, Indus–Tibetan plateau, Godavari–Trimbakeshwar, Krishna–Mahabaleshwar, Kaveri–Talakaveri, Narmada–Amarkantak. Blue dots on map.",s:"web · NCERT; map"});
cards.push({q:"Landmark IOD years?",a:"pIOD 1961/82/91/94/97/2006/2019 (extreme 97, 2019); nIOD 1980/81/85/92/96/2016. Pick one in Fig2's dropdown.",s:"569-589.pdf p572-586; BOM/NOAA"});
if(rr)cards.push({q:"Doppler radar coverage?",a:`~48 operational; C/S-band 250 km, X-band 100 km (e.g. ${rr.stations[0].name}, ${rr.stations[17].name}).`,s:"web · PIB/MoES Oct 2026"});
const grid=$("flashGrid");let seen=new Set(JSON.parse(localStorage.getItem("indw-seen")||"[]"));
const prog=()=>$("deckProg").textContent=`${seen.size} / ${cards.length} seen`;
grid.innerHTML="";cards.forEach((c,i)=>{const el=document.createElement("div");el.className="flash"+(seen.has(i)?" open":"");el.tabIndex=0;el.setAttribute("role","button");el.innerHTML=`<div class="q">${i+1}. ${c.q}</div><div class="a">${c.a}</div><div class="s">${c.s}</div>`;const flip=()=>{el.classList.toggle("open");if(el.classList.contains("open"))seen.add(i);localStorage.setItem("indw-seen",JSON.stringify([...seen]));prog();};el.addEventListener("click",flip);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();flip();}});grid.appendChild(el);});prog();
const quiz=[...d.quiz,
{q:"NE monsoon onset climatology?",options:["22 Oct ±7d","15 Aug ±3d","1 Jun ±4d","10 Jan ±2d"],answer:0,s:"met_monograph.pdf p99"},
{q:"MJO break link?",options:["~83% breaks tied to strong MJO","MJO never affects breaks","Only winter fog","Only hail"],answer:0,s:"web · Pai 2011"},
{q:"CCZ box?",options:["72.5–82.5E × 20.5–35N","50–70E × 10S–10N","90–108E × 10S–0","60–90E × 0–20N"],answer:0,s:"Cold_Heat_Waves.pdf p23"},
{q:"BOM IOD event threshold?",options:["|DMI| ≥ 0.4 sustained","|DMI| ≥ 2.0 daily","Any hourly spike","No threshold"],answer:0,s:"web · BOM Oct 2026"}];
const box=$("quizQ");let qi=0,score=0;
(function ask(){if(qi>=quiz.length){box.innerHTML=`<p><b>Done — ${score}/${quiz.length}.</b> <button class="btn ghost" id="rq">Retry</button></p>`;$("rq").onclick=()=>{qi=0;score=0;ask();};return;}const q=quiz[qi];box.innerHTML=`<p><b>Q${qi+1}.</b> ${q.q}</p>`+q.options.map((o,i)=>`<button class="opt" data-i="${i}">${o}</button>`).join("")+`<div class="meta">${q.s}</div>`;box.querySelectorAll(".opt").forEach(b=>b.addEventListener("click",()=>{const ok=+b.dataset.i===q.answer;b.classList.add(ok?"correct":"wrong");if(ok)score++;setTimeout(()=>{qi++;ask();},ok?500:1100);}));})();
}).catch(()=>{$("flashGrid").innerHTML="<p>Could not load data/*.json — use a local server.</p>";});
})();

/* =====================================================================
   v7.1 PHENOMENA LAYERS — 41 climate phenomena as pickable layers.
   2D: Leaflet sub-groups on the map (fetch-only data/phenomena.json).
   3D: window.__phen3d, objects built inside buildTerrain (relG-parented).
   Geometry schematic "(illustrative)"; sources: CLIMATE_PHENOMENA_TODO.md.
   Debug: window.__phen (items/on/toggle/apply/month), __phen3d.info().
   ===================================================================== */
function ptInPoly(p,poly){const x=p[1],y=p[0];let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][1],yi=poly[i][0],xj=poly[j][1],yj=poly[j][0];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
function phenPolyOf(it){return it.geo.polys?it.geo.polys:(it.geo.poly?[it.geo.poly]:[]);}
function phenPopup(it){return `<b>${it.id} · ${it.name}</b><br>${it.info}<br><i>${it.src} · (illustrative)</i>`;}
function phenCum(pts){const c=[0];let t=0;for(let i=1;i<pts.length;i++){t+=Math.hypot(pts[i][1]-pts[i-1][1],pts[i][0]-pts[i-1][0]);c.push(t);}c.total=t||1;return c;}
function phenPtAt(pts,cum,frac){const tt=frac*cum.total;let i=1;while(i<cum.length-1&&cum[i]<tt)i++;const a=cum[i-1],b=cum[i]||a+1e-9,f=(tt-a)/(b-a);return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*f,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*f];}
function phenIdxAt(pts,idx){const i0=Math.max(0,Math.min(pts.length-1,Math.floor(idx))),i1=Math.min(pts.length-1,i0+1),f=idx-i0;return [pts[i0][0]+(pts[i1][0]-pts[i0][0])*f,pts[i0][1]+(pts[i1][1]-pts[i0][1])*f];}

const PHEN={items:[],on:new Set(),g2:null,loaded:false,env:{map:null,rm:false,m:7}};
window.__phen={items:PHEN.items,on:PHEN.on,loaded:false,toggle:null,apply:null,month:null};

const PHEN_MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function phenWinRuns(w){w=(w||[]).slice().sort((a,b)=>a-b);if(!w.length)return [[1,12]];
 const runs=[];let a=w[0],p=w[0];
 for(let i=1;i<=w.length;i++){const c=w[i];if(c===p+1){p=c;continue;}runs.push([a,p]);a=c;p=c;}
 return runs;}
function phenWinText(w){const runs=phenWinRuns(w);
 if(!(w&&w.length))return "all year";
 if(runs.length>1&&runs[0][0]===1&&runs[runs.length-1][1]===12){const fr=runs.shift(),lr=runs.pop();runs.push([lr[0],fr[1]]);}
 return runs.map(s=>s[0]===s[1]?PHEN_MON[s[0]-1]:PHEN_MON[s[0]-1]+"–"+PHEN_MON[s[1]-1]).join(", ");}
function phenAnchorOf(it){const g=it.geo||{};
 if(g.pts&&g.pts.length)return [g.pts[0].la,g.pts[0].lo];
 if(g.boxes&&g.boxes.length){const b0=g.boxes[0];return [(b0[0]+b0[2])/2,(b0[1]+b0[3])/2];}
 if(it.labelAt)return it.labelAt;
 if(g.line&&g.line.length)return g.line[Math.floor(g.line.length/2)];
 const P=phenPolyOf(it),p0=P&&P[0];
 if(p0&&p0.length){let la=0,lo=0;for(const p of p0){la+=p[0]/p0.length;lo+=p[1]/p0.length;}return [la,lo];}
 return [15,80];}
function phenArrowDeg(a,b){const dN=b[0]-a[0],dE=(b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360);return Math.atan2(-dN,dE)*180/Math.PI;}

function phenBuild2(){
for(const it of PHEN.items){
 const st={group:L.layerGroup(),paths:[],dots:[],mover:null,rings:[],cum:null};
 const bind=l=>{l.bindPopup(phenPopup(it));return l;};
 const reg=l=>{st.paths.push(l);st.group.addLayer(l);return l;};
 if(it.kind==="region"){
  for(const poly of phenPolyOf(it))reg(bind(L.polygon(poly,{color:it.color,weight:2.2,opacity:1,fillColor:it.color,fillOpacity:.22,interactive:true})));
  if(it.geo.dot&&it.geo.poly){const poly=it.geo.poly;let mn=[1e9,1e9],mx=[-1e9,-1e9];for(const p of poly){mn[0]=Math.min(mn[0],p[0]);mn[1]=Math.min(mn[1],p[1]);mx[0]=Math.max(mx[0],p[0]);mx[1]=Math.max(mx[1],p[1]);}
   for(let la=mn[0];la<=mx[0];la+=1.15)for(let lo=mn[1];lo<=mx[1];lo+=1.15){if(!ptInPoly([la,lo],poly))continue;const d=L.circleMarker([la,lo],{radius:3,stroke:false,fillColor:it.color,fillOpacity:.95,interactive:false,className:"phenDot"});st.dots.push(d);st.group.addLayer(d);}}
 }else if(it.kind==="band"){
  reg(bind(L.polyline(it.geo.line,{color:it.color,weight:2.6,opacity:1,dashArray:"6 7",className:"phenDash",interactive:true})));
 }else if(it.kind==="track"){
  reg(bind(L.polyline(it.geo.line,{color:it.color,weight:2.4,opacity:.9,interactive:true})));
  st.cum=phenCum(it.geo.line);
  st.mover=L.marker(it.geo.line[0],{icon:L.divIcon({className:"",html:`<span class="phenMover" style="--pc:${it.color}"></span>`,iconSize:[10,10],iconAnchor:[5,5]}),interactive:false,keyboard:false});
  st.group.addLayer(st.mover);
 }else if(it.kind==="sea"){
  const cs=it.geo.colors||[it.color];
  it.geo.boxes.forEach((b,k)=>{const s=b[0],w=b[1],n=b[2],e=b[3],c=cs[k]||cs[0];
   reg(bind(L.polygon([[s,w],[s,e],[n,e],[n,w]],{color:c,weight:1.8,opacity:.9,fillColor:c,fillOpacity:.13,interactive:true})));});
 }else if(it.kind==="points"){
  for(const p of it.geo.pts){const mk=bind(L.circleMarker([p.la,p.lo],{radius:4.6,color:"#1A1A1A",weight:1.2,fillColor:it.color,fillOpacity:1,interactive:true}));if(p.t)mk.bindTooltip(p.t,{className:"phenTag",direction:"top",offset:[0,-6]});reg(mk);}
 }else if(it.kind==="pulse"){
  for(const p of it.geo.pts){
   reg(bind(L.circleMarker([p.la,p.lo],{radius:3.4,stroke:false,fillColor:it.color,fillOpacity:1,interactive:true})));
   for(let k=0;k<2;k++){const r=L.circle([p.la,p.lo],{radius:0,color:it.color,weight:1.8,opacity:.65,fill:false,interactive:false,className:"phenRing"});st.rings.push({r,km:p.r,ph:k*0.5});st.group.addLayer(r);}
  }
 }
  if(it.link){
  const a0=phenAnchorOf(it),b0=it.link.to;
  reg(L.polyline([a0,b0],{color:it.color,weight:1.6,opacity:.7,dashArray:"2 6",className:"phenLink",interactive:false}));
  const rot=phenArrowDeg(a0,b0);
  const am=L.marker(b0,{icon:L.divIcon({className:"",html:`<span class="phenArrow" style="--pc:${it.color};transform:rotate(${rot.toFixed(1)}deg)"></span>`,iconSize:[12,12],iconAnchor:[6,6]}),interactive:false,keyboard:false});
  am.bindTooltip(`<b>${it.id}</b> → ${it.link.note} (illustrative)`,{permanent:true,className:"phenTag",direction:"right",offset:[8,0]});
  st.group.addLayer(am);
 }
 for(const l of st.paths)l._base={o:(l.options.opacity!=null?l.options.opacity:.85),f:l.options.fillOpacity,d:l.options.dashArray||null};
  st.tag=L.marker(phenAnchorOf(it),{icon:L.divIcon({className:"",html:"",iconSize:[2,2],iconAnchor:[1,1]}),interactive:false,keyboard:false});
 st.tag.bindTooltip(`${it.id} · off-season (${phenWinText(it.window)})`,{permanent:true,className:"phenTag",direction:"top",offset:[0,-8]});
 st.group.addLayer(st.tag);
 it._2d=st;
}
}

function phenApply(){
{const src=window.__phenEnv;if(src){if(src.map)PHEN.env.map=src.map;PHEN.env.rm=!!src.rm;if(typeof src.month==="number")PHEN.env.m=src.month;}}
if(!PHEN.g2){if(!PHEN.env.map)return;PHEN.g2=L.layerGroup().addTo(PHEN.env.map);}
for(const it of PHEN.items){const on=PHEN.on.has(it.id),g=it._2d.group;
 if(on&&!PHEN.g2.hasLayer(g))PHEN.g2.addLayer(g);
 else if(!on&&PHEN.g2.hasLayer(g))PHEN.g2.removeLayer(g);
 if(on)it._2d.dots.forEach((d,k)=>{const el=d.getElement&&d.getElement();if(el)el.style.animationDelay=((k%9)*0.27).toFixed(2)+"s";});
}
const c=document.getElementById("phenCount");if(c)c.textContent=`${PHEN.on.size} / ${PHEN.items.length} on`;
if(PHEN.items.length)phenSync(PHEN.env.m);
try{if(window.__graphBands)window.__graphBands();}catch(_){}
try{if(window.__phen3d&&window.__phen3d.refresh)window.__phen3d.refresh();}catch(_){}
}

function phenSync(m){
for(const it of PHEN.items){
 const w=it.window||[],bright=!w.length||w.indexOf(m)>=0;
 for(const l of it._2d.paths){const b=l._base;l.setStyle(bright?{opacity:b.o,fillOpacity:(b.f!=null?b.f:1),dashArray:b.d}:{opacity:Math.max(.4,b.o*.5),fillOpacity:(b.f!=null?Math.max(.06,b.f*.5):1),dashArray:b.d||"5 6"});}
 if(it._2d.tag){if(PHEN.on.has(it.id)&&!bright)it._2d.tag.openTooltip();else it._2d.tag.closeTooltip();}
 for(const d of it._2d.dots){const el=d.getElement&&d.getElement();if(el)el.classList.toggle("phenOff",!bright);}
 if(it._2d.mover){const el=it._2d.mover.getElement&&it._2d.mover.getElement();if(el)el.classList.toggle("phenOff",!bright);
  if(it.geo.motion==="loop"&&PHEN.env.rm)it._2d.mover.setLatLng(phenPtAt(it.geo.line,it._2d.cum,0.5));
  if(it.geo.motion==="month"&&it.geo.anchors){const A=it.geo.anchors;let idx=A[0].i;
   if(m<=A[0].m)idx=A[0].i;else if(m>=A[A.length-1].m)idx=A[A.length-1].i;
   else for(let i=1;i<A.length;i++){if(m<=A[i].m){const f=(m-A[i-1].m)/((A[i].m-A[i-1].m)||1);idx=A[i-1].i+(A[i].i-A[i-1].i)*f;break;}}
   it._2d.mover.setLatLng(phenIdxAt(it.geo.line,idx));}
 }
 for(const x of it._2d.rings){if(PHEN.env.rm){x.r.setRadius(x.km*0.5);x.r.setStyle({opacity:.3});}const el=x.r.getElement&&x.r.getElement();if(el)el.classList.toggle("phenOff",!bright);}
}
}
window.__phenMonthSync=m=>{PHEN.env.m=m;try{phenSync(m);}catch(_){}};

function phenStep2(ts){
requestAnimationFrame(phenStep2);
if(!PHEN.on.size||PHEN.env.rm||document.hidden)return;
const t=ts||performance.now();
for(const it of PHEN.items){
 if(!PHEN.on.has(it.id))continue;
 if(it._2d.cum&&it.geo.motion==="loop"){const per=(it.geo.period||12)*1000;const f=((t/per)%1+1)%1;it._2d.mover.setLatLng(phenPtAt(it.geo.line,it._2d.cum,f));}
 for(const x of it._2d.rings){const ph=((t/2600)+x.ph)%1;x.r.setRadius(ph*x.km);x.r.setStyle({opacity:.65*(1-ph)});}
}
}

function phenBuildPanel(cats){
const list=document.getElementById("phenList");if(!list)return;
let h="";
for(const c of ["M","O","S","X","L"]){h+=`<div class="phenHead" data-cat="${c}">${cats[c]||c}</div>`;
 for(const it of PHEN.items)if(it.cat===c)h+=`<label class="phenItem" data-cat="${c}" title="${it.label}"><input type="checkbox" data-id="${it.id}" ${PHEN.on.has(it.id)?"checked":""}><span class="pdot" style="background:${it.color}"></span><span class="pid">${it.id}</span><span>${it.name}</span></label>`;}
list.innerHTML=h;
list.addEventListener("change",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.id&&window.__phen.toggle)window.__phen.toggle(t.dataset.id,t.checked);});
for(const ch of document.querySelectorAll(".pchip[data-cat]"))ch.addEventListener("click",()=>{
 if(ch.dataset.cat==="all"){document.querySelectorAll(".pchip[data-cat]").forEach(c=>c.setAttribute("aria-pressed","true"));document.querySelectorAll(".phenItem,.phenHead").forEach(el=>el.classList.remove("cat-off"));return;}
 const on=ch.getAttribute("aria-pressed")!=="false";ch.setAttribute("aria-pressed",String(!on));
 document.querySelectorAll(`.phenItem[data-cat="${ch.dataset.cat}"],.phenHead[data-cat="${ch.dataset.cat}"]`).forEach(el=>el.classList.toggle("cat-off",on));
});
const clr=document.getElementById("phenClear");
if(clr)clr.addEventListener("click",()=>{PHEN.on.clear();document.querySelectorAll("#phenList input").forEach(cb=>cb.checked=false);phenApply();});
}

window.__phen.toggle=(id,on)=>{if(on)PHEN.on.add(id);else PHEN.on.delete(id);try{localStorage.setItem("phen.on",JSON.stringify([...PHEN.on]));}catch(_){}phenApply();};
window.__phen.apply=phenApply;
window.__phen.month=phenSync;

async function phenInit(){
const data=await (await fetch("data/phenomena.json?v=7.7")).json();
for(const it of data.items)PHEN.items.push(it);
try{const saved=JSON.parse(localStorage.getItem("phen.on")||"[]");if(Array.isArray(saved))for(const id of saved)if(PHEN.items.some(i=>i.id===id))PHEN.on.add(id);}catch(_){}
phenBuild2();
phenBuildPanel(data.cats||{});
PHEN.loaded=true;window.__phen.loaded=true;
phenApply();
try{if(window.__phen3d&&window.__phen3d.info&&window.__phen3d.info().built&&window.__phen3d.rebuild)window.__phen3d.rebuild();}catch(_){}
if(!PHEN.env.rm)requestAnimationFrame(phenStep2);
}

/* ---- 3D engine (objects built inside buildTerrain; relG-parented) ---- */
window.__phen3d=(function(){
let T=null,UPM=1,phenG=null,matRecs=[],movers=[],pulses=[],steps=0,lastM=-1,built=false,lastCtx=null;
function refresh(){if(!phenG)return;for(const it of PHEN.items)if(it._3d)it._3d.g.visible=PHEN.on.has(it.id);}
function build(ctx){
T=ctx.THREE;UPM=(typeof ctx.UPM==="number")?ctx.UPM:(ctx.MZ?ctx.MZ(1):1);lastCtx=ctx;
if(phenG&&phenG.parent)phenG.parent.remove(phenG);
phenG=new T.Group();ctx.relG.add(phenG);
matRecs=[];movers=[];pulses=[];built=false;lastM=-1;steps=0;
const X=ctx.X,Z=ctx.Z,yOf=ctx.yOf,hAt=ctx.hAt,MZ=ctx.MZ;
const v3=(la,lo,h)=>new T.Vector3(X(lo),yOf(Math.max(0,hAt(lo,la)))+MZ(h||0),Z(la));
for(const it of PHEN.items){
 const g=new T.Group();phenG.add(g);const my=[];
 const regM=m=>{my.push({m,o:m.opacity});return m;};
 if(it.kind==="region"){
  for(const poly of phenPolyOf(it)){
   const pts=poly.map(p=>v3(p[0],p[1],140));pts.push(pts[0].clone());
   const ln=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:it.color,transparent:true,opacity:.55}));regM(ln.material);g.add(ln);
  }
  if(it.geo.dot&&it.geo.poly){const poly=it.geo.poly;let mn=[1e9,1e9],mx=[-1e9,-1e9];for(const p of poly){mn[0]=Math.min(mn[0],p[0]);mn[1]=Math.min(mn[1],p[1]);mx[0]=Math.max(mx[0],p[0]);mx[1]=Math.max(mx[1],p[1]);}
   const pos=[];for(let la=mn[0];la<=mx[0];la+=1.3)for(let lo=mn[1];lo<=mx[1];lo+=1.3){if(!ptInPoly([la,lo],poly))continue;const v=v3(la,lo,90);pos.push(v.x,v.y,v.z);}
   if(pos.length){const pg=new T.BufferGeometry();pg.setAttribute("position",new T.Float32BufferAttribute(pos,3));
    const pm=new T.PointsMaterial({color:it.color,size:MZ(300),sizeAttenuation:true,transparent:true,opacity:.9});regM(pm);g.add(new T.Points(pg,pm));}}
 }else if(it.kind==="band"){
  const y0=yOf(0)+MZ(it.h3d||1200);
  const pts=it.geo.line.map(p=>new T.Vector3(X(p[1]),y0,Z(p[0])));
  const ln=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineDashedMaterial({color:it.color,dashSize:MZ(420),gapSize:MZ(260),transparent:true,opacity:.9}));
  ln.computeLineDistances();regM(ln.material);g.add(ln);
 }else if(it.kind==="track"){
  const y0=yOf(0)+MZ(it.h3d||900);
  const pts=it.geo.line.map(p=>new T.Vector3(X(p[1]),y0,Z(p[0])));
  const ln=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:it.color,transparent:true,opacity:.8}));regM(ln.material);g.add(ln);
  const sp=new T.Mesh(new T.SphereGeometry(1,10,10),new T.MeshBasicMaterial({color:it.color}));sp.scale.setScalar(0.016);sp.position.copy(pts[0]);g.add(sp);
  const cum=[0];let t0=0;for(let i=1;i<pts.length;i++){t0+=pts[i].distanceTo(pts[i-1]);cum.push(t0);}cum.total=t0||1;
  movers.push({it,mesh:sp,pts,cum});
 }else if(it.kind==="sea"){
  const y0=yOf(0)+MZ(40),cs=it.geo.colors||[it.color];
  it.geo.boxes.forEach((b,k)=>{const s=b[0],w=b[1],n=b[2],e=b[3],c=cs[k]||cs[0];
   const corners=[[s,w],[s,e],[n,e],[n,w]].map(p=>new T.Vector3(X(p[1]),y0,Z(p[0])));corners.push(corners[0].clone());
   const ln=new T.Line(new T.BufferGeometry().setFromPoints(corners),new T.LineBasicMaterial({color:c,transparent:true,opacity:.9}));regM(ln.material);g.add(ln);
   const pl=new T.Mesh(new T.PlaneGeometry(Math.abs(X(e)-X(w)),Math.abs(Z(s)-Z(n))),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.1,side:T.DoubleSide}));
   pl.rotation.x=-Math.PI/2;pl.position.set((X(e)+X(w))/2,y0,(Z(s)+Z(n))/2);regM(pl.material);g.add(pl);});
 }else if(it.kind==="points"){
  for(const p of it.geo.pts){const sp=new T.Mesh(new T.SphereGeometry(1,8,8),new T.MeshBasicMaterial({color:it.color}));sp.scale.setScalar(0.014);sp.position.copy(v3(p.la,p.lo,200));g.add(sp);}
 }else if(it.kind==="pulse"){
  for(const p of it.geo.pts){
   const base=v3(p.la,p.lo,120);
   const sp=new T.Mesh(new T.SphereGeometry(1,8,8),new T.MeshBasicMaterial({color:it.color}));sp.scale.setScalar(0.013);sp.position.copy(base);g.add(sp);
   const rm=new T.MeshBasicMaterial({color:it.color,transparent:true,opacity:.4,side:T.DoubleSide});
   const mesh=new T.Mesh(new T.RingGeometry(0.86,1,40),rm);mesh.rotation.x=-Math.PI/2;
   mesh.position.set(base.x,yOf(0)+MZ(60),base.z);mesh.scale.setScalar(p.r*1000*UPM*0.5);g.add(mesh);
   regM(rm);pulses.push({it,mesh,km:p.r,ph:(pulses.length%2)*0.5});
  }
 }
 it._3d={g,my};matRecs.push({it,my});
}
built=true;refresh();return true;
}
function rebuild(){if(lastCtx){try{build(lastCtx);}catch(_){}}}
function step(dtS){
if(!built||!phenG)return;steps++;
const m=PHEN.env.m||7;
if(m!==lastM){lastM=m;
 for(const rec of matRecs){const w=rec.it.window||[],bright=!w.length||w.indexOf(m)>=0;
  for(const mm of rec.my)mm.m.opacity=bright?mm.o:Math.max(.2,mm.o*.55);}
}
const t=performance.now();
for(const mv of movers){if(!PHEN.on.has(mv.it.id))continue;
 const per=(mv.it.geo.period||12)*1000,f=PHEN.env.rm?0.5:((t/per)%1+1)%1;
 const tt=f*mv.cum.total;let i=1;while(i<mv.cum.length-1&&mv.cum[i]<tt)i++;
 const a=mv.cum[i-1],b=mv.cum[i]||a+1e-9,fr=(tt-a)/(b-a);
 mv.mesh.position.lerpVectors(mv.pts[i-1],mv.pts[i],fr);
}
for(const pu of pulses){if(!PHEN.on.has(pu.it.id))continue;
 const ph=PHEN.env.rm?0.5:((t/2600)+pu.ph)%1;
 pu.mesh.scale.setScalar(Math.max(1e-7,pu.km*1000*UPM*ph));
 pu.mesh.material.opacity=.4*(1-0.7*ph);
}
}
function info(){return {built,objs:phenG?phenG.children.length:0,steps,on:PHEN.on.size};}
return {build,step,info,refresh,rebuild};
})();

try{phenInit();}catch(e){console.warn("phen",e);}
[1200,2600,5000].forEach(ms=>setTimeout(()=>{try{if(!PHEN.g2)phenApply();}catch(_){}},ms));
