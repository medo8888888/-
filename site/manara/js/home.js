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
//   5. fastest     a small road graph: Dijkstra on time = length / (free-flow speed × congestion); jam a road, move the traffic slider
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
    var hzBtns = [], stepLis = [];

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
      size();
      if (st.playing) loopStart();
    }
    return {
      init: init, selectHz: selectHz, seek: seek, repaint: function () { readTokens(); render(true); },
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

  /* ======================================================================= 5. THE FASTEST RESPONDER (road graph + Dijkstra) */
  var fast = (function () {
    var svg = $('#fast-svg'); if (!svg) return null;
    var N = { a: [60, 70], b: [230, 70], c: [400, 70], d: [570, 70], e: [60, 200], f: [230, 200], g: [400, 200], h: [570, 200], i: [60, 330], j: [230, 330], k: [400, 330], l: [570, 330] };
    var KM = 0.011;                                              // 1 map unit = 11 m  (SIM)
    var CLASS = { A: { kmh: 60, sens: 1.0 }, Lc: { kmh: 40, sens: 0.2 } };   // arterial / local: free-flow speed and how much the traffic load hurts
    var NAMES = {
      W: T('الشريان الغربي', 'West Arterial'), E: T('الطريق الشرقي', 'East Road'), Nr: T('الطريق الشمالي', 'North Road'), Sr: T('الطريق الجنوبي', 'South Road'),
      WL: T('الممر الغربي', 'West Lane'), ML: T('الممر الأوسط', 'Middle Lane'), NL: T('الممر الشمالي', 'North Lane'), EL: T('الممر الشرقي', 'East Lane')
    };
    var EDGES = [
      ['r1', 'e', 'f', 'A', 'W', 1], ['r2', 'f', 'g', 'A', 'W', 2], ['r3', 'g', 'h', 'Lc', 'E', 0],
      ['r4', 'a', 'b', 'Lc', 'Nr', 1], ['r5', 'b', 'c', 'Lc', 'Nr', 2], ['r6', 'c', 'd', 'Lc', 'Nr', 3],
      ['r7', 'i', 'j', 'Lc', 'Sr', 1], ['r8', 'j', 'k', 'Lc', 'Sr', 2], ['r9', 'k', 'l', 'Lc', 'Sr', 3],
      ['v1', 'a', 'e', 'Lc', 'WL', 1], ['v2', 'e', 'i', 'Lc', 'WL', 2], ['v3', 'b', 'f', 'Lc', 'ML', 1], ['v4', 'f', 'j', 'Lc', 'ML', 2],
      ['v5', 'c', 'g', 'Lc', 'NL', 1], ['v6', 'g', 'k', 'Lc', 'NL', 2], ['v7', 'd', 'h', 'Lc', 'EL', 1], ['v8', 'h', 'l', 'Lc', 'EL', 2]
    ].map(function (e) { var p = N[e[1]], q = N[e[2]]; return { id: e[0], a: e[1], b: e[2], cls: e[3], name: e[4], seg: e[5], km: Math.hypot(p[0] - q[0], p[1] - q[1]) * KM }; });
    var SCENE = 'g';
    // units: kind, attached node, marker offset, bilingual name
    var UNITS = [
      { id: 'FA', kind: 'fire', node: 'f', off: [-42, -34], spur: 0.33, name: T('محطة الدفاع المدني A (تجريبية)', 'Civil Defence Station A (demo)'), tag: T('إطفاء A', 'Fire A'), short: T('المحطة A', 'Station A') },
      { id: 'FB', kind: 'fire', node: 'l', off: [42, 30], spur: 0.33, name: T('محطة الإنقاذ والمواد الخطرة B (تجريبية)', 'Rescue & HazMat Station B (demo)'), tag: T('إطفاء B', 'Fire B'), short: T('المحطة B', 'Station B') },
      { id: 'P1', kind: 'police', node: 'c', off: [-32, -26], spur: 0.24, name: T('مركز الشرطة 1 (تجريبي)', 'Police post 1 (demo)'), tag: T('شرطة 1', 'Police 1'), short: T('مركز الشرطة 1', 'Police post 1') },
      { id: 'P2', kind: 'police', node: 'd', off: [-32, -26], spur: 0.24, name: T('مركز الشرطة 2 (تجريبي)', 'Police post 2 (demo)'), tag: T('شرطة 2', 'Police 2'), short: T('مركز الشرطة 2', 'Police post 2') },
      { id: 'H1', kind: 'hospital', node: 'f', off: [-42, 38], spur: 0.30, trauma: false, name: T('مستشفى النخيل (تجريبي)', 'Nakheel Hospital (demo)'), tag: T('مستشفى 1', 'Hospital 1'), short: T('مستشفى النخيل', 'Nakheel Hospital') },
      { id: 'H2', kind: 'hospital', node: 'l', off: [-50, 34], spur: 0.30, trauma: true, name: T('مركز الإصابات الطارئة (تجريبي)', 'Emergency Trauma Centre (demo)'), tag: T('مستشفى 2', 'Hospital 2'), short: T('مركز الإصابات الطارئة', 'the Emergency Trauma Centre') }
    ];
    var KINDS = [
      { k: 'fire', tone: '--danger', icon: 'fire', name: T('إطفاء وإنقاذ', 'Fire & rescue') },
      { k: 'police', tone: '--info', icon: 'shield', name: T('شرطة', 'Police') },
      { k: 'hospital', tone: '--safe', icon: 'plus', name: T('مستشفى', 'Hospital') }
    ];
    var S = { load: 0.8, trauma: false, jam: {}, focus: 'fire', last: {} }, MK = 1;
    var edgeEls = {}, unitEls = {}, routeG, results = $('#fast-results'), live = $('#fast-live'), chart = $('#fast-chart'), liveTimer = 0, lastSig = '';

    function factor(e, load) { var f = Math.max(0.15, 1 - load * CLASS[e.cls].sens), j = S.jam[e.id] || 0; if (j === 1) f = Math.max(0.05, f * 0.2); return f; }
    function edgeTime(e, load) { return e.km / (CLASS[e.cls].kmh * factor(e, load)) * 60; }           // minutes
    function edgeFree(e) { return e.km / CLASS[e.cls].kmh * 60; }
    function dijkstra(weight, load) {
      var dist = {}, prev = {}, done = {}, keys = Object.keys(N);
      keys.forEach(function (k) { dist[k] = Infinity; }); dist[SCENE] = 0;
      for (var n = 0; n < keys.length; n++) {
        var u = null; keys.forEach(function (k) { if (!done[k] && (u === null || dist[k] < dist[u])) u = k; });
        if (u === null || dist[u] === Infinity) break; done[u] = 1;
        EDGES.forEach(function (e) {
          if (S.jam[e.id] === 2) return;                                   // closed: removed
          var v = e.a === u ? e.b : e.b === u ? e.a : null; if (v === null) return;
          var w = dist[u] + weight(e, load); if (w < dist[v]) { dist[v] = w; prev[v] = { n: u, e: e }; }
        });
      }
      return { dist: dist, prev: prev };
    }
    function solve(load) {
      var tm = dijkstra(edgeTime, load), ds = dijkstra(function (e) { return e.km; }, load);
      var out = {};
      UNITS.forEach(function (u) {
        if (u.kind === 'hospital' && S.trauma && !u.trauma) return;       // capability beats speed
        if (tm.dist[u.node] === Infinity) return;
        var path = [], cur = u.node; while (cur !== SCENE) { var p = tm.prev[cur]; path.push(p); cur = p.n; }
        var delay = 0, worst = null;
        path.forEach(function (p) { var d = edgeTime(p.e, load) - edgeFree(p.e); if (d > delay) { delay = d; worst = p.e; } });
        var spurMin = u.spur / CLASS.Lc.kmh * 60 / (Math.max(0.15, 1 - load * CLASS.Lc.sens));
        // the SHORTEST route (what "nearest" would drive) and the road on it that costs the most time right now: the honest reason it may lose
        var kp = [], kc = u.node, kDelay = 0, kWorst = null; while (kc !== SCENE) { var q = ds.prev[kc]; kp.push(q); kc = q.n; }
        kp.forEach(function (q) { var d = edgeTime(q.e, load) - edgeFree(q.e); if (d > kDelay + 1e-9) { kDelay = d; kWorst = q.e; } });
        out[u.id] = { u: u, eta: tm.dist[u.node] + spurMin, km: ds.dist[u.node] + u.spur, path: path, worst: worst, delay: delay, kmWorst: kWorst, kmDelay: kDelay };
      });
      return out;
    }
    function pick(kind, sol) {
      var c = Object.keys(sol).map(function (k) { return sol[k]; }).filter(function (r) { return r.u.kind === kind; });
      if (!c.length) return null;
      var byEta = c.slice().sort(function (x, y) { return x.eta - y.eta; }), byKm = c.slice().sort(function (x, y) { return x.km - y.km; });
      return { chosen: byEta[0], runner: byEta[1] || null, nearest: byKm[0], all: c };
    }
    function roadName(e) { return L(NAMES[e.name]) + (e.seg ? ' ' + e.seg : ''); }
    function whyOf(p) {
      if (!p) return '';
      var c = p.chosen, n = p.nearest;
      if (c === n) return { same: true, text: L(T('الأقرب مسافةً هو الأسرع الآن.', 'The nearest by distance is also the fastest right now.')) };
      var extra = c.km - n.km, gain = (n.eta - c.eta) * 60, road = n.kmWorst || n.worst, st = road && S.jam[road.id] === 1 ? T('مزدحم (من اختيارك)', 'jammed (your choice)') : T('بطيء بسبب الازدحام', 'slow in heavy traffic');
      if (n.eta === Infinity) return { same: false, text: '' };
      var name = c.u.short;
      return { same: false, text: L(T(L(name) + ' أبعد بـ ' + M.num(extra, 1) + ' كم لكنها أسرع بـ ' + dur(gain) + (road ? ': الأقرب مسافةً يمرّ بـ«' + roadName(road) + '» وهو ' + L(st) : ''),
        L(name) + ' is ' + M.num(extra, 1) + ' km farther but ' + dur(gain) + ' faster' + (road ? ': the nearest one’s shortest route uses ' + roadName(road) + ', which is ' + L(st) : ''))) };
    }

    function scaleMarks() {                                      // markers and the incident label grow on narrow screens so their text stays legible
      $$('.mk', svg).forEach(function (g) { g.setAttribute('transform', 'translate(' + g.getAttribute('data-x') + ' ' + g.getAttribute('data-y') + ') scale(' + MK + ')'); });
      var sc = $('.scene', svg); if (sc) { var gp = N[SCENE]; sc.setAttribute('transform', 'translate(' + gp[0] + ' ' + gp[1] + ') scale(' + MK + ') translate(' + (-gp[0]) + ' ' + (-gp[1]) + ')'); }
    }
    function build() {
      clear(svg);
      svg.setAttribute('aria-label', L(T('خريطة طرق افتراضية: انقر طريقًا ليزدحم أو يُغلق', 'A fictional road map: click a road to jam or close it')));
      var roads = sv('g', {}, svg);
      EDGES.forEach(function (e) {
        var p = N[e.a], q = N[e.b], d = 'M' + p[0] + ' ' + p[1] + 'L' + q[0] + ' ' + q[1], g = sv('g', { 'class': 'rd', tabindex: '0', role: 'button', 'data-e': e.id }, roads);
        sv('path', { 'class': 'rd-hit', d: d }, g); sv('path', { 'class': 'rd-base', d: d, 'stroke-width': e.cls === 'A' ? 19 : 13 }, g); sv('path', { 'class': 'rd-col', d: d, 'stroke-width': e.cls === 'A' ? 10 : 6 }, g);
        var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; sv('path', { 'class': 'rd-x', d: 'M' + (mx - 7) + ' ' + (my - 7) + 'L' + (mx + 7) + ' ' + (my + 7) + 'M' + (mx + 7) + ' ' + (my - 7) + 'L' + (mx - 7) + ' ' + (my + 7) }, g);
        g.addEventListener('click', function () { cycle(e.id); });
        g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cycle(e.id); } });
        edgeEls[e.id] = g;
      });
      routeG = sv('g', { 'pointer-events': 'none' }, svg);
      // the incident
      var gp = N[SCENE], sc = sv('g', { 'class': 'scene', 'pointer-events': 'none' }, svg);
      sv('circle', { cx: gp[0], cy: gp[1], r: 17 }, sc); var ex = sv('path', { d: 'M' + gp[0] + ' ' + (gp[1] - 8) + 'v10M' + gp[0] + ' ' + (gp[1] + 7) + 'h0.01', stroke: 'var(--danger)', 'stroke-width': 3.4, 'stroke-linecap': 'round', fill: 'none' }, sc);
      var st = sv('text', { 'class': 'scene-t', x: gp[0], y: gp[1] - 24, 'text-anchor': 'middle' }, sc); st.setAttribute('data-role', 'scene');
      // units
      var ug = sv('g', { 'pointer-events': 'none' }, svg);
      UNITS.forEach(function (u) {
        var kd = KINDS.filter(function (k) { return k.k === u.kind; })[0], np = N[u.node], mp = [np[0] + u.off[0], np[1] + u.off[1]];
        u.pos = mp;
        sv('path', { d: 'M' + np[0] + ' ' + np[1] + 'L' + mp[0] + ' ' + mp[1], stroke: 'var(--line-2)', 'stroke-width': 5, 'stroke-linecap': 'round' }, ug);
        var g = sv('g', { 'class': 'mk', transform: 'translate(' + mp[0] + ' ' + mp[1] + ') scale(' + MK + ')' }, ug); g.setAttribute('data-x', mp[0]); g.setAttribute('data-y', mp[1]); g.style.setProperty('--sc', 'var(' + kd.tone + ')');
        sv('circle', { 'class': 'ring', r: 21 }, g); sv('circle', { 'class': 'bg', r: 15 }, g);
        var ic = sv('g', { transform: 'translate(-9 -9) scale(.75)', 'class': 'icg' }, g);
        if (kd.icon === 'plus') sv('path', { 'class': 'ic', d: 'M12 5v14M5 12h14' }, ic); else { setStaticHTML(ic, iconInner(kd.icon)); $$('path,circle,rect', ic).forEach(function (n) { n.setAttribute('class', 'ic'); }); }
        var tx = sv('text', { 'class': 'mk-t', x: 0, y: u.off[1] < 0 ? -24 : 31, 'text-anchor': 'middle' }, g); unitEls[u.id] = { g: g, t: tx };
      });
      scaleMarks();
    }
    function cycle(id) { S.jam[id] = ((S.jam[id] || 0) + 1) % 3; update(true); }

    function polyFor(r) {
      var pts = [r.u.pos, N[r.u.node]], cur = r.u.node;
      r.path.forEach(function (p) { pts.push(N[p.n]); });
      return 'M' + pts.map(function (q) { return q[0] + ' ' + q[1]; }).join('L');
    }
    function drawRoutes(picks) {
      clear(routeG);
      var p = picks[S.focus]; if (!p) return;
      if (p.runner) sv('path', { 'class': 'route alt', d: polyFor(p.runner) }, routeG);
      sv('path', { 'class': 'route halo', d: polyFor(p.chosen) }, routeG);
      sv('path', { 'class': 'route', d: polyFor(p.chosen) }, routeG);
    }
    function chartDraw(sol) {
      var kind = S.focus, units = UNITS.filter(function (u) { return u.kind === kind && !(u.kind === 'hospital' && S.trauma && !u.trauma); });
      clear(chart);
      var X0 = 34, X1 = 308, Y0 = 16, Y1 = 124, maxEta = 1;
      var series = units.map(function (u) { var pts = []; for (var T_ = 0; T_ <= 20; T_++) { var l = T_ / 20, saved = S.load; var s2 = solveLoad(l); var r = s2[u.id]; var v = r ? r.eta : null; pts.push([l, v]); if (v && v > maxEta) maxEta = v; } return { u: u, pts: pts }; });
      maxEta = Math.ceil(maxEta / 5) * 5; if (maxEta < 10) maxEta = 10;
      var x = function (l) { return X0 + (X1 - X0) * l; }, y = function (v) { return Y1 - (Y1 - Y0) * Math.min(1, v / maxEta); };
      for (var gy = 0; gy <= 2; gy++) { var yy = Y0 + (Y1 - Y0) * gy / 2; sv('line', { 'class': 'ch-axis', x1: X0, x2: X1, y1: yy, y2: yy, opacity: gy === 2 ? 1 : 0.5 }, chart); var tt = sv('text', { 'class': 'ch-t', x: X0 - 5, y: yy + 3, 'text-anchor': 'end' }, chart); tt.textContent = String(Math.round(maxEta * (1 - gy / 2))); }
      [0, 0.5, 1].forEach(function (l) { var tt2 = sv('text', { 'class': 'ch-t', x: x(l), y: Y1 + 14, 'text-anchor': l === 0 ? 'start' : l === 1 ? 'end' : 'middle' }, chart); tt2.textContent = Math.round(l * 100) + '%'; });
      var yl = sv('text', { 'class': 'ch-t', x: X0, y: 9, 'text-anchor': 'start' }, chart); yl.textContent = L(T('دقائق (SIM)', 'minutes (SIM)'));
      var cols = ['var(--brand)', 'var(--accent)', 'var(--info)'], colsT = ['var(--brand-t)', 'var(--accent-t)', 'var(--info-t)'];   // lines use the plain colour, the small labels the AA-safe text variant
      series.forEach(function (s, i) {
        var d = ''; s.pts.forEach(function (p, j) { if (p[1] == null) return; d += (d ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
        sv('path', { 'class': 'ch-line', d: d, stroke: cols[i % 3] }, chart);
        var nowEta = sol[s.u.id] ? sol[s.u.id].eta : null; if (nowEta != null) sv('circle', { 'class': 'ch-dot', cx: x(S.load), cy: y(nowEta), r: 5, fill: cols[i % 3] }, chart);
        var lt = sv('text', { 'class': 'ch-t', x: X1 - 2, y: y(s.pts[s.pts.length - 1][1] || 0) + (i ? 12 : -5), 'text-anchor': 'end', fill: cols[i % 3] }, chart); lt.setAttribute('style', 'fill:' + colsT[i % 3] + ';font-weight:700'); lt.textContent = L(s.u.tag);
      });
      sv('line', { 'class': 'ch-now', x1: x(S.load), x2: x(S.load), y1: Y0, y2: Y1 }, chart);
    }
    function solveLoad(l) { return solve(l); }

    function update(announce) {
      var sol = solve(S.load), picks = {};
      KINDS.forEach(function (k) { picks[k.k] = pick(k.k, sol); });
      // edges
      EDGES.forEach(function (e) {
        var f = factor(e, S.load), j = S.jam[e.id] || 0, c = j === 2 ? 'shut' : f > 0.7 ? 'ok' : f > 0.38 ? 'mid' : 'bad', g = edgeEls[e.id];
        g.setAttribute('data-c', c);
        var stTxt = j === 2 ? L(T('مغلق', 'closed')) : j === 1 ? L(T('مزدحم بقرارك', 'jammed by you')) : c === 'ok' ? L(T('سالك', 'clear')) : c === 'mid' ? L(T('بطيء', 'slow')) : L(T('مزدحم', 'jammed'));
        g.setAttribute('aria-label', roadName(e) + ': ' + stTxt + '. ' + L(T('اضغط لتغيير الحالة: سالك، مزدحم، مغلق.', 'Press to change: normal, jammed, closed.')));
        g.setAttribute('aria-pressed', j ? 'true' : 'false');
      });
      // markers
      UNITS.forEach(function (u) {
        var pk = picks[u.kind], isPick = pk && pk.chosen.u === u; unitEls[u.id].g.classList.toggle('pick', !!isPick);
        unitEls[u.id].t.textContent = L(u.tag);
        unitEls[u.id].g.style.opacity = (u.kind === 'hospital' && S.trauma && !u.trauma) ? 0.35 : 1;
      });
      var st = $('[data-role=scene]', svg); if (st) st.textContent = L(T('الحادث', 'Incident'));
      svg.setAttribute('aria-label', L(T('خريطة طرق افتراضية (SIM): انقر طريقًا ليزدحم أو يُغلق ثم يعود', 'A fictional road map (SIM): click a road to jam it, close it, then reopen it')));
      drawRoutes(picks);
      // results
      clear(results); results.setAttribute('aria-label', L(T('الوحدات الموصى بها (SIM)', 'Recommended units (SIM)')));
      var sig = [];
      KINDS.forEach(function (kd) {
        var p = picks[kd.k]; if (!p) return;
        var why = whyOf(p), c = p.chosen;
        var b = el('button', 'fr-card'); b.type = 'button'; b.setAttribute('aria-pressed', S.focus === kd.k ? 'true' : 'false'); b.style.setProperty('--sc', 'var(' + kd.tone + ')'); b.dataset.pick = kd.k; b.dataset.unit = c.u.id;
        var ic = el('span', 'fr-ic'); setStaticHTML(ic, kd.icon === 'plus' ? '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' : M.icon(kd.icon)); b.appendChild(ic);
        var mid = el('span'); mid.appendChild(el('span', 'fr-k', L(kd.name) + (kd.k === 'hospital' && S.trauma ? ' · ' + L(T('يحتاج مركز إصابات', 'needs trauma centre')) : ''))); mid.appendChild(el('div', 'fr-name', L(c.u.name))); b.appendChild(mid);
        var eta = el('span', 'fr-eta num'); eta.appendChild(el('span', null, mmss(c.eta * 60))).setAttribute('aria-hidden', 'true'); eta.appendChild(el('span', 'sr-only', dur(c.eta * 60) + ' (SIM)')); eta.appendChild(el('small', null, 'SIM · ' + M.num(c.km, 1) + ' km')); b.appendChild(eta);
        var wy = el('p', 'fr-why');
        if (!why.same && why.text) { wy.appendChild(el('span', 'tag safe', L(T('أبعد لكنه أسرع', 'farther but faster')))); }
        else if (kd.k === 'hospital' && S.trauma && p.nearest !== p.chosen) { wy.appendChild(el('span', 'tag info', L(T('القدرة أولًا', 'capability first')))); }
        wy.appendChild(document.createTextNode(kd.k === 'hospital' && S.trauma ? L(T('المصاب يحتاج مركز إصابات: يُختار المستشفى القادر، لا الأقرب.', 'The patient needs a trauma centre: the capable hospital is chosen, not the nearest.')) : why.text));
        b.appendChild(wy);
        b.addEventListener('click', function () { S.focus = kd.k; update(false); });
        results.appendChild(b); sig.push(kd.k + ':' + c.u.id);
      });
      chartDraw(sol);
      var ch = $('#fast-chart-h'); if (ch) { var kd2 = KINDS.filter(function (k) { return k.k === S.focus; })[0]; ch.textContent = L(T('زمن الوصول مقابل الازدحام: ', 'ETA against traffic: ')) + L(kd2.name) + ' (SIM)'; }
      var lv = $('#fast-load-v'); if (lv) lv.textContent = Math.round(S.load * 100) + '%';
      var sg = sig.join('|');
      if (sg !== lastSig) { lastSig = sg; if (announce !== 'silent') { clearTimeout(liveTimer); liveTimer = setTimeout(function () { live.textContent = L(T('الوحدات الموصى بها: ', 'Recommended units: ')) + results.textContent.replace(/\s+/g, ' ').slice(0, 400); }, 500); } }
      S.last = picks;
    }
    function init() {
      build();
      var slider = $('#fast-load'), tr = $('#fast-trauma');
      function fill() { slider.style.setProperty('--p', slider.value + '%'); }
      slider.addEventListener('input', function () { S.load = +slider.value / 100; fill(); update(false); });
      $$('[data-load]').forEach(function (b) { b.addEventListener('click', function () { slider.value = b.getAttribute('data-load'); S.load = +slider.value / 100; fill(); update(false); }); });
      fill();
      tr.addEventListener('change', function () { S.trauma = tr.checked; update(false); });
      $('#fast-reset').addEventListener('click', function () { S.jam = {}; update(false); });
      svg.setAttribute('role', 'group');
      function fit() { var w = svg.getBoundingClientRect().width; if (w < 40) return; var k = clamp(560 / w, 1, 1.6); if (Math.abs(k - MK) < 0.02) return; MK = k; scaleMarks(); }

      if ('ResizeObserver' in window) new ResizeObserver(fit).observe(svg); else window.addEventListener('resize', fit);
      onLang(function () { build(); update('silent'); fit(); });
      update('silent');
    }
    return { init: init, state: function () { return { load: S.load, trauma: S.trauma, jam: S.jam, picks: Object.keys(S.last).reduce(function (o, k) { var p = S.last[k]; o[k] = p ? { chosen: p.chosen.u.id, nearest: p.nearest.u.id, eta: p.chosen.eta, runner: p.runner && p.runner.u.id } : null; return o; }, {}) }; }, jam: function (id, v) { S.jam[id] = v; update(false); }, setLoad: function (v) { S.load = v; var s = $('#fast-load'); if (s) { s.value = String(Math.round(v * 100)); s.style.setProperty('--p', s.value + '%'); } update(false); } };
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
      if (hero) hero.repaint();
    });
    window.addEventListener('afterprint', function () {
      if (printedFrom) { document.documentElement.dataset.theme = printedFrom; printedFrom = null; }
      if (hero) hero.repaint();
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
    [hero && hero.init, initCounters, initPipeline, initProof, fast && fast.init, initHazards, persona && persona.init, initLangs, initTruth, initSweep, initSubnav, initPlaceholders].forEach(function (fn) {
      if (typeof fn !== 'function') return;
      try { fn(); } catch (e) { if (window.console) console.error(e); }
    });
    window.__manaraHome = { ready: true, hero: hero, fast: fast, persona: persona, PERSONA_MSG: PERSONA_MSG, HZ: HZ.map(function (h) { return h.id; }) };
    window.__homeReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
