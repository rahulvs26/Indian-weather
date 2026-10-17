/* v7.22l — a dependency-free ESRI shapefile + dbf reader, so the Shape files/ folder can be read
   without installing anything (this machine has no package access). Supports the geometry types
   that matter here: point (1), polyline (3), polygon (5) and multipoint (8), plus MultiPatch is
   ignored. Also reads the .dbf attribute table.

   Header layout is fixed: 100-byte header, then 32-bit big-endian file length in 16-bit words,
   version 1000 little-endian, shape type at offset 32. Each record: 8-byte header
   (number BE, content length in 16-bit words BE) then the shape body.

   Polygon records carry clockwise outer rings and counterclockwise holes, which is the opposite of
   the GeoJSON right-hand rule, so ringIndex -1 / >= 0 is preserved as `outer` so the caller can
   convert without guessing. */
import { readFileSync } from "node:fs";

/* Numbers come out of a DataView, never by accumulating bytes.
   MEASURED: byte-by-byte accumulation of an 8-byte double runs past 2^53 before the last byte, so
   every coordinate with an exponent above about 4 (i.e. any longitude or latitude) lost its low
   bits and came back as nonsense - the first version of this reader reported 1e22 km2 for
   polygons that are a few hundred square metres. */
function viewer(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    i32: (o) => dv.getInt32(o, true),
    u32: (o) => dv.getUint32(o, true),
    i32be: (o) => dv.getInt32(o, false),
    f64: (o) => dv.getFloat64(o, true),
    bytes: (o, n) => buf.subarray(o, o + n),
    str: (o, n) => buf.toString("latin1", o, o + n),
  };
}

export function readDbf(path) {
  const buf = readFileSync(path);
  const V = viewer(buf);
  const nRec = V.i32(4);
  const hdrLen = V.u32(8) & 0xffff;
  const recLen = V.u32(10) & 0xffff;
  const fields = [];
  let p = 32;
  while (p < hdrLen - 1 && buf[p] !== 0x0d) {
    fields.push({
      name: V.str(p, 11).replace(/\0.*$/, "").trim(),
      type: V.str(p + 11, 1),
      len: buf[p + 16],
      dec: buf[p + 17],
    });
    p += 32;
  }
  const rows = [];
  let r = hdrLen;
  for (let i = 0; i < nRec && r + recLen <= buf.length; i++, r += recLen) {
    const row = {};
    let q = r + 1;                                  /* byte 0 is the deletion flag */
    for (const f of fields) {
      const v = V.str(q, f.len).trim();
      q += f.len;
      if (f.type === "N" || f.type === "F") {
        const n = parseFloat(v);
        row[f.name] = Number.isFinite(n) ? n : null;
      } else row[f.name] = v;
    }
    rows.push(row);
  }
  return { fields, rows };
}

export function readShp(path) {
  const buf = readFileSync(path);
  const V = viewer(buf);
  const fileWords = V.i32be(24);
  const shapeType = V.i32(32);
  const out = [];
  let p = 100;
  const end = Math.min(buf.length, fileWords * 2);
  while (p + 8 <= end) {
    const contentWords = V.i32be(p + 4);
    const len = contentWords * 2;
    const body = p + 8;
    if (len <= 0 || body + len > buf.length) break;
    const type = V.i32(body);
    if (type === 0) { p = body + len; continue; }        /* empty */
    const rec = { type };
    if (type === 1 || type === 11 || type === 21) {      /* point / pointZ / pointM */
      rec.point = [V.f64(body + 4), V.f64(body + 12)];
    } else if (type === 8 || type === 18 || type === 28) { /* multipoint */
      const n = V.i32(body + 36);
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([V.f64(body + 40 + i * 16), V.f64(body + 48 + i * 16)]);
      rec.points = pts;
    } else if (type === 3 || type === 5 || type === 13 || type === 15 || type === 23 || type === 25) {
      const nParts = V.i32(body + 36);
      const nPoints = V.i32(body + 40);
      const parts = [], pts = [];
      for (let i = 0; i < nParts; i++) parts.push(V.i32(body + 44 + i * 4));
      const ptBase = body + 44 + nParts * 4;
      for (let i = 0; i < nPoints; i++) pts.push([V.f64(ptBase + i * 16), V.f64(ptBase + 8 + i * 16)]);
      const rings = [];
      for (let i = 0; i < nParts; i++) {
        const a = parts[i], b = i + 1 < nParts ? parts[i + 1] : nPoints;
        const ring = pts.slice(a, b);
        let area2 = 0;
        for (let j = 0, n = ring.length, k = n - 1; j < n; k = j++)
          area2 += (ring[k][0] - ring[j][0]) * (ring[k][1] + ring[j][1]);
        rings.push({ coords: ring, outer: type === 3 ? true : area2 > 0 });
      }
      rec.rings = rings;
      rec.bbox = [V.f64(body + 4), V.f64(body + 12), V.f64(body + 20), V.f64(body + 28)];
    }
    out.push(rec);
    p = body + len;
  }
  return { shapeType, records: out };
}

