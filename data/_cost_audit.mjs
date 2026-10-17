/* v7.22v — cost measurement for the gap analysis and value-engineering pass.
   Nothing here is estimated: bytes on disk, bytes the browser downloads, lines of code, and which
   data files are actually referenced by anything. A file nobody loads is not an asset, it is weight,
   and a feature nobody can see is not a gap in the data, it is a gap in the wiring - both only show
   up if they are measured. */
import { readFileSync, readdirSync, statSync } from "node:fs";

const root = ".";
const codeExt = /\.(js|mjs|css|html)$/i;
const rows = [];
for (const f of readdirSync(root)) {
  const st = statSync(f);
  if (!st.isFile()) continue;
  if (codeExt.test(f)) {
    const s = readFileSync(f, "utf8");
    rows.push({ file: f, kind: "code", kb: +(st.size / 1024).toFixed(1), lines: s.split("\n").length, bytes: st.size });
  } else if (f.endsWith(".json")) {
    rows.push({ file: f, kind: "data", kb: +(st.size / 1024).toFixed(1), lines: 0, bytes: st.size });
  }
}
for (const d of ["data"]) {
  for (const f of readdirSync(d)) {
    const st = statSync(d + "/" + f);
    if (!st.isFile()) continue;
    rows.push({ file: d + "/" + f, kind: /\.(mjs|js)$/i.test(f) ? "data-code" : "data",
      kb: +(st.size / 1024).toFixed(1), lines: /\.(mjs|js)$/i.test(f) ? readFileSync(d + "/" + f, "utf8").split("\n").length : 0, bytes: st.size });
  }
}

const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
const code = rows.filter(r => r.kind === "code");
const dataCode = rows.filter(r => r.kind === "data-code");
const data = rows.filter(r => r.kind === "data");

console.log("=== CODE ===");
for (const r of [...code, ...dataCode].sort((a, b) => b.bytes - a.bytes))
  console.log("  " + r.file.padEnd(34), String(r.kb).padStart(9) + " KB", String(r.lines).padStart(6) + " lines");
console.log("  " + "TOTAL".padEnd(34), String(sum([...code, ...dataCode], "kb")).padStart(9) + " KB",
  String(sum([...code, ...dataCode], "lines")).padStart(6) + " lines");

console.log("\n=== DATA (what the browser can be asked to download) ===");
const big = data.sort((a, b) => b.bytes - a.bytes);
for (const r of big.slice(0, 16)) console.log("  " + r.file.padEnd(34), String(r.kb).padStart(9) + " KB");
console.log("  " + "TOTAL".padEnd(34), String(sum(data, "kb")).padStart(9) + " KB", "(" + (sum(data, "kb") / 1024).toFixed(1) + " MB)");
console.log("  files over 500 KB:", big.filter(r => r.kb > 500).length);

/* is each data file referenced anywhere? */
const sources = [...code, ...dataCode].map(r => readFileSync(r.file, "utf8"));
console.log("\n=== IS IT LOADED? ===");
const unused = [], loaded = [];
for (const r of data) {
  const base = r.file.split("/").pop();
  const hit = sources.some(s => s.includes(base));
  (hit ? loaded : unused).push(r);
}
console.log("  referenced:", loaded.length, "files,", (sum(loaded, "kb") / 1024).toFixed(1), "MB");
console.log("  NOT referenced anywhere:", unused.length, "files,", (sum(unused, "kb") / 1024).toFixed(1), "MB");
for (const r of unused.sort((a, b) => b.bytes - a.bytes).slice(0, 14))
  console.log("     ", r.file.padEnd(32), String(r.kb).padStart(9) + " KB");

/* the payload the first view actually needs: whatever index.html + app.js + map3d.js pull in */
console.log("\n=== FIRST-PAINT PAYLOAD ===");
const firstPaint = ["index.html", "app.js", "map3d.js", "styles.css", "embedded.js", "leaflet.js", "data/embedded.js"];
const onDisk = firstPaint.map(f => { try { return statSync(f).size; } catch { return 0; } });
const shell = onDisk.reduce((a, b) => a + b, 0);
console.log("  shell (html/css/js the browser loads):", (shell / 1024).toFixed(0), "KB");
console.log("  lazy third-party (MapLibre + style): loaded on the first 3D map activation, not before");

/* tests: what is actually verified */
console.log("\n=== TESTS ===");
const tests = dataCode.filter(r => /\.test\.mjs$|_check\.mjs$|_check\.mjs$/i.test(r.file));
for (const t of tests) console.log("  " + t.file.padEnd(34), String(t.lines).padStart(5) + " lines");