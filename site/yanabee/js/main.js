// Yanabee site shell: reveal, theme, nav, sheet, counters, rings, tabs, print.
// Classic script (no modules) so the site also works from file:// and plain static hosting.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onMQ = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));

  /* ---------------- reveal on scroll (first, so nothing stays hidden) ---------------- */
  root.classList.add('js');
  const revealSel = '.rv, [data-ring], .tl, [data-reveal]';
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$(revealSel).forEach(el => io.observe(el));
  } else {
    $$(revealSel).forEach(el => el.classList.add('in'));
  }
  // Stagger children of grids/lists that opt in.
  $$('[data-stagger]').forEach(g => [...g.children].forEach((c, i) => c.style.setProperty('--d', Math.min(i, 9) * 0.06 + 's')));
  window.__yanabeeReady = true;

  /* ---------------- theme ---------------- */
  const metaTheme = $('meta[name="theme-color"]');
  const syncMeta = () => { if (metaTheme) metaTheme.content = root.dataset.theme === 'dark' ? '#04131a' : '#f3f8f7'; };
  const setTheme = (t, persist) => {
    root.dataset.theme = t;
    if (persist) { try { localStorage.setItem('yanabee-theme', t); } catch (e) { /* storage blocked */ } }
    syncMeta();
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  };
  syncMeta();
  const toggleTheme = e => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (document.startViewTransition && !reduce) {
      // circular reveal growing out of the pressed button (falls back to the centre when called without an event)
      const b = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
      root.style.setProperty('--vt-x', (b ? b.left + b.width / 2 : innerWidth / 2) + 'px');
      root.style.setProperty('--vt-y', (b ? b.top + b.height / 2 : 0) + 'px');
      root.classList.add('vt-theme');
      const t = document.startViewTransition(() => setTheme(next, true));
      t.finished.finally(() => root.classList.remove('vt-theme'));
    } else setTheme(next, true);
  };
  $$('.theme-toggle').forEach(b => b.addEventListener('click', toggleTheme));
  onMQ(matchMedia('(prefers-color-scheme: dark)'), e => {
    let stored = null;
    try { stored = localStorage.getItem('yanabee-theme'); } catch (err) { /* ignore */ }
    if (!stored) setTheme(e.matches ? 'dark' : 'light', false);
  });
  window.YanabeeTheme = { get: () => root.dataset.theme, set: t => setTheme(t, true), toggle: toggleTheme };

  /* ---------------- navbar: sliding pills ---------------- */
  const links = $('.links');
  if (links) {
    const pA = $('.pill-active', links), pH = $('.pill-hover', links);
    const place = (pill, a) => {
      if (!a) { pill.style.opacity = 0; return; }
      const lr = links.getBoundingClientRect(), ar = a.getBoundingClientRect();
      const first = pill.style.opacity !== '1';
      if (first) pill.style.transition = 'none';
      pill.style.width = ar.width + 'px';
      pill.style.transform = `translateX(${ar.right - lr.right}px)`; // right-anchored (RTL)
      pill.style.opacity = 1;
      if (first) { void pill.offsetWidth; pill.style.transition = ''; }
    };
    const active = $('a.active', links);
    const placeActive = () => place(pA, active);
    requestAnimationFrame(placeActive);
    addEventListener('resize', placeActive);
    document.fonts && document.fonts.ready.then(placeActive);
    $$('a', links).forEach(a => a.addEventListener('mouseenter', () => {
      if (a !== active) place(pH, a); else pH.style.opacity = 0;
    }));
    links.addEventListener('mouseleave', () => { pH.style.opacity = 0; });
  }

  /* ---------------- scroll: progress bar, nav state, to-top ---------------- */
  const nav = $('.nav'), bar = $('.progress'), toTop = $('.totop');
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY, max = root.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (nav) {
      nav.classList.toggle('scrolled', y > 20);
      const busy = document.body.classList.contains('sheet-open') || nav.contains(document.activeElement);
      nav.classList.toggle('hide', y > lastY + 4 && y > 520 && !busy);
      if (y < lastY - 4) nav.classList.remove('hide');
    }
    if (toTop) toTop.classList.toggle('show', y > 800);
    window.dispatchEvent(new CustomEvent('yanabee:scroll', { detail: y }));
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  toTop && toTop.addEventListener('click', () => {
    scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const skip = $('.skip'); skip && skip.focus({ preventScroll: true });
  });

  /* ---------------- bottom sheet menu ---------------- */
  const sheet = $('.sheet');
  let lastFocus = null, hideTimer = 0;
  const behind = () => ['.skip', '.progress', '.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop'].map(q => $(q)).filter(Boolean);
  const openSheet = () => {
    if (!sheet) return;
    clearTimeout(hideTimer);
    lastFocus = document.activeElement;
    behind().forEach(el => { el.inert = true; });
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
    $$('.sheet-item', sheet).forEach((el, i) => { el.style.transitionDelay = (0.05 + i * 0.04) + 's'; });
    setTimeout(() => { const f = $('.sheet-item', sheet); f && f.focus({ preventScroll: true }); }, 240);
  };
  const closeSheet = (restore = true) => {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove('open');
    document.body.classList.remove('sheet-open');
    behind().forEach(el => { el.inert = false; });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { sheet.hidden = true; }, 380);
    if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  };
  $$('[data-open-sheet]').forEach(b => b.addEventListener('click', openSheet));
  $$('[data-close-sheet]').forEach(b => b.addEventListener('click', () => closeSheet()));
  // Opening chat/search from the sheet: close it without stealing focus back.
  // Restore focus to the sheet's opener first, so the overlay records it and returns focus there on close.
  sheet && $$('[data-open-chat], [data-open-search]', sheet).forEach(b => b.addEventListener('click', () => closeSheet(true), true));
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet(); });
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
      panel.style.transform = ''; y0 = null;
      if (dy > 90) closeSheet();
    });
  }

  /* ---------------- counters: <b data-to="1000">1,000</b> ---------------- */
  // The final text is already in the HTML (no-JS, search engines, content check);
  // we only animate the digits and always end on the original text.
  if (!reduce && 'IntersectionObserver' in window) {
    const fmt = (n, sep) => (sep ? n.toLocaleString('en-US') : String(n));
    const co = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const el = e.target, final = el.textContent, to = +el.dataset.to;
      if (!isFinite(to)) return;
      const sep = /,/.test(final), pre = el.dataset.pre || '', suf = el.dataset.suf || '';
      const t0 = performance.now(), dur = 1300;
      const step = t => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = pre + fmt(Math.round(to * (1 - Math.pow(1 - p, 3))), sep) + suf;
        if (p < 1) requestAnimationFrame(step); else el.textContent = final;
      };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    $$('[data-to]').forEach(el => co.observe(el));
  }

  /* ---------------- tabs: [data-tabs] > [role=tablist] > [role=tab][aria-controls] ---------------- */
  $$('[data-tabs]').forEach(box => {
    const tabs = $$('[role="tab"]', box);
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      box.dispatchEvent(new CustomEvent('tabchange', { detail: tab, bubbles: true }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', e => {
        // RTL: ArrowLeft moves forward, ArrowRight backward.
        const k = e.key;
        let j = null;
        if (k === 'ArrowLeft') j = (i + 1) % tabs.length;
        else if (k === 'ArrowRight') j = (i - 1 + tabs.length) % tabs.length;
        else if (k === 'Home') j = 0;
        else if (k === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
    const current = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
    current && select(current, false);
  });

  /* ---------------- in-page nav highlight: [data-spy] a[href^="#"] ---------------- */
  $$('[data-spy]').forEach(navEl => {
    const anchors = $$('a[href^="#"]', navEl);
    const targets = anchors.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const seen = new Map();
    const so = new IntersectionObserver(es => {
      es.forEach(e => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null, bestTop = Infinity;
      targets.forEach(t => {
        if (!seen.get(t.id)) return;
        const top = Math.abs(t.getBoundingClientRect().top);
        if (top < bestTop) { bestTop = top; best = t.id; }
      });
      if (!best) return;
      anchors.forEach(a => {
        const on = a.getAttribute('href') === '#' + best;
        a.classList.toggle('current', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.01] });
    targets.forEach(t => so.observe(t));
  });

  /* ---------------- print, open <details> when linked ---------------- */
  $$('[data-print]').forEach(b => b.addEventListener('click', () => {
    $$('details').forEach(d => { d.open = true; });
    $$('[role="tabpanel"]').forEach(p => { p.dataset.wasHidden = p.hidden ? '1' : ''; p.hidden = false; });
    window.print();
  }));
  addEventListener('afterprint', () => $$('[role="tabpanel"]').forEach(p => { if (p.dataset.wasHidden === '1') p.hidden = true; }));
  const openHash = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!el) return;
    const d = el.tagName === 'DETAILS' ? el : el.closest('details');
    if (d) d.open = true;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1800);
  };
  addEventListener('hashchange', openHash); openHash();
})();
