// Resident Phones (alert.html) tests — Playwright + Chromium over file://, plus Node-only checks of the pure functions.
//
//   node tools/manara/test-alert.mjs [--shots]        (--shots also writes review screenshots to $MANARA_SHOTS)
//
//   1  QR encoder: an independent decoder (format BCH, unmask, de-interleave, Reed–Solomon syndromes, payload) on many payloads,
//      EC levels and every version 1–10 (and UTF-8 / Arabic)
//   2  Nearby facilities: Overpass query + parser on a synthetic fixture (no real coordinates anywhere), odd input never throws
//   3  geometry + compass words; house laws (no innerHTML, no module scripts, no CDN, no letter-spacing, logical CSS)
//   4  every pictogram id of MANARA_MSG is drawn; loads clean in ar/en × dark/light; no horizontal overflow at 390 and 1440
//   5  demo trigger: hazard-correct content per phone for six hazards, no cross-hazard leakage (flood × wheelchair has no exit/stairs)
//   6  "I'm safe" / "I need help" / "I'm awake" reach a second page on the bus; Mission Control alerts, dispatch and all-clear drive the phones;
//      bus text is never parsed as HTML
//   7  wake-up ladder with fake timers (steps at 0/30/60/90 s), stops on "I'm awake", fast speed
//   8  strobe off by default, opt-in behind the warning, never more than 3 flashes a second, disabled under reduced motion
//   9  sound gate (autoplay policy), mute, vibration, speech (right BCP-47 language, graceful when the voice is missing)
//  10  nearby card: consent tap, one query, results, offline / denied / failed messages, nothing stored, two-step 999
//  11  QR card on the page: canvas decodes to the link, file:// note, long-link message
//  12  language switch re-renders; draft banner for Malayalam; large text, high contrast, persona URLs, accessibility basics
//  13  WCAG AA contrast of every visible text in both themes × both languages in every state, no box holds content wider than itself (nothing
//      silently clipped), pictograms fit in large-text mode, the wall's phones line up, the one-phone side panel
//  QR also gets a second opinion from zxing-cpp (pip install zxing-cpp) when it is installed.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, SITE, ROOT } from './lib.mjs';

const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const on = n => !ONLY.length || ONLY.includes(String(n));
const SHOTS = process.argv.includes('--shots') ? (process.env.MANARA_SHOTS || '/tmp/manara-shots') : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const section = t => console.log(`\n${t}`);

// ---------- load the pure parts in Node ----------
const ctxVm = vm.createContext({});
vm.runInContext(read('js/messages.js'), ctxVm, { filename: 'messages.js' });
vm.runInContext(read('js/alert.js'), ctxVm, { filename: 'alert.js' });
const M = ctxVm.MANARA_MSG, A = ctxVm.ManaraAlert;

/* ============================================================================================
 * 1  QR — an independent decoder
 * ============================================================================================ */
