// Home page interactions: the funding donut answers to the pointer, the growth phases take turns.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- funding donut: point at a slice (or a line) to light it ---------------- */
  const donut = $('.donut');
  if (donut && donut.dataset.shares) {
    const shares = donut.dataset.shares.split(',').map(Number);
    const bounds = shares.reduce((a, v) => (a.push((a[a.length - 1] || 0) + v), a), []);
    const centre = $('b', donut), start = centre ? centre.textContent : '';
    const items = $$('.fund-legend li');
    const set = i => {
      if (i < 0) delete donut.dataset.hl; else donut.dataset.hl = String(i + 1);
      if (centre) centre.textContent = i < 0 ? start : shares[i] + '%';
      items.forEach((li, k) => li.classList.toggle('is-hl', k === i));
    };
    donut.addEventListener('pointermove', e => {
      const r = donut.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d < r.width * 0.31 || d > r.width / 2 + 4) return set(-1); // hole / outside
      let deg = Math.atan2(dx, -dy) * 180 / Math.PI; // clockwise from the top, like the conic gradient
      if (deg < 0) deg += 360;
      const pct = deg / 3.6;
      set(bounds.findIndex(b => pct < b));
    });
    donut.addEventListener('pointerleave', () => set(-1));
    items.forEach((li, k) => {
      li.addEventListener('pointerenter', () => set(k));
      li.addEventListener('pointerleave', () => set(-1));
    });
  }

  /* ---------------- growth phases: a highlight that travels (pauses when pointed at) ---------------- */
  const phases = $$('.phase');
  if (phases.length) {
    let i = 0, hovering = false, timer = 0;
    const on = n => { i = n; phases.forEach((p, k) => p.classList.toggle('is-on', k === n)); };
    on(0);
    phases.forEach((p, k) => {
      p.addEventListener('pointerenter', () => { hovering = true; on(k); });
      p.addEventListener('pointerleave', () => { hovering = false; });
      p.addEventListener('click', () => on(k));
    });
    const track = $('.phases-track');
    if (track && !reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        clearInterval(timer);
        if (es[0].isIntersecting) timer = setInterval(() => { if (!hovering && !document.hidden) on((i + 1) % phases.length); }, 3200);
      }, { threshold: 0.4 }).observe(track);
    }
  }
})();
