/* v7.26 — move the workflow off Jekyll, and check what it now publishes.

   Two things here, and the first is the important one.

   1. THE WORKFLOW WAS BUILDING WITH JEKYLL, which breaks the site.

   The Pages workflow added via the GitHub UI (f45c832, .github/workflows/jekyll-gh-pages.yml)
   was GitHub's default scaffold built around actions/jekyll-build-pages. Jekyll skips every file
   whose name starts with an underscore, and this site loads three of those at runtime:

     data/_mjo-article.mjs   the section 2 MJO article's prose
     data/_crossings.mjs     reservoir crossings on a dam-release course   (map3d.js imports it)
     data/_storm-layer.mjs   the catchment-storm layer                    (map3d.js imports it)

   The subtlety worth recording: the empty .nojekyll file does NOT protect against this on the
   Actions route. .nojekyll is a SERVING-layer convention - it tells Pages not to run Jekyll over
   output it is already serving. With Actions, Jekyll runs during the BUILD step, before
   upload-pages-artifact, so the files are stripped on the way into _site and .nojekyll arrives
   too late to matter.

   That produces a failure that is genuinely nasty to diagnose: index.html loads and looks perfect,
   the map on it works, and then nothing that depends on map3d.js's module graph resolves at all.
   A reader sees a broken 3D map and a missing article with no error pointing at the cause.

   There is no build step in this project. The repository root IS the site. So the workflow now
   checks out and uploads the tree with no Jekyll in the path.

   2. The workflow name still says "jekyll" because the file name is what GitHub recognises as the
   existing workflow. Renaming it would make GitHub treat this as a second, new workflow and leave
   the old one enabled - two deploys racing. Renamed the `name:` field only, so the Actions tab
   shows something true, and left the filename alone deliberately.

   This script then reports what the new workflow would actually publish, because with path: .
   the artifact is the whole repository - including the 344 KB of underscore-prefixed build and
   test scripts, which is harmless, and excluding anything git-ignored, which is the point. */
import { readFileSync, statSync, existsSync as exists } from "node:fs";
import { execFileSync } from "node:child_process";

const WF = ".github/workflows/jekyll-gh-pages.yml";
const raw = readFileSync(WF, "utf8");
/* Strip YAML comments before testing what the workflow DOES.
   The first version of this check failed for the right reason in the wrong way: the workflow
   contains a long comment explaining why jekyll-build-pages must not be used, which names it, and
   the naive substring test matched that comment. A check that cannot tell a mention from a use is
   worse than no check, because the obvious "fix" is to delete the explanation. */
const wf = raw.split("\n").map(l => l.replace(/(^|\s)#.*$/, "")).join("\n");

console.log("workflow checks");
const need = [
  ["uses no jekyll-build-pages", !/jekyll-build-pages/.test(wf)],
  ["does run upload-pages-artifact", /upload-pages-artifact/.test(wf)],
  ["uploads the repository root", /path:\s*\./.test(wf)],
  ["deploys with deploy-pages", /deploy-pages@v5/.test(wf)],
  ["triggers on push to main", /branches:\s*\[\"main\"\]/.test(wf)],
  ["allows a manual re-deploy", /workflow_dispatch/.test(wf)],
  ["cancels a stale deploy", /cancel-in-progress:\s*true/.test(wf)],
  ["has pages: write", /pages:\s*write/.test(wf)],
  ["explains why it is not the default", /does NOT protect against this/i.test(raw)],
];
let bad = 0;
for (const [label, cond] of need) {
  console.log("  " + (cond ? "ok  " : "FAIL") + "  " + label);
  if (!cond) bad++;
}

console.log("\nfiles the workflow publishes that the site needs at runtime");
const deps = ["data/_mjo-article.mjs", "data/_crossings.mjs", "data/_storm-layer.mjs"];
for (const d of deps) {
  const kb = exists(d) ? (statSync(d).size / 1024).toFixed(1) + " KB" : "MISSING";
  console.log("  " + (exists(d) ? "ok  " : "FAIL") + "  " + d + "  " + kb);
  if (!exists(d)) bad++;
}

console.log("\nwhat 'path: .' actually ships");
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n").map(s => s.trim()).filter(Boolean);
let bytes = 0, underscore = 0;
for (const f of tracked) {
  try {
    bytes += statSync(f).size;
    if (/(^|\/)_/.test(f)) underscore++;
  } catch { }
}
console.log("  tracked files:      " + tracked.length);
console.log("  total size:         " + (bytes / 1048576).toFixed(1) + " MB");
console.log("  underscore files:   " + underscore + " (these are what Jekyll would have dropped)");
const ignored = ["pdf", "Shape files", "data/_src", "data/_wtiles", "data/live.json"];
console.log("  git-ignored, so NOT published:");
ignored.forEach(p => console.log("      " + p));

console.log("\n" + (bad ? "FAILED " + bad + " checks" : "workflow is correct"));
process.exit(bad ? 1 : 0);