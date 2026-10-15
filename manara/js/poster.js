/* MANARA («منارة») — Display board  →  poster.html            window.ManaraPoster (test hooks)
 * ==========================================================================================
 * A print-ready booth board in two layouts that share the same modules:
 *   tri  — three panels side by side (3 × A3 portrait, 90 × 60 cm, 3 × A2, or a custom panel size)
 *   a0   — one A0 portrait poster (841 × 1189 mm): a hero banner, two columns, a team strip
 * Everything is sized in --u (1/100 of a panel width, in mm) so the layout scales from CSS custom properties.
 * Auto-fit: the page finds the largest type scale (--k, 0.55 … 1.2) at which no panel overflows, so a custom size,
 * a longer name or the second language never silently cuts text off.
 * The preview is the physical board scaled with a CSS transform; printing removes the transform, injects the
 * matching @page size into #page-rule, and breaks one panel per page.
 *
 * Numbers: the measured results in RESULTS were copied from real runs on 2026-10-08
 *   node manara/tools/test-fire.mjs  (43 checks passed)     node manara/tools/test-sim.mjs  (253 checks passed, seed 1)
 *   node manara/tools/test-qatar-data.mjs (91 checks)        node manara/tools/test-national.mjs (212 checks); the whole-of-Qatar map (module 09) is drawn from
 *   data/qatar-*.js (OpenStreetMap snapshot, ODbL) and the farther-but-faster example is ManaraNational.findFartherButFaster(7)
 * and manara/tools/test-poster.mjs re-computes them (fire detector + simulation) and fails if they drift.
 * Every simulated figure is labelled SIM; the detector is "rule-based computer vision", never "AI".
 * Safety: no user text is ever assigned to innerHTML (textContent / DOM nodes only). Classic script, no libraries.
 * The QR encoder below is ours (byte mode, versions 1–10, levels L/M/Q/H) and is checked against a reference in the test.
 */
