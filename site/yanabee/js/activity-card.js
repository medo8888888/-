// activity-card — «املأ بطاقة نشاط» (competition.html, #guide). Markup: tools/yanabee/feat_activity_card.py.
// Fills «بطاقة إعداد وتنفيذ ومتابعة وتقييم النشاط» (c-card): autosaves each card in this browser, computes the
// subscription total, the cost difference and «نسبة التحقق», counts the ticked steps, and prints the card (filled or
// blank) as the document's six tables. Every label comes from the page (the document's words); nothing here states
// a fact. Classic script, no network; storage 'yanabee-activity-card-v1' is optional (works in memory without it).
(function () {
  'use strict';
  var root = document.getElementById('ac');
  if (!root) return;
  var D;
  try { D = JSON.parse(document.getElementById('ac-data').textContent); } catch (e) { return; }

  var KEY = 'yanabee-activity-card-v1';
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var form = $('.ac-form');
  var statusEl = $('.ac-status');

  // ------------------------------------------------------------------ storage (guarded; in-memory list either way)
  function read() {
    try {
      var s = window.localStorage.getItem(KEY);
      var a = s ? JSON.parse(s) : [];
      return Array.isArray(a) ? a.filter(function (c) { return c && typeof c.id === 'string' && c.data && typeof c.data === 'object' && typeof c.updated === 'number' && isFinite(c.updated); }) : [];
    } catch (e) { return []; }
  }
  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cards)); return true; } catch (e) { return false; }
  }
  var cards = read();
  var cur = null;          // id of the open card, null for a new unsaved one
  var timer = 0;

  // ------------------------------------------------------------------ helpers
  // a non-negative number as typed (Arabic-Indic digits are normalised on input), else null
  var NUM_RE = /^(\d+(\.\d*)?|\.\d+)$/;
  var num = function (v) { v = v === null || v === undefined ? '' : String(v).trim(); return NUM_RE.test(v) ? +v : null; };
  function normDigits(el) {
    if (!el.hasAttribute || !el.hasAttribute('data-num')) return;
    var v = el.value;
    var n = v.replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/[٫,،]/g, '.');
    if (n !== v) {   // same length, so the caret stays where it was
      var at = el.selectionStart;
      el.value = n;
      try { el.setSelectionRange(at, at); } catch (e) { /* not focused */ }
    }
    var bad = n.trim() !== '' && !NUM_RE.test(n.trim());
    if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
  }
  var r2 = function (x) { return String(Math.round(x * 100) / 100); };
  function byKey(k) { return form.querySelector('[data-k="' + k + '"]'); }
  function checked(k) { var el = byKey(k); return !!(el && el.checked); }

  // ------------------------------------------------------------------ read / write the form
  function collect() {
    var d = {};
    $$('[data-k]', form).forEach(function (el) {
      var k = el.dataset.k;
      if (el.tagName === 'OUTPUT') return;
      if (el.type === 'checkbox') { if (el.checked) d[k] = true; }
      else if (el.type === 'radio') { if (el.checked) d[k] = el.value; }
      else if (el.value !== '') d[k] = el.value;
    });
    $$('[data-rep]', form).forEach(function (rep) {
      var rows = $$('.ac-rep-list > li', rep).map(function (li) {
        return $$('[data-c]', li).map(function (i) { return i.value; });
      }).filter(function (r) { return r.some(function (v) { return v !== ''; }); });
      if (rows.length) d['rep-' + rep.dataset.rep] = rows;
    });
    return d;
  }
  function addRep(rep, values) {
    var li = document.createElement('li');
    li.appendChild(document.importNode($('template', rep).content, true));
    $$('[data-c]', li).forEach(function (i, c) { i.value = values && values[c] !== undefined ? values[c] : ''; });
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'ac-rep-del';
    del.setAttribute('aria-label', 'احذف هذا السطر');
    del.innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    del.addEventListener('click', function () {
      var next = li.nextElementSibling || li.previousElementSibling;
      li.remove();
      var f = next ? next.querySelector('input') : $('[data-rep-add]', rep);
      if (f) f.focus();
      changed();
    });
    li.appendChild(del);
    $('.ac-rep-list', rep).appendChild(li);
    return li;
  }
  function apply(d) {
    d = d || {};
    $$('[data-k]', form).forEach(function (el) {
      var k = el.dataset.k;
      if (el.tagName === 'OUTPUT') return;
      if (el.type === 'checkbox') el.checked = d[k] === true;
      else if (el.type === 'radio') el.checked = d[k] === el.value;
      else el.value = typeof d[k] === 'string' ? d[k] : '';
    });
    $$('[data-rep]', form).forEach(function (rep) {
      $('.ac-rep-list', rep).textContent = '';
      var rows = Array.isArray(d['rep-' + rep.dataset.rep]) ? d['rep-' + rep.dataset.rep] : [[]];
      rows.forEach(function (r) { addRep(rep, Array.isArray(r) ? r : []); });
    });
    $$('[data-num]', form).forEach(normDigits);
    $('[data-ex-strip]').hidden = true;
    compute();
  }

  // ------------------------------------------------------------------ live results
  function compute() {
    // subscriptions: total = value × count (no currency is stated for this row)
    var v = num(byKey('subV').value), n = num(byKey('subN').value);
    byKey('subT').textContent = v !== null && n !== null ? r2(v * n) : '—';
    // actual − estimated, both as typed
    var est = num(byKey('est').value), act = num(byKey('act').value);
    var diff = $('[data-diff]');
    diff.hidden = est === null || act === null;
    if (!diff.hidden) $('[data-diff-v]').textContent = r2(act - est);
    // نسبة التحقق = الفعلي ÷ المستهدف × 100 (one decimal); — when either is empty or the target is 0
    for (var r = 0; r < D.cd5; r++) {
      var tg = num(byKey('k' + r + 't').value), ac = num(byKey('k' + r + 'a').value);
      $('[data-pct="' + r + '"]').textContent = tg && ac !== null ? (ac / tg * 100).toFixed(1) + '%' : '—';
    }
    // ticked steps
    var all = 0, allY = 0;
    $$('[data-count]').forEach(function (st) {
      var boxes = $$('input[type=checkbox]', st), x = boxes.filter(function (b) { return b.checked; }).length;
      $('[data-x]', st).textContent = x;
      all += x; allY += boxes.length;
    });
    $('[data-all-x]').textContent = all;
    $('[data-all-y]').textContent = allY;
    // the document's own warning, highlighted when photos are ticked without the photo permit
    $('[data-photo-warn]').classList.toggle('is-on', checked(D.photo) && !checked(D.perm));
    // «مكتمل» while an attachment is not ticked
    var st = form.querySelector('[data-k="status"]:checked');
    var missing = false;
    for (var j = 0; j < D.att; j++) if (!checked('att-' + j)) missing = true;
    $$('[data-att-warn]').forEach(function (w) { w.hidden = !(st && st.value === D.done && missing); });
  }

  // ------------------------------------------------------------------ saved cards
  function title(c) {
    var n = c && c.data && typeof c.data[D.name] === 'string' ? c.data[D.name].trim() : '';
    return n || 'بطاقة بلا اسم';
  }
  function when(ms) {
    var d = new Date(ms), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderList() {
    var ul = $('.ac-list');
    ul.textContent = '';
    $('.ac-none').hidden = cards.length > 0;
    cards.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (c) {
      var li = document.createElement('li');
      if (c.id === cur) li.className = 'is-cur';
      var info = document.createElement('div');
      var b = document.createElement('b'); b.textContent = title(c);
      var sm = document.createElement('small'); sm.textContent = 'آخر حفظ: ' + when(c.updated);
      info.appendChild(b); info.appendChild(sm);
      li.appendChild(info);
      if (c.id === cur) {
        var tag = document.createElement('span'); tag.className = 'ac-cur'; tag.textContent = 'مفتوحة الآن';
        li.appendChild(tag);
      } else {
        var o = document.createElement('button');
        o.type = 'button'; o.className = 'btn btn-ghost btn-sm ac-btn'; o.textContent = 'افتح';
        o.setAttribute('aria-label', 'افتح: ' + title(c));
        o.addEventListener('click', function () { openCard(c.id); });
        li.appendChild(o);
      }
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'btn btn-ghost btn-sm ac-btn ac-del'; x.textContent = 'احذف';
      x.setAttribute('aria-label', 'احذف: ' + title(c));
      x.addEventListener('click', function () { delCard(c.id); });
      li.appendChild(x);
      ul.appendChild(li);
    });
  }
  function flush() {
    clearTimeout(timer); timer = 0;
    var d = collect();
    var c = cards.filter(function (x) { return x.id === cur; })[0];
    if (!c) {
      if (!Object.keys(d).length) return;
      c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), updated: 0, data: {} };
      cards.push(c);
      cur = c.id;
    }
    c.data = d;
    c.updated = Date.now();
    var ok = write();
    renderList();
    statusEl.textContent = ok ? 'حُفظت البطاقة في هذا المتصفح' : 'تعذّر الحفظ في هذا المتصفح؛ البطاقة باقية ما دامت الصفحة مفتوحة';
  }
  function changed() { compute(); clearTimeout(timer); timer = setTimeout(flush, 700); }
  function openCard(id) {
    if (timer) flush();
    var c = cards.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    cur = id;
    apply(c.data);
    renderList();
    statusEl.textContent = 'فُتحت البطاقة: ' + title(c);
  }
  function newCard() {
    if (timer) flush();
    cur = null;
    apply({});
    renderList();
    statusEl.textContent = 'بطاقة جديدة';
    var f = form.querySelector('input[type=text],textarea');
    if (f) f.focus();
  }
  function delCard(id) {
    var c = cards.filter(function (x) { return x.id === id; })[0];
    if (!c || !window.confirm('احذف البطاقة «' + title(c) + '» من هذا المتصفح؟')) return;
    if (timer && cur !== id) flush();   // keep pending edits of the open card when another card is deleted
    clearTimeout(timer); timer = 0;
    cards = cards.filter(function (x) { return x.id !== id; });
    write();
    if (cur === id) { cur = null; apply({}); }
    renderList();
    statusEl.textContent = 'حُذفت البطاقة: ' + title(c);
  }

  // ------------------------------------------------------------------ events
  form.addEventListener('input', function (e) { normDigits(e.target); changed(); });
  form.addEventListener('change', changed);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  $$('[data-rep-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = addRep(b.closest('[data-rep]'));
      var f = li.querySelector('input'); if (f) f.focus();
      changed();
    });
  });
  $('[data-new]').addEventListener('click', newCard);
  $('[data-example]').addEventListener('click', function () {
    var fields = $$('#ac-cd1 [data-example]', form);
    var filled = fields.some(function (f) { return f.value !== ''; });
    if (filled && !window.confirm('تحلّ قيم مثال البطاقة محلّ ما كتبته في الجزء الأول. أتابع؟')) return;
    fields.forEach(function (f) { f.value = f.getAttribute('data-example'); });
    $('[data-ex-strip]').hidden = false;
    changed();
  });
  window.addEventListener('pagehide', function () { if (timer) flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && timer) flush(); });

  // ------------------------------------------------------------------ print: a static view, filled or blank
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var blankLine = function () { return el('i', 'ac-p-blank'); };
  function dateText(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? m[3] + ' / ' + m[2] + ' / ' + m[1] : v; }
  function ctlValue(c, blank) {
    if (blank) return '';
    if (c.tagName === 'OUTPUT') return c.textContent === '—' ? '' : c.textContent;
    return c.type === 'date' ? dateText(c.value) : c.value;
  }
  function piece(parent, label, value) {
    var s = el('span', 'ac-p-piece');
    if (label) s.appendChild(el('span', 'ac-p-sub', label + ' '));
    if (value) s.appendChild(el('b', '', value)); else s.appendChild(blankLine());
    parent.appendChild(s);
  }
  function rowValue(u, blank) {
    var td = el('td');
    var rep = u.querySelector('[data-rep]');
    if (rep) {
      var labels = $$('template', rep)[0].content.querySelectorAll('[data-sub]');
      var rows = blank ? [] : $$('.ac-rep-list > li', rep).map(function (li) { return $$('[data-c]', li).map(function (i) { return i.value; }); })
        .filter(function (r) { return r.some(function (v) { return v !== ''; }); });
      if (!rows.length) rows = blank ? [[], []] : [[]];
      rows.forEach(function (r) {
        var line = el('div', 'ac-p-line');
        Array.prototype.forEach.call(labels, function (lb, c) { piece(line, lb.getAttribute('data-sub'), r[c] || ''); });
        td.appendChild(line);
      });
      return td;
    }
    var opts = $$('input[type=checkbox],input[type=radio]', u);
    if (opts.length) {
      var ul = el('ul', 'ac-p-opts');
      opts.forEach(function (o) {
        var on = !blank && o.checked;
        var li = el('li', on ? 'on' : '');
        li.appendChild(el('span', 'ac-p-box', on ? '☑' : '☐'));
        li.appendChild(el('span', '', o.closest('label').textContent.trim()));
        ul.appendChild(li);
      });
      td.appendChild(ul);
    }
    $$('input:not([type=checkbox]):not([type=radio]),textarea,output', u).forEach(function (c) {
      piece(td, c.getAttribute('data-sub') || '', ctlValue(c, blank));
    });
    $$('[data-pr-text]', u).forEach(function (h) { td.appendChild(el('small', 'ac-p-hint', h.textContent)); });
    return td;
  }
  function gridTable(u, blank) {
    var src = u.querySelector('table');
    var tb = el('table', 'ac-p-tbl ac-p-grid');
    var tr = el('tr');
    $$('thead th', src).forEach(function (h) { tr.appendChild(el('th', '', h.textContent)); });
    tb.appendChild(el('thead')).appendChild(tr);
    var body = tb.appendChild(el('tbody'));
    $$('tbody tr', src).forEach(function (row) {
      var r = el('tr');
      Array.prototype.forEach.call(row.cells, function (cell) {
        if (cell.tagName === 'TH') {
          var th = el('th');
          var copy = cell.cloneNode(true);
          $$('label', copy).forEach(function (l) { l.remove(); });
          th.appendChild(el('span', '', copy.textContent.trim()));
          $$('input', cell).forEach(function (i) { var d = el('div', 'ac-p-line'); piece(d, i.getAttribute('data-sub'), ctlValue(i, blank)); th.appendChild(d); });
          r.appendChild(th);
        } else {
          var td = el('td');
          var c = cell.querySelector('input,output');
          var v = c ? ctlValue(c, blank) : '';
          td.textContent = v;
          r.appendChild(td);
        }
      });
      body.appendChild(r);
    });
    return tb;
  }
  function buildPrint(blank) {
    var out = $('.ac-print');
    out.textContent = '';
    var head = el('header', 'ac-p-head');
    head.appendChild(el('b', '', $('.ac-head .kicker').textContent.trim()));
    head.appendChild(el('small', '', $('.ac-head p').textContent.trim()));
    out.appendChild(head);
    $$('.ac-part', form).forEach(function (part) {
      var sec = el('section', 'ac-p-part');
      var lg = part.querySelector('legend');
      sec.appendChild(el('h4', '', lg.querySelector('small').textContent.trim() + ': ' + lg.querySelector('b').textContent.trim()));
      var tbl = null;
      $$('[data-pr]', part).filter(function (u) { return !u.parentElement.closest('[data-pr]'); }).forEach(function (u) {
        var pr = u.dataset.pr;
        if (pr === 'row') {
          if (!tbl) {
            tbl = el('table', 'ac-p-tbl');
            if (part.dataset.h1) {
              var hr = el('tr');
              hr.appendChild(el('th', '', part.dataset.h1));
              hr.appendChild(el('th', '', part.dataset.h2));
              tbl.appendChild(el('thead')).appendChild(hr);
            }
            tbl.appendChild(el('tbody'));
            sec.appendChild(tbl);
          }
          var tr = el('tr');
          tr.appendChild(el('th', '', u.querySelector('[data-rl]').textContent.trim()));
          tr.appendChild(rowValue(u, blank));
          tbl.tBodies[0].appendChild(tr);
        } else {
          tbl = null;
          if (pr === 'note') sec.appendChild(el('p', 'ac-p-note', u.textContent.trim()));
          else if (pr === 'grid') sec.appendChild(gridTable(u, blank || u.hasAttribute('data-blank')));
        }
      });
      out.appendChild(sec);
    });
  }
  function printOnly(cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  }
  $$('[data-print-card]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (timer) flush();
      buildPrint(b.dataset.printCard === 'blank');
      printOnly('print-activity-card');
    });
  });

  // ------------------------------------------------------------------ start: the last card edited, or a new one
  var last = cards.slice().sort(function (a, b) { return b.updated - a.updated; })[0];
  if (last) { cur = last.id; apply(last.data); } else apply({});
  renderList();
  root.hidden = false;
  window.YanabeeActivityCard = { collect: collect, cards: function () { return JSON.parse(JSON.stringify(cards)); }, current: function () { return cur; }, buildPrint: buildPrint, flush: flush };
})();
