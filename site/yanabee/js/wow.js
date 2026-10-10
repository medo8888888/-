// Sitewide "wow" layer (every page, classic script, no dependencies, works from file://).
//   1. water-drop cursor      fine pointer + no reduced motion: a droplet that follows the native cursor with spring lag,
//                             sheds droplets when moving fast, swells into a ring over interactive things, splashes on press
//   2. water-wipe transitions same-site page links flood the screen from the click point, the next page drains away
//   3. headline reveals       h1/h2 in <main> rise word by word out of a mask (never letter by letter: Arabic keeps joining)
//   4. wave scroll progress   the .progress bar becomes a flowing wave led by a droplet
//   5. scroll parallax        [data-par="0.2"] and a few auto-detected decorative layers drift at their own speed
//   6. water sound            OFF by default; WebAudio synth (no assets); button in .nav .actions, state in localStorage
// Everything is enhancement only. Reduced motion switches 1-5 off completely; idle = no rAF loop, no timers.
//
// API:  window.YanabeeWow = { sound, cursor, wipe, go }
//   sound.play(type, {pitch})   'drop' | 'ripple' | 'whoosh' | 'good' | 'bad'   (silent unless the user turned sound on)
//   sound.enabled() / sound.set(bool)
//   cursor.splash(x, y)         droplets + ring at a point (also usable on touch)  | cursor.enabled()
//   wipe(href, x, y, colour)    navigate with the water wipe (= go)
//   busy()                      number of rAF tasks running right now (0 when the page is idle)
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

  /* ---------------- one shared rAF loop: tasks run while they return true ---------------- */
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
     6. water sound (defined first: the wipe and the click handler use it)
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
      whoosh(t) {                 // filtered noise sweep for the page wipe
        burst(t, 0.46, 320, 0.9, 0.5, 2300);
        tone(t, 'sine', 180, 520, 0.4, 0.07, 0.12);
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
     2. water-wipe page transitions
     ==================================================================================== */
  const wipe = (() => {
    const KEY = 'yb-wipe';
    const COVER = 460;          // ms until the page is fully covered, then we navigate
    const FAILSAFE = 1000;      // ms after navigating that we uncover again if we are still here (stopped / cancelled / blocked)
    let leaving = false, overlay = null, navT = 0, safeT = 0;

    // site root (directory that holds js/wow.js), so absolute /yanabee/ URLs on the 404 page count as internal too
    const siteRoot = (() => {
      try {
        const s = (doc.currentScript && doc.currentScript.src) || ($('script[src*="wow.js"]') || {}).src;
        return new URL('../', s).href;
      } catch (e) { return ''; }
    })();
    const norm = p => p.replace(/index\.html$/, '').replace(/\/+$/, '');

    // Is this link a navigation to another page of the site? -> URL or null
    const target = a => {
      if (!a || typeof a.href !== 'string' || !a.hasAttribute('href')) return null;
      if (a.target && a.target !== '_self') return null;
      if (a.hasAttribute('download') || /\bexternal\b/.test(a.rel || '')) return null;
      let u;
      try { u = new URL(a.href); } catch (e) { return null; }
      if (!siteRoot || u.href.indexOf(siteRoot) !== 0) return null;
      if (!/(\.html|\/)$/.test(u.pathname)) return null;
      if (norm(u.pathname) === norm(location.pathname)) return null; // same page: hash scroll / reload stay native
      return u;
    };
    const centreOf = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const teamTint = (a, u) => {
      let v = cssVar(a, '--tc'); // custom properties inherit, so this already reflects the closest team card
      if (!v) { const m = /#(t[1-7])$/.exec(u.hash); if (m) v = cssVar(root, '--' + m[1]); }
      if (!v) v = cssVar(a, '--sc') || cssVar(root, '--accent');
      return rgbOf(v, [18, 168, 164]);
    };

    const uncover = (instant) => {
      clearTimeout(navT); clearTimeout(safeT);
      leaving = false;
      sess.del(KEY);
      root.classList.remove('wipe-out');
      overlay = null;
      $$('.yb-wipe').forEach(o => {
        if (instant) { o.remove(); return; }
        o.classList.add('out');
        setTimeout(() => o.remove(), 360);
      });
    };

    const go = (href, x, y, colour) => {
      let u = null;
      try { u = new URL(href, location.href); } catch (e) { /* ignore */ }
      if (!u) return false;
      if (reduced() || leaving || !doc.body || !siteRoot || u.href.indexOf(siteRoot) !== 0 || norm(u.pathname) === norm(location.pathname)) {
        if (!leaving) location.href = u.href;
        return false;
      }
      leaving = true;
      const W = innerWidth, H = innerHeight;
      x = Number.isFinite(x) ? clamp(x, 0, W) : W / 2;
      y = Number.isFinite(y) ? clamp(y, 0, H) : H / 2;
      const rgb = colour && colour.length === 3 ? colour : rgbOf(cssVar(root, '--accent'), [18, 168, 164]);
      const c = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      const R = Math.ceil(Math.hypot(Math.max(x, W - x), Math.max(y, H - y))) + 4;
      overlay = doc.createElement('div');
      overlay.className = 'yb-wipe';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = `--wx:${x.toFixed(1)}px;--wy:${y.toFixed(1)}px;--wr:${R}px;--wc:${c}`;
      overlay.innerHTML = '<i class="a"></i><i class="b"></i>';
      doc.body.appendChild(overlay);
      root.classList.add('wipe-out');
      void overlay.offsetWidth;
      overlay.classList.add('go');
      sound.play('whoosh');
      sess.set(KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y), c, t: Date.now() }));
      navT = setTimeout(() => {
        location.href = u.href;
        safeT = setTimeout(() => uncover(false), FAILSAFE); // still here: the navigation was stopped or cancelled
      }, COVER);
      return true;
    };

    doc.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced()) return;
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      const u = a && target(a);
      if (!u) return;
      e.preventDefault();
      const keyboard = e.detail === 0 || (!e.clientX && !e.clientY);
      const [x, y] = keyboard ? centreOf(a) : [e.clientX, e.clientY];
      go(u.href, x, y, teamTint(a, u));
    });
    // Esc stops the navigation and uncovers the page
    addEventListener('keydown', e => { if (e.key === 'Escape' && leaving) { try { window.stop(); } catch (err) { /* ignore */ } uncover(false); } });
    // back/forward cache: the page comes back exactly as we left it, i.e. covered
    addEventListener('pageshow', e => { if (e.persisted) { uncover(true); root.classList.remove('wipe-in', 'wipe-play'); } });

    // ---- arriving on a page that was opened through a wipe (html.wipe-in was set by the inline head script) ----
    const arrive = () => {
      if (!root.classList.contains('wipe-in')) { sess.del(KEY); return Promise.resolve(); }
      let st = null;
      try { st = JSON.parse(sess.get(KEY)); } catch (e) { st = null; }
      sess.del(KEY);
      const W = innerWidth, H = innerHeight;
      const x = st && Number.isFinite(st.x) ? clamp(st.x, 0, W) : W / 2;
      const y = st && Number.isFinite(st.y) ? clamp(st.y, 0, H) : H / 2;
      const R = Math.ceil(Math.hypot(Math.max(x, W - x), Math.max(y, H - y))) + 4;
      root.style.setProperty('--wx', x + 'px');
      root.style.setProperty('--wy', y + 'px');
      root.style.setProperty('--wr', R + 'px');
      if (st && st.c) root.style.setProperty('--wc', st.c);
      return new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return; done = true;
          root.classList.remove('wipe-in', 'wipe-play');
          ['--wx', '--wy', '--wr', '--wc'].forEach(p => root.style.removeProperty(p));
          resolve();
        };
        if (reduced()) { finish(); return; }
        root.addEventListener('animationend', ev => { if (ev.animationName === 'wow-open') { setTimeout(finish, 70); } });
        setTimeout(finish, 1000);
        requestAnimationFrame(() => root.classList.add('wipe-play'));
        setTimeout(resolve, 240); // headings may start while the water is still draining
      });
    };

    const ready = arrive();
    const api = (href, x, y, colour) => go(href, x, y, colour);
    api.go = api;
    api.target = target;
    api.ready = ready;
    api.active = () => leaving;
    return api;
  })();

  /* ====================================================================================
     3. word-by-word headline reveals
     ==================================================================================== */
  const headings = (() => {
    if (reduced()) return null;
    const SKIP = '.verse,.hadith,.chat,.search,.sheet,.nav,.tabbar,footer,[data-no-split]';
    const mk = (cls) => { const s = doc.createElement('span'); s.className = cls; return s; };
    let hold = true;
    const held = new Set();
    let io = null;

    // element whose text is painted through its own background (gradient text): it cannot contain transformed
    // descendants, so it is revealed as ONE unit instead of word by word
    const clipsText = el => { const cs = getComputedStyle(el); return (cs.webkitBackgroundClip || cs.backgroundClip) === 'text'; };

    const split = h => {
      let n = 0;
      const word = txt => {
        const w = mk('w'), i = mk('wi');
        i.textContent = txt;
        w.appendChild(i);
        w.style.setProperty('--i', n++);
        return w;
      };
      const walk = node => {
        Array.from(node.childNodes).forEach(ch => {
          if (ch.nodeType === 3) {
            if (!/\S/.test(ch.nodeValue)) return;
            const frag = doc.createDocumentFragment();
            ch.nodeValue.split(/(\s+)/).forEach(p => {
              if (!p) return;
              frag.appendChild(/^\s+$/.test(p) ? doc.createTextNode(p) : word(p));
            });
            node.replaceChild(frag, ch);
          } else if (ch.nodeType === 1) {
            const tag = ch.tagName.toLowerCase();
            if (tag === 'svg' || tag === 'img' || tag === 'br' || tag === 'canvas') return;
            if (tag === 'bdi' || clipsText(ch)) {
              ch.classList.add('wow-u');
              ch.style.setProperty('--i', n++);
              if (getComputedStyle(ch).display === 'inline' && !/\s/.test(ch.textContent.trim())) ch.classList.add('wow-ui');
            } else walk(ch);
          }
        });
      };
      walk(h);
      if (!n) return false;
      h.classList.add('wow-split');
      h.style.setProperty('--step', clamp(640 / n, 26, 70).toFixed(0) + 'ms');
      h.dataset.wow = String(n);
      return true;
    };
    const play = h => {
      if (h.classList.contains('wow-go')) return;
      h.classList.add('wow-go');
      const n = +h.dataset.wow || 1;
      setTimeout(() => h.classList.add('wow-done'), n * 70 + 1300); // drop the mask once everything has settled
    };

    const items = $$('main h1, main h2').filter(h => !h.closest(SKIP) && h.textContent.trim() && split(h));
    if (!items.length) return null;
    if (!('IntersectionObserver' in window)) { items.forEach(play); return { items }; }
    io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      if (hold) held.add(e.target); else play(e.target);
    }), { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    items.forEach(h => io.observe(h));
    // hold the headings back until the page-arrival water has mostly drained (immediately when there is none)
    const introGate = root.classList.contains('intro-on')
      ? new Promise(r => { addEventListener('yanabee:intro-reveal', r, { once: true }); setTimeout(r, 6500); })
      : Promise.resolve();
    Promise.all([wipe.ready, introGate]).then(() => { hold = false; held.forEach(play); held.clear(); });
    return { items, play };
  })();

  /* ====================================================================================
     4. wave scroll progress
     ==================================================================================== */
  (() => {
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
      flowT = setTimeout(() => bar.classList.remove('flow'), 650); // the wave only moves while the page moves
    };
    window.addEventListener('yanabee:scroll', update);
    addEventListener('resize', () => { W = bar.clientWidth; lastP = -1; update(); }, { passive: true });
    update();
  })();

  /* ====================================================================================
     5. scroll parallax
     ==================================================================================== */
  (() => {
    if (reduced() || !('IntersectionObserver' in window)) return;
    // [selector, rate (+ = lags behind the page), max shift px]
    const SPEC = [
      ['.hero-art', 0.12, 38],
      ['.b-photo img, .b-photo svg', 0.1, 30],
      ['.tc-art img, .tc-art svg', 0.08, 14],
      ['.cta-bg', 0.1, 34],
      ['.init-pattern', 0.14, 34],
    ];
    const items = [];
    const seen = new Set();
    const add = (el, k, amp) => {
      if (seen.has(el) || !Number.isFinite(k)) return;
      seen.add(el);
      el.classList.add('wow-par');
      items.push({ el, k, amp, cur: 0, vis: false });
    };
    SPEC.forEach(([sel, k, amp]) => $$(sel).forEach(el => add(el, k, amp)));
    $$('[data-par]').forEach(el => { const k = parseFloat(el.dataset.par); add(el, Number.isFinite(k) ? k : 0.2, 80); });
    // hero blobs: shared offset on .hero-bg (fx.js owns their `translate` for the pointer light; wow.css adds this term to it)
    const blobs = $$('.hero-bg').filter(b => $('.blob', b)).map(el => ({ el, k: 0.16, amp: 44, cur: 0, vis: false, blob: true }));
    blobs.forEach(b => { b.el.classList.add('wow-par-blobs'); items.push(b); });
    if (!items.length) return;
    root.classList.add('wow-par-on');

    const io = new IntersectionObserver(es => es.forEach(e => {
      const it = items.find(i => i.el === e.target);
      if (it) it.vis = e.isIntersecting;
      wake();
    }), { rootMargin: '140px 0px' });
    items.forEach(i => io.observe(i.el));

    let sy = scrollY, moving = 0;
    const step = dt => {
      if (reduced()) {                                         // preference switched on while the page is open: put everything back
        items.forEach(it => { it.cur = 0; if (it.blob) it.el.style.removeProperty('--wy'); else it.el.style.translate = ''; });
        return false;
      }
      const y = scrollY, vh = innerHeight;
      const act = items.filter(i => i.vis);
      const rects = act.map(i => i.el.getBoundingClientRect());           // reads first ...
      let busy = false;
      const ease = 1 - Math.exp(-dt / 120);
      act.forEach((it, n) => {
        const r = rects[n];
        if (!r.width && !r.height) return;
        const centre = r.top + r.height / 2 + y - (it.blob ? 0 : it.cur); // unshifted page centre
        const ref = Math.max(0, centre - vh / 2);
        const want = clamp(it.k * (y - ref), -it.amp, it.amp);
        const d = want - it.cur;
        if (Math.abs(d) > 0.05) { it.cur += d * ease; busy = true; } else it.cur = want;
        it.next = it.cur;
      });
      act.forEach(it => {                                                    // ... then writes
        if (it.blob) it.el.style.setProperty('--wy', it.next.toFixed(2) + 'px');
        else it.el.style.translate = `0 ${it.next.toFixed(2)}px`;
      });
      sy = y;
      if (busy) moving = 6; else moving--;
      return busy || moving > 0 || sy !== scrollY;
    };
    const wake = () => { moving = 6; run(step); };
    addEventListener('scroll', wake, { passive: true });
    addEventListener('resize', wake, { passive: true });
    wake();
  })();

  /* ====================================================================================
     1. water-drop cursor
     ==================================================================================== */
  const cursor = (() => {
    const INTERACTIVE = 'a[href],button,[role=tab],[role=button],[role=link],summary,select,label,input[type=checkbox],input[type=radio],input[type=range],input[type=submit],input[type=button],.card,[data-goto],.chip,[tabindex]:not([tabindex="-1"])';
    const TEXTFIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=button]),textarea,[contenteditable=""],[contenteditable="true"]';
    let cv = null, ctx = null, W = 0, H = 0, dpr = 1, live = false, wired = false;
    const BASE_R = 7.5, HOVER_R = 4.6;
    const S = { tx: 0, ty: 0, px: 0, py: 0, x: 0, y: 0, vx: 0, vy: 0, r: BASE_R, rt: BASE_R, ring: 0, ringT: 0, a: 0, at: 0, press: 0, seen: false, col: [18, 168, 164], colT: [18, 168, 164], hidden: false };
    const parts = [], rings = [];
    let accent = [18, 168, 164], lastTarget = null, down = false, lastScroll = 0, scrollT = 0;

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
      if (parts.length > 140) parts.shift();
      parts.push({ x, y, vx, vy, r0, life, g, age: 0 });
    };
    const splash = (x, y, n) => {
      n = n || 13;
      if (!ensureCanvas()) return;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * rand(0.06, 0.94), sp = rand(3.4, 10.5);
        spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(2.8, 6), rand(750, 1200), 0.28);
      }
      rings.push({ x, y, age: 0, life: 720, r: 64 }, { x, y, age: -120, life: 720, r: 36 });
      S.press = 1;
      live = true;
      run(step);
    };

    const step = (dt) => {
      if (!cv) return false;
      const k = dt / 16.667;
      // pointer speed (for shedding droplets)
      const pdx = S.tx - S.px, pdy = S.ty - S.py; S.px = S.tx; S.py = S.ty;
      S.ps = Math.max(Math.hypot(pdx, pdy) / k, (S.ps || 0) * Math.pow(0.82, k)); // smoothed: events can arrive less often than frames
      const ps = S.ps;
      // spring-lagged follower
      S.vx = (S.vx + (S.tx - S.x) * 0.15 * k) * Math.pow(0.77, k);
      S.vy = (S.vy + (S.ty - S.y) * 0.15 * k) * Math.pow(0.77, k);
      S.x += S.vx * k; S.y += S.vy * k;
      const sp = Math.hypot(S.vx, S.vy);
      const ez = 1 - Math.pow(0.0001, k / 14);     // ~ critically smooth easing toward targets
      S.r += (S.rt - S.r) * ez; S.ring += (S.ringT - S.ring) * ez; S.a += (S.at - S.a) * Math.min(1, ez * 0.9);
      S.press *= Math.pow(0.9, k);
      for (let i = 0; i < 3; i++) S.col[i] += (S.colT[i] - S.col[i]) * ez;

      // trail: droplets detach when the pointer moves fast
      if (S.a > 0.3 && !S.hidden && ps > 7) {
        const n = ps > 36 ? 4 : ps > 16 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          spawn(S.x + rand(-5, 5), S.y + rand(-5, 5), pdx / k * 0.12 + rand(-0.9, 0.9), pdy / k * 0.12 + rand(-1.2, 0.2),
            rand(2.4, 5) + Math.min(ps / 45, 2), rand(800, 1350), 0.13);
        }
      }

      // ---- draw ----
      const dark = isDark();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      const baseA = dark ? 0.9 : 0.8;
      const c = S.col;
      const edge = dark ? c : [c[0] * 0.55, c[1] * 0.55, c[2] * 0.62];

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.vy += p.g * k; p.vx *= Math.pow(0.992, k);
        p.x += p.vx * k; p.y += p.vy * k;
        const t = p.age / p.life, a = Math.pow(1 - t, 0.85);
        const r = p.r0 * (1 - 0.5 * t);
        dropPath(ctx, p.x, p.y, r, Math.atan2(p.vy, p.vx), 1.5 + Math.min(Math.hypot(p.vx, p.vy) * 0.16, 1.8));
        ctx.fillStyle = col(c, a * baseA);
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
        ctx.lineWidth = 2.6 * (1 - t) + 0.5;
        ctx.strokeStyle = col(dark ? c : edge, (1 - t) * (dark ? 0.85 : 0.75));
        ctx.stroke();
      }

      // follower
      if (S.a > 0.012) {
        const squash = 1 - 0.28 * S.press;
        const r = S.r * squash + (S.ring > 0.05 ? 0 : 0);
        const ang = sp > 0.6 ? Math.atan2(S.vy, S.vx) : -Math.PI / 2;
        const tail = 1 + Math.min(sp * 0.11, 2.1) * (1 - S.ring * 0.75);
        // glow
        const gr = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, r * 3.6 + S.ring * 18);
        gr.addColorStop(0, col(c, (dark ? 0.5 : 0.3) * S.a));
        gr.addColorStop(1, col(c, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(S.x, S.y, r * 3.6 + S.ring * 18, 0, Math.PI * 2); ctx.fill();
        // ring over interactive things
        if (S.ring > 0.02) {
          const rr = 13 + 13 * S.ring;
          ctx.beginPath(); ctx.arc(S.x, S.y, rr, 0, Math.PI * 2);
          ctx.fillStyle = col(c, 0.09 * S.ring * S.a);
          ctx.fill();
          ctx.lineWidth = 1.7;
          ctx.strokeStyle = col(dark ? c : edge, 0.78 * S.ring * S.a);
          ctx.stroke();
        }
        // droplet body
        dropPath(ctx, S.x, S.y, r, ang, tail);
        const bg = ctx.createRadialGradient(S.x - r * 0.3, S.y - r * 0.35, 0, S.x, S.y, r * 1.5);
        bg.addColorStop(0, col(dark ? [Math.min(255, c[0] + 70), Math.min(255, c[1] + 70), Math.min(255, c[2] + 70)] : c, baseA * S.a));
        bg.addColorStop(1, col(c, baseA * 0.55 * S.a));
        ctx.fillStyle = bg; ctx.fill();
        if (!dark) { ctx.strokeStyle = col(edge, 0.7 * S.a); ctx.lineWidth = 0.9; ctx.stroke(); }
        // specular glint
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.ellipse(S.x - r * 0.32, S.y - r * 0.38, r * 0.3, r * 0.2, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.7 * S.a).toFixed(3)})`; ctx.fill();
      }

      // keep running only while something moves
      const settled = !parts.length && !rings.length && Math.abs(S.tx - S.x) < 0.12 && Math.abs(S.ty - S.y) < 0.12 && sp < 0.03
        && S.ps < 0.5 && Math.abs(S.r - S.rt) < 0.03 && Math.abs(S.ring - S.ringT) < 0.01 && Math.abs(S.a - S.at) < 0.008 && S.press < 0.02
        && Math.abs(S.col[0] - S.colT[0]) + Math.abs(S.col[1] - S.colT[1]) + Math.abs(S.col[2] - S.colT[2]) < 2;
      if (settled) {
        S.x = S.tx; S.y = S.ty; S.vx = S.vy = 0; S.r = S.rt; S.ring = S.ringT; S.a = S.at; S.press = 0; S.col = S.colT.slice();
        live = false;
        if (S.a < 0.01) ctx.clearRect(0, 0, W, H);
        return false;
      }
      return true;
    };
    const wake = () => { if (cv && !live) { live = true; run(step); } else if (cv) run(step); };

    const tintOf = el => rgbOf(cssVar(el, '--tc') || cssVar(el, '--sc'), accent);
    const classify = t => {
      lastTarget = t;
      const field = !!(t && t.closest && t.closest(TEXTFIELD));
      const hov = t && t.closest ? t.closest(INTERACTIVE) : null;
      S.hidden = field;
      S.at = field ? 0 : 1;
      S.ringT = hov && !field ? 1 : 0;
      S.rt = hov && !field ? HOVER_R : BASE_R;
      S.colT = hov && !field ? tintOf(hov) : accent.slice();
    };
    const selecting = () => {
      if (!down) return false;
      const s = getSelection();
      return !!(s && !s.isCollapsed && s.toString().length > 1);
    };

    const onMove = e => {
      if (e.pointerType === 'touch') return;
      S.tx = e.clientX; S.ty = e.clientY;
      if (!S.seen) { S.seen = true; S.x = S.px = S.tx; S.y = S.py = S.ty; }
      if (e.target !== lastTarget) classify(e.target);
      if (selecting()) { S.at = 0; } else if (!S.hidden && S.at === 0) S.at = 1;
      wake();
    };
    const onDown = e => {
      if (e.pointerType === 'touch' || e.button > 0) return;
      down = true;
      S.tx = e.clientX; S.ty = e.clientY;
      if (!S.seen) { S.seen = true; S.x = S.px = S.tx; S.y = S.py = S.ty; }
      if (e.target !== lastTarget) classify(e.target);
      if (!S.hidden) splash(e.clientX, e.clientY, 11);
    };
    const onUp = () => { down = false; if (!S.hidden && S.seen && S.at === 0) { S.at = 1; wake(); } };
    const onLeave = () => { S.at = 0; lastTarget = null; wake(); };
    const onScroll = () => {            // content moved under a resting pointer: re-check what is under it
      clearTimeout(scrollT);
      scrollT = setTimeout(() => {
        if (!S.seen || !cv) return;
        const t = doc.elementFromPoint(S.tx, S.ty);
        if (t && t !== lastTarget) { classify(t); wake(); }
      }, 110);
    };
    const onTheme = () => { readAccent(); if (!lastTarget || !(lastTarget.closest && lastTarget.closest(INTERACTIVE))) S.colT = accent.slice(); if (cv && S.seen) wake(); };

    const wire = () => {
      if (wired) return; wired = true;
      doc.addEventListener('pointermove', onMove, { passive: true });
      doc.addEventListener('pointerdown', onDown, { passive: true });
      doc.addEventListener('pointerup', onUp, { passive: true });
      doc.addEventListener('pointercancel', onUp, { passive: true });
      doc.documentElement.addEventListener('mouseleave', onLeave);
      addEventListener('blur', onLeave);
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', () => { if (cv) { size(); wake(); } }, { passive: true });
      window.addEventListener('themechange', onTheme);
    };
    const unwire = () => {
      if (!wired) return; wired = false;
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onUp);
      doc.documentElement.removeEventListener('mouseleave', onLeave);
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
     boot
     ==================================================================================== */
  sound.mount();
  cursor.enable();
  // soft drop on every click of something clickable (only when the user switched sound on; links that wipe play the whoosh instead)
  doc.addEventListener('click', e => {
    if (!sound.enabled() || !e.isTrusted) return;
    const el = e.target && e.target.closest ? e.target.closest('a[href],button,[role=tab],[role=button],summary,select,input[type=checkbox],input[type=radio],[data-goto],.chip') : null;
    if (!el || el.classList.contains('sound-btn')) return;
    if (el.matches('a[href]') && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && wipe.target(el)) return;
    sound.play('drop', { pitch: sound.pitchFor(el) });
  }, true);

  window.YanabeeWow = { sound, cursor, wipe, go: wipe, headings, busy: () => tasks.size };
})();
