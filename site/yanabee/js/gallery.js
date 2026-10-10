// Home: the pinned horizontal gallery of the teams (classic script, no dependencies).
//
//  mode 'live'   (>= 1000px wide, >= 620px tall, motion allowed): the gallery becomes a tall scroll track with a sticky
//                stage; vertical scroll progress moves a flex track sideways (RTL: panel 1 starts at the right, scrolling
//                down travels toward the left). Panels carry depth layers (outlined numeral < photo < copy), the photo opens
//                like an arch window, the stage colour washes cross-fade between teams, copy lines rise when a panel
//                becomes the active one, and horizontal velocity tilts/skews the photos (damped).
//  mode 'native' (reduced motion / short screens): the same panels in a native scroll-snap scroller; rail + counter follow it.
//  mode 'off'    (< 1000px): the gallery is display:none (CSS) and the plain card grid shows.
// Without this file the CSS leaves the native scroller (no rail) at >= 1000px. Only transforms/opacity/clip-path are written
// per frame; the layout is measured on resize / font load only (plus one getBoundingClientRect of the pin per frame).
(() => {
  'use strict';
  const root = document.querySelector('[data-gallery]');
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const pin = $('[data-pin]'), stage = $('[data-stage]'), viewport = $('[data-viewport]'), track = $('[data-track]');
  const panels = $$('.tg-panel');
  const N = panels.length;
  if (!pin || !stage || !viewport || !track || N < 2) return;
  const hud = $('[data-hud]'), strip = $('[data-roll]');
  const segs = $$('.tg-seg');
  const fills = segs.map(s => $('b', s));
  const bubbles = $('.tgal-bubbles');
  const washes = $$('.tgal-wash i');
  const parts = panels.map(p => ({
    num: $('.tg-num', p), media: $('.tg-media', p), photo: $('.tg-photo', p),
    img: $('.tg-mask img', p), arch: $('.tg-arch2', p), ic: $('.tg-ic', p), tint: $('.tg-tint', p), shadow: $('.tg-shadow', p),
    copy: $('.tg-copy', p), hidden: false, near: false,
  }));

  // ---- tuning knobs ----
  const K = {
    hold: 0.2,        // share of every panel-to-panel step during which the panel simply rests (0 = constant drift)
    damp: 10,         // scroll follow stiffness (1/s): higher = snappier, lower = more floaty
    velDamp: 8,       // velocity smoothing for the tilt / skew
    numLag: 0.42,     // numeral parallax: share of the panel speed it gives back (background layer)
    photoLag: 0.05,   // photo parallax (middle layer)
    archLag: 0.2,     // outlined twin arch behind the photo
    washDrift: 0.22,  // colour wash drift
    peek: 0.36,       // how much of a neighbouring photo is already open (0..1)
    tilt: 15,         // max extra rotateY (deg) from velocity
    yaw: 9,           // rotateY (deg per panel of distance): neighbours turn their faces to the centre
    skew: 5,          // max skewX (deg) from velocity
    minFit: 0.66,     // smallest copy scale on short screens (the copy shrinks until the tallest panel fits)
  };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const sstep = t => t * t * (3 - 2 * t);
  const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
  const onMQ = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));
  const mqW = matchMedia('(min-width: 1000px)');
  const mqH = matchMedia('(min-height: 620px)');
  const mqR = matchMedia('(prefers-reduced-motion: reduce)');

  let mode = 'off';
  let tx = [], pitch = 1, travel = 1, archR = 200;
  let u = 0, target = 0, vs = 0, last = 0, raf = 0, nraf = 0, idx = -1, act = -2, moveTimer = 0;
  const stats = { frames: 0, ms: 0, max: 0, samples: [] };

  // scroll progress p (0..1) -> continuous panel position u (0..N-1) with a resting plateau on every panel
  const mapU = p => {
    const v = p * (N - 1), i = Math.min(Math.floor(v), N - 2), f = v - i;
    return i + smoother(clamp((f - K.hold) / (1 - 2 * K.hold)));
  };

  /* ------------------------------------------------------------ shared HUD ------------------------------------------------------------ */
  // photos are lazy in the markup; warm the next few as the gallery approaches them so they never pop in
  const warm = n => {
    for (let i = Math.max(0, n - 1); i <= Math.min(N - 1, n + 3); i++) {
      const im = parts[i].img;
      if (im && im.loading !== 'eager') im.loading = 'eager';
    }
  };
  const setIdx = n => {
    if (n === idx) return;
    idx = n;
    warm(n);
    segs.forEach((s, i) => {
      s.classList.toggle('is-on', i === n);
      if (i === n) s.setAttribute('aria-current', 'true'); else s.removeAttribute('aria-current');
    });
    if (strip) strip.style.transform = `translateY(${(-n * 1.4).toFixed(1)}em)`;
    const cur = panels[n].style.getPropertyValue('--tc') || 'var(--brand)'; // only the small HUD / bubble subtrees restyle
    if (hud) hud.style.setProperty('--cur', cur);
    if (bubbles) bubbles.style.setProperty('--cur', cur);
  };
  const setAct = n => {
    if (n === act) return;
    act = n;
    panels.forEach((p, i) => p.classList.toggle('is-active', i === n));
  };
  const paintRail = v => {
    segs.forEach((s, k) => {
      const f = clamp(v - (k - 1));
      if (s._f !== f) { s._f = f; fills[k].style.transform = `scaleX(${f.toFixed(3)})`; }
    });
    if (hud) hud.classList.toggle('tg-hud-moved', v > 0.3);
  };

  /* ------------------------------------------------------------ live mode ------------------------------------------------------------ */
  const measure = () => {
    fit();
    const vpW = viewport.clientWidth;
    travel = Math.max(1, pin.offsetHeight - stage.offsetHeight);
    const base = track.offsetLeft; // physical offset of the (right-anchored in RTL) track inside the viewport
    const cs = panels.map(p => base + p.offsetLeft + p.offsetWidth / 2);
    tx = cs.map(c => vpW / 2 - c);
    pitch = Math.abs(cs[1] - cs[0]) || 1;
    archR = Math.round(parts[0].media.offsetWidth / 2) || 200;
  };
  // scale the copy (CSS --fit) until the tallest panel's text block fits the free height of the stage
  const copies = panels.map(p => $('.tg-copy', p));
  const fit = () => {
    const zone = viewport.clientHeight - 4;
    let f = 1;
    for (let k = 0; k < 5; k++) {
      root.style.setProperty('--fit', f.toFixed(3));
      const worst = copies.reduce((m, c) => Math.max(m, c.offsetHeight), 0);
      if (worst <= zone || f <= K.minFit) break;
      f = Math.max(K.minFit, f * (zone / worst) * 0.985);
    }
  };
  const enterOf = rect => clamp((innerHeight * 0.9 - rect.top) / (innerHeight * 0.55));

  const draw = enter => {
    const i0 = Math.min(Math.floor(u), N - 2), f = u - i0;
    track.style.transform = `translate3d(${(tx[i0] + (tx[i0 + 1] - tx[i0]) * f).toFixed(2)}px,0,0)`;
    const live = 0.25 + 0.75 * enter;
    for (let i = 0; i < N; i++) {
      const d = u - i, ad = Math.abs(d), P = parts[i], pn = panels[i];
      const w = washes[i];
      if (w) {
        if (ad < 1) {
          if (!w._v) w.classList.add('is-w');
          w.style.opacity = (sstep(1 - ad) * (0.3 + 0.7 * enter)).toFixed(3);
          w.style.transform = `translate3d(${(-d * pitch * K.washDrift).toFixed(1)}px,0,0)`;
          w._v = 1;
        } else if (w._v) { w.style.opacity = '0'; w._v = 0; w.classList.remove('is-w'); }
      }
      if (ad > 1.8) {
        if (!P.hidden) { pn.style.opacity = '0'; P.hidden = true; }
        continue;
      }
      P.hidden = false;
      const near = ad < 1.5;
      if (near !== P.near) { P.near = near; pn.classList.toggle('is-near', near); }
      pn.style.opacity = ((1 - 0.64 * clamp(ad - 0.1)) * (1 - clamp((ad - 1.1) / 0.7))).toFixed(3);
      // photo: opens like an arch window as the panel comes to the centre
      const rv = (K.peek + (1 - K.peek) * sstep(clamp(1 - ad * 1.05))) * live;
      P.tint.style.opacity = (0.4 + (1 - rv) * 0.6).toFixed(3);
      P.shadow.style.opacity = (rv * 0.75).toFixed(3);
      P.photo.style.clipPath = `inset(0 0 ${((1 - rv) * 64).toFixed(2)}% 0 round ${archR}px ${archR}px 30px 30px)`;
      P.img.style.transform = `translate3d(${(d * pitch * 0.04).toFixed(1)}px,0,0) scale(${(1.32 - 0.27 * rv).toFixed(3)})`;
      P.media.style.transform = `translate3d(${(-d * pitch * K.photoLag).toFixed(1)}px,${((1 - rv) * 26).toFixed(1)}px,0)`;
      const yaw = clamp(d * K.yaw - vs * 4, -28, 28);
      const tilt = clamp(vs * 5, -K.tilt, K.tilt);
      P.photo.style.transform = `perspective(1300px) rotateY(${(yaw + tilt).toFixed(2)}deg) skewX(${clamp(-vs * 2.2, -K.skew, K.skew).toFixed(2)}deg) scale(${(0.9 + 0.1 * (1 - clamp(ad))).toFixed(3)})`;
      P.arch.style.transform = `translate3d(${(-d * pitch * K.archLag).toFixed(1)}px,0,0)`;
      P.arch.style.opacity = clamp(1 - ad * 1.7).toFixed(3);
      P.ic.style.opacity = sstep(clamp((rv - 0.55) / 0.45)).toFixed(3);
      // outlined numeral: the slow background layer
      P.num.style.transform = `translate3d(${(-d * pitch * K.numLag).toFixed(1)}px,0,0)`;
      P.num.style.opacity = clamp(1 - ad * 1.3).toFixed(3);
    }
    if (idx < 0 || Math.abs(u - idx) > 0.56) setIdx(clamp(Math.round(u), 0, N - 1));
    setAct(enter > 0.5 && Math.abs(u - idx) < 0.3 ? idx : -1);
    paintRail(u);
  };

  const frame = now => {
    raf = 0;
    const t0 = performance.now();
    const rect = pin.getBoundingClientRect();
    const vh = innerHeight;
    target = mapU(clamp(-rect.top / travel));
    if (rect.bottom < -vh * 0.5 || rect.top > vh * 1.5) { // far away: keep the state in sync, paint nothing
      u = target; vs = 0; last = now;
      moveTimer = setTimeout(() => root.classList.remove('is-moving'), 260);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const prev = u;
    u += (target - u) * (1 - Math.exp(-dt * K.damp));
    if (Math.abs(target - u) < 0.0007) u = target;
    vs += ((u - prev) / dt - vs) * (1 - Math.exp(-dt * K.velDamp));
    if (Math.abs(vs) < 0.005) vs = 0;
    draw(enterOf(rect));
    const ms = performance.now() - t0;
    stats.frames++; stats.ms += ms; if (ms > stats.max) stats.max = ms;
    if (stats.samples.length < 2000) stats.samples.push(ms);
    if (u !== target || vs !== 0) raf = requestAnimationFrame(frame);
    else moveTimer = setTimeout(() => root.classList.remove('is-moving'), 260);
  };
  const schedule = () => {
    if (mode !== 'live') return;
    clearTimeout(moveTimer);
    root.classList.add('is-moving');
    if (!raf) raf = requestAnimationFrame(frame);
  };
  // measure + paint the exact state for the current scroll position, no easing (load, resize, mid-scroll reload)
  const snap = () => {
    if (mode !== 'live') return;
    measure();
    const rect = pin.getBoundingClientRect();
    target = u = mapU(clamp(-rect.top / travel));
    vs = 0; last = performance.now();
    idx = -1; act = -2;
    draw(enterOf(rect));
  };

  /* ------------------------------------------------------------ native mode ------------------------------------------------------------ */
  const nativeUpdate = () => {
    nraf = 0;
    const vr = viewport.getBoundingClientRect(), c = vr.left + vr.width / 2;
    const rs = panels.map(p => p.getBoundingClientRect());
    let best = 0, bd = Infinity;
    rs.forEach((r, i) => { const dd = Math.abs(r.left + r.width / 2 - c); if (dd < bd) { bd = dd; best = i; } });
    const pt = Math.abs(rs[1].left - rs[0].left) || 1;
    const v = clamp(best + (rs[best].left + rs[best].width / 2 - c) / pt, 0, N - 1); // RTL: later panels lie to the left
    setIdx(best);
    paintRail(v);
  };
  const nativeSchedule = () => { if (mode === 'native' && !nraf) nraf = requestAnimationFrame(nativeUpdate); };

  /* ------------------------------------------------------------ pointer parallax + in-view flag ------------------------------------------------------------ */
  let praf = 0, px = 0, py = 0;
  const paintPointer = () => {
    praf = 0;
    const a = `calc(-5% + ${(px * -16).toFixed(1)}px) calc(3.5% + ${(py * -10).toFixed(1)}px)`;
    const f = `${(px * 9).toFixed(1)}px ${(py * 6).toFixed(1)}px`;
    const n = `${(px * 28).toFixed(1)}px calc(-52% + ${(py * 16).toFixed(1)}px)`;
    const c = `${(px * -6).toFixed(1)}px ${(py * -4).toFixed(1)}px`;
    parts.forEach(P => { P.arch.style.translate = a; P.photo.style.translate = f; P.num.style.translate = n; P.copy.style.translate = c; });
    root.dataset.px = px.toFixed(2);
  };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('pointermove', e => {
      if (mode !== 'live') return;
      const r = stage.getBoundingClientRect();
      px = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1);
      py = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1);
      if (!praf) praf = requestAnimationFrame(paintPointer);
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { px = py = 0; if (!praf) praf = requestAnimationFrame(paintPointer); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(en => root.classList.toggle('in-view', en.isIntersecting))).observe(pin);
  } else root.classList.add('in-view');

  /* ------------------------------------------------------------ navigation ------------------------------------------------------------ */
  const goTo = (i, behavior) => {
    i = clamp(i, 0, N - 1);
    if (mode === 'live') {
      const y = window.scrollY + pin.getBoundingClientRect().top + (i / (N - 1)) * travel;
      scrollTo({ top: Math.round(y), behavior: behavior || 'smooth' });
    } else if (mode === 'native') {
      panels[i].scrollIntoView({ inline: 'center', block: 'nearest', behavior: mqR.matches ? 'auto' : 'smooth' });
    }
  };
  segs.forEach(s => s.addEventListener('click', () => goTo(+s.dataset.go)));
  panels.forEach((p, i) => {
    const m = parts[i].media;
    m && m.addEventListener('click', () => { if (mode === 'live' && Math.abs(u - i) > 0.4) goTo(i); });
  });
  // keyboard: focusing anything inside a panel brings that panel to the centre of the stage
  track.addEventListener('focusin', e => {
    if (mode !== 'live') return;
    const pn = e.target.closest && e.target.closest('.tg-panel');
    if (!pn) return;
    const i = +pn.dataset.i;
    if (Math.abs(target - i) < 0.35) return;
    goTo(i, 'instant'); // jump the page; the damped panel position then glides there (no race with the browser's own focus scroll)
  });
  // old browsers without overflow:clip could scroll the stage sideways when focusing off-screen content
  viewport.addEventListener('scroll', () => { if (mode === 'live' && viewport.scrollLeft) viewport.scrollLeft = 0; nativeSchedule(); }, { passive: true });

  /* ------------------------------------------------------------ mode switching ------------------------------------------------------------ */
  const clearInline = () => {
    track.style.transform = '';
    panels.forEach((p, i) => {
      const P = parts[i];
      p.style.opacity = '';
      p.classList.remove('is-active', 'is-near');
      [P.num, P.media, P.photo, P.arch, P.img, P.ic].forEach(el => { if (el) { el.style.transform = ''; el.style.opacity = ''; } });
      P.photo.style.clipPath = '';
      P.tint.style.opacity = ''; P.shadow.style.opacity = '';
      P.arch.style.translate = ''; P.photo.style.translate = ''; P.num.style.translate = ''; P.copy.style.translate = '';
      P.hidden = false; P.near = false;
      if (P.arch) P.arch.style.opacity = '';
    });
    washes.forEach(w => { w.style.opacity = ''; w.style.transform = ''; w._v = 0; w.classList.remove('is-w'); });
    segs.forEach((s, k) => { fills[k].style.transform = ''; s._f = undefined; });
    idx = -1; act = -2;
    root.style.removeProperty('--fit');
    cancelAnimationFrame(raf); raf = 0;
    root.classList.remove('is-moving');
  };
  const setMode = want => {
    if (want === mode) return;
    clearInline();
    mode = want;
    root.classList.toggle('is-live', want === 'live');
    root.classList.toggle('is-native', want === 'native');
    viewport.scrollLeft = 0;
    if (want === 'live') snap();
    else if (want === 'native') nativeUpdate();
  };
  const decide = () => setMode(!mqW.matches ? 'off' : (mqR.matches || !mqH.matches) ? 'native' : 'live');

  [mqW, mqH, mqR].forEach(mq => onMQ(mq, decide));
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { if (mode === 'live') snap(); else nativeSchedule(); }, { passive: true });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { if (mode === 'live') snap(); else nativeSchedule(); });
    ro.observe(stage);
    ro.observe(document.documentElement);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (mode === 'live') snap(); });
  addEventListener('load', () => { if (mode === 'live') snap(); }, { once: true });
  addEventListener('pageshow', e => { if (e.persisted && mode === 'live') snap(); });

  decide();
  // deep link to one panel (#g-t3)
  const h = location.hash.match(/^#g-(t[1-7]|s3)$/);
  if (h && mode !== 'off') {
    const i = panels.findIndex(p => p.id === 'g-' + h[1]);
    if (i >= 0) requestAnimationFrame(() => goTo(i, 'instant'));
  }

  window.YanabeeGallery = { goTo, mode: () => mode, position: () => u, settled: () => mode !== 'live' || (!raf && u === target && vs === 0), stats, knobs: K };
})();
