/* v7.1 generator: data/phenomena.json (41 items, schematic/illustrative geometry)
   Run: node data/_gen_phenomena.mjs   → rewrites data/phenomena.json
   Source of truth for coordinates/labels: PHENOMENA_LAYERS_TODO.md §2 */
import { writeFileSync } from "node:fs";

const DEF = { M:"#0F766E", O:"#6B7280", S:"#B45309", X:"#B91C1C", L:"#6B7280" };

function parseW(w){
  if(!w || w==="all") return [];
  const out=[];
  for(const part of String(w).split(",")){
    const [a,b]=part.split("-").map(Number);
    if(a<=b) for(let m=a;m<=b;m++) out.push(m);
    else { for(let m=a;m<=12;m++) out.push(m); for(let m=1;m<=b;m++) out.push(m); }
  }
  return out;
}
const pts = a => a.map(p => p.length>2 ? {la:p[0],lo:p[1],t:p[2]} : {la:p[0],lo:p[1]});
const pulse = a => a.map(p => ({la:p[0],lo:p[1],r:p[2]}));

/* [id, kind, name, window, color|null, geo, label, info] */
const rows = [
// ===== M — monsoon =====
["M1","region","Southwest monsoon onset over Kerala","6-9",null,{poly:[[12.8,74.9],[12.0,75.2],[10.5,76.2],[8.3,76.9],[8.1,77.6],[9.6,77.1],[11.3,75.8]],dot:1},"SW monsoon onset — Kerala (normal 1 Jun)","IMD declares onset when 60% of 14 designated Kerala stations report ≥2.5 mm rain for 2 consecutive days, westerlies hold to 600 hPa and INSAT OLR <200 W m⁻². Normal date 1 June; opens India's principal rainy season."],
["M2","band","Northern Limit of Monsoon (progressive advance)","6-7",null,{line:[[23,68.5],[25.5,71.5],[28,76],[28.8,81],[28.3,85.5],[27.5,88.5],[26.5,89.8]]},"NLM — normal mid-Jul cover","Monsoon advances in surges; the Northern Limit of Monsoon is the northernmost position reached. The country is normally fully covered around 8 July (2020 revised normals; legacy normal 15 July)."],
["M3","track","Withdrawal of SW monsoon (retreating monsoon)","9-12",null,{line:[[31,72.5],[27,74],[23,76],[18,78.5],[13,79.5],[9,77.5]],motion:"month",anchors:[[9,0],[10,2],[11,3.5],[12,5]]},"Withdrawal Oct–Dec (NW first, peninsula last)","No withdrawal before 1 Sept; declared on 5-day rainfall cessation + 850-hPa anticyclone. NW India withdraws first (delayed >2 weeks vs the legacy 1 Sept normal); country-wide withdrawal only after 1 Oct, completed ~15 Oct."],
["M4","region","Active & break monsoon spells (intraseasonal variability)","6-9",null,{poly:[[23.5,73.5],[24.5,78],[23,82],[20,82.5],[17.8,79],[19,74.5]],dot:1},"Active/break core — central India","Active/vigorous spells: rainfall 1.5–4× / >4× normal; break monsoon: trough shifts to the Himalayan foothills → foothill floods + dry central India. Driven by the 40-day mode, 14–15-day quasi-biweekly oscillation and the MJO."],
["M5","band","Monsoon trough","6-9",null,{line:[[29.9,73.9],[27.5,78],[25.4,81.9],[23.5,85.5],[22.6,88.4],[21.6,89.6]]},"Monsoon trough — Ganganagar→Head Bay","Semi-permanent elongated low from the heat low (NW Rajasthan–Pakistan) to the Head Bay; normal axis Ganganagar–Allahabad–Kolkata–Head Bay, oscillating ~5° daily. South of axis = active monsoon; north/foothills = break."],
["M6","pulse","Monsoon lows & depressions","7-9",null,{pts:[[17.5,86.5,260]]},"NW Bay genesis zone","Principal rain-bearing systems; lows intensify into depressions (17–33 kt), ~2 per monsoon month. Genesis north of 18°N in the NW Bay (Jul–Aug), shifting to the central Bay in Sept; heaviest rain in the SW quadrant."],
["M7","region","Northeast (winter) monsoon","10-12",null,{poly:[[13.5,74.6],[15.8,77.2],[15.6,80.2],[13.5,80.3],[11,79.6],[8.8,77.6],[9.8,76.1],[12.2,75.0]],dot:1},"NE monsoon — Oct–Dec","Oct–Dec reversal to northeasterlies — main rainy season of the south peninsula, ~60% of coastal Tamil Nadu annual rain. 2025 commencement announced 16 Oct over TN–Puducherry, coastal AP, Rayalaseema, S interior Karnataka, Kerala."],
["M8","band","Subtropical westerly jet (winter)","12-2",null,{line:[[27,68],[27.5,75],[28,82],[27.5,89],[27,95]],h:12000},"Westerly jet ~27N, ~12 km (winter)","Steady westerly jet at ~27°N, ~200 hPa (~12 km). Shifts north of the Himalayas at monsoon onset (permitting the SW monsoon); dips south in winter and break phases with western disturbances."],
["M9","band","Tropical easterly jet (summer)","6-9",null,{line:[[13,60],[13,70],[13,80],[13,90],[13,98]],h:15000},"Easterly jet ~13N, ~15 km (Jul)","Upper-level easterly jet at ~150 hPa in July, centred near Chennai's latitude, Vietnam → West Africa (Tibetan High outflow). Strong/south of normal in active spells; weak/shifted north (~20°N) in breaks."],
["M10","band","ITCZ shift over India","6-9",null,{line:[[13,58],[13,70],[13,82],[13,94]],h:1500},"ITCZ at Jul normal (~13N)","The equatorial trough/ITCZ migrates from ~5°S (January) to 12–15°N (July); its northward march and merging with the heat trough governs onset and advance. Drawn at the July normal; the slider gates its season."],
["M11","region","Tibetan Plateau heating (Tibetan High)","6-9",null,{poly:[[30.5,79],[33,78],[35,76.5],[35.5,81],[34,87],[31,92],[28.5,89],[28,83]],dot:1,h:4500},"Tibetan High","Intense heating of the elevated plateau builds a warm upper anticyclone (max intensity 200 hPa); outflow feeds the easterly jet and its position steers monsoon lows and rainfall."],
["M12","track","Heat low over NW India & seasonal migration","3-6",null,{line:[[18,76],[20.5,79],[27,74.5],[28.5,72.5]],motion:"month",anchors:[[3,0],[4,1],[5,2],[6,3]],h:300},"Heat low migration Mar→Jun","Land–ocean thermal contrast drives the seasonal wind reversal; the shallow heat low (to 850 hPa) over NW Rajasthan–Pakistan acts as a suction device along the trough. Migrates: Mar peninsula → Apr Vidarbha/MP → May Punjab → Jun–Sep NW Rajasthan."],
["M13","band","Western Ghats orography, off-shore trough & rain shadow","6-9",null,{line:[[8.6,77.0],[11,76.5],[14,75.5],[17,74.3],[20,73.7],[21.2,73]]},"Western Ghats orographic rain + rain shadow","Monsoon winds striking the Ghats form an off-shore vortex; the off-shore trough (to ~0.9 km) gives heavy west-coast rain (Mahabaleshwar extreme; Pune in rain shadow)."],
["M14","points","Mawsynram & Cherrapunji (Khasi Hills) extreme rainfall","6-9",null,{pts:[[25.28,91.73,"Mawsynram"],[25.27,91.72,"Cherrapunji"]]},"Mawsynram / Cherrapunji","The Khasi Hills of Meghalaya funnel the monsoon; Cherrapunji and Mawsynram record world-class rainfall totals, studied in IMD's MAUSAM journal."],
// ===== O — oscillations & teleconnections =====
["O1","points","El Niño–Southern Oscillation (ENSO)","all",null,{pts:[[12,101.5]]},"ENSO (Pacific, off-map edge)","Coupled Pacific ocean–atmosphere mode, events recur every 2–7 yrs, peak Nov–Feb. El Niño generally suppresses the ISM (droughts 1982/87/2002/09/15); La Niña strengthens it. Inverse but not deterministic (~42% of El Niño years below normal, IMD Pune)."],
["O2","points","ENSO Modoki (central-Pacific El Niño)","all",null,{pts:[[9,102.5]]},"ENSO Modoki","Central-Pacific warm tripole (ENSO Modoki Index, Ashok et al. 2007) with distinct teleconnections; Modoki–IOD combinations make NIO cyclogenesis complex (more frequent cyclones in some combinations)."],
["O3","sea","Indian Ocean Dipole (IOD; 'Indian Niño')","6-11",null,{boxes:[[-10,50,10,70],[-10,90,0,110]],colors:["#B45309","#1D4ED8"]},"IOD poles — DMI = west−east SST anomaly","SST seesaw: western pole 50–70°E/10°S–10°N, eastern pole 90–110°E/10°S–0°; DMI = west − east anomaly (event when |DMI|≥0.4 °C sustained). Positive IOD favours above-normal ISMR and can offset El Niño (1997, 2019, DMI to +1.78)."],
["O4","track","Madden–Julian Oscillation (MJO)","all","#6D28D9",{line:[[-5,45],[0,55],[5,65],[10,73],[12,80],[12,88],[8,95],[3,105],[2,115],[5,125],[8,134]],motion:"loop",period:12,h:3000},"MJO — eastward 30–60-day pulse","Eastward-moving planetary pulse (8 phases, ~7–8 days each). Drives active/break spells beyond ~1 week; monsoon genesis favoured in phases 4–5, post-monsoon phases 3–4."],
["O5","points","Pacific Decadal Oscillation (PDO)","all",null,{pts:[[6,103.5]]},"PDO (Pacific)","Slow Pacific SST pattern; IMD's Monsoon FAQ lists PDO among the year-to-year ISM factors (with NAO). IPO: no direct IMD material found (marginal)."],
["O6","sea","Indian Ocean Basin Mode (IOBM) / Indian Ocean warming","3-6",null,{boxes:[[-10,40,20,100]]},"IOBM — basin-wide warm mode","Dominant interannual tropical-Indian-Ocean SST mode; warm IOB peaks in spring and its extra moisture is transported to South Asia. Post-1951 ~1 °C warming weakens the land–sea thermal gradient (IITM), drying central-east India."],
["O7","points","North Atlantic Oscillation (NAO) & AMO","all",null,{pts:[[34,58]]},"NAO / AMO (Atlantic, off-map edge)","NAO is listed by IMD among ISM-influencing factors (no strong deterministic fetched link). Positive AMO decades coincide with wetter ISM (e.g. 1926–65); paleo-records show coherent response over central India."],
// ===== S — storms =====
["S1","pulse","Tropical cyclones over the North Indian Ocean","4-5,10-12",null,{pts:[[15,87,300],[15,65,250]]},"NIO cyclone seasons (Nov & May peaks)","RSMC New Delhi watches the basin round-the-clock: two peaks (Apr–May, Oct–Dec; November maximum). ~5 cyclones/yr ≈ 5–6% of the global average; 4:1 Bay:Arabian ratio; 2024 saw 13 vs 11.2 normal."],
["S2","points","IMD intensity classification scale","all",null,{pts:[[12.5,80.0]]},"IMD scale: D→DD→CS→SCS→VSCS→ESCS→SuCS","Depression (31–49 km/h) → Deep Depression → Cyclonic Storm → Severe (89–117) → Very Severe (118–166) → Extremely Severe (167–221) → Super Cyclonic Storm (≥222 km/h). WMO-adopted standard driving warning levels."],
["S3","region","Storm surge / storm tide","4-5,10-12",null,{polys:[[[22.0,88.1],[19.2,85.2],[16.8,82.4],[13.2,80.4],[13.0,80.1],[16.5,81.9],[19.0,84.6],[21.8,87.6]],[[23.5,68.6],[22.3,69.6],[21.0,72.4],[21.4,72.6],[22.7,69.9],[23.8,68.9]]]},"Storm-surge coasts (illustrative strips)","Wind-driven sea-level rise at landfall on top of the astronomical tide — 'by far the greatest killers in a cyclone'. Most exposed: low-lying deltas of Odisha, West Bengal, Andhra Pradesh, Gujarat. Strips are illustrative."],
["S4","track","Western Disturbance","12-2",null,{line:[[36,56],[35,60],[34,64],[32,68],[30,71],[28.8,74]],motion:"loop",period:16,h:2600},"Western disturbance track","Cyclonic circulation/trough in the mid-latitude westerlies from the Mediterranean/Caspian/Black Sea region across Iraq–Iran–Afghanistan–Pakistan into NW India; principal winter precipitation source (~6–7/month Dec–Feb), beneficial for rabi crops."],
["S5","pulse","Nor'wester / Kalbaisakhi","3-5",null,{pts:[[23.5,88.5,220]]},"Nor'wester / Kalbaisakhi (max May)","Severe pre-monsoon convective thunderstorms and squalls of eastern/NE India (IMD field studies since 1931–41; STORM programme 2007–2010). Cells initiate over Jharkhand/Odisha/Bangladesh and organize into mesoscale complexes. 'Bardoli Chheerha' local name not found on fetched IMD pages."],
["S6","pulse","Dust storms / Andhi","4-6",null,{pts:[[26.5,72.5,300]]},"Andhi / dust storms — Rajasthan","Convective sand/dust storms of NW India (Apr–Jun); with little moisture, downdrafts from cumulonimbus raise dust. Visibility below 1 km; triggered by intense surface heating plus WDs/cyclonic circulations."],
["S7","pulse","Thunderstorms, hailstorms & squall lines","3-5",null,{pts:[[26,92.5,260],[23.8,86.5,200]]},"Thunderstorm / hail zones","Pre-monsoon (Mar–May) is India's peak convective season; violent thunderstorms, squalls, heavy precipitation and hail common over NE India. Squall lines are mesoscale lines of storms; parent phenomena of Andhi and Nor'wester."],
["S8","points","Tornadoes","3-5",null,{pts:[[24.6,88.6],[25.4,89.6],[26.2,90.9],[23.2,87.6],[22.6,88.4]]},"Tornado cases (44 in IMD record)","Rare over India: IMD records yielded 44 tornado cases (+113 strong-wind reports from 1951); preferred zones are mesoscale lows along lines of discontinuity at the tail of violent thunderstorms. Dot cluster is illustrative."],
// ===== X — heat & cold extremes =====
["X1","pulse","Heat wave / severe heat wave (warm night)","3-6",null,{pts:[[28,72,350],[23,78,300],[17,82,200]]},"Heat-wave zones (peak May)","Station max ≥40 °C plains / ≥37 coast / ≥30 hills; departure 4.5–6.4 °C = heat wave, >6.4 °C severe. Mar–Jun (peak May); NW & central 'heat belt' plus AP/Odisha coast. May 2015 SE-India event: >2,500 deaths."],
["X2","pulse","Loo","4-6",null,{pts:[[29.5,75.5,300]]},"Loo — Punjab/Haryana/E.Rajasthan/UP","Hot, dry, oppressive pre-monsoon wind — a 'marked feature of summers in northern India' (IMD); blows from afternoon into midnight; evening dust storms common in May."],
["X3","pulse","Cold wave / severe cold wave (cold day)","11-3","#1D4ED8",{pts:[[28,76,320],[25,80,280]]},"Cold-wave zone (worst Dec–Jan)","Station min ≤10 °C plains / ≤0 hills; departure −4.5 to −6.4 °C = cold wave, ≤−6.4 severe. Nov–Mar, worst Dec–Jan in NW/central India; Jan 2003 ~900 deaths; frequency decreasing as winter minimums warm."],
["X4","region","Winter fog","12-1","#6B7280",{poly:[[30.5,74.5],[29.3,77.4],[27.8,79.8],[26.4,83.0],[25.6,86.5],[24.6,88.6],[25.2,89.9],[26.6,89.0],[27.6,85.0],[28.8,81.5],[29.9,78.2],[31.0,75.3]]},"Winter fog — Indo-Gangetic plains","Large-scale episodic IGP fog spells lasting weeks (Dec–Jan peak); radiation fog after western disturbances. Densest spells drop visibility below 50 m; 12 airports get IMD fog warnings; ~120–159 road deaths in the worst 2016–18 seasons. The most fog-vulnerable region globally per IMD."],
["X5","pulse","Frost / ground frost","12-2","#1D4ED8",{pts:[[29,76.5,280]]},"Frost — NW plains & foothills","Frost 'prevails when temperature falls below 0 °C in an area where it is abnormal'; NDMA/IMD criterion: winds <16 km/h and air temp <0 °C on sub-zero winter nights. Rabi crop losses; ≥33% loss qualifies for national relief."],
["X6","pulse","Mango showers","3-5","#0F766E",{pts:[[10.5,76.5,150],[13.5,74.8,130]]},"Mango / blossom showers","End-of-summer pre-monsoon showers of Kerala and coastal Karnataka (not an IMD criteria term); hasten mango ripening and make coffee flower ('blossom'/'cherry-blossom' showers). Beneficial before the monsoon."],
["X7","region","October heat","10-11",null,{poly:[[24,73],[24.5,78],[22.5,80.5],[19,80],[16,78.8],[13.5,77.3],[15.5,74.6],[19,73.4]]},"October heat — post-monsoon peninsula","Retreating SW monsoon brings clear skies and rising temperatures over still-moist land; combined heat and humidity make weather 'oppressive' — the 'October heat'; the mercury then falls rapidly over north India."],
["X8","points","Urban heat island (UHI) effect","3-6",null,{pts:[[28.61,77.21,"Delhi"],[19.08,72.88,"Mumbai"],[13.08,80.27,"Chennai"],[12.97,77.59,"Bengaluru"],[22.57,88.36,"Kolkata"],[23.02,72.57,"Ahmedabad"],[26.91,75.79,"Jaipur"]]},"Urban heat islands — major metros","Cities run hotter than surroundings; NDMA's 2019 heat guidelines require UHI assessment in Heat Action Plans (23 states, 195 districts, 64 cities). Worst on summer nights; Delhi SAPCC 2.0: summer max projected +1.5 °C (SSP2-4.5) to +2.1 °C (SSP5-8.5) by the 2050s."],
["X9","sea","Atmospheric brown cloud (ABC)","11-2",null,{boxes:[[10,55,31,93]]},"Atmospheric brown cloud — IGP + N Indian Ocean","Haze of sulphates, nitrates, organics, black carbon, dust and fly ash; dominant over India in winter, low in the summer monsoon (INDOEX 1996–99). Solar dimming; anthropogenic aerosols linked to the post-1950s ISM rainfall decline, while IGP absorbing aerosols can invigorate pre-monsoon rain."],
// ===== L — climate trends =====
["L1","region","Global warming signals for India","all",null,{poly:[[35,74],[35.5,80],[33,86],[29.5,92],[27,95.5],[24.5,94],[22,92],[19,88.5],[16,85],[12.5,80.5],[9.5,78.5],[8,77],[11,75.5],[15,73.5],[20,71],[23,68.5],[27,69],[31,70],[34,72]],dot:1},"India warming trend","Surface air temperature over India rose ~0.7 °C (1901–2018); tropical Indian Ocean SST +~1 °C (1951–2015). Rising heavy-rain/drought extremes, higher TC intensity; IMD Climate Hazard & Vulnerability Atlas + 29 state rainfall-variability reports."],
["L2","points","Himalayan cryosphere & GLOF risk","5-10",null,{pts:[[27.95,88.6,"South Lhonak"],[27.6,88.5,"Shako Cho"],[30.9,79.1,"Gangotri"]]},"Glacier retreat / GLOF lakes","HKH glaciers retreating 14.9±15.1 m/yr (Ganga 15.5±14.4, Brahmaputra 20.2±19.7); Chandra basin lost ~6% area in 20 yrs. New/enlarging glacial lakes raise GLOF risk; NGRMP phase-I early warning (HP, Uttarakhand, Sikkim, Arunachal, J&K, Ladakh)."],
["L3","points","Sea-level rise (MoES/INCOIS)","all",null,{pts:[[19.05,72.8,"Mumbai 4.1"],[15.4,73.8,"Mormugao 4.3"],[9.96,76.25,"Kochi 4.4"],[13.1,80.3,"Chennai 4.2"],[17.7,83.3,"Visakhapatnam 4.5"],[20.3,86.6,"Paradip 4.6"]]},"Sea-level rise — tide-gauge trends (mm/yr)","North Indian Ocean ~3.3 mm/yr (1993–2015); 1993–2020 altimeter trends 4.1–4.6 mm/yr at Mumbai, Mormugao, Kochi, Chennai, Visakhapatnam, Paradip. Erosion, saline intrusion; INCOIS hazard line guides adaptation."]
];

