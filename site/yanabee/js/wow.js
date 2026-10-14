// App-shell layer (every page, classic script, no dependencies, works from file://).
//   1. page push transition   the nav and tab bar never move; only the content area pushes in/out, directionally.
//                             Cross-document view transitions do it (css/wow.css + the inline head script in core.py);
//                             without them a light JS fallback animates <main> out (140 ms) and in (240 ms).
//   2. quick reveals          .rv blocks that are already on screen appear with the page; the rest fade up in 240 ms
//   3. sliding indicators     every [role=tablist] gets a sliding pill (data-seg="own" opts out); [data-tabs] panels cross-slide
//   4. toast + haptics        window.YanabeeApp.toast / haptic
//   5. persistent nav         condenses in place on scroll; on inner pages a phone shows the page title when the h1 scrolls away
//   6. tab bar                a sliding pill under the active icon; tapping the active tab scrolls to the top
//   7. drag to dismiss        the menu sheet (and, on phones, search and the assistant) follows the finger 1:1
//   8. wave scroll progress, light 1:1 parallax, the optional water sound, hover ring + press splash cursor
// Everything is enhancement only. Reduced motion switches the motion off; idle = no rAF loop, no timers.
//
// API:  window.YanabeeApp = { toast(text, { action:{label,onClick}, duration, haptic }), haptic(kind), go(href, x, y) }
//         haptic kinds: 'tick' | 'select' | 'success' | 'warn'      go(): same path as a link click, falls back to location.href
//       window.YanabeeWow = { go, sound, cursor, busy }   (aliases kept for existing callers)
//   sound.play(type, {pitch})   'drop' | 'ripple' | 'good' | 'bad'   (silent unless the user turned sound on)
//   sound.enabled() / sound.set(bool)       cursor.splash(x, y) | cursor.enabled()
// Events in:  window.dispatchEvent(new CustomEvent('yanabee:sound', { detail: { type: 'good' } }))
// Events out: 'yanabee:sound-change' {detail:{on}}
(() => {
  'use strict';
  const doc = document, root = doc.documentElement;
  const $ = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => [...r.querySelectorAll(s)];
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => mqReduce.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const onMQ = (mq, fn) => (mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  // one module failing must never take the others (or the page) down
  const safe = (name, fn) => { try { return fn(); } catch (e) { if (window.console) console.warn('[wow] ' + name + ': ' + (e && e.message)); return null; } };

  /* ---------------- one shared rAF loop (cursor): tasks run while they return true ---------------- */
  const tasks = new Set();
  let raf = 0, lastT = 0;
  const frame = t => {
    raf = 0;
    const dt = clamp(t - lastT, 1, 48); lastT = t;
    for (const fn of [...tasks]) if (fn(dt, t) === false) tasks.delete(fn);
    if (tasks.size) raf = requestAnimationFrame(frame);
  };
  const run = fn => {
    tasks.add(fn);
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
  };

  /* ---------------- colour helper: any CSS colour -> [r,g,b] ---------------- */
  let probe = null;
  const rgbOf = (str, fallback) => {
    str = (str || '').trim();
    if (!str) return fallback;
    if (!probe) {
      probe = doc.createElement('i');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
      (doc.body || root).appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = str;
    if (!probe.style.color) return fallback;
    const n = getComputedStyle(probe).color.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
    if (!n || n.length < 3) return fallback;
    const k = /^color\(/.test(getComputedStyle(probe).color) ? 255 : 1;
    return [n[0] * k, n[1] * k, n[2] * k].map(v => Math.round(clamp(v, 0, 255)));
  };
  const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
  const isDark = () => root.dataset.theme === 'dark';

  /* ====================================================================================
     haptics: navigator.vibrate where it exists, throttled, silent under reduced motion
     ==================================================================================== */
  const haptic = (() => {
    const PATTERNS = { tick: 8, select: 10, success: [10, 40, 14], warn: [20, 40, 20] };
    let last = -1e9;
    return kind => {
      if (reduced() || typeof navigator.vibrate !== 'function') return false;
      const t = performance.now();
      if (t - last < 40) return false;
      last = t;
      try { return navigator.vibrate(PATTERNS[kind] || PATTERNS.tick) !== false; } catch (e) { return false; }
    };
  })();
  let gestureAt = -1e9;                      // last pointer/key press: tells a user's tab change from a programmatic one
  ['pointerdown', 'keydown'].forEach(t => doc.addEventListener(t, () => { gestureAt = performance.now(); }, true));
  const byUser = () => performance.now() - gestureAt < 700;

  /* ====================================================================================
     water sound (OFF by default)
     ==================================================================================== */
  const sound = (() => {
    const KEY = 'yanabee-sound';
    let on = store.get(KEY) === '1';
    let ac = null, master = null, noiseBuf = null, btn = null;
    const last = {};
    const VOLUME = 0.15; // master gain, never above 0.18

    const ensure = () => {
      if (ac) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { ac = null; return null; }
      master = ac.createGain();
      master.gain.value = VOLUME;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ac.destination);
      return ac;
    };
    const noise = () => {
      if (noiseBuf) return noiseBuf;
      const len = Math.floor(ac.sampleRate * 1.2);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuf;
    };
    const env = (g, t, peak, attack, release) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    };
    const tone = (t, type, f0, f1, dur, peak, attack, dest, lp) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, peak, attack, dur);
      let out = g;
      o.connect(g);
      if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; g.connect(f); out = f; }
      out.connect(dest || master);
      o.start(t); o.stop(t + attack + dur + 0.05);
    };
    const burst = (t, dur, f, q, peak, f2) => {
      const s = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noise();
      flt.type = 'bandpass'; flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
      env(g, t, peak, Math.min(0.02, dur * 0.3), dur);
      s.connect(flt); flt.connect(g); g.connect(master);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.08);
    };
    const synth = {
      drop(t, o) {                // a water drop: sine glide 900 -> 250 Hz, soft envelope, a touch of filtered noise
        const p = o.pitch || 1;
        tone(t, 'sine', 900 * p, 250 * p, 0.12, 0.7, 0.006);
        burst(t, 0.035, 2000 * p, 1.4, 0.07);
      },
      ripple(t, o) {              // softer and rounder
        const p = o.pitch || 1;
        tone(t, 'sine', 560 * p, 330 * p, 0.2, 0.34, 0.014, master, 1800);
        tone(t + 0.07, 'sine', 420 * p, 270 * p, 0.22, 0.14, 0.02, master, 1500);
      },
      good(t) {                   // two rising bell-like partials
        [[784, 0], [1175, 0.09]].forEach(([f, d]) => {
          tone(t + d, 'sine', f, f, 0.55, 0.32, 0.006);
          tone(t + d, 'sine', f * 2.76, f * 2.76, 0.28, 0.07, 0.004);
        });
      },
      bad(t) {                    // low soft thud
        tone(t, 'sine', 150, 68, 0.22, 0.85, 0.004, master, 420);
        burst(t, 0.06, 240, 0.8, 0.06);
      },
    };
    const play = (type, o) => {
      if (!on || !synth[type]) return false;
      const a = ensure();
      if (!a) return false;
      const now = performance.now();
      if (now - (last[type] || 0) < 55 || now - (last._any || 0) < 28) return false;
      last[type] = last._any = now;
      if (a.state === 'suspended') a.resume().catch(() => {});
      try { synth[type](a.currentTime + 0.005, o || {}); } catch (e) { return false; }
      return true;
    };
    const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
    const pitchFor = el => 0.82 + 0.5 * hash((el.getAttribute('href') || '') + (el.textContent || '').trim().slice(0, 40) + el.className);

    const set = (v, persist) => {
      on = !!v;
      if (persist !== false) store.set(KEY, on ? '1' : '0');
      if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { ensure(); if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }
      window.dispatchEvent(new CustomEvent('yanabee:sound-change', { detail: { on } }));
    };

    const ICON = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    const mount = () => {
      const actions = $('.nav .actions');
      if (!actions || $('.sound-btn', actions)) return;
      btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn sound-btn';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', 'صوت الماء');
      btn.title = 'صوت الماء';
      btn.innerHTML = ICON + '<path class="sp" d="M11 5 6.5 9H3v6h3.5L11 19z"/><path class="w1" d="M15.2 9.2a4 4 0 0 1 0 5.6"/><path class="w2" d="M18.2 6.6a8 8 0 0 1 0 10.8"/><path class="x" d="m16 9.5 5 5m0-5-5 5"/></svg>';
      actions.insertBefore(btn, $('.search-btn', actions) || actions.firstChild);
      btn.addEventListener('click', () => {
        set(!on);
        if (on) play('drop', { pitch: 1.1 });
      });
    };

    // first user gesture: create + resume the context so the first sound is immediate (never before a gesture)
    const warm = () => { if (on) ensure(); };
    doc.addEventListener('pointerdown', warm, { once: true, passive: true });
    doc.addEventListener('keydown', warm, { once: true, passive: true });
    doc.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (doc.hidden) ac.suspend().catch(() => {});
      else if (on) ac.resume().catch(() => {});
    });
    window.addEventListener('yanabee:sound', e => { const d = e.detail; play(typeof d === 'string' ? d : d && d.type, d && typeof d === 'object' ? d : {}); });

    return { play, set, enabled: () => on, mount, pitchFor, types: Object.keys(synth), get volume() { return master ? master.gain.value : VOLUME; }, get context() { return ac; } };
  })();

  /* ====================================================================================
     1. page push transition
        With cross-document view transitions (typeof PageRevealEvent === 'function') the browser does everything and this
        module only offers go(). Without them (Firefox, older Safari) same-site clicks slide <main> out, then navigate, and the
        next page slides in from the inline-end side. Nav and tab bar are never part of it.
     ==================================================================================== */
  const nav = (() => {
    const hasVT = typeof window.PageRevealEvent === 'function';
    const EXIT = 140;          // ms of the exit; navigation starts right after (hard cap 180)
    const ENTER = 240;         // ms of the arrival
    const FAILSAFE = 1200;     // ms after the click that we give the page back if it is still here (blocked / cancelled)
    const EASE = 'cubic-bezier(.22,.8,.24,1)';
    let leaving = false, pending = '', exitT = 0, failT = 0, anims = [];

    // site root (directory that holds js/wow.js), so absolute /yanabee/ URLs on the 404 page count as internal too
    const siteRoot = (() => {
      try {
        const s = (doc.currentScript && doc.currentScript.src) || ($('script[src*="wow.js"]') || {}).src;
        return new URL('../', s).href;
      } catch (e) { return ''; }
    })();
    const norm = p => p.replace(/index\.html$/, '').replace(/\/+$/, '');
    const internal = u => !!siteRoot && u.href.indexOf(siteRoot) === 0 && /(\.html|\/)$/.test(u.pathname);
    const samePage = u => norm(u.pathname) === norm(location.pathname);
    // Is this link a navigation to another page of the site? -> URL or null
    const target = a => {
      if (!a || typeof a.href !== 'string' || !a.hasAttribute('href')) return null;
      if (a.target && a.target !== '_self') return null;
      if (a.hasAttribute('download') || /\bexternal\b/.test(a.rel || '')) return null;
      let u;
      try { u = new URL(a.href); } catch (e) { return null; }
      if (!internal(u) || samePage(u)) return null; // same page: hash scroll / reload stay native
      return u;
    };
    const parts = () => [$('main'), $('.footer')].filter(Boolean);

    const restore = () => {
      clearTimeout(exitT); clearTimeout(failT);
      anims.forEach(a => { try { a.cancel(); } catch (e) { /* ignore */ } });
      anims = []; leaving = false; pending = '';
      sess.del('yb-dir');
    };
    const push = href => {
      pending = href;                                    // a second click while leaving just retargets, it never blocks
      if (leaving) return true;
      leaving = true;
      sess.set('yb-dir', 'forward|' + Date.now());
      try {
        anims = parts().map(el => el.animate(
          [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }],   // RTL: continues toward the right while the next page arrives from the left
          { duration: EXIT, easing: 'ease-in', fill: 'forwards' }));
      } catch (e) { anims = []; }
      exitT = setTimeout(() => { try { location.href = pending; } catch (e) { restore(); } }, EXIT);
      failT = setTimeout(restore, FAILSAFE);             // still here after 1.2 s: the navigation was stopped or blocked
      return true;
    };
    const go = (href, x, y) => {                          // x, y kept for old callers; the push does not need them
      let u = null;
      try { u = new URL(href, location.href); } catch (e) { return false; }
      if (hasVT || reduced() || !internal(u) || samePage(u)) { if (!leaving) location.href = u.href; return false; }
      try { return push(u.href); } catch (e) { restore(); location.href = u.href; return false; }
    };

    doc.addEventListener('click', e => {
      if (hasVT || reduced() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let u = null;
      try { const a = e.target && e.target.closest ? e.target.closest('a[href]') : null; u = a && target(a); } catch (err) { u = null; }
      if (!u) return;
      e.preventDefault();
      try { push(u.href); } catch (err) { restore(); location.href = u.href; }
    });
    // Esc stops the navigation and gives the page back
    addEventListener('keydown', e => { if (e.key === 'Escape' && leaving) { try { window.stop(); } catch (err) { /* ignore */ } restore(); } });
    // back/forward cache: the page comes back exactly as we left it
    addEventListener('pageshow', e => { if (e.persisted) restore(); });

    // arrival: only the JS fallback animates; with view transitions the browser already did
    const arrive = () => {
      const v = sess.get('yb-dir');
      sess.del('yb-dir');
      if (hasVT || reduced()) return;
      const k = root.dataset.nav;                         // set by the inline head script before first paint
      const fresh = !!v && Date.now() - (+String(v).split('|')[1] || 0) < 8000;
      if (k === 'reload' || (!fresh && k !== 'back')) return;
      const from = k === 'back' ? 36 : -36;                // forward enters from the LEFT (inline-end in RTL), back from the right
      try {
        parts().forEach(el => el.animate([{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }],
          { duration: ENTER, easing: EASE, fill: 'backwards' }));
      } catch (e) { /* ignore */ }
    };
    return { go, target, restore, arrive, hasVT, active: () => leaving };
  })();

  /* ====================================================================================
     2. reveals: what is already on screen (or a jump: back / reload / #hash) just appears
     ==================================================================================== */
  const reveals = () => {
    const k = root.dataset.nav;
    const all = (!!k && k !== 'forward') || !!location.hash;
    const lim = innerHeight * 1.15;
    $$('.rv:not(.in)').forEach(el => { if (all || el.getBoundingClientRect().top < lim) el.classList.add('rv-now', 'in'); });
    if (location.hash) {                                   // the first jump must not be a smooth scroll stacked on the push
      root.classList.add('yb-jump');
      const off = () => setTimeout(() => root.classList.remove('yb-jump'), 400);
      if (doc.readyState === 'complete') off(); else addEventListener('load', off, { once: true });
    }
  };

  /* ====================================================================================
     3. sliding indicator for every [role=tablist]; [data-tabs] panels cross-slide
     ==================================================================================== */
  const segs = (() => {
    const seen = new WeakSet();
    const resamplers = new Set();
    const tabsOf = tl => $$('[role=tab]', tl);
    const selOf = tl => tabsOf(tl).find(t => t.getAttribute('aria-selected') === 'true') || null;
    const hasOwn = tl => tl.matches('[data-seg="own"]') || !!tl.querySelector(':scope > .seg-ind, :scope > [class*="pill"]');

    const slidePanel = (tl, tab, prev) => {
      if (reduced() || !tab || !tab.hasAttribute('aria-controls') || !tl.closest('[data-tabs]')) return;
      const panel = doc.getElementById(tab.getAttribute('aria-controls'));
      if (!panel || panel.hidden || !panel.animate) return;
      const dx = prev && prev !== tab ? Math.sign(tab.getBoundingClientRect().left - prev.getBoundingClientRect().left) : 0;   // new tab on the left -> the panel arrives from the left
      panel.animate([{ opacity: 0, transform: `translateX(${dx * 8}px)` }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
    };

    const attach = tl => {
      if (seen.has(tl)) return;
      seen.add(tl);
      const own = hasOwn(tl);
      let ind = null, shown = false, sampled = false, prev = selOf(tl);
      if (!own) {
        ind = doc.createElement('span');
        ind.className = 'seg-ind';
        ind.setAttribute('aria-hidden', 'true');
        tl.insertBefore(ind, tl.firstChild);
        tl.classList.add('has-seg');
      }
      // copy the selected tab's own look (fill, shadow, radius, border) onto the indicator; transitions are held off so the value read is the final one
      const sample = s => {
        const was = tl.classList.contains('seg-on');
        s.style.transition = 'none';
        tl.classList.remove('seg-on');
        const cs = getComputedStyle(s), st = ind.style;
        st.backgroundColor = cs.backgroundColor; st.backgroundImage = cs.backgroundImage;
        st.boxShadow = cs.boxShadow; st.borderRadius = cs.borderRadius;
        st.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
        if (was) tl.classList.add('seg-on');
        void s.offsetWidth;
        s.style.transition = '';
        sampled = true;
      };
      const place = () => {
        if (!ind) return;
        const s = selOf(tl);
        if (!s || !s.offsetWidth || !tl.offsetWidth) { tl.classList.remove('seg-on'); shown = false; return; }   // not measurable: the tabs keep their own selected style
        if (!sampled) sample(s);
        const st = ind.style;
        if (!shown) st.transition = 'none';
        st.width = s.offsetWidth + 'px'; st.height = s.offsetHeight + 'px';
        st.transform = `translate(${s.offsetLeft}px,${s.offsetTop}px)`;
        tl.classList.add('seg-on');
        if (!shown) { void ind.offsetWidth; st.transition = ''; shown = true; }
      };
      if (ind) resamplers.add(() => { sampled = false; place(); });
      new MutationObserver(() => {
        const cur = selOf(tl);
        if (cur === prev) return;
        const was = prev; prev = cur;
        place();
        slidePanel(tl, cur, was);
        if (cur && byUser()) haptic('select');
      }).observe(tl, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
      if (ind && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(place);
        ro.observe(tl);
        tabsOf(tl).forEach(t => ro.observe(t));
      }
      place();
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
    };
    const scan = r => {
      if (r.nodeType !== 1 && r !== doc) return;
      (r.matches && r.matches('[role=tablist]') ? [r] : []).concat($$('[role=tablist]', r)).forEach(a => safe('tablist', () => attach(a)));
    };
    let queued = false;
    const boot = () => {
      scan(doc);
      new MutationObserver(ms => {
        if (queued) return;
        const hit = ms.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('[role=tablist]') || n.querySelector('[role=tablist]'))));
        if (!hit) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; scan(doc); });
      }).observe(doc.body, { childList: true, subtree: true });
      window.addEventListener('themechange', () => requestAnimationFrame(() => resamplers.forEach(fn => fn())));
    };
    return { boot, attach, scan };
  })();

  /* ====================================================================================
     4. toast
     ==================================================================================== */
  const toast = (() => {
    const queue = [];
    let el = null, textEl = null, act = null, cur = null, timer = 0, leaveT = 0, held = 0, drag = null;

    const build = () => {
      if (el) return;
      el = doc.createElement('div');
      el.className = 'app-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      textEl = doc.createElement('span'); textEl.className = 'app-toast-t';
      act = doc.createElement('button'); act.type = 'button'; act.className = 'app-toast-a'; act.hidden = true;
      el.append(textEl, act);
      doc.body.appendChild(el);
      act.addEventListener('click', () => { const t = cur; if (!t) return; try { t.action && t.action.onClick && t.action.onClick(); } catch (e) { /* the caller's problem */ } dismiss(t); });
      el.addEventListener('pointerenter', () => { held |= 1; stopTimer(); });
      el.addEventListener('pointerleave', () => { held &= ~1; if (cur && !drag) startTimer(1200); });
      el.addEventListener('focusin', () => { held |= 2; stopTimer(); });
      el.addEventListener('focusout', () => { held &= ~2; if (cur && !drag) startTimer(1200); });
      // swipe to dismiss: either inline direction or down, tracked 1:1 while the pointer is down
      el.addEventListener('pointerdown', e => {
        if (!cur || e.button > 0 || (e.target.closest && e.target.closest('.app-toast-a'))) return;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, s: [[performance.now(), 0, 0]] };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        el.classList.add('dragging'); stopTimer();
      });
      el.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        drag.dx = e.clientX - drag.x0; drag.dy = Math.max(0, e.clientY - drag.y0);
        el.style.transform = `translate3d(${drag.dx}px,${drag.dy}px,0)`;
        el.style.opacity = String(clamp(1 - Math.abs(drag.dx) / 260, 0.25, 1));
        const t = performance.now(); drag.s.push([t, drag.dx, drag.dy]);
        while (drag.s.length > 2 && t - drag.s[0][0] > 100) drag.s.shift();
      });
      const release = e => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        el.classList.remove('dragging');
        const a = d.s[0], b = d.s[d.s.length - 1], dt = Math.max(1, b[0] - a[0]);
        const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt;
        if (Math.abs(d.dx) > 70 || d.dy > 36 || Math.abs(vx) > 0.5 || vy > 0.5) {
          const t = cur;
          if (d.dy > Math.abs(d.dx) && d.dy > 0) dismiss(t, 0, 1); else dismiss(t, d.dx < 0 || vx < 0 ? -1 : 1, 0);
        } else {
          el.style.transform = ''; el.style.opacity = '';
          if (cur) startTimer(1600);
        }
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };
    const stopTimer = () => { clearTimeout(timer); timer = 0; };
    const startTimer = ms => { stopTimer(); if (cur && !held) timer = setTimeout(() => dismiss(cur), ms); };

    const next = () => {
      if (cur || !queue.length) return;
      build();
      cur = queue.shift();
      textEl.textContent = cur.text;
      if (cur.action && cur.action.label) { act.textContent = cur.action.label; act.hidden = false; } else { act.hidden = true; act.textContent = ''; }
      el.style.transform = ''; el.style.opacity = '';
      void el.offsetWidth;
      el.classList.add('show');
      if (cur.haptic) haptic(cur.haptic);
      startTimer(cur.duration);
    };
    const dismiss = (t, dirX, dirY) => {
      if (!t) return;
      const i = queue.indexOf(t);
      if (i >= 0) { queue.splice(i, 1); return; }          // still waiting: just forget it
      if (t !== cur || !el) return;
      stopTimer(); drag = null;
      el.classList.remove('dragging', 'show');
      if (dirX || dirY) { el.style.transform = `translate3d(${(dirX || 0) * 120}px,${dirY ? 60 : 0}px,0)`; el.style.opacity = '0'; }
      cur = null;
      clearTimeout(leaveT);
      leaveT = setTimeout(() => {
        leaveT = 0;
        textEl.textContent = ''; act.hidden = true; el.style.transform = ''; el.style.opacity = '';
        next();
      }, 170);
    };
    return (text, opts) => {
      const o = opts && typeof opts === 'object' ? opts : {};
      if (!doc.body) return { dismiss() {} };
      const t = { text: String(text == null ? '' : text), action: o.action || null, duration: o.duration > 0 ? +o.duration : 2400, haptic: o.haptic || null };
      queue.push(t);
      if (!cur && !leaveT) next();                          // while the last one is still leaving, next() runs when it is gone
      return { dismiss: () => dismiss(t) };
    };
  })();

  /* ====================================================================================
     5. persistent nav: condenses in place (css), and on inner pages a phone shows the page title once the h1 scrolls away
     ==================================================================================== */
  const keepNavVisible = () => {
    // main.js still adds .hide while scrolling down (css undoes its transform); several page stylesheets key a sticky aside's
    // `top` off body:has(.nav.hide), which would slide the aside under a nav that is in fact visible. Drop the class again.
    const nav0 = $('.nav');
    if (!nav0) return;
    const drop = () => { if (nav0.classList.contains('hide')) nav0.classList.remove('hide'); };
    new MutationObserver(drop).observe(nav0, { attributes: true, attributeFilter: ['class'] });
    drop();
  };
  const navbar = () => {
    const nav0 = $('.nav'), h1 = $('main h1');
    if (!nav0 || !h1 || (doc.body.dataset.page || '') === 'index.html') return;
    const bar = $('.nav-bar', nav0), brand = bar && $('.brand', bar);
    if (!brand || !('IntersectionObserver' in window)) return;
    const title = doc.createElement('span');
    title.className = 'nav-title';
    title.setAttribute('aria-hidden', 'true');
    title.textContent = h1.textContent.replace(/\s+/g, ' ').trim();
    brand.after(title);
    const top = Math.round(bar.getBoundingClientRect().bottom);
    const io = new IntersectionObserver(es => es.forEach(e => {
      const behind = !e.isIntersecting && e.boundingClientRect.bottom <= (e.rootBounds ? e.rootBounds.top : top) + 1;
      title.classList.toggle('on', behind);
      root.classList.toggle('nav-titled', behind);
    }), { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
    io.observe(h1);
  };

  /* ====================================================================================
     6. tab bar: sliding pill, previous-tab start, tap the active tab to go to the top
     ==================================================================================== */
  const tabbar = () => {
    const bar = $('.tabbar');
    if (!bar) return;
    const ind = doc.createElement('span');
    ind.className = 'tab-ind';
    ind.setAttribute('aria-hidden', 'true');
    bar.insertBefore(ind, bar.firstChild);
    const items = () => $$(':scope > a, :scope > button', bar);
    const cur = () => items().find(i => i.classList.contains('active')) || null;
    const place = (item, instant) => {
      if (!item || !bar.offsetWidth) return false;
      const b = bar.getBoundingClientRect(), r = item.getBoundingClientRect(), ic = $('.i', item), ir = (ic || item).getBoundingClientRect();
      const x = r.left - b.left + r.width / 2 - 28, y = ir.top - b.top + ir.height / 2 - 15;
      if (instant) ind.style.transition = 'none';
      ind.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
      return true;
    };
    const c = cur();
    if (c) {
      bar.classList.add('has-ind');
      const from = items()[parseInt(sess.get('yb-tab'), 10)];
      sess.del('yb-tab');
      if (from && from !== c && !reduced() && place(from, true)) requestAnimationFrame(() => place(c, false));
      else place(c, true);
      if ('ResizeObserver' in window) new ResizeObserver(() => { const k = cur(); if (k) place(k, true); }).observe(bar);
    }
    bar.addEventListener('click', e => {
      const t = e.target.closest ? e.target.closest('a,button') : null;
      if (!t || t.parentNode !== bar) return;
      haptic('tick');
      if (t.tagName === 'A' && t.classList.contains('active')) {      // the active tab scrolls to the top instead of reloading the page
        e.preventDefault();
        scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      } else if (t.tagName === 'A') sess.set('yb-tab', String(items().indexOf(t)));
    });
  };

  /* ====================================================================================
     7. drag to dismiss: the panel follows the finger 1:1, then finishes or springs back
     ==================================================================================== */
  const dragDismiss = cfg => {
    const { panel, scope, backdrop, handle, close } = cfg;
    if (!panel || !scope) return;
    let st = null, raf = 0, closing = false, awaiting = false, cleanT = 0;
    const apply = (y, h) => {
      panel.style.transform = `translate3d(0,${y}px,0)`;
      if (backdrop) backdrop.style.opacity = String(clamp(1 - Math.max(y, 0) / h, 0, 1));
    };
    const cleanup = () => {
      clearTimeout(cleanT); closing = false; awaiting = false;
      scope.classList.remove('dragging'); panel.classList.remove('dragging');
      panel.style.removeProperty('transform'); panel.style.removeProperty('transition');
      if (backdrop) { backdrop.style.removeProperty('opacity'); backdrop.style.removeProperty('transition'); }
    };
    const velocity = s => {                                  // px/ms over the last ~80 ms (positive = downward)
      const a = s.s[0], b = s.s[s.s.length - 1];
      if (performance.now() - b[0] > 80) return 0;           // the finger rested before lifting: no fling
      return b[0] - a[0] > 8 ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    };
    const finish = (s, v) => {
      closing = awaiting = true;
      const rem = Math.max(0, s.h - s.y), dur = Math.round(clamp(rem / Math.max(v, 0.5), 120, 260));
      panel.style.transition = `transform ${dur}ms cubic-bezier(.2,.7,.3,1)`;
      panel.style.transform = `translate3d(0,${s.h}px,0)`;
      if (backdrop) { backdrop.style.transition = `opacity ${dur}ms ease-out`; backdrop.style.opacity = '0'; }
      haptic('tick');
      cleanT = setTimeout(() => {                            // let the owner's own close logic run (inert, focus, timers), then drop our inline state
        awaiting = false;
        try { close(); } catch (e) { /* ignore */ }
        cleanT = setTimeout(cleanup, 440);
      }, dur);
    };
    const springBack = () => {
      panel.style.transition = 'transform var(--dur-slow,300ms) var(--spring,cubic-bezier(.22,.8,.24,1))';
      panel.style.transform = 'translate3d(0,0,0)';
      if (backdrop) { backdrop.style.transition = 'opacity 200ms ease-out'; backdrop.style.opacity = ''; }
      closing = true;
      cleanT = setTimeout(cleanup, 340);
    };
    const onStart = e => {
      if (st || e.touches.length !== 1 || !cfg.enabled()) return;
      if (closing) cleanup();
      const t = e.touches[0];
      const onHandle = !!(e.target.closest && e.target.closest(handle));
      if (!onHandle && !(cfg.body && panel.scrollTop <= 0)) return;      // a scrolled panel scrolls
      st = { x0: t.clientX, y0: t.clientY, y: 0, own: false, dead: false, handle: onHandle, h: panel.offsetHeight || 1, s: [[performance.now(), 0]] };
      e.stopImmediatePropagation();                                      // main.js has its own (passive) sheet drag; two drags would double-translate
    };
    const onMove = e => {
      if (!st || st.dead) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - st.x0, dy = t.clientY - st.y0;
      if (!st.own) {
        e.stopImmediatePropagation();
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2 || (dy < 0 && !st.handle)) { st.dead = true; return; }   // sideways, or the content scrolling up: not ours
        st.own = true; st.y0 += Math.sign(dy) * 8; // start the drag from the slop edge: no jump
        scope.classList.add('dragging'); panel.classList.add('dragging');
        panel.style.removeProperty('transition');
        return onMove(e);
      }
      e.stopImmediatePropagation();
      if (e.cancelable) e.preventDefault();
      const d = t.clientY - st.y0;
      st.y = d > 0 ? d : Math.max(d * 0.2, -24);                         // upward is damped
      const now = performance.now();
      st.s.push([now, st.y]);
      while (st.s.length > 2 && now - st.s[0][0] > 80) st.s.shift();
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (st) apply(st.y, st.h); });
    };
    const onEnd = e => {
      if (!st) return;
      const s = st; st = null;
      if (!s.own) { if (!s.dead) e.stopImmediatePropagation(); return; }
      e.stopImmediatePropagation();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      apply(s.y, s.h);
      const v = e.type === 'touchcancel' ? 0 : velocity(s);
      if (s.y > s.h * 0.35 || v > 0.5) finish(s, v); else springBack();
    };
    panel.addEventListener('touchstart', onStart, { capture: true, passive: true });
    panel.addEventListener('touchmove', onMove, { capture: true, passive: false });
    panel.addEventListener('touchend', onEnd, { capture: true });
    panel.addEventListener('touchcancel', onEnd, { capture: true });
    // re-opened while our closing state is still pending: start clean
    new MutationObserver(() => { if (closing && !awaiting && cfg.isOpen()) cleanup(); })
      .observe(scope, { attributes: true, attributeFilter: ['class', 'hidden'] });
  };
  const dragPanels = () => {
    const sheet = $('.sheet');
    if (sheet) dragDismiss({
      panel: $('.sheet-panel', sheet), scope: sheet, backdrop: $('.sheet-backdrop', sheet), handle: '.sheet-handle,.sheet-head', body: true,
      enabled: () => true, isOpen: () => !sheet.hidden && sheet.classList.contains('open'),
      close: () => { const b = $('.sheet-head [data-close-sheet]', sheet) || $('[data-close-sheet]', sheet); if (b) b.click(); },
    });
    const phone = matchMedia('(max-width:760px)');
    const search = $('.search');
    if (search) dragDismiss({
      panel: $('.search-panel', search), scope: search, backdrop: $('.search-backdrop', search), handle: '.search-bar', body: false,
      enabled: () => phone.matches, isOpen: () => !search.hidden,
      close: () => { if (window.YanabeeSearch && YanabeeSearch.close) YanabeeSearch.close(); },
    });
    const chat = $('.chat');
    if (chat) dragDismiss({
      panel: $('.chat-panel', chat), scope: chat, backdrop: null, handle: '.chat-head', body: false,
      enabled: () => phone.matches, isOpen: () => !chat.hidden,
      close: () => { if (window.YanabeeChat && YanabeeChat.close) YanabeeChat.close(); },
    });
  };

  /* ====================================================================================
     8a. wave scroll progress (moves only while the page moves, plus a short tail)
     ==================================================================================== */
  const progress = () => {
    const bar = $('.progress');
    if (!bar || reduced()) return;
    const head = doc.createElement('i');
    head.className = 'wow-head';
    head.setAttribute('aria-hidden', 'true');
    bar.appendChild(head);
    root.classList.add('wow-prog');
    let W = bar.clientWidth, flowT = 0;
    const read = () => { const m = /scaleX\(([\d.eE+-]+)\)/.exec(bar.style.transform || ''); return m ? clamp(+m[1], 0, 1) : 0; };
    let lastP = -1;
    const update = () => {
      const p = read();
      if (p === lastP) return;
      lastP = p;
      bar.style.setProperty('--p', p.toFixed(4));
      head.style.transform = `translate3d(${(W * (1 - p)).toFixed(1)}px,0,0)`;
      bar.classList.toggle('on', p > 0.002 && p < 0.998);
      bar.classList.add('flow');
      clearTimeout(flowT);
      flowT = setTimeout(() => bar.classList.remove('flow'), 300);   // the wave only moves while the page moves
    };
    window.addEventListener('yanabee:scroll', update);
    addEventListener('resize', () => { W = bar.clientWidth; lastP = -1; update(); }, { passive: true });
    update();
  };

  /* ====================================================================================
     8b. light parallax, applied 1:1 in the scroll handler (no easing, so it never lags behind the finger)
     ==================================================================================== */
  const parallax = () => {
    if (reduced() || !('IntersectionObserver' in window)) return;
    // [selector, rate (+ = lags behind the page), max shift px]
    const SPEC = [
      ['.hero-art', 0.08, 24],
      ['.b-photo img, .b-photo svg', 0.08, 24],
      ['.tc-art img, .tc-art svg', 0.06, 14],
      ['.cta-bg', 0.08, 24],
      ['.init-pattern', 0.1, 24],
    ];
    const items = [];
    const seen = new Set();
    const add = (el, k, amp, blob) => {
      if (seen.has(el) || !Number.isFinite(k)) return;
      seen.add(el);
      if (!blob) el.classList.add('wow-par');
      items.push({ el, k: Math.min(k, 0.1), amp: Math.min(amp, 24), cur: 0, vis: false, blob: !!blob });
    };
    SPEC.forEach(([sel, k, amp]) => $$(sel).forEach(el => add(el, k, amp)));
    $$('[data-par]').forEach(el => { const k = parseFloat(el.dataset.par); add(el, Number.isFinite(k) ? k : 0.08, 24); });
    $$('.hero-bg').filter(b => $('.blob', b)).forEach(el => { el.classList.add('wow-par-blobs'); add(el, 0.06, 24, true); });
    if (!items.length) return;
    root.classList.add('wow-par-on');

    const io = new IntersectionObserver(es => es.forEach(e => {
      const it = items.find(i => i.el === e.target);
      if (it) it.vis = e.isIntersecting;
      apply();
    }), { rootMargin: '140px 0px' });
    items.forEach(i => io.observe(i.el));

    const apply = () => {
      if (reduced()) {                                         // preference switched on while the page is open: put everything back
        items.forEach(it => { it.cur = 0; if (it.blob) it.el.style.removeProperty('--wy'); else it.el.style.translate = ''; });
        return;
      }
      const y = scrollY, vh = innerHeight;
      const act = items.filter(i => i.vis);
      const rects = act.map(i => i.el.getBoundingClientRect());           // reads first ...
      act.forEach((it, n) => {
        const r = rects[n];
        if (!r.width && !r.height) return;
        const centre = r.top + r.height / 2 + y - (it.blob ? 0 : it.cur); // unshifted page centre
        const ref = Math.max(0, centre - vh / 2);
        it.cur = clamp(it.k * (y - ref), -it.amp, it.amp);
      });
      act.forEach(it => {                                                    // ... then writes
        if (it.blob) it.el.style.setProperty('--wy', it.cur.toFixed(2) + 'px');
        else it.el.style.translate = `0 ${it.cur.toFixed(2)}px`;
      });
    };
    addEventListener('scroll', apply, { passive: true });
    addEventListener('resize', apply, { passive: true });
    apply();
  };

  /* ====================================================================================
     8c. cursor (fine pointers, no reduced motion): the native cursor stays. A ring swells around the pointer over interactive
         things (attached 1:1, no follower, no trail); a press splashes a few droplets and rings (< 450 ms)
     ==================================================================================== */
  const cursor = (() => {
    const INTERACTIVE = 'a[href],button,[role=tab],[role=button],[role=link],summary,select,label,input[type=checkbox],input[type=radio],input[type=range],input[type=submit],input[type=button],.card,[data-goto],.chip,[tabindex]:not([tabindex="-1"])';
    const TEXTFIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=button]),textarea,[contenteditable=""],[contenteditable="true"]';
    let cv = null, ctx = null, W = 0, H = 0, dpr = 1, live = false, wired = false;
    const S = { x: 0, y: 0, ring: 0, ringT: 0, a: 0, at: 0, col: [18, 168, 164], colT: [18, 168, 164], seen: false, hidden: false, dirty: false };
    const parts = [], rings = [];
    let accent = [18, 168, 164], lastTarget = null, down = false, scrollT = 0;

    const size = () => {
      if (!cv) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ensureCanvas = () => {
      if (cv || !doc.body) return !!cv;
      cv = doc.createElement('canvas');
      cv.className = 'wow-cursor';
      cv.setAttribute('aria-hidden', 'true');
      ctx = cv.getContext('2d');
      if (!ctx) { cv = null; return false; }
      doc.body.appendChild(cv);
      size();
      return true;
    };
    const readAccent = () => { accent = rgbOf(cssVar(root, '--accent'), [18, 168, 164]); };

    // droplet: round belly facing the direction of travel (angle), pointed tail trailing behind it
    const dropPath = (c, x, y, r, ang, tail) => {
      const d = r * Math.max(1.001, tail);
      const b = Math.acos(r / d);
      c.save();
      c.translate(x, y); c.rotate(ang);
      c.beginPath();
      c.moveTo(-d, 0);
      c.quadraticCurveTo(-(r + d) * 0.46, -r * 0.62 * Math.sin(b) * 0.9, r * Math.cos(Math.PI - b), -r * Math.sin(b));
      c.arc(0, 0, r, -(Math.PI - b), Math.PI - b, false);
      c.quadraticCurveTo(-(r + d) * 0.46, r * 0.62 * Math.sin(b) * 0.9, -d, 0);
      c.closePath();
      c.restore();
    };
    const col = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

    const spawn = (x, y, vx, vy, r0, life, g) => {
      if (parts.length > 60) parts.shift();
      parts.push({ x, y, vx, vy, r0, life, g, age: 0 });
    };
    const splash = (x, y, n) => {
      n = n || 10;
      if (!ensureCanvas()) return;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * rand(0.06, 0.94), sp = rand(3.4, 9);
        spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(2.6, 5.4), rand(320, 440), 0.34);
      }
      rings.push({ x, y, age: 0, life: 420, r: 54 }, { x, y, age: -60, life: 380, r: 30 });
      live = true;
      run(step);
    };

    const step = dt => {
      if (!cv) return false;
      const k = dt / 16.667;
      const ez = 1 - Math.pow(0.0001, k / 14);
      S.ring += (S.ringT - S.ring) * ez; S.a += (S.at - S.a) * Math.min(1, ez * 0.9);
      for (let i = 0; i < 3; i++) S.col[i] += (S.colT[i] - S.col[i]) * ez;

      const dark = isDark();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const c = S.col;
      const edge = dark ? c : [c[0] * 0.55, c[1] * 0.55, c[2] * 0.62];

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.vy += p.g * k; p.vx *= Math.pow(0.99, k);
        p.x += p.vx * k; p.y += p.vy * k;
        const t = p.age / p.life, a = Math.pow(1 - t, 0.85);
        dropPath(ctx, p.x, p.y, p.r0 * (1 - 0.5 * t), Math.atan2(p.vy, p.vx), 1.5 + Math.min(Math.hypot(p.vx, p.vy) * 0.16, 1.8));
        ctx.fillStyle = col(c, a * (dark ? 0.9 : 0.8));
        ctx.fill();
        if (!dark) { ctx.strokeStyle = col(edge, a * 0.55); ctx.lineWidth = 0.8; ctx.stroke(); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        g.age += dt;
        if (g.age >= g.life) { rings.splice(i, 1); continue; }
        if (g.age < 0) continue;
        const t = g.age / g.life, e = 1 - Math.pow(1 - t, 3);
        ctx.beginPath();
        ctx.arc(g.x, g.y, 5 + g.r * e, 0, Math.PI * 2);
        ctx.lineWidth = 2.4 * (1 - t) + 0.5;
        ctx.strokeStyle = col(dark ? c : edge, (1 - t) * (dark ? 0.85 : 0.75));
        ctx.stroke();
      }
      // hover ring: attached to the pointer, only over interactive things
      if (S.ring > 0.02 && S.a > 0.012) {
        const rr = 13 + 13 * S.ring;
        ctx.beginPath(); ctx.arc(S.x, S.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = col(c, 0.09 * S.ring * S.a);
        ctx.fill();
        ctx.lineWidth = 1.7;
        ctx.strokeStyle = col(dark ? c : edge, 0.78 * S.ring * S.a);
        ctx.stroke();
      }
      S.dirty = false;
      const settled = !parts.length && !rings.length && Math.abs(S.ring - S.ringT) < 0.01 && Math.abs(S.a - S.at) < 0.008
        && Math.abs(S.col[0] - S.colT[0]) + Math.abs(S.col[1] - S.colT[1]) + Math.abs(S.col[2] - S.colT[2]) < 2;
      if (settled) {
        S.ring = S.ringT; S.a = S.at; S.col = S.colT.slice();
        live = false;
        if (S.ring < 0.02) ctx.clearRect(0, 0, W, H);
        return false;
      }
      return true;
    };
    const wake = () => { if (!cv) return; live = true; run(step); };

    const tintOf = el => rgbOf(cssVar(el, '--tc') || cssVar(el, '--sc'), accent);
    const classify = t => {
      lastTarget = t;
      const field = !!(t && t.closest && t.closest(TEXTFIELD));
      const hov = t && t.closest ? t.closest(INTERACTIVE) : null;
      S.hidden = field;
      S.at = field ? 0 : 1;
      S.ringT = hov && !field ? 1 : 0;
      S.colT = hov && !field ? tintOf(hov) : accent.slice();
    };
    const selecting = () => {
      if (!down) return false;
      const s = getSelection();
      return !!(s && !s.isCollapsed && s.toString().length > 1);
    };

    const onMove = e => {
      if (e.pointerType === 'touch') return;
      S.x = e.clientX; S.y = e.clientY;
      S.seen = true;
      const was = S.ringT;
      if (e.target !== lastTarget) classify(e.target);
      if (selecting()) S.at = 0; else if (!S.hidden && S.at === 0) S.at = 1;
      if (S.ring > 0.02 || S.ringT !== was || S.ringT) { S.dirty = true; wake(); }   // nothing is drawn over plain content: no work
    };
    const onDown = e => {
      if (e.pointerType === 'touch' || e.button > 0) return;
      down = true;
      S.x = e.clientX; S.y = e.clientY; S.seen = true;
      if (e.target !== lastTarget) classify(e.target);
      if (!S.hidden) splash(e.clientX, e.clientY, 9);
    };
    const onUp = () => { down = false; if (!S.hidden && S.seen && S.at === 0) { S.at = 1; wake(); } };
    const onLeave = () => { S.at = 0; lastTarget = null; wake(); };
    const onScroll = () => {            // content moved under a resting pointer: re-check what is under it
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        if (!S.seen || !cv) return;
        const t = doc.elementFromPoint(S.x, S.y);
        if (t && t !== lastTarget) { classify(t); wake(); }
      }, 110);
    };
    const onTheme = () => { readAccent(); if (!lastTarget || !(lastTarget.closest && lastTarget.closest(INTERACTIVE))) S.colT = accent.slice(); if (cv && S.seen) wake(); };
    const onResize = () => { if (cv) { size(); wake(); } };

    const wire = () => {
      if (wired) return; wired = true;
      doc.addEventListener('pointermove', onMove, { passive: true });
      doc.addEventListener('pointerdown', onDown, { passive: true });
      doc.addEventListener('pointerup', onUp, { passive: true });
      doc.addEventListener('pointercancel', onUp, { passive: true });
      doc.documentElement.addEventListener('mouseleave', onLeave);
      addEventListener('blur', onLeave);
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onResize, { passive: true });
      window.addEventListener('themechange', onTheme);
    };
    const unwire = () => {
      if (!wired) return; wired = false;
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onUp);
      doc.documentElement.removeEventListener('mouseleave', onLeave);
      removeEventListener('blur', onLeave);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      window.removeEventListener('themechange', onTheme);
    };
    const enabled = () => !!cv && wired;
    const enable = () => {
      if (reduced() || !mqFine.matches || !ensureCanvas()) return false;
      readAccent(); S.col = accent.slice(); S.colT = accent.slice();
      wire();
      return true;
    };
    const disable = () => { unwire(); if (cv) { cv.remove(); cv = null; ctx = null; } parts.length = rings.length = 0; live = false; S.seen = false; };
    const onPrefs = () => { if (reduced() || !mqFine.matches) disable(); else enable(); };
    onMQ(mqReduce, onPrefs); onMQ(mqFine, onPrefs);
    return { enable, disable, enabled, splash: (x, y, n) => { if (!reduced()) splash(x, y, n); } };
  })();

  /* ====================================================================================
     public API (defined before anything can fail) and boot
     ==================================================================================== */
  const app = { toast, haptic, go: nav.go };
  window.YanabeeApp = app;
  window.YanabeeWow = { go: nav.go, sound, cursor, busy: () => tasks.size };

  safe('arrive', nav.arrive);
  safe('reveals', reveals);
  safe('sound', sound.mount);
  safe('cursor', cursor.enable);
  safe('segs', segs.boot);
  safe('nav visible', keepNavVisible);
  safe('navbar', navbar);
  safe('tabbar', tabbar);
  safe('drag', dragPanels);
  safe('progress', progress);
  safe('parallax', parallax);

  // soft drop on every click of something clickable (only when the user switched sound on)
  doc.addEventListener('click', e => {
    if (!sound.enabled() || !e.isTrusted) return;
    const el = e.target && e.target.closest ? e.target.closest('a[href],button,[role=tab],[role=button],summary,select,input[type=checkbox],input[type=radio],[data-goto],.chip') : null;
    if (!el || el.classList.contains('sound-btn')) return;
    sound.play('drop', { pitch: sound.pitchFor(el) });
  }, true);
})();
