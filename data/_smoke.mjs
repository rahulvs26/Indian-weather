/* v7.22w — the smoke and static test suite.
   --------------------------------------------------------------------------------
   Written because of a measured pattern, not a hunch: every defect that ever reached the user in
   this project was in the wiring, and the existing tests all covered arithmetic and engines.

     - the dam search box did nothing until an unrelated checkbox was ticked        (wiring)
     - four MapLibre paint properties that do not exist in the installed version      (wiring)
     - a data/_crossings.mjs import of data/_shp.mjs, which opens with node:fs, so the
       browser refused the module and the entire 3D map stopped existing            (wiring)
     - two files holding the same reservoirs, so the 2D popup printed no area        (wiring)
     - a .damLim.warn rule styling the container while the spans went unstyled     (wiring)

   The arithmetic tests caught none of those. These checks are the ones that would have.

   Run: node data/_smoke.mjs        (no browser needed, about a second) */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log("  OK   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail ? "  -> " + detail : "")); }
};
const exists = f => { try { statSync(f); return true; } catch { return false; } };
const section = t => console.log("\n" + t);

/* ---------------------------------------------------------------- 1. module hygiene */
section("1. the modules the browser executes must not reach for node");
/* follow imports from the entry points, exactly as the browser does */
const entry = ["index.html", "app.js", "map3d.js"];
const queue = [...entry], seen = new Set(), browserModules = new Map();
const importsOf = src => [...src.matchAll(/from\s+"([^"]+)"/g)].map(m => m[1])
  .filter(p => p.startsWith("./") || p.startsWith("../"));
while (queue.length) {
  const f = queue.shift();
  if (seen.has(f) || !exists(f)) continue;
  seen.add(f);
  const src = readFileSync(f, "utf8");
  browserModules.set(f, src);
  const base = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
  for (const imp of importsOf(src)) queue.push(base + imp.replace("./", ""));
}
console.log("  the browser runs " + browserModules.size + " modules:");
for (const f of [...browserModules.keys()].sort()) console.log("       " + f);
for (const [f, src] of browserModules) {
  if (!/\.(mjs|js)$/.test(f)) continue;
  /* strip comments first: data/_crossings.mjs talks ABOUT the node:fs bug in a comment, and a naive
     grep reported it as the bug it describes. A test that cries wolf gets ignored. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  ok(!/from\s+["']node:/.test(code) && !/require\(["']node:/.test(code),
    f + " imports nothing from node:", (code.match(/node:[a-z_]+/g) || []).join(","));
  /* a top-level side effect that needs a DOM would throw at import time */
  ok(!/^\s*(const|let)\s+document\b/m.test(code), f + " does not touch document at module scope");
}

/* ---------------------------------------------------------------- 2. every file the code names must exist */
section("2. every data file the app fetches must exist");
const appSrc = [...browserModules.entries()].filter(([f]) => !f.endsWith(".html"))
  .map(([, s]) => s).join("\n") + readFileSync("index.html", "utf8");
