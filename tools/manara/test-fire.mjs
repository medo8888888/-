// ManaraFire engine tests — Node only, no browser:  node tools/manara/test-fire.mjs
//
//  1. API shape, parameters, downscale
//  2. Synthetic frames: flame-like blob → fire pixels; blue / grey → nothing; sensitivity monotonicity
//  3. Temporal detector: static fire-coloured squares never reach 'fire'; a sliding one neither;
//     a flickering flame reaches 'fire' within confirmFrames + 2 and clears with hysteresis;
//     drifting grey haze over a textured scene reaches 'smoke'; a static grey wall does not
//  4. Real photos → confusion matrices for scoreImage:
//       sample set   16 site images (site/manara/assets/samples)          thresholds hand-tuned on these
//       tuning set   16 extra photos (tools/manara/photos, set 'tuning')  used for a second tuning round
//       test set     18 photos (tools/manara/photos, set 'test')          never used to change the engine → honest
//  5. Timing (analyze() on 320×240 must be < 8 ms)
//
// Photos are decoded by tools/manara/samples.py (Pillow) so Node sees exactly the pixels of the browser bench.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// Paths follow this file's folder name (tools/<name>/ ↔ site/<name>/), so a rename of the project folder needs no edit.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '../../site', path.basename(HERE));
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(SITE, 'js/fire.js'), 'utf8'), ctx, { filename: 'fire.js' });
const F = ctx.ManaraFire;

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log(`\n${t}`);
const fmt = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));

// ---------------------------------------------------------------- synthetic frames (deterministic)
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeFrame(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y), p = (y * w + x) * 4;
    data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
  }
  return { data, width: w, height: h };
}
const W = 320, H = 240;

// Flame-like blob: white-yellow core → orange → red rim on a dark background, ragged boundary.
// k = animation step (shape, size and brightness change with k), noise = sensor noise amplitude.
function flame(k, { seed = 7, noise = 6, cx = W / 2, cy = H * 0.62, R = 34 } = {}) {
  const rnd = rng(seed * 1000 + k), scale = 0.88 + 0.24 * rnd(), bright = 0.86 + 0.14 * rnd(), ph = rnd() * 6.28, ph2 = rnd() * 6.28;
  return makeFrame(W, H, (x, y) => {
    const n = (rnd() - 0.5) * 2 * noise;
    let dx = x - cx, dy = y - cy;
    if (dy < 0) dy /= 1.9;                                   // flames are taller than wide
    const d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const r = R * scale * (1 + 0.2 * Math.sin(5 * th + ph) + 0.12 * Math.sin(11 * th + ph2));
    const u = d / r, t = (rnd() - 0.5) * 30;                 // t: flame texture
    if (u < 0.35) return [255, 246 + n, 200 + n];
    if (u < 0.7) { const f = (u - 0.35) / 0.35; return [255 * bright, (215 - 70 * f + t) * bright, (70 - 30 * f + n) * bright]; }
    if (u < 1) { const f = (u - 0.7) / 0.3; return [(245 - 30 * f + t / 2) * bright, (120 - 60 * f + t) * bright, (35 + n) * bright]; }
    return [18 + n, 16 + n, 22 + n];
  });
}
// Static or moving square of one colour on a dark, slightly textured background (new sensor noise each frame).
function square(k, colour, { x0 = 130, y0 = 90, size = 60, vx = 0, noise = 6, seed = 3 } = {}) {
  const rnd = rng(seed * 1000 + k), sx = x0 + vx * k;
  return makeFrame(W, H, (x, y) => {
    const n = (rnd() - 0.5) * 2 * noise;
    if (x >= sx && x < sx + size && y >= y0 && y < y0 + size) return [colour[0] + n, colour[1] + n, colour[2] + n];
    const tex = ((x >> 4) + (y >> 4)) & 1 ? 8 : 0;
    return [40 + tex + n, 42 + tex + n, 48 + tex + n];
  });
}
// Textured landscape with a soft grey haze drifting right and spreading.
function haze(k, { seed = 11, noise = 3 } = {}) {
  const rnd = rng(seed * 1000 + k), cx = 70 + 4 * k, cy = 110, sig = 34 + 0.6 * k;
  return makeFrame(W, H, (x, y) => {
    const n = (rnd() - 0.5) * 2 * noise, tile = ((x >> 4) + (y >> 4)) & 1;
    const bg = tile ? [92, 112, 78] : [124, 102, 80];
    const a = 0.85 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sig * sig));
    return [bg[0] * (1 - a) + 190 * a + n, bg[1] * (1 - a) + 190 * a + n, bg[2] * (1 - a) + 188 * a + n];
  });
}
const fireRegions = a => a.regions.filter(r => r.kind === 'fire');

