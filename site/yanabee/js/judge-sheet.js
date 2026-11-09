// judge-sheet — «ورقة التحكيم وتقييم المشروع» (competition.html, #c-score). Markup: tools/yanabee/feat_judge_sheet.py.
// Tab 1: self-check of the application project against the proposed rubric (c-rubric). Tab 2: judges' worksheet that
// adds up the c-score weights per team and ranks the totals (no prizes attached, no tie-break applied).
// Every number (weights, rubric rows, maximums) is read from the JSON the generator writes (#jsh-data).
// Classic script, no network: the visitor's numbers stay in this browser (localStorage 'yanabee-judge-sheet-v1').
(function () {
  'use strict';
  var root = document.getElementById('jsh');
  if (!root) return;
  var D;
  try { D = JSON.parse(document.getElementById('jsh-data').textContent); } catch (e) { return; }

  var KEY = 'yanabee-judge-sheet-v1';
  var NAME_MAX = 60;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var FIELDS = D.fields;            // [{k, max, apply}] in document order
  var NF = FIELDS.length;
  var RUB = D.rubric;               // rubric maxima, document order
  var APPLY_MAX = D.applyMax;
  var FIDX = {};
  FIELDS.forEach(function (f, i) { FIDX[f.k] = i; });

  // ------------------------------------------------------------------ storage (every access guarded)
  function read() {
    try { var s = window.localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function write() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* keeps working in memory */ }
  }

  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var fmt = function (x) { return String(r2(x)); };

  function cleanScores(a) {
    if (!Array.isArray(a) || a.length !== NF) return null;
    for (var i = 0; i < NF; i++) {
      if (a[i] === null) continue;
      if (!isNum(a[i]) || a[i] < 0 || a[i] > FIELDS[i].max) return null;
    }
    return a.slice();
  }
  function cleanName(n) {
    if (typeof n !== 'string') return null;
    n = n.replace(/\s+/g, ' ').trim();
    return n && n.length <= NAME_MAX ? n : null;
  }
  // a list of {name, scores} -> teams, or null if anything is off (the whole list is rejected)
  function cleanTeams(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || typeof t !== 'object') return null;
      var name = cleanName(t.name), s = cleanScores(t.scores);
      if (!name || !s) return null;
      // same rule as «أضف فريقًا»: a name appears once
      if (out.some(function (o) { return o.name.toLowerCase() === name.toLowerCase(); })) return null;
      out.push({ name: name, scores: s });
    }
    return out;
  }

  var state = (function (raw) {
    var st = { self: RUB.map(function () { return 0; }), teams: [], sel: 0 };
    if (!raw || typeof raw !== 'object') return st;
    if (Array.isArray(raw.self) && raw.self.length === RUB.length &&
        raw.self.every(function (v, i) { return v === Math.round(v) && v >= 0 && v <= RUB[i]; })) st.self = raw.self.slice();
    var teams = cleanTeams(raw.teams);
    if (teams) st.teams = teams;
    if (isNum(raw.sel) && raw.sel >= 0 && raw.sel < st.teams.length) st.sel = raw.sel;
    return st;
  })(read());

  // ------------------------------------------------------------------ tab 1: self-check
  var ranges = $$('.jsh-range');
  var crits = $$('.jsh-crit');
  function renderSelf() {
    var total = 0, gap = -1, at = -1;
    ranges.forEach(function (r, j) {
      var v = state.self[j], mx = RUB[j];
      r.value = v;
      r.setAttribute('aria-valuetext', v + ' من ' + mx);
      $('#jsh-o' + j + ' b').textContent = v;
      r.style.setProperty('--fill', (v / mx * 100) + '%');
      total += v;
      if (mx - v > gap) { gap = mx - v; at = j; }   // strict ">" keeps the first criterion on a tie
    });
    crits.forEach(function (c, j) {
      var on = gap > 0 && j === at;
      c.classList.toggle('is-start', on);
      $('.jsh-start', c).hidden = !on;
    });
    $('.jsh-full').hidden = gap > 0;
    $('[data-self-total]').textContent = total;
    $('[data-ring-n]').textContent = total;
    $('.jsh-ring').style.setProperty('--p', (total / APPLY_MAX * 100).toFixed(2));
  }
  ranges.forEach(function (r, j) {
    r.addEventListener('input', function () {
      var v = Math.round(+r.value);
      state.self[j] = Math.max(0, Math.min(RUB[j], v));
      renderSelf(); write();
    });
  });
  $('[data-self-reset]').addEventListener('click', function () {
    state.self = RUB.map(function () { return 0; });
    renderSelf(); write();
  });

  // ------------------------------------------------------------------ tab 2: judges' worksheet
  var inputs = $$('.jsh-card input[data-k]');
  var sel = $('#jsh-sel');
  var nameIn = $('#jsh-name');
  var status = $('.jsh-status');
  var cur = function () { return state.teams[state.sel] || null; };

  // '' -> empty (counts as 0); Arabic-Indic digits and the Arabic decimal comma are accepted
  function parse(raw, max) {
    var s = String(raw).trim()
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/[٫,،]/g, '.');
    if (s === '') return { ok: true, v: null };
    // '7.' is accepted while the decimal is being typed
    if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return { ok: false, msg: 'أدخل رقمًا من 0 إلى ' + max };
    var v = parseFloat(s);
    if (!isNum(v) || v < 0) return { ok: false, msg: 'أدخل رقمًا من 0 إلى ' + max };
    if (v > max) return { ok: false, msg: 'الحد الأعلى لهذا المعيار ' + max };
    return { ok: true, v: v };
  }
  function setErr(input, msg) {
    var e = document.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);
    if (msg) { input.setAttribute('aria-invalid', 'true'); e.textContent = msg; e.hidden = false; }
    else { input.removeAttribute('aria-invalid'); e.textContent = ''; e.hidden = true; }
  }

  function sums(scores) {
    var apply = 0, applyAny = false, total = 0, any = false;
    var axis = D.weights.map(function () { return { v: 0, any: false }; });
    FIELDS.forEach(function (f, i) {
      var v = scores[i];
      if (f.apply) {
        if (v !== null) { apply += v; applyAny = true; }
      }
    });
    // axes in document order: the applied axis is the rubric sum
    D.weights.forEach(function (w, k) {
      if (k === D.applyIndex) { axis[k] = { v: apply, any: applyAny }; return; }
      var i = FIDX['a' + k], v = scores[i];
      axis[k] = { v: v === null ? 0 : v, any: v !== null };
    });
    axis.forEach(function (a) { total += a.v; any = any || a.any; });
    return { apply: r2(apply), applyAny: applyAny, axis: axis, total: r2(total), any: any };
  }
  var show = function (v, any) { return any ? fmt(v) : '—'; };

  function renderCard() {
    var t = cur();
    var card = $('.jsh-card');
    $('.jsh-pick').hidden = !t;
    card.hidden = !t;
    if (!t) return;
    $('[data-team-name]').textContent = t.name;
    inputs.forEach(function (inp) {
      var v = t.scores[FIDX[inp.dataset.k]];
      inp.value = v === null ? '' : fmt(v);
      setErr(inp, '');
    });
    renderTotals();
  }
  function renderTotals() {
    var t = cur();
    if (!t) return;
    var s = sums(t.scores);
    $('[data-apply-sum]').textContent = show(s.apply, s.applyAny);
    $('[data-total]').textContent = show(s.total, s.any);
    $$('.jsh-seg li').forEach(function (li, k) {
      var mx = D.weights[k];
      li.firstElementChild.style.setProperty('--f', (s.axis[k].v / mx).toFixed(4));
    });
  }

  function ranking() {
    var rows = state.teams.map(function (t, i) { return { i: i, t: t, s: sums(t.scores) }; });
    rows.sort(function (a, b) { return b.s.total - a.s.total || a.i - b.i; });  // stable: order of entry on equal totals
    rows.forEach(function (r, k) {
      r.rank = k > 0 && rows[k - 1].s.total === r.s.total ? rows[k - 1].rank : k + 1;
    });
    rows.forEach(function (r) {
      r.tie = rows.some(function (o) { return o !== r && o.s.total === r.s.total; });
    });
    return rows;
  }
  function renderRank() {
    var n = state.teams.length;
    var body = $('.jsh-table tbody');
    body.textContent = '';
    $('.jsh-empty').hidden = n > 0;
    $('.jsh-scroll').hidden = n === 0;
    $('.jsh-tie').hidden = n < 2;
    $$('[data-print-mode=team],[data-print-mode=rank],[data-export]').forEach(function (b) { b.disabled = n === 0; });
    ranking().forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.i === state.sel) tr.className = 'is-sel';
      var td = document.createElement('td');
      td.className = 'jsh-rk';
      td.textContent = r.rank;
      tr.appendChild(td);
      var th = document.createElement('th');
      th.scope = 'row';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'jsh-rk-name';
      b.textContent = r.t.name;
      b.setAttribute('aria-label', r.t.name + ' — اعرض الدرجات');
      b.addEventListener('click', function () { choose(r.i); $('.jsh-card').scrollIntoView({ block: 'nearest' }); var f = inputs[0]; if (f) f.focus({ preventScroll: true }); });
      th.appendChild(b);
      tr.appendChild(th);
      r.s.axis.forEach(function (a) {
        var c = document.createElement('td');
        c.textContent = show(a.v, a.any);
        tr.appendChild(c);
      });
      var tot = document.createElement('td');
      tot.className = 'jsh-rk-total';
      var bb = document.createElement('b');
      bb.textContent = show(r.s.total, r.s.any);
      tot.appendChild(bb);
      if (r.tie) {
        var tag = document.createElement('span');
        tag.className = 'jsh-tag';
        tag.textContent = 'تساوٍ في المجموع';
        tot.appendChild(tag);
      }
      tr.appendChild(tot);
      body.appendChild(tr);
    });
  }
  function renderSelect() {
    sel.textContent = '';
    state.teams.forEach(function (t, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = t.name;
      sel.appendChild(o);
    });
    if (state.teams.length) sel.value = String(state.sel);
  }
  function renderAll() { renderSelect(); renderCard(); renderRank(); }
  function choose(i) { state.sel = i; write(); renderAll(); }

  inputs.forEach(function (inp) {
    var max = +inp.dataset.max, idx = FIDX[inp.dataset.k];
    inp.addEventListener('input', function () {
      var t = cur();
      if (!t) return;
      var p = parse(inp.value, max);
      if (!p.ok) { setErr(inp, p.msg); return; }  // the last valid value stays in the sheet
      setErr(inp, '');
      t.scores[idx] = p.v;
      write(); renderTotals(); renderRank();
    });
    inp.addEventListener('blur', function () {  // show the kept value once the field is left with a rejected entry
      var t = cur();
      if (!t || inp.getAttribute('aria-invalid') !== 'true') return;
      var v = t.scores[idx];
      inp.value = v === null ? '' : fmt(v);
    });
  });
  sel.addEventListener('change', function () { choose(+sel.value); });

  function nameErr(msg) { setErr(nameIn, msg); }
  function add() {
    var name = cleanName(nameIn.value);
    if (!name) { nameErr('اكتب اسم الفريق'); nameIn.focus(); return; }
    var dup = state.teams.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
    if (dup) { nameErr('هذا الاسم مضاف من قبل'); nameIn.focus(); return; }
    nameErr('');
    state.teams.push({ name: name, scores: FIELDS.map(function () { return null; }) });
    nameIn.value = '';
    choose(state.teams.length - 1);
    status.textContent = 'أُضيف الفريق: ' + name;
    if (inputs[0]) inputs[0].focus();
  }
  $('[data-add]').addEventListener('click', add);
  nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  nameIn.addEventListener('input', function () { if (nameIn.getAttribute('aria-invalid')) nameErr(''); });

  $('[data-del]').addEventListener('click', function () {
    var t = cur();
    if (!t) return;
    if (!window.confirm('احذف الفريق «' + t.name + '» ودرجاته من هذه الورقة؟')) return;
    state.teams.splice(state.sel, 1);
    state.sel = Math.max(0, Math.min(state.sel, state.teams.length - 1));
    write(); renderAll();
    status.textContent = 'حُذف الفريق: ' + t.name;
  });

  // ------------------------------------------------------------------ print (comp.js print mode, or a local fallback)
  function printOnly(cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  }
  function fillSheet(t) {
    var s = t ? sums(t.scores) : null;
    $$('.jsh-print [data-pv]').forEach(function (c) {
      var k = c.dataset.pv, v = '';
      if (t) {
        if (k === 'name') v = t.name;
        else if (k === 'apply') v = show(s.apply, s.applyAny);
        else if (k === 'total') v = show(s.total, s.any);
        else { var x = t.scores[FIDX[k]]; v = x === null ? '' : fmt(x); }
      }
      c.textContent = v;
    });
  }
  function fillRank() {
    var body = $('[data-prank]');
    body.textContent = '';
    ranking().forEach(function (r) {
      var tr = document.createElement('tr');
      var cells = [String(r.rank), r.t.name].concat(r.s.axis.map(function (a) { return show(a.v, a.any); }));
      cells.push(show(r.s.total, r.s.any) + (r.tie ? ' · تساوٍ في المجموع' : ''));
      cells.forEach(function (x) { var td = document.createElement('td'); td.textContent = x; tr.appendChild(td); });
      body.appendChild(tr);
    });
    $('.jsh-p-tie').hidden = state.teams.length < 2;
  }
  $$('[data-print-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      var mode = b.dataset.printMode;
      if (mode === 'team') { if (!cur()) return; fillSheet(cur()); }
      else if (mode === 'blank') fillSheet(null);
      else fillRank();
      root.dataset.mode = mode;
      printOnly('print-judge-sheet');
    });
  });

  // ------------------------------------------------------------------ copy to / from a file (no network)
  $('[data-export]').addEventListener('click', function () {
    var data = { version: 1, teams: state.teams.map(function (t) { return { name: t.name, scores: t.scores.slice() }; }) };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'yanabee-judge-sheet.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    status.textContent = 'حُفظت نسخة في ملف';
  });
  var fileIn = $('[data-import]');
  function validFile(obj) {
    if (!obj || typeof obj !== 'object' || obj.version !== 1) return null;
    return cleanTeams(obj.teams);
  }
  fileIn.addEventListener('change', function () {
    var f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (f.size > 1e6) { status.textContent = 'الملف غير صالح'; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var teams = null;
      try { teams = validFile(JSON.parse(String(rd.result))); } catch (e) { teams = null; }
      if (!teams) { status.textContent = 'الملف غير صالح'; return; }
      if (state.teams.length && !window.confirm('تحلّ الفرق التي في الملف محلّ الفرق الحالية في هذه الورقة. أتابع؟')) return;
      state.teams = teams;
      state.sel = 0;
      write(); renderAll();
      status.textContent = 'فُتحت النسخة من الملف';
    };
    rd.onerror = function () { status.textContent = 'الملف غير صالح'; };
    rd.readAsText(f);
  });

  // ------------------------------------------------------------------ start
  renderSelf();
  renderAll();
  root.hidden = false;
  window.YanabeeJudgeSheet = { state: function () { return JSON.parse(JSON.stringify(state)); }, parse: parse, ranking: function () { return ranking().map(function (r) { return { name: r.t.name, rank: r.rank, total: r.s.total, tie: r.tie }; }); } };
})();
