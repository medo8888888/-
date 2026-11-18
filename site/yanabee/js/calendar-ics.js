// calendar-ics — «أضف مواعيد المسابقة إلى تقويمك» (competition.html, #c-timeline).
// Makes an iCalendar (.ics) file in the browser from the dates the build put in #ics-data (competition.txt
// c-timeline and c-terms). All-day events, stable UIDs (a re-import updates them), CRLF, folded at 75 octets.
// Classic script; nothing is sent anywhere. The visitor's choices stay in this browser
// (localStorage 'yanabee-calendar-ics-v1'); the block works when storage is blocked.
(function () {
  'use strict';
  var root = document.querySelector('[data-ics]');
  var dataEl = document.getElementById('ics-data');
  if (!root || !dataEl) return;
  var D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var KEY = 'yanabee-calendar-ics-v1';
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var boxes = $$('.ics-cb');
  var wdSel = $('[data-ics-wd]');
  var status = $('[data-ics-status]');
  var dl = $('[data-ics-dl]');
  var fb = $('[data-ics-fb]');
  var area = $('#ics-text');
  var wkRow = $('[data-ics-wkrow]');
  var wkHint = $('[data-ics-wkhint]');
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']; // UI chrome, getDay() order
  var lastText = ''; // the file as built (a textarea would turn CRLF into LF)
  var byUid = {};
  D.events.forEach(function (ev) { byUid[ev.uid] = ev; });

  // ---------- storage (every access guarded) ----------
  function load() {
    try {
      var s = window.localStorage.getItem(KEY);
      var o = s ? JSON.parse(s) : null;
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function save() {
    var st = { unchecked: [], keep: [], weekday: wdSel.value === '' ? null : Number(wdSel.value) };
    boxes.forEach(function (b) {
      if (isPast(b)) { if (b.checked) st.keep.push(b.value); } else if (!b.checked) st.unchecked.push(b.value);
    });
    try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked: keep working */ }
  }

  // ---------- dates ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayIso() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
  var TODAY = todayIso();
  function isPast(b) { return b.dataset.last < TODAY; } // ended before today (local date)
  function ymd(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()); }
  function utcDay(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function firstWeekday(wd) { // first such weekday on or after the competition start
    var d = utcDay(D.weekly.from);
    while (d.getUTCDay() !== wd) d = new Date(d.getTime() + 864e5);
    return d;
  }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

  // ---------- iCalendar text ----------
  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function octets(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function fold(line) { // at most 75 octets per physical line; never split a character; continuation starts with a space
    var out = [], cur = '', used = 0;
    Array.from(line).forEach(function (ch) {
      var n = octets(ch);
      if (used + n > 75) { out.push(cur); cur = ' '; used = 1; }
      cur += ch; used += n;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  function vevent(o, ts) {
    var l = ['BEGIN:VEVENT', 'UID:' + o.uid, 'DTSTAMP:' + ts, 'DTSTART;VALUE=DATE:' + o.start, 'DTEND;VALUE=DATE:' + o.end];
    if (o.rrule) l.push('RRULE:' + o.rrule);
    l.push('SUMMARY:' + esc(o.summary), 'DESCRIPTION:' + esc(o.description), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    return l;
  }
  function weekly() {
    if (wdSel.value === '') return null;
    var first = firstWeekday(Number(wdSel.value));
    return { uid: D.weekly.uid, start: ymd(first), end: ymd(new Date(first.getTime() + 864e5)),
      rrule: 'FREQ=WEEKLY;UNTIL=' + D.weekly.until, summary: D.weekly.summary, description: D.weekly.description };
  }
  function chosen() { return boxes.filter(function (b) { return b.checked; }).map(function (b) { return byUid[b.value]; }); }
  function build() {
    var ts = stamp();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yanabee//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    chosen().forEach(function (ev) { lines = lines.concat(vevent(ev, ts)); });
    var w = weekly();
    if (w) lines = lines.concat(vevent(w, ts));
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // ---------- view ----------
  function count(n) {
    if (n === 0) return 'لم تحدّد أي موعد بعد.';
    if (n === 1) return 'سيضم الملف موعدًا واحدًا.';
    if (n === 2) return 'سيضم الملف موعدين.';
    return 'سيضم الملف ' + n + (n <= 10 ? ' مواعيد.' : ' موعدًا.');
  }
  function sync() {
    var n = chosen().length, w = weekly();
    var total = n + (w ? 1 : 0);
    status.textContent = count(total);
    dl.disabled = total === 0;
    $('[data-ics-print]').disabled = total === 0;
    boxes.forEach(function (b) { b.closest('.ics-ev').classList.toggle('is-off', !b.checked); });
    wkRow.hidden = !w;
    wkHint.hidden = !w;
    if (w) {
      var f = firstWeekday(Number(wdSel.value));
      var name = DAYS[f.getUTCDay()];
      $('[data-ics-wkday]').textContent = 'كل يوم ' + name;
      wkHint.textContent = 'أول لقاء في الملف: ' + name + ' ' + f.getUTCDate() + ' ' + (D.months[String(f.getUTCMonth() + 1)] || '') + ' '
        + f.getUTCFullYear() + '، ثم كل أسبوع حتى ' + D.weekly.untilText + '.';
    }
    if (!fb.hidden) { lastText = build(); area.value = lastText; }
  }

  // ---------- initial state ----------
  var st = load() || {};
  var unchecked = Array.isArray(st.unchecked) ? st.unchecked : [];
  var keep = Array.isArray(st.keep) ? st.keep : [];
  boxes.forEach(function (b) {
    var past = isPast(b);
    b.checked = past ? keep.indexOf(b.value) >= 0 : unchecked.indexOf(b.value) < 0;
    var tag = b.closest('.ics-row').querySelector('.ics-past');
    if (tag) tag.hidden = !past;
    b.closest('.ics-ev').classList.toggle('is-past', past);
  });
  if (typeof st.weekday === 'number' && st.weekday >= 0 && st.weekday <= 6) wdSel.value = String(st.weekday);
  root.hidden = false;
  sync();

  // ---------- events ----------
  boxes.forEach(function (b) { b.addEventListener('change', function () { sync(); save(); }); });
  wdSel.addEventListener('change', function () { sync(); save(); });
  $('[data-ics-all]').addEventListener('click', function () { boxes.forEach(function (b) { b.checked = true; }); sync(); save(); });
  $('[data-ics-none]').addEventListener('click', function () { boxes.forEach(function (b) { b.checked = false; }); sync(); save(); });

  dl.addEventListener('click', function () {
    var text = build();
    try {
      var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = u; a.download = D.file; a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      status.textContent = 'جُهّز الملف ' + D.file + '. افتحه ليضيف المواعيد إلى تقويمك.';
    } catch (e) {
      status.textContent = 'تعذّر تنزيل الملف هنا؛ استعمل النص أدناه.';
      fb.open = true;
    }
    lastText = text;
    area.value = text;
    fb.hidden = false; // the fallback is offered after every download attempt (closed unless the download failed)
  });

  $('[data-ics-copy]').addEventListener('click', function () {
    var out = $('[data-ics-copied]');
    var text = lastText || build();
    var done = function (ok) {
      out.textContent = ok ? 'نُسخ النص.' : 'لم يُنسخ تلقائيًا؛ النص محدَّد، انسخه يدويًا.';
      if (!ok) { area.focus(); area.select(); }
    };
    var legacy = function () {
      var ok = false;
      try { area.focus(); area.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      done(ok);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
      else legacy();
    } catch (e) { legacy(); }
  });

  $('[data-ics-print]').addEventListener('click', function () {
    var cls = 'print-ics';
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  });
})();
