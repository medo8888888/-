/* Command center (dashboard.html): ARIA tabs, stage stepper, countdown to 2035,
   income orbit (equal segments — the brochure gives no proportions), field-cycle
   highlight. Classic script, no dependencies. Counters use main.js [data-to]. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board = $('.db-board');
  if (!board) return;

  /* ---------------- ARIA tabs (automatic activation, RTL arrows) ---------------- */
  const tabsets = $$('[data-db-tabs]');
  const select = (set, i, focus) => {
    const tabs = $$('[role=tab]', set);
    i = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    if (focus) tabs[i].focus();
    set.dispatchEvent(new CustomEvent('dbtab', { detail: i }));
  };
  const current = set => $$('[role=tab]', set).findIndex(t => t.getAttribute('aria-selected') === 'true');
  tabsets.forEach(set => {
    const tabs = $$('[role=tab]', set);
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => select(set, k, false));
      t.addEventListener('keydown', e => {
        const rtl = getComputedStyle(set).direction === 'rtl';
        let d = 0;
        if (e.key === 'ArrowLeft') d = rtl ? 1 : -1;
        else if (e.key === 'ArrowRight') d = rtl ? -1 : 1;
        else if (e.key === 'ArrowDown') d = 1;
        else if (e.key === 'ArrowUp') d = -1;
        if (d) { e.preventDefault(); select(set, k + d, true); return; }
        if (e.key === 'Home') { e.preventDefault(); select(set, 0, true); }
        else if (e.key === 'End') { e.preventDefault(); select(set, tabs.length - 1, true); }
      });
    });
  });

  /* ---------------- stage stepper ---------------- */
  const stWrap = $('.db-st-wrap');
  if (stWrap) {
    const set = $('[data-db-tabs]', stWrap);
    const now = $('[data-st-now]', stWrap);
    const total = $$('[role=tab]', set).length;
    const paint = i => {
      stWrap.style.setProperty('--st', i / (total - 1));
      $$('[role=tab]', set).forEach((t, k) => t.classList.toggle('done', k < i));
      if (now) now.textContent = i + 1;
    };
    const list = $('[role=tablist]', set);
    set.addEventListener('dbtab', e => {
      paint(e.detail);
      if (list.scrollWidth > list.clientWidth + 2) {
        const t = $$('[role=tab]', set)[e.detail];
        const lr = list.getBoundingClientRect(), tr = t.getBoundingClientRect();
        list.scrollBy({ left: (tr.left + tr.width / 2) - (lr.left + lr.width / 2), behavior: reduce ? 'auto' : 'smooth' });
      }
    });
    $$('[data-st]', stWrap).forEach(b => b.addEventListener('click', () => {
      select(set, Math.max(0, Math.min(total - 1, current(set) + +b.dataset.st)), false);
    }));
    paint(0);
  }

  /* ---------------- countdown to 1 Jan 2035 (visitor clock) ---------------- */
  const cd = $('[data-countdown]');
  if (cd) {
    const target = new Date(2035, 0, 1, 0, 0, 0).getTime();
    const cells = { d: $('[data-cd=d]', cd), h: $('[data-cd=h]', cd), m: $('[data-cd=m]', cd), s: $('[data-cd=s]', cd) };
    const fmt = new Intl.NumberFormat('en-US', { minimumIntegerDigits: 2, useGrouping: false });
    const tick = () => {
      let t = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(t / 86400); t -= d * 86400;
      const h = Math.floor(t / 3600); t -= h * 3600;
      const m = Math.floor(t / 60); const s = t - m * 60;
      cells.d.textContent = d.toLocaleString('en-US');
      cells.h.textContent = fmt.format(h);
      cells.m.textContent = fmt.format(m);
      cells.s.textContent = fmt.format(s);
      cd.setAttribute('aria-label', 'Geri sayım: 1 Ocak 2035: ' + d + ' gün,' + h + ' saat');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- income orbit: 7 equal segments ---------------- */
  const inc = $('.db-inc');
  if (inc) {
    const svg = $('.db-ring', inc);
    const items = $$('.db-inc-item', inc);
    const n = items.length, cx = 100, cy = 100, r = 84, gap = 0.13;
    const pt = a => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const NS = 'http://www.w3.org/2000/svg';
    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
    track.setAttribute('class', 'db-ring-track');
    svg.appendChild(track);
    const arcs = items.map((_, k) => {
      // clockwise from the top; RTL reading starts top-right
      const a0 = (k / n) * Math.PI * 2 + gap, a1 = ((k + 1) / n) * Math.PI * 2 - gap;
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`);
      p.setAttribute('class', 'db-ring-seg');
      p.style.setProperty('--k', k);
      svg.appendChild(p);
      const am = (a0 + a1) / 2, lr = r - 24, lx = cx + lr * Math.sin(am), ly = cy - lr * Math.cos(am);
      const dot = document.createElementNS(NS, 'text');
      dot.setAttribute('x', lx.toFixed(2)); dot.setAttribute('y', ly.toFixed(2));
      dot.setAttribute('class', 'db-ring-num');
      dot.textContent = k + 1;
      svg.appendChild(dot);
      p.labelEl = dot;
      return p;
    });
    const num = $('[data-inc-num]', inc), txt = $('[data-inc-text]', inc);
    let active = 0;
    const show = k => {
      active = k;
      arcs.forEach((a, i) => { a.classList.toggle('on', i === k); a.labelEl.classList.toggle('on', i === k); });
      items.forEach((b, i) => b.setAttribute('aria-pressed', i === k ? 'true' : 'false'));
      num.textContent = items[k].querySelector('.db-inc-n').textContent;
      txt.textContent = items[k].lastElementChild.textContent;
    };
    items.forEach((b, k) => {
      b.addEventListener('click', () => show(k));
      b.addEventListener('mouseenter', () => show(k));
      b.addEventListener('focus', () => show(k));
    });
    show(0);
  }

  /* ---------------- field cycle: gentle auto highlight ---------------- */
  const cyc = $('[data-cycle]');
  if (cyc) {
    const steps = $$('.db-cyc-step', cyc);
    let i = 0, paused = false, timer = 0, ticks = 0;
    const on = k => steps.forEach((s, j) => s.classList.toggle('on', j === k));
    steps.forEach((s, k) => {
      s.addEventListener('mouseenter', () => { paused = true; on(k); });
      s.addEventListener('mouseleave', () => { paused = false; i = k; });
    });
    on(0);
    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => {
        clearInterval(timer);
        // two gentle loops at most, then it rests (WCAG 2.2.2); hover still highlights
        if (e.isIntersecting && ticks < steps.length * 2) timer = setInterval(() => {
          if (paused) return;
          i = (i + 1) % steps.length; on(i);
          if (++ticks >= steps.length * 2) clearInterval(timer);
        }, 2200);
      }), { threshold: 0.3 }).observe(cyc);
    }
  }

  /* ---------------- pointer glow on tiles ---------------- */
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('.db-tile').forEach(t => t.addEventListener('pointermove', e => {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      t.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    }));
  }
})();
