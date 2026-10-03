#!/usr/bin/env node
// tools/build_world.mjs — generates site/data/world.js (country data for the 3D globe, site/js/globe.js).
//
// HOW TO RUN (re-runnable; dependencies are installed OUTSIDE the repo, never commit node_modules):
//
//   npm i --prefix /tmp/world-deps world-atlas@2 topojson-client@3 i18n-iso-countries@7
//   WORLD_DEPS=/tmp/world-deps node tools/build_world.mjs
//
//   Options (env):  WORLD_RES=50m|110m   (default 50m — Natural Earth 1:50m keeps every sovereign
//                                        country incl. Palestine, Syria, Iraq, Egypt and Türkiye)
//                   WORLD_EPS=0.06       (Douglas–Peucker tolerance in degrees for border lines)
//                   WORLD_DOTS=36000     (points on the fibonacci sphere used for the dotted land)
//
// Sources: Natural Earth countries via the `world-atlas` package (TopoJSON, public domain),
// decoded with `topojson-client`; Arabic names from `i18n-iso-countries` (langs/ar.json) through
// ISO 3166 numeric → alpha-2 (English Natural Earth name as fallback). The five board nationalities
// use the brochure's own wording (content/brochure.txt lines 318–322), the HQ labels come from
// lines 45–46 and the arcs' meaning from line 7 — all read verbatim from the brochure here.
//
// OUTPUT SCHEMA — `window.TAKAMUL_WORLD = {...}` (a classic script, no fetch, works from file://):
//   v        1                       schema version
//   q        20                      quantisation: every coordinate is an integer = degrees × q
//   arcs     [[x0,y0, dx1,dy1, …]]   shared border/coast polylines; first point absolute, the rest
//                                    delta-encoded ([lon×q, lat×q]). Each arc is drawn exactly once,
//                                    so neighbouring countries share their common border line.
//                                    Segments lying on the ±180° seam or on the −90° pole edge are
//                                    data artefacts: the renderer skips them.
//   countries [{ id, iso2, ar, en, bbox, c, rings }]
//            id    ISO 3166-1 numeric ("792") or "" when Natural Earth has none (Kosovo, …)
//            iso2  ISO alpha-2 ("TR"), or "" when unknown
//            ar    Arabic name (fallback: English)            en  English (Natural Earth) name
//            bbox  [west, south, east, north] in q-units, in the country's unwrapped longitude range
//                  (east may exceed 180° × q for countries that cross the antimeridian, e.g. Russia)
//            c     [lon, lat] label/anchor point in q-units (centroid of the largest ring)
//            rings [[arcRef, …], …] closed rings (outer rings and holes alike — the renderer uses
//                  the even-odd rule). arcRef >= 0 → arcs[arcRef]; arcRef < 0 → arcs[~arcRef] reversed.
//   dots     { n, i, c }   precomputed dotted-land field on a fibonacci sphere of n points:
//                          point k: y = 1 − 2k/(n−1), r = √(1−y²), θ = k·π(3−√5), x = r·cosθ, z = r·sinθ
//                          (lon = atan2(x, z), lat = asin(y)). `i` = delta-encoded indices k of the points
//                          that fall on land, `c` = index into `countries` for each of them.
//   hq       { iso2:"TR", city:"إسطنبول", lon, lat }          Istanbul head office
//   boardNationalities  ["TR","SY","PS","IQ","EG"]            brochure lines 318–322
//   labels   { hqTitle, hqText, motto, board:[5 names] }      verbatim brochure lines (45, 46, 7, 318–322)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.WORLD_DEPS ? path.resolve(process.env.WORLD_DEPS) : ROOT;
const require = createRequire(path.join(DEPS, 'package.json'));
let topojson, countriesLib, ar, topo;
const RES = process.env.WORLD_RES || '50m';
try {
  topojson = require('topojson-client');
  countriesLib = require('i18n-iso-countries');
  ar = require('i18n-iso-countries/langs/ar.json');
  topo = require(`world-atlas/countries-${RES}.json`);
} catch (e) {
  console.error('Missing dependencies. Install them outside the repo, e.g.:\n' +
    '  npm i --prefix /tmp/world-deps world-atlas@2 topojson-client@3 i18n-iso-countries@7\n' +
    '  WORLD_DEPS=/tmp/world-deps node tools/build_world.mjs\n\n' + e.message);
  process.exit(1);
}
countriesLib.registerLocale(ar);

