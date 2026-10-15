/* MANARA («منارة») — the CONTROL ROOM, SHELL  →  ControlRoom.ui                                                   (js/control-ui.js)
 * =====================================================================================================================
 * User requirement (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot".
 * This file is the console's shell. js/control.js (CORE) owns the engine, the map and the actions; this file draws everything a human works with around them:
 *   TOP BAR      title, simulated Qatar time (Asia/Qatar, UTC+3, no daylight saving), play / pause, speed, fast-forward, simulated role, autopilot, scenarios, sound, wall mode, help, language, theme
 *   KPI STRIP    open alerts · drones airborne / available · units en route · median first-response ETA · people accounted · robots active  (every figure carries a SIM badge)
 *   ALERT QUEUE  priority-sorted cards (drone / sentinel / citizen / operator, hazard, place, "two keys" or "one key – needs proof", age, ETA of the first responder, Approve / Dismiss / Escalate gated by role),
 *                filters by source and hazard, the order is frozen while the pointer is on the list (no card jumps under your finger)
 *   MAP HUD      tools (select / raise a SIMULATED alarm / jam a road), zoom, layers, legend, attribution, the banner of automatic re-dispatch, and on phones a one-line peek of the top alert
 *   TABS         CR.registerTab() tabs (feed · fleet · dispatch · robot · comms · handover) as a segmented bar on wide screens; on narrow screens a bottom tab bar + a bottom sheet (tablet: a side drawer)
 *   TIMELINE     the simulated day with alert / approval / dispatch / on-scene / resolved markers; click the future to fast-forward (the clock cannot run backwards)
 *   DIALOGS      approve confirmation ("proof before panic": two keys + the human key), dismiss confirmation, help + legend, keyboard shortcuts   (native <dialog>, focus is trapped and restored)
 *   SOUND        a calm WebAudio chime (CR.soundSet), OFF by default and switched on only by a click (browsers require the gesture)
 *   KEYBOARD     j / k queue · a approve · d dismiss · e escalate · 1–6 tabs · w wall · space play / pause · ? shortcuts · Esc closes.  Keys are read from event.code, so they work on an Arabic keyboard layout too
 *   A11Y         roles and names everywhere, aria-live announcements through #cr-live (CR.live), roving tab focus, 44 px touch targets on phones, colour is never the only signal (icon + text + shape)
 * Honest labels: every simulated figure says SIM; roles are SIMULATED labels (no login); 999 stays the dispatcher; the footer states the OpenStreetMap ODbL attribution and "concept + simulated prototype".
 * No innerHTML anywhere: all text goes through CR.h text nodes.
 * LOAD ORDER: control.js boots on 'interactive' (before the modules after it have run), so this file builds the shell itself when the page has already booted, and adds tabs that register later (CR.registerTab is wrapped).
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, html = doc.documentElement, CR = win.ControlRoom;
  if (!CR || !CR.S || !CR.h) return;                                                  // control.js did not load: nothing to attach to
  var S = CR.S, h = CR.h, bi = CR.bi, lab = CR.lab, B = CR.B, N = CR.N, nm = CR.nm, icon = CR.icon, mmss = CR.mmss, pad2 = CR.pad2, setT = CR.setT, setA = CR.setA, $ = CR.$, $$ = CR.$$, isNum = CR.isNum, clamp = CR.clamp;
  var UI = CR.ui = { built: false, tabEls: {}, wall: false };

  var TAB_ORDER = ['feed', 'fleet', 'dispatch', 'robot', 'comms', 'handover'];
  var SPEEDS = [1, 10, 30, 60, 300];
  var SEV = { critical: { ar: 'حرج', en: 'Critical', n: 4 }, high: { ar: 'عالٍ', en: 'High', n: 3 }, medium: { ar: 'متوسط', en: 'Medium', n: 2 }, low: { ar: 'منخفض', en: 'Low', n: 1 } };
  var STATE_TAG = { SUSPECT: 'warn', CONFIRMED: 'danger', APPROVED: 'info', DISPATCHED: 'cool', 'ON-SCENE': 'safe', RESOLVED: 'safe', DISMISSED: '' };
  var SRC_ORDER = ['drone', 'sentinel', 'citizen', 'operator'];
  var KEY_NAME = { vision: ['كاشف الرؤية', 'Vision detector'], thermal: ['حراري', 'Thermal'], sensor: ['حسّاس', 'Sensor'], citizen: ['بلاغ مواطن', 'Citizen report'] };
  var KEY_SHORT = { vision: ['الكاشف', 'Detector'], thermal: ['حراري', 'Thermal'], sensor: ['حسّاس', 'Sensor'], citizen: ['مواطن', 'Citizen'] };
  var U = { filters: { src: 'all', hz: 'all', closed: false }, cards: {}, order: [], pointerAt: 0, lastQ: 0, lastTl: 0, tlSig: '', t0: null, hint: null, dlg: null, invoker: null, pop: null, visTab: null, layout: '', newIds: {} };

  /* ====================================================================================
   * 1. SMALL COMPONENTS
   * ==================================================================================== */
  function fmtAge(sec) { sec = Math.max(0, Math.round(sec || 0)); return sec >= 3600 ? Math.floor(sec / 3600) + ':' + pad2(Math.floor(sec / 60) % 60) + ':' + pad2(sec % 60) : mmss(sec); }
  function ltr(text, cls) { return h('bdi', { class: 'cr-ltr ' + (cls || ''), dir: 'ltr' }, text); }
  function kbd(t) { return h('kbd', null, t); }
  function sr(text) { return h('span', { class: 'sr-only', text: text }); }
  function syncKeyed(el, key, val) { if (el && el.getAttribute(key) !== String(val)) el.setAttribute(key, val); }
  // a radio-style segmented control: opts {items:[{id, ar, en, icon, text, tip:[ar,en]}], get, set, label:[ar,en], cls}; roving tabindex + arrow keys (mirrored in RTL)
  function seg(o) {
    var el = h('div', { class: 'cr-seg ' + (o.cls || ''), role: 'radiogroup' }), btns = {}, ids = o.items.map(function (i) { return String(i.id); });
    lab(el, 'aria-label', o.label[0], o.label[1]);
    o.items.forEach(function (it) {
      var b = h('button', { type: 'button', class: 'cr-seg-b', role: 'radio', 'aria-checked': 'false', tabindex: '-1', 'data-id': it.id, onclick: function () { o.set(it.id); el.sync(); } });
      if (it.icon) b.appendChild(icon(it.icon));
      if (it.text != null) b.appendChild(h('span', { class: 'cr-seg-t', text: it.text })); else if (it.ar) b.appendChild(h('span', { class: 'cr-seg-t' }, bi(it.ar, it.en)));
      if (it.tip) lab(b, 'title', it.tip[0], it.tip[1]); if (it.ar) lab(b, 'aria-label', it.ar, it.en); else if (it.tip) lab(b, 'aria-label', it.tip[0], it.tip[1]);
      btns[it.id] = b; el.appendChild(b);
    });
    el.addEventListener('keydown', function (e) {
      var k = e.key, rtl = html.dir === 'rtl', cur = ids.indexOf(String(o.get())), nx = null;
      if (k === 'ArrowDown' || k === (rtl ? 'ArrowLeft' : 'ArrowRight')) nx = (cur + 1) % ids.length; else if (k === 'ArrowUp' || k === (rtl ? 'ArrowRight' : 'ArrowLeft')) nx = (cur - 1 + ids.length) % ids.length; else return;
      e.preventDefault(); o.set(o.items[nx].id); el.sync(); btns[o.items[nx].id].focus();
    });
    el.sync = function () { var v = String(o.get()); ids.forEach(function (id) { var on = id === v; setA(btns[id], 'aria-checked', String(on)); setA(btns[id], 'tabindex', on ? '0' : '-1'); }); };
    el.sync(); return el;
  }
  function chip(ar, en, iconName, onclick, extra) {
    var b = h('button', { type: 'button', class: 'cr-chip', 'aria-pressed': 'false', onclick: onclick });
    if (iconName) b.appendChild(icon(iconName));
    if (ar) b.appendChild(h('span', { class: 'cr-chip-t' }, bi(ar, en)));
    if (extra) for (var k in extra) b.setAttribute(k, extra[k]);
    return b;
  }
  function sw(ar, en, checked, onchange) {
    var inp = h('input', { type: 'checkbox', onchange: function () { onchange(inp.checked); } }); inp.checked = !!checked;
    return h('label', { class: 'switch cr-sw' }, inp, h('span', null, bi(ar, en)));
  }
  function box(cls, tag) { return h(tag || 'div', { class: cls }); }
  function labelOf(tabDef) { return B(tabDef.ar || tabDef.id, tabDef.en || tabDef.id); }

  /* ---- popovers (one open at a time; Esc and an outside press close them) ---- */
  function popOpen(trigger, panel) {
    popClose(false); panel.hidden = false; setA(trigger, 'aria-expanded', 'true'); U.pop = { trigger: trigger, panel: panel };
  }
  function popClose(refocus) {
    var p = U.pop; if (!p) return; p.panel.hidden = true; setA(p.trigger, 'aria-expanded', 'false'); U.pop = null; if (refocus) p.trigger.focus();
  }
  function popToggle(trigger, panel) { if (U.pop && U.pop.panel === panel) popClose(false); else popOpen(trigger, panel); }
  doc.addEventListener('pointerdown', function (e) {
    var p = U.pop; if (p && !p.panel.contains(e.target) && !p.trigger.contains(e.target)) popClose(false);
    var tools = $('#cr-tools'), mb = $('#cr-more'); if (tools && mb && tools.classList.contains('open') && !tools.contains(e.target) && !mb.contains(e.target)) moreSet(false);
  }, true);

  /* ---- dialogs: native <dialog> (modal: focus trap, Esc, inert background); a fallback keeps working without showModal ---- */
  function closeDialog() { var d = U.dlg; if (!d) return; try { if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open'); } catch (e) { /* ignore */ } finish(d); }
  function finish(d) {
    if (U.dlg !== d) return; U.dlg = null; html.classList.remove('cr-modal'); if (d.parentNode) d.remove();
    var inv = U.invoker; U.invoker = null; if (inv && inv.isConnected) { try { inv.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    if (d._onclose) d._onclose();
  }
  // o: {id, cls, title:[ar,en], body:Node, actions:[{ar, en, cls, icon, autofocus, keep, onclick}], onclose}
  function openDialog(o) {
    closeDialog(); popClose(false);
    var d = h('dialog', { class: 'cr-dlg ' + (o.cls || ''), id: o.id || 'cr-dlg', 'aria-labelledby': (o.id || 'cr-dlg') + '-t' }), tid = (o.id || 'cr-dlg') + '-t', first = null;
    var head = h('div', { class: 'cr-dlg-h' }, h('h2', { id: tid }, bi(o.title[0], o.title[1])), CR.iconBtn('x', 'إغلاق', 'Close', closeDialog, 'cr-dlg-x'));
    var foot = h('div', { class: 'cr-dlg-f' });
    (o.actions || []).forEach(function (a) {
      var b = h('button', { type: 'button', class: 'btn btn-sm ' + (a.cls || 'btn-ghost'), onclick: function () { var keep = a.onclick ? a.onclick() : false; if (keep !== true) closeDialog(); } });
      if (a.icon) b.appendChild(icon(a.icon)); b.appendChild(bi(a.ar, a.en)); foot.appendChild(b); if (a.autofocus) first = b;
    });
    d.appendChild(h('div', { class: 'cr-dlg-in' }, head, h('div', { class: 'cr-dlg-b' }, o.body), foot));
    d._onclose = o.onclose || null; U.invoker = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : (U.lastBtn && U.lastBtn.isConnected ? U.lastBtn : null);
    doc.body.appendChild(d); U.dlg = d; html.classList.add('cr-modal');
    d.addEventListener('close', function () { finish(d); });
    d.addEventListener('cancel', function () { /* Esc: the native close event follows */ });
    d.addEventListener('click', function (e) { if (e.target === d) closeDialog(); });
    if (typeof d.showModal === 'function') { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); d.classList.add('is-fallback'); } } else { d.setAttribute('open', ''); d.classList.add('is-fallback'); }
    d.addEventListener('keydown', trapTab);                                              // a native modal dialog lets Tab reach the browser's own controls: keep it inside
    (first || $('.cr-dlg-x', d)).focus();
    return d;
  }
  function trapTab(e) {
    if (e.key === 'Escape') { closeDialog(); return; } if (e.key !== 'Tab') return;
    var f = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', U.dlg).filter(function (x) { return !x.disabled && x.offsetParent !== null; }); if (!f.length) return;
    var a = doc.activeElement, i = f.indexOf(a);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
  function para(ar, en, cls) { return h('p', { class: cls || '' }, bi(ar, en)); }
  Object.assign(UI, { openDialog: openDialog, closeDialog: closeDialog });

  /* ====================================================================================
   * 2. VOCABULARY HELPERS: keys of evidence, first-responder ETA, the incident of an alert
   * ==================================================================================== */
  function incOf(a) { if (!a || !a.incident || !S.snap) return null; var l = S.snap.incidents; for (var i = 0; i < l.length; i++) if (l[i].id === a.incident) return l[i]; return null; }
  // the evidence "keys" of an alert: a detector (rule-based computer vision), a thermal view, a sensor or a citizen report.  Two independent keys = confirmed (P.droneKeysNeeded); one key = needs proof.
  function keysOf(a) {
    var ev = a.evidence || {}, list = [];
    list.push({ id: 'vision', on: !!(ev.vision && ev.vision.seen), conf: ev.vision ? ev.vision.conf : null, label: ev.vision && ev.vision.label ? ev.vision.label : null, name: KEY_NAME.vision });
    list.push({ id: 'thermal', on: !!(ev.thermal && ev.thermal.seen), pending: !!(ev.thermal && ev.thermal.pending), conf: ev.thermal ? ev.thermal.conf : null, kind: ev.thermal ? ev.thermal.kind : null, name: KEY_NAME.thermal });
    if (ev.sensor || a.source === 'sentinel' || a.source === 'citizen') list.push({ id: 'sensor', on: !!(ev.sensor && ev.sensor.seen), name: a.source === 'citizen' ? KEY_NAME.citizen : KEY_NAME.sensor });
    var n = list.filter(function (k) { return k.on; }).length;
    return { list: list, n: n, names: list.filter(function (k) { return k.on; }).map(function (k) { return B(k.name[0], k.name[1]); }) };
  }
  function proofText(k) {
    if (k.n >= 3) return B('ثلاثة مفاتيح مستقلة', 'Three independent keys');
    if (k.n === 2) return B('مفتاحان مستقلان', 'Two independent keys');
    if (k.n === 1) return B('مفتاح واحد — يحتاج إثباتًا', 'One key – needs proof');
    return B('لا مفتاح بعد — يحتاج إثباتًا', 'No key yet – needs proof');
  }
  function firstEta(a) {
    var inc = incOf(a); if (!inc || !inc.plan) return null;
    var best = null, onScene = false;
    inc.plan.units.forEach(function (u) {
      if (!u.unitId || u.optional) return;
      if (u.state === 'on-scene' || u.state === 'cleared') onScene = true; else if (isNum(u.etaSec) && (best === null || u.etaSec < best)) best = u.etaSec;
    });
    return { sec: best, onScene: onScene, planned: inc.plan.state === 'recommended' };
  }
  function droneOf(a) { return a && a.droneId && S.drones[a.droneId] ? S.drones[a.droneId].row : null; }
  var ROBOT_STATE = { stowed: ['في الانتظار', 'stowed'], approved: ['معتمد', 'approved'], deploying: ['ينتشر', 'deploying'], searching: ['يبحث', 'searching'], guiding: ['يرشد', 'guiding'], holding: ['متوقف', 'holding'], returning: ['يعود', 'returning'], fault: ['عطل', 'fault'] };
  function robotInfo() {                                                                // js/control-robot.js: scenario() → {robotOn, state, finds[]} (a robot is "active" while it deploys, searches, guides, holds or returns)
    var m = CR.mods.robot, o = { active: 0, found: 0, known: false, text: null };
    if (!m) return o;
    try {
      var v = typeof m.scenario === 'function' ? m.scenario() : null;
      if (v) { o.known = true; o.active = v.robotOn && ['deploying', 'searching', 'guiding', 'holding', 'returning'].indexOf(v.state) >= 0 ? 1 : 0; o.found = v.finds ? v.finds.length : 0; var sn = ROBOT_STATE[v.state]; if (sn && v.robotOn) o.text = B(sn[0], sn[1]) + (o.found ? ' · ' + N(o.found) + B(' عُثر عليهم', ' found') : ''); }
    } catch (e) { /* ignore */ }
    return o;
  }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  Object.assign(UI, { keysOf: keysOf, firstEta: firstEta, incOf: incOf });

  /* ====================================================================================
   * 3. TOP BAR
   * ==================================================================================== */
  var T = {};                                                                           // element refs
  function moreSet(on) { var tools = $('#cr-tools'), b = $('#cr-more'); if (!tools || !b) return; tools.classList.toggle('open', !!on); setA(b, 'aria-expanded', String(!!on)); }
  function topBtn(iconName, ar, en, onclick, extra) {
    var b = h('button', { type: 'button', class: 'cr-tbtn', onclick: onclick });
    b.appendChild(icon(iconName)); b.appendChild(h('span', { class: 'cr-tx' }, bi(ar, en)));
    lab(b, 'title', ar, en); if (extra) for (var k in extra) b.setAttribute(k, extra[k]);
    return b;
  }
  function buildTop() {
    var top = $('#cr-top'); if (!top) return;
    lab(top, 'aria-label', 'شريط أدوات غرفة التحكم', 'Control room toolbar');
    // title
    T.title = h('div', { class: 'cr-title' }, h('span', { class: 'cr-wallonly cr-logo-w' }, CR.sv ? logoSvg() : null),
      h('div', { class: 'cr-title-t' }, h('b', null, bi('غرفة التحكم', 'Control Room')), h('small', null, bi('مفهوم + نموذج أولي محاكى', 'Concept + simulated prototype'))));
    // clock
    T.clockT = h('time', { class: 'cr-clock-t mono', dir: 'ltr' }, '--:--:--'); T.clockD = h('span', { class: 'cr-clock-d' }, '');
    T.clock = h('div', { class: 'cr-clock', role: 'group' }, h('div', { class: 'cr-clock-r' }, T.clockT, CR.simTag()), h('div', { class: 'cr-clock-s' }, T.clockD, h('span', { class: 'cr-clock-z' }, ' · ', ltr('UTC+3'), ' · ', bi('توقيت قطر', 'Qatar time'))));
    lab(T.clock, 'aria-label', 'الوقت المحاكى في قطر (آسيا/قطر، UTC+3، بلا توقيت صيفي)', 'Simulated time in Qatar (Asia/Qatar, UTC+3, no daylight saving)'); lab(T.clock, 'title', 'الوقت المحاكى في قطر (آسيا/قطر، UTC+3، بلا توقيت صيفي)', 'Simulated time in Qatar (Asia/Qatar, UTC+3, no daylight saving)');
    // transport
    T.play = h('button', { type: 'button', class: 'cr-tbtn cr-play', onclick: function () { CR.api.setPlaying(!S.playing); } });
    T.play.appendChild(icon('pause')); T.playIc = T.play.firstChild; T.play.appendChild(h('span', { class: 'cr-tx cr-play-t' }, ''));
    T.speed = seg({ label: ['سرعة المحاكاة', 'Simulation speed'], cls: 'cr-speed', items: SPEEDS.map(function (v) { return { id: v, text: '×' + v, tip: ['سرعة ×' + v, 'Speed ×' + v] }; }), get: function () { return S.speed; }, set: function (v) { CR.api.setSpeed(v); } });
    T.seek = h('select', { class: 'cr-sel cr-seek', onchange: function () { var v = T.seek.value; T.seek.value = ''; seekBy(v); } });
    lab(T.seek, 'aria-label', 'تقديم سريع للساعة المحاكاة', 'Fast-forward the simulated clock'); T.seekOpts = {};
    ['', '900', '3600', '10800', 'h12', 'h18'].forEach(function (v) { var o = h('option', { value: v }); T.seekOpts[v] = o; T.seek.appendChild(o); });
    // role + autopilot
    T.role = h('select', { class: 'cr-sel cr-role-sel', onchange: function () { CR.setRole(T.role.value); } }); CR.ROLES.forEach(function (r) { T.role.appendChild(h('option', { value: r.id, text: '' })); });
    lab(T.role, 'aria-label', 'الدور المحاكى (لا تسجيل دخول حقيقي)', 'Simulated role (no real login)');
    T.roleWrap = h('label', { class: 'cr-fld cr-hide-wall' }, h('span', { class: 'cr-fld-l' }, bi('الدور', 'Role'), CR.simTag()), T.role);
    T.auto = sw('الطيار الآلي (مشغّل محاكى)', 'Autopilot (simulated operator)', S.autopilot, function (v) { CR.setAutopilot(v); });
    // scenarios menu
    T.scnPanel = h('div', { class: 'cr-pop cr-scn', hidden: true, id: 'cr-scn' }); lab(T.scnPanel, 'aria-label', 'السيناريوهات', 'Scenarios');
    T.scnBtn = h('button', { type: 'button', class: 'cr-tbtn cr-scn-b', 'aria-expanded': 'false', 'aria-controls': 'cr-scn', onclick: function () { popToggle(T.scnBtn, T.scnPanel); } }, icon('sliders'), h('span', { class: 'cr-tx cr-tx-keep' }, bi('السيناريوهات', 'Scenarios')));
    [['demo', 'play', 'قصة العرض (٤ دقائق)', 'Demo story (4 min)', 'startDemo'], ['busy', 'bell', 'مناوبة مزدحمة', 'Busy shift', 'startBusy'], ['quiet', 'check', 'مناوبة هادئة (فارغة)', 'Quiet shift (empty)', 'quiet'], ['reset', 'reset', 'إعادة الضبط', 'Reset', 'reset']].forEach(function (m) {
      T.scnPanel.appendChild(h('button', { type: 'button', class: 'cr-mi', 'data-scn': m[0], onclick: function () { popClose(false); runScenario(m[4]); } }, icon(m[1]), bi(m[2], m[3])));
    });
    T.scnPanel.appendChild(T.auto);
    // switches
    T.sound = topBtn('mute', 'الصوت', 'Sound', function () { CR.soundSet(!CR.sound()); }, { 'aria-pressed': 'false' }); T.soundIc = T.sound.firstChild;
    T.wallBtn = topBtn('full', 'وضع الجدار', 'Wall mode', function () { UI.setWall(!UI.wall); }, { 'aria-pressed': 'false' });
    T.help = topBtn('help', 'مساعدة وإرشادات', 'Help and legend', function () { UI.openHelp(); }, { 'data-x': 'help' }); T.help.classList.add('cr-hide-wall');
    T.keys = topBtn('keyboard', 'اختصارات لوحة المفاتيح', 'Keyboard shortcuts', function () { UI.openShortcuts(); }); T.keys.classList.add('cr-hide-wall');
    T.lang = h('button', { type: 'button', class: 'cr-tbtn cr-langb', onclick: function () { win.Manara.toggleLang(); } }); T.langT = h('span', { class: 'cr-lang-t', text: '' }); T.lang.appendChild(T.langT);
    T.theme = h('button', { type: 'button', class: 'cr-tbtn cr-themeb', onclick: function () { win.Manara.theme.toggle(); } }); T.themeIc = null;
    T.more = h('button', { type: 'button', class: 'cr-tbtn cr-more', id: 'cr-more', 'aria-expanded': 'false', 'aria-controls': 'cr-tools', onclick: function () { moreSet(!$('#cr-tools').classList.contains('open')); } }, icon('menu'), h('span', { class: 'cr-tx' }, bi('المزيد', 'More')));
    lab(T.more, 'title', 'المزيد من الأدوات', 'More tools');
    T.tools = h('div', { class: 'cr-tools', id: 'cr-tools' },
      h('div', { class: 'cr-fld cr-fld-speed cr-hide-wall' }, h('span', { class: 'cr-fld-l cr-fld-lx' }, bi('السرعة', 'Speed')), T.speed), h('div', { class: 'cr-fld cr-fld-seek cr-hide-wall' }, h('span', { class: 'cr-fld-l cr-fld-lx' }, bi('تقديم سريع', 'Fast-forward')), T.seek),
      T.roleWrap, h('div', { class: 'cr-popwrap cr-hide-wall' }, T.scnBtn, T.scnPanel), T.sound, T.wallBtn, T.help, T.keys, T.lang, T.theme);
    top.append(T.title, T.clock, T.play, T.more, T.tools);
    syncTop();
  }
  function logoSvg() {
    var sv = CR.sv;
    return sv('svg', { width: 34, height: 34, viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' }, sv('rect', { x: 2, y: 2, width: 60, height: 60, rx: 18, fill: '#0d1320' }), sv('path', { d: 'M26.5 27h11l3 27h-17z', fill: '#f3f5f9' }), sv('path', { d: 'M25.4 37h13.2l.7 6H24.7zM24 49h16l.5 5h-17z', fill: '#ff7a45' }),
      sv('rect', { x: 25, y: 16, width: 14, height: 10, rx: 3, fill: '#ffd166' }), sv('circle', { cx: 32, cy: 21, r: 2.6, fill: '#0d1320' }),
      sv('g', { stroke: '#3ad6e6', 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }, sv('circle', { cx: 22.5, cy: 14.5, r: 3 }), sv('circle', { cx: 41.5, cy: 14.5, r: 3 }), sv('path', { d: 'M25 16l2 1.5M39 16l-2 1.5' })), sv('path', { d: 'M18 56h28', stroke: '#3ad6e6', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
  }
  function runScenario(fn) {
    var d = CR.mods.demo;
    if (!d) { CR.toast({ ar: 'وحدة السيناريوهات لم تُحمَّل', en: 'The scenario module did not load' }, 'warn'); return; }
    if (fn === 'quiet') { if (d.quiet) d.quiet(); else d.reset(); return; }
    if (typeof d[fn] === 'function') d[fn](fn === 'startBusy' ? { quiet: false } : undefined);
  }
  function seekBy(v) {
    if (!v || !S.snap) return; var t = S.snap.t, day = Math.floor(t / 86400) * 86400, target = v.charAt(0) === 'h' ? day + (+v.slice(1)) * 3600 : t + (+v);
    if (target <= t + 1) { CR.toast({ ar: 'الساعة المحاكاة لا تعود إلى الوراء — استخدم «السيناريوهات ← إعادة الضبط»', en: 'The simulated clock cannot run backwards — use Scenarios → Reset' }, 'warn'); return; }
    CR.api.seekTo(target);
  }
  function syncTop() {
    if (!T.play) return;
    var en = CR.lang() === 'en';
    setA(T.play, 'aria-label', S.playing ? (en ? 'Pause the simulation' : 'إيقاف المحاكاة مؤقتًا') : (en ? 'Play the simulation' : 'تشغيل المحاكاة')); setA(T.play, 'title', S.playing ? (en ? 'Pause (Space)' : 'إيقاف مؤقت (مسافة)') : (en ? 'Play (Space)' : 'تشغيل (مسافة)'));
    setT(T.play.lastChild, S.playing ? (en ? 'Pause' : 'إيقاف') : (en ? 'Play' : 'تشغيل'));
    var want = S.playing ? 'pause' : 'play', cur = T.playIc.getAttribute('data-ic');
    if (cur !== want) { var n = icon(want); n.setAttribute('data-ic', want); T.play.replaceChild(n, T.playIc); T.playIc = n; }
    T.speed.sync();
    var seekText = { '': ['تقديم…', 'Skip ahead…'], '900': ['+١٥ دقيقة', '+15 min'], '3600': ['+ساعة', '+1 hour'], '10800': ['+٣ ساعات', '+3 hours'], h12: ['إلى ١٢:٠٠', 'To 12:00'], h18: ['إلى ١٨:٠٠', 'To 18:00'] };
    Object.keys(T.seekOpts).forEach(function (k) { setT(T.seekOpts[k], B(seekText[k][0], seekText[k][1])); });
    $$('option', T.role).forEach(function (o, i) { setT(o, B(CR.ROLES[i].ar, CR.ROLES[i].en)); }); if (T.role.value !== S.role) T.role.value = S.role;
    if (T.auto.firstChild.checked !== !!S.autopilot) T.auto.firstChild.checked = !!S.autopilot;
    setT(T.langT, en ? 'ع' : 'EN'); setA(T.lang, 'aria-label', win.Manara.s('ui.lang')); setA(T.lang, 'title', win.Manara.s('ui.lang'));
    var dark = html.dataset.theme === 'dark', ic = dark ? 'sun' : 'moon';
    if (!T.themeIc || T.themeIc.getAttribute('data-ic') !== ic) { var m = icon(ic); m.setAttribute('data-ic', ic); if (T.themeIc) T.theme.replaceChild(m, T.themeIc); else T.theme.appendChild(m); T.themeIc = m; }
    setA(T.theme, 'aria-label', win.Manara.s('ui.theme')); setA(T.theme, 'title', win.Manara.s('ui.theme'));
    var snd = CR.sound(); setA(T.sound, 'aria-pressed', String(snd)); var si = snd ? 'speaker' : 'mute'; if (T.soundIc.getAttribute('data-ic') !== si) { var n2 = icon(si); n2.setAttribute('data-ic', si); T.sound.replaceChild(n2, T.soundIc); T.soundIc = n2; }
    setA(T.wallBtn, 'aria-pressed', String(UI.wall));
    $$('.cr-mi', T.scnPanel).forEach(function (b) { b.disabled = !CR.mods.demo; });
  }
  function syncClock() {
    var s = S.snap; if (!s) return;
    setT(T.clockT, s.clock); setA(T.clockT, 'datetime', s.date + 'T' + s.clock + '+03:00');
    setT(T.clockD, nm(s.dowName) + ' ' + s.date);
  }

  /* ====================================================================================
   * 4. KPI STRIP  (every figure is simulated: a SIM badge on each card)
   * ==================================================================================== */
  var KPI = {};
  function buildKpis() {
    var el = $('#cr-kpis'); if (!el) return; lab(el, 'aria-label', 'أرقام رئيسية (محاكاة)', 'Key figures (simulation)');
    [['open', 'bell', 'إنذارات مفتوحة', 'Open alerts'], ['drones', 'drone', 'مسيّرات في الجو / متاحة', 'Drones airborne / available'], ['units', 'route', 'وحدات في الطريق', 'Units en route'], ['eta', 'clock', 'وسيط وقت الاستجابة الأولى', 'Median first-response ETA'],
      ['people', 'users', 'أشخاص مُحصَون', 'People accounted'], ['robots', 'robot', 'روبوتات تعمل', 'Robots active']].forEach(function (d) {
      var k = KPI[d[0]] = { id: d[0], v: h('b', { class: 'cr-kpi-v mono' }, '–'), s: h('small', { class: 'cr-kpi-s' }, ''), tone: '' };
      k.el = h('div', { class: 'cr-kpi', role: 'group', 'data-k': d[0] }, h('div', { class: 'cr-kpi-h' }, icon(d[1]), h('span', { class: 'cr-kpi-l' }, bi(d[2], d[3]))), h('div', { class: 'cr-kpi-r' }, k.v, CR.simTag()), k.s);
      lab(k.el, 'aria-label', d[2] + ' (محاكاة)', d[3] + ' (simulation)'); el.appendChild(k.el);
    });
  }
  function setKpi(id, val, sub, tone) { var k = KPI[id]; if (!k) return; setT(k.v, val); setT(k.s, sub || ''); if (k.tone !== (tone || '')) { k.tone = tone || ''; setA(k.el, 'data-tone', k.tone); } }
  function renderKpis() {
    var s = S.snap; if (!s || !KPI.open) return;
    var open = S.alerts.filter(function (a) { return !CR.isFinal(a); }), crit = open.filter(function (a) { return a.level === 'critical' || a.level === 'high'; }).length, unseen = s.incidents.filter(function (i) { return i.status === 'unseen'; }).length;
    var drones = s.drones, air = drones.filter(function (d) { return d.state !== 'docked' && d.state !== 'charging' && d.state !== 'fault'; }).length, kd = s.kpis && s.kpis.drones, avail = kd ? kd.available : drones.filter(function (d) { return d.state === 'docked'; }).length;
    setKpi('open', N(open.length), crit ? N(crit) + B(' حرج/عالٍ', ' critical / high') : B('لا حرج الآن', 'none critical'), crit ? 'danger' : (open.length ? 'warn' : 'safe'));
    setKpi('drones', N(air) + ' / ' + N(avail), B('من ', 'of ') + N(drones.length) + B(' مسيّرة', ' drones') + (kd && kd.fault ? ' · ' + N(kd.fault) + B(' معطّلة', ' fault') : ''), air ? 'cool' : '');
    var ku = s.kpis && s.kpis.units;
    setKpi('units', ku ? N(ku.enRoute) : '–', ku ? N(ku.onScene) + B(' في الموقع · ', ' on scene · ') + N(ku.available) + B(' متاحة', ' available') : '', ku && ku.enRoute ? 'cool' : '');
    var etas = s.incidents.filter(function (i) { return i.status !== 'cancelled' && i.status !== 'unseen' && isNum(i.firstEtaSec); }).map(function (i) { return i.firstEtaSec; }), md = median(etas);
    setKpi('eta', md == null ? '–' : mmss(md), md == null ? B('لا حوادث بعد', 'no incidents yet') : N(etas.length) + B(' حادث', ' incidents') + ' · ' + B('وسيط', 'median'), '');
    var ph = S.phone, ri = robotInfo();
    setKpi('people', N(ph.safe + ri.found), N(ph.help) + B(' يحتاجون مساعدة · ', ' need help · ') + N(ph.ack) + B(' مستيقظون', ' awake') + (ri.found ? ' · ' + N(ri.found) + B(' وجدهم الروبوت', ' found by robot') : ''), ph.help ? 'danger' : (ph.safe ? 'safe' : ''));
    setKpi('robots', N(ri.active), ri.text ? ri.text : (CR.mods.robot ? B('في الانتظار', 'standby') : B('الوحدة لم تُحمَّل', 'module not loaded')), ri.active ? 'cool' : '');
  }

  /* ====================================================================================
   * 5. ALERT QUEUE
   * ==================================================================================== */
  function buildQueue() {
    var q = $('#cr-queue'); if (!q) return; lab(q, 'aria-label', 'طابور الإنذارات', 'Alert queue');
    U.qCount = h('span', { class: 'cr-count mono', 'aria-hidden': 'true' }, '0');
    var head = h('div', { class: 'cr-q-h' }, h('h2', { class: 'cr-q-t' }, icon('bell'), h('span', null, bi('طابور الإنذارات', 'Alert queue')), U.qCount), CR.simTag());
    var sheetH = sheetHeader('queue', 'bell', 'طابور الإنذارات', 'Alert queue');
    // filters
    U.srcChips = {};
    var srcRow = h('div', { class: 'cr-chips', role: 'group' }); lab(srcRow, 'aria-label', 'تصفية حسب المصدر', 'Filter by source');
    [['all', 'الكل', 'All', null]].concat(SRC_ORDER.map(function (s) { return [s, CR.SRC[s].ar, CR.SRC[s].en, CR.SRC[s].icon]; })).forEach(function (d) {
      var c = chip(d[1], d[2], d[3], function () { setFilter('src', d[0]); }); var n = h('span', { class: 'cr-chip-n mono' }, ''); c.appendChild(n); c._n = n; U.srcChips[d[0]] = c; srcRow.appendChild(c);
    });
    U.hzChips = {};
    var hzRow = h('div', { class: 'cr-chips cr-hzchips', role: 'group' }); lab(hzRow, 'aria-label', 'تصفية حسب نوع الخطر', 'Filter by hazard');
    CR.HZ_ORDER.forEach(function (hz) {
      var c = chip(null, null, CR.HZ[hz].icon, function () { setFilter('hz', U.filters.hz === hz ? 'all' : hz); }); c.setAttribute('data-hz', hz); c.classList.add('cr-chip-i'); U.hzChips[hz] = c; hzRow.appendChild(c);
    });
    U.closedSw = sw('أظهر المغلقة', 'Show closed', false, function (v) { U.filters.closed = v; renderQueue(true); });
    U.closedSw.classList.add('cr-sw-s');
    var filt = h('div', { class: 'cr-q-f scroll-x' }, srcRow, h('div', { class: 'cr-q-f2' }, hzRow, U.closedSw));
    U.list = h('ol', { class: 'cr-q-list', role: 'list', tabindex: '-1' });
    U.list.addEventListener('pointermove', function () { U.pointerAt = CR.now(); }); U.list.addEventListener('pointerleave', function () { U.pointerAt = 0; });
    U.emptyBtn = act(['ابدأ قصة العرض (٤ دقائق)', 'Start the demo story (4 min)'], 'play', 'primary', function () { runScenario('startDemo'); }, ['تشغيل قصة العرض الموجَّهة', 'Play the guided demo story']);
    U.empty = h('div', { class: 'cr-q-empty', hidden: true }, icon('check'), h('p', { class: 'cr-q-e1' }, ''), h('p', { class: 'cr-q-e2' }, ''), U.emptyBtn);
    q.append(sheetH, head, filt, h('div', { class: 'cr-q-body' }, U.list, U.empty));
    refreshChips();
  }
  function setFilter(k, v) {
    U.filters[k] = v; refreshChips(); renderQueue(true);
    var n = visibleAlerts().length; CR.live(B('تصفية: ', 'Filter: ') + (k === 'src' ? (v === 'all' ? B('كل المصادر', 'all sources') : nm(CR.SRC[v])) : (v === 'all' ? B('كل الأخطار', 'all hazards') : CR.hzName(v))) + ' — ' + N(n) + B(' إنذار', ' alerts'));
  }
  function refreshChips() {
    Object.keys(U.srcChips).forEach(function (k) { setA(U.srcChips[k], 'aria-pressed', String(U.filters.src === k)); });
    Object.keys(U.hzChips).forEach(function (k) { setA(U.hzChips[k], 'aria-pressed', String(U.filters.hz === k)); lab(U.hzChips[k], 'title', CR.hzName0 ? CR.hzName0({ hazard: k }, 'ar') : k, CR.hzName0 ? CR.hzName0({ hazard: k }, 'en') : k); lab(U.hzChips[k], 'aria-label', CR.hzName0({ hazard: k }, 'ar'), CR.hzName0({ hazard: k }, 'en')); });
  }
  function visibleAlerts() {
    var F = U.filters, arr = S.alerts.filter(function (a) { return (F.closed || !CR.isFinal(a)) && (F.src === 'all' || a.source === F.src) && (F.hz === 'all' || a.hazard === F.hz); });
    arr.sort(function (a, b) { var fa = CR.isFinal(a) ? 1 : 0, fb = CR.isFinal(b) ? 1 : 0; return fa - fb || b.priority - a.priority || a.t - b.t || (a.id < b.id ? -1 : 1); });
    return arr;
  }
  function act(label, iconName, cls, onclick, tip) {
    var b = h('button', { type: 'button', class: 'cr-btn ' + cls, onclick: function (e) { U.lastBtn = e.currentTarget; onclick(e); } }); if (iconName) b.appendChild(icon(iconName)); b.appendChild(h('span', { class: 'cr-btn-t' }, bi(label[0], label[1])));
    lab(b, 'title', tip[0], tip[1]); return b;
  }
  function makeCard(a) {
    var id = a.id, r = {};
    r.ico = h('span', { class: 'cr-ico', 'data-hz': a.hazard }, icon(CR.HZ[a.hazard] ? CR.HZ[a.hazard].icon : 'sos'));
    r.ti = h('span', { class: 'cr-ac-ti' }); r.sub = h('span', { class: 'cr-ac-sub' });
    r.sel = h('button', { type: 'button', class: 'cr-ac-sel', 'aria-pressed': 'false', onclick: function () { CR.selectAlert(id); } }, r.ti, r.sub);
    r.lvl = h('span', { class: 'cr-lvl', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')); r.lvlT = h('span', { class: 'cr-lvl-t' });
    r.side = h('span', { class: 'cr-ac-side' }, h('span', { class: 'cr-lvl-w' }, r.lvl, r.lvlT));
    var s0 = srcTag(a); r.srcT = h('span'); r.src = h('span', { class: 'tag cr-src ' + (s0.cls || '') }, icon(s0.icon), r.srcT); r.state = h('span', { class: 'tag cr-state' }); r.verdict = h('span', { class: 'tag cr-verdict', hidden: true }); r.esc = h('span', { class: 'tag warn cr-esc', hidden: true }, icon('up'), bi('مُصعَّد', 'Escalated')); r.id = h('span', { class: 'cr-ac-id mono', dir: 'ltr' }, id);
    r.badges = h('div', { class: 'cr-ac-badges' }, r.src, r.state, r.verdict, r.esc, r.id);
    r.proofIc = h('span', { class: 'cr-proof-i' }); r.proofT = h('span', { class: 'cr-proof-t' }); r.keys = h('span', { class: 'cr-keys' });
    r.proof = h('div', { class: 'cr-ac-proof' }, r.proofIc, r.proofT, r.keys);
    r.age = h('span', { class: 'cr-m cr-m-age' }, icon('clock'), h('span', { class: 'mono' })); r.eta = h('span', { class: 'cr-m cr-m-eta' }, icon('route'), h('span', null)); r.dr = h('span', { class: 'cr-m cr-m-dr' }, icon('drone'), h('span', null)); r.conf = h('span', { class: 'cr-m cr-m-conf' }, icon('target'), h('span', { class: 'mono' }));
    r.meta = h('div', { class: 'cr-ac-meta' }, r.age, r.eta, r.dr, r.conf, CR.simTag());
    r.bApprove = act(['وافق', 'Approve'], 'check', 'cr-b-approve primary', function () { UI.approve(id); }, ['اعتماد الإنذار — المفتاح البشري (A)', 'Approve the alert — the human key (A)']);
    r.bDismiss = act(['ارفض', 'Dismiss'], 'x', 'cr-b-dismiss', function () { UI.dismiss(id); }, ['رفض الإنذار بعد مراجعة الدليل (D)', 'Dismiss the alert after reviewing the evidence (D)']);
    r.bEsc = act(['صعّد', 'Escalate'], 'up', 'cr-b-esc', function () { UI.escalate(id); }, ['تصعيد إلى أعلى أولوية (E)', 'Escalate to top priority (E)']);
    r.bVerify = act(['تحقّق بمسيّرة', 'Verify by drone'], 'drone', 'cr-b-verify', function () { UI.verify(id); }, ['إطلاق مسيّرة للتحقق', 'Launch a drone to verify']);
    r.lockNote = h('span', { class: 'cr-ac-lock', hidden: true }, icon('lock'), bi('يلزم دور المشغّل (محاكاة)', 'Needs the operator role (SIM)'));
    r.acts = h('div', { class: 'cr-ac-acts' }, r.bApprove, r.bDismiss, r.bEsc, r.bVerify, r.lockNote);
    r.follow = h('div', { class: 'cr-ac-follow', hidden: true }, h('span', { class: 'cr-ac-ft' }), act(['تفاصيل الإرسال', 'Dispatch details'], 'route', 'cr-b-disp', function () { CR.selectAlert(id, { fly: false }); CR.showTab('dispatch'); }, ['افتح لوحة الإرسال', 'Open the dispatch panel']));
    r.el = h('li', { class: 'cr-ac', 'data-id': id }, h('div', { class: 'cr-ac-top' }, r.ico, r.sel, r.side), r.badges, r.proof, r.meta, r.acts, r.follow);
    r.el.addEventListener('click', function (e) { if (e.target === r.el || e.target.closest('.cr-ac-top, .cr-ac-badges, .cr-ac-proof, .cr-ac-meta') && !e.target.closest('button')) CR.selectAlert(id); });
    return { id: id, el: r.el, r: r, sig: '' };
  }
  function srcTag(a) { var s = CR.SRC[a.source] || CR.SRC.operator; return s; }
  function updateCard(c, a) {
    var r = c.r, pl = CR.placeLine(a), sev = SEV[a.level] || SEV.low, fin = CR.isFinal(a), sel = S.sel === a.id, pending = !fin && CR.STATE_RANK[a.state] < 2;
    var kk = keysOf(a), src = srcTag(a), eta = firstEta(a), dr = droneOf(a), locked = !CR.can('operator'), conf = isNum(a.confidence) ? Math.round(a.confidence * 100) : null;
    var el = r.el;
    syncKeyed(el, 'data-sev', a.level); syncKeyed(el, 'data-state', a.state); syncKeyed(el, 'data-src', a.source); syncKeyed(el, 'data-keys', kk.n);
    el.classList.toggle('is-sel', sel); el.classList.toggle('is-final', fin); el.classList.toggle('is-new', !!U.newIds[a.id]); el.classList.toggle('is-locked', locked && pending);
    if (sel) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); setA(r.sel, 'aria-pressed', String(sel));
    setT(r.ti, CR.hzName(a.hazard) + ' · ' + pl.place); var dtxt = isNum(pl.dist) && pl.dist >= 0.1 ? N(pl.dist, 1) + B(' كم من المكان', ' km from the place') : ''; setT(r.sub, [pl.muni, dtxt].filter(Boolean).join(' · '));
    setT(r.lvlT, B(sev.ar, sev.en)); syncKeyed(r.lvl, 'data-n', sev.n); setA(r.side, 'title', B('الأولوية ', 'Priority ') + N(a.priority) + ' / 100 (SIM)');
    setT(r.srcT, nm(src));
    setT(r.state, nm(a.stateName)); r.state.className = 'tag cr-state ' + (STATE_TAG[a.state] || '');
    if (a.verdictText) { r.verdict.hidden = false; setT(r.verdict, nm(a.verdictText)); r.verdict.className = 'tag cr-verdict ' + (a.verdict === 'confirmed' ? 'danger' : 'warn'); } else r.verdict.hidden = true;
    r.esc.hidden = !a.escalated;
    // proof before panic: two keys = confirmed; one key = needs proof
    var two = kk.n >= 2; syncKeyed(r.proof, 'data-two', two ? '1' : '0'); setT(r.proofT, proofText(kk));
    if (!r.proofIc.firstChild || r.proofIc.getAttribute('data-two') !== (two ? '1' : '0')) { r.proofIc.replaceChildren(icon(two ? 'check' : 'lock')); r.proofIc.setAttribute('data-two', two ? '1' : '0'); }
    syncKeys(r, kk);
    setT(r.age.lastChild, fmtAge(a.ageSec)); setA(r.age, 'title', B('عمر الإنذار (محاكاة)', 'Age of the alert (SIM)'));
    var et = eta ? (eta.onScene ? B('أول وحدة في الموقع', 'First unit on scene') : (eta.sec == null ? '–' : B('أول وحدة ', 'First unit ') + mmss(eta.sec) + (eta.planned ? B(' (مخطط)', ' (planned)') : ''))) : B('لا خطة بعد', 'no plan yet');
    setT(r.eta.lastChild, et); setA(r.eta, 'title', B('الوقت المقدَّر لوصول أول وحدة أرضية (محاكاة)', 'Estimated time for the first ground unit to arrive (SIM)'));
    var dt = dr ? (dr.callsign + (dr.etaSec != null && (dr.state === 'en-route' || dr.state === 'launching') ? ' · ' + mmss(dr.etaSec) : ' · ' + nm(dr.stateText))) : (a.needDrone ? B('تنتظر مسيّرة', 'waiting for a drone') : ''); r.dr.hidden = !dt; setT(r.dr.lastChild, dt);
    r.conf.hidden = conf == null; if (conf != null) setT(r.conf.lastChild, N(conf) + '%'); setA(r.conf, 'title', B('ثقة الكاشف (محاكاة)', 'Detector confidence (SIM)'));
    // actions
    r.acts.hidden = !pending; r.follow.hidden = fin || pending;
    if (pending) {
      [r.bApprove, r.bDismiss, r.bEsc, r.bVerify].forEach(function (b) { if (locked) setA(b, 'aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); });
      r.lockNote.hidden = !locked; r.bEsc.hidden = !!a.escalated; r.bVerify.hidden = !(a.state === 'SUSPECT' && !a.droneId);
      var confirm = S.confirmApprove[a.id] && CR.now() - S.confirmApprove[a.id] < 5000; r.bApprove.classList.toggle('is-confirm', !!confirm);
      var hint = U.hint && U.hint.id === a.id ? U.hint.action : null; r.bApprove.classList.toggle('cr-hint', hint === 'approve');
    } else if (!fin) {
      var inc = incOf(a), np = inc && inc.plan ? inc.plan.units.filter(function (u) { return u.unitId && !u.optional; }).length : 0;
      setT(r.follow.firstChild, nm(a.stateName) + (np ? ' · ' + N(np) + B(' وحدات', ' units') : ''));
    }
    el.classList.toggle('is-lockedrole', locked);
  }
  function syncKeys(r, kk) {
    var has = r.keys.children.length; if (has !== kk.list.length) { r.keys.replaceChildren(); kk.list.forEach(function (k) { r.keys.appendChild(h('span', { class: 'cr-key', 'data-k': k.id }, icon('check'), h('span'))); }); }
    kk.list.forEach(function (k, i) {
      var el = r.keys.children[i], on = k.on; el.classList.toggle('on', on); el.classList.toggle('wait', !on && !!k.pending);
      var want = on ? 'check' : (k.pending ? 'clock' : 'lock'); if (el.firstChild.getAttribute('data-ic') !== want) { var n = icon(want); n.setAttribute('data-ic', want); el.replaceChild(n, el.firstChild); }
      var sn = KEY_SHORT[k.id === 'sensor' && k.name === KEY_NAME.citizen ? 'citizen' : k.id]; setT(el.lastChild, B(sn[0], sn[1])); setA(el, 'title', (on ? B('مفتاح فعّال: ', 'Key present: ') : (k.pending ? B('بانتظار: ', 'Waiting for: ') : B('غير متوفر: ', 'Not present: '))) + B(k.name[0], k.name[1]));
    });
  }
  function renderQueue(force) {
    if (!U.list) return;
    var t = CR.now(); if (!force && t - U.lastQ < 180) return; U.lastQ = t;
    var list = visibleAlerts(), ids = list.map(function (a) { return a.id; }), set = {}, changed = false, i;
    ids.forEach(function (id) { set[id] = 1; });
    Object.keys(U.cards).forEach(function (id) { if (!set[id]) { U.cards[id].el.remove(); delete U.cards[id]; changed = true; } });
    list.forEach(function (a) { var c = U.cards[a.id]; if (!c) { c = U.cards[a.id] = makeCard(a); changed = true; if (U.seeded) U.newIds[a.id] = t; } updateCard(c, a); });
    Object.keys(U.newIds).forEach(function (id) { if (t - U.newIds[id] > 3500) { delete U.newIds[id]; if (U.cards[id]) U.cards[id].el.classList.remove('is-new'); } });
    var hold = U.pointerAt && t - U.pointerAt < 1400, same = ids.join() === U.order.join();
    if (!same && (!hold || changed)) {
      var act0 = doc.activeElement, keep = act0 && U.list.contains(act0) ? act0 : null;
      ids.forEach(function (id, ix) { var c = U.cards[id].el; if (U.list.children[ix] !== c) U.list.insertBefore(c, U.list.children[ix] || null); });
      U.order = ids; if (keep && doc.activeElement !== keep && keep.isConnected) keep.focus({ preventScroll: true });
    }
    // counts
    var open = S.alerts.filter(function (a) { return !CR.isFinal(a); });
    setT(U.qCount, N(open.length)); U.seeded = true;
    SRC_ORDER.concat(['all']).forEach(function (s) { var n = s === 'all' ? open.length : open.filter(function (a) { return a.source === s; }).length; setT(U.srcChips[s]._n, N(n)); });
    var any = ids.length > 0; U.empty.hidden = any; U.emptyBtn.hidden = !CR.mods.demo || U.filters.src !== 'all' || U.filters.hz !== 'all';
    if (!any) {
      var filtered = U.filters.src !== 'all' || U.filters.hz !== 'all';
      setT(U.empty.children[1], filtered ? B('لا إنذارات تطابق التصفية', 'No alerts match the filter') : B('لا إنذارات مفتوحة', 'No open alerts'));
      setT(U.empty.children[2], filtered ? B('أزل التصفية لرؤية الباقي.', 'Clear the filter to see the rest.') : B('المسيّرات تدور في قطاعاتها والحسّاسات تُنصت. الإنذار التالي سيظهر هنا بحسب الأولوية.', 'Drones are patrolling their sectors and the sentinels are listening. The next alert will appear here, sorted by priority.'));
    }
  }
  UI.visibleAlerts = visibleAlerts;
  function markSelected(scroll) {
    Object.keys(U.cards).forEach(function (id) { var c = U.cards[id], on = S.sel === id; c.el.classList.toggle('is-sel', on); if (on) c.el.setAttribute('aria-current', 'true'); else c.el.removeAttribute('aria-current'); setA(c.r.sel, 'aria-pressed', String(on)); });
    if (scroll && S.sel && U.cards[S.sel]) { try { U.cards[S.sel].el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
  }

  /* ---- actions (the engine side, role gating and toasts live in control.js; the confirmations live here) ---- */
  function target(id) { var a = CR.alertOf(id || S.sel); if (!a) CR.toast({ ar: 'اختر إنذارًا أولًا (j / k أو انقر عليه)', en: 'Select an alert first (j / k, or click it)' }, 'warn'); return a; }
  UI.approve = function (id) {
    var a = target(id); if (!a) return null;
    if (!CR.can('operator') || CR.isFinal(a) || CR.STATE_RANK[a.state] >= 2) return CR.approveAlert(a.id);       // control.js explains the refusal (role / state) in a toast, the log and aria-live
    if (a.state === 'SUSPECT' && !S.autopilot) { UI.openApprove(a.id); return { ok: false, reason: 'dialog' }; }
    return CR.approveAlert(a.id);
  };
  UI.dismiss = function (id) {
    var a = target(id); if (!a) return null;
    if (CR.can('operator') && !CR.isFinal(a) && keysOf(a).n >= 2 && CR.STATE_RANK[a.state] < 2) {
      var aid = a.id;
      openDialog({ id: 'cr-dlg-dismiss', cls: 'warn', title: ['رفض إنذار مؤكَّد؟', 'Dismiss a confirmed alert?'], body: h('div', { class: 'cr-dlg-body' }, para('هذا الإنذار عليه مفتاحان مستقلان (' + keysOf(a).names.join(' + ') + '). الرفض قرار بشري يُسجَّل في سجل الاتصالات وفي ملخص التسليم.', 'This alert has two independent keys (' + keysOf(a).names.join(' + ') + '). Dismissing is a human decision; it is written to the comms log and the handover summary.')),
        actions: [{ ar: 'تراجع', en: 'Cancel', autofocus: true }, { ar: 'ارفض رغم ذلك', en: 'Dismiss anyway', cls: 'btn-danger', icon: 'x', onclick: function () { CR.dismissAlert(aid); } }] });
      return { ok: false, reason: 'dialog' };
    }
    return CR.dismissAlert(a.id);
  };
  UI.escalate = function (id) { var a = target(id); return a ? CR.escalateAlert(a.id) : null; };
  UI.verify = function (id) { var a = target(id); return a ? CR.launchDrone(a.id) : null; };
  // the approve confirmation: "proof before panic" in three keys, what happens next, and the honest alternative (verify first)
  UI.openApprove = function (id) {
    var a = CR.alertOf(id); if (!a) return; var kk = keysOf(a), dr = droneOf(a), inc = incOf(a), plan = inc && inc.plan, aid = a.id, two = kk.n >= 2;
    var keyRow = function (n, ar, en, on, detail) { return h('li', { class: 'cr-pk' + (on ? ' on' : '') }, h('i', { class: 'cr-pk-n' }, on ? icon('check') : String(n)), h('span', { class: 'cr-pk-t' }, h('b', null, bi(ar, en)), h('small', null, detail))); };
    var v = kk.list[0], t = kk.list[1], s = kk.list[2];
    var detV = v.on ? (v.label ? nm(v.label) : B('رأى', 'seen')) + (isNum(v.conf) ? ' · ' + N(Math.round(v.conf * 100)) + '%' : '') : B('لم يرَ شيئًا بعد', 'has not seen anything yet');
    var detT = t.on ? (t.kind ? String(t.kind) : B('رأى', 'seen')) + (isNum(t.conf) ? ' · ' + N(Math.round(t.conf * 100)) + '%' : '') : (t.pending ? B('بانتظار الصورة الحرارية', 'waiting for the thermal view') : B('لا إشارة حرارية', 'no thermal signal'));
    var list = [keyRow(1, 'المفتاح ١: الكاشف (رؤية حاسوبية بقواعد)', 'Key 1: the detector (rule-based computer vision)', v.on, detV), keyRow(2, 'المفتاح ٢: دليل مستقل ثانٍ (حراري أو حسّاس)', 'Key 2: a second, independent proof (thermal or sensor)', t.on || (s && s.on), t.on ? detT : (s && s.on ? B('حسّاس / بلاغ', 'sensor / report') : detT)),
      keyRow(3, 'المفتاح ٣: أنت — المفتاح البشري', 'Key 3: you — the human key', false, B('لا يُرسَل إنذار عام إلا بعد اعتمادك', 'No public alert is sent until you approve'))];
    var units = plan ? plan.units.filter(function (u) { return u.unitId && !u.optional; }) : [];
    var next = h('div', { class: 'cr-dlg-next' }, h('h3', null, bi('ماذا يحدث عند الاعتماد؟', 'What happens when you approve?')),
      h('ul', { class: 'cr-dlg-ul' }, h('li', null, bi('تُرسَل إلى الهواتف القريبة تنبيهات عامة (محاكاة) ويُرسَل تقرير الحادث إلى المُرسِل 999.', 'Nearby phones get a public alert (SIM) and the incident package goes to the 999 dispatcher.')),
        h('li', null, units.length ? [bi('الوحدات الأسرع بحسب الازدحام: ', 'Fastest units given traffic: '), units.map(function (u) { return nm(u.name) + ' (' + mmss(u.etaSec) + ')'; }).join('، ')] : bi('تُحسَب خطة الإرسال الأسرع بحسب الازدحام.', 'The fastest-by-traffic dispatch plan is computed.')),
        h('li', null, bi('إن كان إنذارًا كاذبًا فستُرسَل وحدات إلى موقع قد لا يكون فيه شيء — لذلك نطلب إثباتًا.', 'If it is a false alarm, units are sent to a place where there may be nothing — that is why proof comes first.'))));
    var warn = two ? null : h('p', { class: 'note warn cr-dlg-note' }, icon('alert'), ' ', bi('مفتاح واحد فقط: الأفضل أن تتحقق المسيّرة أولًا' + (dr ? ' (' + dr.callsign + ' ' + (dr.etaSec != null ? 'خلال ' + mmss(dr.etaSec) : nm(dr.stateText)) + ')' : '') + '. ويمكنك الاعتماد الآن بمسؤوليتك.', 'Only one key: it is better to let a drone verify first' + (dr ? ' (' + dr.callsign + ' ' + (dr.etaSec != null ? 'in ' + mmss(dr.etaSec) : nm(dr.stateText)) + ')' : '') + '. You may still approve now, on your own responsibility.'));
    var body = h('div', { class: 'cr-dlg-body' }, h('p', { class: 'cr-dlg-sum' }, h('span', { class: 'cr-ico', 'data-hz': a.hazard }, icon(CR.HZ[a.hazard].icon)), h('span', null, h('b', null, CR.hzName(a.hazard) + ' · ' + CR.placeLine(a).place), h('small', null, a.id + ' · ' + nm(a.sourceName)))),
      h('p', { class: 'cr-dlg-lead' }, bi('الإثبات قبل الذعر: لا يصل الناس إنذار عام إلا بعد مفتاحين مستقلين من الأدلة ثم مفتاحك أنت.', 'Proof before panic: people get a public alert only after two independent keys of evidence, then your key.')),
      h('ol', { class: 'cr-pkeys' }, list), warn, next);
    openDialog({ id: 'cr-dlg-approve', cls: two ? '' : 'warn', title: ['اعتماد الإنذار ' + aid + '؟', 'Approve alert ' + aid + '?'], body: body, actions: [
      { ar: 'تراجع', en: 'Cancel', autofocus: !two },
      a.droneId || !(a.state === 'SUSPECT') ? null : { ar: 'تحقّق بمسيّرة أولًا', en: 'Verify by drone first', icon: 'drone', onclick: function () { CR.launchDrone(aid); } },
      { ar: two ? 'وافق (المفتاح البشري)' : 'وافق رغم مفتاح واحد', en: two ? 'Approve (the human key)' : 'Approve with one key', cls: two ? 'btn-primary' : 'btn-danger', icon: 'check', autofocus: two, onclick: function () { CR.approveAlert(aid, { force: true }); } }].filter(Boolean) });
  };

  /* ====================================================================================
   * 6. MAP HUD
   * ==================================================================================== */
  var HUD = {};
  function hazardTools() {
    return seg({ label: ['نوع الإنذار التجريبي', 'Kind of test alarm'], cls: 'cr-hzpick', items: CR.HZ_ORDER.map(function (hz) { return { id: hz, icon: CR.HZ[hz].icon, ar: CR.hzName0({ hazard: hz }, 'ar'), en: CR.hzName0({ hazard: hz }, 'en') }; }), get: function () { return S.hazardTool; }, set: function (v) { S.hazardTool = v; } });
  }
  function setTool(t) { S.tool = t; HUD.tools.sync(); HUD.hzpick.hidden = t !== 'alarm'; var tx = { select: ['اسحب لتحريك الخريطة وانقر على مسيّرة أو إنذار.', 'Drag to pan; click a drone or an alert.'], alarm: ['انقر على الخريطة لإنشاء إنذار تجريبي محاكى: تُطلق مسيّرة للتحقق، ويبقى الإنذار العام بيدك.', 'Click the map to raise a SIMULATED alarm: a drone is launched to verify, the public alert stays your decision.'], jam: ['انقر قرب طريق لإبطائه أو إزالة الازدحام: تُعاد حسابات الإرسال.', 'Click near a road to jam it or clear the jam: the dispatch is recomputed.'] }[t]; setT(HUD.hint, B(tx[0], tx[1])); HUD.hint.hidden = t === 'select' && !U.hintOn; }
  function setLayer(k, v) {
    var L = S.layers; if (k === 'hazard') { L.hazard = v; S.fieldsAt = -1; if (S.nat) CR.syncScene(true); } else if (k.indexOf('fac.') === 0) L.fac[k.slice(4)] = !!v; else L[k] = !!v;
    if (S.map) { if (k === 'traffic') S.map.invalidate('roads'); S.map.invalidate('base'); S.map.dirty = true; }
  }
  function layerRow(key, ar, en) { var on = key.indexOf('fac.') === 0 ? S.layers.fac[key.slice(4)] : S.layers[key], s = sw(ar, en, on, function (v) { setLayer(key, v); }); s.firstChild.setAttribute('data-layer', key); return s; }
  function buildHud() {
    var hud = $('#cr-hud'); if (!hud) return;
    var mc = $('#cr-map'); if (mc) { lab(mc, 'aria-label', 'خريطة قطر التفاعلية: اسحب للتحريك، عجلة أو أزرار للتقريب، وانقر لاختيار إنذار أو مسيّرة', 'Interactive map of Qatar: drag to pan, wheel or buttons to zoom, click to select an alert or a drone'); mc.setAttribute('aria-roledescription', 'map'); }
    HUD.tools = seg({ label: ['أداة الخريطة', 'Map tool'], cls: 'cr-tools-seg', items: [{ id: 'select', icon: 'target', ar: 'تحديد', en: 'Select' }, { id: 'alarm', icon: 'alert', ar: 'إنذار تجريبي', en: 'Test alarm' }, { id: 'jam', icon: 'route', ar: 'ازدحام طريق', en: 'Jam road' }], get: function () { return S.tool; }, set: setTool });
    HUD.hzpick = hazardTools(); HUD.hzpick.hidden = true;
    HUD.hint = h('p', { class: 'cr-hint-t', hidden: true }, '');
    HUD.tl = h('div', { class: 'cr-hud-tl' }, HUD.tools, HUD.hzpick, HUD.hint);
    // zoom + layers
    var zIn = CR.iconBtn('zoomin', 'تقريب', 'Zoom in', function () { var z = S.map.size(); S.map.zoomAt(z.w / 2, z.h / 2, 1.5); }, 'cr-zb'), zOut = CR.iconBtn('zoomout', 'تبعيد', 'Zoom out', function () { var z = S.map.size(); S.map.zoomAt(z.w / 2, z.h / 2, 1 / 1.5); }, 'cr-zb'), zHome = CR.iconBtn('full', 'عرض كل قطر', 'Fit all of Qatar', function () { S.map.home(500); }, 'cr-zb');
    HUD.layersBtn = h('button', { type: 'button', class: 'cr-zb cr-layers-b', 'aria-expanded': 'false', 'aria-haspopup': 'true', onclick: function () { popToggle(HUD.layersBtn, HUD.layers); } }, icon('layers')); lab(HUD.layersBtn, 'aria-label', 'طبقات الخريطة', 'Map layers'); lab(HUD.layersBtn, 'title', 'طبقات الخريطة', 'Map layers');
    HUD.hzOv = seg({ label: ['طبقة الخطر', 'Hazard overlay'], cls: 'cr-hzov', items: [{ id: 'off', ar: 'بدون', en: 'Off' }, { id: 'heat', icon: 'thermo', ar: 'حرارة', en: 'Heat' }, { id: 'dust', icon: 'wind', ar: 'غبار', en: 'Dust' }, { id: 'rain', icon: 'flood', ar: 'مطر', en: 'Rain' }], get: function () { return S.layers.hazard; }, set: function (v) { setLayer('hazard', v); } });
    HUD.layers = h('div', { class: 'cr-pop cr-layers', hidden: true, role: 'group' }, h('b', { class: 'cr-pop-h' }, bi('طبقات الخريطة', 'Map layers')), HUD.hzOv,
      h('div', { class: 'cr-layer-grid' }, [['traffic', 'ألوان الازدحام', 'Congestion'], ['drones', 'المسيّرات', 'Drones'], ['coverage', 'مدى المسيّرات', 'Drone coverage'], ['trails', 'مسارات المسيّرات', 'Drone trails'], ['docks', 'قواعد المسيّرات', 'Drone docks'], ['units', 'الوحدات الأرضية', 'Ground units'], ['munis', 'تلوين البلديات', 'Municipality tint'], ['places', 'أسماء الأماكن', 'Place names'], ['tunnels', 'الأنفاق', 'Tunnels'], ['closures', 'الإغلاق والازدحام', 'Closures and jams'],
        ['fac.hospital', 'المستشفيات', 'Hospitals'], ['fac.fire', 'مراكز الإطفاء', 'Fire stations'], ['fac.police', 'مراكز الشرطة', 'Police'], ['fac.ambulance', 'نقاط الإسعاف', 'Ambulance points']].map(function (d) { return layerRow(d[0], d[1], d[2]); })));
    HUD.tr = h('div', { class: 'cr-hud-tr' }, h('div', { class: 'cr-zoom' }, zIn, zOut, zHome, HUD.layersBtn), HUD.layers);
    // legend
    var dot = function (tok, ar, en) { return h('li', null, h('i', { class: 'cr-dot', style: '--c:var(--' + tok + ')' }), bi(ar, en)); };
    HUD.legend = h('details', { class: 'cr-legend' }, h('summary', null, icon('info'), bi('دليل الرموز', 'Legend')),
      h('div', { class: 'cr-legend-b' },
        h('div', null, h('b', null, bi('المسيّرات', 'Drones')), h('ul', null, dot('brand', 'تقلع / في الطريق', 'Launching / en route'), dot('accent', 'في دورية', 'On patrol'), dot('safe', 'في الموقع / تتحقق', 'On station / verifying'), dot('muted', 'تعود / تُشحن / في القاعدة', 'Returning / charging / docked'), dot('danger', 'عطل', 'Fault'))),
        h('div', null, h('b', null, bi('الإنذارات', 'Alerts')), h('ul', null, CR.HZ_ORDER.map(function (hz) { return h('li', null, h('span', { class: 'cr-ico cr-ico-s', 'data-hz': hz }, icon(CR.HZ[hz].icon)), CR.hzName0({ hazard: hz }, CR.lang())); }))),
        h('p', { class: 'cr-legend-n' }, bi('كل ما يتحرك على الخريطة محاكاة (SIM). الخريطة نفسها لقطة حقيقية من OpenStreetMap.', 'Everything that moves on the map is simulated (SIM). The map itself is a real snapshot of OpenStreetMap.'))));
    HUD.attr = h('div', { class: 'cr-attrib' }, h('span', null, '© ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap contributors'), ' · ODbL'), h('span', { class: 'cr-attrib-b' }, ' · ', bi('محاكاة', 'simulated'), ' ', CR.simTag()));
    HUD.banner = h('div', { class: 'cr-banner', role: 'status', hidden: true }, icon('alert'), h('div', { class: 'cr-banner-t' }, h('b'), h('span')), CR.iconBtn('x', 'إخفاء', 'Dismiss', function () { HUD.banner.hidden = true; S.banner = null; }, 'cr-banner-x'));
    HUD.peek = h('button', { type: 'button', class: 'cr-peek', onclick: function () { CR.showTab('queue'); } }, h('span', { class: 'cr-ico', 'data-hz': 'fire' }, icon('bell')), h('span', { class: 'cr-peek-t' }), h('span', { class: 'cr-peek-go' }, bi('افتح الطابور', 'Open queue')));
    hud.append(HUD.tl, HUD.tr, HUD.legend, HUD.banner, HUD.peek, HUD.attr);
    setTool(S.tool || 'select');
  }
  UI.syncHud = function () {
    if (!HUD.tools) return; HUD.tools.sync(); HUD.hzOv.sync(); HUD.hzpick.sync(); HUD.hzpick.hidden = S.tool !== 'alarm';
    $$('[data-layer]', HUD.layers).forEach(function (i) { var k = i.getAttribute('data-layer'), on = k.indexOf('fac.') === 0 ? S.layers.fac[k.slice(4)] : S.layers[k]; if (i.checked !== !!on) i.checked = !!on; });
  };
  function renderHud() {
    if (!HUD.peek) return;
    var open = visibleAlerts().filter(function (a) { return !CR.isFinal(a); }), top = open[0];
    HUD.peek.hidden = !top;
    if (top) { var ico = HUD.peek.firstChild; if (ico.getAttribute('data-hz') !== top.hazard) { ico.setAttribute('data-hz', top.hazard); ico.replaceChildren(icon(CR.HZ[top.hazard].icon)); } setT(HUD.peek.children[1], N(open.length) + B(' إنذار · الأعلى: ', ' alerts · top: ') + CR.hzName(top.hazard) + ' — ' + CR.placeLine(top).place); }
    var bn = S.banner; if (bn && CR.now() - bn.at > 14000) { S.banner = null; bn = null; }
    if (bn) { HUD.banner.hidden = false; HUD.banner.className = 'cr-banner ' + (bn.type === 'redispatch' ? 'info' : 'warn'); setT(HUD.banner.querySelector('b'), bn.type === 'redispatch' ? B('إعادة إرسال تلقائية', 'Automatic re-dispatch') : B('تنبيه', 'Notice')); setT(HUD.banner.querySelector('span'), nm(bn.text) + ' (' + bn.clock.slice(0, 5) + ')'); } else HUD.banner.hidden = true;
  }

  /* ====================================================================================
   * 7. TABS (right column on wide screens, bottom sheet / drawer + bottom tab bar on narrow screens)
   * ==================================================================================== */
  function sheetHeader(view, iconName, ar, en) {
    var grab = h('button', { type: 'button', class: 'cr-grab', onclick: function () { sheetSize(S.sheet === 'full' ? 'half' : 'full'); } }, h('i')); lab(grab, 'aria-label', 'تكبير أو تصغير اللوحة', 'Expand or shrink the panel');
    var t = h('div', { class: 'cr-sheet-h', 'data-for': view }, grab, h('b', { class: 'cr-sheet-t' }, icon(iconName), view === 'tabs' ? h('span', { class: 'cr-sheet-tt' }, '') : bi(ar, en)), CR.iconBtn('x', 'أغلق اللوحة وارجع إلى الخريطة', 'Close the panel and go back to the map', function () { CR.showTab('map'); }, 'cr-sheet-x'));
    t.querySelector('.cr-sheet-t').setAttribute('data-for', view); return t;
  }
  function sheetSize(v) { S.sheet = v; var m = $('#main'); if (m) m.setAttribute('data-sheet', v); }
  function buildRight() {
    var r = $('#cr-right'); if (!r) return; lab(r, 'aria-label', 'البثّ والأسطول والإرسال والروبوت والاتصالات والتسليم', 'Feeds, fleet, dispatch, robot, comms and handover');
    U.tablist = h('div', { class: 'cr-tabs', role: 'tablist', id: 'cr-tablist' }); lab(U.tablist, 'aria-label', 'لوحات غرفة التحكم', 'Control room panels');
    U.tablist.addEventListener('keydown', function (e) {
      var ids = tabIds(), cur = ids.indexOf(S.tab), rtl = html.dir === 'rtl', k = e.key, nx = null;
      if (k === (rtl ? 'ArrowLeft' : 'ArrowRight')) nx = (cur + 1) % ids.length; else if (k === (rtl ? 'ArrowRight' : 'ArrowLeft')) nx = (cur - 1 + ids.length) % ids.length; else if (k === 'Home') nx = 0; else if (k === 'End') nx = ids.length - 1; else return;
      e.preventDefault(); CR.showTab(ids[nx], { focus: true });
    });
    U.panels = h('div', { class: 'cr-panels' });
    U.tabEmpty = h('div', { class: 'cr-tab-empty' }, icon('info'), h('p', null, bi('لوحات غرفة التحكم لم تُحمَّل بعد.', 'The control room panels have not loaded yet.')));
    r.append(sheetHeader('tabs', 'layers', 'لوحات غرفة التحكم', 'Control room panels'), U.tablist, U.panels, U.tabEmpty);
  }
  function tabIds() {
    var ids = Object.keys(UI.tabEls); return ids.sort(function (a, b) { var ia = TAB_ORDER.indexOf(a), ib = TAB_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || UI.tabEls[a].seq - UI.tabEls[b].seq; });
  }
  function addTab(def) {
    if (!def || !def.id || UI.tabEls[def.id]) return; var id = def.id;
    var nBadge = h('span', { class: 'cr-tab-n mono', hidden: true });
    var btn = h('button', { type: 'button', class: 'cr-tab', role: 'tab', id: 'cr-tab-' + id, 'aria-selected': 'false', 'aria-controls': 'cr-tp-' + id, tabindex: '-1', 'data-tab': id, onclick: function () { CR.showTab(id, { focus: false }); } }, icon(def.icon || 'layers'), h('span', { class: 'cr-tab-t' }, bi(def.ar || id, def.en || id)), nBadge);
    var panel = h('div', { class: 'cr-tabpanel', id: 'cr-tp-' + id, role: 'tabpanel', 'aria-labelledby': 'cr-tab-' + id, tabindex: '0', hidden: true, 'data-tab': id });
    var bBadge = h('span', { class: 'cr-tb-n mono', hidden: true });
    var bar = h('button', { type: 'button', class: 'cr-tb', 'data-view': id, onclick: function () { CR.showTab(id); } }, icon(def.icon || 'layers'), h('span', { class: 'cr-tb-t' }, bi(def.ar || id, def.en || id)), bBadge);
    UI.tabEls[id] = { def: def, btn: btn, panel: panel, bar: bar, nb: nBadge, bb: bBadge, built: false, seq: Object.keys(UI.tabEls).length };
    orderTabs();
  }
  function orderTabs() {
    var ids = tabIds(), bar = $('#cr-tabbar');
    ids.forEach(function (id) { var t = UI.tabEls[id]; U.tablist.appendChild(t.btn); U.panels.appendChild(t.panel); if (bar) bar.appendChild(t.bar); });
    U.tabEmpty.hidden = ids.length > 0;
    if (ids.length && !UI.tabEls[S.tab]) S.tab = ids[0];
    applyView();
  }
  function ensureBuilt(t) {
    if (t.built) return; t.built = true;
    try { if (t.def.build) t.def.build(t.panel); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } t.panel.appendChild(h('p', { class: 'note warn' }, bi('تعذّر بناء هذه اللوحة.', 'This panel could not be built.'))); }
  }
  function setView(v) { S.view = v; applyView(); }
  // single source of truth: which panel is visible (wide: the active tab; narrow: the view)
  function applyView() {
    var m = $('#main'); if (!m || !U.tablist) return;
    var narrow = CR.isNarrow(), ids = tabIds(); if (!narrow && S.view !== 'map') S.view = 'map';
    if (narrow && S.view !== 'map' && S.view !== 'queue' && !UI.tabEls[S.view]) S.view = 'map';
    var vis = narrow ? (UI.tabEls[S.view] ? S.view : null) : (UI.tabEls[S.tab] ? S.tab : null);
    m.setAttribute('data-view', S.view); m.setAttribute('data-tab', S.tab || '');
    ids.forEach(function (id) {
      var t = UI.tabEls[id], on = id === vis, sel = id === S.tab;
      t.panel.hidden = !on; setA(t.btn, 'aria-selected', String(sel)); setA(t.btn, 'tabindex', sel ? '0' : '-1'); t.btn.classList.toggle('on', sel);
      if (narrow && S.view === id) t.bar.setAttribute('aria-current', 'true'); else t.bar.removeAttribute('aria-current'); t.bar.classList.toggle('on', narrow && S.view === id);
      if (on) ensureBuilt(t);
    });
    $$('.cr-tb[data-fixed]').forEach(function (b) { var on = narrow && S.view === b.getAttribute('data-view'); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); b.classList.toggle('on', on); });
    if (vis !== U.visTab) {
      var old = U.visTab && UI.tabEls[U.visTab]; if (old && old.built && old.def.active) { try { old.def.active(false); } catch (e) { /* ignore */ } }
      U.visTab = vis; var nw = vis && UI.tabEls[vis]; if (nw && nw.built && nw.def.active) { try { nw.def.active(true); } catch (e) { /* ignore */ } } if (nw && nw.built && nw.def.update) { try { nw.def.update(); } catch (e) { /* ignore */ } }
    }
  }
  CR.showTab = function (id, o) {
    o = o || {};
    if (id === 'map' || id === 'queue') { S.view = CR.isNarrow() ? id : 'map'; applyView(); if (id === 'queue' && !CR.isNarrow() && o.focus !== false && U.list) { var c = U.cards[S.sel] ? U.cards[S.sel].r.sel : $('.cr-ac-sel', U.list); if (c) c.focus(); } CR.emit('view', { view: S.view, tab: S.tab }); return id; }
    var t = UI.tabEls[id]; if (!t) return null;
    S.tab = id; S.view = CR.isNarrow() ? id : 'map'; applyView(); CR.emit('view', { view: S.view, tab: S.tab });
    CR.live(B('اللوحة: ', 'Panel: ') + labelOf(t.def));
    if (o.focus) t.btn.focus();
    return id;
  };
  function renderTabs() {
    var ids = tabIds(), narrow = CR.isNarrow();
    ids.forEach(function (id) {
      var t = UI.tabEls[id], b = null; if (t.def.badge) { try { b = t.def.badge(); } catch (e) { b = null; } }
      var txt = b == null || b === 0 || b === '' ? '' : String(b); if (t.nb.hidden !== (txt === '')) { t.nb.hidden = txt === ''; t.bb.hidden = txt === ''; } setT(t.nb, txt); setT(t.bb, txt);
      var vis = narrow ? S.view === id : S.tab === id;
      if (vis && t.built && t.def.update) { try { t.def.update(); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } } }
    });
    var st = $('.cr-sheet-tt'), cur = UI.tabEls[narrow ? S.view : S.tab]; if (st && cur) setT(st, labelOf(cur.def));
    var qb = $('.cr-tb[data-view="queue"] .cr-tb-n'); if (qb) { var n = S.alerts.filter(function (a) { return !CR.isFinal(a); }).length; qb.hidden = !n; setT(qb, n ? String(n) : ''); }
  }
  function buildTabbar() {
    var bar = $('#cr-tabbar'); if (!bar) return; lab(bar, 'aria-label', 'اللوحات', 'Panels');
    var map = h('button', { type: 'button', class: 'cr-tb', 'data-view': 'map', 'data-fixed': '1', onclick: function () { CR.showTab('map'); } }, icon('globe'), h('span', { class: 'cr-tb-t' }, bi('الخريطة', 'Map')));
    var qb = h('button', { type: 'button', class: 'cr-tb', 'data-view': 'queue', 'data-fixed': '1', onclick: function () { CR.showTab('queue'); } }, icon('bell'), h('span', { class: 'cr-tb-t' }, bi('الإنذارات', 'Alerts')), h('span', { class: 'cr-tb-n mono', hidden: true }));
    bar.append(map, qb);
  }

  /* ====================================================================================
   * 8. TIMELINE OF THE DAY
   * ==================================================================================== */
  var TL = {};
  function buildTimeline() {
    var el = $('#cr-timeline'); if (!el) return; lab(el, 'aria-label', 'خط الزمن لليوم', 'Timeline of the day');
    TL.status = h('span', { class: 'cr-tl-status' }, ''); TL.day = h('span', { class: 'cr-tl-day' }, '');
    var key = function (k, ar, en) { return h('li', null, h('i', { class: 'cr-tl-m', 'data-k': k }), bi(ar, en)); };
    TL.legend = h('ul', { class: 'cr-tl-lg' }, key('alert', 'إنذار', 'Alert'), key('approve', 'اعتماد', 'Approved'), key('dispatch', 'إرسال', 'Dispatched'), key('onscene', 'في الموقع', 'On scene'), key('resolve', 'مُغلق', 'Closed'), key('fault', 'عطل', 'Fault'));
    TL.head = h('div', { class: 'cr-tl-h' }, h('b', { class: 'cr-tl-t' }, icon('clock'), bi('خط الزمن', 'Timeline')), TL.day, CR.simTag(), TL.legend, TL.status);
    TL.past = h('i', { class: 'cr-tl-past' }); TL.now = h('i', { class: 'cr-tl-now' }); TL.marks = h('div', { class: 'cr-tl-marks', 'aria-hidden': 'true' });
    TL.track = h('div', { class: 'cr-tl-track', onclick: tlClick }, TL.past, TL.marks, TL.now);
    TL.track.setAttribute('role', 'presentation');
    var ticks = h('div', { class: 'cr-tl-ticks', 'aria-hidden': 'true' }); for (var hr = 0; hr <= 24; hr += 3) ticks.appendChild(h('span', { class: 'cr-tl-tick', style: '--p:' + (hr / 24 * 100) + '%' }, h('em', { class: 'mono', dir: 'ltr' }, pad2(hr % 24 === 0 && hr ? 0 : hr) + ':00')));
    TL.sum = h('p', { class: 'sr-only' }, '');
    el.append(TL.head, h('div', { class: 'cr-tl-wrap' }, TL.track, ticks), TL.sum);
  }
  function tlFrac(e) { var r = TL.track.getBoundingClientRect(), x = (e.clientX - r.left) / Math.max(1, r.width); return html.dir === 'rtl' ? 1 - x : x; }
  function tlClick(e) {
    if (!S.snap) return; var f = clamp(tlFrac(e), 0, 1), day = Math.floor(S.snap.t / 86400) * 86400, t = day + f * 86400, r = TL.track.getBoundingClientRect(), best = null, bd = 1e9;
    TL.marks.querySelectorAll('.cr-tl-m').forEach(function (m) { var mr = m.getBoundingClientRect(), d = Math.abs((mr.left + mr.width / 2) - e.clientX); if (d < bd) { bd = d; best = m; } });
    if (best && bd < 11 && best.getAttribute('data-alert')) { CR.selectAlert(best.getAttribute('data-alert')); return; }
    if (t > S.snap.t + 5) { CR.api.seekTo(t); return; }
    CR.toast({ ar: 'الساعة المحاكاة لا تعود إلى الوراء — انقر على المستقبل للتقديم، أو «إعادة الضبط» للبدء من جديد', en: 'The simulated clock cannot run backwards — click the future to fast-forward, or Reset to start again' }, '', 3600);
  }
  function renderTimeline(force) {
    var s = S.snap; if (!s || !TL.track) return;
    var t = CR.now(); if (!force && t - U.lastTl < 450) return; U.lastTl = t;
    if (U.t0 == null) U.t0 = s.t;
    var day = Math.floor(s.t / 86400) * 86400, p = function (x) { return clamp((x - day) / 864, 0, 100); };
    var a0 = p(U.t0), a1 = p(s.t); TL.now.style.setProperty('--p', a1 + '%'); TL.past.style.setProperty('--a', a0 + '%'); TL.past.style.setProperty('--w', Math.max(0, a1 - a0) + '%');
    setT(TL.day, nm(s.dowName) + ' ' + s.date);
    var marks = [];
    S.alerts.forEach(function (a) {
      if (a.t >= day && a.t < day + 86400) marks.push({ k: 'alert', t: a.t, a: a.id, tip: B('إنذار ', 'Alert ') + a.id + ' · ' + CR.hzName(a.hazard) });
      var ts = a.tState || {};
      if (isNum(ts.APPROVED)) marks.push({ k: 'approve', t: ts.APPROVED, a: a.id, tip: B('اعتماد ', 'Approved ') + a.id }); if (isNum(ts.DISPATCHED)) marks.push({ k: 'dispatch', t: ts.DISPATCHED, a: a.id, tip: B('أُرسلت وحدات ', 'Units dispatched ') + a.id });
      if (isNum(ts['ON-SCENE'])) marks.push({ k: 'onscene', t: ts['ON-SCENE'], a: a.id, tip: B('في الموقع ', 'On scene ') + a.id }); if (isNum(ts.RESOLVED)) marks.push({ k: 'resolve', t: ts.RESOLVED, a: a.id, tip: B('أُغلق ', 'Closed ') + a.id }); else if (isNum(ts.DISMISSED)) marks.push({ k: 'resolve', t: ts.DISMISSED, a: a.id, tip: B('رُفض ', 'Dismissed ') + a.id });
    });
    (s.events || []).forEach(function (e) { if (e.type === 'drone-fault') marks.push({ k: 'fault', t: e.t, a: e.alert || '', tip: nm(e.text) }); });
    marks = marks.filter(function (m) { return m.t >= day && m.t < day + 86400; });
    var sig = marks.length + ':' + marks.map(function (m) { return m.k + Math.round(m.t); }).join(',') + ':' + CR.lang();
    if (sig !== U.tlSig || force) {
      U.tlSig = sig; TL.marks.replaceChildren();
      marks.forEach(function (m) { var el = h('i', { class: 'cr-tl-m', 'data-k': m.k, title: m.tip + ' · ' + CR.hms(m.t) }); if (m.a) el.setAttribute('data-alert', m.a); el.style.setProperty('--p', p(m.t) + '%'); TL.marks.appendChild(el); });
      setT(TL.sum, B('خط الزمن: ', 'Timeline: ') + N(marks.length) + B(' حدثًا اليوم، الساعة الآن ', ' events today, now ') + s.clock.slice(0, 5));
    }
    var st = S.seek ? B('تقديم سريع إلى ', 'Fast-forwarding to ') + CR.hms(S.seek).slice(0, 5) + '…' : '';
    setT(TL.status, st); TL.status.hidden = !st;
  }
  function renderFoot() { if (U.footSnap && S.snap) setT(U.footSnap, S.snap.snapshotDate || ''); }

  /* ====================================================================================
   * 9. FOOT (honest labels) + HELP + SHORTCUTS
   * ==================================================================================== */
  function buildFoot() {
    var f = $('#cr-foot'); if (!f) return; f.setAttribute('role', 'note'); lab(f, 'aria-label', 'تنبيهات الصدق والمصادر', 'Honesty notes and credits');
    U.footSnap = h('span', { class: 'mono', dir: 'ltr' }, '');
    var osm = function () { return ['Contains data © ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap contributors'), ', ODbL 1.0']; };
    U.foot = h('details', { class: 'cr-foot-d' },
      h('summary', { class: 'cr-foot-s' }, icon('info'), h('span', null, bi('مفهوم + نموذج أولي محاكى (SIM) · 999 يبقى هو المُرسِل · ', 'Concept + simulated prototype (SIM) · 999 stays the dispatcher · '), osm())),
      h('p', { class: 'cr-foot-p' }, bi('كل ما يتحرك هنا (المسيّرات والوحدات والازدحام والحوادث) محاكاة وليس بيانات حية. الكاشف رؤية حاسوبية بقواعد. منارة ليست خدمة رسمية ولا تتصل بأي نظام حقيقي. الخريطة لقطة محلية من OpenStreetMap (ليست حية): ', 'Everything that moves here (drones, units, traffic, incidents) is simulated, not live data. The detector is rule-based computer vision. MANARA is not an official service and is not connected to any real system. The map is a local snapshot of OpenStreetMap (not live): '), bi('لقطة ', 'snapshot '), U.footSnap, ' · data/CREDITS.txt'));
    f.appendChild(U.foot);
  }
  UI.openHelp = function () {
    var sev = Object.keys(SEV).map(function (k) { return h('li', null, h('span', { class: 'cr-lvl', 'data-n': SEV[k].n, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', null, bi(SEV[k].ar, SEV[k].en))); });
    var srcs = SRC_ORDER.map(function (s) { var d = CR.SRC[s]; return h('li', null, h('span', { class: 'tag ' + d.cls }, icon(d.icon), h('span', null, bi(d.ar, d.en)))); });
    var hzs = CR.HZ_ORDER.map(function (hz) { return h('li', null, h('span', { class: 'cr-ico cr-ico-s', 'data-hz': hz }, icon(CR.HZ[hz].icon)), h('span', null, CR.hzName0({ hazard: hz }, CR.lang()))); });
    var sec = function (ar, en, kids, open) { var d = h('details', { class: 'cr-help-s' }, h('summary', null, bi(ar, en)), h('div', { class: 'cr-help-b' }, kids)); if (open) d.open = true; return d; };
    var body = h('div', { class: 'cr-dlg-body cr-help' },
      sec('ماذا ترى غرفة التحكم؟', 'What does the control room see?', [para('طابور إنذارات مرتّب بالأولوية (مسيّرة، حسّاس، مواطن، مشغّل)، وخريطة قطر الحقيقية من OpenStreetMap عليها المسيّرات والوحدات والحوادث، وجدار بثّ المسيّرات (عادي وحراري ودمج)، ولوحة الأسطول، وخطة الإرسال الأسرع بحسب الازدحام، وروبوت الإنقاذ، وسجل الاتصالات، وملخّص التسليم. المسيّرات ترفع الإنذار إلى هنا؛ أنت تتحقق وتقرّر.',
        'A priority-sorted alert queue (drone, sentinel, citizen, operator); the real map of Qatar from OpenStreetMap with drones, units and incidents; the drone feed wall (normal, thermal, fused); the fleet board; the fastest-by-traffic dispatch plan; the rescue robot; the comms log; and the shift handover. Drones raise alerts to this room; you verify and decide.')], true),
      sec('كيف يمرّ الإنذار؟ (الإثبات قبل الذعر)', 'How an alert flows (proof before panic)', [h('ol', { class: 'cr-help-ol' }, h('li', null, bi('المفتاح ١: كاشف (رؤية حاسوبية بقواعد، وليست تعلّمًا آليًا) أو حسّاس أو بلاغ مواطن.', 'Key 1: a detector (rule-based computer vision, not machine learning), a sensor or a citizen report.')), h('li', null, bi('المفتاح ٢: دليل مستقل ثانٍ، مثل الكاميرا الحرارية أو حسّاس آخر. مفتاحان = «مؤكَّد». مفتاح واحد = «مشتبه به: يحتاج إثباتًا» وتُطلَق مسيّرة للتحقق.', 'Key 2: a second, independent proof, such as the thermal camera or another sensor. Two keys = “confirmed”. One key = “suspect: needs proof” and a drone is launched to verify.')), h('li', null, bi('المفتاح ٣: أنت. الإنذار العام للهواتف وإرسال الوحدات الأرضية لا يحدثان إلا بعد اعتمادك. صافرة الموقع المحلية لا تنتظر.', 'Key 3: you. The public alert to phones and the dispatch of ground units happen only after you approve. The local siren never waits.')))]),
      sec('الأدوار (محاكاة)', 'Roles (simulated)', [para('مشاهد: يرى فقط. مشغّل: يعتمد ويرفض ويصعّد ويطلق المسيّرات وينشئ إنذارات تجريبية ويبثّ. قائد الحادث: كل ما سبق ويُشغّل الروبوت. هذه تسميات محاكاة بلا تسجيل دخول حقيقي؛ ومحاولة غير مسموحة تُرفض بسبب واضح وتُسجَّل.', 'Viewer: watch only. Operator: approve, dismiss, escalate, launch drones, raise test alarms and announce. Incident commander: all of that and deploys the robot. These are simulated labels with no real login; a forbidden attempt is refused with a clear reason and logged.')]),
      sec('دليل الرموز', 'Legend', [h('div', { class: 'cr-help-lg' }, h('div', null, h('b', null, bi('الخطورة', 'Severity')), h('ul', null, sev), para('اللون وحده ليس الإشارة: مع كل مستوى رمز وكلمة وعدد أعمدة.', 'Colour is never the only signal: every level also has an icon, a word and a count of bars.', 'cr-help-sm')), h('div', null, h('b', null, bi('المصدر', 'Source')), h('ul', null, srcs)), h('div', null, h('b', null, bi('الخطر', 'Hazard')), h('ul', null, hzs))),
        para('شارة SIM تعني أن الرقم محاكى: المسيّرات والوحدات والازدحام والحوادث والأعمار والأوقات المقدّرة. لا شيء هنا بيانات حية.', 'The SIM badge means the number is simulated: drones, units, traffic, incidents, ages and ETAs. Nothing here is live data.')]),
      sec('الصدق والحدود', 'Honesty and limits', [para('مفهوم + نموذج أولي محاكى. لم تُطِر أي مسيّرة حقيقية ولم يُجرَّب أي روبوت في حريق ولم توافق أي جهة. الرقم 999 يبقى هو المُرسِل ومنارة ليست خدمة رسمية ولا تتصل بأي نظام حقيقي. الخريطة: Contains data © OpenStreetMap contributors, ODbL 1.0 — لقطة محلية، وليست خريطة حية.', 'Concept + simulated prototype. No real drone has been flown, no robot has been tried in a fire and no authority has approved it. 999 stays the dispatcher; MANARA is not an official service and is not connected to any real system. Map: Contains data © OpenStreetMap contributors, ODbL 1.0 — a local snapshot, not a live map.')]));
    openDialog({ id: 'cr-dlg-help', title: ['مساعدة ودليل رموز غرفة التحكم', 'Control room help and legend'], body: body, actions: [{ ar: 'اختصارات لوحة المفاتيح', en: 'Keyboard shortcuts', icon: 'keyboard', onclick: function () { setTimeout(UI.openShortcuts, 0); } }, { ar: 'تم', en: 'Done', cls: 'btn-primary', autofocus: true }] });
  };
  UI.openShortcuts = function () {
    // each row: the keys (a separator is plain text, a key is <kbd>), the Arabic meaning, the English meaning
    var rows = [[['J', '/', 'K'], 'التالي / السابق في الطابور', 'Next / previous alert in the queue'], [['A'], 'اعتماد الإنذار المحدد (المفتاح البشري)', 'Approve the selected alert (the human key)'], [['D'], 'رفض الإنذار المحدد', 'Dismiss the selected alert'], [['E'], 'تصعيد الإنذار المحدد', 'Escalate the selected alert'],
      [['1', '–', '6'], 'اللوحات: بثّ، أسطول، إرسال، روبوت، اتصالات، تسليم', 'Panels: feed, fleet, dispatch, robot, comms, handover'], [['W'], 'وضع الجدار (شاشة كبيرة)', 'Wall mode (big screen)'], [['Space'], 'تشغيل / إيقاف المحاكاة مؤقتًا', 'Play / pause the simulation'], [['?'], 'هذه النافذة', 'This window'], [['Esc'], 'إغلاق النافذة أو القائمة أو اللوحة', 'Close the dialog, menu or panel'],
      [['+', '/', '−', '/', '0', '/', '←', '↑', '→', '↓'], 'على الخريطة: تقريب وتبعيد وعرض كامل وتحريك', 'On the map: zoom in, zoom out, fit, pan']];
    var keycell = function (ks) { return ks.map(function (k, i) { return k === '/' || k === '–' ? h('span', { class: 'cr-key-sep', text: ' ' + k + ' ' }) : kbd(k); }); };
    var t = h('table', { class: 'cr-keytab' }, h('caption', { class: 'sr-only' }, bi('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')), h('tbody', null, rows.map(function (r) { return h('tr', null, h('th', { scope: 'row' }, keycell(r[0])), h('td', null, bi(r[1], r[2]))); })));
    openDialog({ id: 'cr-dlg-keys', title: ['اختصارات لوحة المفاتيح', 'Keyboard shortcuts'], body: h('div', { class: 'cr-dlg-body' }, t, para('تعمل الاختصارات بحسب موضع المفتاح على لوحة المفاتيح، فتصلح مع التخطيط العربي أيضًا.', 'Shortcuts follow the physical key position, so they also work with an Arabic keyboard layout.', 'cr-help-sm')), actions: [{ ar: 'تم', en: 'Done', cls: 'btn-primary', autofocus: true }] });
  };

  /* ====================================================================================
   * 10. WALL MODE, SOUND, KEYBOARD, LAYOUT
   * ==================================================================================== */
  UI.setWall = function (on) {
    on = !!on; if (UI.wall === on) return; UI.wall = on; S.wall = on; html.classList.toggle('cr-wall', on); var m = $('#main'); if (m) m.setAttribute('data-wall', on ? '1' : '0');
    popClose(false); moreSet(false); if (on) { if (UI.tabEls.feed) CR.showTab('feed'); else applyView(); if (CR.isNarrow()) { S.view = 'map'; applyView(); } } else applyView();
    syncTop(); CR.live(on ? B('وضع الجدار: شاشة كبيرة. اضغط Esc للخروج', 'Wall mode: big screen. Press Esc to leave') : B('خرجت من وضع الجدار', 'Left wall mode'));
    setTimeout(function () { CR.resizeMap(); }, 60); CR.emit('wall', on); S.dirtyUI = true;
  };
  function layoutOf() { var w = html.clientWidth; return w >= 1400 ? 'wide' : w >= 1100 ? 'medium' : 'narrow'; }
  function applyLayout() {
    var m = $('#main'); if (!m) return; var l = layoutOf();
    if (l !== U.layout) { U.layout = l; m.setAttribute('data-layout', l); if (l !== 'narrow') S.view = 'map'; else if (S.view !== 'queue' && !UI.tabEls[S.view]) S.view = 'map'; applyView(); moreSet(false); popClose(false); CR.emit('layout', l); }
    m.setAttribute('data-phone', html.clientWidth < 700 ? '1' : '0');
  }
  var rzT = 0; win.addEventListener('resize', function () { cancelAnimationFrame(rzT); rzT = requestAnimationFrame(applyLayout); });
  function typing(t) { return t && (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  doc.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, code = e.code, k = e.key;
    if (e.key === 'Escape') {
      if (U.dlg) return;                                                                 // the dialog handles its own Esc
      if (U.pop) { popClose(true); e.preventDefault(); return; }
      var tools = $('#cr-tools'); if (tools && tools.classList.contains('open')) { moreSet(false); $('#cr-more').focus(); e.preventDefault(); return; }
      if (UI.wall) { UI.setWall(false); e.preventDefault(); return; }
      if (CR.isNarrow() && S.view !== 'map') { CR.showTab('map'); e.preventDefault(); } return;
    }
    if (U.dlg || typing(t)) return;
    if ((code === 'Slash' && e.shiftKey) || k === '?' || k === '؟') { UI.openShortcuts(); e.preventDefault(); return; }
    var inCtl = t && t !== doc.body && t.closest && t.closest('button, a[href], summary, [role=radio], [role=tab], [role=menuitem], input, select');
    if (code === 'Space') { if (inCtl && t.tagName !== 'CANVAS') return; e.preventDefault(); CR.api.setPlaying(!S.playing); return; }
    if (e.shiftKey) return;
    if (code === 'KeyJ') { cycle(1); e.preventDefault(); } else if (code === 'KeyK') { cycle(-1); e.preventDefault(); }
    else if (code === 'KeyA') { UI.approve(); e.preventDefault(); } else if (code === 'KeyD') { UI.dismiss(); e.preventDefault(); } else if (code === 'KeyE') { UI.escalate(); e.preventDefault(); }
    else if (code === 'KeyW') { UI.setWall(!UI.wall); e.preventDefault(); }
    else if (/^Digit[1-6]$/.test(code) || /^Numpad[1-6]$/.test(code)) { var ids = tabIds(), id = ids[+code.slice(-1) - 1]; if (id) { CR.showTab(id, { focus: false }); e.preventDefault(); } }
  });
  function cycle(dir) {
    var ids = U.order.filter(function (id) { var a = CR.alertOf(id); return a && !CR.isFinal(a); }); if (!ids.length) { CR.live(B('لا إنذارات مفتوحة', 'No open alerts')); return; }
    var ix = ids.indexOf(S.sel), nx = ids[ix < 0 ? (dir > 0 ? 0 : ids.length - 1) : (ix + dir + ids.length) % ids.length];
    CR.selectAlert(nx); markSelected(true);
  }
  UI.cycle = cycle;
  UI.hintAction = function (id, action) { U.hint = id ? { id: id, action: action || 'approve' } : null; renderQueue(true); };
  UI.setDemo = function (on) { var m = $('#main'); if (m) m.setAttribute('data-demo', on ? '1' : '0'); setTimeout(function () { CR.resizeMap(); }, 60); };

  /* ====================================================================================
   * 11. WIRING
   * ==================================================================================== */
  function renderAll(force) {
    syncClock(); renderKpis(); renderQueue(force); renderHud(); renderTimeline(force); renderTabs(); renderFoot();
  }
  UI.render = renderAll;
  function tick() { if (!UI.built) return; renderAll(false); }
  function safe(fn, what) { try { fn(); } catch (e) { try { console.error('control-ui: ' + what, e); } catch (e2) { /* ignore */ } } }
  function init() {
    if (UI.built || S.failed) return;
    safe(buildTop, 'top bar'); safe(buildKpis, 'kpis'); safe(buildQueue, 'queue'); safe(buildHud, 'hud'); safe(buildRight, 'tabs'); safe(buildTabbar, 'tabbar'); safe(buildTimeline, 'timeline'); safe(buildFoot, 'foot');
    UI.built = true;
    CR.tabs.forEach(addTab); sheetSize('half'); applyLayout(); if (!UI.tabEls[S.tab]) { var ids = tabIds(); if (ids.length) S.tab = ids[0]; } applyView();
    CR.relabel(); syncTop(); renderAll(true);
    html.setAttribute('data-cr-ui', '1');
  }
  var origReg = CR.registerTab; CR.registerTab = function (def) { var r = origReg.call(CR, def); if (UI.built) addTab(def); return r; };
  CR.on('tick', tick);
  CR.on('select', function () { markSelected(true); renderQueue(true); renderHud(); });
  CR.on('role', function () { syncTop(); renderQueue(true); });
  CR.on('speed', syncTop); CR.on('sound', syncTop); CR.on('autopilot', syncTop);
  CR.on('lang', function () { syncTop(); refreshChips(); setTool(S.tool); U.tlSig = ''; renderAll(true); });
  CR.on('theme', syncTop);
  CR.on('reset', function () { if (UI.built) UI.syncHud(); U.t0 = null; U.tlSig = ''; U.newIds = {}; U.seeded = false; Object.keys(U.cards).forEach(function (id) { U.cards[id].el.remove(); }); U.cards = {}; U.order = []; U.hint = null; });
  CR.on('ready', function () { if (!UI.built) init(); renderAll(true); });
  CR.on('confirm-approve', function () { renderQueue(true); });
  CR.on('seek-done', function () { renderTimeline(true); });
  CR.on('alert-new', function (a) { U.newIds[a.id] = CR.now(); });
  CR.on('banner', function () { renderHud(); });
  CR.on('view', function () { renderTabs(); });
  CR.on('wall', function () { syncTop(); });
  if (S.booted) init(); else CR.hooks.init.push(init);                                  // control.js has already booted when this file runs after it (readyState 'interactive'): build the shell now
})();
