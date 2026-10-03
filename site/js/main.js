(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------------- theme ---------------- */
  const metaTheme = $('meta[name="theme-color"]');
  const syncMeta = () => { if (metaTheme) metaTheme.content = root.dataset.theme === 'dark' ? '#09111b' : '#f7f4ec'; };
  const setTheme = (t, persist) => {
    root.dataset.theme = t;
    if (persist) { try { localStorage.setItem('takamul-theme', t); } catch (e) { /* storage blocked */ } }
    syncMeta();
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  syncMeta();
  $$('.theme-toggle').forEach(b => b.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (document.startViewTransition && !reduce) document.startViewTransition(() => setTheme(next, true));
    else setTheme(next, true);
  }));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    let stored = null;
    try { stored = localStorage.getItem('takamul-theme'); } catch (err) { /* ignore */ }
    if (!stored) setTheme(e.matches ? 'dark' : 'light', false);
  });

  /* ---------------- greeting ---------------- */
  const h = new Date().getHours();
  const greet = h >= 5 && h < 12 ? 'صباح الخير' : h >= 12 && h < 18 ? 'نهارك سعيد' : 'مساء الخير';
  $$('[data-greet]').forEach(el => { el.textContent = greet; });

  /* ---------------- navbar: sliding pills ---------------- */
  const links = $('.links');
  if (links) {
    const pA = $('.pill-active', links), pH = $('.pill-hover', links);
    const place = (pill, a) => {
      if (!a) { pill.style.opacity = 0; return; }
      const lr = links.getBoundingClientRect(), ar = a.getBoundingClientRect();
      pill.style.width = ar.width + 'px';
      pill.style.transform = `translateX(${ar.left - lr.left}px)`;
      pill.style.insetInlineStart = 'auto';
      pill.style.left = '0';
      pill.style.opacity = 1;
    };
    const active = $('a.active', links);
    const placeActive = () => place(pA, active);
    requestAnimationFrame(placeActive);
    addEventListener('resize', placeActive);
    document.fonts && document.fonts.ready.then(placeActive);
    $$('a', links).forEach(a => {
      a.addEventListener('mouseenter', () => { if (a !== active) place(pH, a); else pH.style.opacity = 0; });
    });
    links.addEventListener('mouseleave', () => { pH.style.opacity = 0; });
  }

  /* ---------------- scroll: progress, nav state ---------------- */
  const nav = $('.nav'), bar = $('.progress'), toTop = $('.totop');
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (nav) {
      nav.classList.toggle('scrolled', y > 20);
      nav.classList.toggle('hide', y > lastY && y > 500 && !document.body.classList.contains('sheet-open'));
    }
    if (toTop) toTop.classList.toggle('show', y > 700);
    const tl = $('.timeline');
    if (tl) {
      const r = tl.getBoundingClientRect();
      const p = Math.min(Math.max((innerHeight * 0.65 - r.top) / r.height, 0), 1);
      $('.tl-fill', tl).style.height = (p * 100) + '%';
    }
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  toTop && toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  /* ---------------- bottom sheet menu ---------------- */
  const sheet = $('.sheet');
  let lastFocus = null;
  const openSheet = () => {
    if (!sheet) return;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
    $$('.sheet-item', sheet).forEach((el, i) => { el.style.transitionDelay = (0.05 + i * 0.035) + 's'; });
    setTimeout(() => { const f = $('.sheet-item', sheet); f && f.focus({ preventScroll: true }); }, 250);
  };
  const closeSheet = () => {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('open');
    document.body.classList.remove('sheet-open');
    setTimeout(() => { sheet.hidden = true; }, 380);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  };
  $$('[data-open-sheet]').forEach(b => b.addEventListener('click', openSheet));
  $$('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheet));
  sheet && $$('[data-open-chat]', sheet).forEach(b => b.addEventListener('click', closeSheet));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  // swipe down to close
  if (sheet) {
    const panel = $('.sheet-panel', sheet);
    let y0 = null;
    panel.addEventListener('touchstart', e => { if (panel.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchmove', e => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    panel.addEventListener('touchend', e => {
      if (y0 === null) return;
      const dy = e.changedTouches[0].clientY - y0;
      panel.style.transform = '';
      y0 = null;
      if (dy > 90) closeSheet();
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  root.classList.add('js');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.rv, .tl').forEach(el => io.observe(el));
  $$('.grid, .toc-grid, .faq-list, .mini-steps, .cycle').forEach(g =>
    [...g.children].forEach((c, i) => c.style.setProperty('--d', Math.min(i, 8) * 0.07 + 's')));

  /* ---------------- counters ---------------- */
  if (!reduce) {
    const co = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const el = e.target, to = +el.dataset.to, from = Math.max(0, to - 60), t0 = performance.now();
      const step = t => {
        const p = Math.min((t - t0) / 1400, 1);
        el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    $$('[data-to]').forEach(el => co.observe(el));
  }

  /* ---------------- 3D tilt ---------------- */
  if (finePointer && !reduce) {
    $$('.tilt').forEach(el => {
      let raf = 0;
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.classList.add('tilting');
          el.style.transition = 'transform .12s ease-out';
          el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 10}deg) translateZ(6px)`;
          el.style.setProperty('--gx', x * 100 + '%');
          el.style.setProperty('--gy', y * 100 + '%');
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        el.classList.remove('tilting');
        el.style.transition = 'transform .6s cubic-bezier(.22,.8,.24,1)';
        el.style.transform = '';
      });
    });
  }

  /* ---------------- FAQ search ---------------- */
  const search = $('[data-faq-search]');
  if (search) {
    const items = $$('.qa'), empty = $('.faq-empty');
    const norm = s => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
    search.addEventListener('input', () => {
      const q = norm(search.value.trim());
      let shown = 0;
      items.forEach(d => {
        const hit = !q || norm(d.textContent).includes(q);
        d.hidden = !hit;
        if (hit) shown++;
        if (q && hit) d.open = true;
      });
      if (empty) empty.hidden = shown > 0;
    });
  }

  /* ---------------- open details when linked ---------------- */
  const openHash = () => {
    const t = location.hash && document.getElementById(location.hash.slice(1));
    if (t && t.tagName === 'DETAILS') t.open = true;
  };
  addEventListener('hashchange', openHash); openHash();
})();
