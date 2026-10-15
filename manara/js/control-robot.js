/* MANARA («منارة») — CONTROL ROOM · the ROBOT tab («الروبوت»)  →  ControlRoom.mods.robot                                         (js/control-robot.js)
 * =====================================================================================================================
 * User requirement (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot".
 * The drone sees the fire from the sky; the ROBOT goes in where people should not go first: a small ground robot that searches the rooms of a burning building, finds people by thermal camera and voice, speaks to them in their
 * language, drops route beacons, reports blocked doors and hands every find to the crews.  This tab is the control room's window on it: a ManaraSim building scenario ('fire-night-robot' for a building fire, 'gas-night' for a gas
 * leak) is created ON DEMAND and LINKED to the selected building-fire / gas alert (one scenario per alert, kept while you look at others).  With no such alert selected the tab explains itself and offers a demo building.
 *
 * WHAT IS REAL AND WHAT IS SIMULATED (say it on screen)   Everything here is SIMULATED (SIM) and a CONCEPT with a simulated prototype: no robot has been built, tested in a fire or approved by any authority; a real one needs
 *   the authority's approval; it ASSISTS and firefighters decide; 999 stays the dispatcher.  The building is a stand-in (a Doha-style residence), not the real building at the alert's location.  Detection is rule-based (never "AI"),
 *   false positives and false negatives are part of the run, and the roles are simulated labels (no login).  What the control room "knows" is only what a phone check-in or a robot report told it: a person nobody has found is
 *   HIDDEN on the plan (a room shows how many are unaccounted); "show simulation truth" reveals the hidden people for the demo and says so.
 *
 * WHAT THE OPERATOR GETS
 *   PLAN      the building floor by floor (rooms, corridor, stairs, locked doors, smoke / fire / gas, searched rooms, route beacons, the robot's trail and camera cone) on a canvas that follows the robot or the fire.
 *   ROBOT     the state machine (idle · deploy · search · found · guide · blocked · return), battery, mesh link, coverage; the human key (an operator requests, ONLY the incident commander approves: CR.need gates it visibly), recall,
 *             pause / speed / seed / tracked or wheeled, +60 s; the robot's eye (people in view, thermal strength, 'possible person' false alarms being checked); voice guidance (what it said, and the operator can speak through it).
 *   PEOPLE    the headcount with its own «located by robot» bucket (never mixed with «safe»), the finds with a condition ESTIMATE, and the HAND-OFF to the crews: each find (and the robot status) goes out on the Manara.link bus
 *             as { type:'robot-find' } / { type:'robot' } (ManaraSim.busRobotFind / busRobot) and is logged in the comms tab.
 *   HONEST    the A/B switch «with robot / without robot» re-runs the SAME world (same seed, same fire, same people); the measured result over seeds 1–8 (computed here, on demand): overall locate time barely changes, the
 *             robot found the wheelchair user first in 5 of 8 seeds and the crews got there first in 3 of 8.  The limits panel: a wheeled robot cannot climb stairs, a hot room (34 °C) leaves the thermal camera no contrast.
 *
 * CONTRACT  CR.registerTab({ id:'robot', build(el), update(), frame(ts), active(on) }); CR.mods.robot.badge() → the map's «robot» pointer; CR.mods.robot = the test / automation API at the bottom.   Classic script, no fetch, no
 * libraries, never innerHTML.  The building simulation runs only while this tab is open (frame() is not called otherwise).
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, CR = win.ControlRoom;
  if (!CR || !CR.registerTab || (CR.mods && CR.mods.robot)) return;
  var h = CR.h, bi = CR.bi, lab = CR.lab, B = CR.B, N = CR.N, nm = CR.nm, setT = CR.setT, setA = CR.setA, clamp = CR.clamp, lerp = CR.lerp, now = CR.now, rgba = CR.rgba, mixc = CR.mixc, C = CR.C, S = CR.S, icon = CR.icon;
  var Sim = null, WI = null, TAB = 'robot';

  var XI = CR.XICON;
  XI.wheelchair = XI.wheelchair || '<circle cx="10" cy="4" r="1.8"/><path d="M10 7v6h5l3 5M10 13a5 5 0 1 0 5 6"/>';
  XI.door = XI.door || '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01"/>';
  XI.flag = XI.flag || '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>';
  XI.send = XI.send || '<path d="M4 12l16-8-6 16-3-6z"/>';

  /* ====================================================================================
   * 1. VOCABULARY
   * ==================================================================================== */
  var PHASES = [['idle', 'في مكانه', 'Idle'], ['deploy', 'نشر', 'Deploy'], ['search', 'بحث', 'Search'], ['found', 'عُثر', 'Found'], ['guide', 'إرشاد', 'Guide'], ['blocked', 'معترَض', 'Blocked'], ['return', 'عودة', 'Return']];
  var STATE_TOK = { stowed: 'muted', approved: 'info', deploying: 'info', searching: 'accent', guiding: 'safe', holding: 'warn', returning: 'warn', fault: 'danger' };
  var PERSON = { asleep: ['info', 'نائم', 'Asleep'], alerted: ['warn', 'نُبِّه', 'Alerted'], moving: ['brand', 'يتحرك', 'Moving'], safe: ['safe', 'بأمان', 'Safe'], help: ['danger', 'يحتاج مساعدة', 'Needs help'], located: ['accent', 'عُثر عليه بالروبوت', 'Located by robot'], unacc: ['muted', 'غير محسوب', 'Unaccounted'], calm: ['ink-2', 'مستيقظ', 'Awake'] };
  var NEED = { wheelchair: ['كرسي متحرك', 'wheelchair'], deaf: ['أصمّ', 'deaf'], blind: ['كفيف', 'blind'], elderly: ['مسنّ', 'elderly'], child: ['طفل', 'child'], asthma: ['ربو', 'asthma'] };
  var COND = { conscious: ['واعٍ', 'conscious'], asleep: ['نائم (أو فاقد الوعي)', 'asleep (or unconscious)'], unresponsive: ['لا يستجيب', 'not responding'], injured: ['مصاب', 'injured'], moving: ['يتحرك', 'moving'] };
  var BY = { thermal: ['الكاميرا الحرارية', 'thermal camera'], camera: ['الكاميرا العادية', 'visible camera'], audio: ['الصوت', 'sound'], 'camera+audio': ['الكاميرا والصوت', 'camera + sound'] };
  var ACT = { queued: ['بانتظار التوجيه', 'queued'], guide: ['يرشده إلى المخرج', 'guiding to the exit'], wake: ['يوقظه', 'waking'], stay: ['ابقَ هنا', 'stay here'], refuge: ['إلى شرفة اللجوء', 'to the refuge balcony'], hold: ['يبقى معه', 'staying with them'], none: ['—', '—'] };
  var SAYK = [['intro', 'أعرّف بنفسي', 'Introduce myself'], ['guide', 'أرشد إلى المخرج', 'Guide to the exit'], ['wake', 'أوقظ', 'Wake up'], ['stay', 'ابقَ هنا', 'Stay here'], ['refuge', 'إلى شرفة اللجوء', 'Go to the refuge'], ['hold', 'أبقى معك', 'I stay with you'], ['check', 'هل تسمعني؟', 'Can you hear me?'], ['blocked', 'الطريق مغلق', 'This way is blocked'], ['hood', 'ارتدِ غطاء الدخان', 'Put on the hood']];
  var LANGS = [['ar', 'العربية', 'Arabic'], ['en', 'English', 'English'], ['ml', 'മലയാളം', 'Malayalam'], ['ne', 'नेपाली', 'Nepali'], ['bn', 'বাংলা', 'Bengali'], ['ur', 'اردو', 'Urdu'], ['hi', 'हिन्दी', 'Hindi'], ['tl', 'Tagalog', 'Tagalog']];
  var DRAFT = { ml: 1, ne: 1, bn: 1, ur: 1, hi: 1, tl: 1 };
  // the measured A/B (seeds 1–8 of 'fire-night-robot', ManaraSim.abRobot): the same numbers the live «measure» button recomputes; the test compares the two
  var REF = { seeds: 8, p50Without: 345.7, p50With: 344.2, robotFirst: 5, crewsFirst: 3 };
  var SPEEDS = [1, 5, 20, 60], PRESET_OF = { fire: 'fire-night-robot', gas: 'gas-night' };

  function ltr(t) { return '⁦' + t + '⁩'; }
  function tmss(t) { return 'T+' + CR.mmss(t); }
  function T2(a) { return a ? (CR.lang() === 'en' ? a[1] : a[0]) : ''; }
  function LL(o) { return o ? (CR.lang() === 'en' ? (o.en || o.ar) : (o.ar || o.en)) : ''; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function cls(el, c, on) { if (el) el.classList.toggle(c, !!on); }
  function isOn() { return R.active == null ? S.tab === TAB : !!R.active; }
  function stateName(st) { var L = Sim && Sim.robot && Sim.robot.STATE_LABELS && Sim.robot.STATE_LABELS[st]; return L ? LL(L) : st; }

  /* ====================================================================================
   * 2. STATE
   * ==================================================================================== */
  var R = { root: null, ui: {}, built: false, active: null, scs: {}, order: [], cur: null, demo: null, playing: true, speed: 5, lastTs: 0, acc: 0, paintAt: 0, canvasAt: 0, dirtyCanvas: true, dirtyUI: true, fl: 0, flSel: 'auto', truth: false, ctx: null, w: 320, h: 220, dpr: 1,
    ab: { running: false, res: null, done: 0, total: 0 }, sentAt: 0, sendSig: '', hits: [], variant: 'tracked', busy: false, creating: false };

  /* ====================================================================================
   * 3. THE BUILDING (from ManaraSim.worldInfo(): the floor plans are drawn from the same graph the robot searches)
   * ==================================================================================== */
  var GEO = {};
  function roomy(n) { return n.type === 1 || n.type === 4 || n.type === 5 || n.type === 7; }
  function geomOf(si) {
    if (GEO[si]) return GEO[si];
    var Sx = WI.structs[si], g = { si: si, S: Sx, floors: Sx.floors, nodes: Sx.nodes, byId: {}, doorOf: {}, doorWith: {}, rooms: [], roomFl: {}, hasRoof: false, hw: si === 0 ? 0.7 : 1.0 }, d = 0;
    Sx.nodes.forEach(function (n, i) { g.byId[n.id] = i; if (n.fl === Sx.floors) g.hasRoof = true; if (n.type === 1 || n.type === 7) { g.rooms.push(n); if (n.room) g.roomFl[n.room] = n.fl; } });
    Sx.edges.forEach(function (e) {
      var a = Sx.nodes[g.byId[e[0]]], b = Sx.nodes[g.byId[e[1]]];
      if (e[2] & 2) { var room = roomy(a) ? a : b, other = room === a ? b : a; g.doorOf[room.id] = d; g.doorWith[room.id] = other.id; d++; }
    });
    g.floorList = []; for (var f = 0; f < Sx.floors; f++) g.floorList.push(f); if (g.hasRoof) g.floorList.push(Sx.floors);
    return (GEO[si] = g);
  }
  function floorLabel(g, fl) { return fl >= g.floors ? B('السطح', 'Roof') : B('الطابق ', 'Floor ') + N(fl + 1); }
  function nodeBox(g, n) {
    var hw = g.hw, x = n.x, y = n.y;
    if (n.type === 2) return { x0: x - hw, y0: y - 0.5, w: 2 * hw, h: 1.0, kind: 'corr' };
    if (n.type === 3) return { x0: x - 0.5, y0: y - 0.75, w: 1.0, h: 1.5, kind: 'stair' };
    if (n.type === 5) return { x0: x - 0.45, y0: y - 0.9, w: 0.9, h: 1.8, kind: 'refuge' };
    if (n.type === 6) return null;
    return { x0: x - hw + 0.03, y0: y - 1.0 + 0.03, w: 2 * hw - 0.06, h: 2.0 - 0.06, kind: n.type === 4 ? 'lobby' : n.type === 7 ? 'special' : 'room' };
  }

  /* ====================================================================================
   * 4. SCENARIOS: created on demand, linked to an alert (or the demo), one per alert
   * ==================================================================================== */
  function eligible(a) { return !!a && (a.hazard === 'fire' || a.hazard === 'gas') && !CR.isFinal(a); }
  function seedOf(a) { var n = parseInt(String(a.id).replace(/\D/g, ''), 10); return isNum(n) && n > 0 ? n : 1; }
  function newSim(sc, robotOn) {
    var pre = Sim.PRESETS[sc.preset], sim = Sim.create({ preset: sc.preset, seed: sc.seed, mode: 'manara', robot: robotOn ? { variant: sc.variant, units: 1, autoApprove: false } : false });
    if (sim.rb && sim.rb.role !== S.role) { try { Sim.setRole(sim, S.role); } catch (e) { /* ignore */ } }
    Sim.step(sim, Math.max(0, (isNum(pre.tIgnite) ? pre.tIgnite : 30) + 8 - sim.t));           // the run starts 8 s after ignition, the local alarm already sounding
    return sim;
  }
  function resetRun(sc, robotOn, toT) {
    sc.robotOn = !!robotOn; sc.sim = newSim(sc, robotOn); sc.struct = sc.sim.hazard === 'fire' && sc.sim.hz && isNum(sc.sim.hz.struct) ? sc.sim.hz.struct : 0; sc.g = geomOf(sc.struct);
    sc.trail = {}; sc.pose = {}; sc.evSeen = 0; sc.log = []; sc.sent = {}; sc.ended = false; sc.lastSay = null; sc.located = {}; sc.hcAt = -9; sc.speechSeen = 0; sc.lastState = null; sc.fl = null;
    if (toT && toT > sc.sim.t) { var left = toT - sc.sim.t; while (left > 0 && !sc.sim.done) { var n = Math.min(left, 25); Sim.step(sc.sim, n); left -= n; } }
    afterTick(sc, true);
  }
  function makeScenario(key, alert, preset, seed) {
    var sc = { key: key, alertId: alert ? alert.id : null, demo: !alert, preset: preset, seed: seed, variant: R.variant, robotOn: true, hz: alert ? alert.hazard : 'fire' };
    resetRun(sc, true, 0);
    R.scs[key] = sc; R.order = R.order.filter(function (k) { return k !== key; }); R.order.push(key);
    while (R.order.length > 4) { var old = R.order.shift(); if (old !== (R.cur && R.cur.key)) delete R.scs[old]; }
    return sc;
  }
  function ensureFor(alert) {                              // the scenario linked to this alert (created on first use)
    var key = 'A:' + alert.id; if (R.scs[key]) return R.scs[key];
    return makeScenario(key, alert, PRESET_OF[alert.hazard] || PRESET_OF.fire, seedOf(alert));
  }
  function setCur(sc) { if (sc === R.cur) return; R.cur = sc; R.lastTs = 0; R.acc = 0; R.dirtyCanvas = R.dirtyUI = true; R.fl = sc ? floorAuto(sc) : 0; R.flSel = 'auto'; R.sendSig = ''; }
  function openDemo() { var sc = R.scs.demo || makeScenario('demo', null, PRESET_OF.fire, 1); R.demo = sc; setCur(sc); S.dirtyUI = true; update(true); return sc; }
  function syncLink() {                                    // which scenario the tab shows: the one of the selected eligible alert, else the demo if it was opened, else nothing
    var a = CR.selectedAlert(), want = null;
    if (a && eligible(a) && Sim) { if (isOn() || R.scs['A:' + a.id]) want = ensureFor(a); }
    else if (R.demo && !(a && eligible(a))) want = R.demo;
    else if (a && R.scs['A:' + a.id]) want = R.scs['A:' + a.id];
    setCur(want);
    return R.cur;
  }
  function robotOf(sc) { return sc && sc.snap && sc.snap.robot && sc.snap.robot.robots.length ? sc.snap.robot.robots[0] : null; }
  function rawRobot(sc) { return sc && sc.sim && sc.sim.robots && sc.sim.robots.length ? sc.sim.robots[0] : null; }
  function param(sc, k) { return sc && sc.sim && sc.sim.P && isNum(sc.sim.P[k]) ? sc.sim.P[k] : null; }
  function fireFloor(sc) { try { var sim = sc.sim, g = sc.g; if (sim.hazard === 'fire' && sim.hz && isNum(sim.hz.originLocal)) return clamp(g.nodes[sim.hz.originLocal].fl, 0, g.floors - 1); } catch (e) { /* default */ } return 0; }
  function floorAuto(sc) { var r = robotOf(sc); if (r && r.state !== 'stowed' && r.pose && isNum(r.pose.fl)) return clamp(r.pose.fl, 0, sc.g.floors - 1); return fireFloor(sc); }

  // one batch of simulation time has run: refresh the snapshot, the headcount, the trail, the log, the bus
  function afterTick(sc, initial) {
    var sim = sc.sim; if (!sim) return;
    var snap = Sim.snapshot(sim, { events: false }); sc.snap = snap;
    var rs = snap.robot ? snap.robot.robots : [], tick = now();
    rs.forEach(function (r) {
      var p = r.pose, tr = sc.trail[r.id] || (sc.trail[r.id] = []), last = tr[tr.length - 1];
      if (!last || last.fl !== p.fl || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 0.02) { tr.push({ x: p.x, y: p.y, fl: p.fl }); if (tr.length > 600) tr.shift(); }
      var pr = sc.pose[r.id];
      sc.pose[r.id] = { px: pr ? pr.cx : p.x, py: pr ? pr.cy : p.y, pfl: pr ? pr.cfl : p.fl, cx: p.x, cy: p.y, cfl: p.fl, hd: r.heading, phd: pr ? pr.hd : r.heading };
    });
    sc.poseAt = tick; sc.tickMs = clamp(1000 / Math.max(1, R.speed), 60, 1000);
    if (initial || sim.t - sc.hcAt >= 1) { sc.hc = Sim.headcount(sim); sc.hcAt = sim.t; var lc = {}; (sc.hc.locatedList || []).forEach(function (x) { lc[x.key] = x; }); sc.located = lc; }
    consumeEvents(sc);
    if (sim.done && !sc.ended) { sc.ended = true; if (sc === R.cur) CR.live(B('انتهى تشغيل مشهد المبنى', 'The building scenario ended')); }
    if (sc === R.cur && !initial) publishStatus(sc);
    R.dirtyCanvas = R.dirtyUI = true;
  }
  var KEY_EV = { ignition: 1, confirmed: 1, approved: 1, 'public-alert': 1, 'local-alarm': 1, 'exit-state': 1, 'dead-end': 1, flashover: 1, 'operator-role': 1, rescued: 1, 'help-arrived': 1, 'unit-on-scene': 1, dispatched: 1, trapped: 1 };
  function consumeEvents(sc) {
    var ev = sc.sim.events, i;
    for (i = sc.evSeen; i < ev.length; i++) {
      var e = ev[i], isR = e.type.indexOf('robot-') === 0;
      if (!isR && !KEY_EV[e.type]) continue;
      if (e.type === 'robot-status') continue;
      var tone = /fault|rejected|blocked/.test(e.type) || e.type === 'dead-end' || e.type === 'trapped' ? 'danger' : e.type === 'robot-find' || e.type === 'robot-approved' || e.type === 'rescued' ? 'safe' : /false-positive|link|battery|retreat/.test(e.type) ? 'warn' : isR ? 'cool' : '';
      sc.log.push({ t: e.t, type: e.type, tone: tone, text: e.text });
      if (sc === R.cur && !sc.quiet) {
        if (e.type === 'robot-find') CR.live(B('الروبوت: ', 'Robot: ') + LL(e.text));
        else if (e.type === 'robot-fault') { CR.toast(e.text, 'danger', 6000); CR.live(LL(e.text)); }
        else if (e.type === 'robot-blocked') CR.live(LL(e.text));
      }
    }
    sc.evSeen = ev.length; if (sc.log.length > 200) sc.log.splice(0, sc.log.length - 200);
  }

  /* ---- the bus: the robot status about every 3 s while it is in the field; a find only when the operator hands it off ---- */
  function publishStatus(sc, force) {
    var r = robotOf(sc); if (!r || !Sim.busRobot) return;
    var live = r.state !== 'stowed' || r.approval.status === 'requested';
    var sig = r.state + '|' + r.approval.status;
    if (!live && !force) { R.sendSig = sig; return; }
    var t = now(), changed = sig !== R.sendSig; if (!force && !changed && t - R.sentAt < 3000) return;
    var m = Sim.busRobot(sc.sim); if (!m) return;
    R.sentAt = t; R.sendSig = sig;
    m.alert = sc.alertId; m.demo = sc.demo;
    if (changed) CR.busSend(m, 'robot', 'إلى الشبكة: حالة الروبوت — ' + (Sim.robot.STATE_LABELS[r.state] || { ar: r.state }).ar.replace(/ \(.*/, ''), 'On the bus: robot status — ' + (Sim.robot.STATE_LABELS[r.state] || { en: r.state }).en);
    else CR.busSend(m, 'robot');
  }
  function handoff(which) {                                // the hand-off to the crews: one find or all of them → { type:'robot-find' } on the bus
    var sc = R.cur; if (!sc || !sc.snap || !sc.snap.robot) return { ok: false, reason: 'no-robot' };
    if (!CR.need('operator', 'تسليم بلاغ الروبوت إلى الفرق', 'hand the robot\'s find to the crews')) return { ok: false, reason: 'role', code: 'role' };
    var finds = sc.snap.robot.finds.filter(function (f) { return f.reportedAt !== null && f.reportedAt !== undefined && (which === 'all' || f.id === which) && !sc.sent[f.id]; }), n = 0;
    finds.forEach(function (f) {
      var m = Sim.busRobotFind(sc.sim, f.id); if (!m) return;
      m.alert = sc.alertId; m.demo = sc.demo; sc.sent[f.id] = { t: sc.sim.t, wall: Date.now() };
      CR.busSend(m, 'find', 'إلى فرق الإنقاذ: ' + LL({ ar: m.text.ar, en: m.text.en }), 'To the rescue crews: ' + m.text.en);
      n++;
    });
    if (n) { CR.decision('robot-handoff', 'سُلِّم ' + n + ' بلاغ من الروبوت إلى الفرق', 'Handed ' + n + ' robot find(s) to the crews', { alert: sc.alertId }); CR.toast({ ar: 'سُلِّم ' + n + ' بلاغ إلى الفرق (999 يبقى هو المُرسِل)', en: n + ' find(s) handed to the crews (999 stays the dispatcher)' }, 'safe', 3200); CR.live(B('سُلِّم إلى الفرق: ', 'Handed to the crews: ') + N(n)); }
    else CR.toast({ ar: 'لا بلاغ جديد لتسليمه', en: 'Nothing new to hand off' }, 'warn', 2400);
    R.dirtyUI = true; update(true); return { ok: n > 0, n: n };
  }

  /* ---- the operator's actions: every one returns {ok, reason?}; a rejection is shown, spoken and logged by CR.need ---- */
  function syncRole(sc) { var sim = sc.sim; if (sim.rb && sim.rb.role !== S.role) { try { Sim.setRole(sim, S.role); } catch (e) { /* ignore */ } } }
  function act(fn, okAr, okEn) {
    var sc = R.cur; if (!sc || !sc.sim || !sc.robotOn) return { ok: false, reason: 'no-robot' };
    syncRole(sc); var res; try { res = fn(sc.sim); } catch (e) { res = { ok: false, reason: { ar: 'خطأ داخلي', en: 'Internal error: ' + e.message } }; }
    consumeEvents(sc); afterTick(sc);
    if (res && res.ok === false) { R.msg = { ok: false, text: res.reason ? LL(res.reason) : B('تعذّر التنفيذ', 'Could not do that') }; CR.live(R.msg.text); }
    else R.msg = { ok: true, text: B(okAr, okEn) };
    R.msgAt = now(); R.dirtyUI = true; update(true); return res;
  }
  function request() {
    if (!CR.need('operator', 'طلب نشر الروبوت', 'request deploying the robot')) return { ok: false, reason: 'role', code: 'role' };
    var r = act(function (sim) { return Sim.deployRobot(sim); }, 'طُلب النشر — بانتظار اعتماد قائد الحادث', 'Deployment requested — waiting for the incident commander');
    if (r && r.ok) { CR.logOp('robot', 'طلب المشغّل نشر الروبوت (' + (R.cur.alertId || 'مبنى تجريبي') + ') — بانتظار قائد الحادث', 'The operator requested deploying the robot (' + (R.cur.alertId || 'demo building') + ') — waiting for the incident commander', { alert: R.cur.alertId }); CR.decision('robot-request', 'طلب نشر الروبوت', 'Robot deployment requested', { alert: R.cur.alertId }); }
    return r;
  }
  function approve() {
    if (!CR.need('commander', 'اعتماد نشر الروبوت (المفتاح البشري)', 'approve sending the robot in (the human key)')) { R.msg = { ok: false, text: B('اعتماد نشر الروبوت لقائد الحادث فقط', 'Only the incident commander can approve sending the robot in') }; R.msgAt = now(); R.dirtyUI = true; update(true); return { ok: false, reason: 'role', code: 'role' }; }
    var r = act(function (sim) { return Sim.approveRobot(sim); }, 'اعتمد قائد الحادث — يبدأ النشر', 'The incident commander approved — deploying');
    if (r && r.ok) { CR.logOp('robot', 'اعتمد قائد الحادث نشر الروبوت (' + (R.cur.alertId || 'مبنى تجريبي') + ') — المفتاح البشري', 'The incident commander approved deploying the robot (' + (R.cur.alertId || 'demo building') + ') — the human key', { alert: R.cur.alertId }); CR.decision('robot-approve', 'اعتماد نشر الروبوت', 'Robot deployment approved', { alert: R.cur.alertId }); }
    return r;
  }
  function recall() {
    if (!CR.need('operator', 'استدعاء الروبوت', 'recall the robot')) return { ok: false, reason: 'role', code: 'role' };
    var r = act(function (sim) { return Sim.recallRobot(sim); }, 'استُدعي الروبوت إلى المدخل', 'The robot was recalled to the entrance');
    if (r && r.ok) CR.logOp('robot', 'استدعى المشغّل الروبوت إلى المدخل', 'The operator recalled the robot to the entrance', { alert: R.cur.alertId });
    return r;
  }
  function speak(key, lng) {
    if (!CR.need('operator', 'التحدث عبر الروبوت', 'speak through the robot')) return { ok: false, reason: 'role', code: 'role' };
    var r = act(function (sim) { return Sim.speakVia(sim, 'R1', key, lng); }, 'تكلّم الروبوت', 'The robot spoke');
    if (r && r.ok && r.speech) R.cur.lastSay = { line: r.speech, to: r.to, at: R.cur.sim.t };
    return r;
  }
  function setRobot(on) {                                  // the A/B switch: the SAME world (same seed) re-run to the same clock with or without the robot
    var sc = R.cur; if (!sc) return false; on = !!on; if (sc.robotOn === on) return true;
    var t = sc.sim.t; resetRun(sc, on, t); R.fl = floorAuto(sc); R.dirtyCanvas = R.dirtyUI = true;
    CR.logOp('robot', on ? 'مقارنة: التشغيل نفسه مع الروبوت (البذرة ' + sc.seed + ')' : 'مقارنة: التشغيل نفسه بلا روبوت (البذرة ' + sc.seed + ')', on ? 'A/B: the same run with the robot (seed ' + sc.seed + ')' : 'A/B: the same run without the robot (seed ' + sc.seed + ')', { alert: sc.alertId });
    update(true); return true;
  }
  function restart(o) {
    var sc = R.cur; if (!sc) return false; o = o || {};
    if (isNum(o.seed)) sc.seed = clamp(Math.round(o.seed), 1, 9999); if (o.variant) { sc.variant = o.variant; R.variant = o.variant; }
    resetRun(sc, sc.robotOn, 0); R.fl = floorAuto(sc); R.playing = true; R.dirtyCanvas = R.dirtyUI = true; update(true); return true;
  }
  function stepBy(sec) {                                   // fast-forward whole seconds (the +60 s button, tests)
    var sc = R.cur; if (!sc || !sc.sim) return 0; var t0 = sc.sim.t, left = Math.max(0, Math.round(sec));
    while (left > 0 && !sc.sim.done) { var n = Math.min(left, 20); Sim.step(sc.sim, n); left -= n; }
    if (sc.sim.t !== t0) afterTick(sc);
    if (R.cur === sc) { if (R.flSel === 'auto') R.fl = floorAuto(sc); update(true); }
    return sc.sim.t - t0;
  }

  /* ---- the measured A/B over seeds 1–8 (about 2 s each, run one after the other so the page can breathe) ---- */
  function measure(seeds) {
    seeds = seeds || [1, 2, 3, 4, 5, 6, 7, 8];
    if (R.ab.running) return R.ab.promise;
    R.ab.running = true; R.ab.done = 0; R.ab.total = seeds.length; R.ab.rows = [];
    R.ab.promise = new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (i >= seeds.length) { R.ab.running = false; R.ab.res = summarise(R.ab.rows); R.dirtyUI = true; update(true); resolve(R.ab.res); return; }
        setTimeout(function () {
          var r = null; try { r = Sim.abRobot({ preset: 'fire-night-robot', seed: seeds[i] }); } catch (e) { r = null; }
          if (r) {
            var pp = function (m) { var a = m.unaccounted.perPerson.filter(function (p) { return p.key === 'abu-salem'; })[0]; return a || null; };
            R.ab.rows.push({ seed: seeds[i], p50w: r.without.unaccounted.timeToLocate.p50, p50r: r.withRobot.unaccounted.timeToLocate.p50, asW: pp(r.without), asR: pp(r.withRobot), located: [r.without.unaccounted.locatedPct, r.withRobot.unaccounted.locatedPct] });
          }
          i++; R.ab.done = i; R.dirtyUI = true; update(true); next();
        }, 40);
      })();
    });
    return R.ab.promise;
  }
  function summarise(rows) {
    var mean = function (a) { var v = a.filter(isNum); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; };
    var first = rows.filter(function (x) { return x.asR && x.asR.byRobot; }).length;
    return { n: rows.length, p50Without: mean(rows.map(function (x) { return x.p50w; })), p50With: mean(rows.map(function (x) { return x.p50r; })), robotFirst: first, crewsFirst: rows.filter(function (x) { return x.asR && !x.asR.byRobot; }).length, rows: rows };
  }

  /* ====================================================================================
   * 5. THE PLAN (canvas): one floor at a time, north-up; tokens for colour; redrawn on the theme change
   * ==================================================================================== */
  function rrect(x, a, b, w, hh, r) { r = Math.min(r, w / 2, hh / 2); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + hh, r); x.arcTo(a + w, b + hh, a, b + hh, r); x.arcTo(a, b + hh, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function halo(x, s, a, b, col, hal, w) { x.lineJoin = 'round'; x.lineWidth = w || 3; x.strokeStyle = hal; x.strokeText(s, a, b); x.fillStyle = col; x.fillText(s, a, b); }
  function flame(x, s) { x.beginPath(); x.moveTo(0, -s * 0.8); x.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.6, s * 0.6, 0, s * 0.72); x.bezierCurveTo(-s * 0.6, s * 0.6, -s * 0.7, -s * 0.05, -s * 0.18, -s * 0.34); x.bezierCurveTo(-s * 0.16, -s * 0.5, -s * 0.05, -s * 0.62, 0, -s * 0.8); x.closePath(); }
  function lockG(x, a, b, s, col) { x.save(); x.translate(a, b); x.lineWidth = Math.max(1.4, s * 0.16); x.strokeStyle = col; x.fillStyle = col; x.fillRect(-s * 0.5, -s * 0.05, s, s * 0.7); x.beginPath(); x.arc(0, -s * 0.05, s * 0.36, Math.PI, 0); x.stroke(); x.restore(); }
  function pstate(p, sc) {                                 // what a person looks like to the CONTROL ROOM: only a check-in or a robot report makes them known
    if (p.away) return null;
    if (sc.located[p.key]) return 'located';
    if (p.checkin === 'help') return 'help';
    if (p.checkin === 'safe') return 'safe';
    return 'hidden';
  }
  function truthState(p, snap) {
    var needs = p.checkin === 'help' || p.st === 'down' || p.st === 'incapacitated' || p.st === 'waiting' || (p.st === 'sheltered' && p.safeKind === 'refuge');
    if (p.checkin === 'safe' || p.st === 'safe' || (p.st === 'sheltered' && p.safeKind !== 'refuge')) return 'safe';
    if (needs) return 'help'; if (p.st === 'moving') return 'moving'; if (p.asleep) return 'asleep';
    if (p.aware >= 1 && (snap.alert || p.aware >= 2)) return 'alerted';
    return 'calm';
  }
  function dot(x, a, b, rad, st, o) {
    var col = C(PERSON[st][0]); o = o || {};
    x.save(); if (o.ghost) x.globalAlpha = 0.55;
    if (st === 'help') { x.beginPath(); x.arc(a, b, rad * 2.1, 0, 6.2832); x.fillStyle = rgba(C('danger'), 0.26); x.fill(); }
    x.beginPath(); x.arc(a, b, rad, 0, 6.2832); x.fillStyle = rgba(col); x.fill(); x.lineWidth = Math.max(1, rad * 0.3); x.strokeStyle = rgba(C('surface'), 0.95); x.stroke();
    if (st === 'located') { x.beginPath(); x.arc(a, b, rad + 2.6, 0, 6.2832); x.lineWidth = 1.7; x.strokeStyle = rgba(C('accent')); x.stroke(); }
    if (o.persona === 'wheelchair') { x.beginPath(); x.arc(a, b + rad * 0.55, rad * 1.55, 0.35, Math.PI - 0.35); x.lineWidth = Math.max(1.6, rad * 0.35); x.strokeStyle = rgba(C('head')); x.stroke(); }
    if (o.asleep) { x.font = '700 ' + Math.max(9, rad * 1.7) + 'px ' + CR.font(); x.textAlign = 'center'; x.textBaseline = 'middle'; halo(x, 'z', a + rad * 1.7, b - rad * 1.5, rgba(C('head')), rgba(C('surface'), 0.9), 3); }
    x.restore();
  }
  function robotG(x, a, b, s, r, hd, rng) {
    var col = C(STATE_TOK[r.state] || 'accent'), act = r.state === 'searching' || r.state === 'guiding' || r.state === 'holding' || r.state === 'returning';
    x.save(); x.translate(a, b);
    if (act) { x.save(); x.rotate(hd * Math.PI / 180); var gr = x.createRadialGradient(0, 0, 2, 0, 0, rng); gr.addColorStop(0, rgba(C('accent'), 0.34)); gr.addColorStop(1, rgba(C('accent'), 0)); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, rng, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); x.closePath(); x.fillStyle = gr; x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, s * 1.08, 0, 6.2832); x.fillStyle = rgba(C('surface'), 0.94); x.fill(); x.lineWidth = 2.4; x.strokeStyle = rgba(col); x.stroke();
    x.rotate(hd * Math.PI / 180); var wl = s * 0.62, ww = s * 0.84;
    x.fillStyle = rgba(C('ink-2')); if (r.variant === 'tracked') { rrect(x, -ww / 2 - s * 0.14, -wl, s * 0.28, wl * 2, s * 0.1); x.fill(); rrect(x, ww / 2 - s * 0.14, -wl, s * 0.28, wl * 2, s * 0.1); x.fill(); } else { [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]].forEach(function (q) { x.beginPath(); x.arc(q[0] * ww * 0.5, q[1] * wl, s * 0.17, 0, 6.2832); x.fill(); }); }
    x.fillStyle = rgba(col); rrect(x, -ww / 2 + s * 0.05, -wl * 0.8, ww - s * 0.1, wl * 1.6, s * 0.12); x.fill();
    x.fillStyle = rgba(C('surface')); x.beginPath(); x.arc(0, -wl * 0.42, s * 0.2, 0, 6.2832); x.fill(); x.fillStyle = rgba(C('head')); x.beginPath(); x.arc(0, -wl * 0.42, s * 0.09, 0, 6.2832); x.fill();
    x.restore();
  }
  function poseDraw(sc, r) {
    var p = sc.pose[r.id]; if (!p) return { x: r.pose.x, y: r.pose.y, fl: r.pose.fl, hd: r.heading };
    var a = 1; if (!CR.reduced() && R.playing) a = clamp((now() - sc.poseAt) / sc.tickMs, 0, 1);
    if (p.pfl !== p.cfl || a >= 1) return { x: p.cx, y: p.cy, fl: p.cfl, hd: p.hd };
    var d = ((p.hd - p.phd + 540) % 360) - 180; return { x: lerp(p.px, p.cx, a), y: lerp(p.py, p.cy, a), fl: p.cfl, hd: p.phd + d * a };
  }
  function drawPlan() {
    var sc = R.cur, x = R.ctx; if (!sc || !sc.sim || !x || !R.ui.cv) return;
    var W = R.w, H = R.h, dpr = R.dpr, sim = sc.sim, snap = sc.snap, g = sc.g, Sx = g.S, fl = clamp(R.fl, 0, g.floorList[g.floorList.length - 1]), roof = fl >= Sx.floors, dark = CR.C('bg')[0] < 90;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.fillStyle = rgba(C('bg-2')); x.fillRect(0, 0, W, H);
    var tH = 26, k = Math.max(8, Math.min((W - 12) / (Sx.w + 2.8), (H - tH - 6) / (Sx.h + 3.0))), ox = (W - (Sx.w + 2.8) * k) / 2, oy = tH + (H - tH - (Sx.h + 3.0) * k) / 2;
    var PX = function (a) { return ox + (1.4 + a - Sx.x0) * k; }, PY = function (b) { return oy + (1.5 + b - Sx.y0) * k; };
    var st = sim.stt && sim.stt[g.si] ? sim.stt[g.si] : null, obst = sim.rb && sim.rb.obst ? sim.rb.obst : {}, robots = snap.robot ? snap.robot.robots : [], hcR = sc.hc && sc.hc.rooms ? sc.hc.rooms : {}, i;
    var covN = {}, roomSt = {}; robots.forEach(function (r) { if (r.coverage) { r.coverage.nodes.forEach(function (n) { if (!covN[n.id] || n.cov > covN[n.id]) covN[n.id] = n.cov; }); Object.keys(r.coverage.rooms).forEach(function (rm) { var v = r.coverage.rooms[rm]; if (!roomSt[rm] || v === 'searched' || roomSt[rm] === 'open') roomSt[rm] = v; }); } });
    var gasHaz = sim.hazard === 'gas', gasMax = (snap.hazardState && snap.hazardState.danger) || 2100, moving = !CR.reduced();
    R.hits = [];
    x.textBaseline = 'middle'; x.direction = 'ltr';
    // title strip
    x.font = '700 ' + clamp(0.46 * k, 11, 14) + 'px ' + CR.font(); x.textAlign = CR.lang() === 'ar' ? 'right' : 'left'; x.fillStyle = rgba(C('head'));
    var inFl = snap.people.filter(function (p) { return !p.away && p.fl === fl && p.x >= Sx.x0 - 1 && p.x <= Sx.x0 + Sx.w + 1.5 && p.y >= Sx.y0 - 1 && p.y <= Sx.y0 + Sx.h + 1; });
    x.direction = CR.lang() === 'ar' ? 'rtl' : 'ltr';
    x.fillText(floorLabel(g, fl) + (R.truth ? '' : ''), CR.lang() === 'ar' ? W - 10 : 10, tH / 2 + 1);
    var known = inFl.filter(function (p) { var s = pstate(p, sc); return s && s !== 'hidden'; }).length;
    x.font = '500 ' + clamp(0.4 * k, 10, 12.5) + 'px ' + CR.font(); x.fillStyle = rgba(C('muted')); x.textAlign = CR.lang() === 'ar' ? 'left' : 'right';
    x.fillText(R.truth ? B('الحقيقة المحاكاة: ', 'Simulation truth: ') + N(inFl.length) + B(' شخصاً هنا', ' people here') : N(known) + B(' معروفون هنا', ' known here'), CR.lang() === 'ar' ? 10 : W - 10, tH / 2 + 1);
    x.direction = 'ltr';
    // footprint
    x.save(); rrect(x, PX(Sx.x0), PY(Sx.y0), Sx.w * k, Sx.h * k, 0.2 * k); x.fillStyle = rgba(roof ? mixc(C('surface-3'), C('bg'), 0.3) : C('surface-2')); x.fill(); x.lineWidth = Math.max(2, 0.12 * k); x.strokeStyle = rgba(C('line-2')); if (roof) x.setLineDash([8, 5]); x.stroke(); x.restore();
    if (roof) { x.font = '600 ' + clamp(0.42 * k, 10, 14) + 'px ' + CR.font(); x.textAlign = 'center'; x.fillStyle = rgba(C('muted')); x.fillText(B('سطح المبنى', 'Building roof'), PX(Sx.x0 + Sx.w / 2), PY(Sx.y0 + Sx.h / 2 + 1.0)); }
    // nodes
    g.nodes.forEach(function (n, ni) {
      if (n.fl !== fl) return; var bx = nodeBox(g, n); if (!bx) return;
      var x0 = PX(bx.x0), y0 = PY(bx.y0), w = bx.w * k, hh = bx.h * k, cx = x0 + w / 2, cy = y0 + hh / 2, burn = st ? st.burn[ni] : 0, smoke = st ? st.smoke[ni] : 0, gas = st && gasHaz ? st.gas[ni] : 0, kind = bx.kind;
      x.save(); rrect(x, x0, y0, w, hh, Math.max(2, 0.12 * k));
      var base = kind === 'corr' ? C('surface-3') : kind === 'stair' ? mixc(C('surface-3'), C('accent'), 0.12) : kind === 'refuge' ? mixc(C('surface'), C('safe'), 0.2) : kind === 'lobby' ? mixc(C('surface'), C('info'), 0.12) : C('surface');
      x.fillStyle = rgba(base); x.fill();
      if (covN[n.id] > 0.02) { x.fillStyle = rgba(C('accent'), clamp(covN[n.id], 0, 1) * (dark ? 0.34 : 0.28)); x.fill(); }
      if (smoke > 0.01) { x.fillStyle = rgba(mixc(C('ink'), C('bg'), dark ? 0.1 : 0.3), clamp(smoke * 1.15, 0, 0.72)); x.fill(); }
      if (gas > 5) { x.fillStyle = rgba(C('warn'), clamp(gas / gasMax, 0, 0.7)); x.fill(); }
      if (burn === 1) { var fk = moving ? 0.82 + 0.18 * Math.sin(now() / 140 + ni) : 1; x.fillStyle = rgba(mixc(C('fire-2'), C('fire-3'), 0.4), 0.78 * fk); x.fill(); } else if (burn >= 2) { x.fillStyle = rgba(C('ink'), 0.4); x.fill(); }
      var rc = n.room ? hcR[n.room] : null, bcol = C('line-2'), bw = 1.2;
      if (rc && rc.total) { if (rc.help > 0) { bcol = C('danger'); bw = 2.4; } else if (rc.safe + (rc.safeAway || 0) >= rc.total) { bcol = C('safe'); bw = 2.2; } else if (rc.located > 0) { bcol = C('accent'); bw = 2.2; } }
      x.lineWidth = bw; x.strokeStyle = rgba(bcol); x.stroke();
      if (kind === 'stair') { x.beginPath(); for (var yy = 0.2; yy < 1.5; yy += 0.28) { x.moveTo(x0 + 0.1 * k, y0 + yy * k); x.lineTo(x0 + w - 0.1 * k, y0 + yy * k); } x.lineWidth = 1; x.strokeStyle = rgba(C('line-2'), 0.9); x.stroke(); }
      x.restore();
      if (burn === 1) { x.save(); x.translate(cx, cy + 0.12 * k); flame(x, clamp(0.55 * k, 8, 24)); x.fillStyle = rgba(C('fire-1'), 0.95); x.fill(); x.restore(); }
      x.textAlign = 'center';
      if (kind === 'room' || kind === 'special') { x.font = '700 ' + clamp(0.4 * k, 9, 14) + 'px ' + CR.font(); x.fillStyle = rgba(C('ink-2')); var cn0 = g.doorWith[n.id] ? g.nodes[g.byId[g.doorWith[n.id]]] : null, lowL = cn0 && cn0.y < n.y - 0.2; x.fillText(kind === 'special' ? LL(n.label).replace(/^الصف |^Class /, '') : n.room, cx, lowL ? y0 + hh - 0.3 * k - 2 : y0 + 0.3 * k + 2); }
      else if (kind === 'stair') { x.font = '700 ' + clamp(0.5 * k, 10, 16) + 'px ' + CR.font(); x.fillStyle = rgba(C('ink-2')); x.fillText(LL(n.label).replace(/^الدرج |^Stair |^West |^East |^الغربي|^الشرقي/g, '').trim().slice(0, 2) || '↕', cx, cy); }
      else if (kind === 'lobby') { x.font = '600 ' + clamp(0.34 * k, 8.5, 11) + 'px ' + CR.font(); x.fillStyle = rgba(C('ink-2')); x.fillText(B('بهو وحارس', 'Lobby · guard'), cx, cy); }
      else if (kind === 'refuge') { x.font = '600 ' + clamp(0.3 * k, 8, 10) + 'px ' + CR.font(); x.fillStyle = rgba(C('safe')); x.save(); x.translate(cx, cy); x.rotate(-Math.PI / 2); x.fillText(B('شرفة اللجوء', 'Refuge'), 0, 0); x.restore(); }
      // unaccounted residents of this room (the register knows who lives there, not where they are now): a dashed badge in the middle of the room
      if (!R.truth && rc && rc.unaccounted > 0 && (kind === 'room' || kind === 'special')) {
        var qr = clamp(0.24 * k, 7, 11), qx = cx, qy = cy + (burn === 1 ? 0.42 * k : 0.12 * k); x.save(); x.beginPath(); x.arc(qx, qy, qr, 0, 6.2832); x.setLineDash([3, 2]); x.lineWidth = 1.4; x.strokeStyle = rgba(C('ink-2'), 0.95); x.fillStyle = rgba(C('surface'), 0.92); x.fill(); x.stroke(); x.setLineDash([]);
        x.font = '700 ' + qr * 1.1 + 'px ' + CR.mono(); x.fillStyle = rgba(C('ink')); x.textAlign = 'center'; x.fillText(String(rc.unaccounted), qx, qy + 0.5); x.restore();
      }
      if (roomy(n) && g.doorOf[n.id] !== undefined && n.type !== 5) {                // the door between the room and its corridor
        var cor = g.nodes[g.byId[g.doorWith[n.id]]], vert = Math.abs(cor.y - n.y) >= Math.abs(cor.x - n.x), dx2 = vert ? cx : (cor.x > n.x ? x0 + w : x0), dy2 = vert ? (cor.y > n.y ? y0 + hh : y0) : cy;
        var locked = !!(obst[n.id] && obst[n.id].locked), open = !!(st && st.doorOpen && st.doorOpen[g.doorOf[n.id]]), dl = clamp(0.5 * k, 7, 20);
        x.save(); x.lineCap = 'round'; x.lineWidth = clamp(0.1 * k, 2.4, 5); x.strokeStyle = rgba(locked ? C('danger') : open ? C('safe') : C('ink-2'), locked ? 1 : 0.95); x.beginPath();
        if (vert) { x.moveTo(dx2 - dl / 2, dy2); x.lineTo(dx2 + dl / 2, dy2); } else { x.moveTo(dx2, dy2 - dl / 2); x.lineTo(dx2, dy2 + dl / 2); } x.stroke(); x.restore();
        if (locked) lockG(x, dx2 + (vert ? 0 : (cor.x > n.x ? 1 : -1) * dl * 0.55), dy2 + (vert ? (cor.y > n.y ? 1 : -1) * dl * 0.6 : 0), clamp(0.34 * k, 8, 13), rgba(C('danger')));
      }
      var stt = n.room ? roomSt[n.room] : null;
      if (stt && stt !== 'open' && (kind === 'room' || kind === 'special')) {         // the robot's own status of the room
        var bx2 = x0 + w - clamp(0.2 * k, 6, 9), by2 = y0 + hh - clamp(0.2 * k, 6, 9), q = clamp(0.2 * k, 6, 10);
        x.save(); x.lineWidth = 2; x.lineCap = 'round'; x.lineJoin = 'round';
        if (stt === 'searched') { x.strokeStyle = rgba(C('safe')); x.beginPath(); x.moveTo(bx2 - q * 0.6, by2); x.lineTo(bx2 - q * 0.15, by2 + q * 0.5); x.lineTo(bx2 + q * 0.7, by2 - q * 0.5); x.stroke(); }
        else if (stt === 'locked') lockG(x, bx2, by2, q * 1.2, rgba(C('danger')));
        else if (stt === 'unreachable') { x.strokeStyle = rgba(C('warn')); x.beginPath(); x.moveTo(bx2 - q * 0.7, by2 + q * 0.6); x.lineTo(bx2 - q * 0.2, by2 + q * 0.6); x.lineTo(bx2 - q * 0.2, by2); x.lineTo(bx2 + q * 0.3, by2); x.lineTo(bx2 + q * 0.3, by2 - q * 0.6); x.stroke(); }
        else if (stt === 'hot') { x.translate(bx2, by2); flame(x, q * 0.8); x.strokeStyle = rgba(C('danger')); x.stroke(); }
        x.restore();
      }
    });
    // exits
    var exSt = {}; snap.exits.forEach(function (e) { if (e.struct === Sx.id) exSt[e.id] = e; });
    Sx.exits.forEach(function (ex) {
      var en = g.nodes[g.byId[ex.node]], es = exSt[ex.id]; if (!en || !es) return; var ax, ay;
      if (ex.kind === 'roof') { if (roof) { ax = PX(Sx.x0 + Sx.w / 2); ay = PY(Sx.y0 + Sx.h / 2 - 0.4); } else if (fl === en.fl) { ax = PX(en.x); ay = PY(en.y - 1.15); } else return; }
      else if (ex.kind === 'entrance') { if (fl !== 0) return; ax = PX(en.x); ay = PY(Sx.y0 + Sx.h + 0.62); }
      else { if (fl !== 0) return; ax = PX(en.x < Sx.x0 + Sx.w / 2 ? Sx.x0 - 0.62 : Sx.x0 + Sx.w + 0.62); ay = PY(en.y); }
      var tok = es.state === 'OPEN' ? 'safe' : es.state === 'SMOKE' ? 'warn' : es.state === 'FIRE' ? 'danger' : 'muted', br = clamp(0.3 * k, 8, 14);
      x.save(); x.beginPath(); x.arc(ax, ay, br, 0, 6.2832); x.fillStyle = rgba(C('surface')); x.fill(); x.lineWidth = 2.6; x.strokeStyle = rgba(C(tok)); x.stroke(); x.font = '700 ' + br * 1.05 + 'px ' + CR.mono(); x.fillStyle = rgba(C('head')); x.textAlign = 'center'; x.fillText(ex.kind === 'roof' ? 'R' : ex.kind === 'entrance' ? 'E' : ex.id, ax, ay + 0.5);
      if (es.state === 'LOCKED') lockG(x, ax + br * 0.85, ay - br * 0.85, br * 0.9, rgba(C('danger')));
      x.restore();
    });
    // the way a find was told to go
    if (snap.robot) snap.robot.finds.forEach(function (f) {
      if (!f.route || f.route.length < 2 || f.action === 'queued' || f.action === 'hold' || f.action === 'stay') return;
      x.save(); x.lineWidth = Math.max(2, 0.09 * k); x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = rgba(C('safe'), 0.85); x.setLineDash([6, 4]); x.beginPath(); var pen = false;
      f.route.forEach(function (id) { var nn = g.nodes[g.byId[id]]; if (!nn) return; if (nn.fl === fl) { if (pen) x.lineTo(PX(nn.x), PY(nn.y)); else { x.moveTo(PX(nn.x), PY(nn.y)); pen = true; } } else pen = false; });
      x.stroke(); x.restore();
    });
    // trail, planned path, beacons
    robots.forEach(function (r) {
      var tr = sc.trail[r.id] || [];
      if (tr.length > 1) { x.save(); x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = Math.max(1.6, 0.07 * k); x.strokeStyle = rgba(C('accent'), 0.5); x.beginPath(); var pn = false; tr.forEach(function (q) { if (q.fl !== fl) { pn = false; return; } if (pn) x.lineTo(PX(q.x), PY(q.y)); else { x.moveTo(PX(q.x), PY(q.y)); pn = true; } }); x.stroke(); x.restore(); }
      var rr = rawRobot(sc);
      if (rr && rr.path && rr.path.length && r.state !== 'stowed' && r.state !== 'fault') {
        x.save(); x.lineWidth = Math.max(1.5, 0.06 * k); x.setLineDash([3, 5]); x.strokeStyle = rgba(C('brand'), 0.9); x.beginPath(); var pen2 = false, pts = [], pz = poseDraw(sc, r); pts.push({ x: pz.x, y: pz.y, fl: pz.fl });
        if (rr.to >= 0) { var tn = g.nodes[rr.to]; pts.push({ x: tn.x, y: tn.y, fl: tn.fl }); } rr.path.forEach(function (li) { var nn = g.nodes[li]; if (nn) pts.push({ x: nn.x, y: nn.y, fl: nn.fl }); });
        pts.forEach(function (q) { if (q.fl === fl) { if (pen2) x.lineTo(PX(q.x), PY(q.y)); else { x.moveTo(PX(q.x), PY(q.y)); pen2 = true; } } else pen2 = false; }); x.stroke(); x.restore();
      }
      r.beacons.forEach(function (b) { if (b.fl !== fl) return; var bx = PX(b.x), by = PY(b.y), s = clamp(0.2 * k, 5, 9); x.save(); x.translate(bx, by); x.rotate(0.7854); x.fillStyle = rgba(C('safe')); x.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); x.lineWidth = 1.5; x.strokeStyle = rgba(C('surface')); x.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); x.restore(); });
    });
    // people: only what a check-in or a robot report told the control room (or, if asked, the simulation truth in ghost dots)
    var pr = clamp(0.17 * k, 3, 7);
    inFl.forEach(function (p) {
      var a = PX(p.x), b = PY(p.y);
      if (R.truth) { var ts = truthState(p, snap); dot(x, a, b, p.hero ? pr + 1 : pr, ts, { ghost: true, persona: p.persona, asleep: p.asleep && ts === 'asleep' }); return; }
      var s2 = pstate(p, sc); if (!s2 || s2 === 'hidden') return;
      var f = sc.located[p.key] ? (snap.robot ? snap.robot.finds.filter(function (q) { return q.key === p.key; })[0] : null) : null;
      dot(x, a, b, pr, s2, { persona: f ? f.persona : null, asleep: f && f.condition && f.condition.key === 'asleep' });
    });
    // the robot
    robots.forEach(function (r) {
      var pz = poseDraw(sc, r); if (pz.fl !== fl) return; var rs = clamp(0.42 * k, 10, 22), rng = clamp((param(sc, 'robotRangeM') || 8) / 5 * k, 18, 120), rr = rawRobot(sc);
      robotG(x, PX(pz.x), PY(pz.y), rs, r, pz.hd, rng);
      x.font = '700 ' + clamp(rs * 0.6, 9, 12) + 'px ' + CR.font(); x.textAlign = 'center'; halo(x, r.id, PX(pz.x), PY(pz.y) + rs * 1.6, rgba(C('head')), rgba(C('surface'), 0.95), 3.5);
      if (rr && rr.investigate) { x.font = '700 ' + clamp(0.5 * k, 12, 18) + 'px ' + CR.font(); halo(x, '?', PX(pz.x) + rs * 1.2, PY(pz.y) - rs * 0.9, rgba(C('warn')), rgba(C('surface'), 0.95), 4); }
    });
  }

  /* ====================================================================================
   * 6. THE UI
   * ==================================================================================== */
  function seg(arL, enL, items, get, set) {
    var wrap = h('div', { class: 'crr-seg', role: 'group' }); lab(wrap, 'aria-label', arL, enL);
    var btns = items.map(function (it) { var b = h('button', { type: 'button', class: 'crr-segb', 'data-v': it.v, onclick: function () { set(it.v); } }, it.ic ? icon(it.ic) : null, it.ar ? bi(it.ar, it.en) : h('span', { text: it.text })); wrap.appendChild(b); return b; });
    wrap._paint = function () { var v = String(get()); btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); }); };
    return wrap;
  }
  function meter(arL, enL) { var v = h('b', { class: 'crr-mv' }), bar = h('i'); return { el: h('div', { class: 'crr-meter' }, h('span', { class: 'crr-ml' }, bi(arL, enL)), v, h('span', { class: 'crr-mbar', 'aria-hidden': 'true' }, bar)), v: v, bar: bar }; }
  function setMeter(m, text, v, tone) { setT(m.v, text); m.bar.style.setProperty('--v', Math.round(clamp(v || 0, 0, 1) * 100) + '%'); setA(m.el, 'data-tone', tone || ''); }
  function det(cl, titleAr, titleEn, open) { var d = h('details', { class: 'crr-det ' + cl }, h('summary', null, bi(titleAr, titleEn))); if (open) d.open = true; return d; }

  function build(el) {
    var d = CR.deps || {}; Sim = d.SIM || win.ManaraSim; R.root = el; el.classList.add('crr'); R.ui.root = el;
    var U = R.ui;
    if (!Sim) { el.appendChild(h('p', { class: 'note warn' }, bi('محاكاة المبنى (sim.js) لم تُحمَّل — لا يعمل الروبوت.', 'The building simulation (sim.js) did not load — the robot cannot run.'))); R.built = true; return; }
    try { WI = Sim.worldInfo(); } catch (e) { WI = null; }
    // head: what this is, honestly
    U.link = h('p', { class: 'crr-link' }); U.sim = h('span', { class: 'crr-badges' }, CR.simTag(), h('span', { class: 'tag cool', translate: 'no' }, bi('مفهوم + نموذج محاكى', 'CONCEPT + SIMULATED PROTOTYPE')));
    U.honest = h('p', { class: 'crr-honest small' }, bi('روبوت إنقاذ أرضي يدخل المباني حيث لا ينبغي أن يدخل الناس أولاً. لم يُبنَ ولم يُجرَّب في حريق، ويحتاج موافقة الجهة المختصة. يساعد، ورجال الإطفاء هم من يقرّر؛ و999 يبقى المُرسِل. المبنى مثال (سكن على طراز الدوحة) لا المبنى الحقيقي.', 'A ground rescue robot that goes into a building where people should not go first. It has not been built or tested in a fire, and a real one needs the authority\'s approval. It assists; firefighters decide; 999 stays the dispatcher. The building is a stand-in (a Doha-style residence), not the real one.'));
    U.head = h('header', { class: 'crr-head' }, h('div', { class: 'crr-title' }, icon('robot'), h('b', null, bi('روبوت الإنقاذ داخل المبنى', 'In-building rescue robot')), U.sim), U.link);
    // empty state
    U.eligible = h('div', { class: 'crr-elig' });
    U.empty = h('div', { class: 'crr-empty', role: 'status' }, icon('robot'), h('b', null, bi('الروبوت للإنقاذ داخل المبنى فقط', 'The robot is only for in-building rescue')),
      h('p', null, bi('يعمل مع إنذار حريق مبنى أو تسرّب غاز: اختر أحدهما من الطابور فيُنشأ مشهد مبنى مرتبط به. أما الفيضان والغبار والحرارة والاستغاثة في العراء فلا يدخل فيها روبوت.', 'It works with a building-fire or gas-leak alert: select one in the queue and a building scenario linked to it is created. A flood, dust, heat or an outdoor call for help gets no robot.')),
      U.eligible, h('div', { class: 'btns' }, CR.btn('btn btn-primary btn-sm', 'robot', 'افتح مبنى تجريبياً', 'Open a demo building', function () { openDemo(); })));
    // main
    U.fl = h('div', { class: 'crr-floors', role: 'group' }); lab(U.fl, 'aria-label', 'الطوابق', 'Floors');
    U.cv = h('canvas', { class: 'crr-cv', role: 'img', tabindex: '-1' }); U.sum = h('p', { class: 'sr-only', 'aria-live': 'off' });
    U.clock = h('span', { class: 'crr-clock num' }); U.truth = h('button', { type: 'button', class: 'btn btn-ghost btn-sm crr-truthb', 'aria-pressed': 'false', onclick: function () { R.truth = !R.truth; R.dirtyCanvas = R.dirtyUI = true; update(true); } }, icon('eye'), bi('أظهر حقيقة المحاكاة', 'Show simulation truth'));
    U.stage = h('div', { class: 'crr-stage' }, U.cv, h('div', { class: 'crr-stage-top' }, U.clock));
    U.legend = h('ul', { class: 'crr-legend small', 'aria-label': 'Legend' });
    [['located', 'accent'], ['safe', 'safe'], ['help', 'danger']].forEach(function (q) { U.legend.appendChild(h('li', null, h('i', { class: 'crr-sw', 'data-tok': PERSON[q[0]][0] }), bi(PERSON[q[0]][1], PERSON[q[0]][2]))); });
    U.legend.appendChild(h('li', null, h('i', { class: 'crr-sw crr-sw-hid' }), bi('رقم = غير محسوبين في الغرفة (مخفيّون)', 'number = unaccounted in the room (hidden)')));
    U.legend.appendChild(h('li', null, h('span', { class: 'crr-gl' }, 'z'), bi('نائم', 'asleep'))); U.legend.appendChild(h('li', null, h('span', { class: 'crr-gl crr-gl-w' }), bi('كرسي متحرك', 'wheelchair')));
    U.truthNote = h('p', { class: 'crr-truthnote small', hidden: true }, h('span', { class: 'tag warn', translate: 'no' }, 'SIM'), bi('الأشباح = مواقع الناس الحقيقية في المحاكاة، ولا تعرفها غرفة التحكم حتى يعثر عليهم الروبوت أو يبلّغوا من هواتفهم.', 'Ghost dots = where people really are in the simulation; the control room cannot know until the robot finds them or their phones check in.'));
    // setup row: A/B, variant, seed
    U.ab = seg('الروبوت في المشهد', 'Robot in the scenario', [{ v: 'on', ar: 'مع الروبوت', en: 'With robot' }, { v: 'off', ar: 'بلا روبوت', en: 'Without robot' }], function () { return R.cur && R.cur.robotOn ? 'on' : 'off'; }, function (v) { setRobot(v === 'on'); });
    U.variant = seg('نوع الروبوت', 'Robot type', [{ v: 'tracked', ar: 'جنزير', en: 'Tracked' }, { v: 'wheeled', ar: 'عجلات', en: 'Wheeled' }], function () { return R.cur ? R.cur.variant : R.variant; }, function (v) { restart({ variant: v }); });
    U.seed = h('input', { type: 'number', class: 'input crr-seed', min: '1', max: '9999', step: '1', id: 'crr-seed', value: '1', 'aria-describedby': 'crr-seedhint' }); lab(U.seed, 'aria-label', 'البذرة', 'Seed');
    U.seedBtn = CR.btn('btn btn-ghost btn-sm', 'reset', 'أعد التشغيل', 'Restart', function () { restart({ seed: +U.seed.value || 1 }); });
    U.setup = h('div', { class: 'crr-setup' }, U.ab, U.variant, h('label', { class: 'crr-seedw' }, h('span', { class: 'small' }, bi('البذرة', 'Seed')), U.seed), U.seedBtn);
    U.abnote = h('p', { class: 'crr-abnote small muted', id: 'crr-seedhint' }, bi('التبديل يعيد المشهد نفسه (البذرة نفسها، النار نفسها، الناس أنفسهم) حتى اللحظة نفسها مع الروبوت أو بدونه.', 'Switching re-runs the same scene (same seed, same fire, same people) to the same moment with or without the robot.'));
    // robot state machine + controls
    U.phases = h('ol', { class: 'crr-phases', 'aria-label': 'Robot state' }); U.phaseEl = {};
    PHASES.forEach(function (p, i) { var li = h('li', { 'data-p': p[0] }, h('i', { class: 'crr-pn' }, String(i + 1)), bi(p[1], p[2])); U.phaseEl[p[0]] = li; U.phases.appendChild(li); });
    U.stateTx = h('p', { class: 'crr-statetx' }); U.approval = h('p', { class: 'crr-approval small' }); U.msg = h('p', { class: 'crr-msg small', role: 'status', 'aria-live': 'polite' });
    U.bReq = CR.btn('btn btn-primary btn-sm', 'robot', 'اطلب نشر الروبوت', 'Request deployment', function () { request(); }, { 'data-needs': 'operator' });
    U.bApp = CR.btn('btn btn-safe btn-sm', 'check', 'اعتمد (قائد الحادث)', 'Approve (incident commander)', function () { approve(); }, { 'data-needs': 'commander' });
    U.bRec = CR.btn('btn btn-ghost btn-sm', 'reset', 'استدعاء', 'Recall', function () { recall(); }, { 'data-needs': 'operator' });
    [U.bReq, U.bRec].forEach(function (b) { b.appendChild(h('span', { class: 'crr-lock', 'aria-hidden': 'true' }, icon('lock'))); }); U.bApp.appendChild(h('span', { class: 'crr-lock crr-lock-c', 'aria-hidden': 'true' }, icon('lock')));
    U.bPlay = CR.btn('btn btn-ghost btn-sm', 'pause', 'إيقاف مؤقت', 'Pause', function () { R.playing = !R.playing; R.lastTs = 0; R.dirtyUI = true; update(true); }, { 'aria-pressed': 'false' });
    U.speed = seg('سرعة المحاكاة', 'Simulation speed', SPEEDS.map(function (s) { return { v: s, text: s + '×' }; }), function () { return R.speed; }, function (v) { R.speed = +v; R.dirtyUI = true; update(true); });
    U.bSkip = CR.btn('btn btn-ghost btn-sm', 'skip', '+60 ثانية', '+60 s', function () { stepBy(60); });
    U.ctl = h('div', { class: 'crr-ctl' }, U.bReq, U.bApp, U.bRec, U.bPlay, U.bSkip, U.speed);
    // telemetry
    U.mBat = meter('البطارية', 'Battery'); U.mLink = meter('الاتصال (شبكة)', 'Mesh link'); U.mCov = meter('الغرف المفتَّشة', 'Rooms searched'); U.tel2 = h('p', { class: 'crr-tel2 small muted' });
    U.tel = h('div', { class: 'crr-tel' }, U.mBat.el, U.mLink.el, U.mCov.el, U.tel2);
    // people accounted
    U.hcBar = h('div', { class: 'crr-hcbar', role: 'img' }); U.hcSeg = {};
    [['safe', 'safe', 'بأمان', 'Safe'], ['safeAway', 'safe2', 'بأمان (خارج المبنى)', 'Safe (away)'], ['located', 'accent', 'عُثر عليهم بالروبوت', 'Located by robot'], ['help', 'danger', 'يحتاجون مساعدة', 'Need help'], ['unaccounted', 'muted', 'غير محسوبين', 'Unaccounted']].forEach(function (q) { var s = h('i', { 'data-k': q[0], 'data-tok': q[1] }); U.hcSeg[q[0]] = s; U.hcBar.appendChild(s); });
    U.hcList = h('ul', { class: 'crr-hclist small' }); U.hcNum = {};
    [['safe', 'safe', 'بأمان', 'Safe'], ['located', 'accent', 'عُثر عليهم بالروبوت', 'Located by robot'], ['help', 'danger', 'يحتاجون مساعدة', 'Need help'], ['unaccounted', 'muted', 'غير محسوبين', 'Unaccounted']].forEach(function (q) { var v = h('b', { class: 'num' }); U.hcNum[q[0]] = v; U.hcList.appendChild(h('li', null, h('i', { class: 'crr-sw', 'data-tok': q[1] }), bi(q[2], q[3]), ' ', v)); });
    U.hcTx = h('p', { class: 'crr-hctx' }); U.hcNote = h('p', { class: 'small muted' }, bi('«عُثر عليه بالروبوت» خانة مستقلة عن «بأمان»: من وجده الروبوت لم يخرج بعد.', '«Located by robot» is its own bucket, never mixed with «safe»: a person the robot found has not got out yet.'));
    U.hc = h('section', { class: 'crr-sec', 'aria-label': 'People accounted' }, h('h4', null, icon('users'), bi('الناس المحسوبون', 'People accounted')), U.hcTx, U.hcBar, U.hcList, U.hcNote);
    // finds + hand-off
    U.finds = h('ul', { class: 'crr-finds', 'aria-label': 'Finds' }); U.findsEmpty = h('p', { class: 'small muted' }, bi('لم يعثر الروبوت على أحد بعد.', 'The robot has not found anyone yet.'));
    U.bHand = CR.btn('btn btn-primary btn-sm', 'send', 'سلّم الكل إلى الفرق', 'Hand off all to the crews', function () { handoff('all'); }, { 'data-needs': 'operator' }); U.bHand.appendChild(h('span', { class: 'crr-lock', 'aria-hidden': 'true' }, icon('lock')));
    U.handTx = h('p', { class: 'small muted' }, bi('التسليم رسالة على ناقل منارة {robot-find} تظهر في الاتصالات؛ 999 يبقى هو المُرسِل، وقرار الدخول للإطفائيين.', 'A hand-off is a message on the Manara bus {robot-find}, logged in comms; 999 stays the dispatcher and the firefighters decide who goes in.'));
    U.blocked = h('ul', { class: 'crr-blocked small', 'aria-label': 'Blocked' });
    U.fin = h('section', { class: 'crr-sec', 'aria-label': 'Finds' }, h('h4', null, icon('flag'), bi('ما وجده الروبوت والتسليم للفرق', 'What the robot found, and the hand-off to the crews')), U.findsEmpty, U.finds, U.blocked, h('div', { class: 'btns' }, U.bHand), U.handTx);
    // robot's eye
    U.eye = h('div', { class: 'crr-eye' }); U.eyeTx = h('p', { class: 'small' }); U.eyeList = h('ul', { class: 'crr-eyelist small' });
    U.eyeNote = h('p', { class: 'small muted' }, bi('كشف الأشخاص بالكاميرا الحرارية والصوت بقواعد بسيطة (ليس ذكاءً اصطناعياً): قد يفوته شخص (سالب كاذب) وقد يظن جسماً ساخناً شخصاً — يتحقق منه الروبوت بضع ثوانٍ ثم يسقطه (موجب كاذب).', 'People are found by thermal camera and sound with simple rules (not AI): it can miss someone (false negative) and can take a hot object for a person — it checks for a few seconds, then drops it (false positive).'));
    U.eyeBox = det('crr-d crr-eyebox', 'عين الروبوت: كشف حراري «شخص هنا» وإنذارات كاذبة', 'The robot\'s eye: thermal «someone is here» and false alarms', true); U.eyeBox.appendChild(h('div', { class: 'crr-dbody' }, U.eyeTx, U.eyeList, U.eyeNote));
    // voice
    U.sayLog = h('ul', { class: 'crr-saylog small' }); U.sayKey = h('select', { class: 'input', id: 'crr-saykey' }); lab(U.sayKey, 'aria-label', 'العبارة', 'Phrase'); U.sayLang = h('select', { class: 'input', id: 'crr-saylang' }); lab(U.sayLang, 'aria-label', 'اللغة', 'Language');
    SAYK.forEach(function (q) { U.sayKey.appendChild(h('option', { value: q[0], 'data-ar': q[1], 'data-en': q[2] })); }); LANGS.forEach(function (q) { U.sayLang.appendChild(h('option', { value: q[0], text: q[1] + (DRAFT[q[0]] ? ' *' : '') })); });
    U.bSay = CR.btn('btn btn-cool btn-sm', 'speaker', 'تكلّم عبر الروبوت', 'Speak through the robot', function () { speak(U.sayKey.value, U.sayLang.value); }, { 'data-needs': 'operator' }); U.bSay.appendChild(h('span', { class: 'crr-lock', 'aria-hidden': 'true' }, icon('lock')));
    U.sayNote = h('p', { class: 'small muted' }, bi('اللغات المعلّمة * مسودات تحتاج مراجعة متحدث أصلي. يتكلم الروبوت بلغة الشخص وصيغته (نائم: إيقاظ؛ قادر: إرشاد؛ كرسي متحرك: «ابقَ هنا»).', 'Languages marked * are drafts that need a native-speaker review. The robot speaks in the person\'s language and format (asleep: wake-up; able: guidance; wheelchair: «stay here»).'));
    U.sayBox = det('crr-d', 'التوجيه الصوتي', 'Voice guidance', false); U.sayBox.appendChild(h('div', { class: 'crr-dbody' }, U.sayLog, h('div', { class: 'crr-sayrow' }, U.sayKey, U.sayLang, U.bSay), U.sayNote));
    // A/B measured result
    U.abBtn = CR.btn('btn btn-primary btn-sm', 'chart', 'قِس 8 بذور (نحو ٢٠ ثانية)', 'Measure 8 seeds (about 20 s)', function () { measure(); }); U.abProg = h('progress', { class: 'crr-prog', max: '8', value: '0', hidden: true }); lab(U.abProg, 'aria-label', 'تقدّم القياس', 'Measuring progress');
    U.abStat = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' }); U.abOut = h('div', { class: 'crr-about' });
    U.refTx = h('ul', { class: 'crr-ref' });
    U.abBox = det('crr-d crr-abbox', 'النتيجة المقيسة: مع الروبوت وبدونه', 'The measured result: with and without the robot', true); U.abBox.appendChild(h('div', { class: 'crr-dbody' }, U.refTx, h('p', { class: 'small muted' }, bi('البذور 1–8 للمشهد «حريق ليلي + روبوت». المحاكاة تحسب الأرقام ولا تُقدَّم كدليل أثر: آلية تعمل بافتراضات مسمّاة. تشغيل القياس يجمّد الصفحة لحظات بين بذرة وأخرى.', 'Seeds 1–8 of the «night fire + robot» scenario. The simulation computes the numbers and they are not proof of impact: a mechanism under named assumptions. The measurement pauses the page briefly between seeds.')), U.abBtn, U.abProg, U.abStat, U.abOut));
    // limits
    U.limList = h('ul', { class: 'crr-limits small' });
    U.limBox = det('crr-d crr-limbox', 'حدود الروبوت (بصدق)', 'Limits of the robot (honest)', true); U.limBox.appendChild(h('div', { class: 'crr-dbody' }, U.limList));
    // event log
    U.log = h('ol', { class: 'crr-log small', 'aria-label': 'Event log' }); U.logBox = det('crr-d', 'سجل الأحداث', 'Event log', false); U.logBox.appendChild(h('div', { class: 'crr-dbody' }, U.log));
    U.main = h('div', { class: 'crr-main' }, U.setup, U.abnote, h('div', { class: 'crr-planw' }, U.fl, U.stage), U.legend, h('div', { class: 'crr-planact' }, U.truth), U.truthNote, U.sum,
      h('section', { class: 'crr-sec crr-robot', 'aria-label': 'Robot' }, h('h4', null, icon('robot'), bi('الروبوت', 'The robot')), U.phases, U.stateTx, U.approval, U.ctl, U.msg, U.tel),
      U.hc, U.fin, U.eyeBox, U.sayBox, U.abBox, U.limBox, U.logBox);
    el.appendChild(U.head); el.appendChild(U.honest); el.appendChild(U.empty); el.appendChild(U.main);
    R.ctx = U.cv.getContext('2d');
    if (win.ResizeObserver) { R.ro = new ResizeObserver(function () { resizeCanvas(); }); R.ro.observe(U.stage); }
    R.built = true;
    CR.on('select', function () { R.dirtyUI = true; if (isOn()) { syncLink(); update(true); } });
    CR.on('snapshot', function () { R.snapDirty = true; });
    CR.on('role', function () { R.dirtyUI = true; if (R.cur && R.cur.sim) syncRole(R.cur); });
    CR.on('lang', function () { R.dirtyUI = R.dirtyCanvas = true; });
    CR.on('theme', function () { R.dirtyCanvas = true; });
    CR.on('reset', function () { R.scs = {}; R.order = []; R.cur = null; R.demo = null; R.ab.res = null; R.sendSig = ''; R.dirtyUI = R.dirtyCanvas = true; });
    win.addEventListener('resize', resizeCanvas);
    update(true);
  }
  function resizeCanvas() {
    var U = R.ui; if (!U.stage || !U.cv) return;
    var r = U.stage.getBoundingClientRect(); if (r.width < 40 || r.height < 40) return;
    var w = Math.round(r.width), hh = Math.round(r.height), dpr = Math.min(2, win.devicePixelRatio || 1);
    if (w === R.w && hh === R.h && dpr === R.dpr && U.cv.width === Math.round(w * dpr)) return;
    R.w = w; R.h = hh; R.dpr = dpr; U.cv.width = Math.round(w * dpr); U.cv.height = Math.round(hh * dpr); R.dirtyCanvas = true;
  }

  /* ---- painting the DOM panels (about 4 times a second) ---- */
  function paintFloors(sc) {
    var U = R.ui, g = sc.g, key = g.si + ':' + g.floorList.join(',') + ':' + CR.lang() + ':' + R.flSel;
    if (U.fl._key !== key) {
      U.fl._key = key; U.fl.replaceChildren();
      var auto = h('button', { type: 'button', class: 'crr-flb crr-flauto', 'data-fl': 'auto', onclick: function () { R.flSel = 'auto'; R.fl = floorAuto(R.cur); R.dirtyCanvas = true; update(true); } }, bi('تلقائي', 'Auto')); lab(auto, 'title', 'يتبع الروبوت أو النار', 'Follows the robot or the fire'); U.fl.appendChild(auto);
      g.floorList.slice().reverse().forEach(function (fl) { var b = h('button', { type: 'button', class: 'crr-flb', 'data-fl': String(fl), onclick: function () { R.flSel = fl; R.fl = fl; R.dirtyCanvas = true; update(true); } }, h('span', { class: 'crr-fln', text: fl >= g.floors ? B('سطح', 'Roof') : N(fl + 1) }), h('span', { class: 'crr-flm' })); b.setAttribute('aria-label', floorLabel(g, fl)); U.fl.appendChild(b); });
    }
    var r = robotOf(sc), ff = fireFloor(sc), hcR = sc.hc && sc.hc.rooms ? sc.hc.rooms : {};
    Array.prototype.forEach.call(U.fl.children, function (b) {
      var f = b.getAttribute('data-fl'); if (f === 'auto') { setA(b, 'aria-pressed', String(R.flSel === 'auto')); return; }
      var fl = +f, un = 0; Object.keys(hcR).forEach(function (rm) { if (sc.g.roomFl[rm] === fl) un += hcR[rm].unaccounted || 0; });
      setA(b, 'aria-pressed', String(R.fl === fl)); var m = b.querySelector('.crr-flm'), tx = (r && r.pose && r.pose.fl === fl && r.state !== 'stowed' ? 'R' : '') + (un ? ' ' + N(un) + '?' : ''); setT(m, tx.trim() ? ltr(tx.trim()) : ''); setA(b, 'data-fire', fl === ff && sc.sim.hazard === 'fire' ? '1' : '0');
    });
  }
  function phaseOf(sc) {
    var r = robotOf(sc); if (!r) return { primary: null, on: {} }; var t = sc.sim.t, on = {}, p = 'idle', st = r.state;
    if (st === 'stowed' || st === 'approved') p = 'idle'; else if (st === 'deploying') p = 'deploy'; else if (st === 'searching') p = 'search'; else if (st === 'guiding') p = 'guide'; else if (st === 'holding') p = 'found'; else if (st === 'returning') p = 'return'; else if (st === 'fault') p = 'blocked';
    on[p] = 1;
    var lastFind = sc.snap.robot.finds.reduce(function (m, f) { return Math.max(m, f.t); }, -999), lastBlk = sc.snap.robot.blocked.reduce(function (m, b) { return Math.max(m, b.t); }, -999);
    if (st !== 'stowed' && st !== 'returning' && t - lastFind <= 12) on.found = 1;
    if (st !== 'stowed' && (t - lastBlk <= 15 || !r.link.up)) on.blocked = 1;
    return { primary: p, on: on };
  }
  function limitsList(sc) {
    var P = function (k, d) { var v = param(sc, k); return v == null ? d : v; }, r = robotOf(sc), wheeled = sc && sc.variant === 'wheeled', view = r && r.view, tC = view ? view.tempC : P('robotRoomC', 30), contrast = clamp((34 - tC) / P('robotContrastC', 8), 0, 1);
    var unreach = 0; if (r && r.coverage) Object.keys(r.coverage.rooms).forEach(function (rm) { if (r.coverage.rooms[rm] === 'unreachable') unreach++; });
    return [
      [B('الروبوت ذو العجلات لا يصعد الدرج: الطوابق العليا «لا يمكن الوصول إليها» ويتولاها رجال الإطفاء؛ ذو الجنزير يصعد ببطء (×' + N(P('robotStairPenalty', 2.5), 1) + ') ويستهلك بطارية أكثر.', 'A wheeled robot cannot climb stairs: the upper floors are «unreachable» and the crews take them; a tracked one climbs slower (×' + N(P('robotStairPenalty', 2.5), 1) + ') and uses more battery.'),
        B('الآن: ', 'Now: ') + (wheeled ? B('عجلات', 'wheeled') : B('جنزير', 'tracked')) + (unreach ? ' · ' + N(unreach) + B(' غرفة لا يمكن الوصول إليها', ' room(s) unreachable') : '')],
      [B('الغرف الساخنة (34 °م فأكثر) تُذهب تباين الكاميرا الحرارية: جلد الإنسان 34 °م، فالتباين = (34 − حرارة الغرفة) ÷ ' + N(P('robotContrastC', 8)) + ' ويصير صفراً عند 34. تبقى الكاميرا العادية والميكروفون، لكن الدخان يحجبهما.', 'Hot rooms (34 °C and up) leave the thermal camera no contrast: skin is 34 °C, so contrast = (34 − room temperature) ÷ ' + N(P('robotContrastC', 8)) + ' and it reaches zero at 34. The visible camera and the microphone still work, but smoke blocks them.'),
        B('التباين الآن: ', 'Contrast now: ') + ltr(N(Math.round(contrast * 100)) + '%') + B(' عند ', ' at ') + ltr(N(tC) + ' °C')],
      [B('لا يكسر الأبواب: الباب المقفل أو الممر المسدود يُبلَّغ عنه (غرفة «مقفلة») ويفتحه الإطفائيون. لا يدخل مكاناً يحترق أو أحرّ من ' + N(P('robotMaxTempC', 85)) + ' °م.', 'It does not break doors: a locked door or a blocked corridor is reported (room «locked») and the crews open it. It will not enter a place that is burning or hotter than ' + N(P('robotMaxTempC', 85)) + ' °C.'), ''],
      [B('البطارية ' + N(P('robotBattMin', 45)) + ' دقيقة (افتراض) وتعود عند ' + N(P('robotReturnPct', 25)) + '٪؛ والشبكة ' + N(P('robotMeshRangeM', 30)) + ' م وتخسر ' + N(P('robotFloorLossM', 15)) + ' م لكل طابق، وتنقطع أحياناً فتُخزَّن التقارير.', 'Battery ' + N(P('robotBattMin', 45)) + ' min (assumption), it returns at ' + N(P('robotReturnPct', 25)) + ' %; the mesh reaches ' + N(P('robotMeshRangeM', 30)) + ' m and loses ' + N(P('robotFloorLossM', 15)) + ' m per floor, and drops out at times, so reports are buffered.'), r ? B('الآن: بطارية ', 'Now: battery ') + ltr(N(Math.round(r.battery * 100)) + '%') + B('، اتصال ', ', link ') + (r.link.up ? B('يعمل', 'up') : B('مقطوع', 'down')) : ''],
      [B('إنذارات كاذبة: جسم ساخن قد يبدو شخصاً (نحو ' + N(P('robotFalsePosPerMin', 0.6), 1) + ' في الدقيقة، افتراض) فيتحقق منه الروبوت ' + N(P('robotInvestigateSec', 12)) + ' ث ثم يسقطه؛ وقد يفوته شخص في مجال رؤيته.', 'False alarms: a hot object can look like a person (about ' + N(P('robotFalsePosPerMin', 0.6), 1) + ' per minute, an assumption), so the robot checks for ' + N(P('robotInvestigateSec', 12)) + ' s and then drops it; and it can miss a person in view.'), r ? B('أُسقط حتى الآن: ', 'Dropped so far: ') + N(r.stats.falsePositives) : ''],
      [B('مفهوم ونموذج محاكى: لم يُبنَ روبوت ولم يُجرَّب في حريق، وأي روبوت حقيقي يحتاج موافقة الجهة المختصة. يساعد، ورجال الإطفاء هم من يقرّر.', 'A concept with a simulated prototype: no robot has been built or tested in a fire, and a real one needs the authority\'s approval. It assists; firefighters decide.'), '']
    ];
  }
  function paintEmpty() {
    var U = R.ui, list = S.alerts.filter(eligible), key = list.map(function (a) { return a.id; }).join(',') + CR.lang();
    if (U.eligible._key === key) return; U.eligible._key = key;
    U.eligible.replaceChildren.apply(U.eligible, list.slice(0, 6).map(function (a) { return CR.btn('btn btn-ghost btn-sm', a.hazard === 'gas' ? 'gas' : 'fire', 'اربط ' + a.id + ' — ' + CR.hzName(a.hazard), 'Link ' + a.id + ' — ' + CR.hzName(a.hazard), function () { CR.selectAlert(a.id, { fly: false }); update(true); }); }));
    U.eligible.hidden = !list.length;
  }
  function paintLink(sc) {
    var U = R.ui, a = sc ? CR.alertOf(sc.alertId) : null, sel = CR.selectedAlert();
    if (!sc) { setT(U.link, B('لا مشهد مرتبط', 'No scenario linked')); return; }
    if (a) setT(U.link, B('مرتبط بالإنذار ', 'Linked to alert ') + a.id + ' · ' + CR.hzName(a.hazard) + ' · ' + nm(a.stateName) + ' · ' + CR.placeLine(a).line + B(' — مبنى نموذجي يمثّل المبنى', ' — a stand-in building for the real one'));
    else setT(U.link, B('مبنى تجريبي (غير مرتبط بإنذار)', 'Demo building (not linked to an alert)') + (sel && eligible(sel) ? '' : ''));
  }
  function paintUI() {
    var U = R.ui, sc = R.cur; if (!U.main) return;
    U.empty.hidden = !!sc; U.main.hidden = !sc; U.honest.hidden = !!sc && false;
    U.root.setAttribute('data-rank', String(CR.roleOf(S.role).rank)); U.root.setAttribute('data-empty', sc ? '0' : '1');
    if (!sc) { paintEmpty(); paintLink(null); return; }
    var sim = sc.sim, snap = sc.snap, r = robotOf(sc), tI = sim.tIgnite || 0, on = sc.robotOn, hc = sc.hc || {};
    paintLink(sc); paintFloors(sc);
    setT(U.clock, tmss(sim.t - tI) + (sim.done ? ' · ' + B('انتهى', 'ended') : '') + ' · ' + (sim.hazard === 'gas' ? B('تسرّب غاز', 'GAS LEAK') : B('حريق', 'FIRE')));
    U.ab._paint(); U.variant._paint(); U.speed._paint(); if (document.activeElement !== U.seed) U.seed.value = String(sc.seed);
    cls(U.truth, 'is-on', R.truth); setA(U.truth, 'aria-pressed', String(R.truth)); U.truthNote.hidden = !R.truth;
    var pl = R.playing && !sim.done; setA(U.bPlay, 'aria-pressed', String(!R.playing)); var pt = U.bPlay.querySelector('.bi'); if (pt) { setT(pt.children[0], R.playing ? 'إيقاف مؤقت' : 'تشغيل'); setT(pt.children[1], R.playing ? 'Pause' : 'Play'); } if (U.bPlay._pl !== R.playing) { U.bPlay._pl = R.playing; U.bPlay.replaceChild(icon(R.playing ? 'pause' : 'play'), U.bPlay.firstChild); }
    // robot panel
    var robotSec = U.main.querySelector('.crr-robot'); setA(robotSec, 'data-off', on ? '0' : '1');
    var ph = phaseOf(sc); PHASES.forEach(function (p) { var li = U.phaseEl[p[0]]; setA(li, 'data-on', ph.on[p[0]] ? '1' : '0'); if (ph.primary === p[0]) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    if (r) {
      setT(U.stateTx, B('الحالة: ', 'State: ') + stateName(r.state) + (r.target && r.target.label ? ' — ' + B('الهدف ', 'target ') + LL(r.target.label) : '') + ' · ' + B('الموقع ', 'at ') + LL(r.pose.label));
      var ap = r.approval.status; setT(U.approval, ap === 'none' ? B('لم يُطلب النشر بعد. المشغّل يطلب، وقائد الحادث وحده يعتمد (المفتاح البشري).', 'Deployment not requested yet. An operator requests; ONLY the incident commander approves (the human key).') : ap === 'requested' ? B('بانتظار اعتماد قائد الحادث — لا يتحرك الروبوت قبله.', 'Waiting for the incident commander — the robot does not move before.') : ap === 'approved' ? B('اعتمد قائد الحادث' + (r.approval.by ? ' (' + r.approval.by + ')' : '') + '.', 'The incident commander approved' + (r.approval.by ? ' (' + r.approval.by + ')' : '') + '.') : B('رُفض النشر.', 'Deployment was declined.'));
      setT(U.eyeTx, ''); setA(U.bReq, 'aria-disabled', String(!(r.state === 'stowed' && (ap === 'none' || ap === 'rejected')))); setA(U.bApp, 'aria-disabled', String(ap !== 'requested')); setA(U.bRec, 'aria-disabled', String(r.state === 'stowed' || r.state === 'returning' || r.state === 'fault'));
      var bat = r.battery; setMeter(U.mBat, ltr(N(Math.round(bat * 100)) + '%'), bat, bat < 0.25 ? 'low' : ''); setMeter(U.mLink, r.link.up ? ltr(N(Math.round(r.link.q * 100)) + '%') : B('مقطوع', 'down') + (r.link.buffered ? ' · ' + N(r.link.buffered) + B(' محفوظ', ' buffered') : ''), r.link.up ? r.link.q : 0, r.link.up ? '' : 'low');
      setMeter(U.mCov, ltr(N(r.coverage.pct) + '%') + ' · ' + N(r.coverage.roomsSearched) + '/' + N(r.coverage.roomsTotal), r.coverage.pct / 100, '');
      setT(U.tel2, B('حرارة الهواء حوله ', 'Air around it ') + ltr(N(r.tempC) + ' °C') + ' · ' + B('مسافة ', 'driven ') + ltr(N(r.stats.distanceM) + B(' م', ' m')) + (r.stats.stairsM ? ' · ' + B('على الدرج ', 'on stairs ') + ltr(N(r.stats.stairsM) + B(' م', ' m')) : '') + ' · ' + B('عطّلته الحرارة ', 'heat soak ') + N(r.heat));
    } else {
      setT(U.stateTx, B('لا روبوت في هذا العالم (المشهد نفسه بلا روبوت للمقارنة).', 'No robot in this world (the same scene without a robot, for the comparison).')); setT(U.approval, ''); [U.bReq, U.bApp, U.bRec].forEach(function (b) { setA(b, 'aria-disabled', 'true'); });
      setMeter(U.mBat, '–', 0, ''); setMeter(U.mLink, '–', 0, ''); setMeter(U.mCov, '–', 0, ''); setT(U.tel2, '');
    }
    var m = R.msg && now() - R.msgAt < 9000 ? R.msg : null; setT(U.msg, m ? m.text : ''); setA(U.msg, 'data-ok', m ? (m.ok ? '1' : '0') : ''); U.msg.hidden = !m;
    // people accounted
    var reg = hc.registered || 0, parts = { safe: hc.safe || 0, safeAway: hc.safeAway || 0, located: hc.located || 0, help: hc.help || 0, unaccounted: hc.unaccounted || 0 }, acc = parts.safe + parts.safeAway + parts.located + parts.help;
    Object.keys(U.hcSeg).forEach(function (k2) { U.hcSeg[k2].style.setProperty('--w', (reg ? parts[k2] / reg * 100 : 0) + '%'); });
    setT(U.hcNum.safe, N(parts.safe + parts.safeAway)); setT(U.hcNum.located, on ? N(parts.located) : '–'); setT(U.hcNum.help, N(parts.help)); setT(U.hcNum.unaccounted, N(parts.unaccounted));
    setT(U.hcTx, B('محسوبون ', 'Accounted ') + N(acc) + B(' من ', ' of ') + N(reg) + ' (' + ltr(N(reg ? Math.round(acc / reg * 100) : 0) + '%') + B(' معروفة حالتهم) · غير محسوبين ', ' with a known status) · unaccounted ') + N(parts.unaccounted));
    U.hcBar.setAttribute('aria-label', B('محسوبون ', 'Accounted ') + N(acc) + '/' + N(reg));
    // finds and the hand-off
    var fs = snap.robot ? snap.robot.finds.slice().reverse() : [], sig = fs.map(function (f) { return f.id + ':' + f.action + ':' + (sc.sent[f.id] ? 1 : 0) + ':' + (f.reportedAt === null ? 0 : 1); }).join(',') + CR.lang() + CR.roleOf(S.role).rank;
    if (U.finds._sig !== sig) {
      U.finds._sig = sig;
      U.finds.replaceChildren.apply(U.finds, fs.slice(0, 8).map(function (f) {
        var needs = (f.needs || []).map(function (q) { return NEED[q] ? T2(NEED[q]) : q; }).join('، '), who = f.name ? LL(f.name) : f.registered ? B('مقيم مسجّل', 'Registered resident') : B('شخص غير مسجّل', 'Unregistered person'), sent = sc.sent[f.id], pend = f.reportedAt === null || f.reportedAt === undefined;
        var b = CR.btn('btn btn-ghost btn-sm', 'send', sent ? 'سُلِّم ✓' : pend ? 'بانتظار الاتصال' : 'سلّم', sent ? 'Handed off ✓' : pend ? 'Waiting for the link' : 'Hand off', function () { handoff(f.id); }, { 'data-needs': 'operator' });
        if (sent || pend) b.setAttribute('aria-disabled', 'true');
        return h('li', { class: 'crr-find', 'data-persona': f.persona || '' }, h('div', { class: 'crr-fh' }, h('b', { class: 'num' }, f.id), h('span', null, f.room ? B('غرفة ', 'room ') + f.room : (f.place ? LL(f.place) : '')), h('span', { class: 'crr-ft num' }, tmss(f.t - tI))),
          h('div', { class: 'crr-fb small' }, h('span', null, who + (needs ? ' · ' + needs : '')), h('span', null, B('الحالة (تقدير): ', 'Condition (est.): ') + (COND[f.condition.key] ? T2(COND[f.condition.key]) : f.condition.key)), h('span', { class: 'muted' }, (BY[f.by] ? T2(BY[f.by]) : f.by) + ' · ' + (ACT[f.action] ? T2(ACT[f.action]) : f.action) + (f.woke === true ? ' · ' + B('استيقظ', 'woke') : ''))), b);
      }));
      U.findsEmpty.hidden = !!fs.length; U.finds.hidden = !fs.length;
    }
    var bl = snap.robot ? snap.robot.blocked.slice().reverse().slice(0, 4) : [], bsig = bl.map(function (q) { return q.id; }).join(',') + CR.lang();
    if (U.blocked._sig !== bsig) { U.blocked._sig = bsig; U.blocked.replaceChildren.apply(U.blocked, bl.map(function (q) { return h('li', null, icon('lock'), h('span', null, LL(q.text))); })); }
    var nNew = snap.robot ? snap.robot.finds.filter(function (f) { return f.reportedAt !== null && f.reportedAt !== undefined && !sc.sent[f.id]; }).length : 0; setA(U.bHand, 'aria-disabled', String(!nNew));
    // the robot's eye
    var raw = rawRobot(sc), view = r && r.view, vp = view ? view.people : [], eyeSig;
    if (r && view) {
      var contrast = clamp((34 - view.tempC) / (param(sc, 'robotContrastC') || 8), 0, 1);
      setT(U.eyeTx, B('أين: ', 'Where: ') + LL(view.label) + ' · ' + B('دخان ', 'smoke ') + ltr(N(Math.round(view.smoke * 100)) + '%') + ' · ' + B('رؤية عادية ', 'visible ') + ltr(N(Math.round(view.visibility * 100)) + '%') + ' · ' + B('رؤية حرارية ', 'thermal ') + ltr(N(Math.round(view.thermalVisibility * 100)) + '%') + ' · ' + B('تباين جلد/غرفة ', 'skin/room contrast ') + ltr(N(Math.round(contrast * 100)) + '%') + ' (' + ltr(N(view.tempC) + ' °C') + ')');
      var rows = vp.slice(0, 6).map(function (q) { return h('li', { 'data-det': q.detected ? '1' : '0' }, h('b', null, q.detected ? (q.name ? LL(q.name) : B('شخص (مُعرَّف)', 'person (identified)')) : B('«شخص هنا» حراري', 'thermal «someone is here»')), h('span', null, ' · ' + ltr(N(q.distM, 1) + B(' م', ' m')) + ' · ' + B('قوة الإشارة ', 'signal ') + ltr(N(Math.round(q.strength * 100)) + '%') + ' · ' + (q.detected ? B('كُشف وسُجّل', 'detected and logged') : B('لم يُكشف بعد (قد يفوته)', 'not detected yet (it may miss them)')))); });
      if (raw && raw.investigate) rows.unshift(h('li', { 'data-det': 'fp' }, h('b', null, '? ' + B('«شخص محتمل» — يتحقق منه الروبوت', '«Possible person» — the robot is checking it')), h('span', null, ' · ' + B('قد يكون جسماً ساخناً (موجب كاذب) فيُسقَط بعد بضع ثوانٍ', 'it may be a hot object (a false positive) and will be dropped after a few seconds'))));
      eyeSig = rows.length ? rows : [h('li', { class: 'muted' }, B('لا أحد في مجال رؤية الروبوت الآن.', 'Nobody is in the robot\'s view right now.'))];
      U.eyeList.replaceChildren.apply(U.eyeList, eyeSig);
    } else { setT(U.eyeTx, r ? B('الروبوت في مكانه — لا مجال رؤية بعد.', 'The robot is stowed — no view yet.') : ''); U.eyeList.replaceChildren(); }
    // voice
    var sp = snap.robot ? snap.robot.speech.slice(-3).reverse() : [], ssig = sp.map(function (q) { return q.id; }).join(',') + CR.lang();
    if (U.sayLog._sig !== ssig) { U.sayLog._sig = ssig; U.sayLog.replaceChildren.apply(U.sayLog, sp.length ? sp.map(function (q) { return h('li', null, h('span', { class: 'num muted' }, tmss(q.t - tI) + ' '), h('b', null, (LANGS.filter(function (l) { return l[0] === q.lang; })[0] || ['', q.lang])[0].toUpperCase() + (q.draft ? '*' : '')), h('span', null, ' «' + LL(q.text) + '»'), q.operator ? h('span', { class: 'tag' }, B('المشغّل', 'operator')) : null); }) : [h('li', { class: 'muted' }, B('لم يتكلّم الروبوت بعد.', 'The robot has not spoken yet.'))]); }
    Array.prototype.forEach.call(U.sayKey.options, function (o) { setT(o, T2([o.getAttribute('data-ar'), o.getAttribute('data-en')])); });
    setA(U.bSay, 'aria-disabled', String(!r || r.state === 'stowed' || r.state === 'approved' || r.state === 'deploying' || r.state === 'fault'));
    // measured A/B, limits, log
    paintAB(); var lim = limitsList(sc), lsig = lim.map(function (q) { return q[0] + q[1]; }).join('|') + CR.lang();
    if (U.limList._sig !== lsig) { U.limList._sig = lsig; U.limList.replaceChildren.apply(U.limList, lim.map(function (q) { return h('li', null, h('span', null, q[0]), q[1] ? h('b', { class: 'crr-live' }, ' ' + q[1]) : null); })); }
    var lg = sc.log.slice(-8).reverse(), gsig = lg.length + ':' + (lg[0] ? lg[0].t + lg[0].type : '') + CR.lang();
    if (U.log._sig !== gsig) { U.log._sig = gsig; U.log.replaceChildren.apply(U.log, lg.map(function (e) { return h('li', { 'data-tone': e.tone }, h('time', { class: 'num', text: tmss(e.t - tI) }), h('span', { text: ' ' + LL(e.text) })); })); }
    var sm = U.sum; setT(sm, B('مشهد مبنى: ', 'Building scenario: ') + floorLabel(sc.g, R.fl) + '. ' + (r ? B('الروبوت: ', 'Robot: ') + stateName(r.state) + '. ' : B('بلا روبوت. ', 'No robot. ')) + B('محسوبون ', 'Accounted ') + N(acc) + '/' + N(reg) + '.');
    U.cv.setAttribute('aria-label', sm.textContent);
  }
  function paintAB() {
    var U = R.ui, ab = R.ab, res = ab.res;
    var sig = (res ? res.n : 0) + ':' + CR.lang() + ':' + (ab.running ? ab.done : -1);
    if (U.refTx._sig !== sig) {
      U.refTx._sig = sig; var src = res || null, f1 = function (v) { return ltr(N(v, 1) + B(' ث', ' s')); };
      var items = [
        [B('زمن العثور على غير المحسوبين (الوسيط): ', 'Time to locate the unaccounted (median): '), f1(REF.p50Without) + ' → ' + f1(REF.p50With), B(' — يكاد لا يتغير: هواتف المقيمين والفرق تُحصي معظمهم أصلاً.', ' — it barely changes: the residents\' phones and the crews already count most of them.')],
        [B('أبو سالم (كرسي متحرك، غرفة 302): ', 'Abu Salem (wheelchair, room 302): '), B('وجده الروبوت أولاً في ', 'the robot found him first in ') + N(REF.robotFirst) + B(' من ', ' of ') + N(REF.seeds) + B(' بذور', ' seeds'), B('؛ وسبقته الفرق في ', '; the crews got there first in ') + N(REF.crewsFirst) + B(' من ', ' of ') + N(REF.seeds) + '.'],
        [B('الفائدة مختلطة: ', 'The benefit is mixed: '), B('تتعلق بمن يصعب على الفرق إيجاده سريعاً، لا بالزمن العام.', 'it concerns the people the crews are slow to find, not the overall time.'), '']
      ];
      U.refTx.replaceChildren.apply(U.refTx, items.map(function (q) { return h('li', null, h('span', null, q[0]), h('b', null, q[1]), h('span', null, q[2])); }));
      U.refTx.appendChild(h('li', { class: 'muted small' }, B('المرجع: قياس البذور 1–8 (' + N(REF.seeds) + ' بذور). اضغط «قِس» لتحسبه الآن في متصفحك.', 'Reference: the measurement over seeds 1–8 (' + N(REF.seeds) + ' seeds). Press «Measure» to compute it now in your browser.')));
    }
    U.abProg.hidden = !ab.running; U.abProg.max = ab.total || 8; U.abProg.value = ab.done; setA(U.abBtn, 'aria-disabled', String(ab.running));
    setT(U.abStat, ab.running ? B('يقيس… ', 'Measuring… ') + N(ab.done) + '/' + N(ab.total) : res ? B('انتهى القياس الآن في متصفحك.', 'Measured just now in your browser.') : '');
    if (res && U.abOut._res !== res) {
      U.abOut._res = res; U.abOut.replaceChildren();
      U.abOut.appendChild(h('p', { class: 'crr-abres' }, h('b', null, B('نتيجتك: ', 'Your result: ')), h('span', { class: 'num' }, ltr(N(res.p50Without, 1) + ' → ' + N(res.p50With, 1) + B(' ث', ' s'))), h('span', null, B(' · أبو سالم: الروبوت أولاً في ', ' · Abu Salem: the robot first in ') + N(res.robotFirst) + B(' من ', ' of ') + N(res.n) + B('، الفرق أولاً في ', ', the crews first in ') + N(res.crewsFirst))));
      var tb = h('table', { class: 'table crr-seedtable' }, h('thead', null, h('tr', null, [['بذرة', 'seed'], ['الوسيط (ث) بلا → مع', 'median (s) w/o → with'], ['أبو سالم (ث) بلا → مع', 'Abu Salem (s) w/o → with'], ['من وجده أولاً', 'found first by']].map(function (c) { return h('th', { scope: 'col' }, bi(c[0], c[1])); }))), h('tbody', null, res.rows.map(function (x) {
        return h('tr', null, h('td', { class: 'num', text: String(x.seed) }), h('td', { class: 'num', text: ltr(N(x.p50w, 1) + ' → ' + N(x.p50r, 1)) }), h('td', { class: 'num', text: x.asW && x.asR ? ltr(N(x.asW.secOrEnd) + ' → ' + N(x.asR.secOrEnd)) : '–' }), h('td', null, x.asR ? (x.asR.byRobot ? bi('الروبوت', 'the robot') : bi('الفرق', 'the crews')) : '–'));
      })));
      U.abOut.appendChild(h('div', { class: 'table-wrap' }, tb));
    }
  }
  function update(force) {
    if (!R.built || !Sim) return;
    var tn = now(); if (!force && tn - R.paintAt < 250) return; if (!force && !R.dirtyUI && !R.snapDirty && tn - R.paintAt < 420) return;
    var vis = R.root.offsetParent !== null || R.root.getClientRects().length > 0; if (!vis && !force && R.paintAt) return;
    R.snapDirty = false; R.paintAt = tn; R.dirtyUI = false;
    syncLink(); resizeCanvas(); paintUI(); if (R.cur && R.flSel === 'auto') { var f = floorAuto(R.cur); if (f !== R.fl) { R.fl = f; R.dirtyCanvas = true; } }
    if (R.dirtyCanvas) { drawPlan(); R.dirtyCanvas = false; R.canvasAt = now(); }
  }

  /* ====================================================================================
   * 7. THE LOOP AND THE TAB
   * ==================================================================================== */
  function frame(ts) {
    if (!R.built || !Sim || !isOn() || doc.hidden) return;
    if (R.snapDirty && !R.cur) update(false);
    var sc = R.cur; if (!sc || !sc.sim) { if (R.dirtyUI || now() - R.paintAt > 700) update(false); return; }
    var t0 = now();
    if (R.playing && !sc.sim.done) {
      var dt = R.lastTs ? clamp((ts - R.lastTs) / 1000, 0, 0.1) : 0; R.acc += dt * R.speed; var n = Math.floor(R.acc);
      if (n > 0) { n = Math.min(n, 30); R.acc -= Math.floor(R.acc); var left = n; while (left > 0 && now() - t0 < 8) { Sim.step(sc.sim, 1); left--; } afterTick(sc); if (R.flSel === 'auto') { var f = floorAuto(sc); if (f !== R.fl) R.fl = f; } }
    }
    R.lastTs = ts;
    var moving = R.playing && !sc.sim.done && !CR.reduced(), burn = !CR.reduced() && sc.snap && sc.snap.hazard === 'fire';
    if (R.dirtyCanvas || ((moving || burn) && now() - R.canvasAt > 60)) { drawPlan(); R.dirtyCanvas = false; R.canvasAt = now(); }
    if (R.dirtyUI || R.snapDirty || now() - R.paintAt > 420) update(false);
  }
  function active(on) { R.active = !!on; if (on) { R.lastTs = 0; R.acc = 0; R.dirtyUI = R.dirtyCanvas = true; update(true); } }
  function tabBadge() {                                    // finds the robot has reported that the crews have not been handed yet
    var sc = R.cur; if (!sc || !sc.snap || !sc.snap.robot) return '';
    return sc.snap.robot.finds.filter(function (f) { return f.reportedAt !== null && f.reportedAt !== undefined && !sc.sent[f.id]; }).length || '';
  }
  CR.registerTab({ id: TAB, icon: 'robot', ar: 'الروبوت', en: 'Robot', build: build, update: function () { update(false); }, frame: frame, active: active, badge: tabBadge });

  /* ====================================================================================
   * 8. THE MAP BADGE AND THE TEST / AUTOMATION API  (ControlRoom.mods.robot)
   * ==================================================================================== */
  function badge() {                                        // control.js draws it beside the linked alert on the national map while the robot is working
    var sc = R.cur; if (!sc || !sc.alertId || !sc.robotOn) return null;
    var r = robotOf(sc), a = CR.alertOf(sc.alertId); if (!r || !a || (r.state === 'stowed' && r.approval.status !== 'requested')) return null;
    return { lon: a.lon, lat: a.lat, text: B('روبوت: ', 'Robot: ') + (r.state === 'stowed' ? B('بانتظار الاعتماد', 'awaiting approval') : stateName(r.state)), tok: r.state === 'stowed' ? 'info' : STATE_TOK[r.state] === 'muted' ? 'brand' : STATE_TOK[r.state] || 'accent' };
  }
  function viewOf(sc) {
    if (!sc) return null; var r = robotOf(sc), hc = sc.hc || {};
    return { key: sc.key, alert: sc.alertId, demo: sc.demo, preset: sc.preset, seed: sc.seed, variant: sc.variant, robotOn: sc.robotOn, t: sc.sim.t, tIgnite: sc.sim.tIgnite, done: sc.sim.done, state: r ? r.state : null, approval: r ? r.approval.status : null, floor: r ? r.pose.fl : null, battery: r ? r.battery : null, coverage: r ? r.coverage.pct : null,
      finds: r ? r.finds.map(function (f) { return { id: f.id, room: f.room, persona: f.persona, key: f.key, action: f.action, reportedAt: f.reportedAt }; }) : [], sent: Object.keys(sc.sent || {}), blocked: r ? r.blocked.length : 0, falsePositives: r ? r.stats.falsePositives : null, hc: { registered: hc.registered, safe: hc.safe, safeAway: hc.safeAway, help: hc.help, located: hc.located, unaccounted: hc.unaccounted },
      phase: phaseOf(sc), speechN: sc.snap && sc.snap.robot ? sc.snap.robot.speech.length : 0 };
  }
  CR.mods.robot = {
    state: R, badge: badge, eligible: eligible, scenario: function () { return viewOf(R.cur); }, sim: function () { return R.cur ? R.cur.sim : null; }, snap: function () { return R.cur ? R.cur.snap : null; }, scenarios: function () { return Object.keys(R.scs); },
    link: function (id) { var a = CR.alertOf(id); if (!a || !eligible(a)) return null; CR.selectAlert(id, { fly: false }); var sc = ensureFor(a); setCur(sc); update(true); return viewOf(sc); }, demo: function () { return viewOf(openDemo()); },
    request: request, approve: approve, recall: recall, speak: speak, handoff: handoff, setRobot: setRobot, restart: restart, step: stepBy, measure: measure, abResult: function () { return R.ab.res; }, ref: REF,
    play: function (v) { R.playing = !!v; R.lastTs = 0; R.dirtyUI = true; update(true); }, setSpeed: function (v) { R.speed = +v; R.dirtyUI = true; update(true); }, speed: function () { return R.speed; }, playing: function () { return R.playing; },
    truth: function (v) { R.truth = !!v; R.dirtyCanvas = R.dirtyUI = true; update(true); }, setFloor: function (f) { R.flSel = f; R.fl = f === 'auto' ? (R.cur ? floorAuto(R.cur) : 0) : f; R.dirtyCanvas = true; update(true); }, floor: function () { return R.fl; },
    phase: function () { return R.cur ? phaseOf(R.cur) : null; }, limits: function () { return R.cur ? limitsList(R.cur).map(function (q) { return q[0]; }) : []; }, draw: function () { drawPlan(); }, paint: function () { update(true); },
    stats: function () { return { active: isOn(), simT: R.cur ? R.cur.sim.t : null, frames: R.frames || 0 }; }
  };
})();
