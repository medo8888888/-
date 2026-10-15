/* MANARA («منارة») — Robot Rescue Lab («مختبر الروبوت»)  →  js/robot.js   (window.RobotLab is a small test/automation API)
 * ==========================================================================================
 * A page that lets a judge WATCH and OPERATE the SIMULATED rescue robot (ManaraSim section 10b, scenario 'fire-night-robot': 04:00, a fire in room 303,
 * Stair A locked, room 308's door locked, Abu Salem — a wheelchair user — stuck in a smoke-filled corridor).
 *   1. the building cut-away on a canvas (floor plans: rooms, corridors, stairs, roof door, refuge balcony, door states, fire + smoke, residents by state,
 *      the robot, its trail and planned path, relay + route beacons, search-coverage shading, link-range rings; floor tabs; zoom + pan);
 *   2. the ROBOT-EYE panel (a schematic render of ManaraSim.robotView: smoke fog, thermal false colour, people boxes, 'possible person' false positives) + HUD;
 *   3. the control panel with the human-key logic (simulated roles; an operator requests, ONLY the incident commander approves) and the operator calls
 *      (recall, search priority, go-to, speak-via, door obstacles);
 *   4. FINDS, the headcount board (a separate 'located by robot' bucket) and the hand-off card block;  5. the event log (aria-live polite);
 *   6. the assumptions drawer (all 51 robot PARAMS as sliders), the A/B + sensitivity panels (abRobot / sweepRobot, run on demand);  7. clock controls.
 * HONESTY  the robot is a CONCEPT with a SIMULATED prototype (not built, not tested; a real one needs the authority's approval); it assists, firefighters
 *   decide; every number is computed by the simulation or is a named assumption, and is labelled SIM; detection is rule-based (never "AI"); the roles are simulated
 *   (no real authentication); the robot-eye picture is a schematic render of the simulation's view data, not a camera feed.
 * LAWS  classic script (IIFE, no modules, no fetch: works from file://); logical CSS only; every string bilingual (data-l spans / B(ar,en) / Manara.L);
 *   canvas colours come from the tokens (getComputedStyle) and redraw on 'themechange'; sim text is shown with textContent only; prefers-reduced-motion respected
 *   (no pulsing, no interpolation, no flashing; the strobe is opt-in, ≤ 3 Hz, with the photosensitivity warning).
 * ========================================================================================== */
