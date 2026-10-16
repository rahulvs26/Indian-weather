/* v7.2 rain average generator: IMD subdivision monthly rainfall 1901-2015 (open-data CSV mirror)
   -> per-GADM-state monthly long-period means, mm/month.
   Run: node data/_gen_rain_avg.mjs   (rewrites data/rain-state-avg.json)
   Source CSV stays in data/_src/ (git-ignored, fetched copy). Fetch URL:
   https://raw.githubusercontent.com/ayushmauryaiitj/Monsoon-Drought-Analytics/main/data/rainfall%20in%20india%201901-2015.csv
   (Kaggle "rainfall-in-india-1901-2015"); see CITATIONS 11. */
import {readFileSync,writeFileSync} from "node:fs";

const RAW="data/_src/rainfall-subdiv-1901-2015.csv";
const OUT="data/rain-state-avg.json";
const MON=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/* --- parse: mean over 1901-2015 per subdivision per month (NA skipped) --- */
const rows=readFileSync(RAW,"utf8").split(/\r?\n/).filter(l=>l.trim());
const head=rows[0].split(",");
const ci=Object.fromEntries(head.map((h,i)=>[h.trim(),i]));
const sum={},cnt={};
for(let i=1;i<rows.length;i++){
  const p=rows[i].split(",");
  const s=p[ci.SUBDIVISION];if(!s)continue;
  sum[s]=sum[s]||new Array(12).fill(0);cnt[s]=cnt[s]||new Array(12).fill(0);
  for(let m=0;m<12;m++){const v=parseFloat(p[ci[MON[m]]]);if(isFinite(v)){sum[s][m]+=v;cnt[s][m]++;}}
}
const subAvg={};
for(const s in sum)subAvg[s]=sum[s].map((v,m)=>cnt[s][m]?v/cnt[s][m]:0);

/* --- subdivision -> GADM state mapping (NAME_1 of data/india-states.geo.json).
   weights = approximate land area (km2) where a state spans several subdivisions;
   sum per state checks out vs the state's published area (rounded). Where ONE
   subdivision spans several states the shared subdivision value is assigned to each
   (no invented split). (illustrative/approximate mapping — see json meta) --- */
const MAP={
  AndamanandNicobar:{u:{"ANDAMAN & NICOBAR ISLANDS":1}},
  AndhraPradesh:{u:{"COASTAL ANDHRA PRADESH":95000,"RAYALSEEMA":67000}},
  ArunachalPradesh:{u:{"ARUNACHAL PRADESH":1}},
  Assam:{u:{"ASSAM & MEGHALAYA":1}},
  Meghalaya:{u:{"ASSAM & MEGHALAYA":1}},
  Bihar:{u:{"BIHAR":1}},
  Chandigarh:{u:{"HARYANA DELHI & CHANDIGARH":1}},
  Chhattisgarh:{u:{"CHHATTISGARH":1}},
  DadraandNagarHaveli:{u:{"GUJARAT REGION":1}},
  DamanandDiu:{u:{"GUJARAT REGION":1}},
  Goa:{u:{"KONKAN & GOA":1}},
  Gujarat:{u:{"GUJARAT REGION":89000,"SAURASHTRA & KUTCH":107000}},
  Haryana:{u:{"HARYANA DELHI & CHANDIGARH":1}},
  NCTofDelhi:{u:{"HARYANA DELHI & CHANDIGARH":1}},
  HimachalPradesh:{u:{"HIMACHAL PRADESH":1}},
  JammuandKashmir:{u:{"JAMMU & KASHMIR":1}},
  Jharkhand:{u:{"JHARKHAND":1}},
  Karnataka:{u:{"COASTAL KARNATAKA":18700,"NORTH INTERIOR KARNATAKA":89000,"SOUTH INTERIOR KARNATAKA":84000}},
  Kerala:{u:{"KERALA":1}},
  Lakshadweep:{u:{"LAKSHADWEEP":1}},
  MadhyaPradesh:{u:{"EAST MADHYA PRADESH":118000,"WEST MADHYA PRADESH":190000}},
  Maharashtra:{u:{"VIDARBHA":97400,"MADHYA MAHARASHTRA":114800,"MATATHWADA":64600,"KONKAN & GOA":30700}},
  Manipur:{u:{"NAGA MANI MIZO TRIPURA":1}},
  Meghalaya:{u:{"ASSAM & MEGHALAYA":1}},
  Mizoram:{u:{"NAGA MANI MIZO TRIPURA":1}},
  Nagaland:{u:{"NAGA MANI MIZO TRIPURA":1}},
  Odisha:{u:{"ORISSA":1}},
  Puducherry:{u:{"TAMIL NADU":1}},
  Punjab:{u:{"PUNJAB":1}},
  Rajasthan:{u:{"EAST RAJASTHAN":154000,"WEST RAJASTHAN":188500}},
  Sikkim:{u:{"SUB HIMALAYAN WEST BENGAL & SIKKIM":1}},
  TamilNadu:{u:{"TAMIL NADU":1}},
  Telangana:{u:{"TELANGANA":1}},
  Tripura:{u:{"NAGA MANI MIZO TRIPURA":1}},
  UttarPradesh:{u:{"EAST UTTAR PRADESH":86000,"WEST UTTAR PRADESH":155000}},
  Uttarakhand:{u:{"UTTARAKHAND":1}},
  WestBengal:{u:{"GANGETIC WEST BENGAL":71800,"SUB HIMALAYAN WEST BENGAL & SIKKIM":16950}}
};

