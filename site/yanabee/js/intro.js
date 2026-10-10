// Opening scene (home, first visit per session; `?intro` replays it).
// A drop of light falls, splashes into the seven team colours, the logo rises from the water, then a
// circular hole opens onto the hero. Any press / key skips ahead. Decorative; the page underneath is
// complete and readable the whole time (the scene is aria-hidden).
(() => {
  const root = document.documentElement;
  const el = document.getElementById('intro');
  if (!el) return;
  const cv = el.querySelector('canvas');
  const ctx = cv && cv.getContext && cv.getContext('2d');
  if (!root.classList.contains('intro-on') || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.remove('intro-on'); el.remove(); return;
  }
  try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* private mode: it simply plays again */ }

  const PAL = ['#46d39c', '#f0a95a', '#ff8d75', '#91a8ff', '#9bd66b', '#cb9cf3', '#f388b2'];
  const ACC = '#2fd3c6';
  const FALL0 = 280, IMPACT = 1080, REVEAL = 2500, END = 3550; // ms
  let W = 0, H = 0, dpr = 1, iy = 0;
  let t0 = 0, last = 0, raf = 0, ended = false, popped = false, revealed = false, rim = null, skipAt = -1;
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    iy = Math.round(H * 0.54);
    el.style.setProperty('--iy', iy + 'px');
    el.style.setProperty('--cx', '50%');
    el.style.setProperty('--cy', (iy - Math.min(W, H) * 0.07) + 'px');
  };
  size();
  addEventListener('resize', size);

  // ambience: dim bubbles drifting upward
  const bubbles = Array.from({ length: Math.round(Math.min(70, W / 18)) }, () => ({
    x: Math.random() * W, y: Math.random() * H, r: rnd(0.8, 2.6), v: rnd(6, 22), a: rnd(0.12, 0.4), w: rnd(0, 6.28),
  }));
  const splash = [];
  const rings = [];
  const spawnSplash = () => {
    for (let i = 0; i < 120; i++) {
      const a = -Math.PI * rnd(0.1, 0.9), s = rnd(160, 760) * (0.4 + Math.random() * 0.8);
      splash.push({ x: W / 2 + rnd(-8, 8), y: iy, vx: Math.cos(a) * s * 0.9, vy: Math.sin(a) * s, r: rnd(1.3, 4.2), c: PAL[i % 7], life: rnd(0.9, 1.7), age: 0 });
    }
    [0, 120, 250, 400].forEach((d, k) => rings.push({ x: W / 2, y: iy, t: IMPACT + d, c: k ? PAL[(k * 2) % 7] : ACC, big: true }));
  };

  const drawDrop = (t) => {
    const u = Math.min(1, (t - FALL0) / (IMPACT - FALL0));
    if (u <= 0 || u >= 1) return;
    const y = -40 + (iy + 40) * u * u, h = 30 + 46 * u, r = 11;
    const g = ctx.createLinearGradient(0, y - h * 2.4, 0, y);
    g.addColorStop(0, 'rgba(47,211,198,0)'); g.addColorStop(1, 'rgba(120,240,230,.55)');
    ctx.fillStyle = g; // light trail
    ctx.beginPath(); ctx.moveTo(W / 2, y - h * 2.4); ctx.lineTo(W / 2 + 2.5, y - h); ctx.lineTo(W / 2 - 2.5, y - h); ctx.closePath(); ctx.fill();
    const glow = ctx.createRadialGradient(W / 2, y, 0, W / 2, y, 70);
    glow.addColorStop(0, 'rgba(127,240,227,.5)'); glow.addColorStop(1, 'rgba(127,240,227,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(W / 2, y, 70, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#d6fffb'; // the drop itself: pointed tail up, round belly down
    ctx.beginPath();
    ctx.moveTo(W / 2, y - h);
    ctx.bezierCurveTo(W / 2 + r * 0.5, y - h * 0.35, W / 2 + r, y - r * 0.9, W / 2 + r, y);
    ctx.arc(W / 2, y, r, 0, Math.PI, false);
    ctx.bezierCurveTo(W / 2 - r, y - r * 0.9, W / 2 - r * 0.5, y - h * 0.35, W / 2, y - h);
    ctx.fill();
  };

  const frame = (now) => {
    if (ended) return;
    if (!t0) { t0 = now; last = now; }
    let t = now - t0;
    if (skipAt >= 0 && t < REVEAL) { t0 -= (REVEAL - t) - 0; t = REVEAL; skipAt = -1; if (!popped) { popped = true; el.classList.add('pop'); } }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);

    // bubbles
    ctx.globalCompositeOperation = 'lighter';
    bubbles.forEach(b => {
      b.y -= b.v * dt; b.w += dt;
      if (b.y < -6) { b.y = H + 6; b.x = Math.random() * W; }
      ctx.fillStyle = `rgba(150,240,235,${b.a})`;
      ctx.beginPath(); ctx.arc(b.x + Math.sin(b.w) * 6, b.y, b.r, 0, 6.2832); ctx.fill();
    });

    // fall
    if (t >= FALL0 && t < IMPACT) drawDrop(t);
    if (t >= IMPACT && !splash.length && !rings.length) spawnSplash();
    if (t >= IMPACT + 60 && !popped) { popped = true; el.classList.add('pop'); }

    // soft light on the water where it landed
    if (t >= IMPACT) {
      const p = Math.min(1, (t - IMPACT) / 1500);
      const g = ctx.createRadialGradient(W / 2, iy, 0, W / 2, iy, Math.min(W, 760) * 0.55);
      g.addColorStop(0, `rgba(47,211,198,${0.34 * (1 - p * 0.5)})`); g.addColorStop(1, 'rgba(47,211,198,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(W / 2, iy, Math.min(W, 760) * 0.55, Math.min(W, 760) * 0.12, 0, 0, 6.2832); ctx.fill();
    }

    // rings (perspective-squashed ellipses)
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], p = (t - r.t) / (r.big ? 1500 : 900);
      if (p < 0) continue;
      if (p >= 1) { rings.splice(i, 1); continue; }
      const rx = (r.big ? 24 + p * Math.min(W * 0.46, 520) : 4 + p * 46);
      ctx.strokeStyle = hexA(r.c, Math.pow(1 - p, 1.5) * (r.big ? 0.85 : 0.6));
      ctx.lineWidth = Math.max(0.6, (r.big ? 2.6 : 1.4) * (1 - p * 0.6));
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.2, 0, 0, 6.2832); ctx.stroke();
    }

    // splash droplets
    for (let i = splash.length - 1; i >= 0; i--) {
      const s = splash[i];
      s.age += dt; s.vy += 1700 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > iy + 2 && s.vy > 0) { if (rings.length < 40 && Math.random() < 0.35) rings.push({ x: s.x, y: iy, t, c: s.c, big: false }); splash.splice(i, 1); continue; }
      const a = Math.max(0, 1 - s.age / s.life);
      ctx.fillStyle = hexA(s.c, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.6 + a * 0.6), 0, 6.2832); ctx.fill();
      ctx.fillStyle = hexA(s.c, a * 0.18);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // reveal: a hole opens from the logo
    if (t >= REVEAL) {
      if (!revealed) {
        revealed = true;
        el.classList.add('out');
        rim = document.createElement('div'); rim.className = 'intro-rim'; document.body.appendChild(rim);
        const cy = el.style.getPropertyValue('--cy');
        rim.style.setProperty('--cx', '50%'); rim.style.setProperty('--cy', cy);
        // let the hero begin its own entrance a beat after the hole starts to open
        setTimeout(() => root.classList.remove('intro-on'), 260);
        // ripples on the water surface under the hole (water.js listens)
        const cyPx = parseFloat(cy) || iy;
        [[0, 0, 1], [140, -0.12, 0.7], [260, 0.14, 0.6], [380, -0.22, 0.5], [500, 0.24, 0.5]].forEach(([d, k, s]) =>
          setTimeout(() => window.dispatchEvent(new CustomEvent('yanabee:drop', { detail: { x: W / 2 + k * W * 0.4, y: cyPx + Math.abs(k) * 40, strength: s } })), d));
      }
      const p = Math.min(1, (t - REVEAL) / (END - REVEAL - 300));
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const R = e * Math.hypot(W, H) * 0.62 + 40;
      el.style.setProperty('--r', R + 'px');
      if (rim) { rim.style.setProperty('--r', R + 'px'); rim.style.opacity = String(Math.max(0, 1 - p * 1.05)); }
    }
    if (t >= END) return finish();
    raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', size);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => removeEventListener(ev, skip));
    root.classList.remove('intro-on');
    if (rim) rim.remove();
    el.remove();
    window.dispatchEvent(new CustomEvent('yanabee:intro-end'));
  };
  const skip = (e) => {
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
    if (!revealed) skipAt = 1;
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, skip, { passive: true }));
  raf = requestAnimationFrame(frame);
})();
