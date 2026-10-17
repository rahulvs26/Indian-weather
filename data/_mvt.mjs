/* v7.20 — minimal Mapbox Vector Tile reader, no dependencies.
   The deck draws OpenFreeMap / OpenMapTiles vector tiles; those tiles already contain the real
   OpenStreetMap river geometry in the `waterway` layer (class=river|stream). Reading them directly
   means the shaped course uses EXACTLY the geometry the user can see on the map, with no third-party
   API, no CORS, and no extra download beyond the tiles the map fetches anyway.

   Implements just enough of the spec (mapbox vector tile 2.1):
     Tile{ layers:3 }  Layer{ version:15, name:1, features:2, keys:3, values:4, extent:5 }
     Feature{ id:1, tags:2 packed, type:3, geometry:4 packed }  Value{ 1 string, 2 float, 3 double,
     4 int64, 5 uint64, 6 sint64, 7 bool }
   Geometry: MoveTo=1, LineTo=2, ClosePath=7; arguments are zigzag varints; coordinates accumulate. */

function readVarint(bytes, pos) {
  let result = 0, shift = 0, b;
  do {
    b = bytes[pos++];
    result += (b & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (b & 0x80);
  return [result, pos];
}
const viewOf=bytes=>bytes.__dv||(bytes.__dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength));
/* walk the fields of one message, calling fn(fieldNo, wireType, value, valuePos) */
function eachField(bytes, start, end, fn) {
  let pos = start;
  while (pos < end) {
    let key;
    [key, pos] = readVarint(bytes, pos);
    const field = key >> 3, wire = key & 7;
    if (wire === 0) { let v; [v, pos] = readVarint(bytes, pos); fn(field, wire, v, pos); }
    else if (wire === 1) { fn(field, wire, viewOf(bytes).getFloat64(pos, true), pos); pos += 8; }
    else if (wire === 2) {
      let len; [len, pos] = readVarint(bytes, pos);
      fn(field, wire, pos, len);
      pos += len;
    }
    else if (wire === 5) { fn(field, wire, viewOf(bytes).getFloat32(pos, true), pos); pos += 4; }
    else break;                                   /* groups are not used in MVT */
  }
}
const utf8=(bytes,pos,len)=>new TextDecoder().decode(bytes.subarray(pos,pos+len));

/**
 * @param {Uint8Array} buf  the .pbf tile
 * @param {number} z @param {number} x @param {number} y  tile coordinates
 * @param {(layerName:string)=>boolean} want  which layers to decode (others are skipped)
 * @returns {Array<{layer:string,type:number,tags:Object,geom:Array<Array<[number,number]>>}>}
 */
export function decodeTile(buf, z, x, y, want) {
  const layers = [];
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  eachField(bytes, 0, bytes.length, (field, wire, value, value2) => {
    if (field !== 3 || wire !== 2) return;                    /* Tile.layers */
    const start = value, end = value + value2;
    let name = "", extent = 4096, keys = [], values = [], feats = [];
    eachField(bytes, start, end, (f2, w2, v2, v3) => {
      if (f2 === 15) { /* version */ }
      else if (f2 === 1 && w2 === 2) name = utf8(bytes, v2, v3);
      else if (f2 === 2 && w2 === 2) feats.push([v2, v2 + v3]);
      else if (f2 === 3 && w2 === 2) keys.push(utf8(bytes, v2, v3));
      else if (f2 === 4 && w2 === 2) values.push([v2, v2 + v3]);
      else if (f2 === 5) extent = v2;
    });
    if (want && !want(name)) return;
    /* Value messages */
    const vals = values.map(([s, e]) => {
      let out = null;
      eachField(bytes, s, e, (f, w, v, len) => {
        if (f === 1) out = utf8(bytes, v, len);
        else if (f === 2) out = v;
        else if (f === 3) out = v;
        else if (f === 4 || f === 5) out = v;
        else if (f === 6) out = (v >> 1) ^ -(v & 1);
        else if (f === 7) out = !!v;
      });
      return out;
    });
    /* Features */
    const out = [];
    for (const [fs, fe] of feats) {
      let type = 0, tagsPacked = null, geomPacked = null;
      eachField(bytes, fs, fe, (f, w, v, len) => {
        if (f === 2 && w === 2) tagsPacked = [v, v + len];
        else if (f === 3) type = v;
        else if (f === 4 && w === 2) geomPacked = [v, v + len];
      });
      if (!geomPacked || (type !== 1 && type !== 2 && type !== 3)) continue;    /* points, lines, polygons */
      const tags = {};
      if (tagsPacked) {
        const arr = [];
        let p = tagsPacked[0];
        while (p < tagsPacked[1]) { let v; [v, p] = readVarint(bytes, p); arr.push(v); }
        for (let i = 0; i + 1 < arr.length; i += 2) tags[keys[arr[i]]] = vals[arr[i + 1]];
      }
      /* geometry */
      const g = [];
      const rings = [];                 /* polygons (type 3) only */
      let ring = null;
      let p = geomPacked[0], cx = 0, cy = 0;
      while (p < geomPacked[1]) {
        let cmd; [cmd, p] = readVarint(bytes, p);
        const id = cmd & 7, count = cmd >> 3;
        if (id === 1) {
          /* MoveTo: for a line this is simply a new point; for a polygon it starts a ring */
          for (let k = 0; k < count; k++) {
            let dx, dy;
            [dx, p] = readVarint(bytes, p); [dy, p] = readVarint(bytes, p);
            cx += (dx >> 1) ^ -(dx & 1);
            cy += (dy >> 1) ^ -(dy & 1);
            /* MEASURED BUG FIXED HERE: a MoveTo command may carry several points, each starting a
               new ring. The first version only started a ring for k === 0 and appended the rest to
               it, which merged distinct rings and made whole watersheds unfindable by a
               point-in-polygon test (Mettur found no watershed at all). */
            if (type === 3) { ring = [[cx, cy]]; rings.push(ring); }
            else g.push([cx, cy]);
          }
        } else if (id === 2) {
          for (let k = 0; k < count; k++) {
            let dx, dy;
            [dx, p] = readVarint(bytes, p); [dy, p] = readVarint(bytes, p);
            cx += (dx >> 1) ^ -(dx & 1);
            cy += (dy >> 1) ^ -(dy & 1);
            if (type === 3) { if (ring) ring.push([cx, cy]); }
            else g.push([cx, cy]);
          }
        } else if (id === 7) {
          /* ClosePath: close the ring. The spec says the ring is implicitly closed, so the last
             point is dropped and the first point repeated, which keeps the ring explicit for
             GeoJSON and for the area calculation. */
          if (type === 3 && ring && ring.length > 1) {
            const [fx, fy] = ring[0];
            if (ring[ring.length - 1][0] !== fx || ring[ring.length - 1][1] !== fy) ring.push([fx, fy]);
          }
          ring = null;
        }
        else break;
      }
      if (type === 3) {
        const keep = rings.filter(r => r.length > 3);
        if (!keep.length) continue;
        out.push({ layer: name, type, tags, geom: keep });
      } else {
        if (!g.length) continue;
        out.push({ layer: name, type, tags, geom: type === 2 ? [g] : g });
      }
    }
    /* tile-local -> lon/lat */
    const n = Math.pow(2, z);
    const worldX = (x * extent);
    const worldY = (y * extent);
    for (const f of out) {
      for (const line of f.geom) {
        for (let i = 0; i < line.length; i++) {
          const px = line[i][0], py = line[i][1];
          const lon = (worldX + px) / (extent * n) * 360 - 180;
          const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (worldY + py) / (extent * n))));
          line[i] = [+(lon.toFixed(6)), +(latRad * 180 / Math.PI).toFixed(6)];
        }
      }
    }
    layers.push(...out);
  });
  return layers;
}
export default decodeTile;