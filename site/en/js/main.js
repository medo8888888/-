(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onMQ = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));

  /* ---------------- reveal on scroll (set up first) ---------------- */
  root.classList.add('js');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.rv, .tl').forEach(el => io.observe(el));
  } else {
    $$('.rv, .tl').forEach(el => el.classList.add('in'));
  }
  $$('.grid, .toc-grid, .faq-list, .mini-steps, .cycle, .pgrid, .ways, .stats, .stages, .values, .vm').forEach(g =>
    [...g.children].forEach((c, i) => c.style.setProperty('--d', Math.min(i, 8) * 0.07 + 's')));
  window.__takamulReady = true;
  // desktop mega menu: hover (with delay) + click + keyboard
  $$('.mgroup').forEach(g => {
    const btn = $('.mtop', g); let t = 0;
    const set = o => { g.classList.toggle('open', o); btn.setAttribute('aria-expanded', o); };
    const closeOthers = () => $$('.mgroup.open').forEach(o => { if (o !== g) { o.classList.remove('open'); $('.mtop', o).setAttribute('aria-expanded', 'false'); } });
    g.addEventListener('mouseenter', () => { clearTimeout(t); closeOthers(); set(true); });
    g.addEventListener('mouseleave', () => { t = setTimeout(() => set(false), 180); });
    btn.addEventListener('click', () => { closeOthers(); set(!g.classList.contains('open')); });
    g.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });
    g.addEventListener('focusout', e => { if (!g.contains(e.relatedTarget)) set(false); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.mgroup')) $$('.mgroup.open').forEach(o => { o.classList.remove('open'); $('.mtop', o).setAttribute('aria-expanded', 'false'); }); });
  // phones/tablets: keep the current page visible in the scrollable page bar
  const activeLink = $('.links a.active');
  if (activeLink && innerWidth <= 1260) {
    const bar = activeLink.parentElement;
    bar.scrollLeft = activeLink.offsetLeft - (bar.clientWidth - activeLink.offsetWidth) / 2;
  }

  /* ---------------- theme ---------------- */
  const metaTheme = $('meta[name="theme-color"]');
  const syncMeta = () => { if (metaTheme) metaTheme.content = root.dataset.theme === 'dark' ? '#05070a' : '#ffffff'; };
  const setTheme = (t, persist) => {
    root.dataset.theme = t;
    if (persist) { try { localStorage.setItem('takamul-theme-v2', t); } catch (e) { /* storage blocked */ } }
    syncMeta();
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  syncMeta();
  const toggleTheme = () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (document.startViewTransition && !reduce) document.startViewTransition(() => setTheme(next, true));
    else setTheme(next, true);
  };
  window.TakamulTheme = { // programmatic API applies immediately (no view-transition delay)
    get: () => root.dataset.theme,
    set: t => { if (t === 'light' || t === 'dark') setTheme(t, true); },
    toggle: () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true),
  };
  $$('.theme-toggle').forEach(b => b.addEventListener('click', toggleTheme));
  onMQ(matchMedia('(prefers-color-scheme: dark)'), e => {
    let stored = null;
    try { stored = localStorage.getItem('takamul-theme-v2'); } catch (err) { /* ignore */ }
    if (!stored) setTheme('light', false);
  });

  /* ---------------- greeting ---------------- */
  const h = new Date().getHours();
  const greet = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening';
  $$('[data-greet]').forEach(el => { el.textContent = greet; });

  /* ---------------- navbar: sliding pills ---------------- */
  const links = $('.links');
  if (links) {
    const pA = $('.pill-active', links), pH = $('.pill-hover', links);
    const place = (pill, a) => {
      if (!a) { pill.style.opacity = 0; return; }
      const lr = links.getBoundingClientRect(), ar = a.getBoundingClientRect();
      const first = pill.style.opacity !== '1';
      if (first) pill.style.transition = 'none'; // appear in place, don't sweep in
      pill.style.width = ar.width + 'px';
      pill.style.transform = `translateX(${ar.left - lr.left}px)`;
      pill.style.opacity = 1;
      if (first) { void pill.offsetWidth; pill.style.transition = ''; }
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
    const fill = tl && $('.tl-fill', tl);
    if (fill) {
      const r = tl.getBoundingClientRect();
      const p = Math.min(Math.max((innerHeight * 0.65 - r.top) / r.height, 0), 1);
      fill.style.height = (p * 100) + '%';
    }
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  toTop && toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  /* ---------------- bottom sheet menu ---------------- */
  const sheet = $('.sheet');
  let lastFocus = null, hideTimer = 0;
  const behindSheet = () => ['.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop'].map(q => $(q)).filter(Boolean);
  const openSheet = () => {
    if (!sheet) return;
    clearTimeout(hideTimer);
    lastFocus = document.activeElement;
    behindSheet().forEach(el => { el.inert = true; });
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
    behindSheet().forEach(el => { el.inert = false; });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { sheet.hidden = true; }, 380);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  };
  $$('[data-open-sheet]').forEach(b => b.addEventListener('click', openSheet));
  $$('[data-close-sheet]').forEach(b => b.addEventListener('click', closeSheet));
  sheet && $$('[data-open-chat]', sheet).forEach(b => b.addEventListener('click', closeSheet));
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet(); });
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
    panel.addEventListener('touchcancel', () => { panel.style.transform = ''; y0 = null; });
    panel.addEventListener('touchend', e => {
      if (y0 === null) return;
      const dy = e.changedTouches[0].clientY - y0;
      panel.style.transform = '';
      y0 = null;
      if (dy > 90) closeSheet();
    });
  }

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

  /* ---------------- hero slider ---------------- */
  const slider = $('[data-slider]');
  if (slider) {
    const slides = $$('.slide', slider), dots = $$('.dot', slider);
    const MS = 6500;
    slider.style.setProperty('--slide-ms', MS + 'ms');
    let cur = 0, timer = 0;
    const show = i => {
      cur = (i + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('is-on', k === cur); s.setAttribute('aria-hidden', k === cur ? 'false' : 'true'); });
      dots.forEach((d, k) => { d.classList.remove('is-on'); if (k === cur) { void d.offsetWidth; d.classList.add('is-on'); } d.setAttribute('aria-selected', k === cur); });
      $$('a, button', slider).forEach(el => { if (el.closest('.slide')) el.tabIndex = el.closest('.slide').classList.contains('is-on') ? 0 : -1; });
    };
    const play = () => { clearInterval(timer); if (!reduce) timer = setInterval(() => show(cur + 1), MS); slider.classList.remove('paused'); };
    const pause = () => { clearInterval(timer); slider.classList.add('paused'); };
    dots.forEach(d => d.addEventListener('click', () => { show(+d.dataset.go); play(); }));
    const prev = $('[data-prev]', slider), next = $('[data-next]', slider);
    const rtl = root.dir !== 'ltr';
    prev && prev.addEventListener('click', () => { show(cur - 1); play(); });
    next && next.addEventListener('click', () => { show(cur + 1); play(); });
    slider.addEventListener('mouseenter', pause); slider.addEventListener('mouseleave', play);
    slider.addEventListener('focusin', pause); slider.addEventListener('focusout', play);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
    let x0 = null;
    slider.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 45) { show(cur + ((dx > 0) === rtl ? 1 : -1)); play(); }
    });
    show(0); play();
  }

  /* ---------------- program filter tabs ---------------- */
  $$('.filter-tabs').forEach(tabs => {
    const grid = tabs.parentElement.querySelector('[data-filter-grid]');
    if (!grid) return;
    $$('.ft', tabs).forEach(b => b.addEventListener('click', () => {
      $$('.ft', tabs).forEach(x => x.classList.toggle('is-on', x === b));
      const f = b.dataset.filter;
      $$('.pcard', grid).forEach(c => {
        const hide = f !== 'all' && c.dataset.kind !== f;
        c.classList.toggle('is-hidden', hide);
        if (!hide && !reduce) c.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.22,.8,.24,1)' });
      });
    }));
  });

  /* ---------------- quick donate → support page, pre-filled ---------------- */
  const qd = $('[data-quick-donate]');
  if (qd) qd.addEventListener('submit', e => {
    e.preventDefault();
    const custom = qd.elements.amount_custom.value.trim();
    const preset = (qd.querySelector('[name=amount]:checked') || {}).value || '';
    const q = new URLSearchParams({ amount: custom || preset, program: qd.elements.program.value });
    location.href = qd.getAttribute('action') + '?' + q + '#donate';
  });
  if (qd) qd.elements.amount_custom.addEventListener('input', () => { if (qd.elements.amount_custom.value) $$('[name=amount]', qd).forEach(r => { r.checked = false; }); });

  /* ---------------- stage line draws when visible ---------------- */
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('drawn'); so.unobserve(e.target); } }), { threshold: 0.3 });
    $$('.stages').forEach(el => { so.observe(el); $$('.st-n', el).forEach((n, i) => n.style.setProperty('--i', i)); });
  }

  /* ---------------- pointer spotlight on cards + parallax ---------------- */
  if (finePointer && !reduce) {
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.pcard, .way, .stat, .vm-card');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }
  if (!reduce) {
    const par = $$('.journey, .hero-small');
    if (par.length) {
      let pt = false;
      const upd = () => {
        par.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          el.style.setProperty('--py', ((r.top + r.height / 2 - innerHeight / 2) * -0.12).toFixed(1));
        });
        pt = false;
      };
      addEventListener('scroll', () => { if (!pt) { pt = true; requestAnimationFrame(upd); } }, { passive: true });
      upd();
    }
  }

  /* ---------------- first-visit intro (logo bloom, curtain lifts) ---------------- */
  if (!reduce && document.body.dataset.page === 'index.html') {
    let seen = false;
    try { seen = sessionStorage.getItem('takamul-intro') === '1'; sessionStorage.setItem('takamul-intro', '1'); } catch (e) { seen = true; }
    if (!seen) {
      const logo = $('.brand img');
      const cur = document.createElement('div');
      cur.className = 'intro-curtain'; cur.setAttribute('aria-hidden', 'true');
      cur.innerHTML = `<img src="${logo ? logo.getAttribute('src') : 'assets/logo.png'}" alt="">`;
      document.body.appendChild(cur);
      setTimeout(() => cur.remove(), 1900);
    }
  }

  /* ---------------- open details when linked ---------------- */
  const openHash = () => {
    const t = location.hash && document.getElementById(location.hash.slice(1));
    if (t && t.tagName === 'DETAILS') t.open = true;
  };
  addEventListener('hashchange', openHash); openHash();
})();