// ---------------------------------------------------------------- 1. API
section('1. API, parameters, downscale');
for (const k of ['analyze', 'createDetector', 'scoreImage', 'downscale', 'features', 'params']) check(`ManaraFire.${k} is a function`, typeof F[k] === 'function');
const P = F.params({});
check('defaults at sensitivity 0.5 = papers\' values (tau 40, R_T 125, S_T 60)', P.tau === 40 && P.rT === 125 && P.sT === 60, `tau ${P.tau}, R_T ${P.rT}, S_T ${P.sT}`);
const P0 = F.params({ sensitivity: 0 }), P1 = F.params({ sensitivity: 1 });
check('R_T and S_T stay inside the published ranges (115–135, 55–65)', P0.rT === 135 && P1.rT === 115 && P0.sT === 65 && P1.sT === 55);
{
  const big = makeFrame(640, 480, (x, y) => (x + y) & 1 ? [255, 255, 255] : [0, 0, 0]);
  const small = F.downscale(big, 320), v = small.data[(100 * 320 + 100) * 4];
  check('downscale 640×480 → 320×240 box-averages 2×2 checkers to grey', small.width === 320 && small.height === 240 && v >= 126 && v <= 129, `value ${v}`);
  check('downscale returns the same frame when it is already small', F.downscale(small, 320) === small);
}

// ---------------------------------------------------------------- 2. single frames
section('2. Single frames');
{
  const fr = flame(0), a = F.analyze(fr), reg = fireRegions(a);
  check('analyze returns masks of width×height', a.fireMask.length === W * H && a.smokeMask.length === W * H);
  check('flame-like blob → fire pixels', a.fireRatio > 0.01, `fireRatio ${fmt(a.fireRatio)}`);
  check('flame-like blob → a fire region around it', reg.length >= 1 && reg[0].x <= W / 2 && reg[0].x + reg[0].w >= W / 2 && reg[0].y <= H * 0.62 && reg[0].y + reg[0].h >= H * 0.62, reg[0] ? `${reg[0].x},${reg[0].y} ${reg[0].w}×${reg[0].h}` : 'none');
  check('regions sorted by area and inside the frame', a.regions.every((r, i, arr) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && (i === 0 || arr[i - 1].kind !== r.kind || arr[i - 1].area >= r.area)));
  check('flame core counted (stats.brightFire > 0)', a.stats.brightFire > 0, `brightFire ${a.stats.brightFire}`);
  check('stats has frame means', ['meanY', 'meanCb', 'meanCr'].every(k => Number.isFinite(a.stats[k])));
  const s = F.scoreImage(fr);
  check('scoreImage(flame-like blob) → fire', s.label === 'fire', `fire ${s.fire}, smoke ${s.smoke}`);
  check('analyze().score in 0..1 and high for the blob', a.score > 0.5 && a.score <= 1, `score ${a.score}`);
}
for (const [name, col] of [['pure blue', [30, 80, 200]], ['mid grey', [128, 128, 128]], ['black', [0, 0, 0]], ['white', [255, 255, 255]]]) {
  const fr = makeFrame(W, H, () => col), a = F.analyze(fr), s = F.scoreImage(fr);
  check(`${name} frame → no fire pixels, label none`, a.fireRatio === 0 && fireRegions(a).length === 0 && s.label === 'none', `label ${s.label}`);
}
{
  // every colour of a 32-level RGB cube next to a dark band (so frame means are realistic)
  const fr = makeFrame(256, 160, (x, y) => y >= 128 ? [20, 20, 25] : [(x & 31) * 8 + 4, ((x >> 5) * 16 + (y >> 3)) * 2 + 2, (y & 7) * 32 + 8]);
  const counts = [0, 0.25, 0.5, 0.75, 1].map(s => F.analyze(fr, { sensitivity: s }).stats.fireCount);
  check('sensitivity is monotonic (more sensitive → never fewer fire pixels)', counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts[4] > counts[0], counts.join(' ≤ '));
  const flameCounts = [0, 0.5, 1].map(s => F.analyze(flame(0), { sensitivity: s }).stats.fireCount);
  check('sensitivity is monotonic on the flame blob too', flameCounts[0] <= flameCounts[1] && flameCounts[1] <= flameCounts[2], flameCounts.join(' ≤ '));
}

