// Interactive 3D dotted globe — "من إسطنبول إلى العالم".
// Pure canvas 2D with a small 3D projection (no libraries) so it stays light on phones.
const DEG = Math.PI / 180;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Rough continent outlines [lon, lat] — enough for a recognisable dotted world.
const LAND = [
  // Africa
  [[-17,21],[-16,28],[-10,35],[10,37],[11,33],[20,32],[32,31],[35,28],[43,12],[51,12],[51,2],[40,-15],[35,-25],[20,-35],[18,-30],[12,-17],[9,-1],[8,4],[-8,4],[-17,14]],
  // Eurasia
  [[-10,36],[-9,43],[-1,46],[-5,48],[2,51],[8,54],[5,62],[14,68],[25,71],[40,68],[60,70],[80,73],[100,77],[120,73],[140,72],[160,70],[180,68],[180,62],[163,60],[157,51],[143,47],[140,40],[132,43],[127,37],[122,40],[120,32],[121,25],[110,20],[108,11],[104,9],[103,1],[98,8],[98,16],[92,22],[80,15],[77,8],[72,20],[66,25],[57,25],[56,27],[50,30],[48,29],[56,24],[59,22],[52,16],[44,13],[42,16],[39,22],[35,28],[34,31],[36,36],[28,36],[26,40],[23,36],[20,40],[19,42],[13,45],[16,41],[18,40],[15,38],[12,42],[8,44],[3,43],[-2,37]],
  // British Isles
  [[-6,50],[2,51],[0,53],[-3,56],[-5,58],[-7,56],[-5,54],[-6,52]],
  // Arabian bridge / Anatolia fill handled by Eurasia; Japan
  [[130,31],[135,34],[140,35],[142,40],[141,45],[139,41],[135,35],[130,34]],
  // North America
  [[-168,66],[-156,71],[-140,70],[-125,70],[-95,72],[-80,73],[-62,67],[-55,53],[-66,45],[-70,42],[-76,35],[-81,31],[-80,25],[-82,28],[-90,30],[-97,27],[-97,21],[-92,18],[-87,21],[-88,15],[-83,10],[-79,8],[-85,11],[-92,14],[-105,20],[-110,23],[-115,30],[-117,33],[-124,40],[-125,49],[-135,57],[-150,60],[-165,60]],
  // Greenland
  [[-55,60],[-45,60],[-20,70],[-20,80],[-60,82],[-72,78],[-55,70]],
  // South America
  [[-80,8],[-72,12],[-60,10],[-50,0],[-35,-5],[-39,-15],[-48,-25],[-58,-35],[-65,-42],[-68,-52],[-74,-52],[-73,-40],[-71,-30],[-70,-18],[-76,-14],[-81,-5],[-79,1]],
  // Australia
  [[114,-22],[122,-18],[130,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-35],[129,-32],[115,-34]],
  // Indonesia (Sumatra, Java, Borneo, Sulawesi, New Guinea – simplified)
  [[95,5],[98,4],[104,-2],[106,-6],[114,-8],[106,-7],[102,-4],[98,0]],
  [[109,1],[112,3],[117,7],[119,1],[116,-4],[111,-3]],
  [[131,-1],[141,-3],[150,-10],[142,-9],[135,-4]],
  // Madagascar
  [[44,-25],[47,-25],[50,-15],[49,-12],[44,-17]],
];

const HOME = [28.98, 41.01]; // Istanbul
const TARGETS = [
  [32.86, 39.93], // Ankara
  [31.24, 30.04], // Cairo
  [46.68, 24.71], // Riyadh
  [51.53, 25.29], // Doha
  [73.05, 33.68], // Islamabad
  [101.69, 3.14], // Kuala Lumpur
  [106.85, -6.21], // Jakarta
  [-0.13, 51.51], // London
  [13.40, 52.52], // Berlin
  [-74.0, 40.71], // New York
  [-79.38, 43.65], // Toronto
  [-17.45, 14.69], // Dakar
  [3.06, 36.75], // Algiers
];

function inPoly(lon, lat, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const vec = (lon, lat) => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];

function slerp(a, b, t) {
  const d = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (d < 1e-6) return a;
  const s = Math.sin(d), k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

function landPoints(n) {
  const pts = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG;
    if (LAND.some(p => inPoly(lon, lat, p))) pts.push([x, y, z]);
  }
  return pts;
}

function leafPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.75, -s * 0.45, s * 0.7, s * 0.55, 0, s);
  ctx.bezierCurveTo(-s * 0.7, s * 0.55, -s * 0.75, -s * 0.45, 0, -s);
}

function initGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const small = innerWidth < 760;
  const dots = landPoints(small ? 5200 : 8000);
  const withArcs = canvas.dataset.arcs !== '0';
  const home = vec(...HOME);
  const arcs = TARGETS.map((t, i) => ({ to: vec(...t), start: i * 0.55, dur: 2.6 + (i % 3) * 0.4 }));
  const leaves = [
    { r: 1.32, inc: 0.5, ph: 0, sp: 0.18, col: '#3f8f3a', s: 14 },
    { r: 1.42, inc: -0.35, ph: 2.1, sp: 0.14, col: '#d39a2a', s: 16 },
    { r: 1.26, inc: 1.0, ph: 4.0, sp: 0.21, col: '#c06a22', s: 12 },
    { r: 1.48, inc: -0.9, ph: 1.0, sp: 0.12, col: '#5aa04a', s: 13 },
    { r: 1.36, inc: 0.2, ph: 3.2, sp: 0.16, col: '#e0b13a', s: 11 },
  ];

  let colors = {};
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue(n).trim();
    colors = { land: g('--globe-land'), glow: g('--globe-glow'), arc: g('--globe-arc'), rim: g('--globe-rim'), home: g('--c-maroon') || '#b03a2e' };
  };
  readColors();
  addEventListener('themechange', () => requestAnimationFrame(() => { readColors(); if (!running) draw(); }));

  let W = 0, H = 0, R = 0, dpr = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    R = Math.min(W, H) * 0.36;
    if (!running) draw();
  };

  // rotation state: start with Istanbul facing the viewer
  let rotY = -HOME[0] * DEG + 0.35, vel = reduce ? 0 : 0.0022, drag = null;
  const tilt = 0.42; // radians, shows the northern hemisphere a little more
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  const project = (p, alt = 1) => {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cosT - z1 * sinT, z2 = p[1] * sinT + z1 * cosT;
    return [W / 2 + x1 * R * alt, H / 2 - y2 * R * alt, z2];
  };

  let t0 = performance.now(), running = false, visible = true, raf = 0;

  function draw(now = performance.now()) {
    const t = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

    // leaves behind the globe
    const leafPos = leaves.map(l => {
      const a = l.ph + t * l.sp * (reduce ? 0 : 1);
      const p = [Math.cos(a) * l.r, Math.sin(a) * l.r * Math.sin(l.inc), Math.sin(a) * l.r * Math.cos(l.inc)];
      const x = cx + p[0] * R, y = cy - p[1] * R;
      return { l, x, y, z: p[2], a };
    });
    const drawLeaf = o => {
      const sc = 0.75 + 0.35 * (o.z + 1.5) / 3;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.a * 1.7 + o.l.ph);
      ctx.globalAlpha = o.z < 0 ? 0.35 : 0.95;
      ctx.fillStyle = o.l.col;
      leafPath(ctx, o.l.s * sc * (R / 180));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -o.l.s * sc * (R / 180) * 0.8); ctx.lineTo(0, o.l.s * sc * (R / 180) * 0.8); ctx.stroke();
      ctx.restore();
    };
    leafPos.filter(o => o.z < 0).forEach(drawLeaf);

    // atmosphere glow + sphere body
    const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.35);
    glow.addColorStop(0, colors.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    body.addColorStop(0, colors.glow); body.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.rim; ctx.lineWidth = 1.2; ctx.stroke();

    // dots
    ctx.fillStyle = colors.land;
    const base = Math.max(1.1, R / 125);
    for (let i = 0; i < dots.length; i++) {
      const [x, y, z] = project(dots[i]);
      if (z < -0.05) continue;
      ctx.globalAlpha = 0.25 + 0.75 * z;
      const s = base * (0.6 + 0.6 * z);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // arcs from Istanbul
    if (withArcs) {
      const cycle = 9;
      ctx.lineCap = 'round';
      arcs.forEach(a => {
        let p = ((t - a.start) % cycle + cycle) % cycle / a.dur;
        if (reduce) p = 1;
        if (p <= 0 || p > 1.6) return;
        const head = Math.min(p, 1), tail = Math.max(0, p - 0.6);
        const N = 28;
        let prev = null;
        for (let k = 0; k <= N; k++) {
          const s = tail + (head - tail) * (k / N);
          const v = slerp(home, a.to, s);
          const alt = 1 + 0.22 * Math.sin(Math.PI * s);
          const q = project(v, alt);
          if (prev && q[2] > -0.15 && prev[2] > -0.15) {
            ctx.globalAlpha = (k / N) * (q[2] > 0 ? 1 : 0.35) * (p > 1 ? Math.max(0, 1.6 - p) / 0.6 : 1);
            ctx.strokeStyle = colors.arc; ctx.lineWidth = Math.max(1.4, R / 120);
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          }
          prev = q;
        }
        if (p >= 1) { // landing pulse
          const q = project(a.to);
          if (q[2] > 0) {
            ctx.globalAlpha = Math.max(0, 1.6 - p) / 0.6;
            ctx.fillStyle = colors.arc;
            ctx.beginPath(); ctx.arc(q[0], q[1], base * 2.4, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
      ctx.globalAlpha = 1;
    }

    // Istanbul marker
    const hq = project(home);
    if (hq[2] > 0) {
      const pulse = reduce ? 0.5 : (t * 0.8) % 1;
      ctx.strokeStyle = colors.home; ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - pulse;
      ctx.beginPath(); ctx.arc(hq[0], hq[1], base * 3 + pulse * R * 0.12, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.home;
      ctx.beginPath(); ctx.arc(hq[0], hq[1], base * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hq[0], hq[1], base * 1.3, 0, Math.PI * 2); ctx.fill();
    }

    // leaves in front
    leafPos.filter(o => o.z >= 0).forEach(drawLeaf);
    ctx.globalAlpha = 1;
  }

  const AUTO = 0.0022; // radians per frame (~0.13 rad/s)
  function loop(now) {
    if (!drag) { rotY += vel; vel += (AUTO - vel) * 0.02; }
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!running && !reduce && visible && !document.hidden) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  // drag to spin
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: rotY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const nr = drag.r + (e.clientX - drag.x) * 0.008;
    vel = Math.max(-0.08, Math.min(0.08, nr - rotY));
    rotY = nr;
    if (!running) draw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
}

document.querySelectorAll('canvas[data-globe]').forEach(c => {
  if (c.offsetParent !== null) initGlobe(c);
});
