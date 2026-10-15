/* MANARA («منارة») — the CONTROL ROOM («غرفة التحكم»), CORE  →  window.ControlRoom          (js/control.js)
 * =====================================================================================================================
 * User requirement (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot".
 * This is a real operations console, not a map demo: a priority-sorted ALERT QUEUE (drone / sentinel / citizen / operator), the NATIONAL MAP of Qatar (the NatMap renderer of Mission Control, reused) with drones,
 * ground units and incidents, a LIVE FEED WALL of drone cameras, the FLEET board, the DISPATCH plan, the building-scale ROBOT, the COMMS log and the shift HANDOVER, a timeline of the day, operator ROLES and a WALL mode.
 * Everything simulated says SIM; drones and robot are a CONCEPT with a SIMULATED prototype; 999 stays the dispatcher; no claim of real integration.  Detector = rule-based computer vision (never "AI").
 *
 * FILES (classic scripts, no modules, no fetch: they work from file://; each one is an IIFE that attaches to window.ControlRoom)
 *   js/control.js         this file: helpers, state, engine (ManaraNational), snapshot → scene, drone / alert overlay, map input, actions + role gating, bus, frame loop, public API
 *   js/control-ui.js      the shell: top bar, KPI strip, alert queue, timeline, tabs / phone bottom sheet, dialogs, sound, keyboard, wall mode
 *   js/control-feeds.js   the FEED WALL tab (ManaraDroneScene frames, overlays, telemetry HUD, evidence, announce, snapshot / record, live webcam / video source)
 *   js/control-robot.js   the ROBOT tab (a ManaraSim 'fire-night-robot' building scenario linked to the selected building-fire / gas alert)
 *   js/control-panels.js  FLEET, DISPATCH, COMMS and HANDOVER tabs
 *   js/control-demo.js    presets: the one-click demo story, the busy shift, reset
 *
 * LIFE CYCLE   CR.boot() (DOMContentLoaded): build the shell → create the map → build the tabs → (after the first paint) create the engine → start the preset → rAF loop.
 * EXTENSION    CR.registerTab({id, icon, ar, en, build(el), update(), frame(ts), active(on)})   ·   CR.on(event, fn) / CR.emit(event, data)   events: snapshot, select, role, alert-new, lang, theme, view, tick
 * TEST API     window.ControlRoom.api (see the bottom of this file)
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, html = doc.documentElement;
  var CR = win.ControlRoom = { version: 1, tabs: [], mods: {}, hooks: { afterStep: [], uiTick: [], init: [] }, handlers: {} };
  var NN = null, NM = null, DS = null, SIM = null, GEO = null, FAC = null, ROADS = null;

  /* ====================================================================================
   * 1. SMALL HELPERS (exported on CR for the modules)
   * ==================================================================================== */
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function lang() { return win.Manara.lang(); }
  function B(ar, en) { return lang() === 'en' ? en : ar; }
  function nm(o) { return o ? (typeof o === 'string' ? o : (lang() === 'en' ? (o.en || o.ar || '') : (o.ar || o.en || ''))) : ''; }
  function N(n, d) { return win.Manara.num(n, d); }
  function mmss(sec) { if (!isNum(sec)) return '–'; sec = Math.max(0, Math.round(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
  function hms(sec) { sec = ((Math.floor(sec) % 86400) + 86400) % 86400; return pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor(sec / 60) % 60) + ':' + pad2(sec % 60); }
  function setT(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setA(el, k, v) { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, v); }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) add(el, c[i]); }
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(doc.createTextNode(String(c)));
  }
  // h('div', {class:'x', onclick:fn, 'aria-label':'..'}, child, child, ...) — text is ALWAYS a text node (never innerHTML): bus / uploaded / typed text can be passed safely
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
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, a) {
    var el = doc.createElementNS(SVGNS, tag);
    if (a) for (var k in a) if (a[k] != null) el.setAttribute(k, a[k]);
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  // bilingual static text: both languages are in the DOM, CSS (html[data-lang]) shows one — no re-render on langchange
  function bi(ar, en, tag) { return h(tag || 'span', { class: 'bi' }, h('span', { 'data-l': 'ar', text: ar }), h('span', { 'data-l': 'en', text: en })); }
  // bilingual attribute (aria-label / title / placeholder): re-applied on langchange
  function lab(el, attr, ar, en) { el.setAttribute('data-lab-' + attr, ar + '\u0001' + en); el.setAttribute(attr, B(ar, en)); return el; }
  function relabel(root) {
    $$('[data-lab-aria-label],[data-lab-title],[data-lab-placeholder],[data-lab-alt]', root).forEach(function (el) {
      ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (a) {
        var v = el.getAttribute('data-lab-' + a); if (v == null) return;
        var p = v.split('\u0001'); el.setAttribute(a, B(p[0], p[1]));
      });
    });
  }
  // icons: the shared set of core.js plus the ones the console needs (24px stroke icons, currentColor)
  var XICON = {
    gas: '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M9 21h6"/>',
    flood: '<path d="M3 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2M3 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2M3 19c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2"/><path d="M12 3v3M10 4.5h4"/>',
    dust: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    sos: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/><path d="M12 9v4M10 11h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    launch: '<path d="M5 19L19 5M9 5h10v10"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    rec: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    zoomin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M8 11h6"/>',
    mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
    ambulance: '<rect x="2" y="7" width="13" height="9" rx="1.5"/><path d="M15 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="18" cy="18" r="1.8"/><path d="M8.5 9.5v4M6.5 11.5h4"/>',
    police: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2.5"/>',
    rescue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5"/>',
    hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    skip: '<path d="M5 4l9 8-9 8z"/><path d="M19 5v14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    sentinel: '<rect x="8" y="3" width="8" height="12" rx="2"/><path d="M12 15v6M8 21h8M5 7a9 9 0 0 0 0 4M19 7a9 9 0 0 1 0 4"/>',
    fastfwd: '<path d="M3 5l8 7-8 7zM12 5l8 7-8 7z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    thermometer: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>'
  };
  function icon(name, cls) {
    var wrap;
    if (XICON[name]) {
      var s = sv('svg', { 'class': 'i' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
      var t = doc.createElement('template'); t.innerHTML = '<svg xmlns="' + SVGNS + '">' + XICON[name] + '</svg>';
      var kids = t.content.firstChild.childNodes; while (kids.length) s.appendChild(kids[0]);
      return s;
    }
    wrap = doc.createElement('template'); wrap.innerHTML = win.Manara.icon(name, cls);        // Manara.icon() returns a static, safe string
    return wrap.content.firstChild;
  }
  function btn(cls, iconName, ar, en, onclick, extra) {
    var b = h('button', { type: 'button', class: cls, onclick: onclick });
    if (iconName) b.appendChild(icon(iconName));
    if (ar) b.appendChild(bi(ar, en));
    if (extra) for (var k in extra) if (extra[k] != null) b.setAttribute(k, extra[k]);
    return b;
  }
  function iconBtn(iconName, ar, en, onclick, cls) { var b = h('button', { type: 'button', class: 'icon-btn ' + (cls || ''), onclick: onclick }); b.appendChild(icon(iconName)); lab(b, 'aria-label', ar, en); lab(b, 'title', ar, en); return b; }
  function tag(cls, text) { return h('span', { class: 'tag ' + (cls || ''), text: text }); }
  function simTag() { var t = h('span', { class: 'tag warn cr-sim', translate: 'no' }, 'SIM'); lab(t, 'title', 'محاكاة', 'Simulation'); return t; }
  function dl(name, mime, text) {
    try { var blob = new Blob([text], { type: mime + ';charset=utf-8' }), a = h('a', { href: URL.createObjectURL(blob), download: name }); doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400); return true; } catch (e) { return false; }
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      function fallback() { try { var ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;inset-block-start:0;opacity:0' }); ta.value = text; doc.body.appendChild(ta); ta.select(); var ok = doc.execCommand && doc.execCommand('copy'); ta.remove(); resolve(!!ok); } catch (e) { resolve(false); } }
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback); else fallback(); } catch (e2) { fallback(); }
    });
  }
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  var RMQ = win.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduced() { return !!RMQ.matches; }

  /* ---- colours: canvases read the design tokens and re-read them on 'themechange' ---- */
  var TOKS = ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'head', 'brand', 'accent', 'accent-2', 'safe', 'warn', 'danger', 'info', 'fire-1', 'fire-2', 'fire-3'];
  var COL = {}, FONT = 'system-ui, sans-serif', MONO = 'monospace';
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
  function readColors() {
    var cs = getComputedStyle(html);
    TOKS.forEach(function (t) { COL[t] = parseColor(cs.getPropertyValue('--' + t)); });
    var bf = getComputedStyle(doc.body).fontFamily; if (bf) FONT = bf;
    var mf = cs.getPropertyValue('--font-m'); if (mf) MONO = mf;
    COL.dark = html.dataset.theme === 'dark';
  }
  function C(n) { return COL[n] || [128, 128, 128]; }

  Object.assign(CR, { $: $, $$: $$, h: h, sv: sv, bi: bi, lab: lab, relabel: relabel, B: B, nm: nm, N: N, mmss: mmss, hms: hms, pad2: pad2, icon: icon, btn: btn, iconBtn: iconBtn, tag: tag, simTag: simTag, setT: setT, setA: setA, clamp: clamp, lerp: lerp, now: now,
    isNum: isNum, dl: dl, copyText: copyText, lang: lang, reduced: reduced, storeGet: storeGet, storeSet: storeSet, C: C, rgba: rgba, mixc: mixc, readColors: readColors, XICON: XICON,
    font: function () { return FONT; }, mono: function () { return MONO; } });

  /* ====================================================================================
   * 2. VOCABULARY
   * ==================================================================================== */
  var HZ_ORDER = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
  var HZ = { fire: { icon: 'fire', tok: 'fire-3' }, gas: { icon: 'gas', tok: 'warn' }, flood: { icon: 'flood', tok: 'info' }, dust: { icon: 'dust', tok: 'warn' }, heat: { icon: 'thermo', tok: 'brand' }, sos: { icon: 'sos', tok: 'danger' } };
  var SRC = { drone: { icon: 'drone', cls: 'cool', ar: 'مسيّرة', en: 'Drone' }, sentinel: { icon: 'sentinel', cls: 'warn', ar: 'حسّاس', en: 'Sentinel' }, citizen: { icon: 'users', cls: 'info', ar: 'مواطن', en: 'Citizen' }, operator: { icon: 'user', cls: '', ar: 'المشغّل', en: 'Operator' } };
  var ROLES = [{ id: 'viewer', ar: 'مشاهد', en: 'Viewer', rank: 0 }, { id: 'operator', ar: 'مشغّل', en: 'Operator', rank: 1 }, { id: 'commander', ar: 'قائد الحادث', en: 'Incident commander', rank: 2 }];
  var STATES = ['SUSPECT', 'CONFIRMED', 'APPROVED', 'DISPATCHED', 'ON-SCENE', 'RESOLVED'];
  var STATE_RANK = { SUSPECT: 0, CONFIRMED: 1, APPROVED: 2, DISPATCHED: 3, 'ON-SCENE': 4, RESOLVED: 5, DISMISSED: 6 };
  var LEVEL_OF = { fire: 'evacuate', gas: 'shelter', flood: 'shelter', dust: 'shelter', heat: 'shelter', sos: 'watch' };
  var DOW_SHORT = [['الأحد', 'Sun'], ['الاثنين', 'Mon'], ['الثلاثاء', 'Tue'], ['الأربعاء', 'Wed'], ['الخميس', 'Thu'], ['الجمعة', 'Fri'], ['السبت', 'Sat']];
  var DRONE_COLOR = { launching: 'brand', 'en-route': 'brand', patrol: 'accent', 'on-station': 'safe', verifying: 'safe', returning: 'muted', docked: 'muted', charging: 'muted', fault: 'danger' };
  Object.assign(CR, { HZ_ORDER: HZ_ORDER, HZ: HZ, SRC: SRC, ROLES: ROLES, STATES: STATES, STATE_RANK: STATE_RANK, DOW_SHORT: DOW_SHORT, DRONE_COLOR: DRONE_COLOR });
  function hzName(hz) { return nm(NN.HAZARD_NAME[hz] || NN.HAZARD_NAME.sos); }
  function roleOf(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i]; return ROLES[0]; }
  CR.hzName = hzName; CR.roleOf = roleOf;

  /* ====================================================================================
   * 3. STATE
   * ==================================================================================== */
  var S = CR.S = {
    ready: false, failed: false, booted: false, bootT0: now(), firstPaintMs: null, engineMs: null,
    nat: null, snap: null, world: null, map: null, ov: null, ovCtx: null, dpr: 1,
    opts: { seed: 7, date: '2026-01-11', hour: 7.75, params: {} },
    playing: true, speed: 30, acc: 0, last: 0, tick: 5, seek: null, seekFrom: null,
    role: 'operator', autopilot: false, wall: false, tool: 'select', hazardTool: 'fire',
    sel: null, selDrone: null, tab: 'feed', view: 'map', follow: false,
    layers: { traffic: true, hazard: 'off', fac: { hospital: true, police: true, fire: true, ambulance: true, minor: false }, units: true, munis: true, places: true, tunnels: true, closures: true, drones: true, coverage: true, trails: true, docks: true },
    jams: {}, preset: 'none',
    units: [], unitsById: {}, drones: {}, glide: { t0: 0, dur: 1 }, snapAt: 0,
    alerts: [], alertsById: {}, seen: {}, evIdx: 0, commsIdx: 0, daSeen: {}, oplog: [], opSeq: 0, decisions: [], rejects: 0, lastNew: null,
    pub: {}, bus: { alert: 0, dispatch: 0, droneAlert: 0, droneStatus: 0, robot: 0, find: 0, clear: 0, advisory: 0 }, busLog: [], statusAt: 0, checkins: {}, phone: { safe: 0, help: 0, ack: 0 },
    detections: [], hover: null, ovHits: [], frames: [], fpsLast: 0, uiAt: 0, dirtyUI: true, script: null, banner: null, tip: null, confirmApprove: {}, lastInput: 0
  };
  CR.on = function (ev, fn) { (CR.handlers[ev] = CR.handlers[ev] || []).push(fn); return function () { CR.handlers[ev] = (CR.handlers[ev] || []).filter(function (f) { return f !== fn; }); }; };
  CR.emit = function (ev, data) { (CR.handlers[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } }); };
  CR.registerTab = function (def) { CR.tabs.push(def); return def; };

  /* ====================================================================================
   * 4. THE ENGINE (ManaraNational) — create / reset; the clock cannot run backwards, so a new clock is a new engine
   * ==================================================================================== */
  function engineOpts() { var o = S.opts; return { seed: o.seed, date: o.date, hour: o.hour, autoApprove: false, tickSec: S.tick, params: Object.assign({}, o.params) }; }
  function makeEngine() { var t0 = now(), nat = NN.create(engineOpts()); S.engineMs = Math.round(now() - t0); return nat; }
  function resetRuntime() {
    S.alerts = []; S.alertsById = {}; S.seen = {}; S.evIdx = 0; S.commsIdx = 0; S.daSeen = {}; S.oplog = []; S.decisions = []; S.rejects = 0; S.sel = null; S.selDrone = null; S.units = []; S.unitsById = {}; S.drones = {};
    S.pub = {}; S.bus = { alert: 0, dispatch: 0, droneAlert: 0, droneStatus: 0, robot: 0, find: 0, clear: 0, advisory: 0 }; S.busLog = []; S.statusAt = 0; S.checkins = {}; S.phone = { safe: 0, help: 0, ack: 0 }; S.detections = [];
    S.jams = {}; S.confirmApprove = {}; S.script = null; S.seek = null; S.acc = 0; S.lastNew = null; S.advSig = ''; S.banner = null;
  }
  // (re)create the engine: opts {seed, date, hour, params, speed, role, playing}; publishes alert-clear for anything the phones still show
  function reset(o) {
    o = o || {};
    clearPublished();
    if (o.seed != null) S.opts.seed = o.seed; if (o.date) S.opts.date = o.date; if (o.hour != null) S.opts.hour = o.hour; S.opts.params = o.params || {};
    resetRuntime();
    S.nat = makeEngine(); S.world = NN.world(S.nat);
    if (o.speed) S.speed = o.speed; if (o.role) S.role = o.role; if (o.playing != null) S.playing = !!o.playing;
    if (o.autopilot != null) setAutopilot(!!o.autopilot, true);
    CR.emit('reset', null);
    takeSnapshot(true); syncScene(true); S.dirtyUI = true;
    CR.emit('role', S.role);
    return S.nat;
  }
  function setAutopilot(on, silent) { S.autopilot = !!on; if (S.nat) S.nat.autoApprove = !!on; if (!silent) { logOp('operator', 'الطيار الآلي (مشغّل محاكى) ' + (on ? 'يعمل' : 'متوقف'), 'Autopilot (a simulated operator) is ' + (on ? 'on' : 'off')); S.dirtyUI = true; CR.emit('autopilot', on); } }

  /* ====================================================================================
   * 5. SNAPSHOT → what the map and the panels draw (units and drones glide between engine ticks)
   * ==================================================================================== */
  function takeSnapshot(force) {
    var nat = S.nat; if (!nat) return null;
    var t = now(); if (!force && t - S.snapAt < 70) return S.snap; S.snapAt = t;
    var s = NN.snapshot(nat, { kpis: true, lastEvents: 80, lastComms: 120, sectors: true });
    S.snap = s;
    // alerts
    S.alerts = s.alerts; S.alertsById = {}; s.alerts.forEach(function (a) { S.alertsById[a.id] = a; });
    // glide (movers): remember where each thing is drawn now, set the new target; the frame loop interpolates
    var dur = Math.max(60, Math.min(900, (S.tick / Math.max(1, S.speed)) * 1000 * (S.playing ? 1 : 0))), first = !S.units.length, i, u, d, r, moving = false;
    for (i = 0; i < s.units.length; i++) {
      u = s.units[i]; d = S.unitsById[u.id];
      if (!d) { d = S.unitsById[u.id] = { id: u.id, kind: u.kind, name: u.name, lon: u.lon, lat: u.lat, state: u.state, assigned: u.assigned, busy: u.busy, flon: u.lon, flat: u.lat, tlon: u.lon, tlat: u.lat }; S.units.push(d); }
      d.flon = d.lon; d.flat = d.lat; d.tlon = u.lon; d.tlat = u.lat; d.state = u.state; d.assigned = u.assigned; d.busy = u.busy; d.name = u.name;
      if (Math.abs(d.tlon - d.flon) > 1e-6 || Math.abs(d.tlat - d.flat) > 1e-6) moving = true;
    }
    for (i = 0; i < s.drones.length; i++) {
      r = s.drones[i]; d = S.drones[r.id];
      if (!d) { d = S.drones[r.id] = { id: r.id, lon: r.lon, lat: r.lat, hd: r.headingDeg, flon: r.lon, flat: r.lat, fhd: r.headingDeg, tlon: r.lon, tlat: r.lat, thd: r.headingDeg }; }
      d.row = r; d.flon = d.lon; d.flat = d.lat; d.fhd = d.hd; d.tlon = r.lon; d.tlat = r.lat; d.thd = r.headingDeg;
      if (NN.haversineM(d.flon, d.flat, d.tlon, d.tlat) > 4000) { d.flon = d.tlon; d.flat = d.tlat; d.fhd = d.thd; }        // a dock jump: no glide
      if (Math.abs(d.tlon - d.flon) > 1e-6 || Math.abs(d.tlat - d.flat) > 1e-6) moving = true;
    }
    S.glide = { t0: t, dur: moving ? dur : 0 };
    if (!moving || dur < 70) stepGlide(t + 1e6);
    CR.emit('snapshot', s);
    return s;
  }
  function stepGlide(t) {
    var g = S.glide, k = g.dur > 0 ? clamp((t - g.t0) / g.dur, 0, 1) : 1, i, d, a;
    for (i = 0; i < S.units.length; i++) { d = S.units[i]; d.lon = d.flon + (d.tlon - d.flon) * k; d.lat = d.flat + (d.tlat - d.flat) * k; }
    var ids = Object.keys(S.drones);
    for (i = 0; i < ids.length; i++) { d = S.drones[ids[i]]; d.lon = d.flon + (d.tlon - d.flon) * k; d.lat = d.flat + (d.tlat - d.flat) * k; a = ((d.thd - d.fhd + 540) % 360) - 180; d.hd = (d.fhd + a * k + 360) % 360; }
    return k < 1;
  }
  function muniLevels(s) { var o = {}; if (s && s.kpis) s.kpis.municipalities.forEach(function (m) { o[m.id] = m.level; }); return o; }
  function dustFront(s) {
    if (!s || !s.dust || !s.dust.on) return null;
    var g = S.world.grid, cx = g.lon0 + g.nx * g.d / 2, cy = g.lat0 + g.ny * g.d / 2, to = (s.dust.deg + 180) * Math.PI / 180, ex = Math.sin(to), ey = Math.cos(to), f = s.dust.frontKm * 1000;
    var c = NN.offsetLL(cx, cy, ex * f, ey * f);
    return [NN.offsetLL(c[0], c[1], ey * 400000, -ex * 400000), NN.offsetLL(c[0], c[1], -ey * 400000, ex * 400000)];
  }
  function selectedAlert() { return S.sel ? S.alertsById[S.sel] || null : null; }
  function syncScene(force) {
    var map = S.map, nat = S.nat, s = S.snap; if (!map || !nat || !s) return;
    var sc = map.scene, t = s.t, sel = selectedAlert();
    sc.layers = S.layers; sc.units = S.units;
    sc.incidents = s.incidents.filter(function (i) { return i.status !== 'unseen'; });      // an event nobody has seen is invisible to the control room
    sc.closedEdges = s.closedEdges; sc.jamEdges = Object.keys(S.jams).map(function (e) { return { edge: +e, factor: S.jams[e] }; });
    sc.muniLevel = muniLevels(s); sc.selInc = sel && sel.incident ? sel.incident : null; sc.sel = null; sc.hover = S.hover; sc.rainCells = s.rain.cells;
    var d = s.dust; sc.dust = d && d.on ? { on: true, frontKm: d.frontKm, front: dustFront(s) } : { on: false };
    if (S.congDirty !== false || force || t - (S.congAt == null ? -1e9 : S.congAt) >= 300) {
      S.congDirty = false; S.congAt = t; S.cong = NN.congestionMap(nat); S.congKey = (S.congKey || 0) + 1; sc.cong = S.cong; sc.congKey = S.congKey; map.invalidate('roads');
    }
    if (S.layers.hazard !== 'off' && (force || S.fieldsAt !== Math.floor(t / 60) + ':' + (S.fieldsVer || 0))) { S.fieldsAt = Math.floor(t / 60) + ':' + (S.fieldsVer || 0); sc.fields = NN.fields(nat); sc.fieldsKey = S.fieldsAt; }
    if (!S.tunnels || force || (t - (S.tunnelsAt || 0) >= 60 && (s.rain.mmHr || s.rain.cells.length))) { S.tunnelsAt = t; S.tunnels = NN.floodState(nat, { all: true }).tunnels; }
    sc.tunnels = S.tunnels;
    sc.animating = sc.incidents.some(function (i) { return i.status !== 'cleared' && i.status !== 'cancelled'; }); sc.animate = true;
    map.dirty = true;
  }

  /* ====================================================================================
   * 6. THE LOG OF WHAT THE OPERATORS DO (comms + handover read it) and the engine's events
   * ==================================================================================== */
  // kind: operator | bus | robot | phone | system | reject | drone | alert
  function logOp(kind, ar, en, extra) {
    var s = S.snap, e = { id: ++S.opSeq, t: s ? s.t : 0, clock: s ? s.clock : '', wall: Date.now(), kind: kind, text: { ar: ar, en: en }, op: true };
    if (extra) for (var k in extra) e[k] = extra[k];
    S.oplog.push(e); if (S.oplog.length > 800) S.oplog.splice(0, S.oplog.length - 800);
    CR.emit('oplog', e); S.dirtyUI = true;
    return e;
  }
  function decision(type, ar, en, extra) {
    var s = S.snap, e = { t: s ? s.t : 0, clock: s ? s.clock : '', type: type, role: S.role, text: { ar: ar, en: en } };
    if (extra) for (var k in extra) e[k] = extra[k];
    S.decisions.push(e); return e;
  }
  var EV_NOTE = { 'dispatch-approved': 1, dispatched: 1, 'unit-on-scene': 1, redispatch: 1, 'incident-cleared': 1, 'drone-fault': 1, 'drone-relaunch': 1, 'false-alarm-dispatch': 1, 'false-alarm-on-scene': 1, 'drone-low-battery': 1, 'alert-dismissed': 1 };
  function drainEvents() {
    var nat = S.nat, ev = nat.events, any = false;
    for (; S.evIdx < ev.length; S.evIdx++) {
      var e = ev[S.evIdx];
      if (EV_NOTE[e.type]) { any = true; var o = { id: ++S.opSeq, t: e.t, clock: e.clock, wall: Date.now(), kind: 'system', text: e.text, op: true, ev: e.type, alert: e.alert || null, inc: e.incident || null }; S.oplog.push(o); if (e.type === 'redispatch' || e.type === 'drone-fault' || e.type === 'false-alarm-dispatch') showBanner(e); }
    }
    if (S.oplog.length > 800) S.oplog.splice(0, S.oplog.length - 800);
    if (any) S.dirtyUI = true;
  }
  function showBanner(e) { S.banner = { type: e.type, text: e.text, t: e.t, clock: e.clock, at: now() }; live((e.type === 'redispatch' ? B('إعادة إرسال تلقائية: ', 'Automatic re-dispatch: ') : B('تنبيه: ', 'Notice: ')) + nm(e.text)); CR.emit('banner', S.banner); }

  /* ====================================================================================
   * 7. ANNOUNCEMENTS (aria-live), TOASTS, SOUND
   * ==================================================================================== */
  var liveT = 0, liveLast = '';
  function live(text) {
    var el = $('#cr-live'); if (!el || !text) return;
    if (text === liveLast && now() - liveT < 1500) return;
    liveLast = text; liveT = now();
    el.textContent = ''; setTimeout(function () { el.textContent = text; }, 30);
  }
  function toast(text, kind, ms) { try { win.Manara.toast(typeof text === 'string' ? { ar: text, en: text } : text, kind, ms || 4200); } catch (e) { /* ignore */ } }
  var Snd = { ctx: null, on: false };
  function tone(f, t0, dur, gain) {
    var c = Snd.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.07, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function chime(kind) {                                   // calm, short, never harsh: two rising notes for a new alert, three for a critical one, one soft note for good news
    if (!Snd.on || !Snd.ctx) return; var t = Snd.ctx.currentTime + 0.02;
    try {
      if (kind === 'critical') { tone(587, t, 0.2); tone(740, t + 0.2, 0.2); tone(988, t + 0.4, 0.3); }
      else if (kind === 'ok') tone(784, t, 0.28, 0.05);
      else if (kind === 'warn') { tone(660, t, 0.18); tone(494, t + 0.18, 0.28); }
      else { tone(660, t, 0.18); tone(880, t + 0.18, 0.26); }
    } catch (e) { /* ignore */ }
  }
  function soundSet(on) {
    if (on) {
      try { var AC = win.AudioContext || win.webkitAudioContext; if (!AC) { Snd.on = false; return false; } if (!Snd.ctx) Snd.ctx = new AC(); if (Snd.ctx.state === 'suspended') Snd.ctx.resume(); Snd.on = true; chime('ok'); } catch (e) { Snd.on = false; return false; }
    } else Snd.on = false;
    CR.emit('sound', Snd.on); return Snd.on;
  }
  Object.assign(CR, { live: live, toast: toast, chime: chime, soundSet: soundSet, sound: function () { return Snd.on; }, logOp: logOp, decision: decision, selectedAlert: selectedAlert, reset: reset, takeSnapshot: takeSnapshot, syncScene: syncScene, setAutopilot: setAutopilot });

  /* ====================================================================================
   * 8. ALERTS: new arrivals, operator actions with role gating
   * ==================================================================================== */
  function alertOf(id) { return id ? S.alertsById[id] || null : null; }
  function isFinal(a) { return a.state === 'RESOLVED' || a.state === 'DISMISSED'; }
  function placeLine(a) {
    var p = a.place, mu = a.muni && S.world ? S.world.municipalities.filter(function (m) { return m.id === a.muni; })[0] : null;
    var near = p ? nm(p.name) : (mu ? nm(mu.name) : B('قطر', 'Qatar'));
    return { place: near, dist: p ? p.distKm : null, muni: mu ? nm(mu.name) : '', line: B('قرب ', 'Near ') + near + (p && isNum(p.distKm) ? ' · ' + N(p.distKm, 1) + B(' كم', ' km') : '') };
  }
  CR.alertOf = alertOf; CR.isFinal = isFinal; CR.placeLine = placeLine;
  function detectNewAlerts() {
    var any = false;
    S.alerts.forEach(function (a) {
      var seen = S.seen[a.id];
      if (!seen) {
        S.seen[a.id] = { state: a.state, verdict: a.verdict, droneId: a.droneId, t: now() }; any = true;
        S.lastNew = a.id;
        var src = SRC[a.source] || SRC.operator, pl = placeLine(a), crit = a.level === 'critical' || a.level === 'high';
        toast({ ar: 'إنذار جديد ' + a.id + ' (' + src.ar + '): ' + nm0(a.hazardName, 'ar') + ' — ' + plainPlace(a, 'ar'), en: 'New alert ' + a.id + ' (' + src.en + '): ' + nm0(a.hazardName, 'en') + ' — ' + plainPlace(a, 'en') }, crit ? 'danger' : 'warn', 5200);
        chime(crit ? 'critical' : 'alert');
        live(B('إنذار جديد: ', 'New alert: ') + hzName(a.hazard) + ' — ' + pl.line + ' — ' + nm(a.sourceName));
        CR.emit('alert-new', a);
        if (a.source === 'drone' && a.droneAlerts && a.droneAlerts.length) { /* the drone-alert bus message is published below */ }
      } else {
        if (seen.verdict !== a.verdict && a.verdict) {
          seen.verdict = a.verdict;
          var vt = a.verdictText ? nm(a.verdictText) : a.verdict;
          toast({ ar: 'تحقق المسيّرة للإنذار ' + a.id + ': ' + (a.verdictText ? a.verdictText.ar : a.verdict), en: 'Drone verification for ' + a.id + ': ' + (a.verdictText ? a.verdictText.en : a.verdict) }, a.verdict === 'confirmed' ? 'danger' : 'warn', 4800);
          chime(a.verdict === 'confirmed' ? 'critical' : 'warn'); live(vt + ' — ' + a.id);
          CR.emit('verdict', a);
        }
        if (seen.state !== a.state) {
          seen.state = a.state;
          if (a.state === 'ON-SCENE' || a.state === 'RESOLVED') live(B('الإنذار ', 'Alert ') + a.id + ': ' + nm(a.stateName));
          CR.emit('alert-state', a);
        }
        seen.droneId = a.droneId;
      }
    });
    return any;
  }
  function nm0(o, l) { return o ? (o[l] || o.ar || o.en) : ''; }
  function plainPlace(a, l) { var p = a.place ? a.place.name : null; return p ? (l === 'ar' ? 'قرب ' + (p.ar || p.en) : 'near ' + (p.en || p.ar)) : (l === 'ar' ? 'قطر' : 'Qatar'); }

  // ---- role gating: the roles are SIMULATED labels (no real login); a rejection is visible, spoken, logged and counted
  function can(minRole) { return roleOf(S.role).rank >= roleOf(minRole).rank; }
  function need(minRole, whatAr, whatEn) {
    if (can(minRole)) return true;
    var r = roleOf(S.role), m = roleOf(minRole);
    var ar = 'دور «' + r.ar + '» لا يستطيع ' + whatAr + ' — يلزم دور «' + m.ar + '» (أدوار محاكاة، لا تسجيل دخول حقيقي)', en = 'The ' + r.en + ' role cannot ' + whatEn + ' — it needs the ' + m.en + ' role (simulated roles, no real login)';
    S.rejects++; logOp('reject', ar, en, { need: minRole, role: S.role }); decision('rejected', ar, en);
    toast({ ar: ar, en: en }, 'warn', 5200); chime('warn'); live(B(ar, en));
    CR.emit('reject', { need: minRole, role: S.role });
    return false;
  }
  CR.can = can; CR.need = need;
  function setRole(id, silent) {
    var r = roleOf(id); if (r.id !== id) return false;
    var changed = S.role !== id; S.role = id;
    if (changed && !silent) { logOp('operator', 'تغيّر الدور المحاكى إلى «' + r.ar + '»', 'Simulated role changed to “' + r.en + '”'); decision('role', 'الدور: ' + r.ar, 'Role: ' + r.en); live(B('الدور الآن: ', 'Role is now: ') + nm(r)); }
    S.dirtyUI = true; CR.emit('role', id); return true;
  }
  var REASON = { 'none-available': ['لا توجد مسيّرة متاحة الآن', 'No drone is available right now'], 'out-of-range': ['الموقع خارج مدى أي مسيّرة', 'The location is out of range of every drone'], 'alert-closed': ['الإنذار مغلق', 'The alert is closed'], 'unknown-drone': ['مسيّرة غير معروفة', 'Unknown drone'], 'unknown-alert': ['إنذار غير معروف', 'Unknown alert'],
    'not-on-station': ['المسيّرة ليست في الموقع بعد', 'The drone is not on station yet'], 'unknown-message': ['رسالة غير معروفة', 'Unknown message'], 'bad-target': ['هدف غير صالح', 'Invalid target'], 'battery': ['البطارية لا تكفي', 'Not enough battery'], 'wind': ['الريح قوية للإقلاع', 'Too windy to launch'], 'heat': ['حرارة أعلى من حد الإقلاع', 'Too hot to launch'], 'busy': ['المسيّرة مشغولة', 'The drone is busy'], 'charging': ['المسيّرة تُشحن', 'The drone is charging'], 'fault': ['المسيّرة معطّلة', 'The drone has a fault'] };
  function reasonText(r) { var x = REASON[r]; return x ? B(x[0], x[1]) : String(r || ''); }
  CR.reasonText = reasonText;

  function approveAlert(id, o) {
    o = o || {}; var a = alertOf(id || S.sel); if (!a) return { ok: false, reason: 'unknown-alert' };
    if (!need('operator', 'اعتماد إنذار', 'approve an alert')) return { ok: false, reason: 'role', code: 'role' };
    if (isFinal(a) || STATE_RANK[a.state] >= 2) { toast({ ar: 'الإنذار ' + a.id + ' ليس بانتظار موافقة (الحالة: ' + a.stateName.ar + ')', en: 'Alert ' + a.id + ' is not waiting for approval (state: ' + a.stateName.en + ')' }, 'warn'); return { ok: false, reason: 'state' }; }
    if (a.state === 'SUSPECT' && !o.force && !S.autopilot) {                          // one key only: proof before panic asks twice
      var c = S.confirmApprove[a.id];
      if (!c || now() - c > 5000) { S.confirmApprove[a.id] = now(); S.dirtyUI = true; live(B('إنذار غير مؤكَّد: اضغط «وافق» مرة أخرى للتأكيد', 'Not confirmed yet: press Approve again to confirm')); CR.emit('confirm-approve', a); return { ok: false, reason: 'confirm', confirm: true }; }
    }
    delete S.confirmApprove[a.id];
    var ok = NN.approveAlert(S.nat, a.id);
    if (!ok) { toast({ ar: 'تعذّر اعتماد الإنذار ' + a.id, en: 'Alert ' + a.id + ' could not be approved' }, 'danger'); return { ok: false, reason: 'engine' }; }
    var ar = 'اعتمد المشغّل الإنذار ' + a.id + ' (' + hzName0(a, 'ar') + ') — المفتاح البشري' + (a.state === 'SUSPECT' ? ' (بمفتاح واحد فقط)' : ''), en = 'The operator approved alert ' + a.id + ' (' + hzName0(a, 'en') + ') — the human key' + (a.state === 'SUSPECT' ? ' (one key only)' : '');
    logOp('operator', ar, en, { alert: a.id, inc: a.incident }); decision('approve', ar, en, { alert: a.id, afterSec: Math.round(S.snap.t - a.t), unverified: a.state === 'SUSPECT' });
    takeSnapshot(true); drainEvents(); publishAll(true); syncScene(); S.dirtyUI = true; chime('ok'); live(B(ar, en));
    CR.emit('approved', a);
    return { ok: true };
  }
  function hzName0(a, l) { var n = NN.HAZARD_NAME[a.hazard] || NN.HAZARD_NAME.sos; return n[l]; }
  function dismissAlert(id) {
    var a = alertOf(id || S.sel); if (!a) return { ok: false, reason: 'unknown-alert' };
    if (!need('operator', 'رفض إنذار', 'dismiss an alert')) return { ok: false, reason: 'role', code: 'role' };
    var ok = NN.dismissAlert(S.nat, a.id);
    if (!ok) { toast({ ar: 'لا يمكن رفض الإنذار ' + a.id + ' بعد اعتماده أو إغلاقه', en: 'Alert ' + a.id + ' cannot be dismissed once approved or closed' }, 'warn'); return { ok: false, reason: 'state' }; }
    var ar = 'رفض المشغّل الإنذار ' + a.id + ' (' + hzName0(a, 'ar') + ') بعد مراجعة الدليل', en = 'The operator dismissed alert ' + a.id + ' (' + hzName0(a, 'en') + ') after reviewing the evidence';
    logOp('operator', ar, en, { alert: a.id }); decision('dismiss', ar, en, { alert: a.id, truth: a.sim ? a.sim.truth : null });
    takeSnapshot(true); drainEvents(); publishAll(true); syncScene(); S.dirtyUI = true; live(B(ar, en));
    CR.emit('dismissed', a);
    return { ok: true };
  }
  function escalateAlert(id) {
    var a = alertOf(id || S.sel); if (!a) return { ok: false, reason: 'unknown-alert' };
    if (!need('operator', 'تصعيد إنذار', 'escalate an alert')) return { ok: false, reason: 'role', code: 'role' };
    var ok = NN.escalateAlert(S.nat, a.id);
    if (!ok) return { ok: false, reason: 'state' };
    var ar = 'صعّد المشغّل الإنذار ' + a.id + ' إلى أعلى أولوية (قرار بشري)', en = 'The operator escalated alert ' + a.id + ' to top priority (a human decision)';
    logOp('operator', ar, en, { alert: a.id }); decision('escalate', ar, en, { alert: a.id });
    takeSnapshot(true); syncScene(); S.dirtyUI = true; live(B(ar, en)); CR.emit('escalated', a);
    return { ok: true };
  }
  function launchDrone(id, droneId) {
    var a = alertOf(id || S.sel); if (!a) return { ok: false, reason: 'unknown-alert' };
    if (!need('operator', 'إطلاق مسيّرة', 'launch a drone')) return { ok: false, reason: 'role', code: 'role' };
    var r = NN.launchDrone(S.nat, droneId || 'nearest', { lon: a.lon, lat: a.lat, hazard: a.hazard, incident: a.incident, alert: a.id }, { by: 'operator' });
    if (!r.ok) { toast({ ar: 'لم تُطلق مسيّرة: ' + (REASON[r.reason] ? REASON[r.reason][0] : r.reason), en: 'No drone launched: ' + (REASON[r.reason] ? REASON[r.reason][1] : r.reason) }, 'warn'); return r; }
    var ar = 'أطلق المشغّل ' + r.drone.name.ar + ' للتحقق من ' + a.id + ' — وصول بعد ' + mmss(r.etaSec), en = 'The operator launched ' + r.drone.name.en + ' to verify ' + a.id + ' — on station in ' + mmss(r.etaSec);
    decision('launch', ar, en, { alert: a.id, drone: r.droneId }); live(B(ar, en)); takeSnapshot(true); syncScene(); S.dirtyUI = true; CR.emit('launched', r);
    return r;
  }
  function recallDrone(droneId) {
    if (!need('operator', 'استدعاء مسيّرة', 'recall a drone')) return { ok: false, reason: 'role', code: 'role' };
    var ok = NN.recallDrone(S.nat, droneId);
    if (ok) { decision('recall', 'استدعاء ' + droneId, 'Recalled ' + droneId); takeSnapshot(true); S.dirtyUI = true; }
    else toast({ ar: 'لا يمكن استدعاء هذه المسيّرة الآن', en: 'This drone cannot be recalled right now' }, 'warn');
    return { ok: ok };
  }
  function announceVia(droneId, key, lng) {
    if (!need('operator', 'البثّ للسكان عبر مسيّرة', 'announce to residents through a drone')) return { ok: false, reason: 'role', code: 'role' };
    var r = NN.announce(S.nat, droneId, key, lng);
    if (!r.ok) { toast({ ar: 'تعذّر البثّ: ' + (REASON[r.reason] ? REASON[r.reason][0] : r.reason), en: 'Announcement failed: ' + (REASON[r.reason] ? REASON[r.reason][1] : r.reason) }, 'warn'); return r; }
    decision('announce', 'بثّ صوتي عبر ' + droneId + ' (' + (lng === 'ar' ? 'العربية' : 'الإنجليزية') + ')', 'Voice announcement via ' + droneId + ' (' + (lng === 'ar' ? 'Arabic' : 'English') + ')', { drone: droneId, key: key, lang: lng });
    takeSnapshot(true); S.dirtyUI = true; CR.emit('announced', { drone: droneId, key: key, lang: lng, text: r.text });
    return r;
  }
  function placeAlarm(o) {
    o = o || {};
    if (!need('operator', 'إنشاء إنذار تجريبي', 'raise a simulated alarm')) return null;
    if (!isNum(o.lon) || !isNum(o.lat) || !onLand(o.lon, o.lat)) { toast({ ar: 'اختر نقطة على اليابسة داخل قطر', en: 'Pick a point on land inside Qatar' }, 'warn'); return null; }
    var inc = NN.createIncident(S.nat, { hazard: o.hazard || S.hazardTool, lon: o.lon, lat: o.lat, severity: o.severity || 2, trigger: o.trigger || 'sentinel' });
    if (!inc) return null;
    if (inc.status === 'cancelled') { toast({ ar: 'الموقع بعيد عن أي طريق في البيانات', en: 'That spot is too far from any road in the data' }, 'warn'); return null; }
    logOp('operator', 'أنشأ المشغّل إنذارًا تجريبيًا (' + hzName0({ hazard: inc.hazard }, 'ar') + ')', 'The operator raised a simulated alarm (' + hzName0({ hazard: inc.hazard }, 'en') + ')', { inc: inc.id });
    takeSnapshot(true); drainEvents(); syncScene(); S.dirtyUI = true; detectNewAlerts(); return inc;
  }
  function onLand(lon, lat) { try { return !!GEO.inLand(lon, lat); } catch (e) { return true; } }
  Object.assign(CR, { setRole: setRole, approveAlert: approveAlert, dismissAlert: dismissAlert, escalateAlert: escalateAlert, launchDrone: launchDrone, recallDrone: recallDrone, announceVia: announceVia, placeAlarm: placeAlarm, onLand: onLand });

  /* ====================================================================================
   * 9. THE BUS (Manara.link): the phones (alert.html) react; scope 'national', sim:true.  Proof before panic: a public alert is sent ONLY after the human key.
   * ==================================================================================== */
  function busSend(msg, counter, ar, en) {
    if (!win.Manara || !win.Manara.link) return null;
    msg.sim = true; msg.exercise = true;
    var sent = null; try { sent = win.Manara.link.send(msg); } catch (e) { return null; }
    if (counter) S.bus[counter]++;
    if (ar) { var e = logOp('bus', ar, en, { msgType: msg.type }); S.busLog.push({ type: msg.type, id: msg.id || null, t: S.snap ? S.snap.t : 0, clock: S.snap ? S.snap.clock : '' }); if (S.busLog.length > 200) S.busLog.shift(); return e; }
    return sent;
  }
  function areaOf(a) { var pl = a.place ? a.place.name : null; return pl ? { ar: 'قرب ' + (pl.ar || pl.en) + ' (محاكاة)', en: 'Near ' + (pl.en || pl.ar) + ' (simulation)' } : { ar: 'قطر (محاكاة)', en: 'Qatar (simulation)' }; }
  function publishIncident(inc, force) {
    var plan = inc.plan, st = plan ? plan.state : 'recommended', rec = S.pub[inc.id] || (S.pub[inc.id] = { alert: false, clear: false, dsig: '', dAt: 0, radius: 0 }), tn = now();
    var ended = inc.status === 'cleared' || inc.status === 'cancelled';
    var al = S.alerts.filter(function (x) { return x.incident === inc.id; })[0] || null, pr = al ? { id: inc.id, hazard: inc.hazard, muni: inc.muni, place: inc.place ? inc.place.name : null } : { id: inc.id, hazard: inc.hazard };
    if (ended) {
      if (rec.alert && !rec.clear) {
        rec.clear = true;
        busSend({ type: 'alert-clear', id: 'A-' + inc.id, scope: 'national', incident: { id: inc.id } }, 'clear', 'إلى الهواتف: إنهاء إنذار ' + inc.id, 'To the phones: alert ' + inc.id + ' cleared');
        busSend({ type: 'dispatch', scope: 'national', id: plan ? plan.id : 'D-' + inc.id, state: 'cleared', origin: 'manara', scene: { node: 'NAT', lon: inc.lon, lat: inc.lat }, incident: pr, units: [], hospital: null }, 'dispatch');
      }
      return;
    }
    if (st === 'recommended' || !plan) return;                                            // proof before panic: an unapproved recommendation never reaches a resident
    if (!rec.alert || force && !rec.alert) {
      rec.alert = true; rec.clear = false; rec.radius = inc.radiusM;
      busSend({ type: 'alert', scope: 'national', id: 'A-' + inc.id, hazard: inc.hazard, level: LEVEL_OF[inc.hazard] || 'watch', area: al ? areaOf(al) : { ar: 'قطر (محاكاة)', en: 'Qatar (simulation)' }, at: { lon: inc.lon, lat: inc.lat }, radiusM: Math.max(100, Math.round(inc.radiusM)), incident: pr, hour: S.snap ? S.snap.hour : null, clock: S.snap ? S.snap.clock : '', origin: 'manara', alertId: al ? al.id : null },
        'alert', 'إلى الهواتف: إنذار عام (' + hzName0({ hazard: inc.hazard }, 'ar') + ') — ' + (LEVEL_OF[inc.hazard] === 'evacuate' ? 'إخلاء' : LEVEL_OF[inc.hazard] === 'shelter' ? 'احتماء' : 'ترقّب'), 'To the phones: PUBLIC ALERT (' + hzName0({ hazard: inc.hazard }, 'en') + ') — ' + (LEVEL_OF[inc.hazard] || 'watch'));
    } else if (Math.abs(inc.radiusM - rec.radius) > Math.max(30, rec.radius * 0.25)) {
      rec.radius = inc.radiusM;
      busSend({ type: 'alert-update', scope: 'national', id: 'A-' + inc.id, hazard: inc.hazard, level: LEVEL_OF[inc.hazard] || 'watch', area: al ? areaOf(al) : { ar: 'قطر (محاكاة)', en: 'Qatar (simulation)' }, at: { lon: inc.lon, lat: inc.lat }, radiusM: Math.max(100, Math.round(inc.radiusM)), incident: pr, origin: 'manara' }, 'alert');
    }
    var sig = plan.state + '|' + plan.units.map(function (u) { return u.state + ':' + (u.unitId || '') + ':' + Math.round((u.etaSec || 0) / 60); }).join(',');
    if ((sig !== rec.dsig && tn - rec.dAt > 1200) || (force && sig !== rec.dsig)) {
      rec.dsig = sig; rec.dAt = tn;
      try { var m = NN.busDispatch(S.nat, inc.id); if (m) { m.exercise = true; busSend(m, 'dispatch', 'إلى الهواتف: خطة الإرسال ' + m.id + ' (' + m.state + ')', 'To the phones: dispatch plan ' + m.id + ' (' + m.state + ')'); } } catch (e) { /* ignore */ }
    }
  }
  function publishDroneAlerts() {
    var das = S.snap.droneAlerts || [];
    das.forEach(function (da) {
      var k = da.id + ':' + da.stage + ':' + da.outcome;
      if (S.daSeen[k]) return; S.daSeen[k] = 1;
      try { var m = NN.busDroneAlert(S.nat, da.id); if (m) busSend(m, 'droneAlert', 'إلى الشبكة: إنذار مسيّرة ' + da.id + ' (' + (da.stage === 'sighting' ? 'رصد' : 'تحقق') + ')', 'On the bus: drone alert ' + da.id + ' (' + da.stage + ')'); } catch (e) { /* ignore */ }
    });
  }
  function publishStatus(force) {
    var tn = now(); if (!force && tn - S.statusAt < 2500) return;
    var active = S.snap.drones.some(function (d) { return d.state !== 'docked' && d.state !== 'charging'; });
    if (!active && !force) return;
    S.statusAt = tn;
    try { var m = NN.busDroneStatus(S.nat); if (m) busSend(m, 'droneStatus'); } catch (e) { /* ignore */ }
  }
  var advSig = '';
  function publishAdvisory(force) {
    var m; try { m = NN.busAdvisory(S.nat); } catch (e) { return; }
    var sig = m.items.map(function (i) { return i.key + ':' + i.level + ':' + (i.muni || ''); }).join('|');
    if (sig === advSig && !force) return;
    var had = advSig !== ''; advSig = sig; if (!m.items.length && !had) return;
    busSend(m, 'advisory');
  }
  function publishAll(force) {
    if (!S.nat || !S.snap) return;
    S.snap.incidents.forEach(function (inc) { if (inc.status !== 'unseen') publishIncident(inc, force); });
    publishDroneAlerts(); publishStatus(false); publishAdvisory(false);
  }
  function clearPublished() {
    if (!win.Manara || !win.Manara.link) return;
    Object.keys(S.pub).forEach(function (id) { if (S.pub[id].alert && !S.pub[id].clear) { try { win.Manara.link.send({ type: 'alert-clear', id: 'A-' + id, scope: 'national', incident: { id: id }, sim: true }); } catch (e) { /* ignore */ } S.pub[id].clear = true; } });
  }
  // messages the console LISTENS to: 'citizen' (the phones answer) and 'detection' (the Evidence Lab)
  function onBus(m) {
    if (!m || typeof m !== 'object' || !S.snap) return;
    if (m.type === 'citizen' && typeof m.id === 'string') {
      var mm = /^(?:nat|A)-(.+)$/.exec(m.id), inc = mm ? S.snap.incidents.filter(function (i) { return i.id === mm[1]; })[0] : null;
      if (m.status !== 'ack' && m.status !== 'safe' && m.status !== 'help') return;
      var room = m.room ? ' (' + String(m.room).slice(0, 12) + ')' : '', key = inc ? inc.id : String(m.id).slice(0, 16), c = S.checkins[key] || (S.checkins[key] = { ack: 0, safe: 0, help: 0 });
      c[m.status]++; S.phone[m.status]++;
      var al = inc ? S.alerts.filter(function (x) { return x.incident === inc.id; })[0] : null;
      logOp('phone', m.status === 'safe' ? 'هاتف' + room + ': «أنا بأمان» — ' + key : m.status === 'help' ? 'هاتف' + room + ': «أحتاج مساعدة» — ' + key + ' (حوّلها إلى 999)' : 'هاتف' + room + ': «أنا مستيقظ» — ' + key,
        m.status === 'safe' ? 'Phone' + room + ': “I’m safe” — ' + key : m.status === 'help' ? 'Phone' + room + ': “I need help” — ' + key + ' (hand it to 999)' : 'Phone' + room + ': “I’m awake” — ' + key, { alert: al ? al.id : null, inc: key, status: m.status });
      if (m.status === 'help') { toast({ ar: 'مقيم يطلب المساعدة (' + key + ') — حوّلها إلى 999', en: 'A resident needs help (' + key + ') — hand it to 999' }, 'danger'); chime('critical'); }
      live(m.status === 'safe' ? B('مقيم بأمان', 'A resident is safe') : m.status === 'help' ? B('مقيم يحتاج مساعدة', 'A resident needs help') : B('مقيم مستيقظ', 'A resident is awake'));
      CR.emit('phone', m);
    } else if (m.type === 'detection' && m.from !== 'control.html') {
      var st = ['suspect', 'fire', 'smoke', 'clear'].indexOf(m.state) >= 0 ? m.state : 'clear';
      var d = { t: S.snap.t, clock: S.snap.clock, source: String(m.source || 'camera').slice(0, 12), state: st, confidence: isNum(m.confidence) ? clamp(m.confidence, 0, 1) : 0 };
      S.detections.push(d); if (S.detections.length > 30) S.detections.shift();
      var ar = 'مختبر الأدلة: كاشف الرؤية الحاسوبية (قواعد) → ' + (st === 'fire' ? 'نار' : st === 'smoke' ? 'دخان' : st === 'suspect' ? 'اشتباه' : 'سليم') + ' (ثقة ' + Math.round(d.confidence * 100) + '٪)', en = 'Evidence Lab: rule-based computer-vision detector → ' + st + ' (confidence ' + Math.round(d.confidence * 100) + ' %)';
      logOp('system', ar, en, { detection: st });
      if (st === 'fire' || st === 'suspect') { toast({ ar: ar, en: en }, st === 'fire' ? 'danger' : 'warn'); chime(st === 'fire' ? 'critical' : 'alert'); }
      CR.emit('detection', d);
    }
  }
  Object.assign(CR, { busSend: busSend, publishAll: publishAll, clearPublished: clearPublished });

  /* ====================================================================================
   * 10. SELECTION AND CAMERA
   * ==================================================================================== */
  function bboxOf(pts, minKm) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (p) { if (!p) return; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, kLat = 111.2, kLon = 111.2 * Math.cos(cy * Math.PI / 180), w = Math.max(x1 - x0, (minKm || 2.5) / kLon), hh = Math.max(y1 - y0, (minKm || 2.5) / kLat);
    return { lonMin: cx - w * 0.6, lonMax: cx + w * 0.6, latMin: cy - hh * 0.6, latMax: cy + hh * 0.6 };
  }
  function flyToAlert(a, ms) {
    if (!S.map || !a) return;
    var pts = [[a.lon, a.lat]], dr = a.droneId ? S.drones[a.droneId] : null;
    if (dr && dr.row && dr.row.state !== 'docked' && dr.row.state !== 'charging') pts.push([dr.lon, dr.lat]);
    S.map.fitBounds(bboxOf(pts, 2.2), S.view === 'map' || !isNarrow() ? 70 : 40, ms == null ? 700 : ms);
  }
  function isNarrow() { return html.clientWidth < 1100; }
  function selectAlert(id, o) {
    o = o || {}; var a = id ? alertOf(id) : null;
    S.sel = a ? a.id : null;
    if (a && a.droneId) S.selDrone = a.droneId;
    if (a && o.fly !== false) flyToAlert(a, o.ms);
    syncScene(); S.dirtyUI = true; CR.emit('select', a);
    if (a) live(B('محدد: ', 'Selected: ') + hzName(a.hazard) + ' — ' + a.id + ' — ' + placeLine(a).line);
    return a;
  }
  function cycleSelection(dir) {
    var open = S.alerts.filter(function (a) { return !isFinal(a); }); if (!open.length) return;
    var ix = -1; open.forEach(function (a, i) { if (a.id === S.sel) ix = i; });
    var nx = open[(ix + dir + open.length) % open.length]; if (ix < 0) nx = dir > 0 ? open[0] : open[open.length - 1];
    selectAlert(nx.id);
  }
  Object.assign(CR, { selectAlert: selectAlert, cycleSelection: cycleSelection, flyToAlert: flyToAlert, bboxOf: bboxOf, isNarrow: isNarrow, setSelDrone: function (id) { S.selDrone = id; S.dirtyUI = true; CR.emit('select-drone', id); } });

  /* ====================================================================================
   * 11. THE MAP OVERLAY: drones (heading, trail, coverage, docks), alerts nobody dispatched yet, robot badge
   * ==================================================================================== */
  function hazardGlyph(ctx, hz, s) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1.4, s * 0.17);
    var TAU = Math.PI * 2;
    switch (hz) {
      case 'fire': ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.bezierCurveTo(s * 0.45, -s * 0.12, s * 0.38, s * 0.38, 0, s * 0.45); ctx.bezierCurveTo(-s * 0.38, s * 0.38, -s * 0.45, -s * 0.03, -s * 0.11, -s * 0.21); ctx.bezierCurveTo(-s * 0.1, -s * 0.31, -s * 0.03, -s * 0.38, 0, -s * 0.5); ctx.closePath(); ctx.fill(); break;
      case 'gas': ctx.beginPath(); ctx.arc(-s * 0.3, s * 0.1, s * 0.3, 0, TAU); ctx.arc(s * 0.12, -s * 0.12, s * 0.34, 0, TAU); ctx.arc(s * 0.28, s * 0.22, s * 0.26, 0, TAU); ctx.fill(); break;
      case 'flood': for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.55, i * s * 0.34); ctx.quadraticCurveTo(-s * 0.28, i * s * 0.34 - s * 0.2, 0, i * s * 0.34); ctx.quadraticCurveTo(s * 0.28, i * s * 0.34 + s * 0.2, s * 0.55, i * s * 0.34); ctx.stroke(); } break;
      case 'dust': ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.28); ctx.lineTo(s * 0.25, -s * 0.28); ctx.moveTo(-s * 0.55, s * 0.02); ctx.lineTo(s * 0.5, s * 0.02); ctx.moveTo(-s * 0.55, s * 0.32); ctx.lineTo(s * 0.1, s * 0.32); ctx.stroke(); break;
      case 'heat': ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.lineTo(0, -s * 0.5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, s * 0.4, s * 0.3, 0, TAU); ctx.fill(); break;
      default: ctx.beginPath(); ctx.rect(-s * 0.17, -s * 0.55, s * 0.34, s * 1.1); ctx.rect(-s * 0.55, -s * 0.17, s * 1.1, s * 0.34); ctx.fill();
    }
    ctx.restore();
  }
  function drawDroneGlyph(ctx, r, hdDeg, state, selected) {
    var tok = DRONE_COLOR[state] || 'accent', col = C(tok);
    ctx.save(); ctx.rotate(hdDeg * Math.PI / 180);
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(C('bg'), 0.9); ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke();
    ctx.strokeStyle = rgba(col); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { ctx.beginPath(); ctx.arc(q[0] * r, q[1] * r, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(col); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, -r * 1.35); ctx.lineTo(r * 0.38, -r * 0.55); ctx.lineTo(-r * 0.38, -r * 0.55); ctx.closePath(); ctx.fillStyle = rgba(col); ctx.fill();         // the nose: the heading
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = rgba(col); ctx.fill();
    ctx.restore();
    if (selected) { ctx.beginPath(); ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeStyle = rgba(C('head')); ctx.stroke(); ctx.setLineDash([]); }
  }
  function drawOverlay(ts) {
    var ctx = S.ovCtx, map = S.map, W = S.ovW, H = S.ovH; if (!ctx || !map || !S.snap) return;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    S.ovHits.length = 0;
    var ppk = map.ppk(), L = S.layers, anim = !reduced(), sel = selectedAlert(), i, d, r, xy, ids, dim = 0;
    ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    // 1. alerts that have no incident (a drone sighting, a look-alike, a patrol detection): a marker with the hazard glyph
    S.alerts.forEach(function (a) {
      if (isFinal(a) && S.sel !== a.id) return;
      var hasInc = a.incident && S.snap.incidents.some(function (n) { return n.id === a.incident && n.status !== 'unseen'; });
      if (hasInc && S.sel !== a.id) return;
      xy = map.toScreen(a.lon, a.lat); if (xy[0] < -30 || xy[0] > W + 30 || xy[1] < -30 || xy[1] > H + 30) return;
      var tk = (HZ[a.hazard] || HZ.sos).tok, c1 = C(tk), isSel = S.sel === a.id, pulse = anim && !isFinal(a) ? (ts / 1000 * 0.8) % 1 : 0.4;
      if (!hasInc) {
        ctx.save(); ctx.translate(xy[0], xy[1]);
        if (!isFinal(a)) { ctx.beginPath(); ctx.arc(0, 0, 12 + pulse * 14, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = rgba(c1, (1 - pulse) * 0.7); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(12, 0); ctx.lineTo(0, 13); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fillStyle = rgba(c1, isFinal(a) ? 0.5 : 1); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
        hazardGlyph(ctx, a.hazard, 9.5);
        ctx.restore();
      }
      if (isSel) { ctx.save(); ctx.translate(xy[0], xy[1]); ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.lineWidth = 2.6; ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(C('head')); ctx.stroke(); ctx.restore(); }
      S.ovHits.push({ type: 'alert', id: a.id, x: xy[0], y: xy[1], r: 17 });
      if (!hasInc || isSel) { ctx.font = '800 11px ' + MONO; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = rgba(C('bg'), 0.85); ctx.strokeText(a.id, xy[0], xy[1] - 26); ctx.fillStyle = rgba(C('head')); ctx.fillText(a.id, xy[0], xy[1] - 26); }
    });
    if (!L.drones) return;
    ids = Object.keys(S.drones);
    // 2. docks (the pad of every docked or charging drone) and the drones themselves
    for (i = 0; i < ids.length; i++) {
      d = S.drones[ids[i]]; r = d.row; if (!r) continue;
      var active = r.state !== 'docked' && r.state !== 'charging', isSelD = S.selDrone === r.id;
      if (!active) {
        xy = map.toScreen(r.dock.lon, r.dock.lat); if (xy[0] < -10 || xy[0] > W + 10 || xy[1] < -10 || xy[1] > H + 10) continue;
        if (L.docks) { ctx.save(); ctx.translate(xy[0] + 7, xy[1] - 7); ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(4.5, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-4.5, 0); ctx.closePath(); ctx.fillStyle = rgba(C('surface'), 0.95); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(r.state === 'fault' ? C('danger') : C('accent'), r.state === 'charging' ? 0.55 : 0.95); ctx.stroke(); ctx.restore(); }
        S.ovHits.push({ type: 'drone', id: r.id, x: xy[0] + 7, y: xy[1] - 7, r: 9 });
        continue;
      }
    }
    for (i = 0; i < ids.length; i++) {
      d = S.drones[ids[i]]; r = d.row; if (!r || r.state === 'docked' || r.state === 'charging') continue;
      xy = map.toScreen(d.lon, d.lat);
      var covR = r.coverageM / 1000 * ppk, onSt = r.state === 'on-station' || r.state === 'verifying', isSelD2 = S.selDrone === r.id, tcol = C(DRONE_COLOR[r.state] || 'accent');
      var offscreen = xy[0] < -covR - 20 || xy[0] > W + covR + 20 || xy[1] < -covR - 20 || xy[1] > H + covR + 20;
      if (offscreen) continue;
      // trail
      if (L.trails && r.trail && r.trail.length > 1) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var tp = r.trail, n = tp.length, p0 = map.toScreen(tp[0][0], tp[0][1]);
        for (var q = 1; q < n; q++) { var p1 = map.toScreen(tp[q][0], tp[q][1]); ctx.strokeStyle = rgba(tcol, 0.12 + 0.55 * q / n); ctx.lineWidth = 1.2 + 1.6 * q / n; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); p0 = p1; }
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(xy[0], xy[1]); ctx.strokeStyle = rgba(tcol, 0.75); ctx.lineWidth = 2.6; ctx.stroke();
        ctx.restore();
      }
      // coverage circle
      if (L.coverage && covR >= 7 && (onSt || isSelD2 || ppk >= 14)) {
        ctx.save(); ctx.beginPath(); ctx.arc(xy[0], xy[1], covR, 0, Math.PI * 2); ctx.fillStyle = rgba(C('accent'), onSt ? 0.09 : 0.045); ctx.fill(); ctx.lineWidth = onSt ? 1.8 : 1.2; ctx.setLineDash(onSt ? [8, 5] : [3, 5]); ctx.strokeStyle = rgba(C('accent'), onSt ? 0.8 : 0.45); ctx.stroke(); ctx.restore();
      }
      // the drone's patrol sector for the selected drone
      if (isSelD2 && r.sector && r.sector.loop && r.state === 'patrol') {
        ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(C('accent'), 0.7); ctx.beginPath();
        r.sector.loop.forEach(function (pt, pi) { var pp = map.toScreen(pt[0], pt[1]); if (pi) ctx.lineTo(pp[0], pp[1]); else ctx.moveTo(pp[0], pp[1]); }); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      // line of sight to the target while verifying
      if (onSt && r.mission && r.mission.target) {
        var tt = map.toScreen(r.mission.target.lon, r.mission.target.lat);
        ctx.save(); ctx.setLineDash([2, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('safe'), 0.85); ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); ctx.lineTo(tt[0], tt[1]); ctx.stroke(); ctx.restore();
      }
      var gr = clamp(6 + ppk * 0.05, 7.5, 11);
      ctx.save(); ctx.translate(xy[0], xy[1]); drawDroneGlyph(ctx, gr, d.hd, r.state, isSelD2); ctx.restore();
      S.ovHits.push({ type: 'drone', id: r.id, x: xy[0], y: xy[1], r: gr + 8 });
      if (ppk >= 9 || isSelD2 || onSt) {
        var lbl = r.callsign + (r.etaSec != null && (r.state === 'en-route' || r.state === 'returning' || r.state === 'launching') ? ' · ' + mmss(r.etaSec) : '');
        ctx.font = '700 10.5px ' + MONO; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = rgba(C('bg'), 0.88); ctx.strokeText(lbl, xy[0], xy[1] + gr + 13); ctx.fillStyle = rgba(C('head')); ctx.fillText(lbl, xy[0], xy[1] + gr + 13);
      }
    }
    // 3. the robot badge on the incident of the linked alert (the robot works inside the building: this is only a pointer)
    var rb = CR.mods.robot && CR.mods.robot.badge ? CR.mods.robot.badge() : null;
    if (rb) {
      xy = map.toScreen(rb.lon, rb.lat);
      if (xy[0] > -40 && xy[0] < W + 40 && xy[1] > -40 && xy[1] < H + 40) {
        ctx.save(); ctx.translate(xy[0] + 20, xy[1] - 20); ctx.font = '700 10.5px ' + FONT; var tw = ctx.measureText(rb.text).width + 26;
        ctx.beginPath(); var rx = -tw / 2, ry = -11; ctx.moveTo(rx + 11, ry); ctx.arcTo(rx + tw, ry, rx + tw, ry + 22, 11); ctx.arcTo(rx + tw, ry + 22, rx, ry + 22, 11); ctx.arcTo(rx, ry + 22, rx, ry, 11); ctx.arcTo(rx, ry, rx + tw, ry, 11); ctx.closePath();
        ctx.fillStyle = rgba(C('surface'), 0.96); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C(rb.tok || 'brand')); ctx.stroke();
        ctx.fillStyle = rgba(C('head')); ctx.textAlign = 'center'; ctx.direction = lang() === 'ar' ? 'rtl' : 'ltr'; ctx.fillText(rb.text, 0, 1); ctx.restore();
      }
    }
  }

  /* ====================================================================================
   * 12. MAP INTERACTION: drag, wheel, pinch, click, hover, keyboard  (same behaviour as Mission Control's national map)
   * ==================================================================================== */
  function resizeMap() {
    var st = $('#cr-stage'); if (!S.map || !st) return;
    var r = st.getBoundingClientRect(); if (r.width < 40 || r.height < 40) return;
    var w = Math.round(r.width), hh = Math.round(r.height), dpr = Math.min(2, win.devicePixelRatio || 1);
    S.dpr = dpr; S.map.resize(w, hh, dpr); S.map.dirty = true;
    var ov = $('#cr-ov'); if (ov && (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(hh * dpr))) { ov.width = Math.round(w * dpr); ov.height = Math.round(hh * dpr); ov.style.width = w + 'px'; ov.style.height = hh + 'px'; }
    S.ovW = w; S.ovH = hh; S.ovCtx = ov ? ov.getContext('2d') : null;
  }
  function ptOf(e, cvs) { var r = cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitAt(x, y) {
    var best = null, bd = 1e9, i, hh, dd;
    for (i = S.ovHits.length - 1; i >= 0; i--) { hh = S.ovHits[i]; dd = Math.hypot(x - hh.x, y - hh.y); if (dd <= hh.r && dd < bd) { bd = dd; best = hh; } }
    if (best) return best;
    return S.map ? S.map.hit(x, y) : null;
  }
  function facLabel(f) { try { return NN.facilityLabel(S.nat, f.id); } catch (e) { return null; } }
  function kindName(k) { return nm(NN.KIND_NAME[k] || { ar: k, en: k }); }
  function hitLabel(hit) {
    if (!hit) return null;
    if (hit.type === 'drone') { var d = S.drones[hit.id], r = d && d.row; if (!r) return null; return { title: r.callsign + ' — ' + nm(r.stateText), sub: nm(r.name) + ' · ' + B('بطارية ', 'battery ') + N(r.batteryPct) + '%' + (r.etaSec != null ? ' · ' + B('وصول ', 'ETA ') + mmss(r.etaSec) : '') }; }
    if (hit.type === 'alert') { var a = alertOf(hit.id); return a ? { title: a.id + ' — ' + hzName(a.hazard), sub: placeLine(a).line + ' · ' + nm(a.stateName) } : null; }
    if (hit.type === 'facility') { var f = S.map.facilities.filter(function (q) { return q.id === hit.id; })[0]; if (!f) return null; var lb = facLabel(f); return { title: lb ? nm(lb) : (nm(f.name) || f.kind), sub: ({ hospital: B('مستشفى', 'Hospital'), 'clinic-ed': B('مستشفى', 'Hospital'), police: B('شرطة', 'Police'), fire: B('إطفاء / دفاع مدني', 'Fire / Civil Defence'), ambulance: B('نقطة إسعاف', 'Ambulance point') }[f.kind] || f.kind) }; }
    if (hit.type === 'unit') { var u = S.unitsById[hit.id]; return u ? { title: nm(u.name), sub: kindName(u.kind) + ' · ' + (u.busy ? B('مشغولة (محاكاة)', 'busy (SIM)') : { idle: B('متاحة', 'available'), turnout: B('تستعد', 'turning out'), 'en-route': B('في الطريق', 'en route'), 'on-scene': B('في الموقع', 'on scene'), returning: B('عائدة', 'returning') }[u.state] || u.state) } : null; }
    if (hit.type === 'incident') { var i2 = S.snap.incidents.filter(function (q) { return q.id === hit.id; })[0]; return i2 ? { title: hit.id + ' — ' + hzName(i2.hazard), sub: i2.place ? nm(i2.place.name) : '' } : null; }
    if (hit.type === 'road') { var inf = NN.roadInfo(S.nat, +hit.id); return inf ? { title: nm(inf.name), sub: B('مزدحم بقرار المشغّل', 'Jammed by the operator') } : null; }
    if (hit.type === 'cluster') return { title: N(hit.n) + B(' منشآت هنا', ' facilities here'), sub: B('انقر للتقريب', 'Click to zoom in') };
    if (hit.type === 'tunnel') return { title: B('نفق / معبر', 'Tunnel / underpass'), sub: '' };
    return null;
  }
  function hover(x, y) {
    var tip = $('#cr-tip'); if (!tip || !S.map) return;
    var hit = hitAt(x, y), key = hit ? hit.type + ':' + hit.id : '';
    if (key !== (S.hoverKey || '')) { S.hoverKey = key; S.hover = hit && (hit.type === 'unit' || hit.type === 'facility' || hit.type === 'incident') ? { type: hit.type, id: hit.id } : null; S.map.scene.hover = S.hover; S.map.dirty = true; $('#cr-map').style.cursor = hit ? 'pointer' : ''; }
    var lb = hit ? hitLabel(hit) : null;
    if (!lb) { tip.hidden = true; return; }
    tip.replaceChildren(h('b', null, lb.title), h('span', null, lb.sub)); tip.hidden = false;
    var w = tip.offsetWidth, hh = tip.offsetHeight, tx = clamp(x + 14, 4, S.ovW - w - 4), ty = clamp(y + 16, 4, S.ovH - hh - 4);
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  }
  function mapClick(x, y) {
    var hit = hitAt(x, y);
    if (hit) {
      if (hit.type === 'drone') { CR.setSelDrone(hit.id); var dr = S.drones[hit.id], al = dr && dr.row && dr.row.alert ? dr.row.alert : null; if (al && alertOf(al)) selectAlert(al, { fly: false }); CR.showTab('feed'); toast({ ar: 'المسيّرة ' + hit.id + ' — اختيرت للبث', en: 'Drone ' + hit.id + ' — selected for the feed' }, '', 1800); return; }
      if (hit.type === 'alert') { selectAlert(hit.id, { fly: false }); return; }
      if (hit.type === 'incident') { var a2 = S.alerts.filter(function (q) { return q.incident === hit.id; })[0]; if (a2) { selectAlert(a2.id, { fly: false }); CR.showTab('dispatch'); } return; }
      if (hit.type === 'cluster') { S.map.zoomAt(hit.x, hit.y, 2.4); return; }
      if (hit.type === 'road') { if (S.tool === 'jam') toggleJam(+hit.id); return; }
      return;
    }
    var ll = S.map.toLL(x, y);
    if (S.tool === 'alarm') placeAlarm({ lon: ll[0], lat: ll[1] });
    else if (S.tool === 'jam') { var e = NN.edgeAt(S.nat, ll[0], ll[1], 800); if (e) toggleJam(e.edge); else toast({ ar: 'انقر قرب طريق', en: 'Click near a road' }, 'warn'); }
  }
  function toggleJam(edge) {
    if (!need('operator', 'ازدحام طريق', 'jam a road')) return;
    if (S.jams[edge]) { NN.unjamRoad(S.nat, edge); delete S.jams[edge]; logOp('operator', 'أزال المشغّل ازدحام طريق', 'The operator cleared a road jam'); }
    else { NN.jamRoad(S.nat, edge, 0.15); S.jams[edge] = 0.15; logOp('operator', 'أزدحم طريق بقرار المشغّل (محاكاة) — ستُعاد حسابات الإرسال', 'The operator jammed a road (SIM) — dispatch is recomputed'); }
    S.congDirty = true; takeSnapshot(true); syncScene(); S.dirtyUI = true;
  }
  function attachMapEvents() {
    var cvs = $('#cr-map'), P = { pts: {}, n: 0, sx: 0, sy: 0, moved: false, pd: 0, pcx: 0, pcy: 0, lx: 0, ly: 0 };
    cvs.addEventListener('pointerdown', function (e) {
      S.lastInput = now(); if (e.button != null && e.button > 0) return; cvs.focus({ preventScroll: true });
      try { cvs.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      var p = ptOf(e, cvs); P.pts[e.pointerId] = p; P.n = Object.keys(P.pts).length;
      if (P.n === 1) { P.sx = P.lx = p.x; P.sy = P.ly = p.y; P.moved = false; }
      else if (P.n === 2) { var q = Object.keys(P.pts).map(function (k) { return P.pts[k]; }); P.pd = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y); P.pcx = (q[0].x + q[1].x) / 2; P.pcy = (q[0].y + q[1].y) / 2; P.moved = true; }
      $('#cr-tip').hidden = true;
    });
    cvs.addEventListener('pointermove', function (e) {
      var p = ptOf(e, cvs);
      if (P.pts[e.pointerId]) {
        P.pts[e.pointerId] = p;
        if (P.n === 1) { if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 5) P.moved = true; if (P.moved) { S.map.panBy(p.x - P.lx, p.y - P.ly); P.lx = p.x; P.ly = p.y; cvs.classList.add('grabbing'); } }
        else if (P.n === 2) {
          var q = Object.keys(P.pts).map(function (k) { return P.pts[k]; }), dd = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), cx = (q[0].x + q[1].x) / 2, cy = (q[0].y + q[1].y) / 2;
          S.map.panBy(cx - P.pcx, cy - P.pcy); if (P.pd > 8 && dd > 8) S.map.zoomAt(cx, cy, dd / P.pd); P.pd = dd; P.pcx = cx; P.pcy = cy;
        }
        return;
      }
      if (e.pointerType === 'mouse') hover(p.x, p.y);
    });
    function up(e) {
      if (!P.pts[e.pointerId]) return; var p = ptOf(e, cvs); delete P.pts[e.pointerId]; var n0 = P.n; P.n = Object.keys(P.pts).length; cvs.classList.remove('grabbing');
      if (n0 === 1 && !P.moved && e.type === 'pointerup') mapClick(p.x, p.y);
      if (P.n === 1) { var k = Object.keys(P.pts)[0]; P.lx = P.pts[k].x; P.ly = P.pts[k].y; P.moved = true; }
    }
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('pointerleave', function () { if (!P.n) { S.hover = null; S.hoverKey = ''; $('#cr-tip').hidden = true; if (S.map) { S.map.scene.hover = null; S.map.dirty = true; } } });
    cvs.addEventListener('wheel', function (e) { S.lastInput = now(); e.preventDefault(); var p = ptOf(e, cvs), f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0016)); S.map.zoomAt(p.x, p.y, clamp(f, 0.5, 2)); }, { passive: false });
    cvs.addEventListener('keydown', function (e) {
      S.lastInput = now(); if (e.ctrlKey || e.metaKey || e.altKey) return;
      var map = S.map, k = e.key, step = 70, used = true, w = S.ovW, hh = S.ovH;
      if (k === 'ArrowLeft') map.panBy(step, 0); else if (k === 'ArrowRight') map.panBy(-step, 0); else if (k === 'ArrowUp') map.panBy(0, step); else if (k === 'ArrowDown') map.panBy(0, -step);
      else if (k === '+' || k === '=') map.zoomAt(w / 2, hh / 2, 1.4); else if (k === '-' || k === '_') map.zoomAt(w / 2, hh / 2, 1 / 1.4);
      else if (k === '0') map.home(500);
      else if (k === 'Enter' && S.tool !== 'select') { var c = map.toLL(w / 2, hh / 2); if (S.tool === 'alarm') placeAlarm({ lon: c[0], lat: c[1] }); }
      else used = false;
      if (used) e.preventDefault();
    });
  }
  Object.assign(CR, { resizeMap: resizeMap, hitAt: hitAt });

  /* ====================================================================================
   * 13. THE FRAME LOOP: simulation time, glide, map, overlay, feeds; frame statistics
   * ==================================================================================== */
  var UI_PERIOD = 400;
  function stepSim(dt, budgetMs, t0) {
    var tick = S.tick, steps = 0, simSec = 0, nat = S.nat;
    S.acc += dt; var total = Math.floor(S.acc / tick), maxSteps = S.seek ? 240 : 8;
    while (total > 0 && steps < maxSteps && (now() - t0) < budgetMs) { NN.step(nat, tick); S.acc -= tick; total--; steps++; simSec += tick; }
    if (S.acc > tick * 14) S.acc = 0;
    return simSec;
  }
  function afterSim(simSec) {
    takeSnapshot(true); drainEvents(); detectNewAlerts(); publishAll(false);
    CR.hooks.afterStep.forEach(function (fn) { try { fn(simSec); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } });
    syncScene(); S.dirtyUI = true;
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S.map) return;
    if (!S.ready) { S.map.frame(ts); markPaint(); return; }
    var t0 = now(), dt = S.last ? Math.min(0.1, (ts - S.last) / 1000) : 0; S.last = ts;
    if (doc.hidden) { return; }
    var running = S.playing || S.seek;
    if (running && S.nat) {
      var sp = S.seek ? 900 : S.speed, sim = stepSim(dt * sp, S.seek ? 11 : 7, t0);
      if (sim > 0) { afterSim(sim); }
      if (S.seek && S.snap.t >= S.seek) { S.seek = null; S.dirtyUI = true; live(B('اكتمل التقديم إلى ', 'Fast-forward complete: ') + S.snap.clock.slice(0, 5)); CR.emit('seek-done', null); }
    }
    var gl = stepGlide(t0); if (gl && S.map) S.map.dirty = true;
    S.map.frame(ts);
    drawOverlay(ts);
    CR.tabs.forEach(function (tb) { if (tb.frame && S.tab === tb.id && tabVisible(tb)) { try { tb.frame(ts, t0); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } } });
    var tn = now();
    if (tn - S.uiAt > UI_PERIOD || S.dirtyUI) { S.uiAt = tn; S.dirtyUI = false; uiTick(); }
    S.frames.push(tn - (S.fpsLast || tn)); S.fpsLast = tn; if (S.frames.length > 300) S.frames.shift(); S.lastWork = tn - t0;
    markPaint();
  }
  function tabVisible(tb) { return !CR.isNarrow() || (S.view === tb.id); }
  CR.tabVisible = tabVisible;
  function markPaint() {
    if (S.firstPaintMs == null && S.map && S.map.stats.frames > 0) {
      S.firstPaintMs = Math.round(now()); var m = $('#main'); if (m) m.setAttribute('data-first-paint', String(S.firstPaintMs));
    }
  }
  function uiTick() {
    if (!S.nat) return;
    CR.hooks.uiTick.forEach(function (fn) { try { fn(S); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } });
    CR.emit('tick', S);
    var sm = $('#cr-map-summary');
    if (sm && S.snap) { var open = S.alerts.filter(function (a) { return !isFinal(a); }), sel = selectedAlert(), parts = [B('خريطة قطر. ', 'Map of Qatar. '), B('إنذارات مفتوحة: ', 'Open alerts: ') + N(open.length) + '. ', B('مسيّرات في الجو: ', 'Drones airborne: ') + N(S.snap.drones.filter(function (d) { return d.state !== 'docked' && d.state !== 'charging'; }).length) + '. '];
      if (sel) parts.push(B('المحدد: ', 'Selected: ') + sel.id + ' ' + hzName(sel.hazard) + ', ' + placeLine(sel).line + ', ' + nm(sel.stateName) + '. ');
      setT(sm, parts.join('')); }
  }
  function fps() {
    var f = S.frames.slice(-150); if (f.length < 5) return null; var sorted = f.slice().sort(function (a, b) { return a - b; });
    var mean = f.reduce(function (a, b) { return a + b; }, 0) / f.length;
    return { frames: f.length, meanMs: +mean.toFixed(2), p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), maxMs: +sorted[sorted.length - 1].toFixed(2), fps: +(1000 / mean).toFixed(1) };
  }
  // pan + zoom the map for N frames while the feeds render: the frame times of the REAL page (the test and the performance budget use this)
  function benchmark(o) {
    o = o || {}; var n = o.frames || 150, map = S.map, sz = map.size(), i = 0, times = [], last = 0, ang = 0;
    return new Promise(function (resolve) {
      function f(ts) {
        if (last) times.push(ts - last); last = ts;
        ang += 0.07; map.panBy(Math.cos(ang) * 10, Math.sin(ang) * 7); map.zoomAt(sz.w * 0.5 + Math.cos(ang) * 80, sz.h * 0.5, i % 60 < 30 ? 1.02 : 1 / 1.02); map.dirty = true;
        if (++i < n) requestAnimationFrame(f); else {
          var s = times.slice().sort(function (a, b) { return a - b; }), mean = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
          resolve({ frames: times.length, meanMs: +mean.toFixed(2), p50Ms: +s[Math.floor(s.length * 0.5)].toFixed(2), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2), maxMs: +s[s.length - 1].toFixed(2), fps: +(1000 / mean).toFixed(1) });
        }
      }
      requestAnimationFrame(f);
    });
  }

  /* ====================================================================================
   * 14. BOOT
   * ==================================================================================== */
  function fail(why) {
    S.failed = true; var m = $('#main'); if (m) m.setAttribute('data-state', 'error');
    var miss = (win.__crMissing || []).slice().concat(String(why || '').split(', ').filter(Boolean)).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var card = h('div', { class: 'cr-boot-card err', role: 'alert' },
      h('i', { class: 'cr-erri', 'aria-hidden': 'true' }, '!'), h('h2', null, bi('تعذّر تشغيل غرفة التحكم', 'The Control Room could not start')),
      h('p', null, bi('لم تُحمَّل بعض ملفات الصفحة (المحاكاة أو بيانات الخريطة)، فلا يمكن رسم قطر. جرّب إعادة التحميل؛ الصفحة تعمل دون إنترنت.', 'Some page files (the simulation or the map data) did not load, so Qatar cannot be drawn. Try reloading; the page works offline.')),
      miss.length ? h('p', { class: 'mono small' }, miss.join(' · ')) : null,
      h('div', { class: 'btns' }, btn('btn btn-primary btn-sm', 'reset', 'حاول مجددًا', 'Try again', function () { location.reload(); }), h('a', { class: 'btn btn-ghost btn-sm', href: 'mission.html' }, bi('افتح غرفة العمليات', 'Open Mission Control'))));
    var boot = $('#cr-boot'); if (boot) { boot.className = 'cr-boot err'; boot.removeAttribute('role'); boot.hidden = false; boot.replaceChildren(card); }
    else { var root = $('#main'); if (root) root.appendChild(h('div', { class: 'cr-boot err' }, card)); }
  }
  function resolveDeps() {
    NN = win.ManaraNational; NM = win.NatMap; DS = win.ManaraDroneScene; SIM = win.ManaraSim; GEO = win.MANARA_QATAR_GEO; FAC = win.MANARA_QATAR_FACILITIES; ROADS = win.MANARA_QATAR_ROADS;
    var lacking = []; if (!NN) lacking.push('national.js'); if (!NM) lacking.push('mission-national-map.js'); if (!GEO) lacking.push('qatar-geo.js'); if (!FAC) lacking.push('qatar-facilities.js'); if (!ROADS) lacking.push('qatar-roads.js'); if (!DS) lacking.push('drone-scene.js'); if (!win.ManaraFire) lacking.push('fire.js'); if (!win.Manara) lacking.push('core.js');
    if (win.__crMissing && win.__crMissing.length) win.__crMissing.forEach(function (x) { if (lacking.indexOf(x) < 0) lacking.push(x); });
    CR.deps = { NN: NN, NM: NM, DS: DS, SIM: SIM, GEO: GEO, FAC: FAC, ROADS: ROADS };
    return lacking;
  }
  function boot() {
    if (S.booted) return; S.booted = true;
    var lacking = resolveDeps();
    if (lacking.length) { fail(lacking.join(', ')); return; }
    try {
      readColors();
      CR.hooks.init.forEach(function (fn) { fn(); });                                    // the shell (control-ui.js) builds the top bar, the queue, the tabs …
      S.map = NM.create({ canvas: $('#cr-map'), geo: GEO, fac: FAC, roads: ROADS.decode(), lang: lang, reduced: reduced });
      S.map.scene.layers = S.layers; S.map.scene.animate = true; S.map.labelFor = function (id) { try { return S.nat ? NN.facilityLabel(S.nat, id) : null; } catch (e) { return null; } };
      attachMapEvents(); resizeMap(); S.map.fit();
      if (win.ResizeObserver) { var ro = new ResizeObserver(function () { resizeMap(); CR.emit('resize', null); }); ro.observe($('#cr-stage')); } else win.addEventListener('resize', resizeMap);
      win.addEventListener('langchange', function () { relabel(); if (S.map) S.map.dirty = true; CR.emit('lang', lang()); S.dirtyUI = true; });
      win.addEventListener('themechange', function () { readColors(); if (S.map) { S.map.setColors(); S.map.dirty = true; } CR.emit('theme', html.dataset.theme); S.dirtyUI = true; });
      if (win.Manara && win.Manara.link && win.Manara.link.on) win.Manara.link.on(function (m) { try { onBus(m); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } });
      if (RMQ.addEventListener) RMQ.addEventListener('change', function () { if (S.map) S.map.dirty = true; S.dirtyUI = true; });
      requestAnimationFrame(loop);
      // the first thing a person sees is the console chrome and the map; the engine (about half a second) starts right after the first paint
      requestAnimationFrame(function () { setTimeout(startEngine, 20); });
    } catch (err) { try { console.error(err); } catch (e2) { /* ignore */ } fail(String(err && err.message || err)); }
  }
  function startEngine() {
    try {
      S.nat = makeEngine(); S.world = NN.world(S.nat); S.nat.autoApprove = S.autopilot; S.last = 0;
      takeSnapshot(true); syncScene(true); drainEvents();
      S.ready = true; var m = $('#main'); if (m) { m.setAttribute('data-state', 'ready'); m.setAttribute('data-ready', '1'); }
      var boot = $('#cr-boot'); if (boot) boot.hidden = true;
      CR.emit('ready', null); uiTick();
      var hash = (location.hash || '').replace(/^#/, ''), q = location.search || '';
      if (/(^|&)wall(=1)?($|&)/.test(hash) && CR.ui) CR.ui.setWall(true);
      if (CR.mods.demo) {
        if (/(^|[&?])demo(=1)?($|&)/.test(hash + '&' + q.replace(/^\?/, ''))) CR.mods.demo.startDemo();
        else if (/(^|&)quiet(=1)?($|&)/.test(hash)) { /* an empty console (tests) */ }
        else CR.mods.demo.startBusy({ quiet: true });
      }
    } catch (err) { try { console.error(err); } catch (e2) { /* ignore */ } fail(String(err && err.message || err)); }
  }
  Object.assign(CR, { boot: boot, fail: fail, fps: fps, benchmark: benchmark, uiTickNow: function () { uiTick(); }, afterSim: afterSim, stepSim: stepSim, hzName0: hzName0, kindName: kindName, toggleJam: toggleJam, facLabel: facLabel });

  /* ====================================================================================
   * 15. PUBLIC API (tests, automation)
   * ==================================================================================== */
  function advance(sec) {                                   // fast-forward whole ticks synchronously (tests); the map and the panels refresh once at the end
    if (!S.nat) return null; var n = Math.max(1, Math.round(sec / S.tick)), i;
    for (i = 0; i < n; i++) NN.step(S.nat, S.tick);
    afterSim(n * S.tick); CR.uiTickNow(); return S.snap;
  }
  function seekTo(t) { if (!S.nat || t <= S.snap.t) return false; S.seek = t; S.seekFrom = S.snap.t; S.dirtyUI = true; live(B('تقديم سريع إلى ', 'Fast-forwarding to ') + NN.time(S.nat, t).clock.slice(0, 5)); return true; }
  CR.api = CR.api || {};
  Object.assign(CR.api, {
    ready: function () { return !!S.ready; }, failed: function () { return !!S.failed; }, state: S, nat: function () { return S.nat; }, snap: function () { return S.snap; }, map: function () { return S.map; },
    alerts: function () { return S.alerts.slice(); }, alert: alertOf, select: selectAlert, selected: function () { return S.sel; }, approve: approveAlert, dismiss: dismissAlert, escalate: escalateAlert, launch: launchDrone, recall: recallDrone, announce: announceVia,
    role: function () { return S.role; }, setRole: setRole, placeAlarm: placeAlarm, step: advance, seekTo: seekTo, setSpeed: function (v) { S.speed = v; S.dirtyUI = true; CR.emit('speed', v); }, setPlaying: function (v) { S.playing = !!v; S.dirtyUI = true; CR.emit('speed', S.speed); },
    fps: fps, benchmark: benchmark, reset: reset, oplog: function () { return S.oplog.slice(); }, decisions: function () { return S.decisions.slice(); }, bus: function () { return Object.assign({}, S.bus); }, busLog: function () { return S.busLog.slice(); },
    firstPaintMs: function () { return S.firstPaintMs; }, engineMs: function () { return S.engineMs; }, tab: function (id) { return CR.showTab ? CR.showTab(id) : null; }, text: function () { var m = $('#main'); return m ? m.textContent : ''; },
    drones: function () { return S.snap ? S.snap.drones : []; }, glyphs: { hazardGlyph: hazardGlyph }
  });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
