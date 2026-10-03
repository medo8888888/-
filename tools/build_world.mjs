#!/usr/bin/env node
// tools/build_world.mjs — generates site/data/world.js (data for the 3D globe, site/js/globe.js).
//
// The globe shows ONLY what the brochure names: the five board nationalities (content/brochure.txt
// lines 318–322: تركيا، سوريا، فلسطين، العراق، مصر), Türkiye as the head-office country, and the two
// cities the brochure names (إسطنبول L46/L131 — head office; أنقرة L135). The rest of the land is an
// anonymous "context" dot field (positions only: no names, no polygons) so the globe still reads
// as the Earth.
//
// HOW TO RUN (re-runnable; dependencies are installed OUTSIDE the repo, never commit node_modules):
//
//   npm i --prefix /tmp/world-deps world-atlas@2 topojson-client@3
//   WORLD_DEPS=/tmp/world-deps node tools/build_world.mjs
//
//   Options (env):  WORLD_RES=50m|110m  (default 50m)     WORLD_EPS=0.02  (Douglas–Peucker, degrees)
//                   WORLD_LAND=16000   (context sphere)    WORLD_FINE=240000 (sphere for the 5 countries)
//
// Source: Natural Earth countries via `world-atlas` (TopoJSON, public domain) decoded with
// `topojson-client`. All visible words come verbatim from the brochure (read here by line number).
//
// OUTPUT SCHEMA — `window.TAKAMUL_WORLD = {...}` (a classic script, no fetch, works from file://):
//   v         2                    schema version
//   q         20                   quantisation: coordinates are integers = degrees × q
//   countries [{ iso2, ar, en, role, c, bbox, rings, d }]   exactly 5, in brochure order (TR SY PS IQ EG)
//             iso2   ISO alpha-2               ar  Arabic name, verbatim brochure L318–L322
//             en     English (Natural Earth)   role "hq" (Türkiye) | "board"
//             c      [lon, lat] label anchor (q-units)      bbox [west, south, east, north] (q-units)
//             rings  [[x0,y0, dx1,dy1, …]] closed rings (outer + holes, even-odd), first point absolute,
//                    the rest delta-encoded, q-units
//             d      delta-encoded indices k of the points of the FINE fibonacci sphere inside the country
//   fine      n of the fine fibonacci sphere used by countries[].d
//   land      { n, i }  context land: fibonacci sphere of n points, i = delta-encoded indices k of the
//                       points on land OUTSIDE the five countries (anonymous; never labelled)
//             fibonacci point k of n: y = 1 − 2k/(n−1), r = √(1−y²), θ = k·π(3−√5), x = r·cosθ, z = r·sinθ
//             (lon = atan2(x, z), lat = asin(y))
//   cities    [{ ar, iso2, lon, lat, hq? }]   named cities from the brochure: إسطنبول (hq:1), أنقرة
//   targets   [{ iso2, lon, lat }]            unnamed arc end points (one inside each other country);
//                                             arcs run from Istanbul to Ankara + these. Never labelled.
//   labels    { hqTitle, hqText, motto, board:[5 names] }   verbatim brochure lines 45, 46, 7, 318–322
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DEPS = process.env.WORLD_DEPS ? path.resolve(process.env.WORLD_DEPS) : ROOT;
const require = createRequire(path.join(DEPS, 'package.json'));
let topojson, topo;
const RES = process.env.WORLD_RES || '50m';
try {
  topojson = require('topojson-client');
  topo = require(`world-atlas/countries-${RES}.json`);
} catch (e) {
  console.error('Missing dependencies. Install them outside the repo, e.g.:\n' +
    '  npm i --prefix /tmp/world-deps world-atlas@2 topojson-client@3\n' +
    '  WORLD_DEPS=/tmp/world-deps node tools/build_world.mjs\n\n' + e.message);
  process.exit(1);
}

