// Home hero water: a full-hero, interactive water surface that sits behind the whole hero.
//
// WebGL1, one full-screen triangle, one fragment shader, no float or ping-pong textures. The surface is
// analytic: a handful of long swell waves plus up to 24 travelling ripple packets (x, y, start time,
// strength). Heights, slopes and the curvature (Hessian) of the surface are summed per pixel; the slopes drive
// shading (specular, rim, refraction of the floor) and the curvature drives the caustics, so the bright
// light-lines really bend and ring around every ripple. Team colours (--t1…--t7) ride on the ripple crests.
//
// Behaviour: pointer wake, press = big ripple + ring echo, idle raindrops, a staggered burst from the fountain
// pool on load, `yanabee:drop` events ({x, y, strength} in client px) and window.YanabeeWater. Pauses off-screen
// and in background tabs, adapts its resolution to the device and gives up gracefully when it cannot keep up.
// Without WebGL a light 2D version (rings + glow) is drawn instead; with prefers-reduced-motion one static frame.
// Decorative only (the canvas is aria-hidden). Classic script, no dependencies.
(() => {
  'use strict';
  const first = document.querySelector('canvas[data-water]');
  if (!first) return;

  // Debug / test knobs, read once (set before this script runs):
  //   window.YANABEE_WATER = { gl: 'auto' | 'force' | 'off', guard: true | false, lite: true | false }
  // gl 'force' also accepts a software WebGL (headless CI), 'off' uses the 2D fallback; guard false disables the
  // performance guard; lite renders the cheaper variant (one caustic layer) from the start.
  const OPT = window.YANABEE_WATER || {};
  const root = document.documentElement;
  const hero = first.closest('.hero') || first.parentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;

  /* ---------------------------------------------------------------- tuning knobs */
  const CFG = {
    ripples: 24,          // size of the ripple pool (trimmed to what the GPU allows)
    speed: 185,           // px/s, front speed of a scale-1 ripple
    wavelength: 38,       // px, wavelength of a scale-1 ripple
    decay: 2.4,           // s, amplitude fade (e-folding) of a scale-1 ripple
    depthRipple: 15,      // virtual depth of the floor seen through ripples (caustic strength)
    depthSwell: 22,       // same for the ambient swell (kept low so the swell bends light but does not make blobs)
    swellSlope: 0.11,     // slope amplitude of each swell wave (refraction / sheen of the calm water)
    net: { cell: 96, cell2: 58, width: 0.075, speed: 0.45 }, // caustic network: cell size px, line width, drift speed
    chroma: 0.035,         // colour split of the caustics (0 = none)
    normalGain: 1.5,      // slope -> normal tilt (specular / rim strength)
    swellSheen: 0.45,     // how much of the ambient swell shows in the shading
    refract: 36,          // px, shift of the floor pattern per unit of slope
    calm: 0.6,            // 0..1 damping of ripples over the hero copy
    calmFeather: 190,     // px, soft edge of the calm zone around the hero copy
    dropEvery: [0.7, 1.6],   // s, idle raindrops
    sourceEvery: [1.1, 1.9], // s, ripples from the fountain pool
    wake: { dist: 28, ms: 32 },                  // pointer wake: min distance (px) / time between ripples
    levels: [1, 0.6, 0.4],                       // render scale steps of the performance guard
    budgets: [1.8e6, 1.0e6, 0.5e6],              // max drawing-buffer pixels per step
    slowMs: 24, giveUpMs: 40, crawlMs: 90, crawlN: 8, window: 40, warm: 4,
  };
  const NW = 6; // swell waves
  const T_STATIC = 7; // the frozen moment drawn for reduced motion

  /* ---------------------------------------------------------------- small helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const fract = v => v - Math.floor(v);
  const fl = v => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(5)));
  const T0 = performance.now();
  const tNow = () => (performance.now() - T0) / 1000;

  /* ---------------------------------------------------------------- state */
  let canvas = first;
  let renderer = null;           // { kind, draw(t), resize(bw, bh), theme(), probe() }
  let N = CFG.ripples;
  let R = new Float32Array(N * 4); // x, y, start time (s), strength   (strength 0 = free slot)
  let Q = new Float32Array(N * 4); // scale, hue, width factor, life factor
  let ring = new Array(N * 4).fill('#fff'); // 2D fallback: stroke colour of each ripple's four rings (built at spawn, not per frame)
  const Wv = new Float32Array(NW * 4); // swell waves: kx, ky, phase, height amplitude
  const wave = [];
  for (let j = 0; j < NW; j++) {
    const fine = j < NW - 2, f1 = fract(j * 0.618 + 0.2);
    const th = j * 2.39996 + 0.5, lam = fine ? 52 + 96 * f1 : 190 + 130 * f1, k = 6.2831853 / lam;
    const a = CFG.swellSlope * (fine ? 1 : 1.3) * (0.75 + 0.5 * fract(j * 0.53 + 0.3));
    wave.push({
      kx: k * Math.cos(th), ky: k * Math.sin(th), ph: j * 1.7, om: 0.4 + 0.8 * fract(j * 0.381 + 0.1),
      a, b: a / k, mf: 0.11 + 0.07 * fract(j * 0.7),
    });
  }
  let W = 0, H = 0, bw = 0, bh = 0, scale = 1, level = 0, lite = false;
  const src = { x: 0, y: 0, r: 300 };
  const copy = new Float32Array([-9999, -9999, -9999, -9999]);
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, k: 0, tk: 0, hue: 0 };
  const K = new Float32Array(7 * 3);    // hero-1, hero-2, hero-3, accent, sky, sun, bg
  const TEAM = new Float32Array(7 * 3); // --t1 … --t7
  let dark = true;
  let running = false, raf = 0, visible = true, manualPause = false, lost = false, shown = false, off = false;
  let reduced = mqReduce.matches;
  let lastNow = 0, frames = 0, gN = 0, gSum = 0, crawl = 0, warm = CFG.warm;
  let softGL = false, pendingBurst = true, introForce = false, nextDrop = 0, nextSrc = 0, wakeX = NaN, wakeY = NaN, wakeT = 0, hueAcc = Math.random();

  /* ---------------------------------------------------------------- colours from the design tokens */
  const FB_DARK = ['#06302f', '#0c2246', '#2a1d10', '#3ee0d1', '#7ea7ff', '#f4a25c', '#04131a'];
  const FB_LIGHT = ['#d5f1ec', '#dbe7fb', '#fbe9d6', '#12a8a4', '#2c63d6', '#d9762a', '#f3f8f7'];
  const FB_TEAM = ['#46d39c', '#f0a95a', '#ff8d75', '#91a8ff', '#9bd66b', '#cb9cf3', '#f388b2'];
  const parseColor = (str, out, o, fb) => {
    let s = (str || '').trim(), m = null;
    if (!/^(#|rgb)/i.test(s)) s = fb;
    if ((m = /^#([\da-f])([\da-f])([\da-f])$/i.exec(s))) {
      for (let i = 0; i < 3; i++) out[o + i] = parseInt(m[i + 1] + m[i + 1], 16) / 255;
    } else if ((m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(s))) {
      for (let i = 0; i < 3; i++) out[o + i] = parseInt(m[i + 1], 16) / 255;
    } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) {
      for (let i = 0; i < 3; i++) out[o + i] = clamp(+m[i + 1] / 255, 0, 1);
    } else if (fb !== s) parseColor(fb, out, o, '#000000');
  };
  const readTokens = () => {
    const cs = getComputedStyle(root);
    const th = root.dataset.theme;
    dark = th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const fb = dark ? FB_DARK : FB_LIGHT;
    ['--hero-1', '--hero-2', '--hero-3', '--accent', '--sky', '--sun', '--bg'].forEach((n, i) => parseColor(cs.getPropertyValue(n), K, i * 3, fb[i]));
    for (let i = 0; i < 7; i++) parseColor(cs.getPropertyValue('--t' + (i + 1)), TEAM, i * 3, FB_TEAM[i]);
  };
  // team palette at hue h (wraps), as 0..255 ints
  const palRGB = (h, out) => {
    const f = fract(h) * 7, i0 = Math.floor(f) % 7, i1 = (i0 + 1) % 7, m = f - Math.floor(f);
    for (let c = 0; c < 3; c++) out[c] = Math.round(255 * (TEAM[i0 * 3 + c] * (1 - m) + TEAM[i1 * 3 + c] * m));
  };
  const rgb3 = [0, 0, 0];
  const palCss = (h, a) => { palRGB(h, rgb3); return 'rgba(' + rgb3[0] + ',' + rgb3[1] + ',' + rgb3[2] + ',' + a + ')'; };

  /* ---------------------------------------------------------------- layout (hero-relative px) */
  const measure = () => {
    const cr = canvas.getBoundingClientRect();
    W = Math.max(1, canvas.clientWidth || cr.width); H = Math.max(1, canvas.clientHeight || cr.height);
    const cp = hero.querySelector('.hero-copy');
    if (cp) {
      const r = cp.getBoundingClientRect();
      copy[0] = r.left - cr.left; copy[1] = r.top - cr.top; copy[2] = r.right - cr.left; copy[3] = r.bottom - cr.top;
    } else copy.fill(-9999);
    const sc = hero.querySelector('.spring-core');
    const r = sc ? sc.getBoundingClientRect() : null;
    if (r && r.width > 0) { src.x = r.left - cr.left + r.width / 2; src.y = r.top - cr.top + r.height / 2; }
    else { src.x = W * 0.3; src.y = H * 0.72; }
    src.r = clamp(Math.min(W, H) * 0.62, 220, 520);
  };

  /* ---------------------------------------------------------------- ripple pool */
  const life = i => CFG.decay * Math.sqrt(Q[i * 4]) * Q[i * 4 + 3];
  const paintRings = i => { for (let r = 0; r < 4; r++) ring[i * 4 + r] = palCss(Q[i * 4 + 1] + r * 0.04, 1); };
  const repaintRings = () => { for (let i = 0; i < N; i++) paintRings(i); };
  // t0 may lie in the future (staggered bursts). The slot with the least energy left is reused.
  const spawn = (x, y, s, sc, hue, wf, t0, lf) => {
    const tn = tNow();
    let best = 0, be = 1e9;
    for (let i = 0; i < N; i++) {
      const st = R[i * 4 + 3];
      let e = 0;
      if (st > 0) { const age = tn - R[i * 4 + 2]; e = age <= 0 ? st * 1.5 : st * Math.exp(-age / life(i)); }
      if (e < be) { be = e; best = i; }
    }
    const o = best * 4;
    R[o] = x; R[o + 1] = y; R[o + 2] = t0 === undefined ? tn : t0; R[o + 3] = s;
    Q[o] = sc; Q[o + 1] = hue; Q[o + 2] = wf || 1; Q[o + 3] = lf || 1;
    paintRings(best);
  };
  const retire = t => {
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (R[o + 3] <= 0) continue;
      const age = t - R[o + 2];
      if (age > 4.2 * life(i)) { R[o + 3] = 0; continue; }
      if (age > 0) { // packet entirely beyond the farthest corner
        const sq = Math.sqrt(Q[o]), rr = CFG.speed * sq * age, w = CFG.wavelength * sq * Q[o + 2] * (1.3 + 0.45 * age);
        const dx = Math.max(R[o], W - R[o]), dy = Math.max(R[o + 1], H - R[o + 1]);
        if (rr - 2.4 * w > Math.sqrt(dx * dx + dy * dy)) R[o + 3] = 0;
      }
    }
  };
  const clearRipples = () => { R.fill(0); Q.fill(0); };

  const bigDrop = (x, y, power, t0) => { // one nicely proportioned drop; power 0..1.4
    const p = clamp(power, 0.05, 1.4), t = t0 === undefined ? tNow() : t0, hue = Math.random();
    spawn(x, y, clamp(0.2 + 0.62 * p, 0.2, 1.05), 0.8 + 0.95 * Math.min(p, 1.2), hue, 1, t, 1);
    if (p > 0.75) spawn(x, y, 0.62 * Math.min(p, 1), 1.25 + 0.45 * Math.min(p, 1.2), hue + 0.14, 0.5, t + 0.15, 0.9);
  };
  const burst = () => { // seven ripples, one per team colour, out of the fountain pool
    const t = tNow() + 0.05;
    for (let i = 0; i < 7; i++) spawn(src.x, src.y, 0.42 + i * 0.045, 0.85 + i * 0.17, i / 7, 1, t + i * 0.12, 1);
    spawn(src.x, src.y, 0.6, 2.2, 0.5, 0.5, t + 1.0, 1);
  };
  const randomDrop = () => {
    let x = 0, y = 0;
    for (let a = 0; a < 4; a++) { // prefer places away from the copy text
      x = rnd(W * 0.04, W * 0.96); y = rnd(H * 0.06, H * 0.9);
      if (x < copy[0] - 40 || x > copy[2] + 40 || y < copy[1] - 40 || y > copy[3] + 40) break;
    }
    spawn(x, y, rnd(0.26, 0.5), rnd(0.75, 1.3), Math.random(), 1, tNow(), 1);
  };
  const setupStatic = () => { // a few frozen ripples for reduced motion
    clearRipples();
    const T = T_STATIC;
    const at = (x, y, age, s, sc, hue, wf) => spawn(x, y, s, sc, hue, wf || 1, T - age, 1.6);
    at(src.x, src.y, 0.55, 0.5, 0.9, 0.0);
    at(src.x, src.y, 1.15, 0.5, 1.3, 0.3);
    at(src.x, src.y, 2.2, 0.55, 1.8, 0.62);
    at(W * 0.7, H * 0.3, 0.9, 0.42, 1.0, 0.8);
    at(W * 0.16, H * 0.3, 1.1, 0.42, 1.1, 0.45);
    at(W * 0.54, H * 0.7, 0.7, 0.4, 0.9, 0.12);
  };

  /* ---------------------------------------------------------------- WebGL renderer */
  const VS = 'attribute vec2 aP;uniform vec2 uRes;varying vec2 vP;void main(){vP=vec2(aP.x*.5+.5,.5-aP.y*.5)*uRes;gl_Position=vec4(aP,0.,1.);}';

  const fragSrc = (n, deriv) => `${deriv ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n' : ''}
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define N ${n}
#define NW ${NW}
#define NWL ${NW - 2}
#define SPEED ${fl(CFG.speed)}
#define LAM ${fl(CFG.wavelength)}
#define DECAY ${fl(CFG.decay)}
#define DR ${fl(CFG.depthRipple)}
#define DA ${fl(CFG.depthSwell)}
#define CHROMA ${fl(CFG.chroma)}
#define NGAIN ${fl(CFG.normalGain)}
#define SHEEN ${fl(CFG.swellSheen)}
#define REFR ${fl(CFG.refract)}
#define CALM ${fl(CFG.calm)}
#define FEATHER ${fl(CFG.calmFeather)}
#define CELL ${fl(CFG.net.cell)}
#define CELL2 ${fl(CFG.net.cell2)}
#define NETW ${fl(CFG.net.width)}
#define NETV ${fl(CFG.net.speed)}
varying vec2 vP;
uniform vec2 uRes;
uniform float uT;
uniform float uDark;
uniform vec4 uR[N];
uniform vec4 uQ[N];
uniform vec4 uW[NW];
uniform vec3 uK[7];
uniform vec4 uSrc;
uniform vec4 uPtr;
uniform vec4 uCopy;
uniform vec2 uMisc;
uniform sampler2D uPal;

float hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// distance gap between the two nearest drifting seeds: ~0 along the walls of a cellular network.
vec2 seed(vec2 c, float tt){
  vec2 x = fract(hash22(c) + tt) * 2.0 - 1.0; // parabolic sine: smooth, no transcendental
  return 0.5 + 1.4 * x * (1.0 - abs(x));
}
float cellEdge(vec2 p, float tt){
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + seed(ip + g, tt) - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return sqrt(f2) - sqrt(f1);
}
float noise2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 pal(float h){ return texture2D(uPal, vec2((fract(h) * 7.0 + 0.5) / 8.0, 0.5)).rgb; }

void main(){
  vec2 p = vP;
  vec2 uv = p / uRes;
  float t = uT;
  bool lite = uMisc.x > 0.5;
  vec3 c0 = uK[0], c1 = uK[1], c2 = uK[2], acc = uK[3], sky = uK[4], bgc = uK[6];

  // calm zone: the hero copy sits on quieter, softer water so the text stays crisp
  vec2 cm = (uCopy.xy + uCopy.zw) * 0.5, ch = (uCopy.zw - uCopy.xy) * 0.5;
  vec2 qd = abs(p - cm) - ch;
  float calm = 1.0 - smoothstep(0.0, FEATHER, length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0));
  if (uDark > 0.5) calm *= uMisc.y; // narrow screens: the copy fills the hero, so let the dark water show a bit more behind it
  float rs = 1.0 - CALM * calm;

  // long swell: slope (for shading) and curvature (for the caustics)
  vec2 slopeA = vec2(0.0);
  vec3 HA = vec3(0.0);
  for (int j = 0; j < NW; j++) {
    if (lite && j >= NWL) break;
    vec4 w = uW[j];
    float ph = dot(w.xy, p) + w.z;
    float sn = sin(ph), cs = cos(ph);
    slopeA -= w.w * sn * w.xy;
    HA -= (w.w * cs) * vec3(w.x * w.x, w.y * w.y, w.x * w.y);
  }

  // ripple packets: sin(k(d-R)) under a travelling gaussian envelope
  vec2 slopeR = vec2(0.0);
  vec3 HR = vec3(0.0);
  vec3 tintAcc = vec3(0.0);
  float tw = 0.0;
  for (int i = 0; i < N; i++) {
    vec4 r = uR[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age <= 0.0) continue;
    vec4 q = uQ[i];
    float sq = sqrt(q.x);
    vec2 dv = p - r.xy;
    float dl = length(dv);
    float front = SPEED * sq * age;
    float lam = LAM * sq;
    float w = lam * q.z * (1.3 + 0.45 * age);
    float x = dl - front;
    float qn = x / w;
    if (abs(qn) > 2.4) continue;
    float k = 6.2831853 / lam;
    float sn = sin(k * x), cs = cos(k * x);
    float a = r.w * rs * exp(-qn * qn - age / (DECAY * sq * q.w))
            * inversesqrt(1.0 + front / (60.0 * q.x)) * smoothstep(0.0, 0.1, age);
    float d = max(dl, 9.0);
    vec2 dir = dv / d;
    float q2w = 2.0 * qn / w;
    float hp = a * (-sn - q2w / k * cs);
    float hpp = a * (2.0 * q2w * sn + cs * (q2w * q2w / k - k - 2.0 / (w * w * k)));
    float hr = hp / d;
    HR += vec3(hpp * dir.x * dir.x + hr * dir.y * dir.y, hpp * dir.y * dir.y + hr * dir.x * dir.x, (hpp - hr) * dir.x * dir.y);
    slopeR += hp * dir;
    tintAcc += pal(q.y + 0.22 * dir.x - 0.16 * dir.y + dl * 0.0011) * a;
    tw += a;
  }
  vec3 tint = tintAcc / max(tw, 0.001);
  float crest = 1.0 - exp(-tw * 1.1); // soft-saturating ripple energy, 0..1

  // optical curvature -> caustic density (1/|det| of the ray map); channels use slightly different depths
  vec3 Ho = HR * DR + HA * DA;
  vec3 f = vec3(1.0 + CHROMA, 1.0, 1.0 - CHROMA);
  vec3 det = (1.0 + f * Ho.x) * (1.0 + f * Ho.y) - (f * Ho.z) * (f * Ho.z);
  vec3 ad = abs(det);
#ifdef HAS_DERIV
  float fw = fwidth(det.g);
#else
  float fw = 0.03;
#endif
  float e1 = fw * 0.85 + 0.004;
  vec3 core = e1 / (e1 + ad);
  core *= core;
  vec3 halo = 0.1 / (0.1 + ad);
  vec3 lines = core + halo * halo * 0.22;

  // glows: the fountain pool and the pointer
  vec2 sd = (p - uSrc.xy) / uSrc.z;
  float sg = exp(-dot(sd, sd) * 1.6);
  vec2 pd = (p - uPtr.xy) / 210.0;
  float pg = exp(-dot(pd, pd)) * uPtr.z;
  vec3 pcol = pal(uPtr.w + 0.05);

  // shading from the slopes
  vec2 slope = slopeR + slopeA * SHEEN;
  slope /= 1.0 + 0.55 * length(slope); // many overlapping ripples must not blow the shading out
  vec3 n = normalize(vec3(-slope * NGAIN, 1.0));
  vec3 L = normalize(vec3(-0.42, -0.5, 0.9));
  vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = dot(n, L) - L.z;
  float spec = pow(max(dot(n, Hh), 0.0), 26.0);
  float rim = clamp(length(slope) * NGAIN, 0.0, 1.0);

  // the floor, seen through the refracting surface
  vec2 pf = p + slope * REFR;
  vec2 u2 = pf / uRes;
  float v = smoothstep(0.0, 0.95, u2.y);
  float mott = noise2(pf * 0.006 + 4.0) * 0.65 + 0.17;
  if (!lite) mott += noise2(pf * 0.017 - t * 0.015) * 0.35 - 0.17;

  // the caustic network on the floor, bent by the slopes (refraction)
  float ed1 = cellEdge(pf / CELL, t * NETV * 0.16);
  float ed2 = 9.0;
  if (!lite) ed2 = cellEdge(pf / CELL2 + 17.3, t * NETV * 0.22 + 0.37);
#ifdef HAS_DERIV
  float nw1 = NETW * (1.0 + crest) + fwidth(ed1) * 0.9, nw2 = NETW * 1.2 * (1.0 + crest) + fwidth(ed2) * 0.9;
#else
  float nw1 = NETW * (1.0 + crest) + 0.02, nw2 = NETW * 1.2 * (1.0 + crest) + 0.02;
#endif
  float n1 = 1.0 - smoothstep(0.0, nw1, ed1);
  float n2 = 1.0 - smoothstep(0.0, nw2, ed2);
  float net = n1 * n1 + 0.55 * n2 * n2;

  vec3 col;
  if (uDark > 0.5) {
    vec3 base = mix(c1, c0, v) * 0.78;
    base = mix(base, c2 * 1.4, 0.2 * smoothstep(0.5, 1.0, u2.y) * u2.x);
    base *= 0.86 + 0.28 * mott;
    base *= 1.0 - 0.34 * calm;
    float lit = sg + 0.5 * pg;
    base += (acc * 0.26 + sky * 0.05) * lit * (0.55 + 0.8 * mott) * (1.0 - 0.45 * calm);
    base += pcol * 0.16 * pg * (1.0 - 0.5 * calm);
    // faint shafts of light from above
    float ray = 0.5 + 0.5 * sin(dot(pf, vec2(0.0063, 0.0114)) * 2.6 + sin(pf.y * 0.003 + t * 0.12) * 2.4 + t * 0.1);
    ray *= ray; ray *= ray;
    base += acc * 0.05 * ray * (1.0 - u2.y) * (1.0 - calm);
    float cg = (0.42 + 1.25 * sg + 0.7 * pg) * (1.0 - 0.7 * calm);
    vec3 cc = mix(acc, vec3(1.0), 0.28);
    cc = mix(cc, tint * 1.25 + 0.1, clamp(tw * 1.6, 0.0, 0.9));
    col = base;
    col += (lines * 0.45 + net * 0.5) * cc * cg * (0.55 + 0.9 * mott);
    col += tint * crest * (0.34 + 0.7 * rim) * (1.0 - 0.5 * calm);
    col += mix(vec3(1.0), tint + 0.25, 0.6) * spec * 0.6 * (1.0 - 0.75 * calm);
    col += sky * rim * rim * 0.18 * (1.0 - 0.6 * calm);
    col += diff * 0.3 * acc;
    vec3 ov = max(col - 0.78, 0.0);
    col = min(col, vec3(0.78)) + ov / (1.0 + 4.0 * ov); // soft shoulder keeps colour in the brightest crests
    float lmD = dot(col, vec3(0.299, 0.587, 0.114));
    col /= 1.0 + calm * 5.0 * max(lmD - 0.12, 0.0); // behind the copy the brightest crests are dimmed: text contrast first
    col *= 1.0 - 0.45 * smoothstep(0.45, 1.05, length((uv - vec2(0.5)) * vec2(1.0, 1.1)));
  } else {
    vec3 base = mix(c0, c1, smoothstep(0.1, 0.9, uv.x * 0.6 + (1.0 - uv.y) * 0.5));
    base = mix(base, acc, 0.24 + 0.2 * sg);
    base = mix(base, pcol, 0.16 * pg);
    base = mix(base, c2, 0.2 * smoothstep(0.55, 1.0, u2.y));
    base *= 0.9 + 0.12 * mott;
    base *= 1.0 - 0.1 * smoothstep(0.4, 1.0, length((uv - vec2(0.5)) * vec2(1.0, 1.1)));
    base = mix(base, vec3(1.0), 0.55 * calm);
    float shade = 1.0 + diff * 1.1 * (1.0 - 0.6 * calm);
    col = base * shade;
    float cg = (0.6 + 0.9 * sg + 0.4 * pg) * (1.0 - 0.65 * calm);
    vec3 ln = clamp((lines * 0.35 + net * 0.62) * cg * (0.7 + 0.6 * mott), 0.0, 1.0);
    col *= 1.0 - 0.07 * (1.0 - clamp(net * 1.6, 0.0, 1.0)) * (1.0 - calm);
    col = col + (1.0 - col) * ln;
    col = mix(col, tint * 0.7 + 0.3, clamp(crest * 0.32, 0.0, 0.5) * (1.0 - 0.5 * calm));
    col = mix(col, vec3(1.0), clamp(spec * 0.9, 0.0, 1.0) * (1.0 - 0.7 * calm));
    float lmL = dot(col, vec3(0.299, 0.587, 0.114));
    col += vec3(max(0.93 - lmL, 0.0)) * calm; // behind the copy the water never gets darker than a pale veil: text contrast first
  }

  // sparkles on the moving water: round glints jittered inside 10px cells, brighter on the slopes
  vec2 sp = p / 10.0, cid = floor(sp);
  if (hash(cid * 1.7 + 3.3) > 0.9) {
    vec2 hj = hash22(cid + 7.0);
    float tw2 = max(0.0, sin(t * (0.8 + hj.x * 2.4) + hj.y * 60.0));
    tw2 *= tw2; tw2 *= tw2; tw2 *= tw2 * tw2 * tw2; // ^12 by squaring
    float rr = smoothstep(0.32, 0.0, length(fract(sp) - 0.2 - 0.6 * hj));
    float spark = tw2 * rr * rr * min(0.3 + 2.0 * length(slope), 1.3) * (1.0 - 0.8 * calm);
    col += (uDark > 0.5 ? mix(vec3(1.0), acc, 0.3) * 0.9 : vec3(0.9)) * spark;
  }

  // melt into the page at the bottom edge, dither against banding
  col = mix(col, bgc, smoothstep(0.78, 1.0, uv.y) * 0.85);
  col += (hash(p * 1.37 + fract(t) * 91.7) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  const SOFT_GL = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
  const makeGL = (cv, allowSoft) => {
    const forced = OPT.gl === 'force';
    let gl = null;
    try {
      gl = cv.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
        powerPreference: 'default', failIfMajorPerformanceCaveat: !forced,
      });
    } catch (e) { gl = null; }
    if (!gl) return null;
    // A software rasteriser (SwiftShader, llvmpipe…) would burn the CPU on a shader like this one: such machines get the
    // light 2D version, except for the single frozen frame of reduced motion, or when forced (CI, screenshots).
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      softGL = !!dbg && SOFT_GL.test(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)));
    } catch (e) { softGL = false; }
    if (softGL && !allowSoft) {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return { fail: true, why: 'software', ctx: gl };
    }
    const u = {};
    let prog = null, tex = null, buf = null;
    const palData = new Uint8Array(32);
    const maxVec = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) | 0;
    const n = Math.min(CFG.ripples, Math.floor((maxVec - 30) / 2));
    if (n < 8) return { fail: true, why: 'uniforms', ctx: gl };
    const deriv = !!gl.getExtension('OES_standard_derivatives');
    const sh = (type, text) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); }
      return s;
    };
    const build = () => {
      const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fragSrc(n, deriv));
      prog = gl.createProgram();
      gl.attachShader(prog, v); gl.attachShader(prog, f);
      gl.bindAttribLocation(prog, 0, 'aP');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.deleteShader(v); gl.deleteShader(f);
      gl.useProgram(prog);
      ['uRes', 'uT', 'uDark', 'uR', 'uQ', 'uW', 'uK', 'uSrc', 'uPtr', 'uCopy', 'uMisc', 'uPal'].forEach(nm => { u[nm] = gl.getUniformLocation(prog, nm); });
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palData);
      gl.uniform1i(u.uPal, 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    };
    const theme = () => { // token colours -> uniforms + the 8-texel team palette
      for (let i = 0; i < 8; i++) for (let c = 0; c < 3; c++) palData[i * 4 + c] = Math.round(255 * TEAM[(i % 7) * 3 + c]);
      for (let i = 0; i < 8; i++) palData[i * 4 + 3] = 255;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 8, 1, gl.RGBA, gl.UNSIGNED_BYTE, palData);
      gl.uniform3fv(u.uK, K);
      gl.uniform1f(u.uDark, dark ? 1 : 0);
    };
    try { build(); } catch (e) { if (window.YANABEE_WATER_DEBUG) console.warn('water: shader', e.message); return { fail: true, why: 'shader', ctx: gl }; }
    return {
      kind: 'webgl', n, ctx: gl,
      theme,
      restore() { gl.getExtension('OES_standard_derivatives'); build(); theme(); this.resize(bw, bh); },
      resize(w, h) { gl.viewport(0, 0, w, h); },
      draw(t) {
        gl.uniform2f(u.uRes, W, H);
        gl.uniform1f(u.uT, t);
        gl.uniform4fv(u.uR, R); gl.uniform4fv(u.uQ, Q); gl.uniform4fv(u.uW, Wv);
        gl.uniform4f(u.uSrc, src.x, src.y, src.r, 0);
        gl.uniform4f(u.uPtr, ptr.x, ptr.y, ptr.k, ptr.hue);
        gl.uniform4fv(u.uCopy, copy);
        gl.uniform2f(u.uMisc, lite ? 1 : 0, clamp(0.55 + (W - 390) / 1000, 0.55, 1));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      probe(cols, rows, out) { // luma at a grid of points (read right after a draw, same task)
        const px = new Uint8Array(4);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          gl.readPixels(Math.floor((i + 0.5) / cols * bw), Math.floor((j + 0.5) / rows * bh), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          out.push(Math.round(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]));
        }
      },
    };
  };

  /* ---------------------------------------------------------------- 2D fallback: rings + glow */
  const make2D = cv => {
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    let gSrc = null, gPtr = null, gCalm = null;
    const gDrift = [null, null, null];
    const grad = (r, c0, c1) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; };
    const css = (i, a) => 'rgba(' + Math.round(K[i * 3] * 255) + ',' + Math.round(K[i * 3 + 1] * 255) + ',' + Math.round(K[i * 3 + 2] * 255) + ',' + a + ')';
    const driftR = () => Math.max(260, Math.min(W, H) * 0.6);
    const theme = () => { // gradients are built once per theme / size, then only moved
      gSrc = grad(src.r, css(3, dark ? 0.5 : 0.4), css(3, 0));
      gPtr = grad(190, css(3, dark ? 0.34 : 0.28), css(3, 0));
      gCalm = grad(1, 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0)');
      gCalm.addColorStop(0.5, 'rgba(0,0,0,0.65)');
      for (let i = 0; i < 3; i++) gDrift[i] = grad(driftR(), palCss(i * 0.31 + 0.08, dark ? 0.3 : 0.22), palCss(i * 0.31 + 0.08, 0));
    };
    return {
      kind: '2d', n: CFG.ripples, ctx, theme,
      restore() { theme(); },
      resize() { theme(); },
      draw(t) {
        ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
        const dr = driftR();
        for (let i = 0; i < 3; i++) { // slow drifting pools of team-coloured light
          ctx.save();
          ctx.translate(W * (0.2 + 0.3 * i + 0.1 * Math.sin(t * 0.12 + i * 2.1)), H * (0.3 + 0.18 * (i % 2) + 0.1 * Math.cos(t * 0.1 + i * 1.7)));
          ctx.fillStyle = gDrift[i]; ctx.fillRect(-dr, -dr, dr * 2, dr * 2); ctx.restore();
        }
        ctx.save(); ctx.translate(src.x, src.y); ctx.scale(1, 0.42);
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 1.3); ctx.fillStyle = gSrc;
        ctx.fillRect(-src.r, -src.r, src.r * 2, src.r * 2); ctx.restore();
        ctx.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const o = i * 4, s = R[o + 3], age = t - R[o + 2];
          if (s <= 0 || age <= 0) continue;
          const sq = Math.sqrt(Q[o]), front = CFG.speed * sq * age, lam = CFG.wavelength * sq * 1.7;
          const a = s * 2.5 * Math.exp(-age / life(i)) / Math.sqrt(1 + front / (60 * Q[o])) * clamp(age / 0.1, 0, 1);
          for (let r = 0; r < 4; r++) {
            const rr = front - r * lam * 0.85;
            if (rr <= 1) continue;
            ctx.strokeStyle = ring[i * 4 + r];
            ctx.beginPath(); ctx.arc(R[o], R[o + 1], rr, 0, 6.2832);
            const al = clamp(a * (1.2 - r * 0.28), 0, 0.9), w = (2.7 - r * 0.55) * Math.sqrt(Q[o]);
            ctx.globalAlpha = al * 0.3; ctx.lineWidth = w * 3.8; ctx.stroke(); // soft glow
            ctx.globalAlpha = al; ctx.lineWidth = w; ctx.stroke();               // crisp ring
          }
        }
        if (ptr.k > 0.01) {
          ctx.save(); ctx.translate(ptr.x, ptr.y); ctx.globalAlpha = ptr.k; ctx.fillStyle = gPtr;
          ctx.fillRect(-190, -190, 380, 380); ctx.restore();
        }
        if (copy[2] > copy[0]) { // keep the water calm behind the hero copy: erase most of the light there
          ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
          ctx.translate((copy[0] + copy[2]) / 2, (copy[1] + copy[3]) / 2);
          ctx.scale((copy[2] - copy[0]) / 2 + 90, (copy[3] - copy[1]) / 2 + 90);
          ctx.fillStyle = gCalm; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      },
      probe(cols, rows, out) {
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const d = ctx.getImageData(Math.floor((i + 0.5) / cols * bw), Math.floor((j + 0.5) / rows * bh), 1, 1).data;
          out.push(Math.round(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] + d[3] * 0.5));
        }
      },
    };
  };

  /* ---------------------------------------------------------------- canvas size / renderer lifecycle */
  const applySize = () => {
    const cap = coarse ? 1.25 : 1.5;
    let s = Math.min(window.devicePixelRatio || 1, cap) * CFG.levels[level];
    const px = W * H * s * s, budget = CFG.budgets[level] * (coarse ? 0.65 : 1);
    if (px > budget) s *= Math.sqrt(budget / px);
    if (renderer && renderer.kind === '2d') s = Math.min(window.devicePixelRatio || 1, 1.5);
    else if (softGL && OPT.gl !== 'force') s *= 0.6; // software rasteriser: only the frozen reduced-motion frame gets here, keep it cheap
    scale = Math.max(0.25, s);
    const w = Math.max(2, Math.round(W * scale)), h = Math.max(2, Math.round(H * scale));
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
    bw = w; bh = h;
    lite = level > 0 || OPT.lite === true;
    if (renderer) renderer.resize(bw, bh);
  };
  const freshCanvas = () => { // a canvas that already has a webgl context cannot become a 2D one
    const c = document.createElement('canvas');
    c.className = canvas.className; c.setAttribute('aria-hidden', 'true'); c.setAttribute('data-water', '');
    canvas.replaceWith(c);
    canvas = c;
    watchContext();
    return c;
  };
  const poseUniforms = t => { // swell phases for time t (no allocations)
    for (let j = 0; j < NW; j++) {
      const w = wave[j], o = j * 4;
      Wv[o] = w.kx; Wv[o + 1] = w.ky; Wv[o + 2] = w.ph - w.om * t;
      Wv[o + 3] = w.b * (0.78 + 0.22 * Math.sin(t * w.mf + j * 1.9));
    }
  };

  const drawAt = t => { if (renderer && !lost) { poseUniforms(t); renderer.draw(t); } };
  const drawNow = () => drawAt(reduced ? T_STATIC : tNow());

  const showFirstFrame = () => {
    if (shown) return;
    shown = true;
    root.classList.add('water-on');
    if (renderer.kind === '2d') root.classList.add('water-2d');
  };
  const giveUp = () => {
    off = true; stop();
    root.classList.remove('water-on', 'water-2d');
    canvas.hidden = true;
  };

  /* ---------------------------------------------------------------- frame loop + performance guard */
  const downgrade = () => {
    warm = CFG.warm; gN = 0; gSum = 0; crawl = 0;
    if (lastStep()) giveUp();
    else { level++; applySize(); }
  };
  const lastStep = () => renderer.kind === '2d' || level >= CFG.levels.length - 1;
  const guard = dt => {
    // not judged while the page is still loading or the opening scene is playing (other work competes for the frame)
    if (OPT.guard === false || document.readyState !== 'complete' || root.classList.contains('intro-on')) { gN = 0; gSum = 0; crawl = 0; return; }
    if (warm > 0) { warm--; return; }
    // crawling (a frame every 80ms+, several times in a row; pauses reset the clock, so long gaps are real): step down at once instead of waiting for the average
    crawl = dt > CFG.crawlMs ? crawl + 1 : 0;
    if (crawl >= CFG.crawlN) { downgrade(); return; }
    gSum += Math.min(dt, 400); gN++;
    if (gN < CFG.window) return;
    const avg = gSum / gN;
    gN = 0; gSum = 0;
    if (avg > (lastStep() ? CFG.giveUpMs : CFG.slowMs)) downgrade();
  };
  const step = (t, dt) => {
    if (t > nextDrop) { randomDrop(); nextDrop = t + rnd(CFG.dropEvery[0], CFG.dropEvery[1]); }
    if (t > nextSrc) {
      spawn(src.x, src.y, rnd(0.22, 0.36), rnd(0.8, 1.2), Math.random(), 1, t, 1);
      nextSrc = t + rnd(CFG.sourceEvery[0], CFG.sourceEvery[1]);
    }
    const e = 1 - Math.exp(-dt * 9);
    ptr.x += (ptr.tx - ptr.x) * e; ptr.y += (ptr.ty - ptr.y) * e;
    ptr.k += (ptr.tk - ptr.k) * (1 - Math.exp(-dt * 5));
    retire(t);
  };
  const frame = now => {
    raf = 0;
    if (!running) return;
    const t = (now - T0) / 1000;
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0.016;
    if (lastNow) guard(now - lastNow);
    lastNow = now;
    if (off) return;
    if (pendingBurst && (introForce || !root.classList.contains('intro-on'))) { pendingBurst = false; measure(); setTimeout(burst, 180); }
    step(t, dt);
    drawAt(t);
    frames++;
    showFirstFrame();
    if (running) raf = requestAnimationFrame(frame);
  };
  const shouldRun = () => !!renderer && !off && !lost && !reduced && visible && !document.hidden && !manualPause;
  const start = () => { if (!running && shouldRun()) { running = true; lastNow = 0; gN = 0; gSum = 0; warm = CFG.warm; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const sync = () => (shouldRun() ? start() : stop());

  /* ---------------------------------------------------------------- input */
  let px = 0, py = 0; // pointer position in hero px, set by local()
  const local = e => { const r = canvas.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; };
  const onMove = e => {
    if (reduced || !renderer || (e.pointerType === 'touch' && !e.isPrimary)) return;
    local(e);
    const x = px, y = py, now = performance.now();
    ptr.tx = x; ptr.ty = y; ptr.tk = 1;
    if (ptr.k < 0.05) { ptr.x = x; ptr.y = y; }
    if (!running) return;
    if (wakeX !== wakeX) { wakeX = x; wakeY = y; wakeT = now; return; }
    const dx = x - wakeX, dy = y - wakeY, dist = Math.hypot(dx, dy), dtm = now - wakeT;
    if (dist < CFG.wake.dist || dtm < CFG.wake.ms) return;
    const speed = dist / Math.max(dtm, 1); // px/ms
    hueAcc += dist / 1500;
    ptr.hue = hueAcc;
    spawn(x, y, clamp(0.2 + speed * 0.2, 0.2, 0.62), 0.55 + Math.min(speed, 2.2) * 0.2, hueAcc, 1, tNow(), 0.8);
    wakeX = x; wakeY = y; wakeT = now;
  };
  const onDown = e => {
    if (reduced || !renderer || !running) return;
    local(e);
    const x = px, y = py;
    ptr.tx = x; ptr.ty = y; ptr.tk = 1; ptr.x = x; ptr.y = y;
    bigDrop(x, y, 1.0);
    wakeX = x; wakeY = y; wakeT = performance.now();
  };
  const onLeave = () => { ptr.tk = 0; wakeX = NaN; };
  const onDropEvent = e => {
    const d = e && e.detail;
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') return;
    api.drop(d.x, d.y, d.strength);
  };

  /* ---------------------------------------------------------------- public API */
  const api = {
    drop(x, y, strength) { // client coordinates
      if (reduced || !renderer || off || lost) return false;
      const r = canvas.getBoundingClientRect();
      bigDrop(x - r.left, y - r.top, typeof strength === 'number' && isFinite(strength) ? strength : 0.6);
      return true;
    },
    burst() { if (reduced || !renderer || off || lost) return false; measure(); burst(); return true; }, // the fountain-pool burst, again
    clear() { clearRipples(); },
    pause() { manualPause = true; sync(); },
    resume() { manualPause = false; sync(); },
    get running() { return running; },
    get mode() { return off ? 'off' : reduced ? 'static' : renderer ? renderer.kind : 'none'; },
    get software() { return softGL; }, // a software WebGL rasteriser was detected (2D version used unless forced)
    get frames() { return frames; },
    get active() { let n = 0; for (let i = 0; i < N; i++) if (R[i * 4 + 3] > 0) n++; return n; },
    get level() { return level; },
    // test helper: luma samples on a cols x rows grid; draws a fresh frame first (optionally at time t)
    probe(cols, rows, t) {
      if (!renderer || lost) return null;
      drawAt(t === undefined ? (reduced ? T_STATIC : tNow()) : t);
      const out = [];
      renderer.probe(cols || 12, rows || 7, out);
      return out;
    },
    now: tNow,
  };
  window.YanabeeWater = api;

  /* ---------------------------------------------------------------- init */
  const watchContext = () => {
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); });
    canvas.addEventListener('webglcontextrestored', () => {
      if (!renderer || renderer.kind !== 'webgl') return;
      try { renderer.restore(); lost = false; applySize(); drawNow(); sync(); } catch (err) { lost = false; to2D(); drawNow(); sync(); }
    });
  };
  const to2D = () => {
    if (renderer && renderer.kind === 'webgl') freshCanvas();
    renderer = make2D(canvas);
    if (!renderer) { off = true; return; }
    renderer.theme();
    applySize();
  };
  const init = () => {
    readTokens();
    measure();
    let r = null;
    if (OPT.gl !== 'off') r = makeGL(canvas, OPT.gl === 'force' || reduced);
    if (r && r.fail) r = null;
    if (r) { renderer = r; N = r.n; if (R.length !== N * 4) { R = new Float32Array(N * 4); Q = new Float32Array(N * 4); ring = new Array(N * 4).fill('#fff'); } }
    else {
      // a canvas that was handed to webgl (even unsuccessfully) is not usable for 2D any more
      let c2 = null;
      try { c2 = canvas.getContext('2d'); } catch (e) { c2 = null; }
      if (!c2) freshCanvas();
      renderer = make2D(canvas);
    }
    if (!renderer) { off = true; return; }
    watchContext();
    renderer.theme();
    applySize();

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => { measure(); applySize(); drawNow(); });
      ro.observe(hero);
      const cp = hero.querySelector('.hero-copy'), vis = hero.querySelector('.hero-visual');
      if (cp) ro.observe(cp);
      if (vis) ro.observe(vis);
    } else addEventListener('resize', () => { measure(); applySize(); drawNow(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); drawNow(); });
    addEventListener('load', () => { measure(); drawNow(); });
    addEventListener('themechange', () => { readTokens(); repaintRings(); if (renderer) { renderer.theme(); } drawNow(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; sync(); }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', sync);

    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerdown', onDown, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
    hero.addEventListener('pointercancel', onLeave, { passive: true });
    hero.addEventListener('pointerup', e => { if (e.pointerType === 'touch') ptr.tk = 0; }, { passive: true });
    addEventListener('yanabee:drop', onDropEvent);
    const onMotion = () => {
      reduced = mqReduce.matches;
      if (reduced) { stop(); setupStatic(); drawNow(); showFirstFrame(); }
      else { clearRipples(); sync(); }
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMotion); else if (mqReduce.addListener) mqReduce.addListener(onMotion);

    if (reduced) { setupStatic(); drawNow(); showFirstFrame(); return; }

    drawNow(); // paint something right away so the first visible frame is never empty
    nextDrop = tNow() + 1.2; nextSrc = tNow() + 1.6;
    // the pool springs to life the first time the hero is really on screen (after the opening scene, if there is one)
    if (root.classList.contains('intro-on')) setTimeout(() => { introForce = true; }, 12000);
    sync();
  };

  try { init(); } catch (err) {
    if (window.YANABEE_WATER_DEBUG) console.warn('water: init', err);
    off = true; stop(); root.classList.remove('water-on', 'water-2d'); canvas.hidden = true;
  }
})();
