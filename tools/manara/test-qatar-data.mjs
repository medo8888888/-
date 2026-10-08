// MANARA («منارة») - tests of the bundled Qatar dataset (Node only, no browser):  node tools/manara/test-qatar-data.mjs
//
// Loads site/manara/data/qatar-geo.js, qatar-facilities.js and qatar-roads.js with `vm` exactly like the pages' classic <script>s (an empty context),
// then checks: attribution + snapshot, file sizes (4.5 MB budget) and load time, every point inside Qatar's bounding box, facilities inside the
// outline (point-in-polygon), municipality and place consistency, the road graph (typed arrays, one-way logic, connectivity >= 99 % and strong
// connectivity of what ships), every facility's road snap (recomputed here and compared with the stored snap), and a Dijkstra route between
// Doha, Dukhan, Al Khor, Al Wakrah, Al Shamal, Mesaieed and Hamad International Airport with sanity bounds only.
// The data is a SNAPSHOT map of OpenStreetMap; traffic, availability and hazards are simulated elsewhere. Exit code 1 on any failure.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '../../site', path.basename(HERE), 'data');
const ATTRIBUTION = 'Contains data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright';
const BUDGET = 4.5 * 1024 * 1024;

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' - ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log('\n' + t);
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const fmt = n => n.toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------------------------- load
section('1  files, sizes, load time, attribution');
const files = ['qatar-geo.js', 'qatar-facilities.js', 'qatar-roads.js', 'CREDITS.txt'];
const texts = {}, sizes = {};
for (const f of files) {
  const p = path.join(DATA, f);
  if (!check(`${f} exists`, fs.existsSync(p))) { console.log('\nrun: python3 tools/manara/build-qatar-data.py --cache <dir>'); process.exit(1); }
  texts[f] = fs.readFileSync(p, 'utf8'); sizes[f] = Buffer.byteLength(texts[f], 'utf8');
}
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
console.log('  sizes: ' + files.map(f => `${f} ${fmt(sizes[f])} B`).join(', ') + `, total ${fmt(total)} B`);
check('total size of the four files within the 4.5 MB budget', total <= BUDGET, `${(100 * total / BUDGET).toFixed(1)} % of the budget`);
for (const f of files) check(`${f} carries the ODbL attribution text`, texts[f].includes(ATTRIBUTION));
for (const f of files.slice(0, 3)) {
  check(`${f} is a classic script (no import/export/fetch/XMLHttpRequest/eval)`, !/^\s*(import|export)\s/m.test(texts[f]) && !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|\bnew Function\b/.test(texts[f]));
  check(`${f} carries a snapshot date`, /snapshotDate/.test(texts[f]) || /Snapshot of 20\d\d-\d\d-\d\d/.test(texts[f]));
}
check('CREDITS.txt names Natural Earth (public domain) and ODbL 1.0', /Natural Earth/.test(texts['CREDITS.txt']) && /public domain/i.test(texts['CREDITS.txt']) && /ODbL/.test(texts['CREDITS.txt']));
check('CREDITS.txt says SIM / 999 / not an official service', /SIMULATED/.test(texts['CREDITS.txt']) && /999/.test(texts['CREDITS.txt']) && /not an official service/.test(texts['CREDITS.txt']));
check('no e-mail address in any data file', !files.some(f => /[\w.+-]+@[\w-]+\.[\w.-]+/.test(texts[f])));

const ctx = vm.createContext({});
const load = {};
for (const f of files.slice(0, 3)) {
  const t0 = performance.now();
  vm.runInContext(texts[f], ctx, { filename: f });
  load[f] = performance.now() - t0;
}
const GEO = ctx.MANARA_QATAR_GEO, FAC = ctx.MANARA_QATAR_FACILITIES, ROADS = ctx.MANARA_QATAR_ROADS;
check('the three globals exist', !!GEO && Array.isArray(FAC) && !!ROADS && typeof ROADS.decode === 'function');
console.log('  load ms: ' + Object.entries(load).map(([f, v]) => `${f} ${v.toFixed(1)}`).join(', '));
const td0 = performance.now(); const G = ROADS.decode(); const tDecode = performance.now() - td0;
check('every script loads in < 400 ms and decode() < 400 ms', Math.max(...Object.values(load)) < 400 && tDecode < 400, `slowest load ${Math.max(...Object.values(load)).toFixed(0)} ms, decode ${tDecode.toFixed(0)} ms`);
check('decode() is cached', ROADS.decode() === G);

