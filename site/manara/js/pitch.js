/* MANARA («منارة») — Pitch  (pitch.html)
 * ==========================================================================================
 * The presentation kit: (1) a 12-slide deck with a full-screen mode, keyboard + swipe, an overview (O), presenter notes (N)
 * with a speaker timer for a STRICT 3-minute path and a 7-minute extended path, bilingual per slide, diagrams drawn in code;
 * (2) the Script tab (3-minute script with timestamps, the ONE live moment, and the "if the demo fails" script);
 * (3) the Q&A tab (judge questions with honest answers, searchable, weak spots flagged);
 * (4) the Booth tab (checklist, rehearsal timer, top-10 failure points, numbers you may say).
 * Classic script, no libraries. Every string is bilingual (data-l pairs or Manara.L). Nothing typed by the user or taken from
 * storage is ever assigned to innerHTML. All real-world numbers come from docs/MANARA-SOURCES.md and carry their source; every
 * simulated number is marked SIM. The simulation numbers on slides 9 and 10 are computed live by window.ManaraSim when it is
 * loaded; the static baseline is the same call (preset fire-night, seed 1) so the page works even without the engine.
 * Keys:  ←/→ (reading direction) · Space/PgDn/PgUp · Home/End · 1–9 · F full screen · N notes · O overview · P print
 *        L language · S timer · ? help · Esc close/exit.  Hash: #slides #script #qa #booth  #s7 (slide 7)  #q-D1 (a question).
 */