const Q = 20;
const EPS = Number(process.env.WORLD_EPS || 0.06);
const NDOTS = Number(process.env.WORLD_DOTS || 36000);
const DEG = Math.PI / 180;

// ---- brochure (verbatim labels) -------------------------------------------------------------
const lines = fs.readFileSync(path.join(ROOT, 'content', 'brochure.txt'), 'utf8').split('\n');
const L = n => lines[n - 1].replace(/^[●✔◆]\s+/, '').trim();
const BOARD = ['TR', 'SY', 'PS', 'IQ', 'EG'];
const boardNames = [L(318), L(319), L(320), L(321), L(322)];
const expect = ['تركيا', 'سوريا', 'فلسطين', 'العراق', 'مصر'];
if (boardNames.join() !== expect.join() || L(45) !== 'المقر الرئيسي' || !L(46).includes('إسطنبول') || !L(7).includes('إسطنبول')) {
  console.error('brochure line numbers moved — update build_world.mjs', boardNames, L(45), L(46), L(7));
  process.exit(1);
}

// Natural Earth features without an ISO numeric code.
const NO_ISO = {
  'Kosovo': { iso2: 'XK' },
  'N. Cyprus': { iso2: '', ar: 'شمال قبرص' },
  'Somaliland': { iso2: '', ar: 'أرض الصومال' },
  'Indian Ocean Ter.': { iso2: '', ar: 'أقاليم المحيط الهندي الأسترالية' },
  'Siachen Glacier': { iso2: '', ar: 'نهر سياتشن الجليدي' },
};

// ---- decode the topology into absolute arcs (lon/lat degrees) -------------------------------
const tf = topo.transform;
const absArcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(p => {
    if (tf) { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; }
    return [p[0], p[1]];
  });
});

// Douglas–Peucker on one polyline (cos(lat)-scaled planar distance); keeps both endpoints.
function dp(pts, eps) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const k = Math.cos(((ay + by) / 2) * DEG);
    const dx = (bx - ax) * k, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = (pts[i][0] - ax) * k, py = pts[i][1] - ay;
      let d;
      if (len2 === 0) d = Math.hypot(px, py);
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        d = Math.hypot(px - t * dx, py - t * dy);
      }
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// A closed arc (an island drawn as one arc) must keep a real shape: split it at its farthest point.
function simplifyArc(pts, eps) {
  const n = pts.length;
  const closed = n > 3 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1];
  let out;
  if (closed) {
    let far = 1, fd = -1;
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
      if (d > fd) { fd = d; far = i; }
    }
    const a = dp(pts.slice(0, far + 1), eps), b = dp(pts.slice(far), eps);
    out = a.concat(b.slice(1));
    if (out.length < 4) { // tiny island: keep a quadrilateral of evenly spaced original points
      const q1 = Math.floor((n - 1) / 3), q2 = Math.floor(2 * (n - 1) / 3);
      out = [pts[0], pts[q1], pts[q2], pts[n - 1]];
    }
  } else out = dp(pts, eps);
  // quantise + drop consecutive duplicates (always keep 2 points for open arcs)
  const qp = [];
  for (const [x, y] of out) {
    const p = [Math.round(x * Q), Math.round(y * Q)];
    const last = qp[qp.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) qp.push(p);
  }
  if (qp.length === 1) qp.push(qp[0].slice());
  return qp;
}

