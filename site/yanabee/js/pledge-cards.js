/* pledge-cards — بطاقات الوعد والميثاق والمتابعة المنزلية (method.html #pledge).
   Markup: tools/yanabee/feat_pledge_cards.py. Styles + print rules: css/pledge-cards.css.
   The document strings arrive raw in <script type="application/json" id="pl-data"> and are only ever
   rendered with textContent. What the visitor types stays in this browser (localStorage
   'yanabee-pledge-cards-v1', drafts only; the name only after «احفظ الاسم على هذا الجهاز»).
   Nothing is sent anywhere. Classic script, works from file://. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = $('#pledge');
  const tool = $('#pl-tool');
  const blob = $('#pl-data');
  if (!root || !tool || !blob) return;
  let D;
  try { D = JSON.parse(blob.textContent); } catch (e) { return; }

  const KEY = 'yanabee-pledge-cards-v1';
  /* «يوم 1» … «يوم 7»: UI chrome taken from «خلال أسبوع» (m-workshop, the member pledge). Plain tick boxes:
     no score, no rating, no percentage. */
  const DAYS = 7;
  /* Blank signature lines on the team charter: competition.txt c-terms «| عدد الفريق | 5 إلى 7 أعضاء شاملًا قائد الفريق |»
     gives the largest team. method.txt does not fix a size (its m-board example reads «8 من 8 طلاب»), so the card
     never states a team size; it only leaves room. */
  const SIGN_LINES = 7;
  const PER_SHEET = { cards: 4, blank: 4, charter: 1, home: 2 };   // A6 4-up, A4, A5 2-up

  const fresh = () => ({ v: 1, tab: 'cards', name: '', team: '', keepName: false, pledge: '', value: '', valueOther: '',
    method: '', who: '', when: '', hField: -1, hTasks: [], hTask: '' });
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } },
    del() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } },
  };
  const load = () => {
    const s = fresh();
    try {
      const j = JSON.parse(store.get());
      if (!j || j.v !== 1) return s;
      Object.keys(s).forEach(k => { if (typeof j[k] === typeof s[k] && !Array.isArray(s[k])) s[k] = j[k]; });
      if (Array.isArray(j.hTasks)) s.hTasks = j.hTasks.filter(x => typeof x === 'string');
      if (!['cards', 'charter', 'home'].includes(s.tab)) s.tab = 'cards';
      if (!(Number.isInteger(s.hField) && s.hField >= 0 && s.hField < D.fields.length)) { s.hField = -1; s.hTasks = []; }   // a non-integer would index nothing
      else s.hTasks = s.hTasks.filter(x => D.fields[s.hField][1].includes(x));
      if (s.value !== '*' && !D.values.includes(s.value)) s.value = '';
      if (!s.keepName) s.name = '';
    } catch (e) { /* no draft, or unreadable */ }
    return s;
  };
  let S = load();

  /* ---------------- save (debounced) ---------------- */
  const savedEl = $('#pl-saved');
  const statusEl = $('#pl-status');
  const say = msg => { if (statusEl) { statusEl.textContent = ''; requestAnimationFrame(() => { statusEl.textContent = msg; }); } };
  let saveT = 0;
  const saveNow = () => {
    clearTimeout(saveT);
    saveT = 0;   // nothing pending (pagehide only saves a pending change)
    const copy = Object.assign({}, S);
    if (!copy.keepName) copy.name = '';
    const ok = store.set(JSON.stringify(copy));
    if (savedEl) savedEl.textContent = ok ? 'حُفظت المسودة في هذا المتصفح.' : 'الحفظ غير متاح في هذا المتصفح؛ البطاقات تعمل دون حفظ.';
  };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 350); };

  /* ---------------- small DOM builder (text only) ---------------- */
  const el = (tag, cls, kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    [].concat(kids == null ? [] : kids).forEach(k => {
      if (k == null || k === false) return;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return n;
  };
  const lines = (n, cls = 'pl-line') => Array.from({ length: n }, () => el('i', cls));
  const row = (label, value) => el('div', 'pl-row', [el('span', 'pl-rl', label), el('b', 'pl-rv' + (value ? '' : ' is-empty'), value || '')]);
  const days = () => el('ol', 'pl-days', Array.from({ length: DAYS }, (_, i) => el('li', '', [el('span', '', 'يوم ' + (i + 1)), el('i', 'pl-tick')])));
  const head = (label, body) => el('header', 'pl-chd', [el('b', 'pl-ct', label + ':'), ' ', el('span', 'pl-cs', body)]);   // reads back as the document line
  const ayah = txt => el('p', 'pl-ayah', txt);
  const sign = label => el('div', 'pl-sign', [el('span', '', label), el('i', 'pl-line')]);
  const fmtDate = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return s; }
  };
  const trim = s => (s || '').trim();

  /* ---------------- the three cards ---------------- */
  const pledgeCard = blank => {
    const txt = blank ? '' : trim(S.pledge);
    return el('article', 'pl-card pl-k-pledge', [
      head(D.pledge[0], D.pledge[1]),
      ayah(D.saff),
      el('div', 'pl-rows', [row('الاسم', blank ? '' : trim(S.name)), row('الفريق', blank ? '' : trim(S.team))]),
      el('div', 'pl-box', [el('span', 'pl-bl', 'وعدي'), txt ? el('p', 'pl-txt', txt) : el('div', 'pl-lines', lines(3))]),
      days(),
      sign('متابعة المشرف'),
    ]);
  };
  const charterValue = () => (S.value === '*' ? trim(S.valueOther) : S.value);
  const charterCard = () => {
    const ans = [charterValue(), trim(S.method), trim(S.who), fmtDate(S.when)];
    return el('article', 'pl-card pl-k-charter', [
      head(D.charter[0], D.charter[1]),
      ayah(D.muminun),
      el('div', 'pl-rows', [row('الفريق', trim(S.team))]),
      el('ol', 'pl-csteps', D.steps.map((s, i) => el('li', '', [
        el('span', 'pl-cn', String(i + 1)), el('div', '', [el('h4', '', s), ans[i] ? el('p', 'pl-txt', ans[i]) : el('div', 'pl-lines', lines(i === 1 ? 3 : 1))]),
      ]))),
      el('div', 'pl-sigs', Array.from({ length: SIGN_LINES }, () => sign('توقيع العضو'))),
    ]);
  };
  const homeTasks = () => {
    const f = S.hField >= 0 ? D.fields[S.hField] : null;
    const t = f ? f[1].filter(x => S.hTasks.includes(x)) : [];   // the document's order
    if (trim(S.hTask)) t.push(trim(S.hTask));
    return t;
  };
  const homeCard = () => {
    const f = S.hField >= 0 ? D.fields[S.hField][0] : '';
    const tasks = homeTasks();
    return el('article', 'pl-card pl-k-home', [
      el('header', 'pl-chd', [el('small', 'pl-ck', D.meet[0]), ' ', el('span', 'pl-cs', D.meet[1]), ' ', el('b', 'pl-ct pl-big', 'بطاقة المتابعة')]),
      el('div', 'pl-rows', [row('الاسم', trim(S.name)), row('الفريق', trim(S.team)), row('المجال', f)]),
      el('div', 'pl-box', [el('span', 'pl-bl', 'المهمة'), tasks.length ? el('ul', 'pl-tasks', tasks.map(x => el('li', '', x))) : el('div', 'pl-lines', lines(2))]),
      days(),
      el('div', 'pl-box pl-notes', [el('span', 'pl-bl', 'ملاحظات ولي الأمر (طوعية)'), el('div', 'pl-lines', lines(2)),
        el('small', 'pl-role', D.parents[0] + ' — ' + D.parents[1])]),
      sign('المشرف'),
    ]);
  };
  const build = kind => (kind === 'cards' ? pledgeCard(false) : kind === 'blank' ? pledgeCard(true) : kind === 'charter' ? charterCard() : homeCard());

  /* ---------------- print ---------------- */
  // comp.js (not loaded on method.html) defines window.__yanabeePrintOnly; same fallback as register.js otherwise.
  const fallbackPrint = cls => {
    document.body.classList.add(cls);
    const off = () => { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };
  const printOnly = cls => (window.__yanabeePrintOnly || fallbackPrint)(cls);
  const area = $('#pl-print');
  const doPrint = kind => {
    if (kind === 'cards' && !trim(S.pledge)) {
      say('اكتب وعدك أولًا، أو اطبع بطاقات فارغة للفريق.');
      $('#pl-pledge').focus();
      return;
    }
    saveNow();
    const n = PER_SHEET[kind];
    const sheet = el('div', 'pl-sheet pl-sheet-' + (kind === 'blank' ? 'cards' : kind), Array.from({ length: n }, () => build(kind)));
    area.replaceChildren(sheet);
    say(kind === 'charter' ? 'الميثاق جاهز للطباعة.' : 'البطاقات جاهزة للطباعة.');
    // a browser that never fired afterprint would leave an older print class behind: drop it first
    Array.from(document.body.classList).filter(c => c.indexOf('print-pledge-') === 0).forEach(c => document.body.classList.remove(c));
    printOnly('print-pledge-' + (kind === 'blank' ? 'cards' : kind));
  };
  $$('[data-pl-print]', tool).forEach(b => b.addEventListener('click', () => doPrint(b.dataset.plPrint)));

  /* ---------------- live preview (wide screens only; hidden by CSS below 600px) ---------------- */
  const wide = window.matchMedia ? window.matchMedia('(min-width:600px)') : { matches: true };
  let prevQ = false;
  const preview = () => {
    prevQ = false;
    if (!wide.matches) return;
    const box = $(`.pl-prev[data-prev="${S.tab}"]`, tool);
    if (!box) return;
    const pv = el('div', 'pl-pv', build(S.tab));
    pv.dataset.l = 'معاينة البطاقة';
    box.replaceChildren(pv);
  };
  const queuePreview = () => { if (!prevQ) { prevQ = true; requestAnimationFrame(preview); } };
  if (wide.addEventListener) wide.addEventListener('change', queuePreview);

  /* ---------------- home: computed summary ---------------- */
  const hsum = $('#pl-hsum');
  const summary = () => {
    if (!hsum) return;
    const f = S.hField >= 0 ? D.fields[S.hField][0] : '';
    const t = homeTasks();
    hsum.textContent = !f && !t.length ? 'لم يُختر مجال ولا مهمة بعد.'
      : (f ? 'المجال: ' + f + '. ' : '') + (t.length ? 'المهمة: ' + t.join('؛ ') : 'لم تُختر مهمة بعد.');
  };

  /* ---------------- form <-> state ---------------- */
  const inputs = $$('[data-k]', tool);
  const fill = () => {
    inputs.forEach(i => {
      const k = i.dataset.k;
      if (i.type === 'checkbox') i.checked = !!S[k];
      else i.value = S[k] || '';
    });
    $$('input[name="pl-value"]', tool).forEach(r => { r.checked = r.hasAttribute('data-other') ? S.value === '*' : r.value === S.value && S.value !== ''; });
    $$('.pl-pick[data-mode="pick"]', tool).forEach(syncPick);
    $$('.pl-pick[data-mode="insert"]', tool).forEach(p => openGroup(p, -1));
    select(S.tab, false);
    summary();
    queuePreview();
  };
  inputs.forEach(i => {
    const k = i.dataset.k;
    i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => {
      if (i.type === 'checkbox') {
        S[k] = i.checked;
        if (k === 'keepName') { saveNow(); say(i.checked ? 'سيُحفظ الاسم في هذا المتصفح.' : 'لن يُحفظ الاسم.'); queuePreview(); return; }
      } else S[k] = i.value;
      if (k === 'valueOther' && trim(i.value)) {
        S.value = '*';
        const o = $('input[name="pl-value"][data-other]', tool);
        if (o) o.checked = true;
      }
      if (k === 'hTask') summary();
      save();
      queuePreview();
    });
  });
  $$('input[name="pl-value"]', tool).forEach(r => r.addEventListener('change', () => {
    if (!r.checked) return;
    S.value = r.hasAttribute('data-other') ? '*' : r.value;
    if (S.value === '*') { const o = $('#pl-vother'); if (o && !trim(o.value)) o.focus(); }
    save();
    queuePreview();
  }));

  /* ---------------- field pickers ---------------- */
  function openGroup(pick, f) {
    $$('.pl-fbtn', pick).forEach(b => b.setAttribute('aria-expanded', String(+b.dataset.f === f)));
    $$('.pl-segs', pick).forEach(g => { g.hidden = +g.dataset.f !== f; });
  }
  function syncPick(pick) {
    $$('.pl-fbtn', pick).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.f === S.hField)));
    $$('.pl-segs', pick).forEach(g => {
      g.hidden = +g.dataset.f !== S.hField;
      $$('.pl-seg', g).forEach(c => c.setAttribute('aria-pressed', String(+g.dataset.f === S.hField && S.hTasks.includes(c.dataset.seg))));
    });
  }
  const TARGET = { pp: '#pl-pledge', cm: '#pl-method' };
  const insertAt = (ta, text) => {
    const v = ta.value;
    const s = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    const e = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : s;
    const before = v.slice(0, s), after = v.slice(e);
    const pre = before && !/\s$/.test(before) ? ' ' : '';
    const post = after && !/^\s/.test(after) ? ' ' : '';
    ta.value = before + pre + text + post + after;
    const at = (before + pre + text).length;
    try { ta.setSelectionRange(at, at); } catch (err) { /* not focusable yet */ }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  $$('.pl-pick', tool).forEach(pick => {
    const mode = pick.dataset.mode;
    $$('.pl-fbtn', pick).forEach(b => b.addEventListener('click', () => {
      const f = +b.dataset.f;
      if (mode === 'insert') { openGroup(pick, b.getAttribute('aria-expanded') === 'true' ? -1 : f); return; }
      if (S.hField !== f) { S.hField = f; S.hTasks = []; }
      syncPick(pick); summary(); save(); queuePreview();   // #pl-hsum (aria-live) announces the choice
    }));
    $$('.pl-seg', pick).forEach(c => c.addEventListener('click', () => {
      const seg = c.dataset.seg;
      if (mode === 'insert') {
        const ta = $(TARGET[pick.dataset.key]);
        if (ta) { insertAt(ta, seg); say('أُضيفت: ' + seg); }
        return;
      }
      const i = S.hTasks.indexOf(seg);
      if (i >= 0) S.hTasks.splice(i, 1); else S.hTasks.push(seg);
      c.setAttribute('aria-pressed', String(i < 0));
      summary(); save(); queuePreview();
    }));
  });

  /* ---------------- tabs (ARIA tabs; in RTL ArrowLeft moves forward) ---------------- */
  const tabs = $$('[role=tab]', tool);
  function select(key, focus) {
    tabs.forEach(t => {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
      if (on && focus) t.focus();
    });
    if (S.tab !== key) { S.tab = key; save(); }
    queuePreview();
  }
  tabs.forEach(t => t.addEventListener('click', () => select(t.dataset.tab, false)));
  const tl = $('[role=tablist]', tool);
  tl.addEventListener('keydown', e => {
    const i = tabs.findIndex(t => t.dataset.tab === S.tab);
    const rtl = getComputedStyle(tl).direction === 'rtl';
    let j = -1;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) j = (i + 1) % tabs.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault();
    select(tabs[j].dataset.tab, true);
  });

  /* ---------------- clear ---------------- */
  const clearBtn = $('[data-pl-clear]', tool);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    let ok = true;
    try { ok = window.confirm('امسح كل ما كتبته في هذه البطاقات من هذا المتصفح؟'); } catch (e) { ok = true; }
    if (!ok) return;
    clearTimeout(saveT);
    saveT = 0;   // a cleared draft must not be written back on pagehide
    store.del();
    S = fresh();
    fill();
    area.replaceChildren();
    if (savedEl) savedEl.textContent = '';
    say('مُسحت البطاقات من هذا المتصفح.');
  });

  /* ---------------- start ---------------- */
  fill();
  addEventListener('pagehide', () => { if (saveT) saveNow(); });
  const nojs = $('[data-pl-nojs]', root);
  if (nojs) nojs.hidden = true;
  tool.hidden = false;
  queuePreview();
})();
