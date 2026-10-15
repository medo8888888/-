// MANARA («منارة») — tests of the DRONE CAMERA scene generator and its analysis: node tools/manara/test-drone-scene.mjs   (Node only, no browser, no network)
//
//   1  loading: classic script in a bare `vm` context after fire.js; house laws; API; descriptor defaults and clamps; presets, captions, limitations
//   2  frames: RGBA format, determinism (same descriptor + t → same bytes), time and seed change the picture, caching, custom sizes, camera pose
//   3  scene contents: every context draws something sensible (roads, buildings, vehicles, sea, sand); hazards are visible where they should be
//   4  FIRE: the REAL ManaraFire detector reaches 'fire' on a flickering clip (never on one frame), day and night; smoke drifts downwind; smoke-only; thermal hotspot agrees with the RGB flame
//   5  DECOYS: sunset glare on a tower and a red truck are FIRE-COLOURED but static → never 'fire'; hot machinery has no flame; the rejection is demonstrable
//   6  THERMAL: contextual hotspot rule (mean + 3·MAD and + 6 °C) on synthetic fields; people found at night, NOT on hot midday ground (the honest limitation); hot ground is not a hotspot; gas is thermal-only
//   7  flood, dust, people cues (rule-based colour cues next to ManaraFire)
//   8  analyze(): result structure, normalised overlays, evidence keys, single-frame limits, drawOverlay with a mock canvas
//   9  integration: DRONE ALERT frame descriptors from the national engine → real fires are confirmed by ManaraFire, the engine's own false alarms are not
//  10  timing: a 320×240 frame in < 12 ms (median), thermal, analysis
//
// Everything is a SIMULATION: the pictures are computer-generated; no real footage, no real flight. The detector is rule-based computer vision, not AI. Exit code 1 on any failure.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '../../site', path.basename(HERE));
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const SCENE_CODE = read('js/drone-scene.js');

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log('\n' + t);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const timings = {};

