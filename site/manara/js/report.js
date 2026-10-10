/* MANARA («منارة») — Scientific report (report.html) behaviour. Classic script, no libraries, works from file://.
 * What it does: contents (scroll-spy, phone toggle), print/language/open-all buttons, the figures (inline SVG drawn from the
 * frozen numbers in DATA and from the published formulas), the live message-coverage matrix (MANARA_MSG.coverage()), the
 * "reproduce now" panel (ManaraSim), the planned-experiment protocols with blank data tables (saved in this browser only),
 * the explain-it checklist, and the logbook (examples + a form).
 * DATA (below) was frozen on 2026-10-08 from tools/manara/test-*.mjs, the Decoy Lab and ManaraSim runs (Appendix B says how to reproduce).
 * Never assigns user text to innerHTML: DOM + textContent only. Tokens only: colours come from CSS classes in report.css. */
(function () {
  'use strict';
  var DATA = {"eta":{"hours":[0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16,16.5,17,17.5,18,18.5,19,19.5,20,20.5,21,21.5,22,22.5,23,23.5,24],"A":[111,111,111,111,111,111,111,111,111,111,111,115,120,152,196,196,175,173,153,126,120,121,123,125,126,150,153,149,132,127,124,130,136,149,159,159,159,159,157,141,131,124,120,116,113,113,112,111,111],"B":[128,128,128,128,128,128,128,128,128,128,128,131,135,141,149,149,149,149,143,139,135,136,137,138,139,140,142,144,142,139,137,141,144,149,153,153,153,153,153,147,141,137,134,132,130,130,129,129,128]},"sweep":{"phoneApp":{"preset":"fire-night","param":"phoneAppPct","label":{"ar":"من لديهم التطبيق","en":"Residents with the app"},"unit":"%","def":85,"metric":{"key":"timeToSafeP90Sec","label":{"ar":"زمن وصول 90٪ إلى الأمان","en":"Time for 90 % to reach safety"},"unit":"s"},"rows":[[0,627.2,480.7],[40,627.2,354.9],[85,627.2,266.5],[100,627.2,206.3]]},"wakePhone":{"preset":"fire-night","param":"wakePhone","label":{"ar":"إيقاظ هاتف المقيم (الدرجة 1)","en":"Wake chance: own phone, ladder step 1"},"unit":"prob/30 s","def":0.45,"metric":{"key":"timeToSafeP90Sec","label":{"ar":"زمن وصول 90٪ إلى الأمان","en":"Time for 90 % to reach safety"},"unit":"s"},"rows":[[0.1,627.2,326.9],[0.45,627.2,266.5],[0.8,627.2,220.5]]},"reaction":{"preset":"fire-night","param":"reactionSec","label":{"ar":"متوسط زمن الاستجابة","en":"Mean reaction time"},"unit":"s","def":15,"metric":{"key":"timeToSafeP90Sec","label":{"ar":"زمن وصول 90٪ إلى الأمان","en":"Time for 90 % to reach safety"},"unit":"s"},"rows":[[8,559.7,239.7],[15,627.2,266.5],[40,811.4,341.6]]},"guard":{"preset":"fire-night","param":"ordinaryGuardKnock","label":{"ar":"حارس يطرق الأبواب في الإنذار العادي","en":"Guard knocks doors in the ordinary alarm"},"unit":"0/1","def":0,"metric":{"key":"timeToSafeP90Sec","label":{"ar":"زمن وصول 90٪ إلى الأمان","en":"Time for 90 % to reach safety"},"unit":"s"},"rows":[[0,627.2,266.5],[1,497.3,266.5]]},"asleep":{"preset":"fire-night","param":"nightAsleepPct","label":{"ar":"نسبة النائمين عند 04:00","en":"Share asleep at 04:00"},"unit":"%","def":85,"metric":{"key":"timeToSafeP90Sec","label":{"ar":"زمن وصول 90٪ إلى الأمان","en":"Time for 90 % to reach safety"},"unit":"s"},"rows":[[30,413.9,189.1],[60,521.5,205.4],[85,627.2,266.5],[100,953,276.6]]},"gasInfil":{"preset":"gas-night","param":"gasInfilPct","label":{"ar":"دخول الغاز للمبنى","en":"Gas entering buildings"},"unit":"%","def":60,"metric":{"key":"exposurePersonSec","label":{"ar":"ثوانٍ-شخص في الخطر","en":"Person-seconds in danger"},"unit":"person-s"},"rows":[[0,0,709.3],[30,743.7,861.7],[60,32808.7,2431],[90,42486.7,6302]]},"strain":{"preset":"heat-day","param":"strainMin","label":{"ar":"زمن الانهيار عند عتبة الإيقاف","en":"Minutes to collapse at the stop level"},"unit":"min","def":90,"metric":{"key":"collapses","label":{"ar":"حالات انهيار حراري","en":"Heat collapses"},"unit":"persons"},"rows":[[60,46.3,3],[90,9,1.7],[180,0,0]]},"notice":{"preset":"sos-day","param":"ordinaryNoticeSec","label":{"ar":"زمن ملاحظة المارّة","en":"Time until a bystander notices"},"unit":"s","def":150,"metric":{"key":"timeToHelpSec","label":{"ar":"الزمن حتى وصول المساعدة","en":"Time until help arrives"},"unit":"s"},"rows":[[20,161,98],[150,291,98],[400,541,98]]}},"abl":[{"layer":"C1 · Colour","k":5,"n":5},{"layer":"+C2 · + Motion","k":4,"n":5},{"layer":"+C3 · + Flicker","k":3,"n":5},{"layer":"+C4 · + Shape / texture","k":1,"n":5},{"layer":"+C5 · + Persistence","k":1,"n":5},{"layer":"+C6 · + Thermal veto","k":0,"n":5}],"ab":{"fire-night":{"short":["حريق ليلًا","Night fire"],"rel":[49.4,64.3,57.4,55.8,58.7],"headKey":"timeToSafeP90Sec","ord":[626.2,754.4,501,492,707.6],"man":[317,269.2,213.4,217.4,292]},"gas-night":{"short":["غاز ليلًا","Night gas"],"rel":[90.9,93.6,93.3,93.4,93.1],"headKey":"exposurePersonSec","ord":[33369,33227,31830,33366,33741],"man":[3024,2132,2137,2202,2337]},"flood-day":{"short":["سيول","Flood"],"rel":[63.7,64.9,78.4,58.2,76.3],"headKey":"exposurePersonSec","ord":[245,188,167,194,241],"man":[89,66,36,81,57]},"dust-day":{"short":["غبار","Dust"],"rel":[0.3,0.5,1.8,0.7,0.8],"headKey":"exposurePersonSec","ord":[99161,88504,95421,96304,94165],"man":[98824,88055,93695,95603,93430]},"heat-day":{"short":["حرارة","Heat"],"rel":[66.7,100,100,30,78.6],"headKey":"collapses","ord":[15,6,6,10,14],"man":[5,0,0,7,3]},"sos-day":{"short":["مساعدة","Help"],"rel":[66.3,66.3,66.3,66.3,66.3],"headKey":"timeToHelpSec","ord":[291,291,291,291,291],"man":[98,98,98,98,98]},"school-fire-day":{"short":["حريق مدرسة","School fire"],"rel":[1.5,1.5,0.5,0.1,0.5],"headKey":"timeToSafeP90Sec","ord":[199.5,201,194,190,196.8],"man":[196.6,198,193,189.9,195.8]}},"seed1":{"fire-night":{"ord":626.2,"man":317},"gas-night":{"ord":33369,"man":3024},"flood-day":{"ord":245,"man":89},"dust-day":{"ord":99161,"man":98824},"heat-day":{"ord":15,"man":5},"sos-day":{"ord":291,"man":98},"school-fire-day":{"ord":199.5,"man":196.6}},"order":["fire-night","gas-night","flood-day","dust-day","heat-day","sos-day","school-fire-day"],"cov":{"ar":{"complete":64,"draft":0,"draft-core":0,"missing":0,"n/a":6},"en":{"complete":64,"draft":0,"draft-core":0,"missing":0,"n/a":6},"ml":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14},"ne":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14},"bn":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14},"ur":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14},"hi":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14},"tl":{"complete":0,"draft":56,"draft-core":0,"missing":0,"n/a":14}}};
  var M = window.Manara;
  if (!M) return;
  var NS = 'http://www.w3.org/2000/svg', doc = document, uid = 0, printing = false;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function L(o) { return M.L(o); }
  function T(ar, en) { return { ar: ar, en: en }; }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function biInto(parent, ar, en) {
    var a = el('span', null, ar), b = el('span', null, en);
    a.setAttribute('data-l', 'ar'); b.setAttribute('data-l', 'en'); parent.appendChild(a); parent.appendChild(b); return parent;
  }
  function bi(tag, ar, en, cls) { return biInto(el(tag, cls), ar, en); }
  // text with {{placeholders}} -> DOM (placeholder = <mark class="ph">)
  function rich(parent, str) {
    String(str).split(/(\{\{[^}]*\}\})/).forEach(function (part) {
      if (!part) return;
      var m = /^\{\{([^}]*)\}\}$/.exec(part);
      if (m) { var k = el('mark', 'ph', '{{' + m[1] + '}}'); parent.appendChild(k); } else parent.appendChild(doc.createTextNode(part));
    });
    return parent;
  }
  function biRich(tag, pair, cls) { var e = el(tag, cls), a = el('span'), b = el('span'); a.setAttribute('data-l', 'ar'); b.setAttribute('data-l', 'en'); rich(a, pair[0]); rich(b, pair[1]); e.appendChild(a); e.appendChild(b); return e; }
  function boldInto(parent, str) { String(str).split(/(<b>[\s\S]*?<\/b>)/).forEach(function (p) { if (!p) return; var m = /^<b>([\s\S]*)<\/b>$/.exec(p); if (m) parent.appendChild(el('b', null, m[1])); else parent.appendChild(doc.createTextNode(p)); }); return parent; }
  function jget(k, d) { try { var v = M.store(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { M.store(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  function fmt(n, d) { return M.num(n, d == null ? 0 : d); }

  /* ================================================================== SVG helpers */
  function S(name, attrs, parent) {
    var e = doc.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgRoot(host, w, h, label) {
    host.textContent = '';
    var s = S('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, focusable: 'false', role: 'img' });
    if (label) { s.setAttribute('aria-label', label); var t = S('title', null, s); t.textContent = label; }
    host.appendChild(s);
    return s;
  }
  var AR = /[؀-ۿ]/;
  // visual anchor 'l' | 'c' | 'r' (left, centre, right edge of the text at x), correct for Arabic (rtl) strings too
  function txt(parent, x, y, str, cls, vis) {
    var rtl = AR.test(str), anchor = vis === 'c' ? 'middle' : vis === 'r' ? (rtl ? 'start' : 'end') : (rtl ? 'end' : 'start');
    var t = S('text', { x: x, y: y, 'text-anchor': anchor, direction: rtl ? 'rtl' : 'ltr' }, parent);
    t.setAttribute('class', cls || 'sv-t'); t.textContent = str; return t;
  }
  function wrap(str, n) {
    var words = String(str).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { if (cur && (cur + ' ' + w).length > n) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) lines.push(cur);
    return lines;
  }
  function tlines(parent, x, y, str, n, cls, vis, lh) { var ls = wrap(str, n); ls.forEach(function (ln, i) { txt(parent, x, y + i * (lh || 14), ln, cls, vis); }); return ls.length; }
  function arrowDef(svg, color) {
    var id = 'ah' + (++uid), d = S('defs', null, svg), m = S('marker', { id: id, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, d);
    var p = S('path', { d: 'M0 0L10 5L0 10z' }, m); p.setAttribute('class', 'sv-head' + (color ? ' c' : '')); if (color) p.style.setProperty('--c', color);
    return id;
  }
  function path(svg, d, o) {
    o = o || {};
    var p = S('path', { d: d }, svg); p.setAttribute('class', 'sv-arrow' + (o.dash ? ' dash' : '') + (o.c ? ' c' : ''));
    if (o.c) p.style.setProperty('--c', o.c);
    if (o.marker) p.setAttribute('marker-end', 'url(#' + o.marker + ')');
    return p;
  }
  function box(svg, x, y, w, h, o) {
    var g = S('g', null, svg), rtl = M.lang() === 'ar';
    var r = S('rect', { x: x, y: y, width: w, height: h, rx: 12 }, g);
    r.setAttribute('class', 'sv-box' + (o.c ? ' c' : '') + (o.dash ? ' dash' : '')); if (o.c) r.style.setProperty('--c', o.c);
    var cx = x + w / 2, ty = y + 22;
    if (o.n) {
      var bx = rtl ? x + w - 16 : x + 16, d = S('circle', { cx: bx, cy: y + 16, r: 10 }, g); d.setAttribute('class', 'sv-dot'); d.style.setProperty('--c', o.c || 'var(--brand)');
      var nt = S('text', { x: bx, y: y + 20, 'text-anchor': 'middle' }, g); nt.setAttribute('class', 'sv-badge'); nt.textContent = o.n;
    }
    var tl = wrap(o.title, Math.max(6, Math.floor((w - 14) / 7.6))), xt = (tl.length - 1) * 16;
    tl.forEach(function (ln, i) { txt(g, cx, ty + (o.n ? 14 : 0) + i * 16, ln, 'sv-b', 'c'); });
    var cpl = Math.max(8, Math.floor((w - 14) / (o.cw || 6.3)));
    tlines(g, cx, ty + (o.n ? 31 : 17) + xt, o.sub || '', cpl, 'sv-s', 'c', 14);
    return g;
  }
  function boxH(w, o) { var cpl = Math.max(8, Math.floor((w - 14) / (o.cw || 6.3))), n = wrap(o.sub || '', cpl).length, tn = wrap(o.title, Math.max(6, Math.floor((w - 14) / 7.6))).length; return (o.n ? 48 : 34) + n * 14 + (tn - 1) * 16 + 8; }
  function inner(host) { var cs = getComputedStyle(host), w = host.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return Math.floor(w); }
  function legend(host, items) {
    var d = el('div', 'legend-row');
    items.forEach(function (it) { var s = el('span'), i = el('i'); i.style.setProperty('--c', it.color); s.appendChild(i); s.appendChild(doc.createTextNode(it.text)); d.appendChild(s); });
    host.appendChild(d);
  }

  /* ================================================================== generic line chart */
  function lineChart(host, o) {
    var W = o.W, H = o.H, m = o.m || { t: 14, r: 16, b: 42, l: 46 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = o.svg || svgRoot(host, W, H, o.title);
    var sx = function (x) { return m.l + (x - o.x0) / (o.x1 - o.x0) * iw; }, sy = function (y) { return m.t + ih - (y - o.y0) / (o.y1 - o.y0) * ih; };
    (o.yticks || []).forEach(function (v) { S('line', { x1: m.l, x2: m.l + iw, y1: sy(v), y2: sy(v) }, svg).setAttribute('class', 'sv-grid'); txt(svg, m.l - 7, sy(v) + 4, (o.yfmt ? o.yfmt(v) : String(v)), 'sv-m', 'r'); });
    (o.xticks || []).forEach(function (v) { S('line', { x1: sx(v), x2: sx(v), y1: m.t + ih, y2: m.t + ih + 4 }, svg).setAttribute('class', 'sv-axis'); txt(svg, sx(v), m.t + ih + 17, (o.xfmt ? o.xfmt(v) : String(v)), 'sv-m', 'c'); });
    S('line', { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, svg).setAttribute('class', 'sv-axis');
    S('line', { x1: m.l, x2: m.l, y1: m.t, y2: m.t + ih }, svg).setAttribute('class', 'sv-axis');
    (o.bands || []).forEach(function (b) {
      var r = S('rect', { x: sx(b.x0), y: m.t, width: Math.max(1, sx(b.x1) - sx(b.x0)), height: ih }, svg); r.setAttribute('class', 'sv-band'); r.style.setProperty('--c', b.color || 'var(--brand)');
    });
    (o.hlines || []).forEach(function (h) { S('line', { x1: m.l, x2: m.l + iw, y1: sy(h.y), y2: sy(h.y) }, svg).setAttribute('class', 'sv-ref'); var hl = wrap(h.label, Math.max(12, Math.floor((iw - 14) / 6.1))); hl.forEach(function (ln, k) { txt(svg, m.l + (h.left ? 6 : iw - 4), sy(h.y) - 5 - (hl.length - 1 - k) * 13, ln, 'sv-ref-t', h.left ? 'l' : 'r'); }); });
    (o.vlines || []).forEach(function (v) { var ln = S('line', { x1: sx(v.x), x2: sx(v.x), y1: m.t, y2: m.t + ih }, svg); ln.setAttribute('class', 'sv-ref'); txt(svg, sx(v.x) + 4, m.t + 12, v.label, 'sv-ref-t', 'l'); });
    (o.series || []).forEach(function (s) {
      var d = s.pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1); }).join('');
      var pth = S('path', { d: d }, svg); pth.setAttribute('class', 'sv-line' + (s.dash ? ' dash' : '') + (s.thin ? ' thin' : '')); pth.style.setProperty('--c', s.color);
      if (s.dots) s.pts.forEach(function (p) { var c = S('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 3.6 }, svg); c.setAttribute('class', 'sv-dot'); c.style.setProperty('--c', s.color); });
      if (s.endLabel) { var lp = s.pts[s.pts.length - 1]; txt(svg, sx(lp[0]) - 4, sy(lp[1]) - 7, s.endLabel, 'sv-s sv-end', 'r'); }
    });
    if (o.xlabel) txt(svg, m.l + iw / 2, H - 4, o.xlabel, 'sv-m', 'c');
    return { svg: svg, sx: sx, sy: sy, m: m, iw: iw, ih: ih };
  }
  function hhmm(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }

  /* ================================================================== figure: architecture */
  var C = { brand: 'var(--brand)', accent: 'var(--accent)', safe: 'var(--safe)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)', muted: 'var(--muted)', ink: 'var(--ink)' };
  function steps() {
    return [
      { n: '1', c: C.accent, title: L(T('أرصد', 'Sense')), sub: L(T('حسّاسات بضجيج وانجراف وإحماء', 'sensors with noise, drift and warm-up')) },
      { n: '2', c: C.warn, title: L(T('أتحقق', 'Prove')), sub: L(T('مفتاحان مستقلان + موافقة المشغّل', 'two independent keys + the operator’s approval')) },
      { n: '3', c: C.brand, title: L(T('أُبلغ', 'Reach')), sub: L(T('لغة وصيغة لكل شخص وسلّم الإيقاظ', 'language and format per person, wake-up ladder')) },
      { n: '4', c: C.info, title: L(T('أُرشد', 'Guide')), sub: L(T('مسار واعٍ بالخطر وحقيقة المخرج', 'hazard-aware route and exit truth')) },
      { n: '5', c: C.safe, title: L(T('أعُدّ', 'Count')), sub: L(T('«أنا بأمان» أو «أحتاج مساعدة» مقابل السجل', '“I’m safe” or “I need help” against the register')) },
      { n: '6', c: C.danger, title: L(T('أُسلّم', 'Hand off')), sub: L(T('حزمة موثّقة والوحدة الأسرع وCAP', 'verified package, fastest unit, CAP')) }
    ];
  }
  function fieldBoxes() {
    return [
      { title: L(T('الحارس (Sentinel)', 'Sentinel')), sub: L(T('ESP32 + حرارية وغاز وحرارة وماء وSOS', 'ESP32 + thermal, gas, heat, water, SOS')), c: C.accent },
      { title: L(T('الإنذار المحلي', 'Local alarm')), sub: L(T('صفّارة وحلقة ضوء وأسهم خروج: لا ينتظر', 'siren, LED ring, exit arrows: never waits')), c: C.danger },
      { title: L(T('هواتف السكان', 'Residents’ phones')), sub: L(T('بطاقة شخصية بلغتهم وصيغتهم', 'a personal card in their language and format')), c: C.brand },
      { title: L(T('التسجيل', 'Check-in')), sub: L(T('هاتف ولوحة المعرض وMANARA-SAFE', 'phone, booth tablet, MANARA-SAFE')), c: C.safe }
    ];
  }
  function authBoxes() {
    return [
      { title: L(T('غرفة عمليات 999', '999 control room')), sub: L(T('تبقى هي المرسِل', 'stays the dispatcher')), c: C.info },
      { title: L(T('الدفاع المدني · الإسعاف · الشرطة', 'Civil Defence · ambulance · police')), sub: L(T('تتسلّم بطاقة التسليم', 'receive the hand-off card')), c: C.info },
      { title: L(T('التحذير الوطني', 'National warning')), sub: L(T('عبر CAP 1.2 بحالة «تمرين»', 'via CAP 1.2, status “Exercise”')), c: C.info },
      { title: L(T('مفاهيم', 'Concepts')), sub: L(T('مسيّرة مرخّصة · مرور حيّ', 'licensed drone · live traffic')), c: C.muted, dash: true }
    ];
  }
  function figArch(host, W) {
    var rtl = M.lang() === 'ar', label = L(T('مخطط معمارية منارة: الميدان، المنصة، الجهات', 'MANARA architecture diagram: field, platform, authorities'));
    var pad = 6, st = steps(), fb = fieldBoxes(), ab = authBoxes();
    if (W >= 640) {
      var H = 478, svg = svgRoot(host, W, H, label), a = arrowDef(svg), ac = arrowDef(svg, C.danger), gap = 12;
      var X = function (n, i, g) { g = g == null ? gap : g; var w = (W - 2 * pad - g * (n - 1)) / n, vi = rtl ? n - 1 - i : i; return { x: pad + vi * (w + g), w: w, cx: pad + vi * (w + g) + w / 2 }; };
      var bandX = rtl ? W - pad : pad, bv = rtl ? 'r' : 'l';
      var fy = 22, fh = 96, py = 184, ph = 108, ay = 360, ah = 96;
      var F = fb.map(function (b, i) { var p = X(4, i, 34); box(svg, p.x, fy, p.w, fh, { c: b.c, title: b.title, sub: b.sub }); return p; });
      var P = st.map(function (b, i) { var p = X(6, i, 14); box(svg, p.x, py, p.w, ph, { c: b.c, n: b.n, title: b.title, sub: b.sub, cw: 6.1 }); return p; });
      var A = ab.map(function (b, i) { var p = X(4, i); box(svg, p.x, ay, p.w, ah, { c: b.c, dash: b.dash, title: b.title, sub: b.sub }); return p; });
      // pipeline arrows between steps
      for (var i = 0; i < 5; i++) { var p0 = P[i], p1 = P[i + 1], y = py + ph / 2; var x0 = rtl ? p0.x - 1 : p0.x + p0.w + 1, x1 = rtl ? p1.x + p1.w + 1 : p1.x - 1; path(svg, 'M' + x0 + ' ' + y + 'L' + x1 + ' ' + y, { marker: a }); }
      // sentinel -> sense; check-in -> count; reach -> phones
      var elbow = function (xa, ya, xb, yb, o) { var ym = (ya + yb) / 2; path(svg, 'M' + xa + ' ' + ya + 'V' + ym + 'H' + xb + 'V' + yb, o); };
      elbow(F[0].cx, fy + fh + 1, P[0].cx, py - 1, { marker: a });
      elbow(F[3].cx, fy + fh + 1, P[4].cx, py - 1, { marker: a });
      elbow(P[2].cx, py - 1, F[2].cx, fy + fh + 1, { marker: a });
      // local alarm lane: sentinel -> local alarm (never waits)
      var ym = fy + fh / 2, xa = rtl ? F[0].x - 1 : F[0].x + F[0].w + 1, xb = rtl ? F[1].x + F[1].w + 1 : F[1].x - 1;
      path(svg, 'M' + xa + ' ' + ym + 'L' + xb + ' ' + ym, { marker: ac, c: C.danger, dash: true });
      // hand-off bus to authorities
      var bus = ay - 24, hx = P[5].cx; path(svg, 'M' + hx + ' ' + (py + ph + 1) + 'V' + bus, {});
      var xsA = [A[0].cx, A[1].cx, A[2].cx], mn = Math.min(hx, xsA[0], xsA[1], xsA[2]), mx = Math.max(hx, xsA[0], xsA[1], xsA[2]);
      path(svg, 'M' + mn + ' ' + bus + 'H' + mx, {});
      xsA.forEach(function (x) { path(svg, 'M' + x + ' ' + bus + 'V' + (ay - 1), { marker: a }); });
      path(svg, 'M' + A[3].cx + ' ' + bus + 'V' + (ay - 1), { marker: a, dash: true }); path(svg, 'M' + Math.min(mx, A[3].cx) + ' ' + bus + 'H' + Math.max(mx, A[3].cx), { dash: true });
      txt(svg, W / 2, bus - 6, L(T('بطاقة تسليم موثّقة (لا تحلّ محلّ 999)', 'verified hand-off card (replaces nothing; 999 decides)')), 'sv-m', 'c');
      txt(svg, bandX, 14, L(T('الميدان', 'FIELD')), 'sv-mono', bv);
      txt(svg, bandX, 176, L(T('المنصة: متصفح دون اتصال، من ملفات محلية', 'PLATFORM: an offline browser, from local files')), 'sv-mono', bv);
      txt(svg, bandX, 352, L(T('الجهات', 'AUTHORITIES')), 'sv-mono', bv);
    } else {
      var gx = pad, w = W - 2 * pad, y = 6, items = [], groups = [[L(T('الميدان', 'FIELD')), fb], [L(T('المنصة (متصفح دون اتصال)', 'PLATFORM (offline browser)')), st], [L(T('الجهات', 'AUTHORITIES')), ab]];
      var total = 6; groups.forEach(function (g) { total += 18; g[1].forEach(function (b) { total += boxH(w, b) + 8; }); total += 14; });
      var svg2 = svgRoot(host, W, total + 6, label), a2 = arrowDef(svg2);
      groups.forEach(function (g, gi) {
        txt(svg2, rtl ? W - pad : pad, y + 10, g[0], 'sv-mono', rtl ? 'r' : 'l'); y += 18;
        g[1].forEach(function (b, i) {
          var h = boxH(w, b); box(svg2, gx, y, w, h, { c: b.c, n: b.n, dash: b.dash, title: b.title, sub: b.sub });
          y += h;
          if (gi === 1 && i < 5) { path(svg2, 'M' + (W / 2) + ' ' + (y + 1) + 'V' + (y + 7), { marker: a2 }); }
          y += 8;
        });
        if (gi < 2) { path(svg2, 'M' + (W / 2) + ' ' + (y - 2) + 'V' + (y + 10), { marker: a2, dash: true }); }
        y += 14;
      });
    }
  }

  /* ================================================================== figure: verification state machine */
  function figProof(host, W) {
    var rtl = M.lang() === 'ar', label = L(T('آلة حالات التحقق', 'Verification state machine'));
    var states = [
      { title: L(T('هادئ', 'IDLE')), sub: L(T('لا مفتاح نشط', 'no active key')), c: C.muted },
      { title: L(T('اشتباه', 'SUSPECT')), sub: L(T('مفتاح واحد لمدة ≥ 2 ث', 'one key held ≥ 2 s')), c: C.warn },
      { title: L(T('مؤكَّد', 'CONFIRMED')), sub: L(T('مفتاحان من مجموعتين مختلفتين لمدة ≥ 3 ث', 'two keys from different groups held ≥ 3 s')), c: C.brand },
      { title: L(T('تنبيه عام', 'PUBLIC ALERT')), sub: L(T('بعد موافقة المشغّل', 'after the operator approves')), c: C.danger }
    ];
    var edges = [L(T('مفتاح', 'a key')), L(T('مفتاح ثانٍ مستقل', 'a 2nd independent key')), L(T('«موافقة»', '“Approve”'))];
    var lane = L(T('الإنذار المحلي (صفّارة المبنى أو طنّان الحارس): يعمل بقاعدته وحده؛ لا ينتظر مفتاحًا ولا شبكة ولا إنسانًا', 'The LOCAL ALARM (building siren or sentinel buzzer) runs on its own rule: it waits for no key, no network and no human'));
    var pad = 6;
    if (W >= 780) {
      var H = 270, svg = svgRoot(host, W, H, label), a = arrowDef(svg), gap = 84, bw = (W - 2 * pad - gap * 3) / 4, by = 20, bh = 92;
      var pos = function (i) { var vi = rtl ? 3 - i : i; return { x: pad + vi * (bw + gap), cx: pad + vi * (bw + gap) + bw / 2 }; };
      states.forEach(function (s, i) { var p = pos(i); box(svg, p.x, by, bw, bh, { c: s.c, title: s.title, sub: s.sub }); });
      for (var i = 0; i < 3; i++) {
        var p0 = pos(i), p1 = pos(i + 1), y = by + bh / 2;
        var xa = rtl ? p0.x - 2 : p0.x + bw + 2, xb = rtl ? p1.x + bw + 2 : p1.x - 2; path(svg, 'M' + xa + ' ' + y + 'L' + xb + ' ' + y, { marker: a });
        var el = wrap(edges[i], Math.max(8, Math.floor((gap - 10) / 6.2))); el.forEach(function (ln, k) { txt(svg, (xa + xb) / 2, y - 8 - (el.length - 1 - k) * 13, ln, 'sv-m', 'c'); });
      }
      // back edges
      var y0 = by + bh + 1, p1 = pos(1), p2 = pos(2), p3 = pos(0);
      path(svg, 'M' + p1.cx + ' ' + y0 + 'V' + (y0 + 22) + 'H' + p3.cx + 'V' + y0, { marker: a, dash: true });
      txt(svg, (p1.cx + p3.cx) / 2, y0 + 38, L(T('المفتاح يزول', 'the key clears')), 'sv-m', 'c');
      path(svg, 'M' + p2.cx + ' ' + y0 + 'V' + (y0 + 22) + 'H' + p1.cx + 'V' + y0, { marker: a, dash: true });
      txt(svg, (p2.cx + p1.cx) / 2, y0 + 38, L(T('رفض المشغّل (انتظار 120 ث)', 'operator rejects (120 s hold-off)')), 'sv-m', 'c');
      // local alarm lane
      var ly = by + bh + 66, lh = 52; var r = S('rect', { x: pad, y: ly, width: W - 2 * pad, height: lh, rx: 12 }, svg); r.setAttribute('class', 'sv-box c dash'); r.style.setProperty('--c', C.danger);
      tlines(svg, W / 2, ly + 22, lane, Math.floor((W - 40) / 7.6), 'sv-b', 'c', 16);
      path(svg, 'M' + pos(1).cx + ' ' + (by + bh + 44) + 'V' + (ly - 1), { marker: arrowDef(svg, C.danger), c: C.danger, dash: true });
    } else {
      var w = W - 2 * pad, y = 6, hs = states.map(function (s) { return boxH(w, s) + 4; }), ll = wrap(lane, Math.floor((w - 14) / 7.6)).length;
      var total = hs.reduce(function (s, h) { return s + h + 34; }, 0) + ll * 16 + 50;
      var svg2 = svgRoot(host, W, total, label), a2 = arrowDef(svg2);
      states.forEach(function (s, i) {
        box(svg2, pad, y, w, hs[i], { c: s.c, title: s.title, sub: s.sub }); y += hs[i];
        if (i < 3) { path(svg2, 'M' + (W / 2) + ' ' + (y + 1) + 'V' + (y + 26), { marker: a2 }); txt(svg2, W / 2 + 10, y + 18, edges[i], 'sv-m', 'l'); y += 34; }
      });
      y += 14; var r2 = S('rect', { x: pad, y: y, width: w, height: ll * 16 + 18, rx: 12 }, svg2); r2.setAttribute('class', 'sv-box c dash'); r2.style.setProperty('--c', C.danger);
      tlines(svg2, W / 2, y + 22, lane, Math.floor((w - 14) / 7.6), 'sv-b', 'c', 16);
    }
  }

  /* ================================================================== figure: ETA of the two stations over the day */
  function figEta(host, W) {
    var E = DATA.eta, H = W < 520 ? 270 : 320, hs = E.hours;
    var label = L(T('زمن وصول المحطتين A وB خلال اليوم', 'ETA of stations A and B over the day'));
    var bands = [], start = null;
    for (var i = 0; i < hs.length; i++) {
      var fast = E.B[i] < E.A[i] - 1;
      if (fast && start === null) start = hs[i];
      if ((!fast || i === hs.length - 1) && start !== null) { bands.push({ x0: start, x1: fast ? hs[i] : hs[i - 1], color: C.brand }); start = null; }
    }
    var ch = lineChart(host, { W: W, H: H, x0: 0, x1: 24, y0: 90, y1: 210, xticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], xfmt: function (v) { return (v < 10 ? '0' : '') + v + ':00'; }, yticks: [90, 120, 150, 180, 210], yfmt: function (v) { return v + ' s'; }, title: label,
      bands: bands, vlines: [{ x: 7.5, label: '07:30' }],
      series: [{ pts: hs.map(function (h, i) { return [h, E.A[i]]; }), color: C.accent }, { pts: hs.map(function (h, i) { return [h, E.B[i]]; }), color: C.brand }] });
    bands.forEach(function (b) { if (b.x1 - b.x0 >= 1.5) txt(ch.svg, ch.sx((b.x0 + b.x1) / 2), ch.m.t + ch.ih - 8, L(T('B أسرع', 'B faster')), 'sv-band-t', 'c'); });
    legend(host, [{ color: C.accent, text: L(T('A: الأقرب مسافة (1,010 م)', 'A: nearest by distance (1,010 m)')) }, { color: C.brand, text: L(T('B: الأبعد (1,995 م)', 'B: farther (1,995 m)')) }, { color: 'color-mix(in oklab,var(--brand) 25%,transparent)', text: L(T('«أبعد لكن أسرع»', '“farther but faster”')) }]);
  }

  /* ================================================================== figures computed live from published formulas */
  function figPw(host, W) {
    var H = W < 520 ? 250 : 290, c1 = 0.045, c2 = 0.131, label = L(T('عامل الرياح p_w', 'Wind factor p_w'));
    function pw(V, deg) { return Math.exp(c1 * V) * Math.exp(c2 * V * (Math.cos(deg * Math.PI / 180) - 1)); }
    function ser(V, color, name) { var pts = []; for (var d = 0; d <= 180; d += 5) pts.push([d, pw(V, d)]); return { pts: pts, color: color, endLabel: name }; }
    lineChart(host, { W: W, H: H, x0: 0, x1: 180, y0: 0, y1: 1.6, xticks: [0, 45, 90, 135, 180], xfmt: function (v) { return v + '°'; }, yticks: [0, 0.4, 0.8, 1.2, 1.6], yfmt: function (v) { return v.toFixed(1); }, title: label,
      xlabel: L(T('الزاوية θ بين الريح واتجاه الانتشار (0° = مع الريح)', 'angle θ between wind and spread direction (0° = downwind)')),
      series: [ser(0, C.muted, 'V = 0'), ser(4, C.accent, 'V = 4 m/s'), ser(8, C.brand, 'V = 8 m/s')], hlines: [{ y: 1, label: 'p_w = 1', left: true }] });
  }
  function stull(T0, RH) { return T0 * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T0 + RH) - Math.atan(RH - 1.676331) + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035; }
  function figWbgt(host, W) {
    var H = W < 520 ? 280 : 330, label = L(T('تقدير WBGT في الظل', 'WBGT estimate in the shade'));
    function ser(RH, color) { var pts = []; for (var t = 30; t <= 50; t += 1) pts.push([t, 0.7 * stull(t, RH) + 0.3 * t]); return { pts: pts, color: color, endLabel: RH + ' %' }; }
    lineChart(host, { W: W, H: H, x0: 30, x1: 50, y0: 20, y1: 48, xticks: [30, 35, 40, 45, 50], xfmt: function (v) { return v + ' °C'; }, yticks: [20, 28, 32.1, 36, 40, 44, 48], yfmt: function (v) { return v === 32.1 ? '32.1' : String(v); }, title: label,
      xlabel: L(T('حرارة الهواء (°م) · خطوط الرطوبة النسبية', 'air temperature (°C) · lines = relative humidity')),
      hlines: [{ y: 32.1, label: L(T('32.1 °م: حدّ قطر لإيقاف العمل (قيمة مقيسة)', '32.1 °C: Qatar’s stop-all-work line (a measured value)')), left: true }, { y: 28, label: L(T('28 °م: حدّ العمل الخفيف (OSHA)', '28 °C: light-work limit (OSHA)')), left: false }],
      series: [ser(20, C.info), ser(40, C.accent), ser(60, C.warn), ser(80, C.danger)] });
  }

  /* ================================================================== figure: ablation of the layers on held-out decoy clips */
  function figAbl(host, W) {
    var H = W < 520 ? 250 : 280, label = L(T('إنذارات كاذبة على المقاطع المموِّهة المحجوزة', 'False alarms on the held-out decoy clips')), svg = svgRoot(host, W, H, label);
    var m = { t: 18, r: 12, b: 56, l: 40 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = DATA.abl.length, bw = Math.min(54, iw / n * 0.6), gap = iw / n;
    var sy = function (v) { return m.t + ih - v / 5 * ih; };
    for (var v = 0; v <= 5; v++) { S('line', { x1: m.l, x2: m.l + iw, y1: sy(v), y2: sy(v) }, svg).setAttribute('class', 'sv-grid'); txt(svg, m.l - 7, sy(v) + 4, String(v), 'sv-m', 'r'); }
    S('line', { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, svg).setAttribute('class', 'sv-axis');
    var names = ['C1', '+C2', '+C3', '+C4', '+C5', '+C6'];
    DATA.abl.forEach(function (r, i) {
      var cx = m.l + gap * i + gap / 2, h = r.k / 5 * ih, rect = S('rect', { x: cx - bw / 2, y: m.t + ih - h, width: bw, height: Math.max(h, 1), rx: 5 }, svg);
      rect.setAttribute('class', 'sv-bar'); rect.style.setProperty('--c', r.k === 0 ? 'var(--safe)' : 'var(--brand)');
      txt(svg, cx, m.t + ih - h - 6, r.k + '/' + r.n, 'sv-b', 'c'); txt(svg, cx, m.t + ih + 17, names[i], 'sv-s', 'c');
      var sub = [L(T('اللون', 'colour')), L(T('حركة', 'motion')), L(T('وميض', 'flicker')), L(T('شكل', 'shape')), L(T('ثبات', 'persist.')), L(T('حرارة', 'thermal'))][i];
      txt(svg, cx, m.t + ih + 32, sub, 'sv-m', 'c');
    });
    txt(svg, m.l + iw / 2, H - 6, L(T('نضيف طبقة في كل عمود (تراكميًا)', 'one layer added per column (cumulative)')), 'sv-m', 'c');
  }

  /* ================================================================== figure: A/B relative change per scenario, five seeds */
  function figAb(host, W) {
    var rowH = 34, order = DATA.order, note = L(T('التغيّر النسبي = (منارة − العادي) ÷ العادي؛ كل نقطة بذرة', 'relative change = (MANARA − ordinary) ÷ ordinary; each dot is one seed')), nl = wrap(note, Math.max(20, Math.floor((W - 20) / 6))), H = 30 + order.length * rowH + 30 + nl.length * 14, label = L(T('التغيّر النسبي في المقياس الرئيس', 'Relative change of the headline metric'));
    var svg = svgRoot(host, W, H, label), labW = W < 520 ? 96 : 150, m = { l: labW, r: 16, t: 20 }, iw = W - m.l - m.r, x0 = -100, x1 = 10;
    var sx = function (v) { return m.l + (v - x0) / (x1 - x0) * iw; };
    var rz = S('rect', { x: sx(x0), y: m.t - 6, width: sx(0) - sx(x0), height: order.length * rowH + 6 }, svg); rz.setAttribute('class', 'sv-band'); rz.style.setProperty('--c', 'var(--safe)');
    var rw = S('rect', { x: sx(0), y: m.t - 6, width: sx(x1) - sx(0), height: order.length * rowH + 6 }, svg); rw.setAttribute('class', 'sv-band'); rw.style.setProperty('--c', 'var(--danger)');
    [-100, -75, -50, -25, 0].forEach(function (v) { S('line', { x1: sx(v), x2: sx(v), y1: m.t - 6, y2: m.t + order.length * rowH }, svg).setAttribute('class', v === 0 ? 'sv-ref' : 'sv-grid'); txt(svg, sx(v), m.t + order.length * rowH + 15, v + '%', 'sv-m', 'c'); });
    txt(svg, sx(-50), 10, L(T('منارة أفضل', 'MANARA better')), 'sv-band-t', 'c').style.setProperty('--c', 'var(--safe)');
    txt(svg, sx(5), 10, L(T('أسوأ', 'worse')), 'sv-band-t', 'c').style.setProperty('--c', 'var(--danger)');
    order.forEach(function (id, i) {
      var d = DATA.ab[id], y = m.t + i * rowH + rowH / 2 - 3;
      txt(svg, rtlSafeLeft(), y + 4, L(T(d.short[0], d.short[1])), 'sv-s', 'l');
      d.rel.forEach(function (r, k) { var c = S('circle', { cx: sx(-r), cy: y, r: 5 }, svg); c.setAttribute('class', 'sv-dot'); c.style.setProperty('--c', Math.min.apply(null, d.rel) >= 10 ? 'var(--safe)' : 'var(--warn)'); var t = S('title', null, c); t.textContent = 'seed ' + (k + 1) + ': ' + (-r) + '%'; });
    });
    function rtlSafeLeft() { return 4; }
    nl.forEach(function (ln, i) { txt(svg, W / 2, H - 4 - (nl.length - 1 - i) * 14, ln, 'sv-m', 'c'); });
  }

  /* ================================================================== figure: sensitivity small multiples */
  function figSweep(host, W) {
    host.textContent = '';
    var grid = el('div', 'sweep-grid'); host.appendChild(grid);
    var cols = W >= 900 ? 3 : W >= 620 ? 2 : 1, cw = Math.floor((W - (cols - 1) * 14) / cols) - 26;
    var unit = { timeToSafeP90Sec: 's', exposurePersonSec: 'person-s', collapses: '', timeToHelpSec: 's' };
    var keys = ['phoneApp', 'wakePhone', 'reaction', 'guard', 'asleep', 'gasInfil', 'strain', 'notice'];
    keys.forEach(function (k) {
      var s = DATA.sweep[k], cell = el('div', 'sweep-cell'), h = el('h5'); h.setAttribute('aria-level', '4'); h.textContent = L(s.label) + ' (' + s.param + ')'; cell.appendChild(h);
      var sm = el('p', 'small'); sm.textContent = L(T(DATA.ab[s.preset].short[0], DATA.ab[s.preset].short[1])) + ' · ' + L(s.metric.label); cell.appendChild(sm);
      var holder = el('div'); cell.appendChild(holder); grid.appendChild(cell);
      var ymax = 0; s.rows.forEach(function (r) { ymax = Math.max(ymax, r[1], r[2]); }); ymax = ymax === 0 ? 1 : ymax * 1.12;
      var xs = s.rows.map(function (r) { return r[0]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs); if (x0 === x1) x1 = x0 + 1;
      var pad = (x1 - x0) * 0.04; x0 -= pad; x1 += pad;
      var nt = 4, yt = []; for (var i = 0; i <= nt; i++) yt.push(Math.round(ymax * i / nt * 10) / 10);
      var ch = lineChart(holder, { W: cw, H: 170, m: { t: 10, r: 10, b: 30, l: 44 }, x0: x0, x1: x1, y0: 0, y1: ymax, xticks: xs, yticks: yt, yfmt: function (v) { return v >= 100 ? String(Math.round(v)) : String(v); }, title: h.textContent,
        series: [{ pts: s.rows.map(function (r) { return [r[0], r[1]]; }), color: C.muted, dots: true }, { pts: s.rows.map(function (r) { return [r[0], r[2]]; }), color: C.brand, dots: true }],
        vlines: [] });
      if (xs.indexOf(s.def) >= 0) { var dl = S('line', { x1: ch.sx(s.def), x2: ch.sx(s.def), y1: ch.m.t, y2: ch.m.t + ch.ih }, ch.svg); dl.setAttribute('class', 'sv-ref'); txt(ch.svg, ch.sx(s.def) + 4, ch.m.t + 11, L(T('الافتراضي', 'default')), 'sv-ref-t', 'l'); }
    });
    legend(host, [{ color: C.muted, text: L(T('الإنذار العادي', 'ordinary alarm')) }, { color: C.brand, text: L(T('منارة', 'MANARA')) }]);
  }

  /* ================================================================== figure: live message-coverage matrix */
  var HZ = { fire: T('حريق', 'fire'), smoke: T('دخان', 'smoke'), gas: T('غاز', 'gas'), flood: T('سيول', 'flood'), dust: T('غبار', 'dust'), heat: T('حرارة', 'heat'), sos: T('مساعدة', 'help') };
  var PE = { adult: T('بالغ', 'adult'), asleep: T('نائم', 'asleep'), deaf: T('أصمّ', 'Deaf'), blind: T('مكفوف', 'blind'), wheelchair: T('كرسي', 'wheelchair'), elderly: T('مسنّ', 'elderly'), child: T('طفل', 'child'), worker: T('عامل', 'worker'), guard: T('حارس', 'guard'), volunteer: T('متطوع', 'volunteer') };
  function figCov(host, W) {
    var cv = null, live = false;
    try { if (window.MANARA_MSG && window.MANARA_MSG.coverage) { cv = window.MANARA_MSG.coverage(); live = true; } } catch (e) { cv = null; }
    host.textContent = '';
    if (!cv) { host.appendChild(el('p', 'small', L(T('تعذّر تحميل مكتبة الرسائل؛ انظر الجدول أدناه (أرقام مجمّدة).', 'The message library did not load; see the table below (frozen numbers).')))); return; }
    var langs = cv.langs, hz = cv.hazards, pers = cv.personas, labW = W < 520 ? 0 : 66, gap = 14, s = 8, per = 1;
    [15, 14, 13, 12, 11, 10, 9, 8].some(function (ss) { var p = Math.min(hz.length, Math.floor((W - labW + gap) / (langs.length * ss + gap))); if (p >= hz.length) { s = ss; per = p; return true; } s = ss; per = Math.max(1, p); return false; });
    if (W < 520) { s = 9; per = Math.max(1, Math.floor((W + gap) / (langs.length * s + gap))); }
    var gw = langs.length * s, rows = Math.ceil(hz.length / per), gh = pers.length * s + 34, H = rows * (gh + 10) + 6, svg = svgRoot(host, W, H, L(T('مصفوفة تغطية الرسائل', 'Message coverage matrix')));
    var byKey = {}; cv.rows.forEach(function (r) { byKey[r.hazard + '|' + r.persona] = r; });
    hz.forEach(function (h, hi) {
      var row = Math.floor(hi / per), col = hi % per, x0 = (W < 520 ? 0 : labW) + col * (gw + gap), y0 = row * (gh + 10) + 6;
      if (labW && col === 0) pers.forEach(function (p, pi) { txt(svg, labW - 6, y0 + 30 + pi * s + s - 1.5, L(PE[p] || T(p, p)), 'sv-mono', 'r'); });
      txt(svg, x0 + gw / 2, y0 + 9, L(HZ[h] || T(h, h)), 'sv-b', 'c');
      if (s >= 13) langs.forEach(function (lg, li) { txt(svg, x0 + li * s + s / 2, y0 + 25, lg, 'sv-code', 'c'); });
      pers.forEach(function (p, pi) {
        langs.forEach(function (lg, li) {
          var r = byKey[h + '|' + p], st = r ? r.cells[lg] : 'na';
          var c = S('rect', { x: x0 + li * s, y: y0 + 30 + pi * s, width: s, height: s }, svg); c.setAttribute('class', 'sv-cell ' + (st === 'n/a' ? 'na' : st));
          var t = S('title', null, c); t.textContent = h + ' · ' + p + ' · ' + lg + ': ' + st;
        });
      });
    });
    legend(host, [{ color: 'var(--safe)', text: L(T('كاملة', 'complete')) }, { color: 'var(--warn)', text: L(T('مسودة (تحتاج مراجعة متحدث أصلي)', 'draft (needs native-speaker review)')) }, { color: 'var(--surface-3)', text: L(T('لا ينطبق', 'not applicable')) }, { color: 'var(--danger)', text: L(T('ناقصة', 'missing')) }]);
    var sm = el('p', 'small muted'); sm.textContent = L(T('الصفوف من الأعلى: ', 'Rows from the top: ')) + pers.map(function (p) { return L(PE[p] || T(p, p)); }).join(' · ') + L(T('. الأعمدة: ', '. Columns: ')) + langs.join(' ') + '.'; host.appendChild(sm);
  }

  var FIGS = { arch: figArch, proof: figProof, eta: figEta, pw: figPw, wbgt: figWbgt, abl: figAbl, ab: figAb, sweep: figSweep, cov: figCov };
  function renderFigures() {
    $$('.fig-body[data-fig]').forEach(function (host) {
      var fn = FIGS[host.getAttribute('data-fig')]; if (!fn) return;
      var W = printing ? 640 : inner(host); if (W < 200) return;
      try { fn(host, Math.min(W, 1100)); } catch (e) { host.textContent = ''; host.appendChild(el('p', 'small', 'figure error: ' + e.message)); if (window.console) console.error(e); }
    });
  }
  var rzT = 0, lastW = 0;
  function onResize() { clearTimeout(rzT); rzT = setTimeout(function () { var w = window.innerWidth; if (w !== lastW) { lastW = w; renderFigures(); } }, 160); }

  /* ================================================================== contents (TOC), buttons, print */
  function initToc() {
    var toc = $('#rp-toc-box'), tg = $('#toc-toggle'), links = $$('.toc-list a'), targets = links.map(function (a) { return doc.getElementById(a.getAttribute('href').slice(1)); });
    if (tg) { tg.addEventListener('click', function () { var o = !toc.classList.contains('open'); toc.classList.toggle('open', o); tg.setAttribute('aria-expanded', o ? 'true' : 'false'); }); }
    links.forEach(function (a) { a.addEventListener('click', function () { if (toc && window.innerWidth <= 1020) { toc.classList.remove('open'); if (tg) tg.setAttribute('aria-expanded', 'false'); } }); });
    var tick = 0;
    function spy() {
      tick = 0; var y = (parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--nav-h')) || 64) + 90, cur = -1;
      for (var i = 0; i < targets.length; i++) { var t = targets[i]; if (t && t.getBoundingClientRect().top <= y) cur = i; }
      links.forEach(function (a, i) { if (i === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      if (cur >= 0 && window.innerWidth > 1020) { var a = links[cur], box = toc, ar = a.getBoundingClientRect(), br = box.getBoundingClientRect(); if (ar.top < br.top + 40 || ar.bottom > br.bottom - 20) box.scrollTop += ar.top - br.top - br.height / 3; }
    }
    window.addEventListener('scroll', function () { if (!tick) tick = requestAnimationFrame(spy); }, { passive: true });
    spy();
  }
  function initButtons() {
    var pb = $('#rp-print'); if (pb) pb.addEventListener('click', function () { window.print(); });
    var lb = $('#rp-lang'); if (lb) lb.addEventListener('click', function () { M.toggleLang(); });
    var ob = $('#rp-open-all');
    if (ob) ob.addEventListener('click', function () { var open = ob.getAttribute('aria-pressed') !== 'true'; ob.setAttribute('aria-pressed', open ? 'true' : 'false'); $$('details').forEach(function (d) { d.open = open; }); });
    var saved = [];
    window.addEventListener('beforeprint', function () { saved = $$('details').map(function (d) { return d.open; }); $$('details').forEach(function (d) { d.open = true; }); printing = true; renderFigures(); });
    window.addEventListener('afterprint', function () { $$('details').forEach(function (d, i) { d.open = !!saved[i]; }); printing = false; renderFigures(); });
  }
  function initAbstractCount() {
    var host = $('#abs-count'), p = $('#abstract-box > p'); if (!host || !p) return;
    function upd() {
      var out = {}; ['ar', 'en'].forEach(function (l) { var s = $('span[data-l="' + l + '"]', p); out[l] = s ? s.textContent.trim().split(/\s+/).filter(Boolean).length : 0; });
      host.textContent = L(T('عدد كلمات الملخص: ' + out.ar + ' بالعربية و' + out.en + ' بالإنجليزية (الحد 200 لكل لغة).', 'Abstract length: ' + out.ar + ' words in Arabic and ' + out.en + ' in English (limit 200 each).'));
    }
    upd(); window.addEventListener('langchange', upd);
  }

  /* ================================================================== checklists: formulas + defence */
  var CHK = 'manara-report-checks';
  function initChecks() {
    var state = jget(CHK, {}), boxes = $$('input[data-chk]');
    boxes.forEach(function (b) { b.checked = !!state[b.getAttribute('data-chk')]; b.addEventListener('change', function () { state[b.getAttribute('data-chk')] = b.checked; jset(CHK, state); refresh(); }); });
    var forms = $$('.formula'), sum = $('#explain-sum'), list = $('#explain-list');
    function refresh() {
      var ready = 0, ticks = 0;
      forms.forEach(function (f) { var bs = $$('input[data-chk]', f), n = bs.filter(function (b) { return b.checked; }).length; ticks += n; var all = n === bs.length; if (all) ready++; f.querySelector('.f-check').classList.toggle('done', all); });
      if (sum) {
        sum.textContent = '';
        var b = el('b', 'num', ready + ' / ' + forms.length); sum.appendChild(b);
        var t = el('span'); t.textContent = L(T('معادلة جاهزة للشرح على السبّورة (' + ticks + ' من ' + forms.length * 3 + ' خانة)', 'formulas ready to explain at the whiteboard (' + ticks + ' of ' + forms.length * 3 + ' boxes)')); sum.appendChild(t);
        var bar = el('div', 'bar'), i = el('i'); i.style.width = Math.round(ticks / (forms.length * 3) * 100) + '%'; bar.appendChild(i); sum.appendChild(bar);
      }
      if (list) {
        list.textContent = '';
        forms.forEach(function (f) {
          var bs = $$('input[data-chk]', f), li = el('li'), a = el('a'), st = el('span', 'st'); a.href = '#' + f.id; a.textContent = f.getAttribute('data-f') + ' · ' + L(T(f.getAttribute('data-ftitle-ar'), f.getAttribute('data-ftitle-en')));
          bs.forEach(function (x) { var d = el('i'); if (x.checked) d.className = 'on'; st.appendChild(d); }); li.appendChild(a); li.appendChild(st);
          if (bs.every(function (x) { return x.checked; })) li.className = 'ready'; list.appendChild(li);
        });
      }
    }
    refresh(); window.addEventListener('langchange', refresh);
  }

  /* ================================================================== reproduce panel (needs ManaraSim) */
  function initRepro() {
    var sel = $('#repro-preset'), seed = $('#repro-seed'), out = $('#repro-out'), bAb = $('#repro-ab'), bEta = $('#repro-eta');
    if (!sel || !out) return;
    var S_ = window.ManaraSim;
    function fillSel() { var keep = sel.value; sel.textContent = ''; (DATA.order).forEach(function (id) { var o = el('option'); o.value = id; o.textContent = S_ && S_.PRESETS[id] ? L(S_.PRESETS[id].name) : id; sel.appendChild(o); }); if (keep) sel.value = keep; }
    fillSel(); window.addEventListener('langchange', fillSel);
    if (!S_ || !S_.ab) { out.textContent = L(T('محرك المحاكاة لم يُحمَّل؛ الأرقام المجمّدة وحدها متاحة.', 'The simulation engine did not load; only the frozen numbers are available.')); if (bAb) bAb.disabled = true; if (bEta) bEta.disabled = true; return; }
    function table(rows) { out.textContent = ''; var t = el('table'), h = el('tr'); [L(T('المقياس', 'Quantity')), L(T('مجمَّد', 'Frozen')), L(T('الآن', 'Now')), L(T('النتيجة', 'Result'))].forEach(function (x) { h.appendChild(el('th', null, x)); }); t.appendChild(h); rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { var td = el('td', i === 3 ? (c.ok ? 'ok' : 'diff') : null); td.textContent = i === 3 ? c.t : c; tr.appendChild(td); }); t.appendChild(tr); }); out.appendChild(t); return t; }
    bAb.addEventListener('click', function () {
      var id = sel.value, sd = Math.max(1, Math.min(5, parseInt(seed.value, 10) || 1)); seed.value = sd;
      out.textContent = L(T('جارٍ التشغيل… (1–3 ثوانٍ)', 'Running… (1–3 s)'));
      setTimeout(function () {
        try {
          var t0 = performance.now(), r = S_.ab({ preset: id, seed: sd }), ms = Math.round(performance.now() - t0), d = DATA.ab[id], hk = r.manara.headline;
          var fo = d.ord[sd - 1], fm = d.man[sd - 1], lo = r.ordinary.headline.value, lm = hk.value, same = function (a, b) { return Math.abs(a - b) < 0.06; };
          var okT = function (ok) { return { ok: ok, t: ok ? L(T('يطابق ✓', 'matches ✓')) : L(T('يختلف', 'differs')) }; };
          table([[L(hk.label) + ' — ' + L(T('الإنذار العادي', 'ordinary alarm')), String(fo), String(lo), okT(same(fo, lo))], [L(hk.label) + ' — ' + L(T('منارة', 'MANARA')), String(fm), String(lm), okT(same(fm, lm))]]);
          var p = el('p', 'small muted'); p.textContent = L(T('(' + ms + ' ملّي ثانية في متصفحك) · بصمة العالمين: ', '(' + ms + ' ms in your browser) · world fingerprints: ')) + r.hash.ordinary + ' / ' + r.hash.manara; out.appendChild(p);
        } catch (e) { out.textContent = 'error: ' + e.message; }
      }, 40);
    });
    bEta.addEventListener('click', function () {
      out.textContent = L(T('جارٍ الحساب…', 'Computing…'));
      setTimeout(function () {
        try {
          var sim = S_.create({ preset: 'fire-night', seed: 1 }); S_.run(sim, 5); var worst = 0, bad = 0, n = 0;
          DATA.eta.hours.forEach(function (h, i) { var c = S_.dispatchCompare(sim, 'fire', { hour: h }), a = c.ranked.filter(function (r) { return r.id === 'F1'; })[0], b = c.ranked.filter(function (r) { return r.id === 'F2'; })[0]; n++; var d = Math.max(Math.abs(a.etaSec - DATA.eta.A[i]), Math.abs(b.etaSec - DATA.eta.B[i])); worst = Math.max(worst, d); if (d > 1) bad++; });
          table([[L(T('أزمنة الوصول لـ A وB (49 نقطة)', 'ETAs of A and B (49 points)')), '49', String(n), { ok: bad === 0, t: bad === 0 ? L(T('كلها تطابق ✓ (أقصى فرق ' + worst + ' ث)', 'all match ✓ (largest difference ' + worst + ' s)')) : L(T(bad + ' تختلف (أقصى فرق ' + worst + ' ث)', bad + ' differ (largest difference ' + worst + ' s)')) }]]);
        } catch (e) { out.textContent = 'error: ' + e.message; }
      }, 40);
    });
  }

  /* ================================================================== planned experiments T1–T9 */
  var X = [];
  function ex(o) { X.push(o); }
  ex({ id: 'T1', title: T('الإحماء وانجراف خط الأساس', 'Warm-up and baseline drift'), hyp: 'MQ / H1',
    q: T('كم يلزم كل حسّاس ليستقر وما حجم انجرافه؟ (قيد لحسّاسات MQ ولقاعدة «خط الأساس + 3σ»؛ أوراق البيانات تطلب أكثر من 48 ساعة.)', 'How long does each sensor take to settle, and how much does it drift? (A limit of MQ sensors and of the “baseline + 3σ” rule; the datasheets ask for over 48 hours.)'),
    mat: [T('لوحة الحارس بحسّاساتها (MQ-2، وMQ-7 إن وُجد، وSHT31، وMLX90640)', 'The sentinel board with its sensors (MQ-2, MQ-7 if fitted, SHT31, MLX90640)'), T('مقياس حرارة ورطوبة مرجعي (ولو رخيصًا) في الغرفة نفسها', 'A reference thermometer and hygrometer (even a cheap one) in the same room'), T('مسجّل تسلسلي أو صفحة «بناء النموذج»', 'A serial logger or the Build page')],
    safe: T('تهوية جيدة؛ تغذية 5 فولت فقط؛ لا تلمس سخّان MQ فهو ساخن.', 'Good ventilation; 5 V supply only; do not touch the MQ heater, it is hot.'),
    steps: [T('اكتب قاعدة النجاح أعلاه قبل البدء (مثلًا: «يُعدّ الحسّاس مستقرًا إذا تغيّر أقل من X% خلال 5 دقائق»).', 'Write the pass rule above before you start (for example: “a sensor counts as settled when it changes less than X% over 5 minutes”).'),
      T('شغّل اللوحة في هواء نظيف بعيدًا عن المعقّمات والعطور ودخان الطبخ، وسجّل كل 10 ثوانٍ لمدة 60 دقيقة (اليوم الأول).', 'Power the board in clean air away from sanitiser, perfume and cooking fumes, and log every 10 s for 60 minutes (day 1).'),
      T('دوّن زمن الاستقرار وخط الأساس (متوسطه وانحرافه المعياري σ في آخر 5 دقائق).', 'Note the time to settle and the baseline (its mean and standard deviation σ over the last 5 minutes).'),
      T('اترك اللوحة تعمل 48 ساعة (حرق أولي) ثم أعد القياس بالإجراء نفسه.', 'Leave the board running for 48 hours (burn-in) then repeat the measurement the same way.'),
      T('قارن SHT31 ومتوسط الصورة الحرارية بالمرجع.', 'Compare the SHT31 and the thermal-image mean with the reference.')],
    rec: T('الحسّاس، ساعات الحرق السابقة، زمن الاستقرار، خط الأساس (خام أو mV) وσ، حرارة الغرفة ورطوبتها.', 'Sensor, previous burn-in hours, time to settle, baseline (raw or mV) and σ, room temperature and humidity.'),
    ana: T('اجعل σ جزءًا من عتبة «خط الأساس + 3σ». إن تغيّر خط الأساس أكثر من σ بين الجلستين فالقراءات «إرشادية» فقط.', 'Make σ part of the “baseline + 3σ” threshold. If the baseline moves by more than σ between the two sessions, readings are “indicative” only.'),
    cols: [{ k: 'sensor', ar: 'الحسّاس', en: 'Sensor', t: 1 }, { k: 'burn', ar: 'ساعات الحرق', en: 'Burn-in done', u: 'h' }, { k: 'settle', ar: 'زمن الاستقرار', en: 'Time to settle', u: 'min', stat: 1 }, { k: 'mean', ar: 'خط الأساس', en: 'Baseline mean', u: 'raw / mV' }, { k: 'sd', ar: 'σ', en: 'σ', u: 'raw / mV' }, { k: 'rt', ar: 'حرارة الغرفة', en: 'Room T', u: '°C' }, { k: 'rh', ar: 'الرطوبة', en: 'RH', u: '%' }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 8 });
  ex({ id: 'T2', title: T('البقعة الحرارية مقابل المسافة', 'Thermal hotspot versus distance'), hyp: 'H1',
    q: T('إلى أي مسافة يبقى الكوب الساخن «بقعة ساخنة» بحسب قاعدتي 57 °م والسياق؟ وهل تُخفيها لوحة زجاج؟', 'Up to what distance does a hot mug remain a “hotspot” by the 57 °C and contextual rules? And does a glass pane hide it?'),
    mat: [T('لوحة التوأم مع MLX90640 على حامل', 'The twin board with the MLX90640 on a stand'), T('كوب ماء ساخن (ليس مغليًا) بين 60 و70 °م، ومقياس حرارة بمسبار', 'A mug of hot (not boiling) water at 60–70 °C and a probe thermometer'), T('شريط قياس، ولوح زجاج أو نافذة (اختياري)', 'A tape measure, and a glass pane or window (optional)')],
    safe: T('الماء الساخن يسبب حروقًا: لا ماء مغليًا، وكوب ثابت على حصيرة، وأبعد الكهرباء عن الماء.', 'Hot water scalds: no boiling water, a stable mug on a mat, electronics away from water.'),
    steps: [T('اكتب قاعدة النجاح قبل البدء (مثلًا: «علم البقعة الساخنة 1 في ≥ 90% من المحاولات حتى المسافة D»).', 'Write the pass rule before starting (for example: “hot-spot flag = 1 in ≥ 90% of trials up to distance D”).'),
      T('قِس حرارة الماء بالمسبار قبل كل مجموعة.', 'Measure the water temperature with the probe before each group.'),
      T('ضع الكاميرا على مسافات مقترحة 0.5 و0.75 و1.0 و1.5 و2.0 م، وكرّر 3 مرات لكل مسافة، وسجّل tmax وعلم البقعة من السجل التسلسلي.', 'Place the camera at suggested distances 0.5, 0.75, 1.0, 1.5 and 2.0 m, repeat 3 times each, and record tmax and the hot-spot flag from the serial log.'),
      T('ضع لوح الزجاج بين الكاميرا والكوب عند 1.0 م وكرّر مرة (يُتوقع ألا تراه الأشعة طويلة الموجة).', 'Put the glass pane between camera and mug at 1.0 m and repeat once (long-wave infrared is expected not to see through it).')],
    rec: T('المسافة، حرارة المسبار، tmax، علم البقعة، عدد البكسلات ≥ 57 °م، زجاج أم لا.', 'Distance, probe temperature, tmax, hot-spot flag, pixels ≥ 57 °C, glass or not.'),
    ana: T('ارسم الخطأ (tmax − المسبار) مقابل المسافة. تتوقع أن يصغر حجم البقعة بالبكسل مع المسافة فينخفض tmax.', 'Plot the error (tmax − probe) against distance. Expect the spot to shrink in pixels with distance so tmax falls.'),
    cols: [{ k: 'd', ar: 'المسافة', en: 'Distance', u: 'm' }, { k: 'rep', ar: 'التكرار', en: 'Repeat' }, { k: 'probe', ar: 'حرارة المسبار', en: 'Probe T', u: '°C', stat: 1 }, { k: 'tmax', ar: 'tmax', en: 'tmax', u: '°C', stat: 1 }, { k: 'flag', ar: 'علم البقعة', en: 'Hot-spot flag', u: '0/1' }, { k: 'px', ar: 'بكسلات ≥ 57', en: 'Pixels ≥ 57 °C' }, { k: 'glass', ar: 'زجاج؟', en: 'Glass?', u: '0/1' }, { k: 'err', ar: 'الخطأ', en: 'Error', u: '°C', calc: function (r) { return num(r.tmax) - num(r.probe); }, stat: 1 }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 15 });
  ex({ id: 'T3', title: T('مموِّهات الإنذار الكاذب', 'False-alarm decoys'), hyp: 'H1',
    q: T('هل يصل أي مموِّه أحادي المصدر إلى «تنبيه عام»؟ وهل يشغّل مموِّهٌ واحد مفتاحين «مستقلين» معًا؟', 'Does any single-source decoy reach a “public alert”? And does one decoy trigger two “independent” keys at once?'),
    mat: [T('لوحة التوأم مع صفحة غرفة العمليات أو مختبر الأدلة', 'The twin board with the Mission Control or Evidence Lab page'), T('المموِّهات: كوب ساخن (حراري فقط)، مسحة معقّم يدين (MQ-2 فقط)، مجفف شعر على «منخفض» قرب SHT31 (حرارة فقط)، جسم أحمر أو فيديو نار على هاتف أمام الكاميرا (رؤية فقط)', 'Decoys: a hot mug (thermal only), a hand-sanitiser swab (MQ-2 only), a hair dryer on “low” near the SHT31 (heat only), a red object or a fire video on a phone in front of the camera (vision only)')],
    safe: T('لا لهب ولا ولاعة ولا دخان حقيقي. مسحة صغيرة وتهوية؛ المعقّم قابل للاشتعال فلا تقرّبه من المجفف أو أي حرارة.', 'No flame, no lighter, no real smoke. A small swab and ventilation; sanitiser is flammable so keep it away from the dryer or any heat.'),
    steps: [T('اكتب لكل مموِّه أي مفتاح يمكنه تشغيله، وقاعدة النجاح (مثلًا: «0 تنبيه عام في n تجربة لكل مموِّه») وn قبل البدء.', 'For each decoy write which key it can trigger, and the pass rule (for example “0 public alerts in n trials per decoy”) and n before starting.'),
      T('شغّل n تجربة (مقترح 10 لكل مموِّه) ولا تضغط «موافقة» في تجارب المموِّهات.', 'Run n trials (suggested 10 per decoy) and do not press “Approve” in decoy trials.'),
      T('سجّل أعلى حالة بلغها النظام: هادئ أو اشتباه أو مؤكَّد أو تنبيه عام.', 'Record the highest state reached: idle, suspect, confirmed or public alert.'),
      T('أضف 5 تجارب «ضابطة موجبة» (كوب ساخن + مسحة معًا) للتأكد من ظهور «مؤكَّد».', 'Add 5 “positive control” trials (hot mug + swab together) to check that “confirmed” appears.')],
    rec: T('المموِّه، المفتاح الذي يشغّله، رقم التجربة، أعلى حالة، هل ضُغطت «موافقة»، هل صدر تنبيه عام.', 'Decoy, the key it triggers, trial number, highest state, whether Approve was pressed, whether a public alert issued.'),
    ana: T('k تنبيهات عامة من n لكل مموِّه، مع الحد الأعلى 95% (F15). وانتبه للسبب المشترك: هل حرّك مموِّه واحد مفتاحين؟', 'k public alerts out of n per decoy, with the 95% upper bound (F15). Watch for a common cause: did one decoy move two keys?'),
    cols: [{ k: 'decoy', ar: 'المموِّه', en: 'Decoy', t: 1 }, { k: 'key', ar: 'المفتاح الذي يشغّله', en: 'Key it triggers', t: 1 }, { k: 'n', ar: 'رقم التجربة', en: 'Trial #' }, { k: 'state', ar: 'أعلى حالة', en: 'Highest state', t: 1 }, { k: 'appr', ar: 'ضُغطت موافقة؟', en: 'Approve pressed?', u: '0/1' }, { k: 'pub', ar: 'تنبيه عام؟', en: 'Public alert?', u: '0/1', stat: 1, sum: 1 }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 20 });
  ex({ id: 'T4', title: T('الزمن من المفتاح إلى السهم', 'Latency from switch to arrow'), hyp: 'H2',
    q: T('كم يمرّ من تحريك مفتاح المخرج حتى يتغيّر السهم؟ وهل يعمل الإنذار المحلي والحاسوب غير موصول؟', 'How long from moving an exit switch until the arrow changes? And does the local alarm work with the computer unplugged?'),
    mat: [T('لوحة التوأم بمفاتيح المخارج وأسهم WS2812 وطنّان', 'The twin board with exit switches, WS2812 arrows and a buzzer'), T('هاتف بتصوير بطيء (120 إطارًا/ث أو أكثر؛ دوّن fps)', 'A phone with slow-motion video (120 frames/s or more; note the fps)'), T('كابل USB للتغذية فقط وحاسوب', 'A USB cable for power only, and a computer')],
    safe: T('5 فولت فقط؛ لا تُسطع الأسهم على عيون أحد.', '5 V only; do not shine the arrows into anyone’s eyes.'),
    steps: [T('اكتب الهدف بالملّي ثانية وقاعدة النجاح قبل البدء.', 'Write the target in milliseconds and the pass rule before starting.'),
      T('صوّر المفتاح والسهم في إطار واحد، وبدّل «الدرج ب» من مفتوح إلى مقفل.', 'Film the switch and the arrow in one frame and toggle “Stair B” from open to locked.'),
      T('عُدّ الإطارات من تغيّر وضع المفتاح إلى تغيّر لون السهم؛ الزمن = الإطارات ÷ fps × 1000.', 'Count frames from the switch changing to the arrow changing colour; latency = frames ÷ fps × 1000.'),
      T('20 تجربة مقترحة: 10 والمتصفح موصول و10 بالتغذية وحدها.', '20 trials suggested: 10 with the browser connected and 10 on power alone.'),
      T('اضغط SOS (أو سخّن الحارس) وتحقق أن الطنّان يعمل والبيانات مفصولة.', 'Press SOS (or trigger the sentinel) and check that the buzzer sounds with the data cable unplugged.')],
    rec: T('رقم التجربة، الحدث، المسار (متصفح / تغذية فقط)، الإطارات، fps.', 'Trial number, event, path (browser / power only), frames, fps.'),
    ana: T('الوسيط والمدى الربعي والأدنى والأقصى، مقارنة بالهدف الذي كتبته قبل التجربة؛ والتحقق من أن الإنذار المحلي لا يعتمد على المتصفح.', 'Median, interquartile range, minimum and maximum, against the target you wrote before the test; and a check that the local alarm does not depend on the browser.'),
    cols: [{ k: 'n', ar: 'التجربة', en: 'Trial' }, { k: 'ev', ar: 'الحدث', en: 'Event', t: 1 }, { k: 'path', ar: 'المسار', en: 'Path', t: 1 }, { k: 'fr', ar: 'الإطارات', en: 'Frames' }, { k: 'fps', ar: 'fps', en: 'fps' }, { k: 'lat', ar: 'الزمن', en: 'Latency', u: 'ms', calc: function (r) { return num(r.fr) / num(r.fps) * 1000; }, stat: 1 }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 20 });
  ex({ id: 'T5', title: T('استجابة بخار الغاز (معقّم اليدين)', 'Gas-vapour response (hand sanitiser)'), hyp: 'gas key',
    q: T('كم تقفز قراءة MQ-2 بمسحة معقّم، وكم يلزم للتحذير والخطر والتعافي؟ (الإيثانول ليس غازًا مسالًا.)', 'How much does the MQ-2 reading jump with a sanitiser swab, and how long to warn, danger and recovery? (Ethanol is not LPG.)'),
    mat: [T('لوحة الحارس مع MQ-2 (بعد الإحماء حسب T1)', 'The sentinel board with the MQ-2 (warmed up as in T1)'), T('قطعة قطن صغيرة بنقطة معقّم، ومسطرة، ومؤقّت، وغرفة جيدة التهوية', 'A small cotton piece with a drop of sanitiser, a ruler, a timer and a well-ventilated room')],
    safe: T('الكحول قابل للاشتعال: كمية صغيرة، لا لهب ولا مجفف شعر ولا حرارة، بعيدًا عن الوجه، وتُرمى المسحة خارج الغرفة.', 'Alcohol is flammable: a small amount, no flame, hair dryer or heat, away from the face, and the swab is thrown away outside the room.'),
    steps: [T('اكتب قاعدة النجاح قبل البدء، واعتمد «خط الأساس + 3σ» للتحذير و«+ 10σ» للخطر.', 'Write the pass rule before starting; use “baseline + 3σ” for warn and “+ 10σ” for danger.'),
      T('سجّل خط الأساس 5 دقائق.', 'Log the baseline for 5 minutes.'),
      T('ضع المسحة على 20 سم ثم 10 سم ثم 5 سم (مقترح) 30 ثانية لكل مسافة، 3 تكرارات لكل مسافة.', 'Hold the swab at 20 cm, then 10 cm, then 5 cm (suggested) for 30 s each, 3 repeats per distance.'),
      T('سجّل الذروة (mV) وزمن بلوغ التحذير والخطر، ثم أبعد المسحة وقِس زمن العودة إلى خط الأساس ± σ.', 'Record the peak (mV) and the time to warn and danger, then remove the swab and time the return to baseline ± σ.')],
    rec: T('المسافة، التكرار، خط الأساس وσ، الذروة، الأزمنة، حرارة الغرفة ورطوبتها.', 'Distance, repeat, baseline and σ, peak, times, room temperature and humidity.'),
    ana: T('اعرض mV لا ppm. قارن بالرطوبة؛ ولا تقل إن المعقّم «غاز مسال».', 'Show mV, not ppm. Compare with humidity; and never say sanitiser is “LPG”.'),
    cols: [{ k: 'd', ar: 'المسافة', en: 'Distance', u: 'cm' }, { k: 'rep', ar: 'التكرار', en: 'Repeat' }, { k: 'bm', ar: 'خط الأساس', en: 'Baseline', u: 'mV' }, { k: 'bs', ar: 'σ', en: 'σ', u: 'mV' }, { k: 'pk', ar: 'الذروة', en: 'Peak', u: 'mV', stat: 1 }, { k: 'tw', ar: 'زمن التحذير', en: 'Time to warn', u: 's', stat: 1 }, { k: 'td', ar: 'زمن الخطر', en: 'Time to danger', u: 's', stat: 1 }, { k: 'rec', ar: 'التعافي', en: 'Recovery', u: 's', stat: 1 }, { k: 'rt', ar: 'الحرارة', en: 'T', u: '°C' }, { k: 'rh', ar: 'الرطوبة', en: 'RH', u: '%' }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 12 });
  ex({ id: 'T6', title: T('مستوى الماء بالموجات فوق الصوتية', 'Water level by ultrasound'), hyp: 'flood key',
    q: T('كم يخطئ عمق الماء المقاس؟ وهل يصلح تعويض الحرارة من SHT31 في هواء أدفأ؟', 'How wrong is the measured water depth? And does temperature compensation from the SHT31 help in warmer air?'),
    mat: [T('HC-SR04 (أو JSN-SR04T) مثبّتًا فوق وعاء شفاف', 'An HC-SR04 (or JSN-SR04T) mounted above a clear container'), T('مسطرة، وماء، وSHT31', 'A ruler, water and the SHT31')],
    safe: T('ماء مع إلكترونيات: المستشعر فوق الماء دائمًا، ولا كهرباء الشبكة قربه، وأيدٍ جافة ومنشفة؛ HC-SR04 غير مقاوم للماء فتوقف إن تبلل.', 'Water with electronics: the sensor stays above the water, no mains power near it, dry hands and a towel; the HC-SR04 is not waterproof so stop if it gets wet.'),
    steps: [T('اكتب قاعدة النجاح (مثلًا: «الخطأ المطلق ≤ 1 سم عند كل عمق») قبل البدء.', 'Write the pass rule (for example “absolute error ≤ 1 cm at every depth”) before starting.'),
      T('ثبّت ارتفاع التركيب H، وأضف ماءً إلى أعماق حقيقية مقترحة 0 و3 و6 و9 و12 سم تقيسها بالمسطرة.', 'Fix the mount height H and add water to suggested true depths 0, 3, 6, 9 and 12 cm measured with the ruler.'),
      T('سجّل القراءة بلا تعويض وبتعويض الحرارة، وحرارة الهواء.', 'Record the reading without and with temperature compensation, and the air temperature.'),
      T('كرّر والهواء أدفأ قليلًا (غرفة أدفأ، لا مجفف شعر على الماء) إن أمكن.', 'Repeat with slightly warmer air (a warmer room, never a hair dryer over the water) if possible.')],
    rec: T('العمق الحقيقي، القراءتان، حرارة الهواء.', 'True depth, both readings, air temperature.'),
    ana: T('الخطأ = القراءة − الحقيقة. هل يقلّ بالتعويض؟ وهل خطّ التحذير 15 سم آمن مع هذا الخطأ؟', 'Error = reading − truth. Does compensation reduce it? And is the 15 cm warn line safe with this error?'),
    cols: [{ k: 'true', ar: 'العمق الحقيقي', en: 'True depth', u: 'cm' }, { k: 'rep', ar: 'التكرار', en: 'Repeat' }, { k: 'raw', ar: 'بلا تعويض', en: 'Uncompensated', u: 'cm' }, { k: 'cmp', ar: 'بتعويض', en: 'Compensated', u: 'cm' }, { k: 'ta', ar: 'حرارة الهواء', en: 'Air T', u: '°C' }, { k: 'e1', ar: 'خطأ بلا تعويض', en: 'Error, uncomp.', u: 'cm', calc: function (r) { return num(r.raw) - num(r.true); }, stat: 1 }, { k: 'e2', ar: 'خطأ بتعويض', en: 'Error, comp.', u: 'cm', calc: function (r) { return num(r.cmp) - num(r.true); }, stat: 1 }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 15 });
  ex({ id: 'T7', title: T('تقدير WBGT مقابل مرجع', 'WBGT estimate against a reference'), hyp: 'F8, F9',
    q: T('كم يبعد تقدير WBGT (الظل) عن مرجع؟ وفي أي ظروف يعبر التقدير 28 °م؟', 'How far is the WBGT estimate (shade) from a reference? And under which conditions does the estimate cross 28 °C?'),
    mat: [T('لوحة الحارس مع SHT31 في وقاية من الإشعاع', 'The sentinel board with the SHT31 in a radiation shield'), T('مرجع: جهاز WBGT مستعار بكرة سوداء إن أمكن، وإلا مقياس رطوبة تدويري أو شفّاط (حرارة جافة ورطبة)', 'Reference: a borrowed WBGT meter with a black globe if possible, otherwise a sling or aspirated psychrometer (dry and wet bulb)'), T('مجفف شعر على «منخفض»', 'A hair dryer on “low”')],
    safe: T('الهواء الساخن: مسافة آمنة، ولا تسخّن الإلكترونيات المغلقة، ولا تجلس طويلًا في شمس مباشرة.', 'Hot air: a safe distance, never heat enclosed electronics, and do not sit long in direct sun.'),
    steps: [T('اكتب قاعدة النجاح (مثلًا: «|الفرق| ≤ 1 °م في ظروف الظل») قبل البدء.', 'Write the pass rule (for example “|difference| ≤ 1 °C in shade conditions”) before starting.'),
      T('سجّل 5 ظروف على الأقل (غرفة باردة، ثم الهواء الدافئ على ثلاث مسافات، ثم قطعة قماش رطبة قرب المستشعر).', 'Record at least 5 conditions (a cool room, then warm air at three distances, then a damp cloth near the sensor).'),
      T('في كل ظرف دوّن SHT31 وتقدير اللوحة والمرجع.', 'In each condition note the SHT31, the board’s estimate and the reference.'),
      T('تنبّه: حدّ قطر 32.1 °م قيمة مقيسة بكرة سوداء؛ المقياس التدويري يعطي البصلة الرطبة فقط.', 'Note: Qatar’s 32.1 °C line is a value measured with a black globe; a psychrometer gives the wet bulb only.')],
    rec: T('الظرف، حرارة ورطوبة SHT31، حرارة وبصلة رطبة المرجع، تقدير اللوحة، WBGT المرجع.', 'Condition, SHT31 temperature and humidity, the reference’s temperature and wet bulb, the board’s estimate, the reference WBGT.'),
    ana: T('الفرق = تقدير اللوحة − المرجع. تذكّر أن تقديرنا يميل إلى الانخفاض قليلًا (بصلة رطبة في هواء ساكن).', 'Difference = board estimate − reference. Remember our estimate leans slightly low (wet bulb in still air).'),
    cols: [{ k: 'cond', ar: 'الظرف', en: 'Condition', t: 1 }, { k: 'ta', ar: 'حرارة SHT31', en: 'SHT31 T', u: '°C' }, { k: 'rh', ar: 'رطوبة SHT31', en: 'SHT31 RH', u: '%' }, { k: 'tr', ar: 'حرارة المرجع', en: 'Reference T', u: '°C' }, { k: 'tw', ar: 'بصلة رطبة المرجع', en: 'Reference Tw', u: '°C' }, { k: 'wb', ar: 'تقدير اللوحة', en: 'Board estimate', u: '°C' }, { k: 'wr', ar: 'WBGT المرجع', en: 'Reference WBGT', u: '°C' }, { k: 'df', ar: 'الفرق', en: 'Difference', u: '°C', calc: function (r) { return num(r.wb) - num(r.wr); }, stat: 1 }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 10 });
  ex({ id: 'T8', title: T('تمرين التسجيل «أنا بأمان»', 'The “I’m safe” check-in drill'), hyp: 'Count', people: true,
    q: T('كم يلزم لعدّ المشاركين بتطبيق أو نقطة «آمن» مقابل نداء الأسماء بالورقة؟ وهل يفشل أحد؟', 'How long to count participants with a phone or the “safe” point versus a paper roll call? Does anyone fail?'),
    mat: [T('لوحة المعرض أو هاتف، ونقطة MANARA-SAFE، وسجل ورقي، ومؤقّت', 'A booth tablet or phone, the MANARA-SAFE point, a paper register, a stopwatch'), T('رموز غرف افتراضية ورموز مشاركين P01…', 'Fictional room codes and participant codes P01…')],
    safe: T('<b>موافقة المدرسة وموافقة مكتوبة أولًا.</b> بالغون فقط (معلمون وموظفون)؛ لا إنذار حقيقي؛ لافتة «تمرين»؛ لا ركض؛ مخارج مفتوحة؛ ومن لا يرتاح ينسحب.', '<b>School approval and written consent first.</b> Adults only (teachers, staff); no real alarm; an “EXERCISE” sign; no running; clear exits; anyone uncomfortable withdraws.'),
    steps: [T('احصل على الموافقة ونماذج الموافقة المستنيرة قبل أي شيء.', 'Get approval and informed-consent forms before anything.'),
      T('اكتب قاعدة النجاح (مثلًا: «وسيط زمن التسجيل بمنارة أقل من الورق») قبل البدء.', 'Write the pass rule (for example “MANARA’s median check-in time is lower than paper”) before starting.'),
      T('وزّع الرموز، وبدّل ترتيب الطريقتين بين المشاركين (موازنة الترتيب).', 'Hand out codes and alternate the order of the two methods between participants (counter-balancing).'),
      T('الجولة أ: نداء بالورقة. الجولة ب: تسجيل بمنارة (هاتف / لوحة / MANARA-SAFE). سجّل الزمن والنجاح والحاجة إلى مساعدة.', 'Round A: paper roll call. Round B: MANARA check-in (phone / tablet / MANARA-SAFE). Record time, success and whether help was needed.')],
    rec: T('رمز المشارك (لا اسم)، رمز الغرفة، الطريقة، ترتيب الجولة، الزمن، النجاح، الحاجة إلى مساعدة.', 'Participant code (no name), room code, method, round order, time, success, help needed.'),
    ana: T('الوسيط والمدى الربعي لكل طريقة؛ نسبة النجاح مع فاصل ويلسون. بلا أسماء في أي ورقة.', 'Median and interquartile range per method; success rate with a Wilson interval. No names on any sheet.'),
    cols: [{ k: 'p', ar: 'المشارك', en: 'Participant', t: 1 }, { k: 'room', ar: 'رمز الغرفة', en: 'Room code', t: 1 }, { k: 'm', ar: 'الطريقة', en: 'Method', t: 1 }, { k: 'ord', ar: 'ترتيب الجولة', en: 'Round order', t: 1 }, { k: 'time', ar: 'زمن التسجيل', en: 'Check-in time', u: 's', stat: 1 }, { k: 'ok', ar: 'نجح؟', en: 'Success?', u: '0/1', stat: 1, sum: 1 }, { k: 'help', ar: 'احتاج مساعدة؟', en: 'Needed help?', u: '0/1' }, { k: 'note', ar: 'ملاحظة', en: 'Note', t: 1 }], rows: 20 });
  ex({ id: 'T9', title: T('اختبار فهم الرسائل', 'Message comprehension test'), hyp: 'H3', people: true,
    q: T('هل تدفع البطاقة الشخصية (لغة + صيغة + صورة) عددًا أكبر من الناس إلى الفعل الصحيح من رسالة عامة مثل «إنذار: أخلِ»؟', 'Does the personal card (language + format + picture) move more people to the right action than a generic message such as “ALARM: evacuate”?'),
    mat: [T('بطاقات منارة من صفحة «هواتف السكان» (مطبوعة أو على الشاشة) ورسالة ضابطة عامة', 'MANARA cards from the Resident Phones page (printed or on screen) and a generic control message'), T('معيار تصحيح مكتوب سلفًا لكل خطر، ونماذج موافقة، ومؤقّت', 'A scoring rubric written in advance for each hazard, consent forms, a stopwatch')],
    safe: T('<b>موافقة المدرسة وموافقة مكتوبة أولًا؛ لا قاصرين بلا موافقة ولي الأمر.</b> لافتة «تمرين»؛ بلا ومضات؛ ولا تخيف أحدًا؛ ولا تختبر المسودات غير المراجعة كأنها نهائية.', '<b>School approval and written consent first; no minors without a parent’s consent.</b> An “EXERCISE” sign; no strobe; frighten nobody; do not test unreviewed drafts as if final.'),
    steps: [T('اكتب معيار «الفعل الصحيح» لكل خطر قبل البدء (مثلًا للحريق: «يغادر عبر الدرج ب، لا المصعد»).', 'Write the “correct action” criterion for each hazard before starting (for example fire: “leaves by Stair B, not the lift”).'),
      T('اختر 3 أخطار، ووزّع النسخة (منارة / ضابطة) والترتيب عشوائيًا بين المشاركين الذين يقرؤون اللغة.', 'Choose 3 hazards and assign the version (MANARA / control) and order at random among participants who read the language.'),
      T('اعرض البطاقة (مثلًا 20 ثانية) واسأل: «ماذا تفعل الآن، وإلى أين؟». صحّح دون أن تعرف النسخة إن أمكن.', 'Show the card (for example 20 s) and ask: “What do you do now, and where to?”. Score without knowing the version if possible.'),
      T('سجّل الزمن حتى الإجابة والثقة (1–5).', 'Record time to answer and confidence (1–5).')],
    rec: T('رمز المشارك، الفئة العمرية، اللغة، النسخة، الخطر، صحيح (0/1)، الزمن، الثقة.', 'Participant code, age group, language, version, hazard, correct (0/1), time, confidence.'),
    ana: T('نسبة الصحيح لكل نسخة مع فاصل ويلسون؛ والفرق بينهما. قل بصراحة إن n صغير وإن الفاصلين يتداخلان.', 'Proportion correct per version with Wilson intervals, and the difference. Say plainly if n is small and the intervals overlap.'),
    cols: [{ k: 'p', ar: 'المشارك', en: 'Participant', t: 1 }, { k: 'age', ar: 'الفئة العمرية', en: 'Age group', t: 1 }, { k: 'lang', ar: 'اللغة', en: 'Language', t: 1 }, { k: 'ver', ar: 'النسخة', en: 'Version', t: 1 }, { k: 'hz', ar: 'الخطر', en: 'Hazard', t: 1 }, { k: 'ok', ar: 'صحيح؟', en: 'Correct?', u: '0/1', stat: 1, sum: 1 }, { k: 'time', ar: 'زمن الإجابة', en: 'Time to answer', u: 's', stat: 1 }, { k: 'conf', ar: 'الثقة', en: 'Confidence', u: '1–5' }, { k: 'note', ar: 'تعليق', en: 'Comment', t: 1 }], rows: 24 });

  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? NaN : n; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
  function sig(v) { if (isNaN(v)) return '–'; var a = Math.abs(v); return String(Math.round(v * (a >= 100 ? 1 : a >= 10 ? 10 : 100)) / (a >= 100 ? 1 : a >= 10 ? 10 : 100)); }

  function buildExperiment(e) {
    var key = 'manara-report-' + e.id, data = jget(key, null) || [], pre = jget(key + '-pre', {});
    var root = el('article', 'exp'); root.id = 'exp-' + e.id; root.setAttribute('aria-labelledby', 'exp-h-' + e.id);
    var h = el('div', 'exp-h'); h.appendChild(el('span', 'exp-id', e.id));
    var h3 = el('h3'); h3.id = 'exp-h-' + e.id; biInto(h3, e.title.ar, e.title.en); h.appendChild(h3);
    var tg = el('span', 'ev planned'); biInto(tg, 'مخطَّط', 'PLANNED'); h.appendChild(tg);
    var tg2 = el('span', 'ev student'); tg2.textContent = e.hyp; h.appendChild(tg2);
    if (e.people) { var tg3 = el('span', 'ev na'); biInto(tg3, 'أشخاص: يلزم موافقة', 'people: approval needed'); h.appendChild(tg3); }
    root.appendChild(h);
    var b = el('div', 'exp-b'); root.appendChild(b);
    var h4 = bi('h4', 'السؤال والفرضية', 'Question and hypothesis'); b.appendChild(h4); b.appendChild(biRich('p', [e.q.ar, e.q.en]));
    // pre-registration
    var pr = el('div', 'prereg'); pr.appendChild(bi('h4', 'قاعدة النجاح (تُكتب قبل التشغيل)', 'Pass rule (write it before you run)'));
    pr.appendChild(bi('p', 'اكتب هنا قاعدتك قبل أن ترى أي نتيجة؛ لا تعدّلها بعد ذلك.', 'Write your rule here before seeing any result; do not change it afterwards.'));
    var lines = el('div', 'prereg-lines');
    [['pass', 'قاعدة النجاح', 'Pass rule'], ['n', 'عدد التجارب n', 'Number of trials n'], ['date', 'التاريخ والتوقيع', 'Date and initials']].forEach(function (f) {
      var d = el('div'), lab = el('label'); biInto(lab, f[1], f[2]); var inp = el('input', 'input'); inp.type = 'text'; inp.maxLength = 200; inp.value = pre[f[0]] || ''; inp.id = 'pre-' + e.id + '-' + f[0]; lab.htmlFor = inp.id;
      inp.addEventListener('input', function () { pre[f[0]] = inp.value; jset(key + '-pre', pre); }); d.appendChild(lab); d.appendChild(inp); lines.appendChild(d);
    });
    pr.appendChild(lines); b.appendChild(pr);
    var g = el('div', 'exp-grid'); b.appendChild(g);
    var c1 = el('div'); c1.appendChild(bi('h4', 'المواد', 'Materials')); var u = el('ul'); e.mat.forEach(function (m) { u.appendChild(biRich('li', [m.ar, m.en])); }); c1.appendChild(u);
    var sf = el('div', 'note warn exp-safety'); sf.appendChild(bi('h4', 'السلامة والأخلاقيات', 'Safety and ethics')); var sp = el('p'); var a1 = el('span'), b1 = el('span'); a1.setAttribute('data-l', 'ar'); b1.setAttribute('data-l', 'en'); boldInto(a1, e.safe.ar); boldInto(b1, e.safe.en); sp.appendChild(a1); sp.appendChild(b1); sf.appendChild(sp); c1.appendChild(sf);
    var c2 = el('div'); c2.appendChild(bi('h4', 'الخطوات', 'Steps')); var ol = el('ol'); e.steps.forEach(function (s) { ol.appendChild(biRich('li', [s.ar, s.en])); }); c2.appendChild(ol);
    g.appendChild(c1); g.appendChild(c2);
    var g2 = el('div', 'exp-grid'); b.appendChild(g2);
    var d1 = el('div'); d1.appendChild(bi('h4', 'ما يُسجَّل', 'What to record')); d1.appendChild(biRich('p', [e.rec.ar, e.rec.en]));
    var d2 = el('div'); d2.appendChild(bi('h4', 'التحليل', 'Analysis')); d2.appendChild(biRich('p', [e.ana.ar, e.ana.en]));
    g2.appendChild(d1); g2.appendChild(d2);
    // data table
    b.appendChild(bi('h4', 'جدول البيانات (فارغ: يُملأ على الشاشة أو بالقلم)', 'Data table (blank: fill it on screen or by pen)'));
    var wrap = el('div', 'table-wrap dt-wrap'), tbl = el('table', 'dt'), cap = el('caption'); biInto(cap, e.id + ': ' + e.title.ar, e.id + ': ' + e.title.en); tbl.appendChild(cap);
    var thead = el('thead'), trh = el('tr'); trh.appendChild(el('th', null, '#'));
    e.cols.forEach(function (c) { var th = el('th'); th.scope = 'col'; biInto(th, c.ar, c.en); if (c.u) { var sm = el('small'), bd = el('bdi', null, c.u + (c.calc ? ' · =' : '')); bd.setAttribute('dir', 'ltr'); sm.appendChild(bd); th.appendChild(sm); } trh.appendChild(th); });
    thead.appendChild(trh); tbl.appendChild(thead);
    var tbody = el('tbody'), cells = [];
    for (var r = 0; r < e.rows; r++) {
      var tr = el('tr'); tr.appendChild(el('td', 'rown', String(r + 1))); cells[r] = {};
      e.cols.forEach(function (c, ci) {
        var td = el('td'), inp = el('input'); inp.type = 'text'; inp.autocomplete = 'off'; inp.maxLength = 120; if (!c.t && !c.calc) inp.inputMode = 'decimal';
        inp.setAttribute('aria-label', e.id + ' · ' + (M.lang() === 'ar' ? 'الصف ' : 'row ') + (r + 1) + ' · ' + L(T(c.ar, c.en)));
        if (c.calc) { inp.readOnly = true; inp.tabIndex = -1; inp.setAttribute('aria-readonly', 'true'); }
        var v = data[r] && data[r][c.k]; if (v != null && !c.calc) inp.value = v;
        (function (rr, cc, ii) { ii.addEventListener('input', function () { collect(); }); }(r, c, inp));
        cells[r][c.k] = inp; td.appendChild(inp); tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    var statCols = e.cols.filter(function (c) { return c.stat; }), tfoot = el('tfoot');
    if (statCols.length) { var trf = el('tr'); trf.appendChild(el('td', null, 'Σ')); e.cols.forEach(function (c) { var td = el('td'); td.setAttribute('data-stat', c.k); trf.appendChild(td); }); tfoot.appendChild(trf); tbl.appendChild(tfoot); }
    wrap.appendChild(tbl); b.appendChild(wrap);
    function rowVals(r) { var o = {}; e.cols.forEach(function (c) { o[c.k] = cells[r][c.k].value; }); return o; }
    function collect() {
      var out = [];
      for (var r = 0; r < e.rows; r++) { var o = rowVals(r); e.cols.forEach(function (c) { if (c.calc) { var v = c.calc(o); cells[r][c.k].value = isNaN(v) || !isFinite(v) ? '' : sig(v); } }); out.push(rowVals(r)); }
      jset(key, out.map(function (o) { var c = {}; e.cols.forEach(function (k) { if (!k.calc) c[k.k] = o[k.k]; }); return c; }));
      statCols.forEach(function (c) {
        var vals = []; for (var r = 0; r < e.rows; r++) { var n = num(cells[r][c.k].value); if (!isNaN(n)) vals.push(n); }
        var td = $('[data-stat="' + c.k + '"]', tfoot); td.textContent = '';
        if (!vals.length) return;
        if (c.sum) { td.appendChild(doc.createTextNode(vals.reduce(function (s, x) { return s + x; }, 0) + ' / ' + vals.length)); var sm = el('small', null, L(T('مجموع / عدد', 'sum / n'))); td.appendChild(sm); }
        else { td.appendChild(doc.createTextNode(sig(median(vals)))); var s2 = el('small', null, 'n=' + vals.length + ' · min ' + sig(Math.min.apply(null, vals)) + ' · max ' + sig(Math.max.apply(null, vals))); td.appendChild(s2); }
      });
    }
    collect();
    var tools = el('div', 'dt-tools no-print'), bc = el('button', 'btn btn-ghost btn-sm'); bc.type = 'button'; bc.insertAdjacentHTML('afterbegin', M.icon('download')); biInto(bc.appendChild(el('span')), 'نزّل CSV', 'Download CSV');
    bc.addEventListener('click', function () {
      var lines = [e.cols.map(function (c) { return csv(L(T(c.ar, c.en)) + (c.u ? ' (' + c.u + ')' : '')); }).join(',')];
      for (var r = 0; r < e.rows; r++) { var o = rowVals(r); if (e.cols.some(function (c) { return !c.calc && o[c.k] !== ''; })) lines.push(e.cols.map(function (c) { return csv(o[c.k]); }).join(',')); }
      var blob = new Blob(['﻿' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'manara-' + e.id + '.csv'; doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    var bx = el('button', 'btn btn-ghost btn-sm'); bx.type = 'button'; bx.insertAdjacentHTML('afterbegin', M.icon('reset')); biInto(bx.appendChild(el('span')), 'امسح الجدول', 'Clear the table');
    bx.addEventListener('click', function () { if (!window.confirm(L(T('مسح كل خانات ' + e.id + ' من هذا المتصفح؟', 'Clear every cell of ' + e.id + ' from this browser?')))) return; for (var r = 0; r < e.rows; r++) e.cols.forEach(function (c) { cells[r][c.k].value = ''; }); collect(); });
    var hint = el('p', 'small'); biInto(hint, 'الخانات تُحفظ في هذا المتصفح فقط ولا تُرسل إلى أي مكان.', 'Cells are saved in this browser only and are not sent anywhere.');
    tools.appendChild(bc); tools.appendChild(bx); tools.appendChild(hint); b.appendChild(tools);
    var nt = el('div', 'exp-notes'); nt.appendChild(bi('h4', 'ملاحظات وانحرافات عن البروتوكول', 'Notes and deviations from the protocol')); nt.appendChild(el('div', 'blank')); b.appendChild(nt);
    return root;
  }
  function csv(s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function initExperiments() { var host = $('#exp-list'); if (!host) return; X.forEach(function (e) { host.appendChild(buildExperiment(e)); }); isoNums(host); }

  /* ================================================================== logbook */
  var LOGX = [
    { t: T('فحص القطع', 'Parts check'), g: T('التأكد أن كل قطعة وصلت وتعمل قبل البناء', 'Confirm every part arrived and works before building'),
      d: T('وضعتُ القطع على الطاولة وصوّرتها وقارنتها بجدول القطع في صفحة «بناء النموذج»، ثم غذّيت كل وحدة وحدها بـ 5 فولت.', 'I laid the parts out, photographed them and compared them with the parts table on the Build page, then powered each module alone from 5 V.'),
      e: T('كل القطع موجودة.', 'Every part is there.'), h: T('{{ما وصل، وما ينقص، وما تالف}}', '{{what arrived, what is missing, what is damaged}}'), l: T('{{ما تعلّمته}}', '{{what I learned}}'), n: T('{{ما سأطلبه من جديد}}', '{{what I will reorder}}'), v: T('صورة {{رقم}}', 'photo {{number}}') },
    { t: T('أول تشغيل ومسح I2C', 'First power-up and I2C scan'), g: T('أن أرى اللوحة تتكلم مع المستشعرات', 'See the board talk to the sensors'),
      d: T('رفعتُ شيفرة الحارس مع تفعيل علامات HAS_ للقطع المركّبة فقط، وفتحتُ الشاشة التسلسلية على 115200.', 'I flashed the sentinel sketch with only the HAS_ flags of the fitted parts switched on, and opened the serial monitor at 115200.'),
      e: T('تظهر العناوين 0x33 (MLX90640) و0x44 (SHT31) كما تقول قائمة الفحص في README.', 'Addresses 0x33 (MLX90640) and 0x44 (SHT31) appear, as the README checklist says.'), h: T('{{ما طبعته الشاشة بالضبط}}', '{{exactly what the serial monitor printed}}'), l: T('{{ما غيّرته إن لم تظهر}}', '{{what I changed if they did not appear}}'), n: T('{{الخطوة التالية}}', '{{next step}}'), v: T('لقطة شاشة {{اسم الملف}}', 'screenshot {{file name}}') },
    { t: T('T1 اليوم الأول: الإحماء', 'T1 day 1: warm-up'), g: T('قياس زمن استقرار MQ-2 وخط أساسه', 'Measure the MQ-2’s settling time and baseline'),
      d: T('كتبتُ قاعدة النجاح قبل التشغيل: {{قاعدتي}}. سجّلتُ كل 10 ثوانٍ لمدة 60 دقيقة في هواء نظيف.', 'I wrote the pass rule before running: {{my rule}}. I logged every 10 s for 60 minutes in clean air.'),
      e: T('{{توقّعي المكتوب قبل التجربة}}', '{{my prediction, written before}}'), h: T('{{زمن الاستقرار، خط الأساس، σ، حرارة ورطوبة}}', '{{time to settle, baseline, σ, temperature and humidity}}'), l: T('{{هل نجح؟ ماذا يعني للعتبة؟}}', '{{did it pass? what does it mean for the threshold?}}'), n: T('أعيد بعد 48 ساعة', 'Repeat after 48 hours'), v: T('ملف {{اسم ملف السجل}}', 'file {{log file name}}') },
    { t: T('قراءة غريبة', 'An odd reading'), g: T('فهم لماذا تقفز القراءة', 'Understand why the reading jumps'),
      d: T('لاحظتُ أن القراءة تتغيّر حين يُفتح الباب. سجّلتُ الحرارة والرطوبة بجانبها وكررتُ مع حجب تيار الهواء.', 'I noticed the reading changes when the door opens. I logged temperature and humidity next to it and repeated with the draught blocked.'),
      e: T('{{ما كنتُ أتوقعه}}', '{{what I expected}}'), h: T('{{الأرقام قبل الحجب وبعده}}', '{{the numbers before and after blocking}}'), l: T('{{ما استنتجتُه، وهل غيّرتُ طريقة القياس؟}}', '{{what I concluded, and whether I changed the method}}'), n: T('أكرر وأسجّل', 'Repeat and log'), v: T('ملف {{…}}', 'file {{…}}') },
    { t: T('T2: البقعة الحرارية والمسافة', 'T2: hotspot and distance'), g: T('معرفة المسافة التي يختفي عندها الكوب الساخن', 'Find the distance at which the hot mug disappears'),
      d: T('قِستُ ماء الكوب بالمسبار ({{°م}}) ثم وضعتُ الكاميرا على 0.5 و0.75 و1.0 و1.5 و2.0 م، 3 مرات لكل مسافة.', 'I measured the mug’s water with the probe ({{°C}}) then placed the camera at 0.5, 0.75, 1.0, 1.5 and 2.0 m, 3 times each.'),
      e: T('{{قاعدة النجاح والمسافة المتوقعة}}', '{{pass rule and expected distance}}'), h: T('{{جدول tmax والعلم لكل مسافة}}', '{{table of tmax and flag per distance}}'), l: T('{{ماذا يعني للمفتاح الحراري؟}}', '{{what it means for the thermal key}}'), n: T('اختبار الزجاج', 'The glass test'), v: T('صور {{أرقام}}', 'photos {{numbers}}') },
    { t: T('T3: تجارب المموِّهات', 'T3: decoy trials'), g: T('هل يصل مموِّه أحادي إلى تنبيه عام؟', 'Does a single decoy reach a public alert?'),
      d: T('كتبتُ n = {{عدد}} لكل مموِّه وقاعدة «0 تنبيه عام». لم أضغط «موافقة» في تجارب المموِّهات.', 'I wrote n = {{number}} per decoy and the rule “0 public alerts”. I did not press “Approve” in decoy trials.'),
      e: T('{{توقّعي لكل مموِّه}}', '{{my prediction per decoy}}'), h: T('{{k من n لكل مموِّه، وأي مفتاح تحرّك}}', '{{k of n per decoy, and which key moved}}'), l: T('{{الحد الأعلى 95% (F15) وماذا يعني، وهل من سبب مشترك؟}}', '{{the 95% upper bound (F15) and what it means; any common cause?}}'), n: T('{{هل أزيد n؟}}', '{{do I raise n?}}'), v: T('ملف {{…}} · إيداع {{…}}', 'file {{…}} · commit {{…}}') },
    { t: T('T4: زمن الاستجابة بالتصوير البطيء', 'T4: latency by slow-motion video'), g: T('قياس الزمن من المفتاح إلى السهم', 'Measure the time from switch to arrow'),
      d: T('صوّرتُ بـ {{fps}} إطارًا/ث وعدّدتُ الإطارات؛ نصف التجارب والمتصفح موصول ونصفها بالتغذية فقط.', 'I filmed at {{fps}} frames/s and counted frames; half the trials with the browser connected and half on power alone.'),
      e: T('الهدف الذي كتبتُه قبل التجربة: {{ms}}', 'The target I wrote before the test: {{ms}}'), h: T('{{الوسيط والمدى}}', '{{median and range}}'), l: T('{{هل تحقّق الهدف؟ هل اختلف المساران؟}}', '{{was the target met? did the two paths differ?}}'), n: T('{{ما سأحسّنه}}', '{{what I will improve}}'), v: T('فيديو {{اسم}}', 'video {{name}}') },
    { t: T('تغيير مع سببه', 'A change, with its reason'), g: T('تعديل عتبة وتوثيق السبب', 'Change a threshold and document why'),
      d: T('غيّرتُ {{العتبة}} من {{القيمة القديمة}} إلى {{الجديدة}} لأن {{السبب من البيانات}}، ثم أعدتُ {{أي تجربة}}.', 'I changed {{the threshold}} from {{old value}} to {{new}} because {{the reason, from data}}, then re-ran {{which experiment}}.'),
      e: T('{{ماذا توقّعتُ أن يتغيّر}}', '{{what I predicted would change}}'), h: T('{{ماذا تغيّر فعلًا}}', '{{what actually changed}}'), l: T('{{هل كان التعديل صحيحًا؟}}', '{{was the change right?}}'), n: T('{{التالي}}', '{{next}}'), v: T('إيداع git {{رقم}}', 'git commit {{id}}') },
    { t: T('موافقة المدرسة', 'The school’s approval'), g: T('الحصول على الموافقة قبل التجارب على أشخاص', 'Get approval before experiments with people'),
      d: T('عرضتُ على {{من}} بروتوكول T8 وT9 ونماذج الموافقة؛ ذكرتُ أنه بالغون فقط، وأن القاصرين يحتاجون موافقة ولي الأمر.', 'I showed {{whom}} the T8 and T9 protocols and the consent forms; I said adults only, and that minors need a parent’s consent.'),
      e: T('{{ماذا توقّعتُ من شروط}}', '{{what conditions I expected}}'), h: T('{{القرار والتاريخ والشروط}}', '{{decision, date and conditions}}'), l: T('{{ما غيّرتُه في البروتوكول}}', '{{what I changed in the protocol}}'), n: T('أبدأ بعد التوقيع فقط', 'Start only after the signature'), v: T('نسخة موقّعة {{مكان الحفظ}}', 'signed copy {{where it is kept}}') },
    { t: T('اجتماع مع المرشد واستعمال الذكاء الاصطناعي', 'Mentor meeting and AI use'), g: T('مراجعة التقدّم وتوثيق ما ساعدتني فيه الأداة', 'Review progress and record what the tool helped with'),
      d: T('استعنتُ بأداة ذكاء اصطناعي في {{المهمة}}. راجعتُ المعادلتين {{F…}} بيدي على الورق بالأرقام {{…}}، وغيّرتُ {{…}}.', 'I used an AI tool for {{the task}}. I checked formulas {{F…}} by hand on paper with the numbers {{…}}, and changed {{…}}.'),
      e: T('{{ما كنتُ أريد من الاجتماع}}', '{{what I wanted from the meeting}}'), h: T('{{ملاحظات المرشد}}', '{{the mentor’s remarks}}'), l: T('{{ما سأكتبه بكلماتي في التقرير}}', '{{what I will write in my own words in the report}}'), n: T('{{المهام}}', '{{tasks}}'), v: T('{{توقيع المرشد}}', '{{mentor’s initials}}') }
  ];
  var LOGF = [['g', 'الهدف', 'Goal'], ['d', 'ما فعلتُه', 'What I did'], ['e', 'ما توقّعتُه', 'What I expected'], ['h', 'ما حدث', 'What happened'], ['l', 'ما تعلّمتُ أو غيّرتُ', 'What I learned or changed'], ['n', 'الخطوة التالية', 'Next step'], ['v', 'الدليل', 'Evidence']];
  function initLogbook() {
    var host = $('#log-ex'); if (host) LOGX.forEach(function (x, i) {
      var a = el('article', 'log-entry'), hd = el('header'), no = el('span', 'log-no', '#' + (i + 1)), h4 = el('h4'); biInto(h4, x.t.ar, x.t.en);
      var tag = el('span', 'ev example'); biInto(tag, 'مثال: ليس حدثًا حقيقيًا', 'EXAMPLE: not a real event'); hd.appendChild(no); hd.appendChild(h4); hd.appendChild(tag); a.appendChild(hd);
      var dl = el('dl'); LOGF.forEach(function (f) { var d = el('div'), dt = el('dt'); biInto(dt, f[1], f[2]); var dd = biRich('dd', [x[f[0]].ar, x[f[0]].en]); d.appendChild(dt); d.appendChild(dd); dl.appendChild(d); }); a.appendChild(dl); host.appendChild(a);
    });
    if (host) isoNums(host);
    var form = $('#log-form'), list = $('#log-mine-list'), KEY = 'manara-report-log', items = jget(KEY, []);
    function render() {
      if (!list) return; list.textContent = '';
      items.forEach(function (it, i) {
        var a = el('article', 'log-entry mine'), hd = el('header'), h4 = el('h4'); hd.appendChild(el('span', 'log-no', '#' + (i + 1))); h4.textContent = it.goal; hd.appendChild(h4);
        var tm = el('span', 'small muted', it.when); hd.appendChild(tm);
        var rm = el('button', 'icon-btn no-print'); rm.type = 'button'; rm.setAttribute('aria-label', L(T('احذف هذا الإدخال', 'Delete this entry'))); rm.insertAdjacentHTML('afterbegin', M.icon('x')); rm.addEventListener('click', function () { items.splice(i, 1); jset(KEY, items); render(); }); hd.appendChild(rm); a.appendChild(hd);
        var dl = el('dl'); [['did', 'ما فعلتُه', 'What I did'], ['exp', 'ما توقّعتُه', 'What I expected'], ['happened', 'ما حدث', 'What happened'], ['learn', 'ما تعلّمتُ والخطوة التالية', 'Learned / next'], ['evid', 'الدليل', 'Evidence']].forEach(function (f) { if (!it[f[0]]) return; var d = el('div'), dt = el('dt'); biInto(dt, f[1], f[2]); var dd = el('dd'); dd.textContent = it[f[0]]; d.appendChild(dt); d.appendChild(dd); dl.appendChild(d); });
        a.appendChild(dl); list.appendChild(a);
      });
      if (!items.length) { var p = el('p', 'small muted'); biInto(p, 'لا إدخالات بعد. أضف أول إدخال حقيقي بعد أول جلسة عمل على العتاد.', 'No entries yet. Add your first real entry after your first work session on the hardware.'); list.appendChild(p); }
    }
    render();
    if (!form) return;
    var when = $('#lf-when'); if (when && !when.value) { var n = new Date(), p = function (v) { return (v < 10 ? '0' : '') + v; }; when.value = n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()) + 'T' + p(n.getHours()) + ':' + p(n.getMinutes()); }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var g = function (id) { var e = $('#' + id); return e ? e.value.trim() : ''; };
      items.push({ when: g('lf-when').replace('T', ' '), goal: g('lf-goal'), did: g('lf-did'), exp: g('lf-exp'), happened: g('lf-happened'), learn: g('lf-learn'), evid: g('lf-evid') });
      jset(KEY, items); render(); ['lf-goal', 'lf-did', 'lf-exp', 'lf-happened', 'lf-learn', 'lf-evid'].forEach(function (id) { var e = $('#' + id); if (e) e.value = ''; });
      M.toast(T('أُضيف الإدخال', 'Entry added'), 'safe');
    });
    var ex_ = $('#lf-export'); if (ex_) ex_.addEventListener('click', function () {
      var md = '# MANARA engineering logbook\n\n' + items.map(function (it, i) { return '## #' + (i + 1) + ' ' + it.goal + '\n\n- When: ' + it.when + '\n- What I did: ' + it.did + '\n- What I expected: ' + it.exp + '\n- What happened: ' + it.happened + '\n- Learned / next: ' + it.learn + '\n- Evidence: ' + it.evid + '\n'; }).join('\n');
      var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' }), a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'manara-logbook.md'; doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    var cl = $('#lf-clear'); if (cl) cl.addEventListener('click', function () { if (!window.confirm(L(T('مسح كل إدخالاتك من هذا المتصفح؟ صدِّرها أولًا.', 'Clear all your entries from this browser? Export them first.')))) return; items = []; jset(KEY, items); render(); });
  }

  /* ================================================================== Arabic text: keep numeric ranges / sums / sizes left-to-right (DOM only, no innerHTML) */
  function isoNums(root) {
    var NUM = '\\d(?:[\\d.,:]*\\d)?%?', re = new RegExp(NUM + '(?:\\s*(?:[–−+×÷=≥≤≈<>→]|\\s-\\s)\\s*' + NUM + ')+|[≥≤<>≈]\\s*' + NUM, 'g');
    $$('[data-l="ar"]', root).forEach(function (sp) {
      var w = doc.createTreeWalker(sp, NodeFilter.SHOW_TEXT, null), list = [], n;
      while ((n = w.nextNode())) { var p = n.parentNode; if (p && p.closest && p.closest('bdi,code,mark,pre')) continue; list.push(n); }
      list.forEach(function (tn) {
        var t = tn.nodeValue, last = 0, frag = null, m; re.lastIndex = 0;
        while ((m = re.exec(t))) {
          var prev = t.charAt(m.index - 1), next = t.charAt(m.index + m[0].length);
          var before = t.slice(0, m.index).replace(/\s+$/, '').slice(-1);
          if ((prev && /[A-Za-z0-9_.:\/\-]/.test(prev)) || (next && /[A-Za-z]/.test(next)) || (/^[≥≤<>≈]/.test(m[0]) && /[A-Za-z0-9]/.test(before))) continue;
          frag = frag || doc.createDocumentFragment();
          if (m.index > last) frag.appendChild(doc.createTextNode(t.slice(last, m.index)));
          var b = doc.createElement('bdi'); b.setAttribute('dir', 'ltr'); b.textContent = m[0]; frag.appendChild(b); last = m.index + m[0].length;
        }
        if (frag) { if (last < t.length) frag.appendChild(doc.createTextNode(t.slice(last))); tn.parentNode.replaceChild(frag, tn); }
      });
    });
  }

  /* ================================================================== keyboard access to scrollable regions (tables, formulas, code) */
  var capUid = 0;
  function initScrollables() {
    var nodes = $$('.table-wrap, pre.f-eq, pre.code');
    function upd() {
      nodes.forEach(function (w) {
        if (w.scrollWidth > w.clientWidth + 1) {
          w.tabIndex = 0; w.setAttribute('role', 'region');
          var cap = w.querySelector('caption');
          if (cap) { if (!cap.id) cap.id = 'cap-' + (++capUid); w.removeAttribute('aria-label'); w.setAttribute('aria-labelledby', cap.id); }
          else { w.removeAttribute('aria-labelledby'); w.setAttribute('aria-label', L(T(w.tagName === 'PRE' && w.classList.contains('f-eq') ? 'معادلة (قابلة للتمرير)' : 'شيفرة (قابلة للتمرير)', w.tagName === 'PRE' && w.classList.contains('f-eq') ? 'Formula (scrollable)' : 'Code (scrollable)'))); }
        } else { w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-labelledby'); w.removeAttribute('aria-label'); }
      });
    }
    upd(); window.addEventListener('resize', upd); window.addEventListener('langchange', upd);
  }

  /* ================================================================== boot */
  function boot() {
    initToc(); initButtons(); initAbstractCount(); initExperiments(); initChecks(); initLogbook(); initRepro(); initScrollables();
    lastW = window.innerWidth; renderFigures();
    window.addEventListener('resize', onResize);
    window.addEventListener('langchange', function () { renderFigures(); });
    window.__reportReady = true;
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
