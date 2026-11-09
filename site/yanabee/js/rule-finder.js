// rule-finder: «ماذا لو؟ ابحث في اللائحة» — row-level answers from the league regulation (lg1…lg10) on competition.html.
// Matching is the site's own Arabic engine (window.YanabeeSearch.engine, js/search.js); this file only filters,
// ranks and draws cards. Every card text is a verbatim document line from #rf-data. No storage, no network.
// Classic script (IIFE), works from file://.
(() => {
  const box = document.getElementById('rule-finder');
  const S = window.YanabeeSearch;
  const engine = S && S.engine;
  if (!box || !engine || !engine.prepare || !engine.norm || !engine.scoreText || !engine.marks) return; // stays hidden
  let E;
  try { E = JSON.parse(document.getElementById('rf-data').textContent); } catch (e) { return; }
  if (!Array.isArray(E) || !E.length) return;
  box.hidden = false;

  const $ = s => box.querySelector(s);
  const $$ = s => [...box.querySelectorAll(s)];
  const input = $('#rf-q'), out = $('#rf-out'), more = $('.rf-more'), rowsBox = $('#rf-rows');
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 8;
  const str = e => (e.k === 't' ? e.cells.map(c => c[1]).join(' ') : e.text);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  // text with the matched words wrapped in <mark> (text nodes only, never innerHTML)
  const marked = (tag, cls, text, toks) => {
    const n = el(tag, cls);
    let pos = 0;
    const ranges = toks && toks.length ? engine.marks(text, toks) : [];
    for (const [s, e] of ranges) {
      if (s > pos) n.appendChild(document.createTextNode(text.slice(pos, s)));
      n.appendChild(el('mark', '', text.slice(s, e)));
      pos = e;
    }
    if (pos < text.length) n.appendChild(document.createTextNode(text.slice(pos)));
    return n;
  };

  const openFold = (id) => {
    const d = document.getElementById(id);
    if (!d) return;
    if (d.tagName === 'DETAILS') d.open = true;
    try { history.replaceState(history.state, '', '#' + id); } catch (e) { /* file:// or sandboxed */ }
    d.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
    d.classList.remove('flash');
    void d.offsetWidth; // restart the highlight on a second click
    d.classList.add('flash');
    clearTimeout(d._rfFlash);
    d._rfFlash = setTimeout(() => d.classList.remove('flash'), 1800);
  };

  const card = (e, toks) => {
    const li = el('li', 'rf-card');
    li.appendChild(el('small', 'rf-ch', e.ch));
    if (e.k === 't') {
      const dl = el('dl', 'rf-row');
      e.cells.forEach(([h, c], i) => {
        const wrap = el('div', i ? 'rf-dec' : 'rf-case');
        wrap.appendChild(el('dt', '', h));
        wrap.appendChild(marked('dd', '', c, toks));
        dl.appendChild(wrap);
      });
      li.appendChild(dl);
    } else {
      li.appendChild(marked('p', 'rf-text', e.text, toks));
    }
    const a = el('a', 'rf-open');
    a.href = '#' + e.f;
    a.appendChild(el('span', '', 'افتح الفصل'));
    a.addEventListener('click', ev => { ev.preventDefault(); openFold(e.f); });
    li.appendChild(a);
    return li;
  };

  const render = (list, toks, note) => {
    out.textContent = '';
    if (note) out.appendChild(el('p', 'rf-note', note));
    const ul = el('ul', 'rf-list');
    list.slice(0, MAX).forEach(e => ul.appendChild(card(e, toks)));
    out.appendChild(ul);
  };

  const empty = () => {
    out.textContent = '';
    const p = el('p', 'rf-note rf-empty', 'لا نتيجة. جرّب كلمة أخرى، أو ');
    const b = el('button', 'rf-link', 'افتح كل الفصول');
    b.type = 'button';
    b.addEventListener('click', () => {
      const sec = box.closest('section') || document;
      const all = [...sec.querySelectorAll('details.fold')];
      const fa = sec.querySelector('[data-fold-all]');
      if (all.length && !all.every(d => d.open)) {
        if (fa) fa.click(); else all.forEach(d => { d.open = true; });
      }
      const f = sec.querySelector('.folds');
      if (f) f.scrollIntoView({ block: 'start', behavior: reduce() ? 'auto' : 'smooth' });
    });
    p.appendChild(b);
    p.appendChild(document.createTextNode('.'));
    out.appendChild(p);
  };

  const search = q => {
    q = String(q || '').trim();
    if (!q) { out.textContent = ''; return; }
    const toks = engine.prepare(q);
    if (!toks || !toks.length) { empty(); return; }
    // direct = tokens found as typed (stem), not only through the engine's variants (تأخر -> آخر): those lines first
    const direct = t => { const n = engine.norm(t); return toks.filter(k => n.indexOf(k.s) >= 0).length; };
    const scored = E.map((e, i) => ({ e, i, s: engine.scoreText(str(e), toks), d: direct(str(e)) }));
    const full = scored.filter(x => x.s === 1).sort((a, b) => b.d - a.d || a.i - b.i);
    if (full.length) { render(full.map(x => x.e), toks); return; }
    const near = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.d - a.d || a.i - b.i);
    if (near.length) { render(near.map(x => x.e), toks, 'لا توجد جملة فيها كل الكلمات. هذه أقرب الأسطر:'); return; }
    empty();
  };

  const press = b => $$('.rf-chip').forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
  let timer = 0;
  input.addEventListener('input', () => {
    press(null);
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), 120);
  });
  const clear = () => {
    clearTimeout(timer);
    input.value = '';
    out.textContent = '';
    press(null);
    input.focus();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clear(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); search(input.value); }
  });
  $('.rf-x').addEventListener('click', clear);

  $$('.rf-chip[data-q]').forEach(b => b.addEventListener('click', () => {
    clearTimeout(timer);
    input.value = b.dataset.q;
    press(b);
    search(b.dataset.q);
  }));
  $$('.rf-chip[data-row]').forEach(b => b.addEventListener('click', () => {
    const e = E[+b.dataset.row];
    if (!e) return;
    clearTimeout(timer);
    input.value = '';
    press(b);
    render([e], null);
  }));
  more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
    rowsBox.hidden = !open;
  });
})();