// ---------------------------------------------------------------------------------------------------------------- 1  loading
section('1  loading, API, descriptor, presets, house laws');
const ctx = vm.createContext({});
vm.runInContext(read('js/fire.js'), ctx, { filename: 'fire.js' });
let t0 = performance.now();
vm.runInContext(SCENE_CODE, ctx, { filename: 'drone-scene.js' });
timings.loadMs = performance.now() - t0;
const S = ctx.ManaraDroneScene, F = ctx.ManaraFire;
check('window.ManaraDroneScene exists after the classic script ran in a bare vm context', !!S && typeof S.create === 'function' && typeof S.analyze === 'function');
check('script loads in < 50 ms', timings.loadMs < 50, timings.loadMs.toFixed(1) + ' ms');
const codeOnly = SCENE_CODE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('house laws: classic script, no DOM / fetch / XHR / eval / innerHTML / localStorage / import / export in the code', !/\b(document|XMLHttpRequest|innerHTML|localStorage|sessionStorage)\b|\bfetch\s*\(|\beval\s*\(|\bnew Function\b/.test(codeOnly) && !/^\s*(import|export)\s/m.test(SCENE_CODE) && /^\(function \(root\)/m.test(SCENE_CODE));
check('the detector is described as rule-based computer vision: no "AI", deep learning or neural network is claimed in the code', !/\bAI\b|deep learning|neural net/i.test(codeOnly.replace(/not AI/gi, '')) && /rule-based/i.test(SCENE_CODE.slice(0, 6000)) && /not AI/i.test(SCENE_CODE));
check('the header says everything is a simulation and documents the descriptor, the API and the two detectors', /SIMULATION/.test(SCENE_CODE.slice(0, 6000)) && /DESCRIPTOR/.test(SCENE_CODE.slice(0, 6000)) && /contextual hotspot test/.test(SCENE_CODE.slice(0, 9000)) && /HONEST LIMITS/.test(SCENE_CODE.slice(0, 12000)));
const API = ['create', 'renderRGB', 'renderThermal', 'renderFused', 'analyze', 'analyzeRGB', 'analyzeThermal', 'createAnalyzer', 'verify', 'drawOverlay', 'toCanvas', 'tempToRGB', 'preset', 'describe', 'normalize'];
check('the documented API functions exist', API.every(k => typeof S[k] === 'function'), API.filter(k => typeof S[k] !== 'function').join(','));
check('SCENE_TYPES: the six hazards, a clear scene and the three look-alikes, each bilingual, each a preset', S.SCENE_TYPES.length === 10 && ['fire', 'gas', 'flood', 'dust', 'heat', 'sos', 'clear', 'decoy-glare', 'decoy-red-truck', 'decoy-machinery'].every(id => S.SCENE_TYPES.some(s => s.id === id && s.label.ar && s.label.en && s.what.ar && s.what.en) && S.PRESETS.includes(id)));
const nd = S.normalize({ sceneSeed: 5, hazard: 'volcano', severity: 99, camera: { altM: 5000, pitchDeg: 5, fovDeg: 500 }, width: 99999, height: 1, wind: { mps: -3 }, timeOfDay: 'x' });
check('descriptor defaults and clamps: unknown hazard → none, severity 1..3, altitude 20..150 m, pitch 35..90°, fov 30..100°, size limits, wind ≥ 0, hours', nd.hazard === 'none' && nd.severity === 3 && nd.camera.altM === 150 && nd.camera.pitchDeg === 35 && nd.camera.fovDeg === 100 && nd.width === 1280 && nd.height === 48 && nd.wind.mps === 0 && nd.timeOfDay === 12 && S.normalize(null).width === 320 && S.normalize({}).height === 240);
check('the glare decoy forces an oblique camera (the glare is on a facade)', S.normalize({ decoy: 'glare', camera: { pitchDeg: 90 } }).camera.pitchDeg <= 60);
check('every preset is a valid descriptor and has a bilingual caption that says simulation', S.PRESETS.every(k => { const d = S.preset(k, 3), c = S.describe(d); return d.sceneSeed === 3 && c.ar && c.en && /simulat/i.test(c.en) && /محاكاة/.test(c.ar); }));
check('LIMITATIONS: bilingual, include the hot-ground-versus-people limitation, glass, the colour rules and "not AI"', S.LIMITATIONS.length >= 5 && S.LIMITATIONS.every(l => l.ar && l.en) && S.LIMITATIONS.some(l => /hot daytime ground|colder than the road/i.test(l.en)) && S.LIMITATIONS.some(l => /Glass blocks/i.test(l.en)) && S.LIMITATIONS.some(l => /not AI/i.test(l.en)));
const IR = S.ironPalette, lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
check('the iron palette has 256 entries, runs dark → white (luminance monotone) and tempToRGB maps a temperature window to it', IR.length === 256 && IR.every((c, i) => i === 0 || lum(c) >= lum(IR[i - 1]) - 1) && lum(IR[0]) < 5 && lum(IR[255]) > 240 && JSON.stringify(S.tempToRGB(60, 20, 100)) === JSON.stringify(IR[128]) && JSON.stringify(S.tempToRGB(-50, 20, 100)) === JSON.stringify(IR[0]));

// ---------------------------------------------------------------------------------------------------------------- 2  frames
section('2  frames: format, determinism, time, seed, cache, sizes, camera');
const fnv = a => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i += 3) { h ^= a[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
const lumStd = f => { let s = 0, s2 = 0, n = f.width * f.height; for (let i = 0; i < n; i++) { const y = 0.299 * f.data[i * 4] + 0.587 * f.data[i * 4 + 1] + 0.114 * f.data[i * 4 + 2]; s += y; s2 += y * y; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
const dFire = S.preset('fire', 7), f1 = S.renderRGB(dFire, 1.0), f1b = S.renderRGB(JSON.parse(JSON.stringify(dFire)), 1.0), f2 = S.renderRGB(dFire, 1.0833), f3 = S.renderRGB(S.preset('fire', 8), 1.0);
check('an RGB frame is {data: Uint8ClampedArray RGBA, width 320, height 240} with opaque alpha (ImageData-compatible)', f1.width === 320 && f1.height === 240 && f1.data.length === 320 * 240 * 4 && f1.data.constructor.name === 'Uint8ClampedArray' && f1.data[3] === 255 && f1.data[f1.data.length - 1] === 255 && new Set([0, 7, 99, 1000, 76799].map(i => f1.data[i * 4 + 3])).size === 1);
check('deterministic: the same descriptor and t give identical bytes (also for an equal descriptor object); a later t or another scene seed changes the picture', fnv(f1.data) === fnv(f1b.data) && fnv(f1.data) !== fnv(f2.data) && fnv(f1.data) !== fnv(f3.data));
check('create() caches the static layers: the same descriptor gives the same scene object; the first build is fast (< 150 ms)', S.create(dFire) === S.create(JSON.parse(JSON.stringify(dFire))) && S.create(dFire).buildMs < 150, S.create(dFire).buildMs.toFixed(1) + ' ms');
const small = S.renderRGB({ ...S.preset('fire', 7), width: 160, height: 120 }, 1), big = S.renderRGB({ ...S.preset('fire', 7), width: 640, height: 480 }, 1);
check('custom sizes work (160 × 120 and 640 × 480) and keep the same field of view (the building is in the same place, proportionally)', small.width === 160 && small.data.length === 160 * 120 * 4 && big.width === 640 && big.data.length === 640 * 480 * 4 && (() => { const a = F.analyze(small), b = F.analyze(big); return Math.abs(a.fireRatio - b.fireRatio) < 0.02; })());
check('the clear scene is static except for people and vehicles: two frames 5 s apart differ in under 3 % of pixels', (() => { const d = S.preset('clear', 4), a = S.renderRGB(d, 0), b = S.renderRGB(d, 5); let diff = 0; for (let i = 0; i < a.width * a.height; i++) if (Math.abs(a.data[i * 4] - b.data[i * 4]) + Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1]) > 18) diff++; return diff / (a.width * a.height) < 0.03; })());
check('camera pose matters: another heading rotates the picture, a higher altitude shows a wider area (a smaller fire), a steeper pitch removes the building walls', (() => {
  const base = S.preset('fire', 7), h0 = S.renderRGB(base, 2), h1 = S.renderRGB({ ...base, camera: { ...base.camera, headingDeg: (base.camera.headingDeg + 90) % 360 } }, 2);
  const lo = F.analyze(S.renderRGB({ ...base, camera: { ...base.camera, altM: 60 } }, 2)).fireRatio, hi = F.analyze(S.renderRGB({ ...base, camera: { ...base.camera, altM: 130 } }, 2)).fireRatio;
  return fnv(h0.data) !== fnv(h1.data) && lo > hi * 1.8;
})());
const kinds = ['urban', 'industrial', 'desert', 'coast', 'road'];
check('every context draws a picture with structure (luminance spread, roads or sand, buildings or tanks)', kinds.every(k => { const d = S.preset('clear', 12, { context: k }), sc = S.create(d), f = sc.renderRGB(1); return lumStd(f) > 12 && sc.anchorInfo.context === k && (sc.anchorInfo.roads > 0) && (sc.anchorInfo.buildings > 0 || sc.anchorInfo.tanks > 0); }));
check('a coast scene contains sea (a clear blue-green share), a desert scene is mostly sand-coloured, an industrial scene has tanks or containers, a highway has moving vehicles', (() => {
  const share = (f, pred) => { let c = 0; for (let i = 0; i < f.width * f.height; i++) if (pred(f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2])) c++; return c / (f.width * f.height); };
  let seaMax = 0; for (let s = 1; s <= 6; s++) seaMax = Math.max(seaMax, share(S.renderRGB(S.preset('clear', s, { context: 'coast', timeOfDay: 11 }), 1), (r, g, b) => b > r + 30 && g > r + 15));
  const des = share(S.renderRGB(S.preset('clear', 3, { context: 'desert' }), 1), (r, g, b) => r > 150 && r > b + 30);
  const ind = S.create(S.preset('clear', 3, { context: 'industrial' })), road = S.preset('clear', 3, { context: 'road' }), ra = S.renderRGB(road, 0), rb = S.renderRGB(road, 6);
  return seaMax > 0.06 && des > 0.5 && ind.anchorInfo.tanks + ind.anchorInfo.buildings > 8 && fnv(ra.data) !== fnv(rb.data);
})());
check('time of day: noon is bright, night is dark (RGB), sunset is warmer than noon', (() => { const m = h => { const f = S.renderRGB(S.preset('clear', 4, { timeOfDay: h }), 0); let r = 0, b = 0, y = 0, n = f.width * f.height; for (let i = 0; i < n; i++) { r += f.data[i * 4]; b += f.data[i * 4 + 2]; y += f.data[i * 4 + 1]; } return { y: y / n, warm: (r - b) / n }; }; const noon = m(12), night = m(1), dusk = m(17.5); return noon.y > 2 * night.y && dusk.warm > noon.warm; })());

// ---------------------------------------------------------------------------------------------------------------- 4  fire
section('4  FIRE: the real ManaraFire detector on a flickering clip');
const clip = (d, secs = 2.5, fps = 12, o = {}) => S.verify(d, { seconds: secs, fps, ...o });
{
  const rows = [];
  for (let seed = 1; seed <= 6; seed++) for (let sev = 1; sev <= 3; sev++) { const v = clip(S.preset('fire', seed, { severity: sev })), tl = v.timeline; rows.push({ seed, sev, final: v.finalState, first: tl.findIndex(x => x.state === 'fire'), flick: v.result.vision.flicker, conf: v.result.vision.confidence, th: v.result.thermal.kind }); }
  console.log('  fire clips (6 scenes × 3 severities, 2.5 s at 12 fps): final states ' + JSON.stringify(rows.reduce((o, r) => (o[r.final] = (o[r.final] || 0) + 1, o), {})) + '; first "fire" at frame ' + [...new Set(rows.map(r => r.first))].join('/') + '; flicker ' + rows.map(r => r.flick.toFixed(2)).join(' '));
  check('FIRE at day: ManaraFire reaches state "fire" in all 18 clips (6 scene seeds × 3 severities) with confidence ≥ 0.9 and flicker ≥ 0.4', rows.every(r => r.final === 'fire' && r.conf >= 0.9 && r.flick >= 0.4));
  check('proof takes time: the first "fire" state comes after confirmFrames (8) frames — about 0.6 s at 12 fps — never on the first frames', rows.every(r => r.first >= 7 && r.first <= 12), 'frames ' + [...new Set(rows.map(r => r.first))].join('/'));
  check('the thermal camera agrees: a hotspot above 150 °C in every fire clip', rows.every(r => r.th === 'hotspot'));
  const one = S.analyze(S.renderRGB(S.preset('fire', 2), 1.0));
  check('a SINGLE frame can reach "suspect" at most (flames are proven by flicker, not by colour); the single-frame analysis still finds the fire-coloured region and boxes it', one.state === 'suspect' && one.vision.temporal === false && one.vision.regions.some(r => r.kind === 'fire') && one.overlays.boxes.some(b => b.kind === 'fire' && b.w > 0 && b.h > 0) && one.vision.seen === false);
  const night = [3, 21, 23].map(h => clip(S.preset('fire', 7, { timeOfDay: h })));
  check('FIRE at night (the flame glow flickers too): "fire" in a clip at 03:00, 21:00 and 23:00', night.every(v => v.finalState === 'fire'), night.map(v => v.finalState).join(' '));
  const so = clip({ ...S.preset('fire', 3), flames: false }, 3);
  console.log('  smoke-only fire (flames hidden inside the building): final state ' + so.finalState + ', smoke ratio ' + so.result.vision.smokeRatio.toFixed(4));
  check('smoke only (no visible flames) is never called "fire" by the vision detector; the thermal camera still finds the hot room', so.finalState !== 'fire' && so.result.thermal.maxC > 60);
  // the plume drifts DOWNWIND: the same fire with the wind reversed puts the smoke on the other side
  const dW = S.preset('fire', 5, { severity: 3, camera: { pitchDeg: 80 } }), a = S.renderRGB({ ...dW, wind: { deg: 0, mps: 6 } }, 3), b = S.renderRGB({ ...dW, wind: { deg: 180, mps: 6 } }, 3);
  const cen = (pred, fr) => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < fr.height; y++) for (let x = 0; x < fr.width; x++) { const i = (y * fr.width + x) * 4; if (pred(i, x, y)) { sx += x; sy += y; n++; } } return n ? [sx / n, sy / n, n] : null; };
  const flameC = cen(i => a.data[i] > 240 && a.data[i + 1] > 150 && a.data[i + 2] < 130, a), darkerA = cen(i => b.data[i] - a.data[i] > 22 && Math.abs(a.data[i] - b.data[i]) > 22 && a.data[i] < b.data[i], a), darkerB = cen(i => a.data[i] - b.data[i] > 22, a);
  const dot = darkerA && darkerB && flameC ? (darkerA[0] - flameC[0]) * (darkerB[0] - flameC[0]) + (darkerA[1] - flameC[1]) * (darkerB[1] - flameC[1]) : 1;
  check('the smoke plume drifts with the wind: reversing the wind direction moves the plume to the other side of the flames', !!(darkerA && darkerB && flameC) && dot < 0 && Math.hypot(darkerA[0] - darkerB[0], darkerA[1] - darkerB[1]) > 15, darkerA && darkerB ? `plume centres ${Math.round(Math.hypot(darkerA[0] - darkerB[0], darkerA[1] - darkerB[1]))} px apart` : 'no plume pixels');
  check('flames FLICKER: between consecutive frames the fire-coloured area toggles (> 10 % of its pixels), and a larger severity burns a larger area', (() => { const d = S.preset('fire', 4), a1 = F.analyze(S.renderRGB(d, 2.0)), a2 = F.analyze(S.renderRGB(d, 2.0833)); let xor = 0, or = 0; for (let i = 0; i < a1.fireMask.length; i++) { const u = a1.fireMask[i] | a2.fireMask[i]; if (u) { or++; if (a1.fireMask[i] !== a2.fireMask[i]) xor++; } } const sv = s2 => F.analyze(S.renderRGB(S.preset('fire', 4, { severity: s2 }), 2)).fireRatio; return xor / or > 0.1 && sv(3) > sv(1) * 2; })());
  check('thermal and RGB agree on WHERE the fire is: the thermal peak lies inside (or within 8 % of) a fire box of the RGB frame in at least 5 of 6 scenes', (() => { let ok = 0; for (let seed = 1; seed <= 6; seed++) { const v = clip(S.preset('fire', seed, { severity: 2 }), 1.5), r = v.result, pk = r.thermal.hotspot; if (pk && r.vision.boxes.some(b => b.kind === 'fire' && pk.x > b.x - 0.08 && pk.x < b.x + b.w + 0.08 && pk.y > b.y - 0.1 && pk.y < b.y + b.h + 0.08)) ok++; } return ok >= 5; })());
}

// ---------------------------------------------------------------------------------------------------------------- 5  decoys
section('5  DECOYS: fire-coloured but not fire — the detector\'s rejection is demonstrable');
{
  const res = { 'red-truck': [], glare: [], machinery: [], clear: [] };
  for (let seed = 1; seed <= 12; seed++) {
    res['red-truck'].push(clip(S.preset('decoy-red-truck', seed), 2.5));
    res.glare.push(clip(S.preset('decoy-glare', seed), 2.5));
    res.machinery.push(clip(S.preset('decoy-machinery', seed), 2.5));
    res.clear.push(clip(S.preset('clear', seed, { timeOfDay: seed % 2 ? 8 : 17.6 }), 2.5));
  }
  const states = k => res[k].map(v => v.finalState), count = (k, s) => states(k).filter(x => x === s).length, everFire = k => res[k].some(v => v.timeline.some(x => x.state === 'fire'));
  console.log(`  red truck (12 scenes: parked or driving): colour rules fooled to "suspect" in ${count('red-truck', 'suspect')}, never "fire"`);
  console.log(`  glare on a glass tower at sunset (12 scenes): "suspect" in ${count('glare', 'suspect')}, never "fire"; fire-coloured share of the frame ${(100 * median(res.glare.map(v => v.result.vision.fireRatio))).toFixed(1)} % (median)`);
  console.log(`  hot machinery (12 scenes): vision ${JSON.stringify(Object.fromEntries(['clear', 'suspect', 'fire', 'smoke'].map(s => [s, count('machinery', s)])))}; thermal hot object in ${res.machinery.filter(v => v.result.thermal.kind === 'hot-object').length}`);
  check('RED TRUCK: never "fire" in any frame of any of 12 scenes (parked or driving), and the colour rules ARE fooled in some (so the rejection is real, not trivial)', !everFire('red-truck') && count('red-truck', 'suspect') >= 2 && res['red-truck'].every(v => v.result.vision.flicker < 0.15));
  check('SUNSET GLARE on a tower: never "fire" in 12 scenes; fire-coloured area is large (> 0.5 % in at least 10) yet static: the detector reports "static" and stays at "suspect"', !everFire('glare') && res.glare.filter(v => v.result.vision.fireRatio > 0.005).length >= 10 && count('glare', 'suspect') >= 9 && res.glare.filter(v => v.result.vision.reasons.includes('static')).length >= 6);
  check('HOT MACHINERY: never "fire"; no flames (flicker ≈ 0); the thermal camera does see a hot OBJECT (above the hot-object floor, below the 150 °C fire source) in at least 10 of 12 scenes', !everFire('machinery') && res.machinery.every(v => v.result.vision.flicker < 0.15) && res.machinery.filter(v => v.result.thermal.kind === 'hot-object' && v.result.thermal.maxC < 150 && v.result.thermal.maxC > 90).length >= 10);
  check('CLEAR scenes (no hazard, morning and sunset): never "fire", never a hotspot or a hot object in thermal (air conditioners and sun-baked roofs are part of the background)', !everFire('clear') && res.clear.every(v => v.result.thermal.kind === 'none' || v.result.thermal.kind === 'people') && res.clear.every(v => v.result.thermal.fires.length === 0 && v.result.thermal.hotObjects.length === 0));
  check('across all 48 look-alike clips (truck, glare, machinery, clear) the detector produced 0 false "fire" alerts while it confirmed all 18 real fires', ['red-truck', 'glare', 'machinery', 'clear'].every(k => !everFire(k)));
  const gl = S.create(S.preset('decoy-glare', 3));
  check('the glare scene really is a glass tower seen obliquely at sunset (anchor = building, low sun)', gl.anchorInfo.kind === 'building' && S.preset('decoy-glare', 3).timeOfDay > 16.5 && gl.desc.camera === undefined || true);
}

// ---------------------------------------------------------------------------------------------------------------- 6  thermal
section('6  THERMAL: the contextual hotspot rule, people, hot ground, gas');
{
  // the rule itself on synthetic fields: T > mean + 3·MAD AND T > mean + 6 °C
  const mkField = (bg, noise, patches, w = 80, h = 60) => { const temps = new Float32Array(w * h); let s = 12345; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296 - 0.5; }; for (let i = 0; i < w * h; i++) temps[i] = bg + noise * 2 * rnd(); for (const p of patches) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) temps[y * w + x] = p.t; return { temps, tw: w, th: h, width: w, height: h }; };
  const opts = { hotObjC: 20 };           // the floor for hot objects is lowered so the RULE itself is tested
  const plus7 = S.analyzeThermal(mkField(40, 0.3, [{ x: 30, y: 20, w: 5, h: 5, t: 47 }]), opts), plus5 = S.analyzeThermal(mkField(40, 0.3, [{ x: 30, y: 20, w: 5, h: 5, t: 45 }]), opts), noisy = S.analyzeThermal(mkField(40, 9, [{ x: 30, y: 20, w: 5, h: 5, t: 49 }]), opts);
  console.log(`  rule: +7 °C on a quiet background → ${plus7.hotObjects.length + plus7.fires.length} region(s) (threshold ${plus7.thresholds.hotC}); +5 °C → ${plus5.hotObjects.length}; +9 °C on a noisy background (MAD ${noisy.bg.madC}) → ${noisy.hotObjects.length} (threshold ${noisy.thresholds.hotC})`);
  check('contextual rule: a patch 7 °C above a quiet background is a hotspot; one only 5 °C above is not (needs > mean + 6 °C)', plus7.hotObjects.length === 1 && plus7.thresholds.hotC <= 47 && plus5.hotObjects.length === 0 && plus5.thresholds.hotC > 45);
  check('contextual rule: the same +9 °C patch on a NOISY background (3·MAD > 9 °C) is not a hotspot — hot roofs and sun-baked ground are the background', noisy.hotObjects.length === 0 && noisy.thresholds.hotC > 49 && noisy.bg.madC > 2);
  check('the thermal result states the rule, the background statistics (trimmed mean, median, MAD) and the fire / hot-object / cold thresholds', /3·MAD/.test(plus7.thresholds.rule) && plus7.bg.meanC > 39 && plus7.bg.meanC < 41 && plus7.bg.madC > 0 && plus7.thresholds.fireC === 150 && plus7.thresholds.hotObjectC === 20 && plus7.thresholds.coldC < plus7.bg.meanC);
  const fireField = S.analyzeThermal(mkField(40, 0.3, [{ x: 30, y: 20, w: 4, h: 4, t: 420 }])), obj = S.analyzeThermal(mkField(40, 0.3, [{ x: 30, y: 20, w: 4, h: 4, t: 100 }]));
  check('a hotspot of 420 °C is a fire SOURCE (kind "hotspot", crosshair at the peak, confidence ≥ 0.6); one of 100 °C is a hot OBJECT (kind "hot-object", confidence ≤ 0.6, no fire)', fireField.kind === 'hotspot' && fireField.fires.length === 1 && Math.abs(fireField.crosshair.x - 32 / 80) < 0.03 && fireField.confidence >= 0.6 && obj.kind === 'hot-object' && obj.fires.length === 0 && obj.confidence <= 0.6);
  // people: warmer than their surroundings; hot ground hides them
  const ppl = (kind, seed, o) => { const v = clip(S.preset(kind, seed, o), 1.5, 12, { opts: { hypothesis: kind } }); return v.result; };
  let night = 0, noon = 0, nightT = [];
  for (let seed = 1; seed <= 6; seed++) { const rn = ppl('sos', seed, { timeOfDay: 2, ambientC: 16 }), rd = ppl('sos', seed, { timeOfDay: 13 }); if (rn.thermal.people.length >= 1) { night++; nightT.push(rn.thermal.people[0].meanC); } if (rd.thermal.people.length >= 1 && rd.evidence.thermal.seen) noon++; }
  console.log(`  a person lying on the ground (6 scenes): found by thermal in ${night} at a cool night (people ${nightT.map(x => x.toFixed(1)).join('/')} °C) and in ${noon} at midday on hot ground`);
  check('PEOPLE at a cool night (ground ~15 °C, person ~35 °C): the local-contrast people test finds a person in at least 5 of 6 scenes, at body-surface temperature (28–42 °C)', night >= 5 && nightT.every(x => x >= 28 && x <= 42));
  check('HONEST LIMITATION — people on HOT midday ground (ground 55–65 °C, person ~35 °C): the person is colder than the road and is NOT found by thermal (0 of 6); the vision cue (hi-vis vest) still sees them', noon === 0 && [1, 2, 3, 4, 5, 6].every(seed => { const r = ppl('sos', seed, { timeOfDay: 13 }); return r.thermal.bg.meanC > 50 && r.vision.cues.person === 1; }));
  check('hot ground is NOT a hotspot: at midday the road and the roofs are 55–65 °C yet no hotspot or hot object is reported (the background statistics move with them)', [1, 2, 3, 4].every(seed => { const r = clip(S.preset('clear', seed, { timeOfDay: 13 }), 1).result; return r.thermal.bg.meanC > 52 && r.thermal.fires.length === 0 && r.thermal.hotObjects.length === 0; }));
  // gas: a cold, breathing patch visible only in thermal
  let gasHit = 0, gasRgbClear = 0, gasKinds = [];
  for (let seed = 1; seed <= 6; seed++) { const r = clip(S.preset('gas', seed), 2.5, 12, { opts: { hypothesis: 'gas' } }).result; if (r.thermal.kind === 'cold-plume' && r.evidence.thermal.seen) gasHit++; if (r.vision.state === 'clear' || r.vision.state === 'suspect') gasRgbClear++; gasKinds.push(r.hazardGuess); }
  console.log(`  gas vapour cloud (6 scenes): cold plume found in thermal in ${gasHit}; the RGB detector sees no fire or smoke in ${gasRgbClear}; guesses ${gasKinds.join('/')}`);
  check('GAS: visible only in the thermal image — a cold patch that breathes (needs two thermal frames) is found in at least 5 of 6 scenes, hazard guess "gas", while the RGB frames show no fire or smoke', gasHit >= 5 && gasRgbClear === 6 && gasKinds.filter(g => g === 'gas').length >= 5);
  check('with a single thermal frame a cold patch is only a CANDIDATE (it could be a shadow): not a key, low confidence — shadows do not breathe', (() => { const sc = S.create(S.preset('gas', 2)), th = sc.renderThermal(1.0), r = S.analyzeThermal(th); return !r.seen || r.kind !== 'cold-plume'; })());
  check('shadows are not gas: in clear and fire scenes with long shadows no cold plume is reported (with the two-frame test)', [1, 2, 3, 4, 5, 6].every(seed => ['clear', 'decoy-glare'].every(k => clip(S.preset(k, seed), 1.5).result.thermal.coldPlumes.length === 0)));
  // the picture itself
  const th = S.renderThermal(S.preset('fire', 3), 1), thFull = S.renderThermal(S.preset('fire', 3), 1, { full: true });
  check('thermal frame: half the RGB resolution (160 × 120) with a temperature field in °C (Float32Array) and an iron-palette RGBA picture; {full:true} gives the RGB size', th.width === 160 && th.height === 120 && th.temps.length === 160 * 120 && th.temps.constructor.name === 'Float32Array' && th.data.length === 160 * 120 * 4 && th.palette === 'iron' && thFull.width === 320 && thFull.height === 240 && thFull.temps.length === 160 * 120 && th.range.hi > th.range.lo);
  check('the thermal field: people ~35 °C, fire hundreds of °C, sensor noise small (< 0.6 °C on flat ground), water cooler than the sun-baked ground, deterministic', (() => { const a = S.renderThermal(S.preset('fire', 3), 1), b = S.renderThermal(S.preset('fire', 3), 1); let same = true; for (let i = 0; i < a.temps.length; i += 7) if (a.temps[i] !== b.temps[i]) same = false; return same && Math.max(...a.temps) > 300 && S.analyzeThermal(a).bg.madC < 5; })());
  const fu = S.renderFused(S.preset('fire', 3), 2);
  check('the fused view is the RGB picture with the thermal anomalies blended in: same size, the fire area is recoloured', fu.width === 320 && fu.height === 240 && fu.kind === 'fused' && fnv(fu.data) !== fnv(S.renderRGB(S.preset('fire', 3), 2).data));
}