const Q = 20;
const EPS = Number(process.env.WORLD_EPS || 0.02);
const NLAND = Number(process.env.WORLD_LAND || 16000);
const NFINE = Number(process.env.WORLD_FINE || 240000);
const DEG = Math.PI / 180;
const GA = Math.PI * (3 - Math.sqrt(5));

// ---- brochure (verbatim labels) -------------------------------------------------------------
const lines = fs.readFileSync(path.join(ROOT, 'content', 'brochure.txt'), 'utf8').split('\n');
const L = n => lines[n - 1].replace(/^[●✔◆]\s+/, '').trim();
const BOARD = ['TR', 'SY', 'PS', 'IQ', 'EG'];
const NUMERIC = { TR: '792', SY: '760', PS: '275', IQ: '368', EG: '818' };
const boardNames = [L(318), L(319), L(320), L(321), L(322)];
const expect = ['تركيا', 'سوريا', 'فلسطين', 'العراق', 'مصر'];
if (boardNames.join() !== expect.join() || L(45) !== 'المقر الرئيسي' || !L(46).includes('إسطنبول') ||
    !L(7).includes('إسطنبول') || L(131) !== 'إسطنبول' || L(135) !== 'أنقرة') {
  console.error('brochure line numbers moved — update build_world.mjs', boardNames, L(45), L(46), L(7), L(131), L(135));
  process.exit(1);
}

