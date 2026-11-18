/* MANARA («منارة») — what a drone's camera sees: a procedurally generated AERIAL scene  →  window.ManaraDroneScene
 * =====================================================================================================================
 * The control room's live feed wall, the "proof before panic" demo and the drone alerts all need pictures.  There is no real drone, so this module DRAWS them: a top-down / oblique
 * aerial camera frame with buildings, roads, desert or sea, vehicles, people, and the hazard — fire (flickering flames and a smoke plume that drifts downwind), gas (a vapour cloud that exists
 * ONLY in the thermal image), flood (water spreading over roads), dust (haze that lowers contrast), heat / SOS (a collapsed person) — in two cameras: RGB and thermal (false-colour "iron").
 * Then it ANALYSES the frames exactly as the product would: the REAL ManaraFire detector (rule-based computer vision: colour models + flicker / motion analysis — not AI) runs on the RGB frame
 * and a contextual thermal detector runs on the thermal field.  EVERYTHING HERE IS A SIMULATION (SIM): no real drone footage, no real fire, no claim that a drone has flown.
 *
 * Pure and deterministic: no DOM, no network, no libraries; a classic script that attaches to globalThis / self / window, so it loads from file:// and in Node (vm).  The same descriptor + the same
 * t give the same pixels.  Frames are plain { data: Uint8ClampedArray RGBA, width, height } objects (ImageData-compatible; the canvas helper is the only DOM touch and is optional).
 *   Node:  const ctx = vm.createContext({});  vm.runInContext(fire.js, ctx);  vm.runInContext(drone-scene.js, ctx);  const S = ctx.ManaraDroneScene;
 *
 * DESCRIPTOR  (what ManaraNational puts in a DRONE ALERT as `frame`; every field optional, sensible defaults)
 *   { sceneSeed: uint32, hazard: 'fire'|'gas'|'flood'|'dust'|'heat'|'sos'|'none', decoy: null|'glare'|'red-truck'|'machinery', severity: 1..3, flames: true|false (false = smoke only),
 *     camera: { altM: 80, headingDeg: 0 (the direction the top of the picture points), pitchDeg: 90 = straight down … 35 = oblique (default 60), fovDeg: 62 (horizontal), offsetE, offsetN (m, where the hazard
 *               is relative to the picture centre) }, timeOfDay: hour 0..24, context: 'urban'|'industrial'|'desert'|'coast'|'road', wind: { deg (blowing FROM), mps },
 *     ambientC, groundC (sun-baked ground), solar 0..1 (derived from timeOfDay if absent), visFactor 0..1 (dust: 1 = clear), width: 320, height: 240 }
 *
 * API
 *   create(desc) → scene { desc, width, height, renderRGB(t), renderThermal(t, {full?}), renderFused(t), temperatureField(t), anchorInfo, stats, buildMs }
 *   renderRGB(desc, t) → RGB frame {data, width, height, t}         renderThermal(desc, t, {full?}) → thermal frame {data (RGBA iron palette), width, height, temps (Float32Array °C), tw, th, range {lo, hi}, palette, scale}
 *       (the thermal sensor is half the RGB resolution: width = tw unless {full: true}; temps are always tw × th)
 *   analyze(rgb, opts) → { state, vision, thermal, evidence {vision, thermal}, hazardGuess, confidence, overlays {boxes, polygons, crosshair}, limitations, ms }
 *       opts: { thermal: <thermal frame>, detector: <ManaraFire detector> (temporal state: 'fire' needs flicker over ~0.7 s of frames), tMs, lang, hypothesis: 'fire'|'gas'|'sos'|'heat' (people on the thermal image
 *       count as a key only for sos / heat: a bystander is not an emergency), hotObjC (90 °C), fireC (150 °C) }.
 *       Without a detector it analyses ONE frame: a single frame can reach 'suspect' at most (flames are proven by flicker, not by colour).
 *   analyzeRGB(frame, opts)  analyzeThermal(thermalFrame, opts)       the two halves
 *   createAnalyzer(opts) → { push(rgb, thermal, tMs) → analyze result, reset(), detector }      wraps ManaraFire.createDetector
 *   verify(descOrScene, {seconds: 2.5, fps: 12, t0, thermal}) → { result, frames, timeline }   renders a clip and runs the temporal detector on it (what the feed wall does)
 *   drawOverlay(ctx, result, w, h, {lang}) → draws boxes, labels, a crosshair with the temperature and a state chip on a 2D canvas context (overlays are normalised 0..1, so any size works)
 *   toCanvas(frame, canvas) → draws a frame on a canvas (the optional DOM helper)         ironPalette (256 × [r,g,b])     tempToRGB(tC, lo, hi) → [r,g,b]
 *   preset(kind, seed, opts) → a descriptor for 'fire' | 'gas' | 'flood' | 'dust' | 'heat' | 'sos' | 'clear' | 'decoy-glare' | 'decoy-red-truck' | 'decoy-machinery'      PRESETS (the list)
 *   describe(desc) → { ar, en } a one-line caption         SCENE_TYPES      LIMITATIONS [{ar, en}]      VERSION
 *
 * THE DETECTORS
 *   RGB:  ManaraFire (colour models of Çelik & Demirel 2009 and Chen et al. 2004, flicker / growth / persistence).  A fire needs flicker: a red truck or a sunset-lit tower is fire-COLOURED but static, so it
 *         stays at most "suspect" — the rejection is the point of the decoy scenes.
 *   Thermal (contextual hotspot test): a pixel is a hotspot when T > background mean + 3 · MAD AND T > background + 6 °C (mean = trimmed mean of the frame, MAD = median absolute deviation).  Hot roofs and
 *         sun-baked asphalt are part of the background, so they are not hotspots.  A hotspot ≥ 150 °C is a fire source; a cooler one (machinery, a car engine) is a "hot object".  People ≈ 35 °C are found by a LOCAL
 *         test (warmer than their surroundings by ≥ 3 °C, small blob): at night the ground is cooler than a person; at Gulf midday the ground is 55–65 °C and a person is COLDER than the road — they vanish.
 *         A cold patch (T < mean − 3 · MAD and < mean − 4 °C) is a vapour cloud candidate (a leaking liquefied gas cools the air as it evaporates; a plain thermal camera sees the temperature, not the gas).
 *
 * HONEST LIMITS (also in LIMITATIONS): thermal people-detection fails against hot ground; glass blocks long-wave infrared; the colour rules see sunsets, red paint and sodium lamps; flicker needs a hovering
 * camera; a thermal camera does not identify gas.  A real deployment needs real footage, a trained model and the authority's approval; none of that exists yet.
 * ===================================================================================================================== */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var M = Math, floor = M.floor, ceil = M.ceil, abs = M.abs, sqrt = M.sqrt, sin = M.sin, cos = M.cos, PI = M.PI, min = M.min, max = M.max, round = M.round, exp = M.exp, tan = M.tan, imul = M.imul, atan2 = M.atan2;
  var DEG = PI / 180;
  var F32 = Float32Array, U8 = Uint8Array, U8C = Uint8ClampedArray, I32 = Int32Array;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash32(x) { x ^= x >>> 16; x = imul(x, 0x7feb352d); x ^= x >>> 15; x = imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0; }
  function hr(seed, a, b) { var h = hash32((seed ^ 0x9e3779b9) | 0); h = hash32(h ^ imul(a | 0, 0x85ebca6b)); h = hash32(h ^ imul(b | 0, 0xc2b2ae35)); return h / 4294967296; }
  function T(ar, en) { return { ar: ar, en: en }; }

  // ---- value noise from one fixed 128 x 128 tile (bilinear, smoothstep, wraps); the scene varies it with offsets
  var NT = 128, NOISE = new F32(NT * NT);
  (function () { for (var i = 0; i < NT * NT; i++) NOISE[i] = hash32(imul(i + 1, 0x9e3779b1) ^ 0x5bd1e995) / 4294967296; })();
  function vnoise(x, y) {
    var xi = floor(x), yi = floor(y), fx = x - xi, fy = y - yi, x0, y0, x1, y1, a, b, c, d;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    x0 = xi & 127; y0 = yi & 127; x1 = (x0 + 1) & 127; y1 = (y0 + 1) & 127;
    a = NOISE[y0 * NT + x0]; b = NOISE[y0 * NT + x1]; c = NOISE[y1 * NT + x0]; d = NOISE[y1 * NT + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* ====================================================================================
   * 1. RASTER PRIMITIVES (scanline polygons, ellipses, soft discs) on RGBA buffers; an optional material layer for the thermal camera
   * ==================================================================================== */
  // material ids (thermal behaviour in MAT_SUN / MAT_NIGHT below)
  var MAT = { SAND: 0, PAN: 1, ASPHALT: 2, CONCRETE: 3, ROOF_LIGHT: 4, ROOF_DARK: 5, WALL: 6, WATER: 7, VEG: 8, VEHICLE: 9, HOT: 10, GLASS: 11, METAL: 12, CONTAINER: 13, SHADE_BIT: 128 };
  //                  sand  pan  asph  conc  roofL roofD wall  water veg  veh   hot   glass metal cont       (°C relative to the ground temperature: sun-baked by day, radiatively cooled at night)
  var MAT_SUN =   [0,     1,   10,   4,    7,    15,   5,    -8,   -7,  9,    22,   2,    7,    11];
  var MAT_NIGHT = [0,    -0.5, 3.5,  1,   -2.5,  -1,   0.5,   3.5,  -1,  2,    14,   -1,  -2,    1];
  var PT = new Float64Array(24);          // scratch polygon
  var SINT = new F32(1024); (function () { for (var i = 0; i < 1024; i++) SINT[i] = 0.5 + 0.5 * sin(i / 1024 * 2 * PI); })();

  function fillPoly(B, pts, n, r, g, b, a, mat) {       // convex polygon, pixel centres at +0.5; alpha a (1 = opaque); mat >= 0 also writes the material layer
    var W = B.W, H = B.H, buf = B.buf, mb = B.mat, ymin = 1e9, ymax = -1e9, i, j, y, yc, lo, hi, x, x0, x1, ya, yb, t, p, m, ia;
    for (i = 0; i < n; i++) { y = pts[2 * i + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    var y0 = max(0, ceil(ymin - 0.5)), y1 = min(H - 1, floor(ymax - 0.5));
    for (y = y0; y <= y1; y++) {
      yc = y + 0.5; lo = 1e9; hi = -1e9;
      for (i = 0; i < n; i++) {
        j = i + 1 === n ? 0 : i + 1; ya = pts[2 * i + 1]; yb = pts[2 * j + 1];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) { t = (yc - ya) / (yb - ya); x = pts[2 * i] + (pts[2 * j] - pts[2 * i]) * t; if (x < lo) lo = x; if (x > hi) hi = x; }
      }
      if (lo > hi) continue;
      x0 = max(0, ceil(lo - 0.5)); x1 = min(W - 1, floor(hi - 0.5)); if (x0 > x1) continue;
      p = (y * W + x0) << 2;
      if (a >= 1) for (x = x0; x <= x1; x++, p += 4) { buf[p] = r; buf[p + 1] = g; buf[p + 2] = b; buf[p + 3] = 255; }
      else { ia = 1 - a; for (x = x0; x <= x1; x++, p += 4) { buf[p] = buf[p] * ia + r * a; buf[p + 1] = buf[p + 1] * ia + g * a; buf[p + 2] = buf[p + 2] * ia + b * a; } }
      if (mb && mat >= 0) { m = y * W + x0; for (x = x0; x <= x1; x++) mb[m++] = mat; }
    }
  }
  function quad(B, x0, y0, x1, y1, x2, y2, x3, y3, r, g, b, a, mat) { PT[0] = x0; PT[1] = y0; PT[2] = x1; PT[3] = y1; PT[4] = x2; PT[5] = y2; PT[6] = x3; PT[7] = y3; fillPoly(B, PT, 4, r, g, b, a, mat); }
  function fillEllipse(B, cx, cy, rx, ry, r, g, b, a, mat) {
    var W = B.W, H = B.H, buf = B.buf, mb = B.mat, y0 = max(0, ceil(cy - ry - 0.5)), y1 = min(H - 1, floor(cy + ry - 0.5)), y, x, x0, x1, dy, w, p, ia = 1 - a;
    if (rx <= 0 || ry <= 0) return;
    for (y = y0; y <= y1; y++) {
      dy = (y + 0.5 - cy) / ry; w = 1 - dy * dy; if (w <= 0) continue; w = rx * sqrt(w);
      x0 = max(0, ceil(cx - w - 0.5)); x1 = min(W - 1, floor(cx + w - 0.5)); if (x0 > x1) continue;
      p = (y * W + x0) << 2;
      if (a >= 1) for (x = x0; x <= x1; x++, p += 4) { buf[p] = r; buf[p + 1] = g; buf[p + 2] = b; buf[p + 3] = 255; }
      else for (x = x0; x <= x1; x++, p += 4) { buf[p] = buf[p] * ia + r * a; buf[p + 1] = buf[p + 1] * ia + g * a; buf[p + 2] = buf[p + 2] * ia + b * a; }
      if (mb && mat >= 0) { p = y * W + x0; for (x = x0; x <= x1; x++) mb[p++] = mat; }
    }
  }
  function softDisc(buf, W, H, cx, cy, rad, r, g, b, amax) {        // a translucent disc with a smooth edge (smoke puffs, glows)
    var x0 = max(0, floor(cx - rad)), x1 = min(W - 1, ceil(cx + rad)), y0 = max(0, floor(cy - rad)), y1 = min(H - 1, ceil(cy + rad)), x, y, dx, dy, d2, rr = rad * rad, a, ia, p;
    for (y = y0; y <= y1; y++) {
      dy = y + 0.5 - cy; p = (y * W + x0) << 2;
      for (x = x0; x <= x1; x++, p += 4) {
        dx = x + 0.5 - cx; d2 = (dx * dx + dy * dy) / rr; if (d2 >= 1) continue;
        a = 1 - d2; a = a * a * amax; ia = 1 - a;
        buf[p] = buf[p] * ia + r * a; buf[p + 1] = buf[p + 1] * ia + g * a; buf[p + 2] = buf[p + 2] * ia + b * a;
      }
    }
  }
  function addGlow(buf, W, H, cx, cy, rad, r, g, b, amax) {          // additive light (fire glow at night)
    var x0 = max(0, floor(cx - rad)), x1 = min(W - 1, ceil(cx + rad)), y0 = max(0, floor(cy - rad)), y1 = min(H - 1, ceil(cy + rad)), x, y, dx, dy, d2, rr = rad * rad, a, p;
    for (y = y0; y <= y1; y++) {
      dy = y + 0.5 - cy; p = (y * W + x0) << 2;
      for (x = x0; x <= x1; x++, p += 4) {
        dx = x + 0.5 - cx; d2 = (dx * dx + dy * dy) / rr; if (d2 >= 1) continue;
        a = 1 - d2; a = a * a * amax; buf[p] += r * a; buf[p + 1] += g * a; buf[p + 2] += b * a;
      }
    }
  }

  /* ====================================================================================
   * 2. DESCRIPTOR, SUN, CAMERA
   * ==================================================================================== */
  var CONTEXTS = ['urban', 'industrial', 'desert', 'coast', 'road'];
  var HAZ = { fire: 1, gas: 1, flood: 1, dust: 1, heat: 1, sos: 1, none: 1 };
  function sunOf(hour) {                                 // a Gulf-latitude sun: elevation (rad) and azimuth (deg from north, east in the morning), solar = sin(elevation)
    var h = ((hour % 24) + 24) % 24, a = (h - 5.6) / 12.8;
    if (a <= 0 || a >= 1) return { elev: 0, az: a <= 0 ? 80 : 280, solar: 0, hour: h };
    var elev = 82 * DEG * sin(PI * a);
    return { elev: elev, az: 80 + 200 * a, solar: sin(elev), hour: h };
  }
  function normalize(d) {
    d = d || {};
    var cam = d.camera || {}, wi = d.wind || {}, o = {
      sceneSeed: (d.sceneSeed >>> 0) || 1, hazard: HAZ[d.hazard] ? d.hazard : 'none', decoy: d.decoy === 'glare' || d.decoy === 'red-truck' || d.decoy === 'machinery' ? d.decoy : null,
      severity: clamp(round(d.severity || 2), 1, 3), flames: d.flames !== false,
      camera: { altM: clamp(isFinite(cam.altM) ? +cam.altM : 80, 20, 150), headingDeg: (((isFinite(cam.headingDeg) ? +cam.headingDeg : 0) % 360) + 360) % 360, pitchDeg: clamp(isFinite(cam.pitchDeg) ? +cam.pitchDeg : 60, 35, 90),
        fovDeg: clamp(isFinite(cam.fovDeg) ? +cam.fovDeg : 62, 30, 100), offsetE: isFinite(cam.offsetE) ? +cam.offsetE : 0, offsetN: isFinite(cam.offsetN) ? +cam.offsetN : 0 },
      timeOfDay: isFinite(d.timeOfDay) ? +d.timeOfDay : 12, context: CONTEXTS.indexOf(d.context) >= 0 ? d.context : 'urban',
      wind: { deg: isFinite(wi.deg) ? +wi.deg : 315, mps: clamp(isFinite(wi.mps) ? +wi.mps : 5, 0, 40) }, ambientC: isFinite(d.ambientC) ? +d.ambientC : 38, capC: isFinite(d.thermalCapC) ? clamp(+d.thermalCapC, 150, 1500) : 550,
      width: clamp((d.width | 0) || 320, 64, 1280), height: clamp((d.height | 0) || 240, 48, 960), t0: isFinite(d.t0) ? +d.t0 : 0
    };
    if (o.decoy === 'glare') o.camera.pitchDeg = min(o.camera.pitchDeg, 60);          // the glare is on a facade: the camera must look obliquely
    o.sun = sunOf(o.timeOfDay); o.solar = isFinite(d.solar) ? clamp(+d.solar, 0, 1) : o.sun.solar;
    o.groundC = isFinite(d.groundC) ? +d.groundC : o.ambientC + 18 * o.solar - 2 * (1 - o.solar);
    o.visFactor = isFinite(d.visFactor) ? clamp(+d.visFactor, 0.1, 1) : 1;
    o.sev = isFinite(d.sev) ? clamp(+d.sev, 0, 1) : 0.3 + 0.2 * (o.severity - 1);
    return o;
  }
  function makeCam(o) {                                  // world (E, N metres, the hazard is the origin) → pixels.  Orthographic oblique: the ground is squeezed by sin(pitch), heights lean by cos(pitch).
    var c = o.camera, W = o.width, H = o.height, foot = 2 * c.altM * tan(c.fovDeg / 2 * DEG), k = W / foot, hd = c.headingDeg * DEG, sp = sin(c.pitchDeg * DEG), cp = cos(c.pitchDeg * DEG);
    var cam = { W: W, H: H, k: k, mpp: 1 / k, sp: sp, cp: cp, cx: -c.offsetE, cy: -c.offsetN, ux: sin(hd), uy: cos(hd), rx: cos(hd), ry: -sin(hd), footM: foot };
    cam.px = function (E, N, z) { var dx = E - cam.cx, dy = N - cam.cy; return W / 2 + (dx * cam.rx + dy * cam.ry) * k; };
    cam.py = function (E, N, z) { var dx = E - cam.cx, dy = N - cam.cy; return H / 2 - (dx * cam.ux + dy * cam.uy) * sp * k - z * cp * k; };
    cam.world = function (x, y) { var sxm = (x - W / 2) / k, fym = (H / 2 - y) / (k * sp); return [cam.cx + sxm * cam.rx + fym * cam.ux, cam.cy + sxm * cam.ry + fym * cam.uy]; };
    return cam;
  }

  /* ====================================================================================
   * 3. THE LAYOUT: roads, blocks, buildings, vehicles, trees, people — generated from the scene seed in world metres, then shifted so the hazard is the origin
   * ==================================================================================== */
  var SAND = [214, 191, 148];
  function carColor(u) { return u < 0.34 ? [236, 236, 232] : u < 0.5 ? [182, 186, 192] : u < 0.62 ? [38, 40, 44] : u < 0.72 ? [150, 150, 154] : u < 0.8 ? [168, 36, 36] : u < 0.88 ? [46, 82, 140] : u < 0.94 ? [210, 190, 150] : [90, 100, 90]; }
  function rotp(x, y, c, s) { return [x * c - y * s, x * s + y * c]; }
  function buildLayout(o) {
    var seed = o.sceneSeed, cm = o.camera, foot = 2 * cm.altM * tan(cm.fovDeg / 2 * DEG), ext = foot * 1.15 + sqrt(cm.offsetE * cm.offsetE + cm.offsetN * cm.offsetN) + 60;
    var L = { ext: ext, roads: [], bld: [], veh: [], trees: [], people: [], patches: [], tanks: [], items: [], sea: null, anchor: null, kind: o.context, rot: 0, S: 100, lamps: [] };
    var ctx = o.context;
    if (ctx === 'desert') genDesert(o, L); else if (ctx === 'road') genRoad(o, L); else genGrid(o, L, ctx);
    chooseAnchor(o, L);
    return L;
  }
  function addRoad(L, x0, y0, x1, y1, w, kind, fam, pos) {         // a straight road (world coords); corners are computed when drawing
    L.roads.push({ x0: x0, y0: y0, x1: x1, y1: y1, w: w, kind: kind, fam: fam === undefined ? -1 : fam, pos: pos || 0 });
  }
  function addBld(L, cx, cy, w, d, ang, h, kind, o2) {
    var c = cos(ang), s = sin(ang), hw = w / 2, hd = d / 2, pts = [], q, i, b, xs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (i = 0; i < 4; i++) { q = rotp(xs[i][0], xs[i][1], c, s); pts.push(cx + q[0], cy + q[1]); }
    b = { cx: cx, cy: cy, w: w, d: d, ang: ang, h: h, kind: kind, pts: pts, glass: kind === 'tower', roof: null, wall: null, ac: [], id: L.bld.length };
    if (o2) for (i in o2) b[i] = o2[i];
    L.bld.push(b);
    return b;
  }
  function genGrid(o, L, ctx) {
    var seed = o.sceneSeed, urban = ctx !== 'industrial', S = (urban ? 100 : 165) * (0.9 + 0.2 * hr(seed, 1, 1)), rw = urban ? 11 : 14, mainW = urban ? 20 : 22, ext = L.ext, rot = (hr(seed, 2, 2) - 0.5) * 0.9, cr = cos(rot), sr = sin(rot);
    var ox = hr(seed, 3, 3) * S, oy = hr(seed, 4, 4) * S, n0 = -ceil(ext / S) - 2, n1 = ceil(ext / S) + 2, i, ix, iy, q;
    L.rot = rot; L.S = S; L.ox = ox; L.oy = oy; L.rw = rw; L.mainW = mainW;
    var halfR = function (k) { return (((k % 3) + 3) % 3 === 0 ? mainW : rw) / 2; };
    var W2 = function (lx, ly) { return rotp(lx, ly, cr, sr); };
    // roads (the lattice is rotated by `rot`)
    for (i = n0; i <= n1; i++) {
      var w = (((i % 3) + 3) % 3 === 0) ? mainW : rw, kind = w === mainW ? 'main' : 'street', a = W2(-ext * 2, oy + i * S), b = W2(ext * 2, oy + i * S), c = W2(ox + i * S, -ext * 2), d = W2(ox + i * S, ext * 2);
      addRoad(L, a[0], a[1], b[0], b[1], w, kind, 0, oy + i * S); addRoad(L, c[0], c[1], d[0], d[1], w, kind, 1, ox + i * S);
    }
    // blocks
    for (iy = n0; iy < n1; iy++) for (ix = n0; ix < n1; ix++) {
      var bx0 = ox + ix * S + halfR(ix), bx1 = ox + (ix + 1) * S - halfR(ix + 1), by0 = oy + iy * S + halfR(iy), by1 = oy + (iy + 1) * S - halfR(iy + 1), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, bw = bx1 - bx0, bh = by1 - by0;
      q = W2(cx, cy); if (abs(q[0]) > ext * 1.1 || abs(q[1]) > ext * 1.1) continue;
      var u = hr(seed, ix * 131 + 7, iy * 313 + 11), u2 = hr(seed, ix * 977 + 3, iy * 421 + 5);
      if (urban) fillUrbanBlock(L, W2, rot, bx0, by0, bx1, by1, bw, bh, cx, cy, u, u2, seed, ix, iy, ctx === 'coast');
      else fillIndustrialBlock(L, W2, rot, bx0, by0, bx1, by1, bw, bh, cx, cy, u, u2, seed, ix, iy);
    }
    if (ctx === 'coast') {
      var ang = hr(seed, 5, 5) * 2 * PI, nx = cos(ang), ny = sin(ang), off = 30 + 25 * hr(seed, 6, 6);
      L.sea = { nx: nx, ny: ny, c: off, seed: hr(seed, 7, 7) * 100 };           // sea where nx*E + ny*N > c + wiggle
    }
  }
  function pushCar(L, x, y, ang, moving, u) { L.veh.push({ x: x, y: y, ang: ang, len: 4.2 + 0.5 * u, wid: 1.8, col: carColor(u), moving: !!moving }); }
  function fillUrbanBlock(L, W2, rot, x0, y0, x1, y1, bw, bh, cx, cy, u, u2, seed, ix, iy, coast) {
    var a, p, k, n, hh, kind, b, j;
    var B = function (lx, ly, w, d, h, kind, extra) { p = W2(lx, ly); return addBld(L, p[0], p[1], w, d, rot, h, kind, extra); };
    if (u < 0.34) {                                                      // apartment block
      hh = 15 + floor(u2 * 5) * 3.2;
      b = B(cx, cy, bw * 0.5, bh * 0.4, hh, 'apartment'); b.roof = [196 + u2 * 20, 190 + u2 * 16, 176]; b.wall = [214, 202, 180];
      n = 3 + floor(hr(seed, ix + 40, iy + 41) * 5); for (k = 0; k < n; k++) b.ac.push({ x: (hr(seed, ix * 17 + k, iy + 50) - 0.5) * 0.7 * b.w, y: (hr(seed, ix + 60, iy * 19 + k) - 0.5) * 0.7 * b.d });
      for (k = 0; k < 4; k++) { p = W2(x0 + 8 + k * 11, y1 - 6); pushCar(L, p[0], p[1], rot + PI / 2, false, hr(seed, ix * 5 + k, iy * 3 + 70)); }
    } else if (u < 0.62) {                                               // villas with garden walls
      var cols = bw > 60 ? 2 : 1, rows = bh > 60 ? 2 : 1, vi, vj;
      for (vi = 0; vi < cols; vi++) for (vj = 0; vj < rows; vj++) {
        var vx = x0 + (vi + 0.5) * bw / cols, vy = y0 + (vj + 0.5) * bh / rows, vw = bw / cols * 0.62, vd = bh / rows * 0.55;
        b = B(vx, vy, vw, vd, 7 + 3 * hr(seed, vi + 80, vj + ix * 7 + iy), 'villa'); b.roof = [205 + 15 * u2, 196, 178]; b.wall = [226, 214, 192]; b.ac.push({ x: -vw * 0.2, y: 0 }, { x: vw * 0.15, y: vd * 0.2 });
        b.wallPts = [[vx - bw / cols * 0.45, vy - bh / rows * 0.45], [vx + bw / cols * 0.45, vy - bh / rows * 0.45], [vx + bw / cols * 0.45, vy + bh / rows * 0.45], [vx - bw / cols * 0.45, vy + bh / rows * 0.45]].reduce(function (a, q) { var w = W2(q[0], q[1]); a.push(w[0], w[1]); return a; }, []);
        p = W2(vx + vw * 0.5 + 4, vy + vd * 0.8); pushCar(L, p[0], p[1], rot, false, hr(seed, vi + 90, vj + 91));
        if (hr(seed, vi + 100, vj + ix) < 0.7) { p = W2(vx - vw * 0.6, vy - vd * 0.7); L.trees.push({ x: p[0], y: p[1], r: 2.4 + 1.2 * hr(seed, vi + 110, vj + iy) }); }
      }
    } else if (u < 0.7) {                                                // glass tower
      hh = 55 + 55 * u2;
      b = B(cx, cy, min(bw, bh) * 0.46, min(bw, bh) * 0.46, hh, 'tower'); b.roof = [168, 172, 178]; b.wall = [96, 124, 150]; b.ac.push({ x: 0, y: 0 });
    } else if (u < 0.78) {                                               // mall / big box
      b = B(cx, cy, bw * 0.66, bh * 0.42, 11 + 4 * u2, 'mall'); b.roof = [186 + 20 * u2, 184, 178]; b.wall = [208, 200, 190];
      for (k = 0; k < 6; k++) b.ac.push({ x: (hr(seed, ix + 120 + k, iy) - 0.5) * 0.8 * b.w, y: (hr(seed, ix, iy + 130 + k) - 0.5) * 0.7 * b.d });
      n = 14; for (k = 0; k < n; k++) { p = W2(x0 + 6 + (k % 7) * (bw - 12) / 7, y1 - 7 - floor(k / 7) * 6); pushCar(L, p[0], p[1], rot + PI / 2, false, hr(seed, k + 140, ix * 3 + iy)); }
    } else if (u < 0.88) {                                               // park
      L.patches.push({ kind: 'grass', x0: x0 + 3, y0: y0 + 3, x1: x1 - 3, y1: y1 - 3, W2: W2 });
      n = 9; for (k = 0; k < n; k++) { p = W2(x0 + 10 + hr(seed, k + 150, ix + iy) * (bw - 20), y0 + 10 + hr(seed, k + 160, ix - iy) * (bh - 20)); L.trees.push({ x: p[0], y: p[1], r: 3 + 1.8 * hr(seed, k + 170, iy) }); }
    } else {                                                             // parking lot
      L.patches.push({ kind: 'lot', x0: x0 + 2, y0: y0 + 2, x1: x1 - 2, y1: y1 - 2, W2: W2 });
      n = 22; for (k = 0; k < n; k++) if (hr(seed, k + 180, ix * 3 + iy) < 0.7) { p = W2(x0 + 8 + (k % 11) * (bw - 16) / 11, y0 + 10 + floor(k / 11) * (bh - 20)); pushCar(L, p[0], p[1], rot + PI / 2, false, hr(seed, k + 190, ix + iy * 5)); }
    }
    if (hr(seed, ix + 200, iy + 201) < 0.55) { p = W2(x0 + 4 + hr(seed, ix, iy + 202) * (bw - 8), y0 - 4.5); L.people.push({ x: p[0], y: p[1], ph: hr(seed, ix + 203, iy), col: hr(seed, ix + 204, iy + 205) }); }
    if (hr(seed, ix + 210, iy + 211) < 0.5) { p = W2(x1 - 6, y0 - 6); L.lamps.push({ x: p[0], y: p[1] }); }
  }
  function fillIndustrialBlock(L, W2, rot, x0, y0, x1, y1, bw, bh, cx, cy, u, u2, seed, ix, iy) {
    var p, b, k, n, B = function (lx, ly, w, d, h, kind, extra) { var q = W2(lx, ly); return addBld(L, q[0], q[1], w, d, rot, h, kind, extra); };
    if (u < 0.34) {                                                      // warehouse
      b = B(cx, cy, bw * 0.6, bh * 0.3, 9 + 3 * u2, 'warehouse'); b.roof = [168 + 20 * u2, 172, 176]; b.wall = [190, 192, 194];
      for (k = 0; k < 5; k++) b.ac.push({ x: (hr(seed, ix + 230 + k, iy) - 0.5) * 0.8 * b.w, y: (hr(seed, ix, iy + 240 + k) - 0.5) * 0.5 * b.d });
      for (k = 0; k < 5; k++) { p = W2(x0 + 12 + k * (bw - 24) / 5, y1 - 7); L.veh.push({ x: p[0], y: p[1], ang: rot + PI / 2, len: 8 + 3 * hr(seed, k + 250, ix), wid: 2.5, col: hr(seed, k + 260, iy) < 0.3 ? [232, 232, 230] : [190, 80, 40], moving: false, truck: true }); }
    } else if (u < 0.55) {                                               // tank farm
      n = 3 + floor(u2 * 3);
      for (k = 0; k < n; k++) { p = W2(x0 + bw * (0.2 + 0.6 * ((k % 3) / 2)), y0 + bh * (0.28 + 0.44 * floor(k / 3))); L.tanks.push({ x: p[0], y: p[1], r: 7 + 7 * hr(seed, k + 270, ix + iy), h: 11 + 4 * hr(seed, k + 280, iy), gas: false }); }
      L.patches.push({ kind: 'lot', x0: x0 + 2, y0: y0 + 2, x1: x1 - 2, y1: y1 - 2, W2: W2 });
    } else if (u < 0.7) {                                                // container yard
      for (k = 0; k < 28; k++) { var cw = 12, cd = 2.6, gx = k % 7, gy = floor(k / 7); if (hr(seed, k + 290, ix * 3 + iy) < 0.15) continue;
        b = B(x0 + 10 + gx * (bw - 20) / 7 + cw / 2, y0 + 10 + gy * (bh - 20) / 4 + cd / 2, cw, cd, 2.6 * (1 + (hr(seed, k + 300, ix) < 0.3 ? 1 : 0)), 'container'); var cc = hr(seed, k + 310, iy + ix * 7); b.roof = cc < 0.25 ? [170, 60, 50] : cc < 0.5 ? [50, 90, 150] : cc < 0.7 ? [214, 214, 210] : cc < 0.85 ? [60, 120, 80] : [200, 150, 50]; b.wall = [b.roof[0] * 0.8, b.roof[1] * 0.8, b.roof[2] * 0.8]; }
    } else if (u < 0.86) {                                               // plant: process buildings and machinery
      b = B(cx - bw * 0.15, cy, bw * 0.4, bh * 0.35, 14 + 6 * u2, 'plant'); b.roof = [150, 152, 150]; b.wall = [176, 176, 172];
      p = W2(cx + bw * 0.2, cy - bh * 0.1); L.tanks.push({ x: p[0], y: p[1], r: 4.5, h: 26 + 10 * u2, stack: true });
      L.patches.push({ kind: 'lot', x0: x0 + 2, y0: y0 + 2, x1: x1 - 2, y1: y1 - 2, W2: W2 });
    } else L.patches.push({ kind: 'lot', x0: x0 + 2, y0: y0 + 2, x1: x1 - 2, y1: y1 - 2, W2: W2 });
    if (hr(seed, ix + 320, iy + 321) < 0.4) { p = W2(x0 + 6, y0 - 7.5); L.people.push({ x: p[0], y: p[1], ph: hr(seed, ix + 322, iy), col: hr(seed, ix + 323, iy + 324) }); }
  }
  function genDesert(o, L) {
    var seed = o.sceneSeed, ext = L.ext, ang = hr(seed, 11, 11) * PI, c = cos(ang), s = sin(ang), k, n, p, b, W2 = function (lx, ly) { return rotp(lx, ly, c, s); };
    L.rot = ang;
    var off = (hr(seed, 12, 12) - 0.5) * ext * 0.7, a = W2(-ext * 2, off), d = W2(ext * 2, off);
    addRoad(L, a[0], a[1], d[0], d[1], 6.5, 'track', -1, 0);
    // a labour camp or a worksite: rows of prefab cabins
    var campX = (hr(seed, 13, 13) - 0.5) * ext * 0.6, campY = off + (hr(seed, 14, 14) < 0.5 ? -1 : 1) * (26 + 18 * hr(seed, 15, 15)), rows = 2, cols = 5;
    for (var r = 0; r < rows; r++) for (k = 0; k < cols; k++) { p = W2(campX + (k - cols / 2) * 14, campY + r * 11 * (campY > off ? 1 : -1)); b = addBld(L, p[0], p[1], 10, 3.2, ang, 3.2, 'cabin'); b.roof = [226, 226, 222]; b.wall = [210, 210, 204]; b.ac.push({ x: 2, y: 0 }); }
    p = W2(campX + 42, campY + 8); b = addBld(L, p[0], p[1], 16, 9, ang, 6, 'shed'); b.roof = [160, 164, 168]; b.wall = [182, 184, 186]; b.ac.push({ x: 0, y: 0 });
    n = 8; for (k = 0; k < n; k++) { p = W2(campX + (hr(seed, k + 20, 1) - 0.5) * 100, campY + (hr(seed, k + 30, 2) - 0.5) * 50); L.veh.push({ x: p[0], y: p[1], ang: hr(seed, k + 40, 3) * 6, len: k % 3 === 0 ? 5.6 : 4.4, wid: 2, col: k % 3 === 0 ? [236, 190, 40] : carColor(hr(seed, k + 50, 4)), moving: false, truck: k % 3 === 0 }); }
    for (k = 0; k < 5; k++) { p = W2((hr(seed, k + 60, 5) - 0.5) * ext * 1.4, (hr(seed, k + 70, 6) - 0.5) * ext * 1.4); L.trees.push({ x: p[0], y: p[1], r: 1.6 + hr(seed, k + 80, 7), scrub: true }); }
    for (k = 0; k < 3; k++) { p = W2(campX + (k - 1) * 20, campY - 6); L.people.push({ x: p[0], y: p[1], ph: hr(seed, k + 90, 8), col: hr(seed, k + 100, 9) }); }
  }
  function genRoad(o, L) {
    var seed = o.sceneSeed, ext = L.ext, ang = hr(seed, 21, 21) * PI, c = cos(ang), s = sin(ang), W2 = function (lx, ly) { return rotp(lx, ly, c, s); }, k, p, a, d, off = (hr(seed, 22, 22) - 0.5) * 30;
    L.rot = ang;
    a = W2(-ext * 2, off); d = W2(ext * 2, off); addRoad(L, a[0], a[1], d[0], d[1], 24, 'highway', -1, 0);
    L.items.push({ kind: 'median', x0: a[0], y0: a[1], x1: d[0], y1: d[1], w: 1.8 });
    for (k = 0; k < 7; k++) { var lane = k % 2 ? 1 : -1, u = hr(seed, k + 30, 31); p = W2(-ext + 2 * ext * u, off + lane * (3.2 + 3.4 * (k % 3))); L.veh.push({ x: p[0], y: p[1], ang: ang + (lane < 0 ? 0 : PI), len: k % 3 === 0 ? 10 : 4.4, wid: k % 3 === 0 ? 2.5 : 1.8, col: k % 3 === 0 ? [220, 220, 216] : carColor(hr(seed, k + 40, 41)), moving: true, speed: 18 + 8 * hr(seed, k + 50, 51), truck: k % 3 === 0, lane: lane, base: off }); }
    p = W2(26, off + 24); var b = addBld(L, p[0], p[1], 9, 7, ang, 4.5, 'kiosk'); b.roof = [180, 184, 188]; b.wall = [214, 210, 202]; b.ac.push({ x: 0, y: 0 });
    for (k = 0; k < 3; k++) { p = W2(26 + k * 7 - 7, off + 34); pushCar(L, p[0], p[1], ang + PI / 2, false, hr(seed, k + 60, 61)); }
    L.people.push({ x: W2(22, off + 20)[0], y: W2(22, off + 20)[1], ph: 0.3, col: 0.5 });
  }
  // the anchor: the thing the hazard is on; the whole layout is then shifted so the anchor is the world origin (the camera looks at the hazard)
  function nearestBld(L, filter, maxD) {
    var best = null, bd = maxD || 1e9, i, b, d;
    for (i = 0; i < L.bld.length; i++) { b = L.bld[i]; if (filter && !filter(b)) continue; d = sqrt(b.cx * b.cx + b.cy * b.cy); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  function nearestRoadPoint(L) {
    var best = null, bd = 1e9, i, r, dx, dy, ll, t, px, py, d;
    for (i = 0; i < L.roads.length; i++) {
      r = L.roads[i]; dx = r.x1 - r.x0; dy = r.y1 - r.y0; ll = dx * dx + dy * dy; t = clamp(-(r.x0 * dx + r.y0 * dy) / ll, 0, 1); px = r.x0 + dx * t; py = r.y0 + dy * t; d = sqrt(px * px + py * py);
      if (d < bd) { bd = d; best = { x: px, y: py, road: r, ang: atan2(dy, dx), d: d }; }
    }
    return best;
  }
  function shiftLayout(L, ax, ay) {
    var i, j, b;
    for (i = 0; i < L.roads.length; i++) { b = L.roads[i]; b.x0 -= ax; b.x1 -= ax; b.y0 -= ay; b.y1 -= ay; }
    for (i = 0; i < L.bld.length; i++) { b = L.bld[i]; b.cx -= ax; b.cy -= ay; for (j = 0; j < 8; j += 2) { b.pts[j] -= ax; b.pts[j + 1] -= ay; } if (b.wallPts) for (j = 0; j < 8; j += 2) { b.wallPts[j] -= ax; b.wallPts[j + 1] -= ay; } }
    ['veh', 'trees', 'people', 'tanks', 'lamps'].forEach(function (k) { for (var q = 0; q < L[k].length; q++) { L[k][q].x -= ax; L[k][q].y -= ay; } });
    for (i = 0; i < L.items.length; i++) { b = L.items[i]; if (b.x0 !== undefined) { b.x0 -= ax; b.x1 -= ax; b.y0 -= ay; b.y1 -= ay; } if (b.x !== undefined) { b.x -= ax; b.y -= ay; } }
    for (i = 0; i < L.patches.length; i++) { L.patches[i].dx = (L.patches[i].dx || 0) - ax; L.patches[i].dy = (L.patches[i].dy || 0) - ay; }
    if (L.sea) L.sea.c -= (L.sea.nx * ax + L.sea.ny * ay);
  }
  function chooseAnchor(o, L) {
    var hz = o.hazard, decoy = o.decoy, seed = o.sceneSeed, b = null, rp, ax = 0, ay = 0, info = { kind: 'point' };
    var needsBld = hz === 'fire' || hz === 'dust' || hz === 'none' || decoy === 'machinery' || decoy === 'glare';
    if (decoy === 'glare') {
      b = nearestBld(L, function (x) { return x.kind === 'tower'; }, 140);
      if (!b) { b = nearestBld(L, function (x) { return x.w > 10 && x.d > 10 && x.kind !== 'container' && x.kind !== 'cabin'; }, 140); if (b) { b.kind = 'tower'; b.glass = true; b.h = 70 + 30 * hr(seed, 31, 32); b.wall = [96, 124, 150]; b.roof = [168, 172, 178]; } }
      if (!b) { b = addBld(L, 20, 18, 24, 24, L.rot, 85, 'tower', { roof: [168, 172, 178], wall: [96, 124, 150] }); }
    } else if (decoy === 'machinery') {
      rp = nearestRoadPoint(L); var mx = rp ? rp.x + 18 : 18, my = rp ? rp.y + 18 : 18;
      b = addBld(L, mx, my, 11, 6.5, L.rot, 5.5, 'machinery', { roof: [112, 108, 104], wall: [136, 132, 126] }); L.tanks.push({ x: mx + 4, y: my - 1, r: 1.4, h: 13, stack: true, hotTop: true });
      L.patches.push({ kind: 'lot', x0: mx - 18, y0: my - 14, x1: mx + 18, y1: my + 14, W2: null, abs: true });
    } else if (decoy === 'red-truck') {
      rp = nearestRoadPoint(L);
      var tw = rp ? rp.road.w : 8, dir = rp ? rp.ang : 0, moving = hr(seed, 41, 42) < 0.5;
      L.truck = { x: rp ? rp.x : 0, y: rp ? rp.y : 0, ang: dir, moving: moving, speed: 3 + 4 * hr(seed, 43, 44), lane: (hr(seed, 45, 46) < 0.5 ? -1 : 1) * tw * 0.22, road: rp ? rp.road : null };
      ax = L.truck.x; ay = L.truck.y; info = { kind: 'truck' };
    } else if (hz === 'fire' || hz === 'gas' || needsBld) {
      var wantTank = hz === 'gas' && L.tanks.length;
      if (wantTank) { var bt = null, bd = 1e9; L.tanks.forEach(function (t) { var d = sqrt(t.x * t.x + t.y * t.y); if (d < bd) { bd = d; bt = t; } }); if (bt) { bt.gas = true; ax = bt.x; ay = bt.y; info = { kind: 'tank', tank: bt }; } }
      if (info.kind === 'point') {
        b = nearestBld(L, function (x) { return x.w * x.d >= 120 && x.w * x.d <= 1500 && x.kind !== 'container' && x.kind !== 'cabin'; }, 120) || nearestBld(L, function (x) { return x.w * x.d >= 60 && x.kind !== 'container' && x.kind !== 'cabin'; }, 120);
        if (!b) { rp = nearestRoadPoint(L); var sx = rp ? rp.x + 16 : 14, sy = rp ? rp.y + 16 : 14; b = addBld(L, sx, sy, 14, 9, L.rot, 5, 'shed', { roof: [168, 172, 176], wall: [190, 190, 186] }); b.ac.push({ x: 0, y: 0 }); }
        if (hz === 'gas' && o.context !== 'industrial') { L.tanks.push({ x: b.cx + b.w * 0.6 + 6, y: b.cy, r: 3.2, h: 6, gas: true }); var gt = L.tanks[L.tanks.length - 1]; ax = gt.x; ay = gt.y; info = { kind: 'tank', tank: gt }; b = null; }
      }
    } else if (hz === 'flood') {
      rp = nearestRoadPoint(L); ax = rp ? rp.x : 0; ay = rp ? rp.y : 0; info = { kind: 'basin' };
    } else if (hz === 'sos' || hz === 'heat') {
      rp = nearestRoadPoint(L);
      if (rp) { var side = hr(seed, 51, 52) < 0.5 ? -1 : 1, nx = -sin(rp.ang) * side, ny = cos(rp.ang) * side, off = rp.road.w / 2 + 3.2; ax = rp.x + nx * off; ay = rp.y + ny * off; }
      info = { kind: 'person' };
    }
    if (b && info.kind === 'point') { ax = b.cx; ay = b.cy; info = { kind: 'building', bld: b }; }
    if (hz === 'fire' && info.kind === 'point') info = { kind: 'point' };
    L.anchorShift = { x: ax, y: ay };
    shiftLayout(L, ax, ay);
    L.anchor = info;
    if (info.kind === 'truck') { L.truck.x = 0; L.truck.y = 0; }
  }

  /* ====================================================================================
   * 4. THE STATIC LAYER: terrain, patches, roads, shadows, buildings, vehicles, trees, light  (+ the material layer the thermal camera reads)
   * ==================================================================================== */
  function tint(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
  function buildStatic(S) {
    var o = S.o, L = S.L, cam = S.cam, W = o.width, H = o.height, N = W * H, buf = new U8C(N * 4), mat = new U8(N), B = { W: W, H: H, buf: buf, mat: mat }, seed = o.sceneSeed, i, j, k, x, y, p, m;
    var sun = o.sun, day = smooth(0, 0.22, sun.solar), urban = o.context === 'urban' || o.context === 'industrial' || o.context === 'coast';
    var hgt = o.hazard === 'flood' ? new F32(N) : null, oa = hr(seed, 91, 1) * 100, ob = hr(seed, 92, 2) * 100, oc = hr(seed, 93, 3) * 100, od = hr(seed, 94, 4) * 100, sea = L.sea;
    // --- terrain: sand / hard pan with dune ridges (per pixel, incremental world coordinates), the sea on a coast
    var w00 = cam.world(0.5, 0.5), w10 = cam.world(1.5, 0.5), w01 = cam.world(0.5, 1.5), dEx = w10[0] - w00[0], dNx = w10[1] - w00[1], dEy = w01[0] - w00[0], dNy = w01[1] - w00[1], E, Nn, E0 = w00[0], N0 = w00[1];
    var baseA = urban ? [196, 184, 164] : SAND, grainSeed = seed | 0, seaN = 0;
    for (y = 0; y < H; y++, E0 += dEy, N0 += dNy) {
      E = E0; Nn = N0; p = y * W * 4; m = y * W;
      for (x = 0; x < W; x++, E += dEx, Nn += dNx, p += 4, m++) {
        var n1 = vnoise(E * 0.018 + oa, Nn * 0.018 + ob), n2 = vnoise(E * 0.11 + oc, Nn * 0.11 + od), gr = ((hash32(imul(x, 73856093) ^ imul(y, 19349663) ^ grainSeed) & 255) / 255 - 0.5), ridge = 1 - abs(n1 * 2 - 1);
        var v = (n1 - 0.5) * 34 + (n2 - 0.5) * 16 + gr * 7 - ridge * ridge * 12, r = baseA[0] + v, g = baseA[1] + v * 0.92, b = baseA[2] + v * 0.8, mt = n1 < 0.38 ? MAT.PAN : MAT.SAND;
        if (n1 < 0.38) { r -= 14; g -= 16; b -= 16; }
        if (sea) {
          var sd = sea.nx * E + sea.ny * Nn - sea.c - 6 * (vnoise(E * 0.03 + sea.seed, Nn * 0.03) - 0.5) * 2;
          if (sd > 0) {
            var dp = min(1, sd / 60), wave = 0.5 + 0.5 * sin((E * 0.8 + Nn * 1.2) * 0.45 + n2 * 6), foam = sd < 2.2 ? (1 - sd / 2.2) : 0;
            r = lerp(78, 22, dp) + wave * 9 + foam * 170; g = lerp(176, 84, dp) + wave * 10 + foam * 170; b = lerp(178, 122, dp) + wave * 8 + foam * 160; mt = MAT.WATER;
          } else if (sd > -22) { var ws = smooth(-22, 0, sd); r = lerp(r, 222, ws * 0.6); g = lerp(g, 206, ws * 0.6); b = lerp(b, 168, ws * 0.6); }
        }
        buf[p] = r; buf[p + 1] = g; buf[p + 2] = b; buf[p + 3] = 255; mat[m] = mt;
        if (hgt) hgt[m] = clamp(sqrt(E * E + Nn * Nn) / 95, 0, 1.3) * 0.78 + (n1 - 0.5) * 0.34 + (n2 - 0.5) * 0.1;
      }
    }
    // --- ground patches (lots, grass)
    for (i = 0; i < L.patches.length; i++) {
      var pa = L.patches[i], c4 = [[pa.x0, pa.y0], [pa.x1, pa.y0], [pa.x1, pa.y1], [pa.x0, pa.y1]], P = [];
      for (j = 0; j < 4; j++) { var wq = pa.W2 ? pa.W2(c4[j][0], c4[j][1]) : [c4[j][0], c4[j][1]]; var ex = wq[0] + (pa.dx || 0) - (pa.abs ? 0 : 0), ey = wq[1] + (pa.dy || 0); if (pa.abs) { ex = wq[0] - L.anchorShift.x; ey = wq[1] - L.anchorShift.y; } P.push(cam.px(ex, ey, 0), cam.py(ex, ey, 0)); }
      var col = pa.kind === 'grass' ? [92, 128, 66] : [128, 126, 122];
      quad(B, P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], col[0], col[1], col[2], 1, pa.kind === 'grass' ? MAT.VEG : MAT.CONCRETE);
      if (pa.kind === 'lot') { quad(B, P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], 150, 148, 142, 0.35, -1); }
    }
    // --- roads: sidewalks, asphalt, markings
    var roadCol = [66, 68, 72], sideCol = [188, 183, 172];
    var rq = function (r, w, cr, cg, cb, a, mt) {
      var dx = r.x1 - r.x0, dy = r.y1 - r.y0, ll = sqrt(dx * dx + dy * dy) || 1, nx = -dy / ll * w / 2, ny = dx / ll * w / 2;
      quad(B, cam.px(r.x0 + nx, r.y0 + ny, 0), cam.py(r.x0 + nx, r.y0 + ny, 0), cam.px(r.x1 + nx, r.y1 + ny, 0), cam.py(r.x1 + nx, r.y1 + ny, 0), cam.px(r.x1 - nx, r.y1 - ny, 0), cam.py(r.x1 - nx, r.y1 - ny, 0), cam.px(r.x0 - nx, r.y0 - ny, 0), cam.py(r.x0 - nx, r.y0 - ny, 0), cr, cg, cb, a, mt);
    };
    for (i = 0; i < L.roads.length; i++) if (L.roads[i].kind !== 'track') rq(L.roads[i], L.roads[i].w + 6, sideCol[0], sideCol[1], sideCol[2], 1, MAT.CONCRETE);
    for (i = 0; i < L.roads.length; i++) {
      var rd = L.roads[i]; if (rd.kind === 'track') rq(rd, rd.w + 2.4, 196, 176, 138, 0.8, MAT.PAN);
      rq(rd, rd.w, rd.kind === 'track' ? 150 : roadCol[0], rd.kind === 'track' ? 136 : roadCol[1], rd.kind === 'track' ? 112 : roadCol[2], 1, rd.kind === 'track' ? MAT.PAN : MAT.ASPHALT);
    }
    var lineW = max(0.35, 1.15 * cam.mpp / max(0.4, cam.sp));
    for (i = 0; i < L.roads.length; i++) {
      var r2 = L.roads[i]; if (r2.kind === 'track') continue;
      var dx2 = r2.x1 - r2.x0, dy2 = r2.y1 - r2.y0, len = sqrt(dx2 * dx2 + dy2 * dy2), ux2 = dx2 / len, uy2 = dy2 / len, vx2 = -uy2, vy2 = ux2, step = 9, dash = 4.5, sA = len / 2 - (L.ext * 1.6), sB = len / 2 + (L.ext * 1.6), s;
      var nEdge = r2.kind === 'street' ? 0 : 1;
      for (s = max(0, sA); s < min(len, sB); s += step) {
        var mx2 = r2.x0 + ux2 * (s + dash / 2), my2 = r2.y0 + uy2 * (s + dash / 2);
        if (r2.fam >= 0 && crossesRoad(L, r2, mx2, my2)) continue;
        var cxp = cam.px(mx2, my2, 0), cyp = cam.py(mx2, my2, 0); if (cxp < -20 || cxp > W + 20 || cyp < -20 || cyp > H + 20) continue;
        var ax1 = r2.x0 + ux2 * s, ay1 = r2.y0 + uy2 * s, ax2 = r2.x0 + ux2 * (s + dash), ay2 = r2.y0 + uy2 * (s + dash), hw = lineW / 2;
        if (r2.kind === 'highway') { var lw = 3.4; for (var ln = -3; ln <= 3; ln++) { if (ln === 0) continue; var off = ln * lw; quad(B, cam.px(ax1 + vx2 * (off - hw), ay1 + vy2 * (off - hw), 0), cam.py(ax1 + vx2 * (off - hw), ay1 + vy2 * (off - hw), 0), cam.px(ax2 + vx2 * (off - hw), ay2 + vy2 * (off - hw), 0), cam.py(ax2 + vx2 * (off - hw), ay2 + vy2 * (off - hw), 0), cam.px(ax2 + vx2 * (off + hw), ay2 + vy2 * (off + hw), 0), cam.py(ax2 + vx2 * (off + hw), ay2 + vy2 * (off + hw), 0), cam.px(ax1 + vx2 * (off + hw), ay1 + vy2 * (off + hw), 0), cam.py(ax1 + vx2 * (off + hw), ay1 + vy2 * (off + hw), 0), 226, 226, 220, 0.9, -1); } }
        else quad(B, cam.px(ax1 + vx2 * -hw, ay1 + vy2 * -hw, 0), cam.py(ax1 + vx2 * -hw, ay1 + vy2 * -hw, 0), cam.px(ax2 + vx2 * -hw, ay2 + vy2 * -hw, 0), cam.py(ax2 + vx2 * -hw, ay2 + vy2 * -hw, 0), cam.px(ax2 + vx2 * hw, ay2 + vy2 * hw, 0), cam.py(ax2 + vx2 * hw, ay2 + vy2 * hw, 0), cam.px(ax1 + vx2 * hw, ay1 + vy2 * hw, 0), cam.py(ax1 + vx2 * hw, ay1 + vy2 * hw, 0), r2.kind === 'main' ? 232 : 216, r2.kind === 'main' ? 214 : 214, r2.kind === 'main' ? 120 : 206, 0.9, -1);
      }
    }
    for (i = 0; i < L.items.length; i++) if (L.items[i].kind === 'median') { var it = L.items[i]; rq({ x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 }, it.w, 150, 150, 146, 1, MAT.CONCRETE); }
    // --- shadows (one mask, darkened in a single pass, so overlapping shadows do not double up)
    var sh = new U8(N), SB = { W: W, H: H, buf: new U8C(4), mat: sh }, sdx = -sin(sun.az * DEG), sdy = -cos(sun.az * DEG), shLen = sun.elev > 0.02 ? min(4, 1 / tan(max(0.15, sun.elev))) : 0;
    SB.buf = null;
    if (shLen > 0) {
      var shadowPoly = function (pts4, h) {
        var sx = sdx * shLen * h, sy = sdy * shLen * h, q;
        for (var e = 0; e < 4; e++) {
          var a1 = pts4[2 * e], b1 = pts4[2 * e + 1], a2 = pts4[2 * ((e + 1) % 4)], b2 = pts4[2 * ((e + 1) % 4) + 1];
          PT[0] = cam.px(a1, b1, 0); PT[1] = cam.py(a1, b1, 0); PT[2] = cam.px(a2, b2, 0); PT[3] = cam.py(a2, b2, 0); PT[4] = cam.px(a2 + sx, b2 + sy, 0); PT[5] = cam.py(a2 + sx, b2 + sy, 0); PT[6] = cam.px(a1 + sx, b1 + sy, 0); PT[7] = cam.py(a1 + sx, b1 + sy, 0);
          fillShade(SB, PT, 4);
        }
        for (q = 0; q < 4; q++) { PT[2 * q] = cam.px(pts4[2 * q] + sx, pts4[2 * q + 1] + sy, 0); PT[2 * q + 1] = cam.py(pts4[2 * q] + sx, pts4[2 * q + 1] + sy, 0); }
        fillShade(SB, PT, 4);
      };
      for (i = 0; i < L.bld.length; i++) { var bb = L.bld[i]; if (bb.kind === 'container' && bb.h < 3) continue; shadowPoly(bb.pts, bb.h); }
      for (i = 0; i < L.veh.length; i++) { var vv = L.veh[i]; if (vv.moving) continue; var vp = carPts(vv.x, vv.y, vv.ang, vv.len, vv.wid); shadowPoly(vp, 1.5); }
      for (i = 0; i < L.trees.length; i++) { var tr = L.trees[i]; if (tr.scrub) continue; var tpx = cam.px(tr.x + sdx * shLen * 5, tr.y + sdy * shLen * 5, 0), tpy = cam.py(tr.x + sdx * shLen * 5, tr.y + sdy * shLen * 5, 0); fillEllipse({ W: W, H: H, buf: new U8C(0), mat: sh }, tpx, tpy, tr.r * cam.k, tr.r * cam.k * cam.sp, 0, 0, 0, 1, 1); }
      for (i = 0; i < L.tanks.length; i++) { var tk = L.tanks[i], hxy = tk.h * shLen; var cxs = cam.px(tk.x + sdx * hxy / 2, tk.y + sdy * hxy / 2, 0), cys = cam.py(tk.x + sdx * hxy / 2, tk.y + sdy * hxy / 2, 0); fillEllipse({ W: W, H: H, buf: new U8C(0), mat: sh }, cxs, cys, (tk.r + hxy / 2) * cam.k, (tk.r + hxy / 2) * cam.k * cam.sp, 0, 0, 0, 1, 1); }
    }
    var shadeK = 0.58 + 0.2 * (1 - day);
    for (i = 0, p = 0; i < N; i++, p += 4) if (sh[i]) { buf[p] *= shadeK; buf[p + 1] *= shadeK; buf[p + 2] *= shadeK * 1.04; mat[i] |= MAT.SHADE_BIT; }
    // --- buildings (far to near), walls then roofs
    var order = L.bld.slice().sort(function (a, b) { return (b.cx * cam.ux + b.cy * cam.uy) - (a.cx * cam.ux + a.cy * cam.uy); });
    for (i = 0; i < order.length; i++) drawBuilding(B, S, order[i], sun, day);
    // --- tanks and stacks
    var tanks = L.tanks.slice().sort(function (a, b) { return (b.x * cam.ux + b.y * cam.uy) - (a.x * cam.ux + a.y * cam.uy); });
    for (i = 0; i < tanks.length; i++) drawTank(B, cam, tanks[i], sun);
    // --- parked vehicles, trees
    for (i = 0; i < L.veh.length; i++) if (!L.veh[i].moving) drawVehicle(B, cam, L.veh[i], L.veh[i].x, L.veh[i].y, L.veh[i].ang, false);
    for (i = 0; i < L.trees.length; i++) drawTree(B, cam, L.trees[i]);
    // --- the light: exposure, colour temperature; at night lamps and lit windows
    applyLight(buf, N, o, day);
    if (day < 0.6) { var lampA = 1 - day; for (i = 0; i < L.lamps.length; i++) { var lp = L.lamps[i], lx = cam.px(lp.x, lp.y, 8), ly = cam.py(lp.x, lp.y, 8); if (lx > -8 && lx < W + 8 && ly > -8 && ly < H + 8) { addGlow(buf, W, H, lx, ly, 9, 255, 190, 90, 0.55 * lampA); fillEllipse(B, lx, ly, 1.1, 1.1, 255, 230, 160, 1, -1); } } }
    return { buf: buf, mat: mat, hgt: hgt, sh: sh };
  }
  function crossesRoad(L, r, x, y) {                    // is (x, y) inside a road of the other lattice family (skip markings in junctions)?
    var q, k;
    for (k = 0; k < L.roads.length; k++) { q = L.roads[k]; if (q.fam === r.fam || q.fam < 0) continue; var dx = q.x1 - q.x0, dy = q.y1 - q.y0, ll = sqrt(dx * dx + dy * dy), d = abs((x - q.x0) * dy - (y - q.y0) * dx) / ll; if (d < q.w / 2 + 1.2) return true; }
    return false;
  }
  function fillShade(SB, pts, n) {
    var W = SB.W, H = SB.H, mb = SB.mat, ymin = 1e9, ymax = -1e9, i, j, y, yc, lo, hi, x, x0, x1, ya, yb, t, m;
    for (i = 0; i < n; i++) { y = pts[2 * i + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    var y0 = max(0, ceil(ymin - 0.5)), y1 = min(H - 1, floor(ymax - 0.5));
    for (y = y0; y <= y1; y++) {
      yc = y + 0.5; lo = 1e9; hi = -1e9;
      for (i = 0; i < n; i++) { j = i + 1 === n ? 0 : i + 1; ya = pts[2 * i + 1]; yb = pts[2 * j + 1]; if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) { t = (yc - ya) / (yb - ya); x = pts[2 * i] + (pts[2 * j] - pts[2 * i]) * t; if (x < lo) lo = x; if (x > hi) hi = x; } }
      if (lo > hi) continue;
      x0 = max(0, ceil(lo - 0.5)); x1 = min(W - 1, floor(hi - 0.5)); m = y * W + x0;
      for (x = x0; x <= x1; x++) mb[m++] = 1;
    }
  }
  function carPts(x, y, ang, len, wid) {
    var c = cos(ang), s = sin(ang), hl = len / 2, hw = wid / 2, out = [], k, q, xs = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
    for (k = 0; k < 4; k++) { q = rotp(xs[k][0], xs[k][1], c, s); out.push(x + q[0], y + q[1]); }
    return out;
  }
  function drawVehicle(B, cam, v, x, y, ang, thermalHot) {
    var pts = carPts(x, y, ang, v.len, v.wid), h = v.truck ? 3.2 : 1.45, i, c = v.col, top = [];
    for (i = 0; i < 4; i++) top.push(cam.px(pts[2 * i], pts[2 * i + 1], h), cam.py(pts[2 * i], pts[2 * i + 1], h));
    // body sides (a little darker), then the roof, then the windscreen
    var base = []; for (i = 0; i < 4; i++) base.push(cam.px(pts[2 * i], pts[2 * i + 1], 0), cam.py(pts[2 * i], pts[2 * i + 1], 0));
    for (i = 0; i < 4; i++) { var j = (i + 1) % 4; quad(B, base[2 * i], base[2 * i + 1], base[2 * j], base[2 * j + 1], top[2 * j], top[2 * j + 1], top[2 * i], top[2 * i + 1], c[0] * 0.62, c[1] * 0.62, c[2] * 0.62, 1, MAT.VEHICLE); }
    fillPoly(B, top, 4, c[0], c[1], c[2], 1, MAT.VEHICLE);
    var fx = (top[2] + top[4]) / 2, fy = (top[3] + top[5]) / 2, bx = (top[0] + top[6]) / 2, by = (top[1] + top[7]) / 2;
    if (!v.truck) quad(B, lerp(top[0], top[2], 0.22) * 0.5 + lerp(top[6], top[4], 0.22) * 0.5 - 0, lerp(top[1], top[3], 0.22) * 0.5 + lerp(top[7], top[5], 0.22) * 0.5, lerp(top[0], top[2], 0.5) * 0.5 + lerp(top[6], top[4], 0.5) * 0.5, lerp(top[1], top[3], 0.5) * 0.5 + lerp(top[7], top[5], 0.5) * 0.5, lerp(top[0], top[2], 0.5) * 0.5 + lerp(top[6], top[4], 0.5) * 0.5, lerp(top[1], top[3], 0.5) * 0.5 + lerp(top[7], top[5], 0.5) * 0.5, lerp(top[0], top[2], 0.22) * 0.5 + lerp(top[6], top[4], 0.22) * 0.5, lerp(top[1], top[3], 0.22) * 0.5 + lerp(top[7], top[5], 0.22) * 0.5, 40, 48, 58, 0.0, -1);
  }
  function drawTree(B, cam, t) {
    var x = cam.px(t.x, t.y, 0), y = cam.py(t.x, t.y, 2.2), rpx = t.r * cam.k;
    if (x < -rpx - 4 || x > B.W + rpx + 4 || y < -rpx - 4 || y > B.H + rpx + 4) return;
    if (t.scrub) { fillEllipse(B, x, y, rpx, rpx * cam.sp, 120, 126, 82, 1, MAT.VEG); return; }
    fillEllipse(B, x, y, rpx, rpx * (0.5 + 0.5 * cam.sp), 58, 94, 48, 1, MAT.VEG);
    fillEllipse(B, x, y - rpx * 0.12, rpx * 0.62, rpx * 0.62 * (0.5 + 0.5 * cam.sp), 88, 128, 62, 1, MAT.VEG);
    fillEllipse(B, x, y - rpx * 0.12, rpx * 0.18, rpx * 0.18, 150, 120, 70, 1, MAT.VEG);
  }
  function drawTank(B, cam, t, sun) {
    var bx = cam.px(t.x, t.y, 0), by = cam.py(t.x, t.y, 0), tx = cam.px(t.x, t.y, t.h), ty = cam.py(t.x, t.y, t.h), rx = t.r * cam.k, ry = t.r * cam.k * cam.sp, body = t.stack ? [184, 168, 150] : [196, 198, 200];
    if (t.stack) { rx = max(1.2, rx); ry = max(1.0, ry); }
    quad(B, bx - rx, by, bx + rx, by, tx + rx, ty, tx - rx, ty, body[0] * 0.78, body[1] * 0.78, body[2] * 0.78, 1, MAT.METAL);
    fillEllipse(B, bx, by, rx, ry, body[0] * 0.78, body[1] * 0.78, body[2] * 0.78, 1, MAT.METAL);
    quad(B, bx - rx, by, bx + rx, by, tx + rx, ty, tx - rx, ty, body[0] * 0.8, body[1] * 0.8, body[2] * 0.8, 1, MAT.METAL);
    fillEllipse(B, tx, ty, rx, ry, body[0], body[1], body[2], 1, MAT.METAL);
    if (!t.stack) { fillEllipse(B, tx, ty, rx * 0.78, ry * 0.78, body[0] * 0.9, body[1] * 0.9, body[2] * 0.9, 1, -1); fillEllipse(B, tx + rx * 0.1, ty - ry * 0.1, rx * 0.2, ry * 0.2, 120, 124, 128, 1, MAT.HOT); }
    else fillEllipse(B, tx, ty, rx * 0.6, ry * 0.6, 60, 58, 56, 1, t.hotTop ? MAT.HOT : MAT.METAL);
  }
  function drawBuilding(B, S, b, sun, day) {
    var cam = S.cam, pts = b.pts, h = b.h, i, j, base = [], top = [], roof = b.roof || [190, 186, 176], wall = b.wall || [214, 202, 180], W = B.W, H = B.H;
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (i = 0; i < 4; i++) { base.push(cam.px(pts[2 * i], pts[2 * i + 1], 0), cam.py(pts[2 * i], pts[2 * i + 1], 0)); top.push(cam.px(pts[2 * i], pts[2 * i + 1], h), cam.py(pts[2 * i], pts[2 * i + 1], h)); }
    for (i = 0; i < 8; i += 2) { minx = min(minx, base[i], top[i]); maxx = max(maxx, base[i], top[i]); miny = min(miny, base[i + 1], top[i + 1]); maxy = max(maxy, base[i + 1], top[i + 1]); }
    if (maxx < 0 || minx > W || maxy < 0 || miny > H) return;
    // villa garden wall (a thin low wall around the plot)
    if (b.wallPts) {
      var wq = b.wallPts, e;
      for (e = 0; e < 4; e++) { var e2 = (e + 1) % 4; quad(B, cam.px(wq[2 * e], wq[2 * e + 1], 2.2), cam.py(wq[2 * e], wq[2 * e + 1], 2.2), cam.px(wq[2 * e2], wq[2 * e2 + 1], 2.2), cam.py(wq[2 * e2], wq[2 * e2 + 1], 2.2), cam.px(wq[2 * e2], wq[2 * e2 + 1], 0), cam.py(wq[2 * e2], wq[2 * e2 + 1], 0), cam.px(wq[2 * e], wq[2 * e + 1], 0), cam.py(wq[2 * e], wq[2 * e + 1], 0), 224, 214, 194, 1, MAT.CONCRETE); }
    }
    // walls: visible ones (outward normal facing the camera), far to near; shading from the sun direction
    var fwd = [cam.ux, cam.uy], walls = [], ccx = b.cx, ccy = b.cy;
    for (i = 0; i < 4; i++) {
      j = (i + 1) % 4; var ex = pts[2 * j] - pts[2 * i], ey = pts[2 * j + 1] - pts[2 * i + 1], el = sqrt(ex * ex + ey * ey) || 1, nx = ey / el, ny = -ex / el, mx = (pts[2 * i] + pts[2 * j]) / 2 - ccx, my = (pts[2 * i + 1] + pts[2 * j + 1]) / 2 - ccy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }                           // outward
      if (cam.cp > 0.02 && nx * fwd[0] + ny * fwd[1] < 0.02) walls.push({ i: i, j: j, nx: nx, ny: ny, depth: (mx * fwd[0] + my * fwd[1]) });     // faces the camera (the camera looks along fwd)
    }
    walls.sort(function (a, b) { return b.depth - a.depth; });
    for (i = 0; i < walls.length; i++) {
      var w = walls[i], lit = -(w.nx * sin(sun.az * DEG) + w.ny * cos(sun.az * DEG)), shade = 0.62 + 0.38 * clamp(-lit, 0, 1) * (sun.elev > 0.02 ? 1 : 0.4), wc2 = b.glass ? wall : wall;
      b.glass ? quad(B, base[2 * w.i], base[2 * w.i + 1], base[2 * w.j], base[2 * w.j + 1], top[2 * w.j], top[2 * w.j + 1], top[2 * w.i], top[2 * w.i + 1], wc2[0] * shade, wc2[1] * shade, wc2[2] * shade, 1, MAT.GLASS)
        : quad(B, base[2 * w.i], base[2 * w.i + 1], base[2 * w.j], base[2 * w.j + 1], top[2 * w.j], top[2 * w.j + 1], top[2 * w.i], top[2 * w.i + 1], wc2[0] * shade, wc2[1] * shade, wc2[2] * shade, 1, MAT.WALL);
      // window bands
      if (h > 6 && cam.cp > 0.12) {
        var nb = min(24, floor(h / 3.2));
        for (var f = 1; f < nb; f++) {
          var fz = f * h / nb, ax = lerp(base[2 * w.i], top[2 * w.i], f / nb), ay = lerp(base[2 * w.i + 1], top[2 * w.i + 1], f / nb), bx2 = lerp(base[2 * w.j], top[2 * w.j], f / nb), by2 = lerp(base[2 * w.j + 1], top[2 * w.j + 1], f / nb);
          quad(B, ax, ay, bx2, by2, bx2, by2 + 0.9, ax, ay + 0.9, wc2[0] * shade * 0.7, wc2[1] * shade * 0.7, wc2[2] * shade * 0.72, b.glass ? 0.6 : 0.4, -1);
        }
      }
      if (b.glass && S.o.decoy === 'glare' && b.id === S.glareId) S.glareWalls.push({ w: w, base: base.slice(), top: top.slice(), lit: lit });
    }
    // roof
    var rr = roof, rshade = 0.92 + 0.1 * smooth(0, 0.6, sun.solar);
    fillPoly(B, top, 4, rr[0] * rshade, rr[1] * rshade, rr[2] * rshade, 1, (rr[0] + rr[1] + rr[2]) / 3 > 185 ? MAT.ROOF_LIGHT : MAT.ROOF_DARK);
    // parapet outline
    for (i = 0; i < 4; i++) { j = (i + 1) % 4; quad(B, top[2 * i], top[2 * i + 1], top[2 * j], top[2 * j + 1], lerp(top[2 * j], (top[0] + top[2] + top[4] + top[6]) / 4, 0.06), lerp(top[2 * j + 1], (top[1] + top[3] + top[5] + top[7]) / 4, 0.06), lerp(top[2 * i], (top[0] + top[2] + top[4] + top[6]) / 4, 0.06), lerp(top[2 * i + 1], (top[1] + top[3] + top[5] + top[7]) / 4, 0.06), rr[0] * 0.8, rr[1] * 0.8, rr[2] * 0.8, 1, -1); }
    // roof equipment: air-conditioning units (hot in the thermal image)
    var rcn = cos(b.ang), rsn = sin(b.ang);
    for (i = 0; i < b.ac.length; i++) {
      var ac = b.ac[i], wx = b.cx + ac.x * rcn - ac.y * rsn, wy = b.cy + ac.x * rsn + ac.y * rcn, sx = cam.px(wx, wy, h), sy = cam.py(wx, wy, h), sz = max(1.2, 1.3 * cam.k);
      fillEllipse(B, sx, sy, sz * 0.9, sz * 0.7, 150, 154, 158, 1, MAT.HOT); fillEllipse(B, sx, sy - sz * 0.2, sz * 0.5, sz * 0.35, 96, 100, 104, 1, -1);
    }
    if (b.kind === 'villa' && b.ac.length) { var tx = cam.px(b.cx + b.w * 0.25, b.cy - b.d * 0.2, h), ty = cam.py(b.cx + b.w * 0.25, b.cy - b.d * 0.2, h + 1); fillEllipse(B, tx, ty, max(1.3, 1.1 * cam.k), max(1.1, 1.0 * cam.k * cam.sp), 40, 44, 50, 1, MAT.METAL); }
  }
  function applyLight(buf, N, o, day) {                  // exposure and colour temperature of the sun (warm and low near sunset, cold and dark at night)
    var sun = o.sun, amb = 0.21 + 0.79 * day, low = 1 - smooth(0.05, 0.6, sun.solar), rM = amb * (1 + 0.13 * low) * (day < 0.5 ? 0.85 : 1), gM = amb * (1 - 0.01 * low), bM = amb * (1 - 0.2 * low) * (day < 0.5 ? 1.25 : 1), i, p, v;
    if (day > 0.995 && low < 0.02) return;
    for (i = 0, p = 0; i < N; i++, p += 4) { buf[p] *= rM; buf[p + 1] *= gM; buf[p + 2] *= bM; }
  }
  /* ====================================================================================
   * 5. THE SCENE OBJECT: static layers cached; frames are the cached base + the dynamic hazard layers at time t
   * ==================================================================================== */
  var SCENE_CACHE = [], SCENE_CACHE_MAX = 6;
  function sceneKey(o) { return JSON.stringify([o.capC, o.sceneSeed, o.hazard, o.decoy, o.severity, o.flames, o.camera, o.timeOfDay, o.context, o.wind, o.ambientC, o.groundC, o.solar, o.visFactor, o.width, o.height]); }
  function create(desc) {
    var o = normalize(desc), key = sceneKey(o), i;
    for (i = 0; i < SCENE_CACHE.length; i++) if (SCENE_CACHE[i].key === key) return SCENE_CACHE[i].scene;
    var t0 = now(), S = { o: o, desc: desc || {}, cam: makeCam(o), glareWalls: [], glareId: -1 };
    S.L = buildLayout(o);
    if (o.decoy === 'glare' && S.L.anchor && S.L.anchor.bld) S.glareId = S.L.anchor.bld.id;
    S.layers = buildStatic(S);
    initHazard(S);
    S.buildMs = now() - t0;
    S.width = o.width; S.height = o.height;
    S.anchorInfo = { kind: S.L.anchor.kind, context: o.context, buildings: S.L.bld.length, vehicles: S.L.veh.length, trees: S.L.trees.length, roads: S.L.roads.length, tanks: S.L.tanks.length };
    S.stats = { buildMs: S.buildMs, flames: S.fire ? S.fire.clusters.length : 0, metresPerPixel: S.cam.mpp };
    S.renderRGB = function (t, opts) { return renderRGBFrame(S, t, opts); };
    S.renderThermal = function (t, opts) { return renderThermalFrame(S, t, opts); };
    S.renderFused = function (t) { return renderFusedFrame(S, t); };
    S.temperatureField = function (t) { return renderThermalFrame(S, t, {}).temps; };
    SCENE_CACHE.push({ key: key, scene: S }); if (SCENE_CACHE.length > SCENE_CACHE_MAX) SCENE_CACHE.shift();
    return S;
  }
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }

  // ---- hazard set-up (positions in world metres, the anchor is the origin)
  function initHazard(S) {
    var o = S.o, L = S.L, seed = o.sceneSeed, sev = o.severity, i, n, a = L.anchor, b = a.bld || null;
    S.fire = null; S.person = null; S.gas = null; S.flood = null; S.truck = L.truck || null;
    if (o.hazard === 'fire') {
      var cl = [], cn = [2, 3, 5][sev - 1], hh = b ? b.h : 0, rcn = b ? cos(b.ang) : 1, rsn = b ? sin(b.ang) : 0, bw = b ? b.w : 8, bd = b ? b.d : 5;
      for (i = 0; i < cn; i++) {
        var lx = (hr(seed, 400 + i, 1) - 0.5) * bw * 0.7, ly = (hr(seed, 410 + i, 2) - 0.5) * bd * 0.7, onRoof = !b || hr(seed, 420 + i, 3) < 0.7;
        cl.push({ x: b ? lx * rcn - ly * rsn : (hr(seed, 400 + i, 1) - 0.5) * 6, y: b ? lx * rsn + ly * rcn : (hr(seed, 410 + i, 2) - 0.5) * 6, z: onRoof ? hh : max(1, hh * 0.35 * hr(seed, 430 + i, 4)), scale: (0.7 + 0.6 * hr(seed, 440 + i, 5)) * (0.75 + 0.25 * sev), ph: hr(seed, 450 + i, 6) * 50 });
      }
      S.fire = { clusters: cl, hh: hh, flames: o.flames, burn: b ? { w: bw, d: bd } : null };
    } else if (o.hazard === 'sos' || o.hazard === 'heat') {
      S.person = { x: 0, y: 0, ang: hr(seed, 460, 1) * PI, helmet: o.hazard === 'heat' };
    } else if (o.hazard === 'gas') {
      S.gas = { x: 0, y: 0, len: 36 + 30 * sev, wid: 12 + 8 * sev };
    } else if (o.hazard === 'flood') S.flood = { w0: 0.16 + 0.08 * sev };
    if (o.decoy === 'machinery') S.machinery = { x: L.bld.length ? 0 : 0, y: 0 };
  }

  /* ====================================================================================
   * 6. DYNAMIC RGB LAYERS: moving vehicles and people, flood water, flames and smoke, glare, dust haze
   * ==================================================================================== */
  function windScreen(S) {                                 // the direction the smoke drifts, as a screen vector (right, down) and the world vector (E, N)
    var o = S.o, to = (o.wind.deg + 180) * DEG, vE = sin(to), vN = cos(to), cam = S.cam;
    return { vE: vE, vN: vN, sx: vE * cam.rx + vN * cam.ry, sy: -(vE * cam.ux + vN * cam.uy) * cam.sp };
  }
  function renderRGBFrame(S, t, opts) {
    var o = S.o, L = S.L, cam = S.cam, W = o.width, H = o.height, N = W * H, buf = new U8C(S.layers.buf), B = { W: W, H: H, buf: buf, mat: null }, i, j, p, tt = +t || 0;
    var day = smooth(0, 0.22, o.sun.solar), night = 1 - day;
    // flood water over the roads (not over roofs and walls): muddy water, fading at its edge, with slow ripples
    if (S.flood) {
      var hg = S.layers.hgt, mt = S.layers.mat, wl = clamp(S.flood.w0 + 0.0042 * tt + 0.05 * (o.severity - 1) * min(1, tt / 30), 0, 0.95), lit = 0.45 + 0.55 * day, ph0 = tt * 2.2;
      for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
        var q = j * W + i, hv = hg[q];
        if (hv >= wl) continue;
        var m0 = mt[q] & 15; if (m0 === MAT.ROOF_LIGHT || m0 === MAT.ROOF_DARK || m0 === MAT.WALL || m0 === MAT.GLASS || m0 === MAT.HOT || m0 === MAT.METAL) continue;
        var depth = (wl - hv) * 3, a = (0.5 + 0.22 * (depth > 1 ? 1 : depth)) * (0.35 + 0.65 * smooth(0, 0.035, wl - hv)), rip = SINT[((i * 0.5 + j * 0.3 + ph0 * 3) * 40) & 1023];
        var edge = 1 - smooth(0, 0.02, wl - hv); a = a * (1 + 0.25 * (depth > 1 ? 1 : depth)); p = q << 2; buf[p] = buf[p] * (1 - a) + (104 + rip * 34 + edge * 70) * lit * a; buf[p + 1] = buf[p + 1] * (1 - a) + (124 + rip * 32 + edge * 60) * lit * a; buf[p + 2] = buf[p + 2] * (1 - a) + (134 + rip * 30 + edge * 50) * lit * a;
      }
    }
    // moving vehicles
    for (i = 0; i < L.veh.length; i++) {
      var v = L.veh[i]; if (!v.moving) continue;
      var span = 2 * L.ext, s = ((hr(o.sceneSeed, 500 + i, 1) * span + v.speed * tt) % span) - L.ext, dirx = cos(L.rot), diry = sin(L.rot), lane = v.lane || 0;
      var vx = -diry * 0 + dirx * s * (v.lane < 0 ? 1 : -1) + (-diry) * (v.base !== undefined ? 0 : 0), vy = diry * s * (v.lane < 0 ? 1 : -1);
      // highway vehicles drive along the road centre line (the road passes through world offset): place on the road
      var rd = L.roads[0], dxr = rd ? rd.x1 - rd.x0 : 1, dyr = rd ? rd.y1 - rd.y0 : 0, ll = sqrt(dxr * dxr + dyr * dyr) || 1, ux = dxr / ll, uy = dyr / ll, along = (lane < 0 ? 1 : -1) * s;
      var vxx = (rd ? rd.x0 : 0) + ux * (ll / 2 + along) + (-uy) * (lane * 3.4) * 1, vyy = (rd ? rd.y0 : 0) + uy * (ll / 2 + along) + ux * (lane * 3.4) * 1;
      drawVehicle(B, cam, v, vxx, vyy, v.ang, false);
    }
    // the red truck decoy (parked or driving)
    if (S.truck) drawTruck(S, B, tt);
    // people
    for (i = 0; i < L.people.length; i++) {
      var pe = L.people[i], pxw = pe.x + 2.5 * sin(0.35 * tt + pe.ph * 6), pyw = pe.y + 1.0 * sin(0.2 * tt + pe.ph * 9), ppx = cam.px(pxw, pyw, 0.9), ppy = cam.py(pxw, pyw, 0.9), cc = pe.col < 0.4 ? [40, 44, 90] : pe.col < 0.7 ? [188, 188, 182] : [66, 60, 54];
      fillEllipse(B, ppx, ppy + 0.8, 1.1, 0.7, 30, 30, 30, 0.35, -1); fillEllipse(B, ppx, ppy, max(0.9, 0.42 * cam.k), max(0.9, 0.5 * cam.k * (0.5 + 0.5 * cam.sp)), cc[0], cc[1], cc[2], 1, -1);
    }
    // the collapsed person (SOS / heat)
    if (S.person) drawPerson(S, B);
    // flames and smoke
    if (S.fire) drawFire(S, B, tt, night);
    // glare (static pattern on the facade; shimmers very slowly)
    if (S.glareWalls.length) drawGlare(S, B, tt);
    // dust haze and visibility: a warm veil whose density drifts with the wind (low-resolution noise, bilinear)
    var haze = o.hazard === 'dust' ? 0.3 + 0.15 * o.severity : 0;
    if (o.visFactor < 1) haze = max(haze, (1 - o.visFactor) * 0.7);
    if (haze > 0) {
      var wsr = windScreen(S), hr0 = 214 * (0.35 + 0.65 * day), hg0 = 178 * (0.35 + 0.65 * day), hb0 = 128 * (0.35 + 0.65 * day), gw = (W >> 2) + 2, gh = (H >> 2) + 2, gx, gy, HG = new F32(gw * gh);
      for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) HG[gy * gw + gx] = 0.82 + 0.36 * vnoise((gx * 4 + tt * wsr.sx * 9) * 0.03 + 7, (gy * 4 + tt * wsr.sy * 9) * 0.05 + 3);
      for (j = 0; j < H; j++) {
        var fy = (j & 3) * 0.25, r0 = (j >> 2) * gw, r1 = r0 + gw;
        for (i = 0; i < W; i++) {
          var fx = (i & 3) * 0.25, c0 = i >> 2, v0 = HG[r0 + c0] * (1 - fx) + HG[r0 + c0 + 1] * fx, v1 = HG[r1 + c0] * (1 - fx) + HG[r1 + c0 + 1] * fx, a2 = haze * (v0 * (1 - fy) + v1 * fy);
          if (a2 > 0.92) a2 = 0.92; p = (j * W + i) << 2;
          buf[p] = buf[p] * (1 - a2) + hr0 * a2; buf[p + 1] = buf[p + 1] * (1 - a2) + hg0 * a2; buf[p + 2] = buf[p + 2] * (1 - a2) + hb0 * a2;
        }
      }
    }
    return { data: buf, width: W, height: H, t: tt, kind: 'rgb' };
  }
  function drawTruck(S, B, tt) {
    var tr = S.truck, cam = S.cam, L = S.L, o = S.o, x = tr.x, y = tr.y, ang = tr.ang, dx = cos(ang), dy = sin(ang), nx = -dy, ny = dx;
    if (tr.moving) { var span = 2 * L.ext, s = ((tr.speed * tt + 40) % span) - L.ext; x = dx * s + nx * tr.lane; y = dy * s + ny * tr.lane; }
    else { x = nx * tr.lane; y = ny * tr.lane; }
    // a bright orange-red rigid truck: cab + box body (the colour rules read it as fire-coloured; flicker and thermal say it is not)
    var cabLen = 2.6, boxLen = 6.4, wid = 2.5, h = 3.0, ps, i;
    var drawBox = function (cx2, cy2, len, hgt, col) {
      var pts = carPts(cx2, cy2, ang, len, wid), base = [], top = [];
      for (i = 0; i < 4; i++) { base.push(cam.px(pts[2 * i], pts[2 * i + 1], 0), cam.py(pts[2 * i], pts[2 * i + 1], 0)); top.push(cam.px(pts[2 * i], pts[2 * i + 1], hgt), cam.py(pts[2 * i], pts[2 * i + 1], hgt)); }
      for (i = 0; i < 4; i++) { var j = (i + 1) % 4; quad(B, base[2 * i], base[2 * i + 1], base[2 * j], base[2 * j + 1], top[2 * j], top[2 * j + 1], top[2 * i], top[2 * i + 1], col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1, -1); }
      fillPoly(B, top, 4, col[0], col[1], col[2], 1, -1);
    };
    drawBox(x - dx * boxLen / 2 - dx * 0.2, y - dy * boxLen / 2 - dy * 0.2, boxLen, h, [238, 92, 32]);
    drawBox(x + dx * cabLen / 2 + dx * boxLen * 0.0 + dx * 0.1 + dx * 0.9, y + dy * cabLen / 2 + dy * 0.1 + dy * 0.9, cabLen, 2.3, [244, 104, 38]);
  }
  function drawPerson(S, B) {
    var p = S.person, cam = S.cam, ang = p.ang, c = cos(ang), s = sin(ang), pts = [], i, q, hl = 0.85, hw = 0.26, xs = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
    for (i = 0; i < 4; i++) { q = rotp(xs[i][0], xs[i][1], c, s); pts.push(cam.px(q[0], q[1], 0.25), cam.py(q[0], q[1], 0.25)); }
    var sh = rotp(0.3, -0.25, 1, 0); fillEllipse(B, cam.px(0.35, -0.3, 0), cam.py(0.35, -0.3, 0), max(1.5, 0.95 * cam.k), max(1.0, 0.4 * cam.k * cam.sp), 20, 20, 20, 0.4, -1);
    fillPoly(B, pts, 4, 196, 222, 40, 1, -1);                                                          // high-visibility vest
    var hx = cam.px(c * hl, s * hl, 0.3), hy = cam.py(c * hl, s * hl, 0.3);
    fillEllipse(B, hx, hy, max(0.9, 0.2 * cam.k), max(0.9, 0.2 * cam.k), p.helmet ? 245 : 60, p.helmet ? 245 : 50, p.helmet ? 245 : 44, 1, -1);          // hard hat or hair
    fillEllipse(B, cam.px(-c * hl * 0.9, -s * hl * 0.9, 0.3), cam.py(-c * hl * 0.9, -s * hl * 0.9, 0.3), max(0.8, 0.14 * cam.k), max(0.8, 0.14 * cam.k), 50, 54, 100, 1, -1);                   // boots
  }
  // fire: flame tongues (4 nested layers, flickering with time), a night glow, and a smoke plume that rises and drifts downwind
  var FLAME = [[255, 96, 18], [255, 156, 36], [255, 214, 92], [255, 250, 214]];
  function flameShape(S, cl, ci, t) {                    // the tongues of one cluster at time t → [{x, y (base px), w, h, dx}], deterministic
    var cam = S.cam, o = S.o, sev = o.severity, out = [], j, n = 4 + (sev > 1 ? 1 : 0), bx = cam.px(cl.x, cl.y, cl.z), by = cam.py(cl.x, cl.y, cl.z), sc = cl.scale, k = cam.k;
    for (j = 0; j < n; j++) {
      var f1 = vnoise(t * 8.5 + cl.ph + j * 7.7, ci * 3.3 + j * 1.9), f2 = vnoise(t * 11.5 + cl.ph * 2 + j * 4.1 + 40, ci * 5.1 + j * 2.7), f3 = vnoise(t * 6.2 + cl.ph + j * 9.3 + 90, j * 1.3);
      var hM = (4.6 + 5.4 * f1) * sc * (0.8 + 0.3 * (sev - 1)), wM = (1.7 + 1.7 * f3) * sc, offM = (j - (n - 1) / 2) * 1.5 * sc;
      out.push({ x: bx + offM * k * 0.9, y: by, w: wM * k, h: hM * k * (0.35 + 0.65 * cam.cp), dx: (f2 - 0.5) * 3.6 * sc * k });
    }
    return out;
  }
  function drawFire(S, B, t, night) {
    var o = S.o, F = S.fire, cam = S.cam, buf = B.buf, W = B.W, H = B.H, i, j, c, tg, pts = PT, ws = windScreen(S), sev = o.severity, k = cam.k, nC = F.clusters.length, sx0 = 0, sy0 = 0;
    for (c = 0; c < nC; c++) { sx0 += cam.px(F.clusters[c].x, F.clusters[c].y, F.clusters[c].z); sy0 += cam.py(F.clusters[c].x, F.clusters[c].y, F.clusters[c].z); }
    sx0 /= nC; sy0 /= nC;
    // smoke: one plume from the middle of the fire; every puff is a soft grey disc that rises, drifts with the wind, grows and thins
    var nP = 22 + 8 * sev, life = 9, drift = (1.2 + 0.6 * o.wind.mps) * k * 0.9, rise = (6 + 2.5 * sev) * k * cam.cp * 0.6, spread = 3 + 1.2 * sev;
    for (i = 0; i < nP; i++) {
      var ph = ((t / life + i / nP) % 1 + 1) % 1, age = ph * life, jx = (vnoise(i * 3.1, t * 0.35) - 0.5) * 7 * k * (0.3 + ph), jy = (vnoise(i * 5.3, t * 0.35 + 11) - 0.5) * 5 * k * (0.3 + ph);
      var px2 = sx0 + ws.sx * drift * age + jx, py2 = sy0 + ws.sy * drift * age * 0.85 - rise * age - 1.2 * k + jy, rad = (2.4 + spread * 2.4 * ph + 1.8 * sev * ph) * k;
      var a = (F.flames ? 0.8 : 0.85) * pow1(1 - ph, 1.1) * smooth(0, 0.06, ph), g = 40 + 128 * ph, rr = g + (F.flames ? 14 * (1 - ph) : 0);
      softDisc(buf, W, H, px2, py2, rad, rr, g, g + 3, a);
    }
    if (F.flames) {
      for (c = 0; c < nC; c++) { var glow = (0.08 + 0.3 * night) * (0.55 + 0.9 * vnoise(t * 10 + c * 5.1 + F.clusters[c].ph, c * 2.3)); addGlow(buf, W, H, cam.px(F.clusters[c].x, F.clusters[c].y, F.clusters[c].z), cam.py(F.clusters[c].x, F.clusters[c].y, F.clusters[c].z) - 2 * k, (5.5 + 2.8 * sev) * k * F.clusters[c].scale, 255, 120, 30, glow); }
      for (c = 0; c < nC; c++) {
        var tongues = flameShape(S, F.clusters[c], c, t);
        for (var layer = 0; layer < 4; layer++) {
          var ls = [1, 0.72, 0.48, 0.24][layer], lh = [1, 0.86, 0.66, 0.42][layer], col = FLAME[layer];
          for (j = 0; j < tongues.length; j++) {
            tg = tongues[j];
            var w = tg.w * ls, h = tg.h * lh, bx = tg.x, by = tg.y + (layer ? 0 : 1.2);
            pts[0] = bx - w / 2; pts[1] = by; pts[2] = bx + w / 2; pts[3] = by; pts[4] = bx + w * 0.46 + tg.dx * 0.45; pts[5] = by - h * 0.5; pts[6] = bx + tg.dx; pts[7] = by - h; pts[8] = bx - w * 0.46 + tg.dx * 0.45; pts[9] = by - h * 0.5;
            fillPoly(B, pts, 5, col[0], col[1], col[2], 1, -1);
          }
        }
      }
      softDisc(buf, W, H, sx0 + ws.sx * 4 * k * 0.4, sy0 - 9 * k * cam.cp - 2 * k, 4.2 * k, 66, 62, 58, 0.3);
    }
  }
  function pow1(a, b) { return a <= 0 ? 0 : M.pow(a, b); }
  function drawGlare(S, B, t) {                          // sunset glare: a bright orange-yellow streak on the facade that faces the sun, with a vertical gradient and a slow shimmer
    var gw = S.glareWalls, i, best = null, sun = S.o.sun, cam = S.cam;
    for (i = 0; i < gw.length; i++) if (!best || gw[i].lit > best.lit) best = gw[i];
    if (!best) return;
    var w = best.w, b0 = best.base, t0 = best.top, steps = 14, k, u0 = 0.12, u1 = 0.62, shimmer = 0.97 + 0.03 * sin(t * 0.7);
    for (k = 0; k < steps; k++) {
      var v0 = 0.3 + 0.62 * k / steps, v1 = 0.3 + 0.62 * (k + 1) / steps, g = k / steps;
      var P = function (u, v) { var bx = lerp(b0[2 * w.i], b0[2 * w.j], u), by = lerp(b0[2 * w.i + 1], b0[2 * w.j + 1], u), tx = lerp(t0[2 * w.i], t0[2 * w.j], u), ty = lerp(t0[2 * w.i + 1], t0[2 * w.j + 1], u); return [lerp(bx, tx, v), lerp(by, ty, v)]; };
      var a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), d = P(u0, v1);
      quad(B, a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], 255 * shimmer, lerp(170, 226, g) * shimmer, lerp(66, 140, g) * shimmer, 0.94, -1);
    }
  }
  /* ====================================================================================
   * 7. THE THERMAL CAMERA: a temperature field (°C) at half the RGB resolution, the iron palette
   * ==================================================================================== */
  var IRON = (function () {
    var stops = [[0, 0, 0, 0], [0.12, 22, 0, 70], [0.3, 100, 0, 120], [0.46, 184, 24, 70], [0.62, 240, 80, 0], [0.78, 255, 160, 12], [0.9, 255, 226, 80], [1, 255, 255, 235]], lut = [], i, s, a, b, f;
    for (i = 0; i < 256; i++) {
      f = i / 255; for (s = 1; s < stops.length - 1 && f > stops[s][0]; s++);
      a = stops[s - 1]; b = stops[s]; var u = (f - a[0]) / (b[0] - a[0] || 1);
      lut.push([round(lerp(a[1], b[1], u)), round(lerp(a[2], b[2], u)), round(lerp(a[3], b[3], u))]);
    }
    return lut;
  })();
  function tempToRGB(tC, lo, hi) { return IRON[clamp(round((tC - lo) / (hi - lo) * 255), 0, 255)]; }
  function thermalBase(S) {                              // the static temperature field (°C) from the material layer: sun-baked roofs and roads, cool shade, warm AC units
    if (S.tbase) return S.tbase;
    var o = S.o, W = o.width, H = o.height, tw = W >> 1, th = H >> 1, mat = S.layers.mat, tb = new F32(tw * th), solar = o.solar, g = o.groundC, x, y, m, mt, shade, d, n;
    var lut = new F32(16); for (m = 0; m < 14; m++) lut[m] = MAT_SUN[m] * solar + MAT_NIGHT[m] * (1 - solar);
    for (y = 0; y < th; y++) for (x = 0; x < tw; x++) {
      m = mat[(2 * y) * W + 2 * x]; shade = m & 128; mt = m & 15; if (mt > 13) mt = 0;
      d = lut[mt] - (shade ? (1 + 14 * solar) * (mt === MAT.WATER ? 0 : 1) : 0);
      n = (vnoise(x * 0.09 + 3, y * 0.09 + 5) - 0.5) * 2.4 + (vnoise(x * 0.5 + 9, y * 0.5 + 1) - 0.5) * 0.7;
      tb[y * tw + x] = g + d + n;
    }
    S.tbase = tb; S.tw = tw; S.th = th;
    return tb;
  }
  function splat(temps, tw, th, cx, cy, rad, tPeak, mode) {   // radial blob: mode 'set' moves the pixel toward tPeak (people, flames); 'add' adds tPeak * falloff
    var x0 = max(0, floor(cx - rad)), x1 = min(tw - 1, ceil(cx + rad)), y0 = max(0, floor(cy - rad)), y1 = min(th - 1, ceil(cy + rad)), x, y, dx, dy, d2, w, i, rr = rad * rad;
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      dx = x + 0.5 - cx; dy = y + 0.5 - cy; d2 = (dx * dx + dy * dy) / rr; if (d2 >= 1) continue;
      w = exp(-3 * d2); i = y * tw + x;
      if (mode === 'add') temps[i] += tPeak * w; else temps[i] = temps[i] + (tPeak - temps[i]) * w;
    }
  }
  function renderThermalFrame(S, t, opts) {
    opts = opts || {};
    var o = S.o, tb = thermalBase(S), tw = S.tw, th = S.th, cam = S.cam, L = S.L, temps = new F32(tb), tt = +t || 0, i, j, c, x, y, k = cam.k * 0.5, frame = floor(tt * 12);
    // sensor noise (about 0.15 °C)
    for (y = 0; y < th; y++) for (x = 0; x < tw; x++) temps[y * tw + x] += (vnoise(x * 0.8 + frame * 13.1, y * 0.8 + frame * 3.7) - 0.5) * 0.45;
    var dust = o.hazard === 'dust' ? 0.9 : 1;
    // moving vehicles: warm bodies and engines (low contrast); the truck decoy's engine is warm too
    for (i = 0; i < L.veh.length; i++) {
      var v = L.veh[i]; if (!v.moving) continue;
      var span = 2 * L.ext, s = ((hr(o.sceneSeed, 500 + i, 1) * span + v.speed * tt) % span) - L.ext, rd = L.roads[0], dxr = rd.x1 - rd.x0, dyr = rd.y1 - rd.y0, ll = sqrt(dxr * dxr + dyr * dyr), ux = dxr / ll, uy = dyr / ll, along = ((v.lane || 0) < 0 ? 1 : -1) * s;
      var vx = rd.x0 + ux * (ll / 2 + along) - uy * ((v.lane || 0) * 3.4), vy = rd.y0 + uy * (ll / 2 + along) + ux * ((v.lane || 0) * 3.4);
      splat(temps, tw, th, cam.px(vx, vy, 0) * 0.5, cam.py(vx, vy, 0) * 0.5, max(1.2, 2.4 * k), o.groundC + 14, 'set');
    }
    if (S.truck) {
      var tr = S.truck, dx = cos(tr.ang), dy = sin(tr.ang), nx = -dy, ny = dx, x2 = tr.moving ? dx * (((tr.speed * tt + 40) % (2 * L.ext)) - L.ext) + nx * tr.lane : nx * tr.lane, y2 = tr.moving ? dy * (((tr.speed * tt + 40) % (2 * L.ext)) - L.ext) + ny * tr.lane : ny * tr.lane;
      splat(temps, tw, th, cam.px(x2 + dx * 3, y2 + dy * 3, 1) * 0.5, cam.py(x2 + dx * 3, y2 + dy * 3, 1) * 0.5, max(1.2, 1.8 * k), o.groundC + (tr.moving ? 24 : 10), 'set');
    }
    // people at body temperature (the contrast against the ground is what counts)
    for (i = 0; i < L.people.length; i++) { var pe = L.people[i], pxw = pe.x + 2.5 * sin(0.35 * tt + pe.ph * 6), pyw = pe.y + 1.0 * sin(0.2 * tt + pe.ph * 9); splat(temps, tw, th, cam.px(pxw, pyw, 0.9) * 0.5, cam.py(pxw, pyw, 0.9) * 0.5, max(1.3, 0.75 * k + 0.9), 35.2 + 0.7 * pe.col, 'set'); }
    if (S.person) { var pc = cos(S.person.ang), ps = sin(S.person.ang); for (j = -1; j <= 1; j++) splat(temps, tw, th, cam.px(pc * 0.7 * j, ps * 0.7 * j, 0.3) * 0.5, cam.py(pc * 0.7 * j, ps * 0.7 * j, 0.3) * 0.5, max(1.3, 0.7 * k + 0.8), 35.6, 'set'); }
    // fire: hot cores (250 – 600 °C, flickering) with a radiated halo; smoke is nearly transparent to long-wave infrared
    if (S.fire && S.fire.flames) {
      var cap = o.capC;
      for (c = 0; c < S.fire.clusters.length; c++) {
        var cl = S.fire.clusters[c], fx = cam.px(cl.x, cl.y, cl.z) * 0.5, fy = cam.py(cl.x, cl.y, cl.z) * 0.5, fl = 0.8 + 0.4 * vnoise(tt * 9 + cl.ph, c * 3.3), peak = min(cap, (260 + 150 * o.severity) * fl * (0.8 + 0.2 * cl.scale));
        splat(temps, tw, th, fx, fy - 1.2 * k, (3.2 + 0.9 * o.severity) * k * cl.scale + 1.2, 15, 'add');                                   // halo: radiant heating of the surroundings
        splat(temps, tw, th, fx, fy - 1.2 * k, (1.7 + 0.5 * o.severity) * k * cl.scale + 1.1, peak, 'set');
      }
    }
    if (S.fire && !S.fire.flames) { for (c = 0; c < S.fire.clusters.length; c++) { var cl2 = S.fire.clusters[c]; splat(temps, tw, th, cam.px(cl2.x, cl2.y, cl2.z) * 0.5, cam.py(cl2.x, cl2.y, cl2.z) * 0.5, 2.2 * k + 1, 70 + 20 * o.severity, 'set'); } }
    // gas: a cold, wobbling patch downwind of the source (a liquefied gas cools the air as it evaporates)
    if (S.gas) {
      var ws = windScreen(S), G = S.gas, steps = 12, depth = 3.5 + 3 * o.severity;
      for (j = 0; j < steps; j++) {
        var f = j / (steps - 1), wob = (vnoise(tt * 0.8 + j * 1.7, 5) - 0.5) * 16, cx2 = G.len * f * ws.vE + wob * ws.vN * 0.5, cy2 = G.len * f * ws.vN - wob * ws.vE * 0.5, rad = (G.wid * (0.45 + 0.9 * f)) * 0.5;
        splat(temps, tw, th, cam.px(cx2, cy2, 0.5) * 0.5, cam.py(cx2, cy2, 0.5) * 0.5, rad * k, -depth * (1 - 0.55 * f) * (0.55 + 0.9 * vnoise(tt * 1.1 + j * 0.9, 9)), 'add');
      }
    }
    // hot machinery: a hot casing and an exhaust shimmer (static: it does not flicker)
    if (S.machinery) {
      var mb = L.bld.filter(function (b) { return b.kind === 'machinery'; })[0];
      if (mb) { splat(temps, tw, th, cam.px(mb.cx, mb.cy, mb.h) * 0.5, cam.py(mb.cx, mb.cy, mb.h) * 0.5, max(1.5, 4 * k), 90 + 9 * hr(o.sceneSeed, 470, 1), 'set'); splat(temps, tw, th, cam.px(mb.cx + 4, mb.cy - 1, 13) * 0.5, cam.py(mb.cx + 4, mb.cy - 1, 13) * 0.5, max(1.3, 1.6 * k), 112, 'set'); splat(temps, tw, th, cam.px(mb.cx + 4, mb.cy - 1, 16) * 0.5, cam.py(mb.cx + 4, mb.cy - 1, 16) * 0.5, max(1.5, 3 * k), 14 * (0.8 + 0.4 * vnoise(tt * 2, 1)), 'add'); }
    }
    // flood water is cooler than sun-baked ground by day
    if (S.flood) {
      var hg = S.layers.hgt, W = o.width, wl = clamp(S.flood.w0 + 0.0042 * tt + 0.05 * (o.severity - 1) * min(1, tt / 30), 0, 0.95), wcool = -(8 * o.solar) + 2 * (1 - o.solar);
      for (y = 0; y < th; y++) for (x = 0; x < tw; x++) if (hg[(2 * y) * W + 2 * x] < wl) temps[y * tw + x] = o.groundC + wcool + (vnoise(x * 0.3 + tt, y * 0.3) - 0.5) * 0.8;
    }
    if (dust < 1) { var mean = o.groundC; for (i = 0; i < temps.length; i++) temps[i] = mean + (temps[i] - mean) * (0.82 + 0.18 * dust); }
    // auto-gain: the window follows the background, hot things saturate towards white
    var bgMed = o.groundC, lo = bgMed - 19, hi = bgMed + 36, data = new U8C(tw * th * 4), q, v;
    for (i = 0, q = 0; i < temps.length; i++, q += 4) { v = IRON[clamp(round((temps[i] - lo) / (hi - lo) * 255), 0, 255)]; data[q] = v[0]; data[q + 1] = v[1]; data[q + 2] = v[2]; data[q + 3] = 255; }
    var out = { data: data, width: tw, height: th, tw: tw, th: th, temps: temps, range: { lo: lo, hi: hi }, palette: 'iron', scale: o.width / tw, t: tt, kind: 'thermal', groundC: o.groundC };
    if (opts.full) {                                                   // nearest-neighbour upscale to the RGB size (for display)
      var W2 = o.width, H2 = o.height, big = new U8C(W2 * H2 * 4), sx, sy, sp, dp;
      for (y = 0; y < H2; y++) { sy = min(th - 1, y >> 1); for (x = 0; x < W2; x++) { sx = min(tw - 1, x >> 1); sp = (sy * tw + sx) << 2; dp = (y * W2 + x) << 2; big[dp] = data[sp]; big[dp + 1] = data[sp + 1]; big[dp + 2] = data[sp + 2]; big[dp + 3] = 255; } }
      out.data = big; out.width = W2; out.height = H2;
    }
    return out;
  }
  function renderFusedFrame(S, t) {                      // the RGB picture with the thermal anomalies blended in where the field is far above the background
    var rgb = renderRGBFrame(S, t), th = renderThermalFrame(S, t, {}), o = S.o, W = o.width, H = o.height, x, y, tw = th.tw, T0 = th.temps, thr = o.groundC + 14, p, v, a, tv;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      tv = T0[min(th.th - 1, y >> 1) * tw + min(tw - 1, x >> 1)];
      if (tv < thr) continue;
      a = clamp((tv - thr) / 60, 0, 0.7); v = IRON[clamp(round((tv - th.range.lo) / (th.range.hi - th.range.lo) * 255), 0, 255)]; p = (y * W + x) << 2;
      rgb.data[p] = rgb.data[p] * (1 - a) + v[0] * a; rgb.data[p + 1] = rgb.data[p + 1] * (1 - a) + v[1] * a; rgb.data[p + 2] = rgb.data[p + 2] * (1 - a) + v[2] * a;
    }
    rgb.kind = 'fused';
    return rgb;
  }

  /* ====================================================================================
   * 8. ANALYSIS: the REAL ManaraFire detector on the RGB frame, a contextual hotspot / people / cold-patch detector on the thermal field
   * ==================================================================================== */
  var LIMITATIONS = [
    T('كاميرا الحرارة لا ترى الناس نهاراً في الأرض الحارّة: الطريق المشمس 55–65 °م والإنسان نحو 35 °م — الإنسان أبرد من الأرض فيختفي. الأفضل ليلاً أو فجراً.', 'The thermal camera cannot find people on hot daytime ground: sun-baked road is 55–65 °C and a person is about 35 °C — colder than the road, so they vanish. Night and dawn work best.'),
    T('الزجاج يحجب الأشعة تحت الحمراء الطويلة؛ المرآة والواجهات الزجاجية تعكس الحرارة والضوء.', 'Glass blocks long-wave infrared; mirrors and glass facades reflect heat and light.'),
    T('قواعد اللون ترى الغروب والطلاء الأحمر ومصابيح الصوديوم كلوْن النار؛ التذبذب الزمني والحرارة هما ما يفصل بينها — والكاميرا يجب أن تحوم ثابتة.', 'The colour rules see sunsets, red paint and sodium lamps as fire-coloured; flicker over time and the thermal camera are what separate them — and the camera must hover steadily.'),
    T('كاميرا حرارية عادية ترى فارق الحرارة لا الغاز: السحابة الباردة قد تكون شيئاً آخر، وكشف الغاز الحقيقي يحتاج كاميرا متخصصة.', 'A plain thermal camera sees temperature, not gas: a cold patch can be something else, and real gas imaging needs a specialist camera.'),
    T('الصور مُولَّدة بالحاسوب (محاكاة)؛ لا لقطات حقيقية ولا طيران حقيقي، والكاشف «رؤية حاسوبية بقواعد» وليس ذكاءً اصطناعياً.', 'The pictures are computer-generated (simulation); no real footage, no real flight, and the detector is rule-based computer vision, not AI.')
  ];
  var LABEL = { fire: T('نار', 'Fire'), smoke: T('دخان', 'Smoke'), hotspot: T('بؤرة حرارية', 'Hotspot'), 'hot-object': T('جسم ساخن', 'Hot object'), person: T('شخص', 'Person'), 'cold-plume': T('سحابة باردة', 'Cold plume'),
    clear: T('سليم', 'Clear'), suspect: T('مشتبه', 'Suspect') };
  function fireLib() { var F = root.ManaraFire; if (!F) throw new Error('ManaraDroneScene.analyze needs js/fire.js (ManaraFire) loaded first'); return F; }
  function createAnalyzer(opts) {
    var F = fireLib(), det = F.createDetector(opts || {}), ring = [];
    return { detector: det, reset: function () { det.reset(); ring.length = 0; }, push: function (rgb, thermal, tMs, o2) {
      var o3 = {}, k; if (o2) for (k in o2) o3[k] = o2[k];
      o3.detector = det; o3.thermal = thermal || null; o3.tMs = tMs;
      if (thermal) { o3.prev = ring.length >= 6 ? ring[ring.length - 6] : ring.length >= 3 ? ring[0] : null; ring.push(thermal); if (ring.length > 8) ring.shift(); }
      return analyze(rgb, o3);
    } };
  }
  // a few extra rule-based colour cues (NOT part of ManaraFire): haze (low contrast under a warm veil), water over the ground (blue-grey, not glass), a hi-vis vest (a person lying down)
  function rgbCues(frame) {
    var d = frame.data, w = frame.width, h = frame.height, n = w * h, i, p, r, g, b, y, sy = 0, sy2 = 0, sr = 0, sb = 0, water = 0, vm = new U8(n), nv = 0;
    for (i = 0, p = 0; i < n; i++, p += 4) {
      r = d[p]; g = d[p + 1]; b = d[p + 2]; y = 0.299 * r + 0.587 * g + 0.114 * b; sy += y; sy2 += y * y; sr += r; sb += b;
      if (b - r >= 14 && b - r <= 46 && y > 70 && y < 200 && g >= r) water++;
      if (r > 150 && g > 170 && b < 100 && abs(r - g) < 50 && g >= r - 4) { vm[i] = 1; nv++; }
    }
    var mean = sy / n, std = sqrt(max(0, sy2 / n - mean * mean)), warm = (sr - sb) / n, haze = clamp((46 - std) / 16, 0, 1) * clamp((warm - 18) / 26, 0, 1), vest = 0, k, comps2;
    if (nv >= 3) { comps2 = components(vm, w, h, 3); for (k = 0; k < comps2.length; k++) if (comps2[k].area <= 120) { vest = 1; break; } }
    return { haze: Math.round(haze * 100) / 100, water: Math.round(clamp(water / n / 0.07, 0, 1) * 100) / 100, person: vest, contrast: Math.round(std * 10) / 10, warm: Math.round(warm * 10) / 10 };
  }
  function analyzeRGB(frame, opts) {
    opts = opts || {};
    var F = fireLib(), W = frame.width, H = frame.height, res = {}, a, f, state, conf, reasons = [], flicker = 0, growth = 0, temporal = !!opts.detector, r, i, boxes = [];
    if (temporal) {
      r = opts.detector.push(frame, opts.tMs); a = r.frame; f = F.features(a); state = r.state; conf = r.confidence; flicker = r.flicker; growth = r.growth; reasons = r.reasons;
    } else {
      a = F.analyze(frame); f = F.features(a);
      state = f.fire >= 0.5 || f.smoke >= 0.5 ? 'suspect' : 'clear'; conf = round(0.6 * max(f.fire, f.smoke) * 1000) / 1000; reasons = a.fireRatio > 0.0008 ? ['colour'] : [];
    }
    for (i = 0; i < a.regions.length; i++) { var g = a.regions[i]; boxes.push({ kind: g.kind, x: g.x / W, y: g.y / H, w: g.w / W, h: g.h / H, score: g.score, area: g.area }); }
    var cues = rgbCues(frame);
    return { state: state, confidence: conf, flicker: flicker, growth: growth, reasons: reasons, temporal: temporal, cues: cues, fireRatio: a.fireRatio, smokeRatio: a.smokeRatio, stillFire: round(f.fire * 1000) / 1000, stillSmoke: round(f.smoke * 1000) / 1000,
      regions: a.regions.map(function (g) { return { kind: g.kind, x: g.x, y: g.y, w: g.w, h: g.h, area: g.area, score: g.score }; }), boxes: boxes, width: W, height: H, seen: state === 'fire' || state === 'smoke' };
  }
  // robust background statistics from histograms: trimmed mean, median, MAD (median absolute deviation)
  function bgStats(temps) {
    var n = temps.length, i, lo = 1e9, hi = -1e9, v;
    for (i = 0; i < n; i++) { v = temps[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    var bw = 0.1, nb = min(8000, floor((hi - lo) / bw) + 2), hist = new I32(nb), acc, med, medAbs, trim = 0, trimN = 0, b;
    for (i = 0; i < n; i++) hist[min(nb - 1, floor((temps[i] - lo) / bw))]++;
    acc = 0; for (b = 0; b < nb; b++) { acc += hist[b]; if (acc >= n / 2) break; } med = lo + (b + 0.5) * bw;
    var h2 = new I32(nb);
    for (i = 0; i < n; i++) h2[min(nb - 1, floor(abs(temps[i] - med) / bw))]++;
    acc = 0; for (b = 0; b < nb; b++) { acc += h2[b]; if (acc >= n / 2) break; } medAbs = (b + 0.5) * bw;
    var a5 = n * 0.05, cum = 0;
    for (b = 0; b < nb; b++) { var cnt = hist[b], lowCut = max(0, a5 - cum), take = cnt - lowCut; cum += cnt; if (take <= 0) continue; var hiCut = max(0, cum - n * 0.95); take = min(take, max(0, cnt - hiCut)); if (take > 0) { trim += take * (lo + (b + 0.5) * bw); trimN += take; } }
    return { mean: trimN ? trim / trimN : med, median: med, mad: medAbs, min: lo, max: hi };
  }
  function components(mask, w, h, minArea) {             // 4-neighbour connected components of a 0/1 mask → [{x0,y0,x1,y1,area,idx[]}]
    var seen = new U8(w * h), out = [], stack = [], s, i, k, x, y, c;
    for (s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      c = { x0: w, y0: h, x1: -1, y1: -1, area: 0, idx: [] }; stack.length = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        k = stack.pop(); x = k % w; y = (k - x) / w; c.area++; c.idx.push(k);
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        if (x > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
        if (x < w - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
        if (y > 0 && mask[k - w] && !seen[k - w]) { seen[k - w] = 1; stack.push(k - w); }
        if (y < h - 1 && mask[k + w] && !seen[k + w]) { seen[k + w] = 1; stack.push(k + w); }
      }
      if (c.area >= minArea) out.push(c);
    }
    return out;
  }
  function ringOf(c, tw, th) {                           // a row-extent polygon around a component, normalised 0..1 (left edge down, right edge up)
    var rows = {}, i, k, x, y, L = [], R = [];
    for (i = 0; i < c.idx.length; i++) { k = c.idx[i]; x = k % tw; y = (k - x) / tw; var r = rows[y] || (rows[y] = [x, x]); if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; }
    var ys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    ys.forEach(function (yy) { L.push([rows[yy][0] / tw, yy / th]); R.push([(rows[yy][1] + 1) / tw, yy / th]); });
    if (ys.length) { var yl = ys[ys.length - 1]; L.push([rows[yl][0] / tw, (yl + 1) / th]); R.push([(rows[yl][1] + 1) / tw, (yl + 1) / th]); }
    return L.concat(R.reverse());
  }
  // mean temperature step (°C per pixel) across the boundary of a region: a shadow or a pool of water has a sharp edge, a vapour cloud fades gradually
  function edgeSharpness(c, temps, mask, w, h) {
    var sum = 0, n = 0, i, k, x, y, d, best, j, nb = [-1, 1, -w, w];
    for (i = 0; i < c.idx.length; i++) {
      k = c.idx[i]; x = k % w; y = (k - x) / w; best = 0;
      for (j = 0; j < 4; j++) {
        if ((j === 0 && x === 0) || (j === 1 && x === w - 1) || (j === 2 && y === 0) || (j === 3 && y === h - 1)) continue;
        if (mask[k + nb[j]]) continue;
        d = abs(temps[k] - temps[k + nb[j]]); if (d > best) best = d;
      }
      if (best > 0) { sum += best; n++; }
    }
    return n ? sum / n : 0;
  }
  function boxBlur(src, w, h, r) {                       // separable box blur (local background for the people test)
    var out = new F32(w * h), tmp = new F32(w * h), x, y, acc, n, k, d = 2 * r + 1;
    for (y = 0; y < h; y++) { acc = 0; for (k = -r; k <= r; k++) acc += src[y * w + clamp(k, 0, w - 1)]; for (x = 0; x < w; x++) { tmp[y * w + x] = acc / d; acc += src[y * w + min(w - 1, x + r + 1)] - src[y * w + max(0, x - r)]; } }
    for (x = 0; x < w; x++) { acc = 0; for (k = -r; k <= r; k++) acc += tmp[clamp(k, 0, h - 1) * w + x]; for (y = 0; y < h; y++) { out[y * w + x] = acc / d; acc += tmp[min(h - 1, y + r + 1) * w + x] - tmp[max(0, y - r) * w + x]; } }
    return out;
  }
  function analyzeThermal(th, opts) {
    opts = opts || {};
    var temps = th.temps, tw = th.tw || th.width, thh = th.th || th.height, n = tw * thh, st = bgStats(temps), fireC = opts.fireC || 150, hotObjC = opts.hotObjC || 90, i, k;
    var thr = max(st.mean + 3 * st.mad, st.mean + 6), cold = min(st.mean - 3 * st.mad, st.mean - 4), mask = new U8(n), cmask = new U8(n);
    for (i = 0; i < n; i++) { if (temps[i] > thr) mask[i] = 1; else if (temps[i] < cold) cmask[i] = 1; }
    var hot = components(mask, tw, thh, 2), coldC = components(cmask, tw, thh, max(10, n * 0.002)), fires = [], objects = [], boxes = [], polys = [], crosshair = null;
    function describeC(c, kind) {
      var mx = -1e9, sum = 0, cx = 0, cy = 0, mi = 0, j, idx;
      for (j = 0; j < c.idx.length; j++) { idx = c.idx[j]; var tv = temps[idx]; sum += tv; var x = idx % tw, y = (idx - x) / tw; cx += x; cy += y; if (tv > mx) { mx = tv; mi = idx; } }
      var mxX = mi % tw, mxY = (mi - mxX) / tw;
      return { kind: kind, x: c.x0 / tw, y: c.y0 / thh, w: (c.x1 - c.x0 + 1) / tw, h: (c.y1 - c.y0 + 1) / thh, area: c.area, maxC: Math.round(mx * 10) / 10, meanC: Math.round(sum / c.area * 10) / 10, cx: (cx / c.area + 0.5) / tw, cy: (cy / c.area + 0.5) / thh, peak: { x: (mxX + 0.5) / tw, y: (mxY + 0.5) / thh }, ring: ringOf(c, tw, thh) };
    }
    for (i = 0; i < hot.length; i++) { var d = describeC(hot[i], 'hotspot'); if (d.maxC >= fireC) { d.kind = 'hotspot'; fires.push(d); } else if (d.maxC >= hotObjC) { d.kind = 'hot-object'; objects.push(d); } }       // sun-heated equipment (air conditioners, roofs) stays below hotObjC (90 °C) and is not reported
    // people: small blobs warmer than their surroundings (a local test) and in the skin / clothing range; ground hotter than a person hides them
    var lb = boxBlur(temps, tw, thh, 6), pm = new U8(n), people = [], pc;
    for (i = 0; i < n; i++) { var dl = temps[i] - lb[i]; if (dl >= 2.5 && temps[i] >= 28 && temps[i] <= 42) pm[i] = 1; }
    pc = components(pm, tw, thh, 1);
    for (i = 0; i < pc.length; i++) {
      var c = pc[i]; if (c.area > 60) continue;
      var overlaps = false; for (k = 0; k < fires.length; k++) { var f = fires[k]; if (c.x0 / tw < f.x + f.w && (c.x1 + 1) / tw > f.x && c.y0 / thh < f.y + f.h && (c.y1 + 1) / thh > f.y) overlaps = true; }
      if (overlaps) continue;
      var pd = describeC(c, 'person'); pd.score = Math.round(clamp((pd.meanC - 28) / 8, 0, 1) * clamp(c.area / 3, 0.3, 1) * 100) / 100; people.push(pd);
    }
    // a vapour cloud BREATHES and drifts, a shadow does not: with an earlier thermal frame (opts.prev) a cold patch must change by >= 0.38 °C on average; without one the test is provisional (soft edge only)
    var prevT = opts.prev && opts.prev.temps && opts.prev.temps.length === temps.length ? opts.prev.temps : null;
    var coldDesc = coldC.map(function (c) {
      var dd = describeC(c, 'cold-plume'), mnv = 1e9, j, ch = 0;
      for (j = 0; j < c.idx.length; j++) { if (temps[c.idx[j]] < mnv) mnv = temps[c.idx[j]]; if (prevT) ch += abs(temps[c.idx[j]] - prevT[c.idx[j]]); }
      dd.minC = Math.round(mnv * 10) / 10; dd.changeC = prevT ? Math.round(ch / c.idx.length * 100) / 100 : null; dd.edge = Math.round(edgeSharpness(c, temps, cmask, tw, thh) * 100) / 100; dd.provisional = !prevT;
      return dd;
    }).filter(function (dd) { return prevT ? dd.changeC >= 0.38 : dd.edge < 2.6; });
    fires.sort(function (a, b) { return b.maxC - a.maxC; }); objects.sort(function (a, b) { return b.maxC - a.maxC; }); people.sort(function (a, b) { return b.score - a.score; });
    var kind = fires.length ? 'hotspot' : objects.length ? 'hot-object' : coldDesc.length ? 'cold-plume' : people.length ? 'people' : 'none', top = fires[0] || objects[0] || null, conf = 0;
    if (kind === 'cold-plume' && coldDesc[0].provisional) kind = people.length ? 'people' : 'cold-candidate';
    if (kind === 'hotspot') conf = clamp(0.55 + 0.25 * clamp((top.maxC - fireC) / 250, 0, 1) + 0.2 * clamp(top.area / 12, 0, 1), 0, 0.98);
    else if (kind === 'hot-object') conf = clamp(0.25 + 0.3 * clamp((top.maxC - thr) / 60, 0, 1), 0, 0.6);
    else if (kind === 'cold-plume') conf = clamp(0.3 + 0.35 * clamp((st.mean - coldDesc[0].minC) / 12, 0, 1) + 0.2 * clamp(coldDesc[0].area / 60, 0, 1), 0, 0.8);
    else if (kind === 'cold-candidate') conf = 0.2;
    else if (kind === 'people') conf = clamp(0.3 + 0.5 * people[0].score, 0, 0.85);
    fires.concat(objects).forEach(function (d) { boxes.push({ kind: d.kind, x: d.x, y: d.y, w: d.w, h: d.h, score: d.maxC, label: d.maxC + ' °C' }); polys.push({ kind: d.kind, points: d.ring }); });
    coldDesc.forEach(function (d) { boxes.push({ kind: 'cold-plume', x: d.x, y: d.y, w: d.w, h: d.h, score: d.minC, label: d.minC + ' °C' }); polys.push({ kind: 'cold-plume', points: d.ring }); });
    people.slice(0, 40).forEach(function (d) { boxes.push({ kind: 'person', x: d.x - 0.004, y: d.y - 0.006, w: d.w + 0.008, h: d.h + 0.012, score: d.score, label: '' }); });
    if (top && kind !== 'cold-plume') crosshair = { x: top.peak.x, y: top.peak.y, tC: top.maxC, kind: kind };
    else if (kind === 'cold-plume') crosshair = { x: coldDesc[0].cx, y: coldDesc[0].cy, tC: coldDesc[0].minC, kind: kind };
    return { seen: kind !== 'none' && kind !== 'cold-candidate', kind: kind, confidence: Math.round(conf * 1000) / 1000, bg: { meanC: Math.round(st.mean * 10) / 10, medianC: Math.round(st.median * 10) / 10, madC: Math.round(st.mad * 100) / 100, minC: Math.round(st.min * 10) / 10, maxC: Math.round(st.max * 10) / 10 },
      thresholds: { hotC: Math.round(thr * 10) / 10, coldC: Math.round(cold * 10) / 10, fireC: fireC, hotObjectC: hotObjC, rule: 'T > mean + 3·MAD and T > mean + 6 °C' }, maxC: Math.round(st.max * 10) / 10, hotspot: top ? { x: top.peak.x, y: top.peak.y, tC: top.maxC } : null,
      fires: fires, hotObjects: objects, people: people, coldPlumes: coldDesc, boxes: boxes, polygons: polys, crosshair: crosshair, width: tw, height: thh };
  }
  // analyze(rgb, {thermal, detector, tMs, lang}): the vision key, the thermal key, the guess and the overlays (all normalised 0..1)
  function analyze(rgb, opts) {
    opts = opts || {};
    var t0 = now(), vis = analyzeRGB(rgb, opts), th = opts.thermal ? analyzeThermal(opts.thermal, opts) : null, lang = opts.lang || 'en';
    var hyp0 = opts.hypothesis || null, cueSeen = hyp0 === 'flood' ? vis.cues.water >= 0.5 : hyp0 === 'dust' ? vis.cues.haze >= 0.5 : (hyp0 === 'sos' || hyp0 === 'heat') ? vis.cues.person >= 1 : false;
    var evVision = { seen: vis.seen || cueSeen, cue: cueSeen ? hyp0 : null, confidence: vis.seen ? vis.confidence : cueSeen ? 0.6 : Math.round(vis.confidence * 100) / 100, suspect: vis.state === 'suspect', state: vis.state, label: vis.state === 'fire' ? LABEL.fire : vis.state === 'smoke' ? LABEL.smoke : vis.state === 'suspect' ? LABEL.suspect : LABEL.clear };
    var hyp = opts.hypothesis || null, evThermal = th ? { seen: th.kind === 'hotspot' || th.kind === 'hot-object' || th.kind === 'cold-plume' || (th.kind === 'people' && (hyp === 'sos' || hyp === 'heat')), confidence: th.confidence, kind: th.kind, maxC: th.maxC, people: th.people.length } : { seen: false, confidence: 0, kind: 'none', maxC: null };
    var guess = 'none', conf = 0, state = vis.state, notes = [];
    if (vis.state === 'fire' || (th && th.kind === 'hotspot' && vis.state !== 'clear')) { guess = 'fire'; conf = max(vis.confidence, th ? th.confidence : 0) * (vis.state === 'fire' && th && th.kind === 'hotspot' ? 1 : 0.8); }
    else if (vis.state === 'smoke') { guess = 'fire'; conf = vis.confidence * 0.8; }
    else if (th && th.kind === 'hotspot') { guess = 'fire'; conf = th.confidence * 0.6; }
    else if (th && th.kind === 'cold-plume') { guess = 'gas'; conf = th.confidence * 0.7; }
    else if (th && th.kind === 'people') { guess = 'sos'; conf = th.confidence * 0.8; }
    else if (th && th.kind === 'hot-object') { guess = 'none'; conf = 0.2; }
    if (vis.cues.water >= 0.5 && vis.state !== 'fire') { guess = 'flood'; conf = max(conf, 0.45 + 0.4 * vis.cues.water); if (vis.state === 'smoke') notes.push(T('منطقة مائية متنامية تُربك قاعدة الدخان (التباس معروف)', 'A growing water region fools the smoke rule (a known confusion)')); }
    else if (vis.cues.haze >= 0.5 && vis.state !== 'fire' && guess === 'none') { guess = 'dust'; conf = 0.4 + 0.4 * vis.cues.haze; }
    var boxes = [], polys = [], crosshair = th ? th.crosshair : null;
    vis.boxes.forEach(function (b) { boxes.push({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, score: b.score, label: LABEL[b.kind] ? LABEL[b.kind][lang] : b.kind, source: 'rgb' }); });
    if (th) { th.boxes.forEach(function (b) { boxes.push({ kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, score: b.score, label: (LABEL[b.kind] ? LABEL[b.kind][lang] : b.kind) + (b.label ? ' ' + b.label : ''), source: 'thermal' }); }); th.polygons.forEach(function (pl) { polys.push({ kind: pl.kind, points: pl.points, source: 'thermal' }); }); }
    return { state: state, vision: vis, thermal: th, evidence: { vision: evVision, thermal: evThermal }, hazardGuess: guess, confidence: Math.round(conf * 1000) / 1000, overlays: { boxes: boxes, polygons: polys, crosshair: crosshair }, notes: notes, limitations: LIMITATIONS, ms: now() - t0, sim: true };
  }
  function verify(src, o) {
    o = o || {};
    var sc = src && src.renderRGB ? src : create(src), fps = o.fps || 12, secs = o.seconds || 2.5, n = max(1, round(fps * secs)), an = createAnalyzer(o.detector), res = null, timeline = [], t0 = o.t0 || 0, i, t, rgb, th;
    for (i = 0; i < n; i++) {
      t = t0 + i / fps; rgb = sc.renderRGB(t); th = o.thermal === false ? null : sc.renderThermal(t);
      res = an.push(rgb, th, Math.round(t * 1000), o.opts);
      timeline.push({ t: t, state: res.vision.state, confidence: res.vision.confidence, flicker: res.vision.flicker, fireRatio: res.vision.fireRatio });
    }
    return { result: res, frames: n, seconds: secs, timeline: timeline, finalState: res.state };
  }

  /* ====================================================================================
   * 9. OVERLAY DRAWING AND THE OPTIONAL CANVAS HELPER, PRESETS, CAPTIONS
   * ==================================================================================== */
  var GUESS_LABEL = { fire: LABEL.fire, gas: T('غاز (مرشَّح)', 'Gas (candidate)'), flood: T('سيول', 'Flood'), dust: T('غبار', 'Dust'), sos: T('شخص', 'Person') };
  var KIND_COLOR = { fire: '#ff4d1f', smoke: '#cfd3d8', hotspot: '#ffd23f', 'hot-object': '#ffa31a', person: '#3ee6a8', 'cold-plume': '#4cc2ff' };
  function drawOverlay(ctx, result, w, h, opts) {
    opts = opts || {};
    var lang = opts.lang || 'en', ov = result.overlays || result, boxes = ov.boxes || [], polys = ov.polygons || [], ch = ov.crosshair, i, j, b, c;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, w / 260); ctx.font = '600 ' + Math.max(10, Math.round(w / 34)) + 'px sans-serif'; ctx.textBaseline = 'top';
    for (i = 0; i < polys.length; i++) {
      var pg = polys[i]; if (!pg.points || pg.points.length < 3) continue;
      ctx.strokeStyle = KIND_COLOR[pg.kind] || '#fff'; ctx.beginPath(); ctx.moveTo(pg.points[0][0] * w, pg.points[0][1] * h);
      for (j = 1; j < pg.points.length; j++) ctx.lineTo(pg.points[j][0] * w, pg.points[j][1] * h);
      ctx.closePath(); ctx.stroke();
    }
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i]; c = KIND_COLOR[b.kind] || '#fff'; ctx.strokeStyle = c; ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      if (b.label) { ctx.fillStyle = c; ctx.fillText(b.label, b.x * w + 2, Math.max(0, b.y * h - Math.max(12, Math.round(w / 30)))); }
    }
    if (ch) {
      var cx = ch.x * w, cy = ch.y * h, r = Math.max(8, w / 26);
      ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r / 3, cy); ctx.moveTo(cx + r / 3, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - r / 3); ctx.moveTo(cx, cy + r / 3); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.fillText(ch.tC + ' °C', cx + r + 2, cy - r / 2);
    }
    var st = result.state || (result.vision && result.vision.state) || 'clear', conf = result.confidence !== undefined ? result.confidence : 0, g = result.hazardGuess, name = LABEL[st] ? LABEL[st][lang] : st;
    if (st !== 'fire' && g && g !== 'none' && GUESS_LABEL[g]) { name = GUESS_LABEL[g][lang]; st = 'suspect'; }
    ctx.fillStyle = st === 'fire' ? '#d7260c' : st === 'suspect' || st === 'smoke' ? '#d98e04' : '#1c7a46'; ctx.fillRect(4, 4, Math.max(70, w * 0.3), Math.max(16, Math.round(w / 22)));
    ctx.fillStyle = '#ffffff'; ctx.fillText(name + ' · ' + Math.round(conf * 100) + '%', 8, 6);
    ctx.restore();
    return ctx;
  }
  function toCanvas(frame, canvas) {                     // optional DOM helper: draws a frame on a <canvas> (needs ImageData; a no-op in Node)
    if (!canvas || typeof ImageData === 'undefined') return false;
    canvas.width = frame.width; canvas.height = frame.height;
    var c2 = canvas.getContext('2d'); c2.putImageData(new ImageData(new U8C(frame.data), frame.width, frame.height), 0, 0);
    return true;
  }
  var SCENE_TYPES = [
    { id: 'fire', label: T('حريق ودخان', 'Fire and smoke'), what: T('ألسنة لهب تومض ودخان يتحرك مع الريح', 'Flickering flames and a smoke plume drifting with the wind'), cameras: 'rgb + thermal' },
    { id: 'gas', label: T('تسرّب غاز', 'Gas leak'), what: T('سحابة بخار باردة تُرى في الحرارية فقط', 'A cold vapour cloud visible only in the thermal camera'), cameras: 'thermal' },
    { id: 'flood', label: T('سيول', 'Flood'), what: T('مياه تنتشر فوق الطرق', 'Water spreading over the roads'), cameras: 'rgb' },
    { id: 'dust', label: T('غبار', 'Dust'), what: T('غبار يخفض التباين والرؤية', 'Haze that lowers contrast and visibility'), cameras: 'rgb' },
    { id: 'heat', label: T('إجهاد حراري', 'Heat stress'), what: T('عامل منهار في موقع عمل', 'A worker collapsed at a work site'), cameras: 'rgb + thermal (night / dawn)' },
    { id: 'sos', label: T('شخص يحتاج مساعدة', 'Someone needs help'), what: T('شخص ممدّد على الأرض', 'A person lying on the ground'), cameras: 'rgb + thermal (night / dawn)' },
    { id: 'clear', label: T('مشهد سليم', 'A clear scene'), what: T('لا خطر — للمقارنة', 'No hazard — for comparison'), cameras: 'rgb + thermal' },
    { id: 'decoy-glare', label: T('مضلِّل: وهج الغروب', 'Look-alike: sunset glare'), what: T('وهج برتقالي على برج زجاجي — لون نار بلا لهب', 'Orange glare on a glass tower — fire colour, no flames'), cameras: 'rgb' },
    { id: 'decoy-red-truck', label: T('مضلِّل: شاحنة حمراء', 'Look-alike: red truck'), what: T('شاحنة برتقالية-حمراء — لون نار بلا تذبذب', 'An orange-red truck — fire colour, no flicker'), cameras: 'rgb + thermal' },
    { id: 'decoy-machinery', label: T('مضلِّل: آلات ساخنة', 'Look-alike: hot machinery'), what: T('آلات ساخنة حرارياً بلا لهب ولا دخان', 'Machinery that is hot in thermal but has no flames or smoke'), cameras: 'thermal' }
  ];
  function preset(kind, seed, opts) {
    opts = opts || {};
    var sd = (seed >>> 0) || 1, d = { sceneSeed: sd, hazard: 'none', decoy: null, severity: opts.severity || 2, flames: true, camera: { altM: 80, headingDeg: floor(hr(sd, 901, 1) * 360), pitchDeg: opts.pitchDeg || 62, fovDeg: 62, offsetE: 0, offsetN: 0 },
      timeOfDay: opts.timeOfDay !== undefined ? opts.timeOfDay : 11, context: opts.context || 'urban', wind: { deg: floor(hr(sd, 902, 1) * 360), mps: opts.windMps !== undefined ? opts.windMps : 5 }, ambientC: 0, width: opts.width || 320, height: opts.height || 240 };
    d.ambientC = opts.ambientC !== undefined ? opts.ambientC : Math.round((31 + 11 * (0.5 + 0.5 * cos(2 * PI * (d.timeOfDay - 15) / 24))) * 10) / 10;       // Gulf summer by default; pass ambientC for winter
    if (opts.camera) for (var k in opts.camera) d.camera[k] = opts.camera[k];
    if (kind === 'fire') d.hazard = 'fire';
    else if (kind === 'gas') { d.hazard = 'gas'; d.context = opts.context || 'industrial'; }
    else if (kind === 'flood') d.hazard = 'flood';
    else if (kind === 'dust') { d.hazard = 'dust'; d.visFactor = 0.55; }
    else if (kind === 'heat') { d.hazard = 'heat'; d.context = opts.context || 'desert'; d.camera.altM = 55; d.camera.pitchDeg = opts.pitchDeg || 80; }
    else if (kind === 'sos') { d.hazard = 'sos'; d.camera.altM = 55; d.camera.pitchDeg = opts.pitchDeg || 80; }
    else if (kind === 'decoy-glare') { d.decoy = 'glare'; d.timeOfDay = opts.timeOfDay !== undefined ? opts.timeOfDay : 17.6; d.camera.pitchDeg = 50; d.camera.altM = 110; }
    else if (kind === 'decoy-red-truck') { d.decoy = 'red-truck'; d.context = opts.context || 'industrial'; d.timeOfDay = opts.timeOfDay !== undefined ? opts.timeOfDay : 8.5; d.camera.altM = 60; d.camera.pitchDeg = opts.pitchDeg || 75; }
    else if (kind === 'decoy-machinery') { d.decoy = 'machinery'; d.context = opts.context || 'industrial'; d.camera.altM = 65; d.camera.pitchDeg = opts.pitchDeg || 75; }
    return d;
  }
  function describe(desc) {
    var o = normalize(desc), hz = { fire: T('حريق ودخان', 'fire and smoke'), gas: T('سحابة غاز', 'a gas cloud'), flood: T('مياه سيول', 'flood water'), dust: T('غبار', 'dust haze'), heat: T('عامل منهار', 'a collapsed worker'), sos: T('شخص ممدّد', 'a person lying down'), none: T('لا خطر ظاهر', 'no visible hazard') }[o.hazard];
    var dc = o.decoy ? { glare: T('وهج غروب على برج زجاجي', 'sunset glare on a glass tower'), 'red-truck': T('شاحنة حمراء', 'a red truck'), machinery: T('آلات ساخنة', 'hot machinery') }[o.decoy] : null;
    var ctxN = { urban: T('حيّ عمراني', 'an urban area'), industrial: T('منطقة صناعية', 'an industrial area'), desert: T('صحراء', 'desert'), coast: T('ساحل', 'a coast'), road: T('طريق سريع', 'a highway') }[o.context];
    var what = dc || hz;
    return T('مشهد جوي محاكى: ' + what.ar + ' في ' + ctxN.ar + ' (ارتفاع ' + Math.round(o.camera.altM) + ' م، الساعة ' + Math.round(o.timeOfDay) + ':00) — محاكاة', 'Simulated aerial view: ' + what.en + ' in ' + ctxN.en + ' (altitude ' + Math.round(o.camera.altM) + ' m, ' + Math.round(o.timeOfDay) + ':00) — simulation');
  }
  var API = {
    VERSION: VERSION, create: create, renderRGB: function (desc, t, opts) { return create(desc).renderRGB(t, opts); }, renderThermal: function (desc, t, opts) { return create(desc).renderThermal(t, opts); },
    renderFused: function (desc, t) { return create(desc).renderFused(t); }, analyze: analyze, analyzeRGB: analyzeRGB, analyzeThermal: analyzeThermal, createAnalyzer: createAnalyzer, verify: verify, drawOverlay: drawOverlay, toCanvas: toCanvas,
    ironPalette: IRON, tempToRGB: tempToRGB, preset: preset, PRESETS: SCENE_TYPES.map(function (s) { return s.id; }), SCENE_TYPES: SCENE_TYPES, describe: describe, LIMITATIONS: LIMITATIONS, LABEL: LABEL, CONTEXTS: CONTEXTS, MAT: MAT,
    normalize: normalize, clearCache: function () { SCENE_CACHE.length = 0; }
  };
  root.ManaraDroneScene = API;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
