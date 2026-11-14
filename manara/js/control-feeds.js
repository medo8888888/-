/* MANARA («منارة») — CONTROL ROOM · the FEED WALL («جدار البث»)  →  ControlRoom.mods.feeds                                (js/control-feeds.js)
 * =====================================================================================================================
 * User requirement (verbatim): "what doe sthe contol room see and there is more featutres you can do i want the actulla and landing page the dornes will alert us and there will be robot".
 * The drones alert the control room, and the control room LOOKS: a wall of camera pictures, one per drone that has an open alert (plus the patrol drones), each with the detectors' boxes, the key labels (colour key / thermal
 * key) with confidence bars, a telemetry HUD, the evidence frames from the moment of detection and the buttons an operator needs: announce through the drone speaker, snapshot, record a clip, recall / launch a drone.
 *
 * WHAT IS REAL AND WHAT IS SIMULATED (say it on screen)
 *   SIMULATED (SIM badge on every tile): the PICTURE.  No drone has flown: ManaraDroneScene DRAWS what a drone camera would see from the descriptor the engine puts in the alert (`frame`; patrol / transit pictures are
 *   generated from the drone's position), and the REAL rule-based detectors run on it (ManaraFire colour + flicker on the colour image, the contextual hotspot test on the thermal field).  Rule-based computer vision, never "AI".
 *   REAL (red "REAL CAMERA — not simulated" tile, no SIM badge): the optional LIVE SOURCE — your webcam (getUserMedia), a local video or photo, or one of the bundled sample photos — run through the REAL ManaraFire detector.
 *   Its honest number (js/detect.js, the Evidence Lab): 66.7 % on held-out still photos (12 of 18): every fire photo found, but 3 of 12 fire-free photos raised a false alarm and the smoke in 3 of 3 smoke photos was missed.
 *   Nothing leaves the page: snapshots are PNG downloads built from the canvas, clips are MediaRecorder blobs, no upload, no network.
 *
 * WHAT THE OPERATOR GETS
 *   WALL      1 / 2 / 4 feeds (auto picks by the count), click a picture to focus it (the others become chips), colour / thermal / fused picture, only visible tiles are drawn, one analysis per animation frame at most (budgeted),
 *             pictures freeze to a slow refresh under prefers-reduced-motion, nothing runs while the tab is inactive (active(false)) and a camera stream is released after 30 s away.
 *   CONSOLE   for the selected feed: the detector's keys on THIS picture, the keys RECORDED in the alert (sensor / colour / thermal, the drone's verdict), the EVIDENCE strip (frames the engine stored at sighting and verification,
 *             frames the wall itself captured the moment its detector flagged something, operator snapshots), snapshot / record / recall / launch, and "announce through the drone speaker" (bilingual presets, only on station).
 *   ROLES     the buttons call the Control Room actions (CR.announceVia, CR.recallDrone, CR.launchDrone): the simulated role gate answers visibly (toast, voice, log) when the role is too low; a lock mark shows it in advance.
 *   BUS       an announcement is also published as { type:'drone-announce', scope:'national', drone, callsign, key, lang, text:{ar,en}, alert, incident, clock, sim:true } (logged in the comms tab; the phones ignore it).
 *
 * MOTION    (all of it transform / opacity / canvas, nothing heavier; every flash is slower than 3 Hz; prefers-reduced-motion = static frames; nothing runs while the tab is inactive or the page is hidden, because frame() is not called)
 *             a tile SWEEPS IN with a scan line and lock-on corner brackets when its drone is assigned, the detector boxes EASE to their new place and the fire / hotspot boxes PULSE (1.4 Hz), the telemetry HUD TICKS (the numbers
 *             run to their new value), the signal bars and the battery gauge animate, a new detection flashes an ALERT frame (3 flashes at 1.7 Hz), new evidence frames slide in.
 *
 * CONTRACT  CR.registerTab({ id:'feed', build(el), update(), frame(ts), active(on) }); CR.mods.feeds = the test / automation API at the bottom of this file.   Classic script, no fetch, no libraries, never innerHTML.
 * ===================================================================================================================== */