(function () {
  'use strict';
  var M = window.Manara;
  if (!M) return;
  var doc = document, html = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = window.ManaraSim || null;
  function lang() { return M.lang(); }
  function L(o) { return M.L(o); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
  function num(n, d) { return M.num(n, d); }
  function store(k, v) { return M.store(k, v); }
  function jget(k, d) { try { var s = store(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
  function jset(k, v) { try { store(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  /* ---------------- tiny DOM helpers (text only: never innerHTML for data) ---------------- */
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(doc.createTextNode(String(c))); return; }
    el.appendChild(c);
  }
  function h(tag, attrs) {
    var el = doc.createElement(tag), k;
    if (attrs) for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null && attrs[k] !== false) {
      if (k === 'class') el.className = attrs[k]; else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  // **bold** and `code` (always left-to-right) mini-markup -> text + <b> / <bdi> nodes
  function rich(parent, s) {
    String(s).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(function (part) {
      if (!part) return;
      if (part.slice(0, 2) === '**') { var b = doc.createElement('b'); b.textContent = part.slice(2, -2); parent.appendChild(b); }
      else if (part.charAt(0) === '`') { var c = doc.createElement('bdi'); c.setAttribute('dir', 'ltr'); c.className = 'code-i'; c.textContent = part.slice(1, -1); parent.appendChild(c); }
      else parent.appendChild(doc.createTextNode(part));
    });
    return parent;
  }
  // two sibling elements, one per language; CSS (base.css) shows only the active one
  function bi(ar, en, tag, cls, extra) {
    var f = doc.createDocumentFragment();
    [['ar', ar], ['en', en]].forEach(function (p) {
      var e = h(tag || 'span', Object.assign({ 'data-l': p[0], class: cls || null }, extra || {}));
      rich(e, p[1]); f.appendChild(e);
    });
    return f;
  }
  function bio(o, tag, cls, extra) { return bi(o.ar, o.en, tag, cls, extra); }
  // same pair but the SECOND language only (the "mirror"): shown when the page is in the other language
  function mirror(o, tag, cls) {
    var f = doc.createDocumentFragment();
    [['en', o.en, 'ar'], ['ar', o.ar, 'en']].forEach(function (p) {
      var e = h(tag || 'span', { 'data-lm': p[0], lang: p[0], dir: p[0] === 'en' ? 'ltr' : 'rtl', class: cls || null }); rich(e, p[1]); f.appendChild(e);
    });
    return f;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) {
    var el = doc.createElementNS(NS, tag), k;
    if (attrs) for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) el.setAttribute(k, attrs[k]);
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; if (typeof c === 'string') el.appendChild(doc.createTextNode(c)); else el.appendChild(c); }
    return el;
  }
  function svBi(ar, en, attrs) {   // bilingual SVG text
    var g = sv('g');
    [['ar', ar], ['en', en]].forEach(function (p) { var t = sv('text', Object.assign({ 'data-l': p[0] }, attrs || {})); t.textContent = p[1]; g.appendChild(t); });
    return g;
  }
  var ICON = {
    prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/>',
    print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>',
    keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5L20 7"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    water: '<path d="M3 15c2 0 2-2 4.5-2S10 15 12 15s2-2 4.5-2S19 15 21 15M3 19c2 0 2-2 4.5-2S10 19 12 19s2-2 4.5-2S19 19 21 19M12 3c-2 3-4 5-4 7a4 4 0 0 0 8 0c0-2-2-4-4-7z"/>',
    gas: '<rect x="7" y="10" width="10" height="11" rx="2.5"/><path d="M10 10V6.5h4V10M9 4c1-1.3 2 1 3 0s2 1.300 3 0"/>',
    dust: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    sensor: '<rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 3v3M16 3v3M8 18v3M16 18v3"/>',
    buzzer: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.500a5 5 0 0 1 0 7"/>', ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    arrows: '<path d="M4 12h16M14 6l6 6-6 6"/>', pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'
  };
  function svgIcon(name, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON[name] || '') + '</svg>';
  }
  // icon by name: the local set first, else core.js (static, authored SVG strings only)
  function iconNode(name, cls) {
    var t = h('div'); t.innerHTML = ICON[name] ? svgIcon(name, cls) : M.icon(name, cls);
    return t.firstChild;
  }
  var HZ_ICON = { fire: 'fire', gas: 'gas', flood: 'water', dust: 'dust', heat: 'thermo', sos: 'heart' };

  /* ---------------- strings (UI chrome) ---------------- */
  M.strings({
    'pt.prev': { ar: 'الشريحة السابقة', en: 'Previous slide' }, 'pt.next': { ar: 'الشريحة التالية', en: 'Next slide' },
    'pt.overview': { ar: 'نظرة عامة على الشرائح (O)', en: 'Slide overview (O)' }, 'pt.notes': { ar: 'ملاحظات المقدّم (N)', en: 'Presenter notes (N)' },
    'pt.print': { ar: 'طباعة الشرائح (P)', en: 'Print slides (P)' }, 'pt.present': { ar: 'ملء الشاشة (F)', en: 'Full screen (F)' },
    'pt.exit': { ar: 'خروج من العرض (Esc)', en: 'Exit presenting (Esc)' }, 'pt.lang': { ar: 'تبديل اللغة (L)', en: 'Switch language (L)' },
    'pt.help': { ar: 'اختصارات لوحة المفاتيح (?)', en: 'Keyboard shortcuts (?)' }, 'pt.theme': { ar: 'الوضع الليلي/النهاري', en: 'Dark/light mode' },
    'pt.path': { ar: 'مسار العرض', en: 'Presentation path' }, 'pt.path3': { ar: 'مسار ثلاث دقائق الصارم', en: 'Strict 3-minute path' },
    'pt.path7': { ar: 'مسار سبع دقائق الممتد', en: 'Extended 7-minute path' }, 'pt.tabs': { ar: 'أقسام العرض', en: 'Pitch sections' },
    'pt.timer': { ar: 'مؤقّت المقدّم (S)', en: 'Speaker timer (S)' }, 'pt.progress': { ar: 'تقدّم الشرائح', en: 'Slide progress' },
    'pt.close': { ar: 'إغلاق', en: 'Close' }, 'pt.slides': { ar: 'الشرائح', en: 'Slides' }, 'pt.stage': { ar: 'شرائح العرض التقديمي', en: 'Pitch slides' }, 'pt.slide': { ar: 'شريحة', en: 'Slide' }, 'pt.of': { ar: 'من', en: 'of' },
    'pt.start': { ar: 'ابدأ', en: 'Start' }, 'pt.pause': { ar: 'إيقاف مؤقت', en: 'Pause' }, 'pt.reset': { ar: 'من الصفر', en: 'Reset' },
    'pt.ahead': { ar: 'أبكر من الخطة', en: 'Ahead of plan' }, 'pt.behind': { ar: 'متأخر عن الخطة', en: 'Behind plan' }, 'pt.ontime': { ar: 'ضمن الخطة', en: 'On plan' },
    'pt.left': { ar: 'المتبقي لهذه الشريحة', en: 'Left on this slide' }, 'pt.over': { ar: 'تجاوزت الميزانية', en: 'Over budget' }
  });
  var T = function (ar, en) { return L({ ar: ar, en: en }); };

  /* ==========================================================================
     DATA
     ========================================================================== */
  // The 12 slides: budgets in seconds for the strict 3-minute path (t3, 0 = skipped) and the 7-minute path (t7).
  // say3 = the exact line for the 3-minute path; more7 = what to add in the 7-minute path; act = stage directions;
  // weak = what to say first (honest disclosure); qa = related Q&A ids.
  var SL = [
    { id: 'title', t3: 8, t7: 10, title: { ar: 'منارة', en: 'MANARA' },
      say3: { ar: 'السلام عليكم، نحن فريق «منارة». ترى الخطر… توقظ الجميع… وتُضيء طريق النجاة.', en: 'Peace be upon you — we are team MANARA. It sees danger. It wakes everyone. It lights the safe way out.' },
      more7: { ar: 'فكرتنا بسيطة: الطوارئ كثيرة، وما ينقص ليس الكشف وحده، بل أن يصل كل إنسان قريب من الخطر إلى بر الأمان.', en: 'Our idea is simple: emergencies come in many forms, and what is missing is not detection alone but getting every person near the danger to safety.' },
      act: { ar: 'اعرض الشريحة قبل أن تبدأ الساعة. شغّل المؤقّت عند أول كلمة (S). انظر إلى الحَكَم لا إلى الشاشة.', en: 'Show this slide before the clock starts. Start the timer on your first word (S). Look at the judges, not the screen.' },
      weak: null, qa: ['W5'] },
    { id: 'problem', t3: 20, t7: 35, title: { ar: 'المشكلة: دقائق قليلة', en: 'The problem: only minutes' },
      say3: { ar: 'الخطر لا يختار وقتًا: حريق ونحن نيام، غاز لا يُشَمّ، سيل في نفق، غبار، حرّ، أو إنسان يسقط وحيدًا. تقول أبحاث دولية إن أمامك أحيانًا دقيقة أو دقيقتين فقط للنجاة، وإن 49% من وفيات الحرائق السكنية في أمريكا تقع بين 11 مساءً و7 صباحًا.',
              en: 'Danger doesn\'t pick a time: a fire while we sleep, a gas leak we can\'t smell, water in an underpass, dust, heat, or someone who falls alone. International research says you may have only one or two minutes to escape, and 49% of US home-fire deaths happen between 11 p.m. and 7 a.m.' },
      more7: { ar: 'وفي قطر سُجّل 46.6% من السكان في سكن عمال جماعي (تعداد 2020). وفي حريق سكني بالخليج عام 2024، نحو الرابعة فجرًا، مات معظم الضحايا اختناقًا بالدخان وهم نيام، وكان باب السطح مقفلًا. هذه وقائع منشورة نذكرها باحترام ودون صور. ووصل الدفاع المدني في قطر عام 2017 خلال 7 إلى 10 دقائق؛ ونحن نتحدث عن الدقائق التي تسبق وصول أي فريق.',
              en: 'In Qatar, 46.6% of residents were counted in shared worker accommodation (Census 2020). In a 2024 Gulf residential fire, about 4 a.m., most victims died of smoke while asleep, and a rooftop door was locked. These are published facts, stated respectfully and without images. Civil Defence reached incidents in Qatar in 7 to 10 minutes in 2017; we are talking about the minutes before any crew arrives.' },
      act: { ar: 'اذكر المصدر مع كل رقم. لا تعرض صورًا لحوادث. الشريطان على الشريحة من مصدرين مختلفين: توضيح لا قياس واحد.', en: 'Name the source with every number. Show no images of incidents. The two bars come from different sources: an illustration, not one measurement.' },
      weak: { ar: 'الرقمان على الشريحة من مصدرين مختلفين (بحث دولي وتقرير قطري عام 2017): نعرضهما للتوضيح ولا نقول إنهما قياس واحد.', en: 'The two bars come from different sources (international research and a 2017 Qatar report): we show them to illustrate, not as one measurement.' },
      qa: ['W8'] },
    { id: 'gap', t3: 17, t7: 35, title: { ar: 'الفجوة: آخر مئة متر', en: 'The gap: the last 100 metres' },
      say3: { ar: 'في قطر 999 والدفاع المدني والإسعاف ونظام تحذير وطني. لكن رسالة واحدة للجميع لا تعرف مَن النائم، ومَن لا يقرأ العربية، وأيّ مخرج مقفل. هذه «آخر مئة متر». الصقور تكافح النار… والمنارة تُخرج الجميع.',
              en: 'Qatar has 999, Civil Defence, ambulances and a national warning system. But one message for everyone can\'t know who is asleep, who can\'t read Arabic, or which exit is locked. That is the last 100 metres. Falcons fight fire. The lighthouse gets everyone out.' },
      more7: { ar: 'ما لدينا موثّق: 999، والدفاع المدني ومعه مسيّرات إطفاء عُرضت في ميليبول 2024، وإسعاف مؤسسة حمد، ونظام تحذير يرسل رسائل بالعربية والإنجليزية، وإنذارات المباني التي تصل إلى غرفة العمليات، والرقم 992 للصمّ. كلها تعمل بعد أن يعرف أحدٌ بالخطر. ولا يخبر أيٌّ منها شخصًا نائمًا في الغرفة 203 أيّ درج يستخدم، ولا يوقظ الأصمّ، ولا يعدّ مَن خرج.',
              en: 'What exists is documented: 999, Civil Defence with the firefighting drones shown at Milipol 2024, the HMC ambulance service, a warning system that sends Arabic and English messages, building alarms that reach the operations room, and 992 for Deaf callers. All of them work once someone knows about the danger. None of them tells a sleeper in room 203 which stair to use, wakes a Deaf resident, or counts who got out.' },
      act: { ar: 'قل «نكمّل ولا نستبدل». لا تنتقد أي نظام قائم.', en: 'Say "we complete, we don\'t replace". Never criticise an existing system.' },
      weak: { ar: 'لا نقول إن هذه الأنظمة ناقصة؛ لكل منها عمل مختلف، ونحن نكمّل «آخر مئة متر» فقط.', en: 'We do not say these systems are lacking: each has a different job, and we only complete the last 100 metres.' },
      qa: ['W1', 'W2', 'W3', 'W5'] },
    { id: 'solution', t3: 12, t7: 30, title: { ar: 'الحل: ست خطوات ومسار واحد', en: 'The solution: six steps, one pipeline' },
      say3: { ar: 'منارة تتحقق أولًا، ثم توقظ كل شخص بلغته، وتدلّه على طريق آمن، وتعدّ مَن خرج، وتسلّم الجهات المختصة حزمة موثّقة. والشيفرة نفسها تعمل لستة أخطار.',
              en: 'MANARA proves first, then wakes each person in their language, shows a safe route, counts who got out, and hands the authorities a verified package. The same code serves six hazards.' },
      more7: { ar: 'أرصد: حسّاسات رخيصة تعمل ليلًا ونهارًا وإنذارها المحلي لا ينتظر أحدًا. أتحقق: مفتاحان مستقلان ثم إنسان. أُبلغ: لكل شخص لغته وصيغته وسلّم إيقاظ ليلي. أُرشد: طريق آمن لهذا الخطر بالذات. أعدّ: «أنا بخير» أو «أحتاج مساعدة». أُسلّم: حزمة موثّقة وأسرع وحدة استجابة، و999 يبقى المرسِل.',
              en: 'Sense: cheap sensors watch day and night and their local alarm never waits. Prove: two independent keys, then a human. Reach: each person\'s language and format, plus a night wake-up ladder. Guide: a route that is safe for this very hazard. Count: "I\'m safe" or "I need help". Hand off: a verified package and the fastest responder, with 999 staying the dispatcher.' },
      act: { ar: 'أشِر إلى الخطوات الست بالترتيب. اذكر «منصة واحدة لا ستة أجهزة».', en: 'Point to the six steps in order. Say "one platform, not six gadgets".' },
      weak: null, qa: ['W6'] },
    { id: 'proof', t3: 13, t7: 40, title: { ar: 'الدليل قبل الذعر', en: 'Proof before panic' },
      say3: { ar: 'قاعدتنا: الدليل قبل الذعر. مفتاحان مستقلان، ثم موافقة إنسان. وكاشف الصور عندنا رؤية حاسوبية بقواعد وليس ذكاءً اصطناعيًا؛ دقته على صور جديدة 66.7% فقط، ولهذا لا يقرّر وحده.',
              en: 'Proof before panic. Two independent keys, then a human. Our detector is rule-based computer vision, not AI; on new photos it is right only 66.7% of the time, so it never decides alone.' },
      more7: { ar: 'جرّبوا الشريحة: مفتاح واحد يعطي «اشتباه» فقط. كوب ساخن يخدع المفتاح الحراري، وفيديو حريق على هاتف يخدع الكاميرا، وإن خُدع المفتاحان معًا يبقى التنبيه العام بانتظار إنسان. أرقام الكاشف الصادقة: أصاب 12 من 18 صورة محجوزة؛ وجد صور النار الست كلها، لكنه أخطأ في 3 من 12 صورة بلا نار، ولم يجد دخان الصور الثلاث. وفي مختبر الأدلة يستطيع أيٌّ منكم أن يحاول خداعه.',
              en: 'Try the slide: one key gives only SUSPECT. A hot mug fools the heat key and a fire video on a phone fools the camera; if both keys are fooled together, the public alert still waits for a human. The detector\'s honest numbers: right on 12 of 18 held-out photos; it found all six fire photos but was wrong on 3 of 12 fire-free photos and missed the smoke in all three smoke photos. In the Evidence Lab any of you can try to fool it.' },
      act: { ar: 'اضغط مفتاحًا واحدًا ثم الثاني ثم «اعتماد» على الشريحة. لا تفتح مختبر الأدلة في المسار الصارم — لحظة حيّة واحدة فقط.', en: 'Press one key, then the second, then Approve on the slide. Do not open the Evidence Lab in the strict path — only ONE live moment.' },
      weak: { ar: 'قل أولًا: كاشف الصور دقته 66.7% على صور لم يرها، ولهذا لا يقرّر وحده أبدًا.', en: 'Say it first: the image detector is right only 66.7% on photos it has not seen, so it never decides alone.' },
      qa: ['P1', 'P2', 'P3', 'P4'] },
    { id: 'hazards', t3: 10, t7: 25, title: { ar: 'ستة أخطار، منصة واحدة', en: 'Six hazards, one platform' },
      say3: { ar: 'ستة أخطار على مسار واحد: حريق ودخان، غاز، سيول، غبار، حرّ، وشخص يحتاج مساعدة. اختاروا أنتم الكارثة.',
              en: 'Six hazards, one pipeline: fire and smoke, gas, flash flood, dust, heat, and someone who needs help. You choose the disaster.' },
      more7: { ar: 'لكل خطر مفتاحاه وإجراؤه الواقي: في الحريق نخرج من مخرج مفتوح فعلًا؛ في الغاز نبتعد عموديًا على الريح بلا مفاتيح ولا لهب؛ في السيول نصعد ونتجنب الأنفاق؛ في الغبار نحتمي في الداخل؛ في الحرّ نوقف العمل ونذهب إلى مكان مبرَّد؛ وفي الاستغاثة نُحضر المساعدة إلى الشخص. الحريق والغاز والحرّ والاستغاثة لها عرض بمستشعرات حقيقية على الطاولة بمواد آمنة، أما السيول والغبار فمحاكاة بحسّاس بسيط.',
              en: 'Each hazard has its own two keys and protective action: in a fire we leave by an exit that is really open; with gas we move crosswind, no switches, no flames; in a flood we go higher and avoid underpasses; in dust we shelter indoors; in heat we stop work and go to a cool shelter; and for an SOS we bring help to the person. Fire, gas, heat and SOS have a table demo with real sensors and safe stand-ins; flood and dust are simulated with a simple sensor.' },
      act: { ar: 'اطلب من الحَكَم أن يختار خطرًا ثم انتقل إلى اللحظة الحيّة. لا تشرح البطاقات الست كلها في المسار الصارم.', en: 'Ask a judge to choose a hazard, then move to the live moment. Do not explain all six cards in the strict path.' },
      weak: { ar: 'السيول والغبار محاكاة (SIM)، وبخار المعقّم عندنا بديل للغاز لا غاز حقيقي.', en: 'Flood and dust are simulated (SIM), and our "gas" is hand-sanitiser vapour, not real gas.' },
      qa: ['W8', 'P5', 'P8', 'P9'] },
    { id: 'live', t3: 55, t7: 90, live: true, title: { ar: 'اللحظة الحيّة: الحَكَم يقود', en: 'The live moment: the judge drives' },
      say3: null, more7: { ar: 'جرّبوا خطرًا آخر: الغاز (اتجاه الرياح يغيّر الاتجاه الأسلم)، أو غيّروا اتجاه الرياح، أو أقفلوا باب السطح، أو اضغطوا «أحتاج مساعدة» لأبي سالم. وسترون أن الرسالة تتغير حسب الخطر والشخص والخيار الأسلم.',
              en: 'Try another hazard: gas (the wind direction changes the safest direction), change the wind, lock the roof door, or press "I need help" for Abu Salem. You will see that the message changes with the hazard, the person and the safest option.' },
      act: { ar: 'افتح غرفة العمليات في تبويب جاهز مسبقًا (نفس الرابط). سلّم الفأرة للحَكَم. إن تعطّل شيء فانتقل إلى «إذا تعطّل العرض» في تبويب النص.', en: 'Open Mission Control in a pre-opened tab (same link). Hand the mouse to the judge. If anything fails, use "If the demo fails" in the Script tab.' },
      weak: { ar: 'قبل أن يبدأ الحَكَم: هذه محاكاة — اللهب ممنوع هنا — وكل رقم عليه SIM.', en: 'Before the judge starts: this is a simulation — flames are banned here — and every number is marked SIM.' },
      qa: ['P3', 'D1', 'D2', 'H4'] },
    { id: 'people', t3: 0, t7: 35, title: { ar: 'كل إنسان بلغته وصيغته', en: 'Every person, their language and format' },
      say3: null, more7: { ar: 'أربعة أشخاص في المبنى الافتراضي: رافي عامل يقرأ المالايالامية فتصله رسالة بلغته (مسودة) مع بطاقة مصورة؛ هدى ساكنة صمّاء فتصلها اهتزازات قوية ونص ورموز، والوميض اختياري مع تحذير؛ أبو سالم كبير سن على كرسي متحرك فيُوجَّه إلى شرفة الإيواء ويُبلَغ الدفاع المدني بمكانه؛ ولينا طفلة تتبع معلمتها وتُحصى على جهاز المعلمة. وسلّم الإيقاظ يصعد حتى يؤكد الشخص: صوت واهتزاز، ثم أعلى مع ضوء بعد 30 ثانية، ثم الحارس يطرق الأبواب بعد 60 ثانية، ثم قائمة للدفاع المدني بعد 90 ثانية. و92.7% من السكان غير قطريين، فالعربية والإنجليزية وحدهما لا تصلان إلى الجميع.',
              en: 'Four people in the virtual building: Ravi, a worker who reads Malayalam, gets a message in his language (draft) with a picture card; Huda, a Deaf resident, gets strong vibration, text and pictograms, with the strobe optional and a warning; Abu Salem, an older man in a wheelchair, is sent to the refuge balcony and Civil Defence is told where he is; and Lina, a child, follows her teacher and is counted on the teacher\'s tablet. The wake-up ladder climbs until the person confirms: sound and vibration, then louder with light at 30 seconds, then the guard knocks at 60 seconds, then a list goes to Civil Defence at 90 seconds. And 92.7% of residents are non-Qatari, so Arabic and English alone do not reach everyone.' },
      act: { ar: 'في المسار الصارم تُرى هذه الهواتف أثناء اللحظة الحيّة؛ تخطَّ الشريحة. في الممتد: أشِر إلى كل بطاقة.', en: 'In the strict path these phones are seen during the live moment; skip the slide. In the extended path: point to each card.' },
      weak: { ar: 'اللغات الست مسودات لم يراجعها متحدثون أصليون بعد.', en: 'The six community languages are drafts that native speakers have not reviewed yet.' },
      qa: ['H5', 'H6', 'H4', 'H1'] },
    { id: 'dispatch', t3: 0, t7: 40, title: { ar: 'الأسرع وصولًا لا الأقرب', en: 'Fastest, not nearest' },
      say3: null, more7: { ar: 'بعد اعتماد الحادث تقترح منارة أيّ وحدة تذهب: إطفاء وإسعاف وشرطة، مع المستشفى المناسب للمصاب. المعيار: مَن يصل أولًا بحسب الازدحام لا الأقرب على الخريطة. نحسب زمن كل طريق بالطول مقسومًا على السرعة والازدحام، ونحذف الطرق المغلقة، ونتجاوز الوحدات المشغولة، ونختار أقل زمن وصول، ونعرض صاحب المركز الثاني والسبب. حرّكوا الساعة إلى السابعة صباحًا: تصبح محطة «ب» أبعد بنحو كيلومتر لكنها أسرع. وإن أُغلق طريق أو ازدحم أثناء الطريق نعيد الحساب كل ثانية وقد نغيّر الوحدة. كل هذا محاكاة بمرور افتراضي، و999 يبقى هو المرسِل.',
              en: 'Once an incident is approved, MANARA recommends which unit goes: fire, ambulance and police, plus the right hospital for the patient. The rule: whoever gets there first given traffic, not whoever is nearest on the map. We compute each road\'s time as length divided by speed and traffic, remove closed roads, skip busy units, pick the smallest ETA, and show the runner-up and the reason. Move the clock to 07:00: Station B becomes about a kilometre farther but faster. If a road closes or jams on the way we recompute every second and may change the unit. All of it is simulated with fictional traffic, and 999 stays the dispatcher.' },
      act: { ar: 'حرّك شريط الساعة ثم انقر طريقًا لتزحمه أو تغلقه وراقب تغيّر الاختيار.', en: 'Move the time slider, then click a road to jam or close it and watch the choice change.' },
      weak: { ar: 'المرور والمحطات والمستشفيات افتراضية (SIM)؛ والواقع يحتاج مزوّد مرور حيًّا وبيانات مركبات الجهة، و999 هو المرسِل.', en: 'Traffic, stations and hospitals are fictional (SIM); the real thing needs a live traffic provider and the authority\'s vehicle data, and 999 is the dispatcher.' },
      qa: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] },
    { id: 'evidence', t3: 25, t7: 40, title: { ar: 'ما قِسناه وما لم نقِسه', en: 'What we measured, and what we haven\'t' },
      say3: { ar: 'ما قِسناه فعلًا: دقة الكاشف 66.7% على صور جديدة. وفي المحاكاة وصل 90% من السكان إلى الأمان خلال 317 ثانية مع منارة مقابل 626 مع الإنذار العادي — وهذا SIM: فحص للآلية وليس إثباتًا. وما لم نفعله بعد: حرائق حقيقية، واختبار الفهم مع الناس، ومراجعة اللغات. نقولها صراحةً.',
              en: 'What we actually measured: the detector is right 66.7% of the time on new photos. In the simulation, 90% of residents reached safety in 317 seconds with MANARA versus 626 with an ordinary alarm — that is SIM: a mechanism check, not proof. What we haven\'t done yet: real fires, the comprehension test with people, and native-speaker review. We say it openly.' },
      more7: { ar: 'ما لم نفعله بعد: لم نجرّب على حرائق حقيقية — اللهب ممنوع وخطير — ولم نُجرِ اختبار الفهم (يحتاج موافقة أخلاقيات المدرسة)، ولم تُراجَع اللغات من متحدثين أصليين، ولم نقِس زمن الاستجابة على اللوحة بعد. جرّبوا سيناريو وبذرة أخرى: ستجدون حالات يظهر فيها فرق كبير (الحريق الليلي والغاز) وحالات يصغر فيها الفرق أو يتغير باختلاف البذرة (الغبار والحرّ). ونذكر مقايضة صريحة: صفّارة المبنى تُسمع بعد 14 ثانية في العالمين، ورسالة منارة الشخصية الأولى تصل بعد 39 ثانية لأنها تتحقق أولًا.',
              en: 'What we haven\'t done: we have not tested on real fires — flames are banned and dangerous — we have not run the comprehension test (it needs school ethics approval), native speakers have not reviewed the languages, and we have not measured response latency on the board yet. Try another scenario and seed: you will find cases with a big gap (the night fire and gas) and cases where the gap is small or changes with the seed (dust, heat). And we state one honest trade-off: the building siren is heard after 14 seconds in both worlds, while MANARA\'s first personal message arrives after 39 seconds because it verifies first.' },
      act: { ar: 'قل أولًا إن كل رقم محاكى موسوم SIM. لا تخفِ الأرقام المحرجة؛ هذا ما يكسب ثقة الحَكَم.', en: 'Say first that every simulated number is marked SIM. Do not hide the awkward numbers; that is what earns the judges\' trust.' },
      weak: { ar: 'قل أولًا: المحاكاة فحص للآلية لا برهان أثر، ولم نختبر على حرائق حقيقية ولا على أشخاص.', en: 'Say it first: the simulation is a mechanism check, not proof of impact, and we have not tested on real fires or on people.' },
      qa: ['P2', 'P4', 'P7', 'H3', 'B9'] },
    { id: 'build', t3: 12, t7: 25, title: { ar: 'البناء والتكامل', en: 'Build and plug-in' },
      say3: { ar: 'نموذج من قطع بسيطة، يعمل دون إنترنت، ويُصدّر تنبيهًا بصيغة CAP. نتصل بأنظمة الدولة ولا نستبدلها. الخطوة التالية: تجربة في مبنى واحد.',
              en: 'A prototype from simple parts that works offline and exports a CAP alert. We plug into national systems; we don\'t replace them. Next step: a pilot in one building.' },
      more7: { ar: 'الحارس لوحة ESP32 وحسّاسات حرارة ودخان وغاز ورطوبة وماء وزر استغاثة، وإنذاره المحلي يعمل بلا شبكة. أغلى قطعة هي الكاميرا الحرارية بـ 74.95 دولارًا (Adafruit). نُنتج تنبيهًا قياسيًا بصيغة CAP بحالة «تمرين» لتحمله أنظمة الدولة، ولا نقلّد نغمة الإنذار الوطني. المسيّرة مفهوم لجهة مرخَّصة مثل الدفاع المدني، والحارس يعمل بدونها. وأي ربط حقيقي يحتاج اتفاقًا مع الجهة.',
              en: 'The sentinel is an ESP32 board with heat, smoke, gas, humidity and water sensors and an SOS button, and its local alarm needs no network. The most expensive part is the thermal camera at US$ 74.95 (Adafruit). We produce a standard CAP alert with status "Exercise" that national systems could carry, and we never copy the national alert tone. The drone is a concept for a licensed agency such as Civil Defence, and the sentinel works without it. Any real link needs an agreement with the authority.' },
      act: { ar: 'اذكر صفحة البناء لمن يريد القطع والأسعار. لا تذكر مجموع تكلفة لم تحسبه.', en: 'Point to the Build page for parts and prices. Do not quote a total you have not computed.' },
      weak: { ar: 'المسيّرة مفهوم فقط: لم نُطِر أي طائرة، والقانون 10 لسنة 2026 يشترط الترخيص.', en: 'The drone is a concept only: we flew nothing, and Law No. 10 of 2026 requires licences.' },
      qa: ['R1', 'R2', 'R3', 'B3', 'B6', 'B8'] },
    { id: 'close', t3: 8, t7: 15, title: { ar: 'الخطوة التالية والشكر', en: 'Next steps and thanks' },
      say3: { ar: 'لا نائمَ يُنسى، ولا أحدَ يُترك خلفنا. شكرًا لكم — يسعدنا سؤالكم.', en: 'No one left asleep. No one left behind. Thank you — we are glad to take your questions.' },
      more7: { ar: 'الخطوات: مراجعة اللغات من متحدثين أصليين، ثم قياس الحسّاسات وجدول زمن الاستجابة، ثم اختبار الفهم بموافقة أخلاقية، ثم تمرين في مبنى واحد مع حارسه ومراجعة الدفاع المدني. ونطلب منكم: توجيهًا وتصريحًا لتمرين آمن، ومراجعين للغات، وإرشادًا لموافقة الأخلاقيات. ونحترم عمل الدفاع المدني وفريق آيسف 2025: منارة تعمل حولهم لا ضدهم.',
              en: 'The steps: native-speaker review of the languages, then sensor measurements and a latency table, then the comprehension test with ethics approval, then a drill in one building with its guard and a Civil Defence review. We ask you for guidance and permission for a safe drill, reviewers for the languages, and advice on getting ethics approval. We respect Civil Defence and the ISEF 2025 team: MANARA works around them, not against them.' },
      act: { ar: 'ابتسم وانتظر الأسئلة. إن سُئلت عن نقطة ضعف فابدأ بالجملة الأولى من تبويب «أسئلة الحَكَم».', en: 'Smile and wait for questions. If asked about a weak spot, start with the first sentence from the Judge Q&A tab.' },
      weak: null, qa: ['B9', 'B10'] }
  ];

  // The ONE live moment (slide 7), second by second (offsets inside the 55-second block)
  var LIVE = [
    { t0: 0, t1: 10, title: { ar: 'اختر الكارثة', en: 'Pick the disaster' },
      tip: { ar: 'الحريق الليلي (04:00) جاهز؛ ويمكن اختيار الغاز أو السيول أو الغبار أو الحرّ أو الاستغاثة.', en: 'The night fire (04:00) is ready; you can pick gas, flood, dust, heat or SOS instead.' },
      say: { ar: 'هذه غرفة العمليات — محاكاة، واللهب ممنوع هنا. اختر خطرًا؛ الحريق الليلي جاهز. اضغط «ابدأ».', en: 'This is Mission Control — a simulation; flames are banned here. Pick a danger; the night fire is ready. Press Start.' },
      act: { ar: 'سلّم الفأرة للحَكَم، وأشِر إلى قائمة السيناريوهات.', en: 'Hand the mouse to the judge and point at the scenario list.' } },
    { t0: 10, t1: 22, title: { ar: 'اعتمِد كمشغّل', en: 'Approve as the operator' },
      tip: { ar: 'مفتاحان مستقلان اتفقا؛ المفتاح الثالث إنسان — أنت. تصل رسائل شخصية إلى أربعة هواتف.', en: 'Two independent keys agreed; the third key is a human — you. Personal messages reach four phones.' },
      say: { ar: 'الكاشف رأى اشتباهًا ثم تأكد بمفتاحين. الآن أنت المشغّل: اضغط «اعتماد». كل هاتف يستلم رسالة تناسب صاحبه: بلغته وبالصيغة التي يحتاجها.', en: 'The detector saw a suspicion, then two keys agreed. Now you are the operator: press Approve. Each phone gets a message that fits its owner: in their language and the format they need.' },
      act: { ar: 'أشِر إلى جدار الهواتف: رافي، هدى، أبو سالم، لينا.', en: 'Point at the phone wall: Ravi, Huda, Abu Salem, Lina.' } },
    { t0: 22, t1: 34, title: { ar: 'اقفل الدرج «أ»', en: 'Lock Stair A' },
      tip: { ar: 'يُعاد حساب الطرق خلال ثانية، ولا تصل رسالة جديدة إلا لمن تغيّر طريقه.', en: 'Routes are recomputed within a second, and only people whose route changed get a new message.' },
      say: { ar: 'اقفل الدرج «أ». خلال ثانية يُعاد حساب الطرق، ولا تصل رسالة جديدة إلا لمن تغيّر طريقه.', en: 'Lock Stair A. Within a second the routes are recomputed, and only the people whose route changed get a new message.' },
      act: { ar: 'اطلب من الحَكَم أن يفتح لوحة «ضوابط الحَكَم» ويقفل المخرج.', en: 'Ask the judge to open "Judge controls" and lock the exit.' } },
    { t0: 34, t1: 45, title: { ar: 'اضغط «أنا بخير»', en: 'Tap "I\'m safe"' },
      tip: { ar: 'يتحرك عدّاد الجميع، وتتصدّر الغرف الناقصة بطاقة التسليم.', en: 'The headcount moves, and missing rooms go to the top of the hand-off card.' },
      say: { ar: 'اضغط «أنا بخير» على أحد الهواتف: يتحرك العدّاد، وتتصدّر الغرف الناقصة بطاقة التسليم.', en: 'Tap "I\'m safe" on one phone: the count moves, and missing rooms go to the top of the hand-off card.' },
      act: { ar: 'أشِر إلى عدّاد الجميع والغرف غير المحسوبة.', en: 'Point at the headcount and the unaccounted rooms.' } },
    { t0: 45, t1: 55, title: { ar: 'شاهد أسرع وحدة استجابة', en: 'See the fastest responder' },
      tip: { ar: 'إطفاء وإسعاف وشرطة مع سبب الاختيار — الأسرع بحسب الازدحام لا الأقرب. كله محاكاة.', en: 'Fire, ambulance and police with the reason — fastest given traffic, not nearest. All simulated.' },
      say: { ar: 'وهنا أسرع وحدة استجابة بحسب الازدحام — لا الأقرب مسافة — مع سبب الاختيار. كلها محاكاة، و999 يبقى هو المرسِل.', en: 'And here is the fastest responder given traffic — not the nearest — with the reason. All simulated; 999 stays the dispatcher.' },
      act: { ar: 'افتح تبويب «الاستجابة». ثم عُد إلى الشرائح (شريحة 10).', en: 'Open the "Dispatch" tab. Then return to the slides (slide 10).' } }
  ];
  SL.forEach(function (s) { if (s.live) s.say3 = { ar: LIVE.map(function (x) { return x.say.ar; }).join(' '), en: LIVE.map(function (x) { return x.say.en; }).join(' ') }; });

  // "If the demo fails": a short, honest script (judges respect an explained failure)
  var FB_RULE = {
    ar: 'القاعدة: الحَكَم يحترم الفشل المشروح. قل في جملة واحدة ما حدث، وماذا كان النظام سيفعل لو كان حقيقيًا (الإنذار المحلي لا ينتظر شبكة ولا حاسوبًا)، ثم انتقل إلى النسخة الاحتياطية. لا تعتذر أكثر من مرة، ولا تلُم أحدًا، ولا تعِد البدء: احفظ الساعة. وإن خسرت أكثر من 30 ثانية فانتقل مباشرة إلى شريحة الأدلة.',
    en: 'The rule: judges respect an explained failure. In one sentence say what happened and what the system would do if it were real (the local alarm never waits for a network or a computer), then move to the backup. Apologise once at most, blame no one, and do not restart: keep the clock. If you lose more than 30 seconds, jump straight to the Evidence slide.' };
  var FB = [
    { n: 1, title: { ar: 'الصفحة بطيئة أو تجمّدت', en: 'The page is slow or frozen' },
      say: { ar: 'الصفحة تأخرت لحظة — وهذا مثال جيد: الإنذار المحلي في المبنى لا ينتظر الحاسوب ولا الشبكة. سأنتقل إلى النسخة الاحتياطية.', en: 'The page stalled for a moment — a good example: the local alarm in the building never waits for a computer or a network. I\'ll switch to the backup.' },
      act: { ar: 'انتقل إلى التبويب الثاني المفتوح مسبقًا بالرابط نفسه. وإن لم يكن مفتوحًا فأعد تحميل الصفحة: الرابط يستعيد السيناريو (`#scenario=fire-night&seed=1`).', en: 'Switch to the second pre-opened tab with the same link. If there is none, reload: the link restores the scenario (`#scenario=fire-night&seed=1`).' } },
    { n: 2, title: { ar: 'الهواتف لا تتحدث مع الشاشة', en: 'The phones don\'t talk to the screen' },
      say: { ar: 'الهواتف لا تتلقى الرسائل هنا — يحدث هذا إذا منع المتصفح الرسائل بين النوافذ. هذا بالضبط ما سنختبره في التجربة الميدانية. هذه الصفحة الاحتياطية تُظهر الخطوات نفسها.', en: 'The phones are not receiving messages — this happens when the browser blocks messages between windows. That is exactly what a field pilot would test. This backup page shows the same steps.' },
      act: { ar: 'افتح جدار الهواتف في نافذة واحدة (هواتف السكان)، أو ارجع إلى الشريحة 7 واستعمل مقطع المبنى (اقفل الدرج «أ» ثم «أنا بخير»).', en: 'Open the phone wall in a single window (Resident phones), or go back to slide 7 and use the building section (Lock Stair A, then "I\'m safe").' } },
    { n: 3, title: { ar: 'غرفة العمليات لا تفتح', en: 'Mission Control will not open' },
      say: { ar: 'تعذّر فتح العرض الحي. سأريكم تسجيلًا سجّلناه بالمحاكاة نفسها، وأشرح ما يحدث خطوة بخطوة.', en: 'The live view won\'t open. I\'ll show a recording we made of the same simulation and walk you through each step.' },
      act: { ar: 'شغّل الفيديو الاحتياطي (60–90 ثانية) المحفوظ على سطح المكتب وعلى هاتفك. ثم اشرح الخطوات الخمس من قائمة اللحظة الحيّة وأنت تشير إليها.', en: 'Play the fallback video (60–90 seconds) saved on the desktop and on your phone. Then walk through the five steps of the live moment, pointing at each.' } },
    { n: 4, title: { ar: 'لا شيء يعمل (حاسوب أو كهرباء)', en: 'Nothing works (computer or power)' },
      say: { ar: 'حتى لو تعطّل كل شيء — وهذا ما يحدث في الأزمات — فالفكرة تقوم على إنذار محلي لا يعتمد على شيء. اسمحوا لي أن أشرحها بالكلام وبهذه الورقة.', en: 'Even if everything fails — which is what happens in a crisis — the idea rests on a local alarm that depends on nothing. Let me explain it by speaking, with this sheet.' },
      act: { ar: 'اقرأ النص من الورق المطبوع (تبويب النص → طباعة)، وسلّم الحَكَم نسخة أسئلة الحَكَم المطبوعة، واعرض اللوحة المطبوعة.', en: 'Read the script from paper (Script tab → Print), hand the judge the printed Judge Q&A, and point to the printed display board.' } }
  ];

  var GAP_HAVE = [
    { ar: '999 — وزارة الداخلية', en: '999 — Ministry of Interior' },
    { ar: 'الدفاع المدني، ومعه مسيّرات إطفاء عُرضت في ميليبول 2024', en: 'Civil Defence, with firefighting drones shown at Milipol 2024', src: 'QNA 2024' },
    { ar: 'إسعاف مؤسسة حمد الطبية', en: 'HMC Ambulance Service', src: 'QNA 2023' },
    { ar: 'نظام التحذير العام: رسائل بالعربية والإنجليزية إلى الهواتف', en: 'Public Warning System: Arabic and English messages to phones', src: 'The Peninsula 2023' },
    { ar: 'إنذارات المباني تصل إلى غرفة العمليات (CAMS)', en: 'Building alarms reach the operations room (CAMS)', src: 'Gulf Times' },
    { ar: 'الرقم 992 للصمّ: فيديو ورسائل قصيرة', en: '992 for Deaf callers: video and short messages', src: 'Gulf Times' }
  ];
  var GAP_UNKNOWN = [
    { i: 'users', ar: 'مَن النائم الآن في الغرفة 203؟', en: 'Who is asleep in room 203 right now?' },
    { i: 'globe', ar: 'مَن لا يقرأ العربية ولا الإنجليزية؟', en: 'Who reads neither Arabic nor English?' },
    { i: 'alert', ar: 'أيّ مخرج مقفل أو مملوء بالدخان الآن؟', en: 'Which exit is locked or full of smoke right now?' },
    { i: 'target', ar: 'مَن لا يزال بالداخل؟', en: 'Who is still inside?' }
  ];
  var PIPE = [
    { i: 'radar', c: '--info', v: ['أرصد', 'Sense'], d: { ar: 'حسّاسات رخيصة تراقب ليلًا ونهارًا', en: 'Cheap sensors watch day and night' } },
    { i: 'shield', c: '--accent', v: ['أتحقق', 'Prove'], d: { ar: 'مفتاحان مستقلان، ثم موافقة إنسان', en: 'Two independent keys, then a human' } },
    { i: 'bell', c: '--brand', v: ['أُبلغ', 'Reach'], d: { ar: 'لكل شخص لغته وصيغته، وسلّم إيقاظ ليلي', en: 'Each person\'s language and format, plus a night wake-up ladder' } },
    { i: 'route', c: '--warn', v: ['أُرشد', 'Guide'], d: { ar: 'طريق آمن لهذا الخطر، يُعاد حسابه فورًا', en: 'A route that is safe for this hazard, recomputed instantly' } },
    { i: 'users', c: '--safe', v: ['أعُدّ', 'Count'], d: { ar: '«أنا بخير» أو «أحتاج مساعدة» مقابل السجلّ', en: '"I\'m safe" or "I need help", against the register' } },
    { i: 'download', c: '--danger', v: ['أُسلّم', 'Hand off'], d: { ar: 'حزمة موثّقة + أسرع وحدة؛ و999 هو المرسِل', en: 'A verified package + the fastest unit; 999 stays the dispatcher' } }
  ];
  var HZ = [
    { id: 'fire', ar: 'حريق ودخان', en: 'Fire & smoke', tag: 'live',
      keys: { ar: 'حرارة + كاميرا/دخان', en: 'heat + camera/smoke' },
      act: { ar: 'اخرج من مخرج مفتوح فعلًا بعيدًا عن الدخان؛ والجيران مع الريح يبقون في الداخل.', en: 'Leave by an exit that is really open, away from smoke; downwind neighbours stay in.' },
      fact: { ar: 'سكن العمال ملزَم بمكشفات دخان ونظام إنذار وخطة إخلاء — قرار وزاري 18/2014.', en: 'Workers\' accommodation must have smoke detectors, an alarm and an evacuation plan — Ministerial Decision 18/2014.' } },
    { id: 'gas', ar: 'تسرّب غاز', en: 'Gas leak', tag: 'live',
      keys: { ar: 'قراءتان للغاز + اتجاه صاعد', en: 'two gas readings + rising trend' },
      act: { ar: 'ابتعد عموديًا على الريح؛ لا مفاتيح ولا لهب.', en: 'Move crosswind; no switches, no flames.' },
      fact: { ar: 'الدفاع المدني: افتح الأبواب والنوافذ، ولا تشغّل الشفّاط أو الإضاءة.', en: 'Civil Defence: open doors and windows; don\'t switch on the exhaust fan or lights.' } },
    { id: 'flood', ar: 'سيول وأمطار', en: 'Flash flood', tag: 'sim',
      keys: { ar: 'مستوى الماء + تحذير الأرصاد', en: 'water level + weather warning' },
      act: { ar: 'اصعد إلى مكان أعلى؛ تجنّب الأنفاق؛ لا تعبر الماء الجاري.', en: 'Go higher; avoid underpasses; never cross moving water.' },
      fact: { ar: '20–21 أكتوبر 2018: 84 ملم في أبو هامور، الأعلى لشهر أكتوبر في مناطق الدوحة (هيئة الطيران المدني).', en: '20–21 Oct 2018: 84 mm in Abu Hamour, the highest October amount recorded in Doha areas (QCAA).' } },
    { id: 'dust', ar: 'عاصفة غبارية', en: 'Dust storm', tag: 'sim',
      keys: { ar: 'غبار PM10 + الرؤية/الأرصاد', en: 'PM10 + visibility/weather' },
      act: { ar: 'ادخل مكانًا مغلقًا وأغلق النوافذ وضع قناعًا؛ المصابون بالربو أولًا.', en: 'Go indoors, close windows, wear a mask; people with asthma first.' },
      fact: { ar: 'أبريل 2015: تجاوز PM10 في الدوحة 7,000 ميكروغرام/م³ (فونتوكيس وآخرون، 2020).', en: 'April 2015: PM10 above 7,000 µg/m³ in Doha (Fountoukis et al., 2020).' } },
    { id: 'heat', ar: 'إجهاد حراري', en: 'Extreme heat', tag: 'live',
      keys: { ar: 'تقدير WBGT + قاعدة ساعات العمل', en: 'WBGT estimate + work-hours rule' },
      act: { ar: 'أوقف العمل واذهب إلى مكان مبرَّد واشرب ماء.', en: 'Stop work, go to a cool shelter, drink water.' },
      fact: { ar: 'منع العمل في الهواء الطلق 10:00–15:30 (1 يونيو–15 سبتمبر)، ويُوقَف كل عمل إذا تجاوز WBGT ‏32.1 °م — وزارة العمل / ILO.', en: 'Outdoor work banned 10:00–15:30 (1 Jun–15 Sep); all work stops if WBGT exceeds 32.1 °C — Ministry of Labour / ILO.' } },
    { id: 'sos', ar: 'شخص يحتاج مساعدة', en: 'Someone needs help', tag: 'live',
      keys: { ar: 'زر استغاثة أو سقوط + عدم الرد', en: 'SOS button or fall + no answer' },
      act: { ar: 'نُحضر المساعدة إلى الشخص: أقرب متطوع مدرَّب + الإسعاف (999).', en: 'Bring help to the person: nearest trained volunteer + ambulance (999).' },
      fact: { ar: '64.0% من 1,238 حالة توقف قلب في السجل الوطني وقعت في المنزل (Resuscitation Plus 2025).', en: '64.0% of 1,238 cardiac arrests in the national registry happened at home (Resuscitation Plus 2025).' } }
  ];
  var PERSONAS = [
    { id: 'ravi', c: '--danger', ar: 'رافي', en: 'Ravi', need: { ar: 'عامل · غرفة 203 · يقرأ المالايالامية', en: 'Worker · room 203 · reads Malayalam' },
      badge: { ar: 'ML · مسودة', en: 'ML · draft' }, pic: 'bell',
      do: { ar: 'نائم: **سلّم الإيقاظ** يصعد حتى يؤكد. رسالة بلغته (مسودة) مع بطاقة مصورة.', en: 'Asleep: the **wake-up ladder** climbs until he confirms. A message in his language (draft) with a picture card.' } },
    { id: 'huda', c: '--info', ar: 'هدى', en: 'Huda', need: { ar: 'صمّاء · غرفة 105', en: 'Deaf · room 105' },
      badge: { ar: 'اهتزاز + نص', en: 'Vibrate + text' }, pic: 'phone',
      do: { ar: 'اهتزاز قوي + نص + رموز. **الوميض اختياري** مع تحذير من الحساسية الضوئية.', en: 'Strong vibration + text + pictograms. The **strobe is opt-in** with a photosensitivity warning.' } },
    { id: 'abu', c: '--warn', ar: 'أبو سالم', en: 'Abu Salem', need: { ar: 'كرسي متحرك · غرفة 302', en: 'Wheelchair · room 302' },
      badge: { ar: 'بلا درج', en: 'No stairs' }, pic: 'access',
      do: { ar: 'بلا درج: **شرفة الإيواء**، ويُبلَغ الدفاع المدني بمكانه.', en: 'No stairs: the **refuge balcony**, and Civil Defence is told where he is.' } },
    { id: 'lina', c: '--safe', ar: 'لينا', en: 'Lina', need: { ar: 'طفلة (9) · الصف 5ب', en: 'Child (9) · class 5B' },
      badge: { ar: 'بطاقة مصورة', en: 'Picture card' }, pic: 'star',
      do: { ar: 'بطاقة مصورة: **اتبعي معلمتك**؛ وتُحصى على جهاز المعلمة.', en: 'A picture card: **follow your teacher**; counted on the teacher\'s tablet.' } }
  ];
  var LADDER = [
    { t: 'T+0', ar: 'صوت واهتزاز (ووميض لمن فعّله)', en: 'Sound + vibration (strobe if opted in)' },
    { t: '+30 s', ar: 'أعلى صوتًا مع ضوء', en: 'Louder, with light' },
    { t: '+60 s', ar: 'الحارس يستلم قائمة أولويات ويطرق الأبواب', en: 'The guard gets a priority list and knocks on doors' },
    { t: '+90 s', ar: 'الدفاع المدني يستلم القائمة', en: 'Civil Defence gets the list' }
  ];
  var LANGS = [
    { t: 'العربية', k: 'full' }, { t: 'English', k: 'full' }, { t: 'മലയാളം', k: 'draft' }, { t: 'नेपाली', k: 'draft' },
    { t: 'বাংলা', k: 'draft' }, { t: 'اردو', k: 'draft' }, { t: 'Tagalog', k: 'draft' }, { t: 'हिन्दी', k: 'draft' }
  ];
  var SENSORS = [
    { i: 'thermo', t: 'MLX90640', s: { ar: 'كاميرا حرارية 32×24', en: '32×24 thermal camera' } },
    { i: 'smoke', t: 'MQ-2', s: { ar: 'دخان / غاز مسال / بخار', en: 'smoke / LPG / vapour' } },
    { i: 'thermo', t: 'SHT31', s: { ar: 'حرارة ورطوبة', en: 'temperature + humidity' } },
    { i: 'water', t: 'HC-SR04', s: { ar: 'مستوى الماء', en: 'water level' } },
    { i: 'dust', t: 'PMS5003', s: { ar: 'غبار (اختياري)', en: 'dust (optional)' } },
    { i: 'alert', t: 'SOS + MPU6050', s: { ar: 'زر استغاثة وسقوط', en: 'SOS button + fall' } }
  ];
  var OUTPUTS = [
    { i: 'buzzer', t: { ar: 'صفّارة محلية', en: 'Local buzzer' } },
    { i: 'ring', t: { ar: 'حلقة ضوء', en: 'LED ring' } },
    { i: 'arrows', t: { ar: 'أسهم المخارج', en: 'Exit arrows' } }
  ];
  var PLUG = [
    { from: [{ ar: 'منارة', en: 'MANARA' }, { ar: 'حزمة موثّقة (ماذا، أين، المخارج، مَن بلا حساب)', en: 'verified package (what, where, exits, who is unaccounted)' }],
      to: [{ ar: '999 — غرفة عمليات الداخلية', en: '999 — Interior control room' }, { ar: 'يبقى هو المرسِل', en: 'stays the dispatcher' }] },
    { from: [{ ar: 'منارة', en: 'MANARA' }, { ar: 'توصية بأسرع وحدة + المستشفى', en: 'fastest-unit recommendation + hospital' }],
      to: [{ ar: 'الدفاع المدني · إسعاف حمد · الشرطة', en: 'Civil Defence · HMC ambulance · police' }, { ar: 'هم يقرّرون وينفّذون', en: 'they decide and dispatch' }] },
    { from: [{ ar: 'منارة', en: 'MANARA' }, { ar: 'تنبيه CAP 1.2 بحالة «تمرين»', en: 'CAP 1.2 alert, status "Exercise"' }],
      to: [{ ar: 'نظام التحذير العام', en: 'Public Warning System' }, { ar: 'يمكنه حمله؛ ولا نقلّد نغمته', en: 'could carry it; we never copy its sound' }] },
    { from: [{ ar: 'إدارة الأرصاد القطرية', en: 'Qatar Meteorology Dept.' }, { ar: 'تحذير السيول والغبار', en: 'flood and dust warning' }],
      to: [{ ar: 'منارة', en: 'MANARA' }, { ar: 'المفتاح الثاني (يدخله المشغّل)', en: 'the second key (entered by the operator)' }] },
    { from: [{ ar: 'وزارة العمل', en: 'Ministry of Labour' }, { ar: 'منع الظهيرة وحدّ WBGT ‏32.1', en: 'midday ban + WBGT 32.1 limit' }],
      to: [{ ar: 'منارة', en: 'MANARA' }, { ar: 'تعرض القاعدة وتنبّه للراحة؛ لا تُنفّذها', en: 'shows the rule and nudges rest; does not enforce' }] }
  ];
  var ROAD = [
    { h: { ar: 'الآن', en: 'Now' }, items: [{ ar: 'نموذج أولي يعمل ومحاكاة موسومة', en: 'A working prototype and a labelled simulation' }, { ar: 'مختبر أدلة وستة أخطار', en: 'An evidence lab and six hazards' }] },
    { h: { ar: 'التالي', en: 'Next' }, items: [{ ar: 'مراجعة اللغات من متحدثين أصليين', en: 'Native-speaker review of the languages' }, { ar: 'معايرة الحسّاسات وجدول الاستجابة', en: 'Sensor calibration and a latency table' }, { ar: 'اختبار الفهم بموافقة أخلاقية', en: 'Comprehension test with ethics approval' }] },
    { h: { ar: 'بعد ذلك', en: 'Then' }, items: [{ ar: 'تمرين في مبنى واحد مع حارسه', en: 'A drill in one building with its guard' }, { ar: 'مراجعة الدفاع المدني', en: 'A Civil Defence review' }] },
    { h: { ar: 'لاحقًا', en: 'Later' }, items: [{ ar: 'ربط عبر اتفاقات مع الجهات (CAP/CAD)', en: 'Links through agreements with the authorities (CAP/CAD)' }, { ar: 'المسيّرة عبر جهة مرخَّصة فقط', en: 'The drone only through a licensed agency' }] }
  ];
  var ASK = [
    { ar: 'توجيه من الدفاع المدني وتصريح بتمرين آمن في مبنى واحد', en: 'Guidance from Civil Defence and permission for a safe drill in one building' },
    { ar: 'مراجعون من متحدثي لغات الجاليات ومن الصمّ والمكفوفين', en: 'Reviewers who speak the community languages, and Deaf and blind reviewers' },
    { ar: 'إرشاد لنيل موافقة أخلاقيات المدرسة على اختبار الفهم', en: 'Advice on getting school ethics approval for the comprehension test' },
    { ar: 'ملاحظاتكم على نقاط ضعفنا', en: 'Your feedback on our weak spots' }
  ];
  var DP_HOW = [
    { ar: 'نأخذ كل محطة على الخريطة', en: 'Take every station on the map' },
    { ar: 'زمن الطريق = الطول ÷ (السرعة × الازدحام)، وتُحذف الطرق المغلقة', en: 'Road time = length ÷ (speed × traffic); closed roads are removed' },
    { ar: 'نتجاوز الوحدات المشغولة ونختار أقل زمن وصول، ونعرض صاحب المركز الثاني والسبب', en: 'Skip busy units, pick the smallest ETA, show the runner-up and the reason' },
    { ar: 'يُعاد الحساب كل ثانية؛ وإن أُغلق طريق أو ساء الازدحام نعيد التوجيه', en: 'Recomputed every second; if a road closes or traffic worsens we re-dispatch' }
  ];

  // Numbers you may say — each with its source (docs/MANARA-SOURCES.md). Anything else is N/A.
  var NUMS = [
    ['1–2 min', { ar: 'وقت النجاة بعد انطلاق إنذار الدخان', en: 'time to escape once a smoke alarm sounds' }, 'NFPA (S3)', { ar: 'بحث دولي', en: 'international research' }],
    ['49%', { ar: 'من وفيات الحرائق السكنية بين 11 مساءً و7 صباحًا', en: 'of residential fire deaths, 11 p.m.–7 a.m.' }, 'USFA (S7)', { ar: 'بيانات أمريكية', en: 'US data' }],
    ['7–10 min', { ar: 'وصول الدفاع المدني إلى البلاغات', en: 'Civil Defence reached incidents' }, 'Qatar Tribune 2018 (S26)', { ar: 'قطر، 2017 — قديم', en: 'Qatar, 2017 — old' }],
    ['46.6%', { ar: 'من السكان سُجّلوا في «سكن العمال»', en: 'of residents counted in "labour camps"' }, 'Census 2020 via GLMM (S22)', { ar: 'قطر', en: 'Qatar' }],
    ['92.7%', { ar: 'من السكان غير قطريين', en: 'of residents are non-Qatari' }, 'Census 2020 via GLMM (S21)', { ar: 'قطر (محسوب)', en: 'Qatar (computed)' }],
    ['32.1 °C', { ar: 'حدّ WBGT لإيقاف كل عمل', en: 'WBGT limit to stop all work' }, 'ILO / Ministry of Labour (S19)', { ar: 'قطر — قياس لا تقدير', en: 'Qatar — a measurement, not an estimate' }],
    ['10:00–15:30', { ar: 'منع العمل في الهواء الطلق (1 يونيو–15 سبتمبر)', en: 'outdoor work ban (1 Jun–15 Sep)' }, 'Qatar Tribune / ILO (S18)', { ar: 'قطر', en: 'Qatar' }],
    ['84 mm', { ar: 'أمطار أبو هامور 20–21 أكتوبر 2018', en: 'Abu Hamour rain, 20–21 Oct 2018' }, 'The Peninsula 2018 (S28)', { ar: 'قطر', en: 'Qatar' }],
    ['> 7,000 µg/m³', { ar: 'PM10 في الدوحة، أبريل 2015', en: 'PM10 in Doha, April 2015' }, 'Fountoukis et al. 2020 (S30)', { ar: 'قطر', en: 'Qatar' }],
    ['64.0%', { ar: 'من 1,238 توقف قلب وقعت في المنزل', en: 'of 1,238 cardiac arrests happened at home' }, 'Resuscitation Plus 2025 (S25)', { ar: 'قطر', en: 'Qatar' }],
    ['75% / 10 min', { ar: 'هدف الإسعاف في المدن', en: 'ambulance target in urban areas' }, 'QNA 2023 (S24)', { ar: 'قطر', en: 'Qatar' }],
    ['67%', { ar: 'وصلت المسيّرة بالمنعش قبل الإسعاف', en: 'the drone AED arrived before the ambulance' }, 'Lancet Digit Health 2023 (S15)', { ar: 'دراسة دولية — ليست قطرية', en: 'international study — not Qatar' }],
    ['≤ 7 y / QAR 300,000', { ar: 'عقوبة بعض مخالفات المسيّرات', en: 'penalty for some drone offences' }, 'The Peninsula 2026 (S34)', { ar: 'قطر', en: 'Qatar' }],
    ['66.7% (12/18)', { ar: 'دقة كاشفنا على صور محجوزة', en: 'our detector on held-out photos' }, { ar: 'اختبار مشروعنا', en: 'our own test' }, { ar: 'عيّنة صغيرة', en: 'a small sample' }],
    ['317 s vs 626 s', { ar: 'زمن وصول 90% إلى الأمان (منارة مقابل الإنذار العادي)', en: 'time for 90% to reach safety (MANARA vs ordinary alarm)' }, { ar: 'محاكاتنا — بذرة 1', en: 'our simulation — seed 1' }, { ar: 'SIM — فحص آلية', en: 'SIM — a mechanism check' }],
    ['US$ 74.95', { ar: 'الكاميرا الحرارية MLX90640', en: 'the MLX90640 thermal camera' }, 'Adafruit, Oct 2026', { ar: 'تقدير للتخطيط', en: 'a planning estimate' }]
  ];

  // Booth checklist
  var CK = [
    { id: 'week', icon: 'clock', h: { ar: 'قبل أسبوع', en: 'The week before' }, items: [
      { id: 'w1', ar: 'اطبع نصّ الثلاث دقائق وأسئلة الحَكَم (A4) نسختين، ولوحة العرض', en: 'Print the 3-minute script and the Judge Q&A (A4), two copies each, plus the display board' },
      { id: 'w2', ar: 'شغّل حسّاسات الغاز MQ يومين كاملين قبل الموعد (تنص صحائف البيانات على 48 ساعة)', en: 'Run the MQ gas sensors for two full days before (the datasheets ask for 48 hours)', sub: { ar: 'يبقى القياس «استرشاديًا» حتى بعد ذلك', en: 'Readings stay "indicative" even then' } },
      { id: 'w3', ar: 'سجّل فيديو احتياطيًا (60–90 ث) للحظة الحيّة واحفظه على الحاسوب والهاتف وUSB', en: 'Record a fallback video (60–90 s) of the live moment and save it on the laptop, phone and a USB stick' },
      { id: 'w4', ar: 'تدرّب على مسار الثلاث دقائق 5 مرات على الأقل بالمؤقّت (انظر بطاقة التدريب)', en: 'Rehearse the 3-minute path at least 5 times with the timer (see the rehearsal card)' },
      { id: 'w5', ar: 'اسأل المنظّمين: الكهرباء، حجم الطاولة، الشاشة/HDMI، قواعد اللهب والصوت والوميض', en: 'Ask the organisers: power, table size, screen/HDMI, rules on flames, sound and flashing light' },
      { id: 'w6', ar: 'اكتب على بطاقة ما هو مسودة وما لم يُختبر (اللغات، اختبار الفهم، الحرائق الحقيقية)', en: 'Write on a card what is still a draft or untested (languages, comprehension test, real fires)' } ] },
    { id: 'morning', icon: 'pin', h: { ar: 'صباح اليوم (قبل الحَكَم بـ 45 دقيقة)', en: 'The morning (45 minutes before the judges)' }, items: [
      { id: 'm1', ar: 'ركّب الطاولة: الحاسوب، لوحة التوأم، جدار الهواتف، المشترك الكهربائي', en: 'Set up the table: laptop, twin board, phone wall, power strip' },
      { id: 'm2', ar: 'شغّل لوحة التوأم قبل 15 دقيقة: الكاميرا الحرارية نحو 4 دقائق، وMQ نحو 3 دقائق للتسخين', en: 'Power the twin board 15 minutes early: about 4 minutes warm-up for the thermal camera, 3 for the MQ sensors', sub: { ar: 'قراءات استرشادية فقط', en: 'indicative readings only' } },
      { id: 'm3', ar: 'افتح الصفحات من المجلد دون إنترنت: العرض، غرفة العمليات (`#scenario=fire-night&seed=1`) في تبويبين، جدار الهواتف، مختبر الأدلة', en: 'Open the pages from the offline folder: the pitch, Mission Control (`#scenario=fire-night&seed=1`) in two tabs, the phone wall, the Evidence Lab' },
      { id: 'm4', ar: 'أوقف السكون والإشعارات، وارفع السطوع، واضبط الصوت (ليس نغمة الإنذار الوطنية)', en: 'Turn off sleep and notifications, raise the brightness, set a safe volume (never the national alert tone)' },
      { id: 'm5', ar: 'استخدم Chrome أو Edge، وبدّل بين العربية والإنجليزية للتأكد', en: 'Use Chrome or Edge and switch between Arabic and English to check' } ] },
    { id: 'offline', icon: 'signal', h: { ar: 'تجربة بلا إنترنت', en: 'The offline test' }, items: [
      { id: 'o1', ar: 'فعّل وضع الطيران ونفّذ مسار الثلاث دقائق كاملًا مرة واحدة', en: 'Turn on airplane mode and run the whole 3-minute path once' },
      { id: 'o2', ar: 'اختبر الرسائل بين النوافذ: اعتمد في غرفة العمليات وتأكد أن الهواتف تتحدّث', en: 'Test cross-window messages: approve in Mission Control and check that the phones update' },
      { id: 'o3', ar: 'اشحن الهواتف إلى 80% على الأقل وعطّل القفل التلقائي', en: 'Charge the phones to at least 80% and turn off auto-lock' } ] },
    { id: 'power', icon: 'battery', h: { ar: 'الكهرباء', en: 'Power' }, items: [
      { id: 'p1', ar: 'مشترك وكابل تمديد احتياطي، وكوابل بيانات (لا كوابل شحن فقط)', en: 'A spare power strip and extension lead, and data cables (not charge-only)' },
      { id: 'p2', ar: 'بطاريات محمولة بعيدة عن الشمس والسيارة الساخنة (المعتاد حتى نحو 40 °م)', en: 'Power banks kept out of the sun and a hot car (typically rated to about 40 °C)' },
      { id: 'p3', ar: 'شاحن الحاسوب موصول طوال العرض', en: 'The laptop charger stays plugged in during the pitch' } ] },
    { id: 'backup', icon: 'download', h: { ar: 'النسخ الاحتياطية', en: 'Backups' }, items: [
      { id: 'b1', ar: 'نسخة كاملة من المجلد على جهاز ثانٍ وعلى USB', en: 'A full copy of the folder on a second device and a USB stick' },
      { id: 'b2', ar: 'الفيديو الاحتياطي جاهز على سطح المكتب', en: 'The fallback video ready on the desktop' },
      { id: 'b3', ar: 'ملف PDF للشرائح (زر الطباعة P) وورق مطبوع للنص', en: 'A PDF of the slides (print button, P) and the script on paper' } ] },
    { id: 'safety', icon: 'shield', h: { ar: 'السلامة والقواعد', en: 'Safety and rules' }, items: [
      { id: 's1', ar: 'لا لهب ولا غاز قابل للاشتعال ولا دخان حقيقي: كوب ساخن، بخار معقّم في زجاجة مغلقة، مجفّف شعر بإذن، كوب ماء', en: 'No flames, no flammable gas, no real smoke: a hot mug, sanitiser vapour in a sealed bottle, a hair dryer with permission, a cup of water' },
      { id: 's2', ar: 'الوميض مغلق افتراضيًا؛ ضع لافتة «عرض ضوء وامض» قرب جدار الهواتف', en: 'The strobe is off by default; put a "flashing light demo" sign near the phone wall' },
      { id: 's3', ar: 'لا تشغّل نغمة الإنذار الوطني أبدًا؛ كل تنبيه في العرض عليه شارة «تمرين»', en: 'Never play the national alert tone; every demo alert carries the EXERCISE banner' },
      { id: 's4', ar: 'لا مسيّرة تطير في القاعة: المسيّرة مفهوم فقط', en: 'No drone flies in the hall: the drone is a concept only' } ] },
    { id: 'last', icon: 'flag', h: { ar: 'قبل وصول الحَكَم بخمس دقائق', en: 'Five minutes before the judges' }, items: [
      { id: 'l1', ar: 'أعد ضبط غرفة العمليات (الحريق الليلي، البذرة 1) وامسح الإشارات القديمة', en: 'Reset Mission Control (night fire, seed 1) and clear old check-ins' },
      { id: 'l2', ar: 'ضع الموقّت على 00:00 وجرّب الضغط على S مرة واحدة', en: 'Put the timer at 00:00 and press S once to check' },
      { id: 'l3', ar: 'جملة الافتتاح جاهزة، وقائمة الاعترافات الستة (نقاط الضعف) في متناول يدك', en: 'Your opening sentence is ready, and the six honest disclosures (weak spots) are within reach' } ] },
    { id: 'after', icon: 'check', h: { ar: 'بعد الانتهاء', en: 'Afterwards' }, items: [
      { id: 'a1', ar: 'دوّن أسئلة الحَكَم التي لم تُجب عنها جيدًا وأضِفها إلى تبويب الأسئلة', en: 'Write down the judge questions you did not answer well and add them to the Q&A tab' },
      { id: 'a2', ar: 'اشكر الحَكَم والمنظّمين', en: 'Thank the judges and the organisers' } ] }
  ];
  var ROLES = [
    { n: 'P', c: '--brand', ar: 'المقدّم: يقف عند الشاشة، يتكلم، ويسلّم الفأرة للحَكَم', en: 'Presenter: stands by the screen, speaks, and hands the mouse to the judge' },
    { n: 'O', c: '--accent', ar: 'مرافق الحَكَم: بجانب الحَكَم، يشير إلى الأزرار ولا يضغط عنه', en: 'Judge guide: beside the judge, points at the buttons but does not click for them' },
    { n: 'W', c: '--safe', ar: 'جدار الهواتف: يمسك الهواتف الأربعة ويُري كل شخصية', en: 'Phone wall: holds the four phones and shows each persona' },
    { n: 'S', c: '--info', ar: 'المستقبِل والكاتب: يستقبل الزوار، ويدوّن الأسئلة، ويراقب الوقت', en: 'Greeter and scribe: welcomes visitors, notes questions, watches the clock' }
  ];
  // The ten highest-risk failure points
  var RISKS = [
    { sev: 'high', t: { ar: 'الرسائل بين النوافذ لا تصل إلى جدار الهواتف', en: 'Cross-window messages do not reach the phone wall' },
      why: { ar: 'المتصفح أو الملفات المحلية (file://) قد تمنع التخزين المشترك أو BroadcastChannel، أو فُتحت الصفحات في متصفحين مختلفين.', en: 'The browser or local files (file://) may block shared storage or BroadcastChannel, or the pages were opened in different browsers.' },
      fix: { ar: 'استعمل متصفحًا واحدًا (Chrome/Edge) واختبر: اعتماد في غرفة العمليات ← تحديث الهواتف. وإن لم ينجح: شغّل خادمًا محليًا من مجلد site (`python3 -m http.server 8765`) وافتح `http://localhost:8765/manara/`، أو استعمل جدار الهواتف داخل نافذة واحدة.', en: 'Use one browser (Chrome/Edge) and test: approve in Mission Control, then check the phones. If it fails: serve the site folder locally (`python3 -m http.server 8765`) and open `http://localhost:8765/manara/`, or use the phone wall inside a single window.' },
      say: { ar: 'الهواتف لا تتلقى الرسائل هنا — هذا ما سنختبره في التجربة الميدانية.', en: 'The phones are not receiving messages here — that is what a field pilot would test.' } },
    { sev: 'high', t: { ar: 'العرض الحي يتجمّد أو يتعطل', en: 'The live demo freezes or crashes' },
      why: { ar: 'محاكاة ثقيلة، تبويبات كثيرة، أو ذاكرة قليلة.', en: 'A heavy simulation, too many tabs, or low memory.' },
      fix: { ar: 'تبويب ثانٍ مفتوح مسبقًا بالرابط نفسه، وسرعة المحاكاة 4×، وأغلق ما لا تحتاج. وفيديو احتياطي على سطح المكتب.', en: 'A second tab pre-opened with the same link, simulation speed 4×, close what you do not need. A fallback video on the desktop.' },
      say: { ar: 'الصفحة تأخرت — الإنذار المحلي لا ينتظر الحاسوب. سأنتقل إلى النسخة الاحتياطية.', en: 'The page stalled — the local alarm never waits for the computer. I\'ll switch to the backup.' } },
    { sev: 'high', t: { ar: 'الشاشة أو الـ HDMI لا تعمل', en: 'The screen or HDMI does not work' },
      why: { ar: 'منفذ مختلف، دقة غير مدعومة، أو لا إشارة.', en: 'A different port, an unsupported resolution, or no signal.' },
      fix: { ar: 'خذ محوّلات HDMI وUSB-C، وجرّب الدقة قبل الموعد، والصفحة تتكيّف مع أي حجم. وآخر حل: العرض من شاشة الحاسوب على الطاولة.', en: 'Bring HDMI and USB-C adapters, test the resolution beforehand; the page adapts to any size. Last resort: present from the laptop screen on the table.' },
      say: { ar: 'سنعرض من شاشة الحاسوب — تفضلوا بالاقتراب.', en: 'We\'ll present from the laptop screen — please come closer.' } },
    { sev: 'high', t: { ar: 'انقطاع الكهرباء أو بطارية فارغة', en: 'Power loss or a flat battery' },
      why: { ar: 'مشترك معطل، كابل مفكوك، أو بطارية قديمة في الحرارة.', en: 'A dead power strip, a loose cable, or an old battery in the heat.' },
      fix: { ar: 'مشترك وكابل احتياطي، وشاحن موصول، وبطاريات محمولة في الظل. والنص مطبوع على الورق.', en: 'A spare strip and lead, the charger plugged in, power banks in the shade. The script printed on paper.' },
      say: { ar: 'حتى بلا كهرباء الفكرة قائمة: سأشرحها بالكلام.', en: 'Even without power the idea stands: let me explain it by speaking.' } },
    { sev: 'med', t: { ar: 'الحسّاسات لم تسخن أو قراءتها مشوشة', en: 'Sensors not warmed up, or noisy readings' },
      why: { ar: 'الكاميرا الحرارية نحو 4 دقائق، وMQ نحو 3 دقائق، وصحائف MQ تطلب 48 ساعة تسخينًا؛ والمكيّف والشمس وبخار معقّم الجيران تشوّش.', en: 'The thermal camera needs about 4 minutes, MQ sensors about 3, and MQ datasheets ask for 48 hours of burn-in; air-conditioning, sunlight and neighbours\' sanitiser add noise.' },
      fix: { ar: 'شغّلها مبكرًا، وسجّل خط الأساس في مكانك، وأبعدها عن فتحة التكييف، وأغلق زجاجة المعقّم، وقل إن القراءات استرشادية.', en: 'Power early, record the baseline at your table, keep away from the AC vent, seal the sanitiser bottle, and say the readings are indicative.' },
      say: { ar: 'هذه قراءات استرشادية بعد تسخين قصير؛ لهذا نطلب مفتاحين.', en: 'These are indicative readings after a short warm-up; that is why we need two keys.' } },
    { sev: 'med', t: { ar: 'الاتصال التسلسلي (Web Serial) لا يعمل', en: 'Web Serial will not connect' },
      why: { ar: 'إذن المتصفح، كابل شحن فقط، أو مشغّل `CP210x`/`CH340` غير مثبّت.', en: 'Browser permission, a charge-only cable, or a missing `CP210x`/`CH340` driver.' },
      fix: { ar: 'كابل بيانات، ومشغّل مثبّت، وChrome/Edge فقط، وجرّبه قبل الموعد. والصفحات تعمل بلا اللوحة (توأم محاكى).', en: 'A data cable, the driver installed, Chrome/Edge only, tested beforehand. The pages work without the board (a simulated twin).' },
      say: { ar: 'اللوحة غير موصولة الآن، فنستعمل التوأم المحاكى.', en: 'The board is not connected now, so we use the simulated twin.' } },
    { sev: 'med', t: { ar: 'قواعد القاعة: اللهب، الوميض، الصوت، المسيّرات', en: 'Venue rules: flames, flashing light, sound, drones' },
      why: { ar: 'المنظّمون قد يمنعون الوميض أو الصوت العالي أو أي جهاز يحاكي الإنذار.', en: 'Organisers may ban flashing light, loud sound, or anything that imitates an alarm.' },
      fix: { ar: 'بدائل آمنة فقط، والوميض مغلق افتراضيًا مع لافتة، وصوت منخفض، وشارة «تمرين» على كل تنبيه، ولا نغمة وطنية، ولا مسيّرة.', en: 'Safe stand-ins only, strobe off by default with a sign, low volume, an EXERCISE banner on every alert, no national tone, no drone.' },
      say: { ar: 'هذا عرض تمرين: لا لهب ولا وميض افتراضي.', en: 'This is an exercise demo: no flames, no strobe by default.' } },
    { sev: 'med', t: { ar: 'سؤال لا تعرف جوابه أو رقم لا تملكه', en: 'A question you cannot answer, or a number you do not have' },
      why: { ar: 'الإغراء بتخمين رقم أو الدفاع بدل الاعتراف.', en: 'The temptation to guess a number or defend instead of admitting.' },
      fix: { ar: 'استعمل قائمة نقاط الضعف، وقل «لم نقِس هذا بعد، وهكذا سنقيسه». لا تخترع رقمًا أبدًا؛ «غير متاح» جواب مقبول.', en: 'Use the weak-spots list and say "we haven\'t measured that yet, and here is how we would". Never invent a number; "N/A" is an accepted answer.' },
      say: { ar: 'لم نقِس هذا بعد؛ وسنقيسه بهذه الطريقة…', en: 'We haven\'t measured that yet; we would measure it like this…' } },
    { sev: 'med', t: { ar: 'نفاد الوقت أو مقاطعة الحَكَم', en: 'Running out of time, or a judge interrupts' },
      why: { ar: 'اللحظة الحيّة تستغرق أكثر من المتوقع.', en: 'The live moment takes longer than planned.' },
      fix: { ar: 'تدرّب 5 مرات. إذا قاطعك الحَكَم فأجب، ثم عُد من الجزء التالي. ما تتخلى عنه أولًا: شريحة الهواتف ثم الأعمال المساعدة (مسار الثلاث دقائق يتخطاها أصلًا).', en: 'Rehearse five times. If a judge interrupts, answer, then rejoin at the next segment. What to drop first: the extra slides (the strict path already skips them).' },
      say: { ar: 'سؤال ممتاز — سأجيب ثم نكمل.', en: 'Excellent question — I\'ll answer, then we continue.' } },
    { sev: 'low', t: { ar: 'متحدث أصلي يجد خطأً في لغة المسودة', en: 'A native speaker finds an error in a draft language' },
      why: { ar: 'اللغات الست مسودات لم تُراجع بعد.', en: 'The six community languages are drafts not yet reviewed.' },
      fix: { ar: 'اشكره ودوّن التصحيح؛ وبطاقات الصور تحمل الرسالة الأساسية للجميع. لا تدافع عن الترجمة.', en: 'Thank them and note the correction; picture cards carry the core message for everyone. Do not defend the translation.' },
      say: { ar: 'شكرًا — هذه مسودة تنتظر مراجعة متحدث أصلي، وسنصحّحها.', en: 'Thank you — this is a draft waiting for a native speaker, and we will correct it.' } }
  ];

  /* ==========================================================================
     JUDGE Q&A  (honest answers; numbers only from docs/MANARA-SOURCES.md; weak spots carry a "say it first" line)
     ========================================================================== */
  var SRCN = { S3: 'NFPA', S6: 'USFA', S7: 'USFA', S15: 'Lancet Digit Health 2023', S16: 'JAMA 2017', S18: 'Qatar Tribune / ILO', S19: 'ILO 2021', S20: 'ILO 2019',
    S21: 'Census 2020 via GLMM', S22: 'Census 2020 via GLMM', S23: 'Embassy estimates 2015–2017 via GLMM', S24: 'QNA 2023 (HMC)', S25: 'Resuscitation Plus 2025', S26: 'Qatar Tribune 2018',
    S27: 'Doha News 2014', S28: 'The Peninsula 2018', S30: 'Fountoukis et al. 2020', S33: 'GLMM summary of Ministerial Decision 18/2014', S34: 'The Peninsula 2026 / Marhaba 2026',
    S35: 'The Peninsula 2023', S36: 'Qatar Tribune 2026', S37: 'Gulf Times (MoI)', S38: 'Gulf Times / The Peninsula 2013', S39: 'QNA 2024', S41: 'The Peninsula 2013', S43: 'Qatar Tribune 2025',
    S46: 'NIOSH / CDC', S47: 'NIOSH / OSHA', S48: 'NIOSH / NOAA', S49: 'US EPA', S50: 'WHO 2021', S57: 'W3C WCAG 2.2', S60: 'MQ-2 datasheet', S61: 'MQ-7 datasheet', S62: 'MQ-135 datasheet', S63: 'MQ-136 datasheet',
    S65: 'PMS5003 datasheet', S68: 'MLX90640 datasheet', S72: 'HMC', S73: 'HMC' };
  var QG = [
    { id: 'why', icon: 'target', ar: 'لماذا منارة؟', en: 'Why MANARA?' },
    { id: 'proof', icon: 'shield', ar: 'الدليل والدقة', en: 'Proof and accuracy' },
    { id: 'dispatch', icon: 'route', ar: 'أقرب جهة استجابة', en: 'Nearest responder' },
    { id: 'drone', icon: 'drone', ar: 'المسيّرة والقانون', en: 'Drone and law' },
    { id: 'people', icon: 'users', ar: 'الناس والخصوصية والأخلاقيات', en: 'People, privacy and ethics' },
    { id: 'build', icon: 'wrench', ar: 'البناء والتكلفة والصدق', en: 'Build, cost and honesty' }
  ];
  var OPENING = [
    { ar: 'كاشف الصور يصيب 66.7% فقط على صور جديدة، ولهذا لا يقرّر وحده.', en: 'The image detector is right only 66.7% on new photos, so it never decides alone.' },
    { ar: 'لم نجرّب على حرائق حقيقية ولا على أشخاص؛ والاختبارات الميدانية في خطتنا.', en: 'We have not tested on real fires or on people; field tests are in our plan.' },
    { ar: 'حسّاسات الغاز رخيصة وقراءاتها استرشادية، ومنارة لا تحلّ محل أجهزة معتمدة.', en: 'The gas sensors are cheap and their readings indicative, and MANARA does not replace certified devices.' },
    { ar: 'المرور والمحطات والسكان في العرض محاكاة (SIM) — فحص آلية لا برهان أثر.', en: 'Traffic, stations and residents in the demo are simulated (SIM) — a mechanism check, not proof of impact.' },
    { ar: 'اللغات الست مسودات تنتظر مراجعة متحدث أصلي، والمسيّرة مفهوم لجهة مرخَّصة.', en: 'The six community languages are drafts awaiting native review, and the drone is a concept for a licensed agency.' },
    { ar: '999 يبقى المرسِل؛ ونحن نتصل بالأنظمة ولا نستبدلها، وأي ربط يحتاج اتفاقًا.', en: '999 stays the dispatcher; we plug into systems rather than replace them, and any link needs an agreement.' }
  ];
  var FILL = { ar: 'عدّل هذا الجواب ليصبح صادقًا عن عملك أنت (الأسماء والمهام) قبل أن تقوله.', en: 'Edit this answer so it is true about your own work (names and tasks) before you say it.' };
  var QA = [
    /* ---------------- why ---------------- */
    { id: 'W1', g: 'why', slide: 3, src: ['S35', 'S36'],
      q: { ar: 'أليس لدى قطر نظام تحذير وطني يصل إلى كل الهواتف؟', en: 'Doesn\'t Qatar already have a national warning that reaches every phone?' },
      a: { ar: 'بلى. يرسل نظام التحذير العام التابع لوزارة الداخلية تنبيهات بالعربية والإنجليزية مع اهتزاز ونغمة، إلى الجميع أو إلى مناطق محددة (المصدر: ذا بينينسولا 2023). ولهذا لا تحاول منارة استبداله. الرسالة العامة لا تعرف مَن النائم في الغرفة 203، ومَن الأصمّ، وأيّ مخرج مغلق الآن، ومَن لم يُحصَ بعد. هذا هو «آخر مئة متر» الذي نعمل عليه، ثم نسلّم الجهات حزمة موثّقة. ولا نقلّد نغمة الإنذار الوطني، فقد حذّرت الوزارة من إساءة استخدامها (قطر تريبيون 2026).',
           en: 'Yes. The Ministry of Interior\'s warning system sends Arabic and English alerts with vibration and a ringtone to everyone or to chosen areas (The Peninsula, 2023). That is why MANARA does not replace it. A message to every phone cannot know who is asleep in room 203, who is Deaf, which exit is locked right now, or who has not been counted. That last 100 metres is our job, and we hand the authorities a verified package. We also never copy the national alert sound — the Ministry warned about misuse (Qatar Tribune, 2026).' } },
    { id: 'W2', g: 'why', slide: 3, src: ['S38', 'S33'],
      q: { ar: 'إنذارات المباني تصل أصلًا إلى غرفة عمليات الدفاع المدني، فما الجديد؟', en: 'Building alarms already reach the Civil Defence operations room. What is new?' },
      a: { ar: 'صحيح: نظام المراقبة المركزي لإنذارات المباني يرفع الإنذار إلى غرفة عمليات الداخلية والدفاع المدني (جلف تايمز؛ ذا بينينسولا 2013)، والقرار الوزاري 18 لسنة 2014 يُلزم سكن العمال بمكشفات دخان ونظام إنذار. هذا كله يُخبر غرفة العمليات. منارة تُخبر كل شخص بما يفعل بلغته، وتوقظ مَن لا يسمع، وتحصي مَن خرج. ولا نحلّ محل لوحات الإنذار المعتمدة؛ منارة مكمِّلة، وأي ربط بنظام حقيقي يحتاج موافقة الجهة.',
           en: 'True: building alarm boards feed the Ministry of Interior and Civil Defence operations room (Gulf Times; The Peninsula, 2013), and Ministerial Decision 18 of 2014 requires smoke detectors and an alarm in workers\' accommodation. Those tell the control room. MANARA tells each person what to do in their own language, wakes people who cannot hear a siren, and counts who got out. We do not replace certified alarm panels; connecting to any real system needs the authority\'s approval.' } },
    { id: 'W3', g: 'why', slide: 3, src: ['S35'],
      q: { ar: 'لماذا لا نكتفي برسالة نصية أو ببثّ عبر شبكة الهاتف؟', en: 'Why not just send a text message or a cell broadcast?' },
      a: { ar: 'يجب أن نفعل ذلك — ومنارة مصمَّمة لتسليم رسالتها إلى مثل هذه القنوات عبر صيغة CAP القياسية. لكن البثّ رسالة واحدة بصيغة واحدة لكل من في المنطقة. لا يستطيع أن يصعد مع النائم حتى يستجيب، ولا أن يوقظ الأصمّ باهتزاز وبطاقة مصورة، ولا أن يخاطب قارئ المالايالامية بلغته، ولا أن يعرف أن مخرجًا أُقفل للتوّ، ولا أن يعدّ مَن خرج. فالبثّ للمنطقة، ومنارة للشخص، و999 للاستجابة. ولم نختبر الإرسال عبر شبكة بثّ حقيقية.',
           en: 'We should — and MANARA is designed to hand its message to exactly such channels through the standard CAP format. But a broadcast is one message in one format for everyone in an area. It cannot climb until a sleeper responds, wake a Deaf resident with vibration and a picture card, speak to a Malayalam reader in their language, know that an exit just locked, or count who got out. So: broadcast for the area, MANARA for the person, 999 for the response. We have not tested over a real broadcast network.' } },
    { id: 'W4', g: 'why', slide: 11, src: [],
      q: { ar: 'هل تريدون استبدال 999 أو الدفاع المدني أو نظام التحذير الوطني؟', en: 'Are you trying to replace 999, Civil Defence or the national warning system?' },
      a: { ar: 'لا. 999 يبقى المرسِل، والدفاع المدني يكافح الحريق، ونظام التحذير الوطني يخاطب الجميع. منارة تكمّل «آخر مئة متر»: تتحقق، وتوقظ كل شخص، وترشده، وتعدّه، وتسلّم الجهات حزمة موثّقة. وكل ربط حقيقي بأنظمة الدولة يحتاج اتفاقًا مع الجهة، ولا ندّعي أن شيئًا منه قد تم.',
           en: 'No. 999 stays the dispatcher, Civil Defence fights the fire, and the national warning system speaks to everyone. MANARA completes the last 100 metres: it proves, wakes each person, guides them, counts them, and hands the authorities a verified package. Any real link to state systems needs an agreement with the authority, and we do not claim any has been made.' } },
    { id: 'W5', g: 'why', slide: 3, src: ['S43', 'S39'],
      q: { ar: 'كيف يختلف مشروعكم عن مشروع المسيّرة التي كشفت كبريتيد الهيدروجين في آيسف 2025، وعن مسيّرات الدفاع المدني؟', en: 'How is MANARA different from the 2025 ISEF H2S-gas drone and from Civil Defence drones?' },
      a: { ar: 'نحترم ذلك الفريق؛ المعلن عن مشروعه عنوانه وجائزته فقط: مسيّرة تكشف تسرّب كبريتيد الهيدروجين مع سياج جغرافي لسلامة العمال (قطر تريبيون 2025)، ولم نطّلع على تصميمه فلا نصفه. والدفاع المدني لديه أصلًا مسيّرات إطفاء (وكالة الأنباء القطرية 2024). منارة ليست مشروع مسيّرة: المنتج هو المستشعر الثابت، وهي تغطي ستة أخطار على مسار واحد، وما نقدّمه هو السلسلة المتمحورة حول الإنسان: تحقق، إيقاظ مستهدف، مسار صحيح لكل خطر، إحصاء، تسليم. لو كشفت مسيّرة تسرّبًا، فمنارة هي التي تخبر الناس إلى أين يمشون.',
           en: 'We respect that team. What is public about it is the title and the award: a drone-enabled H2S leak detector with geofencing for worker safety (Qatar Tribune, 2025); we have not seen the design, so we do not describe it. Civil Defence already has firefighting drones (QNA, 2024). MANARA is not a drone project — the fixed sentinel is the product, one pipeline covers six hazards, and what we offer is the person-centred chain: proof, targeted waking, a hazard-correct route, a headcount and a hand-off. If a drone found a leak, MANARA is what tells people which way to walk.' } },
    { id: 'W6', g: 'why', weak: true, slide: 4, src: [],
      first: { ar: 'لا ندّعي أننا الأوائل: أجزاء من الفكرة موجودة.', en: 'We don\'t claim to be first: parts of this idea exist.' },
      q: { ar: 'التنبيه وتوجيه المخارج موجودان في بعض المباني الذكية. فما الجديد عندكم؟', en: 'Alerting and exit guidance already exist in some smart-building products. What is new?' },
      a: { ar: 'لا ندّعي السبق، فأجزاء منها موجودة. ادعاؤنا أضيق: مسار واحد مفتوح يعمل دون إنترنت ويجمع (1) رفض التنبيه على حسّاس واحد، (2) رسالة تتكيّف مع كل شخص: لغته وصيغته وقدرته، (3) إعادة توجيه فورية حين يتغيّر مخرج، (4) عدّ مَن خرج، (5) تسليم حزمة موثّقة مع توصية بأسرع وحدة — لستة أخطار لا لخطر واحد. ونسنده باختبارات آلية وصفحة أدلة صادقة، لكننا لم نُجرِ تجربة ميدانية بعد.',
           en: 'We don\'t claim to be first; parts of this exist. Our claim is narrower: one open pipeline that works offline and combines (1) refusing to alert on a single sensor, (2) a message that adapts to each person — language, format, ability, (3) instant re-routing when an exit changes, (4) a headcount, and (5) a verified package with a fastest-unit recommendation — for six hazards, not one. We back it with automated tests and an honest evidence page, but we have not done a field trial yet.' } },
    { id: 'W7', g: 'why', slide: 11, src: [],
      q: { ar: 'هل يتوافق المشروع مع برامج المدينة الذكية مثل «تسمو»؟', en: 'Does it fit smart-city programmes such as TASMU?' },
      a: { ar: 'تسمو (برنامج قطر الذكية بقيادة وزارة المواصلات والاتصالات) سياق لنا لا شريك: لا ندّعي توافقًا معه. أقصى ما نقوله إن منارة حالة استخدام مرشّحة لمنصة مدينة ذكية، ولا ندّعي أي اتفاق.',
           en: 'TASMU (the Smart Qatar Programme, led by the Ministry of Transport and Communications) is context for us, not a partner: we claim no compatibility with it. At most, MANARA is a candidate use case for a smart-city platform, and we claim no agreement of any kind.' } },
    { id: 'W8', g: 'why', slide: 6, src: ['S28', 'S30', 'S18', 'S19', 'S41'],
      q: { ar: 'لماذا هذه الأخطار الستة؟ وماذا عن الزلازل؟', en: 'Why these six hazards? What about earthquakes?' },
      a: { ar: 'لأن «آخر مئة متر» هي المشكلة نفسها في كلها: أن يستيقظ الناس ويفهموا ويتحركوا في الاتجاه الصحيح ويُعدّوا. واخترنا ما له سجلّ في قطر: سيول أكتوبر 2018 (84 ملم في أبو هامور)، وعاصفة أبريل 2015 الغبارية (PM10 فوق 7,000)، وحرّ الصيف وقواعد وزارة العمل، وتسرّب الغاز، والحريق، وحالات الاستغاثة في المنازل. أما الزلازل فقد وصفت إدارة الأرصاد قطر بأنها منخفضة الخطر (2013) فلم نبنِ لها سيناريو. وبعض هذه الأخطار محاكاة (السيول والغبار) ونقولها.',
           en: 'Because the last 100 metres is the same problem in all of them: people must wake, understand, move the right way and be counted. We chose hazards with a Qatar record: the October 2018 floods (84 mm in Abu Hamour), the April 2015 dust storm (PM10 above 7,000), summer heat and the Ministry of Labour rules, gas leaks, fires, and emergencies at home. Qatar\'s Meteorology Department called Qatar a low-risk country for earthquakes (2013), so we built no scenario for them. Some hazards are simulated (flood, dust), and we say so.' } },
    /* ---------------- proof ---------------- */
    { id: 'P1', g: 'proof', slide: 5, src: [],
      q: { ar: 'هل كاشف الحريق «ذكاء اصطناعي»؟', en: 'Is your fire detector "AI"?' },
      a: { ar: 'لا. هو رؤية حاسوبية بقواعد: نماذج لون وحركة وتذبذب وطبقات تحقق (شكل، استمرار، فيتو حراري). دقته على صور اختبار لم يرها أثناء الضبط 66.7% فقط ونقول ذلك، ويرفض كاشف الفيديو الأجسام الحمراء الثابتة. وهو لا يقرر وحده: لا بد من مفتاحين مستقلين ثم موافقة بشرية قبل أي تنبيه عام. وقد نجرّب نموذجًا متعلمًا لاحقًا ونقيسه في مختبر الخدع بالشروط نفسها.',
           en: 'No. It is rule-based computer vision: colour models, motion, flicker and verification layers (shape, persistence, a thermal veto). Its accuracy on held-out still images is 66.7% and we say so; the video detector rejects static red objects. And it never decides alone: two independent keys, then a human approval, before any public alert. We may try a learned model later and score it in the Decoy Lab on equal terms.' } },
    { id: 'P2', g: 'proof', weak: true, slide: 5, src: [],
      first: { ar: 'قبل أن تسألوا: كاشف الصور يصيب 66.7% فقط على صور جديدة، ولهذا لا يقرّر وحده.', en: 'Before you ask: the image detector is right only 66.7% on new photos, so it never decides alone.' },
      q: { ar: 'ما دقة الكاشف وما معدل الإنذارات الكاذبة؟', en: 'How accurate is the detector, and what is the false-alarm rate?' },
      a: { ar: 'يصيب كاشفنا 66.7% على صور محجوزة لم يُضبط عليها (12 من 18): وجد صور النار الست كلها، لكنه أخطأ في 3 من 12 صور بلا نار، ولم يجد دخانًا في صور الدخان الثلاث. هي عيّنة صغيرة فلا نعمّمها. ولهذا لا تطلق رؤيته وحدها أي تنبيه عام: نحتاج مفتاحًا ثانيًا مستقلًا (حرارة أو دخان) ثم إنسانًا. وفي اختبار المسار الحي لم تصل 14 من 14 تجربة خداع (قميص أحمر، سيارة، وشاح، LED، كشّاف، جدار، مصباح وامض) إلى «نار»، لكنها مشاهد مولَّدة بالشيفرة لا لقطات حقيقية. ولم نقِس معدل الإنذارات الكاذبة في مبنى حقيقي على مدى أيام؛ وهذا في خطتنا.',
           en: 'Our detector is right 66.7% of the time on held-out photos it was not tuned on (12 of 18): it found all six fire photos, but was wrong on 3 of 12 fire-free photos and missed the smoke in all three smoke photos. That is a small sample, so we do not generalise it. This is why its vision alone never triggers a public alert: we need a second independent key (heat or smoke), then a human. In the live-pipeline test 14 of 14 decoy trials (red shirt, car, scarf, LED, flashlight, wall, flickering lamp) never reached FIRE, but those scenes are generated in code, not real footage. We have not measured a false-alarm rate in a real building over days; that is in our plan.' } },
    { id: 'P3', g: 'proof', slide: 5, src: [],
      q: { ar: 'مَن يقرر إرسال التنبيه؟ والثواني ثمينة، فلماذا ننتظر إنسانًا؟', en: 'Who decides to alert? Seconds count — why wait for a human?' },
      a: { ar: 'داخل المبنى لا شيء ينتظر: الصفّارة المحلية وأسهم المخارج وإنذار الحسّاس تعمل فورًا كأي جهاز إنذار. أما التنبيه العام خارج المبنى (الهواتف والجيران والجهات) فيحتاج موافقة المشغّل، لأن تنبيهًا عامًا كاذبًا يعلّم الناس تجاهل التنبيه الحقيقي التالي. وبطاقة الاعتماد تعرض المفتاحين اللذين اتفقا لتُقرأ في ثوانٍ. لم نقِس زمن مشغّل حقيقي؛ في العرض يعتمد مشغّل محاكى بعد زمن افتراضي قابل للتعديل (20 ثانية).',
           en: 'Inside the building nothing waits: the local siren, the exit arrows and the sentinel buzzer fire at once, like any fire alarm. Only the public alert beyond the building (phones, neighbours, the authority) needs the operator\'s approval, because a false public alert teaches people to ignore the next real one. The approval card shows the two keys that agreed so it can be read in seconds. We have not measured a real operator\'s time; in the demo a simulated operator approves after an adjustable assumption (20 seconds).' } },
    { id: 'P4', g: 'proof', weak: true, slide: 10, src: [],
      first: { ar: 'لم نجرّب على حرائق حقيقية.', en: 'We have not tested on real fires.' },
      q: { ar: 'هل جُرِّب المشروع على حرائق حقيقية؟', en: 'Has it been tested on real fires?' },
      a: { ar: 'لا — ونقولها. لا يُسمح بلهب ولا غاز قابل للاشتعال ولا دخان حقيقي في القاعة، فنستعمل بدائل آمنة: كوب ساخن، وبخار معقّم، ومجفّف شعر، وكوب ماء، ومحاكاة موسومة SIM. اختُبر الكاشف على صور ومقاطع لا على حرائق مبانٍ حقيقية. واختبار اللهب الحقيقي يحتاج مختبرًا خاضعًا للإشراف وموافقة السلامة في المدرسة أو الدفاع المدني، وهو في خطواتنا التالية. وادعاءاتنا محصورة فيما قسناه.',
           en: 'No — and we say so. No flames, flammable gas or real smoke are allowed in the hall, so we use safe stand-ins: a hot mug, sanitiser vapour, a hair dryer, a cup of water, and a simulation marked SIM. The detector was tested on photos and clips, not on real building fires. Real-flame testing needs a supervised lab and safety approval from the school or Civil Defence, and it is in our next steps. Our claims are limited to what we measured.' } },
    { id: 'P5', g: 'proof', weak: true, slide: 6, src: ['S60', 'S61', 'S62', 'S63'],
      first: { ar: 'قراءات الحسّاسات عندنا استرشادية، ومنارة لا تحلّ محل أجهزة معتمدة.', en: 'Our sensor readings are indicative, and MANARA does not replace certified devices.' },
      q: { ar: 'الحسّاسات رخيصة. هل يمكن الاعتماد عليها؟', en: 'The sensors are cheap hobby parts. Can they be trusted?' },
      a: { ar: 'ليست موثوقة وحدها. حسّاسات MQ حسّاسة لغازات متعددة وتنجرف مع الحرارة والرطوبة، وتطلب صحائف بياناتها تسخينًا لا يقل عن 48 ساعة؛ وتسخين الدقائق الثلاث على الطاولة يعطي قراءات استرشادية فقط. لهذا يحتاج كل إنذار إلى مفتاحين مستقلين، ونكتب «استرشادي» على قراءات ppm، ومنارة مكمِّلة: لا تحلّ محل جهاز إنذار حريق أو كاشف غاز معتمد.',
           en: 'Not on their own. MQ-type gas sensors respond to several gases and drift with temperature and humidity, and their datasheets ask for at least 48 hours of burn-in; the three-minute warm-up at the booth gives indicative readings only. That is why every alarm needs two independent keys, why we label ppm values "indicative", and why MANARA is a complement: it never replaces a certified fire alarm or gas detector.' } },
    { id: 'P6', g: 'proof', weak: true, slide: 5, src: [],
      first: { ar: 'لم نقِس بعد معدل الإنذارات الكاذبة في مبنى حقيقي.', en: 'We have not yet measured the false-alarm rate in a real building.' },
      q: { ar: 'ماذا عن «إرهاق الإنذارات»؟ ألن يتجاهل الناس التنبيهات؟', en: 'What about false-alarm fatigue? Won\'t people start ignoring alerts?' },
      a: { ar: 'هذا خطر حقيقي. نعالجه بثلاثة أمور: مفتاحان مستقلان وموافقة إنسان قبل أي تنبيه عام؛ ومناطق مستهدفة (المبنى أو الكتلة لا المدينة)؛ وثلاثة مستويات (مراقبة، احتماء، إخلاء) فتكون أغلب التنبيهات هادئة. ولا ننبّه أبدًا على حسّاس واحد. أما ما لم نفعله فقياس معدل الإنذارات الكاذبة على مدى أسابيع في مبنى حقيقي؛ وهذا ما ستقيسه التجربة الميدانية.',
           en: 'It is a real risk. We attack it three ways: two independent keys and a human before any public alert; targeted zones (the building or block, not the city); and three levels (watch, shelter, evacuate), so most alerts are calm. We never alert on a single sensor. What we have not done is measure the false-alarm rate over weeks in a real building; a field pilot would.' } },
    { id: 'P7', g: 'proof', weak: true, slide: 10, src: [],
      first: { ar: 'كل رقم محاكى موسوم SIM: فحص آلية لا برهان أثر.', en: 'Every simulated number is marked SIM: a mechanism check, not proof of impact.' },
      q: { ar: 'محاكاتكم تُظهر أن منارة أفضل. أليست مصمَّمة لتنجح؟', en: 'Your simulation shows MANARA is better. Isn\'t it rigged to win?' },
      a: { ar: 'لا يمكنها إثبات الأثر ونكتب ذلك في كل صفحة: SIM فحص للآلية فقط. تُشغّل البذرة نفسها في عالمين (إنذار عادي مقابل منارة)، وكل افتراض شريط قابل للتعديل. والنتائج تختلف باختلاف السيناريو والبذرة: في الحريق الليلي والغاز والاستغاثة فرق واضح، وفي الغبار وحريق المدرسة صغير، وفي الحرّ يتغير باختلاف البذرة (جرّبوا البذرتين 1 و7 على شريحة الأدلة). ونعرض مقايضة محرجة: صفّارة المبنى تُسمع بعد 14 ثانية في العالمين، أما أول رسالة شخصية من منارة فتصل بعد 39 ثانية لأنها تتحقق أولًا.',
           en: 'It cannot prove impact, and we say so on every page: SIM is a mechanism check only. It runs the same seed in two worlds (ordinary alarm vs MANARA), and every assumption is an adjustable slider. Results differ by scenario and seed: the night fire, gas and SOS runs show a clear gap, dust and the school fire a small one, and heat changes with the seed (try seeds 1 and 7 on the Evidence slide). And we show an awkward trade-off: the building siren is heard after 14 seconds in both worlds, while MANARA\'s first personal message arrives after 39 seconds because it verifies first.' } },
    { id: 'P8', g: 'proof', slide: 6, src: ['S18', 'S19', 'S20'],
      q: { ar: 'في قطر منع للعمل وقت الظهيرة وحدّ WBGT. ماذا تضيفون؟', en: 'Qatar already bans midday work and sets a WBGT limit. What do you add?' },
      a: { ar: 'المنع جدول زمني، وحدّ 32.1 °م يتطلب قياسًا في موقع العمل (قطر تريبيون؛ منظمة العمل الدولية). منارة تحوّل القياس إلى رسالة شخصية «توقف واذهب إلى الظل» بلغة العامل، وتحصي مَن وصل إلى مكان التبريد. ووجدت دراسة منظمة العمل الدولية 2019 أن العمال الذين يستطيعون تنظيم وتيرتهم وأخذ الاستراحة كانوا أقل عرضة للإجهاد الحراري، فنصمّم تذكيرًا لا إجبارًا. وقيمة WBGT من مستشعر حرارة ورطوبة تقدير نكتبه على الشاشة؛ الرقم القانوني يحتاج مقياسًا بكرة سوداء.',
           en: 'The ban is a schedule, and the 32.1 °C limit needs a measurement at the workplace (Qatar Tribune; ILO). MANARA turns a measurement into a personal "stop and go to shade" message in the worker\'s language and counts who reached the cooling shelter. The ILO study (2019) found workers who could self-pace and rest had lower heat strain, so we design a nudge, not enforcement. A WBGT from a temperature/humidity sensor is an estimate, and the screen says so; the legal figure needs a black-globe thermometer.' } },
    { id: 'P9', g: 'proof', weak: true, slide: 6, src: ['S46', 'S47', 'S48', 'S49', 'S50'],
      first: { ar: 'العتبات إرشاد دولي للبالغين، وليست معتمدة.', en: 'The thresholds are international guidance for adults, and are not certified.' },
      q: { ar: 'من أين عتباتكم (الغاز، الغبار، الحرارة)؟ وهل هي آمنة؟', en: 'Where do your thresholds (gas, dust, heat) come from? Are they safe?' },
      a: { ar: 'مأخوذة من إرشادات دولية للبالغين الأصحاء (NIOSH وOSHA ووكالة حماية البيئة الأمريكية ومنظمة الصحة العالمية) ومن قانون قطر للحرارة، وكل رقم يظهر مع مصدره. وقد يتضرر الأطفال وكبار السن والمرضى عند مستويات أقل. نكتب على الشاشة أنها «إرشاد دولي»، ومنارة غير معتمدة ولا تحلّ محل جهاز معتمد.',
           en: 'They come from international guidance for healthy adults (NIOSH, OSHA, the US EPA, WHO) and from Qatar\'s heat rules, and every number is shown with its source. Children, older people and sick people can be harmed at lower levels. The screen says "international guidance", and MANARA is not certified and does not replace a certified device.' } },
    /* ---------------- dispatch ---------------- */
    { id: 'D1', g: 'dispatch', slide: 9, src: ['S24'],
      q: { ar: 'كيف تختار منارة أيّ مستشفى وأيّ وحدة شرطة وإطفاء تستجيب؟', en: 'How does MANARA choose which hospital, police and fire unit responds?' },
      a: { ar: 'بمَن يصل أسرع بحسب الازدحام، لا بمَن هو أقرب على الخريطة. لكل نوع وحدة (إطفاء/إنقاذ، إسعاف، شرطة) نأخذ كل محطة ونحسب زمن الطريق بخوارزمية ديكسترا على شبكة الطرق: زمن كل طريق = الطول ÷ (السرعة الحرة × الازدحام)، ونحذف الطرق المغلقة، ونتجاوز الوحدات المشغولة، ونختار أقل زمن وصول. ونعرض صاحب المركز الثاني والمسافة ليرى المشغّل السبب (مثلًا: «المحطة ب أبعد بنحو كيلومتر لكنها أسرع بـ 47 ثانية بسبب ازدحام الذروة على الشريان الغربي» — SIM). وللمصاب نختار أقرب مستشفى قادر على استقباله (قسم طوارئ 24 ساعة، صدمات، أطفال) مع افتراض سعة موسوم. المحطات والمستشفيات والمرور في العرض افتراضية ومحاكاة.',
           en: 'By who gets there fastest given traffic — not who is closest on the map. For each unit type (fire/rescue, ambulance, police) we take every station and compute road travel time with Dijkstra over the road graph: each road\'s time is length ÷ (free-flow speed × traffic); closed roads are removed, busy units skipped, and the smallest ETA wins. We show the runner-up and the distance so the operator sees why (for example "Station B is about a kilometre farther but 47 seconds faster because of rush-hour traffic on West Arterial" — SIM). For a patient we choose the nearest hospital that can take them (24-hour emergency department, trauma, paediatric) with a labelled capacity assumption. Stations, hospitals and traffic in the demo are fictional and simulated.' } },
    { id: 'D2', g: 'dispatch', slide: 9, src: ['S28'],
      q: { ar: 'ماذا لو أُغلق طريق أو تغيّر الازدحام والوحدة في الطريق؟', en: 'What if a road is closed or traffic changes while the unit is on its way?' },
      a: { ar: 'يُعاد حساب زمن الوصول كل ثانية، وتُعيد الوحدات في الطريق توجيه نفسها حول الازدحام الجديد، وتُحذف الطرق المغلقة (سيول، حريق، طوق) من الشبكة. وإذا صار مركز أبعد أسرع بهامش واضح، أو أصبحت الوحدة المختارة مشغولة، تعيد منارة الإرسال تلقائيًا وتخبر المشغّل بالسبب. وبعد أمطار أكتوبر 2018 غمرت المياه أنفاقًا في الدوحة (ذا بينينسولا)، فإغلاق طريق يغيّر فعلًا أي جهة هي الأسرع. جرّبوا على شريحة الاستجابة: انقروا طريقًا لتزحموه أو تغلقوه. كله محاكاة، والمرسِل الفعلي 999.',
           en: 'Estimated arrival is recomputed every second, en-route units re-route around new jams, and closed roads (flood, fire, cordon) are removed from the graph. If a farther station becomes faster by a clear margin, or the chosen unit becomes busy, MANARA re-dispatches automatically and tells the operator why. After the October 2018 rain several tunnels in Doha flooded (The Peninsula), so a closed road really does change which unit is fastest. Try it on the dispatch slide: click a road to jam or close it. It is all simulated, and the real dispatcher is 999.' } },
    { id: 'D3', g: 'dispatch', weak: true, slide: 9, src: ['S24'],
      first: { ar: 'المرور في العرض محاكى (SIM)، ولا نملك بيانات مرور حيّة.', en: 'The traffic in the demo is simulated (SIM); we have no live traffic data.' },
      q: { ar: 'هل ادعاء «الأسرع» حقيقي وأنتم تحاكون المرور؟', en: 'Is "fastest responder" real when your traffic is simulated?' },
      a: { ar: 'المرور في العرض محاكاة ونكتب SIM عليه. في الواقع يلزم مزوّد مرور حيّ وبيانات مواقع المركبات من الجهة نفسها، وهذا يحتاج اتفاقًا. اخترنا الترتيب بالدقائق لأن أهداف قطر نفسها بالدقائق: هدف الإسعاف الوصول إلى 75% من البلاغات خلال 10 دقائق في المدن (وكالة الأنباء القطرية 2023). وما نثبته في العرض هو الآلية: أن الخوارزمية تختار الأسرع لا الأقرب حين يتغير الازدحام، لا أن الأزمنة صحيحة في الواقع. ويبقى 999 هو المرسِل.',
           en: 'The traffic in our demo is a simulation, labelled SIM. A real system needs a live traffic provider and the authority\'s own vehicle-location data, which takes an agreement. We rank by minutes because Qatar\'s own targets are in minutes — the ambulance target is to reach 75% of calls within 10 minutes in urban areas (QNA, 2023). What the demo shows is the mechanism — that the algorithm picks the fastest, not the nearest, when traffic changes — not that the times are right in reality. 999 stays the dispatcher.' } },
    { id: 'D4', g: 'dispatch', slide: 9, src: ['S27', 'S72'],
      q: { ar: 'مَن يرسل الوحدات فعلًا؟', en: 'Who actually dispatches?' },
      a: { ar: 'الرقم 999: غرفة عمليات وزارة الداخلية ترسل الدفاع المدني، وخدمة الإسعاف في مؤسسة حمد ترسل الإسعاف. منارة لا تتصل بهم ولا تحلّ محلهم؛ تُعدّ حزمة موثّقة (ماذا، أين، حالة المخارج والطرق، مَن بلا حساب ومَن يحتاج مساعدة) وتوصي بوحدة. وللتوصية حالات: مقترحة ← معتمدة ← مُرسلة ← في الطريق ← في الموقع ← أُنهيت، لكل منها وقتها. والربط الحقيقي بنظام الإرسال لدى الجهة يحتاج اتفاقًا، ولا ندّعي أنه حدث. ولا نعرف التقسيم الداخلي الدقيق بين الجهات لكل نوع حادث، وسنتأكد منه من جهة رسمية.',
           en: '999: the Ministry of Interior\'s control room dispatches Civil Defence, and HMC\'s ambulance service dispatches ambulances. MANARA does not call them or replace them; it prepares a verified package (what, where, exit and road states, who is unaccounted, who needs help) and recommends a unit. A recommendation moves through states — recommended, approved, dispatched, en route, on scene, cleared — each timestamped. Real integration with an authority\'s dispatch system needs an agreement, and we do not claim it exists. We also do not know the exact internal split between bodies for each incident type and would confirm it with an official contact.' } },
    { id: 'D5', g: 'dispatch', slide: 9, src: ['S72', 'S73'],
      q: { ar: 'كيف تختارون المستشفى؟ أليس الأقرب هو الأفضل دائمًا؟', en: 'How do you pick the hospital? Isn\'t the nearest always best?' },
      a: { ar: 'ليس دائمًا: قد لا يملك الأقرب ما يحتاجه المصاب. نستخدم علامات القدرة: قسم طوارئ 24 ساعة، ومركز صدمات من المستوى الأول، وطوارئ أطفال، مع افتراض سعة (أسرّة شاغرة) موسوم كافتراض، ثم نختار الأسرع وصولًا بين من يناسب. تنشر مؤسسة حمد قائمة بمستشفياتها التي لها أقسام طوارئ، وتذكر أن مركز الصدمات في مستشفى حمد العام من المستوى الأول؛ أما الإحداثيات وعدد الأسرّة فلم نجدها منشورة، فمستشفيات العرض افتراضية. وفي الواقع يقرر المسعفون والإسعاف الوجهة.',
           en: 'Not always: the nearest may lack what the patient needs. We use capability flags — 24-hour emergency department, Level I trauma centre, paediatric emergency — plus a capacity assumption (free beds) labelled as an assumption, then pick the fastest among those that fit. HMC publishes which hospitals have emergency departments and that the Trauma Center at Hamad General Hospital is Level I; coordinates and bed counts were not published in what we read, so the demo hospitals are fictional. In reality the paramedics and the ambulance service decide the destination.' } },
    { id: 'D6', g: 'dispatch', weak: true, slide: 9, src: [],
      first: { ar: 'لم نحاكِ حوادث متزامنة كثيرة.', en: 'We have not simulated many simultaneous incidents.' },
      q: { ar: 'ماذا لو وقع حادثان معًا أو كانت الوحدة الأقرب مشغولة؟', en: 'What if two incidents happen at once, or the best unit is busy?' },
      a: { ar: 'لكل وحدة علامة توفر (افتراض موسوم وقابل للتعديل بمفتاح في غرفة العمليات). تُتجاوز الوحدة المشغولة وتُختار التالية الأسرع، وتذكر البطاقة ذلك. لكننا لم نحاكِ حوادث متزامنة كثيرة؛ هذا عمل نظام إرسال حقيقي لدى الجهة (CAD).',
           en: 'Each unit has an availability flag (a labelled, adjustable assumption with a switch in Mission Control). A busy unit is skipped and the next-fastest is chosen, and the card says so. But we have not simulated many simultaneous incidents; that is the job of the authority\'s real dispatch system (CAD).' } },
    /* ---------------- drone ---------------- */
    { id: 'R1', g: 'drone', slide: 11, src: ['S15', 'S16'],
      q: { ar: 'لماذا مسيّرة أصلًا؟', en: 'Why a drone at all?' },
      a: { ar: 'المنتج هو المستشعر الثابت، والمسيّرة اختيارية وتتبع جهة مرخَّصة. ما تضيفه ولا يستطيعه حسّاس ثابت: رؤية الخارج (السطح والشرفات والسلالم الخارجية والطرق المغمورة)، وبحث حراري عن أشخاص في الخارج، وفي حالات الاستغاثة منعش آلي مع بث حي. وتُظهر دراسات دولية (وليست قطرية) أن المسيّرات سبقت الإسعاف في 67% من الحالات الحقيقية (Lancet Digit Health 2023) وبفارق 16:39 دقيقة في رحلات محاكاة (JAMA 2017). ولم نبنِ مسيّرة تطير.',
           en: 'The sentinel is the product; the drone is optional and belongs to a licensed agency. What it adds that a fixed sensor cannot: a view of the outside (roof, balconies, external stairs, flooded roads), a thermal search for people outdoors, and for an SOS an AED with a live view. International studies (not Qatar) found drones beat the ambulance in 67% of real emergencies (Lancet Digit Health 2023) and by 16:39 minutes in simulated flights (JAMA 2017). We built no flying drone.' } },
    { id: 'R2', g: 'drone', weak: true, slide: 11, src: ['S34', 'S39'],
      first: { ar: 'المسيّرة مفهوم فقط، ولم نُطِر أي طائرة.', en: 'The drone is a concept only, and we flew nothing.' },
      q: { ar: 'هل الطيران قانوني؟ والقانون الجديد صارم.', en: 'Is it legal to fly? The new law is strict.' },
      a: { ar: 'القانون رقم 10 لسنة 2026 يضع الترخيص والتسجيل تحت الهيئة العامة للطيران المدني، وبعض المخالفات عقوبتها حتى 7 سنوات وغرامة 300,000 ريال (ذا بينينسولا 2026). لذلك المسيّرة في منارة مفهوم تشغّله جهة مرخَّصة مثل الدفاع المدني — الذي يملك أصلًا مسيّرات إطفاء — وليست جزءًا لازمًا: المستشعر الثابت يعمل بدونها. ولم نُطِر أي مسيّرة ولا نركّب أي أداة إسقاط. وكانت اللوائح التنفيذية للقانون لم تصدر بعد.',
           en: 'Law No. 10 of 2026 puts licensing and registration under the Civil Aviation Authority, with some offences carrying up to seven years and QAR 300,000 (The Peninsula, 2026). So in MANARA the drone is a concept for a licensed agency such as Civil Defence — which already has firefighting drones — and it is optional: the fixed sentinel works without it. We flew nothing and fit no drop device. The law\'s executive regulations were still to be announced.' } },
    { id: 'R3', g: 'drone', slide: 11, src: ['S61', 'S65', 'S68'],
      q: { ar: 'بطارية المسيّرة ومستشعراتكم في حرّ قطر؟', en: 'What about drone battery and your sensors in Qatar\'s heat?' },
      a: { ar: 'المسيّرة لا تقوم بدوريات: المستشعرات الثابتة تراقب 24 ساعة، والمسيّرة تنطلق من قاعدة عند تأكد الخطر ثم تعود للشحن. وفي المحاكاة نخفّض تحمّل البطارية فوق 40 °م (افتراض موسوم). ولمستشعراتنا حدود حرارة أيضًا بحسب صحائفها: MQ-7 حتى 50 °م، وPMS5003 حتى 60 °م، وMLX90640 حتى 85 °م؛ فصندوق مغلق في الشمس يتجاوزها. فتحتاج الأغلفة إلى ظل أو تبريد في صيف قطر، والبطاريات الشائعة مقنَّنة حتى نحو 40 °م. وعند رياح شديدة أو غبار أو حرارة قصوى تبقى المسيّرة في قاعدتها ويستمر المبنى في التنبيه بدونها.',
           en: 'The drone does not patrol: fixed sensors watch 24/7, and the drone launches from a dock only when a danger is confirmed, then returns to charge. In the simulation battery endurance is derated above 40 °C (a labelled assumption). Our sensors have temperature limits too, per their datasheets: MQ-7 up to 50 °C, PMS5003 up to 60 °C, MLX90640 up to 85 °C; a closed box in the sun exceeds them. So enclosures need shade or cooling in a Qatari summer, and common batteries are rated to about 40 °C. In high wind, dust or extreme heat the drone stays docked, and the building keeps alerting without it.' } },
    /* ---------------- people ---------------- */
    { id: 'H1', g: 'people', slide: 8, src: [],
      q: { ar: 'الخصوصية والكاميرات: هل تصوّرون الناس؟', en: 'Privacy and cameras: are you filming people?' },
      a: { ar: 'حسّاس الحرارة 32×24 بكسل: يُظهر جسمًا دافئًا لكنه لا يستطيع التعرّف على وجه. والكاميرا العادية اختيارية، وفي العرض هي كاميرا حاسوب موجَّهة إلى شاشة. النموذج الأولي بلا خادم ولا يرسل شيئًا إلى الإنترنت؛ ولقطات الكشف تبقى في المتصفح على الجهاز نفسه. وتسجيل الحضور يرسل رقم الغرفة والحالة (آمن/أحتاج مساعدة) دون أسماء. وكل السكان في العرض افتراضيون. وفي مبنى حقيقي تحتاج أي كاميرا إلى موافقة المالك ولافتات ومراجعة قانونية.',
           en: 'The thermal sensor is 32×24 pixels: it shows a warm body but cannot identify a face. A normal camera is optional, and in the demo it is a laptop webcam pointed at a screen. The prototype has no server and sends nothing to the internet; detection snapshots stay in the browser on the same device. Check-in sends a room number and a status (safe / I need help), no names. Every resident in the demo is fictional. In a real building any camera needs the owner\'s consent, signage and a legal review.' } },
    { id: 'H2', g: 'people', weak: true, slide: 8, src: [],
      first: { ar: 'لم نجرِ مراجعة قانونية لحماية البيانات.', en: 'We have not done a legal review of data protection.' },
      q: { ar: 'حماية البيانات: مَن يملك سجلّ الاحتياجات (من يحتاج مساعدة)؟', en: 'Data protection: who holds the needs register (who needs help)?' },
      a: { ar: 'السجلّ بالموافقة الطوعية، ويبقى على بوابة المبنى، ويُرسَل إلى الجهة المختصة فقط أثناء حادث موثَّق ضمن بطاقة التسليم. والحد الأدنى من البيانات: الغرفة واللغة والاحتياجات؛ والأسماء غير لازمة. ولا نحفظ مواقع الهاتف ولا نرسلها إلى أي مكان. وفي نشر حقيقي يلزم تدقيق قانوني وفق قواعد قطر لحماية البيانات واتفاقات مع مشغّل المبنى والجهة؛ ولم نُجرِ ذلك بعد.',
           en: 'The register is opt-in and stays on the building gateway; it goes to the authority only during a verified incident, inside the hand-off card. The minimum data is room, language and needs; names are not required. We do not store phone locations or send them anywhere. A real deployment needs a legal review under Qatar\'s data-protection rules and agreements with the building operator and the authority; we have not done that yet.' } },
    { id: 'H3', g: 'people', weak: true, slide: 10, src: [], fill: true,
      first: { ar: 'لم نُجرِ أي اختبار على أشخاص بعد.', en: 'We have not run any test with people yet.' },
      q: { ar: 'أخلاقيات التجارب على البشر: هل اختبرتم الرسائل على أشخاص؟', en: 'Ethics of human-subject tests: have you tested the messages on real people?' },
      a: { ar: 'لم نُجرِ أي اختبار على أشخاص بعد. خطتنا: اختبار فهم مع بالغين أولًا، بموافقة مستنيرة ودون بيانات شخصية، وبعد نيل موافقة أخلاقيات المدرسة، ونعلن النتائج حتى لو لم تساعد البطاقات المصورة. وإلى ذلك الحين الأشخاص في العرض شخصيات افتراضية. (عدّل هذا الجواب بحسب حالة موافقة مدرستك الفعلية.)',
           en: 'We have not run any test with people yet. Our plan: a comprehension test with adults first, with informed consent and no personal data, after school ethics approval, and we will report the results even if the picture cards do not help. Until then the people in the demo are fictional personas. (Edit this answer to match the real status of your school\'s approval.)' } },
    { id: 'H4', g: 'people', slide: 8, src: [],
      q: { ar: 'وماذا عن الناس الذين لا يملكون هاتفًا؟', en: 'What about people with no phone?' },
      a: { ar: 'عدة طبقات لا تحتاج هاتفًا: صفّارة المبنى وأسهم المخارج الذكية، والحارس (سلّم الإيقاظ يرسل له قائمة أولويات بعد 60 ثانية ويطرق الأبواب)، وجهاز المعلمة للتلاميذ، ونقطة تسجيل الحضور دون إنترنت «MANARA-SAFE». لم نقِس نسبة من تصلهم كل طبقة؛ وفي المحاكاة نسبة من لديهم صفحة الهاتف شريط افتراض (85% افتراضيًا) يمكن تغييره، وهو افتراض لا قياس.',
           en: 'Several layers need no phone: the building siren and smart exit arrows, the guard (the wake-up ladder sends the guard a priority list at 60 seconds and the guard knocks on doors), the teacher\'s tablet for pupils, and the offline check-in point "MANARA-SAFE". We have not measured what share of people each layer reaches; in the simulation the share who have the phone page is an adjustable assumption (85% by default), not a measurement.' } },
    { id: 'H5', g: 'people', weak: true, slide: 8, src: ['S23'],
      first: { ar: 'اللغات الست مسودات تنتظر مراجعة متحدث أصلي.', en: 'The six community languages are drafts awaiting native-speaker review.' },
      q: { ar: 'هل ترجماتكم موثوقة؟ ولماذا هذه اللغات؟', en: 'Are your translations reliable? Why these languages?' },
      a: { ar: 'العربية والإنجليزية كاملتان. اللغات الست (المالايالامية، النيبالية، البنغالية، الأردية، التاغالوغية، الهندية) مسودات مكتوب عليها «تحتاج مراجعة متحدث أصلي» حتى يوقّع عليها مراجع، ونسجّل ذلك في التقرير. اخترناها لأن أكبر الجاليات بحسب تقديرات السفارات 2015–2017 من الهند ونيبال وبنغلاديش والفلبين وباكستان؛ وجالية سريلانكا (سنهالية وتاميلية) خارج المجموعة حاليًا ونذكر ذلك. البطاقات المصورة تحمل الرسالة الأساسية للجميع، ولا نستخدم ترجمة آلية حيّة أبدًا.',
           en: 'Arabic and English are complete. The six community languages (Malayalam, Nepali, Bengali, Urdu, Tagalog, Hindi) are drafts marked "needs native-speaker review" until a reviewer signs off, and the report logs this. We chose them because the largest communities in the 2015–2017 embassy estimates (not official figures) come from India, Nepal, Bangladesh, the Philippines and Pakistan; the Sri Lankan community (Sinhala, Tamil) is not yet covered and we say so. Picture cards carry the core message for everyone, and we never use live machine translation.' } },
    { id: 'H6', g: 'people', slide: 8, src: ['S57', 'S37'],
      q: { ar: 'ماذا عن الصمّ والمكفوفين؟ والوميض قد يسبب نوبات.', en: 'What about Deaf and blind residents? Flashing light can trigger seizures.' },
      a: { ar: 'يحصل الصمّ على اهتزاز قوي ونص ورموز، ووميض اختياري؛ والوميض مغلق افتراضيًا مع تحذير من الحساسية الضوئية، ولا يتجاوز 3 وميضات في الثانية (معيار WCAG 2.3.1). ويحصل المكفوفون على رسالة صوتية. ولا ندّعي ترجمة لغة الإشارة (لدى فريق قطري مشروع ذكاء اصطناعي لذلك). وللصمّ قناة إلى غرفة العمليات عبر الرقم 992 (وزارة الداخلية)، لكنها لا توقظ نائمًا ولا تدلّه على المخرج. وخطتنا مراجعة بطاقات الشخصيات مع صمّ ومكفوفين (مثلًا عبر مدى) — مخطَّطة لم تتم.',
           en: 'Deaf residents get strong vibration, text and pictograms, with an optional strobe; the strobe is off by default with a photosensitivity warning and is limited to three flashes per second (WCAG 2.3.1). Blind residents get a voice message. We claim no sign-language translation (a Qatari team has an AI project for that). Deaf residents have a channel to the control room through 992 (Ministry of Interior), but it does not wake a sleeper or show the exit. We plan to review the persona cards with Deaf and blind users (for example through Mada) — planned, not done.' } },
    { id: 'H7', g: 'people', slide: 8, src: [],
      q: { ar: 'والأطفال في المدرسة؟', en: 'And children at school?' },
      a: { ar: 'لا نعتمد على هاتف الطفل: يُحصى التلاميذ على جهاز المعلمة، وتخبرهم بطاقة مصورة بأن يتبعوا معلمهم، وتصل رسالة إلى هاتف الأم. وأي تجربة مع تلاميذ حقيقيين تحتاج شراكة مع المدرسة وموافقة أولياء الأمور وموافقة الأخلاقيات؛ وكل ما في العرض افتراضي.',
           en: 'We do not rely on the child\'s phone: pupils are counted on the teacher\'s tablet, a picture card tells them to follow their teacher, and a message goes to the mother\'s phone. Any trial with real pupils needs a school partnership, parental consent and ethics approval; everything in the demo is fictional.' } },
    /* ---------------- build ---------------- */
    { id: 'B1', g: 'build', slide: 11, src: [], fill: true,
      q: { ar: 'ماذا بنيتَ بنفسك، وماذا اشتريت، ومَن ساعدك؟', en: 'What did YOU build, what did you buy, and who helped?' },
      a: { ar: 'اشتريت اللوحات والمستشعرات (ESP32 وMLX90640 وMQ-2 وSHT31…) والمكتبات. وبنيتُ [اذكر ما بنيته أنت: محاكاة، كاشف الصور، الصفحات، توصيل اللوحة]. وساعدني [اسم المرشد] في [المهمة]، واستعنت بأدوات ذكاء اصطناعي في بعض الشيفرة والصياغة مذكورة في جدول الملكية بالتقرير. أستطيع شرح كل معادلة وتغيير أي عتبة أمامكم. (املأ الأقواس بالحقيقة قبل أن تقول هذا.)',
           en: 'I bought the boards and sensors (ESP32, MLX90640, MQ-2, SHT31…) and the libraries. I built [say what you built: the simulation, the image detector, the pages, the board wiring]. [Mentor\'s name] helped me with [task], and I used AI tools for parts of the code and wording, listed in the report\'s ownership table. I can explain every formula and change any threshold in front of you. (Fill the brackets with the truth before you say this.)' } },
    { id: 'B2', g: 'build', slide: 11, src: [], fill: true,
      q: { ar: 'هل استخدمتم أدوات ذكاء اصطناعي في المشروع؟', en: 'Did you use AI tools on this project?' },
      a: { ar: 'نعم، ونذكر ذلك صراحةً. ساعدتنا أدوات ذكاء اصطناعي في صياغة أجزاء من الشيفرة والنصوص ومسودات الترجمة؛ أما القرارات، والاختبارات، والتحقق من كل رقم ومصدره، ومراجعة اللغتين العربية والإنجليزية، فعملنا [اذكر مَن راجع]. وكل ذلك مدرج في جدول «بنيت / اشتريت / ساعدني» بالتقرير، واللغات الست مسودات. أستطيع فتح أي ملف وشرحه. (املأ الأقواس بالحقيقة.)',
           en: 'Yes, and we say so openly. AI tools helped draft parts of the code, the text and the draft translations; the decisions, the testing, checking every number against its source, and reviewing the Arabic and English were our work [say who reviewed]. All of it is listed in the report\'s "built / bought / helped by" table, and the six community languages are drafts. I can open any file and explain it. (Fill the brackets with the truth.)' } },
    { id: 'B3', g: 'build', slide: 11, src: ['S68'],
      q: { ar: 'كم التكلفة؟ ومَن يدفع؟', en: 'How much does it cost, and who pays?' },
      a: { ar: 'قائمة القطع في صفحة البناء بتقديرات بالدولار؛ أغلى قطعة الكاميرا الحرارية بـ 74.95 دولارًا (Adafruit، أكتوبر 2026) ومعظم الباقي بضعة دولارات، والشحن والجمارك إلى قطر غير مشمولين. هذه تكلفة نموذج أولي. أما منتج معتمد ومركَّب ومُصان فتكلفته أعلى (اعتماد وتركيب ومراقبة) ولم نسعّره، فلن نذكر رقمًا. ومَن يدفع: مشغّل المبنى أو صاحب العمل (سكن العمال ملزَم أصلًا بإنذارات بالقانون)، وربما عبر خدمة مراقبة إنذارات.',
           en: 'The parts list on the Build page gives US-dollar estimates; the biggest single part is the thermal camera at US$ 74.95 (Adafruit, October 2026), most of the rest are a few dollars, and shipping and customs to Qatar are not included. That is a prototype\'s cost. A certified, installed and maintained product costs more (certification, installation, monitoring); we have not priced it, so we will not quote a number. Who pays: the building operator or employer (workers\' accommodation must already have alarms by law), possibly through an alarm-monitoring service.' } },
    { id: 'B4', g: 'build', weak: true, slide: 11, src: [],
      first: { ar: 'لم نختبر التوسّع إلى مدينة.', en: 'We have not tested scaling to a city.' },
      q: { ar: 'هل يتوسّع إلى مدينة كاملة؟', en: 'Does it scale to a whole city?' },
      a: { ar: 'اليوم مبنى واحد؛ والمسار نفسه لكل منطقة. في المحاكاة نشغّل كتلة حيّ واحدة (96×64 خلية) فيها نحو 120 مقيمًا ومدرسة وموقع عمل. والتوسع إلى مدينة يحتاج اختبارات حمل، وتصميم بوابة لكل مبنى، وتكاملًا مع أنظمة الجهة؛ ولم نفعل ذلك. البنية: حسّاسات ← بوابة المبنى ← لوحة المشغّل ← حزمة للجهة.',
           en: 'Today one building; the pipeline is the same per zone. In the simulation we run one district block (96×64 cells) with about 120 residents, a school and a worksite. Scaling to a city needs load tests, a gateway design per building and integration with the authority\'s systems; we have not done that. The architecture: sentinels → building gateway → operator console → package to the authority.' } },
    { id: 'B5', g: 'build', weak: true, slide: 11, src: ['S60'],
      first: { ar: 'لم نجرِ اختبار صيانة طويل الأمد.', en: 'We have not run a long-term maintenance test.' },
      q: { ar: 'مَن يصيّن الحسّاسات؟ وماذا لو تعطّل أحدها؟', en: 'Who maintains the sensors? What if one fails?' },
      a: { ar: 'تُرسل الحسّاسات نبضًا دوريًا ونفحص «الحسّاس العالق» (في غرفة العمليات اختبار حسّاس معطَّل). لكن الصيانة الحقيقية عمل حقيقي: حسّاسات الغاز تنجرف وتحتاج معايرة واستبدالًا، والبطاريات تشيخ أسرع في الحرارة، والبرمجيات تحتاج تحديثًا. لم نُجرِ اختبارًا طويل الأمد؛ وستنتج التجربة الميدانية خطة صيانة.',
           en: 'Sentinels report a heartbeat and we check for a stuck sensor (Mission Control has a "faulty sentinel" test). But real maintenance is real work: gas sensors drift and need calibration and replacement, batteries age faster in heat, and firmware needs updates. We have not run a long-term test; a field pilot would produce a maintenance plan.' } },
    { id: 'B6', g: 'build', slide: 11, src: [],
      q: { ar: 'وماذا لو انقطعت الشبكة؟', en: 'What if the network is down?' },
      a: { ar: 'إنذار الحسّاس وأسهم المخارج يعملان على اللوحة نفسها دون شبكة. وتسجيل الحضور يعمل عبر نقطة وايفاي دون إنترنت «MANARA-SAFE». وتُحفظ حزمة التسليم في الانتظار حتى تعود الشبكة. وعرضنا كله يعمل من ملفات دون إنترنت. ما يتعطل دون شبكة: تنبيهات الهواتف خارج الوايفاي المحلي، والربط بالجهة.',
           en: 'The sentinel\'s alarm and exit arrows run on the board itself, no network needed. Check-in works through an offline Wi-Fi access point, "MANARA-SAFE". The hand-off package waits in a queue until a link returns. Our whole demo runs from files with no internet. What fails without a network: phone alerts beyond the local Wi-Fi, and the link to the authority.' } },
    { id: 'B7', g: 'build', weak: true, slide: 11, src: [],
      first: { ar: 'لم نختبر سلوك اللوحة عند انقطاع الكهرباء.', en: 'We have not tested the board\'s behaviour in a power cut.' },
      q: { ar: 'وماذا لو انقطعت الكهرباء؟', en: 'What if the power fails?' },
      a: { ar: 'الحارس الحقيقي يحتاج بطارية احتياطية وإنذارًا عند فقد التيار. لوحة العرض تعمل من USB ولم نختبر سلوكها عند الانقطاع. نضعها ضمن حدودنا، وستحتاج إلى بطارية وتصميم خاص بالحرارة في أي نشر.',
           en: 'A real sentinel needs a battery backup and a power-loss alert. The booth board runs from USB power and we have not tested its behaviour in an outage. We list it among our limits; any deployment needs a battery and a heat-aware design.' } },
    { id: 'B8', g: 'build', weak: true, slide: 11, src: [],
      first: { ar: 'ليس لدينا توقيع تشفيري للرسائل بعد.', en: 'We do not have cryptographic message signing yet.' },
      q: { ar: 'وماذا لو اختُرق حسّاس أو أُرسل تنبيه مزوَّر؟', en: 'What if a sensor is hacked or a fake alert is sent?' },
      a: { ar: 'خطر حقيقي. في النموذج الأولي يحدّ من الضرر وجود مفتاحين مستقلين وموافقة إنسان، لكن لا يوجد بعد توقيع تشفيري للرسائل ولا ضبط وصول، وسيكون لازمًا قبل أي نشر حقيقي. ندرجه ضمن حدودنا.',
           en: 'A real risk. In the prototype, two independent keys and a human approval limit the damage, but there is no cryptographic message signing or access control yet, and both would be required before any real deployment. We list it among our limitations.' } },
    { id: 'B9', g: 'build', weak: true, slide: 10, src: [],
      first: { ar: 'سأبدأ بحدودنا قبل أن تسألوا.', en: 'I will start with our limits before you ask.' },
      q: { ar: 'ما أكبر حدود مشروعكم؟', en: 'What are the biggest limitations of your project?' },
      a: { ar: 'عيّنات الاختبار صغيرة، وكاشف الصور يصيب 66.7% فقط؛ والحسّاسات رخيصة وقراءاتها استرشادية؛ والمرور والسكان والمحطات في المحاكاة افتراضية؛ والمسيّرة مفهوم؛ واللغات الست مسودات؛ ولم نجرّب على حرائق حقيقية ولا على أشخاص؛ والمشروع غير معتمد ولا يحلّ محل أي جهاز أو جهة. ونحبّ أن نسمع أين ترون نقاط ضعف أخرى.',
           en: 'The test samples are small and the image detector is right only 66.7%; the sensors are cheap and their readings indicative; traffic, residents and stations in the simulation are fictional; the drone is a concept; the six community languages are drafts; we have not tested on real fires or on people; and the project is not certified and replaces no device or body. We would like to hear where you see other weak spots.' } },
    { id: 'B10', g: 'build', slide: 12, src: [],
      q: { ar: 'ما خطوتكم التالية؟ وماذا تحتاجون منا؟', en: 'What is your next step, and what do you need from us?' },
      a: { ar: 'أولًا مراجعة اللغات من متحدثين أصليين؛ ثانيًا معايرة الحسّاسات وجدول لزمن الاستجابة؛ ثالثًا اختبار الفهم بموافقة أخلاقية؛ رابعًا تمرين في مبنى واحد مع حارسه ومراجعة الدفاع المدني. ونطلب منكم: توجيهًا وتصريحًا لتمرين آمن، ومراجعين للغات ومن الصمّ والمكفوفين، وإرشادًا لنيل موافقة الأخلاقيات.',
           en: 'First native-speaker review of the languages; second sensor calibration and a latency table; third the comprehension test with ethics approval; fourth a drill in one building with its guard and a Civil Defence review. We ask you for guidance and permission for a safe drill, reviewers for the languages and Deaf and blind reviewers, and advice on getting ethics approval.' } }
  ];

  /* ==========================================================================
     SLIDE PARTS BUILT FROM DATA  (text via textContent / DOM only)
     ========================================================================== */
  var MINE = jget('manara-pitch-mine', {});   // presenter details + the student's own measured numbers
  if (!MINE || typeof MINE !== 'object') MINE = {};
  function mine(k) { var v = MINE[k]; return typeof v === 'string' ? v.trim().slice(0, 90) : ''; }
  function setKids(el) { el.replaceChildren(); for (var i = 1; i < arguments.length; i++) add(el, arguments[i]); return el; }
  function parseSvgIcon(name) { return iconNode(name); }
  function nestedIcon(name, x, y, size, attrs) {
    var s = parseSvgIcon(name); s.setAttribute('x', x); s.setAttribute('y', y); s.setAttribute('width', size); s.setAttribute('height', size);
    if (attrs) for (var k in attrs) s.setAttribute(k, attrs[k]);
    s.removeAttribute('class'); return s;
  }

  /* ---- 1. title art: the lighthouse ---- */
  function buildBeacon() {
    var host = $('#ti-art'); if (!host) return;
    var svg = sv('svg', { viewBox: '0 0 400 480', focusable: 'false' });
    var stop = function (o, a, side) { return sv('stop', { offset: o, style: 'stop-color:var(--fire-1);stop-opacity:' + a }); };
    svg.appendChild(sv('defs', null,
      sv('linearGradient', { id: 'bcg1', x1: '0', y1: '0', x2: '1', y2: '0' }, stop('0', '.85'), stop('1', '0')),
      sv('linearGradient', { id: 'bcg2', x1: '1', y1: '0', x2: '0', y2: '0' }, stop('0', '.85'), stop('1', '0')),
      sv('radialGradient', { id: 'bcr', cx: '.5', cy: '.5', r: '.5' }, stop('0', '.9'), stop('1', '0'))));
    // stars (deterministic)
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (var i = 0; i < 16; i++) svg.appendChild(sv('circle', { class: 'bc-star', cx: (10 + rnd() * 380).toFixed(0), cy: (8 + rnd() * 150).toFixed(0), r: (1 + rnd() * 1.6).toFixed(1), style: 'animation-delay:' + (rnd() * 3).toFixed(1) + 's' }));
    // hazard ring
    [25, 50, 75, 105, 130, 155].forEach(function (deg, k) {
      var a = deg * Math.PI / 180, cx = 200 + 128 * Math.cos(a), cy = 168 - 128 * Math.sin(a), ids = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
      var g = sv('g', { class: 'bc-hz', style: '--i:' + k });
      g.appendChild(sv('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 18, fill: 'var(--surface)', stroke: 'var(--brand)', 'stroke-width': 1.5 }));
      g.appendChild(nestedIcon(HZ_ICON[ids[k]], (cx - 10).toFixed(1), (cy - 10).toFixed(1), 20, { style: 'color:var(--brand)' }));
      svg.appendChild(g);
    });
    // beams
    svg.appendChild(sv('g', { class: 'bc-beam' }, sv('polygon', { points: '200,150 410,92 410,208', fill: 'url(#bcg1)' })));
    svg.appendChild(sv('g', { class: 'bc-beam b2' }, sv('polygon', { points: '200,150 -10,92 -10,208', fill: 'url(#bcg2)' })));
    svg.appendChild(sv('circle', { cx: 200, cy: 150, r: 52, fill: 'url(#bcr)' }));
    // rock + tower
    svg.appendChild(sv('path', { d: 'M110 436 Q200 402 290 436 L318 480 L82 480 Z', fill: 'var(--surface-3)', stroke: 'var(--line-2)' }));
    var lx = function (y) { return 169 + (430 - y) / 256 * 14; }, rx = function (y) { return 231 - (430 - y) / 256 * 14; };
    svg.appendChild(sv('polygon', { points: lx(430) + ',430 ' + rx(430) + ',430 ' + rx(174) + ',174 ' + lx(174) + ',174', fill: 'var(--surface)', stroke: 'var(--line-2)', 'stroke-width': 2 }));
    [[400, 360], [320, 280], [240, 200]].forEach(function (b) {
      svg.appendChild(sv('polygon', { points: lx(b[0]) + ',' + b[0] + ' ' + rx(b[0]) + ',' + b[0] + ' ' + rx(b[1]) + ',' + b[1] + ' ' + lx(b[1]) + ',' + b[1], fill: 'var(--brand)', opacity: '.92' }));
    });
    svg.appendChild(sv('rect', { x: 174, y: 166, width: 52, height: 8, rx: 2, fill: 'var(--ink-2)' }));
    svg.appendChild(sv('rect', { x: 186, y: 134, width: 28, height: 32, rx: 4, fill: 'var(--fire-1)', stroke: 'var(--ink-2)', 'stroke-width': 2 }));
    svg.appendChild(sv('circle', { cx: 200, cy: 150, r: 6, fill: 'var(--surface)' }));
    svg.appendChild(sv('path', { d: 'M180 134 L200 110 L220 134 Z', fill: 'var(--ink-2)' }));
    svg.appendChild(sv('rect', { x: 194, y: 392, width: 12, height: 38, rx: 3, fill: 'var(--bg-2)', stroke: 'var(--line-2)' }));
    // sea
    [446, 458, 470].forEach(function (y, k) { svg.appendChild(sv('path', { class: 'bc-wave', style: 'animation-delay:-' + k * 2 + 's', d: 'M20 ' + y + ' q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, opacity: (0.5 - k * 0.1).toFixed(2) })); });
    host.replaceChildren(svg);
  }

  /* ---- 3. gap lists, 4. pipeline ---- */
  function buildGap() {
    var l1 = $('#gp-list'), l2 = $('#gp-unknown');
    if (l1) { l1.replaceChildren(); GAP_HAVE.forEach(function (g) { l1.appendChild(h('li', null, iconNode('check'), h('span', null, bio(g), g.src ? h('small', null, g.src) : null))); }); }
    if (l2) { l2.replaceChildren(); GAP_UNKNOWN.forEach(function (g) { l2.appendChild(h('li', null, iconNode(g.i), h('span', null, bio(g)))); }); }
  }
  function buildPipe() {
    var ol = $('#pipe'); if (!ol) return;
    ol.replaceChildren(h('i', { class: 'pipe-dot', 'aria-hidden': 'true' }));
    PIPE.forEach(function (p, k) {
      var v = h('span', { class: 'pipe-v' });
      v.appendChild(h('span', { 'data-l': 'ar' }, p.v[0], h('small', null, p.v[1])));
      v.appendChild(h('span', { 'data-l': 'en' }, p.v[1], h('small', null, p.v[0])));
      ol.appendChild(h('li', { style: '--i:' + k + ';--c:var(' + p.c + ')' },
        h('span', { class: 'pipe-ico' }, iconNode(p.i), h('span', { class: 'pipe-n num' }, String(k + 1))), v, h('span', { class: 'pipe-d' }, bio(p.d))));
    });
  }

  /* ---- 6. six hazards ---- */
  function buildHazards() {
    var g = $('#hz-grid'); if (!g) return;
    g.replaceChildren();
    HZ.forEach(function (z) {
      var tag = z.tag === 'live'
        ? h('span', { class: 'tag safe hz-tag' }, bi('مستشعر على الطاولة', 'Table sensor'))
        : h('span', { class: 'tag warn hz-tag' }, 'SIM');
      g.appendChild(h('article', { class: 'hz sl-in', 'data-hz': z.id },
        h('div', { class: 'hz-top' }, h('span', { class: 'hz-ico' }, iconNode(HZ_ICON[z.id])), h('h3', { class: 'hz-name' }, bi(z.ar, z.en)), tag),
        h('p', null, h('b', null, bi('المفتاحان: ', 'Two keys: ')), bio(z.keys)),
        h('p', null, h('b', null, bi('الإجراء: ', 'Action: ')), bio(z.act)),
        h('p', { class: 'hz-fact' }, bio(z.fact))));
    });
  }

  /* ---- 7. live moment: the five steps ---- */
  function buildLiveSteps() {
    var ol = $('#lv-steps'); if (!ol) return;
    ol.replaceChildren();
    LIVE.forEach(function (s) { ol.appendChild(h('li', null, h('span', null, h('b', null, bio(s.title)), h('small', null, bio(s.tip))))); });
  }

  /* ---- 8. people ---- */
  function buildPeople() {
    var g = $('#pe-grid'); if (g) {
      g.replaceChildren();
      PERSONAS.forEach(function (p) {
        var phone = h('div', { class: 'pe-phone', 'aria-hidden': 'true' },
          h('span', { class: 'pe-badge' }, bio(p.badge)), h('span', { class: 'pe-line' }), h('span', { class: 'pe-line w2' }), h('span', { class: 'pe-line w3' }),
          h('span', { class: 'pe-pic' }, iconNode(p.pic)));
        g.appendChild(h('article', { class: 'pe sl-in', 'data-p': p.id, style: '--pc:var(' + p.c + ')' }, phone,
          h('div', { class: 'pe-info' }, h('h3', { class: 'pe-name' }, bi(p.ar, p.en)), h('p', { class: 'pe-need' }, bio(p.need)), h('p', { class: 'pe-do' }, bio(p.do)))));
      });
    }
    var l = $('#ladder'); if (l) { l.replaceChildren(); LADDER.forEach(function (s, k) { l.appendChild(h('li', { style: '--i:' + k }, h('b', { dir: 'ltr' }, s.t), bio(s))); }); }
    var lg = $('#langs'); if (lg) {
      lg.replaceChildren();
      LANGS.forEach(function (x) { lg.appendChild(h('li', { class: x.k }, x.t)); });
      lg.appendChild(h('li', { class: 'legend' }, bi('المنقّطة مسودات بانتظار مراجعة متحدث أصلي', 'Dashed = drafts awaiting native-speaker review')));
    }
  }
  /* ---- 11. build + plug-in ---- */
  function buildBuild() {
    var s = $('#sentinel'); if (s) {
      s.replaceChildren();
      s.appendChild(h('div', { class: 'sn-core' }, 'ESP32', h('small', null, bi('الإنذار المحلي لا ينتظر الشبكة', 'the local alarm never waits for the network'))));
      SENSORS.forEach(function (x) { s.appendChild(h('div', { class: 'sn-chip' }, iconNode(x.i), h('span', null, h('b', null, x.t), h('small', null, bio(x.s))))); });
      OUTPUTS.forEach(function (x) { s.appendChild(h('div', { class: 'sn-chip out' }, iconNode(x.i), h('span', null, bio(x.t)))); });
    }
    var p = $('#plug'); if (p) {
      p.replaceChildren();
      PLUG.forEach(function (r) {
        p.appendChild(h('li', null,
          h('span', { class: 'plug-what' }, h('b', null, bio(r.from[0])), h('small', null, bio(r.from[1]))),
          h('span', { class: 'plug-arrow', 'aria-hidden': 'true' }),
          h('span', { class: 'plug-to' }, h('b', null, bio(r.to[0])), h('small', null, bio(r.to[1])))));
      });
    }
  }

  /* ---- 12. roadmap + ask ---- */
  function buildClose() {
    var r = $('#road'); if (r) {
      r.replaceChildren();
      ROAD.forEach(function (c) { r.appendChild(h('li', null, h('b', null, bio(c.h)), h('ul', null, c.items.map(function (it) { return h('li', null, bio(it)); })))); });
    }
    var a = $('#ask'); if (a) { a.replaceChildren(); ASK.forEach(function (x) { a.appendChild(h('li', null, iconNode('star'), h('span', null, bio(x)))); }); }
  }
  function buildDpHow() {
    var ol = $('#dp-how'); if (!ol) return;
    ol.replaceChildren(); DP_HOW.forEach(function (x) { ol.appendChild(h('li', null, bio(x))); });
  }

  /* ---- presenter details on the title slide + the "not yet" column (the student's own numbers) ---- */
  var EV_TODO = [
    { k: 'flames', ar: 'اختبار على حرائق حقيقية', en: 'Real-fire tests', na: { ar: 'غير متاح — اللهب ممنوع وخطير', en: 'N/A — flames are banned and dangerous' } },
    { k: 'comprehension', ar: 'اختبار الفهم مع أشخاص', en: 'Comprehension test with people', na: { ar: 'لم يُجرَ — يحتاج موافقة أخلاقيات وموافقة المشاركين', en: 'Not run — needs ethics approval and participant consent' } },
    { k: 'latency', ar: 'زمن استجابة اللوحة (من الكشف إلى الأسهم)', en: 'Board latency (detection to exit arrows)', na: { ar: 'غير مقيس بعد', en: 'Not measured yet' } },
    { k: 'falsealarm', ar: 'معدل الإنذارات الكاذبة على مدى أيام', en: 'False-alarm rate over days', na: { ar: 'غير مقيس بعد', en: 'Not measured yet' } },
    { k: 'review', ar: 'مراجعة اللغات الست من متحدثين أصليين', en: 'Native-speaker review of the six languages', na: { ar: 'لم تتم', en: 'Not done' } },
    { k: 'link', ar: 'الربط مع 999 وأنظمة الجهات', en: 'Link to 999 and authority systems', na: { ar: 'غير موصول — يحتاج اتفاقات', en: 'Not connected — needs agreements' } }
  ];
  function renderMine() {
    var by = $('.ti-by');
    if (by) {
      var names = mine('names'), school = mine('school'), team = mine('team');
      var who = [names || team, school].filter(Boolean).join(' — ');
      by.hidden = !who;
      by.replaceChildren(); if (who) { by.appendChild(bi('يقدّمه: ', 'Presented by: ')); by.appendChild(h('b', null, who)); }
    }
    var ul = $('#ev-todo');
    if (ul) {
      ul.replaceChildren();
      EV_TODO.forEach(function (x) {
        var v = ({ comprehension: mine('comprehension'), latency: mine('latency'), falsealarm: mine('falsealarm'), review: mine('review') })[x.k] || '';
        ul.appendChild(h('li', null, h('b', null, bio(x)), ': ', v ? h('span', { class: 'mine' }, v, ' ', h('small', null, bi('(قياسنا)', '(our own)'))) : h('span', { class: 'na' }, bio(x.na))));
      });
    }
  }

  /* ==========================================================================
     SLIDE 5 · PROOF BEFORE PANIC  (interactive two-key + human logic)
     ========================================================================== */
  var PF = { k1: false, k2: false, k3: false };
  var PF_TEXT = {
    clear: { ar: 'لا شيء مؤكَّد. الحسّاسات تراقب.', en: 'Nothing confirmed. The sensors keep watching.' },
    suspect1: { ar: 'اشتباه فقط: مفتاح واحد (الحرارة). لا تنبيه عام — قد يكون كوبًا ساخنًا.', en: 'SUSPECT only: one key (heat). No public alert — it could be a hot mug.' },
    suspect2: { ar: 'اشتباه فقط: مفتاح واحد (دخان/رؤية). لا تنبيه عام — قد يكون بخارًا أو فيديو.', en: 'SUSPECT only: one key (smoke / vision). No public alert — it could be steam or a video.' },
    confirmed: { ar: 'مؤكَّد بمفتاحين مستقلين. بانتظار الإنسان: اضغط «اعتماد» ليخرج التنبيه العام.', en: 'CONFIRMED by two independent keys. Waiting for the human: tap Approve to release the public alert.' },
    public: { ar: 'تنبيه عام: رسالة شخصية لكل شخص في المنطقة المتأثرة، وحزمة موثّقة إلى الجهات (999).', en: 'Public alert: a personal message to everyone in the affected zone, and a verified package to the authorities (999).' }
  };
  var PF_BADGE = { clear: ['صافٍ', 'CLEAR'], suspect: ['اشتباه', 'SUSPECT'], confirmed: ['مؤكَّد', 'CONFIRMED'], public: ['تنبيه عام', 'PUBLIC ALERT'] };
  function pfState() { if (PF.k1 && PF.k2) return PF.k3 ? 'public' : 'confirmed'; if (PF.k1 || PF.k2) return 'suspect'; return 'clear'; }
  function pfRender() {
    var st = pfState();
    $$('.pf-key').forEach(function (b) { b.setAttribute('aria-pressed', PF[b.getAttribute('data-key')] ? 'true' : 'false'); });
    var human = $('.pf-human'); if (human) human.disabled = !(PF.k1 && PF.k2);
    var badge = $('#pf-badge');
    if (badge) { badge.setAttribute('data-state', st); setKids(badge, bi(PF_BADGE[st][0], PF_BADGE[st][1])); }
    var order = ['clear', 'suspect', 'confirmed', 'public'], idx = order.indexOf(st);
    $$('.pf-steps i').forEach(function (i, k) { i.classList.toggle('on', k <= idx); });
    var tx = $('#pf-text');
    if (tx) { var key = st === 'suspect' ? (PF.k1 ? 'suspect1' : 'suspect2') : st; setKids(tx, bio(PF_TEXT[key])); }
  }
  function initProof() {
    $$('.pf-key[data-ico],.pf-key-ico').forEach(function (el) { var n = el.getAttribute('data-ico'); if (n && !el.firstChild) el.appendChild(iconNode(n)); });
    $$('.pf-key').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-key'); PF[k] = !PF[k];
        if (!(PF.k1 && PF.k2)) PF.k3 = false;
        pfRender();
      });
    });
    $$('[data-decoy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.getAttribute('data-decoy');
        PF.k3 = false;
        if (d === 'mug') { PF.k1 = true; PF.k2 = false; } else if (d === 'video') { PF.k1 = false; PF.k2 = true; } else { PF.k1 = PF.k2 = false; }
        pfRender();
      });
    });
    pfRender();
  }

  /* ==========================================================================
     SLIDE 7 · BACKUP: the building in section (illustration; the real routes come from Mission Control)
     ========================================================================== */
  var BL = { locked: false, safe: false };
  var bldEl = {};
  function buildBuilding() {
    var host = $('#bld'); if (!host) return;
    var svg = sv('svg', { viewBox: '0 0 520 330', role: 'img', 'aria-labelledby': 'bld-d', focusable: 'false' });
    var desc = h('span', { id: 'bld-d' }, bi('رسم توضيحي لمبنى من ثلاثة طوابق بدرجين وباب سطح؛ النار في الطابق الأرضي، ورافي في الطابق الأول، وأبو سالم في الثاني. عند قفل الدرج «أ» ينقلب مسار رافي إلى الدرج «ب».', 'An illustration of a three-floor building with two stairs and a roof door; the fire is on the ground floor, Ravi on the first floor and Abu Salem on the second. When Stair A is locked, Ravi\'s route flips to Stair B.', 'span', 'sr-only'));
    var T1 = function (x, y, ar, en, cls, anchor) { var g = svBi(ar, en, { x: x, y: y, class: 'bd-txt ' + (cls || ''), 'text-anchor': anchor || 'middle' }); return g; };
    svg.appendChild(sv('rect', { class: 'bd-wall', x: 70, y: 56, width: 380, height: 246, rx: 6 }));
    svg.appendChild(sv('line', { class: 'bd-floor', x1: 70, y1: 138, x2: 450, y2: 138 }));
    svg.appendChild(sv('line', { class: 'bd-floor', x1: 70, y1: 220, x2: 450, y2: 220 }));
    [56, 138, 220].forEach(function (y) { [112, 186, 260, 334].forEach(function (x) { svg.appendChild(sv('rect', { class: 'bd-room', x: x + 2, y: y + 4, width: 70, height: 74, rx: 4 })); }); });
    bldEl.stairA = sv('rect', { class: 'bd-stair', x: 70, y: 56, width: 42, height: 246 });
    bldEl.stairB = sv('rect', { class: 'bd-stair', x: 408, y: 56, width: 42, height: 246 });
    svg.appendChild(bldEl.stairA); svg.appendChild(bldEl.stairB);
    svg.appendChild(T1(91, 78, 'درج أ', 'Stair A', 'big')); svg.appendChild(T1(429, 78, 'درج ب', 'Stair B', 'big'));
    bldEl.lock = sv('g', { class: 'bd-lock', style: 'display:none' }, sv('text', { x: 91, y: 120, 'text-anchor': 'middle', 'font-size': 22 }, '×'), svBi('مقفل', 'LOCKED', { x: 91, y: 140, 'text-anchor': 'middle', class: 'bd-txt', fill: 'var(--danger)' }));
    svg.appendChild(bldEl.lock);
    // roof door + balcony + exits
    svg.appendChild(sv('rect', { x: 412, y: 40, width: 34, height: 16, rx: 3, fill: 'var(--surface-3)', stroke: 'var(--line-2)' }));
    svg.appendChild(T1(429, 32, 'باب السطح', 'Roof door'));
    svg.appendChild(sv('rect', { x: 450, y: 88, width: 44, height: 40, rx: 4, fill: 'color-mix(in oklab,var(--safe) 20%,var(--surface))', stroke: 'var(--safe)' }));
    svg.appendChild(T1(474, 146, 'شرفة الإيواء', 'Refuge balcony'));
    svg.appendChild(sv('rect', { x: 52, y: 270, width: 18, height: 32, rx: 3, fill: 'var(--safe)', opacity: '.7' }));
    svg.appendChild(sv('rect', { x: 450, y: 270, width: 18, height: 32, rx: 3, fill: 'var(--safe)', opacity: '.7' }));
    svg.appendChild(T1(46, 318, 'مخرج غربي', 'West exit')); svg.appendChild(T1(480, 318, 'مخرج شرقي', 'East exit'));
    svg.appendChild(sv('line', { x1: 20, y1: 302, x2: 500, y2: 302, stroke: 'var(--line-2)', 'stroke-width': 2 }));
    // fire + smoke on the ground floor
    svg.appendChild(sv('circle', { class: 'bd-smoke', cx: 214, cy: 244, r: 12 })); svg.appendChild(sv('circle', { class: 'bd-smoke', cx: 232, cy: 232, r: 9 }));
    svg.appendChild(sv('path', { class: 'bd-fire', d: 'M223 292 C208 292 202 280 210 268 C212 276 218 276 218 266 C228 272 238 278 238 284 C238 290 232 292 223 292 Z' }));
    svg.appendChild(T1(223, 214, 'النار', 'Fire', 'big'));
    // routes
    bldEl.rA = sv('path', { class: 'bd-route', d: 'M149 180 L91 180 L91 286 L56 288' });
    bldEl.rB = sv('path', { class: 'bd-route off', d: 'M149 180 L429 180 L429 286 L462 288' });
    bldEl.rAbu = sv('path', { class: 'bd-route', d: 'M223 97 L470 108' });
    bldEl.rHuda = sv('path', { class: 'bd-route', d: 'M371 262 L460 296' });
    [bldEl.rA, bldEl.rB, bldEl.rAbu, bldEl.rHuda].forEach(function (p) { svg.appendChild(p); });
    // people
    function person(id, x, y, ar, en) {
      var g = sv('g', { id: id }, sv('circle', { class: 'bd-person', cx: x, cy: y, r: 7 }), svBi(ar, en, { x: x, y: y + 20, class: 'bd-txt big', 'text-anchor': 'middle' }));
      svg.appendChild(g); return g;
    }
    bldEl.ravi = person('bd-ravi', 149, 180, '203 · رافي', '203 · Ravi');
    bldEl.abu = person('bd-abu', 223, 97, '302 · أبو سالم', '302 · Abu Salem');
    bldEl.huda = person('bd-huda', 371, 262, '105 · هدى', '105 · Huda');
    bldEl.hud = svBi('آمنون: 0 من 3 (رسم توضيحي)', 'Safe: 0 of 3 (illustration)', { x: 260, y: 18, class: 'bd-txt big', 'text-anchor': 'middle' });
    svg.appendChild(bldEl.hud);
    host.replaceChildren(desc, svg);
  }
  function setMsg(ar, en) { var m = $('#lv-msg'); if (m) setKids(m, bi(ar, en)); }
  function bldRender() {
    if (!bldEl.stairA) return;
    bldEl.stairA.classList.toggle('locked', BL.locked);
    bldEl.lock.style.display = BL.locked ? '' : 'none';
    bldEl.rA.classList.toggle('off', BL.locked || BL.safe);
    bldEl.rB.classList.toggle('off', !BL.locked || BL.safe);
    var raviG = bldEl.ravi.querySelector('circle'); raviG.setAttribute('class', BL.safe ? 'bd-safe' : 'bd-person');
    var n = BL.safe ? 1 : 0;
    var texts = bldEl.hud.querySelectorAll('text');
    texts[0].textContent = 'آمنون: ' + n + ' من 3 (رسم توضيحي)'; texts[1].textContent = 'Safe: ' + n + ' of 3 (illustration)';
    $('#lv-lock').setAttribute('aria-pressed', BL.locked ? 'true' : 'false');
    $('#lv-safe').setAttribute('aria-pressed', BL.safe ? 'true' : 'false');
    if (BL.safe) setMsg('رافي: «أنا بخير» ✓ — يتحرك العدّاد، ويبقى أبو سالم وهدى في رأس قائمة التسليم حتى يؤكدا.', 'Ravi: "I\'m safe" ✓ — the count moves, and Abu Salem and Huda stay at the top of the hand-off list until they confirm.');
    else if (BL.locked) setMsg('رسالة جديدة لرافي فقط (تغيّر طريقه): «استخدم الدرج ب». أبو سالم وهدى لم يتغير طريقهما فلا رسالة لهما.', 'A new message for Ravi only (his route changed): "Use Stair B". Abu Salem and Huda\'s routes did not change, so they get nothing new.');
    else setMsg('رافي (يقرأ المالايالامية، نائم): «توجّه إلى الدرج أ ثم المخرج الغربي». أبو سالم: «ابقَ في شرفة الإيواء». هدى: اهتزاز + نص.', 'Ravi (reads Malayalam, asleep): "Go to Stair A, then the west exit". Abu Salem: "Stay on the refuge balcony". Huda: vibration + text.');
  }
  function initBuilding() {
    buildBuilding(); bldRender();
    var lk = $('#lv-lock'), sf = $('#lv-safe');
    if (lk) lk.addEventListener('click', function () { BL.locked = !BL.locked; if (BL.locked) BL.safe = false; bldRender(); });
    if (sf) sf.addEventListener('click', function () { BL.safe = !BL.safe; bldRender(); });
  }

  /* ==========================================================================
     SLIDE 9 · FASTEST, NOT NEAREST  — live from ManaraSim (fictional stations, SIMULATED traffic)
     ========================================================================== */
  var DP = { ready: false, sim: null, world: null, G: null, hour: 7, load: 1, state: {}, assets: {}, NP: {}, svg: null, segSel: null };
  var KIND_COL = { fire: '--danger', rescue: '--danger', ambulance: '--safe', police: '--info', hospital: '--accent' };
  var KIND_LET = { fire: 'F', ambulance: 'A', police: 'P', hospital: 'H' };
  var KIND_NAME = { fire: { ar: 'إطفاء وإنقاذ', en: 'Fire & rescue' }, ambulance: { ar: 'إسعاف', en: 'Ambulance' }, police: { ar: 'شرطة', en: 'Police' }, hospital: { ar: 'مستشفى', en: 'Hospital' } };
  function hh(hour) { var m = Math.round(hour * 60); return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60); }

  function dpInit() {
    var map = $('#dp-map'); if (!map) return;
    if (!S || !S.worldInfo || !S.traffic || !S.dispatchCompare) {
      map.replaceChildren(h('p', { class: 'note warn', style: 'margin:1em' }, bi('محرّك المحاكاة غير محمَّل في هذه النسخة، فتعذّر عرض الخريطة الحيّة.', 'The simulation engine did not load in this copy, so the live map cannot be shown.')));
      $$('.dp-ctl input, #dp-seg, #dp-jam, #dp-close, #dp-clear').forEach(function (e) { e.disabled = true; });
      return;
    }
    try {
      DP.sim = S.create({ preset: 'fire-night', seed: 1 });
      DP.world = S.worldInfo(); DP.G = S.traffic.makeRoadGraph(DP.world.roads);
    } catch (e) { map.replaceChildren(h('p', { class: 'note warn', style: 'margin:1em' }, String(e && e.message || e))); return; }
    DP.world.assets.forEach(function (a) { DP.assets[a.id] = a; });
    DP.world.roads.nodes.forEach(function (n) {
      var a = DP.world.assets.filter(function (x) { return x.node === n.id; })[0];
      DP.NP[n.id] = n.off && a ? { x: a.edgePos.x, y: a.edgePos.y } : { x: n.x, y: n.y };
    });
    // segment picker
    var sel = $('#dp-seg'); DP.segSel = sel;
    DP.world.roads.segs.forEach(function (sg) { sel.appendChild(h('option', { value: sg.id }, '')); });
    dpFillSegNames();
    sel.value = 'AR-W';
    $('#dp-hour').addEventListener('input', function (e) { DP.hour = +e.target.value; dpUpdate(); });
    $('#dp-load').addEventListener('input', function (e) { DP.load = +e.target.value; dpUpdate(); });
    $('#dp-jam').addEventListener('click', function () { dpSet(sel.value, 1); });
    $('#dp-close').addEventListener('click', function () { dpSet(sel.value, 2); });
    $('#dp-clear').addEventListener('click', function () { DP.state = {}; dpUpdate(); });
    DP.ready = true;
    dpUpdate();
  }
  function dpFillSegNames() {
    if (!DP.segSel || !DP.world) return;
    $$('option', DP.segSel).forEach(function (o, k) {
      var sg = DP.world.roads.segs[k]; o.textContent = (sg.name ? L(sg.name) : sg.id) + ' · ' + sg.id;
    });
  }
  function dpSet(id, st) {
    if (!id) return;
    DP.state[id] = DP.state[id] === st ? 0 : st;
    if (!DP.state[id]) delete DP.state[id];
    dpUpdate();
  }
  function dpApply() {
    S.setHour(DP.sim, DP.hour); S.setTraffic(DP.sim, DP.load);
    DP.world.roads.segs.forEach(function (sg) {
      var st = DP.state[sg.id] || 0;
      if (st === 1) { S.jamRoad(DP.sim, sg.id, 0.1); S.closeRoad(DP.sim, sg.id, false); }
      else if (st === 2) { S.unjamRoad(DP.sim, sg.id); S.closeRoad(DP.sim, sg.id, true); }
      else { S.unjamRoad(DP.sim, sg.id); S.closeRoad(DP.sim, sg.id, false); }
    });
  }
  function dpUpdate() {
    if (!DP.ready) return;
    dpApply();
    var ho = $('#dp-hour-o'), lo = $('#dp-load-o');
    if (ho) ho.textContent = hh(DP.hour);
    if (lo) lo.textContent = num(DP.load, 1) + '×';
    var picks = {};
    ['fire', 'ambulance', 'police'].forEach(function (k) { try { picks[k] = S.dispatchCompare(DP.sim, k, {}); } catch (e) { picks[k] = null; } });
    var hosp = null; try { hosp = S.traffic.pickHospital(DP.sim, { n: 1, need: 'ed' }); } catch (e) { hosp = null; }
    dpDraw(picks);
    dpRows(picks, hosp);
  }
  function dpRows(picks, hosp) {
    var box = $('#dp-rows'); if (!box) return;
    box.replaceChildren();
    ['fire', 'ambulance', 'police'].forEach(function (k) {
      var r = picks[k]; if (!r || !r.fastest) { box.appendChild(h('div', { class: 'dp-row', style: '--uc:var(' + KIND_COL[k] + ')' }, h('span', { class: 'dp-badge' }, KIND_LET[k]), h('span', { class: 'dp-unit' }, bio(KIND_NAME[k])), h('span', { class: 'dp-eta' }, 'N/A'), h('span', { class: 'dp-why' }, bi('لا طريق متاح إلى الحادث', 'No road reaches the incident')))); return; }
      var u = DP.assets[r.fastest.id];
      box.appendChild(h('div', { class: 'dp-row', style: '--uc:var(' + KIND_COL[k] + ')' },
        h('span', { class: 'dp-badge' }, KIND_LET[k] + r.fastest.id.replace(/\D/g, '')),
        h('span', { class: 'dp-unit' }, bio(u.name)),
        h('span', { class: 'dp-eta num' }, mmss(r.fastest.etaSec), h('small', null, 'SIM · ' + num(r.fastest.distM) + ' m')),
        h('span', { class: 'dp-why' + (r.farButFaster ? ' fbf' : '') }, bio(r.why))));
    });
    if (hosp && hosp.chosen) {
      var a = hosp.chosen.asset, caps = [];
      var capAr = ['قسم طوارئ 24 س'], capEn = ['24 h emergency dept.'];
      if (a.trauma) { capAr.push('صدمات (المستوى الأول)'); capEn.push('trauma (Level I)'); }
      if (a.paed) { capAr.push('طوارئ أطفال'); capEn.push('paediatric'); }
      box.appendChild(h('div', { class: 'dp-row', style: '--uc:var(' + KIND_COL.hospital + ')' },
        h('span', { class: 'dp-badge' }, 'H'),
        h('span', { class: 'dp-unit' }, bio(a.name)),
        h('span', { class: 'dp-eta num' }, mmss(hosp.chosen.etaSec), h('small', null, 'SIM · ' + num(hosp.chosen.distM) + ' m')),
        h('span', { class: 'dp-why' }, bi('أقرب مستشفى يستقبل المصاب: ' + capAr.join('، ') + ' — أسرّة شاغرة (افتراض): ' + num(hosp.chosen.freeBeds), 'Fastest hospital that can take the patient: ' + capEn.join(', ') + ' — free beds (assumption): ' + num(hosp.chosen.freeBeds)))));
    }
  }
  function dpDraw(picks) {
    var host = $('#dp-map'); if (!host) return;
    var W = DP.world, G = DP.G, tr = DP.sim.traffic, tSec = DP.hour * 3600;
    var svg = sv('svg', { viewBox: '-9 -8 114 80', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(sv('rect', { x: 0, y: 0, width: 96, height: 64, fill: 'none', stroke: 'var(--line-2)', 'stroke-width': 0.4, 'stroke-dasharray': '2 2' }));
    var width = { expressway: 1.9, major: 1.5, minor: 1.0, access: 0.7 };
    W.roads.segs.forEach(function (sg) {
      var p1 = DP.NP[sg.a], p2 = DP.NP[sg.b], seg = G.segById[sg.id];
      var f = S.traffic.segFactors(seg, tSec, tr).total, closed = !!(tr.closed && tr.closed[sg.id]);
      var col = closed ? 'var(--muted)' : f >= 0.85 ? 'var(--safe)' : f >= 0.6 ? 'var(--warn)' : 'var(--danger)';
      var line = sv('line', { class: 'mp-road' + (closed ? ' closed' : ''), x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, 'stroke-width': width[sg.cls] || 1, style: '--rc:' + col });
      svg.appendChild(line);
      if (closed) { var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2; svg.appendChild(sv('path', { class: 'mp-x', d: 'M' + (mx - 1.6) + ' ' + (my - 1.6) + ' l3.2 3.2 M' + (mx + 1.6) + ' ' + (my - 1.6) + ' l-3.2 3.2' })); }
    });
    // routes (chosen unit of each kind; the nearest-by-distance fire unit dashed grey when different)
    var routeOf = function (assetId) {
      var a = DP.assets[assetId], r = a ? S.traffic.roadTravel(G, a.node, 'BLD', tSec, tr, { emerg: tr.emergencyFactor, allowClosedAtGoal: true }) : null;
      return r && r.nodes ? r.nodes.map(function (i) { return DP.NP[G.nodes[i].id]; }) : null;
    };
    var pts = function (arr) { return arr.map(function (p) { return p.x + ',' + p.y; }).join(' '); };
    var fire = picks.fire;
    if (fire && fire.nearestByDistance && fire.fastest && fire.nearestByDistance.id !== fire.fastest.id) {
      var rn = routeOf(fire.nearestByDistance.id); if (rn) svg.appendChild(sv('polyline', { class: 'mp-route near', points: pts(rn) }));
    }
    ['fire', 'ambulance', 'police'].forEach(function (k) {
      var r = picks[k]; if (!r || !r.fastest) return;
      var rt = routeOf(r.fastest.id); if (rt) svg.appendChild(sv('polyline', { class: 'mp-route', style: 'stroke:var(' + KIND_COL[k] + ')', points: pts(rt) }));
    });
    // click targets
    W.roads.segs.forEach(function (sg) {
      var p1 = DP.NP[sg.a], p2 = DP.NP[sg.b];
      var hit = sv('line', { class: 'mp-hit', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, 'data-seg': sg.id });
      hit.addEventListener('click', function () { if (DP.segSel) DP.segSel.value = sg.id; var cur = DP.state[sg.id] || 0; DP.state[sg.id] = (cur + 1) % 3; if (!DP.state[sg.id]) delete DP.state[sg.id]; dpUpdate(); });
      svg.appendChild(hit);
    });
    // places
    var places = { BLD: ['الحادث', 'Incident', -4.6], SCH: ['المدرسة', 'School', -3.6], SITE: ['موقع العمل', 'Worksite', -3.6], UP: ['النفق', 'Underpass', 6.4], LPGN: ['مخزن الغاز', 'Gas store', 6.2] };
    Object.keys(places).forEach(function (id) {
      var p = DP.NP[id]; if (!p) return;
      svg.appendChild(sv('circle', { class: id === 'BLD' ? 'mp-scene' : 'mp-poi', cx: p.x, cy: p.y, r: id === 'BLD' ? 2.6 : 1.7 }));
      var t = svBi(places[id][0], places[id][1], { x: p.x, y: p.y + places[id][2], class: 'mp-txt', 'text-anchor': 'middle' });
      svg.appendChild(t);
    });
    // units
    var chosen = {}; ['fire', 'ambulance', 'police'].forEach(function (k) { if (picks[k] && picks[k].fastest) chosen[picks[k].fastest.id] = 1; });
    W.assets.forEach(function (a) {
      if (a.kind === 'hospital' && a.id === 'H1') { /* shares the node with the second ambulance */ }
      var p = DP.NP[a.node], dy = a.id === 'A2' ? 7.5 : 0;
      var k = a.kind === 'rescue' ? 'fire' : a.kind;
      svg.appendChild(sv('circle', { class: 'mp-unit', cx: p.x, cy: p.y + dy, r: 3.3, fill: 'var(' + KIND_COL[k] + ')', stroke: chosen[a.id] ? 'var(--head)' : 'var(--surface)', 'stroke-width': chosen[a.id] ? 1.1 : 0.6 }));
      var lab = sv('text', { class: 'mp-ulabel', x: p.x, y: p.y + dy + 1.3, 'text-anchor': 'middle' }); lab.textContent = a.id; svg.appendChild(lab);
    });
    host.replaceChildren(svg);
    var hint = $('#dp-hint');
    if (!hint) { hint = h('p', { class: 'sl-src', id: 'dp-hint', style: 'padding:.3em .6em' }); host.parentNode.insertBefore(hint, host.nextSibling); }
    setKids(hint, bi('انقر طريقًا: ازدحام ← إغلاق ← عادي. الخطوط الغامقة هي مسارات الوحدات المختارة، والرمادية المنقّطة هي الأقرب مسافةً إن اختلفت.', 'Click a road: jam → closed → normal. Bold lines are the chosen units\' routes; the grey dotted line is the nearest by distance when it differs.'));
  }

  /* ==========================================================================
     SLIDE 10 · EVIDENCE  — static baseline (same call as the landing page) + a live re-run with ManaraSim
     ========================================================================== */
  var UNIT = { s: { ar: 'ث', en: 's' }, 'person-s': { ar: 'شخص·ث', en: 'person-s' }, persons: { ar: 'شخص', en: 'people' } };
  var EV = { res: null, live: false };
  var EV_BASE = { preset: 'fire-night', seed: 1,
    head: { label: { ar: 'زمن وصول 90٪ إلى الأمان', en: 'Time for 90 % to reach safety' }, unit: 's', ord: 626.2, man: 317, better: 'lower' },
    inj: [10, 5], disp: [225, 47], siren: 14, personal: 39 };
  function evSummarise(r) {
    var o = r.ordinary, m = r.manara;
    return { preset: r.preset, seed: r.seed,
      head: { label: m.headline.label, unit: m.headline.unit, ord: o.headline.value, man: m.headline.value, better: m.headline.better },
      inj: [o.injuredInModel, m.injuredInModel],
      disp: [o.dispatch ? o.dispatch.timeToDispatchSec : null, m.dispatch ? m.dispatch.timeToDispatchSec : null],
      siren: m.timeToLocalAlarmSec, personal: m.timeToFirstPersonalAlertSec };
  }
  function evRow(label, a, b, unit) {
    var max = Math.max(a == null ? 0 : a, b == null ? 0 : b, 1e-9);
    var pair = function (name, val, cls) {
      return h('div', { class: 'ev-pair' }, h('em', null, bio(name)),
        h('span', { class: 'ev-track' }, h('i', { class: cls, style: '--v:' + (val == null ? 0 : Math.max(2, val / max * 100)).toFixed(1) })),
        h('b', { class: 'num' }, val == null ? 'N/A' : num(val, val < 10 && val % 1 ? 1 : 0)));
    };
    return h('div', { class: 'ev-bar' },
      h('span', null, bio(label), unit ? h('span', { class: 'muted' }, ' (', bio(unit), ')') : null),
      pair({ ar: 'عادي', en: 'ordinary' }, a, 'ord'), pair({ ar: 'منارة', en: 'MANARA' }, b, 'man'));
  }
  function evRender(res) {
    EV.res = res;
    var box = $('#ev-bars'); if (!box) return;
    box.replaceChildren(
      evRow(res.head.label, res.head.ord, res.head.man, UNIT[res.head.unit] || { ar: res.head.unit, en: res.head.unit }),
      evRow({ ar: 'مصابون «في النموذج» (ليست وفيات)', en: 'Injured "in the model" (not deaths)' }, res.inj[0], res.inj[1], UNIT.persons),
      evRow({ ar: 'زمن إرسال أول وحدة استجابة', en: 'Time until the first responder is dispatched' }, res.disp[0], res.disp[1], UNIT.s));
    var tr = $('#ev-trade');
    if (tr) {
      if (res.siren != null && res.personal != null && res.personal > res.siren) setKids(tr, bi('مقايضة صريحة: صفّارة المبنى تُسمع بعد ' + res.siren + ' ث في العالمين، وأول رسالة شخصية من منارة تصل بعد ' + res.personal + ' ث لأنها تتحقق أولًا.', 'An honest trade-off: the building siren is heard after ' + res.siren + ' s in both worlds, while MANARA\'s first personal message arrives after ' + res.personal + ' s because it verifies first.'),
        h('br'), bi('السيناريو: ' + presetName(res.preset, 'ar') + ' · بذرة ' + res.seed + (EV.live ? ' · حُسبت الآن في متصفحك' : ' · الرقم الثابت نفسه الذي في صفحة الأدلة'), 'Scenario: ' + presetName(res.preset, 'en') + ' · seed ' + res.seed + (EV.live ? ' · computed just now in your browser' : ' · the same fixed baseline as the landing page')));
      else setKids(tr, bi('السيناريو: ' + presetName(res.preset, 'ar') + ' · بذرة ' + res.seed + ' — فحص آلية لا برهان أثر.', 'Scenario: ' + presetName(res.preset, 'en') + ' · seed ' + res.seed + ' — a mechanism check, not proof of impact.'));
    }
  }
  function presetName(id, l) { var p = S && S.PRESETS && S.PRESETS[id]; return p && p.name ? p.name[l] : id; }
  function initEvidence() {
    evRender(EV_BASE);
    var sel = $('#ev-preset'), go = $('#ev-go'), seed = $('#ev-seed');
    if (!sel) return;
    if (!S || !S.ab || !S.PRESET_ORDER) { var run = $('.ev-run'); if (run) run.hidden = true; return; }
    S.PRESET_ORDER.forEach(function (id) { sel.appendChild(h('option', { value: id }, presetName(id, lang()))); });
    sel.value = 'fire-night';
    go.addEventListener('click', function () {
      var run = $('.ev-run'); run.setAttribute('data-busy', 'true');
      var lab = go.textContent; setKids(go, bi('جارٍ الحساب…', 'Computing…'));
      setTimeout(function () {
        try {
          var sd = clamp(Math.round(+seed.value) || 1, 1, 999); seed.value = sd;
          EV.live = true; evRender(evSummarise(S.ab({ preset: sel.value, seed: sd })));
        } catch (e) { setKids($('#ev-trade'), String(e && e.message || e)); }
        run.removeAttribute('data-busy'); setKids(go, bi('شغّل المحاكاة', 'Run the simulation'));
      }, 40);
    });
  }
  function evRefreshNames() {
    var sel = $('#ev-preset'); if (!sel || !S || !S.PRESET_ORDER) return;
    $$('option', sel).forEach(function (o) { o.textContent = presetName(o.value, lang()); });
    if (EV.res) evRender(EV.res);
  }

  /* ==========================================================================
     DECK ENGINE
     ========================================================================== */
  var deck = $('#deck'), stage = $('#stage'), stageWrap = $('.stage-wrap'), bar = $('#deck-bar'), notes = $('#notes'), overview = $('#overview'), kbdHelp = $('#kbd-help'), liveReg = $('#deck-live');
  var slides = $$('.slide', stage), N = slides.length;
  var ST = { tab: 'slides', i: 0, path: '3', skip: true, present: false, notes: false, auto: true, mirror: true, seen: {} };
  var PV = /^#presenter/.test(location.hash);   // the presenter window: notes + timer + next slide, kept in step with the audience window over Manara.link
  (function loadState() {
    var sv0 = jget('manara-pitch-state', {}) || {};
    ST.path = sv0.path === '7' ? '7' : '3'; ST.skip = sv0.skip !== false; ST.auto = sv0.auto !== false; ST.mirror = sv0.mirror !== false;
    ST.notes = sv0.notes != null ? !!sv0.notes : window.innerWidth >= 1320;
  })();
  function saveState() { jset('manara-pitch-state', { path: ST.path, skip: ST.skip, auto: ST.auto, mirror: ST.mirror, notes: ST.notes }); }
  function budget(i, p) { return SL[i]['t' + (p || ST.path)] || 0; }
  function inPath(i) { return budget(i) > 0; }
  function totalBudget(p) { return SL.reduce(function (a, s) { return a + (s['t' + p] || 0); }, 0); }
  function plannedStart(i) { var t = 0; for (var k = 0; k < i; k++) t += budget(k); return t; }
  function slideTitle(i) { return L(SL[i].title); }
  function setHash(hs) { if (PV) return; try { history.replaceState(null, '', location.pathname + location.search + hs); } catch (e) { /* file:// sandbox */ } }
  function announce(txt) { if (liveReg) liveReg.textContent = txt; }

  /* ---- bar ---- */
  var BAR = {};
  function barBtn(cls, iconName, key, onClick, extra) {
    var b = h('button', Object.assign({ type: 'button', class: cls, 'data-i18n-attr': 'aria-label:' + key + ';title:' + key }, extra || {}));
    if (iconName) b.appendChild(parseSvgIcon(iconName));
    b.addEventListener('click', onClick);
    return b;
  }
  function buildBar() {
    bar.replaceChildren();
    BAR.prog = h('div', { class: 'db-prog', role: 'group', 'data-i18n-attr': 'aria-label:pt.progress' });
    BAR.segs = SL.map(function (s, k) {
      var b = h('button', { type: 'button', class: 'db-seg' }); b.addEventListener('click', function () { goTo(k); }); BAR.prog.appendChild(b); return b;
    });
    BAR.prev = barBtn('db-btn', 'prev', 'pt.prev', function () { step(-1); }); BAR.prev.firstChild.classList.add('flip');
    BAR.next = barBtn('db-btn', 'next', 'pt.next', function () { step(1); }); BAR.next.firstChild.classList.add('flip');
    BAR.count = h('span', { class: 'db-count num', dir: 'ltr', 'aria-hidden': 'true' });
    BAR.title = h('span', { class: 'db-title' });
    BAR.timer = h('button', { type: 'button', class: 'db-timer', 'data-i18n-attr': 'aria-label:pt.timer;title:pt.timer' }, parseSvgIcon('clock'), h('span', { class: 'tmv num', dir: 'ltr' }, '00:00 / 03:00'));
    BAR.timer.addEventListener('click', function () { TM.running ? tmPause() : tmStart(); });
    BAR.p3 = h('button', { type: 'button', 'aria-pressed': 'true', 'data-i18n-attr': 'title:pt.path3;aria-label:pt.path3' }, '3′'); BAR.p3.addEventListener('click', function () { setPath('3'); });
    BAR.p7 = h('button', { type: 'button', 'aria-pressed': 'false', 'data-i18n-attr': 'title:pt.path7;aria-label:pt.path7' }, '7′'); BAR.p7.addEventListener('click', function () { setPath('7'); });
    BAR.path = h('div', { class: 'db-path', role: 'group', 'data-i18n-attr': 'aria-label:pt.path' }, BAR.p3, BAR.p7);
    BAR.notes = barBtn('db-btn', 'note', 'pt.notes', function () { setNotes(!ST.notes); }, { 'aria-pressed': 'false' });
    BAR.ov = barBtn('db-btn', 'grid', 'pt.overview', function () { toggleOverview(); }, { 'aria-haspopup': 'dialog' });
    BAR.print = barBtn('db-btn', 'print', 'pt.print', function () { printNow('slides'); });
    BAR.lang = barBtn('db-btn', 'globe', 'pt.lang', function () { M.toggleLang(); });
    BAR.help = barBtn('db-btn', 'keys', 'pt.help', function () { toggleHelp(); }, { 'aria-haspopup': 'dialog' });
    BAR.full = h('button', { type: 'button', class: 'db-btn go', 'data-i18n-attr': 'aria-label:pt.present;title:pt.present', 'aria-pressed': 'false' }, parseSvgIcon('full'), h('span', { class: 'go-t' }, bi('عرض', 'Present')));
    BAR.full.addEventListener('click', function () { setPresent(!ST.present); });
    bar.appendChild(BAR.prog);
    bar.appendChild(h('div', { class: 'db-row' },
      h('div', { class: 'db-nav' }, BAR.prev, BAR.count, BAR.next),
      h('div', { class: 'db-mid' }, BAR.timer, BAR.title),
      h('div', { class: 'db-tools' }, BAR.path, BAR.notes, BAR.ov, BAR.print, BAR.lang, BAR.help, BAR.full)));
    M.applyI18n(bar);
  }
  function updateBar() {
    if (!BAR.segs) return;
    BAR.count.textContent = (ST.i + 1) + ' / ' + N;
    BAR.title.textContent = slideTitle(ST.i);
    BAR.segs.forEach(function (b, k) {
      b.setAttribute('aria-label', (k + 1) + '. ' + slideTitle(k) + (inPath(k) ? '' : ' — ' + T('خارج المسار', 'not in this path')));
      if (k === ST.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.classList.toggle('seen', !!ST.seen[k]); b.classList.toggle('offpath', !inPath(k));
    });
    BAR.prev.disabled = ST.i === 0 && !hasStep(-1); BAR.next.disabled = !hasStep(1);
    BAR.p3.setAttribute('aria-pressed', ST.path === '3' ? 'true' : 'false'); BAR.p7.setAttribute('aria-pressed', ST.path === '7' ? 'true' : 'false');
    BAR.notes.setAttribute('aria-pressed', ST.notes ? 'true' : 'false');
    BAR.full.setAttribute('aria-pressed', ST.present ? 'true' : 'false');
    var gt = BAR.full.querySelector('.go-t'); if (gt) setKids(gt, ST.present ? bi('خروج', 'Exit') : bi('عرض', 'Present'));
    var ic = BAR.full.querySelector('svg'); if (ic) { var n = parseSvgIcon(ST.present ? 'exit' : 'full'); ic.replaceWith(n); }
  }

  /* ---- navigation ---- */
  function nextIdx(dir) {
    var j = ST.i;
    do { j += dir; } while (j >= 0 && j < N && ST.skip && !inPath(j));
    return j < 0 || j >= N ? -1 : j;
  }
  function hasStep(dir) { return nextIdx(dir) >= 0; }
  function step(dir) { var j = nextIdx(dir); if (j >= 0) goTo(j); }
  var seenIdle = 0;
  function goTo(i, o) {
    o = o || {};
    i = clamp(i, 0, N - 1);
    var prev = ST.i;
    if (i === prev && !o.force) return;
    ST.i = i; ST.seen[i] = 1;
    slides.forEach(function (s, k) {
      var on = k === i;
      s.classList.toggle('is-active', on); s.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) s.classList.remove('is-leaving');
      else if (k === prev && !reduce && !o.force) { s.classList.add('is-leaving'); setTimeout(function () { s.classList.remove('is-leaving'); }, 380); }
    });
    if (SL[i].id === 'proof') { PF.k1 = PF.k2 = PF.k3 = false; pfRender(); }
    if (SL[i].id === 'live') { BL.locked = BL.safe = false; bldRender(); }
    updateBar(); renderNotes(); timerOnSlide(prev, i);
    announce(L({ ar: 'الشريحة ' + (i + 1) + ' من ' + N + ': ' + SL[i].title.ar, en: 'Slide ' + (i + 1) + ' of ' + N + ': ' + SL[i].title.en }));
    if (!o.noHash) setHash('#s' + (i + 1));
    if (!o.fromSync) { try { M.link.send({ type: 'pitch-slide', i: i, path: ST.path }); } catch (e) { /* ignore */ } }
    if (stageWrap && deck.getAttribute('data-mode') === 'reader' && !ST.present && !o.noScroll && ST.tab === 'slides') { try { stage.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ } }
    if (ST.present) { var st = $('#stage'); if (st) st.scrollTop = 0; if (stageWrap) stageWrap.scrollTop = 0; }
  }
  function setPath(p) {
    ST.path = p === '7' ? '7' : '3'; ST.skip = ST.path === '3'; saveState();
    updateBar(); renderNotes(); updateTimerUI(); renderScript();
    announce(T(ST.path === '3' ? 'مسار الثلاث دقائق الصارم' : 'مسار السبع دقائق الممتد', ST.path === '3' ? 'Strict 3-minute path' : 'Extended 7-minute path'));
  }

  /* ---- modes: stage (16:9, scaled) or reader (narrow screens) ---- */
  function applyMode() {
    var w = ST.present ? Math.min(window.innerWidth, window.innerHeight * 16 / 9) : (stageWrap ? stageWrap.getBoundingClientRect().width : window.innerWidth);
    var reader = ST.present ? window.innerWidth < 760 || w < 700 : w < 880;
    var cur = deck.getAttribute('data-mode');
    var next = reader ? 'reader' : 'stage';
    if (cur !== next) deck.setAttribute('data-mode', next);
  }
  if ('ResizeObserver' in window && stageWrap) new ResizeObserver(function () { applyMode(); }).observe(stageWrap);
  window.addEventListener('resize', applyMode);

  /* ---- present (full screen) ---- */
  var idleTimer = 0;
  function wake() {
    deck.classList.remove('is-idle'); clearTimeout(idleTimer);
    if (!ST.present) return;
    idleTimer = setTimeout(function () {
      if (!ST.present || !overview.hidden || !kbdHelp.hidden || bar.contains(doc.activeElement)) return;
      deck.classList.add('is-idle');
    }, 2800);
  }
  function setPresent(on, noFs) {
    if (on === ST.present) return;
    ST.present = on;
    deck.classList.toggle('is-present', on); html.classList.toggle('pt-present', on);
    if (on) {
      ST.notesBefore = ST.notes; if (!ST.notesTouched) ST.notes = false;
      if (!noFs) { try { var p = deck.requestFullscreen && deck.requestFullscreen(); if (p && p.catch) p.catch(function () { /* overlay still works */ }); } catch (e) { /* ignore */ } }
      if (ST.tab !== 'slides') showTab('slides', true);
    } else {
      if (doc.fullscreenElement) { try { var q = doc.exitFullscreen(); if (q && q.catch) q.catch(function () { /* ignore */ }); } catch (e2) { /* ignore */ } }
      if (!ST.notesTouched && ST.notesBefore != null) ST.notes = ST.notesBefore;
      deck.classList.remove('is-idle');
    }
    deck.classList.toggle('has-notes', ST.notes);
    applyMode(); updateBar(); wake();
    if (on) { try { stage.focus({ preventScroll: true }); } catch (e3) { /* ignore */ } }
    announce(on ? T('وضع العرض: اضغط Esc للخروج', 'Presenting: press Esc to exit') : T('خرجت من وضع العرض', 'Left presenting'));
  }
  doc.addEventListener('fullscreenchange', function () { if (!doc.fullscreenElement && ST.present) setPresent(false, true); });
  ['mousemove', 'pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { deck.addEventListener(ev, wake, { passive: true }); });
  bar.addEventListener('focusin', function () { deck.classList.remove('is-idle'); });

  /* ---- notes toggle ---- */
  function setNotes(on) {
    ST.notes = !!on; ST.notesTouched = true; saveState();
    deck.classList.toggle('has-notes', ST.notes); updateBar(); renderNotes();
  }

  /* ---- overview (thumbnails) ---- */
  function cloneSlide(src) {
    var c = src.cloneNode(true);
    c.removeAttribute('id'); c.removeAttribute('aria-labelledby'); c.removeAttribute('aria-roledescription'); c.setAttribute('aria-hidden', 'true'); c.setAttribute('inert', '');
    c.classList.remove('is-active', 'is-leaving');
    $$('[id]', c).forEach(function (e) { e.removeAttribute('id'); });
    $$('[for],[aria-labelledby],[aria-describedby]', c).forEach(function (e) { e.removeAttribute('for'); e.removeAttribute('aria-labelledby'); e.removeAttribute('aria-describedby'); });
    return c;
  }
  function openOverview() {
    overview.hidden = false; overview.replaceChildren();
    var grid = h('div', { class: 'ov-grid', role: 'group', 'data-i18n-attr': 'aria-label:pt.slides' });
    slides.forEach(function (s, k) {
      var it = h('button', { type: 'button', class: 'ov-item' + (inPath(k) ? '' : ' skipped'), 'data-i': k, 'aria-current': k === ST.i ? 'true' : null });
      it.appendChild(h('span', { class: 'ov-frame' }, cloneSlide(s)));
      it.appendChild(h('span', { class: 'ov-cap' }, h('b', { class: 'num' }, String(k + 1)), h('span', null, slideTitle(k)), h('span', { class: 't' }, budget(k) ? mmss(budget(k)) : '—')));
      it.addEventListener('click', function () { closeOverlays(); goTo(k); try { stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });
      grid.appendChild(it);
    });
    overview.appendChild(h('div', { class: 'ov-head' }, h('h3', null, bi('نظرة عامة على الشرائح', 'Slide overview'), ' ', h('span', { class: 'tag neutral' }, ST.path === '3' ? bi('مسار 3 دقائق', '3-minute path') : bi('مسار 7 دقائق', '7-minute path'))),
      barBtn('db-btn', 'x', 'pt.close', function () { closeOverlays(); BAR.ov.focus(); })));
    overview.appendChild(grid);
    overview.setAttribute('aria-label', T('نظرة عامة على الشرائح', 'Slide overview'));
    M.applyI18n(overview);
    var cur = $('.ov-item[aria-current=true]', grid) || $('.ov-item', grid); if (cur) cur.focus();
  }
  var lastFocus = null;
  function toggleOverview() { if (overview.hidden) { kbdHelp.hidden = true; lastFocus = doc.activeElement; openOverview(); } else closeOverlays(); }
  overview.addEventListener('keydown', function (e) {
    var items = $$('.ov-item', overview), i = items.indexOf(doc.activeElement);
    if (i < 0) return;
    var rtl = html.dir === 'rtl', d = 0, cols = 1;
    if (items.length > 1) { var top0 = items[0].offsetTop; cols = items.filter(function (x) { return x.offsetTop === top0; }).length || 1; }
    if (e.key === 'ArrowRight') d = rtl ? -1 : 1; else if (e.key === 'ArrowLeft') d = rtl ? 1 : -1; else if (e.key === 'ArrowDown') d = cols; else if (e.key === 'ArrowUp') d = -cols; else return;
    e.preventDefault(); var n = clamp(i + d, 0, items.length - 1); items[n].focus();
  });

  /* ---- keyboard help ---- */
  function toggleHelp() {
    if (!kbdHelp.hidden) { closeOverlays(); return; }
    overview.hidden = true; kbdHelp.hidden = false; kbdHelp.replaceChildren(); lastFocus = lastFocus || doc.activeElement;
    var rows = [
      [['←', '→'], { ar: 'الشريحة السابقة/التالية (باتجاه القراءة)', en: 'Previous / next slide (in reading direction)' }],
      [['Space', 'PgDn'], { ar: 'التالية', en: 'Next' }], [['PgUp'], { ar: 'السابقة', en: 'Previous' }], [['Home', 'End'], { ar: 'الأولى/الأخيرة', en: 'First / last' }],
      [['1', '…', '9'], { ar: 'اذهب إلى الشريحة (اكتب رقمين للشرائح 10–12)', en: 'Go to a slide (type two digits for 10–12)' }],
      [['F'], { ar: 'ملء الشاشة / خروج', en: 'Full screen / exit' }], [['N'], { ar: 'ملاحظات المقدّم', en: 'Presenter notes' }], [['O'], { ar: 'نظرة عامة على الشرائح', en: 'Slide overview' }],
      [['P'], { ar: 'طباعة (Shift+P مع الملاحظات)', en: 'Print (Shift+P with notes)' }], [['L'], { ar: 'تبديل العربية/الإنجليزية', en: 'Switch Arabic / English' }],
      [['S'], { ar: 'تشغيل/إيقاف مؤقّت المقدّم', en: 'Start / pause the speaker timer' }], [['?'], { ar: 'هذه اللوحة', en: 'This panel' }], [['Esc'], { ar: 'إغلاق / خروج من العرض', en: 'Close / exit presenting' }]
    ];
    var dl = h('dl', { class: 'kh-grid' });
    rows.forEach(function (r) { dl.appendChild(h('dt', null, r[0].map(function (k) { return k === '…' ? h('span', null, '…') : h('kbd', null, k); }))); dl.appendChild(h('dd', null, bio(r[1]))); });
    kbdHelp.appendChild(h('div', { class: 'kh-card pt-card' },
      h('div', { class: 'ov-head' }, h('h3', null, bi('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')), barBtn('db-btn', 'x', 'pt.close', function () { closeOverlays(); BAR.help.focus(); })), dl,
      h('p', { class: 'small muted' }, bi('اللمس: اسحب يمينًا/يسارًا لتغيير الشريحة. في العربية يكون السحب نحو اليمين هو «التالي».', 'Touch: swipe left/right to change slide. In Arabic, swiping right means "next".'))));
    kbdHelp.setAttribute('aria-label', T('اختصارات لوحة المفاتيح', 'Keyboard shortcuts'));
    M.applyI18n(kbdHelp);
    var cb = $('.db-btn', kbdHelp); if (cb) cb.focus();
  }
  function closeOverlays() { var was = !overview.hidden || !kbdHelp.hidden; overview.hidden = true; kbdHelp.hidden = true; if (was && lastFocus && lastFocus.focus && doc.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } lastFocus = null; return was; }

  /* ---- swipe ---- */
  (function swipe() {
    var sx = 0, sy = 0, t0 = 0, on = false;
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.target.closest('[data-no-swipe],button,a,input,select,textarea,label,summary')) { on = false; return; }
      on = true; sx = e.clientX; sy = e.clientY; t0 = Date.now();
    });
    stage.addEventListener('pointerup', function (e) {
      if (!on) return; on = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Date.now() - t0 > 900 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      var rtl = html.dir === 'rtl';
      step(dx < 0 ? (rtl ? -1 : 1) : (rtl ? 1 : -1));   // LTR: finger left = next · RTL: finger right = next
    });
    stage.addEventListener('pointercancel', function () { on = false; });
  })();

  /* ---- keyboard ---- */
  var digitBuf = '', digitT = 0;
  function typing(e) { var t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  doc.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var k = e.key;
    if (k === 'Escape') {
      if (closeOverlays()) { e.preventDefault(); return; }
      if (ST.present) { e.preventDefault(); setPresent(false); }
      return;
    }
    if (typing(e)) return;
    if (e.target.closest && e.target.closest('[role=tablist]') && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End')) return;
    var onSlides = ST.tab === 'slides' || ST.present;
    var low = k.length === 1 ? k.toLowerCase() : k;
    var onCtl = !!(e.target.closest && e.target.closest('button,a,summary,[role=tab]'));
    if (low === 'p') { e.preventDefault(); printNow(onSlides ? 'slides' : ST.tab, e.shiftKey); return; }
    if (!onSlides) return;
    var inStage = ST.present || (e.target === stage || (stage.contains(e.target) && !onCtl)) || e.target === doc.body;
    var rtl = html.dir === 'rtl';
    if (k === 'ArrowRight') { e.preventDefault(); step(rtl ? -1 : 1); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); step(rtl ? 1 : -1); return; }
    if (inStage) {
      if (k === ' ' && !onCtl) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
      if (k === 'PageDown' || (ST.present && (k === 'ArrowDown'))) { e.preventDefault(); step(1); return; }
      if (k === 'PageUp' || (ST.present && (k === 'ArrowUp'))) { e.preventDefault(); step(-1); return; }
      if (k === 'Home') { e.preventDefault(); goTo(0); return; }
      if (k === 'End') { e.preventDefault(); goTo(N - 1); return; }
    }
    if (low === 'f') { e.preventDefault(); setPresent(!ST.present); return; }
    if (low === 'n') { e.preventDefault(); setNotes(!ST.notes); return; }
    if (low === 'o') { e.preventDefault(); toggleOverview(); return; }
    if (low === 'l') { e.preventDefault(); M.toggleLang(); return; }
    if (low === 's' && !onCtl) { e.preventDefault(); TM.running ? tmPause() : tmStart(); return; }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); toggleHelp(); return; }
    if (/^[0-9]$/.test(k) && !onCtl) {
      clearTimeout(digitT); digitBuf += k;
      var n = parseInt(digitBuf, 10);
      if (digitBuf.length >= 2 || n > 1) { if (n >= 1 && n <= N) goTo(n - 1); digitBuf = ''; }
      else digitT = setTimeout(function () { var m = parseInt(digitBuf, 10); if (m >= 1 && m <= N) goTo(m - 1); digitBuf = ''; }, 700);
    }
  });

  /* ==========================================================================
     SPEAKER TIMER + PRESENTER NOTES
     ========================================================================== */
  var TM = { running: false, t0: 0, acc: 0, enter: { 0: 0 }, iv: 0 };
  var NT = {};
  function tmElapsed() { return TM.acc + (TM.running ? (performance.now() - TM.t0) / 1000 : 0); }
  function tmStart() { if (TM.running) return; TM.running = true; TM.t0 = performance.now(); TM.iv = setInterval(updateTimerUI, 250); updateTimerUI(); }
  function tmPause() { if (!TM.running) return; TM.acc = tmElapsed(); TM.running = false; clearInterval(TM.iv); updateTimerUI(); }
  function tmReset() { TM.running = false; clearInterval(TM.iv); TM.acc = 0; TM.enter = {}; TM.enter[ST.i] = 0; updateTimerUI(); }
  function timerOnSlide(prev, i) {
    TM.enter[i] = tmElapsed();
    if (ST.auto && !TM.running && tmElapsed() === 0 && prev === 0 && i > 0) tmStart(); else updateTimerUI();
  }
  function tmInfo() {
    var e = tmElapsed(), total = totalBudget(ST.path), i = ST.i, b = budget(i);
    var inSlide = e - (TM.enter[i] || 0), left = b ? b - inSlide : null, st = 'ok';
    if (b) { if (left < 0) st = 'over'; else if (left <= b * 0.2) st = 'soon'; }
    var ps = plannedStart(i), pe = ps + b, delta = e < ps ? e - ps : e > pe ? e - pe : 0;
    var tst = e > total ? 'over' : e > total * 0.9 ? 'soon' : 'ok';
    return { e: e, total: total, left: left, st: st, delta: delta, tst: tst, b: b, inSlide: inSlide };
  }
  function updateTimerUI() {
    var f = tmInfo(), started = TM.running || f.e > 0;
    var worst = !started ? '' : (f.tst === 'over' || f.st === 'over') ? 'over' : (f.tst === 'soon' || f.st === 'soon') ? 'soon' : 'ok';
    if (BAR.timer) {
      BAR.timer.setAttribute('data-st', worst); BAR.timer.querySelector('.tmv').textContent = mmss(f.e) + ' / ' + mmss(f.total);
    }
    if (NT.clock) {
      NT.clock.textContent = mmss(f.e); NT.total.textContent = '/ ' + mmss(f.total);
      NT.slide.textContent = f.b ? T('هذه الشريحة: ', 'This slide: ') + mmss(Math.max(0, f.inSlide)) + ' / ' + mmss(f.b) : T('خارج هذا المسار', 'Not in this path');
      var pct = f.b ? clamp(f.inSlide / f.b * 100, 0, 100) : 0;
      NT.fill.style.setProperty('--v', pct.toFixed(1)); NT.fillWrap.setAttribute('data-st', started && f.b ? f.st : 'ok');
      var txt;
      if (!started) txt = T('اضغط «ابدأ» أو S عند أول كلمة.', 'Press Start or S on your first word.');
      else if (f.delta > 3) txt = T('متأخر عن الخطة بـ ', 'Behind plan by ') + mmss(f.delta);
      else if (f.delta < -3) txt = T('أبكر من الخطة بـ ', 'Ahead of plan by ') + mmss(-f.delta);
      else txt = T('ضمن الخطة', 'On plan');
      if (started && f.b && f.left != null) txt += ' · ' + (f.left >= 0 ? T('المتبقي ', 'left ') + mmss(f.left) : T('تجاوزت بـ ', 'over by ') + mmss(-f.left));
      NT.pace.textContent = txt;
      setKids(NT.toggle, parseSvgIcon(TM.running ? 'pause' : 'play'), ' ', TM.running ? bi('إيقاف مؤقت', 'Pause') : bi('ابدأ', 'Start'));
    }
  }
  function openPresenter() {
    var u = location.href.split('#')[0].split('?')[0] + '#presenter';
    try { var w = window.open(u, 'manara-presenter', 'popup=yes,width=980,height=760'); if (w) { w.focus(); setTimeout(function () { try { M.link.send({ type: 'pitch-slide', i: ST.i, path: ST.path }); } catch (e) { /* ignore */ } }, 900); } else M.toast({ ar: 'منع المتصفح النافذة المنبثقة: اسمح بها ثم أعد المحاولة.', en: 'The browser blocked the pop-up: allow it and try again.' }, 'warn'); } catch (e) { /* ignore */ }
  }
  function openQA(id) { showTab('qa', true); var it = $('#q-' + id); if (it) { it.open = true; setTimeout(function () { try { it.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); it.querySelector('summary').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30); } }
  function qaById(id) { for (var k = 0; k < QA.length; k++) if (QA[k].id === id) return QA[k]; return null; }
  function renderNotes() {
    if (!notes) return;
    var m = SL[ST.i], b = budget(ST.i), skipped = !b;
    notes.replaceChildren();
    notes.setAttribute('aria-label', T('ملاحظات المقدّم', 'Presenter notes'));
    // header
    notes.appendChild(h('div', { class: 'nt-head' },
      h('h3', null, bi('ملاحظات المقدّم', 'Presenter notes'), ' · ', h('span', { class: 'num' }, (ST.i + 1) + '/' + N)),
      h('div', { class: 'nt-meta' }, h('span', { class: 'tag' }, ST.path === '3' ? bi('مسار 3 د', '3-min path') : bi('مسار 7 د', '7-min path')),
        b ? h('span', { class: 'tag cool num' }, mmss(b)) : h('span', { class: 'tag neutral' }, bi('يُتخطّى', 'skipped')),
        m.live ? h('span', { class: 'tag danger' }, bi('حيّ', 'LIVE')) : null)));
    // timer
    NT.clock = h('b', { class: 'num', dir: 'ltr' }, '00:00'); NT.total = h('span', { class: 'num', dir: 'ltr' }, ''); NT.slide = h('span', { class: 'small muted' });
    NT.fill = h('i'); NT.fillWrap = h('div', { class: 'nt-bar', role: 'presentation' }, NT.fill);
    NT.pace = h('p', { class: 'nt-pace', role: 'status' });
    NT.toggle = h('button', { type: 'button', class: 'btn btn-sm btn-primary' }); NT.toggle.addEventListener('click', function () { TM.running ? tmPause() : tmStart(); });
    var rs = h('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, parseSvgIcon('reset'), ' ', bi('من الصفر', 'Reset')); rs.addEventListener('click', tmReset);
    var auto = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ST.auto ? '' : null }), h('span', null, bi('ابدأ المؤقّت عند الانتقال من الشريحة 1', 'Auto-start when I leave slide 1')));
    $('input', auto).addEventListener('change', function (e) { ST.auto = e.target.checked; saveState(); });
    var skip = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ST.skip ? '' : null }), h('span', null, bi('تخطَّ الشرائح خارج المسار', 'Skip slides outside the path')));
    $('input', skip).addEventListener('change', function (e) { ST.skip = e.target.checked; saveState(); updateBar(); });
    var mir = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ST.mirror ? '' : null }), h('span', null, bi('أظهر اللغة الأخرى', 'Show the other language')));
    $('input', mir).addEventListener('change', function (e) { ST.mirror = e.target.checked; saveState(); notes.classList.toggle('no-mirror', !ST.mirror); });
    notes.classList.toggle('no-mirror', !ST.mirror);
    notes.appendChild(h('div', { class: 'nt-timer' }, h('div', { class: 'nt-clock' }, NT.clock, NT.total), NT.slide, NT.fillWrap, NT.pace, h('div', { class: 'nt-ctl' }, NT.toggle, rs), h('div', { class: 'nt-switch' }, auto, skip, mir)));
    // say
    function sayBlock(o, cls) {
      var wrap = h('div', { class: 'nt-say' + (cls ? ' ' + cls : '') });
      wrap.appendChild(bio(o, 'p'));
      var mr = mirror(o, 'p', 'nt-mirror'); wrap.appendChild(mr);
      return wrap;
    }
    if (skipped) notes.appendChild(h('p', { class: 'nt-skip' }, bi('هذه الشريحة خارج المسار الصارم (3 دقائق). تخطَّها، أو افتحها للإجابة عن سؤال.', 'This slide is outside the strict 3-minute path. Skip it, or open it to answer a question.')));
    var sec = h('div', { class: 'nt-sec' }); sec.appendChild(h('h4', null, bi(skipped ? 'للرجوع إليه' : 'قل هذا', skipped ? 'For reference' : 'Say this')));
    if (m.live && !skipped) {
      LIVE.forEach(function (s) {
        sec.appendChild(h('div', { class: 'nt-say' }, h('p', null, h('b', { class: 'num' }, '+' + mmss(s.t0) + '–' + mmss(s.t1) + ' '), bio(s.title, 'span')), bio(s.say, 'p'), mirror(s.say, 'p', 'nt-mirror'), h('p', { class: 'nt-more' }, h('em', null, bio(s.act, 'span')))));
      });
    } else if (ST.path === '3' && m.say3) sec.appendChild(sayBlock(m.say3));
    else if (ST.path === '7') { if (m.say3) sec.appendChild(sayBlock(m.say3)); if (m.more7) { sec.appendChild(h('h4', null, bi('وأضِف في المسار الممتد', 'Add in the extended path'))); sec.appendChild(sayBlock(m.more7, 'more')); } }
    else if (m.more7) sec.appendChild(sayBlock(m.more7, 'more'));
    notes.appendChild(sec);
    if (m.live && ST.path === '7' && m.more7) { var s2 = h('div', { class: 'nt-sec' }, h('h4', null, bi('وأضِف في المسار الممتد', 'Add in the extended path')), sayBlock(m.more7, 'more')); notes.appendChild(s2); }
    if (m.act) notes.appendChild(h('div', { class: 'nt-sec' }, h('h4', null, bi('افعل', 'Do')), h('div', { class: 'nt-do' }, bio(m.act, 'span'))));
    if (m.weak) notes.appendChild(h('div', { class: 'nt-sec' }, h('h4', null, iconNode('alert'), bi('نقطة ضعف — قلها أولًا', 'Weak spot — say it first')), h('div', { class: 'nt-weak' }, bio(m.weak, 'span'))));
    if (m.qa && m.qa.length) {
      var ql = h('div', { class: 'nt-qa' });
      m.qa.forEach(function (id) { var q = qaById(id); if (!q) return; var bt = h('button', { type: 'button' }, id + ' · ', bio(q.q, 'span')); bt.addEventListener('click', function () { if (ST.present) setPresent(false); openQA(id); }); ql.appendChild(bt); });
      notes.appendChild(h('div', { class: 'nt-sec' }, h('h4', null, bi('إن سُئلت', 'If asked')), ql));
    }
    var nx = nextIdx(1);
    if (PV && nx >= 0) notes.insertBefore(h('div', { class: 'nt-sec nt-preview' }, h('h4', null, bi('الشريحة التالية', 'Next slide')), h('div', { class: 'ov-frame' }, cloneSlide(slides[nx]))), notes.children[2] || null);
    if (!PV && !notes.querySelector('.nt-pv')) notes.appendChild(h('div', { class: 'nt-sec nt-pv' }, (function () { var b = h('button', { type: 'button', class: 'btn btn-sm btn-ghost' }, parseSvgIcon('external'), ' ', bi('افتح نافذة المقدّم', 'Open the presenter window')); b.addEventListener('click', openPresenter); return b; })(), h('p', { class: 'small muted' }, bi('نافذة ثانية بالملاحظات والمؤقّت والشريحة التالية، تتزامن مع الشاشة. اعرض الشرائح على الشاشة الكبيرة (F).', 'A second window with notes, timer and the next slide, kept in step with the screen. Present the slides on the big screen (F).'))));
    if (nx >= 0) notes.appendChild(h('p', { class: 'nt-next' }, bi('التالية: ', 'Next up: '), h('b', null, (nx + 1) + '. ' + slideTitle(nx)), ' · ', h('span', { class: 'num' }, budget(nx) ? mmss(budget(nx)) : '—')));
    updateTimerUI();
  }

  /* ==========================================================================
     SCRIPT TAB
     ========================================================================== */
  var ACC = { title: '--brand', problem: '--danger', gap: '--warn', solution: '--brand', proof: '--accent', hazards: '--brand', live: '--danger', people: '--safe', dispatch: '--info', evidence: '--warn', build: '--accent', close: '--brand' };
  function wc(s) { return s ? String(s).trim().split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length : 0; }
  function sayOf(m, p) {
    if (p === '3') return m.say3;
    if (m.say3 && m.more7) return { ar: m.say3.ar + ' ' + m.more7.ar, en: m.say3.en + ' ' + m.more7.en };
    return m.say3 || m.more7 || null;
  }
  function renderScript() {
    var root = $('#p-script'); if (!root) return;
    var p = ST.path, total = totalBudget(p), keep = root.classList.contains('no-mirror');
    root.replaceChildren(); root.classList.toggle('no-mirror', keep);
    // controls
    var b3 = h('button', { type: 'button', 'aria-pressed': p === '3' ? 'true' : 'false' }, bi('3 دقائق صارمة', '3 min strict')); b3.addEventListener('click', function () { setPath('3'); });
    var b7 = h('button', { type: 'button', 'aria-pressed': p === '7' ? 'true' : 'false' }, bi('7 دقائق ممتدة', '7 min extended')); b7.addEventListener('click', function () { setPath('7'); });
    var mir = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: keep ? null : '' }), h('span', null, bi('أظهر المرآة (اللغة الأخرى)', 'Show the mirror (other language)')));
    $('input', mir).addEventListener('change', function (e) { root.classList.toggle('no-mirror', !e.target.checked); });
    var pr = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, parseSvgIcon('print'), ' ', bi('اطبع النص (A4)', 'Print the script (A4)')); pr.addEventListener('click', function () { printNow('script'); });
    var intro = p === '3'
      ? { ar: 'نص كلامي بالثواني بالعربية البسيطة، ومعه المرآة الإنجليزية. هناك **لحظة حيّة واحدة فقط**: الحَكَم يقود غرفة العمليات. كل ما عداها يُقال من الشرائح. إن قاطعك الحَكَم فأجِب ثم عُد من المقطع التالي.', en: 'A second-by-second script in plain Arabic with an English mirror. There is **only ONE live moment**: the judge drives Mission Control. Everything else is said from the slides. If a judge interrupts, answer, then rejoin at the next segment.' }
      : { ar: 'المسار الممتد (7 دقائق): نص الثلاث دقائق نفسه ثم إضافات لكل شريحة. اللحظة الحيّة واحدة: غرفة العمليات.', en: 'The extended path (7 minutes): the same words as the 3-minute path, then additions for each slide. Still one live moment: Mission Control.' };
    var timeline = h('div', { class: 'sc-time', role: 'group', 'data-i18n-attr': 'aria-label:pt.progress' });
    var t = 0;
    SL.forEach(function (m, k) {
      var b = budget(k, p); if (!b) return;
      var seg = h('button', { type: 'button', class: 'sc-seg' + (m.live ? ' live' : ''), 'data-n': String(k + 1), style: '--w:' + b + ';--c:var(' + ACC[m.id] + ')', title: slideTitle(k) },
        h('b', { class: 'num' }, mmss(t)), h('span', null, (k + 1) + ' · ' + slideTitle(k)));
      seg.addEventListener('click', function () { var r = $('#sc-' + (k + 1)); if (r) r.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); });
      timeline.appendChild(seg); t += b;
    });
    var ticks = h('div', { class: 'sc-ticks', 'aria-hidden': 'true' });
    for (var s = 0; s <= total; s += (p === '3' ? 30 : 60)) ticks.appendChild(h('span', null, mmss(s)));
    root.appendChild(h('div', { class: 'sc-top' }, h('div', { class: 'sc-intro' }, h('p', null, bio(intro, 'span')), h('div', { class: 'sc-ctl' }, h('div', { class: 'seg-toggle', role: 'group', 'data-i18n-attr': 'aria-label:pt.path' }, b3, b7), mir, pr)), timeline, ticks));
    // rows
    var ol = h('ol', { class: 'sc-list' }); t = 0;
    SL.forEach(function (m, k) {
      var b = budget(k, p); if (!b) return;
      var start = t, end = t + b; t = end;
      var say = sayOf(m, p), words = say ? wc(say.ar) : 0, wordsEn = say ? wc(say.en) : 0;
      var kids = [];
      kids.push(h('div', { class: 'sc-title' }, h('span', { class: 'tag cool num' }, (k + 1) + ''), bio(m.title, 'span'), m.live ? h('span', { class: 'tag danger' }, h('span', { class: 'dot live' }), bi('اللحظة الحيّة الواحدة', 'The ONE live moment')) : null));
      if (m.live && p === '3') {
        var st = h('div', { class: 'sc-steps' });
        LIVE.forEach(function (s2) {
          st.appendChild(h('div', { class: 'sc-step' }, h('b', { class: 'num' }, mmss(start + s2.t0) + '–' + mmss(start + s2.t1)),
            h('div', { class: 'sc-body' }, h('div', { class: 'sc-title' }, bio(s2.title, 'span')), bi(s2.say.ar, s2.say.en, 'p', 'sc-say'), mirror(s2.say, 'p', 'sc-mirror'), h('div', { class: 'sc-do' }, h('b', null, bi('افعل: ', 'Do: ')), bio(s2.act, 'span')))));
        });
        kids.push(st);
      } else if (say) {
        kids.push(bi(say.ar, say.en, 'p', 'sc-say')); kids.push(mirror(say, 'p', 'sc-mirror'));
        if (m.live && m.more7 && p === '7') { /* included in say */ }
      }
      if (m.act && !(m.live && p === '3')) kids.push(h('div', { class: 'sc-do' }, h('b', null, bi('افعل: ', 'Do: ')), bio(m.act, 'span')));
      if (m.live && p === '3') kids.push(h('div', { class: 'sc-do' }, h('b', null, bi('قبل البدء: ', 'Before you start: ')), bio(m.weak, 'span'), ' ', h('b', null, bi('· عند الفشل: ', '· If it fails: ')), bi('انتقل إلى «إذا تعطّل العرض» أدناه.', 'use "If the demo fails" below.')));
      if (words) {
        // Each language reports its own count: the Arabic line is paced on Arabic words, the English mirror on English words.
        var wpm = Math.round(words / (b / 60)), wpmEn = Math.round(wordsEn / (b / 60));
        kids.push(h('div', { class: 'sc-pace' + ((wpm > 175 || wpmEn > 175) && !m.live ? ' fast' : '') }, bi(words + ' كلمة · ' + wpm + ' كلمة/دقيقة' + (m.live ? ' · يتضمن صمتًا أثناء عمل الحَكَم' : ''), wordsEn + ' English words · ' + wpmEn + ' wpm' + (m.live ? ' · includes silence while the judge works' : ''))));
      }
      ol.appendChild(h('li', { class: 'sc-row' + (m.live ? ' sc-live' : ''), id: 'sc-' + (k + 1) },
        h('div', { class: 'sc-when' }, h('b', { class: 'num' }, mmss(start) + '–' + mmss(end)), h('small', null, bi('الميزانية ', 'Budget '), mmss(b))),
        h('div', { class: 'sc-body' }, kids)));
    });
    root.appendChild(ol);
    // fallback
    var fb = h('section', { class: 'sc-fallback', id: 'sc-fallback' });
    fb.appendChild(h('h3', null, iconNode('alert'), bi('إذا تعطّل العرض', 'If the demo fails')));
    fb.appendChild(h('div', { class: 'note warn' }, bi(FB_RULE.ar, FB_RULE.en, 'p'), ));
    FB.forEach(function (x) {
      fb.appendChild(h('div', { class: 'fb-lv' }, h('div', { class: 'fb-n num' }, String(x.n)),
        h('div', { class: 'sc-body' }, h('h4', null, bio(x.title, 'span')), bi(x.say.ar, x.say.en, 'p', 'sc-say'), mirror(x.say, 'p', 'sc-mirror'), h('div', { class: 'sc-do' }, h('b', null, bi('افعل: ', 'Do: ')), bio(x.act, 'span')))));
    });
    root.appendChild(fb);
    M.applyI18n(root);
  }

  /* ==========================================================================
     Q&A TAB  (grouped, searchable; weak spots flagged)
     ========================================================================== */
  var QS = { g: 'all', q: '', weak: false };
  function norm(s) {
    return String(s).toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function srcLine(ids) { return ids.map(function (id) { return (SRCN[id] || id) + ' (' + id + ')'; }).join(' · '); }
  M.strings({ 'pt.qa.search': { ar: 'ابحث في الأسئلة والأجوبة…', en: 'Search questions and answers…' } });
  function renderQA() {
    var root = $('#p-qa'); if (!root) return;
    root.replaceChildren();
    var weakN = QA.filter(function (q) { return q.weak; }).length;
    var search = h('input', { type: 'search', class: 'input', id: 'qa-q', autocomplete: 'off', 'data-i18n-attr': 'placeholder:pt.qa.search;aria-label:pt.qa.search' });
    search.addEventListener('input', function () { QS.q = search.value; filterQA(); });
    var expand = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, bi('افتح الكل', 'Expand all')); expand.addEventListener('click', function () { $$('.qa-item', root).forEach(function (d) { if (!d.hidden) d.open = true; }); });
    var collapse = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, bi('اطوِ الكل', 'Collapse all')); collapse.addEventListener('click', function () { $$('.qa-item', root).forEach(function (d) { d.open = false; }); });
    var pr = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, parseSvgIcon('print'), ' ', bi('اطبع الأسئلة (A4)', 'Print Q&A (A4)')); pr.addEventListener('click', function () { printNow('qa'); });
    var both = h('label', { class: 'switch' }, h('input', { type: 'checkbox' }), h('span', null, bi('اللغتان معًا عند الطباعة', 'Both languages when printing'))); $('input', both).addEventListener('change', function (e) { html.classList.toggle('print-both', e.target.checked); });
    var chips = h('div', { class: 'qa-chips', role: 'group', 'data-i18n-attr': 'aria-label:pt.tabs' });
    function chip(id, label, n, weak) {
      var c = h('button', { type: 'button', class: 'chip', 'data-g': id, 'aria-pressed': 'false' }, weak ? iconNode('alert') : null, bio(label), ' ', h('span', { class: 'n num' }, String(n)));
      c.addEventListener('click', function () { if (weak) { QS.weak = !QS.weak; } else { QS.g = id; } syncChips(); filterQA(); });
      chips.appendChild(c); return c;
    }
    chip('all', { ar: 'الكل', en: 'All' }, QA.length);
    QG.forEach(function (g) { chip(g.id, g, QA.filter(function (q) { return q.g === g.id; }).length); });
    chip('weak', { ar: 'نقاط الضعف — قلها أولًا', en: 'Weak spots — say first' }, weakN, true);
    function syncChips() { $$('.chip', chips).forEach(function (c) { var id = c.getAttribute('data-g'); c.setAttribute('aria-pressed', id === 'weak' ? (QS.weak ? 'true' : 'false') : (id === QS.g ? 'true' : 'false')); }); }
    var count = h('p', { class: 'qa-count', id: 'qa-count', role: 'status', 'aria-live': 'polite' });
    root.appendChild(h('div', { class: 'qa-top' },
      h('p', { class: 'muted' }, bi('أسئلة قاسية بأجوبة صادقة. الأرقام من المصادر الموثّقة فقط، ولكل نقطة ضعف جملة تُقال أولًا. الأسئلة المعلَّمة «عدّل جوابك» تحتاج حقائقك أنت.', 'Tough questions with honest answers. Numbers come only from the verified sources, and every weak spot has a sentence to say first. Questions tagged "edit your answer" need your own facts.')),
      h('div', { class: 'qa-search' }, search, expand, collapse, pr, both), chips, count));
    // opening disclosures
    var ol = h('ol', null); OPENING.forEach(function (o) { ol.appendChild(h('li', null, h('span', null, bi(o.ar, o.en, 'span'), mirror(o, 'small', 'qa-mirror-inline')))); });
    root.appendChild(h('aside', { class: 'pt-card qa-open' }, h('h3', null, iconNode('flag'), bi('افتح بها: ست اعترافات صادقة (30 ثانية)', 'Open with these: six honest disclosures (30 seconds)')),
      h('p', { class: 'muted small' }, bi('الحَكَم يكافئ مَن يذكر حدوده قبل أن يُسأل.', 'Judges reward the team that states its limits before being asked.')), ol));
    // groups
    var list = h('div', { class: 'qa-list' });
    QG.forEach(function (g) {
      var sec = h('section', { class: 'qa-group', 'data-g': g.id }, h('h3', null, iconNode(g.icon), bio(g, 'span'), h('small', { class: 'num' }, QA.filter(function (q) { return q.g === g.id; }).length + '')));
      QA.filter(function (q) { return q.g === g.id; }).forEach(function (q) {
        var flags = h('span', { class: 'qa-flags' }, q.weak ? h('span', { class: 'tag warn' }, bi('نقطة ضعف', 'Weak spot')) : null, q.fill ? h('span', { class: 'tag info' }, bi('عدّل جوابك', 'Edit your answer')) : null);
        var body = h('div', { class: 'qa-a' });
        if (q.first) body.appendChild(h('div', { class: 'qa-first' }, h('small', null, iconNode('alert'), ' ', bi('قلها أولًا', 'Say it first')), bio(q.first, 'span'), mirror(q.first, 'small', 'qa-mirror-inline')));
        body.appendChild(h('div', { class: 'qa-text' }, bi(q.a.ar, q.a.en, 'p')));
        body.appendChild(h('div', { class: 'qa-mirror' }, mirror(q.a, 'p')));
        if (q.fill) body.appendChild(h('div', { class: 'qa-fill' }, iconNode('alert'), ' ', bio(FILL, 'span')));
        var meta = h('div', { class: 'qa-src' });
        if (q.src && q.src.length) meta.appendChild(h('span', null, h('b', null, bi('المصادر: ', 'Sources: ')), srcLine(q.src)));
        if (q.slide) { var jb = h('button', { type: 'button' }, bi('اعرض الشريحة ' + q.slide, 'Show slide ' + q.slide)); jb.addEventListener('click', function () { showTab('slides', true); goTo(q.slide - 1, { force: true }); try { stage.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ } }); meta.appendChild(jb); }
        body.appendChild(meta);
        var det = h('details', { class: 'qa-item' + (q.weak ? ' weak' : ''), id: 'q-' + q.id, 'data-g': q.g, 'data-w': q.weak ? '1' : '0' },
          h('summary', null, h('span', { class: 'qa-q' }, h('span', { class: 'qa-id' }, q.id), bi(q.q.ar, q.q.en, 'span'), flags)), body);
        det.setAttribute('data-t', norm(q.q.ar + ' ' + q.q.en + ' ' + q.a.ar + ' ' + q.a.en + ' ' + (q.first ? q.first.ar + ' ' + q.first.en : '') + ' ' + q.id + ' ' + (q.src || []).join(' ')));
        det.addEventListener('toggle', function () { if (det.open) setHash('#q-' + q.id); });
        sec.appendChild(det);
      });
      list.appendChild(sec);
    });
    list.appendChild(h('p', { class: 'qa-empty', id: 'qa-empty', hidden: '' }, bi('لا توجد أسئلة مطابقة. جرّب كلمة أخرى (مثلًا: مسيّرة، تكلفة، خصوصية، 999).', 'No matching questions. Try another word (for example: drone, cost, privacy, 999).')));
    root.appendChild(list);
    syncChips(); M.applyI18n(root); filterQA();
  }
  function filterQA() {
    var root = $('#p-qa'); if (!root) return;
    var toks = norm(QS.q).split(' ').filter(Boolean), shown = 0;
    $$('.qa-item', root).forEach(function (d) {
      var ok = (QS.g === 'all' || d.getAttribute('data-g') === QS.g) && (!QS.weak || d.getAttribute('data-w') === '1');
      if (ok && toks.length) { var t = d.getAttribute('data-t'); ok = toks.every(function (x) { return t.indexOf(x) >= 0; }); }
      d.hidden = !ok; if (ok) shown++;
    });
    $$('.qa-group', root).forEach(function (g) { g.hidden = !$$('.qa-item:not([hidden])', g).length; });
    var em = $('#qa-empty', root); if (em) em.hidden = shown > 0;
    var c = $('#qa-count', root); if (c) setKids(c, bi(shown + ' من ' + QA.length + ' سؤالًا', shown + ' of ' + QA.length + ' questions'));
  }

  /* ==========================================================================
     BOOTH TAB
     ========================================================================== */
  var CKS = jget('manara-pitch-checks', {});
  var RH = { running: false, done: false, t0: 0, seg: 0, segStart: 0, splits: [], iv: 0 };
  function rhSegs() { return SL.map(function (s, k) { return { k: k, b: s.t3, m: s }; }).filter(function (x) { return x.b > 0; }); }
  function rhRuns() { var r = jget('manara-pitch-rehearsals', []); return Array.isArray(r) ? r : []; }
  function renderBooth() {
    var root = $('#p-booth'); if (!root) return;
    root.replaceChildren();
    var grid = h('div', { class: 'bt-grid' });
    // checklist
    var all = []; CK.forEach(function (g) { g.items.forEach(function (it) { all.push(it.id); }); });
    var prog = h('div', { class: 'bt-prog' }, h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(all.length) }, h('i')), h('b', { class: 'num', dir: 'ltr' }));
    function updateProg() { var n = all.filter(function (id) { return CKS[id]; }).length; prog.querySelector('i').style.setProperty('--v', (n / all.length * 100).toFixed(1)); prog.querySelector('b').textContent = n + ' / ' + all.length; prog.firstChild.setAttribute('aria-valuenow', String(n)); }
    var ck = h('section', { class: 'pt-card bt-check' }, h('h3', null, iconNode('check'), bi('قائمة الطاولة', 'Booth checklist')), prog);
    CK.forEach(function (g) {
      var ul = h('div', { class: 'ck-list' });
      g.items.forEach(function (it) {
        var cb = h('input', { type: 'checkbox', id: 'ck-' + it.id }); cb.checked = !!CKS[it.id];
        cb.addEventListener('change', function () { CKS[it.id] = cb.checked; if (!cb.checked) delete CKS[it.id]; jset('manara-pitch-checks', CKS); updateProg(); });
        ul.appendChild(h('label', { class: 'ck' }, cb, h('span', null, bi(it.ar, it.en, 'span'), it.sub ? h('small', null, bio(it.sub, 'span')) : null)));
      });
      ck.appendChild(h('div', { class: 'ck-group' }, h('h4', null, iconNode(g.icon), bio(g.h, 'span'), h('small', { class: 'num' }, g.items.length + '')), ul));
    });
    var rs = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, parseSvgIcon('reset'), ' ', bi('امسح العلامات', 'Clear the ticks')); rs.addEventListener('click', function () { CKS = {}; jset('manara-pitch-checks', CKS); $$('input[type=checkbox]', ck).forEach(function (c) { c.checked = false; }); updateProg(); });
    var pr = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, parseSvgIcon('print'), ' ', bi('اطبع القائمة', 'Print the booth sheet')); pr.addEventListener('click', function () { printNow('booth'); });
    ck.appendChild(h('div', { class: 'bt-actions' }, pr, rs));
    updateProg();
    // plan + roles
    var plan = h('section', { class: 'pt-card plan' }, h('h3', null, iconNode('users'), bi('مَن يقف أين', 'Who stands where')), buildPlan(),
      h('ul', { class: 'roles' }, ROLES.map(function (r) { return h('li', null, h('b', { class: 'rn', style: '--rc:var(' + r.c + ')' }, r.n), h('span', null, bio(r, 'span'))); })),
      h('p', { class: 'small muted' }, bi('فريق من شخص واحد؟ المقدّم يؤدي الأدوار كلها، ويُعرض جدار الهواتف داخل نافذة «هواتف السكان» على الحاسوب.', 'A one-person team? The presenter plays every role, and the phone wall is shown inside the Resident Phones window on the laptop.')));
    // rehearsal
    var rh = h('section', { class: 'pt-card bt-rehearse', id: 'rh' }); rh.appendChild(h('h3', null, iconNode('clock'), bi('مؤقّت التدريب (مسار الثلاث دقائق)', 'Rehearsal timer (3-minute path)'))); rh.appendChild(h('div', { id: 'rh-body' }));
    var left = h('div', { class: 'stack' }, ck), right = h('div', { class: 'stack' }, plan, rh);
    grid.appendChild(left); grid.appendChild(right);
    root.appendChild(grid);
    // risks
    var risks = h('section', { class: 'pt-card bt-wide', style: 'margin-top:18px' }, h('h3', null, iconNode('alert'), bi('أخطر عشر نقاط فشل — وإصلاحها', 'The ten highest-risk failure points — and their fixes')));
    var rl = h('div', { class: 'risk-list' });
    RISKS.forEach(function (r) {
      rl.appendChild(h('details', { class: 'risk' }, h('summary', null, bio(r.t, 'span'), h('span', { class: 'tag ' + (r.sev === 'high' ? 'danger' : r.sev === 'med' ? 'warn' : 'neutral') }, r.sev === 'high' ? bi('عالٍ', 'High') : r.sev === 'med' ? bi('متوسط', 'Medium') : bi('منخفض', 'Low'))),
        h('div', { class: 'risk-b' }, h('p', null, h('b', null, bi('ما الذي يحدث: ', 'What goes wrong: ')), bio(r.why, 'span')), h('p', null, h('b', null, bi('الإصلاح قبل الموعد: ', 'Fix beforehand: ')), bio(r.fix, 'span')), h('p', { class: 'sayit' }, h('b', null, bi('وإن حدث، قل: ', 'If it happens, say: ')), bio(r.say, 'span')))));
    });
    risks.appendChild(rl); root.appendChild(risks);
    // numbers cheat-sheet
    var tb = h('tbody'); NUMS.forEach(function (n) { tb.appendChild(h('tr', null, h('td', null, n[0]), h('td', null, bio(n[1], 'span')), h('td', null, typeof n[2] === 'string' ? n[2] : bio(n[2], 'span')), h('td', null, bio(n[3], 'span')))); });
    root.appendChild(h('section', { class: 'pt-card bt-wide', style: 'margin-top:18px' }, h('h3', null, iconNode('chart'), bi('الأرقام المسموح لك بذكرها — ومصادرها', 'Numbers you may say — and their sources')),
      h('p', { class: 'muted small' }, bi('أي رقم غير موجود هنا فجوابه «غير متاح». لا تخترع رقمًا أبدًا.', 'Any number not in this table is "N/A". Never invent a number.')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table num-table' }, h('thead', null, h('tr', null, h('th', null, bi('الرقم', 'Number')), h('th', null, bi('ماذا يعني', 'What it is')), h('th', null, bi('المصدر', 'Source')), h('th', null, bi('ملاحظة', 'Note')))), tb))));
    // my details + numbers
    var mineCard = h('section', { class: 'pt-card bt-wide bt-mine no-print', style: 'margin-top:18px' }, h('h3', null, iconNode('star'), bi('بياناتي وأرقامي أنا', 'My details and my own numbers')),
      h('p', { class: 'muted small' }, bi('تُحفظ في هذا المتصفح فقط ولا تُرسل إلى أي مكان. تظهر على شريحة العنوان وفي عمود «لم يُنجَز» بشريحة الأدلة. اتركها فارغة إن لم تقسها: يظهر «غير متاح».', 'Saved in this browser only, never sent anywhere. They appear on the title slide and in the "Not yet" column of the Evidence slide. Leave a field empty if you have not measured it: it shows "N/A".')));
    var fields = [['team', 'اسم الفريق', 'Team name'], ['names', 'اسمك/أسماؤكم', 'Your name(s)'], ['school', 'المدرسة', 'School'], ['mentor', 'المرشد', 'Mentor'],
      ['latency', 'زمن استجابة اللوحة (مثال: 180 ms)', 'Board latency (e.g. 180 ms)'], ['falsealarm', 'إنذارات كاذبة (مثال: 0 في 12 ساعة)', 'False alarms (e.g. 0 in 12 h)'],
      ['comprehension', 'اختبار الفهم (مثال: n=24، 83%)', 'Comprehension test (e.g. n=24, 83%)'], ['review', 'مراجعة اللغات (مثال: ML, NE موقّعة)', 'Language review (e.g. ML, NE signed off)']];
    var mg = h('div', { class: 'mine-grid' });
    fields.forEach(function (f) {
      var inp = h('input', { type: 'text', class: 'input', maxlength: '90', autocomplete: 'off', value: mine(f[0]) });
      inp.addEventListener('input', function () { MINE[f[0]] = inp.value.slice(0, 90); jset('manara-pitch-mine', MINE); renderMine(); });
      mg.appendChild(h('label', { class: 'field' }, h('span', null, bi(f[1], f[2])), inp));
    });
    mineCard.appendChild(mg); root.appendChild(mineCard);
    M.applyI18n(root);
    rhRender();
  }
  function buildPlan() {
    var svg = sv('svg', { class: 'plan-svg', viewBox: '0 0 480 300', role: 'img', 'aria-labelledby': 'plan-d', focusable: 'false' });
    var T1 = function (x, y, ar, en, cls, anchor) { return svBi(ar, en, { x: x, y: y, class: 'pl-t ' + (cls || ''), 'text-anchor': anchor || 'middle' }); };
    svg.appendChild(sv('rect', { x: 8, y: 8, width: 464, height: 284, rx: 10, fill: 'none', stroke: 'var(--line-2)' }));
    svg.appendChild(sv('rect', { class: 'pl-screen', x: 190, y: 40, width: 100, height: 14, rx: 3 })); svg.appendChild(T1(240, 34, 'الشاشة', 'Screen', 'b'));
    svg.appendChild(sv('rect', { class: 'pl-table', x: 110, y: 100, width: 260, height: 70, rx: 6 }));
    svg.appendChild(sv('rect', { class: 'pl-dev', x: 200, y: 112, width: 80, height: 46, rx: 4 })); svg.appendChild(T1(240, 140, 'الحاسوب', 'Laptop'));
    svg.appendChild(sv('rect', { class: 'pl-dev', x: 120, y: 112, width: 62, height: 46, rx: 4 })); svg.appendChild(T1(151, 140, 'لوحة التوأم', 'Twin board'));
    [296, 313, 330, 347].forEach(function (x) { svg.appendChild(sv('rect', { class: 'pl-dev', x: x, y: 114, width: 13, height: 24, rx: 3 })); }); svg.appendChild(T1(325, 158, 'جدار الهواتف', 'Phone wall'));
    svg.appendChild(sv('rect', { class: 'pl-aisle', x: 24, y: 190, width: 432, height: 90, rx: 8 })); svg.appendChild(T1(240, 276, 'ممر الزوّار', 'Visitor aisle'));
    function dot(cls, x, y, letter) { var g = sv('g'); g.appendChild(sv('circle', { class: cls, cx: x, cy: y, r: 13 })); if (letter) { var t = sv('text', { class: 'pl-n', x: x, y: y + 4.5, 'text-anchor': 'middle' }); t.textContent = letter; g.appendChild(t); } svg.appendChild(g); }
    dot('pl-who', 190, 214, 'P'); dot('pl-who', 290, 214, 'O'); dot('pl-who', 395, 128, 'W'); dot('pl-who', 80, 128, 'S');
    svg.appendChild(sv('circle', { class: 'pl-judge', cx: 230, cy: 252, r: 11 })); svg.appendChild(sv('circle', { class: 'pl-judge', cx: 258, cy: 252, r: 11 })); svg.appendChild(T1(344, 256, 'الحَكَم', 'Judges', 'b'));
    svg.appendChild(sv('path', { d: 'M30 222 L58 222', stroke: 'var(--ink-2)', 'stroke-width': 2, fill: 'none', 'marker-end': '' })); svg.appendChild(T1(64, 226, 'مدخل', 'Entry', '', 'start'));
    var wrap = h('div', null, h('span', { id: 'plan-d' }, bi('مخطط علوي للطاولة: الشاشة خلف الطاولة، وعلى الطاولة الحاسوب ولوحة التوأم وجدار الهواتف، والمقدّم ومرافق الحَكَم أمام الطاولة، والحَكَم في الممر.', 'A top view of the booth: the screen behind the table; on the table the laptop, twin board and phone wall; the presenter and judge guide in front of the table; the judges in the aisle.', 'span', 'sr-only')), svg);
    return wrap;
  }
  /* rehearsal timer */
  function rhRender() {
    var body = $('#rh-body'); if (!body) return;
    var segs = rhSegs(), runs = rhRuns();
    body.replaceChildren();
    if (!RH.running && !RH.done) {
      body.appendChild(h('div', { class: 'rh-clock num', 'data-st': '' }, '00:00 / ' + mmss(totalBudget('3'))));
      body.appendChild(h('p', { class: 'rh-cue' }, bi('اضغط «ابدأ» وتكلّم النص. اضغط «المقطع التالي» (أو Space) عند انتهاء كل مقطع، وسنقارنك بالخطة.', 'Press Start and speak the script. Press "Next segment" (or Space) when you finish each segment and we compare you with the plan.')));
      var st = h('button', { type: 'button', class: 'btn btn-primary' }, parseSvgIcon('play'), ' ', bi('ابدأ التدريب', 'Start rehearsal')); st.addEventListener('click', rhStart);
      body.appendChild(h('div', { class: 'rh-ctl' }, st));
    } else if (RH.running) {
      var cur = segs[RH.seg];
      body.appendChild(h('div', { class: 'rh-clock num', id: 'rh-clock' }, '00:00'));
      body.appendChild(h('div', { class: 'rh-bar', id: 'rh-bar' }, h('i')));
      body.appendChild(h('div', { class: 'rh-cue' }, h('span', { class: 'num' }, (RH.seg + 1) + '/' + segs.length + ' · '), bio(cur.m.title, 'span'), h('small', null, bi('الميزانية ' + cur.b + ' ث', 'Budget ' + cur.b + ' s'), cur.m.live ? ' · ' : '', cur.m.live ? bi('اللحظة الحيّة — اصمت بينما يعمل الحَكَم', 'the live moment — stay quiet while the judge works') : null)));
      var nx = h('button', { type: 'button', class: 'btn btn-primary' }, bi('المقطع التالي', 'Next segment')); nx.addEventListener('click', rhNext);
      var sp = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, bi('أوقف', 'Stop')); sp.addEventListener('click', function () { clearInterval(RH.iv); RH.running = false; RH.done = false; rhRender(); });
      body.appendChild(h('div', { class: 'rh-ctl' }, nx, sp)); rhTick();
    } else {
      var total = RH.splits.reduce(function (a, b) { return a + b; }, 0);
      var tb = h('tbody');
      segs.forEach(function (sg, i) { var a = RH.splits[i] || 0, d = a - sg.b; tb.appendChild(h('tr', null, h('td', null, bio(sg.m.title, 'span')), h('td', null, mmss(sg.b)), h('td', null, mmss(a)), h('td', { class: d > 2 ? 'over' : d < -2 ? 'under' : '' }, (d > 0 ? '+' : d < 0 ? '−' : '±') + mmss(Math.abs(d))))); });
      var dT = total - 180;
      tb.appendChild(h('tr', null, h('td', null, h('b', null, bi('المجموع', 'Total'))), h('td', null, '03:00'), h('td', null, h('b', null, mmss(total))), h('td', { class: dT > 2 ? 'over' : dT < -2 ? 'under' : '' }, (dT > 0 ? '+' : dT < 0 ? '−' : '±') + mmss(Math.abs(dT)))));
      body.appendChild(h('div', { class: 'rh-clock num', 'data-st': total > 183 ? 'over' : total > 170 ? 'soon' : '' }, mmss(total)));
      body.appendChild(h('div', { class: 'rh-log table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, bi('المقطع', 'Segment')), h('th', null, bi('الخطة', 'Plan')), h('th', null, bi('أنت', 'You')), h('th', null, bi('الفرق', 'Diff')))), tb)));
      var again = h('button', { type: 'button', class: 'btn btn-primary' }, parseSvgIcon('reset'), ' ', bi('مرة أخرى', 'Again')); again.addEventListener('click', function () { RH.done = false; rhStart(); });
      body.appendChild(h('div', { class: 'rh-ctl' }, again));
    }
    var n = rhRuns().length;
    body.appendChild(h('p', { class: 'rh-count' }, bi('تدريبات محفوظة: ' + n + ' / 5 على الأقل', 'Saved rehearsals: ' + n + ' / at least 5'), runs.length ? ' · ' : '', runs.length ? bi('آخرها ', 'last ') : null, runs.length ? h('b', { class: 'num' }, mmss(runs[runs.length - 1].total)) : null));
    M.applyI18n(body);
  }
  function rhStart() { RH.running = true; RH.done = false; RH.t0 = performance.now(); RH.seg = 0; RH.segStart = 0; RH.splits = []; clearInterval(RH.iv); RH.iv = setInterval(rhTick, 200); rhRender(); }
  function rhNext() {
    if (!RH.running) return;
    var segs = rhSegs(), e = (performance.now() - RH.t0) / 1000;
    RH.splits.push(e - RH.segStart); RH.segStart = e; RH.seg++;
    if (RH.seg >= segs.length) {
      clearInterval(RH.iv); RH.running = false; RH.done = true;
      var runs = rhRuns(); runs.push({ ts: Date.now(), total: e, splits: RH.splits.slice() }); jset('manara-pitch-rehearsals', runs.slice(-10));
    }
    rhRender();
  }
  function rhTick() {
    if (!RH.running) return;
    var segs = rhSegs(), e = (performance.now() - RH.t0) / 1000, cur = segs[RH.seg]; if (!cur) return;
    var inSeg = e - RH.segStart, left = cur.b - inSeg, st = left < 0 ? 'over' : left <= cur.b * 0.2 ? 'soon' : '';
    var ck = $('#rh-clock'), br = $('#rh-bar');
    if (ck) { ck.textContent = mmss(e) + ' · ' + (left >= 0 ? '−' : '+') + mmss(Math.abs(left)); ck.setAttribute('data-st', st); }
    if (br) { br.setAttribute('data-st', st); br.firstChild.style.setProperty('--v', clamp(inSeg / cur.b * 100, 0, 100).toFixed(1)); }
  }
  doc.addEventListener('keydown', function (e) {
    if (ST.tab !== 'booth' || !RH.running || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    if (e.key === ' ' && !(e.target.closest && e.target.closest('button,a,summary,input'))) { e.preventDefault(); rhNext(); }
  });

  /* ==========================================================================
     PRINT  (slides: A4 landscape · script, Q&A, booth: A4 portrait)
     ========================================================================== */
  var printing = null, qaOpenState = [];
  function buildPrintRoot(withNotes) {
    var root = $('#print-root'); root.replaceChildren();
    slides.forEach(function (s, k) {
      var page = h('div', { class: 'print-page' + (withNotes ? ' with-notes' : '') });
      page.appendChild(h('div', { class: 'pp-stage' }, cloneSlide(s)));
      if (withNotes) {
        var m = SL[k], say = sayOf(m, '7');
        page.appendChild(h('div', { class: 'pp-notes' }, h('h4', null, (k + 1) + '. ', bio(m.title, 'span'), ' · ', mmss(m.t3) + ' / ' + mmss(m.t7)),
          say ? bi(say.ar, say.en, 'p') : null, m.act ? h('p', null, h('b', null, bi('افعل: ', 'Do: ')), bio(m.act, 'span')) : null, m.weak ? h('p', null, h('b', null, bi('قلها أولًا: ', 'Say first: ')), bio(m.weak, 'span')) : null));
      }
      root.appendChild(page);
    });
  }
  function beforePrint(kind, withNotes) {
    if (printing) return;
    printing = kind; html.classList.add('print-' + kind);
    if (kind === 'slides') buildPrintRoot(withNotes);
    else if (kind === 'script') { if (!$('#p-script').firstChild) renderScript(); }
    else if (kind === 'qa') { if (!$('#p-qa').firstChild) renderQA(); qaOpenState = $$('.qa-item').map(function (d) { return d.open; }); $$('.qa-item').forEach(function (d) { d.open = true; }); }
    else if (kind === 'booth') { if (!$('#p-booth').firstChild) renderBooth(); $$('#p-booth details').forEach(function (d) { d.setAttribute('data-was', d.open ? '1' : '0'); d.open = true; }); }
  }
  function afterPrint() {
    if (!printing) return;
    html.classList.remove('print-slides', 'print-script', 'print-qa', 'print-booth');
    $('#print-root').replaceChildren();
    if (printing === 'qa') $$('.qa-item').forEach(function (d, k) { d.open = !!qaOpenState[k]; });
    if (printing === 'booth') $$('#p-booth details').forEach(function (d) { d.open = d.getAttribute('data-was') === '1'; });
    printing = null;
  }
  function printNow(kind, withNotes) {
    if (['slides', 'script', 'qa', 'booth'].indexOf(kind) < 0) kind = 'slides';
    beforePrint(kind, withNotes);
    setTimeout(function () { try { window.print(); } catch (e) { /* ignore */ } setTimeout(afterPrint, 400); }, 80);
  }
  window.addEventListener('beforeprint', function () { if (!printing) beforePrint(ST.tab === 'slides' ? 'slides' : ST.tab); });
  window.addEventListener('afterprint', afterPrint);

  /* ==========================================================================
     TABS + BOOT
     ========================================================================== */
  var TABS = ['slides', 'script', 'qa', 'booth'], rendered = {};
  function showTab(name, noHash) {
    if (TABS.indexOf(name) < 0) name = 'slides';
    ST.tab = name;
    TABS.forEach(function (t) {
      var on = t === name, b = $('#t-' + t), p = $('#p-' + t);
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; p.hidden = !on;
    });
    if (name === 'script' && !rendered.script) { renderScript(); rendered.script = 1; }
    if (name === 'qa' && !rendered.qa) { renderQA(); rendered.qa = 1; }
    if (name === 'booth' && !rendered.booth) { renderBooth(); rendered.booth = 1; }
    if (name !== 'slides' && ST.present) setPresent(false);
    if (!noHash && name !== 'slides') setHash('#' + name); else if (!noHash && name === 'slides') setHash('#s' + (ST.i + 1));
    if (name === 'slides') applyMode();
  }
  function readHash() {
    var hs = (location.hash || '').replace(/^#/, ''), m;
    if ((m = /^s(\d+)$/.exec(hs))) return { tab: 'slides', slide: clamp(+m[1] - 1, 0, N - 1) };
    if ((m = /^q-([A-Z]\d+)$/.exec(hs))) return { tab: 'qa', q: m[1] };
    if (TABS.indexOf(hs) >= 0) return { tab: hs };
    return { tab: 'slides' };
  }
  function applyHash(first) {
    var o = readHash();
    showTab(o.tab, true);
    if (o.slide != null) goTo(o.slide, { force: true, noHash: true, noScroll: true });
    if (o.q) { var it = $('#q-' + o.q); if (it) { it.open = true; setTimeout(function () { try { it.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ } }, 50); } }
  }
  function boot() {
    if (SL.length !== N) console.error('pitch: slide data (' + SL.length + ') and slides (' + N + ') differ');
    buildBeacon(); buildGap(); buildPipe(); buildHazards(); buildLiveSteps(); buildPeople(); buildBuild(); buildClose(); buildDpHow();
    slides.forEach(function (s) { $$('.sl-in', s).forEach(function (e, k) { e.style.setProperty('--d', Math.min(k, 9)); }); });
    initProof(); initBuilding(); dpInit(); initEvidence(); renderMine();
    buildBar();
    $('#pt-tabs').setAttribute('aria-label', T('أقسام العرض', 'Pitch sections'));
    // tabs
    var tabEls = TABS.map(function (t) { return $('#t-' + t); });
    tabEls.forEach(function (b, k) {
      b.addEventListener('click', function () { showTab(TABS[k]); });
      b.addEventListener('keydown', function (e) {
        var rtl = html.dir === 'rtl', d = 0;
        if (e.key === 'ArrowRight') d = rtl ? -1 : 1; else if (e.key === 'ArrowLeft') d = rtl ? 1 : -1; else if (e.key === 'Home') d = -99; else if (e.key === 'End') d = 99; else return;
        e.preventDefault(); var n = d === -99 ? 0 : d === 99 ? TABS.length - 1 : (k + d + TABS.length) % TABS.length; showTab(TABS[n]); tabEls[n].focus();
      });
    });
    $('#pt-start').addEventListener('click', function () { showTab('slides', true); setPresent(true); });
    $('#pt-go-script').addEventListener('click', function () { showTab('script'); var tp = $('#t-script'); if (tp) tp.focus(); });
    $$('[data-goto-tab]').forEach(function (b) { b.addEventListener('click', function () { if (ST.present) setPresent(false); showTab(b.getAttribute('data-goto-tab')); if (b.getAttribute('data-weak')) { QS.weak = true; QS.g = 'all'; var root = $('#p-qa'); if (root) { $$('.qa-chips .chip', root).forEach(function (c) { var id = c.getAttribute('data-g'); c.setAttribute('aria-pressed', id === 'weak' ? 'true' : id === 'all' ? 'true' : 'false'); }); filterQA(); } } }); });
    if (PV) { html.classList.add('pt-pv'); ST.notes = true; ST.notesTouched = true; }
    deck.classList.toggle('has-notes', ST.notes);
    applyMode();
    goTo(0, { force: true, noHash: true, fromSync: true });
    if (!PV) applyHash(true); else showTab('slides', true);
    M.link.on(function (m) {
      if (!m || m.type !== 'pitch-slide') return;
      if (m.path && m.path !== ST.path) { ST.path = m.path === '7' ? '7' : '3'; ST.skip = ST.path === '3'; updateBar(); }
      if (typeof m.i === 'number') goTo(m.i, { force: m.i === ST.i, noHash: true, fromSync: true, noScroll: true });
    });
    if (PV) { var last = M.link.last('pitch-slide'); if (last && typeof last.i === 'number') goTo(last.i, { noHash: true, fromSync: true, noScroll: true }); }
    window.addEventListener('hashchange', function () { if (!PV) applyHash(false); });
    window.addEventListener('langchange', function () {
      updateBar(); renderNotes(); dpFillSegNames(); evRefreshNames();
      if (!overview.hidden) { closeOverlays(); }
      if (rendered.booth) rhRender();
      M.applyI18n(bar); $('#pt-tabs').setAttribute('aria-label', T('أقسام العرض', 'Pitch sections'));
    });
    M.applyI18n(doc);
    // the language sets <dir>, which flips the chevrons; make sure the mode is right after fonts load
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(applyMode);
    window.__pitchReady = true;
    window.ManaraPitch = { goTo: goTo, step: step, setPresent: setPresent, setPath: setPath, showTab: showTab, openQA: openQA, state: ST, slides: SL, qa: QA, live: LIVE, timer: TM, DP: DP, EV_BASE: EV_BASE, evSummarise: evSummarise, beforePrint: beforePrint, afterPrint: afterPrint, fb: FB, risks: RISKS, ck: CK, nums: NUMS, opening: OPENING, hz: HZ };
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();
