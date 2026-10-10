// Home — the mission, performed.
// A pinned, scroll-driven particle story. Scroll progress p (0..1) over the tall track drives one canvas
// of ~1800 particles through four acts, each synchronised with one fragment of the mission paragraph:
//   1 scattered loners (cold, dim, screen-lit)  →  2 seven team clusters (orbiting, labelled)
//   →  3 seven racing streams with light trails  →  4 one arch (the seven streams merge), a droplet in its
//   heart, and the word «ينابيع» drawn by particles sampled from the real heading font.
// Everything decorative is aria-hidden; the mission text itself stays in the DOM, once, in order.
// Without JS or with prefers-reduced-motion nothing here runs and the section is a normal block (story.css).
// Classic script, no dependencies, works from file://.
(() => {
  'use strict';
  const root = document.querySelector('[data-story]');
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqTall = matchMedia('(min-height: 500px)');   // a pinned stage needs room (landscape phones get the static block)
  const track = $('.story-track'), stage = $('.story-stage'), canvas = $('.story-canvas');
  if (!track || !stage || !canvas || !canvas.getContext) return;
  const html = document.documentElement;

  /* ============================== tuning knobs ============================== */
  const CFG = {
    count: [1800, 1300, 800],            // particles: desktop / tablet / phone
    dpr: [2, 2, 1.5],                    // canvas pixel-ratio cap per class
    // scroll progress windows in which the scene morphs: scatter→clusters, clusters→streams, streams→arch, arch→word
    win: [[0.20, 0.34], [0.45, 0.58], [0.69, 0.80], [0.82, 0.93]],
    stagger: 0.75,                       // how much particles lag each other inside a window (0 = all together)
    actAt: [0, 0.23, 0.47, 0.71],        // progress at which act 1..4 becomes "current"
    stops: [0.15, 0.41, 0.65, 0.985],    // where a rail tick scrolls to (scene fully formed, caption fully lit)
    // caption fragments: [fade-in from, fade-in to, fade-out from, fade-out to, words light from, words light to]
    cap: [[-1, 0, 0.185, 0.225, 0.015, 0.175], [0.235, 0.28, 0.425, 0.465, 0.26, 0.41],
          [0.475, 0.52, 0.665, 0.705, 0.50, 0.645], [0.715, 0.76, 2, 3, 0.74, 0.89]],
    keep: 0.26,                          // share of particles that stay in the arch when the others form the word
    smooth: 7,                           // scroll smoothing (1/s): higher = snappier
    pointerR: [150, 190, 120, 140],      // pointer influence radius per act (px, scaled)
    pointerG: 5200,                      // pointer force
  };
  const TEAMS = 7;
  const TAU = Math.PI * 2;

  /* ============================== helpers ============================== */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ez = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const frac = x => x - Math.floor(x);
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const parseCol = s => {
    s = (s || '').trim(); let m;
    if ((m = /^#([\da-f])([\da-f])([\da-f])$/i.exec(s))) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    if ((m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(s))) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    if ((m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(s))) return [+m[1], +m[2], +m[3]];
    return [18, 168, 164];
  };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  /* ============================== state ============================== */
  const NMAX = CFG.count[0];
  let N = NMAX, nAct = NMAX;            // allocated / currently drawn (quality governor lowers nAct)
  let W = 1, H = 1, dpr = 1, sc = 1, ctx = null;
  let dark = true, teamC = [], accentC, skyC, greyC, stops8 = [];
  let live = false, visible = false, running = false, raf = 0, lastT = 0, aliveT = 0, firstFrame = true;
  let p = 0, ps = 0, pPrev = 0, energy = 0;
  let act = -1, lastProg = -1;
  const ptr = { x: 0, y: 0, on: false };
  const ripples = [];
  let fontH = 'system-ui,sans-serif';
  let wordPts = null, wordAspect = 0.34, wordMeta = null, wordBmp = null, wordBmpOff = [0, 0];
  const stat = { frames: 0, work: 0, interval: 0, slow: 0 };

  // layout (css px, stage coordinates)
  const L = { zy0: 120, zy1: 600, cx: 0, cy: 0, ringRx: 1, ringRy: 1, cR: 40, ccx: [], ccy: [], gap: 60, laneTop: 0, laneBot: 0, laneX: [],
              A: 1, Hd: 1, baseY: 0, dropX: 0, dropY: 0, dropS: 80, wordW: 300, wordY: 0, finalY: 0 };

  /* ============================== particles ============================== */
  const F32 = () => new Float32Array(NMAX);
  const tm = new Uint8Array(NMAX), keeper = new Uint8Array(NMAX), kind = new Uint8Array(NMAX), vis0 = new Uint8Array(NMAX);
  const sg = F32(), ph = F32(), szb = F32(), brb = F32(), stf = F32(), curv = F32(), flk = F32();
  const s0x = F32(), s0y = F32(), sax = F32(), say = F32(), sfx = F32(), sfy = F32(), spx = F32(), spy = F32(), u1 = F32(), u2 = F32();
  const cr = F32(), ca = F32(), cw = F32();
  const lnOff = F32(), lnTail = F32(), lnWob = F32();
  const dmU = F32(), dmS = F32(), dmTh = F32(), dmSp = F32();
  const wx = F32(), wy = F32(), wph = F32(), wTw = F32();
  const X = F32(), Y = F32(), DX = F32(), DY = F32(), DVX = F32(), DVY = F32(), LU = F32(), LS = F32();
  const FX = F32(), FY = F32(), FA = F32(), FR = F32(), FVX = F32(), FVY = F32(), FJ = F32(), FS = F32(), FF = F32(), FK = new Int16Array(NMAX);
  const laneV = [0.27, 0.43, 0.34, 0.5, 0.38, 0.3, 0.46], laneA = [0.16, 0.11, 0.2, 0.09, 0.15, 0.22, 0.12], laneW = [0.31, 0.43, 0.27, 0.37, 0.33, 0.29, 0.41], laneP = [0, 1.9, 3.1, 4.4, 0.8, 5.2, 2.5];
  const lp = new Float32Array(TEAMS);

  (function seed() {
    const r = rng(0x59414e42);
    for (let i = 0; i < NMAX; i++) {
      tm[i] = i % TEAMS;
      keeper[i] = r() < CFG.keep ? 1 : 0;
      kind[i] = r() < 0.2 ? 1 : 0;      // 1 = a lit phone screen while alone
      vis0[i] = r() < 0.6 ? 1 : 0;       // only some are on stage while everyone is alone; the rest arrive with the crowd
      sg[i] = r(); ph[i] = r() * TAU; szb[i] = 0.85 + r() * 1.25; brb[i] = 0.55 + r() * 0.45;
      stf[i] = 9 + r() * 7; curv[i] = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.65); flk[i] = 0.35 + r() * 0.65;
      u1[i] = r(); u2[i] = r();
      sax[i] = 10 + r() * 34; say[i] = 10 + r() * 30; sfx[i] = 0.12 + r() * 0.3; sfy[i] = 0.1 + r() * 0.3; spx[i] = r() * TAU; spy[i] = r() * TAU;
      const rr = Math.pow(r(), 0.62);
      cr[i] = rr; ca[i] = (r() < 0.5 ? 0 : Math.PI) + rr * 3.4 + (r() - 0.5) * 0.9;
      cw[i] = (0.45 + 0.85 / (0.3 + rr)) * 0.5;
      lnOff[i] = (r() + r() + r() - 1.5) / 1.5; lnWob[i] = r() * TAU;
      lnTail[i] = r() < 0.3 ? r() : Math.pow(r(), 1.15) * 0.85;
      dmU[i] = r(); dmS[i] = r(); dmTh[i] = (r() < 0.12 ? (r() - 0.5) * 7 : (r() + r() + r() - 1.5)); dmSp[i] = 0.035 + r() * 0.03;
      wph[i] = r() * TAU; wTw[i] = r();
      LU[i] = 1; LS[i] = 1;
    }
  })();

  /* ============================== colours & sprites ============================== */
  const spr = new Array(TEAMS * 4 * 4 * 8);
  const scr = [null, null];
  const readColors = () => {
    const cs = getComputedStyle(html);
    dark = html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    teamC = Array.from({ length: TEAMS }, (_, i) => parseCol(cs.getPropertyValue('--t' + (i + 1))));
    accentC = parseCol(cs.getPropertyValue('--accent'));
    skyC = parseCol(cs.getPropertyValue('--sky'));
    greyC = dark ? [139, 156, 184] : [92, 108, 134];
    const g0 = dark ? accentC : parseCol(cs.getPropertyValue('--brand'));   // light theme: start from the deeper teal for contrast
    stops8 = Array.from({ length: 8 }, (_, s) => mix3(g0, skyC, s / 7));
    fontH = cs.getPropertyValue('--font-h').trim() || 'system-ui,sans-serif';
    spr.fill(undefined); scr[0] = scr[1] = null;
    if (wordMeta) buildWordBmp();
  };
  const makeSprite = c => {
    const S = 48, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), h = S / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    if (dark) {
      const core = mix3(c, [255, 255, 255], 0.38);
      gr.addColorStop(0, rgba(core, 1)); gr.addColorStop(0.13, rgba(core, 0.95)); gr.addColorStop(0.22, rgba(c, 0.72));
      gr.addColorStop(0.4, rgba(c, 0.22)); gr.addColorStop(0.72, rgba(c, 0.06)); gr.addColorStop(1, rgba(c, 0));
    } else {
      const core = mix3(c, [0, 0, 0], 0.18);
      gr.addColorStop(0, rgba(core, 1)); gr.addColorStop(0.2, rgba(c, 0.94)); gr.addColorStop(0.3, rgba(c, 0.34));
      gr.addColorStop(0.6, rgba(c, 0.09)); gr.addColorStop(1, rgba(c, 0));
    }
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return cv;
  };
  const getSprite = (team, jq, fq, stop) => {
    const key = ((team * 4 + jq) * 4 + fq) * 8 + stop;
    let s = spr[key];
    if (!s) {
      let c = mix3(greyC, teamC[team], jq / 3);
      if (fq) c = mix3(c, stops8[stop], fq / 3);
      s = spr[key] = makeSprite(c);
    }
    return s;
  };
  const getScreen = v => {
    let s = scr[v];
    if (!s) {
      const S = 48, cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d'), h = S / 2;
      const tint = v ? [190, 215, 255] : (dark ? [150, 190, 255] : [70, 100, 175]);
      const gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, rgba(tint, dark ? 0.5 : 0.28)); gr.addColorStop(0.5, rgba(tint, dark ? 0.14 : 0.08)); gr.addColorStop(1, rgba(tint, 0));
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.fillStyle = rgba(dark ? [215, 232, 255] : [60, 88, 160], dark ? 0.95 : 0.9);
      const w = 13, hh = 21, x = h - w / 2, y = h - hh / 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, hh, 3.2); else g.rect(x, y, w, hh);
      g.fill();
      s = scr[v] = cv;
    }
    return s;
  };

  /* ============================== the word ============================== */
  // The whole word is drawn with fillText on an offscreen canvas (so Arabic is shaped and joined by the browser),
  // then sampled on a grid: edge points first-class (crisp outline), interior points for body.
  const sampleWord = () => {
    const word = root.dataset.word || '';
    if (!word) return;
    try {
      const FS = 220, g0 = document.createElement('canvas').getContext('2d');
      const font = `700 ${FS}px ${fontH}`;
      g0.font = font; g0.direction = 'rtl'; g0.textAlign = 'center'; g0.textBaseline = 'alphabetic';
      const m = g0.measureText(word);
      const left = m.actualBoundingBoxLeft || m.width / 2, right = m.actualBoundingBoxRight || m.width / 2;
      const asc = m.actualBoundingBoxAscent || FS * 0.8, desc = m.actualBoundingBoxDescent || FS * 0.25;
      const iw = left + right, ih = asc + desc;
      const w = Math.ceil(iw) + 10, h = Math.ceil(ih) + 10;
      const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
      const g = oc.getContext('2d', { willReadFrequently: true });
      g.font = font; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
      g.fillText(word, 5 + left, 5 + asc);
      const data = g.getImageData(0, 0, w, h).data, GS = 2;
      const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 128;
      const edge = [], body = [];
      for (let y = 0; y < h; y += GS) {
        for (let x = 0; x < w; x += GS) {
          if (!on(x, y)) continue;
          const pt = [(x - 5 - iw / 2) / iw, (y - 5 - ih / 2) / iw];
          (!on(x - GS, y) || !on(x + GS, y) || !on(x, y - GS) || !on(x, y + GS) ? edge : body).push(pt);
        }
      }
      if (edge.length + body.length < 200) return;
      const r = rng(0x1badf00d), shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
      shuf(edge); shuf(body);
      const out = []; let ei = 0, bi = 0;
      while (out.length < NMAX && (ei < edge.length || bi < body.length)) { // ~55% outline, 45% body, interleaved
        if ((r() < 0.55 && ei < edge.length) || bi >= body.length) out.push(edge[ei++]); else out.push(body[bi++]);
      }
      for (let k = 0; out.length < NMAX; k++) { const q = out[k % Math.max(1, out.length)]; out.push([q[0] + (r() - 0.5) * 0.01, q[1] + (r() - 0.5) * 0.01]); }
      wordPts = out; wordAspect = ih / iw; wordMeta = { FS, iw, ih, asc, left, font };
    } catch (e) { /* no word: goers simply stay in the arch */ }
  };

  // A faint, crisp copy of the word (brand gradient + glow) that the particles settle into: it keeps the word legible
  // and correctly shaped at any particle count. Pre-rendered once per layout / theme.
  const buildWordBmp = () => {
    wordBmp = null;
    const m = wordMeta, word = root.dataset.word || '';
    if (!m || !word || !stops8.length) return;
    try {
      const k = L.wordW / m.iw, pad = 28, bw = Math.ceil(m.iw * k + pad * 2), bh = Math.ceil(m.ih * k + pad * 2);
      const cv = document.createElement('canvas'); cv.width = Math.ceil(bw * dpr); cv.height = Math.ceil(bh * dpr);
      const g = cv.getContext('2d'); g.scale(dpr, dpr);
      g.font = `700 ${m.FS * k}px ${fontH}`; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const gr = g.createLinearGradient(pad, 0, pad + m.iw * k, 0);
      gr.addColorStop(0, rgba(stops8[0], 1)); gr.addColorStop(1, rgba(stops8[7], 1));
      g.fillStyle = gr; g.shadowColor = rgba(accentC, dark ? 0.9 : 0.5); g.shadowBlur = 16;
      g.fillText(word, pad + m.left * k, pad + m.asc * k);
      g.shadowBlur = 0; g.fillText(word, pad + m.left * k, pad + m.asc * k);
      wordBmp = cv; wordBmpOff = [pad + m.iw * k / 2, pad + m.ih * k / 2, bw, bh];
    } catch (e) { wordBmp = null; }
  };

  /* ============================== layout ============================== */
  const layout = () => {
    const sr = stage.getBoundingClientRect();
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    const phone = W < 700, tablet = W < 1100;
    const cls = phone ? 2 : tablet ? 1 : 0;
    dpr = Math.min(window.devicePixelRatio || 1, CFG.dpr[cls]);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc = clamp(Math.min(W / 1300, H / 820), phone ? 0.72 : 0.7, 1.15);
    N = Math.min(NMAX, Math.round(CFG.count[cls] * ((navigator.hardwareConcurrency || 8) <= 4 ? 0.8 : 1)));
    nAct = Math.min(nAct, N);
    if (stat.frames < 5 || nAct > N) nAct = N;

    const head = $('.story-head'), mis = $('.story-mission');
    const hr = head.getBoundingClientRect(), mr = mis.getBoundingClientRect();
    L.zy0 = hr.bottom - sr.top + 22;
    L.zy1 = Math.max(L.zy0 + 220, mr.top - sr.top - 20);
    stage.style.setProperty('--zb', (mr.top - sr.top) + 'px');
    const Zh = L.zy1 - L.zy0;
    L.cx = W / 2; L.cy = (L.zy0 + L.zy1) / 2;

    // scatter
    for (let i = 0; i < NMAX; i++) {
      s0x[i] = lerp(W * 0.02, W * 0.98, u1[i]);
      s0y[i] = u2[i] < 0.88 ? lerp(L.zy0 - 26, L.zy1 + 30, (u2[i] / 0.88)) : lerp(0, H, (u2[i] - 0.88) / 0.12);
    }
    // clusters on a ring
    const tagH = ($('.story-tag') || { offsetHeight: 28 }).offsetHeight || 28;
    L.cR = clamp(Math.min(Zh * 0.145, W * (phone ? 0.11 : 0.07)), 30, 92);
    L.ringRx = Math.min(W * (phone ? 0.34 : 0.33), 500);
    L.ringRy = Math.max(Zh * 0.2, Zh / 2 - L.cR - tagH - 10);
    for (let k = 0; k < TEAMS; k++) {
      const a = -Math.PI / 2 + TAU * (k + 0.35) / TEAMS;
      L.ccx[k] = L.cx + Math.cos(a) * L.ringRx; L.ccy[k] = L.cy + Math.sin(a) * L.ringRy;
    }
    // lanes
    L.gap = clamp(W * 0.092, 44, 132);
    for (let k = 0; k < TEAMS; k++) L.laneX[k] = L.cx + (3 - k) * L.gap; // team 1 on the right (RTL reading order)
    L.laneTop = L.zy0 - 12; L.laneBot = L.zy1 + 34;
    // arch + droplet + word
    L.A = clamp(Math.min(W * (phone ? 0.46 : 0.42), Zh * 1.08), 130, 620);
    L.Hd = Math.min(Zh * 0.9, L.A * (phone ? 2.05 : 1.0));
    L.baseY = L.zy1 - 6;
    // everything under the arch is placed from the arch's own height, so a short viewport shrinks droplet and word with it
    const apexY = L.baseY - L.Hd;
    L.dropX = L.cx; L.dropY = apexY + L.Hd * 0.27; L.dropS = clamp(Math.min(L.Hd * 0.16, W * 0.062), 38, 92);
    L.wordW = Math.min(phone ? W * 0.68 : Math.min(W * 0.36, 540), (L.Hd * 0.46) / wordAspect, L.A * 1.45);
    const wordH = L.wordW * wordAspect;
    L.wordY = apexY + L.Hd * 0.64;
    L.finalY = L.wordY + wordH / 2 + (phone ? 12 : 14);
    let gi = 0;
    for (let i = 0; i < NMAX; i++) {
      if (keeper[i] || !wordPts) { wx[i] = L.cx; wy[i] = L.wordY; continue; }
      const q = wordPts[gi++ % wordPts.length];
      wx[i] = L.cx + q[0] * L.wordW; wy[i] = L.wordY + q[1] * L.wordW;
    }

    // DOM overlays in canvas pixels
    const tags = $$('.story-tag');
    const ringCx = L.cx, ringCy = L.cy;
    tags.forEach((el, k) => {
      const w = el.offsetWidth, h = el.offsetHeight, dx = L.ccx[k] - ringCx, dy = L.ccy[k] - ringCy, d = Math.hypot(dx, dy) || 1;
      let x, y;
      if (phone) { // above / below the cluster so labels stay inside a narrow stage
        x = L.ccx[k]; y = L.ccy[k] + (dy < 0 ? -1 : 1) * (L.cR + h * 0.7 + 4);
      } else { // outward from the ring, leaning to the side on the flanks
        x = L.ccx[k] + (dx / d) * (L.cR + 12) + Math.sign(dx) * Math.max(0, Math.abs(dx / d) - 0.35) * w * 0.55;
        y = L.ccy[k] + (dy / d) * (L.cR + 8) + (dy / d) * h * 0.5;
      }
      const padL = phone ? 36 : 116;                       // keep clear of the progress rail on the inline-end (left) edge
      x = clamp(x, w / 2 + padL, W - w / 2 - 12); y = clamp(y, L.zy0 + h / 2, L.zy1 - h / 2 - 2);
      el.style.setProperty('--x', x.toFixed(1) + 'px'); el.style.setProperty('--y', y.toFixed(1) + 'px');
    });
    const core = $('.story-core');
    core.style.setProperty('--cs', L.dropS + 'px'); core.style.setProperty('--x', L.dropX.toFixed(1) + 'px'); core.style.setProperty('--y', L.dropY.toFixed(1) + 'px');
    const fin = $('.story-final');
    fin.style.setProperty('--x', L.cx.toFixed(1) + 'px'); fin.style.setProperty('--y', L.finalY.toFixed(1) + 'px');
    LU.fill(1); LS.fill(1);
    buildWordBmp();
  };

  /* ============================== per-frame scene ============================== */
  const Wn = CFG.win;
  let ox = 0, oy = 0, wrapped = false;
  const k0 = (i, t) => { ox = s0x[i] + sax[i] * sc * Math.sin(t * sfx[i] + spx[i]); oy = s0y[i] + say[i] * sc * Math.cos(t * sfy[i] + spy[i]); };
  const k1 = (i, t) => {
    const k = tm[i], R = L.cR * (1 + 0.05 * Math.sin(t * 0.8 + ph[i])), a = ca[i] + cw[i] * (k % 2 ? 1 : -1) * t;
    ox = L.ccx[k] + Math.cos(a) * R * cr[i]; oy = L.ccy[k] + Math.sin(a) * R * cr[i] * 0.82;
  };
  const k2 = (i, t) => { // racing comets: all particles of a lane share a head that runs up; tails follow
    const k = tm[i], u = frac(lp[k] - lnTail[i]);
    if (u < LU[i] - 0.5) wrapped = true;
    LU[i] = u; FJ[i] = u; FF[i] = 1 - lnTail[i];
    const fan = (L.laneX[k] - L.cx) * 0.16 * u * u;
    const wob = Math.sin(u * 7 + laneP[k] + t * 0.9 + lnWob[i]) * L.gap * 0.09 * (0.4 + u);
    ox = L.laneX[k] + fan + wob + lnOff[i] * L.gap * laneW[k] * 0.62;
    oy = L.laneBot + (L.laneTop - L.laneBot) * u;
  };
  const domePos = (i, t) => { // seven streams curve over and flow toward the apex: one arch
    const k = tm[i], phi0 = Math.PI * (k + dmU[i]) / TEAMS;
    const s = frac(dmS[i] + t * dmSp[i]);
    if (s < LS[i] - 0.5) wrapped = true;
    LS[i] = s; FS[i] = s;
    const phi = phi0 + (Math.PI / 2 - phi0) * s * 0.3;
    const th = dmTh[i] * 9 * sc;
    ox = L.cx + (L.A + th) * Math.cos(phi); oy = L.baseY - (L.Hd + th) * Math.sin(phi);
  };

  let mode = 0, rp = 0; // pointer mode (+0.55 attract / -1 repel), pointer radius
  const lastX = F32(), lastY = F32();
  const G = { g0: 0, g1: 0, g2: 0, g3: 0 };
  let ig = 1;
  const step = (dt, t) => {
    const w0 = Wn[0], w1 = Wn[1], w2 = Wn[2], w3 = Wn[3];
    // region of the story: 0 hold0, 1 T01, 2 hold1, 3 T12, 4 hold2, 5 T23, 6 hold3, 7 T34, 8 hold4
    let region;
    if (ps < w0[0]) region = 0; else if (ps <= w0[1]) region = 1; else if (ps < w1[0]) region = 2; else if (ps <= w1[1]) region = 3;
    else if (ps < w2[0]) region = 4; else if (ps <= w2[1]) region = 5; else if (ps < w3[0]) region = 6; else if (ps <= w3[1]) region = 7; else region = 8;
    for (let k = 0; k < TEAMS; k++) lp[k] = laneV[k] * t + laneA[k] * Math.sin(0.35 * t + laneP[k]);
    // unstaggered progress of each window, for atmosphere / labels / glows
    const gw = j => ez(clamp((ps - Wn[j][0]) / (Wn[j][1] - Wn[j][0]), 0, 1));
    G.g0 = gw(0); G.g1 = gw(1); G.g2 = gw(2); G.g3 = gw(3);
    const pa = ps < 0.27 ? 0 : ps < 0.47 ? 1 : ps < 0.71 ? 2 : 3;
    mode = pa === 1 ? 0.55 : -1; rp = CFG.pointerR[pa] * sc;
    const pOn = ptr.on && !mqReduce.matches, R2 = rp * rp;
    const sp0 = w0[1] - w0[0], sp1 = w1[1] - w1[0], sp2 = w2[1] - w2[0], sp3 = w3[1] - w3[0];
    const stg = CFG.stagger, kd = 38, cd = 7;
    const swirlAmp = 42 * sc * (1 + energy * 1.4);
    const jit = 0.7 * sc, noWord = wordPts ? 0 : 1;   // without word points everybody stays in the arch

    for (let i = 0; i < nAct; i++) {
      const keep = keeper[i] || noWord, k = tm[i], sA = sg[i];
      let e0 = 1, e1 = 0, e2 = 0, e3 = 0, e = 0, tx = 0, ty = 0, fx0 = 0, fy0 = 0, fx1 = 0, fy1 = 0;
      wrapped = false;
      if (region <= 1) {
        e0 = region === 0 ? 0 : ez(clamp((ps - w0[0]) / sp0 * (1 + stg) - sA * stg, 0, 1));
        k0(i, t); fx0 = ox; fy0 = oy;
        if (e0 > 0) { k1(i, t); fx1 = ox; fy1 = oy; e = e0; }
      } else if (region === 2) { k1(i, t); fx0 = ox; fy0 = oy; }
      else if (region === 3) {
        e1 = ez(clamp((ps - w1[0]) / sp1 * (1 + stg) - ((sA + 0.31) % 1) * stg, 0, 1));
        k1(i, t); fx0 = ox; fy0 = oy; k2(i, t); fx1 = ox; fy1 = oy; e = e1;
      } else if (region === 4) { e1 = 1; k2(i, t); fx0 = ox; fy0 = oy; }
      else if (region === 5) {
        e1 = 1; e2 = ez(clamp((ps - w2[0]) / sp2 * (1 + stg) - ((sA + 0.62) % 1) * stg, 0, 1));
        k2(i, t); fx0 = ox; fy0 = oy; domePos(i, t); fx1 = ox; fy1 = oy; e = e2;
      } else {
        e1 = 1; e2 = 1;
        if (keep) { domePos(i, t); fx0 = ox; fy0 = oy; }
        else {
          e3 = region === 8 ? 1 : ez(clamp((ps - w3[0]) / sp3 * (1 + stg) - ((sA + 0.17) % 1) * stg, 0, 1));
          const wX = wx[i] + Math.sin(t * 1.3 + wph[i]) * jit, wY = wy[i] + Math.cos(t * 1.1 + wph[i]) * jit;
          if (e3 >= 1) { fx0 = wX; fy0 = wY; }
          else if (e3 <= 0) { domePos(i, t); fx0 = ox; fy0 = oy; }
          else { domePos(i, t); fx0 = ox; fy0 = oy; fx1 = wX; fy1 = wY; e = e3; }
        }
      }
      if (e > 0 && e < 1) { // fluid morph: eased blend + a sweeping arc + curl-ish swirl while in flight
        const h = Math.sin(Math.PI * e), dx = fx1 - fx0, dy = fy1 - fy0, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const na = Math.sin(fy0 * 0.011 + t * 1.3 + ph[i]) * 2.4 + Math.cos(fx0 * 0.009 - t * 1.1 + ph[i] * 1.7) * 2.4;
        const arc = curv[i] * 0.34 * dist * h;
        tx = fx0 + dx * e + (-dy / dist) * arc + Math.cos(na) * swirlAmp * h;
        ty = fy0 + dy * e + (dx / dist) * arc + Math.sin(na) * swirlAmp * h;
      } else if (e >= 1) { tx = fx1; ty = fy1; } else { tx = fx0; ty = fy0; }

      // smoothing (organic lag); snap when a target wrapped around (stream / arch flow) so nothing streaks across the stage
      const snap = firstFrame || wrapped;
      let nx, ny;
      if (snap) { nx = tx; ny = ty; }
      else { const ks = 1 - Math.exp(-dt * stf[i]); nx = X[i] + (tx - X[i]) * ks; ny = Y[i] + (ty - Y[i]) * ks; }
      X[i] = nx; Y[i] = ny;

      // pointer: repel / attract, then spring back
      let dx = DX[i], dy = DY[i], dvx = DVX[i], dvy = DVY[i];
      if (pOn) {
        const ddx = nx + dx - ptr.x, ddy = ny + dy - ptr.y, d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2), f = 1 - d / rp, F = f * f * CFG.pointerG * -mode * sc;
          dvx += (ddx / d) * F * dt; dvy += (ddy / d) * F * dt;
        }
      }
      dvx += (-kd * dx - cd * dvx) * dt; dvy += (-kd * dy - cd * dvy) * dt;
      dx += dvx * dt; dy += dvy * dt;
      DX[i] = dx; DY[i] = dy; DVX[i] = dvx; DVY[i] = dvy;
      const fx = nx + dx, fy = ny + dy;

      /* ---- look ---- */
      const join = e0;                                     // grey -> team colour
      const fin = keep ? 0 : e3;                           // team colour -> brand gradient (the word)
      const lf = e1 * (1 - e2);                            // "in a racing lane"
      const tb = lf > 0 ? Math.pow(Math.max(0, FF[i]), 1.5) : 0;
      let a = brb[i] * lerp(0.36, 0.92, join);
      // loners: a faint screen-glow flicker
      a *= 1 - (1 - join) * flk[i] * (0.5 + 0.5 * Math.sin(t * (1.6 + wTw[i] * 3.4) + ph[i] * 37) * Math.sin(t * 0.63 + ph[i] * 11)) * (kind[i] ? 0.62 : 0.34);
      if (!vis0[i]) a *= sstep(0.04, 0.62, join);          // not everyone is on stage at first
      let key;
      const jq = Math.min(3, (join * 3.999) | 0), fq = Math.min(3, (fin * 3.999) | 0);
      if (kind[i] && join < 0.45) { a *= 1 - sstep(0.2, 0.45, join); key = -1 - jq; }
      else {
        if (kind[i]) a *= sstep(0.45, 0.7, join);
        key = ((k * 4 + jq) * 4 + fq) * 8 + (fq ? Math.min(7, Math.max(0, (((wx[i] - L.cx) / L.wordW + 0.5) * 7.99) | 0)) : 0);
      }
      if (lf > 0) {
        a *= lerp(1, 0.17 + 0.55 * tb, lf);
        const u = FJ[i]; a *= lerp(1, sstep(0, 0.07, u) * sstep(1, 0.9, u), sstep(0.02, 0.5, e1) * (1 - sstep(0.5, 0.98, e2)));
      }
      const domeW = e2 * (1 - fin);
      if (domeW > 0) {
        const s = FS[i];
        a *= lerp(1, sstep(0, 0.11, s) * sstep(1, 0.8, s), domeW * (1 - lf));
        // light pulses run along the arch toward its heart (the seven streams merging)
        const q = Math.abs(Math.PI * (k + dmU[i]) / TEAMS - Math.PI / 2) / (Math.PI / 2), d = q - (1 - frac(t * 0.16 + 0.07 * k));
        a *= 1 + domeW * 0.9 * Math.exp(-d * d * 60);
      }
      a *= 1 + 0.35 * energy;
      if (fin > 0) a *= lerp(1, 0.78 + 0.22 * wTw[i], fin);
      const r = szb[i] * sc * (0.82 + 0.3 * join) * (1 + lf * (tb * 0.9 - 0.1)) * lerp(1, 0.66, fin);

      FX[i] = fx; FY[i] = fy; FA[i] = a * ig; FR[i] = r; FK[i] = key;
      if (snap) { FVX[i] = 0; FVY[i] = 0; } else { FVX[i] = (fx - lastX[i]) / dt; FVY[i] = (fy - lastY[i]) / dt; }
      lastX[i] = fx; lastY[i] = fy;
    }
    firstFrame = false;
  };

  /* ============================== drawing ============================== */
  const draw = (t, now) => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const aura = dark ? 1 : 0.62;
    // cluster auras (act 2)
    const cA = G.g0 * (1 - G.g1);
    if (cA > 0.01) {
      for (let k = 0; k < TEAMS; k++) {
        const R = L.cR * 1.9, gr = ctx.createRadialGradient(L.ccx[k], L.ccy[k], 0, L.ccx[k], L.ccy[k], R);
        gr.addColorStop(0, rgba(teamC[k], 0.3 * cA * aura)); gr.addColorStop(1, rgba(teamC[k], 0));
        ctx.fillStyle = gr; ctx.fillRect(L.ccx[k] - R, L.ccy[k] - R, R * 2, R * 2);
      }
    }
    // lane guides (act 3)
    const lA = G.g1 * (1 - G.g2);
    if (lA > 0.01) {
      ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (let k = 0; k < TEAMS; k++) {
        const x0 = L.laneX[k], x1 = L.laneX[k] + (L.laneX[k] - L.cx) * 0.16;
        const gr = ctx.createLinearGradient(0, L.laneBot, 0, L.laneTop);
        gr.addColorStop(0, rgba(teamC[k], 0)); gr.addColorStop(0.3, rgba(teamC[k], 0.2 * lA * aura)); gr.addColorStop(1, rgba(teamC[k], 0.02));
        ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(x0, L.laneBot); ctx.quadraticCurveTo(x0, (L.laneBot + L.laneTop) / 2, x1, L.laneTop); ctx.stroke();
      }
    }
    // arch glow + droplet bloom (act 4)
    const dA = G.g2;
    if (dA > 0.01) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.6), R = clamp(L.A * 0.62, 170, 340);
      const gr = ctx.createRadialGradient(L.dropX, L.dropY, 0, L.dropX, L.dropY, R * (0.55 + 0.45 * G.g3));
      gr.addColorStop(0, rgba(accentC, (dark ? 0.3 : 0.2) * dA * pulse)); gr.addColorStop(0.5, rgba(skyC, (dark ? 0.1 : 0.07) * dA)); gr.addColorStop(1, rgba(accentC, 0));
      ctx.fillStyle = gr; ctx.fillRect(L.dropX - R, L.dropY - R, R * 2, R * 2);
    }
    // the arch: a luminous line in the seven team colours (reads as an umbrella even where particles are sparse)
    if (dA > 0.01) {
      const gr = ctx.createLinearGradient(L.cx + L.A, 0, L.cx - L.A, 0);
      for (let k = 0; k < TEAMS; k++) gr.addColorStop((k + 0.5) / TEAMS, rgba(teamC[k], 1));
      ctx.strokeStyle = gr; ctx.lineCap = 'round';
      ctx.globalAlpha = (dark ? 0.2 : 0.16) * dA; ctx.lineWidth = 12 * sc;
      ctx.beginPath(); ctx.ellipse(L.cx, L.baseY, L.A, L.Hd, 0, Math.PI, TAU); ctx.stroke();
      ctx.globalAlpha = (dark ? 0.55 : 0.4) * dA; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(L.cx, L.baseY, L.A, L.Hd, 0, Math.PI, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // the word, faintly, underneath the particles that spell it
    if (wordBmp && G.g3 > 0.5) {
      ctx.globalAlpha = sstep(0.5, 1, G.g3) * (dark ? 0.34 : 0.3);
      ctx.drawImage(wordBmp, L.cx - wordBmpOff[0], L.wordY - wordBmpOff[1], wordBmpOff[2], wordBmpOff[3]);
      ctx.globalAlpha = 1;
    }
    // water rings (arch complete, word complete, pointer presses)
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp2 = ripples[i], q = (now - rp2.t) / rp2.d;
      if (q >= 1) { ripples.splice(i, 1); continue; }
      if (q < 0) continue;
      const rr = 8 + ez(q) * rp2.R;
      ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(rp2.c || accentC, (1 - q) * (dark ? 0.4 : 0.34));
      ctx.beginPath(); ctx.ellipse(rp2.x, rp2.y, rr, rr * rp2.sq, 0, 0, TAU); ctx.stroke();
    }

    // light trails: one stroked path per team, built from the particles' velocity (racing streams + scroll energy)
    const lanePart = G.g1 * (1 - G.g2);
    let swirlPart = 0;
    for (let j = 0; j < 4; j++) { const q = (ps - Wn[j][0]) / (Wn[j][1] - Wn[j][0]); if (q > 0 && q < 1) swirlPart = Math.max(swirlPart, Math.sin(Math.PI * q)); }
    const tAmt = clamp(lanePart * 0.75 + swirlPart * 0.3 + energy * 0.25, 0, 1);
    if (tAmt > 0.04) {
      const maxStreak = (10 + 30 * lanePart) * sc, paths = [];
      for (let i = 0; i < nAct; i++) {
        const vx = FVX[i], vy = FVY[i];
        if (vx * vx + vy * vy < 900 || FA[i] < 0.12) continue;
        let sx = vx * 0.045, sy = vy * 0.045; const sl = Math.sqrt(sx * sx + sy * sy);
        if (sl > maxStreak) { sx *= maxStreak / sl; sy *= maxStreak / sl; }
        const k = tm[i], pth = paths[k] || (paths[k] = new Path2D());
        pth.moveTo(FX[i], FY[i]); pth.lineTo(FX[i] - sx, FY[i] - sy);
      }
      ctx.lineCap = 'round'; ctx.lineWidth = 1.1 * sc + 0.3;
      for (let k = 0; k < TEAMS; k++) if (paths[k]) { ctx.strokeStyle = rgba(mix3(teamC[k], dark ? [255, 255, 255] : [0, 0, 0], 0.15), (dark ? 0.42 : 0.34) * tAmt); ctx.stroke(paths[k]); }
    }

    // particles
    const gs = 10;
    for (let i = 0; i < nAct; i++) {
      const a = FA[i];
      if (a < 0.015) continue;
      const key = FK[i], s = FR[i] * gs;
      ctx.globalAlpha = a > 1 ? 1 : a;
      if (key < 0) { // a lit phone screen
        const f = getScreen(i & 1), ss = Math.max(s * 1.5, 12);
        ctx.drawImage(f, FX[i] - ss / 2, FY[i] - ss / 2, ss, ss);
      } else {
        ctx.drawImage(spr[key] || getSpriteByKey(key), FX[i] - s / 2, FY[i] - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
  const getSpriteByKey = key => {
    const stop = key & 7, fq = (key >> 3) & 3, jq = (key >> 5) & 3, team = key >> 7;
    return getSprite(team, jq, fq, stop);
  };

  /* ============================== captions, labels, rail ============================== */
  const frags = $$('.frag').map(el => ({ el, words: $$('.w', el), lw: [], fo: -1 }));
  const tagEls = $$('.story-tag'), tagO = tagEls.map(() => -1);
  const core = $('.story-core'), fin = $('.story-final'), hint = $('.story-hint'), rail = $('.story-rail');
  const ticks = $$('.story-tick'), bgCold = $('.sb-cold'), bgTeam = $('.sb-team'), bgBrand = $('.sb-brand');
  let coreO = -1, coreS = -1, finO = -1, hintO = -1, railP = -1, bgC = -1, bgT = -1, bgB = -1;
  const setVar = (el, k, v) => el.style.setProperty(k, v);

  const railFrac = v => {
    const S = CFG.stops;
    if (v <= S[0]) return 0;
    for (let i = 1; i < S.length; i++) if (v <= S[i]) return (i - 1 + (v - S[i - 1]) / (S[i] - S[i - 1])) / (S.length - 1);
    return 1;
  };
  const updateUI = () => {
    // caption fragments + progressive word light
    frags.forEach((f, a) => {
      const c = CFG.cap[a];
      const fo = sstep(c[0], c[1], ps) * (1 - sstep(c[2], c[3], ps));
      if (Math.abs(fo - f.fo) > 0.008 || (fo === 0) !== (f.fo === 0)) { f.fo = fo; setVar(f.el, '--fo', fo.toFixed(3)); }
      if (fo > 0) {
        const q = clamp((ps - c[4]) / (c[5] - c[4]), 0, 1), n = f.words.length;
        for (let j = 0; j < n; j++) {
          const l = sstep(0, 1, clamp(q * (n + 1.4) - j, 0, 1));
          if (Math.abs(l - (f.lw[j] === undefined ? -1 : f.lw[j])) > 0.02) { f.lw[j] = l; setVar(f.words[j], '--l', l.toFixed(2)); }
        }
      }
    });
    // team labels belong to act 2
    const gT = sstep(0.55, 0.98, G.g0) * (1 - sstep(0, 0.3, G.g1));
    tagEls.forEach((el, k) => {
      const o = clamp(gT * 1.4 - k * 0.05, 0, 1);
      if (Math.abs(o - tagO[k]) > 0.02) { tagO[k] = o; setVar(el, '--o', o.toFixed(2)); }
    });
    // droplet in the heart of the arch, closing line under the word
    const cO = sstep(0.1, 0.7, G.g2), cS = 0.35 + 0.65 * ez(sstep(0.1, 1, G.g2)) + 0.06 * G.g3;
    if (Math.abs(cO - coreO) > 0.01 || Math.abs(cS - coreS) > 0.01) { coreO = cO; coreS = cS; setVar(core, '--o', cO.toFixed(2)); setVar(core, '--s', cS.toFixed(3)); }
    const fO = sstep(0.55, 1, G.g3);
    if (Math.abs(fO - finO) > 0.01) { finO = fO; setVar(fin, '--o', fO.toFixed(2)); }
    const hO = 1 - sstep(0.004, 0.035, p);
    if (Math.abs(hO - hintO) > 0.02) { hintO = hO; setVar(hint, '--ho', hO.toFixed(2)); }
    // atmosphere: cold → team colours → brand glow
    const bc = (1 - sstep(0.1, 0.3, ps)) * 0.95, bt = sstep(0.18, 0.38, ps) * (1 - sstep(0.6, 0.8, ps)) * 0.2, bb = sstep(0.62, 0.95, ps);
    if (Math.abs(bc - bgC) > 0.01) { bgC = bc; bgCold.style.opacity = bc.toFixed(2); }
    if (Math.abs(bt - bgT) > 0.01) { bgT = bt; bgTeam.style.opacity = bt.toFixed(2); }
    if (Math.abs(bb - bgB) > 0.01) { bgB = bb; bgBrand.style.opacity = bb.toFixed(2); }
    // rail
    const rf = railFrac(ps);
    if (Math.abs(rf - railP) > 0.002) { railP = rf; setVar(rail, '--rp', rf.toFixed(3)); }
    const A = CFG.actAt;
    const na = ps >= A[3] ? 3 : ps >= A[2] ? 2 : ps >= A[1] ? 1 : 0;
    if (na !== act) {
      act = na; root.dataset.act = String(na);
      ticks.forEach((b, i) => {
        b.classList.toggle('is-on', i === na); b.classList.toggle('is-past', i < na);
        if (i === na) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
    if (Math.abs(p - lastProg) > 0.003) { lastProg = p; root.dataset.progress = p.toFixed(3); }
  };

  // one-shot rings when the arch and the word complete
  let archDone = false, wordDone = false;
  const milestones = now => {
    if (G.g2 > 0.98 && !archDone) { archDone = true; ripples.push({ x: L.dropX, y: L.dropY, t: now, d: 1900, R: L.A * 0.9, sq: 0.3 }); }
    if (G.g2 < 0.5) archDone = false;
    if (G.g3 > 0.98 && !wordDone) { wordDone = true; ripples.push({ x: L.dropX, y: L.wordY, t: now, d: 2200, R: L.A * 1.05, sq: 0.22, c: accentC }); ripples.push({ x: L.dropX, y: L.wordY, t: now + 260, d: 2200, R: L.A * 0.8, sq: 0.22, c: skyC }); }
    if (G.g3 < 0.5) wordDone = false;
  };

  /* ============================== loop ============================== */
  const measure = () => {
    const r = track.getBoundingClientRect();
    const range = Math.max(1, r.height - stage.clientHeight);
    return clamp(-r.top / range, 0, 1);
  };
  const frame = now => {
    raf = 0;
    if (!running) return;
    const w0 = performance.now();
    const dt = clamp((now - lastT) / 1000 || 0.016, 0.001, 0.05);
    if (lastT) stat.interval = lerp(stat.interval || dt * 1000, dt * 1000, 0.08);
    lastT = now;
    aliveT += dt;
    p = measure();
    if (firstFrame) { ps = p; pPrev = p; }
    const k = 1 - Math.exp(-dt * CFG.smooth);
    ps += (p - ps) * k;
    if (Math.abs(p - ps) < 0.00005) ps = p;
    energy = lerp(energy, clamp(Math.abs(ps - pPrev) / dt * 2.2, 0, 1), 0.12); pPrev = ps;
    ig = sstep(0, 0.9, aliveT);
    step(dt, now / 1000);
    milestones(now);
    draw(now / 1000, now);
    updateUI();
    // quality governor: shed particles if the browser can't keep up
    stat.frames++; stat.work = lerp(stat.work || performance.now() - w0, performance.now() - w0, 0.1);
    if (root.dataset.adaptive !== 'off' && stat.frames > 40 && stat.interval > 27) { if (++stat.slow > 45 && nAct > N * 0.45) { nAct = Math.max(Math.round(N * 0.45), Math.floor(nAct * 0.82)); stat.slow = 0; } } else stat.slow = Math.max(0, stat.slow - 1);
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    if (running || !live || !visible || document.hidden) return;
    running = true; lastT = 0; aliveT = firstFrame ? 0 : 0.5; firstFrame = true;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };

  /* ============================== wiring ============================== */
  const scrollToProgress = v => {
    const r = track.getBoundingClientRect();
    const range = Math.max(1, r.height - stage.clientHeight);
    window.scrollTo({ top: window.scrollY + r.top + v * range, behavior: mqReduce.matches ? 'auto' : 'smooth' });
  };
  ticks.forEach((b, i) => b.addEventListener('click', () => scrollToProgress(CFG.stops[i])));

  const local = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointermove', e => { if (!live) return; const [x, y] = local(e); ptr.x = x; ptr.y = y; ptr.on = true; });
  stage.addEventListener('pointerleave', () => { ptr.on = false; });
  stage.addEventListener('pointerdown', e => {
    if (!live || e.target.closest('.story-rail')) return;
    const [x, y] = local(e); ptr.x = x; ptr.y = y;
    const now = performance.now(), R = 230 * sc;
    ripples.push({ x, y, t: now, d: 1300, R: 120 * sc, sq: 0.5 });
    for (let i = 0; i < nAct; i++) { // a shock wave: an impulse that spreads and springs back
      const dx = X[i] + DX[i] - x, dy = Y[i] + DY[i] - y, d = Math.hypot(dx, dy);
      if (d < R && d > 0.5) { const f = (1 - d / R) * 520 * sc; DVX[i] += (dx / d) * f; DVY[i] += (dy / d) * f; }
    }
  });

  let resizeQ = 0;
  const relayout = () => { resizeQ = 0; if (live) layout(); };
  const queueLayout = () => { if (!resizeQ) resizeQ = requestAnimationFrame(relayout); };
  if ('ResizeObserver' in window) new ResizeObserver(queueLayout).observe(stage); else addEventListener('resize', queueLayout);
  addEventListener('themechange', readColors);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? start() : stop(); }, { rootMargin: '120px 0px', threshold: 0 }).observe(track);
  } else visible = true;

  const goLive = () => {
    if (live) return true;
    try {
      ctx = canvas.getContext('2d');
      if (!ctx) return false;
      readColors();
      root.classList.add('is-live');
      live = true;
      sampleWord();
      layout();
      window.__storyReady = true;
      const fonts = document.fonts;
      if (fonts && fonts.load) {
        const redo = () => { readColors(); sampleWord(); if (live) layout(); };
        Promise.all([fonts.load(`700 120px ${fontH.split(',')[0]}`, root.dataset.word || ''), fonts.ready]).then(redo, redo);
        if (fonts.addEventListener) fonts.addEventListener('loadingdone', redo);
      }
      if (visible) start();
      return true;
    } catch (err) { live = false; root.classList.remove('is-live'); return false; }
  };
  const goStatic = () => { stop(); live = false; root.classList.remove('is-live'); };
  const sync = () => { if (mqReduce.matches || !mqTall.matches) goStatic(); else goLive(); };
  [mqReduce, mqTall].forEach(m => (m.addEventListener ? m.addEventListener('change', sync) : m.addListener && m.addListener(sync)));
  sync();

  // read-only handle for tests / profiling
  window.YanabeeStory = {
    get live() { return live; },
    get progress() { return ps; },
    stats: () => ({ particles: nAct, allocated: N, dpr, word: wordPts ? wordPts.length : 0, frames: stat.frames, workMs: +stat.work.toFixed(2), frameMs: +(stat.interval || 0).toFixed(2) }),
  };
})();
