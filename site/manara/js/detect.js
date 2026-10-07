/* MANARA («منارة») — Evidence Lab  (detect.html)  →  window.ManaraLab
 * ==========================================================================================
 * The VERIFY pillar, "Proof before panic". Classic script, no libraries, works from file://.
 *
 * PART A (pure, no DOM, Node-testable):  scenes · thermal simulation · the C1…C6 pipeline ·
 *   benchmark (ablation, tau sweep, seeded 70/30 split) · sensor simulations.
 * PART B (browser only): the four tabs — LIVE, FOOL ME IF YOU CAN, DECOY LAB, SENSOR LAB.
 *
 * THE PIPELINE (rule-based computer vision, NOT machine learning):
 *   C1 colour       ManaraFire.analyze: Çelik & Demirel (2009) YCbCr rules AND Chen et al. (2004) RGB/HSI rule
 *   C2 motion       (added here) frame difference inside the fire-coloured area: something there must change
 *   C3 flicker      ManaraFire detector: flame-mask toggling + luminance change, discounted for sliding objects
 *   C4 shape/tex.   ManaraFire.features: flames are solid but ragged and textured; lamps, paint and sky are smooth
 *   C5 persistence  (added here) C1–C4 must hold for confirmFrames frames (a miss costs two)
 *   C6 thermal veto (added here) vision says FIRE but a 32×24 thermal grid shows no hotspot → back to SUSPECT
 *                   hotspot = absolute (≥ 57 °C, a listed heat detector rating) AND contextual
 *                   (T > background mean + 3·MAD and > background + 6 °C; the idea of comparing a pixel with
 *                   its surroundings is from the MODIS contextual fire algorithm, Giglio et al. 2003 — the
 *                   numbers here are our own adaptation, not MODIS's)
 * KEYS: vision · thermal · human. One key = SUSPECT, two keys = CONFIRMED, + a human Approve = PUBLIC ALERT.
 *       Vision alone can never go beyond SUSPECT for a public alert.
 * Every simulated thing (code scenes, thermal grid, sensor streams) is labelled SIM in the UI.
 */
