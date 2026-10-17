/* v7.24 — search and sharing metadata for index.html, plus the two stale header items.

   WHAT THIS DOES AND DOES NOT DO

   It does the part that is mechanical and worth getting right: a descriptive title and description
   that actually match the page, a canonical URL, Open Graph and Twitter cards so a shared link
   renders, JSON-LD so the page is eligible for rich results, a sitemap, robots.txt, and internal
   links to the about page using the terms people actually search for.

   It does NOT make the site rank first. Nobody can honestly promise that. For a query like "monsoon
   2025 rainfall in India", the India Meteorological Department will outrank any personal project,
   and it should - they are the authority. What this metadata does is make the page eligible and
   legible to a crawler, and give it a real chance on the long-tail questions the deck genuinely
   answers better than a search result snippet can: what the MJO phases do to the monsoon, why a
   catchment is not a sub-basin, how a dam release actually routes downstream.

   The canonical and og:url use the GitHub Pages host. If you buy a domain or enable Pages under a
   different host, change them in BOTH files - there is one constant, SITE, below.

   Also fixed here, because they were wrong and nobody had noticed: the header nav still linked to
   #monsoon, a section removed in v7.22z (it is #mjo now), and the version badge still read v7.22. */
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://rahulvs26.github.io/Indian-weather";

/* Replace SITE below if you move to a custom domain - it appears in index.html and about.html. */
const SEO = `<meta name="description" content="Interactive study deck for Indian weather and hydrology: monsoon winds by month, an interactive Madden-Julian Oscillation explainer with all 8 phases, the Indian Ocean Dipole, IMD heat and cold wave thresholds, 13002 real dams with dam-release routing along real river courses, and 5160 real reservoir outlines. Every figure cites its source; derived values are labelled illustrative.">
<meta name="keywords" content="Indian monsoon, Indian weather, Madden-Julian Oscillation, MJO phases, Indian Ocean Dipole, IOD, IMD heat wave, cold wave India, India rainfall by state, monsoon onset Kerala, WRIS catchment, dam reservoir India, Central Water Commission dams, Ganga Brahmaputra river, Western Ghats orographic rainfall, SW monsoon Arabian Sea Bay of Bengal">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="author" content="Indian Weather Study Deck">
<link rel="canonical" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Indian Weather Study Deck">
<meta property="og:title" content="Indian Weather Study Deck — monsoon, MJO, IOD, dams and catchments">
<meta property="og:description" content="An interactive study aid for Indian monsoon weather and hydrology, built on IMD, Central Water Commission and WRIS data. Real rivers, real dams, real reservoirs. Every figure cites its source; anything derived is labelled illustrative.">
<meta property="og:url" content="${SITE}/">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Indian Weather Study Deck — monsoon, MJO, IOD, dams and catchments">
<meta name="twitter:description" content="An interactive study aid for Indian monsoon weather and hydrology, built on IMD, CWC and WRIS data. Every figure cites its source.">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","@id":"${SITE}/","name":"Indian Weather Study Deck",
  "url":"${SITE}/","description":"Interactive study deck for Indian monsoon weather and hydrology.",
  "inLanguage":"en-IN",
  "potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"${SITE}/?q={search_term_string}"},"query-input":"required name=search_term_string"}},
 {"@type":"Dataset","@id":"${SITE}/#data",
  "name":"Indian monsoon, catchment and dam datasets compiled from published sources",
  "description":"State rainfall averages, WRIS watershed catchments, 13002 CWC dam points, 5160 reservoir outlines and 30395 CWC river lines, each retaining its published provenance. Study use; cite the original source.",
  "license":"https://creativecommons.org/publicdomain/mark/1.0/",
  "keywords":["Indian monsoon","catchment","WRIS","Central Water Commission","reservoir","dam"],
  "creator":{"@type":"Organization","name":"Indian Weather Study Deck"},
  "isAccessibleForFree":true,
  "distribution":{"@type":"DataDownload","encodingFormat":"GeoJSON","contentUrl":"${SITE}/data/README.md"}},
 {"@type":"FAQPage","@id":"${SITE}/#faq",
  "mainEntity":[
   {"@type":"Question","name":"What causes the Indian monsoon?",
    "acceptedAnswer":{"@type":"Answer","text":"The southwest monsoon is driven by the land-ocean heating contrast: land heats faster than the Indian Ocean in summer, drawing moist south-westerly flow across the Arabian Sea and Bay of Bengal onto the subcontinent. On top of that seasonal reversal, the Madden-Julian Oscillation adds an intraseasonal wobble of roughly 30 to 60 days, which is why an active monsoon arrives in spells rather than continuously."}},
   {"@type":"Question","name":"How many days does the Indian monsoon last?",
    "acceptedAnswer":{"@type":"Answer","text":"The southwest monsoon normally withdraws from the subcontinent by early September, with onset over Kerala around 1 June. The northeast monsoon follows over Tamil Nadu and coastal Andhra Pradesh from October to December."}},
   {"@type":"Question","name":"Which Indian state receives the highest monsoon rainfall?",
    "acceptedAnswer":{"@type":"Answer","text":"Mizoram and the Western Ghats face of Karnataka, Goa and Maharashtra receive the highest mean monsoon rainfall because of orographic uplift. The figures on this site are area-weighted 1901-2015 record means from IMD subdivision data, not the official 1971-2000 long period average."}},
   {"@type":"Question","name":"What is the difference between the MJO and the monsoon?",
    "acceptedAnswer":{"@type":"Answer","text":"The monsoon is the seasonal reversal of wind caused by land-ocean heating. The Madden-Julian Oscillation is a separate intraseasonal oscillation of organised convection travelling eastward across the tropics in about 30 to 60 days. Treating them as the same thing is the most common error in amateur monsoon forecasting."}},
   {"@type":"Question","name":"How many dams are there in India?",
    "acceptedAnswer":{"@type":"Answer","text":"This site plots 13002 dam, barrage and weir points from Central Water Commission and WRIS data, and 5160 reservoir outlines from IndiaWRIS. Counts differ between official inventories depending on the size threshold applied."}},
   {"@type":"Question","name":"Is the data on this site official?",
    "acceptedAnswer":{"@type":"Answer","text":"Every figure cites its source. Facts come from the India Meteorological Department, Central Water Commission and WRIS. Derived values are labelled illustrative, and where a source did not state a value the site says so rather than estimating. It is a study aid, not an operational forecast."}}
  ]}
]}</script>`;