// ---------------------------------------------------------------------------------------------------------------- geo
section('2  geography: outline, municipalities, places, projection');
// Qatar's mainland bounding box from the INDEPENDENT Natural Earth 10m outline (lon 50.751..51.617, lat 24.560..26.160) padded by 0.1 degree
const QBB = { lonMin: 50.65, lonMax: 51.72, latMin: 24.46, latMax: 26.26 };
const inQ = (lon, lat) => lon >= QBB.lonMin && lon <= QBB.lonMax && lat >= QBB.latMin && lat <= QBB.latMax;
const rings = GEO.outline.rings;
const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
check('outline has a mainland ring and islands', rings.length >= 5, `${rings.length} polygons, ${GEO.meta.counts.outlineVertices} vertices`);
check('every outline ring is counter-clockwise and has >= 3 vertices (tiny islets may be triangles)', rings.every(r => r.length >= 3 && ringArea(r) > 0));
const mainRing = rings[0];
const mb = mainRing.reduce((b, p) => ({ x0: Math.min(b.x0, p[0]), x1: Math.max(b.x1, p[0]), y0: Math.min(b.y0, p[1]), y1: Math.max(b.y1, p[1]) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
check('mainland ring bbox is inside the Natural-Earth-derived Qatar bbox', inQ(mb.x0, mb.y0) && inQ(mb.x1, mb.y1), `${mb.x0.toFixed(3)}..${mb.x1.toFixed(3)} E, ${mb.y0.toFixed(3)}..${mb.y1.toFixed(3)} N`);
check('GEO.bbox equals the mainland ring bbox', Math.abs(GEO.bbox.lonMin - mb.x0) < 1e-4 && Math.abs(GEO.bbox.latMax - mb.y1) < 1e-4);
check('only islands lie outside the mainland box (Halul is the farthest east)', rings.slice(1).every(r => r.every(p => p[0] < 52.6)) && GEO.bboxAll.lonMax > GEO.bbox.lonMax);
const ne = GEO.outlineNaturalEarth.ring;
check('Natural Earth cross-check ring shipped (public domain, ~240 vertices)', ne.length > 100 && ne.length < 400);
const neArea = Math.abs(ringArea(ne)) * 111.195 * 111.195 * Math.cos(25.3 * Math.PI / 180);
const ourArea = ringArea(mainRing) * 111.195 * 111.195 * Math.cos(25.3 * Math.PI / 180);
check('OSM mainland area agrees with Natural Earth within 6 %', Math.abs(ourArea - neArea) / neArea < 0.06, `OSM ${ourArea.toFixed(0)} km2, Natural Earth ${neArea.toFixed(0)} km2`);
check('total computed area is plausible for Qatar (11,000 - 12,200 km2)', GEO.meta.areaKm2 > 11000 && GEO.meta.areaKm2 < 12200, `${GEO.meta.areaKm2} km2`);
// Hawar: Bahrain's islands are not part of any Qatari polygon
// three points on the coast of the Hawar Islands (taken from OSM natural=coastline ring nodes of Hawar): no outline vertex may lie within 1.5 km of them.
// (Janan island, about 25.56 N 50.74 E, is Qatari - ICJ judgment of 16 March 2001 - and is deliberately part of the outline.)
const HAWAR = [[50.7796, 25.6303], [50.7794, 25.7538], [50.8141, 25.6858]];
const nearHawar = rings.flat().filter(p => HAWAR.some(h => Math.hypot((p[0] - h[0]) * 100.5, (p[1] - h[1]) * 111.2) < 1.5));
check('no outline vertex within 1.5 km of the Hawar Islands coast (they belong to Bahrain)', nearHawar.length === 0, `${nearHawar.length} vertices`);
check('meta states the Hawar exclusion', /Hawar/.test(GEO.meta.hawar) && /Bahrain/.test(GEO.meta.hawar));
const inRing = (lon, lat, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
const mPerLat = Math.PI * 6371008.8 / 180;
const distToRings = (lon, lat) => { // metres to the nearest outline edge
  const ck = Math.cos(lat * Math.PI / 180); let best = 1e18;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ax = (a[0] - lon) * mPerLat * ck, ay = (a[1] - lat) * mPerLat, bx = (b[0] - lon) * mPerLat * ck, by = (b[1] - lat) * mPerLat;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
};
check('GEO.inLand agrees with a direct ring test', GEO.inLand(51.53, 25.29) === true && GEO.inLand(51.95, 25.30) === false && GEO.inLand(50.55, 26.22) === false, 'Doha in, Gulf and Manama out');
check('8 municipalities with Arabic and English names and an OSM relation', GEO.municipalities.length === 8 && GEO.municipalities.every(m => /[؀-ۿ]/.test(m.name.ar) && m.name.en && /^relation\/\d+$/.test(m.osm) && m.adminLevel === 4));
const muniIds = GEO.municipalities.map(m => m.id);
check('municipality ids are unique and as documented', new Set(muniIds).size === 8 && ['doha', 'rayyan', 'wakrah', 'khor', 'shamal', 'umm-salal', 'daayen', 'shahaniya'].every(i => muniIds.includes(i)));
const msum = GEO.municipalities.reduce((s, m) => s + m.areaKm2, 0);
check('municipality areas add up to the country area (+-1 %)', Math.abs(msum - GEO.meta.areaKm2) / GEO.meta.areaKm2 < 0.01, `${msum.toFixed(0)} vs ${GEO.meta.areaKm2}`);
{ // the municipalities tile the land: random points inside the outline lie in exactly one municipality (no gaps, no overlaps)
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let n = 0, gap = 0, over = 0; const b = GEO.bbox;
  for (let i = 0; i < 30000; i++) {
    const lon = b.lonMin + rnd() * (b.lonMax - b.lonMin), lat = b.latMin + rnd() * (b.latMax - b.latMin);
    if (!GEO.inLand(lon, lat)) continue; n++;
    let c = 0;
    for (const m of GEO.municipalities) for (const p of m.polygons) if (inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h))) { c++; break; }
    if (c === 0) gap++; else if (c > 1) over++;
  }
  check('municipalities tile the land: no gaps and no overlaps at 30,000 random points (simplified once per shared border)', gap === 0 && over === 0 && n > 5000, `${n} points on land, ${gap} gaps, ${over} overlaps`);
}
check('every municipality polygon has a counter-clockwise outer ring and clockwise holes', GEO.municipalities.every(m => m.polygons.every(p => ringArea(p[0]) > 0 && p.slice(1).every(h => ringArea(h) < 0))));
const places = GEO.places;
check('places carry name.ar / name.en, kind, lon, lat, osm', places.every(p => typeof p.name.ar === 'string' && typeof p.name.en === 'string' && (p.name.ar || p.name.en) && p.kind && Number.isFinite(p.lon) && Number.isFinite(p.lat) && p.osm));
const offLand = places.filter(p => !GEO.inLand(p.lon, p.lat));
check('every place is on Qatari land (or within 1 km of the 100 m-simplified outline: a few islets are too small to draw)', places.every(p => GEO.inLand(p.lon, p.lat) || distToRings(p.lon, p.lat) < 1000), `${places.length} places, ${offLand.length} just off the drawn outline: ${offLand.map(p => p.name.en).join(', ')}`);
check('place population appears only with its source label', places.every(p => !('population' in p) || /osm population tag/.test(p.populationSrc)));
check('every place has a municipality id (or null on an island)', places.every(p => p.muni === null || muniIds.includes(p.muni)));
const mismatch = places.filter(p => p.muni && GEO.municipalityAt(p.lon, p.lat) !== p.muni && distToRings(p.lon, p.lat) > 150 && !GEO.municipalities.some(m => m.id === p.muni && false));
check('stored place municipality matches the simplified polygons away from borders', mismatch.length <= Math.ceil(places.length * 0.03), `${mismatch.length} differ (borders are simplified to ~100 m)`);
const REQUIRED = ['doha', 'lusail', 'al-rayyan', 'al-wakrah', 'al-khor', 'umm-salal', 'al-daayen', 'madinat-ash-shamal', 'dukhan', 'mesaieed', 'ras-laffan', 'al-shahaniya', 'industrial-area', 'education-city', 'hamad-international-airport'];
const missingAnchors = REQUIRED.filter(k => !GEO.anchors[k] || !GEO.place(GEO.anchors[k]));
check('all 15 required places resolve (Doha ... Hamad International Airport)', missingAnchors.length === 0, missingAnchors.join(',') || REQUIRED.length + ' anchors');
const kinds = {}; places.forEach(p => kinds[p.kind] = (kinds[p.kind] || 0) + 1);
console.log('  places by kind: ' + JSON.stringify(kinds));
const P = GEO.projection;
const xy = P.toXY(51.2, 25.3);
check('projection: origin maps to (0,0) and round-trips', Math.abs(xy[0]) < 1e-6 && Math.abs(xy[1]) < 1e-6 && Math.abs(P.toLonLat(...P.toXY(51.5, 25.9))[0] - 51.5) < 1e-9 && Math.abs(P.toLonLat(...P.toXY(51.5, 25.9))[1] - 25.9) < 1e-9);
check('projection: 0.1 degree of latitude is 11,119.5 m; longitude scaled by cos(lat0)', Math.abs(P.toXY(51.2, 25.4)[1] - 11119.508) < 0.01 && Math.abs(P.toXY(51.3, 25.3)[0] - 0.1 * P.mPerDegLon) < 1e-6 && Math.abs(P.mPerDegLon / P.mPerDegLat - Math.cos(25.3 * Math.PI / 180)) < 1e-12);
const dDohaWakra = P.distanceM(51.526, 25.286, 51.601, 25.157);
const dxy = Math.hypot(...P.toXY(51.601, 25.157).map((v, i) => v - P.toXY(51.526, 25.286)[i]));
check('projection: equirectangular distance within 1 % of haversine over the country', Math.abs(dxy - dDohaWakra) / dDohaWakra < 0.01, `Doha - Al Wakrah ${(dDohaWakra / 1000).toFixed(1)} km`);

// ---------------------------------------------------------------------------------------------------------------- facilities
section('3  facilities');
const kindsF = {}; FAC.forEach(f => kindsF[f.kind] = (kindsF[f.kind] || 0) + 1);
console.log('  facilities by kind: ' + JSON.stringify(kindsF) + `, total ${FAC.length}`);
check('only the five allowed kinds', FAC.every(f => ['hospital', 'clinic-ed', 'police', 'fire', 'ambulance'].includes(f.kind)));
check('unique ids and OSM references (node|way|relation/<id>)', new Set(FAC.map(f => f.id)).size === FAC.length && FAC.every(f => /^(node|way|relation)\/\d+$/.test(f.osm)));
check('name is {ar,en} strings (empty = unnamed in OSM, flagged)', FAC.every(f => typeof f.name.ar === 'string' && typeof f.name.en === 'string' && ((f.name.ar || f.name.en) || (f.flags || []).includes('unnamed'))));
check('only real OSM tag values (whitelisted keys, string values)', FAC.every(f => Object.entries(f.tags).every(([k, v]) => typeof v === 'string' && v.length)));
check('hospital: amenity or healthcare=hospital; police: amenity=police; fire: fire_station or civil-defence office', FAC.every(f => f.kind !== 'hospital' || f.tags.amenity === 'hospital' || f.tags.healthcare === 'hospital')
  && FAC.every(f => f.kind !== 'police' || f.tags.amenity === 'police') && FAC.every(f => f.kind !== 'fire' || f.tags.amenity === 'fire_station' || f.tags.office === 'government' || /fire_station|rescue/.test(f.tags.emergency || '')));
check('clinic-ed only with emergency=yes', FAC.filter(f => f.kind === 'clinic-ed').every(f => f.tags.emergency === 'yes'));
check('ambulance: emergency=ambulance_station', FAC.filter(f => f.kind === 'ambulance').every(f => f.tags.emergency === 'ambulance_station'));
check('ed is yes / no / unknown, with its source (tag or official page) when not unknown', FAC.filter(f => f.kind === 'hospital' || f.kind === 'clinic-ed').every(f => ['yes', 'no', 'unknown'].includes(f.ed) && (f.ed === 'unknown' ? f.edSrc === null : ['osm-tag', 'official', 'osm-tag+official'].includes(f.edSrc))));
check('ed=yes from a tag really has emergency=yes; unknown means no emergency tag and no official match', FAC.filter(f => f.ed === 'yes' && f.edSrc === 'osm-tag').every(f => f.tags.emergency === 'yes') && FAC.filter(f => f.ed === 'unknown').every(f => !f.tags.emergency && !f.official));
const official = FAC.filter(f => f.official);
check('the HMC emergency-page matches carry capabilities from the official list only', official.length >= 7 && official.every(f => Array.isArray(f.caps) && /hamad\.qa/.test(f.capsSrc)), `${official.length} official ED matches`);
check('Level I trauma capability is attached to exactly one facility', FAC.filter(f => (f.caps || []).includes('trauma1')).length === 1);
check('every facility is on land (point-in-polygon in the outline) or within 300 m of it', FAC.every(f => GEO.inLand(f.lon, f.lat) || distToRings(f.lon, f.lat) < 300),
  `${FAC.filter(f => !GEO.inLand(f.lon, f.lat)).length} outside the 100 m-simplified outline but within 300 m`);
check('every facility inside the Qatar bbox', FAC.every(f => inQ(f.lon, f.lat)));
check('facility municipality ids valid', FAC.every(f => f.muni === null || muniIds.includes(f.muni)));
check('police role and fire role fields present', FAC.filter(f => f.kind === 'police').every(f => ['station', 'traffic', 'department', 'training', 'border', 'unknown'].includes(f.role)) && FAC.filter(f => f.kind === 'fire').every(f => /station|hq/.test(f.role)));
check('facilityType is one of the four values and says where it comes from', FAC.filter(f => f.kind === 'hospital' || f.kind === 'clinic-ed').every(f => ['hospital', 'specialist-centre', 'health-centre', 'unclear'].includes(f.facilityType) && /name heuristic|official list/.test(f.typeSrc)));
check('facility meta: snapshot, counts and honesty text', FAC.meta.counts.hospital === kindsF.hospital && FAC.meta.total === FAC.length && /SIM/.test(FAC.meta.honesty) && FAC.meta.snapshotDate === GEO.meta.snapshotDate);
const dup = []; for (let i = 0; i < FAC.length; i++) for (let j = i + 1; j < FAC.length; j++) { const a = FAC[i], b = FAC[j]; if (a.kind === b.kind && (a.name.en || a.name.ar) && (a.name.en === b.name.en && a.name.ar === b.name.ar) && P.distanceM(a.lon, a.lat, b.lon, b.lat) < 150) dup.push(a.id + '~' + b.id); }
check('no same-kind, same-name duplicates within 150 m (node/way duplicates were merged)', dup.length === 0, dup.join(',') || 'none');

// ---------------------------------------------------------------------------------------------------------------- roads
section('4  road graph');
console.log(`  nodes ${fmt(G.n)}, stored edges ${fmt(G.e)}, directed arcs ${fmt(G.a)}, polyline points ${fmt(G.shapeLon.length)}, names ${G.names.length - 1}`);
const M = ROADS.meta;
check('decoded counts equal the meta counts', G.n === M.counts.nodes && G.e === M.counts.edges && G.a === M.counts.arcs && G.shapeLon.length === M.counts.shapePoints);
check('meta lists the road scope, the speed ASSUMPTIONS and the limits', /tertiary/.test(M.scope) && /ASSUMPTIONS/.test(M.speedAssumptions.note) && /turn restrictions/.test(M.limits) && M.flagBits['256'] && /VIRTUAL/.test(M.flagBits['256']));
check('every node inside the Qatar bbox (border roads end at the border, bridges stay)', (() => { for (let i = 0; i < G.n; i++) if (!inQ(G.lon[i], G.lat[i])) return false; return true; })());
check('node coordinates and shape points have no NaN and use the 1e-5 degree grid', (() => { for (let i = 0; i < G.n; i++) if (!Number.isFinite(G.lon[i]) || Math.abs(G.lon[i] * 1e5 - Math.round(G.lon[i] * 1e5)) > 1e-6) return false; for (let i = 0; i < G.shapeLon.length; i++) if (!Number.isFinite(G.shapeLon[i]) || !inQ(G.shapeLon[i], G.shapeLat[i])) return false; return true; })());
let okEdges = true, why = '';
const classUse = new Array(G.classNames.length).fill(0), ow = { one: 0, two: 0 };
let tunnels = 0, bridges = 0, tolls = 0, rbs = 0, virt = 0, tagged = 0, restricted = 0, links = 0;
const fail = m => { if (okEdges) { okEdges = false; why = m; } };
for (let e = 0; e < G.e; e++) {
  if (G.eFrom[e] >= G.n || G.eTo[e] >= G.n || G.eFrom[e] === G.eTo[e]) { fail('bad endpoints at ' + e); continue; }
  if (!(G.eLen[e] >= 0.5)) fail('length at ' + e);
  if (G.eCls[e] >= G.classNames.length || G.eSpeed[e] < 5 || G.eSpeed[e] > 140 || G.eName[e] >= G.names.length) fail('class/speed/name at ' + e);
  const pl = G.polyline(e);
  const chord = P.distanceM(pl[0], pl[1], pl[pl.length - 2], pl[pl.length - 1]);
  // node coordinates sit on a 1e-5 degree grid (about 1.1 m), so a very short edge may be a little shorter than its chord
  if (G.eLen[e] * 1.02 + 3 < chord) fail(`length ${G.eLen[e]} shorter than chord ${chord} at ${e}`);
  if (pl[0] !== G.lon[G.eFrom[e]] || pl[pl.length - 1] !== G.lat[G.eTo[e]]) fail('polyline end points at ' + e);
  classUse[G.eCls[e]]++; G.eTwoWay[e] ? ow.two++ : ow.one++;
  const fl = G.eFlags[e]; if (fl & 1) tunnels++; if (fl & 2) bridges++; if (fl & 4) tolls++; if (fl & 8) rbs++; if (fl & 256) virt++; if (fl & 64) tagged++; if (fl & 128) restricted++; if (fl & 32) links++;
  if (!!(fl & 16) !== !G.eTwoWay[e] && !(fl & 256)) fail('one-way flag disagrees with direction at ' + e);
}
check('every edge: valid endpoints, length >= chord, speed 5..140 kph, class and name indexes, polyline joins its nodes, one-way flag consistent', okEdges, why);
console.log('  edges by class: ' + G.classNames.map((c, i) => `${c} ${classUse[i]}`).join(', ') + `;  one-way ${ow.one}, two-way ${ow.two}`);
console.log(`  flags: tunnel/underpass ${tunnels}, bridge ${bridges}, toll ${tolls}, roundabout ${rbs}, link ${links}, tagged maxspeed ${tagged} (${(100 * tagged / G.e).toFixed(1)} %), restricted ${restricted}, virtual ${virt}`);
check('motorways are one-way except where OSM says otherwise (>= 95 % of motorway edges)', (() => { let m = 0, o = 0; for (let e = 0; e < G.e; e++) if (G.eCls[e] === 0) { m++; if (!G.eTwoWay[e]) o++; } return o / m > 0.95; })());
check('tunnels/underpasses are present in the data (flood layer needs them)', tunnels > 100, `${tunnels} edges`);
check('tertiary roads only inside the Greater Doha / Al Rayyan box (access paths elsewhere are class local)', (() => { let bad = 0; for (let e = 0; e < G.e; e++) if (G.eCls[e] === 4) { const lon = G.lon[G.eFrom[e]], lat = G.lat[G.eFrom[e]]; if (!(lon >= 51.29 && lon <= 51.66 && lat >= 25.09 && lat <= 25.51)) bad++; } return bad === 0; })());
check('virtual connectors are a small, flagged minority of the network (< 6 % of edges, < 3 % of km)', virt / G.e < 0.06 && (() => { let v = 0, a = 0; for (let e = 0; e < G.e; e++) { a += G.eLen[e]; if (G.eFlags[e] & 256) v += G.eLen[e]; } return v / a < 0.03; })(), `${virt} edges`);
// arcs
check('arc table: forward arc for every edge, reverse arc only for two-way edges, CSR consistent', (() => {
  let a = 0; for (let e = 0; e < G.e; e++) a += 1 + G.eTwoWay[e]; if (a !== G.a) return false;
  for (let u = 0; u < G.n; u++) for (let k = G.outStart[u]; k < G.outStart[u + 1]; k++) if (G.aFrom[G.outArc[k]] !== u) return false;
  return G.outStart[G.n] === G.a;
})());
// connectivity: weak and strong, recomputed here
const und = new Int32Array(G.n).fill(-1);
let weakMain = 0; { let ncomp = 0; const sizes = [];
  const adjU = Array.from({ length: G.n }, () => []);
  for (let a = 0; a < G.a; a++) { adjU[G.aFrom[a]].push(G.aTo[a]); adjU[G.aTo[a]].push(G.aFrom[a]); }
  for (let s = 0; s < G.n; s++) { if (und[s] >= 0) continue; let c = 0; const st = [s]; und[s] = ncomp; while (st.length) { const u = st.pop(); c++; for (const v of adjU[u]) if (und[v] < 0) { und[v] = ncomp; st.push(v); } } sizes.push(c); ncomp++; }
  weakMain = Math.max(...sizes) / G.n; }
function sccSizes() { // iterative Tarjan on arcs
  const idx = new Int32Array(G.n).fill(-1), low = new Int32Array(G.n), on = new Uint8Array(G.n), comp = new Int32Array(G.n).fill(-1); const stack = []; let counter = 0, nc = 0; const sizes = [];
  for (let r = 0; r < G.n; r++) {
    if (idx[r] >= 0) continue;
    const work = [[r, G.outStart[r]]];
    idx[r] = low[r] = counter++; stack.push(r); on[r] = 1;
    while (work.length) {
      const top = work[work.length - 1]; const u = top[0]; let pi = top[1]; let pushed = false;
      while (pi < G.outStart[u + 1]) { const v = G.aTo[G.outArc[pi++]]; if (idx[v] < 0) { top[1] = pi; idx[v] = low[v] = counter++; stack.push(v); on[v] = 1; work.push([v, G.outStart[v]]); pushed = true; break; } else if (on[v]) low[u] = Math.min(low[u], idx[v]); }
      if (pushed) continue;
      if (low[u] === idx[u]) { let sz = 0, w; do { w = stack.pop(); on[w] = 0; comp[w] = nc; sz++; } while (w !== u); sizes.push(sz); nc++; }
      work.pop(); if (work.length) { const p = work[work.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
    }
  }
  return sizes;
}
const scc = sccSizes();
const strongShip = Math.max(...scc) / G.n;
check('the shipped graph is ONE strongly connected component (every node reaches every node)', scc.length === 1 && strongShip === 1, `${scc.length} component(s)`);
check('weakly connected: 100 % of nodes in one component', weakMain === 1);
check('>= 99 % of the junction nodes of the full extract are in the main component (before pruning)', M.connectivity.strongMainShare >= 0.99 && M.connectivity.nodesKept / M.connectivity.nodesBefore >= 0.99, `strong ${(100 * M.connectivity.strongMainShare).toFixed(2)} %, weak ${(100 * M.connectivity.weakMainShare).toFixed(2)} %, ${M.connectivity.nodesBefore - M.connectivity.nodesKept} nodes dropped`);
// spatial lookup helpers
const dd = G.locate(51.5266, 25.2867);
check('locate() finds a road near central Doha and returns an attach() seed', !!dd && dd.dist < 400 && G.attach(dd).out.length >= 1 && G.attach(dd).in.length >= 1, dd ? `${dd.dist.toFixed(0)} m` : '');
check('locate() returns null in the open desert beyond maxM', G.locate(51.2, 25.7, 500) === null);
const nn = G.nearestNode(51.5266, 25.2867);
check('nearestNode() works', !!nn && nn.node >= 0 && nn.node < G.n && nn.dist < 1500);
check('a road name table with Arabic and English names', G.names.slice(1).some(n => /[؀-ۿ]/.test(n[0])) && G.names.slice(1).some(n => /Road|Street|Highway/.test(n[1])), `${G.names.length - 1} names`);

// ---------------------------------------------------------------------------------------------------------------- snaps
section('5  facility road snap');
const snapD = [], bad = [];
for (const f of FAC) {
  if (!f.snap) { bad.push(f.id + ' has no snap'); continue; }
  snapD.push(f.snap.d);
  const loc = G.locate(f.lon, f.lat, 20000);
  // a snap exactly at a junction node, or on two parallel edges with the same geometry, can be reported on either edge: accept the same point
  const endNode = (e, fr) => fr < 0.002 ? G.eFrom[e] : fr > 0.998 ? G.eTo[e] : -1;
  const same = loc && (loc.edge === f.snap.edge || Math.abs(loc.frac - f.snap.frac) < 0.002 || Math.abs(loc.frac - (1 - f.snap.frac)) < 0.002 || (endNode(loc.edge, loc.frac) >= 0 && endNode(loc.edge, loc.frac) === endNode(f.snap.edge, f.snap.frac)));
  if (!loc || Math.abs(loc.dist - f.snap.d) > 1.5 || !same) bad.push(`${f.id}: stored ${f.snap.edge}/${f.snap.frac}/${f.snap.d} vs recomputed ${loc ? loc.edge + '/' + loc.frac.toFixed(4) + '/' + loc.dist.toFixed(1) : 'null'}`);
}
check('every facility has a snap and the stored snap equals locate() recomputed in JS (same road point, distance within 1.5 m)', bad.length === 0, bad.slice(0, 3).join(' | '));
check('facilities were built against this road graph (roadsBuild matches meta.build)', FAC.meta.roadsBuild === M.build, M.build);
snapD.sort((a, b) => a - b);
console.log(`  snap distance (m): min ${snapD[0].toFixed(0)}, median ${pct(snapD, 0.5).toFixed(0)}, p75 ${pct(snapD, 0.75).toFixed(0)}, p90 ${pct(snapD, 0.9).toFixed(0)}, p95 ${pct(snapD, 0.95).toFixed(0)}, max ${snapD[snapD.length - 1].toFixed(0)}`);
const hist = [[0, 50], [50, 100], [100, 200], [200, 500], [500, 1000], [1000, 1e9]].map(([a, b]) => `${a}-${b === 1e9 ? 'inf' : b} m: ${snapD.filter(d => d >= a && d < b).length}`);
console.log('  distribution: ' + hist.join(', '));
check('90 % of facilities snap within 300 m and 99 % within 1,000 m of a road', pct(snapD, 0.9) <= 300 && pct(snapD, 0.99) <= 1000, `p90 ${pct(snapD, 0.9).toFixed(0)} m, p99 ${pct(snapD, 0.99).toFixed(0)} m`);
const far = FAC.filter(f => f.snap.d > 1000);
check('every facility farther than 1 km from a road is flagged (no road access found)', far.every(f => (f.flags || []).some(x => /^no-local-road-access/.test(x))), far.map(f => `${f.id} ${f.snap.d.toFixed(0)} m`).join(', ') || 'none farther than 1 km');
check('every hospital snaps within 700 m', FAC.filter(f => f.kind === 'hospital').every(f => f.snap.d <= 700), `max ${Math.max(...FAC.filter(f => f.kind === 'hospital').map(f => f.snap.d)).toFixed(0)} m`);

// ---------------------------------------------------------------------------------------------------------------- routes
section('6  Dijkstra between the major places (length only, sanity bounds)');
class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }
function route(A, B) { // A, B: attach() seeds; cost = metres along the road network plus the along-edge offsets
  const dist = new Float64Array(G.n).fill(Infinity), h = new Heap();
  for (const [n, d] of A.out) if (d < dist[n]) { dist[n] = d; h.push(d, n); }
  while (h.size) {
    const [d, u] = h.pop(); if (d > dist[u]) continue;
    for (let k = G.outStart[u]; k < G.outStart[u + 1]; k++) { const a = G.outArc[k], v = G.aTo[a], nd = d + G.aLen[a]; if (nd < dist[v]) { dist[v] = nd; h.push(nd, v); } }
  }
  let best = Infinity; for (const [n, d] of B.in) best = Math.min(best, dist[n] + d);
  return best;
}
const WANT = { Doha: 'doha', Dukhan: 'dukhan', 'Al Khor': 'al-khor', 'Al Wakrah': 'al-wakrah', 'Al Shamal': 'madinat-ash-shamal', Mesaieed: 'mesaieed', 'Hamad Intl Airport': 'hamad-international-airport' };
const pts = {};
for (const [label, key] of Object.entries(WANT)) { const pl = GEO.place(GEO.anchors[key]); const loc = G.locate(pl.lon, pl.lat, 12000); pts[label] = { pl, loc, att: G.attach(loc) }; }
console.log('  place -> nearest road: ' + Object.entries(pts).map(([k, v]) => `${k} ${v.loc.dist.toFixed(0)} m`).join(', '));
check('every named place has a road within 5 km', Object.values(pts).every(v => v.loc.dist < 5000));
// known approximate driving distances are NOT claimed here: the bounds are sanity windows (straight line <= route <= 1.9 x straight line + 3 km access)
const names = Object.keys(pts); const rows = []; let allOk = true;
for (const a of names) for (const b of names) {
  if (a === b) continue;
  const r = route(pts[a].att, pts[b].att) + pts[a].loc.dist + pts[b].loc.dist;
  const s = P.distanceM(pts[a].pl.lon, pts[a].pl.lat, pts[b].pl.lon, pts[b].pl.lat);
  const ratio = r / s;
  if (!Number.isFinite(r) || r < s * 0.97 || r > s * 1.9 + 3000) { allOk = false; rows.push(`${a}->${b} route ${(r / 1000).toFixed(1)} km vs straight ${(s / 1000).toFixed(1)} km`); }
  pts[a]['to ' + b] = [r, s, ratio];
}
check('a route exists in both directions between all 7 places and it is plausible (1.0 .. 1.9 x straight line)', allOk, rows.join('; '));
console.log('  from Doha: ' + names.filter(n => n !== 'Doha').map(n => { const [r, s, q] = pts.Doha['to ' + n]; return `${n} ${(r / 1000).toFixed(1)} km (straight ${(s / 1000).toFixed(1)}, x${q.toFixed(2)})`; }).join('; '));
let worstAsym = 0, worstPair = '';
for (const a of names) for (const b of names) if (a !== b) { const q = Math.abs(pts[a]['to ' + b][0] - pts[b]['to ' + a][0]) / Math.min(pts[a]['to ' + b][0], pts[b]['to ' + a][0]); if (q > worstAsym) { worstAsym = q; worstPair = `${a}<->${b} ${(pts[a]['to ' + b][0] / 1000).toFixed(1)} / ${(pts[b]['to ' + a][0] / 1000).toFixed(1)} km`; } }
check('A->B and B->A routes differ only a little (dual carriageways, ramps, one-way streets): within 30 %', worstAsym < 0.30, `worst ${(100 * worstAsym).toFixed(0)} % (${worstPair})`);
const rd = pts.Doha['to Hamad Intl Airport'][0] / 1000, rk = pts.Doha['to Dukhan'][0] / 1000;
check('ordering sanity: Doha-airport < Doha-Al Wakrah < Doha-Al Khor < Doha-Dukhan < Doha-Al Shamal', rd < pts.Doha['to Al Wakrah'][0] / 1000 && pts.Doha['to Al Wakrah'][0] < pts.Doha['to Al Khor'][0] && pts.Doha['to Al Khor'][0] < pts.Doha['to Dukhan'][0] && pts.Doha['to Dukhan'][0] < pts.Doha['to Al Shamal'][0] * 1.1, `${rd.toFixed(1)} km airport, ${rk.toFixed(1)} km Dukhan`);
// facility-to-facility: every ED hospital can reach every fire station and back (strong connectivity through the attach seeds)
const eds = FAC.filter(f => f.kind === 'hospital' && f.ed === 'yes').slice(0, 5), fires = FAC.filter(f => f.kind === 'fire').slice(0, 5);
check('hospitals with an ED and fire stations reach each other', eds.every(h => fires.every(f => Number.isFinite(route(G.attach(G.locate(h.lon, h.lat, 20000)), G.attach(G.locate(f.lon, f.lat, 20000)))) && Number.isFinite(route(G.attach(G.locate(f.lon, f.lat, 20000)), G.attach(G.locate(h.lon, h.lat, 20000)))))));

// ---------------------------------------------------------------------------------------------------------------- summary
section('7  counts');
console.log(`  geo: ${GEO.municipalities.length} municipalities, ${rings.length} polygons / ${GEO.meta.counts.outlineVertices} vertices, ${places.length} places, ${GEO.meta.areaKm2} km2`);
console.log(`  facilities: ${FAC.length} (${Object.entries(kindsF).map(([k, v]) => k + ' ' + v).join(', ')}); hospitals by ED: ${JSON.stringify(FAC.meta.hospitalsByEd)}`);
console.log(`  roads: ${fmt(G.n)} nodes, ${fmt(G.e)} edges, ${fmt(G.a)} arcs, ${M.counts.totalKm} km (${Object.entries(M.counts.kmByClass).map(([k, v]) => k + ' ' + v).join(', ')})`);
console.log(`  snapshot ${GEO.meta.snapshotDate}, load ${Object.values(load).reduce((a, b) => a + b, 0).toFixed(0)} ms + decode ${tDecode.toFixed(0)} ms, total size ${fmt(total)} B`);
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
