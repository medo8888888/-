/* MANARA («منارة») — alert wording and picture-card content  →  window.MANARA_MSG
 * ==========================================================================================
 * The SINGLE source of every word a person or an operator reads in an emergency: the simulation's bus messages, the phone page
 * (alert.html), Mission Control, the poster and the report all read it. Pure data + small pure functions: no DOM, no network, no
 * libraries, no hidden state. A classic script: it works from file:// and in Node (load it with `vm`):
 *     const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync('site/manara/js/messages.js','utf8'), ctx); const M = ctx.MANARA_MSG;
 *
 * WHAT THE WORDS ARE BASED ON
 *   Hazard instructions follow docs/MANARA-HAZARDS.md (which cites docs/MANARA-SOURCES.md). Where a line goes beyond those sources
 *   (standard practice with no source row, or first-aid wording) it is listed in MANARA_MSG.safetyNotes() with status
 *   'confirm-before-printing' or 'medical-review' — the report prints that list. Arabic and English are written by the project
 *   team and are complete. Malayalam, Nepali, Bengali, Urdu, Hindi and Tagalog are SHORT CORE TEMPLATES written carefully but NEVER
 *   reviewed by a native speaker: every one is flagged status:'draft-needs-native-review' and the page must show the draft notice.
 *   Never live machine translation. Picture cards (pictograms) carry the core message for everyone.
 *
 * QUICK START
 *   MANARA_MSG.get({ hazard:'fire', level:'evacuate', persona:'worker', lang:'ml', asleep:true, vars:{ exit:{ar:'الدرج (ب)', en:'Stair B'} } })
 *     → { key, hazard, level, persona, lang (served), requestedLang, fallback, draft, partial, status, dir, tone,
 *         headline, lines:[1–3 imperative lines], more:[0–4 detail lines],
 *         pictograms:[{id,label}], vibration:{id,pattern:[ms…]}, flash:{id,optIn,fallback,warning,…},
 *         voice:{ lang:'ml-IN', fallback:[…], text, auto, rate } | null, formats:['sound','vibration','text','pictogram',…],
 *         wake:{ mode:'none'|'soft'|'ladder', appliesToThisPerson, stepSec, steps:[…] }, sources:[{id,label}], review:['medical'|'confirm'…],
 *         text (headline + lines, for CAP / export), action (the sim.js key it matches), also:{ar,en} + draftNotice when lang is a draft }
 *   MANARA_MSG.byAction('fire.refuge')            → { hazard:'fire', level:'evacuate', persona:'wheelchair' }   (sim.js action keys)
 *   MANARA_MSG.get({ action:'gas.crosswind', lang:'ar' })                    // the action key picks hazard + level (+ persona)
 *   MANARA_MSG.bundle({ …, lang:'ml' })           → { primary, ar, en } so a draft language is always shown WITH Arabic/English
 *   MANARA_MSG.ladder({ hazard, persona, lang })  → the four night wake-up steps (T+0/+30/+60/+90 s) with person / guard / operator text
 *   MANARA_MSG.text('r.eta', 'en', { unit:'Fire engine', n:4 })  → 'Fire engine ETA 4 min'      (any phrase id; placeholders filled)
 *   MANARA_MSG.dispatch.resident({kind:'fire', state:'en-route', n:4, lang:'ar'})  /  .operator('rec', {…}, lang)  /  .handoff(lang)
 *   MANARA_MSG.languages()  MANARA_MSG.coverage()  MANARA_MSG.validate()  MANARA_MSG.strings()  MANARA_MSG.safetyNotes()
 *
 * IDS
 *   hazard   fire | smoke | gas | flood | dust | heat | sos        (aliases: 'smoke-shelter' → smoke, 'help' → sos, 'flash-flood' → flood)
 *            fire  = fire in the area ('warning' = downwind neighbours shelter, same as sim.js 'fire.shelter');
 *            smoke = SMOKE-SHELTER playbook: smoke with no fire in your building (stay in, windows shut, health first; 'evacuate' = heavy smoke inside).
 *   level    watch | warning | evacuate | all-clear                 (aliases: 'shelter' → warning, 'clear'/'allclear' → all-clear; the bus uses watch|shelter|evacuate)
 *            watch = information, be ready · warning = take the protective action IN PLACE (shelter / stay up / prepare) ·
 *            evacuate = act now (move, stop work, help is coming) · all-clear = the operator ended the alert.
 *   persona  adult (default) | asleep | deaf | blind | wheelchair | elderly | child | worker | guard | volunteer
 *            persona = a NEED PROFILE (what changes in the words and the format). Named demo people (Ravi, Huda, Abu Salem, Lina, …) are in
 *            MANARA_MSG.people() and point at a persona + a language. `asleep:true` (or persona 'asleep') adds the wake-up prefix and ladder
 *            on top of ANY persona (Ravi at night = worker + asleep). 'guard' = building guard / operator (operator-facing, ar/en only);
 *            'volunteer' = a trained volunteer (SOS only, ar/en only). For SOS the default persona is the person who needs help.
 *            Several needs at once: get({ persona:'wheelchair', needs:['deaf'] }) keeps the wheelchair TEXT (safety first) and adds the Deaf FORMAT
 *            (strobe opt-in, strong vibration, no sound); get({ needs:['deaf','wheelchair'] }) picks the text persona itself (wheelchair > child > blind > deaf >
 *            elderly > worker > adult). 'asleep' in needs works like asleep:true.
 *   variant  gas: 'lpg' (default) | 'co' | 'h2s' · flood: 'driver'.   Drafts ignore variants (they use the generic gas/flood core text).
 *   lang     ar | en | ml | ne | bn | ur | hi | tl. Fallback chain: requested language → en → ar (result.fallback = true).
 *   vars     placeholders: {exit} {room} {place} {shelter} {steps} {n} (minutes, number) {mins} (formatted: '4 min' / «4 دقائق») {sec} {km} {name} …
 *            A phrase whose placeholder is missing falls back to its generic twin (e.g. 'Go to {exit}' → 'Go to the nearest open exit'),
 *            so a result never contains '{…}'. A value may be a string or {ar,en} (picked by language — pass {ar,en} so Arabic shows Arabic names).
 *            {mins}/{n}: minutes with correct Arabic agreement (1 «دقيقة واحدة», 2 «دقيقتين», 3–10 «دقائق», 11+ «دقيقة»); {steps}: «12 خطوة»; {gain}: seconds.
 *            Digits are always Western (0–9), like core.js.
 *
 * PICTOGRAM VOCABULARY (MANARA_MSG.pictograms() — the phone page draws an SVG for each id; every id has an ar/en label for alt text)
 *   hz-*   the hazard (fire, smoke, gas, water, dust, heat, sos)        act-*  an action (exit, stairs, no-lift, low, close-window, up, wind-cross, …)
 *   st-*   a status (ok, no, warn, clear, wait, info)                   dr-*   the friendly drone light
 *   A message lists 1–5 ids in READING ORDER (3–5 for warning and evacuate): hazard first, then what to do, then what NOT to do.
 *
 *   Ids (MANARA_MSG.pictograms() has the ar/en label of each). Reserved for screens other than the message card: act-follow-arrows (route screen),
 *   dr-light (drone), st-ok / st-no / st-warn (generic badges), act-wet-cloth, act-no-phone-near, act-close-door, act-no-run, act-upwind (detail rows):
 *    hazard:
 *      hz-fire hz-smoke hz-gas hz-water hz-dust hz-heat hz-sos
 *    action:
 *      act-exit act-walk act-no-run act-stairs act-no-stairs act-no-lift act-low act-cover-face act-close-door
 *      act-close-window act-open-window act-ac-off act-inside act-up act-high-ground act-stay-upstairs act-no-underpass
 *      act-no-wade act-no-drive-water act-wind-cross act-upwind act-no-low-ground act-no-switch act-no-flame
 *      act-no-phone-near act-mask act-stop-work act-shade act-drink act-rest act-wet-cloth act-call-999 act-help-coming
 *      act-stay-still act-unlock-door act-teacher act-refuge act-assembly act-count act-check-in act-aed act-recovery
 *      act-handrail act-medicine act-knock act-phone act-fresh-air act-follow-arrows act-keep-clear
 *    status:
 *      st-ok st-no st-warn st-clear st-wait st-info
 *    drone:
 *      dr-light
 *
 * FORMATS (same names as sim.js): sound · vibration · text · pictogram · strobe (opt-in) · voice · card.
 * VIBRATION  ids → arrays of milliseconds (vibrate, pause, vibrate, …), validated: positive integers, ≤ 2000 ms each, ≤ 8000 ms in all.
 * FLASH      ids → patterns. EVERY flashing pattern is opt-in, never exceeds 3 flashes in any second (WCAG 2.3.1, S57), has a steady fallback
 *            for prefers-reduced-motion, and carries a photosensitivity warning. 'steady-*' patterns do not flash.
 *
 * HONESTY (the same rules as the rest of the site): no invented real-world numbers (only docs/MANARA-SOURCES.md rows, shown with their
 * source id); demo ETAs and traffic are SIM; 999 stays the dispatcher; never "first", never "saves lives", the detector is never "AI".
 * ========================================================================================== */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var DRAFT = 'draft-needs-native-review';
  var DRAFT_ORDER = ['ml', 'ne', 'bn', 'ur', 'hi', 'tl'];     // order of the draft strings in every p(…) call
  var LOAD_ERRORS = [];

  /* ====================================================================================
   * 1. LANGUAGES
   * ==================================================================================== */
  var LANGUAGES = [
    { id: 'ar', name: { native: 'العربية', en: 'Arabic' }, bcp47: 'ar-QA', speech: ['ar-QA', 'ar-SA', 'ar'], dir: 'rtl', status: 'complete', reviewed: false, country: 'QA',
      note: T('كتبها فريق المشروع بالعربية الفصحى لجمهور الخليج؛ تُراجَع صياغة الإسعاف الأولي مع مؤسسة حمد والدفاع المدني قبل الطباعة.', 'Written by the project team in Modern Standard Arabic for a Gulf audience; first-aid wording is checked with HMC and Civil Defence before printing.') },
    { id: 'en', name: { native: 'English', en: 'English' }, bcp47: 'en-GB', speech: ['en-GB', 'en-US', 'en'], dir: 'ltr', status: 'complete', reviewed: false, country: 'GB',
      note: T('كتبها فريق المشروع بلغة بسيطة.', 'Written by the project team in plain language.') },
    { id: 'ml', name: { native: 'മലയാളം', en: 'Malayalam' }, bcp47: 'ml-IN', speech: ['ml-IN', 'ml'], dir: 'ltr', status: DRAFT, reviewed: false, country: 'IN' },
    { id: 'ne', name: { native: 'नेपाली', en: 'Nepali' }, bcp47: 'ne-NP', speech: ['ne-NP', 'ne'], dir: 'ltr', status: DRAFT, reviewed: false, country: 'NP' },
    { id: 'bn', name: { native: 'বাংলা', en: 'Bengali' }, bcp47: 'bn-BD', speech: ['bn-BD', 'bn-IN', 'bn'], dir: 'ltr', status: DRAFT, reviewed: false, country: 'BD' },
    { id: 'ur', name: { native: 'اردو', en: 'Urdu' }, bcp47: 'ur-PK', speech: ['ur-PK', 'ur'], dir: 'rtl', status: DRAFT, reviewed: false, country: 'PK' },
    { id: 'hi', name: { native: 'हिन्दी', en: 'Hindi' }, bcp47: 'hi-IN', speech: ['hi-IN', 'hi'], dir: 'ltr', status: DRAFT, reviewed: false, country: 'IN' },
    { id: 'tl', name: { native: 'Tagalog', en: 'Tagalog' }, bcp47: 'fil-PH', speech: ['fil-PH', 'tl-PH', 'tl'], dir: 'ltr', status: DRAFT, reviewed: false, country: 'PH' }
  ];
  var LANG = {}; LANGUAGES.forEach(function (l) { LANG[l.id] = l; });
  var DRAFT_NOTICE = T('مسودة — تحتاج مراجعة متحدث أصلي', 'Draft — needs native-speaker review');

  /* ====================================================================================
   * 2. HAZARDS, LEVELS, PERSONAS
   * ==================================================================================== */
  var HAZARDS = [
    { id: 'fire',  name: T('حريق', 'Fire'),                                  long: T('حريق ودخان', 'Fire and smoke'),                icon: 'fire',  pic: 'hz-fire',  token: '--fire-1', tone: 'danger' },
    { id: 'smoke', name: T('دخان (الاحتماء في المكان)', 'Smoke shelter'),      long: T('دخان — الاحتماء في المكان', 'Smoke — shelter in place'), icon: 'smoke', pic: 'hz-smoke', token: '--warn',   tone: 'warn' },
    { id: 'gas',   name: T('تسرّب غاز', 'Gas leak'),                          long: T('تسرّب غاز (LPG وH2S وCO)', 'Gas leak (LPG, H2S, CO)'), icon: 'alert', pic: 'hz-gas',   token: '--warn',   tone: 'warn' },
    { id: 'flood', name: T('سيول وأمطار', 'Flash flood'),                     long: T('سيول وأمطار غزيرة', 'Flash flood and heavy rain'), icon: 'alert', pic: 'hz-water', token: '--info',   tone: 'info' },
    { id: 'dust',  name: T('عاصفة غبارية', 'Dust storm'),                     long: T('عاصفة غبارية', 'Dust storm'),                   icon: 'wind',  pic: 'hz-dust',  token: '--warn',   tone: 'warn' },
    { id: 'heat',  name: T('إجهاد حراري', 'Extreme heat'),                    long: T('إجهاد حراري وحرارة شديدة', 'Heat stress and extreme heat'), icon: 'thermo', pic: 'hz-heat', token: '--brand', tone: 'warn' },
    { id: 'sos',   name: T('شخص يحتاج مساعدة', 'Someone needs help'),         long: T('شخص يحتاج مساعدة (SOS)', 'Someone needs help (SOS)'), icon: 'heart', pic: 'hz-sos', token: '--danger', tone: 'danger' }
  ];
  var HAZARD = {}; HAZARDS.forEach(function (h) { HAZARD[h.id] = h; });
  var HAZARD_ALIAS = { 'smoke-shelter': 'smoke', smokeshelter: 'smoke', shelter: 'smoke', help: 'sos', 'flash-flood': 'flood', flashflood: 'flood', water: 'flood', 'heat-stress': 'heat', 'dust-storm': 'dust', 'gas-leak': 'gas', lpg: 'gas', co: 'gas', h2s: 'gas' };

  var LEVELS = [
    { id: 'watch',     name: T('متابعة', 'Watch'),                  tone: 'info',   blurb: T('معلومة فقط — كن مستعدًا', 'Information only — be ready') },
    { id: 'warning',   name: T('تحذير', 'Warning'),                 tone: 'warn',   blurb: T('نفّذ الإجراء الوقائي في مكانك (احتماء، بقاء في الأعلى، استعداد)', 'Take the protective action in place (shelter, stay up, prepare)') },
    { id: 'evacuate',  name: T('تحرّك الآن', 'Act now'),             tone: 'danger', blurb: T('تحرّك أو توقف الآن (مخرج، عرض الريح، مكان أعلى، إيقاف العمل، المساعدة في الطريق)', 'Move or stop now (exit, across the wind, higher ground, stop work, help is coming)') },
    { id: 'all-clear', name: T('انتهى الخطر', 'All clear'),           tone: 'safe',   blurb: T('أنهى المشغّل التنبيه', 'The operator ended the alert') }
  ];
  var LEVEL_IDS = LEVELS.map(function (l) { return l.id; });
  var LEVEL_ALIAS = { shelter: 'warning', warn: 'warning', clear: 'all-clear', allclear: 'all-clear', all_clear: 'all-clear', 'all clear': 'all-clear', evac: 'evacuate', act: 'evacuate' };

  // what each level MEANS for each hazard (the protective action) — for the report, the poster and the operator's level picker
  var LEVEL_MEANING = {
    fire:  { watch: T('احتمال حريق قريب: كن مستعدًا', 'Possible fire nearby: be ready'), warning: T('حريق قريب: ابقَ في الداخل، أغلق النوافذ، استعد', 'Fire nearby: stay in, close windows, be ready'), evacuate: T('غادر الآن بمخرج مفتوح فعلًا', 'Leave now by an exit that is really open'), 'all-clear': T('انتهى التنبيه — لا تعد إلا بإذن', 'Alert ended — do not go back without permission') },
    smoke: { watch: T('دخان في المنطقة: استعد لإغلاق النوافذ', 'Smoke in the area: be ready to close windows'), warning: T('ابقَ في الداخل ونوافذك مغلقة', 'Stay in with windows closed'), evacuate: T('دخان كثيف عندك: اخرج إلى هواء نقي', 'Heavy smoke here: get out to fresh air'), 'all-clear': T('زال الدخان: افتح النوافذ', 'Smoke cleared: open the windows') },
    gas:   { watch: T('رُصد غاز قريب: كن حذرًا', 'Gas detected nearby: be careful'), warning: T('غاز في الخارج: ابقَ في الداخل ولا لهب ولا مفاتيح', 'Gas outside: stay in, no flames, no switches'), evacuate: T('غادر بعرض الريح أو عكسها وابتعد عن الأماكن المنخفضة', 'Leave across or into the wind, away from low places'), 'all-clear': T('تحت السيطرة — لا تعد إلا بإذن', 'Under control — go back only when told') },
    flood: { watch: T('قد ترتفع المياه: ابتعد عن المناطق المنخفضة', 'Water may rise: keep away from low areas'), warning: T('ابقَ في الأعلى ولا تنزل إلى الشارع', 'Stay up high, do not go down to the street'), evacuate: T('اصعد إلى طابق أعلى أو مكان مرتفع', 'Move to an upper floor or higher ground'), 'all-clear': T('انخفض الماء: ابتعد عن الطرق المغمورة', 'Water is going down: keep away from flooded roads') },
    dust:  { watch: T('عاصفة متوقعة: أنهِ العمل في الخارج', 'Storm expected: finish outdoor work'), warning: T('ابقَ في مبنى مغلق', 'Stay in a closed building'), evacuate: T('العاصفة هنا: ادخل فورًا', 'The storm is here: get inside now'), 'all-clear': T('انتهت العاصفة: افتح النوافذ حين يصفو الهواء', 'Storm over: open windows when the air is clear') },
    heat:  { watch: T('الحرارة ترتفع: اشرب واستظلّ', 'Heat is rising: drink and use shade'), warning: T('خذ استراحة في الظل', 'Take a break in the shade'), evacuate: T('أوقف العمل واذهب إلى مكان التبريد', 'Stop work and go to the cool shelter'), 'all-clear': T('انخفضت المخاطر: استأنف بتوجيه المشرف', 'Risk is lower: restart as the supervisor says') },
    sos:   { watch: T('هل أنت بخير؟ اضغط للرد', 'Are you OK? Tap to answer'), warning: T('لا رد: نطلب المساعدة', 'No answer: we are asking for help'), evacuate: T('المساعدة في الطريق إليك: ابقَ مكانك', 'Help is on its way: stay where you are'), 'all-clear': T('وصلت المساعدة', 'Help has arrived') }
  };

  var PERSONAS = [
    { id: 'adult',      name: T('بالغ (افتراضي)', 'Adult (default)'),                       needs: [],                  formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'on-demand', flashOptIn: false, vibBoost: false },
    { id: 'asleep',     name: T('بالغ نائم', 'Adult asleep'),                                needs: ['asleep'],          formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'on-demand', flashOptIn: false, vibBoost: false, asleep: true },
    { id: 'deaf',       name: T('أصمّ أو ثقيل السمع', 'Deaf or hard of hearing'),            needs: ['deaf'],            formats: ['strobe', 'vibration', 'text', 'pictogram'],           voice: 'off',       flashOptIn: true,  vibBoost: true, largeText: true },
    { id: 'blind',      name: T('كفيف أو ضعيف البصر', 'Blind or low vision'),                needs: ['blind'],           formats: ['voice', 'vibration', 'sound'],                        voice: 'auto',      flashOptIn: false, vibBoost: true, largeText: true },
    { id: 'wheelchair', name: T('مستخدم كرسي متحرك أو صعوبة حركة', 'Wheelchair or mobility need'), needs: ['wheelchair'], formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'on-demand', flashOptIn: false, vibBoost: false, noStairs: true },
    { id: 'elderly',    name: T('كبير سن', 'Older adult'),                                   needs: ['elderly'],         formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'on-demand', flashOptIn: false, vibBoost: false, largeText: true },
    { id: 'child',      name: T('طفل', 'Child'),                                            needs: ['child'],           formats: ['card', 'voice', 'sound', 'pictogram'],                voice: 'auto',      flashOptIn: false, vibBoost: false, simpleWords: true, pictureFirst: true },
    { id: 'worker',     name: T('عامل — قراءة محدودة أو لغة أخرى', 'Worker — low literacy or another language'), needs: ['low-literacy', 'other-language'], formats: ['sound', 'vibration', 'text', 'pictogram'], voice: 'auto', flashOptIn: false, vibBoost: false, pictureFirst: true },
    { id: 'guard',      name: T('حارس المبنى أو المشغّل', 'Building guard or operator'),      needs: ['operator'],        formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'off',       flashOptIn: false, vibBoost: false, operatorFacing: true, langs: ['ar', 'en'] },
    { id: 'volunteer',  name: T('متطوع مدرَّب (للنجدة فقط)', 'Trained volunteer (SOS only)'), needs: ['trained'],         formats: ['sound', 'vibration', 'text', 'pictogram'],            voice: 'off',       flashOptIn: false, vibBoost: false, operatorFacing: true, langs: ['ar', 'en'], hazards: ['sos'] }
  ];
  var PERSONA = {}; PERSONAS.forEach(function (p) { PERSONA[p.id] = p; });
  var PERSONA_ALIAS = { 'default': 'adult', sleeping: 'asleep', night: 'asleep', hearing: 'deaf', 'hard-of-hearing': 'deaf', blindness: 'blind', visually: 'blind', mobility: 'wheelchair', disabled: 'wheelchair', old: 'elderly', senior: 'elderly', pupil: 'child', kid: 'child', student: 'child', migrant: 'worker', 'low-literacy': 'worker', lowliteracy: 'worker', operator: 'guard', staff: 'guard', warden: 'guard' };

  /* ====================================================================================
   * 3. PICTOGRAM VOCABULARY (ids the phone page draws as SVG), VIBRATION, FLASH
   * ==================================================================================== */
  var PICTOGRAMS = [];
  function pic(id, cat, ar, en) { PICTOGRAMS.push({ id: id, cat: cat, name: T(ar, en) }); }
  pic('hz-fire', 'hazard', 'نار', 'Fire');                       pic('hz-smoke', 'hazard', 'دخان', 'Smoke');
  pic('hz-gas', 'hazard', 'غاز', 'Gas');                         pic('hz-water', 'hazard', 'ماء مرتفع', 'Rising water');
  pic('hz-dust', 'hazard', 'غبار', 'Dust');                      pic('hz-heat', 'hazard', 'حرارة شديدة', 'Extreme heat');
  pic('hz-sos', 'hazard', 'شخص يحتاج مساعدة', 'Person needs help');
  pic('act-exit', 'action', 'المخرج', 'Exit');                   pic('act-walk', 'action', 'امشِ', 'Walk');
  pic('act-no-run', 'action', 'لا تركض', 'Do not run');           pic('act-stairs', 'action', 'الدرج', 'Stairs');
  pic('act-no-stairs', 'action', 'لا تستخدم الدرج', 'Do not use the stairs');
  pic('act-no-lift', 'action', 'لا تستخدم المصعد', 'Do not use the lift');
  pic('act-low', 'action', 'ابقَ منخفضًا تحت الدخان', 'Stay low under the smoke');
  pic('act-cover-face', 'action', 'غطِّ الأنف والفم', 'Cover nose and mouth');
  pic('act-close-door', 'action', 'أغلق الباب', 'Close the door');  pic('act-close-window', 'action', 'أغلق النافذة', 'Close the window');
  pic('act-open-window', 'action', 'افتح النافذة', 'Open the window');
  pic('act-ac-off', 'action', 'أوقف التكييف', 'Switch off the AC');
  pic('act-inside', 'action', 'ابقَ في الداخل', 'Stay inside');    pic('act-up', 'action', 'اصعد إلى الأعلى', 'Go up');
  pic('act-high-ground', 'action', 'مكان مرتفع', 'Higher ground');
  pic('act-stay-upstairs', 'action', 'ابقَ في الطابق العلوي', 'Stay upstairs');
  pic('act-no-underpass', 'action', 'لا تدخل النفق', 'Do not enter the underpass');
  pic('act-no-wade', 'action', 'لا تمشِ في المياه الجارية', 'Do not walk through moving water');
  pic('act-no-drive-water', 'action', 'لا تقد عبر المياه', 'Do not drive through water');
  pic('act-wind-cross', 'action', 'تحرّك بعرض اتجاه الريح', 'Move across the wind');
  pic('act-upwind', 'action', 'عكس اتجاه الريح', 'Move into the wind');
  pic('act-no-low-ground', 'action', 'ابتعد عن الأماكن المنخفضة', 'Avoid low places');
  pic('act-no-switch', 'action', 'لا تلمس المفاتيح', 'Do not touch switches');
  pic('act-no-flame', 'action', 'لا لهب', 'No flame');
  pic('act-no-phone-near', 'action', 'لا هاتف قرب المصدر', 'No phone near the source');
  pic('act-mask', 'action', 'ضع كمامة', 'Wear a mask');
  pic('act-stop-work', 'action', 'أوقف العمل', 'Stop work');       pic('act-shade', 'action', 'اذهب إلى الظل', 'Go to the shade');
  pic('act-drink', 'action', 'اشرب ماءً', 'Drink water');         pic('act-rest', 'action', 'ارتح', 'Rest');
  pic('act-wet-cloth', 'action', 'قماش مبلّل للتبريد', 'Wet cloth to cool');
  pic('act-call-999', 'action', 'اتصل بـ 999', 'Call 999');
  pic('act-help-coming', 'action', 'المساعدة قادمة', 'Help is coming');
  pic('act-stay-still', 'action', 'ابقَ مكانك', 'Stay where you are');
  pic('act-unlock-door', 'action', 'افتح الباب', 'Unlock the door');
  pic('act-teacher', 'action', 'اتبع معلّمك', 'Follow your teacher');
  pic('act-refuge', 'action', 'الشرفة الآمنة', 'Refuge balcony');
  pic('act-assembly', 'action', 'نقطة التجمع', 'Assembly point');
  pic('act-count', 'action', 'العدّ', 'Head-count');              pic('act-check-in', 'action', 'اضغط «أنا بأمان»', 'Tap “I\'m safe”');
  pic('act-aed', 'action', 'جهاز الصدمات AED', 'AED defibrillator');
  pic('act-recovery', 'action', 'وضع الاستلقاء على الجنب', 'Recovery position (on the side)');
  pic('act-handrail', 'action', 'أمسك الدرابزين', 'Hold the rail');
  pic('act-medicine', 'action', 'أبقِ دواءك قريبًا', 'Keep your medicine near');
  pic('act-knock', 'action', 'اطرق الأبواب', 'Knock on doors');
  pic('act-phone', 'action', 'أبقِ الهاتف معك', 'Keep your phone with you');
  pic('act-fresh-air', 'action', 'هواء نقي', 'Fresh air');
  pic('act-follow-arrows', 'action', 'اتبع الأسهم الخضراء', 'Follow the green arrows');
  pic('act-keep-clear', 'action', 'أبقِ الممر خاليًا', 'Keep the way clear');
  pic('st-ok', 'status', 'بخير', 'OK');                          pic('st-no', 'status', 'ممنوع', 'Not allowed');
  pic('st-warn', 'status', 'تحذير', 'Warning');                  pic('st-clear', 'status', 'انتهى الخطر', 'All clear');
  pic('st-wait', 'status', 'انتظر', 'Wait');                     pic('st-info', 'status', 'معلومة', 'Information');
  pic('dr-light', 'drone', 'ضوء منارة الودّي', 'MANARA friendly light');
  var PIC = {}; PICTOGRAMS.forEach(function (x) { PIC[x.id] = x; });

  // vibration patterns: vibrate, pause, vibrate, … in milliseconds (navigator.vibrate)
  var VIBRATION = {
    none:    { pattern: [], name: T('بلا اهتزاز', 'No vibration') },
    ack:     { pattern: [120], name: T('تأكيد قصير', 'Short acknowledgement') },
    soft:    { pattern: [200], name: T('نبضة خفيفة (متابعة)', 'One light pulse (watch)') },
    notice:  { pattern: [300, 150, 300], name: T('نبضتان (إشعار)', 'Two pulses (notice)') },
    warn:    { pattern: [400, 200, 400, 200, 400], name: T('ثلاث نبضات (تحذير)', 'Three pulses (warning)') },
    evac:    { pattern: [700, 200, 700, 200, 700, 200, 700], name: T('أربع نبضات طويلة (تحرّك الآن)', 'Four long pulses (act now)') },
    wake:    { pattern: [900, 250, 900, 250, 900, 250, 900, 250, 900], name: T('إيقاظ قوي (النائم)', 'Strong wake-up (asleep)') },
    strong:  { pattern: [1200, 200, 1200, 200, 1200], name: T('اهتزاز قوي (أصمّ / كفيف)', 'Strong vibration (Deaf / blind)') },
    calm:    { pattern: [250, 250, 250], name: T('اهتزاز هادئ (المساعدة في الطريق)', 'Calm pulses (help is coming)') },
    'sos-call': { pattern: [300, 100, 300, 100, 300, 300, 700, 100, 700, 100, 700, 300, 300, 100, 300, 100, 300], name: T('نداء استغاثة للمتطوع', 'SOS call pattern for a volunteer') },
    clear:   { pattern: [150, 100, 150], name: T('نبضتان قصيرتان (انتهى الخطر)', 'Two short pulses (all clear)') }
  };

  // flash / light patterns. kind 'steady' never flashes; kind 'flash' is ALWAYS opt-in, ≤ 3 flashes per second (WCAG 2.3.1, S57), with a steady fallback
  var PHOTO_WARNING = T('تحذير: قد يسبب الضوء الوامض نوبات لدى الحساسين للضوء. لا يومض أكثر من 3 مرات في الثانية، ولا يعمل إذا كان جهازك مضبوطًا على تقليل الحركة.',
    'Warning: flashing light can trigger seizures in people who are sensitive to light. It never flashes more than 3 times a second, and it stays off if your device is set to reduce motion.');
  var FLASH = {
    none:           { kind: 'none',   optIn: false, name: T('بلا ضوء', 'No light') },
    'steady-info':  { kind: 'steady', optIn: false, token: '--info',   name: T('ضوء أزرق ثابت', 'Steady blue light') },
    'steady-amber': { kind: 'steady', optIn: false, token: '--warn',   name: T('ضوء كهرماني ثابت', 'Steady amber light') },
    'steady-red':   { kind: 'steady', optIn: false, token: '--danger', name: T('ضوء أحمر ثابت', 'Steady red light') },
    'steady-green': { kind: 'steady', optIn: false, token: '--safe',   name: T('ضوء أخضر ثابت', 'Steady green light') },
    'pulse-slow':   { kind: 'flash',  optIn: true, token: '--warn',   onMs: 500, offMs: 500, fallback: 'steady-amber', name: T('نبض بطيء (مرة في الثانية)', 'Slow pulse (once a second)'), warning: PHOTO_WARNING },
    'strobe-optin': { kind: 'flash',  optIn: true, token: '--danger', onMs: 150, offMs: 250, fallback: 'steady-red',   name: T('وميض للصمّ (2.5 مرة في الثانية، اختياري)', 'Flash for Deaf users (2.5 per second, optional)'), warning: PHOTO_WARNING },
    // the friendly drone light (a design choice, not a standard): steady green + two short white flashes every 2 s = 1 flash per second on average
    'friendly-drone': { kind: 'signature', optIn: false, target: 'drone', cycleMs: 2000, base: { token: '--safe' }, events: [{ atMs: 1000, durMs: 100, color: 'white' }, { atMs: 1300, durMs: 100, color: 'white' }],
      name: T('ضوء المسيّرة الودّي: أخضر ثابت ووميضان أبيضان كل ثانيتين', 'Friendly drone light: steady green with two white flashes every 2 seconds') }
  };

  /* ====================================================================================
   * 4. SOURCES REFERENCED BY MESSAGE LINES (ids are rows of docs/MANARA-SOURCES.md)
   * ==================================================================================== */
  var SOURCES = {
    S19: { id: 'S19', short: T('منظمة العمل الدولية — حدّ WBGT في قطر', 'ILO — Qatar WBGT stop-work limit') },
    S37: { id: 'S37', short: T('وزارة الداخلية — الرقم 992 للصمّ', 'Ministry of Interior — 992 for Deaf callers') },
    S36: { id: 'S36', short: T('وزارة الداخلية — التحذير من نغمات الإنذار الوطني', 'Ministry of Interior — warning about the national alert sounds') },
    S40: { id: 'S40', short: T('الدفاع المدني القطري (قطر تريبيون، 2017)', 'Qatar Civil Defence (Qatar Tribune, 2017)') },
    S47: { id: 'S47', short: T('NIOSH وOSHA — كبريتيد الهيدروجين (بيانات أمريكية)', 'NIOSH and OSHA — hydrogen sulfide (US data)') },
    S48: { id: 'S48', short: T('NIOSH — البروبان (بيانات أمريكية)', 'NIOSH — propane (US data)') },
    S54: { id: 'S54', short: T('مراكز مكافحة الأمراض الأمريكية — ضربة الشمس (إرشاد دولي)', 'US CDC — heat stroke (international guidance)') },
    S55: { id: 'S55', short: T('هيئة الأرصاد الأمريكية — السيول (إرشاد دولي)', 'US National Weather Service — flooding (international guidance)') },
    S56: { id: 'S56', short: T('مؤسسة أبحاث الحماية من الحرائق (NFPA)، 2020', 'NFPA Fire Protection Research Foundation, 2020') },
    S57: { id: 'S57', short: T('W3C — إرشادات WCAG 2.3.1', 'W3C — WCAG 2.3.1') },
    S71: { id: 'S71', short: T('إرشادات الأمطار — وزارة البلدية وأشغال (The Peninsula)', 'Rain guidance — Municipality and Ashghal (The Peninsula)') }
  };

  /* ====================================================================================
   * 5. THE PHRASE REGISTRY — every string is a phrase id with ar + en (complete) and, for the core set, six DRAFT strings
   *    p(id, ar, en, [ml, ne, bn, ur, hi, tl], { need?, alt?, src?, review? })
   *    `alt` = the generic twin used when a placeholder variable is missing; `review` flags wording that must be checked before printing.
   * ==================================================================================== */
  var P = {};
  function p(id, ar, en, dr, o) {
    if (P[id]) { LOAD_ERRORS.push('duplicate phrase id ' + id); return; }
    var e = { id: id, ar: ar, en: en };
    if (dr) DRAFT_ORDER.forEach(function (l, k) { if (dr[k]) e[l] = dr[k]; });
    if (o) for (var k in o) e[k] = o[k];
    P[id] = e;
  }

  /* ---------- 5.1 headlines: hazard × level (default persona) ---------- */
  p('h.fire.watch', 'احتمال حريق قريب — كن مستعدًا', 'Possible fire nearby — be ready', ['സമീപത്ത് തീപിടിത്തത്തിന് സാധ്യത — തയ്യാറായിരിക്കുക', 'नजिकै आगलागी हुन सक्छ — तयार रहनुहोस्', 'কাছাকাছি আগুন লাগার আশঙ্কা — প্রস্তুত থাকুন', 'قریب آگ لگنے کا خدشہ — تیار رہیں', 'पास में आग लगने की आशंका — तैयार रहें', 'May posibleng sunog sa malapit — maghanda']);
  p('h.fire.warning', 'حريق قريب — ابقَ في الداخل واستعد', 'Fire nearby — stay inside and be ready', ['സമീപത്ത് തീപിടിത്തം — അകത്തുതന്നെ തുടരുക, തയ്യാറായിരിക്കുക', 'नजिकै आगलागी — भित्रै बस्नुहोस्, तयार रहनुहोस्', 'কাছাকাছি আগুন — ভেতরেই থাকুন, প্রস্তুত থাকুন', 'قریب آگ — اندر ہی رہیں، تیار رہیں', 'पास में आग — अंदर ही रहें, तैयार रहें', 'May sunog sa malapit — manatili sa loob, maghanda']);
  p('h.fire.evacuate', 'حريق — غادر الآن', 'FIRE — leave now', ['തീ! — ഉടൻ പുറത്തിറങ്ങുക', 'आगो! — तुरुन्तै बाहिर निस्कनुहोस्', 'আগুন! — এখনই বের হয়ে যান', 'آگ! — فوراً باہر نکلیں', 'आग! — अभी बाहर निकलें', 'SUNOG — lumabas na ngayon']);
  p('h.fire.clear', 'انتهى تنبيه الحريق', 'Fire alert ended', ['തീപിടിത്ത മുന്നറിയിപ്പ് അവസാനിച്ചു', 'आगलागीको सतर्कता सकियो', 'আগুনের সতর্কতা শেষ', 'آگ کا الرٹ ختم ہو گیا', 'आग का अलर्ट समाप्त हुआ', 'Tapos na ang alerto sa sunog']);

  p('h.smoke.watch', 'دخان في المنطقة — كن مستعدًا', 'Smoke in the area — be ready', ['പ്രദേശത്ത് പുകയുണ്ട് — തയ്യാറായിരിക്കുക', 'इलाकामा धुवाँ छ — तयार रहनुहोस्', 'এলাকায় ধোঁয়া আছে — প্রস্তুত থাকুন', 'علاقے میں دھواں ہے — تیار رہیں', 'इलाके में धुआँ है — तैयार रहें', 'May usok sa lugar — maghanda']);
  p('h.smoke.warning', 'دخان قريب — ابقَ في الداخل', 'Smoke nearby — stay indoors', ['സമീപത്ത് പുക — അകത്തുതന്നെ തുടരുക', 'नजिकै धुवाँ — भित्रै बस्नुहोस्', 'কাছাকাছি ধোঁয়া — ভেতরেই থাকুন', 'قریب دھواں — اندر ہی رہیں', 'पास में धुआँ — अंदर ही रहें', 'May usok sa malapit — manatili sa loob']);
  p('h.smoke.evacuate', 'دخان كثيف عندك — اخرج الآن', 'Heavy smoke here — get out now', ['കനത്ത പുക — ഉടൻ പുറത്തിറങ്ങുക', 'धेरै धुवाँ — तुरुन्तै बाहिर निस्कनुहोस्', 'ঘন ধোঁয়া — এখনই বের হয়ে যান', 'گھنا دھواں — فوراً باہر نکلیں', 'घना धुआँ — अभी बाहर निकलें', 'Makapal na usok — lumabas na ngayon']);
  p('h.smoke.clear', 'زال الدخان', 'The smoke has cleared', ['പുക മാറി', 'धुवाँ हटिसक्यो', 'ধোঁয়া কেটে গেছে', 'دھواں چھٹ گیا', 'धुआँ छँट गया', 'Wala na ang usok']);

  p('h.gas.watch', 'رُصد غاز قريب — كن منتبهًا', 'Gas detected nearby — stay alert', ['സമീപത്ത് ഗ്യാസ് കണ്ടെത്തി — ശ്രദ്ധിക്കുക', 'नजिकै ग्यास पत्ता लाग्यो — सावधान रहनुहोस्', 'কাছাকাছি গ্যাস ধরা পড়েছে — সতর্ক থাকুন', 'قریب گیس کا پتا چلا — محتاط رہیں', 'पास में गैस का पता चला — सावधान रहें', 'May natukoy na gas sa malapit — mag-ingat']);
  p('h.gas.warning', 'غاز في الخارج — ابقَ في الداخل', 'Gas outside — stay indoors', ['പുറത്ത് ഗ്യാസ് — അകത്തുതന്നെ തുടരുക', 'बाहिर ग्यास — भित्रै बस्नुहोस्', 'বাইরে গ্যাস — ভেতরেই থাকুন', 'باہر گیس — اندر ہی رہیں', 'बाहर गैस — अंदर ही रहें', 'May gas sa labas — manatili sa loob']);
  p('h.gas.evacuate', 'تسرّب غاز — غادر الآن', 'GAS LEAK — leave now', ['ഗ്യാസ് ചോർച്ച! — ഉടൻ പുറത്തിറങ്ങുക', 'ग्यास चुहावट! — तुरुन्तै बाहिर निस्कनुहोस्', 'গ্যাস লিক! — এখনই বের হয়ে যান', 'گیس لیک! — فوراً باہر نکلیں', 'गैस लीक! — अभी बाहर निकलें', 'TUMATAGAS ANG GAS — lumabas na ngayon']);
  p('h.gas.clear', 'انتهى تنبيه الغاز', 'Gas alert ended', ['ഗ്യാസ് മുന്നറിയിപ്പ് അവസാനിച്ചു', 'ग्यास सतर्कता सकियो', 'গ্যাসের সতর্কতা শেষ', 'گیس کا الرٹ ختم ہو گیا', 'गैस का अलर्ट समाप्त हुआ', 'Tapos na ang alerto sa gas']);
  p('h.gas.co.warning', 'أول أكسيد الكربون (CO) يرتفع — اخرج إلى الهواء النقي', 'Carbon monoxide (CO) rising — get fresh air', null, { src: ['S47'] });
  p('h.gas.co.evacuate', 'أول أكسيد الكربون (CO) — اخرج إلى الهواء النقي الآن', 'Carbon monoxide (CO) — get fresh air now');
  p('h.gas.h2s.warning', 'كبريتيد الهيدروجين (H2S) قريب — ابقَ في الداخل', 'Hydrogen sulfide (H2S) nearby — stay indoors');
  p('h.gas.h2s.evacuate', 'كبريتيد الهيدروجين (H2S) — غادر الآن', 'Hydrogen sulfide (H2S) — leave now');

  p('h.flood.watch', 'قد ترتفع المياه — ابتعد عن المناطق المنخفضة', 'Water may rise — keep away from low areas', ['വെള്ളം ഉയർന്നേക്കാം — താഴ്ന്ന സ്ഥലങ്ങളിൽ നിന്ന് മാറി നിൽക്കുക', 'पानी बढ्न सक्छ — होचो ठाउँबाट टाढा रहनुहोस्', 'পানি বাড়তে পারে — নিচু জায়গা থেকে দূরে থাকুন', 'پانی بڑھ سکتا ہے — نشیبی جگہوں سے دور رہیں', 'पानी बढ़ सकता है — नीची जगहों से दूर रहें', 'Maaaring tumaas ang tubig — lumayo sa mabababang lugar']);
  p('h.flood.warning', 'المياه ترتفع — ابقَ في مكان مرتفع', 'Water is rising — stay up high', ['വെള്ളം ഉയരുന്നു — മുകൾ നിലയിൽ തന്നെ തുടരുക', 'पानी बढ्दैछ — माथिल्लो तलामै बस्नुहोस्', 'পানি বাড়ছে — উপরের তলাতেই থাকুন', 'پانی بڑھ رہا ہے — اوپر والی منزل پر ہی رہیں', 'पानी बढ़ रहा है — ऊपर की मंज़िल पर ही रहें', 'Tumataas ang tubig — manatili sa itaas']);
  p('h.flood.evacuate', 'سيول — اصعد إلى مكان أعلى الآن', 'FLOOD — move up now', ['വെള്ളപ്പൊക്കം! — ഉടൻ ഉയർന്ന സ്ഥലത്തേക്ക് പോകുക', 'बाढी! — तुरुन्तै माथि जानुहोस्', 'বন্যা! — এখনই উঁচু জায়গায় যান', 'سیلاب! — فوراً اونچی جگہ پر جائیں', 'बाढ़! — अभी ऊँचे स्थान पर जाएँ', 'BAHA — umakyat na ngayon']);
  p('h.flood.clear', 'انتهى تنبيه السيول', 'Flood alert ended', ['വെള്ളപ്പൊക്ക മുന്നറിയിപ്പ് അവസാനിച്ചു', 'बाढी सतर्कता सकियो', 'বন্যার সতর্কতা শেষ', 'سیلاب کا الرٹ ختم ہو گیا', 'बाढ़ का अलर्ट समाप्त हुआ', 'Tapos na ang alerto sa baha']);
  p('h.flood.driver', 'مياه على الطريق — لا تعبرها بسيارتك', 'Water on the road — do not drive through it');

  p('h.dust.watch', 'عاصفة غبارية متوقعة — استعد', 'Dust storm expected — get ready', ['പൊടിക്കാറ്റ് വരുന്നു — തയ്യാറാകുക', 'धुलोको आँधी आउँदैछ — तयार हुनुहोस्', 'ধুলোঝড় আসছে — প্রস্তুত হোন', 'گرد کا طوفان آ رہا ہے — تیار ہو جائیں', 'धूल भरी आँधी आ रही है — तैयार हो जाएँ', 'Paparating ang bagyo ng alikabok — maghanda']);
  p('h.dust.warning', 'عاصفة غبارية — ادخل إلى مبنى', 'Dust storm — go indoors', ['പൊടിക്കാറ്റ് — കെട്ടിടത്തിനുള്ളിൽ കയറുക', 'धुलोको आँधी — भवनभित्र जानुहोस्', 'ধুলোঝড় — ভবনের ভেতরে যান', 'گرد کا طوفان — عمارت کے اندر جائیں', 'धूल भरी आँधी — इमारत के अंदर जाएँ', 'Bagyo ng alikabok — pumasok sa loob ng gusali']);
  p('h.dust.evacuate', 'عاصفة غبارية الآن — ادخل فورًا', 'DUST STORM NOW — get inside', ['ഇപ്പോൾ പൊടിക്കാറ്റ്! — ഉടൻ അകത്തു കയറുക', 'अहिले धुलोको आँधी! — तुरुन्तै भित्र जानुहोस्', 'এখন ধুলোঝড়! — এখনই ভেতরে যান', 'ابھی گرد کا طوفان! — فوراً اندر جائیں', 'अभी धूल भरी आँधी! — तुरंत अंदर जाएँ', 'BAGYO NG ALIKABOK — pumasok na ngayon']);
  p('h.dust.clear', 'انتهت العاصفة الغبارية', 'The dust storm has passed', ['പൊടിക്കാറ്റ് കഴിഞ്ഞു', 'धुलोको आँधी सकियो', 'ধুলোঝড় থেমেছে', 'گرد کا طوفان تھم گیا', 'धूल भरी आँधी थम गई', 'Tapos na ang bagyo ng alikabok']);

  p('h.heat.watch', 'الحرارة ترتفع — اشرب ماءً واستظلّ', 'Heat is rising — drink water, stay in the shade', ['ചൂട് കൂടുന്നു — വെള്ളം കുടിക്കുക, തണലിൽ നിൽക്കുക', 'गर्मी बढ्दैछ — पानी पिउनुहोस्, छहारीमा बस्नुहोस्', 'গরম বাড়ছে — পানি পান করুন, ছায়ায় থাকুন', 'گرمی بڑھ رہی ہے — پانی پئیں، سائے میں رہیں', 'गर्मी बढ़ रही है — पानी पिएँ, छाँव में रहें', 'Tumataas ang init — uminom ng tubig, magpalilim']);
  p('h.heat.warning', 'إجهاد حراري — خذ استراحة في الظل', 'Heat stress — take a break in the shade', ['ചൂടിന്റെ സമ്മർദ്ദം — തണലിൽ വിശ്രമിക്കുക', 'गर्मीको दबाब — छहारीमा आराम गर्नुहोस्', 'গরমের চাপ — ছায়ায় বিশ্রাম নিন', 'گرمی کا دباؤ — سائے میں آرام کریں', 'गर्मी का दबाव — छाँव में आराम करें', 'Stress sa init — magpahinga sa lilim']);
  p('h.heat.evacuate', 'خطر حرارة — أوقف العمل الآن', 'HEAT DANGER — stop work now', ['ചൂട് അപകടം — ഉടൻ ജോലി നിർത്തുക', 'गर्मीको खतरा — तुरुन्तै काम रोक्नुहोस्', 'গরমের বিপদ — এখনই কাজ বন্ধ করুন', 'گرمی کا خطرہ — فوراً کام روک دیں', 'गर्मी का खतरा — अभी काम रोक दें', 'PELIGRO SA INIT — itigil na ang trabaho']);
  p('h.heat.clear', 'انخفضت مخاطر الحرارة', 'Heat risk is lower', ['ചൂടിന്റെ അപകടം കുറഞ്ഞു', 'गर्मीको जोखिम घट्यो', 'গরমের ঝুঁকি কমেছে', 'گرمی کا خطرہ کم ہو گیا', 'गर्मी का खतरा कम हुआ', 'Bumaba na ang panganib sa init']);

  p('h.sos.watch', 'هل أنت بخير؟', 'Are you OK?', ['നിങ്ങൾ സുഖമായിരിക്കുന്നോ?', 'तपाईं ठीक हुनुहुन्छ?', 'আপনি কি ঠিক আছেন?', 'کیا آپ ٹھیک ہیں؟', 'क्या आप ठीक हैं?', 'Okay ka lang ba?']);
  p('h.sos.warning', 'لم نتلقَّ ردًّا — نطلب المساعدة', 'No answer — we are asking for help', ['മറുപടിയില്ല — ഞങ്ങൾ സഹായം തേടുന്നു', 'जवाफ आएन — हामी सहायता मागिरहेका छौं', 'উত্তর নেই — আমরা সাহায্য চাইছি', 'جواب نہیں ملا — ہم مدد بلا رہے ہیں', 'जवाब नहीं मिला — हम मदद बुला रहे हैं', 'Walang sagot — humihingi kami ng tulong']);
  p('h.sos.evacuate', 'المساعدة في الطريق إليك', 'Help is on its way to you', ['സഹായം നിങ്ങളുടെ അടുത്തേക്ക് വരുന്നു', 'सहायता तपाईंतिर आउँदैछ', 'সাহায্য আপনার কাছে আসছে', 'مدد آپ کی طرف آ رہی ہے', 'मदद आपके पास आ रही है', 'Papunta na ang tulong sa iyo']);
  p('h.sos.clear', 'وصلت المساعدة', 'Help has reached you', ['സഹായം എത്തി', 'सहायता पुगिसक्यो', 'সাহায্য পৌঁছে গেছে', 'مدد پہنچ گئی', 'मदद पहुँच गई', 'Dumating na ang tulong']);

  /* ---------- 5.2 persona headlines: worker (telegraphic, picture-first), child (simple), guard (operator), volunteer ---------- */
  p('h.w.fire', 'حريق — اخرج — {exit}', 'FIRE — OUT — {exit}', null, { alt: 'h.w.fire_any' });
  p('h.w.fire_any', 'حريق — اخرج', 'FIRE — OUT', ['തീ — പുറത്ത്', 'आगो — बाहिर', 'আগুন — বের হন', 'آگ — باہر', 'आग — बाहर', 'SUNOG — LABAS']);
  p('h.w.smoke', 'دخان — اخرج', 'SMOKE — OUT', ['പുക — പുറത്ത്', 'धुवाँ — बाहिर', 'ধোঁয়া — বের হন', 'دھواں — باہر', 'धुआँ — बाहर', 'USOK — LABAS']);
  p('h.w.gas', 'غاز — لا مفاتيح — اخرج', 'GAS — NO SWITCH — OUT', ['ഗ്യാസ് — സ്വിച്ച് തൊടരുത് — പുറത്ത്', 'ग्यास — स्विच नछुनु — बाहिर', 'গ্যাস — সুইচ নয় — বের হন', 'گیس — سوئچ نہیں — باہر', 'गैस — स्विच नहीं — बाहर', 'GAS — WALANG SWITCH — LABAS']);
  p('h.w.flood', 'ماء — اصعد — ابقَ', 'WATER — UP — STAY', ['വെള്ളം — മുകളിലേക്ക് — അവിടെ നിൽക്കുക', 'पानी — माथि — बस्नुहोस्', 'পানি — উপরে — থাকুন', 'پانی — اوپر — رہیں', 'पानी — ऊपर — रुकें', 'TUBIG — ITAAS — MANATILI']);
  p('h.w.dust', 'أوقف العمل — ادخل — كمامة', 'STOP WORK — GO INSIDE — MASK', ['ജോലി നിർത്തുക — അകത്തുകയറുക — മാസ്ക്', 'काम रोक्नुहोस् — भित्र जानुहोस् — मास्क', 'কাজ বন্ধ — ভেতরে যান — মাস্ক', 'کام بند — اندر جائیں — ماسک', 'काम बंद — अंदर जाएँ — मास्क', 'ITIGIL ANG TRABAHO — PUMASOK — MASK']);
  p('h.w.heat', 'أوقف العمل — ظل — ماء', 'STOP WORK — SHADE — WATER', ['ജോലി നിർത്തുക — തണൽ — വെള്ളം', 'काम रोक्नुहोस् — छहारी — पानी', 'কাজ বন্ধ — ছায়া — পানি', 'کام بند — سایہ — پانی', 'काम बंद — छाँव — पानी', 'ITIGIL ANG TRABAHO — LILIM — TUBIG']);
  p('h.w.sos', 'المساعدة قادمة', 'HELP COMING', ['സഹായം വരുന്നു', 'सहायता आउँदैछ', 'সাহায্য আসছে', 'مدد آ رہی ہے', 'मदद आ रही है', 'PAPARATING ANG TULONG']);

  p('h.child.fire', 'حريق! حان وقت الخروج', 'Fire! Time to go outside', ['തീ! പുറത്തിറങ്ങാനുള്ള സമയമായി', 'आगो! बाहिर निस्कने समय भयो', 'আগুন! বাইরে যাওয়ার সময় হয়েছে', 'آگ! باہر جانے کا وقت ہے', 'आग! बाहर जाने का समय है', 'Sunog! Oras nang lumabas']);
  p('h.child.smoke', 'دخان في الخارج! ابقَ في الداخل', 'Smoke outside! Stay inside', ['പുറത്ത് പുക! അകത്തുതന്നെ നിൽക്കുക', 'बाहिर धुवाँ! भित्रै बस्नुहोस्', 'বাইরে ধোঁয়া! ভেতরেই থাকুন', 'باہر دھواں! اندر ہی رہیں', 'बाहर धुआँ! अंदर ही रहें', 'May usok sa labas! Manatili sa loob']);
  p('h.child.smoke_out', 'دخان! حان وقت الخروج', 'Smoke! Time to go outside', ['പുക! പുറത്തിറങ്ങാനുള്ള സമയമായി', 'धुवाँ! बाहिर निस्कने समय भयो', 'ধোঁয়া! বাইরে যাওয়ার সময় হয়েছে', 'دھواں! باہر جانے کا وقت ہے', 'धुआँ! बाहर जाने का समय है', 'Usok! Oras nang lumabas']);
  p('h.child.gas', 'تسرّب غاز! اخرج بهدوء', 'Gas leak! Go outside calmly', ['ഗ്യാസ് ചോർച്ച! ശാന്തമായി പുറത്തിറങ്ങുക', 'ग्यास चुहावट! शान्तसँग बाहिर निस्कनुहोस्', 'গ্যাস লিক! শান্তভাবে বাইরে যান', 'گیس لیک! سکون سے باہر جائیں', 'गैस लीक! शांति से बाहर जाएँ', 'Tumatagas ang gas! Lumabas nang kalmado']);
  p('h.child.flood', 'المياه ترتفع! ابقَ في الداخل', 'Water is rising! Stay inside', ['വെള്ളം ഉയരുന്നു! അകത്തുതന്നെ നിൽക്കുക', 'पानी बढ्दैछ! भित्रै बस्नुहोस्', 'পানি বাড়ছে! ভেতরেই থাকুন', 'پانی بڑھ رہا ہے! اندر ہی رہیں', 'पानी बढ़ रहा है! अंदर ही रहें', 'Tumataas ang tubig! Manatili sa loob']);
  p('h.child.dust', 'عاصفة غبار! ادخل إلى المبنى', 'Dust storm! Go inside', ['പൊടിക്കാറ്റ്! അകത്തു കയറുക', 'धुलोको आँधी! भित्र जानुहोस्', 'ধুলোঝড়! ভেতরে যান', 'گرد کا طوفان! اندر جائیں', 'धूल भरी आँधी! अंदर जाएँ', 'Bagyo ng alikabok! Pumasok sa loob']);
  p('h.child.heat', 'الجو حارّ جدًا! اذهب إلى مكان بارد', 'Too hot! Go somewhere cool', ['ചൂട് കൂടുതലാണ്! തണുപ്പുള്ള സ്ഥലത്തേക്ക് പോകുക', 'धेरै गर्मी! चिसो ठाउँमा जानुहोस्', 'অনেক গরম! ঠান্ডা জায়গায় যান', 'بہت گرمی ہے! ٹھنڈی جگہ پر جائیں', 'बहुत गर्मी है! ठंडी जगह पर जाएँ', 'Sobrang init! Pumunta sa malamig na lugar']);

  p('h.guard.fire.warning', 'حريق قريب — جهّز المبنى', 'Fire nearby — get the building ready');
  p('h.guard.fire.evacuate', 'حريق — أخلِ المبنى وأحصِ الناس', 'FIRE — evacuate and count everyone');
  p('h.guard.smoke.warning', 'دخان قريب — أغلق المبنى', 'Smoke nearby — close up the building');
  p('h.guard.gas.warning', 'غاز في الخارج — أبقِ السكان في الداخل', 'Gas outside — keep residents inside');
  p('h.guard.gas.evacuate', 'تسرّب غاز — أبعِد الجميع عن المصدر', 'GAS LEAK — move everyone away from the source');
  p('h.guard.flood.warning', 'المياه ترتفع — امنع النزول إلى الشارع', 'Water rising — stop people going down to the street');
  p('h.guard.flood.evacuate', 'سيول — انقل الناس إلى الأعلى', 'FLOOD — move people up');
  p('h.guard.dust', 'عاصفة غبارية — أدخِل الجميع', 'DUST STORM — bring everyone inside');
  p('h.guard.heat.warning', 'إجهاد حراري — أعطِ العمال استراحة', 'Heat stress — give workers a break');
  p('h.guard.heat.evacuate', 'خطر حرارة — انقل العمال إلى مكان التبريد', 'HEAT DANGER — move workers to the cool shelter');
  p('h.guard.sos', 'شخص يحتاج مساعدة — الغرفة {room}', 'Someone needs help — room {room}', null, { alt: 'h.guard.sos_any' });
  p('h.guard.sos_any', 'شخص يحتاج مساعدة في المبنى', 'Someone needs help in the building');
  p('h.guard.clear', 'انتهى التنبيه — أجرِ العدّ الأخير', 'Alert ended — do the final count');

  p('h.vol.watch', 'استعد — قد يحتاج أحد إلى مساعدتك', 'Stand by — someone may need your help');
  p('h.vol.warning', 'حالة محتملة قربك — استعد للمساعدة', 'Possible emergency near you — be ready to help');
  p('h.vol.evacuate', 'شخص يحتاج مساعدة — اذهب الآن', 'Someone needs help — go now');
  p('h.vol.clear', 'يمكنك التوقف — وصلت المساعدة', 'You can stand down — help has arrived');

  p('x.wake_prefix', 'استيقظ!', 'WAKE UP!', ['ഉണരൂ!', 'ब्यूँझिनुहोस्!', 'জেগে উঠুন!', 'جاگ جائیں!', 'जागिए!', 'Gumising!']);

  /* ---------- 5.3 instruction lines: general ---------- */
  p('i.keep_phone', 'أبقِ هاتفك معك وتابع التنبيهات.', 'Keep your phone with you and watch for updates.', ['ഫോൺ കൂടെ വെക്കുക, അറിയിപ്പുകൾ ശ്രദ്ധിക്കുക.', 'फोन आफूसँगै राख्नुहोस्, सूचना हेरिरहनुहोस्।', 'ফোন কাছে রাখুন, নতুন খবর দেখুন।', 'فون اپنے پاس رکھیں اور اطلاعات دیکھتے رہیں۔', 'फ़ोन अपने पास रखें और सूचनाएँ देखते रहें।', 'Dalhin ang telepono at bantayan ang mga update.']);
  p('i.no_action', 'لا يلزمك أي إجراء الآن.', 'You do not need to do anything now.', ['ഇപ്പോൾ നിങ്ങൾ ഒന്നും ചെയ്യേണ്ടതില്ല.', 'अहिले तपाईंले केही गर्नुपर्दैन।', 'এখন আপনাকে কিছু করতে হবে না।', 'ابھی آپ کو کچھ کرنے کی ضرورت نہیں۔', 'अभी आपको कुछ करने की ज़रूरत नहीं है।', 'Wala ka pang kailangang gawin ngayon.']);
  p('i.walk', 'امشِ ولا تركض.', 'Walk. Do not run.', ['നടക്കുക. ഓടരുത്.', 'हिँड्नुहोस्। नदौडिनुहोस्।', 'হাঁটুন। দৌড়াবেন না।', 'چلیں، دوڑیں نہیں۔', 'चलें, दौड़ें नहीं।', 'Maglakad. Huwag tumakbo.']);
  p('i.follow_arrows', 'اتبع الأسهم الخضراء.', 'Follow the green arrows.', ['പച്ച അമ്പടയാളങ്ങൾ പിന്തുടരുക.', 'हरिया तीरहरू पछ्याउनुहोस्।', 'সবুজ তীর অনুসরণ করুন।', 'سبز تیروں کے پیچھے چلیں۔', 'हरे तीरों का अनुसरण करें।', 'Sundan ang berdeng mga arrow.']);
  p('i.know_exit', 'تأكّد من معرفتك بأقرب مخرج.', 'Check where your nearest exit is.', ['ഏറ്റവും അടുത്ത പുറത്തേക്കുള്ള വഴി എവിടെയെന്ന് നോക്കി വെക്കുക.', 'सबैभन्दा नजिकको निकास कहाँ छ हेर्नुहोस्।', 'সবচেয়ে কাছের বের হওয়ার পথ কোথায় দেখে নিন।', 'قریب ترین خارجی راستہ دیکھ لیں۔', 'सबसे पास का निकास कहाँ है, देख लें।', 'Alamin kung nasaan ang pinakamalapit na labasan.']);
  p('i.count.tap', 'حين تصل إلى مكان آمن اضغط «أنا بأمان».', "When you are somewhere safe, tap “I'm safe”.");
  p('i.call999_out', 'اتصل بـ 999 من مكان آمن في الخارج.', 'Call 999 from a safe place outside.', null, { src: ['S40'] });
  p('i.help_room', 'المساعدة تعرف غرفتك.', 'Help knows your room.', ['സഹായം നിങ്ങളുടെ മുറി അറിയുന്നു.', 'सहायतालाई तपाईंको कोठा थाहा छ।', 'সাহায্যকারীরা আপনার ঘর জানে।', 'مدد کرنے والوں کو آپ کا کمرہ معلوم ہے۔', 'मदद करने वालों को आपका कमरा पता है।', 'Alam ng tulong ang iyong kuwarto.']);

  /* ---------- 5.4 fire and smoke ---------- */
  p('i.fire.exit', 'توجّه إلى أقرب مخرج مفتوح: {exit}.', 'Go to the nearest open exit: {exit}.', null, { alt: 'i.fire.exit_any' });
  p('i.fire.exit_any', 'توجّه إلى أقرب مخرج مفتوح.', 'Go to the nearest open exit.', ['ഏറ്റവും അടുത്ത തുറന്ന പുറത്തേക്കുള്ള വഴിയിലൂടെ പോകുക.', 'सबैभन्दा नजिकको खुला निकासतर्फ जानुहोस्।', 'সবচেয়ে কাছের খোলা বের হওয়ার পথে যান।', 'قریب ترین کھلے راستے سے باہر جائیں۔', 'सबसे पास के खुले निकास की ओर जाएँ।', 'Pumunta sa pinakamalapit na bukas na labasan.']);
  p('i.fire.stairs', 'استخدم الدرج ولا تستخدم المصعد.', 'Use the stairs. Do not use the lift.', ['പടിക്കെട്ട് ഉപയോഗിക്കുക. ലിഫ്റ്റ് ഉപയോഗിക്കരുത്.', 'सिँढी प्रयोग गर्नुहोस्। लिफ्ट प्रयोग नगर्नुहोस्।', 'সিঁড়ি ব্যবহার করুন। লিফট নয়।', 'سیڑھیاں استعمال کریں، لفٹ نہیں۔', 'सीढ़ियों का उपयोग करें, लिफ्ट का नहीं।', 'Gumamit ng hagdan. Huwag gumamit ng elevator.'], { review: 'confirm' });
  p('i.fire.low', 'إن وجدت دخانًا فابقَ منخفضًا وغطِّ أنفك وفمك.', 'If there is smoke, stay low and cover your nose and mouth.', ['പുകയുണ്ടെങ്കിൽ താഴ്ന്ന് നീങ്ങുക, മൂക്കും വായും മൂടുക.', 'धुवाँ भए होचो भएर हिँड्नुहोस्, नाक र मुख छोप्नुहोस्।', 'ধোঁয়া থাকলে নিচু হয়ে চলুন, নাক ও মুখ ঢাকুন।', 'دھواں ہو تو جھک کر چلیں، ناک اور منہ ڈھانپ لیں۔', 'धुआँ हो तो झुककर चलें, नाक और मुँह ढक लें।', 'Kung may usok, yumuko at takpan ang ilong at bibig.'], { review: 'confirm' });
  p('i.fire.close_doors', 'أغلق الأبواب خلفك.', 'Close doors behind you.', null, { src: [] });
  p('i.fire.never_back', 'خذ هاتفك فقط ولا تعد إلى الداخل لأخذ أي شيء.', 'Take your phone only. Do not go back in for anything.');
  p('i.fire.shut_win', 'أغلق كل النوافذ والأبواب.', 'Close all windows and doors.', ['എല്ലാ ജനലുകളും വാതിലുകളും അടയ്ക്കുക.', 'सबै झ्याल र ढोका बन्द गर्नुहोस्।', 'সব জানালা ও দরজা বন্ধ করুন।', 'تمام کھڑکیاں اور دروازے بند کریں۔', 'सभी खिड़कियाँ और दरवाज़े बंद करें।', 'Isara ang lahat ng bintana at pinto.']);
  p('i.fire.ac_off', 'أوقف التكييف الذي يسحب هواءً من الخارج.', 'Switch off air conditioning that pulls in outside air.', ['പുറത്തുനിന്ന് വായു വലിച്ചെടുക്കുന്ന എസി ഓഫ് ചെയ്യുക.', 'बाहिरको हावा तान्ने एसी बन्द गर्नुहोस्।', 'বাইরের বাতাস টানে এমন এসি বন্ধ করুন।', 'باہر کی ہوا کھینچنے والا اے سی بند کر دیں۔', 'बाहर की हवा खींचने वाला एसी बंद करें।', 'I-off ang aircon na kumukuha ng hangin mula sa labas.']);
  p('i.fire.ready', 'استعد للمغادرة إن طُلب منك، ولا تتجه نحو الحريق.', 'Be ready to leave if told. Do not go toward the fire.', ['പറഞ്ഞാൽ പുറത്തിറങ്ങാൻ തയ്യാറായിരിക്കുക. തീയുടെ അടുത്തേക്ക് പോകരുത്.', 'भनेमा निस्कन तयार रहनुहोस्। आगोतर्फ नजानुहोस्।', 'বললে বের হতে প্রস্তুত থাকুন। আগুনের দিকে যাবেন না।', 'کہا جائے تو نکلنے کے لیے تیار رہیں۔ آگ کی طرف نہ جائیں۔', 'कहा जाए तो निकलने के लिए तैयार रहें। आग की ओर न जाएँ।', 'Maghanda na lumabas kapag sinabihan. Huwag lumapit sa apoy.']);
  p('i.fire.refuge', 'اذهب إلى الشرفة الآمنة وابقَ فيها.', 'Go to the refuge balcony and stay there.', ['സുരക്ഷിത ബാൽക്കണിയിലേക്ക് പോയി അവിടെ തുടരുക.', 'सुरक्षित बाल्कोनीमा जानुहोस् र त्यहीँ बस्नुहोस्।', 'নিরাপদ বারান্দায় গিয়ে সেখানেই থাকুন।', 'محفوظ بالکونی میں جائیں اور وہیں رہیں۔', 'सुरक्षित बालकनी में जाएँ और वहीं रहें।', 'Pumunta sa ligtas na balkonahe at manatili roon.']);
  p('i.fire.no_stairs', 'لا تستخدم الدرج ولا المصعد.', 'Do not use the stairs or the lift.', ['പടിക്കെട്ടും ലിഫ്റ്റും ഉപയോഗിക്കരുത്.', 'सिँढी र लिफ्ट प्रयोग नगर्नुहोस्।', 'সিঁড়ি বা লিফট ব্যবহার করবেন না।', 'سیڑھیاں اور لفٹ استعمال نہ کریں۔', 'सीढ़ियों और लिफ्ट का उपयोग न करें।', 'Huwag gumamit ng hagdan o elevator.']);
  p('i.fire.loc_sent', 'أُرسل موقعك إلى الدفاع المدني.', 'Your location was sent to Civil Defence.', ['നിങ്ങളുടെ സ്ഥാനം സിവിൽ ഡിഫൻസിന് അയച്ചിട്ടുണ്ട്.', 'तपाईंको स्थान नागरिक सुरक्षा (सिभिल डिफेन्स) लाई पठाइएको छ।', 'আপনার অবস্থান সিভিল ডিফেন্সকে পাঠানো হয়েছে।', 'آپ کی لوکیشن سول ڈیفنس کو بھیج دی گئی ہے۔', 'आपकी लोकेशन सिविल डिफेंस को भेज दी गई है।', 'Naipadala na sa Civil Defence ang iyong lokasyon.']);
  p('i.fire.know_refuge', 'تأكّد من معرفتك بمكان الشرفة الآمنة.', 'Check where the refuge balcony is.', ['സുരക്ഷിത ബാൽക്കണി എവിടെയാണെന്ന് നോക്കി വെക്കുക.', 'सुरक्षित बाल्कोनी कहाँ छ हेर्नुहोस्।', 'নিরাপদ বারান্দা কোথায় দেখে নিন।', 'محفوظ بالکونی کہاں ہے، دیکھ لیں۔', 'सुरक्षित बालकनी कहाँ है, देख लें।', 'Alamin kung nasaan ang ligtas na balkonahe.']);
  p('i.fire.elder.rail', 'أمسك الدرابزين وانزل خطوة خطوة.', 'Hold the rail and go down step by step.', ['കൈവരി പിടിച്ച് ഓരോ പടിയായി ഇറങ്ങുക.', 'रेलिङ समातेर एक-एक पाइला तल झर्नुहोस्।', 'রেলিং ধরে ধাপে ধাপে নামুন।', 'ریلنگ پکڑ کر قدم بہ قدم نیچے اتریں۔', 'रेलिंग पकड़कर एक-एक कदम नीचे उतरें।', 'Humawak sa barandilya at bumaba nang paunti-unti.']);
  p('i.fire.elder.help', 'اطلب من جار أو من الحارس أن يساعدك.', 'Ask a neighbour or the guard to help you.', ['അയൽക്കാരനോടോ കാവൽക്കാരനോടോ സഹായം ചോദിക്കുക.', 'छिमेकी वा गार्डलाई सहायता माग्नुहोस्।', 'প্রতিবেশী বা গার্ডের কাছে সাহায্য চান।', 'پڑوسی یا گارڈ سے مدد مانگیں۔', 'पड़ोसी या गार्ड से मदद माँगें।', 'Humingi ng tulong sa kapitbahay o sa guwardiya.']);
  p('i.smoke.prepare', 'استعد لإغلاق النوافذ والأبواب.', 'Be ready to close windows and doors.', ['ജനലുകളും വാതിലുകളും അടയ്ക്കാൻ തയ്യാറായിരിക്കുക.', 'झ्याल र ढोका बन्द गर्न तयार रहनुहोस्।', 'জানালা ও দরজা বন্ধ করতে প্রস্তুত থাকুন।', 'کھڑکیاں اور دروازے بند کرنے کے لیے تیار رہیں۔', 'खिड़कियाँ और दरवाज़े बंद करने के लिए तैयार रहें।', 'Maghanda na isara ang mga bintana at pinto.']);
  p('i.smoke.fresh_air', 'اخرج إلى هواء نقي.', 'Get out to fresh air.', ['ശുദ്ധവായുവിലേക്ക് പുറത്തിറങ്ങുക.', 'ताजा हावामा बाहिर निस्कनुहोस्।', 'খোলা বাতাসে বেরিয়ে আসুন।', 'کھلی ہوا میں باہر نکل جائیں۔', 'खुली हवा में बाहर निकलें।', 'Lumabas sa sariwang hangin.']);
  p('i.air.asthma', 'إن كنت تعاني من الربو أو مرض القلب أو الرئة فابقَ في الداخل وأبقِ دواءك قريبًا.', 'If you have asthma or a heart or lung condition, stay in and keep your medicine near you.', ['ആസ്ത്മയോ ഹൃദയ-ശ്വാസകോശ രോഗമോ ഉണ്ടെങ്കിൽ അകത്തു തുടരുക, മരുന്ന് അടുത്ത് വെക്കുക.', 'दम, मुटु वा फोक्सोको समस्या भए भित्रै बस्नुहोस्, औषधि नजिकै राख्नुहोस्।', 'হাঁপানি বা হৃদ্‌রোগ-ফুসফুসের সমস্যা থাকলে ভেতরেই থাকুন, ওষুধ কাছে রাখুন।', 'دمہ، دل یا پھیپھڑوں کی بیماری ہو تو اندر ہی رہیں اور دوا پاس رکھیں۔', 'अस्थमा या दिल-फेफड़ों की बीमारी हो तो अंदर ही रहें और दवा पास रखें।', 'Kung may hika o sakit sa puso o baga, manatili sa loob at ilapit ang gamot.'], { review: 'confirm' });
  p('i.clear.air', 'افتح النوافذ حين يصفو الهواء.', 'Open the windows when the air is clear.', ['വായു തെളിഞ്ഞാൽ ജനലുകൾ തുറക്കുക.', 'हावा सफा भएपछि झ्याल खोल्नुहोस्।', 'বাতাস পরিষ্কার হলে জানালা খুলুন।', 'ہوا صاف ہو جائے تو کھڑکیاں کھولیں۔', 'हवा साफ़ होने पर खिड़कियाँ खोलें।', 'Buksan ang mga bintana kapag malinis na ang hangin.']);

  /* ---------- 5.5 gas ---------- */
  p('i.gas.no_switch', 'لا تلمس المفاتيح الكهربائية ولا تُشعل أي لهب.', 'Do not touch electrical switches. No flames.', ['വൈദ്യുത സ്വിച്ചുകളിൽ തൊടരുത്. തീ കത്തിക്കരുത്.', 'बिजुलीका स्विचमा नछुनुहोस्. आगो नबाल्नुहोस्.', 'বিদ্যুতের সুইচ ছোঁবেন না. আগুন জ্বালাবেন না.', 'بجلی کے سوئچ کو ہاتھ نہ لگائیں۔ آگ نہ جلائیں۔', 'बिजली के स्विच को न छुएँ। आग न जलाएँ।', 'Huwag humawak ng switch ng kuryente. Walang apoy.'], { src: ['S40'] });
  p('i.gas.no_flame', 'لا تُشعل لهبًا ولا تدخّن قرب المنطقة.', 'No flames or smoking near the area.', ['ഈ പ്രദേശത്തിനടുത്ത് തീ കത്തിക്കരുത്, പുകവലിക്കരുത്.', 'यस क्षेत्र नजिक आगो नबाल्नुहोस्, धुम्रपान नगर्नुहोस्।', 'এই এলাকার কাছে আগুন জ্বালাবেন না, ধূমপান করবেন না।', 'اس علاقے کے قریب آگ نہ جلائیں اور سگریٹ نہ پئیں۔', 'इस इलाके के पास आग न जलाएँ और धूम्रपान न करें।', 'Huwag magsindi ng apoy o manigarilyo malapit sa lugar.']);
  p('i.gas.crosswind', 'ابتعد عن مصدر التسرّب بعرض اتجاه الريح أو عكسه.', 'Move away from the leak, across the wind or into the wind.', ['ചോർച്ചയിൽ നിന്ന് അകന്നുപോകുക — കാറ്റിന് കുറുകെയോ കാറ്റിനെതിരെയോ നീങ്ങുക.', 'चुहावटबाट टाढा जानुहोस् — हावाको आडो वा हावाको विपरीत दिशामा।', 'লিক থেকে দূরে যান — বাতাসের আড়াআড়ি বা বাতাসের বিপরীতে চলুন।', 'لیک سے دور جائیں — ہوا کے آر پار یا ہوا کے مخالف سمت میں۔', 'रिसाव से दूर जाएँ — हवा के आड़े या हवा के विपरीत दिशा में।', 'Lumayo sa tagas, pahalang sa hangin o pasalungat sa hangin.']);
  p('i.gas.crosswind_arrow', 'تحرّك بعرض اتجاه الريح — اتبع السهم على الشاشة.', 'Move across the wind — follow the arrow on the screen.', ['കാറ്റിന് കുറുകെ നീങ്ങുക — സ്ക്രീനിലെ അമ്പടയാളം പിന്തുടരുക.', 'हावाको आडो दिशामा जानुहोस् — स्क्रिनको तीर पछ्याउनुहोस्।', 'বাতাসের আড়াআড়ি চলুন — পর্দার তীর অনুসরণ করুন।', 'ہوا کے آر پار جائیں — اسکرین کے تیر کے پیچھے چلیں۔', 'हवा के आड़े चलें — स्क्रीन पर तीर का अनुसरण करें।', 'Lumakad nang pahalang sa hangin — sundan ang arrow sa screen.']);
  p('i.gas.low', 'ابتعد عن الأماكن المنخفضة، فالغاز الثقيل يتجمّع فيها.', 'Stay away from low places — heavy gas collects there.', ['താഴ്ന്ന സ്ഥലങ്ങളിൽ നിന്ന് അകന്നുനിൽക്കുക — ഭാരമുള്ള ഗ്യാസ് അവിടെ അടിഞ്ഞുകൂടും.', 'होचो ठाउँबाट टाढा रहनुहोस् — भारी ग्यास त्यहाँ जम्मा हुन्छ.', 'নিচু জায়গা থেকে দূরে থাকুন — ভারী গ্যাস সেখানে জমে.', 'نشیبی جگہوں سے دور رہیں — بھاری گیس وہاں جمع ہوتی ہے۔', 'नीची जगहों से दूर रहें — भारी गैस वहाँ जमा होती है।', 'Lumayo sa mabababang lugar — doon naiipon ang mabigat na gas.'], { src: ['S47', 'S48'] });
  p('i.gas.open', 'التسرّب داخل بيتك؟ افتح الأبواب والنوافذ وأنت تخرج (إرشاد الدفاع المدني).', 'Leak inside your home? Open doors and windows as you leave (Civil Defence advice).', null, { src: ['S40'] });
  p('i.gas.no_phone', 'لا تستخدم الهاتف قرب المصدر؛ اتصل بـ 999 من مكان بعيد.', 'Do not use a phone near the source — call 999 from far away.', null, { review: 'confirm' });
  p('i.gas.smell', 'لا تعتمد على حاسة الشم، فقد تختفي الرائحة.', 'Do not rely on smell — it can fade.', null, { src: ['S47', 'S48'] });
  p('i.gas.stay', 'ابقَ في الداخل وأغلق النوافذ والفتحات.', 'Stay inside. Close windows and vents.', ['അകത്തുതന്നെ തുടരുക. ജനലുകളും വെന്റുകളും അടയ്ക്കുക.', 'भित्रै बस्नुहोस्। झ्याल र भेन्ट बन्द गर्नुहोस्।', 'ভেতরেই থাকুন। জানালা ও ভেন্ট বন্ধ করুন।', 'اندر ہی رہیں۔ کھڑکیاں اور وینٹ بند کریں۔', 'अंदर ही रहें। खिड़कियाँ और वेंट बंद करें।', 'Manatili sa loob. Isara ang mga bintana at bentilasyon.']);
  p('i.gas.ready', 'استعد للمغادرة بعرض اتجاه الريح إن طُلب منك.', 'Be ready to leave across the wind if told.', ['പറഞ്ഞാൽ കാറ്റിന് കുറുകെ പുറത്തിറങ്ങാൻ തയ്യാറായിരിക്കുക.', 'भनेमा हावाको आडो दिशामा निस्कन तयार रहनुहोस्।', 'বললে বাতাসের আড়াআড়ি বের হতে প্রস্তুত থাকুন।', 'کہا جائے تو ہوا کے آر پار نکلنے کے لیے تیار رہیں۔', 'कहा जाए तो हवा के आड़े निकलने के लिए तैयार रहें।', 'Maghanda na lumabas nang pahalang sa hangin kapag sinabihan.']);
  p('i.gas.wheel_open', 'افتح نافذة إن استطعت الوصول إليها.', 'Open a window if you can reach it.', ['എത്താൻ കഴിയുന്നെങ്കിൽ ഒരു ജനൽ തുറക്കുക.', 'पुग्न सक्नुहुन्छ भने एउटा झ्याल खोल्नुहोस्.', 'নাগাল পেলে একটি জানালা খুলুন.', 'اگر پہنچ سکیں تو ایک کھڑکی کھول دیں۔', 'पहुँच सकें तो एक खिड़की खोल दें।', 'Magbukas ng bintana kung maaabot mo.'], { src: ['S40'] });
  p('i.gas.wheel_route', 'إن وُجد طريق خروج بلا درج فاتبع الأسهم الخضراء.', 'If there is a step-free way out, follow the green arrows.');
  p('i.gas.co.air', 'اخرج إلى الهواء النقي فورًا.', 'Get into fresh air at once.');
  p('i.gas.co.check', 'تفقّد من حولك: الصداع والدوار علامتان تحذيريتان.', 'Check on others — headache and dizziness are warning signs.', null, { src: ['S47'], review: 'medical' });

  /* ---------- 5.6 flood ---------- */
  p('i.flood.up', 'اصعد إلى طابق أعلى أو مكان مرتفع.', 'Go to an upper floor or higher ground.', ['മുകൾ നിലയിലേക്കോ ഉയർന്ന സ്ഥലത്തേക്കോ പോകുക.', 'माथिल्लो तला वा अग्लो ठाउँमा जानुहोस्।', 'উপরের তলায় বা উঁচু জায়গায় যান।', 'اوپر کی منزل یا اونچی جگہ پر جائیں۔', 'ऊपर की मंज़िल या ऊँची जगह पर जाएँ।', 'Umakyat sa itaas na palapag o mataas na lugar.']);
  p('i.flood.underpass', 'لا تدخل النفق ولا الطرق المنخفضة.', 'Do not enter the underpass or low roads.', ['അണ്ടർപാസിലോ താഴ്ന്ന റോഡുകളിലോ കയറരുത്.', 'अन्डरपास वा होचो सडकमा नजानुहोस्।', 'আন্ডারপাস বা নিচু রাস্তায় ঢুকবেন না।', 'انڈر پاس یا نشیبی سڑکوں میں داخل نہ ہوں۔', 'अंडरपास या नीची सड़कों में न जाएँ।', 'Huwag pumasok sa underpass o mabababang kalsada.']);
  p('i.flood.through', 'لا تمشِ ولا تقُد عبر مياه جارية أبدًا.', 'Never walk or drive through moving water.', ['ഒഴുകുന്ന വെള്ളത്തിലൂടെ ഒരിക്കലും നടക്കുകയോ വാഹനമോടിക്കുകയോ ചെയ്യരുത്.', 'बगिरहेको पानीमा कहिल्यै नहिँड्नुहोस् वा गाडी नचलाउनुहोस्.', 'বহমান পানির মধ্য দিয়ে কখনো হাঁটবেন না বা গাড়ি চালাবেন না.', 'بہتے پانی میں کبھی پیدل نہ چلیں اور نہ گاڑی چلائیں۔', 'बहते पानी में कभी न चलें और न गाड़ी चलाएँ।', 'Huwag kailanman maglakad o magmaneho sa umaagos na tubig.'], { src: ['S55'] });
  p('i.flood.stay_up', 'إن كنت في الطابق العلوي فابقَ فيه ولا تنزل إلى الشارع.', 'If you are upstairs, stay there. Do not go down to the street.', ['മുകളിലാണെങ്കിൽ അവിടെ തന്നെ തുടരുക. തെരുവിലേക്ക് ഇറങ്ങരുത്.', 'माथि हुनुहुन्छ भने त्यहीँ बस्नुहोस्। सडकमा नओर्लनुहोस्।', 'উপরে থাকলে সেখানেই থাকুন। রাস্তায় নামবেন না।', 'اوپر ہیں تو وہیں رہیں۔ نیچے سڑک پر نہ جائیں۔', 'ऊपर हैं तो वहीं रहें। नीचे सड़क पर न जाएँ।', 'Kung nasa itaas ka, manatili roon. Huwag bumaba sa kalye.']);
  p('i.flood.ground_up', 'في الطابق الأرضي؟ استعد للصعود.', 'On the ground floor? Be ready to go up.', ['താഴത്തെ നിലയിലാണെങ്കിൽ മുകളിലേക്ക് പോകാൻ തയ്യാറായിരിക്കുക.', 'भुइँतलामा हुनुहुन्छ भने माथि जान तयार रहनुहोस्।', 'নিচতলায় থাকলে উপরে যেতে প্রস্তুত থাকুন।', 'گراؤنڈ فلور پر ہیں تو اوپر جانے کے لیے تیار رہیں۔', 'भूतल पर हैं तो ऊपर जाने के लिए तैयार रहें।', 'Kung nasa ground floor ka, maghanda na umakyat.']);
  p('i.flood.stay_up_w', 'ابقَ في الطابق العلوي ولا تنزل.', 'Stay upstairs. Do not go down.', ['മുകളിൽ തന്നെ തുടരുക. താഴേക്ക് ഇറങ്ങരുത്.', 'माथि नै बस्नुहोस्। तल नओर्लनुहोस्।', 'উপরেই থাকুন। নিচে নামবেন না।', 'اوپر ہی رہیں۔ نیچے نہ جائیں۔', 'ऊपर ही रहें। नीचे न जाएँ।', 'Manatili sa itaas. Huwag bumaba.']);
  p('i.flood.no_drive', 'لا تعبر المياه بسيارتك. ارجع.', 'Do not drive through water. Turn around.', null, { src: ['S55'] });
  p('i.flood.puddle', 'لا تختبر عمق البرك بنفسك؛ قد تكون أعمق مما تبدو.', 'Do not test puddles — they can be deeper than they look.', null, { src: ['S71'] });
  p('i.flood.electric', 'ابتعد عن فتحات التصريف المفتوحة وعن مصادر الكهرباء.', 'Keep away from open drains and electrical equipment.', ['തുറന്ന ഓടകളിൽ നിന്നും വൈദ്യുത ഉപകരണങ്ങളിൽ നിന്നും അകന്നുനിൽക്കുക.', 'खुला नाला र बिजुलीका उपकरणबाट टाढा रहनुहोस्.', 'খোলা ড্রেন ও বৈদ্যুতিক সরঞ্জাম থেকে দূরে থাকুন.', 'کھلی نالیوں اور بجلی کے آلات سے دور رہیں۔', 'खुली नालियों और बिजली के उपकरणों से दूर रहें।', 'Lumayo sa bukas na kanal at kagamitang de-kuryente.'], { src: ['S71'] });
  p('i.flood.numbers', 'البلدية 184 · أشغال 188 · كهرماء 991 (انقطاع الكهرباء) · 999 (خطر على الحياة).', 'Municipality 184 · Ashghal 188 · Kahramaa 991 (power cut) · 999 (danger to life).', null, { src: ['S71'] });
  p('i.flood.reach_call', 'إن وصل الماء إليك فاتصل بـ 999.', 'If water reaches you, call 999.', ['വെള്ളം നിങ്ങളുടെ അടുത്തെത്തിയാൽ 999 വിളിക്കുക.', 'पानी तपाईंसम्म पुगे 999 मा फोन गर्नुहोस्।', 'পানি আপনার কাছে পৌঁছালে 999-এ ফোন করুন।', 'پانی آپ تک پہنچ جائے تو 999 پر کال کریں۔', 'पानी आप तक पहुँचे तो 999 पर कॉल करें।', 'Kapag umabot sa iyo ang tubig, tumawag sa 999.']);

  /* ---------- 5.7 dust ---------- */
  p('i.dust.inside', 'ادخل إلى مبنى مغلق وأغلق النوافذ والأبواب.', 'Go into a closed building. Close windows and doors.', ['അടച്ച കെട്ടിടത്തിനുള്ളിൽ കയറുക. ജനലുകളും വാതിലുകളും അടയ്ക്കുക.', 'बन्द भवनभित्र जानुहोस्। झ्याल र ढोका बन्द गर्नुहोस्।', 'বন্ধ ভবনের ভেতরে যান। জানালা ও দরজা বন্ধ করুন।', 'بند عمارت کے اندر جائیں۔ کھڑکیاں اور دروازے بند کریں۔', 'बंद इमारत के अंदर जाएँ। खिड़कियाँ और दरवाज़े बंद करें।', 'Pumasok sa saradong gusali. Isara ang mga bintana at pinto.']);
  p('i.dust.stay', 'ابقَ في الداخل ونوافذك وأبوابك مغلقة.', 'Stay indoors with windows and doors closed.', ['ജനലുകളും വാതിലുകളും അടച്ച് അകത്തുതന്നെ തുടരുക.', 'झ्याल र ढोका बन्द गरेर भित्रै बस्नुहोस्।', 'জানালা ও দরজা বন্ধ করে ভেতরেই থাকুন।', 'کھڑکیاں اور دروازے بند کر کے اندر ہی رہیں۔', 'खिड़कियाँ और दरवाज़े बंद करके अंदर ही रहें।', 'Manatili sa loob na nakasara ang mga bintana at pinto.']);
  p('i.dust.mask', 'إن اضطررت للخروج فضع كمامة للغبار.', 'If you must go out, wear a dust mask.', ['പുറത്തിറങ്ങേണ്ടി വന്നാൽ പൊടി മാസ്ക് ധരിക്കുക.', 'बाहिर जानै परे धुलो मास्क लगाउनुहोस्।', 'বাইরে যেতেই হলে ধুলোর মাস্ক পরুন।', 'باہر جانا ضروری ہو تو گرد سے بچاؤ کا ماسک پہنیں۔', 'बाहर जाना ही पड़े तो धूल का मास्क पहनें।', 'Kung kailangang lumabas, magsuot ng dust mask.'], { review: 'medical' });
  p('i.dust.stop', 'أوقف العمل في الخارج والقيادة.', 'Stop outdoor work and driving.', ['പുറത്തെ ജോലിയും വാഹനമോടിക്കലും നിർത്തുക.', 'बाहिरको काम र गाडी चलाउन रोक्नुहोस्।', 'বাইরের কাজ ও গাড়ি চালানো বন্ধ করুন।', 'باہر کا کام اور گاڑی چلانا روک دیں۔', 'बाहर का काम और गाड़ी चलाना रोक दें।', 'Itigil ang trabaho sa labas at pagmamaneho.']);
  p('i.dust.prepare', 'أنهِ أعمالك في الخارج واستعد للدخول.', 'Finish outdoor jobs and be ready to go inside.', ['പുറത്തെ ജോലികൾ തീർത്ത് അകത്തുകയറാൻ തയ്യാറാകുക.', 'बाहिरका काम सक्नुहोस् र भित्र जान तयार हुनुहोस्।', 'বাইরের কাজ শেষ করুন, ভেতরে যেতে প্রস্তুত হোন।', 'باہر کے کام ختم کریں اور اندر جانے کے لیے تیار ہو جائیں۔', 'बाहर के काम निपटाएँ और अंदर जाने के लिए तैयार रहें।', 'Tapusin ang mga gawain sa labas at maghanda na pumasok.']);
  p('i.dust.eta', 'يُتوقع وصول الغبار خلال نحو {mins}.', 'The dust front is expected in about {mins}.', null, { alt: 'i.dust.prepare' });
  p('i.dust.meds_near', 'أبقِ أدويتك قريبة منك.', 'Keep your medicines near you.', ['മരുന്നുകൾ അടുത്ത് വെക്കുക.', 'औषधि नजिकै राख्नुहोस्।', 'ওষুধ কাছে রাখুন।', 'اپنی دوائیں اپنے پاس رکھیں۔', 'अपनी दवाएँ पास रखें।', 'Ilapit ang iyong mga gamot.']);

  /* ---------- 5.8 heat ---------- */
  p('i.heat.stop', 'أوقف العمل الآن.', 'Stop work now.', ['ഇപ്പോൾ ജോലി നിർത്തുക.', 'अहिले नै काम रोक्नुहोस्।', 'এখনই কাজ বন্ধ করুন।', 'ابھی کام روک دیں۔', 'अभी काम रोक दें।', 'Itigil na ang trabaho.']);
  p('i.heat.shade', 'اذهب إلى الظل أو مكان التبريد.', 'Go to the shade or the cool shelter.', ['തണലിലേക്കോ തണുപ്പുള്ള വിശ്രമസ്ഥലത്തേക്കോ പോകുക.', 'छहारी वा चिसो आश्रयमा जानुहोस्।', 'ছায়ায় বা ঠান্ডা আশ্রয়ে যান।', 'سائے یا ٹھنڈی پناہ گاہ میں جائیں۔', 'छाँव या ठंडे आश्रय में जाएँ।', 'Pumunta sa lilim o malamig na silungan.']);
  p('i.heat.shelter', 'اذهب إلى الظل أو مكان التبريد: {shelter}.', 'Go to the shade or the cool shelter: {shelter}.', null, { alt: 'i.heat.shade' });
  p('i.heat.water', 'اشرب ماءً.', 'Drink water.', ['വെള്ളം കുടിക്കുക.', 'पानी पिउनुहोस्।', 'পানি পান করুন।', 'پانی پئیں۔', 'पानी पिएँ।', 'Uminom ng tubig.']);
  p('i.heat.tell', 'أخبر أحدًا إن شعرت بدوار أو ارتباك.', 'Tell someone if you feel dizzy or confused.', ['തലകറക്കമോ ആശയക്കുഴപ്പമോ തോന്നിയാൽ ആരോടെങ്കിലും പറയുക.', 'चक्कर आए वा अलमल भए कसैलाई भन्नुहोस्।', 'মাথা ঘুরলে বা বিভ্রান্ত লাগলে কাউকে জানান।', 'چکر آئے یا الجھن ہو تو کسی کو بتائیں۔', 'चक्कर आए या उलझन हो तो किसी को बताएँ।', 'Sabihin sa iba kung nahihilo o naguguluhan ka.']);
  p('i.heat.rest_shade', 'ارتح في الظل كلما استطعت.', 'Rest in the shade when you can.', ['സാധിക്കുമ്പോൾ തണലിൽ വിശ്രമിക്കുക.', 'सकेसम्म छहारीमा आराम गर्नुहोस्।', 'সুযোগ পেলেই ছায়ায় বিশ্রাম নিন।', 'موقع ملے تو سائے میں آرام کریں۔', 'मौका मिलते ही छाँव में आराम करें।', 'Magpahinga sa lilim kapag kaya.']);
  p('i.heat.cool_room', 'ابقَ في غرفة باردة.', 'Stay in a cool room.', ['തണുപ്പുള്ള മുറിയിൽ തുടരുക.', 'चिसो कोठामा बस्नुहोस्।', 'ঠান্ডা ঘরে থাকুন।', 'ٹھنڈے کمرے میں رہیں۔', 'ठंडे कमरे में रहें।', 'Manatili sa malamig na kuwarto.']);
  p('i.heat.classroom', 'ادخل إلى الصف المكيّف.', 'Go inside to the cool classroom.', ['തണുപ്പുള്ള ക്ലാസ്മുറിയിലേക്ക് പോകുക.', 'चिसो कक्षाकोठामा जानुहोस्।', 'ঠান্ডা ক্লাসরুমে যান।', 'ٹھنڈے کلاس روم میں جائیں۔', 'ठंडी कक्षा में जाएँ।', 'Pumasok sa malamig na silid-aralan.']);
  p('i.heat.signs', 'حرارة جسم شديدة أو ارتباك أو إغماء؟ اتصل بـ 999 وبرّد الجسم بقطع قماش مبلّلة ولا تسقِ المصاب شيئًا.', 'Very hot skin, confusion or fainting? Call 999, cool the body with wet cloths, give nothing to drink.', ['ശരീരം വല്ലാതെ ചൂടായാലോ ആശയക്കുഴപ്പമോ ബോധക്ഷയമോ ഉണ്ടായാലോ 999 വിളിക്കുക; നനഞ്ഞ തുണി കൊണ്ട് തണുപ്പിക്കുക; കുടിക്കാൻ ഒന്നും നൽകരുത്.', 'शरीर धेरै तातेमा, अलमल वा बेहोस भए 999 मा फोन गर्नुहोस्; भिजेको कपडाले चिसो पार्नुहोस्; पिउन केही नदिनुहोस्.', 'শরীর খুব গরম হলে, বিভ্রান্ত হলে বা অজ্ঞান হলে 999-এ ফোন করুন; ভেজা কাপড়ে ঠান্ডা করুন; খাওয়ার কিছু দেবেন না.', 'جسم بہت گرم ہو، الجھن ہو یا بے ہوشی ہو تو 999 پر کال کریں؛ گیلے کپڑے سے ٹھنڈا کریں؛ پینے کو کچھ نہ دیں۔', 'शरीर बहुत गर्म हो, उलझन हो या बेहोशी हो तो 999 पर कॉल करें; गीले कपड़े से ठंडा करें; पीने को कुछ न दें।', 'Kung sobrang init ng katawan, naguguluhan, o nawalan ng malay: tumawag sa 999, palamigin gamit ang basang tela, at huwag painumin.'], { src: ['S54'], review: 'medical' });
  p('i.heat.rest', 'ارتح في مكان بارد حتى تشعر بالتحسّن.', 'Rest somewhere cool until you feel better.');
  p('i.heat.auto_sos', 'إن لم تردّ، ستطلب منارة المساعدة لك.', 'If you do not answer, MANARA will ask for help for you.');
  p('i.heat.shelter_tap', 'حين تصل إلى مكان التبريد اضغط «أنا بأمان».', "When you reach the cool shelter, tap “I'm safe”.");

  /* ---------- 5.9 someone needs help ---------- */
  p('i.sos.checkin', 'اضغط «أنا بأمان» إن كنت بخير، أو «أحتاج مساعدة».', "Tap “I'm safe” if you are OK, or “I need help”.", ['സുഖമാണെങ്കിൽ “ഞാൻ സുരക്ഷിതനാണ്” അമർത്തുക, അല്ലെങ്കിൽ “എനിക്ക് സഹായം വേണം”.', 'ठीक हुनुहुन्छ भने “म सुरक्षित छु” थिच्नुहोस्, नत्र “मलाई सहायता चाहिन्छ”।', 'ঠিক থাকলে “আমি নিরাপদ” চাপুন, না হলে “আমার সাহায্য দরকার”।', 'ٹھیک ہیں تو “میں محفوظ ہوں” دبائیں، ورنہ “مجھے مدد چاہیے”۔', 'ठीक हैं तो “मैं सुरक्षित हूँ” दबाएँ, नहीं तो “मुझे मदद चाहिए”।', 'Pindutin ang “Ligtas ako” kung okay ka, o “Kailangan ko ng tulong”.']);
  p('i.sos.silent', 'إن لم تردّ فسنطلب المساعدة لك.', 'If you do not answer, we will ask for help for you.', ['മറുപടി തന്നില്ലെങ്കിൽ ഞങ്ങൾ നിങ്ങൾക്കായി സഹായം തേടും.', 'जवाफ नदिए हामी तपाईंका लागि सहायता मागौंला।', 'উত্তর না দিলে আমরা আপনার জন্য সাহায্য চাইব।', 'جواب نہ دیا تو ہم آپ کے لیے مدد بلائیں گے۔', 'जवाब नहीं दिया तो हम आपके लिए मदद बुलाएँगे।', 'Kapag hindi ka sumagot, hihingi kami ng tulong para sa iyo.']);
  p('i.sos.coming', 'المساعدة قادمة إليك.', 'Help is coming to you.', ['സഹായം നിങ്ങളുടെ അടുത്തേക്ക് വരുന്നു.', 'सहायता तपाईंतिर आउँदैछ।', 'সাহায্য আপনার কাছে আসছে।', 'مدد آپ کی طرف آ رہی ہے۔', 'मदद आपके पास आ रही है।', 'Papunta na ang tulong sa iyo.']);
  p('i.sos.coming_eta', 'المساعدة قادمة خلال نحو {mins}.', 'Help is coming in about {mins}.', ['സഹായം ഏകദേശം {mins} ഉള്ളിൽ എത്തും.', 'सहायता लगभग {mins} मा पुग्छ।', 'সাহায্য প্রায় {mins}-এর মধ্যে পৌঁছাবে।', 'مدد تقریباً {mins} میں پہنچ جائے گی۔', 'मदद लगभग {mins} में पहुँच जाएगी।', 'Darating ang tulong sa loob ng mga {mins}.'], { alt: 'i.sos.coming' });
  p('i.sos.coming_room', 'المساعدة قادمة إلى غرفتك.', 'Help is coming to your room.', ['സഹായം നിങ്ങളുടെ മുറിയിലേക്ക് വരുന്നു.', 'सहायता तपाईंको कोठामा आउँदैछ।', 'সাহায্য আপনার ঘরে আসছে।', 'مدد آپ کے کمرے میں آ رہی ہے۔', 'मदद आपके कमरे में आ रही है।', 'Papunta na ang tulong sa kuwarto mo.']);
  p('i.sos.stay', 'ابقَ مكانك وحاول أن تبقى هادئًا.', 'Stay where you are and try to stay calm.', ['ഇവിടെ തന്നെ നിൽക്കുക, ശാന്തമായിരിക്കാൻ ശ്രമിക്കുക.', 'यहीँ बस्नुहोस् र शान्त रहन प्रयास गर्नुहोस्।', 'যেখানে আছেন সেখানেই থাকুন, শান্ত থাকার চেষ্টা করুন।', 'جہاں ہیں وہیں رہیں اور پرسکون رہنے کی کوشش کریں۔', 'जहाँ हैं वहीं रहें और शांत रहने की कोशिश करें।', 'Manatili kung nasaan ka at subukang kumalma.']);
  p('i.sos.unlock', 'افتح الباب إن استطعت.', 'Unlock the door if you can.', ['കഴിയുമെങ്കിൽ വാതിൽ തുറന്നിടുക.', 'सक्नुहुन्छ भने ढोका खोलिदिनुहोस्।', 'পারলে দরজা খুলে দিন।', 'ہو سکے تو دروازہ کھول دیں۔', 'हो सके तो दरवाज़ा खोल दें।', 'Buksan ang pinto kung kaya mo.']);
  p('i.sos.ambulance', 'الإسعاف في الطريق.', 'An ambulance is on its way.');
  p('i.sos.vol.go', 'شخص يحتاج مساعدة في الغرفة {room}. اذهب الآن.', 'Someone needs help in room {room}. Go now.', null, { alt: 'i.sos.vol.go_any' });
  p('i.sos.vol.go_any', 'شخص قريب منك يحتاج مساعدة. اذهب الآن.', 'Someone near you needs help. Go now.');
  p('i.sos.vol.aed', 'خذ جهاز الصدمات (AED) من {place}.', 'Take the AED from {place}.', null, { alt: 'i.sos.vol.aed_any' });
  p('i.sos.vol.aed_any', 'خذ جهاز الصدمات (AED) إن عرفت مكانه.', 'Take an AED if you know where one is.');
  p('i.sos.vol.call', 'اتصل بـ 999 إن لم يتصل أحد.', 'Call 999 if no one has.');
  p('i.sos.vol.standby', 'استعد: قد يحتاج شخص قريب إلى مساعدتك.', 'Stand by: someone near you may need your help.');
  p('i.sos.vol.safe', 'لا تعرّض نفسك للخطر.', 'Do not put yourself in danger.');
  p('i.sos.recovery', 'إن كان المصاب يتنفس لكنه لا يستجيب فاقلبه برفق على جنبه.', 'If the person is breathing but not responding, gently turn them onto their side.', null, { review: 'medical' });
  p('i.vol.standdown', 'شكرًا لك. فريق الإسعاف تولّى الحالة.', 'Thank you. The ambulance team has taken over.');
  p('i.child.sos', 'معلّمك قادم. ابقَ مكانك.', 'A teacher is coming. Stay where you are.', ['ഒരു ടീച്ചർ വരുന്നുണ്ട്. ഇവിടെ തന്നെ നിൽക്കുക.', 'शिक्षक आउँदै हुनुहुन्छ। यहीँ बस्नुहोस्।', 'একজন শিক্ষক আসছেন। এখানেই থাকুন।', 'استاد آ رہے ہیں۔ یہیں رہیں۔', 'शिक्षक आ रहे हैं। यहीं रहें।', 'Paparating ang isang guro. Manatili ka riyan.']);

  /* ---------- 5.10 all-clear lines ---------- */
  p('i.clear.over', 'انتهى التنبيه.', 'The alert is over.', ['മുന്നറിയിപ്പ് അവസാനിച്ചു.', 'सतर्कता सकियो।', 'সতর্কতা শেষ।', 'الرٹ ختم ہو گیا ہے۔', 'अलर्ट समाप्त हो गया है।', 'Tapos na ang alerto.']);
  p('i.clear.fire', 'لا تعد إلى المبنى إلا حين يؤكد الحارس أو الدفاع المدني أنه آمن.', 'Do not go back in until the guard or Civil Defence says it is safe.', ['കാവൽക്കാരനോ സിവിൽ ഡിഫൻസോ സുരക്ഷിതമെന്ന് പറയുന്നതുവരെ തിരികെ കയറരുത്.', 'गार्ड वा नागरिक सुरक्षाले सुरक्षित भनेपछि मात्र भित्र फर्कनुहोस्।', 'গার্ড বা সিভিল ডিফেন্স নিরাপদ বলার আগে ভেতরে ফিরবেন না।', 'گارڈ یا سول ڈیفنس کے محفوظ کہنے تک واپس اندر نہ جائیں۔', 'गार्ड या सिविल डिफेंस के सुरक्षित कहने तक वापस अंदर न जाएँ।', 'Huwag bumalik sa loob hangga\'t hindi sinasabi ng guwardiya o Civil Defence na ligtas.']);
  p('i.clear.gas', 'لا تعد إلا بعد أن يُعلن أن المكان آمن، وأبقِ النوافذ مفتوحة.', 'Go back only when you are told it is safe. Keep windows open.', ['സുരക്ഷിതമെന്ന് അറിയിച്ചാൽ മാത്രം തിരികെ പോകുക. ജനലുകൾ തുറന്നിടുക.', 'सुरक्षित भनेपछि मात्र फर्कनुहोस्। झ्याल खुला राख्नुहोस्।', 'নিরাপদ বলা হলে তবেই ফিরুন। জানালা খোলা রাখুন।', 'محفوظ کہا جائے تب ہی واپس جائیں۔ کھڑکیاں کھلی رکھیں۔', 'सुरक्षित कहा जाए तभी लौटें। खिड़कियाँ खुली रखें।', 'Bumalik lang kapag sinabing ligtas na. Panatilihing bukas ang mga bintana.']);
  p('i.clear.flood', 'ابتعد عن الطرق والأنفاق المغمورة حتى يُعاد فتحها.', 'Keep away from flooded roads and underpasses until they reopen.', ['വെള്ളം കയറിയ റോഡുകളിൽനിന്നും അണ്ടർപാസുകളിൽനിന്നും വീണ്ടും തുറക്കുംവരെ അകന്നുനിൽക്കുക.', 'बाढी आएका सडक र अन्डरपास फेरि नखुलेसम्म टाढा रहनुहोस्।', 'বন্যার পানিতে ডোবা রাস্তা ও আন্ডারপাস আবার খোলা না হওয়া পর্যন্ত দূরে থাকুন।', 'سیلاب زدہ سڑکوں اور انڈر پاس کے دوبارہ کھلنے تک ان سے دور رہیں۔', 'बाढ़ वाली सड़कों और अंडरपास से तब तक दूर रहें जब तक वे दोबारा न खुलें।', 'Lumayo sa binahang kalsada at underpass hanggang muling buksan ang mga ito.']);
  p('i.clear.heat', 'واصل شرب الماء، ولا تستأنف العمل إلا بتوجيه من المشرف.', 'Keep drinking water. Restart work only when your supervisor says so.', ['വെള്ളം കുടിക്കുന്നത് തുടരുക. സൂപ്പർവൈസർ പറഞ്ഞാൽ മാത്രം ജോലി തുടങ്ങുക.', 'पानी पिइरहनुहोस्। सुपरभाइजरले भनेपछि मात्र काम सुरु गर्नुहोस्।', 'পানি পান করতে থাকুন। সুপারভাইজার বললে তবেই কাজ শুরু করুন।', 'پانی پیتے رہیں۔ سپروائزر کے کہنے پر ہی کام دوبارہ شروع کریں۔', 'पानी पीते रहें। सुपरवाइज़र के कहने पर ही काम फिर शुरू करें।', 'Patuloy na uminom ng tubig. Magsimula lang ulit kapag sinabi ng supervisor.']);
  p('i.clear.sos', 'يوجد من يعتني بك الآن.', 'Someone is looking after you now.', ['ഇപ്പോൾ ആരോ നിങ്ങളെ പരിചരിക്കുന്നുണ്ട്.', 'अहिले कसैले तपाईंको हेरचाह गरिरहेका छन्।', 'এখন কেউ আপনার যত্ন নিচ্ছে।', 'اب کوئی آپ کی دیکھ بھال کر رہا ہے۔', 'अब कोई आपकी देखभाल कर रहा है।', 'May nag-aalaga na sa iyo ngayon.']);

  /* ---------- 5.11 child lines (simple words) ---------- */
  p('i.child.follow', 'اتبع معلّمك أو أحد الكبار.', 'Follow your teacher or a grown-up.', ['നിങ്ങളുടെ ടീച്ചറെയോ മുതിർന്ന ഒരാളെയോ പിന്തുടരുക.', 'आफ्ना शिक्षक वा कुनै ठूलो मान्छे पछ्याउनुहोस्।', 'শিক্ষক বা কোনো বড়দের অনুসরণ করুন।', 'اپنے استاد یا کسی بڑے کے ساتھ چلیں۔', 'अपने शिक्षक या किसी बड़े के साथ चलें।', 'Sundan ang iyong guro o isang nakatatanda.']);
  p('i.child.meet', 'اذهب معهم إلى مكان التجمع.', 'Go to the meeting place with them.', ['അവരോടൊപ്പം ഒത്തുചേരൽ സ്ഥലത്തേക്ക് പോകുക.', 'उनीहरूसँगै भेट हुने ठाउँमा जानुहोस्।', 'তাদের সঙ্গে জমায়েতের জায়গায় যান।', 'ان کے ساتھ جمع ہونے کی جگہ پر جائیں۔', 'उनके साथ मिलने की जगह पर जाएँ।', 'Sumama sa kanila sa tagpuan.']);
  p('i.child.stay_in', 'ابقَ في الداخل مع معلّمك.', 'Stay inside with your teacher.', ['ടീച്ചറോടൊപ്പം അകത്തുതന്നെ നിൽക്കുക.', 'शिक्षकसँगै भित्रै बस्नुहोस्।', 'শিক্ষকের সঙ্গে ভেতরেই থাকুন।', 'استاد کے ساتھ اندر ہی رہیں۔', 'शिक्षक के साथ अंदर ही रहें।', 'Manatili sa loob kasama ang guro.']);
  p('i.child.no_touch', 'لا تلمس المفاتيح.', 'Do not touch the switches.', ['സ്വിച്ചുകളിൽ തൊടരുത്.', 'स्विचमा नछुनुहोस्।', 'সুইচ ছোঁবেন না।', 'سوئچ کو ہاتھ نہ لگائیں۔', 'स्विच को न छुएँ।', 'Huwag humawak ng switch.']);
  p('i.child.no_water', 'لا تلمس الماء.', 'Do not touch the water.', ['വെള്ളത്തിൽ തൊടരുത്.', 'पानीमा नछुनुहोस्।', 'পানি ছোঁবেন না।', 'پانی کو ہاتھ نہ لگائیں۔', 'पानी को न छुएँ।', 'Huwag hawakan ang tubig.']);
  p('i.child.close_win', 'أغلق النوافذ مع معلّمك.', 'Close the windows with your teacher.', ['ടീച്ചറോടൊപ്പം ജനലുകൾ അടയ്ക്കുക.', 'शिक्षकसँग झ्याल बन्द गर्नुहोस्।', 'শিক্ষকের সঙ্গে জানালা বন্ধ করুন।', 'استاد کے ساتھ کھڑکیاں بند کریں۔', 'शिक्षक के साथ खिड़कियाँ बंद करें।', 'Isara ang mga bintana kasama ang guro.']);
  p('i.child.listen', 'اسمع كلام معلّمك. لا شيء تفعله الآن.', 'Listen to your teacher. Nothing to do yet.', ['ടീച്ചർ പറയുന്നത് കേൾക്കുക. ഇപ്പോൾ ഒന്നും ചെയ്യേണ്ടതില്ല.', 'शिक्षकको कुरा सुन्नुहोस्। अहिले केही गर्नुपर्दैन।', 'শিক্ষকের কথা শুনুন। এখন কিছু করতে হবে না।', 'استاد کی بات سنیں۔ ابھی کچھ نہیں کرنا۔', 'शिक्षक की बात सुनें। अभी कुछ करना नहीं है।', 'Making sa iyong guro. Wala ka pang gagawin.']);
  p('i.child.stay_teacher', 'ابقَ مع معلّمك.', 'Stay with your teacher.', ['ടീച്ചറോടൊപ്പം തുടരുക.', 'शिक्षकसँगै रहनुहोस्।', 'শিক্ষকের সঙ্গেই থাকুন।', 'استاد کے ساتھ رہیں۔', 'शिक्षक के साथ रहें।', 'Manatili kasama ang guro.']);

  /* ---------- 5.12 guard / operator lines (operator-facing: ar + en) ---------- */
  p('i.guard.watch.exits', 'تأكّد أن كل المخارج غير مقفلة وخالية من العوائق.', 'Check that every exit is unlocked and clear.');
  p('i.guard.ready_list', 'جهّز قائمة السكان للعدّ.', 'Get the resident list ready for a head-count.');
  p('i.guard.fire.knock', 'اطرق الغرف في القائمة، ابتداءً بمن يحتاج مساعدة أكثر.', 'Knock on the rooms on the list, those who need most help first.');
  p('i.guard.fire.exits', 'تأكّد أن المخارج غير مقفلة، خصوصًا باب السطح.', 'Make sure the exits are unlocked, especially the roof door.');
  p('i.guard.count', 'اجمع الناس عند نقطة التجمع وسلّم الدفاع المدني قائمة غير المُحصَين.', 'Gather people at the assembly point and give Civil Defence the list of people not counted.');
  p('i.guard.smoke.close', 'أغلق مداخل المبنى ونوافذ الردهة.', 'Close the building entrances and lobby windows.');
  p('i.guard.check_vuln', 'تفقّد أولًا من يعانون من الربو أو أمراض القلب أو الرئة.', 'Check first on residents with asthma or heart or lung conditions.');
  p('i.guard.gas.keep', 'أبعِد الجميع عن مصدر التسرّب بعرض اتجاه الريح أو عكسه.', 'Move everyone away from the leak, across the wind or into the wind.');
  p('i.guard.gas.nosource', 'لا مفاتيح ولا لهب ولا محركات تعمل قرب المصدر.', 'No switches, flames or running engines near the source.');
  p('i.guard.gas.inside', 'أبقِ السكان في الداخل ونوافذهم مغلقة.', 'Keep residents inside with windows closed.');
  p('i.guard.flood.up', 'انقل السكان إلى الطوابق العليا، بعيدًا عن المداخل المنخفضة.', 'Move residents to the upper floors, away from low entrances.');
  p('i.guard.flood.block', 'امنع أي شخص من التوجه إلى النفق.', 'Stop anyone heading to the underpass.');
  p('i.guard.flood.stay', 'أبقِ السكان في الطوابق العليا ولا تسمح بالنزول إلى الشارع.', 'Keep residents on the upper floors; no one goes down to the street.');
  p('i.guard.dust.close', 'أغلق الأبواب والنوافذ الرئيسية وأبقِ المدخل مغلقًا.', 'Close the main doors and windows and keep the entrance shut.');
  p('i.guard.dust.workers', 'أدخِل العاملين في الخارج وأوقف أعمالهم.', 'Bring outdoor workers inside and stop their work.');
  p('i.guard.heat.move', 'انقل العمال إلى مكان التبريد وأوقف العمل في الشمس.', 'Move workers to the cool shelter and stop work in the sun.');
  p('i.guard.heat.watch', 'راقب علامات ضربة الشمس: حرارة شديدة أو ارتباك أو إغماء.', 'Watch for heat-stroke signs: very hot skin, confusion, fainting.', null, { src: ['S54'], review: 'medical' });
  p('i.guard.heat.count', 'أحصِ من وصل إلى مكان التبريد.', 'Count who reached the cool shelter.');
  p('i.guard.heat.breaks', 'أوقف الأعمال الشاقة وأعطِ العمال استراحات في الظل.', 'Pause heavy tasks and give workers breaks in the shade.');
  p('i.guard.heat.water', 'وفّر ماء الشرب للجميع.', 'Make drinking water available to everyone.');
  p('i.guard.heat.rule', 'في قطر يجب إيقاف العمل إذا تجاوز مؤشر WBGT القيمة 32.1 °م (وزارة العمل، عبر منظمة العمل الدولية).', 'In Qatar all work must stop if WBGT goes above 32.1 °C (Ministry of Labour, via ILO).', null, { src: ['S19'] });
  p('i.guard.sos.go', 'اذهب إلى الغرفة {room} ومعك حقيبة الإسعافات.', 'Go to room {room} with the first-aid kit.', null, { alt: 'i.guard.sos.go_any' });
  p('i.guard.sos.go_any', 'اذهب إلى مكان الشخص ومعك حقيبة الإسعافات.', 'Go to the person with the first-aid kit.');
  p('i.guard.sos.door', 'افتح الباب الرئيسي وأبقِ الممر خاليًا للإسعاف.', 'Open the main door and keep the way clear for the ambulance.');
  p('i.guard.sos.meet', 'استقبل الإسعاف عند البوابة وأرشده إلى الغرفة.', 'Meet the ambulance at the gate and lead it to the room.');
  p('i.guard.clear.count', 'أجرِ العدّ الأخير وأبلغ الدفاع المدني بالنتيجة.', 'Do the final head-count and tell Civil Defence the result.');

  /* ---------- 5.13 spoken extras for the blind persona (voice only; ar + en) ---------- */
  p('v.blind.turn', 'سأرشدك: انعطف {turn}، {steps} إلى {exit}. أبقِ يدك على الدرابزين.', 'I will guide you: turn {turn}, {steps} to {exit}. Keep a hand on the rail.', null, { alt: 'v.blind.guide_rail' });
  p('v.blind.guide_rail', 'سأخبرك بكل منعطف: يمينًا أو يسارًا أو إلى الأمام. أبقِ يدك على الدرابزين.', 'I will tell you each turn: left, right or straight on. Keep a hand on the rail.');
  p('v.blind.guide', 'سأخبرك بكل منعطف: يمينًا أو يسارًا أو إلى الأمام.', 'I will tell you each turn: left, right or straight on.');
  p('v.blind.lr', 'سأقول لك يمينًا أو يسارًا.', 'I will say left or right.');
  p('v.blind.flood', 'المياه ترتفع في الخارج. لا تتجه إلى النفق. سأرشدك.', 'Water is rising outside. Do not walk toward the underpass. I will guide you.');
  p('v.blind.outside', 'إن كنت في الخارج سأرشدك إلى أقرب باب.', 'If you are outside, I will guide you to the nearest door.');
  p('v.blind.cool', 'سأرشدك إلى مكان التبريد.', 'I will guide you to the cool shelter.');
  p('v.blind.door', 'سأخبرك عند وصولهم إلى الباب.', 'I will tell you when they are at the door.');

  /* ====================================================================================
   * 6. THE PLAYBOOK — hazard × level (the default adult message) + persona overrides
   *    cell = { h: headline id, i: [1–3 instruction ids], more: [0–4 detail ids], pics: [pictogram ids in reading order],
   *             voice: [extra spoken phrase ids], vib, flash, wake: 'none'|'soft'|'ladder', tone }
   *    A persona without an entry uses the base cell. Level defaults (vib, flash, tone) are filled in by the engine.
   *    Persona format and strobe rules (Deaf: vibration + text + opt-in strobe; blind: voice + haptics; asleep: wake ladder) are applied by the engine.
   * ==================================================================================== */
  var LEVEL_DEFAULT = {
    watch:       { vib: 'soft',   flash: 'steady-info',  tone: 'info' },
    warning:     { vib: 'warn',   flash: 'steady-amber', tone: 'warn' },
    evacuate:    { vib: 'evac',   flash: 'steady-red',   tone: 'danger' },
    'all-clear': { vib: 'clear',  flash: 'steady-green', tone: 'safe' }
  };
  var PLAY = {};
  function play(hz, lv, base, by) { (PLAY[hz] = PLAY[hz] || {})[lv] = { base: base, by: by || {} }; }

  /* ---------- FIRE ---------- */
  play('fire', 'watch',
    { h: 'h.fire.watch', i: ['i.keep_phone', 'i.know_exit'], pics: ['hz-fire', 'st-info', 'act-phone'], wake: 'none' },
    { guard: { i: ['i.guard.watch.exits', 'i.keep_phone'], pics: ['hz-fire', 'act-exit', 'st-info'] },
      wheelchair: { i: ['i.keep_phone', 'i.fire.know_refuge'], pics: ['hz-fire', 'act-refuge', 'act-phone'] },
      child: { i: ['i.child.listen'], pics: ['hz-fire', 'act-teacher', 'st-info'] } });
  play('fire', 'warning',
    { h: 'h.fire.warning', i: ['i.fire.shut_win', 'i.fire.ac_off', 'i.fire.ready'], more: ['i.keep_phone'], pics: ['hz-fire', 'act-close-window', 'act-ac-off', 'act-inside'], wake: 'soft' },
    { guard: { h: 'h.guard.fire.warning', i: ['i.guard.fire.exits', 'i.fire.ac_off', 'i.guard.ready_list'], pics: ['hz-fire', 'act-exit', 'act-ac-off', 'act-count'] },
      wheelchair: { i: ['i.fire.shut_win', 'i.fire.ac_off', 'i.fire.know_refuge'], pics: ['hz-fire', 'act-close-window', 'act-refuge', 'act-inside'] },
      child: { i: ['i.child.stay_in', 'i.child.close_win'], more: [], pics: ['hz-fire', 'act-teacher', 'act-inside', 'act-close-window'] } });
  play('fire', 'evacuate',
    { h: 'h.fire.evacuate', i: ['i.fire.exit', 'i.fire.stairs', 'i.fire.low'], more: ['i.fire.close_doors', 'i.fire.never_back', 'i.call999_out', 'i.count.tap'], pics: ['hz-fire', 'act-exit', 'act-stairs', 'act-no-lift', 'act-low'], wake: 'ladder' },
    { blind: { voice: ['v.blind.turn'] },
      wheelchair: { i: ['i.fire.no_stairs', 'i.fire.refuge', 'i.fire.loc_sent'], more: ['i.fire.close_doors', 'i.count.tap'], pics: ['hz-fire', 'act-no-stairs', 'act-no-lift', 'act-refuge', 'act-help-coming'] },
      elderly: { i: ['i.fire.exit', 'i.fire.stairs', 'i.fire.elder.rail'], more: ['i.fire.elder.help', 'i.fire.low', 'i.fire.close_doors', 'i.call999_out'], pics: ['hz-fire', 'act-exit', 'act-handrail', 'act-stairs', 'act-no-lift'] },
      child: { h: 'h.child.fire', i: ['i.child.follow', 'i.walk', 'i.child.meet'], more: [], pics: ['hz-fire', 'act-teacher', 'act-walk', 'act-assembly'] },
      worker: { h: 'h.w.fire', i: ['i.fire.exit', 'i.fire.stairs'], pics: ['hz-fire', 'act-exit', 'act-stairs', 'act-no-lift', 'act-low'] },
      guard: { h: 'h.guard.fire.evacuate', i: ['i.guard.fire.knock', 'i.guard.fire.exits', 'i.guard.count'], more: ['i.call999_out'], pics: ['hz-fire', 'act-knock', 'act-exit', 'act-count'] } });
  play('fire', 'all-clear',
    { h: 'h.fire.clear', i: ['i.clear.over', 'i.clear.fire'], pics: ['st-clear'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.fire'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- SMOKE-SHELTER ---------- */
  play('smoke', 'watch',
    { h: 'h.smoke.watch', i: ['i.smoke.prepare', 'i.keep_phone'], pics: ['hz-smoke', 'st-info', 'act-close-window'], wake: 'none' },
    { guard: { i: ['i.guard.watch.exits', 'i.guard.check_vuln'], pics: ['hz-smoke', 'act-exit', 'st-info'] },
      child: { i: ['i.child.listen'], pics: ['hz-smoke', 'act-teacher', 'st-info'] } });
  play('smoke', 'warning',
    { h: 'h.smoke.warning', i: ['i.fire.shut_win', 'i.fire.ac_off', 'i.air.asthma'], more: ['i.keep_phone'], pics: ['hz-smoke', 'act-close-window', 'act-ac-off', 'act-medicine'], wake: 'soft' },
    { guard: { h: 'h.guard.smoke.warning', i: ['i.guard.smoke.close', 'i.fire.ac_off', 'i.guard.check_vuln'], pics: ['hz-smoke', 'act-close-window', 'act-ac-off', 'act-count'] },
      child: { h: 'h.child.smoke', i: ['i.child.stay_in', 'i.child.close_win'], more: [], pics: ['hz-smoke', 'act-teacher', 'act-inside', 'act-close-window'] },
      worker: { i: ['i.fire.shut_win', 'i.air.asthma'] } });
  play('smoke', 'evacuate',
    { h: 'h.smoke.evacuate', i: ['i.fire.exit', 'i.fire.low', 'i.smoke.fresh_air'], more: ['i.fire.stairs', 'i.fire.close_doors', 'i.call999_out', 'i.count.tap'], pics: ['hz-smoke', 'act-exit', 'act-low', 'act-cover-face', 'act-fresh-air'], wake: 'ladder' },
    { blind: { voice: ['v.blind.turn'] },
      wheelchair: { i: ['i.fire.no_stairs', 'i.fire.refuge', 'i.fire.loc_sent'], more: ['i.fire.close_doors', 'i.count.tap'], pics: ['hz-smoke', 'act-no-stairs', 'act-refuge', 'act-help-coming'] },
      elderly: { i: ['i.fire.exit', 'i.fire.elder.rail', 'i.fire.low'], more: ['i.fire.elder.help', 'i.fire.stairs', 'i.call999_out'], pics: ['hz-smoke', 'act-exit', 'act-handrail', 'act-low'] },
      child: { h: 'h.child.smoke_out', i: ['i.child.follow', 'i.walk', 'i.child.meet'], more: [], pics: ['hz-smoke', 'act-teacher', 'act-walk', 'act-assembly'] },
      worker: { h: 'h.w.smoke', i: ['i.fire.exit', 'i.fire.low'], pics: ['hz-smoke', 'act-exit', 'act-low', 'act-fresh-air'] },
      guard: { h: 'h.guard.fire.evacuate', i: ['i.guard.fire.knock', 'i.guard.fire.exits', 'i.guard.count'], more: ['i.call999_out'], pics: ['hz-smoke', 'act-knock', 'act-exit', 'act-count'] } });
  play('smoke', 'all-clear',
    { h: 'h.smoke.clear', i: ['i.clear.air', 'i.clear.over'], pics: ['st-clear', 'act-open-window'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.air'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- GAS (default = LPG; variants co / h2s below) ---------- */
  play('gas', 'watch',
    { h: 'h.gas.watch', i: ['i.keep_phone', 'i.gas.no_flame'], pics: ['hz-gas', 'st-info', 'act-no-flame'], wake: 'none' },
    { guard: { i: ['i.guard.watch.exits', 'i.gas.no_flame'], pics: ['hz-gas', 'act-exit', 'act-no-flame'] },
      child: { i: ['i.child.listen'], pics: ['hz-gas', 'act-teacher', 'st-info'] } });
  play('gas', 'warning',
    { h: 'h.gas.warning', i: ['i.gas.stay', 'i.gas.no_switch', 'i.gas.ready'], more: ['i.gas.smell', 'i.keep_phone'], pics: ['hz-gas', 'act-inside', 'act-close-window', 'act-no-switch', 'act-no-flame'], wake: 'soft' },
    { guard: { h: 'h.guard.gas.warning', i: ['i.guard.gas.inside', 'i.gas.no_switch', 'i.guard.ready_list'], pics: ['hz-gas', 'act-inside', 'act-no-switch', 'act-count'] },
      child: { i: ['i.child.stay_in', 'i.child.no_touch'], more: [], pics: ['hz-gas', 'act-teacher', 'act-inside', 'act-no-switch'] } });
  play('gas', 'evacuate',
    { h: 'h.gas.evacuate', i: ['i.gas.no_switch', 'i.gas.crosswind', 'i.gas.low'], more: ['i.gas.open', 'i.gas.no_phone', 'i.gas.smell', 'i.count.tap'], pics: ['hz-gas', 'act-no-switch', 'act-no-flame', 'act-wind-cross', 'act-no-low-ground'], wake: 'ladder' },
    { deaf: { i: ['i.gas.no_switch', 'i.gas.crosswind_arrow', 'i.gas.low'] },
      blind: { voice: ['v.blind.lr'] },
      wheelchair: { i: ['i.gas.no_switch', 'i.gas.wheel_open', 'i.help_room'], more: ['i.gas.wheel_route', 'i.call999_out', 'i.count.tap'], pics: ['hz-gas', 'act-no-switch', 'act-open-window', 'act-help-coming'] },
      elderly: { i: ['i.gas.no_switch', 'i.gas.crosswind', 'i.fire.elder.help'], more: ['i.gas.low', 'i.gas.no_phone', 'i.count.tap'] },
      child: { h: 'h.child.gas', i: ['i.child.no_touch', 'i.child.follow', 'i.walk'], more: [], pics: ['hz-gas', 'act-no-switch', 'act-teacher', 'act-walk'] },
      worker: { h: 'h.w.gas', i: ['i.gas.no_switch', 'i.gas.crosswind'], more: ['i.gas.low', 'i.gas.no_phone', 'i.gas.smell', 'i.count.tap'] },
      guard: { h: 'h.guard.gas.evacuate', i: ['i.guard.gas.keep', 'i.guard.gas.nosource', 'i.guard.count'], more: ['i.gas.no_phone', 'i.gas.open'], pics: ['hz-gas', 'act-wind-cross', 'act-no-switch', 'act-count'] } });
  play('gas', 'all-clear',
    { h: 'h.gas.clear', i: ['i.clear.over', 'i.clear.gas'], pics: ['st-clear', 'act-open-window'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.gas'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- FLOOD (variant driver below) ---------- */
  play('flood', 'watch',
    { h: 'h.flood.watch', i: ['i.flood.underpass', 'i.flood.electric', 'i.keep_phone'], pics: ['hz-water', 'st-info', 'act-no-underpass'], wake: 'none' },
    { guard: { i: ['i.guard.watch.exits', 'i.flood.underpass'], pics: ['hz-water', 'act-exit', 'act-no-underpass'] },
      child: { i: ['i.child.listen'], pics: ['hz-water', 'act-teacher', 'st-info'] } });
  play('flood', 'warning',
    { h: 'h.flood.warning', i: ['i.flood.stay_up', 'i.flood.ground_up', 'i.flood.through'], more: ['i.flood.underpass', 'i.flood.puddle', 'i.flood.electric', 'i.flood.numbers'], pics: ['hz-water', 'act-stay-upstairs', 'act-no-underpass', 'act-no-wade'], wake: 'soft' },
    { blind: { voice: ['v.blind.flood'] },
      wheelchair: { i: ['i.flood.stay_up_w', 'i.help_room', 'i.flood.reach_call'], pics: ['hz-water', 'act-stay-upstairs', 'act-help-coming'] },
      child: { h: 'h.child.flood', i: ['i.child.stay_in', 'i.child.no_water'], more: [], pics: ['hz-water', 'act-teacher', 'act-inside', 'act-no-wade'] },
      worker: { h: 'h.w.flood', i: ['i.flood.stay_up', 'i.flood.ground_up'] },
      guard: { h: 'h.guard.flood.warning', i: ['i.guard.flood.stay', 'i.guard.flood.block', 'i.guard.ready_list'], pics: ['hz-water', 'act-stay-upstairs', 'act-no-underpass', 'act-count'] } });
  play('flood', 'evacuate',
    { h: 'h.flood.evacuate', i: ['i.flood.up', 'i.flood.underpass', 'i.flood.through'], more: ['i.flood.puddle', 'i.flood.electric', 'i.flood.numbers', 'i.count.tap'], pics: ['hz-water', 'act-up', 'act-high-ground', 'act-no-underpass', 'act-no-wade'], wake: 'ladder' },
    { blind: { voice: ['v.blind.flood'] },
      wheelchair: { i: ['i.flood.stay_up_w', 'i.help_room', 'i.flood.reach_call'], more: ['i.flood.numbers', 'i.count.tap'], pics: ['hz-water', 'act-stay-upstairs', 'act-help-coming'] },
      elderly: { i: ['i.flood.up', 'i.fire.elder.help', 'i.flood.through'], more: ['i.flood.underpass', 'i.flood.numbers', 'i.count.tap'] },
      child: { h: 'h.child.flood', i: ['i.child.stay_in', 'i.child.no_water'], more: [], pics: ['hz-water', 'act-teacher', 'act-inside', 'act-no-wade'] },
      worker: { h: 'h.w.flood', i: ['i.flood.up', 'i.flood.underpass'], pics: ['hz-water', 'act-up', 'act-no-underpass', 'act-no-wade'] },
      guard: { h: 'h.guard.flood.evacuate', i: ['i.guard.flood.up', 'i.guard.flood.block', 'i.guard.count'], more: ['i.flood.numbers'], pics: ['hz-water', 'act-up', 'act-no-underpass', 'act-count'] } });
  play('flood', 'all-clear',
    { h: 'h.flood.clear', i: ['i.clear.over', 'i.clear.flood'], pics: ['st-clear', 'act-no-underpass'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.flood'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- DUST ---------- */
  play('dust', 'watch',
    { h: 'h.dust.watch', i: ['i.dust.eta', 'i.dust.prepare'], more: ['i.keep_phone'], pics: ['hz-dust', 'st-info', 'act-inside'], wake: 'none' },
    { guard: { i: ['i.guard.dust.workers', 'i.guard.check_vuln'], pics: ['hz-dust', 'act-stop-work', 'act-medicine'] },
      child: { i: ['i.child.listen'], pics: ['hz-dust', 'act-teacher', 'st-info'] } });
  play('dust', 'warning',
    { h: 'h.dust.warning', i: ['i.dust.stay', 'i.dust.stop', 'i.air.asthma'], more: ['i.dust.mask'], pics: ['hz-dust', 'act-inside', 'act-close-window', 'act-stop-work', 'act-mask'], wake: 'none' },
    { blind: { voice: ['v.blind.outside'] },
      wheelchair: { i: ['i.dust.stay', 'i.dust.meds_near'], more: ['i.air.asthma', 'i.dust.mask'] },
      elderly: { i: ['i.dust.stay', 'i.dust.meds_near'], more: ['i.air.asthma', 'i.dust.mask'] },
      child: { h: 'h.child.dust', i: ['i.child.stay_in', 'i.child.close_win'], more: [], pics: ['hz-dust', 'act-teacher', 'act-inside', 'act-close-window'] },
      worker: { h: 'h.w.dust', i: ['i.dust.inside', 'i.dust.mask'], more: ['i.dust.stop', 'i.air.asthma'], pics: ['hz-dust', 'act-stop-work', 'act-inside', 'act-mask'] },
      guard: { h: 'h.guard.dust', i: ['i.guard.dust.close', 'i.guard.check_vuln', 'i.guard.dust.workers'], pics: ['hz-dust', 'act-close-window', 'act-medicine', 'act-stop-work'] } });
  play('dust', 'evacuate',
    { h: 'h.dust.evacuate', i: ['i.dust.inside', 'i.dust.mask', 'i.air.asthma'], more: ['i.dust.stop', 'i.count.tap'], pics: ['hz-dust', 'act-inside', 'act-close-window', 'act-mask', 'act-stop-work'], wake: 'soft' },
    { blind: { voice: ['v.blind.outside'] },
      wheelchair: { i: ['i.dust.stay', 'i.dust.meds_near'], more: ['i.air.asthma', 'i.dust.mask', 'i.count.tap'] },
      elderly: { i: ['i.dust.stay', 'i.dust.meds_near'], more: ['i.air.asthma', 'i.dust.mask', 'i.count.tap'] },
      child: { h: 'h.child.dust', i: ['i.child.stay_in', 'i.child.close_win'], more: [], pics: ['hz-dust', 'act-teacher', 'act-inside', 'act-close-window'] },
      worker: { h: 'h.w.dust', i: ['i.dust.inside', 'i.dust.mask'], more: ['i.dust.stop', 'i.air.asthma', 'i.count.tap'], pics: ['hz-dust', 'act-stop-work', 'act-inside', 'act-mask'] },
      guard: { h: 'h.guard.dust', i: ['i.guard.dust.close', 'i.guard.check_vuln', 'i.guard.dust.workers'], pics: ['hz-dust', 'act-close-window', 'act-medicine', 'act-stop-work'] } });
  play('dust', 'all-clear',
    { h: 'h.dust.clear', i: ['i.clear.over', 'i.clear.air'], pics: ['st-clear', 'act-open-window'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.air'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- HEAT (daytime hazard: no wake-up ladder; the worker who stops answering becomes an SOS) ---------- */
  play('heat', 'watch',
    { h: 'h.heat.watch', i: ['i.heat.water', 'i.heat.rest_shade', 'i.keep_phone'], pics: ['hz-heat', 'act-drink', 'act-shade'], wake: 'none' },
    { guard: { i: ['i.guard.heat.water', 'i.guard.heat.watch'], pics: ['hz-heat', 'act-drink', 'act-shade'] },
      child: { i: ['i.heat.water', 'i.heat.rest_shade'], pics: ['hz-heat', 'act-drink', 'act-teacher'] } });
  play('heat', 'warning',
    { h: 'h.heat.warning', i: ['i.heat.shade', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs'], pics: ['hz-heat', 'act-shade', 'act-drink', 'act-rest'], wake: 'none' },
    { blind: { voice: ['v.blind.cool'] },
      wheelchair: { i: ['i.heat.cool_room', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs'], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-rest'] },
      elderly: { i: ['i.heat.cool_room', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs'], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-rest'] },
      child: { h: 'h.child.heat', i: ['i.heat.classroom', 'i.heat.water', 'i.child.follow'], more: [], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-teacher'] },
      worker: { i: ['i.heat.shade', 'i.heat.water'], pics: ['hz-heat', 'act-shade', 'act-drink', 'act-rest'] },
      guard: { h: 'h.guard.heat.warning', i: ['i.guard.heat.breaks', 'i.guard.heat.water', 'i.guard.heat.watch'], more: ['i.guard.heat.rule'], pics: ['hz-heat', 'act-rest', 'act-drink', 'act-count'] } });
  play('heat', 'evacuate',
    { h: 'h.heat.evacuate', i: ['i.heat.shelter', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs', 'i.heat.rest', 'i.heat.auto_sos', 'i.heat.shelter_tap'], pics: ['hz-heat', 'act-stop-work', 'act-shade', 'act-drink'], wake: 'none' },
    { blind: { voice: ['v.blind.cool'] },
      wheelchair: { i: ['i.heat.cool_room', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs', 'i.count.tap'], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-rest'] },
      elderly: { i: ['i.heat.cool_room', 'i.heat.water', 'i.heat.tell'], more: ['i.heat.signs', 'i.count.tap'], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-rest'] },
      child: { h: 'h.child.heat', i: ['i.heat.classroom', 'i.heat.water', 'i.child.follow'], more: [], pics: ['hz-heat', 'act-inside', 'act-drink', 'act-teacher'] },
      worker: { h: 'h.w.heat', i: ['i.heat.stop', 'i.heat.shelter', 'i.heat.water'], pics: ['hz-heat', 'act-stop-work', 'act-shade', 'act-drink'] },
      guard: { h: 'h.guard.heat.evacuate', i: ['i.guard.heat.move', 'i.guard.heat.watch', 'i.guard.heat.count'], more: ['i.guard.heat.rule', 'i.heat.signs'], pics: ['hz-heat', 'act-stop-work', 'act-shade', 'act-count'] } });
  play('heat', 'all-clear',
    { h: 'h.heat.clear', i: ['i.clear.over', 'i.clear.heat'], pics: ['st-clear', 'act-drink'], wake: 'none' },
    { guard: { h: 'h.guard.clear', i: ['i.guard.clear.count', 'i.clear.heat'], pics: ['st-clear', 'act-count'] },
      child: { i: ['i.child.stay_teacher', 'i.clear.over'], pics: ['st-clear', 'act-teacher'] } });

  /* ---------- SOS (the person who needs help; volunteer and guard are the helpers) ---------- */
  play('sos', 'watch',
    { h: 'h.sos.watch', i: ['i.sos.checkin', 'i.sos.silent'], pics: ['hz-sos', 'act-check-in', 'act-phone'], wake: 'soft', tone: 'info' },
    { guard: { h: 'h.vol.watch', i: ['i.sos.vol.standby', 'i.guard.ready_list'], pics: ['hz-sos', 'st-wait', 'act-phone'] },
      volunteer: { h: 'h.vol.watch', i: ['i.sos.vol.standby', 'i.sos.vol.safe'], pics: ['hz-sos', 'st-wait', 'act-phone'] } });
  play('sos', 'warning',
    { h: 'h.sos.warning', i: ['i.sos.checkin', 'i.sos.stay', 'i.sos.unlock'], pics: ['hz-sos', 'act-check-in', 'act-stay-still', 'act-unlock-door'], wake: 'soft', tone: 'warn' },
    { child: { i: ['i.sos.checkin', 'i.sos.stay'], pics: ['hz-sos', 'act-check-in', 'act-stay-still'] },
      guard: { h: 'h.guard.sos', i: ['i.guard.sos.go', 'i.guard.sos.door', 'i.guard.sos.meet'], pics: ['hz-sos', 'act-help-coming', 'act-unlock-door', 'act-keep-clear'] },
      volunteer: { h: 'h.vol.warning', i: ['i.sos.vol.standby', 'i.sos.vol.safe'], pics: ['hz-sos', 'st-wait', 'act-aed'] } });
  play('sos', 'evacuate',
    { h: 'h.sos.evacuate', i: ['i.sos.coming_eta', 'i.sos.stay', 'i.sos.unlock'], more: ['i.sos.ambulance', 'i.keep_phone'], pics: ['hz-sos', 'act-help-coming', 'act-stay-still', 'act-unlock-door'], wake: 'soft', vib: 'calm', flash: 'steady-info', tone: 'info' },
    { blind: { voice: ['v.blind.door'] },
      wheelchair: { i: ['i.sos.coming_room', 'i.sos.stay', 'i.sos.unlock'] },
      child: { i: ['i.child.sos', 'i.sos.stay'], more: [], pics: ['hz-sos', 'act-teacher', 'act-stay-still'] },
      worker: { h: 'h.w.sos', i: ['i.sos.coming_eta', 'i.sos.stay'], pics: ['hz-sos', 'act-help-coming', 'act-stay-still'] },
      guard: { h: 'h.guard.sos', i: ['i.guard.sos.go', 'i.guard.sos.door', 'i.guard.sos.meet'], more: ['i.sos.recovery', 'i.sos.vol.call'], vib: 'evac', flash: 'steady-red', tone: 'danger', pics: ['hz-sos', 'act-help-coming', 'act-unlock-door', 'act-keep-clear'] },
      volunteer: { h: 'h.vol.evacuate', i: ['i.sos.vol.go', 'i.sos.vol.aed', 'i.sos.vol.call'], more: ['i.sos.recovery', 'i.sos.vol.safe'], vib: 'sos-call', flash: 'steady-red', tone: 'danger', pics: ['hz-sos', 'act-aed', 'act-call-999', 'act-recovery'] } });
  play('sos', 'all-clear',
    { h: 'h.sos.clear', i: ['i.clear.sos'], pics: ['st-clear', 'act-help-coming'], wake: 'none' },
    { guard: { h: 'h.vol.clear', i: ['i.vol.standdown'], pics: ['st-clear', 'act-help-coming'] },
      volunteer: { h: 'h.vol.clear', i: ['i.vol.standdown'], pics: ['st-clear', 'act-help-coming'] } });

  // variants: gas 'co' and 'h2s', flood 'driver'. A variant replaces the base cell for the "adult-like" personas
  // (adult, asleep, deaf, blind, elderly); wheelchair, child, worker and guard keep their own persona cell.
  var VARIANTS = {
    gas: {
      co: {
        warning:  { h: 'h.gas.co.warning', i: ['i.gas.co.air', 'i.gas.co.check', 'i.call999_out'], more: ['i.fire.never_back'], pics: ['hz-gas', 'act-fresh-air', 'act-exit', 'act-call-999'] },
        evacuate: { h: 'h.gas.co.evacuate', i: ['i.gas.co.air', 'i.gas.co.check', 'i.fire.never_back'], more: ['i.call999_out', 'i.count.tap'], pics: ['hz-gas', 'act-fresh-air', 'act-exit', 'act-call-999'] }
      },
      h2s: {
        warning:  { h: 'h.gas.h2s.warning', i: ['i.gas.stay', 'i.gas.smell', 'i.gas.ready'], more: ['i.gas.no_switch', 'i.keep_phone'], pics: ['hz-gas', 'act-inside', 'act-close-window', 'act-wind-cross'] },
        evacuate: { h: 'h.gas.h2s.evacuate', i: ['i.gas.crosswind', 'i.gas.low', 'i.gas.smell'], more: ['i.gas.no_switch', 'i.gas.no_phone', 'i.count.tap'], pics: ['hz-gas', 'act-wind-cross', 'act-no-low-ground', 'act-exit'] }
      }
    },
    flood: {
      driver: {
        warning:  { h: 'h.flood.driver', i: ['i.flood.no_drive', 'i.flood.underpass', 'i.flood.through'], more: ['i.flood.numbers'], pics: ['hz-water', 'act-no-drive-water', 'act-no-underpass'] },
        evacuate: { h: 'h.flood.driver', i: ['i.flood.no_drive', 'i.flood.underpass', 'i.flood.through'], more: ['i.flood.numbers'], pics: ['hz-water', 'act-no-drive-water', 'act-no-underpass'] }
      }
    }
  };
  var VARIANT_PERSONAS = { adult: 1, asleep: 1, deaf: 1, blind: 1, elderly: 1 };

  // sim.js action keys (docs/MANARA.md bus `action`) → playbook cell
  var ACTION_MAP = {
    'fire.exit':       { hazard: 'fire',  level: 'evacuate', persona: 'adult' },
    'fire.refuge':     { hazard: 'fire',  level: 'evacuate', persona: 'wheelchair' },
    'fire.shelter':    { hazard: 'fire',  level: 'warning',  persona: 'adult' },
    'fire.watch':      { hazard: 'fire',  level: 'watch',    persona: 'adult' },
    'gas.crosswind':   { hazard: 'gas',   level: 'evacuate', persona: 'adult' },
    'gas.shelter':     { hazard: 'gas',   level: 'warning',  persona: 'adult' },
    'gas.watch':       { hazard: 'gas',   level: 'watch',    persona: 'adult' },
    'flood.upstairs':  { hazard: 'flood', level: 'evacuate', persona: 'adult' },
    'flood.stay':      { hazard: 'flood', level: 'warning',  persona: 'adult' },
    'flood.watch':     { hazard: 'flood', level: 'watch',    persona: 'adult' },
    'dust.shelter':    { hazard: 'dust',  level: 'warning',  persona: 'adult' },
    'heat.stopwork':   { hazard: 'heat',  level: 'evacuate', persona: 'adult' },
    'heat.watch':      { hazard: 'heat',  level: 'watch',    persona: 'adult' },
    'sos.victim':      { hazard: 'sos',   level: 'evacuate', persona: 'adult' },
    'sos.volunteer':   { hazard: 'sos',   level: 'evacuate', persona: 'volunteer' },
    'smoke.shelter':   { hazard: 'smoke', level: 'warning',  persona: 'adult' }
  };

  /* ====================================================================================
   * 7. WAKE-UP LADDER (night): T+0 sound + vibration (+ strobe if opted in) · T+30 louder + light · T+60 the guard knocks · T+90 Civil Defence gets the list
   *    (the same four steps as sim.js; the step length is the assumption ladderStepSec, default 30 s). The ladder STOPS on "I'm awake".
   * ==================================================================================== */
  p('x.ladder.0.p', 'اضغط «أنا مستيقظ» لإيقاف التنبيه.', "Tap “I'm awake” to stop the alarm.", ['അലാറം നിർത്താൻ “ഞാൻ ഉണർന്നിരിക്കുന്നു” അമർത്തുക.', 'अलार्म रोक्न “म ब्यूँझिएको छु” थिच्नुहोस्।', 'অ্যালার্ম থামাতে “আমি জেগে আছি” চাপুন।', 'الارم بند کرنے کے لیے “میں جاگ گیا/گئی ہوں” دبائیں۔', 'अलार्म बंद करने के लिए “मैं जाग गया/गई हूँ” दबाएँ।', 'Pindutin ang “Gising na ako” para itigil ang alarma.']);
  p('x.ladder.1.t', 'لم نتلقَّ ردًّا — صوت أعلى وضوء', 'Still no answer — louder alarm and light', ['ഇതുവരെ മറുപടിയില്ല — ശബ്ദം കൂട്ടി, വെളിച്ചം', 'अझै जवाफ आएन — आवाज बढ्यो, उज्यालो', 'এখনও উত্তর নেই — আওয়াজ বাড়ছে, আলো', 'اب تک جواب نہیں — آواز تیز اور روشنی', 'अब तक जवाब नहीं — आवाज़ तेज़ और रोशनी', 'Wala pa ring sagot — mas malakas na alarma at ilaw']);
  p('x.ladder.1.p', 'اضغط «أنا مستيقظ» الآن، ثم اتبع الطريق.', "Tap “I'm awake” now. Then follow the route.", ['ഇപ്പോൾ “ഞാൻ ഉണർന്നിരിക്കുന്നു” അമർത്തുക. എന്നിട്ട് വഴി പിന്തുടരുക.', 'अहिले “म ब्यूँझिएको छु” थिच्नुहोस्। त्यसपछि बाटो पछ्याउनुहोस्।', 'এখনই “আমি জেগে আছি” চাপুন। তারপর পথ অনুসরণ করুন।', 'ابھی “میں جاگ گیا/گئی ہوں” دبائیں، پھر راستے پر چلیں۔', 'अभी “मैं जाग गया/गई हूँ” दबाएँ, फिर रास्ते पर चलें।', 'Pindutin ngayon ang “Gising na ako”. Pagkatapos ay sundan ang ruta.']);
  p('x.ladder.2.t', 'الحارس في الطريق إلى بابك', 'The guard is coming to your door', ['കാവൽക്കാരൻ നിങ്ങളുടെ വാതിലിനടുത്തേക്ക് വരുന്നു', 'गार्ड तपाईंको ढोकामा आउँदैछन्', 'গার্ড আপনার দরজায় আসছেন', 'گارڈ آپ کے دروازے پر آ رہا ہے', 'गार्ड आपके दरवाज़े पर आ रहे हैं', 'Papunta na ang guwardiya sa pinto mo']);
  p('x.ladder.2.p', 'افتح الباب إن استطعت، ثم اتبع الطريق.', 'Open the door if you can. Then follow the route.', ['കഴിയുമെങ്കിൽ വാതിൽ തുറക്കുക. എന്നിട്ട് വഴി പിന്തുടരുക.', 'सक्नुहुन्छ भने ढोका खोल्नुहोस्। त्यसपछि बाटो पछ्याउनुहोस्।', 'পারলে দরজা খুলুন। তারপর পথ অনুসরণ করুন।', 'ہو سکے تو دروازہ کھولیں، پھر راستے پر چلیں۔', 'हो सके तो दरवाज़ा खोलें, फिर रास्ते पर चलें।', 'Buksan ang pinto kung kaya mo. Pagkatapos ay sundan ang ruta.']);
  p('x.ladder.2.g', 'وصلتك قائمة الأولويات: اطرق هذه الغرف الآن، ابتداءً بمن يحتاج مساعدة أكثر.', 'Priority list sent to the guard desk: knock on these rooms now, those who need most help first.');
  p('x.ladder.3.t', 'الدفاع المدني لديه رقم غرفتك', 'Civil Defence has your room number', ['സിവിൽ ഡിഫൻസിന് നിങ്ങളുടെ മുറി നമ്പർ അറിയാം', 'नागरिक सुरक्षालाई तपाईंको कोठा नम्बर थाहा छ', 'সিভিল ডিফেন্সের কাছে আপনার ঘরের নম্বর আছে', 'سول ڈیفنس کے پاس آپ کے کمرے کا نمبر ہے', 'सिविल डिफेंस के पास आपके कमरे का नंबर है', 'Hawak ng Civil Defence ang numero ng kuwarto mo']);
  p('x.ladder.3.p', "غرفتك على القائمة المرسلة إلى الدفاع المدني. اضغط «أنا مستيقظ» إن استطعت.", "Your room is on the list sent to Civil Defence. Tap “I'm awake” if you can.", ['നിങ്ങളുടെ മുറി സിവിൽ ഡിഫൻസിന് അയച്ച പട്ടികയിലുണ്ട്. കഴിയുമെങ്കിൽ “ഞാൻ ഉണർന്നിരിക്കുന്നു” അമർത്തുക.', 'तपाईंको कोठा नागरिक सुरक्षालाई पठाइएको सूचीमा छ। सक्नुहुन्छ भने “म ब्यूँझिएको छु” थिच्नुहोस्।', 'আপনার ঘর সিভিল ডিফেন্সকে পাঠানো তালিকায় আছে। পারলে “আমি জেগে আছি” চাপুন।', 'آپ کا کمرہ سول ڈیفنس کو بھیجی گئی فہرست میں ہے۔ ہو سکے تو “میں جاگ گیا/گئی ہوں” دبائیں۔', 'आपका कमरा सिविल डिफेंस को भेजी गई सूची में है। हो सके तो “मैं जाग गया/गई हूँ” दबाएँ।', 'Nasa listahang ipinadala sa Civil Defence ang kuwarto mo. Pindutin ang “Gising na ako” kung kaya mo.']);
  p('x.ladder.3.o', 'أُرسلت إلى الدفاع المدني قائمة الغرف التي لم ترد بعد.', 'The list of rooms that still have not answered was sent to Civil Defence.');
  p('x.ladder.stop', 'أكّدت أنك مستيقظ — توقفت التنبيهات. اتبع الطريق.', 'You confirmed — the alerts stopped. Follow the route.');

  var LADDER = {
    stepSec: 30,
    sound: { pattern: 'three-pulse', hz: 520, src: ['S56'], note: T('نغمة منخفضة 520 هرتز بثلاث نبضات (مؤسسة أبحاث الحماية من الحرائق، 2020). سماعات الهواتف الصغيرة تعيد هذا التردد بشكل ضعيف، لذلك يُضاف اهتزاز قوي. لا نقلّد نغمة الإنذار الوطني أبدًا.', 'A low 520 Hz tone in three pulses (NFPA Research Foundation, 2020). Small phone speakers reproduce this poorly, so strong vibration is added. We never copy the national alert tone.') },
    steps: [
      { step: 0, audience: ['person'],           formats: ['sound', 'vibration', 'strobe'], title: null, text: 'x.ladder.0.p', vib: 'wake', loud: false, light: false },
      { step: 1, audience: ['person'],           formats: ['sound', 'vibration', 'light'],  title: 'x.ladder.1.t', text: 'x.ladder.1.p', vib: 'wake', loud: true,  light: true },
      { step: 2, audience: ['person', 'guard'],  formats: ['sound', 'vibration', 'light'],  title: 'x.ladder.2.t', text: 'x.ladder.2.p', guard: 'x.ladder.2.g', vib: 'wake', loud: true, light: true },
      { step: 3, audience: ['person', 'operator'], formats: ['sound', 'vibration', 'light'], title: 'x.ladder.3.t', text: 'x.ladder.3.p', operator: 'x.ladder.3.o', vib: 'wake', loud: true, light: true }
    ]
  };

  /* ====================================================================================
   * 8. CHECK-IN: "I'm safe" / "I need help" / "I'm awake" (phone, booth tablet, MANARA-SAFE point, teacher's class tablet)
   * ==================================================================================== */
  p('c.safe', 'أنا بأمان', "I'm safe", ['ഞാൻ സുരക്ഷിതനാണ്', 'म सुरक्षित छु', 'আমি নিরাপদ', 'میں محفوظ ہوں', 'मैं सुरक्षित हूँ', 'Ligtas ako']);
  p('c.help', 'أحتاج مساعدة', 'I need help', ['എനിക്ക് സഹായം വേണം', 'मलाई सहायता चाहिन्छ', 'আমার সাহায্য দরকার', 'مجھے مدد چاہیے', 'मुझे मदद चाहिए', 'Kailangan ko ng tulong']);
  p('c.awake', 'أنا مستيقظ', "I'm awake", ['ഞാൻ ഉണർന്നിരിക്കുന്നു', 'म ब्यूँझिएको छु', 'আমি জেগে আছি', 'میں جاگ گیا/گئی ہوں', 'मैं जाग गया/गई हूँ', 'Gising na ako']);
  p('c.got_it', 'علمت', 'Got it', ['മനസ്സിലായി', 'बुझें', 'বুঝেছি', 'سمجھ گیا/گئی', 'समझ गया/गई', 'Naintindihan ko']);
  p('c.counted', 'تم تسجيلك — شكرًا', 'You are counted — thank you', ['നിങ്ങളെ എണ്ണിയിട്ടുണ്ട് — നന്ദി', 'तपाईंलाई गनिएको छ — धन्यवाद', 'আপনাকে গণনা করা হয়েছে — ধন্যবাদ', 'آپ کو شمار کر لیا گیا — شکریہ', 'आपको गिन लिया गया है — धन्यवाद', 'Nabilang ka na — salamat']);
  p('c.help_sent', 'وصل طلبك — المساعدة في الطريق', 'Your request was received — help is on its way', ['നിങ്ങളുടെ അഭ്യർത്ഥന കിട്ടി — സഹായം വരുന്നു', 'तपाईंको अनुरोध प्राप्त भयो — सहायता आउँदैछ', 'আপনার অনুরোধ পাওয়া গেছে — সাহায্য আসছে', 'آپ کی درخواست مل گئی — مدد آ رہی ہے', 'आपका अनुरोध मिल गया — मदद आ रही है', 'Natanggap ang hiling mo — paparating na ang tulong']);
  p('c.undo', 'تراجع', 'Undo');
  p('c.room', 'رقم الغرفة', 'Room number');
  p('c.language', 'اللغة', 'Language');
  p('c.privacy', 'لا نطلب اسمًا — الغرفة والحالة فقط.', 'No name needed — room and status only.');
  p('c.status.safe', 'بأمان', 'Safe');
  p('c.status.help', 'يحتاج مساعدة', 'Needs help');
  p('c.status.unaccounted', 'لم يُحصَ بعد', 'Not counted yet');
  p('c.status.waiting', 'في الانتظار', 'Waiting');
  p('c.class.title', 'حصر الصف', 'Class head-count');
  p('c.class.all_safe', 'كل الصف بأمان', 'Whole class is safe');
  p('c.class.count', '{n} من {total} بأمان', '{n} of {total} are safe');
  p('c.safepoint', 'نقطة تسجيل الأمان MANARA-SAFE', 'Safe-point check-in MANARA-SAFE');

  /* ====================================================================================
   * 9. DISPATCH WORDING — "the unit that reaches the scene FASTEST given traffic" (not the nearest by distance); 999 stays the dispatcher
   * ==================================================================================== */
  p('u.fire', 'سيارة الإطفاء', 'Fire engine', ['ഫയർ എൻജിൻ', 'दमकल', 'ফায়ার সার্ভিসের গাড়ি', 'فائر بریگیڈ', 'दमकल', 'trak ng bumbero']);
  p('u.ambulance', 'الإسعاف', 'Ambulance', ['ആംബുലൻസ്', 'एम्बुलेन्स', 'অ্যাম্বুলেন্স', 'ایمبولینس', 'एम्बुलेंस', 'ambulansya']);
  p('u.police', 'الشرطة', 'Police', ['പോലീസ്', 'प्रहरी', 'পুলিশ', 'پولیس', 'पुलिस', 'pulis']);
  p('u.rescue', 'فريق الإنقاذ', 'Rescue team', ['രക്ഷാപ്രവർത്തകർ', 'उद्धार टोली', 'উদ্ধারকারী দল', 'ریسکیو ٹیم', 'बचाव दल', 'pangkat ng rescue']);
  p('u.hospital', 'المستشفى', 'Hospital', ['ആശുപത്രി', 'अस्पताल', 'হাসপাতাল', 'ہسپتال', 'अस्पताल', 'ospital']);
  p('u.hazmat', 'فريق المواد الخطرة', 'HazMat team');
  p('u.volunteer', 'متطوع مدرَّب', 'Trained volunteer');
  p('u.drone', 'المسيّرة (مفهوم تشغّله جهة مرخّصة)', 'Drone (a concept for a licensed agency)');
  p('un.fire', 'وحدة إطفاء', 'fire unit');
  p('un.ambulance', 'سيارة إسعاف', 'ambulance');
  p('un.police', 'دورية شرطة', 'police unit');
  p('un.rescue', 'فريق إنقاذ', 'rescue team');
  p('un.hospital', 'مستشفى', 'hospital');
  p('un.hazmat', 'وحدة مواد خطرة', 'HazMat unit');

  p('st.recommended', 'موصى بها', 'Recommended');
  p('st.approved', 'معتمدة', 'Approved');
  p('st.dispatched', 'أُرسلت', 'Dispatched');
  p('st.en-route', 'في الطريق', 'En route');
  p('st.on-scene', 'في الموقع', 'On scene');
  p('st.cleared', 'أنهت المهمة', 'Cleared');

  // calm resident-facing lines (update an ETA only when it changes materially)
  p('r.eta', '{unit}: الوصول خلال {mins}', '{unit} ETA {mins}', ['{unit}: {mins} ഉള്ളിൽ എത്തും', '{unit}: {mins} मा आइपुग्छ', '{unit}: {mins}-এর মধ্যে পৌঁছাবে', '{unit}: {mins} میں پہنچے گا', '{unit}: {mins} में पहुँचेगा', '{unit}: darating sa loob ng {mins}']);
  p('r.eta.ambulance', '{unit}: الوصول خلال {mins} — ابقَ مكانك', '{unit} ETA {mins} — stay where you are', ['{unit}: {mins} ഉള്ളിൽ എത്തും — ഇവിടെ തന്നെ നിൽക്കുക', '{unit}: {mins} मा आइपुग्छ — यहीँ बस्नुहोस्', '{unit}: {mins}-এর মধ্যে পৌঁছাবে — যেখানে আছেন সেখানেই থাকুন', '{unit}: {mins} میں پہنچے گی — جہاں ہیں وہیں رہیں', '{unit}: {mins} में पहुँचेगी — जहाँ हैं वहीं रहें', '{unit}: darating sa loob ng {mins} — manatili kung nasaan ka']);
  p('r.onway.ambulance', 'الإسعاف في الطريق — ابقَ مكانك', 'Ambulance on its way — stay where you are', ['ആംബുലൻസ് വരുന്നുണ്ട് — ഇവിടെ തന്നെ നിൽക്കുക', 'एम्बुलेन्स आउँदैछ — यहीँ बस्नुहोस्', 'অ্যাম্বুলেন্স আসছে — যেখানে আছেন সেখানেই থাকুন', 'ایمبولینس آ رہی ہے — جہاں ہیں وہیں رہیں', 'एम्बुलेंस आ रही है — जहाँ हैं वहीं रहें', 'Paparating ang ambulansya — manatili kung nasaan ka']);
  p('r.cordon.police', 'الشرطة تغلق الطريق', 'Police are closing the road', ['പോലീസ് റോഡ് അടയ്ക്കുന്നു', 'प्रहरीले सडक बन्द गर्दैछ', 'পুলিশ রাস্তা বন্ধ করছে', 'پولیس سڑک بند کر رہی ہے', 'पुलिस सड़क बंद कर रही है', 'Isinasara ng pulis ang kalsada']);
  p('r.onscene.fire', 'سيارة الإطفاء وصلت إلى الموقع', 'Fire engine is on scene');
  p('r.onscene.ambulance', 'الإسعاف وصل إلى الموقع', 'Ambulance is on scene');
  p('r.onscene.police', 'الشرطة وصلت إلى الموقع', 'Police are on scene');
  p('r.onscene.rescue', 'فريق الإنقاذ وصل إلى الموقع', 'Rescue team is on scene');
  p('r.update', 'تحديث: {unit} — الوصول الآن خلال {mins}', 'Update: {unit} ETA is now {mins}');
  p('r.cleared', 'انتهت مهمة {unit} هنا', '{unit}: finished here');
  p('r.stay', 'ابقَ مكانك ولا تتجه إلى مكان الحادث.', 'Stay where you are. Do not go to the incident.');
  p('r.sim', 'الأزمنة محاكاة (SIM) والوحدات افتراضية.', 'Times are simulated (SIM) and the units are fictional.');
  p('r.999', '999 هو المُرسِل الحقيقي. منارة لا تتصل نيابةً عنك.', '999 is the real dispatcher. MANARA does not call for you.');

  // operator-facing (Mission Control, hand-off)
  p('o.title', 'التوصية بأسرع جهة استجابة', 'Fastest-responder recommendation');
  p('o.units_for', 'الوحدات المطلوبة لهذه الحادثة', 'Units this incident needs');
  p('o.rec', 'التوصية: أسرع {noun} متاحة — {name}، الوصول خلال {mins}؛ البديل: {name2} خلال {mins2}.', 'Recommended: fastest available {noun} — {name}, ETA {mins}; runner-up {name2} {mins2}.', null, { alt: 'o.rec1' });
  p('o.rec1', 'التوصية: أسرع {noun} متاحة — {name}، الوصول خلال {mins}. لا توجد وحدة بديلة متاحة.', 'Recommended: fastest available {noun} — {name}, ETA {mins}. No other unit is available.');
  p('o.far_faster', '{name} أبعد بنحو {km} كم من أقرب وحدة، لكنها أسرع بمقدار {gain} ({reason}).', '{name} is {km} km farther than the nearest unit but {gain} faster ({reason}).');
  p('o.nearest', 'الأقرب مسافةً: {name} — {km} كم، الوصول خلال {mins}.', 'Nearest by distance: {name} — {km} km, ETA {mins}.');
  p('o.why', 'السبب: أسرع زمن وصول مع المرور (محاكى)، وليس أقصر مسافة.', 'Why: fastest ETA with (simulated) traffic, not the shortest distance.');
  p('o.eta_changed', 'تغيّر زمن الوصول: {name} من {mins} إلى {mins2}.', 'ETA changed: {name} from {mins} to {mins2}.');
  p('o.redispatched', 'إعادة توجيه: {from} ← {to} — {reason}؛ أسرع بمقدار {gain}.', 'Re-dispatched: {from} → {to} — {reason}; {gain} faster.');
  p('o.reason.closed', 'أُغلق طريق على مسارها', 'a road on its route closed');
  p('o.reason.traffic', 'ازداد الازدحام على مسارها', 'traffic got worse on its route');
  p('o.reason.busy', 'أصبحت الوحدة مشغولة', 'the unit became busy');
  p('o.reason.faster', 'توفّرت وحدة أسرع', 'a faster unit became available');
  p('o.hospital', 'المستشفى: {name} — الوصول خلال {mins}. اختير لأنه يوفّر {need} وهو الأسرع.', 'Hospital: {name} — ETA {mins}. Chosen because it offers {need} and is the fastest.');
  p('o.need.ed', 'طوارئ على مدار الساعة', '24-hour emergency care');
  p('o.need.trauma', 'رعاية إصابات من المستوى الأول', 'Level I trauma care');
  p('o.need.paed', 'طوارئ الأطفال', 'paediatric emergency care');
  p('o.capacity', 'سعة المستشفى افتراض محاكى (SIM) وليست بيانات حقيقية.', 'Hospital capacity is a SIM assumption, not real data.');
  p('o.sim', 'مرور محاكى (SIM) — وحدات ومستشفيات افتراضية.', 'SIM traffic — fictional units and hospitals.');
  p('o.dispatcher', 'منارة توصي فقط. 999 وغرفة العمليات هما من يقرّر.', 'MANARA only recommends. 999 and the control room decide.');
  p('o.approve', 'اعتمد الإرسال', 'Approve dispatch');
  p('o.reject', 'ارفض', 'Reject');
  p('o.reroute', 'أعد التوجيه', 'Re-dispatch');
  p('o.jam', 'ازدحم الطريق', 'Jam this road');
  p('o.traffic', 'المرور (محاكى)', 'Traffic (SIM)');

  // responder hand-off card — field labels (the card itself is built by ManaraSim.handoff)
  var HANDOFF_ORDER = ['title', 'status', 'incident', 'hazard', 'where', 'when', 'verification', 'keys', 'approved', 'wind', 'exits', 'roads', 'people', 'registered', 'safe', 'help', 'unaccounted', 'rooms', 'needs', 'language', 'units', 'hospital', 'drone', 'notes', 'cap', 'dispatcher'];
  p('hc.title', 'بطاقة التسليم لجهات الاستجابة', 'Responder hand-off card');
  p('hc.status', 'الحالة', 'Status');
  p('hc.exercise', 'تمرين — محاكاة', 'EXERCISE — simulation');
  p('hc.incident', 'الحادثة', 'Incident');
  p('hc.hazard', 'الخطر', 'Hazard');
  p('hc.where', 'الموقع', 'Location');
  p('hc.when', 'الوقت', 'Time');
  p('hc.verification', 'التحقق', 'Verification');
  p('hc.keys', 'المفاتيح المؤكَّدة', 'Keys confirmed');
  p('hc.approved', 'موافقة المشغّل', 'Operator approval');
  p('hc.wind', 'الريح', 'Wind');
  p('hc.exits', 'حالة المخارج', 'Exit status');
  p('hc.roads', 'طرق مغلقة', 'Closed roads');
  p('hc.people', 'الأشخاص', 'People');
  p('hc.registered', 'المسجّلون', 'Registered');
  p('hc.safe', 'بأمان', 'Safe');
  p('hc.help', 'يحتاجون مساعدة', 'Need help');
  p('hc.unaccounted', 'غير محصيين', 'Not counted');
  p('hc.rooms', 'الغرف', 'Rooms');
  p('hc.needs', 'احتياجات خاصة', 'Special needs');
  p('hc.language', 'اللغة', 'Language');
  p('hc.units', 'الوحدات الموصى بها', 'Recommended units');
  p('hc.hospital', 'المستشفى الموصى به', 'Recommended hospital');
  p('hc.drone', 'المسيّرة', 'Drone');
  p('hc.notes', 'ملاحظات', 'Notes');
  p('hc.cap', 'تصدير CAP (OASIS CAP 1.2، الحالة: تمرين)', 'CAP export (OASIS CAP 1.2, status: Exercise)');
  p('hc.dispatcher', '999 يبقى المُرسِل', '999 stays the dispatcher');
  p('hc.last_seen', 'آخر إشارة', 'Last signal');
  p('hc.state.open', 'مفتوح', 'OPEN');
  p('hc.state.smoke', 'دخان', 'SMOKE');
  p('hc.state.fire', 'نار', 'FIRE');
  p('hc.state.locked', 'مقفل', 'LOCKED');
  p('hc.need.wheelchair', 'كرسي متحرك', 'Wheelchair');
  p('hc.need.deaf', 'أصمّ', 'Deaf');
  p('hc.need.blind', 'كفيف', 'Blind');
  p('hc.need.child', 'طفل', 'Child');
  p('hc.need.elderly', 'كبير سن', 'Older adult');
  p('hc.need.low-literacy', 'قراءة محدودة', 'Low literacy');

  /* ====================================================================================
   * 10. THE FRIENDLY DRONE LIGHT (a design choice — the drone itself is a concept for a licensed agency)
   * ==================================================================================== */
  p('drone.light.name', 'الضوء الودّي لمنارة', 'MANARA friendly light');
  p('drone.light.desc', 'أخضر ثابت مع وميضين أبيضين قصيرين كل ثانيتين، حتى يميّزه السكان من الأضواء الأخرى. لا يحمل صفارة إنذار.', 'Steady green with two short white flashes every 2 seconds, so residents can tell it from other lights. It carries no siren.');
  p('drone.light.meaning', 'معناه: مسيّرة تشغّلها جهة مرخّصة تساعد في إرشاد الناس — وليست خطرًا.', 'It means: a drone run by a licensed agency is helping to guide people — it is not a danger.');
  p('drone.light.note', 'اختيار تصميمي من فريق المشروع وليس معيارًا رسميًا. المسيّرة مفهوم تشغّله جهة مرخّصة مثل الدفاع المدني وفق أنظمة الطيران المدني القطرية، ولا تحلّق في العرض فوق أحد.', 'A design choice by the project team, not an official standard. The drone is a concept for a licensed agency such as Civil Defence under Qatar civil-aviation rules, and nothing flies over anyone in the demo.');
  p('drone.light.safe', 'لا يومض أكثر من 3 مرات في الثانية.', 'It never flashes more than 3 times a second.', null, { src: ['S57'] });

  /* ====================================================================================
   * 11. UI STRINGS for the alert page (alert.html) and the nearby-facilities lookup — ar + en
   *     Register them with Manara.strings(MANARA_MSG.strings()) → keys 'msg.<id>'.
   * ==================================================================================== */
  p('ui.alert.title', 'تنبيه المقيمين', 'Resident alert');
  p('ui.alert.exercise', 'تمرين — تنبيه تجريبي من منارة وليس تحذيرًا رسميًا', 'EXERCISE — a MANARA demo alert, not an official warning');
  p('ui.alert.sim', 'محاكاة', 'SIM');
  p('ui.alert.waiting', 'لا يوجد تنبيه الآن. ابدأ سيناريو من غرفة العمليات أو اختر خطرًا هنا.', 'No alert right now. Start a scenario in Mission Control or pick a hazard here.');
  p('ui.alert.live', 'مباشر من غرفة العمليات', 'Live from Mission Control');
  p('ui.alert.standalone', 'عرض تجريبي مستقل', 'Stand-alone demo');
  p('ui.alert.pick_person', 'اختر شخصًا', 'Choose a person');
  p('ui.alert.pick_hazard', 'اختر الخطر', 'Choose a hazard');
  p('ui.alert.pick_level', 'اختر المستوى', 'Choose a level');
  p('ui.alert.pick_lang', 'لغة التنبيه', 'Alert language');
  p('ui.alert.draft', DRAFT_NOTICE.ar, DRAFT_NOTICE.en);
  p('ui.alert.draft_note', 'هذه الترجمة مسودة لم يراجعها متحدث أصلي بعد. الصور والنص العربي والإنجليزي أسفلها يحملان الرسالة نفسها.', 'This translation is a draft that no native speaker has checked yet. The pictures and the Arabic and English text below carry the same message.');
  p('ui.alert.also', 'بالعربية والإنجليزية', 'In Arabic and English');
  p('ui.alert.fallback', 'هذه اللغة غير متاحة لهذه الرسالة، فنعرض الإنجليزية.', 'This language is not available for this message, so we show English.');
  p('ui.alert.more', 'تفاصيل أكثر', 'More details');
  p('ui.alert.less', 'تفاصيل أقل', 'Fewer details');
  p('ui.alert.read_aloud', 'اقرأ بصوت عالٍ', 'Read aloud');
  p('ui.alert.stop_voice', 'أوقف القراءة', 'Stop reading');
  p('ui.alert.sound', 'الصوت', 'Sound');
  p('ui.alert.vibration', 'الاهتزاز', 'Vibration');
  p('ui.alert.light', 'الضوء', 'Light');
  p('ui.alert.strobe', 'ضوء وامض للصمّ (اختياري)', 'Flashing light for Deaf users (optional)');
  p('ui.alert.strobe_warn', PHOTO_WARNING.ar, PHOTO_WARNING.en, null, { src: ['S57'] });
  p('ui.alert.strobe_on', 'شغّل الضوء الوامض', 'Turn on the flashing light');
  p('ui.alert.reduced_motion', 'خيار تقليل الحركة مفعّل — نستخدم ضوءًا ثابتًا بدل الوميض.', 'Reduced motion is on — a steady light is used instead of flashing.');
  p('ui.alert.tone_note', 'يستخدم العرض صوت منارة الخاص وليس نغمة الإنذار الوطني.', "This demo uses MANARA's own sound, not the national alert tone.", null, { src: ['S36'] });
  p('ui.alert.sound_note', 'صوت الإيقاظ: نغمة منخفضة 520 هرتز بثلاث نبضات (مؤسسة أبحاث الحماية من الحرائق، 2020). سماعات الهواتف الصغيرة تعيدها بشكل ضعيف، لذلك نضيف اهتزازًا قويًا.', 'Wake-up sound: a low 520 Hz tone in three pulses (NFPA Research Foundation, 2020). Small phone speakers reproduce it poorly, so we add strong vibration.', null, { src: ['S56'] });
  p('ui.alert.route', 'طريقك الآمن', 'Your safe route');
  p('ui.alert.route_to', 'إلى {place}', 'to {place}');
  p('ui.alert.no_route', 'لا حاجة إلى التحرّك — ابقَ في مكانك.', 'No need to move — stay where you are.');
  p('ui.alert.distance', 'المسافة إلى الخطر: {m} م', 'Distance to the hazard: {m} m');
  p('ui.alert.eta_front', 'وصول الغبار المتوقع خلال {mins}', 'Dust expected here in {mins}');
  p('ui.alert.wind', 'اتجاه الريح', 'Wind direction');
  p('ui.alert.area', 'منطقة التنبيه', 'Alert area');
  p('ui.alert.time', 'الوقت', 'Time');
  p('ui.alert.ladder', 'سلّم الإيقاظ', 'Wake-up ladder');
  p('ui.alert.ladder_step', 'الدرجة {n}', 'Step {n}');
  p('ui.alert.call999', 'اتصل بـ 999', 'Call 999');
  p('ui.alert.call999_note', '999 هو المُرسِل الحقيقي. منارة لا تتصل نيابةً عنك.', '999 is the real dispatcher. MANARA does not call for you.');
  p('ui.alert.responders', 'الجهات المتجهة إليك', 'Responders on their way');
  p('ui.alert.responders_sim', 'الأزمنة محاكاة (SIM) والوحدات افتراضية.', 'Times are simulated (SIM) and the units are fictional.');
  p('ui.alert.counted', 'تم تسجيلك — شكرًا', 'You are counted — thank you');
  p('ui.alert.help_sent', 'وصل طلبك. المساعدة في الطريق.', 'Your request was received. Help is on its way.');
  p('ui.alert.na', 'غير متاح لهذا المحفّز', 'N/A for this stimulus');
  p('ui.alert.offline', 'لا يوجد اتصال — التنبيهات المحلية تعمل بدون إنترنت.', 'You are offline — local alerts still work.');
  p('ui.alert.reviewed', 'تُراجَع صياغة الإسعاف الأولي مع الجهات الصحية قبل أي استخدام حقيقي.', 'First-aid wording must be reviewed with the health authorities before any real use.');

  p('ui.nearby.title', 'المرافق القريبة (للاطلاع فقط)', 'Nearby facilities (informational)');
  p('ui.nearby.intro', 'قائمة بأقرب مستشفى ومركز شرطة ومحطة إطفاء من خرائط OpenStreetMap. هذا للاطلاع فقط وليس إرسالًا للمساعدة.', 'A list of the nearest hospital, police station and fire station from OpenStreetMap. It is for information only, not a call for help.');
  p('ui.nearby.consent', 'نستخدم موقعك مرة واحدة فقط. لا نحفظه ولا نرسله إلا إلى خدمة بحث OpenStreetMap.', 'We use your location once. It is not saved and is sent only to the OpenStreetMap lookup service.');
  p('ui.nearby.button', 'ابحث عن المرافق القريبة', 'Find nearby facilities');
  p('ui.nearby.loading', 'جارٍ البحث…', 'Looking…');
  p('ui.nearby.offline', 'لا يوجد اتصال بالإنترنت فلا يمكن البحث. في الطوارئ اتصل بـ 999.', 'No internet, so the lookup cannot run. In an emergency call 999.');
  p('ui.nearby.denied', 'لم يُسمح بالوصول إلى الموقع.', 'Location access was not allowed.');
  p('ui.nearby.failed', 'تعذّر إكمال البحث. حاول مرة أخرى أو اتصل بـ 999 عند الطوارئ.', 'The lookup failed. Try again, or call 999 in an emergency.');
  p('ui.nearby.incomplete', 'بيانات OpenStreetMap قد تكون ناقصة.', 'OpenStreetMap data may be incomplete.');
  p('ui.nearby.distance', 'المسافة وليست زمن الوصول.', 'Distance, not travel time.');
  p('ui.nearby.call999', 'في الطوارئ اتصل بـ 999.', 'In an emergency call 999.');
  p('ui.nearby.hospital', 'أقرب مستشفى', 'Nearest hospital');
  p('ui.nearby.police', 'أقرب مركز شرطة', 'Nearest police station');
  p('ui.nearby.fire', 'أقرب محطة إطفاء', 'Nearest fire station');
  p('ui.nearby.none', 'لم نجد مرفقًا ضمن {km} كم.', 'No facility found within {km} km.');
  p('ui.nearby.km', '{km} كم', '{km} km');
  p('ui.nearby.not_dispatch', 'هذه القائمة معلومات فقط؛ التوجيه الفعلي تتولاه غرفة عمليات 999.', 'This list is information only; real dispatch is done by the 999 control room.');

  /* ====================================================================================
   * 12. PEOPLE (named demo residents — all fictional), DISPATCH PLAN per hazard, SAFETY NOTES
   * ==================================================================================== */
  var PEOPLE = [
    { id: 'ravi', simKey: 'ravi', fictional: true, name: T('رافي', 'Ravi'), persona: 'worker', alsoAsleepAtNight: true, lang: 'ml', room: '203', role: T('عامل بناء', 'Construction worker'),
      needs: ['low-literacy', 'other-language', 'asleep-at-night'],
      story: T('رافي عامل بناء يقرأ المالايالامية؛ ينام في الغرفة 203 ويعمل في الخارج نهارًا.', 'Ravi is a construction worker who reads Malayalam. He sleeps in room 203 and works outdoors by day.') },
    { id: 'huda', simKey: 'huda', fictional: true, name: T('هدى', 'Huda'), persona: 'deaf', lang: 'ar', room: '105', role: T('مقيمة', 'Resident'),
      needs: ['deaf'],
      story: T('هدى مقيمة صمّاء في الغرفة 105؛ لا تسمع الصفارة، فتحتاج إلى الضوء والاهتزاز والنص.', 'Huda is a Deaf resident in room 105. She cannot hear a siren, so she needs light, vibration and text.') },
    { id: 'abu-salem', simKey: 'abu-salem', fictional: true, name: T('أبو سالم', 'Abu Salem'), persona: 'wheelchair', also: ['elderly'], lang: 'ar', room: '302', role: T('مقيم مسنّ', 'Older resident'),
      needs: ['wheelchair', 'elderly'],
      story: T('أبو سالم رجل مسنّ يستخدم كرسيًا متحركًا في الغرفة 302؛ لا يستطيع استخدام الدرج.', 'Abu Salem is an older man who uses a wheelchair in room 302. He cannot use the stairs.') },
    { id: 'lina', simKey: 'lina', fictional: true, name: T('لينا', 'Lina'), persona: 'child', lang: 'ar', room: '106', cls: '5B', age: 9, role: T('تلميذة', 'Pupil'),
      needs: ['child'],
      story: T('لينا طفلة عمرها 9 سنوات في الصف 5ب؛ تحتاج بطاقة مصوّرة وتتبع معلّمها.', 'Lina is 9, in class 5B. She needs a picture card and follows her teacher.') },
    { id: 'guard', simKey: null, fictional: true, name: T('ناصر', 'Nasser'), persona: 'guard', lang: 'ar', room: null, role: T('حارس المبنى', 'Building guard'),
      needs: ['operator'],
      story: T('ناصر حارس المبنى؛ تصله قائمة الغرف، فيطرق الأبواب ويجمع الناس.', 'Nasser is the building guard. He gets the room list, knocks on doors and gathers people.') },
    { id: 'yousef', simKey: null, fictional: true, name: T('يوسف', 'Yousef'), persona: 'blind', lang: 'ar', room: '207', role: T('مقيم كفيف', 'Blind resident'),
      needs: ['blind'],
      story: T('يوسف مقيم كفيف في الغرفة 207؛ يحتاج إرشادًا صوتيًا واهتزازًا قويًا.', 'Yousef is a blind resident in room 207. He needs voice guidance and strong vibration.') }
  ];

  var DISPATCH_PLAN = {
    fire:  [{ kind: 'fire', role: T('مكافحة الحريق والإنقاذ', 'Fight the fire and rescue') }, { kind: 'rescue', optional: true, role: T('إنقاذ (للمبنى السكني)', 'Rescue (for the residence)') }, { kind: 'ambulance', role: T('تأهّب أو حضور إلى الموقع', 'Standby or at the scene') }, { kind: 'police', role: T('تطويق المنطقة وتنظيم السير', 'Cordon and traffic') }],
    smoke: [{ kind: 'fire', role: T('فحص مصدر الدخان', 'Check the source of the smoke') }, { kind: 'ambulance', role: T('تأهّب للحالات التنفسية', 'Standby for breathing problems') }, { kind: 'police', optional: true, role: T('تنظيم السير والرؤية', 'Traffic and visibility') }],
    gas:   [{ kind: 'hazmat', role: T('إطفاء ومواد خطرة', 'Fire and hazardous materials') }, { kind: 'ambulance', role: T('تأهّب أو حضور إلى الموقع', 'Standby or at the scene') }, { kind: 'police', role: T('تطويق ومحيط الإخلاء', 'Cordon and evacuation perimeter') }],
    flood: [{ kind: 'rescue', role: T('إنقاذ (الدفاع المدني)', 'Rescue (Civil Defence)') }, { kind: 'police', role: T('إغلاق الطرق وحواجز النفق', 'Road closures and underpass barriers') }, { kind: 'ambulance', role: T('تأهّب', 'Standby') }],
    dust:  [{ kind: 'police', role: T('السير والرؤية', 'Traffic and visibility') }, { kind: 'ambulance', role: T('تأهّب للحالات التنفسية', 'Standby for breathing problems') }],
    heat:  [{ kind: 'ambulance', role: T('إسعاف ودعم التبريد', 'Ambulance and cooling support') }, { kind: 'hospital', role: T('وجهة المريض', 'Patient destination') }],
    sos:   [{ kind: 'ambulance', role: T('أقرب إسعاف بأسرع زمن وصول', 'Fastest ambulance to the scene') }, { kind: 'volunteer', role: T('أقرب متطوع مدرَّب (مفهوم)', 'Nearest trained volunteer (concept)') }, { kind: 'hospital', role: T('وجهة المريض', 'Patient destination') }]
  };

  SOURCES.S4 = { id: 'S4', short: T('UL FSRI — «أغلق قبل أن تنام»', 'UL FSRI — "Close Before You Doze"') };
  var SAFETY_NOTES = [
    { id: 'fire-close-doors', where: 'i.fire.close_doors', status: 'sourced', basis: ['S4'], text: T('إغلاق الأبواب خلفك يبطّئ الحريق (UL FSRI).', 'Closing doors behind you slows the fire (UL FSRI).') },
    { id: 'fire-no-lift', where: 'i.fire.stairs', status: 'confirm-before-printing', basis: [], text: T('«لا مصعد في الحريق» ممارسة معيارية ولا يوجد لها صف في ملف المصادر؛ تُؤكَّد مع الدفاع المدني قبل الطباعة.', '"No lift in a fire" is standard practice with no row in the sources file; confirm with Civil Defence before printing.') },
    { id: 'fire-stay-low', where: 'i.fire.low', status: 'confirm-before-printing', basis: [], text: T('«ابقَ منخفضًا في الدخان» ممارسة معيارية ليست في بحث المخاطر؛ تُؤكَّد مع الدفاع المدني قبل الطباعة.', '"Stay low in smoke" is standard practice that the hazards research does not cite; confirm with Civil Defence before printing.') },
    { id: 'fire-exit-name', where: 'i.fire.exit', status: 'changed-from-research', basis: [], text: T('غُيّر «الدرج (ب)» الثابت في البحث إلى {exit}، لأن المخرج الصحيح يتغيّر بحسب حالة المخارج (الحقيقة عن المخارج).', 'The research text hard-codes "Stair B"; it is now {exit}, because the right exit changes with the exit states (exit truth).') },
    { id: 'blind-turns', where: 'v.blind.turn', status: 'changed-from-research', basis: [], text: T('حذفنا «ثم انزل» من إرشاد الكفيف في البحث لأن المخرج قد يكون في الطابق نفسه؛ والصياغة تستعمل {steps} و{turn} من المسار الحي.', 'The research voice line ends "then go down"; dropped because the exit may be on the same floor. The line uses {turn} and {steps} from the live route.') },
    { id: 'fire-loc-sent', where: 'i.fire.loc_sent', status: 'demo-only', basis: [], text: T('«أُرسل موقعك إلى الدفاع المدني» صحيح داخل المحاكاة (بطاقة التسليم) فقط؛ الربط الحقيقي يحتاج اتفاقًا مع الجهة، وشعار «تمرين» يظهر على كل تنبيه.', '"Your location was sent to Civil Defence" is true inside the simulation (hand-off card) only; real integration needs an agreement, and the EXERCISE banner is on every alert.') },
    { id: 'gas-windows', where: 'i.gas.open / i.gas.stay', status: 'changed-from-research', basis: ['S40'], text: T('إرشاد الدفاع المدني (افتح الأبواب والنوافذ) ينطبق على التسرّب داخل البيت؛ أما السحابة الخارجية فيُطلب فيها إغلاق النوافذ (كما في sim.js). حدّدنا الحالتين بدل الخلط بينهما.', 'Civil Defence advice (open doors and windows) applies to a leak INSIDE the home; for an outdoor plume the message says close windows (as sim.js does). Both are kept and scoped instead of mixed.') },
    { id: 'gas-no-phone', where: 'i.gas.no_phone', status: 'confirm-before-printing', basis: [], text: T('«لا هاتف قرب المصدر واتصل بـ 999 من بعيد» ممارسة موردي الغاز؛ لم نجد مصدرها قابلًا للقراءة، فتُؤكَّد مع الدفاع المدني (كما في بحث المخاطر).', '"No phone near the source, call 999 from far away" is LPG-supplier practice whose source could not be read; confirm with Civil Defence (as the hazards research says).') },
    { id: 'gas-low-spots', where: 'i.gas.low', status: 'sourced', basis: ['S47', 'S48'], text: T('LPG وH2S أثقل من الهواء ويتجمعان في الأماكن المنخفضة؛ CO يختلط بالهواء ولا يتجمّع في الأسفل (لذلك نسخة CO لا تذكر الأماكن المنخفضة).', 'LPG and H2S are heavier than air and pool in low places; CO mixes with air (so the CO variant does not mention low places).') },
    { id: 'gas-smell', where: 'i.gas.smell', status: 'sourced', basis: ['S47', 'S48'], text: T('الشم ليس إنذارًا موثوقًا (H2S يُفقد حاسة الشم؛ رائحة LPG قد تتلاشى).', 'Smell is not a reliable warning (H2S fatigues the sense of smell; LPG odour can fade).') },
    { id: 'gas-co-signs', where: 'i.gas.co.check', status: 'medical-review', basis: ['S47'], text: T('علامات التسمم بـ CO (صداع، دوار) من بحث المخاطر؛ تُراجَع مع مؤسسة حمد قبل الطباعة.', 'CO warning signs (headache, dizziness) come from the hazards research; review with HMC before printing.') },
    { id: 'flood-lines', where: 'i.flood.*', status: 'sourced', basis: ['S55', 'S71'], text: T('لا تعبر المياه الجارية (NWS، بيانات دولية)؛ لا تختبر البرك وابتعد عن فتحات التصريف والكهرباء؛ أرقام 184 و188 و991 (إرشادات قطر).', 'Never cross moving water (NWS, international guidance); do not test puddles, keep away from open drains and electrics; numbers 184, 188, 991 (Qatar guidance).') },
    { id: 'flood-ground-floor', where: 'i.flood.ground_up', status: 'changed-from-research', basis: [], text: T('أضفنا «في الطابق الأرضي؟ استعد للصعود» لأن «ابقَ في الأعلى» وحدها لا تخاطب من هو في الطابق الأرضي.', 'We added "On the ground floor? Be ready to go up" because "stay up high" alone says nothing to someone on the ground floor.') },
    { id: 'sos-unlock', where: 'i.sos.unlock', status: 'confirm-before-printing', basis: [], text: T('«افتح الباب إن استطعت» إضافة منطقية (يحتاج المسعفون إلى الدخول) وليست في بحث المخاطر؛ تُؤكَّد مع مؤسسة حمد.', '"Unlock the door if you can" is a logical addition (responders need access) that the hazards research does not contain; confirm with HMC.') },
    { id: 'flood-wheelchair', where: 'flood × wheelchair', status: 'changed-from-research', basis: [], text: T('أضفنا «إن وصل الماء إليك فاتصل بـ 999» لمن لا يستطيع النزول، لأن «ابقَ في الطابق العلوي» وحدها لا تكفي إن بلغ الماء الطابق.', 'We added "if water reaches you, call 999" for people who cannot go down, because "stay upstairs" alone is not enough if water reaches that floor.') },
    { id: 'dust-mask', where: 'i.dust.mask / i.air.asthma', status: 'medical-review', basis: [], text: T('صياغة الكمامة وتعليمات الربو تُراجَع مع وزارة الصحة العامة قبل الطباعة (كما في بحث المخاطر).', 'Mask and asthma wording must be checked with the Ministry of Public Health before printing (as the hazards research says).') },
    { id: 'heat-stroke', where: 'i.heat.signs', status: 'medical-review', basis: ['S54'], text: T('ضربة الشمس: اتصل بـ 999 وبرّد الجسم ولا تسقِ المصاب شيئًا (CDC، إرشاد دولي). تتعارض مع «اشرب ماءً» للعامل السليم، لذلك السطرُ مقيّد بالمصاب المرتبك أو المغمى عليه.', 'Heat stroke: call 999, cool the body, give nothing to drink (CDC, international guidance). It conflicts with "drink water" for a healthy worker, so the line is scoped to the confused or fainted person.') },
    { id: 'heat-rule', where: 'i.guard.heat.rule', status: 'sourced', basis: ['S19'], text: T('حدّ WBGT 32.1 °م قيمة مقاسة؛ إذا كانت قيمة الشاشة تقديرًا من مستشعر حرارة ورطوبة فيجب أن تُكتب «تقدير».', 'The 32.1 °C WBGT limit is a measured value; if the screen value is an estimate from a temperature/humidity sensor it must say "estimate".') },
    { id: 'sos-recovery', where: 'i.sos.recovery', status: 'medical-review', basis: [], text: T('وضع الاستلقاء على الجنب إسعاف أولي معياري وليس في ملف المصادر؛ يُراجَع مع مؤسسة حمد قبل الطباعة. منارة ليست جهازًا طبيًا.', 'The recovery position is standard first aid that is not in the sources file; review with HMC before printing. MANARA is not a medical device.') },
    { id: 'sos-aed', where: 'i.sos.vol.aed', status: 'demo-only', basis: [], text: T('مواقع أجهزة AED افتراضية في العرض؛ برنامج AED في قطر غير موثّق (N/A).', 'AED locations are fictional in the demo; Qatar\'s AED programme is not documented (N/A).') },
    { id: 'child-follow', where: 'i.child.follow', status: 'changed-from-research', basis: [], text: T('البحث يقول «اتبع معلّمك»؛ وسّعناها إلى «معلّمك أو أحد الكبار» لأن الطفل في البيت ليس معه معلّم (لينا نائمة في البيت ليلًا).', 'The research says "follow your teacher"; widened to "your teacher or a grown-up" because a child at home has no teacher (Lina sleeps at home at night).') },
    { id: 'deaf-992', where: 'persona deaf', status: 'not-included', basis: ['S37'], text: T('لم نضف الرقم 992 إلى بطاقة الأصمّ لأن البحث يشترط أن تتحقق المدرسة من قواعد وزارة الداخلية الحالية مع جهة رسمية أولًا.', 'The 992 number is NOT on the Deaf card, because the research requires the school to check the Ministry of Interior\'s current rules with an official contact first.') },
    { id: 'wake-sound', where: 'ladder', status: 'sourced', basis: ['S56', 'S36'], text: T('نغمة الإيقاظ 520 هرتز بثلاث نبضات (NFPA) وهي ضعيفة على سماعات الهواتف، ولا نقلّد نغمة الإنذار الوطني (وزارة الداخلية).', 'Wake-up tone: 520 Hz in three pulses (NFPA), weak on phone speakers; we never copy the national alert tone (Ministry of Interior).') },
    { id: 'strobe', where: 'flash', status: 'sourced', basis: ['S57'], text: T('الوميض اختياري دائمًا، بتحذير، وبحدّ أقصى 3 مرات في الثانية، ولا يعمل مع «تقليل الحركة».', 'Flashing is always opt-in, with a warning, at most 3 flashes per second, and off under "reduce motion".') },
    { id: 'dispatch', where: 'dispatch lines', status: 'demo-only', basis: [], text: T('كل أزمنة الوصول محاكاة (SIM) ووحدات العرض افتراضية؛ منارة توصي فقط و999 هو المُرسِل.', 'All ETAs are SIM and the demo units are fictional; MANARA only recommends and 999 is the dispatcher.') },
    { id: 'languages', where: 'ml ne bn ur hi tl', status: 'confirm-before-printing', basis: [], text: T('اللغات الست مسودات لم يراجعها متحدث أصلي، وتحمل الوسم draft-needs-native-review؛ ولا تُستخدم ترجمة آلية حيّة.', 'The six community languages are drafts that no native speaker has reviewed, flagged draft-needs-native-review; no live machine translation is used.') }
  ];

  /* ====================================================================================
   * 13. ENGINE — normalisers, placeholders, number words, message builder
   * ==================================================================================== */
  var KNOWN_TOKENS = { exit: 1, room: 1, place: 1, shelter: 1, steps: 1, turn: 1, n: 1, mins: 1, mins2: 1, sec: 1, gain: 1, km: 1, km2: 1, name: 1, name2: 1, unit: 1, noun: 1, reason: 1, from: 1, to: 1, need: 1, m: 1, total: 1, road: 1 };
  var MIN_WORD = { ml: 'മിനിറ്റ്', ne: 'मिनेट', bn: 'মিনিট', ur: 'منٹ', hi: 'मिनट', tl: 'minuto' };
  var TURN = { left: T('يسارًا', 'left'), right: T('يمينًا', 'right'), straight: T('إلى الأمام', 'straight on') };

  function lc(s) { return typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, '-') : s; }
  function normHazard(h) { h = lc(h); if (HAZARD[h]) return h; return HAZARD_ALIAS[h] || null; }
  function normLevel(l) { l = lc(l); if (LEVEL_IDS.indexOf(l) >= 0) return l; return LEVEL_ALIAS[l] || null; }
  function normPersona(x) { x = lc(x); if (PERSONA[x]) return x; return PERSONA_ALIAS[x] || (x ? 'adult' : 'adult'); }
  function normLang(l) {
    if (!l) return 'ar'; l = String(l).toLowerCase().split(/[-_]/)[0];
    if (l === 'fil') l = 'tl';
    return LANG[l] ? l : 'en';
  }
  function isDraftLang(l) { return LANG[l] && LANG[l].status !== 'complete'; }
  function pickLang(o, lang) { if (o && typeof o === 'object') return o[lang] || o.en || o.ar || ''; return o; }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // minutes and seconds with correct Arabic number agreement (digits are always Western)
  function fmtMinutes(n, lang) {
    n = num(n); if (n === null) return '';
    n = Math.round(n);
    if (lang === 'ar') {
      if (n < 1) return 'أقل من دقيقة';
      if (n === 1) return 'دقيقة واحدة';
      if (n === 2) return 'دقيقتين';
      return n + (n <= 10 ? ' دقائق' : ' دقيقة');
    }
    if (lang === 'en' || !MIN_WORD[lang]) return n < 1 ? 'under 1 min' : n + ' min';
    return Math.max(1, n) + ' ' + MIN_WORD[lang];
  }
  function fmtDuration(sec, lang) {
    sec = num(sec); if (sec === null) return '';
    sec = Math.max(0, Math.round(sec));
    if (sec >= 90 || (lang !== 'ar' && lang !== 'en')) return fmtMinutes(Math.max(1, Math.round(sec / 60)), lang);
    if (lang === 'ar') { if (sec === 1) return 'ثانية واحدة'; if (sec === 2) return 'ثانيتين'; return sec + (sec <= 10 ? ' ثوانٍ' : ' ثانية'); }
    return sec + ' s';
  }
  function fmtSteps(n, lang) {
    n = num(n); if (n === null) return ''; n = Math.round(n);
    if (lang === 'ar') { if (n === 1) return 'خطوة واحدة'; if (n === 2) return 'خطوتين'; return n + (n <= 10 ? ' خطوات' : ' خطوة'); }
    return n + (n === 1 ? ' step' : ' steps');
  }
  function fmtKm(v) { var n = num(v); if (n === null) return String(v); var r = Math.round(n * 10) / 10; return String(r); }

  // does `vars` carry what the token needs?
  function hasVar(vars, t) {
    if (!vars) return false;
    var g = function (k) { return vars[k] !== undefined && vars[k] !== null && vars[k] !== ''; };
    if (t === 'mins') return g('mins') || g('n') || g('min');
    if (t === 'mins2') return g('mins2') || g('min2');
    if (t === 'gain') return g('gain') || g('gainSec');
    if (t === 'sec') return g('sec');
    return g(t);
  }
  function varText(vars, t, lang) {
    var v;
    if (t === 'mins') { v = vars.mins !== undefined ? vars.mins : (vars.n !== undefined ? vars.n : vars.min); return typeof v === 'string' && num(v) === null ? v : fmtMinutes(v, lang); }
    if (t === 'mins2') { v = vars.mins2 !== undefined ? vars.mins2 : vars.min2; return typeof v === 'string' && num(v) === null ? v : fmtMinutes(v, lang); }
    if (t === 'gain') { v = vars.gain !== undefined ? vars.gain : vars.gainSec; return typeof v === 'string' && num(v) === null ? v : fmtDuration(v, lang); }
    if (t === 'sec') return fmtDuration(vars.sec, lang);
    if (t === 'steps') return num(vars.steps) === null ? String(pickLang(vars.steps, lang)) : fmtSteps(vars.steps, lang);
    if (t === 'km' || t === 'km2') return fmtKm(vars[t]);
    v = vars[t];
    if (t === 'unit' && typeof v === 'string' && P['u.' + v]) return resolve('u.' + v, lang, {}).text;
    if (t === 'noun' && typeof v === 'string' && P['un.' + v]) return resolve('un.' + v, lang, {}).text;
    if (t === 'reason' && typeof v === 'string' && P['o.reason.' + v]) return resolve('o.reason.' + v, lang, {}).text;
    if (t === 'need' && typeof v === 'string' && P['o.need.' + v]) return resolve('o.need.' + v, lang, {}).text;
    if (t === 'turn' && typeof v === 'string' && TURN[v]) return TURN[v][lang === 'ar' ? 'ar' : 'en'];
    return String(pickLang(v, lang));
  }
  function tokensOf(s) { var out = [], m, re = /\{(\w+)\}/g; while ((m = re.exec(s))) out.push(m[1]); return out; }

  // resolve one phrase id in one language. Returns {text, id, alt, entry} or null when that language has no text for it
  // (a draft language: the phrase simply is not part of its core set). A missing placeholder switches to the phrase's generic twin (`alt`).
  function resolve(id, lang, vars, depth) {
    var e = P[id]; if (!e) return null;
    depth = depth || 0; if (depth > 4) return null;
    var text = e[lang];
    if (!text) return e.alt ? resolve(e.alt, lang, vars, depth + 1) : null;
    var toks = tokensOf(text);
    for (var i = 0; i < toks.length; i++) {
      if (!hasVar(vars, toks[i])) { if (e.alt) return resolve(e.alt, lang, vars, depth + 1); break; }
    }
    var out = text.replace(/\{(\w+)\}/g, function (m, t) { return hasVar(vars, t) ? varText(vars, t, lang) : m; });
    return { text: out, id: id, entry: e, usedAlt: depth > 0 };
  }

  var ACTION_OF = {};
  Object.keys(ACTION_MAP).forEach(function (k) { var a = ACTION_MAP[k]; ACTION_OF[a.hazard + '.' + a.level + '.' + a.persona] = ACTION_OF[a.hazard + '.' + a.level + '.' + a.persona] || k; });

  function mergeCell(base, ov) { var c = {}, k; for (k in base) c[k] = base[k]; if (ov) for (k in ov) c[k] = ov[k]; return c; }
  // the cell for (hazard, level, persona, variant), before language
  function cellFor(hz, lv, ps, variant) {
    var L = PLAY[hz] && PLAY[hz][lv]; if (!L) return null;
    var ov = L.by[ps] || null;
    var c = mergeCell(L.base, null);
    var V = variant && VARIANTS[hz] && VARIANTS[hz][variant] && VARIANTS[hz][variant][lv];
    if (V && (VARIANT_PERSONAS[ps] || !ov)) c = mergeCell(c, V);
    else if (ov) c = mergeCell(c, ov);
    // a variant on top of a persona that has its own cell only keeps the persona's text; formats still apply
    var D = LEVEL_DEFAULT[lv];
    if (!c.vib) c.vib = D.vib; if (!c.flash) c.flash = D.flash; if (!c.tone) c.tone = D.tone;
    c.more = c.more || []; c.pics = c.pics || []; c.voice = c.voice || null; c.wake = c.wake || 'none';
    return c;
  }
  function personaApplies(ps, hz, lang) {
    var P_ = PERSONA[ps];
    if (!P_) return false;
    if (P_.hazards && P_.hazards.indexOf(hz) < 0) return false;
    if (lang && P_.langs && P_.langs.indexOf(lang) < 0) return false;
    return true;
  }
  function collect(set, entry) { if (!entry) return; if (entry.src) entry.src.forEach(function (s) { set[s] = 1; }); }

  function speechClean(s) { return String(s).replace(/\s+[—–]\s+/g, '. ').replace(/\. ([a-z])/g, function (m, c) { return '. ' + c.toUpperCase(); }).replace(/\s*·\s*/g, ', ').replace(/([!?؟.])\.(\s|$)/g, '$1$2').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim(); }

  // The text of a message follows ONE persona (safety first: the wheelchair text never says "use the stairs"); other needs a person has
  // (Deaf, blind, older…) only change the FORMAT: strobe opt-in, voice, vibration strength. needs = ['deaf','blind',…]
  var TEXT_PRIORITY = ['wheelchair', 'child', 'blind', 'deaf', 'elderly', 'worker', 'adult'];
  function personaFromNeeds(needs) {
    var list = (needs || []).map(normPersona);
    var text = TEXT_PRIORITY.filter(function (x) { return list.indexOf(x) >= 0; })[0] || 'adult';
    return { text: text, formats: list.filter(function (x) { return x !== text; }), asleep: (needs || []).indexOf('asleep') >= 0 || list.indexOf('asleep') >= 0 };
  }
  function formatProfile(ps, needs) {
    var ids = [ps].concat((needs || []).map(normPersona)).filter(function (x, i, a) { return PERSONA[x] && a.indexOf(x) === i; });
    var prof = { formats: [], vibBoost: false, flashOptIn: false, voice: 'off', deaf: false, blind: false };
    var order = { off: 0, 'on-demand': 1, auto: 2 };
    ids.forEach(function (id) {
      var p_ = PERSONA[id];
      p_.formats.forEach(function (f) { if (prof.formats.indexOf(f) < 0) prof.formats.push(f); });
      prof.vibBoost = prof.vibBoost || !!p_.vibBoost; prof.flashOptIn = prof.flashOptIn || !!p_.flashOptIn;
      if (order[p_.voice] > order[prof.voice]) prof.voice = p_.voice;
      if (id === 'deaf') prof.deaf = true; if (id === 'blind') prof.blind = true;
    });
    if (prof.deaf) prof.formats = prof.formats.filter(function (f) { return f !== 'sound'; });
    if (prof.deaf && prof.voice === 'auto' && !prof.blind && ids.indexOf('child') < 0) prof.voice = 'on-demand';
    if (prof.blind && prof.formats.indexOf('voice') < 0) prof.formats.push('voice');
    if (prof.deaf && prof.formats.indexOf('strobe') < 0) prof.formats.unshift('strobe');
    return prof;
  }

  // the full message for one (hazard, level, persona, language). Returns null when the persona or language does not apply.
  function build(hz, lv, ps, lang, o) {
    o = o || {};
    if (!personaApplies(ps, hz, lang)) return null;
    var cell = cellFor(hz, lv, ps, o.variant); if (!cell) return null;
    var persona = PERSONA[ps], vars = o.vars || {}, draft = isDraftLang(lang), fp = formatProfile(ps, o.needs);
    var asleep = !!(o.asleep || persona.asleep || (o.needs && o.needs.indexOf('asleep') >= 0)), partial = false, srcSet = {}, review = {};
    function note(r) { if (r && r.entry) { collect(srcSet, r.entry); if (r.entry.review) review[r.entry.review] = 1; } return r; }

    var hr = note(resolve(cell.h, lang, vars));
    if (!hr) { partial = true; hr = note(resolve(PLAY[hz][lv].base.h, lang, vars)); }
    var headline = hr ? hr.text : '';
    var lines = [], dropped = 0;
    cell.i.forEach(function (id) { var r = note(resolve(id, lang, vars)); if (r && r.text) lines.push(r.text); else dropped++; });
    lines = lines.filter(function (t, k) { return lines.indexOf(t) === k; });
    if (dropped) partial = true;
    if (!lines.length) {
      PLAY[hz][lv].base.i.forEach(function (id) { var r = note(resolve(id, lang, vars)); if (r && r.text) lines.push(r.text); });
    }
    var more = [];
    cell.more.forEach(function (id) { var r = note(resolve(id, lang, vars)); if (r && r.text) more.push(r.text); });

    // wake-up prefix for sleepers (and for any persona with asleep:true) when the cell wakes people
    if (asleep && cell.wake !== 'none' && (lv === 'warning' || lv === 'evacuate')) {
      var wp = resolve('x.wake_prefix', lang, vars);
      if (wp) headline = wp.text + ' ' + headline;
    }

    // vibration
    var vibId = cell.vib, vib0 = cell.vib;
    if (fp.vibBoost && (vib0 === 'warn' || vib0 === 'evac')) vibId = 'strong';
    if (asleep && cell.wake !== 'none' && vib0 === 'evac') vibId = 'wake';
    // flash / light (every flashing pattern is opt-in and has a steady fallback)
    var flashId = cell.flash;
    if (fp.flashOptIn && (lv === 'evacuate' || lv === 'warning')) flashId = lv === 'evacuate' ? 'strobe-optin' : 'pulse-slow';
    var F = FLASH[flashId];
    var flash = { id: flashId, kind: F.kind, optIn: !!F.optIn, token: F.token || null, fallback: F.fallback || null, onMs: F.onMs || null, offMs: F.offMs || null,
      maxPerSecond: F.kind === 'flash' ? 1000 / (F.onMs + F.offMs) : 0, warning: F.warning ? pickLang(F.warning, lang === 'ar' ? 'ar' : 'en') : null };
    if (flash.optIn) srcSet.S57 = 1;

    // voice script (optional): headline + lines + spoken extras for the blind persona
    var voice = null;
    if (fp.voice !== 'off') {
      var head = speechClean(headline), strip = function (x) { return x.replace(/[.!?؟،,؛;:]+$/g, '').trim(); };
      var parts = [head].concat(lines.map(speechClean).filter(function (x) { return head.indexOf(strip(x)) < 0; }));
      var extras = cell.voice ? cell.voice.slice() : [];
      if (fp.blind && ps !== 'blind' && !extras.length) { var bc = cellFor(hz, lv, 'blind', o.variant); if (bc && bc.voice) extras = bc.voice.slice(); }
      if (fp.blind && !extras.length && (lv === 'warning' || lv === 'evacuate')) extras = ['v.blind.guide'];
      extras.forEach(function (id) { var r = resolve(id, lang, vars); if (r) { parts.push(speechClean(r.text)); } });
      voice = { lang: LANG[lang].bcp47, fallback: LANG[lang].speech.slice(), text: parts.join('. ').replace(/\.\./g, '.'), auto: fp.voice === 'auto' && (lv === 'warning' || lv === 'evacuate'), rate: 0.95, draft: draft };
    }

    var formats = fp.formats.slice();
    if (asleep && formats.indexOf('sound') < 0 && !fp.deaf) formats.push('sound');

    var wake = { mode: cell.wake, appliesToThisPerson: asleep && cell.wake !== 'none', stepSec: LADDER.stepSec, steps: [] };
    if (cell.wake === 'ladder' && !o.noLadder) wake.steps = ladderSteps(hz, ps, lang, vars, { stepSec: LADDER.stepSec, needs: o.needs });
    if (cell.wake === 'ladder') srcSet.S56 = 1;

    var pictograms = cell.pics.map(function (id) { return { id: id, label: pickLang(PIC[id] ? PIC[id].name : '', lang === 'ar' ? 'ar' : 'en') }; });
    var sources = Object.keys(srcSet).sort().map(function (id) { return { id: id, label: SOURCES[id] ? pickLang(SOURCES[id].short, lang === 'ar' ? 'ar' : 'en') : id }; });

    return {
      key: hz + '.' + lv + '.' + ps, hazard: hz, level: lv, persona: ps, variant: o.variant || null, asleep: asleep,
      lang: lang, dir: LANG[lang].dir, draft: draft, status: LANG[lang].status, partial: draft ? partial : false, tone: cell.tone,
      headline: headline, lines: lines, more: more, text: [headline].concat(lines).join(' '),
      pictograms: pictograms,
      vibration: { id: vibId, pattern: VIBRATION[vibId].pattern.slice() },
      flash: flash, voice: voice, formats: formats, wake: wake, sources: sources, review: Object.keys(review).sort(),
      action: ACTION_OF[hz + '.' + lv + '.' + ps] || ACTION_OF[hz + '.' + lv + '.adult'] || null
    };
  }

  /* ---------- the ladder ---------- */
  function ladderSteps(hz, ps, lang, vars, o) {
    o = o || {};
    var stepSec = o.stepSec || LADDER.stepSec, fp = formatProfile(PERSONA[ps] ? ps : 'adult', o.needs);
    var cell = cellFor(hz, 'evacuate', personaApplies(ps, hz, lang) ? ps : 'adult');
    var ev = build(hz, 'evacuate', personaApplies(ps, hz, lang) ? ps : 'adult', lang, { vars: vars, asleep: true, noLadder: true, needs: o.needs });
    var steps = [];
    LADDER.steps.forEach(function (S) {
      var title = S.title ? resolve(S.title, lang, vars) : null;
      var text = resolve(S.text, lang, vars);
      var formats = S.formats.filter(function (f) { return f !== 'sound' || !fp.deaf; }).filter(function (f) { return f !== 'strobe' || fp.flashOptIn; });
      if (fp.blind && formats.indexOf('voice') < 0) formats.push('voice');
      var step = {
        step: S.step, tSec: S.step * stepSec, audience: S.audience.slice(), formats: formats,
        title: S.step === 0 ? (ev ? ev.headline : '') : (title ? title.text : ''), text: text ? text.text : '',
        guardText: S.guard ? (resolve(S.guard, lang, vars) || { text: '' }).text : null,
        operatorText: S.operator ? (resolve(S.operator, lang, vars) || { text: '' }).text : null,
        vibration: { id: S.vib, pattern: VIBRATION[S.vib].pattern.slice() }, louder: !!S.loud, light: !!S.light,
        flash: S.step === 0 && fp.flashOptIn ? 'strobe-optin' : 'steady-red', stopsOn: 'awake'
      };
      steps.push(step);
    });
    return steps;
  }
  function ladder(o) {
    o = o || {};
    var hz = normHazard(o.hazard) || 'fire', ps = normPersona(o.persona), lang = normLang(o.lang);
    var chain = [lang, 'en', 'ar'].filter(function (x, i, a) { return a.indexOf(x) === i; });
    var served = chain.filter(function (l) { return personaApplies(ps, hz, l) || personaApplies('adult', hz, l); })[0] || 'en';
    var steps = ladderSteps(hz, ps, served, o.vars || {}, { stepSec: o.stepSec, needs: o.needs });
    var stop = resolve('x.ladder.stop', served, {});
    return { hazard: hz, persona: ps, lang: served, requestedLang: lang, fallback: served !== lang, draft: isDraftLang(served), stepSec: o.stepSec || LADDER.stepSec,
      mode: (cellFor(hz, 'evacuate', 'adult') || {}).wake, sound: { pattern: LADDER.sound.pattern, hz: LADDER.sound.hz, note: pickLang(LADDER.sound.note, served === 'ar' ? 'ar' : 'en'), src: LADDER.sound.src.slice() },
      steps: steps, stopText: stop ? stop.text : '' };
  }

  /* ====================================================================================
   * 14. PUBLIC FUNCTIONS
   * ==================================================================================== */
  function get(o) {
    o = o || {};
    var hz = null, lv = null, ps = null;
    if (o.action && ACTION_MAP[o.action]) { var a = ACTION_MAP[o.action]; hz = a.hazard; lv = a.level; ps = a.persona; }
    hz = normHazard(o.hazard) || hz; lv = normLevel(o.level) || lv || 'watch';
    if (!hz) return null;
    var needs = Array.isArray(o.needs) ? o.needs : null, asleepNeed = false;
    if (needs && !o.persona && !ps) { var pn = personaFromNeeds(needs); ps = pn.text; needs = pn.formats; asleepNeed = pn.asleep; }
    else if (needs) { asleepNeed = needs.indexOf('asleep') >= 0; }
    ps = o.persona ? normPersona(o.persona) : (ps || 'adult');
    if (!personaApplies(ps, hz)) ps = 'adult';
    var want = normLang(o.lang), chain = [want, 'en', 'ar'].filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    var msg = null, i;
    for (i = 0; i < chain.length && !msg; i++) {
      var m = build(hz, lv, ps, chain[i], { vars: o.vars, variant: o.variant, asleep: o.asleep || asleepNeed, noLadder: o.noLadder, needs: needs });
      if (m && m.headline && m.lines.length) msg = m;
    }
    if (!msg) return null;
    msg.requestedLang = want; msg.fallback = msg.lang !== want;
    if (msg.draft) msg.draftNotice = pickLang(DRAFT_NOTICE, 'en') + ' · ' + pickLang(DRAFT_NOTICE, 'ar');
    if (o.also || (msg.draft && o.also !== false)) {
      msg.also = {};
      ['ar', 'en'].forEach(function (l) { var x = build(hz, lv, ps, l, { vars: o.vars, variant: o.variant, asleep: o.asleep || asleepNeed, noLadder: true, needs: needs }); if (x) msg.also[l] = { headline: x.headline, lines: x.lines, more: x.more }; });
    }
    return msg;
  }
  function bundle(o) {
    o = o || {};
    var primary = get(o), out = { primary: primary };
    ['ar', 'en'].forEach(function (l) { out[l] = get(Object.assign({}, o, { lang: l, also: false })); });
    return out;
  }
  function byAction(key) { var a = ACTION_MAP[key]; return a ? { hazard: a.hazard, level: a.level, persona: a.persona } : null; }

  function text(id, lang, vars) {
    lang = normLang(lang);
    var chain = [lang, 'en', 'ar'].filter(function (x, i, a) { return a.indexOf(x) === i; });
    for (var i = 0; i < chain.length; i++) { var r = resolve(id, chain[i], vars || {}); if (r) return r.text; }
    return '';
  }
  function strings(prefixes) {
    prefixes = prefixes || ['ui.', 'c.', 'hc.', 'st.', 'u.', 'un.', 'r.', 'o.', 'drone.'];
    var out = {};
    Object.keys(P).forEach(function (id) {
      if (!prefixes.some(function (x) { return id.indexOf(x) === 0; })) return;
      var e = P[id]; if (/\{\w+\}/.test(e.ar + e.en)) return;
      out['msg.' + id] = { ar: e.ar, en: e.en };
    });
    return out;
  }

  var dispatchApi = {
    kinds: function () { return ['fire', 'ambulance', 'police', 'rescue', 'hospital', 'hazmat', 'volunteer'].map(function (k) { return { id: k, label: T(P['u.' + k].ar, P['u.' + k].en), noun: T(P['un.' + k] ? P['un.' + k].ar : P['u.' + k].ar, P['un.' + k] ? P['un.' + k].en : P['u.' + k].en) }; }); },
    unit: function (kind, lang) { return text('u.' + kind, lang); },
    noun: function (kind, lang) { return text('un.' + kind, lang); },
    state: function (state, lang) { return text('st.' + state, lang); },
    reason: function (code, lang) { return text('o.reason.' + code, lang); },
    need: function (code, lang) { return text('o.need.' + code, lang); },
    plan: function (hazard) { var hz = normHazard(hazard); return hz ? clone(DISPATCH_PLAN[hz]) : []; },
    // calm resident line: o = { kind, state, n (minutes), lang, update (ETA changed materially), cordon (police closing the road) }
    resident: function (o) {
      o = o || {}; var lang = o.lang || 'ar', kind = o.kind, st = o.state || 'en-route', n = o.n !== undefined ? o.n : o.min;
      if (st === 'recommended') return null;                                  // residents never see an unapproved recommendation
      if (!P['u.' + kind]) return null;
      if (kind === 'police' && o.cordon) return text('r.cordon.police', lang);
      if (st === 'cleared') return text('r.cleared', lang, { unit: kind });
      if (st === 'on-scene') return text('r.onscene.' + kind, lang, {}) || null;
      if (n === undefined || n === null) return kind === 'ambulance' ? text('r.onway.ambulance', lang) : null;
      if (o.update) return text('r.update', lang, { unit: kind, n: n });
      return text(kind === 'ambulance' ? 'r.eta.ambulance' : 'r.eta', lang, { unit: kind, n: n });
    },
    operator: function (key, vars, lang) { return text('o.' + key, lang, vars); },
    handoff: function (lang) { var labels = {}; HANDOFF_ORDER.forEach(function (k) { if (P['hc.' + k]) labels[k] = text('hc.' + k, lang); }); return { order: HANDOFF_ORDER.slice(), labels: labels,
      states: { open: text('hc.state.open', lang), smoke: text('hc.state.smoke', lang), fire: text('hc.state.fire', lang), locked: text('hc.state.locked', lang) } }; }
  };

  function languages() {
    return LANGUAGES.map(function (l) { return { id: l.id, name: clone(l.name), bcp47: l.bcp47, speech: l.speech.slice(), dir: l.dir, status: l.status, draft: l.status !== 'complete', reviewed: l.reviewed, country: l.country,
      notice: l.status !== 'complete' ? clone(DRAFT_NOTICE) : null, note: l.note ? clone(l.note) : null }; });
  }
  function personaFor(simKey) { var p_ = PEOPLE.filter(function (x) { return x.simKey === simKey || x.id === simKey; })[0]; return p_ ? clone(p_) : null; }

  /* ---------- coverage ---------- */
  var STATUS_CHAR = { complete: 'C', draft: 'D', 'draft-core': 'd', missing: 'M', 'n/a': '.' };
  function cellStatus(hz, ps, lang) {
    if (!personaApplies(ps, hz, lang)) return 'n/a';
    var anyMissing = false, anyPartial = false;
    LEVEL_IDS.forEach(function (lv) {
      var m = build(hz, lv, ps, lang, { noLadder: true });
      if (!m || !m.headline || !m.lines.length) anyMissing = true; else if (m.partial) anyPartial = true;
    });
    if (anyMissing) return 'missing';
    if (!isDraftLang(lang)) return 'complete';
    return anyPartial ? 'draft-core' : 'draft';
  }
  function coverage() {
    var langs = LANGUAGES.map(function (l) { return l.id; }), rows = [], totals = {};
    langs.forEach(function (l) { totals[l] = { complete: 0, draft: 0, 'draft-core': 0, missing: 0, 'n/a': 0 }; });
    HAZARDS.forEach(function (h) {
      PERSONAS.forEach(function (ps) {
        var cells = {};
        langs.forEach(function (l) { var s = cellStatus(h.id, ps.id, l); cells[l] = s; totals[l][s]++; });
        rows.push({ hazard: h.id, persona: ps.id, cells: cells });
      });
    });
    var pad = function (s, n) { s = String(s); while (s.length < n) s += ' '; return s; };
    var lines = ['MANARA_MSG coverage (hazard × persona × language; each cell = all four levels)',
      'C = complete (ar/en)   D = draft, needs native-speaker review   d = draft with core text only (persona extras only in ar/en)   M = missing   . = not applicable',
      '', pad('hazard', 8) + pad('persona', 12) + langs.map(function (l) { return pad(l, 3); }).join('')];
    var last = '';
    rows.forEach(function (r) {
      if (last && last !== r.hazard) lines.push('');
      lines.push(pad(r.hazard === last ? '' : r.hazard, 8) + pad(r.persona, 12) + langs.map(function (l) { return pad(STATUS_CHAR[r.cells[l]], 3); }).join(''));
      last = r.hazard;
    });
    lines.push('', 'totals per language (cells): ' + langs.map(function (l) { var t = totals[l]; return l + ' C' + t.complete + ' D' + t.draft + ' d' + t['draft-core'] + ' M' + t.missing + ' .' + t['n/a']; }).join(' | '));
    return { langs: langs, hazards: HAZARDS.map(function (h) { return h.id; }), personas: PERSONAS.map(function (x) { return x.id; }), levels: LEVEL_IDS.slice(), rows: rows, totals: totals, chars: clone(STATUS_CHAR), text: lines.join('\n') };
  }

  /* ---------- validation ---------- */
  function validVibration(pat, id) {
    if (!Array.isArray(pat)) return 'not an array';
    if (!pat.length) return id === 'none' ? null : 'empty pattern';
    if (pat.length > 17) return 'more than 17 elements';
    var sum = 0;
    for (var i = 0; i < pat.length; i++) { var v = pat[i]; if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v <= 0 || v > 2000) return 'element ' + i + ' = ' + v; sum += v; }
    return sum > 8000 ? 'total ' + sum + ' ms > 8000' : null;
  }
  function flashProblem(id, F) {
    if (!F) return 'unknown flash id ' + id;
    if (F.kind === 'steady' || F.kind === 'none') return null;
    if (F.kind === 'flash') {
      if (!F.optIn) return id + ' flashes but is not opt-in';
      if (!(F.onMs > 0 && F.offMs > 0)) return id + ' has no on/off times';
      if (1000 / (F.onMs + F.offMs) > 3) return id + ' flashes more than 3 times a second';
      if (!F.fallback || !FLASH[F.fallback] || FLASH[F.fallback].kind !== 'steady') return id + ' has no steady fallback';
      if (!F.warning) return id + ' has no photosensitivity warning';
      return null;
    }
    if (F.kind === 'signature') {
      var per = (F.events || []).filter(function (e) { return e.atMs < 1000; }).length, per2 = (F.events || []).filter(function (e) { return e.atMs >= 1000 && e.atMs < 2000; }).length;
      return Math.max(per, per2) > 3 ? id + ' flashes more than 3 times a second' : null;
    }
    return id + ' has an unknown kind';
  }
  var BANNED = [/world[- ]first/i, /\bthe first(?![- ]aid)\b/i, /\bfirst[- ]ever\b/i, /\bfirst of its kind\b/i, /saves? (?:\d+ )?lives/i, /\bAI[- ]powered\b/i, /deep learning/i, /artificial intelligence/i, /ذكاء اصطناعي/, /الأول من نوعه/, /ينقذ أرواح/];
  var AR_RE = /[\u0600-\u06FF]/, LATIN_RE = /[A-Za-z]/;

  function validate() {
    var errors = [], warnings = [], counts = { phrases: 0, cells: 0, messages: 0, draftMessages: 0, variants: 0 };
    LOAD_ERRORS.forEach(function (e) { errors.push('load: ' + e); });
    // vocab
    var seen = {}; PICTOGRAMS.forEach(function (x) { if (seen[x.id]) errors.push('duplicate pictogram id ' + x.id); seen[x.id] = 1; if (!x.name.ar || !x.name.en) errors.push('pictogram ' + x.id + ' lacks a label'); });
    Object.keys(VIBRATION).forEach(function (id) { var pr = validVibration(VIBRATION[id].pattern, id); if (pr) errors.push('vibration ' + id + ': ' + pr); });
    Object.keys(FLASH).forEach(function (id) { var pr = flashProblem(id, FLASH[id]); if (pr) errors.push('flash: ' + pr); });
    // languages
    LANGUAGES.forEach(function (l) { if (l.id !== 'ar' && l.id !== 'en' && l.status !== DRAFT) errors.push('language ' + l.id + ' must be flagged ' + DRAFT); if ((l.id === 'ar' || l.id === 'en') && l.status !== 'complete') errors.push('language ' + l.id + ' must be complete'); });
    // phrases
    Object.keys(P).forEach(function (id) {
      counts.phrases++;
      var e = P[id];
      if (!e.ar || !e.en) errors.push('phrase ' + id + ' lacks ar or en');
      DRAFT_ORDER.forEach(function (l) { if (e[l] !== undefined && (typeof e[l] !== 'string' || !e[l].trim())) errors.push('phrase ' + id + ' has an empty ' + l + ' string'); });
      if (e.alt && !P[e.alt]) errors.push('phrase ' + id + ' alt ' + e.alt + ' does not exist');
      LANGUAGES.forEach(function (l) {
        var s = e[l.id]; if (!s) return;
        tokensOf(s).forEach(function (t) { if (!KNOWN_TOKENS[t]) errors.push('phrase ' + id + '/' + l.id + ' uses unknown placeholder {' + t + '}'); });
        if (/[{}]/.test(s.replace(/\{\w+\}/g, ''))) errors.push('phrase ' + id + '/' + l.id + ' has a stray brace');
        BANNED.forEach(function (re) { if (re.test(s)) errors.push('phrase ' + id + '/' + l.id + ' contains a banned claim: ' + re); });
      });
      if (e.ar && !AR_RE.test(e.ar)) errors.push('phrase ' + id + ' Arabic has no Arabic script');
      if (e.en && !LATIN_RE.test(e.en)) errors.push('phrase ' + id + ' English has no Latin letters');
      (e.src || []).forEach(function (s) { if (!SOURCES[s]) errors.push('phrase ' + id + ' cites unknown source ' + s); });
      var nToks = tokensOf(e.ar + ' ' + e.en);
      if (nToks.length && !e.alt && !/^(r\.|o\.|ui\.|c\.|hc\.)/.test(id)) warnings.push('phrase ' + id + ' has placeholders but no alt twin');
    });
    // playbook
    HAZARDS.forEach(function (h) {
      LEVEL_IDS.forEach(function (lv) {
        var L = PLAY[h.id] && PLAY[h.id][lv];
        if (!L) { errors.push('playbook: no cell for ' + h.id + '.' + lv); return; }
        var all = [{ n: h.id + '.' + lv + '.base', c: L.base }];
        Object.keys(L.by).forEach(function (ps) { if (!PERSONA[ps]) errors.push('playbook ' + h.id + '.' + lv + ' has unknown persona ' + ps); all.push({ n: h.id + '.' + lv + '.' + ps, c: mergeCell(L.base, L.by[ps]) }); });
        ((VARIANTS[h.id] || {}) && Object.keys(VARIANTS[h.id] || {})).forEach(function (v) { var vc = VARIANTS[h.id][v][lv]; if (vc) { counts.variants++; all.push({ n: h.id + '.' + lv + '.variant:' + v, c: mergeCell(L.base, vc) }); } });
        all.forEach(function (x) {
          counts.cells++;
          var c = x.c;
          [c.h].concat(c.i || [], c.more || [], c.voice || []).forEach(function (id) { if (!P[id]) errors.push('cell ' + x.n + ' uses unknown phrase ' + id); });
          if (!c.i || c.i.length < 1 || c.i.length > 3) errors.push('cell ' + x.n + ' must have 1–3 instruction lines (has ' + (c.i ? c.i.length : 0) + ')');
          if ((c.more || []).length > 4) errors.push('cell ' + x.n + ' has more than 4 detail lines');
          if (!c.pics || c.pics.length < 1 || c.pics.length > 5) errors.push('cell ' + x.n + ' needs 1–5 pictograms');
          (c.pics || []).forEach(function (id) { if (!PIC[id]) errors.push('cell ' + x.n + ' uses unknown pictogram ' + id); });
          if (c.vib && !VIBRATION[c.vib]) errors.push('cell ' + x.n + ' uses unknown vibration ' + c.vib);
          if (c.flash && !FLASH[c.flash]) errors.push('cell ' + x.n + ' uses unknown flash ' + c.flash);
          if (c.wake && ['none', 'soft', 'ladder'].indexOf(c.wake) < 0) errors.push('cell ' + x.n + ' has bad wake mode ' + c.wake);
        });
      });
    });
    // every message that can be asked for
    HAZARDS.forEach(function (h) {
      LEVEL_IDS.forEach(function (lv) {
        PERSONAS.forEach(function (ps) {
          LANGUAGES.forEach(function (l) {
            if (!personaApplies(ps.id, h.id, l.id)) return;
            var m = build(h.id, lv, ps.id, l.id, { noLadder: true });
            var tag = h.id + '.' + lv + '.' + ps.id + '/' + l.id;
            if (!m) { if (l.status === 'complete') errors.push('no message for ' + tag); return; }
            counts.messages++; if (m.draft) counts.draftMessages++;
            if (!m.headline) errors.push(tag + ': empty headline');
            if (!m.lines.length) errors.push(tag + ': no instruction line');
            if (m.lines.length > 3) errors.push(tag + ': more than 3 lines');
            if (/\{\w+\}/.test(m.headline + m.lines.join('') + m.more.join(''))) errors.push(tag + ': unresolved placeholder');
            var vp = validVibration(m.vibration.pattern, m.vibration.id); if (vp) errors.push(tag + ': vibration ' + vp);
            var fp = flashProblem(m.flash.id, FLASH[m.flash.id]); if (fp) errors.push(tag + ': ' + fp);
            m.pictograms.forEach(function (x) { if (!PIC[x.id]) errors.push(tag + ': unknown pictogram ' + x.id); });
            if (l.id === 'ar' && !AR_RE.test(m.headline + m.lines.join(''))) errors.push(tag + ': Arabic message without Arabic script');
            if (m.draft && m.status !== DRAFT) errors.push(tag + ': draft not flagged');
            if (m.voice && !m.voice.text) errors.push(tag + ': empty voice text');
            if (m.voice && !/^[a-z]{2,3}-[A-Z]{2}$/.test(m.voice.lang)) errors.push(tag + ': bad voice language tag ' + m.voice.lang);
          });
        });
      });
    });
    // variants and actions
    Object.keys(ACTION_MAP).forEach(function (k) { var a = ACTION_MAP[k]; var g = get({ hazard: a.hazard, level: a.level, persona: a.persona, lang: 'en' }); if (!g) errors.push('action ' + k + ' does not resolve'); });
    [['gas', 'co'], ['gas', 'h2s'], ['flood', 'driver']].forEach(function (hv) { ['warning', 'evacuate'].forEach(function (lv) { ['ar', 'en'].forEach(function (l) { var g = get({ hazard: hv[0], level: lv, variant: hv[1], lang: l }); if (!g || !g.headline) errors.push('variant ' + hv.join(':') + ' ' + lv + '/' + l + ' failed'); }); }); });
    // people, ladder
    PEOPLE.forEach(function (x) { if (!PERSONA[x.persona]) errors.push('person ' + x.id + ' has unknown persona'); if (!LANG[x.lang]) errors.push('person ' + x.id + ' has unknown language'); if (!x.story.ar || !x.story.en) errors.push('person ' + x.id + ' lacks a story'); });
    if (LADDER.steps.length !== 4) errors.push('the wake-up ladder must have four steps');
    LADDER.steps.forEach(function (S) { [S.title, S.text, S.guard, S.operator].forEach(function (id) { if (id && !P[id]) errors.push('ladder step ' + S.step + ' uses unknown phrase ' + id); }); if (!VIBRATION[S.vib]) errors.push('ladder step ' + S.step + ' unknown vibration'); });
    // draft languages have their core set
    DRAFT_ORDER.forEach(function (l) { var n = Object.keys(P).filter(function (id) { return P[id][l]; }).length; if (n < 60) warnings.push('draft language ' + l + ' has only ' + n + ' translated phrases'); });
    return { ok: errors.length === 0, errors: errors, warnings: warnings, counts: counts, version: VERSION };
  }

  function table(o) {
    o = o || {}; var lang = normLang(o.lang), ps = normPersona(o.persona), rows = [];
    HAZARDS.forEach(function (h) { LEVEL_IDS.forEach(function (lv) { var m = get({ hazard: h.id, level: lv, persona: ps, lang: lang, variant: o.variant, vars: o.vars, also: false, noLadder: true }); if (m) rows.push({ hazard: h.id, level: lv, headline: m.headline, lines: m.lines, more: m.more, pictograms: m.pictograms.map(function (x) { return x.id; }), tone: m.tone, lang: m.lang, draft: m.draft }); }); });
    return rows;
  }

  /* ---------- 5.99 NATIONAL layer (the whole of Qatar): advisories and resident lines. Same ids and wording as ManaraNational.MSG (js/national.js);
   *            params.muni is a municipality NAME object {ar, en}; every placeholder phrase has a generic twin (alt) for when a value is missing.
   *            The ministerial-decision wording (outdoor-work ban dates) stays in national.js (S18) — it carries dates the number lint would reject here. ---------- */
  ['muni', 'wbgt', 'limit', 'pm10', 'mm', 'min'].forEach(function (k) { KNOWN_TOKENS[k] = 1; });
  p('nat.sim', 'محاكاة (SIM): مواقع الوحدات وتوفّرها والازدحام وحقول الحرارة والغبار والمطر كلها محاكاة؛ الخريطة لقطة من OpenStreetMap', 'SIM: unit positions, availability, traffic and the heat / dust / rain fields are all simulated; the map is a snapshot of OpenStreetMap');
  p('nat.call999', 'في الطوارئ اتصل بـ 999 — منارة ليست خدمة رسمية وهذه المعلومات للاسترشاد فقط', 'In an emergency call 999 — MANARA is not an official service and this is informational only', null, { src: ['S40'] });
  p('nat.adv.heat.warn', '{muni}: إجهاد حراري محتمل (WBGT تقديري {wbgt} °م). خذ فترات راحة واشرب الماء واستظل.', '{muni}: heat stress possible (WBGT estimate {wbgt} °C). Take breaks, drink water, use shade.', null, { alt: 'nat.adv.heat.warn.alt' });
  p('nat.adv.heat.warn.alt', 'إجهاد حراري محتمل. خذ فترات راحة واشرب الماء واستظل.', 'Heat stress possible. Take breaks, drink water, use shade.');
  p('nat.adv.heat.stop', '{muni}: أوقفوا العمل — WBGT التقديري {wbgt} °م فوق حدّ الإيقاف {limit} °م. الرقم القانوني يُقاس بمقياس WBGT.', '{muni}: stop work — WBGT estimate {wbgt} °C is above the {limit} °C stop-work limit. The legal figure is a measured WBGT.', null, { alt: 'nat.adv.heat.stop.alt', src: ['S19'] });
  p('nat.adv.heat.stop.alt', 'أوقفوا العمل في الهواء الطلق — الإجهاد الحراري فوق حدّ الإيقاف. الرقم القانوني يُقاس بمقياس WBGT.', 'Stop outdoor work — heat stress is above the stop-work limit. The legal figure is a measured WBGT.', null, { src: ['S19'] });
  p('nat.adv.dust.warn', '{muni}: غبار مرتفع (الجسيمات العالقة تقديريًا {pm10} ميكروغرام/م³) — ابقَ في الداخل وأغلق النوافذ.', '{muni}: high dust (airborne-particle estimate {pm10} µg/m³) — stay indoors and close windows.', null, { alt: 'nat.adv.dust.warn.alt' });
  p('nat.adv.dust.warn.alt', 'غبار مرتفع — ابقَ في الداخل وأغلق النوافذ.', 'High dust — stay indoors and close windows.');
  p('nat.adv.dust.danger', '{muni}: غبار خطر (الجسيمات العالقة تقديريًا {pm10} ميكروغرام/م³) — أوقف القيادة والعمل في الخارج.', '{muni}: dangerous dust (airborne-particle estimate {pm10} µg/m³) — stop driving and outdoor work.', null, { alt: 'nat.adv.dust.danger.alt' });
  p('nat.adv.dust.danger.alt', 'غبار خطر — أوقف القيادة والعمل في الخارج.', 'Dangerous dust — stop driving and outdoor work.');
  p('nat.adv.dust.critical', '{muni}: غبار حرج (الجسيمات العالقة تقديريًا {pm10} ميكروغرام/م³) — الجأ إلى مبنى مغلق فورًا.', '{muni}: critical dust (airborne-particle estimate {pm10} µg/m³) — get into a closed building now.', null, { alt: 'nat.adv.dust.critical.alt' });
  p('nat.adv.dust.critical.alt', 'غبار حرج — الجأ إلى مبنى مغلق فورًا.', 'Critical dust — get into a closed building now.');
  p('nat.adv.flood.watch', '{muni}: أمطار {mm} مم/س (محاكاة) — ابتعد عن الأنفاق والمعابر المنخفضة.', '{muni}: rain {mm} mm/h (simulated) — keep away from tunnels and low underpasses.', null, { alt: 'nat.adv.flood.watch.alt' });
  p('nat.adv.flood.watch.alt', 'أمطار (محاكاة) — ابتعد عن الأنفاق والمعابر المنخفضة.', 'Rain (simulated) — keep away from tunnels and low underpasses.');
  p('nat.adv.flood.underpass', 'أُغلق {n} نفق/معبر بسبب مياه الأمطار (محاكاة) — لا تعبر الماء.', '{n} underpass(es) closed by rain water (simulated) — never drive through water.', null, { alt: 'nat.adv.flood.underpass.alt' });
  p('nat.adv.flood.underpass.alt', 'أُغلقت أنفاق ومعابر بسبب مياه الأمطار (محاكاة) — لا تعبر الماء.', 'Underpasses closed by rain water (simulated) — never drive through water.');
  p('nat.adv.traffic.heavy', 'ازدحام شديد في أنحاء البلاد (محاكاة): أزمنة الوصول أطول من المعتاد.', 'Heavy traffic across the country (simulated): arrival times are longer than usual.');
  p('nat.unit.state.recommended', 'مُوصى بها', 'Recommended');
  p('nat.unit.state.approved', 'معتمدة', 'Approved');
  p('nat.unit.state.dispatched', 'أُرسلت', 'Dispatched');
  p('nat.unit.state.en-route', 'في الطريق', 'En route');
  p('nat.unit.state.on-scene', 'في الموقع', 'On scene');
  p('nat.unit.state.cleared', 'أُغلقت المهمة', 'Cleared');
  p('nat.resident.eta', '{unit}: الوصول خلال {min} د', '{unit} ETA {min} min', null, { alt: 'nat.resident.eta.alt' });
  p('nat.resident.eta.alt', 'وحدة الاستجابة في الطريق إليك', 'A response unit is on its way');
  p('nat.resident.eta.ambulance', '{unit}: الوصول خلال {min} د — ابقَ مكانك', '{unit} ETA {min} min — stay where you are', null, { alt: 'nat.resident.eta.ambulance.alt' });
  p('nat.resident.eta.ambulance.alt', 'الإسعاف في الطريق إليك — ابقَ مكانك', 'The ambulance is on its way — stay where you are');
  p('nat.resident.onscene', '{unit} وصلت إلى الموقع', '{unit} is on scene', null, { alt: 'nat.resident.onscene.alt' });
  p('nat.resident.onscene.alt', 'وصلت وحدة الاستجابة إلى الموقع', 'A response unit is on scene');

  var api = {
    VERSION: VERSION, DRAFT_STATUS: DRAFT,
    get: get, bundle: bundle, byAction: byAction, actions: function () { return clone(ACTION_MAP); }, ladder: ladder, text: text, fmtMinutes: fmtMinutes, fmtDuration: fmtDuration,
    languages: languages, coverage: coverage, validate: validate, table: table, strings: strings,
    hazards: function () { return clone(HAZARDS); }, levels: function () { return clone(LEVELS); }, levelMeaning: function () { return clone(LEVEL_MEANING); },
    personas: function () { return clone(PERSONAS); }, people: function () { return clone(PEOPLE); }, personaFor: personaFor,
    pictograms: function () { return clone(PICTOGRAMS); }, pictogram: function (id, lang) { var x = PIC[id]; return x ? pickLang(x.name, lang === 'ar' ? 'ar' : 'en') : ''; },
    vibration: function (id) { return VIBRATION[id] ? { id: id, pattern: VIBRATION[id].pattern.slice(), name: clone(VIBRATION[id].name) } : null; },
    vibrations: function () { return clone(VIBRATION); }, flash: function (id) { return FLASH[id] ? clone(FLASH[id]) : null; }, flashes: function () { return clone(FLASH); },
    dispatch: dispatchApi,
    dispatchPlan: function () { return clone(DISPATCH_PLAN); },
    checkin: function (lang) { var out = {}; ['safe', 'help', 'awake', 'got_it', 'counted', 'help_sent', 'undo', 'room', 'privacy'].forEach(function (k) { out[k] = text('c.' + k, lang); }); return out; },
    drone: function (lang) { return { id: 'friendly-drone', flash: clone(FLASH['friendly-drone']), name: text('drone.light.name', lang), description: text('drone.light.desc', lang), meaning: text('drone.light.meaning', lang), note: text('drone.light.note', lang), safe: text('drone.light.safe', lang), pictogram: 'dr-light', sources: ['S57'] }; },
    ui: function (key, lang, vars) { return text('ui.' + key, lang, vars); },
    fill: function (s, vars, lang) { return String(s).replace(/\{(\w+)\}/g, function (m, t) { return hasVar(vars || {}, t) ? varText(vars, t, normLang(lang)) : m; }); },
    ids: function () { return Object.keys(P); }, has: function (id) { return !!P[id]; }, phrase: function (id) { return P[id] ? clone(P[id]) : null; },
    safetyNotes: function () { return clone(SAFETY_NOTES); }, sources: function () { return clone(SOURCES); },
    ladderSpec: function () { return clone(LADDER); }, draftNotice: function () { return clone(DRAFT_NOTICE); },
    personaFromNeeds: function (needs) { return personaFromNeeds(needs); },
    normalize: { hazard: normHazard, level: normLevel, persona: normPersona, lang: normLang }
  };
  root.MANARA_MSG = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
