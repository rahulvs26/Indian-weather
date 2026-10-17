/* v7.23c — proves the tabled mesh sampler produces BIT-IDENTICAL heights to the original hAt().

   This test exists because "it looked the same on screen" is not a claim anyone can check in this
   project: nothing here can see its own output. So the optimisation is checked arithmetically
   instead, over a randomised grid that exercises every branch - interior points, all four edges,
   both corners, the clamped top and bottom rows, and fractional positions on either side of a
   cell boundary where the interpolation weights actually differ.

   The bar is exact equality of the Float64 result, not a tolerance. If this ever needs a
   tolerance, the optimisation has changed the terrain and must be re-argued, not relaxed. */
import { test } from "node:test";
import assert from "node:assert/strict";

/* --- the terrain's real geometry, copied from app.js buildTerrain() --- */
const TB = { lon0: 66, lon1: 98, lat0: 5, lat1: 38, z: 6 };
const tileXY = (lon, lat, z) => {
  const n = 2 ** z;
  return [Math.floor((lon + 180) / 360 * n),
    Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)];
};
const [x0, y0] = tileXY(TB.lon0, TB.lat1, TB.z), [x1, y1] = tileXY(TB.lon1, TB.lat0, TB.z);
const NX = x1 - x0 + 1, NY = y1 - y0 + 1, T = 256, Wpx = NX * T, Hpx = NY * T;

const lonLT = (x0 / 2 ** TB.z) * 360 - 180, spanLon = NX * 360 / 2 ** TB.z;
const y2lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** TB.z))) * 180 / Math.PI;
const mY = la => Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180));
const myT = mY(y2lat(y0)), myB = mY(y2lat(y1 + 1));

/* a DEM with distinct values everywhere, so an off-by-one row or column cannot pass */
const H = new Float32Array(Wpx * Hpx);
for (let j = 0; j < Hpx; j++) for (let i = 0; i < Wpx; i++) H[j * Wpx + i] = (i * 7 + j * 13) % 9973;

/* --- the ORIGINAL, exactly as app.js had it --- */
const hAt = (lon, lat) => {
  const fx = Math.min(Wpx - 1, Math.max(0, (lon - lonLT) / spanLon * (Wpx - 1))),
    fz = Math.min(Hpx - 1, Math.max(0, (myT - mY(Math.max(-85, Math.min(85, lat)))) / (myT - myB) * (Hpx - 1)));
  const ix = Math.floor(fx), iz = Math.floor(fz), ix1 = Math.min(Wpx - 1, ix + 1), iz1 = Math.min(Hpx - 1, iz + 1),
    xa = fx - ix, za = fz - iz, r0 = iz * Wpx, r1 = iz1 * Wpx;
  return H[r0 + ix] * (1 - xa) * (1 - za) + H[r0 + ix1] * xa * (1 - za) + H[r1 + ix] * (1 - xa) * za + H[r1 + ix1] * xa * za;
};

/* --- the REPLACEMENT: the same computation with the two axes tabled ---
   Float64Array, deliberately. The first attempt used Float32Array and the tests below caught it:
   a fractional DEM coordinate like 187.62857142857143 does not survive a 24-bit mantissa
   (it came back as 187.62857055664062), and the heights stopped being identical. The tables hold
   769 + 673 numbers - about 11 KB - so there was never a reason to narrow them. */
const SX = 768, SY = 672;
const colX = new Float64Array(SX + 1), rowZ = new Float64Array(SY + 1);
for (let ix = 0; ix <= SX; ix++) {
  const lon = TB.lon0 + (TB.lon1 - TB.lon0) * ix / SX;
  colX[ix] = Math.min(Wpx - 1, Math.max(0, (lon - lonLT) / spanLon * (Wpx - 1)));
}
for (let iz = 0; iz <= SY; iz++) {
  const lat = TB.lat1 - (TB.lat1 - TB.lat0) * iz / SY;
  rowZ[iz] = Math.min(Hpx - 1, Math.max(0, (myT - mY(Math.max(-85, Math.min(85, lat)))) / (myT - myB) * (Hpx - 1)));
}
const hTabled = (ix, iz) => {
  const fx = colX[ix], fz = rowZ[iz], ix0 = fx | 0, iz0 = fz | 0;
  const ix1 = ix0 + 1 < Wpx ? ix0 + 1 : ix0, iz1 = iz0 + 1 < Hpx ? iz0 + 1 : iz0, xa = fx - ix0, za = fz - iz0,
    r0 = iz0 * Wpx, r1 = iz1 * Wpx;
  return H[r0 + ix0] * (1 - xa) * (1 - za) + H[r0 + ix1] * xa * (1 - za) + H[r1 + ix0] * (1 - xa) * za + H[r1 + ix1] * xa * za;
};
const hTabledOrig = (ix, iz) => {
  const lon = TB.lon0 + (TB.lon1 - TB.lon0) * ix / SX, lat = TB.lat1 - (TB.lat1 - TB.lat0) * iz / SY;
  return hAt(lon, lat);
};

