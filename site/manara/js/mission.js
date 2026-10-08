/* MANARA («منارة») — Mission Control («غرفة العمليات»)  →  js/mission.js   (window.MissionControl is a small test/automation API)
 * ==========================================================================================
 * The operator console and the heart of the demo (Sense → Prove → Reach → GUIDE → Count → Hand off).
 * A classic script (no modules, no fetch, works from file:// and offline). It drives ONE ManaraSim run, draws it on a canvas
 * (neighbourhood map ⇄ building cut-away), and renders the operator panels around it:
 *   Proof-before-panic (two keys + human approval), Alert composer + wake-up ladder, Headcount, Hand-off (CAP 1.2),
 *   Dispatch (the FASTEST unit given simulated traffic, never "the nearest" by distance), event log, A/B (same seed) and the
 *   assumption sliders.  EVERYTHING on this page is a SIMULATION (SIM): a mechanism check, not proof of real-world impact;
 *   every unit, hospital and road is FICTIONAL; 999 stays the dispatcher.
 *
 * DETERMINISM / SCRUBBING   The sim is seeded and deterministic. Every operator action is recorded with its sim time
 *   (MC.actions). Rewinding restores the nearest checkpoint (a structuredClone of the sim taken every few sim seconds, with the
 *   shared immutable world detached) and replays the recorded actions, so "same seed + same actions" always gives the same run.
 * BUS   out: 'alert' + 'alert-update' (every ~2 s) for the four demo residents (extra fields personKey + room), 'dispatch',
 *       'alert-clear'.   in: 'citizen' (ack / safe / help), 'detection' (Evidence Lab → vision key), twin-board check-ins.
 * LAWS  logical CSS only; every string bilingual (data-l spans or B(ar,en)); colours from tokens read with getComputedStyle,
 *       redrawn on 'themechange'; never innerHTML with bus/user text (textContent / DOM only); prefers-reduced-motion respected.
 * ========================================================================================== */
(function () {
  'use strict';
  var Manara = window.Manara, Sim = window.ManaraSim, MSG = window.MANARA_MSG || null;
  var main = document.getElementById('main');
  if (!Manara || !Sim || !main) { return; }
  var doc = document, htmlEl = doc.documentElement;
  var NS_SVG = 'http://www.w3.org/2000/svg';
  var RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

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
  function mmss(sec) { if (!isNum(sec)) return '–'; sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(hour) { var h = Math.floor(hour) % 24, m = Math.round((hour - Math.floor(hour)) * 60); if (m === 60) { m = 0; h = (h + 1) % 24; } return pad2(h) + ':' + pad2(m); }
  function fmtDist(m) { if (!isNum(m)) return '–'; return m >= 1000 ? N(m / 1000, 1) + ' ' + B('كم', 'km') : N(Math.round(m / 10) * 10) + ' ' + B('م', 'm'); }
  function T(ar, en) { return { ar: ar, en: en }; }
  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setCls(el, cls, on) { if (el) el.classList.toggle(cls, !!on); }
  function setAttr(el, k, v) { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

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
  // extra icons that core.js does not have (static authored SVG paths)
  var XICON = {
    gas: '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="8" r="3"/><circle cx="14" cy="16" r="4.5"/><path d="M4 20h2M18 20h2"/>',
    flood: '<path d="M2 8c2.5 0 2.5-2 5-2s2.500 2 5 2 2.500-2 5-2 2.500 2 5 2M2 13c2.500 0 2.500-2 5-2s2.500 2 5 2 2.500-2 5-2 2.500 2 5 2M2 18c2.500 0 2.500-2 5-2s2.500 2 5 2 2.500-2 5-2 2.500 2 5 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.500-2"/>',
    ambulance: '<rect x="2" y="7" width="14" height="10" rx="2"/><path d="M16 10h3.500l2.500 3v4h-6"/><circle cx="7" cy="18" r="1.800"/><circle cx="18" cy="18" r="1.800"/><path d="M9 9.500v4M7 11.500h4"/>',
    hospital: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
    police: '<path d="M12 2l8 3v6c0 5-3.500 9-8 11-4.500-2-8-6-8-11V5z"/><path d="M12 8v5M12 16h.01"/>',
    rescue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.600 5.600l3.200 3.200M15.200 15.200l3.200 3.200M18.400 5.600l-3.200 3.200M8.800 15.200l-3.200 3.200"/>',
    car: '<path d="M3 13l2-5h14l2 5v5H3z"/><circle cx="7.500" cy="18" r="1.800"/><circle cx="16.500" cy="18" r="1.800"/>',
    layers2: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.500-4.500M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.500-4.500M8 11h6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    present: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
    usb: '<circle cx="12" cy="18" r="2"/><path d="M12 16V4M9 7l3-3 3 3M7 10v3a2 2 0 0 0 2 2h3M17 10v2a2 2 0 0 1-2 2h-3"/>'
  };
  function xic(name, cls) {
    var s = sv('svg', { 'class': 'i' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
    var t = doc.createElement('template'); t.innerHTML = '<svg xmlns="' + NS_SVG + '">' + (XICON[name] || '') + '</svg>';
    var kids = t.content.firstChild.childNodes; while (kids.length) s.appendChild(kids[0]);
    return s;
  }
  function icon(name, cls) { return XICON[name] ? xic(name, cls) : ic(name, cls); }

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

  /* ====================================================================================
   * 2. DOMAIN CONSTANTS
   * ==================================================================================== */
  var HZ = {
    fire:  { icon: 'fire',   name: T('حريق ودخان', 'Fire & smoke'),       tok: '--fire-3' },
    gas:   { icon: 'gas',    name: T('تسرّب غاز', 'Gas leak'),            tok: '--warn' },
    flood: { icon: 'flood',  name: T('سيول وأمطار', 'Flash flood'),       tok: '--info' },
    dust:  { icon: 'wind',   name: T('عاصفة غبارية', 'Dust storm'),       tok: '--warn' },
    heat:  { icon: 'thermo', name: T('إجهاد حراري', 'Extreme heat'),     tok: '--brand' },
    sos:   { icon: 'heart',  name: T('شخص يحتاج مساعدة', 'Someone needs help'), tok: '--danger' }
  };
  var UNIT = {
    fire:      { icon: 'fire',      name: T('سيارة إطفاء', 'Fire engine'),       short: T('إطفاء', 'Fire'),      tok: '--fire-3' },
    rescue:    { icon: 'rescue',    name: T('فريق إنقاذ', 'Rescue team'),         short: T('إنقاذ', 'Rescue'),    tok: '--brand' },
    ambulance: { icon: 'ambulance', name: T('سيارة إسعاف', 'Ambulance'),          short: T('إسعاف', 'Ambulance'), tok: '--danger' },
    police:    { icon: 'police',    name: T('دورية شرطة', 'Police patrol'),       short: T('شرطة', 'Police'),     tok: '--info' },
    hospital:  { icon: 'hospital',  name: T('مستشفى', 'Hospital'),                short: T('مستشفى', 'Hospital'), tok: '--danger' }
  };
  var STATE_ORDER = ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'];
  var STATE_L = {
    'recommended': T('موصى بها', 'Recommended'), 'approved': T('معتمدة', 'Approved'), 'dispatched': T('أُرسلت', 'Dispatched'),
    'en-route': T('في الطريق', 'En route'), 'on-scene': T('في الموقع', 'On scene'), 'cleared': T('أنهت', 'Cleared')
  };
  var PHASES = ['suspect', 'confirmed', 'approve', 'public'];
  var PERSON_ST = {
    asleep:   { tok: '--info',   name: T('نائم', 'Asleep') },
    alerted:  { tok: '--warn',   name: T('نُبِّه', 'Alerted') },
    moving:   { tok: '--accent', name: T('يتحرك', 'Moving') },
    safe:     { tok: '--safe',   name: T('بأمان', 'Safe') },
    help:     { tok: '--danger', name: T('يحتاج مساعدة', 'Needs help') },
    unacc:    { tok: '--muted',  name: T('غير محسوب', 'Unaccounted') },
    calm:     { tok: '--ink-2',  name: T('عادي', 'Going about the day') }
  };
  var EXIT_STATE = {
    OPEN:   { tok: '--safe',   name: T('مفتوح', 'OPEN') },
    SMOKE:  { tok: '--warn',   name: T('دخان', 'SMOKE') },
    FIRE:   { tok: '--danger', name: T('نار', 'FIRE') },
    LOCKED: { tok: '--muted',  name: T('مقفل', 'LOCKED') }
  };
  var HERO = ['ravi', 'huda', 'abu-salem', 'lina'];
  var HERO_NAME = { ravi: T('رافي', 'Ravi'), huda: T('هدى', 'Huda'), 'abu-salem': T('أبو سالم', 'Abu Salem'), lina: T('لينا', 'Lina') };
  var LANG_NAME = { ar: 'العربية', en: 'English', ml: 'മലയാളം', ne: 'नेपाली', bn: 'বাংলা', ur: 'اردو', hi: 'हिन्दी', tl: 'Tagalog' };
  var LANG_DRAFT = { ml: 1, ne: 1, bn: 1, ur: 1, hi: 1, tl: 1 };
  var NEED_L = {
    wheelchair: T('كرسي متحرك', 'Wheelchair'), deaf: T('أصمّ', 'Deaf'), blind: T('كفيف', 'Blind'), elderly: T('مسنّ', 'Elderly'),
    child: T('طفل', 'Child'), asthma: T('ربو', 'Asthma')
  };
  // the two-key channel groups per hazard (labels are plain-language; thresholds/values come from the sim)
  var KEYS = {
    fire: [
      { g: 'thermal', name: T('كاميرا حرارية (MLX90640)', 'Thermal camera (MLX90640)'), why: T('بقعة ≥ 57°م أو ارتفاع ≥ 8.3°م/د (S58)', 'hotspot ≥ 57 °C or rise ≥ 8.3 °C/min (S58)'), ind: T('الحرارة', 'heat') },
      { g: 'smoke', name: T('حسّاس دخان (MQ-2)', 'Smoke sensor (MQ-2)'), why: T('فوق خط الأساس + 3σ', 'above baseline + 3σ'), ind: T('الدخان', 'smoke') },
      { g: 'vision', name: T('رؤية حاسوبية بقواعد', 'Rule-based computer vision'), why: T('ليست ذكاءً اصطناعيًا — لا تنذر وحدها', 'not AI — can never alert alone'), ind: T('الكاميرا', 'camera') }
    ],
    gas: [
      { g: 'g-store', name: T('حسّاس غاز — مخزن الغاز', 'Gas sensor — LPG store'), why: T('قراءة أولى', 'first reading'), ind: T('موقع 1', 'place 1') },
      { g: 'g-forecourt', name: T('حسّاس غاز — ساحة السكن', 'Gas sensor — residence forecourt'), why: T('قراءة ثانية في مكان آخر', 'second reading, other place'), ind: T('موقع 2', 'place 2') },
      { g: 'g-lobby', name: T('حسّاس غاز — بهو السكن', 'Gas sensor — residence lobby'), why: T('داخل المبنى', 'inside the building'), ind: T('موقع 3', 'place 3') }
    ],
    flood: [
      { g: 'water-1', name: T('منسوب الماء — وسط النفق', 'Water level — underpass middle'), why: T('≥ 15 سم (S55)', '≥ 15 cm (S55)'), ind: T('ماء 1', 'water 1') },
      { g: 'water-2', name: T('منسوب الماء — المنحدر الشمالي', 'Water level — north ramp'), why: T('موقع ثانٍ', 'second spot'), ind: T('ماء 2', 'water 2') },
      { g: 'rain', name: T('مقياس المطر (السطح)', 'Rain gauge (roof)'), why: T('شدة المطر', 'rain intensity'), ind: T('مطر', 'rain') },
      { g: 'qmd', name: T('تحذير الأرصاد (تغذية SIM)', 'Met-office warning (SIM feed)'), why: T('مصدر رسمي', 'official source'), ind: T('رسمي', 'official') }
    ],
    dust: [
      { g: 'pm', name: T('مراقب PM10 (SIM)', 'PM10 monitor (SIM)'), why: T('≥ 150 µg/m³ (S31)', '≥ 150 µg/m³ (S31)'), ind: T('جسيمات', 'particles') },
      { g: 'vis', name: T('كاميرا الرؤية', 'Visibility camera'), why: T('هبوط الرؤية', 'visibility drop'), ind: T('الكاميرا', 'camera') },
      { g: 'qmd', name: T('تحذير الأرصاد (تغذية SIM)', 'Met-office warning (SIM feed)'), why: T('مصدر رسمي', 'official source'), ind: T('رسمي', 'official') }
    ],
    heat: [
      { g: 'wbgt', name: T('WBGT في موقع العمل', 'WBGT at the worksite'), why: T('خط التوقف القانوني 32.1°م (S19)', 'legal stop line 32.1 °C (S19)'), ind: T('قياس', 'measurement') },
      { g: 'rule', name: T('قاعدة ساعات العمل (التقويم)', 'Work-hours rule (calendar)'), why: T('مفتاح مستقل عن الحسّاسات (S18)', 'independent of sensors (S18)'), ind: T('تقويم', 'calendar') }
    ],
    sos: [
      { g: 'button', name: T('زر الاستغاثة / مستشعر السقوط', 'SOS button / fall sensor'), why: T('اصطدام ثم سكون', 'impact then stillness'), ind: T('الشخص', 'the person') },
      { g: 'ack', name: T('لا ردّ على مكالمة الاطمئنان', 'No answer to the check-in call'), why: T('30 ثانية', '30 s'), ind: T('الاتصال', 'the call') }
    ]
  };
  var SIM_SHORT = T('محاكاة (SIM)', 'SIM');
  var FICTIONAL = T('وحدات وهمية', 'FICTIONAL units');

  /* ====================================================================================
   * 3. STATE
   * ==================================================================================== */
  var WI = Sim.worldInfo();
  var GRID = { w: WI.w, h: WI.h };
  var FRAME = { x: -7, y: -7, w: WI.w + 14, h: WI.h + 14 };   // the map plus a margin for the responders at the map edge
  var MC = {
    preset: 'fire-night', seed: 7, params: {}, origin: null, autoApprove: false,
    sim: null, snap: null, hc: null, W: WI,
    playing: true, speed: 4, debt: 0, last: 0, seekTarget: null, seeking: false,
    actions: [], ai: 0, cps: [], cpEvery: 20, maxT: 0, ended: false,
    log: { simIdx: 0, actIdx: 0, rows: [], filter: 'all', person: 'all', dirty: true },
    view: 'map', bStruct: 0,
    layers: { hazard: true, traffic: true, routes: true, people: true, units: true, sensors: true, labels: true },
    tool: 'inspect', sel: null, present: false,
    detection: null, linkCamera: true, twin: null,
    prev: {}, busLast: 0, alertSent: false, dispatchSig: '', banner: null,
    uiEvents: [], panelsDirty: true, lastPanel: 0, drawDirty: true,
    abBusy: false, ab: null, runs: null,
    hoverId: null, tipEl: null
  };

  function simNow() { return MC.sim ? MC.sim.t : 0; }
  function presetBase(id) { return String(id).split('@')[0]; }
  function presetInfo(id) { return Sim.PRESETS[presetBase(id)] || Sim.PRESETS['fire-night']; }

  /* ====================================================================================
   * 4. SIM CONTROL — create, record every operator action, checkpoints, seek, stepping
   * ==================================================================================== */
  var HAS_CLONE = typeof structuredClone === 'function';
  function cloneSim(sim) {             // the world (immutable, holds functions) is shared; everything else is copied
    var W = sim.W, c; sim.W = null;
    try { c = structuredClone(sim); } finally { sim.W = W; }
    c.W = W; return c;
  }
  // The engine has no "origin" option yet: a fire starts in preset.room. A derived preset (a copy with another room) in the exported
  // registry ManaraSim.PRESETS gives the same effect without touching sim.js (reported as a wish for sim.js).
  function originPresetId(base, origin) {
    if (!origin || !origin.room) return base;
    var bp = Sim.PRESETS[base]; if (!bp || bp.hazard !== 'fire') return base;
    var id = base + '@' + origin.room;
    if (!Sim.PRESETS[id]) {
      var p = {}; for (var k in bp) p[k] = bp[k];
      p.id = id; p.room = origin.room; Sim.PRESETS[id] = p;
    }
    return id;
  }
  function newSim() {
    return Sim.create({ preset: originPresetId(MC.preset, MC.origin), seed: MC.seed, params: MC.params, autoApprove: MC.autoApprove });
  }
  function addCheckpoint() {
    var sim = MC.sim;
    if (!HAS_CLONE || !sim) return;
    var last = MC.cps[MC.cps.length - 1];
    if (last && last.t >= sim.t) return;
    try { MC.cps.push({ t: sim.t, ai: MC.ai, sim: cloneSim(sim) }); } catch (e) { HAS_CLONE = false; }
  }
  function applyAction(sim, a) {
    switch (a.op) {
      case 'approve': Sim.approve(sim); break;
      case 'reject': Sim.reject(sim, a.sec || 120); break;
      case 'exit': Sim.setExit(sim, a.id, { locked: !!a.locked }); break;
      case 'wind': Sim.setWind(sim, { deg: a.deg, speed: a.speed }); break;
      case 'traffic': Sim.setTraffic(sim, a.load); break;
      case 'hour': Sim.setHour(sim, a.hour); break;
      case 'jam': Sim.jamRoad(sim, a.seg, a.factor); break;
      case 'unjam': Sim.unjamRoad(sim, a.seg); break;
      case 'close': Sim.closeRoad(sim, a.seg, true); break;
      case 'open': Sim.closeRoad(sim, a.seg, false); break;
      case 'busy': Sim.setUnitBusy(sim, a.asset, a.busy, a.kind); break;
      case 'beds': Sim.setHospital(sim, a.id, { freeBeds: a.beds }); break;
      case 'inject': Sim.injectKey(sim, a.ch, a.add, a.sec); break;
      case 'decoy': Sim.injectDecoy(sim, a.kind, a.sec); break;
      case 'checkin': Sim.checkin(sim, a.key, a.status); break;
      case 'trigger': Sim.trigger(sim); break;
      case 'param': Sim.setParam(sim, a.key, a.value); break;
      default: break;   // 'note' and unknown ops only appear in the log
    }
  }
  function applyPending(sim) {
    while (MC.ai < MC.actions.length && MC.actions[MC.ai].t <= sim.t) { applyAction(sim, MC.actions[MC.ai]); MC.ai++; }
  }
  // a NEW operator action at the current sim time. It replaces any not-yet-replayed future (a branch).
  function act(op, args) {
    var sim = MC.sim; if (!sim) return false;
    var a = { op: op, t: sim.t }; for (var k in args) a[k] = args[k];
    if (MC.ai < MC.actions.length) {
      MC.actions.length = MC.ai;
      MC.cps = MC.cps.filter(function (c) { return c.t <= sim.t; });
      MC.maxT = sim.t;
    }
    MC.actions.push(a);
    applyAction(sim, a); MC.ai = MC.actions.length;
    MC.log.dirty = true; afterTicks();
    return true;
  }
  function stepOnce() {
    var sim = MC.sim;
    applyPending(sim);
    Sim.step(sim, 1);
    if (sim.t > MC.maxT) MC.maxT = sim.t;
    if (sim.t % MC.cpEvery === 0) addCheckpoint();
  }
  function restoreFor(t) {
    var best = null;
    for (var i = 0; i < MC.cps.length; i++) if (MC.cps[i].t <= t) best = MC.cps[i];
    if (best) { MC.sim = cloneSim(best.sim); MC.ai = best.ai; }
    else { MC.sim = newSim(); MC.ai = 0; }
    MC.ended = false;
    MC.log.dirty = true; MC.evScan = MC.sim.events.length;
  }
  function seekTo(t) {
    var sim = MC.sim; if (!sim) return;
    t = clamp(Math.round(t), 0, sim.durationSec);
    if (t < sim.t) restoreFor(t);
    MC.seekTarget = t; MC.playing = false; MC.ended = false;
    syncPlayUI();
    if (MC.sim.t >= t) { MC.seekTarget = null; afterTicks(); }
  }
  // synchronous fast-forward (used by tests, scenario fast-forward and the "jump to" buttons)
  function advance(sec) {
    var n = Math.max(0, Math.round(sec)), sim = MC.sim;
    for (var i = 0; i < n && !sim.done; i++) stepOnce();
    afterTicks();
    return sim.t;
  }

  /* run lifecycle */
  function startRun(o) {
    o = o || {};
    if (o.preset && Sim.PRESETS[presetBase(o.preset)]) { if (presetBase(o.preset) !== MC.preset) MC.origin = null; MC.preset = presetBase(o.preset); }
    if (o.seed != null && isFinite(+o.seed)) MC.seed = Math.max(1, Math.floor(+o.seed) >>> 0) || 1;
    if (o.origin !== undefined) MC.origin = o.origin;
    if (o.params) MC.params = o.params;
    if (o.autoApprove != null) MC.autoApprove = !!o.autoApprove;
    busClear();
    MC.sim = newSim();
    MC.actions = []; MC.ai = 0; MC.cps = []; MC.maxT = 0; MC.ended = false; MC.debt = 0; MC.seekTarget = null;
    MC.cpEvery = Math.max(10, Math.ceil(MC.sim.durationSec / 60 / 5) * 5);
    addCheckpoint();
    MC.prev = {}; MC.banner = null; MC.sel = null; MC.evScan = MC.sim.events.length; MC.log.dirty = true;
    MC.alertSent = false; MC.dispatchSig = ''; MC.busLast = 0; MC.ab = null;
    MC.buildFor = null; setProofOpen(true);
    if (o.keepCamera !== true) MC.camReset = true;
    afterTicks();
    updateHash();
    if (typeof onRunStarted === 'function') onRunStarted();
    if (UI.hudClock) refreshAll();
    return MC.sim;
  }

  /* ---- after-tick bookkeeping: snapshot, transitions, bus ---- */
  function afterTicks() {
    var sim = MC.sim; if (!sim) return;
    MC.snap = Sim.snapshot(sim, { sensors: true, events: false });
    MC.fieldsDirty = true; MC.drawDirty = true; MC.panelsDirty = true;
    detectTransitions();
    busSync(false);
    if (sim.done && !MC.ended) { MC.ended = true; MC.playing = false; syncPlayUI(); announce(B('انتهى التشغيل', 'The run has ended')); }
  }
  function announce(text) { var a = $('#mc-announce'); if (a) { a.textContent = ''; setTimeout(function () { a.textContent = text; }, 30); } }

  var PHASE_NOTE = {
    suspect: T('اشتباه: مفتاح واحد نشط فقط — لا يكفي لأي إنذار عام.', 'SUSPECT: one key only — never enough for a public alert.'),
    confirmed: T('مؤكَّد: مفتاحان مستقلان. بانتظار موافقتك (المفتاح البشري).', 'CONFIRMED: two independent keys. Waiting for your approval (the human key).'),
    public: T('أُرسل التنبيه العام — الهواتف تتلقى رسالتها الآن.', 'Public alert sent — phones are receiving their personal messages.')
  };
  function detectTransitions() {
    var sim = MC.sim, s = MC.snap, p = MC.prev, v = s.verification, cur = {};
    cur.phase = v.phase; cur.local = !!s.localAlarm.on; cur.plan = s.dispatch ? s.dispatch.state : '';
    cur.exits = s.exits.map(function (e) { return e.struct + '.' + e.id + ':' + e.state; }).join(',');
    cur.hazard = !!(sim.hz && sim.hz.started);
    if (p.phase !== undefined) {
      if (cur.phase !== p.phase && PHASE_NOTE[cur.phase]) {
        announce(LL(PHASE_NOTE[cur.phase]));
        if (cur.phase === 'public' && MC.layout === 'wide') setProofOpen(false);
      }
      if (cur.phase !== 'public' && p.phase === 'public') setProofOpen(true);
      if (cur.local && !p.local) announce(B('انطلق الإنذار المحلي — لا ينتظر شبكة ولا إنسانًا', 'The local alarm sounded — it never waits for a network or a person'));
      if (cur.exits !== p.exits && p.exits) {
        s.exits.forEach(function (e) {
          var was = (p.exits.split(',').filter(function (x) { return x.indexOf(e.struct + '.' + e.id + ':') === 0; })[0] || '').split(':')[1];
          if (was && was !== e.state) announce(B('المخرج «' + LL(e.name) + '»: ' + LL(EXIT_STATE[e.state].name), 'Exit "' + LL(e.name) + '": ' + e.state));
        });
      }
    }
    // events that open the re-dispatch banner (only new ones)
    var ev = sim.events, i = MC.evScan == null ? ev.length : Math.min(MC.evScan, ev.length);
    for (; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'redispatch' || e.type === 'far-but-faster' || e.type === 'recommendation-change') {
        MC.banner = { type: e.type, t: e.t, text: e.text, reason: e.reason || null, gainSec: e.gainSec || null, kind: e.kind || null };
        if (e.type === 'redispatch') announce(LL(e.text));   // the HUD banner shows it; no toast on top of the map
      }
      if (e.type === 'public-alert') MC.alertAt = e.t;
    }
    MC.evScan = ev.length;
    if (MC.banner && sim.t - MC.banner.t > 40) MC.banner = null;
    MC.prev = cur;
  }

  /* ---- URL hash (scenario + seed + a few view options) ---- */
  function parseHash() {
    var o = {}, hs = (location.hash || '').replace(/^#/, '');
    if (!hs) return o;
    hs.split('&').forEach(function (kv) {
      var p = kv.split('='); if (p.length < 2) return;
      var k = decodeURIComponent(p[0]), v = decodeURIComponent(p.slice(1).join('='));
      if (k === 'scenario' || k === 's') o.preset = v; else if (k === 'seed') o.seed = +v; else if (k === 'room') o.room = v;
      else if (k === 'speed') o.speed = +v; else if (k === 'view') o.view = v; else if (k === 't') o.t = +v; else if (k === 'present') o.present = v === '1';
    });
    return o;
  }
  function hashString() {
    var q = ['scenario=' + encodeURIComponent(MC.preset), 'seed=' + MC.seed];
    if (MC.origin && MC.origin.room) q.push('room=' + encodeURIComponent(MC.origin.room));
    if (MC.speed !== 4) q.push('speed=' + MC.speed);
    if (MC.view === 'building') q.push('view=building');
    return '#' + q.join('&');
  }
  function shareURL() { return location.href.split('#')[0] + hashString(); }
  function updateHash() { try { history.replaceState(null, '', hashString()); } catch (e) { /* file:// sandbox */ } }

  /* ====================================================================================
   * 5. RENDERER — one canvas: neighbourhood map ⇄ building cut-away. Colours come from the tokens (getComputedStyle),
   *    redrawn on 'themechange'. World coordinates are sim cells (1 cell = 5 m, north-up); icons and text are in screen pixels.
   * ==================================================================================== */
  var R = {
    cvs: $('#mc-canvas'), ctx: null, dpr: 1, w: 320, h: 240, col: {}, font: 'system-ui, sans-serif', mono: 'monospace',
    cam: { map: { x: 48, y: 32, k: 6, fit: 6 }, bld: { x: 6, y: 5, k: 20, fit: 20 } },
    geo: null, fields: null, hits: [], anim: 0, bl: null, routes: {}, routesT: -1
  };
  var TOKS = ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'head', 'brand', 'accent', 'safe', 'warn', 'danger', 'info', 'fire-1', 'fire-2', 'fire-3'];
  function readColors() {
    var cs = getComputedStyle(htmlEl);
    TOKS.forEach(function (t) { R.col[t] = parseColor(cs.getPropertyValue('--' + t)); });
    var bf = getComputedStyle(doc.body).fontFamily; if (bf) R.font = bf;
    var mf = cs.getPropertyValue('--font-m'); if (mf) R.mono = mf;
  }
  function C(n) { return R.col[n] || [128, 128, 128]; }
  function tokColor(tok) { return C(String(tok).replace(/^--/, '')); }
  function isDark() { return htmlEl.dataset.theme === 'dark'; }

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function inWorld(ox, oy, k, fn) { var d = R.dpr, c = R.ctx; c.save(); c.setTransform(d * k, 0, 0, d * k, d * ox, d * oy); fn(c); c.restore(); }
  function inScreen(fn) { var d = R.dpr, c = R.ctx; c.save(); c.setTransform(d, 0, 0, d, 0, 0); fn(c); c.restore(); }
  // centred label kept inside the canvas. While a frame is being drawn (R.lq is an array) labels are queued with a priority and
  // flushed at the end by flushLabels(), which drops the ones that would overlap a more important label (names stay in the inspector).
  function haloLabel(ctx, s, x, y, color, halo, w, prio) {
    var tw = ctx.measureText(s).width; x = clamp(x, tw / 2 + 4, Math.max(tw / 2 + 4, R.w - tw / 2 - 4));
    if (R.lq) { R.lq.push({ s: s, x: x, y: y, tw: tw, color: color, halo: halo, w: w, font: ctx.font, dir: ctx.direction, prio: prio || 0, n: R.lq.length }); return; }
    ctx.textAlign = 'center'; haloText(ctx, s, x, y, color, halo, w);
  }
  function flushLabels() {
    var q = R.lq, ctx = R.ctx; R.lq = null; if (!q || !q.length) return;
    q.sort(function (a, b) { return b.prio - a.prio || a.n - b.n; });
    var placed = [];
    function hit(r) { for (var i = 0; i < placed.length; i++) { var p = placed[i]; if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) return true; } return false; }
    q.forEach(function (l) {
      var th = 14, tries = [0, -th, th, -2 * th, 2 * th], ok = null;
      for (var i = 0; i < tries.length && !ok; i++) {
        var y = l.y + tries[i], r = [l.x - l.tw / 2 - 2, y - th / 2, l.x + l.tw / 2 + 2, y + th / 2];
        if (y < th / 2 || y > R.h - th / 2) continue;
        if (!hit(r)) ok = { r: r, y: y };
      }
      if (!ok) return;
      placed.push(ok.r);
      ctx.save(); ctx.font = l.font; ctx.direction = l.dir; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; haloText(ctx, l.s, l.x, ok.y, l.color, l.halo, l.w); ctx.restore();
    });
  }
  function haloText(ctx, s, x, y, color, halo, w) {
    ctx.lineJoin = 'round'; ctx.lineWidth = w || 3; ctx.strokeStyle = halo; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  /* ---- static geometry (built once): row-run Path2D per land use, building boxes ---- */
  function buildGeometry() {
    var w = WI.w, h = WI.h, kind = WI.kind, bld = WI.building, G = { road: new Path2D(), park: new Path2D(), yard: new Path2D(), site: new Path2D(), bpath: {}, bbox: {} };
    function runs(match, path) {
      for (var y = 0; y < h; y++) {
        var x = 0;
        while (x < w) {
          if (match(y * w + x)) { var x0 = x; while (x < w && match(y * w + x)) x++; path.rect(x0 - 0.03, y - 0.03, x - x0 + 0.06, 1.06); }
          else x++;
        }
      }
    }
    runs(function (i) { return kind[i] === 1 && !bld[i]; }, G.road);
    runs(function (i) { return kind[i] === 3 && !bld[i]; }, G.park);
    runs(function (i) { return kind[i] === 4 && !bld[i]; }, G.yard);
    runs(function (i) { return kind[i] === 5 && !bld[i]; }, G.site);
    for (var b = 1; b < WI.buildings.length; b++) {
      var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (var i = 0; i < bld.length; i++) if (bld[i] === b) { var cx = i % w, cy = (i / w) | 0; if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy; }
      if (x1 >= 0) G.bbox[WI.buildings[b].id] = { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1, name: WI.buildings[b].name, idx: b };
    }
    var nodeById = {}; WI.roads.nodes.forEach(function (n) { nodeById[n.id] = n; });
    G.nodeById = nodeById;
    G.segs = WI.roads.segs.map(function (s) { var a = nodeById[s.a], b = nodeById[s.b]; return { id: s.id, cls: s.cls, name: s.name, low: s.low, a: a, b: b, lenM: s.lenM }; });
    G.segById = {}; G.segs.forEach(function (s) { G.segById[s.id] = s; });
    // fields: 4 small offscreen canvases, drawn scaled with smoothing (soft plumes)
    R.fields = {};
    ['smoke', 'gas', 'water', 'dust'].forEach(function (n) {
      var c = doc.createElement('canvas'); c.width = w; c.height = h; var cx = c.getContext('2d'); R.fields[n] = { cvs: c, ctx: cx, img: cx.createImageData(w, h) };
    });
    R.geo = G;
  }
  // Liang–Barsky clip of a segment to the frame rectangle (the off-map access roads run far outside it)
  function clipFrame(ax, ay, bx, by) {
    var x0 = FRAME.x, y0 = FRAME.y, x1 = FRAME.x + FRAME.w, y1 = FRAME.y + FRAME.h, dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; }
      else { var r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
    }
    return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
  }

  /* ---- camera ---- */
  // room the HUD takes around the building cut-away: t/b = top and bottom bands, side = a column at the inline-end (wide stages only)
  function bPad() { return R.w >= 700 ? { t: 46, b: 52, side: 196, start: 0 } : { t: R.w >= 520 ? 50 : 92, b: 30, side: 0, start: 0 }; }
  function bLayout() {
    var si = MC.bStruct, S = WI.structs[si]; if (!S) return null;
    var floors = []; for (var f = 0; f < S.floors; f++) floors.push(f);
    var hasRoof = S.nodes.some(function (n) { return n.fl === S.floors; }); if (hasRoof) floors.push(S.floors);
    var pw = S.w + 2.4, ph = S.h + 2.9, best = null, pd = bPad();
    for (var cols = 1; cols <= floors.length; cols++) {
      var rows = Math.ceil(floors.length / cols), k = Math.min((R.w * 0.97 - pd.side - pd.start) / (cols * pw), Math.max(60, R.h - pd.t - pd.b) / (rows * ph));
      if (!best || k > best.k * 1.02) best = { cols: cols, rows: rows, k: k };
    }
    var order = floors.slice().reverse();                                    // top floor first (reading order)
    var panels = order.map(function (fl, i) { return { fl: fl, ox: (i % best.cols) * pw, oy: Math.floor(i / best.cols) * ph, pw: pw, ph: ph }; });
    return { si: si, S: S, panels: panels, w: best.cols * pw, h: best.rows * ph, k: best.k, pw: pw, ph: ph, hasRoof: hasRoof };
  }
  function fitView() {
    if (MC.view === 'map') {
      var k = Math.min(R.w / FRAME.w, R.h / FRAME.h) * 0.985;
      R.cam.map = { x: FRAME.x + FRAME.w / 2, y: FRAME.y + FRAME.h / 2, k: k, fit: k };
    } else {
      R.bl = bLayout(); if (!R.bl) return;
      var pd = bPad(), kk = R.bl.k, off = (htmlEl.dir === 'rtl' ? -1 : 1) * (pd.start - pd.side) / 2;   // the HUD sits at the inline-end, the legend at the inline-start
      R.cam.bld = { x: R.bl.w / 2 - off / kk, y: R.bl.h / 2 - (pd.t - pd.b) / (2 * kk), k: kk, fit: kk };
    }
    MC.drawDirty = true;
  }
  function camZoom(factor, sx, sy) {
    var cam = MC.view === 'map' ? R.cam.map : R.cam.bld, k0 = cam.k, k1 = clamp(k0 * factor, cam.fit * 0.7, cam.fit * (MC.view === 'map' ? 16 : 7));
    if (sx == null) { sx = R.w / 2; sy = R.h / 2; }
    var wx = (sx - R.w / 2) / k0 + cam.x, wy = (sy - R.h / 2) / k0 + cam.y;
    cam.k = k1; cam.x = wx - (sx - R.w / 2) / k1; cam.y = wy - (sy - R.h / 2) / k1;
    clampCam(); MC.drawDirty = true; updateScaleBar();
  }
  function camPan(dxPx, dyPx) { var cam = MC.view === 'map' ? R.cam.map : R.cam.bld; cam.x -= dxPx / cam.k; cam.y -= dyPx / cam.k; clampCam(); MC.drawDirty = true; }
  function clampCam() {
    var cam = MC.view === 'map' ? R.cam.map : R.cam.bld, b = MC.view === 'map' ? FRAME : { x: 0, y: 0, w: R.bl ? R.bl.w : 10, h: R.bl ? R.bl.h : 8 };
    cam.x = clamp(cam.x, b.x, b.x + b.w); cam.y = clamp(cam.y, b.y, b.y + b.h);
  }
  function focusIncident() {
    var sc = MC.snap && MC.snap.dispatch ? MC.snap.dispatch.scene : sceneOf(MC.sim);
    if (MC.view === 'building') { var rm = (MC.origin && MC.origin.room) || presetInfo(MC.preset).room; focusRoom(rm.replace(/^R/, '')); return; }
    if (sc) camFocus(sc.x, sc.y, R.cam.map.fit * 3);
  }
  function camFocus(x, y, k) {
    var cam = MC.view === 'map' ? R.cam.map : R.cam.bld; cam.x = x; cam.y = y; if (k) cam.k = clamp(k, cam.fit * 0.7, cam.fit * 16); clampCam(); MC.drawDirty = true; updateScaleBar();
  }
  // toasts dock inside the map area, under the HUD's first row (CSS reads these three variables)
  function placeToasts(r) {
    var rtl = htmlEl.dir === 'rtl', vw = htmlEl.clientWidth, w = Math.min(r.width - 20, 420), st = htmlEl.style;
    st.setProperty('--mc-toast-top', Math.round(r.top + 54) + 'px');
    st.setProperty('--mc-toast-x', Math.round((rtl ? vw - r.right : r.left) + 10) + 'px');
    st.setProperty('--mc-toast-w', Math.round(r.width - 20) + 'px');
  }
  function resizeCanvas() {
    var st = $('#mc-stage'); if (!st) return;
    var r = st.getBoundingClientRect(), w = Math.max(160, Math.floor(r.width)), h = Math.max(140, Math.floor(r.height));
    placeToasts(r);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === R.w && h === R.h && dpr === R.dpr && R.ctx) return;
    R.w = w; R.h = h; R.dpr = dpr;
    R.cvs.width = Math.round(w * dpr); R.cvs.height = Math.round(h * dpr);
    R.cvs.style.width = w + 'px'; R.cvs.style.height = h + 'px';
    st.classList.toggle('compact', h < 330 || w < 640); st.classList.toggle('tiny', h < 300);
    R.ctx = R.cvs.getContext('2d');
    var keep = R.camFitted;
    fitView(); R.camFitted = true;
    if (keep) { /* keep user's zoom only if they changed it; a resize re-fits for predictability */ }
    MC.drawDirty = true; updateScaleBar();
  }

  /* ---- hazard fields → ImageData ---- */
  function paintFields() {
    var sim = MC.sim, V = Sim.view(sim), hs = MC.snap.hazardState || {}, F = R.fields, n = WI.w * WI.h;
    function paint(name, arr, rgb, amax, norm, pow) {
      var f = F[name], d = f.img.data, i, v, a;
      for (i = 0; i < n; i++) {
        v = arr[i] / norm; if (v <= 0.004) { d[4 * i + 3] = 0; continue; }
        a = Math.pow(v > 1 ? 1 : v, pow) * amax;
        d[4 * i] = rgb[0]; d[4 * i + 1] = rgb[1]; d[4 * i + 2] = rgb[2]; d[4 * i + 3] = a * 255;
      }
      f.ctx.putImageData(f.img, 0, 0);
    }
    var hz = sim.hazard;
    paint('smoke', V.smoke, mixc(C('ink'), C('bg'), isDark() ? 0.15 : 0.35), 0.78, 0.30, 0.75);
    paint('gas', V.gas, mixc(C('warn'), C('safe'), 0.35), 0.7, Math.max(300, (hs.danger || 2100)), 0.55);
    paint('water', V.water, mixc(C('info'), C('accent'), isDark() ? 0.25 : 0.1), 0.9, 0.28, 0.7);
    R.flood = null; if (sim.hazard === 'flood') { var wm = 0, wi = -1; for (var q = 0; q < n; q++) if (V.water[q] > wm) { wm = V.water[q]; wi = q; } if (wi >= 0 && wm > 0.02) R.flood = { x: (wi % WI.w) + 0.5, y: ((wi / WI.w) | 0) + 0.5, cm: Math.round(wm * 100) }; }
    paint('dust', V.dust, mixc(C('brand'), C('warn'), 0.5), 0.6, 425, 0.7);
    MC.fieldsDirty = false;
  }

  /* ---- icons (screen-space, drawn with canvas paths so they follow the tokens) ---- */
  function flamePath(ctx, s) {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.6, s * 0.6, 0, s * 0.72); ctx.bezierCurveTo(-s * 0.6, s * 0.6, -s * 0.7, -s * 0.05, -s * 0.18, -s * 0.34); ctx.bezierCurveTo(-s * 0.16, -s * 0.5, -s * 0.05, -s * 0.62, 0, -s * 0.8); ctx.closePath();
  }
  function crossPath(ctx, s, t) { ctx.beginPath(); ctx.rect(-t, -s, 2 * t, 2 * s); ctx.rect(-s, -t, 2 * s, 2 * t); }
  function drawUnitIcon(ctx, kind, x, y, s, o) {
    o = o || {};
    var col = rgba(tokColor((UNIT[kind] || UNIT.fire).tok)), surf = rgba(C('surface')), ink = rgba(C('ink'));
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
    if (o.ring) { ctx.beginPath(); ctx.arc(0, 0, s * 1.55, 0, 6.2832); ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(tokColor(o.ring), 0.95); ctx.setLineDash(o.ringDash || []); ctx.stroke(); ctx.setLineDash([]); }
    if (o.dim) ctx.globalAlpha = 0.55;
    switch (kind) {
      case 'hospital':
        rrect(ctx, -s, -s, 2 * s, 2 * s, s * 0.32); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        crossPath(ctx, s * 0.62, s * 0.2); ctx.fillStyle = col; ctx.fill(); break;
      case 'fire':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.2832); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = surf; ctx.stroke();
        flamePath(ctx, s * 0.62); ctx.fillStyle = '#fff'; ctx.fill(); break;
      case 'police':
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, -s * 0.62); ctx.lineTo(s * 0.8, s * 0.2); ctx.quadraticCurveTo(s * 0.5, s * 0.78, 0, s); ctx.quadraticCurveTo(-s * 0.5, s * 0.78, -s * 0.8, s * 0.2); ctx.lineTo(-s * 0.9, -s * 0.62); ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = surf; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.28, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill(); break;
      case 'ambulance':
        rrect(ctx, -s * 1.15, -s * 0.7, s * 2.3, s * 1.4, s * 0.3); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        ctx.save(); ctx.translate(-s * 0.18, 0); crossPath(ctx, s * 0.42, s * 0.14); ctx.fillStyle = col; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.5, s * 0.17, 0, 6.2832); ctx.fillStyle = rgba(C('info')); ctx.fill(); break;
      case 'rescue':
        ctx.beginPath(); for (var i = 0; i < 6; i++) { var a = i * 1.0472 + 0.5236; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = surf; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, 6.2832); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.2832); ctx.fillStyle = ink; ctx.fill();
    }
    ctx.restore();
  }
  function drawDrone(ctx, x, y, s, t, light, state) {
    var ac = rgba(C('accent')), surf = rgba(C('surface'));
    ctx.save(); ctx.translate(x, y);
    // friendly light: steady green core; two soft white pulses every 2 s (smooth, no strobe; static for reduced motion)
    var ph = (t % 2), pulse = RM.matches ? 0 : Math.max(0, Math.sin(ph * 6.2832 * 1.0) * Math.sin(ph * 3.1416));
    ctx.beginPath(); ctx.arc(0, 0, s * (1.9 + pulse * 0.7), 0, 6.2832); ctx.fillStyle = rgba(C('safe'), 0.16 + pulse * 0.16); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = ac;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (d) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d[0] * s * 0.95, d[1] * s * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(d[0] * s * 0.95, d[1] * s * 0.95, s * 0.5, 0, 6.2832); ctx.fillStyle = rgba(C('surface'), 0.85); ctx.fill(); ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, 6.2832); ctx.fillStyle = rgba(C('safe')); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = surf; ctx.stroke();
    ctx.restore();
  }
  function drawPersonDot(ctx, x, y, r, st, o) {
    var col = tokColor(PERSON_ST[st].tok);
    ctx.save();
    if (st === 'help') { ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, 6.2832); ctx.fillStyle = rgba(C('danger'), 0.25); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    if (st === 'unacc') { ctx.lineWidth = Math.max(1.4, r * 0.4); ctx.strokeStyle = rgba(C('ink-2'), 0.95); ctx.fillStyle = rgba(C('surface'), 0.9); ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = rgba(col); ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = rgba(C('surface'), 0.95); ctx.stroke(); }
    if (o && o.hero) { ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, 6.2832); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('head'), 0.9); ctx.stroke(); }
    ctx.restore();
  }
  function trafficColor(f) {
    var g = C('safe'), y = C('warn'), r = C('danger');
    if (f >= 0.85) return g; if (f >= 0.55) return mixc(y, g, (f - 0.55) / 0.3); if (f >= 0.25) return mixc(r, y, (f - 0.25) / 0.3); return r;
  }
  function stationPos(a) {
    var e = a.edgePos || a.pos, x = e.x, y = e.y, off = 4;
    if (x <= 0.5) x -= off; else if (x >= WI.w - 1.5) x += off;
    if (y <= 0.5) y -= off; else if (y >= WI.h - 1.5) y += off;
    if (a.id === 'A2') y += 3.4;                     // the hospital's own ambulance sits beside the hospital icon
    return { x: x, y: y };
  }
  function inFrame(p) { return p.x >= FRAME.x && p.x <= FRAME.x + FRAME.w && p.y >= FRAME.y && p.y <= FRAME.y + FRAME.h; }

  /* person state used for colour and headcount-style filters */
  function personState(p, alerted) {
    if (p.away) return null;
    if (p.checkin === 'help' || p.st === 'down' || p.st === 'incapacitated') return 'help';
    if (p.checkin === 'safe' || p.st === 'safe' || p.st === 'sheltered') return 'safe';
    if (p.st === 'moving') return 'moving';
    if (p.asleep) return 'asleep';
    if (p.aware >= 1 && (alerted || p.aware >= 2)) return 'alerted';
    if (alerted && p.registered) return 'unacc';
    return 'calm';
  }

  /* ---- the neighbourhood map ---- */
  function trafficMap() {
    var sim = MC.sim, key = sim.t + ':' + MC.actions.length;
    if (MC.trKey !== key) { MC.trKey = key; var m = {}; Sim.traffic.snapshot(sim).forEach(function (s) { m[s.id] = s; }); MC.trMap = m; }
    return MC.trMap;
  }
  function exitAnchor(si, e) {
    var S = WI.structs[si];
    if (e.kind === 'roof') { var n = null; S.nodes.forEach(function (q) { if (q.id === e.node) n = q; }); return n ? { x: n.x + 0.2, y: S.y0 - 1.1 } : { x: S.x0 + S.w, y: S.y0 - 1 }; }
    return { x: e.out.x + 0.5, y: e.out.y + 0.5 };
  }
  function drawBadge(ctx, x, y, letter, state, k, id, locked) {
    var col = tokColor(EXIT_STATE[state].tok), small = k < 5.5, w = small ? 12 : 22, hh = small ? 12 : 17;
    ctx.save();
    rrect(ctx, x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(col); ctx.stroke();
    if (!small) {
      ctx.fillStyle = rgba(state === 'LOCKED' ? C('ink-2') : col); ctx.font = '700 11px ' + R.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letter, x - (locked ? 3 : 0), y + 0.5);
      if (locked) { ctx.fillRect(x + 3, y - 1, 5, 4); ctx.beginPath(); ctx.arc(x + 5.5, y - 1, 2, Math.PI, 0); ctx.lineWidth = 1.2; ctx.stroke(); }
    } else if (locked) { ctx.fillStyle = rgba(C('ink-2')); ctx.fillRect(x - 2, y - 1, 4, 3); }
    ctx.restore();
    R.hits.push({ type: 'exit', id: id, x: x, y: y, r: Math.max(w, hh) * 0.62 + 3 });
    // the state in words as well as colour (colour alone is not enough): always for SMOKE / FIRE / LOCKED, for OPEN once zoomed in
    if (state !== 'OPEN' || k >= 8) {
      ctx.save(); ctx.font = '700 9.5px ' + R.font; ctx.textAlign = 'center'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr';
      haloLabel(ctx, LL(EXIT_STATE[state].name), x, y + hh / 2 + 9, rgba(state === 'LOCKED' ? C('ink-2') : col), rgba(C('bg'), 0.9), 3, state === 'OPEN' ? 2 : 7);
      ctx.restore();
    }
  }

  function drawMap() {
    var ctx = R.ctx, cam = R.cam.map, k = cam.k, ox = R.w / 2 - cam.x * k, oy = R.h / 2 - cam.y * k;
    var snap = MC.snap, sim = MC.sim, G = R.geo, layers = MC.layers, alerted = !!snap.alert, hz = snap.hazard, hs = snap.hazardState || {};
    var X = function (x) { return ox + x * k; }, Y = function (y) { return oy + y * k; };
    var dark = isDark(), tsec = R.anim, moving = !RM.matches;
    R.hits = []; R.lq = [];
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = rgba(C('bg')); ctx.fillRect(0, 0, R.w, R.h);
    ctx.textBaseline = 'middle';

    /* ground, land use, roads */
    inWorld(ox, oy, k, function (c) {
      c.fillStyle = rgba(mixc(C('surface-2'), C('bg-2'), 0.45)); c.fillRect(0, 0, WI.w, WI.h);
      c.fillStyle = rgba(mixc(C('surface-2'), C('safe'), dark ? 0.16 : 0.17)); c.fill(G.park);
      c.fillStyle = rgba(mixc(C('surface-2'), C('info'), dark ? 0.12 : 0.1)); c.fill(G.yard);
      c.fillStyle = rgba(mixc(C('surface-2'), C('warn'), dark ? 0.12 : 0.1)); c.fill(G.site);
      c.fillStyle = rgba(mixc(C('surface-3'), C('bg'), dark ? 0.15 : 0.2)); c.fill(G.road);
      c.lineWidth = 1.2 / k; c.strokeStyle = rgba(C('line-2'), 0.9); c.strokeRect(0, 0, WI.w, WI.h);
    });
    // road centre lines + the frame's access legs
    inWorld(ox, oy, k, function (c) {
      c.setLineDash([0.8, 0.9]); c.lineWidth = 0.12; c.strokeStyle = rgba(C('line-2'), 0.7); c.lineCap = 'butt';
      G.segs.forEach(function (s) { var q = clipFrame(s.a.x, s.a.y, s.b.x, s.b.y); if (!q) return; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.stroke(); });
      c.setLineDash([]);
    });
    // underpass hint
    inWorld(ox, oy, k, function (c) {
      c.fillStyle = rgba(C('ink'), dark ? 0.1 : 0.07);
      G.segs.forEach(function (s) { if (!s.low) return; c.fillRect(Math.min(s.a.x, s.b.x) - 1.6, Math.min(s.a.y, s.b.y), 3.2, Math.abs(s.b.y - s.a.y)); });
    });

    /* flood / dust / heat sit under the buildings */
    if (layers.hazard) {
      if (MC.fieldsDirty) paintFields();
      inWorld(ox, oy, k, function (c) {
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        if (hz === 'flood') c.drawImage(R.fields.water.cvs, 0, 0, WI.w, WI.h);
        if (hz === 'dust') c.drawImage(R.fields.dust.cvs, 0, 0, WI.w, WI.h);
        if (hz === 'heat') { var a = clamp(((hs.wbgt || 26) - 26) / 8, 0, 0.45); c.fillStyle = rgba(C('brand'), a * 0.5); c.fillRect(0, 0, WI.w, WI.h); c.fillStyle = rgba(C('danger'), a * 0.55); c.fill(G.site); }
      });
    }

    /* buildings */
    var labelK = k >= 4.2;
    for (var id in G.bbox) {
      var bb = G.bbox[id];
      inWorld(ox, oy, k, function (c) {
        rrect(c, bb.x0 + 0.05, bb.y0 + 0.05, bb.x1 - bb.x0 - 0.1, bb.y1 - bb.y0 - 0.1, 0.35);
        c.fillStyle = rgba(mixc(C('surface'), C('ink'), dark ? 0.08 : 0.025)); c.fill();
        c.lineWidth = (id === 'RB' || id === 'SCH' ? 2.2 : 1.3) / k; c.strokeStyle = rgba(id === 'RB' || id === 'SCH' ? C('accent') : C('line-2'), id === 'RB' || id === 'SCH' ? 0.9 : 1); c.stroke();
      });
      R.hits.push({ type: 'building', id: id, x: X((bb.x0 + bb.x1) / 2), y: Y((bb.y0 + bb.y1) / 2), rect: { x0: X(bb.x0), y0: Y(bb.y0), x1: X(bb.x1), y1: Y(bb.y1) }, prio: 0 });
      if (labelK || id === 'RB' || id === 'SCH') {
        ctx.font = '600 ' + (k >= 9 ? 12 : 10.5) + 'px ' + R.font; ctx.textAlign = 'center'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr';
        haloLabel(ctx, LL(bb.name).replace(/\s*\(.*\)$/, ''), X((bb.x0 + bb.x1) / 2), Y(bb.y1) + (id === 'RB' ? 25 : 11), rgba(C('ink-2')), rgba(C('bg'), 0.85), 3, id === 'RB' || id === 'SCH' ? 6 : 5);
      }
    }
    // drone dock on the shops roof
    if (layers.units) { ctx.save(); ctx.strokeStyle = rgba(C('accent')); ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.arc(X(WI.dock.x), Y(WI.dock.y), Math.max(5, k * 0.9), 0, 6.2832); ctx.stroke(); ctx.restore(); }

    /* plume / gas / indoor fire above the buildings */
    if (layers.hazard) {
      inWorld(ox, oy, k, function (c) {
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        if (hz === 'gas') c.drawImage(R.fields.gas.cvs, 0, 0, WI.w, WI.h);
        c.drawImage(R.fields.smoke.cvs, 0, 0, WI.w, WI.h);
        var of = Sim.view(sim).outdoorFire;
        for (var i = 0; i < of.length; i++) if (of[i]) {
          var cx = i % WI.w, cy = (i / WI.w) | 0, fl = moving ? 0.82 + 0.18 * Math.sin(tsec * 9 + i * 1.7) : 1;
          c.fillStyle = of[i] === 1 ? rgba(mixc(C('fire-2'), C('fire-3'), 0.5), 0.9 * fl) : rgba(C('ink'), 0.28);
          c.fillRect(cx, cy, 1.02, 1.02);
        }
      });
      // burning rooms (indoor) as flames on the plan
      var stt = sim.stt || [];
      WI.structs.forEach(function (S, si) {
        var st = stt[si]; if (!st) return;
        for (var ni = 0; ni < S.nodes.length; ni++) if (st.burn[ni] === 1) {
          var n = S.nodes[ni], px = X(n.x), py = Y(n.y), fr = Math.max(4, k * 0.9) * (moving ? 0.9 + 0.1 * Math.sin(tsec * 8 + ni) : 1);
          ctx.save(); ctx.translate(px, py); flamePath(ctx, fr); ctx.fillStyle = rgba(C('fire-2'), 0.95); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(C('fire-3')); ctx.stroke(); ctx.restore();
        }
      });
      // gas leak source
      if (hz === 'gas' && hs.leakOn) {
        var lx = X(WI.lpg.x), ly = Y(WI.lpg.y), pr = 7 + (moving ? 3 * Math.abs(Math.sin(tsec * 2)) : 2);
        ctx.beginPath(); ctx.arc(lx, ly, pr, 0, 6.2832); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('warn')); ctx.stroke();
        ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 6.2832); ctx.fillStyle = rgba(C('warn')); ctx.fill();
      }
      // wind streaks (where the air is going)
      if (k >= 3 && (hz === 'fire' || hz === 'gas' || hz === 'dust') && hs.started) {
        var to = (snap.wind.deg + 180) * Math.PI / 180, ux = Math.sin(to), uy = -Math.cos(to), len = clamp(snap.wind.speed * 2.2, 8, 34);
        ctx.save(); ctx.strokeStyle = rgba(C('ink-2'), 0.34); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        for (var wx = 12; wx < WI.w; wx += 21) for (var wy = 6; wy < WI.h; wy += 19) {
          var drift = moving ? ((tsec * snap.wind.speed * 2.4) % 14) : 0, x1 = X(wx) + ux * drift, y1 = Y(wy) + uy * drift;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + ux * len, y1 + uy * len); ctx.lineTo(x1 + ux * len - (ux * 5 - uy * 3), y1 + uy * len - (uy * 5 + ux * 3)); ctx.moveTo(x1 + ux * len, y1 + uy * len); ctx.lineTo(x1 + ux * len - (ux * 5 + uy * 3), y1 + uy * len - (uy * 5 - ux * 3)); ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* traffic layer: congestion-coloured roads, closed roads, jams */
    var tm = trafficMap();
    inWorld(ox, oy, k, function (c) {
      c.lineCap = 'round';
      G.segs.forEach(function (s) {
        var q = clipFrame(s.a.x, s.a.y, s.b.x, s.b.y); if (!q) return;
        var ts = tm[s.id] || { factor: 1, closed: false }, wc = (s.cls === 'expressway' ? 1.15 : s.cls === 'major' ? 0.95 : s.cls === 'minor' ? 0.75 : 0.55);
        var wpx = Math.max(2.6, wc * k * 0.55) / k;
        if (ts.closed) {
          c.setLineDash([0.9, 0.7]); c.lineWidth = wpx; c.strokeStyle = rgba(C('danger'), 0.95); c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.stroke(); c.setLineDash([]);
        } else if (layers.traffic) {
          c.lineWidth = wpx; c.strokeStyle = rgba(trafficColor(ts.factor), 0.9); c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.stroke();
        }
      });
    });
    // the water lies ON the road surface too: tint the roads again (underpass first), and say how deep it is
    if (layers.hazard && hz === 'flood') {
      inWorld(ox, oy, k, function (c) { c.globalAlpha = 0.55; c.imageSmoothingEnabled = true; c.drawImage(R.fields.water.cvs, 0, 0, WI.w, WI.h); c.globalAlpha = 1; });
      if (R.flood) {
        var fx = X(R.flood.x) + 34, fy = Y(R.flood.y) + 2, ftxt = N(hs.underpassCm != null ? hs.underpassCm : R.flood.cm) + ' ' + B('سم', 'cm');
        ctx.save(); ctx.font = '700 11px ' + R.mono; ctx.textAlign = 'center'; var fw = ctx.measureText(ftxt).width + 14; rrect(ctx, fx - fw / 2, fy - 10, fw, 20, 10); ctx.fillStyle = rgba(C('info')); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
        ctx.fillStyle = rgba(isDark() ? C('bg') : C('surface')); ctx.fillText(ftxt, fx, fy + 0.5); ctx.restore();
        R.hits.push({ type: 'water', id: 'depth', x: fx, y: fy, r: 14, prio: 4 });
      }
    }
    G.segs.forEach(function (s) {
      var ts = tm[s.id]; if (!ts) return;
      var q = clipFrame(s.a.x, s.a.y, s.b.x, s.b.y); if (!q) return;
      var mx = (q[0] + q[2]) / 2, my = (q[1] + q[3]) / 2;
      if (ts.closed) {
        var cx = X(mx), cy = Y(my); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 6.2832); ctx.fillStyle = rgba(C('danger')); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 3.5, cy - 3.5); ctx.lineTo(cx + 3.5, cy + 3.5); ctx.moveTo(cx + 3.5, cy - 3.5); ctx.lineTo(cx - 3.5, cy + 3.5); ctx.stroke(); ctx.restore();
      } else if (ts.jam != null) {
        ctx.save(); ctx.beginPath(); ctx.arc(X(mx), Y(my), 7, 0, 6.2832); ctx.fillStyle = rgba(C('warn')); ctx.fill(); ctx.fillStyle = rgba(C('surface')); ctx.font = '700 10px ' + R.font; ctx.textAlign = 'center'; ctx.fillText('!', X(mx), Y(my) + 0.5); ctx.restore();
      }
      R.hits.push({ type: 'road', id: s.id, seg: [X(q[0]), Y(q[1]), X(q[2]), Y(q[3])], x: X(mx), y: Y(my), prio: -1 });
    });
    if (k >= 11) {
      ctx.font = '600 10px ' + R.font; ctx.textAlign = 'center';
      G.segs.forEach(function (s) { if (s.cls === 'access' || !s.name) return; var q = clipFrame(s.a.x, s.a.y, s.b.x, s.b.y); if (!q || Math.hypot(q[2] - q[0], q[3] - q[1]) < 12) return; var tmx = (q[0] + q[2]) / 2, tmy = (q[1] + q[3]) / 2; haloLabel(ctx, LL(s.name), X(tmx), Y(tmy) - 12, rgba(C('muted')), rgba(C('bg'), 0.8), 3, 1); });
    }

    /* assembly points, cooling shelters */
    WI.assembly.forEach(function (a) {
      var px = X(a.x), py = Y(a.y);
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, Math.max(7, k * 0.9), 0, 6.2832); ctx.fillStyle = rgba(C('safe'), 0.16); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('safe')); ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba(C('safe')); ctx.font = '700 11px ' + R.font; ctx.textAlign = 'center'; ctx.fillText(a.id.slice(-1), px, py + 0.5); ctx.restore();
      R.hits.push({ type: 'assembly', id: a.id, x: px, y: py, r: Math.max(10, k) + 2, prio: 1 });
      if (k >= 9) { ctx.font = '600 10px ' + R.font; ctx.textAlign = 'center'; haloLabel(ctx, LL(a.name).split(' — ')[0], px, py + Math.max(13, k * 0.95 + 8), rgba(C('safe')), rgba(C('bg'), 0.85), 3, 3); }
    });
    if (hz === 'heat' || k >= 7) WI.shelters.forEach(function (a) {
      var px = X(a.x), py = Y(a.y); ctx.save(); rrect(ctx, px - 6, py - 6, 12, 12, 3); ctx.fillStyle = rgba(C('accent'), 0.18); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('accent')); ctx.stroke();
      ctx.fillStyle = rgba(C('accent')); ctx.font = '700 9px ' + R.font; ctx.textAlign = 'center'; ctx.fillText('❄', px, py + 0.5); ctx.restore();
      R.hits.push({ type: 'shelter', id: a.id, x: px, y: py, r: 9, prio: 1 });
    });

    /* sentinels (outdoor channels + a hub per building) */
    if (layers.sensors) {
      var act = {};
      sim.sensors.forEach(function (ch) {
        if (isNum(ch.x) && isNum(ch.y)) {
          var px = X(ch.x), py = Y(ch.y), on = ch.active;
          ctx.save(); ctx.translate(px, py); ctx.rotate(0.7854); ctx.fillStyle = rgba(on ? C('danger') : C('accent'), on ? 0.95 : 0.8); ctx.fillRect(-4, -4, 8, 8); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C('surface')); ctx.strokeRect(-4, -4, 8, 8); ctx.restore();
          R.hits.push({ type: 'sentinel', id: ch.id, x: px, y: py, r: 8, prio: 2 });
        } else if (ch.struct != null) { var a = act[ch.struct] || (act[ch.struct] = { n: 0, on: 0 }); a.n++; if (ch.active) a.on++; }
      });
      Object.keys(act).forEach(function (si) {
        var S = WI.structs[si], a = act[si], px = X(S.x0 + S.w), py = Y(S.y0);
        ctx.save(); ctx.translate(px, py); ctx.beginPath(); for (var i = 0; i < 6; i++) { var an = i * 1.0472; ctx.lineTo(Math.cos(an) * 9, Math.sin(an) * 9); } ctx.closePath();
        ctx.fillStyle = rgba(a.on ? C('danger') : C('accent'), 0.92); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 9.5px ' + R.font; ctx.textAlign = 'center'; ctx.fillText(a.on ? String(a.on) : String(a.n), 0, 0.5); ctx.restore();
        R.hits.push({ type: 'hub', id: S.id, x: px, y: py, r: 11, prio: 2 });
      });
    }

    /* exits */
    snap.exits.forEach(function (e) {
      var si = e.struct === 'SCH' ? 1 : 0, S = WI.structs[si], ex = null;
      S.exits.forEach(function (q) { if (q.id === e.id) ex = q; });
      if (!ex) return;
      if (hz === 'fire' && MC.sim.hz && MC.sim.hz.struct !== si) { /* still show the other building's exits, dimmed by size */ }
      var p = exitAnchor(si, ex);
      drawBadge(ctx, X(p.x), Y(p.y), ex.kind === 'roof' ? 'R' : ex.kind === 'entrance' ? 'E' : e.id, e.state, k, e.struct + '.' + e.id, e.locked);
    });

    /* routes: dispatch units (animated dashes) + residents' live routes */
    if (layers.routes) {
      var disp = snap.dispatch;
      if (disp) disp.units.forEach(function (u, ui) {
        if (!u.assetId || u.state === 'cleared' || !u.route || u.route.length < 2) return;
        var col = tokColor(UNIT[u.kind].tok);
        ctx.save(); ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([9, 7]); ctx.lineDashOffset = moving ? -tsec * 28 : 0; ctx.strokeStyle = rgba(col, 0.95);
        ctx.beginPath(); var started = false;
        for (var i = 1; i < u.route.length; i++) {
          var q = clipFrame(u.route[i - 1][0], u.route[i - 1][1], u.route[i][0], u.route[i][1]); if (!q) continue;
          ctx.moveTo(X(q[0]) + ui * 0.8, Y(q[1]) + ui * 0.8); ctx.lineTo(X(q[2]) + ui * 0.8, Y(q[3]) + ui * 0.8);
        }
        ctx.stroke(); ctx.restore();
      });
      Object.keys(R.routes).forEach(function (pk) {
        var rt0 = R.routes[pk], pts = rt0 && rt0.pts; if (!pts || pts.length < 2) return;
        ctx.save(); ctx.lineWidth = pk === (MC.sel && MC.sel.type === 'person' ? MC.sel.id : '') ? 3.2 : 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(C('safe'), 0.95); ctx.setLineDash([5, 4]); ctx.lineDashOffset = moving ? -tsec * 14 : 0;
        ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.stroke();
        var e = pts[pts.length - 1]; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(X(e[0]), Y(e[1]), 4, 0, 6.2832); ctx.fillStyle = rgba(C('safe')); ctx.fill(); ctx.restore();
      });
    }

    /* the scene marker */
    var scene = snap.dispatch ? snap.dispatch.scene : sceneOf(sim);
    if (scene && hs.started) {
      var sx = X(scene.x), sy = Y(scene.y), pr = 10 + (moving ? 4 * Math.abs(Math.sin(tsec * 2.2)) : 3);
      ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('danger')); ctx.beginPath(); ctx.arc(sx, sy, pr, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke(); ctx.restore();
    }

    /* responders: fixed stations/hospitals at the map edge + the units that are driving */
    if (layers.units) {
      var plan = snap.dispatch, byAsset = {};
      if (plan) plan.units.forEach(function (u) { if (u.assetId) (byAsset[u.assetId] = byAsset[u.assetId] || []).push(u); });
      var hosp = plan && plan.hospital ? plan.hospital.id : null;
      WI.assets.forEach(function (a) {
        var sp = stationPos(a), px = X(sp.x), py = Y(sp.y), us = byAsset[a.id], busy = sim.busy && sim.busy[a.id];
        var ring = null, dash = null;
        if (us) { var st = us[0].state; ring = st === 'on-scene' ? '--safe' : st === 'recommended' ? '--accent' : '--brand'; if (st === 'recommended') dash = [3, 3]; }
        if (a.id === hosp) ring = '--danger';
        drawUnitIcon(ctx, a.kind, px, py, 10, { ring: ring, ringDash: dash, dim: !!busy });
        if (busy) { ctx.save(); ctx.fillStyle = rgba(C('muted')); ctx.font = '700 9px ' + R.font; ctx.textAlign = 'center'; ctx.fillText(B('مشغولة', 'BUSY'), px, py + 22); ctx.restore(); }
        R.hits.push({ type: 'station', id: a.id, x: px, y: py, r: 13, prio: 3 });
        if (k >= 4.5 || a.kind === 'hospital') { ctx.font = '600 10px ' + R.font; ctx.textAlign = 'center'; var nm = LL(a.name).replace(/\s*[—-]\s*(تجريبي[ة]?|\(demo\))|\s*\(demo\)/g, ''); haloLabel(ctx, nm, px, py - 17, rgba(C('ink-2')), rgba(C('bg'), 0.9), 3, a.kind === 'hospital' ? 5 : 4); }
      });
      if (plan) plan.units.forEach(function (u, ui) {
        if (!u.assetId || !u.pos || !inFrame(u.pos)) return;
        if (u.state === 'cleared') return;
        var a = null; WI.assets.forEach(function (q) { if (q.id === u.assetId) a = q; });
        var px = X(u.pos.x) + ui * 6, py = Y(u.pos.y) - ui * 3;
        ctx.save(); ctx.beginPath(); ctx.arc(px, py, 14, 0, 6.2832); ctx.fillStyle = rgba(C('bg'), 0.65); ctx.fill(); ctx.restore();
        drawUnitIcon(ctx, u.kind, px, py, 8.5, { ring: u.state === 'on-scene' ? '--safe' : '--brand' });
        if (u.state !== 'on-scene') { ctx.font = '700 10.5px ' + R.mono; ctx.textAlign = 'center'; haloLabel(ctx, mmss(u.etaSec), px, py + 19, rgba(C('head')), rgba(C('bg'), 0.92), 3.5, 8); }   // on scene: the green ring says it (and the Dispatch tab); no stacked text
        R.hits.push({ type: 'unit', id: u.assetId + ':' + u.kind, x: px, y: py, r: 13, prio: 4 });
      });
    }

    /* people */
    if (layers.people) {
      var r0 = clamp(k * 0.2, 2, 5), heroOrder = [];
      snap.people.forEach(function (p) {
        var st = personState(p, alerted); if (!st) return;
        if (p.hero) { heroOrder.push([p, st]); return; }
        var px = X(p.x), py = Y(p.y);
        if (px < -10 || py < -10 || px > R.w + 10 || py > R.h + 10) return;
        drawPersonDot(ctx, px, py, r0, st);
        R.hits.push({ type: 'person', id: p.key, x: px, y: py, r: r0 + 3, prio: 5 });
      });
      heroOrder.forEach(function (o) {
        var p = o[0], px = X(p.x), py = Y(p.y); drawPersonDot(ctx, px, py, r0 + 2, o[1], { hero: true });
        R.hits.push({ type: 'person', id: p.key, x: px, y: py, r: r0 + 6, prio: 6 });
        if (k >= 5) { ctx.font = '700 11px ' + R.font; ctx.textAlign = 'center'; haloLabel(ctx, LL(HERO_NAME[p.hero] || p.name), px, py - r0 - 9, rgba(C('head')), rgba(C('bg'), 0.92), 3.5, 9); }
      });
    }

    /* drone */
    var dr = snap.drone;
    if (layers.units && dr && dr.state !== 'DOCKED' && dr.state !== 'CHARGING') {
      var dx = X(dr.x), dy = Y(dr.y);
      if (scene && (dr.state === 'TRACK' || dr.state === 'HOLD')) { ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = rgba(C('accent'), 0.8); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(X(scene.x), Y(scene.y)); ctx.stroke(); ctx.restore(); }
      drawDrone(ctx, dx, dy, 6.5, tsec, dr.light, dr.state);
      R.hits.push({ type: 'drone', id: 'drone', x: dx, y: dy, r: 14, prio: 7 });
    }

    flushLabels();
    /* selection ring */
    if (MC.sel) { var hsel = findHit(MC.sel.type, MC.sel.id); if (hsel) { ctx.save(); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(C('head')); ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(hsel.x, hsel.y, (hsel.r || 12) + 4, 0, 6.2832); ctx.stroke(); ctx.restore(); } }
  }
  function sceneOf(sim) {
    var pre = presetInfo(sim.preset), n = R.geo && R.geo.nodeById[pre.scene];
    return n ? { x: n.x, y: n.y } : null;
  }
  function findHit(type, id) { for (var i = R.hits.length - 1; i >= 0; i--) if (R.hits[i].type === type && R.hits[i].id === id) return R.hits[i]; return null; }

  /* ---- the building cut-away: floor plans of one building side by side (rooms, stairs, roof door, refuge balcony) ---- */
  var FLOOR_NAME = [T('الطابق الأرضي', 'Ground floor'), T('الطابق الأول', 'First floor'), T('الطابق الثاني', 'Second floor'), T('السطح', 'Roof')];
  function floorTitle(si, fl) { var S = WI.structs[si]; return fl >= S.floors ? FLOOR_NAME[3] : FLOOR_NAME[fl]; }
  function drawBuilding() {
    var ctx = R.ctx, cam = R.cam.bld, k = cam.k, L = R.bl || (R.bl = bLayout()); if (!L) return;
    var ox = R.w / 2 - cam.x * k, oy = R.h / 2 - cam.y * k, X = function (bx) { return ox + bx * k; }, Y = function (by) { return oy + by * k; };
    var snap = MC.snap, sim = MC.sim, S = L.S, si = L.si, st = sim.stt && sim.stt[si], dark = isDark(), tsec = R.anim, moving = !RM.matches;
    var alerted = !!snap.alert, rooms = (MC.hc && MC.hc.rooms) || {}, hw0 = si === 0 ? 0.7 : 1.0, hh0 = 1.0;
    R.hits = [];
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.fillStyle = rgba(C('bg')); ctx.fillRect(0, 0, R.w, R.h);
    ctx.textBaseline = 'middle'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr';
    var exitState = {}; snap.exits.forEach(function (e) { if (e.struct === S.id) exitState[e.id] = e; });
    var idxById = {}; S.nodes.forEach(function (n, i) { idxById[n.id] = i; });

    L.panels.forEach(function (P) {
      var fx = P.ox + 1.2, fy = P.oy + 1.5, PX = function (x) { return X(fx + (x - S.x0)); }, PY = function (y) { return Y(fy + (y - S.y0)); };
      var roof = P.fl >= S.floors;
      // card
      ctx.save(); rrect(ctx, X(P.ox + 0.1), Y(P.oy + 0.1), (P.pw - 0.2) * k, (P.ph - 0.2) * k, Math.max(6, 0.5 * k)); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C('line-2')); ctx.stroke(); ctx.restore();
      // title + counts
      var inFl = snap.people.filter(function (p) { return !p.away && p.fl === P.fl && p.x >= S.x0 - 1 && p.x <= S.x0 + S.w + 1.5 && p.y >= S.y0 - 1 && p.y <= S.y0 + S.h + 1; });
      ctx.font = '700 ' + clamp(0.52 * k, 11, 15) + 'px ' + R.font; ctx.textAlign = lang() === 'ar' ? 'right' : 'left';
      var tx = lang() === 'ar' ? X(P.ox + P.pw - 0.7) : X(P.ox + 0.7), ttl = LL(floorTitle(si, P.fl));
      ctx.fillStyle = rgba(C('head')); ctx.fillText(ttl, tx, Y(P.oy + 0.85));
      var tw = ctx.measureText(ttl).width + 10;
      ctx.font = '500 ' + clamp(0.42 * k, 10, 12.5) + 'px ' + R.font; ctx.fillStyle = rgba(C('muted'));
      ctx.fillText('· ' + N(inFl.length) + ' ' + B('شخص', 'people'), tx + (lang() === 'ar' ? -tw : tw), Y(P.oy + 0.85));
      // footprint
      ctx.save(); rrect(ctx, X(fx), Y(fy), S.w * k, S.h * k, 0.2 * k); ctx.fillStyle = rgba(roof ? mixc(C('surface-3'), C('bg'), 0.3) : C('surface-2')); ctx.fill(); ctx.lineWidth = Math.max(2, 0.14 * k); ctx.strokeStyle = rgba(C('line-2')); if (roof) ctx.setLineDash([8, 5]); ctx.stroke(); ctx.restore();
      // nodes
      S.nodes.forEach(function (n, ni) {
        if (n.fl !== P.fl) return;
        var cx = PX(n.x), cy = PY(n.y), burn = st ? st.burn[ni] : 0, smoke = st ? st.smoke[ni] : 0, gas = st ? st.gas[ni] : 0, hw = hw0, hh = hh0, txt = null, kind = 'room';
        var x0, y0, w, h;
        if (n.type === 2) { kind = 'corr'; x0 = cx - hw * k; y0 = cy - 0.5 * k; w = 2 * hw * k; h = 1.0 * k; }
        else if (n.type === 3) { kind = 'stair'; x0 = cx - 0.5 * k; y0 = cy - 0.75 * k; w = 1.0 * k; h = 1.5 * k; }
        else if (n.type === 5) { kind = 'refuge'; x0 = cx - 0.45 * k; y0 = cy - 0.9 * k; w = 0.9 * k; h = 1.8 * k; }
        else if (n.type === 6) { kind = 'roofnode'; }
        else { x0 = cx - hw * k + 0.03 * k; y0 = cy - hh * k + 0.03 * k; w = 2 * hw * k - 0.06 * k; h = 2 * hh * k - 0.06 * k; if (n.type === 4) kind = 'lobby'; else if (n.type === 7) kind = 'special'; }
        if (kind === 'roofnode') return;
        // base fill
        ctx.save(); rrect(ctx, x0, y0, w, h, Math.max(2, 0.12 * k));
        var base = kind === 'corr' ? C('surface-3') : kind === 'stair' ? mixc(C('surface-3'), C('accent'), 0.12) : kind === 'refuge' ? mixc(C('surface'), C('safe'), 0.2) : kind === 'lobby' ? mixc(C('surface'), C('info'), 0.12) : C('surface');
        ctx.fillStyle = rgba(base); ctx.fill();
        if (smoke > 0.01) { ctx.fillStyle = rgba(mixc(C('ink'), C('bg'), dark ? 0.1 : 0.3), clamp(smoke * 1.15, 0, 0.72)); ctx.fill(); }
        if (gas > 5 && sim.hazard === 'gas') { ctx.fillStyle = rgba(C('warn'), clamp(gas / (MC.snap.hazardState.danger || 2100), 0, 0.7)); ctx.fill(); }
        if (burn === 1) { var fl = moving ? 0.8 + 0.2 * Math.sin(tsec * 8 + ni) : 1; ctx.fillStyle = rgba(mixc(C('fire-2'), C('fire-3'), 0.4), 0.78 * fl); ctx.fill(); }
        else if (burn >= 2) { ctx.fillStyle = rgba(C('ink'), 0.4); ctx.fill(); }
        var rc = n.room ? rooms[n.room] : null, bcol = C('line-2'), bw = 1.2;
        if (rc && rc.total) { if (rc.help > 0) { bcol = C('danger'); bw = 2.6; } else if (rc.safe >= rc.total) { bcol = C('safe'); bw = 2.6; } else if (alerted && rc.safe > 0) { bcol = C('warn'); bw = 2; } }
        ctx.lineWidth = bw; ctx.strokeStyle = rgba(bcol); ctx.stroke();
        if (kind === 'stair') { ctx.beginPath(); for (var yy = 0.2; yy < 1.5; yy += 0.28) { ctx.moveTo(x0 + 0.1 * k, y0 + yy * k); ctx.lineTo(x0 + w - 0.1 * k, y0 + yy * k); } ctx.lineWidth = 1; ctx.strokeStyle = rgba(C('line-2'), 0.9); ctx.stroke(); }
        ctx.restore();
        if (burn === 1) { ctx.save(); ctx.translate(cx, cy + 0.15 * k); flamePath(ctx, clamp(0.55 * k, 8, 24)); ctx.fillStyle = rgba(C('fire-1'), 0.95); ctx.fill(); ctx.restore(); }
        // labels
        ctx.textAlign = 'center';
        if (kind === 'room' || kind === 'special') { ctx.font = '700 ' + clamp(0.4 * k, 9, 15) + 'px ' + R.font; ctx.fillStyle = rgba(C('ink-2')); ctx.fillText(kind === 'special' ? LL(n.label).replace(/^الصف |^Class /, '') : n.room, cx, y0 + 0.28 * k + 2); }
        else if (kind === 'stair') { ctx.font = '700 ' + clamp(0.5 * k, 10, 17) + 'px ' + R.font; ctx.fillStyle = rgba(C('ink-2')); ctx.fillText(LL(n.label).replace(/^الدرج |^Stair |^West |^East |^الغربي|^الشرقي/g, '').trim().slice(0, 2) || '↕', cx, cy); }
        else if (kind === 'lobby') { ctx.font = '600 ' + clamp(0.34 * k, 8.5, 12) + 'px ' + R.font; ctx.fillStyle = rgba(C('ink-2')); ctx.fillText(B('بهو وحارس', 'Lobby · guard'), cx, cy); }
        else if (kind === 'refuge') { ctx.font = '600 ' + clamp(0.3 * k, 8, 11) + 'px ' + R.font; ctx.fillStyle = rgba(C('safe')); ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(B('شرفة الملاذ', 'Refuge'), 0, 0); ctx.restore(); }
        if (n.room || kind === 'special' || kind === 'refuge' || kind === 'lobby') R.hits.push({ type: 'room', id: n.room || n.id, x: cx, y: cy, rect: { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h }, prio: 1, node: n.id });
        // sentinel (one per room / corridor node)
        if (MC.layers.sensors && (kind === 'room' || kind === 'special' || kind === 'corr' || kind === 'lobby')) {
          var on = false; sim.sensors.forEach(function (ch) { if (ch.node === ni && ch.struct === si && ch.active) on = true; });
          var sx = x0 + w - 5, sy = y0 + 5; ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.7854); ctx.fillStyle = rgba(on ? C('danger') : C('accent'), on ? 1 : 0.65); ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.restore();
          if (on) R.hits.push({ type: 'sentinel', id: 'node:' + n.id, x: sx, y: sy, r: 8, prio: 3 });
        }
      });
      // roof slab label
      if (roof) { ctx.font = '600 ' + clamp(0.4 * k, 10, 14) + 'px ' + R.font; ctx.textAlign = 'center'; ctx.fillStyle = rgba(C('muted')); ctx.fillText(B('سطح المبنى', 'Building roof'), X(fx + S.w / 2), Y(fy + S.h / 2 - 0.9)); }
      // exits on this panel
      S.exits.forEach(function (ex) {
        var en = S.nodes[idxById[ex.node]]; if (!en) return;
        var es = exitState[ex.id]; if (!es) return;
        var bx, by;
        if (ex.kind === 'roof') { if (!roof) return; bx = PX(en.x); by = PY(S.y0 + S.h / 2); }
        else if (ex.kind === 'entrance') { if (P.fl !== 0) return; bx = PX(ex.out.x); by = PY(S.y0 + S.h) + 0.02 * k; }
        else { if (P.fl !== 0) return; bx = PX(en.x); by = PY(S.y0 + S.h) + 0.02 * k; }
        drawBadge(ctx, bx, by, ex.kind === 'roof' ? 'R' : ex.kind === 'entrance' ? 'E' : ex.id, es.state, Math.max(k / 3, 6), S.id + '.' + ex.id, es.locked);
      });
      // routes (heroes + selected)
      if (MC.layers.routes) Object.keys(R.routes).forEach(function (pk) {
        var rt = R.routes[pk]; if (!rt || !rt.pts || rt.pts.length < 2) return;
        ctx.save(); ctx.lineWidth = Math.max(2, 0.1 * k); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(C('safe'), 0.95); ctx.setLineDash([6, 4]); ctx.lineDashOffset = moving ? -tsec * 14 : 0; ctx.beginPath();
        var pen = false;
        for (var i = 0; i < rt.pts.length; i++) {
          var f = rt.fls[i];
          if (f && f.si === si && f.fl === P.fl) { var qx = PX(rt.pts[i][0]), qy = PY(rt.pts[i][1]); if (pen) ctx.lineTo(qx, qy); else { ctx.moveTo(qx, qy); pen = true; } }
          else pen = false;
        }
        ctx.stroke(); ctx.restore();
      });
      // people
      if (MC.layers.people) {
        var pr = clamp(0.17 * k, 3, 7.5);
        inFl.forEach(function (p) {
          var s2 = personState(p, alerted); if (!s2) return;
          var px = PX(p.x), py = PY(p.y);
          drawPersonDot(ctx, px, py, p.hero ? pr + 1.5 : pr, s2, { hero: !!p.hero });
          R.hits.push({ type: 'person', id: p.key, x: px, y: py, r: pr + 4, prio: p.hero ? 6 : 5 });
          if (p.hero) { ctx.font = '700 ' + clamp(0.36 * k, 10, 13) + 'px ' + R.font; ctx.textAlign = 'center'; haloText(ctx, LL(HERO_NAME[p.hero]), px, py - pr - 9, rgba(C('head')), rgba(C('surface'), 0.95), 3.5); }
        });
      }
    });
    if (MC.sel) { var hs2 = findHit(MC.sel.type, MC.sel.id); if (hs2) { ctx.save(); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(C('head')); ctx.setLineDash([4, 3]); if (hs2.rect) rrect(ctx, hs2.rect.x0 - 2, hs2.rect.y0 - 2, hs2.rect.x1 - hs2.rect.x0 + 4, hs2.rect.y1 - hs2.rect.y0 + 4, 5); else { ctx.beginPath(); ctx.arc(hs2.x, hs2.y, (hs2.r || 12) + 4, 0, 6.2832); } ctx.stroke(); ctx.restore(); } }
  }

  // how many people are outside the building shown in the cut-away (the HUD says so, next to the view switch)
  function outsideCount() {
    var S = WI.structs[MC.bStruct]; if (!S || !MC.snap) return 0;
    return MC.snap.people.filter(function (p) { return !p.away && !(p.x >= S.x0 - 1 && p.x <= S.x0 + S.w + 1.5 && p.y >= S.y0 - 1 && p.y <= S.y0 + S.h + 1); }).length;
  }
  /* residents' live routes (heroes + the selected person), mapped to floors for the cut-away */
  function routeFloors(nodes) {
    var W = MC.sim.W;
    return nodes.map(function (g) {
      for (var si = 0; si < W.structs.length; si++) { var s = W.structs[si], li = g - s.base; if (li >= 0 && li < s.nodes.length) return { si: si, fl: WI.structs[si].nodes[li] ? WI.structs[si].nodes[li].fl : 0 }; }
      return null;
    });
  }
  function updateRoutes() {
    var sim = MC.sim, snap = MC.snap, keys = {}, out = {};
    if (!snap.alert) { R.routes = {}; return; }
    HERO.forEach(function (hk) { if (sim.byKey[hk]) keys[hk] = 1; });
    if (MC.sel && MC.sel.type === 'person' && sim.byKey[MC.sel.id]) keys[MC.sel.id] = 1;
    Object.keys(keys).forEach(function (pk) {
      var a = sim.byKey[pk]; if (!a || a.away || a.st === 'safe' || a.st === 'sheltered' || a.st === 'down') return;
      try { var r = Sim.personRoute(sim, pk); if (r && r.pts && r.pts.length > 1) out[pk] = { pts: r.pts, fls: routeFloors(r.nodes || []) }; } catch (e) { /* no route */ }
    });
    R.routes = out;
  }
  // map view wants the flat polyline
  function routePts(pk) { var r = R.routes[pk]; return r ? r.pts : null; }

  /* ---- hit testing, hover, click ---- */
  function distSeg(px, py, s) {
    var ax = s[0], ay = s[1], bx = s[2], by = s[3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function hitAt(px, py) {
    var best = null, bestScore = 1e9;
    for (var i = R.hits.length - 1; i >= 0; i--) {
      var hh = R.hits[i], d;
      if (hh.rect) { if (px >= hh.rect.x0 && px <= hh.rect.x1 && py >= hh.rect.y0 && py <= hh.rect.y1) d = 40 + (hh.prio || 0) * -1; else continue; }
      else if (hh.seg) { d = distSeg(px, py, hh.seg); if (d > 9) continue; d += 6; }
      else { d = Math.hypot(px - hh.x, py - hh.y); if (d > (hh.r || 10)) continue; }
      var score = d - (hh.prio || 0) * 3;
      if (score < bestScore) { bestScore = score; best = hh; }
    }
    return best;
  }
  function entityTitle(hh) {
    if (!hh) return '';
    var sim = MC.sim, snap = MC.snap;
    switch (hh.type) {
      case 'road': var sg = R.geo.segById[hh.id], ts = trafficMap()[hh.id]; return LL(sg.name) + (ts ? ' · ' + (ts.closed ? B('مغلق', 'closed') : B('السيولة ', 'flow ') + N(Math.round(ts.factor * 100)) + '%') : '');
      case 'exit': var e = snap.exits.filter(function (q) { return q.struct + '.' + q.id === hh.id; })[0]; return e ? LL(e.name) + ' · ' + LL(EXIT_STATE[e.state].name) : hh.id;
      case 'person': var p = snap.people.filter(function (q) { return q.key === hh.id; })[0]; return p ? (p.hero ? LL(HERO_NAME[p.hero]) : (p.name ? LL(p.name) : roleName(p.role))) + (p.room ? ' · ' + B('غرفة ', 'room ') + p.room : '') + ' · ' + LL(PERSON_ST[personState(p, !!snap.alert) || 'calm'].name) : hh.id;
      case 'station': var a = assetById(hh.id); return a ? LL(a.name) : hh.id;
      case 'unit': return hh.id.split(':')[1] ? LL(UNIT[hh.id.split(':')[1]].name) + ' · ' + LL((assetById(hh.id.split(':')[0]) || {}).name) : hh.id;
      case 'water': return B('عمق الماء في النفق', 'Water depth at the underpass') + (R.flood ? ' · ' + N(R.flood.cm) + ' ' + B('سم', 'cm') : '');
      case 'assembly': var as = WI.assembly.filter(function (q) { return q.id === hh.id; })[0]; return as ? LL(as.name) : hh.id;
      case 'shelter': var sh = WI.shelters.filter(function (q) { return q.id === hh.id; })[0]; return sh ? LL(sh.name) : hh.id;
      case 'room': return /^[A-Z]/.test(hh.id) ? hh.id : B('غرفة ', 'Room ') + hh.id;
      case 'building': return LL(R.geo.bbox[hh.id].name);
      case 'sentinel': return B('حسّاس: ', 'Sentinel: ') + hh.id.replace(/^node:/, '');
      case 'hub': return B('مركز الحسّاسات — ', 'Sentinel hub — ') + hh.id;
      case 'drone': return B('الطائرة المسيّرة — ', 'Drone — ') + (snap.drone ? snap.drone.state : '');
      default: return hh.id;
    }
  }
  function roleName(r) { return ({ resident: T('مقيم', 'Resident'), guard: T('حارس', 'Guard'), teacher: T('معلّم', 'Teacher'), pupil: T('تلميذ', 'Pupil'), staff: T('موظف', 'Staff'), passerby: T('عابر', 'Passer-by') }[r]) ? LL({ resident: T('مقيم', 'Resident'), guard: T('حارس', 'Guard'), teacher: T('معلّم', 'Teacher'), pupil: T('تلميذ', 'Pupil'), staff: T('موظف', 'Staff'), passerby: T('عابر', 'Passer-by') }[r]) : r; }
  function assetById(id) { for (var i = 0; i < WI.assets.length; i++) if (WI.assets[i].id === id) return WI.assets[i]; return null; }

  /* ====================================================================================
   * 6. OPERATOR CHROME — toolbar, HUD, timeline, popovers, pointer / keyboard handling, the frame loop
   * ==================================================================================== */
  var UI = {};                       // references to the chrome elements
  function btn(cls, iconName, ar, en, onclick, extra) {
    var b = h('button', { type: 'button', class: cls, onclick: onclick });
    if (iconName) b.appendChild(icon(iconName));
    if (ar) b.appendChild(bi(ar, en));
    if (extra) for (var k in extra) b.setAttribute(k, extra[k]);
    return b;
  }
  function iconBtn(iconName, ar, en, onclick, cls) { var b = h('button', { type: 'button', class: 'icon-btn ' + (cls || ''), onclick: onclick }); b.appendChild(icon(iconName)); lab(b, 'aria-label', ar, en); lab(b, 'title', ar, en); return b; }
  function seg(items, get, set, label) {            // segmented radio-like control: items [{id, ar, en, icon?}]
    var wrap = h('div', { class: 'seg', role: 'group' }); if (label) lab(wrap, 'aria-label', label[0], label[1]);
    var btns = items.map(function (it) {
      var b = h('button', { type: 'button', class: 'seg-b', 'data-id': it.id, onclick: function () { set(it.id); sync(); } });
      if (it.icon) b.appendChild(icon(it.icon)); b.appendChild(bi(it.ar, it.en, 'span')); if (it.hideLabel) b.lastChild.classList.add('seg-lab');
      if (it.ar2) lab(b, 'title', it.ar2, it.en2);
      if (it.hideLabel) lab(b, 'aria-label', it.ar2 || it.ar, it.en2 || it.en);
      wrap.appendChild(b); return b;
    });
    function sync() { var cur = get(); btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-id') === String(cur) ? 'true' : 'false'); }); }
    wrap._sync = sync; sync(); return wrap;
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() {
        try { var ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;inset-block-start:0;inset-inline-start:0;opacity:0' }); ta.value = text; doc.body.appendChild(ta); ta.select(); var ok = doc.execCommand('copy'); ta.remove(); resolve(!!ok); } catch (e) { resolve(false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback); else fallback();
    });
  }
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
    doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 400);
  }

  function syncPlayUI() {
    if (!UI.play) return;
    var playing = MC.playing && !(MC.sim && MC.sim.done);
    UI.play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    UI.play.replaceChildren(icon(playing ? 'pause' : 'play'), bi(playing ? 'إيقاف مؤقت' : 'تشغيل', playing ? 'Pause' : 'Play'));
    UI.play.classList.toggle('is-playing', playing);
    if (UI.speed && UI.speed._sync) UI.speed._sync();
  }
  function setPlaying(on) { MC.playing = !!on; if (on && MC.sim && MC.sim.done) { MC.playing = false; } MC.seekTarget = null; syncPlayUI(); }
  function setSpeed(s) { MC.speed = s; MC.debt = 0; updateHash(); syncPlayUI(); }
  function setView(v) {
    if (v === MC.view) return;
    MC.view = v; closePop(); R.hits = []; var stg = $('#mc-stage'); if (stg) stg.setAttribute('data-view', v);
    if (v === 'building') { var pi = presetInfo(MC.sim.preset); MC.bStruct = pi.struct != null ? pi.struct : (pi.scope && pi.scope[0] === 'SCH' ? 1 : 0); R.bl = bLayout(); }
    fitView(); updateScaleBar(); syncChrome(); updateHash();
    MC.drawDirty = true; MC.panelsDirty = true;
  }
  function setBStruct(i) { MC.bStruct = i; R.bl = bLayout(); fitView(); syncChrome(); MC.drawDirty = true; MC.panelsDirty = true; }
  function setTool(t) { MC.tool = t; closePop(); syncChrome(); if (t !== 'inspect') toastTool(t); R.cvs.style.cursor = t === 'inspect' ? '' : 'crosshair'; }
  function toastTool(t) {
    var m = { jam: T('أداة الازدحام: انقر على طريق لإبطائه (انقر ثانيةً لإزالته).', 'Jam tool: click a road to slow it (click again to clear).'),
      close: T('أداة الإغلاق: انقر على طريق لإغلاقه (انقر ثانيةً لإعادة فتحه).', 'Close tool: click a road to close it (click again to reopen).'),
      origin: T('أداة المصدر: في منظور المبنى انقر على غرفة لتبدأ فيها النار.', 'Origin tool: in the Building view, click a room to start the fire there.') }[t];
    if (m) Manara.toast(m, '', 3600);
  }
  function updateScaleBar() {
    if (!UI.scale) return;
    var cam = MC.view === 'map' ? R.cam.map : R.cam.bld, pxPerM = cam.k / WI.cellM, cands = [5, 10, 20, 25, 50, 100, 200, 500], pick = cands[0];
    cands.forEach(function (m) { if (m * pxPerM <= 110) pick = m; });
    UI.scaleBar.style.width = Math.round(pick * pxPerM) + 'px'; setText(UI.scaleTxt, N(pick) + ' ' + B('م', 'm'));
  }
  function setPresent(on) {
    MC.present = !!on; MC.panelsDirty = true; document.body.classList.toggle('present', MC.present);
    if (UI.presentBtn) UI.presentBtn.setAttribute('aria-pressed', MC.present ? 'true' : 'false');
    if (MC.present) { try { var el = $('#mc-center'); if (!doc.fullscreenElement && htmlEl.requestFullscreen && matchMedia('(min-width: 1000px)').matches && false) htmlEl.requestFullscreen(); } catch (e) { /* optional */ } }
    setTimeout(function () { resizeCanvas(); fitView(); MC.drawDirty = true; }, 60);
    if (typeof layoutApply === 'function') layoutApply();
  }

  /* ---- toolbar ---- */
  function buildToolbar() {
    var tb = $('#mc-toolbar'); tb.replaceChildren();
    UI.play = btn('btn btn-primary btn-sm mc-play', 'play', 'تشغيل', 'Play', function () { setPlaying(!(MC.playing && !MC.sim.done)); });
    UI.speed = seg([{ id: 1, ar: '١×', en: '1×' }, { id: 4, ar: '٤×', en: '4×' }, { id: 16, ar: '١٦×', en: '16×' }], function () { return MC.speed; }, function (v) { setSpeed(+v); }, ['سرعة المحاكاة', 'Simulation speed']);
    UI.reset = iconBtn('reset', 'إعادة ضبط التشغيل (Shift+R)', 'Reset the run (Shift+R)', function () { startRun({ keepCamera: true }); Manara.toast(T('أُعيد ضبط التشغيل بنفس البذرة والسيناريو.', 'The run was reset with the same seed and scenario.'), '', 2600); });
    UI.time = h('div', { class: 'mc-time mono', 'aria-hidden': 'true' }, UI.timeA = h('b', { text: '0:00' }), UI.timeB = h('span', { class: 'muted', text: '' }));
    UI.timeLive = h('span', { class: 'sr-only', role: 'timer', 'aria-live': 'off' });
    UI.seed = h('input', { class: 'input mono mc-seed', type: 'number', min: '1', max: '999999', step: '1', value: String(MC.seed), 'aria-label': 'seed' });
    lab(UI.seed, 'aria-label', 'بذرة العشوائية', 'Random seed');
    UI.seed.addEventListener('change', function () { var v = Math.max(1, Math.min(999999, Math.floor(+UI.seed.value || 1))); UI.seed.value = v; startRun({ seed: v, keepCamera: true }); });
    UI.seed.addEventListener('keydown', function (e) { e.stopPropagation(); });
    var rnd = iconBtn('dice', 'بذرة عشوائية', 'Random seed', function () { var v = 1 + Math.floor(Math.random() * 99999); UI.seed.value = v; startRun({ seed: v, keepCamera: true }); });
    var seedWrap = h('label', { class: 'mc-seedwrap' }, h('span', { class: 'mc-lbl' }, bi('البذرة', 'Seed')), UI.seed);
    UI.share = iconBtn('link', 'نسخ رابط المشاركة (السيناريو + البذرة)', 'Copy share link (scenario + seed)', function () { updateHash(); copyText(shareURL()).then(function (ok) { Manara.toast(ok ? T('نُسخ الرابط (السيناريو + البذرة).', 'Link copied (scenario + seed).') : T('انسخ الرابط من شريط العنوان.', 'Copy the link from the address bar.'), ok ? 'safe' : 'warn', 3200); }); });
    UI.presentBtn = btn('btn btn-ghost btn-sm', 'present', 'عرض', 'Present', function () { setPresent(!MC.present); }, { 'aria-pressed': 'false' });
    lab(UI.presentBtn, 'title', 'وضع العرض للشاشة الكبيرة (P)', 'Presentation mode for the booth screen (P)'); lab(UI.presentBtn, 'aria-label', 'وضع العرض للشاشة الكبيرة (P)', 'Presentation mode for the booth screen (P)');
    UI.keys = iconBtn('keyboard', 'اختصارات لوحة المفاتيح', 'Keyboard shortcuts', function (e) { openKeysPop(e.currentTarget); });
    var g1 = h('div', { class: 'mc-tg' }, UI.play, UI.speed, UI.reset);
    var g2 = h('div', { class: 'mc-tg mc-tg-time' }, UI.time);
    var g3 = h('div', { class: 'mc-tg' }, seedWrap, rnd, UI.share);
    var g4 = h('div', { class: 'mc-tg mc-tg-end' }, UI.presentBtn, UI.keys);
    tb.appendChild(g1); tb.appendChild(g2); tb.appendChild(g3); tb.appendChild(g4);
    lab(tb, 'aria-label', 'أدوات التشغيل', 'Playback tools');
  }
  function openKeysPop(anchor) {
    var rows = [['Space', B('تشغيل / إيقاف', 'Play / pause')], ['1 · 2 · 3', B('سرعة ١× · ٤× · ١٦×', 'Speed 1× · 4× · 16×')], ['Shift+R', B('إعادة الضبط', 'Reset')], ['A', B('اعتماد التنبيه (المفتاح البشري)', 'Approve the alert (human key)')],
      ['H', B('إيقاف التنبيه — إنذار كاذب', 'Hold — treat as false alarm')], ['B', B('خريطة ⇄ مبنى', 'Map ⇄ building')], ['P', B('وضع العرض', 'Present mode')], ['+  −  0', B('تكبير / تصغير / ملاءمة', 'Zoom in / out / fit')],
      [B('الأسهم', 'Arrows'), B('تحريك الخريطة (والتركيز على الخريطة)', 'Pan the map (map focused)')], ['N', B('عنصر الخريطة التالي — Enter للفحص', 'Next map item — Enter to inspect')], ['Esc', B('إغلاق النافذة / أداة الفحص', 'Close popup / Inspect tool')]];
    var body = h('table', { class: 'kbd-table' }, rows.map(function (r) { return h('tr', null, h('td', null, h('kbd', { text: r[0] })), h('td', { text: r[1] })); }));
    openPopAt({ title: T('اختصارات لوحة المفاتيح', 'Keyboard shortcuts'), node: body }, anchor);
  }

  /* ---- timeline ---- */
  var TL_EVENTS = { suspect: 'verify', confirmed: 'verify', approved: 'verify', 'public-alert': 'alert', ignition: 'hazard', flashover: 'hazard', 'local-alarm': 'verify', drone: 'drone',
    dispatched: 'dispatch', 'unit-on-scene': 'dispatch', redispatch: 'dispatch', 'exit-set': 'guide', 'exit-state': 'guide', 'dead-end': 'guide', reroute: 'guide', cordon: 'dispatch', rejected: 'verify', 'case-confirmed': 'verify', collapse: 'people', end: 'hazard' };
  function buildTimeline() {
    var tl = $('#mc-timeline'); tl.replaceChildren();
    UI.tlRange = h('input', { type: 'range', class: 'mc-range', min: '0', max: '1200', step: '1', value: '0' });
    lab(UI.tlRange, 'aria-label', 'خط زمن المحاكاة — اسحب للرجوع أو التقدّم', 'Simulation timeline — drag to rewind or fast-forward');
    UI.tlRange.addEventListener('input', function () { seekTo(+UI.tlRange.value); });
    UI.tlMarks = h('div', { class: 'mc-marks', 'aria-hidden': 'true' });
    UI.tlReach = h('div', { class: 'mc-reach', 'aria-hidden': 'true' });
    UI.tlStart = h('span', { class: 'mono mc-tl-s', text: '0:00' }); UI.tlEnd = h('span', { class: 'mono mc-tl-e', text: '20:00' });
    var prev = iconBtn('chevron', 'الحدث السابق', 'Previous event', function () { jumpEvent(-1); }), next = iconBtn('chevron', 'الحدث التالي', 'Next event', function () { jumpEvent(1); });
    prev.firstChild.classList.add('flip'); prev.classList.add('mc-ev-prev'); next.classList.add('mc-ev-next');
    var track = h('div', { class: 'mc-track', dir: 'ltr' }, UI.tlReach, UI.tlMarks, UI.tlRange);
    tl.appendChild(h('div', { class: 'mc-tl' }, prev, UI.tlStart, track, UI.tlEnd, next));
    UI.tlSig = '';
  }
  XICON.chevron = '<path d="M9 5l7 7-7 7"/>';
  function jumpEvent(dir) {
    var t = simNow(), best = null, evs = MC.sim.events.filter(function (e) { return TL_EVENTS[e.type]; });
    if (dir > 0) { for (var i = 0; i < evs.length; i++) if (evs[i].t > t) { best = evs[i].t; break; } }
    else { for (var j = evs.length - 1; j >= 0; j--) if (evs[j].t < t) { best = evs[j].t; break; } }
    if (best != null) seekTo(best); else Manara.toast(dir > 0 ? T('لا حدث لاحق بعد — شغّل المحاكاة.', 'No later event yet — run the simulation.') : T('لا حدث سابق.', 'No earlier event.'), '', 2200);
  }
  function refreshTimeline() {
    var sim = MC.sim, dur = sim.durationSec;
    UI.tlRange.max = String(dur); if (document.activeElement !== UI.tlRange || MC.seekTarget == null) UI.tlRange.value = String(sim.t);
    UI.tlRange.setAttribute('aria-valuetext', mmss(sim.t) + ' (' + MC.snap.clock + ')');
    UI.tlReach.style.width = (MC.maxT / dur * 100) + '%';
    setText(UI.tlEnd, mmss(dur));
    var sig = sim.events.length + ':' + dur + ':' + MC.preset;
    if (sig !== UI.tlSig) {
      UI.tlSig = sig; UI.tlMarks.replaceChildren();
      sim.events.forEach(function (e) {
        var c = TL_EVENTS[e.type]; if (!c) return;
        var m = h('i', { class: 'mk mk-' + c, style: 'inset-inline-start:' + (e.t / dur * 100) + '%' }); m.title = mmss(e.t) + ' ' + LL(e.text); UI.tlMarks.appendChild(m);
      });
    }
    setText(UI.timeA, mmss(sim.t)); setText(UI.timeB, ' / ' + mmss(dur) + (sim.done ? ' · ' + B('انتهى', 'END') : ''));
  }

  /* ---- HUD over the map ---- */
  function buildHud() {
    var hud = $('#mc-hud'); hud.replaceChildren();
    UI.hudSim = h('span', { class: 'tag warn mc-simchip' }, bi('محاكاة', 'SIM'));
    lab(UI.hudSim, 'title', 'محاكاة — فحص لآلية العمل وليس دليلاً على الأثر', 'SIMULATION — a mechanism check, not proof of impact');
    UI.hudFict = h('span', { class: 'tag info mc-simchip mc-fictchip' }, bi('وحدات وهمية', 'FICTIONAL UNITS'));
    lab(UI.hudFict, 'title', 'المحطات والمستشفيات ومراكز الشرطة على هذه الخريطة وهمية، وكل الأزمنة محاكاة', 'Every station, hospital and police post on this map is fictional; every time is simulated');
    UI.hudClock = h('b', { class: 'mono mc-hclock', text: '04:00:00' });
    UI.hudPhase = h('span', { class: 'mc-phasepill' }); UI.hudSiren = h('span', { class: 'mc-sirenpill' });
    var tl = h('div', { class: 'hud-tl' }, h('div', { class: 'hud-row' }, UI.hudSim, UI.hudFict, UI.hudClock), h('div', { class: 'hud-row' }, UI.hudPhase, UI.hudSiren));
    // view + tools (top-end)
    var viewSeg = seg([{ id: 'map', ar: 'الخريطة', en: 'Map', icon: 'map' }, { id: 'building', ar: 'المبنى', en: 'Building', icon: 'building' }], function () { return MC.view; }, setView, ['المنظور', 'View']);
    UI.viewSeg = viewSeg;
    UI.bSeg = seg([{ id: 0, ar: 'السكن', en: 'Residence' }, { id: 1, ar: 'المدرسة', en: 'School' }], function () { return MC.bStruct; }, function (v) { setBStruct(+v); }, ['المبنى المعروض', 'Building shown']);
    UI.bSeg.classList.add('mc-bseg');
    UI.windMini = h('div', { class: 'mc-windmini' });
    UI.bNote = h('p', { class: 'mc-bnote', 'aria-hidden': 'true' });
    var tr = h('div', { class: 'hud-tr' }, viewSeg, UI.bSeg, UI.windMini);
    tr._needsScale = true;
    // tools + zoom (bottom-end)
    UI.toolSeg = seg([{ id: 'inspect', ar: 'فحص', en: 'Inspect', icon: 'target', hideLabel: true, ar2: 'فحص: انقر على أي عنصر', en2: 'Inspect: click any item' },
      { id: 'jam', ar: 'ازدحام', en: 'Jam', icon: 'car', hideLabel: true, ar2: 'أداة الازدحام: انقر على طريق', en2: 'Jam tool: click a road' },
      { id: 'close', ar: 'إغلاق', en: 'Close', icon: 'x', hideLabel: true, ar2: 'أداة إغلاق الطرق', en2: 'Close-road tool' },
      { id: 'origin', ar: 'المصدر', en: 'Origin', icon: 'pin', hideLabel: true, ar2: 'أداة مصدر الحريق: انقر على غرفة', en2: 'Fire-origin tool: click a room' }], function () { return MC.tool; }, setTool, ['أداة الخريطة', 'Map tool']);
    UI.toolSeg.classList.add('mc-toolseg');
    var zoom = h('div', { class: 'mc-zoom' }, iconBtn('zoomin', 'تكبير (+)', 'Zoom in (+)', function () { camZoom(1.4); }, 'sm'), iconBtn('zoomout', 'تصغير (−)', 'Zoom out (−)', function () { camZoom(1 / 1.4); }, 'sm'), iconBtn('full', 'ملاءمة الشاشة (0)', 'Fit to screen (0)', function () { fitView(); updateScaleBar(); }, 'sm'), iconBtn('target', 'ركّز على موقع الحادث', 'Focus on the incident', function () { focusIncident(); }, 'sm'));
    UI.scaleBar = h('i', { class: 'mc-scalebar' }); UI.scaleTxt = h('span', { class: 'mono' });
    UI.scale = h('div', { class: 'mc-scale', 'aria-hidden': 'true' }, UI.scaleBar, UI.scaleTxt, h('span', { class: 'mc-north' }, bi('شمال ↑', 'N ↑')));
    var br = h('div', { class: 'hud-br' }, UI.toolSeg, zoom);
    tr.appendChild(UI.scale); tr.appendChild(UI.bNote);
    // legend + layers (bottom-start)
    UI.legend = h('div', { class: 'mc-legend' });
    UI.layerBtn = iconBtn('layers', 'الطبقات', 'Layers', function (e) { openLayersPop(e.currentTarget); }, 'mc-layerbtn');
    var bl = h('div', { class: 'hud-bl' }, UI.layerBtn, UI.legend);
    UI.banner = h('div', { class: 'hud-banner', role: 'status', hidden: '' });
    UI.tip = h('div', { class: 'mc-tip', hidden: '', role: 'tooltip' });
    UI.pop = h('div', { class: 'mc-pop', hidden: '', role: 'dialog', 'aria-modal': 'false' });
    UI.presentKpi = h('div', { class: 'mc-presentkpi', 'aria-hidden': 'true' });
    hud.appendChild(tl); hud.appendChild(tr); hud.appendChild(br); hud.appendChild(bl); hud.appendChild(UI.banner); hud.appendChild(UI.tip); hud.appendChild(UI.pop);
    var ctr = $('#mc-center'); if (ctr) ctr.appendChild(UI.presentKpi);
    buildLegend();
  }
  function buildLegend() {
    UI.legend.replaceChildren();
    ['asleep', 'alerted', 'moving', 'safe', 'help', 'unacc'].forEach(function (k) {
      var sw = h('i', { class: 'lg-dot' + (k === 'unacc' ? ' ring' : ''), style: '--c:var(' + PERSON_ST[k].tok + ')' });
      UI.legend.appendChild(h('span', { class: 'lg' }, sw, bi(PERSON_ST[k].name.ar, PERSON_ST[k].name.en)));
    });
  }
  function openLayersPop(anchor) {
    var body = h('div', { class: 'stack' });
    [['hazard', 'الخطر (نار/دخان/غاز/ماء/غبار)', 'Hazard (fire, smoke, gas, water, dust)'], ['traffic', 'الازدحام على الطرق', 'Traffic on roads'], ['routes', 'المسارات', 'Routes'], ['people', 'الأشخاص', 'People'], ['units', 'الوحدات والطائرة', 'Responders and drone'], ['sensors', 'الحسّاسات', 'Sentinels']].forEach(function (l) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = !!MC.layers[l[0]];
      cb.addEventListener('change', function () { MC.layers[l[0]] = cb.checked; MC.drawDirty = true; });
      body.appendChild(h('label', { class: 'switch' }, cb, bi(l[1], l[2])));
    });
    var lg = h('div', { class: 'pop-legend' }, h('b', { class: 'pop-sub' }, bi('دلالة ألوان الأشخاص', 'What the dots mean')));
    ['asleep', 'alerted', 'moving', 'safe', 'help', 'unacc'].forEach(function (k) {
      lg.appendChild(h('span', { class: 'lg' }, h('i', { class: 'lg-dot' + (k === 'unacc' ? ' ring' : ''), style: '--c:var(' + PERSON_ST[k].tok + ')' }), bi(PERSON_ST[k].name.ar, PERSON_ST[k].name.en)));
    });
    body.appendChild(lg);
    openPopAt({ title: T('الطبقات', 'Layers'), node: body }, anchor);
  }
  function windDir8(deg) {
    var n = [T('الشمال', 'N'), T('الشمال الشرقي', 'NE'), T('الشرق', 'E'), T('الجنوب الشرقي', 'SE'), T('الجنوب', 'S'), T('الجنوب الغربي', 'SW'), T('الغرب', 'W'), T('الشمال الغربي', 'NW')];
    return n[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  function refreshHud() {
    var s = MC.snap, v = s.verification;
    setText(UI.hudClock, s.clock);
    var ph = v.phase, txt, cls;
    if (ph === 'public') { txt = B('تنبيه عام فعّال', 'PUBLIC ALERT LIVE'); cls = 'public'; }
    else if (ph === 'confirmed') { txt = B('مؤكَّد — بانتظار اعتمادك', 'CONFIRMED — approve?'); cls = 'confirmed'; }
    else if (ph === 'suspect') { txt = B('اشتباه — مفتاح واحد', 'SUSPECT — one key'); cls = 'suspect'; }
    else { txt = (MC.sim.hz && MC.sim.hz.started) ? B('مراقبة', 'Watching') : B('وضع طبيعي', 'All normal'); cls = 'idle'; }
    setText(UI.hudPhase, txt); UI.hudPhase.className = 'mc-phasepill ph-' + cls;
    setText(UI.hudSiren, s.localAlarm.on ? B('الإنذار المحلي يعمل', 'Local alarm ON') : ''); UI.hudSiren.hidden = !s.localAlarm.on;
    // wind mini
    var w = s.wind, rot = (w.deg + 180) % 360;
    if (!UI.windSvg) {
      UI.windSvg = sv('svg', { viewBox: '-14 -14 28 28', width: '30', height: '30', 'aria-hidden': 'true' }, sv('circle', { r: '12.5', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.35' }), UI.windArrow = sv('path', { d: 'M0 -9 L4.5 4 L0 1.8 L-4.5 4 Z', fill: 'currentColor' }));
      UI.windTxt = h('span', { class: 'mc-windtxt' }); UI.windMini.appendChild(UI.windSvg); UI.windMini.appendChild(UI.windTxt);
    }
    UI.windArrow.setAttribute('transform', 'rotate(' + rot + ')');
    setText(UI.windTxt, B('رياح من ', 'Wind from ') + LL(windDir8(w.deg)) + ' · ' + N(w.speed, 1) + ' ' + B('م/ث', 'm/s'));
    // banner
    var b = MC.banner;
    if (b) {
      UI.banner.hidden = false; UI.banner.className = 'hud-banner ' + (b.type === 'redispatch' ? 'warn' : 'info');
      UI.banner.replaceChildren(icon(b.type === 'redispatch' ? 'alert' : 'route'), h('span', null, h('b', { text: b.type === 'redispatch' ? B('إعادة إرسال تلقائية: ', 'AUTOMATIC RE-DISPATCH: ') : b.type === 'far-but-faster' ? B('أبعد لكن أسرع: ', 'FARTHER BUT FASTER: ') : B('تغيّرت التوصية: ', 'RECOMMENDATION CHANGED: ') }), ' ', LL(b.text)), btn('icon-btn sm', 'x', null, null, function () { MC.banner = null; refreshHud(); }, { 'aria-label': B('إخفاء', 'Dismiss') }));
    } else UI.banner.hidden = true;
    if (MC.view === 'building') setText(UI.bNote, N(outsideCount()) + ' ' + B('آخرون خارج هذا المبنى — انتقل إلى الخريطة', 'others are outside this building — switch to the map')); else setText(UI.bNote, '');
    // present KPIs
    if (MC.present) renderPresentKpi();
    // summary for screen readers
    setText($('#mc-map-summary'), summaryText());
  }
  function summaryText() {
    var s = MC.snap, c = s.counts, hc = s.headcount, u = s.dispatch ? s.dispatch.units.filter(function (x) { return x.assetId; }) : [];
    return B('خريطة المحاكاة. ', 'Simulation map. ') + LL(HZ[s.hazard].name) + ', ' + s.clock + '. ' + B('الحالة: ', 'Status: ') + s.verification.phase + '. ' +
      (hc ? N(hc.safe + hc.safeAway) + ' / ' + N(hc.registered) + ' ' + B('بأمان', 'safe') + '. ' : '') + (u.length ? u.map(function (x) { return LL(UNIT[x.kind].name) + ' ' + mmss(x.etaSec); }).join(', ') + '.' : '');
  }
  function renderPresentUnits() {
    var P = UI.proof, d = MC.snap.dispatch; if (!P || !P.pu) return;
    var units = d ? d.units.filter(function (u) { return u.assetId; }) : [], hp = d ? d.hospital : null;
    var sig = lang() + units.map(function (u) { return u.kind + u.assetId + u.state + (u.state === 'on-scene' ? '' : Math.round(u.etaSec)); }).join() + (hp ? hp.id + Math.round(hp.etaSec) : '');
    if (P.puSig === sig) return; P.puSig = sig; P.pu.replaceChildren();
    if (!units.length) return;
    P.pu.appendChild(h('div', { class: 'pu-h' }, h('b', null, bi('الاستجابة: الأسرع وليس الأقرب', 'Dispatch: the fastest, not the nearest')), simTag(), fictionalTag()));
    units.forEach(function (u) {
      P.pu.appendChild(h('div', { class: 'pu-row' }, h('span', { class: 'uico', style: '--c:var(' + UNIT[u.kind].tok + ')' }, icon(UNIT[u.kind].icon)),
        h('span', { class: 'pu-n' }, h('b', { text: stripDemo(LL(u.name)) }), h('small', { class: 'muted', text: LL(UNIT[u.kind].name) + ' · ' + LL(STATE_L[u.state]) })),
        h('b', { class: 'mono pu-eta', text: u.state === 'on-scene' ? B('في الموقع', 'on scene') : mmss(u.etaSec) })));
    });
    if (hp) P.pu.appendChild(h('div', { class: 'pu-row' }, h('span', { class: 'uico', style: '--c:var(--danger)' }, icon('hospital')), h('span', { class: 'pu-n' }, h('b', { text: stripDemo(LL(hp.name)) }), h('small', { class: 'muted', text: B('المستشفى الوجهة', 'Destination hospital') })), h('b', { class: 'mono pu-eta', text: mmss(hp.etaSec) })));
  }
  function renderPresentKpi() {
    renderPresentUnits();
    var s = MC.snap, hc = s.headcount, u = s.dispatch ? s.dispatch.units.filter(function (x) { return x.assetId && x.kind === 'fire' || x.assetId && x.kind === 'ambulance'; })[0] : null;
    UI.presentKpi.replaceChildren(
      h('div', { class: 'pk' }, h('small', { text: B('الساعة', 'Clock') }), h('b', { class: 'mono', text: s.clock })),
      h('div', { class: 'pk' }, h('small', { text: B('الحالة', 'Status') }), h('b', { text: UI.hudPhase.textContent })),
      hc ? h('div', { class: 'pk ' + (hc.unaccounted ? 'warn' : 'safe') }, h('small', { text: B('بأمان / المسجّلون', 'Safe / registered') }), h('b', { class: 'mono' }, h('bdi', { dir: 'ltr', text: N(hc.safe + hc.safeAway) + ' / ' + N(hc.registered) }))) : null,
      u ? h('div', { class: 'pk cool' }, h('small', { text: LL(UNIT[u.kind].name) + ' · ' + B('الوصول', 'ETA') }), h('b', { class: 'mono', text: u.state === 'on-scene' ? B('في الموقع', 'on scene') : mmss(u.etaSec) })) : null);
  }

  /* ---- popover (inspect / actions / help). Content is built with DOM nodes only. ---- */
  function closePop() { if (UI.pop) { UI.pop.hidden = true; UI.pop.replaceChildren(); MC.popFor = null; } }
  function openPopAt(spec, anchorOrXY) {
    var pop = UI.pop, st = $('#mc-stage').getBoundingClientRect(), x, y;
    pop.replaceChildren(h('div', { class: 'pop-h' }, h('b', { text: LL(spec.title) }), btn('icon-btn sm', 'x', null, null, closePop, { 'aria-label': B('إغلاق', 'Close') })), spec.node);
    pop.hidden = false;
    if (anchorOrXY && anchorOrXY.getBoundingClientRect) { var r = anchorOrXY.getBoundingClientRect(); x = r.left - st.left; y = r.bottom - st.top + 6; }
    else if (anchorOrXY) { x = anchorOrXY.x + 12; y = anchorOrXY.y + 12; } else { x = 20; y = 60; }
    var pw = Math.min(300, st.width - 16);
    pop.style.maxWidth = pw + 'px';
    var ph = pop.offsetHeight || 160;
    x = clamp(x, 8, Math.max(8, st.width - pw - 8)); y = clamp(y, 8, Math.max(8, st.height - ph - 8));
    pop.style.insetInlineStart = 'auto'; pop.style.left = x + 'px'; pop.style.top = y + 'px';
    var first = $('button, input', pop); if (first && !spec.noFocus) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  /* ---- entity inspection + the operator actions behind each map object ---- */
  function kvRows(rows) { return h('dl', { class: 'pop-kv' }, rows.map(function (r) { return [h('dt', { text: r[0] }), h('dd', { text: r[1] })]; })); }
  function actBtn(ar, en, fn, kind) { return btn('btn btn-sm ' + (kind || 'btn-ghost'), null, ar, en, function () { fn(); }); }
  function faultAdd(ch) {
    if (ch.unit === 'm') return -(Math.max(0, ch.value || 0) - ch.thrActive * 0.4);           // visibility: lower is worse
    return Math.max(ch.thrActive * 1.7, ch.thrActive + 5);
  }
  function faultChannel(id, sec) {
    var ch = null; MC.sim.sensors.forEach(function (c) { if (c.id === id) ch = c; });
    if (!ch) return false;
    act('inject', { ch: id, add: faultAdd({ unit: ch.unit, value: ch.value, thrActive: ch.thrActive }), sec: sec || 60 });
    Manara.toast(T('عُطِّل حسّاس واحد (قراءة عالية عالقة 60 ث). مفتاح واحد لا يكفي أبدًا للتأكيد.', 'One sentinel now reads stuck-high for 60 s. One key can never confirm.'), 'warn', 4200);
    return true;
  }
  function setOrigin(room) {
    var pi = presetInfo(MC.preset);
    if (pi.hazard !== 'fire') { Manara.toast(T('في هذا الإصدار يمكن نقل مصدر الحريق فقط؛ مصدر الغاز والسيل والحرارة ثابت في السيناريو.', 'Only the fire origin can be moved in this version; the gas, flood and heat origins are fixed by the scenario.'), 'warn', 5000); return false; }
    var si = pi.struct != null ? pi.struct : 0, S = WI.structs[si], node = null;
    S.nodes.forEach(function (n) { if ((n.room === room || n.id === room) && (n.type === 1 || n.type === 7)) node = n; });
    if (!node) { Manara.toast(T('اختر غرفة داخل المبنى.', 'Pick a room inside the building.'), 'warn', 2600); return false; }
    startRun({ origin: { struct: si, room: node.id }, keepCamera: true });
    Manara.toast(T('ستبدأ النار في ' + (node.cls ? 'الصف ' : 'غرفة ') + (node.room || node.id) + ' — أُعيد تشغيل المحاكاة.', 'The fire will start in ' + (node.cls ? 'class ' : 'room ') + (node.room || node.id) + ' — the run was restarted.'), 'safe', 3800);
    return true;
  }
  function inspect(hh, px, py) {
    var snap = MC.snap, sim = MC.sim, rows = [], acts = [], title = T(entityTitle(hh), entityTitle(hh)), note = null;
    MC.sel = { type: hh.type, id: hh.id }; MC.drawDirty = true;
    switch (hh.type) {
      case 'road': {
        var sg = R.geo.segById[hh.id], ts = trafficMap()[hh.id] || {}, clsN = { expressway: T('طريق سريع', 'Expressway'), major: T('رئيسي', 'Major'), minor: T('فرعي', 'Minor'), access: T('مدخل', 'Access') }[sg.cls];
        title = sg.name;
        rows.push([B('الفئة', 'Class'), LL(clsN)], [B('الطول', 'Length'), fmtDist(sg.lenM)], [B('السيولة (SIM)', 'Flow (SIM)'), ts.closed ? B('مغلق', 'closed') : N(Math.round((ts.factor || 1) * 100)) + B('٪ من الانسياب الحر', '% of free flow')]);
        if (ts.hot) rows.push([B('نقطة ساخنة', 'Hot spot'), B('طابور في هذا الوقت من اليوم', 'a queue at this time of day')]);
        if (ts.closedBy) rows.push([B('أغلقه', 'Closed by'), ts.closedBy]);
        acts.push(actBtn('أبطئ هذا الطريق', 'Jam this road', function () { act('jam', { seg: hh.id, factor: 0.15 }); closePop(); }),
          actBtn(ts.closed && ts.closedBy === 'operator' ? 'أعد فتحه' : 'أغلق الطريق', ts.closed && ts.closedBy === 'operator' ? 'Reopen' : 'Close the road', function () { act(ts.closed && ts.closedBy === 'operator' ? 'open' : 'close', { seg: hh.id }); closePop(); }));
        if (ts.jam != null) acts.push(actBtn('أزل الازدحام', 'Clear the jam', function () { act('unjam', { seg: hh.id }); closePop(); }));
        note = T('مرور محاكى (SIM). غيّر الطريق وراقب الوحدة الأسرع تتغيّر.', 'Simulated traffic (SIM). Change a road and watch the fastest unit change.');
        break;
      }
      case 'exit': {
        var e = snap.exits.filter(function (q) { return q.struct + '.' + q.id === hh.id; })[0]; if (!e) break;
        title = e.name; rows.push([B('الحالة', 'State'), LL(EXIT_STATE[e.state].name)], [B('مقفل يدويًا/افتراضيًا', 'Locked'), e.locked ? B('نعم', 'yes') : B('لا', 'no')]);
        acts.push(actBtn(e.locked ? 'افتح المخرج' : 'أقفل المخرج', e.locked ? 'Unlock this exit' : 'Lock this exit', function () { act('exit', { id: hh.id, locked: !e.locked }); closePop(); }, e.locked ? 'btn-safe' : 'btn-danger'));
        note = T('عند تغيّر المخرج تُحسب مسارات من يتأثر فقط ويصلهم تحديث.', 'When an exit changes, only the people it affects get a new route and message.');
        break;
      }
      case 'person': {
        var p = snap.people.filter(function (q) { return q.key === hh.id; })[0]; if (!p) break;
        title = p.hero ? HERO_NAME[p.hero] : (p.name || roleName(p.role));
        var needs = []; if (p.persona === 'wheelchair') needs.push('wheelchair'); if (p.persona === 'child') needs.push('child'); if (p.persona === 'elderly') needs.push('elderly'); if (p.deaf) needs.push('deaf'); if (p.blind) needs.push('blind'); if (p.asthma) needs.push('asthma');
        rows.push([B('الحالة', 'State'), LL(PERSON_ST[personState(p, !!snap.alert) || 'calm'].name)], [B('اللغة', 'Language'), LANG_NAME[p.lang] || p.lang], [B('الغرفة', 'Room'), p.room || p.cls || '–'], [B('احتياجات', 'Needs'), needs.length ? needs.map(function (n) { return LL(NEED_L[n]); }).join('، ') : '–']);
        acts.push(actBtn('«أنا بأمان»', '“I’m safe”', function () { act('checkin', { key: p.key, status: 'safe' }); closePop(); }, 'btn-safe'), actBtn('«أحتاج مساعدة»', '“I need help”', function () { act('checkin', { key: p.key, status: 'help' }); closePop(); }, 'btn-danger'));
        note = T('تُحاكي هاتف الشخص أو لوحة نقطة التجمع.', 'Simulates the person’s phone or the assembly-point tablet.');
        break;
      }
      case 'station': case 'unit': {
        var aid = hh.id.split(':')[0], a = assetById(aid), u = snap.dispatch ? snap.dispatch.units.filter(function (q) { return q.assetId === aid; }) : [], busy = !!(sim.busy && sim.busy[aid]);
        title = a.name; rows.push([B('النوع', 'Type'), LL(UNIT[a.kind].name)], [B('الحالة', 'Status'), busy ? B('مشغولة', 'busy') : B('متاحة', 'available')]);
        if (a.kind === 'hospital') rows.push([B('طوارئ/إصابات/أطفال', 'ED / trauma / paediatric'), (a.ed ? 'ED ' : '') + (a.trauma ? '· trauma ' : '') + (a.paed ? '· paed' : '')], [B('الأسرّة (افتراض)', 'Beds (assumption)'), String(a.beds)]);
        u.forEach(function (q) { rows.push([LL(UNIT[q.kind].short), (q.state === 'on-scene' ? B('في الموقع', 'on scene') : B('الوصول ', 'ETA ') + mmss(q.etaSec)) + ' · ' + LL(STATE_L[q.state])]); });
        acts.push(actBtn(busy ? 'اجعلها متاحة' : 'اجعلها مشغولة', busy ? 'Mark available' : 'Mark busy', function () { act('busy', { asset: aid, busy: !busy }); closePop(); }));
        note = T('وحدة وهمية (تجريبية) على خريطة محاكاة. 999 يبقى هو المُرسِل.', 'A fictional (demo) unit on a simulated map. 999 stays the dispatcher.');
        break;
      }
      case 'room': {
        var rm = hh.id, hc = MC.hc && MC.hc.rooms && MC.hc.rooms[rm];
        title = T('غرفة ' + rm, 'Room ' + rm);
        if (hc) rows.push([B('بأمان', 'Safe'), N(hc.safe) + ' / ' + N(hc.total)], [B('يحتاجون مساعدة', 'Need help'), N(hc.help)], [B('غير محسوبين', 'Unaccounted'), N(hc.unaccounted)]);
        acts.push(actBtn('افتح في لوحة العدّ', 'Open in the headcount', function () { selectRoom(rm); closePop(); }));
        if (presetInfo(MC.preset).hazard === 'fire') acts.push(actBtn('ابدأ النار هنا', 'Start the fire here', function () { setOrigin(rm); closePop(); }, 'btn-danger'));
        break;
      }
      case 'building': {
        var bb = R.geo.bbox[hh.id]; title = bb.name;
        if (hh.id === 'RB' || hh.id === 'SCH') { acts.push(actBtn('افتح منظور المبنى', 'Open the building view', function () { MC.bStruct = hh.id === 'SCH' ? 1 : 0; setView('building'); closePop(); })); }
        else rows.push([B('نوع', 'Type'), B('مبنى في الحيّ التجريبي', 'Building in the demo district')]);
        break;
      }
      case 'assembly': case 'shelter': {
        var list = hh.type === 'assembly' ? WI.assembly : WI.shelters, it = list.filter(function (q) { return q.id === hh.id; })[0]; title = it.name;
        rows.push([B('النوع', 'Type'), hh.type === 'assembly' ? B('نقطة تجمع', 'Assembly point') : B('مأوى مكيّف', 'Cooled shelter')]);
        break;
      }
      case 'water': {
        title = T('عمق الماء في النفق (محاكاة)', 'Water depth at the underpass (SIM)');
        rows.push([B('أعمق نقطة', 'Deepest point'), N(snap.hazardState.underpassCm != null ? snap.hazardState.underpassCm : (R.flood ? R.flood.cm : 0)) + ' ' + B('سم', 'cm')], [B('عتبة التحذير', 'Warn depth'), N(sim.P.roadCloseCm) + ' ' + B('سم', 'cm') + ' (S55)'], [B('عتبة الخطر', 'Danger depth'), N(sim.P.floodBlockCm) + ' ' + B('سم', 'cm')]);
        note = T('قيم السيناريو محاكاة؛ العتبات مشتقة من إرشاد هيئة الأرصاد الأمريكية (بحث دولي).', 'Scenario values are simulated; the thresholds are derived from US National Weather Service guidance (international research).');
        break;
      }
      case 'sentinel': {
        var id = hh.id, chs = sim.sensors.filter(function (c) { return id.indexOf('node:') === 0 ? (c.struct != null && WI.structs[c.struct].nodes[c.node] && 'node:' + WI.structs[c.struct].nodes[c.node].id === id) : c.id === id; });
        title = chs[0] ? chs[0].label : T('حسّاس', 'Sentinel');
        chs.forEach(function (c) { rows.push([c.key, (isNum(c.value) ? N(c.value, 1) : '–') + ' ' + c.unit + (c.active ? ' ● ' + B('مفتاح نشط', 'key active') : '')]); });
        if (chs[0]) acts.push(actBtn('عطّل: قراءة عالية عالقة', 'Fault: stuck-high reading', function () { faultChannel(chs[0].id, 60); closePop(); }, 'btn-danger'));
        note = T('مفتاح واحد وحده لا يتجاوز «اشتباه».', 'One key alone never goes beyond SUSPECT.');
        break;
      }
      case 'hub': {
        var act2 = sim.sensors.filter(function (c) { return c.zone === hh.id; }); title = T('مركز الحسّاسات', 'Sentinel hub');
        rows.push([B('عدد القنوات', 'Channels'), String(act2.length)], [B('نشطة', 'Active'), String(act2.filter(function (c) { return c.active; }).length)]);
        break;
      }
      case 'drone': {
        var d = snap.drone; title = T('الطائرة المسيّرة (مفهوم)', 'Drone (concept)');
        rows.push([B('الحالة', 'State'), d.state], [B('البطارية', 'Battery'), N(Math.round(d.battery * 100)) + '%'], [B('المهمة', 'Mission'), d.mission || '–'], [B('عثرت على', 'Located'), String(d.located)]);
        note = T('تشغّلها جهة مخوّلة وفق قواعد الطيران؛ ضوؤها الودّي أخضر ثابت مع وميضين أبيضين.', 'Operated by an authorised agency under aviation rules; its friendly light is steady green with two white flashes.');
        break;
      }
      default: break;
    }
    var body = h('div', { class: 'stack' }, kvRows(rows), acts.length ? h('div', { class: 'btns' }, acts) : null, note ? h('p', { class: 'pop-note' }, LL(note)) : null);
    openPopAt({ title: title, node: body, noFocus: false }, { x: px, y: py });
    MC.popFor = hh.type + ':' + hh.id;
  }
  function onMapClick(px, py) {
    var hh = hitAt(px, py);
    if (MC.tool === 'jam' || MC.tool === 'close') {
      // the road nearest to the pointer, even when a unit, a person or a label sits on top of it
      var rd = null, rdBest = 11;
      for (var ri = 0; ri < R.hits.length; ri++) { var qh = R.hits[ri]; if (qh.type === 'road' && qh.seg) { var dd = distSeg(px, py, qh.seg); if (dd < rdBest) { rdBest = dd; rd = qh; } } }
      if (rd) {
        var ts = trafficMap()[rd.id] || {};
        if (MC.tool === 'jam') { if (ts.jam != null) act('unjam', { seg: rd.id }); else act('jam', { seg: rd.id, factor: 0.15 }); }
        else { if (ts.closed && ts.closedBy === 'operator') act('open', { seg: rd.id }); else if (!ts.closed) act('close', { seg: rd.id }); }
        MC.drawDirty = true;
      } else Manara.toast(T('انقر على طريق (خط ملوّن).', 'Click on a road (a coloured line).'), '', 1800);
      return;
    }
    if (MC.tool === 'origin') {
      // a person standing in a room must not hide the room: look for the room under the pointer first
      var rm = null; for (var ri = R.hits.length - 1; ri >= 0; ri--) { var q = R.hits[ri]; if (q.type === 'room' && q.rect && px >= q.rect.x0 && px <= q.rect.x1 && py >= q.rect.y0 && py <= q.rect.y1) { rm = q; break; } }
      if (rm) setOrigin(rm.id);
      else if (hh && hh.type === 'building' && (hh.id === 'RB' || hh.id === 'SCH')) { MC.bStruct = hh.id === 'SCH' ? 1 : 0; setView('building'); }
      else if (MC.view === 'map') Manara.toast(T('انقر على مبنى السكن أو المدرسة ثم اختر غرفة.', 'Click the residence or the school, then pick a room.'), '', 2600);
      return;
    }
    if (hh) inspect(hh, px, py); else { closePop(); MC.sel = null; MC.drawDirty = true; }
  }

  /* ---- pointer: drag to pan, wheel / pinch to zoom, click to inspect ---- */
  var PT = { pts: {}, n: 0, moved: false, startX: 0, startY: 0, last: null, pinch: 0 };
  function localXY(e) { var r = R.cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function bindCanvas() {
    R.cvs.setAttribute('role', 'application');
    lab(R.cvs, 'aria-label', 'خريطة غرفة العمليات: اسحب للتحريك، العجلة أو + و − للتكبير، N للتنقل بين العناصر، Enter للفحص', 'Operations map: drag to pan, wheel or + and − to zoom, N to move between items, Enter to inspect');
    var cv = R.cvs;
    cv.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      var p = localXY(e); PT.pts[e.pointerId] = p; PT.n = Object.keys(PT.pts).length;
      if (PT.n === 1) { PT.moved = false; PT.startX = p.x; PT.startY = p.y; PT.last = p; }
      if (PT.n === 2) { var a = Object.keys(PT.pts).map(function (k) { return PT.pts[k]; }); PT.pinch = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); PT.moved = true; }
      closeTip();
    });
    cv.addEventListener('pointermove', function (e) {
      var p = localXY(e);
      if (!PT.pts[e.pointerId]) { hover(p); return; }
      PT.pts[e.pointerId] = p;
      if (PT.n === 1) {
        if (!PT.moved && Math.hypot(p.x - PT.startX, p.y - PT.startY) > 5) PT.moved = true;
        if (PT.moved) { camPan(p.x - PT.last.x, p.y - PT.last.y); PT.last = p; }
      } else if (PT.n === 2) {
        var a = Object.keys(PT.pts).map(function (k) { return PT.pts[k]; }), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (PT.pinch > 0 && d > 0) camZoom(d / PT.pinch, (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
        PT.pinch = d;
      }
    });
    function up(e) {
      var wasN = PT.n; delete PT.pts[e.pointerId]; PT.n = Object.keys(PT.pts).length;
      if (wasN === 1 && !PT.moved && e.type === 'pointerup') { var p = localXY(e); onMapClick(p.x, p.y); }
      if (PT.n === 1) { var k = Object.keys(PT.pts)[0]; PT.last = PT.pts[k]; PT.moved = true; }
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', closeTip);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = localXY(e); camZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y); }, { passive: false });
    cv.addEventListener('keydown', function (e) {
      var step = 48, used = true;
      if (e.key === 'ArrowLeft') camPan(step, 0); else if (e.key === 'ArrowRight') camPan(-step, 0); else if (e.key === 'ArrowUp') camPan(0, step); else if (e.key === 'ArrowDown') camPan(0, -step);
      else if (e.key === '+' || e.key === '=') camZoom(1.25); else if (e.key === '-' || e.key === '_') camZoom(1 / 1.25); else if (e.key === '0') { fitView(); updateScaleBar(); }
      else if (e.key === 'n' || e.key === 'N') cycleEntity(e.shiftKey ? -1 : 1);
      else if (e.key === 'Enter' || e.key === 'i') { if (MC.sel) { var hh = findHit(MC.sel.type, MC.sel.id); if (hh) inspect(hh, hh.x, hh.y); } else cycleEntity(1, true); }
      else used = false;
      if (used) e.preventDefault();
    });
  }
  function cycleEntity(dir, open) {
    var order = R.hits.filter(function (q) { return q.type === 'exit' || q.type === 'station' || q.type === 'unit' || q.type === 'assembly' || q.type === 'drone' || q.type === 'room' || (q.type === 'person' && /^(ravi|huda|abu-salem|lina)$/.test(q.id)); });
    if (!order.length) return;
    var i = -1; if (MC.sel) order.forEach(function (q, ix) { if (q.type === MC.sel.type && q.id === MC.sel.id) i = ix; });
    i = (i + dir + order.length) % order.length;
    MC.sel = { type: order[i].type, id: order[i].id }; MC.drawDirty = true; announce(entityTitle(order[i]));
    if (open) inspect(order[i], order[i].x, order[i].y);
  }
  var hoverQueued = false, hoverPos = null;
  function hover(p) {
    hoverPos = p; if (hoverQueued) return; hoverQueued = true;
    requestAnimationFrame(function () {
      hoverQueued = false; if (!hoverPos || PT.n) return;
      var hh = hitAt(hoverPos.x, hoverPos.y);
      if (!hh || hh.type === 'building' && !(hh.id === 'RB' || hh.id === 'SCH')) { closeTip(); R.cvs.style.cursor = MC.tool === 'inspect' ? '' : 'crosshair'; return; }
      R.cvs.style.cursor = 'pointer';
      UI.tip.textContent = entityTitle(hh); UI.tip.hidden = false;
      var w = $('#mc-stage').clientWidth; UI.tip.style.left = clamp(hoverPos.x + 14, 4, Math.max(4, w - UI.tip.offsetWidth - 4)) + 'px'; UI.tip.style.top = Math.max(4, hoverPos.y - 30) + 'px';
    });
  }
  function closeTip() { if (UI.tip) UI.tip.hidden = true; }

  /* ---- keyboard (global) ---- */
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if (UI.pop && !UI.pop.hidden) { closePop(); R.cvs.focus(); } else if (MC.tool !== 'inspect') setTool('inspect'); else if (MC.present) setPresent(false); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var onBtn = tag === 'BUTTON' || tag === 'A' || (t && t.getAttribute && t.getAttribute('role') === 'tab');
    var k = e.key;
    if (k === ' ' && !onBtn) { e.preventDefault(); setPlaying(!(MC.playing && !MC.sim.done)); }
    else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(4); else if (k === '3') setSpeed(16);
    else if (k === 'R' && e.shiftKey) { startRun({ keepCamera: true }); }
    else if (k === 'a' || k === 'A') { if (!onBtn || tag === 'CANVAS') doApprove(); }
    else if (k === 'h' || k === 'H') { if (!onBtn) doHold(); }
    else if (k === 'b' || k === 'B') { if (!onBtn) setView(MC.view === 'map' ? 'building' : 'map'); }
    else if (k === 'p' || k === 'P') { if (!onBtn) setPresent(!MC.present); }
    else if (tag !== 'CANVAS' && !onBtn && (k === '+' || k === '=')) camZoom(1.25); else if (tag !== 'CANVAS' && !onBtn && (k === '-' || k === '_')) camZoom(1 / 1.25); else if (tag !== 'CANVAS' && !onBtn && k === '0') { fitView(); updateScaleBar(); }
  });

  /* ---- operator decisions (shared by the big buttons, the phone strip and the keys) ---- */
  function doApprove() {
    var v = MC.snap.verification;
    if (v.phase !== 'confirmed') { Manara.toast(v.phase === 'public' ? T('التنبيه العام أُرسل بالفعل.', 'The public alert has already been sent.') : T('لا يمكن الاعتماد بعد: يلزم مفتاحان مستقلان أولًا (مفتاح واحد لا يكفي أبدًا).', 'Cannot approve yet: two independent keys are needed first (one key is never enough).'), 'warn', 3800); return false; }
    act('approve', {}); announce(B('اعتُمد التنبيه العام', 'Public alert approved')); return true;
  }
  function doHold() {
    var v = MC.snap.verification;
    if (v.phase !== 'confirmed') { Manara.toast(T('لا يوجد تنبيه مؤكَّد لإيقافه.', 'There is no confirmed alert to hold.'), '', 2400); return false; }
    act('reject', { sec: 120 }); announce(B('أُوقف التنبيه كإنذار كاذب', 'The alert was held as a false alarm')); return true;
  }

  /* ---- frame loop ---- */
  var PANEL_UPDATERS = [];
  function refreshAll() {
    if (!MC.snap) return;
    MC.hc = Sim.headcount(MC.sim);
    updateRoutes();
    refreshHud(); refreshTimeline();
    for (var i = 0; i < PANEL_UPDATERS.length; i++) { try { PANEL_UPDATERS[i](); } catch (err) { if (window.console) console.error('panel update failed', err); } }
    MC.panelsDirty = false; MC.lastPanel = now(); MC.drawDirty = true;
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = MC.last ? Math.min(0.1, (ts - MC.last) / 1000) : 0; MC.last = ts;
    var sim = MC.sim; if (!sim) return;
    var ticks = 0, t0 = now();
    if (MC.seekTarget != null) {
      while (sim.t < MC.seekTarget && !sim.done && now() - t0 < 12) { stepOnce(); ticks++; }
      if (sim.t >= MC.seekTarget || sim.done) MC.seekTarget = null;
      afterTicks();
    } else if (MC.playing && !sim.done) {
      MC.debt = Math.min(MC.debt + dt * MC.speed, 30 + MC.speed);
      while (MC.debt >= 1 && !sim.done && now() - t0 < 11) { stepOnce(); MC.debt -= 1; ticks++; }
      if (ticks) afterTicks();
      MC.achieved = ticks;
    }
    var interval = MC.playing ? 200 : 80;
    if (MC.panelsDirty && ts - MC.lastPanel > interval) refreshAll();
    if (MC.dirtyResize) { MC.dirtyResize = false; resizeCanvas(); }
    var animating = !RM.matches && MC.snap && (MC.playing || (MC.snap.dispatch && MC.snap.dispatch.units.some(function (u) { return u.assetId && u.state !== 'cleared' && u.route && u.route.length > 1; })) || (sim.hz && sim.hz.started));
    if (MC.drawDirty || (animating && (MC.playing || (ts % 66) < 17))) { R.anim = ts / 1000; draw(); MC.drawDirty = false; }
  }
  function draw() {
    if (!R.ctx || !MC.snap) return;
    if (MC.view === 'map') drawMap(); else drawBuilding();
  }

  /* ====================================================================================
   * 7. PANELS — each one is built once (stable DOM, keeps focus) and updated in place
   * ==================================================================================== */
  var PANELS = {};
  function panel(id, ar, en, o) {
    o = o || {};
    var title = h('h2', { class: 'pn-t', id: 'pn-' + id + '-t' }, bi(ar, en));
    var head = h('header', { class: 'pn-h' }, title, o.extra || null);
    var body = h('div', { class: 'pn-b' });
    var el = h('section', { class: 'pn pn-' + id + (o.cls ? ' ' + o.cls : ''), id: 'pn-' + id, 'aria-labelledby': 'pn-' + id + '-t' }, head, body);
    PANELS[id] = { id: id, el: el, head: head, body: body, ar: ar, en: en };
    return PANELS[id];
  }
  function simTag() { return h('span', { class: 'tag warn sim-tag' }, bi('محاكاة', 'SIM')); }
  function fictionalTag() { return h('span', { class: 'tag info' }, bi('وحدات وهمية', 'FICTIONAL')); }
  function chip(txt, cls) { return h('span', { class: 'tag ' + (cls || '') }, txt); }
  function barRow(label, value, max, tok, right) {
    var fill = h('i', { style: 'width:' + clamp(value / (max || 1) * 100, 0, 100) + '%;--c:var(' + (tok || '--accent') + ')' });
    return h('div', { class: 'brow' }, h('span', { class: 'brow-l' }, label), h('span', { class: 'brow-bar' }, fill), h('span', { class: 'brow-v mono' }, right != null ? right : N(value)));
  }
  function details(id, ar, en, bodyEls, open) {
    var d = h('details', { class: 'jg', id: 'jg-' + id }); if (open) d.open = true;
    d.appendChild(h('summary', null, bi(ar, en))); d.appendChild(h('div', { class: 'jg-b' }, bodyEls));
    return d;
  }
  function field(ar, en, control, hint) { return h('label', { class: 'field' }, h('span', null, bi(ar, en)), control, hint ? h('small', { class: 'muted' }, bi(hint[0], hint[1])) : null); }
  function switchRow(ar, en, checked, onchange, id) {
    var cb = h('input', { type: 'checkbox', id: id || null }); cb.checked = !!checked; cb.addEventListener('change', function () { onchange(cb.checked); });
    var row = h('label', { class: 'switch' }, cb, bi(ar, en)); row._cb = cb; return row;
  }

  /* ---- scenario picker ---- */
  function buildScenarioPanel() {
    var p = panel('scenario', 'السيناريو', 'Scenario');
    var list = h('div', { class: 'sc-list', role: 'radiogroup' }); lab(list, 'aria-label', 'اختر السيناريو', 'Choose a scenario');
    Sim.PRESET_ORDER.forEach(function (id) {
      var pre = Sim.PRESETS[id], hz = HZ[pre.hazard], night = pre.hour < 6 || pre.hour >= 19;
      var nm = { ar: pre.name.ar.replace(/\s*\([^)]*\)\s*$/, ''), en: pre.name.en.replace(/\s*\([^)]*\)\s*$/, '') };
      var b = h('button', { type: 'button', class: 'sc-card', role: 'radio', 'aria-checked': 'false', 'data-id': id, tabindex: '-1' },
        h('span', { class: 'sc-ico', style: '--c:var(' + hz.tok + ')' }, icon(hz.icon)),
        h('span', { class: 'sc-main' }, h('b', null, bi(nm.ar, nm.en)), h('small', null, bi(pre.blurb.ar, pre.blurb.en))),
        h('span', { class: 'sc-time tag ' + (night ? 'cool' : 'warn') }, icon(night ? 'moon' : 'sun'), h('span', { class: 'mono', text: hhmm(pre.hour) })));
      b.addEventListener('click', function () { startRun({ preset: id }); Manara.toast(pre.name, '', 2200); });
      b.addEventListener('keydown', function (e) {
        var ix = Sim.PRESET_ORDER.indexOf(id), d = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1 : 0;
        if (!d) return; e.preventDefault(); var nb = $$('.sc-card', list)[(ix + d + Sim.PRESET_ORDER.length) % Sim.PRESET_ORDER.length]; nb.focus(); nb.click();
      });
      list.appendChild(b);
    });
    p.body.appendChild(list);
    p.body.appendChild(h('p', { class: 'pn-foot' }, bi('اضغط على سيناريو لإعادة التشغيل. البذرة نفسها تعطي النتيجة نفسها.', 'Pick a scenario to restart. The same seed gives the same run.')));
    PANEL_UPDATERS.push(function () {
      $$('.sc-card', list).forEach(function (b) { var on = b.getAttribute('data-id') === MC.preset; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    });
    return p;
  }

  /* ---- judge controls ---- */
  function exitStructId() { var pi = presetInfo(MC.preset); return (pi.scope && pi.scope[0] === 'SCH') ? 'SCH' : 'RB'; }
  function compass() {
    var svg = sv('svg', { viewBox: '-52 -52 104 104', class: 'compass', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '359', 'aria-valuenow': '315' });
    lab(svg, 'aria-label', 'اتجاه الرياح (الجهة التي تهبّ منها)', 'Wind direction (where it blows from)');
    svg.appendChild(sv('circle', { r: '46', fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.28', 'stroke-width': '2' }));
    for (var i = 0; i < 16; i++) { var a = i * 22.5 * Math.PI / 180, r1 = i % 4 === 0 ? 38 : 42; svg.appendChild(sv('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 46, y2: -Math.cos(a) * 46, stroke: 'currentColor', 'stroke-opacity': '.45', 'stroke-width': '1.4' })); }
    var letters = [['N', 0, -29], ['E', 29, 3], ['S', 0, 33], ['W', -29, 3]];
    svg._labels = letters.map(function (l) { var t = sv('text', { x: l[1], y: l[2], 'text-anchor': 'middle', fill: 'currentColor', 'font-size': '11', 'font-weight': '700' }); t.textContent = l[0]; svg.appendChild(t); return t; });
    svg._needle = sv('g', null, sv('line', { x1: '0', y1: '-40', x2: '0', y2: '-6', stroke: 'var(--brand)', 'stroke-width': '4', 'stroke-linecap': 'round' }), sv('path', { d: 'M0 -4 L-6 -15 L6 -15 Z', fill: 'var(--brand)' }), sv('circle', { cx: '0', cy: '-40', r: '5', fill: 'var(--brand)' }));
    svg.appendChild(svg._needle);
    return svg;
  }
  function buildJudgePanel() {
    var p = panel('judge', 'ضوابط الحَكَم', 'Judge controls', { extra: simTag() });
    var J = UI.judge = {};
    // exits
    J.exits = h('div', { class: 'jx-list' });
    var gExit = details('exits', 'المخارج: أقفل أو افتح', 'Exits: lock or unlock', [J.exits, h('p', { class: 'muted small' }, bi('اقفل الدرج ب أو باب السطح وراقب المسارات تُعاد حسابها والرسائل تذهب إلى المتأثرين فقط.', 'Lock Stair B or the roof door and watch the routes recompute and only the affected people get a new message.'))], true);
    // wind
    J.compass = compass();
    J.windDeg = h('input', { type: 'number', class: 'input mono', min: '0', max: '359', step: '5', value: '315', 'aria-label': 'deg' }); lab(J.windDeg, 'aria-label', 'درجة اتجاه الرياح', 'Wind direction (degrees)');
    J.windSpd = h('input', { type: 'range', min: '0', max: '20', step: '0.5', value: '4' }); lab(J.windSpd, 'aria-label', 'سرعة الرياح (م/ث)', 'Wind speed (m/s)');
    J.windOut = h('output', { class: 'mono' });
    var wState = { deg: 315, speed: 4, drag: false };
    J.wState = wState;
    function wApply(commit) {
      wState.deg = ((Math.round(wState.deg) % 360) + 360) % 360; J.compass._needle.setAttribute('transform', 'rotate(' + wState.deg + ')'); J.compass.setAttribute('aria-valuenow', wState.deg); J.windDeg.value = wState.deg;
      J.compass.setAttribute('aria-valuetext', LL(windDir8(wState.deg))); setText(J.windOut, LL(windDir8(wState.deg)) + ' · ' + N(wState.speed, 1) + ' ' + B('م/ث', 'm/s'));
      if (commit) act('wind', { deg: wState.deg, speed: wState.speed });
    }
    J.wApply = wApply;
    function ang(e) { var r = J.compass.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); return Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 / 5) * 5; }
    J.compass.addEventListener('pointerdown', function (e) { wState.drag = true; try { J.compass.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } wState.deg = ang(e); wApply(false); });
    J.compass.addEventListener('pointermove', function (e) { if (wState.drag) { wState.deg = ang(e); wApply(false); } });
    J.compass.addEventListener('pointerup', function () { if (wState.drag) { wState.drag = false; wApply(true); } });
    J.compass.addEventListener('keydown', function (e) { var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (!d) return; e.preventDefault(); wState.deg += d * (e.shiftKey ? 45 : 5); wApply(true); });
    J.windDeg.addEventListener('change', function () { wState.deg = +J.windDeg.value || 0; wApply(true); });
    J.windSpd.addEventListener('input', function () { wState.speed = +J.windSpd.value; wApply(false); });
    J.windSpd.addEventListener('change', function () { wState.speed = +J.windSpd.value; wApply(true); });
    var gWind = details('wind', 'الرياح', 'Wind', [h('div', { class: 'wind-row' }, J.compass, h('div', { class: 'stack' }, field('الاتجاه (درجة)', 'From (degrees)', J.windDeg), field('السرعة', 'Speed', J.windSpd), J.windOut)),
      h('p', { class: 'muted small' }, bi('الرياح تحرّك الدخان والغاز والغبار، فيتغيّر المخرج الأسلم وجهة الابتعاد.', 'Wind moves smoke, gas and dust, so the safest exit and the way to move away change.'))], false);
    // origin
    J.originSel = h('select', { class: 'input' }); lab(J.originSel, 'aria-label', 'غرفة بدء الحريق', 'Room where the fire starts');
    J.originBtn = btn('btn btn-sm btn-ghost', 'pin', 'أعد التشغيل بهذا المصدر', 'Restart with this origin', function () { if (J.originSel.value) setOrigin(J.originSel.value); });
    J.originNote = h('p', { class: 'muted small' });
    var gOrigin = details('origin', 'مصدر الخطر', 'Hazard origin', [J.originSel, J.originBtn, h('p', { class: 'muted small' }, bi('أو استعمل أداة «المصدر» ثم انقر غرفة في منظور المبنى.', 'Or use the “Origin” tool and click a room in the Building view.')), J.originNote], false);
    // sentinel fault + decoys
    J.chType = h('select', { class: 'input' }); J.chWhere = h('select', { class: 'input' });
    lab(J.chType, 'aria-label', 'نوع الحسّاس', 'Sentinel type'); lab(J.chWhere, 'aria-label', 'موقع الحسّاس', 'Sentinel location');
    J.chType.addEventListener('change', fillWhere);
    function fillWhere() {
      var t = J.chType.value; J.chWhere.replaceChildren();
      MC.sim.sensors.filter(function (c) { return c.key === t; }).forEach(function (c) { var o = h('option', { value: c.id }); o.textContent = LL(c.label); J.chWhere.appendChild(o); });
      // default: the sentinel in the origin room if any
      var pi = presetInfo(MC.preset), want = 'S-' + (MC.origin ? MC.origin.room : pi.room) + '-' + t; $$('option', J.chWhere).forEach(function (o) { if (o.value === want) J.chWhere.value = want; });
    }
    J.fillWhere = fillWhere;
    J.faultBtn = btn('btn btn-sm btn-danger', 'alert', 'عطّل: قراءة عالية عالقة (60 ث)', 'Fault: stuck-high (60 s)', function () { if (J.chWhere.value) faultChannel(J.chWhere.value, 60); });
    J.decoys = h('div', { class: 'btns' },
      btn('btn btn-sm btn-ghost', null, 'بخار معقّم', 'Sanitiser vapour', function () { decoy('vapour'); }),
      btn('btn btn-sm btn-ghost', null, 'كوب ساخن', 'Hot mug', function () { decoy('hotmug'); }),
      btn('btn btn-sm btn-ghost', null, 'سيارة حمراء', 'Red car', function () { decoy('redcar'); }));
    function decoy(kind) { if (presetInfo(MC.preset).hazard !== 'fire') { Manara.toast(T('الخدع تعمل على حسّاسات الحريق فقط.', 'Decoys act on the fire sensors only.'), 'warn', 2800); return; } act('decoy', { kind: kind, sec: 40 }); Manara.toast(T('مُحفِّز زائف لمفتاح واحد (40 ث): يبلغ «اشتباه» فقط ولا ينتج إنذارًا عامًا.', 'A false trigger on ONE key (40 s): it reaches SUSPECT at most — never a public alert.'), 'warn', 4800); }
    J.trigger = btn('btn btn-sm btn-ghost', 'play', 'ابدأ الخطر الآن', 'Start the hazard now', function () { act('trigger', {}); });
    var gFault = details('fault', 'حسّاس معطّل وخدع', 'Faulty sentinel and decoys', [field('نوع الحسّاس', 'Sentinel type', J.chType), field('الموقع', 'Where', J.chWhere), J.faultBtn,
      h('div', { class: 'jg-sub' }, h('b', null, bi('خدع بمفتاح واحد', 'Single-key decoys')), J.decoys), J.trigger,
      h('p', { class: 'muted small' }, bi('مفتاح واحد لا يتجاوز «اشتباه» أبدًا — المفتاح الثاني المستقل ثم موافقتك هما ما يطلقان التنبيه.', 'One key never goes beyond SUSPECT — a second independent key and then your approval are what release the alert.'))], false);
    // SOS on a resident
    J.sosSel = h('select', { class: 'input' }); lab(J.sosSel, 'aria-label', 'اختر مقيمًا', 'Choose a resident');
    HERO.forEach(function (k) { var o = h('option', { value: k }); o.textContent = LL(HERO_NAME[k]); J.sosSel.appendChild(o); });
    J.sosBtn = btn('btn btn-sm btn-danger', 'heart', 'أطلق «أحتاج مساعدة»', 'Trigger “I need help”', function () { act('checkin', { key: J.sosSel.value, status: 'help' }); Manara.toast(T('وصل نداء استغاثة من المقيم — يظهر في بطاقة التسليم.', 'A help request arrived from the resident — it appears on the hand-off card.'), 'warn', 3600); });
    var gSos = details('sos', 'استغاثة مقيم', 'SOS from a resident', [J.sosSel, J.sosBtn], false);
    // operator options
    J.auto = switchRow('اعتماد آلي (مشغّل محاكى بعد ٢٠ ث)', 'Auto-approve (simulated operator after 20 s)', MC.autoApprove, function (on) { MC.autoApprove = on; act('param', { key: 'autoApprove', value: on ? 1 : 0 }); }, 'sw-auto');
    J.cam = switchRow('استخدم كاميرا مختبر الأدلة كمفتاح رؤية', 'Use the Evidence Lab camera as the vision key', MC.linkCamera, function (on) { MC.linkCamera = on; });
    var gOp = details('operator', 'خيارات المشغّل', 'Operator options', [J.auto, J.cam, h('p', { class: 'muted small' }, bi('الاعتماد البشري هو المفتاح الأخير. الاعتماد الآلي للمحاكاة فقط.', 'Human approval is the last key. Auto-approve is for simulation only.'))], false);
    // twin board
    J.twinBox = h('div', { class: 'stack' });
    var gTwin = details('twin', 'لوحة التوأم (اختياري)', 'Twin board (optional hardware)', [J.twinBox], false);
    [gExit, gWind, gOrigin, gFault, gSos, gOp, gTwin].forEach(function (g) { p.body.appendChild(g); });
    PANEL_UPDATERS.push(updateJudge);
    return p;
  }
  function updateJudge() {
    var J = UI.judge, snap = MC.snap, sid = exitStructId();
    // exits rows (rebuilt when the set changes)
    var exs = snap.exits.filter(function (e) { return e.struct === sid; }), sig = sid + ':' + exs.map(function (e) { return e.id; }).join(',');
    if (J.exSig !== sig) {
      J.exSig = sig; J.exits.replaceChildren();
      exs.forEach(function (e) {
        var cb = h('input', { type: 'checkbox', 'data-ex': e.struct + '.' + e.id });
        cb.addEventListener('change', function () { act('exit', { id: e.struct + '.' + e.id, locked: cb.checked }); });
        var chipEl = h('span', { class: 'tag jx-state' });
        J.exits.appendChild(h('label', { class: 'jx' }, cb, h('span', { class: 'jx-n' }, bi(e.name.ar, e.name.en)), chipEl));
      });
    }
    $$('.jx', J.exits).forEach(function (row, i) {
      var e = exs[i]; if (!e) return; var cb = $('input', row), st = $('.jx-state', row);
      cb.checked = !!e.locked; setText(st, LL(EXIT_STATE[e.state].name)); st.style.setProperty('--sc', 'var(' + EXIT_STATE[e.state].tok + ')');
    });
    if (!J.wState.drag && doc.activeElement !== J.windSpd && doc.activeElement !== J.windDeg) { J.wState.deg = snap.wind.deg; J.wState.speed = snap.wind.speed; J.windSpd.value = snap.wind.speed; J.wApply(false); }
    var cn = J.compass._labels, L4 = lang() === 'ar' ? ['ش', 'ق', 'ج', 'غ'] : ['N', 'E', 'S', 'W']; cn.forEach(function (t, i) { setText(t, L4[i]); });
    J.sosBtn.disabled = false; J.faultBtn.disabled = !J.chWhere.value;
    J.trigger.hidden = !!(MC.sim.hz && MC.sim.hz.started);
  }
  // things that depend on the run (called by startRun)
  function onRunStarted() {
    var J = UI.judge; if (!J) return;
    var pi = presetInfo(MC.preset), si = pi.struct != null ? pi.struct : 0, S = WI.structs[si];
    J.originSel.replaceChildren();
    if (pi.hazard === 'fire') {
      S.nodes.filter(function (n) { return n.type === 1 || n.type === 7; }).forEach(function (n) { var o = h('option', { value: n.id }); o.textContent = (n.cls ? B('صف ', 'Class ') : B('غرفة ', 'Room ')) + (n.room || LL(n.label)); J.originSel.appendChild(o); });
      J.originSel.value = (MC.origin && MC.origin.room) || pi.room; J.originSel.disabled = false; J.originBtn.disabled = false; setText(J.originNote, '');
    } else { J.originSel.disabled = true; J.originBtn.disabled = true; setText(J.originNote, B('أصل هذا الخطر ثابت في السيناريو (نقل الأصل متاح لسيناريوهات الحريق).', 'This hazard’s origin is fixed by the scenario (moving the origin works for the fire scenarios).')); }
    J.chType.replaceChildren(); var seen = {};
    MC.sim.sensors.forEach(function (c) { if (seen[c.key]) return; seen[c.key] = 1; var o = h('option', { value: c.key }); o.textContent = c.key; J.chType.appendChild(o); });
    J.fillWhere();
    J.exSig = null;
    MC.hc = Sim.headcount(MC.sim);
    if (UI.auto) { }
    if (J.auto) J.auto._cb.checked = MC.autoApprove;
    syncChrome();
  }
  function syncChrome() {
    if (UI.viewSeg) UI.viewSeg._sync(); if (UI.bSeg) { UI.bSeg._sync(); UI.bSeg.hidden = MC.view !== 'building'; }
    if (UI.toolSeg) UI.toolSeg._sync(); if (UI.speed) UI.speed._sync();
    if (UI.seed && doc.activeElement !== UI.seed) UI.seed.value = String(MC.seed);
    if (UI.presentBtn) UI.presentBtn.setAttribute('aria-pressed', MC.present ? 'true' : 'false');
  }

  /* ---- proof before panic (the decision card) ---- */
  var DEC = { btns: [], strips: [] };
  function decisionButtons(cls) {
    var a = btn('btn btn-primary mc-approve', 'check', 'اعتماد التنبيه العام', 'Approve public alert', function () { doApprove(); });
    var hd = btn('btn btn-ghost mc-hold', 'x', 'إيقاف', 'Hold', function () { doHold(); });
    lab(hd, 'title', 'إيقاف = اعتبره إنذارًا كاذبًا', 'Hold = treat it as a false alarm');
    DEC.btns.push({ approve: a, hold: hd });
    return h('div', { class: 'dec-btns ' + (cls || '') }, a, hd);
  }
  var KEY_NOTES = {
    fire: [T('حرارة ≥ 57°م (S58 — مواصفات كاشف حرارة معتمد) · دخان MQ-2 فوق خط الأساس + 3σ (S60 — ورقة بيانات) · الرؤية: قواعد لا ذكاء اصطناعي، وأصابت 12 من 18 صورة ثابتة محجوزة (مختبر الأدلة، عيّنة صغيرة).', 'Heat ≥ 57 °C (S58 — a listed heat-detector spec) · MQ-2 smoke above baseline + 3σ (S60 — datasheet) · vision is rule-based, not AI: 12 of 18 held-out still images correct (Evidence Lab, small sample).')],
    gas: [T('غاز البترول المسال: تحذير 1000 وخطر 2100 ppm (S48 — NIOSH/CAMEO) · CO: 35/200 (S46) · H₂S: 10/20 (S47). المفتاح الثاني قراءة ثانية في مكان آخر مع اتجاه صاعد.', 'LPG: warn 1000 / danger 2100 ppm (S48 — NIOSH/CAMEO) · CO 35/200 (S46) · H₂S 10/20 (S47). Key two is a second reading in another place plus a rising trend.')],
    flood: [T('عمق الماء ≥ 15 سم (مشتق من S55 — هيئة الأرصاد الأمريكية، بحث دولي). المفتاح الثاني: حسّاس في موضع آخر أو تحذير الأرصاد. لا تعبر مياهًا جارية أبدًا.', 'Water ≥ 15 cm (derived from S55 — US National Weather Service, international research). Key two: another spot or the met-office warning. Never cross moving water.')],
    dust: [T('PM10 ≥ 150 µg/m³ (S31 — المعيار القطري كما نقلته Doha News، بيانات 2012). المفتاح الثاني: كاميرا الرؤية أو تحذير الأرصاد.', 'PM10 ≥ 150 µg/m³ (S31 — Qatar’s standard as reported by Doha News, 2012 data). Key two: the visibility camera or the met-office warning.')],
    heat: [T('خط التوقف القانوني WBGT 32.1°م (S19 — منظمة العمل الدولية) · حظر العمل 10:00–15:30 (S18 — وزارة العمل). مفتاح التقويم مستقل عن الحسّاسات.', 'Legal stop line WBGT 32.1 °C (S19 — ILO) · outdoor-work ban 10:00–15:30 (S18 — Ministry of Labour). The calendar key is independent of the sensors.')],
    sos: [T('زر الاستغاثة أو سقوط (اصطدام ثم سكون) + عدم الردّ خلال 30 ث. 999 هو من يقرّر؛ منارة ترسل حزمة موثّقة فقط.', 'SOS button or fall (impact then stillness) + no answer in 30 s. 999 decides; MANARA only sends a verified package.')]
  };
  function groupStats(g) {
    var rows = Sim.sensors(MC.sim).filter(function (s) { return s.group === g; });
    if (!rows.length) return null;
    var st = { n: rows.length, on: 0, val: null, thr: rows[0].thrActive, unit: rows[0].unit, low: rows[0].unit === 'm' };
    rows.forEach(function (s) { if (s.active) st.on++; if (isNum(s.value)) st.val = st.val == null ? s.value : (st.low ? Math.min(st.val, s.value) : Math.max(st.val, s.value)); });
    return st;
  }
  function fmtKeyVal(st) {
    if (st.val == null) return '–';
    if (st.unit === '0/1') return st.val >= 0.5 ? B('صدر', 'issued') : B('لم يصدر', 'not issued');
    return N(st.val, Math.abs(st.val) < 10 ? 1 : 0) + (st.unit === '0-1' ? '' : ' ' + st.unit);
  }
  function buildProofPanel() {
    var P = UI.proof = {};
    P.tog = h('button', { type: 'button', class: 'btn btn-ghost btn-sm pr-tog', 'aria-expanded': 'true', 'aria-controls': 'pr-more', onclick: function () { setProofOpen(!P.open); } }, bi('المفاتيح', 'Keys'), icon('chevron'));
    lab(P.tog, 'title', 'إظهار / إخفاء قيم المفاتيح الحيّة', 'Show / hide the live key values');
    var p = panel('proof', 'الدليل قبل الذعر', 'Proof before panic', { extra: h('span', { class: 'row-tags' }, simTag(), P.tog), cls: 'pn-decision' });
    P.ladder = h('ol', { class: 'ladder' });
    [['suspect', 'اشتباه', 'SUSPECT', 'مفتاح واحد', 'one key'], ['confirmed', 'مؤكَّد', 'CONFIRMED', 'مفتاحان مستقلان', 'two independent keys'], ['approve', 'موافقة', 'APPROVE', 'المفتاح البشري (أنت)', 'the human key (you)'], ['public', 'تنبيه عام', 'PUBLIC ALERT', 'هواتف، لافتات، حارس', 'phones, signs, guard']].forEach(function (s, i) {
      var li = h('li', { class: 'ls', 'data-step': s[0] }, h('span', { class: 'ls-dot', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'ls-t' }, h('b', null, bi(s[1], s[2])), h('small', null, bi(s[3], s[4]))), h('time', { class: 'mono ls-time' }));
      P.ladder.appendChild(li);
    });
    P.note = h('p', { class: 'pr-note', role: 'status' });
    P.keys = h('div', { class: 'keys' });
    P.rule = h('p', { class: 'pr-rule' });
    P.ev = h('div', { class: 'evrow' });
    P.siren = h('div', { class: 'siren-row' });
    P.btns = decisionButtons('big');
    P.src = h('details', { class: 'pr-src' }, h('summary', null, bi('العتبات والمصادر', 'Thresholds and sources')), P.srcBody = h('p', { class: 'small' }));
    p.body.appendChild(P.ladder); p.body.appendChild(P.note); p.body.appendChild(P.btns);
    P.more = h('div', { class: 'pr-more', id: 'pr-more' }, h('div', { class: 'pr-keyhead' }, h('b', null, bi('المفتاحان (قيم حيّة من المحاكاة)', 'The two keys (live values from the simulation)')), P.rule), P.keys, P.ev, P.siren, P.src);
    P.pu = h('div', { class: 'pu', 'aria-hidden': 'true' });                   // Present mode only: the responders in large type
    p.body.appendChild(P.more); p.body.appendChild(P.pu); P.open = true;
    PANEL_UPDATERS.push(updateProof);
    return p;
  }
  // the key values collapse by themselves once the public alert is out (wide layout) so the Dispatch / Count / Hand-off tabs get the room
  function setProofOpen(open) {
    var P = UI.proof; if (!P || !P.more) return;
    P.open = !!open; P.more.hidden = !open; P.tog.setAttribute('aria-expanded', open ? 'true' : 'false'); P.tog.classList.toggle('is-closed', !open);
  }
  function rebuildKeys() {
    var P = UI.proof, hz = MC.snap.hazard; P.keys.replaceChildren(); P.rows = [];
    KEYS[hz].forEach(function (k) {
      var fill = h('i', { class: 'g-fill' }), tick = h('i', { class: 'g-tick' }), val = h('span', { class: 'kr-v mono' }), state = h('span', { class: 'tag kr-s' }), cnt = h('small', { class: 'muted kr-c' });
      var row = h('div', { class: 'keyrow', 'data-g': k.g }, h('div', { class: 'kr-n' }, h('b', null, bi(k.name.ar, k.name.en)), h('small', null, bi(k.why.ar, k.why.en)), cnt),
        h('div', { class: 'kr-m' }, h('div', { class: 'gauge', 'aria-hidden': 'true' }, fill, tick), val), state);
      P.keys.appendChild(row); P.rows.push({ k: k, row: row, fill: fill, tick: tick, val: val, state: state, cnt: cnt });
    });
    P.keysFor = MC.preset + ':' + hz;
  }
  function updateProof() {
    var P = UI.proof, snap = MC.snap, sim = MC.sim, v = snap.verification, hz = snap.hazard;
    if (P.keysFor !== MC.preset + ':' + hz) rebuildKeys();
    // ladder
    var ph = v.phase, done = { suspect: ph === 'suspect' || ph === 'confirmed' || ph === 'public', confirmed: ph === 'confirmed' || ph === 'public', approve: ph === 'public', public: ph === 'public' };
    var times = { suspect: v.suspectAt, confirmed: v.confirmedAt, approve: v.approvedAt, public: v.publicAt }, cur = null;
    PHASES.forEach(function (s) { if (!done[s] && !cur && sim.hz && sim.hz.started) cur = s; });
    if (ph === 'idle' && !(sim.hz && sim.hz.started)) cur = null;
    $$('.ls', P.ladder).forEach(function (li) {
      var s = li.getAttribute('data-step'); li.classList.toggle('done', !!done[s]); li.classList.toggle('cur', cur === s && !done[s]);
      setText($('time', li), done[s] && times[s] != null ? 't+' + N(times[s]) + (lang() === 'ar' ? ' ث' : ' s') : '');
      li.setAttribute('aria-current', cur === s ? 'step' : 'false');
    });
    // note
    var nt = ph === 'public' ? PHASE_NOTE.public : ph === 'confirmed' ? PHASE_NOTE.confirmed : ph === 'suspect' ? PHASE_NOTE.suspect : ((sim.hz && sim.hz.started) ? T('الحسّاسات تراقب… لا مفتاح نشط بعد.', 'Sentinels are watching… no key is active yet.') : T('كل شيء طبيعي. ابدأ السيناريو لترى المفاتيح تتفعّل.', 'All normal. Run the scenario to watch the keys trip.'));
    setText(P.note, LL(nt)); P.note.className = 'pr-note ph-' + ph;
    // keys
    var activeKeys = 0;
    P.rows.forEach(function (r) {
      var st = groupStats(r.k.g); if (!st) return;
      setText(r.val, fmtKeyVal(st) + (st.unit !== '0/1' ? '  ' + (st.low ? '<' : '≥') + ' ' + N(st.thr, st.thr < 10 ? 1 : 0) : ''));
      var ratio = st.val == null ? 0 : st.low ? clamp(1 - st.val / (st.thr * 4), 0, 1) : clamp(st.val / (st.thr * 2), 0, 1), tk = st.low ? 0.75 : 0.5;
      r.fill.style.width = (st.unit === '0/1' ? (st.val >= 0.5 ? 100 : 0) : ratio * 100) + '%'; r.tick.style.insetInlineStart = (st.unit === '0/1' ? 50 : tk * 100) + '%';
      var on = st.on > 0; if (on) activeKeys++;
      r.row.classList.toggle('on', on); setText(r.state, on ? B('مفتاح نشط', 'KEY ACTIVE') : B('هادئ', 'quiet')); r.state.className = 'tag kr-s ' + (on ? 'danger' : '');
      setText(r.cnt, st.n > 1 ? N(st.on) + ' ' + B('من', 'of') + ' ' + N(st.n) + ' ' + B('حسّاسات فوق العتبة', 'sentinels over the threshold') : '');
    });
    setText(P.rule, B('المفاتيح النشطة: ', 'Active keys: ') + N(activeKeys) + ' · ' + B('تلزم مجموعتان مستقلتان', 'two independent groups are needed'));
    // evidence lab
    var d = MC.detection, evTxt;
    P.ev.replaceChildren();
    if (d) {
      var dst = { fire: T('حريق', 'FIRE'), smoke: T('دخان', 'SMOKE'), suspect: T('اشتباه', 'SUSPECT'), clear: T('سليم', 'CLEAR') }[d.state] || T(d.state, d.state), ageS = Math.round((Date.now() - d.ts) / 1000);
      var th = null; if (typeof d.snapshot === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(d.snapshot)) { th = h('img', { class: 'ev-th', alt: '' }); th.src = d.snapshot; }
      P.ev.appendChild(h('div', { class: 'ev' }, th, h('div', { class: 'ev-t' }, h('b', null, bi('مختبر الأدلة (كاميرا)', 'Evidence Lab (camera)')), h('small', null, LL(dst) + ' · ' + N(Math.round((+d.confidence || 0) * 100)) + '% · ' + B('قبل ', '') + N(ageS) + (lang() === 'ar' ? ' ث' : ' s ago') + ' · ' + (MC.linkCamera ? B('مربوط كمفتاح رؤية', 'linked as the vision key') : B('غير مربوط', 'not linked')))), chip(B('رؤية بقواعد — لا تنذر وحدها', 'rule-based — never alerts alone'), 'cool')));
    } else P.ev.appendChild(h('div', { class: 'ev ev-none' }, h('small', { class: 'muted' }, bi('لا رسالة من مختبر الأدلة بعد. افتح «مختبر الأدلة» في تبويب آخر وأرِ الكاميرا نارًا: يصل هنا كمفتاح رؤية.', 'No message from the Evidence Lab yet. Open the Evidence Lab in another tab and show the camera a fire: it arrives here as a vision key.'))));
    // siren
    P.siren.replaceChildren(icon('bell'), h('span', null, h('b', null, bi('الإنذار المحلي لا ينتظر', 'The local siren never waits')), ' ', h('small', { class: 'muted' }, snap.localAlarm.on ? B('يعمل منذ t+' + N(snap.localAlarm.at) + ' ث — دون شبكة أو طائرة أو إنسان.', 'ON since t+' + N(snap.localAlarm.at) + ' s — no network, drone or person needed.') : B('جاهز: يعمل لحظة تجاوز عتبة الحسّاس نفسه.', 'Armed: rings the moment a sentinel’s own threshold trips.'))), chip(snap.localAlarm.on ? B('يعمل', 'ON') : B('جاهز', 'ARMED'), snap.localAlarm.on ? 'danger' : 'safe'));
    setText(P.srcBody, LL((KEY_NOTES[hz] || KEY_NOTES.fire)[0]));
    // buttons
    var canApprove = ph === 'confirmed';
    DEC.btns.forEach(function (b) {
      b.approve.disabled = !canApprove; b.hold.disabled = !canApprove;
      b.approve.classList.toggle('pulse', canApprove);
      b.approve.setAttribute('aria-disabled', canApprove ? 'false' : 'true');
      b.approve.title = canApprove ? '' : (ph === 'public' ? B('اعتُمد', 'Approved') : B('يلزم مفتاحان مستقلان أولًا', 'Two independent keys are needed first'));
    });
    DEC.strips.forEach(function (s) { setText(s.phase, UI.hudPhase.textContent); s.phase.className = 'strip-phase ph-' + (ph === 'idle' ? 'idle' : ph); });
  }

  /* ---- alert composer + wake-up ladder ---- */
  var LADDER_STEPS = [
    { t: 0, ar: 'صوت + اهتزاز (+ وميض لمن يختار)', en: 'sound + vibration (+ flash if opted in)' },
    { t: 30, ar: 'أعلى صوتًا + ضوء', en: 'louder + light' },
    { t: 60, ar: 'الحارس يطرق الأبواب (قائمة أولوية)', en: 'guard knocks doors (priority list)' },
    { t: 90, ar: 'الدفاع المدني يستلم القائمة', en: 'Civil Defence receives the list' }];
  function buildAlertPanel() {
    var p = panel('alert', 'التنبيه وسلّم الإيقاظ', 'Alert and wake-up ladder', { extra: simTag() });
    var A = UI.alert = {};
    A.status = h('div', { class: 'al-status' }); A.zones = h('div', { class: 'al-zones' }); A.instr = h('ul', { class: 'al-instr' });
    A.langs = h('div', { class: 'al-bars' }); A.fmts = h('div', { class: 'chips al-fmts' });
    A.sel = h('select', { class: 'input' }); lab(A.sel, 'aria-label', 'معاينة الرسالة لـ', 'Preview the message for');
    var heroes = (MSG && MSG.people) ? MSG.people() : [];
    heroes.forEach(function (hp) { var o = h('option', { value: hp.id }); o.textContent = LL(hp.name) + ' — ' + LL(hp.role) + ' (' + (LANG_NAME[hp.lang] || hp.lang) + ')'; A.sel.appendChild(o); });
    A.sel.addEventListener('change', updateAlert);
    A.card = h('div', { class: 'msg-card' });
    A.ladder = h('div', { class: 'wk' });
    p.body.appendChild(A.status); p.body.appendChild(A.zones); p.body.appendChild(A.instr);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('اللغات (من سجلّ المبنى)', 'Languages (from the building register)'))); p.body.appendChild(A.langs);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('الصيغ', 'Formats'))); p.body.appendChild(A.fmts);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('معاينة رسالة شخص', 'Preview one person’s message'))); p.body.appendChild(A.sel); p.body.appendChild(A.card);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('سلّم الإيقاظ الليلي', 'Night wake-up ladder'))); p.body.appendChild(A.ladder);
    p.body.appendChild(h('p', { class: 'pn-foot' }, bi('اللغات غير العربية والإنجليزية مسوّدات تنتظر مراجعة متحدث أصلي. صوت 520 هرتز (S56) ولا تُستعمل نغمة الإنذار الوطنية أبدًا.', 'Languages other than Arabic and English are drafts awaiting native-speaker review. 520 Hz tone (S56); the national alert tone is never used.')));
    PANEL_UPDATERS.push(updateAlert);
    return p;
  }
  function msgHazard(hz) { return hz; }
  function updateAlert() {
    var A = UI.alert, sim = MC.sim, snap = MC.snap, al = sim.alert, hz = snap.hazard, lv = al ? al.level : 'evacuate';
    A.status.replaceChildren(al ? h('span', { class: 'tag ' + (lv === 'evacuate' ? 'danger' : lv === 'shelter' ? 'warn' : 'info') }, { evacuate: B('إخلاء', 'EVACUATE'), shelter: B('ابقَ واحتمِ', 'SHELTER'), watch: B('متابعة', 'WATCH') }[lv]) : h('span', { class: 'tag' }, B('معاينة — لم يُرسل بعد', 'PREVIEW — not sent yet')),
      h('span', { class: 'muted' }, al ? ' ' + B('أُرسل عند t+', 'sent at t+') + N(al.issuedAt) + ' · ' + N(al.recipients) + ' ' + B('مستلم', 'recipients') : ' ' + B('يظهر ما سيصل إلى الناس بعد اعتمادك.', 'shows what people will receive after your approval.')));
    var c = al ? al.counts : null;
    A.zones.replaceChildren(zoneChip('danger', B('إخلاء', 'Evacuate'), c ? c.evacuate : null), zoneChip('warn', B('ابقَ واحتمِ', 'Shelter'), c ? c.shelter : null), zoneChip('info', B('متابعة', 'Watch'), c ? c.watch : null));
    A.instr.replaceChildren();
    (al ? al.instructions : []).forEach(function (i) { A.instr.appendChild(h('li', { text: LL(i) })); });
    if (!al) A.instr.appendChild(h('li', { class: 'muted' }, bi('تُحسب المناطق من توقّع الخطر: إخلاء / ابقَ واحتمِ / متابعة.', 'Zones come from the hazard forecast: evacuate / shelter / watch.')));
    // languages
    var by = al ? al.byLang : null;
    if (!by) { by = {}; snap.people.forEach(function (q) { if (q.registered && !q.away) by[q.lang] = (by[q.lang] || 0) + 1; }); }
    var keys = Object.keys(by).sort(function (a, b2) { return by[b2] - by[a]; }), mx = keys.length ? by[keys[0]] : 1;
    A.langs.replaceChildren();
    keys.forEach(function (lg) { var row = barRow(h('span', null, LANG_NAME[lg] || lg, LANG_DRAFT[lg] ? h('small', { class: 'draft', title: B('مسودة تحتاج مراجعة متحدث أصلي', 'Draft — needs native-speaker review') }, ' ' + B('مسودة', 'draft')) : null), by[lg], mx, '--accent', N(by[lg])); A.langs.appendChild(row); });
    var fm = al ? al.byFormat : null;
    A.fmts.replaceChildren();
    var FMT = { sound: T('صوت', 'Sound'), vibration: T('اهتزاز', 'Vibration'), text: T('نص', 'Text'), pictogram: T('رسوم توضيحية', 'Pictograms'), strobe: T('وميض (اختياري)', 'Flash (opt-in)'), voice: T('صوت منطوق', 'Voice'), card: T('بطاقة صور', 'Picture card') };
    if (fm) Object.keys(fm).forEach(function (k) { A.fmts.appendChild(h('span', { class: 'chip' }, (FMT[k] ? LL(FMT[k]) : k) + ' ', h('b', { class: 'mono', text: N(fm[k]) }))); });
    else A.fmts.appendChild(h('span', { class: 'muted small' }, bi('تُحسب الصيغ لكل شخص بحسب احتياجه (صمّ: وميض واهتزاز؛ كفيف: صوت منطوق؛ طفل: بطاقة صور).', 'Formats are chosen per person (Deaf: flash and vibration; blind: voice; child: picture card).')));
    // preview card
    var hp = (MSG && MSG.people ? MSG.people() : []).filter(function (q) { return q.id === A.sel.value; })[0], night = sim.hour0 + sim.t / 3600;
    A.card.replaceChildren();
    if (hp && MSG) {
      var lvl = lv === 'shelter' ? 'warning' : lv, asleep = (night % 24) < 6 || (night % 24) > 22;
      var b2 = null; try { b2 = MSG.bundle({ hazard: msgHazard(hz), level: lvl, persona: hp.persona, lang: hp.lang, asleep: asleep }); } catch (e) { b2 = null; }
      if (b2 && b2.primary) {
        var pr = b2.primary;
        A.card.appendChild(h('div', { class: 'mc-head' }, h('b', { dir: pr.dir || 'ltr', lang: pr.lang, text: pr.headline }), pr.draft ? h('span', { class: 'tag warn' }, B('مسودة — تحتاج مراجعة متحدث أصلي', 'Draft — needs native-speaker review')) : null));
        A.card.appendChild(h('ul', { class: 'mc-lines', dir: pr.dir || 'ltr', lang: pr.lang }, pr.lines.map(function (l) { return h('li', { text: l }); })));
        if (pr.lang !== 'ar') A.card.appendChild(h('p', { class: 'mc-alt', dir: 'rtl', lang: 'ar' }, h('b', { text: b2.ar.headline }), ' — ', b2.ar.lines.join(' ')));
        if (pr.lang !== 'en') A.card.appendChild(h('p', { class: 'mc-alt', dir: 'ltr', lang: 'en' }, h('b', { text: b2.en.headline }), ' — ', b2.en.lines.join(' ')));
        A.card.appendChild(h('div', { class: 'chips' }, (pr.pictograms || []).map(function (q) { return h('span', { class: 'chip' }, MSG.pictogram(q.id, lang()) || q.label); })));
        A.card.appendChild(h('p', { class: 'muted small' }, B('الصيغ: ', 'Formats: ') + (pr.formats || []).join(' · ') + (pr.flash && pr.flash.optIn ? '  ·  ' + B('الوميض اختياري مع تحذير حساسية الضوء', 'flash is opt-in with a photosensitivity warning') : '')));
      } else A.card.appendChild(h('p', { class: 'muted' }, bi('لا رسالة لهذا الخطر.', 'No message for this hazard.')));
    }
    // ladder
    var wk = A.ladder; wk.replaceChildren();
    var head = h('div', { class: 'wk-row wk-head' }, h('span'), LADDER_STEPS.map(function (s) { return h('span', { class: 'wk-h', title: B(s.ar, s.en) }, h('b', { class: 'mono', text: 'T+' + s.t }), h('small', { text: B(s.ar, s.en) })); }));
    wk.appendChild(head);
    HERO.forEach(function (k) {
      var pp = snap.people.filter(function (q) { return q.key === k; })[0]; if (!pp) return;
      var row = h('div', { class: 'wk-row' }, h('span', { class: 'wk-n' }, h('b', { text: LL(HERO_NAME[k]) }), h('small', { class: 'muted', text: ' ' + (LANG_NAME[pp.lang] || pp.lang) })));
      for (var s = 0; s < 4; s++) {
        var st = 'pending', txt = '';
        if (pp.ladder != null) {
          if (s <= pp.ladder) st = (pp.ladderStop != null && s === pp.ladder) ? 'stop' : 'done'; else st = pp.ladderStop != null ? 'skip' : 'pending';
        }
        if (!al && !pp.asleep) st = 'na';
        if (st === 'stop') txt = B('استيقظ t+', 'woke t+') + N(pp.ladderStop);
        row.appendChild(h('span', { class: 'wk-c ' + st }, st === 'done' ? icon('check') : st === 'stop' ? icon('check') : null, txt ? h('small', { text: txt }) : null));
      }
      wk.appendChild(row);
    });
    var inLad = snap.people.filter(function (q) { return q.ladder != null && q.ladderStop == null && !q.away; }), stages = [0, 0, 0, 0]; inLad.forEach(function (q) { stages[Math.min(3, q.ladder)]++; });
    wk.appendChild(h('p', { class: 'muted small wk-sum' }, B('لا يزالون في السلّم: ', 'Still climbing the ladder: ') + stages.map(function (n, i) { return 'T+' + LADDER_STEPS[i].t + ': ' + N(n); }).join(' · ') + ' · ' + B('النائمون الآن: ', 'asleep now: ') + N(snap.counts.asleep)));
  }
  function zoneChip(cls, label, n) { return h('span', { class: 'zone ' + cls }, h('b', { class: 'mono', text: n == null ? '–' : N(n) }), h('small', { text: label })); }

  /* ---- headcount board ---- */
  function roomStats(key) {
    var hc = MC.hc, r = hc && hc.rooms && hc.rooms[key];
    if (r && r.total) return { total: r.total, safe: r.safe, help: r.help, un: r.unaccounted };
    var t = 0, s = 0, hp = 0;
    MC.snap.people.forEach(function (p) {
      if ((p.cls !== key && !(p.room === key && !p.cls)) || p.role === 'guard') return;
      if (p.role === 'passerby') return;
      t++; if (p.checkin === 'help') hp++; else if (p.checkin === 'safe') s++;
    });
    return { total: t, safe: s, help: hp, un: t - s - hp };
  }
  function peopleOfRoom(key) { return MC.snap.people.filter(function (p) { return (p.cls === key || (p.room === key && !p.cls)) && p.role !== 'guard' && p.role !== 'passerby'; }); }
  function selectRoom(key) { MC.roomSel = key; MC.panelsDirty = true; if (UI.count) { UI.count.grid && $$('.tile', UI.count.grid).forEach(function (t) { t.setAttribute('aria-pressed', t.getAttribute('data-room') === key ? 'true' : 'false'); }); } showTab('count'); refreshAll(); }
  function buildCountPanel() {
    var p = panel('count', 'العدّ والتأكد من الجميع', 'Headcount', { extra: simTag() });
    var K = UI.count = {};
    K.num = h('b', { class: 'mono hc-num' }); K.of = h('span', { class: 'hc-of mono' }); K.lbl = h('small', { class: 'muted' });
    K.bar = h('div', { class: 'hc-seg', 'aria-hidden': 'true' }, K.bSafe = h('i', { class: 's' }), K.bHelp = h('i', { class: 'h' }), K.bUn = h('i', { class: 'u' }));
    K.kpis = h('div', { class: 'hc-kpis' });
    K.prio = h('ol', { class: 'hc-prio' });
    K.grid = h('div', { class: 'hc-grid' });
    K.detail = h('div', { class: 'hc-detail', role: 'region' }); lab(K.detail, 'aria-label', 'تفاصيل الغرفة المحددة', 'Selected room details');
    K.how = h('p', { class: 'pn-foot' });
    p.body.appendChild(h('div', { class: 'hc-top' }, h('div', { class: 'hc-big' }, K.num, K.of), K.lbl)); p.body.appendChild(K.bar); p.body.appendChild(K.kpis);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('تحقّق أولًا من', 'Check these first'))); p.body.appendChild(K.prio);
    K.gridTitle = h('h3', { class: 'pn-sub' }); p.body.appendChild(K.gridTitle); p.body.appendChild(K.grid); p.body.appendChild(K.detail); p.body.appendChild(K.how);
    PANEL_UPDATERS.push(updateCount);
    return p;
  }
  function updateCount() {
    var K = UI.count, snap = MC.snap, hc = MC.hc, sid = exitStructId(), si = sid === 'SCH' ? 1 : 0, S = WI.structs[si], school = sid === 'SCH';
    if (!hc) return;
    var counted = hc.safe + hc.safeAway;
    setText(K.num, N(counted)); setText(K.of, '/ ' + N(hc.registered));
    setText(K.lbl, B('محسوبون بأمان من المسجّلين', 'counted safe of the register') + (school ? ' · ' + B('تلاميذ ومعلّمون وموظفون', 'pupils, teachers and staff') : ' · ' + B('سجلّ السكن', 'residence register')));
    K.bSafe.style.width = (counted / hc.registered * 100) + '%'; K.bHelp.style.width = (hc.help / hc.registered * 100) + '%'; K.bUn.style.width = (hc.unaccounted / hc.registered * 100) + '%';
    K.kpis.replaceChildren(
      h('div', { class: 'kpi safe' }, h('b', { text: N(hc.safe) }), h('span', { text: B('بأمان (حاضرون)', 'safe (on site)') })),
      h('div', { class: 'kpi' }, h('b', { text: N(hc.safeAway) }), h('span', { text: B('بأمان (خارج الموقع)', 'safe (away)') })),
      h('div', { class: 'kpi danger' }, h('b', { text: N(hc.help) }), h('span', { text: B('يحتاجون مساعدة', 'need help') })),
      h('div', { class: 'kpi warn' }, h('b', { text: N(hc.unaccounted) }), h('span', { text: B('غير محسوبين', 'unaccounted') })));
    // priority list: rooms ordered by their worst unaccounted person
    var rooms = [], seen = {};
    (hc.unaccountedList || []).forEach(function (u) { var key = u.room; if (!key) return; if (!seen[key]) { seen[key] = { room: key, score: u.score, needs: {}, n: 0, name: null, asleep: false }; rooms.push(seen[key]); } var r = seen[key]; r.n++; (u.needs || []).forEach(function (nd) { r.needs[nd] = 1; }); if (u.name) r.name = u.name; if (u.asleep) r.asleep = true; });
    rooms = rooms.slice(0, 5);
    var psig = rooms.map(function (r) { return r.room + ':' + r.n; }).join(',');
    if (K.psig !== psig) {
      K.psig = psig; K.prio.replaceChildren();
      if (!rooms.length) K.prio.appendChild(h('li', { class: 'muted' }, bi(counted >= hc.registered ? 'الجميع محسوبون.' : 'لا أحد غير محسوب بعد في القائمة.', counted >= hc.registered ? 'Everyone is counted.' : 'No one in the list yet.')));
      rooms.forEach(function (r) {
        var needs = Object.keys(r.needs).map(function (nd) { return NEED_L[nd] ? LL(NEED_L[nd]) : nd; }).join('، ');
        var li = h('li', null, h('button', { type: 'button', class: 'prio-b', onclick: function () { selectRoom(r.room); focusRoom(r.room); } }, h('b', { class: 'mono', text: r.room }), h('span', { text: (r.name ? LL(r.name) + ' · ' : '') + N(r.n) + ' ' + B('غير محسوب', 'unaccounted') + (needs ? ' · ' + needs : '') + (r.asleep ? ' · ' + B('نائم', 'asleep') : '') })));
        K.prio.appendChild(li);
      });
    }
    // tile grid (built once per struct)
    var gsig = sid + ':' + (school ? 'c' : 'r');
    if (K.gsig !== gsig) {
      K.gsig = gsig; K.grid.replaceChildren(); K.tiles = {};
      var byFl = {};
      S.nodes.forEach(function (n) { if (n.type !== 1 || !(n.room || n.cls)) return; (byFl[n.fl] = byFl[n.fl] || []).push(n); });
      Object.keys(byFl).sort(function (a, b) { return b - a; }).forEach(function (fl) {
        var row = h('div', { class: 'hc-floor' }, h('span', { class: 'hc-fl' }, bi(FLOOR_NAME[fl].ar, FLOOR_NAME[fl].en)));
        var wrap = h('div', { class: 'hc-tiles' });
        byFl[fl].forEach(function (n) {
          var key = n.cls || n.room, t = h('button', { type: 'button', class: 'tile', 'data-room': key, 'aria-pressed': 'false', onclick: function () { selectRoom(key); focusRoom(key); } }, h('b', { class: 'mono', text: key }), h('small', { class: 'mono t-n' }), h('i', { class: 't-rank' }));
          K.tiles[key] = t; wrap.appendChild(t);
        });
        row.appendChild(wrap); K.grid.appendChild(row);
      });
      setText(K.gridTitle, school ? B('الصفوف — لوحة المعلّم', 'Classes — the teacher’s tablet view') : B('غرف السكن — تتحول إلى الأخضر عند «أنا بأمان»', 'Residence rooms — they turn green on “I’m safe”'));
    }
    var rank = {}; rooms.forEach(function (r, i) { rank[r.room] = i + 1; });
    Object.keys(K.tiles).forEach(function (key) {
      var t = K.tiles[key], st = roomStats(key), cls = 'tile';
      if (!st.total) cls += ' empty'; else if (st.help > 0) cls += ' help'; else if (st.safe >= st.total) cls += ' all'; else if (st.safe > 0) cls += ' part';
      t.className = cls + (MC.roomSel === key ? ' sel' : '');
      setText($('.t-n', t), st.total ? N(st.safe) + '/' + N(st.total) : '–');
      var rk = $('.t-rank', t); if (rank[key] && st.un > 0) { rk.textContent = rank[key]; rk.hidden = false; } else rk.hidden = true;
      t.setAttribute('aria-label', (school ? B('الصف ', 'Class ') : B('غرفة ', 'Room ')) + key + ': ' + N(st.safe) + ' / ' + N(st.total) + ' ' + B('بأمان', 'safe') + (rank[key] ? ', ' + B('أولوية ', 'priority ') + rank[key] : ''));
      t.setAttribute('aria-pressed', MC.roomSel === key ? 'true' : 'false');
    });
    // selected room detail
    var rs = MC.roomSel, ppl = rs ? peopleOfRoom(rs) : [];
    var dsig = rs ? rs + ':' + ppl.map(function (q) { return q.key + (q.checkin || '') + q.st; }).join(',') : '';
    if (K.dsig !== dsig) {
      K.dsig = dsig; K.detail.replaceChildren();
      if (rs) {
        K.detail.appendChild(h('div', { class: 'pn-subrow' }, h('b', null, (school ? B('الصف ', 'Class ') : B('غرفة ', 'Room ')) + rs), btn('btn btn-sm btn-ghost', 'pin', 'اعرضها على الخريطة', 'Show on map', function () { focusRoom(rs); })));
        var list = h('ul', { class: 'hc-people' });
        ppl.forEach(function (q) {
          var ns = []; if (q.persona === 'wheelchair') ns.push('wheelchair'); if (q.persona === 'child' && !school) ns.push('child'); if (q.deaf) ns.push('deaf'); if (q.blind) ns.push('blind'); if (q.persona === 'elderly') ns.push('elderly'); if (q.asthma) ns.push('asthma');
          var stt = q.away ? B('خارج الموقع', 'away') : q.checkin === 'help' ? B('يحتاج مساعدة', 'needs help') : q.checkin === 'safe' ? B('بأمان', 'safe') : q.asleep ? B('نائم', 'asleep') : q.st === 'moving' ? B('يتحرك', 'moving') : B('غير محسوب', 'unaccounted');
          var li = h('li', { class: 'hp ' + (q.checkin === 'safe' ? 'ok' : q.checkin === 'help' ? 'bad' : '') }, h('span', { class: 'hp-n' }, h('b', { text: q.hero ? LL(HERO_NAME[q.hero]) : (q.name ? LL(q.name) : roleName(q.role)) }), h('small', { class: 'muted', text: ' ' + (LANG_NAME[q.lang] || q.lang) + (ns.length ? ' · ' + ns.map(function (n) { return LL(NEED_L[n]); }).join('، ') : '') })), h('span', { class: 'hp-s', text: stt }));
          if (!q.checkin && !q.away) li.appendChild(btn('btn btn-sm btn-safe', 'check', 'أنا بأمان', 'I’m safe', function () { act('checkin', { key: q.key, status: 'safe' }); }));
          list.appendChild(li);
        });
        K.detail.appendChild(list);
        K.detail.appendChild(h('div', { class: 'btns' }, school ? btn('btn btn-sm btn-primary', 'users', 'المعلّم يعدّ الصف الآن', 'Teacher counts the class now', function () {
          var n = 0; peopleOfRoom(rs).forEach(function (q) { if (!q.checkin && (q.st === 'safe' || q.st === 'sheltered')) { act('checkin', { key: q.key, status: 'safe' }); n++; } });
          Manara.toast(n ? T('عدّ المعلّم ' + n + ' تلميذًا في ساحة التجمع.', 'The teacher counted ' + n + ' pupils at the assembly point.') : T('لم يصل أحد من هذا الصف إلى نقطة التجمع بعد.', 'No one from this class has reached the assembly point yet.'), n ? 'safe' : 'warn', 3000);
        }) : btn('btn btn-sm btn-ghost', 'check', 'سجّل الجميع بأمان (لوحة نقطة التجمع)', 'Mark all safe (assembly kiosk)', function () { peopleOfRoom(rs).forEach(function (q) { if (!q.checkin && !q.away) act('checkin', { key: q.key, status: 'safe' }); }); })));
      } else K.detail.appendChild(h('p', { class: 'muted small' }, bi('اختر غرفة لترى من فيها وما احتياجاتهم.', 'Pick a room to see who is in it and what they need.')));
    }
    setText(K.how, B('طرق الإبلاغ: تطبيق الهاتف، لوحة نقطة التجمع، نقطة «MANARA-SAFE» دون إنترنت، وجهاز المعلّم للصفوف. لا أسماء في السجلّ للجميع إلا الشخصيات التجريبية.', 'Check-in channels: the phone app, the assembly-point tablet, the offline “MANARA-SAFE” point and the teacher’s tablet. No names in the register except the demo personas.'));
  }
  function focusRoom(key) {
    if (MC.view !== 'building') { MC.bStruct = exitStructId() === 'SCH' ? 1 : 0; setView('building'); }
    if (!R.bl) R.bl = bLayout();
    // find the panel that holds the room and centre on it
    var S = R.bl.S, node = null; S.nodes.forEach(function (n) { if ((n.room === key || n.cls === key)) node = n; });
    if (node) { var P = R.bl.panels.filter(function (q) { return q.fl === node.fl; })[0]; if (P) camFocus(P.ox + 1.2 + (node.x - S.x0), P.oy + 1.5 + (node.y - S.y0), R.cam.bld.fit * 1.9); }
    MC.sel = { type: 'room', id: key }; MC.drawDirty = true;
  }

  /* ---- hand-off card (Civil Defence / ambulance) ---- */
  function handoffRows(ho) {
    var rows = [], sim = MC.sim, snap = MC.snap;
    var hz = HZ[ho.hazard] || HZ.fire, sc = snap.dispatch ? snap.dispatch.scene : sceneOf(sim);
    rows.push(['incident', B('الحادث', 'Incident'), LL(ho.incident) + ' — ' + LL(hz.name)]);
    rows.push(['where', B('الموقع', 'Location'), LL(ho.area) + (sc ? ' · ' + B('إحداثيات المحاكاة ', 'sim grid ') + N(Math.round(sc.x)) + ',' + N(Math.round(sc.y)) : '')]);
    rows.push(['when', B('الوقت', 'Time'), ho.clock + ' · t+' + N(ho.t) + (lang() === 'ar' ? ' ث' : ' s')]);
    rows.push(['verify', B('التحقق', 'Verification'), (snap.verification.keys.length ? snap.verification.keys.join(' + ') : '–') + ' · ' + B('مؤكَّد t+', 'confirmed t+') + (ho.confirmedAt != null ? N(ho.confirmedAt) : '–') + ' · ' + B('اعتماد t+', 'approved t+') + (ho.approvedAt != null ? N(ho.approvedAt) : '–')]);
    rows.push(['wind', B('الرياح', 'Wind'), B('من ', 'from ') + LL(windDir8(ho.wind.deg)) + ' ' + N(ho.wind.speed, 1) + ' ' + B('م/ث', 'm/s')]);
    rows.push(['exits', B('حالة المخارج', 'Exit status'), ho.exits.map(function (e) { return LL(e.name) + ': ' + LL(EXIT_STATE[e.state].name); }).join(' · ')]);
    rows.push(['roads', B('طرق مغلقة', 'Closed roads'), ho.roads && ho.roads.length ? ho.roads.map(function (r) { return typeof r === 'string' ? (R.geo.segById[r] ? LL(R.geo.segById[r].name) : r) : LL(r.name || r.id); }).join('، ') : B('لا شيء', 'none')]);
    var pp = ho.people; rows.push(['people', B('الأشخاص', 'People'), N(pp.safe + pp.safeAway) + ' ' + B('بأمان', 'safe') + ' / ' + N(pp.registered) + ' · ' + N(pp.help) + ' ' + B('يحتاجون مساعدة', 'need help') + ' · ' + N(pp.unaccounted) + ' ' + B('غير محسوبين', 'unaccounted')]);
    rows.push(['help', B('يحتاجون مساعدة', 'Need help'), ho.needHelp && ho.needHelp.length ? ho.needHelp.map(function (q) { return (q.name ? LL(q.name) : B('مقيم', 'resident')) + (q.room ? ' (' + q.room + ')' : ''); }).join('، ') : B('لا أحد حتى الآن', 'no one so far')]);
    rows.push(['unacc', B('غير محسوبين (الأولوية)', 'Unaccounted (priority)'), ho.unaccounted && ho.unaccounted.length ? ho.unaccounted.slice(0, 6).map(function (q) { return B('غرفة ', 'room ') + q.room + (q.needs && q.needs.length ? ' [' + q.needs.map(function (nd) { return NEED_L[nd] ? LL(NEED_L[nd]) : nd; }).join('، ') + ']' : ''); }).join(' · ') : B('لا أحد', 'none')]);
    rows.push(['needs', B('احتياجات خاصة', 'Special needs'), ho.needsFlags && ho.needsFlags.length ? ho.needsFlags.map(function (q) { return (q.name ? LL(q.name) : B('مقيم', 'resident')) + ' (' + q.room + ', ' + (NEED_L[q.flag] ? LL(NEED_L[q.flag]) : q.flag) + (q.where === 'refuge' ? ', ' + B('في شرفة الملاذ', 'in the refuge balcony') : '') + ')'; }).join('، ') : '–']);
    var d = snap.dispatch;
    rows.push(['units', B('الوحدات الموصى بها (SIM)', 'Recommended units (SIM)'), d ? d.units.filter(function (u) { return u.assetId; }).map(function (u) { return LL(UNIT[u.kind].short) + ' ' + LL(u.name).replace(/\s*[—-]\s*(تجريبي[ة]?|\(demo\))|\s*\(demo\)/g, '') + ' ' + (u.state === 'on-scene' ? B('في الموقع', 'on scene') : mmss(u.etaSec)); }).join(' · ') : B('بعد التأكيد', 'after CONFIRMED')]);
    rows.push(['hospital', B('المستشفى الموصى به', 'Recommended hospital'), d && d.hospital ? LL(d.hospital.name) + ' ' + mmss(d.hospital.etaSec) : '–']);
    rows.push(['drone', B('الطائرة المسيّرة', 'Drone'), snap.drone.state + ' · ' + B('عثرت على ', 'located ') + N(snap.drone.located)]);
    return rows;
  }
  function incidentPackage() {
    var sim = MC.sim, ho = Sim.handoff(sim), cap = Sim.cap(sim, { languages: ['ar', 'en'] });
    return { type: 'incident-package', exercise: true, note: 'MANARA simulation (SIM). Fictional units. 999 stays the dispatcher; this package is a pre-filled, verified summary for the control room.', scenario: MC.preset, seed: MC.seed, t: sim.t, handoff: ho, dispatch: Sim.busDispatch(sim), cap: cap };
  }
  function buildHandoffPanel() {
    var p = panel('handoff', 'بطاقة التسليم للدفاع المدني والإسعاف', 'Hand-off card: Civil Defence and ambulance', { extra: simTag() });
    var H = UI.handoff = {};
    H.dl = h('dl', { class: 'ho-dl' });
    H.btns = h('div', { class: 'btns' },
      btn('btn btn-primary btn-sm', 'download', 'تصدير CAP 1.2 XML', 'Export CAP 1.2 XML', function () { exportCap(); }),
      btn('btn btn-ghost btn-sm', 'copy', 'نسخ الملخص', 'Copy summary', function () { copyText(handoffText()).then(function (ok) { Manara.toast(ok ? T('نُسخ ملخص التسليم.', 'Hand-off summary copied.') : T('تعذّر النسخ.', 'Copy failed.'), ok ? 'safe' : 'warn', 2400); }); }),
      btn('btn btn-ghost btn-sm', 'code', 'نسخ JSON', 'Copy JSON', function () { copyText(JSON.stringify(incidentPackage(), null, 2)).then(function (ok) { Manara.toast(ok ? T('نُسخت الحزمة (JSON).', 'Package (JSON) copied.') : T('تعذّر النسخ.', 'Copy failed.'), ok ? 'safe' : 'warn', 2400); }); }),
      btn('btn btn-cool btn-sm', 'route', 'أرسل الحزمة إلى غرفة التحكم', 'Send package to control room', function () { sendPackage(); }));
    p.body.appendChild(h('div', { class: 'ho-tags' }, h('span', { class: 'tag warn' }, bi('تمرين — محاكاة', 'EXERCISE — simulation')), h('span', { class: 'tag info' }, bi('999 يبقى هو المُرسِل', '999 stays the dispatcher'))));
    p.body.appendChild(H.dl); p.body.appendChild(H.btns);
    p.body.appendChild(h('p', { class: 'pn-foot' }, bi('ملف CAP بحالة «Exercise» ولا يصلح للبثّ الحقيقي. الربط الفعلي مع الأنظمة الوطنية يحتاج اتفاقيات مع الجهات المختصة.', 'The CAP file has status “Exercise” and is not for real broadcast. A real link to national systems needs agreements with the authorities.')));
    PANEL_UPDATERS.push(updateHandoff);
    return p;
  }
  function updateHandoff() {
    var H = UI.handoff, ho = Sim.handoff(MC.sim), rows = handoffRows(ho);
    H.dl.replaceChildren();
    rows.forEach(function (r) { H.dl.appendChild(h('dt', { text: r[1] })); H.dl.appendChild(h('dd', { 'data-k': r[0], text: r[2] })); });
    // exit badges inside the exits row
    var dd = $('dd[data-k="exits"]', H.dl); if (dd) { dd.textContent = ''; ho.exits.forEach(function (e) { dd.appendChild(h('span', { class: 'tag exit-tag', style: '--sc:var(' + EXIT_STATE[e.state].tok + ')' }, LL(e.name) + ' · ' + LL(EXIT_STATE[e.state].name))); dd.appendChild(doc.createTextNode(' ')); }); }
  }
  function handoffText() {
    var ho = Sim.handoff(MC.sim), rows = handoffRows(ho);
    return B('بطاقة تسليم منارة — تمرين محاكاة (999 يبقى المُرسِل)', 'MANARA hand-off card — SIMULATION EXERCISE (999 stays the dispatcher)') + '\n' + rows.map(function (r) { return r[1] + ': ' + r[2]; }).join('\n');
  }
  function exportCap() {
    var xml = Sim.cap(MC.sim, { languages: ['ar', 'en'] });
    download('manara-' + MC.preset + '-seed' + MC.seed + '-cap.xml', 'application/xml', xml);
    Manara.toast(T('نُزِّل ملف CAP 1.2 (حالة: تمرين).', 'CAP 1.2 file downloaded (status: Exercise).'), 'safe', 3000);
    addNote('ui', T('صُدِّر ملف CAP 1.2 (تمرين).', 'CAP 1.2 file exported (Exercise).'));
  }
  function sendPackage() {
    var sim = MC.sim, pkg = incidentPackage(), msg = Sim.busDispatch(sim);
    if (msg) Manara.link.send(msg);
    download('manara-' + MC.preset + '-seed' + MC.seed + '-package.json', 'application/json', JSON.stringify(pkg, null, 2));
    setTimeout(function () { download('manara-' + MC.preset + '-seed' + MC.seed + '-cap.xml', 'application/xml', pkg.cap); }, 250);
    Manara.toast(T('أُرسلت حزمة الحادث الموثّقة إلى غرفة التحكم (محاكاة) ونُزِّلت. 999 يبقى هو المُرسِل.', 'The verified incident package was sent to the control room (simulated) and downloaded. 999 stays the dispatcher.'), 'safe', 5200);
    addNote('dispatch', T('أُرسلت حزمة الحادث إلى غرفة التحكم (تنزيل JSON + CAP).', 'Incident package sent to the control room (JSON + CAP downloaded).'));
    MC.packageSent = sim.t;
  }

  /* ---- dispatch: the FASTEST unit given simulated traffic (not the nearest), with the runner-up and the why ---- */
  var ROLE_L = {
    fire: T('مكافحة الحريق / المواد الخطرة', 'Fight the fire / hazmat'), rescue: T('إنقاذ', 'Rescue'), ambulance: T('إسعاف في الموقع', 'Ambulance at the scene'), police: T('تطويق وتنظيم السير', 'Cordon and traffic')
  };
  function dispatchKinds() {
    var sim = MC.sim, d = MC.snap.dispatch, out = [];
    if (d) d.units.forEach(function (u) { if (u.assetId && out.indexOf(u.kind) < 0) out.push(u.kind); });
    if (!out.length && MSG && MSG.dispatch) MSG.dispatch.plan(MC.snap.hazard).forEach(function (q) { if (out.indexOf(q.kind) < 0 && UNIT[q.kind]) out.push(q.kind); });
    return out;
  }
  function stripDemo(s) { return String(s || '').replace(/\s*[—-]\s*(تجريبي[ة]?|\(demo\))|\s*\(demo\)/g, ''); }
  function buildDispatchPanel() {
    var p = panel('dispatch', 'الاستجابة: الأسرع وليس الأقرب', 'Dispatch: the fastest, not the nearest', { extra: h('span', { class: 'row-tags' }, simTag(), fictionalTag()) });
    var D = UI.dispatch = { cards: {}, sig: '' };
    D.lead = h('p', { class: 'dp-lead' }, bi('بعد اعتمادك، تقترح منارة من كل نوع الوحدة التي تصل أولًا بحسب الازدحام المحاكى — لا الأقرب بالمسافة. 999 يبقى هو المُرسِل.', 'After your approval MANARA recommends, per type, the unit that gets there first given simulated traffic — not the nearest by distance. 999 stays the dispatcher.'));
    D.banner = h('div', { class: 'dp-banner', hidden: '', role: 'status' });
    D.state = h('ol', { class: 'dp-plan' });
    STATE_ORDER.forEach(function (s) { D.state.appendChild(h('li', { 'data-s': s }, h('span', { class: 'pdot' }), h('b', null, bi(STATE_L[s].ar, STATE_L[s].en)), h('time', { class: 'mono' }))); });
    D.units = h('div', { class: 'dp-units' });
    D.hosp = h('div', { class: 'dp-hosp' });
    D.hopts = h('div', { class: 'dp-hopts' });
    // ranking
    D.rankSeg = h('div', { class: 'seg', role: 'group' }); lab(D.rankSeg, 'aria-label', 'نوع الوحدة للترتيب', 'Unit type to rank');
    D.rank = h('div', { class: 'dp-rank' });
    D.rankKind = null;
    // traffic controls
    D.hour = h('input', { type: 'range', min: '0', max: '24', step: '0.25', value: '4' }); lab(D.hour, 'aria-label', 'الوقت من اليوم (يغيّر الازدحام)', 'Time of day (changes the traffic)');
    D.hourOut = h('output', { class: 'mono' });
    D.hour.addEventListener('input', function () { setText(D.hourOut, hhmm(+D.hour.value)); drawTrafficChart(+D.hour.value); });
    D.hour.addEventListener('change', function () { act('hour', { hour: +D.hour.value % 24 }); });
    D.load = h('input', { type: 'range', min: '0', max: '2', step: '0.05', value: '1' }); lab(D.load, 'aria-label', 'شدة الازدحام', 'Traffic level');
    D.loadOut = h('output', { class: 'mono' });
    D.load.addEventListener('input', function () { setText(D.loadOut, loadLabel(+D.load.value)); });
    D.load.addEventListener('change', function () { act('traffic', { load: +D.load.value }); });
    D.chart = h('canvas', { class: 'tchart', width: '640', height: '150', role: 'img' }); lab(D.chart, 'aria-label', 'الازدحام المحاكى على مدار اليوم', 'Simulated traffic through the day');
    D.road = h('select', { class: 'input' }); lab(D.road, 'aria-label', 'اختر طريقًا', 'Choose a road');
    WI.roads.segs.filter(function (s) { return s.cls !== 'access' || true; }).forEach(function (s) { var o = h('option', { value: s.id }); o.textContent = LL(s.name) + ' · ' + s.id; D.road.appendChild(o); });
    D.roadBtns = h('div', { class: 'btns' },
      btn('btn btn-sm btn-ghost', 'car', 'أبطئ', 'Jam', function () { act('jam', { seg: D.road.value, factor: 0.15 }); }),
      btn('btn btn-sm btn-ghost', 'x', 'أغلق', 'Close', function () { act('close', { seg: D.road.value }); }),
      btn('btn btn-sm btn-ghost', 'reset', 'أزل', 'Clear', function () { act('unjam', { seg: D.road.value }); act('open', { seg: D.road.value }); }));
    D.cond = h('ul', { class: 'dp-cond' });
    D.busy = h('div', { class: 'dp-busy' });
    D.history = h('ol', { class: 'dp-hist' });
    D.send = btn('btn btn-cool dp-send', 'route', 'أرسل حزمة الحادث إلى غرفة التحكم (999 يبقى المُرسِل)', 'Send incident package to control room (999 stays the dispatcher)', function () { sendPackage(); });
    p.body.appendChild(D.lead); p.body.appendChild(D.banner); p.body.appendChild(D.state); p.body.appendChild(D.units); p.body.appendChild(D.hosp); p.body.appendChild(D.hopts);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('ترتيب الوحدات المرشّحة بحسب زمن الوصول', 'Candidates ranked by time to arrive'))); p.body.appendChild(D.rankSeg); p.body.appendChild(D.rank);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('المرور (محاكاة): غيّره وراقب القرار يتبدّل', 'Traffic (SIM): change it and watch the choice flip')));
    p.body.appendChild(h('div', { class: 'dp-ctl' }, field('الوقت من اليوم', 'Time of day', h('div', { class: 'rng' }, D.hour, D.hourOut)), field('شدة الازدحام (٠ فارغ · ١ معتاد · ٢ خانق)', 'Traffic level (0 empty · 1 typical · 2 gridlock)', h('div', { class: 'rng' }, D.load, D.loadOut))));
    p.body.appendChild(D.chart);
    p.body.appendChild(h('p', { class: 'muted small' }, bi('المنحنى: ملف يومي افتراضي بذروتين صباحية ومسائية (افتراض مُسمّى)، مع طوابير في الطرق قرب المدرسة. حقيقة الحياة: مزوّد مرور حيّ وبيانات مواقع المركبات من الجهة نفسها.', 'The curve is an assumed daily profile with morning and evening peaks (a labelled assumption) plus queues on the school road. In real life: a live traffic provider and the authority’s own vehicle locations.')));
    p.body.appendChild(h('div', { class: 'dp-roadrow' }, field('طريق', 'Road', D.road), D.roadBtns)); p.body.appendChild(D.cond);
    p.body.appendChild(h('p', { class: 'muted small' }, bi('أو انقر على طريق في الخريطة (أداة «ازدحام» أو «إغلاق»).', 'Or click a road on the map (the “Jam” or “Close” tool).')));
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('توفّر الوحدات', 'Unit availability'))); p.body.appendChild(D.busy);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('سجلّ الاستجابة', 'Dispatch history'))); p.body.appendChild(D.history);
    p.body.appendChild(D.send);
    p.body.appendChild(h('p', { class: 'pn-foot' }, bi('المحطات والمستشفيات وهمية على خريطة محاكاة؛ الأزمنة SIM. في الواقع يبقى 999 هو المُرسِل وتحتاج منارة إلى اتفاقيات مع الجهات. زمن وصول سيارات الإسعاف الحقيقي في قطر: هدف 75٪ خلال 10 دقائق في المدن (S24 — مؤسسة حمد، 2023).', 'Stations and hospitals are fictional points on a simulated map; times are SIM. In real life 999 stays the dispatcher and MANARA would need agreements with the authorities. Real-world target for Qatar’s ambulance service: 75 % of 999 calls reached within 10 minutes in urban areas (S24 — HMC National Health Strategy; the SIM times here are not a measurement of it).')));
    PANEL_UPDATERS.push(updateDispatch);
    return p;
  }
  function loadLabel(v) { return v < 0.2 ? B('فارغ', 'empty') : v < 0.85 ? B('خفيف', 'light') : v <= 1.15 ? B('معتاد', 'typical') : v < 1.6 ? B('ثقيل', 'heavy') : B('خانق', 'gridlock'); }
  function drawTrafficChart(curHour) {
    var D = UI.dispatch, cv = D.chart, c = cv.getContext('2d'), w = cv.width, hh = cv.height, pad = 22;
    c.clearRect(0, 0, w, hh);
    var prof = WI.profile, px = function (hr) { return pad + hr / 24 * (w - pad * 2); }, py = function (f) { return hh - pad - f * (hh - pad * 2); };
    c.font = '600 20px ' + R.font; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.strokeStyle = rgba(C('line-2'), 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(pad, hh - pad); c.lineTo(w - pad, hh - pad); c.stroke();
    [0, 6, 12, 18, 24].forEach(function (hr) { c.fillStyle = rgba(C('muted')); c.fillText(String(hr), px(hr), hh - 4); c.beginPath(); c.moveTo(px(hr), hh - pad); c.lineTo(px(hr), hh - pad + 4); c.stroke(); });
    var g = c.createLinearGradient(0, py(1), 0, py(0.4)); g.addColorStop(0, rgba(C('safe'), 0.9)); g.addColorStop(0.5, rgba(C('warn'), 0.9)); g.addColorStop(1, rgba(C('danger'), 0.95));
    c.beginPath(); prof.forEach(function (q, i) { if (i) c.lineTo(px(q[0]), py(q[1])); else c.moveTo(px(q[0]), py(q[1])); }); c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = g; c.stroke();
    c.lineTo(px(24), hh - pad); c.lineTo(px(0), hh - pad); c.closePath(); c.fillStyle = rgba(C('accent'), 0.1); c.fill();
    // school drop-off / pick-up windows
    [[6.75, 7.75], [12.5, 13.5]].forEach(function (b) { c.fillStyle = rgba(C('warn'), 0.2); c.fillRect(px(b[0]), pad - 8, px(b[1]) - px(b[0]), hh - pad * 2 + 8); });
    var hrNow = curHour % 24; c.strokeStyle = rgba(C('head')); c.lineWidth = 2; c.beginPath(); c.moveTo(px(hrNow), pad - 8); c.lineTo(px(hrNow), hh - pad); c.stroke();
    c.fillStyle = rgba(C('head')); c.textAlign = 'center'; c.fillText(hhmm(hrNow), clamp(px(hrNow), 34, w - 34), 14);
  }
  function unitCard(u) {
    var K = UI.dispatch, refs = {};
    refs.state = h('span', { class: 'tag' }); refs.eta = h('b', { class: 'mono ucard-eta' }); refs.dist = h('span', { class: 'mono muted' }); refs.why = h('p', { class: 'ucard-why' }); refs.cmp = h('ul', { class: 'ucard-cmp' }); refs.badge = h('div', { class: 'ucard-fbf', hidden: '' }); refs.steps = h('ol', { class: 'ucard-steps' }); refs.meta = h('small', { class: 'muted' });
    STATE_ORDER.forEach(function (s) { refs.steps.appendChild(h('li', { 'data-s': s }, h('i'), h('small', { class: 'mono' }))); });
    var card = h('article', { class: 'ucard', 'data-kind': u.kind },
      h('header', null, h('span', { class: 'uico', style: '--c:var(' + UNIT[u.kind].tok + ')' }, icon(UNIT[u.kind].icon)), h('div', { class: 'ucard-t' }, h('b', null, bi(UNIT[u.kind].name.ar, UNIT[u.kind].name.en)), h('small', { class: 'muted' }, bi(ROLE_L[u.kind] ? ROLE_L[u.kind].ar : '', ROLE_L[u.kind] ? ROLE_L[u.kind].en : ''))), refs.state),
      h('div', { class: 'ucard-name' }, refs.nm = h('b'), ' ', fictionalTag()),
      h('div', { class: 'ucard-eta-row' }, refs.eta, refs.dist, simTag()), refs.badge, refs.why, refs.cmp, refs.steps, refs.meta);
    card._r = refs; return card;
  }
  function updateDispatch() {
    var D = UI.dispatch, snap = MC.snap, sim = MC.sim, d = snap.dispatch, hz = snap.hazard;
    // banner
    var b = MC.banner;
    if (b) { D.banner.hidden = false; D.banner.className = 'dp-banner ' + (b.type === 'redispatch' ? 'warn' : 'info'); D.banner.replaceChildren(icon(b.type === 'redispatch' ? 'alert' : 'route'), h('span', null, h('b', null, b.type === 'redispatch' ? B('إعادة إرسال تلقائية: ', 'AUTOMATIC RE-DISPATCH: ') : b.type === 'far-but-faster' ? B('أبعد لكن أسرع: ', 'FARTHER BUT FASTER: ') : B('تغيّرت التوصية: ', 'RECOMMENDATION CHANGED: ')), LL(b.text))); } else D.banner.hidden = true;
    // plan state ladder
    var cur = d ? d.state : null, ci = STATE_ORDER.indexOf(cur);
    $$('li', D.state).forEach(function (li, i) { var s = li.getAttribute('data-s'); li.classList.toggle('done', d && i < ci); li.classList.toggle('cur', d && i === ci); setText($('time', li), d && d.t && d.t[s] != null ? 't+' + N(d.t[s]) : ''); });
    // cards
    var units = d ? d.units.filter(function (u) { return u.assetId; }) : [], sig = d ? d.id + ':' + units.map(function (u) { return u.kind + u.assetId; }).join(',') : 'none';
    if (D.sig !== sig) {
      D.sig = sig; D.units.replaceChildren(); D.cards = {};
      if (!d) D.units.appendChild(h('div', { class: 'dp-empty' }, icon('route'), h('p', null, bi('لا توصية بعد. عند «مؤكَّد» تُحسب الوحدة الأسرع من كل نوع؛ وبعد اعتمادك تتحول إلى «معتمدة» ثم «أُرسلت».', 'No recommendation yet. At CONFIRMED the fastest unit of each type is computed; after your approval it becomes “approved”, then “dispatched”.'))));
      units.forEach(function (u) { var c = unitCard(u); D.cards[u.kind + ':' + u.assetId] = c; D.units.appendChild(c); });
    }
    units.forEach(function (u) {
      var c = D.cards[u.kind + ':' + u.assetId]; if (!c) return; var r = c._r, wd = u.whyData || {};
      setText(r.nm, stripDemo(LL(u.name))); setText(r.state, LL(STATE_L[u.state])); r.state.className = 'tag ' + (u.state === 'on-scene' || u.state === 'cleared' ? 'safe' : u.state === 'recommended' ? 'cool' : 'warn');
      setText(r.eta, u.state === 'on-scene' ? B('في الموقع', 'ON SCENE') : u.state === 'cleared' ? B('أنهت', 'CLEARED') : mmss(u.etaSec));
      setText(r.dist, u.state === 'on-scene' || u.state === 'cleared' ? '' : B('الوصول · ', 'ETA · ') + fmtDist(u.distM));
      setText(r.why, LL(u.why));
      // each line: [label, name, 'eta · distance' (always left-to-right), class]. Names are text nodes; numbers sit in a <bdi dir=ltr> so Arabic never scrambles them.
      var lines = [];
      if (wd.chosen) lines.push([B('الأسرع عند القرار', 'Fastest at decision'), stripDemo(LL(u.name)), mmss(wd.chosen.etaSec) + ' · ' + fmtDist(wd.chosen.distM), 'rec']);
      if (u.runnerUp) lines.push([B('الثانية عند القرار', 'Runner-up at decision'), stripDemo(LL(u.runnerUp.name)), mmss(u.runnerUp.etaSec) + (wd.chosen ? ' (+' + mmss(u.runnerUp.etaSec - wd.chosen.etaSec) + ')' : '') + ' · ' + fmtDist(u.runnerUp.distM), '']);
      if (u.nearestByDistance && u.nearestByDistance.assetId !== u.assetId) lines.push([B('الأقرب بالمسافة', 'Nearest by distance'), stripDemo(LL(u.nearestByDistance.name)), fmtDist(u.nearestByDistance.distM) + ' · ' + B('زمنها ', 'would take ') + mmss(u.nearestByDistance.etaSec), 'near']);
      if (wd.skippedBusy && wd.skippedBusy.length) lines.push([B('تُخطّيت (مشغولة)', 'Skipped (busy)'), wd.skippedBusy.join('، '), '', '']);
      var csig = lang() + lines.map(function (q) { return q.join('|'); }).join('||');
      if (r.csig !== csig) { r.csig = csig; r.cmp.replaceChildren(); lines.forEach(function (q) { r.cmp.appendChild(h('li', { class: q[3] }, h('span', { class: 'cl', text: q[0] }), h('span', { class: 'cv' }, h('span', { text: q[1] }), q[2] ? ' ' : null, q[2] ? h('bdi', { class: 'mono', dir: 'ltr', text: q[2] }) : null))); }); }
      if (wd.farButFaster) { r.badge.hidden = false; r.badge.replaceChildren(icon('route'), h('b', { text: B('أبعد لكن أسرع', 'FARTHER BUT FASTER') }), h('span', { class: 'fbf-n' }, h('bdi', { class: 'mono', dir: 'ltr', text: '+' + N(Math.round(wd.extraDistM / 100) / 10, 1) }), ' ', h('span', { text: B('كم أبعد', 'km farther') }), ' · ', h('bdi', { class: 'mono', dir: 'ltr', text: '−' + mmss(wd.gainSec) }), ' ', h('span', { text: B('أسرع', 'faster') }))); } else r.badge.hidden = true;
      var ui = STATE_ORDER.indexOf(u.state); $$('li', r.steps).forEach(function (li, i) { var s = li.getAttribute('data-s'); li.className = i < ui ? 'done' : i === ui ? 'cur' : ''; setText($('small', li), u.states && u.states[s] != null ? N(u.states[s]) : ''); li.title = LL(STATE_L[s]); });
      setText(r.meta, (u.reroutes ? B('أُعيد توجيهها ', 're-routed ') + N(u.reroutes) + '× · ' : '') + (u.replaced ? B('حلّت محلّ ', 'replaced ') + stripDemo(LL(u.replaced.name)) + ' (' + u.replaced.reason + ') · ' : ''));
    });
    // hospital: the live recommendation (re-picked from the current free beds and traffic) until the ambulance has loaded the patients
    var hp = d ? d.hospital : null, fixedDest = sim.events.some(function (e) { return e.type === 'transport'; }), lv0 = null;
    if (d && d.hospital && d.patients && !fixedDest) {
      try {
        var lv = Sim.traffic.pickHospital(sim, d.patients);
        if (lv && lv.chosen) hp = { id: lv.chosen.asset.id, name: lv.chosen.asset.name, etaSec: Math.round(lv.chosen.etaSec), distM: Math.round(lv.chosen.distM), freeBeds: lv.chosen.freeBeds, fits: lv.chosen.fits, why: lv.why, options: lv.options.map(function (o) { return { id: o.asset.id, etaSec: Math.round(o.etaSec), freeBeds: o.freeBeds, fits: o.fits }; }) };
      } catch (e) { lv0 = null; }
    } else if (hp && d && d.patients) {
      try { var lv2 = Sim.traffic.pickHospital(sim, d.patients); hp = Object.assign({}, hp, { options: lv2.options.map(function (o) { return { id: o.asset.id, etaSec: Math.round(o.etaSec), freeBeds: o.freeBeds, fits: o.fits }; }) }); } catch (e2) { /* keep the plan's list */ }
    }
    D.hosp.replaceChildren();
    if (hp) {
      D.hosp.appendChild(h('article', { class: 'ucard hosp' }, h('header', null, h('span', { class: 'uico', style: '--c:var(--danger)' }, icon('hospital')), h('div', { class: 'ucard-t' }, h('b', null, bi('المستشفى الموصى به للمصابين', 'Recommended hospital for patients')), h('small', { class: 'muted' }, bi('الأقرب زمنًا ممن يستوفي القدرة والسعة', 'Fastest that has the capability and capacity'))), chip(hp.fits ? B('مناسب', 'FITS') : B('بلا مكان', 'NO ROOM'), hp.fits ? 'safe' : 'danger')),
        h('div', { class: 'ucard-name' }, h('b', { text: stripDemo(LL(hp.name)) }), ' ', fictionalTag()), h('div', { class: 'ucard-eta-row' }, h('b', { class: 'mono ucard-eta', text: mmss(hp.etaSec) }), h('span', { class: 'mono muted', text: fmtDist(hp.distM) + ' · ' + B('أسرّة حرة ', 'free beds ') + N(hp.freeBeds) }), simTag()),
        h('p', { class: 'ucard-why', text: LL(hp.why) })));
    }
    // destination hospital choice: every hospital with its ETA and a free-beds assumption the judge can change (0 = full → it is skipped)
    var hpo = hp && hp.options ? hp.options : [], osig = hpo.map(function (o) { return o.id; }).join(',') + ':' + (hp ? hp.id : '');
    if (D.osig !== osig) {
      D.osig = osig; D.hopts.replaceChildren(); D.orows = {};
      if (hpo.length) {
        D.hopts.appendChild(h('h3', { class: 'pn-sub' }, bi('اختيار المستشفى الوجهة', 'Destination hospital choice')));
        D.hopts.appendChild(h('p', { class: 'muted small' }, bi('الأسرع زمنًا ممن يملك القدرة والسعة. «الأسرّة الحرة» افتراض محاكى: اجعلها 0 لترى القرار يتحول.', 'The fastest one that has the capability and capacity. “Free beds” is a simulated assumption: set it to 0 and watch the choice move.')));
        D.hnote = h('p', { class: 'muted small hnote' }); D.hopts.appendChild(D.hnote);
        hpo.forEach(function (o) {
          var a = assetById(o.id), inp = h('input', { class: 'input mono hb-in', type: 'number', min: '0', max: '99', step: '1', value: String(o.freeBeds) });
          lab(inp, 'aria-label', 'الأسرّة الحرة في ' + (a ? stripDemo(a.name.ar) : o.id), 'Free beds at ' + (a ? stripDemo(a.name.en) : o.id));
          inp.addEventListener('change', function () { act('beds', { id: o.id, beds: Math.max(0, Math.min(99, Math.floor(+inp.value || 0))) }); });
          inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
          var st = h('span', { class: 'tag' }), eta = h('b', { class: 'mono' });
          D.orows[o.id] = { inp: inp, st: st, eta: eta, row: h('div', { class: 'hrow' }, h('span', { class: 'hn' }, h('b', { text: a ? stripDemo(LL(a.name)) : o.id }), st), eta, h('label', { class: 'hb' }, h('small', { class: 'muted' }, bi('أسرّة حرة', 'free beds')), inp)) };
          D.hopts.appendChild(D.orows[o.id].row);
        });
      }
    }
    if (D.hnote) setText(D.hnote, fixedDest ? B('الوجهة ثُبّتت: المصابون في الطريق إلى المستشفى.', 'Destination fixed: the patients are already on their way.') : B('توصية حيّة: تُثبَّت الوجهة عندما تحمّل الإسعاف المصابين.', 'Live recommendation: the destination is fixed when the ambulance has loaded the patients.'));
    hpo.forEach(function (o) {
      var r = D.orows && D.orows[o.id]; if (!r) return;
      setText(r.eta, mmss(o.etaSec)); if (doc.activeElement !== r.inp) r.inp.value = String(o.freeBeds);
      var chosen = hp && hp.id === o.id; setText(r.st, chosen ? B('المختار', 'CHOSEN') : o.fits ? B('مناسب', 'fits') : B('بلا مكان', 'no room')); r.st.className = 'tag ' + (chosen ? 'safe' : o.fits ? 'cool' : 'danger'); r.row.classList.toggle('chosen', chosen);
    });
    // ranking
    var kinds = dispatchKinds(), rsig = kinds.join(',');
    if (D.rsig !== rsig) {
      D.rsig = rsig; D.rankSeg.replaceChildren();
      kinds.forEach(function (k) { var bt = h('button', { type: 'button', class: 'seg-b', 'data-id': k, onclick: function () { D.rankKind = k; updateDispatch(); } }, icon(UNIT[k].icon), bi(UNIT[k].short.ar, UNIT[k].short.en)); D.rankSeg.appendChild(bt); });
      if (kinds.indexOf(D.rankKind) < 0) D.rankKind = kinds[0] || null;
    }
    $$('.seg-b', D.rankSeg).forEach(function (bt) { bt.setAttribute('aria-pressed', bt.getAttribute('data-id') === D.rankKind ? 'true' : 'false'); });
    D.rank.replaceChildren();
    if (D.rankKind) {
      var cmp = null; try { cmp = Sim.dispatchCompare(sim, D.rankKind === 'rescue' ? 'fire' : D.rankKind, D.rankKind === 'rescue' ? { flag: 'rescue' } : {}); } catch (e) { cmp = null; }
      if (cmp && cmp.ranked && cmp.ranked.length) {
        var mx = Math.max.apply(null, cmp.ranked.map(function (q) { return q.etaSec; }));
        cmp.ranked.forEach(function (q, i) {
          var a = assetById(q.id), isNear = cmp.nearestByDistance && cmp.nearestByDistance.id === q.id;
          D.rank.appendChild(h('div', { class: 'rk' + (i === 0 ? ' best' : '') }, h('span', { class: 'rk-n' }, h('b', { text: (i + 1) + '. ' + (a ? stripDemo(LL(a.name)) : q.id) }), isNear ? chip(B('الأقرب بالمسافة', 'nearest by distance'), 'warn') : null, i === 0 ? chip(B('الأسرع', 'fastest'), 'safe') : null),
            h('span', { class: 'rk-bar' }, h('i', { style: 'width:' + (q.etaSec / mx * 100) + '%' })), h('span', { class: 'rk-v mono', text: mmss(q.etaSec) + ' · ' + fmtDist(q.distM) })));
        });
        D.rank.appendChild(h('p', { class: 'muted small', text: LL(cmp.why) }));
        if (!d) D.rank.appendChild(h('p', { class: 'muted small' }, bi('معاينة: لو أُكِّد الحادث الآن.', 'Preview: if the incident were confirmed now.')));
      } else D.rank.appendChild(h('p', { class: 'muted small' }, bi('لا وحدة مرشّحة متاحة الآن.', 'No candidate unit is available right now.')));
    }
    // traffic controls (do not fight the user while they drag)
    var tr = snap.traffic, hourNow = sim.hour0 + sim.t / 3600;
    if (doc.activeElement !== D.hour) { var hv = hourNow % 24; D.hour.value = String(Math.round(hv * 4) / 4); setText(D.hourOut, hhmm(hv)); }
    if (doc.activeElement !== D.load) { D.load.value = String(tr.load); setText(D.loadOut, loadLabel(tr.load)); }
    if (D.chartSig !== Math.round(hourNow * 4) + isDark()) { D.chartSig = Math.round(hourNow * 4) + isDark(); drawTrafficChart(hourNow); }
    // road conditions list
    var tm = trafficMap(), conds = Object.keys(tm).filter(function (k) { return tm[k].closed || tm[k].jam != null; }), csig2 = conds.map(function (k) { return k + (tm[k].closed ? 'c' : 'j'); }).join(',');
    if (D.csig !== csig2) {
      D.csig = csig2; D.cond.replaceChildren();
      if (!conds.length) D.cond.appendChild(h('li', { class: 'muted small' }, bi('لا ازدحام ولا إغلاق يدوي. (قد يكون السيناريو نفسه فيه طوابير.)', 'No manual jam or closure. (The scenario itself may include queues.)')));
      conds.forEach(function (k) { var s = R.geo.segById[k]; D.cond.appendChild(h('li', null, h('span', { class: 'tag ' + (tm[k].closed ? 'danger' : 'warn') }, tm[k].closed ? B('مغلق', 'CLOSED') : B('مزدحم', 'JAMMED')), ' ', h('span', { text: LL(s.name) + ' · ' + k }), btn('icon-btn sm', 'x', null, null, function () { act('unjam', { seg: k }); if (tm[k].closedBy === 'operator') act('open', { seg: k }); }, { 'aria-label': B('أزل', 'Clear') }))); });
    }
    // availability
    if (!D.busyBuilt) {
      D.busyBuilt = true;
      WI.assets.forEach(function (a) {
        var row = switchRow('مشغولة: ' + LL(a.name).replace(/\s*[—-]\s*تجريبي[ة]?/g, ''), 'Busy: ' + stripDemo(a.name.en), false, function (on) { act('busy', { asset: a.id, busy: on }); }); row._cb.setAttribute('data-asset', a.id); D.busy.appendChild(row);
      });
    }
    $$('input[data-asset]', D.busy).forEach(function (cb) { cb.checked = !!(sim.busy && sim.busy[cb.getAttribute('data-asset')]); });
    // history
    var hist = sim.events.filter(function (e) { return /^(dispatch|dispatched|unit-|redispatch|reroute-unit|far-but-faster|recommendation-change|road-|cordon|transport|hospital-arrival|call-999|scenario-jam)/.test(e.type); }).slice(-6), hsig = hist.map(function (e) { return e.t + e.type; }).join(',');
    if (D.hsig !== hsig) { D.hsig = hsig; D.history.replaceChildren(); if (!hist.length) D.history.appendChild(h('li', { class: 'muted small' }, bi('لا أحداث استجابة بعد.', 'No dispatch events yet.'))); hist.forEach(function (e) { D.history.appendChild(h('li', null, h('time', { class: 'mono', text: mmss(e.t) }), ' ', h('span', { text: LL(e.text) }))); }); }
    D.send.disabled = !d;
  }

  /* ---- event log (aria-live), filters by category and person ---- */
  var CATS = [
    { id: 'all', ar: 'الكل', en: 'All' }, { id: 'verify', ar: 'التحقق', en: 'Verify' }, { id: 'alert', ar: 'التنبيه', en: 'Alert' }, { id: 'guide', ar: 'الإرشاد', en: 'Guide' },
    { id: 'people', ar: 'الأشخاص', en: 'People' }, { id: 'dispatch', ar: 'الاستجابة', en: 'Dispatch' }, { id: 'hazard', ar: 'الخطر', en: 'Hazard' }, { id: 'drone', ar: 'الطائرة', en: 'Drone' }, { id: 'ui', ar: 'المشغّل', en: 'Operator' }];
  var CAT_OF = {
    verify: 'suspect suspect-clear confirmed approved rejected local-alarm sentinel-buzzer threshold case-confirmed', alert: 'public-alert person-alert ladder ladder-stop woke knock',
    guide: 'exit-state exit-set reroute dead-end trapped', people: 'safe checkin injured incapacitated collapse rescued help-arrived',
    dispatch: 'dispatch-recommended recommendation-change far-but-faster dispatch-approved dispatched unit-en-route unit-on-scene unit-cleared reroute-unit redispatch road-closed road-open road-jam unit-busy scenario-jam cordon transport hospital-arrival call-999 suppression',
    hazard: 'start ignition fire-spread flashover fire-outdoor valve-closed end', drone: 'drone drone-ordered drone-located'
  };
  var CAT_MAP = {}; Object.keys(CAT_OF).forEach(function (c) { CAT_OF[c].split(' ').forEach(function (t) { CAT_MAP[t] = c; }); });
  var OP_TEXT = {
    wind: function (a) { return T('ضبط المشغّل الرياح: من ' + windDir8(a.deg).ar + ' ' + a.speed + ' م/ث', 'Operator set the wind: from ' + windDir8(a.deg).en + ' ' + a.speed + ' m/s'); },
    traffic: function (a) { return T('ضبط المشغّل شدة المرور: ' + a.load, 'Operator set the traffic level: ' + a.load); },
    hour: function (a) { return T('ضبط المشغّل الوقت من اليوم: ' + hhmm(a.hour), 'Operator set the time of day: ' + hhmm(a.hour)); },
    beds: function (a) { return T('ضبط المشغّل الأسرّة الحرة في ' + a.id + ': ' + a.beds, 'Operator set the free beds at ' + a.id + ': ' + a.beds); },
    inject: function (a) { return T('عطّل المشغّل الحسّاس ' + a.ch + ' (قراءة عالية عالقة)', 'Operator faulted sentinel ' + a.ch + ' (stuck-high reading)'); },
    decoy: function (a) { return T('أطلق المشغّل خدعة بمفتاح واحد: ' + a.kind, 'Operator triggered a single-key decoy: ' + a.kind); },
    checkin: function (a) { return T('تسجيل (محاكى): ' + a.key + ' — ' + (a.status === 'safe' ? 'بأمان' : 'يحتاج مساعدة'), 'Check-in (simulated): ' + a.key + ' — ' + (a.status === 'safe' ? 'safe' : 'needs help')); },
    trigger: function () { return T('بدأ المشغّل الخطر الآن', 'Operator started the hazard now'); },
    param: function (a) { return T('تغيّر افتراض: ' + a.key + ' = ' + a.value, 'Assumption changed: ' + a.key + ' = ' + a.value); },
    note: function (a) { return a.text; }
  };
  function addNote(cat, text) { act('note', { cat: cat, text: text }); }
  function logItems() {
    var sim = MC.sim, out = [];
    sim.events.forEach(function (e) { out.push({ t: e.t, type: e.type, text: e.text, cat: CAT_MAP[e.type] || 'hazard', person: e.person || null, hero: e.hero }); });
    for (var i = 0; i < MC.ai; i++) {
      var a = MC.actions[i], f = OP_TEXT[a.op]; if (!f) continue;
      out.push({ t: a.t, type: 'op:' + a.op, text: f(a), cat: a.op === 'note' ? (a.cat || 'ui') : (a.op === 'checkin' ? 'people' : 'ui'), person: a.op === 'checkin' ? a.key : null });
    }
    out.sort(function (x, y) { return x.t - y.t; });
    return out;
  }
  function buildLogPanel() {
    var p = panel('log', 'سجلّ الأحداث', 'Event log');
    var G = UI.log = { rows: 0, shown: 0 };
    G.chips = h('div', { class: 'chips log-cats', role: 'group' }); lab(G.chips, 'aria-label', 'تصفية حسب النوع', 'Filter by category');
    CATS.forEach(function (c) { var b = h('button', { type: 'button', class: 'chip', 'data-c': c.id, 'aria-pressed': c.id === 'all' ? 'true' : 'false', onclick: function () { MC.log.filter = c.id; applyLogFilter(); } }, bi(c.ar, c.en)); G.chips.appendChild(b); });
    G.person = h('select', { class: 'input log-person' }); lab(G.person, 'aria-label', 'تصفية حسب الشخص', 'Filter by person');
    [['all', 'كل الأشخاص', 'Everyone']].concat(HERO.map(function (k) { return [k, HERO_NAME[k].ar, HERO_NAME[k].en]; })).forEach(function (o) { var op = h('option', { value: o[0] }); op.textContent = B(o[1], o[2]); G.person.appendChild(op); });
    G.person.addEventListener('change', function () { MC.log.person = G.person.value; applyLogFilter(); });
    G.count = h('span', { class: 'muted small mono' });
    G.list = h('ol', { class: 'evlog', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', tabindex: '0' }); lab(G.list, 'aria-label', 'سجلّ أحداث المحاكاة', 'Simulation event log');
    p.body.appendChild(h('div', { class: 'log-bar' }, G.chips, G.person, G.count)); p.body.appendChild(G.list);
    PANEL_UPDATERS.push(updateLog);
    return p;
  }
  var CAT_ICON = { verify: 'shield', alert: 'bell', guide: 'route', people: 'users', dispatch: 'route', hazard: 'fire', drone: 'drone', ui: 'sliders' };
  function logRow(it) {
    var li = h('li', { class: 'ev-r c-' + it.cat, 'data-c': it.cat, 'data-p': it.person || '' }, h('time', { class: 'mono', text: mmss(it.t) }), h('span', { class: 'ev-i' }, icon(CAT_ICON[it.cat] || 'help')), h('span', { class: 'ev-x', text: LL(it.text) }));
    return li;
  }
  function updateLog() {
    var G = UI.log, items = logItems(), sig = MC.preset + ':' + MC.seed + ':' + lang();
    if (MC.log.dirty || G.sig !== sig || items.length < G.rows) { G.list.replaceChildren(); G.rows = 0; G.sig = sig; MC.log.dirty = false; }
    for (var i = G.rows; i < items.length; i++) G.list.insertBefore(logRow(items[i]), G.list.firstChild);
    G.rows = items.length;
    while (G.list.children.length > 500) G.list.removeChild(G.list.lastChild);
    applyLogFilter();
  }
  function applyLogFilter() {
    var G = UI.log, f = MC.log.filter, pe = MC.log.person, n = 0, tot = 0;
    $$('.chip', G.chips).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-c') === f ? 'true' : 'false'); });
    $$('li', G.list).forEach(function (li) { var ok = (f === 'all' || li.getAttribute('data-c') === f) && (pe === 'all' || li.getAttribute('data-p') === pe); li.hidden = !ok; tot++; if (ok) n++; });
    setText(G.count, N(n) + ' / ' + N(tot));
  }

  /* ---- A/B (same seed, ordinary alarm vs MANARA) + 20-seed distribution — time-sliced, never blocks the page ---- */
  function diffMetrics(o, m) {                    // mirrors ManaraSim's own diff() (positive = MANARA better) — checked against ManaraSim.ab in tests
    var round1 = function (v) { return Math.round(v * 10) / 10; }, d = function (a, b) { return a == null || b == null ? null : round1(a - b); };
    return {
      note: T('القيم الموجبة = المنارة أفضل (أقل)، باستثناء «أول إنذار» حيث الموجب يعني أن الإنذار العادي أبكر', 'Positive = MANARA better (lower), except "first alert" where positive means the ordinary alarm came earlier'),
      timeToSafeP50Sec: o.timeToSafe.reliable && m.timeToSafe.reliable ? d(o.timeToSafeP50Sec, m.timeToSafeP50Sec) : null, timeToSafeP90Sec: o.timeToSafe.reliable && m.timeToSafe.reliable ? d(o.timeToSafeP90Sec, m.timeToSafeP90Sec) : null,
      injuredInModel: d(o.injuredInModel, m.injuredInModel), incapacitatedInModel: d(o.incapacitatedInModel, m.incapacitatedInModel), exposurePersonSec: d(o.exposurePersonSec, m.exposurePersonSec),
      collapses: d(o.collapses, m.collapses), timeToHelpSec: d(o.timeToHelpSec, m.timeToHelpSec), timeToDispatchSec: d(o.timeToDispatchSec, m.timeToDispatchSec), timeToOnSceneSec: d(o.timeToOnSceneSec, m.timeToOnSceneSec),
      firstAlertSec: d(m.timeToFirstAlertSec, o.timeToFirstAlertSec), stillNotSafeAt120: d(o.stillNotSafe.t120, m.stillNotSafe.t120), stillNotSafeAt300: d(o.stillNotSafe.t300, m.stillNotSafe.t300),
      headline: o.headline && m.headline ? d(o.headline.value, m.headline.value) : null
    };
  }
  var BATCH = null;
  function runBatch(opts) {                       // opts: {seeds:[..], seconds?, onProgress, onSeed(res), onDone(results)}
    if (BATCH) BATCH.cancel = true;
    var b = BATCH = { cancel: false, seeds: opts.seeds.slice(), i: 0, job: 0, sim: null, o: null, results: [], opts: opts, doneTicks: 0, totalTicks: 0 };
    var base = { preset: originPresetId(MC.preset, MC.origin), params: MC.params, autoApprove: true };
    var dur = opts.seconds || Sim.PRESETS[MC.preset].durationSec; b.dur = dur; b.totalTicks = dur * 2 * b.seeds.length;
    function pump() {
      if (b.cancel) { if (opts.onCancel) opts.onCancel(b.results); return; }
      var t0 = now();
      while (now() - t0 < 12) {
        if (!b.sim) { var sd = b.seeds[b.i]; b.sim = Sim.create(Object.assign({}, base, { seed: sd, mode: b.job === 0 ? 'ordinary' : 'manara' })); }
        Sim.step(b.sim, 1); b.doneTicks++;
        if (b.sim.t >= b.dur || b.sim.done) {
          var met = Sim.metrics(b.sim);
          if (b.job === 0) { b.o = met; b.job = 1; } else {
            var res = { seed: b.seeds[b.i], ordinary: b.o, manara: met, delta: diffMetrics(b.o, met), seconds: b.dur }; b.results.push(res); if (opts.onSeed) opts.onSeed(res, b.results);
            b.i++; b.job = 0; b.o = null;
          }
          b.sim = null;
          if (b.i >= b.seeds.length) { BATCH = null; if (opts.onDone) opts.onDone(b.results); return; }
        }
      }
      if (opts.onProgress) opts.onProgress(b.doneTicks / b.totalTicks);
      setTimeout(pump, 0);
    }
    setTimeout(pump, 0);
    return b;
  }
  var AB_ROWS = [
    { k: 'timeToDispatchSec', ar: 'الزمن حتى إرسال الوحدات', en: 'Time to dispatch', o: function (m) { return m.dispatch && m.dispatch.planned ? m.dispatch.timeToDispatchSec : null; }, unit: 's' },
    { k: 'timeToOnSceneSec', ar: 'الزمن حتى وصول الوحدات إلى الموقع', en: 'Time to on scene', o: function (m) { return m.dispatch && m.dispatch.planned ? m.dispatch.timeToOnSceneSec : null; }, unit: 's' },
    { k: 'firstAlert', ar: 'أول إنذار يسمعه أحد', en: 'First alarm anyone hears', o: function (m) { return m.timeToFirstAlertSec; }, unit: 's', note: T('قد يسبق الإنذار العادي منارة — مقايضة صادقة: منارة تنتظر مفتاحين وموافقة.', 'The ordinary alarm may come first — an honest trade-off: MANARA waits for two keys and approval.') },
    { k: 'firstPersonal', ar: 'أول رسالة شخصية بلغة الشخص', en: 'First personal message in the person’s language', o: function (m) { return m.timeToFirstPersonalAlertSec; }, unit: 's' },
    { k: 'headline', ar: '', en: '', o: function (m) { return m.headline ? m.headline.value : null; }, unit: 'h' },
    { k: 'stillNotSafe120', ar: 'ما زالوا غير آمنين بعد دقيقتين', en: 'Still not safe after 2 minutes', o: function (m) { return m.stillNotSafe ? m.stillNotSafe.t120 : null; }, unit: 'n' },
    { k: 'stillNotSafe300', ar: 'ما زالوا غير آمنين بعد 5 دقائق', en: 'Still not safe after 5 minutes', o: function (m) { return m.stillNotSafe ? m.stillNotSafe.t300 : null; }, unit: 'n' },
    { k: 'injured', ar: 'مصابون في النموذج', en: 'Injured in the model', o: function (m) { return m.injuredInModel; }, unit: 'n' },
    { k: 'exposure', ar: 'ثوانٍ-شخص في الخطر', en: 'Person-seconds in danger', o: function (m) { return m.exposurePersonSec; }, unit: 'ps' }
  ];
  function fmtMetric(v, unit) {
    if (v == null) return B('غير متاح لهذا المثير', 'N/A for this stimulus');
    if (unit === 's') return mmss(v) + ' (' + N(Math.round(v)) + (lang() === 'ar' ? ' ث' : ' s') + ')';
    return N(Math.round(v));
  }
  function buildABPanel() {
    var p = panel('ab', 'المقارنة: إنذار عادي مقابل منارة', 'A/B: ordinary alarm vs MANARA', { extra: simTag() });
    var Q = UI.ab = {};
    Q.banner = h('div', { class: 'note warn ab-banner' }, h('b', null, bi('محاكاة — فحص لآلية العمل وليس دليلاً على الأثر', 'SIMULATION — a mechanism check, not proof of impact')), ' ', h('span', null, bi('البذرة نفسها والفيزياء نفسها في العالمين؛ يتغيّر الإنذار فقط. النتائج تعتمد على الافتراضات في تبويب «الافتراضات».', 'Same seed and same physics in both worlds; only the alarm changes. Results depend on the assumptions in the “Assumptions” tab.')));
    Q.run = btn('btn btn-primary btn-sm', 'play', 'شغّل المقارنة لهذه البذرة', 'Run A/B for this seed', function () { startAB(); });
    Q.runN = btn('btn btn-ghost btn-sm', 'chart', 'شغّل 20 بذرة', 'Run 20 seeds', function () { startSeeds(20); });
    Q.cancel = btn('btn btn-ghost btn-sm', 'x', 'إلغاء', 'Cancel', function () { if (BATCH) BATCH.cancel = true; BATCH = null; if (SWEEP) SWEEP.cancel = true; SWEEP = null; setABBusy(false); setText(Q.status, B('أُلغي.', 'Cancelled.')); });
    Q.cancel.hidden = true;
    Q.prog = h('progress', { max: '1', value: '0', class: 'ab-prog' }); lab(Q.prog, 'aria-label', 'تقدّم المحاكاة', 'Simulation progress'); Q.prog.hidden = true;
    Q.status = h('p', { class: 'muted small', role: 'status' });
    Q.bars = h('div', { class: 'ab-bars' });
    Q.seeds = h('div', { class: 'ab-seeds' });
    Q.cvs = h('canvas', { class: 'ab-canvas', width: '760', height: '300', role: 'img' }); lab(Q.cvs, 'aria-label', 'توزيع النتائج على عدة بذور: إنذار عادي مقابل منارة', 'Distribution of results over several seeds: ordinary alarm vs MANARA');
    Q.sum = h('p', { class: 'ab-sum' });
    // sensitivity sweep: the same A/B at 5 values of ONE assumption (2 seeds each)
    Q.swSel = h('select', { class: 'input sw-sel' }); lab(Q.swSel, 'aria-label', 'الافتراض المراد تغييره عبر مداه', 'Assumption to sweep across its range');
    Q.swRun = btn('btn btn-ghost btn-sm', 'chart', 'قارن عبر مدى الافتراض', 'Sweep this assumption', function () { startSweep(); });
    Q.swCvs = h('canvas', { class: 'ab-canvas sw-canvas', width: '760', height: '280', role: 'img' }); lab(Q.swCvs, 'aria-label', 'كيف يتغيّر المقياس الرئيسي مع قيمة افتراض واحد: إنذار عادي مقابل منارة', 'How the headline measure changes with one assumption: ordinary alarm vs MANARA');
    Q.swSum = h('p', { class: 'ab-sum sw-sum' });
    Q.sens = h('div', { class: 'note ab-sens' }, h('b', null, bi('ملاحظة الحساسية:', 'Sensitivity note:')), ' ', bi('غيّر أي افتراض (نسبة من لديهم التطبيق، احتمال الإيقاظ، زمن اعتماد المشغّل…) فيتغيّر الفارق. لذلك نعرض الفارق مع افتراضاته، ولا نقول «ينقذ أرواحًا». الأثر الحقيقي يُقاس بتجارب ميدانية بموافقة أخلاقية.', 'Change any assumption (share with the app, wake chance, operator approval time…) and the gap changes. That is why the gap is shown with its assumptions and we never say “saves lives”. Real impact needs field trials with ethics approval.'));
    p.body.appendChild(Q.banner); p.body.appendChild(h('div', { class: 'btns' }, Q.run, Q.runN, Q.cancel)); p.body.appendChild(Q.prog); p.body.appendChild(Q.status); p.body.appendChild(Q.bars);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('توزيع النتائج على عدة بذور', 'Distribution over several seeds'))); p.body.appendChild(Q.cvs); p.body.appendChild(Q.sum);
    p.body.appendChild(h('h3', { class: 'pn-sub' }, bi('الحساسية: كم يعتمد الفارق على افتراض واحد؟', 'Sensitivity: how much does the gap depend on one assumption?')));
    p.body.appendChild(h('div', { class: 'row sw-row' }, Q.swSel, Q.swRun)); p.body.appendChild(Q.swCvs); p.body.appendChild(Q.swSum); p.body.appendChild(Q.sens);
    PANEL_UPDATERS.push(updateAB);
    return p;
  }
  function abKey() { return [MC.preset, MC.seed, MC.origin ? MC.origin.room : '', JSON.stringify(MC.params)].join('|'); }
  function setABBusy(on) { var Q = UI.ab; MC.abBusy = on; Q.run.disabled = on; Q.runN.disabled = on; Q.swRun.disabled = on; Q.cancel.hidden = !on; Q.prog.hidden = !on; }
  function startAB(cb) {
    var Q = UI.ab, key = abKey(); setABBusy(true); setText(Q.status, B('تُشغَّل المقارنة في الخلفية…', 'Running the A/B in the background…')); Q.prog.value = 0;
    runBatch({ seeds: [MC.seed], onProgress: function (f) { Q.prog.value = f; }, onDone: function (res) { setABBusy(false); MC.ab = { key: key, res: res[0] }; setText(Q.status, B('اكتملت المقارنة (محاكاة).', 'A/B finished (simulation).')); MC.panelsDirty = true; updateAB(); if (cb) cb(res[0]); }, onCancel: function () { setABBusy(false); } });
  }
  function startSeeds(n, seconds, cb) {
    var Q = UI.ab, base = (MC.seed * 7) % 900 + 1, seeds = []; for (var i = 0; i < n; i++) seeds.push(base + i);
    setABBusy(true); Q.prog.value = 0; setText(Q.status, B('تُشغَّل ' + n + ' بذرة في الخلفية — قد يستغرق دقائق؛ يمكنك الإلغاء.', 'Running ' + n + ' seeds in the background — it can take minutes; you can cancel.'));
    MC.runs = { key: abKey(), n: n, results: [], seconds: seconds || null };
    runBatch({ seeds: seeds, seconds: seconds, onProgress: function (f) { Q.prog.value = f; },
      onSeed: function (res, all) { MC.runs.results = all.slice(); setText(Q.status, B('اكتملت ', 'Finished ') + N(all.length) + ' / ' + N(n) + B(' بذرة…', ' seeds…')); drawSeeds(); },
      onDone: function (all) { MC.runs.results = all.slice(); setABBusy(false); setText(Q.status, B('اكتملت ', 'Finished ') + N(all.length) + B(' بذرة (محاكاة).', ' seeds (simulation).')); drawSeeds(); if (cb) cb(all); },
      onCancel: function () { setABBusy(false); } });
  }
  function updateAB() {
    var Q = UI.ab, ab = MC.ab && MC.ab.key === abKey() ? MC.ab.res : null, hz = MC.snap.hazard;
    var sig = ab ? 'r' + ab.seed + ab.ordinary.tEnd + lang() : 'none' + lang();
    if (Q.sig !== sig) {
      Q.sig = sig; Q.bars.replaceChildren();
      if (!ab) Q.bars.appendChild(h('div', { class: 'dp-empty' }, icon('chart'), h('p', null, bi('اضغط «شغّل المقارنة» لتُحسب النتيجة لهذه البذرة (نحو ثلاث ثوانٍ في الخلفية).', 'Press “Run A/B” to compute this seed (about three seconds in the background).'))));
      else {
        var head = h('div', { class: 'ab-row ab-head' }, h('span'), h('span', { class: 'ab-k o' }, bi('إنذار عادي', 'Ordinary alarm')), h('span', { class: 'ab-k m' }, bi('منارة', 'MANARA')), h('span', { class: 'ab-k d' }, bi('الفارق', 'Gap')));
        Q.bars.appendChild(head);
        AB_ROWS.forEach(function (r) {
          var vo = r.o(ab.ordinary), vm = r.o(ab.manara), label = r.k === 'headline' ? (ab.manara.headline ? ab.manara.headline.label : null) : T(r.ar, r.en);
          if (r.k === 'headline' && !label) return;
          var mx = Math.max(vo || 0, vm || 0, 1), dl = vo != null && vm != null ? vo - vm : null;
          var row = h('div', { class: 'ab-row' }, h('span', { class: 'ab-l' }, h('b', null, LL(label)), r.note ? h('small', { class: 'muted' }, LL(r.note)) : null),
            h('span', { class: 'ab-c o' }, h('span', { class: 'ab-bar' }, h('i', { style: 'width:' + ((vo || 0) / mx * 100) + '%' })), h('span', { class: 'mono ab-v', text: fmtMetric(vo, r.unit === 'h' ? (ab.manara.headline && ab.manara.headline.unit === 's' ? 's' : 'n') : r.unit) })),
            h('span', { class: 'ab-c m' }, h('span', { class: 'ab-bar' }, h('i', { style: 'width:' + ((vm || 0) / mx * 100) + '%' })), h('span', { class: 'mono ab-v', text: fmtMetric(vm, r.unit === 'h' ? (ab.manara.headline && ab.manara.headline.unit === 's' ? 's' : 'n') : r.unit) })),
            h('span', { class: 'ab-c d mono ' + (dl == null ? 'na' : (r.k === 'firstAlert' ? (dl < 0 ? 'bad' : 'ok') : (dl > 0 ? 'ok' : dl < 0 ? 'bad' : ''))), text: dl == null ? 'N/A' : (dl > 0 ? '−' : dl < 0 ? '+' : '') + (r.unit === 's' ? mmss(Math.abs(dl)) : N(Math.round(Math.abs(dl)))) }));
          Q.bars.appendChild(row);
        });
        Q.bars.appendChild(h('p', { class: 'muted small' }, bi('الفارق: «−» تعني أن منارة أقل (أفضل) في المقاييس التي يُراد خفضها. «غير متاح لهذا المثير» بدل اختراع رقم.', 'Gap: “−” means MANARA is lower (better) on the measures where lower is better. “N/A for this stimulus” instead of an invented number.')));
        Q.bars.appendChild(h('p', { class: 'muted small mono' }, 'seed ' + ab.seed + ' · ' + MC.preset + ' · hash ' + (ab.ordinary.tEnd ? '' : '') + 't=' + ab.ordinary.tEnd + ' s'));
      }
    }
    if (!MC.runs || MC.runs.key !== abKey()) { /* keep the old canvas but mark it stale */ }
    fillSweepSel(); drawSeeds(); drawSweep();
  }
  /* ---- sensitivity sweep ---- */
  var SWEEP = null;
  function sweepDef(key) { for (var i = 0; i < Sim.PARAMS.length; i++) if (Sim.PARAMS[i].key === key) return Sim.PARAMS[i]; return null; }
  function sweepValues(d) {
    var raw = [d.min, (d.min + d.default) / 2, d.default, (d.default + d.max) / 2, d.max], out = [];
    raw.forEach(function (v) { v = clamp(Math.round(v / d.step) * d.step, d.min, d.max); v = +v.toFixed(6); if (out.indexOf(v) < 0) out.push(v); });
    return out.sort(function (a, b) { return a - b; });
  }
  function fillSweepSel() {
    var Q = UI.ab, sig = lang(); if (Q.swLang === sig) return; Q.swLang = sig;
    var keep = Q.swSel.value || 'approveSec'; Q.swSel.replaceChildren();
    Sim.PARAM_GROUPS.forEach(function (g) {
      var defs = Sim.PARAMS.filter(function (d) { return d.group === g.id && d.unit !== '0/1' && d.max > d.min; }); if (!defs.length) return;
      var og = h('optgroup'); og.label = LL(g.label);
      defs.forEach(function (d) { var o = h('option', { value: d.key }); o.textContent = LL(d.label) + (d.unit ? ' (' + d.unit + ')' : ''); og.appendChild(o); });
      Q.swSel.appendChild(og);
    });
    Q.swSel.value = keep;
  }
  function runSweep(opts) {
    if (SWEEP) SWEEP.cancel = true;
    var s = SWEEP = { cancel: false, vi: 0, si: 0, job: 0, sim: null, done: 0, total: opts.values.length * opts.seeds.length * 2, acc: opts.values.map(function () { return { ho: 0, no: 0, hm: 0, nm: 0 }; }), label: null, unit: null };
    var dur = Sim.PRESETS[MC.preset].durationSec, preset = originPresetId(MC.preset, MC.origin);
    function pump() {
      if (s.cancel) { if (opts.onCancel) opts.onCancel(); return; }
      var t0 = now();
      while (now() - t0 < 12) {
        if (!s.sim) { var pr = Object.assign({}, MC.params); pr[opts.key] = opts.values[s.vi]; s.sim = Sim.create({ preset: preset, params: pr, seed: opts.seeds[s.si], mode: s.job === 0 ? 'ordinary' : 'manara', autoApprove: true }); }
        Sim.step(s.sim, 1); s.done++;
        if (s.sim.t >= dur || s.sim.done) {
          var m = Sim.metrics(s.sim), hv = m.headline && isNum(m.headline.value) ? m.headline.value : null, a = s.acc[s.vi];
          if (m.headline) { s.label = m.headline.label; s.unit = m.headline.unit; }
          if (s.job === 0) { if (hv != null) { a.ho += hv; a.no++; } s.job = 1; }
          else { if (hv != null) { a.hm += hv; a.nm++; } s.job = 0; s.si++; if (s.si >= opts.seeds.length) { s.si = 0; s.vi++; } }
          s.sim = null;
          if (s.vi >= opts.values.length) { SWEEP = null; opts.onDone(s.acc.map(function (a2, i) { return { value: opts.values[i], ordinary: a2.no ? a2.ho / a2.no : null, manara: a2.nm ? a2.hm / a2.nm : null }; }), s.label, s.unit); return; }
        }
      }
      if (opts.onProgress) opts.onProgress(s.done / s.total);
      setTimeout(pump, 0);
    }
    setTimeout(pump, 0); return s;
  }
  function startSweep() {
    var Q = UI.ab, key = Q.swSel.value, d = sweepDef(key); if (!d) return;
    var vals = sweepValues(d), seeds = [MC.seed, MC.seed + 1], ak = abKey();
    setABBusy(true); Q.prog.value = 0; setText(Q.status, B('تُشغَّل ' + N(vals.length * seeds.length * 2) + ' محاكاة في الخلفية (نحو عشر ثوانٍ).', 'Running ' + N(vals.length * seeds.length * 2) + ' simulations in the background (about ten seconds).'));
    runSweep({ key: key, values: vals, seeds: seeds, onProgress: function (f) { Q.prog.value = f; },
      onDone: function (rows, label, unit) { MC.sweep = { key: ak, param: key, rows: rows, label: label, unit: unit, seeds: seeds }; setABBusy(false); setText(Q.status, B('اكتمل مسح الحساسية (محاكاة).', 'Sensitivity sweep finished (simulation).')); drawSweep(); },
      onCancel: function () { setABBusy(false); } });
  }
  function drawSweep() {
    var Q = UI.ab, cv = Q.swCvs, c = cv.getContext('2d'), w = cv.width, hh = cv.height, sw = MC.sweep && MC.sweep.key === abKey() ? MC.sweep : null;
    c.clearRect(0, 0, w, hh); c.textBaseline = 'middle'; c.direction = 'ltr';
    if (!sw) { c.font = '600 17px ' + R.font; c.textAlign = 'center'; c.fillStyle = rgba(C('muted')); c.fillText(B('اختر افتراضًا واضغط «قارن عبر مدى الافتراض»', 'Pick an assumption and press “Sweep this assumption”'), w / 2, hh / 2); setText(Q.swSum, ''); return; }
    var d = sweepDef(sw.param), rows = sw.rows, padL = 66, padR = 28, padT = 58, padB = 46, vmin = rows[0].value, vmax = rows[rows.length - 1].value, X = function (i) { return vmax > vmin ? padL + (rows[i].value - vmin) / (vmax - vmin) * (w - padL - padR) : w / 2; };
    var all = []; rows.forEach(function (r) { if (r.ordinary != null) all.push(r.ordinary); if (r.manara != null) all.push(r.manara); });
    c.textAlign = lang() === 'ar' ? 'right' : 'left'; c.fillStyle = rgba(C('head')); c.font = '700 16px ' + R.font; c.direction = lang() === 'ar' ? 'rtl' : 'ltr';
    c.fillText(LL(sw.label || T('المقياس الرئيسي', 'Headline measure')) + ' · ' + LL(d.label), lang() === 'ar' ? w - 12 : 12, 16);
    c.direction = 'ltr';
    if (!all.length) { c.textAlign = 'center'; c.fillStyle = rgba(C('muted')); c.font = '500 15px ' + R.font; c.fillText(B('غير متاح لهذا المثير', 'N/A for this stimulus'), w / 2, hh / 2); setText(Q.swSum, ''); return; }
    var hi = Math.max.apply(null, all), lo = Math.min(0, Math.min.apply(null, all)); if (hi - lo < 1) hi = lo + 1;
    var Y = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * (hh - padT - padB); };
    c.strokeStyle = rgba(C('line-2')); c.lineWidth = 1; c.beginPath(); c.moveTo(padL, hh - padB); c.lineTo(w - padR, hh - padB); c.moveTo(padL, padT); c.lineTo(padL, hh - padB); c.stroke();
    c.font = '500 13px ' + R.mono; c.fillStyle = rgba(C('muted')); c.textAlign = 'right'; c.fillText(N(Math.round(hi)), padL - 8, padT); c.fillText(N(Math.round(lo)), padL - 8, hh - padB);
    // the area between the lines: green where MANARA is lower (better), red where it is higher
    for (var i = 0; i + 1 < rows.length; i++) {
      var a = rows[i], b = rows[i + 1]; if (a.ordinary == null || a.manara == null || b.ordinary == null || b.manara == null) continue;
      c.beginPath(); c.moveTo(X(i), Y(a.ordinary)); c.lineTo(X(i + 1), Y(b.ordinary)); c.lineTo(X(i + 1), Y(b.manara)); c.lineTo(X(i), Y(a.manara)); c.closePath();
      c.fillStyle = rgba((a.ordinary - a.manara + b.ordinary - b.manara) >= 0 ? C('safe') : C('danger'), 0.16); c.fill();
    }
    [['ordinary', C('warn'), T('عادي', 'Ordinary')], ['manara', C('safe'), T('منارة', 'MANARA')]].forEach(function (ln, li) {
      c.strokeStyle = rgba(ln[1]); c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); var pen = false;
      rows.forEach(function (r, i2) { var v = r[ln[0]]; if (v == null) { pen = false; return; } if (pen) c.lineTo(X(i2), Y(v)); else { c.moveTo(X(i2), Y(v)); pen = true; } }); c.stroke();
      rows.forEach(function (r, i2) { var v = r[ln[0]]; if (v == null) return; c.beginPath(); c.arc(X(i2), Y(v), 5, 0, 6.2832); c.fillStyle = rgba(ln[1]); c.fill(); c.lineWidth = 1.5; c.strokeStyle = rgba(C('surface')); c.stroke(); });
      c.font = '700 13px ' + R.font; c.fillStyle = rgba(ln[1]); c.textAlign = 'left'; c.fillText(LL(ln[2]), padL + 8 + li * 90, 38);
    });
    rows.forEach(function (r, i3) { var isDef = Math.abs(r.value - d.default) < 1e-9; c.font = (isDef ? '700 ' : '500 ') + '13px ' + R.mono; c.fillStyle = rgba(isDef ? C('head') : C('muted')); c.textAlign = 'center'; c.fillText(N(r.value, d.step < 1 ? (String(d.step).split('.')[1] || '').length : 0), X(i3), hh - padB + 16); if (isDef) { c.strokeStyle = rgba(C('head'), 0.5); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(i3), padT); c.lineTo(X(i3), hh - padB); c.stroke(); c.setLineDash([]); c.font = '600 12px ' + R.font; c.fillText(B('الافتراضي', 'default'), X(i3), hh - padB + 32); } });
    // the plain-language reading: stated honestly, including where the advantage shrinks or reverses
    var dec = d.step < 1 ? (String(d.step).split('.')[1] || '').length : 0, fv = function (q) { return N(q.v, dec); }, lst = function (a) { return a.map(fv).join(lang() === 'ar' ? '، ' : ', '); };
    var gaps = rows.filter(function (r) { return r.ordinary != null && r.manara != null; }).map(function (r) { return { v: r.value, g: r.ordinary - r.manara }; }), tol = 0.05 * Math.max(1, hi);
    var worse = gaps.filter(function (q) { return q.g < -tol; }), tiny = gaps.filter(function (q) { return q.g >= -tol && q.g < tol; }), better = gaps.filter(function (q) { return q.g >= tol; }), unit = sw.unit === 's' ? B(' ث', ' s') : '';
    var parts = [];
    if (!gaps.length) parts.push(B('غير متاح لهذا المثير.', 'N/A for this stimulus.'));
    else {
      if (better.length === gaps.length) { var mn = Math.min.apply(null, better.map(function (q) { return q.g; })), mx = Math.max.apply(null, better.map(function (q) { return q.g; })); parts.push(B('في كل القيم المختبرة تبقى منارة أفضل، بفارق بين ' + N(Math.round(mn)) + ' و' + N(Math.round(mx)) + unit + '.', 'At every tested value MANARA stays better, by between ' + N(Math.round(mn)) + ' and ' + N(Math.round(mx)) + unit + '.')); }
      else {
        if (better.length) parts.push(B('منارة أفضل عند ' + lst(better) + '.', 'MANARA is better at ' + lst(better) + '.'));
        if (tiny.length) parts.push(B('لا فارق يُذكر عند ' + lst(tiny) + '.', 'There is no meaningful difference at ' + lst(tiny) + '.'));
        if (worse.length) parts.push(B('عند ' + lst(worse) + ' ينعكس الفارق: منارة ليست أفضل هناك — وهذه حدود النتيجة.', 'At ' + lst(worse) + ' the gap reverses: MANARA is not better there — that is the limit of this result.'));
      }
    }
    var msg = parts.join(' ');
    setText(Q.swSum, msg + ' ' + B('(بذرتان لكل نقطة — محاكاة، فحص للآلية.)', '(2 seeds per point — simulation, a mechanism check.)'));
  }
  function drawSeeds() {
    var Q = UI.ab, cv = Q.cvs, c = cv.getContext('2d'), w = cv.width, hh = cv.height, res = MC.runs && MC.runs.key === abKey() ? MC.runs.results : [];
    c.clearRect(0, 0, w, hh); c.textBaseline = 'middle';
    c.font = '600 17px ' + R.font; c.textAlign = 'center'; c.fillStyle = rgba(C('muted'));
    if (!res.length) { c.fillText(B('اضغط «شغّل 20 بذرة» لرسم التوزيع هنا', 'Press “Run 20 seeds” to draw the distribution here'), w / 2, hh / 2); setText(Q.sum, ''); return; }
    var panels = [
      { t: T('زمن الوصول إلى الموقع (ث)', 'Time to on scene (s)'), o: function (r) { return r.ordinary.dispatch && r.ordinary.dispatch.planned ? r.ordinary.dispatch.timeToOnSceneSec : null; }, m: function (r) { return r.manara.dispatch && r.manara.dispatch.planned ? r.manara.dispatch.timeToOnSceneSec : null; } },
      { t: res[0].manara.headline ? res[0].manara.headline.label : T('المقياس الرئيسي', 'Headline measure'), o: function (r) { return r.ordinary.headline ? r.ordinary.headline.value : null; }, m: function (r) { return r.manara.headline ? r.manara.headline.value : null; } }];
    var ph = (hh - 20) / panels.length;
    panels.forEach(function (pn, pi) {
      var y0 = 10 + pi * ph, vo = res.map(pn.o).filter(function (v) { return v != null; }), vm = res.map(pn.m).filter(function (v) { return v != null; }), all = vo.concat(vm);
      c.textAlign = 'left'; c.fillStyle = rgba(C('head')); c.font = '700 16px ' + R.font; c.direction = lang() === 'ar' ? 'rtl' : 'ltr'; if (lang() === 'ar') { c.textAlign = 'right'; }
      c.fillText(LL(pn.t), lang() === 'ar' ? w - 12 : 12, y0 + 10);
      if (!all.length) { c.textAlign = 'center'; c.fillStyle = rgba(C('muted')); c.font = '500 15px ' + R.font; c.fillText(B('غير متاح لهذا المثير', 'N/A for this stimulus'), w / 2, y0 + ph / 2 + 6); return; }
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (hi - lo < 1) { hi = lo + 1; }
      var padL = 110, padR = 20, X = function (v) { return padL + (v - lo) / (hi - lo) * (w - padL - padR); };
      [['o', vo, T('عادي', 'Ordinary'), C('warn'), y0 + ph * 0.38], ['m', vm, T('منارة', 'MANARA'), C('safe'), y0 + ph * 0.66]].forEach(function (row) {
        var vals = row[1].slice().sort(function (a, b2) { return a - b2; }), y = row[4];
        c.textAlign = 'left'; c.direction = 'ltr'; c.fillStyle = rgba(row[3]); c.font = '700 14px ' + R.font; c.fillText(LL(row[2]), 12, y);
        c.strokeStyle = rgba(C('line-2')); c.lineWidth = 1; c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
        if (vals.length) {
          var q = function (p) { var i = (vals.length - 1) * p, a = Math.floor(i), b3 = Math.ceil(i); return vals[a] + (vals[b3] - vals[a]) * (i - a); };
          c.fillStyle = rgba(row[3], 0.2); c.fillRect(X(q(0.25)), y - 13, Math.max(2, X(q(0.75)) - X(q(0.25))), 26);
          vals.forEach(function (v, i) { c.beginPath(); c.arc(X(v), y + ((i % 3) - 1) * 6, 4.2, 0, 6.2832); c.fillStyle = rgba(row[3], 0.95); c.fill(); c.lineWidth = 1; c.strokeStyle = rgba(C('surface')); c.stroke(); });
          c.strokeStyle = rgba(C('head')); c.lineWidth = 2.5; c.beginPath(); c.moveTo(X(q(0.5)), y - 15); c.lineTo(X(q(0.5)), y + 15); c.stroke();
        }
      });
      c.fillStyle = rgba(C('muted')); c.font = '500 13px ' + R.mono; c.textAlign = 'center'; c.direction = 'ltr'; c.fillText(N(Math.round(lo)), X(lo), y0 + ph * 0.88); c.fillText(N(Math.round(hi)), X(hi), y0 + ph * 0.88);
    });
    var better = 0, n = 0, hd = [];
    res.forEach(function (r) { var d = r.delta.headline; if (d != null) { n++; if (d > 0) better++; hd.push(d); } });
    hd.sort(function (a, b2) { return a - b2; });
    var med = hd.length ? hd[Math.floor((hd.length - 1) / 2)] : null;
    setText(Q.sum, B('منارة أفضل في ', 'MANARA better in ') + N(better) + ' / ' + N(n) + B(' بذرة على المقياس الرئيسي', ' seeds on the headline measure') + (med != null ? ' · ' + B('الوسيط ', 'median gap ') + N(Math.round(med)) : '') + ' · ' + B('محاكاة — فحص للآلية، لا دليل على الأثر.', 'simulation — a mechanism check, not proof of impact.'));
  }

  /* ---- adjustable assumptions (every tunable number of the sim, with its plain description) ---- */
  function paramValue(d) { return MC.params[d.key] != null ? MC.params[d.key] : d.default; }
  function fmtParam(d, v) { return N(v, d.step < 1 ? (String(d.step).split('.')[1] || '').length : 0) + (d.unit && d.unit !== '0/1' ? ' ' + d.unit : ''); }
  function setParamValue(d, v) {
    if (v === d.default) delete MC.params[d.key]; else MC.params[d.key] = v;
    var live = d.live !== false;
    if (live) act('param', { key: d.key, value: v }); else { UI.assume.needRestart[d.key] = true; }
    UI.assume.apply.hidden = !Object.keys(UI.assume.needRestart).length;
    MC.panelsDirty = true;
  }
  function paramRow(d) {
    var id = 'as-' + d.key, inp = h('input', { type: 'range', id: id, min: String(d.min), max: String(d.max), step: String(d.step), value: String(paramValue(d)) }), out = h('output', { class: 'mono', for: id });
    var rs = iconBtn('reset', 'القيمة الافتراضية', 'Default value', function () { inp.value = String(d.default); out.textContent = fmtParam(d, d.default); setParamValue(d, d.default); }, 'sm');
    out.textContent = fmtParam(d, paramValue(d));
    inp.addEventListener('input', function () { out.textContent = fmtParam(d, +inp.value); });
    inp.addEventListener('change', function () { setParamValue(d, +inp.value); });
    var row = h('div', { class: 'as-row', 'data-k': d.key, 'data-q': (d.label.ar + ' ' + d.label.en + ' ' + d.desc.en + ' ' + d.key).toLowerCase() },
      h('label', { class: 'as-l', for: id }, h('b', null, bi(d.label.ar, d.label.en)), out), inp, h('small', { class: 'as-d' }, bi(d.desc.ar, d.desc.en)),
      h('div', { class: 'as-m' }, h('span', { class: 'tag ' + (d.src === 'assumption' ? 'warn' : 'cool') }, d.src === 'assumption' ? bi('افتراض', 'assumption') : d.src), d.live === false ? h('span', { class: 'tag' }, bi('يُطبَّق عند إعادة التشغيل', 'applies on restart')) : null, h('span', { class: 'muted small mono' }, B('الافتراضي ', 'default ') + fmtParam(d, d.default)), rs));
    row._inp = inp; row._out = out; row._d = d;
    return row;
  }
  function buildAssumePanel() {
    var p = panel('assume', 'الافتراضات القابلة للتعديل', 'Adjustable assumptions', { extra: simTag() });
    var A = UI.assume = { groups: {}, needRestart: {} };
    A.search = h('input', { type: 'search', class: 'input', placeholder: '' }); lab(A.search, 'placeholder', 'ابحث في الافتراضات…', 'Search the assumptions…'); lab(A.search, 'aria-label', 'ابحث في الافتراضات', 'Search the assumptions');
    A.apply = btn('btn btn-primary btn-sm', 'reset', 'طبّق وأعد التشغيل', 'Apply and restart', function () { A.needRestart = {}; A.apply.hidden = true; startRun({ params: MC.params, keepCamera: true }); }); A.apply.hidden = true;
    A.reset = btn('btn btn-ghost btn-sm', 'reset', 'كل الافتراضات إلى القيم الأصلية', 'Reset all to defaults', function () { MC.params = {}; A.needRestart = {}; A.apply.hidden = true; startRun({ params: {}, keepCamera: true }); $$('.as-row', A.wrap).forEach(function (r) { r._inp.value = String(r._d.default); r._out.textContent = fmtParam(r._d, r._d.default); }); });
    A.wrap = h('div', { class: 'as-groups' });
    Sim.PARAM_GROUPS.forEach(function (g) {
      var rows = Sim.PARAMS.filter(function (d) { return d.group === g.id && d.key !== 'autoApprove'; }).map(paramRow);
      if (!rows.length) return;
      var det = h('details', { class: 'jg as-g', 'data-g': g.id }, h('summary', null, bi(g.label.ar, g.label.en), h('span', { class: 'muted small mono', text: ' ' + rows.length })), h('div', { class: 'jg-b' }, rows));
      A.groups[g.id] = det; A.wrap.appendChild(det);
    });
    A.search.addEventListener('input', function () {
      var q = A.search.value.trim().toLowerCase();
      $$('.as-row', A.wrap).forEach(function (r) { r.hidden = !!q && r.getAttribute('data-q').indexOf(q) < 0; });
      Object.keys(A.groups).forEach(function (g) { var any = $$('.as-row', A.groups[g]).some(function (r) { return !r.hidden; }); A.groups[g].hidden = !any; if (q && any) A.groups[g].open = true; });
    });
    p.body.appendChild(h('p', { class: 'muted' }, bi('كل رقم تستعمله المحاكاة افتراض مُسمّى بوصف بسيط. غيّر ما تشاء وراقب التغيّر؛ المقارنة (A/B) تستعمل هذه القيم. لا شيء هنا قياس حقيقي إلا حيث يُذكر مصدر.', 'Every number the simulation uses is a named assumption with a plain description. Change what you like and watch what moves; the A/B uses these values. Nothing here is a measurement unless a source is named.')));
    p.body.appendChild(h('div', { class: 'row' }, A.search, A.apply, A.reset)); p.body.appendChild(A.wrap);
    PANEL_UPDATERS.push(updateAssume);
    return p;
  }
  function updateAssume() {
    var A = UI.assume, hz = MC.snap.hazard, want = { people: 1, alert: 1, traffic: 1, dispatch: 1 }; want[hz] = 1;
    if (A.hz !== hz) { A.hz = hz; Object.keys(A.groups).forEach(function (g) { A.groups[g].open = (g === hz || g === 'alert'); }); }
    $$('.as-row', A.wrap).forEach(function (r) { var d = r._d; if (doc.activeElement !== r._inp && A.sync !== MC.preset + lang()) { r._inp.value = String(paramValue(d)); r._out.textContent = fmtParam(d, paramValue(d)); } });
    A.sync = MC.preset + lang();
  }

  /* ---- legend + what is real vs simulated ---- */
  function lgCanvas(fn, w, hgt) {
    var cv = h('canvas', { class: 'lg-cv', 'aria-hidden': 'true' }), d = Math.min(window.devicePixelRatio || 1, 2); w = w || 34; hgt = hgt || 26;
    cv.width = w * d; cv.height = hgt * d; cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    var c = cv.getContext('2d'); c.scale(d, d); fn(c, w, hgt); return cv;
  }
  function buildLegendPanel() {
    var p = panel('legend', 'ما الحقيقي وما المحاكى؟ ومفتاح الرموز', 'Real vs simulated, and the key');
    UI.legendPanel = p;
    renderLegendPanel();
    return p;
  }
  function renderLegendPanel() {
    var p = UI.legendPanel, b = p.body; b.replaceChildren();
    function li(ar, en) { return h('li', null, bi(ar, en)); }
    var real = h('section', { class: 'rs rs-real' }, h('h3', null, bi('حقيقي (مصدره موثّق أو معيار منشور)', 'Real (sourced or a published standard)')), h('ul', null,
      li('عتبات الحسّاسات: حرارة 57°م (S58)، غاز البترول 1000/2100 ppm (S48)، WBGT 32.1°م (S19)، PM10 150 µg/m³ (S31).', 'Sensor thresholds: heat 57 °C (S58), LPG 1000/2100 ppm (S48), WBGT 32.1 °C (S19), PM10 150 µg/m³ (S31).'),
      li('نموذج انتشار الحريق: خلية آلية منشورة (Alexandridis وآخرون 2008).', 'The fire-spread model is a published cellular automaton (Alexandridis et al. 2008).'),
      li('صيغة CAP 1.2 معيار OASIS؛ ملفاتنا بحالة «تمرين».', 'CAP 1.2 is an OASIS standard; our files have status “Exercise”.'),
      li('قاعدة الوميض ≤ 3 في الثانية (S57)، ونبرة 520 هرتز للإيقاظ (S56).', 'The ≤ 3 flashes per second rule (S57) and the 520 Hz wake-up tone (S56).'),
      li('معيار زمن وصول الإسعاف في قطر (S24) مرجع للمقارنة فقط.', 'The Qatar ambulance response benchmark (S24) is a reference only.')));
    var simu = h('section', { class: 'rs rs-sim' }, h('h3', null, bi('محاكى (SIM)', 'Simulated (SIM)')), h('ul', null,
      li('الحيّ والسكان واللغات (مزيج توضيحي) والمدرسة والمبنى.', 'The district, residents, language mix (illustrative), school and building.'),
      li('المرور وأزمنة الوصول: ملف يومي افتراضي وطوابير ومحطات ومستشفيات وهمية.', 'Traffic and ETAs: an assumed daily profile, queues, and fictional stations and hospitals.'),
      li('قراءات الحسّاسات وضجيجها، والطقس (مطر، غبار، حرارة).', 'Sensor readings and their noise, and the weather inputs (rain, dust, heat).'),
      li('احتمالات الاستيقاظ وأزمنة التفاعل وزمن اعتماد المشغّل وتوفّر الوحدات وسعة المستشفيات.', 'Wake-up chances, reaction times, operator approval time, unit availability and hospital capacity.'),
      li('كل أرقام المقارنة A/B: فحص لآلية العمل وليست دليلاً على الأثر.', 'Every A/B number: a mechanism check, not proof of impact.')));
    var limits = h('section', { class: 'rs rs-lim' }, h('h3', null, bi('حدود صريحة', 'Stated limits')), h('ul', null,
      li('الرؤية الحاسوبية بقواعد لا ذكاء اصطناعي: 12 من 18 صورة ثابتة محجوزة (مختبر الأدلة، عيّنة صغيرة)؛ لا تنذر وحدها أبدًا.', 'The vision is rule-based, not AI: 12 of 18 held-out still images (Evidence Lab, small sample); it never alerts alone.'),
      li('حسّاسات MQ حساسة لغازات أخرى وتحتاج معايرة وتسخينًا.', 'MQ sensors are cross-sensitive and need calibration and warm-up.'),
      li('الطائرة مفهوم تشغّله جهة مخوّلة وفق قواعد الطيران (القانون 10 لسنة 2026 — S34).', 'The drone is a concept operated by an authorised agency under aviation rules (Law No. 10 of 2026 — S34).'),
      li('اللغات غير العربية والإنجليزية مسوّدات تنتظر مراجعة متحدث أصلي.', 'Languages other than Arabic and English are drafts awaiting native-speaker review.'),
      li('منارة تكمل الأنظمة الوطنية ولا تستبدلها؛ 999 يبقى هو المُرسِل.', 'MANARA complements national systems and does not replace them; 999 stays the dispatcher.')));
    var key = h('section', { class: 'rs rs-key' }, h('h3', null, bi('مفتاح الرموز', 'Map key')));
    var rowsK = [];
    ['asleep', 'alerted', 'moving', 'safe', 'help', 'unacc'].forEach(function (k) { rowsK.push([lgCanvas(function (c) { drawPersonDot(c, 17, 13, 5, k); }), PERSON_ST[k].name]); });
    [['OPEN'], ['SMOKE'], ['FIRE'], ['LOCKED']].forEach(function (s) { var st = s[0]; rowsK.push([lgCanvas(function (c) { var col = tokColor(EXIT_STATE[st].tok); rrect(c, 4, 4, 26, 18, 9); c.fillStyle = rgba(C('surface')); c.fill(); c.lineWidth = 2; c.strokeStyle = rgba(col); c.stroke(); c.fillStyle = rgba(col); c.font = '700 11px ' + R.font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('A', 17, 13.5); }), T('المخرج: ' + EXIT_STATE[st].name.ar, 'Exit: ' + st)]); });
    ['hospital', 'fire', 'police', 'ambulance', 'rescue'].forEach(function (k) { rowsK.push([lgCanvas(function (c) { drawUnitIcon(c, k, 17, 13, 9); }), UNIT[k].name]); });
    rowsK.push([lgCanvas(function (c) { drawDrone(c, 17, 13, 6, 0); }), T('الطائرة (ضوؤها الودّي أخضر)', 'Drone (friendly green light)')]);
    rowsK.push([lgCanvas(function (c, w) { var g = c.createLinearGradient(2, 0, w - 2, 0); g.addColorStop(0, rgba(C('safe'))); g.addColorStop(0.5, rgba(C('warn'))); g.addColorStop(1, rgba(C('danger'))); c.lineWidth = 5; c.lineCap = 'round'; c.strokeStyle = g; c.beginPath(); c.moveTo(4, 13); c.lineTo(w - 4, 13); c.stroke(); }, 54), T('الازدحام: أخضر حرّ ← أحمر خانق (SIM)', 'Traffic: green free ← red jammed (SIM)')]);
    rowsK.push([lgCanvas(function (c, w) { c.setLineDash([9, 6]); c.lineWidth = 3.4; c.strokeStyle = rgba(C('brand')); c.beginPath(); c.moveTo(3, 13); c.lineTo(w - 3, 13); c.stroke(); }, 54), T('مسار وحدة استجابة', 'A responder’s route')]);
    rowsK.push([lgCanvas(function (c, w) { c.setLineDash([5, 4]); c.lineWidth = 2.4; c.strokeStyle = rgba(C('safe')); c.beginPath(); c.moveTo(3, 13); c.lineTo(w - 3, 13); c.stroke(); }, 54), T('مسار آمن لمقيم', 'A resident’s safe route')]);
    rowsK.push([lgCanvas(function (c) { c.save(); c.translate(17, 13); c.rotate(0.7854); c.fillStyle = rgba(C('accent')); c.fillRect(-4, -4, 8, 8); c.restore(); }), T('حسّاس (مضيء بالأحمر إذا فُعِّل مفتاحه)', 'Sentinel (red when its key is active)')]);
    rowsK.push([lgCanvas(function (c) { c.beginPath(); c.arc(17, 13, 8, 0, 6.2832); c.fillStyle = rgba(C('safe'), 0.18); c.fill(); c.setLineDash([4, 3]); c.lineWidth = 2; c.strokeStyle = rgba(C('safe')); c.stroke(); }), T('نقطة تجمّع', 'Assembly point')]);
    key.appendChild(h('ul', { class: 'lg-list' }, rowsK.map(function (r) { return h('li', null, r[0], h('span', { text: LL(r[1]) })); })));
    b.appendChild(h('div', { class: 'rs-grid' }, real, simu, limits, key));
  }

  /* ====================================================================================
   * 8. LAYOUT — three-column console on wide screens, a bottom sheet with tabs on phones / tablets
   * ==================================================================================== */
  var TAB_ICON = { proof: 'shield', scenario: 'layers', alert: 'bell', count: 'users', dispatch: 'route', handoff: 'download', judge: 'sliders', log: 'clock', ab: 'chart', assume: 'sliders', legend: 'help' };
  var TAB_SHORT = { proof: ['الدليل', 'Proof'], scenario: ['السيناريو', 'Scenario'], alert: ['التنبيه', 'Alert'], count: ['العدّ', 'Count'], dispatch: ['الاستجابة', 'Dispatch'], handoff: ['التسليم', 'Hand-off'], judge: ['الحَكَم', 'Judge'], log: ['السجلّ', 'Log'], ab: ['A/B', 'A/B'], assume: ['الافتراضات', 'Assumptions'], legend: ['الحقيقي والمحاكى', 'Real vs SIM'] };
  var TABSETS = {};
  function makeTabset(setId, ids) {
    var list = h('div', { class: 'tablist scroll-x', role: 'tablist', 'aria-orientation': 'horizontal' }), panes = h('div', { class: 'tabpanes' }), host = h('div', { class: 'tabset', id: 'ts-' + setId }, list, panes), tabs = {};
    lab(list, 'aria-label', 'تبويبات اللوحات', 'Panel tabs');
    ids.forEach(function (id) {
      var P = PANELS[id]; if (!P) return;
      var sh = TAB_SHORT[id] || [P.ar, P.en];
      var tab = h('button', { type: 'button', class: 'tab', role: 'tab', id: 'tab-' + setId + '-' + id, 'aria-controls': 'pn-' + id, 'aria-selected': 'false', tabindex: '-1' }, icon(TAB_ICON[id] || 'help'), bi(sh[0], sh[1]), h('i', { class: 'tab-dot', hidden: '' }));
      tab.addEventListener('click', function () { select(id, true); });
      tab.addEventListener('keydown', function (e) {
        var ix = ids.indexOf(id), d = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * (lang() === 'ar' ? -1 : 1);
        if (e.key === 'Home') d = -ix; else if (e.key === 'End') d = ids.length - 1 - ix; else if (!d) return;
        e.preventDefault(); var nx = ids[clamp(ix + d, 0, ids.length - 1)]; select(nx, true); tabs[nx].focus();
      });
      tabs[id] = tab; list.appendChild(tab);
      P.el.setAttribute('role', 'tabpanel'); P.el.setAttribute('aria-labelledby', tab.id); P.el.classList.add('in-tab'); P.el.hidden = true; panes.appendChild(P.el);
    });
    function select(id, user) {
      ids.forEach(function (k) { if (!tabs[k]) return; var on = k === id; tabs[k].setAttribute('aria-selected', on ? 'true' : 'false'); tabs[k].tabIndex = on ? 0 : -1; PANELS[k].el.hidden = !on; });
      host._cur = id; MC.tabSel[setId] = id;
      if (setId === 'S' && user && MC.sheet === 'peek') setSheet('half');
      if (id === 'ab' && !MC.ab && !MC.abBusy) setTimeout(function () { if (!MC.ab && !MC.abBusy) startAB(); }, 120);
      if (setId === 'B' && user && (id === 'ab' || id === 'assume' || id === 'legend') && !MC.bigBottom && !MC.bigAsked) { MC.bigAsked = true; setBottomBig(true); }
      MC.panelsDirty = true; MC.drawDirty = true;
    }
    if (setId === 'B') {
      var ex = h('button', { type: 'button', class: 'icon-btn sm tab-expand', 'aria-pressed': MC.bigBottom ? 'true' : 'false', onclick: function () { setBottomBig(!MC.bigBottom); } }, icon('full'));
      lab(ex, 'aria-label', 'تكبير / تصغير اللوحة السفلية', 'Expand / collapse the bottom panel'); lab(ex, 'title', 'تكبير / تصغير اللوحة السفلية', 'Expand / collapse the bottom panel'); list.appendChild(ex);
    }
    host._select = select; host._ids = ids; host._tabs = tabs;
    select(ids.indexOf(MC.tabSel[setId]) >= 0 ? MC.tabSel[setId] : ids[0]);
    return host;
  }
  function setBottomBig(on) {
    MC.bigBottom = !!on; var b = $('#mc-bottom'); if (b) b.classList.toggle('big', MC.bigBottom);
    var ex = $('.tab-expand'); if (ex) ex.setAttribute('aria-pressed', MC.bigBottom ? 'true' : 'false');
    setTimeout(function () { resizeCanvas(); }, 40);
  }
  function showTab(id) {
    Object.keys(TABSETS).forEach(function (k) { var ts = TABSETS[k]; if (ts._ids.indexOf(id) >= 0) { ts._select(id, true); } });
    if (MC.layout === 'narrow') setSheet(MC.sheet === 'peek' ? 'half' : MC.sheet);
  }
  function setSheet(s) {
    MC.sheet = s; var sh = $('#mc-sheet'); sh.setAttribute('data-sheet', s);
    if (UI.sheetBtn) UI.sheetBtn.setAttribute('aria-expanded', s === 'peek' ? 'false' : 'true');
    setTimeout(function () { resizeCanvas(); }, 30);
  }
  var layoutNow = null;
  function layoutApply() {
    var wide = window.matchMedia('(min-width: 1100px)').matches, mode = wide ? 'wide' : 'narrow';
    if (layoutNow === mode) return;
    layoutNow = mode; MC.layout = mode; main.setAttribute('data-layout', mode);
    var left = $('#mc-left'), right = $('#mc-right'), bottom = $('#mc-bottom'), sheet = $('#mc-sheet');
    [left, right, bottom, sheet].forEach(function (el) { el.replaceChildren(); });
    TABSETS = {}; DEC.strips = [];
    Object.keys(PANELS).forEach(function (k) { PANELS[k].el.classList.remove('in-tab'); PANELS[k].el.hidden = false; PANELS[k].el.removeAttribute('role'); PANELS[k].el.setAttribute('aria-labelledby', 'pn-' + k + '-t'); });
    if (mode === 'wide') {
      left.appendChild(PANELS.scenario.el); left.appendChild(PANELS.judge.el);
      right.appendChild(PANELS.proof.el); TABSETS.R = makeTabset('R', ['alert', 'count', 'dispatch', 'handoff']); right.appendChild(TABSETS.R);
      TABSETS.B = makeTabset('B', ['log', 'ab', 'assume', 'legend']); bottom.appendChild(TABSETS.B);
    } else {
      UI.sheetBtn = h('button', { type: 'button', class: 'sheet-handle', 'aria-expanded': 'false', onclick: function () { setSheet(MC.sheet === 'peek' ? 'half' : MC.sheet === 'half' ? 'full' : 'peek'); } }, h('i', { class: 'grip', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, bi('تبديل حجم اللوحات', 'Toggle panel size')));
      var strip = h('div', { class: 'sheet-strip' }, h('div', { class: 'strip-l' }, h('span', { class: 'strip-phase ph-idle', text: '' }), h('small', { class: 'muted strip-t mono' })), decisionButtons('mini'));
      DEC.strips.push({ phase: $('.strip-phase', strip), t: $('.strip-t', strip) });
      TABSETS.S = makeTabset('S', ['proof', 'scenario', 'alert', 'count', 'dispatch', 'handoff', 'judge', 'log', 'ab', 'assume', 'legend']);
      sheet.appendChild(UI.sheetBtn); sheet.appendChild(strip); sheet.appendChild(TABSETS.S); setSheet(MC.sheet || 'peek');
    }
    MC.dirtyResize = true; MC.panelsDirty = true;
    setTimeout(function () { resizeCanvas(); }, 30);
  }
  MC.tabSel = {}; MC.sheet = 'peek';
  if (window.matchMedia) { var mql = window.matchMedia('(min-width: 1100px)'); (mql.addEventListener ? mql.addEventListener('change', function () { layoutApply(); }) : mql.addListener(function () { layoutApply(); })); }

  /* ====================================================================================
   * 9. BUS — phones (alert / alert-update / dispatch out; citizen / detection in)
   * ==================================================================================== */
  var DEMO_ROOM = { ravi: '203', huda: '105', 'abu-salem': '302', lina: '106' };
  function heroMessages(type) {
    var sim = MC.sim, out = [];
    ['abu-salem', 'lina', 'huda', 'ravi'].forEach(function (k) {                    // Ravi last: a single phone reads Manara.link.last('alert')
      if (!sim.byKey[k]) return;
      var m = null; try { m = Sim.busAlert(sim, k); } catch (e) { m = null; }
      if (!m) return; m.type = type; m.person = k; m.personKey = k; m.room = DEMO_ROOM[k] || (sim.byKey[k].room || null); m.exercise = true; out.push(m);
    });
    return out;
  }
  function busSync(force) {
    var sim = MC.sim; if (!sim) return;
    var t = Date.now();
    if (!sim.alert) { if (MC.alertSent) busClear(); }
    else if (!MC.alertSent) { heroMessages('alert').forEach(function (m) { Manara.link.send(m); }); MC.alertSent = true; MC.alertId = sim.alert.id; MC.busLast = t; }
    else if (force || t - MC.busLast >= 2000) { heroMessages('alert-update').forEach(function (m) { Manara.link.send(m); }); MC.busLast = t; }
    var pl = sim.plan;
    if (pl && (pl.state !== 'recommended') && MC.alertSent) {
      var sig = pl.state + ':' + pl.units.map(function (u) { return u.state; }).join(','), disp = Sim.busDispatch(sim);
      if (disp && (sig !== MC.dispatchSig || t - (MC.dispatchLast || 0) >= 2000)) { Manara.link.send(disp); MC.dispatchSig = sig; MC.dispatchLast = t; }
    }
  }
  function busClear() {
    if (MC.alertSent && MC.alertId) { try { Manara.link.send({ type: 'alert-clear', id: MC.alertId }); } catch (e) { /* ignore */ } }
    MC.alertSent = false; MC.alertId = null; MC.dispatchSig = '';
  }
  setInterval(function () { if (MC.alertSent && MC.sim) busSync(false); }, 500);

  function findResident(m) {
    var ppl = MC.snap.people, room = m.room ? String(m.room) : null, pick = null;
    if (room) { ppl.forEach(function (p) { if (!pick && p.hero && p.room === room) pick = p; }); }
    if (!pick && room) ppl.forEach(function (p) { if (!pick && p.registered && p.room === room && !p.checkin && !p.away) pick = p; });
    if (!pick && !room) ppl.forEach(function (p) { if (!pick && p.registered && !p.checkin && !p.away && p.role === 'resident') pick = p; });
    return pick;
  }
  function handleCitizen(m) {
    if (!MC.sim || (m.status !== 'ack' && m.status !== 'safe' && m.status !== 'help')) return;
    var al = MC.sim.alert;
    if (m.id && al && m.id !== al.id) { addNote('people', T('رسالة من هاتف لتنبيه قديم (' + String(m.id).slice(0, 12) + ') — تم تجاهلها.', 'Message from a phone for an old alert (' + String(m.id).slice(0, 12) + ') — ignored.')); return; }
    var p = findResident(m);
    var who = p ? (p.hero ? LL(HERO_NAME[p.hero]) : B('مقيم', 'a resident')) + (p.room ? ' (' + p.room + ')' : '') : B('مقيم غير معروف', 'an unknown resident');
    if (m.status === 'ack') { addNote('alert', T('هاتف: ' + who + ' — «أنا مستيقظ».', 'Phone: ' + who + ' — “I’m awake”.')); return; }
    if (!p) { addNote('people', T('هاتف: لم نجد مقيمًا مطابقًا لهذه الرسالة.', 'Phone: no matching resident for this message.')); return; }
    act('checkin', { key: p.key, status: m.status, src: 'phone' });
    addNote('people', m.status === 'safe' ? T('هاتف: ' + who + ' ضغط «أنا بأمان».', 'Phone: ' + who + ' tapped “I’m safe”.') : T('هاتف: ' + who + ' ضغط «أحتاج مساعدة».', 'Phone: ' + who + ' tapped “I need help”.'));
    announce(m.status === 'safe' ? B(who + ' بأمان', who + ' is safe') : B(who + ' يحتاج مساعدة', who + ' needs help'));
  }
  var lastInject = 0;
  function handleDetection(m) {
    var okState = { fire: 1, smoke: 1, suspect: 1, clear: 1 };
    if (!m || !okState[m.state]) return;
    var d = { state: m.state, confidence: clamp(+m.confidence || 0, 0, 1), source: String(m.source || '').slice(0, 20), ts: Date.now(), snapshot: (typeof m.snapshot === 'string' && m.snapshot.length < 90000) ? m.snapshot : null };
    MC.detection = d; MC.panelsDirty = true;
    if (MC.linkCamera && MC.snap && MC.snap.hazard === 'fire' && (d.state === 'fire' || d.state === 'smoke') && Date.now() - lastInject > 3000) {
      lastInject = Date.now();
      var room = (MC.origin && MC.origin.room) || presetInfo(MC.preset).room, ch = 'S-' + room + '-vision';
      var found = MC.sim.sensors.some(function (c) { return c.id === ch; });
      if (found) { act('inject', { ch: ch, add: 1.2, sec: 8 }); addNote('verify', T('مختبر الأدلة: الكاميرا ترى ' + (d.state === 'fire' ? 'حريقًا' : 'دخانًا') + ' (' + Math.round(d.confidence * 100) + '٪) → مفتاح رؤية واحد فقط.', 'Evidence Lab: the camera sees ' + d.state + ' (' + Math.round(d.confidence * 100) + ' %) → ONE vision key only.')); }
    }
  }
  Manara.link.on(function (m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'citizen') handleCitizen(m); else if (m.type === 'detection') handleDetection(m);
  });
  // seed the proof panel from a detection that arrived before this page opened
  try { var lastDet = Manara.link.last('detection'); if (lastDet && Date.now() - (lastDet.ts || 0) < 60000) { MC.detection = { state: lastDet.state, confidence: clamp(+lastDet.confidence || 0, 0, 1), source: String(lastDet.source || ''), ts: lastDet.ts || Date.now(), snapshot: typeof lastDet.snapshot === 'string' && lastDet.snapshot.length < 90000 ? lastDet.snapshot : null }; } } catch (e) { /* ignore */ }

  /* ====================================================================================
   * 10. TWIN BOARD — optional Web Serial link (protocol v1, docs/MANARA-SPEC.md). Feature-detected; the page never needs it.
   * ==================================================================================== */
  var Twin = { supported: !!(navigator.serial && navigator.serial.requestPort), state: 'idle', port: null, reader: null, writer: null, lines: 0, lastSigns: '', lastSend: 0, lastHot: 0, lastSos: false, lastExit: {} };
  function twinMapHot(hot) {            // hot.x/y are 0..1 across the board (x east, y south) → the residence floor plan (RB), floor 1
    var S = WI.structs[0];
    return { x: S.x0 + clamp(hot.x, 0, 1) * S.w, y: S.y0 + clamp(hot.y, 0, 1) * S.h, fl: 1, t: hot.t };
  }
  function twinApply(m) {
    if (!MC.sim) return;
    MC.twin = { ms: Date.now(), frame: m };
    if (m.exits && presetInfo(MC.preset).scope && presetInfo(MC.preset).scope[0] === 'RB') {
      ['A', 'B', 'R'].forEach(function (k) {
        if (m.exits[k] !== 'open' && m.exits[k] !== 'locked') return;
        var want = m.exits[k] === 'locked', cur = MC.snap.exits.filter(function (e) { return e.struct === 'RB' && e.id === k; })[0];
        if (cur && cur.locked !== want && Date.now() - (Twin.lastExit[k] || 0) > 800) { Twin.lastExit[k] = Date.now(); act('exit', { id: 'RB.' + k, locked: want }); addNote('guide', T('لوحة التوأم: مفتاح المخرج ' + k + ' ' + (want ? 'أُقفل' : 'فُتح') + '.', 'Twin board: exit switch ' + k + ' is now ' + (want ? 'locked' : 'open') + '.')); }
      });
    }
    var hot = m.thermal && m.thermal.hot;
    if (hot && isNum(hot.x) && isNum(hot.y)) {
      var mp = twinMapHot(hot); MC.twinHot = { x: mp.x, y: mp.y, fl: mp.fl, t: hot.t, ms: Date.now() };
      if (isNum(hot.t) && hot.t >= 57 && MC.snap.hazard === 'fire' && Date.now() - Twin.lastHot > 2000) {
        var S = WI.structs[0], best = null, bd = 1e9;
        S.nodes.forEach(function (n) { if (n.fl === 1 && n.type === 1) { var d = Math.hypot(n.x - mp.x, n.y - mp.y); if (d < bd) { bd = d; best = n; } } });
        if (best && presetInfo(MC.preset).scope[0] === 'RB') { Twin.lastHot = Date.now(); act('inject', { ch: 'S-' + best.id + '-thermal', add: 45, sec: 6 }); addNote('verify', T('لوحة التوأم: بقعة ساخنة ' + Math.round(hot.t) + '°م قرب غرفة ' + best.room + ' → مفتاح حرارة واحد.', 'Twin board: hotspot ' + Math.round(hot.t) + ' °C near room ' + best.room + ' → ONE heat key.')); }
      }
    }
    if (m.sos === true && !Twin.lastSos) { var key = UI.judge && UI.judge.sosSel ? UI.judge.sosSel.value : 'abu-salem'; act('checkin', { key: key, status: 'help', src: 'twin' }); addNote('people', T('لوحة التوأم: ضُغط زر الاستغاثة.', 'Twin board: the SOS button was pressed.')); }
    Twin.lastSos = m.sos === true;
    MC.panelsDirty = true; MC.drawDirty = true; updateTwinUI();
  }
  function twinHandleLine(line) {
    var m; try { m = JSON.parse(line); } catch (e) { return false; }
    if (!m || m.v !== 1 || typeof m.type !== 'string') return false;
    Twin.lines++;
    if (m.type === 'frame') twinApply(m);
    else if (m.type === 'checkin') handleCitizen({ type: 'citizen', status: m.status === 'help' ? 'help' : 'safe', room: m.room, lang: m.lang, id: MC.sim && MC.sim.alert ? MC.sim.alert.id : undefined });
    else if (m.type === 'grid') { /* the thermal image is shown by the Evidence Lab */ }
    else return false;
    return true;
  }
  function twinSigns() {
    var s = MC.snap, ph = s.verification.phase, ex = {}; s.exits.forEach(function (e) { if (e.struct === 'RB') ex[e.id] = e; });
    var live = ph === 'confirmed' || ph === 'public';
    function sign(k) { var e = ex[k]; if (!live || !e) return 'off'; return e.state === 'OPEN' ? 'go' : 'stop'; }
    return { v: 1, type: 'signs', A: sign('A'), B: sign('B'), R: sign('R'), siren: s.localAlarm.on ? 'on' : 'off', ring: ph === 'public' || ph === 'confirmed' ? 'red' : ph === 'suspect' ? 'amber' : 'green', hazard: ph === 'idle' && !(MC.sim.hz && MC.sim.hz.started) ? 'none' : s.hazard };
  }
  function twinSend() {
    if (Twin.state !== 'live' || !Twin.writer || !MC.snap) return;
    var m = twinSigns(), sig = JSON.stringify(m), t = Date.now();
    if (sig === Twin.lastSigns && t - Twin.lastSend < 5000) return;
    Twin.lastSigns = sig; Twin.lastSend = t;
    try { Twin.writer.write(new TextEncoder().encode(sig + '\n')).catch(function () { /* board unplugged */ }); } catch (e) { /* ignore */ }
  }
  setInterval(twinSend, 1000);
  function twinConnect() {
    if (!Twin.supported) return;
    Twin.state = 'connecting'; updateTwinUI();
    navigator.serial.requestPort().then(function (port) {
      return port.open({ baudRate: 115200 }).then(function () {
        Twin.port = port; Twin.state = 'live'; Twin.writer = port.writable ? port.writable.getWriter() : null; updateTwinUI();
        var dec = new TextDecoder(), buf = '', reader = port.readable.getReader(); Twin.reader = reader;
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) { Twin.state = 'idle'; updateTwinUI(); return; }
            buf += dec.decode(r.value, { stream: true });
            var ix; while ((ix = buf.indexOf('\n')) >= 0) { var ln = buf.slice(0, ix).trim(); buf = buf.slice(ix + 1); if (ln) twinHandleLine(ln); }
            if (buf.length > 20000) buf = '';
            pump();
          }).catch(function () { Twin.state = 'error'; updateTwinUI(); });
        })();
      });
    }).catch(function () { Twin.state = 'idle'; updateTwinUI(); });
  }
  function twinDisconnect() { try { if (Twin.reader) Twin.reader.cancel(); if (Twin.writer) Twin.writer.releaseLock(); if (Twin.port) Twin.port.close(); } catch (e) { /* ignore */ } Twin.state = 'idle'; Twin.writer = null; updateTwinUI(); }
  var SAMPLE_FRAME = '{"v":1,"type":"frame","ms":1000,"thermal":{"tmax":64.2,"tmean":29.8,"hot":{"x":0.45,"y":0.3,"t":64.2}},"gas":{"mq2":312,"mq7":40},"air":{"t":33.5,"rh":61,"hi":41.0,"wbgt":31.2},"water":{"cm":1.2},"sos":false,"exits":{"A":"open","B":"locked","R":"open"},"local":{"alarm":true,"hazard":"fire"}}';
  function buildTwinUI() {
    var box = UI.judge.twinBox; box.replaceChildren();
    UI.twin = { status: h('p', { class: 'tw-status', role: 'status' }), vals: h('p', { class: 'muted small mono' }) };
    UI.twin.conn = btn('btn btn-sm btn-ghost', 'usb', 'اتصل باللوحة (Web Serial)', 'Connect the board (Web Serial)', function () { if (Twin.state === 'live') twinDisconnect(); else twinConnect(); });
    UI.twin.sample = btn('btn btn-sm btn-ghost', 'play', 'جرّب بإطار نموذجي (SIM)', 'Try a sample frame (SIM)', function () { twinHandleLine(SAMPLE_FRAME); });
    box.appendChild(h('p', { class: 'muted small' }, bi('لوحة التوأم الاختيارية (ESP32): مفاتيح المخارج الثلاثة تقفل المخارج هنا، والبقعة الحارة (≥ 57°م) مفتاح حرارة واحد، وتُرسَل إليها لافتات «اذهب/قف». لا تحتاجها الصفحة لتعمل.', 'The optional twin board (ESP32): its three exit switches lock the exits here, a hotspot (≥ 57 °C) is ONE heat key, and “go / stop” signs are sent back. The page works without it.')));
    box.appendChild(UI.twin.status); box.appendChild(h('div', { class: 'btns' }, UI.twin.conn, UI.twin.sample)); box.appendChild(UI.twin.vals);
    if (!Twin.supported) UI.twin.conn.disabled = true;
    updateTwinUI();
  }
  function updateTwinUI() {
    if (!UI.twin) return;
    var st = Twin.supported ? ({ idle: B('غير متصلة', 'Not connected'), connecting: B('جارٍ الاتصال…', 'Connecting…'), live: B('متصلة', 'Connected'), error: B('خطأ في الاتصال', 'Connection error') }[Twin.state]) : B('Web Serial غير مدعوم في هذا المتصفح (استعمل Chrome أو Edge).', 'Web Serial is not supported in this browser (use Chrome or Edge).');
    setText(UI.twin.status, st);
    UI.twin.conn.replaceChildren(icon('usb'), bi(Twin.state === 'live' ? 'افصل اللوحة' : 'اتصل باللوحة (Web Serial)', Twin.state === 'live' ? 'Disconnect the board' : 'Connect the board (Web Serial)'));
    var f = MC.twin && MC.twin.frame;
    setText(UI.twin.vals, f ? ('frames ' + Twin.lines + (f.thermal ? ' · tmax ' + f.thermal.tmax + ' °C' : '') + (f.exits ? ' · A:' + f.exits.A + ' B:' + f.exits.B + ' R:' + f.exits.R : '') + (f.air ? ' · WBGT~' + f.air.wbgt : '')) : '');
  }

  /* ====================================================================================
   * 11. START-UP + the small automation API (tests, other pages)
   * ==================================================================================== */
  function onLangChange() {
    relabel();
    var resets = [[UI.count, ['psig', 'dsig', 'gsig']], [UI.dispatch, ['csig', 'hsig', 'sig', 'rsig']], [UI.proof, ['keysFor']], [UI.ab, ['sig']], [UI.judge, ['exSig']]];
    resets.forEach(function (r) { if (r[0]) r[1].forEach(function (k) { r[0][k] = null; }); });
    if (UI.dispatch) UI.dispatch.sig = '';
    if (UI.judge && MC.sim) onRunStarted();
    MC.log.dirty = true; renderLegendPanel(); buildLegend(); updateTwinUI(); syncPlayUI(); syncChrome();
    MC.panelsDirty = true; MC.dirtyResize = true; refreshAll();
  }
  function onThemeChange() {
    readColors(); MC.fieldsDirty = true; MC.drawDirty = true; if (UI.dispatch) UI.dispatch.chartSig = null; renderLegendPanel(); MC.panelsDirty = true; refreshAll();
  }
  function init() {
    readColors();
    buildGeometry();
    var hs = parseHash();
    if (hs.preset && Sim.PRESETS[presetBase(hs.preset)]) MC.preset = presetBase(hs.preset);
    if (hs.seed && isFinite(hs.seed)) MC.seed = Math.max(1, Math.floor(hs.seed));
    if (hs.speed === 1 || hs.speed === 4 || hs.speed === 16) MC.speed = hs.speed;
    if (hs.room) { var pi0 = presetInfo(MC.preset); if (pi0.hazard === 'fire') { var S0 = WI.structs[pi0.struct != null ? pi0.struct : 0]; if (S0.nodes.some(function (n) { return n.id === hs.room && (n.type === 1 || n.type === 7); })) MC.origin = { struct: pi0.struct != null ? pi0.struct : 0, room: hs.room }; } }
    buildToolbar(); buildTimeline(); buildHud();
    buildScenarioPanel(); buildJudgePanel(); buildProofPanel(); buildAlertPanel(); buildCountPanel(); buildHandoffPanel(); buildDispatchPanel(); buildLogPanel(); buildABPanel(); buildAssumePanel(); buildLegendPanel();
    buildTwinUI();
    layoutApply();
    bindCanvas();
    startRun({});
    if (hs.view === 'building') { MC.bStruct = presetInfo(MC.preset).struct != null ? presetInfo(MC.preset).struct : 0; setView('building'); }
    if (hs.present) setPresent(true);
    if (hs.t && hs.t > 0) { advance(hs.t); }
    resizeCanvas(); fitView(); updateScaleBar(); syncPlayUI(); syncChrome(); refreshAll();
    if (typeof ResizeObserver === 'function') { new ResizeObserver(function () { MC.dirtyResize = true; }).observe($('#mc-stage')); }
    window.addEventListener('resize', function () { MC.dirtyResize = true; });
    window.addEventListener('langchange', onLangChange);
    window.addEventListener('themechange', onThemeChange);
    window.addEventListener('hashchange', function () {
      var h2 = parseHash(); if (!h2.preset) return;
      if (presetBase(h2.preset) !== MC.preset || (h2.seed && h2.seed !== MC.seed)) startRun({ preset: h2.preset, seed: h2.seed || MC.seed });
    });
    window.addEventListener('pagehide', busClear);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { MC.wasPlaying = MC.playing; } });
    requestAnimationFrame(loop);
    main.setAttribute('data-ready', '1');
  }

  window.MissionControl = {
    version: 1,
    get sim() { return MC.sim; }, get snap() { return MC.snap; }, get state() { return MC; },
    start: function (preset, seed) { return startRun({ preset: preset, seed: seed }); },
    advance: function (s) { var r = advance(s); refreshAll(); return r; }, seek: function (t) { seekTo(t); var guard = 0; while (MC.seekTarget != null && guard++ < 4000) { var s = MC.sim; while (s.t < MC.seekTarget && !s.done) stepOnce(); MC.seekTarget = null; afterTicks(); } refreshAll(); return MC.sim.t; },
    play: function () { setPlaying(true); }, pause: function () { setPlaying(false); }, setSpeed: setSpeed, setView: setView, setPresent: setPresent,
    approve: function () { var r = doApprove(); refreshAll(); return r; }, hold: function () { var r = doHold(); refreshAll(); return r; }, act: function (op, a) { var r = act(op, a); refreshAll(); return r; }, refresh: refreshAll, draw: function () { draw(); },
    lockExit: function (id, locked) { return act('exit', { id: id, locked: locked }); },
    heroMessages: heroMessages, handleCitizen: handleCitizen, handleDetection: handleDetection,
    ab: { run: runBatch, diff: diffMetrics, start: startAB, seeds: startSeeds },
    twin: { handleLine: twinHandleLine, signs: twinSigns, sample: SAMPLE_FRAME, supported: Twin.supported },
    package: incidentPackage, capXml: function () { return Sim.cap(MC.sim, { languages: ['ar', 'en'] }); },
    layout: function () { return MC.layout; }, shareURL: shareURL, showTab: showTab,
    hits: function () { return R.hits.map(function (q) { return { type: q.type, id: q.id, x: q.x, y: q.y }; }); }, camK: function () { return MC.view === 'map' ? R.cam.map.k : R.cam.bld.k; }, fit: function () { return MC.view === 'map' ? R.cam.map.fit : R.cam.bld.fit; },
    tool: function () { return MC.tool; }, params: function () { return MC.params; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