const items = rows.map(r=>{
  const [id,kind,name,w,color,geo,label,info]=r;
  const it={id,cat:id[0],name,kind};
  it.color=color||DEF[id[0]];
  it.window=parseW(w);
  it.label=label;
  if(geo.h) it.h3d=geo.h;
  it.info=info;
  it.src="CLIMATE_PHENOMENA_TODO.md · "+id;
  if(kind==="region"){ it.geo={}; if(geo.poly)it.geo.poly=geo.poly; if(geo.polys)it.geo.polys=geo.polys; if(geo.dot)it.geo.dot=1; }
  else if(kind==="band") it.geo={line:geo.line};
  else if(kind==="track"){ it.geo={line:geo.line,motion:geo.motion}; if(geo.anchors)it.geo.anchors=geo.anchors.map(a=>({m:a[0],i:a[1]})); if(geo.period)it.geo.period=geo.period; }
  else if(kind==="sea"){ it.geo={boxes:geo.boxes}; if(geo.colors)it.geo.colors=geo.colors; }
  else if(kind==="points") it.geo={pts:pts(geo.pts)};
  else if(kind==="pulse") it.geo={pts:pulse(geo.pts)};
  return it;
});

const data={v:"7.1",note:"Schematic/illustrative geometry for study. Seasons follow the month slider. Sources: CLIMATE_PHENOMENA_TODO.md",cats:{M:"Monsoon",O:"Oscillations",S:"Storms",X:"Heat & cold",L:"Climate trends"},items};
writeFileSync(new URL("./phenomena.json",import.meta.url),JSON.stringify(data,null,1)+"\n");
console.log("phenomena.json:",items.length,"items ·",items.map(i=>i.id).join(","));
