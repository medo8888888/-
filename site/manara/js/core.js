// MANARA («منارة») shell, loaded first on every page: icons, theme, language (ar/en),
// i18n strings, nav + footer rendering, mobile menu, reveal, toasts, and the
// cross-tab message bus (Manara.link). Classic script (no modules): the site must
// also work when opened from file:// or uploaded as plain static files.
// Contract: docs/MANARA.md (names stay; new members may be added).
(function () {
  'use strict';
  var d = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* storage blocked (private mode, sandbox) */ }
    return null;
  }

  /* ---------------- product identity (one place to rename) ---------------- */
  var NAME = { ar: 'منارة', en: 'MANARA' };
  var TAGLINE = { ar: 'ترى الحريق… توقظ الجميع… وتُضيء طريق النجاة', en: 'Sees the fire. Wakes everyone. Lights the way out.' };

  /* ---------------- icons (24px stroke icons, currentColor) ---------------- */
  var ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    fire: '<path d="M12 22c4 0 7-2.7 7-6.7 0-3.6-2.6-6-4.2-8.3-.4 1.8-1.3 3-2.8 3.6C12.6 7.3 11 4.3 8.5 2c.3 3.4-3.5 6.2-3.5 10.8C5 19 8 22 12 22z"/>',
    drone: '<circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M7.5 7.5l2.5 2.5M16.5 7.5L14 10M7.5 16.5l2.5-2.5M16.5 16.5L14 14"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
    thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>',
    speaker: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    nav: '<path d="M12 2l7 19-7-4-7 4z"/>',
    smoke: '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
    code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    access: '<circle cx="12" cy="4" r="2"/><path d="M4 8l8 1 8-1M12 9v5l-3 7M12 14l3 7"/>',
    signal: '<path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="12" r="1"/><path d="M12 13v8"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
  };
  function icon(name, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.help) + '</svg>';
  }
  // Logo: a lighthouse whose lamp is a small drone, throwing two beams. Inline so it needs no file.
  function logo(size) {
    var s = size || 38;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="mn-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd166" stop-opacity=".0"/><stop offset="1" stop-color="#ffd166" stop-opacity=".85"/></linearGradient>' +
      '<linearGradient id="mn-b2" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffd166" stop-opacity=".0"/><stop offset="1" stop-color="#ffd166" stop-opacity=".85"/></linearGradient></defs>' +
      '<rect x="2" y="2" width="60" height="60" rx="18" fill="#0d1320"/>' +
      '<path d="M4 12L28 19v4L4 30z" fill="url(#mn-b)"/><path d="M60 12L36 19v4l24 7z" fill="url(#mn-b2)"/>' +
      '<path d="M26.5 27h11l3 27h-17z" fill="#f3f5f9"/><path d="M25.4 37h13.2l.7 6H24.7zM24 49h16l.5 5h-17z" fill="#ff7a45"/>' +
      '<rect x="25" y="16" width="14" height="10" rx="3" fill="#ffd166"/><circle cx="32" cy="21" r="2.6" fill="#0d1320"/>' +
      '<g stroke="#3ad6e6" stroke-width="2.2" stroke-linecap="round" fill="none"><circle cx="22.5" cy="14.5" r="3"/><circle cx="41.5" cy="14.5" r="3"/><path d="M25 16l2 1.5M39 16l-2 1.5"/></g>' +
      '<path d="M18 56h28" stroke="#3ad6e6" stroke-width="2.4" stroke-linecap="round"/></svg>';
  }

  /* ---------------- strings (i18n) ---------------- */
  var STR = {
    'nav.home': { ar: 'الرئيسية', en: 'Home' },
    'nav.mission': { ar: 'غرفة العمليات', en: 'Mission Control' },
    'nav.detect': { ar: 'مختبر الأدلة', en: 'Evidence Lab' },
    'nav.alert': { ar: 'هواتف السكان', en: 'Resident Phones' },
    'nav.build': { ar: 'بناء النموذج', en: 'Build It' },
    'nav.pitch': { ar: 'العرض التقديمي', en: 'Pitch' },
    'nav.report': { ar: 'التقرير العلمي', en: 'Report' },
    'nav.poster': { ar: 'لوحة العرض', en: 'Display Board' },
    'ui.menu': { ar: 'القائمة', en: 'Menu' },
    'ui.close': { ar: 'إغلاق', en: 'Close' },
    'ui.theme': { ar: 'تبديل الوضع الليلي/النهاري', en: 'Toggle dark/light mode' },
    'ui.lang': { ar: 'Switch to English', en: 'التبديل إلى العربية' },
    'ui.skip': { ar: 'تخطَّ إلى المحتوى', en: 'Skip to content' },
    'foot.about': {
      ar: 'مشروع ابتكار طلابي يكمّل منظومة الدفاع المدني في «آخر مئة متر»: يتحقق من الحريق قبل أن يُنذِر، ويوقظ كل إنسان قريب بلغته وبالطريقة التي تناسبه، ويدلّه على مخرج مفتوح فعلاً، ويتأكد أن الجميع خرجوا.',
      en: 'A student innovation project for the "last 100 metres" of a fire: it verifies the fire before alerting, wakes every nearby person in their own language and format, guides them to an exit that is really open, and checks that everyone got out.'
    },
    'foot.demo': { ar: 'العرض الحي', en: 'Live demo' },
    'foot.project': { ar: 'المشروع', en: 'The project' },
    'foot.offline': { ar: 'يعمل دون إنترنت — افتح الملفات مباشرة من الجهاز.', en: 'Works offline — open the files straight from the device.' },
    'foot.made': { ar: 'نموذج أولي لمسابقة الابتكار — الصقور تكافح النار، والمنارة تُخرج الجميع بأمان', en: 'Innovation-competition prototype — the falcons fight the fire; the lighthouse gets everyone out' }
  };
  function lang() { return d.dataset.lang === 'en' ? 'en' : 'ar'; }
  function L(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    var l = lang();
    return obj[l] != null ? obj[l] : (obj.ar != null ? obj.ar : obj.en);
  }
  function s(key) { return STR[key] ? L(STR[key]) : key; }
  function strings(dict) { for (var k in dict) if (Object.prototype.hasOwnProperty.call(dict, k)) STR[k] = dict[k]; }
  function applyI18n(root) {
    root = root || document;
    $$('[data-i18n]', root).forEach(function (el) { el.textContent = s(el.getAttribute('data-i18n')); });
    $$('[data-i18n-attr]', root).forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        if (p.length === 2) el.setAttribute(p[0].trim(), s(p[1].trim()));
      });
    });
    var t = document.querySelector('title');
    if (t) {
      if (!t.hasAttribute('data-ar')) t.setAttribute('data-ar', t.textContent);
      var en = t.getAttribute('data-en');
      document.title = lang() === 'en' && en ? en : t.getAttribute('data-ar');
    }
  }
  function num(n, digits) {
    if (n == null || isNaN(n)) return '–';
    var opts = { maximumFractionDigits: digits == null ? 0 : digits, minimumFractionDigits: digits == null ? 0 : digits };
    try { return new Intl.NumberFormat(lang() === 'ar' ? 'ar-u-nu-latn' : 'en', opts).format(n); } catch (e) { return String(n); }
  }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), r = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* ---------------- theme ---------------- */
  function syncThemeUI() {
    var dark = d.dataset.theme === 'dark';
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0a0e15' : '#f6f4f1';
    $$('.theme-toggle').forEach(function (b) { b.innerHTML = icon(dark ? 'sun' : 'moon'); });
  }
  function setTheme(t, persist) {
    d.dataset.theme = t === 'dark' ? 'dark' : 'light';
    if (persist) store('manara-theme', d.dataset.theme);
    syncThemeUI();
    window.dispatchEvent(new CustomEvent('themechange', { detail: d.dataset.theme }));
  }
  function toggleTheme() { setTheme(d.dataset.theme === 'dark' ? 'light' : 'dark', true); }

  /* ---------------- language ---------------- */
  function setLang(l, persist) {
    l = l === 'en' ? 'en' : 'ar';
    d.dataset.lang = l; d.lang = l; d.dir = l === 'ar' ? 'rtl' : 'ltr';
    if (persist) store('manara-lang', l);
    renderShell();
    applyI18n(document);
    window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  function toggleLang() { setLang(lang() === 'ar' ? 'en' : 'ar', true); }

  /* ---------------- nav + footer ---------------- */
  var PAGES = [
    ['index.html', 'nav.home', 'home'],
    ['mission.html', 'nav.mission', 'radar'],
    ['detect.html', 'nav.detect', 'eye'],
    ['alert.html', 'nav.alert', 'phone'],
    ['build.html', 'nav.build', 'wrench'],
    ['pitch.html', 'nav.pitch', 'slides'],
    ['report.html', 'nav.report', 'chart']
  ];
  var EXTRA = [['poster.html', 'nav.poster', 'layers']];
  function current() { return (document.body && document.body.getAttribute('data-page')) || 'index.html'; }
  function links(cls) {
    return PAGES.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === current() ? ' aria-current="page"' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + icon(p[2]) + '<span>' + s(p[1]) + '</span></a>';
    }).join('');
  }
  function brand() {
    return '<a class="brand" href="index.html" aria-label="' + L(NAME) + ' — ' + s('nav.home') + '">' + logo(38) +
      '<span><b>' + L(NAME) + '</b><small>' + L(TAGLINE) + '</small></span></a>';
  }
  function renderShell() {
    var nav = $('[data-nav]');
    if (nav) {
      var wasOpen = !!$('.menu.open');
      nav.innerHTML =
        '<div class="nav-bar">' + brand() +
        '<nav class="nav-links" aria-label="' + s('ui.menu') + '">' + links() + '</nav>' +
        '<div class="nav-tools">' +
        '<button class="icon-btn lang-btn" type="button" data-lang-toggle aria-label="' + s('ui.lang') + '" title="' + s('ui.lang') + '">' + (lang() === 'ar' ? 'EN' : 'ع') + '</button>' +
        '<button class="icon-btn theme-toggle" type="button" aria-label="' + s('ui.theme') + '" title="' + s('ui.theme') + '"></button>' +
        '<button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="manara-menu" aria-label="' + s('ui.menu') + '">' + icon('menu') + '</button>' +
        '</div></div>' +
        '<nav class="menu" id="manara-menu" aria-label="' + s('ui.menu') + '">' + links() + '</nav>';
      var menu = $('.menu', nav), mb = $('.menu-btn', nav);
      var setMenu = function (open) {
        menu.classList.toggle('open', open);
        mb.setAttribute('aria-expanded', open ? 'true' : 'false');
        mb.innerHTML = icon(open ? 'x' : 'menu');
      };
      mb.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });
      $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
      if (wasOpen) setMenu(true);
      $('[data-lang-toggle]', nav).addEventListener('click', toggleLang);
      $('.theme-toggle', nav).addEventListener('click', toggleTheme);
    }
    var foot = $('[data-footer]');
    if (foot) {
      foot.innerHTML =
        '<div class="wrap"><div class="foot-grid">' +
        '<div>' + brand() + '<p>' + s('foot.about') + '</p></div>' +
        '<div><h4>' + s('foot.demo') + '</h4>' + PAGES.slice(1, 4).map(function (p) { return '<a href="' + p[0] + '">' + s(p[1]) + '</a>'; }).join('') + '</div>' +
        '<div><h4>' + s('foot.project') + '</h4>' + [PAGES[0], PAGES[4], PAGES[5], PAGES[6], EXTRA[0]].map(function (p) { return '<a href="' + p[0] + '">' + s(p[1]) + '</a>'; }).join('') + '</div>' +
        '</div><div class="foot-bottom"><span>' + s('foot.made') + ' — ' + L(NAME) + '</span><span>' + s('foot.offline') + '</span></div></div>';
    }
    var skip = $('.skip');
    if (skip) skip.textContent = s('ui.skip');
    syncThemeUI();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = $('.menu.open');
    if (m) { var b = $('.menu-btn'); if (b) { b.click(); b.focus(); } }
  });

  /* ---------------- reveal on scroll ---------------- */
  function reveal(root) {
    var els = $$('.rv:not(.in)', root || document);
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
      els.forEach(function (el) { io.observe(el); });
    } else els.forEach(function (el) { el.classList.add('in'); });
    $$('[data-stagger]', root || document).forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty('--d', Math.min(i, 9) * 0.06 + 's'); });
    });
  }

  /* ---------------- toasts ---------------- */
  function toast(text, kind, ms) {
    var box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = L(text);
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 4200);
    return t;
  }

  /* ---------------- cross-tab bus: Manara.link ----------------
     Messages are plain objects with a `type` (see docs/MANARA.md for the schema).
     Delivery: BroadcastChannel('manara') + a localStorage 'storage' event fallback
     (covers browsers/origins where BroadcastChannel is unavailable, e.g. some file://).
     The last message of each type is kept in localStorage so a page opened later
     (e.g. the citizen phone) can show the alert that is already active. */
  var bc = null;
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel('manara'); } catch (e) { bc = null; }
  var subs = [], seen = {};
  var me = Math.random().toString(36).slice(2, 9);
  function deliver(msg) {
    if (!msg || typeof msg !== 'object' || !msg._k || seen[msg._k]) return;
    seen[msg._k] = 1;
    subs.forEach(function (fn) { try { fn(msg); } catch (e) { console.error(e); } });
  }
  if (bc) bc.onmessage = function (e) { deliver(e.data); };
  window.addEventListener('storage', function (e) {
    if (e.key !== 'manara-bus' || !e.newValue) return;
    try { deliver(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
  });
  var link = {
    send: function (msg) {
      msg = Object.assign({}, msg, { ts: Date.now(), from: current(), _k: me + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) });
      seen[msg._k] = 1;
      if (bc) { try { bc.postMessage(msg); } catch (e) { /* ignore */ } }
      var json = JSON.stringify(msg);
      store('manara-bus', json);
      if (msg.type) store('manara-last-' + msg.type, json);
      return msg;
    },
    on: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    last: function (type) { try { return JSON.parse(store('manara-last-' + type) || 'null'); } catch (e) { return null; } },
    clear: function (type) { try { localStorage.removeItem('manara-last-' + type); } catch (e) { /* ignore */ } }
  };

  /* ---------------- public API ---------------- */
  window.Manara = {
    NAME: NAME, TAGLINE: TAGLINE,
    $: $, $$: $$, store: store, reduce: reduce,
    icon: icon, logo: logo,
    lang: lang, setLang: function (l) { setLang(l, true); }, toggleLang: toggleLang,
    L: L, s: s, strings: strings, applyI18n: applyI18n, num: num, clock: clock,
    theme: { get: function () { return d.dataset.theme; }, set: function (t) { setTheme(t, true); }, toggle: toggleTheme },
    reveal: reveal, toast: toast, link: link, page: current
  };

  function boot() {
    if (!d.dataset.theme) d.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (!d.dataset.lang) { d.dataset.lang = 'ar'; d.dir = 'rtl'; d.lang = 'ar'; }
    renderShell();
    applyI18n(document);
    reveal();
    $$('[data-icon]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', icon(el.getAttribute('data-icon'))); el.removeAttribute('data-icon'); });
    window.__manaraReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
