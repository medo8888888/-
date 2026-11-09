// quran.html #student-week — «دفتري: حفظ، فهم، تطبيق»: a student's own notebook for the initiative's routine
// (daily pace 1–3 ayahs, understanding notes, the weekly practical-application form). Built by
// tools/yanabee/feat_student_week.py; the only numbers used are the paces in #sw-data (from the document).
// Everything stays in this browser (localStorage 'yanabee-student-week-v1', every access guarded); nothing is sent.
// Classic script, no modules, no libraries: works from file://. Test hook: window.YanabeeStudentWeek.
(function () {
  'use strict';
  var box = document.getElementById('student-week');
  if (!box) return;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'yanabee-student-week-v1';
  var cfg = { paces: [1, 2, 3] };
  try { cfg = JSON.parse($('sw-data').textContent) || cfg; } catch (e) { /* keep defaults */ }

  /* ---------------- dates (local, never UTC) ---------------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var key = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var today = function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  var fmt = function (o) {
    try { return new Intl.DateTimeFormat('ar-u-nu-latn', o); } catch (e) { return { format: function (d) { return key(d); } }; }
  };
  var fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fDay = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
  var fMonth = fmt({ month: 'long', year: 'numeric' });
  var fWd = fmt({ weekday: 'short' });

  /* ---------------- storage (guarded: the notebook works for the session without it) ---------------- */
  var blank = function () { return { pace: null, total: null, days: {}, fahm: [], weeks: {}, name: '' }; };
  var S = blank();
  var storeOk = true;
  var notice = function () { var n = $('sw-store'); if (n) n.hidden = storeOk; };
  var load = function () {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      var b = blank();
      b.pace = cfg.paces.indexOf(o.pace) >= 0 ? o.pace : null;
      b.total = typeof o.total === 'number' && o.total >= 1 ? Math.floor(o.total) : null;
      if (o.days && typeof o.days === 'object') Object.keys(o.days).forEach(function (k) { var v = o.days[k]; if (parse(k) && (v === 1 || v === 2 || v === 3)) b.days[k] = v; });
      if (Array.isArray(o.fahm)) b.fahm = o.fahm.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
        return { id: String(x.id || Math.random()), ayat: String(x.ayat || ''), value: String(x.value || ''), date: parse(x.date) ? x.date : '' };
      });
      if (o.weeks && typeof o.weeks === 'object') Object.keys(o.weeks).forEach(function (k) {
        var w = o.weeks[k];
        if (parse(k) && w && typeof w === 'object') b.weeks[k] = { name: String(w.name || ''), value: String(w.value || ''), task: String(w.task || ''), report: String(w.report || '') };
      });
      b.name = typeof o.name === 'string' ? o.name : '';
      S = b;
    } catch (e) { storeOk = false; }
  };
  var save = function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(S)); storeOk = true; } catch (e) { storeOk = false; }
    notice();
  };

  /* ---------------- tabs (RTL arrows; without JS the three panels stay stacked) ---------------- */
  var tablist = box.querySelector('.sw-tabs');
  var tabs = [].slice.call(box.querySelectorAll('[role=tab]'));
  var select = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var p = $(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
    // keep the chosen tab visible inside the sideways-scrolling tab row only; never scroll the page
    // (scrollIntoView here made quran.html jump to #a4 on load)
    if (tablist.scrollWidth > tablist.clientWidth) {
      var tr = tab.getBoundingClientRect(), lr = tablist.getBoundingClientRect();
      if (tr.left < lr.left) tablist.scrollLeft -= lr.left - tr.left;
      else if (tr.right > lr.right) tablist.scrollLeft += tr.right - lr.right;
    }
  };
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t, false); });
    t.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowLeft') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowRight') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); select(tabs[j], true); }
    });
  });

  /* ---------------- hifz: pace, days needed, calendar ---------------- */
  var paceInputs = [].slice.call(box.querySelectorAll('input[name=sw-pace]'));
  var total = $('sw-total');
  // the count field is type=text inputmode=numeric so Arabic-Indic digits (٠-٩, ۰-۹) are accepted and read as 0-9
  var latin = function (s) {
    return String(s).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); }).trim();
  };
  var renderDays = function () {
    var out = $('sw-days');
    var n = S.total, p = S.pace;
    if (p && n) out.textContent = 'عدد الأيام بهذا المقدار: ' + Math.ceil(n / p);
    else if (!n && total.value.trim()) out.textContent = 'اكتب عدد آيات المقطع بالأرقام.';
    else if (!p && !n) out.textContent = 'اختر مقدارك اليومي واكتب عدد آيات المقطع.';
    else if (!p) out.textContent = 'اختر مقدارك اليومي.';
    else out.textContent = 'اكتب عدد آيات المقطع.';
  };
  paceInputs.forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) { S.pace = +r.value; save(); renderDays(); } });
  });
  total.addEventListener('input', function () {
    var s = latin(total.value);
    if (/^\d+$/.test(s) && s !== total.value) total.value = s;
    var v = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
    S.total = isFinite(v) && v >= 1 ? v : null;
    save(); renderDays();
  });

  var view = today(); view.setDate(1);           // first day of the month shown
  var sel = today();                             // the selected day
  var WEEK_START = 6;                            // the grid starts on Saturday (layout only; counts use a rolling 7 days)
  var grid = $('sw-grid');
  var STATE_TXT = ['لم أسجّل', 'حفظت', 'راجعت', 'حفظت وراجعت'];
  (function weekdays() {
    var wd = $('sw-wd'), base = new Date(2024, 0, 6);  // a Saturday
    var html = '';
    for (var i = 0; i < 7; i++) html += '<span>' + fWd.format(addDays(base, i)) + '</span>';
    wd.innerHTML = html;
  })();
  var renderCal = function (focusSel) {
    var t0 = today(), y = view.getFullYear(), m = view.getMonth();
    $('sw-month').textContent = fMonth.format(view);
    var lead = (view.getDay() - WEEK_START + 7) % 7;
    var dim = new Date(y, m + 1, 0).getDate();
    grid.textContent = '';
    for (var i = 0; i < lead; i++) { var s = document.createElement('span'); s.className = 'sw-pad'; s.setAttribute('aria-hidden', 'true'); grid.appendChild(s); }
    for (var d = 1; d <= dim; d++) {
      var day = new Date(y, m, d), k = key(day), v = S.days[k] || 0;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw-day' + (v & 1 ? ' h' : '') + (v & 2 ? ' r' : '');
      b.dataset.day = k;
      var isToday = day.getTime() === t0.getTime(), isSel = day.getTime() === sel.getTime();
      if (isToday) { b.classList.add('today'); b.setAttribute('aria-current', 'date'); }
      if (isSel) b.classList.add('sel');
      if (day > t0) b.disabled = true;
      b.tabIndex = isSel ? 0 : -1;
      b.setAttribute('aria-label', fLong.format(day) + ': ' + (day > t0 ? 'لم يأتِ بعد' : STATE_TXT[v]) + (isSel ? '، محدد' : ''));
      b.innerHTML = '<span class="n">' + d + '</span><span class="dots" aria-hidden="true"><i class="sw-dot d-h"></i><i class="sw-dot d-r"></i></span>';
      grid.appendChild(b);
    }
    // keyboard focus lands on the selected day; if it is not in this month, on the first enabled day
    if (!grid.querySelector('.sw-day[tabindex="0"]')) {
      var first = grid.querySelector('.sw-day:not([disabled])');
      if (first) first.tabIndex = 0;
    }
    var cur = new Date(t0.getFullYear(), t0.getMonth(), 1);
    $('sw-next-m').disabled = view >= cur;
    if (focusSel) { var f = grid.querySelector('.sw-day.sel'); if (f) f.focus(); }
  };
  var renderDay = function () {
    var k = key(sel), v = S.days[k] || 0;
    $('sw-day-l').textContent = 'اليوم المحدد: ' + fLong.format(sel);
    $('sw-did-h').checked = !!(v & 1);
    $('sw-did-r').checked = !!(v & 2);
  };
  var renderLast7 = function () {
    var t0 = today(), x = 0;
    for (var i = 0; i < 7; i++) if ((S.days[key(addDays(t0, -i))] || 0) & 1) x++;
    $('sw-last7').textContent = 'آخر 7 أيام: حفظت في ' + x + ' من 7';
  };
  var pick = function (d, focus) {
    if (d > today()) return;
    sel = d;
    if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) view = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCal(focus); renderDay();
  };
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.sw-day');
    if (!b || b.disabled) return;
    pick(parse(b.dataset.day), true);
  });
  grid.addEventListener('keydown', function (e) {
    var b = e.target.closest('.sw-day');
    if (!b) return;
    var d = parse(b.dataset.day), n = null;
    if (e.key === 'ArrowLeft') n = addDays(d, 1);       // RTL: left is forward
    else if (e.key === 'ArrowRight') n = addDays(d, -1);
    else if (e.key === 'ArrowDown') n = addDays(d, 7);
    else if (e.key === 'ArrowUp') n = addDays(d, -7);
    else if (e.key === 'Home') n = new Date(d.getFullYear(), d.getMonth(), 1);
    else if (e.key === 'End') n = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (!n) return;
    e.preventDefault();
    if (n > today()) n = today();
    pick(n, true);
  });
  $('sw-prev-m').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(false); });
  $('sw-next-m').addEventListener('click', function () {
    var n = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    if (n > today()) return;
    view = n; renderCal(false);
  });
  var setBits = function () {
    var v = ($('sw-did-h').checked ? 1 : 0) | ($('sw-did-r').checked ? 2 : 0), k = key(sel);
    if (v) S.days[k] = v; else delete S.days[k];
    save(); renderCal(false); renderLast7();
  };
  $('sw-did-h').addEventListener('change', setBits);
  $('sw-did-r').addEventListener('change', setBits);

  /* ---------------- fahm: understanding notes ---------------- */
  var fahmList = $('sw-fahm-list');
  var renderFahm = function () {
    fahmList.textContent = '';
    var list = S.fahm.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    list.forEach(function (x) {
      var li = document.createElement('li');
      li.className = 'sw-item';
      var head = document.createElement('div'); head.className = 'sw-item-h';
      var b = document.createElement('b'); b.textContent = x.ayat || '—';
      var s = document.createElement('small'); var d = parse(x.date); s.textContent = d ? fDay.format(d) : '';
      head.appendChild(b); head.appendChild(s);
      var p = document.createElement('p'); p.textContent = x.value;
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'sw-btn sw-mini'; del.textContent = 'احذف';
      del.setAttribute('aria-label', 'احذف: ' + (x.ayat || x.value).slice(0, 40));
      del.addEventListener('click', function () {
        S.fahm = S.fahm.filter(function (y) { return y.id !== x.id; });
        save(); renderFahm();
        $('sw-fahm-msg').textContent = 'حُذف.';
        $('sw-f-ayat').focus();
      });
      li.appendChild(head); li.appendChild(p); li.appendChild(del);
      fahmList.appendChild(li);
    });
    $('sw-fahm-empty').hidden = S.fahm.length > 0;
  };
  $('sw-f-date').value = key(today());
  $('sw-fahm-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ayat = $('sw-f-ayat').value.trim(), value = $('sw-f-value').value.trim();
    var date = parse($('sw-f-date').value) ? $('sw-f-date').value : key(today());
    if (!ayat && !value) { $('sw-fahm-msg').textContent = 'اكتب الآيات أو القيمة أولاً.'; $('sw-f-ayat').focus(); return; }
    S.fahm.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ayat: ayat, value: value, date: date });
    save(); renderFahm();
    $('sw-f-ayat').value = ''; $('sw-f-value').value = ''; $('sw-f-date').value = key(today());
    $('sw-fahm-msg').textContent = 'أُضيف.';
  });

  /* ---------------- tatbeeq: the weekly form ---------------- */
  var wStart = $('sw-w-start');
  var F = { name: $('sw-w-name'), value: $('sw-w-value'), task: $('sw-w-task'), report: $('sw-w-report') };
  var weekKey = function () { return parse(wStart.value) ? wStart.value : key(today()); };
  var rangeTxt = function (k) { var d = parse(k); return 'من ' + fDay.format(d) + ' إلى ' + fDay.format(addDays(d, 6)); };
  var fillWeek = function () {
    var k = weekKey(), w = S.weeks[k];
    $('sw-w-range').textContent = rangeTxt(k) + (w ? ' — محفوظ' : '');
    F.name.value = w ? w.name : (S.name || '');
    F.value.value = w ? w.value : '';
    F.task.value = w ? w.task : '';
    F.report.value = w ? w.report : '';
  };
  var shift = function (n) { wStart.value = key(addDays(parse(weekKey()), n)); fillWeek(); $('sw-week-msg').textContent = ''; };
  wStart.value = key(today());
  wStart.addEventListener('change', function () { if (!parse(wStart.value)) wStart.value = key(today()); fillWeek(); $('sw-week-msg').textContent = ''; });
  $('sw-w-prev').addEventListener('click', function () { shift(-7); });
  $('sw-w-next').addEventListener('click', function () { shift(7); });
  var weeksList = $('sw-weeks');
  var renderWeeks = function () {
    weeksList.textContent = '';
    var ks = Object.keys(S.weeks).sort().reverse();
    ks.forEach(function (k) {
      var w = S.weeks[k];
      var li = document.createElement('li'); li.className = 'sw-item';
      var head = document.createElement('div'); head.className = 'sw-item-h';
      var b = document.createElement('b'); b.textContent = rangeTxt(k);
      var s = document.createElement('small'); s.textContent = w.value;
      head.appendChild(b); head.appendChild(s);
      var acts = document.createElement('div'); acts.className = 'sw-item-a';
      var open = document.createElement('button'); open.type = 'button'; open.className = 'sw-btn sw-mini'; open.textContent = 'افتح';
      open.setAttribute('aria-label', 'افتح أسبوع ' + rangeTxt(k));
      open.addEventListener('click', function () { wStart.value = k; fillWeek(); $('sw-week-msg').textContent = ''; F.value.focus(); });
      var del = document.createElement('button'); del.type = 'button'; del.className = 'sw-btn sw-mini'; del.textContent = 'احذف';
      del.setAttribute('aria-label', 'احذف أسبوع ' + rangeTxt(k));
      del.addEventListener('click', function () {
        delete S.weeks[k]; save(); renderWeeks();
        if (weekKey() === k) fillWeek();
        $('sw-week-msg').textContent = 'حُذف الأسبوع.';
      });
      acts.appendChild(open); acts.appendChild(del);
      li.appendChild(head); li.appendChild(acts);
      weeksList.appendChild(li);
    });
    $('sw-weeks-empty').hidden = ks.length > 0;
  };
  $('sw-week-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = weekKey();
    var w = { name: F.name.value.trim(), value: F.value.value.trim(), task: F.task.value.trim(), report: F.report.value.trim() };
    if (!w.value && !w.task && !w.report) { $('sw-week-msg').textContent = 'اكتب القيمة أو المهمة أو التقرير أولاً.'; F.value.focus(); return; }
    S.weeks[k] = w; S.name = w.name;
    save(); renderWeeks();
    $('sw-w-range').textContent = rangeTxt(k) + ' — محفوظ';
    $('sw-week-msg').textContent = storeOk ? 'حُفظ هذا الأسبوع في متصفحك.' : 'حُفظ لهذه الجلسة فقط.';
  });

  /* ---------------- print: only the A5 form ---------------- */
  var printOnly = function (cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  };
  $('sw-print-btn').addEventListener('click', function () {
    var sheet = $('sw-print');
    var put = function (f, v) { var el = sheet.querySelector('[data-f="' + f + '"]'); if (el) el.textContent = v; };
    put('name', F.name.value.trim()); put('range', rangeTxt(weekKey())); put('value', F.value.value.trim());
    put('task', F.task.value.trim()); put('report', F.report.value.trim());
    printOnly('print-student-week');
  });

  /* ---------------- clear ---------------- */
  var renderAll = function () {
    paceInputs.forEach(function (r) { r.checked = +r.value === S.pace; });
    total.value = S.total || '';
    renderDays(); renderCal(false); renderDay(); renderLast7(); renderFahm(); fillWeek(); renderWeeks();
  };
  var reset = function () {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* storage unavailable: memory is cleared below */ }
    S = blank();
    sel = today(); view = today(); view.setDate(1);
    wStart.value = key(today());
    ['sw-fahm-msg', 'sw-week-msg'].forEach(function (id) { $(id).textContent = ''; });
    renderAll();
  };
  $('sw-clear').addEventListener('click', function () {
    if (!window.confirm('تمسح كل ما سجّلته في هذا الدفتر من هذا المتصفح. هل تتابع؟')) return;
    reset();
    $('sw-week-msg').textContent = 'مُسحت بياناتك.';
  });

  /* ---------------- boot ---------------- */
  load();
  notice();
  [].forEach.call(box.querySelectorAll('.sw-tool, .sw-foot'), function (el) { el.hidden = false; });
  tablist.hidden = false;
  box.classList.add('sw-on');
  select(tabs[0], false);
  renderAll();

  window.YanabeeStudentWeek = {
    get state() { return S; },
    reset: reset,
    storeOk: function () { return storeOk; }
  };
})();
