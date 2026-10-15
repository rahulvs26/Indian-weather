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
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
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
L.geoJSON(st,{style:{color:"#1A1A1A",weight:0.7,fillColor:"#FAF9F6",fillOpacity:0.12}}).eachLayer(l=>{const n=l.feature&&l.feature.properties&&l.feature.properties.NAME_1;if(n){stateLayers[n]=l;l.bindPopup(`<b>${n.replace(/([a-z])([A-Z])/g,"$1 $2")}</b><br>State boundary (GADM). Teal = receiving rain this month.`);}}).addTo(map);
}catch(e){console.warn("states overlay failed",e);}
window.__rainStates=d=>{
const want=new Set(d.rainStates||[]);
for(const n in stateLayers){const on=want.has(n);try{stateLayers[n].setStyle({fillColor:on?"#0F766E":"#FAF9F6",fillOpacity:on?0.45:0.12,weight:on?1.4:0.7});}catch(_){}}
};
window.__rainStates(monthByNum(INDWeather.month||7));
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
const rivMaj=L.layerGroup(),rivMed=L.layerGroup(),rivMin=L.layerGroup();
let riverCount=0;
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
const n=[heatG,radarG,iodG,lpsG,mjoG,curG,textG,riverG,rivMaj,basinG,dg0,waterG,cwcG].filter(g=>{try{return map.hasLayer(g);}catch(_){return false;}}).length;
monthReadout.title=`layers on map: ${n}/13`;
let svgOk="svg-?";
try{if(document.querySelector("#map .stage").classList.contains("terrain-on"))svgOk="2D hidden (3D on)";else{const s=document.querySelector("#osmMap .leaflet-overlay-pane svg");if(s){const r=s.getBoundingClientRect(),m=$("osmMap").getBoundingClientRect();svgOk=(r.width>m.width*0.8&&r.height>m.height*0.8)?"vectors-ok":"VECTORS-BROKEN";}}}catch(_){}
const dbg=$("layerDebug");
if(dbg)dbg.textContent=`self-test: months=${MONTHS.length} stations=${(radars.stations||[]).length} states=${Object.keys(stateLayers).length} rivers=${riverCount} basins=${basinCount} dams=${damCount} cwc=${window.__cwcCount||"…loading"} mjo=${MJOP.length} rm=${RM?1:0} · layers on=${n}/13 · zoom=${map.getZoom()} · ${svgOk}`;
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
const TB={lon0:66,lon1:98,lat0:5,lat1:38,z:5};
const tileXY=(lon,lat,z)=>{const n=2**z;return[Math.floor((lon+180)/360*n),Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n)];};
async function buildTerrain(){
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
const hAt=(lon,lat)=>{const fx=(lon-lonLT)/spanLon*(Wpx-1),fz=(myT-mY(Math.max(-85,Math.min(85,lat))))/(myT-myB)*(Hpx-1);return H[Math.min(Hpx-1,Math.max(0,Math.round(fz)))*Wpx+Math.min(Wpx-1,Math.max(0,Math.round(fx)))];};
const tmp=new Float32Array(Math.max(Wpx,Hpx));
for(let pass=0;pass<2;pass++){
for(let j=0;j<Hpx;j++){for(let i=0;i<Wpx;i++){let s=0;for(let k=-4;k<=4;k++)s+=H[j*Wpx+Math.min(Wpx-1,Math.max(0,i+k))];tmp[i]=s/9;}for(let i=0;i<Wpx;i++)H[j*Wpx+i]=tmp[i];}
for(let i=0;i<Wpx;i++){for(let j=0;j<Hpx;j++){let s=0;for(let k=-4;k<=4;k++)s+=H[Math.min(Hpx-1,Math.max(0,j+k))*Wpx+i];tmp[j]=s/9;}for(let j=0;j<Hpx;j++)H[j*Wpx+i]=tmp[j];}
}
const W=3.4,D=2.55,SX=150,SY=120;
const renderer=new THREE.WebGLRenderer({canvas:$("terrain3d"),antialias:true});
renderer.setPixelRatio(Math.min(1.5,devicePixelRatio||1));
const scene=new THREE.Scene();scene.background=new THREE.Color("#0e1513");
scene.add(new THREE.AmbientLight(0xffffff,0.8));
const sun=new THREE.DirectionalLight(0xffffff,1.05);sun.position.set(-3,4,2);scene.add(sun);
const geo=new THREE.PlaneGeometry(W,D,SX,SY);geo.rotateX(-Math.PI/2);
const pos=geo.attributes.position,cols=[];
const cA=new THREE.Color("#5B8C5A"),cB=new THREE.Color("#A08B62"),cC=new THREE.Color("#8A8F98"),cS=new THREE.Color("#F2F3F5"),tc=new THREE.Color();
const yOf=h=>Math.min(1.1,Math.max(0,h)/7500*1.15);
for(let k=0;k<pos.count;k++){
const ix=k%(SX+1),iz=Math.floor(k/(SX+1));
const lon=TB.lon0+(TB.lon1-TB.lon0)*ix/SX,lat=TB.lat1-(TB.lat1-TB.lat0)*iz/SY;
const h=Math.max(0,hAt(lon,lat));
pos.setY(k,yOf(h));
if(h>5200)tc.copy(cS);else if(h>1800)tc.copy(cC).lerp(cS,(h-1800)/3400*0.3);else if(h>400)tc.copy(cB).lerp(cC,(h-400)/1400*0.5);else tc.copy(cA).lerp(cB,Math.min(1,h/400)*0.5);
cols.push(tc.r,tc.g,tc.b);
}
geo.setAttribute("color",new THREE.Float32BufferAttribute(cols,3));
geo.computeVertexNormals();
scene.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0})));
/* Indian MSL datum: translucent sea plane at 0 m — relief reads against mean sea level */
const sea=new THREE.Mesh(new THREE.PlaneGeometry(W*1.25,D*1.25),new THREE.MeshStandardMaterial({color:0x0b3b5c,transparent:true,opacity:0.88,roughness:0.55,metalness:0}));
sea.rotation.x=-Math.PI/2;sea.position.y=0.002;scene.add(sea);
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
for(let k=0;k<pp.count;k++){const lo=(pp.getX(k)/W)*(TB.lon1-TB.lon0)+(TB.lon0+TB.lon1)/2;const la=(TB.lat0+TB.lat1)/2-(pp.getZ(k)/D)*(TB.lat1-TB.lat0);pp.setY(k,yOf(Math.max(0,hAt(lo,la)))+0.03);}
gg.computeVertexNormals();
const col=new THREE.Color(BS_C[bi%BS_C.length]);
scene.add(new THREE.Mesh(gg,new THREE.MeshStandardMaterial({color:col,transparent:true,opacity:0.34,roughness:1,depthWrite:false})));
const epts=pts.map(([lo,la])=>new THREE.Vector3(XB(lo),yOf(Math.max(0,hAt(lo,la)))+0.035,ZB(la)));
scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(epts),new THREE.LineBasicMaterial({color:0x1a1a1a,transparent:true,opacity:0.8})));
const nm=(f.properties.ba_name||"").replace(/\s*Basin\s*/gi,"")||f.properties.bacode;
const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
bsObjs.push({n:nm,s:{position:new THREE.Vector3(XB(cx),yOf(Math.max(0,hAt(cx,cy)))+0.07,ZB(cy))}});
});
$("peakLbls").innerHTML+=bsObjs.map((p,i)=>`<span class="bsLbl" id="bsl${i}">${p.n}</span>`).join("");
}catch(e){console.warn("terrain basins",e);}
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
for(const ln of lines){const g=[];for(let i=0;i<ln.length;i+=2){const lo=ln[i][0],la=ln[i][1];if(lo<TB.lon0||lo>TB.lon1||la<TB.lat0||la>TB.lat1)continue;g.push(new THREE.Vector3(X(lo),yOf(Math.max(0,hAt(lo,la)))+0.012,Z(la)));}if(g.length>1){const isMajor=(f.properties.scalerank??9)<=3||IND_MAJ.has(nmN(f.properties.name));const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(g),isMajor?new THREE.LineBasicMaterial({color:0x38bdf8}):rmat);scene.add(mesh);draped.push(g);let rec=riverObjs.find(r=>r.name===f.properties.name);if(!rec){rec={name:f.properties.name,meshes:[],mid:null};riverObjs.push(rec);}rec.meshes.push(mesh);if(isMajor&&!rec.mid)rec.mid=g[Math.floor(g.length/2)];}}
}
}catch(e){console.warn("terrain rivers",e);}
const PEAKS=[["Everest 8849m",27.988,86.925],["Kanchenjunga 8586m",27.702,88.148],["Nanda Devi 7816m",30.375,79.969],["K2 8611m",35.88,76.51],["Nanga Parbat 8126m",35.24,74.59],["Anamudi 2695m",10.169,77.062]];
const pkMat=new THREE.MeshBasicMaterial({color:0xffffff});
const pkObjs=PEAKS.map(([n,la,lo])=>{const s=new THREE.Mesh(new THREE.SphereGeometry(0.022,10,10),pkMat);s.position.set(X(lo),yOf(Math.max(0,hAt(lo,la)))+0.03,Z(la));scene.add(s);return{n,s};});
$("peakLbls").innerHTML=pkObjs.map((p,i)=>`<span class="${p.city?"ctLbl":"pkLbl"}" id="pkl${i}">${p.n}</span>`).join("");
/* cities for orientation on the relief */
const CITIES=[["Delhi",28.61,77.21],["Mumbai",19.08,72.88],["Kolkata",22.57,88.36],["Chennai",13.08,80.27],["Bengaluru",12.97,77.59],["Hyderabad",17.39,78.49],["Leh",34.15,77.58],["Guwahati",26.18,91.76]];
const ctMat=new THREE.MeshBasicMaterial({color:0xfbbf24});
const ctObjs=CITIES.map(([n,la,lo])=>{const s=new THREE.Mesh(new THREE.SphereGeometry(0.018,8,8),ctMat);s.position.set(X(lo),yOf(Math.max(0,hAt(lo,la)))+0.025,Z(la));scene.add(s);return{n,s};});
$("peakLbls").innerHTML+=ctObjs.map((p,i)=>`<span class="ctLbl" id="ctl${i}">${p.n}</span>`).join("");
/* user dams as aligned barrage walls (body + lit crest) with illustrative upstream pools.
   250 tallest in-tile dams; one draw call per part. Walls orient ACROSS the nearest draped
   river so they read as barrages strung along the blue lines; pools sit on the uphill side. */