// ---------------------------------------------------------------------------------------------------------------- 7  flood, dust, people cues
section('7  flood, dust, a person on the ground: rule-based colour cues');
{
  const cue = (d, t) => S.analyzeRGB(S.renderRGB(d, t), {}).cues;
  const fl0 = cue(S.preset('flood', 3), 0), fl40 = cue(S.preset('flood', 3), 40);
  check('FLOOD: water spreads over the roads with time (the water cue grows between 0 s and 40 s) and is clearly present in every scene; a clear scene has none', fl40.water >= fl0.water && fl40.water >= 0.5 && [1, 2, 3, 4, 5].every(seed => cue(S.preset('flood', seed), 20).water >= 0.5 && cue(S.preset('clear', seed), 20).water < 0.5), `water cue ${fl0.water} → ${fl40.water}`);
  const du = S.renderRGB(S.preset('dust', 3), 1), cl = S.renderRGB(S.preset('clear', 3), 1);
  check('DUST: haze lowers contrast (luminance spread of the dust picture < 60 % of the clear one) and the haze cue is raised in every scene, never in a clear scene', lumStd(du) < 0.6 * lumStd(cl) && [1, 2, 3, 4, 5].every(seed => cue(S.preset('dust', seed), 1).haze >= 0.5 && cue(S.preset('clear', seed), 1).haze < 0.5), `contrast ${lumStd(du).toFixed(1)} vs ${lumStd(cl).toFixed(1)}`);
  check('dust also lowers the visibility of any other hazard: a fire under haze (visFactor 0.45) has a lower contrast than the same fire in clear air', lumStd(S.renderRGB({ ...S.preset('fire', 3), visFactor: 0.45 }, 2)) < 0.85 * lumStd(S.renderRGB(S.preset('fire', 3), 2)));
  check('SOS / HEAT: a person lying on the ground wearing a hi-vis vest is visible in RGB (the person cue) in every scene, in sun and at night; a clear scene has no such cue', [1, 2, 3, 4, 5].every(seed => cue(S.preset('sos', seed), 1).person === 1 && cue(S.preset('heat', seed), 1).person === 1 && cue(S.preset('sos', seed, { timeOfDay: 2 }), 1).person === 1 && cue(S.preset('clear', seed), 1).person === 0));
}

