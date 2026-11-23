/* MANARA («منارة») — the CONTROL ROOM, PANELS  →  FLEET · DISPATCH · COMMS · HANDOVER  (adds four tabs to window.ControlRoom)          (js/control-panels.js)
 * =====================================================================================================================
 * User requirements (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot" ·
 * "make so the nearst hospital or neasrest ploice or nearst fire fighting respomndes" · "its by how reaches there the fastest depending on traffic" · "I wnat it on the whole of Qatar".
 * The control room dispatches the responder that REACHES THE SCENE FASTEST given time-varying traffic (not merely the nearest), anywhere in Qatar, and it sees the drones that alert it.
 *
 *   FLEET     every drone of the engine (ManaraNational.fleetBoard): base, state, battery, link, range / ETA to the selected alert, assigned alert, payload, launch / reassign / recall controls (role-gated),
 *             the charging and repair queue, and the COVERAGE honesty card (a live sample of the seeded incident points + the A/B "first eyes" measurement: a third of incidents are out of range of every drone).
 *   DISPATCH  the plan of the selected alert: per needed service the chosen unit with its ETA by traffic (free-flow vs with traffic, the time-of-day pressure curve), road and straight-line distance, the
 *             runner-up and WHY the winner wins ("farther but faster" is flagged), a traffic-jam toggle that makes the engine re-evaluate, the re-dispatch history, drone-before-ground-unit, per-unit status
 *             (assigned → en route → on scene), approve / hold / cancel (role-gated), the CAP 1.2 export (status Exercise) and the standing reminder that 999 stays the dispatcher.
 *   COMMS     one log of everything: operator actions and rejections, the engine's drone comms, drone-speaker announcements, bus messages sent to the phones and received from other tabs
 *             (alert / dispatch / drone-alert / drone-status / robot / robot-find / citizen / detection), resident-phone messages; filter, search, export as a text file; a broadcast composer
 *             (zone × hazard × level with the MANARA_MSG templates in AR + EN; a drone-speaker announcement from the engine's reviewed phrases).
 *   HANDOVER  the shift handover report built from the oplog and the decisions: open incidents, decisions (who / when / why), units still committed, drones, outstanding risks, the numbers (all SIM);
 *             print-friendly (a print clone + the @media print block of css/control-panels.css) and "copy as text" / download.
 *
 * CONTRACT with the shell (js/control.js → CR.registerTab): each tab is {id, icon, ar, en, build(el), update(), active(on)}.  build() runs before the engine exists, so it only draws the frame;
 * update() is called often (every UI tick) and is cheap: every part of a tab is a ZONE with a signature, rebuilt only when its signature changes (never while a field inside has the focus or a
 * press is in progress); numbers that count down (ETA, battery) are LIVE texts updated in place.  Nothing is ever put in with innerHTML: every text is a text node (bus / uploaded text is safe).
 *
 * HONESTY: drones and the rescue robot are a CONCEPT with a SIMULATED prototype; positions, battery, availability, traffic and every ETA are SIM; "farther but faster" comes from the engine's own
 * numbers; the "drone first in 90 %" figures are a labelled SIM A/B (docs/MANARA.md), recomputable on the page; MANARA never replaces 999, the human key (Approve) stays with the operator,
 * roles are simulated (no real login), the detector is rule-based computer vision.  Test API: window.ControlRoom.mods.panels (see the bottom of this file).
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, CR = win.ControlRoom;
  if (!CR || typeof CR.registerTab !== 'function') return;                           // js/control.js must be loaded first
  var S = CR.S, h = CR.h, bi = CR.bi, B = CR.B, nm = CR.nm, N = CR.N, mmss = CR.mmss, icon = CR.icon, tag = CR.tag, simTag = CR.simTag, setT = CR.setT, setA = CR.setA, lab = CR.lab, isNum = CR.isNum;
  function NN() { return (CR.deps && CR.deps.NN) || win.ManaraNational; }
  function logErr(e) { try { console.error(e); } catch (e2) { /* ignore */ } }

  if (CR.XICON && !CR.XICON.print) CR.XICON.print = '<path d="M7 9V4h10v5"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>';          // one more static 24px stroke icon for the shared set
  var KEY_NOTES = 'manara-cr-handover-notes';
  var M = { T: {}, inb: [], inbSeq: 0, held: {}, jamBy: {}, fx: null, cov: null, covBusy: false, live: null, samp: null, bseq: 0, notes: '', pressing: false, pressTarget: null,
    cf: { cat: 'all', q: '', sel: false, limit: 120 }, fl: { f: 'all', sort: 'id' }, ent: null, entKey: '', dc: null, rank: null, rankKey: '', prev: null, prevKey: '', bc: { zone: 'sel', hz: 'fire', lv: 'evacuate', ar: '', en: '', edited: false, confirm: 0 }, dv: { drone: '', key: 'identify', lang: 'ar' } };
  M.notes = CR.storeGet(KEY_NOTES) || '';

  /* ====================================================================================
   * 1. SMALL HELPERS
   * ==================================================================================== */
  function km1(m) { return isNum(m) ? N(m / 1000, 1) + ' ' + B('كم', 'km') : '–'; }
  function pc(x) { return isNum(x) ? N(x) + B('٪', '%') : '–'; }
  function plus(sec) { return isNum(sec) ? '+' + mmss(sec) : '–'; }
  function fkey(s) { return String(s).replace(/[^a-z0-9:_-]/gi, '-'); }
  function jamCount() { return Object.keys(S.jams || {}).length; }
  function jamKey() { return Object.keys(S.jams || {}).sort().join(','); }
  function droneRowOf(id) { var d = id && S.drones ? S.drones[id] : null; return d && d.row ? d.row : null; }
  function openAlerts() { return S.alerts.filter(function (a) { return !CR.isFinal(a); }); }
  function kindIcon(k) { return icon({ fire: 'fire', rescue: 'rescue', ambulance: 'ambulance', police: 'police', hospital: 'hospital' }[k] || 'target'); }
  function kindBadge(k) { var b = h('i', { class: 'cp-kind k-' + k, 'aria-hidden': 'true' }); b.appendChild(kindIcon(k)); return b; }
  function para(ar, en, cls) { return h('p', { class: 'cp-p' + (cls ? ' ' + cls : '') }, bi(ar, en)); }
  function note(kind, ar, en, ic) { return h('p', { class: 'cp-note ' + (kind || '') }, ic ? icon(ic) : null, bi(ar, en)); }
  function kv(k, v, cls) { return h('div', { class: 'cp-kv' + (cls ? ' ' + cls : '') }, h('span', { class: 'k' }, k), h('b', { class: 'v mono' }, v)); }
  function card(cls, ar, en, right, kids) {
    return h('section', { class: 'cp-card ' + (cls || '') }, h('header', { class: 'cp-card-h' }, h('h4', { class: 'cp-card-t' }, bi(ar, en)), right || null), h('div', { class: 'cp-card-b' }, kids));
  }
  function panelHead(ar, en, lead) { return h('header', { class: 'cp-head' }, h('div', { class: 'cp-ht' }, h('h3', null, bi(ar, en)), simTag()), lead ? h('p', { class: 'cp-lead' }, lead) : null); }
  function note999() {
    return h('p', { class: 'cp-999', role: 'note' }, tag('danger', '999'),
      bi('منارة لا تحلّ محلّ مُرسِل 999: توصية للغرفة التي تقرّر. في الطوارئ اتصل بـ 999.', 'MANARA never replaces the 999 dispatcher: a recommendation for the control room, which decides. In an emergency call 999.'));
  }
  function flat(kids, into) {
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k == null || k === false) return; if (Array.isArray(k)) flat(k, into); else into.appendChild(k.nodeType ? k : doc.createTextNode(String(k))); });
    return into;
  }
  // a button that stays clickable for a role that lacks the right: the rejection (control.js need()) explains why and is logged; the lock icon says it before the click
  function gated(minRole, b) { b.insertBefore(icon('lock', 'cp-lock'), b.firstChild); if (!CR.can(minRole)) b.setAttribute('data-locked', minRole); return b; }          // the lock shows (CSS) only while the role is too low
  function upd(id) { var t = M.T[id]; if (t) t.update(); }                                                  // refresh a tab right after an action (the shell also refreshes it every UI tick)
  function fbtn(cls, ic, ar, en, fn, key, extra) { var b = CR.btn('btn ' + cls, ic, ar, en, fn, extra); if (key) b.setAttribute('data-fk', key); return b; }

  /* ====================================================================================
   * 2. ZONES: parts of a tab rebuilt only when their signature changes
   * ==================================================================================== */
  function isField(el) { return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset)$/.test(el.type))); }          // a text field: never rebuilt under the typist (a checkbox or a button is not)
  function zone(t, name, sig, render, cls) {
    var z = { name: name, sig: sig, render: render, key: null, lives: [], el: h('div', { class: 'cp-zone cp-z-' + name + (cls ? ' ' + cls : '') }) };
    z.live = function (el, fn) { z.lives.push({ el: el, fn: fn }); setT(el, fn()); return el; };
    t.zones.push(z); if (t.root) t.root.appendChild(z.el); return z;
  }
  function runZones(t, force) {
    t.zones.forEach(function (z) {
      var key; try { key = z.sig(); } catch (e) { key = 'e' + Math.random(); }
      if (!force && key === z.key) return;
      var ae = doc.activeElement;
      if (!force && ae && z.el.contains(ae) && isField(ae)) return;                                  // never rebuild the zone a person is typing in
      if (!force && M.pressing && M.pressTarget && z.el.contains(M.pressTarget)) return;             // nor under a press (a rebuild between mousedown and mouseup would lose the click)
      var fk = ae && z.el.contains(ae) ? ae.getAttribute('data-fk') : null;
      z.key = key; z.lives = [];
      var fr = doc.createDocumentFragment();
      try { flat(z.render(z), fr); } catch (e2) { logErr(e2); fr = doc.createDocumentFragment(); fr.appendChild(note('warn', 'تعذّر رسم هذا الجزء.', 'This part could not be drawn.', 'alert')); }
      z.el.replaceChildren(fr);
      if (fk) { var n = z.el.querySelector('[data-fk="' + fk + '"]'); if (n) { try { n.focus({ preventScroll: true }); } catch (e3) { /* ignore */ } } }
    });
    t.zones.forEach(function (z) { z.lives.forEach(function (l) { try { setT(l.el, l.fn()); } catch (e) { /* ignore */ } }); });
  }
  function visible(t) { return !!(t.el && t.el.isConnected && t.el.getClientRects().length); }
  function mkTab(id, ar, en, ic, o) {
    var t = M.T[id] = { id: id, el: null, zones: [], force: true, on: false, root: null };
    t.build = function (el) {
      t.el = el; t.root = h('div', { class: 'cp cp-' + id, 'data-tab': id }); el.appendChild(t.root);
      t.root.addEventListener('pointerdown', function (e) { M.pressing = true; M.pressTarget = e.target; });
      o.build(t, t.root);
    };
    t.update = function () {
      if (!t.el || !S.nat || !S.snap) return;
      if (!visible(t)) return;
      var f = t.force; t.force = false;
      if (o.pre) o.pre(t, f);
      runZones(t, f);
      if (o.post) o.post(t, f);
    };
    t.setActive = function (on) { t.on = !!on; if (on) { t.force = true; t.update(); } };
    CR.registerTab({ id: id, icon: ic, ar: ar, en: en, build: t.build, update: t.update, active: t.setActive, badge: o.badge });
    return t;
  }
  doc.addEventListener('pointerup', function () { if (M.pressing) { M.pressing = false; M.pressTarget = null; S.dirtyUI = true; } }, true);
  doc.addEventListener('pointercancel', function () { M.pressing = false; M.pressTarget = null; }, true);

  /* ====================================================================================
   * 3. FLEET
   * ==================================================================================== */
  var DST = { launching: 'info', 'en-route': 'info', 'on-station': 'safe', verifying: 'safe', patrol: 'cool', returning: '', docked: '', charging: 'warn', fault: 'danger' };
  var AIRBORNE = { launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1, returning: 1 };
  var CANRECALL = { launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1, patrol: 1 };
  var BLOCK = { fault: ['معطّلة', 'has a fault'], busy: ['في مهمة الآن', 'is on a mission'], battery: ['البطارية دون حد الإقلاع', 'battery is below the launch limit'], unavailable: ['غير متاحة الآن (جدول افتراضي محاكى)', 'unavailable right now (a seeded duty, SIM)'], heat: ['حرارة فوق حد الإقلاع', 'too hot to launch'], wind: ['ريح أقوى من حد الإقلاع', 'wind above the launch limit'] };
  var FILTERS = [['all', 'الكل', 'All'], ['air', 'في الجو', 'Airborne'], ['patrol', 'دورية', 'Patrol'], ['docked', 'في القاعدة', 'Docked'], ['charging', 'تُشحن', 'Charging'], ['fault', 'عطل', 'Fault']];
  var SORTS = [['id', 'الرقم', 'ID'], ['battery', 'البطارية', 'Battery'], ['state', 'الحالة', 'State'], ['range', 'المدى إلى الإنذار', 'Range to the alert']];
  var STATE_ORDER = { 'on-station': 0, verifying: 0, 'en-route': 1, launching: 1, patrol: 2, returning: 3, docked: 4, charging: 5, fault: 6 };
  var DOCS_COVERAGE = { out: 33, first: 90, drone: 244, ground: 440 };           // docs/MANARA.md: A/B seed 7, 150 incidents (SIM)

  function blockText(code) { var b = BLOCK[code]; return b ? B(b[0], b[1]) : String(code || ''); }
  var BLOCK_SHORT = { fault: ['معطّلة', 'fault'], busy: ['في مهمة', 'on a mission'], battery: ['بطارية منخفضة', 'low battery'], unavailable: ['غير متاحة', 'unavailable'], heat: ['حرارة عالية', 'too hot'], wind: ['ريح قوية', 'windy'] };
  function blockShort(code) { var b = BLOCK_SHORT[code]; return b ? B(b[0], b[1]) : String(code || ''); }
  function matches(f, r) {
    return f === 'all' || (f === 'air' && !!AIRBORNE[r.state]) || (f === 'patrol' && r.state === 'patrol') || (f === 'docked' && r.state === 'docked') || (f === 'charging' && r.state === 'charging') || (f === 'fault' && r.state === 'fault');
  }
  function rankMap(a) {                                                                // every drone that can serve the selected alert, fastest first (pure engine call, cached 10 simulated seconds)
    if (!a || CR.isFinal(a) || !S.nat) return null;
    var k = a.id + '|' + Math.floor(S.snap.t / 10) + '|' + Math.round(a.lon * 1e4);
    if (M.rankKey === k) return M.rank;
    var m = {}; try { NN().droneRank(S.nat, { lon: a.lon, lat: a.lat, hazard: a.hazard }).forEach(function (x) { m[x.droneId] = x; }); } catch (e) { m = {}; }
    M.rankKey = k; M.rank = m; return m;
  }
  function launchState(r, a, rank) {                                                   // can this drone take the selected alert, and is it a reassignment?
    if (!a) return { ok: false, why: B('اختر إنذارًا من الطابور أولًا', 'Select an alert in the queue first') };
    if (CR.isFinal(a)) return { ok: false, why: B('الإنذار مغلق', 'The alert is closed') };
    if (r.state === 'fault' || AIRBORNE[r.state]) return { ok: false, why: B('هذه المسيّرة ', 'This drone ') + blockText(r.state === 'fault' ? 'fault' : 'busy') };
    if (r.blocked) return { ok: false, why: B('هذه المسيّرة ', 'This drone ') + blockText(r.blocked) };
    if (!rank || !rank[r.id]) return { ok: false, why: B('الموقع خارج مدى هذه المسيّرة (بطارية / مسافة)', 'The location is out of range of this drone (battery / distance)') };
    var old = a.droneId && a.droneId !== r.id ? droneRowOf(a.droneId) : null;
    return { ok: true, reassign: !!(old && (old.state === 'launching' || old.state === 'en-route')), old: old };
  }
  function doLaunch(r) {
    var a = CR.selectedAlert(), st = launchState(r, a, rankMap(a));
    if (!st.ok) { CR.toast({ ar: st.why, en: st.why }, 'warn'); return; }
    var res = CR.launchDrone(a.id, r.id);
    if (res && res.ok && st.reassign && st.old) {                                      // the new drone is on its way: now the old one (not yet on station) goes home
      if (CR.recallDrone(st.old.id).ok) CR.decision('reassign', 'أُعيد تكليف الإنذار ' + a.id + ': من ' + st.old.callsign + ' إلى ' + r.callsign, 'Alert ' + a.id + ' reassigned: from ' + st.old.callsign + ' to ' + r.callsign, { alert: a.id, drone: r.id });
    }
    S.dirtyUI = true; upd('fleet');
  }
  function doRecall(r) { CR.recallDrone(r.id); S.dirtyUI = true; upd('fleet'); }
  function selectDrone(id) {
    var d = S.drones[id], r = d && d.row; CR.setSelDrone(id);
    if (r && r.alert && CR.alertOf(r.alert)) CR.selectAlert(r.alert, { fly: false });
    if (S.map && d) S.map.fitBounds(CR.bboxOf([[d.lon, d.lat]], 3), 70, 600);
  }
  function openFeed(id) { CR.setSelDrone(id); if (typeof CR.showTab === 'function') CR.showTab('feed'); }
  // the first-aid kit drop is a CONCEPT: SOS only, a confirmed alert, a hospital-roof drone that still carries the kit and is on station, and an authority-operated step (the incident commander, simulated)
  function dropKit(r) {
    if (!CR.need('commander', 'إسقاط مجموعة إسعاف (مفهوم)', 'order a first-aid kit drop (a concept)')) return;
    var a = CR.alertOf(r.alert); if (!a) return;
    var res = NN().dropAed(S.nat, r.id, a.id, { authority: { ar: 'قائد الحادث (محاكى)', en: 'the incident commander (simulated)' } });
    if (res.ok) { CR.logOp('operator', 'أمر قائد الحادث بإسقاط مجموعة إسعاف من ' + r.callsign + ' للإنذار ' + a.id + ' (مفهوم؛ لا إسقاط حقيقي)', 'The incident commander ordered a first-aid kit dropped from ' + r.callsign + ' for ' + a.id + ' (a concept; no real drop)', { alert: a.id }); CR.decision('aed', 'إسقاط مجموعة إسعاف ' + r.callsign, 'First-aid kit drop ' + r.callsign, { alert: a.id, drone: r.id }); }
    else CR.toast({ ar: 'لا إسقاط: ' + res.reason, en: 'No drop: ' + res.reason }, 'warn');
    CR.takeSnapshot(true); S.dirtyUI = true;
  }
  function coverageLive(force) {                                                       // cheap and live: how many of N seeded incident points a drone could be on station for RIGHT NOW (pure engine calls)
    var nat = S.nat, nn = NN(); if (!nat || !nn.sampler || !nn.droneEta) return null;
    var t = S.snap.t;
    if (!force && M.live && M.live.nat === nat && Math.abs(t - M.live.t) < 120 && M.live.avail === S.snap.kpis.drones.available) return M.live;
    if (!M.samp || M.samp.nat !== nat) M.samp = { nat: nat, fn: nn.sampler(nat, S.opts.seed || 1) };
    var n = 120, ok = 0, i, p;
    for (i = 0; i < n; i++) { p = M.samp.fn(i); if (p && nn.droneEta(nat, p.lon, p.lat, undefined, 'fire')) ok++; }
    M.live = { nat: nat, t: t, n: n, ok: ok, pct: Math.round(100 * ok / n), avail: S.snap.kpis.drones.available, clock: S.snap.clock };
    return M.live;
  }
  function coverageRun() {                                                             // the A/B "first eyes on scene" metric of the engine (a labelled SIM measurement, about two seconds)
    if (M.covBusy) return; M.covBusy = true; M.T.fleet.force = true; S.dirtyUI = true;
    setTimeout(function () {
      var o = S.opts, t0 = CR.now(), res = null;
      try { res = NN().ab({ seed: o.seed, n: 150, date: o.date, hour: o.hour, params: o.params, roadBaseline: false }); } catch (e) { logErr(e); }
      M.covBusy = false; M.cov = res && res.firstEyes ? { fe: res.firstEyes, n: res.evaluated, seed: o.seed, ms: Math.round(CR.now() - t0), clock: S.snap ? S.snap.clock : '' } : { error: true };
      M.T.fleet.force = true; S.dirtyUI = true; CR.emit('coverage', M.cov);
    }, 40);
  }

  function mkDroneRow(r) {
    var R = { id: r.id, el: h('article', { class: 'cp-drone', 'data-drone': r.id }) }, a;
    R.dot = h('i', { class: 'cp-d-dot', 'aria-hidden': 'true' });
    R.cs = h('b', { class: 'mono cp-d-cs' }); R.base = h('small', { class: 'cp-d-base' });
    R.nameBtn = h('button', { type: 'button', class: 'cp-d-name', 'data-fk': 'sel:' + fkey(r.id), onclick: function () { selectDrone(r.id); } }, R.cs, R.base);
    R.st = h('span', { class: 'tag' });
    R.mb = h('i'); R.mbv = h('b', { class: 'mono' }); R.ml = h('i'); R.mlv = h('b', { class: 'mono' }); R.rg = h('b', { class: 'mono cp-rg' });
    R.lbB = h('small', { class: 'lb' }); R.lbL = h('small', { class: 'lb' }); R.lbR = h('small', { class: 'lb' });
    R.al = h('button', { type: 'button', class: 'cp-chip', 'data-fk': 'al:' + fkey(r.id), onclick: function () { var rw = droneRowOf(r.id); if (rw && rw.alert) CR.selectAlert(rw.alert); } });
    R.eta = h('span', { class: 'mono cp-d-eta' }); R.der = h('span', { class: 'tag warn cp-der' });
    R.pl = h('span', { class: 'cp-pls' });
    [['camera', 'كاميرا RGB', 'RGB camera'], ['thermo', 'كاميرا حرارية', 'Thermal camera'], ['speaker', 'مكبّر صوت ثنائي الاتجاه', 'Two-way speaker'], ['sun', 'ضوء ودود وصافرة (مفهوم؛ المحرّك يحاكي الضوء)', 'Friendly light and siren (a concept; the engine models the light)']].forEach(function (p) {
      var s = h('span', { class: 'cp-pl' }); s.appendChild(icon(p[0])); lab(s, 'title', p[1], p[2]); lab(s, 'aria-label', p[1], p[2]); R.pl.appendChild(s);
    });
    R.kit = h('span', { class: 'cp-pl kit' }); R.kit.appendChild(icon('heart')); lab(R.kit, 'title', 'مجموعة إسعاف أولي (مفهوم؛ تُسقَط بأمر السلطة فقط، لحالات «شخص يحتاج مساعدة»)', 'First-aid kit (a concept; dropped only on the authority\'s order, "someone needs help" only)'); R.pl.appendChild(R.kit);
    R.bL = h('button', { type: 'button', class: 'btn btn-ghost btn-sm cp-launch', 'data-fk': 'l:' + fkey(r.id), onclick: function () { var rw = droneRowOf(r.id); if (rw) doLaunch(rw); } }, icon('lock', 'cp-lock'), icon('launch'), h('span', { class: 'bl' }));
    R.bR = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'r:' + fkey(r.id), onclick: function () { var rw = droneRowOf(r.id); if (rw) doRecall(rw); } }, icon('lock', 'cp-lock'), icon('reset'), h('span', { class: 'br' }));
    R.bF = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'f:' + fkey(r.id), onclick: function () { openFeed(r.id); } }, icon('film'), h('span', { class: 'bf' }));
    R.bK = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-fk': 'k:' + fkey(r.id), onclick: function () { var rw = droneRowOf(r.id); if (rw) dropKit(rw); } }, icon('heart'), h('span', { class: 'bk' }));
    a = [h('div', { class: 'cp-d-h' }, R.dot, R.nameBtn, R.st),
      h('div', { class: 'cp-d-m' }, h('div', { class: 'cp-m' }, R.lbB, h('div', { class: 'cp-meter' }, R.mb), R.mbv), h('div', { class: 'cp-m' }, R.lbL, h('div', { class: 'cp-meter link' }, R.ml), R.mlv), h('div', { class: 'cp-m' }, R.lbR, R.rg)),
      h('div', { class: 'cp-d-x' }, R.al, R.eta, R.pl, R.der),
      h('div', { class: 'cp-d-a' }, R.bL, R.bR, R.bF, R.bK)];
    a.forEach(function (n) { R.el.appendChild(n); });
    return R;
  }
  function updDroneRow(R, r, a, rank) {
    var ls = launchState(r, a, rank), tone = r.batteryPct >= 55 ? '' : r.batteryPct >= 25 ? 'warn' : 'bad', rk = rank && rank[r.id];
    setA(R.el, 'data-state', r.state); R.el.classList.toggle('sel', S.selDrone === r.id); R.el.classList.toggle('mine', !!(a && a.droneId === r.id)); setA(R.el, 'aria-current', S.selDrone === r.id ? 'true' : 'false');
    var fac = null; try { fac = NN().facilityLabel(S.nat, r.facility); } catch (e) { fac = null; }
    setT(R.cs, r.callsign); setT(R.base, (fac ? nm(fac) : r.facility) + ' · ' + (r.role === 'hospital' ? B('سطح مستشفى', 'hospital roof') : B('مركز دفاع مدني', 'Civil Defence station')));
    setA(R.nameBtn, 'aria-label', B('اختر المسيّرة ', 'Select drone ') + r.callsign + ' — ' + nm(r.name));
    R.st.className = 'tag ' + (DST[r.state] || ''); setT(R.st, nm(r.stateText));
    R.mb.style.inlineSize = Math.max(2, r.batteryPct) + '%'; R.mb.className = tone; setT(R.mbv, pc(r.batteryPct)); R.ml.style.inlineSize = Math.round(r.link * 100) + '%'; setT(R.mlv, pc(Math.round(r.link * 100)));
    setT(R.lbB, B('البطارية', 'Battery')); setT(R.lbL, B('الوصلة', 'Link')); setT(R.lbR, a ? B('إلى ', 'To ') + a.id : B('إلى الإنذار', 'To the alert'));
    var rg = '–', sc = '';
    if (a && !CR.isFinal(a)) {
      var straight = NN().haversineM(r.lon, r.lat, a.lon, a.lat);
      if (rk) { rg = mmss(rk.etaSec) + ' · ' + km1(rk.distM); sc = 'ok'; } else if (r.state === 'fault' || r.blocked || AIRBORNE[r.state]) { rg = blockShort(r.state === 'fault' ? 'fault' : AIRBORNE[r.state] ? 'busy' : r.blocked) + ' · ' + km1(straight); sc = 'no'; } else { rg = B('خارج المدى', 'out of range') + ' · ' + km1(straight); sc = 'no'; }
    }
    setT(R.rg, rg); R.rg.className = 'mono cp-rg ' + sc;
    if (r.alert) { R.al.hidden = false; setT(R.al, r.alert); setA(R.al, 'aria-label', B('الإنذار المسند ', 'Assigned alert ') + r.alert); } else { R.al.hidden = true; }
    setT(R.eta, r.etaSec != null && (r.state === 'en-route' || r.state === 'launching' || r.state === 'returning') ? B('وصول ', 'ETA ') + mmss(r.etaSec) : (r.state === 'fault' && r.fault ? nm(r.fault.text) : r.state === 'on-station' || r.state === 'verifying' ? B('في الموقع', 'on station') : ''));
    R.der.hidden = !(r.derate && r.derate.active); if (r.derate && r.derate.active) { setT(R.der, B('حرارة ', 'Heat ') + '−' + N(r.derate.enduranceLostPct) + '%'); setA(R.der, 'title', B('تخفيض التحمّل بسبب الحرارة: ', 'Endurance lost to heat: ') + N(r.derate.enduranceLostPct) + '% · ' + B('السرعة ', 'speed ') + '−' + N(r.derate.speedLostPct) + '%'); }
    R.kit.hidden = !r.aed; R.pl.lastChild.classList.toggle('on', !!r.aed); R.pl.children[3].classList.toggle('on', !!r.light);
    // actions: the launch button is the reassign button when the alert already has a drone that is still on its way
    setT(R.bL.lastChild, ls.ok && ls.reassign ? B('أعِد التكليف إلى هنا', 'Reassign here') : B('أطلق', 'Launch') + (a && !CR.isFinal(a) ? ' → ' + a.id : ''));
    R.bL.setAttribute('aria-disabled', ls.ok ? 'false' : 'true'); setA(R.bL, 'title', ls.ok ? (rk ? B('وصول بعد ', 'On station in ') + mmss(rk.etaSec) : '') : ls.why);
    [R.bL, R.bR].forEach(function (b) { if (CR.can('operator')) b.removeAttribute('data-locked'); else b.setAttribute('data-locked', 'operator'); });
    setT(R.bR.lastChild, B('استدعِ', 'Recall')); R.bR.setAttribute('aria-disabled', CANRECALL[r.state] ? 'false' : 'true'); setT(R.bF.lastChild, B('البثّ', 'Feed'));
    var kitOk = r.aed && (r.state === 'on-station' || r.state === 'verifying') && r.alert && CR.alertOf(r.alert) && CR.alertOf(r.alert).hazard === 'sos';
    R.bK.hidden = !kitOk; setT(R.bK.lastChild, B('إسقاط مجموعة إسعاف (مفهوم)', 'Order a kit drop (concept)'));
    return { r: r, rk: rk, ls: ls };
  }

  function fleetBuild(t, root) {
    root.appendChild(panelHead('أسطول المسيّرات', 'Drone fleet', bi('مفهوم بنموذج أولي محاكى: لم تُطِر أي مسيّرة حقيقية ولا حصلت على موافقة أي جهة. المواقع والبطارية والتوفّر محاكاة (SIM).', 'A concept with a simulated prototype: no real drone has been flown or approved by any authority. Positions, battery and availability are simulated (SIM).')));
    zone(t, 'sum', function () { var k = S.snap.kpis.drones; return [CR.lang(), k.total, k.available, k.enRoute, k.onStation, k.patrolling, k.charging, k.fault, k.docked].join('|'); }, function (z) {
      var k = S.snap.kpis.drones, items = [['total', 'المجموع', 'Total', k.total, ''], ['avail', 'متاحة للإقلاع', 'Ready to launch', k.available, 'safe'], ['air', 'في الطريق', 'On their way', k.enRoute, 'cool'], ['st', 'في الموقع', 'On station', k.onStation, 'safe'], ['pat', 'دورية', 'Patrol', k.patrolling, 'cool'], ['chg', 'تُشحن', 'Charging', k.charging, 'warn'], ['flt', 'عطل', 'Fault', k.fault, k.fault ? 'danger' : '']];
      var bat = h('b', { class: 'mono' });
      return h('div', { class: 'cp-kpis', role: 'group' }, items.map(function (i) { return h('div', { class: 'cp-kpi ' + i[4] }, h('b', { class: 'mono' }, N(i[3])), h('span', null, B(i[1], i[2]))); }),
        h('div', { class: 'cp-kpi' }, z.live(bat, function () { return pc(S.snap.kpis.drones.batteryMeanPct); }), h('span', null, B('متوسط البطارية', 'Mean battery'))));
    });
    zone(t, 'cov', function () { var lv = coverageLive(false); return [CR.lang(), lv ? lv.pct + ':' + lv.t : '', M.covBusy ? 1 : 0, M.cov ? (M.cov.error ? 'err' : M.cov.clock + M.cov.n) : ''].join('|'); }, renderCoverage);
    // controls (built once): filter chips and sort
    var chips = h('div', { class: 'cp-chips', role: 'group' }), sortSel = h('select', { class: 'input cp-sort', 'data-fk': 'sort', onchange: function () { M.fl.sort = sortSel.value; t.update(); } });
    lab(chips, 'aria-label', 'تصفية المسيّرات حسب الحالة', 'Filter the drones by state'); lab(sortSel, 'aria-label', 'ترتيب المسيّرات', 'Sort the drones');
    t.chips = FILTERS.map(function (f) { var c = h('button', { type: 'button', class: 'chip', 'aria-pressed': f[0] === M.fl.f ? 'true' : 'false', 'data-f': f[0], 'data-fk': 'flt:' + f[0], onclick: function () { M.fl.f = f[0]; t.update(); } }, h('span', { class: 'cp-fl' }), h('span', { class: 'mono cp-fc' })); chips.appendChild(c); return c; });
    SORTS.forEach(function (s) { sortSel.appendChild(h('option', { value: s[0] })); });
    t.sortSel = sortSel; t.sortLabel = h('span', { class: 'cp-sl' });
    t.ctx = h('p', { class: 'cp-ctx', 'aria-live': 'off' });
    root.appendChild(h('div', { class: 'cp-bar' }, chips, h('label', { class: 'field cp-sortf' }, t.sortLabel, sortSel)));
    root.appendChild(t.ctx);
    t.board = h('div', { class: 'cp-drones', role: 'list' }); t.rows = {}; t.order = '';
    root.appendChild(t.board);
    zone(t, 'queue', function () { return [CR.lang(), S.snap.drones.filter(function (d) { return d.state === 'charging' || d.state === 'fault'; }).map(function (d) { return d.id + d.state; }).join(',')].join('|'); }, renderQueue);
    zone(t, 'legend', function () { return CR.lang(); }, function () {
      return card('cp-legend', 'الحمولة والحدود', 'Payload and limits', null, [
        para('الحمولة مفهوم: كاميرا RGB وحرارية ومكبّر صوت وضوء ودود وصافرة على كل مسيّرة. مجموعة الإسعاف الأولي على مسيّرات أسطح المستشفيات فقط، وتُسقَط بأمر السلطة فقط لحالات «شخص يحتاج مساعدة». لا حمولة حقيقية طارت.', 'Payload is a concept: an RGB and a thermal camera, a speaker, a friendly light and a siren on every drone. A first-aid kit rides only on hospital-roof drones and is dropped only on the authority\'s order for "someone needs help". No real payload has flown.'),
        para('المسيّرة تطير بخط مستقيم لا على الطرق؛ سرعتها وبطاريتها تتأثران بالحرارة والريح (افتراضات مسمّاة). تُطلق المسيّرة نفسها للتحقق فقط؛ التنبيه العام والإرسال يحتاجان المفتاح البشري.', 'A drone flies in a straight line, not on roads; its speed and battery are derated by heat and wind (named assumptions). A drone launches by itself only to verify; the public alert and the dispatch need the human key.')]);
    });
  }
  function renderCoverage(z) {
    var lv = coverageLive(false), c = M.cov, fe = c && c.fe, more = [];
    more.push(para('هذه فجوة في نموذج المحاكاة وبياناته (محطات OSM المتاحة، البطاريات، الحرارة) لا ادعاء عن الخدمة الحقيقية. الحادث خارج المدى لا يحصل على مسيّرة، فتبقى الوحدات الأرضية هي الأولى.', 'This is a gap of the simulation and its data (the OSM stations available, batteries, heat), not a claim about any real service. An incident out of range gets no drone, so the ground units come first.', 'cp-fine'));
    if (lv) more.push(h('p', { class: 'cp-fine muted' }, B('عيّنة من ' + N(lv.n) + ' نقطة حادث مبذورة على الأراضي القطرية قرب الطرق (نفس عيّنة مقارنة A/B) — محاكاة (SIM).', 'A sample of ' + N(lv.n) + ' seeded incident points on Qatari land near roads (the same sampler as the A/B comparison) — SIM.')));
    more.push(h('div', { class: 'cp-fe' }, h('b', null, bi('المسيّرة قبل أول وحدة أرضية', 'Drone before the first ground unit')),
      fe ? h('div', { class: 'cp-kvs' }, kv(B('خارج المدى', 'Out of range'), pc(fe.noDroneAvailablePct), 'warn'), kv(B('المسيّرة أولًا (حيث تصل)', 'Drone first (where it can reach)'), pc(fe.droneFirstPct), 'safe'),
        kv(B('الوسيط: مسيّرة / أرضية', 'Median: drone / ground'), mmss(fe.droneEtaSec.p50) + ' / ' + mmss(fe.firstGroundEtaSec.p50)), kv(B('عدد الحوادث', 'Incidents'), N(c.n)))
        : h('div', { class: 'cp-kvs' }, kv(B('خارج المدى', 'Out of range'), pc(DOCS_COVERAGE.out), 'warn'), kv(B('المسيّرة أولًا (حيث تصل)', 'Drone first (where it can reach)'), pc(DOCS_COVERAGE.first), 'safe'), kv(B('الوسيط: مسيّرة / أرضية', 'Median: drone / ground'), DOCS_COVERAGE.drone + B(' ث', ' s') + ' / ' + DOCS_COVERAGE.ground + B(' ث', ' s'))),
      h('p', { class: 'cp-fine muted' }, fe ? B('قياس جديد الآن (البذرة ' + N(c.seed) + '، ' + N(c.n) + ' حادثًا، ' + N(c.ms) + ' م ث) — محاكاة (SIM): فحص لآلية العمل وليس دليلاً على الأثر.', 'Measured now (seed ' + N(c.seed) + ', ' + N(c.n) + ' incidents, ' + N(c.ms) + ' ms) — SIM: a mechanism check, not proof of impact.')
        : B('الأرقام الموثّقة في docs/MANARA.md: البذرة 7، 150 حادثًا — محاكاة (SIM). اضغط لتقيسها الآن على هذا الإعداد.', 'The figures documented in docs/MANARA.md: seed 7, 150 incidents — SIM. Press to measure them now with this setup.')),
      c && c.error ? note('warn', 'تعذّر القياس.', 'The measurement failed.', 'alert') : null,
      fbtn('btn-ghost btn-sm', 'target', M.covBusy ? 'جارٍ القياس…' : 'قِس الآن (نحو ثانيتين)', M.covBusy ? 'Measuring…' : 'Measure now (about 2 s)', coverageRun, 'cov-run', { id: 'cp-cov-run', 'aria-disabled': M.covBusy ? 'true' : 'false' })));
    var det = h('details', { class: 'cp-why cp-cov-more', open: !!M.covOpen }, h('summary', { 'data-fk': 'cov-more' }, bi('المنهج والقياس', 'Method and measurement')), h('div', { class: 'cp-why-b' }, more));
    det.addEventListener('toggle', function () { M.covOpen = det.open; });
    return card('cp-cov', 'التغطية — بصراحة', 'Coverage — honestly', simTag(), [
      h('p', { class: 'cp-cov-line' }, icon('alert'), bi('نحو ثلث الحوادث خارج مدى كل المسيّرات.', 'About a third of incidents are out of range of every drone.')),
      lv ? h('div', { class: 'cp-kvs' }, kv(B('الآن: يمكن أن تصلها مسيّرة', 'Right now: a drone can reach'), pc(lv.pct) + ' · ' + N(lv.ok) + '/' + N(lv.n)), kv(B('خارج مدى الجميع الآن', 'Out of everyone\'s range now'), pc(100 - lv.pct), lv.pct < 85 ? 'warn' : ''),
        kv(B('مسيّرات جاهزة', 'Drones ready'), N(lv.avail) + '/' + N(S.snap.kpis.drones.total))) : null, det]);
  }
  function renderQueue(z) {
    var nat = S.nat, P = nat.P || {}, rate = P.droneChargePctPerMin || 2, ready = P.droneReadyPct || 90, rows = S.snap.drones.filter(function (d) { return d.state === 'charging' || d.state === 'fault'; });
    rows.sort(function (a, b) { return (a.state === 'fault') - (b.state === 'fault') || b.batteryPct - a.batteryPct; });
    var list = rows.length ? h('ul', { class: 'cp-queue' }, rows.map(function (r) {
      var span = h('span', { class: 'mono cp-q-eta' });
      z.live(span, function () {
        var rw = droneRowOf(r.id) || r;
        if (rw.state === 'fault') { var d = nat.drones && nat.drones.byId[r.id], left = d && isNum(d.repairLeft) ? d.repairLeft : null; return B('إصلاح ≈ ', 'repair ≈ ') + (left != null ? N(Math.ceil(left / 60)) + B(' د', ' min') : '–'); }
        return rw.state === 'charging' ? pc(rw.batteryPct) + ' → ' + pc(ready) + ' · ' + mmss(Math.max(0, (ready - rw.batteryPct) / rate * 60)) : B('جاهزة', 'ready');
      });
      return h('li', { class: 'cp-q-i ' + r.state }, h('b', { class: 'mono' }, r.callsign), h('span', { class: 'tag ' + (DST[r.state] || '') }, nm(r.stateText)), r.fault ? h('small', { class: 'muted' }, nm(r.fault.text)) : null, span);
    })) : h('p', { class: 'cp-empty' }, bi('لا مسيّرة تُشحن أو تُصلَح الآن.', 'No drone is charging or in repair right now.'));
    return card('cp-qc', 'طابور الشحن والصيانة', 'Charging and repair queue', h('span', { class: 'tag' }, N(rows.length)), [list, h('p', { class: 'cp-fine muted' }, B('الشحن ' + N(rate) + '٪ في الدقيقة حتى ' + N(ready) + '٪ (افتراضان مسمّيان، SIM).', 'Charging ' + N(rate) + ' % per minute up to ' + N(ready) + ' % (two named assumptions, SIM).'))]);
  }
  function fleetPre(t) {
    // chips and sort labels (language), rows (keyed, updated in place), filter, order
    t.chips.forEach(function (c, i) { var f = FILTERS[i]; setT(c.firstChild, B(f[1], f[2])); setT(c.lastChild, N(S.snap.drones.filter(function (r) { return matches(f[0], r); }).length)); setA(c, 'aria-pressed', M.fl.f === f[0] ? 'true' : 'false'); });
    SORTS.forEach(function (s, i) { setT(t.sortSel.children[i], B(s[1], s[2])); }); if (t.sortSel.value !== M.fl.sort) t.sortSel.value = M.fl.sort; setT(t.sortLabel, B('الترتيب', 'Sort'));
    var a = CR.selectedAlert(), rank = rankMap(a), recs = {};
    S.snap.drones.forEach(function (r) {
      var R = t.rows[r.id]; if (!R) { R = t.rows[r.id] = mkDroneRow(r); t.board.appendChild(R.el); t.order = ''; }
      recs[r.id] = updDroneRow(R, r, a, rank);
      R.el.hidden = !matches(M.fl.f, r);
    });
    var ids = S.snap.drones.map(function (r) { return r.id; });
    ids.sort(function (x, y) {
      var rx = recs[x], ry = recs[y], c = 0;
      if (M.fl.sort === 'battery') c = ry.r.batteryPct - rx.r.batteryPct;
      else if (M.fl.sort === 'state') c = (STATE_ORDER[rx.r.state] || 0) - (STATE_ORDER[ry.r.state] || 0);
      else if (M.fl.sort === 'range') c = (rx.rk ? rx.rk.etaSec : 1e9) - (ry.rk ? ry.rk.etaSec : 1e9);
      return c || (rx.r.callsign < ry.r.callsign ? -1 : 1);
    });
    var ord = ids.join(',');
    if (ord !== t.order && !(t.board.contains(doc.activeElement) && doc.activeElement !== t.board)) { ids.forEach(function (id) { t.board.appendChild(t.rows[id].el); }); t.order = ord; }
    var shown = ids.filter(function (id) { return !t.rows[id].el.hidden; }).length;
    t.board.setAttribute('data-shown', String(shown));
    setT(t.ctx, a && !CR.isFinal(a) ? B('الإنذار المحدد: ', 'Selected alert: ') + a.id + ' — ' + CR.hzName(a.hazard) + ' — ' + CR.placeLine(a).line + (rank ? ' · ' + N(Object.keys(rank).length) + B(' مسيّرة يمكنها الوصول', ' drone(s) can reach it') : '') : B('لا إنذار محدد: اخترْ إنذارًا في الطابور لترى المدى والزمن إليه وتُطلق مسيّرة.', 'No alert selected: pick one in the queue to see the range and time to it and to launch a drone.'));
  }

  /* ====================================================================================
   * 4. DISPATCH
   * ==================================================================================== */
  var PLAN_STATES = ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'];
  var PLAN_LABEL = { recommended: ['مقترحة', 'Recommended'], approved: ['معتمدة', 'Approved'], dispatched: ['أُرسلت', 'Dispatched'], 'en-route': ['في الطريق', 'En route'], 'on-scene': ['في الموقع', 'On scene'], cleared: ['أُنهيت', 'Cleared'] };
  var UNIT_STATE = { recommended: ['مقترحة', 'Recommended', 'warn'], approved: ['مُسنَدة', 'Assigned', 'cool'], dispatched: ['تستعد للخروج', 'Turning out', 'cool'], 'en-route': ['في الطريق', 'En route', 'cool'], 'on-scene': ['في الموقع', 'On scene', 'safe'], cleared: ['أُنهت', 'Cleared', ''] };
  var DAY_TYPE = { work: ['يوم عمل (الأحد–الأربعاء)', 'Working day (Sun–Wed)'], thu: ['الخميس', 'Thursday'], fri: ['الجمعة', 'Friday'], sat: ['السبت', 'Saturday'] };

  function previewFor(a) {                                                             // an alert with no incident plan yet: the engine's PURE recommendation (nothing reserved) for the alert's place
    var k = a.id + '|' + jamKey() + '|' + Math.floor(S.snap.t / 30);
    if (M.prevKey === k) return M.prev;
    var p = null; try { p = NN().dispatchNational(S.nat, { hazard: a.hazard, lon: a.lon, lat: a.lat, severity: 2 }); } catch (e) { p = null; }
    M.prevKey = k; M.prev = p; return p;
  }
  function dctx() {
    var s = S.snap, a = CR.selectedAlert(), c = { a: a, inc: null, plan: null, preview: false };
    if (!a || !s) return c;
    if (a.incident) c.inc = s.incidents.filter(function (i) { return i.id === a.incident && i.status !== 'unseen'; })[0] || null;
    c.plan = c.inc && c.inc.plan ? c.inc.plan : null;
    if (M.held[a.id] && (CR.isFinal(a) || CR.STATE_RANK[a.state] >= 2)) delete M.held[a.id];
    if (!c.plan && !CR.isFinal(a)) { var p = previewFor(a); if (p) { c.plan = p; c.preview = true; } }
    return c;
  }
  function planUnit(c, slot) { return c.plan ? c.plan.units.filter(function (u) { return (u.slot || u.kind) === slot; })[0] || null : null; }
  function planEta(u) { return !u || !u.unitId ? '–' : u.state === 'on-scene' ? B('في الموقع', 'On scene') : u.state === 'cleared' ? '—' : mmss(u.etaSec); }
  function firstGround(plan) {                                                         // the first ground unit of the plan (seconds), or 0 when one is already on scene
    var best = null; if (!plan) return null;
    plan.units.forEach(function (u) { if (!u.unitId || u.optional || u.standby) return; var e = u.state === 'on-scene' || u.state === 'cleared' ? 0 : u.etaSec; if (isNum(e) && (best === null || e < best)) best = e; });
    return best;
  }
  function stepper(state) {
    var ix = PLAN_STATES.indexOf(state === 'cancelled' ? 'recommended' : state); if (ix < 0) ix = 0;
    return h('ol', { class: 'cp-steps', 'aria-label': B('مراحل الإرسال', 'Dispatch stages') }, PLAN_STATES.map(function (s, i) { return h('li', { class: i < ix ? 'done' : i === ix ? 'now' : '', 'aria-current': i === ix ? 'step' : null }, h('i', { 'aria-hidden': 'true' }), h('span', null, B(PLAN_LABEL[s][0], PLAN_LABEL[s][1]))); }));
  }
  function miniSteps(u) {
    var ix = { recommended: -1, approved: 0, dispatched: 0, 'en-route': 1, 'on-scene': 2, cleared: 2 }[u.state]; if (ix === undefined) ix = -1;
    return h('ol', { class: 'cp-mini', 'aria-label': B('حالة الوحدة', 'Unit status') }, [['مُسنَدة', 'Assigned'], ['في الطريق', 'En route'], ['في الموقع', 'On scene']].map(function (s, i) { return h('li', { class: i < ix ? 'done' : i === ix ? 'now' : '' }, B(s[0], s[1])); }));
  }

  function approveLabel(a) { return S.confirmApprove && S.confirmApprove[a.id] && CR.now() - S.confirmApprove[a.id] <= 5000 ? ['اضغط مرة أخرى للتأكيد (غير مؤكَّد بعد)', 'Press again to confirm (not verified yet)'] : ['وافق (مفتاح الإنسان)', 'Approve (the human key)']; }
  function doApprove() {                                                                 // the shell's own approve (a confirmation dialog for an unconfirmed alert) when it exists, else the core action
    var a = M.dc.a; if (!a) return null;
    var r = CR.ui && CR.ui.approve ? CR.ui.approve(a.id) : CR.approveAlert(a.id);
    if (r && r.ok) delete M.held[a.id];
    S.dirtyUI = true; upd('dispatch'); return r;
  }
  function doHold() {
    var a = M.dc.a; if (!a) return;
    if (!CR.need('operator', 'تعليق الإرسال', 'put a dispatch on hold')) return;
    if (M.held[a.id]) { delete M.held[a.id]; CR.logOp('operator', 'رفع المشغّل التعليق عن إرسال ' + a.id, 'The operator released the hold on the dispatch of ' + a.id, { alert: a.id }); }
    else {
      if (S.autopilot) { CR.toast({ ar: 'الطيار الآلي يوافق وحده: أوقفه أولًا لتعلّق الإرسال', en: 'The autopilot approves by itself: turn it off first to hold a dispatch' }, 'warn'); return; }
      M.held[a.id] = true; CR.logOp('operator', 'علّق المشغّل إرسال ' + a.id + ' — لا يُرسل شيء حتى يضغط «وافق»', 'The operator put the dispatch of ' + a.id + ' on hold — nothing is sent until “Approve”', { alert: a.id }); CR.decision('hold', 'تعليق إرسال ' + a.id, 'Dispatch of ' + a.id + ' on hold', { alert: a.id });
    }
    S.dirtyUI = true; upd('dispatch');
  }
  function doCancel() {
    var C = M.dc, a = C.a; if (!a) return;
    if (!C.inc || !C.plan || C.preview || C.plan.state === 'recommended') { if (CR.ui && CR.ui.dismiss) CR.ui.dismiss(a.id); else CR.dismissAlert(a.id); S.dirtyUI = true; upd('dispatch'); return; }          // before the human key: withdraw = dismiss the alert (the engine releases the units)
    if (!CR.need('commander', 'إلغاء الإرسال وسحب الوحدات', 'cancel the dispatch and stand the units down')) return;
    if (!NN().cancelIncident(S.nat, C.inc.id)) { CR.toast({ ar: 'لا يمكن إلغاء هذا الإرسال الآن', en: 'This dispatch cannot be cancelled now' }, 'warn'); return; }
    var ar = 'ألغى قائد الحادث إرسال ' + C.inc.id + ' وسحب الوحدات (قرار بشري)', en = 'The incident commander cancelled the dispatch of ' + C.inc.id + ' and stood the units down (a human decision)';
    CR.logOp('operator', ar, en, { alert: a.id, inc: C.inc.id }); CR.decision('cancel', ar, en, { alert: a.id });
    CR.takeSnapshot(true); CR.publishAll(true); CR.syncScene(); S.dirtyUI = true; upd('dispatch');
  }
  function doLaunchNearest() { var a = M.dc.a; if (a) { CR.launchDrone(a.id); S.dirtyUI = true; upd('dispatch'); } }
  function doCap() {
    var C = M.dc; if (!C.inc || !C.plan) return null;
    var xml = ''; try { xml = NN().cap(S.nat, C.inc.id, { languages: ['ar', 'en'], area: 'circle' }) || ''; } catch (e) { xml = ''; }
    if (!xml) { CR.toast({ ar: 'تعذّر إنشاء CAP لهذا الحادث', en: 'CAP could not be built for this incident' }, 'warn'); return null; }
    CR.dl('manara-cap-' + C.inc.id + '.xml', 'application/xml', xml);
    CR.logOp('operator', 'صدّر المشغّل رسالة CAP 1.2 (حالة «تمرين») للحادث ' + C.inc.id, 'The operator exported a CAP 1.2 message (status Exercise) for incident ' + C.inc.id, { alert: C.a ? C.a.id : null, inc: C.inc.id });
    return xml;
  }
  function showRoute(u, c) {
    if (!S.map || !u || !u.route || !u.route.length) return;
    var pts = u.route.slice(); if (u.pos) pts.push([u.pos.lon, u.pos.lat]); if (c.a) pts.push([c.a.lon, c.a.lat]);
    S.map.fitBounds(CR.bboxOf(pts, 0.6), CR.isNarrow() ? 40 : 70, 700);
  }
  function unitBrief(plan) { return plan ? plan.units.filter(function (u) { return u.unitId; }).map(function (u) { var ch = u.whyData && u.whyData.chosen; return { slot: u.slot || u.kind, kind: u.kind, unitId: u.unitId, name: u.name, etaSec: ch && isNum(ch.etaSec) ? ch.etaSec : u.etaSec }; }) : []; }
  // the traffic what-if: jam the roads ahead of the first unit's route (through CR.toggleJam: logged, role-gated, the map shows them); the engine re-evaluates the plan at its next tick
  function jamRoute(on) {
    var C = M.dc, inc = C.inc; if (!inc || !C.plan || C.preview) return false;
    var rec = M.jamBy[inc.id] || (M.jamBy[inc.id] = { edges: [] });
    if (on) {
      if (!CR.can('operator')) { CR.need('operator', 'ازدحام طرق', 'jam roads'); return false; }
      var u = C.plan.units.filter(function (x) { return x.unitId && !x.optional && !x.standby && x.route && x.route.length > 8; })[0] || C.plan.units.filter(function (x) { return x.unitId && x.route && x.route.length > 8; })[0];
      if (!u) { CR.toast({ ar: 'لا مسار لوحدة بعد لإزدحامه', en: 'No unit route to jam yet' }, 'warn'); return false; }
      var before = unitBrief(C.plan), route = u.route, want = 6, got = [], lo = 3, hi = route.length - 3, step = Math.max(2, Math.floor((hi - lo) / (want + 1))), k, e;
      for (k = lo + step; k < hi && got.length < want; k += step) { e = NN().edgeAt(S.nat, route[k][0], route[k][1], 150); if (e && e.edge != null && !S.jams[e.edge] && got.indexOf(e.edge) < 0) got.push(e.edge); }
      got.forEach(function (ed) { CR.toggleJam(ed); if (S.jams[ed]) rec.edges.push(ed); });
      if (!rec.edges.length) { CR.toast({ ar: 'لم يُزدحَم أي طريق', en: 'No road was jammed' }, 'warn'); return false; }
      M.fx = { inc: inc.id, t: S.snap.t, clock: S.snap.clock, before: before, n: rec.edges.length, first: nm(u.name) };
      CR.decision('jam', 'ازدحام (محاكاة) على ' + N(rec.edges.length) + ' مقاطع في طريق ' + nm0(u.name, 'ar') + ' للحادث ' + inc.id, 'Jam (SIM) on ' + N(rec.edges.length) + ' segments of the route of ' + nm0(u.name, 'en') + ' for incident ' + inc.id, { inc: inc.id });
    } else {
      if (!CR.can('operator')) { CR.need('operator', 'إزالة الازدحام', 'clear a jam'); return false; }
      rec.edges.slice().forEach(function (ed) { if (S.jams[ed]) CR.toggleJam(ed); }); rec.edges = [];
      if (M.fx && M.fx.inc === inc.id) M.fx = null;
      CR.decision('unjam', 'أزال المشغّل ازدحام التجربة عن ' + inc.id, 'The operator cleared the test jam of ' + inc.id, { inc: inc.id });
    }
    S.dirtyUI = true; upd('dispatch'); return true;
  }
  function nm0(o, l) { return o ? (o[l] || o.ar || o.en || '') : ''; }
  function clearAllJams() { if (!CR.need('operator', 'إزالة الازدحام', 'clear the jams')) return; Object.keys(S.jams).forEach(function (e) { CR.toggleJam(+e); }); M.jamBy = {}; M.fx = null; S.dirtyUI = true; upd('dispatch'); }
  function jamOn(inc) { var r = inc && M.jamBy[inc.id]; return !!(r && r.edges.some(function (e) { return S.jams[e]; })); }

  function dispatchBuild(t, root) {
    root.appendChild(panelHead('خطة الإرسال', 'Dispatch plan', bi('«الأسرع» لا «الأقرب»: أقل زمن وصول لكل نوع بازدحام محاكى بالساعة، مع المركز الثاني وسبب الفوز.', '“Fastest”, not “nearest”: the lowest ETA per type with hourly simulated traffic, plus the runner-up and why.')));
    root.appendChild(note999());
    var key = function () { var C = M.dc; return C.a ? C.a.id + ':' + C.a.state + ':' + (C.inc ? C.inc.status : '') + ':' + (C.plan ? C.plan.state + (C.preview ? 'p' : '') : '-') : '-'; };
    zone(t, 'sel', function () { var a = M.dc.a; return [CR.lang(), S.role, S.autopilot ? 1 : 0, key(), a && M.held[a.id] ? 1 : 0, a && a.droneId || '', a && a.needDrone ? 1 : 0, a && S.confirmApprove && S.confirmApprove[a.id] && CR.now() - S.confirmApprove[a.id] <= 5000 ? 1 : 0, openAlerts().map(function (x) { return x.id + x.state; }).join(',')].join('|'); }, renderDispHead);
    zone(t, 'units', function () {
      var C = M.dc, p = C.plan; if (!p) return [CR.lang(), key()].join('|');
      return [CR.lang(), key(), p.units.map(function (u) { var wd = u.whyData || {}; return [u.slot, u.unitId, u.state, u.runnerUp && u.runnerUp.unitId, wd.farButFaster ? 1 : 0, u.reroutes, (u.replaced || []).length, u.unreachable ? 1 : 0, !!u.gap].join(':'); }).join(','), p.hospital ? p.hospital.id : '', (p.notes || []).length].join('|');
    }, renderUnits);
    zone(t, 'traffic', function () { var C = M.dc, s = S.snap; return [CR.lang(), key(), jamCount(), jamOn(C.inc) ? 1 : 0, M.fx ? M.fx.inc + M.fx.t : '', S.nat.dirty ? 1 : 0, Math.floor(s.t / 600), CR.can('operator') ? 1 : 0, M.fx && C.plan ? unitBrief(C.plan).map(function (u) { return u.unitId + Math.round(u.etaSec / 10); }).join(',') : ''].join('|'); }, renderTraffic);
    zone(t, 'eyes', function () { var C = M.dc, a = C.a; return [CR.lang(), key(), a && a.droneId || '', a && a.droneId && droneRowOf(a.droneId) ? droneRowOf(a.droneId).state : '', M.cov ? 'c' : ''].join('|'); }, renderEyes);
    zone(t, 'hist', function () { var C = M.dc; return [CR.lang(), key(), historyOf(C).length].join('|'); }, renderHistory);
    zone(t, 'tools', function () { var C = M.dc; return [CR.lang(), key(), C.inc ? 1 : 0].join('|'); }, renderTools);
  }
  function dispatchPre(t) { M.dc = dctx(); }

  function renderDispHead(z) {
    var C = M.dc, a = C.a, kids = [];
    if (!a) {
      var open = openAlerts();
      kids.push(card('cp-empty-card', 'لا إنذار محدد', 'No alert selected', null, [
        para('اختر إنذارًا من الطابور (أو من القائمة هنا) لترى أسرع وحدة من كل نوع بحسب الازدحام، ومن يليها، ولماذا فازت.', 'Select an alert in the queue (or from the list here) to see the fastest unit of each type given traffic, who is next, and why it won.'),
        open.length ? h('ul', { class: 'cp-picks' }, open.slice(0, 12).map(function (x) { return h('li', null, h('button', { type: 'button', class: 'cp-pick', 'data-fk': 'pick:' + fkey(x.id), onclick: function () { CR.selectAlert(x.id); } }, h('b', { class: 'mono' }, x.id), h('span', null, CR.hzName(x.hazard) + ' — ' + CR.placeLine(x).place), h('span', { class: 'tag ' + (x.level === 'critical' || x.level === 'high' ? 'danger' : 'warn') }, nm(x.stateName)))); }))
          : h('p', { class: 'cp-empty' }, bi('لا إنذارات مفتوحة الآن. ضع إنذارًا تجريبيًا على الخريطة أو شغّل العرض.', 'No open alerts right now. Place a simulated alarm on the map or start the demo.'))]));
      return kids;
    }
    var pl = CR.placeLine(a), p = C.plan, st = p ? (C.preview ? 'recommended' : p.state) : null, held = !!M.held[a.id], final = CR.isFinal(a);
    kids.push(h('div', { class: 'cp-sel' }, h('div', { class: 'cp-sel-t' }, h('b', { class: 'mono' }, a.id), h('h4', null, CR.hzName(a.hazard)), h('span', { class: 'tag ' + (a.level === 'critical' || a.level === 'high' ? 'danger' : 'warn') }, nm(a.stateName)), p && !C.preview ? h('span', { class: 'tag cool mono' }, p.id) : null, held ? h('span', { class: 'tag warn' }, B('معلّق', 'On hold')) : null),
      h('p', { class: 'muted' }, pl.line + (pl.muni ? ' — ' + pl.muni : '') + ' · ' + B('المصدر: ', 'Source: ') + nm(a.sourceName) + ' · ' + a.clock.slice(0, 5))));
    if (!p) {
      kids.push(note('warn', final ? 'هذا الإنذار مغلق: لا خطة إرسال نشطة.' : 'لا خطة إرسال لهذا الموقع (بعيد عن أي طريق في البيانات أو لا وحدة تصل إليه — محاكاة).', final ? 'This alert is closed: there is no active dispatch plan.' : 'There is no dispatch plan for this place (too far from any road in the data, or no unit can reach it — SIM).', 'alert'));
    } else {
      if (C.preview) kids.push(note('', 'معاينة: هذه توصية المحرّك لموقع الإنذار ولا تحجز أي وحدة. تُنشأ الخطة وتُحجز الوحدات عند اعتماد الإنذار (المفتاح البشري).', 'Preview: this is the engine\'s recommendation for the alert\'s place and it reserves no unit. The plan is created and the units are reserved when the alert is approved (the human key).', 'info'));
      kids.push(stepper(st));
    }
    // actions
    var acts = h('div', { class: 'cp-acts' }), canApprove = !final && (C.preview || !p || st === 'recommended') && CR.STATE_RANK[a.state] < 2;
    if (canApprove) { var al = approveLabel(a); acts.appendChild(gated('operator', fbtn('btn-safe', 'check', al[0], al[1], doApprove, 'appr', { id: 'cp-approve' }))); acts.appendChild(gated('operator', fbtn('btn-ghost btn-sm', 'stop', held ? 'ارفع التعليق' : 'علّق', held ? 'Release the hold' : 'Hold', doHold, 'hold', { id: 'cp-hold', 'aria-pressed': held ? 'true' : 'false' }))); }
    if (!final && !a.droneId) acts.appendChild(gated('operator', fbtn('btn-ghost btn-sm', 'drone', 'أطلق أقرب مسيّرة للتحقق', 'Launch the nearest drone to verify', doLaunchNearest, 'ln', { id: 'cp-launch-nearest' })));
    if (!final && (canApprove || (p && !C.preview && st !== 'cleared'))) {
      var pre = !p || C.preview || st === 'recommended';
      acts.appendChild(gated(pre ? 'operator' : 'commander', fbtn('btn-ghost btn-sm', 'x', pre ? 'اسحب (ارفض الإنذار)' : 'ألغِ الإرسال', pre ? 'Withdraw (dismiss the alert)' : 'Cancel the dispatch', doCancel, 'cancel', { id: 'cp-cancel' })));
    }
    if (acts.childNodes.length) kids.push(acts);
    if (held && canApprove) kids.push(para('معلّق: لا يُرسل شيء حتى تضغط «وافق».', 'On hold: nothing is sent until you press “Approve”.', 'cp-fine'));
    if (!final && !a.droneId && a.needDrone) kids.push(note('warn', 'لا مسيّرة متاحة لهذا الإنذار الآن (خارج المدى أو مشغولة) — تُعاد المحاولة تلقائيًا؛ الوحدات الأرضية تبقى الأولى.', 'No drone is available for this alert right now (out of range or busy) — retrying by itself; the ground units stay first.', 'alert'));
    return kids;
  }

  // ids and clock times inside Arabic (or English) sentences ('D-N1', 'DR-04', 'AL-1', '11:42') are isolated left-to-right so they never reorder: <bdi> elements and text nodes, never innerHTML
  var TOKEN_RE = /[A-Za-z]{1,3}-[A-Za-z]?\d+|\b[A-Z]\d+\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
  function bx(str) {
    str = String(str == null ? '' : str); var out = [], last = 0, m; TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(str))) { if (m.index > last) out.push(str.slice(last, m.index)); out.push(h('bdi', { dir: 'ltr' }, m[0])); last = m.index + m[0].length; }
    if (last < str.length) out.push(str.slice(last)); return out;
  }
  function kvRow(k, v) { return h('div', { class: 'cp-kv' }, h('span', { class: 'k' }, k), h('b', { class: 'v mono' }, v)); }
  function unitCard(z, u, c) {
    var wd = u.whyData || {}, ch = wd.chosen || {}, none = !u.unitId, ffb = !!wd.farButFaster, slot = u.slot || u.kind, ustate = UNIT_STATE[u.state || 'recommended'] || UNIT_STATE.recommended, kids = [];
    var etaB = h('b', { class: 'mono', 'data-eta': slot });
    kids.push(h('div', { class: 'cp-u-h' }, kindBadge(u.kind), h('div', { class: 'cp-u-t' }, h('b', null, CR.kindName(u.kind)), u.optional ? h('small', { class: 'muted' }, B('إضافية', 'extra')) : u.standby ? h('small', { class: 'muted' }, B('احتياط', 'standby')) : null),
      h('div', { class: 'cp-u-eta' }, z.live(etaB, function () { return planEta(planUnit(M.dc, slot)); }), h('small', null, bi('الوصول بحسب الازدحام (SIM)', 'ETA with traffic (SIM)')))));
    if (none) { kids.push(note('warn', 'لا توجد وحدة متاحة من هذا النوع تستطيع الوصول (محاكاة). في الواقع تقرر غرفة التحكم و999.', 'No available unit of this type can reach the scene (SIM). In real life the control room and 999 decide.', 'alert')); return h('article', { class: 'cp-unit none', 'data-kind': u.kind, 'data-slot': slot }, kids); }
    kids.push(h('p', { class: 'cp-u-n', 'data-winner': u.unitId }, nm(u.name)));
    if (u.sub && nm(u.sub)) kids.push(h('p', { class: 'cp-fine muted' }, B('الاسم في OSM: ', 'Named in OSM: ') + nm(u.sub)));
    var tags = [h('span', { class: 'tag ' + ustate[2] }, B(ustate[0], ustate[1]))];
    if (ffb) tags.push(h('span', { class: 'tag cool', 'data-ffb': '1' }, B('أبعد لكن أسرع بـ ', 'Farther but faster by ') + mmss(wd.gainSec || 0) + (isNum(wd.extraStraightM) ? ' (+' + km1(wd.extraStraightM) + ')' : '')));
    else if (u.nearestByStraight && u.nearestByStraight.unitId === u.unitId) tags.push(h('span', { class: 'tag safe' }, B('الأقرب والأسرع', 'Nearest and fastest')));
    if (u.reroutes) tags.push(h('span', { class: 'tag warn' }, B('أُعيد توجيهها ', 'Re-routed ') + N(u.reroutes) + '×'));
    if ((u.replaced || []).length) tags.push(h('span', { class: 'tag warn' }, B('حلّت محل وحدة سابقة ', 'Replaced an earlier unit ') + N(u.replaced.length) + '×'));
    if (u.unverified) tags.push(h('span', { class: 'tag warn' }, B('غير موثّق', 'unverified')));
    if (u.gap) tags.push(h('span', { class: 'tag warn' }, B('وقت وصول بعيد', 'far ETA')));
    kids.push(h('div', { class: 'cp-tags' }, tags), miniSteps(u));
    var free = isNum(ch.etaSec) && isNum(ch.delaySec) ? ch.etaSec - ch.delaySec : null;
    kids.push(h('div', { class: 'cp-facts' }, kvRow(B('مسار الطريق', 'Route length'), km1(u.distM)), kvRow(B('بخط مستقيم', 'Straight line'), isNum(ch.straightM) ? km1(ch.straightM) : '–'),
      kvRow(B('بلا ازدحام', 'Free-flow ETA'), free != null ? mmss(free) : '–'), kvRow(B('بالازدحام', 'With traffic'), isNum(ch.etaSec) ? mmss(ch.etaSec) : mmss(u.etaSec)),
      kvRow(B('تأخير الازدحام', 'Traffic delay'), isNum(ch.delaySec) ? plus(ch.delaySec) + (free ? ' (×' + N((free + ch.delaySec) / free, 2) + ')' : '') : '–'), kvRow(B('مقاطع مزدحمة', 'Congested segments'), isNum(ch.congestedSegments) ? N(ch.congestedSegments) : '–')));
    if (u.modelled) kids.push(h('p', { class: 'cp-fine muted' }, icon('hospital'), bi('الإسعاف مُنمذَج في قسم الطوارئ بهذا المستشفى؛ ليس مركز إسعاف حقيقيًا.', 'The ambulance is modelled at this hospital\'s emergency department; it is not a real ambulance station.')));
    if (u.runnerUp) kids.push(h('p', { class: 'cp-ru' }, h('span', { class: 'k' }, bi('صاحب المركز الثاني', 'Runner-up')), ' ', h('span', null, nm(u.runnerUp.name)), ' ', h('span', { class: 'mono' }, mmss(u.runnerUp.etaSec) + ' · ' + km1(u.runnerUp.distM) + (isNum(ch.etaSec) ? ' · ' + plus(u.runnerUp.etaSec - ch.etaSec) : ''))));
    var why = h('details', { class: 'cp-why', open: !!(M.openWhy && M.openWhy[c.a.id + ':' + slot]) }), wb = h('div', { class: 'cp-why-b' });
    why.appendChild(h('summary', { 'data-fk': 'why:' + fkey(slot) }, bi('لماذا هذه الوحدة؟', 'Why this unit?'))); why.appendChild(wb);
    why.addEventListener('toggle', function () { M.openWhy = M.openWhy || {}; var kk = c.a.id + ':' + slot; if (why.open) M.openWhy[kk] = 1; else delete M.openWhy[kk]; });
    wb.appendChild(h('p', { class: 'cp-why-t' }, nm(u.why)));
    if (wd.nearestByStraight && wd.nearestByStraight.id !== u.unitId && u.nearestByStraight) wb.appendChild(h('p', { class: 'cp-fine' }, h('b', null, B('الأقرب بخط مستقيم: ', 'Nearest in a straight line: ')), nm(u.nearestByStraight.name) + ' — ' + km1(u.nearestByStraight.straightM) + (isNum(u.nearestByStraight.etaSec) ? ', ' + B('وصول ', 'ETA ') + mmss(u.nearestByStraight.etaSec) : '')));
    if (ch.top && ch.top.length) wb.appendChild(h('div', { class: 'cp-segs' }, h('b', null, B('أبطأ المقاطع على الطريق:', 'Slowest segments on the route:')), h('ul', null, ch.top.map(function (s) { return h('li', null, h('span', null, nm(s.name)), h('span', { class: 'mono' }, plus(s.delaySec) + ' · ' + pc(Math.round((s.cong || 0) * 100)))); }))));
    if (wd.skippedBusy && wd.skippedBusy.length) wb.appendChild(h('p', { class: 'cp-fine muted' }, B('تُخطّيت ' + N(wd.skippedBusy.length) + ' وحدة لأنها مشغولة (محاكاة).', N(wd.skippedBusy.length) + ' unit(s) skipped because they are busy (SIM).')));
    if (wd.cutOff && wd.cutOff.length) wb.appendChild(h('p', { class: 'cp-fine muted' }, B('تُخطّيت وحدات انقطع طريقها بإغلاق.', 'Units whose way is cut off by a closure were skipped.')));
    if (wd.reason) wb.appendChild(h('p', { class: 'cp-fine muted' }, wd.reason === 'traffic' ? B('السبب الرئيسي: الازدحام.', 'Main reason: traffic.') : B('السبب الرئيسي: شكل شبكة الطرق (اتجاه واحد / تقاطعات) لا الازدحام وحده.', 'Main reason: the shape of the road network (one-way roads, interchanges), not traffic alone.')));
    kids.push(why);
    if (u.route && u.route.length) kids.push(h('div', { class: 'cp-btnrow' }, fbtn('btn-ghost btn-sm', 'route', 'أظهر المسار', 'Show the route', function () { showRoute(planUnit(M.dc, slot) || u, M.dc); }, 'rt:' + fkey(slot))));
    return h('article', { class: 'cp-unit' + (ffb ? ' ffb' : ''), 'data-kind': u.kind, 'data-slot': slot, 'data-unit': u.unitId }, kids);
  }
  function renderUnits(z) {
    var C = M.dc, p = C.plan; if (!p) return [];
    var kids = [h('div', { class: 'cp-units' }, p.units.map(function (u) { return unitCard(z, u, C); }))];
    var hp = p.hospital; if (hp && hp.name) {
      var hk = [h('div', { class: 'cp-u-h' }, kindBadge('hospital'), h('div', { class: 'cp-u-t' }, h('b', null, bi('المستشفى الوجهة', 'Destination hospital')), h('small', { class: 'muted' }, bi('للمصابين: الأسرع وصولًا ولديه طوارئ', 'For patients: fastest to reach, with an emergency department'))),
        h('div', { class: 'cp-u-eta' }, h('b', { class: 'mono' }, mmss(hp.etaSec)), h('small', null, bi('من الموقع (SIM)', 'from the scene (SIM)')))), h('p', { class: 'cp-u-n' }, nm(hp.name)),
        h('div', { class: 'cp-facts' }, kvRow(B('بالطريق', 'By road'), km1(hp.distM)), kvRow(B('الطوارئ', 'Emergency dept.'), nm(hp.edNote) || hp.ed || '–'), kvRow(B('سعة افتراضية', 'Assumed capacity'), (hp.fits ? B('تتسع', 'fits') : B('لا تتسع', 'does not fit')) + ' · ' + N(hp.freeSlots) + B(' أسرّة', ' beds')))];
      if (hp.why) hk.push(h('p', { class: 'cp-fine muted' }, nm(hp.why)));
      hk.push(h('p', { class: 'cp-fine muted' }, bi('السعة افتراض معلَّم (ليست بيانات حقيقية). الطوارئ «مؤكدة» فقط حيث تقول بيانات OSM ذلك.', 'Capacity is a labelled assumption (not real data). The ED is “confirmed” only where the OSM data says so.')));
      kids.push(h('article', { class: 'cp-unit cp-hosp' }, hk));
    }
    if (p.dataGap && p.dataGap.items && p.dataGap.items.length) kids.push(note('warn', 'فجوة بيانات: لا وحدات موثّقة قريبة. ' + nm0(p.dataGap.text, 'ar'), 'Data gap: no verified units close by. ' + nm0(p.dataGap.text, 'en'), 'alert'));
    if (p.notes && p.notes.length) kids.push(h('ul', { class: 'cp-notes' }, p.notes.map(function (n) { return h('li', null, nm(n)); })));
    return kids;
  }

  function sparkline(dayType, hourNow) {
    var W = 280, H = 56, pts = [], i, v, svg = CR.sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'cp-spark', role: 'img', 'aria-label': B('منحنى ضغط الازدحام على مدى اليوم مع علامة الوقت الحالي', 'The traffic pressure curve over the day with a marker for the time now') });
    for (i = 0; i <= 48; i++) { v = NN().profileAt(dayType, i / 2); pts.push((i / 48 * W).toFixed(1) + ',' + (H - 6 - clamp01(v) * (H - 14)).toFixed(1)); }
    var x = clamp01(hourNow / 24) * W;
    svg.appendChild(CR.sv('polyline', { points: pts.join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    svg.appendChild(CR.sv('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: 2, y2: H - 2, stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-dasharray': '3 3', class: 'now' }));
    [0, 6, 12, 18, 24].forEach(function (hh) { var t = CR.sv('text', { x: Math.min(W - 8, Math.max(8, hh / 24 * W)), y: H, 'text-anchor': 'middle', class: 'ax' }); t.textContent = String(hh); svg.appendChild(t); });
    return svg;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : (isNum(v) ? v : 0); }
  function renderTraffic(z) {
    var C = M.dc, s = S.snap, k = s.kpis.traffic, dt = DAY_TYPE[s.dayType] || [s.dayType, s.dayType], kids = [], inc = C.inc;
    kids.push(h('div', { class: 'cp-traffic' }, sparkline(s.dayType, s.hour), h('div', { class: 'cp-kvs' },
      kv(B('وقت المحاكاة', 'Simulated time'), nm(s.dowName) + ' ' + s.clock.slice(0, 5)), kv(B('نوع اليوم', 'Day type'), B(dt[0], dt[1])), kv(B('ضغط الذروة الآن', 'Peak pressure now'), pc(Math.round(s.traffic.pressure * 100)), s.traffic.pressure > 0.55 ? 'warn' : ''),
      kv(B('متوسط السرعة', 'Mean speed'), pc(Math.round(k.meanSpeedRatio * 100)) + B(' من الحرة', ' of free flow')), kv(B('طرق مزدحمة بقرارك', 'Roads you jammed'), N(jamCount())), kv(B('طرق مغلقة', 'Closed roads'), N(s.closedEdges.length)))));
    kids.push(h('p', { class: 'cp-fine muted' }, bi('الازدحام محاكاة بقواعد معلنة (ذروة الصباح والظهيرة والمساء، ويوم الجمعة مختلف)، لا بيانات مرور حقيقية؛ عبارة «الأسرع بحسب الازدحام» تعرض الآلية ولا تقيس قطر.', 'The congestion is simulated by stated rules (morning, midday and evening peaks; Friday differs), not real traffic data; “fastest given traffic” shows the mechanism, it does not measure Qatar.')));
    if (inc && C.plan && !C.preview) {
      var on = jamOn(inc), sw = h('input', { type: 'checkbox', 'data-fk': 'jam', id: 'cp-jam' });
      sw.checked = on; sw.addEventListener('change', function () { jamRoute(sw.checked); S.dirtyUI = true; });
      kids.push(h('label', { class: 'switch cp-jamsw' }, sw, h('span', null, bi('ازدحم الطرق أمام الوحدة الأولى (محاكاة): يعيد المحرّك حساب الخطة', 'Jam the roads ahead of the first unit (SIM): the engine recomputes the plan'))));
      if (!CR.can('operator')) kids.push(h('p', { class: 'cp-fine muted' }, icon('lock', 'cp-lock'), bi('الدور الحالي لا يستطيع الازدحام؛ المحاولة تُسجَّل مع السبب.', 'The current role cannot jam roads; trying is logged with the reason.')));
      var fx = M.fx && M.fx.inc === inc.id ? M.fx : null;
      if (fx) {
        var rows = fx.before.map(function (b) {
          var nu = planUnit(C, b.slot), nch = nu && nu.whyData && nu.whyData.chosen, ne = nu && nu.unitId ? (nch && isNum(nch.etaSec) ? nch.etaSec : nu.etaSec) : null, same = nu && nu.unitId === b.unitId, d = same && isNum(ne) && isNum(b.etaSec) ? ne - b.etaSec : null;
          return h('li', { class: 'cp-fx-r' + (nu && !same ? ' chg' : '') }, kindBadge(b.kind), h('div', { class: 'cp-fx-x' }, h('b', null, CR.kindName(b.kind)),
            h('span', { class: 'cp-fx-b' }, h('small', null, B('قبل', 'Before')), nm(b.name) + ' · ' + mmss(b.etaSec)), h('span', { class: 'cp-fx-n' }, h('small', null, B('الآن', 'Now')), nu && nu.unitId ? nm(nu.name) + ' · ' + mmss(ne) : '–'),
            same ? h('span', { class: 'tag ' + (d > 0 ? 'warn' : '') }, d > 0 ? plus(d) : B('بلا تغيير', 'no change')) : h('span', { class: 'tag cool' }, B('تغيّرت الوحدة', 'the unit changed'))));
        });
        kids.push(h('div', { class: 'cp-fx' }, h('b', null, bi('أثر الازدحام على الخطة', 'What the jam did to the plan')), h('p', { class: 'cp-fine muted' }, B('ازدُحم ' + N(fx.n) + ' مقاطع على طريق ' + fx.first + ' عند ' + fx.clock.slice(0, 8) + '. ', N(fx.n) + ' segments on the route of ' + fx.first + ' were jammed at ' + fx.clock.slice(0, 8) + '. ') + (S.nat.dirty ? B('ينتظر المحرّك دورة إعادة التقييم القادمة (شغّل المحاكاة).', 'Waiting for the engine\'s next re-evaluation (run the simulation).') : B('أعاد المحرّك التقييم.', 'The engine has re-evaluated.'))), h('ul', { class: 'cp-fx-l' }, rows)));
      }
    }
    if (jamCount()) kids.push(h('div', { class: 'cp-btnrow' }, fbtn('btn-ghost btn-sm', 'reset', 'أزل كل الازدحام', 'Clear all jams', clearAllJams, 'clr', { id: 'cp-clear-jams' })));
    return card('cp-trf', 'الازدحام وزمن الوصول', 'Traffic and ETA', simTag(), kids);
  }

  function renderEyes(z) {
    var C = M.dc, a = C.a; if (!a) return [];
    var dr = a.droneId ? droneRowOf(a.droneId) : null, kids = [], best = null; if (!dr && !CR.isFinal(a)) { try { best = NN().droneEta(S.nat, a.lon, a.lat, undefined, a.hazard); } catch (e) { best = null; } }
    var etaB = h('b', { class: 'mono' }), gB = h('b', { class: 'mono' }), leadB = h('b', { class: 'mono' });
    var droneNow = function () { var d = a.droneId ? droneRowOf(a.droneId) : null; return d ? (d.state === 'on-station' || d.state === 'verifying' ? 0 : (d.state === 'launching' || d.state === 'en-route') && isNum(d.etaSec) ? d.etaSec : null) : (best ? best.etaSec : null); };
    var gNow = function () { return firstGround(M.dc.plan); };
    kids.push(h('div', { class: 'cp-eyes' }, h('div', { class: 'cp-eye' }, h('small', null, dr ? B('المسيّرة ' + dr.callsign, 'Drone ' + dr.callsign) : best ? B('أسرع مسيّرة يمكن إطلاقها', 'Fastest drone that could launch') : B('المسيّرة', 'Drone')),
      z.live(etaB, function () { var v = droneNow(); return v === 0 ? B('في الموقع', 'on station') : v == null ? (dr ? '–' : B('لا مسيّرة تصل', 'none can reach')) : mmss(v); })),
      h('div', { class: 'cp-eye' }, h('small', null, B('أول وحدة أرضية', 'First ground unit')), z.live(gB, function () { var v = gNow(); return v === 0 ? B('في الموقع', 'on scene') : v == null ? '–' : mmss(v); })),
      h('div', { class: 'cp-eye lead' }, h('small', null, B('تسبق المسيّرة بـ', 'The drone leads by')), z.live(leadB, function () { var d = droneNow(), g = gNow(); return d == null || g == null ? '–' : d <= g ? mmss(g - d) : '−' + mmss(d - g); }))));
    kids.push(h('p', { class: 'cp-fine' }, bi('«عيون أولًا»: تصل المسيّرة بخط مستقيم غالبًا قبل أي مركبة أرضية، فتتحقق غرفة التحكم قبل أن تُلزم الوحدات. المسيّرة تتحقق فقط؛ الإرسال بالمفتاح البشري.', '“First eyes”: a drone, flying in a straight line, usually arrives before any ground unit, so the control room can verify before committing units. The drone only verifies; the dispatch needs the human key.')));
    var fe = M.cov && M.cov.fe;
    kids.push(h('p', { class: 'cp-fine muted' }, fe ? B('قياس A/B الآن (SIM): المسيّرة أولًا في ' + N(fe.droneFirstPct) + '٪ من الحوادث التي تصلها، الوسيط ' + mmss(fe.droneEtaSec.p50) + ' مقابل ' + mmss(fe.firstGroundEtaSec.p50) + '؛ ' + N(fe.noDroneAvailablePct) + '٪ خارج مدى كل المسيّرات.', 'A/B measured now (SIM): the drone is first in ' + N(fe.droneFirstPct) + ' % of the incidents it can reach, median ' + mmss(fe.droneEtaSec.p50) + ' vs ' + mmss(fe.firstGroundEtaSec.p50) + '; ' + N(fe.noDroneAvailablePct) + ' % are out of range of every drone.')
      : B('مقاس موثّق (SIM، البذرة 7، 150 حادثًا): المسيّرة أولًا في ' + N(DOCS_COVERAGE.first) + '٪ من الحوادث التي تصلها، الوسيط ' + N(DOCS_COVERAGE.drone) + ' ث مقابل ' + N(DOCS_COVERAGE.ground) + ' ث؛ ' + N(DOCS_COVERAGE.out) + '٪ خارج المدى.', 'Documented measurement (SIM, seed 7, 150 incidents): the drone is first in ' + N(DOCS_COVERAGE.first) + ' % of the incidents it can reach, median ' + N(DOCS_COVERAGE.drone) + ' s vs ' + N(DOCS_COVERAGE.ground) + ' s; ' + N(DOCS_COVERAGE.out) + ' % are out of range.')));
    return card('cp-eyes-c', 'المسيّرة قبل الوحدة الأرضية', 'Drone before the ground unit', simTag(), kids);
  }

  function historyOf(c) {
    if (!c.inc || !S.nat) return [];
    var ev = S.nat.events || [], out = [], i, e;
    for (i = ev.length - 1; i >= 0 && out.length < 40; i--) { e = ev[i]; if (e.incident === c.inc.id && (e.type === 'redispatch' || e.type === 'reroute-unit' || e.type === 'recommendation-change' || e.type === 'dispatch-degraded')) out.push(e); }
    return out;
  }
  var HIST_TAG = { redispatch: ['إعادة إرسال', 'Re-dispatch', 'warn'], 'reroute-unit': ['تغيير مسار', 'Re-route', 'cool'], 'recommendation-change': ['تغيّرت التوصية', 'Recommendation changed', 'cool'], 'dispatch-degraded': ['لا بديل', 'No replacement', 'danger'] };
  function renderHistory() {
    var C = M.dc, list = historyOf(C); if (!C.a) return [];
    var body = list.length ? [h('ul', { class: 'cp-hist' }, list.slice(0, 8).map(function (e) { var tg = HIST_TAG[e.type] || [e.type, e.type, '']; return h('li', null, h('time', { class: 'mono' }, (e.clock || '').slice(0, 8)), h('span', { class: 'tag ' + tg[2] }, B(tg[0], tg[1])), h('span', { class: 'cp-hist-x' }, bx(nm(e.text)))); })),
      list.length > 8 ? h('p', { class: 'cp-fine muted' }, B('و ' + N(list.length - 8) + ' أقدم', 'and ' + N(list.length - 8) + ' older')) : null]
      : [h('p', { class: 'cp-empty' }, bi('لا إعادة إرسال ولا تغيير مسار حتى الآن. تعيد المنظومة الإرسال تلقائيًا إذا ازدحم طريق أو أُغلق أو انشغلت وحدة أو صارت وحدة أخرى أسرع بهامش معلن.', 'No re-dispatch or re-route yet. The system re-dispatches by itself when a road jams or closes, a unit becomes busy, or another unit becomes faster by a stated margin.'))];
    return card('cp-hist-c', 'سجل إعادة الإرسال', 'Re-dispatch history', h('span', { class: 'tag' }, N(list.length)), body);
  }
  function renderTools() {
    var C = M.dc; if (!C.a) return [];
    var kids = [h('div', { class: 'cp-btnrow' }, C.inc && C.plan ? fbtn('btn-ghost btn-sm', 'download', 'صدّر CAP 1.2', 'Export CAP 1.2', doCap, 'cap', { id: 'cp-cap' }) : null,
      C.inc ? fbtn('btn-ghost btn-sm', 'zoomin', 'قرّب إلى الحادث', 'Fly to the incident', function () { CR.flyToAlert(C.a); }, 'fly') : null),
      h('p', { class: 'cp-fine muted' }, bi('رسالة CAP 1.2 بحالة «تمرين» (Exercise) وليست إنذارًا حقيقيًا ولا تُبثّ؛ هي حزمة موثّقة لغرفة التحكم / CAD التي تقرّر.', 'The CAP 1.2 message has the status “Exercise”: it is not a real alert and is not broadcast; it is a verified package for the control room / CAD, which decides.'))];
    return kids;
  }

  /* ====================================================================================
   * 5. COMMS
   * ==================================================================================== */
  var CAT = { operator: ['المشغّل', 'Operator', ''], flow: ['الإنذارات والإرسال', 'Alerts and dispatch', 'cool'], drone: ['المسيّرات', 'Drones', 'info'], voice: ['البثّ الصوتي', 'Announcements', 'warn'], bus: ['الشبكة', 'Bus', 'cool'], phone: ['هواتف السكان', 'Resident phones', 'safe'], robot: ['الروبوت', 'Robot', 'info'], detect: ['كاشف الرؤية', 'Detector', 'warn'] };
  var CAT_ORDER = ['operator', 'flow', 'drone', 'voice', 'bus', 'phone', 'robot', 'detect'];
  function catOfOp(e) {
    var k = e.kind;
    if (k === 'operator' || k === 'reject') return 'operator';
    if (k === 'bus' || k === 'phone' || k === 'robot' || k === 'drone') return k;
    if (k === 'system') return e.detection ? 'detect' : e.ev && /^drone-/.test(e.ev) ? 'drone' : 'flow';
    return 'flow';
  }
  function catOfComm(c) { var k = c.kind; return k === 'drone-announce' ? 'voice' : k === 'operator' || k === 'aed' ? 'operator' : k === 'alert-raised' ? 'flow' : 'drone'; }
  var ROLE_LBL = { operator: ['المشغّل', 'operator'], 'control-room': ['غرفة التحكم', 'control room'], system: ['النظام', 'system'], drone: ['مسيّرة', 'drone'] };
  function who(x) { if (!x) return ''; if (x.id) { var r = droneRowOf(x.id); return r ? r.callsign : String(x.id); } var l = ROLE_LBL[x.role]; return l ? B(l[0], l[1]) : String(x.role || ''); }
  function fromComm(c) {
    var text = c.text, cs = c.drone && droneRowOf(c.drone) ? droneRowOf(c.drone).callsign : c.drone || '';
    if (c.kind === 'drone-announce') { var sp = c.spoken || (c.text && (c.text.ar || c.text.en)) || '', lg = c.lang === 'ar' ? ['العربية', 'Arabic'] : ['الإنجليزية', 'English']; text = { ar: 'بثّ صوتي عبر ' + cs + ' (' + lg[0] + '): «' + sp + '»', en: 'Voice announcement via ' + cs + ' (' + lg[1] + '): “' + sp + '”' }; }
    return { key: 'c' + c.id, src: 'engine', t: c.t, clock: c.clock, cat: catOfComm(c), text: text, alert: c.alert || null, inc: c.incident || null, drone: c.drone || null, from: c.from, to: c.to, sub: c.kind, ord: 1 };
  }
  function fromOp(e) {
    var rej = e.kind === 'reject';
    return { key: 'o' + e.id, src: 'ops', t: e.t, clock: e.clock, wall: e.wall, cat: catOfOp(e), text: e.text, alert: e.alert || null, inc: e.inc || null, rej: rej, msgType: e.msgType || null, sub: e.kind, ord: 0 };
  }
  function entries() {
    var nat = S.nat, comms = nat ? NN().commsLog(nat) : [], lastC = comms.length ? comms[comms.length - 1].id : '', k = [S.opSeq, S.oplog.length, comms.length, lastC, M.inbSeq].join('|');
    if (M.ent && M.entKey === k) return M.ent;
    var out = [], seen = {}, i;
    S.oplog.forEach(function (e) { var x = fromOp(e); out.push(x); if (x.text && x.text.en) seen[x.text.en + '|' + Math.floor(x.t)] = 1; });
    comms.forEach(function (c) { var x = fromComm(c); if (!(x.text && x.text.en && seen[x.text.en + '|' + Math.floor(x.t)])) out.push(x); });
    var robotOps = S.oplog.filter(function (e) { return e.kind === 'robot'; });
    M.inb.forEach(function (e) {
      if ((e.msgType === 'robot' || e.msgType === 'robot-find') && robotOps.some(function (o) { return Math.abs((o.wall || 0) - e.wall) < 3000; })) return;      // the robot tab logs those itself
      out.push(e);
    });
    out.sort(function (a, b) { return a.t - b.t || a.ord - b.ord || (a.key < b.key ? -1 : 1); });
    for (i = 0; i < out.length; i++) out[i].n = i + 1;
    M.ent = out; M.entKey = k; return out;
  }
  function filtered() {
    var f = M.cf, q = f.q.trim().toLowerCase(), sel = f.sel && S.sel;
    return entries().filter(function (e) {
      if (f.cat !== 'all' && e.cat !== f.cat) return false;
      if (sel && e.alert !== S.sel && e.inc !== (CR.alertOf(S.sel) || {}).incident) return false;
      if (q) { var hay = ((e.text && (e.text.ar + ' ' + e.text.en)) || '') + ' ' + (e.alert || '') + ' ' + (e.inc || '') + ' ' + (e.msgType || '') + ' ' + (e.drone || ''); if (hay.toLowerCase().indexOf(q) < 0) return false; }
      return true;
    });
  }
  function onInbound(m) {                                                               // bus messages from OTHER tabs (the phones' answers and the detector are logged by control.js already)
    if (!m || typeof m !== 'object' || !S.snap) return;
    var ty = typeof m.type === 'string' ? m.type : ''; if (!/^[a-z][a-z0-9-]{1,23}$/.test(ty) || ty === 'citizen' || ty === 'detection' || m.from === 'control.html') return;
    var from = typeof m.from === 'string' ? m.from.slice(0, 24) : '?', last = M.inb[M.inb.length - 1];
    if (last && last.msgType === ty && (ty === 'drone-status' || ty === 'advisory') && S.snap.t - last.t < 30) { last.n2 = (last.n2 || 1) + 1; last.wall = Date.now(); M.inbSeq++; return; }
    var bits = []; ['id', 'hazard', 'level', 'state', 'stage', 'outcome', 'person', 'room', 'status'].forEach(function (k) { var v = m[k]; if (v != null && typeof v !== 'object') bits.push(k + ' ' + String(v).slice(0, 40)); });
    var cat = ty === 'robot' || ty === 'robot-find' ? 'robot' : 'bus', det = (bits.length ? ' — ' + bits.join(' · ') : '');
    M.inb.push({ key: 'i' + (++M.inbSeq), src: 'bus-in', t: S.snap.t, clock: S.snap.clock, wall: Date.now(), cat: cat, ord: 2, msgType: ty, inbound: true, from: { role: from }, text: { ar: 'رسالة واردة على الشبكة (' + from + '): ' + ty + det, en: 'Inbound bus message (' + from + '): ' + ty + det }, alert: typeof m.alertId === 'string' ? m.alertId.slice(0, 16) : null });
    if (M.inb.length > 300) M.inb.shift();
    S.dirtyUI = true;
  }
  function entryLine(e, lg) { var tx = e.text ? (lg === 'en' ? e.text.en || e.text.ar : e.text.ar || e.text.en) : ''; return '[' + (e.clock || '').slice(0, 8) + '] [' + (CAT[e.cat] ? CAT[e.cat][lg === 'en' ? 1 : 0] : e.cat) + (e.rej ? (lg === 'en' ? ' — REJECTED' : ' — مرفوض') : '') + '] ' + tx + (e.alert ? ' (' + e.alert + ')' : '') + (e.msgType ? ' {' + e.msgType + '}' : ''); }
  function commsText(list) {
    var lg = CR.lang(), s = S.snap, L = [];
    L.push('MANARA — ' + B('سجل اتصالات غرفة التحكم', 'Control Room comms log') + ' — ' + B('محاكاة (SIM): لا حادث حقيقي ولا وحدة حقيقية ولا مقيم حقيقي', 'SIMULATION (SIM): no real incident, no real unit, no real resident'));
    L.push(B('التصدير: ', 'Exported: ') + new Date().toISOString() + ' · ' + B('ساعة المحاكاة: ', 'Simulated clock: ') + (s ? nm(s.dowName) + ' ' + s.date + ' ' + s.clock : '') + ' · ' + B('البذرة: ', 'Seed: ') + S.opts.seed + ' · ' + B('السجلات: ', 'Entries: ') + list.length);
    L.push(B('المرشّح: ', 'Filter: ') + (M.cf.cat === 'all' ? B('الكل', 'all') : B(CAT[M.cf.cat][0], CAT[M.cf.cat][1])) + (M.cf.q ? ' · “' + M.cf.q + '”' : '') + (M.cf.sel ? ' · ' + B('الإنذار المحدد فقط', 'selected alert only') : ''));
    L.push(B('999 تبقى هي المُرسِل؛ منارة مفهوم بنموذج أولي محاكى.', '999 stays the dispatcher; MANARA is a concept with a simulated prototype.'));
    L.push('------------------------------------------------------------');
    list.forEach(function (e) { L.push(entryLine(e, lg)); });
    return L.join('\n') + '\n';
  }
  function exportComms() {
    var list = filtered(), txt = commsText(list), s = S.snap;
    CR.dl('manara-comms-' + (s ? s.date : 'sim') + '-' + (s ? s.clock.replace(/:/g, '') : '') + '.txt', 'text/plain', txt);
    CR.logOp('operator', 'صدّر المشغّل سجل الاتصالات (' + N(list.length) + ' سجلًا) كملف نصي', 'The operator exported the comms log (' + N(list.length) + ' entries) as a text file');
    return txt;
  }
  function copyComms() { var txt = commsText(filtered()); CR.copyText(txt).then(function (ok) { CR.toast({ ar: ok ? 'نُسخ سجل الاتصالات' : 'تعذّر النسخ', en: ok ? 'Comms log copied' : 'Copy failed' }, ok ? 'safe' : 'warn', 2400); }); return txt; }

  /* ---- the compose card: a broadcast to a zone (the phones) and an announcement through a drone's speaker ---- */
  var BC_HAZ = ['fire', 'gas', 'flood', 'dust', 'heat'], BC_LV = [['watch', 'ترقّب', 'Watch'], ['warning', 'احتماء في المكان', 'Shelter in place'], ['evacuate', 'إخلاء', 'Evacuate']], DV_KEYS = ['identify', 'follow-light', 'move-away', 'shelter', 'crosswind', 'flood', 'stay-put'];
  function zonesList() {                                                                // the selected alert's surroundings, the 8 municipalities and the 135 named places (static data: built once per engine)
    var out = [], a = CR.selectedAlert();
    if (a) out.push({ id: 'sel', name: { ar: 'محيط الإنذار ' + a.id, en: 'Around alert ' + a.id }, lon: a.lon, lat: a.lat, radiusM: 1200 });
    if (!M.zs || M.zs.world !== S.world) {
      var list = [], G = win.MANARA_QATAR_GEO, pl = G && G.places ? G.places.slice() : [];
      (S.world && S.world.municipalities || []).forEach(function (m) { if (m.centre) list.push({ id: 'm:' + m.id, name: { ar: 'بلدية ' + nm0(m.name, 'ar'), en: nm0(m.name, 'en') + ' municipality' }, lon: m.centre[0], lat: m.centre[1], radiusM: 9000, muni: m.id }); });
      pl.sort(function (x, y) { return nm0(x.name, 'en') < nm0(y.name, 'en') ? -1 : 1; });
      pl.forEach(function (p) { list.push({ id: 'p:' + p.id, name: { ar: nm0(p.name, 'ar'), en: nm0(p.name, 'en') }, lon: p.lon, lat: p.lat, radiusM: 2500, muni: p.muni }); });
      M.zs = { world: S.world, list: list };
    }
    return out.concat(M.zs.list);
  }
  function templateText(hz, lv, lg) {
    var MM = win.MANARA_MSG, g = null; try { g = MM && MM.get({ hazard: hz, level: lv, persona: 'adult', lang: lg, also: false }); } catch (e) { g = null; }
    return g ? g.headline + '\n' + (g.lines || []).join('\n') : '';
  }
  function bcFill(force) {
    var b = M.bc; if (b.edited && !force) return;
    b.ar = templateText(b.hz, b.lv, 'ar'); b.en = templateText(b.hz, b.lv, 'en'); b.edited = false;
    if (M.ui) { M.ui.ar.value = b.ar; M.ui.en.value = b.en; }
  }
  function sendBroadcast() {
    var b = M.bc, zs = zonesList(), z = zs.filter(function (x) { return x.id === b.zone; })[0] || zs[0];
    if (!z) return null;
    if (!CR.need('operator', 'بثّ إنذار إلى الهواتف', 'broadcast to the phones')) { b.confirm = 0; return null; }
    if (!b.confirm || CR.now() - b.confirm > 6000) { b.confirm = CR.now(); S.dirtyUI = true; CR.live(B('اضغط «أرسل» مرة أخرى للتأكيد: يصل إلى الهواتف في المحاكاة', 'Press Send again to confirm: it reaches the phones in the simulation')); return { confirm: true }; }
    b.confirm = 0;
    var id = 'B-' + (++M.bseq), lv = b.lv === 'warning' ? 'shelter' : b.lv, hn = CR.hzName(b.hz), zn = z.name;
    var ar = 'بثّ يدوي إلى الهواتف: ' + hn + ' — ' + lv + ' — ' + zn.ar, en = 'Manual broadcast to the phones: ' + hn + ' — ' + lv + ' — ' + zn.en;
    var msg = { type: 'alert', scope: 'national', id: id, hazard: b.hz, level: lv, area: { ar: zn.ar + ' (محاكاة)', en: zn.en + ' (simulation)' }, at: { lon: z.lon, lat: z.lat }, radiusM: z.radiusM, incident: { id: id, hazard: b.hz, muni: z.muni || null, place: { ar: zn.ar, en: zn.en } }, hour: S.snap.hour, clock: S.snap.clock, origin: 'manara', broadcast: true, text: { ar: b.ar, en: b.en } };
    var e = CR.busSend(msg, 'alert', ar, en);
    CR.logOp('operator', 'نصّ البثّ (AR): ' + b.ar.replace(/\n/g, ' ') + ' | (EN): ' + b.en.replace(/\n/g, ' '), 'Broadcast text (AR): ' + b.ar.replace(/\n/g, ' ') + ' | (EN): ' + b.en.replace(/\n/g, ' '), { msgType: 'alert', bcast: id });
    CR.decision('broadcast', ar, en, { zone: z.id, hazard: b.hz, level: lv });
    M.lastBroadcast = { id: id, zone: z.id, at: S.snap.clock }; S.dirtyUI = true;
    return { ok: true, id: id, entry: e };
  }
  function dronesOnStation() { return S.snap.drones.filter(function (d) { return d.state === 'on-station' || d.state === 'verifying'; }); }
  function sendDroneVoice() {
    var v = M.dv, ds = dronesOnStation(), d = ds.filter(function (x) { return x.id === v.drone; })[0] || ds[0];
    if (!d) { CR.toast({ ar: 'لا مسيّرة في الموقع الآن للبثّ', en: 'No drone on station to announce through' }, 'warn'); return null; }
    var langs = v.lang === 'both' ? ['ar', 'en'] : [v.lang], res = null;
    langs.forEach(function (lg) { res = CR.announceVia(d.id, v.key, lg) || res; });
    S.dirtyUI = true; return res;
  }
  function buildCompose(root) {
    var ui = M.ui = {};
    var zoneSel = h('select', { class: 'input', id: 'cp-bc-zone', 'data-fk': 'bc-zone', onchange: function () { M.bc.zone = zoneSel.value; M.bc.confirm = 0; } });
    var hzSel = h('select', { class: 'input', id: 'cp-bc-hz', 'data-fk': 'bc-hz', onchange: function () { M.bc.hz = hzSel.value; M.bc.confirm = 0; bcFill(false); } });
    var lvSel = h('select', { class: 'input', id: 'cp-bc-lv', 'data-fk': 'bc-lv', onchange: function () { M.bc.lv = lvSel.value; M.bc.confirm = 0; bcFill(false); } });
    ui.ar = h('textarea', { class: 'input cp-ta', id: 'cp-bc-ar', rows: '5', lang: 'ar', dir: 'rtl', oninput: function () { M.bc.ar = ui.ar.value; M.bc.edited = true; } });
    ui.en = h('textarea', { class: 'input cp-ta', id: 'cp-bc-en', rows: '5', lang: 'en', dir: 'ltr', oninput: function () { M.bc.en = ui.en.value; M.bc.edited = true; } });
    ui.zoneSel = zoneSel; ui.hzSel = hzSel; ui.lvSel = lvSel;
    ui.send = h('button', { type: 'button', class: 'btn btn-danger btn-sm', id: 'cp-bc-send', 'data-fk': 'bc-send', onclick: function () { sendBroadcast(); updCompose(); } }, icon('speaker'), h('span', { class: 'bs' }));
    ui.reset = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cp-bc-reset', onclick: function () { bcFill(true); } }, icon('reset'), h('span', { class: 'br' }));
    ui.drone = h('select', { class: 'input', id: 'cp-dv-drone', 'data-fk': 'dv-drone', onchange: function () { M.dv.drone = ui.drone.value; } });
    ui.key = h('select', { class: 'input', id: 'cp-dv-key', 'data-fk': 'dv-key', onchange: function () { M.dv.key = ui.key.value; updCompose(); } });
    ui.lang = h('select', { class: 'input', id: 'cp-dv-lang', 'data-fk': 'dv-lang', onchange: function () { M.dv.lang = ui.lang.value; } });
    ui.say = h('p', { class: 'cp-say' });
    ui.dsend = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cp-dv-send', 'data-fk': 'dv-send', onclick: function () { sendDroneVoice(); updCompose(); } }, icon('speaker'), h('span', { class: 'ds' }));
    ui.lbl = {}; var L = function (k) { return (ui.lbl[k] = h('span')); };
    var fld = function (k, c) { return h('label', { class: 'field' }, L(k), c); };
    var det = h('details', { class: 'cp-compose', open: true }, h('summary', { 'data-fk': 'compose' }, bi('اكتب بثًّا', 'Compose a broadcast')),
      h('div', { class: 'cp-cbody' },
        h('div', { class: 'cp-form' }, fld('zone', zoneSel), fld('hz', hzSel), fld('lv', lvSel)),
        h('div', { class: 'cp-form two' }, fld('ar', ui.ar), fld('en', ui.en)),
        h('p', { class: 'cp-fine muted', id: 'cp-bc-note' }, bi('على الهواتف تظهر بطاقة قوالب MANARA_MSG المراجَعة لهذا الخطر والمستوى؛ النص المعدَّل يُسجَّل في السجل فقط (إثبات قبل الذعر: كلمات الإنذار على هاتف المقيم من القوالب المراجَعة). لا بثّ لحالات «مساعدة» (SOS): خاصة.', 'On the phones the reviewed MANARA_MSG card for this hazard and level is shown; an edited text is recorded in the log only (proof before panic: the words on a resident\'s phone come from the reviewed templates). “Help” (SOS) is never broadcast: it is private.')),
        h('div', { class: 'cp-btnrow' }, gated('operator', ui.send), ui.reset),
        h('hr', { class: 'cp-hr' }),
        h('div', { class: 'cp-form' }, fld('drone', ui.drone), fld('key', ui.key), fld('lang', ui.lang)), ui.say,
        h('div', { class: 'cp-btnrow' }, gated('operator', ui.dsend)),
        h('p', { class: 'cp-fine muted' }, bi('البثّ عبر مكبّر المسيّرة يستعمل عبارات المحرّك المراجَعة فقط ويحتاج مسيّرة في الموقع. المسيّرة مفهوم؛ لا بثّ حقيقي.', 'A drone-speaker announcement uses only the engine\'s reviewed phrases and needs a drone on station. The drone is a concept; there is no real broadcast.'))));
    root.appendChild(det);
    bcFill(true);
  }
  function opt(sel, items, cur, fmt) {                                                  // keep a select's options in step with the data without rebuilding it while it has the focus
    var sig = items.map(function (i) { return i[0]; }).join('|') + '|' + CR.lang();
    if (sel.getAttribute('data-sig') !== sig && doc.activeElement !== sel) {
      sel.replaceChildren.apply(sel, items.map(function (i) { return h('option', { value: i[0] }, fmt(i)); })); sel.setAttribute('data-sig', sig);
    }
    if (doc.activeElement !== sel) sel.value = items.some(function (i) { return i[0] === cur; }) ? cur : (items[0] ? items[0][0] : '');
  }
  function updCompose() {
    var u = M.ui; if (!u) return;
    var zs = zonesList(), ds = dronesOnStation(), MSGS = NN().MSG || {};
    if (!zs.some(function (z) { return z.id === M.bc.zone; })) M.bc.zone = zs[0] ? zs[0].id : '';
    opt(u.zoneSel, zs.map(function (z) { return [z.id, z]; }), M.bc.zone, function (i) { return nm(i[1].name); });
    opt(u.hzSel, BC_HAZ.map(function (x) { return [x]; }), M.bc.hz, function (i) { return CR.hzName(i[0]); });
    opt(u.lvSel, BC_LV.map(function (x) { return [x[0], x]; }), M.bc.lv, function (i) { return B(i[1][1], i[1][2]); });
    if (!ds.some(function (d) { return d.id === M.dv.drone; })) M.dv.drone = ds[0] ? ds[0].id : '';
    opt(u.drone, ds.length ? ds.map(function (d) { return [d.id, d]; }) : [['', null]], M.dv.drone, function (i) { return i[1] ? i[1].callsign + ' — ' + nm(i[1].stateText) : B('لا مسيّرة في الموقع', 'no drone on station'); });
    opt(u.key, DV_KEYS.map(function (x) { return [x]; }), M.dv.key, function (i) { var m = MSGS['nat.drone.say.' + i[0]]; return m ? nm(m) : i[0]; });
    opt(u.lang, [['ar'], ['en'], ['both']], M.dv.lang, function (i) { return i[0] === 'ar' ? B('العربية', 'Arabic') : i[0] === 'en' ? B('الإنجليزية', 'English') : B('العربية والإنجليزية', 'Arabic and English'); });
    setT(u.lbl.zone, B('المنطقة أو المكان', 'Zone or place')); setT(u.lbl.hz, B('الخطر', 'Hazard')); setT(u.lbl.lv, B('المستوى', 'Level')); setT(u.lbl.ar, B('النص بالعربية', 'Text in Arabic')); setT(u.lbl.en, B('النص بالإنجليزية', 'Text in English'));
    setT(u.lbl.drone, B('المسيّرة في الموقع', 'Drone on station')); setT(u.lbl.key, B('العبارة', 'Phrase')); setT(u.lbl.lang, B('اللغة', 'Language'));
    var pend = M.bc.confirm && CR.now() - M.bc.confirm <= 6000;
    setT(u.send.lastChild, pend ? B('اضغط مرة أخرى للتأكيد', 'Press again to confirm') : B('أرسل إلى الهواتف (SIM)', 'Send to the phones (SIM)')); setT(u.reset.lastChild, B('أعد إلى القالب', 'Reset to the template'));
    setT(u.dsend.lastChild, B('أذِع عبر المسيّرة', 'Announce through the drone')); u.dsend.setAttribute('aria-disabled', ds.length ? 'false' : 'true');
    var m = MSGS['nat.drone.say.' + M.dv.key]; setT(u.say, m ? B('سيُقال: «', 'It will say: “') + (M.dv.lang === 'en' ? m.en : m.ar) + B('»', '”') : '');
    if (!M.bc.edited && !u.ar.value) bcFill(true);
  }

  function commsBuild(t, root) {
    root.appendChild(panelHead('سجل الاتصالات', 'Comms log', bi('كل ما يحدث في مكان واحد: أفعال المشغّل، رسائل الشبكة إلى الهواتف ومنها، بثّ مسيّرات، رسائل المقيمين، الروبوت وكاشف الرؤية.', 'Everything in one place: operator actions, the messages to and from the phones, drone announcements, residents\' messages, the robot and the detector.')));
    var ui = t.ui = { chips: {} }, chips = h('div', { class: 'cp-chips', role: 'group' });
    lab(chips, 'aria-label', 'تصفية السجل حسب النوع', 'Filter the log by type');
    ['all'].concat(CAT_ORDER).forEach(function (c) { var b = h('button', { type: 'button', class: 'chip', 'data-cat': c, 'data-fk': 'cat:' + c, 'aria-pressed': c === M.cf.cat ? 'true' : 'false', onclick: function () { M.cf.cat = c; M.cf.limit = 120; t.update(); } }, h('span', { class: 'cp-fl' }), h('span', { class: 'mono cp-fc' })); ui.chips[c] = b; chips.appendChild(b); });
    ui.q = h('input', { type: 'search', class: 'input cp-q', id: 'cp-q', 'data-fk': 'q', autocomplete: 'off', oninput: function () { M.cf.q = ui.q.value; M.cf.limit = 120; t.update(); } });
    lab(ui.q, 'placeholder', 'ابحث في السجل (نص، رقم إنذار، نوع رسالة)', 'Search the log (text, alert id, message type)'); lab(ui.q, 'aria-label', 'ابحث في السجل', 'Search the log');
    ui.selCb = h('input', { type: 'checkbox', id: 'cp-selonly', 'data-fk': 'selonly', onchange: function () { M.cf.sel = ui.selCb.checked; t.update(); } });
    ui.selLb = h('span');
    ui.count = h('p', { class: 'cp-count muted', role: 'status' });
    ui.exp = fbtn('btn-ghost btn-sm', 'download', 'صدّر كملف نصي', 'Export as a text file', exportComms, 'exp', { id: 'cp-export' });
    ui.cp = fbtn('btn-ghost btn-sm', 'copy', 'انسخ', 'Copy', copyComms, 'cpy', { id: 'cp-copy' });
    root.appendChild(h('div', { class: 'cp-bar' }, chips));
    root.appendChild(h('div', { class: 'cp-bar cp-bar2' }, h('label', { class: 'cp-search' }, icon('zoomin'), ui.q), h('label', { class: 'switch' }, ui.selCb, ui.selLb), h('div', { class: 'cp-btnrow' }, ui.exp, ui.cp)));
    root.appendChild(ui.count);
    zone(t, 'list', function () { var l = filtered(); return [CR.lang(), M.cf.cat, M.cf.q, M.cf.sel ? S.sel : '', M.cf.limit, l.length, l.length ? l[l.length - 1].key : ''].join('|'); }, renderComms);
    buildCompose(root);
    root.appendChild(note('', 'كل ما في هذه الصفحة محاكاة (SIM). 999 تبقى هي المُرسِل، والأدوار محاكاة (لا تسجيل دخول حقيقي)، وكاشف الرؤية رؤية حاسوبية بقواعد معلنة (بلا نموذج مدرَّب).', 'Everything on this page is simulated (SIM). 999 stays the dispatcher, roles are simulated (no real login), and the detector is rule-based computer vision with stated rules (no trained model).', 'info'));
  }
  function renderComms() {
    var list = filtered().slice().reverse(), shown = list.slice(0, M.cf.limit), lg = CR.lang();
    if (!list.length) return h('p', { class: 'cp-empty' }, bi('لا سجلات تطابق هذا المرشّح بعد.', 'No entries match this filter yet.'));
    var ul = h('ol', { class: 'cp-log', 'aria-label': B('سجل الاتصالات، الأحدث أولًا', 'Comms log, newest first') }, shown.map(function (e) {
      var c = CAT[e.cat] || ['', e.cat, ''], tx = e.text ? (lg === 'en' ? e.text.en || e.text.ar : e.text.ar || e.text.en) : '', ft = e.from || e.to ? who(e.from) + (e.to ? ' → ' + who(e.to) : '') : '';
      return h('li', { class: 'cp-ev cat-' + e.cat + (e.rej ? ' rej' : '') + (e.inbound ? ' inb' : ''), 'data-cat': e.cat, 'data-key': e.key }, h('time', { class: 'mono cp-ev-t' }, (e.clock || '').slice(0, 8)),
        h('span', { class: 'tag ' + (e.rej ? 'danger' : c[2]) }, B(c[0], c[1]) + (e.rej ? ' ✕' : '')), h('div', { class: 'cp-ev-x' }, h('p', null, bx(tx)),
          h('div', { class: 'cp-ev-m' }, e.alert ? h('button', { type: 'button', class: 'cp-chip', 'data-fk': 'ea:' + fkey(e.key), onclick: function () { if (CR.alertOf(e.alert)) CR.selectAlert(e.alert); } }, e.alert) : null, e.msgType ? h('code', null, e.msgType + (e.n2 ? ' ×' + e.n2 : '')) : null, ft ? h('small', { class: 'muted' }, ft) : null)));
    }));
    return [ul, list.length > shown.length ? h('div', { class: 'cp-btnrow' }, fbtn('btn-ghost btn-sm', 'list', 'أظهر المزيد (' + N(list.length - shown.length) + ')', 'Show more (' + N(list.length - shown.length) + ')', function () { M.cf.limit += 120; M.T.comms.force = true; upd('comms'); }, 'more')) : null];
  }
  function commsPre(t) {
    var all = entries(), ui = t.ui;
    ['all'].concat(CAT_ORDER).forEach(function (c) { var n = c === 'all' ? all.length : all.filter(function (e) { return e.cat === c; }).length, b = ui.chips[c]; setT(b.firstChild, c === 'all' ? B('الكل', 'All') : B(CAT[c][0], CAT[c][1])); setT(b.lastChild, N(n)); setA(b, 'aria-pressed', M.cf.cat === c ? 'true' : 'false'); });
    setT(ui.selLb, B('الإنذار المحدد فقط', 'Selected alert only')); if (ui.selCb.checked !== M.cf.sel) ui.selCb.checked = M.cf.sel; CR.relabel(t.root);
    var f = filtered(); setT(ui.count, B('يُعرض ', 'Showing ') + N(Math.min(f.length, M.cf.limit)) + B(' من ', ' of ') + N(f.length) + B(' سجلًا (إجمالي ', ' entries (total ') + N(all.length) + ') · SIM');
  }

  /* ====================================================================================
   * 6. HANDOVER
   * ==================================================================================== */
  function stat(o, k) { return o && isNum(o[k]) ? o[k] : null; }
  function handoverModel() {
    var s = S.snap, k = s.kpis, dk = k.drones, nat = S.nat, model = { sim: true, when: { clock: s.clock, date: s.date, dowName: s.dowName, hour: s.hour }, seed: S.opts.seed, role: S.role, wall: new Date().toISOString(), notes: M.notes };
    var open = openAlerts(), i;
    model.open = open.map(function (a) {
      var inc = a.incident ? s.incidents.filter(function (x) { return x.id === a.incident; })[0] : null, p = inc && inc.plan ? inc.plan : null, dr = a.droneId ? droneRowOf(a.droneId) : null;
      return { id: a.id, hazard: a.hazard, place: CR.placeLine(a).line, state: a.state, stateName: a.stateName, source: a.sourceName, level: a.level, priority: a.priority, ageSec: a.ageSec, verdict: a.verdictText || null, held: !!M.held[a.id], drone: dr ? { callsign: dr.callsign, state: dr.stateText, etaSec: dr.etaSec } : null,
        plan: p ? { id: p.id, state: p.state, units: p.units.filter(function (u) { return u.unitId; }).map(function (u) { var wd = u.whyData || {}; return { kind: u.kind, name: u.name, state: u.state, etaSec: u.etaSec, ffb: !!wd.farButFaster, gainSec: wd.gainSec || 0 }; }), hospital: p.hospital && p.hospital.name ? { name: p.hospital.name, etaSec: p.hospital.etaSec } : null } : null };
    });
    model.decisions = S.decisions.map(function (d) {
      var a = d.alert ? CR.alertOf(d.alert) : null, why = null;
      if (d.type === 'approve') why = d.unverified ? { ar: 'اعتُمد بمفتاح واحد: الإنذار لم يُؤكَّد بعد بدليل ثانٍ', en: 'Approved on one key: the alert was not yet confirmed by a second piece of evidence' } : { ar: 'الإنذار مؤكَّد' + (a && a.verdictText ? ' — ' + a.verdictText.ar : '') + (isNum(d.afterSec) ? ' (بعد ' + mmss(d.afterSec) + ' من وصول الإنذار)' : ''), en: 'The alert was confirmed' + (a && a.verdictText ? ' — ' + a.verdictText.en : '') + (isNum(d.afterSec) ? ' (' + mmss(d.afterSec) + ' after the alert arrived)' : '') };
      else if (d.type === 'dismiss') why = { ar: 'رُفض بعد مراجعة الدليل' + (a && a.verdictText ? ' — ' + a.verdictText.ar : ''), en: 'Dismissed after reviewing the evidence' + (a && a.verdictText ? ' — ' + a.verdictText.en : '') };
      else if (d.type === 'escalate') why = { ar: 'رُفعت الأولوية بقرار بشري', en: 'Priority raised by a human decision' };
      else if (d.type === 'launch' || d.type === 'reassign') why = { ar: 'التحقق قبل الذعر: عيون على الموقع قبل إلزام الوحدات', en: 'Proof before panic: eyes on the scene before units are committed' };
      else if (d.type === 'rejected') why = { ar: 'الدور المحاكى لا يملك هذه الصلاحية', en: 'The simulated role lacks this right' };
      else if (d.type === 'jam' || d.type === 'unjam') why = { ar: 'تجربة مرور (محاكاة) لرؤية تغيّر الإرسال', en: 'A traffic test (SIM) to see how the dispatch changes' };
      else if (d.type === 'hold') why = { ar: 'لا يُرسل شيء قبل المفتاح البشري', en: 'Nothing is sent before the human key' };
      return { clock: d.clock, t: d.t, role: d.role, type: d.type, text: d.text, alert: d.alert || null, why: why, simTruth: d.truth || null };
    });
    model.committed = s.units.filter(function (u) { return u.assigned || u.state !== 'idle'; }).map(function (u) {
      var inc = u.assigned ? s.incidents.filter(function (x) { return x.id === u.assigned; })[0] : null, pu = inc && inc.plan ? inc.plan.units.filter(function (x) { return x.unitId === u.id; })[0] : null;
      return { id: u.id, kind: u.kind, name: u.name, state: u.state, incident: u.assigned || null, etaSec: pu && isNum(pu.etaSec) ? pu.etaSec : null };
    });
    var rows = s.drones, air = rows.filter(function (d) { return AIRBORNE[d.state] || d.state === 'patrol'; });
    model.drones = { total: dk.total, available: dk.available, byState: dk.byState, batteryMeanPct: dk.batteryMeanPct, airborne: air.map(function (d) { return { callsign: d.callsign, state: d.stateText, alert: d.alert, batteryPct: d.batteryPct }; }), faults: rows.filter(function (d) { return d.state === 'fault'; }).map(function (d) { return { callsign: d.callsign, text: d.fault ? d.fault.text : null }; }),
      low: rows.filter(function (d) { return d.batteryPct < 55 && d.state !== 'charging' && d.state !== 'fault'; }).map(function (d) { return { callsign: d.callsign, batteryPct: d.batteryPct }; }), charging: rows.filter(function (d) { return d.state === 'charging'; }).length };
    var al = dk.alerts || {}, fe = dk.firstEyes || {};
    model.numbers = [
      ['alerts', 'إنذارات (الكل / المفتوحة)', 'Alerts (all / open)', N(S.alerts.length) + ' / ' + N(open.length)],
      ['approved', 'معتمدة', 'Approved', N(S.decisions.filter(function (d) { return d.type === 'approve'; }).length)], ['dismissed', 'مرفوضة', 'Dismissed', N(S.decisions.filter(function (d) { return d.type === 'dismiss'; }).length)],
      ['tta', 'الوسيط لاعتماد الإنذار', 'Median time to approve', stat(al.timeToApproveSec, 'p50') != null ? mmss(al.timeToApproveSec.p50) : '–'],
      ['eyes', 'الوسيط لوصول المسيّرة (عيون أولًا)', 'Median first-eyes time', fe.firstEyesMin && fe.firstEyesMin.p50 != null ? N(fe.firstEyesMin.p50, 1) + ' ' + B('د', 'min') : '–'], ['first', 'المسيّرة أولًا', 'Drone first', fe.droneFirstPct != null ? pc(fe.droneFirstPct) + ' (n=' + N(fe.n) + ')' : '–'],
      ['inc', 'حوادث (الكل / النشطة)', 'Incidents (all / active)', N(k.incidents.total) + ' / ' + N(k.incidents.active)], ['units', 'وحدات متاحة / مشغولة', 'Units available / busy', N(k.units.available) + ' / ' + N(k.units.busy)],
      ['redis', 'إعادة إرسال / تغيير مسار', 'Re-dispatches / re-routes', N(k.traffic.redispatches) + ' / ' + N(k.traffic.reroutes)], ['speed', 'متوسط السرعة', 'Mean speed', pc(Math.round(k.traffic.meanSpeedRatio * 100)) + B(' من الحرة', ' of free flow')],
      ['drones', 'مسيّرات (متاحة / في الجو / تُشحن / معطّلة)', 'Drones (ready / airborne / charging / fault)', N(dk.available) + ' / ' + N(dk.enRoute + dk.onStation) + ' / ' + N(dk.charging) + ' / ' + N(dk.fault)],
      ['fa', 'إنذارات كاذبة من المسيّرات (رُفضت / أُرسلت)', 'Drone false alarms (dismissed / dispatched)', N(al.falseAlarmsDismissed || 0) + ' / ' + N(al.falseAlarmsDispatched || 0)],
      ['bus', 'رسائل إلى الشبكة (إنذار / إرسال / مسيّرات)', 'Bus messages sent (alert / dispatch / drones)', N(S.bus.alert) + ' / ' + N(S.bus.dispatch) + ' / ' + N(S.bus.droneAlert + S.bus.droneStatus)],
      ['ph', 'ردود الهواتف (بأمان / مساعدة / مستيقظ)', 'Phone replies (safe / help / awake)', N(S.phone.safe) + ' / ' + N(S.phone.help) + ' / ' + N(S.phone.ack)], ['rej', 'محاولات رُفضت للدور', 'Attempts refused by role', N(S.rejects)]
    ].map(function (r) { return { key: r[0], ar: r[1], en: r[2], value: r[3] }; });
    model.risks = risksOf(model, open, k, s);
    return model;
  }
  function risksOf(model, open, k, s) {
    var R = [], add = function (level, ar, en, ref) { R.push({ level: level, text: { ar: ar, en: en }, ref: ref || null }); };
    var susp = open.filter(function (a) { return a.state === 'SUSPECT'; }), conf = open.filter(function (a) { return a.state === 'CONFIRMED'; });
    if (susp.length) add(susp.some(function (a) { return a.priority >= 80; }) ? 'danger' : 'warn', N(susp.length) + ' إنذار لم يُؤكَّد بعد بدليل ثانٍ: المفتاح البشري ينتظر الدليل (' + susp.map(function (a) { return a.id; }).join('، ') + ')', N(susp.length) + ' alert(s) not yet confirmed by a second piece of evidence: the human key waits for evidence (' + susp.map(function (a) { return a.id; }).join(', ') + ')', susp[0].id);
    if (conf.length) add('warn', N(conf.length) + ' إنذار مؤكَّد بانتظار المفتاح البشري (الأقدم: ' + mmss(Math.max.apply(null, conf.map(function (a) { return a.ageSec; }))) + ')', N(conf.length) + ' confirmed alert(s) waiting for the human key (oldest: ' + mmss(Math.max.apply(null, conf.map(function (a) { return a.ageSec; }))) + ')', conf[0].id);
    open.forEach(function (a) {
      if (a.needDrone && !a.droneId) add('warn', 'لا مسيّرة للإنذار ' + a.id + ' (خارج المدى أو مشغولة) — الوحدات الأرضية أولًا', 'No drone for alert ' + a.id + ' (out of range or busy) — the ground units come first', a.id);
      var inc = a.incident ? s.incidents.filter(function (x) { return x.id === a.incident; })[0] : null, p = inc && inc.plan;
      if (p) {
        p.units.forEach(function (u) {
          if (!u.unitId && !u.optional && !u.standby) add('danger', 'لا وحدة متاحة من نوع «' + nm0(NN().KIND_NAME[u.kind], 'ar') + '» تصل إلى الحادث ' + inc.id, 'No available unit of type “' + nm0(NN().KIND_NAME[u.kind], 'en') + '” can reach incident ' + inc.id, a.id);
          else if (u.gap) add('warn', 'وقت وصول بعيد (' + mmss(u.etaSec) + ') للحادث ' + inc.id + ': قد لا تحوي خريطة OSM محطات أقرب', 'Far ETA (' + mmss(u.etaSec) + ') for incident ' + inc.id + ': the OSM map may lack closer stations', a.id);
        });
        if (p.state === 'recommended' && !M.held[a.id]) add('info', 'الإرسال للحادث ' + inc.id + ' ما زال توصية: لا وحدة أُرسلت قبل المفتاح البشري', 'The dispatch for incident ' + inc.id + ' is still only a recommendation: no unit is sent before the human key', a.id);
      }
      if (M.held[a.id]) add('warn', 'إرسال ' + a.id + ' معلّق بقرار المشغّل', 'The dispatch of ' + a.id + ' is on hold by the operator', a.id);
    });
    if (model.drones.faults.length) add('warn', N(model.drones.faults.length) + ' مسيّرة معطّلة (' + model.drones.faults.map(function (d) { return d.callsign; }).join('، ') + ')', N(model.drones.faults.length) + ' drone(s) with a fault (' + model.drones.faults.map(function (d) { return d.callsign; }).join(', ') + ')');
    if (model.drones.low.length) add('info', N(model.drones.low.length) + ' مسيّرة ببطارية أقل من 55٪ خارج الشحن (' + model.drones.low.map(function (d) { return d.callsign + ' ' + N(d.batteryPct) + '٪'; }).join('، ') + ')', N(model.drones.low.length) + ' drone(s) below 55 % battery and not charging (' + model.drones.low.map(function (d) { return d.callsign + ' ' + N(d.batteryPct) + '%'; }).join(', ') + ')');
    if (model.drones.available < Math.ceil(model.drones.total * 0.5)) add('warn', 'أقل من نصف المسيّرات جاهز للإقلاع (' + N(model.drones.available) + ' من ' + N(model.drones.total) + ')', 'Fewer than half of the drones are ready to launch (' + N(model.drones.available) + ' of ' + N(model.drones.total) + ')');
    if (S.phone.help > 0) add('danger', N(S.phone.help) + ' رد «أحتاج مساعدة» من هواتف المقيمين — حوّلها إلى 999', N(S.phone.help) + ' “I need help” reply(ies) from residents\' phones — hand them to 999');
    (k.advisories || []).filter(function (x) { return x.level === 'warning' || x.level === 'danger'; }).slice(0, 4).forEach(function (x) { add(x.level === 'danger' ? 'danger' : 'warn', 'تنبيه جوي/مروري: ' + nm0(x.text, 'ar'), 'Advisory: ' + nm0(x.text, 'en')); });
    if (k.hazards && k.hazards.flood && k.hazards.flood.tunnelsClosed) add('warn', N(k.hazards.flood.tunnelsClosed) + ' نفق/معبر مغلق بالمطر (محاكاة)', N(k.hazards.flood.tunnelsClosed) + ' tunnel(s) / underpass(es) closed by rain (SIM)');
    if (jamCount()) add('info', N(jamCount()) + ' طريق ما زال مزدحمًا بقرار المشغّل — أزله قبل التسليم إن كان تجربة', N(jamCount()) + ' road(s) still jammed by the operator — clear before handover if it was a test');
    if (S.autopilot) add('warn', 'الطيار الآلي (مشغّل محاكى) يعمل: يوافق على الإنذارات بنفسه', 'The autopilot (a simulated operator) is on: it approves alerts by itself');
    if (!R.length) add('info', 'لم تجد هذه القواعد خطرًا معلّقًا (محاكاة) — هذا ليس ضمانًا', 'These rules found no outstanding risk (SIM) — this is not a guarantee');
    return R;
  }
  var RISK_TAG = { danger: ['عالٍ', 'High', 'danger'], warn: ['متوسط', 'Medium', 'warn'], info: ['للعلم', 'Note', 'info'] };
  function handoverNodes(m) {
    var kids = [], lg = CR.lang();
    kids.push(h('header', { class: 'cp-rep-h' }, h('h4', null, B('تقرير تسليم المناوبة — غرفة التحكم (منارة)', 'Shift handover report — MANARA Control Room')), simTag(),
      h('p', { class: 'cp-fine' }, B('ساعة المحاكاة: ', 'Simulated clock: ') + nm(m.when.dowName) + ' ' + m.when.date + ' ' + m.when.clock.slice(0, 8) + ' · ' + B('البذرة ', 'seed ') + N(m.seed) + ' · ' + B('الدور المحاكى: ', 'Simulated role: ') + nm(CR.roleOf(m.role)) + ' · ' + B('أُنشئ ', 'generated ') + m.wall.slice(11, 19) + ' UTC')));
    kids.push(h('p', { class: 'cp-fine cp-rep-disc' }, bi('محاكاة (SIM): لا حادث حقيقي ولا وحدة حقيقية ولا مقيم حقيقي. المسيّرات والروبوت مفهوم بنموذج أولي محاكى. 999 تبقى هي المُرسِل. الأدوار محاكاة (لا تسجيل دخول حقيقي).', 'Simulation (SIM): no real incident, no real unit, no real resident. Drones and the robot are a concept with a simulated prototype. 999 stays the dispatcher. Roles are simulated (no real login).')));
    var sec = function (ar, en, body, n) { return h('section', { class: 'cp-rep-s' }, h('h5', null, bi(ar, en), n != null ? h('span', { class: 'tag mono' }, N(n)) : null), body); };
    kids.push(sec('أرقام الوردية (كلها محاكاة، SIM)', 'The numbers of the shift (all SIM)', h('div', { class: 'cp-rep-nums' }, m.numbers.map(function (n) { return h('div', { class: 'cp-rep-n', 'data-n': n.key }, h('span', null, B(n.ar, n.en)), h('b', { class: 'mono' }, n.value)); }))));
    kids.push(sec('حوادث مفتوحة', 'Open incidents', m.open.length ? h('ul', { class: 'cp-rep-l' }, m.open.map(function (o) {
      return h('li', { class: 'cp-rep-i', 'data-alert': o.id }, h('div', { class: 'cp-rep-t' }, h('b', { class: 'mono' }, o.id), h('span', null, CR.hzName(o.hazard)), h('span', { class: 'tag ' + (o.level === 'critical' || o.level === 'high' ? 'danger' : 'warn') }, nm(o.stateName)), o.held ? h('span', { class: 'tag warn' }, B('معلّق', 'on hold')) : null),
        h('p', { class: 'cp-fine' }, o.place + ' · ' + B('المصدر: ', 'source: ') + nm(o.source) + ' · ' + B('العمر ', 'age ') + mmss(o.ageSec) + (o.verdict ? ' · ' + nm(o.verdict) : '') + (o.drone ? ' · ' + o.drone.callsign + ' ' + nm(o.drone.state) + (isNum(o.drone.etaSec) ? ' ' + mmss(o.drone.etaSec) : '') : '')),
        o.plan ? h('p', { class: 'cp-fine' }, h('b', null, B('الخطة ', 'Plan ') + o.plan.id + ' (' + B(PLAN_LABEL[o.plan.state] ? PLAN_LABEL[o.plan.state][0] : o.plan.state, PLAN_LABEL[o.plan.state] ? PLAN_LABEL[o.plan.state][1] : o.plan.state) + '): '), o.plan.units.map(function (u) { return CR.kindName(u.kind) + ' ← ' + nm(u.name) + ' ' + (u.state === 'on-scene' ? B('في الموقع', 'on scene') : mmss(u.etaSec)) + (u.ffb ? ' (' + B('أبعد لكن أسرع بـ ', 'farther but faster by ') + mmss(u.gainSec) + ')' : ''); }).join(' · ') + (o.plan.hospital ? ' · ' + B('مستشفى ', 'hospital ') + nm(o.plan.hospital.name) + ' ' + mmss(o.plan.hospital.etaSec) : '')) : null);
    })) : h('p', { class: 'cp-empty' }, bi('لا حوادث مفتوحة.', 'No open incidents.')), m.open.length));
    kids.push(sec('القرارات (من / متى / لماذا)', 'Decisions (who / when / why)', m.decisions.length ? h('ol', { class: 'cp-rep-l dec' }, m.decisions.map(function (d) {
      return h('li', { class: 'cp-rep-i', 'data-type': d.type }, h('div', { class: 'cp-rep-t' }, h('time', { class: 'mono' }, (d.clock || '').slice(0, 8)), h('span', { class: 'tag' + (d.type === 'rejected' ? ' danger' : '') }, nm(CR.roleOf(d.role))), h('span', { class: 'tag cool' }, d.type), d.alert ? h('code', null, d.alert) : null),
        h('p', null, bx(nm(d.text))), d.why ? h('p', { class: 'cp-fine' }, h('b', null, B('لماذا: ', 'Why: ')), bx(nm(d.why))) : null, d.simTruth ? h('p', { class: 'cp-fine muted' }, B('بعد الحدث (حقيقة المحاكاة المخفية عن المشغّل): ', 'After the event (the simulation truth hidden from the operator): ') + (d.simTruth === 'false' ? B('كان إنذارًا كاذبًا', 'it was a false alarm') : B('كان حدثًا حقيقيًا', 'it was a real event'))) : null);
    })) : h('p', { class: 'cp-empty' }, bi('لم تُسجَّل قرارات بعد.', 'No decisions recorded yet.')), m.decisions.length));
    kids.push(sec('وحدات ما زالت ملتزمة', 'Units still committed', m.committed.length ? h('ul', { class: 'cp-rep-l' }, m.committed.map(function (u) { return h('li', { class: 'cp-rep-i' }, h('div', { class: 'cp-rep-t' }, kindBadge(u.kind), h('span', null, nm(u.name)), h('span', { class: 'tag cool' }, nm(UNIT_LABEL(u.state))), u.incident ? h('code', null, u.incident) : null, isNum(u.etaSec) && u.state !== 'on-scene' ? h('span', { class: 'mono' }, mmss(u.etaSec)) : null)); })) : h('p', { class: 'cp-empty' }, bi('لا وحدة ملتزمة الآن.', 'No unit is committed right now.')), m.committed.length));
    var dr = m.drones;
    kids.push(sec('المسيّرات', 'Drones', h('div', null, h('p', { class: 'cp-fine' }, B('الإجمالي ', 'Total ') + N(dr.total) + ' · ' + B('جاهزة ', 'ready ') + N(dr.available) + ' · ' + B('تُشحن ', 'charging ') + N(dr.charging) + ' · ' + B('متوسط البطارية ', 'mean battery ') + pc(dr.batteryMeanPct)),
      dr.airborne.length ? h('ul', { class: 'cp-rep-l' }, dr.airborne.map(function (d) { return h('li', { class: 'cp-rep-i' }, h('b', { class: 'mono' }, d.callsign), ' ', nm(d.state), d.alert ? ' · ' + d.alert : '', ' · ' + pc(d.batteryPct)); })) : h('p', { class: 'cp-empty' }, bi('لا مسيّرة في الجو.', 'No drone airborne.')),
      dr.faults.length ? h('p', { class: 'cp-fine' }, h('b', null, B('أعطال: ', 'Faults: ')), dr.faults.map(function (d) { return d.callsign + (d.text ? ' (' + nm(d.text) + ')' : ''); }).join('، ')) : null)));
    kids.push(sec('مخاطر معلّقة', 'Outstanding risks', h('ul', { class: 'cp-rep-l risks' }, m.risks.map(function (r) { var tg = RISK_TAG[r.level]; return h('li', { class: 'cp-rep-i risk ' + r.level }, h('span', { class: 'tag ' + tg[2] }, B(tg[0], tg[1])), h('span', null, bx(nm(r.text)))); })), m.risks.length));
    if (m.notes) kids.push(sec('ملاحظات المشغّل المغادر', 'Notes from the outgoing operator', h('p', { class: 'cp-rep-notes' }, m.notes)));
    kids.push(h('footer', { class: 'cp-fine muted cp-rep-f' }, bi('أُنشئ تلقائيًا من سجل المشغّل والقرارات؛ كل الأرقام محاكاة. الخريطة لقطة من OpenStreetMap (© مساهمو OpenStreetMap، ODbL). 999 تبقى هي المُرسِل.', 'Built automatically from the operator log and the decisions; every number is simulated. The map is a snapshot of OpenStreetMap (© OpenStreetMap contributors, ODbL). 999 stays the dispatcher.')));
    return kids;
  }
  function UNIT_LABEL(st) { var u = UNIT_STATE[st] || ['', st]; return { ar: { idle: 'متاحة', turnout: 'تستعد', 'en-route': 'في الطريق', 'on-scene': 'في الموقع', returning: 'عائدة' }[st] || u[0], en: { idle: 'available', turnout: 'turning out', 'en-route': 'en route', 'on-scene': 'on scene', returning: 'returning' }[st] || u[1] }; }
  function handoverText(m) {
    m = m || handoverModel();
    var lg = CR.lang(), t = function (o) { return o ? (lg === 'en' ? o.en || o.ar : o.ar || o.en) : ''; }, L = [], d = function (x) { return x == null ? '' : x; };
    L.push(B('تقرير تسليم المناوبة — غرفة التحكم (منارة) — محاكاة (SIM)', 'SHIFT HANDOVER — MANARA Control Room — SIMULATION (SIM)'));
    L.push(B('ساعة المحاكاة: ', 'Simulated clock: ') + t(m.when.dowName) + ' ' + m.when.date + ' ' + m.when.clock + ' · ' + B('البذرة ', 'seed ') + m.seed + ' · ' + B('الدور المحاكى: ', 'simulated role: ') + t(CR.roleOf(m.role)) + ' · ' + m.wall);
    L.push(B('لا حادث حقيقي ولا وحدة حقيقية. المسيّرات والروبوت مفهوم بنموذج أولي محاكى. 999 تبقى هي المُرسِل.', 'No real incident, no real unit. Drones and the robot are a concept with a simulated prototype. 999 stays the dispatcher.'));
    L.push('', '== ' + B('الأرقام (كلها SIM)', 'NUMBERS (all SIM)') + ' ==');
    m.numbers.forEach(function (n) { L.push('- ' + (lg === 'en' ? n.en : n.ar) + ': ' + n.value); });
    L.push('', '== ' + B('حوادث مفتوحة', 'OPEN INCIDENTS') + ' (' + m.open.length + ') ==');
    if (!m.open.length) L.push('- ' + B('لا شيء', 'none'));
    m.open.forEach(function (o) {
      L.push('- ' + o.id + ' · ' + CR.hzName(o.hazard) + ' · ' + t(o.stateName) + ' · ' + o.place + ' · ' + B('العمر ', 'age ') + mmss(o.ageSec) + (o.held ? ' · ' + B('معلّق', 'ON HOLD') : '') + (o.drone ? ' · ' + o.drone.callsign + ' ' + t(o.drone.state) : ''));
      if (o.plan) L.push('    ' + B('الخطة ', 'plan ') + o.plan.id + ' (' + o.plan.state + '): ' + o.plan.units.map(function (u) { return CR.kindName(u.kind) + ' <- ' + t(u.name) + ' ' + (u.state === 'on-scene' ? B('في الموقع', 'on scene') : mmss(u.etaSec)) + (u.ffb ? ' [' + B('أبعد لكن أسرع بـ ', 'farther but faster by ') + mmss(u.gainSec) + ']' : ''); }).join('; ') + (o.plan.hospital ? '; ' + B('مستشفى ', 'hospital ') + t(o.plan.hospital.name) + ' ' + mmss(o.plan.hospital.etaSec) : ''));
    });
    L.push('', '== ' + B('القرارات (من / متى / لماذا)', 'DECISIONS (who / when / why)') + ' (' + m.decisions.length + ') ==');
    if (!m.decisions.length) L.push('- ' + B('لا شيء', 'none'));
    m.decisions.forEach(function (x) { L.push('- [' + d(x.clock).slice(0, 8) + '] ' + t(CR.roleOf(x.role)) + ' · ' + x.type + (x.alert ? ' · ' + x.alert : '') + ': ' + t(x.text) + (x.why ? ' — ' + B('لماذا: ', 'why: ') + t(x.why) : '') + (x.simTruth ? ' [' + B('حقيقة المحاكاة: ', 'SIM truth: ') + x.simTruth + ']' : '')); });
    L.push('', '== ' + B('وحدات ما زالت ملتزمة', 'UNITS STILL COMMITTED') + ' (' + m.committed.length + ') ==');
    if (!m.committed.length) L.push('- ' + B('لا شيء', 'none'));
    m.committed.forEach(function (u) { L.push('- ' + t(u.name) + ' · ' + t(UNIT_LABEL(u.state)) + (u.incident ? ' · ' + u.incident : '') + (isNum(u.etaSec) && u.state !== 'on-scene' ? ' · ' + mmss(u.etaSec) : '')); });
    L.push('', '== ' + B('المسيّرات', 'DRONES') + ' ==');
    L.push('- ' + B('الإجمالي ', 'total ') + m.drones.total + ' · ' + B('جاهزة ', 'ready ') + m.drones.available + ' · ' + B('تُشحن ', 'charging ') + m.drones.charging + ' · ' + B('متوسط البطارية ', 'mean battery ') + m.drones.batteryMeanPct + '%');
    m.drones.airborne.forEach(function (x) { L.push('- ' + x.callsign + ' · ' + t(x.state) + (x.alert ? ' · ' + x.alert : '') + ' · ' + x.batteryPct + '%'); });
    m.drones.faults.forEach(function (x) { L.push('- ' + B('عطل: ', 'FAULT: ') + x.callsign + (x.text ? ' (' + t(x.text) + ')' : '')); });
    L.push('', '== ' + B('مخاطر معلّقة', 'OUTSTANDING RISKS') + ' ==');
    m.risks.forEach(function (r) { L.push('- [' + (lg === 'en' ? RISK_TAG[r.level][1] : RISK_TAG[r.level][0]) + '] ' + t(r.text)); });
    if (m.notes) L.push('', '== ' + B('ملاحظات المشغّل المغادر', 'NOTES FROM THE OUTGOING OPERATOR') + ' ==', m.notes);
    L.push('', B('أُنشئ تلقائيًا من سجل المشغّل والقرارات. كل الأرقام محاكاة (SIM). © مساهمو OpenStreetMap (ODbL). 999 تبقى هي المُرسِل.', 'Built automatically from the operator log and the decisions. Every number is simulated (SIM). © OpenStreetMap contributors (ODbL). 999 stays the dispatcher.'));
    return L.join('\n') + '\n';
  }
  function preparePrint() {                                                              // a clone of the report outside the layout: the @media print block of css/control-panels.css shows only this
    var rep = M.T.handover && M.T.handover.root && M.T.handover.root.querySelector('.cp-report'); removePrint();
    if (!rep) return null;
    var wrap = h('div', { id: 'cp-print', class: 'cp-print-only', 'aria-hidden': 'true' }); wrap.appendChild(rep.cloneNode(true));
    doc.body.appendChild(wrap); doc.body.classList.add('cp-printing'); return wrap;
  }
  function removePrint() { var w = doc.getElementById('cp-print'); if (w) w.remove(); doc.body.classList.remove('cp-printing'); }
  function printReport() {
    M.T.handover.force = true; runZones(M.T.handover, true);
    if (!preparePrint()) return false;
    CR.logOp('operator', 'طبع المشغّل تقرير التسليم', 'The operator printed the handover report');
    try { win.print(); } catch (e) { logErr(e); }
    return true;
  }
  win.addEventListener('beforeprint', function () { var t = M.T.handover; if (t && t.el && visible(t) && !doc.getElementById('cp-print')) preparePrint(); });
  win.addEventListener('afterprint', removePrint);
  function copyHandover() { var txt = handoverText(); CR.copyText(txt).then(function (ok) { CR.toast({ ar: ok ? 'نُسخ تقرير التسليم كنص' : 'تعذّر النسخ', en: ok ? 'Handover report copied as text' : 'Copy failed' }, ok ? 'safe' : 'warn', 2400); }); return txt; }
  function downloadHandover() { var s = S.snap; CR.dl('manara-handover-' + (s ? s.date + '-' + s.clock.replace(/:/g, '').slice(0, 4) : 'sim') + '.txt', 'text/plain', handoverText()); CR.logOp('operator', 'نزّل المشغّل تقرير التسليم كملف نصي', 'The operator downloaded the handover report as a text file'); }
  function handoverBuild(t, root) {
    root.appendChild(panelHead('تسليم المناوبة', 'Shift handover', bi('تقرير يُبنى تلقائيًا من سجل المشغّل والقرارات: ماذا حدث، من قرّر ولماذا، ما الذي ما زال مفتوحًا، وما المخاطر.', 'A report built automatically from the operator log and the decisions: what happened, who decided and why, what is still open, and the risks.')));
    var ui = t.ui = {};
    ui.print = fbtn('btn-primary btn-sm', 'print', 'اطبع', 'Print', printReport, 'print', { id: 'cp-print-btn' });
    ui.copy = fbtn('btn-ghost btn-sm', 'copy', 'انسخ كنص', 'Copy as text', copyHandover, 'copy', { id: 'cp-copy-ho' });
    ui.dl = fbtn('btn-ghost btn-sm', 'download', 'نزّل (.txt)', 'Download (.txt)', downloadHandover, 'dl', { id: 'cp-dl-ho' });
    root.appendChild(h('div', { class: 'cp-btnrow cp-ho-bar' }, ui.print, ui.copy, ui.dl));
    ui.notes = h('textarea', { class: 'input cp-ta', id: 'cp-ho-notes', rows: '3', 'data-fk': 'notes', oninput: function () { M.notes = ui.notes.value.slice(0, 2000); CR.storeSet(KEY_NOTES, M.notes); S.dirtyUI = true; } });
    lab(ui.notes, 'placeholder', 'ملاحظات للمشغّل القادم (تدخل في التقرير)', 'Notes for the incoming operator (they go into the report)'); lab(ui.notes, 'aria-label', 'ملاحظات للمشغّل القادم', 'Notes for the incoming operator');
    ui.notes.value = M.notes;
    root.appendChild(h('label', { class: 'field cp-ho-notes' }, h('span', null, bi('ملاحظات المشغّل المغادر', 'Notes from the outgoing operator')), ui.notes));
    zone(t, 'report', function () {
      var s = S.snap, k = s.kpis.drones;
      return [CR.lang(), S.role, S.opSeq, S.decisions.length, S.alerts.map(function (a) { return a.id + a.state + (a.droneId || '') + (M.held[a.id] ? 'h' : ''); }).join(','), s.units.filter(function (u) { return u.assigned || u.state !== 'idle'; }).map(function (u) { return u.id + u.state; }).join(','), k.byState && JSON.stringify(k.byState), k.available, jamCount(), S.phone.help, S.phone.safe, S.rejects, M.notes.length, Math.floor(s.t / 300)].join('|');
    }, function () { return h('article', { class: 'cp-report', 'data-sim': '1' }, handoverNodes(M.hm = handoverModel())); });
  }

  /* ====================================================================================
   * 7. REGISTRATION, EVENTS, TEST API
   * ==================================================================================== */
  mkTab('fleet', 'الأسطول', 'Fleet', 'drone', { build: fleetBuild, pre: fleetPre, badge: function () { return S.snap && S.snap.kpis ? S.snap.kpis.drones.fault || 0 : 0; } });
  mkTab('dispatch', 'الإرسال', 'Dispatch', 'route', { build: dispatchBuild, pre: dispatchPre, badge: function () { return openAlerts().filter(function (a) { return CR.STATE_RANK[a.state] < 2; }).length; } });         // alerts still waiting for the human key
  mkTab('comms', 'الاتصالات', 'Comms', 'list', { build: commsBuild, pre: commsPre, post: function () { updCompose(); } });
  mkTab('handover', 'التسليم', 'Handover', 'users', { build: handoverBuild });
  ['select', 'role', 'lang', 'select-drone', 'reset', 'autopilot'].forEach(function (ev) { CR.on(ev, function () { Object.keys(M.T).forEach(function (k) { M.T[k].force = true; }); M.rankKey = ''; M.prevKey = ''; }); });
  CR.on('reset', function () { M.fx = null; M.jamBy = {}; M.held = {}; M.cov = null; M.live = null; M.samp = null; M.ent = null; M.entKey = ''; M.inb = []; M.lastBroadcast = null; });
  CR.on('oplog', function () { M.ent = null; });
  if (win.Manara && win.Manara.link && win.Manara.link.on) win.Manara.link.on(function (m) { try { onInbound(m); } catch (e) { logErr(e); } });

  CR.mods.panels = {
    version: 1, state: M, tabs: M.T,
    entries: function () { return entries().slice(); }, filtered: filtered, commsText: function () { return commsText(filtered()); }, exportComms: exportComms, setFilter: function (o) { Object.assign(M.cf, o || {}); M.T.comms.force = true; S.dirtyUI = true; return Object.assign({}, M.cf); },
    handoverModel: handoverModel, handoverText: handoverText, preparePrint: preparePrint, removePrint: removePrint, print: printReport,
    plan: function () { M.dc = dctx(); return M.dc; }, jamRoute: jamRoute, clearAllJams: clearAllJams, cap: doCap, approve: doApprove, hold: doHold, cancel: doCancel,
    coverageLive: coverageLive, coverageRun: coverageRun, rankMap: rankMap, launchState: launchState, doLaunch: doLaunch, doRecall: doRecall,
    broadcast: function (o) { Object.assign(M.bc, o || {}); return sendBroadcast(); }, announce: function (o) { Object.assign(M.dv, o || {}); return sendDroneVoice(); }, zones: zonesList,
    refresh: function () { Object.keys(M.T).forEach(function (k) { M.T[k].force = true; M.T[k].update(); }); }
  };
})();