const named = [...new Set([...appSrc.matchAll(/["'`](data\/[A-Za-z0-9_.-]+)["'`]/g)].map(m => m[1]))];
console.log("  " + named.length + " distinct data paths named in code");
let missing = 0;
for (const f of named) if (!exists(f)) { missing++; console.log("       MISSING " + f); }
ok(missing === 0, "all " + named.length + " named data files exist", missing + " missing");

/* ---------------------------------------------------------------- 3. field contracts between code and data */
section("3. fields the code prints must exist in the files it reads");
/* the reservoir popup contract - this is the exact pair that broke in v7.22v */
const resFile = (readFileSync("app.js", "utf8").match(/getJSON\("(data\/reservoirs[^"]*)"/) || [])[1];
ok(!!resFile, "app.js names one reservoir file", "no match");
if (resFile && exists(resFile)) {
  const j = JSON.parse(readFileSync(resFile, "utf8"));
  const p = j.features[0].properties;
  const printsArea = /area_km2/.test(readFileSync("app.js", "utf8").slice(
    readFileSync("app.js", "utf8").indexOf("res_name"), readFileSync("app.js", "utf8").indexOf("res_name") + 900));
  ok(printsArea ? "area_km2" in p : true, resFile + " carries every field its popup prints",
    "popup prints area_km2, file has: " + Object.keys(p).join(","));
  /* and the file must be valid GeoJSON, since MapLibre silently drops what is not */
  let bad = 0;
  for (const f of j.features.slice(0, 4000)) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) {
      if (!ring || ring.length < 4) { bad++; continue; }
      const a = ring[0], z = ring[ring.length - 1];
      if (a[0] !== z[0] || a[1] !== z[1]) bad++;
    }
  }
  ok(bad === 0, resFile + " has no unclosed or too-short rings", bad + " bad rings");
}
/* the storm panel's contract with river-stats.json */
const rs = JSON.parse(readFileSync("data/river-stats.json", "utf8"));
ok(Array.isArray(rs.rivers) && rs.rivers.length > 1000, "river-stats.json has rivers", String(rs.rivers.length));
const first = rs.rivers[0];
const stormSrc = readFileSync("data/_storm-layer.mjs", "utf8");
for (const f of ["km", "n", "tr", "tk", "c", "b", "t"]) {
  const used = new RegExp("\\bbest\\." + f + "\\b").test(stormSrc);
  if (used) ok(f in first, "storm panel reads r." + f + " and the table has it",
    "fields: " + Object.keys(first).join(","));
}
ok(Array.isArray(rs.basinNames) && Array.isArray(rs.tileNames), "the interned dictionaries are present",
  "basinNames/tileNames missing");
/* the watershed areas table the catchment module needs */
const wa = JSON.parse(readFileSync("data/watershed-areas.json", "utf8"));
ok(Array.isArray(wa.watersheds) && wa.watersheds.length > 1000, "watershed-areas.json holds the published areas",
  String(wa.watersheds.length));

/* ---------------------------------------------------------------- 4. CSS contracts */
section("4. classes the JS writes must have a rule that applies to them");
const css = readFileSync("styles.css", "utf8");
/* the v7.22q bug: a rule for .damLim.warn (the container) and no rule for the spans inside it */
const warnSpans = [...new Set([...readFileSync("map3d.js", "utf8").matchAll(/class=\\?"warn"/g)].map(m => m[0]))];
ok(warnSpans.length > 0, "map3d.js writes class=\"warn\" spans");
ok(/\.damLim\s+\.warn\s*\{/.test(css), ".damLim .warn has a span-level rule (not just .damLim.warn)");
ok(!/#B45309/i.test(css), "no #B45309 left: a dark brown that was unreadable on the dark panel");

/* ---------------------------------------------------------------- 5. payload budget */
section("5. payload budget");
const MB = 1024 * 1024;
const loaded = [];
for (const f of readdirSync("data")) {
  if (!/\.(json|geojson|geo\.json)$/.test(f)) continue;
  const p = "data/" + f;
  if (![...browserModules.values()].some(s => s.includes(f)) && !appSrc.includes(f)) continue;
  loaded.push([p, statSync(p).size]);
}
const total = loaded.reduce((s, [, b]) => s + b, 0);
console.log("  " + loaded.length + " data files the app can fetch: " + (total / MB).toFixed(1) + " MB");
ok(total < 40 * MB, "fetchable payload under 40 MB", (total / MB).toFixed(1) + " MB");
for (const [p, b] of loaded.sort((a, b) => b[1] - a[1]).slice(0, 6))
  console.log("       " + p.padEnd(34) + (b / MB).toFixed(2) + " MB");
ok(!loaded.some(([p, b]) => !exists(p)), "every file counted in the payload exists");
ok(loaded.every(([, b]) => b < 20 * MB), "no single file over 20 MB",
  loaded.filter(([, b]) => b >= 20 * MB).map(([p]) => p).join(","));

/* ---------------------------------------------------------------- 6. version cache-busting */
section("6. every script tag is versioned, or browsers will serve stale code");
const html = readFileSync("index.html", "utf8");
for (const m of html.matchAll(/src="([^"]+\.(?:js|mjs))([^"]*)"/g)) {
  const [, src, qs] = m;
  if (src.includes("http")) continue;
  ok(qs.includes("v="), "cache-busted: " + src, qs || "no ?v=");
}
const versions = [...html.matchAll(/\?v=([\d.a-z]+)/g)].map(m => m[1]);
ok(versions.length > 0, "a version string is present", "none found");

/* ---------------------------------------------------------------- 7. no DOM id that does not exist
   This check exists because of what happened in v7.22y. Removing a section from index.html left
   three lines of app.js still reaching for the figure's elements, and the page died on
   "Cannot set properties of null" and then "Cannot read properties of null (reading
   'addEventListener')" - which is to say, deleting markup from an HTML file took the whole
   application down, twice, and neither failure named the file that was at fault.

   Every $("id") and getElementById("id") in the scripts has to resolve to an id that index.html or
   map3d.js actually contains. Ids created at runtime by the scripts themselves are collected first
   and excluded, because those are legitimate.

   The scan is deliberately textual and therefore imperfect: it is a backstop, not a substitute for
   opening the page. It has already earned its place by catching two fatal nulls. */
section("7. no script reaches for a DOM id that no longer exists");
const domSrc = ["app.js", "map3d.js"].map(p => [p, readFileSync(p, "utf8")]);
const pageSrc = domSrc.map(([, s]) => s).join("\n");
/* ids the scripts create themselves: id="..." in a template literal or a createElement assignment */
const runtimeIds = new Set(
  [...pageSrc.matchAll(/id=\\?["'`]([A-Za-z][\w-]*)["'`]/g)].map(m => m[1]));
const declaredIds = new Set(
  [...html.matchAll(/\sid="([A-Za-z][\w-]*)"/g)].map(m => m[1]));
/* The eight ids below belonged to two figures that were removed from index.html in v7.22y: the MJO
   loom and the month-timeline graph. Their code is still reachable - mjoPhase() is what advances the
   map's MJO pulse layer - so the lookups legitimately return null now. Every one of them was checked
   by hand to be null-guarded at its use site; mjoShuttle was NOT, and that is what the check found.
   Adding an id here means: "I have read its use sites and they are guarded". Do not add one to make
   this check quiet. */
const REMOVED_FIGURE_IDS = new Set([
  "mjoSlider", "mjoReadout", "mjoCells", "mjoShuttle", "mjoPlay",
  "graphLines", "graphReadout", "graphSvg",
]);
const wanted = new Map();
for (const [p, s] of domSrc) {
  for (const m of s.matchAll(/(?:\$|getElementById)\(\s*["'`]([A-Za-z][\w-]*)["'`]\s*\)/g)) {
    const id = m[1];
    if (runtimeIds.has(id) || declaredIds.has(id)) continue;
    if (!wanted.has(id)) wanted.set(id, []);
    wanted.get(id).push(p);
  }
}
const unaccounted = [...wanted].filter(([id]) => !REMOVED_FIGURE_IDS.has(id));
ok(unaccounted.length === 0, "no script asks for an id that is neither in the markup, made at runtime, nor a guarded removed figure",
  unaccounted.map(([id, files]) => id + " (" + [...new Set(files)].join(",") + ")").join("; "));
ok([...REMOVED_FIGURE_IDS].every(id => wanted.has(id)),
  "the removed-figure allowlist is all still used (delete stale entries)",
  [...REMOVED_FIGURE_IDS].filter(id => !wanted.has(id)).join(","));

/* ---------------------------------------------------------------- 8. rights & attribution
   Attribution obligations are the one thing in this project that cannot be fixed after the fact
   by noticing it later. A missing credit line is invisible to every other test: the page renders,
   the tests pass, and the site is quietly non-compliant. So the specific lines that are legally
   required, not merely good manners, are asserted here.

   The test asserts PRESENCE of the credit, which is the part that is mechanical. Whether the credit
   is accurate is a judgement, and COPYRIGHT-AUDIT.md is where that gets made. */
section("8. required rights notices are on the page");
ok(/openstreetmap\.org\/copyright/.test(html),
  "OSM copyright link is present (ODbL 1.0 requires visible attribution with a link)",
  "no openstreetmap.org/copyright in index.html");
ok(/©|&\copy;/.test(html) && /OpenStreetMap/i.test(html),
  "OSM attribution names the contributors", "no 'OpenStreetMap contributors' credit");
ok(/Accuracy is not guaranteed/i.test(html),
  "the footer states that accuracy is not guaranteed", "disclaimer text missing");
ok(/not our/i.test(html) && /copyright/i.test(html),
  "the footer states that the material is owned by others", "ownership disclaimer missing");
ok(/illustrative/i.test(html),
  "the footer explains that (illustrative) figures are invented", "illustrative note missing");
ok(/GADM/.test(html) === false || /replaced GADM|replaced with Natural Earth/.test(html),
  "the page does not claim GADM is in use, and if it mentions GADM it says it was replaced",
  "the footer still presents GADM as a live dependency");
ok(/Natural Earth/.test(html) && /[Pp]ublic domain/.test(html),
  "Natural Earth is credited as the public-domain boundary source", "Natural Earth credit missing");
ok(/Bureau of Meteorology/.test(html) && /3\.0 AU/.test(html),
  "the BoM diagrams carry their CC BY 3.0 AU credit", "BoM credit missing");
ok(/MIT|BSD/.test(html),
  "library licences (Leaflet/Three/MapLibre) are named", "no library licence named");

/* every binary file in the published tree must be accounted for in a SOURCES file, because a
   raster cannot carry its own credit. This is the check that would have caught the three orphaned
   Bureau of Meteorology diagrams being published with no visible credit. */
const BINARY = /\.(png|jpe?g|gif|webp|pdf|ico|woff2?|ttf)$/i;
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean);
const binaries = tracked.filter(f => BINARY.test(f));
const photoNote = binaries.length && exists("photos/SOURCES.md")
  ? readFileSync("photos/SOURCES.md", "utf8") : "";
const uncited = binaries.filter(f => !photoNote.includes(f.split("/").pop()));
ok(uncited.length === 0,
  "every binary file in the published tree is named in a SOURCES note",
  uncited.join("; "));

/* ---------------------------------------------------------------- 9. the render-loop gate is wired to a watched element
   This check exists because of v7.16. A visibility optimisation was added to stop the 3D
   renderer and the wind canvas drawing for sections the reader cannot see. It was written as

     __deckStageLive(el) => DECK_VIS.stages.has(el)

   and DECK_VIS.stages is populated by an IntersectionObserver that only observes elements with
   class "stage". The call sites passed elements that are INSIDE a .stage rather than being one:
   #terrainWrap, #osmMap and the wind canvas. So the lookup was permanently false, and three
   render loops - including the whole 3D-mountains view - returned before doing any work on every
   frame. Forever. Nobody noticed for versions because the failure looks exactly like slowness: a
   long wait, then a canvas that never updates.

   A perf optimisation that silently disables the thing it was optimising is the worst failure mode
   a renderer has, and no fps number catches it, because a dead loop measures as a perfect 60.
   So this is asserted statically: every element handed to __deckStageLive must have a .stage
   ancestor, and the gate must resolve through the ancestor walk rather than a bare lookup. */
section("9. render-loop visibility gate resolves to an observed element");
const gateSrc = readFileSync("app.js", "utf8");
ok(/__deckStageLive\s*=\s*el=>\{/.test(gateSrc) && /parentElement/.test(gateSrc),
  "__deckStageLive walks up to the nearest .stage instead of a bare Set lookup",
  "the gate does not resolve through an ancestor walk");
ok(/IntersectionObserver/.test(gateSrc) && /querySelectorAll\("\.stage"\)/.test(gateSrc),
  "the observer watches .stage elements (the set the gate is checked against)");

/* every getElementById passed to the gate must name an element the page actually contains, and the
   page must give it a .stage ancestor. Parsed from index.html so this is a static assertion. */
const gateIds = [...gateSrc.matchAll(/__deckStageLive\(\s*document\.getElementById\("([^"]+)"\)/g)].map(m => m[1]);
ok(gateIds.length >= 2, "the gate has call sites to check", "found " + gateIds.length);
const missingGateIds = gateIds.filter(id => !new RegExp(`id="${id}"`).test(html));
ok(missingGateIds.length === 0, "every element the gate is asked about exists in the markup",
  missingGateIds.join(", "));

/* stage ancestors cannot be proven from markup alone (the observer attaches at runtime), so assert
   the thing that actually broke: that the page's stages carry the class the observer keys on. */
const stageCount = (html.match(/class="[^"]*\bstage\b/g) || []).length;
ok(stageCount > 0, "the page has .stage elements for the observer to watch", "none found");

/* ---------------------------------------------------------------- 10. nothing links to a file that will not render
   A published static site has one quietly broken link shape: pointing at a .md file. GitHub Pages
   serves Markdown as plain text, not as a rendered page, so the reader lands on an unstyled wall of
   raw syntax and the link looks broken even though the file exists.

   The docs are still worth linking to - just via the repository, which renders them properly. So
   the rule is not "no .md links" but "no .md links to a local path".

   The second half is that every same-site link names a file that is actually in the tree, and every
   cross-page anchor exists as an id. about.html was added in v7.24 and could easily have shipped
   linking to a section that does not exist. */
section("10. every link in a published page resolves to something real");
const published = ["index.html", "about.html"];
for (const p of published) {
  const src = readFileSync(p, "utf8");
  const mdLocal = [...src.matchAll(/href="([A-Za-z0-9_\-]+\.md)"/g)].map(m => m[1]);
  ok(mdLocal.length === 0, p + ": no links to a local .md file (Pages serves those as plain text)",
    mdLocal.join(", "));

  const rel = [...src.matchAll(/href="((?!https?:|mailto:|#)[^"]+\.(?:html|xml|txt))"/g)].map(m => m[1]);
  const dangling = rel.filter(r => !exists(r));
  ok(dangling.length === 0, p + ": every relative file link exists in the tree", dangling.join(", "));

  const anchors = [...src.matchAll(/href="index\.html#([\w-]+)"/g)].map(m => m[1]);
  const idx = readFileSync("index.html", "utf8");
  const deadAnchors = anchors.filter(a => !new RegExp('id="' + a + '"').test(idx));
  ok(deadAnchors.length === 0, p + ": every cross-page anchor exists in index.html", deadAnchors.join(", "));
}
ok(exists("sitemap.xml") && exists("robots.txt"), "sitemap.xml and robots.txt exist");
ok(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/.test(readFileSync("robots.txt", "utf8")),
  "robots.txt points at the sitemap with an absolute URL");

/* ---------------------------------------------------------------- 11. the site survives GitHub Pages
   This check exists because publishing to GitHub Pages would have broken the site outright, and
   only after it was already live.

   GitHub Pages runs Jekyll by default. Jekyll silently SKIPS every file and directory whose name
   starts with an underscore or a dot. This project depends on several such files at runtime:

     index.html  ->  <script src="data/_mjo-article.mjs">     the section 2 article's prose
     map3d.js    ->  import "./data/_crossings.mjs"           reservoir crossings on a course
     map3d.js    ->  import "./data/_storm-layer.mjs"        the catchment-storm layer
     app.js      ->  the catchment, hydrology, MVT and OSM-refine modules, underscore-named too

   Without .nojekyll every one of those 404s in production: no MJO article, no storm layer, no
   crossings, and the 3D map's module graph fails to resolve at all. Locally there is no Jekyll, so
   all of it works - which is exactly why this class of bug survives right up to the moment of
   publishing, and why the fix is asserted here rather than remembered.

   The empty .nojekyll file tells Pages to serve the repository tree verbatim. It is the whole fix. */
section("11. GitHub Pages will not strip the files this site loads");
ok(exists(".nojekyll"), ".nojekyll exists, so Pages serves the tree verbatim instead of running Jekyll",
  "MISSING - Jekyll would strip every underscore-prefixed file and break the 3D map and section 2");

const underscoreDeps = new Set();
for (const p of ["index.html", "app.js", "map3d.js"]) {
  const src = readFileSync(p, "utf8");
  const re = /(?:src=["']|from\s*["']|import\(["'])(\.?\.?\/?(?:data\/)?_[a-z0-9_\-]+\.(?:mjs|js))/gi;
  for (const m of src.matchAll(re)) underscoreDeps.add(m[1].replace(/^\.\//, ""));
}
ok(underscoreDeps.size > 0,
  "the site really does load underscore-prefixed modules (so .nojekyll matters)",
  "none found - if this ever reaches zero, .nojekyll can be dropped");
for (const d of [...underscoreDeps]) {
  const rel = d.startsWith("data/") ? d : "data/" + d;
  ok(exists(rel), "runtime dependency is present in the tree: " + d);
}

/* ---------------------------------------------------------------- 12. the view switch is reachable from both 3D views
   Reported as: "in the 3D mountains button there is no other buttons".

   The three view buttons had their markup and their handlers since v7.21, and the CSS showed
   .m3tools only for .stage.map3d-on. The mountains view puts terrain-on on the stage instead, so the
   strip was display:none there - leaving only the 2D map's own button, which goes back. The 3D map
   was unreachable from the mountains: the same one-way-door problem v7.21 had just fixed,
   reintroduced one view over. It survived because the code drawing the buttons worked perfectly and
   the rule deciding whether you could SEE them never ran.

   Static check, because that is the layer at which it was wrong. The live hit-testing that then
   turned up two follow-on layout collisions is recorded in PERFORMANCE.md, not here. */
section("12. the 2D / 3D mountains / 3D map switch is visible in both 3D views");
const cssTxt=readFileSync("styles.css","utf8");
ok(/\.m3tools\{[^}]*display:none/.test(cssTxt), ".m3tools is hidden by default");
ok(/\.stage\.map3d-on \.m3tools[^{]*\{[^}]*display:flex/.test(cssTxt),
  "the switch shows in the 3D map view", "missing .stage.map3d-on rule");
ok(/\.stage\.terrain-on \.m3tools[^{]*\{[^}]*display:flex/.test(cssTxt),
  "the switch shows in the 3D mountains view - the reported bug", "missing .stage.terrain-on rule");
for(const vid of ["m3v2d","m3v3d","m3vmap"]){
  ok(new RegExp('id="'+vid+'"').test(html), "view button is in the markup: "+vid);
  ok(gateSrc.indexOf('"'+vid+'"')>=0, "view button is wired in app.js: "+vid);
}
/* The HUD needs ~712px for its six buttons on one line. Below that it wraps, and the help box -
   positioned at a fixed top:52px that assumes a single row - lands on top of its own "?" toggle,
   making the box's own instruction "Tap ? to close" impossible to follow. */
ok(/\.stage\.terrain-on \.t3hud\{[^}]*max-width:7\d%/.test(cssTxt),
  "the mountains HUD is wide enough to keep its six buttons on one line",
  "HUD will wrap, and the open help box will cover its own toggle");

/* ---------------------------------------------------------------- 13. the wireframe still matches the page
   about.html carries a drawn map of the site - which section holds what, and which control goes
   where. A diagram like that is only useful while it is true, and diagrams rot silently: rename a
   section, drop a layer chip, and the picture keeps confidently asserting the old arrangement.

   So the labels are checked against the live markup. Every section the diagram names must exist as
   an id in index.html, and every control it draws must be a real button on the page. */
section("13. the about page wireframe still describes the real page");
const about = readFileSync("about.html", "utf8");
ok(/<svg[^>]*viewBox="0 0 900 620"/.test(about), "the wireframe is in about.html with a viewBox");
ok(/aria-labelledby="wireT wireD"/.test(about) && /<title id="wireT">/.test(about) && /<desc id="wireD">/.test(about),
  "the wireframe has a title and a description for screen readers",
  "an SVG with no accessible name is invisible to assistive tech");
ok(/<figcaption/.test(about), "the wireframe is captioned");

for (const sId of ["map", "mjo", "iod", "heat", "deck"]) {
  ok(new RegExp('id="' + sId + '"').test(html), "a section the diagram draws really exists: #" + sId);
}
const DRAWN_RE = /^(2D map|3D mountains|3D map|Winds \+ arrows|Heat \/ Cold zones|Doppler radars|IOD boxes|MJO pulse|Rivers)$/;
const drawn = [...about.matchAll(/<text class="wa"[^>]*>([^<]{1,20})<\/text>/g)]
  .map(m => m[1].replace(/\s+/g, " ").trim()).filter(d => DRAWN_RE.test(d));
const real = new Set([...html.matchAll(/<button[^>]*>([^<]{1,24})<\/button>/g)]
  .map(m => m[1].replace(/\s+/g, " ").trim()));
const unknown = drawn.filter(d => !real.has(d));
ok(unknown.length === 0,
  "every control drawn in the wireframe exists as a real button on the page",
  "drawn but not on the page: " + unknown.join(", "));
ok(drawn.length >= 9, "the wireframe labels the main controls, not just the sections",
  "only " + drawn.length + " control labels found");

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "all " + pass + " checks passed"));
process.exit(fail ? 1 : 0);