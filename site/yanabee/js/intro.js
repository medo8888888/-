// Launch-screen splash (home, first visit per session; `?intro` replays it).
// A drop of light falls into the water, one ripple spreads, the logo springs in, and the overlay fades away to the app
// underneath: about 1.3 s in all. It never locks scrolling (the overlay ignores pointer input and the page below is
// complete and usable the whole time), and any press / key / wheel / touch removes it at once. Decorative: aria-hidden.
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

  const PAL = ['#46d39c', '#f0a95a', '#ff8d75', '#91a8ff', '#9bd66b', '#cb9cf3', '#f388b2']; // the seven team colours
  const ACC = '#2fd3c6';
  // timeline (ms from the script start): the drop falls 0-340, the ripple spreads 300-820, the logo springs in 430-900,
  // the overlay fades out 950-1230 while the hero below starts its entrance, and the overlay is gone at 1280
  const IMPACT = 340, POP = 430, REVEAL = 950, END = 1280;
  // The overlay is painted by CSS before this deferred script runs: the clock starts at that first paint (up to 300 ms of a late
  // start is skipped, so the splash is gone about 1.3 s after the first paint even when scripts arrive late).
  let late = 0;
  try {
    const fp = performance.getEntriesByType('paint').filter(e => e.name === 'first-paint')[0];
    if (fp) late = Math.max(0, Math.min(300, performance.now() - fp.startTime));
  } catch (e) { /* no paint timing: start now */ }
  let W = 0, H = 0, dpr = 1, iy = 0;
  let t0 = performance.now() - late, last = t0, raf = 0, ended = false, landed = false, popped = false, revealed = false;
  const bits = [];
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
  };
  size();
  addEventListener('resize', size);

  // a few tiny droplets in the seven team colours leap from the landing point (one per team, not a particle storm)
  const spawn = () => {
    PAL.forEach((c, i) => {
      const a = -Math.PI * (0.18 + 0.64 * (i / 6)) + rnd(-0.08, 0.08), s = rnd(240, 470);
      bits.push({ x: W / 2 + rnd(-6, 6), y: iy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(2, 3.6), c, life: rnd(0.45, 0.62), age: 0 });
    });
  };

  const drawDrop = t => {
    const u = Math.min(1, t / IMPACT);
    if (u >= 1) return;
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

  // the overlay fades out (opacity only) and the hero underneath starts its quick entrance: dropping .intro-on releases it
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    el.classList.add('out');
    root.classList.remove('intro-on');
    window.dispatchEvent(new CustomEvent('yanabee:intro-reveal'));
    // one ripple on the water surface under the hero (water.js listens)
    setTimeout(() => window.dispatchEvent(new CustomEvent('yanabee:drop', { detail: { x: W / 2, y: iy, strength: 0.8 } })), 90);
  };

  const frame = now => {
    if (ended) return;
    const t = Math.max(0, now - t0); // a frame timestamp can predate the script's own clock read
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    if (t < IMPACT) drawDrop(t);
    if (t >= IMPACT && !landed) { landed = true; spawn(); }
    if (t >= POP && !popped) { popped = true; el.classList.add('pop'); }

    if (t >= IMPACT) { // soft light on the water where it landed
      const p = Math.min(1, (t - IMPACT) / 700);
      const g = ctx.createRadialGradient(W / 2, iy, 0, W / 2, iy, Math.min(W, 760) * 0.55);
      g.addColorStop(0, `rgba(47,211,198,${0.34 * (1 - p * 0.6)})`); g.addColorStop(1, 'rgba(47,211,198,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(W / 2, iy, Math.min(W, 760) * 0.55, Math.min(W, 760) * 0.12, 0, 0, 6.2832); ctx.fill();
    }

    const rp = (t - (IMPACT - 40)) / 520; // the one ripple (a perspective-squashed ellipse)
    if (rp > 0 && rp < 1) {
      const rx = 24 + rp * Math.min(W * 0.42, 480);
      ctx.strokeStyle = hexA(ACC, Math.pow(1 - rp, 1.5) * 0.85);
      ctx.lineWidth = Math.max(0.6, 2.6 * (1 - rp * 0.6));
      ctx.beginPath(); ctx.ellipse(W / 2, iy, rx, rx * 0.2, 0, 0, 6.2832); ctx.stroke();
    }

    for (let i = bits.length - 1; i >= 0; i--) {
      const s = bits[i];
      s.age += dt; s.vy += 1700 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if ((s.y > iy + 2 && s.vy > 0) || s.age > s.life) { bits.splice(i, 1); continue; }
      const a = Math.max(0, 1 - s.age / s.life);
      ctx.fillStyle = hexA(s.c, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.6 + a * 0.6), 0, 6.2832); ctx.fill();
      ctx.fillStyle = hexA(s.c, a * 0.18);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (t >= REVEAL) reveal();
    if (t >= END) return finish();
    raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    clearTimeout(guard);
    removeEventListener('resize', size);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => removeEventListener(ev, skip));
    reveal();
    el.remove();
    window.dispatchEvent(new CustomEvent('yanabee:intro-end'));
  };
  const skip = e => {
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
    finish();
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, skip, { passive: true }));
  const guard = setTimeout(finish, END + 500); // safety net if animation frames are starved
  raf = requestAnimationFrame(frame);
})();