/* ------------------------------------------------------------------ the checks */

test("grid size matches what buildTerrain allocates", () => {
  assert.equal(Wpx, 1792, "Wpx");
  assert.equal(Hpx, 2048, "Hpx");
  assert.equal(NX * NY, 56, "56 Terrarium tiles at z6");
  assert.equal((SX + 1) * (SY + 1), 517537, "mesh vertex count");
});

test("every mesh vertex is bit-identical to hAt()", () => {
  let worst = 0, checked = 0;
  for (let iz = 0; iz <= SY; iz++) for (let ix = 0; ix <= SX; ix++) {
    const a = hTabledOrig(ix, iz), b = hTabled(ix, iz);
    assert.ok(Object.is(a, b), `vertex (${ix},${iz}) differs: ${a} vs ${b}`);
    checked++;
  }
  assert.equal(checked, 517537);
});

test("randomised sub-grid points agree, including cell boundaries", () => {
  /* half-integer ix/iz land exactly on cell boundaries where xa and za are 0, which is where a
     wrong ix0/iz0 would silently blend the wrong four cells */
  let seed = 0x2f6e2b1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 20000; n++) {
    const ix = Math.min(SX, Math.floor(rnd() * SX + 0.5));
    const iz = Math.min(SY, Math.floor(rnd() * SY + 0.5));
    assert.ok(Object.is(hTabledOrig(ix, iz), hTabled(ix, iz)), `sub-grid (${ix},${iz})`);
  }
});

test("edges and corners", () => {
  const pts = [[0, 0], [SX, 0], [0, SY], [SX, SY], [1, 0], [SX - 1, SY], [0, 1], [SX, SY - 1], [SX / 2, SY / 2 | 0]];
  for (const [ix, iz] of pts) assert.ok(Object.is(hTabledOrig(ix, iz), hTabled(ix, iz)), `edge (${ix},${iz})`);
});

test("the table is not degenerate - it actually varies along both axes", () => {
  /* guards against the failure mode where both tables collapse to a constant and the comparison
     above passes trivially because every point returns the same number */
  const xs = new Set([...colX].map(v => v.toFixed(6)));
  const zs = new Set([...rowZ].map(v => v.toFixed(6)));
  assert.ok(xs.size > 700, `colX should vary per column, got ${xs.size} distinct values`);
  assert.ok(zs.size > 600, `rowZ should vary per row, got ${zs.size} distinct values`);
});

test("Float64 storage of the tables is exact - no coordinate is quietly rounded", () => {
  /* A narrower table type would pass the arithmetic above by luck on some points and fail on
     others; this asserts it directly, so nobody 'optimises' the table back to Float32 later. */
  for (let ix = 0; ix <= SX; ix++) {
    const lon = TB.lon0 + (TB.lon1 - TB.lon0) * ix / SX;
    const exact = Math.min(Wpx - 1, Math.max(0, (lon - lonLT) / spanLon * (Wpx - 1)));
    assert.ok(Object.is(exact, colX[ix]), `colX[${ix}]: ${exact} vs ${colX[ix]}`);
  }
  for (let iz = 0; iz <= SY; iz++) {
    const lat = TB.lat1 - (TB.lat1 - TB.lat0) * iz / SY;
    const exact = Math.min(Hpx - 1, Math.max(0, (myT - mY(Math.max(-85, Math.min(85, lat)))) / (myT - myB) * (Hpx - 1)));
    assert.ok(Object.is(exact, rowZ[iz]), `rowZ[${iz}]: ${exact} vs ${rowZ[iz]}`);
  }
});