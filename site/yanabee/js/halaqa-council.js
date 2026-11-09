// quran.html #halaqa-council — «أدوات مجلس قادة الفرق»: the monthly leader rotation and the weekly values league
// for the halaqa teams of axis three. Built by tools/yanabee/feat_halaqa_council.py (all document wording is in
// the HTML; #hc-data only carries the team-size range of the a3 label, for a soft warning).
//  * Only «قائد الفريق» rotates (names[i % n]); the two other roles are set by hand, once, with per-month overrides.
//  * The league adds the four components as entered (the document gives no weights); team totals only.
// Everything stays in this browser (localStorage 'yanabee-halaqa-council-v1', every access guarded); export/import
// is a local JSON file. Classic script, no modules, no libraries: works from file://. Test hook: window.YanabeeHalaqa.
(function () {
  'use strict';
  var box = document.getElementById('halaqa-council');
  if (!box) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'yanabee-halaqa-council-v1';
  var cfg = { size: [6, 10] };
  try { cfg = JSON.parse($('hc-data').textContent) || cfg; } catch (e) { /* defaults */ }

  /* ---------------- dates ---------------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dkey = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var mkey = function (y, m) { var d = new Date(y, m, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  var pdate = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  var pmonth = function (s) { var m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] - 1 } : null; };
  var now = function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  var fmt = function (o) { try { return new Intl.DateTimeFormat('ar-u-nu-latn', o); } catch (e) { return { format: dkey }; } };
  var fMonth = fmt({ month: 'long', year: 'numeric' });
  var fMonthOnly = fmt({ month: 'long' });
  var fDay = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
  var monthName = function (k) { var p = pmonth(k); return p ? fMonth.format(new Date(p.y, p.m, 1)) : k; };

  /* ---------------- state + storage ---------------- */
  var blank = function () {
    var n = now();
    return { v: 1, names: [], start: mkey(n.getFullYear(), n.getMonth()), months: null, auto: true,
      fixed: { quality: '', tech: '' }, overrides: {}, teams: [], weeks: [], sel: 0, view: 'week' };
  };
  var isStr = function (x) { return typeof x === 'string'; };
  // point tables are keyed by team name: a prototype-less object so names such as «constructor» or «__proto__» are plain keys
  var dict = function () { return Object.create(null); };
  // number fields are type=text inputmode=numeric so Arabic-Indic digits (٠-٩, ۰-۹) are accepted and read as 0-9
  var latin = function (s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); }).trim();
  };
  var toInt = function (s) { s = latin(s); return /^\d+$/.test(s) ? parseInt(s, 10) : NaN; };
  var clean = function (arr) {
    var out = [];
    arr.forEach(function (s) { s = String(s).trim(); if (s && out.indexOf(s) < 0) out.push(s); });
    return out;
  };
  // schema check: returns a normalised state, or null when `o` is not this tool's data
  var validate = function (o) {
    if (!o || typeof o !== 'object' || o.v !== 1) return null;
    if (!Array.isArray(o.names) || !o.names.every(isStr)) return null;
    if (!Array.isArray(o.teams) || !o.teams.every(isStr)) return null;
    if (!pmonth(o.start)) return null;
    if (o.months != null && !(Number.isInteger(o.months) && o.months >= 1 && o.months <= 24)) return null;
    if (!Array.isArray(o.weeks)) return null;
    var fixed = o.fixed || {};
    if (typeof fixed !== 'object' || (fixed.quality != null && !isStr(fixed.quality)) || (fixed.tech != null && !isStr(fixed.tech))) return null;
    var ov = o.overrides || {};
    if (typeof ov !== 'object' || Array.isArray(ov)) return null;
    var overrides = {};
    for (var k in ov) {
      if (!Object.prototype.hasOwnProperty.call(ov, k)) continue;
      var x = ov[k];
      if (!pmonth(k) || !x || typeof x !== 'object' || (x.quality != null && !isStr(x.quality)) || (x.tech != null && !isStr(x.tech))) return null;
      overrides[k] = { quality: x.quality || '', tech: x.tech || '' };
    }
    var weeks = [];
    for (var i = 0; i < o.weeks.length; i++) {
      var w = o.weeks[i];
      if (!w || typeof w !== 'object' || !pdate(w.start) || !w.pts || typeof w.pts !== 'object' || Array.isArray(w.pts)) return null;
      var pts = dict();
      for (var team in w.pts) {
        if (!Object.prototype.hasOwnProperty.call(w.pts, team)) continue;
        var a = w.pts[team];
        if (!Array.isArray(a) || a.length !== 4) return null;
        if (!a.every(function (v) { return v === null || (Number.isInteger(v) && v >= 0); })) return null;
        pts[team] = a.slice();
      }
      weeks.push({ start: w.start, pts: pts });
    }
    weeks.sort(function (p, q) { return p.start < q.start ? -1 : p.start > q.start ? 1 : 0; });
    var sel = Number.isInteger(o.sel) ? Math.min(Math.max(o.sel, 0), Math.max(weeks.length - 1, 0)) : Math.max(weeks.length - 1, 0);
    return { v: 1, names: clean(o.names), start: o.start, months: o.months == null ? null : o.months, auto: o.auto !== false && o.months == null ? true : o.auto === true,
      fixed: { quality: fixed.quality || '', tech: fixed.tech || '' }, overrides: overrides, teams: clean(o.teams), weeks: weeks, sel: sel,
      view: ['week', 'month', 'season'].indexOf(o.view) >= 0 ? o.view : 'week' };
  };
  var S = blank();
  var storeOk = true;
  var notice = function () { $('hc-store').hidden = storeOk; };
  var load = function () {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var v = validate(JSON.parse(raw));
      if (v) S = v;
    } catch (e) { storeOk = false; }
  };
  var save = function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(S)); storeOk = true; } catch (e) { storeOk = false; }
    notice();
  };
  var msg = function (s) { $('hc-msg').textContent = s; };

  /* ---------------- tabs ---------------- */
  var tabs = [].slice.call(box.querySelectorAll('.hc-tabs [role=tab]'));
  var select = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var p = $(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t, false); $('hc-msg').textContent = ''; });
    t.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowLeft') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowRight') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); select(tabs[j], true); }
    });
  });

  /* ---------------- rotation ---------------- */
  var el = function (tag, cls, txt) { var x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
  var names = $('hc-names'), monthsIn = $('hc-months'), sm = $('hc-start-m'), sy = $('hc-start-y');
  var fixQ = $('hc-fix-q'), fixT = $('hc-fix-t');
  var ROLE_Q = $('hc-fix-q').labels && $('hc-fix-q').labels[0] ? $('hc-fix-q').labels[0].textContent.trim() : '';
  var ROLE_T = $('hc-fix-t').labels && $('hc-fix-t').labels[0] ? $('hc-fix-t').labels[0].textContent.trim() : '';
  (function months() {
    for (var m = 0; m < 12; m++) { var o = el('option', '', fMonthOnly.format(new Date(2026, m, 1))); o.value = String(m); sm.appendChild(o); }
  })();
  var fillYears = function () {
    var y0 = now().getFullYear(), p = pmonth(S.start), ys = [];
    for (var y = y0 - 1; y <= y0 + 2; y++) ys.push(y);
    if (p && ys.indexOf(p.y) < 0) { ys.push(p.y); ys.sort(); }
    sy.textContent = '';
    ys.forEach(function (y) { var o = el('option', '', String(y)); o.value = String(y); sy.appendChild(o); });
  };
  var monthsCount = function () { return S.auto || !S.months ? Math.max(S.names.length, 1) : S.months; };
  var plan = function () {
    var p = pmonth(S.start), out = [], n = S.names.length, M = monthsCount();
    for (var i = 0; i < M; i++) {
      var k = mkey(p.y, p.m + i), ov = S.overrides[k] || {};
      var q = ov.quality && S.names.indexOf(ov.quality) >= 0 ? ov.quality : (S.names.indexOf(S.fixed.quality) >= 0 ? S.fixed.quality : '');
      var t = ov.tech && S.names.indexOf(ov.tech) >= 0 ? ov.tech : (S.names.indexOf(S.fixed.tech) >= 0 ? S.fixed.tech : '');
      out.push({ k: k, leader: n ? S.names[i % n] : '', quality: q, tech: t,
        oq: !!(ov.quality && S.names.indexOf(ov.quality) >= 0), ot: !!(ov.tech && S.names.indexOf(ov.tech) >= 0) });
    }
    return out;
  };
  var fillFixed = function (sel, cur) {
    sel.textContent = '';
    var o = el('option', '', '— لم يُعيَّن —'); o.value = ''; sel.appendChild(o);
    S.names.forEach(function (nm) { var x = el('option', '', nm); x.value = nm; sel.appendChild(x); });
    sel.value = S.names.indexOf(cur) >= 0 ? cur : '';
  };
  var cellSelect = function (row, role, label) {
    var td = el('td', 'hc-role');
    var shown = el('span', 'hc-name' + (row['o' + role[0]] ? ' hc-ov' : ''), row[role] || '—');
    var s = el('select', 'hc-cell');
    s.setAttribute('aria-label', label + ' — ' + monthName(row.k));
    var base = S.names.indexOf(S.fixed[role]) >= 0 ? S.fixed[role] : '';
    var d = el('option', '', 'كالمعتاد' + (base ? ' (' + base + ')' : '')); d.value = ''; s.appendChild(d);
    S.names.forEach(function (nm) { var x = el('option', '', nm); x.value = nm; s.appendChild(x); });
    s.value = row['o' + role[0]] ? row[role] : '';
    s.dataset.month = row.k; s.dataset.role = role;
    td.appendChild(shown); td.appendChild(s);
    return td;
  };
  var renderRot = function () {
    var n = S.names.length, lo = cfg.size[0], hi = cfg.size[1];
    $('hc-count').textContent = 'عدد الأسماء: ' + n;
    $('hc-warn').hidden = !n || (n >= lo && n <= hi);
    var p = pmonth(S.start);
    sm.value = String(p.m);
    if (![].some.call(sy.options, function (o) { return +o.value === p.y; })) fillYears();
    sy.value = String(p.y);
    monthsIn.value = String(monthsCount());
    fillFixed(fixQ, S.fixed.quality); fillFixed(fixT, S.fixed.tech);
    var rows = plan(), body = $('hc-rot-body');
    body.textContent = '';
    if (!n) {
      var tr = el('tr'), td = el('td', 'hc-none', 'اكتب أسماء أعضاء الفريق ليظهر الجدول.'); td.colSpan = 4; tr.appendChild(td); body.appendChild(tr);
    } else {
      var cur = mkey(now().getFullYear(), now().getMonth());
      rows.forEach(function (r) {
        var tr = el('tr');
        if (r.k === cur) tr.className = 'hc-now';
        var th = el('th', '', monthName(r.k)); th.scope = 'row';
        if (r.k === cur) { th.appendChild(el('small', 'hc-now-k', 'هذا الشهر')); tr.setAttribute('aria-current', 'date'); }
        tr.appendChild(th);
        tr.appendChild(el('td', 'hc-leader', r.leader));
        tr.appendChild(cellSelect(r, 'quality', ROLE_Q));
        tr.appendChild(cellSelect(r, 'tech', ROLE_T));
        body.appendChild(tr);
      });
    }
    $('hc-rot-range').textContent = n ? 'من ' + monthName(rows[0].k) + ' إلى ' + monthName(rows[rows.length - 1].k) + ' (عدد الأشهر: ' + rows.length + ')' : '';
    // who has led so far: from the start month up to this month, within the table
    var so = $('hc-sofar');
    so.textContent = '';
    var t0 = now(), diff = (t0.getFullYear() - p.y) * 12 + (t0.getMonth() - p.m);
    if (!n) so.appendChild(el('li', 'hc-none', 'لا أسماء بعد.'));
    else if (diff < 0) so.appendChild(el('li', 'hc-none', 'لم يبدأ الجدول بعد؛ يبدأ في ' + monthName(S.start) + '.'));
    else {
      rows.slice(0, Math.min(diff + 1, rows.length)).forEach(function (r) {
        var li = el('li'); li.appendChild(el('span', 'hc-m', monthName(r.k))); li.appendChild(el('b', '', r.leader)); so.appendChild(li);
      });
      if (diff >= rows.length) so.appendChild(el('li', 'hc-none', 'انتهت الأشهر المحددة في الجدول.'));
    }
  };
  names.addEventListener('input', function () {
    S.names = clean(names.value.split(/\r?\n/));
    save(); renderRot();
  });
  names.addEventListener('blur', function () { names.value = S.names.join('\n'); });
  var setStart = function () { S.start = mkey(+sy.value, +sm.value); save(); renderRot(); };
  sm.addEventListener('change', setStart); sy.addEventListener('change', setStart);
  monthsIn.addEventListener('change', function () {
    var v = toInt(monthsIn.value);
    if (!isFinite(v) || v < 1) { S.auto = true; S.months = null; }
    else { S.months = Math.min(24, Math.max(1, v)); S.auto = false; }
    save(); renderRot();
  });
  $('hc-full').addEventListener('click', function () { S.auto = true; S.months = null; save(); renderRot(); });
  fixQ.addEventListener('change', function () { S.fixed.quality = fixQ.value; save(); renderRot(); });
  fixT.addEventListener('change', function () { S.fixed.tech = fixT.value; save(); renderRot(); });
  $('hc-rot-body').addEventListener('change', function (e) {
    var s = e.target.closest('select.hc-cell');
    if (!s) return;
    var k = s.dataset.month, role = s.dataset.role, o = S.overrides[k] || { quality: '', tech: '' };
    o[role] = s.value;
    if (!o.quality && !o.tech) delete S.overrides[k]; else S.overrides[k] = o;
    save(); renderRot();
    var again = $('hc-rot-body').querySelector('select[data-month="' + k + '"][data-role="' + role + '"]');
    if (again) again.focus();
  });

  /* ---------------- values league ---------------- */
  var teamsIn = $('hc-teams'), weekSel = $('hc-week'), weekStart = $('hc-week-start');
  var sum = function (a) { return (a || []).reduce(function (s, v) { return s + (v || 0); }, 0); };
  var curWeek = function () { return S.weeks[S.sel] || null; };
  var periodWeeks = function () {
    var w = curWeek();
    if (!w) return [];
    if (S.view === 'week') return [w];
    if (S.view === 'month') return S.weeks.filter(function (x) { return x.start.slice(0, 7) === w.start.slice(0, 7); });
    return S.weeks.slice();
  };
  var renderWeeks = function () {
    weekSel.textContent = '';
    S.weeks.forEach(function (w, i) { var o = el('option', '', 'أسبوع يبدأ ' + fDay.format(pdate(w.start))); o.value = String(i); weekSel.appendChild(o); });
    var w = curWeek();
    weekSel.disabled = !w; weekStart.disabled = !w; $('hc-week-del').disabled = !w;
    if (w) { weekSel.value = String(S.sel); weekStart.value = w.start; } else weekStart.value = '';
  };
  var renderGrid = function () {
    var body = $('hc-grid-body'), w = curWeek();
    body.textContent = '';
    var empty = !S.teams.length ? 'اكتب أسماء الفرق أولاً.' : !w ? 'أضف أسبوعاً لتسجيل نقاطه.' : '';
    $('hc-grid-empty').textContent = empty;
    $('hc-grid-empty').hidden = !empty;
    $('hc-grid-w').hidden = !!empty;
    if (empty) return;
    var heads = [].map.call($('hc-grid').querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    S.teams.forEach(function (team) {
      var tr = el('tr'), th = el('th', '', team); th.scope = 'row'; tr.appendChild(th);
      var a = w.pts[team] || [null, null, null, null];
      for (var c = 0; c < 4; c++) {
        var td = el('td'), inp = el('input', 'hc-pt');
        inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.autocomplete = 'off';
        inp.value = a[c] == null ? '' : String(a[c]);
        inp.dataset.team = team; inp.dataset.c = String(c);
        inp.setAttribute('aria-label', team + ' — ' + heads[c + 1]);
        td.appendChild(inp); tr.appendChild(td);
      }
      var tot = el('td', 'hc-sum', String(sum(a))); tot.setAttribute('aria-label', 'المجموع: ' + sum(a));
      tr.appendChild(tot);
      body.appendChild(tr);
    });
  };
  var renderTotals = function () {
    [].forEach.call(box.querySelectorAll('.hc-seg [data-view]'), function (b) { b.setAttribute('aria-pressed', b.dataset.view === S.view ? 'true' : 'false'); });
    var ws = periodWeeks(), w = curWeek(), body = $('hc-tot-body'), per = $('hc-period');
    body.textContent = '';
    if (!w || !S.teams.length) { per.textContent = !S.teams.length ? '' : 'لا أسابيع مسجلة بعد.'; $('hc-tot-w').hidden = true; return; }
    $('hc-tot-w').hidden = false;
    var label = S.view === 'week' ? 'الأسبوع الذي يبدأ ' + fDay.format(pdate(w.start))
      : S.view === 'month' ? 'شهر ' + fMonth.format(pdate(w.start)) + ' (عدد الأسابيع: ' + ws.length + ')'
        : 'الموسم كله (عدد الأسابيع: ' + ws.length + ')';
    var rows = S.teams.map(function (team) {
      var parts = [0, 0, 0, 0];
      ws.forEach(function (x) { var a = x.pts[team]; if (a) for (var c = 0; c < 4; c++) parts[c] += a[c] || 0; });
      return { team: team, parts: parts, total: sum(parts) };
    });
    rows.sort(function (a, b) { return b.total - a.total; });
    var max = rows.length ? rows[0].total : 0;
    var count = {};
    rows.forEach(function (r) { count[r.total] = (count[r.total] || 0) + 1; });
    var tops = rows.filter(function (r) { return max > 0 && r.total === max; }).map(function (r) { return r.team; });
    per.textContent = label + (max > 0 ? ' — الأعلى نقاطاً: ' + tops.join('، ') + (tops.length > 1 ? ' (تساوٍ)' : '') : ' — لا نقاط بعد');
    rows.forEach(function (r) {
      var tr = el('tr'), th = el('th', '', r.team); th.scope = 'row'; tr.appendChild(th);
      r.parts.forEach(function (v) { tr.appendChild(el('td', '', String(v))); });
      tr.appendChild(el('td', 'hc-sum', String(r.total)));
      var note = el('td', 'hc-marks');
      if (max > 0 && r.total === max) { note.appendChild(el('span', 'hc-mark hc-mtop', 'الأعلى نقاطاً في هذه الفترة')); tr.className = 'hc-top-row'; }
      if (r.total > 0 && count[r.total] > 1) note.appendChild(el('span', 'hc-mark hc-tie', 'تساوٍ'));
      tr.appendChild(note);
      body.appendChild(tr);
    });
  };
  var renderLeague = function () { renderWeeks(); renderGrid(); renderTotals(); };
  teamsIn.addEventListener('input', function () { S.teams = clean(teamsIn.value.split(/\r?\n/)); save(); renderGrid(); renderTotals(); });
  teamsIn.addEventListener('blur', function () { teamsIn.value = S.teams.join('\n'); });
  $('hc-grid-body').addEventListener('input', function (e) {
    var inp = e.target.closest('input.hc-pt'), w = curWeek();
    if (!inp || !w) return;
    var v = toInt(inp.value), team = inp.dataset.team, c = +inp.dataset.c;
    var a = w.pts[team] || [null, null, null, null];
    a[c] = isFinite(v) && v >= 0 ? v : null;
    if (inp.value !== '' && !(isFinite(v) && v >= 0)) inp.value = '';
    else if (isFinite(v) && inp.value !== String(v)) inp.value = String(v);
    w.pts[team] = a;
    save();
    var tot = inp.closest('tr').querySelector('.hc-sum');
    tot.textContent = String(sum(a)); tot.setAttribute('aria-label', 'المجموع: ' + sum(a));
    renderTotals();
  });
  var sortWeeks = function (keep) {
    S.weeks.sort(function (p, q) { return p.start < q.start ? -1 : p.start > q.start ? 1 : 0; });
    S.sel = Math.max(0, S.weeks.indexOf(keep));
  };
  $('hc-week-add').addEventListener('click', function () {
    var last = S.weeks[S.weeks.length - 1];
    var d = last ? pdate(last.start) : now();
    if (last) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    var k = dkey(d);
    while (S.weeks.some(function (x) { return x.start === k; })) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7); k = dkey(d); }
    var w = { start: k, pts: dict() };
    S.weeks.push(w); sortWeeks(w);
    save(); renderLeague();
    msg('أُضيف أسبوع يبدأ ' + fDay.format(d) + '.');
  });
  $('hc-week-del').addEventListener('click', function () {
    var w = curWeek();
    if (!w) return;
    var has = Object.keys(w.pts).some(function (k) { return sum(w.pts[k]) > 0; });
    if (has && !window.confirm('تحذف هذا الأسبوع ونقاطه من هذا المتصفح. هل تتابع؟')) return;
    S.weeks.splice(S.sel, 1);
    S.sel = Math.max(0, Math.min(S.sel, S.weeks.length - 1));
    save(); renderLeague();
    msg('حُذف الأسبوع.');
  });
  weekSel.addEventListener('change', function () { S.sel = +weekSel.value; save(); renderLeague(); });
  weekStart.addEventListener('change', function () {
    var w = curWeek(), d = pdate(weekStart.value);
    if (!w || !d) { renderWeeks(); return; }
    if (S.weeks.some(function (x) { return x !== w && x.start === weekStart.value; })) { msg('يوجد أسبوع يبدأ في هذا التاريخ.'); renderWeeks(); return; }
    w.start = weekStart.value; sortWeeks(w);
    save(); renderLeague();
  });
  [].forEach.call(box.querySelectorAll('.hc-seg [data-view]'), function (b) {
    b.addEventListener('click', function () { S.view = b.dataset.view; save(); renderTotals(); });
  });

  /* ---------------- print ---------------- */
  var printOnly = function (cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  };
  $('hc-print-rot').addEventListener('click', function () { printOnly('print-halaqa-rot'); });
  $('hc-print-league').addEventListener('click', function () { printOnly('print-halaqa-league'); });

  /* ---------------- file copy, clear ---------------- */
  $('hc-export').addEventListener('click', function () {
    try {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'halaqa-council-' + dkey(now()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      msg('جُهّز الملف للحفظ على جهازك.');
    } catch (e) { msg('تعذّر تجهيز الملف في هذا المتصفح.'); }
  });
  var file = $('hc-file');
  $('hc-import').addEventListener('click', function () { file.value = ''; file.click(); });
  var importText = function (txt) {
    var v = null;
    try { v = validate(JSON.parse(txt)); } catch (e) { v = null; }
    if (!v) { msg('الملف لا يطابق صيغة هذه الأداة؛ لم يتغيّر شيء.'); return false; }
    S = v; save(); renderAll();
    msg('فُتحت النسخة من الملف.');
    return true;
  };
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { importText(String(r.result || '')); };
    r.onerror = function () { msg('تعذّرت قراءة الملف؛ لم يتغيّر شيء.'); };
    r.readAsText(f);
  });
  var reset = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* memory is cleared below */ }
    S = blank(); renderAll();
  };
  $('hc-clear').addEventListener('click', function () {
    if (!window.confirm('تمسح أسماء الجدول والفرق والنقاط من هذا المتصفح. هل تتابع؟')) return;
    reset(); msg('مُسحت البيانات.');
  });

  var renderAll = function () {
    names.value = S.names.join('\n'); teamsIn.value = S.teams.join('\n');
    fillYears(); renderRot(); renderLeague();
  };

  /* ---------------- boot ---------------- */
  load(); notice();
  [].forEach.call(box.querySelectorAll('.hc-tool, .hc-foot, .hc-tabs'), function (x) { x.hidden = false; });
  box.classList.add('hc-on');
  select(tabs[0], false);
  renderAll();

  window.YanabeeHalaqa = {
    get state() { return S; },
    plan: plan, validate: validate, importText: importText, reset: reset,
    storeOk: function () { return storeOk; }
  };
})();
