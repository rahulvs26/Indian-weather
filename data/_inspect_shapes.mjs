/* v7.22l — what is actually in the user's Shape files/ folder? Print the attribute tables so the
   catchment question can be answered from the data rather than guessed. */
import { readDbf, readShp } from "./_shp.mjs";

const DIR = "Shape files/";
const files = [
  ["river_polygon_shp", "river_polygon"],
  ["river_network_shape", "River_Network"],
  ["reservoir", "Reservoir"],
  ["dam", "Dam"],
  ["glacial_lake", "Glacial_Lake"],
];

for (const [dir, base] of files) {
  console.log("=".repeat(78));
  console.log(base, "  (" + dir + ")");
  try {
    const shp = readShp(DIR + dir + "/" + base + ".shp");
    const dbf = readDbf(DIR + dir + "/" + base + ".dbf");
    console.log("  geometry type", shp.shapeType, "| records", shp.records.length, "| attribute rows", dbf.rows.length);
    console.log("  fields:", dbf.fields.map(f => f.name + ":" + f.type + f.len).join(", "));
    const withGeom = shp.records.filter(r => r.rings || r.point || r.points).length;
    console.log("  records with geometry:", withGeom);
    for (const r of dbf.rows.slice(0, 3))
      console.log("   ", JSON.stringify(r).slice(0, 260));
  } catch (e) {
    console.log("  FAILED:", e.message);
  }
}