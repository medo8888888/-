// MANARA («منارة») landing page behaviour (index.html) — classic script, no libraries, works from file:// and offline.
// Contract: docs/MANARA.md. Every colour in a canvas is read from the CSS tokens (getComputedStyle) and redrawn on 'themechange';
// every string is bilingual (Manara.L / data-l spans) and re-rendered on 'langchange'. Nothing user-typed is ever put in innerHTML:
// innerHTML is used in ONE place (setStaticHTML) for author-written SVG/markup strings only.
//
// What is in here (each block is standalone and degrades alone):
//   1. hero        a deterministic canvas scene draw(t): sense → prove → reach → guide → count → hand off, six hazards, SIM
//   2. counters    animated sourced numbers
//   3. pipeline    the six-step interactive diagram (tabs: mouse, touch, keyboard)
//   4. proof       the two-keys + human ladder
//   5. national    the real map of Qatar (data/qatar-*.js, an OpenStreetMap snapshot) + js/national.js (Dijkstra on time = length / (free-flow speed × congestion),
//                  simulated traffic): 5a map layer, 5b real "farther but faster" examples, 5c hero "all of Qatar", 5d the fastest responder (traffic slider,
//                  click a road to jam it), 5e Qatar-wide facts and hazard layers, 5f the stage tabs. Real: geography. Simulated (SIM): traffic, units, hazards.
//   6. hazards     six playbook cards with threshold gauges (numbers from docs/MANARA-HAZARDS.md §13)
//   7. personas    four fictional people × six hazards (wording copied from js/messages.js and checked against it by the tests)
//   8. languages, transparency filter, evidence charts, subnav, print
(function () {
  'use strict';
  var M = window.Manara;
  if (!M) { return; }
  var $ = M.$, $$ = M.$$, L = M.L;
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = function () { return !!mq.matches; };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ramp = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var smooth = function (x) { return x * x * (3 - 2 * x); };
  var hash = function (i, s) { var x = Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453; return x - Math.floor(x); };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function sv(tag, attrs, parent) { var n = document.createElementNS(SVGNS, tag); if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function setStaticHTML(node, html) { node.innerHTML = html; }          // author-written strings ONLY (never user text)
  function iconInner(name) { var s = M.icon(name); return s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  // "2 min 33 s" / «دقيقتين و33 ثانية» (genitive/accusative forms: it is used after «بـ»)
  function dur(sec) {
    sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), r = sec % 60;
    if (M.lang() === 'en') return (m ? m + ' min ' : '') + (r || !m ? r + ' s' : '').trim();
    function part(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many; }
    var a = m ? part(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة') : '', b = r || !m ? part(r, 'ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية') : '';
    return a && b ? a + ' و' + b : a || b;
  }
  function onLang(fn) { window.addEventListener('langchange', fn); }
  function onTheme(fn) { window.addEventListener('themechange', fn); }

  /* ======================================================================= shared: tokens for canvases */
  var TOK = {}, RGB = {}, FONT_M = 'monospace', FONT_H = 'sans-serif';
  var TOKNAMES = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3', '--ink', '--ink-2', '--muted', '--line', '--line-2', '--head', '--brand', '--accent', '--safe', '--warn', '--danger', '--info', '--fire-1', '--fire-2', '--fire-3'];
  function parseColor(v) {
    var m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(v))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(v))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(v))) { var p = m[1].split(/[ ,\/]+/).map(parseFloat); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    return [128, 128, 128];
  }
  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    TOKNAMES.forEach(function (n) { var v = cs.getPropertyValue(n).trim(); TOK[n] = v; RGB[n] = parseColor(v); });
    FONT_M = cs.getPropertyValue('--font-m').trim() || FONT_M;
    FONT_H = cs.getPropertyValue('--font-h').trim() || FONT_H;
  }
  function C(name, a) { var c = RGB[name] || [128, 128, 128]; return (a == null || a >= 1) ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ======================================================================= shared: the six hazards */
  var HZ = [
    { id: 'fire', icon: 'fire', tone: '--danger', night: true, hour: '04:00', short: T('حريق', 'Fire'), long: T('حريق ودخان', 'Fire & smoke'),
      sees: T('بقعة ساخنة في المبنى', 'a hot spot in the building'), k1: T('بقعة حرارية', 'a thermal hotspot'), k2: T('دخان أو كاميرا', 'smoke or camera'),
      route: T('طريق بعيد عن النار عبر مخرج مفتوح فعلًا، إلى نقطة التجمع.', 'A route away from the fire, through an exit that is really open, to the assembly point.'),
      unit: T('سيارة إطفاء', 'Fire engine'), kind: 'fire', unitTone: '--danger', aria: T('حريق في مبنى سكني ليلًا', 'A fire in a residential building at night') },
    { id: 'gas', icon: 'alert', tone: '--warn', night: true, hour: '04:00', short: T('غاز', 'Gas'), long: T('تسرّب غاز', 'Gas leak'),
      sees: T('غازًا يتسرّب من مخزن', 'gas leaking from a store'), k1: T('قراءة غاز (أ)', 'gas reading A'), k2: T('قراءة ثانية واتجاه صاعد', 'a second reading and a rising trend'),
      route: T('طريق بعرض اتجاه الريح، بعيدًا عن الأماكن المنخفضة.', 'A route across the wind, away from low ground.'),
      unit: T('وحدة مواد خطرة', 'HazMat unit'), kind: 'hazmat', unitTone: '--warn', aria: T('تسرّب غاز من مخزن قريب ليلًا', 'A gas leak from a nearby store at night') },
    { id: 'flood', icon: 'alert', tone: '--info', night: false, hour: '10:30', short: T('سيول', 'Flood'), long: T('سيول وأمطار', 'Flash flood'),
      sees: T('الماء يرتفع في النفق', 'water rising in the underpass'), k1: T('منسوب الماء 15 سم', 'water level 15 cm'), k2: T('حسّاس ثانٍ أو تحذير أرصاد', 'a second sensor or a weather warning'),
      route: T('طريق إلى مكان مرتفع، وليس عبر النفق أبدًا.', 'A route to higher ground, never through the underpass.'),
      unit: T('فريق إنقاذ', 'Rescue team'), kind: 'rescue', unitTone: '--info', aria: T('ماء يرتفع في نفق نهارًا', 'Water rising in an underpass by day') },
    { id: 'dust', icon: 'wind', tone: '--warn', night: false, hour: '10:30', short: T('غبار', 'Dust'), long: T('عاصفة غبارية', 'Dust storm'),
      sees: T('جبهة غبار تقترب', 'a dust front approaching'), k1: T('غبار PM10 مرتفع', 'high PM10'), k2: T('هبوط الرؤية أو تحذير أرصاد', 'a visibility drop or a weather warning'),
      route: T('إلى الداخل بنوافذ مغلقة، وأقصر وقت في الخارج.', 'Indoors with windows shut, the shortest time outside.'),
      unit: T('دورية شرطة (السير)', 'Police (traffic)'), kind: 'police', unitTone: '--info', aria: T('جبهة غبار تقترب نهارًا', 'A dust front arriving by day') },
    { id: 'heat', icon: 'thermo', tone: '--brand', night: false, hour: '10:30', short: T('حرارة', 'Heat'), long: T('إجهاد حراري', 'Extreme heat'),
      sees: T('حرارة شديدة في موقع العمل', 'extreme heat at the worksite'), k1: T('تقدير WBGT مرتفع', 'a high WBGT estimate'), k2: T('تقويم حظر الظهيرة', 'the midday-ban calendar'),
      route: T('إلى مكان التبريد في الظل، مع ماء.', 'To the cool shelter in the shade, with water.'),
      unit: T('إسعاف', 'Ambulance'), kind: 'ambulance', unitTone: '--accent', aria: T('حرارة شديدة في موقع عمل نهارًا', 'Extreme heat at a worksite by day') },
    { id: 'sos', icon: 'heart', tone: '--danger', night: false, hour: '10:30', short: T('استغاثة', 'SOS'), long: T('شخص يحتاج مساعدة', 'Someone needs help'),
      sees: T('ضغطة استغاثة من غرفة في الطابق الأول', 'an SOS press from a first-floor room'), k1: T('زر استغاثة أو سقوط', 'SOS button or a fall'), k2: T('لا ردّ خلال 30 ثانية', 'no answer within 30 s'),
      route: T('المساعدة تأتي إلى الشخص: متطوع مدرَّب يتوجه إلى الغرفة وجهاز الصدمات (AED) من المدخل.', 'Help goes to the person: a trained volunteer heads to the room, the AED comes from the lobby.'),
      unit: T('إسعاف', 'Ambulance'), kind: 'ambulance', unitTone: '--accent', aria: T('شخص يحتاج مساعدة في غرفة', 'A person needing help in a room') }
  ];
  var HZ_BY = {}; HZ.forEach(function (h) { HZ_BY[h.id] = h; });
  var PRESET_OF = { fire: 'fire-night', gas: 'gas-night', flood: 'flood-day', dust: 'dust-day', heat: 'heat-day', sos: 'sos-day' };   // = ManaraSim.PRESET_ORDER ids, for mission.html#scenario=
  var STAGE_ICONS = ['radar', 'shield', 'bell', 'route', 'users', 'external'];
  var STAGE_NAMES = [T('يرصد', 'Sense'), T('يتحقق', 'Prove'), T('يُبلغ', 'Reach'), T('يُرشد', 'Guide'), T('يُحصي', 'Count'), T('يُسلّم', 'Hand off')];

  M.strings({
    'home.play': T('تشغيل المشهد', 'Play the scene'),
    'home.pause': T('إيقاف المشهد مؤقتًا', 'Pause the scene'),
    'home.stages': T('مراحل المشهد، اضغط للانتقال إليها', 'Scene stages, press to jump to one'),
    'home.subnav': T('أقسام الصفحة', 'Page sections'),
    'home.pipe': T('خطوات المنصة الست', 'The six platform steps'),
    'home.hzpick': T('اختر خطرًا', 'Pick a hazard'),
    'home.proofchips': T('ماذا حدث؟', 'What happened?'),
    'home.truth': T('تصفية بحسب الحالة', 'Filter by status'),
    'home.safe': T('آمنون', 'Safe'),
    'home.eta': T('وصول', 'ETA'),
    'home.sim': T('محاكاة', 'SIM')
  });

  /* ======================================================================= 1. HERO SCENE */
  var hero = (function () {
    var canvas = $('#hero-canvas');
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext('2d');
    var W = 640, H = 480;
    var LOOP = 19.5, STILL_T = 16.4, STEP = 0.25;      // STILL_T: the frame reduced-motion users get, when everyone is safe and the card is delivered
    var TL = { hazard: 1.0, k1: 2.8, k2: 4.4, human: 5.9, reach: 7.0, guide: 8.8, walk: 8.5, handoff: 14.4 };
    var STAGE_AT = [0, 2.6, 7.0, 8.8, 10.2, 14.4];
    var G = {
      bld: { x: 262, y: 150, w: 150, h: 96 }, door: { x: 337, y: 246 },
      lamp: { x: 500, y: 292 }, roadY: 357, roadH: 30, accessX: 329,
      stA: { x: 200, y: 446 }, stB: { x: 560, y: 446 },
      console: { x: 592, y: 84 }
    };
    // the two routes: Station A is NEARER but its stretch of main road is jammed; Station B is farther but clear (SIM numbers computed below)
    var ROUTE_A = [[200, 446], [200, 372], [337, 372], [337, 262]], ROUTE_B = [[560, 446], [560, 372], [337, 372], [337, 262]];
    var UNIT_SCALE_M = 10, FREE_KMH = 50, JAM_F = 0.4, JAM_SEG = 1;
    var ROOMS = []; for (var ri = 0; ri < 12; ri++) ROOMS.push({ x: 280 + (ri % 6) * 24.5, y: 170 + Math.floor(ri / 6) * 44 });

    function polyLen(p) { var s = 0, segs = []; for (var i = 1; i < p.length; i++) { var d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push(d); s += d; } return { total: s, segs: segs }; }
    var LA = polyLen(ROUTE_A), LB = polyLen(ROUTE_B);
    var ups = FREE_KMH / 3.6 / UNIT_SCALE_M;                 // map units per second at free flow
    function etaOf(len, jamIdx) { var t = 0; for (var i = 0; i < len.segs.length; i++) t += len.segs[i] / (ups * (i === jamIdx ? JAM_F : 1)); return t; }
    var ETA_A = etaOf(LA, JAM_SEG), ETA_B = etaOf(LB, -1);
    var DIST_A_KM = LA.total * UNIT_SCALE_M / 1000, DIST_B_KM = LB.total * UNIT_SCALE_M / 1000;
    var FACTOR = ETA_B / (TL.handoff - TL.reach);            // sim-seconds of travel per scene-second
    function alongTime(len, jamIdx, secs) {                  // distance covered after `secs` of (scaled) travel
      var left = secs, d = 0;
      for (var i = 0; i < len.segs.length; i++) {
        var sp = ups * (i === jamIdx ? JAM_F : 1), need = len.segs[i] / sp;
        if (left >= need) { left -= need; d += len.segs[i]; } else { d += left * sp; left = 0; break; }
      }
      return d;
    }
    function pointAt(p, segs, d) {
      for (var i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { var u = segs[i] ? clamp(d / segs[i], 0, 1) : 1; return [p[i][0] + (p[i + 1][0] - p[i][0]) * u, p[i][1] + (p[i + 1][1] - p[i][1]) * u, i]; } d -= segs[i]; }
      return [p[p.length - 1][0], p[p.length - 1][1], segs.length - 1];
    }

    /* ---- per-hazard scene data ---- */
    var sceneCache = {};
    function pathPts(start, via, target) { var p = [start]; (via || []).forEach(function (v) { p.push(v); }); p.push(target); return p; }
    function buildScene(h) {
      if (sceneCache[h.id]) return sceneCache[h.id];
      var S = { site: null, safe: [], people: [], k1: null, k2: null, wind: null, shelter: null, victim: null, vol: null };
      var i, n = 12, door = [G.door.x, G.door.y];
      function fan(i, c) { return [c.x + ((i % 4) - 1.5) * 11, c.y + (Math.floor(i / 4) - 1) * 11]; }
      if (h.id === 'fire') {
        S.site = { x: 394, y: 164 }; S.safe = [{ x: 120, y: 318 }];
        S.k1 = [394, 176]; S.k2 = [337, 196];
        for (i = 0; i < n; i++) { var r = ROOMS[i]; S.people.push({ sx: r.x + 9, sy: r.y + 12, inside: true, asleep: true, path: pathPts([r.x + 9, r.y + 12], [[337, 218], door, [337, 300]], fan(i, S.safe[0])) }); }
      } else if (h.id === 'gas') {
        S.site = { x: 528, y: 118 }; S.wind = { dx: -1, dy: 0.18 };
        S.safe = [{ x: 262, y: 334 }, { x: 424, y: 334 }];
        S.k1 = [528, 130]; S.k2 = [452, 150];
        for (i = 0; i < n; i++) { var r2 = ROOMS[i], tg = S.safe[i % 2]; S.people.push({ sx: r2.x + 9, sy: r2.y + 12, inside: true, asleep: true, path: pathPts([r2.x + 9, r2.y + 12], [[337, 218], door, [337, 290]], fan(Math.floor(i / 2), tg)) }); }
      } else if (h.id === 'flood') {
        S.site = { x: 110, y: 372 }; S.safe = [{ x: 430, y: 322 }];
        S.k1 = [110, 366]; S.k2 = [190, 372];
        for (i = 0; i < n; i++) { var sx = 40 + hash(i, 1) * 200, sy = 288 + hash(i, 2) * 56; S.people.push({ sx: sx, sy: sy, inside: false, asleep: false, path: pathPts([sx, sy], [[300, 304]], fan(i, S.safe[0])) }); }
      } else if (h.id === 'dust') {
        S.site = { x: 60, y: 150 }; S.safe = [{ x: 337, y: 252 }];
        S.k1 = [96, 170]; S.k2 = [200, 100];
        for (i = 0; i < 10; i++) { var dx = 50 + hash(i, 3) * 190, dy = 60 + hash(i, 4) * 200; S.people.push({ sx: dx, sy: dy, inside: false, asleep: false, path: pathPts([dx, dy], null, [337 + ((i % 5) - 2) * 7, 252 + Math.floor(i / 5) * 7]) }); }
      } else if (h.id === 'heat') {
        S.site = { x: 110, y: 96 }; S.safe = [{ x: 236, y: 96 }];
        S.k1 = [110, 110]; S.k2 = [150, 70]; S.shelter = { x: 214, y: 78, w: 44, h: 36 };
        for (i = 0; i < 8; i++) { var hx = 66 + (i % 4) * 28 + hash(i, 5) * 8, hy = 72 + Math.floor(i / 4) * 34 + hash(i, 6) * 8; S.people.push({ sx: hx, sy: hy, inside: false, asleep: false, path: pathPts([hx, hy], null, [236 + ((i % 4) - 1.5) * 7, 96 + (Math.floor(i / 4) - 0.5) * 12]) }); }
      } else {                                              // sos: a person needs help; help comes TO them
        S.site = { x: 304, y: 194 }; S.victim = { x: 304, y: 194 }; S.k1 = [304, 182]; S.k2 = [337, 200];
        S.people.push({ sx: 304, sy: 194, victim: true, inside: true, asleep: false, path: [[304, 194], [304, 194]] });
        S.vol = { path: [[150, 304], [337, 296], door, [337, 218], [318, 200]] };
        for (i = 1; i < 8; i++) { var q = ROOMS[(i * 3 + 1) % 12]; if (Math.abs(q.x + 9 - 304) < 14 && Math.abs(q.y + 12 - 194) < 20) q = ROOMS[(i * 3 + 2) % 12]; S.people.push({ sx: q.x + 9, sy: q.y + 12, inside: true, still: true, asleep: false, path: [[q.x + 9, q.y + 12], [q.x + 9, q.y + 12]] }); }
      }
      // timings: walking start (wake-up ladder: asleep people wake a little later), duration from path length
      S.people.forEach(function (p, idx) {
        var pl = polyLen(p.path); p.len = pl.total; p.segs = pl.segs;
        var wake = p.asleep ? 0.08 * idx + hash(idx, 7) * 0.7 : 0.07 * idx + hash(idx, 8) * 0.4;
        p.wakeAt = TL.reach + (p.asleep ? 0.15 * idx + hash(idx, 9) * 0.4 : 0.1 * idx);
        p.t0 = TL.walk + wake;
        var speed = 80 + hash(idx, 10) * 26;
        p.dur = p.len / speed;
      });
      if (S.vol) { var vl = polyLen(S.vol.path); S.vol.len = vl.total; S.vol.segs = vl.segs; S.vol.t0 = TL.reach + 0.6; S.vol.dur = 5.2; }
      sceneCache[h.id] = S; return S;
    }

    /* ---- state ---- */
    var st = { hz: HZ[0], t: 0, playing: true, userPaused: false, visible: true, S: null, k: 1, px: 1, lastStage: -1, lastLabel: '', cache: {} };
    function stageOf(t) { var s = 0; for (var i = 0; i < STAGE_AT.length; i++) if (t >= STAGE_AT[i]) s = i; return s; }
    function verdictOf(t) { return t >= TL.human ? 'public' : t >= TL.k2 ? 'confirmed' : t >= TL.k1 ? 'suspect' : ''; }

    /* ---- drawing primitives ---- */
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
    function poly(p, s) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); if (s) ctx.stroke(); }
    function text(s, x, y, size, color, weight, align) { ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT_M; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }

    function drawGround(h, t) {
      ctx.fillStyle = C('--bg-2'); ctx.fillRect(0, 0, W, H);
      // faint block grid (north-up map)
      ctx.strokeStyle = C('--line', 0.55); ctx.lineWidth = 1;
      for (var x = 40; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, G.roadY); ctx.stroke(); }
      for (var y = 40; y < G.roadY; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // roads
      ctx.fillStyle = C('--surface-3');
      ctx.fillRect(0, G.roadY, W, G.roadH);
      ctx.fillRect(G.accessX, G.door.y, 16, G.roadY - G.door.y);
      ctx.fillRect(G.stA.x - 8, G.roadY + G.roadH, 16, G.stA.y - G.roadY - G.roadH);
      ctx.fillRect(G.stB.x - 8, G.roadY + G.roadH, 16, G.stB.y - G.roadY - G.roadH);
      ctx.strokeStyle = C('--line-2'); ctx.lineWidth = 1.4; ctx.setLineDash([10, 9]);
      ctx.beginPath(); ctx.moveTo(0, G.roadY + G.roadH / 2); ctx.lineTo(W, G.roadY + G.roadH / 2); ctx.stroke(); ctx.setLineDash([]);
      // underpass: a darker dip in the main road
      rr(60, G.roadY + 2, 100, G.roadH - 4, 8); ctx.fillStyle = C('--line-2', 0.8); ctx.fill();
      ctx.strokeStyle = C('--muted', 0.6); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(110, G.roadY + G.roadH + 14, 30, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
      // blocks
      function block(x, y, w, hh, fill) { rr(x, y, w, hh, 8); ctx.fillStyle = fill || C('--surface-3'); ctx.fill(); ctx.strokeStyle = C('--line-2'); ctx.lineWidth = 1.2; ctx.stroke(); }
      block(48, 168, 128, 70); block(470, 176, 124, 76); block(460, 40, 90, 70);
      // park trees
      ctx.fillStyle = C('--safe', 0.28); [[496, 296], [520, 318], [470, 322], [548, 296]].forEach(function (c) { circle(c[0], c[1], 9); ctx.fill(); });
      if (h.id === 'heat') { rr(50, 46, 130, 108, 8); ctx.fillStyle = C('--fire-2', 0.10); ctx.fill(); ctx.strokeStyle = C('--brand', 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); }
    }

    function drawBuilding(h, t, S) {
      var b = G.bld;
      rr(b.x, b.y, b.w, b.h, 8); ctx.fillStyle = C('--surface-2'); ctx.fill(); ctx.strokeStyle = C('--line-2'); ctx.lineWidth = 2; ctx.stroke();
      // rooms (windows): dark while asleep, lit once a person is woken
      ROOMS.forEach(function (r, i) {
        var p = S.people[i], lit = false;
        if (p && h.night) lit = p.asleep ? t >= p.wakeAt : true;
        rr(r.x, r.y, 18, 26, 3);
        ctx.fillStyle = lit ? C('--fire-1', 0.9) : C('--surface-3'); ctx.fill();
        ctx.strokeStyle = C('--line-2'); ctx.lineWidth = 1; ctx.stroke();
      });
      // door + stair marks
      ctx.fillStyle = C('--brand'); ctx.fillRect(G.door.x - 9, G.door.y - 3, 18, 5);
      text('R', b.x + b.w - 11, b.y + 9, 9, C('--muted'), 700);
      // roof door (the one that can be locked)
      if (h.id === 'fire' || h.id === 'gas') { ctx.strokeStyle = C('--danger'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x + b.w - 17, b.y + 3); ctx.lineTo(b.x + b.w - 5, b.y + 15); ctx.moveTo(b.x + b.w - 5, b.y + 3); ctx.lineTo(b.x + b.w - 17, b.y + 15); ctx.stroke(); }
    }

    function drawHazard(h, t, S) {
      var g = smooth(ramp(t, TL.hazard, TL.hazard + 3.4)), late = ramp(t, TL.guide, LOOP - 2), x, y, i;
      if (g <= 0) return;
      if (h.id === 'fire') {
        x = S.site.x; y = S.site.y;
        var rad = 7 + 20 * g + 8 * late;
        var gr = ctx.createRadialGradient(x, y, 0, x, y, rad * 3); gr.addColorStop(0, C('--fire-2', 0.55)); gr.addColorStop(1, C('--fire-2', 0));
        ctx.fillStyle = gr; circle(x, y, rad * 3); ctx.fill();
        // smoke drifting downwind (north-east)
        for (i = 0; i < 5; i++) { var sp = ramp(t, TL.hazard + 0.4 * i, TL.hazard + 4 + i * 0.7) * (1 + 0.4 * late); ctx.fillStyle = C('--muted', 0.22 * (1 - i * 0.12)); circle(x + 22 * sp * (i + 1) * 0.8, y - 10 * sp * (i + 1) - 6, 10 + i * 5 * sp + 4); ctx.fill(); }
        // flames
        for (i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2 + 0.4, fx = x + Math.cos(a) * rad * 0.55, fy = y + Math.sin(a) * rad * 0.35;
          var fh = rad * (0.9 + 0.5 * Math.sin(t * 9 + i * 1.7)) * (0.7 + 0.3 * g);
          ctx.beginPath(); ctx.moveTo(fx - rad * 0.22, fy); ctx.quadraticCurveTo(fx - rad * 0.1, fy - fh * 0.6, fx + (i % 2 ? 2 : -2), fy - fh); ctx.quadraticCurveTo(fx + rad * 0.12, fy - fh * 0.5, fx + rad * 0.22, fy); ctx.closePath();
          ctx.fillStyle = i % 2 ? C('--fire-3', 0.95) : C('--fire-2', 0.95); ctx.fill();
        }
        circle(x, y - 2, rad * 0.32); ctx.fillStyle = C('--fire-1'); ctx.fill();
      } else if (h.id === 'gas') {
        x = S.site.x; y = S.site.y;
        rr(x - 14, y - 12, 28, 24, 6); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = C('--warn'); ctx.lineWidth = 2.4; ctx.stroke();
        text('LPG', x, y, 9, C('--warn'), 700);
        for (i = 0; i < 8; i++) {
          var ph = i * 0.12, grow = smooth(ramp(t, TL.hazard + ph, TL.hazard + 4.2 + ph));
          var cx = x + S.wind.dx * (30 + i * 34) * grow - Math.sin(t * 0.8 + i) * 3, cy = y + S.wind.dy * (30 + i * 34) * grow + Math.cos(t * 0.7 + i) * 3;
          ctx.fillStyle = C('--warn', 0.2); circle(cx, cy, (14 + i * 6.5) * grow); ctx.fill();
          ctx.strokeStyle = C('--warn', 0.55); ctx.lineWidth = 1.3; ctx.setLineDash([4, 5]); circle(cx, cy, (14 + i * 6.5) * grow); ctx.stroke(); ctx.setLineDash([]);
        }
        // wind arrow (blowing west)
        var ax = 560, ay = 64; ctx.strokeStyle = C('--ink-2'); ctx.fillStyle = C('--ink-2'); ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 44, ay + 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 44, ay + 7); ctx.lineTo(ax - 35, ay - 1); ctx.lineTo(ax - 33, ay + 11); ctx.closePath(); ctx.fill();
      } else if (h.id === 'flood') {
        x = S.site.x; y = S.site.y;
        var rx = 24 + 120 * g + 18 * late, ry = 14 + 74 * g + 10 * late;
        ctx.fillStyle = C('--info', 0.34); ctx.beginPath(); ctx.ellipse(x, y - 8 * g, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        for (i = 0; i < 3; i++) { var ph2 = (t * 0.7 + i / 3) % 1; ctx.strokeStyle = C('--info', 0.55 * (1 - ph2)); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 8 * g, rx * (0.35 + 0.65 * ph2), ry * (0.35 + 0.65 * ph2), 0, 0, Math.PI * 2); ctx.stroke(); }
        // rain streaks
        ctx.strokeStyle = C('--info', 0.4); ctx.lineWidth = 1.2;
        for (i = 0; i < 46; i++) { var rx0 = hash(i, 11) * W, ry0 = ((hash(i, 12) * H) + t * 160) % H; ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(rx0 - 4, ry0 + 11); ctx.stroke(); }
        // road closed sign on the underpass
        ctx.strokeStyle = C('--danger'); ctx.lineWidth = 3; var sg = ramp(t, TL.guide, TL.guide + 0.8); ctx.globalAlpha = sg;
        ctx.beginPath(); ctx.moveTo(86, G.roadY + 6); ctx.lineTo(134, G.roadY + G.roadH - 6); ctx.moveTo(134, G.roadY + 6); ctx.lineTo(86, G.roadY + G.roadH - 6); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (h.id === 'dust') {
        var xf = -50 + 760 * ramp(t, TL.hazard, 11.5);
        if (xf > 0) {
          var hg = ctx.createLinearGradient(xf - 170, 0, xf, 0); hg.addColorStop(0, C('--warn', 0.30)); hg.addColorStop(1, C('--warn', 0));
          ctx.fillStyle = C('--warn', 0.30); ctx.fillRect(0, 0, Math.max(0, xf - 170), H);
          ctx.fillStyle = hg; ctx.fillRect(Math.max(0, xf - 170), 0, Math.min(170, xf), H);
          ctx.fillStyle = C('--fire-1', 0.65);
          for (i = 0; i < 90; i++) { var px = (hash(i, 13) * W + t * 70 * (0.5 + hash(i, 14))) % W; if (px > xf) continue; var py = hash(i, 15) * H; ctx.fillRect(px, py, 3 + hash(i, 16) * 3, 1.6); }
          ctx.strokeStyle = C('--warn', 0.85); ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(xf, 0); ctx.lineTo(xf, H); ctx.stroke(); ctx.setLineDash([]);
        }
      } else if (h.id === 'heat') {
        x = S.site.x; y = S.site.y;
        var pr = 30 + 16 * g + 4 * Math.sin(t * 3);
        var hg2 = ctx.createRadialGradient(x, y, 0, x, y, pr * 2.4); hg2.addColorStop(0, C('--fire-2', 0.42)); hg2.addColorStop(1, C('--fire-2', 0));
        ctx.fillStyle = hg2; circle(x, y, pr * 2.4); ctx.fill();
        ctx.strokeStyle = C('--fire-2', 0.55 * g); ctx.lineWidth = 2;
        for (i = 0; i < 4; i++) { ctx.beginPath(); for (var k = 0; k <= 40; k++) { var xx = 60 + k * 3, yy = 52 + i * 26 + Math.sin(k * 0.45 + t * 3 + i) * 3 * g; if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke(); }
        // cooling shelter
        var sh = S.shelter; rr(sh.x, sh.y, sh.w, sh.h, 6); ctx.fillStyle = C('--accent', 0.18); ctx.fill(); ctx.strokeStyle = C('--accent'); ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = C('--accent'); ctx.lineWidth = 1.5; for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sh.x + 10 + i * 12, sh.y + 8); ctx.lineTo(sh.x + 10 + i * 12, sh.y + sh.h - 8); ctx.stroke(); }
      } else if (h.id === 'sos') {
        var v = S.victim, pulse = (t * 1.1) % 1;
        ctx.strokeStyle = C('--danger', 0.6 * (1 - pulse)); ctx.lineWidth = 3; circle(v.x, v.y, 10 + 34 * pulse); ctx.stroke();
        ctx.strokeStyle = C('--danger', 0.4); ctx.lineWidth = 2; circle(v.x, v.y, 12); ctx.stroke();
        // the AED box in the lobby
        rr(G.door.x + 14, G.door.y - 20, 20, 16, 3); ctx.fillStyle = C('--safe', 0.9); ctx.fill(); text('+', G.door.x + 24, G.door.y - 12, 12, C('--surface'), 700);
      }
    }

    function drawRoutes(h, t, S) {
      var gp = ramp(t, TL.guide, TL.guide + 1.1);
      if (gp <= 0 || h.id === 'sos') return;
      ctx.lineWidth = 3.4; ctx.setLineDash([2, 8]); ctx.lineCap = 'round'; ctx.lineDashOffset = -t * 18;
      S.safe.forEach(function (sf, si) {
        S.people.forEach(function (p, pi) {
          if (h.id === 'gas' && pi % 2 !== si) return;
          if (pi % 3 !== 0 && h.id !== 'gas') return;
          ctx.strokeStyle = C('--safe', 0.85 * gp);
          var pts = p.path, total = p.len * gp, d = 0; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (var i = 1; i < pts.length; i++) { var sl = p.segs[i - 1]; if (d + sl <= total) { ctx.lineTo(pts[i][0], pts[i][1]); d += sl; } else { var u = (total - d) / sl; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u); break; } }
          ctx.stroke();
        });
      });
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      // safe points
      S.safe.forEach(function (sf) {
        circle(sf.x, sf.y, 16 * st.k * 0.8 + 4); ctx.fillStyle = C('--safe', 0.22); ctx.fill(); ctx.strokeStyle = C('--safe'); ctx.lineWidth = 2.4; ctx.stroke();
        ctx.strokeStyle = C('--safe'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sf.x - 6, sf.y); ctx.lineTo(sf.x - 1, sf.y + 5); ctx.lineTo(sf.x + 7, sf.y - 5); ctx.stroke();
      });
    }

    function drawSafeHint(h, t, S) {
      // the safe targets are visible (faintly) from the start of the Prove stage so the viewer sees where people will go
      if (h.id === 'sos' || t >= TL.guide) return;
      var a = 0.5 * ramp(t, TL.k1, TL.k1 + 1);
      S.safe.forEach(function (sf) { ctx.strokeStyle = C('--safe', a); ctx.lineWidth = 2; ctx.setLineDash([4, 4]); circle(sf.x, sf.y, 14); ctx.stroke(); ctx.setLineDash([]); });
    }

    function drawUnit(x, y, ang, tone, alpha, flash, label) {
      var k = st.k; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
      rr(-12 * k, -6.5 * k, 24 * k, 13 * k, 3.5 * k); ctx.fillStyle = tone; ctx.fill(); ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = flash ? C('--info') : C('--danger'); ctx.fillRect(-3.2 * k, -4 * k, 6.4 * k, 3 * k);
      ctx.restore();
    }
    function drawStations(h, t) {
      [['A', G.stA], ['B', G.stB]].forEach(function (s) {
        rr(s[1].x - 11, s[1].y - 11, 22, 22, 5); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = C(h.unitTone); ctx.lineWidth = 2.4; ctx.stroke();
        text(s[0], s[1].x, s[1].y + 0.5, 13, C(h.unitTone), 700);
      });
    }
    function drawResponders(h, t) {
      var chosen = C(h.unitTone), tprog = t - TL.reach;
      // the jam on the main road between A's junction and the access road (always visible once traffic is "shown")
      var jamA = clamp(ramp(t, TL.k1, TL.k1 + 1), 0, 1);
      ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = C('--danger', 0.55 * jamA); ctx.beginPath(); ctx.moveTo(206, 372); ctx.lineTo(331, 372); ctx.stroke();
      ctx.strokeStyle = C('--safe', 0.45 * jamA); ctx.beginPath(); ctx.moveTo(343, 372); ctx.lineTo(554, 372); ctx.stroke();
      if (tprog <= 0) return;
      var sec = tprog * FACTOR;
      var dA = Math.min(LA.total, alongTime(LA, JAM_SEG, sec)), dB = Math.min(LB.total, alongTime(LB, -1, sec));
      var pa = pointAt(ROUTE_A, LA.segs, dA), pb = pointAt(ROUTE_B, LB.segs, dB);
      var angA = Math.atan2(ROUTE_A[pa[2] + 1][1] - ROUTE_A[pa[2]][1], ROUTE_A[pa[2] + 1][0] - ROUTE_A[pa[2]][0]);
      var angB = Math.atan2(ROUTE_B[pb[2] + 1][1] - ROUTE_B[pb[2]][1], ROUTE_B[pb[2] + 1][0] - ROUTE_B[pb[2]][0]);
      var flash = Math.floor(t * 4) % 2 === 0, arrived = dB >= LB.total - 0.5;
      // trail of the chosen unit
      ctx.strokeStyle = chosen; ctx.lineWidth = 4; ctx.setLineDash([2, 8]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.moveTo(ROUTE_B[0][0], ROUTE_B[0][1]);
      var d = 0; for (var i = 1; i < ROUTE_B.length; i++) { var sl = LB.segs[i - 1]; if (d + sl <= dB) { ctx.lineTo(ROUTE_B[i][0], ROUTE_B[i][1]); d += sl; } else { var u = (dB - d) / sl; ctx.lineTo(ROUTE_B[i - 1][0] + (ROUTE_B[i][0] - ROUTE_B[i - 1][0]) * u, ROUTE_B[i - 1][1] + (ROUTE_B[i][1] - ROUTE_B[i - 1][1]) * u); break; } }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      drawUnit(pa[0], pa[1], angA, C('--muted'), 0.75, flash);
      drawUnit(pb[0], pb[1], angB, chosen, 1, flash);
      if (arrived) { circle(337, 266, 16 + 2 * Math.sin(t * 5)); ctx.strokeStyle = C('--safe'); ctx.lineWidth = 2.4; ctx.stroke(); }
    }

    function drawPeople(h, t, S) {
      var k = st.k, r = 4.3 * k, safeN = 0;
      S.people.forEach(function (p, i) {
        var x = p.sx, y = p.sy, state = 'idle', u = 0;
        if (!p.still && !p.victim) {
          u = clamp((t - p.t0) / p.dur, 0, 1);
          if (t >= p.t0) { var pt = pointAt(p.path, p.segs, p.len * u); x = pt[0]; y = pt[1]; state = u >= 1 ? 'safe' : 'walk'; }
          else if (t >= p.wakeAt) state = 'awake';
          else if (p.asleep) state = 'asleep';
        }
        if (p.victim) state = 'victim';
        if (state === 'safe') safeN++;
        if (state === 'victim') { circle(x, y, r + 2); ctx.fillStyle = C('--danger'); ctx.fill(); ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.6; ctx.stroke(); return; }
        if (state === 'awake' && t < p.wakeAt + 0.7) { var pr = (t - p.wakeAt) / 0.7; ctx.strokeStyle = C('--brand', 0.8 * (1 - pr)); ctx.lineWidth = 2; circle(x, y, r + 3 + 12 * pr); ctx.stroke(); }
        circle(x, y, r);
        ctx.fillStyle = state === 'asleep' ? C('--muted', 0.75) : state === 'safe' ? C('--safe') : state === 'walk' ? C('--brand') : C('--ink-2');
        ctx.fill(); ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.4; ctx.stroke();
        if (state === 'asleep') text('z', x + 5 * k, y - 6 * k, 8 * k, C('--muted'), 700);
        if (state === 'safe') { ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 1.8 * k, y); ctx.lineTo(x - 0.4 * k, y + 1.6 * k); ctx.lineTo(x + 2 * k, y - 1.6 * k); ctx.stroke(); }
      });
      // the volunteer for SOS
      if (S.vol) {
        var u2 = clamp((t - S.vol.t0) / S.vol.dur, 0, 1), pv = pointAt(S.vol.path, S.vol.segs, S.vol.len * u2);
        if (t >= TL.reach) {
          circle(pv[0], pv[1], r + 1); ctx.fillStyle = C('--safe'); ctx.fill(); ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.6; ctx.stroke();
          ctx.strokeStyle = C('--surface'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(pv[0] - 2.2, pv[1]); ctx.lineTo(pv[0] + 2.2, pv[1]); ctx.moveTo(pv[0], pv[1] - 2.2); ctx.lineTo(pv[0], pv[1] + 2.2); ctx.stroke();
          S.volDone = u2 >= 1;
        }
      }
      return safeN;
    }

    function drawLamp(h, t, S) {
      var k = st.k, lx = G.lamp.x, ly = G.lamp.y;
      // the sweeping beam
      var ang = t * 0.9, R = 130;
      var bg = ctx.createRadialGradient(lx, ly, 0, lx, ly, R); bg.addColorStop(0, C('--fire-1', 0.5)); bg.addColorStop(1, C('--fire-1', 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, R, ang - 0.26, ang + 0.26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, R, ang + Math.PI - 0.26, ang + Math.PI + 0.26); ctx.closePath(); ctx.fill();
      // alert rings (REACH)
      var rt = t - TL.reach;
      if (rt >= 0 && rt < 2.4) for (var i = 0; i < 3; i++) { var u = rt - i * 0.45; if (u < 0 || u > 1.7) continue; var q = u / 1.7; ctx.strokeStyle = C('--brand', 0.8 * (1 - q)); ctx.lineWidth = 3 * (1 - q) + 1; circle(lx, ly, 14 + 300 * smooth(q)); ctx.stroke(); }
      // the lamp
      circle(lx, ly, 15 * k * 0.8 + 3); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = C('--brand'); ctx.lineWidth = 2.6; ctx.stroke();
      circle(lx, ly, 6.5 * k * 0.8 + 1.5); ctx.fillStyle = C('--fire-1'); ctx.fill();
      ctx.strokeStyle = C('--brand', 0.9); ctx.lineWidth = 2; for (i = 0; i < 8; i++) { var a = i * Math.PI / 4 + t * 0.4; ctx.beginPath(); ctx.moveTo(lx + Math.cos(a) * (13 * k * 0.8 + 4), ly + Math.sin(a) * (13 * k * 0.8 + 4)); ctx.lineTo(lx + Math.cos(a) * (13 * k * 0.8 + 9), ly + Math.sin(a) * (13 * k * 0.8 + 9)); ctx.stroke(); }
    }

    function drawKeys(h, t, S) {
      var lx = G.lamp.x, ly = G.lamp.y, cs = G.console;
      function link(from, to, t0, col, label) {
        var p = ramp(t, t0, t0 + 1.1); if (p <= 0) return;
        ctx.strokeStyle = C(col, 0.85); ctx.lineWidth = 2.4; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 22;
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        if (p >= 1) { var k = st.k, bx = from[0] + (to[0] - from[0]) * 0.5, by = from[1] + (to[1] - from[1]) * 0.5; circle(bx, by, 9 * k * 0.9 + 1); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = C(col); ctx.lineWidth = 2.2; ctx.stroke(); text(label, bx, by + 0.5, 11 * k * 0.9, C(col), 700); }
      }
      link(S.k1, [lx, ly], TL.k1, '--accent', '1');
      link(S.k2, [lx, ly], TL.k2, '--accent', '2');
      // the human key: an operator console at the top-right corner
      var hp = ramp(t, TL.human - 0.2, TL.human + 0.9);
      rr(cs.x - 18, cs.y - 13, 36, 26, 5); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = hp > 0 ? C('--brand') : C('--line-2'); ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = hp > 0 ? C('--brand') : C('--muted', 0.7); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(cs.x - 7, cs.y); ctx.lineTo(cs.x - 1.5, cs.y + 5); ctx.lineTo(cs.x + 8, cs.y - 5); ctx.stroke();
      if (hp > 0) { ctx.strokeStyle = C('--brand', 0.8 * (1 - hp)); ctx.lineWidth = 3; rr(cs.x - 18 - 14 * hp, cs.y - 13 - 14 * hp, 36 + 28 * hp, 26 + 28 * hp, 10); ctx.stroke();
        ctx.strokeStyle = C('--brand', 0.8); ctx.setLineDash([5, 6]); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cs.x - 14, cs.y + 12); ctx.lineTo(lx + 8, ly - 8); ctx.stroke(); ctx.setLineDash([]); }
    }

    function drawHandoff(h, t) {
      var p = ramp(t, TL.handoff, TL.handoff + 1.8); if (p <= 0) return;
      var lx = G.lamp.x, ly = G.lamp.y, tx = 337, ty = 262, u = smooth(p);
      ctx.strokeStyle = C('--accent', 0.8); ctx.lineWidth = 2.2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      var x = lx + (tx - lx) * u, y = ly + (ty - ly) * u, k = st.k;
      rr(x - 11 * k * 0.9, y - 8 * k * 0.9, 22 * k * 0.9, 16 * k * 0.9, 3); ctx.fillStyle = C('--surface'); ctx.fill(); ctx.strokeStyle = C('--accent'); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = C('--accent'); ctx.lineWidth = 1.4; for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 7 * k * 0.9, y - 3 * k * 0.9 + i * 3.6 * k * 0.9); ctx.lineTo(x + (i === 2 ? 1 : 7) * k * 0.9, y - 3 * k * 0.9 + i * 3.6 * k * 0.9); ctx.stroke(); }
    }

    function tintNight(h) {                                      // dusk over the ground only: the people, the hazard and the lamp stay crisp on top of it
      if (!h.night) return;
      if (document.documentElement.dataset.theme === 'dark') { ctx.fillStyle = C('--bg', 0.34); ctx.fillRect(0, 0, W, H); }
      else { ctx.fillStyle = C('--info', 0.22); ctx.fillRect(0, 0, W, H); ctx.fillStyle = C('--ink', 0.14); ctx.fillRect(0, 0, W, H); }
    }
    function drawSky(h) {                                        // the sun by day, a crescent moon at night
      if (!h.night) {
        ctx.strokeStyle = C('--fire-2', 0.9); ctx.fillStyle = C('--fire-1'); ctx.lineWidth = 2.2; circle(36, 440, 9); ctx.fill();
        for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(36 + Math.cos(a) * 13, 440 + Math.sin(a) * 13); ctx.lineTo(36 + Math.cos(a) * 18, 440 + Math.sin(a) * 18); ctx.stroke(); }
        return;
      }
      ctx.save(); circle(36, 440, 11); ctx.clip(); ctx.beginPath(); ctx.arc(36, 440, 11, 0, Math.PI * 2); ctx.arc(42, 436, 10, 0, Math.PI * 2); ctx.fillStyle = C('--fire-1'); ctx.fill('evenodd'); ctx.restore();
    }

    function frame(t) {
      var h = st.hz, S = st.S;
      ctx.setTransform(st.px, 0, 0, st.px, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var fadeIn = ramp(t, 0, 0.5), fadeOut = 1 - ramp(t, LOOP - 0.7, LOOP);
      drawGround(h, t);
      tintNight(h);
      drawStations(h, t);
      drawBuilding(h, t, S);
      drawHazard(h, t, S);
      drawSafeHint(h, t, S);
      drawRoutes(h, t, S);
      drawResponders(h, t);
      var safeN = drawPeople(h, t, S) || 0;
      drawKeys(h, t, S);
      drawHandoff(h, t);
      drawLamp(h, t, S);
      drawSky(h);
      var fade = Math.min(fadeIn, fadeOut);
      if (fade < 1) { ctx.fillStyle = C('--bg-2', 1 - fade); ctx.fillRect(0, 0, W, H); }
      return safeN;
    }

    /* ---- DOM wiring ---- */
    var capEl = $('#hero-cap'), whyEl = $('#hero-why'), verdictEl = $('#hero-verdict'), safeEl = $('#hero-safe'), clockEl = $('#hero-clock');
    var stepsEl = $('#hero-steps'), hzEl = $('#hero-hz'), playBtn = $('#hero-play'), scrub = $('#hero-scrub');
    var hzBtns = [], stepLis = [], listeners = [];

    function buildDom() {
      if (hzEl && !hzBtns.length) {
        HZ.forEach(function (h, i) {
          var b = el('button', 'hz-opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === 0 ? 'true' : 'false'); b.tabIndex = i === 0 ? 0 : -1;
          b.dataset.hz = h.id; b.style.setProperty('--sc', 'var(' + h.tone + ')'); setStaticHTML(b, M.icon(h.icon)); b.appendChild(el('span'));
          hzEl.appendChild(b); hzBtns.push(b);
          b.addEventListener('click', function () { selectHz(h.id, true); });
        });
        hzEl.addEventListener('keydown', function (e) {
          var keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
          if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); var j = e.key === 'Home' ? 0 : HZ.length - 1; selectHz(HZ[j].id, true); hzBtns[j].focus(); return; }
          if (!(e.key in keys)) return;
          e.preventDefault();
          var dir = keys[e.key]; if (document.documentElement.dir === 'rtl' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) dir = -dir;
          var cur = HZ.indexOf(st.hz), nxt = (cur + dir + HZ.length) % HZ.length;
          selectHz(HZ[nxt].id, true); hzBtns[nxt].focus();
        });
      }
      if (stepsEl && !stepLis.length) {
        STAGE_NAMES.forEach(function (nm, i) {
          var li = el('li'), b = el('button'); b.type = 'button'; setStaticHTML(b, M.icon(STAGE_ICONS[i])); b.appendChild(el('span'));
          li.appendChild(b); stepsEl.appendChild(li); stepLis.push(li);
          b.addEventListener('click', function () { seek(STAGE_AT[i] + 0.9, true); });
        });
      }
      if (playBtn) playBtn.removeAttribute('aria-pressed');
    }

    function captionFor(stage) {
      var h = st.hz, n = st.S.people.length, safeN = st.cache.safeN || 0;
      var sos = h.id === 'sos';
      switch (stage) {
        case 0: return L(T('يرصد حارس المنارة ' + h.sees.ar + '.', 'The lighthouse sentinel sees ' + h.sees.en + '.'));
        case 1: return L(T('المفتاح الأول: ' + h.k1.ar + '. المفتاح الثاني: ' + h.k2.ar + '. ثم يوافق المشغّل. مفتاح واحد وحده يبقى «اشتباهًا».', 'Key 1: ' + h.k1.en + '. Key 2: ' + h.k2.en + '. Then the operator approves. One key alone stays SUSPECT.'));
        case 2: return sos ? L(T('إنذار عام: يُنبَّه أقرب متطوع مدرَّب، وتُجرى مكالمة «هل أنت بخير؟» للشخص.', 'Public alert: the nearest trained volunteer is called, and the person gets an “are you OK?” call.'))
          : L(T('إنذار عام: يُوقَظ كل شخص بلغته وبالصيغة التي يحسّها (صوت، اهتزاز، وميض، بطاقة مصوّرة).', 'Public alert: every person is woken in their own language and format (sound, vibration, strobe, picture card).'));
        case 3: return L(h.route);
        case 4: return sos ? L(T('المتطوع يصل إلى الغرفة أولًا، والإسعاف في الطريق.', 'The volunteer reaches the room first, and the ambulance is on its way.'))
          : L(T('يضغط الناس «أنا بخير» ويُحصَون: ' + safeN + ' من ' + n + '.', 'People tap “I’m safe” and are counted: ' + safeN + ' of ' + n + '.'));
        default: return L(T('بطاقة التسليم تصل إلى الجهات؛ الوحدة الأسرع: ' + h.unit.ar + ' من المحطة B (محاكاة SIM).', 'The hand-off card reaches the authorities; the fastest unit: ' + h.unit.en + ' from Station B (simulation, SIM).'));
      }
    }
    function whyText() {
      var dkm = DIST_B_KM - DIST_A_KM, gain = ETA_A - ETA_B;
      return L(T('المحطة B أبعد بـ ' + M.num(dkm, 1) + ' كم لكنها أسرع بـ ' + dur(gain) + ': الطريق أمام المحطة A مزدحم (SIM).', 'Station B is ' + M.num(dkm, 1) + ' km farther but ' + dur(gain) + ' faster: the road ahead of Station A is jammed (SIM).'));
    }
    function verdictText(v) { return v === 'suspect' ? L(T('اشتباه · مفتاح واحد', 'SUSPECT · 1 key')) : v === 'confirmed' ? L(T('مؤكَّد · مفتاحان', 'CONFIRMED · 2 keys')) : v === 'public' ? L(T('إنذار عام · + موافقة الإنسان', 'PUBLIC ALERT · + human')) : ''; }

    function uiUpdate(safeN, force) {
      var t = st.t, stage = stageOf(t), h = st.hz;
      st.cache.safeN = safeN;
      var v = verdictOf(t);
      if (verdictEl && (force || st.cache.v !== v)) { verdictEl.textContent = verdictText(v); verdictEl.setAttribute('data-s', v); st.cache.v = v; }
      var sTxt;
      if (h.id === 'sos') { var rem = t >= TL.reach ? Math.max(0, ETA_B * (1 - ramp(t, TL.reach, TL.handoff))) : -1; sTxt = rem > 0.5 ? L(T('وصول الإسعاف ' + mmss(rem) + ' (SIM)', 'Ambulance ETA ' + mmss(rem) + ' (SIM)')) : rem >= 0 ? L(T('وصل الإسعاف إلى الموقع (SIM)', 'Ambulance on scene (SIM)')) : ''; }
      else sTxt = t >= TL.guide ? L(T('آمنون ', 'Safe ')) + safeN + ' / ' + st.S.people.length : '';
      if (safeEl && (force || st.cache.s !== sTxt)) { safeEl.textContent = sTxt; st.cache.s = sTxt; }
      var key = stage + '|' + (stage === 4 ? safeN : '') + '|' + h.id + '|' + M.lang();
      if (force || st.cache.cap !== key) {
        st.cache.cap = key;
        if (capEl) capEl.textContent = captionFor(stage);
        stepLis.forEach(function (li, i) { li.classList.toggle('on', i === stage); li.classList.toggle('done', i < stage); if (i === stage) li.firstChild.setAttribute('aria-current', 'step'); else li.firstChild.removeAttribute('aria-current'); });
        canvas.setAttribute('aria-label', L(T('محاكاة (SIM): ', 'Simulation (SIM): ')) + L(h.aria) + '. ' + L(T('المرحلة: ', 'Stage: ')) + L(STAGE_NAMES[stage]) + '. ' + captionFor(stage));
      }
      var why = t >= TL.reach ? whyText() : '';
      if (whyEl && (force || st.cache.why !== why)) { st.cache.why = why; whyEl.textContent = why; }
      if (scrub) { if (document.activeElement !== scrub) scrub.value = String(Math.round(t / STEP)); scrub.style.setProperty('--p', (100 * scrub.value / scrub.max).toFixed(1) + '%'); }
    }

    function render(force) {
      if (!st.px || canvas.width < 8) return;
      var safeN = frame(st.t);
      uiUpdate(safeN, force);
    }

    function labels() {
      hzBtns.forEach(function (b, i) { b.lastChild.textContent = L(HZ[i].short); b.title = L(HZ[i].long); b.setAttribute('aria-label', L(HZ[i].long)); });
      stepLis.forEach(function (li, i) { li.firstChild.lastChild.textContent = L(STAGE_NAMES[i]); li.firstChild.setAttribute('aria-label', L(STAGE_NAMES[i])); });
      if (hzEl) hzEl.setAttribute('aria-labelledby', 'hero-hz-label');
      if (stepsEl) stepsEl.setAttribute('aria-label', M.s('home.stages'));
      if (playBtn) { var lab = M.s(st.playing ? 'home.pause' : 'home.play'); playBtn.setAttribute('aria-label', lab); playBtn.title = lab; setStaticHTML(playBtn, M.icon(st.playing ? 'pause' : 'play')); }
      if (clockEl) { setStaticHTML(clockEl, M.icon(st.hz.night ? 'moon' : 'sun')); clockEl.appendChild(document.createTextNode(st.hz.hour)); }
      if (scrub) scrub.setAttribute('aria-valuetext', '');
    }

    function size() {
      var r = canvas.getBoundingClientRect(); if (r.width < 8) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width * dpr);
      if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * 3 / 4); }
      st.px = canvas.width / W; st.k = clamp(560 / r.width, 1, 1.7);
      render(true);
    }

    function selectHz(id, user) {
      var h = HZ_BY[id]; if (!h) return;
      st.hz = h; st.S = buildScene(h); st.cache = {};
      hzBtns.forEach(function (b) { var on = b.dataset.hz === id; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
      st.t = reduced() ? STILL_T : 0;
      var open = $('#hero-open'); if (open) open.setAttribute('href', 'mission.html#scenario=' + PRESET_OF[id]);
      labels(); render(true);
      listeners.forEach(function (fn) { try { fn(id, user); } catch (e) { if (window.console) console.error(e); } });
    }
    function seek(t, pause) {
      st.t = clamp(t, 0, LOOP - 0.01); if (pause) setPlaying(false, true); render(true);
    }
    function setPlaying(on, user) {
      if (user) st.userPaused = !on;
      st.playing = on; labels();
      if (capEl) capEl.setAttribute('aria-live', on ? 'off' : 'polite');
      if (on) loopStart();
    }

    var raf = 0, last = 0;
    function loopStart() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(tick); }
    function tick(now) {
      raf = 0;
      if (!st.playing || !st.visible || document.hidden || reduced()) return;
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      st.t += dt; if (st.t >= LOOP) st.t -= LOOP;
      render(false);
      raf = requestAnimationFrame(tick);
    }

    function init() {
      buildDom(); readTokens();
      st.S = buildScene(st.hz); labels();
      if (reduced()) { st.playing = false; st.t = STILL_T; }
      labels();
      if (capEl) capEl.setAttribute('aria-live', st.playing ? 'off' : 'polite');
      if (playBtn) playBtn.addEventListener('click', function () { setPlaying(!st.playing, true); });
      if (scrub) {
        scrub.max = String(Math.round(LOOP / STEP) - 1);
        scrub.addEventListener('input', function () { st.t = clamp(+scrub.value * STEP, 0, LOOP - 0.01); if (st.playing) setPlaying(false, true); render(true); });
      }
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; if (st.visible && st.playing) loopStart(); }, { threshold: 0.05 });
        io.observe(canvas);
      }
      document.addEventListener('visibilitychange', function () { if (!document.hidden && st.playing) loopStart(); });
      if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
      mq.addEventListener && mq.addEventListener('change', function () { if (reduced()) { setPlaying(false, false); st.t = STILL_T; render(true); } else if (!st.userPaused) setPlaying(true, false); });
      onTheme(function () { readTokens(); render(true); });
      onLang(function () { labels(); render(true); });
      size(); render(true);                                      // (also names the canvas while its tab is hidden)
      if (st.playing) loopStart();
    }
    return {
      init: init, selectHz: selectHz, seek: seek, repaint: function () { readTokens(); size(); render(true); }, onSelect: function (fn) { listeners.push(fn); },
      state: function () { return { hz: st.hz.id, t: st.t, stage: stageOf(st.t), playing: st.playing, stillT: STILL_T, loop: LOOP, safe: st.cache.safeN, people: st.S.people.length }; },
      model: { etaA: ETA_A, etaB: ETA_B, distA: DIST_A_KM, distB: DIST_B_KM }
    };
  })();

  /* ======================================================================= 2. COUNTERS */
  function initCounters() {
    var nodes = $$('[data-count]');
    if (!nodes.length) return;
    function fmt(n, v) { return M.num(v, +(n.getAttribute('data-decimals') || 0)); }
    function finish(n) { n.textContent = fmt(n, +n.getAttribute('data-count')); n.setAttribute('data-done', '1'); }
    function run(n) {
      if (n.getAttribute('data-done')) return;
      var to = +n.getAttribute('data-count'), t0 = performance.now(), dur = 1400;
      (function step(now) {
        var u = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - u, 3);
        n.textContent = fmt(n, to * e);
        if (u < 1) requestAnimationFrame(step); else finish(n);
      })(t0);
    }
    window.addEventListener('beforeprint', function () { nodes.forEach(finish); });
    if (reduced() || !('IntersectionObserver' in window)) { nodes.forEach(finish); return; }
    nodes.forEach(function (n) { n.textContent = fmt(n, 0); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }); }, { threshold: 0.4 });
    nodes.forEach(function (n) { io.observe(n); });
    onLang(function () { nodes.forEach(function (n) { if (n.getAttribute('data-done')) finish(n); }); });
  }

  /* ======================================================================= 3. PIPELINE */
  function initPipeline() {
    var wrap = $('#pipe-tabs'); if (!wrap) return;
    var tabs = $$('.pipe-tab', wrap), panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    wrap.setAttribute('aria-label', M.s('home.pipe'));
    function activate(i, focus) {
      tabs.forEach(function (t, j) { var on = i === j; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (panels[j]) panels[j].hidden = !on; });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { activate(i, false); });
      t.addEventListener('mouseenter', function () { if (window.matchMedia('(hover:hover)').matches) activate(i, false); });
      t.addEventListener('keydown', function (e) {
        var rtl = document.documentElement.dir === 'rtl', next = -1;
        if (e.key === 'ArrowRight') next = rtl ? i - 1 : i + 1; else if (e.key === 'ArrowLeft') next = rtl ? i + 1 : i - 1;
        else if (e.key === 'ArrowDown') next = i + 1; else if (e.key === 'ArrowUp') next = i - 1;
        else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0 || next >= tabs.length) { if (next !== -1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); } return; }
        e.preventDefault(); activate(next, true);
      });
    });
    onLang(function () { wrap.setAttribute('aria-label', M.s('home.pipe')); });
    activate(0, false);
  }

  /* ======================================================================= 4. PROOF (two keys + the human) */
  function initProof() {
    var root = $('#proof-demo'); if (!root) return;
    var keys = { thermal: $('#k-thermal'), smoke: $('#k-smoke'), vision: $('#k-vision'), human: $('#k-human') };
    var ladder = $('#proof-ladder'), verdict = $('#proof-verdict'), fLocal = $('#pf-local'), fPublic = $('#pf-public'), phone = $('#proof-phone'), chips = $$('#proof-chips [data-preset]');
    var PRESETS = { mug: { thermal: 1 }, video: { vision: 1 }, vapour: { smoke: 1 }, fire: { thermal: 1, smoke: 1, vision: 1 }, reset: {} };
    function read() { return { thermal: keys.thermal.checked, smoke: keys.smoke.checked, vision: keys.vision.checked, human: keys.human.checked }; }
    function stateOf(s) {
      var k1 = s.thermal, k2 = s.smoke || s.vision, n = (k1 ? 1 : 0) + (k2 ? 1 : 0), any = s.thermal || s.smoke || s.vision;
      if (!any) return { s: 'watch', n: 0, any: false };
      if (n < 2) return { s: 'suspect', n: n, any: true };
      return { s: s.human ? 'public' : 'confirmed', n: n, any: true };
    }
    function text(s, st) {
      if (st.s === 'watch') return T('لا مفاتيح: المنارة تراقب، ولا شيء يصل إلى أحد.', 'No keys: MANARA keeps watching and nothing reaches anyone.');
      if (st.s === 'suspect') {
        if (s.thermal && !s.smoke && !s.vision) return T('اشتباه — مفتاح الحرارة وحده. كوب ساخن يتجاوز 57 °م فيكفي لإضاءته، لكن لا دخان ولا رؤية تؤيّده، فلا إنذار عامًّا.', 'SUSPECT: the heat key alone. A hot mug crosses 57 °C and lights it, but no smoke or vision backs it up, so there is no public alert.');
        if (s.vision && !s.thermal && !s.smoke) return T('اشتباه — الرؤية ترى لهبًا (فيديو على هاتف؟) والحرارة لا ترى شيئًا. تُبقيه الحرارة عند «اشتباه» ولا يصير إنذارًا.', 'SUSPECT: vision sees a flame (a video on a phone?) but heat sees nothing. The thermal layer holds it at SUSPECT; it never becomes an alert.');
        if (s.smoke && !s.thermal && !s.vision) return T('اشتباه — مؤشر الدخان وحده. حسّاس MQ-2 يستجيب أيضًا لبخار الكحول، فمفتاح واحد لا يكفي.', 'SUSPECT: the smoke index alone. The MQ-2 also responds to alcohol vapour, so one key is not enough.');
        return T('اشتباه — حسّاسان لكن بلا مفتاح الحرارة. قاعدة الحريق تطلب حرارة + (دخان أو رؤية).', 'SUSPECT: two sensors but no heat key. The fire rule needs heat plus (smoke or vision).');
      }
      if (st.s === 'confirmed') return T('مؤكَّد — مفتاحان مستقلان (حرارة + دخان أو رؤية). المشغّل يرى الأدلة قبل أن يقرّر، ولا إنذار عامًّا بعد.', 'CONFIRMED: two independent keys (heat + smoke or vision). The operator sees the evidence before deciding; there is no public alert yet.');
      return T('إنذار عام — ثلاثة مفاتيح. تصل الرسالة إلى هواتف الأشخاص المعنيين (تمرين، بنغمة منارة الخاصة).', 'PUBLIC ALERT: three keys. The message reaches the people concerned (an exercise, with MANARA’s own tone).');
    }
    var rank = { watch: 0, suspect: 1, confirmed: 2, public: 3 };
    function render() {
      var s = read(), st = stateOf(s);
      keys.human.disabled = st.n < 2;
      if (st.n < 2 && keys.human.checked) { keys.human.checked = false; s.human = false; st = stateOf(s); }
      $$('li', ladder).forEach(function (li) { var r = rank[li.getAttribute('data-s')]; li.classList.toggle('on', r === rank[st.s]); li.classList.toggle('passed', r < rank[st.s]); });
      verdict.textContent = L(text(s, st));
      fLocal.className = 'flag' + (st.any ? ' ok' : ''); fLocal.textContent = L(st.any ? T('صفّارة الحارس المحلية: تعمل (لا تنتظر أحدًا)', 'Sentinel buzzer (local): ON, it never waits') : T('صفّارة الحارس المحلية: صامتة', 'Sentinel buzzer (local): silent'));
      fPublic.className = 'flag' + (st.s === 'public' ? ' on' : ''); fPublic.textContent = L(st.s === 'public' ? T('إنذار عام: أُرسل', 'Public alert: sent') : T('إنذار عام: لم يُرسَل', 'Public alert: not sent'));
      phone.setAttribute('data-public', st.s === 'public' ? 'true' : 'false');
      return s;
    }
    function matches(p, s) { return ['thermal', 'smoke', 'vision'].every(function (k) { return !!p[k] === !!s[k]; }) && !s.human; }
    function mark() { var s = read(); chips.forEach(function (c) { var p = PRESETS[c.getAttribute('data-preset')], on = c.getAttribute('data-preset') !== 'reset' && matches(p, s); c.setAttribute('aria-pressed', on && s.human === false ? 'true' : 'false'); }); }
    ['thermal', 'smoke', 'vision', 'human'].forEach(function (k) { keys[k].addEventListener('change', function () { render(); mark(); }); });
    chips.forEach(function (c) { c.addEventListener('click', function () {
      var p = PRESETS[c.getAttribute('data-preset')]; keys.thermal.checked = !!p.thermal; keys.smoke.checked = !!p.smoke; keys.vision.checked = !!p.vision; keys.human.checked = false; render(); mark();
    }); });
    $('#proof-chips').setAttribute('aria-label', M.s('home.proofchips'));
    onLang(function () { render(); $('#proof-chips').setAttribute('aria-label', M.s('home.proofchips')); });
    render(); mark();
  }

  /* ======================================================================= 5a. THE NATIONAL LAYER: the real map of Qatar (data scripts + js/national.js) */
  // Everything here is drawn from the bundled OpenStreetMap snapshot (outline, municipalities, places, facilities, roads); everything that moves
  // (traffic, unit positions and availability, incidents, hazard fields) comes from ManaraNational and is SIMULATED. Each page block below that uses
  // the map says so on screen. If a data script fails to load, avail is false and every national block degrades alone.
  var NATL = (function () {
    var N = window.ManaraNational, GEO = window.MANARA_QATAR_GEO, FAC = window.MANARA_QATAR_FACILITIES, RDS = window.MANARA_QATAR_ROADS;
    var avail = !!(N && GEO && FAC && RDS && window.Path2D);
    var LON0 = 51.2, LAT0 = 25.3, KY = 111.195, KX = KY * Math.cos(LAT0 * Math.PI / 180);
    var DATE = '2026-07-12';                                     // a Sunday (the week runs Sunday to Thursday)
    var X = function (lon) { return (lon - LON0) * KX; }, Y = function (lat) { return (lat - LAT0) * KY; };
    var D = null, themeVer = 0, engines = {};
    var KIND_G = { fire: 'fire', police: 'police', hospital: 'med', 'clinic-ed': 'med', ambulance: 'med' };
    var G_TOK = { fire: '--danger', police: '--info', med: '--safe' };
    var RANK = { city: 0, 'municipality-centre': 1, town: 1, industrial: 2, airport: 2, port: 2, education: 2, island: 2, suburb: 3, village: 3, quarter: 3, neighbourhood: 3, hamlet: 4, locality: 4 };

    function build() {
      if (D || !avail) return D;
      var G = RDS.decode(), E = G.e, e, i, pl, tot = 0, pls = new Array(E);
      for (e = 0; e < E; e++) { pl = G.polyline(e); pls[e] = pl; tot += pl.length >> 1; }
      var px = new Float32Array(tot), py = new Float32Array(tot), off = new Uint32Array(E + 1), bb = new Float32Array(E * 4), k = 0, grp = new Uint8Array(E), lenM = 0;
      for (e = 0; e < E; e++) {
        off[e] = k; pl = pls[e]; var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (i = 0; i < pl.length; i += 2) { var x = X(pl[i]), y = Y(pl[i + 1]); px[k] = x; py[k] = y; k++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        bb[e * 4] = x0; bb[e * 4 + 1] = y0; bb[e * 4 + 2] = x1; bb[e * 4 + 3] = y1;
        var c = G.eCls[e]; grp[e] = (G.eFlags[e] & 256) ? 5 : c <= 1 ? 0 : c === 2 ? 1 : c === 3 ? 2 : c === 4 ? 3 : 4;
        lenM += G.eLen[e];
      }
      off[E] = k; pls = null;
      var d = { G: G, E: E, px: px, py: py, off: off, bb: bb, grp: grp, km: Math.round(lenM / 1000) };
      d.edgePath = function (p, e) { var a = off[e], b = off[e + 1]; p.moveTo(px[a], py[a]); for (var j = a + 1; j < b; j++) p.lineTo(px[j], py[j]); };
      d.paths = []; for (i = 0; i < 5; i++) d.paths.push(new Path2D());
      for (e = 0; e < E; e++) if (grp[e] < 5) d.edgePath(d.paths[grp[e]], e);
      // the land and the municipality borders
      d.land = new Path2D(); GEO.outline.rings.forEach(function (r) { r.forEach(function (p, j) { var x = X(p[0]), y = Y(p[1]); if (j) d.land.lineTo(x, y); else d.land.moveTo(x, y); }); d.land.closePath(); });
      d.borders = new Path2D();
      GEO.municipalities.forEach(function (m) { m.polygons.forEach(function (poly) { poly.forEach(function (r) { r.forEach(function (p, j) { var x = X(p[0]), y = Y(p[1]); if (j) d.borders.lineTo(x, y); else d.borders.moveTo(x, y); }); d.borders.closePath(); }); }); });
      // facilities (every kind that exists in the data; hospital + emergency-tagged clinic + ambulance point share the "medical" shape)
      d.facs = FAC.map(function (f) { return { id: f.id, kind: f.kind, g: KIND_G[f.kind] || 'med', x: X(f.lon), y: Y(f.lat), lon: f.lon, lat: f.lat, name: f.name, ed: f.ed, muni: f.muni }; });
      d.places = GEO.places.map(function (p) { return { id: p.id, kind: p.kind, rank: RANK[p.kind] == null ? 4 : RANK[p.kind], x: X(p.lon), y: Y(p.lat), name: p.name, muni: p.muni }; });
      d.anchorIds = {}; Object.keys(GEO.anchors).forEach(function (a) { d.anchorIds[GEO.anchors[a]] = a; });
      d.munis = GEO.municipalities.map(function (m) { return { id: m.id, name: m.name, x: X(m.centre[0]), y: Y(m.centre[1]), area: m.areaKm2 }; });
      var b = GEO.bbox; d.box = { x0: X(b.lonMin), y0: Y(b.latMin), x1: X(b.lonMax), y1: Y(b.latMax) };
      D = d; return D;
    }

    /* ---- facts read from the data (nothing typed in) ---- */
    function counts() {
      var d = build(); if (!d) return null;
      var c = { munis: GEO.municipalities.length, places: GEO.places.length, fac: FAC.length, hosp: 0, clinic: 0, fire: 0, police: 0, amb: 0, ed: 0, roadkm: d.km, nodes: d.G.n, edges: d.E, virt: 0,
        snapshot: GEO.meta.snapshotDate, osmts: GEO.meta.osmBaseTimestamp, attribution: GEO.meta.attribution, byMuni: {} };
      FAC.forEach(function (f) {
        if (f.kind === 'hospital') c.hosp++; else if (f.kind === 'clinic-ed') c.clinic++; else if (f.kind === 'fire') c.fire++; else if (f.kind === 'police') c.police++; else if (f.kind === 'ambulance') c.amb++;
        if (f.ed === 'yes') c.ed++;
        var m = c.byMuni[f.muni] || (c.byMuni[f.muni] = { hosp: 0, police: 0, fire: 0, amb: 0 });
        if (f.kind === 'hospital' || f.kind === 'clinic-ed') m.hosp++; else if (f.kind === 'police') m.police++; else if (f.kind === 'fire') m.fire++; else m.amb++;
      });
      for (var e = 0; e < d.E; e++) if (d.G.eFlags[e] & 256) c.virt++;
      return c;
    }

    /* ---- engines: created lazily (about 0.3 s each, they share the immutable world) ---- */
    function engine(name, params) {
      if (!avail) return null;
      if (!engines[name]) engines[name] = N.create({ seed: 7, date: DATE, hour: 7.5, autoApprove: false, params: Object.assign({ unitBusyPct: 0 }, params || {}) });
      return engines[name];
    }
    var baseCache = {};
    function bases(nat) { var key = nat.opts && nat.opts.seed; if (!nat.__bases) { nat.__bases = {}; N.units(nat).forEach(function (u) { nat.__bases[u.id] = u.base; }); } return nat.__bases; }

    /* ---- routes in km space ---- */
    function mkRoute(ll) {
      var xs = [], ys = [], cum = [], len = 0, i;
      for (i = 0; i < ll.length; i++) {
        var x = X(ll[i][0]), y = Y(ll[i][1]);
        if (xs.length && Math.abs(x - xs[xs.length - 1]) < 1e-6 && Math.abs(y - ys[ys.length - 1]) < 1e-6) continue;
        if (xs.length) len += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]);
        xs.push(x); ys.push(y); cum.push(len);
      }
      return { xs: xs, ys: ys, cum: cum, len: len };
    }
    function posOn(R, p) {
      if (!R.xs.length) return [0, 0];
      var d = clamp(p, 0, 1) * R.len, i = 1;
      while (i < R.cum.length - 1 && R.cum[i] < d) i++;
      if (R.xs.length < 2) return [R.xs[0], R.ys[0]];
      var a = R.cum[i - 1], b = R.cum[i], u = b > a ? (d - a) / (b - a) : 1;
      return [R.xs[i - 1] + (R.xs[i] - R.xs[i - 1]) * u, R.ys[i - 1] + (R.ys[i] - R.ys[i - 1]) * u];
    }
    function strokeRoute(c, m, R, p0, p1) {                     // stroke the part of a route between two progress values (0..1)
      if (R.xs.length < 2 || p1 <= p0) return;
      var d0 = p0 * R.len, d1 = p1 * R.len, i, started = false;
      c.beginPath();
      for (i = 1; i < R.xs.length; i++) {
        if (R.cum[i] < d0) continue;
        var a = R.cum[i - 1], b = R.cum[i], u0 = b > a ? clamp((d0 - a) / (b - a), 0, 1) : 0, u1 = b > a ? clamp((d1 - a) / (b - a), 0, 1) : 1;
        var ax = R.xs[i - 1] + (R.xs[i] - R.xs[i - 1]) * u0, ay = R.ys[i - 1] + (R.ys[i] - R.ys[i - 1]) * u0, bx = R.xs[i - 1] + (R.xs[i] - R.xs[i - 1]) * u1, by = R.ys[i - 1] + (R.ys[i] - R.ys[i - 1]) * u1;
        if (!started) { c.moveTo(m.sx(ax), m.sy(ay)); started = true; }
        c.lineTo(m.sx(bx), m.sy(by));
        if (R.cum[i] >= d1) break;
      }
      c.stroke();
    }

    /* ---- the map canvas ---- */
    function roundRect(c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function facR(k) { return clamp(2.3 + 1.15 * Math.log(Math.max(k, 2.5) / 2.5) / Math.LN2, 2.3, 8); }
    function glyph(c, g, x, y, r, tok, alpha) {
      c.save(); c.translate(x, y);
      c.fillStyle = C(tok, alpha == null ? 1 : alpha); c.strokeStyle = C('--bg-2', 0.95); c.lineWidth = Math.max(1, r * 0.3); c.lineJoin = 'round';
      c.beginPath();
      if (g === 'police') { c.moveTo(0, -r * 1.25); c.lineTo(r * 1.1, 0); c.lineTo(0, r * 1.25); c.lineTo(-r * 1.1, 0); c.closePath(); }
      else if (g === 'fire') { c.moveTo(0, -r * 1.3); c.lineTo(r * 1.2, r * 0.95); c.lineTo(-r * 1.2, r * 0.95); c.closePath(); }
      else roundRect(c, -r * 0.95, -r * 0.95, r * 1.9, r * 1.9, r * 0.35);
      c.stroke(); c.fill();
      if (g === 'med' && r > 3.6) { c.strokeStyle = C('--bg-2'); c.lineWidth = Math.max(1, r * 0.3); c.lineCap = 'round'; c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(r * 0.5, 0); c.moveTo(0, -r * 0.5); c.lineTo(0, r * 0.5); c.stroke(); }
      c.restore();
    }
    function hazMark(c, id, x, y, r, tok, pulse) {
      c.save(); c.translate(x, y);
      c.fillStyle = C(tok, 0.2 * (1 - pulse * 0.7)); c.beginPath(); c.arc(0, 0, r * (1.5 + pulse * 0.9), 0, 6.2832); c.fill();
      c.fillStyle = C(tok); c.strokeStyle = C('--bg-2'); c.lineWidth = Math.max(1.5, r * 0.14); c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.fill(); c.stroke();
      c.strokeStyle = C('--bg'); c.fillStyle = C('--bg'); c.lineWidth = Math.max(1.4, r * 0.15); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      var s = r * 0.52;
      if (id === 'fire') { c.moveTo(0, -s * 1.15); c.bezierCurveTo(s * 1.0, -s * 0.2, s * 0.95, s * 0.95, 0, s * 1.05); c.bezierCurveTo(-s * 0.95, s * 0.95, -s * 0.9, -s * 0.1, 0, -s * 1.15); }
      else if (id === 'gas') { c.arc(-s * 0.45, s * 0.15, s * 0.5, 0, 6.2832); c.moveTo(s * 0.95, s * 0.2); c.arc(s * 0.45, s * 0.2, s * 0.5, 0, 6.2832); c.moveTo(s * 0.55, -s * 0.5); c.arc(0, -s * 0.5, s * 0.55, 0, 6.2832); }
      else if (id === 'flood') { for (var q = -1; q <= 1; q += 1) { c.moveTo(-s, q * s * 0.62); c.quadraticCurveTo(-s * 0.5, q * s * 0.62 - s * 0.38, 0, q * s * 0.62); c.quadraticCurveTo(s * 0.5, q * s * 0.62 + s * 0.38, s, q * s * 0.62); } }
      else if (id === 'dust') { c.moveTo(-s, -s * 0.6); c.lineTo(s * 0.5, -s * 0.6); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(-s, s * 0.6); c.lineTo(s * 0.2, s * 0.6); }
      else if (id === 'heat') { c.moveTo(0, -s * 1.1); c.lineTo(0, s * 0.35); c.moveTo(s * 0.45, s * 0.55); c.arc(0, s * 0.55, s * 0.45, 0, 6.2832); }
      else { c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s); }          // sos: a cross
      c.stroke(); c.restore();
    }

    function MapCanvas(canvas) {
      var m = { canvas: canvas, ctx: canvas.getContext('2d'), W: 0, H: 0, dpr: 1, cx: 0, cy: 0, k: 1, off: null, offKey: '' };
      m.resize = function () {
        var r = canvas.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return false;
        var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; m.off = null; }
        m.W = r.width; m.H = r.height; m.dpr = dpr; return true;
      };
      m.setView = function (v) { m.cx = v.cx; m.cy = v.cy; m.k = v.k; };
      m.fit = function (x0, y0, x1, y1, pad, minSpanKm) {
        var w = Math.max(x1 - x0, minSpanKm || 0) * (1 + pad), h = Math.max(y1 - y0, (minSpanKm || 0) * 0.75) * (1 + pad);
        return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.min(m.W / w, m.H / h) };
      };
      m.sx = function (x) { return m.W / 2 + (x - m.cx) * m.k; };
      m.sy = function (y) { return m.H / 2 - (y - m.cy) * m.k; };
      m.lonlat = function (sx, sy) { var x = m.cx + (sx - m.W / 2) / m.k, y = m.cy - (sy - m.H / 2) / m.k; return [LON0 + x / KX, LAT0 + y / KY]; };
      m.visible = function (x, y, pad) { var sx = m.sx(x), sy = m.sy(y); return sx > -pad && sx < m.W + pad && sy > -pad && sy < m.H + pad; };
      m.box = function () { return { x0: m.cx - m.W / 2 / m.k, x1: m.cx + m.W / 2 / m.k, y0: m.cy - m.H / 2 / m.k, y1: m.cy + m.H / 2 / m.k }; };
      // paint the static map (sea, land, borders, [a hazard field], roads) into an off-screen bitmap when the camera or the content changed, then blit it
      m.base = function (o) {
        var d = build(); if (!d || !m.W) return;
        var key = [Math.round(m.cx * 50), Math.round(m.cy * 50), Math.round(m.k * 400), m.W, m.H, m.dpr, themeVer, o.key || ''].join('|');
        if (!m.off) { m.off = document.createElement('canvas'); m.offKey = ''; }
        if (m.off.width !== canvas.width || m.off.height !== canvas.height) { m.off.width = canvas.width; m.off.height = canvas.height; m.offKey = ''; }
        if (m.offKey !== key) { paintBase(m, m.off.getContext('2d'), o, d); m.offKey = key; }
        m.ctx.setTransform(1, 0, 0, 1, 0, 0); m.ctx.drawImage(m.off, 0, 0);
        m.ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
      };
      return m;
    }
    function paintBase(m, c, o, d) {
      var k = m.k, W = m.W, H = m.H, zf = 1 + 0.5 * Math.log(clamp(k / 2.5, 1, 32)) / Math.LN2;
      c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0); c.clearRect(0, 0, W, H);
      c.fillStyle = C('--bg-2'); c.fillRect(0, 0, W, H);
      c.save(); c.setTransform(m.dpr * k, 0, 0, -m.dpr * k, m.dpr * (W / 2 - m.cx * k), m.dpr * (H / 2 + m.cy * k));
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.fillStyle = C('--surface-2'); c.fill(d.land);
      if (o.under) o.under(c, k);
      c.strokeStyle = C('--line-2'); c.lineWidth = 1.3 / k; c.stroke(d.land);
      c.setLineDash([5 / k, 4 / k]); c.strokeStyle = C('--muted', 0.5); c.lineWidth = 0.9 / k; c.stroke(d.borders); c.setLineDash([]);
      var W0 = [1.7, 1.35, 1.0, 0.75, 0.55];
      if (o.cong) {
        var bx = m.box(), px_ = 40 / k, paths = congPaths(o.cong, bx.x0 - px_, bx.y0 - px_, bx.x1 + px_, bx.y1 + px_);
        var cols = ['--safe', '--warn', '--danger', '--ink'], al = [0.5, 0.85, 0.95, 0.9];
        for (var g = 4; g >= 0; g--) for (var s = 0; s < 4; s++) {
          if (!paths[g][s]) continue;
          c.strokeStyle = C(cols[s], al[s]); c.lineWidth = W0[g] * zf * (s >= 1 ? 1.15 : 1) / k;
          if (s === 3) c.setLineDash([3 / k, 3 / k]); else c.setLineDash([]);
          c.stroke(paths[g][s]);
        }
        c.setLineDash([]);
      } else {
        var al2 = [0.46, 0.34, 0.24, 0.17, 0.12];
        for (var g2 = 4; g2 >= 0; g2--) { c.strokeStyle = C('--ink', al2[g2]); c.lineWidth = W0[g2] * zf / k; c.stroke(d.paths[g2]); }
      }
      c.restore();
    }
    function congPaths(cong, x0, y0, x1, y1) {                  // edges inside the box, bucketed by group and state (0 clear, 1 slow, 2 jammed, 3 closed)
      var d = D, out = [[], [], [], [], []], e, bb = d.bb;
      for (e = 0; e < d.E; e++) {
        var g = d.grp[e]; if (g > 4) continue;
        if (bb[e * 4 + 2] < x0 || bb[e * 4] > x1 || bb[e * 4 + 3] < y0 || bb[e * 4 + 1] > y1) continue;
        var v = cong[e], s = v <= 0 ? 3 : v < 0.4 ? 2 : v < 0.68 ? 1 : 0;
        var p = out[g][s] || (out[g][s] = new Path2D()); d.edgePath(p, e);
      }
      return out;
    }
    // names on the map, with a simple collision check; list = [{x, y, text, rank}] in km
    function drawLabels(m, c, list, maxRank, maxN) {
      var placed = [], n = 0, i, k = m.k;
      c.save(); c.font = '600 ' + (k > 12 ? 12 : 10.5) + 'px ' + FONT_H; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = M.lang() === 'ar' ? 'rtl' : 'ltr';
      list.sort(function (a, b) { return a.rank - b.rank; });
      for (i = 0; i < list.length && n < maxN; i++) {
        var p = list[i]; if (p.rank > maxRank || !p.text) continue;
        var sx = m.sx(p.x), sy = m.sy(p.y) - 9; if (sy < 8 || sy > m.H - 8) continue;
        var w = c.measureText(p.text).width + 6, r = { x0: sx - w / 2, x1: sx + w / 2, y0: sy - 8, y1: sy + 8 }, hit = false;
        if (r.x0 < 2 || r.x1 > m.W - 2) continue;
        for (var j = 0; j < placed.length; j++) { var q = placed[j]; if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) { hit = true; break; } }
        if (hit) continue; placed.push(r); n++;
        c.lineWidth = 3.2; c.strokeStyle = C('--bg-2', 0.92); c.strokeText(p.text, sx, sy); c.fillStyle = C(p.tok || '--ink-2'); c.fillText(p.text, sx, sy);
      }
      c.restore();
    }
    function placeLabels(m) {
      var d = build(), k = m.k, list = [], maxRank = k < 4 ? 1 : k < 9 ? 2 : k < 22 ? 3 : 4, bx = m.box();
      d.places.forEach(function (p) { if (p.x < bx.x0 || p.x > bx.x1 || p.y < bx.y0 || p.y > bx.y1) return; var r = d.anchorIds[p.id] ? Math.min(p.rank, 1) - 0.5 : p.rank; list.push({ x: p.x, y: p.y, text: L(p.name), rank: r }); });
      return { list: list, maxRank: maxRank + 0 };
    }
    function drawFacilities(m, c, o) {
      var d = build(), r = facR(m.k), i, f;
      for (i = 0; i < d.facs.length; i++) {
        f = d.facs[i]; if (o && o.only && !o.only(f)) continue;
        var sx = m.sx(f.x), sy = m.sy(f.y); if (sx < -10 || sx > m.W + 10 || sy < -10 || sy > m.H + 10) continue;
        glyph(c, f.g, sx, sy, r, G_TOK[f.g], (o && o.alpha) || 0.9);
      }
    }
    return { avail: avail, N: N, GEO: GEO, FAC: FAC, X: X, Y: Y, KX: KX, KY: KY, DATE: DATE, build: build, counts: counts, engine: engine, bases: bases, mkRoute: mkRoute, posOn: posOn, strokeRoute: strokeRoute,
      MapCanvas: MapCanvas, glyph: glyph, hazMark: hazMark, facR: facR, drawLabels: drawLabels, placeLabels: placeLabels, drawFacilities: drawFacilities, roundRect: roundRect,
      bump: function () { themeVer++; }, G_TOK: G_TOK, data: function () { return D; } };
  })();

  /* ======================================================================= 5b. REAL EXAMPLES: "farther but faster" on the real map (ManaraNational.findFartherButFaster) */
  // findFartherButFaster searches sampled incidents on the real map for one where the fastest unit is NOT the nearest in a straight line.
  // A full search takes about 1.5 s, which would freeze a phone, so the page runs it in small slices (a few samples each, a different seed per slice)
  // and keeps the first example whose reason is traffic. Every number shown comes out of that function; nothing is typed in.
  var EXS = (function () {
    var list = {}, cbs = [], started = false, KINDS = ['fire', 'ambulance', 'police'], HINT = { fire: 7, ambulance: 11, police: 18 };   // HINT = the seed that gave a traffic example when this was written; the search scans on if it does not
    function accept(r) { return !!r && r.reason === 'traffic' && r.gainSec >= 60; }
    function done(kind, r) { list[kind] = r; cbs.slice().forEach(function (fn) { try { fn(kind, r); } catch (e) { if (window.console) console.error(e); } }); }
    function start(nat) {
      if (started || !NATL.avail) return; started = true;
      var N = NATL.N, ki = 0, seeds, si, fallback;
      function nextKind() {
        if (ki >= KINDS.length) return;
        var kind = KINDS[ki++]; seeds = [HINT[kind]]; for (var s = 7; s < 40; s++) if (s !== HINT[kind]) seeds.push(s); si = 0; fallback = null; step(kind);
      }
      function step(kind) {
        var seed = seeds[si++], r = null;
        try { r = N.findFartherButFaster(seed, { nat: nat, times: [7.5], budget: 30, kinds: [kind], minGainSec: 60 }); } catch (e) { r = null; }
        if (r && !fallback) { fallback = r; fallback.seedUsed = seed; }
        if (accept(r) || si >= seeds.length) {
          if (accept(r)) r.seedUsed = seed; else r = fallback;
          if (r) done(kind, r);
          setTimeout(nextKind, 30);
        } else setTimeout(function () { step(kind); }, 24);
      }
      setTimeout(nextKind, 40);
    }
    return { start: start, get: function (k) { return list[k] || null; }, all: function () { return list; }, onReady: function (fn) { cbs.push(fn); }, KINDS: KINDS };
  })();

  /* ======================================================================= 5c. HERO, ALL OF QATAR: hazard → two keys → approval → the fastest unit of each type drives in over real roads */
  var UNIT_K = {                                                   // how each unit type looks on the board and the map
    fire: { name: T('سيارة إطفاء', 'Fire engine'), icon: 'fire', tone: '--danger', g: 'fire' },
    rescue: { name: T('فريق إنقاذ (الدفاع المدني)', 'Rescue team (Civil Defence)'), icon: 'alert', tone: '--danger', g: 'fire' },
    police: { name: T('دورية شرطة', 'Police patrol'), icon: 'shield', tone: '--info', g: 'police' },
    ambulance: { name: T('إسعاف', 'Ambulance'), icon: 'heart', tone: '--safe', g: 'med' },
    hospital: { name: T('مستشفى الوجهة', 'Destination hospital'), icon: 'plus', tone: '--safe', g: 'med' }
  };
  var PLUS_SVG = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
  function unitIcon(kind) { var k = UNIT_K[kind]; return k.icon === 'plus' ? PLUS_SVG : M.icon(k.icon); }
  function hourNum(s) { var p = String(s).split(':'); return (+p[0]) + (+p[1] || 0) / 60; }
  function clockText(sec) { var h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  var natHero = (function () {
    var canvas = $('#nat-canvas');
    if (!canvas || !NATL.avail) return null;
    var N = NATL.N, mc = null;
    var LOOP = { story: 26, example: 19 }, STEP = 0.25;
    var TLS = {
      story: { appear: 0.5, z0: 1.4, z1: 3.2, k1: 3.4, k2: 4.9, human: 6.3, disp: 7.0, dep: 8.4, end: 19.4, o0: 23.0, o1: 25.0, still: 22.4 },
      example: { appear: 0.4, z0: 1.0, z1: 2.6, disp: 2.8, dep: 4.0, end: 12.5, o0: 16.0, o1: 18.0, still: 14.5 }
    };
    var STAGE_AT = [0, 3.3, 6.3, 7.0, 8.4, 19.4];
    var STAGE_NAMES = [T('يرصد', 'Sense'), T('يتحقق', 'Prove'), T('موافقة', 'Approve'), T('يُرسل', 'Dispatch'), T('في الطريق', 'En route'), T('في الموقع', 'On scene')];
    var STAGE_ICONS = ['radar', 'shield', 'check', 'nav', 'route', 'pin'];
    var SPOT_ANCHOR = { fire: 'lusail', gas: 'industrial-area', dust: 'al-khor', heat: 'mesaieed', sos: 'al-wakrah' };
    var RADIUS_KM = { fire: 0.45, gas: 1.3, flood: 0.8, dust: 6, heat: 3, sos: 0.25 };
    var st = { hz: HZ[0], mode: 'story', t: 0, playing: true, userPaused: false, visible: false, tabOn: true, scenes: {}, scene: null, cache: {}, ready: false };
    var stepsEl = $('#nat-steps'), boardEl = $('#nat-board'), capEl = $('#nat-cap'), whyEl = $('#nat-why'), verdictEl = $('#nat-verdict'), tEl = $('#nat-t'), playBtn = $('#nat-play'), scrub = $('#nat-scrub'),
      exBtn = $('#nat-example'), exT = $('#nat-example-t'), loading = $('#nat-loading'), openLink = $('#nat-open');
    var stepLis = [], rowEls = [];
    var TL = function () { return TLS[st.mode]; };

    /* ---- the scene of one hazard: where, the plan from the engine, the routes ---- */
    function spotFor(hz, nat) {
      var GEO = NATL.GEO, a;
      if (hz.id === 'flood') {                                    // the underpass nearest Doha (from the road data: tunnel / underpass segments)
        var doha = GEO.place(GEO.anchors.doha), best = null, tn = N.floodState(nat, { all: true }).tunnels;
        tn.forEach(function (x) { var dd = N.haversineM(doha.lon, doha.lat, x.lon, x.lat); if (!best || dd < best.d) best = { d: dd, lon: x.lon, lat: x.lat }; });
        return best ? { lon: best.lon, lat: best.lat, label: T('نفق منخفض قرب الدوحة', 'a low underpass near Doha') } : null;
      }
      a = GEO.place(GEO.anchors[SPOT_ANCHOR[hz.id]]); return a ? { lon: a.lon, lat: a.lat, label: a.name } : null;
    }
    function buildScene(hz) {
      var key = st.mode + ':' + hz.id; if (st.scenes[key]) return st.scenes[key];
      var nat = NATL.engine('hero'), sc = null;
      if (st.mode === 'example') sc = buildExample(nat); else sc = buildStory(hz, nat);
      if (sc) st.scenes[key] = sc;
      return sc;
    }
    function units2(nat, plan, spot, t) {
      var base = NATL.bases(nat), em = N.defaults().emergencyFactor, out = [];
      plan.units.forEach(function (u) {
        var b = base[u.unitId]; if (!b) return;
        var r = N.route(nat, { lon: b.lon, lat: b.lat }, { lon: spot.lon, lat: spot.lat }, t, { em: em });
        var wd = u.whyData || {};
        out.push({ kind: u.kind, name: u.name, eta: u.etaSec, turnout: u.turnoutLeft || 0, why: u.why, far: !!wd.farButFaster, gain: wd.gainSec || 0, extra: wd.extraStraightM || 0,
          route: NATL.mkRoute(r.polyline), baseXY: [NATL.X(b.lon), NATL.Y(b.lat)], optional: !!u.optional, standby: !!u.standby });
      });
      return out;
    }
    function frame4(sc) {                                         // the camera target: the incident, every base, the hospital
      var xs = [sc.xy[0]], ys = [sc.xy[1]];
      sc.units.forEach(function (u) { xs.push(u.baseXY[0]); ys.push(u.baseXY[1]); });
      if (sc.hosp) { xs.push(sc.hosp.xy[0]); ys.push(sc.hosp.xy[1]); }
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }
    function buildStory(hz, nat) {
      var spot = spotFor(hz, nat); if (!spot) return null;
      var t = N.timeAt(nat, NATL.DATE, hourNum(hz.hour));
      var patients = (hz.id === 'sos' || hz.id === 'heat') ? { n: 1, need: 'ed' } : undefined;
      var plan = N.dispatchNational(nat, { hazard: hz.id, lon: spot.lon, lat: spot.lat, severity: 2, patients: patients }, t);
      var sc = { mode: 'story', hz: hz, spot: spot, xy: [NATL.X(spot.lon), NATL.Y(spot.lat)], t: t, units: units2(nat, plan, spot, t), hosp: null, plan: plan };
      if (plan.hospital && plan.hospital.chosen && plan.hospital.chosen.route) {
        var h = plan.hospital.chosen; sc.hosp = { name: h.name, eta: h.etaSec, route: NATL.mkRoute(h.route), xy: [NATL.X(h.lon), NATL.Y(h.lat)], ed: h.ed, note: h.edNote };
      }
      sc.maxEta = Math.max.apply(null, sc.units.map(function (u) { return u.eta; }).concat([60]));
      sc.f = (TLS.story.end - TLS.story.dep) / sc.maxEta;
      sc.box = frame4(sc); return sc;
    }
    function buildExample() {
      var ex = EXS.get('fire') || EXS.get('police') || EXS.get('ambulance'); if (!ex) return null;
      var inc = ex.incident, mk = function (o) { return { kind: ex.kind, name: o.name, eta: o.etaSec, turnout: 0, route: NATL.mkRoute(o.route || []), baseXY: [NATL.X(o.base.lon), NATL.Y(o.base.lat)], roadKm: o.roadKm, straightKm: o.straightKm }; };
      var fast = mk(ex.fastest), near = mk(ex.nearest);
      var sc = { mode: 'example', ex: ex, spot: { lon: inc.lon, lat: inc.lat, label: inc.place ? inc.place.name : T('موقع على الخريطة', 'a spot on the map') }, xy: [NATL.X(inc.lon), NATL.Y(inc.lat)], units: [fast, near], hosp: null, hz: HZ_BY.fire };
      sc.fast = fast; sc.near = near; sc.maxEta = Math.max(fast.eta, near.eta); sc.f = (TLS.example.end - TLS.example.dep) / sc.maxEta; sc.box = frame4(sc); return sc;
    }

    /* ---- camera ---- */
    function countryView() { var b = NATL.build().box; return mc.fit(b.x0, b.y0, b.x1, b.y1, 0.08, 0); }
    function targetView(sc) { var b = sc.box; return mc.fit(b.x0, b.y0, b.x1, b.y1, 0.42, 10); }
    function viewAt(t) {
      var T_ = TL(), c0 = countryView(), sc = st.scene, z;
      if (!sc) return { v: c0, z: 0 };
      var c1 = targetView(sc);
      z = smooth(ramp(t, T_.z0, T_.z1)) * (1 - smooth(ramp(t, T_.o0, T_.o1)));
      var k = Math.exp(Math.log(c0.k) + (Math.log(c1.k) - Math.log(c0.k)) * z);
      return { v: { cx: c0.cx + (c1.cx - c0.cx) * z, cy: c0.cy + (c1.cy - c0.cy) * z, k: k }, z: z };
    }
    function verdictOf(t) { var T_ = TL(); if (st.mode !== 'story') return t >= T_.disp ? 'dispatch' : ''; return t >= T_.human ? 'approved' : t >= T_.k2 ? 'confirmed' : t >= T_.k1 ? 'suspect' : ''; }
    function stageOf(t) { var s = 0; for (var i = 0; i < STAGE_AT.length; i++) if (t >= STAGE_AT[i]) s = i; return s; }
    function simSec(t) { var T_ = TL(); return st.scene ? Math.max(0, (t - T_.dep) / st.scene.f) : 0; }

    /* ---- drawing ---- */
    function drawScene(c, t, vz) {
      var sc = st.scene, T_ = TL(), m = mc, k = m.k;
      var pop = ramp(t, T_.appear, T_.appear + 0.5), pulse = reduced() ? 0.3 : (t * 1.2) % 1;
      var sx = m.sx(sc.xy[0]), sy = m.sy(sc.xy[1]), tone = sc.hz.tone;
      // the extent of the hazard (km → px, never smaller than a marker)
      var rad = Math.max(16, (RADIUS_KM[sc.hz.id] || 0.5) * k);
      if (pop > 0) { c.save(); c.setLineDash([5, 4]); c.strokeStyle = C(tone, 0.7 * pop); c.fillStyle = C(tone, 0.09 * pop); c.lineWidth = 1.5; c.beginPath(); c.arc(sx, sy, rad, 0, 6.2832); c.fill(); c.stroke(); c.restore(); }
      // hospital leg (after the units are on scene)
      var simS = simSec(t);
      if (sc.hosp && st.mode === 'story') {
        var hp = ramp(t, T_.end + 0.5, T_.end + 2.6);
        if (hp > 0) {
          c.save(); c.setLineDash([2, 6]); c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = C('--safe', 0.9); NATL.strokeRoute(c, m, sc.hosp.route, 0, hp); c.restore();
          NATL.glyph(c, 'med', m.sx(sc.hosp.xy[0]), m.sy(sc.hosp.xy[1]), NATL.facR(k) + 3, '--safe', 1);
        }
      }
      // routes and vehicles
      var ndone = 0;
      sc.units.forEach(function (u, i) {
        var kd = UNIT_K[u.kind] || UNIT_K.fire, ro = ramp(t, T_.disp, T_.dep - 0.2), start = u.turnout, p = clamp((simS - start) / Math.max(1, u.eta - start), 0, 1);
        var near = st.mode === 'example' && i === 1, tok = near ? '--muted' : kd.tone;
        if (t >= T_.disp) {
          c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
          c.setLineDash(near ? [4, 5] : [1, 7]); c.lineWidth = near ? 2.2 : 2.6; c.strokeStyle = C(tok, near ? 0.9 : 0.55); NATL.strokeRoute(c, m, u.route, 0, ro);
          c.setLineDash([]); c.lineWidth = near ? 3 : 4.2; c.strokeStyle = C('--bg-2', 0.9); NATL.strokeRoute(c, m, u.route, 0, Math.min(ro, p)); c.lineWidth = near ? 2.2 : 3.2; c.strokeStyle = C(tok, 1); NATL.strokeRoute(c, m, u.route, 0, Math.min(ro, p));
          c.restore();
        }
        // the base station
        var bx = m.sx(u.baseXY[0]), by = m.sy(u.baseXY[1]);
        if (pop >= 1 && vz > 0.02) { c.save(); c.strokeStyle = C(tok, 0.9); c.lineWidth = 1.6; c.beginPath(); c.arc(bx, by, NATL.facR(k) + 4, 0, 6.2832); c.stroke(); c.restore(); }
        // the vehicle
        if (t >= T_.dep - 0.3 || reduced() && t >= T_.disp) {
          var q = NATL.posOn(u.route, p), vx = m.sx(q[0]), vy = m.sy(q[1]);
          if (p >= 1) { var ang = (i + 0.5) / sc.units.length * 6.2832 + 0.6; vx = sx + Math.cos(ang) * (rad + 11); vy = sy + Math.sin(ang) * (rad + 11); ndone++; }
          c.save(); c.fillStyle = C('--bg-2', 0.9); c.beginPath(); c.arc(vx, vy, 10.5, 0, 6.2832); c.fill();
          NATL.glyph(c, kd.g, vx, vy, 6.2, tok, 1);
          if (p >= 1) { c.strokeStyle = C('--safe'); c.lineWidth = 2; c.beginPath(); c.arc(vx, vy, 11.5, 0, 6.2832); c.stroke(); }
          c.restore();
        }
      });
      if (pop > 0) NATL.hazMark(c, sc.hz.id, sx, sy, 10 * (0.6 + 0.4 * smooth(pop)), tone, pulse);
    }
    function render(force) {
      if (!mc || !mc.W) return;
      var t = st.t, c = mc.ctx, vz = viewAt(t);
      mc.setView(vz.v);
      mc.base({ key: 'plain' });
      c.setTransform(mc.dpr, 0, 0, mc.dpr, 0, 0);
      // municipality names in the country view
      var D = NATL.build(), za = 1 - clamp(vz.z * 2.2, 0, 1);
      if (za > 0.05) {
        c.save(); c.font = '600 10.5px ' + FONT_H; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = M.lang() === 'ar' ? 'rtl' : 'ltr';
        D.munis.forEach(function (mu) { var x = mc.sx(mu.x), y = mc.sy(mu.y); c.lineWidth = 3; c.strokeStyle = C('--bg-2', 0.85 * za); c.strokeText(L(mu.name), x, y); c.fillStyle = C('--ink-2', za); c.fillText(L(mu.name), x, y); });
        c.restore();
      }
      NATL.drawFacilities(mc, c, { alpha: 0.9 });
      var pl = NATL.placeLabels(mc); NATL.drawLabels(mc, c, pl.list, vz.z > 0.5 ? pl.maxRank : 1, vz.z > 0.5 ? 14 : 5);
      if (st.scene) drawScene(c, t, vz.z);
      uiUpdate(force);
    }

    /* ---- text and board ---- */
    function verdictText(v) { return v === 'suspect' ? L(T('اشتباه · مفتاح واحد', 'SUSPECT · 1 key')) : v === 'confirmed' ? L(T('مؤكَّد · مفتاحان', 'CONFIRMED · 2 keys')) : v === 'approved' ? L(T('موافقة المشغّل · توصية بالإرسال', 'APPROVED · dispatch recommended')) : v === 'dispatch' ? L(T('الأسرع وصولًا في ظل المرور', 'Fastest given traffic')) : ''; }
    function captionFor(stage) {
      var sc = st.scene, h = st.hz; if (!sc) return L(T('نجهّز الخريطة الحقيقية ثم يبدأ المشهد.', 'Preparing the real map, then the scene starts.'));
      var where = L(sc.spot.label);
      if (st.mode === 'example') {
        var e = sc.ex, kn = L(UNIT_K[e.kind].name);
        return L(T('مثال حقيقي قرب «' + where + '» يوم ' + e.dowName.ar + ' ' + e.clock.slice(0, 5) + ': ' + kn + ' الأسرع وصولًا ليست الأقرب بخط مستقيم. الوقت أدناه محاكى (SIM).', 'A real example near ' + where + ', ' + e.dowName.en + ' ' + e.clock.slice(0, 5) + ': the fastest ' + kn.toLowerCase() + ' is not the nearest in a straight line. The times below are simulated (SIM).'));
      }
      var nU = sc.units.length;
      switch (stage) {
        case 0: return L(T('يرصد حارس المنارة ' + h.sees.ar + ' قرب «' + where + '».', 'The lighthouse sentinel sees ' + h.sees.en + ' near ' + where + '.'));
        case 1: return L(T('المفتاح الأول: ' + h.k1.ar + '. المفتاح الثاني: ' + h.k2.ar + '. مفتاح واحد وحده يبقى «اشتباهًا».', 'Key 1: ' + h.k1.en + '. Key 2: ' + h.k2.en + '. One key alone stays “suspect”.'));
        case 2: return L(T('يضغط المشغّل «موافق»: تذهب الحزمة الموثَّقة إلى غرفة التحكم. و999 يبقى هو المرسِل.', 'The operator presses “approve”: the verified package goes to the control room. 999 stays the dispatcher.'));
        case 3: return L(T('لكل نوع تُوصي منارة بالوحدة الأسرع وصولًا في ظل المرور (' + nU + ' وحدات)، لا الأقرب مسافة.', 'For each type MANARA recommends the unit that arrives first given traffic (' + nU + ' units), not the nearest by distance.'));
        case 4: return L(T('في الطريق على الطرق الحقيقية. العدّ التنازلي لأزمنة الوصول (SIM) يُعاد حسابه والمركبة تغيّر مسارها إن أُغلق طريق.', 'En route on the real roads. The arrival countdown (SIM) is recomputed, and a unit re-routes if a road closes.'));
        default: return sc.hosp ? L(T('الوحدات في الموقع. وجهة المصاب: ' + L(sc.hosp.name) + '، بعد ' + dur(sc.hosp.eta) + ' (SIM).', 'The units are on scene. The patient’s destination: ' + L(sc.hosp.name) + ', ' + dur(sc.hosp.eta) + ' away (SIM).'))
          : L(T('الوحدات في الموقع. أول وحدة وصلت بعد ' + dur(Math.min.apply(null, sc.units.map(function (u) { return u.eta; }))) + ' (SIM).', 'The units are on scene. The first one arrived after ' + dur(Math.min.apply(null, sc.units.map(function (u) { return u.eta; }))) + ' (SIM).'));
      }
    }
    function buildBoard() {
      clear(boardEl); rowEls = [];
      var sc = st.scene; if (!sc) return;
      var rows = sc.units.map(function (u, i) { return { u: u, i: i }; });
      if (sc.hosp) rows.push({ hosp: true });
      rows.forEach(function (r) {
        var kind = r.hosp ? 'hospital' : r.u.kind, kd = UNIT_K[kind], near = st.mode === 'example' && r.u && r.i === 1;
        var li = el('li', 'nb-row'); li.style.setProperty('--sc', 'var(' + (near ? '--muted' : kd.tone) + ')');
        var ic = el('span', 'nb-ic'); setStaticHTML(ic, unitIcon(kind));
        var mid = el('span', 'nb-main'), k = el('b', 'nb-k'), n = el('span', 'nb-n'), tg = el('span', 'nb-tag');
        mid.appendChild(k); mid.appendChild(n); mid.appendChild(tg);
        var eta = el('span', 'nb-eta num');
        li.appendChild(ic); li.appendChild(mid); li.appendChild(eta); boardEl.appendChild(li);
        rowEls.push({ li: li, k: k, n: n, tg: tg, eta: eta, r: r, kind: kind, near: near });
      });
    }
    function boardUpdate(force) {
      var sc = st.scene, T_ = TL(), t = st.t, simS = simSec(t), departed = t >= T_.dep;
      rowEls.forEach(function (re) {
        var r = re.r, txt, etaTxt, tag = '', kName, sub;
        if (r.hosp) {
          kName = L(UNIT_K.hospital.name); sub = L(sc.hosp.name);
          var leg = t >= T_.end + 0.5; etaTxt = mmss(sc.hosp.eta); tag = leg ? L(T('من الموقع', 'from the scene')) : L(T('بعد وصول الوحدات', 'after the units arrive'));
          if (sc.hosp.ed === 'yes') tag += ' · ' + L(T('قسم طوارئ مؤكَّد', 'ED verified'));
        } else {
          var u = r.u, left = Math.max(0, u.eta - simS);
          if (st.mode === 'example') {
            kName = r.i === 0 ? L(T('الأسرع في ظل المرور', 'Fastest given traffic')) : L(T('الأقرب بخط مستقيم', 'Nearest in a straight line'));
            sub = L(u.name); tag = M.num(u.straightKm, 1) + ' km ' + L(T('بخط مستقيم', 'straight')) + ' · ' + M.num(u.roadKm, 1) + ' km ' + L(T('بالطريق', 'by road'));
          } else { kName = L(UNIT_K[u.kind].name); sub = L(u.name); if (u.far) tag = L(T('أبعد لكنه أسرع بـ ', 'farther but faster by ')) + dur(u.gain); else if (u.standby) tag = L(T('في حالة استعداد', 'on standby')); }
          etaTxt = !departed ? mmss(u.eta) : left <= 0.5 ? L(T('وصلت', 'arrived')) : mmss(left);
        }
        re.k.textContent = kName; re.n.textContent = sub; re.tg.textContent = tag; re.tg.hidden = !tag; re.eta.textContent = etaTxt;
        re.li.classList.toggle('done', !r.hosp && departed && Math.max(0, r.u.eta - simS) <= 0.5);
        re.li.classList.toggle('far', !!(r.u && r.u.far && st.mode === 'story') || (st.mode === 'example' && r.i === 0));
      });
    }
    function uiUpdate(force) {
      var t = st.t, sc = st.scene, stage = stageOf(t), T_ = TL(), v = verdictOf(t);
      if (verdictEl && (force || st.cache.v !== v)) { verdictEl.textContent = verdictText(v); verdictEl.setAttribute('data-s', v === 'dispatch' ? 'public' : v === 'approved' ? 'public' : v); st.cache.v = v; }
      var tt = sc && t >= T_.dep ? L(T('بعد ', 'T+ ')) + mmss(simSec(t)) + ' (SIM)' : '';
      if (tEl && (force || st.cache.tt !== tt)) { tEl.textContent = tt; st.cache.tt = tt; }
      var key = stage + '|' + st.hz.id + '|' + st.mode + '|' + M.lang() + '|' + (sc ? 1 : 0);
      if (force || st.cache.cap !== key) {
        st.cache.cap = key;
        var cap = captionFor(stage); if (capEl) capEl.textContent = cap;
        stepLis.forEach(function (li, i) { li.classList.toggle('on', i === stage); li.classList.toggle('done', i < stage); if (i === stage) li.firstChild.setAttribute('aria-current', 'step'); else li.firstChild.removeAttribute('aria-current'); });
        canvas.setAttribute('aria-label', L(T('محاكاة (SIM) على خريطة قطر: ', 'Simulation (SIM) on the map of Qatar: ')) + (st.mode === 'story' ? L(st.hz.aria) + '. ' + L(T('المرحلة: ', 'Stage: ')) + L(STAGE_NAMES[stage]) + '. ' : '') + cap);
      }
      if (sc) boardUpdate(force);
      var why = '';
      if (sc && st.mode === 'story' && t >= T_.disp) { var fb = sc.units.filter(function (u) { return u.far; })[0]; why = fb ? L(fb.why) : ''; }
      else if (sc && st.mode === 'example' && t >= T_.disp) why = L(sc.ex.why);
      if (whyEl && (force || st.cache.why !== why)) { st.cache.why = why; whyEl.textContent = why; }
      if (scrub) { if (document.activeElement !== scrub) scrub.value = String(Math.round(t / STEP)); scrub.style.setProperty('--p', (100 * scrub.value / scrub.max).toFixed(1) + '%'); }
    }

    /* ---- labels, controls, loop ---- */
    function labels() {
      stepLis.forEach(function (li, i) { li.firstChild.lastChild.textContent = L(STAGE_NAMES[i]); li.firstChild.setAttribute('aria-label', L(STAGE_NAMES[i])); });
      if (stepsEl) { stepsEl.setAttribute('aria-label', M.s('home.stages')); stepsEl.hidden = st.mode === 'example'; }
      if (boardEl) boardEl.setAttribute('aria-label', L(T('الوحدات الموصى بها (SIM)', 'Recommended units (SIM)')));
      if (playBtn) { var lab = M.s(st.playing ? 'home.pause' : 'home.play'); playBtn.setAttribute('aria-label', lab); playBtn.title = lab; setStaticHTML(playBtn, M.icon(st.playing ? 'pause' : 'play')); }
      if (exT) exT.textContent = st.mode === 'example' ? L(T('ارجع إلى القصة', 'Back to the story')) : L(T('اعرض حالة «أبعد لكنه أسرع» حقيقية', 'Show a real “farther but faster” case'));
      if (exBtn) { exBtn.setAttribute('aria-pressed', st.mode === 'example' ? 'true' : 'false'); exBtn.disabled = !EXS.get('fire') && !EXS.get('police') && !EXS.get('ambulance'); exBtn.title = exBtn.disabled ? L(T('يُحسب المثال الحقيقي في الخلفية…', 'The real example is being computed in the background…')) : ''; }
    }
    function selectHz(id) {
      var h = HZ_BY[id]; if (!h) return; st.hz = h;
      st.scene = st.ready ? buildScene(h) : null; st.cache = {}; st.t = reduced() ? TL().still : 0;
      buildBoard(); labels(); render(true);
      if (st.playing) loopStart();
    }
    function setMode(mode) {
      if (mode === st.mode) return;
      if (mode === 'example' && !(EXS.get('fire') || EXS.get('police') || EXS.get('ambulance'))) return;
      st.mode = mode; st.scene = buildScene(st.hz); st.cache = {}; st.t = reduced() ? TL().still : 0;
      if (scrub) scrub.max = String(Math.round(LOOP[mode] / STEP) - 1);
      buildBoard(); labels(); render(true); if (st.playing) loopStart();
    }
    function seek(t, pause) { st.t = clamp(t, 0, LOOP[st.mode] - 0.01); if (pause) setPlaying(false, true); render(true); }
    function setPlaying(on, user) { if (user) st.userPaused = !on; st.playing = on; labels(); if (capEl) capEl.setAttribute('aria-live', on ? 'off' : 'polite'); if (on) loopStart(); }
    var raf = 0, last = 0;
    function loopStart() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(tick); }
    function tick(now) {
      raf = 0; if (!st.playing || !st.visible || document.hidden || reduced()) return;
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      st.t += dt; if (st.t >= LOOP[st.mode]) st.t -= LOOP[st.mode];
      render(false); raf = requestAnimationFrame(tick);
    }
    function size() { if (!mc) return; if (mc.resize()) render(true); }
    function onReady() {                                           // the engine is built: the first scene can be computed
      st.ready = true; st.scene = buildScene(st.hz); st.t = reduced() ? TL().still : 0; st.cache = {};
      if (loading) loading.hidden = true; canvas.removeAttribute('aria-busy');
      buildBoard(); labels(); render(true); if (st.playing) loopStart();
    }
    function init() {
      mc = NATL.MapCanvas(canvas); NATL.build(); readTokens();
      if (stepsEl && !stepLis.length) STAGE_NAMES.forEach(function (nm, i) {
        var li = el('li'), b = el('button'); b.type = 'button'; setStaticHTML(b, M.icon(STAGE_ICONS[i])); b.appendChild(el('span')); li.appendChild(b); stepsEl.appendChild(li); stepLis.push(li);
        b.addEventListener('click', function () { seek(STAGE_AT[i] + 0.7, true); });
      });
      canvas.setAttribute('aria-busy', 'true');
      if (reduced()) st.playing = false;
      labels(); if (capEl) capEl.setAttribute('aria-live', st.playing ? 'off' : 'polite');
      if (playBtn) playBtn.addEventListener('click', function () { setPlaying(!st.playing, true); });
      if (scrub) { scrub.max = String(Math.round(LOOP.story / STEP) - 1); scrub.addEventListener('input', function () { st.t = clamp(+scrub.value * STEP, 0, LOOP[st.mode] - 0.01); if (st.playing) setPlaying(false, true); render(true); }); }
      if (exBtn) exBtn.addEventListener('click', function () { setMode(st.mode === 'example' ? 'story' : 'example'); });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; if (st.visible) { size(); if (st.playing) loopStart(); } }, { threshold: 0.05 }).observe(canvas);
      else st.visible = true;
      document.addEventListener('visibilitychange', function () { if (!document.hidden && st.playing) loopStart(); });
      if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
      mq.addEventListener && mq.addEventListener('change', function () { if (reduced()) { setPlaying(false, false); st.t = TL().still; render(true); } else if (!st.userPaused) setPlaying(true, false); });
      onTheme(function () { readTokens(); NATL.bump(); render(true); });
      onLang(function () { labels(); st.cache = {}; render(true); });
      EXS.onReady(function () { labels(); });
      size();
      // the engine takes about 0.3 s to build: start it after the first paint so the page never waits for it
      var boot = function () { try { var nat = NATL.engine('hero'); onReady(); EXS.start(nat); } catch (e) { if (window.console) console.error(e); if (loading) loading.hidden = true; } };
      if ('requestIdleCallback' in window) requestIdleCallback(function () { setTimeout(boot, 30); }, { timeout: 900 }); else setTimeout(boot, 250);
    }
    return {
      init: init, selectHz: selectHz, setMode: setMode, seek: seek, repaint: function () { readTokens(); NATL.bump(); size(); render(true); },
      state: function () { var sc = st.scene; return { hz: st.hz.id, mode: st.mode, t: st.t, stage: stageOf(st.t), playing: st.playing, stillT: TL().still, loop: LOOP[st.mode], ready: st.ready, units: sc ? sc.units.map(function (u) { return { kind: u.kind, eta: u.eta, far: !!u.far }; }) : [], hosp: !!(sc && sc.hosp), spot: sc ? sc.spot : null, example: st.mode === 'example' && sc ? { kind: sc.ex.kind, gain: sc.ex.gainSec, fast: sc.fast.eta, near: sc.near.eta } : null }; }
    };
  })();

  /* ======================================================================= 5d. THE FASTEST RESPONDER on the real map (ManaraNational: Dijkstra over the OSM road graph, simulated traffic) */
  var fast = (function () {
    var canvas = $('#fast-canvas'); if (!canvas || !NATL.avail) return null;
    var N = NATL.N, mc = null, nat = null, ready = false, active = false;
    var KINDS = [
      { k: 'fire', name: T('إطفاء وإنقاذ', 'Fire & rescue'), tone: '--danger', icon: 'fire' },
      { k: 'police', name: T('شرطة', 'Police'), tone: '--info', icon: 'shield' },
      { k: 'ambulance', name: T('إسعاف ومستشفى', 'Ambulance & hospital'), tone: '--safe', icon: 'plus' }
    ];
    var S = { ex: 'fire', hour: 7.5, load: 1, trauma: false, jam: {}, focus: 'fire', res: null, ver: 0, cong: null, view: null, viewFor: '', roads: {}, sig: '', loadSet: null };
    var results = $('#fast-results'), live = $('#fast-live'), loading = $('#fast-loading'), liveTimer = 0, routeCache = {};
    var jamNames = {};
    var FACTOR_JAM = 0.12;

    function incident() { var ex = EXS.get(S.ex); return ex ? ex.incident : null; }
    function compute() {
      var ex = EXS.get(S.ex); if (!ex || !nat) return null;
      var t = N.timeAt(nat, NATL.DATE, S.hour), inc = ex.incident;
      var pA = N.dispatchNational(nat, { hazard: 'fire', lon: inc.lon, lat: inc.lat, severity: 2 }, t);
      var pB = N.dispatchNational(nat, { hazard: 'sos', lon: inc.lon, lat: inc.lat, severity: 2, patients: { n: 1, need: S.trauma ? 'trauma' : 'ed' } }, t);
      var first = function (p, k) { return p.units.filter(function (u) { return u.kind === k; })[0] || null; };
      return { t: t, ex: ex, inc: inc, pick: { fire: first(pA, 'fire'), police: first(pA, 'police'), ambulance: first(pB, 'ambulance') }, hosp: pB.hospital && pB.hospital.chosen || null, hospFits: !pB.hospital || pB.hospital.chosen && pB.hospital.chosen.fits !== false };
    }
    function routeOf(unitId, res) {
      var key = unitId + '|' + res.t + '|' + S.load + '|' + S.ver, b = NATL.bases(nat)[unitId]; if (!b) return null;
      if (!routeCache[key]) { var r = N.route(nat, { lon: b.lon, lat: b.lat }, { lon: res.inc.lon, lat: res.inc.lat }, res.t, { em: N.defaults().emergencyFactor }); routeCache = {}; routeCache[key] = { R: NATL.mkRoute(r.polyline), b: [NATL.X(b.lon), NATL.Y(b.lat)] }; }
      return routeCache[key];
    }
    function baseOf(unitId) { var b = NATL.bases(nat)[unitId]; return b ? [NATL.X(b.lon), NATL.Y(b.lat)] : null; }

    /* ---- drawing ---- */
    function fitView(res) {
      var xs = [NATL.X(res.inc.lon)], ys = [NATL.Y(res.inc.lat)];
      KINDS.forEach(function (kd) { var u = res.pick[kd.k]; if (!u) return; var b = baseOf(u.unitId); if (b) { xs.push(b[0]); ys.push(b[1]); } var n = u.nearestByStraight && baseOf(u.nearestByStraight.unitId); if (n) { xs.push(n[0]); ys.push(n[1]); } });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      return mc.fit(x0, y0, x1, y1, 0.3, 9);
    }
    function tagAt(c, x, y, text, tok) {
      c.save(); c.font = '700 11px ' + FONT_M; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
      var w = c.measureText(text).width + 10, h = 17, px = clamp(x, w / 2 + 2, mc.W - w / 2 - 2), py = clamp(y, h / 2 + 2, mc.H - h / 2 - 2);
      c.fillStyle = C('--bg', 0.92); c.strokeStyle = C(tok, 0.95); c.lineWidth = 1.4; c.beginPath(); NATL.roundRect(c, px - w / 2, py - h / 2, w, h, 8); c.fill(); c.stroke();
      c.fillStyle = C('--head'); c.fillText(text, px, py + 0.5); c.restore();
    }
    function draw() {
      var res = S.res; if (!mc || !mc.W || !res) return;
      if (S.viewFor !== S.ex + '|' + mc.W) { S.view = fitView(res); S.viewFor = S.ex + '|' + mc.W; }
      mc.setView(S.view); mc.base({ key: 'cong' + S.ver, cong: S.cong });
      var c = mc.ctx, k = mc.k; c.setTransform(mc.dpr, 0, 0, mc.dpr, 0, 0);
      // roads the visitor jammed or closed
      Object.keys(S.jam).forEach(function (e) {
        var st = S.jam[e]; if (!st) return;
        var pl = N.polyline(nat, +e); if (pl.length < 2) return;
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = C(st === 1 ? '--danger' : '--ink', 0.95); if (st === 2) c.setLineDash([7, 5]);
        c.beginPath(); pl.forEach(function (p, i) { var x = mc.sx(NATL.X(p[0])), y = mc.sy(NATL.Y(p[1])); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
        var mid = pl[pl.length >> 1], mx = mc.sx(NATL.X(mid[0])), my = mc.sy(NATL.Y(mid[1]));
        c.fillStyle = C('--bg'); c.strokeStyle = C(st === 1 ? '--danger' : '--ink'); c.lineWidth = 2; c.beginPath(); c.arc(mx, my, 8, 0, 6.2832); c.fill(); c.stroke();
        c.beginPath(); if (st === 2) { c.moveTo(mx - 3.5, my - 3.5); c.lineTo(mx + 3.5, my + 3.5); c.moveTo(mx + 3.5, my - 3.5); c.lineTo(mx - 3.5, my + 3.5); } else { c.moveTo(mx - 4, my); c.lineTo(mx + 4, my); } c.stroke(); c.restore();
      });
      NATL.drawFacilities(mc, c, { alpha: 0.55 });
      var pl2 = NATL.placeLabels(mc); NATL.drawLabels(mc, c, pl2.list, 3, 10);
      // the focused kind: the fastest route (solid) and the nearest-in-a-straight-line route (dotted)
      var u = res.pick[S.focus];
      if (u) {
        var near = u.nearestByStraight && u.nearestByStraight.unitId !== u.unitId ? u.nearestByStraight : null, kd = KINDS.filter(function (q) { return q.k === S.focus; })[0];
        if (near) { var rn = routeOf(near.unitId, res); if (rn) { c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([2, 6]); c.lineWidth = 3.4; c.strokeStyle = C('--ink', 0.85); NATL.strokeRoute(c, mc, rn.R, 0, 1); c.restore(); } }
        var rf = routeOf(u.unitId, res);
        if (rf) { c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = C('--bg-2', 0.9); NATL.strokeRoute(c, mc, rf.R, 0, 1); c.lineWidth = 4.2; c.strokeStyle = C('--accent'); NATL.strokeRoute(c, mc, rf.R, 0, 1); c.restore(); }
        if (near) { var bn = baseOf(near.unitId); if (bn) { NATL.glyph(c, UNIT_K[u.kind].g, mc.sx(bn[0]), mc.sy(bn[1]), NATL.facR(k) + 3, '--muted', 1); tagAt(c, mc.sx(bn[0]), mc.sy(bn[1]) - 18, mmss(near.etaSec), '--muted'); } }
      }
      KINDS.forEach(function (kd) {
        var q = res.pick[kd.k]; if (!q) return; var b = baseOf(q.unitId); if (!b) return;
        var x = mc.sx(b[0]), y = mc.sy(b[1]);
        c.save(); c.strokeStyle = C(kd.tone); c.lineWidth = kd.k === S.focus ? 3 : 2; c.beginPath(); c.arc(x, y, NATL.facR(k) + (kd.k === S.focus ? 7 : 5), 0, 6.2832); c.stroke(); c.restore();
        NATL.glyph(c, UNIT_K[q.kind].g, x, y, NATL.facR(k) + 3, kd.tone, 1);
        tagAt(c, x, y - 20, mmss(q.etaSec), kd.tone);
      });
      NATL.hazMark(c, 'sos', mc.sx(NATL.X(res.inc.lon)), mc.sy(NATL.Y(res.inc.lat)), 11, '--danger', reduced() ? 0.3 : (performance.now() / 1100) % 1);
    }

    /* ---- the decision cards ---- */
    function spoken(sec) { return dur(sec) + ' (SIM)'; }
    function bar(cls, v, max, txt) {
      var r = el('div', 'fr-bar ' + cls), i = el('i'); i.style.setProperty('--v', (100 * Math.min(1, v / Math.max(1, max))).toFixed(1) + '%'); r.appendChild(i); r.appendChild(el('span', 'num', txt)); return r;
    }
    function renderCards(res) {
      clear(results); results.setAttribute('aria-label', L(T('الوحدات الموصى بها (SIM)', 'Recommended units (SIM)')));
      var sig = [];
      KINDS.forEach(function (kd) {
        var u = res.pick[kd.k]; if (!u) return;
        var wd = u.whyData || {}, near = u.nearestByStraight, same = !near || near.unitId === u.unitId;
        var b = el('button', 'fr-card'); b.type = 'button'; b.setAttribute('aria-pressed', S.focus === kd.k ? 'true' : 'false'); b.style.setProperty('--sc', 'var(' + kd.tone + ')'); b.dataset.pick = kd.k; b.dataset.unit = u.unitId; b.dataset.eta = String(Math.round(u.etaSec));
        var ic = el('span', 'fr-ic'); setStaticHTML(ic, kd.icon === 'plus' ? PLUS_SVG : M.icon(kd.icon));
        var mid = el('span'); mid.appendChild(el('span', 'fr-k', L(kd.name) + (kd.k === 'ambulance' && S.trauma ? ' · ' + L(T('يحتاج مركز إصابات', 'needs trauma centre')) : ''))); mid.appendChild(el('div', 'fr-name', L(u.name)));
        var eta = el('span', 'fr-eta num'); eta.appendChild(el('span', null, mmss(u.etaSec))).setAttribute('aria-hidden', 'true'); eta.appendChild(el('span', 'sr-only', spoken(u.etaSec))); eta.appendChild(el('small', null, 'SIM · ' + M.num(u.distM / 1000, 1) + ' km'));
        b.appendChild(ic); b.appendChild(mid); b.appendChild(eta);
        var wy = el('p', 'fr-why');
        if (wd.farButFaster) wy.appendChild(el('span', 'tag safe', L(T('أبعد لكنه أسرع', 'farther but faster'))));
        else if (same) wy.appendChild(el('span', 'tag', L(T('الأقرب هو الأسرع', 'nearest = fastest'))));
        wy.appendChild(document.createTextNode(L(u.why))); b.appendChild(wy);
        if (!same && near) {                                      // the straight-line nearest unit against the fastest one
          var mx = Math.max(u.etaSec, near.etaSec), bars = el('div', 'fr-bars');
          bars.appendChild(el('span', 'fr-bl', L(T('الأقرب بخط مستقيم', 'Nearest in a straight line')) + ' · ' + M.num(near.straightM / 1000, 1) + ' km')); bars.appendChild(bar('nr', near.etaSec, mx, mmss(near.etaSec)));
          bars.appendChild(el('span', 'fr-bl', L(T('الأسرع في ظل المرور', 'Fastest given traffic')) + ' · ' + M.num(u.straightM / 1000, 1) + ' km')); bars.appendChild(bar('fa', u.etaSec, mx, mmss(u.etaSec)));
          b.appendChild(bars);
        }
        if (kd.k === 'ambulance') {
          var h = res.hosp, hl = el('p', 'fr-hosp');
          if (h && res.hospFits) hl.textContent = L(T('المستشفى: ', 'Hospital: ')) + L(h.name) + ' · ' + L(T('بعد ', 'in ')) + dur(h.etaSec) + ' (SIM) · ' + (h.ed === 'yes' ? L(T('قسم طوارئ مؤكَّد', 'ED verified')) : L(T('الطوارئ غير مؤكَّدة (افتراض)', 'ED not verified (assumed)'))) + (h.assumed ? ' · ' + L(T('افتراض', 'assumed')) : '');
          else hl.textContent = L(T('لا يوجد مستشفى مناسب في البيانات لهذا النوع من المصابين.', 'No suitable hospital in the data for this kind of patient.'));
          b.appendChild(hl);
        }
        b.addEventListener('click', function () { S.focus = kd.k; refresh(false, true); });
        results.appendChild(b); sig.push(kd.k + ':' + u.unitId.slice(-10));
      });
      return sig.join('|');
    }
    function renderFacts(res) {
      var h = $('#fast-facts-h'), body = $('#fast-facts-body'); if (!h || !body) return; clear(body);
      var kd = KINDS.filter(function (q) { return q.k === S.focus; })[0], u = res.pick[S.focus];
      h.textContent = L(T('ماذا وجد المحرك: ', 'What the engine found: ')) + L(kd.name);
      if (!u) { body.appendChild(el('p', 'small muted', L(T('لا وحدة متاحة.', 'No unit is available.')))); return; }
      var wd = u.whyData || {}, ch = wd.chosen || {}, nr = wd.nearestByStraight || {}, ex = res.ex;
      var tb = el('table', 'table small facts'); var cap = el('caption', 'sr-only', h.textContent); tb.appendChild(cap);
      var hd = el('tr'); ['', L(T('الأسرع', 'Fastest')), L(T('الأقرب بخط مستقيم', 'Nearest (straight line)'))].forEach(function (x) { hd.appendChild(el('th', null, x)); }); var th = el('thead'); th.appendChild(hd); tb.appendChild(th);
      var tbd = el('tbody'), same = !u.nearestByStraight || u.nearestByStraight.unitId === u.unitId;
      function row(lab, a, b2, txt) { var tr = el('tr'); tr.appendChild(el('th', null, lab)); tr.appendChild(el('td', txt ? '' : 'num', a)); tr.appendChild(el('td', txt ? '' : 'num', b2)); tbd.appendChild(tr); }
      row(L(T('الوحدة', 'Unit')), L(u.name), same ? L(T('هي نفسها', 'the same unit')) : L(u.nearestByStraight.name), true);
      row(L(T('وصول (SIM)', 'ETA (SIM)')), mmss(ch.etaSec || u.etaSec), same ? '·' : mmss(nr.etaSec));
      row(L(T('بخط مستقيم', 'Straight line')), M.num((ch.straightM || u.straightM) / 1000, 1) + ' km', same ? '·' : M.num(nr.straightM / 1000, 1) + ' km');
      row(L(T('بالطريق', 'By road')), M.num((ch.roadM || u.distM) / 1000, 1) + ' km', same ? '·' : M.num(nr.roadM / 1000, 1) + ' km');
      row(L(T('مقاطع بطيئة', 'Slow segments')), String(ch.congestedSegments != null ? ch.congestedSegments : '·'), same ? '·' : String(nr.congestedSegments != null ? nr.congestedSegments : '·'));
      tb.appendChild(tbd); var tw = el('div', 'table-wrap'); tw.appendChild(tb); body.appendChild(tw);
      var p = el('p', 'small muted'); p.textContent = L(T('الوحدة تنطلق بعد التجهيز، ثم تقطع الطريق وتصل إلى الموقع. زمن السير الحر للأسرع: ', 'The unit turns out, drives, and covers the last stretch. The free-flow time of the fastest: ')) + mmss(u.freeEtaSec || 0) + L(T(' (بلا ازدحام).', ' (no traffic).'));
      body.appendChild(p);
      var q = el('p', 'small muted'); q.textContent = L(T('المثال: ' + (ex.incident.place ? L(ex.incident.place.name) + '، ' : '') + ex.dowName.ar + ' ' + ex.clock.slice(0, 5) + '، وُجد بـ findFartherButFaster. ', 'The example: ' + (ex.incident.place ? L(ex.incident.place.name) + ', ' : '') + ex.dowName.en + ' ' + ex.clock.slice(0, 5) + ', found by findFartherButFaster. ')) + L(T('الأرقام محاكاة (SIM) على خريطة حقيقية.', 'The numbers are simulated (SIM) on a real map.'));
      body.appendChild(q);
    }
    function stName(s) { return s === 2 ? L(T('مغلق', 'closed')) : s === 1 ? L(T('مزدحم', 'jammed')) : L(T('عادي', 'normal')); }
    function renderRoads(res) {
      var ul = $('#fast-roads'); if (!ul) return; clear(ul);
      var seen = {}, list = [], u = res.pick[S.focus];
      function add(e, name, cong) { if (e == null || seen[e]) return; seen[e] = 1; jamNames[e] = name || jamNames[e]; list.push({ e: e, name: jamNames[e] || { ar: 'طريق', en: 'Road' }, cong: cong }); }
      if (u && u.whyData) { ((u.whyData.chosen || {}).top || []).forEach(function (r) { add(r.edge, r.name, r.cong); }); ((u.whyData.nearestByStraight || {}).top || []).forEach(function (r) { add(r.edge, r.name, r.cong); }); }
      Object.keys(S.jam).forEach(function (e) { if (S.jam[e]) add(+e, null, null); });
      list.slice(0, 8).forEach(function (r) {
        var li = el('li'), b = el('button', 'road-btn'); b.type = 'button'; b.dataset.edge = String(r.e); var st = S.jam[r.e] || 0;
        b.setAttribute('aria-pressed', st ? 'true' : 'false'); b.dataset.state = String(st);
        b.appendChild(el('b', null, L(r.name))); b.appendChild(el('span', 'rs', stName(st))); b.setAttribute('aria-label', L(r.name) + ': ' + stName(st) + '. ' + L(T('اضغط ليتبدّل: عادي، مزدحم، مغلق.', 'Press to change: normal, jammed, closed.')));
        b.addEventListener('click', function () { cycle(r.e, r.name); });
        li.appendChild(b); ul.appendChild(li);
      });
      if (!list.length) ul.appendChild(el('li', 'small muted', L(T('لا طرق مذكورة بعد.', 'No roads listed yet.'))));
    }

    /* ---- state ---- */
    function applyJam(e, st) {
      if (st === 0) { N.openRoad(nat, e); N.unjamRoad(nat, e); }
      else if (st === 1) { N.openRoad(nat, e); N.jamRoad(nat, e, FACTOR_JAM); }
      else { N.closeRoad(nat, e); }
    }
    function cycle(e, name) {
      if (!ready) return; var st = ((S.jam[e] || 0) + 1) % 3; if (name) jamNames[e] = name; S.jam[e] = st; applyJam(e, st); if (!st) delete S.jam[e];
      refresh(false, false); announceRoad(e, st);
    }
    function announceRoad(e, st) { if (live) live.textContent = L(jamNames[e] || { ar: 'الطريق', en: 'The road' }) + ': ' + stName(st) + '. ' + summary(); }
    function summary() { var r = S.res; if (!r) return ''; return KINDS.map(function (kd) { var u = r.pick[kd.k]; return u ? L(UNIT_K[u.kind].name) + ' ' + spoken(u.etaSec) : ''; }).filter(Boolean).join('; '); }
    function refresh(announce, keepRoads) {
      if (!ready) return;
      if (S.loadSet !== S.load) { N.setParam(nat, 'trafficLoad', S.load); S.loadSet = S.load; }
      var res = compute(); if (!res) return;
      S.res = res; S.cong = N.congestionMap(nat, res.t); S.ver++;
      if (!res.pick[S.focus]) S.focus = KINDS.filter(function (kd) { return res.pick[kd.k]; }).map(function (kd) { return kd.k; })[0] || 'fire';
      var sig = renderCards(res); renderFacts(res); renderRoads(res); draw();
      canvas.setAttribute('aria-label', L(T('خريطة طرق قطر الحقيقية (SIM): ', 'Real road map of Qatar (SIM): ')) + L(T('انقر طريقًا ليزدحم أو يُغلق ثم يعود. ', 'click a road to jam it, close it, then reopen it. ')) + summary());
      var lv = $('#fast-load-v'); if (lv) lv.textContent = '×' + S.load.toFixed(1);
      var fullSig = [S.ex, S.hour, S.load, S.trauma, sig].join('/');
      if (fullSig !== S.sig) { S.sig = fullSig; if (announce !== 'silent' && announce !== false && live) { clearTimeout(liveTimer); liveTimer = setTimeout(function () { live.textContent = L(T('الوحدات الموصى بها: ', 'Recommended units: ')) + summary(); }, 250); } }
    }
    function buildChips() {
      var host = $('#fast-ex'); if (!host) return; clear(host);
      EXS.KINDS.forEach(function (k) {
        var ex = EXS.get(k), b = el('button', 'chip'); b.type = 'button'; b.dataset.ex = k; b.setAttribute('aria-pressed', S.ex === k ? 'true' : 'false');
        var name = L(k === 'ambulance' ? T('إسعاف', 'Ambulance') : k === 'fire' ? T('إطفاء', 'Fire') : T('شرطة', 'Police'));
        b.textContent = name + (ex && ex.incident.place ? ' · ' + L(ex.incident.place.name) : ex ? '' : ' …'); b.disabled = !ex;
        b.addEventListener('click', function () { S.ex = k; S.focus = k === 'ambulance' ? 'ambulance' : k; S.viewFor = ''; Object.keys(S.jam).forEach(function (e) { applyJam(+e, 0); }); S.jam = {}; buildChips(); refresh(true, false); });
        host.appendChild(b);
      });
    }
    function activate() {
      if (active) return; active = true; if (loading) loading.hidden = false;
      setTimeout(function () {
        try { nat = NATL.engine('fast'); EXS.start(NATL.engine('hero')); } catch (e) { if (window.console) console.error(e); return; }
        function go() { if (ready || !EXS.get(S.ex)) { buildChips(); return; } ready = true; if (loading) loading.hidden = true; canvas.removeAttribute('aria-busy'); buildChips(); refresh('silent', false); }
        EXS.onReady(function () { if (!EXS.get(S.ex) && EXS.get('fire')) S.ex = 'fire'; go(); });
        go();
      }, 40);
    }
    function init() {
      mc = NATL.MapCanvas(canvas); NATL.build(); readTokens(); canvas.setAttribute('aria-busy', 'true'); canvas.setAttribute('role', 'group');
      canvas.setAttribute('aria-label', L(T('خريطة طرق قطر الحقيقية (SIM): تُحمَّل…', 'Real road map of Qatar (SIM): loading…')));
      buildChips();
      var slider = $('#fast-load'), tr = $('#fast-trauma');
      function fill() { slider.style.setProperty('--p', (slider.value / 2) + '%'); }
      slider.addEventListener('input', function () { S.load = +slider.value / 100; fill(); refresh(false, false); });
      fill();
      $$('#fast-time [data-hour]').forEach(function (b) { b.addEventListener('click', function () { S.hour = +b.getAttribute('data-hour'); $$('#fast-time [data-hour]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); refresh(true, false); }); });
      tr.addEventListener('change', function () { S.trauma = tr.checked; refresh(false, false); });
      $('#fast-reset').addEventListener('click', function () { if (!ready) return; Object.keys(S.jam).forEach(function (e) { applyJam(+e, 0); }); S.jam = {}; refresh(false, false); if (live) live.textContent = L(T('أُعيدت الطرق: ', 'Roads reset: ')) + summary(); });
      canvas.addEventListener('click', function (ev) {
        if (!ready || !mc.W) return; var r = canvas.getBoundingClientRect(), ll = mc.lonlat(ev.clientX - r.left, ev.clientY - r.top);
        var maxM = clamp(16 * 1000 / mc.k, 120, 3000), hit = N.edgeAt(nat, ll[0], ll[1], maxM);
        if (hit) cycle(hit.edge, hit.info && hit.info.name);
      });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) activate(); }, { rootMargin: '500px 0px' }).observe(canvas); else activate();
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (mc.resize()) draw(); }).observe(canvas); else window.addEventListener('resize', function () { if (mc.resize()) draw(); });
      onTheme(function () { readTokens(); NATL.bump(); draw(); });
      onLang(function () { buildChips(); if (ready) refresh('silent', false); });
    }
    return {
      init: init, activate: activate,
      setLoad: function (l) { S.load = l; var s = $('#fast-load'); if (s) s.value = String(Math.round(l * 100)); refresh('silent', false); },
      setHour: function (h) { S.hour = h; refresh('silent', false); },
      setExample: function (k) { S.ex = k; S.focus = k; S.viewFor = ''; buildChips(); refresh('silent', false); },
      setTrauma: function (v) { S.trauma = !!v; refresh('silent', false); },
      jam: function (e, st) { if (!ready) return; S.jam[e] = st; applyJam(e, st); if (!st) delete S.jam[e]; refresh('silent', false); },
      cycle: cycle, focus: function (k) { S.focus = k; refresh('silent', true); },
      state: function () {
        var r = S.res, picks = {};
        if (r) KINDS.forEach(function (kd) { var u = r.pick[kd.k]; picks[kd.k] = u ? { unit: u.unitId, eta: u.etaSec, far: !!(u.whyData && u.whyData.farButFaster), gain: u.whyData ? u.whyData.gainSec : 0, nearest: u.nearestByStraight ? u.nearestByStraight.unitId : null, nearestEta: u.nearestByStraight ? u.nearestByStraight.etaSec : null, runner: u.runnerUp ? u.runnerUp.unitId : null } : null; });
        return { ready: ready, ex: S.ex, hour: S.hour, load: S.load, trauma: S.trauma, jam: Object.assign({}, S.jam), focus: S.focus, picks: picks, hosp: r && r.hosp ? { name: r.hosp.name, eta: r.hosp.etaSec, ed: r.hosp.ed, fits: r.hosp.fits } : null, inc: r ? r.inc : null, t: r ? r.t : null, view: S.view };
      },
      edgeAtView: function (fx, fy) { if (!ready || !mc.W) return null; var ll = mc.lonlat(mc.W * fx, mc.H * fy); return N.edgeAt(nat, ll[0], ll[1], 2000); },
      engine: function () { return nat; }
    };
  })();

  /* ======================================================================= 5e. QATAR-WIDE: facts read from the bundled data + the national hazard layers (heat, dust, flood: all SIMULATED) */
  var qwide = (function () {
    var canvas = $('#qa-canvas'); if (!canvas || !NATL.avail) return null;
    var N = NATL.N, GEO = NATL.GEO, mc = null, nat = null, ready = false, active = false, token = 0;
    var S = { layer: 'facilities', date: '2026-07-12', hour: 12, rain: 0, ver: 0, fields: null, t: 0, tunnels: null };
    var loading = $('#qa-loading'), readEl = $('#qa-read'), legendEl = $('#qa-legend');
    var LAYERS = {
      facilities: { name: T('المنشآت والطرق', 'Facilities & roads'), col: T('أماكن', 'Places') },
      heat: { name: T('الحرارة', 'Heat'), col: T('WBGT (تقدير)', 'WBGT est.'), unit: '°C' },
      dust: { name: T('الغبار', 'Dust'), col: T('PM10', 'PM10'), unit: 'µg/m³' },
      flood: { name: T('السيول والأنفاق', 'Flood & underpasses'), col: T('أنفاق مغلقة', 'Tunnels closed') }
    };
    var BAND = { ok: ['--safe', 0.2], warn: ['--warn', 0.5], stop: ['--danger', 0.58], crit: ['--danger', 0.8] };

    /* ---- numbers from the data (also written into every [data-nat] element, so the page never types them in) ---- */
    function fillFacts() {
      var c = NATL.counts(); if (!c) return null;
      var map = { munis: c.munis, places: c.places, fac: c.fac, hosp: c.hosp, fire: c.fire, police: c.police, amb: c.amb, ed: c.ed, roadkm: c.roadkm, roadnodes: c.nodes, virt: c.virt, snapshot: c.snapshot, osmts: c.osmts };
      $$('[data-nat]').forEach(function (n) { var k = n.getAttribute('data-nat'); if (!(k in map)) return; var v = map[k]; n.textContent = typeof v === 'number' ? M.num(v) : String(v); });
      return c;
    }
    function bandOf(layer, v) {
      if (layer === 'heat') return v >= 32.1 ? 'stop' : v >= 28 ? 'warn' : 'ok';
      return v >= 425 ? 'crit' : v >= 255 ? 'stop' : v >= 150 ? 'warn' : 'ok';
    }
    function under(c) {                                           // the simulated field, one cell per 0.02° (about 2 km), clipped to the land
      var f = S.fields, g = f.grid, D = NATL.data(), arr = S.layer === 'heat' ? f.wbgt : f.pm10, ix, iy;
      c.save(); c.clip(D.land);
      for (iy = 0; iy < g.ny; iy++) for (ix = 0; ix < g.nx; ix++) {
        var i = iy * g.nx + ix; if (!f.land[i]) continue;
        var b = bandOf(S.layer, arr[i]), spec = BAND[b]; if (b === 'ok' && S.layer === 'dust') continue;
        var a = S.layer === 'heat' ? 0.16 + 0.62 * clamp((arr[i] - 26) / 12, 0, 1) : 0.2 + 0.6 * clamp((arr[i] - 100) / 700, 0, 1); c.fillStyle = C(spec[0], a); c.fillRect(NATL.X(g.lon0 + ix * g.d), NATL.Y(g.lat0 + iy * g.d), g.d * NATL.KX + 0.05, g.d * NATL.KY + 0.05);
      }
      c.restore();
    }
    function view() { var b = NATL.build().box; return mc.fit(b.x0, b.y0, b.x1, b.y1, 0.05, 0); }
    function draw() {
      if (!mc || !mc.W) return; var D = NATL.build();
      mc.setView(view());
      var o = { key: S.layer + '|' + S.ver };
      if ((S.layer === 'heat' || S.layer === 'dust') && S.fields) o.under = under;
      mc.base(o);
      var c = mc.ctx; c.setTransform(mc.dpr, 0, 0, mc.dpr, 0, 0);
      if (S.layer === 'facilities') NATL.drawFacilities(mc, c, { alpha: 0.95 });
      if (S.layer === 'flood' && S.tunnels) {
        S.tunnels.forEach(function (tn) {
          var x = mc.sx(NATL.X(tn.lon)), y = mc.sy(NATL.Y(tn.lat)), closed = tn.closed, wet = tn.depthCm > 0.5;
          c.beginPath(); c.arc(x, y, closed ? 4.6 : wet ? 3.4 : 2.3, 0, 6.2832); c.fillStyle = C(closed ? '--danger' : wet ? '--info' : '--muted', closed ? 1 : 0.85); c.fill();
          if (closed) { c.strokeStyle = C('--bg-2'); c.lineWidth = 1.2; c.stroke(); }
        });
      }
      c.save(); c.font = '600 10.5px ' + FONT_H; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = M.lang() === 'ar' ? 'rtl' : 'ltr';
      D.munis.forEach(function (mu) { var x = mc.sx(mu.x), y = mc.sy(mu.y); c.lineWidth = 3; c.strokeStyle = C('--bg-2', 0.88); c.strokeText(L(mu.name), x, y); c.fillStyle = C('--head'); c.fillText(L(mu.name), x, y); });
      c.restore();
    }

    /* ---- text ---- */
    function seasonName() { return S.date.indexOf('-07-') > 0 ? T('الصيف', 'summer') : T('الشتاء', 'winter'); }
    function legend() {
      clear(legendEl); var items = [];
      if (S.layer === 'heat') items = [['--safe', T('دون 28 °م', 'below 28 °C')], ['--warn', T('28 إلى 32.1 °م (تحذير)', '28 to 32.1 °C (warn)')], ['--danger', T('32.1 °م فأكثر (أوقفوا العمل)', '32.1 °C and above (stop work)')]];
      else if (S.layer === 'dust') items = [['--warn', T('PM10 ≥ 150 (حدّ قطر)', 'PM10 ≥ 150 (Qatar limit)')], ['--danger', T('≥ 255 (خطر)', '≥ 255 (dangerous)')]];
      else if (S.layer === 'flood') items = [['--muted', T('نفق جاف', 'dry underpass')], ['--info', T('مبتلّ', 'wet')], ['--danger', T('مغلق (≥ 30 سم)', 'closed (≥ 30 cm)')]];
      else items = [['--safe', T('مستشفى / طوارئ / إسعاف', 'hospital / ED / ambulance')], ['--info', T('شرطة', 'police')], ['--danger', T('إطفاء ودفاع مدني', 'fire & Civil Defence')]];
      items.forEach(function (it) { var s = el('span'), i = el('i', 'lgd'); i.style.setProperty('--c', 'var(' + it[0] + ')'); s.appendChild(i); s.appendChild(document.createTextNode(L(it[1]))); legendEl.appendChild(s); });
    }
    function readout(ms, kp) {
      var t = S.t, hh = clockText(t), txt = '', worst;
      if (S.layer === 'heat') {
        worst = ms.slice().sort(function (a, b) { return b.wbgtMax - a.wbgtMax; })[0]; var ban = N.middayBan(nat, t);
        txt = L(T('الساعة ' + hh + ' (' + L(seasonName()) + '): أعلى تقدير WBGT ' + M.num(worst.wbgtMax, 1) + ' °م في ' + L(worst.name) + '. حظر العمل في الهواء الطلق (10:00–15:30 من 1 يونيو إلى 15 سبتمبر) ' + (ban ? 'ساري الآن.' : 'غير ساري الآن.'),
          'At ' + hh + ' (' + L(seasonName()) + '): the highest WBGT estimate is ' + M.num(worst.wbgtMax, 1) + ' °C in ' + L(worst.name) + '. The outdoor-work ban (10:00–15:30, 1 June to 15 September) is ' + (ban ? 'in force now.' : 'not in force now.')));
      } else if (S.layer === 'dust') {
        worst = ms.slice().sort(function (a, b) { return b.pm10Max - a.pm10Max; })[0];
        txt = worst.pm10Max <= 60 ? L(T('الساعة ' + hh + ': جبهة الغبار المحاكاة لم تصل إلى البلاد بعد؛ PM10 عند مستوى الخلفية.', 'At ' + hh + ': the simulated dust front has not reached the country yet; PM10 is at background level.'))
          : L(T('الساعة ' + hh + ': أعلى PM10 تقديري ' + M.num(worst.pm10Max) + ' µg/m³ في ' + L(worst.name) + ' (حدّ قطر لـ24 ساعة: 150).', 'At ' + hh + ': the highest PM10 estimate is ' + M.num(worst.pm10Max) + ' µg/m³ in ' + L(worst.name) + ' (Qatar’s 24-hour limit: 150).'));
      } else if (S.layer === 'flood') {
        var tot = S.tunnels.length, closed = S.tunnels.filter(function (x) { return x.closed; }).length;
        txt = S.rain ? L(T('بعد ساعة من مطر ' + S.rain + ' مم/س (محاكاة): أُغلق ' + closed + ' من ' + tot + ' نفقًا ومعبرًا منخفضًا (قاعدة 30 سم). لا نموذج ارتفاعات: العمق موجود في هذه الأنفاق فقط.', 'After one hour of ' + S.rain + ' mm/h rain (simulated): ' + closed + ' of ' + tot + ' tunnels and low underpasses are closed (the 30 cm rule). There is no elevation model: depth exists only at these underpasses.'))
          : L(T('جاف: ' + tot + ' نفقًا ومعبرًا منخفضًا في بيانات الطرق، كلها مفتوحة. اختر مطرًا لترى ما يُغلق (محاكاة).', 'Dry: ' + tot + ' tunnels and low underpasses in the road data, all open. Pick a rain rate to see which would close (simulated).'));
      } else {
        txt = L(T('البيانات: ' + M.num(NATL.counts().fac) + ' منشأة و' + M.num(NATL.counts().roadkm) + ' كم من الطرق الرئيسية. اختر طبقة خطر لترى ما تُصدره منارة (محاكاة).', 'The data: ' + M.num(NATL.counts().fac) + ' facilities and ' + M.num(NATL.counts().roadkm) + ' km of major roads. Pick a hazard layer to see what MANARA would issue (simulated).'));
      }
      if (readEl) readEl.textContent = txt;
    }
    function table(ms) {
      var tb = $('#qa-table tbody'), th = $('#qa-th-layer'); if (!tb) return; clear(tb);
      var c = NATL.counts(), D = NATL.build(), by = {}; ms.forEach(function (m) { by[m.id] = m; });
      var closedBy = {}, totBy = {};
      if (S.tunnels) S.tunnels.forEach(function (tn) { var id = GEO.municipalityAt(tn.lon, tn.lat); id = id && id.id || id; totBy[id] = (totBy[id] || 0) + 1; if (tn.closed) closedBy[id] = (closedBy[id] || 0) + 1; });
      var placesBy = {}; GEO.places.forEach(function (p) { placesBy[p.muni] = (placesBy[p.muni] || 0) + 1; });
      th.textContent = L(LAYERS[S.layer].col) + (LAYERS[S.layer].unit ? ' (' + LAYERS[S.layer].unit + ')' : '');
      var sum = { h: 0, p: 0, f: 0 };
      GEO.municipalities.forEach(function (mu) {
        var cc = c.byMuni[mu.id] || { hosp: 0, police: 0, fire: 0 }, tr = el('tr'), v, cls = '';
        if (S.layer === 'heat') { var m1 = by[mu.id]; v = m1 ? M.num(m1.wbgtMax, 1) : '·'; cls = m1 ? m1.heat : ''; }
        else if (S.layer === 'dust') { var m2 = by[mu.id]; v = m2 ? M.num(m2.pm10Max) : '·'; cls = m2 ? m2.dust : ''; }
        else if (S.layer === 'flood') v = (closedBy[mu.id] || 0) + ' / ' + (totBy[mu.id] || 0);
        else v = M.num(placesBy[mu.id] || 0);
        var th1 = el('th', null, L(mu.name)); th1.scope = 'row'; tr.appendChild(th1);
        tr.appendChild(el('td', 'num', M.num(mu.areaKm2))); tr.appendChild(el('td', 'num', M.num(cc.hosp))); tr.appendChild(el('td', 'num', M.num(cc.police))); tr.appendChild(el('td', 'num', M.num(cc.fire)));
        var vt = el('td', 'num v' + (cls ? ' lv-' + cls : ''), v); tr.appendChild(vt); tb.appendChild(tr);
        sum.h += cc.hosp; sum.p += cc.police; sum.f += cc.fire;
      });
      var tr2 = el('tr', 'total'), th2 = el('th', null, L(T('المجموع', 'Total'))); th2.scope = 'row'; tr2.appendChild(th2);
      tr2.appendChild(el('td', 'num', M.num(GEO.municipalities.reduce(function (s, m) { return s + m.areaKm2; }, 0)))); tr2.appendChild(el('td', 'num', M.num(sum.h))); tr2.appendChild(el('td', 'num', M.num(sum.p))); tr2.appendChild(el('td', 'num', M.num(sum.f))); tr2.appendChild(el('td', 'num', '')); tb.appendChild(tr2);
    }
    function advisories() {
      var h = $('#qa-adv-h'), ul = $('#qa-adv'), src = $('#qa-src'); if (!ul) return; clear(ul);
      var name = LAYERS[S.layer].name;
      if (h) { clear(h); setStaticHTML(h, M.icon(S.layer === 'heat' ? 'thermo' : S.layer === 'dust' ? 'wind' : S.layer === 'flood' ? 'alert' : 'bell')); h.appendChild(document.createTextNode(L(T('ما تُصدره منارة: ', 'What MANARA would issue: ')) + L(name) + ' (SIM)')); }
      var out = [];
      if (S.layer !== 'facilities') {
        var hz = S.layer; var all = N.advisories(nat, S.t).filter(function (a) { return a.hazard === hz; });
        var rank = { danger: 0, warning: 1, watch: 2, info: 3 }; all.sort(function (a, b) { return (rank[a.level] - rank[b.level]); }); out = all.slice(0, 4);
      }
      if (!out.length) { var li0 = el('li', 'muted'); li0.textContent = S.layer === 'facilities' ? L(T('اختر الحرارة أو الغبار أو السيول لترى التنبيهات المحاكاة.', 'Pick heat, dust or flood to see the simulated advisories.')) : L(T('لا تنبيه عند هذه الإعدادات.', 'No advisory at these settings.')); ul.appendChild(li0); }
      out.forEach(function (a) { var li = el('li'); li.appendChild(el('span', 'tag ' + (a.level === 'danger' ? 'danger' : a.level === 'warning' ? 'warn' : 'info'), a.level)); li.appendChild(document.createTextNode(' ' + L(a.text))); ul.appendChild(li); });
      if (src) src.textContent = S.layer === 'heat' ? L(T('الحدود: WBGT 28 °م تحذير (S52)، و32.1 °م إيقاف كل عمل (S19)، وحظر الظهيرة 10:00–15:30 من 1 يونيو إلى 15 سبتمبر (S18). WBGT هنا تقدير (S70، S53) لا قياس.', 'Limits: WBGT 28 °C warn (S52), 32.1 °C stop all work (S19), the midday ban 10:00–15:30 from 1 June to 15 September (S18). WBGT here is an estimate (S70, S53), not a measurement.'))
        : S.layer === 'dust' ? L(T('الحدود: PM10 ‏150 µg/m³ حدّ قطر (S31)، و255 و425 (S49). جبهة بأسلوب الشمال الغربي (شمال) محاكاة؛ وعاصفة أبريل 2015 تجاوزت 7,000 (S30).', 'Limits: PM10 150 µg/m³ is Qatar’s standard (S31), 255 and 425 (S49). A north-westerly shamal-style front is simulated; the April 2015 storm exceeded 7,000 (S30).'))
        : S.layer === 'flood' ? L(T('يُغلق النفق عند 30 سم (S55). أمطار أكتوبر 2018 أغرقت أنفاق الدوحة (S28). المطر والتصريف محاكاة.', 'A tunnel closes at 30 cm (S55). The October 2018 rain flooded Doha underpasses (S28). Rain and drainage are simulated.'))
        : L(T('المصدر: لقطة OpenStreetMap (ODbL). النواقص موضّحة أسفل.', 'Source: an OpenStreetMap snapshot (ODbL). The gaps are listed below.'));
    }
    function labels() {
      var lab = { facilities: LAYERS.facilities.name, heat: LAYERS.heat.name, dust: LAYERS.dust.name, flood: LAYERS.flood.name };
      canvas.setAttribute('aria-label', L(T('خريطة قطر، طبقة: ', 'The map of Qatar, layer: ')) + L(lab[S.layer]) + (S.layer === 'facilities' ? '' : ' (SIM)') + '. ' + (readEl ? readEl.textContent : ''));
    }
    function compute() {
      if (!nat) return;
      S.t = N.timeAt(nat, S.date, S.hour);
      S.fields = N.fields(nat, S.t); S.ver++;
      S.tunnels = N.floodState(nat, { all: true }).tunnels;
      var ms = N.municipalities(nat, S.t);
      legend(); readout(ms); table(ms); advisories(); draw(); labels();
    }
    function showRows() {
      var hz = S.layer === 'heat', du = S.layer === 'dust', fl = S.layer === 'flood';
      $('#qa-season-row').hidden = !hz; $('#qa-hour-row').hidden = !(hz || du); $('#qa-rain-row').hidden = !fl;
      $$('#qa-layers [data-layer]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-layer') === S.layer ? 'true' : 'false'); });
    }
    function setLayer(l, silent) {
      if (!LAYERS[l]) return; S.layer = l; if (l === 'dust' && S.hour === 12) S.hour = 9;
      var sl = $('#qa-hour'); if (sl) { sl.value = String(S.hour); var hv = $('#qa-hour-v'); if (hv) hv.textContent = clockText(S.hour * 3600); }
      showRows(); if (ready) compute();
    }
    function setRain(mm) {                                         // a fresh world, then mm of rain for one simulated hour (about 20 ms of computing)
      S.rain = mm; $$('#qa-rain [data-rain]').forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-rain') === mm ? 'true' : 'false'); });
      var my = ++token; if (loading) loading.hidden = false;
      setTimeout(function () {
        if (my !== token) return;
        nat = N.restart(nat); N.startDust(nat, { t0: N.timeAt(nat, NATL.DATE, 6) });
        if (mm) { N.setRain(nat, mm); N.step(nat, 3600); }
        if (loading) loading.hidden = true; compute();
      }, 20);
    }
    function activate() {
      if (active) return; active = true; if (loading) loading.hidden = false;
      setTimeout(function () {
        try { nat = NATL.engine('layers'); N.startDust(nat, { t0: N.timeAt(nat, NATL.DATE, 6) }); } catch (e) { if (window.console) console.error(e); return; }
        ready = true; if (loading) loading.hidden = true; canvas.removeAttribute('aria-busy'); showRows(); compute();
      }, 40);
    }
    function init() {
      mc = NATL.MapCanvas(canvas); NATL.build(); readTokens(); canvas.setAttribute('aria-busy', 'true');
      fillFacts(); showRows(); legend(); labels();
      onLang(labels);
      $$('#qa-layers [data-layer]').forEach(function (b) { b.addEventListener('click', function () { setLayer(b.getAttribute('data-layer')); }); });
      $$('#qa-season [data-date]').forEach(function (b) { b.addEventListener('click', function () { S.date = b.getAttribute('data-date'); $$('#qa-season [data-date]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); if (ready) compute(); }); });
      $$('#qa-rain [data-rain]').forEach(function (b) { b.addEventListener('click', function () { if (ready) setRain(+b.getAttribute('data-rain')); }); });
      var sl = $('#qa-hour');
      function fill() { sl.style.setProperty('--p', (100 * sl.value / sl.max).toFixed(1) + '%'); var hv = $('#qa-hour-v'); if (hv) hv.textContent = clockText(+sl.value * 3600); }
      sl.addEventListener('input', function () { S.hour = +sl.value; fill(); if (ready) compute(); }); fill();
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) activate(); }, { rootMargin: '500px 0px' }).observe(canvas); else activate();
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (mc.resize()) draw(); }).observe(canvas); else window.addEventListener('resize', function () { if (mc.resize()) draw(); });
      onTheme(function () { readTokens(); NATL.bump(); draw(); });
      onLang(function () { fillFacts(); legend(); if (ready) compute(); });
    }
    return {
      init: init, activate: activate, setLayer: setLayer, setRain: setRain,
      setHour: function (h) { S.hour = h; var sl = $('#qa-hour'); if (sl) sl.value = String(h); var hv = $('#qa-hour-v'); if (hv) hv.textContent = clockText(h * 3600); if (ready) compute(); },
      setDate: function (d) { S.date = d; if (ready) compute(); },
      facts: function () { return NATL.counts(); },
      state: function () { var ms = ready ? N.municipalities(nat, S.t) : []; return { ready: ready, layer: S.layer, date: S.date, hour: S.hour, rain: S.rain, t: S.t, ban: ready ? N.middayBan(nat, S.t) : null, wbgtMax: ms.length ? Math.max.apply(null, ms.map(function (m) { return m.wbgtMax; })) : null, pm10Max: ms.length ? Math.max.apply(null, ms.map(function (m) { return m.pm10Max; })) : null, tunnels: S.tunnels ? S.tunnels.length : 0, closed: S.tunnels ? S.tunnels.filter(function (x) { return x.closed; }).length : 0, rows: $$('#qa-table tbody tr').length }; }
    };
  })();

  /* ======================================================================= 5f. THE STAGE TABS: all of Qatar / last 100 metres */
  var stageTabs = (function () {
    var bar = $('#stage-tabs'); if (!bar) return null;
    var tabs = $$('.stage-tab', bar), panels = { 'st-nat': $('#sp-nat'), 'st-zoom': $('#sp-zoom') }, cur = 'st-nat';
    function select(id, focus) {
      cur = id;
      tabs.forEach(function (t) { var on = t.id === id; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; if (panels[t.id]) panels[t.id].hidden = !on; });
      if (focus) $('#' + id).focus();
      if (id === 'st-zoom' && hero) hero.repaint(); if (id === 'st-nat' && natHero) natHero.repaint();
    }
    function init(natOk) {
      if (!natOk) { var t0 = $('#st-nat'); if (t0) t0.hidden = true; bar.hidden = true; if (panels['st-nat']) panels['st-nat'].hidden = true; select('st-zoom'); return; }
      tabs.forEach(function (t) { t.addEventListener('click', function () { select(t.id, false); }); });
      bar.addEventListener('keydown', function (e) {
        var i = tabs.indexOf(document.activeElement); if (i < 0) return; var dir = 0;
        if (e.key === 'ArrowRight') dir = document.documentElement.dir === 'rtl' ? -1 : 1; else if (e.key === 'ArrowLeft') dir = document.documentElement.dir === 'rtl' ? 1 : -1; else if (e.key === 'Home') dir = -99; else if (e.key === 'End') dir = 99; else return;
        e.preventDefault(); var j = dir === -99 ? 0 : dir === 99 ? tabs.length - 1 : (i + dir + tabs.length) % tabs.length; select(tabs[j].id, true);
      });
      bar.setAttribute('aria-label', L(T('منظورا المشهد', 'Two views of the scene')));
      onLang(function () { bar.setAttribute('aria-label', L(T('منظورا المشهد', 'Two views of the scene'))); });
      select('st-nat');
    }
    return { init: init, select: select, current: function () { return cur; } };
  })();

  /* ======================================================================= 6. HAZARD CARDS + GAUGES */
  var GAUGES = {
    fire: [
      { lab: T('أعلى بكسل حراري', 'Hottest thermal pixel'), unit: '°C', min: 20, max: 100, warn: 57, basis: 'cited', src: T('تصنيف كاشف حرارة مدرج (S58)', 'a listed heat-detector rating (S58)') },
      { lab: T('الارتفاع في الدقيقة', 'Rise per minute'), unit: '°C/min', min: 0, max: 15, danger: 8.3, basis: 'cited', src: T('S58', 'S58') }
    ],
    gas: [
      { lab: 'CO', unit: 'ppm', min: 0, max: 250, warn: 35, danger: 200, basis: 'cited', src: T('NIOSH (S46) · الحرج 1,200', 'NIOSH (S46) · critical 1,200') },
      { lab: 'H₂S', unit: 'ppm', min: 0, max: 40, warn: 10, danger: 20, basis: 'cited', src: T('NIOSH وOSHA (S47) · الحرج 100', 'NIOSH and OSHA (S47) · critical 100') },
      { lab: T('غاز مسال (مكافئ البروبان)', 'LPG (propane-equivalent)'), unit: 'ppm', min: 0, max: 3000, warn: 1000, danger: 2100, basis: 'cited', src: T('NIOSH (S48): 10% من حدّ الانفجار الأدنى', 'NIOSH (S48): 10% of the lower explosive limit') }
    ],
    flood: [
      { lab: T('عمق الماء', 'Water depth'), unit: 'cm', min: 0, max: 60, warn: 15, danger: 30, crit: 46, basis: 'derived', src: T('هيئة الأرصاد الأمريكية (S55)، البوصات محوّلة', 'US National Weather Service (S55), inches converted') }
    ],
    dust: [
      { lab: T('PM10 (متوسط 10 دقائق)', 'PM10 (10-minute mean)'), unit: 'µg/m³', min: 0, max: 500, warn: 150, danger: 255, crit: 425, ref: 45, refLab: T('منظمة الصحة العالمية 45', 'WHO 45'), basis: 'cited', src: T('معيار قطر (S31) · EPA (S49) · WHO (S50)', 'Qatar standard (S31) · US EPA (S49) · WHO (S50)') }
    ],
    heat: [
      { lab: T('تقدير WBGT — عمل خفيف', 'WBGT estimate — light work'), unit: '°C', min: 20, max: 36, warn: 28, danger: 32.1, basis: 'cited', src: T('OSHA (S52) · حدّ قطر 32.1 مقيس (S19)', 'OSHA (S52) · Qatar 32.1 is measured (S19)') }
    ],
    sos: [
      { lab: T('سكون بعد الصدمة', 'Stillness after impact'), unit: 's', min: 0, max: 45, warn: 15, basis: 'student-set', src: T('اختارها الطالب: تحتاج معايرة', 'student-set: needs calibration') },
      { lab: T('لا ردّ على المكالمة', 'No answer to the call'), unit: 's', min: 0, max: 45, danger: 30, basis: 'student-set', src: T('اختارها الطالب: تحتاج معايرة', 'student-set: needs calibration') }
    ]
  };
  var BASIS = { cited: T('منشور', 'cited'), derived: T('محسوب', 'derived'), 'student-set': T('اختاره الطالب', 'student-set') };
  function fmtNum(v) { return Number.isInteger(v) ? M.num(v) : M.num(v, 1); }
  function buildGauge(host) {
    var rows = GAUGES[host.getAttribute('data-gauge')]; if (!rows) return;
    clear(host);
    rows.forEach(function (r) {
      var row = el('div', 'g-row'), span = r.max - r.min, pct = function (v) { return clamp((v - r.min) / span * 100, 0, 100); };
      var top = el('div', 'g-top'); top.appendChild(el('b', null, L(r.lab) + ' (' + r.unit + ')'));
      var lim = []; if (r.warn != null) lim.push(L(T('تحذير ', 'warn ')) + fmtNum(r.warn)); if (r.danger != null) lim.push(L(T('خطر ', 'danger ')) + fmtNum(r.danger)); top.appendChild(el('span', 'num', lim.join(' · ')));
      row.appendChild(top);
      var track = el('div', 'g-track'); track.setAttribute('dir', 'ltr');
      var cuts = [r.min]; if (r.warn != null) cuts.push(r.warn); if (r.danger != null) cuts.push(r.danger); if (r.crit != null) cuts.push(r.crit); cuts.push(r.max);
      var cls = r.warn != null && r.danger != null ? ['ok', 'warn', 'danger', 'crit'] : r.warn != null ? ['ok', 'warn'] : ['ok', 'danger'];
      for (var i = 0; i < cuts.length - 1; i++) { var z = el('i', 'g-zone ' + cls[i]); z.style.setProperty('--a', pct(cuts[i]).toFixed(2)); z.style.setProperty('--b', pct(cuts[i + 1]).toFixed(2)); track.appendChild(z); }
      function tick(v, ref, lab) { var t = el('div', 'g-tick' + (ref ? ' ref' : '')); t.style.setProperty('--p', pct(v).toFixed(2)); t.appendChild(el('span', 'num', lab || fmtNum(v))); track.appendChild(t); }
      if (r.warn != null) tick(r.warn); if (r.danger != null) tick(r.danger); if (r.crit != null) tick(r.crit); if (r.ref != null) tick(r.ref, true, L(r.refLab));
      row.appendChild(track);
      row.appendChild(el('div', 'g-basis', L(BASIS[r.basis]) + ' · ' + L(r.src)));
      host.appendChild(row);
    });
  }
  function initHazards() {
    var grid = $('#hz-grid'); if (!grid) return;
    $$('.hz-btn', grid).forEach(function (b) {
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open ? 'true' : 'false');
        var body = document.getElementById(b.getAttribute('aria-controls')); body.hidden = !open; b.closest('.hz-card').classList.toggle('open', open);
      });
    });
    $$('.gauge', grid).forEach(buildGauge);
    onLang(function () { $$('.gauge', grid).forEach(buildGauge); });
  }

  /* ======================================================================= 7. PERSONAS (wording from js/messages.js) + LANGUAGES */
  var PERSONA_MSG = {
    fire: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"ഉണരൂ! തീ — പുറത്ത്","l":["ഏറ്റവും അടുത്ത തുറന്ന പുറത്തേക്കുള്ള വഴിയിലൂടെ പോകുക.","പടിക്കെട്ട് ഉപയോഗിക്കുക. ലിഫ്റ്റ് ഉപയോഗിക്കരുത്."]},"draft":true,"ar":{"h":"استيقظ! حريق — اخرج — الدرج (ب)","l":["توجّه إلى أقرب مخرج مفتوح: الدرج (ب).","استخدم الدرج ولا تستخدم المصعد."]},"en":{"h":"WAKE UP! FIRE — OUT — Stair B","l":["Go to the nearest open exit: Stair B.","Use the stairs. Do not use the lift."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"حريق — غادر الآن","l":["توجّه إلى أقرب مخرج مفتوح: الدرج (ب).","استخدم الدرج ولا تستخدم المصعد."]},"en":{"h":"FIRE — leave now","l":["Go to the nearest open exit: Stair B.","Use the stairs. Do not use the lift."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"حريق — غادر الآن","l":["لا تستخدم الدرج ولا المصعد.","اذهب إلى الشرفة الآمنة وابقَ فيها."]},"en":{"h":"FIRE — leave now","l":["Do not use the stairs or the lift.","Go to the refuge balcony and stay there."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"حريق! حان وقت الخروج","l":["اتبع معلّمك أو أحد الكبار.","امشِ ولا تركض."]},"en":{"h":"Fire! Time to go outside","l":["Follow your teacher or a grown-up.","Walk. Do not run."]}}},
    gas: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"ഉണരൂ! ഗ്യാസ് — സ്വിച്ച് തൊടരുത് — പുറത്ത്","l":["വൈദ്യുത സ്വിച്ചുകളിൽ തൊടരുത്. തീ കത്തിക്കരുത്.","ചോർച്ചയിൽ നിന്ന് അകന്നുപോകുക — കാറ്റിന് കുറുകെയോ കാറ്റിനെതിരെയോ നീങ്ങുക."]},"draft":true,"ar":{"h":"استيقظ! غاز — لا مفاتيح — اخرج","l":["لا تلمس المفاتيح الكهربائية ولا تُشعل أي لهب.","ابتعد عن مصدر التسرّب بعرض اتجاه الريح أو عكسه."]},"en":{"h":"WAKE UP! GAS — NO SWITCH — OUT","l":["Do not touch electrical switches. No flames.","Move away from the leak, across the wind or into the wind."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"تسرّب غاز — غادر الآن","l":["لا تلمس المفاتيح الكهربائية ولا تُشعل أي لهب.","تحرّك بعرض اتجاه الريح — اتبع السهم على الشاشة."]},"en":{"h":"GAS LEAK — leave now","l":["Do not touch electrical switches. No flames.","Move across the wind — follow the arrow on the screen."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"تسرّب غاز — غادر الآن","l":["لا تلمس المفاتيح الكهربائية ولا تُشعل أي لهب.","افتح نافذة إن استطعت الوصول إليها."]},"en":{"h":"GAS LEAK — leave now","l":["Do not touch electrical switches. No flames.","Open a window if you can reach it."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"تسرّب غاز! اخرج بهدوء","l":["لا تلمس المفاتيح.","اتبع معلّمك أو أحد الكبار."]},"en":{"h":"Gas leak! Go outside calmly","l":["Do not touch the switches.","Follow your teacher or a grown-up."]}}},
    flood: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"വെള്ളം — മുകളിലേക്ക് — അവിടെ നിൽക്കുക","l":["മുകൾ നിലയിലേക്കോ ഉയർന്ന സ്ഥലത്തേക്കോ പോകുക.","അണ്ടർപാസിലോ താഴ്ന്ന റോഡുകളിലോ കയറരുത്."]},"draft":true,"ar":{"h":"ماء — اصعد — ابقَ","l":["اصعد إلى طابق أعلى أو مكان مرتفع.","لا تدخل النفق ولا الطرق المنخفضة."]},"en":{"h":"WATER — UP — STAY","l":["Go to an upper floor or higher ground.","Do not enter the underpass or low roads."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"سيول — اصعد إلى مكان أعلى الآن","l":["اصعد إلى طابق أعلى أو مكان مرتفع.","لا تدخل النفق ولا الطرق المنخفضة."]},"en":{"h":"FLOOD — move up now","l":["Go to an upper floor or higher ground.","Do not enter the underpass or low roads."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"سيول — اصعد إلى مكان أعلى الآن","l":["ابقَ في الطابق العلوي ولا تنزل.","المساعدة تعرف غرفتك."]},"en":{"h":"FLOOD — move up now","l":["Stay upstairs. Do not go down.","Help knows your room."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"المياه ترتفع! ابقَ في الداخل","l":["ابقَ في الداخل مع معلّمك.","لا تلمس الماء."]},"en":{"h":"Water is rising! Stay inside","l":["Stay inside with your teacher.","Do not touch the water."]}}},
    dust: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"ജോലി നിർത്തുക — അകത്തുകയറുക — മാസ്ക്","l":["അടച്ച കെട്ടിടത്തിനുള്ളിൽ കയറുക. ജനലുകളും വാതിലുകളും അടയ്ക്കുക.","പുറത്തിറങ്ങേണ്ടി വന്നാൽ പൊടി മാസ്ക് ധരിക്കുക."]},"draft":true,"ar":{"h":"أوقف العمل — ادخل — كمامة","l":["ادخل إلى مبنى مغلق وأغلق النوافذ والأبواب.","إن اضطررت للخروج فضع كمامة للغبار."]},"en":{"h":"STOP WORK — GO INSIDE — MASK","l":["Go into a closed building. Close windows and doors.","If you must go out, wear a dust mask."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"عاصفة غبارية الآن — ادخل فورًا","l":["ادخل إلى مبنى مغلق وأغلق النوافذ والأبواب.","إن اضطررت للخروج فضع كمامة للغبار."]},"en":{"h":"DUST STORM NOW — get inside","l":["Go into a closed building. Close windows and doors.","If you must go out, wear a dust mask."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"عاصفة غبارية الآن — ادخل فورًا","l":["ابقَ في الداخل ونوافذك وأبوابك مغلقة.","أبقِ أدويتك قريبة منك."]},"en":{"h":"DUST STORM NOW — get inside","l":["Stay indoors with windows and doors closed.","Keep your medicines near you."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"عاصفة غبار! ادخل إلى المبنى","l":["ابقَ في الداخل مع معلّمك.","أغلق النوافذ مع معلّمك."]},"en":{"h":"Dust storm! Go inside","l":["Stay inside with your teacher.","Close the windows with your teacher."]}}},
    heat: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"ജോലി നിർത്തുക — തണൽ — വെള്ളം","l":["ഇപ്പോൾ ജോലി നിർത്തുക.","തണലിലേക്കോ തണുപ്പുള്ള വിശ്രമസ്ഥലത്തേക്കോ പോകുക."]},"draft":true,"ar":{"h":"أوقف العمل — ظل — ماء","l":["أوقف العمل الآن.","اذهب إلى الظل أو مكان التبريد: الحاوية المكيّفة."]},"en":{"h":"STOP WORK — SHADE — WATER","l":["Stop work now.","Go to the shade or the cool shelter: the cooling container."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"خطر حرارة — أوقف العمل الآن","l":["اذهب إلى الظل أو مكان التبريد: الحاوية المكيّفة.","اشرب ماءً."]},"en":{"h":"HEAT DANGER — stop work now","l":["Go to the shade or the cool shelter: the cooling container.","Drink water."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"خطر حرارة — أوقف العمل الآن","l":["ابقَ في غرفة باردة.","اشرب ماءً."]},"en":{"h":"HEAT DANGER — stop work now","l":["Stay in a cool room.","Drink water."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"الجو حارّ جدًا! اذهب إلى مكان بارد","l":["ادخل إلى الصف المكيّف.","اشرب ماءً."]},"en":{"h":"Too hot! Go somewhere cool","l":["Go inside to the cool classroom.","Drink water."]}}},
    sos: {"ravi":{"f":["sound","vibration","text","pictogram"],"ml":{"h":"സഹായം വരുന്നു","l":["സഹായം ഏകദേശം 4 മിനിറ്റ് ഉള്ളിൽ എത്തും.","ഇവിടെ തന്നെ നിൽക്കുക, ശാന്തമായിരിക്കാൻ ശ്രമിക്കുക."]},"draft":true,"ar":{"h":"المساعدة قادمة","l":["المساعدة قادمة خلال نحو 4 دقائق.","ابقَ مكانك وحاول أن تبقى هادئًا."]},"en":{"h":"HELP COMING","l":["Help is coming in about 4 min.","Stay where you are and try to stay calm."]}},"huda":{"f":["strobe","vibration","text","pictogram"],"ar":{"h":"المساعدة في الطريق إليك","l":["المساعدة قادمة خلال نحو 4 دقائق.","ابقَ مكانك وحاول أن تبقى هادئًا."]},"en":{"h":"Help is on its way to you","l":["Help is coming in about 4 min.","Stay where you are and try to stay calm."]}},"abu":{"f":["sound","vibration","text","pictogram"],"ar":{"h":"المساعدة في الطريق إليك","l":["المساعدة قادمة إلى غرفتك.","ابقَ مكانك وحاول أن تبقى هادئًا."]},"en":{"h":"Help is on its way to you","l":["Help is coming to your room.","Stay where you are and try to stay calm."]}},"lina":{"f":["card","voice","sound","pictogram"],"ar":{"h":"المساعدة في الطريق إليك","l":["معلّمك قادم. ابقَ مكانك.","ابقَ مكانك وحاول أن تبقى هادئًا."]},"en":{"h":"Help is on its way to you","l":["A teacher is coming. Stay where you are.","Stay where you are and try to stay calm."]}}}
  };
  var FMT = { sound: [T('صوت', 'Sound'), 'speaker'], vibration: [T('اهتزاز', 'Vibration'), 'phone'], strobe: [T('وميض (بموافقتك)', 'Strobe (opt-in)'), 'sun'], text: [T('نص', 'Text'), 'eye'], pictogram: [T('رموز', 'Pictograms'), 'layers'], card: [T('بطاقة مصوّرة', 'Picture card'), 'layers'], voice: [T('صوت ناطق', 'Voice'), 'speaker'] };
  var LANGS = [
    { id: 'ar', native: 'العربية', en: 'Arabic', draft: false }, { id: 'en', native: 'English', en: 'English', draft: false },
    { id: 'ml', native: 'മലയാളം', en: 'Malayalam', draft: true }, { id: 'ne', native: 'नेपाली', en: 'Nepali', draft: true }, { id: 'bn', native: 'বাংলা', en: 'Bengali', draft: true },
    { id: 'ur', native: 'اردو', en: 'Urdu', draft: true }, { id: 'hi', native: 'हिन्दी', en: 'Hindi', draft: true }, { id: 'tl', native: 'Tagalog', en: 'Tagalog', draft: true }
  ];
  var COMMUNITIES = [   // embassy-based estimates 2015–2017 (S23), never PSA figures
    { v: 650000, n: T('الهند', 'India'), s: 'draft', l: T('المالايالامية · الهندية (مسودة)', 'Malayalam · Hindi (draft)'), disp: '650,000' },
    { v: 350000, n: T('نيبال', 'Nepal'), s: 'draft', l: T('النيبالية (مسودة)', 'Nepali (draft)'), disp: '> 350,000' },
    { v: 280000, n: T('بنغلاديش', 'Bangladesh'), s: 'draft', l: T('البنغالية (مسودة)', 'Bengali (draft)'), disp: '280,000' },
    { v: 260000, n: T('الفلبين', 'Philippines'), s: 'draft', l: T('التاغالوغية (مسودة)', 'Tagalog (draft)'), disp: '260,000' },
    { v: 200000, n: T('مصر', 'Egypt'), s: 'complete', l: T('العربية (كاملة)', 'Arabic (complete)'), disp: '200,000' },
    { v: 145256, n: T('سريلانكا', 'Sri Lanka'), s: 'roadmap', l: T('السنهالية والتاميلية: غير مغطاة بعد', 'Sinhala, Tamil: not covered yet'), disp: '145,256' },
    { v: 125000, n: T('باكستان', 'Pakistan'), s: 'draft', l: T('الأردية (مسودة)', 'Urdu (draft)'), disp: '125,000' }
  ];
  var persona = (function () {
    var host = $('#personas'); if (!host) return null;
    var chipsHost = $('#persona-hz'), cur = 'fire', raviLang = 'ml';
    var TONE = { fire: '--danger', gas: '--warn', flood: '--info', dust: '--warn', heat: '--brand', sos: '--danger' };
    function build() {
      if (!chipsHost.children.length) {
        HZ.forEach(function (h) {
          var b = el('button', 'chip'); b.type = 'button'; b.dataset.hz = h.id; b.setAttribute('aria-pressed', h.id === cur ? 'true' : 'false'); setStaticHTML(b, M.icon(h.icon)); b.appendChild(el('span'));
          b.addEventListener('click', function () { cur = h.id; render(); }); chipsHost.appendChild(b);
        });
      }
      $$('#ravi-lang .chip').forEach(function (b) { b.addEventListener('click', function () { raviLang = b.getAttribute('data-lang'); render(); }); });
    }
    function fill(card, pid, lang) {
      var d = PERSONA_MSG[cur][pid], m = d[lang] || d.en, ph = card.querySelector('.phone'), fmt = $('.phone-fmt', ph), h = $('.phone-h', ph), ul = $('.phone-l', ph), dr = $('.phone-draft', ph);
      ph.style.setProperty('--hc', 'var(' + TONE[cur] + ')');
      clear(fmt); (d.f || []).forEach(function (f) { var spec = FMT[f]; if (!spec) return; var s = el('span'); setStaticHTML(s, M.icon(spec[1])); s.appendChild(document.createTextNode(L(spec[0]))); fmt.appendChild(s); });
      h.textContent = m.h; clear(ul); m.l.forEach(function (x) { ul.appendChild(el('li', null, x)); });
      var rtl = lang === 'ar' || lang === 'ur'; [h, ul].forEach(function (n) { n.setAttribute('lang', lang); n.setAttribute('dir', rtl ? 'rtl' : 'ltr'); });
      if (dr) dr.hidden = !d.draft || lang !== 'ml';
    }
    function render() {
      var ui = M.lang();
      $$('#persona-hz .chip').forEach(function (b, i) { b.lastChild.textContent = L(HZ[i].short); b.setAttribute('aria-pressed', HZ[i].id === cur ? 'true' : 'false'); });
      chipsHost.setAttribute('aria-label', L(T('اختر الخطر لترى رسالة كل شخص', 'Pick the hazard to see each person’s message')));
      $$('#ravi-lang .chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === raviLang ? 'true' : 'false'); });
      $('#ravi-lang').setAttribute('aria-label', L(T('لغة رسالة رافي', 'Language of Ravi’s message')));
      fill($('[data-p=ravi]', host), 'ravi', raviLang);
      ['huda', 'abu', 'lina'].forEach(function (p) { fill($('[data-p=' + p + ']', host), p, ui); });
    }
    function init() { build(); render(); onLang(render); }
    return { init: init, state: function () { return { hz: cur, raviLang: raviLang }; } };
  })();
  function initLangs() {
    var chips = $('#lang-chips'), bars = $('#lang-bars');
    function render() {
      if (chips) { clear(chips); LANGS.forEach(function (l) { var li = el('li', l.draft ? 'draft' : 'complete'); var b = el('b', null, l.native); b.setAttribute('lang', l.id); b.setAttribute('dir', l.id === 'ar' || l.id === 'ur' ? 'rtl' : 'ltr'); li.appendChild(b); li.appendChild(el('small', null, l.draft ? L(T('مسودة — تحتاج مراجعة متحدث أصلي', 'Draft — needs native-speaker review')) : L(T('كاملة', 'complete')))); chips.appendChild(li); }); }
      if (bars) { clear(bars); COMMUNITIES.forEach(function (c) { var li = el('li'); li.setAttribute('data-c', c.s); var nm = el('span'); nm.appendChild(document.createTextNode(L(c.n))); nm.appendChild(el('small', null, L(c.l))); li.appendChild(nm); var t = el('div', 'lb-t'); var i = el('i'); i.style.setProperty('--v', String(c.v)); t.appendChild(i); li.appendChild(t); var ln = el('span', 'lb-n', c.disp); ln.setAttribute('dir', 'ltr'); li.appendChild(ln); bars.appendChild(li); }); }
    }
    render(); onLang(render);
  }

  /* ======================================================================= 8. transparency filter, evidence chart, subnav, print */
  function initTruth() {
    var chips = $$('#truth-filter [data-f]'), rows = $$('#truth tbody tr');
    if (!chips.length) return;
    $('#truth-filter').setAttribute('aria-label', M.s('home.truth'));
    chips.forEach(function (c) { c.addEventListener('click', function () {
      var f = c.getAttribute('data-f'); chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      rows.forEach(function (r) { r.hidden = !(f === 'all' || r.getAttribute('data-s') === f); });
    }); });
    onLang(function () { $('#truth-filter').setAttribute('aria-label', M.s('home.truth')); });
  }
  function initSweep() {
    var svg = $('#sweep-svg'); if (!svg) return;
    var DATA = [[0, 404.8], [40, 353.8], [85, 317], [100, 211]], ORD = 570;
    function render() {
      clear(svg);
      var X0 = 58, X1 = 300, Y0 = 30, Y1 = 142, MAXV = 600, x = function (v) { return X0 + (X1 - X0) * v / 100; }, y = function (v) { return Y1 - (Y1 - Y0) * v / MAXV; };
      [0, 200, 400, 600].forEach(function (g) { sv('line', { 'class': g ? 'sw-grid' : 'sw-axis', x1: X0, x2: X1, y1: y(g), y2: y(g) }, svg); var t = sv('text', { 'class': 'sw-t', x: X0 - 5, y: y(g) + 3, 'text-anchor': 'end' }, svg); t.textContent = String(g); });
      sv('line', { 'class': 'sw-ord', x1: X0, x2: X1, y1: y(ORD), y2: y(ORD) }, svg);
      var ot = sv('text', { 'class': 'sw-t', x: X1, y: y(ORD) + 13, 'text-anchor': 'end' }, svg); ot.textContent = L(T('إنذار عادي ≥ 570', 'ordinary alarm ≥ 570'));
      var d = ''; DATA.forEach(function (p, i) { d += (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
      sv('path', { 'class': 'sw-line', d: d }, svg);
      DATA.forEach(function (p) {
        sv('circle', { 'class': p[0] === 85 ? 'sw-def' : 'sw-dot', cx: x(p[0]), cy: y(p[1]), r: p[0] === 85 ? 6 : 4.5 }, svg);
        var v = sv('text', { 'class': 'sw-v', x: x(p[0]), y: y(p[1]) + 20, 'text-anchor': 'middle' }, svg); v.textContent = String(Math.round(p[1]));
        var xt = sv('text', { 'class': 'sw-t', x: x(p[0]), y: Y1 + 14, 'text-anchor': 'middle' }, svg); xt.textContent = p[0] + '%';
        if (p[0] === 85) { var dt = sv('text', { 'class': 'sw-t', x: x(p[0]), y: y(p[1]) - 12, 'text-anchor': 'middle' }, svg); dt.textContent = L(T('الافتراضي', 'default')); }
      });
      var yl = sv('text', { 'class': 'sw-t', x: 4, y: 10, 'text-anchor': 'start' }, svg); yl.textContent = L(T('ثوانٍ حتى يصل 90% إلى الأمان (SIM)', 'seconds until 90% are safe (SIM)'));
    }
    render(); onLang(render);
  }
  function initSubnav() {
    var nav = $('#subnav'); if (!nav) return;
    nav.setAttribute('aria-label', M.s('home.subnav'));
    var links = $$('a[href^="#"]', nav), secs = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var ticking = false;
    function spy() {
      ticking = false; var y = window.scrollY + 140, idx = -1;
      secs.forEach(function (s, i) { if (s && s.offsetTop <= y) idx = i; });
      links.forEach(function (a, i) { if (i === idx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      if (idx >= 0) { var a = links[idx], r = a.parentNode; var left = a.offsetLeft - r.clientWidth / 2 + a.clientWidth / 2; if (r.scrollWidth > r.clientWidth && Math.abs(r.scrollLeft - left) > 40 && !reduced()) { try { r.scrollTo({ left: left, behavior: 'smooth' }); } catch (e) { r.scrollLeft = left; } } }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    onLang(function () { nav.setAttribute('aria-label', M.s('home.subnav')); });
    spy();
  }
  function initMisc() {
    $$('[data-logo]').forEach(function (n) { setStaticHTML(n, M.logo(64).replace(/mn-b2/g, 'hero-b2').replace(/mn-b/g, 'hero-b')); });   // own gradient ids: core.js uses the same ids for the nav and footer logos
    var pb = $('#print-btn'); if (pb) pb.addEventListener('click', function () { window.print(); });
    $$('#hero-steps').forEach(function (n) { n.setAttribute('aria-label', M.s('home.stages')); });
    // printing: always on paper-light colours, whatever theme is on screen (the canvas is re-drawn with the light tokens)
    var printedFrom = null;
    window.addEventListener('beforeprint', function () {
      var d = document.documentElement; if (d.dataset.theme === 'dark') { printedFrom = 'dark'; d.dataset.theme = 'light'; }
      if (hero) hero.repaint(); if (natHero) natHero.repaint();
    });
    window.addEventListener('afterprint', function () {
      if (printedFrom) { document.documentElement.dataset.theme = printedFrom; printedFrom = null; }
      if (hero) hero.repaint(); if (natHero) natHero.repaint();
    });
  }
  function initPlaceholders() {                                  // «{{…}}» fields the student must fill in: say how many are left
    var out = $('#ph-status'); if (!out) return;
    function render() {
      var all = $$('.ph'), left = all.filter(function (n) { return /\{\{[A-Z_]+\}\}/.test(n.textContent); });
      out.classList.toggle('done', left.length === 0);
      out.textContent = left.length ? L(T('حقول بلا تعبئة: ' + left.length + ' من ' + all.length, 'Fields still to fill in: ' + left.length + ' of ' + all.length)) : L(T('اكتملت كل الحقول.', 'All fields are filled in.'));
    }
    render(); onLang(render);
  }

  /* ======================================================================= facts read from the bundled data */
  // every [data-nat] element (counts, road km, snapshot date, …) is written from the data scripts at run time; the HTML carries the same values as a
  // fallback for readers without JavaScript, and tools/manara/test-home.mjs checks that the two agree with an independent read of the data files.
  function initFacts() {
    if (!NATL.avail) return;
    var c = NATL.counts(); if (!c) return;
    var map = { munis: c.munis, places: c.places, fac: c.fac, hosp: c.hosp, fire: c.fire, police: c.police, amb: c.amb, ed: c.ed, roadkm: c.roadkm, roadnodes: c.nodes, virt: c.virt, snapshot: c.snapshot, osmts: c.osmts };
    $$('[data-nat]').forEach(function (n) { var k = n.getAttribute('data-nat'); if (!(k in map)) return; var v = map[k]; n.textContent = typeof v === 'number' ? M.num(v) : String(v); });
  }

  /* ======================================================================= boot */
  function brandOverride() {
    // core.js (shared, not ours) still carries the fire-only tagline and footer text. Override them from this page only; the same
    // objects are used by the shell, so a re-render picks them up. Idempotent. Remove once core.js says the same.
    var tg = M.TAGLINE; if (!tg) return;
    var ar = 'ترى الخطر… توقظ الجميع… وتُضيء طريق النجاة', en = 'Sees the danger. Wakes everyone. Lights the safe way out.';
    if (tg.ar === ar && tg.en === en) return;
    tg.ar = ar; tg.en = en;
    M.strings({
      'foot.about': T('منصة «آخر مئة متر» لكل أنواع الطوارئ — حريق وغاز وسيول وغبار وحرارة وشخص يحتاج مساعدة: تتحقق قبل أن تُنذر، وتوقظ كل إنسان بلغته وبالصيغة التي تناسبه، وتدلّه على طريق آمن فعلًا، وتُحصي الجميع. مشروع ابتكار طلابي يكمّل الدفاع المدني والإسعاف ولا يحلّ محلّهما.',
        'The last-100-metres platform for every kind of emergency (fire, gas, flood, dust, heat, someone needing help): it proves before it alerts, wakes each person in their own language and format, lights a route that is really safe, and counts everyone. A student innovation project that complements Civil Defence and the ambulance service and replaces neither.'),
      'foot.made': T('نموذج أولي لمسابقة الابتكار — فرق الطوارئ تواجه الخطر، والمنارة تُوصل كل إنسان إلى الأمان', 'Innovation-competition prototype — responders fight the hazard; the lighthouse gets every person to safety')
    });
    M.setLang(M.lang());                                         // re-renders the shell (nav brand + footer) and fires 'langchange'
  }
  function boot() {
    try { brandOverride(); } catch (e) { /* the shell keeps its own text */ }
    initMisc();
    [hero && hero.init, natHero && natHero.init, function () { stageTabs && stageTabs.init(!!natHero); }, function () { if (hero && natHero) hero.onSelect(natHero.selectHz); }, initCounters, initPipeline, initProof, fast && fast.init, qwide && qwide.init, initFacts, initHazards, persona && persona.init, initLangs, initTruth, initSweep, initSubnav, initPlaceholders].forEach(function (fn) {
      if (typeof fn !== 'function') return;
      try { fn(); } catch (e) { if (window.console) console.error(e); }
    });
    window.__manaraHome = { ready: true, hero: hero, nat: natHero, fast: fast, qwide: qwide, tabs: stageTabs, EXS: EXS, NATL: NATL, persona: persona, PERSONA_MSG: PERSONA_MSG, HZ: HZ.map(function (h) { return h.id; }) };
    window.__homeReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
