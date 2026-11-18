/* MANARA («منارة») — Mission Control, NATIONAL VIEW  →  window.MissionNational          (js/mission-national.js)
 * =========================================================================================================================
 * User requirements (verbatim): "I wnat it on the whole of Qatar" · "make so the nearst hospital or neasrest ploice or nearst fire fighting respomndes" ·
 * "its by how reaches there the fastest depending on traffic".  This file is the CONTROLLER of the national view of Mission Control: the whole of Qatar on one
 * full-bleed map (js/mission-national-map.js draws it from the bundled OpenStreetMap snapshot), the operator's tools, and the panels (Incident, Dispatch,
 * Traffic, Hazards, KPIs, A/B, Log).  The simulation is js/national.js (window.ManaraNational): seeded, deterministic, no DOM.  Nothing here invents a number:
 * every figure comes from the engine, the data or manara/docs/MANARA-SOURCES.md, and everything simulated says SIM.
 *
 * ONE PIPELINE, TWO ZOOM LEVELS.  Sense → Prove → Reach → Guide → Count → Hand off.  This is the NATIONAL level (where is the incident, who reaches it fastest given
 * traffic, what are the heat / dust / flood advisories).  js/mission.js is the LOCAL level, the "last 100 metres" (wake-up ladder, exit truth, headcount).  The
 * button "Zoom into the last 100 metres" calls MissionControl.zoomIn(ctx) with the hazard preset and the nearest REAL place; "Back to Qatar" returns here.
 *
 * WHAT IS REAL AND WHAT IS SIMULATED (always on screen: attribution bar + legend)
 *   REAL  an OpenStreetMap SNAPSHOT: outline, 8 municipalities, places, 138 facilities, the major road graph.  Contains data © OpenStreetMap contributors, ODbL 1.0.
 *   SIM   traffic, congestion, where a vehicle is, whether a unit is busy, the heat / dust / rain fields, closures from rain, ED capacity, every ETA.
 *   999 stays the dispatcher.  MANARA is a recommendation + a verified package for the control room, never a replacement for it.
 *
 * BUS (Manara.link; the phone page alert.html reacts)   alert / alert-update { scope:'national', id:'A-N1', hazard, level, area, at:{lon,lat}, radiusM, incident }  — only AFTER the
 *   human key (Approve) · dispatch = ManaraNational.busDispatch · advisory = ManaraNational.busAdvisory (when the set changes) · alert-clear when the incident ends.
 *
 * PUBLIC API (also used by manara/tools/test-mission.mjs)   window.MissionNational = { ready, nat, map, snap, state, placeIncident, approve, hold, cancel, select, jamAt, closeAt, step,
 *   setPlaying, setSpeed, setClock, setTool, setLayer, tab, present, flyTo, zoomIn, back, cap, example, runAB, benchmark, fps, text }
 * ========================================================================================================================= */
