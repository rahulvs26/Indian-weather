/* v7.24 — validate the SEO surface: JSON-LD parses, sitemap is well-formed, metadata is present.

   Why a script and not an ad-hoc node -e: PowerShell mangles quotes and angle brackets inside
   -e, which produced a confusing "Unexpected end of input" from a command that looked fine.

   Malformed JSON-LD is the failure mode worth guarding here, because nothing on the page renders
   differently when it is wrong - the page looks perfect and simply never becomes eligible for a rich
   result. There is no other symptom to notice. */
import { readFileSync } from "node:fs";

let bad = 0;
const ok = (cond, label, detail) => {
  if (cond) console.log("  ok    " + label);
  else { console.log("  FAIL  " + label + (detail ? "  -> " + detail : "")); bad++; }
};

console.log("JSON-LD");
for (const f of ["index.html", "about.html"]) {
  const h = readFileSync(f, "utf8");
  const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) { console.log("  " + f + ": no JSON-LD block (fine - it is optional)"); continue; }
  try {
    const j = JSON.parse(m[1]);
    const g = j["@graph"] || [];
    const faq = g.find(x => x["@type"] === "FAQPage");
    console.log("  " + f + ": valid, " + g.length + " graph entries: " + g.map(x => x["@type"]).join(", ")
      + (faq ? " + " + faq.mainEntity.length + " FAQ items" : ""));
    for (const q of (faq ? faq.mainEntity : [])) {
      const a = q.acceptedAnswer;
      if (!q.name || !a || !a.text) { console.log("    FAIL FAQ item incomplete: " + q.name); bad++; }
    }
    ok(g.some(x => x["@type"] === "WebSite"), f + ": declares a WebSite");
    ok(g.some(x => x["@type"] === "Dataset"), f + ": declares the dataset");
  } catch (e) {
    console.log("  FAIL  " + f + ": JSON-LD does not parse -> " + e.message.slice(0, 100));
    bad++;
  }
}

console.log("\nhead metadata (index.html)");
const h = readFileSync("index.html", "utf8");
const need = [
  ["title", /<title>[^<]{20,}<\/title>/],
  ["meta description", /<meta name="description" content="[^"]{80,}"/],
  ["canonical", /<link rel="canonical" href="https?:\/\/[^"]+"/],
  ["og:title", /property="og:title"/],
  ["og:description", /property="og:description"/],
  ["og:url", /property="og:url"/],
  ["twitter:card", /name="twitter:card"/],
  ["robots", /name="robots" content="index,follow/],
  ["keywords", /name="keywords" content="[^"]{100,}"/],
  ["html lang", /<html lang="en">/],
  ["viewport", /name="viewport"/],
];
for (const [label, re] of need) ok(re.test(h), label);

console.log("\nsitemap + robots");
const sm = readFileSync("sitemap.xml", "utf8");
const urls = (sm.match(/<url>/g) || []).length;
ok(urls === 2, "sitemap lists 2 pages", "found " + urls);
ok(sm.includes("xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\""), "sitemap declares its namespace");
const rb = readFileSync("robots.txt", "utf8");
ok(/Sitemap:\s*https?:\/\/\S+/.test(rb), "robots.txt names the sitemap");
ok(/Disallow: \/data\//.test(rb), "robots.txt keeps crawlers out of /data/");
ok(/^User-agent: \*/m.test(rb), "robots.txt has a User-agent rule");

console.log("\nconsistency");
ok(h.includes('href="about.html"'), "index.html links to about.html");
ok(readFileSync("about.html", "utf8").includes('href="index.html"'), "about.html links back to index.html");
ok(!/>Monsoon<\/a>/.test(h), "no nav link to the removed #monsoon section");
ok(h.includes('href="#mjo"'), "nav links to #mjo");
ok(/study deck · v7\.23/.test(h), "version badge is current");
const sitemapHosts = [...sm.matchAll(/<loc>https?:\/\/([^/]+)/g)].map(m => m[1]);
const canonicalHost = (h.match(/rel="canonical" href="https?:\/\/([^/]+)/) || [])[1];
ok(sitemapHosts.every(x => x === canonicalHost),
  "sitemap host matches the canonical host", sitemapHosts.join(",") + " vs " + canonicalHost);
ok(rb.includes(canonicalHost), "robots.txt sitemap host matches the canonical host");

console.log("\n" + (bad ? "FAILED " + bad + " checks" : "all SEO checks passed"));
process.exit(bad ? 1 : 0);