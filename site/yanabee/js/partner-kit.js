// partner-kit — «ملف الجهة الشريكة وتقرير الأسبوعين» (competition.html, #c-partner). Markup: tools/yanabee/feat_partner_kit.py.
// Tab 1: partner type (مدرسة / جمعية dims the other column of the c-p-by table), ticks on the two lists of
// obligations, print of the partnership sheet. Tab 2: a fortnightly report draft (c-follow items) with the achievement
// rate (المتحقق ÷ المستهدف × 100), saved reports, print, copy as text, erase everything.
// Classic script, no network. State: localStorage 'yanabee-partner-kit-v1' (guarded; works in memory without it).
(function () {
  'use strict';
  var root = document.getElementById('pk');
  if (!root) return;
  var D;
  try { D = JSON.parse(document.getElementById('pk-data').textContent); } catch (e) { return; }

  var KEY = 'yanabee-partner-kit-v1';
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var form = $('.pk-rform');
  var statusEl = $('.pk-status');
  var DAY = 864e5;

  function today() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var bools = function (a, n) { var o = []; for (var i = 0; i < n; i++) o.push(!!(Array.isArray(a) && a[i] === true)); return o; };
  var num = function (v) { return v === '' || v === null || v === undefined || !isFinite(+v) ? null : +v; };
  function pctOf(target, done) {
    var tg = num(target), dn = num(done);
    return tg && dn !== null ? Math.round(dn / tg * 100) : null;   // — when the target is empty or 0; above 100 stays
  }

  // ------------------------------------------------------------------ storage
  function fresh() { return { type: 'school', ticks: { p: bools(null, D.p), y: bools(null, D.y) }, draft: null, history: [] }; }
  function load() {
    var st = fresh(), raw = null;
    try { var s = window.localStorage.getItem(KEY); raw = s ? JSON.parse(s) : null; } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return st;
    if (raw.type === 'assoc') st.type = 'assoc';
    if (raw.ticks) { st.ticks.p = bools(raw.ticks.p, D.p); st.ticks.y = bools(raw.ticks.y, D.y); }
    if (raw.draft && typeof raw.draft === 'object') st.draft = raw.draft;
    if (Array.isArray(raw.history)) st.history = raw.history.filter(function (h) { return h && typeof h === 'object' && h.fields; });
    return st;
  }
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }
  var state = load();

  // ------------------------------------------------------------------ tab 1: type + ticks
  function renderType() {
    root.dataset.type = state.type;
    $$('.pk-tbtn').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.type === state.type ? 'true' : 'false'); });
  }
  $$('.pk-tbtn').forEach(function (b) {
    b.addEventListener('click', function () { state.type = b.dataset.type; renderType(); save(); });
  });
  $$('[data-tick]').forEach(function (c) {
    c.checked = state.ticks[c.dataset.tick][+c.dataset.i];
    c.addEventListener('change', function () { state.ticks[c.dataset.tick][+c.dataset.i] = c.checked; save(); });
  });

  // ------------------------------------------------------------------ tab 2: report draft
  var projList = $('.pk-proj');
  var projTpl = $('.pk-proj + template') || $('template', form);
  var projSeq = 0;
  function addProj(vals) {
    var li = document.createElement('li');
    li.appendChild(document.importNode(projTpl.content, true));
    projSeq++;
    $$('[data-c]', li).forEach(function (inp, c) {
      inp.id = 'pk-pr' + projSeq + '-' + c;
      inp.previousElementSibling.setAttribute('for', inp.id);
      inp.value = vals && typeof vals[c] === 'string' ? vals[c] : '';
    });
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'pk-del';
    del.setAttribute('aria-label', 'احذف هذا السطر');
    del.innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    del.addEventListener('click', function () {
      var next = li.nextElementSibling || li.previousElementSibling;
      li.remove();
      (next ? next.querySelector('input') : $('[data-proj-add]')).focus();
      changed();
    });
    li.appendChild(del);
    projList.appendChild(li);
    return li;
  }
  function nextN() { return state.history.reduce(function (m, h) { return Math.max(m, +h.n || 0); }, 0) + 1; }
  function collect() {
    var f = {};
    $$('[data-f]', form).forEach(function (el) { if (el.value !== '') f[el.dataset.f] = el.value; });
    var proj = $$('li', projList).map(function (li) { return $$('[data-c]', li).map(function (i) { return i.value; }); })
      .filter(function (r) { return r.some(function (v) { return v.trim() !== ''; }); });
    return { fields: f, proj: proj };
  }
  function apply(d) {
    d = d || {};
    var f = d.fields || {};
    $$('[data-f]', form).forEach(function (el) { el.value = typeof f[el.dataset.f] === 'string' ? f[el.dataset.f] : ''; });
    if (!f.n) $('[data-f=n]', form).value = String(nextN());
    if (!f.date) $('[data-f=date]', form).value = today();
    projList.textContent = '';
    var rows = Array.isArray(d.proj) && d.proj.length ? d.proj : [[]];
    rows.forEach(function (r) { addProj(Array.isArray(r) ? r : []); });
    compute();
  }
  function compute() {
    var p = pctOf($('[data-f=target]', form).value, $('[data-f=done]', form).value);
    $('[data-pct]').textContent = p === null ? '—' : p + '%';
    return p;
  }
  function changed() { compute(); state.draft = collect(); save(); }
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  $('[data-proj-add]').addEventListener('click', function () { addProj().querySelector('input').focus(); changed(); });

  // plain list of (label, value) in the order of the form — for copying and printing
  function lines() {
    var out = [];
    var label = function (el) { var l = form.querySelector('label[for="' + el.id + '"]'); return l ? l.textContent.trim() : ''; };
    $$('.pk-rform > *', root).forEach(function (blk) {
      if (blk.tagName === 'FIELDSET') {
        var lg = blk.querySelector('legend').textContent.trim();
        if (blk.querySelector('.pk-proj')) {
          var rows = collect().proj;
          out.push([lg, rows.length ? '' : '—']);
          rows.forEach(function (r) { out.push(['', (r[0] || '—') + ': ' + (r[1] || '—')]); });
          return;
        }
        out.push([lg, '']);
        $$('[data-f]', blk).forEach(function (el) { out.push(['· ' + label(el), el.value || '—']); });
        var o = blk.querySelector('[data-pct]');
        if (o) out.push(['· ' + lg, o.textContent]);
      } else {
        $$('[data-f]', blk).forEach(function (el) { out.push([label(el), el.value || '—']); });
      }
    });
    return out;
  }
  function reportText() {
    var head = $('#pk-p-report .dp-h3').textContent.trim();
    return [head].concat(lines().map(function (l) { return l[0] ? l[0] + (l[1] ? ': ' + l[1] : ':') : '  - ' + l[1]; })).join('\n');
  }

  // ------------------------------------------------------------------ saved reports
  function since(ms) {
    var n = Math.max(0, Math.floor((Date.now() - ms) / DAY));
    if (n === 0) return 'حُفظ آخر تقرير اليوم';
    if (n === 1) return 'مضى يوم واحد منذ آخر تقرير محفوظ';
    if (n === 2) return 'مضى يومان منذ آخر تقرير محفوظ';
    return 'مضى ' + n + (n <= 10 ? ' أيام' : ' يومًا') + ' منذ آخر تقرير محفوظ';
  }
  function renderHistory() {
    var list = $('.pk-hlist');
    list.textContent = '';
    var hs = state.history.slice().sort(function (a, b) { return (+a.n || 0) - (+b.n || 0); });
    $('.pk-hnone').hidden = hs.length > 0;
    hs.forEach(function (h) {
      var li = document.createElement('li');
      var b = document.createElement('b'); b.textContent = 'رقم ' + h.n;
      var sm = document.createElement('span'); sm.textContent = (h.date || '—') + ' · ' + (h.pct === null || h.pct === undefined ? '—' : h.pct + '%');
      var o = document.createElement('button');
      o.type = 'button'; o.className = 'btn btn-ghost btn-sm pk-btn'; o.textContent = 'افتح';
      o.setAttribute('aria-label', 'افتح التقرير رقم ' + h.n);
      o.addEventListener('click', function () {
        apply({ fields: h.fields, proj: h.proj });
        state.draft = collect(); save();
        statusEl.textContent = 'فُتح التقرير رقم ' + h.n;
        $('[data-f=n]', form).focus();
      });
      li.appendChild(b); li.appendChild(sm); li.appendChild(o);
      list.appendChild(li);
    });
    var last = hs.reduce(function (m, h) { return Math.max(m, +h.saved || 0); }, 0);
    $('.pk-since').textContent = last ? since(last) : '';
    $('.pk-since').hidden = !last;
    // a small line of the rate across saved reports (no axes, no animation)
    var svg = $('.pk-spark'), pts = hs.filter(function (h) { return typeof h.pct === 'number'; });
    svg.hidden = pts.length < 2;
    if (pts.length >= 2) {
      var max = Math.max(100, Math.max.apply(null, pts.map(function (h) { return h.pct; })));
      var coords = pts.map(function (h, i) {
        var x = 300 - (i / (pts.length - 1)) * 300;   // RTL: the first report on the right
        var y = 56 - (h.pct / max) * 52;
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      svg.querySelector('polyline').setAttribute('points', coords.join(' '));
      svg.setAttribute('aria-label', 'نسبة إنجاز المستهدف في التقارير المحفوظة: ' + pts.map(function (h) { return h.pct + '%'; }).join('، '));
    }
  }
  $('[data-save]').addEventListener('click', function () {
    var d = collect();
    var n = parseInt(d.fields.n, 10);
    if (!(n >= 1)) { var nf = $('[data-f=n]', form); nf.setAttribute('aria-invalid', 'true'); nf.focus(); statusEl.textContent = 'اكتب رقم التقرير'; return; }
    $('[data-f=n]', form).removeAttribute('aria-invalid');
    var entry = { n: n, date: d.fields.date || '', fields: d.fields, proj: d.proj, pct: compute(), saved: Date.now() };
    var at = -1;
    state.history.forEach(function (h, i) { if (+h.n === n) at = i; });
    if (at >= 0) state.history[at] = entry; else state.history.push(entry);
    state.draft = d;
    var ok = save();
    renderHistory();
    statusEl.textContent = (at >= 0 ? 'حُدّث التقرير رقم ' : 'حُفظ التقرير رقم ') + n + (ok ? '' : ' (في هذه الصفحة فقط؛ التخزين غير متاح)');
  });
  $('[data-new-report]').addEventListener('click', function () {
    apply({});
    state.draft = collect(); save();
    statusEl.textContent = 'تقرير جديد رقم ' + $('[data-f=n]', form).value;
  });
  $('[data-clear]').addEventListener('click', function () {
    if (!window.confirm('امسح كل بيانات الجهة الشريكة والتقارير المحفوظة من هذا المتصفح؟')) return;
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ }
    state = fresh();
    renderType();
    $$('[data-tick]').forEach(function (c) { c.checked = false; });
    apply({});
    renderHistory();
    statusEl.textContent = 'مُسحت كل البيانات من هذا المتصفح';
  });

  // ------------------------------------------------------------------ copy as text
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.insetInlineStart = '-9999px'; ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  $('[data-copy]').addEventListener('click', function () {
    var text = reportText();
    var done = function (ok) { statusEl.textContent = ok ? 'نُسخ نص التقرير' : 'تعذّر النسخ في هذا المتصفح'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else done(fallbackCopy(text));
  });

  // ------------------------------------------------------------------ print
  function printOnly(cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  }
  $('[data-print-sheet]').addEventListener('click', function () { printOnly('print-partner-sheet'); });
  $('[data-print-report]').addEventListener('click', function () {
    var body = $('[data-preport]');
    body.textContent = '';
    lines().forEach(function (l) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.textContent = l[0];
      var td = document.createElement('td'); td.textContent = l[1];
      if (!l[0]) { th.textContent = ''; td.className = 'pk-psub'; }
      if (l[0] && !l[1]) tr.className = 'pk-pgroup';
      tr.appendChild(th); tr.appendChild(td);
      body.appendChild(tr);
    });
    printOnly('print-partner-report');
  });

  // ------------------------------------------------------------------ start
  renderType();
  apply(state.draft || {});
  renderHistory();
  $$('.pk-type,.pk-hint,.pk-tools,.pk-form').forEach(function (e) { e.hidden = false; });
  window.YanabeePartnerKit = { state: function () { return JSON.parse(JSON.stringify(state)); }, text: reportText, pct: pctOf };
})();