(function () {
  'use strict';
  var doc = document, win = window;
  var MC = win.MissionControl, K = MC && MC.kit;
  var NN = win.ManaraNational, NM = win.NatMap, GEO = win.MANARA_QATAR_GEO, FAC = win.MANARA_QATAR_FACILITIES, ROADS = win.MANARA_QATAR_ROADS;
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  var RMQ = win.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduced() { return !!RMQ.matches; }

  /* ---- small helpers taken from the kit of mission.js (so both views look and speak the same) ---- */
  var h, bi, lab, icon, btn, iconBtn, seg, B, N, LL, mmss, fmtDist, announce, download, copyText, simTag, T;
  function bindKit() {
    h = K.h; bi = K.bi; lab = K.lab; icon = K.icon; btn = K.btn; iconBtn = K.iconBtn; seg = K.seg; B = K.B; N = K.N; LL = K.LL; mmss = K.mmss; fmtDist = K.fmtDist;
    announce = K.announce; download = K.download; copyText = K.copyText; simTag = K.simTag; T = K.T;
  }
  function lang() { return win.Manara.lang(); }
  function nm(o) { return o ? (lang() === 'en' ? (o.en || o.ar || '') : (o.ar || o.en || '')) : ''; }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, a) { var el = doc.createElementNS(SVGNS, tag); if (a) for (var k in a) if (a[k] != null) el.setAttribute(k, a[k]); for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]); return el; }
  function setT(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function txt(ar, en) { return B(ar, en); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(hour) { var hh = Math.floor(hour) % 24, mm = Math.round((hour - Math.floor(hour)) * 60); if (mm === 60) { mm = 0; hh = (hh + 1) % 24; } return pad2(hh) + ':' + pad2(mm); }
  function km1(m) { return N(m / 1000, 1) + ' ' + B('كم', 'km'); }
  function minTxt(sec) { return isNum(sec) ? mmss(sec) : '–'; }

  /* ---------------------------------------------------------------- vocabulary */
  var HZ_ORDER = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
  var HZ = { fire: { icon: 'fire', tok: '--fire-3' }, gas: { icon: 'gas', tok: '--warn' }, flood: { icon: 'flood', tok: '--info' }, dust: { icon: 'wind', tok: '--warn' }, heat: { icon: 'thermo', tok: '--brand' }, sos: { icon: 'heart', tok: '--danger' } };
  var KIND = { fire: { icon: 'fire', tok: '--fire-3' }, rescue: { icon: 'rescue', tok: '--brand' }, ambulance: { icon: 'ambulance', tok: '--danger' }, police: { icon: 'police', tok: '--info' }, hospital: { icon: 'hospital', tok: '--danger' } };
  var STATES = ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'];
  var STATE_TAG = { recommended: 'warn', approved: 'cool', dispatched: 'cool', 'en-route': 'cool', 'on-scene': 'safe', cleared: '' };
  var DOW = [['الأحد', 'Sunday'], ['الاثنين', 'Monday'], ['الثلاثاء', 'Tuesday'], ['الأربعاء', 'Wednesday'], ['الخميس', 'Thursday'], ['الجمعة', 'Friday'], ['السبت', 'Saturday']];
  var SEASONS = { winter: '2026-01-11', summer: '2026-07-12' };            // both dates are Sundays: day offset 0..6 gives Sunday..Saturday
  var DEMO_AT = { lon: 51.5264, lat: 25.2856 };                              // the demo incident: the centre of Doha
  var LEVEL_OF = { fire: 'evacuate', gas: 'shelter', flood: 'shelter', dust: 'shelter', heat: 'shelter', sos: 'watch' };   // what a nearby phone is told first
  var LEVEL_TAG = { normal: 'safe', watch: 'cool', warning: 'warn', danger: 'danger', info: 'cool' };

  function msg(key, params, l) {
    l = l || lang(); var p = {};
    if (params) for (var k in params) { var v = params[k]; p[k] = (v && typeof v === 'object' && (v.ar || v.en)) ? (l === 'en' ? (v.en || v.ar) : (v.ar || v.en)) : v; }
    var out = '';
    try { if (win.MANARA_MSG && MANARA_MSG.text) out = MANARA_MSG.text(key, l, p); } catch (e) { out = ''; }
    if (!out || out === key) { try { out = NN.renderMsg(key, params, l); } catch (e2) { out = ''; } }
    return out || key;
  }
  function stateName(s) { return msg('nat.unit.state.' + s); }

  /* ---------------------------------------------------------------- state */
  var NS = {
    inited: false, ready: false, failed: false, scopeSeen: 'national',
    nat: null, map: null, snap: null, world: null, bootT0: now(), firstPaintMs: null, engineMs: null,
    opts: { seed: 7, season: 'winter', dow: 0, hour: 7.75, params: {} },
    playing: true, speed: 10, acc: 0, last: 0, snapAt: 0, tickSec: 5, simBudgetMs: 0,
    tool: 'incident', hazard: 'fire', sev: 2, patients: 0, patNeed: 'ed', jamFactor: 0.15,
    selInc: null, sel: null, hover: null, held: {}, openWhy: {},
    layers: { traffic: true, hazard: 'off', fac: { hospital: true, police: true, fire: true, ambulance: true, minor: false }, units: true, munis: true, places: true, tunnels: true, closures: true },
    jams: {}, closes: {}, rainMm: 0, rainCells: [], dust: null,
    cong: null, congKey: 0, congAt: -1, congDirty: true, fieldsVer: 0, fieldsAt: -1, tunnelsAt: -1, tunnels: null,
    units: [], dLon: null, dLat: null, fx: null,
    log: [], evIdx: 0, logFilter: 'all', banner: null, bannerTimer: 0, toastEl: null,
    pub: {}, checkins: {}, advSig: '', pubAdv: true, pubPhones: true, phoneMsgs: 0, lastBus: null, showDone: false, tour: null,
    tab: 'incident', sheet: 'half', present: false,
    example: null, exSeed: 3, ab: null, abSeed: 7, abCfg: { n: 100, hour: 7.75, trafficLoad: 1, unitBusyPct: 10, hazards: { fire: true, gas: true, flood: true, sos: true } }, sweep: null, busy: {},
    kpiHist: [], kpiHistT: -1, zones: [], frames: [], fpsLast: 0, snapDirty: true, road: null, pop: null, abRunning: false,
    zoomBack: null, demoPlaced: false, noDemo: false, autoDemo: false, welcomeDismissed: false, abAuto: false
  };

  /* ====================================================================================
   * 1. THE ENGINE — create / rebuild (the clock cannot run backwards, so a new clock is a re-timed replay of the operator's incidents)
   * ==================================================================================== */
  function engineOpts() {
    var o = NS.opts;
    return { seed: o.seed, date: SEASONS[o.season] || SEASONS.winter, day: o.dow, hour: o.hour, autoApprove: false, tickSec: NS.tickSec, params: Object.assign({}, o.params) };
  }
  function makeEngine() {
    var t0 = now(), nat = NN.create(engineOpts());
    NS.engineMs = Math.round(now() - t0);
    return nat;
  }
  function resetOps() { NS.jams = {}; NS.closes = {}; NS.rainMm = 0; NS.rainCells = []; NS.dust = null; }
  // re-create the engine; keep=true replays the live incidents (same hazard / place / severity / patients, approved ones are approved again) and the operator's road / weather actions
  function rebuild(keep) {
    var old = NS.nat, saved = [], ops = { jams: NS.jams, closes: NS.closes, rain: NS.rainMm, cells: NS.rainCells, dust: NS.dust }, oldSel = NS.selInc, idMap = {};
    if (old && NS.pub) clearPublished();                                           // the phones forget the old alerts; the replay publishes fresh ones
    if (keep && old) {
      old.incidents.forEach(function (i) { if (i.status !== 'cleared' && i.status !== 'cancelled') saved.push({ hazard: i.hazard, lon: i.lon, lat: i.lat, severity: i.severity, patients: i.patients, approved: !!(i.plan && i.plan.state !== 'recommended'), id: i.id, held: !!NS.held[i.id] }); });
    }
    NS.held = {}; NS.pub = {};
    var nat = makeEngine(); NS.nat = nat; NS.world = NN.world(nat); NS.evIdx = 0; NS.kpiHist = []; NS.kpiHistT = -1; NS.acc = 0; NS.tunnels = null; NS.tunnelsAt = -1;
    if (keep) {
      resetOps();
      Object.keys(ops.jams).forEach(function (e) { NS.jams[e] = ops.jams[e]; NN.jamRoad(nat, +e, ops.jams[e]); });
      Object.keys(ops.closes).forEach(function (e) { NS.closes[e] = 1; NN.closeRoad(nat, +e); });
      if (ops.rain) { NS.rainMm = ops.rain; NN.setRain(nat, ops.rain); }
      ops.cells.forEach(function (c) { NN.addRainCell(nat, c); NS.rainCells.push(c); });
      if (ops.dust) { NS.dust = ops.dust; NN.startDust(nat, ops.dust); }
      NS.selInc = null;
      saved.forEach(function (s) {
        var inc = NN.createIncident(nat, { hazard: s.hazard, lon: s.lon, lat: s.lat, severity: s.severity, patients: s.patients && s.patients.n ? s.patients : undefined });
        if (inc) idMap[s.id] = inc.id;
        if (inc && s.approved) NN.approve(nat, inc.id);
        if (inc && s.held) NS.held[inc.id] = true;
      });
      NS.selInc = oldSel && idMap[oldSel] ? idMap[oldSel] : null;
    } else { resetOps(); NS.selInc = null; NS.sel = null; NS.example = null; NS.map && (NS.map.scene.example = null); }
    NS.congDirty = true; NS.fieldsVer++; NS.snapDirty = true; NS.units = []; NS.dLon = null;
    takeSnapshot(true); syncScene(true);
    return nat;
  }

  /* ====================================================================================
   * 2. SNAPSHOT → SCENE (what the map draws)
   * ==================================================================================== */
  function takeSnapshot(force) {
    var nat = NS.nat; if (!nat) return null;
    var t = now(); if (!force && t - NS.snapAt < 90) return NS.snap; NS.snapAt = t;
    var old = NS.snap, s = NN.snapshot(nat, { kpis: true, lastEvents: 5 });
    NS.snap = s; NS.snapDirty = false;
    // units: draw positions are interpolated between ticks (so vehicles glide instead of jumping every 5 simulated seconds)
    var us = s.units, n = us.length, i;
    if (!NS.dLon || NS.dLon.length !== n) { NS.dLon = new Float64Array(n); NS.dLat = new Float64Array(n); NS.units = us.map(function (u) { return { id: u.id, kind: u.kind, name: u.name, lon: u.lon, lat: u.lat, state: u.state, assigned: u.assigned, busy: u.busy }; }); for (i = 0; i < n; i++) { NS.dLon[i] = us[i].lon; NS.dLat[i] = us[i].lat; } NS.fx = null; }
    var fx = { t0: t, dur: Math.max(60, Math.min(900, (NS.tickSec / Math.max(1, NS.speed)) * 1000 * (NS.playing ? 1 : 0))), fl: new Float64Array(n), fa: new Float64Array(n), tl: new Float64Array(n), ta: new Float64Array(n), moving: false };
    for (i = 0; i < n; i++) {
      var u = us[i], d = NS.units[i];
      fx.fl[i] = NS.dLon[i]; fx.fa[i] = NS.dLat[i]; fx.tl[i] = u.lon; fx.ta[i] = u.lat;
      if (Math.abs(u.lon - NS.dLon[i]) > 1e-6 || Math.abs(u.lat - NS.dLat[i]) > 1e-6) fx.moving = true;
      d.state = u.state; d.assigned = u.assigned; d.busy = u.busy; d.name = u.name;
    }
    NS.fx = fx.moving ? fx : null; if (!fx.moving || fx.dur < 70) { for (i = 0; i < n; i++) { NS.dLon[i] = us[i].lon; NS.dLat[i] = us[i].lat; NS.units[i].lon = us[i].lon; NS.units[i].lat = us[i].lat; } NS.fx = null; }
    return s;
  }
  function stepFx(t) {
    var fx = NS.fx; if (!fx) return false;
    var k = clamp((t - fx.t0) / fx.dur, 0, 1), n = NS.units.length, i;
    for (i = 0; i < n; i++) { NS.dLon[i] = fx.fl[i] + (fx.tl[i] - fx.fl[i]) * k; NS.dLat[i] = fx.fa[i] + (fx.ta[i] - fx.fa[i]) * k; NS.units[i].lon = NS.dLon[i]; NS.units[i].lat = NS.dLat[i]; }
    if (k >= 1) NS.fx = null;
    return true;
  }
  function muniLevels(s) { var o = {}; if (s && s.kpis) s.kpis.municipalities.forEach(function (m) { o[m.id] = m.level; }); return o; }
  function dustFront(s) {
    if (!s || !s.dust || !s.dust.on) return null;
    var g = NS.world.grid, cx = g.lon0 + g.nx * g.d / 2, cy = g.lat0 + g.ny * g.d / 2, to = (s.dust.deg + 180) * Math.PI / 180, ex = Math.sin(to), ey = Math.cos(to), f = s.dust.frontKm * 1000;
    var c = NN.offsetLL(cx, cy, ex * f, ey * f);
    return [NN.offsetLL(c[0], c[1], ey * 400000, -ex * 400000), NN.offsetLL(c[0], c[1], -ey * 400000, ex * 400000)];
  }
  // push the engine's state into map.scene (cheap; the map draws only when something is dirty)
  function syncScene(force) {
    var map = NS.map, nat = NS.nat, s = NS.snap; if (!map || !nat || !s) return;
    var sc = map.scene, t = s.t;
    sc.layers = NS.layers; sc.units = NS.units; sc.incidents = s.incidents; sc.closedEdges = s.closedEdges;
    sc.jamEdges = Object.keys(NS.jams).map(function (e) { return { edge: +e, factor: NS.jams[e] }; });
    sc.muniLevel = muniLevels(s); sc.selInc = NS.selInc; sc.sel = NS.sel; sc.hover = NS.hover; sc.rainCells = s.rain.cells;
    var d = s.dust; sc.dust = d && d.on ? { on: true, frontKm: d.frontKm, front: dustFront(s) } : { on: false };
    // congestion colours: recomputed every 5 simulated minutes, after every operator action and when the weather changes
    if (NS.congDirty || force || t - NS.congAt >= 300) {
      NS.congDirty = false; NS.congAt = t; NS.cong = NN.congestionMap(nat); NS.congKey++; sc.cong = NS.cong; sc.congKey = NS.congKey; map.invalidate('roads');
    }
    var hz = NS.layers.hazard;
    if (hz !== 'off' && (force || NS.fieldsAt !== Math.floor(t / 60) + ':' + NS.fieldsVer)) {
      NS.fieldsAt = Math.floor(t / 60) + ':' + NS.fieldsVer; sc.fields = NN.fields(nat); sc.fieldsKey = NS.fieldsAt;
    }
    if (!NS.tunnels || (NS.rainMm || NS.rainCells.length || (s.kpis && s.kpis.hazards.flood.tunnelsClosed)) && t - NS.tunnelsAt >= 60 || force) {
      NS.tunnelsAt = t; NS.tunnels = NN.floodState(nat, { all: true }).tunnels;
    }
    sc.tunnels = NS.tunnels;
    var anyActive = s.incidents.some(function (i) { return i.status !== 'cleared' && i.status !== 'cancelled'; });
    sc.animating = anyActive || !!sc.example; sc.animate = true;
    map.dirty = true;
  }

  /* ====================================================================================
   * 3. EVENTS → log, banner, announcements, bus
   * ==================================================================================== */
  var EV_GROUP = { 'redispatch': 'dispatch', 'recommendation-change': 'dispatch', 'dispatch-recommended': 'dispatch', 'dispatch-approved': 'dispatch', 'dispatched': 'dispatch', 'unit-en-route': 'dispatch', 'unit-on-scene': 'dispatch', 'unit-cleared': 'dispatch', 'reroute-unit': 'dispatch', 'far-but-faster': 'dispatch', 'dispatch-degraded': 'dispatch', 'incident-unreachable': 'dispatch', 'unit-busy': 'dispatch', 'unit-free': 'dispatch',
    'incident': 'incident', 'incident-cleared': 'incident', 'incident-cancelled': 'incident', 'cordon': 'incident', 'cordon-lifted': 'incident',
    'road-jam': 'traffic', 'area-jam': 'traffic', 'road-closed': 'traffic', 'road-open': 'traffic', 'area-closed': 'traffic',
    'rain-cell': 'hazard', 'dust-front': 'hazard', 'underpasses-closed': 'hazard', 'underpasses-reopened': 'hazard', 'ponding-point': 'hazard', operator: 'incident' };
  var EV_ICON = { redispatch: 'alert', 'recommendation-change': 'route', 'dispatch-recommended': 'route', 'dispatch-approved': 'check', dispatched: 'nav', 'unit-en-route': 'nav', 'unit-on-scene': 'pin', 'unit-cleared': 'check', 'reroute-unit': 'route', 'far-but-faster': 'target', incident: 'alert', 'incident-cleared': 'check', 'incident-cancelled': 'x', 'road-jam': 'car', 'area-jam': 'car', 'road-closed': 'x', 'road-open': 'check', 'rain-cell': 'flood', 'dust-front': 'wind', 'underpasses-closed': 'flood', operator: 'users' };
  function logOp(type, ar, en, extra) {
    var s = NS.snap; NS.log.push({ t: s ? s.t : 0, clock: s ? s.clock : '', type: type, text: { ar: ar, en: en }, op: true, inc: extra && extra.inc });
    if (NS.log.length > 400) NS.log.splice(0, NS.log.length - 400);
    touchZone('log');
  }
  function drainEvents() {
    var nat = NS.nat, ev = nat.events, any = false;
    for (; NS.evIdx < ev.length; NS.evIdx++) {
      var e = ev[NS.evIdx]; any = true;
      NS.log.push({ t: e.t, clock: e.clock, type: e.type, text: e.text, inc: e.incident || null, raw: e });
      if (e.type === 'redispatch' || e.type === 'recommendation-change' || e.type === 'dispatch-degraded' || e.type === 'incident-unreachable') showBanner(e);
      else if (e.type === 'dispatch-approved' || e.type === 'unit-on-scene' || e.type === 'incident-cleared' || e.type === 'dispatched') announce(nm(e.text));
      if (e.type === 'underpasses-closed' || e.type === 'underpasses-reopened') NS.congDirty = true;
    }
    if (any) { if (NS.log.length > 400) NS.log.splice(0, NS.log.length - 400); touchZone('log'); }
    return any;
  }
  function showBanner(e) {
    NS.banner = { type: e.type, text: e.text, inc: e.incident || null, t: e.t, clock: e.clock, at: now() };
    announce((e.type === 'redispatch' ? B('إعادة إرسال تلقائية: ', 'Automatic re-dispatch: ') : B('تحديث التوصية: ', 'Recommendation updated: ')) + nm(e.text));
    renderBanner(); touchZone('dispatch'); touchZone('incident');
    clearTimeout(NS.bannerTimer); NS.bannerTimer = setTimeout(function () { NS.banner = null; renderBanner(); }, 22000);
  }

  /* ---- publishing on the bus: the phones react (alert.html).  Nothing is sent before the human key; every message says scope national and sim ---- */
  function incLevelPlace(inc) {
    var place = inc.place && inc.place.name ? inc.place.name : null, mu = NS.world.municipalities.filter(function (m) { return m.id === inc.muni; })[0];
    return { place: place || (mu ? mu.name : null), muni: mu ? mu.name : null };
  }
  function areaOf(inc) {
    var p = incLevelPlace(inc), pl = p.place;
    if (!pl) return { ar: 'قطر (محاكاة)', en: 'Qatar (simulation)' };
    return { ar: 'قرب ' + (pl.ar || pl.en) + ' (محاكاة)', en: 'Near ' + (pl.en || pl.ar) + ' (simulation)' };
  }
  function publishIncident(inc, force) {
    if (!NS.pubPhones || !win.Manara || !Manara.link) return;
    var plan = inc.plan, st = plan ? plan.state : 'recommended', rec = NS.pub[inc.id] || (NS.pub[inc.id] = { alert: false, clear: false, dsig: '', dAt: 0, radius: 0 }), tn = now();
    var ended = inc.status === 'cleared' || inc.status === 'cancelled';
    if (ended) { if (rec.alert && !rec.clear) { rec.clear = true; try { Manara.link.send({ type: 'alert-clear', id: 'A-' + inc.id, scope: 'national', incident: { id: inc.id } }); Manara.link.send({ type: 'dispatch', scope: 'national', id: plan ? plan.id : 'D-' + inc.id, state: 'cleared', origin: 'manara', scene: { node: 'NAT', lon: inc.lon, lat: inc.lat }, incident: { id: inc.id, hazard: inc.hazard, muni: inc.muni, place: inc.place ? inc.place.name : null }, units: [], hospital: null, sim: true }); NS.phoneMsgs += 2; } catch (e) { /* ignore */ } } return; }
    if (st === 'recommended') return;                                                       // proof before panic: an unapproved recommendation never reaches a resident
    if (!rec.alert || force) {
      rec.alert = true; rec.clear = false; rec.radius = inc.radiusM;
      var p = incLevelPlace(inc), s = NS.snap;
      try {
        Manara.link.send({ type: 'alert', scope: 'national', id: 'A-' + inc.id, hazard: inc.hazard, level: LEVEL_OF[inc.hazard] || 'watch', area: areaOf(inc), at: { lon: inc.lon, lat: inc.lat }, radiusM: Math.max(100, Math.round(inc.radiusM)),
          incident: { id: inc.id, hazard: inc.hazard, muni: inc.muni, place: inc.place ? inc.place.name : null }, hour: s ? s.hour : null, clock: s ? s.clock : '', sim: true, exercise: true, origin: 'manara', muniName: p.muni });
        NS.phoneMsgs++;
      } catch (e) { /* ignore */ }
    } else if (Math.abs(inc.radiusM - rec.radius) > Math.max(30, rec.radius * 0.25)) {
      rec.radius = inc.radiusM;
      try { Manara.link.send({ type: 'alert-update', scope: 'national', id: 'A-' + inc.id, hazard: inc.hazard, level: LEVEL_OF[inc.hazard] || 'watch', area: areaOf(inc), at: { lon: inc.lon, lat: inc.lat }, radiusM: Math.max(100, Math.round(inc.radiusM)), incident: { id: inc.id, hazard: inc.hazard, muni: inc.muni, place: inc.place ? inc.place.name : null }, sim: true, exercise: true }); NS.phoneMsgs++; } catch (e2) { /* ignore */ }
    }
    var sig = plan ? plan.state + '|' + plan.units.map(function (u) { return u.state + ':' + (u.unitId || '') + ':' + Math.round((u.etaSec || 0) / 60); }).join(',') : '';
    if ((sig !== rec.dsig && tn - rec.dAt > 1200) || force) {
      rec.dsig = sig; rec.dAt = tn;
      try { var m = NN.busDispatch(NS.nat, inc.id); if (m) { m.exercise = true; Manara.link.send(m); NS.phoneMsgs++; NS.lastBus = m; } } catch (e3) { /* ignore */ }
    }
  }
  function publishAdvisory(force) {
    if (!NS.pubAdv || !NS.pubPhones || !win.Manara || !Manara.link) return;
    var m; try { m = NN.busAdvisory(NS.nat); } catch (e) { return; }
    var sig = m.items.map(function (i) { return i.key + ':' + i.level + ':' + (i.muni || ''); }).join('|');
    if (sig === NS.advSig && !force) return;
    var had = NS.advSig !== ''; NS.advSig = sig;
    if (!m.items.length && !had) return;
    try { Manara.link.send(m); NS.phoneMsgs++; } catch (e2) { /* ignore */ }
  }
  function publishAll(force) {
    NS.nat.incidents.forEach(function (inc) { publishIncident(inc, force); });
    publishAdvisory(force);
  }
  function clearPublished() {
    if (!win.Manara || !Manara.link) return;
    Object.keys(NS.pub).forEach(function (id) { if (NS.pub[id].alert && !NS.pub[id].clear) { try { Manara.link.send({ type: 'alert-clear', id: 'A-' + id, scope: 'national', incident: { id: id } }); } catch (e) { /* ignore */ } NS.pub[id].clear = true; } });
  }

  /* ====================================================================================
   * 4. OPERATOR ACTIONS
   * ==================================================================================== */
  function toast(text, kind) { try { if (win.Manara && Manara.toast) Manara.toast({ ar: text, en: text }, kind, 4200); } catch (e) { /* ignore */ } }
  function bothToast(ar, en, kind) { toast(B(ar, en), kind); }
  function incById(id) { return NS.snap ? NS.snap.incidents.filter(function (i) { return i.id === id; })[0] || null : null; }
  function selectedInc() { return NS.selInc ? incById(NS.selInc) : null; }
  function defaultPatients(hz) { return hz === 'sos' || hz === 'heat' ? 1 : 0; }
  function onLand(lon, lat) { try { return !!GEO.inLand(lon, lat); } catch (e) { return true; } }

  function placeIncident(o) {
    o = o || {};
    if (!NS.nat) { bothToast('نموذج الازدحام قيد التجهيز، حاول بعد لحظة', 'The traffic model is still getting ready, try in a moment', 'warn'); return null; }
    var hz = o.hazard || NS.hazard, lon = o.lon, lat = o.lat;
    if (!isNum(lon) || !isNum(lat) || !onLand(lon, lat)) { bothToast('اختر نقطة على اليابسة داخل قطر', 'Pick a point on land inside Qatar', 'warn'); return null; }
    var pat = o.patients != null ? o.patients : (NS.hazard === hz ? NS.patients : defaultPatients(hz)), spec = { hazard: hz, lon: lon, lat: lat, severity: o.severity || NS.sev };
    if (pat > 0) spec.patients = { n: pat, need: o.need || NS.patNeed };
    var inc;
    try { inc = NN.createIncident(NS.nat, spec); } catch (e) { bothToast('تعذّر إنشاء الحادث', 'The incident could not be created', 'danger'); return null; }
    if (!inc) return null;
    NS.sel = null; NS.selInc = inc.id; delete NS.held[inc.id];
    takeSnapshot(true); drainEvents(); syncScene(); refreshZones(true);
    var i = incById(inc.id);
    announce(B('تم تسجيل الحادث ', 'Incident logged: ') + inc.id + ' — ' + nm(NN.HAZARD_NAME[hz]) + B('. التوصية جاهزة وتنتظر موافقتك.', '. The recommendation is ready and waits for your approval.'));
    if (o.tab !== false) showTab('dispatch', true);
    if (o.fly) flyToInc(i || inc, 600);
    return inc;
  }
  function approve(id) {
    id = id || NS.selInc; if (!id || !NS.nat) return false;
    var ok = NN.approve(NS.nat, id); delete NS.held[id];
    if (ok) { logOp('operator', 'وافق المشغّل على الحادث ' + id + ' (مفتاح الإنسان)', 'The operator approved ' + id + ' (the human key)', { inc: id }); takeSnapshot(true); drainEvents(); publishAll(false); syncScene(); refreshZones(true); }
    return ok;
  }
  function hold(id) {
    id = id || NS.selInc; if (!id) return false; NS.held[id] = true;
    logOp('operator', 'علّق المشغّل الحادث ' + id + ': لا يُرسل شيء قبل موافقته', 'The operator is holding ' + id + ': nothing is sent before approval', { inc: id });
    announce(B('الحادث معلّق، لا يُرسل شيء', 'Incident on hold, nothing is sent')); refreshZones(true); return true;
  }
  function cancelInc(id) {
    id = id || NS.selInc; if (!id || !NS.nat) return false;
    var ok = NN.cancelIncident(NS.nat, id);
    if (ok) { delete NS.held[id]; takeSnapshot(true); drainEvents(); publishAll(false); syncScene(); refreshZones(true); }
    return ok;
  }
  function tickOnce() { if (NS.nat) { NN.step(NS.nat, NS.tickSec); takeSnapshot(true); drainEvents(); publishAll(false); syncScene(); } }
  function select(id) {
    NS.selInc = id; NS.sel = null; syncScene(); refreshZones(true); if (id) { var i = incById(id); if (i && NS.tab === 'incident') { /* stays */ } }
    updateSummary();
  }
  function selectThing(type, id) { NS.sel = { type: type, id: id }; if (type === 'incident') { NS.selInc = id; NS.sel = null; } syncScene(); refreshZones(true); if (type !== 'incident') showTab('incident', true); updateSummary(); }
  function jamEdge(edge, factor) {
    if (!NS.nat) return false;
    if (NS.jams[edge] != null) { NN.unjamRoad(NS.nat, edge); delete NS.jams[edge]; logOp('operator', 'رُفع الازدحام عن الطريق', 'Jam removed from the road'); }
    else { NN.jamRoad(NS.nat, edge, factor || NS.jamFactor); NS.jams[edge] = factor || NS.jamFactor; }
    return afterRoadOp();
  }
  function closeEdge(edge) {
    if (!NS.nat) return false;
    if (NS.closes[edge]) { NN.openRoad(NS.nat, edge); delete NS.closes[edge]; logOp('operator', 'أُعيد فتح الطريق', 'Road re-opened'); }
    else { NN.closeRoad(NS.nat, edge); NS.closes[edge] = 1; }
    return afterRoadOp();
  }
  // a road action marks the plans for re-evaluation: one tick is run so the ranking, the ETAs and the log react at once, even when the clock is paused
  function afterRoadOp() { NS.congDirty = true; tickOnce(); refreshZones(true); return true; }
  function edgeNear(lon, lat) {
    if (!NS.nat) return null; var m = (NS.map ? 18 / (NS.map.ppk() / 1000) : 300); var e = NN.edgeAt(NS.nat, lon, lat, clamp(m, 60, 6000)); return e && e.edge != null ? e : null;
  }
  function roadAt(lon, lat, mode) {
    var e = edgeNear(lon, lat); if (!e) { bothToast('لا يوجد طريق قريب من هذه النقطة. قرّب الخريطة أو اضغط على طريق.', 'No road near that point. Zoom in or click on a road.', 'warn'); return null; }
    NS.road = e.edge;
    if (mode === 'jam') jamEdge(e.edge); else if (mode === 'close') closeEdge(e.edge);
    refreshZones(true); return e;
  }
  function jamAt(lon, lat, factor) { var e = edgeNear(lon, lat); if (!e) return null; if (NS.jams[e.edge] == null) { NN.jamRoad(NS.nat, e.edge, factor || NS.jamFactor); NS.jams[e.edge] = factor || NS.jamFactor; afterRoadOp(); } return e.edge; }
  function closeAt(lon, lat) { var e = edgeNear(lon, lat); if (!e) return null; if (!NS.closes[e.edge]) { NN.closeRoad(NS.nat, e.edge); NS.closes[e.edge] = 1; afterRoadOp(); } return e.edge; }
  function setUnitBusy(id, v) { if (!NS.nat) return; NN.setUnitBusy(NS.nat, id, v); logOp('operator', 'غيّر المشغّل حالة توفّر وحدة', 'The operator changed a unit\'s availability'); NS.congDirty = false; tickOnce(); refreshZones(true); }
  function setTool(t) { NS.tool = t; syncTools(); NS.map && (NS.map.dirty = true); wakeHint(); }
  function wakeHint() { if (!UI.hint) return; UI.hint.classList.remove('quiet'); clearTimeout(NS.hintTimer); NS.hintTimer = setTimeout(function () { UI.hint.classList.add('quiet'); }, 7000); }
  function setLayer(k, v) {
    var L = NS.layers;
    if (k === 'hazard') { L.hazard = v; NS.fieldsAt = -1; if (NS.nat) syncScene(true); }
    else if (k.indexOf('fac.') === 0) L.fac[k.slice(4)] = !!v; else L[k] = !!v;
    if (k === 'traffic' && NS.map) NS.map.invalidate('roads');
    if (NS.map) { NS.map.invalidate('base'); NS.map.dirty = true; }
    syncLayerUI(); syncHazardUI();
  }
  function setPlaying(on) { NS.playing = !!on; NS.last = 0; syncPlayUI(); }
  function setSpeed(v) { NS.speed = v; syncPlayUI(); }
  function applyClock(o) {
    o = o || {}; var op = NS.opts;
    if (o.season && SEASONS[o.season]) op.season = o.season; if (isNum(o.dow)) op.dow = clamp(o.dow | 0, 0, 6); if (isNum(o.hour)) op.hour = clamp(o.hour, 0, 23.99);
    if (!NS.nat) return;
    rebuild(true); logOp('operator', 'ضُبط الساعة: ' + DOW[op.dow][0] + ' ' + hhmm(op.hour) + (op.season === 'summer' ? ' (صيف)' : ' (شتاء)') + ' — أُعيد حساب الإرسال', 'Clock set: ' + DOW[op.dow][1] + ' ' + hhmm(op.hour) + (op.season === 'summer' ? ' (summer)' : ' (winter)') + ' — dispatch recomputed');
    syncScene(true); refreshZones(true);
  }
  function setParam(key, v) {
    var ok = NS.nat ? NN.setParam(NS.nat, key, v) : false; NS.opts.params[key] = v;
    if (key === 'trafficLoad') NS.congDirty = true;
    if (NS.nat) tickOnce();
    return ok;
  }
  function setRain(mm) { NS.rainMm = mm; NN.setRain(NS.nat, mm); NS.congDirty = true; NS.fieldsVer++; NS.tunnelsAt = -1e9; tickOnce(); if (mm > 0 && NS.layers.hazard !== 'rain') setLayer('hazard', 'rain'); }
  function addStorm() {
    var c = NS.map.view().center, cell = { lon: c[0], lat: c[1], radiusKm: 14, mmHr: 45, headingDeg: 90, speedKmh: 25, durationSec: 7200 };
    NN.addRainCell(NS.nat, cell); NS.rainCells.push(cell); NS.congDirty = true; NS.fieldsVer++; NS.tunnelsAt = -1e9; tickOnce(); if (NS.layers.hazard !== 'rain') setLayer('hazard', 'rain');
  }
  function clearRain() { NS.rainMm = 0; NS.rainCells = []; NN.clearRain(NS.nat); NS.congDirty = true; NS.fieldsVer++; NS.tunnelsAt = -1e9; tickOnce(); }
  function startDust(deg, mps) { NS.dust = { deg: deg, mps: mps }; NN.startDust(NS.nat, { deg: deg, mps: mps, t0: NS.nat.t }); NS.congDirty = true; NS.fieldsVer++; tickOnce(); if (NS.layers.hazard !== 'dust') setLayer('hazard', 'dust'); }
  function stopDust() { NS.dust = null; NN.stopDust(NS.nat); NS.congDirty = true; NS.fieldsVer++; tickOnce(); }
  function clearJams() { Object.keys(NS.jams).forEach(function (e) { NN.unjamRoad(NS.nat, +e); }); NS.jams = {}; Object.keys(NS.closes).forEach(function (e) { NN.openRoad(NS.nat, +e); }); NS.closes = {}; afterRoadOp(); }

  /* ---- fly-to helpers ---- */
  function bboxOf(pts, padFrac) {
    var b = { lonMin: 1e9, latMin: 1e9, lonMax: -1e9, latMax: -1e9 };
    pts.forEach(function (p) { if (p[0] < b.lonMin) b.lonMin = p[0]; if (p[0] > b.lonMax) b.lonMax = p[0]; if (p[1] < b.latMin) b.latMin = p[1]; if (p[1] > b.latMax) b.latMax = p[1]; });
    var dx = Math.max(0.004, (b.lonMax - b.lonMin) * (padFrac || 0.08)), dy = Math.max(0.004, (b.latMax - b.latMin) * (padFrac || 0.08));
    b.lonMin -= dx; b.lonMax += dx; b.latMin -= dy; b.latMax += dy; return b;
  }
  function flyToInc(inc, ms) {
    if (!NS.map || !inc) return; var pts = [[inc.lon, inc.lat]];
    if (inc.plan) inc.plan.units.forEach(function (u) { if (u.pos) pts.push([u.pos.lon, u.pos.lat]); });
    if (pts.length > 1) NS.map.flyTo({ bbox: bboxOf(pts, 0.25), pad: padFor() }, ms == null ? 700 : ms); else NS.map.flyTo({ lon: inc.lon, lat: inc.lat, ppk: 26 }, ms == null ? 700 : ms);
  }
  function padFor() { var sz = NS.map.size(); return Math.round(Math.min(sz.w, sz.h) * 0.14); }
  function flyTo(t, ms) { if (NS.map) NS.map.flyTo(t, ms == null ? 700 : ms); }
  function flyToMuni(id) {
    var m = NS.map.munis.filter(function (q) { return q.id === id; })[0], g = GEO.municipalities.filter(function (q) { return q.id === id; })[0]; if (!m || !g) return;
    var pts = []; g.polygons.forEach(function (poly) { poly[0].forEach(function (p) { pts.push(p); }); }); NS.map.flyTo({ bbox: bboxOf(pts, 0.05), pad: padFor() }, 700);
  }

  /* ---- the opening story: whole of Qatar first, then ONE press flies into Doha (judge feedback).  The demo is fixed and checked by manara/tools/test-national.mjs:
   *      a fire in Al Thumama on a Sunday morning rush hour, where the unit that arrives first is NOT the nearest in a straight line. ---- */
  function demoSpec() { var d = NN.DEMO; return { hazard: d.hazard, lon: d.lon, lat: d.lat, severity: d.severity }; }
  function demoIsFarButFaster() {
    try { var p = NN.dispatchNational(NS.nat, demoSpec()), f = p && p.units.filter(function (u) { return u.kind === 'fire' && u.unitId; })[0]; return !!(f && f.whyData && f.whyData.farButFaster); } catch (e) { return false; }
  }
  function placeDemo(o) {
    o = o || {}; if (!NS.nat) { bothToast('نموذج الازدحام قيد التجهيز، حاول بعد لحظة', 'The traffic model is still getting ready, try in a moment', 'warn'); return null; }
    var d = NN.DEMO;
    if (!demoIsFarButFaster()) applyClock({ season: 'winter', dow: 0, hour: d.hour });          // the clock has drifted to an hour where the order does not flip: go back to the demo hour
    var inc = placeIncident({ hazard: d.hazard, lon: d.lon, lat: d.lat, severity: d.severity, patients: 0, tab: false });
    if (!inc) return null;
    var i = incById(inc.id);
    logOp('operator', 'حادث تجريبي: حريق في الثمامة (الدوحة) في ذروة صباح الأحد. الأسرع ليس الأقرب.', 'Demo incident: a fire in Al Thumama (Doha) at the Sunday morning rush hour. The fastest unit is not the nearest.', { inc: inc.id });
    showTab('dispatch', true);
    if (i && o.fly !== false) flyToInc(i, reduced() ? 0 : 1100);
    updateWelcome();
    return inc;
  }
  function summerNoon() {
    // the southern industrial belt (Industrial Area, Hamad Port, Mesaieed): where outdoor workers are, and where the heat layer is explained best
    var pts = GEO.places.filter(function (q) { return (q.kind === 'industrial' || q.kind === 'port') && q.lat < 25.3 && q.lat > 24.8 && q.lon > 51.3; }).map(function (q) { return [q.lon, q.lat]; });
    if (NS.opts.season !== 'summer' || NS.snap.dow !== 0 || Math.abs(NS.snap.hour - 12.5) > 0.4) applyClock({ season: 'summer', dow: 0, hour: 12.5 });
    setLayer('hazard', 'heat'); showTab('hazards', true);
    if (pts.length) NS.map.flyTo({ bbox: bboxOf(pts, 0.2), pad: padFor() }, reduced() ? 0 : 900);
    logOp('operator', 'ظهيرة الصيف: طبقة الحرارة مفعّلة والعرض على المناطق الصناعية', 'Summer noon: the heat layer is on and the map shows the industrial areas');
    announce(B('ظهيرة صيفية: طبقة الحرارة على المناطق الصناعية والموانئ', 'Summer noon: the heat layer over the industrial areas and ports'));
  }
  function demoActions(idp) {
    return h('div', { class: 'nat-demo-acts' },
      btn('btn btn-primary', 'pin', 'ضع حادثًا تجريبيًا (حريق في الدوحة)', 'Place demo incident (a fire in Doha)', function () { placeDemo(); }, { id: 'nat-demo' + idp }),
      h('div', { class: 'nat-chips' },
        btn('chip nat-chipbtn', 'target', 'أبعد لكن أسرع', 'Farther but faster', function () { NS.welcomeDismissed = true; updateWelcome(); runExample(false); }, { id: 'nat-chip-ffb' + idp }),
        btn('chip nat-chipbtn', 'thermo', 'ظهيرة الصيف (الحرارة)', 'Summer noon (heat)', function () { NS.welcomeDismissed = true; updateWelcome(); summerNoon(); }, { id: 'nat-chip-summer' + idp })));
  }
  function activeIncidents() { return NS.snap ? NS.snap.incidents.filter(function (i) { return i.status !== 'cleared' && i.status !== 'cancelled'; }).length : 0; }
  function updateWelcome() { if (UI.welcome) UI.welcome.hidden = !!NS.welcomeDismissed || activeIncidents() > 0 || NS.present; }
  function buildWelcome() {
    var cnt = FAC ? FAC.length : 138;
    UI.welcome = h('section', { class: 'nat-welcome', 'aria-labelledby': 'nat-w-h', hidden: true },
      h('button', { type: 'button', class: 'icon-btn sm nat-w-x', onclick: function () { NS.welcomeDismissed = true; updateWelcome(); } }, icon('x')),
      h('h2', { id: 'nat-w-h' }, bi('قطر كلها على خريطة واحدة', 'All of Qatar on one map')),
      h('p', null, bi('ثماني بلديات و' + N(cnt) + ' منشأة طوارئ على لقطة حقيقية من OpenStreetMap. ضع حادثًا ودع منارة تختار أسرع وحدة من كل نوع بحسب الازدحام.', '8 municipalities and ' + N(cnt) + ' emergency facilities on a real OpenStreetMap snapshot. Place an incident and MANARA picks the fastest unit of each type given traffic.')),
      demoActions('-w'));
    lab(UI.welcome.firstChild, 'aria-label', 'أخفِ هذه البطاقة', 'Hide this card');
    return UI.welcome;
  }

  /* ---- scopes: the neighbourhood view is the zoom-in of the same pipeline ---- */
  function zoomCtx(inc) {
    var s = NS.snap, mu = NS.world.municipalities.filter(function (m) { return m.id === inc.muni; })[0] || null;
    var dw = s ? DOW[s.dow] : DOW[0];
    return { incidentId: inc.id, hazard: inc.hazard, hazardName: NN.HAZARD_NAME[inc.hazard], clock: { ar: dw[0] + ' ' + (s ? s.clock.slice(0, 5) : ''), en: dw[1] + ' ' + (s ? s.clock.slice(0, 5) : '') }, lon: inc.lon, lat: inc.lat, hour: s ? s.hour : 8, dow: s ? s.dow : 0, severity: inc.severity,
      place: inc.place ? { id: inc.place.id, name: inc.place.name, distKm: inc.place.distKm } : null, muni: mu ? { id: mu.id, name: mu.name } : null };
  }
  function zoomIn(id) {
    var inc = id ? incById(id) : selectedInc(); if (!inc) { bothToast('اختر حادثًا أولًا', 'Select an incident first', 'warn'); return null; }
    NS.zoomBack = { view: NS.map.view() };
    return MC.zoomIn(zoomCtx(inc));
  }
  function back() { return MC.setScope('national'); }
  function onScope(e) {
    var s = e.detail && e.detail.scope;
    if (s === 'national') {
      NS.last = 0; if (!NS.inited) init(); if (!NS.ready) return;
      setTimeout(function () { resizeMap(); if (NS.zoomBack && NS.map) { NS.map.flyTo({ lon: NS.zoomBack.view.center[0], lat: NS.zoomBack.view.center[1], ppk: NS.zoomBack.view.ppk }, 0); } publishAll(true); syncScene(true); refreshZones(true); }, 30);
    } else if (s === 'local') { /* the national clock is paused while the neighbourhood is showing (the loop checks the scope) */ }
  }

  /* ---- CAP 1.2 ---- */
  function capXml(id) { id = id || NS.selInc; if (!id || !NS.nat) return ''; try { return NN.cap(NS.nat, id, { languages: ['ar', 'en'], area: 'circle' }); } catch (e) { return ''; } }

  /* ====================================================================================
   * 5. ZONES — parts of a panel that are re-rendered only when their signature changes (and never while a control inside has the focus)
   * ==================================================================================== */
  function zone(panel, name, sigFn, renderFn, cls) {
    var z = { panel: panel, name: name, sigFn: sigFn, render: renderFn, sig: null, el: h('div', { class: 'nat-zone ' + (cls || '') + ' z-' + name }) };
    NS.zones.push(z); return z.el;
  }
  function zoneRefresh(z, force) {
    if (!force && z.el.contains(doc.activeElement) && doc.activeElement !== doc.body && z.sig != null) return;
    var sig = z.sigFn() + '|' + lang();
    if (!force && sig === z.sig) return; z.sig = sig;
    var out = z.render(); z.el.replaceChildren.apply(z.el, [].concat(out == null ? [] : out));
  }
  function refreshZones(force) {
    if (!NS.nat) return;
    NS.zones.forEach(function (z) { if (z.panel === NS.tab || z.panel === '*' || (z.panel === 'present' && NS.present)) zoneRefresh(z, !!force); });
    syncControls();
  }
  function touchZone(name) { NS.zones.forEach(function (z) { if (z.name === name) z.sig = null; }); }

  /* ====================================================================================
   * 6. BUILDING BLOCKS
   * ==================================================================================== */
  function card(titleAr, titleEn, body, extra, cls) {
    return h('section', { class: 'pn nat-card ' + (cls || '') }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi(titleAr, titleEn)), extra || null), h('div', { class: 'pn-b' }, body));
  }
  function para(ar, en, cls) { return h('p', { class: 'nat-p ' + (cls || '') }, bi(ar, en)); }
  function tag(cls, content) { return h('span', { class: 'tag ' + (cls || '') }, content); }
  function kvRow(l, v, cls) { return h('div', { class: 'nat-kv ' + (cls || '') }, h('span', { class: 'k' }, l), ' ', h('span', { class: 'v mono' }, v)); }
  function rangeRow(arLabel, enLabel, min, max, step, value, fmt, onInput, id) {
    var inp = h('input', { type: 'range', min: min, max: max, step: step, id: id || null }), out = h('output', { class: 'mono' }, fmt(value));
    inp.value = value;
    inp.addEventListener('input', function () { out.textContent = fmt(+inp.value); });
    inp.addEventListener('change', function () { onInput(+inp.value); });
    var row = h('label', { class: 'nat-rng' }, h('span', { class: 'nat-rng-l' }, bi(arLabel, enLabel)), ' ', h('span', { class: 'rng' }, inp, ' ', out));
    row._inp = inp; row._out = out; row._fmt = fmt; return row;
  }
  function toggleRow(ar, en, checked, onchange, id) { return K.switchRow(ar, en, checked, onchange, id); }
  function kindIcon(kind, big) { var k = KIND[kind] || KIND.fire; return h('span', { class: 'nat-kico' + (big ? ' big' : ''), style: '--c:var(' + k.tok + ')' }, icon(k.icon)); }
  function hzIcon(hz) { var z = HZ[hz] || HZ.fire; return h('span', { class: 'nat-kico', style: '--c:var(' + z.tok + ')' }, icon(z.icon)); }
  function kindName(kind) { return nm(NN.KIND_NAME[kind]) || kind; }
  function hzName(hz) { return nm(NN.HAZARD_NAME[hz]) || hz; }
  function stateTag(s) { return tag(STATE_TAG[s] || '', stateName(s)); }
  function stepper(state, extra) {
    var ix = STATES.indexOf(state);
    return h('ol', { class: 'nat-steps', 'aria-label': B('مراحل الإرسال', 'Dispatch states') }, STATES.map(function (s, i) {
      return h('li', { class: (i < ix ? 'done ' : '') + (i === ix ? 'now' : ''), 'aria-current': i === ix ? 'step' : null }, h('i', { 'aria-hidden': 'true' }, i < ix ? icon('check') : String(i + 1)), h('span', null, stateName(s)));
    }));
  }
  function simNote() {                                                                      // the wording comes from the shared message catalogue (nat.sim, nat.call999)
    return h('p', { class: 'nat-sim-note' }, tag('warn', 'SIM'), ' ', bi(msg('nat.sim', null, 'ar') + ' ' + msg('nat.call999', null, 'ar'), msg('nat.sim', null, 'en') + ' ' + msg('nat.call999', null, 'en')));
  }
  function emptyState(iconName, ar, en, actions) { return h('div', { class: 'dp-empty nat-empty' }, icon(iconName), h('div', { class: 'stack' }, h('p', null, bi(ar, en)), actions || null)); }
  function placeName(inc) {
    var p = inc.place, mu = NS.world.municipalities.filter(function (m) { return m.id === inc.muni; })[0];
    var near = p && p.name ? B('قرب ' + (p.name.ar || p.name.en), 'Near ' + (p.name.en || p.name.ar)) + (isNum(p.distKm) && p.distKm >= 0.1 ? ' · ' + N(p.distKm, 1) + B(' كم', ' km') : '') : '';
    var muTxt = mu ? nm(mu.name) : '';
    return { near: near, muni: muTxt, line: near + (near && muTxt ? ' — ' : '') + muTxt };
  }
  function planOf(inc) { return inc && inc.plan ? inc.plan : null; }
  function statusOf(inc) { var p = planOf(inc); return inc.status === 'cancelled' ? 'cancelled' : p ? p.state : 'recommended'; }
  function statusTag(inc) {
    var st = statusOf(inc); if (st === 'cancelled') return tag('', B('أُلغي', 'Cancelled'));
    if (st === 'recommended' && NS.held[inc.id]) return tag('warn', B('معلّق', 'On hold'));
    return stateTag(st);
  }
  function firstEta(inc) { var p = planOf(inc); if (!p) return null; var best = null; p.units.forEach(function (u) { if (u.unitId && u.etaSec != null && u.state !== 'on-scene' && u.state !== 'cleared' && !u.optional && !u.standby) best = best == null ? u.etaSec : Math.min(best, u.etaSec); }); return best; }

  /* ====================================================================================
   * 7. DOM SKELETON — stage (map + HUD) and dock (tabs)
   * ==================================================================================== */
  var UI = {};
  var TABS = [
    { id: 'incident', icon: 'pin', ar: 'الحادث', en: 'Incident' }, { id: 'dispatch', icon: 'route', ar: 'الإرسال', en: 'Dispatch' }, { id: 'traffic', icon: 'car', ar: 'المرور', en: 'Traffic' },
    { id: 'hazards', icon: 'thermo', ar: 'المخاطر', en: 'Hazards' }, { id: 'kpi', icon: 'chart', ar: 'المؤشرات', en: 'KPIs' }, { id: 'ab', icon: 'target', ar: 'مقارنة A/B', en: 'A/B' }, { id: 'log', icon: 'clock', ar: 'السجل', en: 'Log' }
  ];
  function build(root) {
    var stage = h('div', { class: 'nat-stage', id: 'nat-stage' });
    var cvs = h('canvas', { id: 'nat-canvas', class: 'nat-canvas', tabindex: '0', role: 'application', 'aria-describedby': 'nat-summary', 'aria-keyshortcuts': 'ArrowUp ArrowDown ArrowLeft ArrowRight + - 0 Enter [ ]' });
    lab(cvs, 'aria-label', 'خريطة قطر التفاعلية. الأسهم للتحريك، زائد وناقص للتقريب، صفر لعرض البلاد كلها، Enter لتنفيذ الأداة المختارة في وسط الخريطة.', 'Interactive map of Qatar. Arrow keys pan, plus and minus zoom, zero fits the whole country, Enter applies the selected tool at the map centre.');
    UI.cvs = cvs; UI.stage = stage;
    UI.summary = h('p', { id: 'nat-summary', class: 'sr-only' });
    UI.cross = h('div', { class: 'nat-cross', 'aria-hidden': 'true' }, h('i'), h('i'));
    UI.tip = h('div', { class: 'nat-tip', hidden: true, role: 'tooltip' });
    UI.banner = h('div', { class: 'nat-banner', hidden: true });
    UI.load = h('div', { class: 'nat-load', role: 'status' }, h('i', { class: 'nat-spin', 'aria-hidden': 'true' }), h('span', null, bi('جارٍ تجهيز نموذج الازدحام والوحدات…', 'Preparing the traffic and fleet model…')));
    UI.pstrip = h('div', { class: 'nat-pstrip', 'aria-hidden': 'true' });
    UI.tourText = h('span', { class: 'nat-tour-t' }); UI.tourCount = h('b', { class: 'nat-tour-n mono' });
    UI.tourBar = h('div', { class: 'nat-tour', hidden: true }, icon('play'), UI.tourCount, UI.tourText, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { stopTour(false); } }, icon('x'), bi('أوقف الجولة', 'Stop the tour')));
    stage.appendChild(cvs); stage.appendChild(UI.cross); stage.appendChild(buildHud()); stage.appendChild(UI.banner); stage.appendChild(UI.tip); stage.appendChild(UI.load); stage.appendChild(UI.pstrip); stage.appendChild(UI.tourBar); stage.appendChild(buildWelcome()); stage.appendChild(UI.summary); stage.appendChild(buildAttribution());
    var dock = buildDock();
    var wrap = h('div', { class: 'nat-main' }, stage, dock);
    root.appendChild(wrap);
    UI.root = root; UI.dock = dock;
  }
  function buildAttribution() {
    var snapDate = (GEO.meta && GEO.meta.snapshotDate) || '';
    UI.attrib = h('p', { class: 'nat-attrib' },
      h('span', { class: 'nat-attrib-a' }, bi('بيانات الخريطة © مساهمو ', 'Map data © '), h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, 'OpenStreetMap'), bi('، رخصة ODbL', ' contributors, ODbL')),
      h('span', { class: 'nat-attrib-b' }, ' · ', bi('لقطة ', 'snapshot '), h('bdi', { class: 'mono' }, snapDate)),
      h('span', { class: 'nat-attrib-c' }, ' · ', tag('warn', 'SIM'), ' ', bi('الازدحام والوحدات والمخاطر محاكاة', 'traffic · units · hazards SIMULATED')));
    return UI.attrib;
  }
  function buildHud() {
    var hud = h('div', { class: 'nat-hud' });
    // top-start: the clock and play controls, then the tool picker
    UI.clock = h('span', { class: 'nat-clock mono' }); UI.clockSub = h('small', { class: 'nat-clock-sub' });
    UI.play = h('button', { type: 'button', class: 'btn btn-ghost btn-sm nat-play', onclick: function () { setPlaying(!NS.playing); } });
    UI.speed = seg([{ id: 1, ar: '١×', en: '1×', ar2: 'السرعة: ثانية محاكاة لكل ثانية', en2: 'Speed: 1 simulated second per second' }, { id: 10, ar: '١٠×', en: '10×', ar2: 'السرعة ١٠ أضعاف', en2: 'Speed 10×' }, { id: 30, ar: '٣٠×', en: '30×', ar2: 'السرعة ٣٠ ضعفًا', en2: 'Speed 30×' }, { id: 60, ar: '٦٠×', en: '60×', ar2: 'السرعة ٦٠ ضعفًا', en2: 'Speed 60×' }], function () { return NS.speed; }, function (v) { setSpeed(+v); }, ['سرعة المحاكاة', 'Simulation speed']);
    UI.speed.classList.add('nat-speed');
    var row1 = h('div', { class: 'nat-row nat-row1' }, h('span', { class: 'tag warn nat-simchip' }, bi('محاكاة', 'SIM')), h('div', { class: 'nat-clockbox' }, UI.clock, UI.clockSub), UI.play);
    UI.tools = seg([{ id: 'incident', icon: 'pin', ar: 'حادث', en: 'Incident', ar2: 'أداة الحادث: انقر على الخريطة لوضع حادث', en2: 'Incident tool: click the map to place an incident' },
      { id: 'jam', icon: 'car', ar: 'ازدحام', en: 'Jam', ar2: 'أداة الازدحام: انقر على طريق لتزدحم أو لإزالة الازدحام', en2: 'Jam tool: click a road to jam it or to clear the jam' },
      { id: 'close', icon: 'x', ar: 'إغلاق', en: 'Close', ar2: 'أداة الإغلاق: انقر على طريق لإغلاقه أو فتحه', en2: 'Close tool: click a road to close or re-open it' },
      { id: 'inspect', icon: 'eye', ar: 'فحص', en: 'Inspect', ar2: 'أداة الفحص: انقر على أي عنصر لمعرفة تفاصيله', en2: 'Inspect tool: click anything to see its details' }], function () { return NS.tool; }, function (v) { setTool(v); }, ['أداة الخريطة', 'Map tool']);
    UI.tools.classList.add('nat-tools');
    var row2 = h('div', { class: 'nat-row nat-row2' }, UI.tools, UI.speed);
    UI.hint = h('p', { class: 'nat-hint' });
    var tl = h('div', { class: 'nat-tl' }, row1, row2, UI.hint);
    // top-end: zoom and view buttons
    var zin = iconBtn('zoomin', 'تقريب', 'Zoom in', function () { var s = UI.map(); NS.map.zoomAt(s.w / 2, s.h / 2, 1.5); }, 'nat-zb');
    var zout = iconBtn('zoomout', 'تبعيد', 'Zoom out', function () { var s = UI.map(); NS.map.zoomAt(s.w / 2, s.h / 2, 1 / 1.5); }, 'nat-zb');
    var fit = iconBtn('globe', 'عرض قطر كلها', 'Show all of Qatar', function () { NS.map.home(600); }, 'nat-zb');
    UI.presentBtn = iconBtn('present', 'وضع العرض (P)', 'Present mode (P)', function () { setPresent(!NS.present); }, 'nat-zb'); UI.presentBtn.setAttribute('aria-pressed', 'false');
    var keys = iconBtn('keyboard', 'اختصارات لوحة المفاتيح', 'Keyboard shortcuts', function () { toggleKeys(); }, 'nat-zb nat-keysbtn'); UI.keysBtn = keys; keys.setAttribute('aria-expanded', 'false');
    UI.keys = h('div', { class: 'nat-keys', hidden: true, role: 'dialog' }, h('b', null, bi('اختصارات الخريطة', 'Map shortcuts')),
      h('ul', null, [['الأسهم', 'Arrows', 'تحريك الخريطة', 'Pan'], ['+ / −', '+ / −', 'تقريب / تبعيد', 'Zoom in / out'], ['0', '0', 'عرض قطر كلها', 'Fit all of Qatar'], ['Enter', 'Enter', 'تنفيذ الأداة في وسط الخريطة', 'Apply the tool at the map centre'], ['[  ]', '[  ]', 'الحادث السابق / التالي', 'Previous / next incident'], ['P', 'P', 'وضع العرض', 'Present mode'], ['Esc', 'Esc', 'إغلاق / إلغاء التحديد', 'Close / clear selection']].map(function (r) {
        return h('li', null, h('kbd', null, bi(r[0], r[1])), ' ', bi(r[2], r[3]));
      })));
    lab(UI.keys, 'aria-label', 'اختصارات الخريطة', 'Map shortcuts');
    var tr = h('div', { class: 'nat-tr' }, h('div', { class: 'nat-zoom' }, zin, zout, fit), h('div', { class: 'nat-zoom nat-zoom2' }, UI.presentBtn, keys), UI.keys);
    // bottom-start: legend (real vs simulated)
    var leg = buildLegend();
    function kchip(id, ar, en) { var v = h('b', { class: 'mono' }, '–'); UI.kv[id] = v; return h('span', { class: 'nat-kc' }, v, h('small', null, bi(ar, en))); }
    UI.kv = {};
    UI.kstrip = h('button', { type: 'button', class: 'nat-kstrip', onclick: function () { showTab('kpi', true); } }, kchip('inc', 'حوادث نشطة', 'Active incidents'), kchip('units', 'وحدات متاحة', 'Units available'), kchip('eta', 'متوسط أول وحدة', 'Mean first unit'), kchip('spd', 'سرعة المرور', 'Traffic speed'));
    lab(UI.kstrip, 'title', 'المؤشرات الوطنية (محاكاة): اضغط لفتح لوحة المؤشرات', 'National KPIs (simulated): press to open the KPIs panel');
    hud.appendChild(tl); hud.appendChild(UI.kstrip); hud.appendChild(tr); hud.appendChild(leg);
    return hud;
  }
  UI.map = function () { return NS.map ? NS.map.size() : { w: 800, h: 600 }; };
  function legendSwatch(kind) {
    var s = sv('svg', { class: 'nat-sw', viewBox: '0 0 22 22', width: '20', height: '20', 'aria-hidden': 'true', focusable: 'false' });
    var red = 'var(--danger)', surf = 'var(--surface)';
    if (kind === 'ed') { s.appendChild(sv('rect', { x: 2, y: 2, width: 18, height: 18, rx: 5, fill: red })); s.appendChild(sv('path', { d: 'M9.3 5.5h3.4v3.8h3.8v3.4h-3.8v3.8H9.3v-3.8H5.5V9.3h3.8z', fill: '#fff' })); }
    else if (kind === 'hosp') { s.appendChild(sv('rect', { x: 2.5, y: 2.5, width: 17, height: 17, rx: 5, fill: surf, stroke: red, 'stroke-width': 1.8, opacity: .8 })); s.appendChild(sv('path', { d: 'M9.5 6h3v3.5H16v3h-3.5V16h-3v-3.5H6v-3h3.5z', fill: red, opacity: .8 })); }
    else if (kind === 'fire') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 9, fill: 'var(--fire-3)' })); s.appendChild(sv('path', { d: 'M11 4.5c3 2.2 4.5 4.6 4.5 7.1a4.5 4.5 0 0 1-9 0c0-1.600.8-2.700 1.800-3.800.3 1 .8 1.600 1.500 1.900C9.600 7.800 10 6.200 11 4.500z', fill: '#fff' })); }
    else if (kind === 'police') { s.appendChild(sv('path', { d: 'M11 2l7.500 3v5.500c0 4.500-3 8-7.500 9.500C6.500 18.500 3.500 15 3.500 10.500V5z', fill: 'var(--info)' })); s.appendChild(sv('circle', { cx: 11, cy: 10, r: 3, fill: '#fff' })); }
    else if (kind === 'amb') { s.appendChild(sv('rect', { x: 1.5, y: 5, width: 19, height: 12, rx: 4, fill: surf, stroke: red, 'stroke-width': 2 })); s.appendChild(sv('path', { d: 'M9 7.500h2v2.500h2.500v2H11v2.500H9V12H6.500v-2H9z', fill: red })); }
    else if (kind === 'unit') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 8, fill: 'var(--bg)', stroke: 'var(--brand)', 'stroke-width': 2.200 })); s.appendChild(sv('circle', { cx: 11, cy: 11, r: 4.500, fill: 'var(--danger)' })); }
    else if (kind === 'inc') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 9, fill: 'var(--fire-3)', stroke: surf, 'stroke-width': 2 })); s.appendChild(sv('circle', { cx: 11, cy: 11, r: 3.200, fill: '#fff' })); }
    else if (kind === 'jam') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 8, fill: 'var(--warn)' })); s.appendChild(sv('path', { d: 'M11 6v6M11 15v1', stroke: 'var(--bg)', 'stroke-width': 2.200, 'stroke-linecap': 'round' })); }
    else if (kind === 'closed') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 8, fill: 'var(--danger)' })); s.appendChild(sv('path', { d: 'M8 8l6 6M14 8l-6 6', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' })); }
    else if (kind === 'tunnel') { s.appendChild(sv('circle', { cx: 11, cy: 11, r: 7.500, fill: 'var(--surface)', stroke: 'var(--info)', 'stroke-width': 2 })); }
    return s;
  }
  function buildLegend() {
    function row(sw, ar, en) { return h('li', null, sw, h('span', null, bi(ar, en))); }
    var det = h('details', { class: 'nat-legend' });
    det.appendChild(h('summary', null, icon('layers'), bi('ما الحقيقي وما المحاكى', 'Real vs simulated')));
    det.appendChild(h('div', { class: 'nat-legend-b' },
      h('div', { class: 'nat-lg-col' }, h('p', { class: 'nat-lg-h real' }, tag('safe', B('حقيقي', 'REAL')), ' ', bi('لقطة OpenStreetMap', 'OpenStreetMap snapshot')),
        h('ul', null, row(legendSwatch('ed'), 'مستشفى مع قسم طوارئ مؤكد', 'Hospital with a confirmed ED'), row(legendSwatch('hosp'), 'مستشفى (الطوارئ غير مؤكدة في البيانات)', 'Hospital (ED not confirmed in the data)'), row(legendSwatch('fire'), 'مركز إطفاء / دفاع مدني', 'Fire / Civil Defence station'), row(legendSwatch('police'), 'مخفر شرطة', 'Police station'), row(legendSwatch('amb'), 'نقطة إسعاف', 'Ambulance point')),
        h('p', { class: 'nat-lg-s' }, bi('الحدود والبلديات الثماني والأماكن والطرق الرئيسية.', 'Outline, the 8 municipalities, places and the major roads.'))),
      h('div', { class: 'nat-lg-col' }, h('p', { class: 'nat-lg-h sim' }, tag('warn', B('محاكاة', 'SIM')), ' ', bi('فوق الخريطة', 'on top of the map')),
        h('ul', null, row(legendSwatch('unit'), 'وحدة استجابة متحركة (مكانها وتوفّرها محاكاة)', 'A moving response unit (position and availability simulated)'), row(legendSwatch('inc'), 'حادث وضعه المشغّل', 'An incident placed by the operator'), row(legendSwatch('jam'), 'طريق مزدحم بقرار المشغّل', 'Road jammed by the operator'), row(legendSwatch('closed'), 'طريق مغلق', 'Closed road'), row(legendSwatch('tunnel'), 'نفق / معبر منخفض (قد يغمره المطر)', 'Tunnel / low underpass (can flood)')),
        h('div', { class: 'nat-ramp' }, h('i', { 'aria-hidden': 'true' }), h('span', null, bi('سرعة عادية (رمادي)', 'Normal speed (grey)')), h('span', null, bi('أقل من نصف السرعة … شبه متوقف', 'Below half speed … crawling'))),
        h('p', { class: 'nat-lg-s' }, bi('الازدحام والحرارة والغبار والمطر وكل أزمنة الوصول محاكاة. 999 هي المُرسِل الحقيقي.', 'Traffic, heat, dust, rain and every ETA are simulated. 999 is the real dispatcher.')))));
    UI.legend = det; return det;
  }
  function toggleKeys() { var open = UI.keys.hidden; UI.keys.hidden = !open; UI.keysBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }

  function buildDock() {
    var dock = h('aside', { class: 'nat-dock', 'data-sheet': NS.sheet, 'aria-label': B('لوحات الخريطة الوطنية', 'National panels') });
    lab(dock, 'aria-label', 'لوحات الخريطة الوطنية', 'National panels');
    UI.grab = h('button', { type: 'button', class: 'nat-grab', 'aria-expanded': 'true', onclick: function () { cycleSheet(); } }, h('i', { 'aria-hidden': 'true' }));
    lab(UI.grab, 'aria-label', 'تكبير أو تصغير اللوحات', 'Expand or collapse the panels');
    UI.tabs = h('div', { class: 'tablist nat-tabs scroll-x', role: 'tablist' }); lab(UI.tabs, 'aria-label', 'لوحات غرفة العمليات الوطنية', 'National operations panels');
    UI.panes = h('div', { class: 'nat-panes' });
    UI.tabBtns = {}; UI.paneEls = {};
    TABS.forEach(function (t) {
      var b = h('button', { type: 'button', class: 'tab', role: 'tab', id: 'ntab-' + t.id, 'aria-controls': 'npane-' + t.id, 'aria-selected': 'false', tabindex: '-1', onclick: function () { showTab(t.id, true); } }, icon(t.icon), bi(t.ar, t.en));
      b.addEventListener('keydown', function (e) {
        var i = TABS.indexOf(t), rtl = doc.documentElement.dir === 'rtl', d = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0;
        if (!d) return; e.preventDefault(); var j = d === -99 ? 0 : d === 99 ? TABS.length - 1 : (i + d + TABS.length) % TABS.length; showTab(TABS[j].id, true); UI.tabBtns[TABS[j].id].focus();
      });
      UI.tabBtns[t.id] = b; UI.tabs.appendChild(b);
      var p = h('section', { class: 'nat-pane', role: 'tabpanel', id: 'npane-' + t.id, 'aria-labelledby': 'ntab-' + t.id, hidden: true, tabindex: '-1' });
      UI.paneEls[t.id] = p; UI.panes.appendChild(p);
    });
    dock.appendChild(UI.grab); dock.appendChild(UI.tabs); dock.appendChild(UI.panes);
    return dock;
  }
  function cycleSheet() { var order = ['peek', 'half', 'full'], i = order.indexOf(NS.sheet); setSheet(order[(i + 1) % 3]); }
  function setSheet(s) { NS.sheet = s; UI.dock.setAttribute('data-sheet', s); UI.grab.setAttribute('aria-expanded', s === 'peek' ? 'false' : 'true'); setTimeout(resizeMap, 60); setTimeout(resizeMap, 330); }
  function showTab(id, focusless) {
    if (!UI.paneEls[id]) return; NS.tab = id;
    TABS.forEach(function (t) { var on = t.id === id; UI.paneEls[t.id].hidden = !on; UI.tabBtns[t.id].setAttribute('aria-selected', on ? 'true' : 'false'); UI.tabBtns[t.id].tabIndex = on ? 0 : -1; });
    if (UI.dock.getAttribute('data-sheet') === 'peek') setSheet('half');
    if (NS.nat) { NS.zones.forEach(function (z) { if (z.panel === id) z.sig = null; }); refreshZones(true); if (id === 'traffic') drawProfile(); if (id === 'ab') { drawAB(); drawAB2(); if (!NS.ab && !NS.abRunning && !NS.abAuto) { NS.abAuto = true; runAB(); } } if (id === 'kpi') drawTrend(); }
    UI.paneEls[id].scrollTop = 0;
  }
  function setPresent(on) {
    NS.present = !!on; UI.root.setAttribute('data-present', on ? '1' : '0'); UI.presentBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try { doc.body.classList.toggle('nat-present', !!on); } catch (e) { /* ignore */ }
    if (on) { UI.legend.open = false; announce(B('وضع العرض: اضغط Esc للخروج', 'Present mode: press Esc to leave')); updatePresent(); }
    setTimeout(resizeMap, 60); refreshZones(true);
  }

  /* ====================================================================================
   * 8. MAP INTERACTION — drag, wheel, pinch, click, hover, keyboard
   * ==================================================================================== */
  function resizeMap() {
    if (!NS.map || !UI.stage) return; var r = UI.stage.getBoundingClientRect(); if (r.width < 40 || r.height < 40) return;
    NS.map.resize(Math.round(r.width), Math.round(r.height), Math.min(2, win.devicePixelRatio || 1)); NS.map.dirty = true;
  }
  function pt(e) { var r = UI.cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function attachMapEvents() {
    var cvs = UI.cvs, P = { pts: {}, n: 0, sx: 0, sy: 0, moved: false, pd: 0, pcx: 0, pcy: 0, lx: 0, ly: 0 };
    cvs.addEventListener('pointerdown', function (e) {
      NS.lastInput = now(); if (e.button != null && e.button > 0) return; cvs.focus({ preventScroll: true });
      try { cvs.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      var p = pt(e); P.pts[e.pointerId] = p; P.n = Object.keys(P.pts).length;
      if (P.n === 1) { P.sx = P.lx = p.x; P.sy = P.ly = p.y; P.moved = false; }
      else if (P.n === 2) { var q = Object.keys(P.pts).map(function (k) { return P.pts[k]; }); P.pd = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y); P.pcx = (q[0].x + q[1].x) / 2; P.pcy = (q[0].y + q[1].y) / 2; P.moved = true; }
      UI.tip.hidden = true;
    });
    cvs.addEventListener('pointermove', function (e) {
      var p = pt(e);
      if (P.pts[e.pointerId]) {
        P.pts[e.pointerId] = p;
        if (P.n === 1) { if (!P.moved && Math.hypot(p.x - P.sx, p.y - P.sy) > 5) P.moved = true; if (P.moved) { NS.map.panBy(p.x - P.lx, p.y - P.ly); P.lx = p.x; P.ly = p.y; cvs.classList.add('grabbing'); } }
        else if (P.n === 2) {
          var q = Object.keys(P.pts).map(function (k) { return P.pts[k]; }), d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), cx = (q[0].x + q[1].x) / 2, cy = (q[0].y + q[1].y) / 2;
          NS.map.panBy(cx - P.pcx, cy - P.pcy); if (P.pd > 8 && d > 8) NS.map.zoomAt(cx, cy, d / P.pd); P.pd = d; P.pcx = cx; P.pcy = cy;
        }
        return;
      }
      if (e.pointerType === 'mouse') hover(p.x, p.y);
    });
    function up(e) {
      var had = !!P.pts[e.pointerId]; if (!had) return; var p = pt(e); delete P.pts[e.pointerId]; var n0 = P.n; P.n = Object.keys(P.pts).length; cvs.classList.remove('grabbing');
      if (n0 === 1 && !P.moved && e.type === 'pointerup') mapClick(p.x, p.y);
      if (P.n === 1) { var k = Object.keys(P.pts)[0]; P.lx = P.pts[k].x; P.ly = P.pts[k].y; P.moved = true; }
    }
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('pointerleave', function () { if (!P.n) { NS.hover = null; UI.tip.hidden = true; if (NS.map) { NS.map.scene.hover = null; NS.map.dirty = true; } } });
    cvs.addEventListener('wheel', function (e) {
      NS.lastInput = now(); e.preventDefault(); var p = pt(e), f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 0.5 : 0.0016)); NS.map.zoomAt(p.x, p.y, clamp(f, 0.5, 2));
    }, { passive: false });
    cvs.addEventListener('keydown', mapKey);
    cvs.addEventListener('focus', function () { UI.stage.classList.add('kb'); }); cvs.addEventListener('blur', function () { UI.stage.classList.remove('kb'); });
  }
  function hitLabel(hit) {
    if (!hit) return null;
    if (hit.type === 'facility') { var f = NS.map.facilities.filter(function (q) { return q.id === hit.id; })[0]; if (!f) return null; var l0 = facLab(f), sb = facSub(f); return { title: facTitle(f), sub: facKindName(f) + (f.kind === 'hospital' || f.kind === 'clinic-ed' ? ' · ' + edText(f) : '') + (l0 && !l0.verified ? ' · ' + B('غير موثّق', 'unverified') : '') + (sb ? ' · OSM: ' + sb : '') }; }
    if (hit.type === 'unit') { var u = NS.units.filter(function (q) { return q.id === hit.id; })[0]; return u ? { title: nm(u.name), sub: kindName(u.kind) + ' · ' + (u.busy ? B('مشغولة (محاكاة)', 'busy (SIM)') : stateWord(u.state)) } : null; }
    if (hit.type === 'incident') { var i = incById(hit.id); return i ? { title: hit.id + ' — ' + hzName(i.hazard), sub: placeName(i).line } : null; }
    if (hit.type === 'tunnel') { var t = (NS.tunnels || []).filter(function (q) { return String(q.edge) === hit.id; })[0]; return t ? { title: nm(t.name) || B('نفق / معبر', 'Tunnel / underpass'), sub: B('عمق الماء ', 'Water depth ') + N(t.depthCm, 0) + B(' سم (محاكاة)', ' cm (SIM)') + (t.closed ? B(' · مغلق', ' · closed') : '') } : null; }
    if (hit.type === 'road') { var inf = NS.nat ? NN.roadInfo(NS.nat, +hit.id) : null; return inf ? { title: nm(inf.name), sub: (NS.closes[hit.id] ? B('مغلق', 'Closed') : B('مزدحم بقرار المشغّل', 'Jammed by the operator')) } : null; }
    if (hit.type === 'cluster') return { title: N(hit.n) + B(' منشآت هنا', ' facilities here'), sub: B('انقر للتقريب', 'Click to zoom in') };
    return null;
  }
  function stateWord(s) { return { idle: B('متاحة', 'available'), turnout: B('تستعد للخروج', 'turning out'), 'en-route': B('في الطريق', 'en route'), 'on-scene': B('في الموقع', 'on scene'), returning: B('عائدة', 'returning') }[s] || s; }
  function facKindName(f) { var k = f.kind === 'clinic-ed' ? 'hospital' : f.kind; return { hospital: B('مستشفى', 'Hospital'), police: B('شرطة', 'Police'), fire: B('إطفاء / دفاع مدني', 'Fire / Civil Defence'), ambulance: B('نقطة إسعاف', 'Ambulance point') }[k] || k; }
  // display labels come from the engine's label layer (never "unnamed in OSM"): the main label in the UI language, the raw OSM name as a small secondary line
  function facLab(f) { try { return NS.nat ? NN.facilityLabel(NS.nat, f.id) : null; } catch (e) { return null; } }
  function facTitle(f) { var l = facLab(f); return l ? nm(l) : (nm(f.name) || facKindName(f)); }
  function facSub(f) { var l = facLab(f); return l && l.sub && (l.sub.ar || l.sub.en) ? nm(l.sub) : ''; }
  function edText(f) { var l = facLab(f); return f.ed === 'yes' ? (l && l.edVerified ? B('طوارئ مؤكدة (قائمة رسمية)', 'ED confirmed (official list)') : B('طوارئ بحسب وسم OSM (غير مؤكدة رسميًا)', 'ED per an OSM tag (not confirmed officially)')) : B('الطوارئ غير مؤكدة في البيانات', 'ED not confirmed in the data'); }
  function hover(x, y) {
    var hit = NS.map.hit(x, y), key = hit ? hit.type + ':' + hit.id : '';
    if (key !== (NS.hoverKey || '')) { NS.hoverKey = key; NS.hover = hit ? { type: hit.type, id: hit.id } : null; NS.map.scene.hover = NS.hover; NS.map.dirty = true; UI.cvs.style.cursor = hit ? 'pointer' : ''; }
    var lbl = hit ? hitLabel(hit) : null;
    if (!lbl) { UI.tip.hidden = true; return; }
    UI.tip.replaceChildren(h('b', null, lbl.title), h('span', null, lbl.sub)); UI.tip.hidden = false;
    var w = UI.tip.offsetWidth, hh = UI.tip.offsetHeight, sz = NS.map.size(), rtl = doc.documentElement.dir === 'rtl', tx = clamp(x + 14, 4, sz.w - w - 4), ty = clamp(y + 16, 4, sz.h - hh - 4);
    UI.tip.style.insetInlineStart = 'auto'; UI.tip.style.left = tx + 'px'; UI.tip.style.top = ty + 'px';
  }
  function mapClick(x, y) {
    if (!NS.map) return;
    var hit = NS.map.hit(x, y);
    if (hit) {
      if (hit.type === 'incident') { select(hit.id); if (NS.tab !== 'dispatch' && NS.tab !== 'incident') showTab('dispatch', true); return; }
      if (hit.type === 'cluster') { NS.map.zoomAt(hit.x, hit.y, 2.4); return; }
      if (hit.type === 'road') { NS.road = +hit.id; selectThing('road', hit.id); return; }
      selectThing(hit.type, hit.id); return;
    }
    var ll = NS.map.toLL(x, y); applyTool(ll[0], ll[1]);
  }
  function applyTool(lon, lat) {
    if (NS.tool === 'incident') placeIncident({ lon: lon, lat: lat });
    else if (NS.tool === 'jam') { roadAt(lon, lat, 'jam'); }
    else if (NS.tool === 'close') { roadAt(lon, lat, 'close'); }
    else { var e = edgeNear(lon, lat); if (e) { NS.road = e.edge; selectThing('road', String(e.edge)); } else { NS.sel = null; syncScene(); refreshZones(true); } }
  }
  function mapKey(e) {
    NS.lastInput = now(); if (e.ctrlKey || e.metaKey || e.altKey) return;
    var map = NS.map, k = e.key, sz = map.size(), step = 70, used = true;
    if (k === 'ArrowLeft') map.panBy(step, 0); else if (k === 'ArrowRight') map.panBy(-step, 0); else if (k === 'ArrowUp') map.panBy(0, step); else if (k === 'ArrowDown') map.panBy(0, -step);
    else if (k === '+' || k === '=') map.zoomAt(sz.w / 2, sz.h / 2, 1.4); else if (k === '-' || k === '_') map.zoomAt(sz.w / 2, sz.h / 2, 1 / 1.4);
    else if (k === '0') map.home(500);
    else if (k === 'Enter') { var c = map.toLL(sz.w / 2, sz.h / 2); applyTool(c[0], c[1]); }
    else if (k === '[' || k === ']') cycleIncident(k === ']' ? 1 : -1);
    else if (k === 'p' || k === 'P') setPresent(!NS.present);
    else if (k === 'Escape') { if (NS.tour) stopTour(false); else if (NS.present) setPresent(false); else if (!UI.keys.hidden) toggleKeys(); else { NS.sel = null; syncScene(); refreshZones(true); } }
    else used = false;
    if (used) e.preventDefault();
  }
  function cycleIncident(d) {
    var list = NS.snap.incidents; if (!list.length) return; var ix = -1; list.forEach(function (i, q) { if (i.id === NS.selInc) ix = q; });
    var nx = list[(ix + d + list.length) % list.length]; select(nx.id); flyToInc(nx, 500);
  }

  /* ====================================================================================
   * 9. THE FRAME LOOP — simulation time, interpolation, drawing, frame statistics
   * ==================================================================================== */
  function loop(ts) {
    requestAnimationFrame(loop);
    var scope = MC && MC.scope ? MC.scope() : 'national';
    if (scope !== 'national' || !NS.map) { NS.last = 0; return; }
    if (!NS.ready) { NS.map.frame(ts); markPaint(); return; }
    var t0 = now(), dt = NS.last ? Math.min(0.1, (ts - NS.last) / 1000) : 0; NS.last = ts;
    var changed = false;
    if (NS.playing && NS.nat && !NS.abRunning) {
      NS.acc += dt * NS.speed; var steps = Math.min(8, Math.floor(NS.acc / NS.tickSec));
      if (steps > 0) { NS.acc -= steps * NS.tickSec; if (NS.acc > NS.tickSec * 12) NS.acc = 0; NN.step(NS.nat, steps * NS.tickSec); changed = true; }
    }
    if (changed) { takeSnapshot(true); drainEvents(); publishAll(false); syncScene(); NS.dirtyUI = true; }
    if (stepFx(ts)) NS.map.dirty = true;
    NS.map.frame(ts);
    var tn = now();
    if (tn - NS.uiAt > 400 || NS.dirtyUI) { NS.uiAt = tn; NS.dirtyUI = false; uiTick(); }
    var d = tn - t0; NS.frames.push(tn - (NS.fpsLast || tn)); NS.fpsLast = tn; if (NS.frames.length > 240) NS.frames.shift(); NS.lastWork = d;
    markPaint();
  }
  function markPaint() { if (NS.firstPaintMs == null && NS.map && NS.map.stats.frames > 0) { NS.firstPaintMs = Math.round(now()); try { UI.root.setAttribute('data-first-paint', String(NS.firstPaintMs)); } catch (e) { /* ignore */ } } }
  NS.uiAt = 0;
  function uiTick() {
    if (!NS.nat) return;
    var s = NS.snap; if (!s) return;
    setT(UI.clock, DOW_SHORT(s.dow) + ' ' + s.clock.slice(0, 5)); setT(UI.clockSub, (s.dayType === 'fri' || s.dayType === 'sat' ? B('عطلة نهاية الأسبوع', 'Weekend') : B('يوم عمل', 'Work day')) + ' · ' + (NS.opts.season === 'summer' ? B('صيف', 'summer') : B('شتاء', 'winter')) + ' · ' + s.date);
    syncPlayUI(); refreshZones(false); tickEta(); updateSummary(); updatePresent(); syncHint(); updateWelcome();
    if (s.kpis && UI.kv) { var k = s.kpis; setT(UI.kv.inc, N(k.incidents.active)); setT(UI.kv.units, N(k.units.available) + '/' + N(k.units.total)); setT(UI.kv.eta, k.meanFirstEtaActiveSec != null ? mmss(k.meanFirstEtaActiveSec) : 'N/A'); setT(UI.kv.spd, N(Math.round(k.traffic.meanSpeedRatio * 100)) + '%'); }
    if (s.t - NS.kpiHistT >= 120 && s.kpis) { NS.kpiHistT = s.t; NS.kpiHist.push({ t: s.t, eta: s.kpis.meanFirstEtaActiveSec, speed: s.kpis.traffic.meanSpeedRatio, active: s.kpis.incidents.active }); if (NS.kpiHist.length > 240) NS.kpiHist.shift(); if (NS.tab === 'kpi') drawTrend(); }
  }
  function DOW_SHORT(d) { return B(DOW[d][0], DOW[d][1]); }
  function tickEta() {
    var inc = selectedInc(), p = planOf(inc); if (!p) return;
    $$('[data-eta]', UI.paneEls.dispatch).forEach(function (el) {
      var slot = el.getAttribute('data-eta'), u = p.units.filter(function (q) { return (q.slot || q.kind) === slot; })[0];
      if (u) setT(el, u.state === 'on-scene' ? B('في الموقع', 'On scene') : u.state === 'cleared' ? '—' : minTxt(u.etaSec));
    });
  }
  function updateSummary() {
    var s = NS.snap; if (!s || !UI.summary) return;
    var act = s.incidents.filter(function (i) { return i.status !== 'cleared' && i.status !== 'cancelled'; }), sel = selectedInc(), parts = [];
    parts.push(B('خريطة قطر. ', 'Map of Qatar. ') + B('حوادث نشطة: ', 'Active incidents: ') + N(act.length) + '. ');
    if (sel) { var p = planOf(sel); parts.push(B('المحدد: ', 'Selected: ') + sel.id + ' ' + hzName(sel.hazard) + ', ' + placeName(sel).line + '. ' + B('الحالة: ', 'State: ') + stateName(statusOf(sel)) + '. '); if (p) p.units.forEach(function (u) { if (u.unitId && u.etaSec != null) parts.push(kindName(u.kind) + ' ' + B('خلال ', 'ETA ') + minTxt(u.etaSec) + '. '); }); }
    setT(UI.summary, parts.join(''));
  }
  function syncHint() {
    if (!UI.hint) return;
    var tl = { incident: B('انقر على الخريطة لوضع حادث: ', 'Click the map to place an incident: ') + hzName(NS.hazard), jam: B('انقر على طريق ليزدحم (أو لإزالة الازدحام)', 'Click a road to jam it (or to clear the jam)'), close: B('انقر على طريق لإغلاقه (أو لفتحه)', 'Click a road to close it (or re-open it)'), inspect: B('انقر على أي عنصر لتفاصيله', 'Click anything for details') };
    setT(UI.hint, tl[NS.tool] || '');
  }
  function fps() {
    var f = NS.frames.slice(-120); if (f.length < 5) return null; var sorted = f.slice().sort(function (a, b) { return a - b; });
    var mean = f.reduce(function (a, b) { return a + b; }, 0) / f.length; return { frames: f.length, meanMs: +mean.toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), maxMs: +sorted[sorted.length - 1].toFixed(2), fps: +(1000 / mean).toFixed(1) };
  }
  // pan + zoom for N frames and report the frame times (the test and the performance budget use this)
  function benchmark(o) {
    o = o || {}; var n = o.frames || 150, map = NS.map, sz = map.size(), i = 0, times = [], last = 0, workMs = [], ang = 0;
    return new Promise(function (resolve) {
      function f(ts) {
        if (last) times.push(ts - last); last = ts; var t0 = now();
        ang += 0.07; var z = i % 60 < 30 ? 1.025 : 1 / 1.025; map.panBy(Math.cos(ang) * 14, Math.sin(ang) * 9); map.zoomAt(sz.w * 0.5 + Math.cos(ang) * 80, sz.h * 0.5, z);
        NS.map.dirty = true; workMs.push(now() - t0);
        if (++i < n) requestAnimationFrame(f); else {
          var s = times.slice().sort(function (a, b) { return a - b; }), mean = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
          resolve({ frames: times.length, meanMs: +mean.toFixed(2), p50Ms: +s[Math.floor(s.length * 0.5)].toFixed(2), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2), maxMs: +s[s.length - 1].toFixed(2), fps: +(1000 / mean).toFixed(1), cacheRenders: map.stats.cacheRenders, lastCacheMs: +map.stats.lastCacheMs.toFixed(1) });
        }
      }
      requestAnimationFrame(f);
    });
  }

  /* ====================================================================================
   * 10. PANELS
   * ==================================================================================== */
  function tok(n) { return getComputedStyle(doc.documentElement).getPropertyValue(n).trim() || '#888'; }
  function field(ar, en, control) { return h('label', { class: 'field nat-field' }, h('span', null, bi(ar, en)), control); }

  /* ---------------------------------------------------------------- 10.1 INCIDENT */
  var NEEDS = [['ed', 'طوارئ عامة', 'General emergency'], ['trauma', 'إصابات بالغة', 'Trauma'], ['paed', 'أطفال', 'Paediatric']];
  function fillJump() {
    var s = UI.jump; if (!s) return; var keep = s.value; s.replaceChildren(h('option', { value: '' }, B('اقفز إلى مكان…', 'Jump to a place…')));
    var g1 = h('optgroup', { label: B('البلديات', 'Municipalities') });
    GEO.municipalities.forEach(function (m) { g1.appendChild(h('option', { value: 'm:' + m.id }, nm(m.name))); });
    var g2 = h('optgroup', { label: B('المدن والبلدات', 'Cities and towns') });
    GEO.places.filter(function (p) { return p.kind === 'city' || p.kind === 'town'; }).sort(function (a, b) { return nm(a.name).localeCompare(nm(b.name), lang()); }).forEach(function (p) { g2.appendChild(h('option', { value: 'p:' + p.id }, nm(p.name))); });
    s.appendChild(g1); s.appendChild(g2); s.value = keep;
  }
  function jumpTo(v) {
    if (!v) return; var k = v.slice(0, 1), id = v.slice(2);
    if (k === 'm') flyToMuni(id); else { var p = GEO.places.filter(function (q) { return q.id === id; })[0]; if (p) NS.map.flyTo({ lon: p.lon, lat: p.lat, ppk: 14 }, 700); }
  }
  function buildIncidentPane() {
    var p = UI.paneEls.incident;
    UI.hzBtns = {};
    var grid = h('div', { class: 'nat-hzgrid', role: 'radiogroup' }); lab(grid, 'aria-label', 'نوع الخطر', 'Hazard type');
    HZ_ORDER.forEach(function (hz) {
      var b = h('button', { type: 'button', class: 'nat-hz', role: 'radio', 'aria-checked': 'false', 'data-hz': hz, onclick: function () { NS.hazard = hz; NS.patients = defaultPatients(hz); syncControls(); syncHint(); } }, hzIcon(hz), h('span', null, bi(NN.HAZARD_NAME[hz].ar, NN.HAZARD_NAME[hz].en)));
      UI.hzBtns[hz] = b; grid.appendChild(b);
      b.addEventListener('keydown', function (e) {                                          // radiogroup: arrows move the choice (direction follows the language)
        var k = e.key, rtl = doc.documentElement.dir === 'rtl', d = (k === 'ArrowRight' ? (rtl ? -1 : 1) : k === 'ArrowLeft' ? (rtl ? 1 : -1) : k === 'ArrowDown' ? 3 : k === 'ArrowUp' ? -3 : 0);
        if (!d) return; e.preventDefault(); var i = HZ_ORDER.indexOf(hz), j = clamp(i + d, 0, HZ_ORDER.length - 1); NS.hazard = HZ_ORDER[j]; NS.patients = defaultPatients(NS.hazard); syncControls(); syncHint(); UI.hzBtns[NS.hazard].focus();
      });
    });
    UI.sevSeg = seg([{ id: 1, ar: 'محدود', en: 'Minor' }, { id: 2, ar: 'متوسط', en: 'Moderate' }, { id: 3, ar: 'شديد', en: 'Severe' }], function () { return NS.sev; }, function (v) { NS.sev = +v; }, ['شدة الحادث', 'Incident severity']);
    UI.patIn = h('input', { type: 'number', class: 'input', min: '0', max: '6', step: '1', value: '0', inputmode: 'numeric' });
    UI.patIn.addEventListener('change', function () { NS.patients = clamp(parseInt(UI.patIn.value, 10) || 0, 0, 6); UI.patIn.value = NS.patients; });
    UI.patNeed = h('select', { class: 'input' }, NEEDS.map(function (n) { return h('option', { value: n[0], 'data-ar': n[1], 'data-en': n[2] }, B(n[1], n[2])); }));
    UI.patNeed.addEventListener('change', function () { NS.patNeed = UI.patNeed.value; });
    UI.patRow = h('div', { class: 'nat-two nat-pat' }, field('عدد المصابين', 'Patients', UI.patIn), field('نوع الحاجة', 'Care needed', UI.patNeed));
    UI.jump = h('select', { class: 'input nat-jump' }); lab(UI.jump, 'aria-label', 'اقفز إلى بلدية أو مدينة', 'Jump to a municipality or city'); UI.jump.addEventListener('change', function () { jumpTo(UI.jump.value); UI.jump.value = ''; }); fillJump();
    var centreBtn = btn('btn btn-primary btn-sm', 'pin', 'ضع الحادث في وسط الخريطة', 'Place at the map centre', function () { var c = NS.map.view().center; placeIncident({ lon: c[0], lat: c[1] }); });
    centreBtn.id = 'nat-place-centre';
    p.appendChild(card('ضع حادثًا', 'Place an incident', [
      para('اختر نوع الخطر ثم انقر على الخريطة في أي مكان من قطر. أنت تملك المفتاح: لا يُرسل شيء قبل موافقتك.', 'Pick the hazard, then click anywhere on the map of Qatar. You hold the key: nothing is sent before you approve.'),
      grid, field('الشدة', 'Severity', UI.sevSeg), UI.patRow, h('div', { class: 'nat-btnrow' }, centreBtn, UI.jump)], simTag(), 'nat-place'));
    p.appendChild(zone('incident', 'inspector', inspSig, renderInspector));
    var tourBtn = btn('btn btn-ghost btn-sm', 'play', 'جولة موجّهة (٦٠ ثانية)', 'Guided tour (60 s)', function () { startTour(1); }, { id: 'nat-tour' });
    p.appendChild(card('الحوادث', 'Incidents', [zone('incident', 'inclist', incListSig, renderIncList), h('div', { class: 'nat-btnrow' }, tourBtn)], null, 'nat-list'));
    var pubRow = toggleRow('انشر الحوادث المعتمدة إلى هواتف السكان', 'Publish approved incidents to residents\' phones', NS.pubPhones, function (v) { NS.pubPhones = v; if (v) publishAll(true); else clearPublished(); refreshZones(true); }, 'nat-pub-phones');
    p.appendChild(card('الهواتف', 'Residents\' phones', [para('بعد موافقتك يصل التنبيه والإرسال إلى صفحة هواتف السكان عبر الناقل المشترك (رسائل scope: national). الهاتف يقرر من يُنبَّه بحسب بُعده عن الحادث.', 'After your approval the alert and the dispatch reach the residents\' phones page over the shared bus (messages with scope: national). Each phone decides who is alerted by its distance from the incident.'), pubRow,
      h('div', { class: 'nat-btnrow' }, h('a', { class: 'btn btn-ghost btn-sm', href: 'alert.html', target: '_blank', rel: 'noopener' }, icon('phone'), bi('افتح هواتف السكان', 'Open the residents\' phones'), icon('external')))]));
    p.appendChild(simNote());
  }
  function incListSig() { return NS.snap.incidents.map(function (i) { return i.id + statusOf(i) + (NS.held[i.id] ? 'h' : '') + (i.id === NS.selInc ? '*' : ''); }).join(',') + NS.showDone; }
  function renderIncList() {
    var all = NS.snap.incidents, list = NS.showDone ? all : all.filter(function (i) { return statusOf(i) !== 'cleared' && statusOf(i) !== 'cancelled' || i.id === NS.selInc; }), done = all.length - all.filter(function (i) { return statusOf(i) !== 'cleared' && statusOf(i) !== 'cancelled'; }).length;
    var tog = done ? h('button', { type: 'button', class: 'chip', 'aria-pressed': NS.showDone ? 'true' : 'false', onclick: function () { NS.showDone = !NS.showDone; touchZone('inclist'); refreshZones(true); } }, bi('أظهر المنتهية (' + N(done) + ')', 'Show finished (' + N(done) + ')')) : null;
    if (!list.length) return [emptyState('pin', 'لا توجد حوادث نشطة. انقر على الخريطة لوضع واحد.', 'No active incidents. Click the map to place one.'), tog];
    return [tog, h('ul', { class: 'nat-inclist' }, list.slice().reverse().map(function (inc) {
      return h('li', null, h('button', { type: 'button', class: 'nat-inc' + (inc.id === NS.selInc ? ' sel' : ''), 'aria-pressed': inc.id === NS.selInc ? 'true' : 'false', onclick: function () { select(inc.id); flyToInc(inc, 600); } },
        hzIcon(inc.hazard), h('span', { class: 'nat-inc-m' }, h('b', null, inc.id + ' · ' + hzName(inc.hazard)), h('small', null, placeName(inc).line)), statusTag(inc)));
    }))];
  }
  function inspSig() {
    var inc = selectedInc(), p = planOf(inc), s = NS.sel, sig = inc ? inc.id + ':' + statusOf(inc) + ':' + (NS.held[inc.id] ? 1 : 0) + ':' + (inc.cordonM ? 1 : 0) + ':' + (NS.pub[inc.id] && NS.pub[inc.id].alert ? 1 : 0) + ':' + Math.round(firstEta(inc) / 30) : 'none';
    if (s) sig += '|' + s.type + s.id + (s.type === 'road' ? ':' + (NS.jams[s.id] || 0) + (NS.closes[s.id] || 0) : '') + (s.type === 'unit' || s.type === 'facility' ? ':' + NS.units.map(function (u) { return u.busy ? 1 : 0; }).join('') : '');
    return sig + '|' + (NS.banner ? NS.banner.t : '');
  }
  function renderInspector() {
    var out = [], inc = selectedInc();
    if (NS.sel) out.push(renderSelected(NS.sel));
    if (inc) out.push(incidentCard(inc));
    else if (!NS.sel) out.push(h('section', { class: 'pn nat-card' }, h('div', { class: 'pn-b' }, para('اختر حادثًا من القائمة أو من الخريطة لترى التوصية والموافقة والتصدير.', 'Select an incident in the list or on the map to see its recommendation, approval and export.', 'muted'))));
    return out;
  }
  function incidentCard(inc) {
    var p = planOf(inc), st = statusOf(inc), ended = inc.status === 'cleared' || inc.status === 'cancelled', approved = st !== 'recommended' && st !== 'cancelled', held = !!NS.held[inc.id], fe = firstEta(inc), pl = placeName(inc);
    var acts = h('div', { class: 'nat-acts' });
    var ap = btn('btn btn-safe nat-approve', 'check', 'وافق (مفتاح الإنسان)', 'Approve (the human key)', function () { approve(inc.id); });
    ap.id = 'nat-approve'; if (approved || ended) ap.disabled = true;
    var hd = btn('btn btn-ghost btn-sm', 'pause', held ? 'معلّق — اضغط لرفع التعليق' : 'علّق', held ? 'On hold — click to release' : 'Hold', function () { if (NS.held[inc.id]) { delete NS.held[inc.id]; refreshZones(true); } else hold(inc.id); });
    hd.id = 'nat-hold'; hd.setAttribute('aria-pressed', held ? 'true' : 'false'); if (approved || ended) hd.disabled = true;
    var cn = btn('btn btn-ghost btn-sm', 'x', 'ألغِ الحادث', 'Cancel incident', function () { cancelInc(inc.id); }); cn.id = 'nat-cancel'; if (ended) cn.disabled = true;
    acts.appendChild(ap); acts.appendChild(hd); acts.appendChild(cn);
    var proof = h('ol', { class: 'nat-proof' },
      h('li', { class: 'done' }, h('i', null, icon('check')), h('span', null, h('b', null, bi('١ · بلاغ مسجّل', '1 · Report logged')), h('small', null, bi('محاكاة: نقرتك تمثّل بلاغًا أو حسّاسًا. في الحي، المفتاحان حسّاسان مستقلان.', 'SIM: your click stands for a call or a sensor. In the neighbourhood view the two keys are independent sensors.')))),
      h('li', { class: p ? 'done' : '' }, h('i', null, p ? icon('check') : '2'), h('span', null, h('b', null, bi('٢ · توصية الإرسال', '2 · Dispatch recommended')), h('small', null, bi('أسرع وحدة من كل نوع بحسب الازدحام المحاكى على الطرق الحقيقية.', 'The fastest unit of each type given simulated traffic on the real roads.')))),
      h('li', { class: approved ? 'done' : (ended ? '' : 'now') }, h('i', null, approved ? icon('check') : '3'), h('span', null, h('b', null, bi('٣ · موافقة إنسان', '3 · Human approval')), h('small', null, approved ? bi('تمت الموافقة — الحزمة الموثّقة تذهب إلى غرفة التحكم.', 'Approved — the verified package goes to the control room.') : bi('لا شيء يُرسل ولا تُنبَّه الهواتف قبل هذه الموافقة.', 'Nothing is sent and no phone is alerted before this approval.')))));
    var pub = NS.pub[inc.id] && NS.pub[inc.id].alert && !ended;
    var kids = [
      h('div', { class: 'nat-inc-h' }, hzIcon(inc.hazard), h('div', { class: 'nat-inc-t' }, h('h4', null, inc.id + ' — ' + hzName(inc.hazard)), h('p', { class: 'muted' }, pl.line)), statusTag(inc)),
      h('div', { class: 'nat-facts' }, kvRow(B('الشدة', 'Severity'), N(inc.severity)), kvRow(B('نصف القطر', 'Radius'), fmtDist(inc.radiusM)), kvRow(B('أول وحدة', 'First unit'), fe != null ? minTxt(fe) : '–'), inc.patients && inc.patients.n ? kvRow(B('مصابون', 'Patients'), N(inc.patients.n)) : null),
      proof, ended ? null : acts,
      held && !approved ? h('p', { class: 'nat-p warn' }, icon('alert'), bi('الحادث معلّق: توصيتك محفوظة لكن لا شيء يُرسل.', 'On hold: your recommendation is kept but nothing is sent.')) : null,
      pub ? h('p', { class: 'nat-p safe' }, icon('signal'), h('span', null, bi('نُشر التنبيه والإرسال إلى هواتف السكان القريبين (رسائل scope: national). ', 'The alert and dispatch were published to nearby residents\' phones (scope: national). '), h('a', { href: 'alert.html', target: '_blank', rel: 'noopener' }, bi('افتح صفحة الهواتف', 'Open the phones page')))) : null,
      h('div', { class: 'nat-btnrow nat-more' },
        btn('btn btn-cool btn-sm', 'zoomin', 'قرّب إلى آخر مئة متر', 'Zoom into the last 100 metres', function () { zoomIn(inc.id); }, { id: 'nat-zoomin' }),
        btn('btn btn-ghost btn-sm', 'target', 'اذهب إلى الحادث', 'Fly to incident', function () { flyToInc(inc, 700); }),
        btn('btn btn-ghost btn-sm', 'download', 'صدّر CAP 1.2', 'Export CAP 1.2', function () { var x = capXml(inc.id); if (x) { download('manara-cap-' + inc.id + '.xml', 'application/xml', x); bothToast('نُزّل ملف CAP (تمرين)', 'CAP file downloaded (exercise)', 'safe'); } }, { id: 'nat-cap' }),
        ended ? null : btn('btn btn-ghost btn-sm', 'shield', inc.cordonM ? 'ارفع الطوق' : 'طوق الشرطة', inc.cordonM ? 'Lift the cordon' : 'Police cordon', function () { if (inc.cordonM) NN.liftCordon(NS.nat, inc.id); else NN.cordon(NS.nat, inc.id); tickOnce(); refreshZones(true); })),
      h('p', { class: 'nat-p muted small' }, bi('التكبير يفتح محاكاة الحي قرب ' + (pl.near ? pl.near.replace(/^قرب /, '') : 'هذا المكان') + ' — سيناريو محاكى وليس مبنى حقيقيًا.', 'Zooming in opens the neighbourhood simulation ' + (pl.near ? pl.near.toLowerCase() : 'here') + ' — a simulated scenario, not a real building.')),
      capPreview(inc)
    ];
    return h('section', { class: 'pn nat-card nat-incident', 'data-inc': inc.id }, h('div', { class: 'pn-b' }, kids));
  }
  function capPreview(inc) {
    var d = h('details', { class: 'jg nat-cap' }); d.appendChild(h('summary', null, bi('معاينة ملف CAP 1.2 (تمرين)', 'Preview the CAP 1.2 file (exercise)')));
    var body = h('div', { class: 'jg-b' }); d.appendChild(body);
    d.addEventListener('toggle', function () { if (d.open && !body.firstChild) { var x = capXml(inc.id); body.appendChild(h('pre', { class: 'code nat-capxml', tabindex: '0' }, x)); body.appendChild(btn('btn btn-ghost btn-sm', 'copy', 'انسخ', 'Copy', function () { copyText(x).then(function (ok) { bothToast(ok ? 'تم النسخ' : 'تعذّر النسخ', ok ? 'Copied' : 'Copy failed', ok ? 'safe' : 'warn'); }); })); } });
    return d;
  }
  function renderSelected(sel) {
    var body = [], title = '', ic = 'pin';
    if (sel.type === 'facility') {
      var f = NS.map.facilities.filter(function (q) { return q.id === sel.id; })[0]; if (!f) return h('div');
      var here = NS.snap.units.filter(function (u) { return Math.abs(u.base.lon - f.lon) < 0.0006 && Math.abs(u.base.lat - f.lat) < 0.0006; });
      title = facTitle(f); ic = (f.kind === 'clinic-ed' ? 'hospital' : f.kind === 'fire' ? 'fire' : f.kind === 'police' ? 'police' : f.kind === 'ambulance' ? 'ambulance' : 'hospital');
      body.push(h('div', { class: 'nat-facts' }, kvRow(B('النوع', 'Type'), facKindName(f)), (f.kind === 'hospital' || f.kind === 'clinic-ed') ? kvRow(B('الطوارئ', 'Emergency dept.'), edText(f)) : null, kvRow(B('البلدية', 'Municipality'), nm((NS.world.municipalities.filter(function (m) { return m.id === f.muni; })[0] || {}).name) || '–'), facSub(f) ? kvRow(B('الاسم في OSM', 'Name in OSM'), facSub(f)) : null, facLab(f) && !facLab(f).verified ? kvRow(B('الحالة', 'Status'), h('span', { class: 'tag warn' }, B('غير موثّق', 'unverified'))) : null, kvRow('OSM', f.id)));
      body.push(para('موقع المنشأة من خريطة OpenStreetMap (حقيقي). توفّر الوحدات في هذه المنشأة محاكى.', 'The facility position is from OpenStreetMap (real). Whether its units are available is simulated.', 'muted small'));
      if (here.length) body.push(h('div', { class: 'stack' }, here.map(function (u) { return unitBusyRow(u); })));
      else if (f.kind !== 'hospital' && f.kind !== 'clinic-ed') body.push(para('لا توجد وحدة محاكاة مرتبطة بهذه المنشأة (بيانات OSM ناقصة أو المنشأة إدارية).', 'No simulated unit is based here (the OSM entry is administrative or the data has a gap).', 'muted small'));
    } else if (sel.type === 'unit') {
      var u = NS.snap.units.filter(function (q) { return q.id === sel.id; })[0]; if (!u) return h('div');
      title = nm(u.name); ic = (KIND[u.kind] || KIND.fire).icon; body.push(unitBusyRow(u, true));
    } else if (sel.type === 'tunnel') {
      var t = (NS.tunnels || []).filter(function (q) { return String(q.edge) === sel.id; })[0]; if (!t) return h('div');
      title = nm(t.name) || B('نفق / معبر', 'Tunnel / underpass'); ic = 'flood';
      body.push(h('div', { class: 'nat-facts' }, kvRow(B('عمق الماء', 'Water depth'), N(t.depthCm, 0) + B(' سم', ' cm')), kvRow(B('الحالة', 'State'), t.closed ? B('مغلق', 'Closed') : B('مفتوح', 'Open'))));
      body.push(para('العمق محاكى: لا يوجد نموذج ارتفاعات، والماء يتجمّع فقط في الأنفاق والمعابر المنخفضة. الإغلاق عند ٣٠ سم (ما يعادل ١٢ بوصة، المصدر S55).', 'Depth is simulated: there is no elevation model; water gathers only in tunnels and low underpasses. Closing at 30 cm (about 12 inches, source S55).', 'muted small'));
    } else if (sel.type === 'road') {
      var e = +sel.id, inf = NN.roadInfo(NS.nat, e); if (!inf) return h('div');
      title = nm(inf.name); ic = 'car';
      body.push(roadFacts(inf));
      body.push(h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'car', NS.jams[e] != null ? 'ارفع الازدحام' : 'ازدحم هذا الطريق', NS.jams[e] != null ? 'Clear the jam' : 'Jam this road', function () { jamEdge(e); }), btn('btn btn-ghost btn-sm', 'x', NS.closes[e] ? 'افتح الطريق' : 'أغلق الطريق', NS.closes[e] ? 'Re-open the road' : 'Close the road', function () { closeEdge(e); })));
    }
    return h('section', { class: 'pn nat-card nat-sel' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t nat-sel-t' }, icon(ic), h('span', null, title)), h('button', { type: 'button', class: 'icon-btn sm', onclick: function () { NS.sel = null; syncScene(); refreshZones(true); } }, icon('x'))), h('div', { class: 'pn-b' }, body));
  }
  function roadFacts(inf) {
    return h('div', { class: 'nat-facts' }, kvRow(B('الفئة', 'Class'), inf.cls), kvRow(B('السرعة الحرة', 'Free-flow speed'), N(inf.kph) + ' km/h' + (inf.speedFromOsm ? ' (OSM)' : B(' (افتراض الفئة)', ' (class default)'))),
      kvRow(B('السرعة الآن', 'Speed now'), N(Math.round((inf.cong || 0) * 100)) + '%' + B(' من الحرة (محاكاة)', ' of free flow (SIM)')), inf.tunnel ? kvRow(B('نوع', 'Kind'), B('نفق / معبر', 'tunnel / underpass')) : null, inf.closed ? kvRow(B('الحالة', 'State'), B('مغلق', 'Closed')) : null);
  }
  function unitBusyRow(u, solo) {
    var mode = NS.busy[u.id] == null ? 'auto' : NS.busy[u.id] ? 'busy' : 'free';
    return h('div', { class: 'nat-unitrow' }, kindIcon(u.kind), h('div', { class: 'nat-unitrow-m' }, h('b', null, nm(u.name)), h('small', null, kindName(u.kind) + ' · ' + (u.busy ? B('مشغولة (محاكاة)', 'busy (SIM)') : stateWord(u.state)) + (u.assigned ? ' · ' + u.assigned : ''))),
      seg([{ id: 'auto', ar: 'تلقائي', en: 'Auto' }, { id: 'busy', ar: 'مشغولة', en: 'Busy' }, { id: 'free', ar: 'متاحة', en: 'Free' }], function () { return NS.busy[u.id] == null ? 'auto' : NS.busy[u.id] ? 'busy' : 'free'; }, function (v) { NS.busy[u.id] = v === 'auto' ? null : v === 'busy'; if (v === 'auto') delete NS.busy[u.id]; setUnitBusy(u.id, v === 'auto' ? null : v === 'busy'); }, ['توفّر الوحدة (محاكاة)', 'Unit availability (SIM)']));
  }

  /* ---------------------------------------------------------------- 10.2 DISPATCH */
  function buildDispatchPane() {
    var p = UI.paneEls.dispatch;
    p.appendChild(zone('dispatch', 'dispatch', dispatchSig, renderDispatch));
    p.appendChild(zone('dispatch', 'example', function () { return NS.example ? NS.example.t + ':' + NS.example.seed : (NS.busy.example ? 'busy' : 'none'); }, renderExample));
    p.appendChild(simNote());
  }
  function dispatchSig() {
    var inc = selectedInc(), p = planOf(inc); if (!inc) return 'none';
    return [inc.id, statusOf(inc), NS.held[inc.id] ? 1 : 0, NS.banner ? NS.banner.t + NS.banner.type : '', p ? p.units.map(function (u) { return (u.slot || u.kind) + ':' + (u.unitId || '-') + ':' + u.state + ':' + (u.runnerUp ? u.runnerUp.unitId : '') + ':' + (u.reroutes || 0) + ':' + ((u.replaced || []).length); }).join(',') : '', p && p.hospital ? p.hospital.id + ':' + p.hospital.options.length : '', p && p.dataGap ? p.dataGap.items.length : 0, Object.keys(NS.openWhy).join(''), JSON.stringify(NS.checkins[inc.id] || 0)].join('|');
  }
  function checkinRow(inc) {
    var c = NS.checkins[inc.id]; if (!c || !(c.safe + c.help + c.ack)) return null;
    return h('p', { class: 'nat-p nat-checkins' }, icon('users'), bi('هواتف السكان (تمرين، SIM): ' + N(c.safe) + ' بأمان · ' + N(c.help) + ' تحتاج مساعدة · ' + N(c.ack) + ' مستيقظ', 'Resident phones (exercise, SIM): ' + N(c.safe) + ' safe · ' + N(c.help) + ' need help · ' + N(c.ack) + ' awake'));
  }
  function approveBar(inc) {
    var st = statusOf(inc), approved = st !== 'recommended' && st !== 'cancelled', ended = inc.status === 'cleared' || inc.status === 'cancelled';
    if (approved || ended) return null;
    var held = !!NS.held[inc.id];
    return h('div', { class: 'nat-approve-bar' }, h('p', null, held ? bi('معلّق. لا يُرسل شيء حتى تضغط «وافق».', 'On hold. Nothing is sent until you press “Approve”.') : bi('هذه توصية. اضغط «وافق» ليصبح الإرسال حقيقيًا في المحاكاة.', 'This is a recommendation. Press “Approve” to make the dispatch go ahead in the simulation.')),
      h('div', { class: 'nat-btnrow' }, btn('btn btn-safe', 'check', 'وافق (مفتاح الإنسان)', 'Approve (the human key)', function () { approve(inc.id); }, { id: 'nat-approve2' }), btn('btn btn-ghost btn-sm', 'pause', held ? 'معلّق' : 'علّق', held ? 'On hold' : 'Hold', function () { if (held) { delete NS.held[inc.id]; refreshZones(true); } else hold(inc.id); })));
  }
  function renderDispatch() {
    var inc = selectedInc(), out = [];
    if (!inc) {
      return [h('section', { class: 'pn nat-card nat-dp-empty' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('خطة الإرسال', 'Dispatch plan')), simTag()), h('div', { class: 'pn-b' },
        emptyState('route', 'لا يوجد حادث بعد. ابدأ بحادث تجريبي لترى أسرع وحدة من كل نوع بحسب الازدحام، أو انقر على الخريطة لتضع حادثك.', 'No incident yet. Start with the demo incident to see the fastest unit of each type given traffic, or click the map to place your own.', demoActions('-d'))))];
    }
    var p = planOf(inc), st = statusOf(inc);
    out.push(h('section', { class: 'pn nat-card nat-plan' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('خطة الإرسال', 'Dispatch plan'), ' ', h('span', { class: 'mono' }, p ? p.id : inc.id)), statusTag(inc)),
      h('div', { class: 'pn-b' }, [
        h('div', { class: 'nat-inc-t' }, h('h4', null, inc.id + ' — ' + hzName(inc.hazard)), h('p', { class: 'muted' }, placeName(inc).line)),
        NS.banner ? bannerBlock() : null, gapBlock(p),
        stepper(st === 'cancelled' ? 'recommended' : st), approveBar(inc), checkinRow(inc),
        h('p', { class: 'nat-p' }, icon('target'), bi('«الأسرع» لا «الأقرب»: لكل نوع نختار أقل زمن وصول بين الوحدات المتاحة على الطرق الحقيقية بازدحام محاكى، ونعرض بجانبه صاحب المركز الثاني والمسافة.', '“Fastest”, not “nearest”: for each type we pick the lowest ETA among the available units on the real roads with simulated traffic, and show the runner-up and the distance beside it.')),
        p ? h('div', { class: 'nat-units' }, p.units.map(function (u) { return unitCard(u, inc); })) : null,
        p && p.hospital ? hospitalCard(p.hospital, inc) : null,
        h('div', { class: 'nat-btnrow' }, btn('btn btn-cool btn-sm', 'zoomin', 'قرّب إلى آخر مئة متر', 'Zoom into the last 100 metres', function () { zoomIn(inc.id); }, { id: 'nat-zoomin2' }), btn('btn btn-ghost btn-sm', 'download', 'صدّر CAP 1.2', 'Export CAP 1.2', function () { var x = capXml(inc.id); if (x) download('manara-cap-' + inc.id + '.xml', 'application/xml', x); }, { id: 'nat-cap2' })),
        p && p.notes && p.notes.length ? h('ul', { class: 'nat-notes' }, p.notes.map(function (n) { return h('li', null, nm(n)); })) : null
      ])));
    return out;
  }
  function gapBlock(p) {
    var g = p && p.dataGap; if (!g || !g.items || !g.items.length) return null;
    return h('div', { class: 'nat-gap', role: 'note' }, icon('alert'), h('div', null, h('b', null, bi('فجوة بيانات: لا توجد وحدات موثّقة قريبة', 'Data gap: no verified units close by')), h('p', null, nm(g.text)),
      h('ul', null, g.items.map(function (it) { return h('li', null, nm(it.text)); })),
      h('small', { class: 'muted' }, bi('الحد: ' + N(g.thresholdMin) + ' دقيقة (افتراض عرض فقط). الترتيب نفسه لا يتغير.', 'Threshold: ' + N(g.thresholdMin) + ' min (a display assumption only). The ranking itself is unchanged.'))));
  }
  function bannerBlock() {
    var b = NS.banner; return h('div', { class: 'nat-redisp', role: 'status' }, icon(b.type === 'redispatch' ? 'alert' : 'route'), h('div', null, h('b', null, b.type === 'redispatch' ? bi('إعادة إرسال تلقائية', 'Automatic re-dispatch') : b.type === 'recommendation-change' ? bi('تحديث التوصية قبل الموافقة', 'Recommendation updated before approval') : bi('تنبيه', 'Notice')), h('p', null, nm(b.text)), h('small', { class: 'muted mono' }, b.clock)));
  }
  function unitCard(u, inc) {
    var wd = u.whyData || {}, ch = wd.chosen || {}, key = inc.id + ':' + (u.slot || u.kind), none = !u.unitId, ffb = wd.farButFaster;
    var head = h('div', { class: 'nat-u-h' }, kindIcon(u.kind, true), h('div', { class: 'nat-u-t' }, h('b', null, kindName(u.kind)), u.optional ? h('small', { class: 'muted' }, B('إضافية', 'extra')) : u.standby ? h('small', { class: 'muted' }, B('احتياط', 'standby')) : null),
      h('div', { class: 'nat-u-eta' }, h('b', { class: 'mono', 'data-eta': u.slot || u.kind }, none ? '–' : u.state === 'on-scene' ? B('في الموقع', 'On scene') : u.state === 'cleared' ? '—' : minTxt(u.etaSec)), h('small', null, bi('وقت الوصول (محاكاة)', 'ETA (SIM)'))));
    var kids = [head];
    if (none) { kids.push(h('p', { class: 'nat-p warn' }, icon('alert'), bi('لا توجد وحدة متاحة من هذا النوع يمكنها الوصول (محاكاة). في الواقع تقرر غرفة التحكم.', 'No available unit of this type can reach the scene (SIM). In real life the control room decides.'))); return h('article', { class: 'nat-unit none', 'data-kind': u.kind }, kids); }
    kids.push(h('p', { class: 'nat-u-n' }, nm(u.name)), u.sub ? h('p', { class: 'nat-u-sub muted small' }, B('الاسم في OSM: ', 'Named in OSM: ') + nm(u.sub)) : null, h('div', { class: 'row-tags' }, stateTag(u.state), u.unverified ? tag('warn', B('غير موثّق', 'unverified')) : null, u.gap ? tag('warn', B('فجوة بيانات', 'data gap')) : null, ffb ? tag('cool', B('أبعد لكن أسرع بـ ', 'Farther but faster by ') + mmss(wd.gainSec || 0)) : (wd.nearestByStraight === undefined && u.nearestByStraight && u.nearestByStraight.unitId === u.unitId ? tag('safe', B('الأقرب والأسرع', 'Nearest and fastest')) : null), u.reroutes ? tag('warn', B('أُعيد توجيهها ', 'Re-routed ') + N(u.reroutes) + '×') : null));
    var nums = h('div', { class: 'nat-facts' }, kvRow(B('بالطريق', 'By road'), isNum(u.distM) ? km1(u.distM) : '–'), ch.straightM != null ? kvRow(B('بخط مستقيم', 'Straight line'), km1(ch.straightM)) : null, ch.delaySec != null ? kvRow(B('تأخير الازدحام', 'Congestion delay'), '+' + mmss(ch.delaySec)) : null);
    kids.push(nums);
    if (u.modelled) kids.push(h('p', { class: 'nat-p muted small nat-modelled' }, icon('hospital'), bi('الإسعاف مُنمذَج في قسم الطوارئ بهذا المستشفى؛ ليس مركز إسعاف حقيقيًا، ومراكز الإسعاف الفعلية قد تختلف.', 'The ambulance is modelled at this hospital\'s emergency department; it is not a real ambulance station, and real ambulance stations may differ.')));
    if (u.gap) kids.push(h('p', { class: 'nat-p warn small nat-gapnote' }, icon('alert'), bi('وقت الوصول هذا بعيد: قد لا تحوي خريطة OSM مراكز أقرب، فلا تقرأه كزمن استجابة حقيقي.', 'This ETA is far: the OSM map may not contain closer stations, so do not read it as a real response time.')));
    if (u.runnerUp) kids.push(h('p', { class: 'nat-ru' }, h('span', { class: 'k' }, bi('صاحب المركز الثاني', 'Runner-up')), ' ', h('span', null, nm(u.runnerUp.name)), ' ', h('span', { class: 'mono' }, minTxt(u.runnerUp.etaSec) + ' · ' + km1(u.runnerUp.distM))));
    var why = h('details', { class: 'nat-why', open: !!NS.openWhy[key] }), wb = h('div', { class: 'nat-why-b' });
    why.appendChild(h('summary', null, bi('لماذا هذه الوحدة؟', 'Why this unit?'))); why.appendChild(wb);
    why.addEventListener('toggle', function () { if (why.open) NS.openWhy[key] = 1; else delete NS.openWhy[key]; });
    wb.appendChild(h('p', null, nm(u.why)));
    if (wd.nearestByStraight && wd.nearestByStraight.id !== u.unitId) { var nb = u.nearestByStraight; wb.appendChild(h('p', { class: 'nat-cmp' }, h('b', null, B('الأقرب بخط مستقيم: ', 'Nearest in a straight line: ')), nb ? nm(nb.name) + ' — ' + km1(nb.straightM) + (nb.etaSec != null ? ', ' + B('وصول ', 'ETA ') + mmss(nb.etaSec) : '') : '')); }
    if (ch.top && ch.top.length) wb.appendChild(h('div', { class: 'nat-segs' }, h('b', null, B('أبطأ المقاطع على الطريق (' + N(ch.congestedSegments || 0) + ' مقطعًا مزدحمًا):', 'Slowest segments on the route (' + N(ch.congestedSegments || 0) + ' congested):')), h('ul', null, ch.top.map(function (s) { return h('li', null, h('span', null, nm(s.name)), h('span', { class: 'mono' }, '+' + mmss(s.delaySec) + ' · ' + N(Math.round((s.cong || 0) * 100)) + '%')); }))));
    if (wd.skippedBusy && wd.skippedBusy.length) wb.appendChild(h('p', { class: 'muted small' }, B('تُخطّيت ' + N(wd.skippedBusy.length) + ' وحدة أقرب لأنها مشغولة (محاكاة).', N(wd.skippedBusy.length) + ' nearer unit(s) skipped because they are busy (SIM).')));
    if (wd.cutOff && wd.cutOff.length) wb.appendChild(h('p', { class: 'muted small' }, B('تُخطّيت وحدات انقطع طريقها بإغلاق.', 'Units whose way is cut off by a closure were skipped.')));
    if (wd.reason) wb.appendChild(h('p', { class: 'muted small' }, wd.reason === 'traffic' ? B('السبب الرئيسي: الازدحام.', 'Main reason: traffic.') : B('السبب الرئيسي: شكل شبكة الطرق (اتجاه واحد/دوّارات) لا الازدحام وحده.', 'Main reason: the shape of the road network (one-way roads, interchanges), not traffic alone.')));
    if (u.replaced && u.replaced.length) wb.appendChild(h('p', { class: 'nat-p warn' }, icon('alert'), B('حلّت محل وحدة سابقة (' + N(u.replaced.length) + ').', 'Replaced an earlier unit (' + N(u.replaced.length) + ').')));
    kids.push(why);
    kids.push(h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'route', 'أظهر المسار', 'Show route', function () { var pts = (u.route || []).slice(); if (u.pos) pts.push([u.pos.lon, u.pos.lat]); pts.push([inc.lon, inc.lat]); NS.map.flyTo({ bbox: bboxOf(pts, 0.15), pad: padFor() }, 700); })));
    return h('article', { class: 'nat-unit', 'data-kind': u.kind, 'data-slot': u.slot || u.kind }, kids);
  }
  function hospitalCard(hp, inc) {
    var kids = [h('div', { class: 'nat-u-h' }, kindIcon('hospital', true), h('div', { class: 'nat-u-t' }, h('b', null, bi('المستشفى الوجهة', 'Destination hospital')), h('small', { class: 'muted' }, bi('للمصابين: الأسرع وصولًا ولديه طوارئ', 'For patients: fastest to reach, with an emergency department'))),
      h('div', { class: 'nat-u-eta' }, h('b', { class: 'mono' }, minTxt(hp.etaSec)), h('small', null, bi('من الموقع (محاكاة)', 'from the scene (SIM)')))), h('p', { class: 'nat-u-n' }, nm(hp.name)),
      h('div', { class: 'nat-facts' }, kvRow(B('بالطريق', 'By road'), km1(hp.distM)), kvRow(B('الطوارئ', 'Emergency dept.'), nm(hp.edNote) || hp.ed), kvRow(B('سعة افتراضية', 'Assumed capacity'), (hp.fits ? B('تتسع', 'fits') : B('لا تتسع', 'does not fit')) + ' · ' + N(hp.freeSlots) + B(' أسرّة', ' beds')))];
    if (hp.why) kids.push(h('p', { class: 'muted small' }, nm(hp.why)));
    if (hp.options && hp.options.length > 1) kids.push(h('details', { class: 'nat-why' }, h('summary', null, bi('مستشفيات أخرى بالترتيب', 'Other hospitals in order')), h('div', { class: 'nat-why-b' }, h('ul', { class: 'nat-opts' }, hp.options.slice(0, 5).map(function (o) { return h('li', null, h('span', null, nm(o.name)), h('span', { class: 'mono' }, minTxt(o.etaSec))); })))));
    kids.push(h('p', { class: 'muted small' }, bi('السعة افتراض معلَّم (ليست بيانات حقيقية). الطوارئ «مؤكدة» فقط حيث تقول بيانات OSM ذلك.', 'Capacity is a labelled assumption (not real data). The ED is “confirmed” only where the OSM data says so.')));
    return h('article', { class: 'nat-unit nat-hosp' }, kids);
  }

  /* ---- the real farther-but-faster example ---- */
  function runExample(next) {
    if (NS.busy.example) return; if (next) NS.exSeed++;
    NS.busy.example = true; touchZone('example'); refreshZones(true); announce(B('جارٍ البحث عن مثال حقيقي على الطرق الحقيقية…', 'Searching for a real example on the real roads…'));
    setTimeout(function () {
      var ex = null; try { ex = NN.findFartherButFaster(NS.exSeed, { date: SEASONS[NS.opts.season] }); } catch (e) { ex = null; }
      NS.busy.example = false; NS.example = ex ? { t: now(), seed: NS.exSeed, ex: ex } : null; NS.exFailed = !ex;
      if (ex) {
        var f = ex.fastest, nr = ex.nearest;
        NS.map.scene.example = { incident: { lon: ex.incident.lon, lat: ex.incident.lat }, nearest: { route: nr.route, base: nr.base }, fastest: { route: f.route, base: f.base },
          nearLabel: B('الأقرب ', 'Nearest ') + km1(nr.straightM != null ? nr.straightM * 1000 : nr.straightKm * 1000) + ' · ' + mmss(nr.etaSec), fastLabel: B('الأسرع ', 'Fastest ') + mmss(f.etaSec) };
        var pts = (nr.route || []).concat(f.route || []).concat([[ex.incident.lon, ex.incident.lat]]); if (pts.length) NS.map.flyTo({ bbox: bboxOf(pts, 0.12), pad: padFor() }, 900);
        NS.map.scene.animating = true; NS.map.dirty = true; showTab('dispatch', true); announce(B('مثال حقيقي: الوحدة الأسرع أبعد بخط مستقيم لكنها تصل أولًا', 'Real example: the fastest unit is farther in a straight line but arrives first'));
      }
      touchZone('example'); refreshZones(true);
    }, 40);
  }
  function clearExample() { NS.example = null; if (NS.map) { NS.map.scene.example = null; NS.map.dirty = true; } touchZone('example'); refreshZones(true); }
  function renderExample() {
    var ex = NS.example && NS.example.ex, kids = [];
    var runBtn = btn('btn btn-cool' + (ex ? ' btn-sm' : ''), 'target', ex ? 'مثال آخر' : 'أرني مثالًا حقيقيًا: أبعد لكن أسرع', ex ? 'Another example' : 'Show me a real farther-but-faster example', function () { runExample(!!ex); }, { id: 'nat-example' });
    if (NS.busy.example) runBtn.disabled = true;
    if (NS.busy.example) return h('section', { class: 'pn nat-card nat-example' }, h('div', { class: 'pn-b' }, h('p', { class: 'nat-p' }, h('i', { class: 'nat-spin', 'aria-hidden': 'true' }), bi('جارٍ البحث بين مئات الحوادث على الطرق الحقيقية…', 'Searching hundreds of incidents on the real roads…'))));
    if (!ex) {
      return h('section', { class: 'pn nat-card nat-example' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('أبعد لكن أسرع', 'Farther but faster')), simTag()), h('div', { class: 'pn-b' }, [
        para('أحيانًا تصل وحدة أبعد بخط مستقيم قبل الأقرب لأن طريق الأقرب مزدحم. اضغط ليبحث المحرّك في الخريطة الحقيقية عن مثال ويعرضه لك بالأرقام.', 'Sometimes a unit that is farther in a straight line arrives before the nearest one because the nearest one\'s road is jammed. Press the button: the engine searches the real map for an example and shows it with its numbers.'),
        runBtn, NS.exFailed ? para('لم يجد البحث مثالًا بهذه الإعدادات، جرّب زر «مثال آخر» أو غيّر الوقت.', 'The search found no example with these settings; try again or change the clock.', 'muted small') : null]));
    }
    var f = ex.fastest, nr = ex.nearest, flip = ex.trafficAloneFlipsOrder;
    var row = function (cls, ttl, u) {
      return h('div', { class: 'nat-ex-col ' + cls }, h('b', null, ttl), h('p', { class: 'nat-u-n' }, nm(u.name)), h('div', { class: 'nat-facts' }, kvRow(B('بخط مستقيم', 'Straight line'), N(u.straightKm, 1) + B(' كم', ' km')), kvRow(B('بالطريق', 'By road'), N(u.roadKm, 1) + B(' كم', ' km')), kvRow(B('وقت الوصول', 'ETA'), mmss(u.etaSec)), kvRow(B('لو لا ازدحام', 'Without traffic'), mmss(u.freeFlowEtaSec))));
    };
    var seg2 = f.slowest || [];
    return h('section', { class: 'pn nat-card nat-example', 'data-ready': '1' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('أبعد لكن أسرع — مثال حقيقي', 'Farther but faster — a real example')), simTag()), h('div', { class: 'pn-b' }, [
      h('p', { class: 'nat-p' }, icon('clock'), h('span', null, B(DOW[new Date(ex.date + 'T12:00:00Z').getUTCDay()][0] + ' ' + ex.clock.slice(0, 5) + ' — قرب ' + (ex.incident.place ? nm(ex.incident.place.name) : 'هذا الموقع') + ' (حريق افتراضي)', ex.dowName.en + ' ' + ex.clock.slice(0, 5) + ' — near ' + (ex.incident.place ? nm(ex.incident.place.name) : 'this spot') + ' (a hypothetical fire)'))),
      h('div', { class: 'nat-ex' }, row('near', B('الأقرب بخط مستقيم', 'Nearest in a straight line'), nr), row('fast', B('الأسرع بحسب الازدحام', 'Fastest given traffic'), f)),
      h('p', { class: 'nat-ex-gain' }, icon('target'), h('span', null, bi('الأسرع أبعد ', 'The fastest is farther by '), h('b', { class: 'mono' }, N(ex.extraStraightKm, 1) + B(' كم بخط مستقيم', ' km in a straight line')), bi(' لكنه يصل أبكر بـ ', ' yet arrives earlier by '), h('b', { class: 'mono' }, mmss(ex.gainSec)))),
      h('p', { class: 'nat-p muted' }, nm(ex.why)),
      h('p', { class: 'nat-p' }, tag(ex.reason === 'traffic' ? 'cool' : '', ex.reason === 'traffic' ? B('بسبب الازدحام', 'Because of traffic') : B('بسبب شبكة الطرق', 'Because of the road network')), ' ', flip ? bi('في الثالثة فجرًا يصبح الأقرب هو الأسرع: الازدحام وحده قلب الترتيب.', 'At 03:00 the nearest becomes the fastest: traffic alone flips the order.') : bi('الترتيب ناتج أيضًا عن شكل الطرق.', 'The order also comes from the shape of the roads.')),
      seg2.length ? h('div', { class: 'nat-segs' }, h('b', null, B('أبطأ المقاطع أمام الوحدة الأسرع:', 'Slowest segments ahead of the fastest unit:')), h('ul', null, seg2.slice(0, 3).map(function (s) { return h('li', null, h('span', null, nm(s.name)), h('span', { class: 'mono' }, '+' + mmss(s.delaySec))); }))) : null,
      h('p', { class: 'muted small' }, bi('طرق حقيقية من OpenStreetMap؛ الازدحام ومواقع الوحدات محاكاة. البحث فحص آلية العمل وليس دليلًا على الأثر.', 'Real roads from OpenStreetMap; the congestion and unit positions are simulated. The search is a mechanism check, not proof of impact.')),
      h('div', { class: 'nat-btnrow' }, runBtn, btn('btn btn-ghost btn-sm', 'target', 'اذهب إلى المثال', 'Fly to the example', function () { var pts = (nr.route || []).concat(f.route || []); NS.map.flyTo({ bbox: bboxOf(pts, 0.12), pad: padFor() }, 700); }), btn('btn btn-ghost btn-sm', 'x', 'أخفِ المثال', 'Hide the example', clearExample, { id: 'nat-example-hide' }))]));
  }

  /* ---------------------------------------------------------------- canvas helpers (charts read the design tokens and are redrawn on themechange / langchange) */
  function prepCanvas(c, hpx) {
    var w = Math.max(120, Math.round(c.clientWidth || c.parentNode.clientWidth || 300)), dpr = Math.min(2, win.devicePixelRatio || 1);
    c.style.height = hpx + 'px'; if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hpx * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hpx * dpr); }
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hpx); g.direction = lang() === 'ar' ? 'rtl' : 'ltr'; return { g: g, w: w, h: hpx };
  }
  function chartFont() { return getComputedStyle(doc.body).fontFamily; }

  /* ---------------------------------------------------------------- 10.3 TRAFFIC */
  function dayTypeOf(dow) { return dow === 5 ? 'fri' : dow === 6 ? 'sat' : dow === 4 ? 'thu' : 'work'; }
  function drawProfile() {
    var c = UI.prof; if (!c || !NS.nat || c.offsetParent === null) return; var o = prepCanvas(c, 104), g = o.g, W = o.w, H = o.h, pl = 8, pr = 8, pt2 = 8, pb = 20, dt = dayTypeOf(NS.draft.dow), i, rtl = lang() === 'ar';
    var X = function (hr) { var f = hr / 24; return pl + (rtl ? 1 - f : f) * (W - pl - pr); }, Y = function (v) { return pt2 + (1 - v) * (H - pt2 - pb); };
    g.font = '11px ' + chartFont(); g.textBaseline = 'alphabetic'; g.fillStyle = tok('--muted'); g.strokeStyle = tok('--line'); g.lineWidth = 1;
    g.beginPath(); for (i = 0; i <= 4; i++) { var xx = X(i * 6); g.moveTo(xx, pt2); g.lineTo(xx, H - pb); } g.stroke(); g.textAlign = 'center'; for (i = 0; i <= 4; i++) g.fillText(pad2(i * 6 % 24) + ':00', clamp(X(i * 6), 16, W - 16), H - 5);
    g.beginPath(); for (i = 0; i <= 96; i++) { var hr = i / 4, v = NN.profileAt(dt, hr); if (i) g.lineTo(X(hr), Y(v)); else g.moveTo(X(hr), Y(v)); }
    g.lineTo(X(24), H - pb); g.lineTo(X(0), H - pb); g.closePath(); g.fillStyle = tok('--brand'); g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1;
    g.beginPath(); for (i = 0; i <= 96; i++) { var hh = i / 4, vv = NN.profileAt(dt, hh); if (i) g.lineTo(X(hh), Y(vv)); else g.moveTo(X(hh), Y(vv)); } g.strokeStyle = tok('--brand'); g.lineWidth = 2; g.stroke();
    // the chosen hour and the current simulation clock
    var s = NS.snap; if (s && s.dow === NS.draft.dow && NS.opts.season === NS.draft.season) { g.strokeStyle = tok('--muted'); g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(s.hour), pt2); g.lineTo(X(s.hour), H - pb); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = tok('--accent'); g.lineWidth = 2.4; var hx = X(NS.draft.hour); g.beginPath(); g.moveTo(hx, pt2); g.lineTo(hx, H - pb); g.stroke(); g.beginPath(); g.arc(hx, Y(NN.profileAt(dt, NS.draft.hour)), 4.5, 0, Math.PI * 2); g.fillStyle = tok('--accent'); g.fill();
  }
  function buildTrafficPane() {
    var p = UI.paneEls.traffic; NS.draft = { season: NS.opts.season, dow: NS.opts.dow, hour: NS.opts.hour };
    UI.seasonSeg = seg([{ id: 'winter', ar: 'شتاء (١١ يناير)', en: 'Winter (11 Jan)' }, { id: 'summer', ar: 'صيف (١٢ يوليو)', en: 'Summer (12 Jul)' }], function () { return NS.draft.season; }, function (v) { NS.draft.season = v; drawProfile(); }, ['الموسم', 'Season']);
    UI.daySel = h('select', { class: 'input', id: 'nat-day' }, DOW.map(function (d, i) { return h('option', { value: String(i) }, B(d[0], d[1])); })); UI.daySel.addEventListener('change', function () { NS.draft.dow = +UI.daySel.value; drawProfile(); });
    UI.hourRow = rangeRow('الساعة', 'Time of day', 0, 23.75, 0.25, NS.draft.hour, hhmm, function (v) { NS.draft.hour = v; drawProfile(); }, 'nat-hour'); UI.hourRow._inp.addEventListener('input', function () { NS.draft.hour = +UI.hourRow._inp.value; drawProfile(); });
    UI.prof = h('canvas', { class: 'nat-prof', 'aria-hidden': 'true' });
    UI.prof.addEventListener('pointerdown', function (e) { var r = UI.prof.getBoundingClientRect(), f = clamp((e.clientX - r.left - 8) / (r.width - 16), 0, 1); if (lang() === 'ar') f = 1 - f; NS.draft.hour = Math.round(f * 96) / 4; if (NS.draft.hour > 23.75) NS.draft.hour = 23.75; UI.hourRow._inp.value = NS.draft.hour; UI.hourRow._out.textContent = hhmm(NS.draft.hour); drawProfile(); });
    var apply = btn('btn btn-primary btn-sm', 'clock', 'اضبط الساعة (يُعاد حساب الإرسال)', 'Set the clock (dispatch is recomputed)', function () { applyClock({ season: NS.draft.season, dow: NS.draft.dow, hour: NS.draft.hour }); }, { id: 'nat-setclock' });
    p.appendChild(zone('traffic', 'how', function () { return 'how'; }, renderTrafficHow));
    p.appendChild(card('الوقت وحركة المرور', 'Time and traffic', [
      para('الازدحام يتغير مع ساعة اليوم ويوم الأسبوع (الأحد–الأربعاء أيام عمل، الجمعة والسبت عطلة). المنحنى افتراض معلَّم، وليس قياسًا.', 'Congestion changes with the hour and the day (Sunday–Wednesday are work days; Friday and Saturday are the weekend). The curve is a labelled assumption, not a measurement.'),
      field('الموسم', 'Season', UI.seasonSeg), field('اليوم', 'Day', UI.daySel), UI.hourRow, UI.prof,
      h('p', { class: 'muted small' }, bi('الخط الأحمر المنقط: الساعة الحالية في المحاكاة. اضغط على المنحنى لاختيار ساعة. تغيير الساعة يعيد حساب حوادثك على ازدحام الوقت الجديد.', 'The dotted line is the current simulation clock. Click the curve to pick an hour. Changing the clock re-times your incidents on the new traffic.')), apply], simTag()));
    UI.trafficRow = rangeRow('مضاعِف الازدحام الوطني', 'National congestion multiplier', 0, 2, 0.1, 1, function (v) { return N(v, 1) + '×'; }, function (v) { setParam('trafficLoad', v); logOp('operator', 'مضاعِف الازدحام ' + v.toFixed(1) + '×', 'Congestion multiplier ' + v.toFixed(1) + '×'); refreshZones(true); }, 'nat-traffic');
    UI.jamSeg = seg([{ id: '0.5', ar: 'بطيء', en: 'Slow' }, { id: '0.15', ar: 'شديد', en: 'Heavy' }, { id: '0.06', ar: 'شبه متوقف', en: 'Crawl' }], function () { return String(NS.jamFactor); }, function (v) { NS.jamFactor = +v; }, ['شدة الازدحام عند النقر', 'Jam strength when clicking']);
    UI.speed2 = seg([{ id: 1, ar: '١×', en: '1×' }, { id: 10, ar: '١٠×', en: '10×' }, { id: 30, ar: '٣٠×', en: '30×' }, { id: 60, ar: '٦٠×', en: '60×' }], function () { return NS.speed; }, function (v) { setSpeed(+v); }, ['سرعة المحاكاة', 'Simulation speed']);
    p.appendChild(card('تحكم المشغّل', 'Operator control', [field('سرعة المحاكاة (ثانية محاكاة لكل ثانية حقيقية)', 'Simulation speed (simulated seconds per real second)', UI.speed2), UI.trafficRow, field('شدة الازدحام عند النقر على طريق (أداة «ازدحام»)', 'Jam strength when you click a road (the Jam tool)', UI.jamSeg),
      h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'car', 'أداة الازدحام', 'Use the Jam tool', function () { setTool('jam'); }), btn('btn btn-ghost btn-sm', 'x', 'أداة الإغلاق', 'Use the Close tool', function () { setTool('close'); }), btn('btn btn-ghost btn-sm', 'reset', 'أزل كل الازدحام والإغلاق', 'Clear all jams and closures', clearJams, { id: 'nat-clearjams' })),
      zone('traffic', 'tstats', function () { return Math.floor(NS.snap.t / 60) + ':' + Object.keys(NS.jams).length + ':' + Object.keys(NS.closes).length; }, renderTStats)], simTag()));
    p.appendChild(zone('traffic', 'road', function () { return NS.road + ':' + (NS.jams[NS.road] || 0) + ':' + (NS.closes[NS.road] || 0) + ':' + Math.floor(NS.snap.t / 120); }, renderRoadCard));
    p.appendChild(card('طبقات الخريطة', 'Map layers', buildLayerToggles()));
    p.appendChild(simNote());
  }
  /* ---- "Where does the traffic come from?"  One tap away: the assumptions, each labelled, and what is NOT used ---- */
  function paramTable(groupId) {
    var list = NN.PARAMS.filter(function (q) { return q.group === groupId; });
    return h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table nat-ptable' }, h('tbody', null, list.map(function (q) { return h('tr', null, h('td', null, h('b', null, nm(q.label)), h('br'), h('small', { class: 'muted' }, nm(q.desc))), h('td', { class: 'mono' }, N(q.default) + ' ' + (q.unit || '')), h('td', { class: 'mono small' }, String(q.src || 'assumption'))); }))));
  }
  function profilePeaks(dt) {
    var v = [], i, out = [], mx = 0; for (i = 0; i < 96; i++) { v.push(NN.profileAt(dt, i / 4)); if (v[i] > mx) mx = v[i]; }
    for (i = 1; i < 95; i++) if (v[i] >= v[i - 1] && v[i] > v[i + 1] && v[i] >= 0.55 * mx) out.push(hhmm(i / 4));
    return out;
  }
  function renderTrafficHow() {
    var wc = (NS.world && NS.world.corridors) || {}, ids = ['corniche', 'salwa', 'industrial', 'ring'], tot = 0, km = 0;
    ids.forEach(function (k) { if (wc[k]) { tot += wc[k].edges; km += wc[k].km; } });
    var peaks = profilePeaks('work');
    function asm(n, ar, en, bodyAr, bodyEn) { return h('li', { class: 'nat-asm' }, h('i', { 'aria-hidden': 'true' }, String(n)), h('span', null, h('b', null, bi(ar, en), ' ', tag('warn', B('افتراض', 'ASSUMPTION'))), h('small', null, bi(bodyAr, bodyEn)))); }
    return h('section', { class: 'pn nat-card nat-how' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('من أين يأتي الازدحام؟', 'Where does the traffic come from?')), simTag()), h('div', { class: 'pn-b' }, [
      h('p', { class: 'nat-p' }, icon('help'), bi('لا تستخدم منارة أي بيانات مرور حقيقية. الازدحام هنا محاكاة بثلاث قواعد معلنة، فعبارة «الأسرع بحسب الازدحام» تعرض الآلية ولا تقيس قطر.', 'MANARA uses no real traffic data. The congestion here is simulated by three stated rules, so “fastest given traffic” shows the mechanism; it does not measure Qatar.')),
      h('ol', { class: 'nat-asms' },
        asm(1, 'منحنى يومي', 'A daily curve', 'ضغط المرور يتبع منحنىً بحسب الساعة ونوع اليوم (الأحد–الأربعاء عمل، الخميس، الجمعة، السبت). ذروات المنحنى المفترض في يوم العمل: ' + (peaks.join('، ') || '–') + ' (شكل مفترض، لا قياس).', 'Traffic pressure follows a curve by hour and day type (Sunday–Wednesday work, Thursday, Friday, Saturday). The assumed work-day curve peaks at ' + (peaks.join(', ') || '–') + ' (an assumed shape, not a measurement).'),
        asm(2, 'قاعدة النقاط الساخنة', 'A hot-spot rule', 'تباطؤ إضافي فقط على الطرق التي تحمل في OSM اسم كورنيش أو دائري أو صناعي أو سلوى (' + N(tot) + ' مقطعًا، ' + N(km, 0) + ' كم في البيانات) وقرب المناطق الصناعية؛ وقلب المدن يتباطأ أكثر من الطرق السريعة الريفية.', 'Extra slow-down only on roads whose OSM name contains Corniche, Ring, Industrial or Salwa (' + N(tot) + ' segments, ' + N(km, 0) + ' km in the data) and near industrial areas; city cores slow more than rural highways.'),
        asm(3, 'تباطؤ حول الحادث', 'An incident slow-down', 'الطرق على بعد ٣٠٠–٥٥٠ م من حادث نشط تتباطأ (يكبر النصف بالشدة)، والمطر يبطئ الطرق ويغلق المعابر المنخفضة عند ٣٠ سم (S55).', 'Roads within 300–550 m of an active incident slow down (the radius grows with severity), and rain slows roads and closes low underpasses at 30 cm (S55).')),
      h('p', { class: 'nat-p muted small' }, bi('النتيجة: كل ETA في هذه الصفحة محاكى. لو توفّرت بيانات مرور حقيقية لتغيّرت الأرقام، لكن الآلية (اختيار أقل زمن وصول لا أقل مسافة) تبقى.', 'The result: every ETA on this page is simulated. With real traffic data the numbers would change, but the mechanism (choose the lowest ETA, not the shortest distance) stays.')),
      h('details', { class: 'jg' }, h('summary', null, bi('كل افتراضات المرور وقيمها', 'All traffic assumptions and their values')), h('div', { class: 'jg-b' }, paramTable('traffic')))]));
  }
  function renderTStats() {
    var s = NS.snap, tr = s.kpis.traffic;
    return h('div', { class: 'nat-facts' }, kvRow(B('متوسط السرعة', 'Mean speed'), N(Math.round(tr.meanSpeedRatio * 100)) + B('% من الحرة', '% of free flow')), kvRow(B('ضغط الذروة الآن', 'Peak pressure now'), N(Math.round(tr.pressure * 100)) + '%'), kvRow(B('طرق مزدحمة بقرارك', 'Roads you jammed'), N(Object.keys(NS.jams).length)), kvRow(B('طرق مغلقة', 'Closed roads'), N(s.closedEdges.length)));
  }
  function renderRoadCard() {
    if (NS.road == null) return h('section', { class: 'pn nat-card' }, h('div', { class: 'pn-b' }, para('اضغط على طريق (بأداة «فحص» أو «ازدحام») لترى تفاصيله وتزحمه أو تغلقه ثم تشاهد كيف يتغير الإرسال.', 'Click a road (with the Inspect or Jam tool) to see it, jam it or close it, then watch how the dispatch changes.', 'muted')));
    var e = NS.road, inf = NN.roadInfo(NS.nat, e); if (!inf) return null;
    return h('section', { class: 'pn nat-card nat-road' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, icon('car'), ' ', nm(inf.name)), simTag()), h('div', { class: 'pn-b' }, [roadFacts(inf),
      h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'car', NS.jams[e] != null ? 'ارفع الازدحام' : 'ازدحم هذا الطريق', NS.jams[e] != null ? 'Clear the jam' : 'Jam this road', function () { jamEdge(e); }), btn('btn btn-ghost btn-sm', 'x', NS.closes[e] ? 'افتح الطريق' : 'أغلق الطريق', NS.closes[e] ? 'Re-open' : 'Close the road', function () { closeEdge(e); }), btn('btn btn-ghost btn-sm', 'target', 'اذهب إليه', 'Fly to', function () { var ll = NS.map.edgeMid(e); NS.map.flyTo({ lon: ll[0], lat: ll[1], ppk: 40 }, 600); }))]));
  }
  function buildLayerToggles() {
    UI.layerCbs = {}; var L = NS.layers;
    var defs = [['traffic', 'ألوان الازدحام على الطرق', 'Congestion colours on roads'], ['units', 'الوحدات المتحركة', 'Moving units'], ['munis', 'حالة البلديات (تلوين)', 'Municipality status tint'], ['places', 'أسماء الأماكن', 'Place names'], ['tunnels', 'الأنفاق والمعابر المنخفضة', 'Tunnels and low underpasses'], ['closures', 'علامات الإغلاق والازدحام', 'Closure and jam markers'],
      ['fac.hospital', 'المستشفيات', 'Hospitals'], ['fac.fire', 'مراكز الإطفاء', 'Fire stations'], ['fac.police', 'مراكز الشرطة', 'Police stations'], ['fac.ambulance', 'نقاط الإسعاف', 'Ambulance points'], ['fac.minor', 'عيادات ومراكز صحية وتخصصية', 'Clinics, health and specialist centres']];
    return h('div', { class: 'nat-layers' }, defs.map(function (d) {
      var key = d[0], on = key.indexOf('fac.') === 0 ? L.fac[key.slice(4)] : L[key];
      var row = toggleRow(d[1], d[2], on, function (v) { setLayer(key, v); }, 'nat-ly-' + key.replace('.', '-')); UI.layerCbs[key] = row._cb; return row;
    }));
  }
  function syncLayerUI() { if (!UI.layerCbs) return; var L = NS.layers; Object.keys(UI.layerCbs).forEach(function (k) { var on = k.indexOf('fac.') === 0 ? L.fac[k.slice(4)] : L[k]; if (UI.layerCbs[k].checked !== !!on) UI.layerCbs[k].checked = !!on; }); }

  /* ---------------------------------------------------------------- 10.4 HAZARDS */
  function buildHazardPane() {
    var p = UI.paneEls.hazards; NS.dustCfg = { deg: 315, mps: 12 };
    UI.hzOverlay = seg([{ id: 'off', ar: 'بدون', en: 'Off' }, { id: 'heat', icon: 'thermo', ar: 'حرارة', en: 'Heat' }, { id: 'dust', icon: 'wind', ar: 'غبار', en: 'Dust' }, { id: 'rain', icon: 'flood', ar: 'مطر', en: 'Rain' }], function () { return NS.layers.hazard; }, function (v) { setLayer('hazard', v); }, ['طبقة الخطر على الخريطة', 'Hazard overlay on the map']);
    p.appendChild(card('طبقات الأخطار (محاكاة)', 'Hazard overlays (simulated)', [para('حقول الحرارة والغبار والمطر محاكاة على شبكة خشنة فوق الخريطة الحقيقية. ليست قياسات ولا تنبؤات.', 'The heat, dust and rain fields are simulated on a coarse grid over the real map. They are not measurements and not forecasts.'), UI.hzOverlay, zone('hazards', 'hzlegend', function () { return NS.layers.hazard; }, renderHzLegend)], simTag()));
    // heat
    p.appendChild(card('الحرارة', 'Heat', [zone('hazards', 'heat', function () { return Math.floor(NS.snap.t / 300) + ':' + NS.opts.season; }, renderHeat)], simTag()));
    // dust
    var degRow = rangeRow('اتجاه الرياح (المصدر)', 'Wind from (bearing)', 0, 345, 15, 315, function (v) { return N(v) + '° ' + compassTxt(v); }, function (v) { NS.dustCfg.deg = v; }, 'nat-dust-deg');
    var mpsRow = rangeRow('سرعة الرياح', 'Wind speed', 4, 25, 1, 12, function (v) { return N(v) + ' m/s'; }, function (v) { NS.dustCfg.mps = v; }, 'nat-dust-mps');
    p.appendChild(card('الغبار', 'Dust', [degRow, mpsRow, h('div', { class: 'nat-btnrow' }, btn('btn btn-primary btn-sm', 'wind', 'ابدأ جبهة غبار', 'Start a dust front', function () { startDust(NS.dustCfg.deg, NS.dustCfg.mps); }, { id: 'nat-dust-start' }), btn('btn btn-ghost btn-sm', 'x', 'أوقف الغبار', 'Stop the dust', stopDust, { id: 'nat-dust-stop' })),
      zone('hazards', 'dust', function () { return Math.floor(NS.snap.t / 120) + ':' + (NS.snap.dust.on ? 1 : 0); }, renderDust)], simTag()));
    // rain / flood
    UI.rainRow = rangeRow('معدل المطر الوطني', 'National rain rate', 0, 60, 1, 0, function (v) { return N(v) + ' ' + B('مم/س', 'mm/h'); }, function (v) { setRain(v); logOp('operator', 'معدل المطر ' + v + ' مم/س', 'Rain rate ' + v + ' mm/h'); refreshZones(true); }, 'nat-rain');
    p.appendChild(card('الأمطار والسيول', 'Rain and flooding', [UI.rainRow, h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'flood', 'أضف سحابة مطر في وسط الخريطة', 'Add a storm cell at the map centre', addStorm, { id: 'nat-storm' }), btn('btn btn-ghost btn-sm', 'x', 'أزل المطر', 'Clear the rain', function () { clearRain(); UI.rainRow._inp.value = 0; UI.rainRow._out.textContent = UI.rainRow._fmt(0); logOp('operator', 'أُزيل المطر', 'Rain cleared'); }, { id: 'nat-rain-clear' })),
      zone('hazards', 'flood', function () { return Math.floor(NS.snap.t / 120) + ':' + NS.snap.kpis.hazards.flood.tunnelsClosed + ':' + NS.rainMm; }, renderFlood)], simTag()));
    // advisories
    var pubRow = toggleRow('انشر الإرشادات إلى هواتف السكان', 'Publish advisories to residents\' phones', NS.pubAdv, function (v) { NS.pubAdv = v; if (v) publishAdvisory(true); }, 'nat-pub-adv');
    p.appendChild(card('إرشادات وطنية', 'National advisories', [zone('hazards', 'adv', function () { return NS.snap.kpis.advisories.map(function (a) { return a.key + a.level + (a.muni || ''); }).join(','); }, renderAdvisories), pubRow, para('نصوص الإرشادات تأتي من مفاتيح الرسائل المشتركة (nat.adv.*) فتظهر نفسها على هاتف المقيم. الأرقام القانونية تُقاس بأجهزة WBGT، وما هنا تقدير.', 'The advisory wording comes from the shared message keys (nat.adv.*), so a resident\'s phone shows the same words. The legal figures are measured with a WBGT meter; what you see here is an estimate.', 'muted small')]));
    p.appendChild(simNote());
  }
  function compassTxt(deg) { try { var c = NN.compass(deg); return nm(c); } catch (e) { return ''; } }
  function syncHazardUI() { if (UI.hzOverlay && UI.hzOverlay._sync) UI.hzOverlay._sync(); touchZone('hzlegend'); }
  function renderHzLegend() {
    var m = NS.layers.hazard, rows;
    if (m === 'off') return para('اختر طبقة لترى الحقل على الخريطة.', 'Pick a layer to see the field on the map.', 'muted small');
    function sw(c) { return h('i', { class: 'nat-lgsw', style: 'background:' + c }); }
    if (m === 'heat') rows = [[tok('--safe'), '< ٢٨ °م', '< 28 °C', 'أقل من حد التنبيه', 'below the action limit'], [tok('--warn'), '٢٨–٣٢٫١ °م', '28–32.1 °C', 'تنبيه (حد OSHA للعمل الخفيف، S52)', 'warning (OSHA light-work action limit, S52)'], [tok('--danger'), '> ٣٢٫١ °م', '> 32.1 °C', 'أوقفوا العمل (ILO قطر، S19)', 'stop work (ILO on Qatar law, S19)']];
    else if (m === 'dust') rows = [[tok('--brand'), '١٥٠', '150', 'ميكروغرام/م³ — حد المعيار القطري (S31)', 'µg/m³ — Qatar national standard (S31)'], [tok('--warn'), '٢٥٥', '255', 'غير صحي (نطاق EPA، S49)', 'unhealthy (EPA band, S49)'], [tok('--danger'), '٤٢٥', '425', 'خطر (نطاق EPA، S49)', 'hazardous (EPA band, S49)']];
    else rows = [[tok('--info'), '> ٠٫٣', '> 0.3', 'مم/س — مطر', 'mm/h — rain'], [tok('--accent'), '٣٠ سم', '30 cm', 'يُغلق النفق عند هذا العمق (S55)', 'an underpass closes at this depth (S55)']];
    return h('ul', { class: 'nat-lglist' }, rows.map(function (r) { return h('li', null, sw(r[0]), h('b', { class: 'mono' }, B(r[1], r[2])), h('span', null, B(r[3], r[4]))); }));
  }
  function levelName(l) { return { ok: B('جيد', 'OK'), normal: B('عادي', 'Normal'), watch: B('مراقبة', 'Watch'), warn: B('تنبيه', 'Warning'), warning: B('تنبيه', 'Warning'), stop: B('إيقاف العمل', 'Stop work'), danger: B('خطر', 'Danger'), info: B('معلومة', 'Info') }[l] || l; }
  function renderHeat() {
    var s = NS.snap, hz = s.kpis.hazards.heat, ex = []; try { ex = NN.heatExposure(NS.nat); } catch (e) { ex = []; }
    var lv = hz.level === 'stop' ? 'danger' : hz.level === 'warn' ? 'warn' : 'safe';
    var kids = [h('div', { class: 'nat-facts' }, kvRow(B('أعلى WBGT تقديري', 'Highest WBGT estimate'), N(hz.wbgtMax, 1) + ' °C'), kvRow(B('المستوى', 'Level'), h('span', { class: 'tag ' + lv }, levelName(hz.level))), kvRow(B('حظر العمل ظهرًا (١٠:٠٠–١٥:٣٠، ١ يونيو–١٥ سبتمبر)', 'Midday outdoor-work ban (10:00–15:30, 1 Jun–15 Sep)'), hz.middayBan ? B('ساري الآن', 'in force now') : B('غير ساري الآن', 'not in force now')))];
    kids.push(para('WBGT هنا تقدير من نموذج بسيط (درجة الحرارة والرطوبة وحمل الشمس). الحد ٣٢٫١ °م (S19) والحظر الصيفي (S18) مصدرهما منظمة العمل الدولية؛ الرقم القانوني يُقاس بجهاز.', 'WBGT here is an estimate from a simple model (temperature, humidity, sun load). The 32.1 °C limit (S19) and the summer ban (S18) come from the ILO; the legal figure is measured with an instrument.', 'muted small'));
    if (ex.length) kids.push(h('details', { class: 'jg' }, h('summary', null, bi('المناطق الصناعية والموانئ في OSM (' + N(ex.length) + ')', 'Industrial areas and ports in OSM (' + N(ex.length) + ')')), h('div', { class: 'jg-b' }, ex.slice(0, 8).map(function (q) { return h('div', { class: 'nat-kv' }, h('span', { class: 'k' }, nm(q.name)), h('span', { class: 'v mono' }, N(q.wbgt, 1) + ' °C · ' + levelName(q.level))); }).concat([para('بلا أي عدد للعمال: لا نختلق أرقامًا.', 'No worker counts: we do not invent numbers.', 'muted small')]))));
    if (NS.opts.season === 'winter' && hz.level === 'ok') kids.push(para('الموسم «شتاء»: لا إجهاد حراري. بدّله إلى «صيف» من لوحة المرور لترى إنذارات الحرارة.', 'The season is “winter”: no heat stress. Switch to “summer” in the Traffic panel to see the heat advisories.', 'muted small'));
    return kids;
  }
  function renderDust() {
    var d = NS.snap.kpis.hazards.dust;
    if (!d.on) return h('div', { class: 'nat-facts' }, kvRow(B('الحالة', 'State'), B('لا غبار الآن', 'No dust front now')), kvRow(B('أعلى PM10 تقديري', 'Highest PM10 estimate'), N(d.pm10Max) + ' µg/m³'));
    return h('div', { class: 'nat-facts' }, kvRow(B('الحالة', 'State'), B('جبهة غبار تتقدم', 'A dust front is advancing')), kvRow(B('أعلى PM10 تقديري', 'Highest PM10 estimate'), N(d.pm10Max) + ' µg/m³'), kvRow(B('موقع الجبهة على محور الرياح', 'Front position on the wind axis'), N(d.frontKm, 0) + B(' كم', ' km')));
  }
  function renderFlood() {
    var f = NS.snap.kpis.hazards.flood, T2 = (NS.tunnels || []).filter(function (t) { return t.depthCm > 0.5 || t.closed; }).sort(function (a, b) { return b.depthCm - a.depthCm; });
    var kids = [h('div', { class: 'nat-facts' }, kvRow(B('أقصى معدل مطر', 'Peak rain rate'), N(f.rainMax, 0) + B(' مم/س', ' mm/h')), kvRow(B('أنفاق ومعابر مغلقة', 'Underpasses closed'), N(f.tunnelsClosed)), kvRow(B('أقصى عمق ماء', 'Deepest water'), N(f.maxDepthCm, 0) + B(' سم', ' cm')))];
    if (T2.length) kids.push(h('ul', { class: 'nat-opts nat-tun' }, T2.slice(0, 6).map(function (t) { return h('li', null, h('button', { type: 'button', class: 'nat-link', onclick: function () { NS.map.flyTo({ lon: t.lon, lat: t.lat, ppk: 60 }, 600); selectThing('tunnel', String(t.edge)); } }, nm(t.name) || B('نفق', 'Tunnel')), h('span', { class: 'mono' }, N(t.depthCm, 0) + ' cm' + (t.closed ? ' ✕' : ''))); })));
    kids.push(para('لا يوجد نموذج ارتفاعات: الماء يتجمع فقط في الأنفاق والمعابر المنخفضة الموجودة في بيانات OSM، والإغلاق عند ٣٠ سم (S55).', 'There is no elevation model: water gathers only in the tunnels and low underpasses in the OSM data, and a road closes at 30 cm (S55).', 'muted small'));
    return kids;
  }
  function renderAdvisories() {
    var adv = NS.snap.kpis.advisories || [];
    if (!adv.length) return emptyState('check', 'لا توجد إرشادات وطنية الآن.', 'No national advisories right now.');
    var rank = { danger: 0, warning: 1, watch: 2, info: 3 }, list = adv.slice().sort(function (a, b) { return (rank[a.level] || 9) - (rank[b.level] || 9); });
    function li(a) { return h('li', { class: 'nat-adv ' + a.level }, h('span', { class: 'tag ' + (LEVEL_TAG[a.level] || '') }, levelName(a.level)), h('span', { class: 'nat-adv-t' }, msg(a.key, a.params)), h('small', { class: 'muted mono' }, a.key)); }
    var first = list.slice(0, 5), rest = list.slice(5), out = [h('ul', { class: 'nat-advlist', 'aria-live': 'polite' }, first.map(li))];
    if (rest.length) out.push(h('details', { class: 'jg' }, h('summary', null, bi('+ ' + N(rest.length) + ' إرشادًا آخر', '+ ' + N(rest.length) + ' more')), h('div', { class: 'jg-b' }, h('ul', { class: 'nat-advlist' }, rest.map(li)))));
    return out;
  }

  /* ---------------------------------------------------------------- 10.5 KPIs */
  function drawTrend() {
    var c = UI.trend; if (!c || c.offsetParent === null) return; var o = prepCanvas(c, 120), g = o.g, W = o.w, H = o.h, pl = 8, pr = 8, pt2 = 10, pb = 18, hist = NS.kpiHist, rtl = lang() === 'ar';
    g.font = '11px ' + chartFont(); g.fillStyle = tok('--muted'); g.strokeStyle = tok('--line'); g.lineWidth = 1; g.beginPath(); for (var i = 0; i <= 2; i++) { var yy = pt2 + i * (H - pt2 - pb) / 2; g.moveTo(pl, yy); g.lineTo(W - pr, yy); } g.stroke();
    if (hist.length < 2) { g.textAlign = 'center'; g.fillText(B('يتجمع المنحنى مع مرور وقت المحاكاة…', 'The trend builds up as simulated time passes…'), W / 2, H / 2); return; }
    var t0 = hist[0].t, t1 = hist[hist.length - 1].t, X = function (t) { var f = (t - t0) / Math.max(1, t1 - t0); return pl + (rtl ? 1 - f : f) * (W - pl - pr); };
    var maxE = 60; hist.forEach(function (q) { if (q.eta != null && q.eta > maxE) maxE = q.eta; }); maxE = Math.ceil(maxE / 60) * 60;
    function line(key, color, scaleFn, dash) { g.beginPath(); var started = false; hist.forEach(function (q) { var v = q[key]; if (v == null) { started = false; return; } var x = X(q.t), y = pt2 + (1 - scaleFn(v)) * (H - pt2 - pb); if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; } }); g.strokeStyle = color; g.lineWidth = 2; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); }
    line('speed', tok('--safe'), function (v) { return clamp(v, 0, 1); }); line('eta', tok('--brand'), function (v) { return clamp(v / maxE, 0, 1); });
    g.textAlign = rtl ? 'right' : 'left'; g.fillStyle = tok('--muted'); g.fillText(mmss(maxE), rtl ? W - pr : pl + 2, pt2 + 10); g.fillText('0', rtl ? W - pr : pl + 2, H - pb - 3); g.textAlign = 'center'; g.fillText(B('الزمن المحاكى', 'Simulated time') + ' →', W / 2, H - 4);
  }
  function buildKpiPane() {
    var p = UI.paneEls.kpi;
    UI.trend = h('canvas', { class: 'nat-trend', role: 'img' }); lab(UI.trend, 'aria-label', 'منحنى متوسط زمن وصول أول وحدة والسرعة المرورية مع الزمن المحاكى', 'Trend of the mean first-unit ETA and the traffic speed over simulated time');
    p.appendChild(zone('kpi', 'kpi', function () { return Math.floor(NS.snap.t / 20) + ':' + NS.snap.incidents.length; }, renderKpis));
    p.appendChild(card('الاتجاه مع الزمن', 'Trend over time', [UI.trend, h('p', { class: 'nat-trend-key muted small' }, h('i', { class: 'k1' }), bi('متوسط زمن وصول أول وحدة', 'mean first-unit ETA'), ' ', h('i', { class: 'k2' }), bi('سرعة المرور (٪ من الحرة)', 'traffic speed (% of free flow)')), para('كل المنحنيات محاكاة وتبدأ فارغة وتمتلئ مع الوقت.', 'All curves are simulated; they start empty and fill as time runs.', 'muted small')], simTag()));
    p.appendChild(card('حالة البلديات الثماني', 'The 8 municipalities', [zone('kpi', 'munis', function () { return Math.floor(NS.snap.t / 60) + ':' + NS.snap.kpis.municipalities.map(function (m) { return m.level + m.incidents; }).join(''); }, renderMunis), para('المستوى يجمع الحرارة (WBGT) والغبار والمطر في كل بلدية. الوحدات من بيانات OSM؛ توفّرها محاكى.', 'The level combines heat (WBGT), dust and rain in each municipality. Units come from OSM data; their availability is simulated.', 'muted small')], simTag()));
    p.appendChild(simNote());
  }
  function kpiTile(cls, label, value, sub) { return h('div', { class: 'kpi nat-kpi ' + (cls || '') }, h('b', null, value), h('span', null, label), sub ? h('small', { class: 'muted' }, sub) : null); }
  function renderKpis() {
    var k = NS.snap.kpis, u = k.units, tr = k.traffic, hz = k.hazards, act = k.incidents.active, eta = k.meanFirstEtaActiveSec;
    var tiles = h('div', { class: 'nat-kpis' },
      kpiTile(act ? 'warn' : '', B('حوادث نشطة', 'Active incidents'), N(act), B('من ' + N(k.incidents.total) + ' كلها', 'of ' + N(k.incidents.total) + ' total')),
      kpiTile('cool', B('وحدات متاحة', 'Units available'), N(u.available) + '/' + N(u.total), B('مشغولة ' + N(u.busy) + ' (محاكاة)', N(u.busy) + ' busy (SIM)')),
      kpiTile('', B('في الطريق / في الموقع', 'En route / on scene'), N(u.enRoute) + ' / ' + N(u.onScene), B('عائدة ' + N(u.returning), N(u.returning) + ' returning')),
      kpiTile(eta != null ? 'safe' : '', B('متوسط وصول أول وحدة', 'Mean first-unit ETA'), eta != null ? mmss(eta) : 'N/A', eta != null ? B('على الحوادث النشطة', 'on active incidents') : B('لا حادث نشط', 'no active incident')),
      kpiTile(tr.meanSpeedRatio < 0.6 ? 'warn' : '', B('سرعة المرور', 'Traffic speed'), N(Math.round(tr.meanSpeedRatio * 100)) + '%', B('من السرعة الحرة (محاكاة)', 'of free flow (SIM)')),
      kpiTile('', B('إعادة إرسال / إعادة توجيه', 'Re-dispatches / re-routes'), N(tr.redispatches) + ' / ' + N(tr.reroutes), B('تلقائيًا', 'automatic')),
      kpiTile(hz.heat.level === 'stop' ? 'danger' : hz.heat.level === 'warn' ? 'warn' : 'safe', B('أعلى WBGT تقديري', 'Highest WBGT estimate'), N(hz.heat.wbgtMax, 1) + '°', levelName(hz.heat.level)),
      kpiTile(hz.dust.on ? 'warn' : '', B('أعلى PM10 تقديري', 'Highest PM10 estimate'), N(hz.dust.pm10Max), 'µg/m³'),
      kpiTile(hz.flood.tunnelsClosed ? 'danger' : '', B('أنفاق مغلقة بالمطر', 'Underpasses closed by rain'), N(hz.flood.tunnelsClosed), B('أقصى مطر ' + N(hz.flood.rainMax, 0) + ' مم/س', 'peak rain ' + N(hz.flood.rainMax, 0) + ' mm/h')));
    var bars = h('div', { class: 'nat-bars' }, ['fire', 'ambulance', 'police'].map(function (kd) {
      var q = u.byKind[kd] || { total: 0, available: 0 }, pct = q.total ? q.available / q.total * 100 : 0;
      return h('div', { class: 'brow' }, h('span', { class: 'brow-l' }, kindName(kd)), h('span', { class: 'brow-bar' }, h('i', { style: 'width:' + pct + '%;--c:var(' + KIND[kd].tok + ')' })), h('span', { class: 'brow-v mono' }, N(q.available) + '/' + N(q.total)));
    }));
    return h('section', { class: 'pn nat-card' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('المؤشرات الوطنية', 'National KPIs')), simTag()), h('div', { class: 'pn-b' }, tiles, h('h4', { class: 'nat-h4' }, bi('الوحدات المتاحة حسب النوع', 'Units available by type')), bars,
      h('p', { class: 'muted small' }, bi('عدد الوحدات من بيانات OSM (٢٠ مركز إطفاء قابلًا للاستخدام مقابل ٢٣ رسميًا، وثلاث نقاط إسعاف فقط): الفجوات فجوات بيانات لا ادعاءات عن الخدمة الحقيقية.', 'Unit counts come from the OSM data (20 usable fire stations against 23 official centres, and only three ambulance points): gaps are gaps of the data, not claims about the real service.'))));
  }
  function renderMunis() {
    var ms = NS.snap.kpis.municipalities;
    var rows = ms.map(function (m) {
      return h('tr', null, h('td', null, h('button', { type: 'button', class: 'nat-link', onclick: function () { flyToMuni(m.id); } }, nm(m.name))), h('td', null, h('span', { class: 'tag ' + (LEVEL_TAG[m.level] || '') }, levelName(m.level))), h('td', { class: 'mono' }, N(m.wbgtMax, 1)), h('td', { class: 'mono' }, N(m.pm10Max)), h('td', { class: 'mono' }, N(m.rainMax, 0)), h('td', { class: 'mono' }, N(m.incidents)), h('td', { class: 'mono' }, N(m.unitsAvailable) + '/' + N(m.unitsBased)));
    });
    return h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table' }, h('thead', null, h('tr', null, [['البلدية', 'Municipality'], ['الحالة', 'Status'], ['WBGT °C', 'WBGT °C'], ['PM10', 'PM10'], [B('مطر', 'Rain'), B('مطر', 'Rain')], ['حوادث', 'Inc.'], ['وحدات', 'Units']].map(function (c) { return h('th', { scope: 'col' }, B(c[0], c[1])); }))), h('tbody', null, rows)));
  }

  /* ---------------------------------------------------------------- 10.6 A/B */
  var AB_HOURS = [[7.75, 'ذروة الصباح ٠٧:٤٥', 'Morning peak 07:45'], [13.5, 'الظهيرة ١٣:٣٠', 'Midday 13:30'], [17.75, 'ذروة المساء ١٧:٤٥', 'Evening peak 17:45'], [3, 'الفجر ٠٣:٠٠', 'Night 03:00']];
  function buildAbPane() {
    var p = UI.paneEls.ab, C = NS.abCfg;
    UI.abN = h('select', { class: 'input', id: 'nat-ab-n' }, [50, 100, 150].map(function (n) { return h('option', { value: String(n) }, N(n)); })); UI.abN.value = String(C.n); UI.abN.addEventListener('change', function () { C.n = +UI.abN.value; });
    UI.abHour = h('select', { class: 'input', id: 'nat-ab-hour' }, AB_HOURS.map(function (q) { return h('option', { value: String(q[0]) }, B(q[1], q[2])); })); UI.abHour.value = String(C.hour); UI.abHour.addEventListener('change', function () { C.hour = +UI.abHour.value; });
    UI.abSeed = h('input', { type: 'number', class: 'input', min: '1', max: '99999', value: String(NS.abSeed), id: 'nat-ab-seed' }); UI.abSeed.addEventListener('change', function () { NS.abSeed = clamp(parseInt(UI.abSeed.value, 10) || 7, 1, 99999); UI.abSeed.value = NS.abSeed; });
    var load = rangeRow('مضاعِف الازدحام', 'Congestion multiplier', 0, 2, 0.1, C.trafficLoad, function (v) { return N(v, 1) + '×'; }, function (v) { C.trafficLoad = v; }, 'nat-ab-load');
    var busy = rangeRow('نسبة الوحدات المشغولة', 'Share of units busy', 0, 60, 5, C.unitBusyPct, function (v) { return N(v) + '%'; }, function (v) { C.unitBusyPct = v; }, 'nat-ab-busy');
    var hzChips = h('div', { class: 'chips nat-abhz', role: 'group' }, ['fire', 'gas', 'flood', 'sos'].map(function (hz) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': C.hazards[hz] ? 'true' : 'false', onclick: function () { C.hazards[hz] = !C.hazards[hz]; if (!Object.keys(C.hazards).some(function (k) { return C.hazards[k]; })) C.hazards[hz] = true; $$('.chip', hzChips).forEach(function (x) { x.setAttribute('aria-pressed', C.hazards[x.getAttribute('data-hz')] ? 'true' : 'false'); }); } }, bi(NN.HAZARD_NAME[hz].ar, NN.HAZARD_NAME[hz].en)); b.setAttribute('data-hz', hz); return b;
    }));
    lab(hzChips, 'aria-label', 'أنواع الحوادث في المقارنة', 'Incident types in the comparison');
    var run = btn('btn btn-primary', 'play', 'شغّل المقارنة', 'Run the comparison', function () { runAB(); }, { id: 'nat-ab-run' }), sens = btn('btn btn-ghost btn-sm', 'sliders', 'حسّاسية الافتراضات', 'Sensitivity to the assumptions', function () { runSweep(); }, { id: 'nat-ab-sweep' });
    p.appendChild(card('المقارنة: الأقرب بالمسافة أم الأسرع بحسب الازدحام؟', 'A/B: nearest by distance or fastest given traffic?', [
      para('نفس الحوادث المبذورة ونفس الوحدات المتاحة، وسياستان: «الأقرب بخط مستقيم» (ما يراه المرسِل على الخريطة) و«الأسرع بحسب الازدحام» (منارة). نقارن زمن وصول أول وحدة.', 'The same seeded incidents and the same available units, two policies: “nearest in a straight line” (what a dispatcher sees on a map) and “fastest given traffic” (MANARA). We compare the first unit\'s ETA.'),
      h('div', { class: 'nat-two' }, field('عدد الحوادث', 'Incidents', UI.abN), field('البذرة (للتكرار)', 'Seed (to reproduce)', UI.abSeed)), field('وقت اليوم', 'Time of day', UI.abHour), field('أنواع الحوادث', 'Incident types', hzChips), load, busy,
      h('div', { class: 'nat-btnrow' }, run, sens), para('محاكاة: فحص لآلية العمل وليس دليلًا على الأثر. تعتمد النتيجة على افتراضات الازدحام والتوفّر المعلنة أدناه.', 'Simulation: a mechanism check, not proof of impact. The result depends on the traffic and availability assumptions listed below.', 'muted small')], simTag()));
    p.appendChild(zone('ab', 'abres', function () { return (NS.abRunning ? 'run' : NS.ab ? NS.ab.res.hash + NS.ab.res.seed : 'none'); }, renderABResult));
    UI.abCanvas = null;
    p.appendChild(zone('ab', 'sweep', function () { return NS.sweep === 'run' ? 'run' : NS.sweep ? NS.sweep.hash : 'none'; }, renderSweep));
    p.appendChild(zone('ab', 'assume', function () { return 'a'; }, renderAssumptions));
    p.appendChild(simNote());
  }
  function runAB() {
    if (NS.abRunning) return; var C = NS.abCfg, hazards = Object.keys(C.hazards).filter(function (k) { return C.hazards[k]; }); NS.abRunning = true; touchZone('abres'); refreshZones(true); announce(B('تعمل المقارنة…', 'The comparison is running…'));
    setTimeout(function () {
      var res = null, err = null, t0 = now();
      try { res = NN.ab({ seed: NS.abSeed, n: C.n, hazards: hazards, hour: C.hour, date: SEASONS[NS.opts.season], day: 0, params: { trafficLoad: C.trafficLoad, unitBusyPct: C.unitBusyPct } }); } catch (e) { err = e; }
      NS.abRunning = false; NS.ab = res ? { res: res, cfg: JSON.parse(JSON.stringify(C)), ms: Math.round(now() - t0) } : null; NS.abErr = err ? String(err.message || err) : null; touchZone('abres'); refreshZones(true); drawAB(); drawAB2();
      if (res) announce(B('انتهت المقارنة', 'The comparison is done'));
    }, 40);
  }
  function runSweep() {
    if (NS.sweep === 'run') return; NS.sweep = 'run'; touchZone('sweep'); refreshZones(true);
    setTimeout(function () { var r = null; try { r = NN.sensitivity({ seed: NS.abSeed, n: 50, hazards: ['fire', 'gas', 'flood', 'sos'], hour: NS.abCfg.hour, date: SEASONS[NS.opts.season], day: 0 }); r.hash = String(r.rows.length) + ':' + r.rows[0].meanSavedSec + ':' + r.rows[r.rows.length - 1].meanSavedSec; } catch (e) { r = null; } NS.sweep = r; touchZone('sweep'); refreshZones(true); }, 40);
  }
  function statRow(label, s) { return h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'mono' }, mmss(s.mean)), h('td', { class: 'mono' }, mmss(s.p50)), h('td', { class: 'mono' }, mmss(s.p90)), h('td', { class: 'mono' }, mmss(s.p99))); }
  function renderABResult() {
    if (NS.abRunning) return h('section', { class: 'pn nat-card' }, h('div', { class: 'pn-b' }, h('p', { class: 'nat-p' }, h('i', { class: 'nat-spin', 'aria-hidden': 'true' }), bi('تعمل المقارنة على الحوادث المبذورة…', 'Running the comparison on the seeded incidents…'))));
    if (NS.abErr) return h('section', { class: 'pn nat-card' }, h('div', { class: 'pn-b' }, para('تعذّر تشغيل المقارنة.', 'The comparison could not run.', 'warn')));
    if (!NS.ab) return h('section', { class: 'pn nat-card nat-abintro' }, h('div', { class: 'pn-b' }, emptyState('target', 'اضغط «شغّل المقارنة» لترى توزيع أزمنة الوصول لسياستي الإرسال على نفس الحوادث (حوالي ثانية).', 'Press “Run the comparison” to see the distribution of ETAs for the two dispatch policies on the same incidents (about a second).')));
    var r = NS.ab.res, o = r.firstResponderEtaSec, sv2 = r.savedSec, df = r.differs;
    var gA = sv2.all, gD = sv2.whereChoiceDiffers;
    var tiles0 = h('div', { class: 'nat-kpis nat-abtiles' },
      kpiTile('safe', B('وسيط التوفير (كل الحوادث)', 'Median gain (all incidents)'), mmss(gA.p50), B('ثانية:دقيقة لأول وحدة', 'min:sec for the first unit')),
      kpiTile('cool', B('التوفير عند المئين ٩٠', '90th-percentile gain'), mmss(gA.p90), B('١٠٪ من الحوادث توفّر أكثر', '10% of incidents gain more')),
      kpiTile('warn', B('حوادث يتبدّل فيها الاختيار', 'Incidents where the order flips'), N(df.incidentsPct, 0) + '%', B('اختيار وحدة مختلف عن «الأقرب»', 'a different unit from “nearest”')),
      kpiTile('', B('وسيط التوفير حيث يتبدّل', 'Median gain where it flips'), mmss(gD.p50), B('على هذه الحوادث فقط', 'on those incidents only')));
    var sample0 = h('p', { class: 'nat-ab-sample' }, tag('cool', 'n = ' + N(r.evaluated)), ' ', tag('cool', B('بذرة ', 'seed ') + N(r.seed)), ' ', tag('warn', 'SIM'), ' ', h('span', { class: 'muted small' }, bi('حجم العيّنة والبذرة يكرّران النتيجة نفسها بالضبط.', 'The sample size and the seed reproduce exactly this result.')));
    var noProve = h('p', { class: 'nat-p warn nat-noprove' }, icon('alert'), bi('ما لا تثبته هذه النتيجة: أن أزمنة الاستجابة الحقيقية ستتحسن، أو أن ازدحام قطر الفعلي يشبه هذا المنحنى المفترض، أو أن الوحدات الحقيقية موجودة حيث تضعها المحاكاة. هي فحص لآلية العمل فقط.', 'What this does NOT prove: that real response times would improve, that Qatar\'s actual traffic looks like this assumed curve, or that real units are where the simulation puts them. It is a check of the mechanism only.'));
    var head = h('p', { class: 'nat-ab-sum' }, B('على ' + N(r.evaluated) + ' حادثًا محاكى (' + N(r.seed) + ' بذرة، ' + r.clock.slice(0, 5) + ' ' + nm(r.dowName) + '): متوسط وصول أول وحدة ' + mmss(o.ordinary.mean) + ' بسياسة «الأقرب بخط مستقيم» مقابل ' + mmss(o.manara.mean) + ' بسياسة «الأسرع بحسب الازدحام». يختلف الاختيار في ' + N(df.incidentsPct, 0) + '٪ من الحوادث، وحيث يختلف تصل منارة أبكر بمتوسط ' + N(Math.round(sv2.whereChoiceDiffers.mean)) + ' ثانية.',
      'Over ' + N(r.evaluated) + ' simulated incidents (seed ' + N(r.seed) + ', ' + r.clock.slice(0, 5) + ' ' + nm(r.dowName) + '): the mean first-unit ETA is ' + mmss(o.ordinary.mean) + ' with “nearest in a straight line” against ' + mmss(o.manara.mean) + ' with “fastest given traffic”. The choice differs on ' + N(df.incidentsPct, 0) + '% of incidents, and where it differs MANARA arrives a mean ' + N(Math.round(sv2.whereChoiceDiffers.mean)) + ' s earlier.'));
    UI.abCanvas2 = h('canvas', { class: 'nat-abchart nat-abchart2', role: 'img' }); lab(UI.abCanvas2, 'aria-label', 'مخطط الزمن الذي توفره منارة: كل الحوادث مقابل الحوادث التي يختلف فيها الاختيار', 'Chart of the time MANARA saves: all incidents against the incidents where the choice differs');
    UI.abCanvas = h('canvas', { class: 'nat-abchart', role: 'img' }); lab(UI.abCanvas, 'aria-label', 'مخطط زمن وصول أول وحدة حسب النسبة المئوية لثلاث سياسات', 'Chart of the first-unit ETA by percentile for three policies');
    var table = h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table' }, h('thead', null, h('tr', null, [B('السياسة', 'Policy'), B('المتوسط', 'Mean'), B('الوسيط', 'Median'), 'P90', 'P99'].map(function (c) { return h('th', { scope: 'col' }, c); }))),
      h('tbody', null, statRow(B('الأقرب بخط مستقيم', 'Nearest straight line'), o.ordinary), statRow(B('الأقرب بالطريق (دون ازدحام)', 'Nearest by road (no traffic)'), o.roadNearest), statRow(B('الأسرع بحسب الازدحام (منارة)', 'Fastest given traffic (MANARA)'), o.manara))));
    var kinds = Object.keys(r.byKind).map(function (k) { var q = r.byKind[k]; return h('tr', null, h('th', { scope: 'row' }, kindName(k)), h('td', { class: 'mono' }, N(q.n)), h('td', { class: 'mono' }, N(q.differsPct, 0) + '%'), h('td', { class: 'mono' }, N(q.farButFasterPct, 0) + '%'), h('td', { class: 'mono' }, mmss(q.savedSec.mean))); });
    var ktable = h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table' }, h('thead', null, h('tr', null, [B('النوع', 'Type'), B('عدد', 'n'), B('يختلف', 'Differs'), B('أبعد وأسرع', 'Farther+faster'), B('توفير متوسط', 'Mean saved')].map(function (c) { return h('th', { scope: 'col' }, c); }))), h('tbody', null, kinds)));
    var dl = btn('btn btn-ghost btn-sm', 'download', 'نزّل النتيجة (JSON)', 'Download the result (JSON)', function () { download('manara-national-ab-seed' + r.seed + '.json', 'application/json', JSON.stringify(r, null, 2)); }, { id: 'nat-ab-dl' });
    return h('section', { class: 'pn nat-card nat-abres', 'data-ready': '1' }, h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('النتيجة', 'Result')), h('span', { class: 'tag warn' }, nm(r.label))), h('div', { class: 'pn-b' }, [sample0, tiles0, noProve, head, UI.abCanvas,
      h('p', { class: 'nat-abkey muted small' }, h('i', { class: 'k1' }), bi('أقرب بخط مستقيم', 'nearest straight line'), ' ', h('i', { class: 'k3' }), bi('أقرب بالطريق', 'nearest by road'), ' ', h('i', { class: 'k2' }), bi('الأسرع بحسب الازدحام', 'fastest given traffic')),
      h('p', { class: 'muted small' }, bi('المحور الأفقي: النسبة المئوية للحوادث (١٠٪ أسرعها … ٩٩٪ أبطأها). المحور الرأسي: زمن وصول أول وحدة.', 'Horizontal: percentile of incidents (10% = the quickest … 99% = the slowest). Vertical: the first unit\'s ETA.')),
      h('h4', { class: 'nat-h4' }, bi('كم يوفّر اختيار منارة من الوقت؟', 'How much time does MANARA\'s choice save?')), UI.abCanvas2,
      h('p', { class: 'nat-abkey muted small' }, h('i', { class: 'k1' }), bi('كل الحوادث (الوسيط صفر: في أغلبها تختار السياستان الوحدة نفسها)', 'all incidents (the median is zero: in most of them both policies pick the same unit)'), ' ', h('i', { class: 'k2' }), bi('حيث يختلف الاختيار فقط', 'only where the choice differs')),
      table, ktable,
      h('p', { class: 'nat-p' }, tag('cool', N(df.unitChoicesPct, 0) + '%'), ' ', bi('من اختيارات الوحدات تختلف، و', 'of unit choices differ, and '), tag('cool', N(df.farButFasterChoicesPct, 0) + '%'), ' ', bi('منها أبعد بخط مستقيم لكن أسرع.', 'of them are farther but faster.')),
      h('p', { class: 'muted small' }, bi('محاكاة — فحص لآلية العمل وليس دليلًا على الأثر. أزمنة لحظية عند وقت الحادث على الحوادث نفسها والوحدات المتاحة نفسها. الهاش ', 'Simulation — a mechanism check, not proof of impact. Snapshot ETAs at the incident time on the same incidents and the same available units. Hash '), h('code', null, r.hash), bi(' للتحقق من التكرار.', ' to verify reproducibility.')), dl]));
  }
  function drawAB() {
    var c = UI.abCanvas; if (!c || !NS.ab || c.offsetParent === null) return; var r = NS.ab.res, o = prepCanvas(c, 190), g = o.g, W = o.w, H = o.h, pl = 40, pr = 10, pt2 = 12, pb = 24, rtl = lang() === 'ar';
    var ps = ['p10', 'p25', 'p50', 'p75', 'p90', 'p99'], px = [10, 25, 50, 75, 90, 99], series = [['ordinary', '--ink-2', [5, 4]], ['roadNearest', '--info', [2, 3]], ['manara', '--brand', []]], maxV = 0;
    series.forEach(function (s) { ps.forEach(function (q) { maxV = Math.max(maxV, r.firstResponderEtaSec[s[0]][q] || 0); }); }); maxV = Math.max(120, Math.ceil(maxV / 300) * 300);
    var X = function (pc) { var f = (pc - 10) / 89; return pl + (rtl ? 1 - f : f) * (W - pl - pr); }, Y = function (v) { return pt2 + (1 - v / maxV) * (H - pt2 - pb); };
    g.font = '11px ' + chartFont(); g.fillStyle = tok('--muted'); g.strokeStyle = tok('--line'); g.lineWidth = 1; g.textBaseline = 'middle'; g.textAlign = rtl ? 'left' : 'right';
    for (var i = 0; i <= 4; i++) { var v = maxV * i / 4, y = Y(v); g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke(); g.fillText(mmss(v), rtl ? 2 : pl - 5, y); }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; px.forEach(function (pc) { g.fillText(pc + '%', X(pc), H - 7); });
    series.forEach(function (s) { g.beginPath(); ps.forEach(function (q, k) { var xx = X(px[k]), yy = Y(r.firstResponderEtaSec[s[0]][q]); if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); }); g.strokeStyle = tok(s[1]); g.lineWidth = s[0] === 'manara' ? 2.8 : 2; g.setLineDash(s[2]); g.stroke(); g.setLineDash([]); if (s[0] === 'manara') { ps.forEach(function (q, k) { g.beginPath(); g.arc(X(px[k]), Y(r.firstResponderEtaSec.manara[q]), 3.4, 0, Math.PI * 2); g.fillStyle = tok('--brand'); g.fill(); }); } });
  }
  function drawAB2() {
    var c = UI.abCanvas2; if (!c || !NS.ab || c.offsetParent === null) return; var r = NS.ab.res, o = prepCanvas(c, 150), g = o.g, W = o.w, H = o.h, pl = 8, pr = 8, pt2 = 18, pb = 26, rtl = lang() === 'ar';
    var cats = [['mean', B('المتوسط', 'Mean')], ['p75', 'P75'], ['p90', 'P90'], ['p99', 'P99']], A = r.savedSec.all, D = r.savedSec.whereChoiceDiffers, maxV = 60;
    cats.forEach(function (q) { maxV = Math.max(maxV, A[q[0]] || 0, D[q[0]] || 0); }); maxV = Math.ceil(maxV / 60) * 60;
    var gw = (W - pl - pr) / cats.length, bw = Math.min(30, gw / 3), Y = function (v) { return pt2 + (1 - v / maxV) * (H - pt2 - pb); };
    g.font = '11px ' + chartFont(); g.textAlign = 'center'; g.strokeStyle = tok('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(pl, Y(0)); g.lineTo(W - pr, Y(0)); g.stroke();
    cats.forEach(function (q, i) {
      var gi = rtl ? cats.length - 1 - i : i, cx = pl + gw * (gi + 0.5);
      [[A[q[0]] || 0, '--ink-2', -1], [D[q[0]] || 0, '--brand', 1]].forEach(function (b) { var x = cx + b[2] * (bw / 2 + 2) - bw / 2, y = Y(b[0]); g.fillStyle = tok(b[1]); g.fillRect(x, y, bw, Math.max(1, Y(0) - y)); g.fillStyle = tok('--head'); g.textBaseline = 'alphabetic'; g.fillText(mmss(b[0]), x + bw / 2, y - 4); });
      g.fillStyle = tok('--muted'); g.fillText(q[1], cx, H - 8);
    });
  }
  function renderSweep() {
    var kids = [h('div', { class: 'pn-h' }, h('h3', { class: 'pn-t' }, bi('حسّاسية النتيجة للافتراضات', 'How the result depends on the assumptions')), simTag())];
    if (NS.sweep === 'run') return h('section', { class: 'pn nat-card' }, kids, h('div', { class: 'pn-b' }, h('p', { class: 'nat-p' }, h('i', { class: 'nat-spin', 'aria-hidden': 'true' }), bi('تحسب المحاكاة ١٥ تركيبة من الازدحام والتوفّر…', 'Computing 15 combinations of congestion and availability…'))));
    if (!NS.sweep) return h('section', { class: 'pn nat-card' }, kids, h('div', { class: 'pn-b' }, para('اضغط «حسّاسية الافتراضات» لترى كيف يتغير توفير الزمن مع شدة الازدحام ونسبة الوحدات المشغولة. الميزة تتوقف على الافتراضات، ونعرض ذلك صراحةً.', 'Press “Sensitivity to the assumptions” to see how the time saved changes with congestion and the share of busy units. The benefit depends on the assumptions, and we show that openly.', 'muted')));
    var sw = NS.sweep, rows = sw.rows, maxS = 1; rows.forEach(function (q) { maxS = Math.max(maxS, q.meanSavedSec); });
    var head = h('tr', null, h('th', { scope: 'col' }, B('الازدحام ↓ / المشغولة →', 'Congestion ↓ / busy →')), sw.busy.map(function (b) { return h('th', { scope: 'col', class: 'mono' }, N(b) + '%'); }));
    var body = sw.loads.map(function (L) { return h('tr', null, h('th', { scope: 'row', class: 'mono' }, N(L, 1) + '×'), sw.busy.map(function (b) { var q = rows.filter(function (z) { return z.trafficLoad === L && z.unitBusyPct === b; })[0]; var a = clamp(q.meanSavedSec / maxS, 0, 1); return h('td', { class: 'mono nat-heat', style: '--a:' + (0.12 + a * 0.62).toFixed(2) }, mmss(q.meanSavedSec)); })); });
    return h('section', { class: 'pn nat-card nat-sweep', 'data-ready': '1' }, kids, h('div', { class: 'pn-b' }, h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table' }, h('caption', { class: 'sr-only' }, B('متوسط الزمن الموفَّر لأول وحدة', 'Mean time saved for the first unit')), h('thead', null, head), h('tbody', null, body))),
      h('p', { class: 'muted small' }, bi('كل خلية: متوسط الثواني التي تصل بها أول وحدة أبكر بسياسة منارة (دقيقة:ثانية). محاكاة؛ لا ادّعاء أثر على الواقع.', 'Each cell: the mean time by which the first unit arrives earlier with MANARA\'s policy (min:sec). Simulation; no claim of real-world impact.'))));
  }
  function renderAssumptions() {
    var groups = NN.PARAM_GROUPS, defs = NN.PARAMS;
    var d = h('details', { class: 'jg nat-assume' }, h('summary', null, bi('سجلّ الافتراضات (' + N(defs.length) + ')', 'Assumptions registry (' + N(defs.length) + ')')));
    var b = h('div', { class: 'jg-b' }); d.appendChild(b);
    b.appendChild(para('كل رقم في المحاكاة افتراض مُسمّى بقيمته الافتراضية ومداه ومصدره. «assumption» تعني افتراضًا من المشروع؛ ومعرّفات S هي مصادر في ملف المصادر.', 'Every number in the simulation is a named assumption with its default, range and source. “assumption” means a project assumption; S-ids are rows of the sources file.', 'muted small'));
    groups.forEach(function (g) {
      var list = defs.filter(function (q) { return q.group === g.id; }); if (!list.length) return;
      b.appendChild(h('h4', { class: 'nat-h4' }, nm(g.label)));
      b.appendChild(h('div', { class: 'table-wrap nat-tw' }, h('table', { class: 'table nat-table nat-ptable' }, h('tbody', null, list.map(function (q) { return h('tr', null, h('td', null, h('b', null, nm(q.label)), h('br'), h('small', { class: 'muted' }, nm(q.desc))), h('td', { class: 'mono' }, N(q.default) + ' ' + (q.unit || '')), h('td', { class: 'mono small' }, String(q.src || 'assumption'))); })))));
    });
    return d;
  }

  /* ---------------------------------------------------------------- 10.7 LOG */
  function buildLogPane() {
    var p = UI.paneEls.log;
    var filt = seg([{ id: 'all', ar: 'الكل', en: 'All' }, { id: 'dispatch', ar: 'إرسال', en: 'Dispatch' }, { id: 'incident', ar: 'حوادث', en: 'Incidents' }, { id: 'traffic', ar: 'مرور', en: 'Traffic' }, { id: 'hazard', ar: 'أخطار', en: 'Hazards' }], function () { return NS.logFilter; }, function (v) { NS.logFilter = v; touchZone('log'); refreshZones(true); }, ['تصفية السجل', 'Filter the log']);
    UI.logFilter = filt;
    p.appendChild(card('سجل الأحداث', 'Event log', [filt, zone('log', 'log', function () { return NS.log.length + ':' + NS.logFilter; }, renderLog), h('div', { class: 'nat-btnrow' }, btn('btn btn-ghost btn-sm', 'copy', 'انسخ السجل', 'Copy the log', function () { copyText(logText()).then(function (ok) { bothToast(ok ? 'تم نسخ السجل' : 'تعذّر النسخ', ok ? 'Log copied' : 'Copy failed', ok ? 'safe' : 'warn'); }); }, { id: 'nat-log-copy' }))], simTag()));
    p.appendChild(simNote());
  }
  function logFiltered() { var f = NS.logFilter; return NS.log.filter(function (e) { return f === 'all' || (EV_GROUP[e.type] || 'incident') === f; }); }
  function logText() { return logFiltered().map(function (e) { return e.clock + '  ' + nm(e.text); }).join('\n'); }
  function renderLog() {
    var list = logFiltered().slice(-120).reverse();
    if (!list.length) return emptyState('clock', 'السجل فارغ. ضع حادثًا لترى الأحداث هنا.', 'The log is empty. Place an incident to see events here.');
    return h('ol', { class: 'nat-log', role: 'log' }, list.map(function (e) { return h('li', { class: 'nat-ev ' + (EV_GROUP[e.type] || '') + (e.type === 'redispatch' ? ' hot' : '') + (e.op ? ' op' : '') }, h('span', { class: 'mono t' }, (e.clock || '').slice(0, 8)), h('span', { class: 'ic' }, icon(EV_ICON[e.type] || 'pin')), h('span', { class: 'tx' }, nm(e.text))); }));
  }

  /* ---------------------------------------------------------------- 10.8 banner, present strip, control sync */
  function renderBanner() {
    var b = NS.banner, el = UI.banner; if (!el) return;
    if (!b) { el.hidden = true; el.replaceChildren(); return; }
    el.className = 'nat-banner ' + (b.type === 'redispatch' ? 'warn' : 'info'); el.hidden = false;
    el.replaceChildren(icon(b.type === 'redispatch' ? 'alert' : 'route'), h('div', { class: 'nat-banner-t' }, h('b', null, b.type === 'redispatch' ? bi('إعادة إرسال تلقائية', 'Automatic re-dispatch') : bi('تحديث التوصية', 'Recommendation updated')), h('span', null, nm(b.text))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { if (b.inc) { select(b.inc); var i = incById(b.inc); if (i) flyToInc(i, 600); } showTab('dispatch', true); } }, bi('اعرض', 'Show')),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': B('أغلق', 'Dismiss'), onclick: function () { NS.banner = null; renderBanner(); touchZone('dispatch'); } }, icon('x')));
  }
  function updatePresent() {
    if (!NS.present || !UI.pstrip) return; var inc = selectedInc() || (NS.snap.incidents.filter(function (i) { return i.status !== 'cleared' && i.status !== 'cancelled'; }).slice(-1)[0] || null), p = planOf(inc), kids = [];
    if (!inc) { kids.push(h('p', { class: 'ps-empty' }, B('انقر على الخريطة لوضع حادث وشاهد أسرع وحدة من كل نوع بحسب الازدحام', 'Click the map to place an incident and watch the fastest unit of each type given traffic'))); }
    else {
      kids.push(h('div', { class: 'ps-h' }, hzIcon(inc.hazard), h('b', null, inc.id + ' · ' + hzName(inc.hazard)), h('span', null, placeName(inc).line), statusTag(inc)));
      if (p) kids.push(h('div', { class: 'ps-units' }, p.units.filter(function (u) { return u.unitId && !u.optional; }).map(function (u) { return h('div', { class: 'ps-u' }, kindIcon(u.kind, true), h('b', { class: 'mono' }, u.state === 'on-scene' ? B('في الموقع', 'On scene') : u.state === 'cleared' ? '—' : minTxt(u.etaSec)), h('small', null, kindName(u.kind))); }).concat(p.hospital ? [h('div', { class: 'ps-u' }, kindIcon('hospital', true), h('b', { class: 'mono' }, minTxt(p.hospital.etaSec)), h('small', null, B('المستشفى', 'Hospital')))] : [])));
    }
    kids.push(h('p', { class: 'ps-sim' }, tag('warn', 'SIM'), ' ', B('محاكاة فوق خريطة OpenStreetMap حقيقية · 999 هي المُرسِل', 'A simulation on a real OpenStreetMap map · 999 is the dispatcher')));
    UI.pstrip.replaceChildren.apply(UI.pstrip, kids);
  }
  function syncPlayUI() {
    if (!UI.play) return;
    var on = NS.playing; if (UI.play.getAttribute('data-on') !== (on ? '1' : '0') || !UI.play.firstChild || UI.play._lang !== lang()) { UI.play.setAttribute('data-on', on ? '1' : '0'); UI.play._lang = lang(); UI.play.setAttribute('aria-pressed', on ? 'true' : 'false'); UI.play.setAttribute('aria-label', B(on ? 'إيقاف مؤقت للمحاكاة' : 'تشغيل المحاكاة', on ? 'Pause the simulation' : 'Play the simulation')); UI.play.replaceChildren(icon(on ? 'pause' : 'play'), bi(on ? 'إيقاف مؤقت' : 'تشغيل', on ? 'Pause' : 'Play')); }
    if (UI.speed && UI.speed._sync) UI.speed._sync(); if (UI.speed2 && UI.speed2._sync) UI.speed2._sync();
  }
  function syncTools() { if (UI.tools && UI.tools._sync) UI.tools._sync(); syncHint(); }
  function syncControls() {
    if (!UI.hzBtns) return;
    HZ_ORDER.forEach(function (hz) { UI.hzBtns[hz].setAttribute('aria-checked', NS.hazard === hz ? 'true' : 'false'); UI.hzBtns[hz].tabIndex = NS.hazard === hz ? 0 : -1; });
    if (UI.sevSeg && UI.sevSeg._sync) UI.sevSeg._sync(); if (UI.tools._sync) UI.tools._sync(); if (UI.speed._sync) UI.speed._sync();
    if (UI.patIn && doc.activeElement !== UI.patIn && UI.patIn.value !== String(NS.patients)) UI.patIn.value = NS.patients;
    if (UI.patNeed) { $$('option', UI.patNeed).forEach(function (o) { var t = B(o.getAttribute('data-ar'), o.getAttribute('data-en')); if (o.textContent !== t) o.textContent = t; }); }
    if (UI.hzOverlay && UI.hzOverlay._sync) UI.hzOverlay._sync(); if (UI.seasonSeg && UI.seasonSeg._sync) UI.seasonSeg._sync(); if (UI.jamSeg && UI.jamSeg._sync) UI.jamSeg._sync();
    if (UI.daySel) { $$('option', UI.daySel).forEach(function (o, i) { var t = B(DOW[i][0], DOW[i][1]); if (o.textContent !== t) o.textContent = t; }); if (UI.daySel.value !== String(NS.draft.dow)) UI.daySel.value = String(NS.draft.dow); }
    if (UI.hourRow && doc.activeElement !== UI.hourRow._inp) { UI.hourRow._inp.value = NS.draft.hour; UI.hourRow._out.textContent = hhmm(NS.draft.hour); }
    if (UI.trafficRow && doc.activeElement !== UI.trafficRow._inp && NS.nat) { var v = NS.nat.P.trafficLoad; UI.trafficRow._inp.value = v; UI.trafficRow._out.textContent = UI.trafficRow._fmt(v); }
    syncLayerUI();
  }


  /* ====================================================================================
   * 13. GUIDED TOUR — a 60-second scripted walk through the national pipeline (captions are aria-live; Esc or Stop ends it)
   * ==================================================================================== */
  var TOUR = [
    { at: 0, ar: 'قطر كلها: الخريطة والطرق والمستشفيات ومراكز الشرطة والإطفاء حقيقية من OpenStreetMap، أما الازدحام والوحدات والمخاطر فمحاكاة.', en: 'All of Qatar: the map, roads, hospitals, police and fire stations are real (OpenStreetMap); traffic, units and hazards are simulated.', run: function () { tourReset(); } },
    { at: 7, ar: 'بلاغ حريق في وسط الدوحة. تحسب منارة أسرع وحدة من كل نوع بزمن الوصول بحسب الازدحام، لا بالمسافة فقط.', en: 'A fire is reported in central Doha. MANARA computes the fastest unit of each type by arrival time given traffic, not just by distance.', run: function () { var inc = placeIncident({ hazard: 'fire', lon: DEMO_AT.lon, lat: DEMO_AT.lat, severity: 2, tab: false }); if (inc) { showTab('dispatch', true); flyToInc(incById(inc.id), 900); } } },
    { at: 17, ar: 'هذه توصية فقط: لا يُرسل شيء ولا يصل شيء إلى الهواتف قبل أن يوافق إنسان.', en: 'This is only a recommendation: nothing is sent and no phone is alerted until a human approves.', run: function () { } },
    { at: 24, ar: 'وافق المشغّل. تتحرك الوحدات ويتناقص زمن الوصول، وتصل التنبيهات إلى هواتف السكان القريبين.', en: 'The operator approves. The units move, the ETAs count down, and nearby residents\' phones are alerted.', run: function () { var i = selectedInc(); if (i) approve(i.id); NS.speed = 10; NS.playing = true; syncPlayUI(); } },
    { at: 34, ar: 'ازدحام جديد على طريق الوحدة الأولى: يُعاد حساب زمن الوصول، وقد تحلّ وحدة أخرى محلها تلقائيًا.', en: 'A new jam on the first unit\'s road: the ETA is recomputed and another unit may take over automatically.', run: function () { tourJam(); } },
    { at: 46, ar: 'أحيانًا تصل وحدة أبعد قبل الأقرب. هذا مثال حقيقي على الطرق الحقيقية.', en: 'Sometimes a farther unit arrives before the nearest. Here is a real example on the real roads.', run: function () { runExample(false); } },
    { at: 58, ar: 'ولآخر مئة متر: اختر حادثًا ثم «قرّب إلى آخر مئة متر» لتوقظ كل شخص وتعدّ الجميع. انتهت الجولة.', en: 'And for the last 100 metres: select an incident and press “Zoom into the last 100 metres” to wake everyone and count them. End of the tour.', run: function () { clearExample(); var i = selectedInc(); if (i) flyToInc(i, 700); showTab('incident', true); } }
  ];
  function tourReset() {
    clearPublished(); rebuild(false); NS.opts.dow = 0; NS.opts.hour = 7.75; NS.draft = { season: NS.opts.season, dow: 0, hour: 7.75 }; clearExample();
    NS.map.flyTo({ bbox: { lonMin: 50.7, latMin: 24.4, lonMax: 51.7, latMax: 26.2 }, pad: 12 }, 600); refreshZones(true);
  }
  function tourJam() {
    var i = selectedInc(), p = planOf(i), u = p && p.units.filter(function (q) { return q.unitId && q.route && q.route.length > 6; })[0]; if (!u) return;
    var n = 0; for (var k = 3; k < Math.min(u.route.length - 1, 14) && n < 5; k += 2) { var e = NN.edgeAt(NS.nat, u.route[k][0], u.route[k][1], 120); if (e && e.edge != null && NS.jams[e.edge] == null) { NN.jamRoad(NS.nat, e.edge, 0.06); NS.jams[e.edge] = 0.06; n++; } }
    if (n) { logOp('operator', 'ازدحام جديد على ' + n + ' مقاطع في طريق الوحدة', 'New jam on ' + n + ' segments of the unit\'s road'); afterRoadOp(); }
  }
  function startTour(k) {                                                                  // k = time compression (tests use 8); a person always gets 1
    if (!NS.nat || NS.tour) return; if (NS.present) setPresent(false); k = k > 0 ? k : 1;
    NS.tour = { t0: now(), step: -1, timers: [] }; UI.tourBar.hidden = false; setT(UI.tourCount, '');
    TOUR.forEach(function (s, i) { NS.tour.timers.push(setTimeout(function () { tourStep(i); }, s.at * 1000 / k + (i ? 0 : 50))); });
    NS.tour.timers.push(setTimeout(function () { stopTour(true); }, (TOUR[TOUR.length - 1].at + 9) * 1000 / k));
    announce(B('بدأت الجولة الموجّهة', 'The guided tour started'));
  }
  function tourStep(i) {
    if (!NS.tour) return; NS.tour.step = i; var s = TOUR[i];
    try { s.run(); } catch (e) { /* the tour never breaks the page */ }
    setT(UI.tourText, B(s.ar, s.en)); setT(UI.tourCount, N(i + 1) + ' / ' + N(TOUR.length)); announce(B(s.ar, s.en));
  }
  function stopTour(done) {
    if (!NS.tour) return; NS.tour.timers.forEach(clearTimeout); NS.tour = null; UI.tourBar.hidden = true;
    if (!done) announce(B('انتهت الجولة', 'The tour has ended'));
  }

  /* ====================================================================================
   * 11. START-UP — the map first (instant), the engine right after (about a quarter of a second), then the demo incident
   * ==================================================================================== */
  function fail(why) {
    NS.failed = true; var boot = $('#nat-boot'), root = $('#nat'); if (!root) return;
    var miss = (win.__natDataError || []).slice(); String(why || '').split(', ').forEach(function (w) { if (w && miss.indexOf(w) < 0) miss.push(w); });
    var h = K && K.h ? K.h : function (tag, a) { var el = doc.createElement(tag); if (a) for (var k in a) { if (k === 'class') el.className = a[k]; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), a[k]); else if (a[k] != null) el.setAttribute(k, a[k]); } for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; el.appendChild(c.nodeType ? c : doc.createTextNode(String(c))); } return el; };
    var card = h('div', { class: 'nat-boot-card err', role: 'alert' },
      h('i', { class: 'nat-erri', 'aria-hidden': 'true' }, '!'), h('h2', null, doc.documentElement.dataset.lang === 'en' ? 'The national map could not start' : 'تعذّر تشغيل الخريطة الوطنية'),
      h('p', null, doc.documentElement.dataset.lang === 'en' ? 'Some of the map data files did not load, so Qatar cannot be drawn. The neighbourhood simulation still works.' : 'لم تُحمَّل بعض ملفات بيانات الخريطة فلا يمكن رسم قطر. محاكاة الحي ما زالت تعمل.'),
      miss.length ? h('p', { class: 'mono small' }, miss.join(' · ')) : null,
      h('div', { class: 'btns' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: function () { location.reload(); } }, doc.documentElement.dataset.lang === 'en' ? 'Try again' : 'حاول مجددًا'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { if (MC && MC.setScope) MC.setScope('local'); } }, doc.documentElement.dataset.lang === 'en' ? 'Open the neighbourhood view' : 'افتح عرض الحي')));
    if (boot) { boot.className = 'nat-boot err'; boot.removeAttribute('role'); boot.replaceChildren(card); } else root.appendChild(h('div', { class: 'nat-boot err' }, card));
    root.setAttribute('data-nat-state', 'error');
  }
  function init() {
    if (NS.inited) return; var root = $('#nat'); if (!root) return;
    NS.inited = true;
    var lacking = []; if (!MC || !K) lacking.push('mission.js'); if (!NN) lacking.push('national.js'); if (!NM) lacking.push('mission-national-map.js'); if (!GEO) lacking.push('qatar-geo.js'); if (!FAC) lacking.push('qatar-facilities.js'); if (!ROADS) lacking.push('qatar-roads.js');
    if (lacking.length || (win.__natDataError && win.__natDataError.length)) { try { if (K) bindKit(); } catch (e) { /* ignore */ } fail(lacking.join(', ')); return; }
    try {
      bindKit(); NS.noDemo = /nodemo/.test(location.hash) || /[?&]demo=0/.test(location.search);
      build(root); buildIncidentPane(); buildDispatchPane(); buildTrafficPane(); buildHazardPane(); buildKpiPane(); buildAbPane(); buildLogPane();
      attachMapEvents(); showTab('incident', true); wakeHint();
      NS.map = NM.create({ canvas: UI.cvs, geo: GEO, fac: FAC, roads: ROADS.decode(), lang: lang, reduced: reduced });
      NS.map.scene.layers = NS.layers; NS.map.scene.animate = true; NS.map.labelFor = function (id) { try { return NS.nat ? NN.facilityLabel(NS.nat, id) : null; } catch (e) { return null; } };
      NS.map.onView = function () { if (!UI.tip.hidden) UI.tip.hidden = true; };
      UI.legend.open = false;
      resizeMap(); NS.map.fit(); syncTools(); syncPlayUI(); syncControls();
      if (win.ResizeObserver) { var ro = new ResizeObserver(function () { resizeMap(); if (NS.tab === 'traffic') drawProfile(); if (NS.tab === 'ab') { drawAB(); drawAB2(); } if (NS.tab === 'kpi') drawTrend(); }); ro.observe(UI.stage); } else win.addEventListener('resize', resizeMap);
      root.setAttribute('data-nat-state', 'map');
      var bootEl = $('#nat-boot'); if (bootEl) bootEl.hidden = true;
      requestAnimationFrame(loop);
      setTimeout(function () { if (!NS.ready && !NS.failed && UI.load && !UI.load.hidden) UI.load.appendChild(h('span', { class: 'muted small' }, ' ', bi('— قد يستغرق بضع ثوانٍ على جهاز بطيء.', '— this can take a few seconds on a slow device.'))); }, 5000);
      startEngine();                                   // one task: map + engine + demo incident are ready together (about half a second), so the first thing a person sees is complete
    } catch (err) { try { console.error(err); } catch (e2) { /* ignore */ } fail(String(err && err.message || err)); }
  }
  function startEngine() {
    try {
      NS.nat = makeEngine(); NS.world = NN.world(NS.nat); takeSnapshot(true); NS.ready = true; NS.last = 0;
      syncScene(true); drainEvents(); UI.load.hidden = true;
      var root = UI.root; root.setAttribute('data-nat-state', 'ready'); root.setAttribute('data-nat-ready', '1'); var m = $('#main'); if (m) m.setAttribute('data-nat-ready', '1');
      NS.autoDemo = /(^|[#&?])demo(=1)?($|[&])/.test(location.hash.replace(/^#/, '') + '&' + location.search.replace(/^\?/, ''));
      if (NS.autoDemo && !NS.noDemo && !NS.demoPlaced) { NS.demoPlaced = true; placeDemo({ fly: false }); } else showTab('dispatch', true);          // the first frame is the whole of Qatar; the demo is one press away
      updateWelcome();
      refreshZones(true); uiTick(); updateSummary(); publishAll(false);
    } catch (err) { try { console.error(err); } catch (e2) { /* ignore */ } fail(String(err && err.message || err)); }
  }
  // keep running when language / theme change
  win.addEventListener('langchange', function () { if (!NS.inited || NS.failed) return; try { K.relabel(); } catch (e) { /* ignore */ } fillJump(); NS.zones.forEach(function (z) { z.sig = null; }); renderBanner(); syncPlayUI(); if (NS.map) NS.map.dirty = true; if (NS.nat) { refreshZones(true); uiTick(); drawProfile(); drawAB(); drawAB2(); drawTrend(); } });
  win.addEventListener('themechange', function () { if (!NS.inited || NS.failed || !NS.map) return; NS.map.setColors(); NS.map.dirty = true; drawProfile(); drawAB(); drawAB2(); drawTrend(); });
  /* ---- COUNT, national level: a resident's phone ("I'm safe" / "I need help", bus 'citizen') answers the national alert we published (phone alert id 'nat-<incident id>') ---- */
  function onCitizen(m) {
    if (!m || m.type !== 'citizen' || typeof m.id !== 'string' || !NS.snap) return;
    var mm = /^(?:nat|A)-(.+)$/.exec(m.id); if (!mm) return;                 // the phone answers with its own alert id 'nat-<incident id>' (or the bus id 'A-<incident id>')
    var inc = incById(mm[1]); if (!inc) return;                      // not one of ours (the local view handles its own alert ids)
    if (m.status !== 'ack' && m.status !== 'safe' && m.status !== 'help') return;
    var c = NS.checkins[inc.id] || (NS.checkins[inc.id] = { ack: 0, safe: 0, help: 0 });
    c[m.status]++;
    var room = m.room ? ' (' + String(m.room).slice(0, 12) + ')' : '';
    if (m.status === 'ack') logOp('operator', 'هاتف' + room + ': «أنا مستيقظ».', 'Phone' + room + ': “I’m awake”.', { inc: inc.id });
    else if (m.status === 'safe') logOp('operator', 'هاتف' + room + ': «أنا بأمان» — الحادث ' + inc.id + '.', 'Phone' + room + ': “I’m safe” — incident ' + inc.id + '.', { inc: inc.id });
    else { logOp('operator', 'هاتف' + room + ': «أحتاج مساعدة» — الحادث ' + inc.id + '. حوّلها إلى 999.', 'Phone' + room + ': “I need help” — incident ' + inc.id + '. Hand it to 999.', { inc: inc.id }); bothToast('مقيم يطلب المساعدة (الحادث ' + inc.id + ')', 'A resident needs help (incident ' + inc.id + ')', 'danger'); }
    try { announce(m.status === 'safe' ? B('مقيم بأمان', 'A resident is safe') : m.status === 'help' ? B('مقيم يحتاج مساعدة', 'A resident needs help') : B('مقيم مستيقظ', 'A resident is awake')); } catch (e) { /* ignore */ }
    touchZone('dispatch'); refreshZones(true);
  }
  if (win.Manara && Manara.link && Manara.link.on) Manara.link.on(function (m) { try { onCitizen(m); } catch (e) { /* ignore */ } });
  win.addEventListener('mcscope', onScope);
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && NS.present && MC && MC.scope && MC.scope() === 'national') { setPresent(false); e.preventDefault(); }
  });
  if (RMQ.addEventListener) RMQ.addEventListener('change', function () { if (NS.map) NS.map.dirty = true; });

  /* ====================================================================================
   * 12. PUBLIC API
   * ==================================================================================== */
  win.MissionNational = {
    version: 1,
    ready: function () { return !!NS.ready; }, failed: function () { return !!NS.failed; },
    nat: function () { return NS.nat; }, map: function () { return NS.map; }, snap: function () { return NS.snap; }, state: NS, ui: UI,
    placeIncident: placeIncident, approve: approve, hold: hold, cancel: cancelInc, select: select, selected: function () { return NS.selInc; },
    jamAt: jamAt, closeAt: closeAt, jamEdge: jamEdge, closeEdge: closeEdge, edgeNear: edgeNear, clearJams: clearJams, setUnitBusy: setUnitBusy,
    step: function (sec) { var n = Math.max(1, Math.round(sec / NS.tickSec)), i; for (i = 0; i < n; i++) { NN.step(NS.nat, NS.tickSec); } takeSnapshot(true); drainEvents(); publishAll(false); syncScene(); refreshZones(true); return NS.snap; },
    setPlaying: setPlaying, setSpeed: setSpeed, setClock: applyClock, setTool: setTool, setLayer: setLayer, setParam: setParam, setRain: setRain, startDust: startDust, stopDust: stopDust, addStorm: addStorm,
    tab: showTab, present: setPresent, startTour: startTour, stopTour: stopTour, flyTo: flyTo, flyToInc: flyToInc, flyToMuni: flyToMuni, zoomIn: zoomIn, back: back, cap: capXml, example: runExample, clearExample: clearExample, runAB: runAB, runSweep: runSweep,
    rebuild: rebuild, restart: function () { clearPublished(); rebuild(false); refreshZones(true); }, benchmark: benchmark, fps: fps, publishAll: publishAll, resize: resizeMap,
    lastInput: function () { return NS.lastInput || 0; }, text: function () { return UI.root ? UI.root.textContent : ''; }, firstPaintMs: function () { return NS.firstPaintMs; }, engineMs: function () { return NS.engineMs; }
  };
  function boot() { if (MC && MC.scope && MC.scope() === 'national') init(); else if (!MC) init(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
