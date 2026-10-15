// MANARA («منارة») landing page behaviour (index.html) — classic script, no libraries, works from file:// and offline.
// Contract: manara/docs/MANARA.md. Every colour a canvas needs is read from the CSS tokens (getComputedStyle) and redrawn on 'themechange';
// every string is bilingual (Manara.L) and re-rendered on 'langchange'. Nothing user-typed ever reaches innerHTML (there is no innerHTML sink in this
// file: icons and the logo are authored SVG strings parsed with DOMParser and imported as nodes).
//
// What is in here (each block is standalone and degrades alone; the Qatar-wide map and the control-room miniature live in js/home-map.js):
//   1. shell       aria labels, logo, brand override, test counts, sub-nav, placeholders, numbers filter
//   2. cam         the HERO: a live drone camera. ManaraDroneScene draws an aerial scene in code (SIM) and the REAL rule-based detector (ManaraFire +
//                  the thermal test) runs on it in this page: patrol → sees → proves (two keys) → alert to the control room. Honest by construction:
//                  the keys, confidences and temperatures on screen are the detector's output, not typed. Still frame under reduced motion, pauses
//                  off-screen / in a hidden tab / on the button.
//   3. hazards     six aerial frames (fire, gas, flood, dust, heat, someone needs help), RGB or thermal, analysed by the same detector
//   4. robot       a scripted illustration (SIM) of the rescue robot searching a three-storey building, with a timeline scrubber
(function () {
  'use strict';
  var M = window.Manara;
  if (!M) { return; }
  var $ = M.$, $$ = M.$$, L = M.L;
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var reduced = function () { return !!mq.matches; };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function sv(tag, attrs, parent) { var n = document.createElementNS(SVGNS, tag); if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function onLang(fn) { window.addEventListener('langchange', fn); }
  function onTheme(fn) { window.addEventListener('themechange', fn); }
  // an authored SVG string (Manara.icon / Manara.logo) → a node, without innerHTML
  function fromHTML(str) { var d = new DOMParser().parseFromString(str, 'text/html'); return document.importNode(d.body.firstChild, true); }
  function icon(name) { return fromHTML(M.icon(name)); }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function bi(ar, en) { return L(T(ar, en)); }

  /* ======================================================================= tokens for canvases */
  var TOKS = {};
  function readTokens(node) {
    var cs = getComputedStyle(node || document.documentElement);
    ['danger', 'warn', 'safe', 'info', 'accent', 'brand', 'ink', 'head', 'muted', 'bg', 'surface'].forEach(function (n) { TOKS[n] = cs.getPropertyValue('--' + n).trim(); });
    TOKS.mono = cs.getPropertyValue('--font-m').trim() || 'monospace';
    TOKS.font = cs.getPropertyValue('--font-h').trim() || 'sans-serif';
  }
  function tk(n) { return TOKS[n] || '#888'; }

  /* ======================================================================= a small player: play / pause / off-screen / hidden tab / reduced motion */
  // opts: node (watched by IntersectionObserver), dur (s), hold (s: how long the last frame stays), onTick(t, dt), onEnd(), loop (bool|function)
  function Player(opts) {
    var P = { t: 0, playing: !reduced(), visible: true, raf: 0, last: 0, endAt: 0, ended: false, opts: opts };
    function runnable() { return P.playing && P.visible && !document.hidden; }
    function frame(ts) {
      P.raf = 0; if (!runnable()) { P.last = 0; return; }
      var dt = P.last ? Math.min(0.1, (ts - P.last) / 1000) : 0; P.last = ts;
      if (P.ended) {
        P.endAt -= dt;
        if (P.endAt <= 0) { var lp = typeof opts.loop === 'function' ? opts.loop() : opts.loop; if (lp && !reduced()) { P.t = 0; P.ended = false; if (opts.onRestart) opts.onRestart(); } else { P.playing = false; if (opts.onState) opts.onState(); return; } }
      } else {
        P.t += dt;
        if (P.t >= opts.dur) { P.t = opts.dur; P.ended = true; P.endAt = opts.hold || 0; }
      }
      opts.onTick(P.t, dt);
      schedule();
    }
    function schedule() { if (!P.raf && runnable()) P.raf = requestAnimationFrame(frame); }
    P.kick = function () { P.last = 0; schedule(); };
    P.play = function () { P.playing = true; if (P.ended && P.endAt <= 0) { P.t = 0; P.ended = false; if (opts.onRestart) opts.onRestart(); } if (opts.onState) opts.onState(); P.kick(); };
    P.pause = function () { P.playing = false; if (opts.onState) opts.onState(); };
    P.toggle = function () { if (P.playing) P.pause(); else P.play(); };
    P.restart = function () { P.t = 0; P.ended = false; if (opts.onRestart) opts.onRestart(); P.playing = true; if (opts.onState) opts.onState(); opts.onTick(0, 0); P.kick(); };
    if (opts.node && 'IntersectionObserver' in window) {
      P.visible = false;
      new IntersectionObserver(function (es) { P.visible = es[0].isIntersecting; if (P.visible) P.kick(); }, { rootMargin: '80px' }).observe(opts.node);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) P.kick(); });
    return P;
  }
  function setPlayBtn(btn, playing) {
    if (!btn) return;
    clear(btn); btn.appendChild(icon(playing ? 'pause' : 'play'));
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    var l = playing ? T('إيقاف المشهد مؤقتًا', 'Pause the scene') : T('تشغيل المشهد', 'Play the scene');
    btn.setAttribute('aria-label', L(l)); btn.title = L(l);
  }

  /* ======================================================================= 1. shell */
  function applyAria() { $$('[data-aria-ar]').forEach(function (n) { n.setAttribute('aria-label', L(T(n.getAttribute('data-aria-ar'), n.getAttribute('data-aria-en')))); }); }
  function initLogo() { $$('[data-logo]').forEach(function (n) { if (!n.firstChild) n.appendChild(fromHTML(M.logo(80))); }); }
  function brandOverride() {
    // core.js (shared, not ours) still carries the fire-only tagline and footer text. Override them from this page only; the same objects are used by the
    // shell, so a re-render picks them up. Idempotent. Remove once core.js says the same.
    var tg = M.TAGLINE; if (!tg) return;
    var ar = 'المسيّرة ترى… ولا أحدَ يُترك خلفنا', en = 'The drone sees. No one is left behind.';
    if (tg.ar === ar && tg.en === en) return;
    tg.ar = ar; tg.en = en;
    M.strings({
      'foot.about': T('منصة «آخر مئة متر» لكل أنواع الطوارئ: مسيّرة ترى وتُنبّه غرفة التحكم، ومفتاحان مستقلان وموافقة إنسان قبل أي إنذار عام، والوحدة الأسرع بحسب المرور في قطر كلها، ورسالة لكل إنسان بلغته، وروبوت يبحث عمّن لا يستطيع الخروج. مشروع ابتكار طلابي (مفهوم + نموذج أولي محاكى) يكمّل الدفاع المدني والإسعاف ولا يحلّ محلّهما.',
        'The last-100-metres platform for every kind of emergency: a drone sees and alerts the control room, two independent keys and a human Approve before any public alert, the fastest unit given traffic across all of Qatar, a message for each person in their own language, and a robot that searches for those who cannot get out. A student innovation project (a concept plus a simulated prototype) that complements Civil Defence and the ambulance service and replaces neither.'),
      'foot.made': T('مفهوم + نموذج أولي محاكى لمسابقة الابتكار · تحتوي على بيانات © مساهمي OpenStreetMap (ODbL 1.0) · الصقور تكافح النار والمنارة تُخرج الجميع',
        'Concept + simulated prototype for the innovation competition · Contains data © OpenStreetMap contributors (ODbL 1.0) · the falcons fight the fire, the lighthouse gets everyone out')
    });
    M.setLang(M.lang());                                         // re-renders the shell (nav brand + footer) and fires 'langchange'
  }
  function initCounts() {                                        // the "N checks" numbers are READ from data/test-counts.js (generated by tools/update-counts.mjs), never typed
    var tc = window.MANARA_TEST_COUNTS; if (!tc || !tc.suites) return;
    var names = Object.keys(tc.suites), passed = 0, failed = 0;
    names.forEach(function (n) { passed += tc.suites[n].passed || 0; failed += tc.suites[n].failed || 0; });
    $$('[data-tc="total"]').forEach(function (n) { n.textContent = failed ? M.num(passed) + ' / ' + M.num(passed + failed) : M.num(passed); });
    $$('[data-tc="suites"]').forEach(function (n) { n.textContent = M.num(names.length); });
  }
  function initNumbersFilter() {
    var box = $('#num-filter'); if (!box) return;
    var cards = $$('#nums .num-card');
    $$('.chip', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-f');
        $$('.chip', box).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        cards.forEach(function (c) { c.hidden = !(f === 'all' || c.getAttribute('data-k') === f); });
      });
    });
  }
  function initSubnav() {
    var nav = $('#subnav'); if (!nav) return;
    var links = $$('a[href^="#"]', nav), map = {}, order = [];
    links.forEach(function (a) { var id = a.getAttribute('href').slice(1), s = document.getElementById(id); if (s) { map[id] = a; order.push(s); } });
    var cur = '';
    function set(id) {
      if (id === cur) return; var first = !cur; cur = id;
      links.forEach(function (a) { if (a === map[id]) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      if (!first && map[id] && map[id].scrollIntoView) { try { map[id].scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browser */ } }
    }
    function onScroll() {
      var y = (nav.getBoundingClientRect().bottom || 0) + 24, pick = '';
      order.forEach(function (s) { if (s.getBoundingClientRect().top <= y) pick = s.id; });
      set(pick);
    }
    var tick = 0;
    window.addEventListener('scroll', function () { if (!tick) tick = requestAnimationFrame(function () { tick = 0; onScroll(); }); }, { passive: true });
    onScroll();
  }
  function initPlaceholders() {                                  // «{{…}}» fields the student must fill in: list them and say how many are left
    var out = $('#ph-status'), list = $('#ph-list'), seen = {}, keys = [];
    $$('.ph[data-ph]').forEach(function (n) { var k = n.getAttribute('data-ph'); if (!seen[k]) { seen[k] = n; keys.push(k); } });
    if (list) {
      clear(list);
      keys.forEach(function (k) {
        var li = el('li'), ph = el('span', 'ph', seen[k].textContent); ph.setAttribute('data-for', k); li.appendChild(ph); list.appendChild(li);
      });
    }
    function render() {
      var all = $$('.ph[data-ph]'), left = all.filter(function (n) { return /\{\{[A-Z_]+\}\}/.test(n.textContent); });
      all.forEach(function (n) { n.classList.toggle('filled', !/\{\{[A-Z_]+\}\}/.test(n.textContent)); });
      if (!out) return;
      out.classList.toggle('done', left.length === 0);
      out.textContent = left.length ? bi('حقول بلا تعبئة: ' + left.length + ' من ' + keys.length + ' بنودًا', 'Fields still to fill in: ' + left.length + ' of ' + keys.length + ' items') : bi('اكتملت كل الحقول.', 'All fields are filled in.');
    }
    render(); onLang(render);
  }

  /* ======================================================================= detections: a small, token-coloured overlay (the same boxes ManaraDroneScene.analyze returns) */
  var KIND_TOK = { fire: 'danger', smoke: 'muted', hotspot: 'warn', 'hot-object': 'brand', person: 'safe', 'cold-plume': 'accent' };
  function boxLabel(DS, b, lang) { var lb = DS.LABEL && DS.LABEL[b.kind]; return (lb ? lb[lang] : b.kind) + (b.score != null && b.source === 'rgb' ? ' ' + Math.round(b.score * 100) + '%' : ''); }
  // res = analyze() result; view = {x0, y0, w, h} in frame units (normalised) so the same overlay works for a zoomed crop; only = a filter on box kinds/sources
  function drawDet(DS, ctx, res, W, H, o) {
    o = o || {}; var v = o.view || { x0: 0, y0: 0, w: 1, h: 1 }, lang = M.lang(), ov = res && res.overlays; if (!o.keep) ctx.clearRect(0, 0, W, H); if (!ov) return;
    var X = function (x) { return (x - v.x0) / v.w * W; }, Y = function (y) { return (y - v.y0) / v.h * H; };
    var fs = clamp(Math.round(W / 38), 10, 14), lw = Math.max(1.6, W / 300);
    ctx.save(); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.textBaseline = 'middle'; ctx.font = '600 ' + fs + 'px ' + (lang === 'ar' ? TOKS.font : TOKS.mono);
    (ov.polygons || []).forEach(function (pg) {
      if (o.filter && !o.filter(pg)) return; if (!pg.points || pg.points.length < 3) return;
      var c = tk(KIND_TOK[pg.kind] || 'ink'); ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(X(pg.points[0][0]), Y(pg.points[0][1]));
      for (var j = 1; j < pg.points.length; j++) ctx.lineTo(X(pg.points[j][0]), Y(pg.points[j][1]));
      ctx.closePath(); ctx.globalAlpha = 0.16; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    });
    (ov.boxes || []).forEach(function (b) {
      if (o.filter && !o.filter(b)) return;
      var c = tk(KIND_TOK[b.kind] || 'ink'), x = X(b.x), y = Y(b.y), w = b.w / v.w * W, h = b.h / v.h * H, cl = Math.min(12, w / 2.4, h / 2.4);
      if (x + w < 0 || y + h < 0 || x > W || y > H) return;
      ctx.strokeStyle = c; ctx.beginPath();
      ctx.moveTo(x, y + cl); ctx.lineTo(x, y); ctx.lineTo(x + cl, y); ctx.moveTo(x + w - cl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cl);
      ctx.moveTo(x + w, y + h - cl); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - cl, y + h); ctx.moveTo(x + cl, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cl); ctx.stroke();
      var lab = boxLabel(DS, b, lang), tw = ctx.measureText(lab).width + 10, ly = Math.max(fs / 2 + 2, y - fs / 2 - 4), lx = clamp(x, 2, W - tw - 2);
      ctx.fillStyle = c; ctx.globalAlpha = 0.92; ctx.fillRect(lx, ly - fs / 2 - 2, tw, fs + 4); ctx.globalAlpha = 1;
      ctx.fillStyle = tk('bg'); ctx.textAlign = 'left'; ctx.fillText(lab, lx + 5, ly);
    });
    var ch = ov.crosshair;
    if (ch && !(o.noCross)) {
      var cx = X(ch.x), cy = Y(ch.y), r = Math.max(9, W / 28);
      ctx.strokeStyle = tk('head'); ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r / 3, cy); ctx.moveTo(cx + r / 3, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - r / 3); ctx.moveTo(cx, cy + r / 3); ctx.lineTo(cx, cy + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
      var txt = Math.round(ch.tC) + ' °C', tw2 = ctx.measureText(txt).width + 10; ctx.fillStyle = tk('bg'); ctx.globalAlpha = 0.78; ctx.fillRect(cx + r + 2, cy - fs / 2 - 3, tw2, fs + 6); ctx.globalAlpha = 1;
      ctx.fillStyle = tk('head'); ctx.textAlign = 'left'; ctx.font = '600 ' + fs + 'px ' + TOKS.mono; ctx.fillText(txt, cx + r + 7, cy);
    }
    ctx.restore();
  }
  function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
  function sizeCanvas(c, node) {                                  // match a canvas to its CSS box (so lines and text stay crisp); returns [w, h] in CSS px
    var r = (node || c).getBoundingClientRect(), w = Math.max(60, Math.round(r.width)), h = Math.max(40, Math.round(r.height)), d = dpr();
    if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
    return [w, h, d];
  }
  function frameToCanvas(fr, c) { c.width = fr.width; c.height = fr.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fr.data), fr.width, fr.height), 0, 0); return c; }

  /* ======================================================================= 2. THE HERO: the live drone camera */
  var cam = (function () {
    var DS = window.ManaraDroneScene, root = $('#cam');
    var C = { ready: false };
    if (!root) return C;
    if (!DS || !window.ManaraFire) { root.setAttribute('data-state', 'unavailable'); return C; }
    var cvs = $('#cam-rgb'), ovl = $('#cam-ovl'), thc = $('#cam-th'), view = $('#cam-view'), ctx = cvs.getContext('2d'), octx = ovl.getContext('2d'), thx = thc.getContext('2d');
    var FW = 576, FH = 360, SEED = 3, HOUR = 16.5, FPS = 12;
    // the story clock (seconds): patrol → the camera swings to the smoke (dissolve) → hover → analysis → alert → hold → loop
    var T_CUT = 3.2, T_FADE = 0.7, T_HOVER = T_CUT + T_FADE, SENT_DELAY = 1.3, T_STILL = 9.4, LOOP = 15.2, T_FADEOUT = 14.4;
    var ob = document.createElement('canvas'); ob.width = FW; ob.height = FH; var obx = ob.getContext('2d');
    var ob2 = document.createElement('canvas'); ob2.width = FW; ob2.height = FH; var obx2 = ob2.getContext('2d');
    var sc = null, scOK = null, an = null, st, W = 0, H = 0, D = 1, last = null, player = null, accum = 0, fT = 0;
    function reset() { st = { k1: false, k2: false, confirmedAt: -1, sentAt: -1, res: null, stage: 0 }; if (an) an.reset(); last = null; accum = 0; fT = -1; }
    reset();
    function build() {
      if (sc) return true;
      try {
        var o = { timeOfDay: HOUR, context: 'urban', width: FW, height: FH, pitchDeg: 58 };
        scOK = DS.create(DS.preset('clear', SEED, o)); sc = DS.create(DS.preset('fire', SEED, o)); an = DS.createAnalyzer();
        return true;
      } catch (e) { if (window.console) console.error(e); root.setAttribute('data-state', 'error'); return false; }
    }
    function resize() {
      var s = sizeCanvas(cvs, view), s2 = sizeCanvas(ovl, view); W = s[0]; H = s[1]; D = s[2]; void s2;
    }
    function paint(t, res) {
      // the picture: patrol (a slow drift), dissolve to the fire scene while the camera settles, then a steady hover (the flicker test needs a still camera)
      var cut = clamp((t - T_CUT) / T_FADE, 0, 1), pt = clamp(t / T_CUT, 0, 1);
      var zoom = lerp(1.14 - 0.05 * pt, 1.0, ease(cut)), px = lerp(-0.035 + 0.07 * pt, 0, ease(cut)), py = lerp(0.02 - 0.03 * pt, 0, ease(cut));
      var sw = FW / zoom, sh = FH / zoom, sx = clamp((FW - sw) / 2 + px * FW, 0, FW - sw), sy = clamp((FH - sh) / 2 + py * FH, 0, FH - sh);
      var tf = Math.max(0, t - T_CUT);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (cut < 1) { obx.putImageData(new ImageData(scOK.renderRGB(t).data, FW, FH), 0, 0); ctx.globalAlpha = 1; ctx.drawImage(ob, sx, sy, sw, sh, 0, 0, cvs.width, cvs.height); }
      if (cut > 0) { obx2.putImageData(new ImageData(sc.renderRGB(tf).data, FW, FH), 0, 0); ctx.globalAlpha = ease(cut); ctx.drawImage(ob2, sx, sy, sw, sh, 0, 0, cvs.width, cvs.height); ctx.globalAlpha = 1; }
      octx.setTransform(D, 0, 0, D, 0, 0);
      if (res) drawDet(DS, octx, res, W, H, { filter: function (b) { return b.kind !== 'person'; }, noCross: true }); else octx.clearRect(0, 0, W, H);
    }
    function analyseAt(t) {                                   // one analysis step at story time t (t >= T_HOVER)
      var tf = t - T_CUT, rgb = sc.renderRGB(tf), th = sc.renderThermal(tf), res = an.push(rgb, th, Math.round(tf * 1000), { lang: M.lang() });
      st.res = res; st.th = th;
      if (res.evidence.vision.seen) st.k1 = true;
      if (res.evidence.thermal.seen) st.k2 = true;
      if (st.k1 && st.k2 && st.confirmedAt < 0) { st.confirmedAt = t; st.sentAt = t + SENT_DELAY; }
      return res;
    }
    var CAP = {
      patrol: T('دورية: تحلّق المسيّرة في قطاع الدوحة ولا خطر في الصورة.', 'Patrol: the drone flies its Doha sector and nothing hazardous is in view.'),
      sees: T('دخان ولهب يدخلان الصورة: تتوقف المسيّرة وتحوم (الومض يحتاج كاميرا ثابتة).', 'Smoke and flames enter the frame: the drone stops and hovers (flicker needs a steady camera).'),
      suspect: T('اشتباه: مفتاح واحد لا يكفي لإنذار عام، فيبقى «اشتباهًا».', 'SUSPECT: one key is not enough for a public alert, so it stays a suspicion.'),
      confirmed: T('مؤكَّد: مفتاحان مستقلان، رؤية حاسوبية وحرارة.', 'CONFIRMED: two independent keys, computer vision and thermal.'),
      sent: T('وصل إنذار المسيّرة إلى غرفة التحكم وينتظر موافقة إنسان. صافرة الموقع المحلية لا تنتظر.', 'The drone alert reached the control room and waits for a human Approve. The local siren never waits.')
    };
    var STATE_TXT = {
      watch: T('مراقبة', 'WATCHING'), suspect: T('اشتباه', 'SUSPECT'), confirmed: T('مؤكَّد · مفتاحان', 'CONFIRMED · 2 KEYS'), sent: T('أُرسل إلى غرفة التحكم', 'SENT TO CONTROL ROOM')
    };
    var HUD = {};
    function hud(t) {
      var res = st.res, sent = st.sentAt >= 0 && t >= st.sentAt, both = st.k1 && st.k2;
      var s = t < T_CUT + 0.35 ? 'watch' : sent ? 'sent' : both ? 'confirmed' : 'suspect';
      var stage = t < T_CUT ? 0 : sent ? 3 : (st.k1 || st.k2) ? 2 : 1;
      var capKey = t < T_CUT ? 'patrol' : sent ? 'sent' : both ? 'confirmed' : (st.k1 || st.k2) ? 'suspect' : 'sees';
      var chip = $('#cam-state'); if (HUD.s !== s) { chip.setAttribute('data-s', s); HUD.s = s; HUD.stxt = null; }
      var txt = L(STATE_TXT[s]); if (HUD.stxt !== txt) { chip.textContent = txt; HUD.stxt = txt; }
      if (HUD.stage !== stage) { HUD.stage = stage; $$('#cam-steps li').forEach(function (li, i) { li.setAttribute('data-st', i < stage ? 'done' : i === stage ? 'now' : 'todo'); }); }
      if (HUD.cap !== capKey + M.lang()) { HUD.cap = capKey + M.lang(); $('#cam-cap').textContent = L(CAP[capKey]); }
      root.setAttribute('data-pip', t >= T_HOVER ? '1' : '0');
      var k1 = $('#cam-k1'), k2 = $('#cam-k2');
      k1.setAttribute('data-on', st.k1 ? '1' : '0'); k2.setAttribute('data-on', st.k2 ? '1' : '0');
      $('#cam-k1v').textContent = res ? (st.k1 ? Math.round(res.evidence.vision.confidence * 100) + '%' : (res.evidence.vision.suspect ? bi('اشتباه', 'suspect') : '—')) : '—';
      $('#cam-k2v').textContent = res && res.thermal && res.thermal.maxC != null && (st.k2 || res.thermal.kind === 'hotspot') ? Math.round(res.thermal.maxC) + ' °C' : '—';
      var al = $('#cam-alert'); al.setAttribute('data-on', sent ? '1' : '0');
      if (sent) $('#cam-alert-s').textContent = bi('غرفة التحكم: ينتظر «موافق» من إنسان · بعد ' + Math.max(1, Math.round(st.sentAt - T_CUT)) + ' ث من أول رؤية (SIM)', 'Control room: waiting for a human Approve · ' + Math.max(1, Math.round(st.sentAt - T_CUT)) + ' s after first sight (SIM)');
      $('#cam-clock').textContent = mmss(t);
      $('#cam-tele').textContent = t < T_CUT ? 'ALT 80 m · 18 m/s · BAT 86%' : 'ALT 80 m · HOVER · BAT 85%';
      view.setAttribute('data-fade', t > T_FADEOUT && !reduced() ? '1' : '0');
    }
    var lastDraw = -1;
    function drawAll(t, force) {
      if (!force && t > 0 && Math.abs(t - lastDraw) < 0.045) return; lastDraw = t;
      var res = t >= T_HOVER ? st.res : null;
      paint(t, res);
      if (t >= T_HOVER && st.th) { DS.toCanvas(st.th, thc); }
      hud(t);
    }
    // advance the story to time t, stepping the detector at FPS (so a jump never skips the temporal state)
    function advance(t) {
      if (t < T_HOVER) { if (st.res) { reset(); } drawAll(t); return; }
      var from = fT < T_HOVER - 1 / FPS ? T_HOVER : fT + 1 / FPS, f, n = 0;
      for (f = from; f <= t + 1e-6 && n < 400; f += 1 / FPS, n++) { analyseAt(f); fT = f; }
      drawAll(t);
    }
    function onTick(t) { if (!sc) return; advance(t); }
    function still() {                                           // reduced motion: one frame at the moment everything is in (the detector replays the last two seconds)
      if (!build()) return; resize(); reset();
      var f0 = Math.max(T_HOVER, T_STILL - 2.6), f;
      for (f = f0; f <= T_STILL + 1e-6; f += 1 / FPS) { analyseAt(f); fT = f; }
      drawAll(T_STILL, true);
    }
    function syncBtn() { setPlayBtn($('#cam-play'), player ? player.playing : false); }
    C.init = function () {
      readTokens(root);
      if (!build()) return;
      resize();
      player = Player({ node: root, dur: LOOP, hold: 0, loop: true, onTick: onTick, onRestart: reset, onState: syncBtn });
      C.player = player; syncBtn();
      $('#cam-play').addEventListener('click', function () {
        if (reduced() && !player.playing && player.t === 0) { reset(); }
        player.toggle();
      });
      $('#cam-restart').addEventListener('click', function () { reset(); player.restart(); });
      function applyMode() {
        if (reduced()) { player.pause(); still(); }
        else if (!player.playing && player.t === 0) { player.play(); }
      }
      if (mq.addEventListener) mq.addEventListener('change', applyMode); else if (mq.addListener) mq.addListener(applyMode);
      if (reduced()) { player.pause(); still(); } else { advance(0); player.kick(); }
      if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); if (player && !player.playing) drawAll(player.t || (reduced() ? T_STILL : 0), true); }).observe(view);
      else window.addEventListener('resize', function () { resize(); });
      onLang(function () { HUD.cap = null; HUD.stxt = null; syncBtn(); drawAll(!player.playing && reduced() && player.t === 0 ? T_STILL : player.t, true); });
      onTheme(function () { readTokens(root); });
      C.ready = true; root.setAttribute('data-state', 'ready');
    };
    C.state = function () { return { t: player ? player.t : 0, playing: player ? player.playing : false, k1: st.k1, k2: st.k2, confirmedAt: st.confirmedAt, sentAt: st.sentAt, res: st.res }; };
    C.still = still; C.times = { T_CUT: T_CUT, T_HOVER: T_HOVER, SENT_DELAY: SENT_DELAY, T_STILL: T_STILL, LOOP: LOOP };
    return C;
  })();

  /* ======================================================================= 3. ALL HAZARDS: six aerial frames, RGB or thermal, one detector */
  var hz = (function () {
    var DS = window.ManaraDroneScene, grid = $('#hz-grid'), Z = { cards: {} };
    if (!grid) return Z;
    var CFG = {
      fire: { kind: 'fire', seed: 3, opts: { timeOfDay: 16.5, context: 'urban', pitchDeg: 58 }, hyp: 'fire', cam: 'rgb', zoom: 1 },
      gas: { kind: 'gas', seed: 5, opts: { timeOfDay: 7.2 }, hyp: 'gas', cam: 'th', zoom: 1 },
      flood: { kind: 'flood', seed: 8, opts: { timeOfDay: 10, context: 'road' }, hyp: 'flood', cam: 'rgb', zoom: 1 },
      dust: { kind: 'dust', seed: 4, opts: { timeOfDay: 14 }, hyp: 'dust', cam: 'rgb', zoom: 1 },
      heat: { kind: 'heat', seed: 6, opts: { timeOfDay: 13 }, hyp: 'heat', cam: 'th', zoom: 2.6, hours: true },
      sos: { kind: 'sos', seed: 9, opts: { timeOfDay: 2 }, hyp: 'sos', cam: 'th', zoom: 2.6, hours: true }
    };
    var RW = 480, RH = 300;
    function build(id, hour) {
      var c = CFG[id], o = {}, k; for (k in c.opts) o[k] = c.opts[k]; o.width = RW; o.height = RH; if (hour != null) o.timeOfDay = hour;
      var desc = DS.preset(c.kind, c.seed, o), scene = DS.create(desc), rgb, th, res;
      if (id === 'fire') { var v = DS.verify(scene, { seconds: 2.2, fps: 12 }); res = v.result; rgb = scene.renderRGB(2.2 - 1 / 12); th = scene.renderThermal(2.2 - 1 / 12); }
      else { rgb = scene.renderRGB(0.5); th = scene.renderThermal(0.5); res = DS.analyze(rgb, { thermal: th, hypothesis: c.hyp, lang: M.lang() }); }
      return { rgb: rgb, th: th, res: res, id: id, hour: desc.timeOfDay };
    }
    function keysOf(id, S) {
      var r = S.res, th = r.thermal || {}, cues = r.vision ? r.vision.cues : {}, o = { vis: false, thm: false, vtxt: null, ttxt: null };
      if (id === 'fire') { o.vis = r.evidence.vision.seen; o.thm = th.kind === 'hotspot'; o.vtxt = T('رؤية: لهب ودخان', 'Vision: flames and smoke'); o.ttxt = T('حرارة: بؤرة ' + (th.maxC != null ? Math.round(th.maxC) + ' °م' : ''), 'Thermal: hot spot ' + (th.maxC != null ? Math.round(th.maxC) + ' °C' : '')); }
      else if (id === 'gas') { o.vis = false; o.thm = !!(th.coldPlumes && th.coldPlumes.length); o.vtxt = T('رؤية: لا شيء ظاهر', 'Vision: nothing visible'); o.ttxt = T('حرارة: سحابة باردة (مرشَّحة)', 'Thermal: cold cloud (a candidate)'); }
      else if (id === 'flood') { o.vis = cues.water >= 0.5; o.thm = false; o.vtxt = T('رؤية: ماء فوق الطريق', 'Vision: water over the road'); o.ttxt = T('حرارة: لا تقيس العمق', 'Thermal: cannot measure depth'); }
      else if (id === 'dust') { o.vis = cues.haze >= 0.5; o.thm = false; o.vtxt = T('رؤية: حجاب غبار وتباين منخفض', 'Vision: a dust veil, low contrast'); o.ttxt = T('حرارة: لا ترى الغبار', 'Thermal: does not see dust'); }
      else { o.vis = cues.person >= 1; o.thm = !!(th.people && th.people.length); o.vtxt = T('رؤية: شخص (سترة عاكسة)', 'Vision: a person (hi-vis vest)'); o.ttxt = o.thm ? T('حرارة: شخص ظاهر بوضوح', 'Thermal: the person is seen') : T('حرارة: لا يرى شيئًا (الأرض أسخن من الجسم)', 'Thermal: sees nothing (the ground is hotter than a body)'); }
      return o;
    }
    function paint(card) {
      var S = card.S; if (!S) return; var c = CFG[card.id], cv = card.cv, ctx = cv.getContext('2d'), sz = sizeCanvas(cv, cv.parentNode), W = sz[0], H = sz[1], D = sz[2];
      var src = card.cam === 'th' ? S.th : S.rgb, off = card.off || (card.off = document.createElement('canvas'));
      frameToCanvas(src, off);
      var z = c.zoom, vw = 1 / z, vx = (1 - vw) / 2, vy = (1 - vw) / 2;
      if (z === 1) { vx = 0; vy = 0; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, vx * off.width, vy * off.height, vw * off.width, vw * off.height, 0, 0, cv.width, cv.height);
      ctx.setTransform(D, 0, 0, D, 0, 0);
      var wantTh = card.cam === 'th';
      var view = { x0: vx, y0: vy, w: vw, h: vw };
      drawDet(DS, ctx, S.res, W, H, { view: view, keep: true, noCross: !wantTh, filter: function (b) {
        if (card.id === 'fire') return wantTh ? b.source === 'thermal' : b.source === 'rgb';
        if (card.id === 'gas') return wantTh && b.kind === 'cold-plume';
        if (card.id === 'heat' || card.id === 'sos') return wantTh && b.kind === 'person';
        return false;
      } });
      // ground truth marker (SIM): for the people frames the person IS at the centre of the picture; show it when the detector does not
      if ((card.id === 'heat' || card.id === 'sos') && wantTh) {
        var seen = S.res.thermal && S.res.thermal.people && S.res.thermal.people.length;
        if (!seen) {
          var cx = W / 2, cy = H / 2, r = Math.max(14, W / 12);
          ctx.save(); ctx.strokeStyle = tk('warn'); ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          var lab = bi('هنا شخص (حقيقة المحاكاة) — لم يُكشف', 'a person is here (SIM ground truth), not detected'); ctx.font = '600 ' + clamp(Math.round(W / 34), 10, 13) + 'px ' + (M.lang() === 'ar' ? TOKS.font : TOKS.mono); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var tw = ctx.measureText(lab).width + 12; ctx.fillStyle = tk('bg'); ctx.globalAlpha = 0.82; ctx.fillRect(cx - tw / 2, cy + r + 6, tw, 20); ctx.globalAlpha = 1; ctx.fillStyle = tk('warn'); ctx.fillText(lab, cx, cy + r + 16);
          ctx.restore();
        }
      }
      cv.setAttribute('aria-label', bi(cv.getAttribute('data-aria-ar'), cv.getAttribute('data-aria-en')) + ' — ' + bi(card.cam === 'th' ? 'الكاميرا الحرارية' : 'الكاميرا العادية', card.cam === 'th' ? 'thermal camera' : 'RGB camera'));
    }
    function text(card) {
      var S = card.S, out = card.res; if (!S || !out) return;
      var k = keysOf(card.id, S), n = (k.vis ? 1 : 0) + (k.thm ? 1 : 0);
      clear(out);
      function line(ok, t) { var s = el('span', ok ? 'ok' : 'no'); s.appendChild(el('b', null, ok ? '✔ ' : '✘ ')); s.appendChild(document.createTextNode(L(t))); out.appendChild(s); out.appendChild(el('br')); }
      line(k.vis, k.vtxt); line(k.thm, k.ttxt);
      var verdict = card.id === 'fire' ? (n === 2 ? T('= مفتاحان مستقلان: مؤكَّد (ثم موافقة إنسان)', '= two independent keys: CONFIRMED (then a human Approve)') : T('= مفتاح واحد: اشتباه فقط', '= one key: SUSPECT only'))
        : card.id === 'gas' ? T('= مفتاح واحد: المفتاح الثاني حسّاس غاز', '= one key: the second must be a gas sensor')
        : card.id === 'flood' ? T('= مفتاح واحد: المفتاح الثاني مسبار منسوب أو تحذير الأرصاد', '= one key: the second is a level probe or a weather warning')
        : card.id === 'dust' ? T('= مفتاح واحد: المفتاح الثاني مستشعر جسيمات أو تحذير الأرصاد', '= one key: the second is a particle sensor or a weather warning')
        : n === 2 ? T('= مفتاحان: الشخص مرئي بالكاميرتين', '= two keys: the person is seen by both cameras') : T('= الحرارة وحدها لا تكفي في هذه الساعة؛ نعتمد مفتاحًا آخر (بلاغ أو حارس)', '= thermal alone is not enough at this hour; we rely on another key (a report or a sentinel)');
      var vb = el('small', 'v', L(verdict)); out.appendChild(vb);
    }
    function render(card) { if (!card.S) return; paint(card); text(card); }
    function ensure(card) {
      if (card.S || card.busy) return; card.busy = true;
      setTimeout(function () {
        try { card.S = build(card.id, card.hour); render(card); } catch (e) { if (window.console) console.error(e); }
        card.busy = false;
      }, 30 + 60 * card.order);
    }
    function init() {
      if (!DS) return;
      readTokens(document.documentElement);
      $$('.hz', grid).forEach(function (art, i) {
        var id = art.getAttribute('data-hz'), c = CFG[id]; if (!c) return;
        var card = { id: id, art: art, cv: $('.hz-cv', art), res: $('.hz-res', art), cam: c.cam, hour: c.hours ? c.opts.timeOfDay : null, order: i, S: null };
        Z.cards[id] = card;
        $$('.hz-seg:not(.hz-time) .chip', art).forEach(function (b) {
          b.addEventListener('click', function () { card.cam = b.getAttribute('data-cam'); $$('.hz-seg:not(.hz-time) .chip', art).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); render(card); });
        });
        $$('.hz-time .chip', art).forEach(function (b) {
          b.addEventListener('click', function () {
            card.hour = +b.getAttribute('data-hour'); $$('.hz-time .chip', art).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
            card.S = null; card.busy = false; ensure(card);
          });
        });
        // reflect the card's default state on its chips and load when it is near the viewport
        $$('.hz-seg:not(.hz-time) .chip', art).forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-cam') === card.cam ? 'true' : 'false'); });
        cv_aria(card);
        if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); ensure(card); } }, { rootMargin: '500px' }); io.observe(art); } else ensure(card);
      });
      onLang(function () { Object.keys(Z.cards).forEach(function (k) { var c = Z.cards[k]; cv_aria(c); if (c.S) render(c); }); });
      onTheme(function () { readTokens(document.documentElement); Object.keys(Z.cards).forEach(function (k) { if (Z.cards[k].S) paint(Z.cards[k]); }); });
      window.addEventListener('resize', function () { Object.keys(Z.cards).forEach(function (k) { if (Z.cards[k].S) paint(Z.cards[k]); }); });
    }
    function cv_aria(card) { card.cv.setAttribute('aria-label', bi(card.cv.getAttribute('data-aria-ar'), card.cv.getAttribute('data-aria-en'))); }
    Z.init = init; Z.CFG = CFG; Z.build = build; Z.keysOf = keysOf;
    return Z;
  })();

  /* ======================================================================= 4. THE ROBOT: a scripted illustration (SIM) of the simulated prototype */
  var rob = (function () {
    var host = $('#rob-svg'), R = { ready: false };
    if (!host) return R;
    // geometry (SVG units): three floors, six rooms each, a corridor under the rooms, Stair A (left, locked) and Stair B (right)
    var X0 = 76, RWD = 80, RH = 58, FY = { 3: 22, 2: 126, 1: 230 }, CORR_H = 26, COR = {};
    [3, 2, 1].forEach(function (f) { COR[f] = FY[f] + RH + CORR_H / 2 + 4; });
    var STAIR_B = 584, STAIR_A = 46, START_X = 14;
    function roomX(i) { return X0 + (i - 1) * RWD; }            // i = 1..6 → rooms 301..306 etc.
    var PATH = [[START_X, COR[1]], [STAIR_B, COR[1]], [STAIR_B, COR[2]], [STAIR_B, COR[3]], [roomX(2) + RWD / 2, COR[3]]];
    var SEG = [], LEN = 0;
    PATH.forEach(function (p, i) { if (i) { var d = Math.hypot(p[0] - PATH[i - 1][0], p[1] - PATH[i - 1][1]); SEG.push({ a: PATH[i - 1], b: p, d: d, s0: LEN }); LEN += d; } });
    function at(s) { s = clamp(s, 0, LEN); for (var i = 0; i < SEG.length; i++) if (s <= SEG[i].s0 + SEG[i].d || i === SEG.length - 1) { var q = SEG[i], u = q.d ? (s - q.s0) / q.d : 0; return [lerp(q.a[0], q.b[0], u), lerp(q.a[1], q.b[1], u)]; } return PATH[0]; }
    var sOf = function (x) { return LEN - (x - (roomX(2) + RWD / 2)); };            // path length when the robot is at x on the third-floor corridor
    var xR305 = roomX(5) + RWD / 2, xR304 = roomX(4) + RWD / 2, xR302 = roomX(2) + RWD / 2;
    // keyframes: [progress, path length]; pauses where the robot stops to look
    var KF = [[0, 0], [0.07, 0], [0.33, PATH[1][0] - START_X], [0.40, PATH[1][0] - START_X + (COR[1] - COR[2])], [0.47, PATH[1][0] - START_X + (COR[1] - COR[3])],
      [0.57, sOf(xR305)], [0.65, sOf(xR305)], [0.74, sOf(xR304)], [0.82, sOf(xR304)], [0.92, sOf(xR302)], [1, sOf(xR302)]];
    function sAt(p) { for (var i = 1; i < KF.length; i++) if (p <= KF[i][0]) { var a = KF[i - 1], b = KF[i], u = (p - a[0]) / (b[0] - a[0]); return lerp(a[1], b[1], ease(u) * 0.35 + u * 0.65); } return KF[KF.length - 1][1]; }
    var FEED = [
      { at: 0.00, k: 'ok', t: T('قائد الحادث يوافق على نشر الروبوت (مفتاح الإنسان).', 'The incident commander approves the robot (the human key).') },
      { at: 0.08, k: 'info', t: T('الروبوت RB-01 عند المدخل. الدرج A مقفل فيصعد من الدرج B.', 'RB-01 at the entrance. Stair A is locked, so it climbs Stair B.') },
      { at: 0.48, k: 'info', t: T('دخان في الطابق الثالث فتقلّ سرعته. الغرفة 303 أسخن من حدّه فلا يدخلها.', 'Smoke on the third floor slows it. Room 303 is hotter than its limit, so it does not enter.') },
      { at: 0.58, k: 'lock', t: T('باب الغرفة 305 مقفل: يُبلغ الفرق ولا يكسره.', 'The door of room 305 is locked: it reports to the crews and never forces it.') },
      { at: 0.75, k: 'find', t: T('الغرفة 304: وجد نائمًا بالحرارة والصوت، ويحاول إيقاظه ويرشده بلغته.', 'Room 304: found someone asleep by heat and sound; it tries to wake them and guides them in their language.') },
      { at: 0.93, k: 'find', t: T('الغرفة 302: وجد شخصًا على كرسي متحرك: «ابقَ هنا، المساعدة قادمة»، ويترك منارات المسار.', 'Room 302: found a person in a wheelchair: “stay here, help is coming”, and it drops route beacons.') },
      { at: 0.99, k: 'ok', t: T('2 وُجدا و1 باب مقفل: بطاقة التسليم إلى الفرق (SIM).', '2 found and 1 locked door: the hand-off card goes to the crews (SIM).') }
    ];
    var svg, parts = {}, DUR = 18, HOLD = 3, lastFeed = -1, player = null;
    function build() {
      clear(host); parts = {};
      var g = sv('g', null, host);
      sv('rect', { class: 'rb-bg', x: 0, y: 0, width: 640, height: 344 }, g);
      [3, 2, 1].forEach(function (f) {
        sv('rect', { class: 'rb-floor', x: X0 - 36, y: FY[f] - 8, width: RWD * 6 + 72, height: RH + CORR_H + 20, rx: 8 }, g);
        sv('rect', { class: 'rb-corr', x: X0, y: FY[f] + RH + 4, width: RWD * 6, height: CORR_H, rx: 4 }, g);
        var t = sv('text', { class: 'rb-flabel', x: 6, y: FY[f] + 30 }, g); t.textContent = f + '';
        for (var i = 1; i <= 6; i++) {
          var hot = f === 3 && i === 3, r = sv('rect', { class: 'rb-room' + (hot ? ' hot' : ''), x: roomX(i) + 3, y: FY[f], width: RWD - 6, height: RH, rx: 5 }, g);
          if (f === 3) parts['r30' + i] = r;
          var lb = sv('text', { class: 'rb-label', x: roomX(i) + 8, y: FY[f] + 15 }, g); lb.textContent = f + '0' + i;
        }
        sv('path', { class: 'rb-stair', d: 'M' + (STAIR_A - 14) + ' ' + (FY[f] + RH + 10) + 'l7 -9 7 9 7 -9 7 9' }, g);
        sv('path', { class: 'rb-stair', d: 'M' + (STAIR_B - 14) + ' ' + (FY[f] + RH + 10) + 'l7 -9 7 9 7 -9 7 9' }, g);
      });
      // residents who are already out / counted (floors 1 and 2) and the ones still inside (floor 3)
      [[1, 2], [1, 4], [2, 1], [2, 5], [2, 6]].forEach(function (p) { sv('circle', { class: 'rb-person out', cx: roomX(p[1]) + 40, cy: FY[p[0]] + 38, r: 6 }, g); });
      parts.p302 = sv('circle', { class: 'rb-person', cx: roomX(2) + 40, cy: FY[3] + 38, r: 7 }, g);
      parts.p304 = sv('circle', { class: 'rb-person', cx: roomX(4) + 40, cy: FY[3] + 38, r: 7 }, g);
      parts.p305 = sv('circle', { class: 'rb-person', cx: roomX(5) + 40, cy: FY[3] + 38, r: 7 }, g);
      parts.ring302 = sv('circle', { class: 'rb-ring', cx: roomX(2) + 40, cy: FY[3] + 38, r: 14 }, g);
      parts.ring304 = sv('circle', { class: 'rb-ring', cx: roomX(4) + 40, cy: FY[3] + 38, r: 14 }, g);
      // fire in 303, smoke over the third-floor corridor
      var fx = roomX(3) + 40, fy = FY[3] + 50;
      sv('path', { class: 'rb-fire', d: 'M' + (fx - 14) + ' ' + fy + 'q2 -18 8 -26 q0 12 8 14 q4 -10 2 -22 q14 14 12 34z' }, g);
      parts.smoke = sv('rect', { class: 'rb-smoke', x: roomX(2) + 6, y: FY[3] + RH + 4, width: RWD * 4, height: CORR_H, rx: 8 }, g);
      // locks: Stair A (the exit nobody can use) and the door of 305
      parts.lockA = sv('rect', { class: 'rb-lock', x: STAIR_A - 9, y: COR[1] - 9, width: 18, height: 14, rx: 3 }, g);
      parts.lock305 = sv('rect', { class: 'rb-lock', x: roomX(5) + 3, y: COR[3] - 20, width: 14, height: 11, rx: 3 }, g);
      // trail, beacons, robot
      parts.trail = sv('path', { class: 'rb-trail', d: '' }, g);
      parts.beacons = []; for (var b = 0; b < 3; b++) parts.beacons.push(sv('circle', { class: 'rb-beacon', cx: xR302 + 70 + b * 60, cy: COR[3] + 11, r: 4 }, g));
      parts.robot = sv('g', { class: 'rb-robot' }, g);
      sv('rect', { x: -12, y: -8, width: 24, height: 16, rx: 5 }, parts.robot); sv('circle', { cx: -5, cy: 0, r: 2.6 }, parts.robot); sv('circle', { cx: 5, cy: 0, r: 2.6 }, parts.robot);
      sv('path', { d: 'M-12 9h24', stroke: tk('accent'), 'stroke-width': 3, 'stroke-linecap': 'round' }, parts.robot);
      parts.say = sv('g', { class: 'rb-sayg' }, g); parts.sayBox = sv('rect', { class: 'rb-say', x: 0, y: 0, width: 150, height: 24, rx: 8 }, parts.say); parts.sayT = sv('text', { class: 'rb-say-t', x: 8, y: 16 }, parts.say);
    }
    function bubbleFor(p) {
      if (p >= 0.93 && p < 0.99) return { x: xR302, t: T('ابقَ هنا، المساعدة قادمة', 'Stay here, help is coming') };
      if (p >= 0.75 && p < 0.9) return { x: xR304, t: T('استيقظ! اتبع الضوء الأخضر', 'Wake up! Follow the green light') };
      if (p >= 0.58 && p < 0.7) return { x: xR305, t: T('باب مقفل — أُبلغ الفرق', 'Locked door — reporting') };
      return null;
    }
    function render(p) {
      if (!parts.robot) return;
      var s = sAt(p), pos = at(s);
      parts.robot.setAttribute('transform', 'translate(' + pos[0].toFixed(1) + ' ' + pos[1].toFixed(1) + ')');
      // trail up to s
      var d = 'M' + PATH[0][0] + ' ' + PATH[0][1];
      SEG.forEach(function (q) { if (s >= q.s0) { var e = at(Math.min(s, q.s0 + q.d)); d += 'L' + e[0].toFixed(1) + ' ' + e[1].toFixed(1); } });
      parts.trail.setAttribute('d', d);
      var f302 = p >= 0.93, f304 = p >= 0.75, l305 = p >= 0.58;
      parts.p302.setAttribute('class', 'rb-person' + (f302 ? ' found' : '')); parts.p304.setAttribute('class', 'rb-person' + (f304 ? ' found' : ''));
      parts.ring302.style.opacity = f302 ? 1 : 0; parts.ring304.style.opacity = f304 ? 1 : 0;
      parts.r302 && parts.r302.setAttribute('class', 'rb-room' + (f302 ? ' seen' : '')); parts.r304 && parts.r304.setAttribute('class', 'rb-room' + (f304 ? ' seen' : ''));
      parts.lock305.style.opacity = l305 ? 1 : 0.28;
      parts.smoke.style.opacity = p >= 0.4 ? 0.9 : 0.35;
      parts.beacons.forEach(function (b, i) { b.style.opacity = p >= 0.93 + i * 0.02 ? 1 : 0; });
      var bu = bubbleFor(p);
      if (bu) { var txt = L(bu.t); parts.sayT.textContent = txt; var w = Math.max(110, txt.length * (M.lang() === 'ar' ? 7.2 : 6.6) + 18); parts.sayBox.setAttribute('width', w); var bx = clamp(pos[0] - w / 2, 4, 636 - w); parts.say.setAttribute('transform', 'translate(' + bx.toFixed(1) + ' ' + (pos[1] - 46).toFixed(1) + ')'); parts.say.style.opacity = 1; } else parts.say.style.opacity = 0;
      var found = (f302 ? 1 : 0) + (f304 ? 1 : 0);
      $('#rob-count').textContent = found + ' / 2'; $('#rob-clock').textContent = mmss(p * 62);
      var sc = $('#rob-scrub'); if (sc && document.activeElement !== sc) sc.value = String(Math.round(p * 100));
      feed(p);
    }
    function feed(p) {
      var n = 0; FEED.forEach(function (f, i) { if (p >= f.at) n = i + 1; });
      var ls = M.lang(); var key = n + ls; if (key === lastFeed) return; lastFeed = key;
      var ol = $('#rob-feed'); clear(ol);
      FEED.slice(Math.max(0, n - 4), n).forEach(function (f) {
        var li = el('li'); li.setAttribute('data-k', f.k); li.appendChild(el('time', 'num', mmss(f.at * 62))); li.appendChild(el('span', null, L(f.t))); ol.appendChild(li);
      });
    }
    R.init = function () {
      readTokens($('#rob'));
      build();
      var still = reduced();
      player = Player({ node: $('#rob'), dur: DUR, hold: HOLD, loop: true, onTick: function (t) { render(clamp(t / DUR, 0, 1)); }, onState: function () { setPlayBtn($('#rob-play'), player.playing); } });
      R.player = player; setPlayBtn($('#rob-play'), player.playing);
      if (still) { player.t = DUR; player.pause(); render(1); } else render(0);
      $('#rob-play').addEventListener('click', function () { if (reduced() && player.t >= DUR) { player.t = 0; player.ended = false; } player.toggle(); });
      var sc = $('#rob-scrub');
      sc.addEventListener('input', function () { var p = clamp(+sc.value / 100, 0, 1); player.t = p * DUR; player.ended = false; if (player.playing) player.pause(); render(p); });
      var applyMode = function () { if (reduced() && player.playing) { player.pause(); } };
      if (mq.addEventListener) mq.addEventListener('change', applyMode);
      onLang(function () { lastFeed = -1; build(); setPlayBtn($('#rob-play'), player.playing); render(clamp(player.t / DUR, 0, 1)); });
      onTheme(function () { readTokens($('#rob')); build(); render(clamp(player.t / DUR, 0, 1)); });
      R.ready = true;
    };
    R.render = render; R.sAt = sAt; R.LEN = LEN; R.FEED = FEED;
    return R;
  })();

  /* ======================================================================= boot */
  function boot() {
    try { brandOverride(); } catch (e) { /* the shell keeps its own text */ }
    applyAria(); onLang(applyAria);
    [initLogo, initCounts, initNumbersFilter, initSubnav, initPlaceholders, cam.init, hz.init, rob.init].forEach(function (fn) {
      if (typeof fn !== 'function') return;
      try { fn(); } catch (e) { if (window.console) console.error(e); }
    });
    window.ManaraHome = window.ManaraHome || {};
    window.ManaraHome.core = { ready: true, setPlayBtn: setPlayBtn, cam: cam, hz: hz, rob: rob, Player: Player, drawDet: drawDet, icon: icon, fromHTML: fromHTML, tk: tk, readTokens: readTokens, sizeCanvas: sizeCanvas, el: el, sv: sv, clear: clear, bi: bi, mmss: mmss, reduced: reduced };
    window.__homeReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