/* shapefile rings -> a GeoJSON geometry, fixing the winding so GeoJSON consumers (MapLibre's
   fill-extrusion especially) accept it */
export function toGeoJSON(rings) {
  if (!rings || !rings.length) return null;
  const outers = rings.filter(r => r.outer).map(r => fixWinding(r.coords, true));
  const holes = rings.filter(r => !r.outer).map(r => fixWinding(r.coords, false));
  if (!outers.length) return null;
  return outers.length === 1
    ? { type: "Polygon", coordinates: [outers[0], ...holes] }
    : { type: "MultiPolygon", coordinates: outers.map(o => [o, ...holes]) };
}
function fixWinding(ring, wantOuter) {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++)
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  const isOuter = a > 0;                        /* GeoJSON: exterior runs counter-clockwise */
  return (isOuter === wantOuter) ? ring : ring.slice().reverse();
}

/* ---- Lambert Conformal Conic -> WGS 84 lon/lat ----
   Every shapefile in the user's Shape files/ folder uses the same CRS, and it is NOT lat/lon:
     WGS 84, LCC, false easting 4,000,000 m, false northing 4,000,000 m, central meridian 80E,
     standard parallels 12.472944 and 35.172806, latitude of origin 24N.
   The raw coordinates are therefore around 4,000,000 - which is why the first pass measured
   1e22 km2 per polygon. This is the ellipsoidal inverse (Snyder), implemented here because there is
   no package access on this machine. Validated in data/_crs_check.mjs against the Dam shapefile,
   which carries both projected geometry and dm_lat/dm_long attributes. */
export function makeLccInverse({ a = 6378137, f = 1 / 298.257223563, fe = 4e6, fn = 4e6,
  lon0 = 80, lat1 = 12.472944, lat2 = 35.17280555, lat0 = 24 } = {}) {
  const e2 = 2 * f - f * f, e = Math.sqrt(e2);
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const mOf = phi => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const tOf = phi => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi)), e / 2);
  const p1 = rad(lat1), p2 = rad(lat2), p0 = rad(lat0);
  const n = Math.log(mOf(p1) / mOf(p2)) / Math.log(tOf(p1) / tOf(p2));
  const F = mOf(p1) / (n * Math.pow(tOf(p1), n));
  const rho0 = a * F * Math.pow(tOf(p0), n);
  return function inv(x, y) {
    const dx = x - fe, dy = rho0 - (y - fn);
    let rho = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(dx, dy);
    if (n < 0) { rho = -rho; theta = -theta; }
    const lon = rad(lon0) + theta / n;
    let t = Math.pow(rho / (a * F), 1 / n);
    let phi = Math.PI / 2 - 2 * Math.atan(t);
    for (let i = 0; i < 8; i++) {              /* Snyder's iteration; converges in 3-4 passes */
      const s = Math.sin(phi);
      phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - e * s) / (1 + e * s), e / 2));
    }
    return [deg(lon), deg(phi)];
  };
}

export const haversineKm = (a, b) => {
  const R = 6371, rd2 = x => x * Math.PI / 180;
  const dLa = rd2(b[1] - a[1]), dLo = rd2(b[0] - a[0]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rd2(a[1])) * Math.cos(rd2(b[1])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/* geodesic ring area, sphere R = 6371.0088 km — the same formula the sub-basin areas use, so the
   two sets of numbers are comparable */
export function ringAreaKm2(ring) {
  if (!ring || ring.length < 3) return 0;
  const R = 6371.0088, rd2 = x => x * Math.PI / 180;
  let total = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    total += (rd2(p2[0]) - rd2(p1[0])) * (2 + Math.sin(rd2(p1[1])) + Math.sin(rd2(p2[1])));
  }
  return Math.abs(total * R * R / 2);
}