section('1 QR encoder (independent decoder)');
const EXP = new Array(512), LOG = new Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function qrDecode(rows) {
  const n = rows.length, v = (n - 17) / 4, g = (x, y) => rows[y][x] === '1';
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) fn[y][x] = true; };
  for (let i = 0; i < n; i++) { mark(6, i); mark(i, 6); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy); };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  if (v > 1) {
    const count = Math.floor(v / 7) + 2, last = n - 7, step = Math.ceil((last - 6) / (count - 1) / 2) * 2, pos = [6];
    for (let i = count - 2; i >= 0; i--) pos.push(last - i * step);
    pos.forEach((cx, a) => pos.forEach((cy, b) => {
      if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
    }));
  }
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(n - 1 - i, 8); mark(8, n - 1 - i); }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { mark(n - 11 + j, i); mark(i, n - 11 + j); }
  // format information, both copies must agree and be a valid BCH(15,5) word
  const f1 = [], f2 = [];
  for (let i = 0; i <= 5; i++) f1[i] = g(8, i); f1[6] = g(8, 7); f1[7] = g(8, 8); f1[8] = g(7, 8); for (let i = 9; i < 15; i++) f1[i] = g(14 - i, 8);
  for (let i = 0; i < 8; i++) f2[i] = g(n - 1 - i, 8); for (let i = 8; i < 15; i++) f2[i] = g(8, n - 15 + i);
  const num = a => a.reduce((s, b, i) => s | (b ? 1 << i : 0), 0);
  const raw = num(f1);
  if (raw !== num(f2)) return { error: 'format copies differ' };
  const d15 = raw ^ 0x5412; let rem = d15;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  if (rem !== 0) return { error: 'format BCH invalid' };
  const ecBits = (d15 >> 13) & 3, mask = (d15 >> 10) & 7, level = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[ecBits];
  const inv = (x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x * y) % 2 + (x * y) % 3 === 0, ((x * y) % 2 + (x * y) % 3) % 2 === 0, ((x + y) % 2 + (x * y) % 3) % 2 === 0][mask];
  const [ecLen, groups] = A.qr.table[v][level];
  const blockLens = []; groups.forEach(([cnt, dl]) => { for (let i = 0; i < cnt; i++) blockLens.push(dl); });
  const total = blockLens.reduce((s, l) => s + l + ecLen, 0), bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!fn[y][x]) bits.push(g(x, y) !== inv(x, y));
    }
  }
  const words = []; for (let i = 0; i < total; i++) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i * 8 + k] ? 1 : 0); words.push(b); }
  const blocks = blockLens.map(l => ({ data: [], ec: [], l })); const maxL = Math.max(...blockLens); let p = 0;
  for (let i = 0; i < maxL; i++) blocks.forEach(b => { if (i < b.l) b.data.push(words[p++]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach(b => b.ec.push(words[p++]));
  for (const b of blocks) {                              // Reed–Solomon: the codeword polynomial must vanish at alpha^0 … alpha^(ecLen-1)
    const full = b.data.concat(b.ec);
    for (let j = 0; j < ecLen; j++) { let acc = 0; for (const c of full) acc = gmul(acc, EXP[j]) ^ c; if (acc !== 0) return { error: 'RS syndrome ' + j + ' != 0' }; }
  }
  const data = blocks.flatMap(b => b.data), bb = []; data.forEach(w => { for (let k = 7; k >= 0; k--) bb.push((w >> k) & 1); });
  const take = (len) => { let x = 0; for (let k = 0; k < len; k++) x = (x << 1) | bb.shift(); return x; };
  if (take(4) !== 4) return { error: 'not byte mode' };
  const cnt = take(v < 10 ? 8 : 16), bytes = []; for (let i = 0; i < cnt; i++) bytes.push(take(8));
  return { text: new TextDecoder().decode(Uint8Array.from(bytes)), version: v, level, mask };
}
{
  const lcg = s => () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
  const rnd = (len, seed) => { const r = lcg(seed), al = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/?&=._-%#'; let o = ''; for (let i = 0; i < len; i++) o += al[r() % al.length]; return o; };
  const texts = ['A', 'MANARA', 'http://192.168.1.20:8765/manara/alert.html?persona=ravi&lang=ml', 'file:///home/user/-/site/manara/alert.html?persona=huda&lang=ar&hazard=fire&level=evacuate&asleep=1',
    'منارة — هواتف السكان', 'héllo wörld ✓ 日本', rnd(60, 1), rnd(120, 2), rnd(200, 3)];
  let ok = 0, bad = [], masks = new Set(), versions = new Set();
  for (const t of texts) for (const ec of ['L', 'M', 'Q', 'H']) {
    const q = A.qr.encode(t, { ec }); if (!q) { bad.push('no code for ' + t.slice(0, 20)); continue; }
    const d = qrDecode(q.rows()); masks.add(q.mask); versions.add(q.version);
    if (d.text === t && d.level === q.ec && d.mask === q.mask) ok++; else bad.push(`${ec} ${t.slice(0, 24)} → ${d.error || d.text}`);
  }
  for (let v = 1; v <= 10; v++) for (const ec of ['L', 'M', 'Q', 'H']) {
    const t = rnd(Math.max(1, A.qr.capacityBytes(v, ec) - 2), v * 7 + ec.charCodeAt(0)), q = A.qr.encode(t, { ec, minVersion: v }), d = qrDecode(q.rows());
    masks.add(q.mask); versions.add(q.version);
    if (d.text === t && d.version === v && d.level === ec) ok++; else bad.push(`V${v}-${ec} → ${d.error || 'mismatch'}`);
  }
  check('QR: every payload decodes to the same text with valid format info and zero RS syndromes', bad.length === 0, `${ok} ok; ${bad.slice(0, 3).join(' | ')}`);
  check('QR: all versions 1–10 and several masks exercised', versions.size === 10 && masks.size >= 6, `versions ${versions.size}, masks ${[...masks].sort().join('')}`);
  check('QR: too-long payloads return null (the page shows a message)', A.qr.encode('x'.repeat(400)) === null);
  check('QR: capacity is 271 bytes at V10-L and 213 at V10-M', A.qr.capacityBytes(10, 'L') === 271 && A.qr.capacityBytes(10, 'M') === 213);
  // a second, scanner-grade opinion: if the Python package zxing-cpp is installed (pip install zxing-cpp), render every version × level as a
  // picture with a quiet zone and let it find, sample and decode the code like a phone camera app would. Skipped (not failed) without it.
  {
    const have = (() => { try { execFileSync('python3', ['-I', '-c', 'import zxingcpp, PIL'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
    if (!have) console.log('  skip QR: zxing-cpp is not installed (pip install zxing-cpp) — the independent JS decoder above still ran');
    else {
      const items = [];
      for (let v = 1; v <= 10; v++) for (const ec of ['L', 'M', 'Q', 'H']) {
        const t = rnd(Math.max(1, A.qr.capacityBytes(v, ec) - 1), v * 31 + ec.charCodeAt(0)), q = A.qr.encode(t, { ec, minVersion: v });
        items.push({ text: t, rows: q.rows(), version: q.version, ec: q.ec });
      }
      for (const t of ['http://192.168.1.20:8765/manara/alert.html?persona=ravi&lang=ml&hazard=fire&level=evacuate&asleep=1', 'منارة — هواتف السكان', 'héllo ✓ 日本']) { const q = A.qr.encode(t, { ec: 'M' }); items.push({ text: t, rows: q.rows(), version: q.version, ec: q.ec }); }
      const tmp = path.join(os.tmpdir(), `manara-qr-${process.pid}.json`); fs.writeFileSync(tmp, JSON.stringify(items));
      const py = `import json,sys,zxingcpp\nfrom PIL import Image\nbad=[]\nfor i,it in enumerate(json.load(open(sys.argv[1]))):\n  n=len(it['rows']);sc=8;q=4\n  im=Image.new('L',((n+2*q)*sc,(n+2*q)*sc),255)\n  for y,r in enumerate(it['rows']):\n    for x,c in enumerate(r):\n      if c=='1': im.paste(0,((x+q)*sc,(y+q)*sc,(x+q+1)*sc,(y+q+1)*sc))\n  r=zxingcpp.read_barcodes(im)\n  if not(len(r)==1 and r[0].text==it['text'] and r[0].format==zxingcpp.BarcodeFormat.QRCode): bad.append('V%s-%s'%(it['version'],it['ec']))\nprint(json.dumps({'n':len(json.load(open(sys.argv[1]))),'bad':bad}))`;
      let res = { n: 0, bad: ['python failed'] };
      try { res = JSON.parse(execFileSync('python3', ['-I', '-c', py, tmp], { encoding: 'utf8' })); } catch (e) { res.bad = [String(e.message).slice(0, 120)]; }
      fs.rmSync(tmp, { force: true });
      check(`QR: zxing-cpp (an independent scanner library) reads all ${res.n} codes — versions 1–10, levels L/M/Q/H, URL, Arabic and UTF-8`, res.bad.length === 0 && res.n === 43, res.bad.join(','));
    }
  }
  const q = A.qr.encode('HELLO'), rows = q.rows();
  check('QR: finder patterns in three corners, timing pattern alternates', rows[0].slice(0, 7) === '1111111' && rows[0].slice(-7) === '1111111' && rows[q.size - 1].slice(0, 7) === '1111111' &&
    [...Array(q.size - 16)].every((_, i) => rows[6][8 + i] === (i % 2 === 0 ? '1' : '0')));
}

/* ============================================================================================
 * 2  Nearby facilities — Overpass query + parser (synthetic fixture: the origin of the coordinate system, nothing real)
 * ============================================================================================ */
section('2 Nearby facilities (pure)');
const O = A.overpass, P0 = { lat: 0.5, lon: 0.5 };
const hav = (la1, lo1, la2, lo2) => { const R = 6371008.8, r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const FIXTURE = { version: 0.6, elements: [
  { type: 'node', id: 11, lat: 0.52, lon: 0.5, tags: { amenity: 'hospital', name: 'Fixture General Hospital', 'name:ar': 'مستشفى الاختبار' } },
  { type: 'node', id: 12, lat: 0.55, lon: 0.5, tags: { amenity: 'hospital', name: 'Far Hospital' } },
  { type: 'way', id: 13, center: { lat: 0.49, lon: 0.5 }, tags: { amenity: 'police', 'name:en': 'Fixture Police Station' } },
  { type: 'node', id: 14, lat: 0.5, lon: 0.53, tags: { amenity: 'fire_station', 'name:ar': 'محطة الاختبار للإطفاء' } },
  { type: 'node', id: 15, lat: 0.5, lon: 0.7, tags: { amenity: 'fire_station', name: 'Farther Fire Station' } },
  { type: 'relation', id: 16, tags: { amenity: 'police', name: 'Relation without a centre' } },
  { type: 'node', id: 17, lat: 0.5001, lon: 0.5, tags: { amenity: 'clinic', name: 'A clinic is not a hospital' } },
  { type: 'node', id: 18, lat: 0.5, lon: 0.5001, tags: { name: 'No amenity tag' } },
  { type: 'node', id: 19, lat: 0.51, lon: 0.5 }
] };
{
  const qs = O.query(P0.lat, P0.lon, 12000);
  check('query: Overpass QL with JSON output, a timeout, the three amenities and `out center`', /^\[out:json\]\[timeout:\d+\];/.test(qs) && ['hospital', 'police', 'fire_station'].every(k => qs.includes(`"amenity"="${k}"`)) && /\);out center;$/.test(qs), qs);
  check('query: keeps the default body verbosity — `tags`, `ids` or `skel` would drop node coordinates (OSM wiki: tags prints "not coordinates") and every node-mapped facility would vanish', !/\bout\b[^;]*\b(tags|ids|skel)\b/.test(qs));
  check('query: radius and position appear once per amenity, nothing else', (qs.match(/around:12000,0\.50000,0\.50000/g) || []).length === 3);
  check('query: radius is clamped (500 m … 50 km) and position is clamped to the globe', /around:50000,90\.00000,-180\.00000/.test(O.query(999, -999, 1e9)) && /around:500,/.test(O.query(0, 0, 1)));
  const r = O.parse(FIXTURE, P0.lat, P0.lon);
  check('parse: nearest hospital by straight-line distance', r.hospital && r.hospital.id === 11 && r.hospital.names.name === 'Fixture General Hospital' && r.hospital.names.ar === 'مستشفى الاختبار');
  check('parse: a way uses its `center`; nearest police is the way', r.police && r.police.id === 13 && r.police.type === 'way' && r.police.names.en === 'Fixture Police Station');
  check('parse: nearest fire station is the node 0.03° east, not the farther one', r.fire && r.fire.id === 14);
  check('parse: relation without a centre, clinics, untagged and tag-less elements are ignored', r.count === 5, `count ${r.count}`);
  check('parse: distance equals an independent haversine (rounded to metres)', [[r.hospital, 0.52, 0.5], [r.police, 0.49, 0.5], [r.fire, 0.5, 0.53]].every(([f, la, lo]) => f.distM === Math.round(hav(P0.lat, P0.lon, la, lo))), `${r.hospital.distM} ${r.police.distM} ${r.fire.distM}`);
  check('parse: bearings point north / south / east', r.hospital.bearingDeg === 0 && r.police.bearingDeg === 180 && r.fire.bearingDeg === 90);
  check('name(): Arabic page prefers name:ar, English prefers name:en then name, then the other', O.name(r.hospital, 'ar') === 'مستشفى الاختبار' && O.name(r.hospital, 'en') === 'Fixture General Hospital' && O.name(r.fire, 'en') === 'محطة الاختبار للإطفاء' && O.name(r.police, 'ar') === 'Fixture Police Station');
  check('distance(): metres below 1 km, one decimal km above, in both languages', O.distance(940, 'en') === '940 m' && O.distance(2240, 'en') === '2.2 km' && O.distance(2240, 'ar') === '2.2 كم' && O.distance(940, 'ar') === '940 م');
  const bad = [null, undefined, 5, 'x', {}, { elements: 5 }, { elements: [null, 1, 'a', { tags: 5 }, { tags: { amenity: 'police' } }, { tags: { amenity: 'police' }, lat: 'x', lon: 1 }] }];
  let threw = false, empty = true; try { bad.forEach(b => { const x = O.parse(b, 0, 0); if (x.hospital || x.police || x.fire) empty = false; }); } catch (e) { threw = true; }
  check('parse: malformed input never throws and yields no facility', !threw && empty);
  const src = read('js/alert.js');
  check('no real coordinates are shipped (no Qatar-like latitude/longitude literals in alert.js)', !/\b(2[4-6]\.\d{3,}|5[01]\.\d{3,})\b/.test(src));
}

/* ============================================================================================
 * 3  geometry + house laws
 * ============================================================================================ */
section('3 Geometry and house laws');
{
  const G = A.geom;
  check('compass words (ar / en, 8 points)', G.compassWord(0, 'en') === 'north' && G.compassWord(135, 'en') === 'south-east' && G.compassWord(315, 'ar') === 'الشمال الغربي' && G.compassWord(359, 'en') === 'north');
  check('routeLengthM: 3 cells east then 4 cells south = 35 m', Math.abs(G.routeLengthM([[0, 0], [3, 0], [3, 4]]) - 35) < 1e-9);
  check('firstTurn: east then south is a right turn after 15 m; west then south is a left turn', G.firstTurn([[0, 0], [3, 0], [3, 4]]).turn === 'right' && Math.abs(G.firstTurn([[0, 0], [3, 0], [3, 4]]).meters - 15) < 1e-9 && G.firstTurn([[3, 0], [0, 0], [0, 4]]).turn === 'left');
  check('firstTurn: a straight line is straight on; tiny wiggles are ignored', G.firstTurn([[0, 0], [5, 0], [9, 0.2]]).turn === 'straight' && G.firstTurn([[0, 0]]).turn === 'straight');
  check('routeHeading: east = 90°, north = 0°', Math.round(G.routeHeading([[0, 0], [4, 0]])) === 90 && Math.round(G.routeHeading([[0, 4], [0, 0]])) === 0);
  const js = read('js/alert.js'), css = read('css/alert.css'), html = read('alert.html');
  check('law: no innerHTML / outerHTML / insertAdjacentHTML / document.write in alert.js', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  check('law: classic scripts only (no import/export, no type=module)', !/^\s*(import|export)\s/m.test(js) && !/type=["']module/.test(html));
  check('law: no CDN or library — only Google Fonts links, local scripts', !/<script[^>]+src=["']https?:/.test(html) && (html.match(/https:\/\/[^"' )]+/g) || []).every(u => /fonts\.(googleapis|gstatic)\.com|^https:\/\/www\.openstreetmap\.org/.test(u)));
  check('law: the only network call is the OpenStreetMap lookup', (js.match(/\bfetch\(/g) || []).length === 1 && !/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(js) && js.includes('overpass-api.de'));
  check('law: no letter-spacing anywhere', !/letter-spacing/.test(css + js + html));
  const phys = css.match(/(^|[;{\s])(margin|padding|border)-(left|right)\s*:|(^|[;{\s])(left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/g) || [];
  check('law: logical CSS properties only (physical left/right appear only for the always-LTR link text)', phys.length === 1 && /text-align\s*:\s*left/.test(css), phys.join(' ').slice(0, 120));
  check('law: colours come from tokens (hex colours only for the phone bezel, white QR and the high-contrast ink on buttons)', (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).every(c => ['#0b0f17', '#000', '#fff', '#ffffff', '#000000', '#0a0e15', '#1a0d02', '#04200f'].includes(c.toLowerCase())), [...new Set(css.match(/#[0-9a-fA-F]{3,8}\b/g))].join(' '));
  check('honesty: no banned claims in the page source', !/world[- ]first|saves? \d* ?lives|deep learning|AI[- ]powered|artificial intelligence|ذكاء اصطناعي/i.test(html + js));
  check('honesty: SIM / exercise / 999-is-the-dispatcher wording is present', /999/.test(html + js) && /EXERCISE|تمرين/.test(js) && /SIM/.test(js) && /not dispatch|ليس إرسالًا/.test(js));
}

/* ============================================================================================
 * 4+  browser
 * ============================================================================================ */
const browser = await launch();
const HZ = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
const PEOPLE = Object.fromEntries(M.people().map(p => [p.id, p]));
const text = (page, sel) => page.locator(sel).first().textContent();
const ready = async (page) => { await page.waitForFunction(() => window.__alertReady === true, null, { timeout: 8000 }); };
const mk = async (opts = {}) => {
  const { width = 1440, height = 1000, theme = 'dark', reducedMotion = 'reduce', permissions, geolocation, init, clock } = opts;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1, permissions, geolocation });
  if (init) await context.addInitScript(init);
  if (clock) await context.clock.install();
  const r = await openPage(browser, 'alert.html', { ...opts, context });
  await ready(r.page);
  await r.page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  return r;
};
// what the app should show for a phone: the same call the app makes
const expected = (id, hazard, { level = 'evacuate', night = hazard === 'fire' || hazard === 'gas', lang, role } = {}) => {
  const p = PEOPLE[id], persona = role === 'guard' ? 'guard' : p.persona;
  return M.get({ hazard, level, persona, needs: persona === p.persona && (p.also || []).length ? p.also : undefined, asleep: night && persona !== 'guard', lang: lang || p.lang, also: true, vars: id === 'guard' && hazard === 'sos' ? { room: '302' } : {} });
};
const pickHazard = async (page, hz, lv = 'evacuate') => { await page.selectOption('#demo-hazard', hz); await page.selectOption('#demo-level', lv); await page.click('#demo-send'); await page.waitForTimeout(150); };
const phoneState = (page, id) => page.getAttribute(`[data-phone="${id}"]`, 'data-state');

section('4 Loads clean, vocabulary, overflow');
for (const [lang, theme] of [['ar', 'dark'], ['en', 'dark'], ['ar', 'light'], ['en', 'light']]) {
  const { ctx, page, errors } = await openPage(browser, 'alert.html', { width: 1440, theme, lang });
  await ready(page);
  const info = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, phones: document.querySelectorAll('#wall > [data-phone]').length,
    idle: [...document.querySelectorAll('#wall > [data-phone]')].every(c => c.dataset.state === 'idle'), h1: document.querySelector('h1').innerText.trim(), nav: !!document.querySelector('[data-nav] .brand'),
    wallMode: document.body.classList.contains('m-wall') }));
  const ov = await overflow(page);
  check(`${lang}/${theme} 1440: loads with no console errors, 4 idle phones in the wall, nav present`, errors.length === 0 && info.phones === 4 && info.idle && info.nav && info.wallMode && info.lang === lang && info.dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${errors.join(' | ')} ${JSON.stringify(info)}`);
  check(`${lang}/${theme} 1440: h1 says Resident Phones in the page language`, info.h1 === (lang === 'ar' ? 'هواتف السكان' : 'Resident Phones'), info.h1);
  check(`${lang}/${theme} 1440: no horizontal overflow`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  await ctx.close();
}
{
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en' });
  const r = await page.evaluate(() => {
    const ids = ManaraAlert.pictos.ids(), cells = [...document.querySelectorAll('#pic-grid .pg-i')];
    return { drawn: ids.length, cells: cells.length, empty: cells.filter(c => !c.querySelector('svg') || c.querySelectorAll('svg path, svg circle, svg rect, svg ellipse').length < 1).map(c => c.dataset.id) };
  });
  const need = M.pictograms().map(p => p.id);
  check('pictograms: every id of MANARA_MSG.pictograms() is drawn (no generic fallback) and listed on the page', r.drawn === need.length && r.cells === need.length && r.empty.length === 0 && need.every(id => A.pictos.has(id)), JSON.stringify(r));
  const frames = need.map(id => A.pictos.frameOf(id));
  check('pictograms: hazards are triangles, prohibitions are ring+slash, statuses are bare', need.filter(i => i.startsWith('hz-')).every(i => A.pictos.frameOf(i) === 'tri') && need.filter(i => /^act-no-/.test(i) || i === 'act-ac-off').every(i => A.pictos.frameOf(i) === 'ban') && need.filter(i => i.startsWith('st-')).every(i => A.pictos.frameOf(i) === 'none') && frames.every(Boolean));
  check('pictograms: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
for (const [w, q] of [[390, ''], [390, '?mode=wall'], [390, '?persona=huda&lang=ar'], [1440, '?persona=lina&lang=en'], [768, '']]) {
  for (const lang of ['ar', 'en']) {
    const { ctx, page, errors } = await openPage(browser, 'alert.html', { width: w, theme: 'dark', lang, query: q });
    await ready(page);
    const idle = await overflow(page);
    await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
    await pickHazard(page, 'fire').catch(() => {});
    if (q.startsWith('?mode=wall') || w >= 700) await page.waitForTimeout(100);
    const alert = await overflow(page);
    check(`${w}px ${q || '(default)'} ${lang}: no overflow idle or with an alert, no console errors`, idle.scrollW <= idle.W && alert.scrollW <= alert.W && alert.bad.length === 0 && errors.length === 0, `${JSON.stringify(idle.bad)} ${JSON.stringify(alert.bad)} ${errors.join(' | ')}`);
    await ctx.close();
  }
}

section('5 Demo trigger: hazard-correct content per phone, no leakage');
if (on(5)) {
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en' });
  await page.click('[data-lm="en"]');                                    // compare in English so phrases from different hazards are comparable
  const own = {};
  for (const hz of HZ) {
    await pickHazard(page, hz);
    own[hz] = {};
    for (const id of ['ravi', 'huda', 'abu-salem', 'lina']) {
      const st = await phoneState(page, id);
      if (hz === 'sos' && id !== 'abu-salem') { check(`${hz}: ${id} is not alerted (an SOS goes to the victim, volunteers and the guard)`, st === 'idle'); continue; }
      const exp = expected(id, hz, { lang: 'en' });
      const got = { title: await text(page, `[data-phone="${id}"] .al-title`), lines: await page.locator(`[data-phone="${id}"] .al-lines li`).allTextContents(), pics: await page.locator(`[data-phone="${id}"] .pics .pic`).count() };
      own[hz][id] = [got.title, ...got.lines, ...(await page.locator(`[data-phone="${id}"] .al-more li`).allTextContents())].join(' | ');
      check(`${hz}: ${id} shows the messages.js headline, lines and ${exp.pictograms.length} pictogram cards`, st === 'alert' && got.title === exp.headline && JSON.stringify(got.lines) === JSON.stringify(exp.lines) && got.pics === exp.pictograms.length,
        `${st} | ${got.title} vs ${exp.headline} | pics ${got.pics}/${exp.pictograms.length}`);
    }
  }
  // leakage: a line that belongs to another hazard must never appear on a phone showing this hazard
  const foreign = {};
  for (const id of ['ravi', 'huda', 'abu-salem', 'lina']) for (const hz of HZ.filter(h => h !== 'sos')) {
    const mine = expected(id, hz, { lang: 'en' }), mineAll = new Set([mine.headline, ...mine.lines, ...mine.more]);
    for (const other of HZ.filter(h => h !== hz && h !== 'sos')) {
      const o = expected(id, other, { lang: 'en' });
      [...o.lines].filter(l => !mineAll.has(l)).forEach(l => { (foreign[hz + ':' + id] = foreign[hz + ':' + id] || []).push(l); });
    }
  }
  let leaks = [];
  for (const hz of HZ.filter(h => h !== 'sos')) {
    await pickHazard(page, hz);
    for (const id of ['ravi', 'huda', 'abu-salem', 'lina']) {
      const dom = await page.locator(`[data-phone="${id}"] .p-scroll`).innerText();
      (foreign[hz + ':' + id] || []).forEach(l => { if (dom.includes(l)) leaks.push(`${hz}/${id}: "${l}"`); });
    }
  }
  check('no cross-hazard leakage: no instruction line of another hazard appears on any phone', leaks.length === 0, leaks.slice(0, 3).join(' | '));
  await pickHazard(page, 'flood');
  const wc = (await page.locator('[data-phone="abu-salem"] .p-scroll').innerText()).toLowerCase();
  check('flood × wheelchair (Abu Salem): no exit / stairs / refuge-balcony text — "Stay upstairs" only', !/\bstairs\b|nearest open exit|use the lift|refuge balcony/.test(wc) && /stay upstairs/.test(wc), wc.slice(0, 160));
  await pickHazard(page, 'fire');
  const ab = (await page.locator('[data-phone="abu-salem"] .p-scroll').innerText()).toLowerCase();
  check('fire × wheelchair: refuge balcony, no stairs and no lift (safety first)', /refuge balcony/.test(ab) && /do not use the stairs or the lift/.test(ab) && !/use the stairs\. do not use the lift/.test(ab));
  await pickHazard(page, 'gas');
  const lina = (await page.locator('[data-phone="lina"] .p-scroll').innerText()).toLowerCase();
  check('gas × child (Lina): child wording, follow the teacher, no switches', /follow your teacher/.test(lina) && /do not touch the switches/.test(lina));
  // levels
  for (const lv of ['watch', 'warning']) {
    await pickHazard(page, 'flood', lv);
    const e1 = expected('huda', 'flood', { level: lv, night: false, lang: 'en' });
    const t1 = await text(page, '[data-phone="huda"] .al-title');
    const routeCards = await page.locator('[data-phone="huda"] .al-route .rm').count();
    check(`level ${lv}: headline from messages.js, told to stay (no route map)`, t1 === e1.headline && routeCards === 0, `${t1} | ${e1.headline} | ${routeCards}`);
  }
  await pickHazard(page, 'fire');
  const mapCount = await page.locator('[data-phone="huda"] .al-route .rm').count();
  check('level evacuate: Huda gets a route map with distance, wind and a compass from the simulation', mapCount === 1 && (await page.locator('[data-phone="huda"] .al-route .cp').count()) === 1 && /\d+ m/.test(await text(page, '[data-phone="huda"] .rt-meta')));
  const resp = await page.locator('[data-phone="huda"] [data-section="responders"] .resp-row').count();
  check('responder lines from the dispatch (SIM) are shown, each labelled SIM', resp >= 3 && (await page.locator('[data-phone="huda"] [data-section="responders"] .resp-row .tag').first().textContent()).trim().length > 0);
  const respTxt = await page.locator('[data-phone="huda"] [data-section="responders"]').innerText();
  check('responder card says the times are simulated and 999 is the real dispatcher', /simulated|محاكاة/.test(respTxt) && /999/.test(respTxt));
  await page.click('[data-phone="huda"] [data-act="why"]');
  const why = await page.locator('[data-phone="huda"] .resp-why').innerText();
  check('"Why this unit?" explains fastest-with-traffic, not nearest by distance', /fastest/i.test(why) && /not the nearest/i.test(why), why.slice(0, 120));
  check('drone card: green light = friend, follow the green light, honest note (design choice, concept)', /GREEN/.test(await text(page, '[data-phone="huda"] .al-drone')) || /خضر/.test(await text(page, '[data-phone="huda"] .al-drone')));
  check('demo: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('6 Check-in on the bus, Mission Control alerts, dispatch, all-clear');
if (on(6)) {
  const { ctx, page: p1, errors } = await mk({ width: 1440, lang: 'en' });
  const p2 = await ctx.newPage();
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p2.goto(p1.url()); await ready(p2);
  await p2.evaluate(() => { window.__got = []; Manara.link.on(m => window.__got.push(m)); });
  const got = () => p2.evaluate(() => window.__got.slice());
  await pickHazard(p1, 'fire');
  await p1.click('[data-phone="ravi"] [data-act="awake"]');
  await p1.click('[data-phone="ravi"] [data-act="safe"]');
  await p1.click('[data-phone="huda"] [data-act="awake"]');
  await p1.click('[data-phone="huda"] [data-act="needs"]');
  check('Huda has her own need pre-selected (Deaf)', (await p1.getAttribute('[data-phone="huda"] [data-act="need"][data-v="deaf"]', 'aria-pressed')) === 'true');
  await p1.click('[data-phone="huda"] [data-act="need"][data-v="blind"]');
  await p1.click('[data-phone="huda"] [data-act="help"]');
  await p1.waitForTimeout(300);
  const msgs = (await got()).filter(m => m.type === 'citizen');
  const ack = msgs.find(m => m.status === 'ack'), safe = msgs.find(m => m.status === 'safe'), help = msgs.find(m => m.status === 'help');
  check('"I\'m awake" emits a bus message citizen/ack with the room and the person\'s language', ack && ack.room === '203' && ack.lang === 'ml' && /^demo-fire-/.test(ack.id) && ack.demo === true);
  check('"I\'m safe" emits citizen/safe for room 203 in Malayalam (a second page received it)', safe && safe.room === '203' && safe.lang === 'ml' && Array.isArray(safe.needs) && safe.needs.length === 0 && typeof safe.ts === 'number' && safe.from === 'alert.html');
  check('"I need help" emits citizen/help with the chosen needs (deaf + blind) for room 105', help && help.room === '105' && help.lang === 'ar' && help.needs.includes('deaf') && help.needs.includes('blind'), JSON.stringify(help));
  check('demo check-ins are flagged demo:true so a real headcount ignores them', msgs.every(m => m.demo === true));
  check('Ravi shows the counted panel; Huda shows help-sent', /✓|counted|سجّ|تم/.test(await text(p1, '[data-phone="ravi"] .act-done')) || (await p1.locator('[data-phone="ravi"] .act-done.is-safe').count()) === 1);
  check('the room list in the guard view turns green for Ravi and red for Huda', await (async () => {
    await p1.click('[data-more="guard"]');
    const s = await p1.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-phone="guard"] .gd-row')].map(r => [r.dataset.room, r.dataset.status])));
    return s['203'] === 'safe' && s['105'] === 'help';
  })());
  await p1.click('#demo-reset');
  // Mission Control → phones
  await p2.evaluate(() => Manara.link.send({ type: 'alert', id: 'A7', hazard: 'gas', level: 'evacuate', area: { ar: 'الحيّ', en: '<img src=x onerror="window.__pwn=1">Demo' }, at: { x: 59, y: 38 }, wind: { deg: 315, speed: 4 }, you: { x: 59, y: 18 }, distanceM: 99, bearingDeg: 181,
    safe: { x: 50, y: 40, name: { ar: 'نقطة', en: 'Assembly A' } }, route: [[59, 18], [59, 30], [50, 40]], lang: 'ml', persona: 'adult', action: 'gas.crosswind', formats: ['sound', 'vibration'] }));
  await p1.waitForTimeout(300);
  const states = await p1.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-phone]')].map(c => [c.dataset.phone, c.dataset.state])));
  check('a live alert from another tab reaches every phone and the status chip says "Live from Mission Control"', ['ravi', 'huda', 'abu-salem', 'lina', 'guard'].every(i => states[i] === 'alert') && /Live from Mission Control/.test(await text(p1, '#al-link')));
  const eg = expected('ravi', 'gas', { night: true });
  check('Ravi gets the gas evacuate message in Malayalam from messages.js', (await text(p1, '[data-phone="ravi"] .al-title')) === eg.headline);
  const geo = await p1.evaluate(() => Object.fromEntries(['ravi', 'huda', 'abu-salem', 'lina'].map(i => [i, document.querySelectorAll(`[data-phone="${i}"] .al-route .rm`).length])));
  check('the personal route goes to the one phone that matches the message (Malayalam adult = Ravi), not to all four', geo.ravi === 1 && geo.huda === 0 && geo['abu-salem'] === 0 && geo.lina === 0, JSON.stringify(geo));
  check('bus text is never parsed as HTML (an <img onerror> in the area is shown as text)', (await p1.evaluate(() => window.__pwn)) === undefined && /<img src=x/.test(await text(p1, '[data-phone="ravi"] .al-sub')));
  await p2.evaluate(() => Manara.link.send({ type: 'dispatch', id: 'D1', state: 'approved', units: [
    { kind: 'fire', name: { ar: 'محطة (تجريبية)', en: 'Station A <b>(demo)</b>' }, etaMin: 4.2, status: 'en-route', why: { ar: 'أسرع', en: 'Station B is 1 km farther but 47 s faster because of traffic' } },
    { kind: 'ambulance', name: { ar: 'إسعاف', en: 'Ambulance (demo)' }, etaMin: 6, status: 'dispatched', why: null },
    { kind: 'police', name: { ar: 'شرطة', en: 'Police (demo)' }, etaMin: 3, status: 'recommended', why: null }], hospital: null }));
  await p1.waitForTimeout(250);
  await p1.click('[data-lm="en"]');
  const rt = await p1.locator('[data-phone="huda"] [data-section="responders"]').innerText();
  check('dispatch: "Fire engine ETA 4 min" and "Ambulance ETA 6 min — stay where you are" (the unit that reaches the scene fastest)', /Fire engine ETA 4 min/.test(rt) && /Ambulance ETA 6 min — stay where you are/.test(rt), rt.slice(0, 200));
  check('dispatch: an unapproved recommendation (police) is not shown to residents', !/Police ETA/.test(rt));
  check('dispatch: unit names from the bus are text, never HTML', (await p1.locator('[data-phone="huda"] [data-section="responders"] b').evaluateAll(els => els.filter(e => e.closest('.resp-t') && e.tagName === 'B' && e.children.length > 0).length)) === 0 && /Station A <b>/.test(rt));
  await p2.evaluate(() => Manara.link.send({ type: 'alert-clear', id: 'A7' }));
  await p1.waitForTimeout(250);
  const clr = await text(p1, '[data-phone="huda"] .al-title');
  check('alert-clear shows the all-clear message from messages.js', clr === expected('huda', 'gas', { level: 'all-clear', night: false, lang: 'en' }).headline, clr);
  check('after all-clear the check-in bar becomes a single "Got it" button that returns the phone to idle', await (async () => { await p1.click('[data-phone="huda"] [data-act="dismiss"]'); return (await phoneState(p1, 'huda')) === 'idle'; })());
  check('bus: no console errors', errors.length === 0, errors.join(' | '));
  // a page opened later reads the alert that is already active (and ignores one that was cleared)
  await p2.evaluate(() => Manara.link.send({ type: 'alert', id: 'A8', hazard: 'dust', level: 'warning', lang: 'ar', persona: 'adult', action: 'dust.shelter' }));
  const p3 = await ctx.newPage(); await p3.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await p3.goto(p1.url()); await ready(p3);
  check('a phone page opened later shows the alert that is already active', (await phoneState(p3, 'huda')) === 'alert');
  await ctx.close();
}

section('6b A tap is never swallowed by a re-render');
if (on(6)) {
  // Mission Control repeats its alert about every 2 s. A phone that rebuilt its screen while a finger was down on "I'm safe" would lose the tap
  // (the button the finger touched no longer exists when it lifts). Unchanged repeats must not rebuild anything; real changes wait for the finger.
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en', query: '?persona=huda' });
  const p2 = await ctx.newPage(); await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await p2.goto(page.url()); await ready(p2);
  const base = { type: 'alert', id: 'A9', hazard: 'dust', level: 'warning', lang: 'ar', persona: 'adult', action: 'dust.shelter', person: 'huda', etaMin: 6, distanceM: 400, bearingDeg: 90, wind: { deg: 270, speed: 5 }, you: { x: 40, y: 30 } };
  await p2.evaluate(m => Manara.link.send(m), base);
  await page.waitForSelector('[data-phone="huda"] [data-act="safe"]');
  await page.evaluate(() => { document.querySelector('[data-phone="huda"] [data-act="safe"]').__mark = 1; });
  await p2.evaluate(m => Manara.link.send(Object.assign({}, m, { type: 'alert-update' })), base);
  await page.waitForTimeout(250);
  check('an unchanged repeat of the alert (only the time differs) rebuilds nothing', await page.evaluate(() => document.querySelector('[data-phone="huda"] [data-act="safe"]').__mark === 1));
  await page.locator('[data-phone="huda"] [data-act="safe"]').scrollIntoViewIfNeeded();
  const box = await page.locator('[data-phone="huda"] [data-act="safe"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await p2.evaluate(m => Manara.link.send(Object.assign({}, m, { type: 'alert-update', etaMin: 5, distanceM: 380 })), base);   // a real change arrives while the finger is down
  await page.waitForTimeout(300);
  await page.mouse.up(); await page.waitForTimeout(250);
  const ph = await page.evaluate(() => ManaraAlert.debug.phone('huda'));
  check('a real change that arrives while the finger is on "I\'m safe" does not swallow the tap: the check-in is sent', ph.checkin === 'safe', JSON.stringify(ph.checkin));
  check('…and the held-back change is shown right after (the screen now carries the new distance, 380 m)', /380/.test(await text(page, '[data-phone="huda"] .al-route')), (await text(page, '[data-phone="huda"] .al-route')).slice(0, 120));
  check('6b: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('7 Wake-up ladder (fake timers)');
if (on(7)) {
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en', clock: true });
  await page.clock.pauseAt(new Date(Date.now() + 2000));
  await page.selectOption('#demo-hazard', 'fire'); await page.click('#demo-send');
  const step = async () => page.evaluate(() => ManaraAlert.debug.phone('ravi').ladder.step);
  const dom = async () => Number(await page.getAttribute('[data-phone="ravi"] [data-section="ladder"]', 'data-step'));
  check('ladder: Ravi (asleep, Malayalam) starts at step 0 with the "I\'m awake" button leading', (await step()) === 0 && (await dom()) === 0 && (await page.locator('[data-phone="ravi"] .act-awake').count()) === 1);
  const spec = M.ladder({ hazard: 'fire', persona: 'worker', lang: 'ml' }).steps;
  check('ladder: the four steps are +0 / +30 / +60 / +90 s and the first title is the headline', spec.map(s => s.tSec).join() === '0,30,60,90' && (await text(page, '[data-phone="ravi"] .lad-now b')) === spec[0].title);
  await page.clock.runFor(29000); check('ladder: still step 0 at 29 s', (await step()) === 0);
  await page.clock.runFor(2000);  check('ladder: step 1 at 31 s — "Still no answer — louder alarm and light" (own language)', (await step()) === 1 && (await dom()) === 1 && (await text(page, '[data-phone="ravi"] .lad-now b')) === spec[1].title);
  await page.clock.runFor(30000); check('ladder: step 2 at 61 s — the guard is coming to your door', (await step()) === 2 && (await text(page, '[data-phone="ravi"] .lad-now b')) === spec[2].title);
  await page.click('[data-more="guard"]');
  const gtxt = await page.locator('[data-phone="guard"] .al-guard').innerText();
  check('ladder: at step 2 the guard view gets the priority-list notice (x.ladder.2.g) and Ravi\'s room is listed as no reply', gtxt.includes(M.text('x.ladder.2.g', 'ar')) && /203/.test(gtxt) && (await page.evaluate(() => document.querySelector('[data-phone="guard"] .gd-row[data-room="203"]').dataset.status)) === 'wait');
  await page.clock.runFor(30000); check('ladder: step 3 at 91 s — Civil Defence has your room number', (await step()) === 3 && (await text(page, '[data-phone="ravi"] .lad-now b')) === spec[3].title);
  await page.clock.runFor(120000); check('ladder: stays at step 3 (it does not loop or climb further)', (await step()) === 3);
  await page.click('[data-phone="ravi"] [data-act="awake"]');
  const st = await page.evaluate(() => ManaraAlert.debug.phone('ravi'));
  check('ladder: "I\'m awake" stops the ladder (stopped by awake, at step 3)', st.ladder.stopped === 'awake' && st.ladder.stopStep === 3);
  check('ladder: the stopped ladder shows the "alerts stopped" text and the "I\'m safe" button appears', (await text(page, '[data-phone="ravi"] .lad-now')).includes(M.text('x.ladder.stop', 'ml')) && (await page.locator('[data-phone="ravi"] .act-safe').count()) === 1);
  const before = await page.evaluate(() => ManaraAlert.debug.phone('ravi').ladder.elapsed);
  await page.clock.runFor(60000);
  check('ladder: time passing after the stop changes nothing', (await page.evaluate(() => ManaraAlert.debug.phone('ravi').ladder.elapsed)) === before && (await step()) === 3);
  // Huda is Deaf and asleep too: her ladder has no sound
  const huda = await page.evaluate(() => ManaraAlert.debug.phone('huda'));
  check('ladder: every asleep phone runs its own ladder (Huda is still climbing)', huda.ladder.on === true && !huda.ladder.stopped && huda.ladder.step === 3);
  // "I'm safe" also stops a ladder; the day-time alert has no ladder at all
  await page.click('#demo-reset');
  await page.selectOption('#demo-speed', '10');
  await page.selectOption('#demo-hazard', 'gas'); await page.click('#demo-send');
  await page.clock.runFor(3100);
  check('ladder: fast demo speed ×10 moves a step every 3 s and says so', (await step()) === 1 && /×10/.test(await text(page, '[data-phone="ravi"] .al-ladder')));
  await page.click('[data-phone="lina"] [data-act="help"]');
  check('ladder: "I need help" (an answer) stops that phone\'s ladder', (await page.evaluate(() => ManaraAlert.debug.phone('lina').ladder.stopped)) === 'help');
  await page.click('#demo-reset'); await page.selectOption('#demo-speed', '1');
  await page.selectOption('#demo-hazard', 'dust'); await page.click('#demo-send');
  check('day-time hazards (dust, flood, heat) start no ladder', (await page.evaluate(() => ['ravi', 'huda', 'abu-salem', 'lina'].every(i => !ManaraAlert.debug.phone(i).ladder.on))) && (await page.locator('.al-ladder').count()) === 0);
  await page.click('#demo-reset'); await page.click('#demo-ladder');
  check('"Simulate wake-up ladder" button: night fire at fast speed, ladder running on the wall', (await page.evaluate(() => ManaraAlert.debug.settings().speed)) === 10 && (await page.evaluate(() => ManaraAlert.debug.phone('ravi').ladder.on)) === true);
  check('ladder: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('8 Strobe: opt-in, warned, ≤ 3 flashes a second, off under reduced motion');
if (on(8)) {
  // default: off, steady light only
  const a = await mk({ width: 1440, lang: 'en', reducedMotion: 'no-preference', clock: true });
  const pg = a.page;
  check('strobe is OFF by default (html[data-strobe=off])', (await pg.getAttribute('html', 'data-strobe')) === 'off' && (await pg.evaluate(() => ManaraAlert.debug.settings().strobe)) === false);
  const warn = M.text('ui.alert.strobe_warn', 'en');
  check('the photosensitivity warning is shown next to the switch (exact text from messages.js)', (await pg.locator('#set-strobe-box').innerText()).includes(warn));
  await pg.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await pg.selectOption('#demo-hazard', 'fire'); await pg.click('#demo-send');
  check('with strobe off, Huda\'s light is STEADY (the steady fallback), nothing flashes', (await pg.getAttribute('[data-phone="huda"] .p-flash', 'data-mode')) === 'steady');
  await pg.click('#set-strobe');
  check('after opting in, Huda\'s light flashes and the page says the flashing light is on', (await pg.getAttribute('html', 'data-strobe')) === 'on' && (await pg.getAttribute('[data-phone="huda"] .p-flash', 'data-mode')) === 'flash');
  // count flashes per second with a MutationObserver (fake clock: deterministic)
  await pg.evaluate(() => { window.__fl = []; const el = document.querySelector('[data-phone="huda"] .p-flash'); new MutationObserver(() => { if (el.classList.contains('lit')) window.__fl.push(performance.now()); }).observe(el, { attributes: true, attributeFilter: ['class'] }); });
  await pg.clock.runFor(6000);
  const fl = await pg.evaluate(() => window.__fl.slice());
  let maxPerSec = 0; fl.forEach(t => { maxPerSec = Math.max(maxPerSec, fl.filter(u => u >= t && u < t + 1000).length); });
  check('flash rate: at most 3 flashes in any one-second window (WCAG 2.3.1)', fl.length >= 8 && maxPerSec <= 3, `${fl.length} flashes, max ${maxPerSec}/s`);
  check('flash plan comes from messages.js (strobe-optin: 150 ms on / 250 ms off = 2.5 per second)', (await pg.evaluate(() => ManaraAlert.debug.phone('huda').light.id)) === 'strobe-optin');
  await pg.click('#set-strobe');
  check('turning it off returns to the steady light', (await pg.getAttribute('[data-phone="huda"] .p-flash', 'data-mode')) === 'steady' && (await pg.getAttribute('html', 'data-strobe')) === 'off');
  const reload = await pg.evaluate(() => { try { return localStorage.getItem('manara-alert-strobe'); } catch (e) { return null; } });
  check('strobe is never stored: it is opt-in on every visit', reload === null && !(await pg.evaluate(() => Object.keys(localStorage).some(k => /strobe/i.test(k)))));
  await a.ctx.close();
  // reduced motion: disabled
  const b = await mk({ width: 1440, lang: 'en', reducedMotion: 'reduce' });
  await b.page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  check('under prefers-reduced-motion the strobe button is disabled and says a steady light is used', (await b.page.isDisabled('#set-strobe')) && (await text(b.page, '#set-strobe-state')) === M.text('ui.alert.reduced_motion', 'en'));
  await pickHazard(b.page, 'fire');
  await b.page.evaluate(() => document.querySelector('#set-strobe').click());
  check('reduced motion: Huda\'s light stays steady and the setting stays off', (await b.page.getAttribute('[data-phone="huda"] .p-flash', 'data-mode')) === 'steady' && (await b.page.getAttribute('html', 'data-strobe')) === 'off');
  check('reduced motion: the friendly-drone flash and the phone shake are not animated', await b.page.evaluate(() => { const f = document.querySelector('.dr-flash'); return !f || getComputedStyle(f).animationName === 'none' || parseFloat(getComputedStyle(f).animationDuration) < 0.01; }));
  check('strobe: no console errors', a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(' | '));
  await b.ctx.close();
}

section('9 Sound gate, mute, vibration, speech');
if (on(9)) {
  const init = () => {
    window.__vib = []; navigator.vibrate = function (p) { window.__vib.push(Array.isArray(p) ? p.slice() : [p]); return true; };
    window.__say = [];
    const voices = [{ lang: 'en-GB', name: 'Test English', default: true }, { lang: 'ar-SA', name: 'Test Arabic' }];
    const synth = { speaking: false, getVoices: () => voices, cancel() { this.speaking = false; }, speak(u) { window.__say.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, volume: u.volume }); setTimeout(() => u.onend && u.onend(), 50); }, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ''; };
  };
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en', init, clock: true });
  await page.clock.pauseAt(new Date(Date.now() + 2000));
  await page.selectOption('#demo-hazard', 'fire'); await page.click('#demo-send');
  let au = await page.evaluate(() => ManaraAlert.debug.audio());
  check('autoplay policy: before the tap nothing plays — sound is wanted (wake) but not running, vibration is not sent', au.enabled === false && au.want === 'wake' && au.running === null && (await page.evaluate(() => window.__vib.length)) === 0);
  check('a "Tap to enable alerts" gate is shown on the phone that plays the sound (and in the bar)', (await page.locator('[data-phone="ravi"] .act-gate').count()) === 1 && /Tap to enable alerts/.test(await text(page, '#set-enable')));
  check('the gate is only on the audible phone, not on all four', (await page.locator('.act-gate').count()) === 1);
  await page.click('[data-phone="ravi"] .act-gate');
  await page.waitForTimeout(0);
  au = await page.evaluate(() => ManaraAlert.debug.audio());
  check('after the tap: audio enabled, the wake tone (low three-pulse, 520 Hz) is running', au.enabled === true && au.running === 'wake' && au.ctx === 'running', JSON.stringify(au));
  check('the gate disappears once alerts are enabled', (await page.locator('.act-gate').count()) === 0 && /Alerts are on/.test(await text(page, '#set-enable')));
  const vib = await page.evaluate(() => window.__vib.slice());
  check('vibration: the strong wake-up pattern from messages.js is sent after the tap', vib.length >= 1 && JSON.stringify(vib[0]) === JSON.stringify(M.vibration('wake').pattern), JSON.stringify(vib[0]));
  await page.clock.runFor(31000);
  au = await page.evaluate(() => ManaraAlert.debug.audio());
  check('ladder step 1: the louder profile (wake2) replaces the tone', au.running === 'wake2' || au.want === 'wake2', JSON.stringify(au));
  await page.clock.runFor(4000);
  const say = await page.evaluate(() => window.__say.slice());
    check('speech: Ravi\'s Malayalam voice starts on its own after the first tone — this device has no Malayalam voice, so nothing is spoken in a wrong voice', say.length === 0 && (await page.evaluate(() => ManaraAlert.debug.voice())).reason === 'no-voice' && (await page.evaluate(() => ManaraAlert.debug.voice())).lang === 'ml-IN', JSON.stringify(await page.evaluate(() => ManaraAlert.debug.voice())));
  // Arabic voice exists in the stub: Huda has no voice format; read-aloud on Abu Salem speaks ar-QA text
  await page.click('[data-phone="abu-salem"] [data-act="read"]');
  const say2 = await page.evaluate(() => window.__say.slice());
  const exAr = expected('abu-salem', 'fire', {});
  check('speech: "Read aloud" speaks the voice script with the right language tag and a matching voice', say2.length === 1 && say2[0].lang === exAr.voice.lang && say2[0].lang === 'ar-QA' && say2[0].voice === 'Test Arabic' && say2[0].text === exAr.voice.text, JSON.stringify(say2[0]).slice(0, 200));
  await page.click('[data-phone="ravi"] [data-act="read"]');
  check('speech: Malayalam has no voice here → a plain note, nothing spoken in the wrong voice', (await page.evaluate(() => window.__say.length)) === 1 && /no voice|voice/i.test(await text(page, '[data-phone="ravi"] .al-body')) && (await page.evaluate(() => ManaraAlert.debug.voice())).reason === 'no-voice');
  check('Deaf phone: no read-aloud button and no sound format', (await page.locator('[data-phone="huda"] [data-act="read"]').count()) === 0 && (await page.locator('[data-phone="huda"] .fmt.na .fmt-v').first().textContent()).length > 0);
  // mute + volume
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await page.check('#set-mute');
  au = await page.evaluate(() => ManaraAlert.debug.audio());
  check('mute: the tone stops (nothing running) but the alert stays on screen', au.muted === true && au.running === null && (await phoneState(page, 'ravi')) === 'alert');
  await page.uncheck('#set-mute');
  await page.fill('#set-vol', '30');
  check('volume slider is applied and remembered (per-viewer convenience)', (await page.evaluate(() => ManaraAlert.debug.settings().vol)) === 30 && (await page.evaluate(() => localStorage.getItem('manara-alert-vol'))) === '30' && (await text(page, '#set-vol-out')) === '30%');
  // sound only from the audible phone
  check('Huda (Deaf) has no "play the sound from this phone" button: it would be silent anyway', (await page.locator('[data-phone="huda"] [data-act="hear"]').count()) === 0);
  await page.click('[data-phone="abu-salem"] [data-act="hear"]');
  au = await page.evaluate(() => ManaraAlert.debug.audio());
  check('"Play the sound from this phone" moves the sound to Abu Salem (wheelchair user, sound + vibration)', (await page.evaluate(() => ManaraAlert.app.audible)) === 'abu-salem' && au.want !== null && (await page.locator('[data-phone="ravi"] .act-gate').count()) === 0);
  await page.click('[data-phone="lina"] [data-act="hear"]');
  check('…and to Lina (child: sound + voice)', (await page.evaluate(() => ManaraAlert.debug.audio())).want !== null);
  // answering stops the alert sound
  await page.click('[data-phone="lina"] [data-act="help"]');
  check('answering ("I need help") stops the alarm sound on that phone', (await page.evaluate(() => ManaraAlert.debug.audio())).want === null);
  check('sound: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
if (on(9)) {
  // no vibration / no speech support at all: the page must still work and say so
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en', init: () => { delete Navigator.prototype.vibrate; Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); } });
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  check('no Vibration API (e.g. Safari on iPhone): the settings say so and the pattern is drawn on screen instead', /not supported/.test(await text(page, '#set-vib-note')));
  await pickHazard(page, 'fire');
  check('no speech support: the phone shows a plain note instead of a read-aloud button', (await page.locator('[data-phone="ravi"] [data-act="read"]').count()) === 0 && /no speech voice|speech voice/i.test(await text(page, '[data-phone="ravi"] .al-body')));
  check('the haptic strip (pattern bars) is drawn for every alerting phone', (await page.locator('[data-phone="ravi"] .hap i').count()) === M.vibration('wake').pattern.length);
  check('no sound API errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('10 Nearby facilities (informational, consent, one query)');
if (on(10)) {
  const fixtureFor = (lat, lon) => ({ elements: [
    { type: 'node', id: 1, lat: lat + 0.02, lon, tags: { amenity: 'hospital', name: 'Fixture General Hospital', 'name:ar': 'مستشفى الاختبار' } },
    { type: 'way', id: 2, center: { lat: lat - 0.01, lon }, tags: { amenity: 'police', name: 'Fixture Police Station' } },
    { type: 'node', id: 3, lat, lon: lon + 0.03, tags: { amenity: 'fire_station', name: 'Fixture Fire Station' } }] });
  const GEO = { latitude: 0.5, longitude: 0.5 };
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en', permissions: ['geolocation'], geolocation: GEO });
  let requests = []; await ctx.route(/overpass-api\.de/, r => { requests.push({ method: r.request().method(), body: r.request().postData(), headers: r.request().headers() }); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(0.5, 0.5)) }); });
  await pickHazard(page, 'fire');
  check('nearby card shows the title, the consent line and a button — and has made NO request yet', requests.length === 0 && (await text(page, '[data-phone="huda"] .al-nb')).includes(M.text('ui.nearby.title', 'ar')) && (await page.locator('[data-phone="huda"] [data-act="nearby"]').count()) === 1);
  check('before consent no geolocation is used and no call link exists', (await page.locator('a[href^="tel:"]').count()) === 0);
  await page.click('[data-phone="huda"] [data-act="nearby"]');
  await page.waitForSelector('[data-phone="huda"] .nb-list');
  const card = await page.locator('[data-phone="huda"] .al-nb').innerText();
  const exp = { h: O.distance(Math.round(hav(0.5, 0.5, 0.52, 0.5)), 'ar'), p: O.distance(Math.round(hav(0.5, 0.5, 0.49, 0.5)), 'ar'), f: O.distance(Math.round(hav(0.5, 0.5, 0.5, 0.53)), 'ar') };
  check('after the tap: ONE query, a POST to the Overpass endpoint carrying the three amenities and the position', requests.length === 1 && requests[0].method === 'POST' && /amenity/.test(decodeURIComponent(requests[0].body)) && /around:15000,0\.50000,0\.50000/.test(decodeURIComponent(requests[0].body)));
  check('the request carries no cookies, no referrer and no custom headers (only the form body)', !requests[0].headers.cookie && !requests[0].headers.referer && !requests[0].headers.authorization);
  check('results: nearest hospital (Arabic name), police (way centre) and fire station, each with a straight-line distance and a direction', /مستشفى الاختبار/.test(card) && /Fixture Police Station/.test(card) && /Fixture Fire Station/.test(card) && card.includes(exp.h) && card.includes(exp.p) && card.includes(exp.f), card.slice(0, 300));
  check('the card says: informational, not dispatch — call 999; straight-line distance (traffic not known); OpenStreetMap contributors', /للاطلاع فقط/.test(card) && /999/.test(card) && /خط مستقيم/.test(card) && (await page.locator('[data-phone="huda"] .al-nb a[href="https://www.openstreetmap.org/copyright"]').count()) === 1);
  await page.click('[data-lm="en"]');
  const en = await page.locator('[data-phone="huda"] .al-nb').innerText();
  check('English wording: "Informational, not dispatch — call 999", "Distance, not travel time", OpenStreetMap data may be incomplete', /Informational, not dispatch — call 999/.test(en) && /Straight-line distance\. Traffic is not known here\./.test(en) && /OpenStreetMap data may be incomplete/.test(en) && /© OpenStreetMap contributors/.test(en), en.slice(0, 400));
  const store = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  check('nothing about the lookup is stored (no coordinates, no results in local/session storage)', !/0\.5|Fixture|nearby|geo/i.test(store.replace(/manara-last-[a-z-]+/g, '')) , store.slice(0, 200));
  check('two-step 999: the first tap only opens a warning (exercise page), the dialer link appears after', (await page.locator('a[href^="tel:"]').count()) === 0 && await (async () => { await page.click('[data-phone="huda"] [data-act="call"]'); return (await page.locator('[data-phone="huda"] a[href="tel:999"]').count()) === 1 && /real emergency/.test(await text(page, '[data-phone="huda"] .nb-call')); })());
  await page.click('[data-phone="huda"] [data-act="call-cancel"]');
  check('cancel closes the warning without dialling', (await page.locator('a[href^="tel:"]').count()) === 0);
  await page.click('[data-phone="huda"] [data-act="nearby-clear"]');
  check('"Clear results" removes the list from memory and the screen', (await page.locator('.nb-list').count()) === 0 && (await page.locator('[data-phone="huda"] [data-act="nearby"]').count()) === 1);
  // offline
  await ctx.setOffline(true);
  await page.click('[data-phone="huda"] [data-act="nearby"]');
  await page.waitForTimeout(150);
  check('offline: a clear message ("No internet… call 999"), and no request was attempted', /No internet, so the lookup cannot run\. In an emergency call 999\./.test(await text(page, '[data-phone="huda"] .al-nb')) && requests.length === 1);
  await ctx.setOffline(false);
  // network error
  await ctx.unroute(/overpass-api\.de/); await ctx.route(/overpass-api\.de/, r => r.abort());
  await page.click('[data-phone="huda"] [data-act="nearby"]'); await page.waitForTimeout(400);
  check('a failed lookup shows "The lookup failed… call 999" and can be retried', /The lookup failed/.test(await text(page, '[data-phone="huda"] .al-nb')) && (await page.locator('[data-phone="huda"] [data-act="nearby"]').count()) === 1);
  // HTTP 429
  await ctx.unroute(/overpass-api\.de/); await ctx.route(/overpass-api\.de/, r => r.fulfill({ status: 429, body: 'busy' }));
  await page.click('[data-phone="huda"] [data-act="nearby"]'); await page.waitForTimeout(400);
  check('an HTTP error (rate limit) is handled the same way', /The lookup failed/.test(await text(page, '[data-phone="huda"] .al-nb')));
  check('nearby: no console errors besides the aborted requests we caused', errors.filter(e => !/overpass|ERR_FAILED|429|Failed to load resource/.test(e)).length === 0, errors.join(' | '));
  await ctx.close();
  // permission denied
  const d = await mk({ width: 1440, lang: 'en', permissions: [] });
  await d.page.addInitScript(() => {});
  await d.page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, bad) => setTimeout(() => bad({ code: 1, message: 'denied' }), 10); });
  await pickHazard(d.page, 'fire');
  await d.page.click('[data-lm="en"]');                                      // Huda's own language is Arabic: show her phone in English for the wording check
  await d.page.click('[data-phone="huda"] [data-act="nearby"]'); await d.page.waitForTimeout(200);
  check('location denied: "Location access was not allowed." and a way to try again', /Location access was not allowed\./.test(await text(d.page, '[data-phone="huda"] .al-nb')) && (await d.page.locator('[data-phone="huda"] [data-act="nearby"]').count()) === 1 && (await d.page.locator('a[href^="tel:"]').count()) === 0);
  await d.ctx.close();
}

section('11 QR card on the page');
if (on(11)) {
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'en' });
  const grab = () => page.evaluate(() => {
    const c = document.getElementById('qr-canvas'), g = c.getContext('2d'), size = +c.dataset.size, n = size + 8, sc = c.width / n, rows = [];
    for (let y = 0; y < size; y++) { let r = ''; for (let x = 0; x < size; x++) { const d = g.getImageData(Math.floor((x + 4 + 0.5) * sc), Math.floor((y + 4 + 0.5) * sc), 1, 1).data; r += d[0] < 128 ? '1' : '0'; } rows.push(r); }
    const corner = g.getImageData(1, 1, 1, 1).data;
    return { rows, ok: c.dataset.ok, link: document.getElementById('qr-link').textContent, quiet: [corner[0], corner[1], corner[2]], aria: c.getAttribute('aria-label') };
  });
  let r = await grab();
  const dec = qrDecode(r.rows);
  check('QR card: the canvas, sampled module by module, decodes to exactly the link shown under it', r.ok === '1' && dec.text === r.link && !dec.error, dec.error || `${dec.text} vs ${r.link}`);
  check('QR card: the link points at this page with persona and language (and starts with file:// here)', /^file:\/\/.*alert\.html\?persona=ravi&lang=ml&hazard=fire&level=evacuate&asleep=1$/.test(r.link));
  check('QR card: dark-on-light with a white quiet zone in every theme; alt text names the person', r.quiet.every(v => v === 255) && /Ravi/.test(r.aria), r.aria);
  check('QR card: honest about file:// and about the live link being same-browser only', /file:\/\//.test(await text(page, '#qr-msg')) && /same browser/.test(await text(page, '#qr-msg')));
  await page.fill('#qr-base', 'http://192.168.1.20:8765/manara/alert.html?x=1#y'); await page.selectOption('#qr-person', 'huda'); await page.selectOption('#qr-lang', 'en'); await page.uncheck('#qr-start');
  r = await grab();
  check('QR card: editing the address / person / language redraws; the query and fragment of the base are replaced', r.link === 'http://192.168.1.20:8765/manara/alert.html?persona=huda&lang=en' && qrDecode(r.rows).text === r.link);
  check('QR card: the file:// warning goes away for an http address', !/file:\/\//.test(await text(page, '#qr-msg')));
  await page.fill('#qr-base', 'http://example.test/' + 'a'.repeat(300));
  check('QR card: a link longer than the small encoder supports shows a clear message and hides the canvas', (await page.getAttribute('#qr-canvas', 'data-ok')) === '0' && /longer than this small generator supports/.test(await text(page, '#qr-msg')) && (await page.isHidden('#qr-canvas')));
  await page.fill('#qr-base', 'http://192.168.1.20:8765/manara/alert.html');
  await page.selectOption('#qr-lang', 'own'); await page.selectOption('#qr-person', 'ravi');
  check('QR card: "own language" resolves to the person\'s language (Malayalam for Ravi)', /lang=ml/.test(await text(page, '#qr-link')));
  const href = await page.getAttribute('#qr-open', 'href');
  check('QR card: the "Open the link" anchor carries the same link', href === await text(page, '#qr-link'));
  check('QR: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('12 Language switch, draft banner, accessibility modes, persona URLs');
if (on(12)) {
  const { ctx, page, errors } = await mk({ width: 1440, lang: 'ar' });
  await pickHazard(page, 'fire');
  const ravi0 = await text(page, '[data-phone="ravi"] .al-title'), huda0 = await text(page, '[data-phone="huda"] .al-title');
  const cap0 = await text(page, '[data-phone="ravi"] .pcap h3'), h1ar = await page.locator('h1').innerText();
  check('Arabic page: captions in Arabic, Ravi\'s alert in Malayalam, Huda\'s in Arabic', cap0 === 'رافي' && ravi0 === expected('ravi', 'fire', {}).headline && huda0 === expected('huda', 'fire', {}).headline && /^[ഀ-ൿ]/.test(ravi0.replace(/^[^ഀ-ൿ؀-ۿ]+/, '')));
  await page.click('[data-lang-toggle]'); await page.waitForTimeout(200);
  check('switching to English re-renders the page chrome and the captions at once', (await page.locator('h1').innerText()) === 'Resident Phones' && (await text(page, '[data-phone="ravi"] .pcap h3')) === 'Ravi' && h1ar !== 'Resident Phones');
  check('…while each person keeps their own language in the alert (Ravi: Malayalam, Huda: Arabic)', (await text(page, '[data-phone="ravi"] .al-title')) === ravi0 && (await text(page, '[data-phone="huda"] .al-title')) === huda0);
  check('…and the phone chrome of Ravi (no Malayalam UI strings exist) falls back to English, never to a raw key', /Route|route/.test(await text(page, '[data-phone="ravi"] .al-route')) && !/al\.[a-z]+\.[a-z]/.test(await page.locator('body').innerText()));
  check('draft banner on Ravi\'s Malayalam phone: both Arabic and English notices, and the Arabic/English text shown below', (await text(page, '[data-phone="ravi"] .al-draft')).includes(M.text('ui.alert.draft', 'ar')) && (await text(page, '[data-phone="ravi"] .al-draft')).includes(M.text('ui.alert.draft', 'en')) && (await page.locator('[data-phone="ravi"] .al-also').count()) === 1);
  check('no draft banner on the Arabic phones', (await page.locator('[data-phone="huda"] .al-draft').count()) === 0 && (await page.locator('[data-phone="lina"] .al-draft').count()) === 0);
  const alsoTxt = await text(page, '[data-phone="ravi"] .al-also');
  check('the Arabic and English versions under the draft are the real messages.js texts', alsoTxt.includes(expected('ravi', 'fire', { lang: 'en' }).lines[0]) && alsoTxt.includes(expected('ravi', 'fire', { lang: 'ar' }).lines[0]));
  await page.click('[data-phone="ravi"] [data-act="lang"][data-v="en"]');
  check('the per-phone language chip switches Ravi\'s message to English (no draft banner for English)', (await text(page, '[data-phone="ravi"] .al-title')) === expected('ravi', 'fire', { lang: 'en' }).headline && (await page.locator('[data-phone="ravi"] .al-draft').count()) === 0);
  await page.click('[data-phone="ravi"] [data-act="lang"][data-v="ml"]');
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await page.click('[data-lm="ar"]');
  check('the global "Phone language" control overrides all phones (Arabic) and "own" restores them', (await text(page, '[data-phone="ravi"] .al-title')) === expected('ravi', 'fire', { lang: 'ar' }).headline);
  await page.click('[data-lm="own"]');
  check('…restoring each person\'s own language', (await text(page, '[data-phone="ravi"] .al-title')) === ravi0);
  // live region + accessibility
  const live = await page.evaluate(() => ({ role: document.getElementById('al-live').getAttribute('aria-live'), text: document.getElementById('al-live').textContent }));
  check('screen readers: an assertive live region announces the new alert (headline + first lines)', live.role === 'assertive' && live.text.length > 10, live.text);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href], select, input')].filter(e => e.offsetParent !== null && !(e.getAttribute('aria-label') || e.textContent.trim() || (e.labels && e.labels.length) || e.getAttribute('title'))).map(e => e.outerHTML.slice(0, 60)));
  check('every visible control has an accessible name (real buttons, labelled fields)', unnamed.length === 0, unnamed.slice(0, 3).join(' | '));
  check('phones are keyboard-scrollable regions with a name; check-in controls are <button>', await page.evaluate(() => [...document.querySelectorAll('.p-scroll')].every(s => s.tabIndex === 0 && s.getAttribute('role') === 'region' && s.getAttribute('aria-label')) && [...document.querySelectorAll('.act-big')].every(b => b.tagName === 'BUTTON')));
  check('check-in buttons are large touch targets (≥ 56 px high)', await page.evaluate(() => [...document.querySelectorAll('[data-phone="huda"] .act-big')].every(b => b.getBoundingClientRect().height >= 56)));
  await page.check('#set-big'); await page.check('#set-hc');
  check('large text and high contrast are applied to every phone', await page.evaluate(() => [...document.querySelectorAll('.p-screen')].every(s => s.classList.contains('big') && s.classList.contains('hc'))));
  const fs2 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-phone="lina"] .al-lines li')).fontSize));
  await page.uncheck('#set-big'); await page.uncheck('#set-hc');
  const fs1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-phone="lina"] .al-lines li')).fontSize));
  check('large text really enlarges the instructions', fs2 > fs1 + 2, `${fs1} → ${fs2}`);
  check('Deaf (Huda), blind and elderly personas get large text by default', await page.evaluate(() => document.querySelector('[data-phone="huda"] .p-screen').classList.contains('big') && document.querySelector('[data-phone="abu-salem"] .p-screen').classList.contains('big') && !document.querySelector('[data-phone="lina"] .p-screen').classList.contains('big')));
  check('language/theme: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
if (on(12)) {
  // one phone (QR link): persona + language from the URL, demo alert starts by itself
  const { ctx, page, errors } = await mk({ width: 390, lang: 'ar', theme: 'light' });
  await page.goto((await page.url()).split('?')[0] + '?persona=ravi&lang=ml&hazard=fire&level=evacuate&asleep=1'); await ready(page);
  const info = await page.evaluate(() => ({ phone: document.body.classList.contains('m-phone'), qr: document.body.classList.contains('m-qr'), visible: [...document.querySelectorAll('[data-phone]')].filter(c => c.offsetParent !== null).map(c => c.dataset.phone), state: document.querySelector('[data-phone="ravi"]').dataset.state, ladder: ManaraAlert.debug.phone('ravi').ladder.on }));
  check('?persona=ravi&lang=ml&hazard=fire opens ONE phone in phone mode with the demo alert and the ladder already running', info.phone && info.qr && info.visible.join() === 'ravi' && info.state === 'alert' && info.ladder, JSON.stringify(info));
  const box = await page.evaluate(() => { const r = document.querySelector('[data-phone="ravi"] .phone').getBoundingClientRect(); return { w: r.width, h: r.height, vh: innerHeight }; });
  check('on a 390 px phone the screen is full width (no bezel) and as tall as the viewport allows', box.w >= 389 && box.h >= 600, JSON.stringify(box));
  const ov = await overflow(page);
  check('390 px phone mode with an active alert: no horizontal overflow', ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  check('the "Tap to enable alerts" gate is on the phone screen', (await page.locator('.act-gate').count()) === 1);
  await ctx.close();
  const b = await mk({ width: 1440, lang: 'en' });
  await b.page.goto((await b.page.url()).split('?')[0] + '?persona=lina&lang=en'); await ready(b.page);
  check('?persona=lina on desktop: phone mode with a persona picker and Lina\'s story', (await b.page.locator('#solo-pick .chip').count()) === 6 && /Lina/.test(await text(b.page, '#solo-info')) && (await phoneState(b.page, 'lina')) === 'idle');
  await b.page.click('#solo-pick [data-solo="yousef"]');
  await b.page.click('[data-phone="yousef"] [data-act="try"][data-v="flood"]');
  const you = await text(b.page, '[data-phone="yousef"] .al-title');
  check('persona switcher → Yousef (blind): the voice-flow card with the script that is read aloud', you === expected('yousef', 'flood', { night: false }).headline && (await b.page.locator('[data-phone="yousef"] .al-voice .bl-script').count()) === 1 && (await b.page.locator('[data-phone="yousef"] .al-voice .act-big').count()) === 1);
  await b.page.click('#al-modes [data-mode="wall"]');
  check('the mode switch returns to the wall with all four phones', (await b.page.locator('#wall > [data-phone]').count()) === 4);
  check('persona URLs: no console errors', errors.length === 0 && b.errors.length === 0, errors.concat(b.errors).join(' | '));
  await b.ctx.close();
}

/* ============================================================================================
 * 13  contrast (WCAG 1.4.3) of every visible text in both themes and languages, in every state; layout checks
 * ============================================================================================ */
section('13 Contrast, pictogram fit, wall alignment, one-phone panel');
const CONTRAST_AUDIT = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => { const a = t[3] + b[3] * (1 - t[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (t[i] * t[3] + b[i] * b[3] * (1 - t[3])) / a).concat([a]); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = el => {
    let acc = [0, 0, 0, 0];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e); let c = rgba(cs.backgroundColor), bi = cs.backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { const cols = (bi.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/gi) || []).map(rgba); if (cols.length) c = [0, 1, 2].map(i => cols.reduce((a, x) => a + x[i], 0) / cols.length).concat([Math.max(...cols.map(x => x[3]))]); }
      acc = over(acc, c); if (acc[3] >= 0.999) break;
    }
    if (acc[3] < 0.999) acc = over(acc, rgba(getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : getComputedStyle(document.documentElement).backgroundColor));
    return acc;
  };
  const bad = [], seen = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n = 0;
  while (w.nextNode()) {
    const t = w.currentNode, el = t.parentElement; if (!t.nodeValue.trim() || !el || seen.has(el)) continue; seen.add(el);
    if (el.closest('button:disabled,[disabled],[aria-hidden="true"],[hidden],script,style,.sr-only,[data-nav],[data-footer],.nav,.foot,option,canvas,svg')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    const bg = bgOf(el); let fg = rgba(cs.color); fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), px = parseFloat(cs.fontSize);
    const need = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5; n++;
    if (ratio < need) bad.push(`${(typeof el.className === 'string' && el.className) || el.tagName} "${t.nodeValue.trim().slice(0, 24)}" ${ratio.toFixed(2)}<${need}`);
  }
  return { n, bad: bad.slice(0, 6), count: bad.length };
};
if (on(13)) {
  const STATES = [
    ['idle', null],
    ...HZ.map(h => [h, `ManaraAlert.debug.demo('${h}','${h === 'dust' ? 'warning' : 'evacuate'}',{night:${h === 'fire' || h === 'gas'}})`]),
    ['night fire: guard view + ladder step 3', `ManaraAlert.debug.demo('fire','evacuate',{night:true}); document.querySelector('[data-more="guard"]').click(); document.getElementById('demo-speed').value='10'; document.getElementById('demo-speed').dispatchEvent(new Event('change')); ManaraAlert.debug.demo('fire','evacuate',{night:true})`],
    ['large text + high contrast', `document.getElementById('set-hc').click(); document.getElementById('set-big').click()`],
    ['answered, details open', `['awake','help'].forEach(a=>document.querySelectorAll('[data-act='+a+']').forEach((b,i)=>{ if(i<2) b.click(); })); ['why','drone','more','needs'].forEach(a=>document.querySelectorAll('[data-act='+a+']').forEach(b=>b.click()))`],
    ['all-clear', `document.getElementById('demo-clear').click()`]
  ];
  let total = 0, worst = [];
  for (const theme of ['dark', 'light']) for (const lang of ['ar', 'en']) {
    const { ctx, page } = await mk({ width: 1440, theme, lang });
    for (const [name, pre] of STATES) {
      if (pre) await page.evaluate(pre);
      await page.waitForTimeout(120);
      if (name === 'night fire: guard view + ladder step 3') await page.waitForTimeout(3300);
      const r = await page.evaluate(CONTRAST_AUDIT); total += r.n;
      if (r.count) worst.push(`${theme}/${lang}/${name}: ${r.bad.join(' ; ')}`);
    }
    await ctx.close();
  }
  check(`contrast: all ${total} visible text runs meet WCAG AA (4.5, or 3 for large text) in dark + light × ar + en, across idle, six hazards, ladder, guard view, large text + high contrast, answered, all-clear`, worst.length === 0, worst.slice(0, 3).join(' || '));

  // the page clips horizontal overflow (overflow-x: clip), so a long word or link that spills out of its box would be invisible to a scrollWidth
  // test of the page: look at every box instead — no element may hold content wider than itself (scroll containers excepted)
  {
    const AUD = () => { const bad = []; document.querySelectorAll('body *').forEach(el => {
      if (/^(svg|canvas|path|g|circle|rect|line|polyline|text|use|defs|tspan|option|select|input)$/i.test(el.tagName) || el.closest('svg,[hidden],#al-store,.sr-only')) return;
      const cs = getComputedStyle(el); if (['none', 'inline', 'contents'].includes(cs.display) || !el.getBoundingClientRect().width || ['auto', 'scroll'].includes(cs.overflowX)) return;
      if (el.scrollWidth > el.clientWidth + 1) bad.push(((typeof el.className === 'string' && el.className) || el.tagName).split(' ').slice(0, 2).join('.') + ` ${el.scrollWidth}>${el.clientWidth}`);
    }); return bad.slice(0, 6); };
    const SH = [['idle', null], ['fire', `ManaraAlert.debug.demo('fire','evacuate',{night:true})`], ['flood', `ManaraAlert.debug.demo('flood','evacuate',{night:false})`], ['sos', `ManaraAlert.debug.demo('sos','evacuate',{night:false})`],
      ['details open', `['why','drone','more','needs'].forEach(a=>document.querySelectorAll('[data-act='+a+']').forEach(b=>b.click()))`]];
    const found = []; let runs = 0;
    for (const [w, q] of [[390, ''], [390, '?mode=wall'], [390, '?persona=ravi&lang=ml'], [1440, '']]) for (const lang of ['ar', 'en']) {
      const { ctx, page } = await mk({ width: w, height: w < 600 ? 844 : 900, lang, query: q });
      for (const [name, pre] of SH) { if (pre) await page.evaluate(pre); await page.waitForTimeout(120); const b = await page.evaluate(AUD); runs++; if (b.length) found.push(`${w}${q} ${lang} ${name}: ${b.join(', ')}`); }
      await ctx.close();
    }
    check(`no box holds content wider than itself (${runs} states: 390 phone / 390 wall / QR link / 1440 × ar, en) — nothing is silently clipped`, found.length === 0, found.slice(0, 3).join(' || '));
  }

  // pictograms stay inside their cards, also in large-text mode (Huda is Deaf: large text by default) on a 390 px phone
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await mk({ width: 390, height: 844, lang, query: '?persona=huda&hazard=gas&level=evacuate' });
    const fit = await page.evaluate(() => [...document.querySelectorAll('#solo-phone .p-screen .pic')].map(c => { const a = c.getBoundingClientRect(), b = c.querySelector('svg').getBoundingClientRect(); return b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.width > 40; }));
    check(`390 px (${lang}) large-text phone: all ${fit.length} pictograms fit inside their cards and stay bigger than 40 px`, fit.length >= 4 && fit.every(Boolean), JSON.stringify(fit));
    await ctx.close();
  }
  {
    const { ctx, page } = await mk({ width: 1440, lang: 'en' });
    const g = await page.evaluate(() => ({ tops: [...document.querySelectorAll('#wall .phone')].map(p => Math.round(p.getBoundingClientRect().top)), hero: Math.round(document.querySelector('.al-hero-t').getBoundingClientRect().left), wall: Math.round(document.querySelector('#wall').getBoundingClientRect().left), ctl: Math.round(document.querySelector('.ctl').getBoundingClientRect().left) }));
    check('wall: the four phones start at the same height whatever the caption length, and hero, controls and wall share one left edge', g.tops.length === 4 && new Set(g.tops).size === 1 && g.hero === g.wall && g.ctl === g.wall, JSON.stringify(g));
    await ctx.close();
  }
  {
    const { ctx, page } = await mk({ width: 1440, lang: 'en', query: '?persona=lina' });
    check('one phone (desktop): the side panel shows Lina\'s language and need tags and the six "try a hazard" chips', (await page.locator('#solo-info .tag').count()) >= 2 && (await page.locator('#solo-info [data-try]').count()) === 6);
    await page.click('#solo-info [data-try="gas"]'); await page.waitForTimeout(150);
    check('one phone: a "try a hazard" chip starts that hazard on this phone, with Lina\'s own wording', (await text(page, '[data-phone="lina"] .al-title')) === expected('lina', 'gas').headline);
    await page.click('#solo-info [data-soloqr]'); await page.waitForTimeout(150);
    check('one phone: "QR code for this phone" selects Lina in the QR card', (await page.inputValue('#qr-person')) === 'lina' && /persona=lina/.test(await text(page, '#qr-link')));
    await ctx.close();
  }
}

/* ============================================================================================
 * review screenshots (optional)
 * ============================================================================================ */
if (SHOTS) {
  section('screenshots → ' + SHOTS);
  for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const w of [390, 1440]) {
    for (const scene of ['wall-idle', 'wall-fire', 'wall-flood', 'solo-fire']) {
      if (w === 390 && scene.startsWith('wall')) { }
      const q = scene.startsWith('solo') ? '?persona=huda' : (w === 390 ? '?mode=wall' : '');
      const { ctx, page } = await openPage(browser, 'alert.html', { width: w, height: w < 600 ? 844 : 1300, theme, lang, query: q });
      await ready(page);
      if (scene === 'wall-fire' || scene === 'solo-fire') await pickHazard(page, 'fire').catch(() => {});
      if (scene === 'wall-flood') await pickHazard(page, 'flood').catch(() => {});
      await page.waitForTimeout(300);
      const f = path.join(SHOTS, `alert-${scene}-${w}-${theme}-${lang}.png`); await page.screenshot({ path: f }); console.log('  ' + f);
      await ctx.close();
    }
  }
}

await done(browser);