// ---- geometry helpers -----------------------------------------------------------------------
const ringsOf = g => g.type === 'Polygon' ? g.arcs : g.type === 'MultiPolygon' ? g.arcs.flat() : [];
const arcPts = ref => ref >= 0 ? absArcs[ref] : absArcs[~ref].slice().reverse();
// Natural Earth rings here are NOT cut at the antimeridian (Russia, Fiji, Antarctica wrap across
// ±180°). For planar maths (area, centroid, point-in-polygon, bbox) a ring is "unwrapped" so that
// consecutive longitudes never jump by more than 180°; a ring that encircles a pole is closed
// through that pole. Point tests then try lon, lon − 360 and lon + 360.
function unwrap(c) {
  const out = [[c[0][0], c[0][1]]];
  for (let i = 1; i < c.length; i++) {
    let x = c[i][0];
    const px = out[i - 1][0];
    while (x - px > 180) x -= 360;
    while (x - px < -180) x += 360;
    out.push([x, c[i][1]]);
  }
  const shift = out[out.length - 1][0] - out[0][0];
  if (Math.abs(shift) > 180) { // polar ring: close it through the pole it encircles
    const pole = out.reduce((s, p) => s + p[1], 0) < 0 ? -90 : 90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
}
function ringCoords(ring) {
  const out = [];
  ring.forEach((ref, k) => { const p = arcPts(ref); out.push(...(k ? p.slice(1) : p)); });
  return unwrap(out);
}
function ringArea(c) { // approx area in deg² scaled by cos(lat)
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    a += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1]) * Math.cos(((c[i][1] + c[j][1]) / 2) * DEG);
  }
  return Math.abs(a / 2);
}
function centroid(c) {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const f = c[j][0] * c[i][1] - c[i][0] * c[j][1];
    a += f; x += (c[j][0] + c[i][0]) * f; y += (c[j][1] + c[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) { // degenerate: mean of points
    const m = c.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / c.length, m[1] / c.length];
  }
  return [x / (3 * a), y / (3 * a)];
}
function inRing3(lon, lat, c) { return inRing(lon, lat, c) !== inRing(lon - 360, lat, c) !== inRing(lon + 360, lat, c); }
function inRing(lon, lat, c) {
  let ins = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---- countries ------------------------------------------------------------------------------
const MIN_RING_AREA = Number(process.env.WORLD_MIN_RING || 0.01); // deg²; smaller extra islands are dropped
const geoms = topo.objects.countries.geometries.filter(g => ringsOf(g).length);
const raw = geoms.map(g => {
  const name = g.properties.name;
  let iso2 = g.id ? countriesLib.numericToAlpha2(g.id) || '' : (NO_ISO[name] || {}).iso2 || '';
  let arName = (iso2 && countriesLib.getName(iso2, 'ar')) || (NO_ISO[name] || {}).ar || name;
  const bi = BOARD.indexOf(iso2);
  if (bi >= 0) arName = boardNames[bi];
  const rings = ringsOf(g).map(r => ({ arcs: r, coords: ringCoords(r) }));
  rings.forEach(r => { r.area = ringArea(r.coords); });
  const largest = rings.reduce((m, r) => (r.area > m.area ? r : m), rings[0]);
  const meanLon = r => r.coords.reduce((s, p) => s + p[0], 0) / r.coords.length;
  const ref = meanLon(largest);
  rings.forEach(r => { // keep all rings of a country in one continuous longitude range
    const d = Math.round((ref - meanLon(r)) / 360) * 360;
    if (d) r.coords = r.coords.map(p => [p[0] + d, p[1]]);
  });
  const kept = rings.filter(r => r === largest || r.area >= MIN_RING_AREA || bi >= 0);
  return { id: g.id || '', iso2, ar: arName, en: name, rings, kept, largest };
});
for (const iso of BOARD) if (!raw.some(c => c.iso2 === iso)) { console.error('missing country', iso); process.exit(1); }

// ---- arcs actually used, simplified, re-indexed ---------------------------------------------
const used = new Map();
const outArcs = [];
const refOf = ref => {
  const k = ref >= 0 ? ref : ~ref;
  if (!used.has(k)) { used.set(k, outArcs.length); outArcs.push(simplifyArc(absArcs[k], EPS)); }
  const j = used.get(k);
  return ref >= 0 ? j : ~j;
};
const countries = raw.map(c => {
  const all = c.kept.flatMap(r => r.coords);
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of all) {
    bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
  }
  let cen = centroid(c.largest.coords);
  cen[0] = ((cen[0] + 540) % 360) - 180;
  if (!inRing3(cen[0], cen[1], c.largest.coords)) { // concave shapes: nearest ring vertex to the centroid
    let best = c.largest.coords[0], bd = Infinity;
    for (const p of c.largest.coords) { const d = (p[0] - cen[0]) ** 2 + (p[1] - cen[1]) ** 2; if (d < bd) { bd = d; best = p; } }
    cen = [((best[0] + 540) % 360) - 180, best[1]];
  }
  return {
    id: c.id, iso2: c.iso2, ar: c.ar, en: c.en,
    bbox: bbox.map(v => Math.round(v * Q)),
    c: cen.map(v => Math.round(v * Q)),
    rings: c.kept.map(r => r.arcs.map(refOf)),
  };
});
const encArcs = outArcs.map(p => {
  const o = [p[0][0], p[0][1]];
  for (let i = 1; i < p.length; i++) o.push(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return o;
});

// ---- dotted land field (full-resolution polygons for accuracy) ------------------------------
const pipCountries = geoms.map(g => {
  const geo = topojson.feature(topo, g).geometry;
  const coords = (geo.type === 'Polygon' ? geo.coordinates : geo.coordinates.flat()).map(unwrap);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of coords) for (const [x, y] of r) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return { coords, b };
});
const GA = Math.PI * (3 - Math.sqrt(5));
const dotIdx = [], dotC = [];
for (let k = 0; k < NDOTS; k++) {
  const y = 1 - (k / (NDOTS - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = GA * k;
  const x = Math.cos(th) * r, z = Math.sin(th) * r;
  const lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG;
  for (let ci = 0; ci < pipCountries.length; ci++) {
    const pc = pipCountries[ci];
    if (lat < pc.b[1] || lat > pc.b[3]) continue;
    const lo = lon >= pc.b[0] && lon <= pc.b[2] ? lon : lon + 360 >= pc.b[0] && lon + 360 <= pc.b[2] ? lon + 360
      : lon - 360 >= pc.b[0] && lon - 360 <= pc.b[2] ? lon - 360 : null;
    if (lo === null) continue;
    let ins = false;
    for (const ring of pc.coords) if (inRing3(lo, lat, ring)) ins = !ins;
    if (ins) { dotIdx.push(k); dotC.push(ci); break; }
  }
}
const dotDelta = dotIdx.map((k, i) => (i ? k - dotIdx[i - 1] : k));

// ---- write ---------------------------------------------------------------------------------
const world = {
  v: 1, q: Q,
  arcs: encArcs,
  countries,
  dots: { n: NDOTS, i: dotDelta, c: dotC },
  hq: { iso2: 'TR', city: 'إسطنبول', lon: 28.98, lat: 41.01 },
  boardNationalities: BOARD,
  labels: { hqTitle: L(45), hqText: L(46), motto: L(7), board: boardNames },
};
const banner = '// GENERATED by tools/build_world.mjs from Natural Earth (world-atlas ' + RES + ') + i18n-iso-countries — do not edit by hand.\n' +
  '// Schema: see the header of tools/build_world.mjs. ' + countries.length + ' countries, ' + encArcs.length + ' arcs, ' + dotIdx.length + ' land dots.\n';
const js = banner + 'window.TAKAMUL_WORLD = ' + JSON.stringify(world) + ';\n';
const out = path.join(ROOT, 'site', 'data', 'world.js');
fs.writeFileSync(out, js);
const pts = encArcs.reduce((s, a) => s + a.length / 2, 0);
console.log(`world.js: ${(js.length / 1024).toFixed(1)} KB (${Buffer.byteLength(js) } bytes) — ${countries.length} countries, ` +
  `${encArcs.length} arcs / ${pts} points, ${dotIdx.length}/${NDOTS} land dots`);