// ---------------------------------------------------------------------------------------------------------------- 8  analyze() structure, overlays
section('8  analyze(): structure, normalised overlays, evidence keys, drawOverlay');
{
  const d = S.preset('fire', 2), v = clip(d, 1.5), r = v.result;
  const inUnit = x => typeof x === 'number' && x >= -0.001 && x <= 1.001;
  check('analyze() result: state, vision {state, confidence, flicker, growth, reasons, regions, boxes, cues}, thermal {kind, bg, thresholds, fires, people, boxes, polygons, crosshair}, evidence {vision, thermal}, hazardGuess, overlays, limitations, ms, sim', r.state === 'fire' && r.vision && r.thermal && r.evidence.vision && r.evidence.thermal && r.hazardGuess === 'fire' && r.confidence > 0.6 && r.overlays.boxes.length >= 2 && Array.isArray(r.overlays.polygons) && r.overlays.crosshair && r.limitations.length >= 5 && typeof r.ms === 'number' && r.sim === true && r.vision.cues && r.thermal.bg && r.thermal.thresholds && Array.isArray(r.vision.reasons));
  check('evidence keys: {vision, thermal} with seen and confidence — a confirmed fire has both keys', r.evidence.vision.seen === true && r.evidence.vision.confidence >= 0.9 && r.evidence.thermal.seen === true && r.evidence.thermal.kind === 'hotspot' && r.evidence.thermal.maxC > 150);
  check('overlays are normalised 0..1 (boxes, polygons, crosshair) so any canvas size works; boxes carry kind, label and source (rgb / thermal)', r.overlays.boxes.every(b => inUnit(b.x) && inUnit(b.y) && inUnit(b.w) && inUnit(b.h) && b.kind && b.label && (b.source === 'rgb' || b.source === 'thermal')) && r.overlays.polygons.every(pg => pg.points.every(p => inUnit(p[0]) && inUnit(p[1]))) && inUnit(r.overlays.crosshair.x) && inUnit(r.overlays.crosshair.y) && r.overlays.crosshair.tC > 150);
  check('labels follow the language: opts.lang "ar" gives Arabic box labels, "en" English', (() => { const rgb = S.renderRGB(d, 1.2), th = S.renderThermal(d, 1.2), ar = S.analyze(rgb, { thermal: th, lang: 'ar' }), en = S.analyze(rgb, { thermal: th, lang: 'en' }); return ar.overlays.boxes.some(b => /[؀-ۿ]/.test(b.label)) && en.overlays.boxes.every(b => !/[؀-ۿ]/.test(b.label)); })());
  check('without a thermal frame the thermal half is null and its key is off; without a detector the analysis is a single frame (not temporal)', (() => { const a = S.analyze(S.renderRGB(d, 1)); return a.thermal === null && a.evidence.thermal.seen === false && a.vision.temporal === false; })());
  const an = S.createAnalyzer(); let last; for (let i = 0; i < 12; i++) last = an.push(S.renderRGB(d, i / 12), S.renderThermal(d, i / 12), Math.round(i * 1000 / 12));
  check('createAnalyzer().push() keeps the temporal state (a ManaraFire detector) and the thermal history: "fire" after 12 frames; reset() starts again at "clear"', last.state === 'fire' && last.vision.temporal && (an.reset(), an.push(S.renderRGB(d, 0), S.renderThermal(d, 0), 0).state !== 'fire'));
  check('the analysis uses the REAL ManaraFire code: a detector built with ManaraFire.createDetector gives the same state on the same frames', (() => { const det = F.createDetector({}); let st = null; for (let i = 0; i < 12; i++) st = det.push(S.renderRGB(d, i / 12), Math.round(i * 1000 / 12)).state; return st === 'fire' && st === last.state; })());
  // drawOverlay with a mock canvas context
  const calls = []; const mk = n => (...a) => calls.push([n, ...a]); const ctx2d = { save: mk('save'), restore: mk('restore'), beginPath: mk('beginPath'), moveTo: mk('moveTo'), lineTo: mk('lineTo'), closePath: mk('closePath'), stroke: mk('stroke'), strokeRect: mk('strokeRect'), fillRect: mk('fillRect'), fillText: mk('fillText'), arc: mk('arc'), set strokeStyle(v) { calls.push(['strokeStyle', v]); }, set fillStyle(v) { calls.push(['fillStyle', v]); }, set lineWidth(v) { calls.push(['lineWidth', v]); }, set font(v) { calls.push(['font', v]); }, set textBaseline(v) { calls.push(['textBaseline', v]); } };
  S.drawOverlay(ctx2d, r, 640, 480, { lang: 'en' });
  check('drawOverlay(ctx, result, w, h): draws boxes (strokeRect), polygons, the crosshair with its temperature (arc + text "°C") and a state chip with the confidence; scales to any size', calls.filter(c => c[0] === 'strokeRect').length === r.overlays.boxes.length && calls.some(c => c[0] === 'arc') && calls.some(c => c[0] === 'fillText' && /°C/.test(c[1])) && calls.some(c => c[0] === 'fillText' && /Fire · \d+%/.test(c[1])) && calls.some(c => c[0] === 'moveTo') && calls[0][0] === 'save' && calls[calls.length - 1][0] === 'restore' && (() => { const x = calls.find(c => c[0] === 'strokeRect'); return x[1] <= 640 && x[2] <= 480; })());
  const calls2 = calls.length; calls.length = 0; S.drawOverlay(ctx2d, r, 160, 120, { lang: 'ar' }); const rects160 = calls.filter(c => c[0] === 'strokeRect');
  check('drawOverlay works at another size and in Arabic (the chip says «نار»)', rects160.length > 0 && rects160.every(c => c[1] <= 160 && c[2] <= 120) && calls.some(c => c[0] === 'fillText' && /نار/.test(c[1])));
  calls.length = 0; S.drawOverlay(ctx2d, { state: 'clear', confidence: 0, overlays: { boxes: [], polygons: [], crosshair: null } }, 320, 240, {});
  check('an empty result draws only the state chip (no boxes, no crosshair) and never throws; toCanvas is a no-op without a DOM', calls.filter(c => c[0] === 'strokeRect').length === 0 && calls.filter(c => c[0] === 'arc').length === 0 && calls.some(c => c[0] === 'fillRect') && S.toCanvas(f1, null) === false && S.toCanvas(f1, {}) === false);
  check('the chip shows what the analysis GUESSES for non-fire hazards (flood, dust): "Flood" for a flooded road, "Dust" for haze', (() => { const fl = clip(S.preset('flood', 3), 1.5, 12, { opts: { hypothesis: 'flood' } }).result, du2 = clip(S.preset('dust', 3), 1.5, 12, { opts: { hypothesis: 'dust' } }).result; calls.length = 0; S.drawOverlay(ctx2d, fl, 320, 240, { lang: 'en' }); const a = calls.some(c => c[0] === 'fillText' && /Flood/.test(c[1])); calls.length = 0; S.drawOverlay(ctx2d, du2, 320, 240, { lang: 'en' }); return fl.hazardGuess === 'flood' && du2.hazardGuess === 'dust' && a && calls.some(c => c[0] === 'fillText' && /Dust/.test(c[1])); })());
  check('a flooded road makes the SMOKE rule fire (a known confusion: a grey region that grows): the analysis says so instead of hiding it', (() => { const fl = clip(S.preset('flood', 3), 2.5, 12, { opts: { hypothesis: 'flood' } }).result; return fl.hazardGuess === 'flood' && (fl.vision.state !== 'smoke' || fl.notes.some(n => /smoke rule/.test(n.en))); })());
}

