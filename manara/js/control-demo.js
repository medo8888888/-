/* MANARA («منارة») — the CONTROL ROOM, PRESETS  →  ControlRoom.mods.demo                                         (js/control-demo.js)
 * =====================================================================================================================
 * User requirement (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot".
 *   startDemo(o)   the one-click, auto-narrated DEMO STORY (about 4 minutes, narrated in #cr-demo, 7 steps; every step can be skipped with Next):
 *                    1 a drone on patrol sees smoke → 2 two keys (detector + thermal) put the alert in the queue with the feed → 3 the operator approves (the human key) →
 *                    4 the fastest-by-traffic units are dispatched, and why the runner-up lost → 5 the drone guides, the siren and the phones are alerted →
 *                    6 the rescue robot searches the building → 7 the shift handover summary
 *   startBusy(o)   a BUSY SHIFT: fire, someone needs help, gas, heat, a second fire found by a patrolling drone, then rain with a flood and a dust front — all open at the same time ({quiet:true} = no toast)
 *   quiet()        an empty console at the default clock          reset()   the same, and stops the story          stop()   end the narration only          next()   finish this step and go to the next
 *   state()        {preset, running, step, steps, alertId, incidentId, paused, done}  (tests and the shell read it)
 * The engine is the real ManaraNational (seeded, deterministic): the story creates a real, unseen incident next to a drone that is really on patrol, and then the engine does the rest
 * (a seeded detection chance, the drone's verification, the dispatch plan).  The story only steers the clock, the camera, the role and the panels; the human key is pressed by YOU
 * (or by the story after a few seconds, said out loud).  Everything is SIM; 999 stays the dispatcher; the robot is a concept with a simulated prototype.
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, CR = win.ControlRoom;
  if (!CR || !CR.S || !CR.h) return;
  var S = CR.S, h = CR.h, B = CR.B, bi = CR.bi, nm = CR.nm, N = CR.N, mmss = CR.mmss, icon = CR.icon, $ = CR.$, setT = CR.setT, isNum = CR.isNum;
  var OPTS_DEMO = { seed: 7, date: '2026-01-11', hour: 7.75 };          // Sunday morning rush hour (the opening scene of Mission Control: the fastest unit is not the nearest in a straight line)
  var OPTS_BUSY = { seed: 7, date: '2026-04-12', hour: 12.0 };          // a spring Sunday noon: warm enough for heat stress; rain and dust are plausible in April
  var DOHA = [51.5264, 25.2856];
  var D = { preset: 'none', running: false, paused: false, done: false, step: 0, steps: [], stepAt: 0, dwell: 0, pace: 1, alertId: null, incId: null, droneId: null, drone: null, sched: null, lock: false, approvedByStory: false, lastText: '', robotCalled: false, announced: false };
  var DEMO = [];                                                         // the steps (defined below)
  var el = null, ui = {};                                                // the narration bar: #cr-demo

  function NNs() { return CR.deps && CR.deps.NN; }
  function geo() { return CR.deps && CR.deps.GEO; }
  function hashFlags() { return (location.hash || '').replace(/^#/, '') + '&' + (location.search || '').replace(/^\?/, ''); }
  function quietHash() { return /(^|&)quiet(=1)?($|&)/.test(hashFlags()); }
  function demoHash() { return /(^|[&?])demo(=1)?($|&)/.test(hashFlags()); }

  /* ====================================================================================
   * 1. THE ENGINE AT THE RIGHT CLOCK
   * ==================================================================================== */
  // the page boots its first engine after the first paint: when the opening preset is already known, give it the right opts so no second engine has to be built
  if (!S.nat && !S.ready && !quietHash() && !demoHash()) Object.assign(S.opts, OPTS_BUSY);
  function isFresh(o) {
    var NN = NNs(); if (!S.nat || !S.snap || !NN) return false;
    var start = NN.timeAt(S.nat, o.date, o.hour);
    return S.opts.date === o.date && S.opts.hour === o.hour && S.opts.seed === o.seed && Math.abs(S.snap.t - start) < 1 && !S.alerts.length && !S.snap.incidents.length && !Object.keys(S.jams).length && !S.oplog.some(function (e) { return e.kind === 'operator' || e.kind === 'bus'; });
  }
  function toOpts(o, extra) {
    if (!isFresh(o)) CR.reset(Object.assign({ seed: o.seed, date: o.date, hour: o.hour, params: {}, speed: 30, role: 'operator', playing: true, autopilot: false }, extra || {}));
    else { S.speed = (extra && extra.speed) || 30; S.role = (extra && extra.role) || 'operator'; S.playing = true; CR.emit('speed', S.speed); CR.emit('role', S.role); }
    S.layers.hazard = 'off'; S.fieldsAt = -1; if (CR.ui && CR.ui.syncHud) CR.ui.syncHud();
  }
  function stop(silent) {
    if (D.running && !silent) CR.live(B('انتهى العرض', 'The story ended'));
    D.running = false; D.paused = false; D.step = 0; D.sched = D.preset === 'busy' ? D.sched : null;
    if (CR.ui) { if (CR.ui.hintAction) CR.ui.hintAction(null); if (CR.ui.setDemo) CR.ui.setDemo(false); }
    if (el) { el.hidden = true; el.replaceChildren(); ui = {}; }
  }
  function quiet() {
    stop(true); toOpts(OPTS_DEMO); D.preset = S.preset = 'quiet'; D.sched = null; D.done = false;
    CR.toast({ ar: 'مناوبة هادئة: لا إنذارات. المسيّرات في دورية.', en: 'Quiet shift: no alerts. The drones are on patrol.' }, 'safe', 3200);
  }
  function reset() { quiet(); }

  /* ====================================================================================
   * 2. THE BUSY SHIFT
   * ==================================================================================== */
  // a = seconds after the start of the shift; id / rx = a real place of the data; trg = how the control room learns of it
  var BUSY = [
    { at: 0, hz: 'fire', id: 'Pn1272809806', rx: /Al Sadd/, trg: 'sentinel', sev: 2 },
    { at: 0, hz: 'sos', id: 'Pn4773733636', rx: /West Bay/, trg: 'citizen', sev: 2 },
    { at: 0, hz: 'gas', id: 'Pw323447497', rx: /Industrial Area/, trg: 'sentinel', sev: 2 },
    { at: 90, hz: 'heat', id: 'Pr13418325', rx: /Mesaieed/, trg: 'sentinel', sev: 2 },
    { at: 240, hz: 'fire', id: 'Pn12795802220', rx: /Wukair/, trg: 'patrol', sev: 2 },
    { at: 330, weather: 'rain', id: 'Pn2189253861', rx: /Al Rayyan/ },
    { at: 420, hz: 'flood', id: 'Pn2189253861', rx: /Al Rayyan/, trg: 'sentinel', sev: 2 },
    { at: 540, weather: 'dust' },
    { at: 600, hz: 'dust', id: 'Pn2189240942', rx: /Umm Salal/, trg: 'sentinel', sev: 1 }
  ];
  function placeOf(d) {
    var G = geo(); if (!G || !d.id) return null; var ps = G.places || [], i;
    for (i = 0; i < ps.length; i++) if (ps[i].id === d.id) return ps[i];
    for (i = 0; i < ps.length; i++) if (d.rx && d.rx.test(ps[i].name.en)) return ps[i];
    return null;
  }
  function refresh() { D.lock = true; try { CR.afterSim(0); } finally { D.lock = false; } }
  function weather(kind, p) {
    var NN = NNs(), nat = S.nat; if (!NN || !nat) return;
    if (kind === 'rain' && p) { NN.addRainCell(nat, { lon: p.lon, lat: p.lat, radiusKm: 12, mmHr: 38, headingDeg: 90, speedKmh: 16, durationSec: 5400 }); S.layers.hazard = 'rain'; }
    if (kind === 'dust') { NN.startDust(nat, { deg: 315, mps: 12, t0: nat.t }); S.layers.hazard = 'dust'; }
    S.congDirty = true; S.fieldsVer = (S.fieldsVer || 0) + 1; S.fieldsAt = -1; S.tunnelsAt = -1e9;
    if (S.map) { S.map.invalidate('base'); S.map.dirty = true; } if (CR.ui && CR.ui.syncHud) CR.ui.syncHud();
  }
  function injectOne(d) {
    var NN = NNs(), p = placeOf(d); if (!NN || !S.nat) return null;
    if (d.weather) { weather(d.weather, p); return null; }
    if (!p) return null;
    var inc = NN.createIncident(S.nat, { hazard: d.hz, lon: p.lon, lat: p.lat, severity: d.sev || 2, trigger: d.trg });
    if (inc && inc.status === 'cancelled') return null;
    return inc;
  }
  function busyTick() {
    var sc = D.sched; if (!sc || D.lock || !S.snap || D.preset !== 'busy') return;
    var due = [], t = S.snap.t - sc.t0;
    sc.items.forEach(function (it) { if (!it.done && t >= it.at) { it.done = true; due.push(it); } });
    if (!due.length) return;
    due.forEach(injectOne); refresh();
  }
  CR.hooks.afterStep.push(busyTick);
  function startBusy(o) {
    o = o || {}; stop(true); toOpts(OPTS_BUSY); D.preset = S.preset = 'busy'; D.done = false;
    D.sched = { t0: S.snap.t, items: BUSY.map(function (b) { return Object.assign({ done: false }, b); }) };
    busyTick();
    if (!o.quiet) {
      CR.toast({ ar: 'مناوبة مزدحمة: حريق وغاز وإجهاد حراري وشخص يحتاج مساعدة، ثم مطر وسيول وغبار — كلها مفتوحة معًا (محاكاة)', en: 'Busy shift: fire, gas, heat stress and someone who needs help, then rain, a flood and dust — all open together (SIM)' }, 'warn', 5200);
      CR.live(B('بدأت مناوبة مزدحمة', 'A busy shift has started')); if (CR.isNarrow()) CR.showTab('queue');
    }
    return D.sched;
  }

  /* ====================================================================================
   * 3. THE DEMO STORY
   * ==================================================================================== */
  function alertNow() { return D.alertId ? CR.alertOf(D.alertId) : null; }
  function incNow() { var l = S.snap ? S.snap.incidents : []; for (var i = 0; i < l.length; i++) if (l[i].id === D.incId) return l[i]; return null; }
  function findAlert() { if (!D.incId) return null; if (D.alertId) return alertNow(); var a = S.alerts.filter(function (x) { return x.incident === D.incId; })[0]; if (a) D.alertId = a.id; return a || null; }
  function placeName(lon, lat) { var p = NNs().nearestPlace(S.nat, lon, lat); return p ? nm(p.name) : B('قطر', 'Qatar'); }
  function ff(until, maxSec, stepSec) { var n = 0; while (!until() && n < maxSec) { CR.api.step(stepSec); n += stepSec; } return until(); }
  function fly(a, ms) { if (a) CR.flyToAlert(a, ms); }
  function setSpeed(v) { CR.api.setSpeed(v); CR.api.setPlaying(!D.paused); }

  // 1: spawn a real, unseen incident a few hundred metres AHEAD of a drone that is really flying its patrol loop, so it passes over it within a minute or two (the engine still rolls its seeded dice)
  function pickPatrol() {
    var NN = NNs(), G = geo(), tries = 0, drones;
    function patrols() { return (S.snap.drones || []).filter(function (d) { return d.state === 'patrol'; }); }
    while (!(drones = patrols()).length && tries++ < 12) CR.api.step(120);
    if (!drones.length) return null;
    drones.sort(function (a, b) { return NN.haversineM(a.lon, a.lat, DOHA[0], DOHA[1]) - NN.haversineM(b.lon, b.lat, DOHA[0], DOHA[1]); });
    for (var di = 0; di < drones.length; di++) {
      var d = drones[di], hd = d.headingDeg * Math.PI / 180, ahead = [800, 650, 500, 950, 1100, 400], side = [0, 150, -150, 300, -300];
      for (var i = 0; i < ahead.length; i++) for (var j = 0; j < side.length; j++) {
        var e = ahead[i] * Math.sin(hd) + side[j] * Math.cos(hd), n = ahead[i] * Math.cos(hd) - side[j] * Math.sin(hd), ll = NN.offsetLL(d.lon, d.lat, e, n);
        if (!G.inLand(ll[0], ll[1]) || !NN.edgeAt(S.nat, ll[0], ll[1], 350)) continue;
        var inc = NN.createIncident(S.nat, { hazard: 'fire', lon: ll[0], lat: ll[1], severity: 2, trigger: 'patrol' });
        if (inc && inc.status !== 'cancelled') return { drone: d, inc: inc };
      }
    }
    return null;
  }
  function spawn() {
    var pk = pickPatrol();
    if (!pk) {                                                           // no drone on patrol and no usable loop: a sentinel alarm in Doha keeps the story going (the story says so)
      var inc = NNs().createIncident(S.nat, { hazard: 'fire', lon: 51.5326, lat: 25.3224, severity: 2, trigger: 'sentinel' }); D.incId = inc.id; D.droneId = null; D.drone = null; D.sentinelFallback = true; refresh(); return;
    }
    D.incId = pk.inc.id; D.droneId = pk.drone.id; D.drone = pk.drone; D.sentinelFallback = false; refresh();
  }
  function ensureAlert() {
    if (findAlert()) return;
    if (!ff(findAlert, 900, 10)) {                                       // nobody found it in 15 simulated minutes: a bystander report, in the same place
      var inc = incNow(); if (inc) { var c = NNs().createIncident(S.nat, { hazard: 'fire', lon: inc.lon, lat: inc.lat, severity: 2, trigger: 'sentinel' }); NNs().cancelIncident(S.nat, D.incId); D.incId = c.id; refresh(); findAlert(); }
    }
  }

  // a real fire can be MISSED (the drone's two keys are seeded dice): the story does not hide that. If the drone dismissed its own alert, a sentinel alarm from the same place puts the incident back in the queue
  function recoverAlert() {
    var a = alertNow(), NN = NNs(), inc = incNow(); if (!a || a.state !== 'DISMISSED' || !inc) return false;
    var lon = inc.lon, lat = inc.lat; try { NN.cancelIncident(S.nat, D.incId); } catch (e) { /* ignore */ }
    var c = NN.createIncident(S.nat, { hazard: 'fire', lon: lon, lat: lat, severity: 2, trigger: 'sentinel' });
    D.incId = c.id; D.alertId = null; D.recovered = true; refresh(); findAlert();
    ff(function () { var x = findAlert(); return !!x && (x.state !== 'SUSPECT' || !!x.verdict); }, 600, 10);
    if (CR.selectAlert && alertNow()) CR.selectAlert(D.alertId);
    return true;
  }

  DEMO = [
    { id: 'patrol', t: ['مسيّرة في دورية ترى دخانًا', 'A drone on patrol sees smoke'], speed: 10, min: 11000, max: 45000,
      enter: function () {
        CR.setRole('operator'); CR.api.step(360); spawn(); S.view = 'map'; CR.showTab('map');
        var dr = D.droneId ? S.drones[D.droneId] : null, inc = incNow();
        if (dr && inc) { CR.setSelDrone(D.droneId); S.map.fitBounds(CR.bboxOf([[dr.lon, dr.lat], [inc.lon, inc.lat]], 3), 70, 900); }
        else if (inc) S.map.fitBounds(CR.bboxOf([[inc.lon, inc.lat]], 4), 70, 900);
      },
      text: function () {
        var inc = incNow(), dr = D.droneId && S.drones[D.droneId] ? S.drones[D.droneId].row : null, pl = inc ? placeName(inc.lon, inc.lat) : '';
        return D.sentinelFallback ? [B('لا مسيّرة في دورية الآن، فنبدأ بإنذار من حسّاس. المسيّرة ستُطلَق للتحقق.', 'No drone is on patrol right now, so we start with a sentinel alarm. A drone will be launched to verify.')]
          : [B('المسيّرة ', 'Drone ') + (dr ? dr.callsign : '') + B(' تدور في قطاعها قرب ', ' is flying its patrol loop near ') + pl + B('. هناك حريق بدأ للتو ولم يبلّغ عنه أحد: لا حسّاس ولا مواطن بعد. العين الأولى هي المسيّرة.', '. A fire has just started and nobody has reported it: no sensor and no citizen yet. The first eyes are the drone’s.')];
      },
      done: function () { return !!findAlert(); }, finish: function () { ensureAlert(); } },
    { id: 'keys', t: ['مفتاحان: الكاشف + الحراري', 'Two keys: detector + thermal'], speed: 10, min: 14000, max: 50000,
      enter: function () { var a = findAlert(); if (a) { CR.selectAlert(a.id); if (a.droneId) CR.setSelDrone(a.droneId); } CR.showTab('feed'); },
      text: function () {
        var a = findAlert(); if (!a) return [B('بانتظار الإنذار…', 'Waiting for the alert…')];
        if (D.recovered) return [B('نظرة المسيّرة الأولى لم تجد دليلًا وأسقطت إنذارها — وهذا يحدث في الواقع: قد يفوت الحريق الحقيقي. لذلك يصل إنذار من حسّاس من المكان نفسه، وتتحقق مسيّرة منه، ويبقى القرار بيدك.', 'The patrol drone’s first look found no evidence and dismissed its own alert — that can happen in real life: a real fire can be missed. So a sentinel alarm arrives from the same place, a drone verifies it, and the decision stays yours.')];
        var ev = a.evidence || {}, v = ev.vision && ev.vision.seen, t = ev.thermal && ev.thermal.seen, cv = ev.vision && isNum(ev.vision.conf) ? Math.round(ev.vision.conf * 100) : null, ct = ev.thermal && isNum(ev.thermal.conf) ? Math.round(ev.thermal.conf * 100) : null;
        if (v && t) return [B('الكاشف (رؤية حاسوبية بقواعد، وليست تعلّمًا آليًا) رأى لهبًا ودخانًا' + (cv != null ? ' بثقة ' + N(cv) + '٪' : '') + '، والكاميرا الحرارية رأت نقطة ساخنة' + (ct != null ? ' بثقة ' + N(ct) + '٪' : '') + '. مفتاحان مستقلان = «مؤكَّد». الإنذار ظهر في الطابور وبثّ المسيّرة أمامك.',
          'The detector (rule-based computer vision, not machine learning) sees flames and smoke' + (cv != null ? ' with ' + N(cv) + ' % confidence' : '') + ', and the thermal camera sees a hotspot' + (ct != null ? ' with ' + N(ct) + ' % confidence' : '') + '. Two independent keys = “confirmed”. The alert is in the queue and the drone’s feed is in front of you.')];
        return [B('ظهر الإنذار في الطابور بمفتاح واحد: «يحتاج إثباتًا». المسيّرة تطير إلى الموقع لتأخذ المفتاح الثاني من الكاميرا الحرارية. لا شيء يُرسَل للناس قبل ذلك.', 'The alert is in the queue with one key: “needs proof”. The drone is flying in to get the second key from the thermal camera. Nothing is sent to the public before that.')];
      },
      done: function () { var a = alertNow(); return !!a && (a.state !== 'SUSPECT' || !!a.verdict); },
      finish: function () { var a = alertNow(); if (a && a.state === 'SUSPECT' && !a.verdict) ff(function () { var x = alertNow(); return !x || x.state !== 'SUSPECT' || !!x.verdict; }, 600, 10); recoverAlert(); } },
    { id: 'approve', t: ['المشغّل يعتمد — المفتاح البشري', 'The operator approves — the human key'], speed: 10, min: 6000, max: 26000, pause: true,
      enter: function () {
        recoverAlert(); if (!CR.can('operator')) CR.setRole('operator'); var a = alertNow(); if (a) { CR.selectAlert(a.id); if (CR.ui && CR.ui.hintAction) CR.ui.hintAction(a.id, 'approve'); } CR.showTab(CR.isNarrow() ? 'queue' : 'feed'); D.approvedByStory = false;
        CR.api.setPlaying(false);
      },
      text: function () { return [B('دورك: اضغط «وافق» (أو A) على بطاقة الإنذار. لن يصل الناس إنذار عام ولن تتحرك الوحدات قبل مفتاحك. إن لم تضغط خلال لحظات فسيعتمد العرض بدلًا عنك، وسيقول ذلك.', 'Your turn: press Approve (or A) on the alert card. No public alert reaches anyone and no unit rolls before your key. If you do not press it within a few seconds, the story approves for you and says so.')]; },
      done: function () { var a = alertNow(); return !!a && (CR.STATE_RANK[a.state] >= 2 || CR.isFinal(a)); },
      timeout: function () { approveForYou(); },
      finish: function () { approveForYou(); if (CR.ui && CR.ui.hintAction) CR.ui.hintAction(null); CR.api.setPlaying(!D.paused); } },
    { id: 'dispatch', t: ['إرسال الأسرع بحسب الازدحام', 'The fastest-by-traffic units are dispatched'], speed: 30, min: 15000, max: 50000,
      enter: function () { CR.showTab('dispatch'); var a = alertNow(); if (a) { fly(a, 900); } if (CR.ui && CR.ui.hintAction) CR.ui.hintAction(null); },
      text: function () { return [B('اختارت منارة الوحدة الأسرع وصولًا بحسب الازدحام الآن، وليست الأقرب بخط مستقيم. ', 'MANARA picks the unit that arrives fastest given the traffic right now, not the nearest in a straight line. ') + unitsLine()]; },
      why: function () { return whyBox(); },
      done: function () { var i = incNow(); return !!i && !!i.plan && i.plan.units.some(function (u) { return u.state === 'en-route' || u.state === 'on-scene'; }); },
      finish: function () { ensureDispatched(); } },
    { id: 'guide', t: ['المسيّرة ترشد والصافرة والهواتف تُنذَر', 'The drone guides; the siren and the phones are alerted'], speed: 30, min: 15000, max: 40000,
      enter: function () {
        CR.showTab('comms'); announce();
      },
      text: function () { return [B('تبقى المسيّرة فوق الموقع وتبثّ تعليمات بصوتها (محاكاة)، وتُرسَل ' + N(S.bus.alert) + ' تنبيهات عامة إلى الهواتف القريبة (افتح «هواتف السكان» في نافذة أخرى لتراها). صافرة الموقع المحلية لا تنتظر أحدًا. لا يصل الناس إنذار عام إلا بعد مفتاحك.',
        'The drone stays over the scene and speaks instructions (SIM), and ' + N(S.bus.alert) + ' public alert message(s) go to the nearby phones (open “Resident Phones” in another window to see them). The local siren never waits for anyone. People get a public alert only after your key.')]; },
      done: function () { return true; }, finish: function () { announce(); } },
    { id: 'robot', t: ['الروبوت يبحث داخل المبنى', 'The robot searches the building'], speed: 30, min: 22000, max: 60000,
      enter: function () { CR.showTab('robot'); startRobot(); },
      text: function () { return [B('بعد موافقة قائد الحادث ينزل روبوت الإنقاذ إلى المبنى حيث لا ينبغي أن يدخل الناس أولًا: يبحث في الغرف بحسب الأولوية، ويجد الأشخاص بالحرارة والصوت، ويرشدهم بلغتهم، ويبلّغ رجال الإطفاء. هو يساعد، والإطفائيون يقررون. (مفهوم + نموذج أولي محاكى)', 'After the incident commander approves, the rescue robot goes into the building where people should not go first: it searches rooms in priority order, finds people by heat and sound, guides them in their own language and reports to the firefighters. It assists; the firefighters decide. (Concept + simulated prototype)')]; },
      done: function () { return true; }, finish: function () { startRobot(); } },
    { id: 'handover', t: ['ملخّص التسليم', 'The handover summary'], speed: 10, min: 0, max: 0, last: true,
      enter: function () { CR.showTab('handover'); },
      text: function () {
        var a = alertNow(), ap = S.decisions.filter(function (d) { return d.type === 'approve' && d.alert === D.alertId; })[0], ts = a && a.tState || {}, inc = incNow(), eta = inc && isNum(inc.firstEtaSec) ? inc.firstEtaSec : null;
        return [B('انتهت القصة. الإنذار ' + D.alertId + ' اعتُمد' + (ap ? ' بعد ' + mmss(ap.afterSec) + ' من ظهوره' : '') + (eta != null ? '، وقُدِّر وصول أول وحدة بعد ' + mmss(eta) : '') + ' (محاكاة). كل قرار بشري سُجّل في سجل الاتصالات وفي ملخص التسليم. أعد القصة أو أغلقها.',
          'The story is over. Alert ' + D.alertId + ' was approved' + (ap ? ' ' + mmss(ap.afterSec) + ' after it appeared' : '') + (eta != null ? ', and the first unit was estimated to arrive after ' + mmss(eta) : '') + ' (SIM). Every human decision was written to the comms log and the handover summary. Restart the story or close it.')];
      },
      done: function () { return false; }, finish: function () { /* nothing: the last step */ } }
  ];
  function approveForYou() {
    var a = alertNow(); if (!a || CR.STATE_RANK[a.state] >= 2 || CR.isFinal(a)) return;
    if (!CR.can('operator')) CR.setRole('operator'); D.approvedByStory = true; CR.approveAlert(a.id, { force: true });
    CR.toast({ ar: 'العرض اعتمد الإنذار بدلًا عنك (في الواقع هذا قرارك أنت)', en: 'The story approved the alert for you (in real life this is your decision)' }, 'warn', 4200);
  }
  function ensureDispatched() {
    var a = alertNow(); if (a && CR.STATE_RANK[a.state] < 2) approveForYou();
    ff(function () { var i = incNow(); return !!i && !!i.plan && i.plan.units.some(function (u) { return u.state === 'en-route' || u.state === 'on-scene'; }); }, 900, 5);
  }
  function planUnits() { var i = incNow(); return i && i.plan ? i.plan.units.filter(function (u) { return u.unitId && !u.optional; }) : []; }
  function unitsLine() {
    var us = planUnits(); if (!us.length) return B('تُحسَب الخطة…', 'Computing the plan…');
    return us.slice(0, 4).map(function (u) { return nm(u.name) + ' ' + (isNum(u.etaSec) ? mmss(u.etaSec) : '–'); }).join(B('، ', ', '));
  }
  // why the runner-up lost: the engine's own explanation of the unit that is farther away and still faster, otherwise of the first unit
  function whyBox() {
    var us = planUnits(); if (!us.length) return null;
    var u = us.filter(function (x) { return x.whyData && x.whyData.farButFaster; })[0] || us[0], ru = u.runnerUp;
    var parts = [h('b', null, B('لماذا هذه الوحدة؟ ', 'Why this unit? ')), nm(u.why)];
    if (ru && ru.name) parts.push(' ', B('الوحدة التالية: ', 'Runner-up: ') + nm(ru.name) + (isNum(ru.etaSec) ? ' (' + mmss(ru.etaSec) + (isNum(u.etaSec) && ru.etaSec > u.etaSec ? B('، أبطأ بـ ', ', slower by ') + mmss(ru.etaSec - u.etaSec) : '') + ')' : ''));
    return parts;
  }
  function announce() {
    if (D.announced) return; var NN = NNs(), a = alertNow(), dr = a && a.droneId ? S.drones[a.droneId] : null; if (!dr || !dr.row || !(dr.row.state === 'on-station' || dr.row.state === 'verifying')) return;
    var key = Object.keys(NN.MSG).filter(function (k) { return k.indexOf('nat.drone.say.') === 0; })[0]; if (!key) return;
    var r = CR.announceVia(a.droneId, key, CR.lang()); if (r && r.ok) D.announced = true;
  }
  // the robot tab (js/control-robot.js): link its building scenario to the alert, an operator requests, the incident commander approves (the human key), then it runs
  function startRobot() {
    if (D.robotCalled) return; var m = CR.mods.robot; if (!m) return; D.robotCalled = true;
    try {
      var a = alertNow(), v = a && typeof m.link === 'function' ? m.link(a.id) : null;
      if (!v && typeof m.demo === 'function') v = m.demo();                                // not a building fire / gas alert: the demo building
      if (!v) return;
      if (!CR.can('operator')) CR.setRole('operator');
      if (typeof m.request === 'function') m.request();
      CR.setRole('commander');                                                              // the story says so: only the incident commander can send the robot in
      if (typeof m.approve === 'function') m.approve();
      if (typeof m.setSpeed === 'function') m.setSpeed(20); if (typeof m.play === 'function') m.play(true);
    } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
  }

  /* ---- narration bar ---- */
  function build() {
    el = $('#cr-demo'); if (!el) return false;
    el.hidden = false; el.replaceChildren(); el.setAttribute('role', 'region'); CR.lab(el, 'aria-label', 'قصة العرض: شرح مباشر', 'Demo story: live narration');
    ui.steps = h('ol', { class: 'cr-demo-steps' }, DEMO.map(function (s, i) { return h('li', { 'data-i': i + 1 }, String(i + 1)); }));
    ui.title = h('b', { class: 'cr-demo-t' }); ui.count = h('span', { class: 'cr-demo-n mono' });
    ui.p = h('p', { class: 'cr-demo-p' }); ui.why = h('p', { class: 'cr-demo-why', hidden: true }); ui.bar = h('i');
    ui.next = CR.btn('btn btn-primary btn-sm', 'skip', 'التالي', 'Next', function () { next(); });
    ui.pauseT = h('span'); ui.pauseIc = icon('pause'); ui.pause = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-pressed': 'false', onclick: function () { pauseToggle(); } }, ui.pauseIc, ui.pauseT);
    ui.again = CR.btn('btn btn-primary btn-sm', 'reset', 'أعد القصة', 'Restart the story', function () { startDemo(); }); ui.again.hidden = true;
    ui.stop = CR.btn('btn btn-ghost btn-sm', 'x', 'أغلق', 'Close', function () { stop(); });
    el.append(h('div', { class: 'cr-demo-h' }, ui.steps, ui.title, ui.count, CR.simTag()), ui.p, ui.why, h('div', { class: 'cr-demo-bar', 'aria-hidden': 'true' }, ui.bar), h('div', { class: 'cr-demo-acts' }, ui.next, ui.pause, ui.again, ui.stop));
    return true;
  }
  function render(force) {
    if (!el || !D.running) return; var s = DEMO[D.step]; if (!s) return;
    var tn = CR.now(); if (!force && tn - (D.renderAt || 0) < 450) return; D.renderAt = tn;
    var txt = s.text().join(' ') + '|' + (D.done ? 'd' : '') + (D.paused ? 'p' : '') + CR.lang() + (s.why ? JSON.stringify((s.why() || []).map(function (x) { return typeof x === 'string' ? x : x.textContent; })) : '');
    if (txt === D.lastText && !force) return; D.lastText = txt;
    setT(ui.title, B(s.t[0], s.t[1])); setT(ui.count, B('الخطوة ', 'Step ') + N(D.step + 1) + '/' + N(DEMO.length));
    ui.p.replaceChildren(s.text().join(' ')); var w = s.why ? s.why() : null; ui.why.hidden = !w; if (w) ui.why.replaceChildren.apply(ui.why, w);
    Array.prototype.forEach.call(ui.steps.children, function (li, i) { li.className = i < D.step ? 'done' : (i === D.step ? 'now' : ''); li.setAttribute('aria-current', i === D.step ? 'step' : 'false'); if (i < D.step && !li.querySelector('.i')) { li.replaceChildren(icon('check')); } else if (i >= D.step && li.querySelector('.i')) li.replaceChildren(String(i + 1)); });
    ui.next.hidden = !!s.last; ui.pause.hidden = !!s.last; ui.again.hidden = !s.last;
    setT(ui.pauseT, D.paused ? B('استئناف', 'Resume') : B('إيقاف مؤقت', 'Pause')); CR.setA(ui.pause, 'aria-pressed', String(D.paused));
    var want = D.paused ? 'play' : 'pause'; if (ui.pauseIc.getAttribute('data-ic') !== want) { var n = icon(want); n.setAttribute('data-ic', want); ui.pause.replaceChild(n, ui.pauseIc); ui.pauseIc = n; }
  }
  function go(i) {
    var s = DEMO[i]; if (!s) return;
    D.step = i; D.stepAt = CR.now(); D.dwell = 0; D.lastText = ''; D.done = false; D.timedOut = false; D.entering = true;
    try { s.enter(); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
    D.entering = false; D.stepAt = CR.now();
    if (s.speed && !s.pause) setSpeed(s.speed); if (s.pause) { CR.api.setSpeed(s.speed || 10); }
    render(true); CR.live(B('الخطوة ', 'Step ') + N(i + 1) + ': ' + B(s.t[0], s.t[1]) + '. ' + s.text().join(' '));
  }
  function next() {
    if (!D.running) return; var s = DEMO[D.step]; if (!s || s.last) return;
    try { s.finish(); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
    go(D.step + 1);
  }
  function pauseToggle() { D.paused = !D.paused; CR.api.setPlaying(!D.paused && !(DEMO[D.step] && DEMO[D.step].pause)); if (D.paused) D.stepPausedAt = CR.now(); else if (D.stepPausedAt) { D.stepAt += CR.now() - D.stepPausedAt; D.stepPausedAt = 0; } render(true); CR.live(D.paused ? B('أُوقف العرض مؤقتًا', 'The story is paused') : B('استؤنف العرض', 'The story resumed')); }
  // runs on every UI tick: the step ends when its condition holds and its minimum time has passed (or its maximum time ran out)
  function tick() {
    if (!D.running || D.paused || D.lock || D.entering) return; var s = DEMO[D.step]; if (!s) return;
    var now = CR.now(), el0 = (now - D.stepAt) / D.pace; D.done = s.done();
    if (ui.bar && s.max) ui.bar.style.setProperty('--w', Math.min(100, el0 / s.max * 100) + '%'); else if (ui.bar) ui.bar.style.setProperty('--w', '100%');
    render(false);
    if (s.last) return;
    if (el0 >= s.min && D.done) next();
    else if (s.max && el0 >= s.max) { if (s.timeout) s.timeout(); next(); }
  }
  CR.hooks.uiTick.push(tick);

  function startDemo(o) {
    o = o || {}; stop(true);
    toOpts(OPTS_DEMO); D.preset = S.preset = 'demo'; D.sched = null; D.pace = o.pace > 0 ? o.pace : 1; D.alertId = null; D.incId = null; D.droneId = null; D.drone = null; D.robotCalled = false; D.announced = false; D.approvedByStory = false; D.sentinelFallback = false; D.recovered = false;
    if (!build()) return null;
    D.running = true; D.paused = false; D.done = false; if (CR.ui && CR.ui.setDemo) CR.ui.setDemo(true);
    go(0); return D;
  }

  CR.on('lang', function () { render(true); });
  CR.on('reset', function () { if (D.running && !D.lock) stop(true); });                       // a reset from elsewhere ends the story
  var mod = CR.mods.demo = {
    startDemo: startDemo, startBusy: startBusy, quiet: quiet, reset: reset, stop: stop, next: next, plan: BUSY, opts: { demo: OPTS_DEMO, busy: OPTS_BUSY },
    isRunning: function () { return D.running; },
    state: function () { return { preset: D.preset, running: D.running, step: D.running ? D.step + 1 : 0, steps: DEMO.length, stepId: D.running && DEMO[D.step] ? DEMO[D.step].id : null, alertId: D.alertId, incidentId: D.incId, droneId: D.droneId, paused: D.paused, approvedByStory: D.approvedByStory, sentinelFallback: !!D.sentinelFallback, recovered: !!D.recovered }; }
  };
  // an engine that was already running when this file loaded gets the opening preset now
  function late() {
    if (S.preset !== 'none' || D.preset !== 'none') return;
    if (demoHash()) startDemo(); else if (quietHash()) { D.preset = S.preset = 'quiet'; } else startBusy({ quiet: true });
  }
  if (S.ready && CR.deps) setTimeout(late, 0);
})();