(function () {
  'use strict';
  var M = window.Manara;
  if (!M) return;
  var d = document.documentElement;
  var $ = M.$, $$ = M.$$, L = M.L;
  var NS = 'http://www.w3.org/2000/svg';

  /* ======================================================================= measured results (embedded, dated) */
  var RESULTS = {
    date: '2026-10-08',
    fire: {
      cmd: 'node manara/tools/test-fire.mjs', checks: 43,
      sets: [
        { id: 'sample', ok: 14, n: 16, tuned: true, name: { ar: 'مجموعة العيّنات — ضُبط عليها', en: 'Sample set — tuned on' } },
        { id: 'tuning', ok: 13, n: 16, tuned: true, name: { ar: 'مجموعة الضبط — ضُبط عليها', en: 'Tuning set — tuned on' } },
        { id: 'heldout', ok: 12, n: 18, tuned: false, name: { ar: 'مجموعة الاختبار — لم تُستعمل أبدًا', en: 'Held-out test — never used' } }
      ],
      held: { fireFound: [6, 6], falseFire: [3, 12], smokeFound: [0, 3], tricky: [7, 11] },
      video: { frames: 20 }
    },
    sim: {
      cmd: 'node manara/tools/test-sim.mjs', checks: 253, seed: 1,
      fire: { p90: [626, 317], injured: [10, 5], dispatch: [225, 47], onScene: [339, 161], siren: 14, personal: 39 },
      others: [
        { id: 'gas', icon: 'gas', sc: '--warn', pair: [33369, 3024], unit: { ar: 'شخص·ث', en: 'person-s' },
          name: { ar: 'تسرّب غاز', en: 'Gas leak' }, metric: { ar: 'الوقت في الغاز', en: 'Time in the gas' } },
        { id: 'flood', icon: 'flood', sc: '--info', pair: [245, 89], unit: { ar: 'شخص·ث', en: 'person-s' },
          name: { ar: 'سيول', en: 'Flash flood' }, metric: { ar: 'الوقت في المياه العميقة', en: 'Time in deep water' } },
        { id: 'dust', icon: 'dust', sc: '--brand', pair: [82, 14], unit: { ar: 'مصاب', en: 'injured' },
          name: { ar: 'عاصفة غبارية', en: 'Dust storm' }, metric: { ar: 'مصابون في النموذج', en: 'Injured in the model' } },
        { id: 'heat', icon: 'heat', sc: '--danger', pair: [15, 5], unit: { ar: 'حالة', en: 'cases' },
          name: { ar: 'إجهاد حراري', en: 'Extreme heat' }, metric: { ar: 'انهيارات حرارية', en: 'Heat collapses' } },
        { id: 'sos', icon: 'sos', sc: '--safe', pair: [291, 98], unit: { ar: 'ث', en: 's' },
          name: { ar: 'استغاثة', en: 'Someone needs help' }, metric: { ar: 'الزمن حتى وصول المساعدة', en: 'Time until help arrives' } },
        { id: 'school', icon: 'fire', sc: '--danger', pair: [425, 245], unit: { ar: 'ث', en: 's' },
          name: { ar: 'حريق مدرسة نهارًا', en: 'School fire by day' }, metric: { ar: 'وصول الوحدات إلى الموقع', en: 'Units on scene' } }
      ],
      dispatch: { nearM: 500, farM: 1118, nearS: 181, farS: 118, hour: '07:30' }
    },
    national: {"cmd":"ManaraNational.findFartherButFaster(7) · ManaraNational.ab({seed: 7, n: 150})","seed":7,"snapshot":"2026-10-08","data":{"facilities":138,"roadKm":6116,"officialNames":73,"missingInOsm":23,"dataChecks":91,"engineChecks":212},"ab":{"n":150,"differsPct":64.7,"meanSavedSec":63,"medianSavedSec":0,"p90SavedSec":242},"ex":{"seed":7,"clock":"17:45:00","dow":{"ar":"الأحد","en":"Sunday"},"date":"2026-07-12","kind":"fire","incident":{"lon":51.52418,"lat":25.23645,"place":{"ar":"نعيجة","en":"Nuaija"},"muni":"doha"},"fastest":{"unitId":"fire:fire-w492127496","name":{"ar":"مركز إطفاء — (بلا اسم في OSM) — الوكرة","en":"Fire station — (unnamed in OSM) — Al Wakrah"},"etaSec":754,"freeFlowEtaSec":549,"roadKm":13.5,"straightKm":10,"congestedSegments":63,"worst":{"ar":"طريق الوكرة","en":"Al Wakra Road"},"base":[51.602522,25.180508],"route":[[51.6026,25.1805],[51.6026,25.1805],[51.6029,25.1805],[51.604,25.1783],[51.6043,25.1776],[51.6045,25.1772],[51.6046,25.1771],[51.6047,25.1772],[51.6048,25.1773],[51.6046,25.1776],[51.6037,25.1793],[51.6029,25.1807],[51.6017,25.183],[51.6012,25.184],[51.6002,25.186],[51.5976,25.1909],[51.5972,25.1918],[51.5971,25.192],[51.5971,25.192],[51.5968,25.1919],[51.5959,25.1916],[51.5917,25.19],[51.5904,25.1895],[51.5881,25.1886],[51.587,25.1883],[51.5868,25.1883],[51.5868,25.1882],[51.5853,25.1877],[51.5852,25.1877],[51.5834,25.1872],[51.5832,25.1872],[51.5815,25.187],[51.5794,25.1869],[51.5769,25.1869],[51.5761,25.1869],[51.5759,25.1869],[51.5749,25.1869],[51.5705,25.1869],[51.5687,25.1869],[51.5686,25.1869],[51.5677,25.1869],[51.5664,25.1869],[51.5658,25.1869],[51.5656,25.1869],[51.5647,25.1869],[51.5632,25.1869],[51.5608,25.1869],[51.56,25.1869],[51.5599,25.1869],[51.5563,25.1865],[51.5522,25.1854],[51.5512,25.1853],[51.5503,25.1855],[51.5491,25.1864],[51.5474,25.188],[51.5463,25.1898],[51.5445,25.1946],[51.5439,25.1964],[51.5424,25.2011],[51.541,25.2053],[51.5393,25.2107],[51.5391,25.2115],[51.5356,25.2181],[51.5337,25.2244],[51.5332,25.226],[51.5321,25.2283],[51.5307,25.2305],[51.5267,25.2346],[51.5256,25.2354],[51.5241,25.2364]]},"nearest":{"unitId":"fire:fire-n11533985781","name":{"ar":"مركز إطفاء — Fire Police Department","en":"Fire station — Fire Police Department"},"etaSec":840,"freeFlowEtaSec":485,"roadKm":10.2,"straightKm":5.7,"congestedSegments":58,"worst":{"ar":"شارع روضة الخيل","en":"Rawdat Al Khail Street"},"base":[51.533203,25.286667],"route":[[51.5334,25.286],[51.5315,25.2856],[51.5311,25.2854],[51.5311,25.2853],[51.5312,25.2852],[51.532,25.2843],[51.5323,25.2839],[51.5324,25.283],[51.5324,25.2828],[51.5319,25.2812],[51.5318,25.281],[51.5317,25.2802],[51.5314,25.2797],[51.5311,25.2796],[51.5306,25.2796],[51.5287,25.2796],[51.5285,25.2795],[51.5285,25.2791],[51.5284,25.2781],[51.5281,25.2753],[51.528,25.275],[51.5279,25.2749],[51.5279,25.2747],[51.5278,25.2745],[51.5276,25.2738],[51.5269,25.2709],[51.5264,25.2691],[51.5264,25.269],[51.5249,25.2646],[51.5248,25.2642],[51.5247,25.2639],[51.5245,25.2632],[51.5245,25.2631],[51.5245,25.2631],[51.5244,25.263],[51.5242,25.262],[51.5242,25.2599],[51.5242,25.2585],[51.5242,25.2572],[51.5241,25.2556],[51.5241,25.255],[51.5241,25.2545],[51.5241,25.2542],[51.5241,25.2539],[51.5241,25.2533],[51.5242,25.2438],[51.524,25.2409],[51.523,25.2383],[51.5221,25.2371],[51.5213,25.2365],[51.5206,25.2366],[51.5203,25.2374],[51.5207,25.2378],[51.5213,25.2379],[51.522,25.2376],[51.526,25.2348],[51.5264,25.2346],[51.5287,25.2325],[51.5324,25.2273],[51.5324,25.2258],[51.5322,25.2255],[51.5313,25.2259],[51.5317,25.2273],[51.5311,25.2278],[51.5324,25.2295],[51.5316,25.2298],[51.5302,25.2316],[51.5284,25.2331],[51.5256,25.2354],[51.5241,25.2364]]},"gainSec":86,"extraStraightKm":4.4,"extraRoadKm":3.3,"reason":"traffic","flips":true}}
  };
  var TIERS = [
    { n: 1, lo: 2, hi: 10, name: { ar: 'حاسوب فقط', en: 'Laptop only' } },
    { n: 2, lo: 80, hi: 227, name: { ar: 'لوحة الحارس (الإجمالي)', en: 'Sentinel board (total)' } },
    { n: 3, lo: 95, hi: 270, name: { ar: 'كشك كامل (الإجمالي)', en: 'Full booth (total)' } }
  ];

  /* ======================================================================= state */
  var KEY = 'manara-poster';
  var SIZES = { a3: { w: 297, h: 420 }, b90: { w: 300, h: 600 }, a2: { w: 420, h: 594 } };
  var A0 = { w: 841, h: 1189 };
  var BLEED = 3, SLUG = 7;
  var LIM = { w: [200, 1000], h: [280, 1400] };
  var DEF = { layout: 'tri', size: 'b90', cw: 300, ch: 500, both: true, paper: false, guides: false, bleed: false, zoom: 'fit', url: '', fields: {} };
  var FIELDS = [
    ['STUDENT_NAME', 'الطالب', 'Student'], ['SCHOOL_NAME', 'المدرسة', 'School'], ['GRADE_CLASS', 'الصف', 'Grade'], ['MENTOR_NAME', 'المرشد / المعلّم', 'Mentor / teacher'],
    ['BUILT_BY_STUDENT', 'بنيتُه بنفسي', 'I built'], ['BOUGHT_OR_REUSED', 'اشتريتُه أو أعدتُ استعماله', 'Bought or reused'], ['HELPED_BY', 'ساعدني فيه', 'Helped by'],
    ['AI_TOOLS_USED', 'أدوات الذكاء الاصطناعي وفيمَ استُعملت', 'AI tools used, and what for']
  ];
  var S = DEF, K = 1, curScale = 1;
  var board, viewer, stagebox, pageRule, pins = [], HOME = {}, a0 = null;
  var ORDER = ['m-problem', 'm-gap', 'm-inclusive', 'm-plug', 'm-limits', 'm-arch', 'm-proof', 'm-hazards', 'm-fast', 'm-try', 'm-results', 'm-hw'];
  var splitAt = 6;
  var ALL = ['m-problem', 'm-gap', 'm-inclusive', 'm-plug', 'm-limits', 'm-hero', 'm-arch', 'm-proof', 'm-hazards', 'm-fast', 'm-try', 'm-results', 'm-hw', 'm-team'];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function cleanText(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function debounce(fn, ms) { var t = 0; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  function load() {
    var o = {}, s = {}, k;
    try { o = JSON.parse(M.store(KEY) || '{}') || {}; } catch (e) { o = {}; }
    for (k in DEF) s[k] = DEF[k];
    if (o.layout === 'a0' || o.layout === 'tri') s.layout = o.layout;
    if (o.size === 'custom' || SIZES[o.size]) s.size = o.size;
    s.cw = clamp(+o.cw || DEF.cw, LIM.w[0], LIM.w[1]);
    s.ch = clamp(+o.ch || DEF.ch, LIM.h[0], LIM.h[1]);
    ['both', 'paper', 'guides', 'bleed'].forEach(function (b) { if (typeof o[b] === 'boolean') s[b] = o[b]; });
    if (o.zoom === 'fit' || o.zoom === 'page' || (typeof o.zoom === 'number' && isFinite(o.zoom) && o.zoom > 0)) s.zoom = o.zoom;
    s.url = cleanText(o.url, 400);
    s.fields = {};
    FIELDS.forEach(function (f) { if (o.fields && typeof o.fields[f[0]] === 'string') s.fields[f[0]] = cleanText(o.fields[f[0]], 120); });
    // URL overrides (deep links, screenshots, tests). They are not saved unless the user changes something.
    var q = {};
    try { new URLSearchParams(location.search).forEach(function (v, key) { q[key] = v; }); } catch (e) { q = {}; }
    if (q.layout === 'a0' || q.layout === 'tri') s.layout = q.layout;
    if (q.size && (SIZES[q.size] || q.size === 'custom')) s.size = q.size;
    if (q.cw) s.cw = clamp(+q.cw || s.cw, LIM.w[0], LIM.w[1]);
    if (q.ch) s.ch = clamp(+q.ch || s.ch, LIM.h[0], LIM.h[1]);
    ['both', 'paper', 'guides', 'bleed'].forEach(function (b) { if (q[b] === '0' || q[b] === '1') s[b] = q[b] === '1'; });
    if (q.zoom === 'fit' || q.zoom === 'page') s.zoom = q.zoom; else if (q.zoom && +q.zoom > 0) s.zoom = +q.zoom;
    return s;
  }
  function save() { try { M.store(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

  function trim() { return S.layout === 'a0' ? A0 : (S.size === 'custom' ? { w: S.cw, h: S.ch } : SIZES[S.size]); }
  function pageInfo() {
    var t = trim(), bl = S.bleed ? BLEED + SLUG : 0;
    return { w: t.w + 2 * bl, h: t.h + 2 * bl, pages: S.layout === 'tri' ? 3 : 1, trimW: t.w, trimH: t.h, bleed: S.bleed };
  }
  function ctx() { var l = M.lang(); return { l: l, o: l === 'ar' ? 'en' : 'ar', both: !!S.both, rtl: d.dir === 'rtl' }; }

  /* ======================================================================= tiny DOM / SVG helpers */
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag), k;
    if (attrs) for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function el(tag, cls, text, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function emptyNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function blNode(tag, spec, cls) {                       // <tag class="bl cls"><span data-l="ar">…</span><span data-l="en">…</span></tag>
    var e = el(tag, 'bl' + (cls ? ' ' + cls : ''));
    ['ar', 'en'].forEach(function (l) { var s = el('span', null, spec[l], e); s.setAttribute('data-l', l); });
    return e;
  }
  function svgReset(svg, w, h, y0) { emptyNode(svg); y0 = y0 || 0; svg.setAttribute('viewBox', '0 ' + y0 + ' ' + w + ' ' + (h - y0)); var f = svg.closest('figure'); var a = f && f.getAttribute('data-alt-' + M.lang()); if (a) svg.setAttribute('aria-label', a); return svg; }
  function fig(name) { var f = $('figure[data-fig="' + name + '"] svg.sv', board); return f; }

  function tlen(t, size) { var n = 0; try { n = t.getComputedTextLength(); } catch (e) { n = 0; } return n > 0 ? n : t.textContent.length * size * 0.55; }
  function fit(t, maxW, size, min) {
    var len = tlen(t, size), s2;
    if (len <= maxW) return;
    s2 = Math.max(min, size * maxW / len);
    t.style.fontSize = s2.toFixed(2) + 'px';
    len = tlen(t, s2);
    if (len > maxW * 1.003) { t.setAttribute('textLength', maxW.toFixed(1)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  }
  // One text line. anchor: 'c' centre, 'l'/'r' = PHYSICAL left/right edge at x (mapped to start/end for the text direction).
  function T(g, str, lang, x, y, o) {
    o = o || {};
    var size = o.size || 16, a = o.anchor || 'c';
    var t = mk('text', { x: x, y: y, lang: lang }, g);
    t.setAttribute('direction', lang === 'ar' ? 'rtl' : 'ltr');
    t.setAttribute('text-anchor', a === 'c' ? 'middle' : (((a === 'l') === (lang !== 'ar')) ? 'start' : 'end'));
    if (o.cls) t.setAttribute('class', o.cls);
    t.style.fontSize = size + 'px';
    t.textContent = str;
    if (o.w) fit(t, o.w, size, o.min || size * 0.6);
    return t;
  }
  // Bilingual label: the page language first and, when both languages show, the other below it; centred on cy.
  function LB(g, spec, x, cy, o) {
    var c = ctx(), size = o.size || 16, ss = o.ssize || size * 0.8, step = o.step || (size + ss) * 0.6;
    var p = spec[c.l], s = spec[c.o], two = c.both && s;
    var y1 = (two ? cy - step / 2 : cy) + size * 0.33;
    T(g, p, c.l, x, y1, { size: size, anchor: o.anchor, w: o.w, cls: o.cls, min: o.min });
    if (two) T(g, s, c.o, x, y1 + step, { size: ss, anchor: o.anchor, w: o.w, cls: o.scls || 't-m', min: o.smin });
  }
  // One line carrying both languages ("primary  ·  secondary"), for tight spots.
  function L1(g, spec, x, y, o) {
    var c = ctx(), s = spec[c.l] + (c.both && spec[c.o] ? '   ·   ' + spec[c.o] : '');
    return T(g, s, c.l, x, y, o);
  }
  function arrow(g, x1, y1, x2, y2, cls, head) {
    var ang = Math.atan2(y2 - y1, x2 - x1), s = head || 7;
    var bx = x2 - Math.cos(ang) * s * 0.9, by = y2 - Math.sin(ang) * s * 0.9, px = -Math.sin(ang) * s * 0.55, py = Math.cos(ang) * s * 0.55;
    mk('path', { d: 'M' + x1 + ' ' + y1 + 'L' + bx + ' ' + by, 'class': cls || 'ln' }, g);
    mk('path', { d: 'M' + x2 + ' ' + y2 + 'L' + (bx + px) + ' ' + (by + py) + 'L' + (bx - px) + ' ' + (by - py) + 'z', 'class': cls === 'ln-d' ? 'arw-d' : 'arw' }, g);
  }
  function icon(g, name, x, y, s, cls) { return mk('use', { href: '#pi-' + name, x: x, y: y, width: s, height: s, 'class': 'ico ' + (cls || '') }, g); }
  function hatch(defs, id, cls) {
    var p = mk('pattern', { id: id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    mk('line', { x1: 0, y1: 0, x2: 0, y2: 7, 'class': cls }, p);
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function unitS() { return M.lang() === 'ar' ? 'ث' : 's'; }
  function ltrNum(s) { return '\u2066' + s + '\u2069'; }          // keep "1–2" and "1,118" left-to-right inside Arabic text

  /* ======================================================================= diagrams (inline SVG, drawn in code) */
  // 04 — architecture: inputs → MANARA's six steps → outputs. The local alarm bypasses everything.
  function drawArch() {
    var svg = fig('arch'); if (!svg) return;
    var c = ctx(), W = 600; svgReset(svg, W, 268, -5);
    var X = function (x, w) { return c.rtl ? W - x - w : x; };
    var cols = { i: { x: 0, w: 178 }, c: { x: 200, w: 200 }, o: { x: 422, w: 178 } };
    var top = 29, bh = 44, bg = 7;
    var hdr = function (col, ar, en) { LB(svg, { ar: ar, en: en }, X(col.x, col.w) + col.w / 2, 11, { size: 12.5, ssize: 10, cls: 't-m t-b', scls: 't-m', step: 12 }); };
    var inputs = [
      { ic: 'sos', t: { ar: 'استغاثة السكان', en: 'Resident SOS' } },
      { ic: 'camera', t: { ar: 'كاميرا (رؤية بقواعد)', en: 'Camera (rule-based)' } },
      { ic: 'drone', t: { ar: 'طائرة (مفهوم)', en: 'Drone (concept)' } },
      { ic: 'chip', t: { ar: 'حارس ESP32', en: 'ESP32 sentinel' } }
    ];
    var outputs = [
      { ic: 'doc', t: { ar: 'بطاقة التسليم ← 999', en: 'Hand-off card → 999' } },
      { ic: 'phone', t: { ar: 'هواتف السكان بلغتهم', en: 'Phones, own language' } },
      { ic: 'pin', t: { ar: 'نقطة «آمن» دون إنترنت', en: 'Offline safe point' } },
      { ic: 'siren', t: { ar: 'لافتات وصفّارة', en: 'Exit signs & siren' } }
    ];
    var steps = [
      [{ ar: 'أرصد', en: 'Sense' }], [{ ar: 'أتحقق', en: 'Prove' }], [{ ar: 'أُبلغ', en: 'Reach' }],
      [{ ar: 'أُرشد', en: 'Guide' }], [{ ar: 'أعُدّ', en: 'Count' }], [{ ar: 'أُسلّم', en: 'Hand off' }]
    ];
    hdr(cols.i, 'المدخلات', 'INPUTS'); hdr(cols.c, 'نواة منارة', 'MANARA CORE'); hdr(cols.o, 'المخرجات', 'OUTPUTS');
    var boxY = function (i) { return top + i * (bh + bg); };
    var node = function (col, i, item, cls) {
      var x0 = X(col.x, col.w), y = boxY(i), pad = 8, isz = 24;
      mk('rect', { x: x0, y: y, width: col.w, height: bh, rx: 11, 'class': 'bx ' + cls }, svg);
      var ix = c.rtl ? x0 + col.w - pad - isz : x0 + pad;
      icon(svg, item.ic, ix, y + (bh - isz) / 2, isz, cls === 'bx-in' ? 'c-acc' : 'c-safe');
      var tx0 = c.rtl ? x0 + 6 : x0 + pad + isz + 6, tx1 = c.rtl ? x0 + col.w - pad - isz - 6 : x0 + col.w - 6;
      LB(svg, item.t, (tx0 + tx1) / 2, y + bh / 2, { size: 14.5, ssize: 11.5, w: tx1 - tx0, cls: 't-h', min: 9.5 });
    };
    // arrows (drawn before boxes so the boxes sit on top)
    var aIn1 = c.rtl ? X(cols.i.x, cols.i.w) - 1 : cols.i.x + cols.i.w + 1, aIn2 = c.rtl ? X(cols.c.x, cols.c.w) + cols.c.w + 1 : cols.c.x - 1;
    var aOut1 = c.rtl ? X(cols.c.x, cols.c.w) - 1 : cols.c.x + cols.c.w + 1, aOut2 = c.rtl ? X(cols.o.x, cols.o.w) + cols.o.w + 1 : cols.o.x - 1;
    for (var i = 0; i < 4; i++) {
      var cy = boxY(i) + bh / 2;
      arrow(svg, aIn1, cy, aIn2, cy, 'ln', 6);
      arrow(svg, aOut1, cy, aOut2, cy, 'ln', 6);
    }
    // core
    var cx0 = X(cols.c.x, cols.c.w), ch = 4 * bh + 3 * bg;
    mk('rect', { x: cx0, y: top, width: cols.c.w, height: ch, rx: 14, 'class': 'bx-core' }, svg);
    var rowH = 28, rowG = 4, rowTop = top + (ch - (6 * rowH + 5 * rowG)) / 2, rw = cols.c.w - 18, rx0 = cx0 + 9;
    steps.forEach(function (st, k) {
      var y = rowTop + k * (rowH + rowG), s = st[0];
      mk('rect', { x: rx0, y: y, width: rw, height: rowH, rx: 9, 'class': 'row' }, svg);
      var ccx = c.rtl ? rx0 + rw - 17 : rx0 + 17;
      mk('circle', { cx: ccx, cy: y + rowH / 2, r: 10, 'class': 'badge' }, svg);
      T(svg, String(k + 1), 'en', ccx, y + rowH / 2 + 4.2, { size: 12.5, cls: 't-w t-b' });
      var p1 = c.rtl ? rx0 + rw - 36 : rx0 + 36;
      T(svg, s[c.l], c.l, p1, y + rowH / 2 + 5.4, { size: 16, anchor: c.rtl ? 'r' : 'l', cls: 't-h', w: 92 });
      if (c.both) T(svg, s[c.o], c.o, c.rtl ? rx0 + 9 : rx0 + rw - 9, y + rowH / 2 + 4.4, { size: 12.5, anchor: c.rtl ? 'l' : 'r', cls: 't-m', w: 62 });
    });
    inputs.forEach(function (it, k) { node(cols.i, k, it, 'bx-in'); });
    outputs.forEach(function (it, k) { node(cols.o, k, it, 'bx-out'); });
    // the local alarm never waits: sentinel → siren, around the core
    var yb = boxY(3) + bh, ydn = yb + 13;
    var sx = X(cols.i.x, cols.i.w) + cols.i.w / 2, ex = X(cols.o.x, cols.o.w) + cols.o.w / 2;
    mk('path', { d: 'M' + sx + ' ' + yb + 'L' + sx + ' ' + ydn + 'L' + ex + ' ' + ydn, 'class': 'ln-d' }, svg);
    arrow(svg, ex, ydn, ex, yb + 1, 'ln-d', 8);
    L1(svg, { ar: 'الإنذار المحلي لا ينتظر شبكةً ولا طائرةً ولا إنسانًا', en: 'The local alarm never waits for a network, a drone or a person' }, 300, ydn + 16, { size: 12.5, cls: 't-b c-danger', w: 560 });
  }

  // 05 — proof ladder: WATCHING → SUSPECT → CONFIRMED → PUBLIC ALERT, with the keys each step needs.
  function drawProof() {
    var svg = fig('proof'); if (!svg) return;
    var c = ctx(), W = 600; svgReset(svg, W, 148);
    var segW = 138, gap = 16, y = 60, h = 40;
    var X = function (x, w) { return c.rtl ? W - x - w : x; };
    var segs = [
      { cls: 'seg1', n: { ar: 'مراقبة', en: 'WATCHING' }, k: { ar: 'لا مفاتيح', en: 'no keys' }, keys: 0 },
      { cls: 'seg2', n: { ar: 'اشتباه', en: 'SUSPECT' }, k: { ar: 'مفتاح واحد', en: '1 key' }, keys: 1 },
      { cls: 'seg3', n: { ar: 'مؤكَّد', en: 'CONFIRMED' }, k: { ar: 'مفتاحان مستقلان', en: '2 independent keys' }, keys: 2 },
      { cls: 'seg4', n: { ar: 'إنذار عام', en: 'PUBLIC ALERT' }, k: { ar: '+ موافقة الإنسان', en: '+ the human approves' }, keys: 3 }
    ];
    segs.forEach(function (s, i) {
      var x0 = X(i * (segW + gap), segW), cx = x0 + segW / 2;
      mk('rect', { x: x0, y: y, width: segW, height: h, rx: 11, 'class': s.cls }, svg);
      LB(svg, s.n, cx, y + h / 2, { size: 17, ssize: 11.5, w: segW - 14, cls: 't-h', step: 15, min: 11 });
      // the keys needed to reach this step
      var gapK = 31, n = s.keys, startX = cx - (n - 1) * gapK / 2;
      for (var k = 0; k < n; k++) {
        var kx = startX + k * gapK, human = k === 2;
        mk('circle', { cx: kx, cy: 30, r: 12.5, 'class': human ? 'key key-h' : 'key' }, svg);
        if (human) icon(svg, 'person', kx - 8, 22, 16, 'c-brand'); else icon(svg, 'key', kx - 8, 22, 16, 'c-acc');
      }
      if (n === 0) T(svg, '—', 'en', cx, 36, { size: 20, cls: 't-m' });
      LB(svg, s.k, cx, 122, { size: 13, ssize: 10.5, w: segW - 6, cls: 't-b', min: 9.5, step: 13 });
      if (i < 3) arrow(svg, c.rtl ? x0 - 2 : x0 + segW + 2, y + h / 2, c.rtl ? x0 - gap + 2 : x0 + segW + gap - 2, y + h / 2, 'ln', 6);
    });
  }

  // 02 — the gap: the escape window vs. the crews' arrival (two different sources; the page says so).
  function drawGap() {
    var svg = fig('gap'); if (!svg) return;
    var c = ctx(); svgReset(svg, 600, 152, -5);
    var defs = mk('defs', null, svg);
    hatch(defs, 'pt-hx-esc', 'hx-d'); hatch(defs, 'pt-hx-crew', 'hx-i');
    var X0 = 40, X1 = 556;
    var px = function (m) { var f = m / 12; return c.rtl ? X1 - f * (X1 - X0) : X0 + f * (X1 - X0); };
    var rx = function (a, b) { var p = px(a), q = px(b); return [Math.min(p, q), Math.abs(q - p)]; };
    var lab = c.rtl ? 576 : 24, an = c.rtl ? 'r' : 'l';
    var m, r;
    for (m = 0; m <= 12; m += 2) {
      mk('line', { x1: px(m), y1: 18, x2: px(m), y2: 126, 'class': 'grid' }, svg);
      T(svg, String(m), 'en', px(m), 144, { size: 12.5, cls: 'axis-t' });
    }
    T(svg, c.l === 'ar' ? 'د' : 'min', c.l, c.rtl ? 30 : 566, 144, { size: 12, anchor: c.rtl ? 'r' : 'l', cls: 'axis-t', w: 34 });
    // row 1 — the escape window
    L1(svg, { ar: 'مهلة الهروب بعد رنين الإنذار (NFPA، أمريكي)', en: 'Escape window after the alarm sounds (NFPA, US)' }, lab, 12, { size: 13, anchor: an, cls: 't-h', w: 548 });
    r = rx(0, 1); mk('rect', { x: r[0], y: 18, width: r[1], height: 22, rx: 4, 'class': 'bar-escape' }, svg);
    r = rx(1, 2); mk('rect', { x: r[0], y: 18, width: r[1], height: 22, rx: 4, fill: 'url(#pt-hx-esc)', 'class': 'hx-box hx-d' }, svg);
    T(svg, ltrNum('1–2') + ' ' + (c.l === 'ar' ? 'د' : 'min'), c.l, c.rtl ? r[0] - 8 : r[0] + r[1] + 8, 34, { size: 14, anchor: c.rtl ? 'r' : 'l', cls: 'v' });
    // the gap
    r = rx(2, 7); mk('rect', { x: r[0], y: 44, width: r[1], height: 38, rx: 8, 'class': 'bar-gap' }, svg);
    LB(svg, { ar: 'لا أحد غير الناس أنفسهم', en: 'only the people themselves' }, r[0] + r[1] / 2, 63, { size: 14, ssize: 11.5, w: r[1] - 14, cls: 't-h c-danger', min: 10 });
    // row 2 — Civil Defence arrives
    r = rx(7, 10); mk('rect', { x: r[0], y: 86, width: r[1], height: 22, rx: 4, fill: 'url(#pt-hx-crew)', 'class': 'hx-box hx-i' }, svg);
    T(svg, ltrNum('7–10') + ' ' + (c.l === 'ar' ? 'د' : 'min'), c.l, c.rtl ? r[0] - 8 : r[0] + r[1] + 8, 102, { size: 14, anchor: c.rtl ? 'r' : 'l', cls: 'v' });
    L1(svg, { ar: 'وصول الدفاع المدني إلى البلاغات (قطر، 2017)', en: 'Civil Defence reaches incidents (Qatar, 2017)' }, lab, 122, { size: 13, anchor: an, cls: 't-h', w: 548 });
  }

  // 09 — the whole of Qatar: the REAL OpenStreetMap snapshot (outline, roads, facilities) and the real farther-but-faster example (seed 7).
  // Roads, facilities and the route geometry are real as mapped; traffic and the position / availability of units are simulated (SIM).
  var NATP = {};
  function natFit(b, x0, y0, W, H, pad) {
    var k = Math.cos(25.3 * Math.PI / 180), w = (b.lon1 - b.lon0) * k, hh = b.lat1 - b.lat0, sc = Math.min((W - 2 * pad) / w, (H - 2 * pad) / hh), ox = x0 + (W - w * sc) / 2, oy = y0 + (H - hh * sc) / 2;
    return { x: function (lon) { return ox + (lon - b.lon0) * k * sc; }, y: function (lat) { return oy + (b.lat1 - lat) * sc; }, sc: sc, mPerPx: 111195 / sc,
      vis: { lon0: b.lon0 - (ox - x0) / (k * sc), lon1: b.lon1 + (ox - x0) / (k * sc), lat0: b.lat0 - (oy - y0) / sc, lat1: b.lat1 + (oy - y0) / sc } };
  }
  function natRing(ring, p, minPx) {
    var d = '', lx = 1e9, ly = 1e9, i, x, y;
    for (i = 0; i < ring.length; i++) { x = p.x(ring[i][0]); y = p.y(ring[i][1]); if (i && i < ring.length - 1 && Math.abs(x - lx) + Math.abs(y - ly) < minPx) continue; d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); lx = x; ly = y; }
    return d + 'Z';
  }
  function natRoads(p, classMax, minPx) {
    var out = ['', '', ''], R = window.MANARA_QATAR_ROADS; if (!R || !R.decode) return out;
    var g = R.decode(), v = p.vis, e, m, a, b, pl, d, lx, ly, i, x, y, cls;
    for (e = 0; e < g.e; e++) {
      cls = g.eCls[e]; if (cls > classMax || (g.eFlags[e] & 256)) continue;
      m = g.eLen[e] / 100000; a = g.eFrom[e]; b = g.eTo[e];
      if (!((g.lon[a] > v.lon0 - m && g.lon[a] < v.lon1 + m && g.lat[a] > v.lat0 - m && g.lat[a] < v.lat1 + m) || (g.lon[b] > v.lon0 - m && g.lon[b] < v.lon1 + m && g.lat[b] > v.lat0 - m && g.lat[b] < v.lat1 + m))) continue;
      if (Math.abs(p.x(g.lon[a]) - p.x(g.lon[b])) + Math.abs(p.y(g.lat[a]) - p.y(g.lat[b])) < minPx * 1.6 && g.eLen[e] / p.mPerPx < minPx * 2) continue;   // too short to see at this scale
      pl = g.polyline(e); d = ''; lx = 1e9; ly = 1e9;
      for (i = 0; i < pl.length; i += 2) { x = p.x(pl[i]); y = p.y(pl[i + 1]); if (i && i < pl.length - 2 && Math.abs(x - lx) + Math.abs(y - ly) < minPx) continue; d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); lx = x; ly = y; }
      out[cls <= 1 ? 0 : cls <= 3 ? 1 : 2] += d;
    }
    return out;
  }
  function natLabelName(nm, l) { var parts = String(nm[l]).split(' — '); return parts.length > 1 ? parts.slice(1).join(' — ') : parts[0]; }
  function drawNat() {
    var svg = fig('nat'); if (!svg) return;
    var c0 = ctx(), W = 600, H = 236, ex = RESULTS.national.ex;
    svgReset(svg, W, H);
    if (NATP.tpl === undefined) NATP.tpl = natStatic(svg);
    if (!NATP.tpl) { L1(svg, { ar: 'ملفات بيانات الخريطة (data/) غير محمَّلة', en: 'The map data files (data/) did not load' }, 300, 118, { size: 15, cls: 't-h' }); return; }
    NATP.tpl.nodes.forEach(function (n) { svg.appendChild(n.cloneNode(true)); });
    natLabels(svg, NATP.tpl);
  }
  // everything that does not depend on the language is built once and cloned (the road paths are large)
  function natStatic(svg0) {
    var tmp = mk('svg', null), svg = tmp;
    var G = window.MANARA_QATAR_GEO, F = window.MANARA_QATAR_FACILITIES, R = window.MANARA_QATAR_ROADS, W = 600, H = 236, ex = RESULTS.national.ex;
    if (!G || !F || !R) return null;
    var defs = mk('defs', null, svg), pad = 6;
    [['pt-nat-z', 156, 0, 444, H], ['pt-nat-l', 0, 0, 148, H]].forEach(function (r) { var cp = mk('clipPath', { id: r[0] }, defs); mk('rect', { x: r[1], y: r[2], width: r[3], height: r[4], rx: 8 }, cp); });
    var pts = ex.fastest.route.concat(ex.nearest.route, [[ex.incident.lon, ex.incident.lat], ex.fastest.base, ex.nearest.base]), b = { lon0: 1e9, lon1: -1e9, lat0: 1e9, lat1: -1e9 };
    pts.forEach(function (q) { b.lon0 = Math.min(b.lon0, q[0]); b.lon1 = Math.max(b.lon1, q[0]); b.lat0 = Math.min(b.lat0, q[1]); b.lat1 = Math.max(b.lat1, q[1]); });
    var dx = (b.lon1 - b.lon0) * 0.12, dy = (b.lat1 - b.lat0) * 0.12; b.lon0 -= dx; b.lon1 += dx; b.lat0 -= dy; b.lat1 += dy;
    var pz = natFit(b, 156, 0, 444, H, pad), bb = G.bbox, pl = natFit({ lon0: bb.lonMin, lon1: bb.lonMax, lat0: bb.latMin, lat1: bb.latMax }, 0, 0, 148, H, pad);
    var land = function (p) { var d = ''; G.outline.rings.forEach(function (r) { d += natRing(r, p, 0.7); }); (G.outline.holes || []).forEach(function (r) { d += natRing(r, p, 0.7); }); return d; };
    var col = { fire: 'n-f', police: 'n-p', hospital: 'n-h', ambulance: 'n-a' };
    // locator
    var gl = mk('g', { 'clip-path': 'url(#pt-nat-l)' }, svg);
    mk('rect', { x: 0, y: 0, width: 148, height: H, 'class': 'n-sea' }, gl);
    mk('path', { d: land(pl), 'class': 'n-land', 'fill-rule': 'evenodd' }, gl);
    var md = ''; G.municipalities.forEach(function (m) { m.polygons.forEach(function (poly) { md += natRing(poly[0], pl, 0.8); }); });
    mk('path', { d: md, 'class': 'n-muni' }, gl);
    if (!NATP.loc) NATP.loc = natRoads(pl, 1, 2.2);
    mk('path', { d: NATP.loc[0], 'class': 'n-r1 n-thin' }, gl);
    F.forEach(function (f) { if (f.kind === 'clinic-ed') return; mk('circle', { cx: pl.x(f.lon).toFixed(1), cy: pl.y(f.lat).toFixed(1), r: 1.5, 'class': 'n-fac ' + (col[f.kind] || '') }, gl); });
    var wz = pz.vis; mk('rect', { x: pl.x(wz.lon0).toFixed(1), y: pl.y(wz.lat1).toFixed(1), width: ((wz.lon1 - wz.lon0) * Math.cos(25.3 * Math.PI / 180) * pl.sc).toFixed(1), height: ((wz.lat1 - wz.lat0) * pl.sc).toFixed(1), 'class': 'n-win' }, gl);
    mk('circle', { cx: pl.x(ex.incident.lon).toFixed(1), cy: pl.y(ex.incident.lat).toFixed(1), r: 3.2, 'class': 'n-inc' }, gl);
    mk('rect', { x: 0.5, y: 0.5, width: 147, height: H - 1, rx: 8, 'class': 'n-frame' }, svg);
    // zoom
    var gz = mk('g', { 'clip-path': 'url(#pt-nat-z)' }, svg), key = ex.fastest.unitId + ex.nearest.unitId;
    mk('rect', { x: 156, y: 0, width: 444, height: H, 'class': 'n-sea' }, gz);
    mk('path', { d: land(pz), 'class': 'n-land', 'fill-rule': 'evenodd' }, gz);
    if (!NATP[key]) NATP[key] = natRoads(pz, 4, 1.6);
    mk('path', { d: NATP[key][2], 'class': 'n-r3' }, gz); mk('path', { d: NATP[key][1], 'class': 'n-r2' }, gz); mk('path', { d: NATP[key][0], 'class': 'n-r1' }, gz);
    F.forEach(function (f) { if (f.kind === 'clinic-ed' || f.lon < pz.vis.lon0 || f.lon > pz.vis.lon1 || f.lat < pz.vis.lat0 || f.lat > pz.vis.lat1) return; mk('circle', { cx: pz.x(f.lon).toFixed(1), cy: pz.y(f.lat).toFixed(1), r: 3, 'class': 'n-fac ' + (col[f.kind] || '') }, gz); });
    var line = function (route) { var d = ''; route.forEach(function (q, i) { d += (i ? 'L' : 'M') + pz.x(q[0]).toFixed(1) + ' ' + pz.y(q[1]).toFixed(1); }); return d; };
    var I = [pz.x(ex.incident.lon), pz.y(ex.incident.lat)], FA = [pz.x(ex.fastest.base[0]), pz.y(ex.fastest.base[1])], NE = [pz.x(ex.nearest.base[0]), pz.y(ex.nearest.base[1])];
    [[NE, ex.nearest.straightKm], [FA, ex.fastest.straightKm]].forEach(function (r) {
      mk('line', { x1: I[0].toFixed(1), y1: I[1].toFixed(1), x2: r[0][0].toFixed(1), y2: r[0][1].toFixed(1), 'class': 'n-ruler' }, gz);
      T(gz, ltrNum(r[1].toFixed(1)) + ' km', 'en', ((I[0] + r[0][0]) / 2).toFixed(1), ((I[1] + r[0][1]) / 2).toFixed(1), { size: 12.5, cls: 'n-km' });
    });
    mk('path', { d: line(ex.nearest.route), 'class': 'n-route n-near' }, gz);
    mk('path', { d: line(ex.fastest.route), 'class': 'n-case' }, gz); mk('path', { d: line(ex.fastest.route), 'class': 'n-route n-fast' }, gz);
    mk('circle', { cx: I[0].toFixed(1), cy: I[1].toFixed(1), r: 7, 'class': 'n-inc' }, gz);
    [[FA, 'n-ufast'], [NE, 'n-unear']].forEach(function (u) {
      mk('circle', { cx: u[0][0].toFixed(1), cy: u[0][1].toFixed(1), r: 8.5, 'class': u[1] }, gz);
      T(gz, 'F', 'en', u[0][0].toFixed(1), (u[0][1] + 4).toFixed(1), { size: 12, cls: 't-b t-w' });
    });
    var px2 = 2000 / pz.mPerPx; mk('path', { d: 'M164 ' + (H - 16) + 'V' + (H - 10) + 'H' + (164 + px2).toFixed(1) + 'V' + (H - 16), 'class': 'n-scale' }, gz);
    T(gz, '2 km', 'en', 164 + px2 / 2, H - 18, { size: 12, cls: 'n-km' });
    mk('rect', { x: 156.5, y: 0.5, width: 443, height: H - 1, rx: 8, 'class': 'n-frame' }, svg);
    return { nodes: Array.prototype.slice.call(tmp.childNodes), I: I, FA: FA, NE: NE };
  }
  function natLabels(svg, t) {
    var ex = RESULTS.national.ex, W = 600, H = 236, gz = mk('g', { 'clip-path': 'url(#pt-nat-z)' }, svg), I = t.I, FA = t.FA, NE = t.NE;
    [[FA, ex.fastest, 'r'], [NE, ex.nearest, 'l']].forEach(function (u) {
      var name = { ar: natLabelName(u[1].name, 'ar') + '  ' + ltrNum(mmss(u[1].etaSec)), en: natLabelName(u[1].name, 'en') + '  ' + mmss(u[1].etaSec) };
      LB(gz, name, u[2] === 'r' ? u[0][0] - 14 : u[0][0] + 14, u[0][1] + (u[2] === 'r' ? 1 : -4), { size: 13, ssize: 11.5, anchor: u[2], w: 205, cls: 't-h n-halo', scls: 't-m n-halo', min: 10, smin: 10 });
    });
    LB(gz, { ar: 'حريق (محاكى) · ' + ex.incident.place.ar, en: 'Fire (simulated) · ' + ex.incident.place.en }, I[0] + 14, I[1] - 6, { size: 13, ssize: 11.5, anchor: 'l', w: 200, cls: 't-h n-halo', scls: 't-m n-halo', min: 10, smin: 10 });
    LB(gz, { ar: 'محاكاة SIM · الأسرع أبكر بـ ' + ltrNum(String(ex.gainSec)) + ' ث', en: 'SIM · the fastest is ' + ex.gainSec + ' s sooner' }, 592, H - 24, { size: 13, ssize: 11.5, anchor: 'r', w: 250, cls: 't-h n-halo', scls: 't-m n-halo', min: 10, smin: 10 });
  }
  function mmss(sec) { var m = Math.floor(sec / 60), s2 = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s2 < 10 ? '0' : '') + s2; }
  function buildNatSrc() {
    var p = $('#nat-src'); if (!p) return;
    emptyNode(p);
    var n = RESULTS.national, d = n.data, a = el('span', null, null, p), e = el('span', null, null, p);
    a.setAttribute('data-l', 'ar'); e.setAttribute('data-l', 'en');
    mixed(a, ['الخرائط: لقطة OpenStreetMap بتاريخ ' + n.snapshot + ': ' + d.facilities + ' منشأة، ' + fmt(d.roadKm) + ' كم طرق؛ ' + d.missingInOsm + ' من ' + d.officialNames + ' اسمًا رسميًا غائبة عن OSM (معلَّمة). Contains data © OpenStreetMap contributors, ODbL 1.0.']);
    mixed(e, ['Maps: OpenStreetMap snapshot ' + n.snapshot + ': ' + d.facilities + ' facilities, ' + fmt(d.roadKm) + ' km of roads; ' + d.missingInOsm + ' of ' + d.officialNames + ' official names missing from OSM (flagged). Contains data © OpenStreetMap contributors, ODbL 1.0.']);
  }

  // 09 — the still-photo detector: honest bars (tuned-on sets are optimistic; the held-out set is the real number).
  function drawDet() {
    var svg = fig('det'); if (!svg) return;
    var c = ctx(), W = 600; svgReset(svg, W, 116);
    var X = function (x, w) { return c.rtl ? W - x - w : x; };
    var labW = 206, trackX = 214, trackW = 240, valX = 462, valW = 138;
    RESULTS.fire.sets.forEach(function (s, i) {
      var y = 4 + i * 37, pct = s.ok / s.n * 100, held = !s.tuned;
      LB(svg, s.name, c.rtl ? W : 0, y + 14, { size: held ? 14 : 13, ssize: 10.5, anchor: c.rtl ? 'r' : 'l', w: labW, cls: held ? 't-h' : 't-b', min: 9.5, step: 13.5 });
      var tx = X(trackX, trackW);
      mk('rect', { x: tx, y: y + 3, width: trackW, height: 24, rx: 6, 'class': 'track' }, svg);
      var bw = trackW * pct / 100;
      mk('rect', { x: c.rtl ? tx + trackW - bw : tx, y: y + 3, width: bw, height: 24, rx: 6, 'class': held ? 'bar-held' : 'bar-tuned' }, svg);
      var vx = X(valX, valW);
      T(svg, pct.toFixed(1) + '%', 'en', c.rtl ? vx + valW - 4 : vx + 4, y + 22, { size: held ? 19 : 16, anchor: c.rtl ? 'r' : 'l', cls: 'v' + (held ? ' c-brand' : ''), w: 66 });
      T(svg, s.ok + '/' + s.n, 'en', c.rtl ? vx + valW - 74 : vx + 76, y + 22, { size: 12.5, anchor: c.rtl ? 'r' : 'l', cls: 't-m', w: 52 });
    });
  }

  // 09 — simulation A/B, night fire (SIM): paired bars, ordinary alarm vs MANARA.
  function drawAB() {
    var svg = fig('ab'); if (!svg) return;
    var c = ctx(), W = 600, f = RESULTS.sim.fire; svgReset(svg, W, 160);
    var X = function (x, w) { return c.rtl ? W - x - w : x; };
    var rows = [
      { t: { ar: 'وصول 90% من الناس إلى الأمان', en: '90% of people reach safety' }, v: f.p90, u: unitS() },
      { t: { ar: 'إرسال وحدات الطوارئ', en: 'Emergency units dispatched' }, v: f.dispatch, u: unitS() },
      { t: { ar: 'وصول الوحدات إلى الموقع', en: 'Units on scene' }, v: f.onScene, u: unitS() },
      { t: { ar: 'مصابون في النموذج (ليسوا وفيات)', en: 'Injured in the model (not deaths)' }, v: f.injured, u: c.l === 'ar' ? 'شخص' : 'people' }
    ];
    var labW = 232, trackX = 244, trackW = 262;
    rows.forEach(function (r, i) {
      var top = 2 + i * 33;
      LB(svg, r.t, c.rtl ? W - 3 : 0, top + 15, { size: 14, ssize: 11, anchor: c.rtl ? 'r' : 'l', w: labW, cls: 't-h', min: 9.5, step: 14 });
      var tx = X(trackX, trackW);
      [[0, 'bar-ord'], [1, 'bar-man']].forEach(function (q) {
        var y = top + 1 + q[0] * 15, len = Math.max(4, r.v[q[0]] / r.v[0] * trackW);
        mk('rect', { x: c.rtl ? tx + trackW - len : tx, y: y, width: len, height: 13, rx: 4, 'class': q[1] }, svg);
        T(svg, ltrNum(fmt(r.v[q[0]])) + ' ' + r.u, c.l, c.rtl ? tx + trackW - len - 6 : tx + len + 6, y + 10.5, { size: 12.5, anchor: c.rtl ? 'r' : 'l', cls: 'v', w: 84 });
      });
    });
    var ly = 150, lx = 300;
    mk('rect', { x: lx - 188, y: ly - 11, width: 14, height: 14, rx: 3, 'class': 'bar-ord' }, svg);
    mk('rect', { x: lx + 12, y: ly - 11, width: 14, height: 14, rx: 3, 'class': 'bar-man' }, svg);
    L1(svg, { ar: 'إنذار عادي', en: 'ordinary alarm' }, lx - 168, ly, { size: 13, anchor: 'l', cls: 't-b', w: 170 });
    L1(svg, { ar: 'منارة', en: 'MANARA' }, lx + 32, ly, { size: 13, anchor: 'l', cls: 't-b', w: 150 });
  }

  // 10 — hardware tiers: cost ranges (estimates from the Build It parts table).
  function drawHW() {
    var svg = fig('hw'); if (!svg) return;
    var c = ctx(), W = 600; svgReset(svg, W, 112);
    var X = function (x, w) { return c.rtl ? W - x - w : x; };
    var ax0 = 214, aw = 350, MAXV = 280, vx = function (v) { return ax0 + v / MAXV * aw; };
    var v;
    for (v = 0; v <= 200; v += 100) {
      var gx = c.rtl ? W - vx(v) : vx(v);
      mk('line', { x1: gx, y1: 2, x2: gx, y2: 94, 'class': 'grid' }, svg);
      T(svg, v === 0 ? '0' : 'US$ ' + v, 'en', gx, 108, { size: 12, cls: 'axis-t', w: 58 });
    }
    TIERS.forEach(function (t, i) {
      var y = 2 + i * 31, x1 = vx(t.lo), x2 = Math.max(x1 + 8, vx(t.hi));
      LB(svg, { ar: t.n + ' · ' + t.name.ar, en: t.n + ' · ' + t.name.en }, c.rtl ? W - 3 : 0, y + 14, { size: 14, ssize: 11, anchor: c.rtl ? 'r' : 'l', w: 206, cls: 't-h', min: 9.5, step: 14 });
      var bx = c.rtl ? W - x2 : x1;
      mk('rect', { x: bx, y: y + 3, width: x2 - x1, height: 22, rx: 6, 'class': 'bar-man' }, svg);
      var label = 'US$ ' + t.lo + '–' + t.hi, rightRoom = x2 + 84 <= W - 2;
      T(svg, label, 'en', rightRoom ? (c.rtl ? W - x2 - 7 : x2 + 7) : (c.rtl ? W - x1 + 7 : x1 - 7), y + 20, { size: 14.5, anchor: (rightRoom !== c.rtl) ? 'l' : 'r', cls: 'v', w: 80 });
    });
  }

  /* ======================================================================= HTML-built result blocks */
  function mixed(parent, parts) {
    parts.forEach(function (p) { if (typeof p === 'string') parent.appendChild(document.createTextNode(p)); else { var c = el('code', null, p.code, parent); c.setAttribute('dir', 'ltr'); } });
  }
  function buildDetChips() {
    var host = $('#det-chips'); if (!host) return;
    emptyNode(host);
    var h = RESULTS.fire.held;
    [
      ['good', { ar: 'النار: وجدها ' + h.fireFound[0] + '/' + h.fireFound[1], en: 'Fire found ' + h.fireFound[0] + '/' + h.fireFound[1] }],
      ['bad', { ar: 'إنذار نار كاذب ' + h.falseFire[0] + '/' + h.falseFire[1], en: 'False fire alarms ' + h.falseFire[0] + '/' + h.falseFire[1] }],
      ['bad', { ar: 'الدخان: وجده ' + h.smokeFound[0] + '/' + h.smokeFound[1], en: 'Smoke found ' + h.smokeFound[0] + '/' + h.smokeFound[1] }],
      ['good', { ar: 'فيديو: جسم أحمر ثابت لا يصل إلى «نار»', en: 'Video: a static red object never reaches FIRE' }]
    ].forEach(function (c) { var li = el('li', c[0], null, host); li.appendChild(blNode('span', c[1], 'il')); });
  }
  function buildHzRes() {
    var host = $('#hz-res'); if (!host) return;
    emptyNode(host);
    RESULTS.sim.others.forEach(function (o) {
      var li = el('li', null, null, host); li.style.setProperty('--sc', 'var(' + o.sc + ')');
      var hn = el('div', 'hn', null, li);
      var s = mk('svg', { 'class': 'pi', 'aria-hidden': 'true' }, hn); mk('use', { href: '#pi-' + o.icon }, s);
      hn.appendChild(blNode('span', o.name, 'il'));
      li.appendChild(blNode('span', o.metric, 'hm'));
      var hv = el('div', 'hv', null, li);
      el('i', null, fmt(o.pair[0]), hv); el('span', null, ' → ', hv); el('b', null, fmt(o.pair[1]), hv);
      var u = el('small', null, null, hv); u.appendChild(document.createTextNode(' ')); u.appendChild(blNode('span', o.unit, 'il'));
      var sr = blNode('span', {
        ar: 'إنذار عادي ' + fmt(o.pair[0]) + '، منارة ' + fmt(o.pair[1]), en: 'ordinary alarm ' + fmt(o.pair[0]) + ', MANARA ' + fmt(o.pair[1])
      }, 'sr-only'); li.appendChild(sr);
    });
  }
  function buildResSrc() {
    var p = $('#res-src'); if (!p) return;
    emptyNode(p);
    var r = RESULTS, a = el('span', null, null, p), e = el('span', null, null, p);
    a.setAttribute('data-l', 'ar'); e.setAttribute('data-l', 'en');
    mixed(a, ['قِيست بتاريخ ' + r.date + ': ', { code: 'test-fire.mjs' }, ' (' + r.fire.checks + ' فحصًا) و', { code: 'test-sim.mjs' }, ' (' + r.sim.checks + ' فحصًا، بذرة ' + r.sim.seed + ') و', { code: 'test-qatar-data.mjs' }, ' (' + r.national.data.dataChecks + ') و', { code: 'test-national.mjs' }, ' (' + r.national.data.engineChecks + ') في manara/tools. أعد التشغيل لتتحقق.']);
    mixed(e, ['Measured ' + r.date + ': ', { code: 'test-fire.mjs' }, ' (' + r.fire.checks + ' checks) and ', { code: 'test-sim.mjs' }, ' (' + r.sim.checks + ' checks, seed ' + r.sim.seed + '), ', { code: 'test-qatar-data.mjs' }, ' (' + r.national.data.dataChecks + ') and ', { code: 'test-national.mjs' }, ' (' + r.national.data.engineChecks + ') in manara/tools. Re-run to verify.']);
  }

  /* ======================================================================= QR encoder (byte mode, versions 1–10, levels L/M/Q/H)
     Port of the standard algorithm (ISO/IEC 18004) in the style of Nayuki's reference. Checked against segno in test-poster.mjs. */
  var QR = (function () {
    var EXP = [], LOG = [];
    (function () { var x = 1, i; for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
    function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
    function generator(n) { var g = [1], i, j, ng; for (i = 0; i < n; i++) { ng = []; for (j = 0; j <= g.length; j++) ng[j] = 0; for (j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
    function remainder(data, n) {
      var g = generator(n), r = [], i;
      for (i = 0; i < n; i++) r.push(0);
      data.forEach(function (b) { var f = b ^ r.shift(), j; r.push(0); if (f) for (j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f); });
      return r;
    }
    var LEVELS = { L: 0, M: 1, Q: 2, H: 3 }, FMT = { L: 1, M: 0, Q: 3, H: 2 };
    var ECC = [[7, 10, 15, 20, 26, 18, 20, 24, 30, 18], [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], [13, 22, 18, 26, 18, 24, 18, 22, 20, 24], [17, 28, 22, 16, 22, 28, 26, 26, 24, 28]];
    var BLK = [[1, 1, 1, 1, 1, 2, 2, 2, 2, 4], [1, 1, 1, 2, 2, 4, 4, 4, 5, 5], [1, 1, 2, 2, 4, 4, 6, 6, 8, 8], [1, 1, 2, 4, 4, 4, 5, 6, 8, 8]];
    function rawModules(v) { var r = (16 * v + 128) * v + 64, na; if (v >= 2) { na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; } return r; }
    function dataCw(v, lv) { return Math.floor(rawModules(v) / 8) - ECC[lv][v - 1] * BLK[lv][v - 1]; }
    function alignPos(v) {
      if (v === 1) return [];
      var na = Math.floor(v / 7) + 2, size = 17 + 4 * v, step = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, res = [6], pos;
      for (pos = size - 7; res.length < na; pos -= step) res.splice(1, 0, pos);
      return res;
    }
    function utf8(str) {
      var out = [], i, c;
      str = unescape(encodeURIComponent(str));
      for (i = 0; i < str.length; i++) { c = str.charCodeAt(i); out.push(c); }
      return out;
    }
    function bit(x, i) { return ((x >>> i) & 1) !== 0; }
    function encodeData(bytes, v, lv) {
      var bits = [], cap = dataCw(v, lv) * 8, i;
      function push(val, n) { for (var k = n - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
      push(4, 4); push(bytes.length, v <= 9 ? 8 : 16);
      bytes.forEach(function (b) { push(b, 8); });
      push(0, Math.min(4, cap - bits.length));
      push(0, (8 - bits.length % 8) % 8);
      var cw = [];
      for (i = 0; i < bits.length; i += 8) { cw.push(bits.slice(i, i + 8).reduce(function (a, b) { return (a << 1) | b; }, 0)); }
      for (i = 0; cw.length < cap / 8; i++) cw.push(i % 2 ? 0x11 : 0xEC);
      return cw;
    }
    function interleave(data, v, lv) {
      var nb = BLK[lv][v - 1], el = ECC[lv][v - 1], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
      var blocks = [], k = 0, i, dat, ecc, res = [];
      for (i = 0; i < nb; i++) {
        dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length;
        ecc = remainder(dat, el);
        if (i < nShort) dat.push(0);
        blocks.push(dat.concat(ecc));
      }
      for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (b, j) { if (i !== shortLen - el || j >= nShort) res.push(b[i]); });
      return res;
    }
    function Matrix(v) {
      var n = 17 + 4 * v, m = [], f = [], r, c;
      for (r = 0; r < n; r++) { m.push([]); f.push([]); for (c = 0; c < n; c++) { m[r].push(false); f[r].push(false); } }
      this.v = v; this.n = n; this.m = m; this.f = f;
    }
    Matrix.prototype.setF = function (x, y, dark) { this.m[y][x] = dark; this.f[y][x] = true; };
    Matrix.prototype.drawFunctions = function () {
      var n = this.n, v = this.v, i, j, ap = alignPos(v), na = ap.length, self = this;
      for (i = 0; i < n; i++) { this.setF(6, i, i % 2 === 0); this.setF(i, 6, i % 2 === 0); }
      function finder(cx, cy) { var dy, dx, x, y, dist; for (dy = -4; dy <= 4; dy++) for (dx = -4; dx <= 4; dx++) { dist = Math.max(Math.abs(dx), Math.abs(dy)); x = cx + dx; y = cy + dy; if (x >= 0 && x < n && y >= 0 && y < n) self.setF(x, y, dist !== 2 && dist !== 4); } }
      finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
      for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) this.setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
      this.drawFormat(0, 0);
      if (v >= 7) {
        var rem = v, bits;
        for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
        bits = (v << 12) | rem;
        for (i = 0; i < 18; i++) { var a = n - 11 + i % 3, b = Math.floor(i / 3); this.setF(a, b, bit(bits, i)); this.setF(b, a, bit(bits, i)); }
      }
    };
    Matrix.prototype.drawFormat = function (lv, mask) {
      var n = this.n, data = (lv << 3) | mask, rem = data, bits, i;
      for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      bits = ((data << 10) | rem) ^ 0x5412;
      for (i = 0; i <= 5; i++) this.setF(8, i, bit(bits, i));
      this.setF(8, 7, bit(bits, 6)); this.setF(8, 8, bit(bits, 7)); this.setF(7, 8, bit(bits, 8));
      for (i = 9; i < 15; i++) this.setF(14 - i, 8, bit(bits, i));
      for (i = 0; i < 8; i++) this.setF(n - 1 - i, 8, bit(bits, i));
      for (i = 8; i < 15; i++) this.setF(8, n - 15 + i, bit(bits, i));
      this.setF(8, n - 8, true);
    };
    Matrix.prototype.place = function (cw) {
      var n = this.n, i = 0, right, vert, j, x, y, up;
      for (right = n - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
          x = right - j; up = ((right + 1) & 2) === 0; y = up ? n - 1 - vert : vert;
          if (!this.f[y][x] && i < cw.length * 8) { this.m[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++; }
        }
      }
    };
    Matrix.prototype.applyMask = function (mask) {
      var n = this.n, x, y, inv;
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (!this.f[y][x] && inv) this.m[y][x] = !this.m[y][x];
      }
    };
    Matrix.prototype.clone = function () { var c = new Matrix(this.v), y; for (y = 0; y < this.n; y++) { c.m[y] = this.m[y].slice(); c.f[y] = this.f[y].slice(); } return c; };
    Matrix.prototype.penalty = function () {
      var n = this.n, m = this.m, res = 0, x, y, run, col, hist, dark = 0, total = n * n;
      function addH(len, h) { if (h[0] === 0) len += n; h.pop(); h.unshift(len); }
      function count(h) { var q = h[1], core = q > 0 && h[2] === q && h[3] === q * 3 && h[4] === q && h[5] === q; return (core && h[0] >= q * 4 && h[6] >= q ? 1 : 0) + (core && h[6] >= q * 4 && h[0] >= q ? 1 : 0); }
      function term(color, len, h) { if (color) { addH(len, h); len = 0; } len += n; addH(len, h); return count(h); }
      function line(get) {
        for (y = 0; y < n; y++) {
          col = false; run = 0; hist = [0, 0, 0, 0, 0, 0, 0];
          for (x = 0; x < n; x++) {
            if (get(y, x) === col) { run++; if (run === 5) res += 3; else if (run > 5) res++; }
            else { addH(run, hist); if (!col) res += count(hist) * 40; col = get(y, x); run = 1; }
          }
          res += term(col, run, hist) * 40;
        }
      }
      line(function (a, b) { return m[a][b]; });
      line(function (a, b) { return m[b][a]; });
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) { col = m[y][x]; if (col === m[y][x + 1] && col === m[y + 1][x] && col === m[y + 1][x + 1]) res += 3; }
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) dark++;
      res += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return res;
    };
    // encode(text, 'L'|'M'|'Q'|'H', forceMask?, minVersion?) → { version, size, mask, level, rows: ['0101…', …] } or null when it does not fit
    function encode(text, level, forceMask, minVersion) {
      level = LEVELS[level] != null ? level : 'M';
      var lv = LEVELS[level], bytes = utf8(String(text)), v, need;
      for (v = Math.max(1, minVersion || 1); v <= 10; v++) { need = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8; if (need <= dataCw(v, lv) * 8) break; }
      if (v > 10) return null;
      var cw = interleave(encodeData(bytes, v, lv), v, lv);
      var base = new Matrix(v); base.drawFunctions(); base.place(cw);
      var best = null, bestMask = 0, bestPen = Infinity, mask, mx, pen;
      for (mask = 0; mask < 8; mask++) {
        if (forceMask != null && mask !== forceMask) continue;
        mx = base.clone(); mx.applyMask(mask); mx.drawFormat(FMT[level], mask);
        pen = mx.penalty();
        if (pen < bestPen) { bestPen = pen; best = mx; bestMask = mask; }
      }
      return { version: v, size: best.n, mask: bestMask, level: level, rows: best.m.map(function (r) { return r.map(function (b) { return b ? '1' : '0'; }).join(''); }) };
    }
    return { encode: encode, capacity: function (v, level) { return dataCw(v, LEVELS[level]) - (v <= 9 ? 2 : 3); } };
  })();

  function qrSvg(q) {
    var n = q.size, s = mk('svg', { viewBox: '0 0 ' + (n + 8) + ' ' + (n + 8), 'shape-rendering': 'crispEdges', 'aria-hidden': 'true', focusable: 'false' });
    var d = '', y, x, start;
    mk('rect', { width: n + 8, height: n + 8, fill: '#ffffff' }, s);       // a QR code is always black on white so that it scans
    for (y = 0; y < n; y++) {
      x = 0;
      while (x < n) {
        if (q.rows[y].charAt(x) === '1') { start = x; while (x < n && q.rows[y].charAt(x) === '1') x++; d += 'M' + (start + 4) + ' ' + (y + 4) + 'h' + (x - start) + 'v1h-' + (x - start) + 'z'; }
        else x++;
      }
    }
    mk('path', { d: d, fill: '#000000' }, s);
    return s;
  }
  function normBase(u) {
    u = cleanText(u, 400);
    if (!u) return '';
    if (!/^https?:\/\/[^\s\/?#]+/i.test(u)) return null;
    u = u.replace(/[?#].*$/, '').replace(/\/[^\/]*\.html?$/i, '/');
    return /\/$/.test(u) ? u : u + '/';
  }
  function fillQR() {
    var base = normBase(S.url), note = $('#qr-note'), bad = 0;
    $$('figure[data-qr]', board).forEach(function (f) {
      var box = $('.qr-box', f), cap = $('code', f), path = f.getAttribute('data-qr'), url, q;
      emptyNode(box); box.classList.remove('ph-box');
      if (base) {
        url = base + path; q = QR.encode(url, 'M') || QR.encode(url, 'L');
        if (q) { box.appendChild(qrSvg(q)); cap.textContent = url; box.setAttribute('aria-label', L({ ar: 'رمز QR للرابط ' + url, en: 'QR code for ' + url })); return; }
        bad++;
      }
      box.classList.add('ph-box');
      box.appendChild(document.createTextNode(bad ? '!' : 'QR'));
      el('small', null, base ? '' : '{{DEMO_URL}}', box);
      cap.textContent = (base || '{{DEMO_URL}}/') + path;
      box.setAttribute('aria-label', L({ ar: 'مكان رمز QR: أدخل رابط مشروعك المنشور', en: 'QR code placeholder: enter your published link' }));
    });
    if (note) {
      note.className = 'tg-note';
      if (base === null) { note.textContent = L({ ar: 'يجب أن يبدأ الرابط بـ https:// أو http://', en: 'The link must start with https:// or http://' }); note.classList.add('bad'); }
      else if (bad) { note.textContent = L({ ar: 'الرابط أطول مما تتسع له رموز QR هنا؛ استعمل رابطًا أقصر.', en: 'That link is too long for these QR codes; use a shorter one.' }); note.classList.add('bad'); }
      else if (base) note.textContent = L({ ar: 'الرموز تُولَّد في متصفحك دون إنترنت. جرّبها بهاتفك قبل الطباعة.', en: 'The codes are made in your browser, offline. Scan them with your phone before printing.' });
      else note.textContent = L({ ar: 'اكتب رابط مشروعك المنشور فتتحوّل الأماكن الفارغة إلى رموز QR حقيقية.', en: 'Type your published link and the empty boxes become real QR codes.' });
    }
  }

  /* ======================================================================= team fields ({{PLACEHOLDERS}}) */
  function buildFields() {
    var host = $('#fields'); if (!host) return;
    emptyNode(host);
    FIELDS.forEach(function (f) {
      var lab = el('label', 'field', null, host), sp = el('span', null, null, lab), a, e, inp;
      a = el('span', null, f[1], sp); a.setAttribute('data-l', 'ar');
      e = el('span', null, f[2], sp); e.setAttribute('data-l', 'en');
      inp = el('input', 'input', null, lab);
      inp.type = 'text'; inp.maxLength = 120; inp.autocomplete = 'off'; inp.setAttribute('data-field', f[0]);
      inp.value = S.fields[f[0]] || '';
      inp.addEventListener('input', function () { S.fields[f[0]] = cleanText(inp.value, 120); save(); applyFields(); refit(); });
    });
  }
  function applyFields() {
    var left = 0;
    $$('[data-ph]', board).forEach(function (n) {
      var k = n.getAttribute('data-ph'), v = S.fields[k];
      n.textContent = v || '{{' + k + '}}';
      n.classList.toggle('filled', !!v);
    });
    FIELDS.forEach(function (f) { if (!S.fields[f[0]]) left++; });
    var st = $('#ph-status');
    if (st) {
      st.classList.toggle('done', left === 0);
      st.textContent = left ? L({ ar: 'حقول بلا تعبئة: ' + left + ' من ' + FIELDS.length, en: 'Fields still to fill in: ' + left + ' of ' + FIELDS.length }) : L({ ar: 'اكتملت كل الحقول.', en: 'All fields are filled in.' });
    }
    return left;
  }

  /* ======================================================================= layout: tri-fold ⇄ A0 (same modules, moved) */
  function byId(id) { return document.getElementById(id); }
  function captureHome() {
    pins = $$('.pin', board);
    $$('.panel', board).forEach(function (p, i) { $$('.mod', p).forEach(function (m) { HOME[m.id] = i; }); });
  }
  function toTri() {
    ALL.forEach(function (id) {                               // back to the original panel, in the original order
      var m = byId(id), pin = pins[HOME[id]];
      if (m && pin) pin.insertBefore(m, $('.pfoot', pin));
    });
    if (a0) { a0.hero.remove(); a0.cols.remove(); a0.foot.remove(); }
  }
  function toA0() {
    if (!a0) {
      a0 = { hero: el('div', 'a0-hero'), cols: el('div', 'a0-cols'), foot: el('div', 'a0-foot') };
      a0.c1 = el('div', 'a0-col', null, a0.cols); a0.c2 = el('div', 'a0-col', null, a0.cols);
    }
    var pin = pins[0], foot = $('.pfoot', pin);
    a0.hero.appendChild(byId('m-hero'));
    a0.foot.appendChild(byId('m-team'));
    ORDER.forEach(function (id) { a0.c1.appendChild(byId(id)); });
    pin.insertBefore(a0.hero, foot); pin.insertBefore(a0.cols, foot); pin.insertBefore(a0.foot, foot);
    balanceA0();
  }
  // balance the two columns by measured height (reading order stays 01 … 12); called again after the auto-fit scale is known
  function balanceA0() {
    ORDER.forEach(function (id) { a0.c1.appendChild(byId(id)); });
    var hs = ORDER.map(function (id) { return byId(id).offsetHeight; }), gap = parseFloat(getComputedStyle(a0.c1).rowGap) || 0, best = 6, bestV = Infinity, s, sum1, sum2, v, i;
    for (s = 3; s <= ORDER.length - 3; s++) {
      sum1 = 0; sum2 = 0;
      for (i = 0; i < ORDER.length; i++) if (i < s) sum1 += hs[i]; else sum2 += hs[i];
      v = Math.max(sum1 + gap * (s - 1), sum2 + gap * (ORDER.length - s - 1));
      if (v < bestV) { bestV = v; best = s; }
    }
    splitAt = best;
    ORDER.forEach(function (id, k) { (k < splitAt ? a0.c1 : a0.c2).appendChild(byId(id)); });
  }
  function arrange() { toTri(); if (S.layout === 'a0') toA0(); }

  function containers() {
    if (S.layout === 'a0' && a0) return [a0.c1, a0.c2, pins[0]];
    return pins.slice();
  }
  function overflowing() {
    return containers().filter(function (e) { return e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1; });
  }
  function setK(k) { K = k; $$('.panel', board).forEach(function (p) { p.style.setProperty('--k', k.toFixed(4)); }); }
  function autoFit() {
    board.classList.add('fitting');   // the large map layers are hidden while the scale is searched (they cannot change any height)
    try { return autoFit0(); } finally { board.classList.remove('fitting'); }
  }
  function autoFit0() {
    var lo = 0.5, hi = 1.2, i, mid;
    setK(hi);
    if (!overflowing().length) return K;
    setK(lo);
    if (overflowing().length) return K;                       // cannot fit even at the smallest scale: reported in the status line
    for (i = 0; i < 11; i++) { mid = (lo + hi) / 2; setK(mid); if (overflowing().length) hi = mid; else lo = mid; }
    setK(lo);
    return K;
  }

  /* ======================================================================= apply state → DOM */
  function applyGeometry() {
    var t = trim(), bl = S.bleed ? BLEED + SLUG : 0, pg = pageInfo();
    board.dataset.layout = S.layout;
    board.style.setProperty('--tw', t.w + 'mm'); board.style.setProperty('--th', t.h + 'mm');
    board.style.setProperty('--bl', bl + 'mm'); board.style.setProperty('--bleed', (S.bleed ? BLEED : 0) + 'mm');
    board.classList.toggle('bi', S.both); board.classList.toggle('paper', S.paper);
    board.classList.toggle('guides', S.guides); board.classList.toggle('bleedon', S.bleed);
    pageRule.textContent = '@page{size:' + pg.w + 'mm ' + pg.h + 'mm;margin:0}';
  }
  function drawAll() {
    drawGap(); drawArch(); drawProof(); drawNat(); drawDet(); drawAB(); drawHW();
    buildDetChips(); buildHzRes(); buildResSrc(); buildNatSrc();
  }
  function fmtMM(w, h) { return Math.round(w) + ' × ' + Math.round(h) + ' mm'; }
  function updateUI() {
    var pg = pageInfo(), sel = $('#sel-size'), cs = $('#custom-size');
    $$('input[name=layout]').forEach(function (r) { r.checked = r.value === S.layout; });
    sel.value = S.size; sel.disabled = S.layout === 'a0';
    cs.hidden = !(S.layout === 'tri' && S.size === 'custom');
    $('#in-cw').value = S.cw; $('#in-ch').value = S.ch;
    $('#opt-both').checked = S.both; $('#opt-paper').checked = S.paper; $('#opt-guides').checked = S.guides; $('#opt-bleed').checked = S.bleed;
    $('#in-url').value = S.url;
    $('#zpanels').hidden = S.layout !== 'tri';
    var note = $('#size-note');
    note.textContent = S.layout === 'tri'
      ? L({ ar: 'تُطبع على 3 صفحات، كل واحدة ' + fmtMM(pg.w, pg.h) + ' (تُركَّب جنبًا إلى جنب على لوحة الفوم).', en: 'Prints as 3 pages of ' + fmtMM(pg.w, pg.h) + ', mounted side by side on the foam board.' })
      : L({ ar: 'تُطبع على صفحة واحدة بمقاس ' + fmtMM(pg.w, pg.h) + '.', en: 'Prints as one page of ' + fmtMM(pg.w, pg.h) + '.' });
    $('#how-size').textContent = fmtMM(pg.w, pg.h); $('#how-size-en').textContent = fmtMM(pg.w, pg.h);
    var pb = $('#btn-primary');
    if (pb) pb.setAttribute('aria-label', L({ ar: 'بدّل اللغة الأساسية للوحة', en: 'Switch the main language of the board' }));
    [['#z-out', 'تصغير', 'Zoom out'], ['#z-in', 'تكبير', 'Zoom in']].forEach(function (z) { $(z[0]).setAttribute('aria-label', L({ ar: z[1], en: z[2] })); });
    $('#zpanels').setAttribute('aria-label', L({ ar: 'انتقل إلى لوحة', en: 'Jump to panel' }));
    $$('#zpanels .chip').forEach(function (b) { b.setAttribute('aria-label', L({ ar: 'اللوحة ' + b.dataset.panel, en: 'Panel ' + b.dataset.panel })); });
  }
  function updateStatus() {
    var st = $('#fit-status'), bad = overflowing(), k = Math.round(K * 100);
    st.className = 'fit-status';
    if (bad.length) {
      st.classList.add('bad');
      var names = bad.map(function (e, i) { var p = e.closest('.panel'); return S.layout === 'tri' ? (p ? p.dataset.panel : i + 1) : ''; }).filter(Boolean).join(', ');
      st.textContent = L({ ar: 'تنبيه: محتوى ' + (names ? 'اللوحة ' + names : 'اللوحة') + ' أكبر من مساحته. اعرض لغة واحدة أو اختر لوحة أكبر أو اختصر النص.', en: 'Warning: ' + (names ? 'panel ' + names + ' has' : 'the board has') + ' more content than space. Show one language, pick a bigger board, or shorten the text.' });
    } else {
      st.classList.add('ok');
      st.textContent = L({ ar: 'كل المحتوى يتسع في موضعه (مقياس الخط ' + k + '%، ' + (S.layout === 'tri' ? '3 لوحات' : 'ملصق واحد') + ').', en: 'Everything fits (type scale ' + k + '%, ' + (S.layout === 'tri' ? '3 panels' : 'one poster') + ').' });
      if (K < 0.7) st.textContent += ' ' + L({ ar: 'الخط صغير على هذا المقاس: اختر لوحة أكبر أو اعرض لغة واحدة.', en: 'Type is small at this size: pick a bigger board or show one language.' });
    }
    return !bad.length;
  }

  var scaleBusy = false;
  function scalePreview() {
    var bw = board.offsetWidth, bh = board.offsetHeight, cs = getComputedStyle(viewer);
    var availW = viewer.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), s;
    if (!bw || !bh || availW <= 0) return;
    if (S.zoom === 'fit') s = availW / bw;
    else if (S.zoom === 'page') s = Math.min(availW / bw, Math.max(260, window.innerHeight * 0.8) / bh);
    else s = +S.zoom;
    s = clamp(s, 0.02, 3);
    curScale = s;
    stagebox.style.width = Math.round(bw * s) + 'px';
    stagebox.style.height = Math.round(bh * s) + 'px';
    board.style.transform = 'scale(' + s.toFixed(5) + ')';
    $('#z-read').textContent = Math.round(s * 100) + '%';
  }
  function refit() {
    autoFit();
    if (S.layout === 'a0' && a0) { var before = splitAt; balanceA0(); if (splitAt !== before) autoFit(); }
    updateStatus(); scalePreview();
  }
  function render(opts) {
    opts = opts || {};
    applyGeometry();
    arrange();
    applyFields();
    drawAll();
    fillQR();
    updateUI();
    refit();
  }

  /* ======================================================================= controls */
  function setLayout(l) { S.layout = l === 'a0' ? 'a0' : 'tri'; save(); render(); }
  function setSize(s) { S.size = (SIZES[s] || s === 'custom') ? s : 'a3'; save(); render(); }
  function setBoth(b) { S.both = !!b; save(); applyGeometry(); arrange(); drawAll(); refit(); }
  function setZoom(z) { S.zoom = z; save(); scalePreview(); }
  function zoomBy(f) { S.zoom = clamp(curScale * f, 0.05, 3); save(); scalePreview(); }
  function focusPanel(n) {
    var p = byId('panel-' + n), cs = getComputedStyle(viewer);
    if (!p) return;
    var availW = viewer.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    S.zoom = clamp(availW / p.offsetWidth, 0.05, 3); save(); scalePreview();
    p.scrollIntoView({ block: 'nearest', inline: 'start' });
  }
  // From the controls only: if the chosen size cannot hold both languages at a readable size, show one language and say so.
  function autoSingle() {
    if (S.both && S.layout === 'tri' && !check().fits) {
      setBoth(false);
      $('#opt-both').checked = false;
      M.toast({ ar: 'هذا المقاس لا يتسع للغتين بخط مقروء، فعُرضت لغة واحدة. فعّل «اعرض اللغتين معًا» لإعادتهما.', en: 'This size cannot hold both languages at a readable size, so one language is shown. Switch “Show both languages” on to bring the second back.' }, 'warn', 6500);
    }
  }
  function bind() {
    $$('input[name=layout]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) setLayout(r.value); }); });
    $('#sel-size').addEventListener('change', function (e) { setSize(e.target.value); autoSingle(); });
    var onCustom = debounce(function () {
      S.cw = clamp(Math.round(+$('#in-cw').value) || DEF.cw, LIM.w[0], LIM.w[1]);
      S.ch = clamp(Math.round(+$('#in-ch').value) || DEF.ch, LIM.h[0], LIM.h[1]);
      save(); render(); autoSingle();
    }, 350);
    $('#in-cw').addEventListener('input', onCustom); $('#in-ch').addEventListener('input', onCustom);
    $('#opt-both').addEventListener('change', function (e) { setBoth(e.target.checked); });
    $('#opt-paper').addEventListener('change', function (e) { S.paper = e.target.checked; save(); applyGeometry(); });
    $('#opt-guides').addEventListener('change', function (e) { S.guides = e.target.checked; save(); applyGeometry(); });
    $('#opt-bleed').addEventListener('change', function (e) { S.bleed = e.target.checked; save(); render(); });
    $('#btn-primary').addEventListener('click', function () { M.toggleLang(); });
    $('#in-url').addEventListener('input', debounce(function (e) { S.url = cleanText(e.target.value, 400); save(); fillQR(); }, 200));
    $('#z-fit').addEventListener('click', function () { setZoom('fit'); });
    $('#z-page').addEventListener('click', function () { setZoom('page'); });
    $('#z-in').addEventListener('click', function () { zoomBy(1.25); });
    $('#z-out').addEventListener('click', function () { zoomBy(0.8); });
    $$('#zpanels .chip').forEach(function (b) { b.addEventListener('click', function () { focusPanel(+b.dataset.panel); }); });
    $('#btn-print').addEventListener('click', function () {
      refit();
      if (!updateStatus()) M.toast({ ar: 'تنبيه: بعض اللوحات محتواها أكبر من مساحتها.', en: 'Warning: some panels have more content than space.' }, 'warn');
      var left = applyFields();
      if (left) M.toast({ ar: 'لا تزال ' + left + ' حقول فارغة وستُطبع بين أقواس مزدوجة.', en: left + ' team field(s) are still empty and will print in double braces.' }, 'warn');
      window.print();
    });
    window.addEventListener('langchange', function () { drawAll(); fillQR(); updateUI(); applyFields(); refit(); });
    window.addEventListener('beforeprint', function () { applyGeometry(); });
    var rz = 0;
    window.addEventListener('resize', function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(scalePreview); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawAll(); refit(); });
  }

  /* ======================================================================= checks used by the tests */
  function check() {
    var out = { layout: S.layout, size: S.size, k: K, containers: [] };
    containers().forEach(function (e) {
      out.containers.push({ id: e.id || e.className, h: e.clientHeight, sh: e.scrollHeight, w: e.clientWidth, sw: e.scrollWidth, over: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1 });
    });
    out.fits = out.containers.every(function (c) { return !c.over; });
    return out;
  }

  function init() {
    board = byId('board'); viewer = byId('viewer'); stagebox = byId('stagebox'); pageRule = byId('page-rule');
    if (!board || !viewer) return;
    S = load();
    captureHome();
    buildFields();
    bind();
    render();
    window.ManaraPoster = {
      ready: true, RESULTS: RESULTS, TIERS: TIERS, QR: QR, FIELDS: FIELDS,
      get state() { return JSON.parse(JSON.stringify(S)); }, get k() { return K; }, get scale() { return curScale; }, get splitAt() { return splitAt; },
      pageInfo: pageInfo, check: check, containers: containers, refit: refit, render: render, fillQR: fillQR, normBase: normBase,
      setLayout: setLayout, setSize: setSize, setBoth: setBoth, setZoom: setZoom, focusPanel: focusPanel,
      setCustom: function (w, h) { S.size = 'custom'; S.cw = clamp(w, LIM.w[0], LIM.w[1]); S.ch = clamp(h, LIM.h[0], LIM.h[1]); save(); render(); },
      setOpt: function (k, v) { S[k] = !!v; save(); render(); },
      setUrl: function (u) { S.url = cleanText(u, 400); save(); updateUI(); fillQR(); }
    };
    window.__posterReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