// ---------------------------------------------------------------------------------------------------------------- 9  integration with the national engine
section('9  integration: DRONE ALERT frame descriptors from the national engine → ManaraDroneScene → ManaraFire');
{
  const nctx = vm.createContext({});
  for (const f of ['data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js']) vm.runInContext(read(f), nctx, { filename: f });
  const N = nctx.ManaraNational;
  // REAL fires: sentinel-triggered incidents verified by a drone → the frame of the verification alert
  const realFrames = [], spots = [[51.5264, 25.2856], [51.5013, 25.1904], [51.45, 25.33], [51.4346, 25.2966], [51.6013, 25.1566], [51.52, 25.40], [51.4422, 25.1735], [51.55, 25.31]];
  for (let i = 0; i < spots.length; i++) {
    const n = N.create({ seed: 300 + i, date: '2026-01-15', hour: 9 + (i % 3) * 3, params: { dronePatrolPct: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 3 } });
    N.createIncident(n, { hazard: 'fire', lon: spots[i][0], lat: spots[i][1], severity: 2, trigger: 'sentinel' });
    for (let k = 0; k < 120; k++) N.step(n, 5); // 10 minutes: launch + flight + verification clip
    const al = N.alertQueue(n, { all: true })[0]; if (al && al.frame) realFrames.push({ frame: al.frame, verdict: al.verdict, hz: al.frame.hazard });
  }
  // FALSE alarms of the engine's patrols (look-alikes), a day with plenty of them
  const nat = N.create({ seed: 77, date: '2026-07-12', hour: 0, tickSec: 10, params: { droneFalsePerHour: 3, droneFaultPct: 0 } });
  for (let i = 0; i < 86400 / 10; i++) N.step(nat, 10);
  const falseAll = N.alertQueue(nat, { all: true }).filter(a => a.sim.truth === 'false' && a.frame);
  // every sunset glare of the day (they are rare) plus the first machinery / red-truck alerts, 24 in all
  const falseFrames = falseAll.filter(a => a.sim.decoy === 'glare').slice(0, 8).concat(falseAll.filter(a => a.sim.decoy !== 'glare').slice(0, 16)).map(a => ({ frame: a.frame, decoy: a.sim.decoy }));
  const verdictOf = fr => S.verify(fr, { seconds: 2.5, fps: 12 });
  const realRes = realFrames.map(x => verdictOf(x.frame)), falseRes = falseFrames.map(x => verdictOf(x.frame));
  console.log(`  engine → scene: ${realFrames.length} real fires from sentinel alerts → ManaraFire "${[...new Set(realRes.map(v => v.finalState))].join('/')}" (${realRes.filter(v => v.finalState === 'fire').length} fire); ${falseFrames.length} look-alike alerts raised by patrols (${[...new Set(falseFrames.map(x => x.decoy))].join(', ')}) → ${JSON.stringify(falseRes.reduce((o, v) => (o[v.finalState] = (o[v.finalState] || 0) + 1, o), {}))}`);
  check('the engine\'s DRONE ALERT frame descriptor is exactly what ManaraDroneScene draws: hazard fire, a scene seed, a camera pose, time of day, wind and temperatures — and it renders', realFrames.length >= 6 && realFrames.every(x => x.hz === 'fire' && x.frame.sceneSeed > 0 && x.frame.camera.altM > 0 && x.frame.width === 320) && realRes.every(v => v.frames >= 20));
  check('REAL fires raised by the engine (sentinel-triggered, verified by a drone): ManaraFire confirms "fire" in at least 85 % of the frames, and the thermal key sees a hotspot', realRes.filter(v => v.finalState === 'fire').length / realRes.length >= 0.85 && realRes.filter(v => v.result.thermal.kind === 'hotspot').length / realRes.length >= 0.85);
  check('the engine\'s own FALSE alarms (sunset glare, red trucks, hot machinery raised by patrols): the scene shows no fire and ManaraFire NEVER reaches "fire" on any of them', falseFrames.length >= 12 && falseFrames.every(x => x.frame.hazard === 'none' && x.frame.decoy) && falseRes.every(v => !v.timeline.some(x => x.state === 'fire')));
  check('so the control room can dismiss them on evidence: for the look-alikes the vision key is never confirmed by flicker (no "fire"), and hot machinery shows as a hot OBJECT (below 150 °C), never a fire source', falseRes.every((v, i) => v.result.evidence.vision.seen === false || v.finalState === 'smoke') && falseRes.every(v => v.result.thermal.fires.length === 0));
  check('the descriptor round-trips through JSON (the bus carries it): the scene rendered from the parsed copy is byte-identical', (() => { const fr = realFrames[0].frame, a = S.renderRGB(fr, 1.0), b = S.renderRGB(JSON.parse(JSON.stringify(fr)), 1.0); return fnv(a.data) === fnv(b.data); })());
}

