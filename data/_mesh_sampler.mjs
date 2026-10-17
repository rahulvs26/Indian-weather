/* v7.23c — remove the transcendentals from the mesh-vertex loop.

   MEASURED, not guessed. Sub-instrumenting buildTerrain's `mesh` phase (it was one 4.75 s
   black box) gave: tileDecode 543 ms, meshVerts 491 ms, normals 140 ms, blur 139 ms,
   threeImport 119 ms. So the blur - which I expected to be the cost - was 139 ms, and the
   mesh-vertex loop was the second biggest thing at 491 ms.

   Why it was slow: the loop walks a regular (SX+1) x (SY+1) grid and calls

     hAt(lon,lat)  ->  mY(lat) = log(tan(lat)+1/cos(lat))

   per vertex. mY is a Mercator projection, so it costs two trig calls plus a log. Across 517,537
   vertices that is ~1.55 M transcendental evaluations to compute 672 lat values and 768 lon values,
   each of which is used once per column or once per row.

   The fix tables the two axes. colX[ix] and rowZ[iz] hold exactly the fractional DEM coordinates
   the original computed, so the arithmetic downstream is unchanged and the result is
   BIT-IDENTICAL - not approximately equal. data/_dem_sampler.test.mjs asserts that over all
   517,537 mesh vertices plus 20,000 randomised sub-grid points and every edge, so "it looked the
   same" is not what is being claimed.

   The tables are Float64Array, and that detail was learned the hard way. The first version used
   Float32Array and four of the six tests failed: a fractional DEM coordinate like
   187.62857142857143 does not survive a 24-bit mantissa, coming back as 187.62857055664062, and
   the heights stopped matching. The tables hold 769 + 673 numbers, about 11 KB, so narrowing them
   bought nothing. The test now asserts Float64 explicitly so nobody re-introduces it.

   hAt itself is untouched and still used for dam axes, reservoir shorelines, rivers, cities and
   peaks - all of which sample at arbitrary lon/lat, where no table applies.

   Measured after: meshVerts 491 ms -> ~110 ms. It is the only CPU saving taken here, because it is
   the only one that can be shown not to change what is drawn. The other candidates - switching the
   DEM from zoom 6 (56 tiles) to zoom 5 (16 tiles), which would cut most of the 6 s cold fetch, and
   a relief-detail control for the 1.03 M terrain triangles - both change what appears on screen, and
   nothing in this project can see its own output, so they are left for a human to decide. */
import { readFileSync, writeFileSync } from "node:fs";

const OLD_LOOP =
  `for(let k=0;k<pos.count;k++){
const ix=k%(SX+1),iz=Math.floor(k/(SX+1));
const lon=TB.lon0+(TB.lon1-TB.lon0)*ix/SX,lat=TB.lat1-(TB.lat1-TB.lat0)*iz/SY;
const h=Math.max(0,hAt(lon,lat));`;

const NEW_LOOP =
  `/* v7.23c: the two projection axes are tabled, so the per-vertex cost is a bilinear read instead
   of a log-tan-sec. Values are identical to what hAt() would have computed for the same grid
   point - see data/_dem_sampler.test.mjs, which asserts bit-identical output over a randomised
   grid. hAt() itself is unchanged and still used everywhere lon/lat are arbitrary. */
const colX=new Float64Array(SX+1),rowZ=new Float64Array(SY+1);
for(let ix=0;ix<=SX;ix++){const lon=TB.lon0+(TB.lon1-TB.lon0)*ix/SX;
  colX[ix]=Math.min(Wpx-1,Math.max(0,(lon-lonLT)/spanLon*(Wpx-1)));}
for(let iz=0;iz<=SY;iz++){const lat=TB.lat1-(TB.lat1-TB.lat0)*iz/SY;
  rowZ[iz]=Math.min(Hpx-1,Math.max(0,(myT-mY(Math.max(-85,Math.min(85,lat))))/(myT-myB)*(Hpx-1)));}
for(let k=0;k<pos.count;k++){
const ix=k%(SX+1),iz=Math.floor(k/(SX+1));
const fx=colX[ix],fz=rowZ[iz],ix0=fx|0,iz0=fz|0;
const ix1=ix0+1<Wpx?ix0+1:ix0,iz1=iz0+1<Hpx?iz0+1:iz0,xa=fx-ix0,za=fz-iz0,r0=iz0*Wpx,r1=iz1*Wpx;
const h=Math.max(0,H[r0+ix0]*(1-xa)*(1-za)+H[r0+ix1]*xa*(1-za)+H[r1+ix0]*(1-xa)*za+H[r1+ix1]*xa*za);`;

let s = readFileSync("app.js", "utf8");
if (s.includes("v7.23c: the two projection axes are tabled")) { console.log("already applied"); process.exit(0); }
if (!s.includes(OLD_LOOP)) { console.log("mesh loop not found"); process.exit(1); }
s = s.replace(OLD_LOOP, NEW_LOOP);
writeFileSync("app.js", s, "utf8");
console.log("mesh-vertex loop: projection axes tabled");
console.log("  hAt still referenced:", (s.match(/\bhAt\(/g) || []).length, "call sites");
console.log("  tabling present    :", s.includes("const colX=new Float64Array(SX+1)"));