try{
const dm3=await getJSON("data/dams.geo.json","dams");
const dl=dm3.features.filter(f=>{const c=f.geometry.coordinates;return c[0]>=TB.lon0&&c[0]<=TB.lon1&&c[1]>=TB.lat0&&c[1]<=TB.lat1;}).sort((a,b)=>((b.properties.height)||0)-((a.properties.height)||0)).slice(0,250);
/* coarse xz grid of river tangent samples (from draped polylines) for orientation/lookup */
const CELL=0.1,RG=new Map();
for(const g of draped){for(let i=0;i<g.length-1;i++){const a=g[i],b=g[i+1];const tx=b.x-a.x,tz=b.z-a.z;const L=Math.hypot(tx,tz);if(L<1e-6)continue;const k=Math.floor(a.x/CELL)+":"+Math.floor(a.z/CELL);let r=RG.get(k);if(!r)RG.set(k,r=[]);r.push(a.x,a.z,tx/L,tz/L);}}
const nearRiver=(x,z)=>{let best=null,bd=0.0025;const gx=Math.floor(x/CELL),gz=Math.floor(z/CELL);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const r=RG.get((gx+dx)+":"+(gz+dz));if(!r)continue;for(let i=0;i<r.length;i+=4){const ddx=r[i]-x,ddz=r[i+1]-z,d2=ddx*ddx+ddz*ddz;if(d2<bd){bd=d2;best=[r[i+2],r[i+3]];}}}return best;};
const wallShape=new THREE.Shape([new THREE.Vector2(-0.5,0),new THREE.Vector2(0.5,0),new THREE.Vector2(0.17,1),new THREE.Vector2(-0.17,1)]);
const wallGeo=new THREE.ExtrudeGeometry(wallShape,{depth:1,bevelEnabled:false});wallGeo.translate(0,0,-0.5);wallGeo.rotateY(-Math.PI/2);
/* local X = length (spans across the river), Y = height, Z = thickness (downstream profile) */
const crestGeo=new THREE.BoxGeometry(1,1,1);
const dBody=new THREE.InstancedMesh(wallGeo,new THREE.MeshStandardMaterial({color:0x92400e,roughness:0.85}),dl.length);
const dCrest=new THREE.InstancedMesh(crestGeo,new THREE.MeshStandardMaterial({color:0xfbbf24,roughness:0.45,emissive:0xf59e0b,emissiveIntensity:0.24}),dl.length);
const pools=[];
const UP=new THREE.Vector3(0,1,0),M4=new THREE.Matrix4(),VSC=new THREE.Vector3(),VP=new THREE.Vector3(),QQ=new THREE.Quaternion();
const dLonPerW=(TB.lon1-TB.lon0)/W,dLatPerW=(TB.lat1-TB.lat0)/D;
dl.forEach((f,i)=>{const c=f.geometry.coordinates,lo=c[0],la=c[1];const ht=(f.properties.height)||15;const k=Math.sqrt(Math.min(1,ht/260));
const L=0.045+0.075*k,Tw=0.014+0.012*k,h=0.016+0.055*k;   /* length/thickness/height pin scales (illustrative) */
const x=X(lo),z=Z(la),gy=yOf(Math.max(0,hAt(lo,la)));
const dir=nearRiver(x,z);let ang=0,upX=0,upZ=0;
if(dir){const tx=dir[0],tz=dir[1];ang=Math.atan2(-tx,-tz);        /* long axis ⟂ river */
const s0=hAt(lo+tx*0.05*dLonPerW,la-tz*0.05*dLatPerW),s1=hAt(lo-tx*0.05*dLonPerW,la+tz*0.05*dLatPerW);
const sgn=s0>=s1?1:-1;upX=tx*sgn;upZ=tz*sgn;}
QQ.setFromAxisAngle(UP,ang);
VP.set(x,gy,z);VSC.set(L,h,Tw);M4.compose(VP,QQ,VSC);dBody.setMatrixAt(i,M4);
VP.set(x,gy+h,z);VSC.set(L*1.03,Math.min(0.02,Math.max(0.008,0.28*h)),Tw*0.42);M4.compose(VP,QQ,VSC);dCrest.setMatrixAt(i,M4);
if(dir&&ht>=30){const r=0.02+Math.min(0.024,ht/2000);pools.push([x+upX*0.035,yOf(Math.max(0,hAt(lo+upX*0.035*dLonPerW,la-upZ*0.035*dLatPerW)))+0.005,z+upZ*0.035,r,ang+Math.PI/2]);}
});
dBody.instanceMatrix.needsUpdate=true;dCrest.instanceMatrix.needsUpdate=true;
scene.add(dBody);scene.add(dCrest);
if(pools.length){const pGeo=new THREE.CircleGeometry(1,14);pGeo.rotateX(-Math.PI/2);
const pm=new THREE.InstancedMesh(pGeo,new THREE.MeshBasicMaterial({color:0x2dd4bf,transparent:true,opacity:0.9}),pools.length);
pools.forEach((p,i)=>{VP.set(p[0],p[1],p[2]);QQ.setFromAxisAngle(UP,p[4]);VSC.set(p[3],1,p[3]*0.7);M4.compose(VP,QQ,VSC);pm.setMatrixAt(i,M4);});
pm.instanceMatrix.needsUpdate=true;scene.add(pm);}
}catch(e){console.warn("terrain dams",e);}
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
/* living flow packets: oriented source→sea by elevation, speed follows the month */
function orientSrc(g){return g[g.length-1].y>g[0].y?[...g].reverse():g;}
const pktAsn=[];
{let tot=0;const Ls=draped.map(g=>{let L=0;for(let i=1;i<g.length;i++)L+=g[i].distanceTo(g[i-1]);tot+=L;return L;});
draped.forEach((g,gi)=>{const og=orientSrc(g);const n=Math.max(3,Math.round(200*(Ls[gi]/(tot||1))));for(let k=0;k<n&&pktAsn.length<200;k++)pktAsn.push({g:og,off:Math.random()});});}
const pktN=pktAsn.length,pktPos=new Float32Array(Math.max(3,pktN)*3);
const pktGeo=new THREE.BufferGeometry();
pktGeo.setAttribute("position",new THREE.BufferAttribute(pktPos,3));
const pktPts=new THREE.Points(pktGeo,new THREE.PointsMaterial({color:0xffffff,size:0.035,transparent:true,opacity:0.95,sizeAttenuation:true}));
pktPts.frustumCulled=false;scene.add(pktPts);
const cam=new THREE.PerspectiveCamera(42,2,0.1,50);
let th=0,ph=0.62,R=4.4,drag=false,px=0,py=0,lastW=0;
const cv3=$("terrain3d");
const fit=()=>{const w=cv3.clientWidth||cv3.parentElement.clientWidth;if(w===lastW)return;lastW=w;renderer.setSize(w,420,false);cam.aspect=w/420;cam.updateProjectionMatrix();};
cv3.addEventListener("pointerdown",e=>{drag=true;px=e.clientX;py=e.clientY;try{cv3.setPointerCapture(e.pointerId);}catch(_){}});
cv3.addEventListener("pointermove",e=>{if(!drag)return;th+=(e.clientX-px)*0.008;ph=Math.max(0.25,Math.min(1.25,ph-(e.clientY-py)*0.006));px=e.clientX;py=e.clientY;});
addEventListener("pointerup",()=>drag=false);
cv3.addEventListener("wheel",e=>{e.preventDefault();R=Math.max(2.6,Math.min(7,R+e.deltaY*0.003));},{passive:false});
const proj=new THREE.Vector3();
(function loop(){
requestAnimationFrame(loop);
if(!terrainOn||document.hidden)return;
if(!drag&&!RM)th+=0.0012;
cam.position.set(R*Math.sin(ph)*Math.sin(th),R*Math.cos(ph),R*Math.sin(ph)*Math.cos(th));
const mNow=INDWeather.month||7,spd=(mNow>=6&&mNow<=9)?0.10:0.045,tm=performance.now()/1000;
for(let i=0;i<pktN;i++){const P=pktAsn[i];if(!P)continue;const g=P.g;const s=((tm*spd+P.off)%1)*(g.length-1),i0=Math.floor(s),fr=s-i0,a=g[i0],b=g[Math.min(g.length-1,i0+1)];pktPos[i*3]=a.x+(b.x-a.x)*fr;pktPos[i*3+1]=a.y+(b.y-a.y)*fr+0.008;pktPos[i*3+2]=a.z+(b.z-a.z)*fr;}
pktGeo.attributes.position.needsUpdate=true;
cam.lookAt(0,0.25,0);fit();renderer.render(scene,cam);
const w=cv3.clientWidth,h=420;
const tag=(arr,pre)=>arr.forEach((p,i)=>{proj.copy(p.s.position).project(cam);const el=document.getElementById(pre+i);if(!el)return;if(proj.z>1){el.style.display="none";return;}el.style.display="block";el.style.left=((proj.x*0.5+0.5)*w)+"px";el.style.top=((-proj.y*0.5+0.5)*h)+"px";el.style.marginTop=((i%3)*13)+"px";});
tag(pkObjs,"pkl");tag(ctObjs,"ctl");tag(bsObjs,"bsl");
if(typeof lblRivers!=="undefined")lblRivers.forEach((r)=>{proj.copy(r.mid).project(cam);const el=document.getElementById("rvl"+r.li);if(!el)return;if(proj.z>1){el.style.display="none";return;}el.style.display="block";el.style.left=((proj.x*0.5+0.5)*w)+"px";el.style.top=((-proj.y*0.5+0.5)*h)+"px";});
})();
window.__terrainMonth=d=>{
const m=d.m;
cap.textContent=((m>=6&&m<=9)?`${d.label}: monsoon — Himalayan snowmelt + rains swell the Ganga–Brahmaputra; Ghats force orographic rain (see windward tags).`:(m>=10&&m<=12)?`${d.label}: retreat — northern rivers recede; Kaveri peaks with the NE rains.`:(m<=2)?`${d.label}: winter — high Himalaya snowbound; lean river flows.`:`${d.label}: pre-monsoon — lean flows, first melt; peninsular rivers at their lowest.`)+" Relief vs Indian MSL datum; sea plane = 0 m. Dam walls + pools (illustrative, height-scaled).";
};
window.__terrainMonth(monthByNum(INDWeather.month||7));
}
if($("btn3d"))$("btn3d").addEventListener("click",async()=>{
terrainOn=!terrainOn;
document.querySelector("#map .stage").classList.toggle("terrain-on",terrainOn);
$("btn3d").textContent=terrainOn?"2D map":"3D mountains";
if(terrainOn){if(window.__terrainMonth)window.__terrainMonth(monthByNum(INDWeather.month||7));if(!terrainBuilt&&!terrainBuilding){terrainBuilding=true;try{await buildTerrain();terrainBuilt=true;}catch(e){console.warn(e);terrainBuilding=false;$("terrainCap").textContent="3D needs network for elevation tiles — back to 2D.";terrainOn=false;document.querySelector("#map .stage").classList.remove("terrain-on");$("btn3d").textContent="3D mountains";}}}
else if(map){map.invalidateSize();setTimeout(()=>window.__applyLayers&&window.__applyLayers(),350);}
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
window.__graphCursor=m=>{const c=$("graphCursor");if(c){c.setAttribute("x1",X(m));c.setAttribute("x2",X(m));}const d=monthByNum(m);if(d&&$("graphReadout"))$("graphReadout").textContent=`${d.label}: SW flow ${((d.arabian+d.bay)/2).toFixed(0)}% · NE bay ${d.bay}% · heat ${(HEAT_K[m]*100).toFixed(0)}% · cold ${(COLD_K[m]*100).toFixed(0)}% · DMI-typ ${d.dmiTyp} · MJO Ph${INDWeather.mjo} · rain-states ${(d.rainStates||[]).length}`;};
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
