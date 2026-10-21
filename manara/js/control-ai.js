/* MANARA («منارة») — CONTROL ROOM · the COMMANDER tab («القائد»)  →  ControlRoom.mods.ai                                      (js/control-ai.js)
 * =====================================================================================================================
 * User requirement (verbatim): "i need an ai comeand center".
 * WHAT THIS IS, SAID PLAINLY (also on screen, in both languages): «المساعد القائد — دعم قرار قائم على قواعد (ليس نموذج لغة)» / "Commander assistant — rule-based decision support (not a language model)".
 * It is a set of explicit IF-THEN rules that read the same simulated engine the rest of the Control Room reads (ManaraNational) and write what they found as a SITREP, as recommendations with the inputs
 * they used, and as answers to short typed commands.  It never learns, never guesses and never calls a network.  The detector of MANARA is rule-based computer vision and this assistant is rule-based too.
 * Every recommendation needs a human press on «Approve» (the human key); nothing is ever done by itself; every decision (approve / modify / dismiss / command) is written to an audit list that can be exported.
 *
 * A REAL LANGUAGE MODEL COULD BE PLUGGED IN LATER, through ONE documented hook:   ControlRoom.mods.ai.setBackend(fn)
 *   fn(prompt, context) → text | Promise<text>      prompt = what the operator typed (a string);  context = { sitrep: string, recommendations: [{rule, alert, title, confidence}], role, clock, sim: true }
 *   Default: none.  It is called ONLY when the operator types something the rules do not understand; its answer is shown with the label "external backend — not checked by the rules" and is never turned into an action.
 *   MANARA itself never opens a connection: whatever fn does is the integrator's responsibility (docs/MANARA.md, "Commander assistant").  setBackend(null) removes it.
 *
 * WHAT IT DOES
 *   BOARD            a live, auto-written SITREP (open alerts by severity and hazard, drones free / airborne / low, ground units en route with ETAs, the robot, people located / unaccounted) every ~2.5 s;
 *                    «copy» and «print»; time is the SIMULATION clock, labelled SIM.
 *   RECOMMENDATIONS  rules: verify (unconfirmed alert, a drone is free) · dispatch (confirmed alert: the fastest-by-traffic units, and why when they are farther) · tradeoff (two alerts want one unit) ·
 *                    robot (hazard + people unaccounted + robot idle; warns when the robot cannot help: stairs, hot rooms) · swap (low drone battery) · thermal (the thermal key is weak in midday heat) ·
 *                    range (no drone can reach the alert: says so) · advisory (heat / dust / flood advice to residents).  Each card: WHY + the inputs used + a confidence bar (word + number: a heuristic score,
 *                    not a probability) + Approve / Modify / Dismiss.  Approve does the real thing through ControlRoom (role gating included): launch a drone, approve the alert (the engine dispatches the plan),
 *                    deploy the robot, send the advisory on the bus.
 *   COMMANDS         a text box + chips, Arabic and English, by keyword grammar (brief · dispatch fastest to AL-2 · show gas · who is free · status of DR-03 · deploy robot · what if DR-03 is lost · why · undo · help).
 *                    An action command only adds a PROPOSAL card; unknown input says «I did not understand» and lists what it can do.  Voice output (speechSynthesis) is optional and off by default.
 *   EXPLAIN / WHAT-IF  Explain mode opens every rule's working; What-if re-runs the engine's own routing / drone ranking with a drone lost, a road blocked or a unit busy, shows the difference and restores the engine.
 *
 * MOTION   typed-in SITREP lines, cards sliding in, confidence bars growing, a gentle scan line on the board: all off for reduced motion, while the page is hidden and while the tab is not shown; no loop faster than 6 s.
 * CONTRACT CR.registerTab({id:'commander', build, update, active, badge}).  Classic script, no fetch, no libraries, never innerHTML (typed / bus / backend text only ever goes through textContent).
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, CR = win.ControlRoom;
  if (!CR || !CR.registerTab || (CR.mods && CR.mods.ai)) return;
  var h = CR.h, bi = CR.bi, lab = CR.lab, N = CR.N, nm = CR.nm, setT = CR.setT, setA = CR.setA, clamp = CR.clamp, now = CR.now, S = CR.S, icon = CR.icon, mmss = CR.mmss, B = CR.B;
  var TAB = 'commander', REFRESH_MS = 2500;
  CR.XICON.commander = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>';

  /* ====================================================================================
   * 1. SMALL HELPERS
   * ==================================================================================== */
  function T(ar, en) { return { ar: ar, en: en }; }
  function ltr(t) { return '⁦' + t + '⁩'; }                              // isolate ids, callsigns and times inside Arabic sentences
  function NNe() { return CR.deps && CR.deps.NN; }
  function pct(v) { return Math.round(clamp(v, 0, 1) * 100) + '%'; }
  function hzT(hz) { return T(CR.hzName0({ hazard: hz }, 'ar'), CR.hzName0({ hazard: hz }, 'en')); }
  function kindT(k) { var NN = NNe(), o = NN && NN.KIND_NAME && NN.KIND_NAME[k]; return o || T(k, k); }
  function placeT(a) { return a && a.place && a.place.name ? a.place.name : T('قطر', 'Qatar'); }
  function isObjT(o) { return o && typeof o === 'object' && typeof o.ar === 'string'; }
  function plain(o) { return isObjT(o) ? nm(o) : String(o == null ? '' : o); }
  function sevRank(s) { return { critical: 0, high: 1, medium: 2, low: 3 }[s] == null ? 4 : { critical: 0, high: 1, medium: 2, low: 3 }[s]; }
  var SEV_T = { critical: T('حرجة', 'Critical'), high: T('عالية', 'High'), medium: T('متوسطة', 'Medium'), low: T('منخفضة', 'Low') };
  function confWord(c) { return c < 0.4 ? T('منخفضة', 'low') : c < 0.7 ? T('متوسطة', 'medium') : T('عالية', 'high'); }
  function isRtl() { return doc.documentElement.dir === 'rtl'; }
  function motionOk() { return !CR.reduced() && !doc.hidden; }
  function droneRow(f, id) { for (var i = 0; i < f.drones.length; i++) if (f.drones[i].id === id) return f.drones[i]; return null; }
  function csOf(f, id) { var r = droneRow(f, id); return r ? r.callsign : String(id).slice(-8); }
  var ONM = { launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1 };       // a drone on a mission (not docked, not charging, not just patrolling)
  var AIRB = { launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1, returning: 1, patrol: 1 };
  var THERMAL_LOSS_C = 33;                                                          // a person's skin is ~35 °C: on ground this hot the thermal image has almost no contrast (the engine models it through droneGroundSunC)
  var ROBOT_HOT_C = 34;                                                             // the robot tab's own limit: a room this hot leaves the thermal camera no contrast
  var GUIDE = {
    heat: T('أوقفوا العمل في الخارج وقت الظهيرة، واشربوا الماء، وابحثوا عن مكان مظلَّل أو مكيَّف.', 'Stop outdoor work at midday, drink water, find a shaded or air-conditioned place.'),
    dust: T('أغلقوا النوافذ وابقوا في الداخل، وضعوا كمامة إن اضطررتم للخروج، وتجنّبوا القيادة عند ضعف الرؤية.', 'Close windows and stay indoors, wear a mask if you must go out, avoid driving when visibility is poor.'),
    flood: T('ابتعدوا عن الأنفاق والمنخفضات، ولا تقودوا في مياه جارية، وانتقلوا إلى طابق أعلى عند الحاجة.', 'Keep away from underpasses and low ground, do not drive through moving water, move upstairs if needed.')
  };
  var LEVEL_AD = { info: 'info', watch: 'watch', warning: 'warning', danger: 'danger' };

  /* ====================================================================================
   * 2. STATE
   * ==================================================================================== */
  var A = {
    recs: [], raw: {}, dismissed: {}, done: {}, forced: {}, issued: {}, undo: [], audit: [], auditSeq: 0, convo: [], lastRec: null, lastWhatIf: null,
    explain: false, voice: false, backend: null, sitrep: { lines: [], text: '', at: 0 }, cache: { oor: [], thermal: false }, lastAt: 0, active: false, built: false, ui: {}, cards: {}, lines: {}, typing: [], seq: 0, confirm: {}
  };
  var RULE = {
    verify: { ar: 'قاعدة: إنذار بمفتاح واحد (لم يُؤكَّد) ولا مسيّرة في طريقها → أرسل مسيّرة لتنظر بنفسها (الدليل قبل الذعر).', en: 'Rule: an alert with ONE key (not confirmed yet) and no drone on its way → send a drone to look (proof before panic).',
      chg: T('تتغيّر التوصية إن وصلت مسيّرة، أو لم تعد أي مسيّرة قادرة على الوصول (تصير تحذير «خارج المدى»)، أو أُغلق الإنذار.', 'It changes if a drone arrives, if no drone can reach any more (it becomes the out-of-range warning), or if the alert is closed.') },
    dispatch: { ar: 'قاعدة: إنذار مؤكَّد (مفتاحان مستقلان) وخطته ما زالت «موصى بها» → اعتمد الخطة: أسرع وحدة لكل خدمة بحسب الازدحام.', en: 'Rule: a CONFIRMED alert (two independent keys) whose plan is still only "recommended" → approve the plan: the fastest unit of each service given traffic.',
      chg: T('تتغيّر الأرقام مع الازدحام وإغلاق الطرق وانشغال الوحدات؛ وتختفي بعد الاعتماد.', 'The numbers change with traffic, road closures and busy units; it disappears once approved.') },
    tradeoff: { ar: 'قاعدة: إنذاران مفتوحان يريدان وحدة واحدة، والثاني أعلى أولوية → اقترح رفع أولويته ليعيد المحرّك الإرسال.', en: 'Rule: two open alerts want ONE unit and the second has the higher priority → propose raising its priority so the engine re-dispatches.',
      chg: T('تختفي إن أُغلق أحد الإنذارين أو أصبحت لكل إنذار وحدته.', 'It goes away if either alert closes or each alert has its own unit.') },
    robot: { ar: 'قاعدة: خطر حريق أو غاز في مبنى + أشخاص غير محسوبين + الروبوت غير منشور → اطلب نشر الروبوت (الاعتماد النهائي لقائد الحادث).', en: 'Rule: a building fire or gas hazard + people unaccounted + the robot not deployed → request the robot (the incident commander gives the final approval).',
      chg: T('تختفي حين ينتشر الروبوت أو يصير كل الأشخاص محسوبين.', 'It goes away once the robot is deployed or everyone is accounted for.') },
    robotlimit: { ar: 'قاعدة: إن كانت حدود الروبوت المعروفة (سلالم، غرف حارّة) تمنعه من المساعدة → حذّر ولا تَعِد.', en: "Rule: when the robot's known limits (stairs, hot rooms) stop it from helping → warn, do not promise.",
      chg: T('تتغيّر مع حرارة الموقع ونوع الروبوت (مجنزر أو بعجلات).', 'It changes with the heat at the site and the robot type (tracked or wheeled).') },
    swap: { ar: 'قاعدة: مسيّرة في مهمة وبطاريتها قرب الاحتياطي → أطلق مسيّرة بديلة قبل أن تعود الأولى.', en: 'Rule: a drone on a mission whose battery is near the reserve → launch a replacement before the first one turns home.',
      chg: T('تختفي إن عادت المسيّرة أو شُحنت أو لم تعد على مهمة.', 'It goes away once the drone returns, is charged, or has no mission.') },
    thermal: { ar: 'قاعدة: حرارة الأرض عند الموقع قريبة من حرارة جسم الإنسان (نحو 35 °م) → الصورة الحرارية ضعيفة؛ لا تحسبها مفتاحًا مستقلًا للأشخاص.', en: "Rule: ground at the site is close to a person's skin temperature (~35 °C) → the thermal image is weak; do not count it as an independent key for people.",
      chg: T('تختفي مع انخفاض حرارة الأرض (مساءً).', 'It goes away as the ground cools (in the evening).') },
    range: { ar: 'قاعدة: لا توجد مسيّرة تستطيع الوصول إلى الإنذار (مدى أو بطارية أو ريح أو حرارة) → قل ذلك بصراحة واقترح التحقق بوسيلة أخرى.', en: 'Rule: no drone can reach the alert (range, battery, wind or heat) → say so honestly and suggest another way to verify.',
      chg: T('تتغيّر إن صارت مسيّرة متاحة أو وصل عنصر أرضي.', 'It changes if a drone becomes free or a ground element arrives.') },
    advisory: { ar: 'قاعدة: تحذير حرارة أو غبار أو فيضان قائم (من المحرّك أو من إنذار مؤكَّد) ولم يُرسل إلى السكان → أرسل إرشادًا قصيرًا إلى الهواتف.', en: 'Rule: an active heat, dust or flood warning (from the engine or a confirmed alert) not yet sent to residents → send a short advisory to the phones.',
      chg: T('تختفي بعد الإرسال أو حين ينتهي التحذير.', 'It goes away once sent or when the warning ends.') }
  };

  /* ====================================================================================
   * 3. FACTS: what the rules read (all of it comes from the engine snapshot ControlRoom already holds)
   * ==================================================================================== */
  function facts() {
    var nat = S.nat, s = S.snap, NN = NNe(); if (!nat || !s || !NN) return null;
    var f = { nat: nat, NN: NN, s: s, t: s.t, clock: s.clock, date: s.date, hour: s.hour, drones: s.drones || [], units: s.units || [] };
    f.open = S.alerts.filter(function (a) { return !CR.isFinal(a); });
    f.free = f.drones.filter(function (d) { return d.blocked === null; });
    f.airborne = f.drones.filter(function (d) { return AIRB[d.state]; });
    f.charging = f.drones.filter(function (d) { return d.state === 'charging'; });
    f.fault = f.drones.filter(function (d) { return d.state === 'fault' || d.fault; });
    f.low = Math.max(30, ((nat.P && nat.P.droneReservePct) || 20) + 10);
    f.lowB = f.drones.filter(function (d) { return d.batteryPct <= f.low && d.state !== 'docked' && d.state !== 'charging' && d.state !== 'fault'; });
    f.incOf = function (a) { if (!a || !a.incident) return null; for (var i = 0; i < s.incidents.length; i++) if (s.incidents[i].id === a.incident) return s.incidents[i]; return null; };
    f.alertOfInc = function (id) { for (var i = 0; i < S.alerts.length; i++) if (S.alerts[i].incident === id) return S.alerts[i]; return null; };
    f.unitById = function (id) { return S.unitsById[id] || null; };
    f.droneOn = function (a) { for (var i = 0; i < f.drones.length; i++) if (f.drones[i].alert === a.id && ONM[f.drones[i].state]) return f.drones[i]; return null; };
    return f;
  }
  function envAt(f, a) { try { return f.NN.droneEnv(f.nat, a.lon, a.lat, f.t); } catch (e) { return null; } }
  function robotInfo(alertId) {                                                    // what the robot tab knows about an alert's building scenario (null = none yet)
    var m = CR.mods.robot; if (!m) return { module: false };
    var info = { module: true, exists: false, state: null, approval: null, variant: null, hc: null };
    try {
      var sc = m.state && m.state.scs ? m.state.scs['A:' + alertId] : null; if (!sc) return info;
      info.exists = true; info.variant = sc.variant || null; info.hc = sc.hc || null;
      var r = sc.snap && sc.snap.robot && sc.snap.robot.robots && sc.snap.robot.robots[0]; if (r) { info.state = r.state; info.approval = r.approval ? r.approval.status : null; }
    } catch (e) { /* the robot tab keeps its own state */ }
    return info;
  }
  function robotBusy(ri) { return !!(ri && ri.exists && ri.state && (ri.state !== 'stowed' || ri.approval === 'requested')); }

  /* ====================================================================================
   * 4. THE RULES → recommendations
   * ==================================================================================== */
  function mk(o) {
    var c = o.base, i; for (i = 0; i < (o.terms || []).length; i++) c += o.terms[i].d;
    o.conf = clamp(c, 0.05, 0.97); o.sev = o.sev || 'medium'; o.inputs = o.inputs || []; o.why = o.why || []; o.fields = o.fields || [];
    return o;
  }
  function term(ar, en, d) { return { ar: ar, en: en, d: d }; }
  function inp(ka, ke, v) { return { k: T(ka, ke), v: v }; }
  function sevOfAlert(a) { return a.level === 'critical' ? 'critical' : a.level === 'high' ? 'high' : a.level === 'medium' ? 'medium' : 'low'; }
  function aTag(a) { return a.id; }

  function buildVerify(f, a, force) {
    if (!force && (a.state !== 'SUSPECT' || a.verdict)) return null;
    if (!force && f.droneOn(a)) return null;
    if (CR.isFinal(a)) return null;
    var rank = f.NN.droneRank(f.nat, { lon: a.lon, lat: a.lat, hazard: a.hazard }, f.t);
    if (!rank.length) return buildRange(f, a);
    var d = rank[0], cs = csOf(f, d.droneId), km = (d.distM / 1000).toFixed(1), hz = hzT(a.hazard), run = rank[1];
    var why = [
      T('الإنذار ' + ltr(a.id) + ' (' + hz.ar + ') بمفتاح واحد فقط (' + a.sourceName.ar + ') ولم يُؤكَّد بعد؛ الدليل قبل الذعر يحتاج مفتاحًا ثانيًا مستقلًا، وكاميرا المسيّرة هي أسرع مفتاح.',
        'Alert ' + a.id + ' (' + hz.en + ') has one key only (' + a.sourceName.en + ') and is not confirmed yet; proof before panic needs an independent second key, and the drone camera is the fastest one.'),
      T(ltr(cs) + ' أسرع مسيّرة قادرة على المهمة: ' + km + ' كم، وصولها بعد ' + ltr(mmss(d.etaSec)) + (run ? ' (التالية ' + ltr(csOf(f, run.droneId)) + ' بعد ' + ltr(mmss(run.etaSec)) + ')' : '') + '.',
        cs + ' is the fastest drone that can do the job: ' + km + ' km, on station in ' + mmss(d.etaSec) + (run ? ' (next ' + csOf(f, run.droneId) + ' at ' + mmss(run.etaSec) + ')' : '') + '.')];
    return mk({
      key: 'verify|' + a.id, rule: 'verify', alert: a.id, sev: sevOfAlert(a), base: 0.5,
      terms: [d.etaSec <= 300 ? term('وصول خلال 5 دقائق', 'on station within 5 min', 0.2) : term('وصول يتجاوز 5 دقائق', 'on station after more than 5 min', 0.05), rank.length > 1 ? term('مسيّرة ثانية متاحة (احتياط)', 'a second drone is available (backup)', 0.1) : term('لا مسيّرة احتياطية', 'no backup drone', 0),
        term('ثقة مصدر الإنذار ' + pct(a.confidence), 'alert source confidence ' + pct(a.confidence), 0.15 * (a.confidence || 0))],
      title: T('أرسل ' + ltr(cs) + ' للتحقق من ' + ltr(a.id), 'Send ' + cs + ' to verify ' + a.id), why: why,
      inputs: [inp('حالة الإنذار', 'Alert state', a.stateName), inp('المصدر', 'Source', a.sourceName), inp('ثقة المصدر', 'Source confidence', pct(a.confidence)), inp('مسيّرات متاحة', 'Drones free', N(f.free.length)), inp('أسرع مسيّرة', 'Fastest drone', cs + ' · ' + mmss(d.etaSec) + ' · ' + km + ' km')],
      act: { type: 'verify', alert: a.id, droneId: d.droneId }, approveLabel: T('وافق: أرسل المسيّرة', 'Approve: send the drone'),
      fields: [{ id: 'drone', type: 'select', label: T('المسيّرة', 'Drone'), value: d.droneId, options: rank.slice(0, 8).map(function (r) { return { v: r.droneId, label: T(csOf(f, r.droneId) + ' · ' + mmss(r.etaSec), csOf(f, r.droneId) + ' · ' + mmss(r.etaSec)) }; }) }]
    });
  }
  function buildRange(f, a) {
    var hz = hzT(a.hazard), free = f.free, nearest = null, NN = f.NN;
    free.forEach(function (d) { var m = NN.haversineM(d.lon, d.lat, a.lon, a.lat); if (!nearest || m < nearest.m) nearest = { d: d, m: m }; });
    var why = [];
    if (!free.length) why.push(T('لا توجد أي مسيّرة متاحة الآن (كلها مشغولة أو تُشحن أو معطّلة أو الريح / الحرارة تمنع الإقلاع).', 'No drone is free right now (all are busy, charging, faulty, or wind / heat forbids launching).'));
    else {
      var rng = NN.droneRange(f.nat, nearest.d.id, f.t);
      why.push(T('الإنذار ' + ltr(a.id) + ' خارج مدى كل المسيّرات المتاحة: أقربها ' + ltr(nearest.d.callsign) + ' على بعد ' + (nearest.m / 1000).toFixed(1) + ' كم، ومداها الحالي ' + (rng == null ? '–' : rng) + ' كم (بطارية واحتياط وحرارة).',
        'Alert ' + a.id + ' is out of range of every free drone: the nearest, ' + nearest.d.callsign + ', is ' + (nearest.m / 1000).toFixed(1) + ' km away and its current range is ' + (rng == null ? '–' : rng) + ' km (battery, reserve, heat).'));
    }
    why.push(T('لا أستطيع التحقق بمسيّرة. اعتمد على بلاغ ثانٍ (حسّاس أو مواطن) أو أرسل عنصرًا أرضيًا للاستطلاع؛ والقرار لك.', 'I cannot verify this with a drone. Rely on a second report (sentinel or citizen) or send a ground element to look; the decision is yours.'));
    return mk({
      key: 'range|' + a.id, rule: 'range', alert: a.id, sev: sevOfAlert(a), base: 0.9, terms: [],
      title: T('لا مسيّرة تصل إلى ' + ltr(a.id) + ' — تحقّق بوسيلة أخرى', 'No drone can reach ' + a.id + ' — verify another way'), why: why,
      inputs: [inp('مسيّرات متاحة', 'Drones free', N(free.length) + ' / ' + N(f.drones.length)), inp('الخطر', 'Hazard', hz), inp('أقرب مسيّرة متاحة', 'Nearest free drone', nearest ? nearest.d.callsign + ' · ' + (nearest.m / 1000).toFixed(1) + ' km' : '–')],
      act: { type: 'ack', alert: a.id }, approveLabel: T('أُحيط علمًا', 'Acknowledge'), fields: []
    });
  }
  function planUnits(plan) { return plan ? plan.units.filter(function (u) { return u.unitId; }) : []; }
  function buildDispatch(f, a, force) {
    if (!force && a.state !== 'CONFIRMED') return null;
    if (CR.isFinal(a)) return null;
    var inc = f.incOf(a), plan = inc && inc.plan, preview = false;
    if (!plan) { try { plan = f.NN.dispatchNational(f.nat, { hazard: a.hazard, lon: a.lon, lat: a.lat, severity: 2 }); preview = true; } catch (e) { plan = null; } }
    if (!plan) return null;
    if (!preview && plan.state !== 'recommended') return null;
    var us = planUnits(plan), hz = hzT(a.hazard), why = [], i, slow = 0, missing = [];
    plan.units.forEach(function (u) { if (!u.unitId && !u.optional && !u.standby) missing.push(kindT(u.kind)); });
    us.forEach(function (u) {
      var wd = u.whyData || {}, k = kindT(u.kind); if (u.etaSec > slow) slow = u.etaSec;
      if (wd.farButFaster && u.why) why.push(T(k.ar + ': ' + u.name.ar + ' — ' + ltr(mmss(u.etaSec)) + '. أبعد في الخط المستقيم لكنه أسرع: ' + u.why.ar, k.en + ': ' + u.name.en + ' — ' + mmss(u.etaSec) + '. Farther in a straight line but faster: ' + u.why.en));
      else {
        var ru = u.runnerUp, extra = ru ? T(' (التالية بعد ' + ltr(mmss(ru.etaSec)) + ')', ' (runner-up at ' + mmss(ru.etaSec) + ')') : T('', '');
        why.push(T(k.ar + ': ' + u.name.ar + ' — ' + ltr(mmss(u.etaSec)) + '، الأسرع بحسب الازدحام' + extra.ar + '.', k.en + ': ' + u.name.en + ' — ' + mmss(u.etaSec) + ', fastest given traffic' + extra.en + '.'));
      }
    });
    if (missing.length) why.push(T('لا توجد وحدة متاحة من: ' + missing.map(function (k) { return k.ar; }).join('، ') + ' — ستبقى الخانة فارغة.', 'No unit is available for: ' + missing.map(function (k) { return k.en; }).join(', ') + ' — that slot stays empty.'));
    var lv = { fire: T('إخلاء', 'evacuate'), gas: T('احتماء', 'shelter in place') }[a.hazard] || T('ترقّب', 'watch');
    why.push(T('الاعتماد يرسل أيضًا الإنذار العام إلى هواتف السكان (مستوى «' + lv.ar + '»)؛ و999 تبقى هي المُرسِل.', 'Approving also sends the public alert to residents’ phones (level “' + lv.en + '”); 999 stays the dispatcher.'));
    if (a.hazard === 'gas') why.push(T('للغاز: ابتعدوا عمودًا على اتجاه الريح، لا شرر ولا مفاتيح كهرباء ولا مصاعد؛ تصل هذه الإرشادات مع الإنذار العام.', 'For gas: move crosswind, no sparks, switches or lifts; this guidance goes with the public alert.'));
    var keys = ['sensor', 'vision', 'thermal'].filter(function (k) { return a.evidence && a.evidence[k] && a.evidence[k].seen !== false; }).length;
    var terms = [a.verdict === 'confirmed' ? term('تحقق المسيّرة: مؤكَّد (مفتاحان)', 'drone verification: confirmed (two keys)', 0.3) : term('لم يُؤكَّد بمفتاحين', 'not confirmed by two keys', -0.1), slow && slow <= 360 ? term('أبطأ وحدة خلال 6 دقائق', 'slowest unit within 6 min', 0.1) : term('وحدة بطيئة أو غائبة', 'a slow or missing unit', 0), missing.length ? term('خانات فارغة', 'empty slots', -0.15) : term('كل الخانات مملوءة', 'every slot filled', 0.05)];
    if (preview) why.unshift(T('لا خطة محفوظة لهذا الإنذار بعد؛ هذه معاينة من المحرّك.', 'No saved plan for this alert yet; this is a preview from the engine.'));
    var unconf = a.state === 'SUSPECT';
    if (unconf) why.push(T('تنبيه: الإنذار لم يُؤكَّد بعد — الاعتماد بمفتاح واحد يحتاج ضغطتين.', 'Warning: the alert is not confirmed yet — approving on one key needs two presses.'));
    return mk({
      key: 'dispatch|' + a.id, rule: 'dispatch', alert: a.id, sev: sevOfAlert(a) === 'low' ? 'medium' : sevOfAlert(a), base: 0.55, terms: terms,
      title: T('اعتمد الإرسال إلى ' + ltr(a.id) + ': ' + us.map(function (u) { return kindT(u.kind).ar + ' ' + ltr(mmss(u.etaSec)); }).join(' · '), 'Approve the dispatch to ' + a.id + ': ' + us.map(function (u) { return kindT(u.kind).en + ' ' + mmss(u.etaSec); }).join(' · ')),
      why: why, inputs: [inp('حالة الإنذار', 'Alert state', a.stateName), inp('أولوية', 'Priority', N(a.priority)), inp('مفاتيح الدليل', 'Evidence keys', N(keys) + '/3'), inp('وحدات مقترحة', 'Units proposed', N(us.length)), inp('أبطأ وصول', 'Slowest ETA', slow ? mmss(slow) : '–'), inp('ازدحام المرور', 'Traffic pressure', S.snap && S.snap.traffic && S.snap.traffic.pressure != null ? pct(S.snap.traffic.pressure) : '–')],
      act: { type: 'dispatch', alert: a.id, preview: preview }, approveLabel: T('وافق: أرسل الوحدات', 'Approve: dispatch the units'),
      fields: [{ id: 'also', type: 'select', label: T('معه', 'Also'), value: '', options: [{ v: '', label: T('لا شيء', 'nothing') }, { v: 'escalate', label: T('ارفع الأولوية إلى الأعلى', 'raise priority to the top') }] }]
    });
  }
  function ruleTradeoff(f, out) {
    var NN = f.NN;
    f.open.forEach(function (b) {
      var incB = f.incOf(b), plan = incB && incB.plan; if (!plan || plan.state === 'cleared') return;
      var hit = null;
      plan.units.forEach(function (u) {
        if (hit) return; var wd = u.whyData || {}, sk = wd.skippedBusy || [];
        sk.forEach(function (uid) {
          if (hit) return; var un = f.unitById(uid); if (!un || !un.assigned || un.assigned === b.incident) return;
          var a = f.alertOfInc(un.assigned); if (!a || CR.isFinal(a) || a.id === b.id) return;
          if (b.priority <= a.priority) return;
          hit = { u: u, un: un, a: a };
        });
      });
      if (!hit) return;
      var route = null; try { route = NN.route(f.nat, { lon: hit.un.lon, lat: hit.un.lat }, { lon: b.lon, lat: b.lat }, f.t, { em: 1.3 }); } catch (e) { route = null; }
      var chosen = hit.u, k = kindT(chosen.kind), unTxt = hit.un.name;
      var driveSec = route ? route.sec : null, gain = driveSec != null && chosen.etaSec ? Math.round(chosen.etaSec - driveSec) : null;
      var why = [T(unTxt.ar + ' محجوزة للإنذار ' + ltr(hit.a.id) + ' (أولوية ' + hit.a.priority + ')، بينما ' + ltr(b.id) + ' (أولوية ' + b.priority + ') أعلى أولوية وكان يريدها.', unTxt.en + ' is committed to alert ' + hit.a.id + ' (priority ' + hit.a.priority + ') while ' + b.id + ' (priority ' + b.priority + ') is more urgent and wanted it.'),
        T('أفضل بديل متاح لـ' + ltr(b.id) + ' (' + k.ar + '): ' + chosen.name.ar + ' بعد ' + ltr(mmss(chosen.etaSec)) + (gain != null && gain > 0 ? '، بينما الوحدة المحجوزة كانت ستصل خلال نحو ' + ltr(mmss(driveSec)) + ' قيادة فقط (أسرع بنحو ' + ltr(mmss(gain)) + ').' : '.'),
          'Best free alternative for ' + b.id + ' (' + k.en + '): ' + chosen.name.en + ' at ' + mmss(chosen.etaSec) + (gain != null && gain > 0 ? ', while the committed unit would have taken about ' + mmss(driveSec) + ' of driving (about ' + mmss(gain) + ' faster).' : '.')),
        T('رفع الأولوية قرار بشري يجعل المحرّك يعيد التقييم؛ لا أنقل الوحدة بنفسي، ويمكنك متابعة النتيجة في لوحة الإرسال.', 'Raising the priority is a human decision that makes the engine re-evaluate; I do not move the unit myself, and you can follow the result in the Dispatch tab.')];
      out.push(mk({
        key: 'tradeoff|' + b.id + '|' + hit.a.id, rule: 'tradeoff', alert: b.id, sev: 'high', base: 0.5,
        terms: [term('فارق الأولوية ' + (b.priority - hit.a.priority), 'priority gap ' + (b.priority - hit.a.priority), 0.2 * Math.min(1, (b.priority - hit.a.priority) / 30)), gain != null && gain > 60 ? term('الوحدة المحجوزة أسرع بأكثر من دقيقة', 'the committed unit is more than a minute faster', 0.15) : term('فارق الزمن صغير أو مجهول', 'small or unknown time difference', 0)],
        title: T('تنازع على وحدة: ' + ltr(b.id) + ' أولى من ' + ltr(hit.a.id), 'Competing for one unit: ' + b.id + ' outranks ' + hit.a.id), why: why,
        inputs: [inp('أولوية ' + b.id, 'Priority ' + b.id, N(b.priority)), inp('أولوية ' + hit.a.id, 'Priority ' + hit.a.id, N(hit.a.priority)), inp('الوحدة المتنازع عليها', 'Contested unit', hit.un.name), inp('زمن الوحدة المحجوزة إلى ' + b.id, 'Committed unit to ' + b.id, driveSec != null ? mmss(driveSec) : '–')],
        act: { type: 'tradeoff', alert: b.id, other: hit.a.id }, approveLabel: T('وافق: ارفع أولوية ' + b.id, 'Approve: raise ' + b.id + ' priority'),
        fields: [{ id: 'target', type: 'select', label: T('ارفع أولوية', 'Raise the priority of'), value: b.id, options: [{ v: b.id, label: T(b.id, b.id) }, { v: hit.a.id, label: T(hit.a.id, hit.a.id) }] }]
      }));
    });
  }
  function buildRobot(f, a, force) {
    var m = CR.mods.robot; if (!m || !m.eligible(a)) return null;
    var ok = { CONFIRMED: 1, APPROVED: 1, DISPATCHED: 1, 'ON-SCENE': 1 }[a.state];
    if (!force && !ok) return null;
    var ri = robotInfo(a.id); if (!force && robotBusy(ri)) return null;
    var un = ri.exists && ri.hc && ri.hc.unaccounted != null ? ri.hc.unaccounted : null;
    if (!force && un === 0) return null;
    var env = envAt(f, a), hot = env && env.tempC >= ROBOT_HOT_C, hz = hzT(a.hazard);
    var why = [T('الإنذار ' + ltr(a.id) + ' (' + hz.ar + ') ' + (a.state === 'CONFIRMED' ? 'مؤكَّد' : 'قائم') + ' في مبنى، ' + (un == null ? 'ولم يُعرف عدد غير المحسوبين بعد (يُنشأ مشهد المبنى عند الاعتماد)' : 'وغير المحسوبين: ' + N(un)) + '.',
      'Alert ' + a.id + ' (' + hz.en + ') is ' + (a.state === 'CONFIRMED' ? 'confirmed' : 'active') + ' in a building, ' + (un == null ? 'and the number of people unaccounted is not known yet (the building scenario is created on approval)' : 'and people unaccounted: ' + N(un)) + '.'),
      T('الروبوت لا يدخل قبل اعتماد قائد الحادث (المفتاح البشري)، ويساعد ولا يقرّر؛ الطاقم هو من يقرّر. لا روبوت حقيقيًا بُني بعد: هذا نموذج محاكى.', 'The robot does not go in before the incident commander approves (the human key); it assists, the crews decide. No real robot has been built: this is a simulated prototype.'),
      T('حدوده: لا يصعد السلالم إن كان بعجلات (يغطي الطابق الأرضي فقط)، وتفقد كاميرته الحرارية التباين في غرفة حرارتها ' + ROBOT_HOT_C + ' °م فأكثر.', 'Its limits: a wheeled robot cannot climb stairs (ground floor only), and its thermal camera loses contrast in a room at ' + ROBOT_HOT_C + ' °C or hotter.')];
    var terms = [un != null && un > 0 ? term('أشخاص غير محسوبين: ' + un, 'people unaccounted: ' + un, 0.2) : term('العدد غير معروف بعد', 'headcount not known yet', 0.05), ri.variant === 'wheeled' ? term('روبوت بعجلات: لا يصعد السلالم', 'wheeled robot: no stairs', -0.1) : term('روبوت مجنزر (يصعد السلالم)', 'tracked robot (climbs stairs)', 0.05)];
    if (hot) terms.push(term('الحرارة هناك ' + env.tempC + ' °م: الكاميرا الحرارية ضعيفة', 'it is ' + env.tempC + ' °C there: thermal camera weak', -0.25));
    if (a.state === 'CONFIRMED') terms.push(term('الحادث مؤكَّد', 'the incident is confirmed', 0.1));
    return mk({
      key: 'robot|' + a.id, rule: 'robot', alert: a.id, sev: 'high', base: 0.5, terms: terms,
      title: T('اطلب نشر الروبوت للبحث عن غير المحسوبين في ' + ltr(a.id), 'Request the robot to search for people unaccounted at ' + a.id), why: why,
      inputs: [inp('الخطر', 'Hazard', hz), inp('حالة الإنذار', 'Alert state', a.stateName), inp('غير محسوبين', 'Unaccounted', un == null ? '?' : N(un)), inp('نوع الروبوت', 'Robot type', ri.variant === 'wheeled' ? T('بعجلات', 'wheeled') : ri.variant === 'tracked' ? T('مجنزر', 'tracked') : T('الافتراضي', 'default')), inp('حرارة الموقع', 'Site temperature', env ? env.tempC + ' °C' : '–'), inp('دورك الآن', 'Your role', CR.roleOf(S.role))],
      act: { type: 'robot', alert: a.id }, approveLabel: T('وافق: اطلب الروبوت', 'Approve: request the robot'),
      fields: [{ id: 'variant', type: 'select', label: T('نوع الروبوت', 'Robot type'), value: ri.variant || 'tracked', options: [{ v: 'tracked', label: T('مجنزر (يصعد السلالم)', 'tracked (climbs stairs)') }, { v: 'wheeled', label: T('بعجلات (لا يصعد)', 'wheeled (no stairs)') }] }]
    });
  }
  function ruleRobotLimit(f, out) {
    f.open.forEach(function (a) {
      var m = CR.mods.robot; if (!m || !m.eligible(a)) return;
      if (!({ CONFIRMED: 1, APPROVED: 1, DISPATCHED: 1, 'ON-SCENE': 1 }[a.state])) return;
      var env = envAt(f, a), ri = robotInfo(a.id), reasons = [];
      if (env && env.tempC >= ROBOT_HOT_C) reasons.push(T('حرارة الموقع ' + env.tempC + ' °م: غرف حارّة تُفقد الكاميرا الحرارية تباينها، فقد لا يرى الروبوت الأشخاص.', 'It is ' + env.tempC + ' °C at the site: hot rooms leave the thermal camera no contrast, so the robot may not see people.'));
      if (ri.variant === 'wheeled') reasons.push(T('الروبوت بعجلات ولا يصعد السلالم: الطوابق العليا خارج متناوله.', 'The robot is wheeled and cannot climb stairs: upper floors are out of its reach.'));
      if (!reasons.length) return;
      out.push(mk({
        key: 'robotlimit|' + a.id, rule: 'robotlimit', alert: a.id, sev: 'medium', base: 0.8, terms: [],
        title: T('تحذير: الروبوت قد لا يفيد في ' + ltr(a.id), 'Warning: the robot may not help at ' + a.id), why: reasons.concat([T('لا تعتمد عليه وحده في العدّ؛ اطلب من الفرق تفتيش الطوابق العليا واعتمد على تأكيدات الهواتف.', 'Do not rely on it alone for the headcount; ask the crews to search the upper floors and use the phone check-ins.')]),
        inputs: [inp('حرارة الموقع', 'Site temperature', env ? env.tempC + ' °C' : '–'), inp('حد الكاميرا الحرارية', 'Thermal limit', ROBOT_HOT_C + ' °C'), inp('نوع الروبوت', 'Robot type', ri.variant || '–')],
        act: { type: 'ack', alert: a.id }, approveLabel: T('أُحيط علمًا', 'Acknowledge'), fields: []
      }));
    });
  }
  function ruleSwap(f, out) {
    f.lowB.forEach(function (d) {
      if (!d.alert || !ONM[d.state]) return;
      var a = CR.alertOf(d.alert); if (!a || CR.isFinal(a)) return;
      var rank = f.NN.droneRank(f.nat, { lon: a.lon, lat: a.lat, hazard: a.hazard }, f.t).filter(function (r) { return r.droneId !== d.id; });
      var rep = rank[0] || null, nearReserve = d.batteryPct <= Math.max(25, f.low - 10);
      var why = [T(ltr(d.callsign) + ' على مهمة ' + ltr(a.id) + ' وبطاريتها ' + d.batteryPct + '٪ (حد التنبيه ' + f.low + '٪)؛ ستعود وحدها عند الاحتياطي فيفقد الإنذار عينه.', d.callsign + ' is on the mission for ' + a.id + ' with ' + d.batteryPct + '% battery (warning level ' + f.low + '%); it will turn home on its own at the reserve and the alert loses its eyes.')];
      if (rep) why.push(T('البديل: ' + ltr(csOf(f, rep.droneId)) + ' بعد ' + ltr(mmss(rep.etaSec)) + '؛ تُستدعى المسيّرة المنخفضة بعد وصوله.', 'Replacement: ' + csOf(f, rep.droneId) + ' at ' + mmss(rep.etaSec) + '; the low drone is recalled once it is on station.'));
      else why.push(T('لا توجد مسيّرة بديلة متاحة الآن؛ فكّر في عنصر أرضي للمراقبة.', 'No replacement drone is free right now; consider a ground element to keep watching.'));
      out.push(mk({
        key: 'swap|' + d.id, rule: 'swap', alert: a.id, sev: nearReserve ? 'high' : 'medium', base: 0.6, terms: [nearReserve ? term('البطارية قرب الاحتياطي', 'battery near the reserve', 0.25) : term('البطارية منخفضة', 'battery is low', 0.1), rep ? term('بديل متاح', 'a replacement is free', 0.05) : term('لا بديل', 'no replacement', -0.2)],
        title: rep ? T('بدّل ' + ltr(d.callsign) + ' بـ' + ltr(csOf(f, rep.droneId)) + ' عند ' + ltr(a.id), 'Swap ' + d.callsign + ' for ' + csOf(f, rep.droneId) + ' at ' + a.id) : T('بطارية ' + ltr(d.callsign) + ' منخفضة ولا بديل', d.callsign + ' battery is low and there is no replacement'), why: why,
        inputs: [inp('البطارية', 'Battery', d.batteryPct + '%'), inp('حد التنبيه', 'Warning level', f.low + '%'), inp('المسيّرة', 'Drone', d.callsign), inp('البديل', 'Replacement', rep ? csOf(f, rep.droneId) + ' · ' + mmss(rep.etaSec) : '–')],
        act: rep ? { type: 'swap', alert: a.id, droneId: rep.droneId, lowId: d.id } : { type: 'ack', alert: a.id }, approveLabel: rep ? T('وافق: بدّل المسيّرة', 'Approve: swap the drone') : T('أُحيط علمًا', 'Acknowledge'),
        fields: rep ? [{ id: 'drone', type: 'select', label: T('المسيّرة البديلة', 'Replacement drone'), value: rep.droneId, options: rank.slice(0, 6).map(function (r) { return { v: r.droneId, label: T(csOf(f, r.droneId) + ' · ' + mmss(r.etaSec), csOf(f, r.droneId) + ' · ' + mmss(r.etaSec)) }; }) }] : []
      }));
    });
  }
  function ruleThermal(f, out) {
    var any = false;
    f.open.forEach(function (a) {
      var env = envAt(f, a); if (!env || env.groundC < THERMAL_LOSS_C) return;
      var relies = (a.evidence && a.evidence.thermal) || a.hazard === 'sos' || a.hazard === 'heat'; if (!relies && a.state !== 'SUSPECT') return;
      any = true;
      out.push(mk({
        key: 'thermal|' + a.id, rule: 'thermal', alert: a.id, sev: 'medium', base: 0.75, terms: [term('حرارة الأرض ' + env.groundC + ' °م قرب حرارة الجسم', 'ground ' + env.groundC + ' °C is close to body temperature', 0.1)],
        title: T('المفتاح الحراري ضعيف عند ' + ltr(a.id) + ' الآن', 'The thermal key is weak at ' + a.id + ' right now'),
        why: [T('الأرض هناك ' + env.groundC + ' °م (الهواء ' + env.tempC + ' °م) وجسم الإنسان نحو 35 °م، فلا تباين حراري يُعتمد عليه، خصوصًا للأشخاص.', 'The ground there is ' + env.groundC + ' °C (air ' + env.tempC + ' °C) and a person is about 35 °C, so there is no dependable thermal contrast, especially for people.'),
          T('لا تحسب الصورة الحرارية مفتاحًا مستقلًا هنا؛ اعتمد على الصورة العادية وبلاغات الأرض. النار نفسها تبقى ظاهرة حراريًا لأنها أسخن بكثير.', 'Do not count the thermal image as an independent key here; use the visible image and ground reports. A fire itself still shows thermally because it is far hotter.')],
        inputs: [inp('حرارة الأرض', 'Ground', env.groundC + ' °C'), inp('حرارة الهواء', 'Air', env.tempC + ' °C'), inp('حد التباين', 'Contrast limit', THERMAL_LOSS_C + ' °C'), inp('الشمس', 'Sun load', pct(env.solar))],
        act: { type: 'ack', alert: a.id }, approveLabel: T('أُحيط علمًا', 'Acknowledge'), fields: []
      }));
    });
    A.cache.thermal = any;
  }
  function ruleAdvisory(f, out) {
    var NN = f.NN, items = [], seen = {}, adv = [];
    try { adv = NN.advisories(f.nat, f.t) || []; } catch (e) { adv = []; }
    adv.forEach(function (it) { if ((it.level === 'warning' || it.level === 'danger') && GUIDE[it.hazard]) (seen[it.hazard] = seen[it.hazard] || []).push(it); });
    f.open.forEach(function (a) {
      if (!GUIDE[a.hazard] || seen[a.hazard]) return;
      if (!({ CONFIRMED: 1, APPROVED: 1, DISPATCHED: 1, 'ON-SCENE': 1 }[a.state])) return;
      seen[a.hazard] = [{ key: 'cmd.adv.' + a.hazard, params: {}, level: 'warning', hazard: a.hazard, muni: a.muni || null, text: GUIDE[a.hazard], fromAlert: a.id }];
    });
    Object.keys(seen).forEach(function (hz) {
      var its = seen[hz], top = its[0], hzn = hzT(hz), alertId = (its[0] && its[0].fromAlert) || null, lvl = its.some(function (x) { return x.level === 'danger'; }) ? 'danger' : 'warning';
      var why = its.slice(0, 3).map(function (x) { return x.text && isObjT(x.text) ? x.text : T('تحذير ' + hzn.ar, 'Warning: ' + hzn.en); });
      why.push(T('الإرشاد الذي سيصل إلى الهواتف: ' + GUIDE[hz].ar, 'The advice that will reach the phones: ' + GUIDE[hz].en));
      why.push(T('يُرسل كرسالة «advisory» على ناقل منارة؛ تعرضها صفحة هاتف السكان كتمرين محاكى.', 'It is sent as an “advisory” message on the MANARA bus; the resident phone page shows it as a simulated exercise.'));
      out.push(mk({
        key: 'advisory|' + hz, rule: 'advisory', alert: alertId, sev: lvl === 'danger' ? 'high' : 'medium', base: { info: 0.5, watch: 0.6, warning: 0.72, danger: 0.85 }[lvl],
        terms: [alertId ? term('إنذار مؤكَّد من هذا النوع', 'a confirmed alert of this type', 0.05) : term('تحذير من نموذج الطقس والحرارة في المحرّك', "warning from the engine's weather and heat model", 0.05)],
        title: T('أرسل إرشاد ' + hzn.ar + ' إلى السكان', 'Send the ' + hzn.en + ' advisory to residents'), why: why,
        inputs: [inp('الخطر', 'Hazard', hzn), inp('المستوى', 'Level', T(lvl === 'danger' ? 'خطر' : 'تحذير', lvl)), inp('تحذيرات المحرّك', 'Engine warnings', N(its.filter(function (x) { return !x.fromAlert; }).length)), inp('المصدر', 'Source', alertId ? T('إنذار ' + alertId, 'alert ' + alertId) : T('المحرّك', 'engine'))],
        act: { type: 'advisory', hazard: hz, alert: alertId, level: lvl, items: its.map(function (x) { return { key: x.key, params: x.params || {}, level: x.level, hazard: x.hazard, muni: x.muni || null, text: x.text }; }) }, approveLabel: T('وافق: أرسل الإرشاد', 'Approve: send the advisory'),
        fields: [{ id: 'level', type: 'select', label: T('المستوى', 'Level'), value: lvl, options: [{ v: 'watch', label: T('ترقّب', 'watch') }, { v: 'warning', label: T('تحذير', 'warning') }, { v: 'danger', label: T('خطر', 'danger') }] }]
      }));
    });
  }
  function computeRecs(force) {
    var f = facts(); if (!f) return;
    var raw = [], oor = [];
    f.open.forEach(function (a) {
      var r = buildVerify(f, a, false); if (r) { raw.push(r); if (r.rule === 'range') oor.push(a.id); }
      r = buildDispatch(f, a, false); if (r) raw.push(r);
      r = buildRobot(f, a, false); if (r) raw.push(r);
    });
    ruleTradeoff(f, raw); ruleRobotLimit(f, raw); ruleSwap(f, raw); ruleThermal(f, raw); ruleAdvisory(f, raw);
    A.cache.oor = oor;
    // proposals the operator asked for by typing a command: they stay until approved or dismissed (still subject to the same human key)
    Object.keys(A.forced).forEach(function (k) {
      var fo = A.forced[k], a = CR.alertOf(fo.alert), r = null;
      if (!a || CR.isFinal(a)) { delete A.forced[k]; return; }
      if (raw.some(function (x) { return x.key === k; })) { raw.forEach(function (x) { if (x.key === k) x.src = 'command'; }); return; }
      r = fo.rule === 'verify' ? buildVerify(f, a, true) : fo.rule === 'dispatch' ? buildDispatch(f, a, true) : fo.rule === 'robot' ? buildRobot(f, a, true) : null;
      if (r) { r.src = 'command'; if (fo.drone && r.rule === 'verify' && r.fields[0] && r.fields[0].options.some(function (o) { return o.v === fo.drone; })) { r.fields[0].value = fo.drone; r.act.droneId = fo.drone; } raw.push(r); } else delete A.forced[k];
    });
    var rawKeys = {}; raw.forEach(function (r) { rawKeys[r.key] = 1; });
    Object.keys(A.dismissed).forEach(function (k) { if (!rawKeys[k]) delete A.dismissed[k]; });
    Object.keys(A.done).forEach(function (k) { if (!rawKeys[k]) delete A.done[k]; });
    var list = raw.filter(function (r) { return !A.dismissed[r.key] && !A.done[r.key]; });
    list.forEach(function (r) { var a = CR.alertOf(r.alert); r.prio = a ? a.priority : 0; });
    list.sort(function (x, y) { return sevRank(x.sev) - sevRank(y.sev) || y.prio - x.prio || (x.key < y.key ? -1 : 1); });
    A.raw = rawKeys; A.recs = list;
    return f;
  }
  function recByKey(k) { for (var i = 0; i < A.recs.length; i++) if (A.recs[i].key === k) return A.recs[i]; return null; }

  /* ====================================================================================
   * 5. ACTIONS (Approve performs the real thing through ControlRoom; role gating and the one-key confirmation stay in force)
   * ==================================================================================== */
  function okR(ar, en, extra) { var r = { ok: true, text: T(ar, en) }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function noR(ar, en, extra) { var r = { ok: false, text: T(ar, en) }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
  function roleNo() { return noR('رُفض: الدور الحالي لا يملك هذه الصلاحية (أدوار محاكاة).', 'Refused: the current role lacks this right (simulated roles).', { role: true }); }
  function reasonOf(r) { return r && r.reason ? CR.reasonText(r.reason) : ''; }
  function robotDeploy(alertId, variant) {
    var m = CR.mods.robot; if (!m) return noR('وحدة الروبوت لم تُحمَّل.', 'The robot module is not loaded.');
    var a = CR.alertOf(alertId); if (!a || !m.eligible(a)) return noR('الروبوت للحرائق والغاز داخل المباني فقط.', 'The robot is for building fires and gas only.');
    if (!m.state || !m.state.root) CR.showTab('robot');                            // the robot tab builds its simulation when it is first shown
    var v = null; try { v = m.link(alertId); } catch (e) { v = null; }
    if (!v) return noR('تعذّر تجهيز مشهد المبنى للروبوت.', 'The building scenario for the robot could not be prepared.');
    if (variant && v.variant !== variant) m.restart({ variant: variant });
    var rq = m.request(); if (!rq || rq.ok === false) return rq && rq.code === 'role' ? roleNo() : noR('رفض المحرّك الطلب: ' + (rq && rq.reason && rq.reason.ar ? rq.reason.ar : '–'), 'The engine refused the request: ' + (rq && rq.reason && rq.reason.en ? rq.reason.en : '–'));
    if (CR.can('commander')) { var ap = m.approve(); if (ap && ap.ok !== false) return okR('طُلب الروبوت واعتمده قائد الحادث — يبدأ النشر (محاكاة).', 'The robot was requested and the incident commander approved — it is deploying (SIM).'); }
    return okR('طُلب الروبوت؛ بانتظار اعتماد قائد الحادث (هو وحده يملك المفتاح البشري للدخول).', 'The robot was requested; waiting for the incident commander (only they hold the human key to send it in).', { pending: true });
  }
  function sendAdvisory(act, level) {
    if (!CR.need('operator', 'إرسال إرشاد إلى السكان', 'send an advisory to residents')) return roleNo();
    var NN = NNe(), msg = null; try { msg = NN.busAdvisory(S.nat); } catch (e) { msg = null; }
    var items = msg && msg.items ? msg.items.filter(function (x) { return x.hazard === act.hazard; }) : [];
    if (!items.length) items = (act.items || []).map(function (x) { return { key: x.key, params: x.params || {}, level: x.level, hazard: x.hazard, muni: x.muni || null, text: x.text }; });
    items = items.map(function (x) { return Object.assign({}, x, { level: LEVEL_AD[level || x.level] || x.level }); });
    if (!items.length) return noR('لا يوجد إرشاد لإرساله.', 'There is no advisory to send.');
    var m = { type: 'advisory', scope: 'national', id: 'ADV-' + Math.floor(S.snap ? S.snap.t : 0) + '-' + act.hazard, clock: S.snap ? S.snap.clock : '', items: items, sim: true };
    var hz = hzT(act.hazard), e = CR.busSend(m, 'advisory', 'إلى الهواتف: إرشاد ' + hz.ar + ' من المساعد القائد', 'To the phones: ' + hz.en + ' advisory from the commander assistant');
    A.issued[act.hazard] = S.snap ? S.snap.t : 0;
    return e === null ? noR('تعذّر الإرسال: ناقل منارة غير متاح.', 'Could not send: the MANARA bus is not available.') : okR('أُرسل إرشاد ' + hz.ar + ' إلى الهواتف (تمرين محاكى).', 'The ' + hz.en + ' advisory was sent to the phones (simulated exercise).');
  }
  function perform(rec, vals) {
    vals = vals || {}; var act = rec.act, r, a = CR.alertOf(act.alert);
    switch (act.type) {
      case 'verify':
        r = CR.launchDrone(act.alert, vals.drone || act.droneId);
        if (r && r.ok) { A.undo.push({ kind: 'launch', droneId: r.droneId, alert: act.alert }); return okR('أُطلقت ' + r.drone.name.ar + ' للتحقق من ' + act.alert + ' — وصول بعد ' + mmss(r.etaSec) + '.', r.drone.name.en + ' launched to verify ' + act.alert + ' — on station in ' + mmss(r.etaSec) + '.', { drone: r.droneId }); }
        return r && r.code === 'role' ? roleNo() : noR('لم تُطلق مسيّرة: ' + (reasonOf(r) || '–'), 'No drone was launched: ' + (r && r.reason ? CR.reasonText(r.reason) : '–'));
      case 'dispatch':
        if (!a) return noR('الإنذار لم يعد موجودًا.', 'The alert no longer exists.');
        r = CR.approveAlert(act.alert);
        if (r && r.confirm) return noR('الإنذار لم يُؤكَّد بعد: اضغط «وافق» مرة أخرى للتأكيد (مفتاح واحد فقط).', 'The alert is not confirmed: press Approve again to confirm (one key only).', { confirm: true });
        if (r && r.ok) { if (vals.also === 'escalate') CR.escalateAlert(act.alert); return okR('اعتُمد الإرسال إلى ' + act.alert + ' — المحرّك يُرسل الخطة والهواتف تستقبل الإنذار العام (محاكاة).', 'Dispatch to ' + act.alert + ' approved — the engine sends the plan and the phones receive the public alert (SIM).'); }
        return r && r.code === 'role' ? roleNo() : noR('لم يُعتمد الإرسال (' + (r && r.reason ? String(r.reason) : '–') + ').', 'The dispatch was not approved (' + (r && r.reason ? String(r.reason) : '–') + ').');
      case 'tradeoff':
        r = CR.escalateAlert(vals.target || act.alert);
        return r && r.ok ? okR('رُفعت أولوية ' + (vals.target || act.alert) + ' إلى الأعلى؛ سيعيد المحرّك تقييم الوحدات (راجع لوحة الإرسال).', 'Priority of ' + (vals.target || act.alert) + ' raised to the top; the engine will re-evaluate the units (see the Dispatch tab).') : (r && r.code === 'role' ? roleNo() : noR('تعذّر رفع الأولوية.', 'The priority could not be raised.'));
      case 'robot': return robotDeploy(act.alert, vals.variant);
      case 'swap':
        r = CR.launchDrone(act.alert, vals.drone || act.droneId);
        if (r && r.ok) { A.undo.push({ kind: 'launch', droneId: r.droneId, alert: act.alert }); CR.recallDrone(act.lowId); return okR('أُطلقت ' + r.drone.name.ar + ' بديلًا واستُدعيت المسيّرة المنخفضة.', r.drone.name.en + ' launched as the replacement and the low drone was recalled.'); }
        return r && r.code === 'role' ? roleNo() : noR('تعذّر التبديل: ' + (reasonOf(r) || '–'), 'The swap failed: ' + (r && r.reason ? CR.reasonText(r.reason) : '–'));
      case 'advisory': return sendAdvisory(act, vals.level);
      default: return okR('سُجّل العلم بالتوصية.', 'Acknowledged and logged.');
    }
  }

  /* ====================================================================================
   * 6. AUDIT: every decision, who / what / why
   * ==================================================================================== */
  function who() { var r = CR.roleOf(S.role); return T(r.ar + ' (دور محاكى)', r.en + ' (simulated role)'); }
  function logAudit(kind, rec, result, extra) {
    var s = S.snap, e = { id: ++A.auditSeq, wall: Date.now(), iso: new Date().toISOString(), clock: s ? s.clock : '', kind: kind, role: S.role, who: who(), rule: rec ? rec.rule : (extra && extra.rule) || null, alert: rec ? rec.alert : (extra && extra.alert) || null,
      title: rec ? rec.title : (extra && extra.title) || T('', ''), why: rec && rec.why[0] ? rec.why[0] : (extra && extra.why) || T('', ''), inputs: rec ? rec.inputs.map(function (i) { return plain(i.k) + ': ' + plain(i.v); }) : [], confidence: rec ? Math.round(rec.conf * 100) : null,
      result: result ? (result.ok ? 'ok' : 'failed') : 'n/a', detail: result ? result.text : (extra && extra.detail) || T('', ''), src: rec && rec.src ? rec.src : (extra && extra.src) || 'rule', values: extra && extra.values ? extra.values : null };
    A.audit.push(e); if (A.audit.length > 400) A.audit.shift();
    var kar = { approve: 'اعتماد', modify: 'تعديل ثم اعتماد', dismiss: 'رفض', command: 'أمر', undo: 'تراجع', ack: 'علم' }[kind] || kind;
    CR.logOp('operator', 'المساعد القائد (' + kar + '): ' + e.title.ar + (result ? ' — ' + (result.ok ? 'نُفّذ' : 'لم يُنفَّذ') : ''), 'Commander assistant (' + kind + '): ' + e.title.en + (result ? ' — ' + (result.ok ? 'done' : 'not done') : ''), { alert: e.alert || null, ai: true });
    if (kind === 'approve' || kind === 'modify' || kind === 'dismiss') CR.decision('assistant-' + kind, 'المساعد القائد: ' + kar + ' — ' + e.title.ar, 'Commander assistant: ' + kind + ' — ' + e.title.en, { alert: e.alert || undefined });
    if (A.ui.audit) renderAudit();
    return e;
  }
  function auditObject() {
    return { exported: new Date().toISOString(), app: 'MANARA Control Room — commander assistant (rule-based decision support, not a language model)', sim: true, note: 'Simulation exercise. Roles are simulated labels; 999 stays the dispatcher.', count: A.audit.length,
      entries: A.audit.map(function (e) { return { n: e.id, time: e.iso, simClock: e.clock, role: e.role, who: plain(e.who), action: e.kind, rule: e.rule, alert: e.alert, title: { ar: e.title.ar, en: e.title.en }, why: { ar: e.why.ar, en: e.why.en }, inputs: e.inputs, confidencePct: e.confidence, result: e.result, detail: { ar: e.detail.ar, en: e.detail.en }, source: e.src, values: e.values }; }) };
  }
  function auditCsv() {
    function q(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var rows = [['n', 'time', 'sim_clock', 'role', 'action', 'rule', 'alert', 'title_ar', 'title_en', 'why_en', 'confidence_pct', 'result', 'detail_en', 'source']];
    A.audit.forEach(function (e) { rows.push([e.id, e.iso, e.clock, e.role, e.kind, e.rule, e.alert, e.title.ar, e.title.en, e.why.en, e.confidence, e.result, e.detail.en, e.src]); });
    return '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
  }

  /* ====================================================================================
   * 7. THE SITREP (live text, written by rules from the engine snapshot)
   * ==================================================================================== */
  function buildSitrep() {
    var f = facts(); if (!f) return [];
    var L = [], open = f.open, i;
    var clock = (f.clock || '').slice(0, 8);
    L.push({ id: 'head', quiet: true, ar: 'تقرير الموقف — ' + ltr(clock) + ' (محاكاة) · ' + ltr(f.date || ''), en: 'SITREP — ' + clock + ' (SIM) · ' + (f.date || ''), tone: 'head' });
    // alerts
    if (!open.length) L.push({ id: 'alerts', ar: 'لا إنذارات مفتوحة الآن.', en: 'No open alerts right now.', tone: 'ok' });
    else {
      var bySev = { critical: 0, high: 0, medium: 0, low: 0 }, byHz = {}; open.forEach(function (a) { bySev[a.level] = (bySev[a.level] || 0) + 1; byHz[a.hazard] = (byHz[a.hazard] || 0) + 1; });
      var sevPartsAr = [], sevPartsEn = []; ['critical', 'high', 'medium', 'low'].forEach(function (s) { if (bySev[s]) { sevPartsAr.push(SEV_T[s].ar + ' ' + bySev[s]); sevPartsEn.push(SEV_T[s].en.toLowerCase() + ' ' + bySev[s]); } });
      var hzAr = [], hzEn = []; CR.HZ_ORDER.forEach(function (z) { if (byHz[z]) { hzAr.push(hzT(z).ar + ' ' + byHz[z]); hzEn.push(hzT(z).en.toLowerCase() + ' ' + byHz[z]); } });
      L.push({ id: 'alerts', ar: 'الإنذارات المفتوحة: ' + open.length + ' — ' + sevPartsAr.join(' · ') + ' — حسب الخطر: ' + hzAr.join('، '), en: 'Open alerts: ' + open.length + ' — ' + sevPartsEn.join(' · ') + ' — by hazard: ' + hzEn.join(', '), tone: bySev.critical ? 'bad' : bySev.high ? 'warn' : '' });
      open.slice(0, 3).forEach(function (a) {
        var d = f.droneOn(a), pl = placeT(a), inc = f.incOf(a), pu = inc && inc.plan && planUnits(inc.plan)[0];
        L.push({ id: 'al:' + a.id, ar: ltr(a.id) + ' · ' + hzT(a.hazard).ar + ' · قرب ' + pl.ar + ' · ' + a.stateName.ar + ' · أولوية ' + a.priority + (d ? ' · ' + ltr(d.callsign) + ' (' + d.stateText.ar + ')' : ''),
          en: a.id + ' · ' + hzT(a.hazard).en + ' · near ' + pl.en + ' · ' + a.stateName.en + ' · priority ' + a.priority + (d ? ' · ' + d.callsign + ' (' + d.stateText.en + ')' : ''), tone: a.level === 'critical' ? 'bad' : a.level === 'high' ? 'warn' : '' });
      });
      if (open.length > 3) L.push({ id: 'more', ar: 'و ' + (open.length - 3) + ' إنذارات أخرى في الطابور.', en: 'and ' + (open.length - 3) + ' more in the queue.', tone: '' });
    }
    // drones
    var oor = A.cache.oor || [];
    L.push({ id: 'drones', ar: 'المسيّرات: متاحة ' + f.free.length + ' من ' + f.drones.length + ' · في الجو ' + f.airborne.length + ' · تُشحن ' + f.charging.length + ' · أعطال ' + f.fault.length + ' · بطارية منخفضة ' + f.lowB.length + (oor.length ? ' · خارج المدى: ' + oor.map(ltr).join('، ') : ''),
      en: 'Drones: ' + f.free.length + ' free of ' + f.drones.length + ' · airborne ' + f.airborne.length + ' · charging ' + f.charging.length + ' · faults ' + f.fault.length + ' · low battery ' + f.lowB.length + (oor.length ? ' · out of range: ' + oor.join(', ') : ''), tone: oor.length || f.lowB.length ? 'warn' : '' });
    // ground units en route
    var er = [], idle = {}; f.units.forEach(function (u) { if (u.state === 'idle' && !u.busy && !u.assigned) idle[u.kind] = (idle[u.kind] || 0) + 1; });
    S.snap.incidents.forEach(function (inc) { if (!inc.plan || inc.status === 'cleared' || inc.status === 'cancelled') return; inc.plan.units.forEach(function (u) { if (u.unitId && ({ approved: 1, dispatched: 1, 'en-route': 1 })[u.state]) er.push({ inc: inc, u: u, a: f.alertOfInc(inc.id) }); }); });
    er.sort(function (x, y) { return (x.u.etaSec || 0) - (y.u.etaSec || 0); });
    if (er.length) L.push({ id: 'units', ar: 'وحدات في الطريق: ' + er.length + ' — ' + er.slice(0, 3).map(function (e) { return kindT(e.u.kind).ar + ' ' + ltr(mmss(e.u.etaSec)) + (e.a ? ' ← ' + ltr(e.a.id) : ''); }).join('، '), en: 'Units en route: ' + er.length + ' — ' + er.slice(0, 3).map(function (e) { return kindT(e.u.kind).en + ' ETA ' + mmss(e.u.etaSec) + (e.a ? ' → ' + e.a.id : ''); }).join(', '), tone: '' });
    else L.push({ id: 'units', ar: 'لا وحدات أرضية في الطريق · متاحة: ' + ['fire', 'rescue', 'ambulance', 'police'].map(function (k) { return kindT(k).ar + ' ' + (idle[k] || 0); }).join(' · '), en: 'No ground unit en route · free: ' + ['fire', 'rescue', 'ambulance', 'police'].map(function (k) { return kindT(k).en.toLowerCase() + ' ' + (idle[k] || 0); }).join(' · '), tone: '' });
    // robot + people
    var rob = CR.mods.robot, RS = { stowed: T('في مكانه', 'stowed'), approved: T('معتمد', 'approved'), deploying: T('يُنشَر', 'deploying'), searching: T('يبحث', 'searching'), guiding: T('يرشد', 'guiding'), holding: T('متوقف', 'holding'), returning: T('عائد', 'returning'), fault: T('عطل', 'fault') };
    var sc = rob ? rob.scenario() : null, ri = sc && sc.alert ? robotInfo(sc.alert) : null;
    if (!rob) L.push({ id: 'robot', ar: 'الروبوت: الوحدة غير محمّلة.', en: 'Robot: module not loaded.', tone: 'warn' });
    else if (!sc || !sc.alert && !sc.demo) L.push({ id: 'robot', ar: 'الروبوت: غير منشور (يُجهَّز عند طلبه لحريق أو غاز في مبنى).', en: 'Robot: not deployed (it is prepared when requested for a building fire or gas).', tone: '' });
    else {
      var rs = RS[sc.state] || T(sc.state || '–', sc.state || '–'), pend = sc.approval === 'requested';
      L.push({ id: 'robot', ar: 'الروبوت' + (sc.alert ? ' (' + ltr(sc.alert) + ')' : ' (مبنى تجريبي)') + ': ' + (pend ? 'بانتظار اعتماد قائد الحادث' : rs.ar) + (sc.battery != null ? ' · بطارية ' + Math.round(sc.battery * (sc.battery <= 1 ? 100 : 1)) + '٪' : ''), en: 'Robot' + (sc.alert ? ' (' + sc.alert + ')' : ' (demo building)') + ': ' + (pend ? 'waiting for the incident commander' : rs.en) + (sc.battery != null ? ' · battery ' + Math.round(sc.battery * (sc.battery <= 1 ? 100 : 1)) + '%' : ''), tone: pend ? 'warn' : '' });
    }
    var hc = sc && sc.hc ? sc.hc : null, ph = S.phone || { safe: 0, help: 0 };
    if (hc && hc.registered != null) L.push({ id: 'people', ar: 'الأشخاص (مشهد المبنى — محاكاة): مسجّلون ' + hc.registered + ' · بأمان ' + hc.safe + ' · عُثر عليهم بالروبوت ' + (hc.located || 0) + ' · غير محسوبين ' + hc.unaccounted + ' · طلب مساعدة ' + hc.help, en: 'People (building scenario, SIM): registered ' + hc.registered + ' · safe ' + hc.safe + ' · located by robot ' + (hc.located || 0) + ' · unaccounted ' + hc.unaccounted + ' · asked for help ' + hc.help, tone: hc.unaccounted ? 'warn' : 'ok' });
    else L.push({ id: 'people', ar: 'الأشخاص: لا عدّ لمبنى بعد (لا مشهد مرتبط). تأكيدات الهواتف: بأمان ' + ph.safe + ' · طلب مساعدة ' + ph.help, en: 'People: no building headcount yet (no scenario linked). Phone check-ins: safe ' + ph.safe + ' · asked for help ' + ph.help, tone: ph.help ? 'warn' : '' });
    // conditions
    var cond = [], condEn = [];
    if (A.cache.thermal) { cond.push('الأرض حارّة: المفتاح الحراري ضعيف'); condEn.push('hot ground: the thermal key is weak'); }
    var adv = []; try { adv = f.NN.advisories(f.nat, f.t) || []; } catch (e) { adv = []; }
    if (adv.length) { cond.push('تحذيرات الطقس والحرارة: ' + adv.length); condEn.push('weather / heat advisories: ' + adv.length); }
    if (S.snap.traffic && S.snap.traffic.pressure != null) { cond.push('ضغط المرور ' + pct(S.snap.traffic.pressure)); condEn.push('traffic pressure ' + pct(S.snap.traffic.pressure)); }
    if (cond.length) L.push({ id: 'cond', ar: 'الظروف: ' + cond.join(' · '), en: 'Conditions: ' + condEn.join(' · '), tone: A.cache.thermal || adv.length ? 'warn' : '' });
    L.push({ id: 'pending', ar: 'توصيات بانتظار قرارك: ' + A.recs.length + (A.recs.length ? ' (الأعلى: ' + A.recs[0].title.ar + ')' : ''), en: 'Recommendations waiting for your decision: ' + A.recs.length + (A.recs.length ? ' (top: ' + A.recs[0].title.en + ')' : ''), tone: A.recs.length ? 'warn' : 'ok' });
    L.push({ id: 'foot', quiet: true, ar: 'كل الأرقام محاكاة (SIM). دعم قرار بقواعد وليس نموذج لغة؛ 999 تبقى هي المُرسِل.', en: 'All figures are simulation (SIM). Rule-based decision support, not a language model; 999 stays the dispatcher.', tone: 'fine' });
    return L;
  }
  function sitrepText(lines, lang) {
    lines = lines || A.sitrep.lines; var l = lang || CR.lang();
    return lines.map(function (x) { return (x.tone === 'head' ? '' : '- ') + (l === 'en' ? x.en : x.ar).replace(/[⁦⁩]/g, ''); }).join('\n');
  }

  /* ====================================================================================
   * 8. WHAT-IF (re-runs the engine's own routing / drone ranking, shows the difference, restores the engine)
   * ==================================================================================== */
  function whatIf(spec) {
    var f = facts(); if (!f) return noR('المحرّك غير جاهز.', 'The engine is not ready.');
    var NN = f.NN, a = CR.alertOf(spec.alert) || f.open[0]; if (!a) return noR('لا إنذار مفتوح لتجربته.', 'There is no open alert to test.');
    var res = { kind: spec.kind, alert: a.id, rows: [], verdict: null, restored: true, title: null }, hz = hzT(a.hazard);
    if (spec.kind === 'drone') {
      var tg = { lon: a.lon, lat: a.lat, hazard: a.hazard }, base = NN.droneRank(f.nat, tg, f.t), lost = null, i;
      for (i = 0; i < f.drones.length; i++) if (f.drones[i].id === spec.drone || f.drones[i].callsign === spec.drone) lost = f.drones[i];
      if (!lost) return noR('مسيّرة غير معروفة.', 'Unknown drone.');
      var after = base.filter(function (r) { return r.droneId !== lost.id; }), pos = -1; base.forEach(function (r, ix) { if (r.droneId === lost.id) pos = ix; });
      res.title = T('ماذا لو فُقدت ' + lost.callsign + '؟ (' + a.id + ')', 'What if ' + lost.callsign + ' is lost? (' + a.id + ')');
      res.rows.push({ k: T('أسرع مسيّرة قادرة', 'Fastest capable drone'), a: base[0] ? csOf(f, base[0].droneId) + ' · ' + mmss(base[0].etaSec) : T('لا أحد', 'none'), b: after[0] ? csOf(f, after[0].droneId) + ' · ' + mmss(after[0].etaSec) : T('لا أحد', 'none') });
      res.rows.push({ k: T('مسيّرات قادرة', 'Drones that can reach'), a: String(base.length), b: String(after.length) });
      var mission = f.drones.filter(function (d) { return d.id === lost.id && d.alert === a.id && ONM[d.state]; })[0];
      if (mission) res.rows.push({ k: T('مهمة التحقق الجارية', 'Verification now under way'), a: T('تعمل بـ' + lost.callsign, 'running on ' + lost.callsign), b: after[0] ? T('تحتاج بديلًا بعد ' + mmss(after[0].etaSec), 'needs a replacement in ' + mmss(after[0].etaSec)) : T('تتوقف: لا بديل', 'stops: no replacement') });
      if (pos < 0) res.verdict = T(lost.callsign + ' لا تستطيع الوصول إلى ' + a.id + ' أصلًا، فلا يتغيّر شيء لهذا الإنذار.', lost.callsign + ' could not reach ' + a.id + ' anyway, so nothing changes for this alert.');
      else if (!after.length) res.verdict = T('لن تستطيع أي مسيّرة الوصول: التحقق يعتمد على بلاغ آخر أو عنصر أرضي.', 'No drone could reach: verification would depend on another report or a ground element.');
      else if (pos === 0) res.verdict = T('الفرق: ' + ltr(mmss(after[0].etaSec - base[0].etaSec)) + ' أبطأ (' + ltr(csOf(f, after[0].droneId)) + ' تحل محلها).', 'Difference: ' + mmss(after[0].etaSec - base[0].etaSec) + ' slower (' + csOf(f, after[0].droneId) + ' takes over).');
      else res.verdict = T(lost.callsign + ' لم تكن الأسرع (الترتيب ' + (pos + 1) + ')، فلا يتغيّر زمن الوصول.', lost.callsign + ' was not the fastest (rank ' + (pos + 1) + '), so the arrival time does not change.');
      res.delta = pos === 0 && after[0] ? after[0].etaSec - base[0].etaSec : 0;
    } else {
      var kind = { fire: 'fire', gas: 'fire', flood: 'rescue', dust: 'ambulance', heat: 'ambulance', sos: 'ambulance' }[a.hazard] || 'fire', inc = f.incOf(a), plan = inc && inc.plan, cands = [], scene = { lon: a.lon, lat: a.lat };
      if (plan) { var pu = plan.units.filter(function (u) { return u.unitId; })[0]; if (pu) kind = pu.kind; }
      f.units.forEach(function (u) { if (u.kind === kind && ((u.state === 'idle' && !u.busy && !u.assigned) || (inc && u.assigned === inc.id))) cands.push({ u: u, m: NN.haversineM(u.lon, u.lat, a.lon, a.lat) }); });
      cands.sort(function (x, y) { return x.m - y.m; }); cands = cands.slice(0, 12);
      var rank = function () { var out = []; cands.forEach(function (c) { var r = null; try { r = NN.route(f.nat, { lon: c.u.lon, lat: c.u.lat }, scene, f.t, { em: 1.3 }); } catch (e) { r = null; } if (r) out.push({ u: c.u, sec: r.sec, route: r }); }); out.sort(function (x, y) { return x.sec - y.sec; }); return out; };
      var b0 = rank(); if (!b0.length) return noR('لا وحدات من هذا النوع متاحة لتجربة المسار.', 'No unit of that type is free to test the route.');
      var nmk = kindT(kind);
      if (spec.kind === 'busy') {
        var chosen = b0[0], b1 = b0.slice(1);
        res.title = T('ماذا لو انشغلت وحدة ' + nmk.ar + ' الأولى؟ (' + a.id + ')', 'What if the first ' + nmk.en.toLowerCase() + ' unit becomes busy? (' + a.id + ')');
        res.rows.push({ k: T('الوحدة الأسرع', 'Fastest unit'), a: plain(chosen.u.name) + ' · ' + mmss(chosen.sec), b: b1[0] ? plain(b1[0].u.name) + ' · ' + mmss(b1[0].sec) : T('لا أحد', 'none') });
        res.rows.push({ k: T('وحدات متاحة', 'Units free'), a: String(b0.length), b: String(b1.length) });
        res.verdict = b1[0] ? T('الفرق: ' + ltr(mmss(b1[0].sec - chosen.sec)) + ' أبطأ (زمن القيادة فقط، بالطرق والازدحام الحاليين).', 'Difference: ' + mmss(b1[0].sec - chosen.sec) + ' slower (driving time only, with the current roads and traffic).') : T('لا وحدة بديلة.', 'No alternative unit.');
        res.delta = b1[0] ? b1[0].sec - chosen.sec : 0;
      } else {
        var best = b0[0], pl = best.route.polyline || [], mid = pl[Math.floor(pl.length / 2)], eg = mid ? NN.edgeAt(f.nat, mid[0], mid[1], 600) : null;
        if (!eg) return noR('لم أجد طريقًا على مسار الوحدة لإغلاقه.', 'I could not find a road on the unit route to close.');
        var info = NN.roadInfo(f.nat, eg.edge), wasClosed = !!(info && info.closed), b2 = [];
        if (!wasClosed) { NN.closeRoad(f.nat, eg.edge, 1); try { b2 = rank(); } finally { NN.openRoad(f.nat, eg.edge); } }
        res.title = T('ماذا لو أُغلق الطريق «' + (info ? info.name.ar : '–') + '» على مسار ' + nmk.ar + '؟ (' + a.id + ')', 'What if the road “' + (info ? info.name.en : '–') + '” on the ' + nmk.en.toLowerCase() + ' route is blocked? (' + a.id + ')');
        if (wasClosed) res.verdict = T('الطريق مغلق أصلًا، فالحساب الحالي يتضمنه.', 'The road is already closed, so the current numbers already include it.');
        else {
          var nb = b2[0] || null;
          res.rows.push({ k: T('الوحدة الأسرع', 'Fastest unit'), a: plain(best.u.name) + ' · ' + mmss(best.sec), b: nb ? plain(nb.u.name) + ' · ' + mmss(nb.sec) : T('لا أحد يصل', 'nobody can reach') });
          var same = nb && nb.u.id === best.u.id;
          res.rows.push({ k: T('هل تتغيّر الوحدة المختارة؟', 'Does the chosen unit change?'), a: T('لا', 'no'), b: nb ? (same ? T('لا', 'no') : T('نعم', 'yes')) : '–' });
          res.rows.push({ k: T('الطريق المغلق', 'Closed road'), a: '–', b: info ? plain(info.name) : '–' });
          res.verdict = !nb ? T('لا وحدة تصل بهذا الإغلاق.', 'No unit can reach with this closure.') : same ? T('الوحدة نفسها لكن أبطأ بـ' + ltr(mmss(nb.sec - best.sec)) + '.', 'The same unit but ' + mmss(nb.sec - best.sec) + ' slower.') : T('وحدة أخرى تصبح الأسرع، والفارق ' + ltr(mmss(nb.sec - best.sec)) + ' عن الأولى سابقًا.', 'Another unit becomes the fastest, ' + mmss(nb.sec - best.sec) + ' slower than the previous first.');
          res.delta = nb ? nb.sec - best.sec : null; res.changed = nb ? !same : true;
        }
      }
    }
    if (!res.verdict) res.verdict = T('', '');
    res.ok = true; res.text = res.verdict; A.lastWhatIf = res;
    if (A.ui.wiOut) renderWhatIf();
    return res;
  }

  /* ====================================================================================
   * 9. COMMANDS: keyword / intent grammar, Arabic + English (never bluffs: unknown input says so)
   * ==================================================================================== */
  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    s = s.replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
    s = s.replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); });
    return s.replace(/[؟?!.,،؛;:"“”«»()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function has(t, list) {
    for (var i = 0; i < list.length; i++) {
      var w = norm(list[i]);
      if (/^[a-z0-9 '-]+$/.test(w)) { if (new RegExp('(^|[^a-z0-9])' + w.replace(/[-' ]/g, function (c) { return c === ' ' ? '\\s+' : '\\' + c; }) + '($|[^a-z0-9])').test(t)) return true; }
      else if (t.indexOf(w) >= 0) return true;
    }
    return false;
  }
  var HZW = { fire: ['fire', 'حريق', 'نار', 'حرائق'], gas: ['gas', 'غاز'], flood: ['flood', 'فيضان', 'سيول', 'سيل', 'مياه', 'غمر'], dust: ['dust', 'غبار', 'عاصفه ترابيه', 'ترابيه'], heat: ['heat', 'حراره'], sos: ['sos', 'استغاثه', 'مصاب'] };
  function parseAlertId(t) {
    var m = /\bal[- ]?(\d+)\b/.exec(t) || /(?:انذار|alert)\s*(?:رقم\s*)?(\d+)/.exec(t); if (m) return 'AL-' + m[1];
    return null;
  }
  function parseDrone(t) {
    var m = /\bdr[- ]?(\d+)\b/.exec(t) || /(?:مسيره|درون|drone)\s*(?:رقم\s*)?(\d+)/.exec(t); if (!m) return null;
    var n = parseInt(m[1], 10), cs = 'DR-' + (n < 10 ? '0' : '') + n; return cs;
  }
  function intent(raw) {
    var t = norm(raw); if (!t) return { name: 'empty' };
    var al = parseAlertId(t), dr = parseDrone(t);
    if (has(t, ['what if', 'whatif', 'what happens if', 'ماذا لو', 'ماذا يحدث لو', 'لو فقدت', 'لو فقد', 'لو سقطت', 'لو اغلق']))
      return { name: 'whatif', alert: al, drone: dr, road: has(t, ['road', 'block', 'closed', 'closure', 'طريق', 'اغلاق', 'اغلق', 'مسدود']), busy: has(t, ['busy', 'unit', 'مشغوله', 'مشغول', 'وحده']) };
    if (has(t, ['undo', 'revert', 'take back', 'تراجع', 'الغاء الاخير', 'الغ اخر'])) return { name: 'undo' };
    if (has(t, ['help', 'commands', 'what can you', 'what do you understand', 'مساعده', 'ساعدني', 'الاوامر', 'ماذا تستطيع', 'ماذا يمكنك'])) return { name: 'help' };
    if (/^(why|explain)\b/.test(t) || has(t, ['why this', 'the reason', 'لماذا', 'ليش', 'سبب', 'اشرح', 'وضح'])) return { name: 'why', alert: al };
    if (has(t, ['who is free', "who's free", 'whos free', 'free units', 'available units', 'who is available', 'who is idle', 'من المتاح', 'من متاح', 'المتاحين', 'المتاحه', 'من الفاضي', 'من فاضي', 'وحدات حره', 'الوحدات الحره'])) return { name: 'free' };
    if (has(t, ['robot', 'روبوت'])) return { name: has(t, ['deploy', 'send', 'launch', 'start', 'activate', 'انشر', 'ارسل', 'شغل', 'ابدا', 'فعل', 'انزل', 'اطلب']) ? 'robot-deploy' : 'robot-status', alert: al };
    if (dr && has(t, ['status', 'state', 'battery', 'where', 'how is', 'حاله', 'وضع', 'بطاريه', 'اين', 'كيف'])) return { name: 'drone-status', drone: dr };
    if (dr && has(t, ['send', 'launch', 'verify', 'ارسل', 'اطلق', 'تحقق'])) return { name: 'verify', alert: al, drone: dr };
    if (has(t, ['verify', 'check', 'send a drone', 'send drone', 'launch a drone', 'تحقق', 'ارسل مسيره', 'ارسل درون', 'اطلق مسيره'])) return { name: 'verify', alert: al, drone: dr };
    if (al && has(t, ['status', 'state', 'حاله', 'وضع', 'كيف'])) return { name: 'alert-status', alert: al };
    if (has(t, ['dispatch', 'send the fastest', 'send fastest', 'send nearest', 'send the nearest', 'send units', 'ارسل الاقرب', 'ارسل الاسرع', 'ارسل وحده', 'ارسل الوحدات', 'وجه الاقرب', 'وجه الاسرع', 'ارسل'])) return { name: 'dispatch', alert: al };
    var hz = null; CR.HZ_ORDER.forEach(function (z) { if (!hz && has(t, HZW[z])) hz = z; });
    if (hz && (has(t, ['show', 'display', 'focus', 'find', 'highlight', 'where', 'اعرض', 'اظهر', 'وريني', 'ابحث', 'اين', 'عرض']) || t.split(' ').length <= 2)) return { name: 'show', hazard: hz };
    if (has(t, ['advisory', 'advise', 'warn residents', 'notify residents', 'tell residents', 'تنبيه السكان', 'ارشاد', 'انذر السكان', 'حذر السكان'])) return { name: 'advisory' };
    if (has(t, ['recommendations', 'recommend', 'what should i do', 'what next', 'next step', 'توصيات', 'ماذا افعل', 'ماذا بعد', 'الخطوه التاليه'])) return { name: 'recs' };
    if (has(t, ['export', 'audit', 'سجل القرارات', 'سجل التدقيق', 'تصدير'])) return { name: 'export' };
    if (has(t, ['brief', 'sitrep', 'summary', 'summarize', 'situation', 'status', 'report', 'overview', 'ملخص', 'موجز', 'تقرير', 'الوضع', 'الموقف', 'حاله عامه', 'لخص'])) return { name: 'brief' };
    return { name: 'unknown' };
  }
  var HELP = [
    ['brief · ملخص', 'تقرير موجز للموقف', 'a short situation brief'], ['who is free · من المتاح', 'الوحدات والمسيّرات المتاحة', 'free units and drones'], ['status of DR-03 · حالة DR-03', 'حالة مسيّرة', 'one drone’s status'],
    ['dispatch fastest to AL-2 · أرسل الأقرب إلى AL-2', 'اقتراح إرسال الأسرع (يحتاج موافقتك)', 'propose the fastest dispatch (needs your Approve)'], ['verify AL-2 · تحقق من AL-2', 'اقتراح إرسال مسيّرة للتحقق', 'propose a verification drone'],
    ['show gas · اعرض الغاز', 'حدّد الإنذار على الخريطة (fire · gas · flood · dust · heat · sos)', 'select that hazard’s alert on the map'], ['deploy robot · انشر الروبوت', 'اقتراح نشر الروبوت', 'propose deploying the robot'],
    ['what if DR-03 is lost · ماذا لو فُقدت DR-03', 'تجربة «ماذا لو» (أو: what if road blocked AL-2)', 'a what-if (or: what if road blocked AL-2)'], ['why · لماذا', 'شرح آخر توصية', 'explain the last recommendation'], ['undo · تراجع', 'يتراجع عن الرفض أو إطلاق المسيّرة', 'undoes a dismiss or a drone launch'], ['recommendations · توصيات', 'قائمة التوصيات الحالية', 'the current recommendations'], ['export · تصدير', 'تصدير سجل القرارات', 'export the audit list']
  ];
  function say(ar, en, extra) { var m = { who: 'bot', text: T(ar, en), t: Date.now() }; if (extra) for (var k in extra) m[k] = extra[k]; return m; }
  function helpReply(lead) {
    return say((lead ? lead.ar + ' ' : '') + 'أستطيع الأوامر القصيرة التالية:', (lead ? lead.en + ' ' : '') + 'I can do these short commands:', { items: HELP.map(function (x) { return T(x[0] + ' — ' + x[1], x[0] + ' — ' + x[2]); }) });
  }
  function alertLine(a) { return T(ltr(a.id) + ' · ' + hzT(a.hazard).ar + ' · قرب ' + placeT(a).ar + ' · ' + a.stateName.ar + ' · أولوية ' + a.priority, a.id + ' · ' + hzT(a.hazard).en + ' · near ' + placeT(a).en + ' · ' + a.stateName.en + ' · priority ' + a.priority); }
  function targetAlert(f, id, pref) {
    if (id) return CR.alertOf(id);
    var sel = CR.selectedAlert(); if (sel && !CR.isFinal(sel) && (!pref || pref(sel))) return sel;
    var open = f.open.filter(function (a) { return !pref || pref(a); }); return open[0] || null;
  }
  function propose(rule, alertId, rec) {
    var key = rec.key; A.forced[key] = { rule: rule, alert: alertId, drone: rec.rule === 'verify' ? rec.act.droneId : null };
    delete A.dismissed[key]; delete A.done[key];
    computeRecs(true); renderRecs(); focusRec(key);
    return key;
  }
  function runCommand(raw) {
    var text = String(raw == null ? '' : raw).slice(0, 200), reply, it = intent(text), f = facts();
    pushConvo({ who: 'me', text: text });
    if (!f && it.name !== 'help' && it.name !== 'unknown') { reply = say('المحرّك لم يجهز بعد؛ حاول بعد لحظة.', 'The engine is not ready yet; try again in a moment.'); return finish(it, reply, text); }
    var a, rec, k;
    switch (it.name) {
      case 'empty': reply = helpReply(T('لم تكتب شيئًا.', 'You typed nothing.')); break;
      case 'help': reply = helpReply(); break;
      case 'brief': refresh(true); reply = say('إليك الموجز الآن:', 'Here is the brief now:', { items: A.sitrep.lines.filter(function (x) { return x.tone !== 'fine'; }).map(function (x) { return T(x.ar, x.en); }) }); break;
      case 'free': {
        var idle = {}, idleN = 0; f.units.forEach(function (u) { if (u.state === 'idle' && !u.busy && !u.assigned) { idle[u.kind] = (idle[u.kind] || 0) + 1; idleN++; } });
        var parts = ['fire', 'rescue', 'ambulance', 'police'].map(function (kd) { return T(kindT(kd).ar + ' ' + (idle[kd] || 0), kindT(kd).en.toLowerCase() + ' ' + (idle[kd] || 0)); });
        reply = say('المتاح الآن: ' + parts.map(function (x) { return x.ar; }).join('، ') + ' (المجموع ' + idleN + ') — مسيّرات متاحة ' + f.free.length + ' من ' + f.drones.length + (f.free.length ? ': ' + f.free.slice(0, 6).map(function (d) { return ltr(d.callsign); }).join('، ') : '') + '.',
          'Free now: ' + parts.map(function (x) { return x.en; }).join(', ') + ' (total ' + idleN + ') — drones free ' + f.free.length + ' of ' + f.drones.length + (f.free.length ? ': ' + f.free.slice(0, 6).map(function (d) { return d.callsign; }).join(', ') : '') + '.');
        break; }
      case 'drone-status': {
        var d = f.drones.filter(function (x) { return x.callsign === it.drone; })[0];
        if (!d) reply = say('لا أعرف مسيّرة باسم ' + ltr(it.drone) + '. المتاح: ' + f.drones.slice(0, 5).map(function (x) { return ltr(x.callsign); }).join('، ') + ' …', 'I do not know a drone called ' + it.drone + '. Known: ' + f.drones.slice(0, 5).map(function (x) { return x.callsign; }).join(', ') + ' …');
        else reply = say(ltr(d.callsign) + ': ' + d.stateText.ar + ' · بطارية ' + d.batteryPct + '٪' + (d.etaSec != null ? ' · وصول ' + ltr(mmss(d.etaSec)) : '') + (d.alert ? ' · مهمة ' + ltr(d.alert) : '') + (d.blocked ? ' · لا تقلع: ' + CR.reasonText(d.blocked) : '') + (d.derate && d.derate.active ? ' · أثر الحرارة: مدى أقل ' + d.derate.enduranceLostPct + '٪' : '') + ' · مدى ' + d.derate.rangeKm + ' كم.',
          d.callsign + ': ' + d.stateText.en + ' · battery ' + d.batteryPct + '%' + (d.etaSec != null ? ' · ETA ' + mmss(d.etaSec) : '') + (d.alert ? ' · mission ' + d.alert : '') + (d.blocked ? ' · cannot launch: ' + CR.reasonText(d.blocked) : '') + (d.derate && d.derate.active ? ' · heat effect: endurance −' + d.derate.enduranceLostPct + '%' : '') + ' · range ' + d.derate.rangeKm + ' km.');
        break; }
      case 'alert-status': {
        a = CR.alertOf(it.alert); if (!a) { reply = say('لا أجد الإنذار ' + ltr(it.alert) + '.', 'I cannot find alert ' + it.alert + '.'); break; }
        var inc = f.incOf(a), pl = inc && inc.plan, us = planUnits(pl);
        reply = say(alertLine(a).ar, alertLine(a).en, { items: us.length ? us.map(function (u) { return T(kindT(u.kind).ar + ': ' + u.name.ar + ' — ' + ltr(mmss(u.etaSec)) + ' (' + u.state + ')', kindT(u.kind).en + ': ' + u.name.en + ' — ' + mmss(u.etaSec) + ' (' + u.state + ')'); }) : [T('لا خطة إرسال بعد.', 'No dispatch plan yet.')] });
        break; }
      case 'show': {
        var cand = f.open.filter(function (x) { return x.hazard === it.hazard; });
        if (!cand.length) reply = say('لا إنذار مفتوح من نوع «' + hzT(it.hazard).ar + '» الآن.', 'No open ' + hzT(it.hazard).en.toLowerCase() + ' alert right now.');
        else { a = cand[0]; CR.selectAlert(a.id); reply = say('حدّدتُ على الخريطة: ' + alertLine(a).ar + (cand.length > 1 ? ' (و ' + (cand.length - 1) + ' أخرى من النوع نفسه)' : ''), 'Selected on the map: ' + alertLine(a).en + (cand.length > 1 ? ' (and ' + (cand.length - 1) + ' more of the same kind)' : '')); }
        break; }
      case 'verify': {
        a = targetAlert(f, it.alert, function (x) { return x.state === 'SUSPECT'; }) || targetAlert(f, it.alert);
        if (!a) { reply = say('أي إنذار؟ اكتب مثلًا: verify AL-2', 'Which alert? For example: verify AL-2'); break; }
        rec = buildVerify(f, a, true);
        if (!rec) reply = say('لا أستطيع اقتراح مسيّرة للإنذار ' + ltr(a.id) + ' الآن.', 'I cannot propose a drone for ' + a.id + ' right now.');
        else if (rec.rule === 'range') { propose('verify', a.id, rec); reply = say('لا مسيّرة تصل إلى ' + ltr(a.id) + ': ' + rec.why[0].ar, 'No drone can reach ' + a.id + ': ' + rec.why[0].en); }
        else { if (it.drone) { rec.fields[0].value = (rec.fields[0].options.filter(function (o) { return plain(o.label).indexOf(it.drone) === 0; })[0] || { v: rec.fields[0].value }).v; rec.act.droneId = rec.fields[0].value; } propose('verify', a.id, rec); reply = say('أضفتُ اقتراحًا: ' + rec.title.ar + '. لن يُرسَل شيء حتى تضغط «وافق».', 'I added a proposal: ' + rec.title.en + '. Nothing is sent until you press Approve.'); }
        break; }
      case 'dispatch': {
        a = targetAlert(f, it.alert, function (x) { return x.state === 'CONFIRMED' || x.state === 'SUSPECT'; });
        if (!a) { reply = say('أي إنذار؟ اكتب مثلًا: dispatch fastest to AL-2', 'Which alert? For example: dispatch fastest to AL-2'); break; }
        rec = buildDispatch(f, a, true);
        if (!rec) reply = say('لا خطة إرسال متاحة للإنذار ' + ltr(a.id) + ' (الحالة: ' + a.stateName.ar + ').', 'No dispatch plan is available for ' + a.id + ' (state: ' + a.stateName.en + ').');
        else { propose('dispatch', a.id, rec); reply = say('أضفتُ اقتراح الإرسال: ' + rec.title.ar + '. لن يُرسَل شيء حتى تضغط «وافق».', 'I added the dispatch proposal: ' + rec.title.en + '. Nothing is sent until you press Approve.'); }
        break; }
      case 'robot-status': {
        var ln = A.sitrep.lines.filter(function (x) { return x.id === 'robot'; })[0];
        reply = say(ln ? ln.ar : 'الروبوت غير متاح.', ln ? ln.en : 'The robot is not available.'); break; }
      case 'robot-deploy': {
        a = targetAlert(f, it.alert, function (x) { return CR.mods.robot && CR.mods.robot.eligible(x); });
        if (!a || !CR.mods.robot || !CR.mods.robot.eligible(a)) { reply = say('الروبوت لحريق أو غاز داخل مبنى فقط، ولا يوجد إنذار مناسب مفتوح.', 'The robot is for a building fire or gas only, and no suitable alert is open.'); break; }
        rec = buildRobot(f, a, true); propose('robot', a.id, rec);
        reply = say('أضفتُ اقتراح نشر الروبوت للإنذار ' + ltr(a.id) + '. حدوده: ' + rec.why[2].ar.replace(/^حدوده: /, '') + ' الاعتماد النهائي لقائد الحادث.', 'I added a proposal to deploy the robot for ' + a.id + '. ' + rec.why[2].en + ' Final approval belongs to the incident commander.'); break; }
      case 'advisory': {
        var adv = A.recs.filter(function (r) { return r.rule === 'advisory'; });
        if (adv.length) { focusRec(adv[0].key); reply = say('هذه إرشادات بانتظار قرارك: ' + adv.map(function (r) { return r.title.ar; }).join('؛ '), 'Advisories waiting for your decision: ' + adv.map(function (r) { return r.title.en; }).join('; ')); }
        else reply = say('لا إرشاد للسكان مطلوب الآن بحسب القواعد (لا تحذير حرارة أو غبار أو فيضان قائم).', 'The rules see no resident advisory needed now (no active heat, dust or flood warning).'); break; }
      case 'recs':
        reply = A.recs.length ? say('توصيات بانتظار قرارك (' + A.recs.length + '):', 'Recommendations waiting for your decision (' + A.recs.length + '):', { items: A.recs.slice(0, 6).map(function (r) { return T(r.title.ar + ' — ثقة ' + pct(r.conf), r.title.en + ' — confidence ' + pct(r.conf)); }) }) : say('لا توصيات الآن: لم تجد القواعد ما يحتاج قرارًا.', 'No recommendations now: the rules found nothing that needs a decision.'); break;
      case 'why': {
        rec = (it.alert && A.recs.filter(function (r) { return r.alert === it.alert; })[0]) || A.lastRec || A.recs[0];
        if (!rec) { reply = say('لا توجد توصية لأشرحها بعد.', 'There is no recommendation to explain yet.'); break; }
        var lines = rec.why.slice();
        lines.push(T('المدخلات: ' + rec.inputs.map(function (i) { return i.k.ar + '=' + (isObjT(i.v) ? i.v.ar : i.v); }).join(' · '), 'Inputs: ' + rec.inputs.map(function (i) { return i.k.en + '=' + (isObjT(i.v) ? i.v.en : i.v); }).join(' · ')));
        lines.push(T('الثقة ' + pct(rec.conf) + ' (' + confWord(rec.conf).ar + ') = درجة قاعدة تقديرية: ' + rec.base + ' ' + rec.terms.map(function (x) { return (x.d >= 0 ? '+' : '') + x.d.toFixed(2) + ' ' + x.ar; }).join('، '), 'Confidence ' + pct(rec.conf) + ' (' + confWord(rec.conf).en + ') = a heuristic rule score: ' + rec.base + ' ' + rec.terms.map(function (x) { return (x.d >= 0 ? '+' : '') + x.d.toFixed(2) + ' ' + x.en; }).join(', ')));
        lines.push(T(RULE[rec.rule].ar, RULE[rec.rule].en));
        reply = say('لماذا: ' + rec.title.ar, 'Why: ' + rec.title.en, { items: lines }); A.lastRec = rec; break; }
      case 'undo': reply = doUndo(); break;
      case 'export': exportAudit('json'); reply = say('صُدِّر سجل القرارات (' + A.audit.length + ' سجلًا) كملف JSON.', 'The audit list was exported (' + A.audit.length + ' entries) as a JSON file.'); break;
      case 'whatif': {
        a = targetAlert(f, it.alert); if (!a) { reply = say('لا إنذار مفتوح لتجربته.', 'There is no open alert to test.'); break; }
        var spec = it.drone ? { kind: 'drone', drone: it.drone, alert: a.id } : { kind: it.busy && !it.road ? 'busy' : 'road', alert: a.id };
        if (!it.drone && !it.road && !it.busy) { reply = say('«ماذا لو» تفهم: فُقدت DR-03 · أُغلق الطريق AL-2 · انشغلت الوحدة AL-2.', 'I understand what-ifs like: DR-03 is lost · road blocked AL-2 · unit busy AL-2.'); break; }
        var wr = whatIf(spec);
        reply = wr.ok ? say(plain(wr.title) === '' ? '' : wr.title.ar + ' — ' + wr.verdict.ar, wr.title.en + ' — ' + wr.verdict.en, { whatif: true }) : say(wr.text.ar, wr.text.en);
        break; }
      default:
        if (A.backend) { askBackend(text); return A.convo[A.convo.length - 1]; }
        reply = helpReply(T('لم أفهم «' + text + '».', 'I did not understand “' + text + '”.'));
    }
    return finish(it, reply, text);
  }
  function finish(it, reply, text) {
    pushConvo(reply); speak(plain(reply.text));
    if (it.name !== 'unknown' && it.name !== 'empty' && it.name !== 'help' && it.name !== 'brief') logAudit('command', null, null, { rule: 'command:' + it.name, title: T('أمر: ' + text, 'Command: ' + text), why: reply.text, detail: reply.text, src: 'command' });
    return reply;
  }
  function askBackend(prompt) {
    var ctx = { sitrep: sitrepText(A.sitrep.lines, 'en'), recommendations: A.recs.map(function (r) { return { rule: r.rule, alert: r.alert, title: r.title.en, confidence: Math.round(r.conf * 100) }; }), role: S.role, clock: S.snap ? S.snap.clock : '', sim: true };
    var placeholder = say('لم أفهمها بقواعدي؛ أسأل الواجهة الخارجية التي رُبطت بي…', 'My rules did not understand it; asking the external backend that was attached…', { pending: true });
    pushConvo(placeholder);
    var p; try { p = Promise.resolve(A.backend(prompt, ctx)); } catch (e) { p = Promise.reject(e); }
    p.then(function (txt) {
      placeholder.pending = false; placeholder.backend = true; placeholder.text = T('الواجهة الخارجية — لم تفحصها القواعد: ' + String(txt == null ? '' : txt).slice(0, 1200), 'external backend — not checked by the rules: ' + String(txt == null ? '' : txt).slice(0, 1200)); placeholder.ext = String(txt == null ? '' : txt).slice(0, 1200); renderConvo();
      logAudit('command', null, null, { rule: 'backend', title: T('سؤال إلى الواجهة الخارجية: ' + prompt, 'Asked the external backend: ' + prompt), detail: T('الرد غير مفحوص بالقواعد ولم يُنفَّذ كإجراء', 'The answer is not checked by the rules and was not turned into an action'), src: 'backend' });
    }, function (err) { placeholder.pending = false; placeholder.text = T('فشلت الواجهة الخارجية: ' + String(err && err.message || err).slice(0, 200), 'The external backend failed: ' + String(err && err.message || err).slice(0, 200)); renderConvo(); });
  }
  function doUndo() {
    var u = A.undo.pop();
    if (!u) return say('لا شيء يمكن التراجع عنه هنا. المساعد يتراجع فقط عن الرفض وإطلاق المسيّرة؛ الإرسال المعتمد يُلغى من لوحة الإرسال.', 'Nothing to undo here. I can only undo a dismiss or a drone launch; an approved dispatch is cancelled from the Dispatch tab.');
    if (u.kind === 'dismiss') { delete A.dismissed[u.key]; computeRecs(true); renderRecs(); logAudit('undo', null, null, { title: T('تراجع عن رفض توصية', 'Undid a dismissed recommendation'), detail: T('أُعيدت التوصية إلى القائمة', 'The recommendation is back in the list'), alert: u.alert }); return say('أعدتُ التوصية المرفوضة إلى القائمة.', 'The dismissed recommendation is back in the list.'); }
    if (u.kind === 'launch') { var r = CR.recallDrone(u.droneId); logAudit('undo', null, null, { title: T('تراجع: استدعاء المسيّرة بعد الإطلاق', 'Undo: recalled the drone after launch'), detail: T(r && r.ok ? 'استُدعيت المسيّرة' : 'تعذّر الاستدعاء', r && r.ok ? 'drone recalled' : 'could not recall'), alert: u.alert }); return r && r.ok ? say('استدعيتُ المسيّرة بعد إطلاقها.', 'I recalled the drone after its launch.') : say('تعذّر استدعاء المسيّرة الآن (أو الدور لا يملك الصلاحية).', 'The drone could not be recalled now (or the role lacks the right).'); }
    return say('لا يمكن التراجع عن هذا.', 'This cannot be undone.');
  }

  /* ====================================================================================
   * 10. VOICE (optional, off by default, feature-detected)
   * ==================================================================================== */
  function speechOk() { try { return 'speechSynthesis' in win && typeof win.SpeechSynthesisUtterance === 'function'; } catch (e) { return false; } }
  function speak(text) {
    if (!A.voice || !speechOk() || !text) return;
    try { win.speechSynthesis.cancel(); var u = new win.SpeechSynthesisUtterance(String(text).replace(/[⁦⁩]/g, '').slice(0, 400)); u.lang = CR.lang() === 'en' ? 'en-US' : 'ar-SA'; win.speechSynthesis.speak(u); } catch (e) { /* the voice is a convenience */ }
  }

  /* ====================================================================================
   * 11. USER INTERFACE
   * ==================================================================================== */
  var U = A.ui;
  function section(id, ar, en, extra) {
    var hd = h('h3', { class: 'cai-h', id: 'cai-h-' + id }, bi(ar, en));
    var sec = h('section', { class: 'cai-sec', 'aria-labelledby': 'cai-h-' + id, 'data-sec': id }, h('div', { class: 'cai-sec-h' }, hd, extra || null));
    return sec;
  }
  function toggle(ar, en, onclick, id) {
    var b = h('button', { type: 'button', class: 'cr-chip cai-tg', 'aria-pressed': 'false', id: id, onclick: onclick }, bi(ar, en)); return b;
  }
  function build(el) {
    if (A.built) return; A.built = true; U.root = el;
    el.classList.add('cai');
    var banner = h('div', { class: 'cai-banner', role: 'note' },
      h('div', { class: 'cai-title' }, icon('commander'), h('b', null, bi('المساعد القائد', 'Commander assistant')), CR.simTag()),
      h('p', { class: 'cai-honest' }, bi('دعم قرار قائم على قواعد (ليس نموذج لغة). يقرأ المحرّك المحاكى ويقترح ويشرح السبب؛ ولا يفعل شيئًا إلا بعد ضغطك على «وافق»، وكل قرار يُسجَّل.', 'Rule-based decision support (not a language model). It reads the simulated engine, proposes and explains why; it does nothing until you press Approve, and every decision is logged.')),
      U.backendNote = h('p', { class: 'cai-fine' }, bi('', ''))
    );
    // --- board
    U.clock = h('span', { class: 'cai-clock cr-ltr' }, '');
    U.btnCopy = h('button', { type: 'button', class: 'cr-btn sm', onclick: copySitrep }, icon('copy'), bi('انسخ', 'Copy'));
    U.btnPrint = h('button', { type: 'button', class: 'cr-btn sm', onclick: printSitrep }, icon('list'), bi('اطبع', 'Print'));
    U.tgExplain = toggle('وضع الشرح', 'Explain mode', function () { setExplain(!A.explain); }, 'cai-tg-explain');
    U.tgVoice = toggle('صوت', 'Voice', function () { setVoice(!A.voice); }, 'cai-tg-voice');
    lab(U.btnCopy, 'aria-label', 'انسخ نص تقرير الموقف', 'Copy the SITREP text'); lab(U.btnPrint, 'aria-label', 'اطبع تقرير الموقف', 'Print the SITREP');
    lab(U.tgVoice, 'title', 'قراءة الردود بصوت مسموع (متصفحك فقط، متوقفة افتراضيًا)', 'Read replies aloud (your browser only, off by default)');
    if (!speechOk()) { U.tgVoice.hidden = true; }
    U.sitrep = h('ul', { class: 'cai-sitrep', 'aria-label': '' });
    lab(U.sitrep, 'aria-label', 'تقرير الموقف الحي (محاكاة)', 'Live situation report (simulation)');
    U.scan = h('i', { class: 'cai-scan', 'aria-hidden': 'true' });
    var board = section('board', 'لوحة الموقف', 'Situation board', h('div', { class: 'cai-tools' }, U.clock, U.btnCopy, U.btnPrint));
    board.classList.add('cai-board');
    board.appendChild(h('div', { class: 'cai-opts cr-chips' }, U.tgExplain, U.tgVoice));
    board.appendChild(h('div', { class: 'cai-boardbox' }, U.scan, U.sitrep));
    // --- recommendations
    U.recCount = h('span', { class: 'cr-badge cool cai-count' }, '0');
    var recs = section('recs', 'التوصيات', 'Recommendations', U.recCount);
    U.recNote = h('p', { class: 'cai-fine' }, bi('كل توصية تعرض السبب والمدخلات ودرجة الثقة (درجة قاعدة تقديرية وليست احتمالًا إحصائيًا). لا شيء يُنفَّذ قبل «وافق».', 'Each recommendation shows the why, the inputs and a confidence score (a heuristic rule score, not a statistical probability). Nothing is done before Approve.'));
    U.recList = h('div', { class: 'cai-recs', role: 'list' });
    U.recEmpty = h('p', { class: 'cai-empty' }, icon('info'), bi('لا توصية الآن: لم تجد القواعد ما يحتاج قرارًا. تُراجَع كل بضع ثوانٍ.', 'No recommendation right now: the rules found nothing that needs a decision. They are re-checked every few seconds.'));
    recs.append(U.recNote, U.recList, U.recEmpty);
    // --- command box
    var cmd = section('cmd', 'اسأل أو أمُر', 'Ask or command');
    U.input = h('input', { type: 'text', class: 'cai-input', id: 'cai-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '200', dir: 'auto', enterkeyhint: 'send' });
    lab(U.input, 'placeholder', 'مثال: ملخص · من المتاح · dispatch fastest to AL-2', 'Example: brief · who is free · dispatch fastest to AL-2');
    var lbl = h('label', { class: 'sr-only', for: 'cai-input' }, bi('أمر قصير بالعربية أو الإنجليزية', 'A short command in Arabic or English'));
    U.send = h('button', { type: 'submit', class: 'cr-btn primary' }, icon('send'), bi('أرسل', 'Send'));
    var form = h('form', { class: 'cai-form', autocomplete: 'off' }, lbl, U.input, U.send);
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = U.input.value.trim(); if (!v) return; U.input.value = ''; runCommand(v); });
    U.input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { U.input.value = ''; } });
    var chips = h('div', { class: 'cai-chips cr-chips', role: 'group' }, [['ملخص', 'brief'], ['من المتاح', 'who is free'], ['اعرض الحريق', 'show fire'], ['انشر الروبوت', 'deploy robot'], ['لماذا', 'why'], ['تراجع', 'undo'], ['مساعدة', 'help']].map(function (c) {
      var b = h('button', { type: 'button', class: 'cr-chip', onclick: function () { runCommand(CR.lang() === 'en' ? c[1] : c[0]); } }, bi(c[0], c[1])); return b;
    }));
    lab(chips, 'aria-label', 'أوامر سريعة', 'Quick commands');
    U.convo = h('div', { class: 'cai-convo', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
    lab(U.convo, 'aria-label', 'ردود المساعد القائد', 'Commander assistant replies');
    cmd.append(form, chips, U.convo);
    // --- what-if
    var wi = section('whatif', 'ماذا لو؟', 'What-if');
    U.wiKind = h('select', { class: 'cr-sel', id: 'cai-wi-kind' }, h('option', { value: 'drone' }, ''), h('option', { value: 'road' }, ''), h('option', { value: 'busy' }, ''));
    U.wiAlert = h('select', { class: 'cr-sel', id: 'cai-wi-alert' });
    U.wiDrone = h('select', { class: 'cr-sel', id: 'cai-wi-drone' });
    U.wiRun = h('button', { type: 'button', class: 'cr-btn primary', onclick: runWhatIfUi }, icon('route'), bi('شغّل التجربة', 'Run the what-if'));
    function fld(id, ar, en, ctl) { return h('div', { class: 'cai-fld' }, h('label', { for: id }, bi(ar, en)), ctl); }
    U.wiDroneFld = fld('cai-wi-drone', 'المسيّرة المفقودة', 'Drone that is lost', U.wiDrone);
    wi.append(h('p', { class: 'cai-fine' }, bi('يعيد تشغيل حسابات المحرّك نفسها (ترتيب المسيّرات ومسارات الإرسال) مع فقد مسيّرة أو إغلاق طريق أو انشغال وحدة، ثم يعيد كل شيء كما كان.', "Re-runs the engine's own calculations (drone ranking and dispatch routes) with a drone lost, a road blocked or a unit busy, then puts everything back as it was.")),
      h('div', { class: 'cai-wiform' }, fld('cai-wi-kind', 'السيناريو', 'Scenario', U.wiKind), fld('cai-wi-alert', 'الإنذار', 'Alert', U.wiAlert), U.wiDroneFld, U.wiRun),
      U.wiOut = h('div', { class: 'cai-wiout', role: 'status', 'aria-live': 'polite' }));
    U.wiKind.addEventListener('change', function () { U.wiDroneFld.hidden = U.wiKind.value !== 'drone'; });
    fillWiKindLabels();
    // --- audit
    var au = section('audit', 'سجل القرارات', 'Decision audit', U.auditCount = h('span', { class: 'cr-badge cai-count' }, '0'));
    U.auditList = h('ol', { class: 'cai-audit', 'aria-label': '' }); lab(U.auditList, 'aria-label', 'سجل القرارات: من وماذا ولماذا', 'Decision audit: who, what, why');
    U.auditEmpty = h('p', { class: 'cai-empty' }, icon('info'), bi('لا قرارات مسجّلة بعد. كل اعتماد وتعديل ورفض وأمر يُسجَّل هنا مع السبب.', 'No decisions logged yet. Every approve, modify, dismiss and command is logged here with the reason.'));
    U.btnJson = h('button', { type: 'button', class: 'cr-btn sm', onclick: function () { exportAudit('json'); } }, icon('film'), bi('نزّل JSON', 'Download JSON'));
    U.btnCsv = h('button', { type: 'button', class: 'cr-btn sm', onclick: function () { exportAudit('csv'); } }, icon('film'), bi('نزّل CSV', 'Download CSV'));
    U.btnCopyAudit = h('button', { type: 'button', class: 'cr-btn sm', onclick: copyAudit }, icon('copy'), bi('انسخ', 'Copy'));
    au.append(h('div', { class: 'cr-row cai-auditbar' }, U.btnCopyAudit, U.btnJson, U.btnCsv), U.auditEmpty, U.auditList);
    var foot = h('p', { class: 'cai-fine cai-foot' }, bi('ملاحظة: يمكن ربط نموذج لغة حقيقي لاحقًا عبر خطاف موثَّق (ControlRoom.mods.ai.setBackend)، ولا يتصل هذا المساعد بأي شبكة من تلقاء نفسه. كل الأرقام محاكاة، و999 تبقى هي المُرسِل.', 'Note: a real language model could be plugged in later through a documented hook (ControlRoom.mods.ai.setBackend); this assistant never connects to any network by itself. All figures are simulation, and 999 stays the dispatcher.'));
    el.append(banner, h('div', { class: 'cai-cols' }, board, recs), h('div', { class: 'cai-cols cai-cols2' }, cmd, wi), au, foot);
    // the print document: a plain sheet that only shows when printing
    U.printDoc = h('div', { class: 'cai-printdoc', 'aria-hidden': 'true' }); doc.body.appendChild(U.printDoc);
    win.addEventListener('afterprint', function () { doc.body.classList.remove('cai-printing'); });
    renderBackendNote(); renderAudit(); renderConvo(); syncOpts();
    if (!A.convo.length) pushConvo(say('مرحبًا. أنا مساعد قائم على قواعد (ليس نموذج لغة). اكتب «مساعدة» لترى ما أفهمه.', 'Hello. I am a rule-based assistant (not a language model). Type “help” to see what I understand.'));
  }
  function fillWiKindLabels() {
    var o = U.wiKind.options; setT(o[0], B('فقد مسيّرة', 'A drone is lost')); setT(o[1], B('إغلاق طريق على مسار الوحدة', 'A road on the unit route is blocked')); setT(o[2], B('انشغال أسرع وحدة', 'The fastest unit becomes busy'));
  }
  function renderBackendNote() {
    if (!U.backendNote) return;
    var on = !!A.backend; U.backendNote.replaceChildren(on ? bi('واجهة خارجية مرتبطة عبر setBackend: تُستعمل فقط لما لا تفهمه القواعد، وردّها غير مفحوص ولا يتحوّل إلى إجراء.', 'An external backend is attached through setBackend: it is used only for what the rules do not understand, and its answer is unchecked and never becomes an action.')
      : bi('لا واجهة نموذج لغة مرتبطة. (خطاف اختياري: ControlRoom.mods.ai.setBackend(fn) — لا اتصال تلقائي بأي شبكة.)', 'No language-model backend is attached. (Optional hook: ControlRoom.mods.ai.setBackend(fn) — no automatic network connection.)'));
    U.backendNote.classList.toggle('on', on);
  }
  function syncOpts() {
    if (!U.tgExplain) return;
    setA(U.tgExplain, 'aria-pressed', String(A.explain)); setA(U.tgVoice, 'aria-pressed', String(A.voice)); U.root.classList.toggle('cai-explain', A.explain);
  }
  function setExplain(on) { A.explain = !!on; syncOpts(); renderRecs(true); renderSitrep(true); return A.explain; }
  function setVoice(on) { if (on && !speechOk()) { CR.toast({ ar: 'متصفحك لا يدعم الصوت المسموع', en: 'Your browser does not support spoken output' }, 'warn', 2600); A.voice = false; } else A.voice = !!on; if (!A.voice && speechOk()) { try { win.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } syncOpts(); return A.voice; }

  /* ---- typed-in lines ---- */
  function finishTyping() { A.typing.forEach(function (t) { t.done(); }); A.typing = []; }
  function typeInto(span, text, delay) {
    if (!motionOk() || !U.root || !U.root.isConnected || text.length < 4) { span.textContent = text; return; }
    var per = clamp(1000 / text.length, 8, 24), t0 = now() + (delay || 0), rec = { done: function () { span.textContent = text; rec.fin = true; } };
    span.textContent = ''; A.typing.push(rec);
    function step() {
      if (rec.fin) return; if (doc.hidden) { rec.done(); return; }
      var n = Math.floor((now() - t0) / per); if (n < 0) { requestAnimationFrame(step); return; }
      if (n >= text.length) { rec.done(); return; }
      span.textContent = text.slice(0, n); requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function renderSitrep(force) {
    if (!U.sitrep) return;
    var L = A.sitrep.lines, seen = {}, i, lang = CR.lang(), first = !Object.keys(A.lines).length;
    L.forEach(function (x, idx) {
      seen[x.id] = 1; var rec = A.lines[x.id], sig = x.ar + '\u0001' + x.en;
      if (!rec) {
        var sa = h('span', { 'data-l': 'ar' }), se = h('span', { 'data-l': 'en' });
        var li = h('li', { class: 'cai-line' + (x.tone ? ' t-' + x.tone : ''), 'data-id': x.id }, sa, se);
        sa.textContent = x.ar; se.textContent = x.en;
        rec = A.lines[x.id] = { li: li, sa: sa, se: se, sig: sig };
        U.sitrep.appendChild(li);
        if (!first && !x.quiet && motionOk()) typeInto(lang === 'en' ? se : sa, lang === 'en' ? x.en : x.ar, 0);
        else if (first && !x.quiet && motionOk()) typeInto(lang === 'en' ? se : sa, lang === 'en' ? x.en : x.ar, idx * 90);
      } else if (rec.sig !== sig || force) {
        rec.sa.textContent = x.ar; rec.se.textContent = x.en; rec.li.className = 'cai-line' + (x.tone ? ' t-' + x.tone : '');
        if (rec.sig !== sig && !x.quiet && motionOk()) { rec.li.classList.remove('cai-upd'); void rec.li.offsetWidth; rec.li.classList.add('cai-upd'); }
        rec.sig = sig;
      }
    });
    Object.keys(A.lines).forEach(function (id) { if (!seen[id]) { A.lines[id].li.remove(); delete A.lines[id]; } });
    // keep DOM order = line order
    var prev = null; L.forEach(function (x) { var li = A.lines[x.id].li; if (prev ? prev.nextSibling !== li : U.sitrep.firstChild !== li) U.sitrep.insertBefore(li, prev ? prev.nextSibling : U.sitrep.firstChild); prev = li; });
    setT(U.clock, (S.snap ? S.snap.clock.slice(0, 8) : '') + ' SIM');
  }

  /* ---- recommendation cards ---- */
  function valNode(v) { return isObjT(v) ? bi(v.ar, v.en) : h('span', { class: 'cr-ltr' }, String(v)); }
  function confNode(rec) {
    var cw = confWord(rec.conf), fill = h('i', { class: 'cai-fill' });
    var bar = h('div', { class: 'cai-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(rec.conf * 100)) }, fill);
    lab(bar, 'aria-label', 'الثقة (درجة قاعدة تقديرية): ' + Math.round(rec.conf * 100) + '٪', 'Confidence (heuristic rule score): ' + Math.round(rec.conf * 100) + '%');
    fill.style.setProperty('--v', String(rec.conf));
    return h('div', { class: 'cai-conf' }, h('span', { class: 'cai-conf-t' }, bi('الثقة', 'Confidence'), ' ', h('b', null, bi(cw.ar, cw.en)), ' ', h('b', { class: 'cr-ltr cai-pctn' }, pct(rec.conf))), bar);
  }
  function cardBody(rec) {
    var sv = SEV_T[rec.sev] || SEV_T.medium, kids = [];
    kids.push(h('div', { class: 'cai-rec-h' }, h('span', { class: 'cr-badge cai-sev' }, icon(rec.sev === 'critical' || rec.sev === 'high' ? 'alert' : 'info'), bi(sv.ar, sv.en)), h('span', { class: 'cr-badge cai-rule' }, bi(ruleName(rec.rule).ar, ruleName(rec.rule).en)), rec.alert ? h('span', { class: 'cr-badge cool cr-ltr' }, rec.alert) : null, rec.src === 'command' ? h('span', { class: 'cr-badge info' }, bi('اقتراح من أمرك', 'proposed by your command')) : null));
    kids.push(h('h4', { class: 'cai-rec-t' }, bi(rec.title.ar, rec.title.en)));
    kids.push(h('div', { class: 'cai-why' }, h('b', { class: 'cai-why-h' }, bi('لماذا', 'Why')), h('ul', null, rec.why.map(function (w) { return h('li', null, bi(w.ar, w.en)); }))));
    kids.push(h('dl', { class: 'cai-inputs', 'aria-label': '' }, rec.inputs.map(function (i) { return h('div', { class: 'cai-in' }, h('dt', null, bi(i.k.ar, i.k.en)), h('dd', null, valNode(i.v))); })));
    kids[kids.length - 1].setAttribute('aria-label', B('المدخلات المستعملة', 'Inputs used'));
    kids.push(h('div', { class: 'cai-ex' }, h('p', { class: 'cai-fine' }, h('b', null, bi('القاعدة: ', 'Rule: ')), bi(RULE[rec.rule].ar, RULE[rec.rule].en)),
      h('p', { class: 'cai-fine' }, h('b', null, bi('ما يغيّرها: ', 'What changes it: ')), bi(RULE[rec.rule].chg.ar, RULE[rec.rule].chg.en)),
      h('p', { class: 'cai-fine' }, h('b', null, bi('حساب الثقة: ', 'How the score is built: ')), h('span', { class: 'cr-ltr' }, rec.base.toFixed(2)), ' ', rec.terms.map(function (x) { return h('span', { class: 'cai-term' }, h('span', { class: 'cr-ltr' }, (x.d >= 0 ? '+' : '−') + Math.abs(x.d).toFixed(2)), ' ', bi(x.ar, x.en), '; '); }))));
    kids.push(confNode(rec));
    return kids;
  }
  function ruleName(r) { return { verify: T('تحقق', 'verify'), dispatch: T('إرسال', 'dispatch'), tradeoff: T('تنازع', 'tradeoff'), robot: T('روبوت', 'robot'), robotlimit: T('حدود الروبوت', 'robot limits'), swap: T('تبديل مسيّرة', 'drone swap'), thermal: T('حراري', 'thermal'), range: T('خارج المدى', 'out of range'), advisory: T('إرشاد السكان', 'advisory') }[r] || T(r, r); }
  function recSig(rec) { return JSON.stringify([rec.title, rec.why, rec.inputs.map(function (i) { return [i.k, i.v]; }), Math.round(rec.conf * 100), rec.fields.map(function (f) { return f.value; })]); }
  function makeCard(rec) {
    var art = h('article', { class: 'cai-rec cr-sev-' + rec.sev, role: 'listitem', 'data-key': rec.key, 'data-rule': rec.rule, 'data-alert': rec.alert || '' });
    var c = { el: art, rec: rec, sig: '', editing: false, confirm: false };
    var body = h('div', { class: 'cai-rec-b' }), mod = h('div', { class: 'cai-mod', hidden: true }), msg = h('p', { class: 'cai-msg', role: 'status', 'aria-live': 'polite' }), acts = h('div', { class: 'cai-acts cr-card-f' });
    c.body = body; c.mod = mod; c.msg = msg; c.acts = acts;
    c.bApprove = h('button', { type: 'button', class: 'cr-btn safe cai-approve', 'data-act': 'approve', onclick: function () { doApprove(c.rec.key, null); } });
    c.bModify = h('button', { type: 'button', class: 'cr-btn ghost cai-modify', 'data-act': 'modify', 'aria-expanded': 'false', onclick: function () { toggleModify(c); } }, icon('sliders'), bi('عدّل', 'Modify'));
    c.bDismiss = h('button', { type: 'button', class: 'cr-btn ghost cai-dismiss', 'data-act': 'dismiss', onclick: function () { doDismiss(c.rec.key); } }, icon('x'), bi('ارفض', 'Dismiss'));
    acts.append(c.bApprove, c.bModify, c.bDismiss);
    art.append(body, mod, acts, msg);
    fillCard(c, rec, true);
    return c;
  }
  function fillCard(c, rec, force) {
    c.rec = rec; var first = !c.sig, sig = recSig(rec) + (A.explain ? 'x' : '') + CR.lang();
    if (!force && sig === c.sig) { return; }
    if (c.editing) { c.pending = rec; return; }
    c.sig = sig; c.body.replaceChildren.apply(c.body, cardBody(rec));
    var lbl = rec.approveLabel; c.bApprove.replaceChildren(icon(rec.act.type === 'ack' ? 'check' : 'launch'), bi(c.confirm ? 'اضغط مرة أخرى للتأكيد' : lbl.ar, c.confirm ? 'Press again to confirm' : lbl.en));
    lab(c.bApprove, 'aria-label', lbl.ar + ' — ' + rec.title.ar, lbl.en + ' — ' + rec.title.en); lab(c.bModify, 'aria-label', 'عدّل ثم اعتمد — ' + rec.title.ar, 'Modify, then approve — ' + rec.title.en); lab(c.bDismiss, 'aria-label', 'ارفض التوصية — ' + rec.title.ar, 'Dismiss the recommendation — ' + rec.title.en);
    c.bModify.hidden = !rec.fields.length; c.bApprove.classList.toggle('is-confirm', !!c.confirm);
    c.el.className = 'cai-rec cr-sev-' + rec.sev + (rec.src === 'command' ? ' is-proposed' : '');
    var fill = c.body.querySelector('.cai-fill'); if (fill) { if ((first || Math.abs((c.lastConf || 0) - rec.conf) >= 0.03) && motionOk() && fill.animate) { try { fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(' + rec.conf + ')' }], { duration: 700, easing: 'cubic-bezier(.22,.8,.24,1)' }); } catch (e) { /* ignore */ } } }
    c.lastConf = rec.conf;
    if (c.mod && !c.mod.hidden) buildModify(c);
  }
  function toggleModify(c) {
    var on = c.mod.hidden; c.mod.hidden = !on; c.editing = on; setA(c.bModify, 'aria-expanded', String(on));
    if (on) { buildModify(c); var f = c.mod.querySelector('select,input'); if (f) f.focus(); } else if (c.pending) { var p = c.pending; c.pending = null; fillCard(c, p, true); }
  }
  function buildModify(c) {
    var rec = c.rec, ctrls = [];
    rec.fields.forEach(function (fd, i) {
      var id = 'cai-f-' + (++A.seq), sel = h('select', { class: 'cr-sel', id: id, 'data-field': fd.id });
      fd.options.forEach(function (o) { var op = h('option', { value: o.v }, plain(o.label)); if (o.v === (c.vals && c.vals[fd.id] != null ? c.vals[fd.id] : fd.value)) op.selected = true; sel.appendChild(op); });
      ctrls.push(h('div', { class: 'cai-fld' }, h('label', { for: id }, bi(fd.label.ar, fd.label.en)), sel));
    });
    var apply = h('button', { type: 'button', class: 'cr-btn safe sm', onclick: function () { var v = {}; c.mod.querySelectorAll('select[data-field]').forEach(function (s) { v[s.getAttribute('data-field')] = s.value; }); c.vals = v; doApprove(rec.key, v, true); } }, icon('check'), bi('طبّق ووافق', 'Apply and approve'));
    var cancel = h('button', { type: 'button', class: 'cr-btn ghost sm', onclick: function () { toggleModify(c); } }, bi('إلغاء', 'Cancel'));
    c.mod.replaceChildren(h('p', { class: 'cai-fine' }, bi('عدّل الخيار ثم اعتمد؛ يُسجَّل التعديل في سجل القرارات.', 'Change the option, then approve; the change is written to the audit list.')), h('div', { class: 'cai-modrow' }, ctrls), h('div', { class: 'cr-row' }, apply, cancel));
  }
  function doApprove(key, vals, modified) {
    var rec = recByKey(key); if (!rec) return null;
    var res = perform(rec, vals || {}), c = A.cards[key];
    A.lastRec = rec;
    if (res.confirm) { if (c) { c.confirm = true; c.sig = ''; fillCard(c, rec, true); setT(c.msg, nm(res.text)); c.msg.className = 'cai-msg warn'; } return res; }
    if (c) { c.confirm = false; setT(c.msg, nm(res.text)); c.msg.className = 'cai-msg ' + (res.ok ? 'ok' : 'bad'); }
    logAudit(modified ? 'modify' : (rec.act.type === 'ack' ? 'ack' : 'approve'), rec, res, { values: vals || null });
    CR.live(nm(res.text));
    if (res.ok) { A.done[key] = true; delete A.forced[key]; if (c) { c.editing = false; } CR.toast({ ar: nm0(res.text, 'ar'), en: nm0(res.text, 'en') }, 'safe', 3600); pushConvo(say(nm0(res.text, 'ar'), nm0(res.text, 'en'))); refresh(true); }
    return res;
  }
  function doDismiss(key) {
    var rec = recByKey(key); if (!rec) return null;
    A.dismissed[key] = true; delete A.forced[key]; A.undo.push({ kind: 'dismiss', key: key, alert: rec.alert });
    logAudit('dismiss', rec, okR('رُفضت التوصية بقرار بشري.', 'Recommendation dismissed by a human decision.')); A.lastRec = rec;
    CR.live(B('رُفضت التوصية', 'Recommendation dismissed'));
    refresh(true); return true;
  }
  function focusRec(key) {
    var c = A.cards[key]; if (!c) return; c.el.classList.add('cai-focus'); setTimeout(function () { c.el.classList.remove('cai-focus'); }, 2400);
    try { c.el.scrollIntoView({ block: 'nearest', behavior: CR.reduced() ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
  }
  function renderRecs(force) {
    if (!U.recList) return;
    var keys = {}, i;
    A.recs.forEach(function (r) { keys[r.key] = 1; });
    Object.keys(A.cards).forEach(function (k) {
      if (keys[k]) return; var c = A.cards[k]; delete A.cards[k];
      if (motionOk() && c.el.animate) { try { var an = c.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }); an.onfinish = function () { c.el.remove(); }; } catch (e) { c.el.remove(); } } else c.el.remove();
    });
    A.recs.forEach(function (r, idx) {
      var c = A.cards[r.key];
      if (!c) { c = A.cards[r.key] = makeCard(r); U.recList.appendChild(c.el); if (motionOk() && c.el.animate) { try { c.el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,.8,.24,1)' }); } catch (e) { /* ignore */ } } }
      else fillCard(c, r, !!force);
    });
    var prev = null; A.recs.forEach(function (r) { var el = A.cards[r.key].el; if (prev ? prev.nextSibling !== el : U.recList.firstChild !== el) U.recList.insertBefore(el, prev ? prev.nextSibling : U.recList.firstChild); prev = el; });
    U.recEmpty.hidden = A.recs.length > 0; setT(U.recCount, String(A.recs.length));
    lab(U.recCount, 'aria-label', 'عدد التوصيات: ' + A.recs.length, 'Number of recommendations: ' + A.recs.length);
  }

  /* ---- conversation, audit, what-if output ---- */
  function pushConvo(m) { m.t = m.t || Date.now(); A.convo.push(m); if (A.convo.length > 60) A.convo.shift(); if (U.convo) renderConvo(true); return m; }
  function renderConvo(animateLast) {
    if (!U.convo) return;
    var kids = A.convo.map(function (m) {
      if (m.who === 'me') return h('div', { class: 'cai-msg-me' }, h('span', { class: 'cai-who' }, bi('أنت', 'You')), h('span', { class: 'cai-txt', dir: 'auto' }, m.text));
      var body = [h('span', { class: 'cai-who' }, bi('المساعد', 'Assistant')), h('span', { class: 'cai-txt' }, bi(m.text.ar, m.text.en))];
      if (m.items && m.items.length) body.push(h('ul', { class: 'cai-items' }, m.items.map(function (x) { return h('li', null, bi(x.ar, x.en)); })));
      if (m.backend) body.push(h('span', { class: 'cr-badge warn cai-ext' }, bi('واجهة خارجية', 'external backend')));
      return h('div', { class: 'cai-msg-bot' + (m.pending ? ' pending' : '') }, body);
    });
    U.convo.replaceChildren.apply(U.convo, kids);
    var last = U.convo.lastElementChild;
    if (last && animateLast && motionOk() && last.animate) { try { last.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 }); } catch (e) { /* ignore */ } }
    U.convo.scrollTop = U.convo.scrollHeight;
  }
  function renderAudit() {
    if (!U.auditList) return;
    var rows = A.audit.slice(-60).reverse();
    U.auditList.replaceChildren.apply(U.auditList, rows.map(function (e) {
      return h('li', { class: 'cai-au ' + e.result, 'data-kind': e.kind }, h('div', { class: 'cai-au-h' }, h('span', { class: 'cr-ltr cai-au-t' }, e.clock.slice(0, 8)), h('span', { class: 'cr-badge' }, bi(AU_KIND[e.kind] ? AU_KIND[e.kind].ar : e.kind, AU_KIND[e.kind] ? AU_KIND[e.kind].en : e.kind)),
        e.alert ? h('span', { class: 'cr-badge cool cr-ltr' }, e.alert) : null, h('span', { class: 'cr-badge ' + (e.result === 'ok' ? 'safe' : e.result === 'failed' ? 'danger' : '') }, bi(e.result === 'ok' ? 'نُفّذ' : e.result === 'failed' ? 'لم يُنفَّذ' : '—', e.result === 'ok' ? 'done' : e.result === 'failed' ? 'not done' : '—'))),
        h('p', { class: 'cai-au-w' }, h('b', null, bi('من: ', 'Who: ')), bi(e.who.ar, e.who.en), ' · ', h('b', null, bi('ماذا: ', 'What: ')), bi(e.title.ar, e.title.en)),
        e.why && (e.why.ar || e.why.en) ? h('p', { class: 'cai-au-y' }, h('b', null, bi('لماذا: ', 'Why: ')), bi(e.why.ar, e.why.en)) : null,
        e.detail && (e.detail.ar || e.detail.en) ? h('p', { class: 'cai-fine' }, bi(e.detail.ar, e.detail.en)) : null);
    }));
    U.auditEmpty.hidden = A.audit.length > 0; setT(U.auditCount, String(A.audit.length));
  }
  var AU_KIND = { approve: T('اعتماد', 'approve'), modify: T('تعديل', 'modify'), dismiss: T('رفض', 'dismiss'), command: T('أمر', 'command'), undo: T('تراجع', 'undo'), ack: T('علم', 'acknowledged') };
  function renderWhatIf() {
    var r = A.lastWhatIf; if (!U.wiOut) return;
    if (!r || !r.ok) { U.wiOut.replaceChildren(); return; }
    var tbl = h('table', { class: 'cai-table' }, h('thead', null, h('tr', null, h('th', null, bi('البند', 'Item')), h('th', null, bi('الآن', 'Now')), h('th', null, bi('ماذا لو', 'What if')))), h('tbody', null, r.rows.map(function (x) { return h('tr', null, h('th', { scope: 'row' }, bi(x.k.ar, x.k.en)), h('td', null, valNode(x.a)), h('td', null, valNode(x.b))); })));
    U.wiOut.replaceChildren(h('div', { class: 'cr-card cool cai-wicard' }, h('div', { class: 'cr-card-h' }, h('b', null, bi(r.title.ar, r.title.en)), CR.simTag()), h('div', { class: 'cai-table-wrap' }, r.rows.length ? tbl : null), h('p', { class: 'cai-verdict' }, bi(r.verdict.ar, r.verdict.en)),
      h('p', { class: 'cai-fine' }, bi('رُدَّ كل شيء إلى حاله: لم يتغيّر شيء في المحاكاة.', 'Everything was put back: nothing changed in the simulation.'))));
  }
  function fillWiLists() {
    if (!U.wiAlert) return;
    var f = facts(); if (!f) return;
    var cur = U.wiAlert.value, curD = U.wiDrone.value;
    U.wiAlert.replaceChildren.apply(U.wiAlert, f.open.map(function (a) { var o = h('option', { value: a.id }, a.id + ' · ' + nm(hzT(a.hazard)) + ' · ' + nm(placeT(a))); if (a.id === cur) o.selected = true; return o; }));
    if (!f.open.length) U.wiAlert.appendChild(h('option', { value: '' }, B('لا إنذارات مفتوحة', 'no open alerts')));
    var sel = f.drones.slice().sort(function (x, y) { return x.callsign < y.callsign ? -1 : 1; });
    U.wiDrone.replaceChildren.apply(U.wiDrone, sel.map(function (d) { var o = h('option', { value: d.callsign }, d.callsign + ' · ' + nm(d.stateText) + ' · ' + d.batteryPct + '%'); if (d.callsign === curD) o.selected = true; return o; }));
    fillWiKindLabels();
  }
  function runWhatIfUi() {
    var kind = U.wiKind.value, spec = { kind: kind, alert: U.wiAlert.value, drone: U.wiDrone.value }, r = whatIf(spec);
    if (!r.ok) { U.wiOut.replaceChildren(h('p', { class: 'cai-fine' }, bi(r.text.ar, r.text.en))); return; }
    logAudit('command', null, null, { rule: 'whatif:' + kind, title: T('ماذا لو: ' + nm0(r.title, 'ar'), 'What-if: ' + nm0(r.title, 'en')), why: r.verdict, detail: r.verdict, alert: r.alert, src: 'whatif' });
    CR.live(nm(r.verdict));
  }
  function nm0(o, l) { return o ? o[l] : ''; }
  function copySitrep() {
    CR.copyText(sitrepText()).then(function (ok) { CR.toast(ok ? { ar: 'نُسخ تقرير الموقف', en: 'SITREP copied' } : { ar: 'تعذّر النسخ', en: 'Copy failed' }, ok ? 'safe' : 'warn', 2200); CR.live(B(ok ? 'نُسخ تقرير الموقف' : 'تعذّر النسخ', ok ? 'SITREP copied' : 'Copy failed')); });
  }
  function copyAudit() { CR.copyText(JSON.stringify(auditObject(), null, 2)).then(function (ok) { CR.toast(ok ? { ar: 'نُسخ سجل القرارات', en: 'Audit copied' } : { ar: 'تعذّر النسخ', en: 'Copy failed' }, ok ? 'safe' : 'warn', 2200); }); }
  function exportAudit(fmt) {
    var ok = fmt === 'csv' ? CR.dl('manara-commander-audit.csv', 'text/csv', auditCsv()) : CR.dl('manara-commander-audit.json', 'application/json', JSON.stringify(auditObject(), null, 2));
    CR.toast(ok ? { ar: 'صُدِّر سجل القرارات', en: 'Audit exported' } : { ar: 'تعذّر التصدير', en: 'Export failed' }, ok ? 'safe' : 'warn', 2200);
    return ok;
  }
  function printSitrep() {
    if (!U.printDoc) return false;
    refresh(true);
    var kids = [h('h1', null, B('تقرير الموقف — منارة (محاكاة)', 'SITREP — MANARA (simulation)')), h('p', null, B('المساعد القائد: دعم قرار قائم على قواعد (ليس نموذج لغة). الوقت: ساعة المحاكاة.', 'Commander assistant: rule-based decision support (not a language model). Time: the simulation clock.'))];
    kids.push(h('ul', null, A.sitrep.lines.map(function (x) { return h('li', null, nm(x)); })));
    kids.push(h('h2', null, B('توصيات بانتظار القرار', 'Recommendations waiting for a decision')));
    kids.push(h('ol', null, A.recs.map(function (r) { return h('li', null, nm(r.title) + ' — ' + B('ثقة ', 'confidence ') + pct(r.conf)); })));
    U.printDoc.replaceChildren.apply(U.printDoc, kids);
    doc.body.classList.add('cai-printing');
    try { win.print(); } catch (e) { /* printing may be blocked */ }
    setTimeout(function () { doc.body.classList.remove('cai-printing'); }, 1000);
    return true;
  }

  /* ====================================================================================
   * 12. REFRESH LOOP + TAB CONTRACT
   * ==================================================================================== */
  function refresh(force) {
    var t = now(); if (!force && t - A.lastAt < REFRESH_MS) return;
    if (!S.ready || !S.snap) return; A.lastAt = t;
    try { computeRecs(force); A.sitrep.lines = buildSitrep(); A.sitrep.text = sitrepText(A.sitrep.lines); A.sitrep.at = t; } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } return; }
    if (A.built && (A.active || force)) { renderRecs(); renderSitrep(); renderAudit(); if (A.active) fillWiLists(); }
  }
  function setMotion() { if (U.root) U.root.setAttribute('data-motion', A.active && motionOk() ? 'on' : 'off'); }
  function active(on) { A.active = !!on; setMotion(); if (on) { refresh(true); renderBackendNote(); } else finishTyping(); }
  function update() { refresh(false); setMotion(); }
  function badge() { return A.recs.length || ''; }
  CR.hooks.uiTick.push(function () { refresh(false); });
  CR.on('lang', function () { finishTyping(); if (A.built) { fillWiKindLabels(); fillWiLists(); renderRecs(true); renderSitrep(true); renderConvo(); renderAudit(); renderWhatIf(); renderBackendNote(); } });
  CR.on('reset', function () { A.recs = []; A.cards = {}; A.dismissed = {}; A.done = {}; A.forced = {}; A.issued = {}; A.undo = []; A.lastRec = null; A.lastWhatIf = null; if (U.recList) { U.recList.replaceChildren(); renderWhatIf(); } A.lastAt = 0; });
  doc.addEventListener('visibilitychange', function () { if (doc.hidden) finishTyping(); setMotion(); });
  CR.registerTab({ id: TAB, icon: 'commander', ar: 'القائد', en: 'Commander', build: build, update: update, active: active, badge: badge });

  /* ====================================================================================
   * 13. PUBLIC API (tests, automation, the documented backend hook)
   * ==================================================================================== */
  CR.mods.ai = {
    state: A, version: 1, label: T('المساعد القائد — دعم قرار قائم على قواعد (ليس نموذج لغة)', 'Commander assistant — rule-based decision support (not a language model)'),
    setBackend: function (fn) { if (fn != null && typeof fn !== 'function') throw new TypeError('setBackend(fn): fn must be a function(prompt, context) -> text | Promise<text>, or null'); A.backend = fn || null; renderBackendNote(); return !!A.backend; },
    backend: function () { return A.backend; },
    refresh: function (force) { A.lastAt = 0; refresh(force !== false); return A.recs.length; },
    recs: function () { return A.recs.map(function (r) { return { key: r.key, rule: r.rule, alert: r.alert, sev: r.sev, title: r.title, why: r.why, inputs: r.inputs.map(function (i) { return { k: plain(i.k), v: plain(i.v) }; }), confidence: r.conf, confidencePct: Math.round(r.conf * 100), act: r.act.type, src: r.src || 'rule', fields: r.fields.map(function (f) { return { id: f.id, value: f.value, options: f.options.map(function (o) { return o.v; }) }; }) }; }); },
    sitrep: function (lang) { return sitrepText(A.sitrep.lines, lang); }, sitrepLines: function () { return A.sitrep.lines.map(function (x) { return { id: x.id, ar: x.ar, en: x.en }; }); },
    approve: function (key, vals) { var r = doApprove(key, vals || null, !!(vals && Object.keys(vals).length)); return r ? { ok: r.ok, confirm: !!r.confirm, text: r.text } : null; }, dismiss: function (key) { return doDismiss(key); },
    run: function (text) { var r = runCommand(text); return r ? { ar: r.text.ar, en: r.text.en, items: (r.items || []).map(function (x) { return x.en; }), itemsAr: (r.items || []).map(function (x) { return x.ar; }) } : null; }, intent: intent, norm: norm,
    audit: function () { return A.audit.map(function (e) { return { id: e.id, kind: e.kind, rule: e.rule, alert: e.alert, result: e.result, role: e.role, title: e.title.en, why: e.why.en, src: e.src }; }); }, auditExport: auditObject, auditCsv: auditCsv, exportAudit: exportAudit,
    whatIf: function (spec) { var r = whatIf(spec); return r.ok ? { ok: true, kind: r.kind, alert: r.alert, rows: r.rows.map(function (x) { return { k: plain(x.k), a: plain(x.a), b: plain(x.b) }; }), verdict: r.verdict.en, delta: r.delta == null ? null : r.delta, changed: r.changed == null ? null : r.changed, title: r.title.en } : { ok: false, text: r.text.en }; },
    undo: function () { var r = doUndo(); return r.text.en; }, explain: setExplain, voice: setVoice, speechOk: speechOk, print: printSitrep, copy: copySitrep,
    convo: function () { return A.convo.map(function (m) { return { who: m.who, text: typeof m.text === 'string' ? m.text : m.text.en, ar: typeof m.text === 'string' ? m.text : m.text.ar, items: (m.items || []).map(function (x) { return x.en; }), backend: !!m.backend }; }); },
    facts: facts, robotInfo: robotInfo, focus: function () { CR.showTab(TAB); }, thresholds: { thermalLossC: THERMAL_LOSS_C, robotHotC: ROBOT_HOT_C }
  };
})();
