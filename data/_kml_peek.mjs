/* v7.22l — what are the five KML files in Shape files/? They carry a Schema, so read the field names
   and count the placemarks and their geometry types. A catchment set would show as polygons with a
   catchment/sub-basin name; a river set as LineStrings. Streams the file, so a 65 MB KML does not
   have to be held in memory. */
import { createReadStream } from "node:fs";

const files = process.argv.slice(2);
for (const f of files) {
  let buf = "", schema = "", names = [], types = {}, nPlacemark = 0, bytes = 0;
  const want = /\/?(?:name|SimpleField|Placemark|Polygon|LineString|MultiGeometry|gx:Track)/g;
  await new Promise((res, rej) => {
    const s = createReadStream(f, { encoding: "utf8", highWaterMark: 1 << 20 });
    s.on("data", chunk => {
      bytes += chunk.length;
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const ln of lines) {
        const t = ln.trim();
        if (t.startsWith("<SimpleField") && schema.length < 40) schema += t.replace(/\s+/g, " ").slice(0, 150) + " | ";
        for (const m of t.matchAll(want)) {
          if (m[0] === "Placemark") nPlacemark++;
          else if (m[0].endsWith("Polygon")) types.Polygon = (types.Polygon || 0) + 1;
          else if (m[0].endsWith("LineString")) types.LineString = (types.LineString || 0) + 1;
          else if (m[0].endsWith("MultiGeometry")) types.MultiGeometry = (types.MultiGeometry || 0) + 1;
          else if (m[0].endsWith("Track")) types.Track = (types.Track || 0) + 1;
        }
        const nm = t.match(/^<name>([^<]{1,60})<\/name>/);
        if (nm && names.length < 12 && !nm[1].includes(":")) names.push(nm[1]);
      }
    });
    s.on("end", res);
    s.on("error", rej);
  });
  console.log("=".repeat(70));
  console.log(f.split(/[\\/]/).pop(), "|", (bytes / 1048576).toFixed(1), "MB |", nPlacemark, "placemarks");
  console.log("  geometry:", JSON.stringify(types));
  console.log("  schema:", schema.slice(0, 700) || "(none)");
  console.log("  first names:", names.join(" | "));
}