const states={};
for(const st in MAP){
  const u=MAP[st].u;const wsum=Object.values(u).reduce((a,b)=>a+b,0);const m=new Array(12).fill(0);let ok=true;
  for(const su in u){const a=subAvg[su];if(!a){console.log("MISSING subdivision:",su,"for",st);ok=false;continue;}
    for(let i=0;i<12;i++)m[i]+=a[i]*u[su]/wsum;}
  if(!ok)continue;
  const mm=m.map(v=>+v.toFixed(1));
  states[st]={a:Math.round(m.reduce((x,y)=>x+y,0)),m:mm};
}

const out={
  v:"7.2",
  unit:"mm/month",
  meta:{
    note:"Monthly long-period average rainfall per GADM state (keys = NAME_1 in data/india-states.geo.json), mm/month. Derived from the IMD subdivision-wise monthly rainfall record 1901-2015 (Government of India open data). State value = arithmetic mean of all yearly values 1901-2015 (NA skipped) per subdivision, then combined per state with approximate area weights where a state spans several subdivisions (weights in data/_gen_rain_avg.mjs; sums match state areas ~rounded). Where ONE subdivision spans several states the shared subdivision value is assigned to each (Assam & Meghalaya share 'ASSAM & MEGHALAYA'; Nagaland/Manipur/Mizoram/Tripura share 'NAGA MANI MIZO TRIPURA'; Sikkim and W Bengal share 'SUB HIMALAYAN WEST BENGAL & SIKKIM'; Chandigarh/Haryana/Delhi share 'HARYANA DELHI & CHANDIGARH'; Puducherry shares 'TAMIL NADU'; Goa and Maharashtra share 'KONKAN & GOA'; Dadra & Nagar Haveli and Daman & Diu take 'GUJARAT REGION'). APPROXIMATE mapping — a 1901-2015 record mean, not the official 1971-2000 LPA. Dataset quirk: 'MATATHWADA' = Marathwada. (illustrative where shared/area-weighted; the mm values themselves are the fetched record's means.)",
    src:"IMD (via data.gov.in open data) — mirror fetched: https://raw.githubusercontent.com/ayushmauryaiitj/Monsoon-Drought-Analytics/main/data/rainfall%20in%20india%201901-2015.csv (Kaggle 'rainfall-in-india-1901-2015')",
    how:"data/_gen_rain_avg.mjs"
  },
  states
};
writeFileSync(OUT,JSON.stringify(out,null,1));

/* --- console check table --- */
console.log("\nstate                ann   JUN   JUL   NOV");
for(const st of Object.keys(states).sort()){
  const s=states[st];console.log(st.padEnd(20),String(s.a).padStart(4),String(s.m[5]).padStart(6),String(s.m[6]).padStart(6),String(s.m[10]).padStart(6));
}
console.log("\nstates:",Object.keys(states).length,"-> written",OUT);
