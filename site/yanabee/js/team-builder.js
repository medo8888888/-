// register.html · «قبل التسجيل: كوّن فرقك ووزّع الأدوار» (feature team-builder).
// Markup and the document lines: tools/yanabee/feat_team_builder.py (<script type="application/json" id="team-builder-data">).
// Turns a list of students into teams of MIN–MAX (c-terms), lets the organiser move members, pick the roles of the form
// (c-form), checks each team and pushes a finished team into register.js's draft ('yanabee-reg-draft').
// Classic script, no network: names stay in this browser (localStorage 'yanabee-team-builder-v1', in memory if blocked).
(function () {
  'use strict';
  var root = document.getElementById('team-builder');
  var dataEl = document.getElementById('team-builder-data');
  if (!root || !dataEl || root.getAttribute('data-tb-ready')) return;
  var D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  root.setAttribute('data-tb-ready', '1');

  var KEY = 'yanabee-team-builder-v1';
  var DRAFT = 'yanabee-reg-draft';
  var MIN = D.min, MAX = D.max, LIMIT = 200;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  /* ------------------------------------------------------------ names ---- */
  // The same name written two ways must compare equal: spaces, tashkeel, tatweel, alef forms, alef maqsura.
  var norm = function (s) {
    return String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  };
  // One name per line; a leading list number ('1.', '١-', '1)') or bullet is dropped.
  var LEAD = /^\s*(?:[0-9٠-٩۰-۹]+\s*[.\-–)\]،,:/]|[-•*·–])\s*/;
  var parse = function (text) {
    var out = [], extra = 0;
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      var n = raw.replace(LEAD, '').replace(/\s+/g, ' ').trim();
      if (!n) return;
      if (out.length >= LIMIT) { extra++; return; }
      out.push({ n: n, line: i + 1 });
    });
    return { list: out, extra: extra };
  };
  var dupGroups = function (list) {
    var by = {}, order = [];
    list.forEach(function (x) {
      var k = norm(x.n);
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(x);
    });
    return order.filter(function (k) { return by[k].length > 1; }).map(function (k) { return by[k]; });
  };

  /* ------------------------------------------------------------ split ---- */
  // k = the smallest number of teams with every size in MIN–MAX; sizes differ by at most one.
  var plan = function (n) {
    var lo = Math.ceil(n / MAX), hi = Math.floor(n / MIN);
    if (n < MIN || lo > hi) {
      var full = n >= MIN ? Math.floor(n / MAX) : 0;
      var s = [];
      for (var j = 0; j < full; j++) s.push(MAX);
      return { ok: false, sizes: s, rest: n - full * MAX };
    }
    var k = lo, base = Math.floor(n / k), more = n % k, sizes = [];
    for (var i = 0; i < k; i++) sizes.push(base + (i < more ? 1 : 0));
    return { ok: true, sizes: sizes, rest: 0 };
  };
  var shuffle = function (a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  /* ------------------------------------------------------------ state ---- */
  var ROLES = ['leader', 'rec1', 'rec2', 'chess', 'coord'];
  var BOXES = ['grade', 'fee', 'law'];
  var newTeam = function (members) {
    return { name: '', members: members, roles: { leader: '', rec1: '', rec2: '', chess: '', coord: '' }, checks: { grade: false, fee: false, law: false } };
  };
  var S = { names: '', teams: [], waiting: [], edited: false, note: null };

  var canStore = true;
  var timer = 0;
  var savedEl = $('[data-tb-saved]');
  var writeNow = function () {
    clearTimeout(timer);
    var o = {
      names: S.names, edited: S.edited, note: S.note, waiting: S.waiting,
      teams: S.teams.map(function (t) { return { name: t.name, members: t.members }; }),
      roles: S.teams.map(function (t) { return t.roles; }),
      checks: S.teams.map(function (t) { return t.checks; })
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(o));
      canStore = true;
      savedEl.textContent = '';
    } catch (e) {
      canStore = false;
      savedEl.textContent = 'تعذّر الحفظ في هذا المتصفح؛ تبقى القائمة حتى إغلاق الصفحة فقط.';
    }
  };
  var save = function () { clearTimeout(timer); timer = setTimeout(writeNow, 400); };
  var str = function (v) { return typeof v === 'string' ? v : ''; };
  var load = function () {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return;
    S.names = str(o.names);
    S.edited = !!o.edited;
    S.note = o.note && typeof o.note === 'object' ? o.note : null;
    S.waiting = Array.isArray(o.waiting) ? o.waiting.filter(function (x) { return typeof x === 'string' && x; }) : [];
    S.teams = (Array.isArray(o.teams) ? o.teams : []).map(function (t, i) {
      var m = t && Array.isArray(t.members) ? t.members.filter(function (x) { return typeof x === 'string' && x; }) : [];
      var tm = newTeam(m);
      tm.name = str(t && t.name);
      var r = Array.isArray(o.roles) && o.roles[i] || {};
      ROLES.forEach(function (k) { tm.roles[k] = m.indexOf(r[k]) >= 0 ? r[k] : ''; });
      var c = Array.isArray(o.checks) && o.checks[i] || {};
      BOXES.forEach(function (k) { tm.checks[k] = !!c[k]; });
      return tm;
    });
  };

  /* ------------------------------------------------------------ chip ----- */
  var day = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var DAY = 864e5;
  var days = function (a, b) { return Math.round((b - a) / DAY); };
  var unit = function (n) { return n === 1 ? 'يوم' : n === 2 ? 'يومان' : n >= 3 && n <= 10 ? 'أيام' : 'يومًا'; };
  var chip = function () {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var start = day(D.start), end = day(D.end), txt, phase;
    if (today < start) { txt = 'يبدأ التسجيل 1 نوفمبر 2026'; phase = 'before'; }
    else if (today < end) {
      var n = days(today, end) + 1;
      // «باقٍ يومان» reads right without the numeral; 3 and more keep it («باقٍ 6 أيام»), like the hero countdown
      txt = 'باقٍ ' + (n <= 2 ? '' : n + ' ') + unit(n) + ' للتسجيل، منها اليوم (حتى 14 نوفمبر)'; phase = 'open';
    } else if (days(today, end) === 0) { txt = 'اليوم آخر يوم في فترة التسجيل (1 – 14 نوفمبر)'; phase = 'last'; }
    else { txt = 'انتهت فترة التسجيل المعلنة (1 – 14 نوفمبر)'; phase = 'after'; }
    var c = $('[data-tb-chip]');
    $('[data-tb-chip-t]', c).textContent = txt;
    c.setAttribute('data-phase', phase);
    c.hidden = false;
  };

  /* ------------------------------------------------------------ checks --- */
  var unitM = function (n) { return n === 1 ? 'عضو واحد' : n === 2 ? 'عضوان' : n + (n >= 3 && n <= 10 ? ' أعضاء' : ' عضوًا'); };
  var CHECKS = [
    { k: 'size', short: 'عدد الأعضاء', src: [D.how0] },
    { k: 'leader', short: 'القائد', src: [D.how0] },
    { k: 'rec', short: 'مرشحا التسميع', src: [] },
    { k: 'chess', short: 'مرشح الشطرنج', src: [] },
    { k: 'once', short: 'اسم مكرر في فريقين', src: [D.oneTeam] },
    { k: 'grade', short: 'تأكيد الصفوف', src: [D.partner0, D.ruleGrade], box: 'كل الأعضاء من الصف السابع إلى الصف الثاني عشر' },
    { k: 'fee', short: 'الرسوم', src: [D.fee], box: 'رسوم الاشتراك جاهزة' },
    { k: 'law', short: 'اللائحة', src: [D.law], box: 'قرأنا اللائحة' }
  ];
  var counts = function () {
    var c = {};
    S.teams.forEach(function (t) { t.members.forEach(function (m) { var k = norm(m); c[k] = (c[k] || 0) + 1; }); });
    return c;
  };
  var evaluate = function (t, cnt) {
    var n = t.members.length, r = t.roles;
    return {
      size: n >= MIN && n <= MAX,
      leader: !!r.leader,
      rec: !!r.rec1 && !!r.rec2 && norm(r.rec1) !== norm(r.rec2),
      chess: !!r.chess,
      once: t.members.every(function (m) { return cnt[norm(m)] === 1; }),
      grade: t.checks.grade, fee: t.checks.fee, law: t.checks.law
    };
  };

  /* ------------------------------------------------------------ render --- */
  var cardsEl = $('[data-tb-cards]');
  var waitEl = $('[data-tb-wait]');
  var srcHtml = function (s) {
    return '<blockquote class="tb-why"><p>' + esc(s.t) + '</p><cite>' + esc(s.from) + '</cite></blockquote>';
  };
  var options = function (members, sel, first) {
    return '<option value="">' + esc(first) + '</option>' + members.map(function (m) {
      return '<option value="' + esc(m) + '"' + (m === sel ? ' selected' : '') + '>' + esc(m) + '</option>';
    }).join('');
  };
  var moveSelect = function (name, from) {
    var o = '<option value="">— انقل إلى —</option>';
    S.teams.forEach(function (t, j) { if (j !== from) o += '<option value="t' + j + '">الفريق ' + (j + 1) + '</option>'; });
    if (from !== -1) o += '<option value="w">قائمة الانتظار</option>';
    // a separate button moves the member: a select that acted on 'change' would fire on every arrow key (Windows)
    return '<span class="tb-mv"><label><span class="sr-only">انقل إلى (' + esc(name) + ')</span>'
      + '<select data-mv="' + esc(name) + '" data-from="' + from + '">' + o + '</select></label>'
      + '<button type="button" class="btn btn-ghost btn-sm tb-mvb" data-mvgo>انقل<span class="sr-only"> ' + esc(name) + '</span></button></span>';
  };
  var tagsOf = function (t, m) {
    var r = t.roles, tags = [];
    if (r.leader === m) tags.push('القائد');
    if (r.rec1 === m) tags.push('التسميع 1');
    if (r.rec2 === m) tags.push('التسميع 2');
    if (r.chess === m) tags.push('الشطرنج');
    if (r.coord === m) tags.push('التنسيق');
    return tags;
  };
  var roleField = function (i, k, label, first, extra) {
    var t = S.teams[i];
    return '<label class="tb-f"><span class="tb-fl">' + esc(label) + (extra || '') + '</span>'
      + '<select data-r="' + k + '">' + options(t.members, t.roles[k], first) + '</select></label>';
  };
  var cardHtml = function (t, i) {
    var h = 'tb-c' + i + '-h';
    var pick = '— اختر من الأعضاء —';
    var checks = CHECKS.map(function (c) {
      var body;
      if (c.box) {
        body = '<label class="chk tb-box"><input type="checkbox" data-ck="' + c.k + '"' + (t.checks[c.k] ? ' checked' : '') + '><span>' + esc(c.box) + '</span></label>'
          + (c.k === 'law' ? '<a class="tb-link" href="competition.html#c-league">اقرأ لائحة الدوري</a>' : '');
      } else {
        body = '<span class="tb-ckt" data-ckt="' + c.k + '"></span>'
          + (c.k === 'rec' ? '<small class="f-hint">عضو أساسي وعضو احتياطي: اختر عضوين مختلفين</small>' : '');
      }
      var why = c.src.length ? '<div class="tb-whys" data-why="' + c.k + '" hidden>' + c.src.map(srcHtml).join('') + '</div>' : '';
      return '<li class="tb-ck" data-c="' + c.k + '"><span class="tb-ck-i" aria-hidden="true"></span><span class="sr-only" data-cks></span><div class="tb-ckb">' + body + why + '</div></li>';
    }).join('');
    var mem = t.members.map(function (m) {
      var tags = tagsOf(t, m).map(function (x) { return '<i>' + x + '</i>'; }).join('');
      return '<li><span class="tb-mn"><b>' + esc(m) + '</b><span class="tb-tags">' + tags + '</span></span>' + moveSelect(m, i) + '</li>';
    }).join('');
    return '<article class="tb-card pcard" data-i="' + i + '" aria-labelledby="' + h + '">'
      + '<header class="tb-ch"><h3 id="' + h + '" tabindex="-1">الفريق ' + (i + 1) + ' <small data-cnt></small></h3><p class="tb-badge" data-badge></p></header>'
      + '<div class="tb-ctl">'
      + '<div class="tb-grid">'
      + '<label class="tb-f"><span class="tb-fl">' + esc(D.lblTeam) + '</span><input type="text" data-name value="' + esc(t.name) + '" autocomplete="off"></label>'
      + roleField(i, 'leader', D.lblLeader, '— اختر القائد —')
      + roleField(i, 'rec1', D.nom[0], pick)
      + roleField(i, 'rec2', D.nom[1], pick)
      + roleField(i, 'chess', D.nom[2], pick)
      + roleField(i, 'coord', D.coord, pick, ' <small class="tb-opt">(اختياري)</small>')
      + '</div>'
      + '<h4 class="tb-h4">الأعضاء</h4><ol class="tb-mem">' + mem + '</ol>'
      + '<h4 class="tb-h4">التحقق قبل التسجيل</h4><ul class="tb-checks">' + checks + '</ul>'
      + '<div class="tb-push"><button type="button" class="btn btn-primary btn-sm" data-push>انقل هذا الفريق إلى الاستمارة</button>'
      + '<small class="f-hint" data-push-hint>يُفعَّل الزر بعد ضبط عدد الأعضاء واختيار القائد.</small>'
      + '<p class="tb-pmsg" data-push-msg role="status"></p></div>'
      + '</div>'
      + '<div class="tb-psum" data-psum></div>'
      + '</article>';
  };

  var update = function () {
    var cnt = counts(), ready = 0;
    S.teams.forEach(function (t, i) {
      var card = cardsEl.querySelector('.tb-card[data-i="' + i + '"]');
      if (!card) return;
      var ev = evaluate(t, cnt), miss = [];
      CHECKS.forEach(function (c) {
        var ok = ev[c.k];
        if (!ok) miss.push(c.short);
        var li = $('.tb-ck[data-c="' + c.k + '"]', card);
        li.setAttribute('data-ok', ok ? '1' : '0');
        $('[data-cks]', li).textContent = ok ? 'متحقق: ' : 'غير متحقق: ';
        var why = $('[data-why]', li);
        if (why) why.hidden = ok;
      });
      var r = t.roles, n = t.members.length;
      var put = function (k, s) { var el = $('[data-ckt="' + k + '"]', card); if (el) el.textContent = s; };
      put('size', 'عدد الأعضاء ' + n + ' (المطلوب من ' + MIN + ' إلى ' + MAX + ')');
      put('leader', D.lblLeader + ': ' + (r.leader || '—'));
      put('rec', 'مرشحا التسميع: ' + (r.rec1 || '—') + ' · ' + (r.rec2 || '—'));
      put('chess', D.nom[2] + ': ' + (r.chess || '—'));
      put('once', ev.once ? 'لا يتكرر أي اسم في فريقين' : 'اسم مكرر في فريقين: ' + t.members.filter(function (m) { return cnt[norm(m)] !== 1; }).join('، '));
      $('[data-cnt]', card).textContent = '(' + unitM(n) + ')';
      var badge = $('[data-badge]', card);
      badge.textContent = miss.length ? 'ينقصه: ' + miss.join('، ') : 'جاهز للتسجيل';
      badge.setAttribute('data-ok', miss.length ? '0' : '1');
      if (!miss.length) ready++;
      var canPush = ev.size && ev.leader;
      $('[data-push]', card).disabled = !canPush;
      $('[data-push-hint]', card).hidden = canPush;
      // print copy: plain text of the card
      var line = function (l, v) { return '<p><b>' + esc(l) + ':</b> ' + esc(v || '—') + '</p>'; };
      $('[data-psum]', card).innerHTML = '<h3>الفريق ' + (i + 1) + (t.name ? ' — ' + esc(t.name) : '') + '</h3>'
        + line(D.lblTeam, t.name) + line(D.lblLeader, r.leader)
        + '<ol>' + t.members.map(function (m) { var g = tagsOf(t, m); return '<li>' + esc(m) + (g.length ? ' <small>(' + g.join('، ') + ')</small>' : '') + '</li>'; }).join('') + '</ol>'
        + line(D.nom[0], r.rec1) + line(D.nom[1], r.rec2) + line(D.nom[2], r.chess) + line(D.coord, r.coord)
        + '<p class="tb-pbadge">' + esc(badge.textContent) + '</p>';
      $$('.tb-mem > li', card).forEach(function (li, j) {
        var tags = tagsOf(t, t.members[j]).map(function (x) { return '<i>' + x + '</i>'; }).join('');
        $('.tb-tags', li).innerHTML = tags;
      });
    });
    var bar = $('[data-tb-bar]');
    bar.hidden = !S.teams.length && !S.waiting.length;
    $('[data-tb-sum]').textContent = S.teams.length + ' فرق · ' + ready + ' جاهزة · ' + S.waiting.length + ' في قائمة الانتظار';
    $('[data-tb-print]').hidden = !S.teams.length;
  };

  var render = function () {
    cardsEl.innerHTML = S.teams.map(cardHtml).join('');
    if (S.waiting.length) {
      waitEl.innerHTML = '<div class="tb-waitbox pcard"><h3 class="tb-wh" tabindex="-1" id="tb-wait-h">قائمة الانتظار <small>(' + unitM(S.waiting.length) + ')</small></h3>'
        + (S.teams.length ? '' : '<p class="f-hint">لا توجد فرق بعد لنقل الأسماء إليها.</p>')
        + '<ol class="tb-mem">' + S.waiting.map(function (m) {
          return '<li><span class="tb-mn"><b>' + esc(m) + '</b></span>' + (S.teams.length ? moveSelect(m, -1) : '') + '</li>';
        }).join('') + '</ol></div>';
      waitEl.hidden = false;
    } else { waitEl.innerHTML = ''; waitEl.hidden = true; }
    renderNote();
    update();
  };

  var noteEl = $('[data-tb-note]');
  var renderNote = function () {
    var n = S.note;
    if (!n) { noteEl.hidden = true; noteEl.innerHTML = ''; noteEl.removeAttribute('data-kind'); return; }
    if (n.kind === 'fail') {
      noteEl.innerHTML = '<p><b>لا يمكن تقسيم ' + n.n + ' طالبًا إلى فرق من ' + MIN + ' إلى ' + MAX + ' دون بقية.</b></p>' + srcHtml(D.how0);
    } else if (n.kind === 'dups') {
      noteEl.innerHTML = '<p><b>ميّز الأسماء المكررة أولًا، ثم اقترح التقسيم.</b></p>';
    } else if (n.kind === 'empty') {
      noteEl.innerHTML = '<p><b>اكتب أسماء الطلاب أولًا.</b></p>';
    } else {
      noteEl.innerHTML = '<p>اقتُرح التقسيم: ' + n.sizes.map(unitM).join(' · ') + '. اختر لكل فريق قائده ومرشحيه.</p>';
    }
    noteEl.setAttribute('data-kind', n.kind);
    noteEl.hidden = false;
  };

  /* ------------------------------------------------------------ input ---- */
  var ta = $('#tb-names');
  var infoEl = $('[data-tb-info]');
  var dupsEl = $('[data-tb-dups]');
  var current = function () { return parse(ta.value); };
  var showInput = function () {
    var p = current(), groups = dupGroups(p.list);
    var info = p.list.length ? 'عدد الأسماء: ' + p.list.length : '';
    if (p.extra) info += ' · تقبل الأداة ' + LIMIT + ' اسم على الأكثر، فأُهمل ' + p.extra;
    var inTool = S.teams.reduce(function (a, t) { return a.concat(t.members); }, []).concat(S.waiting);
    if (inTool.length && p.list.length) {
      var a = p.list.map(function (x) { return norm(x.n); }).sort().join('|');
      var b = inTool.map(norm).sort().join('|');
      if (a !== b) info += ' · تغيّرت القائمة بعد آخر تقسيم؛ اضغط «اقترح التقسيم» لتحديث الفرق.';
    }
    infoEl.textContent = info;
    dupsEl.innerHTML = groups.map(function (g) {
      return '<li><b>«' + esc(g[0].n) + '»</b> <small>(الأسطر ' + g.map(function (x) { return x.line; }).join('، ') + ')</small> — مكرر: ميّز الاسمين قبل التقسيم</li>';
    }).join('');
    dupsEl.hidden = !groups.length;
    ta.setAttribute('aria-invalid', groups.length ? 'true' : 'false');
    return { p: p, groups: groups };
  };
  ta.addEventListener('input', function () { S.names = ta.value; showInput(); save(); });

  var doSplit = function (mix) {
    var st = showInput();
    if (st.groups.length) { S.note = { kind: 'dups' }; renderNote(); ta.focus(); return; }
    var names = st.p.list.map(function (x) { return x.n; });
    if (!names.length) { S.note = { kind: 'empty' }; renderNote(); ta.focus(); return; }
    if (S.edited && S.teams.length && !window.confirm('سيُعاد التقسيم وتضيع الأدوار المختارة. متابعة؟')) return;
    if (mix) names = shuffle(names);
    var pl = plan(names.length), at = 0;
    S.teams = pl.sizes.map(function (sz) { var m = names.slice(at, at + sz); at += sz; return newTeam(m); });
    S.waiting = names.slice(at);
    S.edited = false;
    S.note = pl.ok ? { kind: 'ok', sizes: pl.sizes } : { kind: 'fail', n: names.length };
    render();
    showInput();
    save();
    say(pl.ok ? 'اقتُرح ' + pl.sizes.length + ' فرق.' : 'لا يمكن التقسيم دون بقية.');
  };
  $('[data-tb-split]').addEventListener('click', function () { doSplit(false); });
  $('[data-tb-shuffle]').addEventListener('click', function () { doSplit(true); });
  $('[data-tb-clear]').addEventListener('click', function () {
    if (!window.confirm('ستُحذف الأسماء من هذا المتصفح. متابعة؟')) return;
    clearTimeout(timer);
    S = { names: '', teams: [], waiting: [], edited: false, note: null };
    ta.value = '';
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    render();
    showInput();
    ta.focus();
  });

  var sayEl = $('[data-tb-say]');
  var say = function (s) { sayEl.textContent = ''; setTimeout(function () { sayEl.textContent = s; }, 30); };

  /* ------------------------------------------------------------ cards ---- */
  var idxOf = function (el) { var c = el.closest('.tb-card'); return c ? +c.getAttribute('data-i') : -1; };
  root.addEventListener('change', function (e) {
    var el = e.target, i = idxOf(el);
    if (i < 0) return;
    var t = S.teams[i];
    if (el.matches('select[data-r]')) { t.roles[el.getAttribute('data-r')] = el.value; S.edited = true; update(); save(); }
    else if (el.matches('input[data-ck]')) { t.checks[el.getAttribute('data-ck')] = el.checked; S.edited = true; update(); save(); }
  });
  root.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.matches('input[data-name]')) return;
    var i = idxOf(el);
    S.teams[i].name = el.value;
    S.edited = true;
    update();
    save();
  });
  var move = function (name, from, to) {
    if (!to) return;
    var src = from === -1 ? S.waiting : S.teams[from].members;
    var k = src.indexOf(name);
    if (k < 0) return;
    src.splice(k, 1);
    if (from !== -1) { var r = S.teams[from].roles; ROLES.forEach(function (x) { if (r[x] === name) r[x] = ''; }); }
    var target;
    if (to === 'w') { S.waiting.push(name); target = 'قائمة الانتظار'; }
    else { var j = +to.slice(1); S.teams[j].members.push(name); target = 'الفريق ' + (j + 1); }
    S.edited = true;
    render();
    showInput();
    save();
    // keep the keyboard where it was: the next member of the same list, else that list's heading
    var box = from === -1 ? waitEl : cardsEl.querySelector('.tb-card[data-i="' + from + '"]');
    var sels = box ? $$('select[data-mv]', box) : [];
    var f = sels[Math.min(k, sels.length - 1)] || (box && $('h3', box)) || $('#tb-c0-h') || ta;
    if (f) f.focus();
    say('نُقل ' + name + ' إلى ' + target);
  };

  /* ------------------------------------------------------------ push ----- */
  root.addEventListener('click', function (e) {
    var go = e.target.closest('[data-mvgo]');
    if (go) {
      var sel = go.parentNode.querySelector('select[data-mv]');
      if (!sel.value) { sel.focus(); return; }
      move(sel.getAttribute('data-mv'), +sel.getAttribute('data-from'), sel.value);
      return;
    }
    var b = e.target.closest('[data-push]');
    if (!b || b.disabled) return;
    push(idxOf(b), $('[data-push-msg]', b.closest('.tb-card')));
  });
  var push = function (i, msg) {
    var t = S.teams[i], r = t.roles;
    if (!(t.members.length >= MIN && t.members.length <= MAX && r.leader)) return;
    var f = { team: t.name.trim(), leader: r.leader, rec1: r.rec1, rec2: r.rec2, chess: r.chess, coord: r.coord };
    var m = [{ n: r.leader }].concat(t.members.filter(function (x) { return x !== r.leader; }).map(function (x) { return { n: x }; }));
    var d = null, out;
    try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { d = null; }
    var df = d && d.f && typeof d.f === 'object' ? d.f : {};
    var dm = d && Array.isArray(d.m) ? d.m : [];
    var named = dm.filter(function (x) { return x && str(x.n).trim(); });
    if (!d || (!str(df.team).trim() && !named.length)) {
      out = { f: Object.assign({}, df, f), m: m }; // an empty draft: keep anything else it holds (phone, email…)
    } else if (f.team && norm(df.team) === norm(f.team)) {
      // the same team pushed again: keep the form's other fields and each member's age / contact
      var mf = Object.assign({}, df, f);
      ['rec1', 'rec2', 'chess', 'coord'].forEach(function (k) {
        if (!f[k] && df[k] && t.members.some(function (x) { return norm(x) === norm(df[k]); })) mf[k] = df[k];
      });
      out = {
        f: mf,
        m: m.map(function (x) {
          var o = named.filter(function (y) { return norm(y.n) === norm(x.n); })[0];
          return o ? { n: x.n, a: str(o.a), c: str(o.c) } : x;
        })
      };
    } else {
      if (!window.confirm('توجد مسودة استمارة لفريق آخر على هذا الجهاز. هل تستبدلها؟')) return;
      out = { f: f, m: m };
    }
    try {
      localStorage.setItem(DRAFT, JSON.stringify(out));
    } catch (e) {
      msg.textContent = 'تعذّر الحفظ في هذا المتصفح؛ انسخ الأسماء إلى الاستمارة يدويًا.';
      msg.setAttribute('data-bad', '1');
      return;
    }
    writeNow();
    msg.textContent = 'نُقل الفريق إلى الاستمارة.';
    location.hash = '#c-form';
    location.reload();
  };

  /* ------------------------------------------------------------ print ---- */
  var printOnly = window.__yanabeePrintOnly || function (cls) {
    document.body.classList.add(cls);
    var off = function () { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  };
  $('[data-tb-print]').addEventListener('click', function () { update(); printOnly('print-team-builder'); });

  /* ------------------------------------------------------------ start ---- */
  window.YanabeeTeamBuilder = { plan: plan, norm: norm, parse: function (s) { return parse(s).list.map(function (x) { return x.n; }); } };
  load();
  ta.value = S.names;
  chip();
  $$('.tb-nojs').forEach(function (el) { el.hidden = true; });
  $('[data-tb-tool]').hidden = false;
  render();
  showInput();
})();