// ---- geometry helpers -----------------------------------------------------------------------
function dp(pts, eps) { // Douglas–Peucker (cos(lat)-scaled planar distance); keeps both endpoints
  const n = pts.length;
  if (n <= 3) return pts.slice();
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
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyRing(ring) { // closed ring: split at the farthest vertex so both halves keep shape
  let far = 1, fd = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const out = dp(ring.slice(0, far + 1), EPS).concat(dp(ring.slice(far), EPS).slice(1));
  const qp = [];
  for (const [x, y] of out) {
    const p = [Math.round(x * Q), Math.round(y * Q)], last = qp[qp.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) qp.push(p);
  }
  return qp;
}
function ringArea(c) {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j][0] - c[i][0]) * (c[j][1] + c[i][1]) * Math.cos(((c[i][1] + c[j][1]) / 2) * DEG);
  return Math.abs(a / 2);
}
function centroid(c) {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const f = c[j][0] * c[i][1] - c[i][0] * c[j][1];
    a += f; x += (c[j][0] + c[i][0]) * f; y += (c[j][1] + c[i][1]) * f;
  }
  return [x / (3 * a), y / (3 * a)];
}
function inRing(lon, lat, c) {
  let ins = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function unwrap(c) { // keep consecutive longitudes within 180°; close polar rings through the pole
  const out = [[c[0][0], c[0][1]]];
  for (let i = 1; i < c.length; i++) {
    let x = c[i][0];
    const px = out[i - 1][0];
    while (x - px > 180) x -= 360;
    while (x - px < -180) x += 360;
    out.push([x, c[i][1]]);
  }
  if (Math.abs(out[out.length - 1][0] - out[0][0]) > 180) {
    const pole = out.reduce((s, p) => s + p[1], 0) < 0 ? -90 : 90;
    out.push([out[out.length - 1][0], pole], [out[0][0], pole]);
  }
  return out;
}
function polyOf(g) { // full-resolution rings + bbox for point-in-polygon
  const geo = topojson.feature(topo, g).geometry;
  const rings = (geo.type === 'Polygon' ? geo.coordinates : geo.coordinates.flat()).map(unwrap);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return { rings, b };
}
function contains(p, lon, lat) {
  if (lat < p.b[1] || lat > p.b[3]) return false;
  const lo = lon >= p.b[0] && lon <= p.b[2] ? lon : lon + 360 >= p.b[0] && lon + 360 <= p.b[2] ? lon + 360
    : lon - 360 >= p.b[0] && lon - 360 <= p.b[2] ? lon - 360 : null;
  if (lo === null) return false;
  let ins = false;
  for (const r of p.rings) if (inRing(lo, lat, r)) ins = !ins;
  return ins;
}
const fib = (k, n) => {
  const y = 1 - (k / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = GA * k;
  return [Math.atan2(Math.cos(th) * r, Math.sin(th) * r) / DEG, Math.asin(y) / DEG];
};
const delta = a => a.map((k, i) => (i ? k - a[i - 1] : k));
const encRing = r => r.flatMap((p, i) => (i ? [p[0] - r[i - 1][0], p[1] - r[i - 1][1]] : p));

// ---- the five countries ---------------------------------------------------------------------
const geoms = topo.objects.countries.geometries.filter(g => g.type === 'Polygon' || g.type === 'MultiPolygon');
const MIN_RING = 0.004; // deg²: drop specks (tiny islets) from the outlines
const five = BOARD.map((iso, bi) => {
  const g = geoms.find(x => String(x.id) === NUMERIC[iso]);
  if (!g) { console.error('missing country', iso); process.exit(1); }
  const poly = polyOf(g);
  const big = poly.rings.reduce((m, r) => (ringArea(r) > ringArea(m) ? r : m), poly.rings[0]);
  let c = centroid(big);
  if (!inRing(c[0], c[1], big)) { let bd = Infinity; for (const p of big) { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2; if (d < bd) { bd = d; c = p; } } }
  const rings = poly.rings.filter(r => r === big || ringArea(r) >= MIN_RING).map(simplifyRing).filter(r => r.length >= 4);
  const d = [];
  for (let k = 0; k < NFINE; k++) { const [lon, lat] = fib(k, NFINE); if (contains(poly, lon, lat)) d.push(k); }
  return {
    iso2: iso, ar: boardNames[bi], en: g.properties.name, role: iso === 'TR' ? 'hq' : 'board',
    c: c.map(v => Math.round(v * Q)), bbox: poly.b.map(v => Math.round(v * Q)),
    rings: rings.map(encRing), d: delta(d), poly,
  };
});

// ---- anonymous context land (everything else) -----------------------------------------------
const others = geoms.filter(g => !Object.values(NUMERIC).includes(String(g.id))).map(polyOf);
const land = [];
for (let k = 0; k < NLAND; k++) {
  const [lon, lat] = fib(k, NLAND);
  if (five.some(c => contains(c.poly, lon, lat))) continue;
  if (others.some(p => contains(p, lon, lat))) land.push(k);
}

// ---- write ---------------------------------------------------------------------------------
const world = {
  v: 2, q: Q,
  countries: five.map(({ poly, ...c }) => c),
  fine: NFINE,
  land: { n: NLAND, i: delta(land) },
  cities: [
    { ar: L(131), iso2: 'TR', lon: 28.98, lat: 41.01, hq: 1 },
    { ar: L(135), iso2: 'TR', lon: 32.86, lat: 39.93 },
  ],
  targets: [ // unnamed arc end points inside each board country (not labelled on the globe)
    { iso2: 'SY', lon: 36.29, lat: 33.51 },
    { iso2: 'PS', lon: 35.2, lat: 31.9 },
    { iso2: 'IQ', lon: 44.36, lat: 33.31 },
    { iso2: 'EG', lon: 31.24, lat: 30.04 },
  ],
  labels: { hqTitle: L(45), hqText: L(46), motto: L(7), board: boardNames },
};
const banner = '// GENERATED by tools/build_world.mjs from Natural Earth (world-atlas ' + RES + ') — do not edit by hand.\n' +
  '// Schema: see the header of tools/build_world.mjs. 5 countries (brochure L318–L322), ' + land.length + ' context land dots.\n';
const js = banner + 'window.TAKAMUL_WORLD = ' + JSON.stringify(world) + ';\n';
fs.writeFileSync(path.join(ROOT, 'site', 'data', 'world.js'), js);
console.log(`world.js: ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB — ` +
  five.map(c => `${c.iso2} ${c.rings.length} rings/${c.rings.reduce((s, r) => s + r.length / 2, 0)} pts/${c.d.length} dots`).join(', ') +
  `; ${land.length}/${NLAND} context dots`);