// ---------------------------------------------------------------- 3. temporal detector
section('3. Temporal detector');
const runDetector = (frames, opts = {}) => {
  const det = F.createDetector(opts), out = [];
  frames.forEach((fr, i) => out.push(det.push(fr, i * 100)));           // 10 frames per second
  return { det, out };
};
const states = out => out.map(r => ({ clear: '.', suspect: 's', fire: 'F', smoke: 'm' })[r.state]).join(''); // . s F m
for (const [name, col] of [['static orange-red square', [230, 95, 40]], ['static pure red square', [215, 30, 30]], ['static yellow-orange square', [250, 180, 50]]]) {
  const { out } = runDetector(Array.from({ length: 20 }, (_, k) => square(k, col)));
  check(`${name} over 20 frames never reaches 'fire'`, out.every(r => r.state !== 'fire'), `states ${states(out)}, max flicker ${fmt(Math.max(...out.map(r => r.flicker)))}`);
}
{
  const { out } = runDetector(Array.from({ length: 20 }, (_, k) => square(k, [230, 95, 40])));
  check('static fire-coloured object is reported as suspect with reason "static"', out[19].state === 'suspect' && out[19].reasons.includes('static'), `${out[19].state} [${out[19].reasons}]`);
  const moving = runDetector(Array.from({ length: 20 }, (_, k) => square(k, [230, 95, 40], { x0: 40, vx: 6 }))).out;
  check('fire-coloured object sliding across the frame never reaches \'fire\'', moving.every(r => r.state !== 'fire'), `states ${states(moving)}, max flicker ${fmt(Math.max(...moving.map(r => r.flicker)))}`);
}
{
  const confirm = 8;
  const frames = Array.from({ length: 20 }, (_, k) => flame(k)).concat(Array.from({ length: 16 }, (_, k) => square(k, [40, 42, 48], { size: 0 })));
  const { out, det } = runDetector(frames, { confirmFrames: confirm });
  const firstFire = out.findIndex(r => r.state === 'fire');
  check(`flickering flame reaches 'fire' within confirmFrames + 2 (= ${confirm + 2} frames)`, firstFire >= 0 && firstFire + 1 <= confirm + 2, `first 'fire' at frame ${firstFire + 1}, states ${states(out.slice(0, 20))}`);
  const r = out[19];
  check('fire result: flicker, confidence, alertMs, firstSuspectMs', r.flicker >= 0.2 && r.confidence >= 0.6 && r.alertMs != null && r.firstSuspectMs != null && r.firstSuspectMs <= r.alertMs,
    `flicker ${r.flicker}, confidence ${r.confidence}, firstSuspect ${r.firstSuspectMs} ms, alert ${r.alertMs} ms, reasons [${r.reasons}]`);
  const after = out.slice(20), clearAt = after.findIndex(x => x.state === 'clear');
  check('hysteresis: stays \'fire\' for a few empty frames, then clears', after.slice(0, 5).every(x => x.state === 'fire') && clearAt >= 0 && clearAt <= 12, `states after the flame ${states(after)}`);
  check('clear resets firstSuspectMs / alertMs', clearAt >= 0 && after[clearAt].firstSuspectMs === null && after[clearAt].alertMs === null);
  det.reset();
  check('reset() starts a fresh episode', det.push(square(0, [40, 42, 48], { size: 0 }), 0).state === 'clear');
}
{
  const { out } = runDetector(Array.from({ length: 40 }, (_, k) => haze(k)));
  const firstSmoke = out.findIndex(r => r.state === 'smoke');
  check('drifting grey haze over a textured scene → \'smoke\' eventually', firstSmoke >= 0, `first 'smoke' at frame ${firstSmoke + 1}, states ${states(out)}`);
  check('drifting haze never reaches \'fire\'', out.every(r => r.state !== 'fire'));
  check('smoke result carries temporally confirmed smoke regions', firstSmoke >= 0 && out[firstSmoke].frame.regions.some(r => r.kind === 'smoke'));
  const wall = runDetector(Array.from({ length: 30 }, (_, k) => square(k, [150, 150, 152], { x0: 0, y0: 0, size: 400, noise: 4 }))).out;
  check('static grey wall (with sensor noise) never becomes \'smoke\'', wall.every(r => r.state !== 'smoke'), `states ${states(wall)}`);
}