(function () {
  'use strict';
  var win = window, doc = document, CR = win.ControlRoom;
  if (!CR || !CR.registerTab || (CR.mods && CR.mods.feeds)) return;
  var h = CR.h, bi = CR.bi, lab = CR.lab, B = CR.B, N = CR.N, nm = CR.nm, setT = CR.setT, setA = CR.setA, clamp = CR.clamp, now = CR.now, rgba = CR.rgba, C = CR.C, S = CR.S, icon = CR.icon;
  var DS = null, NN = null, FIRE = null;
  var TAB = 'feed';

  // icons the console needs on top of the shared set (static 24 px stroke paths)
  var XI = CR.XICON;
  XI.expand = XI.expand || '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  XI.shrink = XI.shrink || '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>';
  XI.video = XI.video || '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>';
  XI.image = XI.image || '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>';
  XI.down = XI.down || '<path d="M12 5v14M5 12l7 7 7-7"/>';

  /* ====================================================================================
   * 1. VOCABULARY
   * ==================================================================================== */
  var HELD = { n: 18, ok: 12, acc: '66.7', fireFound: '6/6', falseFire: '3/12', smokeFound: '0/3' };           // js/detect.js HELD_REF: the honest number for photos the detector was never tuned on
  var KIND_COLOR = { fire: '#ff4d1f', smoke: '#cfd3d8', hotspot: '#ffd23f', 'hot-object': '#ffa31a', person: '#3ee6a8', 'cold-plume': '#4cc2ff' };
  var VERDICT = { fire: ['حريق', 'FIRE'], smoke: ['دخان', 'SMOKE'], suspect: ['اشتباه', 'SUSPECT'], clear: ['سليم', 'CLEAR'] };
  var GUESS = { gas: ['غاز (مرشَّح)', 'Gas (candidate)'], flood: ['سيول', 'Flood'], dust: ['غبار', 'Dust'], sos: ['شخص', 'Person'], fire: ['نار', 'Fire'] };
  var THKIND = { hotspot: ['بؤرة حرارية', 'Hotspot'], 'hot-object': ['جسم ساخن', 'Hot object'], 'cold-plume': ['سحابة باردة', 'Cold plume'], people: ['أشخاص', 'People'], none: ['لا شيء', 'Nothing'], 'cold-candidate': ['مرشَّح بارد', 'Cold candidate'] };
  var REASON = { colour: ['لون ناري', 'fire colour'], flicker: ['وميض لهب', 'flame flicker'], growth: ['منطقة تتّسع', 'growing area'], static: ['ثابت (جسم لا لهب)', 'static (an object, not a flame)'], moving: ['منزلق', 'sliding'], 'smoke-motion': ['حركة دخان', 'smoke motion'], 'camera-motion': ['حركة الكاميرا', 'camera motion'] };
  var SAY = ['identify', 'follow-light', 'move-away', 'shelter', 'crosswind', 'flood', 'stay-put'];           // the nat.drone.say.* keys (the AED message is an authority-only step, not a preset here)
  var SAY_FOR = { fire: ['move-away', 'follow-light', 'identify'], gas: ['crosswind', 'shelter', 'identify'], flood: ['flood', 'stay-put', 'identify'], dust: ['shelter', 'stay-put', 'identify'], heat: ['identify', 'stay-put', 'shelter'], sos: ['stay-put', 'identify', 'follow-light'] };
  var KEEP_CAM_MS = 30000, REC_MAX_MS = 30000, SIZE_W = 320, SIZE_H = 240;

  /* ====================================================================================
   * 2. STATE
   * ==================================================================================== */
  var F = { root: null, ui: {}, active: null, built: false, lastFrame: 0, paintAt: 0, layout: 'auto', view: 'rgb', focusId: null, pinId: null, feeds: [], byId: {}, shown: [], dirty: true, sel: null, selKey: '', say: SAY[2], sayLog: [], busy: {}, ev: {}, io: null, ro: null, lastStepMs: 12,
    steps: 0, lastStepAt: 0, frames: 0, tabAt: 0, enters: 0, flashes: 0, animTs: 0, snapKey: '', cams: 0, lastSnapshot: null, rec: null, evBuild: 0, liveSince: 0 };
  var L = { src: 'none', name: '', status: 'idle', err: '', stream: null, video: null, img: null, url: null, det: null, res: null, still: null, since: 0, frames: 0, sample: null, samples: null, samplesLoading: false, camOffAt: 0, f: null };
  try { var lay = CR.storeGet('cr-feeds-layout'); if (lay === 'auto' || lay === '1' || lay === '2' || lay === '4') F.layout = lay; var vw = CR.storeGet('cr-feeds-view'); if (vw === 'rgb' || vw === 'thermal' || vw === 'fused') F.view = vw; } catch (e) { /* storage blocked */ }

  function isOn() { return F.active == null ? S.tab === TAB : !!F.active; }
  function hashStr(s) { var x = 2166136261, i; s = String(s); for (i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function ltr(t) { return '\u2066' + t + '\u2069'; }                          // an LTR isolate: "553 °C" or "82%" after Arabic letters would otherwise be reordered by the bidi algorithm
  function pct(v) { return ltr(N(Math.round(clamp(v || 0, 0, 1) * 100)) + '%'); }
  function clock24(d) { return CR.hms(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()); }
  function cls(el, c, on) { if (el) el.classList.toggle(c, !!on); }
  function nmAr(a) { return a ? (CR.lang() === 'en' ? a[1] : a[0]) : ''; }
  function eachFeed(fn) { Object.keys(F.byId).forEach(function (k) { fn(F.byId[k]); }); }
  function gated(min) { return CR.can ? !CR.can(min) : false; }
  function flash(el, c) { if (!el || CR.reduced()) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); }

  /* ====================================================================================
   * 3. WHICH PICTURES THE WALL SHOWS: drones with an open alert, the selected drone, the patrol drones, the live source
   * ==================================================================================== */
  function airborne(r) { return r.state !== 'docked' && r.state !== 'charging' && r.state !== 'fault'; }
  var STW = { verifying: 0, 'on-station': 0.05, launching: 0.4, 'en-route': 0.3, returning: 0.6, patrol: 0.7 };
  function collect() {
    var s = S.snap, out = [], seen = {}, byId = {}, sel = CR.selectedAlert();
    if (!s) return out;
    s.drones.forEach(function (r) { byId[r.id] = r; });
    function add(r, a, kind, rank) { if (!r || seen[r.id] || !airborne(r)) return; seen[r.id] = 1; out.push({ id: r.id, row: r, alert: a || null, kind: kind, rank: rank + (STW[r.state] || 0) }); }
    S.alerts.forEach(function (a) {
      if (CR.isFinal(a)) return;
      var r = a.droneId ? byId[a.droneId] : null, i;
      if (!r) for (i = 0; i < s.drones.length; i++) if (s.drones[i].alert === a.id) { r = s.drones[i]; break; }
      if (r) add(r, a, 'alert', (sel && sel.id === a.id ? 0 : 10) + (100 - (a.priority || 0)) / 100);
    });
    if (S.selDrone && byId[S.selDrone]) { var sa = byId[S.selDrone].alert ? CR.alertOf(byId[S.selDrone].alert) : null; add(byId[S.selDrone], sa && !CR.isFinal(sa) ? sa : null, sa && !CR.isFinal(sa) ? 'alert' : 'patrol', 5); }
    s.drones.forEach(function (r, i) { if (r.state === 'patrol') add(r, null, 'patrol', 50 + i / 100); });
    s.drones.forEach(function (r, i) { add(r, null, 'patrol', 60 + i / 100); });                          // returning / en route to a sector: still a camera
    out.sort(function (a, b) { return a.rank - b.rank; });
    return out.slice(0, 16);
  }
  function newFeed(id) {
    return { id: id, kind: 'patrol', row: null, alert: null, rank: 99, cell: null, dkey: '', scene: null, an: null, clock: 0.5, tms: 0, lastTs: 0, lastStep: -1e9, period: 200, res: null, verdict: 'clear', conf: 0, guess: '', vis: true, hold: 0, ovKey: '', steps: 0, stepMs: 12,
      ovW: 320, ovH: 240, ariaAt: 0, ariaTx: '', thc: null, evSeen: '', flat: null };
  }
  function refresh() {
    var want = collect(), ids = {};
    if (L.src !== 'none') want.push({ id: 'live', row: null, alert: null, kind: 'live', rank: F.liveSince && now() - F.liveSince < 2500 ? -0.5 : 2.5 });
    want.forEach(function (w) { ids[w.id] = 1; var f = F.byId[w.id] || (F.byId[w.id] = newFeed(w.id)); f.kind = w.kind; f.row = w.row; f.alert = w.alert; f.rank = w.rank; f.want = w; });
    Object.keys(F.byId).forEach(function (id) { if (!ids[id]) dropFeed(id); });
    if (F.pinId && !ids[F.pinId]) F.pinId = null;
    if (F.focusId && !ids[F.focusId]) F.focusId = null;
    F.feeds = want.map(function (w) { return F.byId[w.id]; });
    F.feeds.sort(function (a, b) { return rankOf(a) - rankOf(b); });
    F.dirty = true;
  }
  function rankOf(f) { return f.id === F.focusId ? -3 : f.id === F.pinId ? -2 : f.rank; }
  function dropFeed(id) {
    var f = F.byId[id]; if (!f) return;
    if (F.rec && F.rec.id === id) stopRec();
    if (f.cell && f.cell.el.parentNode) f.cell.el.remove();
    if (F.io && f.cell) F.io.unobserve(f.cell.el); if (F.ro && f.cell) F.ro.unobserve(f.cell.vid);
    delete F.byId[id];
  }
  function layoutN() {
    var nf = F.feeds.length; if (F.focusId && F.byId[F.focusId]) return 1;
    var narrow = F.root && F.root.clientWidth > 0 && F.root.clientWidth < 400, want = F.layout === 'auto' ? (narrow ? 1 : nf >= 3 ? 4 : nf) : +F.layout;     // a phone-wide panel: auto shows one picture and the others as chips
    return Math.max(0, Math.min(want, nf));
  }

  /* ====================================================================================
   * 4. WHAT EACH CAMERA SEES: a descriptor (the alert's own `frame`, or a generated transit picture), the scene, the analyzers
   * ==================================================================================== */
  var CTXS = ['urban', 'industrial', 'desert', 'coast', 'road'], KIND_OF = { fire: 'fire', gas: 'gas', flood: 'flood', dust: 'dust', heat: 'heat', sos: 'sos' };
  function transitDesc(f) {                               // a camera on the move or on patrol: a hazard-free scene made from where the drone is (re-made only when the position cell or the heading sector changes)
    var r = f.row, dr = S.drones[f.id], hd = dr ? dr.hd : r.headingDeg, lon = dr ? dr.lon : r.lon, lat = dr ? dr.lat : r.lat, env = null, hq = (Math.round(hd / 30) * 30) % 360, alt = Math.max(40, Math.round((r.altM || 80) / 10) * 10);
    try { env = NN.droneEnv(S.nat, lon, lat); } catch (e) { env = null; }
    var seed = (hashStr(f.id) ^ Math.imul(Math.floor(lon * 40), 104729) ^ Math.imul(Math.floor(lat * 40), 15485863)) >>> 0, ctx = env && env.context ? env.context : CTXS[seed % 5];
    var d = DS.preset('clear', seed, { timeOfDay: S.snap ? S.snap.hour : 11, context: ctx, camera: { altM: alt, headingDeg: hq, pitchDeg: 60 }, windMps: env ? env.wind.mps : 5 });
    if (env) { d.ambientC = env.tempC; d.groundC = env.groundC; d.solar = env.solar; d.visFactor = env.visFactor; d.wind = { deg: env.wind.deg, mps: env.wind.mps }; }
    return { desc: d, key: ['T', seed, hq, alt, ctx].join(':') };
  }
  function stationDesc(f) {                               // on station but the engine's verification frame does not exist yet: the claimed hazard over the target (the camera sees what is there)
    var a = f.alert, r = f.row, dr = S.drones[f.id], hd = dr ? dr.hd : r.headingDeg, hq = (Math.round(hd / 15) * 15) % 360, kind = KIND_OF[a.hazard] || 'clear', seed = hashStr(a.id);
    var d = DS.preset(kind, seed, { timeOfDay: S.snap ? S.snap.hour : 11, camera: { altM: Math.max(40, r.altM || 80), headingDeg: hq, pitchDeg: 58 } });
    return { desc: d, key: ['S', a.id, kind, hq].join(':') };
  }
  function descFor(f) {
    var a = f.alert, st = f.row.state;
    if (a && (st === 'on-station' || st === 'verifying')) {
      if (a.frame) return { desc: a.frame, key: ['A', a.id, a.frame.sceneSeed, a.frame.t0, a.frame.view].join(':') };
      return stationDesc(f);
    }
    return transitDesc(f);
  }
  function fuse(rgb, th, groundC) {                       // the colour picture with the thermal anomalies blended in (the same rule as ManaraDroneScene.renderFused, on frames already rendered)
    var d = new Uint8ClampedArray(rgb.data), W = rgb.width, H = rgb.height, tw = th.tw, T0 = th.temps, thr = groundC + 14, IR = DS.ironPalette, x, y, tv, a, v, p, rg = th.range.hi - th.range.lo || 1;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      tv = T0[Math.min(th.th - 1, y >> 1) * tw + Math.min(tw - 1, x >> 1)]; if (tv < thr) continue;
      a = clamp((tv - thr) / 60, 0, 0.7); v = IR[clamp(Math.round((tv - th.range.lo) / rg * 255), 0, 255)]; p = (y * W + x) << 2;
      d[p] = d[p] * (1 - a) + v[0] * a; d[p + 1] = d[p + 1] * (1 - a) + v[1] * a; d[p + 2] = d[p + 2] * (1 - a) + v[2] * a;
    }
    return d;
  }
  function tmpCanvas(w, hh) { var c = F.tmp || (F.tmp = doc.createElement('canvas')); if (c.width !== w) c.width = w; if (c.height !== hh) c.height = hh; return c; }
  function paintPixels(f, rgb, th) {                      // colour / thermal / fused onto the 320 × 240 canvas
    var cv = f.cell.cv, x = f.cell.cx, v = F.view, W = rgb.width, H = rgb.height;
    if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
    if (v === 'rgb' || !th) { x.putImageData(new ImageData(rgb.data, W, H), 0, 0); return; }
    if (v === 'fused') { x.putImageData(new ImageData(fuse(rgb, th, f.scene.o ? f.scene.o.groundC : 30), W, H), 0, 0); return; }
    var t = tmpCanvas(th.width, th.height); t.getContext('2d').putImageData(new ImageData(th.data instanceof Uint8ClampedArray ? th.data : new Uint8ClampedArray(th.data), th.width, th.height), 0, 0);
    x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, W, H);
  }
  function verdictOf(res, hyp) {
    var st = res.state, g = res.hazardGuess;
    if (g === 'sos' && hyp !== 'sos' && hyp !== 'heat') g = 'none';                  // a person on the thermal image is an emergency only for "someone needs help" / heat: a bystander is not an alarm
    if (st === 'fire') return { v: 'fire', conf: res.confidence, guess: 'fire' };
    if (g && g !== 'none') return { v: 'suspect', conf: res.confidence, guess: g };
    if (st === 'smoke') return { v: 'smoke', conf: res.vision.confidence, guess: 'fire' };
    if (st === 'suspect') return { v: 'suspect', conf: res.vision.confidence, guess: '' };
    return { v: 'clear', conf: 0, guess: '' };
  }
  function stepFeed(f, ts) {
    var t0 = now(), d = descFor(f), reduced = CR.reduced(), n = reduced ? 9 : 1, i, rgb = null, th = null, res = null, hyp = f.alert ? f.alert.hazard : null;
    if (f.dkey !== d.key) {                               // a new picture: build the scene and start the temporal detector again (this step builds only, the next draws)
      f.scene = DS.create(d.desc); f.an = DS.createAnalyzer({}); f.dkey = d.key; f.clock = 0.5; f.tms = 0; f.lastTs = ts; f.verdict = 'clear'; f.res = null; f.hold = 0;
      if (now() - t0 > 14 && !reduced) { f.lastStep = now(); return; }
    }
    var dt = f.lastTs ? clamp((ts - f.lastTs) / 1000, 0, 0.5) : 0.1; f.lastTs = ts;
    if (!reduced) { f.clock += dt; }
    for (i = 0; i < n; i++) {
      var tt = f.clock + i * 0.1; f.tms = Math.max(f.tms + 1, Math.round(tt * 1000));
      rgb = f.scene.renderRGB(tt); th = f.scene.renderThermal(tt);
      res = f.an.push(rgb, th, f.tms, { lang: CR.lang(), hypothesis: hyp === 'fire' || hyp === 'gas' || hyp === 'sos' || hyp === 'heat' || hyp === 'flood' || hyp === 'dust' ? hyp : null });
    }
    if (reduced) f.clock += n * 0.1 + 3;
    paintPixels(f, rgb, th);
    f.res = res; f.hyp = hyp; var vd = verdictOf(res, hyp), was = f.verdict; f.verdict = vd.v; f.conf = vd.conf; f.guess = vd.guess;
    setTargets(f); drawOv(f);
    if (vd.v !== 'clear' && (was === 'clear' || (vd.v === 'fire' && was !== 'fire'))) alertFlash(f);
    if (f.alert && vd.v !== 'clear' && (was === 'clear' || (vd.v === 'fire' && was !== 'fire'))) captureEvidence(f, vd.v === 'fire' ? 'detected' : 'flagged');
    if (vd.v === 'fire' && was !== 'fire') CR.live(B('البثّ ', 'Feed ') + f.row.callsign + B(': الكاشف يرى حريقاً (بقواعد)', ': the detector sees fire (rule-based)'));
    if (F.rec && F.rec.id === f.id) recFrame(f);
    f.steps++; F.steps++; F.lastStepAt = now(); f.lastStep = F.lastStepAt; f.stepMs = f.stepMs * 0.8 + (F.lastStepAt - t0) * 0.2; F.lastStepMs = F.lastStepMs * 0.8 + (F.lastStepAt - t0) / n * 0.2;
  }

  /* ---- the overlay: detector boxes, thermal polygons, the hotspot crosshair (normalised 0..1, drawn at display resolution on its own canvas; shared with snapshots and clips) ---- */
  function boxLabel(b) { var l = DS.LABEL[b.kind]; return (l ? nm(l) : b.kind) + (b.label && /°C/.test(b.label) ? ' ' + b.label.replace(/^.*?(-?[\d.]+ °C)$/, '$1') : ''); }
  function drawBoxes(x, ov, w, hh, o) {
    o = o || {};
    var boxes = ov.boxes || [], polys = ov.polygons || [], ch = ov.crosshair, i, j, b, c, fs = clamp(w / 30, 10, 13), pu = o.pulse || 0, lw = Math.max(1.5, w / 220);
    x.save(); x.lineWidth = lw; x.lineJoin = 'round'; x.font = '700 ' + fs + 'px ' + CR.font(); x.textBaseline = 'top'; x.direction = 'ltr';
    for (i = 0; i < polys.length; i++) {
      var pg = polys[i]; if (!pg.points || pg.points.length < 3) continue;
      x.strokeStyle = KIND_COLOR[pg.kind] || '#fff'; x.globalAlpha = 0.85; x.beginPath(); x.moveTo(pg.points[0][0] * w, pg.points[0][1] * hh);
      for (j = 1; j < pg.points.length; j++) x.lineTo(pg.points[j][0] * w, pg.points[j][1] * hh);
      x.closePath(); x.stroke(); x.globalAlpha = 1;
    }
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i]; c = KIND_COLOR[b.kind] || '#fff'; x.strokeStyle = c; x.setLineDash(b.source === 'thermal' ? [5, 3] : []);
      var hot = pu && (b.kind === 'fire' || b.kind === 'hotspot' || b.kind === 'hot-object'); if (hot) { x.lineWidth = lw * (1 + 0.7 * pu); x.globalAlpha = 0.7 + 0.3 * pu; }       // a fire box breathes
      x.strokeRect(b.x * w, b.y * hh, b.w * w, b.h * hh); x.setLineDash([]); if (hot) { x.lineWidth = lw; x.globalAlpha = 1; }
      if (b.kind !== 'person' || boxes.length < 6) {
        var tx = boxLabel(b), tw = x.measureText(tx).width + 8, lx = clamp(b.x * w, 2, w - tw - 2), ly = b.y * hh - fs - 6; if (ly < 2) ly = Math.min(hh - fs - 4, (b.y + b.h) * hh + 2);
        x.fillStyle = 'rgba(8,12,18,.78)'; x.fillRect(lx, ly, tw, fs + 4); x.fillStyle = c; x.textAlign = 'left'; x.fillText(tx, lx + 4, ly + 2);
      }
    }
    if (ch) {
      var cx = ch.x * w, cy = ch.y * hh, r = Math.max(9, w / 26);
      x.strokeStyle = '#ffffff'; x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx - r / 3, cy); x.moveTo(cx + r / 3, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy - r / 3); x.moveTo(cx, cy + r / 3); x.lineTo(cx, cy + r); x.stroke();
      x.beginPath(); x.arc(cx, cy, r * 0.62 * (1 + 0.2 * pu), 0, 6.2832); x.stroke(); var tt = ch.tC + ' °C', tw2 = x.measureText(tt).width + 8; x.fillStyle = 'rgba(8,12,18,.78)'; x.fillRect(cx + r + 1, cy - r / 2 - 2, tw2, fs + 4); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(tt, cx + r + 5, cy - r / 2);
    }
    x.restore();
  }
  function drawOv(f, pulse) {
    var c = f.cell; if (!c || !c.ov) return;
    var dpr = Math.min(2, win.devicePixelRatio || 1), w = Math.max(40, f.ovW), hh = Math.max(30, f.ovH), pw = Math.round(w * dpr), ph = Math.round(hh * dpr);
    if (c.ov.width !== pw || c.ov.height !== ph) { c.ov.width = pw; c.ov.height = ph; }
    var x = c.ovx || (c.ovx = c.ov.getContext('2d')); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hh);
    if (!f.res || !f.res.overlays) return;
    var ov = f.res.overlays;
    if (!CR.reduced() && f.abx) ov = { polygons: ov.polygons, crosshair: f.ach || ov.crosshair, boxes: f.abx.map(function (b) { return { kind: b.kind, source: b.source, label: b.label, x: b.c.x, y: b.c.y, w: b.c.w, h: b.c.h }; }) };
    drawBoxes(x, ov, w, hh, { pulse: CR.reduced() ? 0 : (pulse == null ? 0.5 : pulse) });
  }
  // the detector's new boxes become TARGETS: every drawn box eases to its target (a new box grows from its centre) — the analysis runs a few times a second, the eye sees a smooth motion
  function setTargets(f) {
    var ov = f.res && f.res.overlays, tg = ov ? ov.boxes : [], old = f.abx || [], used = {}, next = [];
    tg.forEach(function (b) {
      var best = -1, bd = 0.25;
      old.forEach(function (o, i) { if (used[i] || o.kind !== b.kind || o.source !== b.source) return; var d = Math.hypot(o.t.x + o.t.w / 2 - (b.x + b.w / 2), o.t.y + o.t.h / 2 - (b.y + b.h / 2)); if (d < bd) { bd = d; best = i; } });
      var nb = { kind: b.kind, source: b.source, label: b.label, t: { x: b.x, y: b.y, w: b.w, h: b.h } };
      if (best >= 0) { used[best] = 1; nb.c = { x: old[best].c.x, y: old[best].c.y, w: old[best].c.w, h: old[best].c.h }; }
      else nb.c = CR.reduced() ? { x: b.x, y: b.y, w: b.w, h: b.h } : { x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0 };
      next.push(nb);
    });
    f.abx = next;
    var ch = ov ? ov.crosshair : null;
    if (!ch) f.ach = null; else if (!f.ach || CR.reduced()) f.ach = { x: ch.x, y: ch.y, tC: ch.tC, kind: ch.kind, tx: ch.x, ty: ch.y }; else { f.ach.tx = ch.x; f.ach.ty = ch.y; f.ach.tC = ch.tC; }
  }
  var TKF = { alt: function (v) { return N(v) + ' ' + B('م', 'm'); }, spd: function (v) { return N(v, 0) + ' ' + B('م/ث', 'm/s'); }, bat: function (v) { return ltr(N(v) + '%'); }, link: function (v) { return ltr(N(v) + '%'); } };
  function tkSet(f, key, tgt, angle) {                    // a HUD number: the displayed value runs to the target (a ticker); under reduced motion it jumps
    var t = f.tk || (f.tk = {}), k = t[key] || (t[key] = { cur: tgt, tgt: tgt, shown: null, angle: !!angle });
    k.tgt = tgt; if (CR.reduced()) k.cur = tgt; tkShow(f, key);
  }
  function tkShow(f, key) {
    var k = f.tk[key], el = f.cell && f.cell.t[key] ? f.cell.t[key].v : null; if (!el) return;
    var v = k.angle ? ((Math.round(k.cur) % 360) + 360) % 360 : Math.round(k.cur);
    if (k.shown === v) return; k.shown = v;
    if (k.angle) { var cp = NN ? NN.compass(v) : null; setT(el, ltr(N(v, 0) + '° ' + (cp ? cp.key : ''))); } else setT(el, TKF[key](v));
  }
  function tkEase(f, dt) {
    var kk = 1 - Math.exp(-dt * 4.5);
    Object.keys(f.tk || {}).forEach(function (key) {
      var k = f.tk[key], d = k.tgt - k.cur; if (k.angle) d = ((d + 540) % 360) - 180;
      if (Math.abs(d) < 0.04) { if (k.cur !== k.tgt) { k.cur = k.tgt; tkShow(f, key); } return; }
      k.cur += d * kk; tkShow(f, key);
    });
  }
  function animate(ts) {                                  // one animation frame of the wall: boxes ease and pulse, HUD numbers tick (only the tiles that are on screen)
    var dt = F.animTs ? clamp((ts - F.animTs) / 1000, 0, 0.1) : 0; F.animTs = ts;
    if (CR.reduced()) return;
    var pulse = 0.5 + 0.5 * Math.sin(ts / 1000 * 8.8), k = 1 - Math.exp(-dt * 14);
    F.shown.forEach(function (f) {
      if (!f.cell || f.vis === false) return;
      (f.abx || []).forEach(function (b) { b.c.x += (b.t.x - b.c.x) * k; b.c.y += (b.t.y - b.c.y) * k; b.c.w += (b.t.w - b.c.w) * k; b.c.h += (b.t.h - b.c.h) * k; });
      if (f.ach) { f.ach.x += (f.ach.tx - f.ach.x) * k; f.ach.y += (f.ach.ty - f.ach.y) * k; }
      tkEase(f, dt);
      if (f.res && ((f.abx && f.abx.length) || f.ach)) drawOv(f, pulse);
    });
  }
  // the tile sweeps in with a scan line and lock-on corners; a new detection flashes the ALERT frame (3 flashes at 1.7 Hz, never faster than 3 Hz). Both are CSS animations on opacity / transform, skipped under reduced motion.
  function enterTile(f) {
    var c = f.cell; if (!c || CR.reduced()) return;
    F.enters++; c.el.removeAttribute('data-enter'); void c.el.offsetWidth; c.el.setAttribute('data-enter', '1'); clearTimeout(c.enterT); c.enterT = setTimeout(function () { c.el.removeAttribute('data-enter'); }, 1500);
  }
  function alertFlash(f) {
    var c = f.cell; if (!c || CR.reduced()) return;
    F.flashes++; c.el.removeAttribute('data-flash'); void c.el.offsetWidth; c.el.setAttribute('data-flash', '1'); clearTimeout(c.flashT); c.flashT = setTimeout(function () { c.el.removeAttribute('data-flash'); }, 2000);
  }

  /* ---- the evidence strip: frames at the moment of detection ---- */
  function thumb(src, w, hh) {
    var c = doc.createElement('canvas'), x; c.width = w; c.height = hh; x = c.getContext('2d');
    if (src.getContext) x.drawImage(src, 0, 0, w, hh);
    else { var t = tmpCanvas(src.width, src.height); t.getContext('2d').putImageData(new ImageData(src.data instanceof Uint8ClampedArray ? src.data : new Uint8ClampedArray(src.data), src.width, src.height), 0, 0); x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, w, hh); }
    return c;
  }
  function evOf(id) { return F.ev[id] || (F.ev[id] = { items: [], seen: {}, v: 0 }); }
  function evPush(id, it) { var e = evOf(id); e.items.push(it); if (e.items.length > 10) e.items.shift(); e.v++; }
  function captureEvidence(f, how, extra) {               // the wall's own capture: the picture as the detector flagged it (boxes burned in)
    if (!f.alert || !f.cell) return;
    var c = thumb(f.cell.cv, 160, 120), x = c.getContext('2d'); if (f.res && f.res.overlays) drawBoxes(x, f.res.overlays, 160, 120);
    var s = S.snap, lbl = how === 'detected' ? [B('الكاشف رأى حريقاً', 'Detector saw fire')] : how === 'snapshot' ? [B('لقطة المشغّل', 'Operator snapshot')] : [B('الكاشف علّم المشهد', 'Detector flagged it')];
    evPush(f.alert.id, { id: 'cap' + (++F.evBuild), kind: how, cv: c, clock: s ? s.clock : '', cap: lbl[0], sub: nm(VERDICT[f.verdict] ? { ar: VERDICT[f.verdict][0], en: VERDICT[f.verdict][1] } : null) + ' ' + pct(f.conf), by: f.row ? f.row.callsign : '' });
  }
  function engineEvidence(a) {                            // the frames the ENGINE stored in the drone alerts of this alert (sighting, verification): at most one scene is built per call
    var s = S.snap; if (!a || !s || !s.droneAlerts || !DS) return;
    var e = evOf(a.id), i;
    for (i = 0; i < s.droneAlerts.length; i++) {
      var da = s.droneAlerts[i]; if (da.alert !== a.id || e.seen[da.id] || !da.frame) continue;
      e.seen[da.id] = 1;
      try {
        var sc = DS.create(da.frame), rgb = sc.renderRGB(1.4), th = sc.renderThermal(1.4), ev = da.evidence || {}, stage = da.stage === 'sighting' ? B('رصد', 'Sighting') : B('تحقق', 'Verification');
        var vis = ev.vision ? (ev.vision.seen ? nm(ev.vision.label) + ' ' + pct(ev.vision.conf) : B('لا شيء', 'nothing')) : B('بانتظار التحقق', 'pending'), tk = ev.thermal ? (ev.thermal.seen ? nmAr(THKIND[ev.thermal.kind]) + ' ' + pct(ev.thermal.conf) : (ev.thermal.pending ? B('بانتظار التحقق', 'pending') : B('لا شيء', 'nothing'))) : '–';
        evPush(a.id, { id: da.id + 'c', kind: 'engine', cv: thumb(rgb, 160, 120), clock: da.clock, cap: stage + ' · ' + B('اللون', 'colour'), sub: vis, by: da.callsign });
        evPush(a.id, { id: da.id + 't', kind: 'engine', cv: thumb(th, 160, 120), clock: da.clock, cap: stage + ' · ' + B('حراري', 'thermal'), sub: tk, by: da.callsign });
      } catch (err) { /* a descriptor the scene cannot draw: skip it, never break the wall */ }
      return;
    }
  }

  /* ====================================================================================
   * 5. THE LIVE SOURCE: your webcam, a local video or photo, a bundled sample photo — the REAL ManaraFire on REAL pixels
   * ==================================================================================== */
  function liveDrop() { if (L.f) { L.f = null; } }
  function liveStop(keepFeed) {
    try { if (L.stream) L.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
    try { if (L.video) { L.video.pause(); L.video.removeAttribute('src'); L.video.srcObject = null; L.video.load(); } } catch (e2) { /* ignore */ }
    if (L.url) { try { URL.revokeObjectURL(L.url); } catch (e3) { /* ignore */ } L.url = null; }
    L.stream = null; L.video = null; L.img = null; L.det = null; L.res = null; L.still = null; L.sample = null; L.camOffAt = 0;
    L.src = 'none'; L.status = 'idle'; L.name = ''; L.err = '';
    if (!keepFeed) { dropFeed('live'); refresh(); F.dirty = true; }
    paintLiveUI();
  }
  function liveBegin(src, name) {
    if (L.src !== 'none') liveStop(true);
    L.src = src; L.name = name; L.status = 'running'; L.err = ''; L.det = FIRE ? FIRE.createDetector({}) : null; L.res = null; L.still = null; L.frames = 0; L.since = now(); if (F.byId.live) { F.byId.live.lastStep = -1e9; F.byId.live.res = null; F.byId.live.verdict = 'clear'; } F.liveSince = now(); F.focusId = null; F.pinId = 'live'; F.scrollLive = true;
    refresh(); F.dirty = true; paintLiveUI();
  }
  function liveCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { L.err = 'unavailable'; paintLiveUI(); return Promise.resolve({ ok: false, reason: 'unavailable' }); }
    L.status = 'asking'; paintLiveUI();
    return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }).then(function (stream) {
      var v = h('video', { muted: true, playsinline: true, autoplay: true }); v.muted = true; v.playsInline = true; v.srcObject = stream;
      liveBegin('camera', B('كاميرا الحاسوب', 'This device\'s camera')); L.stream = stream; L.video = v;
      var p = v.play(); if (p && p.catch) p.catch(function () { /* autoplay refused: the first frame still arrives */ });
      F.cams++; return { ok: true };
    }).catch(function (e) {
      var n = e && e.name; L.status = 'idle'; L.err = (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') ? 'denied' : (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') ? 'none' : 'error'; paintLiveUI();
      return { ok: false, reason: L.err };
    });
  }
  function liveImage(url, name, src, revoke) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { liveBegin(src, name); L.img = im; L.url = revoke ? url : null; resolve({ ok: true }); };
      im.onerror = function () { if (revoke) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } } L.err = 'error'; L.status = 'idle'; paintLiveUI(); resolve({ ok: false, reason: 'error' }); };
      im.src = url;
    });
  }
  function liveFile(file) {
    if (!file) return Promise.resolve({ ok: false, reason: 'none' });
    var url = URL.createObjectURL(file), name = String(file.name || 'file').slice(0, 40);
    if (/^image\//.test(file.type)) return liveImage(url, name, 'photo', true);
    return new Promise(function (resolve) {
      var v = h('video', { muted: true, playsinline: true, loop: true }); v.muted = true; v.loop = true; v.playsInline = true;
      v.onloadeddata = function () { liveBegin('video', name); L.video = v; L.url = url; var p = v.play(); if (p && p.catch) p.catch(function () { /* ignore */ }); resolve({ ok: true }); };
      v.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } L.err = 'error'; L.status = 'idle'; paintLiveUI(); resolve({ ok: false, reason: 'error' }); };
      v.src = url;
    });
  }
  function loadSamples(cb) {                              // 16 real photos (320 px data URIs, so the canvas stays readable on file://) are loaded only when the operator opens the live panel
    if (win.MANARA_SAMPLES && win.MANARA_SAMPLE_DATA) { L.samples = win.MANARA_SAMPLES; return cb(true); }
    if (L.samplesLoading) return;
    L.samplesLoading = true; var n = 0, ok = true;
    ['assets/samples/samples.js', 'assets/samples/samples-data.js'].forEach(function (src) {
      var s = doc.createElement('script'); s.src = src;
      s.onload = function () { if (++n === 2) { L.samplesLoading = false; L.samples = win.MANARA_SAMPLES || null; cb(ok && !!win.MANARA_SAMPLE_DATA); } };
      s.onerror = function () { ok = false; if (++n === 2) { L.samplesLoading = false; cb(false); } };
      doc.head.appendChild(s);
    });
  }
  function liveSample(file) {
    return new Promise(function (resolve) {
      loadSamples(function (ok) {
        var data = ok && win.MANARA_SAMPLE_DATA ? win.MANARA_SAMPLE_DATA[file] : null;
        if (!data) { L.err = 'error'; paintLiveUI(); return resolve({ ok: false, reason: 'no-sample' }); }
        var meta = (win.MANARA_SAMPLES || []).filter(function (s) { return s.file === file; })[0] || null;
        liveImage(data, file, 'sample', false).then(function (r) { L.sample = meta; paintLiveUI(); resolve(r); });
      });
    });
  }
  function stepLive(f, ts) {                              // draw the source onto the tile's canvas, take its pixels, run ManaraFire
    var src = L.video || L.img, cv = f.cell.cv, x = f.cell.cx, t0 = now();
    if (!src || !FIRE) return;
    var sw = L.video ? L.video.videoWidth : L.img.naturalWidth, sh = L.video ? L.video.videoHeight : L.img.naturalHeight;
    if (!sw || !sh || (L.video && L.video.readyState < 2)) { f.lastStep = now(); return; }
    var w = Math.min(SIZE_W, sw), hh = Math.max(1, Math.round(sh * w / sw));
    if (cv.width !== w) cv.width = w; if (cv.height !== hh) cv.height = hh;
    x.imageSmoothingEnabled = true; x.drawImage(src, 0, 0, w, hh);
    var frame; try { frame = x.getImageData(0, 0, w, hh); } catch (e) { L.err = 'tainted'; L.status = 'error'; paintLiveUI(); f.lastStep = now(); return; }
    var res;
    if (L.img) {                                          // a still picture: one frame = the single-image score, and 'suspect' at most (flames are proven by flicker, not by colour)
      if (L.still && L.still.n === L.frames) { f.lastStep = now() + 600000; return; }
      var sc = FIRE.scoreImage({ data: frame.data, width: w, height: hh }, {});
      L.still = { n: L.frames + 1, label: sc.label, fire: sc.fire, smoke: sc.smoke, score: sc.score, regions: sc.analysis.regions, fireRatio: sc.analysis.fireRatio };
      res = { state: sc.label === 'none' ? 'clear' : 'suspect', kind: sc.label, confidence: sc.score, fireRatio: sc.analysis.fireRatio, flicker: 0, reasons: sc.label === 'none' ? [] : ['colour', 'static'], regions: sc.analysis.regions, still: true };
    } else {
      var r = L.det.push({ data: frame.data, width: w, height: hh }, Math.round(ts));
      res = { state: r.state, kind: r.state, confidence: r.confidence, fireRatio: r.frame.fireRatio, flicker: r.flicker, growth: r.growth, reasons: r.reasons, regions: r.frame.regions, still: false };
    }
    L.frames++; L.res = res; var wasL = f.verdict; f.res = { overlays: { boxes: res.regions.map(function (g) { return { kind: g.kind, x: g.x / w, y: g.y / hh, w: g.w / w, h: g.h / hh, label: '' }; }), polygons: [], crosshair: null } };
    var was = f.verdict; f.verdict = res.state === 'clear' ? 'clear' : res.state; f.conf = res.confidence; f.guess = '';
    setTargets(f); drawOv(f); if (f.verdict !== 'clear' && was === 'clear') alertFlash(f);
    if (was !== f.verdict && f.verdict === 'fire') CR.live(B('الكاميرا الحقيقية: الكاشف يرى حريقاً (بقواعد، ليس ذكاءً اصطناعياً)', 'Real camera: the detector sees fire (rule-based, not AI)'));
    if (F.rec && F.rec.id === 'live') recFrame(f);
    f.steps++; F.steps++; F.lastStepAt = now(); f.lastStep = F.lastStepAt; f.stepMs = f.stepMs * 0.8 + (F.lastStepAt - t0) * 0.2;
  }

  /* ====================================================================================
   * 6. SNAPSHOT (PNG download) AND CLIP (MediaRecorder): both built from the canvases on this page, nothing is uploaded
   * ==================================================================================== */
  function compose(f, c, w) {                              // picture + boxes + a caption bar that says what the picture is
    var hh = Math.round(w * f.cell.cv.height / f.cell.cv.width), cap = 26, x; c.width = w; c.height = hh + cap; x = c.getContext('2d');
    x.fillStyle = '#0a0e15'; x.fillRect(0, 0, w, hh + cap); x.imageSmoothingEnabled = f.kind === 'live'; x.drawImage(f.cell.cv, 0, 0, w, hh);
    if (f.res && f.res.overlays) drawBoxes(x, f.res.overlays, w, hh);
    var live = f.kind === 'live', s = S.snap, who = live ? L.name : (f.row ? f.row.callsign : '') + (f.alert ? ' · ' + f.alert.id : ''), when = live ? clock24(new Date()) : (s ? s.clock : '');
    x.fillStyle = live ? '#b3261e' : '#1c2635'; x.fillRect(0, hh, w, cap); x.fillStyle = '#fff'; x.font = '700 12px ' + CR.font(); x.textBaseline = 'middle'; x.direction = CR.lang() === 'ar' ? 'rtl' : 'ltr'; x.textAlign = CR.lang() === 'ar' ? 'right' : 'left';
    x.fillText('MANARA · ' + who + ' · ' + when + ' · ' + (live ? B('كاميرا حقيقية — غير محاكاة', 'REAL CAMERA — not simulated') : B('صورة محاكاة (SIM) — مولَّدة بالشيفرة', 'SIMULATED picture (SIM) — computer-generated')), CR.lang() === 'ar' ? w - 8 : 8, hh + cap / 2 + 1);
    return c;
  }
  function download(blob, name) {
    try { var a = h('a', { href: URL.createObjectURL(blob), download: name }); doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600); return true; } catch (e) { return false; }
  }
  function stamp() { var s = S.snap; return (s && s.clock ? s.clock.replace(/:/g, '') : String(Date.now()).slice(-6)); }
  function snapshotFeed(id) {
    var f = F.byId[id || (selFeed() && selFeed().id)];
    if (!f || !f.cell || !f.res) { CR.toast({ ar: 'لا توجد صورة بعد للالتقاط', en: 'There is no picture to capture yet' }, 'warn'); return Promise.resolve({ ok: false, reason: 'no-picture' }); }
    var c = compose(f, doc.createElement('canvas'), 640);
    return new Promise(function (resolve) {
      c.toBlob(function (blob) {
        if (!blob) { CR.toast({ ar: 'تعذّر إنشاء اللقطة', en: 'Could not build the snapshot' }, 'warn'); return resolve({ ok: false, reason: 'blob' }); }
        var name = 'manara-' + (f.kind === 'live' ? 'live' : (f.row ? f.row.callsign : 'feed')) + '-' + stamp() + '.png', ok = download(blob, name);
        F.lastSnapshot = { name: name, bytes: blob.size, w: c.width, h: c.height, feed: f.id, at: Date.now() };
        if (f.alert) captureEvidence(f, 'snapshot');
        CR.toast({ ar: 'حُفظت اللقطة: ' + name + ' (على جهازك فقط)', en: 'Snapshot saved: ' + name + ' (on your device only)' }, 'safe', 2800); CR.live(B('حُفظت اللقطة', 'Snapshot saved'));
        F.dirty = true; resolve({ ok: ok, name: name, bytes: blob.size });
      }, 'image/png');
    });
  }
  function recSupport() { return typeof win.MediaRecorder === 'function' && !!win.HTMLCanvasElement && typeof HTMLCanvasElement.prototype.captureStream === 'function'; }
  function recFrame(f) { if (F.rec && F.rec.cv) compose(f, F.rec.cv, 480); }
  function startRec(id) {
    var f = F.byId[id || (selFeed() && selFeed().id)];
    if (!recSupport() || !f || !f.cell || !f.res) return { ok: false, reason: !recSupport() ? 'unsupported' : 'no-picture' };
    if (F.rec) stopRec();
    var cv = doc.createElement('canvas'); compose(f, cv, 480);
    var types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'], mime = '', i, mr;
    for (i = 0; i < types.length; i++) { try { if (MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; } } catch (e) { /* ignore */ } }
    try { mr = new MediaRecorder(cv.captureStream(10), mime ? { mimeType: mime, videoBitsPerSecond: 1200000 } : undefined); } catch (e2) { return { ok: false, reason: 'unsupported' }; }
    var rec = F.rec = { id: f.id, mr: mr, cv: cv, chunks: [], t0: now(), mime: mr.mimeType || mime || 'video/webm', name: f.kind === 'live' ? 'live' : f.row.callsign, timer: setTimeout(function () { stopRec(); }, REC_MAX_MS) };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
    mr.onstop = function () {
      clearTimeout(rec.timer);
      var blob = new Blob(rec.chunks, { type: rec.mime }), ext = /mp4/.test(rec.mime) ? 'mp4' : 'webm', name = 'manara-clip-' + rec.name + '-' + stamp() + '.' + ext;
      if (blob.size) { download(blob, name); F.lastClip = { name: name, bytes: blob.size, ms: Math.round(now() - rec.t0), feed: rec.id }; CR.toast({ ar: 'حُفظ المقطع: ' + name + ' (على جهازك فقط)', en: 'Clip saved: ' + name + ' (on your device only)' }, 'safe', 3200); }
      if (F.rec === rec) F.rec = null; F.dirty = true;
    };
    try { mr.start(400); } catch (e3) { F.rec = null; return { ok: false, reason: 'start' }; }
    F.dirty = true; CR.live(B('بدأ التسجيل', 'Recording started')); return { ok: true, mime: rec.mime };
  }
  function stopRec() { var r = F.rec; if (!r) return false; try { if (r.mr.state !== 'inactive') r.mr.stop(); else if (F.rec === r) F.rec = null; } catch (e) { F.rec = null; } F.dirty = true; return true; }

  /* ====================================================================================
   * 7. THE UI: toolbar, wall, tiles, chips, empty state
   * ==================================================================================== */
  function seg(arL, enL, items, get, set) {
    var wrap = h('div', { class: 'crf-seg', role: 'group' }); lab(wrap, 'aria-label', arL, enL);
    var btns = items.map(function (it) {
      var b = h('button', { type: 'button', class: 'crf-segb', 'data-v': it.v, onclick: function () { set(it.v); } }, it.ic ? icon(it.ic) : null, it.ar ? bi(it.ar, it.en) : h('span', { text: it.text }));
      if (it.tip) lab(b, 'title', it.tip[0], it.tip[1]); wrap.appendChild(b); return b;
    });
    wrap._paint = function () { var v = String(get()); btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); }); };
    return wrap;
  }
  function keyRow(arL, enL) {
    var v = h('b', { class: 'crf-kv' }), bar = h('i'), el = h('div', { class: 'crf-key', 'data-on': '0' }, h('span', { class: 'crf-kl' }, bi(arL, enL)), v, h('span', { class: 'crf-bar', 'aria-hidden': 'true' }, bar));
    return { el: el, v: v, bar: bar };
  }
  function setKey(k, on, text, conf) { setT(k.v, text); k.bar.style.setProperty('--v', Math.round(clamp(conf || 0, 0, 1) * 100) + '%'); setA(k.el, 'data-on', on ? '1' : '0'); }
  function hudItem(arL, enL, extra) { var v = h('b'); return { el: h('span', { class: 'crf-hi' }, h('i', null, bi(arL, enL)), extra || null, v), v: v }; }
  function buildCell(f) {
    var c = { f: f }, live = f.kind === 'live';
    c.call = h('b', { class: 'crf-call', translate: 'no' }); c.stx = h('span', { class: 'crf-stx' });
    c.atag = h('button', { type: 'button', class: 'tag crf-atag', hidden: true, onclick: function () { if (f.alert) CR.selectAlert(f.alert.id, { fly: false }); } });
    var tagEl = live ? h('span', { class: 'tag danger crf-real' }, bi('حقيقية', 'REAL')) : CR.simTag();
    c.head = h('header', { class: 'crf-ch' }, h('i', { class: 'crf-dot', 'aria-hidden': 'true' }), icon(live ? 'camera' : 'drone'), c.call, c.stx, h('span', { class: 'crf-sp' }), c.atag);
    c.cv = h('canvas', { class: 'crf-cv', width: SIZE_W, height: SIZE_H, role: 'img' }); c.cx = c.cv.getContext('2d');
    c.ov = h('canvas', { class: 'crf-ov', 'aria-hidden': 'true' });
    c.chip = h('span', { class: 'crf-vchip', 'data-v': 'clear' }); c.chipTx = h('b'); c.chip.appendChild(c.chipTx);
    c.view = h('span', { class: 'crf-vview' });
    c.pick = h('button', { type: 'button', class: 'crf-pick', 'aria-pressed': 'false', onclick: function () { focusFeed(f.id); } }); lab(c.pick, 'aria-label', 'تكبير هذا البث أو العودة إلى الجدار', 'Enlarge this feed or go back to the wall');
    c.gauge = h('span', { class: 'crf-batt', 'aria-hidden': 'true' }, h('i')); c.bars = h('span', { class: 'crf-sig', 'data-n': '4', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
    c.t = { alt: hudItem('ارتفاع', 'ALT'), spd: hudItem('سرعة', 'SPD'), bat: hudItem('بطارية', 'BAT', c.gauge), hdg: hudItem('اتجاه', 'HDG'), link: hudItem('اتصال', 'LINK', c.bars), time: hudItem('الوقت', 'TIME') };
    c.hud = h('div', { class: 'crf-hud' }, live ? [h('span', { class: 'crf-hi' }, h('i', null, bi('المصدر', 'SRC')), c.t.alt.v), c.t.time.el] : [c.t.alt.el, c.t.spd.el, c.t.bat.el, c.t.hdg.el, c.t.link.el, c.t.time.el]);
    c.ribbon = live ? h('div', { class: 'crf-ribbon' }, bi('كاميرا حقيقية — غير محاكاة', 'REAL CAMERA — not simulated')) : null;
    c.snapB = CR.iconBtn('camera', 'التقاط صورة PNG', 'Take a PNG snapshot', function () { snapshotFeed(f.id); }, 'crf-ib');
    c.focB = CR.iconBtn('expand', 'تكبير البث', 'Enlarge the feed', function () { focusFeed(f.id); }, 'crf-ib');
    c.scan = h('div', { class: 'crf-scan', 'aria-hidden': 'true' }); c.lockOn = h('div', { class: 'crf-lockon', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
    c.flash = h('div', { class: 'crf-flash', 'aria-hidden': 'true' }); c.alertLbl = h('span', { class: 'crf-alertlbl', 'aria-hidden': 'true' }, bi('تنبيه', 'ALERT'));
    c.vid = h('div', { class: 'crf-vid' }, c.cv, c.ov, c.scan, c.lockOn, c.flash, c.pick, h('div', { class: 'crf-vtop' }, c.chip, h('span', { class: 'crf-sp' }), c.view, tagEl, c.snapB, c.focB), c.alertLbl, c.ribbon, c.hud);
    c.k1 = keyRow('مفتاح اللون', 'Colour key'); c.k2 = keyRow('المفتاح الحراري', 'Thermal key');
    c.foot = h('footer', { class: 'crf-cf' }, h('div', { class: 'crf-keys' }, c.k1.el, c.k2.el));
    c.el = h('section', { class: 'crf-cell', 'data-kind': f.kind, 'data-state': 'clear', 'data-sel': '0', 'data-focus': '0' }, c.head, c.vid, c.foot);
    if (F.io) F.io.observe(c.el); if (F.ro) F.ro.observe(c.vid);
    c.el._feed = f; c.vid._feed = f; f.cell = c; enterTile(f);
    return c;
  }
  function chipFor(f) {
    var b = h('button', { type: 'button', class: 'crf-chipb', 'data-id': f.id, onclick: function () { F.pinId = f.id; F.focusId = null; refresh(); update(true); } });
    b._feed = f; b._ico = icon(f.kind === 'live' ? 'camera' : 'drone'); b._call = h('b', { translate: 'no' }); b._st = h('span', { class: 'small' }); b.appendChild(b._ico); b.appendChild(b._call); b.appendChild(b._st);
    return b;
  }
  function focusFeed(id) {
    var f = F.byId[id]; if (!f) return false;
    if (F.focusId === id) { F.focusId = null; F.dirty = true; update(true); return true; }
    F.focusId = id; F.pinId = null;
    if (f.alert) { selecting = true; CR.selectAlert(f.alert.id, { fly: false }); selecting = false; }
    if (f.kind !== 'live' && CR.setSelDrone) CR.setSelDrone(id);
    F.dirty = true; update(true); return true;
  }
  var selecting = false;
  function setLayout(v) { v = String(v); if (['auto', '1', '2', '4'].indexOf(v) < 0) return false; F.layout = v; F.focusId = null; CR.storeSet('cr-feeds-layout', v); F.dirty = true; update(true); return true; }
  function setView(v) { if (['rgb', 'thermal', 'fused'].indexOf(v) < 0) return false; F.view = v; CR.storeSet('cr-feeds-view', v); eachFeed(function (f) { f.lastStep = -1e9; }); F.dirty = true; update(true); return true; }

  function paintWall() {
    var U = F.ui, n = layoutN(), shown = F.feeds.slice(0, n), key = shown.map(function (f) { return f.id; }).join('|') + '#' + F.feeds.map(function (f) { return f.id; }).join('|') + '#' + (F.focusId || '');
    F.shown = shown;
    shown.forEach(function (f) { if (!f.cell) buildCell(f); });
    if (key !== F.wallKey) {
      F.wallKey = key; var ae = doc.activeElement;
      U.wall.replaceChildren.apply(U.wall, shown.map(function (f) { return f.cell.el; }));
      if (ae && ae !== doc.body && ae.isConnected && doc.activeElement !== ae) { try { ae.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }      // moving a node drops its focus: give it back
      var rest = F.feeds.slice(n, n + 10);
      U.strip.replaceChildren.apply(U.strip, rest.map(function (f) { return f.chip || (f.chip = chipFor(f)); }));
      var more = F.feeds.length - n - rest.length; setT(U.more, more > 0 ? '+' + N(more) : ''); U.more.hidden = more <= 0;
      U.strip.hidden = !rest.length && !more;
    }
    if (F.scrollLive && F.byId.live && F.byId.live.cell && F.byId.live.cell.el.isConnected) { F.scrollLive = false; try { F.byId.live.cell.el.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (e) { /* ignore */ } }      // a new real source: show its tile
    U.wall.setAttribute('data-n', String(Math.max(1, shown.length))); U.root.setAttribute('data-focus', F.focusId ? '1' : '0'); U.root.setAttribute('data-empty', shown.length ? '0' : '1');
    U.empty.hidden = !!shown.length; U.back.hidden = !F.focusId;
    var live = F.feeds.length, txt = shown.length ? N(shown.length) + B(' من ', ' of ') + N(live) + B(' بثّ', ' feed(s)') : B('لا بثّ حالياً', 'No feed right now');
    setT(U.count, txt);
    F.dirty = false;
  }
  function paintCell(f) {
    var c = f.cell; if (!c) return;
    var r = f.row, a = f.alert, live = f.kind === 'live', sel = selFeed() === f, v = f.verdict || 'clear', s = S.snap;
    setA(c.el, 'data-state', v); setA(c.el, 'data-sel', sel ? '1' : '0'); setA(c.el, 'data-focus', F.focusId === f.id ? '1' : '0'); setA(c.el, 'data-kind', f.kind);
    c.pick.setAttribute('aria-pressed', String(F.focusId === f.id)); setA(c.snapB, 'aria-disabled', f.res ? 'false' : 'true');
    var vl = VERDICT[v], gl = v === 'suspect' && f.guess && f.guess !== 'fire' && GUESS[f.guess] ? GUESS[f.guess] : vl, tx = nmAr(gl) + (v !== 'clear' ? ' ' + pct(f.conf) : '');
    setT(c.chipTx, f.res ? tx : B('جارٍ التحليل…', 'analysing…')); setA(c.chip, 'data-v', f.res ? v : 'wait');
    setT(c.view, F.view === 'rgb' ? B('عادي', 'COLOUR') : F.view === 'thermal' ? B('حراري', 'THERMAL') : B('دمج', 'FUSED'));
    if (live) {
      setT(c.call, B('مصدر حقيقي', 'Real source')); setT(c.stx, L.status === 'asking' ? B('بانتظار الإذن…', 'waiting for permission…') : L.name);
      c.atag.hidden = true; setT(c.t.alt.v, L.src === 'camera' ? B('كاميرا', 'camera') : L.src === 'video' ? B('فيديو', 'video') : L.src === 'sample' ? B('صورة نموذجية', 'sample photo') : B('صورة', 'photo')); setT(c.t.time.v, clock24(new Date()));
      var rs = L.res;
      setKey(c.k1, !!rs && rs.state !== 'clear', rs ? (rs.still ? nmAr(rs.kind === 'none' ? ['لا شيء', 'nothing'] : rs.kind === 'fire' ? ['ألوان نار', 'fire colours'] : ['ألوان دخان', 'smoke colours']) : nmAr(VERDICT[rs.state] ? VERDICT[rs.state] : VERDICT.clear)) : '…', rs ? rs.confidence : 0);
      setKey(c.k2, false, B('لا توجد كاميرا حرارية', 'no thermal camera'), 0);
    } else if (r) {
      var dr = S.drones[r.id], ar = CR.lang() === 'ar';
      setT(c.call, r.callsign); setT(c.stx, nm(r.stateText) + (r.etaSec != null && (r.state === 'en-route' || r.state === 'launching' || r.state === 'returning') ? ' · ' + CR.mmss(r.etaSec) : ''));
      c.atag.hidden = !a; if (a) { setT(c.atag, a.id); setA(c.atag, 'data-hz', a.hazard); lab(c.atag, 'title', 'اختر الإنذار ' + a.id, 'Select alert ' + a.id); }
      var cp = NN && dr ? NN.compass(dr.hd) : null;
      tkSet(f, 'alt', r.altM); tkSet(f, 'spd', r.speedMps); tkSet(f, 'bat', r.batteryPct); tkSet(f, 'hdg', dr ? dr.hd : r.headingDeg, true); tkSet(f, 'link', Math.round((r.link || 0) * 100)); setT(c.t.time.v, s ? s.clock : '');
      c.gauge.style.setProperty('--lv', String(clamp(r.batteryPct / 100, 0, 1))); setA(c.bars, 'data-n', String(Math.max(0, Math.round((r.link || 0) * 4))));
      if (f.hadAlert === undefined) f.hadAlert = a ? a.id : null; else if (a && f.hadAlert !== a.id) { f.hadAlert = a.id; enterTile(f); } else if (!a) f.hadAlert = null;      // a drone has just been assigned to an alert: the tile locks on again
      setA(c.t.bat.el, 'data-low', r.batteryPct < 25 ? '1' : '0'); setA(c.t.link.el, 'data-low', (r.link || 0) < 0.5 ? '1' : '0');
      var ev = f.res ? f.res.evidence : null;
      if (ev) {
        setKey(c.k1, ev.vision.seen, ev.vision.seen ? nm(ev.vision.label) : ev.vision.suspect ? B('لون يشبه النار فقط', 'fire-coloured only') : B('لا شيء', 'nothing'), ev.vision.confidence);
        setKey(c.k2, ev.thermal.seen, ev.thermal.seen ? nmAr(THKIND[ev.thermal.kind] || THKIND.none) + (ev.thermal.maxC != null && ev.thermal.kind !== 'people' ? ' · ' + ltr(N(ev.thermal.maxC, 0) + ' °C') : '') : (f.res.thermal && f.res.thermal.kind === 'people' ? B('أشخاص فقط', 'people only') : B('لا شيء', 'nothing')), ev.thermal.confidence);
      } else { setKey(c.k1, false, '…', 0); setKey(c.k2, false, '…', 0); }
      if (now() - f.ariaAt > 2000) { var at = B('كاميرا ', 'Camera ') + r.callsign + ': ' + (f.res ? tx : B('جارٍ التحليل', 'analysing')) + (a ? ' · ' + a.id : '') + B(' — صورة محاكاة', ' — simulated picture'); f.ariaAt = now(); if (at !== f.ariaTx) { f.ariaTx = at; c.cv.setAttribute('aria-label', at); } }
    }
    if (live && now() - f.ariaAt > 2000) { f.ariaAt = now(); c.cv.setAttribute('aria-label', B('بثّ كاميرا حقيقية — ', 'Real camera feed — ') + tx); }
    if (F.rec && F.rec.id === f.id) setA(c.el, 'data-rec', '1'); else setA(c.el, 'data-rec', '0');
  }
  function paintChips() {
    var U = F.ui; Array.prototype.forEach.call(U.strip.children, function (b) {
      var f = b._feed; if (!f) return; var v = f.verdict || 'clear';
      setT(b._call, f.kind === 'live' ? B('مصدر حقيقي', 'Real source') : f.row ? f.row.callsign : f.id); setT(b._st, f.kind === 'live' ? L.name : f.alert ? f.alert.id + ' · ' + nm(f.row.stateText) : nm(f.row.stateText)); setA(b, 'data-state', v);
    });
  }

  /* ---- the console of the selected feed ---- */
  function selFeed() {
    var inList = function (id) { return id && F.byId[id] && F.feeds.indexOf(F.byId[id]) >= 0; }, a = CR.selectedAlert();
    if (inList(F.focusId)) return F.byId[F.focusId];
    if (a && a.droneId && inList(a.droneId)) return F.byId[a.droneId];
    if (inList(S.selDrone)) return F.byId[S.selDrone];
    if (inList(F.pinId)) return F.byId[F.pinId];
    return F.shown[0] || F.feeds[0] || null;
  }
  function sayLine(m) { return m ? m[CR.lang()] || m.ar : ''; }
  function buildConsole() {
    var U = F.ui, k = {};
    k.title = h('b', { class: 'crf-ctitle', translate: 'no' }); k.sub = h('span', { class: 'crf-csub small' }); k.atag = h('span', { class: 'tag crf-catag', hidden: true });
    k.head = h('header', { class: 'crf-conh' }, icon('drone'), k.title, k.sub, h('span', { class: 'crf-sp' }), k.atag);
    k.note = h('p', { class: 'crf-note small' });
    // keys: the detector on THIS picture + the keys recorded in the alert
    k.d1 = keyRow('مفتاح اللون', 'Colour key'); k.d2 = keyRow('المفتاح الحراري', 'Thermal key'); k.why = h('p', { class: 'crf-why small muted' });
    k.r0 = keyRow('مفتاح الحسّاس', 'Sensor key'); k.r1 = keyRow('اللون (مسجَّل)', 'Colour (recorded)'); k.r2 = keyRow('حراري (مسجَّل)', 'Thermal (recorded)'); k.verdict = h('p', { class: 'crf-verdict small' });
    k.keys = h('div', { class: 'crf-kgrid' },
      h('div', { class: 'crf-kcol' }, h('h4', null, bi('الكاشف على هذه الصورة (قواعد، SIM)', 'Detector on this picture (rule-based, SIM)')), k.d1.el, k.d2.el, k.why),
      h('div', { class: 'crf-kcol' }, h('h4', null, bi('المسجَّل في الإنذار (SIM)', 'Recorded in the alert (SIM)')), k.r0.el, k.r1.el, k.r2.el, k.verdict));
    // evidence strip
    k.ev = h('div', { class: 'crf-evs scroll-x', role: 'list' }); k.evEmpty = h('p', { class: 'small muted' }, bi('لا إطارات بعد — تُحفظ الإطارات عند الرصد والتحقق وعند علَّم الكاشف المشهد.', 'No frames yet — frames are kept at sighting, at verification and the moment the detector flags the scene.'));
    k.evBox = h('section', { class: 'crf-evbox', 'aria-label': 'Evidence' }, h('h4', null, bi('الأدلة: إطارات لحظة الرصد', 'Evidence: frames at detection time')), k.ev, k.evEmpty);
    // actions
    k.bSnap = CR.btn('btn btn-ghost btn-sm', 'camera', 'التقاط صورة', 'Snapshot', function () { snapshotFeed(); });
    k.bRec = CR.btn('btn btn-ghost btn-sm crf-recb', 'rec', 'تسجيل مقطع', 'Record clip', function () { if (F.rec) stopRec(); else { var r = startRec(); if (!r.ok) CR.toast(r.reason === 'unsupported' ? { ar: 'التسجيل غير مدعوم في هذا المتصفح', en: 'Recording is not supported in this browser' } : { ar: 'لا صورة للتسجيل بعد', en: 'No picture to record yet' }, 'warn'); } update(true); });
    k.bRecall = CR.btn('btn btn-ghost btn-sm', 'reset', 'استدعاء المسيّرة', 'Recall drone', function () { var f = selFeed(); if (f && f.kind !== 'live') CR.recallDrone(f.id); update(true); }, { 'data-needs': 'operator' });
    k.bLaunch = CR.btn('btn btn-primary btn-sm', 'launch', 'إطلاق أقرب مسيّرة', 'Launch nearest drone', function () { var a = CR.selectedAlert(); if (a) CR.launchDrone(a.id); update(true); }, { 'data-needs': 'operator' });
    [k.bRecall, k.bLaunch].forEach(function (b) { b.appendChild(h('span', { class: 'crf-lock', 'aria-hidden': 'true' }, icon('lock'))); });
    k.recNote = h('p', { class: 'small muted crf-recnote', id: 'crf-recnote' });
    k.acts = h('div', { class: 'crf-acts' }, k.bSnap, k.bRec, k.bRecall, k.bLaunch);
    // announce
    k.sayBtns = SAY.map(function (key) { var b = h('button', { type: 'button', class: 'crf-saychip', 'data-k': key, 'aria-pressed': 'false', onclick: function () { F.say = key; update(true); } }); b._tx = h('span'); b.appendChild(b._tx); return b; });
    k.sayText = h('p', { class: 'crf-saytext' }); k.sayWhy = h('p', { class: 'small muted', id: 'crf-saywhy' });
    k.bAr = CR.btn('btn btn-cool btn-sm', 'speaker', 'بثّ بالعربية', 'Announce in Arabic', function () { doAnnounce('ar'); }, { 'data-needs': 'operator', 'aria-describedby': 'crf-saywhy' });
    k.bEn = CR.btn('btn btn-cool btn-sm', 'speaker', 'بثّ بالإنجليزية', 'Announce in English', function () { doAnnounce('en'); }, { 'data-needs': 'operator', 'aria-describedby': 'crf-saywhy' });
    [k.bAr, k.bEn].forEach(function (b) { b.appendChild(h('span', { class: 'crf-lock', 'aria-hidden': 'true' }, icon('lock'))); });
    k.sayLog = h('ul', { class: 'crf-saylog small', 'aria-label': 'Announcements' });
    k.say = h('section', { class: 'crf-say', 'aria-label': 'Announce' }, h('h4', null, icon('speaker'), bi('إعلان صوتي عبر مكبّر المسيّرة', 'Announce through the drone speaker')), h('div', { class: 'crf-saychips' }, k.sayBtns),
      k.sayText, h('div', { class: 'crf-sayacts' }, k.bAr, k.bEn), k.sayWhy, k.sayLog);
    // limits of the detector
    k.lim = h('details', { class: 'crf-lim' }, h('summary', null, bi('حدود هذا الكاشف (بصدق)', 'What this detector cannot do (honest limits)')), h('ul', { class: 'small' }));
    k.con = h('section', { class: 'crf-con', 'aria-label': 'Selected feed' }, k.head, k.note, k.keys, k.evBox, k.acts, k.recNote, k.say, k.lim);
    U.k = k; U.root.appendChild(k.con);
    (DS && DS.LIMITATIONS ? DS.LIMITATIONS : []).forEach(function (lm) { k.lim.querySelector('ul').appendChild(h('li', null, bi(lm.ar, lm.en))); });
  }
  function doAnnounce(lng) {
    var f = selFeed(); if (!f || f.kind === 'live') { CR.toast({ ar: 'اختر بثّ مسيّرة أولاً', en: 'Select a drone feed first' }, 'warn'); return { ok: false }; }
    var r = CR.announceVia(f.id, F.say, lng); update(true); return r;
  }
  function paintConsole() {
    var U = F.ui, k = U.k; if (!k) return;
    var f = selFeed(), a = CR.selectedAlert(), live = f && f.kind === 'live', r = f ? f.row : null, drone = f && !live, on = !!(r && (r.state === 'on-station' || r.state === 'verifying'));
    var key = [f ? f.id : '-', a ? a.id : '-', CR.lang(), F.rec ? 1 : 0].join('|');
    U.root.setAttribute('data-rank', String(CR.ROLES ? CR.roleOf(S.role).rank : 1));
    k.con.setAttribute('data-has', f ? '1' : '0');
    if (!f) {
      setT(k.title, B('لا بثّ محدد', 'No feed selected')); setT(k.sub, ''); k.atag.hidden = true; k.note.hidden = false;
      setT(k.note, a && !CR.isFinal(a) ? B('الإنذار ' + a.id + ' لا مسيّرة عليه بعد — أطلق أقرب مسيّرة ليصلك بثّها.', 'Alert ' + a.id + ' has no drone yet — launch the nearest one to get its feed.') : B('اختر إنذاراً من الطابور، أو شغّل الكاميرا الحقيقية من الأسفل.', 'Pick an alert from the queue, or start the real camera below.'));
      k.keys.hidden = true; k.evBox.hidden = !a; k.say.hidden = true; k.bSnap.hidden = k.bRec.hidden = k.bRecall.hidden = true; k.bLaunch.hidden = !(a && !CR.isFinal(a)); k.recNote.hidden = true;
      paintEvidence(a); return;
    }
    k.keys.hidden = false; k.evBox.hidden = false; k.say.hidden = !drone; k.bSnap.hidden = k.bRec.hidden = false; k.bRecall.hidden = !drone; k.bLaunch.hidden = !(a && !CR.isFinal(a)); k.recNote.hidden = false;
    setT(k.title, live ? B('مصدر حقيقي', 'Real source') : r.callsign); setT(k.sub, live ? L.name : nm(r.name).replace(/^.*?— */, '') + ' · ' + nm(r.stateText) + (r.etaSec != null && r.state !== 'on-station' ? ' · ' + B('وصول ', 'ETA ') + CR.mmss(r.etaSec) : ''));
    var al = f.alert; k.atag.hidden = !al; if (al) setT(k.atag, al.id + ' · ' + CR.hzName(al.hazard));
    k.note.hidden = false;
    setT(k.note, live ? B('كاميرا/ملف حقيقي — ليس محاكاة. كاشف ManaraFire الحقيقي (رؤية حاسوبية بقواعد، ليس ذكاءً اصطناعياً) يعمل على بكسلات حقيقية. لا شيء يغادر الصفحة.', 'A real camera or file — not a simulation. The REAL ManaraFire detector (rule-based computer vision, not AI) runs on real pixels. Nothing leaves the page.')
      : B('صورة محاكاة (SIM): ترسمها الشيفرة لما قد تراه كاميرا المسيّرة. لم تُحلّق أي مسيّرة حقيقية؛ لكن الكواشف تعمل فعلاً على هذه الصورة.', 'A simulated picture (SIM): code draws what a drone camera might see. No real drone has flown; but the detectors really run on this picture.'));
    // detector on this picture
    if (live) {
      var rs = L.res; setKey(k.d1, !!rs && rs.state !== 'clear', rs ? (rs.still ? B('صورة: ', 'photo: ') + (rs.kind === 'none' ? B('لا نار ولا دخان', 'no fire, no smoke') : rs.kind === 'fire' ? B('ألوان نار', 'fire colours') : B('ألوان دخان', 'smoke colours')) : nmAr(VERDICT[rs.state] || VERDICT.clear)) : '…', rs ? rs.confidence : 0);
      setKey(k.d2, false, B('لا توجد كاميرا حرارية', 'no thermal camera'), 0);
      setT(k.why, rs ? (rs.still ? B('صورة ثابتة: أعلى نتيجة ممكنة «اشتباه» — اللهب يُثبَت بالوميض لا باللون.', 'A still picture: the most it can be is SUSPECT — flames are proven by flicker, not by colour.') : B('الوميض ', 'Flicker ') + pct(rs.flicker) + (rs.reasons && rs.reasons.length ? ' · ' + rs.reasons.map(function (q) { return REASON[q] ? nmAr(REASON[q]) : q; }).join('، ') : '')) + B(' · لا قرار بلا مفتاح ثانٍ وإنسان.', ' · no decision without a second key and a human.') : B('بانتظار أول إطار…', 'waiting for the first frame…'));
    } else {
      var ev = f.res ? f.res.evidence : null;
      if (ev) {
        setKey(k.d1, ev.vision.seen, ev.vision.seen ? nm(ev.vision.label) + ' · ' + pct(ev.vision.confidence) : ev.vision.suspect ? B('لون يشبه النار فقط', 'fire-coloured only') : B('لا شيء', 'nothing'), ev.vision.confidence);
        setKey(k.d2, ev.thermal.seen, ev.thermal.seen ? nmAr(THKIND[ev.thermal.kind] || THKIND.none) + (ev.thermal.maxC != null && ev.thermal.kind !== 'people' ? ' · ' + ltr(N(ev.thermal.maxC, 0) + ' °C') : '') + ' · ' + pct(ev.thermal.confidence) : B('لا شيء', 'nothing'), ev.thermal.confidence);
        var vs = f.res.vision; setT(k.why, B('وميض اللهب ', 'Flame flicker ') + pct(vs.flicker) + (vs.reasons && vs.reasons.length ? ' · ' + vs.reasons.map(function (q) { return REASON[q] ? nmAr(REASON[q]) : q; }).join('، ') : '') + (f.res.hazardGuess && f.res.hazardGuess !== 'none' ? ' · ' + B('التخمين: ', 'guess: ') + nmAr(GUESS[f.res.hazardGuess] || ['', f.res.hazardGuess]) : ''));
      } else { setKey(k.d1, false, '…', 0); setKey(k.d2, false, '…', 0); setT(k.why, ''); }
    }
    // recorded in the alert
    var rec = al && al.evidence ? al.evidence : null;
    k.r0.el.parentNode.hidden = live || !al;
    if (rec && !live) {
      setKey(k.r0, !!rec.sensor, rec.sensor ? B('تقرير من ', 'report via ') + String(rec.sensor.via || '') : B('لا مفتاح حسّاس', 'no sensor key'), rec.sensor ? 1 : 0);
      setKey(k.r1, !!(rec.vision && rec.vision.seen), rec.vision ? (rec.vision.seen ? nm(rec.vision.label) : B('لم يُرَ', 'not seen')) : B('بانتظار التحقق', 'pending'), rec.vision ? rec.vision.conf : 0);
      setKey(k.r2, !!(rec.thermal && rec.thermal.seen), rec.thermal ? (rec.thermal.seen ? nmAr(THKIND[rec.thermal.kind] || THKIND.none) : (rec.thermal.pending ? B('بانتظار التحقق', 'pending') : B('لم يُرَ', 'not seen'))) : B('بانتظار التحقق', 'pending'), rec.thermal ? rec.thermal.conf : 0);
      setT(k.verdict, al.verdictText ? nm(al.verdictText) + ' · ' + B('مفتاحان مستقلان يؤكدان، ومفتاح واحد يُخفَّض', 'two independent keys confirm; one key is downgraded') : B('لم يكتمل تحقق المسيّرة بعد — الدليل أقل من مفتاحين', 'The drone has not finished verifying — fewer than two keys so far'));
    } else if (!live) { setKey(k.r0, false, '…', 0); setKey(k.r1, false, '…', 0); setKey(k.r2, false, '…', 0); setT(k.verdict, ''); }
    paintEvidence(al);
    // actions
    setT(k.recNote, recSupport() ? (F.rec ? B('يسجّل… ', 'Recording… ') + CR.mmss((now() - F.rec.t0) / 1000) + B(' (يتوقف عند ٣٠ ث)', ' (stops at 30 s)') : B('المقطع والصورة يُحفظان على جهازك فقط (PNG / WebM)، بلا رفع.', 'Snapshots and clips are saved on your device only (PNG / WebM), nothing is uploaded.')) : B('تسجيل المقاطع غير متاح في هذا المتصفح (لا MediaRecorder أو captureStream) — تبقى اللقطة PNG متاحة وتُحفظ على جهازك فقط.', 'Clip recording is not available in this browser (no MediaRecorder or captureStream) — the PNG snapshot still works and is saved on your device only.'));
    k.bRec.setAttribute('aria-disabled', recSupport() ? 'false' : 'true'); k.bRec.setAttribute('aria-describedby', 'crf-recnote'); setA(k.bRec, 'aria-pressed', F.rec ? 'true' : 'false');
    var rl = k.bRec.querySelector('.bi'); if (rl) { setT(rl.children[0], F.rec ? 'إيقاف وحفظ' : 'تسجيل مقطع'); setT(rl.children[1], F.rec ? 'Stop and save' : 'Record clip'); }
    k.bRecall.setAttribute('aria-disabled', drone && r && (r.state === 'returning') ? 'true' : 'false');
    // announce
    if (drone) {
      var order = al ? (SAY_FOR[al.hazard] || SAY_FOR.fire) : SAY_FOR.fire;
      k.sayBtns.forEach(function (b) { var kk = b.getAttribute('data-k'), m = NN && NN.MSG ? NN.MSG['nat.drone.say.' + kk] : null; setT(b._tx, m ? sayLine(m) : kk); b.setAttribute('aria-pressed', String(F.say === kk)); setA(b, 'data-sug', order.indexOf(kk) >= 0 ? '1' : '0'); });
      var mm = NN && NN.MSG ? NN.MSG['nat.drone.say.' + F.say] : null; setT(k.sayText, mm ? '«' + (CR.lang() === 'ar' ? mm.ar : mm.en) + '»' : '');
      k.bAr.setAttribute('aria-disabled', on ? 'false' : 'true'); k.bEn.setAttribute('aria-disabled', on ? 'false' : 'true');
      setT(k.sayWhy, on ? B('المسيّرة في الموقع: الرسالة تُبثّ بمكبّرها وتُسجَّل في الاتصالات (والسكان يسمعونها؛ محاكاة).', 'The drone is on station: the message goes out of its speaker and is logged in comms (SIM).') : B('مكبّر المسيّرة متاح فقط عندما تكون في الموقع (الآن: ' + nm(r.stateText) + ').', 'The drone speaker works only on station (now: ' + nm(r.stateText) + ').'));
      var lg = F.sayLog.filter(function (q) { return q.drone === f.id; }).slice(0, 3), sig = lg.map(function (q) { return q.id; }).join(',') + CR.lang();
      if (k.sayLog._sig !== sig) { k.sayLog._sig = sig; k.sayLog.replaceChildren.apply(k.sayLog, lg.map(function (q) { return h('li', null, h('time', { class: 'num', text: q.clock }), h('span', { text: ' ' + (q.lang === 'ar' ? 'AR' : 'EN') + ' · «' + (q.lang === 'ar' ? q.text.ar : q.text.en) + '»' })); })); }
    }
    k.key = key;
  }
  function paintEvidence(al) {
    var k = F.ui.k, e = al ? evOf(al.id) : null;
    var sig = (al ? al.id : '-') + ':' + (e ? e.v : 0) + ':' + CR.lang();
    k.evEmpty.hidden = !!(e && e.items.length);
    if (k.ev._sig === sig) return; k.ev._sig = sig;
    var items = e ? e.items : []; k.ev._seen = k.ev._seen || {};
    k.ev.replaceChildren.apply(k.ev, items.map(function (it) {
      var isNew = !k.ev._seen[it.id] && !CR.reduced(); k.ev._seen[it.id] = 1;
      var fig = h('figure', { class: 'crf-evi', role: 'listitem', 'data-kind': it.kind, 'data-new': isNew ? '1' : null }, it.cv, h('figcaption', null, h('b', { class: 'num', text: it.clock }), h('span', { text: ' ' + it.cap }), h('small', { text: it.sub + (it.by ? ' · ' + it.by : '') })));
      it.cv.setAttribute('role', 'img'); it.cv.setAttribute('aria-label', it.cap + ' ' + it.clock);
      return fig;
    }));
    k.ev.hidden = !items.length;
  }
  CR.on('announced', function (m) {                       // every announcement (from any tab): kept for the console and published on the bus
    var f = null; eachFeed(function (q) { if (q.id === m.drone) f = q; });
    var s = S.snap, text = m.text || { ar: m.key, en: m.key }, callsign = f && f.row ? f.row.callsign : String(m.drone).slice(-6), al = f && f.alert ? f.alert : null;
    F.sayLog.unshift({ id: (s ? s.t : 0) + ':' + m.drone + ':' + m.key + ':' + m.lang + ':' + F.sayLog.length, drone: m.drone, key: m.key, lang: m.lang, text: text, clock: s ? s.clock : '', callsign: callsign }); if (F.sayLog.length > 40) F.sayLog.pop();
    CR.busSend({ type: 'drone-announce', scope: 'national', drone: m.drone, callsign: callsign, key: m.key, lang: m.lang, text: text, alert: al ? al.id : null, incident: al ? al.incident : null, clock: s ? s.clock : '' }, null,
      'إلى الشبكة: بثّ صوتي عبر ' + callsign + ' (' + (m.lang === 'ar' ? 'العربية' : 'الإنجليزية') + '): ' + text.ar, 'On the bus: voice announcement via ' + callsign + ' (' + (m.lang === 'ar' ? 'Arabic' : 'English') + '): ' + text.en);
    CR.live(B('بُثّت رسالة عبر ', 'Announced through ') + callsign); F.dirty = true;
  });

  /* ---- the live-source panel (a <details> under the wall) ---- */
  function buildLive() {
    var U = F.ui, p = {};
    p.cam = CR.btn('btn btn-primary btn-sm', 'camera', 'شغّل كاميرا الحاسوب', 'Start this device\'s camera', function () { liveCamera().then(function () { update(true); }); });
    p.fileIn = h('input', { type: 'file', accept: 'video/*,image/*', class: 'sr-only', id: 'crf-file', tabindex: '-1', 'aria-hidden': 'true', onchange: function () { var f0 = p.fileIn.files && p.fileIn.files[0]; if (f0) liveFile(f0).then(function () { update(true); }); p.fileIn.value = ''; } });
    p.file = CR.btn('btn btn-ghost btn-sm', 'upload', 'حمّل فيديو أو صورة', 'Load a video or photo', function () { p.fileIn.click(); });
    p.sel = h('select', { class: 'input crf-sample', id: 'crf-sample', onchange: function () { if (p.sel.value) liveSample(p.sel.value).then(function () { update(true); }); } }); lab(p.sel, 'aria-label', 'صورة نموذجية حقيقية', 'A bundled real sample photo');
    p.selDef = h('option', { value: '' }); p.sel.appendChild(p.selDef);
    p.stop = CR.btn('btn btn-ghost btn-sm', 'x', 'أوقف المصدر', 'Stop the source', function () { liveStop(); update(true); });
    p.status = h('p', { class: 'crf-lstatus small', role: 'status', 'aria-live': 'polite' });
    p.res = h('p', { class: 'crf-lres' });
    p.note = h('p', { class: 'note warn small crf-lnote' }, h('b', null, bi('كاميرا حقيقية — غير محاكاة.', 'Real camera — not simulated.')), ' ',
      bi('كاشف الحريق رؤية حاسوبية بقواعد (ليس ذكاءً اصطناعياً). دقته على صور حقيقية محجوزة لم يُضبط عليها: ' + HELD.acc + '٪ (' + HELD.ok + ' من ' + HELD.n + ')؛ وجد كل صور النار (' + HELD.fireFound + ') لكنه أنذر خطأً على ' + HELD.falseFire + ' من الصور بلا نار، وفاته الدخان في ' + HELD.smokeFound.split('/')[1] + ' من ' + HELD.smokeFound.split('/')[1] + ' صور دخان. لا ينذر وحده: يلزم مفتاح ثانٍ (حراري) وإنسان.',
        'The fire detector is rule-based computer vision (not AI). On real photos it was never tuned on it is right ' + HELD.acc + ' % of the time (' + HELD.ok + ' of ' + HELD.n + '): it found every fire photo (' + HELD.fireFound + ') but raised a false alarm on ' + HELD.falseFire + ' fire-free photos and missed the smoke in ' + HELD.smokeFound.split('/')[1] + ' of ' + HELD.smokeFound.split('/')[1] + ' smoke photos. It never alarms alone: a second (thermal) key and a human are required.'));
    p.privacy = h('p', { class: 'small muted' }, bi('الكاميرا والملفات تبقى على جهازك: لا رفع ولا شبكة. تتوقف الكاميرا بعد ٣٠ ثانية من مغادرة هذه اللوحة.', 'The camera and files stay on your device: no upload, no network. The camera stops 30 seconds after you leave this tab.'));
    p.box = h('details', { class: 'crf-live', id: 'crf-live', ontoggle: function () { if (p.box.open) loadSamples(function (ok) { fillSamples(ok); }); } },
      h('summary', null, icon('camera'), bi('مصدر حقيقي اختياري: كاميرا أو فيديو أو صورة', 'Optional real source: camera, video or photo')),
      h('div', { class: 'crf-lbody' }, h('div', { class: 'crf-lbtns' }, p.cam, p.file, p.fileIn, h('label', { class: 'crf-selw', for: 'crf-sample' }, h('span', { class: 'small' }, bi('أو صورة نموذجية:', 'or a sample photo:')), p.sel), p.stop), p.status, p.res, p.note, p.privacy));
    p.camBtnDefault = true; U.live = p; U.root.appendChild(p.box);
  }
  function fillSamples(ok) {
    var p = F.ui.live, list = ok && win.MANARA_SAMPLES ? win.MANARA_SAMPLES : null; if (!p || !list || p.sel.options.length > 1) return;
    list.forEach(function (s) { p.sel.appendChild(h('option', { value: s.file, text: s.file.replace(/\.jpg$/, '') + ' — ' + (s.title ? nm(s.title) : '') })); });
  }
  function paintLiveUI() {
    var p = F.ui.live; if (!p) return;
    var camOK = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    p.cam.setAttribute('aria-disabled', camOK ? 'false' : 'true');
    setT(p.selDef, B('اختر…', 'choose…'));
    var msg = L.status === 'asking' ? B('بانتظار إذن الكاميرا…', 'Waiting for the camera permission…') : L.err === 'denied' ? B('رُفض إذن الكاميرا — يمكنك تحميل فيديو أو صورة بدلاً منها.', 'Camera permission was denied — you can load a video or a photo instead.')
      : L.err === 'none' ? B('لا توجد كاميرا على هذا الجهاز.', 'No camera was found on this device.') : L.err === 'unavailable' || !camOK ? B('الكاميرا غير متاحة هنا (تحتاج https أو localhost وإذناً) — حمّل فيديو أو صورة.', 'The camera is not available here (needs https or localhost, and permission) — load a video or a photo.')
      : L.err === 'tainted' ? B('لا يمكن قراءة بكسلات هذا المصدر.', 'This source\'s pixels cannot be read.') : L.err === 'error' ? B('تعذّر فتح المصدر.', 'The source could not be opened.')
      : L.src === 'none' ? B('لم يبدأ أي مصدر حقيقي بعد.', 'No real source has started yet.') : B('يعمل: ', 'Running: ') + L.name + (L.src === 'camera' ? B(' — مصدر حقيقي، ليس محاكاة', ' — a real source, not simulated') : '');
    setT(p.status, msg); p.stop.hidden = L.src === 'none';
    var rs = L.res;
    setT(p.res, !rs ? '' : (rs.still ? B('نتيجة الصورة: ', 'Photo result: ') + (rs.kind === 'fire' ? B('ألوان نار (اشتباه)', 'fire colours (SUSPECT)') : rs.kind === 'smoke' ? B('ألوان دخان (اشتباه)', 'smoke colours (SUSPECT)') : B('لا نار ولا دخان', 'no fire, no smoke')) + ' · ' + B('درجة ', 'score ') + (L.still ? pct(Math.max(L.still.fire, L.still.smoke)) : '')
      : B('حالة الفيديو: ', 'Video state: ') + nmAr(VERDICT[rs.state] || VERDICT.clear) + ' · ' + B('ثقة ', 'confidence ') + pct(rs.confidence) + ' · ' + B('وميض ', 'flicker ') + pct(rs.flicker)));
    if (L.sample) { var tt = L.sample; p.res.title = (tt.credit || ''); }
  }

  /* ====================================================================================
   * 8. THE TAB
   * ==================================================================================== */
  function build(el) {
    var d = CR.deps || {}; DS = d.DS || win.ManaraDroneScene; NN = d.NN || win.ManaraNational; FIRE = win.ManaraFire;
    F.root = el; el.classList.add('crf'); F.ui.root = el; el.setAttribute('data-focus', '0'); el.setAttribute('data-empty', '1'); el.setAttribute('data-rank', '1');
    if (win.IntersectionObserver) F.io = new IntersectionObserver(function (es) { es.forEach(function (e) { var f = e.target._feed; if (f) f.vis = e.isIntersecting; }); }, { threshold: 0.02 });
    if (win.ResizeObserver) F.ro = new ResizeObserver(function (es) { es.forEach(function (e) { var f = e.target._feed; if (!f) return; var r = e.contentRect; f.ovW = Math.round(r.width) || 320; f.ovH = Math.round(r.height) || 240; if (f.res) drawOv(f); }); });
    var U = F.ui;
    U.layout = seg('تخطيط الجدار', 'Wall layout', [{ v: 'auto', ar: 'تلقائي', en: 'Auto' }, { v: '1', text: '1' }, { v: '2', text: '2' }, { v: '4', text: '4' }], function () { return F.layout; }, setLayout);
    U.view = seg('نوع الصورة', 'Picture type', [{ v: 'rgb', ar: 'عادي', en: 'Colour' }, { v: 'thermal', ar: 'حراري', en: 'Thermal' }, { v: 'fused', ar: 'دمج', en: 'Fused' }], function () { return F.view; }, setView);
    U.count = h('span', { class: 'crf-count small muted' });
    U.back = CR.btn('btn btn-ghost btn-sm', 'shrink', 'العودة إلى الجدار', 'Back to the wall', function () { F.focusId = null; F.dirty = true; update(true); }); U.back.hidden = true;
    U.simNote = h('span', { class: 'crf-simnote small' }, CR.simTag(), bi('صور مولَّدة بالشيفرة', 'code-generated pictures'));
    U.bar = h('div', { class: 'crf-bar2' }, U.layout, U.view, U.back, h('span', { class: 'crf-sp' }), U.count, U.simNote);
    U.wall = h('div', { class: 'crf-wall', 'data-n': '1', 'aria-live': 'off' });
    U.strip = h('div', { class: 'crf-strip scroll-x', role: 'group', hidden: true }); lab(U.strip, 'aria-label', 'بثوث أخرى — اختر واحداً لإظهاره في الجدار', 'Other feeds — pick one to bring it to the wall');
    U.more = h('span', { class: 'crf-more small muted', hidden: true });
    U.empty = h('div', { class: 'crf-empty', role: 'status' }, icon('drone'), h('b', null, bi('لا بثّ مسيّرات الآن', 'No drone feed right now')),
      h('p', null, bi('تظهر هنا كاميرا كل مسيّرة مرتبطة بإنذار مفتوح، وكاميرات المسيّرات في الدورية. اختر إنذاراً وأطلق أقرب مسيّرة، أو جرّب كاميرا حقيقية من الأسفل.', 'The camera of every drone attached to an open alert appears here, and the patrol drones\' cameras. Pick an alert and launch the nearest drone, or try a real camera below.')),
      h('div', { class: 'btns' }, CR.btn('btn btn-primary btn-sm', 'launch', 'أطلق أقرب مسيّرة للإنذار المحدد', 'Launch the nearest drone to the selected alert', function () { var a = CR.selectedAlert(); if (a) CR.launchDrone(a.id); else CR.toast({ ar: 'اختر إنذاراً أولاً', en: 'Select an alert first' }, 'warn'); update(true); }, { 'data-needs': 'operator' }),
        CR.btn('btn btn-ghost btn-sm', 'camera', 'جرّب كاميرا حقيقية', 'Try a real camera', function () { var lv = F.ui.live; if (lv) { lv.box.open = true; lv.cam.focus(); } })));
    el.appendChild(U.bar); el.appendChild(U.wall); el.appendChild(U.empty); el.appendChild(h('div', { class: 'crf-stripw' }, U.strip, U.more));
    buildConsole(); buildLive(); paintLiveUI();
    F.built = true; F.dirty = true;
    CR.on('snapshot', function () { F.snapDirty = true; });
    CR.on('select', function () { if (selecting) return; F.pinId = null; F.dirty = true; F.selDirty = true; });
    CR.on('select-drone', function () { F.dirty = true; });
    CR.on('role', function () { F.dirty = true; });
    CR.on('lang', function () { F.dirty = true; eachFeed(function (f) { f.lastStep = -1e9; }); });
    CR.on('theme', function () { F.dirty = true; });
    CR.on('reset', function () { F.ev = {}; F.sayLog = []; F.focusId = null; F.pinId = null; if (F.rec) stopRec(); eachFeed(function (f) { if (f.id !== 'live') dropFeed(f.id); }); F.feeds = []; F.wallKey = ''; F.dirty = true; });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && F.focusId && isOn() && F.root && F.root.contains(doc.activeElement)) { F.focusId = null; F.dirty = true; update(true); } });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden && L.src === 'camera') liveStop(); });
    win.addEventListener('pagehide', function () { liveStop(true); if (F.rec) stopRec(); });
    update(true);
  }
  function period(f, nVis) {
    var base = f.kind === 'live' ? 130 : (f.id === F.focusId || nVis === 1) ? 110 : 190;
    if (CR.reduced() && f.kind !== 'live') return 9000;
    if (CR.reduced()) return 1500;
    return Math.max(base, nVis * (f.stepMs || F.lastStepMs) / 0.4);
  }
  function frame(ts) {
    F.frames++; F.lastFrame = now();
    if (!F.built || !S.ready || !isOn() || doc.hidden) return;
    if (F.dirty || F.snapDirty) update(false);
    var shown = F.shown, tn = now(), vis = shown.filter(function (f) { return f.vis !== false && f.cell; }), due = null, i;
    for (i = 0; i < vis.length; i++) { var f = vis[i]; f.period = period(f, vis.length); if (tn - f.lastStep >= f.period && (!due || f.lastStep < due.lastStep)) due = f; }
    if (due && DS) {
      try { if (due.kind === 'live') stepLive(due, ts); else stepFeed(due, ts); } catch (e) { due.lastStep = now() + 3000; try { console.error(e); } catch (e2) { /* ignore */ } }
    }
    animate(ts);
    if (L.camOffAt && now() > L.camOffAt && L.src === 'camera') { liveStop(); update(true); }
  }
  function update(force) {
    if (!F.built || !S.snap) return;
    var tn = now(), vis = F.root.offsetParent !== null || F.root.getClientRects().length > 0;
    if (!force && !F.dirty && !F.snapDirty && tn - F.paintAt < 380) return;
    if (!vis && !force && F.paintAt) return;
    F.snapDirty = false; F.paintAt = tn;
    if (DS) refresh();
    paintWall(); F.shown.forEach(paintCell); paintChips();
    var sf = selFeed(); engineEvidence(sf && sf.alert ? sf.alert : CR.selectedAlert()); paintConsole(); F.ui.layout._paint(); F.ui.view._paint();
    if (L.src !== 'none' || F.ui.live.box.open) paintLiveUI();
  }
  function active(on) {
    F.active = !!on;
    if (!on) { if (F.rec) stopRec(); if (L.src === 'camera') L.camOffAt = now() + KEEP_CAM_MS; }
    else { L.camOffAt = 0; eachFeed(function (f) { f.lastTs = 0; f.lastStep = -1e9; }); F.dirty = true; update(true); }
  }
  function badge() {                                       // the tab's counter: drones that have an open alert (their picture is what the operator should look at)
    try { var n = collect().filter(function (w) { return w.kind === 'alert'; }).length; return n || ''; } catch (e) { return ''; }
  }
  CR.registerTab({ id: TAB, icon: 'camera', ar: 'جدار البث', en: 'Feed wall', build: build, update: function () { update(false); }, frame: frame, active: active, badge: badge });

  /* ====================================================================================
   * 9. TEST / AUTOMATION API  (ControlRoom.mods.feeds)
   * ==================================================================================== */
  function view(f) { return { id: f.id, kind: f.kind, callsign: f.row ? f.row.callsign : null, state: f.row ? f.row.state : null, alert: f.alert ? f.alert.id : null, verdict: f.verdict, conf: f.conf, guess: f.guess, boxes: f.res && f.res.overlays ? f.res.overlays.boxes.length : 0, steps: f.steps, shown: F.shown.indexOf(f) >= 0, visible: f.vis !== false, hasCell: !!f.cell, dkey: f.dkey }; }
  CR.mods.feeds = {
    state: F, live: L, collect: collect, refresh: function () { refresh(); update(true); },
    feeds: function () { return F.feeds.map(view); }, shown: function () { return F.shown.map(view); }, selected: function () { var f = selFeed(); return f ? view(f) : null; },
    setLayout: setLayout, setView: setView, focus: focusFeed, unfocus: function () { F.focusId = null; F.dirty = true; update(true); }, layoutN: layoutN, layout: function () { return F.layout; }, viewMode: function () { return F.view; },
    snapshot: snapshotFeed, record: startRec, stopRecord: stopRec, recording: function () { return F.rec ? { id: F.rec.id, ms: Math.round(now() - F.rec.t0), mime: F.rec.mime } : null; }, recordSupported: recSupport, lastSnapshot: function () { return F.lastSnapshot; }, lastClip: function () { return F.lastClip || null; },
    announce: function (id, key, lng) { return CR.announceVia(id, key, lng); }, sayLog: function () { return F.sayLog.slice(); }, evidence: function (id) { return evOf(id).items.map(function (i) { return { id: i.id, kind: i.kind, clock: i.clock, cap: i.cap, sub: i.sub }; }); },
    useCamera: liveCamera, useFile: liveFile, useSample: liveSample, stopLive: liveStop, liveState: function () { return { src: L.src, name: L.name, status: L.status, err: L.err, frames: L.frames, res: L.res, still: L.still }; },
    stats: function () { return { steps: F.steps, lastStepAt: F.lastStepAt, frames: F.frames, lastFrame: F.lastFrame, active: isOn(), stepMs: Math.round(F.lastStepMs * 10) / 10, feeds: F.feeds.length, shown: F.shown.length }; },
    stepAll: function () { F.shown.forEach(function (f) { if (f.cell) { if (f.kind === 'live') stepLive(f, now()); else stepFeed(f, now()); } }); update(true); },
    motion: function () {
      var f0 = F.shown.filter(function (f) { return f.cell; })[0], c = f0 && f0.cell;
      return { reduced: CR.reduced(), enters: F.enters, flashes: F.flashes, boxes: F.shown.reduce(function (n, f) { return n + (f.abx ? f.abx.length : 0); }, 0), tk: f0 && f0.tk ? JSON.parse(JSON.stringify(f0.tk)) : null,
        css: c ? { scan: getComputedStyle(c.scan).animationName, dot: getComputedStyle(c.head.querySelector('.crf-dot')).animationName, flash: getComputedStyle(c.flash).animationName, enter: c.el.getAttribute('data-enter'), flashAttr: c.el.getAttribute('data-flash'), sig: c.bars.getAttribute('data-n'), batt: c.gauge.style.getPropertyValue('--lv') } : null };
    },
    enter: function (id) { enterTile(F.byId[id]); }, flash: function (id) { alertFlash(F.byId[id]); },
    paint: function () { update(true); }, held: HELD, verdictOf: verdictOf
  };
})();
