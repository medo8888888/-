// Global "play" layer (every page, classic script, no dependencies):
//  1. window.YanabeeFun.confetti(x, y)  water-drop confetti in the team colours (nothing under reduced motion)
//  2. Explorer passport: a small chip collects the seven springs (one per team visited on teams.html)
//  3. Verse practice on quran.html: hide 25 / 50 / 100 % of the words of the verse and reveal them by pressing
// Everything is optional enhancement; storage is wrapped in try/catch and the pages work without it.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const page = document.body ? document.body.dataset.page : '';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ids = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };

  /* ---------------- 1. confetti ---------------- */
  let cv = null, ctx = null, parts = [], raf = 0, last = 0;
  const palette = () => {
    const cs = getComputedStyle(document.documentElement), out = [];
    ids.forEach(id => { const v = cs.getPropertyValue('--' + id).trim(); if (v) out.push(v); });
    return out.length ? out : ['#12a8a4', '#2c63d6', '#d9762a', '#2f9157'];
  };
  const drop = (c, s) => {            // a water drop: pointed top, round belly
    c.beginPath();
    c.moveTo(0, -s);
    c.bezierCurveTo(s * 0.15, -s * 0.55, s * 0.62, -s * 0.1, s * 0.62, s * 0.3);
    c.arc(0, s * 0.3, s * 0.62, 0, Math.PI, false);
    c.bezierCurveTo(-s * 0.62, -s * 0.1, -s * 0.15, -s * 0.55, 0, -s);
    c.closePath();
  };
  const size = () => {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  const frame = t => {
    const dt = Math.min(2.2, (t - last) / 16.7 || 1); last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.age < p.life && p.y < innerHeight + 40);
    parts.forEach(p => {
      p.age += dt; p.vy += 0.19 * dt; p.vx *= 0.992; p.x += p.vx * dt + Math.sin(p.age * 0.1 + p.w) * 0.6; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.life - p.age) / 24));
      ctx.fillStyle = p.c; drop(ctx, p.s); ctx.fill();
      ctx.restore();
    });
    if (parts.length) raf = requestAnimationFrame(frame);
    else { raf = 0; if (cv) { cv.remove(); cv = null; ctx = null; } }
  };
  function confetti(x, y, big) {
    if (reduced() || !document.body) return false;
    x = Number.isFinite(x) ? x : innerWidth / 2;
    y = Number.isFinite(y) ? y : innerHeight * 0.4;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'yb-confetti';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      ctx = cv.getContext('2d');
      if (!ctx) { cv.remove(); cv = null; return false; }
      size();
    }
    const cols = palette(), n = big ? 96 : 64;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.35, sp = 4.5 + Math.random() * (big ? 10 : 8);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 6 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.28,
        c: cols[i % cols.length], age: 0, life: 85 + Math.random() * 60, w: Math.random() * 6 });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    return true;
  }
  addEventListener('resize', () => { if (cv) size(); });

  /* ---------------- toast ---------------- */
  let toastEl = null, toastT = 0;
  function toast(msg, ms) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'yb-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl && toastEl.classList.remove('show'), ms || 2600);
  }

  /* ---------------- 2. explorer passport ---------------- */
  const KEY = 'yanabee-passport', NAMES = 'yanabee-team-names';
  const read = () => { try { const v = JSON.parse(store.get(KEY)); return Array.isArray(v) ? v.filter(x => ids.includes(x)) : []; } catch (e) { return []; } };
  let have = read();
  const names = (() => {            // team names exist in the DOM of teams / home / learn; remembered for the other pages
    let n = {};
    try { n = JSON.parse(store.get(NAMES)) || {}; } catch (e) { n = {}; }
    let found = false;
    $$('.tm-team[id]').forEach(el => {
      const h = $('h2', el);
      if (!h || !ids.includes(el.id)) return;
      const c = h.cloneNode(true); $$('.tm-paren', c).forEach(x => x.remove());
      n[el.id] = c.textContent.replace(/\s+/g, ' ').trim(); found = true;
    });
    $$('.team-card[href*="#t"]').forEach(a => {
      const m = a.getAttribute('href').match(/#(t[1-7])$/), h = $('h3', a);
      if (m && h) { n[m[1]] = h.textContent.replace(/\s+/g, ' ').trim(); found = true; }
    });
    $$('.ln-stamp[data-team] b').forEach(b => { n[b.parentElement.dataset.team] = b.textContent.trim(); found = true; });
    if (found) store.set(NAMES, JSON.stringify(n));
    return n;
  })();
  const nameOf = id => names[id] || 'الينبوع ' + id.slice(1);
  const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';
  let chip = null;

  const save = () => { store.set(KEY, JSON.stringify(have)); };
  const sync = (popId) => {
    if (chip) {
      $$('.yb-d', chip).forEach(d => {
        const on = have.includes(d.dataset.t);
        d.classList.toggle('on', on);
        d.dataset.tip = nameOf(d.dataset.t) + (on ? '' : ' (لم يُجمع بعد)');
        if (popId && d.dataset.t === popId) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
      });
      $('.yb-pass-n b', chip).textContent = have.length;
      chip.setAttribute('aria-label', `جواز المستكشف: جمعت ${have.length} من 7 ينابيع. افتح صفحة تعلّم والعب`);
      chip.classList.toggle('full', have.length === 7);
    }
    window.dispatchEvent(new CustomEvent('yanabee:passport', { detail: { ids: have.slice(), added: popId || null } }));
  };
  function add(id) {
    if (!ids.includes(id) || have.includes(id)) return false;
    have.push(id); save(); sync(id);
    if (have.length === 7) {
      toast('اكتملت الينابيع السبعة!', 5200);
      if (chip) { const r = chip.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top); } else confetti();
      setTimeout(() => confetti(innerWidth / 2, innerHeight * 0.35, true), 250);
    } else toast('ينبوع جديد: ' + nameOf(id) + ` (${have.length} من 7)`, 2400);
    return true;
  }
  function reset() { have = []; save(); sync(); }

  function buildChip() {
    if (page === '404.html' || page === 'learn.html' || !document.body) return;
    chip = document.createElement('a');
    chip.className = 'yb-pass';
    chip.href = 'learn.html#passport';
    chip.innerHTML = `<span class="yb-pass-ic" aria-hidden="true">${DROP}</span><span class="yb-pass-drops" aria-hidden="true">`
      + ids.map(id => `<i class="yb-d" data-t="${id}" style="--tc:var(--${id})" data-tip="">${DROP}</i>`).join('')
      + '</span><span class="yb-pass-n" aria-hidden="true"><b>0</b>/7</span>';
    document.body.appendChild(chip);
    sync();
  }

  function trackTeams() {
    const els = $$('.tm-team[id]').filter(e => ids.includes(e.id));
    if (!els.length) return;
    const timers = {};
    const arm = id => { if (!have.includes(id) && !timers[id]) timers[id] = setTimeout(() => { delete timers[id]; add(id); }, 1200); };
    const disarm = id => { if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; } };
    if ('IntersectionObserver' in window) {
      const th = []; for (let i = 0; i <= 20; i++) th.push(i / 20);
      const io = new IntersectionObserver(es => es.forEach(e => {
        const id = e.target.id;
        const need = Math.min(e.boundingClientRect.height, innerHeight) * 0.5;       // half of the panel (or of the screen if it is taller)
        if (e.isIntersecting && e.intersectionRect.height >= need - 1) arm(id); else disarm(id);
      }), { threshold: th });
      els.forEach(e => io.observe(e));
    }
    const hash = () => { const m = location.hash.match(/^#(t[1-7])$/); if (m) arm(m[1]); };   // a team opened from a link
    addEventListener('hashchange', hash); hash();
  }

  window.YanabeeFun = {
    confetti, toast,
    passport: { get: () => have.slice(), has: id => have.includes(id), add, reset, ids: ids.slice(), names: () => Object.assign({}, names) },
  };
  buildChip();
  trackTeams();

  /* ---------------- 3. verse practice ---------------- */
  (() => {
    const v = $('.verse');
    if (!v || page !== 'quran.html') return;
    let words = $$('.fx-w', v);
    if (!words.length) {                       // reduced motion: fx.js did not split the verse; do it without altering the text
      $$('p', v).forEach(p => [...p.childNodes].forEach(node => {
        if (node.nodeType !== 3 || !node.nodeValue.trim()) return;
        const frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'yb-w'; w.textContent = part; frag.appendChild(w);
        });
        p.replaceChild(frag, node);
      }));
      words = $$('.yb-w', v);
    }
    words.forEach(w => w.classList.add('yb-w'));
    if (!words.length) return;
    const LEVELS = [['all', 0, 'إظهار الكل'], ['25', 0.25, 'إخفاء 25%'], ['50', 0.5, 'إخفاء 50%'], ['100', 1, 'إخفاء الكل']];
    const bar = document.createElement('div');
    bar.className = 'yb-verse-bar';
    bar.innerHTML = `<span class="yb-verse-t"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>حفظ</span>`
      + `<span class="yb-seg" role="group" aria-label="مستوى إخفاء الكلمات">${LEVELS.map((l, i) => `<button type="button" data-lv="${l[0]}" aria-pressed="${i === 0}">${l[2]}</button>`).join('')}</span>`
      + '<button type="button" class="yb-shuffle" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>خلط</button>'
      + '<span class="yb-verse-st" role="status" aria-live="polite"></span><span class="yb-verse-prog" aria-hidden="true"><i></i></span>';
    v.insertAdjacentElement('afterend', bar);
    const st = $('.yb-verse-st', bar), fill = $('.yb-verse-prog i', bar), shuf = $('.yb-shuffle', bar);
    let level = 'all', hidden = 0, shown = 0;

    const reveal = (w, byKey) => {
      if (!w.classList.contains('yb-hid')) return;
      w.classList.remove('yb-hid'); w.removeAttribute('role'); w.removeAttribute('tabindex'); w.removeAttribute('aria-label');
      w.classList.remove('yb-pop'); void w.offsetWidth; w.classList.add('yb-pop');
      shown++; status();
      if (byKey) { const nx = $('.yb-hid', v); if (nx) nx.focus(); else shuf.focus(); }
      if (shown === hidden && hidden) { const r = v.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + r.height / 2); }
    };
    const status = () => {
      st.textContent = level === 'all' ? 'اختر مستوى الإخفاء لتجرّب حفظ الآية' : (shown === hidden ? `أحسنت! كشفت كل الكلمات (${hidden} من ${hidden})` : `كشفت ${shown} من ${hidden}`);
      fill.style.width = (hidden ? shown / hidden * 100 : 0) + '%';
    };
    const apply = lv => {
      level = lv;
      v.classList.remove('fx-ready', 'fx-go');                   // the entrance animation would override the masking
      words.forEach(w => { w.classList.remove('yb-hid', 'yb-pop'); w.removeAttribute('role'); w.removeAttribute('tabindex'); w.removeAttribute('aria-label'); });
      const pct = LEVELS.find(l => l[0] === lv)[1];
      hidden = Math.round(words.length * pct); shown = 0;
      const idx = words.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.slice(0, hidden).forEach(i => {
        const w = words[i];
        w.classList.add('yb-hid'); w.setAttribute('role', 'button'); w.tabIndex = 0; w.setAttribute('aria-label', 'كلمة مخفية');
      });
      v.classList.toggle('yb-practice', lv !== 'all');
      shuf.disabled = lv === 'all';
      $$('.yb-seg button', bar).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lv === lv)));
      status();
    };
    bar.addEventListener('click', e => {
      const b = e.target.closest('.yb-seg button');
      if (b) apply(b.dataset.lv);
      else if (e.target.closest('.yb-shuffle') && level !== 'all') apply(level);
    });
    v.addEventListener('click', e => { const w = e.target.closest('.yb-hid'); if (w) reveal(w, false); });
    v.addEventListener('keydown', e => {
      const w = e.target.closest && e.target.closest('.yb-hid');
      if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reveal(w, true); }
    });
    status();
    window.YanabeeFun.verse = { apply, state: () => ({ level, hidden, shown }) };
  })();
})();
