// MANARA («منارة») landing page, part 2 (index.html): everything that needs the map of Qatar — classic script, no libraries, works from file:// and offline.
// It loads AFTER js/home.js and the data (data/qatar-*.js: an OpenStreetMap snapshot, © OpenStreetMap contributors, ODbL 1.0), js/national.js (the seeded
// national engine) and js/mission-national-map.js (the map renderer shared with Mission Control). Real: the geography. Simulated (SIM): the docked drones,
// traffic, unit availability, incidents. 999 stays the dispatcher. There is no innerHTML sink in this file.
//
//   1. facts      every [data-nat] number and the municipalities table are READ from the bundled data (the HTML carries the same values as a fallback;
//                 tools/test-home.mjs checks the two agree with an independent read of the data files)
//   2. console    "what the control room sees": a miniature of control.html — alert queue, the real map of Doha, the drone feed, fleet, comms log, the
//                 dispatch and the human Approve — driven by the national engine (a sentinel alarm in Doha: drone first, then the fastest ground units)
//   3. Qatar-wide a live time-lapse on the map of all of Qatar, one scenario per hazard: alert → a drone launches to verify → proof → the human
//                 Approve → the fastest unit of each type drives in over the real roads
(function () {
  'use strict';
  var M = window.Manara;
  if (!M) { return; }
  var $ = M.$, $$ = M.$$, L = M.L;
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var N = window.ManaraNational, GEO = window.MANARA_QATAR_GEO, FAC = window.MANARA_QATAR_FACILITIES, RDS = window.MANARA_QATAR_ROADS, NM = window.NatMap, DS = window.ManaraDroneScene;
  var HC = window.ManaraHome && window.ManaraHome.core;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduced = function () { return !!mq.matches; };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function onLang(fn) { window.addEventListener('langchange', fn); }
  function onTheme(fn) { window.addEventListener('themechange', fn); }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function clockOf(sec) { sec = ((Math.round(sec) % 86400) + 86400) % 86400; var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function bi(ar, en) { return L(T(ar, en)); }
  var dataOK = !!(N && GEO && FAC && RDS);
  var mapOK = !!(dataOK && NM && HC && window.Path2D);

  /* ======================================================================= 1. facts read from the data */
  var world = null;
  function getWorld() { if (!world && dataOK) world = { G: RDS.decode() }; return world; }
  function counts() {
    var w = getWorld(); if (!w) return null; var G = w.G;
    var c = { munis: GEO.municipalities.length, places: GEO.places.length, fac: FAC.length, hosp: 0, clinic: 0, fire: 0, police: 0, amb: 0, ed: 0, roadkm: 0, nodes: G.n, edges: G.e, virt: 0,
      snapshot: GEO.meta.snapshotDate, osmts: GEO.meta.osmBaseTimestamp, byMuni: {} }, e, len = 0;
    FAC.forEach(function (f) {
      if (f.kind === 'hospital') c.hosp++; else if (f.kind === 'clinic-ed') c.clinic++; else if (f.kind === 'fire') c.fire++; else if (f.kind === 'police') c.police++; else if (f.kind === 'ambulance') c.amb++;
      if (f.ed === 'yes') c.ed++;
      var m = c.byMuni[f.muni] || (c.byMuni[f.muni] = { hosp: 0, police: 0, fire: 0, amb: 0 });
      if (f.kind === 'hospital' || f.kind === 'clinic-ed') m.hosp++; else if (f.kind === 'police') m.police++; else if (f.kind === 'fire') m.fire++; else m.amb++;
    });
    for (e = 0; e < G.e; e++) { len += G.eLen[e]; if (G.eFlags[e] & 256) c.virt++; }
    c.roadkm = Math.round(len / 1000);
    return c;
  }
  function initFacts() {
    var c = counts(); if (!c) return;
    var map = { munis: c.munis, places: c.places, fac: c.fac, hosp: c.hosp, fire: c.fire, police: c.police, amb: c.amb, ed: c.ed, roadkm: c.roadkm, roadnodes: c.nodes, virt: c.virt, snapshot: c.snapshot, osmts: c.osmts };
    $$('[data-nat]').forEach(function (n) { var k = n.getAttribute('data-nat'); if (!(k in map)) return; var v = map[k]; n.textContent = typeof v === 'number' ? M.num(v) : String(v); });
    var tb = $('#qd-table tbody');
    if (tb) {
      function rows() {
        clear(tb);
        GEO.municipalities.forEach(function (m) {
          var bm = c.byMuni[m.id] || { hosp: 0, police: 0, fire: 0 }, tr = el('tr');
          tr.appendChild(el('td', null, L(m.name))); tr.appendChild(el('td', 'num', M.num(m.areaKm2))); tr.appendChild(el('td', 'num', M.num(bm.hosp))); tr.appendChild(el('td', 'num', M.num(bm.police))); tr.appendChild(el('td', 'num', M.num(bm.fire)));
          tb.appendChild(tr);
        });
      }
      rows(); onLang(rows);
    }
  }

  /* ======================================================================= shared: scenarios, runs, overlay */
  var QUIET = { unitBusyPct: 0, dronePatrolPct: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 0 };
  var SCEN = {
    fire:  { lon: 51.5264, lat: 25.2856, trigger: 'sentinel', date: '2026-07-12', hour: 7.5, place: T('الدوحة', 'Doha') },
    gas:   { lon: 51.555, lat: 24.969, trigger: 'sentinel', date: '2026-07-12', hour: 7.5, place: T('منطقة مسيعيد الصناعية', 'Mesaieed Industrial Zone') },
    flood: { lon: 51.43289, lat: 25.22424, trigger: 'sentinel', date: '2026-07-12', hour: 7.5, place: T('نفق طريق الصناعية الشرقية', 'East Industrial Road underpass') },
    dust:  { lon: 51.503, lat: 25.684, trigger: 'operator', date: '2026-07-12', hour: 7.5, place: T('الخور', 'Al Khor') },
    heat:  { lon: 51.442, lat: 25.174, trigger: 'citizen', date: '2026-07-12', hour: 13, place: T('المنطقة الصناعية', 'The Industrial Area') },
    sos:   { lon: 51.601, lat: 25.157, trigger: 'citizen', date: '2026-07-12', hour: 7.5, place: T('الوكرة', 'Al Wakrah') }
  };
  var UNIT_ICON = { fire: 'fire', police: 'shield', ambulance: 'heart', rescue: 'alert' };
  var UNIT_TOK = { fire: 'brand', police: 'info', ambulance: 'danger', rescue: 'safe' };
  var KIND_NAME = { fire: T('إطفاء وإنقاذ', 'fire & rescue'), police: T('شرطة', 'police'), ambulance: T('إسعاف', 'ambulance'), rescue: T('إنقاذ', 'rescue') };
  function makeRun(kind) {
    var S = SCEN[kind], nat = N.create({ seed: 7, date: S.date, hour: S.hour, autoApprove: false, params: QUIET });
    var inc = N.createIncident(nat, { hazard: kind, lon: S.lon, lat: S.lat, severity: 2, trigger: S.trigger });
    return { nat: nat, inc: inc, S: S, kind: kind, t0: nat.t };
  }
  function planOf(run) { return run.inc.plan; }
  function bboxOf(run) {
    var pl = run.inc.plan, pts = [[run.S.lon, run.S.lat]];
    pl.units.forEach(function (u) { if (u.pos) pts.push([u.pos.lon, u.pos.lat]); if (u.route && u.route.length) pts.push(u.route[0]); });
    N.drones(run.nat).forEach(function (d) { if (d.incident === run.inc.id) { pts.push([d.dock.lon, d.dock.lat]); } });
    var b = { lonMin: 99, lonMax: -99, latMin: 99, latMax: -99 };
    pts.forEach(function (p) { b.lonMin = Math.min(b.lonMin, p[0]); b.lonMax = Math.max(b.lonMax, p[0]); b.latMin = Math.min(b.latMin, p[1]); b.latMax = Math.max(b.latMax, p[1]); });
    var dx = Math.max(0.02, (b.lonMax - b.lonMin) * 0.08), dy = Math.max(0.015, (b.latMax - b.latMin) * 0.08);
    return { lonMin: b.lonMin - dx, lonMax: b.lonMax + dx, latMin: b.latMin - dy, latMax: b.latMax + dy };
  }
  function slimUnits(units) { return units.map(function (u) { return { id: u.id, kind: u.kind, name: u.name, lon: u.lon, lat: u.lat, state: u.state, assigned: u.assigned, busy: u.busy }; }); }
  function droneOf(run) { var ds = N.drones(run.nat).filter(function (d) { return d.incident === run.inc.id; }); return ds[0] || null; }
  function plain(o) { return JSON.parse(JSON.stringify(o)); }

  // drawing on the overlay canvas, in screen space, through the map's own projection
  function drawOverlay(ctx, map, W, H, f, d) {
    ctx.setTransform(d || 1, 0, 0, d || 1, 0, 0); ctx.clearRect(0, 0, W, H); if (!f) return;
    var tk = HC.tk, P = function (lon, lat) { return map.toScreen(lon, lat); }, i, j, p;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (f.routes || []).forEach(function (r) {
      if (!r.route || r.route.length < 2) return; var c = tk(UNIT_TOK[r.kind] || 'brand');
      ctx.strokeStyle = tk('bg'); ctx.lineWidth = 6; ctx.globalAlpha = 0.55; ctx.setLineDash([]); ctx.beginPath();
      for (j = 0; j < r.route.length; j++) { p = P(r.route[j][0], r.route[j][1]); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = 3.4; ctx.globalAlpha = 0.95; ctx.setLineDash(r.dashed ? [7, 6] : []); ctx.beginPath();
      for (j = 0; j < r.route.length; j++) { p = P(r.route[j][0], r.route[j][1]); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    (f.drones || []).forEach(function (d) {
      var a = P(d.dock.lon, d.dock.lat), b = P(d.lon, d.lat), tg = d.target ? P(d.target.lon, d.target.lat) : null;
      ctx.strokeStyle = tk('accent'); ctx.fillStyle = tk('bg'); ctx.lineWidth = 2;
      ctx.strokeRect(a[0] - 5, a[1] - 5, 10, 10);
      if (tg) { ctx.globalAlpha = 0.85; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(tg[0], tg[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      // the drone: a small quad with four rotors (north-up, no heading needed)
      ctx.save(); ctx.translate(b[0], b[1]); ctx.fillStyle = tk('accent'); ctx.strokeStyle = tk('bg'); ctx.lineWidth = 2;
      [[-8, -8], [8, -8], [-8, 8], [8, 8]].forEach(function (o) { ctx.beginPath(); ctx.arc(o[0], o[1], 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
      ctx.beginPath(); ctx.rect(-5, -5, 10, 10); ctx.fill(); ctx.stroke(); ctx.restore();
      var lab = d.callsign || 'DR';
      ctx.font = '600 11px ' + (HC.tk('mono') || 'monospace'); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      var w = ctx.measureText(lab).width + 10; ctx.fillStyle = tk('bg'); ctx.globalAlpha = 0.8; ctx.fillRect(b[0] - w / 2, b[1] + 14, w, 15); ctx.globalAlpha = 1; ctx.fillStyle = tk('accent'); ctx.fillText(lab, b[0], b[1] + 21.5);
    });
    if (f.incident) {
      var q = P(f.incident.lon, f.incident.lat), pulse = f.pulse || 0;
      ctx.strokeStyle = tk(f.incidentTok || 'danger'); ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9 - 0.5 * pulse; ctx.beginPath(); ctx.arc(q[0], q[1], 14 + 14 * pulse, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function mapFor(canvas, extra) {
    var G = getWorld().G;
    var map = NM.create({ canvas: canvas, geo: GEO, fac: FAC, roads: G, lang: function () { return M.lang(); }, reduced: reduced });
    map.scene.layers.traffic = false; map.scene.animate = false; map.scene.animating = false;
    if (extra) for (var k in extra) map.scene[k] = extra[k];
    return map;
  }
  function fitCanvas(map, stage, ovl) {
    var r = stage.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(160, Math.round(r.width)), h = Math.max(120, Math.round(r.height));
    map.resize(w, h, d);
    if (ovl.width !== Math.round(w * d) || ovl.height !== Math.round(h * d)) { ovl.width = Math.round(w * d); ovl.height = Math.round(h * d); }
    return { w: w, h: h, d: d };
  }
  function lazy(node, fn, margin) {
    var done = false; function go() { if (done) return; done = true; fn(); }
    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: margin || '700px' }); io.observe(node); } else go();
  }

  /* ======================================================================= 2. the control-room miniature */
  var con = (function () {
    var C = { ready: false }, root = $('#con');
    if (!root || !mapOK || !DS) return C;
    var STAGE_S = 2.7, NST = 5, DUR = NST * STAGE_S + 1.2, HOLD = 3.2;
    var cvs = $('#con-canvas'), ovl = $('#con-ovl'), box = $('#con-map'), fr = $('#con-f-rgb'), ft = $('#con-f-th');
    var map = null, octx = ovl.getContext('2d'), data = null, player = null, size = null, stage = reduced() ? 2 : 0, scn = null, feedRes = null, lastDraw = -1;
    var CAPS = [
      T('إنذار من حارس منارة في الدوحة: «اشتباه» بمفتاح واحد. تُقلع أقرب مسيّرة وحدها لتتحقق؛ فالمسيّرة لا تُصدر إنذارًا عامًّا.', 'A MANARA sentinel alarm in Doha: a SUSPECT with one key. The nearest drone launches on its own to verify; a drone never issues a public alert.'),
      T('المسيّرة على الموقع: جدار البثّ يعرض الصورة العادية والحرارية، والكاشف يعمل عليهما.', 'The drone is on station: the feed wall shows the RGB and thermal pictures and the detector runs on both.'),
      T('مفتاحان مستقلان (حسّاس وكاميرا) فصار «مؤكَّدًا». لا شيء يخرج بعد: الإنسان هو المفتاح الثالث.', 'Two independent keys (a sensor and a camera): it is now CONFIRMED. Nothing leaves yet: the human is the third key.'),
      T('موافقة المشغّل: الحزمة الموثّقة تذهب، وتوصي منارة بالوحدة الأسرع لكل نوع. 999 يبقى المرسِل.', 'The operator approves: the verified package goes out and MANARA recommends the fastest unit of each type. 999 stays the dispatcher.'),
      T('الوحدات في الطريق على الطرق الحقيقية، والمسيّرة تعود إلى رصيفها؛ وبطاقة التسليم جاهزة لقائد الإنقاذ.', 'The units are on their way over the real roads, the drone returns to its dock, and the hand-off card is ready for the rescue lead.')
    ];
    var STATE_TXT = { suspect: T('اشتباه', 'SUSPECT'), confirmed: T('مؤكَّد · مفتاحان', 'CONFIRMED · 2 keys'), approved: T('موافَق عليه', 'APPROVED'), dispatched: T('أُرسلت الوحدات', 'DISPATCHED') };
    var DR_TXT = { launching: T('تُقلع', 'launching'), 'en-route': T('في الطريق', 'en route'), 'on-station': T('على الموقع', 'on station'), verifying: T('تتحقق', 'verifying'), returning: T('تعود', 'returning'), docked: T('راسية', 'docked') };

    function precompute() {
      var run = makeRun('fire'), nat = run.nat, inc = run.inc, d0 = droneOf(run), out = { stages: [], plan0: plain(inc.plan.units.map(function (u) { return { kind: u.kind, name: u.name, etaSec: u.etaSec, unitId: u.unitId }; })), dock: d0 ? d0.dock : null, etaLaunch: d0 && d0.mission ? d0.mission.etaAtLaunchSec : null, t0: nat.t };
      function grab() {
        var s = N.snapshot(nat), d = droneOf(run), al = N.alertQueue(nat, { all: true })[0], i = s.incidents[0], routes = [];
        if (i && i.plan) i.plan.units.forEach(function (u) { if (u.route && u.route.length > 1) routes.push({ kind: u.kind, route: u.route, state: u.state }); });
        var comms = N.commsLog(nat, { incident: inc.id, limit: 4 }) || [];
        out.stages.push({ t: nat.t - out.t0, units: slimUnits(s.units), incident: i ? plain(i) : null, routes: routes,
          drone: d ? { callsign: d.callsign, lon: d.lon, lat: d.lat, dock: d.dock, target: d.mission ? d.mission.target : null, state: d.state, batteryPct: d.batteryPct } : null,
          alert: al ? { id: al.id, state: al.state, ageSec: al.ageSec, droneName: d ? d.callsign : '' } : null, comms: plain(comms.map(function (c) { return { clock: c.clock, text: c.text }; })), clock: s.clock });
      }
      grab();                                              // 0 alert raised, the drone launching
      N.step(nat, 70); grab();                             // 1 on station
      N.step(nat, 35); grab();                             // 2 two keys: confirmed
      N.approve(nat, inc.id); N.step(nat, 10); grab();     // 3 approved
      N.step(nat, 75); grab();                             // 4 units en route
      return out;
    }
    function applyStageText(s) {
      var st = data.stages[s], ls = M.lang();
      var key = s <= 1 ? 'suspect' : s === 2 ? 'confirmed' : s === 3 ? 'approved' : 'dispatched';
      var li = $('#al-main'); li.setAttribute('data-st', s <= 1 ? 'suspect' : s === 2 ? 'confirmed' : 'approved');
      var stEl = $('#al-main-st'); clear(stEl);
      var sp = el('span', null, L(STATE_TXT[key]) + (s === 1 || s === 0 ? ' · ' + bi('مفتاح واحد', '1 key') : '')); stEl.appendChild(sp);
      $('#al-main-age').textContent = mmss(st.alert ? st.alert.ageSec : 0);
      $('#con-clock').textContent = (st.clock || '07:30:00').slice(0, 5);
      $('#con-cap').textContent = L(CAPS[s]);
      root.setAttribute('data-stage', String(s));
      // fleet
      var d = st.drone, s1 = $('#fl-s1'); if (d) { clear(s1); s1.appendChild(document.createTextNode(L(DR_TXT[d.state] || DR_TXT.docked))); var b = s1.parentNode.querySelector('.fl-b'); if (b) b.textContent = Math.round(d.batteryPct) + '%'; var nm = s1.parentNode.querySelector('b'); if (nm) nm.textContent = d.callsign; }
      var s2 = $('#fl-s2'); if (s2) { clear(s2); s2.appendChild(document.createTextNode(s >= 4 ? bi('روبوت: بانتظار قائد الإنقاذ في الموقع', 'robot: waiting for the rescue lead on scene') : bi('روبوت: ينتظر قائد الإنقاذ', 'robot: awaiting the commander'))); }
      // comms
      var ol = $('#con-comms'); clear(ol);
      (st.comms || []).slice(-4).forEach(function (c) { var li2 = el('li'); li2.appendChild(el('time', 'num', (c.clock || '').slice(0, 8))); li2.appendChild(el('span', null, L(c.text))); ol.appendChild(li2); });
      // dispatch rows (names + ETAs from the plan at the moment the incident was created)
      $$('#con-units li').forEach(function (li3) {
        var k = li3.getAttribute('data-k'), u = data.plan0.filter(function (x) { return x.kind === k; })[0]; if (!u) return;
        var nmEl = li3.querySelector('[data-nm]'), eEl = li3.querySelector('[data-eta]');
        if (nmEl) { clear(nmEl); nmEl.appendChild(document.createTextNode(L(u.name))); }
        if (eEl) eEl.textContent = mmss(u.etaSec);
      });
      void ls;
    }
    function feeds(s) {
      var on = s >= 1;
      [fr, ft].forEach(function (c) { var x = c.getContext('2d'); if (!on) { x.fillStyle = HC.tk('bg'); x.fillRect(0, 0, c.width, c.height); } });
      if (!on) return;
      if (!scn) {
        var o = DS.preset('fire', 3, { timeOfDay: 7.6, context: 'urban', width: 288, height: 180, pitchDeg: 58 }); scn = DS.create(o);
        var v = DS.verify(scn, { seconds: 2, fps: 12 }); feedRes = v.result;
      }
      var rgb = scn.renderRGB(2.0), th = scn.renderThermal(2.0), cx = fr.getContext('2d');
      fr.width = 288; fr.height = 180; ft.width = 288; ft.height = 180;
      var off = document.createElement('canvas'); off.width = rgb.width; off.height = rgb.height; off.getContext('2d').putImageData(new ImageData(rgb.data, rgb.width, rgb.height), 0, 0); cx.drawImage(off, 0, 0, 288, 180);
      var off2 = document.createElement('canvas'); off2.width = th.width; off2.height = th.height; off2.getContext('2d').putImageData(new ImageData(th.data, th.width, th.height), 0, 0); ft.getContext('2d').drawImage(off2, 0, 0, 288, 180);
      if (s >= 2 && feedRes) {
        HC.drawDet(DS, cx, feedRes, 288, 180, { keep: true, filter: function (b) { return b.source === 'rgb' && b.kind !== 'person'; }, noCross: true });
        HC.drawDet(DS, ft.getContext('2d'), feedRes, 288, 180, { keep: true, filter: function (b) { return b.source === 'thermal' && b.kind !== 'person'; } });
      }
    }
    // map + overlay for a (possibly fractional) stage: units and the drone glide between the two surrounding snapshots
    function scene(sf) {
      if (!map || !data) return;
      var a = clamp(Math.floor(sf), 0, NST - 1), b = Math.min(NST - 1, a + 1), u = ease(sf - a), A = data.stages[a], B = data.stages[b], sc = map.scene;
      var us = A.units.map(function (x, i) { var y = B.units[i] || x; return { id: x.id, kind: x.kind, name: x.name, lon: lerp(x.lon, y.lon, u), lat: lerp(x.lat, y.lat, u), state: u > 0.5 ? y.state : x.state, assigned: u > 0.5 ? y.assigned : x.assigned, busy: x.busy }; });
      sc.units = us; sc.incidents = A.incident ? [A.incident] : []; sc.selInc = A.incident ? A.incident.id : null; map.dirty = true;
      var d = A.drone && B.drone ? { callsign: A.drone.callsign, dock: A.drone.dock, target: A.drone.target, lon: lerp(A.drone.lon, B.drone.lon, u), lat: lerp(A.drone.lat, B.drone.lat, u) } : null;
      var rs = (u > 0.5 ? B : A).routes.map(function (r) { return { kind: r.kind, route: r.route, dashed: sf < 3 }; });
      var approved = sf >= 2.9; if (!approved) rs = [];
      var pulse = reduced() ? 0 : (now() % 1400) / 1400;
      drawOverlay(octx, map, size.w, size.h, { drones: d ? [d] : [], routes: rs, incident: A.incident, pulse: pulse, incidentTok: 'danger' }, size.d);
      map.frame(now());
    }
    function setStage(s, force) { if (!data) return; if (s === stage && !force) return; stage = s; applyStageText(s); feeds(s); }
    function onTick(t) {
      var sf = clamp(t / STAGE_S, 0, NST - 1), s = Math.min(NST - 1, Math.floor(t / STAGE_S));
      setStage(s); scene(sf);
    }
    function ready() {
      if (data) return; data = precompute();
      map = mapFor(cvs); size = fitCanvas(map, box, ovl); map.setColors();
      map.flyTo({ bbox: { lonMin: 51.4, lonMax: 51.6, latMin: 25.215, latMax: 25.345 }, pad: 6 }, 0);
      $('#con-loading').hidden = true;
      player = HC.Player({ node: root, dur: DUR, hold: HOLD, loop: true, onTick: onTick, onRestart: function () { stage = -1; }, onState: syncPlay });
      C.player = player;
      if (reduced()) { player.pause(); stage = -1; setStage(2, true); scene(2); } else { stage = -1; setStage(0, true); scene(0); }
      syncPlay();
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (!map) return; size = fitCanvas(map, box, ovl); map.flyTo({ bbox: { lonMin: 51.4, lonMax: 51.6, latMin: 25.215, latMax: 25.345 }, pad: 6 }, 0); scene(player && player.playing ? clamp(player.t / STAGE_S, 0, NST - 1) : stage); }).observe(box);
      C.ready = true; root.setAttribute('data-ready', '1');
    }
    function syncPlay() { HC.setPlayBtn ? HC.setPlayBtn($('#con-play'), player.playing) : 0; }
    C.init = function () {
      HC.readTokens(root);
      var pl = $('#con-play');
      $('#con-approve').addEventListener('click', function () {
        if (!data) return;
        if (stage < 3) { player.t = 3 * STAGE_S; player.ended = false; if (reduced()) { setStage(4, true); scene(4); player.t = 4 * STAGE_S; } else { player.play(); } }
        else if (reduced()) { setStage(4, true); scene(4); }
      });
      $('#con-restart').addEventListener('click', function () { if (!data) return; stage = -1; player.restart(); });
      if (pl) pl.addEventListener('click', function () { if (!data) return; player.toggle(); });
      root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && player && player.playing && !reduced()) { player.pause(); root.setAttribute('data-hoverpaused', '1'); } });
      root.addEventListener('pointerleave', function () { if (root.getAttribute('data-hoverpaused') === '1') { root.removeAttribute('data-hoverpaused'); player.play(); } });
      onLang(function () { if (data) { applyStageText(clamp(stage, 0, 4)); } });
      onTheme(function () { HC.readTokens(root); if (map) { map.setColors(); map.dirty = true; scene(player && player.playing ? clamp(player.t / STAGE_S, 0, NST - 1) : stage); } });
      lazy(root, function () { setTimeout(ready, 40); });
    };
    C.stages = function () { return data ? data.stages.length : 0; }; C.precompute = precompute;
    return C;
  })();

  /* ======================================================================= 3. ALL OF QATAR: a live time-lapse, one scenario per hazard */
  var qd = (function () {
    var Q = { ready: false }, root = $('#qd');
    if (!root || !mapOK) return Q;
    var SPEED = 20, HOLD_APPROVE = 2.4, END_HOLD = 3.4, TICK = 5;
    var cvs = $('#qd-map'), ovl = $('#qd-ovl'), stageBox = $('#qd-stage'), octx = ovl.getContext('2d');
    var map = null, size = null, run = null, hz = 'fire', st = null, raf = 0, last = 0, visible = false, playing = !reduced();
    var STEPS = [
      { id: 'alert', icon: 'bell', t: T('بلاغ', 'Alert') }, { id: 'launch', icon: 'drone', t: T('تُقلع', 'Launch') }, { id: 'verify', icon: 'eye', t: T('تحقق', 'Verify') },
      { id: 'approve', icon: 'check', t: T('موافقة', 'Approve') }, { id: 'dispatch', icon: 'route', t: T('الأسرع يصل', 'Fastest rolls') }
    ];
    function buildSteps() {
      var ol = $('#qd-steps'); clear(ol);
      STEPS.forEach(function (s) { var li = el('li'); li.setAttribute('data-id', s.id); li.setAttribute('data-st', 'todo'); li.appendChild(HC.icon(s.icon)); li.appendChild(el('span', null, L(s.t))); ol.appendChild(li); });
    }
    function setSteps(cur) { $$('#qd-steps li').forEach(function (li, i) { li.setAttribute('data-st', i < cur ? 'done' : i === cur ? 'now' : 'todo'); }); }
    function ensureMap() {
      if (map) return; map = mapFor(cvs); size = fitCanvas(map, stageBox, ovl); map.setColors(); map.fit();
      if ('ResizeObserver' in window) new ResizeObserver(function () { if (!map) return; var wasFit = !st || st.phase < 1; size = fitCanvas(map, stageBox, ovl); if (wasFit) map.fit(); map.dirty = true; map.frame(now()); }).observe(stageBox);
    }
    function reset(kind) {
      hz = kind; run = null; st = { phase: 0, rt: 0, evIdx: 0, step: -1, hold: 0, endAt: 0, acc: 0, tickAt: 0, prev: null, cur: null, cap: null, verdict: '', events: [], sim0: 0, approved: false, doneAt: -1 };
      setSteps(-1); $('#qd-verdict').textContent = ''; $('#qd-verdict').removeAttribute('data-s'); $('#qd-clock').textContent = '';
      clear($('#qd-units')); $('#qd-why').textContent = ''; $('#qd-cap').textContent = bi('الخريطة الوطنية: ثمانٍ من البلديات وكل منشآتها. اضغط أي خطر…', 'The national map: eight municipalities and all their facilities. Pick any hazard…');
      if (map) { map.scene.units = []; map.scene.incidents = []; map.scene.selInc = null; map.fit(); map.dirty = true; }
    }
    function snap() {
      var s = N.snapshot(run.nat), d = droneOf(run), al = N.alertQueue(run.nat, { all: true })[0];
      var rec = { simT: run.nat.t, units: slimUnits(s.units), incidents: s.incidents, drone: d ? { callsign: d.callsign, lon: d.lon, lat: d.lat, dock: d.dock, target: d.mission ? d.mission.target : null, state: d.state } : null, alert: al ? { state: al.state, verdict: al.verdict } : null, clock: s.clock };
      st.prev = st.cur || rec; st.cur = rec; st.tickAt = now();
    }
    function startIncident() {
      run = makeRun(hz); st.phase = 1; st.sim0 = run.nat.t; st.evIdx = 0;
      snap(); st.prev = st.cur; drain('alert-raised');
      var bb = bboxOf(run); map.flyTo({ bbox: bb, pad: 54 }, reduced() ? 0 : 1500);
      var pl = planOf(run), ul = $('#qd-units'); clear(ul);
      pl.units.forEach(function (u) {
        var li = el('li'); li.setAttribute('data-k', u.kind); li.setAttribute('data-id', u.unitId);
        var ic = el('span', 'u-i'); ic.appendChild(HC.icon(UNIT_ICON[u.kind] || 'alert')); li.appendChild(ic);
        var t = el('span', 'u-t'); t.appendChild(el('b', null, L(u.name))); t.appendChild(el('small', null, L(KIND_NAME[u.kind] || KIND_NAME.rescue))); li.appendChild(t);
        li.appendChild(el('span', 'u-e num', mmss(u.etaSec))); ul.appendChild(li);
      });
      var star = pl.units.filter(function (u) { return u.whyData && u.whyData.farButFaster; })[0] || pl.units[0];
      $('#qd-why').textContent = star && star.why ? L(star.why) : '';
      var k = $('#qd-k-drones'); if (k) k.textContent = M.num(N.drones(run.nat).length);
      st.cap = null;
    }
    function latestText(ev) { return L(ev.text); }
    function drain(until) {                                     // apply the engine's new events (until: stop right after the first event of that type)
      var evs = run.nat.events, e, i;
      for (i = st.evIdx; i < evs.length; i++) {
        e = evs[i];
        if (e.type === 'alert-raised') { setSteps(0); st.step = 0; st.cap = e; }
        else if (e.type === 'drone-launched') { setSteps(1); st.step = 1; st.cap = e; }
        else if (e.type === 'drone-on-station') { st.cap = e; }
        else if (e.type === 'drone-verified') { setSteps(2); st.step = 2; st.cap = e; st.hold = HOLD_APPROVE; st.phase = 2; }
        else if (e.type === 'dispatch-approved') { setSteps(3); st.step = 3; st.cap = e; }
        else if (e.type === 'unit-en-route') { if (st.step < 4) { setSteps(4); st.step = 4; } st.cap = e; }
        else if (e.type === 'unit-on-scene') { st.cap = e; if (st.doneAt < 0) st.doneAt = run.nat.t; }
        else if (e.type === 'dispatched') { st.cap = e; }
        if (until && e.type === until) { i++; break; }
      }
      st.evIdx = i;
    }
    function verdictText() {
      var s = st.cur; if (!s) return ['', ''];
      var a = s.alert ? s.alert.state : '';
      if (st.step >= 4) return [bi('أُرسلت الوحدات', 'DISPATCHED'), 'approved'];
      if (st.step === 3) return [bi('موافَق عليه', 'APPROVED'), 'approved'];
      if (a === 'CONFIRMED') return [bi('مؤكَّد · مفتاحان', 'CONFIRMED · 2 keys'), 'confirmed'];
      if (st.step >= 2) return [bi('مفتاح واحد · القرار للإنسان', '1 key · the human decides'), 'suspect'];
      return [bi('اشتباه', 'SUSPECT'), 'suspect'];
    }
    function paint(ts) {
      if (!map || !run) { if (map) { map.frame(ts || now()); drawOverlay(octx, map, size.w, size.h, null, size.d); } return; }
      var sc = map.scene, a = st.prev, b = st.cur; if (!b) return;
      var span = (TICK / SPEED) * 1000, u = playing && !reduced() ? clamp((now() - st.tickAt) / span, 0, 1) : 1;
      sc.units = b.units.map(function (x, i) { var y = a.units[i] || x; return { id: x.id, kind: x.kind, name: x.name, lon: lerp(y.lon, x.lon, u), lat: lerp(y.lat, x.lat, u), state: x.state, assigned: x.assigned, busy: x.busy }; });
      sc.incidents = b.incidents; sc.selInc = run.inc.id; map.dirty = true;
      var d = b.drone, dd = a.drone && d ? { callsign: d.callsign, dock: d.dock, target: d.target, lon: lerp(a.drone.lon, d.lon, u), lat: lerp(a.drone.lat, d.lat, u) } : (d ? { callsign: d.callsign, dock: d.dock, target: d.target, lon: d.lon, lat: d.lat } : null);
      var routes = [];
      var inc = b.incidents.filter(function (i) { return i.id === run.inc.id; })[0];
      if (inc && inc.plan) inc.plan.units.forEach(function (x) { if (x.route && x.route.length > 1) routes.push({ kind: x.kind, route: x.route, dashed: st.step < 3 }); });
      var pulse = reduced() ? 0 : (now() % 1400) / 1400;
      drawOverlay(octx, map, size.w, size.h, { drones: dd && (d.state !== 'docked' && d.state !== 'charging') ? [dd] : [], routes: routes, incident: { lon: run.S.lon, lat: run.S.lat }, pulse: pulse, incidentTok: 'danger' }, size.d);
      map.frame(ts || now());
      var vt = verdictText(), vb = $('#qd-verdict'); if (vb.textContent !== vt[0]) { vb.textContent = vt[0]; vb.setAttribute('data-s', vt[1]); }
      $('#qd-clock').textContent = clockOf(b.simT) + ' (SIM)';
      if (st.cap) { var ct = latestText(st.cap); var c = $('#qd-cap'); if (c.getAttribute('data-k') !== st.cap.type + st.cap.t + M.lang()) { c.setAttribute('data-k', st.cap.type + st.cap.t + M.lang()); c.textContent = ct; } }
      var pl = run.inc.plan;
      $$('#qd-units li').forEach(function (li) {
        var uu = pl.units.filter(function (x) { return x.unitId === li.getAttribute('data-id'); })[0]; if (!uu) return;
        var e = li.querySelector('.u-e'); if (e) e.textContent = uu.state === 'on-scene' ? bi('وصل', 'arrived') : (uu.state === 'cleared' ? bi('أنهى', 'done') : mmss(uu.etaSec));
      });
    }
    function simStep(dt) {                                       // dt = simulated seconds; the engine runs whole 5 s ticks and keeps the remainder
      st.acc += dt;
      while (st.acc >= TICK) { N.step(run.nat, TICK); st.acc -= TICK; drain(); snap(); }
    }
    function frame(ts) {
      raf = 0; if (!(playing && visible && !document.hidden)) { last = 0; return; }
      var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts; st.rt += dt;
      if (st.phase === 0) { if (st.rt >= 0.9) startIncident(); }
      else if (st.phase === 1) { simStep(dt * SPEED); }
      else if (st.phase === 2) {                                   // proof is in: hold for the human key, then Approve
        st.hold -= dt;
        if (st.hold <= 0 && !st.approved) { st.approved = true; N.approve(run.nat, run.inc.id); drain(); snap(); st.phase = 3; }
      } else if (st.phase === 3) { simStep(dt * SPEED); if (st.doneAt >= 0 && run.nat.t - st.doneAt > 40) { st.phase = 4; st.endAt = END_HOLD; } }
      else if (st.phase === 4) { st.endAt -= dt; if (st.endAt <= 0) { if (!reduced()) { reset(hz); } else { playing = false; syncPlay(); } } }
      paint(ts); schedule();
    }
    function schedule() { if (!raf && playing && visible && !document.hidden) raf = requestAnimationFrame(frame); }
    function syncPlay() { HC.setPlayBtn($('#qd-play'), playing); }
    function still(kind) {                                       // reduced motion: run the engine without drawing until the units are on their way, then paint one frame
      reset(kind); ensureMap(); startIncident();
      var n = 0;
      while (st.phase < 3 && n < 400) { simStep(TICK); if (st.phase === 2) { N.approve(run.nat, run.inc.id); drain(); snap(); st.approved = true; st.phase = 3; } n++; }
      n = 0; var t0 = run.nat.t;
      while (run.nat.t - t0 < 40 && n < 200) { simStep(TICK); n++; }
      st.phase = 4; st.endAt = 1e9; st.cap = st.cap; setSteps(4); paint(now());
    }
    function start(kind, force) {
      reset(kind); ensureMap();
      if (reduced() && !force) { still(kind); playing = false; syncPlay(); return; }
      playing = true; syncPlay(); last = 0; schedule();
    }
    Q.init = function () {
      HC.readTokens(root);
      buildSteps(); reset('fire');
      var chips = $$('#qd-hz .chip');
      chips.forEach(function (b) {
        b.addEventListener('click', function () {
          chips.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          var k = b.getAttribute('data-hz'); if (!SCEN[k]) return; ready_ = true; start(k, true);
        });
      });
      $('#qd-play').addEventListener('click', function () {
        if (!st) return; ensureMap();
        if (!playing) { if (st.phase >= 4 || !run) { start(hz, true); } else { playing = true; last = 0; syncPlay(); schedule(); } } else { playing = false; syncPlay(); }
      });
      $('#qd-restart').addEventListener('click', function () { ready_ = true; start(hz, true); });
      syncPlay();
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; schedule(); } });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { last = 0; schedule(); } }, { rootMargin: '60px' }).observe(stageBox); else visible = true;
      lazy(root, function () { setTimeout(function () { try { ensureMap(); $('#qd-loading').hidden = true; ready_ = true; Q.ready = true; start('fire'); } catch (e) { if (window.console) console.error(e); } }, 50); }, '600px');
      onLang(function () { buildSteps(); if (st) setSteps(st.step); if (st) st.cap = st.cap; var c = $('#qd-cap'); if (c) c.removeAttribute('data-k'); if (run) { var star = run.inc.plan.units.filter(function (u) { return u.whyData && u.whyData.farButFaster; })[0] || run.inc.plan.units[0]; $('#qd-why').textContent = star && star.why ? L(star.why) : ''; $$('#qd-units li').forEach(function (li) { var u = run.inc.plan.units.filter(function (x) { return x.unitId === li.getAttribute('data-id'); })[0]; if (u) { li.querySelector('b').textContent = L(u.name); li.querySelector('small').textContent = L(KIND_NAME[u.kind] || KIND_NAME.rescue); } }); } if (map) paint(now()); });
      onTheme(function () { HC.readTokens(root); if (map) { map.setColors(); map.dirty = true; paint(now()); } });
    };
    var ready_ = false;
    Q.state = function () { return st && { phase: st.phase, step: st.step, hz: hz, playing: playing, simT: run ? run.nat.t : 0, drones: run ? N.drones(run.nat).length : 0 }; };
    Q.start = start; Q.SCEN = SCEN; Q.makeRun = makeRun;
    return Q;
  })();

  /* ======================================================================= boot */
  function boot() {
    [initFacts, con.init, qd.init].forEach(function (fn) {
      if (typeof fn !== 'function') return;
      try { fn(); } catch (e) { if (window.console) console.error(e); }
    });
    window.ManaraHome = window.ManaraHome || {};
    window.ManaraHome.map = { ready: true, con: con, qd: qd, counts: counts, SCEN: SCEN, QUIET: QUIET };
    window.__homeMapReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
