// Home: the swipe carousel of the teams and its detail sheet (classic script, no dependencies).
//
//  carousel  A native scroll-snap row (CSS). Touch is purely native. This file adds: the mouse drag (grab cursor, snap on release,
//            click-vs-drag), the distance scale/fade (scroll-linked, transform + opacity only, one rAF-throttled handler that only
//            runs while the row is on screen), prev/next buttons, a segment indicator that navigates, keyboard arrows, deep links.
//  sheet     Tapping a card opens a detail sheet that grows out of the card (FLIP: the sheet surface is clipped to the card's
//            rectangle with clip-path: inset() and opens to inset(0); the artwork is translated/scaled; text only fades), shows the
//            verbatim detail (from the hidden markup of the card) with sliding segmented tabs, and is dismissed by Esc, backdrop,
//            the close button or a drag-down that tracks the finger 1:1. Page scroll is locked only while it is open.
// The page never scrolls by script: no wheel/touch listeners on the page, nothing pinned. Every optional neighbour
// (window.YanabeeApp / YanabeeWow) is called only if present. RTL: scrollLeft is signed, so positions are always taken
// from getBoundingClientRect relative to the scroller.
(() => {
  'use strict';
  const root = document.querySelector('[data-gallery]');
  if (!root) return;
  const doc = document, html = doc.documentElement;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const scroller = $('[data-scroller]');
  const items = scroller ? $$('.tg-item', scroller) : [];
  const N = items.length;
  if (!scroller || N < 2) return;
  const cards = items.map(li => $('.tg-card', li));
  const dots = $$('.tg-dot');
  const prevB = $('[data-prev]'), nextB = $('[data-next]');
  const tpl = $('template[data-sheet-tpl]');

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mqR = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqR.matches;
  const onMQ = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));
  const app = () => window.YanabeeApp;
  const buzz = (kind, ms) => {
    try {
      const a = app();
      if (a && a.haptic) a.haptic(kind);
      else if (navigator.vibrate) navigator.vibrate(ms || 8);
    } catch (e) { /* haptics are optional */ }
  };
  const SPRING_FB = 'cubic-bezier(.22,.8,.24,1)';
  const spring = () => { // the shell's linear() spring when it exists and is supported, else the cubic-bezier it falls back to
    try {
      const v = getComputedStyle(html).getPropertyValue('--spring').trim();
      if (v && /^linear\(/.test(v) && window.CSS && CSS.supports('animation-timing-function', v)) return v;
    } catch (e) { /* fall through */ }
    return SPRING_FB;
  };

  /* ------------------------------------------------------------ carousel ------------------------------------------------------------ */
  let idx = 0, pitch = 380, inView = false, moving = false, programmatic = false, settleT = 0, rafP = 0;
  let dragging = false, releasing = false;
  const vis = new Map();

  const centerDelta = i => { // signed physical distance (px) from the scroller's centre to card i's centre
    const sr = scroller.getBoundingClientRect(), r = items[i].getBoundingClientRect();
    return (r.left + r.width / 2) - (sr.left + sr.width / 2);
  };
  const nearest = () => {
    const sr = scroller.getBoundingClientRect(), c = sr.left + sr.width / 2;
    let best = 0, bd = Infinity;
    items.forEach((li, i) => { const r = li.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - c); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const setIdx = i => {
    idx = i;
    dots.forEach((d, k) => { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    const had = doc.activeElement === prevB || doc.activeElement === nextB ? doc.activeElement : null; // read before disabling: the browser moves focus away from a disabled button
    if (prevB) prevB.disabled = i <= 0;
    if (nextB) nextB.disabled = i >= N - 1;
    if (had && had.disabled) { const other = had === prevB ? nextB : prevB; if (other && !other.disabled) other.focus({ preventScroll: true }); } // hand the focus to the other one
  };

  // scroll-linked scale / opacity by distance from the centre (never changes layout)
  const paint = () => {
    rafP = 0;
    if (!inView) return;
    if (reduced()) { clearEffect(); return; }
    const sr = scroller.getBoundingClientRect(), c = sr.left + sr.width / 2;
    const rs = items.map(li => li.getBoundingClientRect()); // read everything first, then write
    items.forEach((li, i) => {
      const r = rs[i], a = Math.min(1, Math.abs(r.left + r.width / 2 - c) / pitch);
      const s = (1 - 0.06 * a).toFixed(3), o = (1 - 0.28 * a).toFixed(3);
      if (li._s !== s) { li._s = s; li.style.transform = `scale(${s})`; }
      if (li._o !== o) { li._o = o; li.style.opacity = o; }
    });
  };
  const clearEffect = () => items.forEach(li => { li.style.transform = ''; li.style.opacity = ''; li._s = li._o = ''; });
  const schedulePaint = () => { if (!rafP && inView) rafP = requestAnimationFrame(paint); };
  const measure = () => {
    const a = items[0].offsetLeft, b = items[1].offsetLeft;
    pitch = Math.abs(b - a) || items[0].offsetWidth + 16;
  };

  // scroll end: the native event where it exists, else a short quiet period (also covers programmatic scrolls that do not move)
  const settled = () => {
    clearTimeout(settleT);
    moving = false; programmatic = false;
    scroller.classList.remove('is-moving');
    if (releasing) { releasing = false; scroller.classList.remove('dragging'); }
    if (!dragging) setIdx(nearest());
    schedulePaint();
  };
  const quiet = (ms = 160) => { clearTimeout(settleT); settleT = setTimeout(settled, ms); };
  scroller.addEventListener('scroll', () => {
    if (!moving) { moving = true; scroller.classList.add('is-moving'); }
    schedulePaint();
    quiet(releasing || programmatic ? 220 : 160);
  }, { passive: true });
  scroller.addEventListener('scrollend', () => { if (!dragging) settled(); });

  const goTo = (i, behavior) => {
    i = clamp(i, 0, N - 1);
    const left = scroller.scrollLeft + centerDelta(i);
    setIdx(i);
    programmatic = true;
    scroller.scrollTo({ left, behavior: behavior === 'instant' || reduced() ? 'instant' : 'smooth' });
    quiet(260);
  };

  // active card from visibility (IntersectionObserver rooted at the scroller, threshold .6) while the user swipes
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(en => vis.set(en.target, en.intersectionRatio));
      if (programmatic || dragging || releasing) return;
      const sr = scroller.getBoundingClientRect(), c = sr.left + sr.width / 2;
      let best = -1, bd = Infinity;
      items.forEach((li, i) => {
        if ((vis.get(li) || 0) < 0.6) return;
        const r = li.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - c);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0 && best !== idx) setIdx(best);
    }, { root: scroller, threshold: [0, 0.6, 1] });
    items.forEach(li => io.observe(li));
    new IntersectionObserver(es => es.forEach(en => { inView = en.isIntersecting; if (inView) { measure(); schedulePaint(); } }), { rootMargin: '120px 0px' }).observe(root);
  } else inView = true;

  // controls
  prevB && prevB.addEventListener('click', () => { goTo(idx - 1); buzz('tick', 6); });
  nextB && nextB.addEventListener('click', () => { goTo(idx + 1); buzz('tick', 6); });
  dots.forEach(d => d.addEventListener('click', () => { goTo(+d.dataset.go); buzz('tick', 6); }));

  // keyboard (RTL: ArrowLeft = next). A focused card keeps the focus while the row follows it.
  scroller.tabIndex = 0;
  scroller.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const at = cards.indexOf(doc.activeElement), cur = at >= 0 ? at : idx;
    let j;
    if (e.key === 'ArrowLeft') j = cur + 1;
    else if (e.key === 'ArrowRight') j = cur - 1;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = N - 1;
    else return;
    e.preventDefault();
    j = clamp(j, 0, N - 1);
    if (at >= 0) cards[j].focus({ preventScroll: true });
    goTo(j);
  });
  scroller.addEventListener('focusin', e => { // keyboard focus on a card brings it to the centre
    const c = e.target.closest && e.target.closest('.tg-card');
    const i = c ? cards.indexOf(c) : -1;
    if (i < 0) return;
    let kb = true;
    try { kb = e.target.matches(':focus-visible'); } catch (err) { kb = true; }
    if (kb && Math.abs(centerDelta(i)) > 4) goTo(i);
  });

  /* ------------------------------------------------------------ mouse drag ------------------------------------------------------------ */
  let drag = null, suppress = false, suppressT = 0;
  scroller.addEventListener('dragstart', e => e.preventDefault());
  scroller.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, left0: scroller.scrollLeft, moved: false, s: [{ t: e.timeStamp, x: e.clientX }] };
  });
  scroller.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved) {
      if (Math.abs(dx) <= 6) return;
      drag.moved = true; dragging = true; releasing = false;
      clearTimeout(settleT);
      scroller.classList.add('dragging', 'is-moving');
      try { scroller.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      drag.left0 = scroller.scrollLeft; // a smooth scroll still running is taken over from where it is
    }
    scroller.scrollLeft = drag.left0 - (e.clientX - drag.x0);
    drag.s.push({ t: e.timeStamp, x: e.clientX });
    if (drag.s.length > 8) drag.s.shift();
  });
  const endDrag = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    dragging = false;
    suppress = true; clearTimeout(suppressT); suppressT = setTimeout(() => { suppress = false; }, 80);
    try { scroller.releasePointerCapture(d.id); } catch (err) { /* ignore */ }
    // choose the target card from the position plus ~150 ms of the release velocity
    const now = e && e.timeStamp ? e.timeStamp : performance.now();
    const recent = d.s.filter(p => now - p.t <= 100); // only the last ~100 ms before the release count: a pause means no velocity
    const v = recent.length > 1 && now - recent[recent.length - 1].t <= 60 && recent[recent.length - 1].t > recent[0].t
      ? (recent[recent.length - 1].x - recent[0].x) / (recent[recent.length - 1].t - recent[0].t) : 0; // px/ms, + = pointer moving right
    const cur = scroller.scrollLeft, proj = cur - v * 150;
    const tg = items.map((li, i) => cur + centerDelta(i));
    const pick = p => tg.reduce((b, x, i) => (Math.abs(x - p) < Math.abs(tg[b] - p) ? i : b), 0);
    const base = pick(cur);
    let to = pick(proj);
    if (to === base && Math.abs(v) > 0.35) { // a flick that did not reach the next card still advances one
      const step = tg.length > 1 && tg[1] < tg[0] ? 1 : -1; // RTL: later cards have smaller scrollLeft
      to = clamp(base + (v > 0 ? step : -step), 0, N - 1);
    }
    releasing = true; programmatic = true;
    setIdx(to);
    scroller.scrollTo({ left: tg[to], behavior: reduced() ? 'instant' : 'smooth' });
    quiet(400); // .dragging is removed on scrollend, this timer is the fallback
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('lostpointercapture', endDrag);
  root.addEventListener('click', e => { // a drag must not open the card it ended on
    if (!suppress) return;
    e.preventDefault(); e.stopPropagation(); suppress = false;
  }, true);

  /* ------------------------------------------------------------ deep link (#g-t3) ------------------------------------------------------------ */
  const fromHash = behavior => {
    const m = location.hash.match(/^#g-(t[1-7]|s3)$/);
    if (!m) return false;
    const i = items.findIndex(li => li.id === 'g-' + m[1]);
    if (i < 0) return false;
    goTo(i, behavior);
    return true;
  };
  addEventListener('hashchange', () => fromHash('smooth'));

  /* ------------------------------------------------------------ detail sheet ------------------------------------------------------------ */
  const S = { el: null, open: false, closing: false, i: -1, card: null, anims: [], inert: [], tab: 0, drag: null };

  const CARD_R = '28px 28px 28px 28px';
  const ARCH_R = '50% 50% 20px 20px / 66.66% 66.66% 20px 20px'; // the arched photo of the card
  const BANNER_R = '20px 20px 20px 20px / 20px 20px 20px 20px';
  const restRound = () => (innerWidth >= 760 ? '26px 26px 26px 26px' : '26px 26px 0px 0px');
  const insetOf = (r, pr, round) =>
    `inset(${(r.top - pr.top).toFixed(1)}px ${(pr.right - r.right).toFixed(1)}px ${(pr.bottom - r.bottom).toFixed(1)}px ${(r.left - pr.left).toFixed(1)}px round ${round})`;
  const copyInto = (dst, src) => dst.replaceChildren(...[...src.childNodes].map(n => n.cloneNode(true)));
  const animate = (el, kf, opt) => {
    if (!el.animate) return null;
    try { const a = el.animate(kf, opt); S.anims.push(a); return a; } catch (e) { return null; }
  };
  const cancelAnims = () => { S.anims.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } }); S.anims = []; };
  const otherOverlay = () => !!doc.querySelector('.search:not([hidden]), .chat:not([hidden]), .sheet:not([hidden])');
  const slot = n => $(`[data-slot="${n}"]`, S.el);

  const build = () => {
    if (S.el || !tpl) return !!S.el;
    S.el = tpl.content.firstElementChild.cloneNode(true);
    S.scrim = $('.tsheet-scrim', S.el); S.panel = $('.tsheet-panel', S.el); S.top = $('.tsheet-top', S.el); S.body = $('.tsheet-body', S.el);
    S.text = $('.tsheet-text', S.el); S.art = slot('art'); S.artIn = slot('art-in'); S.seg = slot('tabs'); S.ind = $('.seg-ind', S.seg); S.panels = slot('panels');
    S.x = $('.tsheet-x', S.el);
    doc.body.appendChild(S.el);
    $$('[data-close]', S.el).forEach(b => b.addEventListener('click', () => close()));
    S.el.addEventListener('keydown', e => { if (e.key === 'Tab') trap(e); });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (S.open) placeInd(false); }).observe(S.seg);
      new ResizeObserver(() => { if (S.open) placeArt(); }).observe(S.art);
    }
    wireDrag();
    return true;
  };

  const fill = i => {
    const li = items[i], card = cards[i], det = $('.tg-detail', li);
    S.el.style.setProperty('--tc', li.style.getPropertyValue('--tc') || 'var(--brand)');
    slot('ic').replaceChildren($('.tg-ic .i', card).cloneNode(true));
    copyInto(slot('title'), $('.tg-title', card));
    const sub = $('.tg-sub', card) || $('.tg-kick', card);
    if (sub) copyInto(slot('sub'), sub); else slot('sub').replaceChildren();
    slot('sub').classList.toggle('is-kick', !$('.tg-sub', card) && !!sub); // a kicker («ثالثاً») reads before the title, a sub-title after it
    const img = $('.tg-photo .ph', card);
    S.artIn.replaceChildren();
    if (img) { const c = img.cloneNode(); c.loading = 'eager'; c.removeAttribute('width'); c.removeAttribute('height'); S.artIn.append(c, $('.tg-tint', card).cloneNode()); }
    const work = $('.tg-d-work', det);
    if (work) copyInto(slot('work'), work); else slot('work').replaceChildren();
    // tabs + panels from the three impact lines
    $$('[role=tab], .tg-tp', S.el).forEach(n => n.remove());
    const lines = $$('.tg-d-i', det);
    S.seg.setAttribute('aria-label', det.dataset.tabsLabel || '');
    S.tabs = lines.map((p, k) => {
      const lab = $('.tg-d-l', p).textContent.replace(/:\s*$/, '').trim();
      const tab = doc.createElement('button');
      tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.id = 'tsheet-tab' + k; tab.setAttribute('aria-controls', 'tsheet-p' + k);
      const ico = $('.tg-d-ic .i', p);
      if (ico) tab.append(ico.cloneNode(true));
      const sp = doc.createElement('span'); sp.textContent = lab; tab.append(sp);
      tab.addEventListener('click', () => selectTab(k, false));
      tab.addEventListener('keydown', e => {
        let j = null; // RTL: ArrowLeft = next
        if (e.key === 'ArrowLeft') j = (k + 1) % lines.length;
        else if (e.key === 'ArrowRight') j = (k - 1 + lines.length) % lines.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = lines.length - 1;
        if (j !== null) { e.preventDefault(); selectTab(j, true); }
      });
      S.seg.append(tab);
      const pn = doc.createElement('div');
      pn.className = 'tg-tp'; pn.id = 'tsheet-p' + k; pn.setAttribute('role', 'tabpanel'); pn.setAttribute('aria-labelledby', tab.id); pn.hidden = true;
      copyInto(pn, $('.tg-d-b', p));
      S.panels.append(pn);
      return tab;
    });
    S.pn = $$('.tg-tp', S.panels);
    S.seg.classList.remove('is-set');
    S.tab = 0;
    selectTab(0, false, false);
    // details link (the card's own target)
    const more = $('.tg-d-more', det), foot = slot('more');
    foot.replaceChildren();
    if (more) {
      const a = doc.createElement('a');
      a.className = 'btn btn-primary tsheet-more'; a.href = more.getAttribute('href'); copyInto(a, more);
      const arrow = $('.tg-go .i', card); if (arrow) a.append(arrow.cloneNode(true));
      foot.append(a);
    }
    S.body.scrollTop = 0;
  };

  const placeInd = animateIt => {
    const t = S.tabs && S.tabs[S.tab];
    if (!t || !t.offsetWidth) return;
    S.ind.style.setProperty('--iw', t.offsetWidth + 'px');
    S.ind.style.setProperty('--ix', t.offsetLeft + 'px');
    if (animateIt) S.seg.classList.add('is-set'); // the first placement jumps, the following ones slide
  };
  const selectTab = (k, focus, animateIt = true) => {
    const old = S.tab; S.tab = k;
    S.tabs.forEach((t, j) => { t.setAttribute('aria-selected', j === k ? 'true' : 'false'); t.tabIndex = j === k ? 0 : -1; });
    S.pn.forEach((p, j) => { p.hidden = j !== k; });
    placeInd(animateIt);
    if (animateIt && old !== k && !reduced()) { // 160 ms fade + 8 px slide in the direction of the index change
      const dir = k > old ? 1 : -1;
      const a = S.pn[k].animate([{ opacity: 0, transform: `translateX(${8 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
      void a;
      buzz('select', 5);
    }
    if (focus) S.tabs[k].focus();
  };

  const lock = () => html.classList.add('tsheet-open');
  const unlock = () => html.classList.remove('tsheet-open');
  const setInert = on => {
    if (on) {
      S.inert = [];
      [...doc.body.children].forEach(el => {
        if (el === S.el || el.matches('script,link,style,template,noscript,canvas,[aria-live],[class*="toast"],.sheet,.search,.chat') || el.hasAttribute('inert')) return;
        el.setAttribute('inert', ''); S.inert.push(el);
      });
    } else { S.inert.forEach(el => el.removeAttribute('inert')); S.inert = []; }
  };
  const trap = e => {
    if (!S.el.contains(doc.activeElement)) return;
    const f = $$('a[href],button:not(:disabled):not([tabindex="-1"]),[tabindex="0"]', S.panel).filter(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
    if (!f.length) return;
    const a = doc.activeElement, first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (a === first || a === S.panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  };
  const onKey = e => {
    if (!S.open || e.key !== 'Escape' || e.defaultPrevented || otherOverlay()) return;
    e.preventDefault(); close();
  };

  // The banner shows the middle of a 4:3 image box (the same box the card's arched photo is): size and centre it.
  const placeArt = () => {
    const w = S.art.clientWidth, h = S.art.clientHeight;
    if (!w) return;
    const ih = Math.max(h, w * 0.75);
    S.artIn.style.blockSize = ih.toFixed(1) + 'px';
    S.artIn.style.top = ((h - ih) / 2).toFixed(1) + 'px';
  };
  // Geometry of the shared element for the card S.card: the card's photo (arch) <-> the sheet's banner. The banner's image box
  // is moved with translate + uniform scale (it has the card photo's aspect, so nothing is stretched) and its frame is cropped
  // with an animated clip-path from the arch to the rounded banner. Measured with no animation running.
  const sharedGeom = () => {
    const cp = $('.tg-photo', S.card).getBoundingClientRect(), ar = S.art.getBoundingClientRect(), ir = S.artIn.getBoundingClientRect();
    if (!ar.width || !ir.width) return null;
    return {
      clip: insetOf(cp, ar, ARCH_R),
      flip: `translate(${(cp.left - ir.left).toFixed(1)}px,${(cp.top - ir.top).toFixed(1)}px) scale(${(cp.width / ir.width).toFixed(4)})`,
    };
  };
  const artRest = `inset(0px 0px 0px 0px round ${BANNER_R})`;
  const setExtend = (r, pr) => { // the surface paints beyond its box only while the start/end rectangle sticks out of it
    S.panel.style.setProperty('--ex-t', Math.max(0, pr.top - r.top).toFixed(1) + 'px');
    S.panel.style.setProperty('--ex-b', Math.max(0, r.bottom - pr.bottom).toFixed(1) + 'px');
    S.panel.style.setProperty('--ex-l', Math.max(0, pr.left - r.left).toFixed(1) + 'px');
    S.panel.style.setProperty('--ex-r', Math.max(0, r.right - pr.right).toFixed(1) + 'px');
    S.panel.classList.add('is-morph');
  };
  // a snapshot of the card's own text stays on top of the growing surface and fades (so the card does not blank out)
  const ghostOf = (rect, pr) => {
    const g = S.card.cloneNode(true), li = S.card.closest('.tg-item');
    g.removeAttribute('href'); g.removeAttribute('id'); g.removeAttribute('aria-labelledby'); g.removeAttribute('aria-describedby');
    g.removeAttribute('aria-haspopup'); g.removeAttribute('aria-expanded'); g.setAttribute('aria-hidden', 'true'); g.tabIndex = -1;
    g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    g.classList.add('tsheet-ghost');
    const k = rect.width / (S.card.offsetWidth || rect.width);
    g.style.cssText = `--tc:${li.style.getPropertyValue('--tc')};left:${(rect.left - pr.left).toFixed(1)}px;top:${(rect.top - pr.top).toFixed(1)}px;` +
      `inline-size:${S.card.offsetWidth}px;block-size:${S.card.offsetHeight}px;transform:scale(${k.toFixed(4)})`;
    S.panel.append(g);
    return g;
  };
  const dropGhost = () => $$('.tsheet-ghost', S.panel).forEach(n => n.remove());

  const open = i => {
    i = clamp(i, 0, N - 1);
    if (S.closing) finalize(true);
    if (S.open || !build()) return;
    fill(i);
    S.i = i; S.card = cards[i]; S.open = true; S.closing = false;
    const from = S.card.getBoundingClientRect();
    lock(); setInert(true);
    S.card.setAttribute('aria-expanded', 'true');
    S.el.hidden = false;
    S.panel.style.transform = ''; S.scrim.style.opacity = '';
    placeInd(false); placeArt();
    doc.addEventListener('keydown', onKey);
    buzz('tick', 8);
    if (!reduced() && S.panel.animate) {
      const pr = S.panel.getBoundingClientRect(), ease = spring(), dur = 300, g = sharedGeom();
      setExtend(from, pr);
      const keep = { fill: 'forwards' }; // end states stay applied until everything is cleaned up in one go (no flash in between)
      const clip = animate(S.panel, [{ clipPath: insetOf(from, pr, CARD_R) }, { clipPath: `inset(0px 0px 0px 0px round ${restRound()})` }], { duration: dur, easing: ease, ...keep });
      if (g) {
        animate(S.art, [{ clipPath: g.clip }, { clipPath: artRest }], { duration: dur, easing: ease, ...keep });
        animate(S.artIn, [{ transform: g.flip }, { transform: 'none' }], { duration: dur, easing: ease, ...keep });
      }
      animate(S.scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out', ...keep });
      const head = $('.tsheet-head', S.el);
      animate(head, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: 'ease-out', fill: 'both' });
      animate(S.text, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 80, easing: 'ease-out', fill: 'both' });
      const gh = ghostOf(from, pr);
      animate(gh, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-out', fill: 'forwards' });
      const done = () => { if (!S.open || S.closing) return; cancelAnims(); dropGhost(); S.panel.classList.remove('is-morph'); };
      if (clip) clip.onfinish = done; else done();
    }
    S.x.focus({ preventScroll: true });
  };

  const finalize = instant => {
    if (!S.open && !S.closing) return;
    cancelAnims(); dropGhost();
    doc.removeEventListener('keydown', onKey);
    S.panel.classList.remove('is-morph');
    S.panel.style.transform = ''; S.scrim.style.opacity = '';
    S.el.classList.remove('is-dragging');
    S.el.hidden = true;
    S.open = false; S.closing = false; S.drag = null;
    unlock(); setInert(false);
    const c = S.card;
    if (c) {
      c.setAttribute('aria-expanded', 'false');
      if (instant !== 'noFocus') { try { c.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
  };

  const close = () => {
    if (!S.open || S.closing) return;
    if (S.drag) { S.drag = null; S.el.classList.remove('is-dragging'); }
    if (reduced() || !S.panel.animate) { finalize(); return; }
    S.closing = true;
    // reverse of the opening, from wherever the opening currently is (interruptible)
    const pcs = getComputedStyle(S.panel), head = $('.tsheet-head', S.el);
    const cur = {
      clip: pcs.clipPath && pcs.clipPath !== 'none' ? pcs.clipPath : `inset(0px 0px 0px 0px round ${restRound()})`,
      drag: pcs.transform && pcs.transform !== 'none' ? pcs.transform : 'none',
      artClip: getComputedStyle(S.art).clipPath, artFlip: getComputedStyle(S.artIn).transform,
      scrim: getComputedStyle(S.scrim).opacity, text: getComputedStyle(S.text).opacity,
    };
    cancelAnims(); dropGhost();
    const pr = S.panel.getBoundingClientRect(), to = S.card.getBoundingClientRect();
    const onScreen = to.bottom > 0 && to.top < innerHeight && to.right > 0 && to.left < innerWidth;
    const dur = 240, ease = SPRING_FB, keep = { fill: 'forwards' };
    let a;
    if (onScreen) {
      setExtend(to, pr);
      const g = sharedGeom();
      a = animate(S.panel, [{ clipPath: cur.clip, transform: cur.drag }, { clipPath: insetOf(to, pr, CARD_R), transform: 'none' }], { duration: dur, easing: ease, ...keep });
      if (g) {
        animate(S.art, [{ clipPath: cur.artClip && cur.artClip !== 'none' ? cur.artClip : artRest }, { clipPath: g.clip }], { duration: dur, easing: ease, ...keep });
        animate(S.artIn, [{ transform: cur.artFlip && cur.artFlip !== 'none' ? cur.artFlip : 'none' }, { transform: g.flip }], { duration: dur, easing: ease, ...keep });
      }
      animate(head, [{ opacity: cur.text }, { opacity: 0 }], { duration: 110, easing: 'ease-in', ...keep });
      animate(S.text, [{ opacity: cur.text }, { opacity: 0 }], { duration: 110, easing: 'ease-in', ...keep });
      const gh = ghostOf(to, pr);
      gh.style.opacity = '0';
      animate(gh, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: 100, easing: 'ease-out', ...keep });
    } else { // the card is off screen (it cannot be while the page is locked, but never leave the sheet stuck)
      a = animate(S.panel, [{ transform: cur.drag }, { transform: `translateY(${Math.max(80, innerHeight - pr.top)}px)` }], { duration: dur, easing: ease, ...keep });
    }
    animate(S.scrim, [{ opacity: cur.scrim }, { opacity: 0 }], { duration: dur, easing: 'ease-out', ...keep });
    if (a) a.onfinish = () => finalize(); else finalize();
    setTimeout(() => { if (S.closing) finalize(); }, dur + 160); // never stay half closed
  };

  /* ---- drag-down to dismiss (header/handle always; the body only from the top and only downwards) ---- */
  const dragBegin = y => {
    cancelAnims(); dropGhost();
    S.panel.classList.remove('is-morph');
    const h = S.panel.getBoundingClientRect().height;
    S.drag = { y0: y, dy: 0, h, s: [{ t: performance.now(), y }], raf: 0, buzzed: false };
    S.el.classList.add('is-dragging');
  };
  const dragApply = () => {
    const D = S.drag; if (!D) return;
    D.raf = 0;
    S.panel.style.transform = `translate3d(0,${D.dy.toFixed(1)}px,0)`;
    S.scrim.style.opacity = clamp(1 - Math.max(0, D.dy) / D.h, 0, 1).toFixed(3);
  };
  const dragMove = y => {
    const D = S.drag; if (!D) return;
    const dy = y - D.y0;
    D.dy = dy > 0 ? dy : dy * 0.2; // upward is damped
    const now = performance.now();
    D.s.push({ t: now, y }); if (D.s.length > 8) D.s.shift();
    const past = D.dy > 0.35 * D.h;
    if (past && !D.buzzed) buzz('tick', 8);
    D.buzzed = past;
    if (!D.raf) D.raf = requestAnimationFrame(dragApply);
  };
  const dragEnd = () => {
    const D = S.drag; if (!D) return;
    S.drag = null; cancelAnimationFrame(D.raf);
    S.el.classList.remove('is-dragging');
    const dy = Math.max(0, D.dy), cur = `translate3d(0,${D.dy.toFixed(1)}px,0)`;
    S.panel.style.transform = cur; // the last pointer position, not the last painted frame
    S.scrim.style.opacity = clamp(1 - dy / D.h, 0, 1).toFixed(3);
    const now = performance.now();
    const recent = D.s.filter(p => now - p.t <= 100);
    const v = recent.length > 1 && now - recent[recent.length - 1].t <= 60 && recent[recent.length - 1].t > recent[0].t
      ? (recent[recent.length - 1].y - recent[0].y) / (recent[recent.length - 1].t - recent[0].t) : 0; // px/ms, + = downwards
    const dismiss = dy > 0.35 * D.h || (v > 0.5 && dy > 8);
    const sc = getComputedStyle(S.scrim).opacity;
    if (!dismiss && dy < 1) { S.panel.style.transform = ''; S.scrim.style.opacity = ''; return; } // a plain tap on the header
    if (reduced() || !S.panel.animate) {
      if (dismiss) finalize(); else { S.panel.style.transform = ''; S.scrim.style.opacity = ''; }
      return;
    }
    if (dismiss) {
      S.closing = true;
      const rest = Math.max(40, innerHeight - S.panel.getBoundingClientRect().top + 24);
      const dur = clamp(rest / Math.max(v, 0.5), 120, 260);
      const end = `translate3d(0,${(D.dy + rest).toFixed(1)}px,0)`;
      S.panel.style.transform = end; S.scrim.style.opacity = '0';
      const a = animate(S.panel, [{ transform: cur }, { transform: end }], { duration: dur, easing: 'cubic-bezier(.3,.6,.55,1)' });
      animate(S.scrim, [{ opacity: sc }, { opacity: 0 }], { duration: dur, easing: 'linear' });
      if (a) a.onfinish = () => finalize(); else finalize();
      setTimeout(() => { if (S.closing) finalize(); }, dur + 160);
    } else { // a short drag springs back
      S.panel.style.transform = ''; S.scrim.style.opacity = '';
      animate(S.panel, [{ transform: cur }, { transform: 'translate3d(0,0,0)' }], { duration: 320, easing: spring() });
      animate(S.scrim, [{ opacity: sc }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    }
  };
  const wireDrag = () => {
    // handle + header: pointer events (touch-action:none there)
    let pid = null, y0 = 0, on = false;
    S.top.addEventListener('pointerdown', e => {
      if (S.closing || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button,a')) return;
      pid = e.pointerId; y0 = e.clientY; on = false; // the drag starts with the first real movement: a tap does not disturb the opening
      try { S.top.setPointerCapture(pid); } catch (err) { /* ignore */ }
    });
    S.top.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      if (!on) { if (Math.abs(e.clientY - y0) < 4) return; on = true; dragBegin(y0); }
      dragMove(e.clientY);
    });
    const up = e => { if (e.pointerId !== pid) return; pid = null; if (on) dragEnd(); on = false; };
    S.top.addEventListener('pointerup', up);
    S.top.addEventListener('pointercancel', up);
    // body: touch only, starting at scrollTop 0 and moving down (otherwise the browser scrolls the text)
    let bt = null;
    S.body.addEventListener('touchstart', e => {
      bt = e.touches.length === 1 && !S.closing ? { x: e.touches[0].clientX, y: e.touches[0].clientY, top: S.body.scrollTop, on: false, dead: false } : null;
    }, { passive: true });
    S.body.addEventListener('touchmove', e => {
      if (!bt || bt.dead) return;
      const t = e.touches[0], dy = t.clientY - bt.y, dx = t.clientX - bt.x;
      if (!bt.on) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        if (bt.top <= 0 && S.body.scrollTop <= 0 && dy > 0 && dy > Math.abs(dx)) { bt.on = true; dragBegin(t.clientY); }
        else { bt.dead = true; return; }
      }
      if (e.cancelable) e.preventDefault();
      dragMove(t.clientY);
    }, { passive: false });
    const tend = () => { if (bt && bt.on) dragEnd(); bt = null; };
    S.body.addEventListener('touchend', tend);
    S.body.addEventListener('touchcancel', tend);
  };

  // open on click / Enter; modifier- and middle-clicks still navigate; a finished drag never reaches here (capture handler above)
  cards.forEach((a, i) => {
    a.setAttribute('aria-haspopup', 'dialog');
    a.setAttribute('aria-expanded', 'false');
    a.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !tpl) return;
      e.preventDefault();
      open(i);
    });
  });
  addEventListener('pagehide', () => { if (S.open || S.closing) finalize('noFocus'); });
  addEventListener('pageshow', e => { if (e.persisted && (S.open || S.closing)) finalize('noFocus'); });

  /* ------------------------------------------------------------ boot ------------------------------------------------------------ */
  onMQ(mqR, () => { if (reduced()) clearEffect(); else schedulePaint(); });
  addEventListener('resize', () => { measure(); schedulePaint(); }, { passive: true });
  if ('ResizeObserver' in window) {
    let w0 = scroller.clientWidth;
    new ResizeObserver(() => {
      measure(); schedulePaint();
      if (scroller.clientWidth !== w0) { w0 = scroller.clientWidth; if (!dragging && !moving) goTo(idx, 'instant'); }
    }).observe(scroller);
  }
  root.classList.add('is-ready');
  measure();
  setIdx(0);
  requestAnimationFrame(() => {
    if (!fromHash('instant')) setIdx(nearest());
    paint();
  });
  addEventListener('load', () => { measure(); if (!moving) schedulePaint(); }, { once: true });

  window.YanabeeGallery = {
    goTo, open, close,
    mode: () => 'carousel',
    index: () => idx,
    isOpen: () => S.open,
    settled: () => !moving && !dragging && !releasing && !(S.closing),
  };
})();
