// Interactivity layer shared by every page (classic script, no dependencies).
//  - water ripples on every press (touch included)
//  - cards tilt and carry a soft light that follows the pointer; buttons are magnetic
//  - hero light + parallax that follow the pointer
//  - section dots navigator (wide screens)
//  - select any text and ask the assistant about it
//  - Quran verse revealed word by word
//  - funding chart on the operations page: hover a slice or a line to link them
//  - [data-goto="id"] elements scroll to that id
// Pointer effects need a fine pointer and no reduced-motion preference; everything is progressive:
// without this file the site is still complete.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const smooth = reduce ? 'auto' : 'smooth';

  /* ---------------- water ripple on press ---------------- */
  if (!reduce) {
    document.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const r = document.createElement('span');
      r.className = 'fx-ripple';
      r.setAttribute('aria-hidden', 'true');
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      r.addEventListener('animationend', () => r.remove(), { once: true });
      setTimeout(() => r.remove(), 1500);
    }, { passive: true });
  }

  /* ---------------- tilt + light on cards, magnetic buttons, hero light ---------------- */
  if (fine && !reduce) {
    const TILT = '.card,.team-card,.tm-team,.tm-inc,.b-mission,.b-goal,.phase,.w-tile,.mini-kpi,.pillar,'
      + '.q-kpi,.q-goal,.q-feat,.q-card,.q-role,.q-org-node,.op-risk,.op-fgov,.op-chart,.op-principle,.model-fund';
    const MAGNET = '.btn,.btn-ai,.chat-fab,.fx-ask';
    const FAST = 'transform .12s ease-out, translate .35s cubic-bezier(.22,.8,.24,1), box-shadow .35s, border-color .35s, background-color .35s';
    const SLOW = 'transform .6s cubic-bezier(.22,.8,.24,1), translate .35s cubic-bezier(.22,.8,.24,1), box-shadow .35s, border-color .35s, background-color .35s';
    let cur = null, mag = null, hero = null, last = null, raf = 0;

    const engage = el => {
      if (!$(':scope > .fx-glow', el)) {
        const g = document.createElement('i');
        g.className = 'fx-glow';
        g.setAttribute('aria-hidden', 'true');
        el.appendChild(g);
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      }
      el.classList.add('fx-on');
      el.style.transition = FAST;
    };
    const release = el => {
      el.classList.remove('fx-on');
      el.style.transition = SLOW;
      el.style.transform = '';
      setTimeout(() => { if (cur !== el) el.style.transition = ''; }, 700);
    };
    const tilt = (el, e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const k = Math.min(1, 380 / r.width) * Math.min(1, 460 / r.height + 0.25); // big panels barely move
      el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 7 * k).toFixed(2)}deg) rotateY(${((x - 0.5) * 9 * k).toFixed(2)}deg)`;
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    };

    const tick = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const t = e.target && e.target.closest ? e.target : null;

      let el = t && t.closest(TILT);
      if (el && el.classList.contains('rv') && !el.classList.contains('in')) el = null; // not revealed yet
      if (el !== cur) { if (cur) release(cur); cur = el; if (cur) engage(cur); }
      if (cur) tilt(cur, e);

      const m = t && t.closest(MAGNET);
      if (mag && mag !== m) { mag.style.translate = ''; mag = null; }
      if (m) {
        mag = m;
        const r = m.getBoundingClientRect();
        m.style.translate = `${((e.clientX - r.left - r.width / 2) * 0.16).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * 0.26).toFixed(1)}px`;
      }

      const h = t && t.closest('.hero');
      if (hero && hero !== h) { hero.style.setProperty('--so', 0); hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0); }
      hero = h;
      if (h) {
        const r = h.getBoundingClientRect();
        h.style.setProperty('--sx', (e.clientX - r.left) + 'px');
        h.style.setProperty('--sy', (e.clientY - r.top) + 'px');
        h.style.setProperty('--px', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        h.style.setProperty('--py', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
        h.style.setProperty('--so', 1);
      }
    };
    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      last = e;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      last = null;
      if (cur) { release(cur); cur = null; }
      if (mag) { mag.style.translate = ''; mag = null; }
      if (hero) { hero.style.setProperty('--so', 0); hero = null; }
    });
  }

  /* ---------------- scroll to [data-goto] ---------------- */
  document.addEventListener('click', e => {
    const g = e.target.closest && e.target.closest('[data-goto]');
    if (!g) return;
    const t = document.getElementById(g.dataset.goto);
    if (!t) return;
    t.scrollIntoView({ behavior: smooth, block: 'start' });
    try { history.replaceState(null, '', '#' + g.dataset.goto); } catch (err) { /* file:// quirks */ }
  });

  /* ---------------- section dots ---------------- */
  (() => {
    if ($('.tm-aside, .q-aside')) return; // these pages already have their own side index
    const secs = $$('main section[id]').map(s => ({ s, h: $('h2', s) })).filter(x => x.h);
    if (secs.length < 3 || secs.length > 9) return;
    const nav = document.createElement('nav');
    nav.className = 'fx-dots';
    nav.setAttribute('aria-label', 'أقسام الصفحة');
    const links = secs.map(({ s, h }) => {
      const a = document.createElement('a');
      const label = h.textContent.replace(/\s+/g, ' ').trim();
      a.href = '#' + s.id;
      a.dataset.label = label;
      a.setAttribute('aria-label', label);
      a.innerHTML = '<i></i>';
      nav.appendChild(a);
      return a;
    });
    document.body.appendChild(nav);
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => {
        const on = a.getAttribute('href') === '#' + e.target.id;
        a.classList.toggle('current', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }), { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    secs.forEach(({ s }) => io.observe(s));
  })();

  /* ---------------- select text -> ask the assistant ---------------- */
  (() => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fx-ask';
    btn.hidden = true;
    btn.innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg><span>اسأل المساعد عن هذا</span>';
    document.body.appendChild(btn);
    let text = '', timer = 0;
    const hide = () => { btn.hidden = true; };
    const update = () => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el || !el.closest('main') || el.closest('input,textarea,[contenteditable],.search,.chat')) return hide();
      text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 8 || text.length > 400) return hide();
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) return hide();
      btn.hidden = false;
      const w = btn.offsetWidth || 190;
      const touch = !fine;
      let top = r.top - (touch ? 64 : 48);
      if (top < 8) top = r.bottom + (touch ? 44 : 12);
      btn.style.top = Math.min(top, innerHeight - 54) + 'px';
      btn.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    };
    document.addEventListener('selectionchange', () => { clearTimeout(timer); timer = setTimeout(update, 140); });
    addEventListener('scroll', hide, { passive: true });
    addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    btn.addEventListener('pointerdown', e => e.preventDefault()); // keep the selection while pressing
    btn.addEventListener('click', () => {
      const q = 'اشرح لي هذا من الوثائق: «' + text + '»';
      hide();
      const s = getSelection();
      if (s) s.removeAllRanges();
      if (window.YanabeeChat) window.YanabeeChat.ask(q);
    });
  })();

  /* ---------------- Quran verse: word by word ---------------- */
  (() => {
    const v = $('.verse');
    if (!v || reduce) return;
    let n = 0;
    $$('p', v).forEach(p => [...p.childNodes].forEach(node => {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) return;
      const frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement('span');
        w.className = 'fx-w';
        w.style.setProperty('--wi', n++);
        w.textContent = part;
        frag.appendChild(w);
      });
      p.replaceChild(frag, node);
    }));
    if (!n) return;
    v.classList.add('fx-ready');
    if (!('IntersectionObserver' in window)) { v.classList.add('fx-go'); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { v.classList.add('fx-go'); io.disconnect(); }
    }), { threshold: 0.4 });
    io.observe(v);
  })();

  /* ---------------- operations: funding donut <-> legend ---------------- */
  (() => {
    const chart = $('.op-chart');
    if (!chart) return;
    const segs = $$('.op-seg', chart), labels = $$('.op-seg-l', chart), items = $$('.op-legend li', chart);
    const set = i => {
      chart.classList.toggle('has-hl', i >= 0);
      segs.forEach((s, k) => s.classList.toggle('is-hl', k === i));
      labels.forEach((s, k) => s.classList.toggle('is-hl', k === i));
      items.forEach((li, k) => li.classList.toggle('is-hl', k === i));
    };
    segs.forEach((s, k) => { s.addEventListener('pointerenter', () => set(k)); s.addEventListener('pointerleave', () => set(-1)); });
    items.forEach((li, k) => { li.addEventListener('pointerenter', () => set(k)); li.addEventListener('pointerleave', () => set(-1)); });
  })();
})();
