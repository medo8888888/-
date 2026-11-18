// meeting-timer — «مؤقّت اللقاء» on method.html (markup: tools/yanabee/feat_meeting_timer.py).
// Agendas come from <script type="application/json" id="mt-data"> (the documents' tables, verbatim).
// Wall-clock engine: a segment's elapsed time = now − segStart − pausedTotal, so tab sleep or throttling cannot drift it.
// State is kept in this browser only (localStorage 'yanabee-meeting-timer-v1', every access in try/catch). Sends nothing.
(function () {
  'use strict';
  var root = document.querySelector('[data-mt]');
  var dataEl = document.getElementById('mt-data');
  if (!root || !dataEl) return;
  var AG;
  try { AG = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!AG || !AG.length) return;

  var KEY = 'yanabee-meeting-timer-v1';
  var store = {
    get: function () { try { var v = localStorage.getItem(KEY); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  };

  var $ = function (s) { return root.querySelector(s); };
  var el = {
    agenda: $('[data-mt-agenda]'), src: $('[data-mt-src]'), run: $('[data-mt-run]'), stage: $('[data-mt-stage]'),
    ring: $('[data-mt-ring]'), pos: $('[data-mt-pos]'), time: $('[data-mt-time]'), over: $('[data-mt-over]'),
    name: $('[data-mt-name]'), goal: $('[data-mt-goal]'), next: $('[data-mt-next]'), elapsed: $('[data-mt-elapsed]'),
    start: $('[data-mt-start]'), pause: $('[data-mt-pause]'), pauseL: $('[data-mt-pause-l]'), prev: $('[data-mt-prev]'),
    nextBtn: $('[data-mt-next-btn]'), add: $('[data-mt-add]'), end: $('[data-mt-end]'), fs: $('[data-mt-fs]'), fsL: $('[data-mt-fs-l]'),
    list: $('[data-mt-list]'), sum: $('[data-mt-sum]'), sumMeta: $('[data-mt-sum-meta]'), sumHead: $('[data-mt-sum-head]'),
    sumBody: $('[data-mt-sum-body]'), sumFoot: $('[data-mt-sum-foot]'), print: $('[data-mt-print]'), fresh: $('[data-mt-new]'),
    live: $('[data-mt-live]'), vibWrap: $('[data-mt-vib-wrap]'), opts: root.querySelectorAll('[data-mt-opt]')
  };
  var byId = {};
  AG.forEach(function (a) { byId[a.id] = a; });
  var now = function () { return Date.now(); };
  var MIN = 60000;

  // ---------------------------------------------------------------- state ---
  var S;
  function blank(id, opts) {
    var a = byId[id] || AG[0];
    return {
      v: 1, agenda: a.id, idx: 0, started: false, done: false, meetStart: null, segStart: null, pausedAt: null, pausedTotal: 0,
      added: a.blocks.map(function () { return 0; }), actual: a.blocks.map(function () { return 0; }),
      rang: a.blocks.map(function () { return false; }), endAt: null,
      opts: opts || { auto: false, tone: false, vib: false }
    };
  }
  // a saved state is used only if every field the engine reads is sound (a damaged one starts fresh, never NaN or a crash)
  function valid(s) {
    if (!s || typeof s !== 'object' || !byId[s.agenda]) return false;
    var n = byId[s.agenda].blocks.length;
    var fin = function (x) { return typeof x === 'number' && isFinite(x) && x >= 0; };
    var nums = function (a) { return Array.isArray(a) && a.length === n && a.every(fin); };
    var opt = function (x) { return x == null || fin(x); };
    if (!nums(s.added) || !nums(s.actual) || !s.opts || typeof s.opts !== 'object') return false;
    if (!(typeof s.idx === 'number' && s.idx % 1 === 0 && s.idx >= 0 && s.idx < n)) return false;
    if (s.rang != null && !Array.isArray(s.rang)) return false;
    if (s.started && !s.done && !(fin(s.segStart) && fin(s.pausedTotal) && opt(s.pausedAt))) return false;
    return opt(s.meetStart) && opt(s.endAt);
  }
  var ag = function () { return byId[S.agenda]; };
  var blk = function (i) { return ag().blocks[i == null ? S.idx : i]; };
  var dur = function (i) { i = i == null ? S.idx : i; return (blk(i).min + (S.added[i] || 0)) * MIN; };
  var running = function () { return S.started && !S.done && S.pausedAt == null; };
  function elapsed() {
    if (!S.started) return 0;
    if (S.done) return S.actual[S.idx];
    var t = (S.pausedAt != null ? S.pausedAt : now()) - S.segStart - S.pausedTotal;
    return Math.max(0, t);
  }
  var save = function () { store.set(S); };

  // ------------------------------------------------------------- helpers ---
  function mmss(ms) {
    var s = Math.floor(Math.abs(ms) / 1000), m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  // remaining time rounds up (a fresh 10-minute segment reads 10:00, not 09:59)
  function remainText(ms) { return mmss(Math.ceil(ms / 1000) * 1000); }
  var fmtMin = function (n) { return String(Math.round(n * 10) / 10); };
  function announce(msg) {
    if (!el.live) return;
    el.live.textContent = '';
    setTimeout(function () { el.live.textContent = msg; }, 30);
  }
  function plannedText(b) { return b.dur || (fmtMin(b.min) + ' د'); }

  // --------------------------------------------------------------- audio ---
  var actx = null;
  function primeAudio() {
    if (actx || !S.opts.tone) return;
    try { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } catch (e) { actx = null; }
  }
  function tone() {
    if (!S.opts.tone) return;
    try {
      primeAudio();
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime;
      o.type = 'sine'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + 0.32);
    } catch (e) { /* no audio */ }
  }
  var canVib = (function () { try { return typeof navigator.vibrate === 'function'; } catch (e) { return false; } })();
  function vib() { if (S.opts.vib && canVib) { try { navigator.vibrate(200); } catch (e) { /* ignore */ } } }

  // ----------------------------------------------------------- wake lock ---
  var lock = null;
  function wake(on) {
    if (!('wakeLock' in navigator)) return;
    if (on && !lock && document.visibilityState === 'visible') {
      try {
        navigator.wakeLock.request('screen').then(function (l) {
          lock = l;
          try { l.addEventListener('release', function () { if (lock === l) lock = null; }); } catch (e) { /* ignore */ }
        }, function () { lock = null; });
      } catch (e) { lock = null; }
    } else if (!on && lock) {
      try { lock.release(); } catch (e) { /* ignore */ }
      lock = null;
    }
  }

  // -------------------------------------------------------------- engine ---
  function enter(j, keepPaused) {
    var t = now();
    S.idx = j;
    S.segStart = t - (S.actual[j] || 0);
    S.pausedTotal = 0;
    S.pausedAt = keepPaused ? t : null;
  }
  function leave() { S.actual[S.idx] = elapsed(); if (S.actual[S.idx] >= dur()) S.rang[S.idx] = true; }
  function startMeeting() {
    primeAudio();
    S.started = true; S.done = false; S.meetStart = now();
    enter(0, false);
    save(); render(); loop();
    announce('بدأ اللقاء. الفقرة الحالية: ' + blk().name);
  }
  function togglePause() {
    if (!S.started || S.done) return;
    primeAudio();
    var t = now();
    if (S.pausedAt == null) { S.pausedAt = t; announce('أُوقف المؤقت'); } else { S.pausedTotal += t - S.pausedAt; S.pausedAt = null; announce('استُؤنف المؤقت'); }
    save(); render(); loop();
  }
  function go(j) {
    if (!S.started || S.done || j < 0 || j >= ag().blocks.length || j === S.idx) return;
    var paused = S.pausedAt != null;
    leave();
    enter(j, paused);
    save(); render();
    announce('الفقرة الحالية: ' + blk().name);
  }
  function addMinute() {
    if (!S.started || S.done) return;
    S.added[S.idx] = (S.added[S.idx] || 0) + 1;
    if (elapsed() < dur()) S.rang[S.idx] = false;
    save(); render();
    announce('أُضيفت دقيقة للفقرة الحالية');
  }
  function endMeeting() {
    if (!S.started || S.done) return;
    var last = S.idx === ag().blocks.length - 1;
    if (!last) {
      var ok = true;
      try { ok = window.confirm('لم تنتهِ كل الفقرات. أنهِ اللقاء الآن؟'); } catch (e) { ok = true; }
      if (!ok) return;
    }
    leave();
    S.done = true; S.pausedAt = null; S.endAt = now();
    save(); render();
    wake(false);
    announce('انتهى اللقاء. ملخص اللقاء جاهز.');
    try { el.sum.focus({ preventScroll: false }); } catch (e) { /* ignore */ }
  }
  function newMeeting() {
    var opts = S.opts;
    S = blank(el.agenda.value, opts);
    save(); render();
    try { el.start.focus(); } catch (e) { /* ignore */ }
  }
  // the clock: advance (option), mark segment end once, redraw
  function tick() {
    if (running()) {
      var n = ag().blocks.length, moved = false;
      // only a segment that runs out now moves on: one that had already ended (an overrun when the option was turned
      // on, or a finished segment the facilitator went back to) stays put, so no segment is marked as held when it was not
      while (S.opts.auto && S.idx < n - 1 && elapsed() >= dur() && !S.rang[S.idx]) {
        // the next segment begins exactly when this one ran out (wall clock), even after a tab sleep
        var endAt = S.segStart + S.pausedTotal + dur();
        S.actual[S.idx] = dur();
        if (!S.rang[S.idx]) { S.rang[S.idx] = true; tone(); vib(); }
        S.idx += 1;
        S.segStart = endAt - (S.actual[S.idx] || 0);
        S.pausedTotal = 0;
        moved = true;
      }
      if (moved) { save(); announce('الفقرة الحالية: ' + blk().name); }
      if (elapsed() >= dur() && !S.rang[S.idx]) {
        S.rang[S.idx] = true; save();
        tone(); vib();
        announce('انتهى وقت الفقرة: ' + blk().name);
      }
      if (moved) { render(); return; }
    }
    draw();
  }
  var timer = null;
  function loop() {
    var want = running() && document.visibilityState !== 'hidden';
    if (want && !timer) timer = setInterval(tick, 250);
    if (!want && timer) { clearInterval(timer); timer = null; }
    wake(running());
  }

  // ------------------------------------------------------------- drawing ---
  function draw() {
    var a = ag(), n = a.blocks.length, b = blk(), e = elapsed(), d = dur(), rem = d - e, over = S.started && rem <= 0;
    el.pos.textContent = 'الفقرة ' + (S.idx + 1) + ' من ' + n;
    el.time.textContent = over ? '+' + mmss(-rem) : remainText(S.started ? rem : d);
    el.time.classList.toggle('is-over', over);
    el.over.hidden = !over;
    root.classList.toggle('mt-is-over', over);
    var frac = S.started ? Math.min(1, e / d) : 0;
    el.ring.style.strokeDashoffset = String(100 - frac * 100);
    el.ring.classList.toggle('is-zero', frac <= 0);
    // the meeting so far: finished segments + the current one
    var spent = 0;
    for (var i = 0; i < n; i++) spent += i === S.idx ? e : (S.actual[i] || 0);
    var total = a.blocks.reduce(function (s, x) { return s + x.min; }, 0);
    var added = S.added.reduce(function (s, x) { return s + (x || 0); }, 0);
    el.elapsed.textContent = 'مضى ' + Math.floor(spent / MIN) + ' من ' + fmtMin(total) + (added ? ' + ' + added : '') + ' دقيقة';
    var lis = el.list.children;
    for (var k = 0; k < lis.length; k++) {
      var li = lis[k], act = li.querySelector('.mt-li-act');
      li.classList.toggle('is-now', k === S.idx && S.started && !S.done);
      li.classList.toggle('is-past', S.started && k < S.idx);
      if (k === S.idx && S.started && !S.done) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      var extra = S.added[k] ? ' (+' + S.added[k] + ')' : '';
      li.querySelector('.mt-li-plus').textContent = extra;
      var spentK = k === S.idx ? e : (S.actual[k] || 0);
      act.textContent = S.started && (k <= S.idx || spentK) ? mmss(spentK) : '';
    }
  }
  function render() {
    var a = ag(), b = blk(), n = a.blocks.length;
    el.agenda.value = a.id;
    el.src.textContent = a.source;
    el.name.textContent = b.name;
    el.goal.textContent = b.goal || b.note || '';
    el.goal.classList.toggle('is-note', !b.goal && !!b.note);
    var nx = a.blocks[S.idx + 1];
    el.next.textContent = nx ? 'التالي: ' + nx.name + ' (' + fmtMin(nx.min + (S.added[S.idx + 1] || 0)) + ' د)' : (n > 1 ? 'هذه آخر فقرة' : '');
    el.next.hidden = !el.next.textContent;
    // segment list
    if (el.list.getAttribute('data-for') !== a.id) {
      el.list.setAttribute('data-for', a.id);
      el.list.textContent = '';
      a.blocks.forEach(function (x) {
        var li = document.createElement('li');
        var nm = document.createElement('span'); nm.className = 'mt-li-name'; nm.textContent = x.name;
        var pl = document.createElement('span'); pl.className = 'mt-li-dur';
        var pd = document.createElement('span'); pd.textContent = plannedText(x);
        var plus = document.createElement('span'); plus.className = 'mt-li-plus';
        pl.appendChild(pd); pl.appendChild(plus);
        var ac = document.createElement('span'); ac.className = 'mt-li-act';
        li.appendChild(nm); li.appendChild(pl); li.appendChild(ac);
        el.list.appendChild(li);
      });
    }
    el.list.hidden = n < 2;
    // controls
    var st = S.started && !S.done;
    el.start.hidden = S.started;
    el.pause.hidden = !st;
    el.pauseL.textContent = S.pausedAt != null ? 'استأنف' : 'أوقف مؤقتًا';
    el.pause.setAttribute('aria-pressed', S.pausedAt != null ? 'true' : 'false');
    el.prev.disabled = !st || S.idx === 0;
    el.nextBtn.disabled = !st || S.idx >= n - 1;
    el.prev.hidden = el.nextBtn.hidden = n < 2;
    el.add.disabled = !st;
    el.end.disabled = !st;
    root.classList.toggle('mt-is-paused', S.pausedAt != null && st);
    root.classList.toggle('mt-is-running', st && S.pausedAt == null);
    for (var i = 0; i < el.opts.length; i++) el.opts[i].checked = !!S.opts[el.opts[i].getAttribute('data-mt-opt')];
    // end screen
    el.run.hidden = S.done;
    el.sum.hidden = !S.done;
    if (S.done) summary();
    draw();
  }
  function cell(tag, text, cls) {
    var c = document.createElement(tag);
    c.textContent = text;
    if (cls) c.className = cls;
    if (tag === 'th' && cls !== 'row') c.scope = 'col';
    return c;
  }
  function summary() {
    var a = ag(), cols = a.cols && a.cols.length ? a.cols : ['الفقرة', 'المدة'];
    var meta = a.label;
    try {
      if (S.meetStart) {
        var d0 = new Date(S.meetStart);
        meta += ' — ' + d0.toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }) + '، ' + d0.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) { /* locale formatting is optional */ }
    el.sumMeta.textContent = meta;
    el.sumHead.textContent = ''; el.sumBody.textContent = ''; el.sumFoot.textContent = '';
    var hr = document.createElement('tr');
    hr.appendChild(cell('th', cols[0])); hr.appendChild(cell('th', cols[1])); hr.appendChild(cell('th', 'الفعلي'));
    el.sumHead.appendChild(hr);
    var tp = 0, ta = 0, added = 0;
    a.blocks.forEach(function (b, i) {
      var tr = document.createElement('tr');
      var th = cell('th', b.name, 'row'); th.scope = 'row'; th.setAttribute('data-th', cols[0]);
      var plan = plannedText(b) + (S.added[i] ? ' (+' + S.added[i] + ' د)' : '');
      var td1 = cell('td', plan); td1.setAttribute('data-th', cols[1]);
      var td2 = cell('td', S.actual[i] ? mmss(S.actual[i]) : '—'); td2.setAttribute('data-th', 'الفعلي');
      tr.appendChild(th); tr.appendChild(td1); tr.appendChild(td2);
      el.sumBody.appendChild(tr);
      tp += b.min; ta += S.actual[i] || 0; added += S.added[i] || 0;
    });
    var fr = document.createElement('tr');
    var fth = cell('th', 'المجموع', 'row'); fth.scope = 'row'; fth.setAttribute('data-th', cols[0]);
    var f1 = cell('td', fmtMin(tp) + (added ? ' + ' + added : '') + ' دقيقة'); f1.setAttribute('data-th', cols[1]);
    var f2 = cell('td', mmss(ta)); f2.setAttribute('data-th', 'الفعلي');
    fr.appendChild(fth); fr.appendChild(f1); fr.appendChild(f2);
    el.sumFoot.appendChild(fr);
  }

  // --------------------------------------------------------------- print ---
  function printOnly(cls) {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  }

  // -------------------------------------------------------------- wiring ---
  el.start.addEventListener('click', startMeeting);
  el.pause.addEventListener('click', togglePause);
  el.prev.addEventListener('click', function () { go(S.idx - 1); });
  el.nextBtn.addEventListener('click', function () { go(S.idx + 1); });
  el.add.addEventListener('click', addMinute);
  el.end.addEventListener('click', endMeeting);
  el.fresh.addEventListener('click', newMeeting);
  el.print.addEventListener('click', function () { printOnly('print-meeting-timer'); });
  el.agenda.addEventListener('change', function () {
    var id = el.agenda.value;
    if (id === S.agenda) return;
    if (S.started && !S.done) {
      var ok = false;
      try { ok = window.confirm('سيُلغى اللقاء الحالي، متابعة؟'); } catch (e) { ok = true; }
      if (!ok) { el.agenda.value = S.agenda; return; }
    }
    S = blank(id, S.opts);
    save(); render(); loop();
    announce('اخترت: ' + ag().label);
  });
  for (var oi = 0; oi < el.opts.length; oi++) {
    el.opts[oi].addEventListener('change', function (e) {
      S.opts[e.target.getAttribute('data-mt-opt')] = !!e.target.checked;
      if (S.opts.tone) primeAudio();
      save();
    });
  }
  if (canVib) el.vibWrap.hidden = false;
  // keyboard: Space pauses/resumes, arrows move between segments (RTL: ← is forward)
  root.addEventListener('keydown', function (e) {
    var tg = e.target, tag = tg && tg.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!S.started || S.done) return;
    if ((e.key === ' ' || e.key === 'Spacebar') && tag !== 'BUTTON') { e.preventDefault(); togglePause(); return; }
    var rtl = getComputedStyle(root).direction === 'rtl';
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      var fwd = (e.key === 'ArrowLeft') === rtl;
      go(S.idx + (fwd ? 1 : -1));
    }
  });
  // fullscreen (hidden when not supported)
  var fsTarget = root;
  var fsOn = function () { return document.fullscreenElement === fsTarget; };
  try { if (document.fullscreenEnabled && fsTarget.requestFullscreen) el.fs.hidden = false; } catch (e) { /* no fullscreen */ }
  el.fs.addEventListener('click', function () {
    try {
      if (fsOn()) { var x = document.exitFullscreen(); if (x && x.catch) x.catch(function () {}); } else { var r = fsTarget.requestFullscreen(); if (r && r.catch) r.catch(function () {}); }
    } catch (e) { /* ignore */ }
  });
  document.addEventListener('fullscreenchange', function () {
    el.fsL.textContent = fsOn() ? 'خروج من ملء الشاشة' : 'ملء الشاشة';
    root.classList.toggle('mt-is-fs', fsOn());
  });
  document.addEventListener('visibilitychange', function () {
    lock = document.visibilityState === 'visible' ? lock : null;
    if (document.visibilityState === 'visible') tick();
    loop();
  });

  // --------------------------------------------------------------- start ---
  var q = null;
  try { q = new URLSearchParams(location.search).get('mt'); } catch (e) { q = null; }
  var saved = store.get();
  if (valid(saved)) {
    S = saved;
    if (!S.rang || S.rang.length !== S.added.length) S.rang = S.added.map(function () { return false; });
    // a deep link picks its agenda unless a meeting is still running here (never cancel it silently)
    if (q && byId[q] && q !== S.agenda && !(S.started && !S.done)) S = blank(q, S.opts);
  } else {
    S = blank(q && byId[q] ? q : AG[0].id);
  }
  root.hidden = false;
  render(); tick(); loop();
  window.YanabeeMeetingTimer = { state: function () { return JSON.parse(JSON.stringify(S)); }, tick: tick };
  if (location.hash === '#mt') {
    requestAnimationFrame(function () { try { root.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ } });
  }
})();