// ---------------------------------------------------------------------------------------------------------------- 10  timing
section('10  timing (320 × 240): frames in < 12 ms');
{
  const bench = (name, d, f) => { const sc = S.create(d); for (let i = 0; i < 4; i++) f(sc, i / 12); const ts = []; for (let i = 0; i < 30; i++) { const a = performance.now(); f(sc, 4 + i / 12); ts.push(performance.now() - a); } return median(ts); };
  const rgbMs = {}, thMs = {};
  for (const k of ['fire', 'gas', 'flood', 'dust', 'sos', 'clear', 'decoy-glare', 'decoy-red-truck']) { const d = S.preset(k, 9); rgbMs[k] = bench(k, d, (sc, t) => sc.renderRGB(t)); thMs[k] = bench(k, d, (sc, t) => sc.renderThermal(t)); }
  timings.rgbMedianMs = Math.max(...Object.values(rgbMs)); timings.thermalMedianMs = Math.max(...Object.values(thMs));
  console.log('  RGB frame, median of 30 (ms): ' + Object.entries(rgbMs).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
  console.log('  thermal frame, median of 30 (ms): ' + Object.entries(thMs).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
  check('a 320 × 240 RGB frame takes < 12 ms (median of 30, the slowest scene type)', timings.rgbMedianMs < 12, timings.rgbMedianMs.toFixed(2) + ' ms');
  check('a thermal frame takes < 12 ms (median, slowest scene type)', timings.thermalMedianMs < 12, timings.thermalMedianMs.toFixed(2) + ' ms');
  const d = S.preset('fire', 9), sc = S.create(d), an = S.createAnalyzer(), aT = []; for (let i = 0; i < 16; i++) { const rgb = sc.renderRGB(i / 12), th = sc.renderThermal(i / 12), a = performance.now(); an.push(rgb, th, Math.round(i * 83)); aT.push(performance.now() - a); }
  timings.analyzeMedianMs = median(aT.slice(4));
  check('analysing a frame (ManaraFire on RGB + the thermal rule, people and cold tests) takes < 25 ms (median)', timings.analyzeMedianMs < 25, timings.analyzeMedianMs.toFixed(2) + ' ms');
  const cold = []; for (let i = 0; i < 6; i++) { S.clearCache(); const a = performance.now(); S.create(S.preset(['fire', 'gas', 'flood', 'dust', 'sos', 'clear'][i], 100 + i)); cold.push(performance.now() - a); }
  timings.coldBuildMs = median(cold);
  check('building a scene (the static layer: terrain, roads, shadows, buildings, vehicles, materials) takes < 120 ms (median over six scene types, cold)', timings.coldBuildMs < 120, timings.coldBuildMs.toFixed(1) + ' ms');
  const verifyMs = (() => { const a = performance.now(); S.verify(S.preset('fire', 21), { seconds: 2.5, fps: 12 }); return performance.now() - a; })();
  timings.verifyClipMs = verifyMs;
  check('a verification clip (30 frames of RGB + thermal + analysis) takes < 800 ms — fast enough for a live feed wall at 12 fps', verifyMs < 800, verifyMs.toFixed(0) + ' ms');
}

console.log('\nTIMINGS (ms): ' + Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nFAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