// ---------------------------------------------------------------- 4. real photos
section('4. Real photos — scoreImage (single image, no temporal cues)');
function decode(which) {
  const buf = execFileSync('python3', [path.join(HERE, 'samples.py'), 'rgba', which], { maxBuffer: 128 << 20 });
  const imgs = {}; let off = 0;
  while (off < buf.length) {
    const nl = buf.indexOf(10, off), [file, w, h] = buf.subarray(off, nl).toString().split(' ');
    off = nl + 1; const len = w * h * 4;
    imgs[file] = { data: new Uint8ClampedArray(buf.subarray(off, off + len)), width: +w, height: +h }; off += len;
  }
  return imgs;
}
const LABELS = ['fire', 'smoke', 'none'];
function evaluate(title, items, imgs) {
  const cm = Object.fromEntries(LABELS.map(t => [t, Object.fromEntries(LABELS.map(p => [p, 0]))]));
  let ok = 0, trickyOk = 0, trickyN = 0;
  console.log(`\n  ${title}`);
  console.log('  file            truth  predicted  fire   smoke  tricky');
  for (const it of items) {
    const img = imgs[it.file];
    if (!img) { check(`decoded ${it.file}`, false); continue; }
    const r = F.scoreImage(img);
    cm[it.label][r.label]++;
    const good = r.label === it.label; ok += good;
    if (it.tricky) { trickyN++; trickyOk += good; }
    console.log(`  ${it.file.padEnd(15)} ${it.label.padEnd(6)} ${r.label.padEnd(10)} ${fmt(r.fire, 2).padStart(4)}   ${fmt(r.smoke, 2).padStart(4)}   ${it.tricky ? 'yes' : '   '}  ${good ? 'ok' : 'MISS'}`);
  }
  console.log('\n  confusion matrix (rows = truth, columns = predicted)');
  console.log('              ' + LABELS.map(l => l.padStart(7)).join(''));
  for (const t of LABELS) console.log('  ' + t.padEnd(12) + LABELS.map(p => String(cm[t][p]).padStart(7)).join(''));
  const acc = ok / items.length;
  const fireTP = cm.fire.fire, fireFN = cm.fire.smoke + cm.fire.none, fireFP = cm.smoke.fire + cm.none.fire;
  console.log(`  accuracy ${ok}/${items.length} = ${(acc * 100).toFixed(1)} %   tricky cases ${trickyOk}/${trickyN}   fire recall ${fireTP}/${fireTP + fireFN}   false fire alarms ${fireFP}/${items.length - fireTP - fireFN}`);
  return { acc, cm };
}
let dev = null, tune = null, test = null;
try {
  const sctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(SITE, 'assets/samples/samples.js'), 'utf8'), sctx);
  const samples = sctx.window.MANARA_SAMPLES;
  const devImgs = decode('samples');
  check('samples.js lists 12–16 images and samples-data.js has pixels for each', samples.length >= 12 && samples.length <= 16 && samples.every(s => devImgs[s.file]), `${samples.length} images`);
  dev = evaluate(`Sample set (${samples.length} site images; thresholds were hand-tuned on these → optimistic)`, samples, devImgs);
  const photos = JSON.parse(fs.readFileSync(path.join(HERE, 'photos/labels.json'), 'utf8')).images;
  const photoImgs = decode('photos');
  const tuning = photos.filter(p => p.set === 'tuning'), testSet = photos.filter(p => p.set === 'test');
  tune = evaluate(`Tuning set (${tuning.length} extra photos; seen during the second tuning round → optimistic)`, tuning, photoImgs);
  test = evaluate(`Test set (${testSet.length} photos never used to change the engine → the honest estimate)`, testSet, photoImgs);
  check('sample-set accuracy ≥ 75 % (regression guard)', dev.acc >= 0.75, `${(dev.acc * 100).toFixed(1)} %`);
  check('tuning-set accuracy ≥ 65 % (regression guard)', tune.acc >= 0.65, `${(tune.acc * 100).toFixed(1)} %`);
  check('test-set accuracy ≥ 50 % (sanity: better than always answering "none")', test.acc >= 0.5, `${(test.acc * 100).toFixed(1)} %`);
} catch (e) {
  check('decode photos with python3 + Pillow (tools/manara/samples.py)', false, String(e.message || e).split('\n')[0]);
}

// ---------------------------------------------------------------- 5. timing
section('5. Timing (Node ' + process.version + ')');
function time(fn, reps) { for (let i = 0; i < 20; i++) fn(); const t0 = performance.now(); for (let i = 0; i < reps; i++) fn(); return (performance.now() - t0) / reps; }
{
  const busy = flame(3);                                                 // fire + background, 320×240
  const tA = time(() => F.analyze(busy), 200);
  check('analyze() on 320×240 < 8 ms', tA < 8, `${tA.toFixed(2)} ms per frame`);
  const det = F.createDetector(); let k = 0;
  const frames = Array.from({ length: 10 }, (_, i) => flame(i));
  const tD = time(() => det.push(frames[k % 10], (k++) * 100), 200);
  console.log(`  info detector.push() on 320×240: ${tD.toFixed(2)} ms per frame`);
  const tS = time(() => F.scoreImage(busy), 100);
  console.log(`  info scoreImage() on 320×240: ${tS.toFixed(2)} ms`);
  const hd = makeFrame(1280, 720, (x, y) => [(x * 7) & 255, (y * 5) & 255, (x + y) & 255]);
  const tH = time(() => F.downscale(hd, 320), 20);
  console.log(`  info downscale() 1280×720 → 320×180: ${tH.toFixed(2)} ms`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (dev && tune && test) console.log(`scoreImage accuracy: sample set ${(dev.acc * 100).toFixed(1)} % and tuning set ${(tune.acc * 100).toFixed(1)} % (both tuned on), test set ${(test.acc * 100).toFixed(1)} % (honest)`);
if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