let h = readFileSync("index.html", "utf8");
const before = h.length;

/* 1. replace the thin description with the full SEO block.
   The match allows CRLF because this file has Windows line endings, which is how the first attempt
   at this script silently found nothing and bailed. */
const oldDesc = h.match(/<meta name="description"[^>]*>\r?\n/);
if (!oldDesc) { console.log("description meta not found"); process.exit(1); }
h = h.replace(oldDesc[0], SEO + "\n");

/* 2. a title that matches what the page actually is */
h = h.replace(
  "<title>Indian Weather — Interactive Study Deck</title>",
  "<title>Indian Weather Study Deck — monsoon, MJO, IOD, dams and catchrooms</title>"
    .replace("catchrooms", "catchments"));

/* 3. the nav still pointed at #monsoon, removed in v7.22z, and the version badge was stale */
h = h.replace(
  '<nav aria-label="Sections"><a href="#map">Map</a><a href="#monsoon">Monsoon</a><a href="#iod">IOD</a><a href="#heat">Heat/Cold</a><a href="#deck">Deck</a></nav>',
  '<nav aria-label="Sections"><a href="#map">Map</a><a href="#mjo">MJO</a><a href="#iod">IOD</a>'
  + '<a href="#heat">Heat/Cold</a><a href="#deck">Deck</a>'
  + '<a href="about.html">About</a></nav>');
h = h.replace(/<small>study deck · v7\.\d+<\/small>/, "<small>study deck · v7.23</small>");

writeFileSync("index.html", h, "utf8");

console.log("index.html " + before + " -> " + h.length + " chars");
const checks = [
  ["json-ld WebSite", '"@type":"WebSite"'],
  ["json-ld Dataset", '"@type":"Dataset"'],
  ["json-ld FAQPage", '"@type":"FAQPage"'],
  ["FAQ questions", '"@type":"Question"'],
  ["canonical", 'rel="canonical"'],
  ["og:url", 'property="og:url"'],
  ["twitter card", 'name="twitter:card"'],
  ["keywords", 'name="keywords"'],
  ["nav #mjo not #monsoon", 'href="#mjo"'],
  ["about link", 'href="about.html"'],
];
for (const [label, needle] of checks) {
  console.log("  " + (h.includes(needle) ? "ok  " : "MISS") + " " + label);
}
console.log("  stale '#monsoon' nav link gone: " + !/>Monsoon<\/a>/.test(h));
console.log("  stale version badge gone:       " + !/study deck · v7\.22</.test(h));