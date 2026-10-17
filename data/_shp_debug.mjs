/* v7.22l — debug the polygon reader: compare each record's own bbox header with the bounding box of
   the points I extracted, and with the dbf's shape_area. If they disagree, the record walk or the
   point offset is wrong. Prints raw bytes around the first records too, so the header can be read
   by eye. */
import { readFileSync } from "node:fs";

const path = "Shape files/river_polygon_shp/river_polygon.shp";
const buf = readFileSync(path);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

console.log("file length", buf.length, "bytes | header file length", dv.getInt32(24, false) * 2, "bytes");
console.log("version", dv.getInt32(28, true), "| shape type", dv.getInt32(32, true));
console.log("bbox in header: x", dv.getFloat64(36, true), dv.getFloat64(44, true),
  "y", dv.getFloat64(52, true), dv.getFloat64(60, true));
console.log("z/m:", dv.getFloat64(68, true), dv.getFloat64(76, true));

let p = 100;
for (let n = 0; n < 3; n++) {
  const recNo = dv.getInt32(p, false);
  const words = dv.getInt32(p + 4, false);
  const body = p + 8, len = words * 2;
  const type = dv.getInt32(body, true);
  const bb = [4, 12, 20, 28].map(o => +dv.getFloat64(body + o, true).toFixed(4));
  console.log("\nrecord", recNo, "type", type, "len", len, "bytes | bbox", bb.join(" , "));
  if (type === 5) {
    const nParts = dv.getInt32(body + 36, true), nPts = dv.getInt32(body + 40, true);
    const parts = [];
    for (let i = 0; i < nParts; i++) parts.push(dv.getInt32(body + 44 + i * 4, true));
    const base = body + 44 + nParts * 4;
    console.log("  nParts", nParts, "nPoints", nPts, "parts", parts.join(","), "| points start at byte", base);
    for (let i = 0; i < Math.min(4, nPts); i++)
      console.log("   pt", i, dv.getFloat64(base + i * 16, true), dv.getFloat64(base + 8 + i * 16, true));
  }
  p = body + len;
}