(function (root) {
  'use strict';
  var F = root.ManaraFire;
  var M = Math, imul = M.imul, abs = M.abs, sqrt = M.sqrt, floor = M.floor, ceil = M.ceil, round = M.round, min = M.min, max = M.max, exp = M.exp, sin = M.sin, cos = M.cos, PI = M.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function r3(v) { return round(v * 1000) / 1000; }

  /* ===================================================================== utilities: seeded randomness, noise */
  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = imul(t ^ (t >>> 15), t | 1); t ^= t + imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash3(a, b, c) {
    var h = (imul(a | 0, 374761393) + imul(b | 0, 668265263) + imul(c | 0, 2147483647)) | 0;
    h = imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vn3(x, y, z) { // smooth value noise, 0..1
    var xi = floor(x), yi = floor(y), zi = floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    var a = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx), b = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx);
    var c = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx), d = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx);
    return lerp(lerp(a, b, fy), lerp(c, d, fy), fz);
  }
  function vn1(t, seed) { return vn3(t, seed * 17.17, 3.3); }

  /* ===================================================================== SCENES (code-generated, ground truth known)
   * scene = { id, w, h, fps, truth:'fire'|'decoy', frame(k) → RGBA Uint8ClampedArray (reused buffer), heat(k) → blobs, hz? }
   * Each frame is a pure function of (seed, k) so benchmarks are reproducible. Time = k / fps. */
  var FPS = 15;
  var NIGHT = { top: [12, 14, 22], bot: [30, 27, 30] };

  function newBuf(w, h) { return new Uint8ClampedArray(w * h * 4); }
  // vertical gradient + coarse blotches (static texture) — returns nothing, fills d
  function fillBg(d, w, h, top, bot, tex, seed, flo) {
    var p = 0, hz = h * (flo == null ? 0.72 : flo);
    for (var y = 0; y < h; y++) {
      var f = y / (h - 1), rr, gg, bb;
      for (var x = 0; x < w; x++) {
        var tx = tex ? (hash3(x >> 3, y >> 3, seed) - 0.5) * tex + (hash3(x >> 1, y >> 1, seed + 5) - 0.5) * tex * 0.5 : 0;
        var fl = y > hz ? 0.88 : 1;
        rr = (lerp(top[0], bot[0], f) + tx) * fl; gg = (lerp(top[1], bot[1], f) + tx) * fl; bb = (lerp(top[2], bot[2], f) + tx * 1.1) * fl;
        d[p] = rr; d[p + 1] = gg; d[p + 2] = bb; d[p + 3] = 255; p += 4;
      }
    }
  }
  function addNoise(d, w, h, amp, rnd) {
    var n = w * h, p = 0;
    for (var i = 0; i < n; i++, p += 4) {
      var e = (rnd() + rnd() - 1) * amp;
      d[p] += e; d[p + 1] += e; d[p + 2] += e;
    }
  }
  function blend(d, p, r, g, b, a) { d[p] = d[p] + (r - d[p]) * a; d[p + 1] = d[p + 1] + (g - d[p + 1]) * a; d[p + 2] = d[p + 2] + (b - d[p + 2]) * a; }
  function addLight(d, p, r, g, b, k) { d[p] += r * k; d[p + 1] += g * k; d[p + 2] += b * k; }
  function additiveGlow(d, w, h, cx, cy, sx, sy, amp, col, box) {
    var x0 = max(0, floor(cx - sx * 3)), x1 = min(w - 1, ceil(cx + sx * 3)), y0 = max(0, floor(cy - sy * 3)), y1 = min(h - 1, ceil(cy + sy * 3));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = (x - cx) / sx, dy = (y - cy) / sy, k = amp * exp(-(dx * dx + dy * dy) * 0.5);
      if (k < 0.004) continue;
      var p = (y * w + x) * 4; d[p] += col[0] * k; d[p + 1] += col[1] * k; d[p + 2] += col[2] * k;
    }
  }
  var FLAME_STOPS = [[0, 140, 25, 20], [0.1, 205, 50, 25], [0.25, 245, 105, 30], [0.42, 255, 165, 55], [0.6, 255, 225, 120], [0.78, 255, 250, 225], [1, 255, 255, 240]];
  function flameColour(th, out) {
    th = sat(th);
    for (var i = 1; i < FLAME_STOPS.length; i++) if (th <= FLAME_STOPS[i][0]) {
      var a = FLAME_STOPS[i - 1], b = FLAME_STOPS[i], f = (th - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * f; out[1] = a[2] + (b[2] - a[2]) * f; out[2] = a[3] + (b[3] - a[3]) * f; return out;
    }
    out[0] = 255; out[1] = 255; out[2] = 240; return out;
  }
  var _c3 = [0, 0, 0];
  // A procedural flame (turbulent value noise advected upward). clip = [x0,y0,x1,y1] optional.
  function drawFlame(d, w, h, Fp, t, clip) {
    var sd = Fp.seed, s1 = vn1(t * 2.1, sd), s2 = vn1(t * 3.3, sd + 1), s3 = vn1(t * 5.1, sd + 2), s4 = vn1(t * 7.7, sd + 3);
    var Hf = Fp.H * (0.84 + 0.32 * s1), Rw = Fp.R * (0.86 + 0.28 * s3), sway = Fp.R * 1.1 * (s2 - 0.5) * 2;
    var bf = Fp.bright * (0.9 + 0.1 * s4), cx = Fp.cx, by = Fp.by;
    // light thrown on the surroundings
    if (!Fp.noGlow) additiveGlow(d, w, h, cx + sway * 0.3, by - Hf * 0.38, Rw * 2.6, Hf * 0.8, 0.34 * bf * (Fp.glow == null ? 1 : Fp.glow), [255, 118, 34], null);
    var x0 = floor(cx - Rw * 2 - abs(sway)), x1 = ceil(cx + Rw * 2 + abs(sway)), y0 = floor(by - Hf * 1.18), y1 = ceil(by + Rw * 0.25);
    if (clip) { x0 = max(x0, clip[0]); y0 = max(y0, clip[1]); x1 = min(x1, clip[2]); y1 = min(y1, clip[3]); }
    x0 = max(0, x0); y0 = max(0, y0); x1 = min(w - 1, x1); y1 = min(h - 1, y1);
    var sc = max(2, Fp.R) / 22;
    for (var y = y0; y <= y1; y++) {
      var hh = (by - y) / Hf;
      if (hh < -0.15 || hh > 1.18) continue;
      var pw = hh < 0 ? 0.55 + hh * 2 : (0.78 + 0.22 * smooth(0, 0.3, hh)) * M.pow(max(0, 1 - hh), 0.5);
      if (pw <= 0.02) continue;
      for (var x = x0; x <= x1; x++) {
        var q = (x - cx - sway * hh * hh * 1.6) / Rw;
        var tb = vn3(x / (7 * sc), (y - 0) / (6 * sc) + t * 2.6, sd * 3 + 1.7) * 0.65 + vn3(x / (3.4 * sc), y / (3 * sc) + t * 5.2, sd * 5 + 9) * 0.35;
        var u = abs(q) / pw + (tb - 0.5) * (0.5 + 0.55 * max(0, hh));
        if (u >= 1) continue;
        var th = (1 - u) * (1 - 0.48 * max(0, hh)) + (tb - 0.5) * 0.28, al = smooth(1, 0.78, u);
        flameColour(th * bf + (bf - 1) * 0.1, _c3);
        var p = (y * w + x) * 4;
        blend(d, p, _c3[0] * min(1, bf), _c3[1] * min(1, bf), _c3[2] * min(1, bf), al);
      }
    }
    // embers at the base + a few sparks
    var rn = Fp.embers == null ? 1 : Fp.embers;
    if (rn) {
      var ey0 = max(0, floor(by - Rw * 0.1)), ey1 = min(h - 1, ceil(by + Rw * 0.28)), ex0 = max(0, floor(cx - Rw * 1.5)), ex1 = min(w - 1, ceil(cx + Rw * 1.5));
      if (clip) { ex0 = max(ex0, clip[0]); ex1 = min(ex1, clip[2]); ey0 = max(ey0, clip[1]); ey1 = min(ey1, clip[3]); }
      for (var yy = ey0; yy <= ey1; yy++) for (var xx = ex0; xx <= ex1; xx++) {
        var ex = (xx - cx) / (Rw * 1.5), ey = (yy - by - Rw * 0.08) / (Rw * 0.2), dd = ex * ex + ey * ey;
        if (dd >= 1) continue;
        var gl = 0.5 + 0.5 * vn3(xx / 2, yy / 2, t * 3 + sd);
        var pp = (yy * w + xx) * 4;
        blend(d, pp, 70 + 150 * gl, 18 + 38 * gl, 10, (1 - dd) * 0.9);
      }
    }
    for (var s = 0; s < (Fp.sparks == null ? 5 : Fp.sparks); s++) {
      var life = 0.9 + hash3(s, sd, 7) * 0.8, ph = (t / life + hash3(s, sd, 9)) % 1, base = floor(t / life + hash3(s, sd, 9));
      var sxp = cx + (hash3(s, base, sd) - 0.5) * Rw * 1.6 + sin(ph * 6 + s) * Rw * 0.35, syp = by - Hf * 0.4 - ph * Hf * 1.1;
      var px = round(sxp), py = round(syp);
      if (px < 0 || py < 0 || px >= w || py >= h || (clip && (px < clip[0] || px > clip[2] || py < clip[1] || py > clip[3]))) continue;
      var al2 = (1 - ph) * 0.9, q2 = (py * w + px) * 4; blend(d, q2, 255, 190, 90, al2);
    }
  }
  function rectIn(x, y, x0, y0, x1, y1) { return x >= x0 && x < x1 && y >= y0 && y < y1; }
  function rrectD(x, y, cx, cy, hw, hh, r) { // signed distance to a rounded rect (negative inside)
    var qx = abs(x - cx) - hw + r, qy = abs(y - cy) - hh + r;
    return M.sqrt(max(qx, 0) * max(qx, 0) + max(qy, 0) * max(qy, 0)) + min(max(qx, qy), 0) - r;
  }

  function defScene(id, builder) { return builder; }
  var BUILD = {};

  // ---- real fire (stand-in): procedural flame; v = variant 0..n (position, size, brightness, ambience)
  BUILD.flame = function (w, h, seed) {
    var R0 = rng(seed * 31 + 5), s = w / 320;
    var day = (seed % 4) === 3, dusk = (seed % 4) === 2;
    var Fp = { seed: seed, cx: w * (0.36 + 0.28 * R0()), by: h * (0.76 + 0.07 * R0()), R: (30 + 14 * R0()) * s, H: (82 + 34 * R0()) * s, bright: 0.9 + 0.1 * R0(), glow: day ? 0.35 : 1 };
    var tongues = [{ dx: -0.78, r: 0.5, hh: 0.62, sd: 101 }, { dx: 0.7, r: 0.56, hh: 0.7, sd: 202 }, { dx: 0.05, r: 0.42, hh: 0.5, sd: 303 }];
    var top = day ? [96, 108, 124] : dusk ? [34, 36, 52] : NIGHT.top, bot = day ? [78, 74, 66] : dusk ? [40, 34, 34] : NIGHT.bot, noise = 3 + 4 * R0();
    return {
      id: 'flame', truth: 'fire', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 7919 + k * 104729 + 1);
        fillBg(d, w, h, top, bot, 5, seed, 0.78);
        drawFlame(d, w, h, Fp, t);
        for (var i = 0; i < tongues.length; i++) { var q = tongues[i]; drawFlame(d, w, h, { seed: seed * 7 + q.sd, cx: Fp.cx + q.dx * Fp.R, by: Fp.by + 1, R: Fp.R * q.r, H: Fp.H * q.hh, bright: Fp.bright, noGlow: true, embers: 0, sparks: 0 }, t + i * 0.37); }
        addNoise(d, w, h, noise, rnd); return d;
      },
      heat: function (k) { var t = k / FPS, f = 0.5 + 0.5 * vn1(t * 4, seed + 11); return [{ x: Fp.cx / w, y: (Fp.by - Fp.H * 0.4) / h, peak: 120 + 110 * f, sigma: 1.6 * (Fp.R / 36) + 0.8 }]; }
    };
  };
  // ---- a red shirt (or a red car) sweeping across: fire-coloured, moving, never flickering
  BUILD.shirt = function (w, h, seed, opt) {
    var R0 = rng(seed * 13 + 3), s = w / 320, car = opt && opt.car;
    var bgLum = 44 + 36 * R0(), top = [bgLum * 0.95, bgLum, bgLum * 1.12], bot = [bgLum * 1.05, bgLum * 1.05, bgLum * 1.05];
    var period = 3.6 + R0() * 1.2, red = [214 + 22 * R0(), 40 + 14 * R0(), 24 + 10 * R0()], ph0 = R0();
    var Ws = (car ? 120 : 82) * s, Hs = (car ? 46 : 100) * s, y0 = h * (car ? 0.58 : 0.2 + 0.1 * R0());
    function pos(k) { var u = ((k / FPS) / period + ph0) % 1; return { cx: lerp(-0.4 * Ws, w + 0.4 * Ws, u), bob: car ? 0 : 3 * s * sin(k / FPS * 11) }; }
    return {
      id: car ? 'car' : 'shirt', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), rnd = rng(seed * 4099 + k * 7907 + 2), P = pos(k);
        fillBg(d, w, h, top, bot, 6, seed, car ? 0.7 : 0.82);
        var cx = P.cx, ty = y0 + P.bob;
        var xa = max(0, floor(cx - Ws)), xb = min(w - 1, ceil(cx + Ws)), ya = max(0, floor(ty - 4)), yb = min(h - 1, ceil(ty + Hs + (car ? 14 * s : 4)));
        for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) {
          var lx = (x - cx) / Ws, ly = (y - ty) / Hs, inside = false, shade = 1, col = red;
          if (car) {
            var db = rrectD(x, y, cx, ty + Hs * 0.62, Ws * 0.5, Hs * 0.3, 7 * s), dc = rrectD(x, y, cx - Ws * 0.02, ty + Hs * 0.22, Ws * 0.3, Hs * 0.24, 10 * s);
            var wl = ((x - (cx - Ws * 0.3)) * (x - (cx - Ws * 0.3)) + (y - (ty + Hs * 0.92)) * (y - (ty + Hs * 0.92))), wr = ((x - (cx + Ws * 0.3)) * (x - (cx + Ws * 0.3)) + (y - (ty + Hs * 0.92)) * (y - (ty + Hs * 0.92)));
            var rw = (9 * s) * (9 * s);
            if (wl < rw || wr < rw) { var pp0 = (y * w + x) * 4; blend(d, pp0, 18, 18, 20, 1); continue; }
            if (db < 0 || dc < 0) {
              inside = true; shade = 0.9 + 0.12 * sin(ly * 5) - 0.1 * (y > ty + Hs * 0.8 ? 1 : 0);
              if (dc < 0 && db > 0 && y < ty + Hs * 0.42) { col = [40, 52, 66]; shade = 0.8 + 0.4 * (0.5 - abs(lx)); }
            }
          } else {
            var ax = abs(lx), torso = ax <= 0.5 && ly >= 0 && ly <= 1 - 0.04 * (1 - cos(lx * 6)), sleeve = ax > 0.46 && ax <= 0.94 && ly >= (ax - 0.5) * 0.34 && ly <= 0.3 + (ax - 0.5) * 0.3;
            var neck = (lx * lx) / 0.014 + ((ly + 0.01) * (ly + 0.01)) / 0.012 < 1;
            inside = (torso || sleeve) && !neck;
            if (inside) shade = 0.84 + 0.16 * sin(lx * 9 + 1.1 * sin(ly * 5 + 0.7)) + (hash3(round((x - cx) / s), round((y - ty) / s), seed) - 0.5) * 0.1;
          }
          if (inside) { var pp = (y * w + x) * 4; blend(d, pp, col[0] * shade, col[1] * shade, col[2] * shade, 1); }
        }
        addNoise(d, w, h, 4, rnd); return d;
      },
      heat: function (k) { var P = pos(k); return car ? [{ x: P.cx / w, y: (y0 + Hs * 0.6) / h, peak: 38, sigma: 2.6 }] : [{ x: P.cx / w, y: (y0 + Hs * 0.5) / h, peak: 33, sigma: 3.2 }]; }
    };
  };
  BUILD.car = function (w, h, seed) { return BUILD.shirt(w, h, seed, { car: true }); };
  // ---- a lamp whose light flickers at hz Hz (default 10) — the camera samples it at 15 fps, so it aliases
  BUILD.flicker = function (w, h, seed, opt) {
    var R0 = rng(seed * 17 + 9), s = w / 320, hz = (opt && opt.hz) || 10, cx = w * (0.4 + 0.2 * R0()), cy = h * (0.42 + 0.06 * R0()), rad = (24 + 8 * R0()) * s;
    var col = [255, 168 + 30 * R0(), 60 + 30 * R0()], depth = 0.45 + 0.1 * R0(), ph = R0() * 6.283;
    return {
      id: 'flicker', truth: 'decoy', w: w, h: h, fps: FPS, hz: hz, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 2999 + k * 6007 + 3);
        var b = 1 - depth * 0.5 * (1 - sin(2 * PI * hz * t + ph));         // 1 - depth … 1
        fillBg(d, w, h, [16, 18, 26], [26, 24, 28], 4, seed, 0.8);
        // lampshade (dark cone) above the bulb
        for (var y = max(0, floor(cy - rad * 2.2)); y < min(h, ceil(cy - rad * 0.5)); y++) {
          var hw = lerp(rad * 0.45, rad * 1.5, (y - (cy - rad * 2.2)) / (rad * 1.7));
          for (var x = max(0, floor(cx - hw)); x < min(w, ceil(cx + hw)); x++) { var p0 = (y * w + x) * 4; blend(d, p0, 34, 30, 30, 1); }
        }
        additiveGlow(d, w, h, cx, cy + rad * 0.3, rad * 2.8, rad * 2.2, 0.5 * b, [255, 140, 50], null);
        for (var yy = max(0, floor(cy - rad)); yy < min(h, ceil(cy + rad)); yy++) for (var xx = max(0, floor(cx - rad)); xx < min(w, ceil(cx + rad)); xx++) {
          var dd = M.hypot(xx - cx, yy - cy) / rad; if (dd >= 1) continue;
          var core = 1 - dd * dd, p = (yy * w + xx) * 4, k2 = b * (0.55 + 0.45 * core);
          blend(d, p, lerp(col[0], 255, core * 0.8) * k2 + 20, lerp(col[1], 244, core * 0.8) * k2 + 14, lerp(col[2], 205, core * 0.8) * k2 + 10, smooth(1, 0.85, dd));
        }
        addNoise(d, w, h, 3.5, rnd); return d;
      },
      heat: function () { return [{ x: cx / w, y: cy / h, peak: 41, sigma: 1.6 }]; }
    };
  };
  // ---- a red scarf held in front of the camera (hand shake only)
  BUILD.scarf = function (w, h, seed) {
    var R0 = rng(seed * 19 + 1), s = w / 320, cx = w * (0.42 + 0.16 * R0()), top = h * 0.12, len = h * (0.66 + 0.1 * R0()), red = [204 + 24 * R0(), 40 + 14 * R0(), 26 + 12 * R0()];
    var bgLum = 40 + 30 * R0();
    return {
      id: 'scarf', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 811 + k * 3571 + 4);
        var jx = 1.6 * s * (vn1(t * 1.6, seed) - 0.5) * 2, jy = 1.2 * s * (vn1(t * 1.3, seed + 4) - 0.5) * 2;
        fillBg(d, w, h, [bgLum * 0.9, bgLum, bgLum * 1.1], [bgLum, bgLum, bgLum], 6, seed, 0.85);
        for (var y = max(0, floor(top + jy)); y < min(h, ceil(top + len + jy)); y++) {
          var f = (y - top - jy) / len, hw = (48 * s) * (1 - 0.35 * f) + 7 * s * sin(f * 9 + 0.5);
          for (var x = max(0, floor(cx + jx - hw - 3)); x < min(w, ceil(cx + jx + hw + 3)); x++) {
            var lx = (x - cx - jx) / hw; if (abs(lx) > 1) continue;
            var fold = 0.78 + 0.22 * sin(lx * 8 + f * 3.5) + 0.1 * sin(lx * 19 - f * 2), edge = smooth(1, 0.94, abs(lx));
            var p = (y * w + x) * 4; blend(d, p, red[0] * fold, red[1] * fold, red[2] * fold, edge);
          }
        }
        addNoise(d, w, h, 4, rnd); return d;
      },
      heat: function () { return [{ x: cx / w, y: (top + len / 2) / h, peak: 31, sigma: 4 }]; }
    };
  };
  // ---- a phone torch / flashlight pointed at the camera (cool white, strong glare)
  BUILD.flashlight = function (w, h, seed) {
    var R0 = rng(seed * 23 + 2), s = w / 320, cx = w * (0.4 + 0.2 * R0()), cy = h * (0.4 + 0.1 * R0()), rad = (11 + 4 * R0()) * s;
    return {
      id: 'flashlight', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 619 + k * 2749 + 5);
        var jx = 1.2 * s * (vn1(t * 1.7, seed) - 0.5) * 2, jy = 1.2 * s * (vn1(t * 1.4, seed + 6) - 0.5) * 2;
        fillBg(d, w, h, [14, 17, 24], [22, 24, 28], 5, seed, 0.8);
        additiveGlow(d, w, h, cx + jx, cy + jy, rad * 4.2, rad * 4.2, 0.55, [210, 226, 255], null);
        for (var y = max(0, floor(cy + jy - rad)); y < min(h, ceil(cy + jy + rad)); y++) for (var x = max(0, floor(cx + jx - rad)); x < min(w, ceil(cx + jx + rad)); x++) {
          var dd = M.hypot(x - cx - jx, y - cy - jy) / rad; if (dd >= 1) continue;
          var p = (y * w + x) * 4; blend(d, p, 250, 252, 255, smooth(1, 0.8, dd));
        }
        addNoise(d, w, h, 3.5, rnd); return d;
      },
      heat: function () { return [{ x: cx / w, y: cy / h, peak: 44, sigma: 1.2 }]; }
    };
  };
  // ---- a steady LED lamp (warm white): bright, smooth, not moving
  BUILD.led = function (w, h, seed) {
    var R0 = rng(seed * 29 + 8), s = w / 320, cx = w * (0.4 + 0.2 * R0()), cy = h * (0.44 + 0.05 * R0()), rad = (24 + 8 * R0()) * s, col = [255, 176 + 24 * R0(), 80 + 30 * R0()];
    return {
      id: 'led', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), rnd = rng(seed * 1531 + k * 4241 + 6);
        fillBg(d, w, h, [16, 18, 26], [28, 26, 30], 4, seed, 0.8);
        for (var y = max(0, floor(cy - rad * 2.2)); y < min(h, ceil(cy - rad * 0.5)); y++) {
          var hw = lerp(rad * 0.45, rad * 1.5, (y - (cy - rad * 2.2)) / (rad * 1.7));
          for (var x = max(0, floor(cx - hw)); x < min(w, ceil(cx + hw)); x++) { var p0 = (y * w + x) * 4; blend(d, p0, 36, 31, 30, 1); }
        }
        additiveGlow(d, w, h, cx, cy + rad * 0.3, rad * 2.8, rad * 2.2, 0.48, [255, 150, 60], null);
        for (var yy = max(0, floor(cy - rad)); yy < min(h, ceil(cy + rad)); yy++) for (var xx = max(0, floor(cx - rad)); xx < min(w, ceil(cx + rad)); xx++) {
          var dd = M.hypot(xx - cx, yy - cy) / rad; if (dd >= 1) continue;
          var core = 1 - dd * dd, p = (yy * w + xx) * 4;
          blend(d, p, lerp(col[0], 255, core * 0.8), lerp(col[1], 246, core * 0.8), lerp(col[2], 210, core * 0.8), smooth(1, 0.85, dd));
        }
        addNoise(d, w, h, 3.5, rnd); return d;
      },
      heat: function () { return [{ x: cx / w, y: cy / h, peak: 39, sigma: 1.6 }]; }
    };
  };
  // ---- a fire video playing on a phone (looks like fire to the camera; the phone is cold)
  BUILD.phonefire = function (w, h, seed) {
    var R0 = rng(seed * 37 + 4), s = w / 320, cx = w * (0.4 + 0.2 * R0()), cy = h * (0.5 + 0.04 * R0()), hw = 52 * s, hh = 92 * s;
    var Fp = { seed: seed, cx: cx, by: cy + hh * 0.7, R: 17 * s, H: 82 * s, bright: 0.95, glow: 0, embers: 1, sparks: 3 }, clip = [round(cx - hw + 5 * s), round(cy - hh + 9 * s), round(cx + hw - 5 * s), round(cy + hh - 7 * s)];
    var bgLum = 50 + 20 * R0();
    return {
      id: 'phonefire', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 3001 + k * 5003 + 7);
        var jx = 1.5 * s * (vn1(t * 1.5, seed) - 0.5) * 2, jy = 1.2 * s * (vn1(t * 1.2, seed + 3) - 0.5) * 2;
        fillBg(d, w, h, [bgLum * 0.8, bgLum * 0.85, bgLum], [bgLum * 0.9, bgLum * 0.85, bgLum * 0.85], 6, seed, 0.78);
        var ox = cx + jx, oy = cy + jy;
        for (var y = max(0, floor(oy - hh - 2)); y < min(h, ceil(oy + hh + 2)); y++) for (var x = max(0, floor(ox - hw - 2)); x < min(w, ceil(ox + hw + 2)); x++) {
          var dd = rrectD(x, y, ox, oy, hw, hh, 9 * s); if (dd > 0.5) continue;
          var p = (y * w + x) * 4, inScreen = rrectD(x, y, ox, oy, hw - 4.5 * s, hh - 8 * s, 5 * s) < 0;
          if (inScreen) { d[p] = 8; d[p + 1] = 7; d[p + 2] = 10; } else blend(d, p, 22, 22, 26, smooth(0.5, -1, dd));
        }
        // the flame on the screen (clip so it never leaves the glass); the picture follows the shaking hand
        var Fq = { seed: Fp.seed, cx: Fp.cx + jx, by: Fp.by + jy, R: Fp.R, H: Fp.H, bright: Fp.bright, glow: 0, embers: 1, sparks: 3 };
        drawFlame(d, w, h, Fq, t, [clip[0] + round(jx), clip[1] + round(jy), clip[2] + round(jx), clip[3] + round(jy)]);
        addNoise(d, w, h, 4, rnd); return d;
      },
      heat: function () { return [{ x: cx / w, y: cy / h, peak: 32, sigma: 3 }]; }
    };
  };
  // ---- a big orange painted wall (with a dark floor and door frame), slow auto-exposure drift
  BUILD.wall = function (w, h, seed) {
    var R0 = rng(seed * 41 + 6), wc = [222 + 14 * R0(), 112 + 22 * R0(), 46 + 14 * R0()], fl = 0.55 + 0.1 * R0(), dx0 = w * (0.55 + 0.2 * R0());
    return {
      id: 'wall', truth: 'decoy', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), t = k / FPS, rnd = rng(seed * 1237 + k * 6101 + 8);
        var exp1 = 1 + 0.05 * sin(t * 0.9 + seed), p = 0;
        for (var y = 0; y < h; y++) {
          var f = y / (h - 1);
          for (var x = 0; x < w; x++) {
            var vig = 1 - 0.3 * (((x / w - 0.5) * 1.6) * ((x / w - 0.5) * 1.6) + ((f - 0.5) * 1.2) * ((f - 0.5) * 1.2));
            var shade = (0.92 + 0.14 * vn3(x / 60, y / 50, seed)) * vig * exp1;
            var floor1 = y > h * fl + h * 0.28, door = x > dx0 && x < dx0 + w * 0.15 && y > h * 0.12;
            if (floor1) { d[p] = 38 * shade; d[p + 1] = 30 * shade; d[p + 2] = 28 * shade; }
            else if (door) { d[p] = 62 * shade; d[p + 1] = 44 * shade; d[p + 2] = 34 * shade; }
            else { d[p] = wc[0] * shade; d[p + 1] = wc[1] * shade; d[p + 2] = wc[2] * shade; }
            d[p + 3] = 255; p += 4;
          }
        }
        addNoise(d, w, h, 4, rnd); return d;
      },
      heat: function () { return [{ x: 0.4, y: 0.4, peak: 31, sigma: 7 }]; }
    };
  };

  // ---- drifting smoke: a soft grey haze that spreads and softens a textured scene (stand-in; real smoke is harder)
  BUILD.smoke = function (w, h, seed) {
    var R0 = rng(seed * 43 + 7), s = w / 320, period = 90;
    var tileA = [92 + 10 * R0(), 112, 78], tileB = [124, 102 + 8 * R0(), 80];
    return {
      id: 'smoke', truth: 'smoke', w: w, h: h, fps: FPS, buf: null,
      frame: function (k) {
        var d = this.buf || (this.buf = newBuf(w, h)), rnd = rng(seed * 6203 + k * 4001 + 9), kk = k % period;
        var cx = (60 + 3.4 * kk) * s, cy = h * 0.46, sig = (30 + 0.55 * kk) * s, fade = smooth(0, 10, kk) * (1 - smooth(76, 90, kk)), p = 0;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++, p += 4) {
          var tile = ((x / (16 * s) | 0) + (y / (16 * s) | 0)) & 1, bg = tile ? tileA : tileB;
          var a = 0.82 * fade * exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (2 * sig * sig));
          d[p] = bg[0] * (1 - a) + 188 * a; d[p + 1] = bg[1] * (1 - a) + 188 * a; d[p + 2] = bg[2] * (1 - a) + 186 * a; d[p + 3] = 255;
        }
        addNoise(d, w, h, 3, rnd); return d;
      },
      heat: function () { return [{ x: 0.3, y: 0.5, peak: 29, sigma: 6 }]; }
    };
  };

  var SCENE_INFO = {
    flame: { ar: 'لهب (شعلة مولَّدة بالشيفرة)', en: 'Flame (code-generated)', kind: 'fire' },
    shirt: { ar: 'قميص أحمر يعبر الإطار', en: 'Red shirt sweeping across', kind: 'decoy' },
    flicker: { ar: 'مصباح يومض 10 مرات في الثانية', en: '10 Hz flickering lamp', kind: 'decoy' },
    scarf: { ar: 'وشاح أحمر', en: 'Red scarf', kind: 'decoy' },
    flashlight: { ar: 'كشّاف هاتف', en: 'Phone flashlight', kind: 'decoy' },
    led: { ar: 'مصباح LED ثابت', en: 'Steady LED lamp', kind: 'decoy' },
    phonefire: { ar: 'فيديو حريق على هاتف', en: 'Fire video on a phone', kind: 'decoy' },
    wall: { ar: 'جدار برتقالي', en: 'Orange wall', kind: 'decoy' },
    car: { ar: 'سيارة حمراء تمرّ', en: 'Red car driving by', kind: 'decoy' },
    smoke: { ar: 'دخان متصاعد (محاكاة)', en: 'Drifting smoke (code-generated)', kind: 'smoke' }
  };
  // opt.haze (0..0.6): a dust-haze veil (tan) that desaturates every colour — the Gulf's most common "bad weather" — so the colour
  // threshold tau genuinely matters. opt.hz: lamp frequency.
  var HAZE_COL = [176, 160, 138];
  function makeScene(id, w, h, seed, opt) {
    var b = BUILD[id]; if (!b) throw new Error('unknown scene ' + id);
    var sc = b(w || 320, h || 240, seed == null ? 1 : seed, opt); sc.sceneId = id;
    var hz = opt && opt.haze;
    if (hz) {
      var raw = sc.frame;
      sc.frame = function (k) {
        var d = raw.call(this, k), n = d.length;
        for (var p = 0; p < n; p += 4) { d[p] += (HAZE_COL[0] - d[p]) * hz; d[p + 1] += (HAZE_COL[1] - d[p + 1]) * hz; d[p + 2] += (HAZE_COL[2] - d[p + 2]) * hz; }
        return d;
      };
    }
    return sc;
  }

  /* ===================================================================== THERMAL (simulated MLX90640-style 32×24)
   * Blobs are in 0..1 image coordinates. Values are SIM: ambient + Gaussian hot spots + sensor noise. */
  var TW = 32, TH = 24;
  function thermalGrid(blobs, k, seed, ambient, out) {
    var g = out || new Float32Array(TW * TH), rnd = rng((seed || 1) * 9973 + k * 31 + 17), amb = ambient == null ? 27 : ambient;
    for (var y = 0; y < TH; y++) for (var x = 0; x < TW; x++) {
      var v = amb + 0.8 * (y / TH - 0.5) + (rnd() + rnd() - 1) * 0.35 + 0.5 * sin(x * 0.4 + y * 0.3 + seed);
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i], bx = b.x * (TW - 1), by = b.y * (TH - 1), dx = x - bx, dy = y - by, s = max(0.5, b.sigma);
        v += (b.peak - amb) * exp(-(dx * dx + dy * dy) / (2 * s * s));
      }
      g[y * TW + x] = v;
    }
    return g;
  }
  // Hotspot test on one grid. ctx rule: T > bgMean + 3·MAD  and  T > bgMean + 6 °C ; absolute: T ≥ 57 °C.
  function hotspotTest(g, o) {
    o = o || {};
    var absT = o.absolute == null ? 57 : o.absolute, k = o.k == null ? 3 : o.k, rise = o.rise == null ? 6 : o.rise, n = g.length;
    var s = Array.prototype.slice.call(g).sort(function (a, b) { return a - b; }), nb = max(4, floor(n * 0.8)), sum = 0, i;
    for (i = 0; i < nb; i++) sum += s[i];
    var mean = sum / nb, dev = 0;
    for (i = 0; i < nb; i++) dev += abs(s[i] - mean);
    var mad = dev / nb, ctxThr = mean + max(k * max(mad, 0.25), rise);
    var tmax = -1e9, ix = 0;
    for (i = 0; i < n; i++) if (g[i] > tmax) { tmax = g[i]; ix = i; }
    var hotPx = 0, thr = max(absT, ctxThr);
    for (i = 0; i < n; i++) if (g[i] > thr) hotPx++;
    return { hot: tmax >= absT && tmax > ctxThr, tmax: tmax, x: (ix % TW) / (TW - 1), y: floor(ix / TW) / (TH - 1), bgMean: mean, mad: mad, ctxThr: ctxThr, absThr: absT, hotPx: hotPx, abs: tmax >= absT, ctx: tmax > ctxThr };
  }
  // thermal "modes" for a camera / file source (the visitor chooses what the thermal camera would see)
  function modeBlobs(mode, hint) {
    var hx = hint && hint.x != null ? hint.x : 0.5, hy = hint && hint.y != null ? hint.y : 0.55;
    if (mode === 'mug') return [{ x: hx, y: hy, peak: 65, sigma: 1.9 }];
    if (mode === 'fire') return [{ x: hx, y: hy, peak: 150, sigma: 1.6 }];
    return [];
  }

  /* ===================================================================== PIPELINE  C1 … C6 */
  var DEFAULTS = { tau: 40, confirmFrames: 8, clearFrames: 10, flickerMin: 0.2, motionMin: 0.08, shapeMin: 0.5, minFireRatio: 0.0008, veto: true, sustainMs: 1000, absolute: 57, mad: 3, rise: 6 };
  function tauToSens(tau) { return clamp((55 - tau) / 30, 0, 1); }
  function mergeOpts(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) if (b[k] !== undefined) o[k] = b[k]; return o; }

  function createPipeline(opts) {
    if (!F) throw new Error('ManaraFire (js/fire.js) is not loaded');
    var o = mergeOpts(DEFAULTS, opts), det, S;
    function build() { det = F.createDetector({ sensitivity: tauToSens(o.tau), tau: o.tau, confirmFrames: o.confirmFrames, clearFrames: o.clearFrames, flickerMin: o.flickerMin, minFireRatio: o.minFireRatio }); }
    function reset() {
      build();
      S = { ya: null, yb: null, havePrev: false, prevMask: null, n: 0, run: 0, latched: false, shape: 0, hotSince: null, held: false, th: null, frames: 0, lastWhy: 'none' };
    }
    reset();
    function setOptions(n) {
      var rebuild = false, k;
      for (k in n) if (n[k] !== undefined) { if ((k === 'tau' || k === 'confirmFrames' || k === 'flickerMin' || k === 'clearFrames' || k === 'minFireRatio') && o[k] !== n[k]) rebuild = true; o[k] = n[k]; }
      if (rebuild) reset();
    }
    function push(frame, tMs, grid) {
      var r = det.push(frame, tMs), a = r.frame, w = a.width, h = a.height, n = w * h, d = frame.data, i, p;
      if (S.n !== n) { S.n = n; S.ya = new Float32Array(n); S.yb = new Float32Array(n); S.havePrev = false; S.prevMask = null; }
      var Y = S.ya, pY = S.yb; S.ya = pY; S.yb = Y;           // swap: after this frame, yb = current
      for (i = 0, p = 0; i < n; i++, p += 4) Y[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      // C2 — motion inside the fire-coloured area (this frame ∪ previous frame)
      var cand = 0, chg = 0, fm = a.fireMask, pm = S.prevMask;
      if (S.havePrev) for (i = 0; i < n; i++) if (fm[i] || (pm && pm[i])) { cand++; if (abs(Y[i] - pY[i]) >= 12) chg++; }
      var mot = cand >= 12 ? chg / cand : 0;
      var c1 = r.reasons.indexOf('colour') >= 0;
      var c2 = c1 && cand >= 12 && mot >= o.motionMin;
      var c3 = c1 && r.flicker >= o.flickerMin && r.reasons.indexOf('moving') < 0;
      var feat = F.features(a);
      S.shape = c1 ? S.shape * 0.6 + feat.fire * 0.4 : S.shape * 0.5;
      var c4 = c1 && S.shape >= o.shapeMin;
      var all = c1 && c2 && c3 && c4, cf = o.confirmFrames;
      S.run = all ? min(S.run + 1, cf * 2) : max(0, S.run - 2);
      if (S.run >= cf) S.latched = true; else if (S.run < cf * 0.5) S.latched = false;
      var c5 = S.latched;
      // C6 — thermal
      var th = null;
      if (grid) {
        th = hotspotTest(grid, { absolute: o.absolute, k: o.mad, rise: o.rise });
        if (th.hot) { if (S.hotSince == null) S.hotSince = tMs; } else S.hotSince = null;
        S.held = th.hot && S.hotSince != null && tMs - S.hotSince >= o.sustainMs;
        S.th = th;
      } else { S.hotSince = null; S.held = false; S.th = null; }
      var visionState = c5 ? 'fire' : (r.state === 'smoke' ? 'smoke' : (c1 || r.state !== 'clear') ? 'suspect' : 'clear');
      var vetoed = false, state = visionState;
      if (visionState === 'fire' && grid && o.veto && !S.held) { state = 'suspect'; vetoed = true; }
      var kv = visionState === 'fire' || visionState === 'smoke', kt = grid ? S.held : null, keys = (kv ? 1 : 0) + (kt === true ? 1 : 0);
      var ladder = keys >= 2 ? 'confirmed' : (keys === 1 || state === 'suspect') ? 'suspect' : 'clear';
      var why;
      if (vetoed) why = 'veto';
      else if (state === 'fire') why = grid ? (S.held ? 'confirmed' : 'camera-only') : 'camera-only';
      else if (state === 'smoke') why = 'smoke';
      else if (!c1) why = 'none';
      else if (!c2) why = 'static';
      else if (!c3) why = (r.reasons.indexOf('moving') >= 0 ? 'sliding' : 'steady');
      else if (!c4) why = 'smooth';
      else why = 'wait';
      var conf = r.confidence; if (vetoed) conf = min(conf, 0.35);
      S.prevMask = fm; S.havePrev = true; S.frames++;
      var thr6 = th ? max(th.absThr, th.ctxThr) : 0;
      return {
        t: tMs, state: state, visionState: visionState, vetoed: vetoed, confidence: r3(conf), ladder: ladder, why: why,
        canApprove: kv && kt === true && visionState === 'fire', keys: { vision: kv, thermal: kt },
        layers: [
          { id: 'C1', on: c1, v: a.fireRatio, thr: o.minFireRatio },
          { id: 'C2', on: c2, v: mot, thr: o.motionMin },
          { id: 'C3', on: c3, v: r.flicker, thr: o.flickerMin },
          { id: 'C4', on: c4, v: S.shape, thr: o.shapeMin },
          { id: 'C5', on: c5, v: S.run, thr: cf },
          { id: 'C6', on: !!S.held, na: !grid, veto: vetoed, v: th ? th.tmax : null, thr: thr6 }
        ],
        engine: { state: r.state, confidence: r.confidence, flicker: r.flicker, growth: r.growth, smoke: r.smoke, reasons: r.reasons },
        analysis: a, features: feat, thermal: th, opts: o
      };
    }
    return { push: push, reset: reset, setOptions: setOptions, opts: o, state: function () { return S; } };
  }

  // Still pictures: only C1 (colour) and C4 (shape/texture) exist — there is no time axis and no thermal frame.
  function scoreStill(frame, tau) {
    var tt = tau == null ? 40 : tau, res = F.scoreImage(frame, { sensitivity: tauToSens(tt), tau: tt }), a = res.analysis, c1 = false, i;
    for (i = 0; i < a.regions.length; i++) if (a.regions[i].kind === 'fire') { c1 = a.fireRatio >= DEFAULTS.minFireRatio; break; }
    return { c1: c1, c4: res.label === 'fire', label: res.label, fire: res.fire, smoke: res.smoke, features: res.features, analysis: a };
  }

  /* ===================================================================== BENCHMARK (clips) */
  var BENCH_W = 160, BENCH_H = 120, BENCH_N = 30, BENCH_WARM = 6;
  var HAZES = [0, 0.15, 0.3, 0.45];
  var CLIP_LIST = (function () {
    var L = [], i, q = 0;
    function add(id, scene, seed, truth, opt) { opt = opt || {}; opt.haze = opt.haze != null ? opt.haze : HAZES[q++ % HAZES.length]; L.push({ id: id, scene: scene, seed: seed, truth: truth, opt: opt }); }
    var fh = [0, 0, 0.12, 0.2, 0.28, 0.36, 0.44, 0.5];
    for (i = 1; i <= 8; i++) add('flame-' + i, 'flame', i, 'fire', { haze: fh[i - 1] });
    [1, 2].forEach(function (s) { add('shirt-' + s, 'shirt', s, 'decoy'); });
    add('car-1', 'car', 1, 'decoy');
    [1, 2].forEach(function (s) { add('scarf-' + s, 'scarf', s, 'decoy'); });
    [1, 2].forEach(function (s) { add('wall-' + s, 'wall', s, 'decoy'); });
    [1, 2].forEach(function (s) { add('led-' + s, 'led', s, 'decoy'); });
    [[1, 10], [2, 10], [3, 8]].forEach(function (a) { add('flicker-' + a[0], 'flicker', a[0], 'decoy', { hz: a[1] }); });
    [1, 2].forEach(function (s) { add('flashlight-' + s, 'flashlight', s, 'decoy'); });
    [1, 2, 3].forEach(function (s) { add('phonefire-' + s, 'phonefire', s, 'decoy'); });
    return L;
  })();
  var STATE_RANK = { clear: 0, suspect: 1, smoke: 2, fire: 3 };

  // Run one clip through the pipeline; returns the six cumulative alarms S1…S6 and the peak state.
  function runClip(spec, tau, o) {
    o = o || {};
    var w = o.w || BENCH_W, h = o.h || BENCH_H, N = o.n || BENCH_N, warm = o.warm == null ? BENCH_WARM : o.warm;
    var sc = makeScene(spec.scene, w, h, spec.seed, spec.opt), p = createPipeline({ tau: tau == null ? 40 : tau, confirmFrames: o.confirmFrames || 8, veto: true });
    var A = [false, false, false, false, false, false], peak = 'clear', peakVision = 'clear', firstFire = -1, k;
    for (k = 0; k < N; k++) {
      var fr = { data: sc.frame(k), width: w, height: h }, out = p.push(fr, k * 1000 / FPS, thermalGrid(sc.heat(k), k, spec.seed));
      if (STATE_RANK[out.state] > STATE_RANK[peak]) peak = out.state;
      if (STATE_RANK[out.visionState] > STATE_RANK[peakVision]) peakVision = out.visionState;
      if (k < warm) continue;
      var L = out.layers, c1 = L[0].on, c2 = L[1].on, c3 = L[2].on, c4 = L[3].on, c5 = L[4].on;
      if (c1) A[0] = true;
      if (c1 && c2) A[1] = true;
      if (c1 && c2 && c3) A[2] = true;
      if (c1 && c2 && c3 && c4) A[3] = true;
      if (c5) A[4] = true;
      if (c5 && out.keys.thermal === true) { A[5] = true; if (firstFire < 0) firstFire = k; }
    }
    return { alarms: A, peak: peak, peakVision: peakVision, firstFire: firstFire };
  }

  /* ===================================================================== STATISTICS */
  function wilson(k, n, z) {
    z = z || 1.96;
    if (!n) return [0, 1];
    var p = k / n, z2 = z * z, den = 1 + z2 / n, c = p + z2 / (2 * n), m = z * sqrt(p * (1 - p) / n + z2 / (4 * n * n));
    return [max(0, (c - m) / den), min(1, (c + m) / den)];
  }
  // Seeded stratified 70/30 split: ids → 'tune' | 'held'. strata = [[id,id,…], …]
  function splitIds(strata, seed) {
    var out = {}, R = rng((seed >>> 0) * 2654435761 + 12345);
    strata.forEach(function (ids) {
      var a = ids.slice(), i;
      for (i = a.length - 1; i > 0; i--) { var j = floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      var nt = a.length < 2 ? a.length : clamp(round(a.length * 0.7), 1, a.length - 1);
      a.forEach(function (id, q) { out[id] = q < nt ? 'tune' : 'held'; });
    });
    return out;
  }

  /* ===================================================================== BENCH RUNNER (time-sliced, resumable)
   * Inputs: the code clips above (known truth) and still photos (supplied by the page). For every input and every tau of
   * TAUS it stores which cumulative stage alarms S1…S6 fired (clips) or the colour / colour+shape verdicts (photos).
   * Nothing is stored in the page source: every number in the Decoy Lab is computed from this code when the page runs. */
  var TAUS = [10, 25, 40, 55, 70, 85, 100];
  var TAU_DEFAULT = 40;
  function createBench(photos, o) {
    o = o || {};
    var w = o.w || 128, h = o.h || 96, N = o.n || 24, warm = BENCH_WARM;
    var jobs = [], cur = null, total = 0, doneUnits = 0, R = {}, t0 = null, tEnd = null;
    CLIP_LIST.forEach(function (c) { jobs.push({ kind: 'clip', spec: c }); total += TAUS.length * N; });
    (photos || []).forEach(function (ph) { jobs.push({ kind: 'photo', ph: ph }); total += TAUS.length; });
    var qi = 0;
    function startClip(spec) {
      var sc = makeScene(spec.scene, w, h, spec.seed, spec.opt), frames = [], grids = [], st = { spec: spec, sc: sc, frames: frames, grids: grids, ti: 0, k: 0, pipe: null, A: null, peak: 'clear', vis: 'clear' };
      st.pipe = createPipeline({ tau: TAUS[0], confirmFrames: 8, veto: true }); st.A = [false, false, false, false, false, false];
      R[spec.id] = { id: spec.id, kind: 'clip', truth: spec.truth, scene: spec.scene, res: {} };
      return st;
    }
    function stepClip(st) {
      var k = st.k, tau = TAUS[st.ti];
      if (!st.frames[k]) { st.frames[k] = new Uint8ClampedArray(st.sc.frame(k)); st.grids[k] = thermalGrid(st.sc.heat(k), k, st.spec.seed); }
      var out = st.pipe.push({ data: st.frames[k], width: w, height: h }, k * 1000 / FPS, st.grids[k]);
      if (STATE_RANK[out.state] > STATE_RANK[st.peak]) st.peak = out.state;
      if (STATE_RANK[out.visionState] > STATE_RANK[st.vis]) st.vis = out.visionState;
      if (k >= warm) {
        var L = out.layers, c1 = L[0].on, c2 = L[1].on, c3 = L[2].on, c4 = L[3].on, A = st.A;
        if (c1) A[0] = true; if (c1 && c2) A[1] = true; if (c1 && c2 && c3) A[2] = true; if (c1 && c2 && c3 && c4) A[3] = true;
        if (L[4].on) A[4] = true; if (L[4].on && out.keys.thermal === true) A[5] = true;
      }
      st.k++; doneUnits++;
      var all = st.A[0] && st.A[1] && st.A[2] && st.A[3] && st.A[4] && st.A[5];
      if (st.k >= N || (st.spec.truth === 'fire' && all)) {
        if (st.k < N) doneUnits += N - st.k;
        R[st.spec.id].res[tau] = { alarms: st.A.slice(), peak: st.peak, vision: st.vis };
        st.ti++;
        if (st.ti >= TAUS.length) return true;
        st.pipe = createPipeline({ tau: TAUS[st.ti], confirmFrames: 8, veto: true }); st.A = [false, false, false, false, false, false]; st.peak = 'clear'; st.vis = 'clear'; st.k = 0;
      }
      return false;
    }
    function stepPhoto(job) {
      var ph = job.ph, rec = { id: ph.id, kind: 'photo', truth: ph.truth, scene: 'photo', res: {} };
      TAUS.forEach(function (tau) {
        var s = scoreStill(ph.frame, tau);
        rec.res[tau] = { alarms: [s.c1, null, null, s.c4, null, null], label: s.label, fire: s.fire, smoke: s.smoke };
        doneUnits++;
      });
      R[ph.id] = rec;
    }
    return {
      total: function () { return total; },
      step: function (budgetMs) {
        var now = (typeof performance !== 'undefined' ? performance : Date), start = now.now();
        if (t0 == null) t0 = start;
        while (qi < jobs.length || cur) {
          if (!cur) { var j = jobs[qi++]; if (j.kind === 'photo') { stepPhoto(j); continue; } cur = startClip(j.spec); }
          if (stepClip(cur)) cur = null;
          if (now.now() - start >= budgetMs) break;
        }
        var done = qi >= jobs.length && !cur;
        if (done && tEnd == null) tEnd = now.now();
        return { progress: min(1, doneUnits / total), done: done };
      },
      results: function () { return R; },
      seconds: function () { return tEnd != null ? (tEnd - t0) / 1000 : null; },
      done: function () { return qi >= jobs.length && !cur; }
    };
  }

  /* ---- analysis of bench results ---- */
  // alarm of one input at one tau and one stage index (0..5); null = layer undefined for this input kind
  function alarmOf(rec, tau, stage) { var r = rec.res[tau]; return r ? r.alarms[stage] : null; }
  function isPos(rec) { return rec.truth === 'fire'; }
  function isNeg(rec) { return rec.truth === 'decoy' || rec.truth === 'none'; }
  // fullStack alarm: clips → S6, photos → S4 (colour + shape; the only layers a still picture has)
  function fullAlarm(rec, tau) { return rec.kind === 'clip' ? alarmOf(rec, tau, 5) : alarmOf(rec, tau, 3); }
  function countRates(recs, pred) {
    var pk = 0, pn = 0, nk = 0, nn = 0;
    recs.forEach(function (r) { var a = pred(r); if (a == null) return; if (isPos(r)) { pn++; if (a) pk++; } else if (isNeg(r)) { nn++; if (a) nk++; } });
    return { pk: pk, pn: pn, nk: nk, nn: nn, tpr: pn ? pk / pn : null, fpr: nn ? nk / nn : null };
  }
  function pickTauStar(recs, split) {
    var best = null;
    TAUS.forEach(function (tau) {
      var c = countRates(recs.filter(function (r) { return split[r.id] === 'tune'; }), function (r) { return fullAlarm(r, tau); });
      var J = (c.tpr == null ? 0 : c.tpr) - (c.fpr == null ? 0 : c.fpr);
      if (!best || J > best.J + 1e-9 || (abs(J - best.J) < 1e-9 && abs(tau - TAU_DEFAULT) < abs(best.tau - TAU_DEFAULT))) best = { tau: tau, J: J };
    });
    return best;
  }
  var STAGES = [
    { id: 'C1', name: { ar: 'اللون', en: 'Colour' } },
    { id: '+C2', name: { ar: '+ الحركة', en: '+ Motion' } },
    { id: '+C3', name: { ar: '+ الوميض', en: '+ Flicker' } },
    { id: '+C4', name: { ar: '+ الشكل والملمس', en: '+ Shape / texture' } },
    { id: '+C5', name: { ar: '+ الثبات', en: '+ Persistence' } },
    { id: '+C6', name: { ar: '+ الفيتو الحراري', en: '+ Thermal veto' } }
  ];
  // ablation rows at one tau for one subset (split 'held' | 'tune' | 'all')
  function ablation(recs, split, which, tau) {
    var sub = recs.filter(function (r) { return which === 'all' || split[r.id] === which; });
    var clips = sub.filter(function (r) { return r.kind === 'clip'; }), photos = sub.filter(function (r) { return r.kind === 'photo'; });
    return STAGES.map(function (st, i) {
      return { stage: st, clips: countRates(clips, function (r) { return alarmOf(r, tau, i); }), photos: countRates(photos, function (r) { return alarmOf(r, tau, i); }) };
    });
  }
  function rocPoints(recs, split, which, kind, stackOnly) {
    var sub = recs.filter(function (r) { return (which === 'all' || split[r.id] === which) && (kind === 'both' || r.kind === kind); });
    return TAUS.map(function (tau) {
      var c = countRates(sub, function (r) { return stackOnly ? alarmOf(r, tau, 0) : fullAlarm(r, tau); });
      return { tau: tau, tpr: c.tpr, fpr: c.fpr, c: c };
    });
  }

  /* ===================================================================== SENSOR LAB — simulated streams (SIM)
   * Thresholds come from docs/MANARA-HAZARDS.md §13 (which cites docs/MANARA-SOURCES.md): basis = cited | derived | student-set.
   * Each simulation: { id, tickSec, controls[], set(id,v), act(id), step(), reset(), view() }.
   * view() → { keys:{k1,k2}:{on,text}, readings[], lines[], hlines[], yMax, note }  (the page draws it and runs the ladder). */
  var SERIES_N = 120;
  function gauss(rnd) { return (rnd() + rnd() + rnd() + rnd() - 2) * 1.732; }
  function push(arr, v) { arr.push(v); if (arr.length > SERIES_N) arr.shift(); }
  function T2(ar, en) { return { ar: ar, en: en }; }

  var GASES = {
    lpg: { name: T2('غاز البترول المسال (LPG)', 'LPG (propane equivalent)'), sensor: 'MQ-2', warn: 1000, danger: 2100, crit: null, range: [300, 10000], src: 'S48', basis: 'cited',
      note: T2('أثقل من الهواء: يتجمّع في الأماكن المنخفضة. حساس MQ-2 يستجيب أيضًا للكحول والدخان (ورقة البيانات).', 'Heavier than air: pools in low places. The MQ-2 also responds to alcohol vapour and smoke (its datasheet).') },
    co: { name: T2('أول أكسيد الكربون (CO)', 'Carbon monoxide (CO)'), sensor: 'MQ-7', warn: 35, danger: 200, crit: 1200, range: [20, 2000], src: 'S46', basis: 'cited',
      note: T2('يختلط بالهواء ولا رائحة له. حدّ تشغيل MQ-7 يبلغ 50°م، وقد يتجاوزه صندوق مغلق تحت شمس الخليج.', 'Mixes with air and has no smell. The MQ-7 is rated to 50 °C, which a closed box in Gulf sun can exceed.') },
    h2s: { name: T2('كبريتيد الهيدروجين (H₂S)', 'Hydrogen sulfide (H₂S)'), sensor: 'MQ-136', warn: 10, danger: 20, crit: 100, range: [1, 200], src: 'S47', basis: 'cited',
      note: T2('أثقل من الهواء ويفقد الأنف حاسة الشمّ عند التركيز العالي: لا تعتمد على الرائحة. حدّ التحذير قريب من أدنى مدى للحساس.', 'Heavier than air, and the nose stops smelling it at high levels — never rely on smell. The warn level sits close to the sensor’s lowest range.') }
  };
  function simGas() {
    var rnd = rng(7), P, S, hA, hB;
    function reset(cold) {
      S = { t: 0, cA: 0, cB: 0, q: [], puff: 0, warm: cold ? 0 : 999, emaA: 0, emaB: 0, up: 0, lastRise: -999, base: [] };
      hA = []; hB = [];
    }
    P = { gas: 'lpg', leak: 0.7, on: false, noise: 0.3, rh: 55 };
    reset(false);
    function G() { return GASES[P.gas]; }
    function step() {
      var g = G(), Cmax = min(g.range[1], g.danger * 1.7), target = P.on ? P.leak * Cmax : 0;
      S.q.push(target); var delayed = S.q.length > 6 ? S.q.shift() : 0;
      S.cA += (target - S.cA) * (P.on ? 0.12 : 0.05);
      S.cB += (delayed * 0.85 - S.cB) * (P.on ? 0.07 : 0.04);
      S.puff *= 0.86;
      var W = S.warm < 999 ? g.danger * 0.9 * exp(-S.warm / 9) : 0; S.warm += S.warm < 999 ? 1 : 0;
      var drift = 0.05 * g.warn * sin(S.t / 57), humid = (P.rh - 60) * 0.004 * g.warn, sig = P.noise * 0.05 * g.warn;
      var A = max(0, S.cA + S.puff * 0.9 * g.danger + W + drift + humid + gauss(rnd) * sig);
      var B = max(0, S.cB + W * 0.9 + drift * 0.8 + humid + gauss(rnd) * sig);
      A = min(A, g.range[1]); B = min(B, g.range[1]);
      var prevB = S.emaB; S.emaB = S.t === 0 ? B : S.emaB * 0.5 + B * 0.5; S.emaA = S.t === 0 ? A : S.emaA * 0.5 + A * 0.5;
      S.base.push(B); if (S.base.length > 60) S.base.shift();
      var baseN = S.base.slice(0, max(1, S.base.length - 15)), bl = baseN.reduce(function (a, b) { return a + b; }, 0) / baseN.length;
      if (S.emaB > prevB + 0.002 * g.warn && S.emaB > bl + 2 * sig) S.up++; else S.up = 0;
      if (S.up >= 3) S.lastRise = S.t;
      push(hA, A); push(hB, B); S.A = A; S.B = B; S.bl = bl; S.t++;
    }
    function view() {
      var g = G(), rising = S.t - S.lastRise <= 20, k1 = S.A >= g.warn, k2 = S.B >= g.warn && rising;
      var hl = [{ v: g.warn, kind: 'warn', label: T2('تحذير', 'warn') }, { v: g.danger, kind: 'danger', label: T2('خطر', 'danger') }];
      if (g.crit && g.crit <= g.range[1]) hl.push({ v: g.crit, kind: 'crit', label: T2('حرج', 'critical') });
      return {
        keys: { k1: { on: k1, text: T2('المستشعر (أ) فوق حد التحذير', 'Sensor A is above the warn level') }, k2: { on: k2, text: T2('المستشعر (ب) في مكان آخر فوق التحذير + اتجاه صاعد', 'Sensor B (second place) above warn AND rising') } },
        readings: [{ l: T2('المستشعر (أ)', 'Sensor A'), v: S.A, u: 'ppm' }, { l: T2('المستشعر (ب)', 'Sensor B'), v: S.B, u: 'ppm' }, { l: T2('الاتجاه', 'Trend'), v: rising ? T2('صاعد', 'rising') : T2('غير صاعد', 'not rising') }],
        lines: [{ name: T2('المستشعر (أ)', 'Sensor A'), data: hA, c: 'brand' }, { name: T2('المستشعر (ب)', 'Sensor B'), data: hB, c: 'accent' }],
        hlines: hl, yMax: min(g.range[1], g.danger * 2.2), unit: 'ppm', warm: S.warm < 999,
        banner: S.warm < 999 ? T2('التسخين الأولي (محاكاة): تقرأ حساسات MQ عالية عند التشغيل. أوراق بياناتها تطلب تسخينًا 48 ساعة؛ هنا مضغوط إلى ثوانٍ.', 'Warm-up (SIM): MQ sensors read high at power-up. Their datasheets ask for 48 h of preheat; here it is squeezed into seconds.') : null
      };
    }
    return {
      id: 'gas', tickSec: 1, unitLabel: T2('ثانية محاكاة', 'sim-s'), gases: GASES,
      controls: [
        { id: 'gas', type: 'select', label: T2('نوع الغاز', 'Gas'), options: Object.keys(GASES).map(function (k) { return { v: k, l: GASES[k].name }; }), value: 'lpg' },
        { id: 'leak', type: 'range', label: T2('حجم التسرّب', 'Leak size'), min: 0, max: 1, step: 0.05, value: 0.7, fmt: 'pct' },
        { id: 'on', type: 'toggle', label: T2('بدء التسرّب', 'Start leak'), labelOn: T2('إيقاف التسرّب', 'Stop leak'), value: false },
        { id: 'puff', type: 'button', label: T2('بخّة معقّم يدين (حساسية متقاطعة)', 'Hand-sanitiser puff (cross-sensitivity)') },
        { id: 'noise', type: 'range', label: T2('الضجيج', 'Noise'), min: 0, max: 1, step: 0.05, value: 0.3, fmt: 'pct' },
        { id: 'rh', type: 'range', label: T2('الرطوبة النسبية', 'Humidity (RH)'), min: 30, max: 90, step: 1, value: 55, unit: '%' },
        { id: 'cold', type: 'button', label: T2('إعادة تشغيل باردة (التسخين)', 'Cold restart (warm-up)') }
      ],
      set: function (id, v) { if (id === 'gas') { P.gas = v; reset(false); } else P[id] = v; },
      act: function (id) { if (id === 'puff') S.puff = 1; if (id === 'cold') reset(true); },
      step: step, reset: function () { reset(false); }, view: view, params: P
    };
  }

  var WORK = { light: { limit: 28, name: T2('عمل خفيف', 'Light work') }, moderate: { limit: 25, name: T2('عمل متوسط', 'Moderate work') }, heavy: { limit: 23, name: T2('عمل شاق', 'Heavy work') }, vheavy: { limit: 21, name: T2('عمل شاق جدًا', 'Very heavy work') } };
  function stullWetBulb(T, RH) { // Stull (2011), valid ~ −20…50 °C, 5…99 % RH
    var at = M.atan;
    return T * at(0.151977 * sqrt(RH + 8.313659)) + at(T + RH) - at(RH - 1.676331) + 0.00391838 * M.pow(RH, 1.5) * at(0.023101 * RH) - 4.686035;
  }
  function wbgtEstimate(T, RH, dTg) { // OSHA: indoor/no sun 0.7 Tnwb + 0.3 Tg ; outdoor with sun 0.7 Tnwb + 0.2 Tg + 0.1 Tdb ; Tg = T + dTg
    var Tw = stullWetBulb(T, RH), Tg = T + dTg;
    return dTg > 0 ? 0.7 * Tw + 0.2 * Tg + 0.1 * T : 0.7 * Tw + 0.3 * Tg;
  }
  function heatIndexC(Tc, RH) { // NWS Rothfusz regression with the published adjustments (computed in °F)
    var T = Tc * 9 / 5 + 32, hi = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094);
    if ((hi + T) / 2 >= 80) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
      if (RH < 13 && T >= 80 && T <= 112) hi -= ((13 - RH) / 4) * sqrt((17 - abs(T - 95)) / 17);
      else if (RH > 85 && T >= 80 && T <= 87) hi += ((RH - 85) / 10) * ((87 - T) / 5);
    }
    return (hi - 32) * 5 / 9;
  }
  function inBanWindow(dateStr, hour) { // Ministerial Decision 17/2021 (S18): 10:00–15:30, 1 June – 15 September
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || ''); if (!m) return false;
    var mo = +m[2], d = +m[3], inDate = (mo > 6 && mo < 9) || mo === 6 || (mo === 9 && d <= 15);
    return inDate && hour >= 10 && hour < 15.5;
  }
  function simHeat() {
    var rnd = rng(11), P, S, hW, hL;
    P = { T: 34, rh: 40, sun: 0, work: 'light', hour: 9, date: '2026-11-15', outdoor: true, noise: 0.2 };
    function reset() { S = { t: 0, Ts: 34, RHs: 40, dry: 0 }; hW = []; hL = []; }
    reset();
    function step() {
      var Tt = P.T + (S.dry > 0 ? 10 : 0), Rt = P.rh - (S.dry > 0 ? 20 : 0); if (S.dry > 0) S.dry--;
      S.Ts += (Tt - S.Ts) * 0.3; S.RHs += (Rt - S.RHs) * 0.3;
      var Tm = S.Ts + gauss(rnd) * P.noise * 0.4, Rm = clamp(S.RHs + gauss(rnd) * P.noise * 2, 5, 99);
      S.wb = wbgtEstimate(Tm, Rm, P.sun); S.hi = heatIndexC(Tm, Rm); S.Tm = Tm; S.Rm = Rm; S.tw = stullWetBulb(Tm, Rm);
      push(hW, S.wb); S.t++;
    }
    function view() {
      var lim = WORK[P.work].limit, k1 = S.wb >= lim, cal = !!P.outdoor && inBanWindow(P.date, P.hour);
      return {
        keys: { k1: { on: k1, text: T2('تقدير WBGT فوق حدّ نوع العمل', 'WBGT estimate above this workload’s limit') }, k2: { on: cal, text: T2('مفتاح التقويم: ضمن 10:00–15:30 و1 يونيو–15 سبتمبر والعمل في الخارج', 'Calendar key: inside 10:00–15:30 and 1 June–15 Sept, outdoor work') } },
        readings: [{ l: T2('درجة الحرارة', 'Temperature'), v: S.Tm, u: '°C', d: 1 }, { l: T2('الرطوبة', 'Humidity'), v: S.Rm, u: '%', d: 0 }, { l: T2('WBGT (تقدير)', 'WBGT (estimate)'), v: S.wb, u: '°C', d: 1 }, { l: T2('مؤشر الحرارة (NWS)', 'Heat index (NWS)'), v: S.hi, u: '°C', d: 1 }],
        lines: [{ name: T2('WBGT (تقدير)', 'WBGT (estimate)'), data: hW, c: 'brand' }],
        hlines: [{ v: lim, kind: 'warn', label: T2('تحذير: ', 'warn: ') }, { v: 32.1, kind: 'danger', label: T2('خطر: 32.1 (قانون قطر، قيمة مقيسة)', 'danger: 32.1 (Qatar law — a MEASURED value)') }],
        yMin: 15, yMax: 45, unit: '°C', hi: S.hi, wbgt: S.wb, calendar: cal
      };
    }
    return {
      id: 'heat', tickSec: 60, unitLabel: T2('دقيقة محاكاة', 'sim-min'),
      controls: [
        { id: 'T', type: 'range', label: T2('درجة حرارة الهواء (ظل)', 'Air temperature (shade)'), min: 25, max: 50, step: 0.5, value: 34, unit: '°C' },
        { id: 'rh', type: 'range', label: T2('الرطوبة النسبية', 'Relative humidity'), min: 10, max: 90, step: 1, value: 40, unit: '%' },
        { id: 'sun', type: 'range', label: T2('حِمل الشمس على الكرة السوداء (ΔTg)', 'Sun load on the globe (ΔTg)'), min: 0, max: 15, step: 1, value: 0, unit: '°C' },
        { id: 'work', type: 'select', label: T2('نوع العمل', 'Workload'), options: Object.keys(WORK).map(function (k) { return { v: k, l: WORK[k].name }; }), value: 'light' },
        { id: 'hour', type: 'range', label: T2('الساعة (محاكاة)', 'Clock (simulated)'), min: 0, max: 23.75, step: 0.25, value: 9, fmt: 'clock' },
        { id: 'date', type: 'date', label: T2('التاريخ (محاكاة)', 'Date (simulated)'), value: '2026-11-15' },
        { id: 'outdoor', type: 'switch', label: T2('عمل خارجي قائم', 'Outdoor work in progress'), value: true },
        { id: 'dryer', type: 'button', label: T2('مجفف شعر على المستشعر', 'Hair dryer on the sensor') },
        { id: 'noise', type: 'range', label: T2('الضجيج', 'Noise'), min: 0, max: 1, step: 0.05, value: 0.2, fmt: 'pct' }
      ],
      set: function (id, v) { P[id] = v; }, act: function (id) { if (id === 'dryer') S.dry = 8; },
      step: step, reset: reset, view: view, params: P
    };
  }

  function simFlood() {
    var rnd = rng(13), P, S, h1, h2;
    P = { rain: 0.2, qmd: false, temp: 30, comp: false, noise: 0.2 };
    function reset() { S = { t: 0, L1: 0, L2: 0, burst: 0, q: [] }; h1 = []; h2 = []; }
    reset();
    var MOUNT = 100; // sensor 100 cm above the underpass floor
    function step() {
      var inflow = 3.0 * M.pow(P.rain, 1.15) + (S.burst > 0 ? 2.6 : 0); if (S.burst > 0) S.burst--;
      S.L1 += inflow * 0.5 - 0.05 * S.L1 * 0.5; S.q.push(S.L1); var lag = S.q.length > 2 ? S.q.shift() : 0; S.L2 += (lag * 0.85 - S.L2) * 0.25;
      var c = 331.3 + 0.606 * P.temp, ratio = P.comp ? 1 : 340 / c, sig = P.noise * 2.2;
      function meas(L) { var dist = (MOUNT - L) * ratio + gauss(rnd) * sig; return clamp(MOUNT - dist, 0, 120); }
      S.m1 = meas(S.L1); S.m2 = meas(S.L2); push(h1, S.m1); push(h2, S.m2); S.t++;
    }
    function view() {
      var k1 = S.m1 >= 15, k2 = S.m2 >= 15 || P.qmd, c = 331.3 + 0.606 * P.temp, err = P.comp ? 0 : (340 / c - 1) * 100;
      return {
        keys: { k1: { on: k1, text: T2('عمق الماء عند الموقع (1) ≥ 15 سم', 'Water depth at spot 1 ≥ 15 cm') }, k2: { on: k2, text: T2('مستشعر في موقع ثانٍ ≥ 15 سم، أو إنذار أمطار رسمي', 'A second spot ≥ 15 cm, OR an official rain warning') } },
        readings: [{ l: T2('العمق عند (1)', 'Depth at spot 1'), v: S.m1, u: 'cm', d: 1 }, { l: T2('العمق عند (2)', 'Depth at spot 2'), v: S.m2, u: 'cm', d: 1 }, { l: T2('خطأ سرعة الصوت', 'Speed-of-sound error'), v: err, u: '%', d: 1 }],
        lines: [{ name: T2('الموقع (1)', 'Spot 1'), data: h1, c: 'brand' }, { name: T2('الموقع (2)', 'Spot 2'), data: h2, c: 'accent' }],
        hlines: [{ v: 15, kind: 'warn', label: T2('تحذير', 'warn') }, { v: 30, kind: 'danger', label: T2('خطر', 'danger') }, { v: 46, kind: 'crit', label: T2('حرج', 'critical') }],
        yMax: 60, unit: 'cm'
      };
    }
    return {
      id: 'flood', tickSec: 5, unitLabel: T2('5 ثوانٍ محاكاة', '5 sim-s'),
      controls: [
        { id: 'rain', type: 'range', label: T2('شدة المطر', 'Rain intensity'), min: 0, max: 1, step: 0.05, value: 0.2, fmt: 'pct' },
        { id: 'burst', type: 'button', label: T2('سحابة ممطرة مفاجئة', 'Cloudburst') },
        { id: 'qmd', type: 'switch', label: T2('إنذار أمطار رسمي (الأرصاد)', 'Official rain warning (met service)'), value: false },
        { id: 'temp', type: 'range', label: T2('حرارة الهواء', 'Air temperature'), min: 20, max: 50, step: 1, value: 30, unit: '°C' },
        { id: 'comp', type: 'switch', label: T2('تعويض الحرارة (SHT31)', 'Temperature compensation (SHT31)'), value: false },
        { id: 'noise', type: 'range', label: T2('ضجيج (رذاذ/رغوة)', 'Noise (drops/foam)'), min: 0, max: 1, step: 0.05, value: 0.2, fmt: 'pct' }
      ],
      set: function (id, v) { P[id] = v; }, act: function (id) { if (id === 'burst') S.burst = 6; },
      step: step, reset: reset, view: view, params: P
    };
  }

  function simDust() {
    var rnd = rng(17), P, S, hP, hV;
    P = { storm: 0, qmd: false, noise: 0.2 };
    function reset() { S = { t: 0, pm: 45, raw: [] }; hP = []; hV = []; }
    reset();
    function step() {
      var target = 45 + P.storm * 800; S.pm += (target - S.pm) * 0.18;
      var sig = P.noise * 25, read = clamp(min(S.pm, 500) + gauss(rnd) * sig, 0, 500); S.raw.push(read); if (S.raw.length > 10) S.raw.shift();
      S.mean = S.raw.reduce(function (a, b) { return a + b; }, 0) / S.raw.length;
      S.vis = clamp(100 * exp(-S.pm / 320) + gauss(rnd) * P.noise * 5, 0, 100);
      push(hP, S.mean); push(hV, S.vis); S.t++;
    }
    function view() {
      var k1 = S.mean >= 150, k2 = S.vis <= 60 || P.qmd, sat = S.raw.length && S.raw[S.raw.length - 1] >= 500;
      return {
        keys: { k1: { on: k1, text: T2('PM10 (متوسط 10 دقائق) ≥ 150', 'PM10 (10-minute mean) ≥ 150') }, k2: { on: k2, text: T2('انخفاض الرؤية بالكاميرا، أو إنذار غبار رسمي', 'Camera visibility drop, OR an official dust warning') } },
        readings: [{ l: T2('PM10 متوسط 10 دقائق', 'PM10 10-min mean'), v: S.mean, u: 'µg/m³', d: 0 }, { l: T2('مؤشر الرؤية (كاميرا)', 'Visibility index (camera)'), v: S.vis, u: '%', d: 0 }, { l: T2('الحساس', 'Sensor'), v: sat ? T2('مشبع (≥500)', 'saturated (≥ 500)') : T2('ضمن المدى', 'in range') }],
        lines: [{ name: 'PM10', data: hP, c: 'brand' }],
        hlines: [{ v: 45, kind: 'ref', label: T2('WHO 24 ساعة: 45', 'WHO 24 h: 45') }, { v: 150, kind: 'warn', label: T2('تحذير 150', 'warn 150') }, { v: 255, kind: 'danger', label: T2('خطر 255', 'danger 255') }, { v: 425, kind: 'crit', label: T2('حرج 425', 'critical 425') }],
        yMax: 520, unit: 'µg/m³', saturated: sat
      };
    }
    return {
      id: 'dust', tickSec: 60, unitLabel: T2('دقيقة محاكاة', 'sim-min'),
      controls: [
        { id: 'storm', type: 'range', label: T2('شدة العاصفة الغبارية', 'Dust-storm intensity'), min: 0, max: 1, step: 0.05, value: 0, fmt: 'pct' },
        { id: 'qmd', type: 'switch', label: T2('إنذار غبار/رياح رسمي', 'Official dust/wind warning'), value: false },
        { id: 'noise', type: 'range', label: T2('الضجيج', 'Noise'), min: 0, max: 1, step: 0.05, value: 0.2, fmt: 'pct' }
      ],
      set: function (id, v) { P[id] = v; }, act: function () {}, step: step, reset: reset, view: view, params: P
    };
  }

  function simSos() {
    var rnd = rng(19), P, S, hA, hT;
    P = { cal: 3, impact: 4.5, still: true };
    function reset() { S = { t: 0, sos: false, press2: false, fallAt: null, stillS: 0, callAt: null, answered: false, acc: 1 }; hA = []; hT = []; }
    reset();
    function step() {
      var acc = 1 + abs(gauss(rnd)) * 0.04;
      if (S.spike > 0) { acc = S.spike; S.spike = 0; }
      S.acc = acc; push(hA, acc);
      if (S.fallAt != null) { if (P.still) S.stillS++; else { S.fallAt = null; S.stillS = 0; } }
      var fallKey = S.fallAt != null && S.stillS >= 15, k1 = S.sos || fallKey;
      if (k1 && S.callAt == null && !S.answered) S.callAt = S.t;
      if (!k1) S.callAt = null;
      S.wait = S.callAt != null && !S.answered ? S.t - S.callAt : 0; push(hT, S.wait);
      S.k1 = k1; S.fallKey = fallKey; S.t++;
    }
    function view() {
      var k2 = !S.answered && (S.wait >= 30 || S.press2);
      return {
        keys: { k1: { on: !!S.k1, text: T2('زر الاستغاثة، أو اصطدام فوق العتبة ثم سكون 15 ثانية', 'SOS button, OR an impact above the calibrated peak then 15 s of stillness') }, k2: { on: k2, text: T2('لا ردّ على مكالمة التحقق خلال 30 ثانية، أو ضغطة ثانية', 'No answer to the check-in call within 30 s, OR a second press') } },
        readings: [{ l: T2('التسارع', 'Acceleration'), v: S.acc, u: 'g', d: 1 }, { l: T2('بلا ردّ منذ', 'No answer for'), v: S.wait, u: 's', d: 0 }, { l: T2('سكون بعد الاصطدام', 'Stillness after impact'), v: S.stillS, u: 's', d: 0 }],
        lines: [{ name: T2('التسارع (g)', 'Acceleration (g)'), data: hA, c: 'brand', scale: 'g' }, { name: T2('ثوانٍ بلا ردّ', 'Seconds without answer'), data: hT, c: 'accent', scale: 's' }],
        hlines: [{ v: 30, kind: 'danger', label: T2('30 ث بلا ردّ', '30 s no answer'), scale: 's' }, { v: P.cal, kind: 'warn', label: T2('العتبة المعايَرة (g)', 'calibrated peak (g)'), scale: 'g' }],
        yMax: 36, unit: '', dual: true
      };
    }
    return {
      id: 'sos', tickSec: 1, unitLabel: T2('ثانية محاكاة', 'sim-s'),
      controls: [
        { id: 'press', type: 'button', label: T2('اضغط زر الاستغاثة', 'Press the SOS button') },
        { id: 'press2', type: 'button', label: T2('ضغطة ثانية', 'Second press') },
        { id: 'fall', type: 'button', label: T2('محاكاة سقوط (اصطدام)', 'Simulate a fall (impact)') },
        { id: 'impact', type: 'range', label: T2('قوة الاصطدام', 'Impact strength'), min: 1, max: 8, step: 0.5, value: 4.5, unit: 'g' },
        { id: 'cal', type: 'range', label: T2('العتبة المعايَرة (يضبطها الطالب — لا معيار)', 'Calibrated peak (student-set — no standard)'), min: 1.5, max: 6, step: 0.5, value: 3, unit: 'g' },
        { id: 'still', type: 'switch', label: T2('الشخص ساكن بعد السقوط', 'Person stays still after the fall'), value: true },
        { id: 'ok', type: 'button', label: T2('أنا بخير — الردّ على المكالمة', 'I’m OK — answer the call') }
      ],
      set: function (id, v) { P[id] = v; },
      act: function (id) {
        if (id === 'press') { S.sos = true; S.answered = false; }
        if (id === 'press2') S.press2 = true;
        if (id === 'fall') { S.spike = P.impact; if (P.impact >= P.cal) { S.fallAt = S.t; S.stillS = 0; S.answered = false; } }
        if (id === 'ok') { S.answered = true; S.sos = false; S.press2 = false; S.fallAt = null; S.stillS = 0; S.callAt = null; }
      },
      step: step, reset: reset, view: view, params: P
    };
  }
  var SENSORS = { gas: simGas, flood: simFlood, heat: simHeat, dust: simDust, sos: simSos };
  // one-key = SUSPECT, two keys = CONFIRMED, human on top of two keys = PUBLIC ALERT
  function ladderOf(k1, k2, human) {
    var n = (k1 ? 1 : 0) + (k2 ? 1 : 0);
    if (n >= 2) return human ? 'alert' : 'confirmed';
    return n === 1 ? 'suspect' : 'clear';
  }

  /* ===================================================================== public core API */
  var CORE = {
    VERSION: '1.0.0', FPS: FPS, TAUS: TAUS, TAU_DEFAULT: TAU_DEFAULT, DEFAULTS: DEFAULTS, STAGES: STAGES,
    SCENE_INFO: SCENE_INFO, CLIP_LIST: CLIP_LIST, GASES: GASES, WORK: WORK,
    makeScene: makeScene, createPipeline: createPipeline, scoreStill: scoreStill, runClip: runClip, thermalGrid: thermalGrid, hotspotTest: hotspotTest, modeBlobs: modeBlobs,
    createBench: createBench, splitIds: splitIds, pickTauStar: pickTauStar, ablation: ablation, rocPoints: rocPoints, countRates: countRates, alarmOf: alarmOf, fullAlarm: fullAlarm, wilson: wilson,
    sensors: SENSORS, ladderOf: ladderOf, stullWetBulb: stullWetBulb, wbgtEstimate: wbgtEstimate, heatIndexC: heatIndexC, inBanWindow: inBanWindow, tauToSens: tauToSens, rng: rng
  };
  root.ManaraLab = CORE;
  if (typeof document === 'undefined') return;

  /* ===================================================================================================================
   * PART B — the page (browser only)
   * =================================================================================================================== */
  var Manara = root.Manara, Lab = CORE;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function L(o) { return Manara.L(o); }
  function num(n, d) { return Manara.num(n, d); }
  function rmQuery() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  var NOW = function () { return (typeof performance !== 'undefined' ? performance : Date).now(); };

  // bilingual macro for authored static markup: {{عربي|English}} → two data-l spans (never used with user data)
  function bi(tpl) { return tpl.replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, '<span data-l="ar">$1</span><span data-l="en">$2</span>'); }
  // attributes that must follow the language (aria-label, title, placeholder)
  var ATTRS = [];
  function bindAttr(el, attr, ar, en) { ATTRS.push([el, attr, { ar: ar, en: en }]); el.setAttribute(attr, L({ ar: ar, en: en })); }
  function refreshAttrs() { ATTRS.forEach(function (a) { a[0].setAttribute(a[1], L(a[2])); }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function icon(n) { return Manara.icon(n); }
  function tpl(html, vars) { // authored templates only
    var s = bi(html); if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return true;
    } catch (e) { return false; }
  }
  function csvCell(v) { var s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function pct(v, d) { return v == null ? '–' : num(v * 100, d == null ? 0 : d) + '%'; }

  /* ---- design tokens for canvases (read once, refreshed on themechange) ---- */
  var TK = {};
  function parseColor(s) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s || '');
    if (m) { var h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&'); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    m = /rgba?\(([^)]+)\)/.exec(s || ''); if (m) { var p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2]]; }
    return [255, 90, 60];
  }
  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    ['ink', 'ink-2', 'muted', 'line', 'line-2', 'surface', 'surface-2', 'surface-3', 'brand', 'accent', 'safe', 'warn', 'danger', 'info', 'fire-2', 'head', 'bg', 'font', 'font-m'].forEach(function (k) { TK[k] = cs.getPropertyValue('--' + k).trim(); });
    TK.rgb = {}; ['danger', 'info', 'warn', 'accent', 'brand', 'fire-2', 'safe'].forEach(function (k) { TK.rgb[k] = parseColor(TK[k]); });
  }

  /* ---- camera manager (one MediaStream shared by every stage) ---- */
  var Cam = { stream: null, refs: 0, state: 'idle' };
  Cam.acquire = function () {
    return new Promise(function (resolve) {
      Cam.refs++;
      if (Cam.stream) { Cam.state = 'live'; return resolve('live'); }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { Cam.state = 'none'; return resolve('none'); }
      Cam.state = 'asking';
      var p; try { p = navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }); } catch (e) { Cam.state = 'error'; return resolve('error'); }
      p.then(function (s) { Cam.stream = s; Cam.state = 'live'; resolve('live'); }).catch(function (e) {
        var n = e && e.name;
        Cam.state = (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') ? 'denied' : (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') ? 'none' : 'error';
        resolve(Cam.state);
      });
    });
  };
  Cam.release = function () {
    Cam.refs = max(0, Cam.refs - 1);
    if (!Cam.refs && Cam.stream) { try { Cam.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ } Cam.stream = null; Cam.state = 'idle'; }
  };

  /* ---- Web Serial: the twin board (protocol v1, docs/MANARA-SPEC.md) ---- */
  var Ser = { supported: !!(typeof navigator !== 'undefined' && navigator.serial && navigator.serial.requestPort), state: 'idle', grid: null, summary: false, ms: 0, frame: null, listeners: [], port: null, reader: null, lines: 0 };
  Ser.emit = function () { Ser.listeners.forEach(function (f) { try { f(Ser); } catch (e) { /* ignore */ } }); };
  Ser.fresh = function () { return Ser.state === 'live' && Ser.grid && NOW() - Ser.ms < 3000; };
  Ser.handle = function (line) {
    var m; try { m = JSON.parse(line); } catch (e) { return; }
    if (!m || m.v !== 1) return;
    Ser.lines++;
    if (m.type === 'grid' && m.w === 32 && m.h === 24 && m.t10 && m.t10.length === 768) {
      var g = new Float32Array(768); for (var i = 0; i < 768; i++) g[i] = m.t10[i] / 10;
      Ser.grid = g; Ser.summary = false; Ser.ms = NOW();
    } else if (m.type === 'frame') {
      Ser.frame = m;
      if (m.thermal && !(Ser.grid && !Ser.summary && NOW() - Ser.ms < 3000)) { // no real grid recently: rebuild an approximate one from the summary
        var tm = m.thermal, hot = tm.hot || { x: 0.5, y: 0.5, t: tm.tmax };
        Ser.grid = thermalGrid([{ x: hot.x, y: hot.y, peak: tm.tmax, sigma: 1.2 }], Ser.lines, 5, tm.tmean == null ? 27 : tm.tmean);
        Ser.summary = true; Ser.ms = NOW();
      }
    } else return;
    Ser.emit();
  };
  Ser.connect = function () {
    if (!Ser.supported) return Promise.resolve(false);
    Ser.state = 'connecting'; Ser.emit();
    return navigator.serial.requestPort().then(function (port) {
      return port.open({ baudRate: 115200 }).then(function () {
        Ser.port = port; Ser.state = 'live'; Ser.emit();
        var dec = new TextDecoder(), buf = '', reader = port.readable.getReader(); Ser.reader = reader;
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) { Ser.state = 'idle'; Ser.emit(); return; }
            buf += dec.decode(r.value, { stream: true });
            var idx; while ((idx = buf.indexOf('\n')) >= 0) { var ln = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1); if (ln) Ser.handle(ln); }
            if (buf.length > 20000) buf = '';
            pump();
          }).catch(function () { Ser.state = 'error'; Ser.emit(); });
        })();
        return true;
      });
    }).catch(function () { Ser.state = 'idle'; Ser.emit(); return false; });
  };
  Ser.disconnect = function () {
    try { if (Ser.reader) Ser.reader.cancel(); if (Ser.port) Ser.port.close(); } catch (e) { /* ignore */ }
    Ser.state = 'idle'; Ser.grid = null; Ser.emit();
  };

  /* ===================================================================== shared UI vocabulary */
  var STATE_L = { clear: T2('سليم', 'CLEAR'), suspect: T2('اشتباه', 'SUSPECT'), fire: T2('حريق', 'FIRE'), smoke: T2('دخان', 'SMOKE') };
  var LAYER_INFO = [
    { id: 'C1', name: T2('اللون', 'Colour'), desc: T2('قواعد YCbCr (Çelik وDemirel 2009) وRGB/HSI (Chen وآخرون 2004): هل في الصورة ما يشبه لون اللهب؟', 'YCbCr rules (Çelik & Demirel 2009) AND an RGB/HSI rule (Chen et al. 2004): is anything flame-coloured?') },
    { id: 'C2', name: T2('الحركة', 'Motion'), desc: T2('هل يتغيّر شيء داخل المنطقة الملوّنة بين إطارين؟ الجسم الثابت يسقط هنا.', 'Does anything inside the coloured area change between two frames? A static object fails here.') },
    { id: 'C3', name: T2('الوميض', 'Flicker'), desc: T2('اللهب يغيّر شكله وسطوعه عدة مرات في الثانية وهو في مكانه؛ الجسم المنزلق لا يفعل.', 'Flames change shape and brightness several times a second while staying in place; a sliding object does not.') },
    { id: 'C4', name: T2('الشكل والملمس', 'Shape / texture'), desc: T2('اللهب صلب لكنه متعرّج وغني الملمس؛ المصابيح والطلاء والسماء ملساء.', 'Flames are solid yet ragged and textured; lamps, paint and sky are smooth.') },
    { id: 'C5', name: T2('الثبات', 'Persistence'), desc: T2('يجب أن تصمد الطبقات C1–C4 عدة إطارات متتالية (الإطار الفائت يكلّف إطارين).', 'Layers C1–C4 must hold for several frames in a row (one miss costs two).') },
    { id: 'C6', name: T2('النقض الحراري', 'Thermal veto'), desc: T2('شبكة حرارية 32×24: بقعة ساخنة مطلقة (≥ 57°م) وسياقية (> متوسط الخلفية + 3·MAD و+6°م).', '32×24 thermal grid: a hotspot that is absolute (≥ 57 °C) AND contextual (> background mean + 3·MAD and + 6 °C).') }
  ];
  var WHY = {
    none: T2('لا شيء في الصورة بلون النار.', 'Nothing in view has a fire colour.'),
    static: T2('اللون يشبه النار لكن لا شيء يتحرك داخله — جسم ثابت (وشاح أو مصباح أو جدار).', 'The colour looks like fire, but nothing inside it moves — a static object (scarf, lamp, wall).'),
    sliding: T2('لونه ناري لكن الجسم كله ينزلق كقطعة واحدة — شيء يتحرك لا لهبٌ يرتجف.', 'Fire-coloured, but the whole shape just slides — an object moving, not a flame flickering.'),
    steady: T2('حركة بلا وميض لهب: شكله لا يتغيّر كما تفعل ألسنة اللهب.', 'Movement, but no flame-like flicker: the shape does not change the way flames do.'),
    smooth: T2('يومض لكن شكله أملس وصلب كمصباح أو طلاء — لا ألسنة متعرّجة.', 'It flickers, but its shape is smooth and solid like a lamp or paint — no ragged flame tongues.'),
    wait: T2('كل الطبقات ترى لهبًا… ننتظر ثباته عدة إطارات.', 'All layers see a flame… waiting for it to persist for a few frames.'),
    confirmed: T2('الرؤية والحرارة متفقتان: مفتاحان. بانتظار موافقة إنسان.', 'Vision and thermal agree: two keys. Waiting for a human to approve.'),
    'camera-only': T2('الرؤية وحدها ترى حريقًا. دون مفتاح ثانٍ لا يتجاوز الاشتباه في أي إنذار عام.', 'Vision alone sees fire. Without a second key it can never go beyond SUSPECT for a public alert.'),
    veto: T2('الرؤية ترى حريقًا لكن الكاميرا الحرارية لا ترى بقعة ساخنة ← نقض حراري: يبقى اشتباهًا. (الزجاج يحجب الأشعة تحت الحمراء، لذلك لا نمسح الاشتباه تلقائيًا.)', 'Vision says fire but the thermal camera sees no hotspot → thermal veto: it stays SUSPECT. (Glass blocks long-wave infrared, so we never clear it automatically.)'),
    smoke: T2('دخان: رمادي يتحرك ويخفت تدريجيًا عدة إطارات. قد لا تُظهر الحرارة شيئًا، لذا يلزم مفتاح ثانٍ.', 'Smoke: grey haze that drifts and softens for several frames. Thermal may show nothing, so it needs a second key.'),
    still: T2('صورة ثابتة: لا حركة ولا وميض ولا إطار حراري لفحصها، فأعلى نتيجة ممكنة هي الاشتباه.', 'A still picture: no motion, flicker or thermal frame to check, so the most it can be is SUSPECT.'),
    paused: T2('متوقف مؤقتًا.', 'Paused.')
  };
  var LADDER = [
    { id: 'clear', l: T2('سليم', 'CLEAR') }, { id: 'suspect', l: T2('اشتباه · مفتاح واحد', 'SUSPECT · 1 key') },
    { id: 'confirmed', l: T2('مؤكَّد · مفتاحان', 'CONFIRMED · 2 keys') }, { id: 'alert', l: T2('إنذار عام · بموافقة إنسان', 'PUBLIC ALERT · human approved') }
  ];
  var TH_MODES = [
    { v: 'auto', l: T2('تلقائي (يطابق المشهد؛ بارد للكاميرا والملفات)', 'Auto (matches the scene; cold for camera and files)') },
    { v: 'cold', l: T2('غرفة باردة (لا مصدر حرارة)', 'Cold room (no heat source)') },
    { v: 'mug', l: T2('كوب ساخن (≈65°م)', 'Hot mug (≈65 °C)') },
    { v: 'fire', l: T2('بقعة حريق حقيقي (محاكاة)', 'Real-fire hotspot (SIM)') },
    { v: 'off', l: T2('بلا بيانات حرارية (رؤية فقط)', 'No thermal data (vision only)') },
    { v: 'live', l: T2('اللوحة الحيّة (Web Serial)', 'Live board (Web Serial)') }
  ];
  function ironbow(t) { // 0..1 → rgb (data colour map, theme independent)
    var S = [[0, 0, 0, 24], [0.22, 58, 0, 110], [0.45, 184, 38, 74], [0.7, 248, 140, 28], [0.9, 255, 226, 120], [1, 255, 252, 214]];
    t = sat(t);
    for (var i = 1; i < S.length; i++) if (t <= S[i][0]) { var a = S[i - 1], b = S[i], f = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; }
    return [255, 252, 214];
  }
  var LOGCAP = 7;

  function stageTemplate(fool) {
    return '<div class="lab-grid' + (fool ? ' fool' : '') + '">' +
      '<div class="lab-main">' +
        '<div class="card stage">' +
          '<div class="src-bar">' +
            '<div class="chips" id="{p}-scenes" role="group"></div>' +
            '<div class="btns">' +
              '<button class="btn btn-ghost btn-sm" type="button" id="{p}-cam">' + icon('camera') + '<span>{{الكاميرا|Camera}}</span></button>' +
              '<label class="btn btn-ghost btn-sm file-btn" for="{p}-file">' + icon('upload') + '<span>{{صورة أو فيديو|Photo or video}}</span></label>' +
              '<input id="{p}-file" class="sr-only" type="file" accept="image/*,video/*">' +
              '<button class="btn btn-sm btn-primary" type="button" id="{p}-play">' + icon('pause') + '<span></span></button>' +
            '</div>' +
          '</div>' +
          '<div class="view-wrap">' +
            '<canvas id="{p}-view" class="view" width="320" height="240" role="img"></canvas>' +
            '<div class="hud hud-state" id="{p}-badge" data-state="clear"><span class="dot"></span><b></b><span class="mono"></span></div>' +
            '<div class="hud hud-perf mono" aria-hidden="true"><span id="{p}-fps">–</span> fps · <span id="{p}-ms">–</span> ms</div>' +
            '<div class="cover" id="{p}-cover" hidden><button class="btn btn-primary" type="button" id="{p}-cover-btn">' + icon('play') + '<span>{{تشغيل|Play}}</span></button><p id="{p}-cover-note"></p></div>' +
          '</div>' +
          '<p class="src-note" id="{p}-srcnote" role="status"></p>' +
          '<div class="note warn flick-warn" id="{p}-warn" hidden>' +
            '<p><b>{{تنبيه حساسية الضوء|Photosensitivity warning}}</b> — {{هذا المشهد يومض نحو 10 مرات في الثانية (أكثر من 3 ومضات في الثانية). إن كنت حساسًا للضوء الوامض فلا تشغّله. للاختبارات التي لا تحتاج إلى مشاهدة يمكنك أن تبقى في مختبر الخدع حيث تُحلَّل المشاهد دون عرضها.|This scene flashes about 10 times per second (more than 3 flashes per second). If you are sensitive to flashing light, do not start it. The Decoy Lab analyses such scenes without showing them.}}</p>' +
            '<div class="btns"><button class="btn btn-sm btn-primary" type="button" id="{p}-warn-ok">{{ابدأ على كل حال|Start anyway}}</button><button class="btn btn-sm btn-ghost" type="button" id="{p}-warn-no">{{إلغاء|Cancel}}</button></div>' +
          '</div>' +
          '<div class="legend" aria-hidden="true"><span><i class="sw sw-fire"></i>{{قناع اللون الناري|fire-colour mask}}</span><span><i class="sw sw-box"></i>{{مربّع المنطقة|region box}}</span><span><i class="sw sw-smoke"></i>{{قناع الرمادي (لون فقط)|grey mask (colour only)}}</span></div>' +
        '</div>' +
        (fool ? '' :
        '<div class="card controls">' +
          '<div class="panel-h"><span>{{عناصر التحكم|Controls}}</span><button class="btn btn-ghost btn-sm" type="button" id="{p}-reset">' + icon('reset') + '<span>{{أعد ضبط الكاشف|Reset detector}}</span></button></div>' +
          '<div class="ctl-grid">' +
            '<label class="field"><span>τ — {{عتبة اللون|colour threshold}}: <b class="mono" id="{p}-tau-v">40</b></span><input type="range" id="{p}-tau" min="25" max="55" step="1" value="40"><small class="muted">|Cb−Cr| ≥ τ · {{الحساسية|sensitivity}} <span class="mono" id="{p}-sens-v">0.50</span></small></label>' +
            '<div class="field"><span id="{p}-conf-l">{{إطارات التأكيد|Confirm frames}}</span>' +
              '<div class="stepper" role="group" aria-labelledby="{p}-conf-l"><button type="button" class="icon-btn" id="{p}-conf-dn" aria-label="−">−</button><input type="number" class="input mono" id="{p}-conf" min="3" max="20" step="1" value="8" inputmode="numeric"><button type="button" class="icon-btn" id="{p}-conf-up" aria-label="+">+</button></div></div>' +
          '</div>' +
          '<div class="switches">' +
            '<label class="switch"><input type="checkbox" id="{p}-ov-fire" checked><span>{{قناع النار|Fire mask}}</span></label>' +
            '<label class="switch"><input type="checkbox" id="{p}-ov-box" checked><span>{{المربّعات|Boxes}}</span></label>' +
            '<label class="switch"><input type="checkbox" id="{p}-ov-smoke"><span>{{قناع الرمادي|Grey mask}}</span></label>' +
          '</div>' +
          '<p class="muted small">{{الشريط يحرّك العتبات الثلاث معًا كما في fire.js: τ وR_T وS_T. القيمة 40 هي اختيار مؤلفي الورقة من منحنى ROC.|The slider moves the three thresholds together as fire.js does: τ, R_T and S_T. τ = 40 is the papers’ own pick from an ROC curve.}}</p>' +
        '</div>') +
        '<div class="card thermal-card"><div class="panel-h"><span>' + icon('thermo') + ' {{الطبقة C6 — الكاميرا الحرارية|C6 — thermal camera}}</span><span class="tag cool" id="{p}-th-src">SIM</span></div>' +
          '<div class="th-row"><div class="th-wrap"><canvas id="{p}-thermal" width="32" height="24" role="img"></canvas><i class="th-mark" id="{p}-th-mark" aria-hidden="true" hidden></i></div>' +
          '<dl class="th-read">' +
            '<div><dt>T<sub>max</sub></dt><dd class="mono" id="{p}-th-max">–</dd></div>' +
            '<div><dt>{{الخلفية (متوسط ± MAD)|Background (mean ± MAD)}}</dt><dd class="mono" id="{p}-th-bg">–</dd></div>' +
            '<div><dt>{{الحدّ المطلق|Absolute limit}}</dt><dd class="mono" id="{p}-th-abs">≥ 57 °C</dd></div>' +
            '<div><dt>{{الحدّ السياقي|Contextual limit}}</dt><dd class="mono" id="{p}-th-ctx">–</dd></div>' +
            '<div><dt>{{الحكم|Verdict}}</dt><dd id="{p}-th-verdict">–</dd></div>' +
          '</dl></div>' +
          '<div class="th-ctl">' +
            '<label class="field"><span>{{ماذا ترى الكاميرا الحرارية؟|What does the thermal camera see?}}</span><select id="{p}-th-mode"></select></label>' +
            '<label class="field"><span>{{يجب أن تثبت البقعة|The hotspot must hold}}</span><select id="{p}-th-hold"><option value="1000"></option><option value="5000"></option></select></label>' +
          '</div>' +
          '<label class="switch"><input type="checkbox" id="{p}-veto" checked><span>{{النقض الحراري مفعّل|Thermal veto on}}</span></label>' +
          '<div class="btns" id="{p}-ser-row"><button class="btn btn-ghost btn-sm" type="button" id="{p}-ser">' + icon('signal') + '<span>{{وصل اللوحة (Web Serial)|Connect the board (Web Serial)}}</span></button><span class="muted small" id="{p}-ser-st"></span></div>' +
        '</div>' +
      '</div>' +
      '<div class="lab-side">' +
        '<div class="card verdict" id="{p}-verdict" data-state="clear">' +
          '<div class="v-top"><div class="v-state"><span class="dot"></span><b id="{p}-vstate">–</b></div>' +
            '<div class="v-conf"><span class="muted small">{{ثقة الرؤية|Vision confidence}}</span><div class="meter"><i id="{p}-confbar"></i></div><b class="mono" id="{p}-confnum">0%</b></div></div>' +
          '<p class="why" id="{p}-why"></p>' +
          '<p class="muted small" id="{p}-engine"></p>' +
          '<span class="sr-only" id="{p}-sr" role="status" aria-live="polite"></span>' +
        '</div>' +
        '<div class="card lamps-card"><div class="panel-h"><span>{{خط الأنابيب الشفّاف C1 ← C6|The transparent pipeline C1 → C6}}</span><span class="tag cool">{{رؤية حاسوبية بقواعد — ليست ذكاءً اصطناعيًا|rule-based computer vision — not AI}}</span></div><ol class="lamps" id="{p}-lamps"></ol></div>' +
        '<div class="card keys-card"><div class="panel-h"><span>{{المفاتيح الثلاثة|The three keys}}</span></div>' +
          '<ul class="keys-row">' +
            '<li class="key" id="{p}-k-vision" data-on="0">' + icon('eye') + '<b>{{الرؤية|Vision}}</b><small>{{C1–C5|C1–C5}}</small></li>' +
            '<li class="key" id="{p}-k-thermal" data-on="0">' + icon('thermo') + '<b>{{الحرارة|Thermal}}</b><small>C6</small></li>' +
            '<li class="key" id="{p}-k-human" data-on="0">' + icon('users') + '<b>{{الإنسان|Human}}</b><small>{{اعتماد|Approve}}</small></li>' +
          '</ul>' +
          '<ol class="ladder" id="{p}-ladder"></ol>' +
          (fool ? '' :
          '<div class="btns"><button class="btn btn-danger" type="button" id="{p}-approve" disabled>' + icon('bell') + '<span>{{اعتمد وأرسل الإنذار (تمرين)|Approve and send the alert (exercise)}}</span></button>' +
          '<button class="btn btn-ghost" type="button" id="{p}-stand" hidden>{{إنهاء الإنذار|Stand down}}</button></div>') +
          '<p class="muted small" id="{p}-keynote"></p>' +
        '</div>' +
        (fool ? '' : '<div class="card log-card"><div class="panel-h"><span>{{سجلّ الأحداث|Event log}}</span></div><ul class="log" id="{p}-log" role="log" aria-live="polite"></ul></div>') +
      '</div></div>';
  }

  /* ===================================================================== the stage (video + pipeline + indicators) */
  var LAYER_FMT = {
    C1: { max: 0.05, sqrt: true, f: function (v) { return num(v * 100, 2) + '%'; } },
    C2: { max: 0.5, f: function (v) { return num(v * 100, 0) + '%'; } },
    C3: { max: 1, f: function (v) { return num(v, 2); } },
    C4: { max: 1, f: function (v) { return num(v, 2); } },
    C5: { max: 1, f: function (v) { return num(v, 0); } },
    C6: { lo: 20, max: 120, f: function (v) { return num(v, 0) + ' °C'; } }
  };
  var SCENE_TH = {}; // scene id → what the SIM thermal camera shows (documentation for the UI)

  function createStage(host, mode, pre, sceneIds) {
    var fool = mode === 'fool', P = pre, FPSV = Lab.FPS;
    host.innerHTML = tpl(stageTemplate(fool), { p: P });
    var ui = {};
    ['view', 'badge', 'fps', 'ms', 'cover', 'cover-btn', 'cover-note', 'srcnote', 'warn', 'warn-ok', 'warn-no', 'scenes', 'cam', 'file', 'play', 'verdict', 'vstate', 'confbar', 'confnum', 'why', 'engine', 'sr', 'lamps', 'k-vision', 'k-thermal', 'k-human', 'ladder', 'keynote',
      'thermal', 'th-mark', 'th-src', 'th-max', 'th-bg', 'th-abs', 'th-ctx', 'th-verdict', 'th-mode', 'th-hold', 'veto', 'ser', 'ser-st', 'ser-row', 'reset', 'tau', 'tau-v', 'sens-v', 'conf', 'conf-dn', 'conf-up', 'ov-fire', 'ov-box', 'ov-smoke', 'approve', 'stand', 'log'
    ].forEach(function (k) { ui[k] = document.getElementById(P + '-' + k); });
    var ctx = ui.view.getContext('2d', { willReadFrequently: true }), tctx = ui.thermal.getContext('2d');
    var ov = document.createElement('canvas'), octx = ov.getContext('2d'), ovImg = null, thImg = tctx.createImageData(32, 24);
    var video = document.createElement('video'); video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true'); video.className = 'sr-only'; host.appendChild(video);
    var pipe = Lab.createPipeline({ tau: 40, confirmFrames: 8 });
    var st = { mode: mode, kind: null, sceneId: null, scene: null, k: 0, t0: 0, playing: false, wantPlay: false, active: true, raf: 0, w: 320, h: 240, out: null, grid: null, human: false, hidden: false, frames: 0, fpsN: 0, fpsT: 0, msAvg: 0,
      logT0: NOW(), pend: { s: null, n: 0 }, shown: 'clear', onFrame: null, flickOK: false, still: null, stillFrame: null, objURL: null, vfNew: false, vfNow: 0, vfMeta: null, vfOn: false, lastVT: -1, camT0: 0, lastProc: 0, sig: null, lastMsg: null, note: null, camState: 'idle', image: null };

    /* ---------- options ---------- */
    function curOpts() {
      return { tau: ui.tau ? +ui.tau.value : 40, confirmFrames: ui.conf ? clamp(+ui.conf.value || 8, 3, 20) : 8, veto: ui.veto.checked, sustainMs: +ui['th-hold'].value || 1000 };
    }
    function pushOpts() { pipe.setOptions(curOpts()); if (st.kind === 'image' && st.image) processStill(); }
    function setSize(w, h) {
      if (st.w === w && st.h === h && ovImg) return;
      st.w = w; st.h = h; ui.view.width = w; ui.view.height = h; ov.width = w; ov.height = h; ovImg = octx.createImageData(w, h); ui.view.style.aspectRatio = w + ' / ' + h; pipe.reset();
    }
    setSize(320, 240);

    /* ---------- log ---------- */
    function logEvent(text, kind) {
      if (!ui.log) return;
      var li = el('li', kind || ''), tm = el('span', 'mono muted', Manara.clock((NOW() - st.logT0) / 1000)); li.appendChild(tm); li.appendChild(document.createTextNode(' ' + text));
      ui.log.insertBefore(li, ui.log.firstChild);
      while (ui.log.children.length > LOGCAP) ui.log.removeChild(ui.log.lastChild);
    }

    /* ---------- selects / labels that follow the language ---------- */
    function fillSelects() {
      var cur = ui['th-mode'].value || 'auto'; clear(ui['th-mode']);
      TH_MODES.forEach(function (m) { if (m.v === 'live' && !Ser.supported) return; var o = el('option', '', L(m.l)); o.value = m.v; ui['th-mode'].appendChild(o); });
      ui['th-mode'].value = cur;
      var hold = ui['th-hold'].children; hold[0].textContent = L(T2('ثانية واحدة (عرض)', '1 s (demo)')); hold[1].textContent = L(T2('5 ثوانٍ (قاعدة الحسّاس)', '5 s (sentinel rule)'));
      ui.play.lastChild.textContent = st.playing ? L(T2('إيقاف مؤقت', 'Pause')) : L(T2('تشغيل', 'Play'));
      $$('.chip', ui.scenes).forEach(function (c) { var id = c.getAttribute('data-scene'); c.lastChild.textContent = L(SCENE_INFO[id]); });
    }
    bindAttr(ui.view, 'aria-label', 'عرض ما يراه الكاشف بدقة 320 بكسل مع قناع اللون الناري ومربّعات المناطق', 'What the detector sees at 320 px, with the fire-colour mask and region boxes');
    bindAttr(ui.thermal, 'aria-label', 'صورة حرارية محاكاة بدقة 32×24', 'Thermal image 32×24 (simulated unless a live board is connected)');
    bindAttr(ui.scenes, 'aria-label', 'مشاهد مدمجة مولَّدة بالشيفرة', 'Built-in code-generated scenes');

    /* ---------- lamps ---------- */
    var lamps = LAYER_INFO.map(function (li, i) {
      var row = el('li', 'lamp'); row.setAttribute('data-id', li.id); row.setAttribute('data-state', 'off');
      row.innerHTML = '<span class="bulb" aria-hidden="true"></span><div class="lamp-body"><div class="lamp-t"><b></b><span class="lamp-n"></span><span class="lamp-flag tag"></span></div>' +
        '<div class="meter"><i></i><u></u></div><div class="lamp-v"><span class="mono lamp-val"></span><span class="muted lamp-thr"></span></div><p class="lamp-d muted small"></p></div>';
      ui.lamps.appendChild(row);
      return { row: row, b: $('b', row), n: $('.lamp-n', row), flag: $('.lamp-flag', row), fill: $('.meter i', row), tick: $('.meter u', row), val: $('.lamp-val', row), thr: $('.lamp-thr', row), d: $('.lamp-d', row) };
    });
    function fillLampText() { LAYER_INFO.forEach(function (li, i) { lamps[i].b.textContent = li.id; lamps[i].n.textContent = L(li.name); lamps[i].d.textContent = L(li.desc); }); }
    function meterPos(id, v, thr, cf) {
      var f = LAYER_FMT[id], x, t;
      if (id === 'C5') { x = v / (2 * cf); t = 0.5; }
      else if (id === 'C6') { var lo = f.lo; x = v == null ? 0 : (v - lo) / (f.max - lo); t = thr ? (thr - lo) / (f.max - lo) : 0; }
      else if (f.sqrt) { x = M.sqrt(max(0, v) / f.max); t = M.sqrt(thr / f.max); }
      else { x = v / f.max; t = thr / f.max; }
      return [sat(x), sat(t)];
    }
    function renderLamps(out) {
      var cf = out.opts.confirmFrames;
      out.layers.forEach(function (lay, i) {
        var R = lamps[i], id = lay.id, s = lay.na ? 'na' : (id === 'C6' && lay.veto) ? 'veto' : lay.on ? 'on' : 'off';
        R.row.setAttribute('data-state', s);
        var mp = meterPos(id, lay.v, lay.thr, cf);
        R.fill.style.width = (lay.na ? 0 : mp[0] * 100) + '%'; R.tick.style.insetInlineStart = (lay.na ? 0 : mp[1] * 100) + '%'; R.tick.style.display = lay.na ? 'none' : '';
        var F = LAYER_FMT[id];
        if (lay.na) { R.val.textContent = id === 'C6' ? L(T2('لا بيانات حرارية', 'no thermal data')) : L(T2('غير متاح لهذا المُدخَل', 'N/A for this stimulus')); R.thr.textContent = ''; }
        else if (id === 'C5') { R.val.textContent = num(lay.v, 0); R.thr.textContent = '  (≥ ' + num(cf, 0) + ')'; }
        else { R.val.textContent = lay.v == null ? '–' : F.f(lay.v); R.thr.textContent = lay.thr ? '  (≥ ' + F.f(lay.thr) + ')' : ''; }
        R.flag.className = 'lamp-flag tag ' + (s === 'on' ? 'danger' : s === 'veto' ? 'cool' : 'muted-tag');
        R.flag.textContent = s === 'on' ? L(id === 'C6' ? T2('ساخن ✓', 'hot ✓') : T2('دليل ✓', 'evidence ✓')) : s === 'veto' ? L(T2('بارد — نقض', 'cold — veto')) : s === 'na' ? 'N/A' : L(id === 'C6' ? T2('بارد', 'cold') : T2('مرفوض', 'rejected'));
      });
    }

    /* ---------- ladder / keys ---------- */
    var ladderEls = LADDER.map(function (s) { var li = el('li', 'step'); li.setAttribute('data-step', s.id); ui.ladder.appendChild(li); return li; });
    function renderKeys(out) {
      var kv = out.keys.vision, kt = out.keys.thermal === true;
      ui['k-vision'].setAttribute('data-on', kv ? '1' : '0'); ui['k-thermal'].setAttribute('data-on', kt ? '1' : '0'); ui['k-human'].setAttribute('data-on', st.human ? '1' : '0');
      ui['k-thermal'].setAttribute('data-na', out.keys.thermal == null ? '1' : '0');
      var lvl = Lab.ladderOf(kv, kt, st.human && kv && kt);
      if (out.still) lvl = out.state === 'suspect' ? 'suspect' : 'clear';
      else if (lvl === 'clear' && out.state === 'suspect') lvl = 'suspect';
      ladderEls.forEach(function (li, i) { li.textContent = L(LADDER[i].l); li.setAttribute('data-on', LADDER[i].id === lvl ? '1' : '0'); if (LADDER[i].id === lvl) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      ui.ladder.setAttribute('data-level', lvl);
      var note;
      if (st.human) note = T2('اعتُمد: أُرسلت رسالة «detection» إلى غرفة العمليات (تمرين). غرفة العمليات تقترح الوحدات الأسرع وصولًا بحسب الازدحام (محاكاة).', 'Approved: a “detection” message was sent to Mission Control (exercise). Mission Control then recommends the responders who would arrive fastest given traffic (simulated).');
      else if (out.canApprove) note = T2('مفتاحان مضاءان. الإنذار العام لا يخرج إلا بموافقتك.', 'Two keys are lit. A public alert only goes out when you approve it.');
      else if (kv && out.keys.thermal !== true) note = T2('مفتاح الرؤية وحده مضاء: أعلى ما يبلغه الاشتباه — لا إنذار عام.', 'Only the vision key is lit: it stays at SUSPECT — no public alert.');
      else note = T2('الرؤية وحدها لا تتجاوز الاشتباه في أي إنذار عام. مفتاحان + إنسان = إنذار عام.', 'Vision alone can never go beyond SUSPECT for a public alert. Two keys + a human = PUBLIC ALERT.');
      ui.keynote.textContent = L(note);
      if (ui.approve) { ui.approve.disabled = !(out.canApprove && !st.human); ui.stand.hidden = !st.human; }
    }

    /* ---------- thermal ---------- */
    function renderThermal(grid, th, info) {
      var d = thImg.data, i;
      ui['th-src'].textContent = !grid ? 'N/A' : info.src === 'LIVE' ? (info.approx ? 'LIVE · ' + L(T2('ملخّص فقط', 'summary only')) : 'LIVE') : 'SIM';
      ui['th-src'].className = 'tag ' + (info && info.src === 'LIVE' ? 'safe' : 'cool');
      if (!grid) { for (i = 0; i < 768; i++) { d[i * 4] = 20; d[i * 4 + 1] = 26; d[i * 4 + 2] = 38; d[i * 4 + 3] = 255; } tctx.putImageData(thImg, 0, 0); ui['th-mark'].hidden = true;
        ui['th-max'].textContent = '–'; ui['th-bg'].textContent = '–'; ui['th-ctx'].textContent = '–'; ui['th-verdict'].textContent = L(info && info.wait ? T2('بانتظار اللوحة…', 'waiting for the board…') : T2('غير متاح', 'N/A')); ui['th-verdict'].className = ''; return; }
      for (i = 0; i < 768; i++) { var c = ironbow((grid[i] - 20) / 100); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
      tctx.putImageData(thImg, 0, 0);
      ui['th-max'].textContent = num(th.tmax, 1) + ' °C'; ui['th-bg'].textContent = num(th.bgMean, 1) + ' ± ' + num(th.mad, 2); ui['th-ctx'].textContent = '> ' + num(th.ctxThr, 1) + ' °C';
      ui['th-mark'].hidden = false; ui['th-mark'].style.insetInlineStart = (th.x * 100) + '%'; ui['th-mark'].style.insetBlockStart = (th.y * 100) + '%';
      var held = st.out && st.out.layers[5].on;
      ui['th-verdict'].textContent = th.hot ? (held ? L(T2('ساخن — ثابت ✓', 'HOT — held ✓')) : L(T2('ساخن (يُراقَب الثبات)…', 'hot (checking it holds)…'))) : L(T2('ليس ساخنًا', 'not hot'));
      ui['th-verdict'].className = th.hot ? 'v-hot' : 'v-cold';
    }
    function thermalFor() {
      var mode = ui['th-mode'].value, blobs, hint = null, o = st.out;
      if (mode === 'off') return { grid: null, src: 'N/A' };
      if (mode === 'live') { if (Ser.fresh()) return { grid: Ser.grid, src: 'LIVE', approx: Ser.summary }; return { grid: null, src: 'LIVE', wait: true }; }
      if (mode === 'auto') blobs = st.scene ? st.scene.heat(st.k) : [];
      else {
        if (o && o.analysis) { var rg = o.analysis.regions.filter(function (r) { return r.kind === 'fire'; })[0]; if (rg) hint = { x: (rg.x + rg.w / 2) / st.w, y: (rg.y + rg.h / 2) / st.h }; }
        blobs = mode === 'cold' ? [] : Lab.modeBlobs(mode, hint);
      }
      return { grid: Lab.thermalGrid(blobs, st.k, st.scene ? 1 : 3), src: 'SIM' };
    }

    /* ---------- drawing ---------- */
    function drawOverlay(out) {
      if (st.hidden) return;
      var a = out.analysis, n = st.w * st.h, i, d, wantF = ui['ov-fire'] ? ui['ov-fire'].checked : true, wantS = ui['ov-smoke'] ? ui['ov-smoke'].checked : false, wantB = ui['ov-box'] ? ui['ov-box'].checked : true;
      if ((wantF || wantS) && a.fireMask.length === n) {
        d = ovImg.data; d.fill(0);
        var fr = TK.rgb.danger, sr = TK.rgb.info;
        for (i = 0; i < n; i++) {
          if (wantF && a.fireMask[i]) { var p = i * 4; d[p] = fr[0]; d[p + 1] = fr[1]; d[p + 2] = fr[2]; d[p + 3] = 140; }
          else if (wantS && a.smokeMask[i]) { var p2 = i * 4; d[p2] = sr[0]; d[p2 + 1] = sr[1]; d[p2 + 2] = sr[2]; d[p2 + 3] = 70; }
        }
        octx.putImageData(ovImg, 0, 0); ctx.drawImage(ov, 0, 0);
      }
      if (wantB) a.regions.forEach(function (r) {
        ctx.lineWidth = 2; ctx.strokeStyle = r.kind === 'fire' ? TK.danger : TK.info; ctx.setLineDash(r.kind === 'fire' ? [] : [5, 3]);
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      });
      ctx.setLineDash([]);
    }
    function render(out, info) {
      var s = out.state;
      ui.badge.setAttribute('data-state', s); ui.badge.children[1].textContent = L(STATE_L[s]); ui.badge.children[2].textContent = pct(out.confidence);
      ui.verdict.setAttribute('data-state', s);
      ui.vstate.textContent = L(STATE_L[s]) + (out.vetoed ? ' · ' + L(T2('نقض حراري', 'thermal veto')) : (out.visionState === 'fire' && s === 'fire' && out.keys.thermal !== true ? ' · ' + L(T2('كاميرا فقط', 'camera only')) : ''));
      ui.confbar.style.width = (out.confidence * 100) + '%'; ui.confnum.textContent = pct(out.confidence);
      ui.why.textContent = L(WHY[out.why] || WHY.none);
      var e = out.engine;
      ui.engine.textContent = out.still ? '' : L(T2('محرّك fire.js وحده: ', 'fire.js engine alone: ')) + L(STATE_L[e.state]) + ' · ' + L(T2('وميض ', 'flicker ')) + num(e.flicker, 2) + ' · ' + L(T2('نمو ', 'growth ')) + num(e.growth, 2);
      renderLamps(out); renderKeys(out); renderThermal(info ? info.grid : null, out.thermal, info || {});
      // calm state announcements (3 frames in a row) into the log + the polite status region
      if (out.state === st.pend.s) st.pend.n++; else { st.pend.s = out.state; st.pend.n = 1; }
      if (st.pend.n === 3 && st.shown !== out.state) {
        st.shown = out.state; var msg = L(STATE_L[out.state]) + ' — ' + L(WHY[out.why] || WHY.none);
        logEvent(msg, out.state === 'fire' ? 'danger' : out.state === 'suspect' ? 'warn' : ''); ui.sr.textContent = msg;
      }
    }
    function renderStatus() {
      var s;
      if (st.note) s = st.note;
      else if (st.kind === 'scene') s = T2('مشهد مدمج مولَّد بالشيفرة (محاكاة SIM) · ' + st.w + '×' + st.h + ' · 15 إطارًا في الثانية على ساعة افتراضية', 'Built-in code-generated scene (SIM) · ' + st.w + '×' + st.h + ' · 15 fps on a virtual clock');
      else if (st.kind === 'camera') s = T2('الكاميرا الحيّة · يعمل الكاشف على ' + st.w + '×' + st.h + ' بكسل', 'Live camera · the detector works on ' + st.w + '×' + st.h + ' px');
      else if (st.kind === 'video') s = T2('ملف فيديو من جهازك · لا يُرسَل إلى أي مكان', 'Video file from your device · it is not sent anywhere');
      else if (st.kind === 'image') s = T2('صورة من جهازك (صورة ثابتة: طبقتا C1 وC4 فقط) · لا تُرسَل إلى أي مكان', 'Picture from your device (a still: only C1 and C4 exist) · it is not sent anywhere');
      else s = T2('اختر مشهدًا أو الكاميرا أو ملفًا.', 'Pick a scene, the camera or a file.');
      ui.srcnote.textContent = L(s);
      if (st.hidden) ui.srcnote.textContent += ' — ' + L(T2('العرض مجمَّد بسبب إعداد «تقليل الحركة»؛ التحليل يعمل والمؤشرات تتغيّر.', 'Display frozen because of your reduced-motion setting; the analysis still runs and the lamps still change.'));
    }

    /* ---------- one frame ---------- */
    function processFrame(frame, tMs, still) {
      var t0 = NOW(), info = thermalFor(), out = pipe.push(frame, tMs, info.grid);
      st.out = out; st.grid = info;
      drawOverlay(out); render(out, info);
      var dt = NOW() - t0; st.msAvg = st.msAvg ? st.msAvg * 0.9 + dt * 0.1 : dt; st.frames++;
      if (!st.fpsT) st.fpsT = t0;
      st.fpsN++;
      if (t0 - st.fpsT >= 1000) { ui.fps.textContent = num(st.fpsN * 1000 / (t0 - st.fpsT), 0); ui.ms.textContent = num(st.msAvg, 1); st.fpsN = 0; st.fpsT = t0; }
      if (st.onFrame) st.onFrame(out, info, st.k);
      return out;
    }
    function processStill() {
      var img = st.image; if (!img) return;
      var cw = img.naturalWidth || img.width, chh = img.naturalHeight || img.height, sc = min(1, 320 / cw, 320 / chh), w = max(8, round(cw * sc)), h = max(8, round(chh * sc));
      setSize(w, h); ctx.drawImage(img, 0, 0, w, h);
      var fr = ctx.getImageData(0, 0, w, h), s = Lab.scoreStill(fr, curOpts().tau), D = Lab.DEFAULTS;
      var vis = s.label === 'fire' || s.label === 'smoke';
      var out = { t: 0, state: vis ? 'suspect' : 'clear', visionState: vis ? 'suspect' : 'clear', vetoed: false, confidence: r3(max(s.fire, s.smoke) * 0.5), ladder: vis ? 'suspect' : 'clear', why: vis ? 'still' : 'none', canApprove: false, keys: { vision: false, thermal: null }, still: true,
        layers: [{ id: 'C1', on: s.c1, v: s.analysis.fireRatio, thr: D.minFireRatio }, { id: 'C2', on: false, na: true }, { id: 'C3', on: false, na: true }, { id: 'C4', on: s.c4, v: s.features.fire, thr: 0.5 }, { id: 'C5', on: false, na: true }, { id: 'C6', on: false, na: true }],
        engine: { state: s.label === 'none' ? 'clear' : s.label, flicker: 0, growth: 0 }, analysis: s.analysis, features: s.features, thermal: null, opts: curOpts() };
      st.out = out; drawOverlay(out); render(out, { grid: null, src: 'N/A' }); renderStatus();
      logEvent(L(T2('صورة: ', 'Picture: ')) + L(STATE_L[out.state]) + ' (' + L(T2('الحكم المستقل للصور: ', 'still-image verdict: ')) + s.label + ')', vis ? 'warn' : '');
    }
    function drawSource(frameData) { ctx.putImageData(new ImageData(frameData, st.w, st.h), 0, 0); }

    /* ---------- loops ---------- */
    function stepScene(ts) {
      if (!st.t0) st.t0 = ts - st.k * 1000 / FPSV;
      var due = floor((ts - st.t0) * FPSV / 1000);
      if (due < st.k) return;
      if (due - st.k > 3) st.k = due;
      var d = st.scene.frame(st.k);
      if (st.hidden) ctx.putImageData(new ImageData(st.stillFrame, st.w, st.h), 0, 0); else drawSource(d);
      processFrame({ data: d, width: st.w, height: st.h }, st.k * 1000 / FPSV);
      st.k++;
    }
    function frameSig(fr) { var d = fr.data, n = d.length, s = 0, step = max(4, (n >> 6) & ~3); for (var i = 0; i < n; i += step) s = (s * 31 + d[i] + (d[i + 1] << 1) + (d[i + 2] << 2)) | 0; return s; }
    function stepVideo(ts) {
      if (video.readyState < 2 || !video.videoWidth) return;
      var tMs;
      if (st.vfOn) { if (!st.vfNew) return; st.vfNew = false; tMs = st.kind === 'video' ? (st.vfMeta && st.vfMeta.mediaTime != null ? st.vfMeta.mediaTime * 1000 : video.currentTime * 1000) : st.vfNow - st.camT0; }
      else { if (ts - st.lastProc < 60) return; tMs = st.kind === 'video' ? video.currentTime * 1000 : ts - st.camT0; if (st.kind === 'video' && video.currentTime === st.lastVT) return; }
      if (st.kind === 'video') { if (st.lastVT > video.currentTime + 0.2) pipe.reset(); st.lastVT = video.currentTime; }
      st.lastProc = ts;
      var vw = video.videoWidth, vh = video.videoHeight, sc = min(1, 320 / vw, 320 / vh), w = max(8, round(vw * sc)), h = max(8, round(vh * sc));
      setSize(w, h); ctx.drawImage(video, 0, 0, w, h);
      var fr = ctx.getImageData(0, 0, w, h);
      if (!st.vfOn && st.kind === 'camera') { var sg = frameSig(fr); if (sg === st.sig) return; st.sig = sg; }
      st.k++; processFrame(fr, tMs);
    }
    function loop(ts) {
      st.raf = 0; if (!st.playing) return;
      try { if (st.kind === 'scene') stepScene(ts); else if (st.kind === 'camera' || st.kind === 'video') stepVideo(ts); } catch (e) { console.error(e); }
      if (st.playing) st.raf = requestAnimationFrame(loop);
    }
    function updatePlayUI() {
      ui.play.firstChild && (ui.play.innerHTML = icon(st.playing ? 'pause' : 'play') + '<span>' + L(st.playing ? T2('إيقاف مؤقت', 'Pause') : T2('تشغيل', 'Play')) + '</span>');
      var showCover = !st.playing && st.kind && st.kind !== 'image' && !st.flickPending;
      ui.cover.hidden = !showCover;
      if (showCover) ui['cover-note'].textContent = rmQuery() && st.wantPaused ? L(T2('متوقف احترامًا لإعداد «تقليل الحركة» في جهازك — اضغط تشغيل لتحريك المشهد.', 'Paused to respect your reduced-motion setting — press Play to animate.')) : L(WHY.paused);
      ui.play.disabled = !st.kind || st.kind === 'image';
    }
    function play() {
      if (!st.kind || st.kind === 'image') return;
      st.wantPlay = true; if (!st.active) return;
      if (st.playing) return;
      st.playing = true; st.t0 = 0; st.camT0 = NOW(); if (st.kind === 'camera') pipe.reset(); if (st.kind === 'video' || st.kind === 'camera') { video.play && video.play().catch(function () {}); }
      st.raf = requestAnimationFrame(loop); updatePlayUI();
    }
    function pause(user) {
      if (user) st.wantPlay = false;
      st.playing = false; if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
      if ((st.kind === 'video') && video.pause) video.pause();
      st.wantPaused = !!user && rmQuery(); updatePlayUI();
    }
    function setActive(on) { st.active = on; if (!on) { var w = st.wantPlay; pause(false); st.wantPlay = w; } else if (st.wantPlay) play(); }

    /* ---------- sources ---------- */
    function stopSource() {
      pause(false);
      if (st.kind === 'camera') { try { video.srcObject = null; } catch (e) { /* ignore */ } Cam.release(); }
      if (st.kind === 'video') { video.pause(); video.removeAttribute('src'); try { video.load(); } catch (e) { /* ignore */ } }
      if (st.objURL) { try { URL.revokeObjectURL(st.objURL); } catch (e) { /* ignore */ } st.objURL = null; }
      st.image = null; st.kind = null; st.scene = null; st.hidden = false; st.stillFrame = null;
    }
    function fresh(kind) {
      st.k = 0; st.t0 = 0; st.lastT = 0; st.out = null; st.human = false; st.pend = { s: null, n: 0 }; st.shown = 'clear'; st.logT0 = NOW(); st.lastVT = -1; st.sig = null; st.vfNew = false; st.note = null; st.frames = 0; st.fpsT = 0; st.fpsN = 0;
      pipe.reset(); st.kind = kind;
    }
    function markChips() {
      $$('.chip', ui.scenes).forEach(function (c) { c.setAttribute('aria-pressed', st.kind === 'scene' && c.getAttribute('data-scene') === st.sceneId ? 'true' : 'false'); });
      ui.cam.setAttribute('aria-pressed', st.kind === 'camera' ? 'true' : 'false');
    }
    function startScene(id, seed) {
      stopSource(); fresh('scene'); st.sceneId = id; st.scene = Lab.makeScene(id, 320, 240, seed || 1); setSize(320, 240);
      var info = SCENE_INFO[id]; st.flickPending = false;
      if (id === 'flicker' && rmQuery()) { st.hidden = true; st.stillFrame = new Uint8ClampedArray(st.scene.frame(0)); }
      markChips(); renderStatus(); logEvent(L(T2('مصدر: ', 'Source: ')) + L(info)); if (st.onSource) st.onSource('scene', id);
      if (rmQuery() && st.mode === 'live' && !st.userPlayed) { prefill(28); st.wantPaused = true; st.wantPlay = false; updatePlayUI(); }
      else play();
    }
    function prefill(n) { // reduced motion: compute the first frames silently and show the last one, paused
      for (var i = 0; i < n; i++) { st.k = i; var d = st.scene.frame(i); if (i === n - 1) { if (st.hidden) ctx.putImageData(new ImageData(st.stillFrame, st.w, st.h), 0, 0); else drawSource(d); processFrame({ data: d, width: st.w, height: st.h }, i * 1000 / FPSV); } else pipe.push({ data: d, width: st.w, height: st.h }, i * 1000 / FPSV, Lab.thermalGrid(st.scene.heat(i), i, 1)); }
      st.k = n;
    }
    function pickScene(id) {
      if (id === 'flicker' && !rmQuery() && !st.flickOK) { ui.warn.hidden = false; st.flickPending = true; updatePlayUI(); ui['warn-ok'].focus(); return; }
      ui.warn.hidden = true; st.userPlayed = true; startScene(id);
    }
    function useCamera() {
      st.note = T2('جارٍ طلب إذن الكاميرا…', 'Asking for the camera…'); renderStatus();
      Cam.acquire().then(function (state) {
        if (state !== 'live') {
          Cam.release(); st.note = null; var msg = state === 'denied' ? T2('رُفض إذن الكاميرا. لا بأس: استعمل مشهدًا مدمجًا أو ارفع ملفًا.', 'Camera permission was denied. No problem: use a built-in scene or upload a file.')
            : state === 'none' ? T2('لا توجد كاميرا متاحة على هذا الجهاز. استعمل مشهدًا مدمجًا أو ارفع ملفًا.', 'No camera is available on this device. Use a built-in scene or upload a file.') : T2('تعذّر تشغيل الكاميرا. استعمل مشهدًا مدمجًا أو ارفع ملفًا.', 'The camera could not start. Use a built-in scene or upload a file.');
          st.camState = state; ui.srcnote.textContent = L(msg); ui.srcnote.setAttribute('data-kind', 'error'); logEvent(L(msg), 'warn');
          if (!st.kind) startScene(sceneIds[0]);
          return;
        }
        ui.srcnote.removeAttribute('data-kind'); stopSource(); fresh('camera'); st.camState = 'live'; st.userPlayed = true;
        video.srcObject = Cam.stream; video.loop = false;
        video.play().catch(function () {});
        startRVFC(); markChips(); renderStatus(); logEvent(L(T2('مصدر: الكاميرا الحيّة', 'Source: live camera'))); if (st.onSource) st.onSource('camera'); play();
      });
    }
    function startRVFC() {
      if (st.vfOn || !video.requestVideoFrameCallback) return;
      st.vfOn = true;
      (function vf(now, meta) { st.vfNew = true; st.vfNow = now; st.vfMeta = meta; video.requestVideoFrameCallback(vf); })(0, null); st.vfNew = false;
    }
    function useFile(file) {
      if (!file) return;
      var isVideo = /^video\//.test(file.type), isImage = /^image\//.test(file.type);
      if (!isVideo && !isImage) { ui.srcnote.textContent = L(T2('نوع الملف غير مدعوم: اختر صورة أو فيديو.', 'Unsupported file: pick a picture or a video.')); return; }
      var u = URL.createObjectURL(file);
      stopSource(); fresh(isVideo ? 'video' : 'image'); st.objURL = u; st.userPlayed = true;
      if (isVideo) {
        video.src = u; video.loop = true; video.muted = true; startRVFC();
        var ready = function () { video.removeEventListener('loadeddata', ready); markChips(); renderStatus(); logEvent(L(T2('مصدر: ملف فيديو', 'Source: video file'))); if (st.onSource) st.onSource('video'); play(); };
        video.addEventListener('loadeddata', ready); video.addEventListener('error', function () { ui.srcnote.textContent = L(T2('تعذّر قراءة الفيديو.', 'The video could not be read.')); }, { once: true });
      } else {
        var img = new Image();
        img.onload = function () { st.image = img; markChips(); updatePlayUI(); processStill(); if (st.onSource) st.onSource('image'); };
        img.onerror = function () { ui.srcnote.textContent = L(T2('تعذّر قراءة الصورة.', 'The picture could not be read.')); };
        img.src = u;
      }
    }

    /* ---------- approve / stand down ---------- */
    function snapshot() { try { for (var qn = 0.7; qn > 0.2; qn -= 0.15) { var u = ui.view.toDataURL('image/jpeg', qn); if (u.length <= 53000) return u; } } catch (e) { /* tainted or unsupported */ } return null; }
    function srcName() { return st.kind === 'camera' ? 'camera' : st.kind === 'image' ? 'image' : 'video'; }
    function approve() {
      var out = st.out; if (!out || !out.canApprove || st.human) return;
      var msg = { type: 'detection', source: srcName(), state: 'fire', confidence: out.confidence, fireRatio: r3(out.analysis.fireRatio), smokeRatio: r3(out.analysis.smokeRatio) }, snap = snapshot();
      if (snap) msg.snapshot = snap;
      var sent = Manara.link.send(msg); st.human = true; st.lastMsg = sent;
      logEvent(L(T2('اعتماد بشري ← إنذار عام (تمرين) أُرسل إلى غرفة العمليات', 'Human approval → PUBLIC ALERT (exercise) sent to Mission Control')), 'danger');
      Manara.toast(T2('أُرسل الإنذار (تمرين) إلى غرفة العمليات', 'Alert (exercise) sent to Mission Control'), 'danger'); render(out, st.grid);
    }
    function standDown() {
      if (!st.human) return; st.human = false;
      st.lastMsg = Manara.link.send({ type: 'detection', source: srcName(), state: 'clear', confidence: 0, fireRatio: 0, smokeRatio: 0 });
      logEvent(L(T2('أُنهي الإنذار', 'Stood down')), 'safe'); if (st.out) render(st.out, st.grid);
    }

    /* ---------- wire the controls ---------- */
    sceneIds.forEach(function (id) {
      var c = el('button', 'chip'); c.type = 'button'; c.id = P + '-sc-' + id; c.setAttribute('data-scene', id); c.setAttribute('aria-pressed', 'false');
      if (id === 'flicker') c.insertAdjacentHTML('beforeend', icon('alert'));
      c.appendChild(el('span', '', L(SCENE_INFO[id]))); c.addEventListener('click', function () { pickScene(id); });
      ui.scenes.appendChild(c);
    });
    ui.cam.addEventListener('click', useCamera);
    ui.file.addEventListener('change', function () { useFile(ui.file.files && ui.file.files[0]); ui.file.value = ''; });
    ui.play.addEventListener('click', function () { if (st.playing) pause(true); else { st.userPlayed = true; st.wantPaused = false; play(); } });
    ui['cover-btn'].addEventListener('click', function () { st.userPlayed = true; st.wantPaused = false; play(); });
    ui['warn-ok'].addEventListener('click', function () { st.flickOK = true; ui.warn.hidden = true; st.flickPending = false; st.userPlayed = true; startScene('flicker'); });
    ui['warn-no'].addEventListener('click', function () { ui.warn.hidden = true; st.flickPending = false; updatePlayUI(); });
    ui.veto.addEventListener('change', pushOpts); ui['th-mode'].addEventListener('change', function () { pushOpts(); }); ui['th-hold'].addEventListener('change', pushOpts);
    if (!fool) {
      ui.tau.addEventListener('input', function () { ui['tau-v'].textContent = ui.tau.value; ui['sens-v'].textContent = num(Lab.tauToSens(+ui.tau.value), 2); pushOpts(); });
      var setConf = function (v) { ui.conf.value = clamp(v, 3, 20); pushOpts(); };
      ui.conf.addEventListener('change', function () { setConf(+ui.conf.value || 8); });
      ui['conf-dn'].addEventListener('click', function () { setConf((+ui.conf.value || 8) - 1); }); ui['conf-up'].addEventListener('click', function () { setConf((+ui.conf.value || 8) + 1); });
      ui.reset.addEventListener('click', function () { pipe.reset(); st.human = false; st.pend = { s: null, n: 0 }; st.shown = 'clear'; logEvent(L(T2('أُعيد ضبط الكاشف', 'Detector reset'))); });
      ui.approve.addEventListener('click', approve); ui.stand.addEventListener('click', standDown);
    }
    // Web Serial
    if (!Ser.supported) ui['ser-row'].hidden = true;
    function serUI() {
      var m = { idle: T2('غير موصول', 'not connected'), connecting: T2('جارٍ الاتصال…', 'connecting…'), live: T2('موصول — ' + Ser.lines + ' رسالة', 'connected — ' + Ser.lines + ' messages'), error: T2('خطأ في الاتصال', 'connection error') };
      ui['ser-st'].textContent = L(m[Ser.state] || m.idle) + (Ser.state === 'live' && Ser.summary ? ' · ' + L(T2('ملخّص فقط (بلا شبكة)', 'summary only (no grid)')) : '');
      ui.ser.setAttribute('aria-pressed', Ser.state === 'live' ? 'true' : 'false');
    }
    ui.ser.addEventListener('click', function () { if (Ser.state === 'live') Ser.disconnect(); else Ser.connect().then(function (ok) { if (ok) { ui['th-mode'].value = 'live'; pushOpts(); logEvent(L(T2('اللوحة موصولة (Web Serial)', 'Board connected (Web Serial)'))); } }); });
    Ser.listeners.push(serUI); serUI();
    ui['th-mark'].hidden = true;

    fillSelects(); fillLampText(); updatePlayUI(); renderStatus();
    function relang() { fillSelects(); fillLampText(); renderStatus(); updatePlayUI(); if (st.out) render(st.out, st.grid); serUI(); }
    window.addEventListener('langchange', relang);
    return {
      st: st, ui: ui, pipe: pipe, startScene: startScene, pickScene: pickScene, play: play, pause: pause, setActive: setActive, useCamera: useCamera, useFile: useFile,
      approve: approve, standDown: standDown, out: function () { return st.out; }, setOnFrame: function (f) { st.onFrame = f; }, setOnSource: function (f) { st.onSource = f; }, curOpts: curOpts, logEvent: logEvent, resetPipe: function () { pipe.reset(); st.pend = { s: null, n: 0 }; st.shown = 'clear'; }
    };
  }

  /* ===================================================================== FOOL ME IF YOU CAN — booth trials + scoreboard */
  var FOOL_ITEMS = [
    { id: 'scarf', l: T2('وشاح أحمر', 'Red scarf'), decoy: true },
    { id: 'flashlight', l: T2('كشّاف هاتف', 'Phone flashlight'), decoy: true },
    { id: 'led', l: T2('مصباح LED', 'LED lamp'), decoy: true },
    { id: 'phonefire', l: T2('فيديو حريق على هاتف', 'Fire video on a phone'), decoy: true },
    { id: 'wall', l: T2('جدار برتقالي', 'Orange wall'), decoy: true },
    { id: 'shirt', l: T2('قميص أحمر يتحرك', 'Moving red shirt'), decoy: true },
    { id: 'flicker', l: T2('مصباح يومض 10 هرتز', '10 Hz flickering lamp'), decoy: true },
    { id: 'flame', l: T2('لهب حقيقي — للمقارنة (الشاهد)', 'Real flame — control'), decoy: false },
    { id: 'other', l: T2('شيء آخر', 'Something else'), decoy: true }
  ];
  var TRIAL_KEY = 'manara-booth-trials';
  function loadTrials() { try { var a = JSON.parse(Manara.store(TRIAL_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveTrials(a) { Manara.store(TRIAL_KEY, JSON.stringify(a.slice(-500))); }
  function trialsCSV(rows) {
    var head = ['time_utc', 'showed', 'is_decoy', 'source', 'thermal_mode', 'thermal_source', 'colour_only_alarm', 'peak_state_full', 'peak_state_vision', 'thermal_veto_used', 'fooled_colour_only', 'fooled_full_pipeline', 'duration_s', 'tau', 'confirm_frames'];
    return head.join(',') + '\n' + rows.map(function (r) {
      return [r.t, r.showed, r.decoy, r.source, r.thMode, r.thSrc, r.c1, r.peak, r.peakV, r.veto, r.fooledC1, r.fooledFull, r.dur, r.tau, r.cf].map(csvCell).join(',');
    }).join('\n') + '\n';
  }

  function initFool(panel) {
    panel.innerHTML = tpl(
      '<div class="card trial">' +
        '<div class="panel-h"><span>' + icon('target') + ' {{جرّب أن تخدع الكاشف|Try to fool the detector}}</span><span class="tag warn">{{تجارب الجناح (الزوّار) — منفصلة عن مختبر الخدع|booth trials (visitors) — separate from the Decoy Lab}}</span></div>' +
        '<ol class="steps">' +
          '<li><b>1</b> {{اختر ما ستُريه للكاميرا|Choose what you will show}}</li>' +
          '<li><b>2</b> {{اعرضه أمام الكاميرا — أو اختر المشهد المطابق من الشيفرة|Hold it up to the camera — or use the matching code scene}}</li>' +
          '<li><b>3</b> {{اضغط «ابدأ التجربة» وراقب: هل ينخدع اللون وحده؟ وهل تنخدع الطبقات الست؟|Press “Run trial” and watch: is colour alone fooled? Are all six layers?}}</li>' +
        '</ol>' +
        '<div class="trial-bar">' +
          '<label class="field"><span>{{ماذا تعرض؟|What are you showing?}}</span><select id="fool-showed"></select></label>' +
          '<label class="field"><span>{{مدة التجربة|Trial length}}</span><select id="fool-dur"><option value="3"></option><option value="5" selected></option><option value="8"></option></select></label>' +
          '<button class="btn btn-primary" type="button" id="fool-run">' + icon('play') + '<span>{{ابدأ التجربة|Run trial}}</span></button>' +
        '</div>' +
        '<div class="progress" id="fool-prog" hidden><i></i></div>' +
        '<p class="muted small" id="fool-hint"></p>' +
        '<div class="trial-result" id="fool-result" hidden aria-live="polite"></div>' +
      '</div>' +
      '<div id="fool-host"></div>' +
      '<div class="card board" id="fool-board">' +
        '<div class="panel-h"><span>' + icon('chart') + ' {{لوحة النتائج — تجارب الجناح|Scoreboard — booth trials}}</span><span class="tag warn">{{محليًا في متصفحك فقط|stored only in this browser}}</span></div>' +
        '<div class="grid g4" id="fool-kpis"></div>' +
        '<div class="table-wrap"><table class="table" id="fool-table"><thead><tr><th>{{ما عُرض|What was shown}}</th><th>{{التجارب|Trials}}</th><th>{{إنذار اللون وحده|Colour-only alarms}}</th><th>{{إنذار الطبقات الست|Full C1–C6 alarms}}</th></tr></thead><tbody></tbody></table></div>' +
        '<p class="muted small">{{«ينخدع» يعني أن النظام رفع إنذار حريق أو دخان أمام شيء ليس حريقًا. اللهب الحقيقي (الشاهد) يُحسب كاكتشاف لا كخداع. الحرارة هنا محاكاة (SIM) ما لم توصل لوحة MLX90640.|“Fooled” means the system raised a fire or smoke alarm in front of something that is not a fire. The real-flame control counts as a detection, not a fooling. Thermal here is simulated (SIM) unless you connect an MLX90640 board.}}</p>' +
        '<div class="btns"><button class="btn btn-ghost btn-sm" type="button" id="fool-csv">' + icon('download') + '<span>{{تصدير CSV|Export CSV}}</span></button><button class="btn btn-ghost btn-sm" type="button" id="fool-clear">' + icon('reset') + '<span>{{مسح اللوحة|Clear scoreboard}}</span></button></div>' +
      '</div>');
    var stage = createStage($('#fool-host', panel), 'fool', 'fool', ['scarf', 'flashlight', 'led', 'phonefire', 'wall', 'shirt', 'flicker', 'flame']);
    var selShowed = $('#fool-showed', panel), selDur = $('#fool-dur', panel), btnRun = $('#fool-run', panel), prog = $('#fool-prog', panel), hint = $('#fool-hint', panel), result = $('#fool-result', panel);
    function fillShowed() { var cur = selShowed.value || 'scarf'; clear(selShowed); FOOL_ITEMS.forEach(function (it) { var o = el('option', '', L(it.l)); o.value = it.id; selShowed.appendChild(o); }); selShowed.value = cur; }
    function fillDur() { $$('option', selDur).forEach(function (o) { o.textContent = L(T2(o.value + ' ثوانٍ', o.value + ' s')); }); }
    fillShowed(); fillDur();
    var trial = null, trials = loadTrials(), lastRow = null;
    function sceneFor(id) { return SCENE_INFO[id] && id !== 'other' ? id : null; }
    selShowed.addEventListener('change', function () { var sc = sceneFor(selShowed.value); if (stage.st.kind === 'scene' && sc) stage.pickScene(sc); setHint(); });
    stage.setOnSource(function (kind, id) { if (kind === 'scene' && id && FOOL_ITEMS.some(function (i) { return i.id === id; })) selShowed.value = id; setHint(); });
    function setHint() {
      var k = stage.st.kind, h = k === 'camera' ? T2('الكاميرا الحيّة تعمل: أمسك الشيء أمامها طوال التجربة.', 'The live camera is on: hold the object in front of it for the whole trial.')
        : k === 'scene' ? T2('مشهد من الشيفرة يعمل (محاكاة). للتجربة الحقيقية اضغط «الكاميرا».', 'A code scene is running (SIM). For the real thing press “Camera”.') : k === 'video' ? T2('ملف فيديو يعمل.', 'A video file is running.') : T2('اختر مشهدًا أو الكاميرا.', 'Pick a scene or the camera.');
      hint.textContent = L(h);
    }
    function summarize() {
      var dec = trials.filter(function (r) { return r.decoy; }), ctl = trials.filter(function (r) { return !r.decoy; });
      var fc = dec.filter(function (r) { return r.fooledC1; }).length, ff = dec.filter(function (r) { return r.fooledFull; }).length, cd = ctl.filter(function (r) { return r.peak === 'fire'; }).length;
      return { n: trials.length, dec: dec.length, fc: fc, ff: ff, ctl: ctl.length, cd: cd };
    }
    function renderBoard() {
      var S = summarize(), box = $('#fool-kpis', panel); clear(box);
      function kpi(cls, big, small) { var d = el('div', 'kpi ' + cls), b = el('b', '', big), s = el('span', '', small); d.appendChild(b); d.appendChild(s); box.appendChild(d); }
      kpi('', num(S.n), L(T2('تجارب مسجّلة', 'trials recorded')));
      kpi(S.fc ? 'warn' : 'safe', S.dec ? num(S.fc) + '/' + num(S.dec) : '–', L(T2('خدع انخدع بها اللون وحده', 'decoy trials that fooled colour alone')));
      kpi(S.ff ? 'danger' : 'safe', S.dec ? num(S.ff) + '/' + num(S.dec) : '–', L(T2('خدع انخدعت بها الطبقات الست', 'decoy trials that fooled the full pipeline')));
      kpi('cool', S.ctl ? num(S.cd) + '/' + num(S.ctl) : '–', L(T2('اللهب الحقيقي (الشاهد) كُشف', 'real-flame control detected')));
      var tb = $('#fool-table tbody', panel); clear(tb);
      if (!trials.length) { var tr0 = el('tr'), td0 = el('td', 'muted', L(T2('لا تجارب بعد — ابدأ أول تجربة!', 'No trials yet — run the first one!'))); td0.colSpan = 4; tr0.appendChild(td0); tb.appendChild(tr0); }
      FOOL_ITEMS.forEach(function (it) {
        var rows = trials.filter(function (r) { return r.showed === it.id; }); if (!rows.length) return;
        var tr = el('tr'); [L(it.l), num(rows.length), num(rows.filter(function (r) { return r.c1; }).length) + '/' + num(rows.length), num(rows.filter(function (r) { return r.peak === 'fire' || r.peak === 'smoke'; }).length) + '/' + num(rows.length)].forEach(function (t, i) { var td = el('td', i ? 'num' : '', t); tr.appendChild(td); }); tb.appendChild(tr);
      });
    }
    function showResult(row) {
      result.hidden = false; clear(result); result.className = 'trial-result';
      var colourFooled = row.c1, fullFooled = row.peak === 'fire' || row.peak === 'smoke', decoy = row.decoy;
      var a = el('div', 'res-col ' + (decoy ? (colourFooled ? 'bad' : 'good') : (colourFooled ? 'good' : 'bad'))), b = el('div', 'res-col ' + (decoy ? (fullFooled ? 'bad' : 'good') : (row.peak === 'fire' ? 'good' : 'bad')));
      a.innerHTML = '<small></small><b></b><span></span>'; b.innerHTML = '<small></small><b></b><span></span>';
      $('small', a).textContent = L(T2('اللون وحده (C1)', 'Colour only (C1)')); $('b', a).textContent = colourFooled ? L(T2('إنذار حريق', 'FIRE ALARM')) : L(T2('لا إنذار', 'no alarm'));
      $('span', a).textContent = decoy ? (colourFooled ? L(T2('انخدع ✗', 'fooled ✗')) : L(T2('لم ينخدع ✓', 'not fooled ✓'))) : (colourFooled ? L(T2('اكتشف ✓', 'detected ✓')) : L(T2('فاته ✗', 'missed ✗')));
      $('small', b).textContent = L(T2('الطبقات الست (C1–C6)', 'Full pipeline (C1–C6)')); $('b', b).textContent = L(STATE_L[row.peak]) + (row.veto ? ' · ' + L(T2('نقض حراري', 'thermal veto')) : '');
      $('span', b).textContent = decoy ? (fullFooled ? L(T2('انخدع ✗ — نتيجة تستحق التقرير!', 'fooled ✗ — a finding worth reporting!')) : L(T2('لم ينخدع ✓', 'not fooled ✓'))) : (row.peak === 'fire' ? L(T2('اكتشف ✓', 'detected ✓')) : L(T2('فاته (ملاحظة مهمة)', 'missed (an important note)')));
      result.appendChild(a); result.appendChild(b);
      if (decoy && fullFooled) Manara.toast(T2('خدعتَ الكاشف! سجّلها وأبلغ عنها.', 'You fooled it! It is logged — report it.'), 'warn');
    }
    var RANK = { clear: 0, suspect: 1, smoke: 2, fire: 3 };
    function runTrial() {
      if (trial) return;
      if (!stage.st.kind) stage.startScene(sceneFor(selShowed.value) || 'scarf');
      stage.resetPipe(); stage.st.userPlayed = true; stage.st.wantPaused = false; stage.play();
      var opts = stage.curOpts(), dur = +selDur.value || 5;
      trial = { t0: NOW(), dur: dur * 1000, n: 0, c1: false, peak: 'clear', peakV: 'clear', veto: false, thMode: '', showed: selShowed.value, source: stage.st.kind === 'scene' ? 'code-scene' : stage.st.kind, tau: opts.tau, cf: opts.confirmFrames, thSrc: 'SIM' };
      trial.thMode = stage.ui['th-mode'].value;
      btnRun.disabled = true; prog.hidden = false; result.hidden = true; var bar = $('i', prog);
      stage.setOnFrame(function (out, info) {
        trial.n++; if (info && info.src) trial.thSrc = info.src;
        if (trial.n <= 6) return;
        if (out.layers[0].on) trial.c1 = true; if (RANK[out.state] > RANK[trial.peak]) trial.peak = out.state; if (RANK[out.visionState] > RANK[trial.peakV]) trial.peakV = out.visionState; if (out.vetoed) trial.veto = true;
      });
      trial.timer = setInterval(function () {
        var f = (NOW() - trial.t0) / trial.dur; bar.style.width = min(100, f * 100) + '%';
        if (f >= 1) finishTrial();
      }, 100);
    }
    function finishTrial() {
      clearInterval(trial.timer); stage.setOnFrame(null); prog.hidden = true; btnRun.disabled = false;
      var T = trial; trial = null;
      if (T.n < 12) { result.hidden = false; result.className = 'trial-result'; result.textContent = L(T2('لم تصل إطارات كافية (تحقق من الكاميرا أو اضغط تشغيل).', 'Not enough frames arrived (check the camera or press Play).')); return; }
      var item = FOOL_ITEMS.filter(function (i) { return i.id === T.showed; })[0], decoy = item ? item.decoy : true;
      var row = { t: new Date().toISOString(), showed: T.showed, decoy: decoy, source: T.source, thMode: T.thMode, thSrc: T.thSrc, c1: T.c1, peak: T.peak, peakV: T.peakV, veto: T.veto, fooledC1: decoy && T.c1, fooledFull: decoy && (T.peak === 'fire' || T.peak === 'smoke'), dur: T.dur / 1000, tau: T.tau, cf: T.cf };
      trials.push(row); saveTrials(trials); lastRow = row; showResult(row); renderBoard();
      stage.logEvent(L(item ? item.l : T2('تجربة', 'trial')) + ': ' + L(T2('اللون وحده ', 'colour only ')) + (row.c1 ? L(T2('أنذر', 'alarmed')) : L(T2('لم يُنذر', 'quiet'))) + ' · ' + L(T2('الكامل ', 'full ')) + L(STATE_L[row.peak]));
    }
    btnRun.addEventListener('click', runTrial);
    $('#fool-csv', panel).addEventListener('click', function () { download('manara-booth-trials.csv', trialsCSV(trials)); });
    var clearBtn = $('#fool-clear', panel), armed = false;
    clearBtn.addEventListener('click', function () {
      if (!armed) { armed = true; clearBtn.lastChild.textContent = L(T2('اضغط مرة أخرى للتأكيد', 'Press again to confirm')); setTimeout(function () { armed = false; clearBtn.lastChild.textContent = L(T2('مسح اللوحة', 'Clear scoreboard')); }, 3000); return; }
      armed = false; trials = []; saveTrials(trials); result.hidden = true; clearBtn.lastChild.textContent = L(T2('مسح اللوحة', 'Clear scoreboard')); renderBoard();
    });
    window.addEventListener('langchange', function () { fillShowed(); fillDur(); renderBoard(); setHint(); if (lastRow && !result.hidden) showResult(lastRow); });
    renderBoard(); setHint();
    return { stage: stage, trials: function () { return trials; }, run: runTrial, panel: panel, csv: function () { return trialsCSV(trials); } };
  }

  /* ===================================================================== LIVE tab */
  function initLive(panel) {
    var stage = createStage($('#live-host', panel), 'live', 'live', ['flame', 'shirt', 'flicker', 'phonefire', 'smoke']);
    return { stage: stage };
  }

  /* ===================================================================== DECOY LAB */
  // Honest reference, from `node tools/manara/test-fire.mjs` (test set: 18 photos never used to change the engine).
  // tools/manara/test-detect.mjs re-runs that script and fails if these numbers drift.
  var HELD_REF = { n: 18, ok: 12, acc: '66.7', fireFound: '6/6', falseFire: '3/12', smokeFound: '0/3' };

  function loadPhotos() {
    var list = root.MANARA_SAMPLES, data = root.MANARA_SAMPLE_DATA;
    if (!list || !data) return Promise.resolve([]);
    return Promise.all(list.map(function (s) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
            var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
            var fr = x.getImageData(0, 0, c.width, c.height);
            resolve({ id: s.file.replace(/\.\w+$/, ''), truth: s.label, frame: { data: fr.data, width: fr.width, height: fr.height }, meta: s, src: data[s.file] });
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = data[s.file];
      });
    })).then(function (a) { return a.filter(Boolean); });
  }
  function ciText(k, n) { if (!n) return L(T2('لا مدخلات', 'no inputs')); var w = Lab.wilson(k, n), LR = '\u200E'; return LR + pct(k / n, 0) + LR + ' · ' + L(T2('فاصل ثقة 95%: ', '95% CI ')) + LR + pct(w[0], 0) + '–' + pct(w[1], 0) + LR; }

  function initDecoy(panel, deps) {
    var photos = [], D = { bench: null, recs: null, split: null, star: null, seed: 2026, tuned: false, roc: 'both', timer: 0, fg: false, finished: false, sec: null, started: false };
    panel.innerHTML = tpl(
      '<div class="card dl-intro">' +
        '<div class="panel-h"><span>' + icon('layers') + ' {{مختبر الخدع — الشيفرة نفسها على مُدخلات معروفة الحقيقة|Decoy Lab — the same code on inputs with known truth}}</span><span class="tag cool">{{تجارب مخبرية|lab trials}}</span></div>' +
        '<p>{{كل رقم هنا يُحسب الآن في متصفحك بهذا الكود: 16 صورة حقيقية و25 مقطعًا مولَّدًا بالشيفرة (لهب ومموِّهات) حقيقتها معروفة. الطبقات C1…C6 تُضاف واحدة واحدة (استئصال)، وعتبة اللون τ تُجتاز، وتُقسَّم المُدخلات عشوائيًا بثبات إلى 70% «ضُبط عليها» و30% «محجوزة».|Every number here is computed in your browser, now, by this code: 16 real photos and 25 code-generated clips (flames and decoys) whose truth is known. Layers C1…C6 are added one at a time (ablation), the colour threshold τ is swept, and the inputs are split with a fixed seed into 70% “tuned on” and 30% “held-out”.}}</p>' +
        '<div class="progress" id="dl-prog"><i></i></div><p class="muted small" id="dl-status" role="status"></p>' +
      '</div>' +
      '<div class="note warn dl-ref"><p><b>{{الرقم الصادق للصور الحقيقية|The honest number for real photos}}</b> — {{من «node tools/manara/test-fire.mjs»: 18 صورة لم تُستعمل قط لتعديل المحرّك:|from “node tools/manara/test-fire.mjs”: 18 photos never used to change the engine:}} <b class="mono">' + HELD_REF.ok + '/' + HELD_REF.n + ' = ' + HELD_REF.acc + '%</b> · {{النار وُجدت|fire found}} <b class="mono">' + HELD_REF.fireFound + '</b> · {{إنذارات نار كاذبة|false fire alarms}} <b class="mono">' + HELD_REF.falseFire + '</b> {{من الصور غير النارية|of the non-fire photos}} · {{الدخان في الصور الثابتة|smoke in still photos}} <b class="mono">' + HELD_REF.smokeFound + '</b>. {{الصور الستّ عشرة هنا شاهدها مؤلف fire.js أثناء ضبط عتباته، فحتى الثلاثون بالمئة «المحجوزة» منها متفائلة بالنسبة لقواعد المحرّك نفسها؛ والمقاطع المولَّدة كتبها المؤلف نفسه أيضًا. اقرأ الأرقام أدناه كفحص لآلية الطبقات، لا كدقة في الميدان.|The 16 photos here were seen by the author of fire.js while its thresholds were tuned, so even their “held-out” 30% is optimistic for the engine’s own rules, and the generated clips were written by the same author. Read the numbers below as a check of the layer mechanism, not as field accuracy.}}</p></div>' +
      '<div class="grid g4" id="dl-kpis"></div>' +
      '<div class="card dl-split">' +
        '<div class="panel-h"><span>{{القسمة 70/30 (بذرة ثابتة)|The 70/30 split (fixed seed)}}</span></div>' +
        '<div class="split-ctl">' +
          '<label class="field"><span>{{البذرة|Seed}}</span><input class="input mono" type="number" id="dl-seed" value="2026" min="1" max="999999" step="1" inputmode="numeric"></label>' +
          '<button class="btn btn-ghost btn-sm" type="button" id="dl-resplit">' + icon('reset') + '<span>{{أعد القسمة|Re-split}}</span></button>' +
          '<label class="switch"><input type="checkbox" id="dl-tuned"><span>{{أظهر أرقام المُضبوط عليه أيضًا (متفائلة)|Also show tuned-on numbers (optimistic)}}</span></label>' +
        '</div>' +
        '<p class="muted small">{{ما الذي «يُضبط»؟ عتبة اللون τ* فقط: تُختار من القسم الـ70% (أعلى فرق بين معدل الاكتشاف ومعدل الإنذار الكاذب)، ثم تُجمَّد وتُقاس على الـ30% المحجوزة. القسمة طبقية: لكل صنف نصيبه في الجانبين. غيّر البذرة لترى كيف تتحرك الأرقام: هذه هي حدود العيّنات الصغيرة.|What is “tuned”? Only the colour threshold τ*: it is picked on the 70% (largest gap between detection rate and false-alarm rate), then frozen and measured on the 30% held out. The split is stratified: every class has a share on both sides. Change the seed to watch the numbers move — that is the limit of small samples.}}</p>' +
        '<div class="chips split-chips" id="dl-split" role="list"></div>' +
      '</div>' +
      '<div class="card dl-abl"><div class="panel-h"><span>{{الاستئصال: نضيف الطبقات واحدة واحدة (على المُدخلات المحجوزة فقط)|Ablation: add layers one at a time (held-out inputs only)}}</span><span class="tag warn" id="dl-abl-tau"></span></div>' +
        '<div class="table-wrap"><table class="table dl-table" id="dl-abl"><thead><tr><th rowspan="2">{{حزمة الطبقات|Layer stack}}</th><th colspan="2">{{مقاطع مولَّدة (محاكاة)|Code clips (SIM)}}</th><th colspan="2">{{صور حقيقية|Real photos}}</th></tr><tr><th>{{الاكتشاف|Detection}}</th><th>{{إنذارات كاذبة|False alarms}}</th><th>{{الاكتشاف|Detection}}</th><th>{{إنذارات كاذبة|False alarms}}</th></tr></thead><tbody></tbody></table></div>' +
        '<p class="muted small" id="dl-abl-note"></p>' +
      '</div>' +
      '<div class="card dl-rocc"><div class="panel-h"><span>{{مسح τ (شبيه بمنحنى ROC)|τ sweep (ROC-style)}}</span>' +
        '<label class="field inline"><span class="sr-only">{{المُدخلات|Inputs}}</span><select id="dl-roc-kind"></select></label></div>' +
        '<div class="roc-wrap"><canvas id="dl-roc" role="img" width="560" height="380"></canvas></div>' +
        '<div class="legend roc-legend" aria-hidden="true"><span><i class="sw sw-line r1"></i>{{الطبقات الست (محجوزة)|full stack (held-out)}}</span><span><i class="sw sw-line r2"></i>{{اللون وحده (محجوزة)|colour only (held-out)}}</span><span class="tune-only"><i class="sw sw-line r3"></i>{{المُضبوط عليه (متقطّع)|tuned-on (dashed)}}</span><span><i class="sw sw-ring"></i>τ*</span></div>' +
        '<p class="muted small">{{كل نقطة هي قيمة τ من 10 إلى 100. المحور الأفقي: نسبة الإنذارات الكاذبة، والرأسي: نسبة الاكتشاف. الزاوية العليا اليسرى هي الأفضل. قيم τ فوق 55 تخرج عن مدى الورقتين (25–55) لتُظهر أين تنهار قاعدة اللون.|Each point is one τ from 10 to 100. Horizontal: false-alarm rate; vertical: detection rate. Top-left is best. τ above 55 is outside the papers’ range (25–55) to show where the colour rule collapses.}}</p>' +
        '<details class="tbl-alt"><summary>{{الجدول البديل لقارئات الشاشة|The same data as a table}}</summary><div class="table-wrap"><table class="table" id="dl-roc-table"><thead><tr><th>τ</th><th>{{اللون وحده: إنذارات كاذبة|colour only: false alarms}}</th><th>{{اللون وحده: اكتشاف|colour only: detection}}</th><th>{{الطبقات الست: إنذارات كاذبة|full stack: false alarms}}</th><th>{{الطبقات الست: اكتشاف|full stack: detection}}</th></tr></thead><tbody></tbody></table></div></details>' +
      '</div>' +
      '<div class="card dl-photos"><div class="panel-h"><span>{{الصور الـ16 — حكم كل صورة عند τ*|The 16 photos — each verdict at τ*}}</span></div><div class="photo-grid" id="dl-photos"></div></div>' +
      '<details class="card dl-matrix"><summary><b>{{نتيجة كل مُدخَل: مقاطع الشيفرة (C1…C6)|Every input: the code clips (C1…C6)}}</b></summary><div class="table-wrap"><table class="table" id="dl-matrix"><thead><tr><th>{{المقطع|Clip}}</th><th>{{الحقيقة|Truth}}</th><th>{{القسم|Split}}</th><th>C1</th><th>+C2</th><th>+C3</th><th>+C4</th><th>+C5</th><th>+C6</th><th>{{أعلى حالة|Peak state}}</th></tr></thead><tbody></tbody></table></div></details>' +
      '<div class="card"><div class="btns"><button class="btn btn-ghost btn-sm" type="button" id="dl-csv-in">' + icon('download') + '<span>{{CSV: كل مُدخَل|CSV: every input}}</span></button><button class="btn btn-ghost btn-sm" type="button" id="dl-csv-abl">' + icon('download') + '<span>{{CSV: جدول الاستئصال|CSV: ablation table}}</span></button></div>' +
        '<ul class="limits"><li>{{المشاهد المولَّدة كتبها من كتب الكاشف: أسهل من الواقع. الحرارة المحاكاة (SIM) تفترض أن الهاتف والمصباح والجدار باردة، وهذا ما يجعل C6 تنجح هنا — والمصباح الحقيقي قد يسخن، والجدار المشمس قد يتجاوز 57°م.|The generated scenes were written by whoever wrote the detector: easier than real life. The simulated (SIM) thermal frame assumes phones, lamps and walls are cold, which is why C6 works here — a real lamp can run hot and a sunlit wall can cross 57 °C.}}</li>' +
        '<li>{{عيّنات صغيرة: عدد المُدخلات المحجوزة بضع عشرات في أحسن الأحوال، ولذلك نعرض فاصل ثقة (Wilson) لا رقمًا مجرّدًا.|Small samples: the held-out set is a few dozen inputs at best, so we show a Wilson confidence interval, not a bare number.}}</li>' +
        '<li>{{لا نحاكي هنا وهج الشمس ولا السيارات الحقيقية ولا مصابيح الصوديوم: أداؤها على هذه الأمور مجهول.|We do not simulate sun glare, real vehicles or sodium street lamps here: the performance on those is unknown.}}</li></ul></div>');
    var $d = function (id) { return $('#' + id, panel); };
    var selKind = $d('dl-roc-kind');
    function fillKind() { var cur = selKind.value || 'both'; clear(selKind); [['both', T2('كل المُدخلات', 'all inputs')], ['clip', T2('المقاطع المولَّدة فقط', 'code clips only')], ['photo', T2('الصور فقط', 'photos only')]].forEach(function (o) { var op = el('option', '', L(o[1])); op.value = o[0]; selKind.appendChild(op); }); selKind.value = cur; }
    fillKind();
    bindAttr($d('dl-roc'), 'aria-label', 'منحنى شبيه بـROC: نسبة الاكتشاف مقابل نسبة الإنذارات الكاذبة لقيم τ المختلفة؛ الجدول البديل أسفله', 'ROC-style curve: detection rate against false-alarm rate for different τ; the same data as a table below');

    /* ---- run control ---- */
    function setProgress(p, text) { $('i', $d('dl-prog')).style.width = (p * 100) + '%'; $d('dl-status').textContent = text; }
    function pump(budget, delay) {
      var r = D.bench.step(budget);
      if (r.done) { D.finished = true; $d('dl-prog').classList.add('done'); setProgress(1, L(T2('اكتمل في ' + num(D.bench.seconds(), 1) + ' ثانية على هذا الجهاز (' + Object.keys(D.bench.results()).length + ' مُدخَلًا × ' + Lab.TAUS.length + ' قيم لـτ).', 'Done in ' + num(D.bench.seconds(), 1) + ' s on this device (' + Object.keys(D.bench.results()).length + ' inputs × ' + Lab.TAUS.length + ' τ values).'))); D.recs = Object.keys(D.bench.results()).map(function (k) { return D.bench.results()[k]; }); renderAll(); window.__decoyDone = true; return; }
      setProgress(r.progress, L(T2('يعمل المختبر… ' + num(r.progress * 100, 0) + '%', 'Running the lab… ' + num(r.progress * 100, 0) + '%')));
      D.timer = setTimeout(function () { pump(budget, delay); }, delay);
    }
    function start(foreground) {
      if (D.finished) return; if (D.timer && (D.fg || !foreground)) return; if (D.timer) clearTimeout(D.timer);
      if (!D.bench) { if (!photosReady) { D.pendingStart = foreground; return; } D.bench = Lab.createBench(photos); }
      D.fg = !!foreground; pump(foreground ? 22 : 8, foreground ? 0 : 50);
    }
    var photosReady = false;
    loadPhotos().then(function (p) { photos = p; photosReady = true; if (D.pendingStart != null) start(D.pendingStart); });

    /* ---- results ---- */
    function recsFor() { return D.recs || []; }
    function recompute() {
      var recs = recsFor(), strata = {};
      recs.forEach(function (r) { var k = r.kind + '-' + r.truth; (strata[k] = strata[k] || []).push(r.id); });
      D.split = Lab.splitIds(Object.keys(strata).sort().map(function (k) { return strata[k].sort(); }), D.seed);
      D.star = Lab.pickTauStar(recs, D.split);
    }
    function cell(c, which, hide) { // c from ablation(): {pk,pn,...}
      return c;
    }
    function fmtCell(td, k, n, tunedK, tunedN) {
      clear(td);
      if (!n) { td.appendChild(el('span', 'na', L(T2('غير متاح لهذا المُدخَل', 'N/A for this stimulus')))); return; }
      var b = el('b', 'mono', num(k) + '/' + num(n)); td.appendChild(b);
      td.appendChild(el('small', 'ci', ' ' + ciText(k, n)));
      if (D.tuned && tunedN) td.appendChild(el('small', 'tuned', L(T2('مُضبوط عليه: ', 'tuned-on: ')) + num(tunedK) + '/' + num(tunedN)));
    }
    function renderKpis() {
      var box = $d('dl-kpis'); clear(box); var recs = recsFor(), tau = D.star.tau;
      var held = recs.filter(function (r) { return D.split[r.id] === 'held'; }), tune = recs.filter(function (r) { return D.split[r.id] === 'tune'; });
      var full = Lab.countRates(held, function (r) { return Lab.fullAlarm(r, tau); }), col = Lab.countRates(held, function (r) { return Lab.alarmOf(r, tau, 0); });
      function kpi(cls, big, small, sub) { var d = el('div', 'kpi ' + cls), b = el('b', '', big), s = el('span', '', small); d.appendChild(b); d.appendChild(s); if (sub) d.appendChild(el('small', 'muted', sub)); box.appendChild(d); }
      kpi('cool', 'τ* = ' + num(tau), L(T2('عتبة اللون المختارة من قسم الضبط', 'colour threshold chosen on the tuning split')), L(T2('مُضبوط على ', 'tuned on ')) + num(tune.length) + L(T2(' مُدخَلًا · محجوز ', ' inputs · held-out ')) + num(held.length));
      kpi('safe', num(full.pk) + '/' + num(full.pn), L(T2('اكتشاف (الطبقات الست) — محجوزة', 'detection (full stack) — held-out')), ciText(full.pk, full.pn));
      kpi(full.nk ? 'danger' : 'safe', num(full.nk) + '/' + num(full.nn), L(T2('إنذارات كاذبة (الطبقات الست) — محجوزة', 'false alarms (full stack) — held-out')), ciText(full.nk, full.nn));
      kpi('warn', num(col.nk) + '/' + num(col.nn), L(T2('إنذارات كاذبة (اللون وحده) — محجوزة', 'false alarms (colour only) — held-out')), ciText(col.nk, col.nn));
    }
    function renderSplit() {
      var box = $d('dl-split'); clear(box);
      recsFor().slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (r) {
        var held = D.split[r.id] === 'held', c = el('span', 'chip split ' + (held ? 'held' : 'tune') + (r.truth === 'fire' ? ' t-fire' : ''), r.id); c.setAttribute('role', 'listitem');
        c.setAttribute('title', r.id + ' · ' + r.truth + ' · ' + (held ? 'held-out' : 'tuned-on'));
        c.insertBefore(el('i', 'tdot t-' + (r.truth === 'decoy' ? 'none' : r.truth)), c.firstChild); c.appendChild(el('small', '', held ? 'H' : 'T'));
        c.setAttribute('aria-label', r.id + ', ' + r.truth + ', ' + (held ? L(T2('محجوز', 'held-out')) : L(T2('مُضبوط عليه', 'tuned-on'))));
        box.appendChild(c);
      });
    }
    function renderAblation() {
      var recs = recsFor(), tau = D.star.tau, held = Lab.ablation(recs, D.split, 'held', tau), tune = Lab.ablation(recs, D.split, 'tune', tau);
      var tb = $('#dl-abl tbody', panel); clear(tb);
      held.forEach(function (row, i) {
        var tr = el('tr', i === 5 ? 'last' : ''), th = el('th'); th.scope = 'row'; th.textContent = row.stage.id + ' · ' + L(row.stage.name); tr.appendChild(th);
        var t = tune[i], cs = [[row.clips.pk, row.clips.pn, t.clips.pk, t.clips.pn], [row.clips.nk, row.clips.nn, t.clips.nk, t.clips.nn], [row.photos.pk, row.photos.pn, t.photos.pk, t.photos.pn], [row.photos.nk, row.photos.nn, t.photos.nk, t.photos.nn]];
        cs.forEach(function (c) { var td = el('td'); fmtCell(td, c[0], c[1], c[2], c[3]); tr.appendChild(td); });
        tb.appendChild(tr);
      });
      $d('dl-abl-tau').textContent = 'τ* = ' + num(tau);
      var smokeHeld = recs.filter(function (r) { return r.truth === 'smoke' && D.split[r.id] === 'held'; }), found = smokeHeld.filter(function (r) { return r.res[tau] && r.res[tau].label === 'smoke'; }).length;
      $d('dl-abl-note').textContent = L(T2('الصور الثابتة لا تملك محور زمن ولا إطارًا حراريًا، لذا لا تُعرَّف لها إلا C1 وC4 (+C4). صور الدخان المحجوزة: ', 'Still photos have no time axis and no thermal frame, so only C1 and C4 (+C4) exist for them. Held-out smoke photos: ')) + num(found) + '/' + num(smokeHeld.length) + L(T2(' وُسمت «دخان»؛ اكتشاف الدخان في الصور الثابتة ضعيف (المرجع الصادق أعلاه: ' + HELD_REF.smokeFound + ').', ' labelled “smoke”; smoke in still photos is weak (the honest reference above: ' + HELD_REF.smokeFound + ').'));
    }
    function renderRocTable(pts) {
      var tb = $('#dl-roc-table tbody', panel); clear(tb);
      pts.full.forEach(function (p, i) { var q = pts.col[i], tr = el('tr'); [num(p.tau), q.fpr == null ? '–' : pct(q.fpr, 0), q.tpr == null ? '–' : pct(q.tpr, 0), p.fpr == null ? '–' : pct(p.fpr, 0), p.tpr == null ? '–' : pct(p.tpr, 0)].forEach(function (t) { tr.appendChild(el('td', 'num', t)); }); tb.appendChild(tr); });
    }
    function drawRoc() {
      var cv = $d('dl-roc'); if (!D.recs || !D.split) return;
      var recs = D.recs, kind = selKind.value || 'both', dpr = min(2, window.devicePixelRatio || 1), cssW = cv.clientWidth || 520, cssH = round(cssW * 0.68);
      cv.width = round(cssW * dpr); cv.height = round(cssH * dpr); cv.style.height = cssH + 'px';
      var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); readTokens();
      var padL = 52, padB = 44, padT = 12, padR = 14, W = cssW - padL - padR, H = cssH - padT - padB;
      g.clearRect(0, 0, cssW, cssH); g.font = '11px ' + TK['font-m']; g.lineWidth = 1;
      function X(v) { return padL + v * W; } function Y(v) { return padT + (1 - v) * H; }
      g.strokeStyle = TK.line; g.fillStyle = TK.muted; g.textAlign = 'center'; g.textBaseline = 'top';
      for (var i = 0; i <= 5; i++) { var v = i / 5; g.beginPath(); g.moveTo(X(v), padT); g.lineTo(X(v), padT + H); g.stroke(); g.fillText(String(round(v * 100)), X(v), padT + H + 6); }
      g.textAlign = 'right'; g.textBaseline = 'middle';
      for (var j = 0; j <= 5; j++) { var u = j / 5; g.beginPath(); g.moveTo(padL, Y(u)); g.lineTo(padL + W, Y(u)); g.stroke(); g.fillText(String(round(u * 100)), padL - 6, Y(u)); }
      g.strokeStyle = TK['line-2']; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = TK.ink; g.beginPath(); g.moveTo(padL, padT); g.lineTo(padL, padT + H); g.lineTo(padL + W, padT + H); g.stroke();
      g.fillStyle = TK['ink-2']; g.font = '11px ' + TK.font; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(L(T2('نسبة الإنذارات الكاذبة (%)', 'false-alarm rate (%)')), padL + W / 2, cssH - 2);
      g.save(); g.translate(12, padT + H / 2); g.rotate(-M.PI / 2); g.textBaseline = 'top'; g.fillText(L(T2('نسبة الاكتشاف (%)', 'detection rate (%)')), 0, 0); g.restore();
      var sets = { full: Lab.rocPoints(recs, D.split, 'held', kind, false), col: Lab.rocPoints(recs, D.split, 'held', kind, true), fullT: Lab.rocPoints(recs, D.split, 'tune', kind, false), colT: Lab.rocPoints(recs, D.split, 'tune', kind, true) };
      function curve(pts, color, dashed, width, labels) {
        var P = pts.filter(function (p) { return p.fpr != null && p.tpr != null; }); if (!P.length) return;
        g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dashed ? [5, 3] : []); g.beginPath();
        P.forEach(function (p, k) { var x = X(p.fpr), y = Y(p.tpr); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
        g.fillStyle = color; var lastKey = '';
        P.forEach(function (p) {
          var x = X(p.fpr), y = Y(p.tpr); g.beginPath(); g.arc(x, y, dashed ? 2.5 : 3.5, 0, 6.283); g.fill();
          if (labels && p.tau !== D.star.tau) { var key = round(x) + ',' + round(y); if (key !== lastKey) { g.font = '10px ' + TK['font-m']; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(String(p.tau), x + 5, y - 3); } lastKey = key; }
        });
      }
      if (D.tuned) { curve(sets.colT, TK.warn, true, 1.5, false); curve(sets.fullT, TK.accent, true, 1.5, false); }
      curve(sets.col, TK.warn, false, 2, true); curve(sets.full, TK.accent, false, 2.5, true);
      var star = sets.full.filter(function (p) { return p.tau === D.star.tau; })[0];
      if (star && star.fpr != null) { g.strokeStyle = TK.ink; g.lineWidth = 2; g.beginPath(); g.arc(X(star.fpr), Y(star.tpr), 8, 0, 6.283); g.stroke(); g.fillStyle = TK.ink; g.font = 'bold 11px ' + TK['font-m']; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('τ*=' + D.star.tau, X(star.fpr) + 11, Y(star.tpr) + 4); }
      renderRocTable({ full: sets.full, col: sets.col });
    }
    function renderPhotos() {
      var box = $d('dl-photos'); clear(box); var tau = D.star.tau;
      photos.forEach(function (ph) {
        var r = D.bench.results()[ph.id]; if (!r) return;
        var res = r.res[tau], held = D.split[ph.id] === 'held';
        var correct = ph.truth === 'fire' ? res.alarms[3] === true : ph.truth === 'smoke' ? res.label === 'smoke' : res.alarms[3] === false;
        var card = el('figure', 'ph ' + (held ? 'held' : 'tune') + (correct ? ' ok' : ' bad'));
        var im = el('img'); im.src = ph.src; im.alt = L(ph.meta.title); im.width = 160; im.height = 120; card.appendChild(im);
        var cap = el('figcaption'); card.appendChild(cap);
        cap.appendChild(el('b', '', L(ph.meta.title)));
        var row = el('div', 'ph-tags');
        row.appendChild(el('span', 'tag ' + (ph.truth === 'fire' ? 'danger' : ph.truth === 'smoke' ? 'info' : 'safe'), L(ph.truth === 'fire' ? T2('حقيقة: نار', 'truth: fire') : ph.truth === 'smoke' ? T2('حقيقة: دخان', 'truth: smoke') : T2('حقيقة: لا حريق', 'truth: no fire'))));
        row.appendChild(el('span', 'tag ' + (held ? 'warn' : ''), held ? L(T2('محجوزة', 'held-out')) : L(T2('مُضبوط عليها', 'tuned-on'))));
        cap.appendChild(row);
        cap.appendChild(el('span', 'small mono', 'C1: ' + (res.alarms[0] ? L(T2('لون ناري', 'fire colour')) : L(T2('لا لون ناري', 'no fire colour'))) + ' · +C4: ' + res.label));
        cap.appendChild(el('span', 'verdict-mark', correct ? '✓ ' + L(T2('صحيح', 'correct')) : '✗ ' + L(T2('خطأ', 'wrong'))));
        box.appendChild(card);
      });
    }
    function renderMatrix() {
      var tb = $('#dl-matrix tbody', panel); clear(tb); var tau = D.star.tau;
      recsFor().filter(function (r) { return r.kind === 'clip'; }).forEach(function (r) {
        var tr = el('tr'), res = r.res[tau]; tr.appendChild(el('th', '', r.id)); tr.lastChild.scope = 'row';
        tr.appendChild(el('td', '', r.truth === 'fire' ? L(T2('نار', 'fire')) : L(T2('مموّه', 'decoy'))));
        tr.appendChild(el('td', D.split[r.id] === 'held' ? 'held-c' : '', D.split[r.id] === 'held' ? L(T2('محجوز', 'held-out')) : L(T2('ضبط', 'tuned-on'))));
        res.alarms.forEach(function (a) { tr.appendChild(el('td', 'cellm ' + (a ? 'on' : ''), a ? '●' : '·')); });
        tr.appendChild(el('td', '', L(STATE_L[res.peak]))); tb.appendChild(tr);
      });
    }
    function renderAll() {
      if (!D.recs) return; recompute(); renderKpis(); renderSplit(); renderAblation(); drawRoc(); renderPhotos(); renderMatrix(); $d('dl-roc').closest('.card').classList.toggle('show-tuned', D.tuned);
    }
    $d('dl-resplit').addEventListener('click', function () { D.seed = max(1, round(+$d('dl-seed').value) || 2026); renderAll(); });
    $d('dl-seed').addEventListener('change', function () { D.seed = max(1, round(+$d('dl-seed').value) || 2026); renderAll(); });
    $d('dl-tuned').addEventListener('change', function () { D.tuned = $d('dl-tuned').checked; renderAll(); });
    selKind.addEventListener('change', function () { D.roc = selKind.value; drawRoc(); });
    $d('dl-csv-in').addEventListener('click', function () {
      if (!D.recs) return; var tau = D.star.tau;
      var head = ['input_id', 'kind', 'scene', 'truth', 'split', 'tau_star', 'c1_colour', 'plus_c2_motion', 'plus_c3_flicker', 'plus_c4_shape', 'plus_c5_persistence', 'plus_c6_thermal_veto', 'peak_state_or_photo_label'];
      var rows = D.recs.map(function (r) { var res = r.res[tau]; return [r.id, r.kind, r.scene, r.truth, D.split[r.id] === 'held' ? 'held-out' : 'tuned-on', tau].concat(res.alarms.map(function (a) { return a == null ? 'N/A' : a ? 1 : 0; })).concat([r.kind === 'clip' ? res.peak : res.label]); });
      download('manara-decoy-lab-inputs.csv', head.join(',') + '\n' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n');
    });
    $d('dl-csv-abl').addEventListener('click', function () {
      if (!D.recs) return; var tau = D.star.tau, out = [['set', 'tau_star', 'layer_stack', 'clips_detect_k', 'clips_detect_n', 'clips_false_alarm_k', 'clips_false_alarm_n', 'photos_detect_k', 'photos_detect_n', 'photos_false_alarm_k', 'photos_false_alarm_n']];
      ['held', 'tune'].forEach(function (w) { Lab.ablation(D.recs, D.split, w, tau).forEach(function (r) { out.push([w === 'held' ? 'held-out' : 'tuned-on', tau, r.stage.id, r.clips.pk, r.clips.pn, r.clips.nk, r.clips.nn, r.photos.pn ? r.photos.pk : 'N/A', r.photos.pn || 'N/A', r.photos.nn ? r.photos.nk : 'N/A', r.photos.nn || 'N/A']); }); });
      download('manara-decoy-lab-ablation.csv', out.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n');
    });
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(drawRoc, 120); });
    window.addEventListener('themechange', function () { readTokens(); drawRoc(); });
    window.addEventListener('langchange', function () { fillKind(); if (D.recs) renderAll(); else if (!D.finished) $d('dl-status').textContent = ''; });
    setProgress(0, L(T2('في الانتظار…', 'Waiting…')));
    return { D: D, start: start, panel: panel, redraw: drawRoc, state: function () { return D; } };
  }

  /* ===================================================================== SENSOR LAB */
  var SRC_NAME = { S46: 'NIOSH / CDC', S47: 'NIOSH / OSHA', S48: 'NIOSH / NOAA CAMEO', S55: 'US National Weather Service', 'S31;S49': 'Doha News (MoDPS report) · US EPA', S50: 'WHO 2021', S65: 'Plantower PMS5003 datasheet',
    'S52;S19': 'OSHA/NIOSH · ILO (Qatar)', S51: 'US National Weather Service', S18: 'Qatar Ministry of Labour decision 17/2021', S69: 'MPU-6050 datasheet', 'S64;S62': 'Sensirion · Winsen datasheets', QMD: 'Qatar Meteorology Department' };
  var BASIS = { cited: { l: T2('مستشهد به', 'cited'), c: 'safe' }, derived: { l: T2('مشتق', 'derived'), c: 'info' }, 'student-set': { l: T2('يضبطه الطالب', 'student-set'), c: 'warn' }, 'N/A': { l: 'N/A', c: '' } };
  var THRESH = {
    gas: [
      { gas: 'lpg', m: T2('غاز البترول المسال (مكافئ البروبان)', 'LPG (propane equivalent)'), s: 'MQ-2', w: '1,000', d: '2,100', c: '—', u: 'ppm', src: 'S48', b: 'cited' },
      { gas: 'co', m: T2('أول أكسيد الكربون', 'Carbon monoxide'), s: 'MQ-7', w: '35', d: '200', c: '1,200', u: 'ppm', src: 'S46', b: 'cited' },
      { gas: 'h2s', m: T2('كبريتيد الهيدروجين', 'Hydrogen sulfide'), s: 'MQ-136', w: '10', d: '20', c: '100', u: 'ppm', src: 'S47', b: 'cited' },
      { m: T2('الميثان (لا حساس له في العدّة)', 'Methane (no sensor in the kit)'), s: '—', w: '2,650', d: '5,300', c: '—', u: 'ppm', src: 'S48', b: 'derived' },
      { m: T2('TVOC (SGP30) وجودة الهواء (MQ-135)', 'TVOC (SGP30) and air quality (MQ-135)'), s: 'SGP30 · MQ-135', w: 'N/A', d: 'N/A', c: '—', u: '—', src: 'S64;S62', b: 'N/A' }
    ],
    flood: [
      { m: T2('عمق الماء (فوق صوتي)', 'Water depth (ultrasonic)'), s: 'JSN-SR04T · HC-SR04', w: '15', d: '30', c: '46', u: 'cm', src: 'S55', b: 'derived' },
      { m: T2('مفتاح عوّامة', 'Float switch'), s: T2('مفتاح عوّامة', 'float switch'), w: '15', d: '30', c: '—', u: 'cm', src: 'S55', b: 'derived' },
      { m: T2('إنذار أمطار/رعد رسمي', 'Official rain/thunder warning'), s: T2('إنذار الأرصاد', 'met-service warning'), w: T2('صادر', 'issued'), d: '—', c: '—', u: '—', src: 'QMD', b: 'cited' },
      { m: T2('سرعة الجريان', 'Flow speed'), s: '—', w: 'N/A', d: 'N/A', c: '—', u: '—', src: 'S55', b: 'N/A' }
    ],
    heat: [
      { work: 'light', m: T2('WBGT تقديري — عمل خفيف', 'WBGT estimate — light work'), s: 'SHT31', w: '28', d: '32.1', c: '—', u: '°C', src: 'S52;S19', b: 'cited' },
      { work: 'moderate', m: T2('WBGT تقديري — عمل متوسط', 'WBGT estimate — moderate work'), s: 'SHT31', w: '25', d: '32.1', c: '—', u: '°C', src: 'S52;S19', b: 'cited' },
      { work: 'heavy', m: T2('WBGT تقديري — عمل شاق', 'WBGT estimate — heavy work'), s: 'SHT31', w: '23', d: '32.1', c: '—', u: '°C', src: 'S52;S19', b: 'cited' },
      { work: 'vheavy', m: T2('WBGT تقديري — عمل شاق جدًا', 'WBGT estimate — very heavy work'), s: 'SHT31', w: '21', d: '32.1', c: '—', u: '°C', src: 'S52;S19', b: 'cited' },
      { m: T2('مؤشر الحرارة (NWS)', 'Heat index (NWS)'), s: 'SHT31', w: '32.2', d: '39.4', c: '51.7', u: '°C', src: 'S51', b: 'derived' },
      { m: T2('مفتاح التقويم: 10:00–15:30 و1 يونيو–15 سبتمبر', 'Calendar key: 10:00–15:30 and 1 June–15 Sept'), s: T2('التقويم', 'calendar'), w: T2('داخل النافذة', 'inside window'), d: '—', c: '—', u: '—', src: 'S18', b: 'cited' },
      { m: T2('حرارة الجسم الداخلية', 'Core body temperature'), s: 'MLX90640', w: 'N/A', d: 'N/A', c: '—', u: '°C', src: 'S52;S19', b: 'N/A' }
    ],
    dust: [
      { m: T2('PM10 (متوسط 10 دقائق)', 'PM10 (10-minute mean)'), s: 'PMS5003', w: '150', d: '255', c: '425', u: 'µg/m³', src: 'S31;S49', b: 'cited' },
      { m: T2('مرجع WHO لـ24 ساعة (للعرض)', 'WHO 24-hour reference (display only)'), s: '—', w: '45', d: '—', c: '—', u: 'µg/m³', src: 'S50', b: 'cited' },
      { m: T2('قراءة مشبعة', 'Saturated reading'), s: 'PMS5003', w: '—', d: '500', c: '—', u: 'µg/m³', src: 'S65', b: 'derived' }
    ],
    sos: [
      { m: T2('زر الاستغاثة مضغوط', 'SOS button pressed'), s: T2('زر', 'button'), w: '—', d: T2('مضغوط', 'pressed'), c: '—', u: '—', src: '—', b: 'cited' },
      { m: T2('قمة التسارع عند الاصطدام', 'Impact peak (resultant acceleration)'), s: 'MPU6050', w: T2('قمة معايَرة', 'calibrated peak'), d: T2('قمة معايَرة + سكون', 'calibrated peak + stillness'), c: '—', u: 'g', src: 'S69', b: 'student-set' },
      { m: T2('السكون بعد الاصطدام', 'Stillness after impact'), s: 'MPU6050', w: '15', d: '—', c: '—', u: 's', src: 'S69', b: 'student-set' },
      { m: T2('لا ردّ على مكالمة التحقق', 'No answer to the check-in call'), s: T2('مكالمة', 'call'), w: '—', d: '30', c: '—', u: 's', src: '—', b: 'student-set' }
    ]
  };
  var HZ = [
    { id: 'gas', icon: 'wind', name: T2('تسرّب غاز', 'Gas leak'), alert: T2('إنذار عام', 'PUBLIC ALERT'), human: T2('المشغّل يعتمد', 'Operator approves'),
      lim: T2('حساسات MQ رخيصة وتتأثر بغازات أخرى (ورقة MQ-2 تقول «غاز قابل للاشتعال ودخان»)، وتنحرف مع الزمن والرطوبة، وتحتاج 48 ساعة من التسخين الأولي؛ ولا غاز مرجعيًا في المدرسة، فالأرقام تقريبية. لا يغني هذا أبدًا عن كاشف غاز معتمد.',
        'Cheap MQ sensors are cross-sensitive (the MQ-2 sheet says “combustible gas and smoke”), drift with time and humidity, and need 48 h of burn-in; there is no reference gas at school, so ppm are indicative. This is never a substitute for a certified gas detector.') },
    { id: 'flood', icon: 'signal', name: T2('سيول', 'Flash flood'), alert: T2('إنذار عام', 'PUBLIC ALERT'), human: T2('المشغّل يعتمد', 'Operator approves'),
      lim: T2('الحساس فوق الصوتي يقيس عمقًا ساكنًا لا جريانًا (N/A لهذا المُدخَل)، وتتغيّر قراءته مع حرارة الهواء (سرعة الصوت ≈ 331.3 + 0.606·T م/ث — مشتق)، وHC-SR04 غير مقاوم للماء، والسيل الحقيقي قد يسبق موافقة الإنسان — لذا يجب ألا ينتظر الإنذار المحلي ومفتاح العوّامة.',
        'An ultrasonic sensor measures still depth, not flow (N/A for this stimulus); its reading shifts with air temperature (speed of sound ≈ 331.3 + 0.606·T m/s — derived); the HC-SR04 is not waterproof; a real flash flood can outrun a human approval, so the local alarm and a float switch must not wait.') },
    { id: 'heat', icon: 'thermo', name: T2('إجهاد حراري', 'Extreme heat'), alert: T2('إنذار للعمّال', 'WORKER ALERT'), human: T2('المشرف يعتمد', 'Supervisor approves'),
      lim: T2('WBGT المحسوب من حرارة ورطوبة تقدير لا قياس، أما حدّ قطر 32.1°م فقيمة مقيسة. المستشعر في الشمس يقرأ أعلى بلا واقٍ إشعاعي. دالة الرطوبة المبلولة (Stull 2011) أقرب إلى الأدنى في الهواء الساكن (أسوأ فرق 0.86°م أمام حل سيكرومتري). وNIOSH نفسها تقول إن حدودها قد لا تحمي الجميع.',
        'WBGT computed from temperature and humidity is an estimate; Qatar’s 32.1 °C line is a measured value. A sensor in the sun reads high without a radiation shield. The wet-bulb function (Stull 2011) leans low in still air (worst difference 0.86 °C against a psychrometric solve). NIOSH itself says its limits may not protect everyone.') },
    { id: 'dust', icon: 'smoke', name: T2('عاصفة غبارية', 'Dust storm'), alert: T2('إنذار عام', 'PUBLIC ALERT'), human: T2('المشغّل يعتمد', 'Operator approves'),
      lim: T2('دقة PMS5003 محددة لـPM2.5 فقط (مداه 0–500)، وعاصفة حقيقية تتجاوز 7000 µg/m³ من PM10 (الدوحة 2015) فيشبع الحساس: القراءة المشبعة تعني «خطر على الأقل». المتوسط على 10 دقائق اختيار تصميمي. ولا معيار لرقم رؤية الكاميرا: عتبتنا لانخفاض الرؤية يضبطها الطالب.',
        'The PMS5003 specifies accuracy for PM2.5 only (range 0–500); a real storm exceeds 7,000 µg/m³ PM10 (Doha 2015), so the sensor saturates: a saturated reading means “at least danger”. The 10-minute mean is a design choice. There is no standard camera-visibility number: our visibility-drop threshold is student-set.') },
    { id: 'sos', icon: 'heart', name: T2('شخص يحتاج مساعدة', 'Someone needs help'), alert: T2('حزمة إلى غرفة السيطرة', 'PACKAGE TO CONTROL ROOM'), human: T2('المُرسِل يقرّر (محاكاة)', 'Dispatcher decides (SIM)'),
      lim: T2('كاشفات السقوط تفوّت سقطات وتُنذر خطأً، وزر الاستغاثة قد يُساء استعماله، ولا عتبة معيارية للسقوط (يعايرها الطالب بتجارب الإسقاط على فراش)، والذي يقرّر هو المُرسِل: يبقى 999 هو المُرسِل ومنارة ترسل حزمة موثّقة فقط. ليست جهازًا طبيًا.',
        'Fall detectors miss falls and misfire; the SOS button can be misused; there is no standard fall threshold (calibrate it with mattress drop tests); the dispatcher decides — in real life 999 stays the dispatcher and MANARA only sends a verified package. Not a medical device.') }
  ];
  var TICK_MS = 400;

  function initSensor(panel) {
    panel.innerHTML = tpl(
      '<div class="card sl-intro"><div class="panel-h"><span>' + icon('shield') + ' {{مختبر الحسّاسات — منطق المفتاحين للأخطار الأخرى|Sensor Lab — the two-key logic for the other hazards}}</span><span class="tag cool">{{محاكاة SIM|SIM}}</span></div>' +
        '<p>{{هذا هو المنطق نفسه الذي رأيته للحريق: مفتاح واحد = اشتباه، ومفتاحان مستقلان = مؤكَّد، وموافقة إنسان فوقهما = الإنذار. التدفقات هنا مولَّدة بالشيفرة (ليست قياسات حقيقية)؛ والعتبات من مستند الأخطار (معايير دولية موسومة بذلك، وقانون قطر للحرارة).|This is the same logic you saw for fire: one key = SUSPECT, two independent keys = CONFIRMED, a human on top = the alert. The streams here are generated by code (not real measurements); thresholds come from the hazards document (international standards labelled as such, plus Qatar law for heat).}}</p>' +
        '<div class="chips" id="sl-haz" role="group"></div></div>' +
      '<div id="sl-body"></div>');
    var S = {}, cur = null, timer = 0, active = false, built = null;
    var chipsBox = $('#sl-haz', panel), body = $('#sl-body', panel);
    HZ.forEach(function (hz) {
      var c = el('button', 'chip'); c.type = 'button'; c.id = 'sl-chip-' + hz.id; c.setAttribute('data-haz', hz.id); c.setAttribute('aria-pressed', 'false'); c.insertAdjacentHTML('beforeend', icon(hz.icon)); c.appendChild(el('span', '', L(hz.name)));
      c.addEventListener('click', function () { select(hz.id); }); chipsBox.appendChild(c);
    });
    function relabelChips() { $$('.chip', chipsBox).forEach(function (c, i) { c.lastChild.textContent = L(HZ[i].name); }); }
    function hz(id) { return HZ.filter(function (h) { return h.id === id; })[0]; }
    function st(id) { if (!S[id]) S[id] = { sim: Lab.sensors[id](), human: false, paused: false, ticks: 0 }; return S[id]; }

    function select(id) {
      cur = id; var A = st(id); $$('.chip', chipsBox).forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-haz') === id ? 'true' : 'false'); });
      build(id); if (active) start(); render();
    }
    function ctlRow(c, sim, A) {
      var P = sim.params, wrap = el('div', 'ctl'), val;
      function setV(v) { sim.set(c.id, v); if (c.id === 'gas' || c.id === 'work') buildThresh(); }
      if (c.type === 'range') {
        var lab = el('label', 'field'), sp = el('span'), b = el('b', 'mono'); sp.appendChild(document.createTextNode(L(c.label) + ': ')); sp.appendChild(b); lab.appendChild(sp);
        var inp = el('input'); inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = P[c.id] != null ? P[c.id] : c.value; inp.id = 'sl-c-' + c.id;
        var show = function () { var v = +inp.value; b.textContent = c.fmt === 'pct' ? num(v * 100, 0) + '%' : c.fmt === 'clock' ? (function () { var hh = floor(v), mm = round((v - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; })() : num(v, c.step < 1 ? 1 : 0) + (c.unit ? ' ' + c.unit : ''); };
        inp.addEventListener('input', function () { setV(+inp.value); show(); render(); }); show(); lab.appendChild(inp); wrap.appendChild(lab); wrap._lab = c; wrap._sp = sp;
        wrap._relabel = function () { sp.firstChild.nodeValue = L(c.label) + ': '; };
      } else if (c.type === 'select') {
        var lab2 = el('label', 'field'); lab2.appendChild(el('span', '', L(c.label))); var sel = el('select'); sel.id = 'sl-c-' + c.id;
        c.options.forEach(function (o) { var op = el('option', '', L(o.l)); op.value = o.v; sel.appendChild(op); }); sel.value = P[c.id] != null ? P[c.id] : c.value;
        sel.addEventListener('change', function () { setV(sel.value); render(); }); lab2.appendChild(sel); wrap.appendChild(lab2);
        wrap._relabel = function () { lab2.firstChild.textContent = L(c.label); $$('option', sel).forEach(function (op, i) { op.textContent = L(c.options[i].l); }); };
      } else if (c.type === 'switch') {
        var lab3 = el('label', 'switch'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'sl-c-' + c.id; cb.checked = !!(P[c.id] != null ? P[c.id] : c.value); var sp3 = el('span', '', L(c.label)); lab3.appendChild(cb); lab3.appendChild(sp3);
        cb.addEventListener('change', function () { setV(cb.checked); render(); }); wrap.appendChild(lab3); wrap._relabel = function () { sp3.textContent = L(c.label); };
      } else if (c.type === 'toggle') {
        var bt = el('button', 'btn btn-ghost btn-sm'); bt.type = 'button'; bt.id = 'sl-c-' + c.id; var on = !!P[c.id];
        var paint = function () { bt.setAttribute('aria-pressed', on ? 'true' : 'false'); bt.textContent = L(on ? c.labelOn : c.label); };
        bt.addEventListener('click', function () { on = !on; setV(on); paint(); render(); }); paint(); wrap.appendChild(bt); wrap._relabel = paint;
      } else if (c.type === 'date') {
        var lab4 = el('label', 'field'); lab4.appendChild(el('span', '', L(c.label))); var di = el('input', 'input'); di.type = 'date'; di.id = 'sl-c-' + c.id; di.value = P[c.id] || c.value;
        di.addEventListener('change', function () { setV(di.value); render(); }); lab4.appendChild(di); wrap.appendChild(lab4); wrap._relabel = function () { lab4.firstChild.textContent = L(c.label); };
      } else if (c.type === 'button') {
        var b2 = el('button', 'btn btn-ghost btn-sm'); b2.type = 'button'; b2.id = 'sl-c-' + c.id; b2.textContent = L(c.label);
        b2.addEventListener('click', function () { sim.act(c.id); if (c.id === 'cold') { A.human = false; } render(); }); wrap.appendChild(b2); wrap._relabel = function () { b2.textContent = L(c.label); };
      }
      return wrap;
    }
    var relabelers = [];
    function build(id) {
      var H = hz(id), A = st(id), sim = A.sim; relabelers = []; clear(body); built = id;
      body.innerHTML = tpl(
        '<div class="lab-grid sl">' +
          '<div class="lab-main">' +
            '<div class="card"><div class="panel-h"><span id="sl-title"></span><span class="tag cool">SIM</span></div>' +
              '<div class="note warn" id="sl-banner" hidden></div>' +
              '<div class="chart-wrap"><canvas id="sl-chart" role="img"></canvas></div>' +
              '<ul class="legend chart-legend" id="sl-legend"></ul>' +
              '<p class="muted small" id="sl-axis"></p>' +
              '<div class="grid g4 readings" id="sl-readings"></div>' +
            '</div>' +
            '<div class="card"><div class="panel-h"><span>{{حقن الأحداث والضجيج|Inject events and noise}}</span><span class="btns"><button class="btn btn-ghost btn-sm" type="button" id="sl-pause">' + icon('pause') + '<span></span></button><button class="btn btn-ghost btn-sm" type="button" id="sl-reset">' + icon('reset') + '<span>{{من جديد|Reset}}</span></button></span></div><div class="ctl-grid" id="sl-controls"></div></div>' +
          '</div>' +
          '<div class="lab-side">' +
            '<div class="card"><div class="panel-h"><span>{{سلّم الحالة: مفتاح ← مفتاحان ← إنسان|The state ladder: key → two keys → human}}</span></div>' +
              '<ul class="keys-list" id="sl-keys"></ul><ol class="ladder" id="sl-ladder"></ol>' +
              '<div class="btns"><button class="btn btn-danger" type="button" id="sl-approve" disabled>' + icon('bell') + '<span></span></button><button class="btn btn-ghost" type="button" id="sl-stand" hidden>{{إلغاء الاعتماد|Withdraw approval}}</button></div>' +
              '<p class="muted small" id="sl-keynote"></p></div>' +
            '<div class="card"><div class="panel-h"><span>{{العتبات (من مستند الأخطار)|Thresholds (from the hazards document)}}</span></div><div class="table-wrap"><table class="table th-table" id="sl-thresh"><thead><tr><th>{{المقياس|Metric}}</th><th>{{الحسّاس|Sensor}}</th><th>{{تحذير|Warn}}</th><th>{{خطر|Danger}}</th><th>{{حرج|Critical}}</th><th>{{الوحدة|Unit}}</th><th>{{المصدر|Source}}</th><th>{{الأساس|Basis}}</th></tr></thead><tbody></tbody></table></div>' +
              '<p class="muted small">{{«مستشهد به» = من معيار أو حدّ تعرّض أو تصنيف منتج؛ «مشتق» = حسابنا على أرقام مستشهد بها؛ «يضبطه الطالب» = افتراض عرض لا معيار؛ N/A = لا رقم صادق لهذا المُدخَل. الأرقام الدولية (أمريكية) موسومة بذلك في المصادر.|“cited” = from a standard, exposure limit or product rating; “derived” = our arithmetic on cited numbers; “student-set” = a demo default, not a standard; N/A = no honest number exists for this stimulus. International (US) figures are labelled as such in the sources list.}}</p></div>' +
            '<div class="note"><p><b>{{حدود هذا الحسّاس|Limits of this sensor}}</b> — <span id="sl-limit"></span></p></div>' +
          '</div></div>');
      $('#sl-title', body).textContent = L(H.name);
      var box = $('#sl-controls', body); sim.controls.forEach(function (c) { var r = ctlRow(c, sim, A); relabelers.push(r._relabel); box.appendChild(r); });
      LADDER.forEach(function (s) { var li = el('li', 'step'); li.setAttribute('data-step', s.id); $('#sl-ladder', body).appendChild(li); });
      $('#sl-limit', body).textContent = L(H.lim);
      $('#sl-pause', body).addEventListener('click', function () { A.paused = !A.paused; render(); });
      $('#sl-reset', body).addEventListener('click', function () { sim.reset(); A.human = false; A.ticks = 0; render(); });
      $('#sl-approve', body).addEventListener('click', function () { A.human = true; Manara.toast({ ar: 'اعتُمد (محاكاة): ' + H.alert.ar, en: 'Approved (SIM): ' + H.alert.en }, 'danger'); render(); });
      $('#sl-stand', body).addEventListener('click', function () { A.human = false; render(); });
      bindAttr($('#sl-chart', body), 'aria-label', 'مخطط حيّ للقراءات المحاكاة مع خطوط العتبات', 'Live chart of the simulated readings with the threshold lines');
      buildThresh();
    }
    function buildThresh() {
      var id = cur, A = st(id), P = A.sim.params, tb = $('#sl-thresh tbody', body); if (!tb) return; clear(tb);
      THRESH[id].forEach(function (r) {
        var hi = (r.gas && r.gas === P.gas) || (r.work && r.work === P.work), tr = el('tr', hi ? 'hi' : '');
        var cells = [L(r.m), typeof r.s === 'object' ? L(r.s) : r.s, typeof r.w === 'object' ? L(r.w) : r.w, typeof r.d === 'object' ? L(r.d) : r.d, r.c, r.u];
        cells.forEach(function (t, i) { var td = el('td', i >= 2 && i <= 4 ? 'num' : '', t === 'N/A' ? L(T2('N/A لهذا المُدخَل', 'N/A for this stimulus')) : t); if (t === 'N/A') td.className = 'na'; tr.appendChild(td); });
        var sTd = el('td'); sTd.appendChild(el('span', 'mono', r.src)); if (SRC_NAME[r.src]) { sTd.appendChild(document.createElement('br')); sTd.appendChild(el('small', 'muted', SRC_NAME[r.src])); } tr.appendChild(sTd);
        var bTd = el('td'); bTd.appendChild(el('span', 'tag ' + BASIS[r.b].c, L(BASIS[r.b].l))); tr.appendChild(bTd); tb.appendChild(tr);
      });
    }
    function drawChart(v) {
      var cv = $('#sl-chart', body); if (!cv) return; readTokens();
      var dpr = min(2, window.devicePixelRatio || 1), cssW = cv.clientWidth || 480, cssH = max(190, round(cssW * 0.4)); cv.width = round(cssW * dpr); cv.height = round(cssH * dpr); cv.style.height = cssH + 'px';
      var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cssW, cssH);
      var padL = 40, padR = 34, padT = 10, padB = 8, W = cssW - padL - padR, Hh = cssH - padT - padB, y0 = v.yMin || 0, y1 = v.yMax;
      function Yv(val, scale) { var lo = scale ? 0 : y0, hi = scale === 'g' ? 8 : scale === 's' ? 36 : y1; return padT + (1 - sat((val - lo) / (hi - lo))) * Hh; }
      g.font = '10px ' + TK['font-m']; g.lineWidth = 1; g.strokeStyle = TK.line; g.fillStyle = TK.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
      for (var i = 0; i <= 4; i++) { var yy = padT + Hh * i / 4, val = y1 - (y1 - y0) * i / 4; g.beginPath(); g.moveTo(padL, yy); g.lineTo(padL + W, yy); g.stroke(); g.fillText(v.dual ? num(8 - 8 * i / 4, 0) + 'g' : (val >= 100 ? num(val, 0) : num(val, val % 1 ? 1 : 0)), padL - 5, yy); }
      if (v.dual) { g.textAlign = 'left'; for (var k = 0; k <= 4; k++) g.fillText(num(36 - 36 * k / 4, 0) + 's', padL + W + 4, padT + Hh * k / 4); }
      var colors = { brand: TK.brand, accent: TK.accent };
      v.hlines.forEach(function (h) {
        var y = Yv(h.v, h.scale); if (y < padT - 1 || y > padT + Hh + 1) return;
        g.strokeStyle = h.kind === 'warn' ? TK.warn : h.kind === 'ref' ? TK.muted : TK.danger; g.lineWidth = h.kind === 'crit' ? 2 : 1.5; g.setLineDash(h.kind === 'crit' ? [] : [5, 4]); g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + W, y); g.stroke(); g.setLineDash([]);
      });
      v.lines.forEach(function (ln) {
        var d = ln.data; if (!d.length) return; g.strokeStyle = colors[ln.c] || TK.ink; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
        d.forEach(function (val, j) { var x = padL + (SERIES_N <= 1 ? 0 : (j + (SERIES_N - d.length)) / (SERIES_N - 1) * W), y = Yv(val, ln.scale); if (j) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      });
    }
    function render() {
      if (!cur || !body.firstChild) return;
      var H = hz(cur), A = st(cur), sim = A.sim, v = sim.view();
      var kb = $('#sl-keys', body); clear(kb);
      [['k1', T2('المفتاح 1', 'Key 1')], ['k2', T2('المفتاح 2 (مستقل)', 'Key 2 (independent)')]].forEach(function (k) {
        var li = el('li', 'key-row'); li.setAttribute('data-on', v.keys[k[0]].on ? '1' : '0'); li.id = 'sl-' + k[0];
        li.appendChild(el('span', 'kdot')); var t = el('div'); t.appendChild(el('b', '', L(k[1]))); t.appendChild(el('small', 'muted', L(v.keys[k[0]].text))); li.appendChild(t); li.appendChild(el('span', 'tag ' + (v.keys[k[0]].on ? 'danger' : ''), v.keys[k[0]].on ? L(T2('مضاء', 'lit')) : L(T2('مطفأ', 'off')))); kb.appendChild(li);
      });
      var n = (v.keys.k1.on ? 1 : 0) + (v.keys.k2.on ? 1 : 0); if (n === 0) A.human = false; if (n < 2) A.human = false;
      var lvl = Lab.ladderOf(v.keys.k1.on, v.keys.k2.on, A.human);
      var hk = el('li', 'key-row'); hk.setAttribute('data-on', A.human ? '1' : '0'); hk.id = 'sl-human'; hk.appendChild(el('span', 'kdot')); var ht = el('div'); ht.appendChild(el('b', '', L(T2('المفتاح 3: الإنسان', 'Key 3: the human')))); ht.appendChild(el('small', 'muted', L(H.human))); hk.appendChild(ht); hk.appendChild(el('span', 'tag ' + (A.human ? 'danger' : ''), A.human ? L(T2('مضاء', 'lit')) : L(T2('مطفأ', 'off')))); kb.appendChild(hk);
      var lad = $$('#sl-ladder .step', body); var labels = [LADDER[0].l, LADDER[1].l, LADDER[2].l, T2(H.alert.ar + ' · بموافقة إنسان', H.alert.en + ' · human approved')];
      lad.forEach(function (li, i) { li.textContent = L(labels[i]); li.setAttribute('data-on', LADDER[i].id === lvl ? '1' : '0'); if (LADDER[i].id === lvl) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      var ladEl = $('#sl-ladder', body); ladEl.setAttribute('data-level', lvl);
      var ap = $('#sl-approve', body); ap.disabled = lvl !== 'confirmed'; ap.lastChild.textContent = L(H.human); $('#sl-stand', body).hidden = !A.human;
      $('#sl-keynote', body).textContent = L(lvl === 'alert' ? T2('اعتُمد (محاكاة): هذا هو ما سيخرج: ' + L(H.alert) + '.', 'Approved (SIM): this is what would go out: ' + L(H.alert) + '.')
        : lvl === 'confirmed' ? T2('مفتاحان مستقلان مضاءان: بانتظار الإنسان.', 'Two independent keys are lit: waiting for the human.') : lvl === 'suspect' ? T2('مفتاح واحد لا يكفي: اشتباه فقط، ولا إنذار عام.', 'One key is not enough: SUSPECT only, no public alert.') : T2('كل شيء هادئ.', 'All quiet.'));
      $('#sl-pause', body).innerHTML = icon(A.paused ? 'play' : 'pause') + '<span>' + L(A.paused ? T2('استئناف', 'Resume') : T2('إيقاف', 'Pause')) + '</span>';
      var ban = $('#sl-banner', body); ban.hidden = !v.banner; if (v.banner) ban.textContent = L(v.banner);
      var rd = $('#sl-readings', body); clear(rd);
      v.readings.forEach(function (r) { var d = el('div', 'kpi'), b = el('b', 'mono', typeof r.v === 'object' ? L(r.v) : num(r.v, r.d == null ? 0 : r.d) + (r.u ? ' ' + r.u : '')), s = el('span', '', L(r.l)); d.appendChild(b); d.appendChild(s); rd.appendChild(d); });
      if (v.hi != null) { var band = v.hi >= 51.7 ? T2('خطر شديد', 'Extreme danger') : v.hi >= 39.4 ? T2('خطر', 'Danger') : v.hi >= 32.2 ? T2('حذر شديد', 'Extreme caution') : T2('حذر/عادي', 'Caution or lower'); rd.lastChild.appendChild(el('small', 'muted', L(band))); }
      var lg = $('#sl-legend', body); clear(lg);
      v.lines.forEach(function (ln) { var li = el('li'), sw = el('i', 'sw sw-line ' + (ln.c === 'accent' ? 'b2' : 'a')); li.appendChild(sw); li.appendChild(document.createTextNode(L(ln.name))); lg.appendChild(li); });
      v.hlines.forEach(function (h) { var li = el('li'), sw = el('i', 'sw sw-dash ' + h.kind); li.appendChild(sw); var txt = L(h.label); if (h.kind === 'warn' && cur === 'heat') txt += num(WORK[A.sim.params.work].limit, 0); li.appendChild(document.createTextNode(txt + (h.kind === 'ref' || /\d/.test(txt) ? '' : ' ' + num(h.v, h.v % 1 ? 1 : 0) + (v.unit ? ' ' + v.unit : '')))); lg.appendChild(li); });
      $('#sl-axis', body).textContent = L(T2('آخر 120 عيّنة · كل عيّنة = ', 'Last 120 samples · each sample = ')) + L(sim.unitLabel) + ' · ' + L(T2('محاكاة', 'simulated'));
      drawChart(v);
      relabelers.forEach(function (f) { if (f) f(); });
    }
    function tick() { if (!active || !cur) return; var A = st(cur); if (!A.paused) { A.sim.step(); A.ticks++; } render(); }
    function start() { stop(); timer = setInterval(tick, TICK_MS); }
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    window.addEventListener('langchange', function () { relabelChips(); if (cur) { var H = hz(cur); $('#sl-title', body).textContent = L(H.name); $('#sl-limit', body).textContent = L(H.lim); buildThresh(); render(); } });
    window.addEventListener('themechange', function () { render(); });
    var rz2; window.addEventListener('resize', function () { clearTimeout(rz2); rz2 = setTimeout(render, 120); });
    select('gas');
    return {
      setActive: function (on) { active = on; if (on) { start(); render(); } else stop(); },
      select: select, state: function () { return S; }, tick: tick, current: function () { return cur; }, panel: panel
    };
  }

  /* ===================================================================== boot: tabs, drawer, test hook */
  var TABS = ['live', 'fool', 'decoy', 'sensor'];
  function boot() {
    readTokens();
    var tabEls = TABS.map(function (id) { return document.getElementById('t-' + id); }), panels = TABS.map(function (id) { return document.getElementById('p-' + id); });
    var live = initLive(panels[0]), fool = initFool(panels[1]), decoy = initDecoy(panels[2]), sensor = initSensor(panels[3]);
    var foolStarted = false, current = null;
    function show(id, focus) {
      if (TABS.indexOf(id) < 0) id = 'live';
      current = id;
      TABS.forEach(function (t, i) { var on = t === id; tabEls[i].setAttribute('aria-selected', on ? 'true' : 'false'); tabEls[i].tabIndex = on ? 0 : -1; panels[i].hidden = !on; });
      live.stage.setActive(id === 'live'); fool.stage.setActive(id === 'fool'); sensor.setActive(id === 'sensor');
      if (id === 'fool' && !foolStarted) { foolStarted = true; fool.stage.startScene('scarf'); }
      if (id === 'decoy') { decoy.start(true); decoy.redraw(); }
      if (id === 'sensor') sensor.tick();
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// quirks */ }
      if (focus) tabEls[TABS.indexOf(id)].focus();
    }
    tabEls.forEach(function (b, i) {
      b.addEventListener('click', function () { show(TABS[i]); });
      b.addEventListener('keydown', function (e) {
        var rtl = document.documentElement.dir === 'rtl', n = TABS.length, d = 0;
        if (e.key === 'ArrowRight') d = rtl ? -1 : 1; else if (e.key === 'ArrowLeft') d = rtl ? 1 : -1; else if (e.key === 'Home') { show(TABS[0], true); e.preventDefault(); return; } else if (e.key === 'End') { show(TABS[n - 1], true); e.preventDefault(); return; }
        if (d) { e.preventDefault(); show(TABS[(i + d + n) % n], true); }
      });
    });
    var drawer = document.getElementById('drawer'), openBtn = document.getElementById('open-drawer');
    if (openBtn) openBtn.addEventListener('click', function () { drawer.open = true; drawer.scrollIntoView({ behavior: Manara.reduce ? 'auto' : 'smooth', block: 'start' }); });
    window.addEventListener('themechange', readTokens);
    window.addEventListener('langchange', refreshAttrs);
    var h = (location.hash || '').slice(1);
    show(TABS.indexOf(h) >= 0 ? h : 'live');
    if (!live.stage.st.kind) live.stage.startScene('flame');
    setTimeout(function () { decoy.start(false); }, 2500);
    Manara.applyI18n(document); refreshAttrs();
    root.ManaraEvidence = { lab: Lab, live: live, fool: fool, decoy: decoy, sensor: sensor, show: show, Cam: Cam, Ser: Ser, tokens: TK, current: function () { return current; } };
    root.__detectReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
