// Home hero: seven luminous streams (one per team colour, --t1…--t7) rising
// from a spring, with droplets flowing along them, ripples at the source and a
// gentle pull toward the pointer. Decorative only (canvas is aria-hidden).
// Pauses off-screen / in background tabs; one static frame for reduced motion.
(() => {
  const canvas = document.querySelector('canvas[data-springs]');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 7, DROPS = 13;
  let W = 0, H = 0, dpr = 1, colors = [], accent = '#12a8a4', dark = false;
  let running = false, visible = true, raf = 0, t0 = performance.now();
  const pointer = { x: 0, y: 0, k: 0, tk: 0 };
  const ripples = [];
  let teams = [];
  try { teams = JSON.parse(canvas.dataset.teams || '[]'); } catch (e) { teams = []; }
  const geoms = [];
  let hover = -1;
  const tip = document.createElement('div');
  tip.className = 'stream-tip';
  canvas.parentElement.appendChild(tip);

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    colors = Array.from({ length: N }, (_, i) => cs.getPropertyValue(`--t${i + 1}`).trim() || '#12a8a4');
    accent = cs.getPropertyValue('--accent').trim() || accent;
    dark = document.documentElement.dataset.theme === 'dark';
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) frame(performance.now());
  };

  // Each stream: a cubic Bézier from the source, fanning out like a fountain.
  // Fixed per-stream "personality" so it looks organic, not symmetric.
  const seeds = Array.from({ length: N }, (_, i) => ({
    a: -1.08 + (2.16 * i) / (N - 1),          // spread angle (radians from vertical)
    reach: 0.78 + ((i * 37) % 11) / 60,        // relative height
    ph: i * 1.7, sp: 0.35 + ((i * 13) % 7) / 25, // wobble phase/speed
    drops: Array.from({ length: DROPS }, (_, j) => ({ o: j / DROPS + ((i * 7 + j * 3) % 5) / 50, s: 0.8 + ((i + j) % 4) * 0.12, r: 1.2 + ((i * 3 + j) % 5) * 0.45 })),
  }));

  const geom = (s, t) => {
    const sx = W * 0.5, sy = H * 0.86;
    const spread = Math.min(W * 0.5, H * 0.62);
    const wob = Math.sin(t * s.sp + s.ph);
    const ex = sx + Math.sin(s.a) * spread * (1.02 + 0.04 * wob);
    const ey = sy - Math.cos(s.a * 0.92) * H * 0.74 * s.reach + Math.abs(s.a) * H * 0.07 + wob * H * 0.012;
    let c1x = sx + Math.sin(s.a) * W * 0.03, c1y = sy - H * (0.42 + 0.05 * Math.cos(t * 0.5 + s.ph));
    let c2x = ex - Math.sin(s.a) * spread * 0.32 + Math.cos(t * s.sp * 0.8 + s.ph) * W * 0.012, c2y = ey - H * 0.16;
    if (pointer.k > 0.001) { // bend toward the pointer
      const dx = pointer.x - c2x, dy = pointer.y - c2y, d2 = dx * dx + dy * dy;
      const f = pointer.k * 0.35 * Math.exp(-d2 / (W * W * 0.06));
      c2x += dx * f; c2y += dy * f;
      c1x += (pointer.x - c1x) * f * 0.25;
    }
    return [sx, sy, c1x, c1y, c2x, c2y, ex, ey];
  };
  const bez = (g, u) => {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * g[0] + b * g[2] + c * g[4] + d * g[6], a * g[1] + b * g[3] + c * g[5] + d * g[7]];
  };
  const alpha = (hex, a) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.replace(/^#?([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3'));
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  };

  function frame(now) {
    const t = (now - t0) / 1000;
    pointer.k += (pointer.tk - pointer.k) * 0.06;
    ctx.clearRect(0, 0, W, H);
    const sx = W * 0.5, sy = H * 0.86;

    // pool glow + ripples at the source
    const pool = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.36);
    pool.addColorStop(0, alpha(accent, dark ? 0.28 : 0.2)); pool.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(sx, sy, W * 0.36, W * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    const rings = reduce ? [0.35, 0.7] : [0, 1, 2].map(k => ((t * 0.32 + k / 3) % 1));
    ctx.lineWidth = 1.4;
    rings.forEach(p => {
      ctx.strokeStyle = alpha(accent, (1 - p) * (dark ? 0.5 : 0.42));
      ctx.beginPath(); ctx.ellipse(sx, sy, 20 + p * W * 0.32, (20 + p * W * 0.32) * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
    });
    for (let i = ripples.length - 1; i >= 0; i--) { // click ripples
      const r = ripples[i], p = (now - r.t) / 1400;
      if (p >= 1) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = alpha(accent, (1 - p) * 0.6);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + p * 90, (8 + p * 90) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    seeds.forEach((s, i) => {
      const g = geom(s, reduce ? 1.2 : t), col = colors[i];
      geoms[i] = g;
      const isH = hover === i, dim = hover >= 0 && !isH;
      if (isH) { tip.style.left = g[6] + 'px'; tip.style.top = g[7] + 'px'; }
      const lg = ctx.createLinearGradient(g[0], g[1], g[6], g[7]);
      lg.addColorStop(0, alpha(col, 0.95)); lg.addColorStop(0.7, alpha(col, 0.55)); lg.addColorStop(1, alpha(col, 0.04));
      // soft glow, then the crisp stream
      ctx.lineCap = 'round';
      ctx.strokeStyle = lg; ctx.globalAlpha = (dark ? 0.22 : 0.14) * (isH ? 2.6 : 1) * (dim ? 0.35 : 1); ctx.lineWidth = isH ? 16 : 10;
      ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.bezierCurveTo(g[2], g[3], g[4], g[5], g[6], g[7]); ctx.stroke();
      ctx.globalAlpha = dim ? 0.38 : 1; ctx.lineWidth = isH ? 4 : 2.4;
      ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.bezierCurveTo(g[2], g[3], g[4], g[5], g[6], g[7]); ctx.stroke();
      // droplets
      s.drops.forEach(d => {
        const u = reduce ? d.o % 1 : (d.o + t * 0.09 * d.s) % 1;
        const e = 1 - Math.pow(1 - u, 1.6);
        const [x, y] = bez(g, e);
        const a = Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.95;
        ctx.fillStyle = alpha(col, a);
        ctx.beginPath(); ctx.arc(x, y, d.r * (1.15 - u * 0.5), 0, Math.PI * 2); ctx.fill();
      });
      // a bright bead at the tip
      const [tx, ty] = bez(g, 0.985);
      ctx.fillStyle = alpha(col, isH ? 0.8 : 0.35);
      ctx.beginPath(); ctx.arc(tx, ty, isH ? 8 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.globalCompositeOperation = 'source-over';
    if (running) raf = requestAnimationFrame(frame);
  }

  // nearest stream to a point (canvas coordinates), -1 when none is close enough
  const hit = (px, py, reach) => {
    let best = -1, bd = reach;
    geoms.forEach((g, i) => {
      if (!g) return;
      for (let u = 0.25; u <= 1.001; u += 0.05) {
        const [x, y] = bez(g, u), d = Math.hypot(x - px, y - py);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  };
  const setHover = i => {
    if (i === hover) return;
    hover = i;
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i >= 0 && teams[i]) {
      tip.textContent = teams[i].name;
      tip.style.setProperty('--tc', `var(--t${i + 1})`);
      tip.classList.add('on');
    } else tip.classList.remove('on');
    if (!running) frame(performance.now());
  };
  if (teams.length) {
    const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointermove', e => { const [x, y] = local(e); setHover(hit(x, y, e.pointerType === 'touch' ? 34 : 26)); });
    canvas.addEventListener('pointerleave', () => setHover(-1));
    canvas.addEventListener('click', e => {
      const [x, y] = local(e), i = hit(x, y, e.pointerType === 'touch' ? 38 : 28);
      if (i >= 0 && teams[i]) { if (window.YanabeeWow && YanabeeWow.go) YanabeeWow.go(teams[i].href, e.clientX, e.clientY); else location.href = teams[i].href; }
    });
  }

  const start = () => { if (!running && visible && !reduce && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  readColors();
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else addEventListener('resize', resize);
  addEventListener('themechange', () => { readColors(); if (!running) frame(performance.now()); });
  if (!reduce) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.02 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    const host = canvas.closest('.hero') || canvas;
    host.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
      pointer.tk = (pointer.x > -80 && pointer.x < W + 80 && pointer.y > -80 && pointer.y < H + 80) ? 1 : 0;
    });
    host.addEventListener('pointerleave', () => { pointer.tk = 0; });
    canvas.parentElement.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect();
      ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
    });
    start();
  } else {
    frame(performance.now());
  }
})();