(function () {
  'use strict';
  var Manara = window.Manara, Sim = window.ManaraSim, MSG = window.MANARA_MSG || null;
  var root = document.getElementById('rl');
  if (!Manara || !Sim || !root) { return; }
  var doc = document, htmlEl = doc.documentElement;
  var NS_SVG = 'http://www.w3.org/2000/svg';
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var MR = MSG && MSG.robot ? MSG.robot : null;
  var CELL = (Sim.GRID && Sim.GRID.cellM) || 5;

  /* ====================================================================================
   * 1. SMALL HELPERS
   * ==================================================================================== */
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  function lang() { return Manara.lang(); }
  function B(ar, en) { return lang() === 'en' ? en : ar; }
  function LL(o) { return o ? Manara.L(o) : ''; }
  function N(n, d) { return Manara.num(n, d); }
  function mmss(sec) { if (!isNum(sec)) return '–'; sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function T(ar, en) { return { ar: ar, en: en }; }
  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setAttr(el, k, v) { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v); }
  function setCls(el, cls, on) { if (el) el.classList.toggle(cls, !!on); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function pct(v) { return Math.round(v * 100); }

  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) add(el, c[i]); }
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(doc.createTextNode(String(c)));
  }
  // h('div', {class:'x', onclick:fn, 'aria-label':'..'}, child, child, ...)  — text is always a text node (never innerHTML)
  function h(tag, a) {
    var el = doc.createElement(tag);
    if (a) for (var k in a) {
      var v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function sv(tag, a) {
    var el = doc.createElementNS(NS_SVG, tag);
    if (a) for (var k in a) { if (a[k] != null) el.setAttribute(k, a[k]); }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  // bilingual static text: both languages are in the DOM, CSS (html[data-lang]) shows one — no re-render on langchange
  function bi(ar, en, tag) {
    return h(tag || 'span', { class: 'bi' }, h('span', { 'data-l': 'ar', text: ar }), h('span', { 'data-l': 'en', text: en }));
  }
  // bilingual attribute (aria-label / title / placeholder): re-applied on langchange
  function lab(el, attr, ar, en) {
    el.setAttribute('data-lab-' + attr, ar + '\u0001' + en);
    el.setAttribute(attr, B(ar, en));
    return el;
  }
  function relabel() {
    $$('[data-lab-aria-label],[data-lab-title],[data-lab-placeholder],[data-lab-alt]').forEach(function (el) {
      ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (a) {
        var v = el.getAttribute('data-lab-' + a); if (v == null) return;
        var p = v.split('\u0001'); el.setAttribute(a, B(p[0], p[1]));
      });
    });
  }
  function ic(name, cls) { var t = doc.createElement('template'); t.innerHTML = Manara.icon(name, cls); return t.content.firstChild; }   // Manara.icon() is a static, safe string
  var XICON = {
    robot: '<rect x="4" y="8" width="16" height="9" rx="2.5"/><path d="M12 8V4.500M9.500 4.500h5"/><circle cx="9" cy="12.500" r="1.400"/><circle cx="15" cy="12.500" r="1.400"/><path d="M3 20h18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.500-2"/>',
    step: '<path d="M5 4l9 8-9 8z"/><path d="M19 5v14"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.500-4.500M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.500-4.500M8 11h6"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    layers2: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    wheelchair: '<circle cx="10" cy="4" r="1.800"/><path d="M10 7v6h5l3 5M10 13a5 5 0 1 0 5 6"/>'
  };
  function icon(name, cls) {
    if (!XICON[name]) return ic(name, cls);
    var s = sv('svg', { 'class': 'i' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
    var t = doc.createElement('template'); t.innerHTML = '<svg xmlns="' + NS_SVG + '">' + XICON[name] + '</svg>';
    var kids = t.content.firstChild.childNodes; while (kids.length) s.appendChild(kids[0]);
    return s;
  }

  // colour handling (tokens → canvas colours)
  var colorCtx = (function () { var c = doc.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d'); })();
  function parseColor(v) {
    v = (v || '').trim(); if (!v) return [128, 128, 128];
    colorCtx.fillStyle = '#808080'; colorCtx.fillStyle = v;
    var s = colorCtx.fillStyle;
    if (s.charAt(0) === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  var COL = {};
  var TOKS = ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'head', 'brand', 'accent', 'safe', 'warn', 'danger', 'info', 'fire-1', 'fire-2', 'fire-3'];
  var FONT = 'system-ui, sans-serif', MONO = 'monospace';
  function readColors() {
    var cs = getComputedStyle(htmlEl);
    TOKS.forEach(function (t) { COL[t] = parseColor(cs.getPropertyValue('--' + t)); });
    var bf = getComputedStyle(doc.body).fontFamily; if (bf) FONT = bf;
    var mf = cs.getPropertyValue('--font-m'); if (mf) MONO = mf;
  }
  function C(n) { return COL[n] || [128, 128, 128]; }
  function isDark() { return htmlEl.dataset.theme === 'dark'; }
  function rrect(ctx, x, y, w, hh, r) {
    r = Math.min(r, w / 2, hh / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function haloText(ctx, s, x, y, color, halo, w) {
    ctx.lineJoin = 'round'; ctx.lineWidth = w || 3; ctx.strokeStyle = halo; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  /* ====================================================================================
   * 2. DOMAIN CONSTANTS (labels are bilingual; numbers come from the simulation)
   * ==================================================================================== */
  var SIM_LABEL = T('محاكاة — فحص لآلية العمل، وليست دليلاً على الأثر', 'SIMULATION — a mechanism check, not proof of impact');
  var ROBOT_SIM = T('الروبوت مفهوم بنموذج أولي محاكى — لم يُبنَ ولم يُجرَّب. يساعد، ورجال الإطفاء هم من يقرّر.', 'The robot is a concept with a simulated prototype — not built, not tested. It assists; firefighters decide.');
  var ROBOT_STATE = {   // colour token per state
    stowed: '--muted', approved: '--info', deploying: '--info', searching: '--accent', guiding: '--safe', holding: '--warn', returning: '--warn', fault: '--danger'
  };
  var STATE_FALLBACK = {
    stowed: T('في مكانه (جاهز)', 'Stowed (ready)'), approved: T('معتمد — ينتظر النشر', 'Approved — waiting to deploy'), deploying: T('يُجهَّز عند المدخل', 'Deploying at the entrance'),
    searching: T('يبحث', 'Searching'), guiding: T('يرشد', 'Guiding'), holding: T('يبقى مع شخص', 'Holding with a person'), returning: T('يعود', 'Returning'), fault: T('عطل', 'Fault')
  };
  function stateName(st) {
    var L = Sim.robot && Sim.robot.STATE_LABELS && Sim.robot.STATE_LABELS[st];
    return LL(L || STATE_FALLBACK[st] || T(st, st));
  }
  var ROLES = ['viewer', 'operator', 'commander'];
  var ROLE_NAME = { viewer: T('مشاهد', 'Viewer'), operator: T('مشغّل', 'Operator'), commander: T('قائد الحادث', 'Incident commander') };
  var ROLE_HELP = {
    viewer: T('يشاهد فقط', 'Can only watch'),
    operator: T('يطلب النشر ويشغّل', 'Requests deployment, operates'),
    commander: T('وحده يعتمد النشر', 'The only one who approves')
  };
  var PERSON_ST = {   // colour token + name per displayed state
    asleep:   { tok: '--info',   name: T('نائم', 'Asleep') },
    alerted:  { tok: '--warn',   name: T('نُبِّه', 'Alerted') },
    moving:   { tok: '--brand',  name: T('يتحرك', 'Moving') },
    safe:     { tok: '--safe',   name: T('بأمان', 'Safe') },
    help:     { tok: '--danger', name: T('يحتاج مساعدة', 'Needs help') },
    located:  { tok: '--accent', name: T('عُثر عليه بالروبوت', 'Located by robot') },
    unacc:    { tok: '--muted',  name: T('غير محسوب', 'Unaccounted') },
    calm:     { tok: '--ink-2',  name: T('مستيقظ (لا إنذار بعد)', 'Awake (no alert yet)') }
  };
  var LEGEND_ORDER = ['asleep', 'calm', 'alerted', 'moving', 'safe', 'help', 'located', 'unacc'];
  var EXIT_STATE = {
    OPEN:   { tok: '--safe',   name: T('مفتوح', 'OPEN') },
    SMOKE:  { tok: '--warn',   name: T('دخان', 'SMOKE') },
    FIRE:   { tok: '--danger', name: T('نار', 'FIRE') },
    LOCKED: { tok: '--muted',  name: T('مقفل', 'LOCKED') }
  };
  var HERO_NAME = { ravi: T('رافي', 'Ravi'), huda: T('هدى', 'Huda'), 'abu-salem': T('أبو سالم', 'Abu Salem'), lina: T('لينا', 'Lina') };
  var NEED_L = { wheelchair: T('كرسي متحرك', 'Wheelchair'), deaf: T('أصمّ', 'Deaf'), blind: T('كفيف', 'Blind'), elderly: T('مسنّ', 'Elderly'), child: T('طفل', 'Child'), asthma: T('ربو', 'Asthma') };
  var COND_FALLBACK = { conscious: T('واعٍ', 'conscious'), asleep: T('نائم (أو فاقد الوعي)', 'asleep (or unconscious)'), unresponsive: T('لا يستجيب', 'not responding'), injured: T('مصاب', 'injured'), moving: T('يتحرك', 'moving') };
  function condName(key) { return LL(COND_FALLBACK[key] || T(key || '', key || '')); }
  var BY_L = { thermal: T('الكاميرا الحرارية', 'thermal camera'), camera: T('الكاميرا العادية', 'visible camera'), audio: T('الصوت', 'sound'), 'camera+audio': T('الكاميرا والصوت', 'camera + sound') };
  var LANGS = [
    { id: 'ar', name: 'العربية', en: 'Arabic', dir: 'rtl' }, { id: 'en', name: 'English', en: 'English', dir: 'ltr' },
    { id: 'ml', name: 'മലയാളം', en: 'Malayalam', dir: 'ltr' }, { id: 'ne', name: 'नेपाली', en: 'Nepali', dir: 'ltr' },
    { id: 'bn', name: 'বাংলা', en: 'Bengali', dir: 'ltr' }, { id: 'ur', name: 'اردو', en: 'Urdu', dir: 'rtl' },
    { id: 'hi', name: 'हिन्दी', en: 'Hindi', dir: 'ltr' }, { id: 'tl', name: 'Tagalog', en: 'Tagalog', dir: 'ltr' }
  ];
  var DRAFT_LANG = { ml: 1, ne: 1, bn: 1, ur: 1, hi: 1, tl: 1 };
  var DRAFT_NOTICE = T('مسودة — تحتاج مراجعة متحدث أصلي', 'Draft — needs native-speaker review');
  var SAY_KEYS = [
    ['intro', T('أعرّف بنفسي', 'Introduce myself')], ['guide', T('أرشد إلى المخرج', 'Guide to the exit')], ['wake', T('أوقظ', 'Wake up')],
    ['stay', T('ابقَ هنا', 'Stay here')], ['refuge', T('إلى شرفة اللجوء', 'Go to the refuge')], ['hold', T('أبقى معك', 'I stay with you')],
    ['check', T('هل تسمعني؟', 'Can you hear me?')], ['blocked', T('الطريق مغلق', 'This way is blocked')], ['hood', T('ارتدِ غطاء الدخان', 'Put on the hood')]
  ];
  var AREAS = [   // the 51 robot assumptions grouped for the drawer (any key not listed lands in "other")
    { id: 'approval', label: T('الاعتماد والنشر', 'Approval & deployment'), keys: ['robotApproveSec', 'robotCarrier', 'robotDeploySec', 'robotUnloadSec'] },
    { id: 'mobility', label: T('الحركة', 'Mobility'), keys: ['robotSpeedWheeled', 'robotSpeedTracked', 'robotStairPenalty', 'robotStairDrain', 'robotSmokeSlowPct', 'robotOpensDoors', 'robotDoorSec'] },
    { id: 'heat', label: T('الحرارة', 'Heat'), keys: ['robotMaxTempC', 'robotHeatWarnC', 'robotHeatSoakSec', 'robotRoomC'] },
    { id: 'battery', label: T('البطارية', 'Battery'), keys: ['robotBattMin', 'robotTrackedDrain', 'robotHeatDrain', 'robotSmokeDrain', 'robotIdleDrain', 'robotReturnPct'] },
    { id: 'sensors', label: T('الحسّاسات والكشف', 'Sensors & detection'), keys: ['robotRangeM', 'robotThermalPd', 'robotContrastC', 'robotThermalSmokeK', 'robotRgbSmokeK', 'robotRgbPd', 'robotAudioPd', 'robotAudioRangeM', 'robotNoiseMask'] },
    { id: 'false', label: T('الإنذارات الكاذبة والمسح', 'False alarms & sweeps'), keys: ['robotFalsePosPerMin', 'robotInvestigateSec', 'robotRoomSweepSec', 'robotRecheckPasses'] },
    { id: 'link', label: T('الاتصال', 'Link'), keys: ['robotMeshRangeM', 'robotFloorLossM', 'robotBeaconRelay', 'robotDropoutPct', 'robotDropoutSec', 'robotLinkLostSec'] },
    { id: 'behaviour', label: T('السلوك', 'Behaviour'), keys: ['robotFollowP', 'robotWakeP', 'robotWakeTries', 'robotHoldMaxSec', 'robotGuideSec', 'robotBeacons', 'robotBeaconsPerFind', 'robotHoods', 'robotHoodFactor', 'robotCrewSpeedup', 'robotStatusSec'] }
  ];
  // the scenarios the lab offers: the robot scenario plus the other building fires / gas leaks the robot supports
  var SCENARIOS = ['fire-night-robot', 'fire-night', 'gas-night', 'school-fire-day'];
  function presetName(id) { var p = Sim.PRESETS[id]; return p ? LL(p.name) + (id === 'fire-night-robot' ? '' : B(' + روبوت', ' + robot')) : id; }

  /* ====================================================================================
   * 3. THE BUILDING (from ManaraSim.worldInfo(): nodes, edges, exits) — the floor plans are drawn from the same graph the robot searches
   * ==================================================================================== */
  var WI = Sim.worldInfo();
  var GEO = {};
  function roomy(n) { return n.type === 1 || n.type === 4 || n.type === 5 || n.type === 7; }
  function geomOf(si) {
    if (GEO[si]) return GEO[si];
    var S = WI.structs[si], g = { si: si, S: S, id: S.id, floors: S.floors, nodes: S.nodes, byId: {}, doorOf: {}, doorWith: {}, nbr: {}, rooms: [], hasRoof: false };
    S.nodes.forEach(function (n, i) { g.byId[n.id] = i; g.nbr[n.id] = []; if (n.fl === S.floors) g.hasRoof = true; if (n.type === 1 || n.type === 7) g.rooms.push(n); });
    var d = 0;
    S.edges.forEach(function (e) {
      var a = S.nodes[g.byId[e[0]]], b = S.nodes[g.byId[e[1]]];
      g.nbr[a.id].push(b.id); g.nbr[b.id].push(a.id);
      if (e[2] & 2) { var room = roomy(a) ? a : b, other = room === a ? b : a; g.doorOf[room.id] = d; g.doorWith[room.id] = other.id; d++; }
    });
    g.floorList = []; for (var f = 0; f < S.floors; f++) g.floorList.push(f); if (g.hasRoof) g.floorList.push(S.floors);
    g.hw = si === 0 ? 0.7 : 1.0;
    return (GEO[si] = g);
  }
  function floorLabel(g, fl, short) {
    if (fl >= g.floors) return short ? B('السطح', 'Roof') : B('السطح', 'Roof');
    return short ? N(fl + 1) : B('الطابق ', 'Floor ') + N(fl + 1);
  }
  // node box in plan cells
  function nodeBox(g, n) {
    var hw = g.hw, x = n.x, y = n.y;
    if (n.type === 2) return { x0: x - hw, y0: y - 0.5, w: 2 * hw, h: 1.0, kind: 'corr' };
    if (n.type === 3) return { x0: x - 0.5, y0: y - 0.75, w: 1.0, h: 1.5, kind: 'stair' };
    if (n.type === 5) return { x0: x - 0.45, y0: y - 0.9, w: 0.9, h: 1.8, kind: 'refuge' };
    if (n.type === 6) return null;
    return { x0: x - hw + 0.03, y0: y - 1.0 + 0.03, w: 2 * hw - 0.06, h: 2.0 - 0.06, kind: n.type === 4 ? 'lobby' : n.type === 7 ? 'special' : 'room' };
  }

  /* ====================================================================================
   * 4. STATE AND SIM CONTROL
   * ==================================================================================== */
  var LAB = {
    presetId: 'fire-night-robot', variant: 'tracked', units: 1, seed: 1, params: {}, role: 'operator', preroll: true,
    sim: null, snap: null, hc: null, hcAt: -99, handoff: null, handoffAt: -99, struct: 0, g: null,
    playing: false, speed: 1, sel: 'R1', floorSel: 'auto', tool: 'inspect', eye: 'rgb', anim: 0,
    layers: { smoke: true, coverage: true, link: true, trail: true, beacons: true, people: true, labels: true },
    trail: {}, pose: {}, poseAt: 0, tickMs: 1000, evSeen: 0, log: [], logFilter: 'key', ended: false, storyOn: false, storyDone: {},
    msg: null, msgAt: 0, started: false, lastSpeech: null, strobeOk: false, sel2: null, prio: [], runs: 0
  };
  var UI = {};      // references to chrome elements
  var DIRTY = { stage: true, eye: true, ui: true };

  function robotsOf() { return LAB.snap && LAB.snap.robot ? LAB.snap.robot.robots : []; }
  function selRobot() { var rs = robotsOf(); for (var i = 0; i < rs.length; i++) if (rs[i].id === LAB.sel) return rs[i]; return rs[0] || null; }
  function rawRobot(id) { var sim = LAB.sim; if (!sim || !sim.robots) return null; for (var i = 0; i < sim.robots.length; i++) if (sim.robots[i].id === id) return sim.robots[i]; return sim.robots[0] || null; }
  function paramDef(key) { var P = Sim.PARAMS; for (var i = 0; i < P.length; i++) if (P[i].key === key) return P[i]; return null; }
  function paramNow(key) { var sim = LAB.sim; if (sim && sim.P && isNum(sim.P[key])) return sim.P[key]; var d = paramDef(key); return d ? (isNum(LAB.params[key]) ? LAB.params[key] : d.default) : 0; }

  function newRun(o) {
    o = o || {};
    var pre = Sim.PRESETS[LAB.presetId] || Sim.PRESETS['fire-night-robot'];
    var params = {}; Object.keys(LAB.params).forEach(function (k) { params[k] = LAB.params[k]; });
    var cfg = { preset: LAB.presetId, seed: LAB.seed, mode: 'manara', role: LAB.role, params: params, robot: { variant: LAB.variant, units: LAB.units, autoApprove: false } };
    var sim = Sim.create(cfg);
    LAB.sim = sim; LAB.runs++;
    LAB.struct = sim.hazard === 'fire' && sim.hz && isNum(sim.hz.struct) ? sim.hz.struct : 0;
    LAB.g = geomOf(LAB.struct);
    if (LAB.preroll && !o.noPreroll) Sim.step(sim, Math.max(0, (isNum(pre.tIgnite) ? pre.tIgnite : 30) + 8 - sim.t));
    LAB.trail = {}; LAB.pose = {}; LAB.evSeen = 0; LAB.log = []; LAB.ended = false; LAB.msg = null; LAB.lastSpeech = null; LAB.hcAt = -99; LAB.handoffAt = -99; LAB.storyDone = {};
    LAB.sel2 = null; LAB.started = false;
    if (!rawRobot(LAB.sel)) LAB.sel = 'R1';
    afterTick(true);
    return sim;
  }

  // one batch of sim time has run: refresh the snapshot, the trail, the log
  function afterTick(initial) {
    var sim = LAB.sim; if (!sim) return;
    var snap = Sim.snapshot(sim, { events: false });
    LAB.snap = snap;
    var rs = snap.robot ? snap.robot.robots : [];
    var tick = now();
    rs.forEach(function (r) {
      var p = r.pose, tr = LAB.trail[r.id] || (LAB.trail[r.id] = []), last = tr[tr.length - 1];
      if (!last || last.fl !== p.fl || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 0.02) { tr.push({ x: p.x, y: p.y, fl: p.fl, t: sim.t }); if (tr.length > 700) tr.shift(); }
      var pr = LAB.pose[r.id];
      LAB.pose[r.id] = { px: pr ? pr.cx : p.x, py: pr ? pr.cy : p.y, pfl: pr ? pr.cfl : p.fl, cx: p.x, cy: p.y, cfl: p.fl, hd: r.heading, phd: pr ? pr.hd : r.heading, speed: pr ? Math.hypot(p.x - pr.cx, p.y - pr.cy) * CELL / Math.max(0.2, (sim.t - (pr.t || sim.t - 1)) || 1) : 0, t: sim.t };
    });
    LAB.poseAt = tick; LAB.tickMs = clamp(1000 / Math.max(1, LAB.speed), 60, 1000);
    if (initial || sim.t - LAB.hcAt >= 1) { LAB.hc = Sim.headcount(sim); LAB.hcAt = sim.t; }
    var located = {}; if (LAB.hc && LAB.hc.locatedList) LAB.hc.locatedList.forEach(function (x) { located[x.key] = true; });
    LAB.located = located;
    consumeEvents();
    if (sim.done && !LAB.ended) { LAB.ended = true; LAB.playing = false; announce(B('انتهى التشغيل عند ', 'The run ended at ') + 'T+' + mmss(sim.t)); }
    if (LAB.floorSel === 'auto' && R.ctx) fitView(false);
    DIRTY.stage = DIRTY.eye = DIRTY.ui = true;
  }

  /* fast-forward (tests, the 'step' button, the story): runs whole seconds, then one refresh */
  function advance(sec) {
    var sim = LAB.sim; if (!sim) return 0;
    var t0 = sim.t, left = Math.max(0, Math.round(sec));
    while (left > 0 && !sim.done) { var n = Math.min(left, 20); Sim.step(sim, n); left -= n; storyTick(); }
    if (sim.t !== t0) afterTick();
    return sim.t - t0;
  }

  var evLast = 0;
  function consumeEvents() {
    var sim = LAB.sim, ev = sim.events;
    for (var i = LAB.evSeen; i < ev.length; i++) {
      var e = ev[i], row = eventRow(e);
      if (row) { LAB.log.push(row); }
      if (e.type === 'robot-find' && e.person === 'abu-salem') { Manara.toast({ ar: 'عُثر على أبو سالم (تقدير) — الروبوت أبلغ غرفة التحكم', en: 'Abu Salem located (est.) — the robot told the control room' }, 'safe', 5200); }
      else if (e.type === 'robot-fault') { Manara.toast(e.text, 'danger', 6000); }
    }
    LAB.evSeen = ev.length;
    if (LAB.log.length > 400) LAB.log.splice(0, LAB.log.length - 400);
  }
  var KEY_TYPES = { ignition: 1, suspect: 1, confirmed: 1, approved: 1, 'public-alert': 1, 'local-alarm': 1, 'exit-state': 1, 'dead-end': 1, flashover: 1, 'operator-role': 1, suppression: 1, rescued: 1, 'help-arrived': 1, 'unit-on-scene': 1, dispatched: 1, 'dispatch-approved': 1, safe: 1, 'fire-spread': 1, trapped: 1 };
  var ROBOT_QUIET = { 'robot-status': 1 };
  function eventRow(e) {
    var isRobot = e.type.indexOf('robot-') === 0 || e.type === 'operator-role';
    var cat = isRobot ? 'robot' : (KEY_TYPES[e.type] ? 'key' : 'other');
    var tone = e.type === 'robot-fault' || e.type === 'robot-approval-rejected' || e.type === 'robot-blocked' || e.type === 'dead-end' || e.type === 'trapped' ? 'danger'
      : e.type === 'robot-find' || e.type === 'robot-approved' || e.type === 'safe' || e.type === 'rescued' ? 'safe'
      : e.type === 'robot-false-positive' || e.type === 'robot-link' || e.type === 'robot-battery-low' || e.type === 'robot-retreat' ? 'warn'
      : isRobot ? 'cool' : e.type === 'confirmed' || e.type === 'approved' || e.type === 'public-alert' || e.type === 'ignition' ? 'brand' : '';
    return { t: e.t, type: e.type, cat: cat, tone: tone, text: e.text, quiet: !!ROBOT_QUIET[e.type] };
  }

  /* ---- operator calls: every one returns {ok, reason?}; the answer is shown, never swallowed ---- */
  function say(res, okAr, okEn) {
    LAB.msg = res && res.ok === false ? { ok: false, text: res.reason || T('تعذّر التنفيذ', 'Could not do that'), code: res.code } : { ok: true, text: T(okAr || 'تم', okEn || 'Done') };
    LAB.msgAt = now();
    DIRTY.ui = true;
    if (UI.msg) paintMsg();
    return res;
  }
  function op(fn) {
    var sim = LAB.sim; if (!sim) return null;
    var res; try { res = fn(sim); } catch (e) { res = { ok: false, reason: T('خطأ داخلي: ' + e.message, 'Internal error: ' + e.message) }; }
    if (UI.startCard) UI.startCard.hidden = true;
    consumeEvents(); afterTick(); return res;
  }
  function doRole(role) {
    if (ROLES.indexOf(role) < 0) return;
    LAB.role = role;
    var res = op(function (sim) { return Sim.setRole(sim, role); });
    say(res, 'الدور الآن: ' + LL(ROLE_NAME[role]) + ' (محاكاة)', 'Role is now: ' + ROLE_NAME[role].en + ' (simulated)');
    announce(B('الدور: ', 'Role: ') + LL(ROLE_NAME[role]));
    Manara.store('manara-robot-role', role);
  }
  function doDeploy() { var r = op(function (sim) { return Sim.deployRobot(sim); }); say(r, 'طُلب النشر — بانتظار اعتماد قائد الحادث', 'Deployment requested — waiting for the incident commander'); return r; }
  function doApprove() { var r = op(function (sim) { return Sim.approveRobot(sim); }); say(r, 'اعتمد قائد الحادث — يبدأ النشر', 'The incident commander approved — deploying'); if (r && r.ok === false && r.code === 'role') announce(LL(r.reason)); return r; }
  function doReject() { var r = op(function (sim) { return Sim.rejectRobot(sim, LAB.sel); }); say(r, 'رُفض النشر', 'Deployment declined'); return r; }
  function doRecall() { var r = op(function (sim) { return Sim.recallRobot(sim); }); say(r, 'استُدعي الروبوت إلى المدخل', 'The robot was recalled to the entrance'); return r; }
  function doPriority(list) { var r = op(function (sim) { return Sim.setSearchPriority(sim, list); }); LAB.prio = r && r.accepted ? r.accepted.slice() : LAB.prio; if (r && r.ok) say(r, list.length ? 'أولوية البحث: ' + LAB.prio.join('، ') : 'عاد الترتيب التلقائي', list.length ? 'Search priority: ' + LAB.prio.join(', ') : 'Back to the automatic order'); return r; }
  function doGoto(node) { var r = op(function (sim) { return Sim.teleopRobot(sim, LAB.sel, node); }); say(r, 'أُرسل الروبوت إلى ' + node, 'Robot sent to ' + node); return r; }
  function doObstacle(node, locked) { var r = op(function (sim) { return Sim.setRobotObstacle(sim, node, { locked: !!locked }); }); say(r, locked ? 'أُقفل ' + node : 'فُتح ' + node, locked ? node + ' is now locked' : node + ' is now open'); return r; }
  function doSpeak(key, langId) {
    var r = op(function (sim) { return Sim.speakVia(sim, LAB.sel, key, langId); });
    if (r && r.ok && r.speech) LAB.lastSpeech = { line: r.speech, to: r.to, via: 'operator', at: LAB.sim.t };
    say(r, 'تكلّم الروبوت', 'The robot spoke');
    return r;
  }
  function restart(opts) {
    LAB.playing = false; newRun(opts);
    paintAll(true);
  }
  var announceT = 0;
  function announce(s) { var el = $('#rl-announce'); if (!el) return; el.textContent = ''; clearTimeout(announceT); announceT = setTimeout(function () { el.textContent = s; }, 40); }

  /* ====================================================================================
   * 5. THE BUILDING CUT-AWAY (canvas): floor plans north-up, tokens for colour, redrawn on themechange
   * ==================================================================================== */
  var R = { cvs: null, ctx: null, dpr: 1, w: 320, h: 240, cam: { x: 6, y: 4, k: 20, fit: 20 }, layout: null, hits: [], userCam: false, hover: null, cursor: null, pointers: {}, fitKey: '' };
  var PAD = function () { return R.w >= 700 ? { t: 46, b: 44 } : { t: R.w >= 500 ? 48 : 40, b: 40 }; };
  function fireFloor() {
    var sim = LAB.sim, g = LAB.g;
    try { if (sim && sim.hazard === 'fire' && sim.hz && isNum(sim.hz.originLocal)) return clamp(g.nodes[sim.hz.originLocal].fl, 0, g.floors - 1); } catch (e) { /* default below */ }
    return 0;
  }
  // 'auto': the whole cut-away on a big stage, otherwise ONE floor that follows the robot (the fire floor while it is still stowed)
  function followFloor() {
    var r = selRobot(); if (r && r.state !== 'stowed' && r.pose && isNum(r.pose.fl)) return clamp(r.pose.fl, 0, LAB.g.floors - 1);
    return fireFloor();
  }
  function effFloorSel() { var sel = LAB.floorSel; if (sel === 'auto') sel = (R.w >= 900 && R.h >= 540) ? 'all' : followFloor(); return sel; }
  function effFloors() {
    var g = LAB.g, sel = effFloorSel();
    if (sel === 'all') return g.floorList.slice().reverse();
    return [clamp(sel, 0, g.floorList[g.floorList.length - 1])];
  }
  function stageLayout() {
    var g = LAB.g, S = g.S, floors = effFloors(), pw = S.w + 2.8, ph = S.h + 3.2, pd = PAD(), best = null;
    for (var cols = 1; cols <= Math.min(4, floors.length); cols++) {
      var rows = Math.ceil(floors.length / cols), k = Math.min((R.w * 0.98) / (cols * pw), Math.max(60, R.h - pd.t - pd.b) / (rows * ph));
      if (!best || k > best.k * 1.02) best = { cols: cols, rows: rows, k: k };
    }
    var panels = floors.map(function (fl, i) { return { fl: fl, ox: (i % best.cols) * pw, oy: Math.floor(i / best.cols) * ph, pw: pw, ph: ph }; });
    return { panels: panels, w: best.cols * pw, h: best.rows * ph, k: best.k, pw: pw, ph: ph, cols: best.cols, rows: best.rows };
  }
  function fitView(force) {
    var key = (LAB.g ? LAB.g.si : 0) + '|' + effFloorSel() + '|' + R.w + 'x' + R.h;
    if (!force && key === R.fitKey) return;
    R.fitKey = key; R.layout = stageLayout();
    var pd = PAD(), L = R.layout;
    R.cam = { x: L.w / 2, y: L.h / 2 - (pd.t - pd.b) / (2 * L.k), k: L.k, fit: L.k };
    R.userCam = false; DIRTY.stage = true;
  }
  function clampCam() { var L = R.layout, c = R.cam; if (!L) return; c.x = clamp(c.x, 0, L.w); c.y = clamp(c.y, 0, L.h); }
  function camZoom(f, sx, sy) {
    var c = R.cam, k0 = c.k, k1 = clamp(k0 * f, c.fit * 0.7, c.fit * 9);
    if (sx == null) { sx = R.w / 2; sy = R.h / 2; }
    var wx = (sx - R.w / 2) / k0 + c.x, wy = (sy - R.h / 2) / k0 + c.y;
    c.k = k1; c.x = wx - (sx - R.w / 2) / k1; c.y = wy - (sy - R.h / 2) / k1; R.userCam = true; clampCam(); DIRTY.stage = true;
  }
  function camPan(dx, dy) { var c = R.cam; c.x -= dx / c.k; c.y -= dy / c.k; R.userCam = true; clampCam(); DIRTY.stage = true; }
  function resizeStage() {
    var st = UI.stage; if (!st || !R.cvs) return;
    var r = st.getBoundingClientRect(), w = Math.max(160, Math.floor(r.width)), hh = Math.max(140, Math.floor(r.height)), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === R.w && hh === R.h && dpr === R.dpr && R.ctx) return;
    R.w = w; R.h = hh; R.dpr = dpr;
    R.cvs.width = Math.round(w * dpr); R.cvs.height = Math.round(hh * dpr); R.cvs.style.width = w + 'px'; R.cvs.style.height = hh + 'px';
    R.ctx = R.cvs.getContext('2d');
    var cmp = w < 640 || hh < 330; st.classList.toggle('compact', cmp); if (UI.console) UI.console.classList.toggle('stage-compact', cmp);
    fitView(true); DIRTY.stage = true;
  }

  /* ---- drawing helpers ---- */
  function flamePath(ctx, s) {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.6, s * 0.6, 0, s * 0.72); ctx.bezierCurveTo(-s * 0.6, s * 0.6, -s * 0.7, -s * 0.05, -s * 0.18, -s * 0.34); ctx.bezierCurveTo(-s * 0.16, -s * 0.5, -s * 0.05, -s * 0.62, 0, -s * 0.8); ctx.closePath();
  }
  function lockGlyph(ctx, x, y, s, col, open) {
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = Math.max(1.4, s * 0.16); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineJoin = 'round';
    ctx.fillRect(-s * 0.5, -s * 0.05, s, s * 0.7);
    ctx.beginPath(); if (open) { ctx.arc(s * 0.1, -s * 0.05, s * 0.36, Math.PI * 1.05, Math.PI * 1.95); } else { ctx.arc(0, -s * 0.05, s * 0.36, Math.PI, 0); } ctx.stroke();
    ctx.restore();
  }
  function personColors(st) { var t = PERSON_ST[st] || PERSON_ST.calm; return C(t.tok.replace(/^--/, '')); }
  function drawPersonDot(ctx, x, y, r, st, o) {
    var col = personColors(st);
    ctx.save();
    if (st === 'help' || (o && o.needsHelp)) { ctx.beginPath(); ctx.arc(x, y, r * 2.15, 0, 6.2832); ctx.fillStyle = rgba(C('danger'), 0.26); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    if (st === 'unacc') { ctx.lineWidth = Math.max(1.4, r * 0.4); ctx.strokeStyle = rgba(C('ink-2'), 0.95); ctx.fillStyle = rgba(C('surface'), 0.9); ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = rgba(col); ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = rgba(C('surface'), 0.95); ctx.stroke(); }
    if (st === 'located') { ctx.beginPath(); ctx.arc(x, y, r + 2.6, 0, 6.2832); ctx.lineWidth = 1.7; ctx.strokeStyle = rgba(C('accent'), 0.95); ctx.stroke(); }
    if (o && o.hero) { ctx.beginPath(); ctx.arc(x, y, r + (st === 'located' ? 5 : 2.4), 0, 6.2832); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(C('head'), 0.9); ctx.stroke(); }
    ctx.restore();
  }
  function personState(p) {
    if (p.away) return null;
    var needsHelp = p.checkin === 'help' || p.st === 'down' || p.st === 'incapacitated' || p.st === 'waiting' || (p.st === 'sheltered' && p.safeKind === 'refuge');
    if (p.checkin === 'safe' || p.st === 'safe' || (p.st === 'sheltered' && p.safeKind !== 'refuge')) return 'safe';
    if (LAB.located && LAB.located[p.key]) return 'located';
    if (needsHelp) return 'help';
    if (p.st === 'moving') return 'moving';
    if (p.asleep) return 'asleep';
    if (p.aware >= 1 && (LAB.snap.alert || p.aware >= 2)) return 'alerted';
    if (LAB.snap.alert && p.registered) return 'unacc';
    return 'calm';
  }
  function needsHelpNow(p) { return p.checkin === 'help' || p.st === 'down' || p.st === 'incapacitated' || p.st === 'waiting' || (p.st === 'sheltered' && p.safeKind === 'refuge'); }

  /* the robot: a small tracked / wheeled vehicle seen from above, heading as a compass angle (0 = north), with its camera wedge */
  function drawRobot(ctx, x, y, s, r, heading, o) {
    o = o || {};
    var col = C(ROBOT_STATE[r.state] ? ROBOT_STATE[r.state].replace(/^--/, '') : 'accent'), act = r.state === 'searching' || r.state === 'guiding' || r.state === 'holding' || r.state === 'returning';
    ctx.save(); ctx.translate(x, y);
    if (act && LAB.layers.coverage !== false) {   // camera wedge (the view range is the robot's own range assumption)
      var rangePx = clamp(paramNow('robotRangeM') / CELL * (o.k || 20), 18, 130);
      ctx.save(); ctx.rotate(heading * Math.PI / 180);
      var gr = ctx.createRadialGradient(0, 0, 2, 0, 0, rangePx); gr.addColorStop(0, rgba(C('accent'), 0.34)); gr.addColorStop(1, rgba(C('accent'), 0));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rangePx, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); ctx.closePath(); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    }
    if (r.state === 'holding' && !RM.matches) { var pu = 0.5 + 0.5 * Math.sin(LAB.anim * 4); ctx.beginPath(); ctx.arc(0, 0, s * (1.15 + 0.35 * pu), 0, 6.2832); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('warn'), 0.7 - 0.4 * pu); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, s * 1.08, 0, 6.2832); ctx.fillStyle = rgba(C('surface'), 0.94); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(col); ctx.stroke();
    ctx.rotate(heading * Math.PI / 180);
    var wl = s * 0.62, ww = s * 0.84;
    if (r.variant === 'tracked') { ctx.fillStyle = rgba(C('ink-2')); rrect(ctx, -ww / 2 - s * 0.14, -wl, s * 0.28, wl * 2, s * 0.1); ctx.fill(); rrect(ctx, ww / 2 - s * 0.14, -wl, s * 0.28, wl * 2, s * 0.1); ctx.fill(); }
    else { ctx.fillStyle = rgba(C('ink-2')); [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].forEach(function (q) { ctx.beginPath(); ctx.arc(q[0] * ww * 0.5, q[1] * wl, s * 0.17, 0, 6.2832); ctx.fill(); }); }
    ctx.fillStyle = rgba(col); rrect(ctx, -ww / 2 + s * 0.05, -wl * 0.8, ww - s * 0.1, wl * 1.6, s * 0.12); ctx.fill();
    ctx.fillStyle = rgba(C('surface')); ctx.beginPath(); ctx.arc(0, -wl * 0.42, s * 0.2, 0, 6.2832); ctx.fill();     // the camera head, at the front
    ctx.fillStyle = rgba(C('head')); ctx.beginPath(); ctx.arc(0, -wl * 0.42, s * 0.09, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (o.label) { ctx.save(); ctx.font = '700 ' + clamp(s * 0.62, 10, 13) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; haloText(ctx, o.label, x, y + s * 1.62, rgba(C('head')), rgba(C('surface'), 0.95), 3.5); ctx.restore(); }
  }

  /* ---- one frame of the cut-away ---- */
  function drawStage() {
    var ctx = R.ctx, L = R.layout, sim = LAB.sim, snap = LAB.snap; if (!ctx || !L || !sim || !snap) return;
    var g = LAB.g, S = g.S, c = R.cam, k = c.k, dark = isDark(), moving = !RM.matches;
    var ox = R.w / 2 - c.x * k, oy = R.h / 2 - c.y * k, X = function (bx) { return ox + bx * k; }, Y = function (by) { return oy + by * k; };
    var st = sim.stt && sim.stt[g.si] ? sim.stt[g.si] : null, obst = sim.rb && sim.rb.obst ? sim.rb.obst : {};
    var robots = robotsOf(), raw = {}, covN = {}, roomSt = {}, prio = {}, hc = LAB.hc && LAB.hc.rooms ? LAB.hc.rooms : {};
    robots.forEach(function (r) { raw[r.id] = rawRobot(r.id); if (r.coverage) { r.coverage.nodes.forEach(function (n) { if (!covN[n.id] || n.cov > covN[n.id]) covN[n.id] = n.cov; }); Object.keys(r.coverage.rooms).forEach(function (rm) { var v = r.coverage.rooms[rm]; if (!roomSt[rm] || v === 'searched' || roomSt[rm] === 'open') roomSt[rm] = v; }); } });
    var pri = snap.robot ? snap.robot.priority || [] : []; pri.forEach(function (rm, i) { prio[rm] = i + 1; });
    R.hits = [];
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = rgba(C('bg-2')); ctx.fillRect(0, 0, R.w, R.h);
    ctx.textBaseline = 'middle'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr';
    var byFl = {}, outside = 0, people = snap.people;
    for (var pi = 0; pi < people.length; pi++) {
      var p = people[pi]; if (p.away) continue;
      if (p.x >= S.x0 - 1 && p.x <= S.x0 + S.w + 1.5 && p.y >= S.y0 - 1 && p.y <= S.y0 + S.h + 1) (byFl[p.fl] || (byFl[p.fl] = [])).push(p); else outside++;
    }
    R.outside = outside;
    var exitState = {}; snap.exits.forEach(function (e) { if (e.struct === S.id) exitState[e.id] = e; });
    var gasHaz = sim.hazard === 'gas', gasMax = (snap.hazardState && snap.hazardState.danger) || 2100;
    var rbCfg = { range: paramNow('robotMeshRangeM'), loss: paramNow('robotFloorLossM') };

    L.panels.forEach(function (P) {
      var roof = P.fl >= S.floors, fx = P.ox + 1.4, fy = P.oy + 1.9;
      var PX = function (x) { return X(fx + (x - S.x0)); }, PY = function (y) { return Y(fy + (y - S.y0)); };
      // card + title
      ctx.save(); rrect(ctx, X(P.ox + 0.1), Y(P.oy + 0.1), (P.pw - 0.2) * k, (P.ph - 0.2) * k, Math.max(6, 0.5 * k)); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C('line-2')); ctx.stroke(); ctx.restore();
      var inFl = byFl[P.fl] || [], locN = 0; inFl.forEach(function (q) { if (LAB.located && LAB.located[q.key]) locN++; });
      var tfs = clamp(0.5 * k, 11, 15), tx = lang() === 'ar' ? X(P.ox + P.pw - 0.7) : X(P.ox + 0.7), ty = Y(P.oy + 0.95);
      ctx.font = '700 ' + tfs + 'px ' + FONT; ctx.textAlign = lang() === 'ar' ? 'right' : 'left'; ctx.fillStyle = rgba(C('head'));
      var ttl = floorLabel(g, P.fl) + (roof ? '' : ' · ' + B('غرف ', 'rooms ') + N((P.fl + 1) * 100 + 1) + '–' + N((P.fl + 1) * 100 + 10));
      if (g.si !== 0 && !roof) ttl = floorLabel(g, P.fl);
      ctx.fillText(ttl, tx, ty);
      var tw = ctx.measureText(ttl).width + 10;
      ctx.font = '500 ' + clamp(0.42 * k, 10, 12.5) + 'px ' + FONT; ctx.fillStyle = rgba(C('muted'));
      ctx.fillText('· ' + N(inFl.length) + ' ' + B('شخص', 'people') + (locN ? ' · ' + N(locN) + ' ' + B('عُثر عليهم', 'located') : ''), tx + (lang() === 'ar' ? -tw : tw), ty);
      // footprint
      ctx.save(); rrect(ctx, PX(S.x0), PY(S.y0), S.w * k, S.h * k, 0.2 * k); ctx.fillStyle = rgba(roof ? mixc(C('surface-3'), C('bg'), 0.3) : C('surface-2')); ctx.fill(); ctx.lineWidth = Math.max(2, 0.12 * k); ctx.strokeStyle = rgba(C('line-2')); if (roof) ctx.setLineDash([8, 5]); ctx.stroke(); ctx.restore();
      if (roof) { ctx.font = '600 ' + clamp(0.4 * k, 10, 14) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = rgba(C('muted')); ctx.fillText(B('سطح المبنى', 'Building roof'), PX(S.x0 + S.w / 2), PY(S.y0 + S.h / 2 + 1.0)); }
      // nodes
      var rooms = [];
      g.nodes.forEach(function (n, ni) {
        if (n.fl !== P.fl) return;
        var bx = nodeBox(g, n); if (!bx) return;
        var x0 = PX(bx.x0), y0 = PY(bx.y0), w = bx.w * k, hh = bx.h * k, cx = x0 + w / 2, cy = y0 + hh / 2;
        var burn = st ? st.burn[ni] : 0, smoke = st ? st.smoke[ni] : 0, gas = st && gasHaz ? st.gas[ni] : 0, kind = bx.kind;
        ctx.save(); rrect(ctx, x0, y0, w, hh, Math.max(2, 0.12 * k));
        var base = kind === 'corr' ? C('surface-3') : kind === 'stair' ? mixc(C('surface-3'), C('accent'), 0.12) : kind === 'refuge' ? mixc(C('surface'), C('safe'), 0.2) : kind === 'lobby' ? mixc(C('surface'), C('info'), 0.12) : C('surface');
        ctx.fillStyle = rgba(base); ctx.fill();
        if (LAB.layers.coverage && covN[n.id] > 0.02) { ctx.fillStyle = rgba(C('accent'), clamp(covN[n.id], 0, 1) * (dark ? 0.34 : 0.3)); ctx.fill(); }
        if (LAB.layers.smoke) {
          if (smoke > 0.01) { ctx.fillStyle = rgba(mixc(C('ink'), C('bg'), dark ? 0.1 : 0.3), clamp(smoke * 1.15, 0, 0.72)); ctx.fill(); }
          if (gas > 5) { ctx.fillStyle = rgba(C('warn'), clamp(gas / gasMax, 0, 0.7)); ctx.fill(); }
          if (burn === 1) { var fl = moving ? 0.82 + 0.18 * Math.sin(LAB.anim * 7 + ni) : 1; ctx.fillStyle = rgba(mixc(C('fire-2'), C('fire-3'), 0.4), 0.78 * fl); ctx.fill(); }
          else if (burn >= 2) { ctx.fillStyle = rgba(C('ink'), 0.4); ctx.fill(); }
        }
        var rc = n.room ? hc[n.room] : null, bcol = C('line-2'), bw = 1.2;
        if (rc && rc.total) { if (rc.help > 0) { bcol = C('danger'); bw = 2.4; } else if (rc.safe + (rc.safeAway || 0) >= rc.total) { bcol = C('safe'); bw = 2.2; } else if (rc.located > 0) { bcol = C('accent'); bw = 2.2; } }
        var stt = n.room ? roomSt[n.room] : null;
        ctx.lineWidth = bw; ctx.strokeStyle = rgba(bcol); ctx.stroke();
        if (kind === 'stair') { ctx.beginPath(); for (var yy = 0.2; yy < 1.5; yy += 0.28) { ctx.moveTo(x0 + 0.1 * k, y0 + yy * k); ctx.lineTo(x0 + w - 0.1 * k, y0 + yy * k); } ctx.lineWidth = 1; ctx.strokeStyle = rgba(C('line-2'), 0.9); ctx.stroke(); }
        ctx.restore();
        if (LAB.layers.smoke && burn === 1) { ctx.save(); ctx.translate(cx, cy + 0.12 * k); flamePath(ctx, clamp(0.55 * k, 8, 24)); ctx.fillStyle = rgba(C('fire-1'), 0.95); ctx.fill(); ctx.restore(); }
        // labels
        ctx.textAlign = 'center';
        if (LAB.layers.labels) {
          if (kind === 'room' || kind === 'special') { ctx.font = '700 ' + clamp(0.4 * k, 9, 15) + 'px ' + FONT; ctx.fillStyle = rgba(C('ink-2')); var cn0 = g.doorWith[n.id] ? g.nodes[g.byId[g.doorWith[n.id]]] : null, lowLbl = cn0 && cn0.y < n.y - 0.2; ctx.fillText(kind === 'special' ? LL(n.label).replace(/^الصف |^Class /, '') : n.room, cx, lowLbl ? y0 + hh - 0.3 * k - 2 : y0 + 0.3 * k + 2); }
          else if (kind === 'stair') { ctx.font = '700 ' + clamp(0.5 * k, 10, 17) + 'px ' + FONT; ctx.fillStyle = rgba(C('ink-2')); ctx.fillText(LL(n.label).replace(/^الدرج |^Stair |^West |^East |^الغربي|^الشرقي/g, '').trim().slice(0, 2) || '↕', cx, cy); }
          else if (kind === 'lobby') { ctx.font = '600 ' + clamp(0.34 * k, 8.5, 12) + 'px ' + FONT; ctx.fillStyle = rgba(C('ink-2')); ctx.fillText(B('بهو وحارس', 'Lobby · guard'), cx, cy); }
          else if (kind === 'refuge') { ctx.font = '600 ' + clamp(0.3 * k, 8, 11) + 'px ' + FONT; ctx.fillStyle = rgba(C('safe')); ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(B('شرفة اللجوء', 'Refuge'), 0, 0); ctx.restore(); }
        }
        // the door between this room and its corridor: open / closed / locked
        if (roomy(n) && g.doorOf[n.id] !== undefined && n.type !== 5) {
          var cor = g.nodes[g.byId[g.doorWith[n.id]]], vert = Math.abs(cor.y - n.y) >= Math.abs(cor.x - n.x), dx2 = vert ? cx : (cor.x > n.x ? x0 + w : x0), dy2 = vert ? (cor.y > n.y ? y0 + hh : y0) : cy;
          var locked = !!(obst[n.id] && obst[n.id].locked), open = !!(st && st.doorOpen && st.doorOpen[g.doorOf[n.id]]);
          var dl = clamp(0.5 * k, 7, 22);
          ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = clamp(0.1 * k, 2.4, 5);
          ctx.strokeStyle = rgba(locked ? C('danger') : open ? C('safe') : C('ink-2'), locked ? 1 : 0.95);
          ctx.beginPath(); if (vert) { ctx.moveTo(dx2 - dl / 2, dy2); ctx.lineTo(dx2 + dl / 2, dy2); } else { ctx.moveTo(dx2, dy2 - dl / 2); ctx.lineTo(dx2, dy2 + dl / 2); }
          if (open && !locked) { ctx.stroke(); ctx.beginPath(); ctx.setLineDash([2, 3]); if (vert) { ctx.moveTo(dx2 - dl / 2, dy2); ctx.lineTo(dx2 - dl / 2, dy2 + (cor.y > n.y ? 1 : -1) * dl * 0.7); } else { ctx.moveTo(dx2, dy2 - dl / 2); ctx.lineTo(dx2 + (cor.x > n.x ? 1 : -1) * dl * 0.7, dy2 - dl / 2); } }
          ctx.stroke(); ctx.restore();
          if (locked) lockGlyph(ctx, dx2 + (vert ? 0 : (cor.x > n.x ? 1 : -1) * dl * 0.55), dy2 + (vert ? (cor.y > n.y ? 1 : -1) * dl * 0.6 : 0), clamp(0.34 * k, 8, 14), rgba(C('danger')));
          R.hits.push({ type: 'door', id: n.id, x: dx2, y: dy2, r: Math.max(9, dl * 0.7), prio: 3 });
        }
        // robot's own status of the room: searched / locked / cut off / hot
        if (stt && stt !== 'open' && (kind === 'room' || kind === 'special')) {
          var bx2 = x0 + w - clamp(0.2 * k, 6, 10), by2 = y0 + hh - clamp(0.2 * k, 6, 10), q = clamp(0.2 * k, 6, 11);
          ctx.save(); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          if (stt === 'searched') { ctx.strokeStyle = rgba(C('safe')); ctx.beginPath(); ctx.moveTo(bx2 - q * 0.6, by2); ctx.lineTo(bx2 - q * 0.15, by2 + q * 0.5); ctx.lineTo(bx2 + q * 0.7, by2 - q * 0.5); ctx.stroke(); }
          else if (stt === 'locked') lockGlyph(ctx, bx2, by2, q * 1.2, rgba(C('danger')));
          else if (stt === 'unreachable') { ctx.strokeStyle = rgba(C('warn')); ctx.beginPath(); ctx.moveTo(bx2 - q * 0.7, by2 + q * 0.6); ctx.lineTo(bx2 - q * 0.2, by2 + q * 0.6); ctx.lineTo(bx2 - q * 0.2, by2); ctx.lineTo(bx2 + q * 0.3, by2); ctx.lineTo(bx2 + q * 0.3, by2 - q * 0.6); ctx.stroke(); }
          else if (stt === 'hot') { ctx.translate(bx2, by2); flamePath(ctx, q * 0.8); ctx.strokeStyle = rgba(C('danger')); ctx.stroke(); }
          ctx.restore();
        }
        // operator's search-priority number
        if (n.room && prio[n.room]) {
          var rr = clamp(0.24 * k, 8, 13), px = x0 + rr + 3, py = y0 + hh - rr - 3;
          ctx.save(); ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.2832); ctx.fillStyle = rgba(C('brand')); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
          ctx.font = '700 ' + rr * 1.15 + 'px ' + MONO; ctx.fillStyle = rgba(isDark() ? [26, 13, 2] : [255, 255, 255]); ctx.textAlign = 'center'; ctx.fillText(String(prio[n.room]), px, py + 0.5); ctx.restore();
        }
        if (n.room || kind === 'special' || kind === 'lobby' || kind === 'corr' || kind === 'stair' || kind === 'refuge') R.hits.push({ type: 'node', id: n.id, room: n.room || null, x: cx, y: cy, rect: { x0: x0, y0: y0, x1: x0 + w, y1: y0 + hh }, prio: kind === 'corr' ? 0 : 1, fl: P.fl });
      });
      // link range (approximate): the gateway at the entrance and every relay / route beacon
      if (LAB.layers.link && !roof) {
        var relays = [], gn = g.nodes[g.byId[g.S.exits[0].node]];
        relays.push({ x: gn.x, y: gn.y, fl: gn.fl, a: 0.6 });
        robots.forEach(function (r) { var rr = raw[r.id]; if (rr && rr.beacons) rr.beacons.forEach(function (b) { relays.push({ x: b.x, y: b.y, fl: b.fl, a: b.auto ? 0.5 : 0.22 }); }); });
        ctx.save(); rrect(ctx, X(P.ox + 0.1), Y(P.oy + 0.1), (P.pw - 0.2) * k, (P.ph - 0.2) * k, Math.max(6, 0.5 * k)); ctx.clip();
        relays.forEach(function (rl) {
          var dF = Math.abs(rl.fl - P.fl), rad = (rbCfg.range - dF * rbCfg.loss) / CELL; if (rad <= 0.4) return;
          ctx.beginPath(); ctx.arc(PX(rl.x), PY(rl.y), rad * k, 0, 6.2832); ctx.setLineDash([5, 6]); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(C('accent'), rl.a * (dF ? 0.5 : 1)); ctx.stroke();
        });
        ctx.restore();
      }
      // exits on this panel
      S.exits.forEach(function (ex) {
        var en = g.nodes[g.byId[ex.node]], es = exitState[ex.id]; if (!en || !es) return;
        var ax, ay;
        if (ex.kind === 'roof') { if (roof) { ax = PX(S.x0 + S.w / 2); ay = PY(S.y0 + S.h / 2 - 0.4); } else if (P.fl === en.fl) { ax = PX(en.x); ay = PY(en.y - 1.15); } else return; }
        else if (ex.kind === 'entrance') { if (P.fl !== 0) return; ax = PX(en.x); ay = PY(S.y0 + S.h + 0.62); }
        else { if (P.fl !== 0) return; ax = PX(en.x < S.x0 + S.w / 2 ? S.x0 - 0.62 : S.x0 + S.w + 0.62); ay = PY(en.y); }
        var col = C(EXIT_STATE[es.state].tok.replace(/^--/, '')), br = clamp(0.3 * k, 8, 15);
        ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, br, 0, 6.2832); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = rgba(col); ctx.stroke();
        ctx.font = '700 ' + br * 1.05 + 'px ' + MONO; ctx.fillStyle = rgba(C('head')); ctx.textAlign = 'center'; ctx.fillText(ex.kind === 'roof' ? 'R' : ex.kind === 'entrance' ? 'E' : ex.id, ax, ay + 0.5);
        if (es.state === 'LOCKED') lockGlyph(ctx, ax + br * 0.85, ay - br * 0.85, br * 0.9, rgba(C('danger')));
        else if (es.state === 'FIRE') { ctx.translate(ax + br * 0.85, ay - br * 0.85); flamePath(ctx, br * 0.6); ctx.fillStyle = rgba(C('fire-3')); ctx.fill(); }
        ctx.restore();
        R.hits.push({ type: 'exit', id: ex.id, x: ax, y: ay, r: br + 4, prio: 4, state: es });
      });
      // guidance routes drawn by the robot's finds (a person who was told the way out)
      if (snap.robot && LAB.layers.beacons) {
        snap.robot.finds.forEach(function (f) {
          if (!f.route || f.route.length < 2 || f.action === 'queued' || f.action === 'hold' || f.action === 'stay') return;
          ctx.save(); ctx.lineWidth = Math.max(2, 0.09 * k); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(C('safe'), 0.85); ctx.setLineDash([6, 4]); ctx.beginPath();
          var pen = false;
          f.route.forEach(function (id) { var nn = g.nodes[g.byId[id]]; if (!nn) return; if (nn.fl === P.fl) { if (pen) ctx.lineTo(PX(nn.x), PY(nn.y)); else { ctx.moveTo(PX(nn.x), PY(nn.y)); pen = true; } } else pen = false; });
          ctx.stroke(); ctx.restore();
        });
      }
      // trail + planned path
      if (LAB.layers.trail) robots.forEach(function (r) {
        var tr = LAB.trail[r.id] || []; if (tr.length > 1) {
          ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
          var runStart = 0;
          for (var i = 1; i <= tr.length; i++) {
            if (i === tr.length || tr[i].fl !== P.fl || tr[i - 1].fl !== P.fl) {
              if (tr[runStart].fl === P.fl && i - runStart > 1) { ctx.beginPath(); for (var j = runStart; j < i; j++) { var q = tr[j]; if (j === runStart) ctx.moveTo(PX(q.x), PY(q.y)); else ctx.lineTo(PX(q.x), PY(q.y)); } ctx.lineWidth = Math.max(1.6, 0.07 * k); ctx.strokeStyle = rgba(C('accent'), 0.5); ctx.stroke(); }
              runStart = i;
            }
          }
          ctx.restore();
        }
        var rr = raw[r.id];
        if (rr && rr.path && rr.path.length && r.state !== 'stowed' && r.state !== 'fault') {
          ctx.save(); ctx.lineWidth = Math.max(1.5, 0.06 * k); ctx.setLineDash([3, 5]); ctx.strokeStyle = rgba(C('brand'), 0.9); ctx.beginPath(); var pen2 = false;
          var pts = []; var pz = poseDraw(r); pts.push({ x: pz.x, y: pz.y, fl: pz.fl }); if (rr.to >= 0) { var tn = g.nodes[rr.to]; pts.push({ x: tn.x, y: tn.y, fl: tn.fl }); }
          rr.path.forEach(function (li) { var nn = g.nodes[li]; if (nn) pts.push({ x: nn.x, y: nn.y, fl: nn.fl }); });
          pts.forEach(function (q) { if (q.fl === P.fl) { if (pen2) ctx.lineTo(PX(q.x), PY(q.y)); else { ctx.moveTo(PX(q.x), PY(q.y)); pen2 = true; } } else pen2 = false; });
          ctx.stroke(); ctx.restore();
        }
      });
      // beacons
      if (LAB.layers.beacons) robots.forEach(function (r) {
        var rr = raw[r.id]; if (!rr || !rr.beacons) return;
        rr.beacons.forEach(function (b) {
          if (b.fl !== P.fl) return; var bx = PX(b.x), by = PY(b.y), s = clamp(0.2 * k, 5, 9);
          ctx.save(); ctx.translate(bx, by);
          if (b.auto) { ctx.beginPath(); ctx.arc(0, 0, s * 1.15, 0, 6.2832); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('accent')); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 6.2832); ctx.fillStyle = rgba(C('accent')); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, s * 1.9, -0.9, 0.9); ctx.stroke(); }
          else { ctx.rotate(0.7854); ctx.fillStyle = rgba(C('safe')); ctx.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(C('surface')); ctx.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); }
          ctx.restore();
          R.hits.push({ type: 'beacon', id: b.node, x: bx, y: by, r: s + 5, prio: 2, auto: !!b.auto });
        });
      });
      // people
      if (LAB.layers.people) {
        var pr = clamp(0.17 * k, 3, 7.5);
        inFl.forEach(function (q) {
          var s2 = personState(q); if (!s2) return;
          var px = PX(q.x), py = PY(q.y);
          drawPersonDot(ctx, px, py, q.hero ? pr + 1.5 : pr, s2, { hero: !!q.hero, needsHelp: s2 === 'located' && needsHelpNow(q) });
          R.hits.push({ type: 'person', id: q.key, x: px, y: py, r: pr + 4, prio: q.hero ? 6 : 5 });
          if (q.hero && LAB.layers.labels) { ctx.font = '700 ' + clamp(0.36 * k, 10, 13) + 'px ' + FONT; ctx.textAlign = 'center'; haloText(ctx, LL(HERO_NAME[q.hero]), px, py - pr - 9, rgba(C('head')), rgba(C('surface'), 0.95), 3.5); }
        });
      }
      // robots
      robots.forEach(function (r) {
        var pz = poseDraw(r); if (pz.fl !== P.fl) return;
        var rs = clamp(0.42 * k, 11, 26);
        drawRobot(ctx, PX(pz.x), PY(pz.y), rs, r, pz.hd, { label: r.id, k: k });
        R.hits.push({ type: 'robot', id: r.id, x: PX(pz.x), y: PY(pz.y), r: rs + 6, prio: 9 });
        var rr = raw[r.id];   // a "possible person" being checked (a hot object): a dashed question mark beside the robot
        if (rr && rr.investigate) { ctx.save(); ctx.font = '700 ' + clamp(0.5 * k, 12, 20) + 'px ' + FONT; ctx.textAlign = 'center'; haloText(ctx, '?', PX(pz.x) + rs * 1.2, PY(pz.y) - rs * 0.9, rgba(C('warn')), rgba(C('surface'), 0.95), 4); ctx.restore(); }
      });
    });
    // selection + keyboard cursor
    var sel = R.cursor || LAB.sel2;
    if (sel) { var hs = findHit('node', sel); if (hs) { ctx.save(); ctx.lineWidth = 2.6; ctx.strokeStyle = rgba(C('head')); ctx.setLineDash([5, 3]); rrect(ctx, hs.rect.x0 - 2, hs.rect.y0 - 2, hs.rect.x1 - hs.rect.x0 + 4, hs.rect.y1 - hs.rect.y0 + 4, 5); ctx.stroke(); ctx.restore(); } }
  }
  function findHit(type, id) { for (var i = R.hits.length - 1; i >= 0; i--) if (R.hits[i].type === type && R.hits[i].id === id) return R.hits[i]; return null; }
  // the robot's drawn pose, eased between the last two ticks (not under reduced motion)
  function poseDraw(r) {
    var p = LAB.pose[r.id]; if (!p) return { x: r.pose.x, y: r.pose.y, fl: r.pose.fl, hd: r.heading };
    var a = 1;
    if (!RM.matches && LAB.playing) a = clamp((now() - LAB.poseAt) / LAB.tickMs, 0, 1);
    if (p.pfl !== p.cfl || a >= 1) return { x: p.cx, y: p.cy, fl: p.cfl, hd: p.hd };
    var d = ((p.hd - p.phd + 540) % 360) - 180;
    return { x: lerp(p.px, p.cx, a), y: lerp(p.py, p.cy, a), fl: p.cfl, hd: p.phd + d * a };
  }
  function hitAt(px, py) {
    var best = null, bestScore = 1e9;
    for (var i = R.hits.length - 1; i >= 0; i--) {
      var hh = R.hits[i], d;
      if (hh.rect) { if (px >= hh.rect.x0 && px <= hh.rect.x1 && py >= hh.rect.y0 && py <= hh.rect.y1) d = 40 - (hh.prio || 0); else continue; }
      else { d = Math.hypot(px - hh.x, py - hh.y); if (d > (hh.r || 10)) continue; }
      var score = d - (hh.prio || 0) * 3;
      if (score < bestScore) { bestScore = score; best = hh; }
    }
    return best;
  }

  /* ====================================================================================
   * 6. THE ROBOT'S EYE (canvas): a schematic render of ManaraSim.robotView — smoke fog from the sim's own attenuation constants, a thermal false-colour mode
   *    (people fade into a hot room: the Gulf-heat caveat), people boxes from `detected`, and the 'possible person' false positive. NOT a camera feed.
   * ==================================================================================== */
  var EYE = { cvs: null, ctx: null, w: 360, h: 210, dpr: 1, summary: '', key: '' };
  var IRON = [[0, [4, 4, 22]], [0.2, [44, 8, 92]], [0.4, [152, 22, 112]], [0.55, [224, 54, 48]], [0.7, [250, 142, 30]], [0.85, [255, 214, 64]], [1, [255, 255, 232]]];
  function iron(u) {
    u = clamp(u, 0, 1);
    for (var i = 1; i < IRON.length; i++) if (u <= IRON[i][0]) { var a = IRON[i - 1], b = IRON[i], t = (u - a[0]) / (b[0] - a[0]); return mixc(a[1], b[1], t); }
    return IRON[IRON.length - 1][1];
  }
  function tempU(tc) { return clamp((tc - 20) / 35, 0, 1); }
  function resizeEye() {
    var cv = EYE.cvs; if (!cv || !cv.parentNode) return;
    var r = cv.parentNode.getBoundingClientRect(), w = Math.max(200, Math.floor(r.width)), hh = Math.round(clamp(w * 0.56, 130, 250)), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === EYE.w && hh === EYE.h && dpr === EYE.dpr && EYE.ctx) return;
    EYE.w = w; EYE.h = hh; EYE.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); cv.style.width = w + 'px'; cv.style.height = hh + 'px'; EYE.ctx = cv.getContext('2d'); DIRTY.eye = true;
  }
  function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }
  function quadFill(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  function figure(ctx, kind, x, foot, s, fill, headFill, line) {
    ctx.save(); ctx.lineWidth = Math.max(1, s * 0.03); ctx.strokeStyle = line || 'rgba(0,0,0,0)';
    var rr = function (a, b, c, d, r) { rrect(ctx, a, b, c, d, r); ctx.fillStyle = fill; ctx.fill(); if (line) ctx.stroke(); };
    if (kind === 'lie') {
      rr(x - 0.85 * s, foot - 0.3 * s, 1.7 * s, 0.28 * s, 0.13 * s);
      ctx.beginPath(); ctx.arc(x - 0.78 * s, foot - 0.17 * s, 0.12 * s, 0, 6.2832); ctx.fillStyle = headFill; ctx.fill();
    } else if (kind === 'seat') {
      rr(x - 0.19 * s, foot - 1.15 * s, 0.38 * s, 0.6 * s, 0.1 * s); rr(x - 0.17 * s, foot - 0.62 * s, 0.13 * s, 0.56 * s, 0.05 * s); rr(x + 0.04 * s, foot - 0.62 * s, 0.13 * s, 0.56 * s, 0.05 * s);
      ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.strokeStyle = fill;
      [-1, 1].forEach(function (q) { ctx.beginPath(); ctx.arc(x + q * 0.4 * s, foot - 0.3 * s, 0.3 * s, 0, 6.2832); ctx.stroke(); });
      ctx.beginPath(); ctx.arc(x, foot - 1.3 * s, 0.11 * s, 0, 6.2832); ctx.fillStyle = headFill; ctx.fill();
    } else {
      rr(x - 0.17 * s, foot - 0.85 * s, 0.13 * s, 0.85 * s, 0.05 * s); rr(x + 0.04 * s, foot - 0.85 * s, 0.13 * s, 0.85 * s, 0.05 * s);
      rr(x - 0.21 * s, foot - 1.5 * s, 0.42 * s, 0.7 * s, 0.12 * s); rr(x - 0.31 * s, foot - 1.46 * s, 0.09 * s, 0.6 * s, 0.04 * s); rr(x + 0.22 * s, foot - 1.46 * s, 0.09 * s, 0.6 * s, 0.04 * s);
      ctx.beginPath(); ctx.arc(x, foot - 1.64 * s, 0.115 * s, 0, 6.2832); ctx.fillStyle = headFill; ctx.fill();
    }
    ctx.restore();
  }
  function figBox(kind, x, foot, s) { return kind === 'lie' ? [x - 0.95 * s, foot - 0.42 * s, 1.9 * s, 0.46 * s] : kind === 'seat' ? [x - 0.72 * s, foot - 1.46 * s, 1.44 * s, 1.5 * s] : [x - 0.36 * s, foot - 1.8 * s, 0.72 * s, 1.84 * s]; }
  function camChip(ctx, text, x, y, color, anchor) {
    ctx.save(); ctx.font = '600 11px ' + FONT; ctx.textBaseline = 'middle'; var tw = ctx.measureText(text).width + 12, bx = anchor === 'end' ? x - tw : anchor === 'mid' ? x - tw / 2 : x;
    rrect(ctx, bx, y - 9, tw, 18, 5); ctx.fillStyle = 'rgba(4,7,12,0.82)'; ctx.fill(); ctx.fillStyle = color || '#e7ecf4'; ctx.textAlign = 'left'; ctx.fillText(text, bx + 6, y + 0.5); ctx.restore();
    return tw;
  }

  function drawEye() {
    var ctx = EYE.ctx, sim = LAB.sim, snap = LAB.snap; if (!ctx || !sim || !snap) return;
    var w = EYE.w, hh = EYE.h, thermal = LAB.eye === 'thermal', r = selRobot(), rr = r ? rawRobot(r.id) : null;
    ctx.setTransform(EYE.dpr, 0, 0, EYE.dpr, 0, 0); ctx.textBaseline = 'middle'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr';
    ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, w, hh);
    var v = r ? r.view : null;
    if (!r || !v) {
      ctx.fillStyle = '#0b1018'; ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = '#8c98ab'; ctx.font = '600 14px ' + FONT; ctx.textAlign = 'center';
      var why = !r ? B('لا روبوت', 'No robot') : r.state === 'fault' ? B('الروبوت معطّل — لا صورة', 'The robot has a fault — no picture') : B('الكاميرا مطفأة: الروبوت ' + (r.state === 'stowed' ? 'في مكانه' : 'لم يدخل بعد'), 'Camera off: the robot is ' + (r.state === 'stowed' ? 'stowed' : 'not inside yet'));
      ctx.fillText(why, w / 2, hh / 2 - 8);
      ctx.font = '500 12px ' + FONT; ctx.fillStyle = '#6f7b8e'; ctx.fillText(B('بعد اعتماد قائد الحادث تُفتح الكاميرا', 'The camera opens after the incident commander approves'), w / 2, hh / 2 + 14);
      EYE.summary = why; return;
    }
    var P = sim.P, g = LAB.g, smoke = v.smoke || 0, K = thermal ? P.robotThermalSmokeK : P.robotRgbSmokeK;
    var vis = function (d) { return Math.exp(-K * smoke * d / 5); };
    var cx = w / 2, hy = hh * 0.47, f = w * 0.46, camH = 0.55;
    var proj = function (X, Y, Z) { return [cx + f * X / Z, hy - f * (Y - camH) / Z]; };
    // where the robot is and which way the head looks: toward the nearest person in view, else along the heading
    var node = g.nodes[g.byId[v.node]] || g.nodes[0], pz = { x: r.pose.x, y: r.pose.y };
    if (EYE.byT !== sim.t || !EYE.byId) { EYE.byT = sim.t; EYE.byId = {}; snap.people.forEach(function (p) { EYE.byId[p.id] = p; }); }
    var byKey = EYE.byId;
    var list = [];
    (v.people || []).forEach(function (p) {
      var dx = (p.x - pz.x) * CELL, dy = (p.y - pz.y) * CELL, dist = Math.hypot(dx, dy);
      var id = p.key ? null : +String(p.ref).replace(/^blob-/, ''), pp = p.key ? null : byKey[id];
      if (p.key) for (var q in byKey) if (byKey[q].key === p.key) { pp = byKey[q]; break; }
      list.push({ p: p, pp: pp, dist: Math.max(0.4, dist), bearing: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 });
    });
    list.sort(function (a, b) { return a.dist - b.dist; });
    var yaw = list.length ? list[0].bearing : v.heading;
    // the neighbour the camera looks toward (the end of the corridor, a doorway, the stairs)
    var ahead = null, bestRel = 40;
    (g.nbr[node.id] || []).forEach(function (id) {
      var nn = g.nodes[g.byId[id]]; if (!nn || nn.fl !== node.fl) return;
      var bearing = (Math.atan2(nn.x - node.x, -(nn.y - node.y)) * 180 / Math.PI + 360) % 360, rel = Math.abs(angDiff(bearing, yaw));
      if (rel < bestRel) { bestRel = rel; ahead = { n: nn, dist: Math.hypot(nn.x - node.x, nn.y - node.y) * CELL }; }
    });
    var stt = sim.stt && sim.stt[g.si], idxOf = function (n) { return g.byId[n.id]; };
    var kind = node.type === 2 ? 'corr' : node.type === 3 ? 'stair' : node.type === 5 ? 'refuge' : 'room';
    var hw = kind === 'corr' ? 1.3 : kind === 'stair' ? 1.05 : 2.5, ceil = 2.7, zf = kind === 'corr' ? clamp(ahead ? ahead.dist : 5, 3.2, Math.max(4, v.rangeM || 8)) : kind === 'stair' ? 3.6 : 4.2;
    var endKind = 'wall', glow = 0;
    if (ahead && kind === 'corr') { endKind = ahead.n.type === 2 ? 'corr' : ahead.n.type === 3 ? 'stair' : 'door'; if (stt && stt.burn[idxOf(ahead.n)] === 1) glow = 1; }
    if (kind === 'stair') endKind = 'stair'; if (kind === 'refuge') endKind = 'rail';
    // colours
    var fog = thermal ? iron(tempU(v.tempC)) : mixc([7, 9, 13], [86, 78, 70], clamp(smoke, 0, 1));
    var lamp = function (d) { return clamp(1.15 / (1 + Math.pow(d / 4.5, 2)), 0.04, 1); };
    var surf = function (base, d, dt) { // base colour (RGB) or temperature offset (thermal) → colour seen at distance d
      if (thermal) { var c0 = iron(tempU(v.tempC + dt)); return mixc(fog, c0, vis(d)); }
      var lit = mixc([0, 0, 0], base, lamp(d)); return mixc(fog, lit, vis(d));
    };
    var N0 = 16, z0 = 0.4, zs = []; for (var i = 0; i <= N0; i++) zs.push(z0 * Math.pow(zf / z0, i / N0));
    // surfaces, far → near bands
    for (i = N0 - 1; i >= 0; i--) {
      var za = zs[i], zb = zs[i + 1], dm = (za + zb) / 2;
      var cFloor = surf([58, 62, 70], dm, -3), cCeil = surf([70, 76, 86], dm, 1), cWall = surf([96, 102, 114], dm, -1.5);
      quadFill(ctx, [proj(-hw, 0, za), proj(hw, 0, za), proj(hw, 0, zb), proj(-hw, 0, zb)], rgba(cFloor));
      quadFill(ctx, [proj(-hw, ceil, za), proj(hw, ceil, za), proj(hw, ceil, zb), proj(-hw, ceil, zb)], rgba(cCeil));
      quadFill(ctx, [proj(-hw, 0, za), proj(-hw, ceil, za), proj(-hw, ceil, zb), proj(-hw, 0, zb)], rgba(cWall));
      quadFill(ctx, [proj(hw, 0, za), proj(hw, ceil, za), proj(hw, ceil, zb), proj(hw, 0, zb)], rgba(mixc(cWall, fog, 0.12)));
    }
    // far end
    var zEnd = zs[N0], endBase = endKind === 'door' ? [18, 20, 26] : endKind === 'corr' ? [40, 44, 52] : endKind === 'rail' ? [30, 40, 60] : [88, 94, 106];
    var cEnd = thermal ? mixc(fog, iron(tempU(v.tempC + (endKind === 'door' ? 1 : -1))), vis(zEnd)) : mixc(fog, mixc([0, 0, 0], endBase, lamp(zEnd)), vis(zEnd));
    quadFill(ctx, [proj(-hw, 0, zEnd), proj(hw, 0, zEnd), proj(hw, ceil, zEnd), proj(-hw, ceil, zEnd)], rgba(cEnd));
    if (endKind === 'door' || endKind === 'stair') {   // a doorway (the room beyond) or the stairs
      var dw = endKind === 'door' ? 0.95 : 0.9, dh = endKind === 'door' ? 2.1 : 2.4, a = proj(-dw, 0, zEnd), b = proj(dw, dh, zEnd);
      ctx.fillStyle = rgba(thermal ? mixc(fog, iron(tempU(v.tempC + 2)), vis(zEnd)) : mixc(fog, [10, 12, 16], vis(zEnd))); ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
      if (endKind === 'stair') { ctx.strokeStyle = rgba(mixc(fog, thermal ? iron(tempU(v.tempC - 4)) : [120, 126, 140], vis(zEnd) * 0.9), 0.9); ctx.lineWidth = 1.5; for (var sn = 0; sn < 6; sn++) { var zz = zEnd - 0.1 - sn * 0.0, y1 = proj(0, 0.35 * (sn + 1), zEnd)[1]; ctx.beginPath(); ctx.moveTo(a[0], y1); ctx.lineTo(b[0], y1); ctx.stroke(); } }
    }
    if (glow) {   // a burning room beyond the doorway
      var ga = proj(0, 1.0, zEnd), gr = ctx.createRadialGradient(ga[0], ga[1], 2, ga[0], ga[1], f * 1.8 / zEnd);
      gr.addColorStop(0, thermal ? 'rgba(255,255,230,0.95)' : 'rgba(255,150,60,0.8)'); gr.addColorStop(0.5, thermal ? 'rgba(255,200,70,0.5)' : 'rgba(255,90,30,0.35)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, hh);
    }
    // door frames on both walls at the junction ahead (rooms north / south of the next corridor node); a burning room glows
    if (kind === 'corr' && endKind === 'corr' && ahead) {
      (g.nbr[ahead.n.id] || []).forEach(function (id) {
        var rn = g.nodes[g.byId[id]]; if (!rn || rn.type === 2 || rn.type === 3 || rn.fl !== ahead.n.fl) return;
        var side = ((Math.atan2(rn.x - ahead.n.x, -(rn.y - ahead.n.y)) * 180 / Math.PI + 360) % 360), rel = angDiff(side, yaw), sgn = rel > 0 ? 1 : -1;
        if (Math.abs(Math.abs(rel) - 90) > 50) return;
        var za2 = Math.max(0.6, zEnd - 1.0), zb2 = Math.max(0.7, zEnd - 0.1), burning = stt && stt.burn[g.byId[rn.id]] === 1;
        var dcol = thermal ? mixc(fog, iron(tempU(v.tempC + (burning ? 30 : 1))), vis(zEnd)) : mixc(fog, mixc([0, 0, 0], burning ? [200, 90, 30] : [60, 44, 34], lamp(zEnd)), vis(zEnd));
        quadFill(ctx, [proj(sgn * hw, 0, za2), proj(sgn * hw, 2.1, za2), proj(sgn * hw, 2.1, zb2), proj(sgn * hw, 0, zb2)], rgba(dcol));
      });
    }
    // floor tiles and ceiling lamps: depth cues
    ctx.lineWidth = 1;
    for (var zt = 1; zt < zf; zt += 1) { var l = proj(-hw, 0, zt), rg = proj(hw, 0, zt); ctx.strokeStyle = rgba(mixc(fog, thermal ? iron(tempU(v.tempC - 4)) : [110, 116, 128], vis(zt) * 0.5), 0.35); ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(rg[0], rg[1]); ctx.stroke(); }
    if (!thermal && kind !== 'stair') for (var zl = 2; zl < zf; zl += 2.5) { var q = proj(0, ceil - 0.02, zl), sw = f * 0.5 / zl; ctx.fillStyle = rgba([255, 244, 214], 0.5 * vis(zl) * (v.lighting === 'dark' ? 0.3 : 1)); ctx.fillRect(q[0] - sw / 2, q[1] - 1, sw, 2.5); }
    // people, far → near
    var detections = [], hidden = 0, FOV = 44;
    var tag = list.map(function (it) {
      var rel = angDiff(it.bearing, yaw), Z = it.dist * Math.cos(rel * Math.PI / 180), Xc = it.dist * Math.sin(rel * Math.PI / 180);
      return { it: it, rel: rel, Z: Math.max(1.8, Z), X: clamp(Xc, -hw * 0.82, hw * 0.82) };
    });
    tag.forEach(function (t) { if (Math.abs(t.rel) > FOV || t.it.dist < 0.5) hidden++; });
    tag.filter(function (t) { return Math.abs(t.rel) <= FOV; }).sort(function (a, b) { return b.Z - a.Z; }).forEach(function (t) {
      var p = t.it.p, pp = t.it.pp, kindP = pp && pp.persona === 'wheelchair' && !pp.asleep ? 'seat' : (pp && (pp.asleep || pp.st === 'incapacitated' || pp.st === 'down')) ? 'lie' : 'stand';
      var s = f / t.Z, x = cx + f * t.X / t.Z, foot = hy + f * camH / t.Z, d = t.Z;
      var fill, head, line = null;
      if (thermal) { var str = clamp(p.strength * 1.6, 0, 1), bg = mixc(fog, iron(tempU(v.tempC - 1.5)), vis(d)); fill = rgba(mixc(bg, iron(tempU(34)), str)); head = rgba(mixc(bg, iron(tempU(36.5)), str)); }
      else { var a = clamp(vis(d) * (0.35 + 0.65 * lamp(d)) * 1.4, 0.05, 1); fill = rgba(mixc(fog, [150, 138, 128], a)); head = rgba(mixc(fog, [196, 164, 138], a)); line = rgba(mixc(fog, [20, 20, 24], a), 0.5); }
      figure(ctx, kindP, x, foot, s, fill, head, line);
      var bx = figBox(kindP, x, foot, s);
      detections.push({ box: bx, p: p, strength: p.strength, kind: kindP });
    });
    // a hot object that looks like a person (a false positive): checked for a few seconds, then dismissed
    var possible = rr && rr.investigate ? { left: Math.max(0, rr.investigate.until - sim.t) } : null;
    if (possible) {
      var Zo = 2.4, Xo = 0.55, so = f / Zo, xo = cx + f * Xo / Zo, fo = hy + f * camH / Zo;
      ctx.save(); rrect(ctx, xo - 0.3 * so, fo - 1.0 * so, 0.6 * so, 1.0 * so, 0.08 * so);
      ctx.fillStyle = thermal ? rgba(mixc(fog, iron(0.86), vis(Zo))) : rgba(mixc(fog, [52, 46, 42], vis(Zo))); ctx.fill(); ctx.restore();
      ctx.save(); ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeStyle = '#fbbf24'; ctx.strokeRect(xo - 0.42 * so, fo - 1.14 * so, 0.84 * so, 1.18 * so); ctx.restore();
      camChip(ctx, B('شخص محتمل؟ يتم التحقق — ', 'possible person? checking — ') + N(possible.left) + B(' ث', ' s'), xo, fo - 1.14 * so - 12, '#fbbf24', 'mid');
    }
    // detection boxes (detected = solid green; a strong unidentified heat blob = dashed amber)
    var nDet = 0, nBlob = 0, condTxt = '';
    detections.forEach(function (dt) {
      var bx = dt.box, det = dt.p.detected;
      if (!det && dt.strength < 0.18) return;
      var col = det ? '#4ade80' : '#fbbf24', x0 = bx[0] - 4, y0 = bx[1] - 4, bw = bx[2] + 8, bh = bx[3] + 8, cl = Math.min(14, bw / 3, bh / 3);
      ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = col;
      if (det) { ctx.beginPath(); [[x0, y0, 1, 1], [x0 + bw, y0, -1, 1], [x0, y0 + bh, 1, -1], [x0 + bw, y0 + bh, -1, -1]].forEach(function (c4) { ctx.moveTo(c4[0] + c4[2] * cl, c4[1]); ctx.lineTo(c4[0], c4[1]); ctx.lineTo(c4[0], c4[1] + c4[3] * cl); }); ctx.stroke(); }
      else { ctx.setLineDash([4, 4]); ctx.strokeRect(x0, y0, bw, bh); }
      ctx.restore();
      var label = det ? (dt.p.name ? LL(dt.p.name) + ' · ' : B('شخص — ', 'person — ')) + (dt.p.condition ? condName(dt.p.condition) + B(' (تقدير)', ' (est.)') : '') : B('جسم دافئ؟', 'warm blob?');
      camChip(ctx, label, clamp(x0 + bw / 2, 8, w - 8), y0 - 12 < 30 ? Math.min(hh - 34, y0 + bh + 12) : y0 - 12, col, 'mid');
      if (det) { nDet++; if (!condTxt && dt.p.condition) condTxt = condName(dt.p.condition); } else nBlob++;
    });
    // vignette
    var vg = ctx.createRadialGradient(cx, hh * 0.5, hh * 0.35, cx, hh * 0.5, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, hh);
    // chips + scale
    camChip(ctx, thermal ? B('حراري — ألوان زائفة', 'THERMAL — false colour') : B('كاميرا عادية + مصباح', 'VISIBLE + lamp'), 8, 14, thermal ? '#ffd166' : '#8ee9f2', 'start');
    camChip(ctx, 'SIM', w - 8, 14, '#fbbf24', 'end');
    var hdTxt = Math.round(yaw) + '°';
    camChip(ctx, B('الرأس: ', 'head: ') + N(Math.round(yaw)) + '°' + (list.length ? B(' (نحو أقرب شخص)', ' (toward nearest)') : ''), 8, hh - 14, '#c3cbd8', 'start');
    if (hidden) camChip(ctx, '+' + N(hidden) + B(' خارج الإطار', ' out of frame'), w - 8, hh - 14, '#c3cbd8', 'end');
    if (thermal) {
      var sw = 112, sx0 = Math.round(w / 2 - sw / 2), sy0 = hh - 24; var gr2 = ctx.createLinearGradient(sx0, 0, sx0 + sw, 0); IRON.forEach(function (s2) { gr2.addColorStop(s2[0], rgba(s2[1])); });
      ctx.fillStyle = 'rgba(4,7,12,0.82)'; rrect(ctx, sx0 - 6, sy0 - 12, sw + 12, 32, 5); ctx.fill(); ctx.fillStyle = gr2; ctx.fillRect(sx0, sy0 - 6, sw, 8);
      ctx.fillStyle = '#c3cbd8'; ctx.font = '500 9.5px ' + MONO; ctx.textAlign = 'left'; ctx.fillText('20', sx0, sy0 + 11); ctx.textAlign = 'right'; ctx.fillText('55 °C', sx0 + sw, sy0 + 11);
      var mk = sx0 + sw * tempU(34); ctx.fillStyle = '#fff'; ctx.fillRect(mk - 1, sy0 - 9, 2, 14); ctx.textAlign = 'center'; ctx.fillText('34', mk, sy0 + 11);
    }
    EYE.summary = (thermal ? B('عرض حراري. ', 'Thermal view. ') : B('عرض الكاميرا العادية. ', 'Visible-camera view. ')) + B('الرؤية ' + N(pct(v.visibility)) + '٪ على 6 م. ', 'Visibility ' + N(pct(v.visibility)) + ' % at 6 m. ')
      + (nDet ? N(nDet) + B(' شخص مكتشف', ' person(s) detected') + (condTxt ? B(' (الحالة تقدير: ', ' (est. condition: ') + condTxt + ')' : '') + '. ' : B('لا أحد مكتشف. ', 'No one detected. ')) + (nBlob ? N(nBlob) + B(' جسم دافئ غير مؤكد. ', ' unconfirmed warm blob(s). ') : '') + (possible ? B('شخص محتمل قيد التحقق. ', 'A possible person is being checked. ') : '');
  }

  /* ====================================================================================
   * 7. CHROME BUILDERS — small widgets first
   * ==================================================================================== */
  function btn(cls, iconName, ar, en, onclick, extra) {
    var b = h('button', { type: 'button', class: cls, onclick: onclick });
    if (iconName) b.appendChild(icon(iconName));
    if (ar) b.appendChild(bi(ar, en));
    if (extra) for (var k in extra) b.setAttribute(k, extra[k]);
    return b;
  }
  function iconBtn(iconName, ar, en, onclick, cls) { var b = h('button', { type: 'button', class: 'icon-btn ' + (cls || ''), onclick: onclick }); b.appendChild(icon(iconName)); lab(b, 'aria-label', ar, en); lab(b, 'title', ar, en); return b; }
  var uid = 0;
  function nextId(p) { return 'rl-' + p + (++uid); }
  // a segmented radio group: items = [{id, ar, en, icon?}] ; onPick(id)
  function seg(labelAr, labelEn, items, onPick, cls) {
    var g = h('div', { class: 'rl-seg ' + (cls || ''), role: 'radiogroup' }); lab(g, 'aria-label', labelAr, labelEn);
    var bs = items.map(function (it, i) {
      var b = h('button', { type: 'button', class: 'rl-seg-b', role: 'radio', 'aria-checked': 'false', tabindex: i === 0 ? '0' : '-1', 'data-id': it.id });
      if (it.icon) b.appendChild(icon(it.icon));
      b.appendChild(it.ar !== undefined ? bi(it.ar, it.en) : h('span', { text: it.text }));
      if (it.title) lab(b, 'title', it.title[0], it.title[1]);
      b.addEventListener('click', function () { onPick(it.id); });
      return b;
    });
    g.addEventListener('keydown', function (e) {
      var k = e.key, rtl = htmlEl.dir === 'rtl', cur = bs.indexOf(doc.activeElement); if (cur < 0) return;
      var d = (k === 'ArrowRight' ? (rtl ? -1 : 1) : k === 'ArrowLeft' ? (rtl ? 1 : -1) : k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0);
      if (!d) return; e.preventDefault(); var nx = bs[(cur + d + bs.length) % bs.length]; nx.focus(); nx.click();
    });
    bs.forEach(function (b) { g.appendChild(b); });
    g.setValue = function (id) { bs.forEach(function (b) { var on = b.getAttribute('data-id') === String(id); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.setAttribute('tabindex', on ? '0' : '-1'); }); };
    g.buttons = bs;
    return g;
  }
  function field(labelAr, labelEn, control, hintAr, hintEn) {
    var id = control.id || (control.id = nextId('f'));
    var l = h('label', { class: 'rl-field', 'for': id }, h('span', { class: 'rl-fl' }, bi(labelAr, labelEn)), control);
    if (hintAr) l.appendChild(h('small', { class: 'muted' }, bi(hintAr, hintEn)));
    return l;
  }
  function details(idKey, titleAr, titleEn, open, bodyEls) {
    var d = h('details', { class: 'rl-dt', id: 'rl-dt-' + idKey }); if (open) d.setAttribute('open', '');
    var s = h('summary', null, h('span', { class: 'rl-dt-t' }, bi(titleAr, titleEn)));
    d.appendChild(s); var b = h('div', { class: 'rl-dt-b' }, bodyEls); d.appendChild(b); d.body = b; d.sum = s;
    return d;
  }
  function pnl(idKey, titleAr, titleEn, headExtra) {
    var hd = h('div', { class: 'rl-pn-h' }, h('h2', { class: 'rl-pn-t' }, bi(titleAr, titleEn)), headExtra || null);
    var bd = h('div', { class: 'rl-pn-b' }), el = h('section', { class: 'rl-pn', id: 'rl-pn-' + idKey }, hd, bd);
    el.body = bd; el.head = hd; return el;
  }
  function pill(text, tok) { var p = h('span', { class: 'rl-pill', text: text }); if (tok) p.style.setProperty('--sc', 'var(' + tok + ')'); return p; }
  function tag(cls, text) { return h('span', { class: 'tag ' + (cls || ''), text: text }); }
  function roomOptions(sel, withNodes, idValue) {   // <option>s of the building's rooms (and optionally corridors / stairs), grouped by floor; idValue: the option value is the node id
    var g = LAB.g, fls = g.floorList.filter(function (f) { return f < g.floors; });
    fls.forEach(function (fl) {
      var og = h('optgroup'); og.label = floorLabel(g, fl); og.setAttribute('data-fl', fl);
      g.nodes.forEach(function (n) {
        if (n.fl !== fl) return;
        var isRoom = n.type === 1 || n.type === 7;
        if (isRoom || (withNodes && (n.type === 2 || n.type === 3 || n.type === 4 || n.type === 5))) {
          var lbl = isRoom ? (n.room && n.type === 1 ? B('غرفة ', 'Room ') + n.room : LL(n.label)) : LL(n.label) + ' (' + n.id + ')';
          og.appendChild(h('option', { value: isRoom && !idValue ? (n.room || n.id) : n.id, text: lbl }));
        }
      });
      if (og.children.length) sel.appendChild(og);
    });
  }

  /* ====================================================================================
   * 8. THE CONSOLE: toolbar, stage with its HUD, panels (controls, eye, finds, count, card, log), phone sheet
   * ==================================================================================== */
  var SPEEDS = [1, 4, 16];

  function buildToolbar() {
    var play = btn('btn btn-primary btn-sm rl-play', 'play', 'تشغيل', 'Play', function () { togglePlay(); });
    UI.play = play; UI.playIcon = play.querySelector('svg');
    UI.playLabelAr = $('[data-l=ar]', play); UI.playLabelEn = $('[data-l=en]', play);
    var step = btn('btn btn-ghost btn-sm', 'step', 'خطوة (ث)', 'Step (1 s)', function () { LAB.playing = false; setPlayUI(); advance(1); paintAll(); });
    UI.speed = seg('سرعة المحاكاة', 'Simulation speed', SPEEDS.map(function (s) { return { id: s, text: s + '×' }; }), function (id) { LAB.speed = +id; UI.speed.setValue(id); DIRTY.ui = true; setPlayUI(); });
    UI.time = h('div', { class: 'rl-time', 'aria-live': 'off' }, h('b', { class: 'num rl-t', text: 'T+00:00' }), h('span', { class: 'num muted rl-clk', text: '04:00:00' }));
    UI.phase = h('span', { class: 'rl-phase tag', text: '' }); UI.bannerT = h('span', { class: 'rl-banner rl-bannerT', hidden: true });
    var reset = btn('btn btn-ghost btn-sm', 'reset', 'إعادة', 'Reset', function () { restart(); });
    var assume = btn('btn btn-ghost btn-sm rl-assume-btn', 'sliders', 'الافتراضات', 'Assumptions', function () { toggleDrawer(); }, { 'aria-expanded': 'false', 'aria-controls': 'rl-drawer' });
    UI.assumeBtn = assume;
    assume.appendChild(h('span', { class: 'rl-count-badge num', text: String(robotParams().length) }));
    UI.toolbar = h('div', { class: 'rl-toolbar', role: 'toolbar' }, h('div', { class: 'rl-tg' }, play, step, UI.speed), h('div', { class: 'rl-tg rl-tg-time' }, UI.time, UI.phase, UI.bannerT), h('div', { class: 'rl-tg rl-tg-end' }, reset, assume));
    lab(UI.toolbar, 'aria-label', 'التحكم بالزمن', 'Clock controls');
    return UI.toolbar;
  }
  function setPlayUI() {
    if (!UI.play) return;
    var on = LAB.playing;
    UI.play.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (UI.playLabelAr) { UI.playLabelAr.textContent = on ? 'إيقاف مؤقت' : 'تشغيل'; UI.playLabelEn.textContent = on ? 'Pause' : 'Play'; }
    var ni = icon(on ? 'pause' : 'play'); if (UI.playIcon && UI.playIcon.parentNode) { UI.playIcon.parentNode.replaceChild(ni, UI.playIcon); UI.playIcon = ni; }
    setCls(UI.play, 'is-playing', on);
    var sim = LAB.sim; UI.play.disabled = !!(sim && sim.done);
    if (UI.logList) UI.logList.setAttribute('aria-live', on && LAB.speed > 1 ? 'off' : 'polite');   // a screen reader is not flooded at 4× / 16×
  }
  function togglePlay() {
    var sim = LAB.sim; if (!sim) return;
    if (sim.done) { restart(); }
    LAB.playing = !LAB.playing; LAB.started = true; if (UI.startCard) UI.startCard.hidden = true;
    LAB.lastFrame = 0; setPlayUI();
  }

  function buildStage() {
    var cv = h('canvas', { id: 'rl-canvas', tabindex: '0', 'aria-describedby': 'rl-summary' });
    lab(cv, 'aria-label', 'مقطع المبنى: مخططات الطوابق والروبوت والسكان', 'Building cut-away: floor plans, the robot and the residents');
    R.cvs = cv; R.ctx = null;
    UI.stage = h('div', { class: 'rl-stage', id: 'rl-stage' });
    UI.summary = h('p', { class: 'sr-only', id: 'rl-summary' });
    UI.tip = h('div', { class: 'rl-tip', hidden: true });
    UI.pop = h('div', { class: 'rl-pop', hidden: true, role: 'dialog', 'aria-modal': 'false' });
    lab(UI.pop, 'aria-label', 'تفاصيل الموقع المحدد', 'Selected place');
    UI.pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(); R.cvs.focus({ preventScroll: true }); } });
    // floors (rebuilt when the building changes)
    UI.floors = h('div', { class: 'rl-seg rl-floors', role: 'radiogroup' }); UI.floors.addEventListener('keydown', floorKeys); lab(UI.floors, 'aria-label', 'الطابق المعروض', 'Floor shown');
    UI.tools = seg('أداة الخريطة', 'Map tool', [
      { id: 'inspect', icon: 'cursor', ar: 'فحص', en: 'Inspect', title: ['فحص: انقر غرفة لترى تفاصيلها', 'Inspect: click a room for its details'] },
      { id: 'priority', icon: 'list', ar: 'أولوية', en: 'Priority', title: ['أولوية البحث: انقر الغرف بالترتيب', 'Search priority: click rooms in order'] },
      { id: 'goto', icon: 'target', ar: 'اذهب', en: 'Go to', title: ['اذهب إلى: انقر غرفة لإرسال الروبوت', 'Go to: click a place to send the robot'] },
      { id: 'door', icon: 'lock', ar: 'باب', en: 'Door', title: ['باب: انقر باباً لقفله أو فتحه', 'Door: click a door to lock or unlock it'] }
    ], function (id) { LAB.tool = id; UI.tools.setValue(id); closePop(); DIRTY.stage = true; paintToolHint(); }, 'rl-tools');
    UI.toolHint = h('p', { class: 'rl-toolhint', 'aria-live': 'polite' });
    UI.banner = h('div', { class: 'rl-banner', hidden: true });
    UI.keyCard = h('div', { class: 'rl-keycard', hidden: true, role: 'group' });
    lab(UI.keyCard, 'aria-label', 'المفتاح البشري: اعتماد نشر الروبوت', 'The human key: approving the robot');
    var zoom = h('div', { class: 'rl-zoom', role: 'group' }, iconBtn('zoomin', 'تكبير', 'Zoom in', function () { camZoom(1.3); }, 'sm'), iconBtn('zoomout', 'تصغير', 'Zoom out', function () { camZoom(1 / 1.3); }, 'sm'), iconBtn('full', 'ملاءمة الشاشة', 'Fit to screen', function () { fitView(true); }, 'sm'));
    lab(zoom, 'aria-label', 'التكبير والتحريك', 'Zoom and pan');
    // layers popover
    var layerDefs = [['smoke', 'النار والدخان', 'Fire & smoke'], ['coverage', 'تغطية البحث', 'Search coverage'], ['link', 'مدى الاتصال (تقريبي)', 'Link range (approx.)'], ['trail', 'المسار والمسار المخطط', 'Trail & planned path'], ['beacons', 'المنارات ومسارات الإرشاد', 'Beacons & guide routes'], ['people', 'السكان', 'Residents'], ['labels', 'الأسماء', 'Labels']];
    UI.layerBox = h('div', { class: 'rl-layers', hidden: true, role: 'group' }); lab(UI.layerBox, 'aria-label', 'طبقات الخريطة', 'Map layers');
    layerDefs.forEach(function (d) {
      var cb = h('input', { type: 'checkbox', checked: LAB.layers[d[0]] ? 'checked' : null }); cb.checked = !!LAB.layers[d[0]];
      cb.addEventListener('change', function () { LAB.layers[d[0]] = cb.checked; DIRTY.stage = true; });
      UI.layerBox.appendChild(h('label', { class: 'rl-chk' }, cb, bi(d[1], d[2])));
    });
    UI.layerBtn = btn('btn btn-ghost btn-sm rl-layerbtn', 'layers2', 'الطبقات', 'Layers', function () { var open = UI.layerBox.hidden; UI.layerBox.hidden = !open; UI.layerBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }, { 'aria-expanded': 'false' });
    var hud = h('div', { class: 'rl-hud' },
      h('div', { class: 'rl-hud-t' }, UI.floors, UI.tools),
      h('div', { class: 'rl-hud-info' }, UI.banner, UI.toolHint), UI.keyCard,
      h('div', { class: 'rl-hud-bl' }, UI.layerBtn, UI.layerBox),
      h('div', { class: 'rl-hud-br' }, zoom), UI.tip, UI.pop);
    UI.startCard = h('div', { class: 'rl-start', role: 'group' },
      h('div', { class: 'rl-btns' }, btn('btn btn-primary btn-sm', 'play', 'شاهد القصة', 'Watch the story', function () { startStory(); }), btn('btn btn-ghost btn-sm', 'target', 'سأتحكم بنفسي', 'I will take control', function () { UI.startCard.hidden = true; })));
    lab(UI.startCard, 'aria-label', 'بداية سريعة', 'Quick start');
    UI.stage.appendChild(cv); UI.stage.appendChild(hud); UI.stage.appendChild(UI.startCard);
    bindStage(cv);
    return h('div', { class: 'rl-stagewrap' }, UI.stage, UI.summary);
  }
  function buildFloorTabs() {
    var g = LAB.g, f = UI.floors; f.textContent = '';
    var items = [{ id: 'auto', ar: 'تلقائي', en: 'Auto', title: ['تلقائي: يتبع الروبوت', 'Auto: follows the robot'] }, { id: 'all', ar: 'الكل', en: 'All', title: ['كل الطوابق', 'All floors'] }].concat(g.floorList.map(function (fl) { return { id: fl, text: fl >= g.floors ? '' : String(fl + 1), ar: fl >= g.floors ? 'السطح' : undefined, en: fl >= g.floors ? 'Roof' : undefined, title: [fl >= g.floors ? 'السطح' : 'الطابق ' + (fl + 1), fl >= g.floors ? 'Roof' : 'Floor ' + (fl + 1)] }; }));
    items.forEach(function (it, i) {
      var b = h('button', { type: 'button', class: 'rl-seg-b', role: 'radio', 'aria-checked': 'false', tabindex: i === 0 ? '0' : '-1', 'data-id': it.id });
      b.appendChild(it.text ? h('span', { class: 'num', text: it.text }) : bi(it.ar, it.en));
      lab(b, 'title', it.title[0], it.title[1]); lab(b, 'aria-label', it.title[0], it.title[1]);
      b.addEventListener('click', function () { LAB.floorSel = (it.id === 'all' || it.id === 'auto') ? it.id : +it.id; paintFloorTabs(); fitView(true); });
      f.appendChild(b);
    });
    paintFloorTabs();
  }
  function floorKeys(e) {
    var bs = $$('.rl-seg-b', UI.floors), cur = bs.indexOf(doc.activeElement), rtl = htmlEl.dir === 'rtl'; if (cur < 0) return;
    var d = (e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0); if (!d) return;
    e.preventDefault(); var nx = bs[(cur + d + bs.length) % bs.length]; nx.focus(); nx.click();
  }
  function paintFloorTabs() {
    var sel = LAB.floorSel;
    $$('.rl-seg-b', UI.floors).forEach(function (b) { var on = String(b.getAttribute('data-id')) === String(sel); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.setAttribute('tabindex', on ? '0' : '-1'); });
  }
  function paintToolHint() {
    var t = LAB.tool, s = { inspect: ['انقر غرفة أو شخصاً أو الروبوت لترى تفاصيله.', 'Click a room, a person or the robot for details.'], priority: ['انقر الغرف بالترتيب الذي تريد أن يبحث فيه الروبوت.', 'Click rooms in the order you want the robot to search them.'],
      goto: ['انقر غرفة أو ممراً لإرسال الروبوت إليه.', 'Click a room or corridor to send the robot there.'], door: ['انقر باب غرفة لقفله أو فتحه أمام الروبوت.', 'Click a room\'s door to lock or unlock it for the robot.'] }[t];
    setText(UI.toolHint, t === 'inspect' ? '' : B(s[0], s[1]));
    UI.toolHint.hidden = t === 'inspect';
  }

  /* ---- pointer / keyboard on the stage ---- */
  function bindStage(cv) {
    var down = null;
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      R.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      down = { x: e.clientX, y: e.clientY, moved: false, n: Object.keys(R.pointers).length, d0: null };
      closeLayers();
    });
    cv.addEventListener('pointermove', function (e) {
      var rect = cv.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top, ids = Object.keys(R.pointers);
      if (R.pointers[e.pointerId]) {
        var prev = R.pointers[e.pointerId];
        if (ids.length === 2) {
          var o = R.pointers[ids[0] === String(e.pointerId) ? ids[1] : ids[0]], d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y), d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
          if (d0 > 10 && d1 > 10) camZoom(d1 / d0, (e.clientX + o.x) / 2 - rect.left, (e.clientY + o.y) / 2 - rect.top);
          if (down) down.moved = true;
        } else if (down) {
          var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          if (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down.moved = true; camPan(dx, dy); }
        }
        R.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      } else hover(px, py, e.pointerType !== 'touch');
    });
    function up(e) {
      var rect = cv.getBoundingClientRect(), wasClick = down && !down.moved && down.n === 1;
      delete R.pointers[e.pointerId];
      if (wasClick) stageClick(e.clientX - rect.left, e.clientY - rect.top);
      if (!Object.keys(R.pointers).length) down = null;
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', function (e) { delete R.pointers[e.pointerId]; down = null; });
    cv.addEventListener('pointerleave', function () { UI.tip.hidden = true; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var rect = cv.getBoundingClientRect(); camZoom(Math.exp(clamp(-e.deltaY, -300, 300) * 0.0015), e.clientX - rect.left, e.clientY - rect.top); }, { passive: false });
    cv.addEventListener('keydown', stageKey);
    cv.addEventListener('focus', function () { if (!R.cursor) { var first = firstNodeOnFloor(); if (first) { R.cursor = first.id; DIRTY.stage = true; } } });
  }
  function closeLayers() { if (UI.layerBox && !UI.layerBox.hidden) { UI.layerBox.hidden = true; UI.layerBtn.setAttribute('aria-expanded', 'false'); } }
  function hover(px, py, show) {
    var hh = hitAt(px, py), tip = UI.tip;
    if (!hh || !show) { tip.hidden = true; R.cvs.style.cursor = ''; return; }
    var txt = hitTitle(hh); if (!txt) { tip.hidden = true; return; }
    tip.textContent = txt; tip.hidden = false;
    var x = clamp(px + 12, 4, Math.max(4, R.w - tip.offsetWidth - 4)), y = clamp(py - 28, 4, R.h - 26);
    tip.style.insetInlineStart = 'auto'; tip.style.left = x + 'px'; tip.style.top = y + 'px';
    R.cvs.style.cursor = hh.type === 'person' || hh.type === 'robot' || hh.type === 'node' || hh.type === 'door' ? 'pointer' : '';
  }
  function nodeTitle(id) {
    var n = LAB.g.nodes[LAB.g.byId[id]]; if (!n) return id;
    return (n.type === 1 ? B('غرفة ', 'Room ') + n.room : LL(n.label)) + ' · ' + floorLabel(LAB.g, n.fl);
  }
  function hitTitle(hh) {
    var snap = LAB.snap; if (!snap) return '';
    switch (hh.type) {
      case 'node': return nodeTitle(hh.id);
      case 'door': return B('باب غرفة ', 'Door of room ') + (LAB.g.nodes[LAB.g.byId[hh.id]].room || hh.id) + ' · ' + doorStateText(hh.id);
      case 'exit': return LL((WI.structs[LAB.struct].exits.filter(function (e) { return e.id === hh.id; })[0] || { name: T(hh.id, hh.id) }).name) + ' · ' + LL(EXIT_STATE[hh.state.state].name);
      case 'person': var p = snap.people.filter(function (q) { return q.key === hh.id; })[0]; if (!p) return '';
        return (p.hero ? LL(HERO_NAME[p.hero]) : (p.name ? LL(p.name) : B('مقيم', 'Resident'))) + (p.room ? ' · ' + B('غرفة ', 'room ') + p.room : '') + ' · ' + LL(PERSON_ST[personState(p) || 'calm'].name);
      case 'robot': var r = robotsOf().filter(function (q) { return q.id === hh.id; })[0]; return r ? LL(r.name) + ' · ' + stateName(r.state) + ' · ' + N(pct(r.battery)) + '%' : '';
      case 'beacon': return hh.auto ? B('مرحِّل اتصال', 'Link relay') : B('منارة طريق', 'Route beacon');
    }
    return '';
  }
  function doorStateText(id) {
    var sim = LAB.sim, st = sim.stt && sim.stt[LAB.struct], obst = sim.rb && sim.rb.obst ? sim.rb.obst : {}, di = LAB.g.doorOf[id];
    if (obst[id] && obst[id].locked) return B('مقفل (لا يفتحه الروبوت)', 'LOCKED (the robot never forces it)');
    return st && st.doorOpen && st.doorOpen[di] ? B('مفتوح', 'open') : B('مغلق (يفتحه الروبوت إن لم يكن مقفلاً)', 'closed (the robot can open it)');
  }
  function stageClick(px, py) {
    var hh = hitAt(px, py); R.cursor = null;
    if (!hh) { closePop(); return; }
    var tool = LAB.tool;
    if (tool !== 'inspect' && (hh.type === 'person' || hh.type === 'beacon' || hh.type === 'exit')) { var under = nodeAtPoint(px, py); if (under) hh = under; }   // the tools act on the room under a dot
    var nodeId = hh.type === 'node' || hh.type === 'door' ? hh.id : null;
    if (hh.type === 'robot') { LAB.sel = hh.id; DIRTY.eye = DIRTY.ui = true; paintAll(); showPop(hh); return; }
    if (tool === 'priority' && nodeId) { var n = LAB.g.nodes[LAB.g.byId[nodeId]]; if (n && n.room) togglePriority(n.room); return; }
    if (tool === 'goto' && nodeId) { var n2 = LAB.g.nodes[LAB.g.byId[nodeId]]; doGoto(n2.type === 1 ? n2.room : n2.id); paintAll(); return; }
    if (tool === 'door' && nodeId) { var n3 = LAB.g.nodes[LAB.g.byId[nodeId]]; if (n3 && n3.type === 1) toggleDoor(n3.id); return; }
    showPop(hh);
  }
  function nodeAtPoint(px, py) {
    var best = null;
    for (var i = 0; i < R.hits.length; i++) { var q = R.hits[i]; if (q.type === 'node' && q.rect && px >= q.rect.x0 && px <= q.rect.x1 && py >= q.rect.y0 && py <= q.rect.y1 && (!best || q.prio >= best.prio)) best = q; }
    return best;
  }
  function nearestNode(fl, x, y) {
    var best = null, bd = 1e9; LAB.g.nodes.forEach(function (n) { if (n.fl !== fl || n.type === 6) return; var d = Math.hypot(n.x - x, n.y - y) + (n.type === 2 ? 0.15 : 0); if (d < bd) { bd = d; best = n; } }); return best;
  }
  function firstNodeOnFloor() {
    var fl = effFloors()[0]; var g = LAB.g, best = null;
    g.nodes.forEach(function (n) { if (n.fl === fl && n.type === 1 && (!best || n.y < best.y || (n.y === best.y && n.x < best.x))) best = n; });
    return best;
  }
  function stageKey(e) {
    var k = e.key, g = LAB.g;
    if (k === '+' || k === '=') { camZoom(1.25); e.preventDefault(); return; }
    if (k === '-' || k === '_') { camZoom(0.8); e.preventDefault(); return; }
    if (k === '0') { fitView(true); e.preventDefault(); return; }
    if (k === 'Escape') { closePop(); return; }
    var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[k]) {
      e.preventDefault();
      var cur = g.nodes[g.byId[R.cursor || '']] || firstNodeOnFloor(); if (!cur) return;
      var d = dirs[k], best = null, bs = 1e9;
      g.nodes.forEach(function (n) {
        if (n === cur || n.fl !== cur.fl || (n.type !== 1 && n.type !== 2 && n.type !== 3 && n.type !== 7 && n.type !== 4)) return;
        var dx = n.x - cur.x, dy = n.y - cur.y, along = dx * d[0] + dy * d[1], across = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
        if (along <= 0.05) return; var sc = along + across * 1.8; if (sc < bs) { bs = sc; best = n; }
      });
      if (best) { R.cursor = best.id; DIRTY.stage = true; announce(nodeTitle(best.id)); }
      return;
    }
    if ((k === 'PageUp' || k === 'PageDown') && g.floorList.length > 1) {
      e.preventDefault(); var cur2 = g.nodes[g.byId[R.cursor || '']]; var fl = cur2 ? cur2.fl : 0, nf = clamp(fl + (k === 'PageUp' ? 1 : -1), 0, g.floors - 1);
      LAB.floorSel = nf; paintFloorTabs(); fitView(true);
      var cand = null; g.nodes.forEach(function (n) { if (n.fl === nf && cur2 && n.type === cur2.type && Math.abs(n.x - cur2.x) < 0.01 && Math.abs(n.y - cur2.y) < 0.01) cand = n; });
      if (!cand) cand = firstNodeOnFloor(); if (cand) { R.cursor = cand.id; DIRTY.stage = true; announce(nodeTitle(cand.id)); }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault(); var n = g.nodes[g.byId[R.cursor || '']]; if (!n) return;
      var hh = findHit('node', n.id); if (!hh) return;
      if (LAB.tool === 'priority' && n.room) togglePriority(n.room);
      else if (LAB.tool === 'goto') { doGoto(n.type === 1 ? n.room : n.id); paintAll(); }
      else if (LAB.tool === 'door' && n.type === 1) toggleDoor(n.id);
      else showPop(hh);
    }
  }

  /* ---- the inspector popover (also the touch-friendly route to the three tools) ---- */
  function closePop() { if (UI.pop) UI.pop.hidden = true; LAB.sel2 = null; DIRTY.stage = true; }
  function showPop(hh) {
    var pop = UI.pop, snap = LAB.snap, g = LAB.g; pop.textContent = '';
    var title = hitTitle(hh), kv = [], acts = [];
    var closeB = iconBtn('x', 'إغلاق', 'Close', closePop, 'sm');
    pop.appendChild(h('div', { class: 'pop-h' }, h('b', { text: title }), closeB));
    if (hh.type === 'node' || hh.type === 'door') {
      var n = g.nodes[g.byId[hh.id]], idx = g.byId[hh.id], st = LAB.sim.stt[g.si]; LAB.sel2 = hh.id;
      var inRoom = snap.people.filter(function (p) { return !p.away && p.fl === n.fl && Math.abs(p.x - n.x) <= (n.type === 2 ? g.hw : 0.75) + 0.1 && Math.abs(p.y - n.y) <= (n.type === 2 ? 0.55 : 1.05); });
      var counts = {}; inRoom.forEach(function (p) { var s = personState(p) || 'calm'; counts[s] = (counts[s] || 0) + 1; });
      kv.push([B('الدخان', 'Smoke'), N(pct(Math.min(1, st.smoke[idx]))) + '%'], [B('الحريق', 'Fire'), st.burn[idx] === 1 ? B('يحترق', 'burning') : st.burn[idx] >= 2 ? B('احترقت', 'burnt') : B('لا', 'no')]);
      if (n.type === 1) { kv.push([B('الباب', 'Door'), doorStateText(n.id)]); var rs = robotsOf().map(function (r) { return r.coverage && r.coverage.rooms[n.room]; }).filter(Boolean); if (rs.length) kv.push([B('حالة الغرفة عند الروبوت', 'Room, as the robot sees it'), ({ searched: B('فُتّشت', 'searched'), open: B('لم تُفتّش', 'not searched yet'), locked: B('مقفلة — أُبلغ عنها', 'locked — reported'), unreachable: B('لا طريق إليها (درج)', 'unreachable (stairs)'), hot: B('حارّة جداً', 'too hot / smoky') })[rs[0]] || rs[0]]); }
      kv.push([B('الأشخاص هنا', 'People here'), inRoom.length ? Object.keys(counts).map(function (s) { return N(counts[s]) + ' ' + LL(PERSON_ST[s].name); }).join('، ') : B('لا أحد', 'no one')]);
      if (n.type === 1) {
        acts.push(btn('btn btn-ghost btn-sm', 'list', 'أضف إلى الأولوية', 'Add to priority', function () { togglePriority(n.room); closePop(); }));
        acts.push(btn('btn btn-ghost btn-sm', 'target', 'أرسل الروبوت', 'Send the robot', function () { doGoto(n.room); closePop(); paintAll(); }));
        acts.push(btn('btn btn-ghost btn-sm', (LAB.sim.rb.obst[n.id] && LAB.sim.rb.obst[n.id].locked) ? 'unlock' : 'lock', (LAB.sim.rb.obst[n.id] && LAB.sim.rb.obst[n.id].locked) ? 'افتح الباب' : 'اقفل الباب', (LAB.sim.rb.obst[n.id] && LAB.sim.rb.obst[n.id].locked) ? 'Unlock the door' : 'Lock the door', function () { toggleDoor(n.id); closePop(); }));
      } else if (n.type === 2 || n.type === 3 || n.type === 4 || n.type === 5) acts.push(btn('btn btn-ghost btn-sm', 'target', 'أرسل الروبوت', 'Send the robot', function () { doGoto(n.id); closePop(); paintAll(); }));
    } else if (hh.type === 'person') {
      var p = snap.people.filter(function (q) { return q.key === hh.id; })[0];
      if (p) {
        kv.push([B('الحالة', 'State'), LL(PERSON_ST[personState(p) || 'calm'].name)], [B('اللغة', 'Language'), (LANGS.filter(function (l) { return l.id === p.lang; })[0] || { name: p.lang }).name]);
        if (p.persona && p.persona !== 'adult') kv.push([B('الاحتياج', 'Need'), LL(NEED_L[p.persona] || T(p.persona, p.persona))]);
        if (p.deaf) kv.push([B('احتياج', 'Need'), LL(NEED_L.deaf)]);
        var f = snap.robot ? snap.robot.finds.filter(function (x) { return x.key === p.key; })[0] : null;
        if (f) kv.push([B('عثر عليه الروبوت', 'Robot found'), 'T+' + mmss(f.t) + ' · ' + LL(f.place)]);
        var nn = nearestNode(p.fl, p.x, p.y);
        if (nn) acts.push(btn('btn btn-ghost btn-sm', 'target', 'أرسل الروبوت إلى هنا', 'Send the robot here', function () { doGoto(nn.type === 1 ? nn.room : nn.id); closePop(); paintAll(); }));
        if (nn && nn.type === 1) acts.push(btn('btn btn-ghost btn-sm', 'list', 'أضف غرفته للأولوية', 'Add the room to priority', function () { togglePriority(nn.room); closePop(); }));
      }
    } else if (hh.type === 'robot') {
      var r = robotsOf().filter(function (q) { return q.id === hh.id; })[0];
      if (r) { kv.push([B('الحالة', 'State'), stateName(r.state)], [B('البطارية', 'Battery'), N(pct(r.battery)) + '%'], [B('المكان', 'Place'), LL(r.pose.label)], [B('الاتصال', 'Link'), r.link.up ? N(pct(r.link.q)) + '%' : B('مقطوع', 'down')]); acts.push(btn('btn btn-ghost btn-sm', 'camera', 'اعرض منظره', 'Show its view', function () { LAB.sel = r.id; closePop(); paintAll(); var e = $('#rl-pn-eye'); if (e) { if (UI.sheet && UI.sheet.show) UI.sheet.show('eye'); } })); }
    }
    var dl = h('dl', { class: 'pop-kv' }); kv.forEach(function (q) { dl.appendChild(h('dt', { text: q[0] })); dl.appendChild(h('dd', { text: q[1] })); });
    pop.appendChild(dl); if (acts.length) pop.appendChild(h('div', { class: 'rl-btns' }, acts));
    pop.hidden = false;
    var x = clamp((hh.x || 20) + 14, 6, Math.max(6, R.w - pop.offsetWidth - 6)), y = clamp((hh.y || 20) - 20, 6, Math.max(6, R.h - pop.offsetHeight - 6));
    pop.style.left = x + 'px'; pop.style.top = y + 'px'; DIRTY.stage = true;
    closeB.focus({ preventScroll: true });
  }
  function togglePriority(room) {
    var cur = (LAB.snap && LAB.snap.robot ? LAB.snap.robot.priority : []).slice(), i = cur.indexOf(room);
    if (i >= 0) cur.splice(i, 1); else cur.push(room);
    doPriority(cur); paintAll();
  }
  function toggleDoor(nodeId) {
    var locked = !!(LAB.sim.rb.obst[nodeId] && LAB.sim.rb.obst[nodeId].locked);
    doObstacle(nodeId, !locked); paintAll();
  }

  /* ====================================================================================
   * 9. CONTROL PANELS (left column / the phone's Controls tab)
   * ==================================================================================== */
  var PHASE_L = { idle: T('هادئ', 'Quiet'), suspect: T('اشتباه (مفتاح واحد)', 'Suspect (one key)'), confirmed: T('مؤكَّد (مفتاحان)', 'Confirmed (two keys)'), public: T('أُرسل الإنذار العام', 'Public alert sent') };
  var STEPS = [
    { id: 'verify', ar: 'مفتاحان مستقلان يتفقان: الحريق مؤكَّد', en: 'Two independent keys agree: fire confirmed' },
    { id: 'request', ar: 'طُلب نشر الروبوت', en: 'Robot deployment requested' },
    { id: 'approve', ar: 'قائد الحادث يعتمد (المفتاح البشري)', en: 'The incident commander approves (the human key)' },
    { id: 'enter', ar: 'الروبوت يدخل ويبحث', en: 'The robot goes in and searches' },
    { id: 'find', ar: 'يعثر على أول شخص ويُبلّغ', en: 'It finds the first person and reports' },
    { id: 'hero', ar: 'يعثر على أبو سالم (مستخدم الكرسي المتحرك)', en: 'It finds Abu Salem (the wheelchair user)' }
  ];
  function stepDone(id) {
    var snap = LAB.snap, r = selRobot(), rs = robotsOf(); if (!snap) return false;
    var any = function (fn) { return rs.some(fn); };
    switch (id) {
      case 'verify': return snap.verification.phase === 'confirmed' || snap.verification.phase === 'public';
      case 'request': return any(function (x) { return x.approval.status !== 'none'; });
      case 'approve': return any(function (x) { return x.approval.status === 'approved'; });
      case 'enter': return any(function (x) { return ['searching', 'guiding', 'holding', 'returning'].indexOf(x.state) >= 0 || x.stats.distanceM > 0; });
      case 'find': return snap.robot && snap.robot.finds.length > 0;
      case 'hero': return snap.robot && snap.robot.finds.some(function (f) { return f.key === 'abu-salem'; });
    }
    return false;
  }
  function buildScenario() {
    var sel = h('select', { class: 'input', id: 'rl-preset' }); UI.preset = sel;
    sel.addEventListener('change', function () { LAB.presetId = sel.value; Manara.store('manara-robot-preset', sel.value); restart(); });
    var seed = h('input', { type: 'number', class: 'input', id: 'rl-seed', min: '1', max: '9999', step: '1', value: String(LAB.seed), inputmode: 'numeric' }); UI.seed = seed;
    seed.addEventListener('change', function () { var v = clamp(Math.round(+seed.value || 1), 1, 9999); seed.value = String(v); LAB.seed = v; restart(); });
    var pre = h('input', { type: 'checkbox', id: 'rl-preroll' }); pre.checked = LAB.preroll; UI.preroll = pre;
    pre.addEventListener('change', function () { LAB.preroll = pre.checked; restart(); });
    UI.blurb = h('p', { class: 'rl-blurb small' });
    UI.steps = h('ol', { class: 'rl-steps' }); STEPS.forEach(function (s) { UI.steps.appendChild(h('li', { 'data-id': s.id }, h('span', { class: 'rl-sdot num' }), bi(s.ar, s.en))); });
    var d = details('scenario', 'السيناريو والقصة', 'Scenario & story', true, [
      field('السيناريو', 'Scenario', sel), UI.blurb,
      h('div', { class: 'rl-row2' }, field('البذرة', 'Seed', seed), h('label', { class: 'rl-chk rl-pre' }, pre, bi('ابدأ بعد الاشتعال بـ 8 ث', 'Start 8 s after ignition'))),
      h('div', { class: 'rl-btns' }, btn('btn btn-primary btn-sm', 'play', 'شاهد القصة', 'Watch the story', function () { startStory(); }), btn('btn btn-ghost btn-sm', 'reset', 'إعادة التشغيل', 'Reset the run', function () { restart(); })),
      UI.steps]);
    return d;
  }
  function fillPresetOptions() {
    var sel = UI.preset; if (!sel) return; var cur = LAB.presetId; sel.textContent = '';
    SCENARIOS.forEach(function (id) { if (Sim.PRESETS[id]) sel.appendChild(h('option', { value: id, text: presetName(id) })); });
    sel.value = cur;
  }

  function buildKeyPanel() {
    UI.role = seg('الدور (محاكاة)', 'Role (simulated)', ROLES.map(function (r) { return { id: r, ar: ROLE_NAME[r].ar, en: ROLE_NAME[r].en }; }), function (id) { doRole(id); paintAll(); }, 'rl-roles');
    UI.roleHelp = h('p', { class: 'rl-rolehelp small' });
    UI.bReq = btn('btn btn-ghost btn-sm', 'robot', 'طلب نشر الروبوت', 'Request deployment', function () { doDeploy(); paintAll(); }, { id: 'rl-req' });
    UI.bApprove = btn('btn btn-primary btn-sm', 'check', 'اعتماد (قائد الحادث)', 'Approve (incident commander)', function () { doApprove(); paintAll(); }, { id: 'rl-approve' });
    UI.bDecline = btn('btn btn-ghost btn-sm', 'x', 'رفض', 'Decline', function () { doReject(); paintAll(); }, { id: 'rl-decline' });
    UI.bRecall = btn('btn btn-ghost btn-sm', 'undo', 'استدعاء', 'Recall', function () { doRecall(); paintAll(); }, { id: 'rl-recall' });
    UI.msgOk = h('p', { class: 'rl-msg ok', role: 'status', hidden: true }); UI.msgBad = h('p', { class: 'rl-msg bad', role: 'alert', hidden: true });
    UI.msg = h('div', { class: 'rl-msgbox' }, UI.msgOk, UI.msgBad);
    UI.fleet = h('div', { class: 'rl-fleet', role: 'group' }); lab(UI.fleet, 'aria-label', 'وحدات الروبوت', 'Robot units');
    UI.keyNote = h('p', { class: 'small muted' }, bi('الأدوار محاكاة وليست دخولاً حقيقياً: المشغّل يطلب نشر الروبوت، وقائد الحادث وحده يعتمده. لا يتحرك الروبوت قبل الاعتماد.', 'Roles are simulated, not a real login: an operator requests the robot, only the incident commander approves it. The robot does not move before approval.'));
    return details('key', 'المفتاح البشري — من يفعل ماذا', 'The human key — who may do what', true, [
      UI.role, UI.roleHelp, UI.fleet,
      h('div', { class: 'rl-btns' }, UI.bReq, UI.bApprove), h('div', { class: 'rl-btns' }, UI.bDecline, UI.bRecall), UI.msg, UI.keyNote]);
  }
  function paintMsg() {
    var m = LAB.msg;
    if (!m) { UI.msgOk.hidden = true; UI.msgBad.hidden = true; return; }
    if (m.ok) { UI.msgBad.hidden = true; UI.msgBad.textContent = ''; UI.msgOk.hidden = false; setText(UI.msgOk, LL(m.text)); }
    else {
      UI.msgOk.hidden = true;
      var txt = LL(m.text) + (m.code === 'role' ? ' — ' + B('بدّل الدور إلى «قائد الحادث» ثم أعد المحاولة.', 'switch the role to "Incident commander" and try again.') : '');
      if (UI.msgBad.textContent !== txt) { UI.msgBad.hidden = false; UI.msgBad.textContent = txt; }
    }
  }
  function paintKey() {
    var snap = LAB.snap, rs = robotsOf(), sim = LAB.sim; if (!snap) return;
    UI.role.setValue(LAB.role);
    var help = { viewer: T('كمشاهد تستطيع المراقبة فقط: لا تطلب ولا تعتمد.', 'As a viewer you can only watch: you cannot request or approve.'), operator: T('كمشغّل تستطيع طلب النشر والتشغيل، لكن الاعتماد لقائد الحادث وحده.', 'As an operator you can request and operate, but only the incident commander can approve.'), commander: T('كقائد للحادث تستطيع اعتماد النشر. «يساعد، ورجال الإطفاء هم من يقرّر».', 'As incident commander you can approve the deployment. "It assists; firefighters decide."') }[LAB.role];
    setText(UI.roleHelp, LL(help));
    var waiting = rs.filter(function (r) { return r.state === 'stowed'; }), anyReq = waiting.some(function (r) { return r.approval.status === 'requested'; }), allNone = waiting.length && waiting.every(function (r) { return r.approval.status === 'none'; });
    UI.bReq.disabled = !waiting.length || !allNone || sim.done;
    UI.bApprove.disabled = !waiting.length || sim.done;
    UI.bDecline.disabled = !anyReq || sim.done;
    UI.bRecall.disabled = !rs.some(function (r) { return ['approved', 'deploying', 'searching', 'guiding', 'holding'].indexOf(r.state) >= 0; }) || sim.done;
    // fleet rows
    var sig = rs.map(function (r) { return r.id + r.state + r.approval.status + pct(r.battery) + (LAB.sel === r.id ? 's' : '') + lang(); }).join('|');
    if (UI.fleet._sig !== sig) {
      UI.fleet._sig = sig; UI.fleet.textContent = '';
      rs.forEach(function (r) {
        var b = h('button', { type: 'button', class: 'rl-robot' + (LAB.sel === r.id ? ' on' : ''), 'aria-pressed': LAB.sel === r.id ? 'true' : 'false', 'data-id': r.id },
          h('span', { class: 'rl-rn' }, icon('robot'), h('b', { text: LL(r.name) })), pill(stateName(r.state), ROBOT_STATE[r.state]),
          h('span', { class: 'rl-ra small muted', text: approvalText(r) + ' · ' + B('بطارية ', 'battery ') + N(pct(r.battery)) + '%' }));
        b.addEventListener('click', function () { LAB.sel = r.id; DIRTY.eye = DIRTY.ui = true; paintAll(); });
        UI.fleet.appendChild(b);
      });
    }
  }
  function approvalText(r) {
    var a = r.approval.status;
    if (a === 'approved') return B('اعتمده قائد الحادث', 'approved by the commander');
    if (a === 'requested') return B('بانتظار الاعتماد', 'waiting for approval');
    if (a === 'rejected') return B('رُفض النشر', 'declined');
    return B('لم يُطلب بعد', 'not requested yet');
  }

  function buildConfig() {
    UI.variant = seg('نوع الروبوت', 'Robot variant', [{ id: 'tracked', ar: 'جنزير', en: 'Tracked', icon: 'robot', title: ['بجنزير: يصعد الدرج بحدود', 'Tracked: climbs stairs, within limits'] }, { id: 'wheeled', ar: 'عجلات', en: 'Wheeled', icon: 'robot', title: ['بعجلات: لا يصعد الدرج', 'Wheeled: cannot climb stairs'] }], function (id) { LAB.variant = id; restart(); });
    UI.units = seg('عدد الوحدات', 'Number of units', [1, 2, 3].map(function (n) { return { id: n, text: String(n) }; }), function (id) { LAB.units = +id; restart(); });
    UI.carrier = seg('من يحمل الروبوت', 'Who brings the robot', [{ id: 0, ar: 'موضوع مسبقاً', en: 'Pre-positioned' }, { id: 1, ar: 'تحمله مركبة الإطفاء', en: 'Carried by the fire engine' }], function (id) { setParamUI('robotCarrier', +id); UI.carrier.setValue(+id); });
    return details('config', 'إعداد الروبوت', 'Robot setup', false, [
      h('div', { class: 'rl-sub' }, h('b', null, bi('النوع', 'Variant')), UI.variant), h('div', { class: 'rl-sub' }, h('b', null, bi('الوحدات (1–3)', 'Units (1–3)')), UI.units), h('div', { class: 'rl-sub' }, h('b', null, bi('التوصيل', 'Delivery')), UI.carrier),
      h('p', { class: 'small muted' }, bi('النوع والعدد يعيدان التشغيل بالبذرة نفسها. التوصيل بمركبة الإطفاء يؤخّر الروبوت حتى وصولها (افتراض).', 'Variant and units restart the run with the same seed. Delivery by the fire engine delays the robot until it arrives (an assumption).'))]);
  }

  function buildPriority() {
    UI.prioList = h('ol', { class: 'rl-prio' }); UI.prioSel = h('select', { class: 'input', id: 'rl-prio-sel' }); roomOptions(UI.prioSel, false);
    var addB = btn('btn btn-ghost btn-sm', 'list', 'أضف', 'Add', function () { var v = UI.prioSel.value; if (v) togglePrioAdd(v); });
    UI.prioNext = h('ol', { class: 'rl-next' });
    return details('prio', 'أولوية البحث', 'Search priority', false, [
      h('p', { class: 'small muted' }, bi('قائمتك تتقدم على الترتيب التلقائي (غير المحصيّين ومن لديهم احتياجات أولاً). انقر الغرف على الخريطة بأداة «أولوية» أو أضفها هنا.', 'Your list goes ahead of the automatic order (unaccounted people and people with needs first). Click rooms on the map with the "Priority" tool, or add them here.')),
      UI.prioList, h('div', { class: 'rl-row2' }, field('غرفة', 'Room', UI.prioSel), addB),
      h('div', { class: 'rl-btns' }, btn('btn btn-ghost btn-sm', 'reset', 'الترتيب التلقائي', 'Automatic order', function () { doPriority([]); paintAll(); })),
      h('b', { class: 'rl-subt' }, bi('الغرف التالية عند الروبوت', 'Next rooms for the robot')), UI.prioNext]);
  }
  function togglePrioAdd(room) { var cur = (LAB.snap && LAB.snap.robot ? LAB.snap.robot.priority : []).slice(); if (cur.indexOf(room) < 0) cur.push(room); doPriority(cur); paintAll(); }
  function paintPriority() {
    var snap = LAB.snap, sim = LAB.sim; if (!snap || !snap.robot) return;
    var pr = snap.robot.priority, sig = pr.join(',') + lang();
    if (UI.prioList._sig !== sig) {
      UI.prioList._sig = sig; UI.prioList.textContent = '';
      if (!pr.length) UI.prioList.appendChild(h('li', { class: 'muted small' }, bi('لا قائمة: الترتيب تلقائي.', 'No list: the order is automatic.')));
      pr.forEach(function (rm, i) {
        var x = h('button', { type: 'button', class: 'rl-x', 'aria-label': B('أزل غرفة ' + rm + ' من القائمة', 'Remove room ' + rm + ' from the list'), onclick: function () { var c = pr.slice(); c.splice(i, 1); doPriority(c); paintAll(); } }, icon('x'));
        UI.prioList.appendChild(h('li', { class: 'rl-chip2' }, h('span', { class: 'num rl-n', text: String(i + 1) }), h('b', { class: 'num', text: rm }), x));
      });
    }
    if (sim.t - (UI.prioNext._t === undefined ? -9 : UI.prioNext._t) >= 3 || UI.prioNext._lang !== lang()) {
      UI.prioNext._t = sim.t; UI.prioNext._lang = lang(); UI.prioNext.textContent = '';
      var nx = []; try { nx = Sim.robot.priority(sim, LAB.sel) || []; } catch (e) { nx = []; }
      nx.slice(0, 5).forEach(function (q) {
        var why = []; if (q.needs) why.push(B('احتياج ', 'needs ') + N(q.needs)); if (q.unaccounted) why.push(N(q.unaccounted) + B(' غير محصيّ', ' unaccounted')); why.push(B('الطابق ', 'floor ') + N(q.floor));
        UI.prioNext.appendChild(h('li', null, h('b', { class: 'num', text: q.room }), h('span', { class: 'small muted', text: ' · ' + why.join(' · ') })));
      });
      if (!nx.length) UI.prioNext.appendChild(h('li', { class: 'small muted' }, bi('لا غرف متبقية.', 'No rooms left.')));
    }
  }

  function buildGoto() {
    UI.gotoSel = h('select', { class: 'input', id: 'rl-goto-sel' }); roomOptions(UI.gotoSel, true);
    UI.gotoBtn = btn('btn btn-primary btn-sm', 'target', 'اذهب', 'Go', function () { var v = UI.gotoSel.value; if (v) { doGoto(v); paintAll(); } });
    return details('goto', 'اذهب إلى غرفة', 'Go to a room', false, [
      h('p', { class: 'small muted' }, bi('أمر لمرة واحدة (يحتاج اتصالاً، ويُرفض إن كان الهدف لا يمكن بلوغه: درج للروبوت ذي العجلات، نار، حرارة أو عائق).', 'A one-shot command (needs the link; refused if the target cannot be reached: stairs for a wheeled robot, fire, heat or an obstacle).')),
      h('div', { class: 'rl-row2' }, field('الوجهة', 'Destination', UI.gotoSel), UI.gotoBtn)]);
  }

  function buildDoors() {
    UI.doorSel = h('select', { class: 'input', id: 'rl-door-sel' }); roomOptions(UI.doorSel, false, true);
    UI.doorList = h('ul', { class: 'rl-locked' });
    return details('doors', 'الأبواب والعوائق', 'Doors & obstacles', false, [
      h('p', { class: 'small muted' }, bi('الروبوت يفتح الباب غير المقفل ولا يكسر المقفل أبداً: يُبلّغ عنه ويُعلّمه مسدوداً ويبحث عن غيره.', 'The robot opens an unlocked door and never forces a locked one: it reports it, marks it blocked and goes elsewhere.')),
      h('div', { class: 'rl-row2' }, field('الباب', 'Door', UI.doorSel), h('div', { class: 'rl-btns' }, btn('btn btn-ghost btn-sm', 'lock', 'اقفل', 'Lock', function () { var v = UI.doorSel.value; if (v) { doObstacle(v, true); paintAll(); } }), btn('btn btn-ghost btn-sm', 'unlock', 'افتح', 'Unlock', function () { var v = UI.doorSel.value; if (v) { doObstacle(v, false); paintAll(); } }))),
      h('b', { class: 'rl-subt' }, bi('المقفل الآن', 'Locked now')), UI.doorList]);
  }
  function paintDoors() {
    var sim = LAB.sim, obst = sim.rb && sim.rb.obst ? sim.rb.obst : {}, ids = Object.keys(obst).filter(function (k) { return obst[k].locked; }).sort(), sig = ids.join(',') + lang();
    if (UI.doorList._sig === sig) return; UI.doorList._sig = sig; UI.doorList.textContent = '';
    if (!ids.length) UI.doorList.appendChild(h('li', { class: 'small muted' }, bi('لا باب مقفل.', 'No locked door.')));
    ids.forEach(function (id) {
      var n = LAB.g.nodes[LAB.g.byId[id]], name = n && n.room ? B('غرفة ', 'Room ') + n.room : id;
      UI.doorList.appendChild(h('li', { class: 'rl-chip2' }, icon('lock'), h('b', { text: name }), obst[id].scenario ? h('span', { class: 'small muted', text: B('(من السيناريو)', '(from the scenario)') }) : null,
        h('button', { type: 'button', class: 'rl-x', 'aria-label': B('افتح ' + name, 'Unlock ' + name), onclick: function () { doObstacle(id, false); paintAll(); } }, icon('unlock'))));
    });
  }

  /* ---- speak through the robot ---- */
  function buildSpeak() {
    UI.langSel = h('select', { class: 'input', id: 'rl-lang' });
    LANGS.forEach(function (l) { UI.langSel.appendChild(h('option', { value: l.id, text: l.name + ' — ' + l.en + (DRAFT_LANG[l.id] ? ' · ' + B('مسودة', 'draft') : '') })); });
    UI.langSel.value = Manara.store('manara-robot-sayl') || 'ar'; if (!UI.langSel.value) UI.langSel.value = 'ar';
    UI.langSel.addEventListener('change', function () { Manara.store('manara-robot-sayl', UI.langSel.value); paintLangNote(); });
    UI.langNote = h('p', { class: 'rl-draftnote small', 'aria-live': 'polite' });
    var grid = h('div', { class: 'rl-saygrid' });
    SAY_KEYS.forEach(function (k) { var b = btn('btn btn-ghost btn-sm rl-say', 'speaker', k[1].ar, k[1].en, function () { doSpeak(k[0], UI.langSel.value); paintAll(); }, { 'data-key': k[0] }); grid.appendChild(b); });
    UI.speech = h('div', { class: 'rl-speech', 'aria-live': 'polite' });
    // the friendly light + the opt-in strobe
    UI.light = h('span', { class: 'rl-light', 'aria-hidden': 'true' });
    var cb = h('input', { type: 'checkbox', id: 'rl-strobe' }); UI.strobe = cb;
    cb.addEventListener('change', function () { setStrobe(cb.checked); });
    var warn = MSG && MSG.flash && MSG.flash('strobe-optin') ? MSG.flash('strobe-optin').warning : null;
    UI.strobeWarn = h('p', { class: 'rl-warn small' }, icon('alert'), h('span', null, bi((warn && warn.ar) || 'تحذير: قد يسبب الضوء الوامض نوبات لدى الحساسين للضوء. لا يومض أكثر من 3 مرات في الثانية، ولا يعمل إذا كان جهازك مضبوطاً على تقليل الحركة.', 'Warning: flashing light can trigger seizures in people who are sensitive to light. It never flashes more than 3 times a second, and it stays off if your device is set to reduce motion.')));
    if ((warn && warn.en)) { var sp = UI.strobeWarn.querySelector('[data-l=en]'); if (sp) sp.textContent = warn.en; }
    UI.strobeNote = h('p', { class: 'small muted', 'aria-live': 'polite' });
    return details('speak', 'تكلّم عبر الروبوت', 'Speak through the robot', false, [
      h('p', { class: 'small muted' }, bi('اختر لغة ثم عبارة: الروبوت يكلّم أقرب شخص في مداه بالصيغة المناسبة له (صوت، ضوء، شاشة، رموز). عبارات الحد الأدنى فقط تتوفر بلغات المجتمعات الأخرى وهي مسودات.', 'Pick a language, then a phrase: the robot speaks to the nearest person in range in the format that suits them (voice, light, screen, pictograms). Only the short core phrases exist in the other communities\' languages, and they are drafts.')),
      field('لغة الكلام', 'Language to speak', UI.langSel), UI.langNote, grid, UI.speech,
      h('div', { class: 'rl-lightrow' }, UI.light, h('span', { class: 'small' }, bi('الضوء الودّي: أخضر ثابت ووميضان أبيضان كل ثانيتين', 'Friendly light: steady green, two white flashes every 2 s'))),
      h('label', { class: 'rl-chk' }, cb, bi('وميض قوي للصمّ (اختياري)', 'Strobe for Deaf residents (opt-in)')), UI.strobeWarn, UI.strobeNote]);
  }
  function paintLangNote() {
    var l = LANGS.filter(function (x) { return x.id === UI.langSel.value; })[0], draft = !!DRAFT_LANG[UI.langSel.value];
    setText(UI.langNote, draft ? LL(DRAFT_NOTICE) + B(' — لكل عبارة مرادف عربي وإنجليزي بجانبها.', ' — each phrase also shows its Arabic and English meaning.') : '');
    UI.langNote.hidden = !draft;
  }
  var strobeT = 0, strobeOff = 0, lightT = 0;
  function setStrobe(on) {
    clearInterval(strobeT); clearTimeout(strobeOff); UI.light.classList.remove('strobe-on');
    if (RM.matches) { UI.strobe.checked = false; setText(UI.strobeNote, B('معطّل: جهازك مضبوط على تقليل الحركة، فلا وميض أبداً.', 'Off: your device is set to reduce motion, so nothing ever flashes.')); return; }
    if (!on) { setText(UI.strobeNote, ''); return; }
    var phase = 0; setText(UI.strobeNote, B('الوميض يعمل 2.5 مرة في الثانية لمدة 6 ثوانٍ ثم يتوقف تلقائياً.', 'The strobe runs at 2.5 flashes per second for 6 seconds, then stops by itself.'));
    strobeT = setInterval(function () { phase ^= 1; UI.light.classList.toggle('strobe-on', !!phase); }, 200);   // 150–250 ms on/off ≈ 2.5 Hz (≤ 3 Hz)
    strobeOff = setTimeout(function () { UI.strobe.checked = false; setStrobe(false); }, 6000);
  }
  function startLightSignature() {   // steady green, two short white flashes every 2 s (not under reduced motion)
    clearInterval(lightT); UI.light.classList.remove('flash'); if (RM.matches) return;
    var t = 0; lightT = setInterval(function () { t = (t + 100) % 2000; UI.light.classList.toggle('flash', (t >= 1000 && t < 1100) || (t >= 1300 && t < 1400)); }, 100);
  }
  function lastSpeechLine() {
    var sim = LAB.sim; if (sim && sim.rb && sim.rb.speech && sim.rb.speech.length) return sim.rb.speech[sim.rb.speech.length - 1];
    var sp = LAB.snap && LAB.snap.robot ? LAB.snap.robot.speech : null; return sp && sp.length ? sp[sp.length - 1] : null;
  }
  var speechSig = '';
  function paintSpeech() {
    var line = lastSpeechLine(), snap = LAB.snap, sig = line ? line.id + lang() : 'none' + lang();
    if (sig === speechSig) return; speechSig = sig; var box = UI.speech; box.textContent = '';
    if (!line) { box.appendChild(h('p', { class: 'small muted' }, bi('لم يتكلم الروبوت بعد.', 'The robot has not spoken yet.'))); return; }
    var L = LANGS.filter(function (x) { return x.id === line.lang; })[0] || { id: line.lang, name: line.lang, en: line.lang, dir: 'ltr' };
    var person = line.person ? snap.people.filter(function (p) { return p.key === line.person; })[0] : null, who = person ? (person.hero ? LL(HERO_NAME[person.hero]) : (person.name ? LL(person.name) : B('مقيم', 'a resident'))) : B('لا أحد بقربه', 'no one nearby');
    var head = h('div', { class: 'rl-sp-h' }, h('b', { text: line.robot + ' → ' + who }), h('span', { class: 'small muted num', text: 'T+' + mmss(line.t) }));
    var tags = h('div', { class: 'rl-tags' }, tag('cool', L.name));
    if (line.operator) tags.appendChild(tag('info', B('بأمر المشغّل', 'operator')));
    if (line.draft || DRAFT_LANG[line.lang]) tags.appendChild(tag('warn', LL(DRAFT_NOTICE)));
    if (line.requestedLang && line.requestedLang !== line.lang) tags.appendChild(tag('warn', B('رجع إلى ' + L.name + ' (لا عبارة بلغته)', 'fell back to ' + L.en + ' (no phrase in the requested language)')));
    var spoken = line.spoken || (line.text && (line.text[line.lang] || line.text.en)) || '';
    var q = h('blockquote', { class: 'rl-spoken', lang: line.lang, dir: L.dir }, h('p', { text: spoken }));
    box.appendChild(head); box.appendChild(tags); box.appendChild(q);
    if (line.text && (line.lang !== 'ar' && line.lang !== 'en')) box.appendChild(h('p', { class: 'small muted' }, h('b', { text: B('بالعربية: ', 'In Arabic: ') }), h('span', { text: line.text.ar }), h('br'), h('b', { text: B('بالإنجليزية: ', 'In English: ') }), h('span', { text: line.text.en })));
    var fm = h('div', { class: 'rl-tags' }); (line.formats || []).forEach(function (f) { fm.appendChild(tag('', ({ voice: B('صوت', 'voice'), light: B('ضوء', 'light'), display: B('شاشة', 'screen'), pictogram: B('رموز', 'pictograms'), strobe: B('وميض (اختياري)', 'strobe (opt-in)'), sound: B('صوت عالٍ', 'sound') })[f] || f)); }); box.appendChild(fm);
    if (line.refuge) box.appendChild(h('p', { class: 'small' }, B('يوجّه إلى شرفة اللجوء — لا درج لمستخدم الكرسي المتحرك.', 'Points to the refuge balcony — no stairs for a wheelchair user.')));
    if ('speechSynthesis' in window && (line.lang === 'ar' || line.lang === 'en') && spoken) {
      box.appendChild(btn('btn btn-ghost btn-sm', 'speaker', 'استمع (صوت المتصفح)', 'Listen (browser voice)', function () { try { var u = new SpeechSynthesisUtterance(spoken); u.lang = line.lang === 'ar' ? 'ar-QA' : 'en-GB'; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice available */ } }));
    }
  }

  function buildControls() {
    UI.gControls = h('div', { class: 'rl-group rl-controls' }, buildScenario(), buildKeyPanel(), buildConfig(), buildPriority(), buildGoto(), buildSpeak(), buildDoors());
    return UI.gControls;
  }

  /* ====================================================================================
   * 10. THE ROBOT-EYE PANEL, FINDS, HEADCOUNT, HAND-OFF CARD, EVENT LOG, LEGEND
   * ==================================================================================== */
  function stat(id, ar, en, extra) {
    var dd = h('dd'), el = h('div', { class: 'rl-stat', 'data-k': id }, h('dt', null, bi(ar, en)), dd);
    if (extra === 'bar') { var bar = h('span', { class: 'rl-bar' }, h('i')); el.appendChild(bar); el.bar = bar.firstChild; }
    el.dd = dd; UI.stat[id] = el; return el;
  }
  function buildEye() {
    UI.stat = {};
    EYE.cvs = h('canvas', { id: 'rl-eyecv', role: 'img' }); lab(EYE.cvs, 'aria-label', 'منظر عين الروبوت', 'Robot-eye view');
    UI.eyeMode = seg('نمط الكاميرا', 'Camera mode', [{ id: 'rgb', ar: 'عادية', en: 'Visible', icon: 'camera' }, { id: 'thermal', ar: 'حرارية', en: 'Thermal', icon: 'thermo' }], function (id) { LAB.eye = id; UI.eyeMode.setValue(id); Manara.store('manara-robot-eye', id); DIRTY.eye = true; paintEyeNow(); });
    UI.eyeSel = h('select', { class: 'input rl-eyesel', id: 'rl-eyesel' }); lab(UI.eyeSel, 'aria-label', 'اختر الروبوت', 'Choose the robot');
    UI.eyeSel.addEventListener('change', function () { LAB.sel = UI.eyeSel.value; DIRTY.eye = DIRTY.ui = true; paintAll(); });
    var head = h('div', { class: 'rl-eyehead' }, UI.eyeMode, UI.eyeSel);
    var hud = h('dl', { class: 'rl-hudgrid' },
      stat('state', 'الحالة', 'State'), stat('target', 'الهدف', 'Target'), stat('variant', 'النوع', 'Variant'), stat('speed', 'السرعة', 'Speed'),
      stat('battery', 'البطارية', 'Battery', 'bar'), stat('temp', 'الحرارة', 'Temperature'), stat('co', 'أول أكسيد الكربون', 'CO'), stat('link', 'الاتصال', 'Link'),
      stat('vis', 'الرؤية (6 م)', 'Visibility (6 m)'), stat('contrast', 'التباين الحراري', 'Thermal contrast'));
    var el = pnl('eye', 'عين الروبوت', 'Robot eye', h('span', { class: 'tag warn sim-tag', translate: 'no', text: 'SIM' }));
    el.body.appendChild(head); el.body.appendChild(h('div', { class: 'rl-eyewrap' }, EYE.cvs));
    el.body.appendChild(h('p', { class: 'rl-eyecap small muted' }, bi('عرض تخطيطي مولَّد من بيانات الرؤية في المحاكاة (ضباب الدخان، التباين الحراري، الأشخاص) — ليس بثاً حقيقياً من كاميرا.', 'A schematic render of the simulation\'s view data (smoke fog, thermal contrast, people) — not a real camera feed.')));
    el.body.appendChild(hud);
    el.body.appendChild(h('p', { class: 'rl-eyecap small muted' }, bi('الكشف بقواعد بسيطة (تباين حراري وصوت وكاميرا) وليس ذكاءً اصطناعياً: قد يفوته شخص، وقد يظن جسماً ساخناً شخصاً.', 'Detection is rule-based (thermal contrast, sound, camera), not "AI": it can miss a person, and it can mistake a hot object for one.')));
    UI.gEye = el; return el;
  }
  function paintEyeNow() { var ctxOk = EYE.ctx; if (ctxOk) { drawEye(); if (EYE.cvs) setAttr(EYE.cvs, 'aria-label', EYE.summary || B('منظر عين الروبوت', 'Robot-eye view')); } }
  function paintEyeHud() {
    var r = selRobot(), sim = LAB.sim, v = r && r.view, S = UI.stat; if (!S.state) return;
    var rs = robotsOf(); UI.eyeSel.hidden = rs.length < 2;
    if (rs.length >= 2) { var sg = rs.map(function (x) { return x.id; }).join(); if (UI.eyeSel._sig !== sg) { UI.eyeSel._sig = sg; UI.eyeSel.textContent = ''; rs.forEach(function (x) { UI.eyeSel.appendChild(h('option', { value: x.id, text: LL(x.name) })); }); } UI.eyeSel.value = LAB.sel; }
    UI.eyeMode.setValue(LAB.eye);
    if (!r) { Object.keys(S).forEach(function (k) { setText(S[k].dd, '—'); }); return; }
    var tok = ROBOT_STATE[r.state] || '--accent';
    S.state.dd.textContent = ''; S.state.dd.appendChild(pill(stateName(r.state), tok));
    setText(S.target.dd, r.hold ? B('مع ', 'with ') + holdName(r) : r.target ? LL(r.target.label) : '—');
    setText(S.variant.dd, r.variant === 'tracked' ? B('جنزير', 'tracked') : B('عجلات', 'wheeled'));
    var pz = LAB.pose[r.id], sp = pz && LAB.playing !== undefined ? pz.speed : 0; setText(S.speed.dd, N(r.state === 'stowed' || r.state === 'fault' || r.hold ? 0 : sp, 1) + ' ' + B('م/ث', 'm/s'));
    setText(S.battery.dd, N(pct(r.battery)) + '%'); S.battery.bar.style.width = pct(r.battery) + '%'; S.battery.bar.parentNode.classList.toggle('low', r.battery < 0.3);
    setText(S.temp.dd, v ? N(v.tempC) + ' °C' + (r.heat > 0 ? ' · ' + B('تسخين ', 'heat-soak ') + N(r.heat) + B(' ث', ' s') : '') : N(r.tempC) + ' °C');
    setText(S.co.dd, v && v.gasPpm !== null && v.gasPpm !== undefined ? N(v.gasPpm) + ' ppm' : B('غير متاح في سيناريو الحريق', 'N/A in a fire scenario'));
    setText(S.link.dd, !r.link.up ? B('مقطوع', 'DOWN') + (r.link.buffered ? ' · ' + N(r.link.buffered) + B(' تقرير محفوظ', ' buffered') : '') : N(pct(r.link.q)) + '%');
    S.link.classList.toggle('bad', !r.link.up);
    setText(S.vis.dd, v ? B('عادية ', 'visible ') + N(pct(v.visibility)) + '% · ' + B('حرارية ', 'thermal ') + N(pct(v.thermalVisibility)) + '%' : '—');
    var contrast = v ? clamp((34 - v.tempC) / Math.max(0.1, sim.P.robotContrastC), 0, 1) : null;
    setText(S.contrast.dd, contrast === null ? '—' : N(pct(contrast)) + '%'); S.contrast.classList.toggle('bad', contrast !== null && contrast < 0.25);
  }
  function holdName(r) {
    var p = LAB.snap.people.filter(function (q) { return q.key === (r.hold && r.hold.person); })[0];
    return p ? (p.hero ? LL(HERO_NAME[p.hero]) : (p.name ? LL(p.name) : B('شخص', 'a person'))) : B('شخص', 'a person');
  }

  /* ---- finds ---- */
  function buildFinds() {
    UI.findsList = h('ol', { class: 'rl-finds' }); UI.findsSum = h('p', { class: 'rl-findsum small' });
    UI.blockedList = h('ul', { class: 'rl-blocked' });
    var el = pnl('finds', 'ما عثر عليه الروبوت', 'What the robot found', h('span', { class: 'tag cool num rl-fcount', text: '0' }));
    UI.findsCount = $('.rl-fcount', el);
    el.body.appendChild(UI.findsSum); el.body.appendChild(UI.findsList);
    el.body.appendChild(h('b', { class: 'rl-subt' }, bi('أبلغ عنه كمسدود', 'Reported as blocked'))); el.body.appendChild(UI.blockedList);
    el.body.appendChild(h('p', { class: 'small muted' }, bi('«الحالة (تقدير)» تخمين بقواعد بسيطة من الحرارة والصوت والحركة — وليست تشخيصاً طبياً.', '"Condition (est.)" is a rule-based guess from heat, sound and movement — not a medical diagnosis.')));
    UI.gFinds = el; return el;
  }
  function findName(f) { return f.name ? LL(f.name) : f.registered ? B('مقيم مسجّل', 'Registered resident') : B('شخص غير مسجّل', 'Unregistered person'); }
  function paintFinds() {
    var snap = LAB.snap; if (!snap || !snap.robot) return;
    var fs = snap.robot.finds, bl = snap.robot.blocked, sig = fs.map(function (f) { return f.id + ':' + f.reportedAt + ':' + f.action + ':' + (f.condition && f.condition.key); }).join('|') + lang();
    var rs0 = robotsOf(), fp = rs0.reduce(function (s, r) { return s + r.stats.falsePositives; }, 0);
    setText(UI.findsCount, N(fs.length));
    setText(UI.findsSum, fs.length ? B('عثر الروبوت على ', 'The robot located ') + N(fs.length) + B(' — وأبلغ غرفة التحكم عن كل واحد. إنذارات كاذبة أُسقطت: ', ' — and told the control room about each. False alarms dismissed: ') + N(fp) + '.' : B('لا شيء بعد. الروبوت لا يتحرك قبل اعتماد قائد الحادث.', 'Nothing yet. The robot does not move before the incident commander approves.') + ' ' + B('إنذارات كاذبة: ', 'False alarms: ') + N(fp) + '.');
    if (UI.findsList._sig !== sig) {
      UI.findsList._sig = sig; UI.findsList.textContent = '';
      fs.slice().reverse().forEach(function (f) {
        var needs = (f.needs || []).map(function (n) { return tag(n === 'wheelchair' ? 'danger' : 'info', LL(NEED_L[n] || T(n, n))); });
        var li = h('li', { class: 'rl-find' + ((f.needs || []).indexOf('wheelchair') >= 0 ? ' hero' : ''), 'data-id': f.id },
          h('div', { class: 'rl-find-h' }, h('b', { text: findName(f) }), needs),
          h('div', { class: 'rl-find-m small' }, h('span', { text: LL(f.place) + (/floor|الطابق/i.test(LL(f.place)) ? '' : ' · ' + B('الطابق ', 'floor ') + N(f.floor)) }), h('span', { class: 'num', text: ' · T+' + mmss(f.t) + (f.reportedAt !== null && f.reportedAt - f.t > 2 ? ' → ' + B('أُبلغ ', 'reported ') + mmss(f.reportedAt) : '') }), h('span', { text: ' · ' + LL(BY_L[f.by] || T(f.by, f.by)) })),
          h('div', { class: 'rl-find-c small' }, h('span', { text: B('الحالة (تقدير): ', 'Condition (est.): ') }), h('b', { text: condName(f.condition && f.condition.key) }), h('span', { class: 'muted', text: ' · ' + findAction(f) })));
        UI.findsList.appendChild(li);
      });
      if (!fs.length) UI.findsList.appendChild(h('li', { class: 'muted small' }, bi('— لا عثور بعد —', '— no finds yet —')));
    }
    var bsig = bl.map(function (b) { return b.id; }).join() + lang();
    if (UI.blockedList._sig !== bsig) {
      UI.blockedList._sig = bsig; UI.blockedList.textContent = '';
      bl.slice().reverse().forEach(function (b) { UI.blockedList.appendChild(h('li', { class: 'small' }, h('span', { class: 'num muted', text: 'T+' + mmss(b.t) + ' ' }), h('span', { text: LL(b.text) }))); });
      if (!bl.length) UI.blockedList.appendChild(h('li', { class: 'muted small' }, bi('— لا شيء —', '— nothing —')));
    }
  }
  function findAction(f) {
    return ({ queued: B('ينتظر دوره', 'queued'), guide: B('أُرشد إلى المخرج', 'guided to the exit'), wake: B('محاولة إيقاظ', 'waking attempt'), stay: B('طُلب منه البقاء — المساعدة قادمة', 'asked to stay — help is coming'), refuge: B('إلى شرفة اللجوء', 'to the refuge balcony'), hold: B('الروبوت يبقى معه', 'the robot stays with them'), none: '' })[f.action] || '';
  }

  /* ---- headcount board: a SEPARATE 'located by robot' bucket ---- */
  var HC_ROWS = [['safe', '--safe', 'بأمان (في الموقع)', 'Safe (on site)'], ['safeAway', '--safe', 'بأمان (خارج الموقع)', 'Safe (away)'], ['help', '--danger', 'يحتاج مساعدة', 'Needs help'], ['located', '--accent', 'عُثر عليه بالروبوت', 'Located by robot'], ['unaccounted', '--muted', 'غير محسوب', 'Unaccounted']];
  function buildCount() {
    UI.hcBar = h('div', { class: 'rl-hcbar', role: 'img' }); UI.hcRows = h('ul', { class: 'rl-hcrows' });
    HC_ROWS.forEach(function (r) { var li = h('li', { 'data-k': r[0] }, h('span', { class: 'lg-dot', style: '--c:var(' + r[1] + ')' }), bi(r[2], r[3]), h('b', { class: 'num', text: '0' })); UI.hcRows.appendChild(li); });
    var el = pnl('count', 'لوحة العدّ', 'Headcount board', h('span', { class: 'tag num', id: 'rl-hc-reg', text: '0' }));
    el.body.appendChild(UI.hcBar); el.body.appendChild(UI.hcRows);
    el.body.appendChild(h('p', { class: 'small rl-hcnote' }, bi('«عُثر عليه بالروبوت» ليست «بأمان»: مكان الشخص معروف لكنه لم يخرج بعد. المسجّلون = بأمان + خارج الموقع + يحتاج مساعدة + عُثر عليه + غير محسوب.', '"Located by robot" is not "safe": we know where the person is, but they are not out yet. Registered = safe + away + needs help + located + unaccounted.')));
    UI.gCount = el; return el;
  }
  function paintCount() {
    var hc = LAB.hc; if (!hc) return;
    var total = hc.registered || 1, bar = UI.hcBar, sig = HC_ROWS.map(function (r) { return hc[r[0]] || 0; }).join(',') + lang();
    setText($('#rl-hc-reg'), N(hc.registered));
    if (bar._sig === sig) return; bar._sig = sig; bar.textContent = '';
    var desc = [];
    HC_ROWS.forEach(function (r) {
      var v = hc[r[0]] || 0; var seg2 = h('span', { class: 'rl-hcseg' }); seg2.style.width = (100 * v / total) + '%'; seg2.style.background = 'var(' + r[1] + ')'; if (v) bar.appendChild(seg2);
      var li = UI.hcRows.querySelector('[data-k="' + r[0] + '"] b'); if (li) li.textContent = N(v);
      desc.push(N(v) + ' ' + B(r[2], r[3]));
    });
    bar.setAttribute('aria-label', B('من ', 'Of ') + N(hc.registered) + B(' مسجّلاً: ', ' registered: ') + desc.join('، '));
  }

  /* ---- hand-off card ---- */
  function buildCard() {
    UI.cardBody = h('div', { class: 'rl-card-b' });
    UI.cardDl = btn('btn btn-ghost btn-sm', 'download', 'نزّل JSON', 'Download JSON', function () { downloadCard(); });
    UI.cardCopy = btn('btn btn-ghost btn-sm', 'copy', 'انسخ النص', 'Copy the text', function () { copyCard(); });
    var el = pnl('card', 'بطاقة التسليم للدفاع المدني', 'Hand-off card for Civil Defence', h('span', { class: 'tag warn', text: B('تمرين', 'EXERCISE') }));
    UI.cardTag = $('.tag', el.head);
    el.body.appendChild(UI.cardBody); el.body.appendChild(h('div', { class: 'rl-btns' }, UI.cardDl, UI.cardCopy));
    UI.gCard = el; return el;
  }
  function cardText(card) {
    var L = [];
    L.push(LL(card.status) + ' — ' + LL(card.incident) + ' — ' + card.clock);
    L.push(B('المسجّلون ', 'Registered ') + card.people.registered + B('، بأمان ', ', safe ') + card.people.safe + B('، يحتاج مساعدة ', ', needs help ') + card.people.help + (card.people.located !== undefined ? B('، عُثر عليهم بالروبوت ', ', located by robot ') + card.people.located : '') + B('، غير محسوبين ', ', unaccounted ') + card.people.unaccounted);
    (card.locatedByRobot || []).forEach(function (p) { L.push('• ' + (p.name ? LL(p.name) : B('مقيم', 'resident')) + ' — ' + B('غرفة ', 'room ') + (p.room || '?') + ' — ' + (p.needs && p.needs.length ? p.needs.map(function (n) { return LL(NEED_L[n] || T(n, n)); }).join('، ') + ' — ' : '') + condName(p.condition) + B(' (تقدير)', ' (est.)') + (p.foundAt !== null ? ' — T+' + mmss(p.foundAt) : '')); });
    if (card.robot) (card.robot.blocked || []).forEach(function (b) { L.push('⚠ ' + LL(b.text)); });
    (card.notes || []).forEach(function (n) { L.push('— ' + LL(n)); });
    return L.join('\n');
  }
  function paintCard(force) {
    var sim = LAB.sim; if (!sim) return;
    if (!force && sim.t - LAB.handoffAt < 2 && LAB.handoff && UI.cardBody._lang === lang()) return;
    var vis = UI.gCard && UI.gCard.offsetParent !== null; if (!vis && !force) return;
    LAB.handoffAt = sim.t; var card; try { card = Sim.handoff(sim); } catch (e) { return; }
    LAB.handoff = card; UI.cardBody._lang = lang();
    var b = UI.cardBody; b.textContent = '';
    b.appendChild(h('p', { class: 'rl-card-t' }, h('b', { text: LL(card.status) }), h('span', { class: 'muted', text: ' · ' + LL(card.incident) + ' · ' + card.clock })));
    var pe = card.people, kv = h('dl', { class: 'rl-kv' });
    [[B('المسجّلون', 'Registered'), pe.registered], [B('بأمان', 'Safe'), pe.safe + pe.safeAway], [B('يحتاج مساعدة', 'Needs help'), pe.help], [B('عُثر عليهم بالروبوت', 'Located by robot'), pe.located !== undefined ? pe.located : '—'], [B('غير محسوبين', 'Unaccounted'), pe.unaccounted]].forEach(function (q) { kv.appendChild(h('dt', { text: q[0] })); kv.appendChild(h('dd', { class: 'num', text: String(q[1]) })); });
    b.appendChild(kv);
    var ex = h('div', { class: 'rl-tags' }); card.exits.forEach(function (e) { var t = tag(e.state === 'OPEN' ? 'safe' : e.state === 'LOCKED' ? '' : e.state === 'FIRE' ? 'danger' : 'warn', LL(e.name) + ': ' + LL(EXIT_STATE[e.state].name)); ex.appendChild(t); });
    b.appendChild(h('b', { class: 'rl-subt' }, bi('المخارج', 'Exits'))); b.appendChild(ex);
    if (card.robot) {
      b.appendChild(h('b', { class: 'rl-subt' }, bi('الروبوت', 'The robot')));
      card.robot.units.forEach(function (u) { b.appendChild(h('p', { class: 'small' }, h('b', { text: u.id + ' ' }), h('span', { text: stateName(u.state) + ' · ' + B('بطارية ', 'battery ') + N(u.battery) + '% · ' + B('تغطية ', 'coverage ') + N(u.coveragePct) + '% · ' + LL(u.pose.label) }))); });
      b.appendChild(h('b', { class: 'rl-subt' }, bi('من عُثر عليه (غرفة، شخص، احتياج، الحالة تقدير، الوقت)', 'Located (room, person, need, condition est., time)')));
      var ul = h('ul', { class: 'rl-cardlist' });
      (card.locatedByRobot || []).slice(0, 12).forEach(function (p) { ul.appendChild(h('li', { class: 'small' }, h('b', { text: (p.name ? LL(p.name) : B('مقيم', 'Resident')) + ' · ' + B('غرفة ', 'room ') + (p.room || '?') }), h('span', { text: ' · ' + (p.needs && p.needs.length ? p.needs.map(function (n) { return LL(NEED_L[n] || T(n, n)); }).join('، ') : B('بلا احتياج مسجّل', 'no recorded need')) + ' · ' + condName(p.condition) + B(' (تقدير)', ' (est.)') + (p.foundAt !== null ? ' · T+' + mmss(p.foundAt) : '') }))); });
      if (!(card.locatedByRobot || []).length) ul.appendChild(h('li', { class: 'small muted' }, bi('— لا أحد بعد —', '— no one yet —')));
      b.appendChild(ul);
      if ((card.robot.blocked || []).length) { b.appendChild(h('b', { class: 'rl-subt' }, bi('مسدود أمام الروبوت', 'Blocked for the robot'))); var bl = h('ul', { class: 'rl-cardlist' }); card.robot.blocked.slice(-6).forEach(function (x) { bl.appendChild(h('li', { class: 'small', text: LL(x.text) })); }); b.appendChild(bl); }
    }
    b.appendChild(h('p', { class: 'small muted' }, (card.notes || []).map(function (n) { return LL(n); }).join(' · ')));
  }
  function downloadCard() {
    try { var card = LAB.handoff || Sim.handoff(LAB.sim); var blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' }); var a = h('a', { href: URL.createObjectURL(blob), download: 'manara-robot-handoff-sim.json' }); doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); } catch (e) { Manara.toast({ ar: 'تعذّر التنزيل في هذا المتصفح', en: 'Download is not available in this browser' }, 'warn'); }
  }
  function copyCard() {
    var txt = cardText(LAB.handoff || Sim.handoff(LAB.sim));
    var done = function () { Manara.toast({ ar: 'نُسخ نص بطاقة التسليم', en: 'Hand-off text copied' }, 'safe', 2600); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); }); return; } } catch (e) { /* fall through */ }
    fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) { try { var ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;inset-block-start:0' }); ta.value = txt; doc.body.appendChild(ta); ta.select(); doc.execCommand('copy'); ta.remove(); done(); } catch (e) { Manara.toast({ ar: 'تعذّر النسخ', en: 'Could not copy' }, 'warn'); } }

  /* ---- event log (aria-live polite) ---- */
  function buildLog() {
    UI.logList = h('ol', { class: 'rl-loglist', 'aria-live': 'polite', 'aria-relevant': 'additions', role: 'log' }); lab(UI.logList, 'aria-label', 'سجل الأحداث', 'Event log');
    UI.logFilter = seg('تصفية السجل', 'Filter the log', [{ id: 'key', ar: 'الأهم', en: 'Key' }, { id: 'robot', ar: 'الروبوت', en: 'Robot' }, { id: 'all', ar: 'الكل', en: 'All' }], function (id) { LAB.logFilter = id; UI.logFilter.setValue(id); rebuildLog(); }, 'rl-logfilter');
    var el = pnl('log', 'سجل الأحداث', 'Event log', UI.logFilter); el.body.appendChild(UI.logList);
    UI.logList.addEventListener('scroll', function () { UI.logList._stick = UI.logList.scrollTop + UI.logList.clientHeight >= UI.logList.scrollHeight - 24; });
    UI.logList._stick = true; UI.gLog = el; return el;
  }
  function logVisible(r) { var f = LAB.logFilter; return f === 'all' ? true : f === 'robot' ? r.cat === 'robot' && !r.quiet : (r.cat === 'robot' && !r.quiet) || r.cat === 'key'; }
  function logRowEl(r) { return h('li', { class: 'rl-ev ' + (r.tone || '') }, h('time', { class: 'num', text: 'T+' + mmss(r.t) }), h('span', { text: LL(r.text) })); }
  function rebuildLog() { UI.logList.textContent = ''; UI.logShown = 0; LAB.logAt = 0; paintLog(true); }
  function paintLog(force) {
    var from = force ? 0 : (LAB.logAt || 0), n = LAB.log.length; if (from > n) from = 0;
    var frag = doc.createDocumentFragment(), cnt = 0;
    for (var i = from; i < n; i++) { var r = LAB.log[i]; if (logVisible(r)) { frag.appendChild(logRowEl(r)); cnt++; } }
    LAB.logAt = n;
    if (cnt) { UI.logList.appendChild(frag); while (UI.logList.children.length > 260) UI.logList.removeChild(UI.logList.firstChild); if (UI.logList._stick) UI.logList.scrollTop = UI.logList.scrollHeight; }
    if (force && !UI.logList.children.length) UI.logList.appendChild(h('li', { class: 'rl-ev muted' }, h('span', { text: B('— لا أحداث بعد —', '— no events yet —') })));
    else if (cnt && UI.logList.firstChild && UI.logList.firstChild.classList.contains('muted')) UI.logList.removeChild(UI.logList.firstChild);
  }

  /* ---- legend ---- */
  function buildLegend() {
    var ul = h('ul', { class: 'rl-legend' });
    LEGEND_ORDER.forEach(function (k) { var li = h('li', null, h('span', { class: 'lg-dot' + (k === 'unacc' ? ' ring' : '') + (k === 'located' ? ' dbl' : ''), style: '--c:var(' + PERSON_ST[k].tok + ')' }), bi(PERSON_ST[k].name.ar, PERSON_ST[k].name.en)); ul.appendChild(li); });
    [['lg-robot', 'الروبوت (السهم = الاتجاه)', 'Robot (wedge = its view)'], ['lg-relay', 'مرحِّل اتصال', 'Link relay'], ['lg-route', 'منارة طريق', 'Route beacon'], ['lg-lock', 'باب مقفل', 'Locked door'], ['lg-cov', 'منطقة فُتِّشت', 'Searched area']].forEach(function (q) { ul.appendChild(h('li', null, h('span', { class: 'lg-sym ' + q[0] }), bi(q[1], q[2]))); });
    var el = h('section', { class: 'rl-legendbox', id: 'rl-pn-legend' }, h('h2', { class: 'sr-only' }, bi('دليل الرموز', 'Map legend')), ul);
    UI.gLegend = el; return el;
  }

  /* ====================================================================================
   * 11. LAYOUT: three columns on wide screens; on phones a sticky stage with tabs (Controls · Eye · Finds · Log · Card) under it
   * ==================================================================================== */
  var TABS = [['controls', 'sliders', 'التحكم', 'Controls'], ['eye', 'camera', 'العين', 'Eye'], ['finds', 'users', 'العثور', 'Finds'], ['log', 'list', 'السجل', 'Log'], ['card', 'shield', 'البطاقة', 'Card']];
  function buildSheet() {
    var sheet = h('div', { class: 'rl-sheet' }), list = h('div', { class: 'rl-tablist scroll-x', role: 'tablist' }), panes = {}, tabs = {};
    lab(list, 'aria-label', 'لوحات المختبر', 'Lab panels');
    TABS.forEach(function (t, i) {
      var tb = h('button', { type: 'button', class: 'rl-tab', role: 'tab', id: 'rl-tab-' + t[0], 'aria-controls': 'rl-pane-' + t[0], 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1' }, icon(t[1]), bi(t[2], t[3]));
      if (t[0] === 'finds') tb.appendChild(h('span', { class: 'rl-tabn num', text: '0' }));
      if (t[0] === 'controls') tb.appendChild(h('span', { class: 'rl-tabdot', hidden: true }));
      tb.addEventListener('click', function () { show(t[0]); });
      tb.addEventListener('keydown', function (e) {
        var rtl = htmlEl.dir === 'rtl', d = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0, j;
        if (e.key === 'Home') j = 0; else if (e.key === 'End') j = TABS.length - 1; else if (d) j = (i + d + TABS.length) % TABS.length; else return;
        e.preventDefault(); show(TABS[j][0]); tabs[TABS[j][0]].focus();
      });
      tabs[t[0]] = tb; list.appendChild(tb);
      var pane = h('div', { class: 'rl-pane', role: 'tabpanel', id: 'rl-pane-' + t[0], 'aria-labelledby': 'rl-tab-' + t[0], tabindex: '0', hidden: i !== 0 }); panes[t[0]] = pane;
    });
    function show(id) {
      LAB.tab = id;
      TABS.forEach(function (t) { var on = t[0] === id; tabs[t[0]].setAttribute('aria-selected', on ? 'true' : 'false'); tabs[t[0]].setAttribute('tabindex', on ? '0' : '-1'); panes[t[0]].hidden = !on; });
      DIRTY.eye = true; if (id === 'eye') setTimeout(resizeEye, 0); if (id === 'card') paintCard(true);
    }
    TABS.forEach(function (t) { sheet.appendChild(panes[t[0]]); });
    UI.tabsEl = list;
    sheet.show = show; sheet.panes = panes; sheet.tabs = tabs; UI.sheet = sheet; LAB.tab = 'controls';
    return sheet;
  }
  var wideMQ = window.matchMedia ? matchMedia('(min-width:1100px)') : { matches: true, addEventListener: function () {} };
  function applyLayout() {
    var wide = wideMQ.matches, c = UI.console; if (!c) return;
    c.setAttribute('data-layout', wide ? 'wide' : 'narrow');
    if (wide) {
      UI.left.appendChild(UI.gControls); UI.right.appendChild(UI.gEye); UI.right.appendChild(UI.gFinds); UI.right.appendChild(UI.gCount); UI.right.appendChild(UI.gCard);
      UI.below.appendChild(UI.gLegend); UI.below.appendChild(UI.gLog);
    } else {
      UI.sheet.panes.controls.appendChild(UI.gControls); UI.sheet.panes.controls.appendChild(UI.gLegend);
      UI.sheet.panes.eye.appendChild(UI.gEye); UI.sheet.panes.finds.appendChild(UI.gFinds); UI.sheet.panes.finds.appendChild(UI.gCount);
      UI.sheet.panes.log.appendChild(UI.gLog); UI.sheet.panes.card.appendChild(UI.gCard);
    }
    [UI.gCard, UI.gFinds, UI.gCount, UI.gEye, UI.gLog].forEach(function (p) { p.classList.toggle('in-tab', !wide); });
    setTimeout(function () { resizeStage(); resizeEye(); paintCard(true); }, 0);
  }

  function buildConsole() {
    root.textContent = '';
    UI.left = h('aside', { class: 'rl-left' }); lab(UI.left, 'aria-label', 'التحكم بالروبوت والسيناريو', 'Robot and scenario controls');
    UI.right = h('aside', { class: 'rl-right' }); lab(UI.right, 'aria-label', 'عين الروبوت وما عثر عليه والعدّ', 'Robot eye, finds and headcount');
    UI.below = h('div', { class: 'rl-below' });
    var controls = buildControls(), eye = buildEye(), finds = buildFinds(), count = buildCount(), card = buildCard(), log = buildLog(), legend = buildLegend();
    var sheet = buildSheet();
    UI.console = h('div', { class: 'rl-console', 'data-layout': 'wide' },
      h('div', { class: 'rl-top' }, buildToolbar(), buildStage(), UI.tabsEl), UI.left, UI.below, UI.right, sheet);
    root.appendChild(UI.console);
    buildFloorTabs(); UI.struct = LAB.struct;
    UI.tools.setValue(LAB.tool); UI.speed.setValue(LAB.speed); UI.variant.setValue(LAB.variant); UI.units.setValue(LAB.units); UI.carrier.setValue(paramNow('robotCarrier') ? 1 : 0); UI.eyeMode.setValue(LAB.eye); UI.logFilter.setValue(LAB.logFilter);
    fillPresetOptions(); paintLangNote(); startLightSignature();
    applyLayout(); (wideMQ.addEventListener ? wideMQ.addEventListener('change', applyLayout) : wideMQ.addListener(applyLayout));
  }
  function rebuildForStruct() {
    UI.struct = LAB.struct; buildFloorTabs();
    [[UI.prioSel, false, false], [UI.gotoSel, true, false], [UI.doorSel, false, true]].forEach(function (q) { q[0].textContent = ''; roomOptions(q[0], q[1], q[2]); });
    R.fitKey = ''; R.cursor = null; closePop(); fitView(true);
  }

  /* ====================================================================================
   * 12. THE ASSUMPTIONS DRAWER — every robot assumption as a labelled slider
   * ==================================================================================== */
  function robotParams() { return Sim.PARAMS.filter(function (p) { return p.group === 'robot'; }); }
  function decimals(step) { var s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  var BOOL_L = { robotCarrier: [T('موضوع مسبقاً عند المبنى', 'pre-positioned at the building'), T('تحمله مركبة الإطفاء', 'carried by the fire engine')], robotOpensDoors: [T('لا يفتح الأبواب', 'does not open doors'), T('يفتح الأبواب غير المقفلة', 'opens unlocked doors')], robotBeaconRelay: [T('المنارات لا تُرحِّل الإشارة', 'beacons do not relay'), T('المنارات ترحّل الإشارة', 'beacons relay the signal')] };
  function fmtParam(def, v) {
    if (def.unit === '0/1') return BOOL_L[def.key] ? LL(BOOL_L[def.key][v ? 1 : 0]) : (v ? B('نعم', 'on') : B('لا', 'off'));
    return N(v, decimals(def.step)) + (def.unit && def.unit !== '×' ? ' ' + def.unit : def.unit === '×' ? '×' : '');
  }
  function setParamUI(key, value) {
    var def = paramDef(key); if (!def) return;
    value = clamp(value, def.min, def.max);
    if (Math.abs(value - def.default) < 1e-9) delete LAB.params[key]; else LAB.params[key] = value;
    if (LAB.sim) { try { Sim.setParam(LAB.sim, key, value); } catch (e) { /* not live */ } }
    var row = UI.params && UI.params[key];
    if (row) { row.input.value = String(value); paintParamRow(def, row); }
    if (key === 'robotCarrier' && UI.carrier) UI.carrier.setValue(value ? 1 : 0);
    paintChanged(); paintLimits(); DIRTY.ui = DIRTY.stage = true;
  }
  function paintParamRow(def, row) {
    var v = +row.input.value, changed = Math.abs(v - def.default) > 1e-9;
    row.out.textContent = fmtParam(def, v); row.input.setAttribute('aria-valuetext', fmtParam(def, v));
    row.el.classList.toggle('changed', changed); row.reset.hidden = !changed;
    row.def.textContent = B('الافتراضي: ', 'default: ') + fmtParam(def, def.default);
  }
  function buildDrawer() {
    UI.params = {};
    var d = h('aside', { class: 'rl-drawer', id: 'rl-drawer', hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'rl-drawer-h' });
    var closeB = iconBtn('x', 'إغلاق الدرج', 'Close the drawer', function () { toggleDrawer(false); }, '');
    var head = h('div', { class: 'rl-dr-h' }, h('h2', { id: 'rl-drawer-h', tabindex: '-1' }, bi('افتراضات الروبوت (' + robotParams().length + ')', 'Robot assumptions (' + robotParams().length + ')')), closeB);
    var search = h('input', { type: 'search', class: 'input', id: 'rl-psearch' }); lab(search, 'placeholder', 'ابحث في الافتراضات…', 'Search the assumptions…'); lab(search, 'aria-label', 'ابحث في الافتراضات', 'Search the assumptions');
    var only = h('input', { type: 'checkbox', id: 'rl-ponly' });
    UI.pchanged = h('span', { class: 'tag num', text: '0' });
    var resetAll = btn('btn btn-ghost btn-sm', 'reset', 'أعد كل الافتراضات إلى قيمها', 'Reset all to defaults', function () { robotParams().forEach(function (p) { setParamUI(p.key, p.default); }); LAB.params = {}; paintChanged(); Manara.toast({ ar: 'عادت الافتراضات إلى قيمها الأصلية', en: 'Assumptions are back to their defaults' }, 'safe', 2600); });
    d.appendChild(head);
    d.appendChild(h('p', { class: 'small rl-dr-note' }, bi('كل رقم هنا افتراض مُسمّى وليس قياساً (المصدر: «افتراض»)، والنتائج كلها محاكاة. التغيير يسري على التشغيل الجاري من الآن؛ اضغط «إعادة» لتشغيل نظيف يمكن مقارنته. المقارنة (A/B) تستعملها من الثانية صفر.', 'Every number here is a named assumption, not a measurement (source: "assumption"), and all results are simulation. A change applies to the running simulation from now on; press "Reset" for a clean, comparable run. The A/B comparison uses them from T+0.')));
    d.appendChild(h('div', { class: 'rl-dr-tools' }, search, h('label', { class: 'rl-chk' }, only, bi('المتغيّرة فقط', 'Changed only')), h('span', { class: 'small' }, bi('متغيّرة: ', 'Changed: '), UI.pchanged), resetAll));
    var body = h('div', { class: 'rl-dr-b' }); d.appendChild(body);
    var defs = robotParams(), seen = {};
    function addParam(def, wrap) {
      var id = 'rl-p-' + def.key;
      var input = h('input', { type: 'range', id: id, min: String(def.min), max: String(def.max), step: String(def.step), value: String(def.default), 'aria-describedby': id + '-d' });
      var out = h('output', { class: 'num', 'for': id }), dflt = h('span', { class: 'small muted rl-pdef' }), rst = h('button', { type: 'button', class: 'rl-x', hidden: true }, icon('undo')); lab(rst, 'aria-label', 'أعد «' + def.label.ar + '» إلى الافتراضي', 'Reset "' + def.label.en + '" to its default');
      var el = h('div', { class: 'rl-param', 'data-key': def.key }, h('div', { class: 'rl-pl' }, h('label', { 'for': id, text: LL(def.label) }), out, rst), input, h('div', { class: 'rl-pm' }, dflt, h('span', { class: 'tag rl-src', text: def.src === 'assumption' ? B('افتراض', 'assumption') : def.src })), h('small', { class: 'muted rl-pd', id: id + '-d', text: LL(def.desc) }));
      var row = { el: el, input: input, out: out, reset: rst, def: dflt, lblEl: $('label', el), descEl: $('.rl-pd', el) }; UI.params[def.key] = row;
      input.addEventListener('input', function () { setParamUI(def.key, +input.value); });
      rst.addEventListener('click', function () { setParamUI(def.key, def.default); });
      paintParamRow(def, row); wrap.appendChild(el);
    }
    AREAS.forEach(function (a) {
      var wrap = h('section', { class: 'rl-area', 'data-area': a.id }, h('h3', { text: LL(a.label) })); a._h = $('h3', wrap);
      a.keys.forEach(function (k) { var def = defs.filter(function (p) { return p.key === k; })[0]; if (def) { seen[k] = 1; addParam(def, wrap); } });
      body.appendChild(wrap);
    });
    var rest = defs.filter(function (p) { return !seen[p.key]; });
    if (rest.length) { var wr = h('section', { class: 'rl-area', 'data-area': 'other' }, h('h3', null, bi('أخرى', 'Other'))); rest.forEach(function (p) { addParam(p, wr); }); body.appendChild(wr); }
    function filter() {
      var q = (search.value || '').trim().toLowerCase(), ch = only.checked;
      defs.forEach(function (p) { var row = UI.params[p.key], hit = (!q || (p.key + ' ' + p.label.ar + ' ' + p.label.en + ' ' + p.desc.ar + ' ' + p.desc.en).toLowerCase().indexOf(q) >= 0) && (!ch || row.el.classList.contains('changed')); row.el.hidden = !hit; });
      $$('.rl-area', body).forEach(function (a) { a.hidden = !$$('.rl-param', a).some(function (x) { return !x.hidden; }); });
    }
    search.addEventListener('input', filter); only.addEventListener('change', filter); UI.pfilter = filter;
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggleDrawer(false); } });
    UI.drawer = d; root.parentNode.insertBefore(d, root.nextSibling);
  }
  function paintChanged() { if (UI.pchanged) setText(UI.pchanged, N(Object.keys(LAB.params).length)); if (UI.assumeBtn) setCls(UI.assumeBtn, 'has-changes', Object.keys(LAB.params).length > 0); if (UI.pfilter) UI.pfilter(); var ab = $('#rl-ab-used'); if (ab) setText(ab, abUsedText()); }
  function toggleDrawer(open) {
    var d = UI.drawer; if (!d) return; if (open === undefined) open = d.hidden;
    d.hidden = !open; UI.assumeBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); htmlEl.classList.toggle('rl-drawer-open', open);
    if (open) { var hh = $('#rl-drawer-h'); if (hh) hh.focus({ preventScroll: true }); } else UI.assumeBtn.focus({ preventScroll: true });
  }
  function relabelDrawer() {
    robotParams().forEach(function (p) { var row = UI.params[p.key]; if (!row) return; row.lblEl.textContent = LL(p.label); row.descEl.textContent = LL(p.desc); var s = $('.rl-src', row.el); if (s) s.textContent = p.src === 'assumption' ? B('افتراض', 'assumption') : p.src; paintParamRow(p, row); });
    AREAS.forEach(function (a) { if (a._h) a._h.textContent = LL(a.label); });
  }

  /* ====================================================================================
   * 13. A/B (abRobot) AND SENSITIVITY (sweepRobot): run on demand, bar charts drawn in code — ALWAYS labelled SIMULATION
   * ==================================================================================== */
  function simBadge() { return h('p', { class: 'rl-simlabel', role: 'note' }, h('span', { class: 'tag warn', translate: 'no', text: 'SIM' }), h('b', null, bi(SIM_LABEL.ar, SIM_LABEL.en))); }
  function abUsedText() { var n = Object.keys(LAB.params).length; return n ? B('تستعمل ', 'Uses ') + N(n) + B(' افتراضاً غيّرته (انظر الدرج).', ' assumption(s) you changed (see the drawer).') : B('تستعمل الافتراضات الأصلية كلها.', 'Uses the original assumptions.'); }
  var AB = { running: false, results: null };
  function buildAB() {
    var c = $('#rl-ab-controls'), out = $('#rl-ab-out'); if (!c || !out) return;
    var seed = h('input', { type: 'number', class: 'input', id: 'rl-ab-seed', min: '1', max: '9999', value: String(LAB.seed) }); UI.abSeed = seed;
    UI.abOne = btn('btn btn-primary', 'chart', 'شغّل المقارنة (بذرة واحدة)', 'Run the A/B (one seed)', function () { runAB([clamp(Math.round(+seed.value || 1), 1, 9999)]); });
    UI.abMany = btn('btn btn-ghost', 'chart', 'شغّل 5 بذور (1 إلى 5)', 'Run 5 seeds (1 to 5)', function () { runAB([1, 2, 3, 4, 5]); });
    UI.abProg = h('progress', { class: 'rl-prog', max: '1', value: '0', hidden: true }); lab(UI.abProg, 'aria-label', 'تقدّم التشغيل', 'Run progress');
    UI.abStatus = h('p', { class: 'small muted', 'aria-live': 'polite' });
    c.appendChild(h('h3', null, bi('شغّل المقارنة', 'Run the comparison')));
    c.appendChild(h('p', { class: 'small muted' }, bi('كل تشغيل يحاكي ٢٥ دقيقة مرتين (بلا روبوت ومع الروبوت) ويستغرق بضع ثوانٍ في متصفحك.', 'Each run simulates 25 minutes twice (without the robot and with it) and takes a few seconds in your browser.')));
    c.appendChild(h('p', { class: 'small', id: 'rl-ab-used', text: abUsedText() }));
    c.appendChild(field('البذرة', 'Seed', seed)); c.appendChild(h('div', { class: 'rl-btns' }, UI.abOne, UI.abMany)); c.appendChild(UI.abProg); c.appendChild(UI.abStatus); c.appendChild(simBadge());
    out.appendChild(h('p', { class: 'muted', id: 'rl-ab-empty' }, bi('لم يُشغَّل شيء بعد — اضغط أحد الزرّين لترى الأعمدة.', 'Nothing has been run yet — press one of the buttons to see the bars.')));
    out.setAttribute('aria-busy', 'false');
  }
  function runAB(seeds) {
    if (AB.running) return; AB.running = true; var out = $('#rl-ab-out'); out.setAttribute('aria-busy', 'true');
    UI.abOne.disabled = UI.abMany.disabled = true; UI.abProg.hidden = false; UI.abProg.max = seeds.length; UI.abProg.value = 0;
    var res = [], i = 0, t0 = now();
    setText(UI.abStatus, B('يعمل… ', 'Running… ') + '0/' + N(seeds.length));
    (function next() {
      if (i >= seeds.length) { AB.running = false; AB.results = res; UI.abOne.disabled = UI.abMany.disabled = false; UI.abProg.hidden = true; out.setAttribute('aria-busy', 'false'); setText(UI.abStatus, B('انتهى في ', 'Done in ') + N((now() - t0) / 1000, 1) + B(' ث.', ' s.')); renderAB(res); return; }
      setTimeout(function () {
        var r; try { r = Sim.abRobot({ preset: LAB.presetId, seed: seeds[i], params: LAB.params }); } catch (e) { r = null; }
        if (r) res.push(r); i++; UI.abProg.value = i; setText(UI.abStatus, B('يعمل… ', 'Running… ') + N(i) + '/' + N(seeds.length)); next();
      }, 30);
    })();
  }
  function perPerson(m, key) { var a = m.unaccounted.perPerson.filter(function (p) { return p.key === key; })[0]; return a || null; }
  function mean(arr) { var v = arr.filter(isNum); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function barChart(o) {
    var W = 360, H = 190, padL = 38, padR = 8, padT = 18, padB = 40, iw = W - padL - padR, ih = H - padT - padB;
    var max = o.max || 0; o.groups.forEach(function (g) { g.bars.forEach(function (b) { if (isNum(b.v) && b.v > max) max = b.v; }); }); if (max <= 0) max = 1;
    var step = Math.pow(10, Math.floor(Math.log(max) / Math.LN10)), nice = Math.ceil(max / step) * step; if (nice / step > 5) nice = Math.ceil(max / (step * 2)) * step * 2; max = nice;
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rl-svg', role: 'img', 'aria-label': o.title + ': ' + o.groups.map(function (g) { return g.label + ' ' + g.bars.map(function (b) { return (b.name ? b.name + ' ' : '') + (isNum(b.v) ? fmtNum(b.v) : '—'); }).join(', '); }).join('; ') });
    for (var t = 0; t <= 2; t++) { var yy = padT + ih - ih * t / 2; svg.appendChild(sv('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'rl-grid' })); svg.appendChild(sv('text', { x: padL - 6, y: yy + 3.5, class: 'rl-ax', 'text-anchor': 'end' }, fmtNum(max * t / 2))); }
    var gw = iw / o.groups.length, nb = o.groups[0].bars.length, bw = Math.min(30, (gw - 14) / nb);
    o.groups.forEach(function (g, gi) {
      var gx = padL + gi * gw + gw / 2;
      g.bars.forEach(function (b, bi2) {
        var x = gx - (nb * bw) / 2 + bi2 * bw + 1, hh = isNum(b.v) ? ih * b.v / max : 0;
        if (isNum(b.v)) { svg.appendChild(sv('rect', { x: x, y: padT + ih - hh, width: bw - 2, height: Math.max(1, hh), rx: 2, class: 'rl-bar-' + b.cls + (b.hatch ? ' hatch' : '') })); svg.appendChild(sv('text', { x: x + (bw - 2) / 2, y: padT + ih - hh - 4, class: 'rl-val', 'text-anchor': 'middle' }, fmtNum(b.v) + (b.hatch ? '+' : ''))); }
        else svg.appendChild(sv('text', { x: x + (bw - 2) / 2, y: padT + ih - 4, class: 'rl-val', 'text-anchor': 'middle' }, '—'));
      });
      svg.appendChild(sv('text', { x: gx, y: H - padB + 14, class: 'rl-ax', 'text-anchor': 'middle' }, g.label));
      if (g.sub) svg.appendChild(sv('text', { x: gx, y: H - padB + 27, class: 'rl-ax2', 'text-anchor': 'middle' }, g.sub));
    });
    var tbl = h('table', { class: 'sr-only' }, h('caption', { text: o.title }), h('tbody', null, o.groups.map(function (g) { return h('tr', null, h('th', { scope: 'row', text: g.label }), g.bars.map(function (b) { return h('td', { text: (b.name || '') + ' ' + (isNum(b.v) ? fmtNum(b.v) : '—') }); })); })));
    var leg = h('p', { class: 'rl-chlegend small' }); (o.legend || []).forEach(function (l) { leg.appendChild(h('span', null, h('i', { class: 'rl-sw rl-bar-' + l[0] }), l[1])); });
    return h('figure', { class: 'rl-chart' }, h('figcaption', null, h('b', { text: o.title }), o.unit ? h('span', { class: 'small muted', text: ' (' + o.unit + ')' }) : null), svg, tbl, leg, o.note ? h('p', { class: 'small muted', text: o.note }) : null);
  }
  function fmtNum(v) { return v === 0 ? '0' : Math.abs(v) >= 100 ? N(Math.round(v)) : Math.abs(v) >= 10 ? N(v, 0) : N(v, 1); }
  function renderAB(res) {
    var out = $('#rl-ab-out'); out.textContent = '';
    if (!res.length) { out.appendChild(h('p', { class: 'note warn', text: B('تعذّر التشغيل لهذا السيناريو.', 'The run failed for this scenario.') })); return; }
    var lgd = [['a', B('بلا روبوت', 'Without the robot')], ['b', B('مع الروبوت', 'With the robot')]];
    var wp = function (r) { return r.without.unaccounted.timeToLocate; }, mp = function (r) { return r.withRobot.unaccounted.timeToLocate; };
    var p50w = mean(res.map(function (r) { return wp(r).p50; })), p50m = mean(res.map(function (r) { return mp(r).p50; })), p90w = mean(res.map(function (r) { return wp(r).p90; })), p90m = mean(res.map(function (r) { return mp(r).p90; }));
    var nU = Math.round(mean(res.map(function (r) { return r.without.unaccounted.n; })) || 0);
    var as = res.map(function (r) { var a = perPerson(r.without, 'abu-salem'), b = perPerson(r.withRobot, 'abu-salem'); return { seed: r.seed, w: a, m: b }; }).filter(function (x) { return x.w && x.m; });
    var asFirst = as.filter(function (x) { return x.m.byRobot; }).length;
    // headline sentences, computed from this very run
    var sum = h('div', { class: 'rl-abnums' });
    sum.appendChild(h('p', null, h('b', { text: B('الزمن الوسيط للعثور على غير المحصيّين (' + N(nU) + ' مقيماً): ', 'Median time to locate the unaccounted (' + N(nU) + ' residents): ') }), h('span', { class: 'num', text: N(p50w, 1) + ' → ' + N(p50m, 1) + ' ' + B('ث', 's') + ' (Δ ' + N(p50w - p50m, 1) + ')' }), h('span', { text: ' · p90 ' }), h('span', { class: 'num', text: N(p90w, 1) + ' → ' + N(p90m, 1) + ' ' + B('ث', 's') })));
    if (as.length) sum.appendChild(h('p', null, h('b', { text: B('أبو سالم (كرسي متحرك): ', 'Abu Salem (wheelchair): ') }), h('span', { class: 'num', text: as.map(function (x) { return (x.w.sec === null ? '>' : '') + N(x.w.secOrEnd) + '→' + (x.m.sec === null ? '>' : '') + N(x.m.secOrEnd); }).join('  ') + ' ' + B('ث', 's') }), h('span', { text: ' · ' + B('الروبوت أول من وجده في ', 'the robot found him first in ') + N(asFirst) + B(' من ', ' of ') + N(as.length) + B(' بذور؛ في الباقي سبقته فرق الإنقاذ.', ' seed(s); in the others the crews got there first.') })));
    out.appendChild(sum);
    var grid = h('div', { class: 'rl-charts' });
    grid.appendChild(barChart({ title: B('زمن العثور على غير المحصيّين', 'Time to locate the unaccounted'), unit: B('ثانية', 'seconds'), legend: lgd, groups: [{ label: B('الوسيط', 'median'), bars: [{ v: p50w, cls: 'a', name: lgd[0][1] }, { v: p50m, cls: 'b', name: lgd[1][1] }] }, { label: 'p90', bars: [{ v: p90w, cls: 'a', name: lgd[0][1] }, { v: p90m, cls: 'b', name: lgd[1][1] }] }], note: B('يكاد لا يتغير: المنارة تُحصي معظمهم أصلاً.', 'Barely moves: MANARA already counts most of them.') }));
    if (as.length) grid.appendChild(barChart({ title: B('أبو سالم: متى عُرف مكانه', 'Abu Salem: when his place became known'), unit: B('ثانية', 'seconds'), legend: lgd.concat([['h', B('حدّ أدنى (لم يُعثر عليه)', 'lower bound (never located)')]]), groups: as.map(function (x) { return { label: B('بذرة ', 'seed ') + N(x.seed), sub: x.m.byRobot ? B('الروبوت أولاً', 'robot first') : B('الفرق أولاً', 'crews first'), bars: [{ v: x.w.secOrEnd, cls: 'a', name: lgd[0][1], hatch: x.w.sec === null }, { v: x.m.secOrEnd, cls: 'b', name: lgd[1][1], hatch: x.m.sec === null }] }; }) }));
    grid.appendChild(barChart({ title: B('ما زال غير محسوب بعد (عدد)', 'Still unaccounted (count)'), unit: B('مقيم', 'residents'), legend: lgd, groups: ['t120', 't300', 't450', 't600'].map(function (k) { return { label: 'T+' + k.slice(1), bars: [{ v: mean(res.map(function (r) { return r.without.stillUnaccounted[k]; })), cls: 'a', name: lgd[0][1] }, { v: mean(res.map(function (r) { return r.withRobot.stillUnaccounted[k]; })), cls: 'b', name: lgd[1][1] }] }; }) }));
    grid.appendChild(barChart({ title: B('من يحتاجون مساعدة وعُرف مكانهم…', 'Needs-help residents whose place became known…'), unit: '%', max: 100, legend: lgd, groups: [{ label: B('قبل وصول الفرق', 'before the crews'), bars: [{ v: mean(res.map(function (r) { return r.without.needsHelp.pctBeforeCrews; })), cls: 'a', name: lgd[0][1] }, { v: mean(res.map(function (r) { return r.withRobot.needsHelp.pctBeforeCrews; })), cls: 'b', name: lgd[1][1] }] }, { label: B('قبل إخراجهم', 'before they were brought out'), bars: [{ v: mean(res.map(function (r) { return r.without.needsHelp.pctBeforeRescue; })), cls: 'a', name: lgd[0][1] }, { v: mean(res.map(function (r) { return r.withRobot.needsHelp.pctBeforeRescue; })), cls: 'b', name: lgd[1][1] }] }] }));
    out.appendChild(grid);
    if (res.length > 1) {   // per-seed table: the spread is part of the honest answer
      var tb = h('table', { class: 'table rl-seedtable' }, h('thead', null, h('tr', null, ['بذرة|seed', 'Δ الوسيط (ث)|Δ median (s)', 'أبو سالم بلا→مع|Abu Salem w/o → with', 'من وجده أولاً|who found him first', 'احتياج قبل الإخراج %|needs-help before rescue %'].map(function (c) { var q = c.split('|'); return h('th', { scope: 'col', text: B(q[0], q[1]) }); }))));
      var bd = h('tbody'); res.forEach(function (r, i) { var a = as.filter(function (x) { return x.seed === r.seed; })[0]; bd.appendChild(h('tr', null, h('td', { class: 'num', text: String(r.seed) }), h('td', { class: 'num', text: N(wp(r).p50 - mp(r).p50, 1) }), h('td', { class: 'num', text: a ? (a.w.sec === null ? '>' : '') + N(a.w.secOrEnd) + ' → ' + (a.m.sec === null ? '>' : '') + N(a.m.secOrEnd) : '—' }), h('td', { text: a ? (a.m.byRobot ? B('الروبوت', 'the robot') : B('فرق الإنقاذ/غيرها', 'the crews / others')) : '—' }), h('td', { class: 'num', text: N(r.without.needsHelp.pctBeforeRescue) + ' → ' + N(r.withRobot.needsHelp.pctBeforeRescue) }))); });
      tb.appendChild(bd); out.appendChild(h('div', { class: 'table-wrap' }, tb));
    }
    out.appendChild(simBadge());
    out.appendChild(h('p', { class: 'small muted' }, bi('السالب الكاذب والموجب الكاذب والحرارة والبطارية والاتصال كلها داخل هذه الأرقام. الحالة «تقدير»، والكشف بقواعد بسيطة.', 'False negatives, false positives, heat, battery and link are all inside these numbers. Condition is an estimate; detection is rule-based.')));
  }

  /* ---- sensitivity: ONE assumption at a time ---- */
  var SWEEPS = [
    { key: 'robotThermalPd', values: [0.05, 0.15, 0.35, 0.6], metric: 'coverage' }, { key: 'robotRoomC', values: [24, 30, 34, 38], metric: 'coverage' }, { key: 'robotDropoutPct', values: [0, 2, 8, 20], metric: 'coverage' },
    { key: 'robotMeshRangeM', values: [10, 20, 30, 50], metric: 'coverage' }, { key: 'robotBattMin', values: [10, 20, 45, 90], metric: 'coverage' }, { key: 'robotCarrier', values: [0, 1], metric: 'needsRescPct' },
    { key: 'variant', values: ['tracked', 'wheeled'], metric: 'needsRescPct', label: T('نوع الروبوت (جنزير / عجلات)', 'Robot variant (tracked / wheeled)') }, { key: 'units', values: [1, 2, 3], metric: 'byRobot', label: T('عدد الوحدات', 'Number of units') }
  ];
  var SENS_METRICS = [
    { id: 'needsRescPct', label: T('من يحتاجون مساعدة وعُرف مكانهم قبل إخراجهم (٪)', 'Needs-help residents located before they were brought out (%)'), unit: '%' },
    { id: 'saved', label: T('الثواني التي وُفِّرت لمن وجده الروبوت أولاً (متوسط)', 'Seconds saved for people the robot found first (mean)'), unit: 's' },
    { id: 'byRobot', label: T('عدد من وجدهم الروبوت أولاً', 'Residents the robot located first'), unit: '' },
    { id: 'coverage', label: T('نسبة الغرف التي فُتّشت (٪)', 'Rooms searched (%)'), unit: '%' },
    { id: 'p50', label: T('الزمن الوسيط للعثور على الجميع (ث)', 'Median time to locate everyone (s)'), unit: 's' }
  ];
  function sweepLabel(sw) { if (sw.label) return LL(sw.label); var d = paramDef(sw.key); return d ? LL(d.label) + (d.unit ? ' (' + d.unit + ')' : '') : sw.key; }
  function buildSens() {
    var c = $('#rl-sens-controls'), out = $('#rl-sens-out'); if (!c || !out) return;
    UI.sensParam = h('select', { class: 'input', id: 'rl-sens-param' }); UI.sensMetric = h('select', { class: 'input', id: 'rl-sens-metric' });
    UI.sensRun = btn('btn btn-primary', 'chart', 'شغّل الحساسية', 'Run the sweep', function () { runSens(); });
    UI.sensProg = h('progress', { class: 'rl-prog', max: '1', value: '0', hidden: true }); lab(UI.sensProg, 'aria-label', 'تقدّم التشغيل', 'Run progress');
    UI.sensStatus = h('p', { class: 'small muted', 'aria-live': 'polite' });
    c.appendChild(h('h3', null, bi('اختر افتراضاً واحداً', 'Pick ONE assumption')));
    c.appendChild(field('الافتراض', 'Assumption', UI.sensParam)); c.appendChild(field('المقياس', 'Metric', UI.sensMetric));
    c.appendChild(h('p', { class: 'small muted' }, bi('بذرتان (1 و 2) لكل قيمة. يستغرق نحو عشر ثوانٍ.', 'Two seeds (1 and 2) per value. Takes about ten seconds.')));
    c.appendChild(h('div', { class: 'rl-btns' }, UI.sensRun)); c.appendChild(UI.sensProg); c.appendChild(UI.sensStatus); c.appendChild(simBadge());
    out.appendChild(h('p', { class: 'muted', id: 'rl-sens-empty' }, bi('لم يُشغَّل شيء بعد.', 'Nothing has been run yet.')));
    fillSensOptions(); UI.sensMetric.value = SWEEPS[0].metric;
    UI.sensParam.addEventListener('change', function () { var sw = SWEEPS.filter(function (x) { return x.key === UI.sensParam.value; })[0]; if (sw && sw.metric) UI.sensMetric.value = sw.metric; });
  }
  function fillSensOptions() {
    if (!UI.sensParam) return; var p = UI.sensParam.value, m = UI.sensMetric.value; UI.sensParam.textContent = ''; UI.sensMetric.textContent = '';
    SWEEPS.forEach(function (sw) { UI.sensParam.appendChild(h('option', { value: sw.key, text: sweepLabel(sw) })); });
    SENS_METRICS.forEach(function (x) { UI.sensMetric.appendChild(h('option', { value: x.id, text: LL(x.label) })); });
    if (p) UI.sensParam.value = p; if (m) UI.sensMetric.value = m;
  }
  var SENS = { running: false };
  function runSens() {
    if (SENS.running) return; var sw = SWEEPS.filter(function (x) { return x.key === UI.sensParam.value; })[0], metric = SENS_METRICS.filter(function (x) { return x.id === UI.sensMetric.value; })[0]; if (!sw) return;
    SENS.running = true; var out = $('#rl-sens-out'); out.setAttribute('aria-busy', 'true'); UI.sensRun.disabled = true; UI.sensProg.hidden = false; UI.sensProg.max = sw.values.length; UI.sensProg.value = 0;
    var rows = [], baseline = null, baseRuns = null, i = 0, t0 = now();
    setText(UI.sensStatus, B('يعمل… ', 'Running… ') + '0/' + N(sw.values.length));
    (function next() {
      if (i >= sw.values.length) { SENS.running = false; UI.sensRun.disabled = false; UI.sensProg.hidden = true; out.setAttribute('aria-busy', 'false'); setText(UI.sensStatus, B('انتهى في ', 'Done in ') + N((now() - t0) / 1000, 1) + B(' ث.', ' s.')); renderSens(sw, metric, baseline, rows); return; }
      setTimeout(function () {
        var r = null; try { var pr = {}; Object.keys(LAB.params).forEach(function (k) { pr[k] = LAB.params[k]; }); r = Sim.sweepRobot({ preset: LAB.presetId, param: sw.key, values: [sw.values[i]], seeds: [1, 2], params: pr, baselineRuns: baseRuns || undefined }); } catch (e) { r = null; }
        if (r) { if (!baseline) { baseline = r.baseline; baseRuns = r.baselineRuns; } rows.push(r.rows[0]); }
        i++; UI.sensProg.value = i; setText(UI.sensStatus, B('يعمل… ', 'Running… ') + N(i) + '/' + N(sw.values.length)); next();
      }, 30);
    })();
  }
  function renderSens(sw, metric, baseline, rows) {
    var out = $('#rl-sens-out'); out.textContent = '';
    if (!rows.length) { out.appendChild(h('p', { class: 'note warn', text: B('تعذّر التشغيل.', 'The run failed.') })); return; }
    var bars = rows.map(function (r) { var v = r[metric.id]; var lbl = typeof r.value === 'number' ? (sw.key === 'robotCarrier' ? (r.value ? B('مركبة الإطفاء', 'fire engine') : B('موضوع مسبقاً', 'pre-positioned')) : String(r.value)) : (r.value === 'tracked' ? B('جنزير', 'tracked') : B('عجلات', 'wheeled')); return { label: lbl, v: isNum(v) ? v : null }; });
    var groups = bars.map(function (b) { return { label: b.label, bars: [{ v: b.v, cls: 'b', name: B('مع الروبوت', 'with the robot') }] }; });
    var bv = baseline ? baseline[metric.id === 'needsRescPct' ? 'needsRescPct' : metric.id] : null, showBase = isNum(bv) && metric.id !== 'saved' && metric.id !== 'byRobot' && metric.id !== 'coverage';
    if (showBase) groups.unshift({ label: B('بلا روبوت', 'no robot'), bars: [{ v: bv, cls: 'a', name: B('بلا روبوت', 'no robot') }] });
    out.appendChild(h('p', null, h('b', { text: sweepLabel(sw) }), h('span', { class: 'muted', text: ' → ' + LL(metric.label) })));
    out.appendChild(barChart({ title: LL(metric.label), unit: metric.unit === 's' ? B('ثانية', 'seconds') : metric.unit, groups: groups, max: metric.unit === '%' ? 100 : 0, legend: showBase ? [['a', B('بلا روبوت', 'without the robot')], ['b', B('مع الروبوت (قيمة الافتراض)', 'with the robot (assumption value)')]] : [['b', B('مع الروبوت (قيمة الافتراض)', 'with the robot (assumption value)')]] }));
    var vals = bars.map(function (b) { return b.v; }).filter(isNum), spread = vals.length ? Math.max.apply(null, vals) - Math.min.apply(null, vals) : 0;
    out.appendChild(h('p', { class: 'small' }, B('أعلى قيمة ناقص أدنى قيمة بين ما جرّبناه: ', 'Highest minus lowest value among those we tried: '), h('b', { class: 'num', text: fmtNum(spread) + (metric.unit === '%' ? '%' : metric.unit === 's' ? ' ' + B('ث', 's') : '') }), B(' — كلما كبر هذا الرقم زاد اعتماد النتيجة على هذا الافتراض.', ' — the bigger this is, the more the result depends on this assumption.')));
    out.appendChild(simBadge());
  }

  /* ====================================================================================
   * 14. LIMITS (live numbers from the assumptions), PAINTERS, THE STORY, THE FRAME LOOP, INIT
   * ==================================================================================== */
  function paintLimits() {
    $$('[data-param]').forEach(function (el) { var k = el.getAttribute('data-param'), d = paramDef(k); if (d) setText(el, N(paramNow(k), decimals(d.step))); });
    var roomC = paramNow('robotRoomC'), cc = Math.max(0.1, paramNow('robotContrastC'));
    $$('[data-live=contrast]').forEach(function (cEl) { setText(cEl, N(pct(clamp((34 - roomC) / cc, 0, 1))) + '%'); });
    var box = $('#rl-contrast'); if (!box) return;
    var key = [roomC, cc, lang(), isDark()].join(); if (box._key === key) return; box._key = key; box.textContent = '';
    var W = 320, H = 138, pl = 34, pr = 10, pt = 10, pb = 36, iw = W - pl - pr, ih = H - pt - pb, x = function (t) { return pl + iw * (t - 20) / 25; }, y = function (c) { return pt + ih * (1 - c); };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rl-svg', 'aria-hidden': 'true' });
    svg.appendChild(sv('rect', { x: x(34), y: pt, width: x(45) - x(34), height: ih, class: 'rl-zone' }));
    var pts = []; for (var t = 20; t <= 45; t += 0.5) pts.push(x(t).toFixed(1) + ',' + y(clamp((34 - t) / cc, 0, 1)).toFixed(1));
    svg.appendChild(sv('line', { x1: pl, x2: W - pr, y1: y(0), y2: y(0), class: 'rl-grid' })); svg.appendChild(sv('polyline', { points: pts.join(' '), class: 'rl-line', fill: 'none' }));
    svg.appendChild(sv('line', { x1: x(roomC), x2: x(roomC), y1: pt, y2: y(0), class: 'rl-mark' }));
    svg.appendChild(sv('text', { x: x(roomC), y: pt + 9, class: 'rl-ax', 'text-anchor': x(roomC) > W / 2 ? 'end' : 'start', dx: x(roomC) > W / 2 ? -4 : 4 }, B('الافتراض الحالي ', 'current ') + N(roomC) + ' °C'));
    svg.appendChild(sv('text', { x: x(39.5), y: y(0.5), class: 'rl-ax', 'text-anchor': 'middle' }, B('لا تباين', 'no contrast')));
    [20, 25, 30, 34, 40, 45].forEach(function (tv) { svg.appendChild(sv('text', { x: x(tv), y: H - 20, class: 'rl-ax', 'text-anchor': 'middle' }, String(tv))); });
    svg.appendChild(sv('text', { x: pl - 5, y: y(1) + 3, class: 'rl-ax', 'text-anchor': 'end' }, '100%')); svg.appendChild(sv('text', { x: pl - 5, y: y(0) + 3, class: 'rl-ax', 'text-anchor': 'end' }, '0'));
    svg.appendChild(sv('text', { x: W / 2, y: H - 4, class: 'rl-ax2', 'text-anchor': 'middle' }, B('حرارة هواء الغرفة (°م) — محاكاة', 'Room air temperature (°C) — simulation')));
    box.appendChild(svg); box.setAttribute('aria-label', B('منحنى التباين الحراري مقابل حرارة الغرفة: ينعدم عند 34 °م', 'Thermal contrast against room temperature: it falls to zero at 34 °C'));
  }

  function paintToolbar() {
    var sim = LAB.sim, snap = LAB.snap; if (!sim || !snap) return;
    setText($('.rl-t', UI.time), 'T+' + mmss(sim.t)); setText($('.rl-clk', UI.time), snap.clock);
    var ph = snap.verification.phase, tg = UI.phase; setText(tg, LL(PHASE_L[ph] || PHASE_L.idle));
    tg.className = 'rl-phase tag ' + (ph === 'public' ? 'danger' : ph === 'confirmed' ? 'warn' : ph === 'suspect' ? 'warn' : 'info');
    setPlayUI();
  }
  function paintBanner() {
    var rs = robotsOf(), b = UI.banner, kc = UI.keyCard, sim = LAB.sim; if (!rs.length) { b.hidden = true; UI.bannerT.hidden = true; kc.hidden = true; return; }
    var r = selRobot();
    if (r && r.state !== 'stowed') {
      var tok = ROBOT_STATE[r.state], detail = (r.target ? '→ ' + LL(r.target.label) + ' · ' : '') + B('بطارية ', 'battery ') + N(pct(r.battery)) + '%' + (r.link.up ? '' : ' · ' + B('الاتصال مقطوع', 'link down')), pl = LL(r.name) + ' · ' + stateName(r.state);
      b.hidden = false; b.textContent = ''; b.appendChild(pill(pl, tok)); b.appendChild(h('span', { class: 'small' }, detail));
      var bt = UI.bannerT; bt.hidden = false; bt.textContent = ''; bt.appendChild(pill(r.id + ' · ' + stateName(r.state), tok)); bt.appendChild(h('span', { class: 'small bt-detail' }, detail));
    } else { b.hidden = true; UI.bannerT.hidden = true; }
    var waiting = rs.filter(function (x) { return x.state === 'stowed' && x.approval.status === 'requested'; });
    var showKey = waiting.length && !sim.done;
    if (showKey && kc.hidden) {
      kc.textContent = '';
      kc.appendChild(h('p', null, icon('shield'), h('span', null, bi('الروبوت جاهز عند المدخل. نشره داخل المبنى يحتاج اعتماد قائد الحادث — لا يتحرك قبله.', 'The robot is ready at the entrance. Sending it in needs the incident commander\'s approval — it does not move before.'))));
      kc.appendChild(h('div', { class: 'rl-btns' }, btn('btn btn-primary btn-sm', 'check', 'اعتماد', 'Approve', function () { doApprove(); paintAll(); }, { id: 'rl-key-approve' })));
    }
    kc.hidden = !showKey;
    UI.tabDot && (UI.tabDot.hidden = !showKey);
  }
  function paintSteps() {
    var rs = $$('li', UI.steps), firstUndone = true, hero = LAB.presetId === 'fire-night-robot';
    rs.forEach(function (li) {
      var id = li.getAttribute('data-id'); if (id === 'hero') li.hidden = !hero;
      var done = stepDone(id); li.classList.toggle('done', done); var cur = !done && firstUndone && !li.hidden; li.classList.toggle('cur', cur); if (!done && !li.hidden) firstUndone = false;
      $('.rl-sdot', li).textContent = done ? '✓' : String(rs.indexOf(li) + 1);
    });
  }
  function paintSummary() {
    var sim = LAB.sim, snap = LAB.snap; if (!sim || !snap) return; var sec = Math.floor(sim.t / 3);
    if (UI.summary._k === sec + lang() + LAB.sel) return; UI.summary._k = sec + lang() + LAB.sel;
    var r = selRobot(), hc = LAB.hc;
    setText(UI.summary, 'T+' + mmss(sim.t) + '. ' + (r ? LL(r.name) + ': ' + stateName(r.state) + ', ' + LL(r.pose.label) + ', ' + B('بطارية ', 'battery ') + N(pct(r.battery)) + '%. ' : '') + (hc ? N(hc.located || 0) + B(' عُثر عليهم بالروبوت، ', ' located by the robot, ') + N(hc.unaccounted) + B(' غير محسوبين. ', ' unaccounted. ') : '') + B('الحريق في الغرفة ', 'The fire is in room ') + roomOfFire() + '.');
  }
  function roomOfFire() { var sim = LAB.sim, g = LAB.g; try { var n = g.nodes[sim.hz.originLocal]; return n && n.room ? n.room : (n ? n.id : '?'); } catch (e) { return '?'; } }
  function paintTabs() {
    if (!UI.sheet) return; var fc = LAB.snap && LAB.snap.robot ? LAB.snap.robot.finds.length : 0, n = $('.rl-tabn', UI.sheet.tabs.finds); if (n) setText(n, N(fc)); UI.tabDot = $('.rl-tabdot', UI.sheet.tabs.controls);
  }
  function paintAll(force) {
    if (!LAB.sim || !UI.console) return;
    if (UI.struct !== LAB.struct) rebuildForStruct();
    paintToolbar(); paintFloorTabs(); paintKey(); paintBanner(); paintSteps(); paintTabs(); paintPriority(); paintDoors(); paintEyeHud(); paintFinds(); paintCount(); paintLog(); paintSpeech(); paintSummary(); paintMsgAge();
    var u = UI.preset; if (u && u.value !== LAB.presetId) u.value = LAB.presetId;
    var bl = Sim.PRESETS[LAB.presetId]; if (bl) setText(UI.blurb, LL(bl.blurb));
    if (UI.seed && doc.activeElement !== UI.seed) UI.seed.value = String(LAB.seed);
    if (UI.units) { UI.units.setValue(LAB.units); UI.variant.setValue(LAB.variant); UI.carrier.setValue(paramNow('robotCarrier') ? 1 : 0); UI.tools.setValue(LAB.tool); UI.speed.setValue(LAB.speed); }
    if (UI.gCard && (force || (UI.gCard.offsetParent !== null))) paintCard(!!force);
    if (EYE.cvs) setAttr(EYE.cvs, 'aria-label', EYE.summary || B('منظر عين الروبوت', 'Robot-eye view'));
    paintToolHint();
    DIRTY.ui = false;
  }
  function paintMsgAge() { if (LAB.msg && LAB.msg.ok && now() - LAB.msgAt > 9000) { LAB.msg = null; paintMsg(); } paintMsg(); }

  /* ---- the story: one click, the whole flow (a simulated commander approves for you) ---- */
  function startStory() {
    LAB.role = 'commander'; LAB.speed = 4; LAB.storyOn = true; LAB.storyDone = {}; LAB.playing = false;
    restart(); UI.role.setValue('commander'); UI.speed.setValue(4);
    LAB.playing = true; LAB.started = true; LAB.lastFrame = 0; if (UI.startCard) UI.startCard.hidden = true; setPlayUI();
    Manara.toast({ ar: 'القصة تعمل بسرعة 4×: ستعتمد أنت (كقائد حادث محاكى) عند ظهور الطلب.', en: 'The story runs at 4×: you act as a simulated incident commander and approve when the request appears.' }, 'safe', 4800);
  }
  function storyTick() {
    if (!LAB.storyOn || !LAB.sim) return;
    var rs = robotsOf(), sim = LAB.sim, snap = LAB.snap;
    rs.forEach(function (r) { if (r.state === 'stowed' && r.approval.status === 'requested' && sim.t >= r.approval.requestedAt + 5 && !LAB.storyDone['approve' + r.id]) { LAB.storyDone['approve' + r.id] = 1; doApprove(); } });
    if (snap && snap.robot && snap.robot.finds.some(function (f) { return f.key === 'abu-salem'; }) && !LAB.storyDone.hero) { LAB.storyDone.hero = 1; LAB.storyOn = false; LAB.playing = false; setPlayUI(); announce(B('عُثر على أبو سالم. القصة متوقفة مؤقتاً؛ استكشف.', 'Abu Salem was found. The story is paused; explore.')); }
  }

  var uiAt = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (doc.hidden || !LAB.sim) { LAB.lastFrame = 0; return; }
    var dt = LAB.lastFrame ? Math.min(0.1, (ts - LAB.lastFrame) / 1000) : 0; LAB.lastFrame = ts;
    if (!RM.matches) LAB.anim += dt;
    if (LAB.playing && !LAB.sim.done) {
      var t0 = LAB.sim.t; Sim.step(LAB.sim, dt * LAB.speed);
      if (LAB.sim.t !== t0) { afterTick(); storyTick(); }
      if (LAB.sim.done) { LAB.playing = false; setPlayUI(); }
    }
    if (!RM.matches && LAB.playing) DIRTY.stage = true;
    if (DIRTY.stage) { DIRTY.stage = false; drawStage(); }
    if (DIRTY.eye) { DIRTY.eye = false; paintEyeNow(); }
    if (DIRTY.ui && ts - uiAt > 150) { uiAt = ts; paintAll(); }
  }

  function onLang() {
    relabel(); fillPresetOptions(); fillSensOptions(); relabelDrawer(); paintLangNote(); buildFloorTabs(); paintStaticTexts();
    UI.fleet._sig = null; UI.prioList._sig = null; UI.prioNext._t = undefined; UI.doorList._sig = null; UI.findsList._sig = null; UI.blockedList._sig = null; UI.hcBar._sig = null; speechSig = '';
    UI.keyCard.hidden = true; UI.cardBody._lang = null; EYE.byT = -1; R.fitKey = R.fitKey + 'x'; rebuildLog();
    if (AB.results) renderAB(AB.results); var e1 = UI.sensRun; $('#rl-ab-used') && setText($('#rl-ab-used'), abUsedText());
    var L2 = $('#rl-contrast'); if (L2) L2._key = ''; paintLimits();
    setCls(UI.assumeBtn, 'x', false);
    DIRTY.stage = DIRTY.eye = DIRTY.ui = true; paintAll(true);
  }
  function paintStaticTexts() { /* text that is not bilingual-spans: the drawer heading count etc. */ }
  function onTheme() { readColors(); var b = $('#rl-contrast'); if (b) b._key = ''; paintLimits(); DIRTY.stage = DIRTY.eye = true; }

  function init() {
    readColors();
    var sayl = Manara.store('manara-robot-sayl'), eye = Manara.store('manara-robot-eye'); if (eye === 'thermal') LAB.eye = 'thermal';
    LAB.speed = 1;
    newRun();
    buildConsole();
    buildDrawer(); buildAB(); buildSens(); paintLimits();
    $$('[data-act=try-wheeled]').forEach(function (b) { b.addEventListener('click', function () { LAB.variant = 'wheeled'; restart(); var c = $('#rl'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); Manara.toast({ ar: 'الروبوت الآن بعجلات: لن يصعد إلى الطوابق العليا.', en: 'The robot is now wheeled: it will not climb to the upper floors.' }, 'warn', 5200); }); });
    window.addEventListener('langchange', onLang); window.addEventListener('themechange', onTheme);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { resizeStage(); resizeEye(); }) : null;
    if (ro) { ro.observe(UI.stage); ro.observe(EYE.cvs.parentNode); } else window.addEventListener('resize', function () { resizeStage(); resizeEye(); });
    resizeStage(); resizeEye(); paintAll(true); rebuildLog(); setPlayUI();
    root.setAttribute('data-ready', '1');
    requestAnimationFrame(frame);
  }

  /* ---- a small automation API (tests, demos): not part of the product UI ---- */
  window.RobotLab = {
    get sim() { return LAB.sim; }, get snap() { return LAB.snap; }, get state() { return LAB; }, get ab() { return AB; },
    advance: function (sec) { var n = advance(sec); resizeStage(); resizeEye(); drawStage(); paintEyeNow(); paintAll(true); rebuildLogIfNeeded(); return LAB.sim.t; },
    restart: function (o) { restart(o); return LAB.sim.t; },
    play: function () { if (!LAB.playing) togglePlay(); }, pause: function () { if (LAB.playing) togglePlay(); },
    setRole: function (r) { doRole(r); paintAll(true); },
    story: startStory, setParam: setParamUI, runAB: runAB, runSens: runSens, params: function () { return LAB.params; },
    hit: function (type, id) { var hh = findHit(type, id); return hh ? { x: hh.x, y: hh.y, rect: hh.rect || null } : null; }, cam: function () { return { x: R.cam.x, y: R.cam.y, k: R.cam.k, fit: R.cam.fit }; }, popOpen: function () { return !UI.pop.hidden; }
  };
  function rebuildLogIfNeeded() { paintLog(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
