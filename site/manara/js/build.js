/* MANARA («منارة») — Build guide page  (build.html)  →  window.ManaraBuild
 * ==========================================================================================
 * Classic script (works from file://, no libraries). What it does:
 *   - renders the guide from data tables: overview diagram, tiers, parts + price ranges, wiring
 *     table + pin diagram, bring-up steps with saved ticks, warm-up timers, booth plan, ownership table
 *   - the Board monitor: Web Serial connect (115200 baud) + a live parser/validator for serial
 *     protocol v1 (docs/MANARA-SPEC.md), and a SIMULATED board that writes the same lines, so the
 *     page works with no hardware. Everything the simulation produces is labelled SIM.
 * The firmware lives in kit/ (kit/firmware/manara_sentinel/manara_sentinel.ino). The formulas and the
 * hot-spot rule below are the same as in the firmware and in js/detect.js (tools/manara/test_kit.py checks it).
 * Safety: serial text, log lines and anything typed is only ever put on the page with textContent.
 */
(function () {
  'use strict';
  var Manara = window.Manara;
  if (!Manara) return;
  var $ = Manara.$, $$ = Manara.$$, L = Manara.L;
  var NS = 'http://www.w3.org/2000/svg';
  var M = Math;

  /* =============================================================== small helpers */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function bi(o) {                                   // two spans; CSS shows the active language
    var f = document.createDocumentFragment(), a = el('span', null, o.ar), e = el('span', null, o.en);
    a.setAttribute('data-l', 'ar'); e.setAttribute('data-l', 'en');
    f.appendChild(a); f.appendChild(e);
    return f;
  }
  function sv(tag, attrs, parent, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function svBi(tag, attrs, parent, o) { var a = sv(tag, attrs, parent, o.ar), e = sv(tag, attrs, parent, o.en); a.setAttribute('data-l', 'ar'); e.setAttribute('data-l', 'en'); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function store(k, v) { return Manara.store('manara-build-' + k, v); }
  function jget(k, d) { try { var s = store(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
  function jset(k, v) { try { store(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function num(n, d) { return Manara.num(n, d); }
  function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  function range(lo, hi) { return lo === hi ? num(lo) : num(lo) + '–' + num(hi); }
  function nowMs() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
  function cell(tr, lb, content, cls) {              // table cell with a mobile label (rtable)
    var td = el('td', cls || null), w = el('div', 'cell');
    td.setAttribute('data-lb-ar', lb.ar); td.setAttribute('data-lb-en', lb.en);
    if (content && content.nodeType) w.appendChild(content); else if (content != null) w.textContent = content;
    td.appendChild(w); tr.appendChild(td);
    return w;
  }
  function tag(kind, o) { var t = el('span', 'tag' + (kind ? ' ' + kind : '')); t.appendChild(bi(o)); return t; }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob), a = el('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function T2(ar, en) { return { ar: ar, en: en }; }

  var state = { tier: 2 };                           // default: the sentinel board (Tier 2)
  (function () { var t0 = parseInt(store('tier'), 10); if (t0 >= 1 && t0 <= 3) state.tier = t0; })();

  /* =============================================================== DATA: tiers, parts, pins, steps, ... */
  var TIERS = [
    { n: 1, short: T2('1 · حاسوب فقط', '1 · Laptop only'), name: T2('حاسوب فقط', 'Laptop only'), sub: T2('العرض في المتصفح', 'The browser demo'),
      time: T2('بعد ظهر واحد (تقدير)', 'One afternoon (estimate)'),
      you: [T2('تشغّل غرفة العمليات ومختبر الأدلة وهواتف السكان من الملفات مباشرة.', 'You run Mission Control, the Evidence Lab and the phone wall straight from the files.'),
            T2('سكربت بايثون يشغّل الكاشف على كاميرا الحاسوب.', 'A Python script runs the detector on the laptop camera.')],
      judge: T2('اللجنة تجرّب «تحدَّ الكاشف» وتختار خطرًا وترى منارة تستجيب.', 'Judges try “Fool me if you can”, pick a hazard and watch MANARA respond.') },
    { n: 2, short: T2('2 · لوحة الحارس', '2 · Sentinel board'), name: T2('لوحة الحارس', 'Sentinel board'), sub: T2('ESP32 متعدد الحسّاسات: اللوحة التوأم', 'ESP32 multi-sensor twin board'),
      time: T2('من 2 إلى 3 عطلات أسبوع (تقدير)', '2 to 3 weekends (estimate)'),
      you: [T2('كاميرا حرارية وحرارة/رطوبة وغاز وماء وزر استغاثة وثلاثة مفاتيح مخارج.', 'Thermal camera, temperature/humidity, gas, water, an SOS button and three exit switches.'),
            T2('لافتات خروج WS2812 وحلقة ضوء وصفّارة، وإنذار محلي لا ينتظر أحدًا.', 'WS2812 exit signs, a ring light and a buzzer, with a local alarm that never waits.')],
      judge: T2('الحكم يضغط الكوب الساخن والمسحة والماء ويرى اللوحة تقرّر بمفتاحين.', 'The judge uses the hot mug, the swab and the water and sees the board decide with two keys.') },
    { n: 3, short: T2('3 · كشك كامل', '3 · Full booth'), name: T2('كشك كامل', 'Full booth'), sub: T2('+ رأس متحرك ونقطة تسجيل ومقطع درون اختياري', '+ pan-tilt head, check-in point, optional drone clip'),
      time: T2('عطلتا أسبوع إضافيتان (تقدير)', 'Two more weekends (estimate)'),
      you: [T2('رأس يمسح ويلاحق أسخن نقطة، ولوحة «آمن» بشبكة Wi-Fi دون إنترنت.', 'A head that patrols and tracks the hottest point, and a MANARA-SAFE board with its own offline Wi-Fi.'),
            T2('مقطع درون من مشغّل مرخّص (اختياري) — لا تحلّق بنفسك.', 'A drone clip from a licensed operator (optional) — never fly one yourself.')],
      judge: T2('الحكم ينضم إلى «آمن» من هاتفه فيتحرك العدّاد أمامه.', 'The judge joins MANARA-SAFE from their own phone and the counter moves in front of them.') }
  ];

  // price = estimated US$ for the whole line (qty included). kind: seen | est | own | opt
  var PARTS = [
    { t: 1, n: T2('حاسوب محمول بكاميرا ومتصفح Chrome أو Edge', 'Laptop with a webcam and Chrome or Edge'), q: '1', lo: 0, hi: 0, k: 'own', role: T2('يشغّل الصفحات وكاشف بايثون', 'Runs the pages and the Python detector'), note: T2('Web Serial يحتاج Chrome أو Edge على الحاسوب.', 'Web Serial needs Chrome or Edge on a computer.') },
    { t: 1, n: T2('هواتف (لك ولأصدقائك) لجدار الهواتف', 'Phones (yours and friends’) for the phone wall'), q: '2–4', lo: 0, hi: 0, k: 'own', role: T2('هواتف «السكان» الأربعة', 'The four “resident” phones'), note: T2('لا تطبيق للتثبيت: صفحة ويب.', 'No app to install: it is a web page.') },
    { t: 1, n: T2('بطاقات مطبوعة: لافتة الصدق وبطاقات الخدع', 'Printed cards: the honesty sign and decoy cards'), q: '1', lo: 2, hi: 10, k: 'est', role: T2('للكشك', 'For the booth'), note: T2('طباعة مدرسية أو مكتبة.', 'School or print-shop printing.') },

    { t: 2, n: T2('لوحة ESP32 DevKit بـ 30 أو 38 طرفًا', 'ESP32 DevKit board with 30 or 38 pins (ESP32-WROOM-32)'), q: '1', lo: 5, hi: 12, k: 'seen', role: T2('عقل الحارس', 'The sentinel’s brain'), note: T2('رُصد في متجر أمريكي: US$ 5.68–11.99. اختر لوحة بشريحة USB (CP2102 أو CH340) ونزّل تعريفها.', 'Seen on a US marketplace: US$ 5.68–11.99. Pick one with a USB chip (CP2102 or CH340) and install its driver.') },
    { t: 2, n: T2('كاميرا حرارية MLX90640 (زاوية 55°)', 'MLX90640 thermal camera breakout (55° field of view)'), q: '1', lo: 45, hi: 100, k: 'seen', role: T2('صورة حرارية 32×24: المفتاح الأول للحريق', 'A 32×24 thermal image: the fire’s first key'), note: T2('رُصد: Adafruit US$ 74.95. الوحدات العامة قد تكون أرخص لكن جودتها متفاوتة (نطاق تقديري).', 'Seen: Adafruit US$ 74.95. Generic modules may be cheaper but quality varies (range is an estimate).') },
    { t: 2, n: T2('مستشعر حرارة ورطوبة SHT31', 'SHT31 temperature and humidity breakout'), q: '1', lo: 4, hi: 18, k: 'seen', role: T2('تقدير WBGT ومؤشر الحرارة وتصحيح سرعة الصوت', 'WBGT estimate, heat index, speed-of-sound correction'), note: T2('رُصد: The Pi Hut £13.40 (Adafruit). الوحدات العامة أرخص.', 'Seen: The Pi Hut £13.40 (Adafruit). Generic modules are cheaper.') },
    { t: 2, n: T2('وحدة غاز MQ-2 (بمخرج AO)', 'MQ-2 gas and smoke module (with AO pin)'), q: '1', lo: 2, hi: 7, k: 'seen', role: T2('مؤشر الدخان؛ تستجيب لبخار الكحول', 'Smoke index; responds to alcohol vapour'), note: T2('رُصد: US$ 6.99 عند موزّع واحد.', 'Seen: US$ 6.99 at one reseller.') },
    { t: 2, n: T2('وحدة CO من نوع MQ-7', 'MQ-7 carbon-monoxide module'), q: '1', lo: 3, hi: 7, k: 'seen', role: T2('قراءة غاز ثانية لإنذار الغاز المحلي', 'The second gas reading for the local gas alarm'), note: T2('رُصد: نحو US$ 3 عند موزّع واحد. بدونها يبقى الغاز «اشتباهًا» محليًّا.', 'Seen: about US$ 3 at one reseller. Without it gas stays SUSPECT locally.') },
    { t: 2, n: T2('مستشعر المسافة HC-SR04', 'HC-SR04 ultrasonic sensor'), q: '1', lo: 1, hi: 4, k: 'seen', role: T2('مستوى الماء فوق كوب', 'Water level above a cup'), note: T2('رُصد: نحو US$ 1. ليس مقاومًا للماء: للكوب فقط.', 'Seen: about US$ 1. Not waterproof: cup only.') },
    { t: 2, n: T2('زر استغاثة كبير (مفتوح عادةً)', 'Big SOS push button (normally open)'), q: '1', lo: 1, hi: 5, k: 'est', role: T2('«الحسّاس» الأوثق: قرار إنسان', 'The most reliable “sensor”: a human decision'), note: T2('', '') },
    { t: 2, n: T2('مفاتيح تبديل SPST للمخارج: الدرج أ، الدرج ب، السطح', 'SPST toggle switches for exits: Stair A, Stair B, roof'), q: '3', lo: 2, hi: 6, k: 'est', role: T2('«حقيقة المخرج»: مفتوح أو مقفل', 'Exit truth: open or locked'), note: T2('', '') },
    { t: 2, n: T2('حلقة WS2812B بـ 12 ضوءًا', 'WS2812B ring, 12 LEDs'), q: '1', lo: 3, hi: 8, k: 'seen', role: T2('ضوء المنارة الودود: أخضر ثابت ووميضان أبيضان كل ثانيتين', 'The friendly lighthouse light: steady green, two white flashes every 2 s'), note: T2('رُصد: The Pi Hut £4.60.', 'Seen: The Pi Hut £4.60.') },
    { t: 2, n: T2('شريط WS2812B (تقطع منه 12 بكسل)', 'WS2812B strip (cut 12 pixels from it)'), q: '1', lo: 3, hi: 8, k: 'est', role: T2('ثلاث لافتات خروج (4 بكسل لكل واحدة)', 'Three exit signs (4 pixels each)'), note: T2('', '') },
    { t: 2, n: T2('صفّارة نشطة (فيها مذبذب)', 'Active buzzer (has its own oscillator)'), q: '1', lo: 1, hi: 3, k: 'est', role: T2('إنذار صوتي محلي بثلاث نبضات', 'Local three-pulse sound alarm'), note: T2('الصفّارة الرخيصة لا تصدر نغمة 520 هرتز المفضّلة للإيقاظ (S56).', 'A cheap buzzer cannot make the 520 Hz tone preferred for waking people (S56).') },
    { t: 2, n: T2('مقاومات (10ك و20ك و1ك و2ك و330Ω)، ترانزستور NPN، مكثّف 1000µF، لوح تجارب، أسلاك', 'Resistors (10k, 20k, 1k, 2k, 330 Ω), NPN transistor, 1000 µF capacitor, breadboard, wires'), q: '1 set', lo: 5, hi: 12, k: 'est', role: T2('مقسّمات الجهد وتشغيل الصفّارة وحماية الشريط', 'Voltage dividers, buzzer driver, strip protection'), note: T2('', '') },
    { t: 2, n: T2('شاحن USB 5 فولت أو بنك طاقة محميّ', '5 V USB charger or protected power bank'), q: '1', lo: 0, hi: 12, k: 'own', role: T2('الطاقة (قد تكون عندك)', 'Power (you may already own one)'), note: T2('لا LiPo عارية.', 'No bare LiPo.') },
    { t: 2, n: T2('أدوات الطاولة: كوب خزفي، كوب ماء، قطن، معقّم أيدٍ كحولي، لوح فوم للتوأم', 'Table props: ceramic mug, cup, cotton pads, alcohol hand sanitiser, foam board for the twin'), q: '1 set', lo: 3, hi: 15, k: 'est', role: T2('بدائل الخطر الآمنة', 'The safe hazard stand-ins'), note: T2('انظر «سلامة الكشك».', 'See “Booth safety”.') },

    { t: 3, n: T2('لوحة ESP32 ثانية لنقطة «آمن»', 'Second ESP32 board for MANARA-SAFE'), q: '1', lo: 5, hi: 12, k: 'seen', role: T2('شبكة Wi-Fi «MANARA-SAFE» دون إنترنت', 'The offline “MANARA-SAFE” Wi-Fi'), note: T2('', '') },
    { t: 3, n: T2('محرّكان SG90 صغيران (أفقي ورأسي)', 'Two SG90 micro servos (pan and tilt)'), q: '2', lo: 3, hi: 8, k: 'seen', role: T2('الرأس المتحرك', 'The pan-tilt head'), note: T2('رُصد: US$ 1.69 (Waveshare) إلى 3.29 للقطعة.', 'Seen: US$ 1.69 (Waveshare) to 3.29 each.') },
    { t: 3, n: T2('حامل أفقي-رأسي لمحرّكين SG90', 'Pan-tilt bracket for two SG90'), q: '1', lo: 2, hi: 8, k: 'est', role: T2('يحمل الكاميرا الحرارية', 'Carries the thermal camera'), note: T2('', '') },
    { t: 3, n: T2('مصدر 5 فولت 2 أمبير منفصل للمحرّكات + مكثّف 470–1000µF', 'Separate 5 V 2 A supply for the servos + 470–1000 µF capacitor'), q: '1', lo: 5, hi: 12, k: 'est', role: T2('المحرّكات لا تُغذّى من اللوحة', 'Servos are never powered from the board'), note: T2('أرضي مشترك مع ESP32.', 'Common ground with the ESP32.') },
    { t: 3, n: T2('وحدة MPU6050 (حسّاس سقوط)', 'MPU6050 module (fall sensor)'), q: '1', lo: 2, hi: 8, k: 'opt', role: T2('اختياري: السقوط ثم السكون ثم سؤال «هل أنت بخير؟»', 'Optional: fall, stillness, then “are you OK?”'), note: T2('رُصد: €7.95 (Olimex)، وأقل عند غيره.', 'Seen: €7.95 (Olimex), less elsewhere.') },
    { t: 3, n: T2('حسّاس غبار PMS5003', 'PMS5003 dust sensor'), q: '1', lo: 20, hi: 35, k: 'opt', role: T2('اختياري. وإلا فالغبار محاكاة SIM', 'Optional. Otherwise dust is SIM'), note: T2('رُصد: £24.50 (The Pi Hut).', 'Seen: £24.50 (The Pi Hut).') },
    { t: 3, n: T2('جهاز لوحي لشاشة التسجيل', 'Tablet for the check-in screen'), q: '1', lo: 0, hi: 0, k: 'own', role: T2('يعرض عدّاد /count', 'Shows the /count counter'), note: T2('', '') },
    { t: 3, n: T2('رمز QR مطبوع للانضمام إلى «آمن» + لافتة', 'Printed QR code to join MANARA-SAFE + a sign'), q: '1', lo: 0, hi: 3, k: 'est', role: T2('بديل لمن لا تظهر له صفحة الدخول', 'Fallback when the portal page does not pop up'), note: T2('', '') },
    { t: 3, n: T2('مقطع درون من الدفاع المدني أو مشغّل مرخّص', 'Drone clip from Civil Defence or a licensed operator'), q: '0', lo: 0, hi: 0, k: 'opt', role: T2('اختياري: لا تشترِ درونًا ولا تحلّق', 'Optional: do not buy or fly a drone'), note: T2('اطلب إذنًا كتابيًّا بالاستخدام.', 'Ask for written permission to use it.') }
  ];

  // Pins of the SENTINEL (same numbers as the CONFIG block of manara_sentinel.ino). gpio = null: not a GPIO.
  var PINS = [
    { t: 2, part: 'MLX90640', sig: 'SDA', gpio: 21, grp: 'i2c', note: T2('ناقل I2C رقم 0، جهد 3.3 فولت، العنوان 0x33، يشاركه SHT31.', 'I2C bus 0, 3.3 V, address 0x33, shared with the SHT31.') },
    { t: 2, part: 'MLX90640', sig: 'SCL', gpio: 22, grp: 'i2c', note: T2('اتركها على 400 كيلوهرتز (الشيفرة تضبطها).', 'Runs at 400 kHz (the code sets it).') },
    { t: 2, part: 'MLX90640 / SHT31', sig: 'VIN · GND', gpio: null, pin: '3V3 · GND', grp: 'pwr', note: T2('من طرف 3V3. بعض الوحدات العامة بلا منظّم جهد، فلا تعطها 5 فولت.', 'From the 3V3 pin. Some generic modules have no regulator: never give them 5 V.') },
    { t: 2, part: 'SHT31', sig: 'SDA · SCL', gpio: 21, pin: '21 · 22', grp: 'i2c', note: T2('على الناقل نفسه (العنوان 0x44). ابعده 5 سم عن سخّانات MQ.', 'On the same bus (address 0x44). Keep it 5 cm from the MQ heaters.') },
    { t: 2, part: 'MQ-2', sig: 'AO', gpio: 34, grp: 'gas', note: T2('عبر مقسّم جهد: 10 كيلو من AO ثم 20 كيلو إلى GND، والنقطة الوسطى إلى GPIO34. التغذية 5 فولت.', 'Through a divider: 10 k from AO, then 20 k to GND, middle point to GPIO34. Power 5 V.') },
    { t: 2, part: 'MQ-7', sig: 'AO', gpio: 35, grp: 'gas', note: T2('مقسّم الجهد نفسه (10 كيلو + 20 كيلو). التغذية 5 فولت.', 'Same divider (10 k + 20 k). Power 5 V.') },
    { t: 2, part: 'HC-SR04', sig: 'TRIG', gpio: 23, grp: 'water', note: T2('3.3 فولت تكفي. التغذية 5 فولت.', '3.3 V is enough. Power 5 V.') },
    { t: 2, part: 'HC-SR04', sig: 'ECHO', gpio: 19, grp: 'water', note: T2('إشارة 5 فولت: مقاومة 1 كيلو على التوالي ثم 2 كيلو إلى GND (مقسّم).', 'A 5 V signal: 1 k in series, then 2 k to GND (divider).') },
    { t: 2, part: T2('مفتاح عوّامة (بديل)', 'Float switch (alternative)'), sig: T2('سلك واحد', 'one wire'), gpio: 33, grp: 'water', note: T2('السلك الآخر إلى GND، والمقاومة الداخلية ترفع الطرف.', 'The other wire to GND; the internal pull-up does the rest.') },
    { t: 2, part: T2('زر SOS', 'SOS button'), sig: T2('ساق واحدة', 'one leg'), gpio: 4, grp: 'in', note: T2('الساق الأخرى إلى GND. ضغطة قصيرة = استغاثة؛ 3 ثوانٍ = مسح.', 'The other leg to GND. Short press = SOS; hold 3 s = clear.') },
    { t: 2, part: T2('مفتاح المخرج A (الدرج أ)', 'Exit switch A (Stair A)'), sig: T2('ساق واحدة', 'one leg'), gpio: 13, grp: 'in', note: T2('مغلق إلى GND = «مقفل». بدّل ثابت EXIT_LOCKED_LEVEL إن عكست التوصيل.', 'Closed to GND = “locked”. Flip EXIT_LOCKED_LEVEL if you wired it the other way.') },
    { t: 2, part: T2('مفتاح المخرج B (الدرج ب)', 'Exit switch B (Stair B)'), sig: T2('ساق واحدة', 'one leg'), gpio: 14, grp: 'in', note: T2('كما في A.', 'Same as A.') },
    { t: 2, part: T2('مفتاح المخرج R (السطح)', 'Exit switch R (roof door)'), sig: T2('ساق واحدة', 'one leg'), gpio: 27, grp: 'in', note: T2('كما في A.', 'Same as A.') },
    { t: 2, part: 'WS2812B', sig: 'DIN', gpio: 18, grp: 'out', note: T2('330 أوم على التوالي. الشريط 5 فولت مع مكثّف 1000µF، والأرضي مشترك. 24 بكسل: 3 لافتات × 4 + حلقة 12.', '330 Ω in series. Strip on 5 V with a 1000 µF capacitor, common ground. 24 pixels: 3 signs × 4 + a 12-pixel ring.') },
    { t: 2, part: T2('صفّارة نشطة', 'Active buzzer'), sig: T2('إشارة', 'signal'), gpio: 32, grp: 'out', note: T2('GPIO32 ← 1 كيلو ← قاعدة ترانزستور NPN؛ الباعث إلى GND؛ الصفّارة بين 5 فولت والمجمّع.', 'GPIO32 → 1 k → NPN base; emitter to GND; the buzzer between 5 V and the collector.') },
    { t: 3, part: 'MPU6050', sig: 'SDA', gpio: 25, grp: 'i2c', opt: true, note: T2('ناقل I2C رقم 1 (مستقل كي لا ينتظر الكاميرا الحرارية). 3.3 فولت، وAD0 إلى GND.', 'I2C bus 1 (separate so it never waits for the thermal camera). 3.3 V, AD0 to GND.') },
    { t: 3, part: 'MPU6050', sig: 'SCL', gpio: 26, grp: 'i2c', opt: true, note: T2('', '') },
    { t: 3, part: 'PMS5003', sig: 'TX →', gpio: 16, grp: 'gas', opt: true, note: T2('يصل TX من الحسّاس إلى RX2. التغذية 5 فولت والإشارة 3.3 فولت.', 'The sensor’s TX goes to RX2. Power 5 V, signal 3.3 V.') },
    { t: 3, part: T2('محرّك SG90 الأفقي', 'SG90 pan servo'), sig: T2('إشارة', 'signal'), gpio: 17, grp: 'out', note: T2('الطاقة من المصدر المنفصل 5 فولت، والأرضي مشترك مع ESP32.', 'Power from the separate 5 V supply, ground shared with the ESP32.') },
    { t: 3, part: T2('محرّك SG90 الرأسي', 'SG90 tilt servo'), sig: T2('إشارة', 'signal'), gpio: 5, grp: 'out', note: T2('GPIO5 طرف إقلاع لكنه آمن للإخراج.', 'GPIO5 is a boot-strapping pin but fine as an output.') },
    { t: 3, part: T2('لوحة «آمن» (الثانية)', 'MANARA-SAFE (2nd board)'), sig: 'LED · BOOT', gpio: null, pin: '2 · 0', grp: 'safe', second: true, note: T2('الصمّام المدمج وزر BOOT: لا توصيل. تحتاج USB فقط.', 'The on-board LED and BOOT button: no wiring. Only USB is needed.') }
  ];

  var STEPS = [
    { id: 's1', t: 1, ti: T2('افتح الصفحات دون إنترنت', 'Open the pages with no internet'),
      d: T2('افتح index.html من المجلد مباشرة (أو من أي خادم ساكن). اقطع الإنترنت وأعد التحميل.', 'Open index.html straight from the folder (or any static host). Switch the internet off and reload.'),
      p: T2('تعمل الصفحات الثلاث (غرفة العمليات، مختبر الأدلة، هواتف السكان) وتبدّل اللغة والوضع.', 'The three pages (Mission Control, Evidence Lab, Resident Phones) run and switch language and theme.'),
      f: T2('الخطوط تأتي من الإنترنت لكنها اختيارية: الصفحة تعمل بخط النظام.', 'Fonts come from the internet but are optional: the page falls back to system fonts.') },
    { id: 's2', t: 1, ti: T2('اختبر كاشف بايثون', 'Test the Python detector'),
      d: T2('ثبّت numpy ثم شغّل: python3 kit/python/manara_webcam.py --selftest', 'Install numpy, then run: python3 kit/python/manara_webcam.py --selftest'),
      p: T2('تطبع «self-test: PASS»: اللهب المتراقص يصل FIRE، والمصباح الثابت والسيارة الحمراء لا يصلانه.', 'It prints “self-test: PASS”: a flickering flame reaches FIRE; a static lamp and a red car do not.'),
      f: T2('«numpy غير موجود»؟ نفّذ pip install numpy.', '“No module numpy”? Run pip install numpy.') },
    { id: 's3', t: 1, ti: T2('جرّب الكاميرا وخدع الكاشف', 'Try the camera and fool the detector'),
      d: T2('شغّل --camera 0 --show (يحتاج opencv-python) أو افتح مختبر الأدلة. أرِه وشاحًا أحمر ومصباحًا برتقاليًّا وفيديو حريق على هاتف.', 'Run --camera 0 --show (needs opencv-python) or open the Evidence Lab. Show it a red scarf, an orange lamp and a fire video on a phone.'),
      p: T2('لا شيء من الخدع يبلغ «حريق»؛ وأقصى ما يصله «اشتباه».', 'None of the decoys reaches FIRE; the most they reach is SUSPECT.'),
      f: T2('تذكّر: رؤية بقواعد 66.7% على صور ثابتة محجوزة، وليست ذكاءً اصطناعيًّا.', 'Remember: rule-based vision, 66.7 % on held-out still images, not AI.') },

    { id: 's4', t: 2, ti: T2('ثبّت الأدوات والمكتبات', 'Install the tools and libraries'),
      d: T2('Arduino IDE 2.3.x، وحزمة «esp32 by Espressif Systems» 3.3.x، والمكتبات المذكورة في kit/README.md. اختر اللوحة «ESP32 Dev Module».', 'Arduino IDE 2.3.x, the “esp32 by Espressif Systems” 3.3.x package and the libraries listed in kit/README.md. Pick the board “ESP32 Dev Module”.'),
      p: T2('يُترجَم المثال Blink لـ ESP32 ويُرفع دون أخطاء.', 'The Blink example compiles and uploads for the ESP32 without errors.'),
      f: T2('لا يظهر المنفذ؟ ثبّت تعريف CP2102 أو CH340، وجرّب كبل بيانات آخر (بعض الكبلات للشحن فقط).', 'No port appears? Install the CP2102 or CH340 driver and try another cable (some cables only charge).') },
    { id: 's5', t: 2, ti: T2('تجربة الدخان: لوحة بلا توصيلات', 'Smoke test: the board with nothing wired'),
      d: T2('في manara_sentinel.ino اجعل كل HAS_… تساوي 0 عدا HAS_SOS وHAS_EXITS، ثم ارفع الشيفرة. افتح هذه الصفحة وأوقف المحاكاة واضغط «وصّل اللوحة».', 'In manara_sentinel.ino set every HAS_… to 0 except HAS_SOS and HAS_EXITS, then upload. Open this page, switch the simulation off and press “Connect board”.'),
      p: T2('يظهر في السجل «# MANARA sentinel firmware…» وتصل الإطارات بمعدل نحو 4 في الثانية بلا أخطاء في العدّاد.', 'The log shows “# MANARA sentinel firmware…” and frames arrive at about 4 per second with no bad lines in the counter.'),
      f: T2('لا شيء؟ أغلق Serial Monitor في Arduino IDE (منفذ واحد لبرنامج واحد) وتأكد من 115200.', 'Nothing? Close the Serial Monitor in the Arduino IDE (one program per port) and check 115200.') },
    { id: 's6', t: 2, ti: T2('ناقل I2C: الكاميرا الحرارية وSHT31', 'I2C bus: thermal camera and SHT31'),
      d: T2('وصّلهما بـ 3.3 فولت و21/22 كما في الجدول، وفعّل HAS_MLX90640 وHAS_SHT31، ثم ارفع.', 'Wire both to 3.3 V and 21/22 as in the table, enable HAS_MLX90640 and HAS_SHT31, then upload.'),
      p: T2('الإقلاع يطبع «I2C bus 0 devices: 0x33 0x44» ثم «MLX90640 ok» و«SHT31 ok».', 'Boot prints “I2C bus 0 devices: 0x33 0x44”, then “MLX90640 ok” and “SHT31 ok”.'),
      f: T2('لا عناوين؟ بدّل SDA وSCL، وافحص مقاومات الرفع، ولا تعطِ الوحدة 5 فولت.', 'No addresses? Swap SDA and SCL, check the pull-ups, and never give the module 5 V.') },
    { id: 's7', t: 2, ti: T2('الصورة الحرارية', 'The thermal image'),
      d: T2('ضع يدك أمام الكاميرا ثم اسحبها. راقب الصورة 32×24 في المراقب.', 'Put your hand in front of the camera, then take it away. Watch the 32×24 image in the monitor.'),
      p: T2('تظهر اليد حارّة (نحو 30–35°م) وتعود الصورة إلى حرارة الغرفة؛ و«tmean» قريب من حرارة الغرفة.', 'The hand shows warm (about 30–35 °C) and the image returns to room temperature; “tmean” is close to room temperature.'),
      f: T2('صورة سوداء أو أخطاء؟ هبّط الإنعاش إلى 2 Hz أو تأكد من 400 كيلوهرتز وطول الأسلاك أقل من 20 سم.', 'Black image or errors? Lower the refresh to 2 Hz or check 400 kHz and wires shorter than 20 cm.') },
    { id: 's8', t: 2, ti: T2('SHT31 مقابل ميزان حرارة', 'SHT31 against a thermometer'),
      d: T2('ضع ميزان حرارة مرجعيًّا بجانبه 10 دقائق. جرّب مجفّف الشعر على منخفض من 50 سم على دفعات قصيرة.', 'Put a reference thermometer next to it for 10 minutes. Try the hair dryer on LOW from 50 cm in short bursts.'),
      p: T2('الفرق أقل من 1°م عن الميزان؛ وترتفع «wbgt» (تقدير) مع الحرارة وتهبط الرطوبة.', 'The difference from the thermometer is under 1 °C; “wbgt” (an estimate) rises with heat while humidity falls.'),
      f: T2('الفرق كبير؟ السخّانات أو منظّم الجهد يسخّنان الحسّاس: ابعده.', 'A large difference? The heaters or the regulator are warming the sensor: move it away.') },
    { id: 's9', t: 2, ti: T2('حسّاسات الغاز: قِس الجهد قبل التوصيل', 'Gas sensors: measure the voltage before connecting'),
      d: T2('وصّل MQ-2 وMQ-7 عبر المقسّم. بمقياس متعدد تأكد أن جهد الطرف 34 و35 أقل من 3.3 فولت دائمًا. فعّل HAS_MQ2 وHAS_MQ7.', 'Wire the MQ-2 and MQ-7 through the divider. With a multimeter check that the voltage at pins 34 and 35 is always below 3.3 V. Enable HAS_MQ2 and HAS_MQ7.'),
      p: T2('تتغيّر «gas.mq2» عند تقريب قطنة معقّم (دون بخّ ودون لهب) من الحسّاس ثم تعود.', '“gas.mq2” changes when a sanitiser cotton pad (no spray, no flame) is held near the sensor, then returns.'),
      f: T2('قراءة ثابتة 0 أو 4095 قريبة؟ المقسّم خطأ أو الطرف على ADC2.', 'A reading stuck near 0 or the maximum? The divider is wrong or the pin is on ADC2.') },
    { id: 's10', t: 2, ti: T2('مستوى الماء', 'Water level'),
      d: T2('ثبّت HC-SR04 فوق الكوب ينظر للأسفل وقِس المسافة إلى القاع الفارغ فاكتبها في WATER_MOUNT_CM. أضف الماء بالتدريج.', 'Fix the HC-SR04 above the cup looking down, measure the distance to the empty bottom and put it in WATER_MOUNT_CM. Add water gradually.'),
      p: T2('الكوب الفارغ ≈ 0 سم (±1)؛ عند 3 سم تصبح الحالة «اشتباه» وعند 6 سم «إنذار» (مقياس المعرض).', 'An empty cup reads about 0 cm (±1); at 3 cm the state is SUSPECT and at 6 cm ALARM (booth scale).'),
      f: T2('قراءات متقافزة؟ الرغوة أو الكوب ضيق جدًّا: ابتعد بالحسّاس وكبّر الكوب.', 'Jumpy readings? Foam or a cup that is too narrow: move the sensor up and use a wider cup.') },
    { id: 's11', t: 2, ti: T2('زر SOS ومفاتيح المخارج واللافتات', 'SOS button, exit switches and signs'),
      d: T2('وصّل الزر والمفاتيح الثلاثة وشريط WS2812 والصفّارة. اضغط «كل اذهب» في المراقب.', 'Wire the button, the three switches, the WS2812 strip and the buzzer. Press “All GO” in the monitor.'),
      p: T2('الضغطة على SOS ترفع «sos: true»؛ و3 ثوانٍ تمسحها. بدّل المفتاح B فتصير لافتته حمراء رغم أمر «اذهب».', 'Pressing SOS makes “sos: true”; holding 3 s clears it. Flip switch B and its sign turns red despite the “go” command.'),
      f: T2('اللافتات لا تضيء؟ تحقق من 5 فولت والأرضي المشترك ومن 330 أوم ومن لون ترتيب البكسل (GRB).', 'Signs stay dark? Check 5 V, the common ground, the 330 Ω and the pixel colour order (GRB).') },
    { id: 's12', t: 2, ti: T2('الإحماء وخط الأساس', 'Warm-up and baseline'),
      d: T2('اترك اللوحة تعمل 5 دقائق في غرفة بلا معقّم (انظر المؤقتات).', 'Leave the board running for 5 minutes in a room with no sanitiser (see the timers).'),
      p: T2('الحلقة الزرقاء تتحول إلى خضراء مع وميضين أبيضين كل ثانيتين.', 'The blue ring turns green with two white flashes every 2 seconds.'),
      f: T2('بقيت زرقاء؟ لم تمرّ 4 دقائق بعد، أو الكاميرا لا تعمل (انظر الخطوة 6).', 'Still blue? 4 minutes have not passed yet, or the camera is not working (see step 6).') },
    { id: 's13', t: 2, ti: T2('إنذار الحريق بمفتاحين', 'The fire alarm with two keys'),
      d: T2('ضع كوبًا خزفيًّا ساخنًا (نحو 60–70°م) أمام الكاميرا الحرارية: انتظر 5 ثوانٍ. ثم قرّب مسحة معقّم من MQ-2.', 'Put a hot ceramic mug (about 60–70 °C) in front of the thermal camera: wait 5 seconds. Then bring a sanitiser swab to the MQ-2.'),
      p: T2('الكوب وحده: «اشتباه» (حلقة كهرمانية، alarm=false). مع المسحة: «إنذار» (حلقة حمراء، صفّارة، لافتات خضراء للمخارج المفتوحة وحمراء للمقفلة).', 'Mug alone: SUSPECT (amber ring, alarm=false). With the swab: ALARM (red ring, siren, green signs on open exits and red on locked ones).'),
      f: T2('لا ينتقل إلى «إنذار»؟ تأكد أن خط الأساس سُجّل في هواء نظيف، وأن المسحة ترفع القراءة بما لا يقل عن +3σ لمدة ثانيتين.', 'No move to ALARM? Check the baseline was recorded in clean air and that the swab lifts the reading by at least +3σ for 2 seconds.') },
    { id: 's14', t: 2, ti: T2('الإنذار المحلي لا ينتظر', 'The local alarm never waits'),
      d: T2('كرّر الخطوة 13 مع كابل طاقة فقط (بنك طاقة) دون حاسوب ودون متصفح.', 'Repeat step 13 on a power-only cable (a power bank), with no computer and no browser.'),
      p: T2('الإنذار يعمل كما هو: حلقة حمراء وصفّارة ولافتات.', 'The alarm works exactly the same: red ring, siren and signs.'),
      f: T2('لا يعمل؟ الشيفرة تنتظر شيئًا من المنفذ التسلسلي: ابحث عن while (!Serial).', 'Does not work? The code is waiting on the serial port: look for while (!Serial).') },

    { id: 's15', t: 3, ti: T2('الرأس المتحرك', 'The pan-tilt head'),
      d: T2('اربط المحرّكين بمصدرهم 5 فولت المنفصل وأرضي مشترك، وفعّل HAS_HEAD. ثبّت الكاميرا الحرارية على الحامل وتحقق من إشارتَي HEAD_PAN_SIGN وHEAD_TILT_SIGN.', 'Power the servos from their own 5 V supply with a common ground and enable HAS_HEAD. Mount the thermal camera on the bracket and check HEAD_PAN_SIGN and HEAD_TILT_SIGN.'),
      p: T2('يمسح (PATROL)، فيلاحق الكوب (TRACK)، ثم يثبت (HOLD)؛ وبعد إبعاد الكوب يعود للمسح خلال نحو 5 ثوانٍ.', 'It patrols (PATROL), follows the mug (TRACK), then settles (HOLD); after the mug is removed it returns to patrol within about 5 seconds.'),
      f: T2('يبتعد عن الكوب؟ اعكس HEAD_PAN_SIGN أو HEAD_TILT_SIGN.', 'It runs away from the mug? Flip HEAD_PAN_SIGN or HEAD_TILT_SIGN.') },
    { id: 's16', t: 3, ti: T2('نقطة «آمن» (الشبكة المحلية)', 'MANARA-SAFE (the local network)'),
      d: T2('ارفع manara_safepoint.ino إلى اللوحة الثانية. انضم من هاتفك إلى «MANARA-SAFE» واكتب رقم غرفة واضغط «أنا بأمان».', 'Upload manara_safepoint.ino to the second board. Join “MANARA-SAFE” from your phone, type a room number and tap “I’m safe”.'),
      p: T2('يظهر سطر checkin في هذا المراقب، ويزداد العدّاد، وتظهر الصفحة 192.168.4.1/count على الجهاز اللوحي.', 'A checkin line appears in this monitor, the counter grows, and the page 192.168.4.1/count shows on the tablet.'),
      f: T2('لا تظهر صفحة الدخول؟ افتح 192.168.4.1 في المتصفح يدويًّا، أو امسح رمز QR.', 'No portal page? Open 192.168.4.1 in the browser by hand, or scan the QR code.') },
    { id: 's17', t: 3, ti: T2('بروفة الكشك مرتين', 'Rehearse the booth twice'),
      d: T2('اتبع نص الدقائق الثلاث أدناه مع صديق يلعب دور الحكم.', 'Follow the 3-minute script below with a friend playing the judge.'),
      p: T2('تنتهي في 3 دقائق أو أقل دون إعادة تشغيل أي قطعة، ويستطيع «الحكم» تكرار كل خطوة وحده.', 'You finish in 3 minutes or less without restarting any part, and the “judge” can repeat every step alone.'),
      f: T2('تتعطل قطعة؟ اكتب السبب في سجل الهندسة، فاللجنة تقدّر الأعطال المشروحة.', 'A part fails? Write the cause in the engineering logbook: judges value explained failures.') }
  ];

  var RULES = [
    { hz: T2('حريق ودخان', 'Fire and smoke'), k1: T2('بقعة حرارية ≥ 57°م وأسخن من الخلفية بوضوح (3·MAD و+6°م) لمدة 5 ثوانٍ، أو ارتفاع ≥ 8.3°م/دقيقة', 'A hot-spot ≥ 57 °C and clearly hotter than the background (3·MAD and +6 °C) for 5 s, or rising ≥ 8.3 °C/min'), k2: T2('مؤشر دخان MQ-2 ≥ +3σ عن خط الأساس', 'MQ-2 smoke index ≥ +3σ above baseline'), res: T2('مفتاح = اشتباه؛ مفتاحان = إنذار', 'one key = SUSPECT; two keys = ALARM') },
    { hz: T2('تسرّب غاز', 'Gas leak'), k1: T2('أحد MQ-7 أو MQ-2 ≥ +3σ', 'Either MQ-7 or MQ-2 ≥ +3σ'), k2: T2('الحسّاس الآخر ≥ +3σ أيضًا مع اتجاه صاعد (3 قراءات متتالية)', 'The other sensor ≥ +3σ too, with a rising trend (3 samples in a row)'), res: T2('مفتاح = اشتباه؛ مفتاحان = إنذار', 'one key = SUSPECT; two keys = ALARM') },
    { hz: T2('سيول', 'Flash flood'), k1: T2('العمق ≥ عتبة التحذير (مقياس الكوب 3 سم، وإرشاد 15 سم)', 'Depth ≥ warn level (cup scale 3 cm; guidance 15 cm)'), k2: T2('— (مفتاح العوّامة أو العمق الخطر يكفي محليًّا لأن الماء قد يسبق موافقة الإنسان)', '— (the float switch or the danger depth is enough locally: water can outrun a human approval)'), res: T2('تحذير = اشتباه؛ خطر أو عوّامة = إنذار', 'warn = SUSPECT; danger or float = ALARM') },
    { hz: T2('إجهاد حراري', 'Heat stress'), k1: T2('تقدير WBGT ≥ 28°م (عمل خفيف)', 'WBGT estimate ≥ 28 °C (light work)'), k2: T2('≥ 32.1°م لمدة 10 ثوانٍ (خط القرار القطري المقيس؛ عندنا تقدير)', '≥ 32.1 °C for 10 s (Qatar’s measured line; ours is an estimate)'), res: T2('حلقة فقط دون صفّارة', 'ring only, no siren') },
    { hz: T2('غبار (اختياري)', 'Dust (optional)'), k1: T2('متوسط PM10 لعشر دقائق ≥ 150 µg/m³ (رقم معيار قطر لمدة 24 ساعة، S31، نطبّقه على 10 دقائق باختيار الطالب)', '10-minute PM10 average ≥ 150 µg/m³ (the number of Qatar’s 24-hour standard, S31, applied to 10 minutes by student choice)'), k2: T2('خارج اللوحة: كاميرا أو تحذير الأرصاد', 'Off the board: camera or a weather warning'), res: T2('اشتباه فقط محليًّا', 'SUSPECT only, locally') },
    { hz: T2('استغاثة', 'SOS'), k1: T2('ضغطة زر SOS (قرار إنسان) أو سقوط ثم سكون 15 ثانية', 'SOS pressed (a human decision), or a fall then 15 s of stillness'), k2: T2('بعد السقوط: لا ردّ على «هل أنت بخير؟» خلال 30 ثانية', 'After a fall: no answer to “are you OK?” within 30 s'), res: T2('إنذار استغاثة', 'SOS alarm') }
  ];

  var STANDINS = [
    { hz: T2('حريق ودخان', 'Fire and smoke'), si: T2('كوب خزفي ساخن (نحو 60–70°م) أو سخّان يدين', 'A hot ceramic mug (about 60–70 °C) or a hand warmer'), see: T2('الكاميرا الحرارية: بقعة ≥ 57°م وأسخن من محيطها؛ ومسحة المعقّم ترفع MQ-2 كمفتاح ثانٍ.', 'Thermal camera: a spot ≥ 57 °C and hotter than its surroundings; the sanitiser swab raises the MQ-2 as the second key.'), note: T2('الكوب ليس حريقًا: لذلك مفتاح واحد = اشتباه. الزجاج يحجب الأشعة تحت الحمراء، والمعدن اللامع يبدو أبرد.', 'A mug is not a fire: that is why one key = SUSPECT. Glass blocks infrared; shiny metal reads cooler.') },
    { hz: T2('تسرّب غاز', 'Gas leak'), si: T2('قطنة بها بضع قطرات من معقّم أيدٍ كحولي، تُقرَّب من MQ-2 (دون بخّ ودون لهب)', 'A cotton pad with a few drops of alcohol hand sanitiser, held near the MQ-2 (no spray, no flame)'), see: T2('جهد MQ-2 (وغالبًا MQ-7) يرتفع ملّيفولتات فوق خط الأساس ثم يعود.', 'The MQ-2 (and often the MQ-7) voltage rises by millivolts above baseline, then returns.'), note: T2('الحسّاسات تستجيب لبخار الكحول: بديل للعرض لا اختبار لـ LPG أو CO. القيم ملّيفولت لا ppm.', 'The sensors respond to alcohol vapour: a demo stand-in, not a test for LPG or CO. Values are millivolts, not ppm.') },
    { hz: T2('سيول', 'Flash flood'), si: T2('كوب ماء تحت HC-SR04 (وصينية تحته)', 'A cup of water under the HC-SR04 (with a tray under it)'), see: T2('العمق = ارتفاع التركيب − المسافة المقيسة، بتصحيح حرارة SHT31.', 'Depth = mounting height − measured distance, corrected with the SHT31 temperature.'), note: T2('عتبات الكوب 3 و6 سم مقياس معرض (SIM) لا إرشاد 15 و30 سم؛ والحسّاس لا يقيس سرعة التيار.', 'The cup thresholds 3 and 6 cm are booth scale (SIM), not the 15 and 30 cm guidance; the sensor cannot measure flow.') },
    { hz: T2('إجهاد حراري', 'Extreme heat'), si: T2('مجفّف شعر على «منخفض» من 50 سم على SHT31 لثوانٍ قليلة', 'A hair dryer on LOW from 50 cm at the SHT31 for a few seconds'), see: T2('الحرارة ترتفع والرطوبة تنخفض فيرتفع تقدير WBGT ومؤشر الحرارة.', 'Temperature rises and humidity falls, so the WBGT estimate and the heat index rise.'), note: T2('WBGT هنا تقدير (صيغة الظل) لا القياس الذي يقوم عليه حدّ 32.1°م القطري؛ حمل الشمس غير مقيس.', 'WBGT here is an estimate (shade formula), not the measured value behind Qatar’s 32.1 °C line; sun load is not measured.') },
    { hz: T2('شخص يحتاج مساعدة', 'Someone needs help'), si: T2('زر SOS؛ ولمحاكاة السقوط أسقط حسّاس MPU6050 على فراش', 'The SOS button; to simulate a fall drop the MPU6050 onto a mattress'), see: T2('«sos: true»، أو «fall: true» ثم عدّ 30 ثانية للردّ.', '“sos: true”, or “fall: true” then a 30-second countdown for an answer.'), note: T2('منارة لا تتصل بـ999: ترسل حزمة موثّقة والمرسِل يقرّر. ولا يوجد معيار منشور لعتبة السقوط.', 'MANARA does not call 999: it sends a verified package and the dispatcher decides. There is no published fall threshold.') },
    { hz: T2('عاصفة غبارية', 'Dust storm'), si: T2('محاكاة SIM فقط (تبويب «مختبر الحسّاسات» في مختبر الأدلة)', 'Simulation (SIM) only (the “Sensor Lab” tab in the Evidence Lab)'), see: T2('إن ركّبت PMS5003 فلا تنثر غبارًا: اكتفِ بالمحاكاة.', 'If you fitted a PMS5003 do not throw dust: use the simulation.'), note: T2('لا غبار في الكشك: يؤذي الرئتين.', 'No dust at the booth: it hurts lungs.') }
  ];

  var TOUCH = [
    { c: '--accent', t: T2('اللوحة التوأم + الحارس', 'Twin board + sentinel'), d: T2('بدّل مفاتيح المخارج A وB وR، واضغط SOS. (لا تحرّك الأسلاك).', 'Flip exit switches A, B, R and press SOS. (Do not move the wires.)') },
    { c: '--brand', t: T2('الحاسوب: غرفة العمليات', 'Laptop: Mission Control'), d: T2('اختر خطرًا جاهزًا واضغط «اعتماد» (مفتاح الإنسان).', 'Pick a hazard preset and press “Approve” (the human key).') },
    { c: '--info', t: T2('جدار الهواتف', 'The phone wall'), d: T2('اضغط «أنا بأمان» أو «أحتاج مساعدة» على أحد الهواتف الأربعة.', 'Tap “I’m safe” or “I need help” on one of the four phones.') },
    { c: '--safe', t: T2('الجهاز اللوحي + «آمن»', 'Tablet + MANARA-SAFE'), d: T2('انضم من هاتفك إلى «MANARA-SAFE» واضغط «أنا بأمان»: يتحرك العدّاد.', 'Join “MANARA-SAFE” from your phone and tap “I’m safe”: the counter moves.') },
    { c: '--warn', t: T2('مختبر الأدلة + الكاميرا', 'Evidence Lab + webcam'), d: T2('أرِ الكاميرا وشاحًا أحمر أو كشّاف هاتف أو فيديو حريق: حاول خداعها.', 'Show the camera a red scarf, a phone flashlight or a fire video: try to fool it.') },
    { c: '--danger', t: T2('صينية البدائل الآمنة', 'Safe stand-ins tray'), d: T2('كوب ساخن، مسحة معقّم، كوب ماء. (مجفّف الشعر يُشغّله الفريق فقط).', 'Hot mug, sanitiser swab, cup of water. (The hair dryer is run by the team only.)') }
  ];

  var SCRIPT = [
    { tm: '0:00', judge: T2('يقف أمام الطاولة', 'Stands at the table'), say: T2('«فرق الطوارئ تواجه الخطر… والمنارة تُوصل كل إنسان إلى الأمان.»', '“Responders fight the hazard. The lighthouse gets every person to safety.”'), proof: T2('غرفة العمليات: الليل 04:00 والمبنى نائم.', 'Mission Control: night, 04:00, the building asleep.') },
    { tm: '0:20', judge: T2('يضع الكوب الساخن أمام الكاميرا الحرارية', 'Puts the hot mug in front of the thermal camera'), say: T2('«مفتاح واحد لا يكفي: لذلك اشتباه وليس إنذارًا.»', '“One key is not enough: so it is a suspicion, not an alarm.”'), proof: T2('الحلقة كهرمانية، والحالة SUSPECT، والكوب بقعة على الصورة الحرارية.', 'Amber ring, state SUSPECT, the mug a spot on the thermal image.') },
    { tm: '0:50', judge: T2('يقرّب مسحة المعقّم من MQ-2', 'Brings the sanitiser swab to the MQ-2'), say: T2('«المفتاح الثاني من مبدأ فيزيائي مختلف: الآن إنذار محلي لا ينتظر أحدًا.»', '“The second key is a different physical principle: now a local alarm that waits for no one.”'), proof: T2('الحلقة حمراء، صفّارة ثلاث نبضات، لافتات الخروج.', 'Red ring, a three-pulse siren, the exit signs.') },
    { tm: '1:10', judge: T2('يضغط «اعتماد» في غرفة العمليات', 'Presses “Approve” in Mission Control'), say: T2('«الآن موافقة إنسان: كل شخص يصله إنذار بلغته وصيغته، والأقرب زمنًا يتجه إليه (محاكاة).»', '“Now a human approves: each person gets an alert in their own language and format, and the unit that arrives fastest is sent (simulation).”'), proof: T2('جدار الهواتف: سلّم الإيقاظ، وبطاقة الاستجابة: أسرع وحدة حسب الزحام SIM.', 'The phone wall: the wake-up ladder, and the dispatch card: fastest unit given SIM traffic.') },
    { tm: '1:35', judge: T2('يبدّل مفتاح المخرج B إلى «مقفل»', 'Flips exit switch B to “locked”'), say: T2('«حقيقة المخرج: لن تقول لافتتنا “اذهب” على باب مقفل مهما قال المتصفح.»', '“Exit truth: our sign will never say “go” on a locked door, whatever the browser says.”'), proof: T2('لافتة B حمراء والمسار يتغيّر على الخريطة.', 'Sign B turns red and the route changes on the map.') },
    { tm: '1:55', judge: T2('يضغط «أنا بأمان» ثم «أحتاج مساعدة» على «آمن»', 'Taps “I’m safe” then “I need help” on MANARA-SAFE'), say: T2('«نعدّ كل إنسان دون أسماء وبلا إنترنت.»', '“We count every person, with no names and no internet.”'), proof: T2('العدّاد يتحرك وتظهر الغرفة في بطاقة التسليم.', 'The counter moves and the room appears on the hand-off card.') },
    { tm: '2:20', judge: T2('يحاول خداع الكاشف بوشاح أحمر', 'Tries to fool the detector with a red scarf'), say: T2('«رؤية بقواعد وليست ذكاءً اصطناعيًّا: 66.7% على صور ثابتة محجوزة، وهذه حدودها.»', '“Rule-based vision, not AI: 66.7 % on held-out still images, and here are its limits.”'), proof: T2('مختبر الأدلة: الوشاح لا يصل «حريق».', 'Evidence Lab: the scarf never reaches FIRE.') },
    { tm: '2:40', judge: T2('يسأل: «ما الذي بنيتَه أنت؟»', 'Asks: “What did you build yourself?”'), say: T2('«هذا جدول اشتريتُ/بنيتُ/ساعدني، والمحاكاة SIM، وما لم يُجرَّب نقوله صراحةً.»', '“Here is the bought/built/helped-by table; simulations are SIM; what is untested, we say so.”'), proof: T2('جدول الملكية وقائمة الفحص وسجل المعايرة.', 'The ownership table, the test checklist and the calibration log.') }
  ];

  var OWN = [
    { id: 'o1', p: T2('لوحة ESP32 ووحدات الحسّاسات', 'ESP32 board and sensor modules'), w: 'bought', n: '' },
    { id: 'o2', p: T2('التوصيل واللحام وهيكل اللوحة التوأم', 'Wiring, soldering and the twin-board frame'), w: '', n: '' },
    { id: 'o3', p: T2('شيفرة الحارس (manara_sentinel.ino)', 'Sentinel firmware (manara_sentinel.ino)'), w: 'ai', n: '', ph: T2('نسخة أولى كُتبت بمساعدة الذكاء الاصطناعي — ماذا غيّرتَ أنت؟', 'first version written with AI help — what did YOU change?') },
    { id: 'o4', p: T2('شيفرة «آمن» (manara_safepoint.ino)', 'MANARA-SAFE firmware (manara_safepoint.ino)'), w: 'ai', n: '', ph: T2('نسخة أولى كُتبت بمساعدة الذكاء الاصطناعي — ماذا غيّرتَ أنت؟', 'first version written with AI help — what did YOU change?') },
    { id: 'o5', p: T2('كاشف بايثون (manara_webcam.py)', 'Python detector (manara_webcam.py)'), w: 'ai', n: '', ph: T2('نسخة أولى كُتبت بمساعدة الذكاء الاصطناعي — ماذا غيّرتَ أنت؟', 'first version written with AI help — what did YOU change?') },
    { id: 'o6', p: T2('صفحات الويب (غرفة العمليات، مختبر الأدلة، الهواتف)', 'Web pages (Mission Control, Evidence Lab, phones)'), w: 'ai', n: '', ph: T2('نسخة أولى كُتبت بمساعدة الذكاء الاصطناعي — ماذا غيّرتَ أنت؟', 'first version written with AI help — what did YOU change?') },
    { id: 'o7', p: T2('المعادلات والقواعد (Stull وWBGT والبقعة الساخنة ودايكسترا)', 'Formulas and rules (Stull, WBGT, hot-spot, Dijkstra)'), w: '', n: '' },
    { id: 'o8', p: T2('قياسات المعايرة ونتائج الاختبار', 'Calibration measurements and test results'), w: '', n: '' },
    { id: 'o9', p: T2('نصوص الكشك واللوحة والتقرير', 'Booth, poster and report text'), w: '', n: '' },
    { id: 'o10', p: T2('ترجمات الرسائل (مسودات تحتاج متحدثًا أصليًّا)', 'Message translations (drafts need a native speaker)'), w: '', n: '' },
    { id: 'o11', p: T2('الموافقة الأخلاقية واختبار الفهم (لم يُجرَ بعد)', 'Ethics approval and the comprehension test (not run yet)'), w: '', n: '' }
  ];
  var WHO = [
    { v: '', l: T2('— اختر —', '— choose —') }, { v: 'bought', l: T2('اشتريتُه جاهزًا', 'Bought ready-made') }, { v: 'built', l: T2('بنيتُه بنفسي', 'Built by me') },
    { v: 'mentor', l: T2('ساعدني معلّم أو مرشد', 'Helped by a teacher or mentor') }, { v: 'ai', l: T2('ساعدتني أداة ذكاء اصطناعي', 'Helped by an AI tool') }, { v: 'mixed', l: T2('مزيج (اشرح)', 'Mixed (explain)') }
  ];

  var EXPLAIN = [
    { id: 'e1', t: T2('الرطوبة والحرارة: معادلة Stull للبصلة الرطبة', 'Wet bulb from temperature and humidity: Stull’s formula'), d: T2('ولماذا نقول «تقدير» لا «قياس».', 'and why we say “estimate”, not “measurement”.') },
    { id: 'e2', t: T2('WBGT = 0.7·Tnwb + 0.3·Tg (ظل) والقياس القطري', 'WBGT = 0.7·Tnwb + 0.3·Tg (shade) and Qatar’s measured line'), d: T2('حد 32.1°م قياس بمقياس WBGT، وتقديرنا قد يخطئ.', 'The 32.1 °C line is measured with a WBGT meter; our estimate can be wrong.') },
    { id: 'e3', t: T2('مؤشر الحرارة (Rothfusz) وما لا يحذّر منه', 'The heat index (Rothfusz) and what it under-warns'), d: T2('OSHA: عمّال ماتوا والمؤشر 86°ف فقط.', 'OSHA: workers have died when the index was only 86 °F.') },
    { id: 'e4', t: T2('قاعدة البقعة الساخنة: ≥ 57°م وفوق متوسط الخلفية + 3·MAD و+6°م', 'The hot-spot rule: ≥ 57 °C and above background mean + 3·MAD and + 6 °C'), d: T2('ولماذا لا يكفي المطلق وحده (جدار ساخن)، ولماذا تخدعها الشمس.', 'why the absolute rule alone is not enough (a warm wall) and why the sun can fool it.') },
    { id: 'e5', t: T2('منطق المفتاحين ومفتاح الإنسان', 'The two-key logic and the human key'), d: T2('ولماذا حسّاس واحد لا يتجاوز «اشتباه».', 'and why one sensor never goes beyond SUSPECT.') },
    { id: 'e6', t: T2('خط الأساس وσ لحسّاسات MQ', 'The baseline and σ for MQ sensors'), d: T2('لماذا ملّيفولت لا ppm، ولماذا حرق 48 ساعة.', 'why millivolts and not ppm, and why the 48-hour burn-in.') },
    { id: 'e7', t: T2('تصحيح سرعة الصوت: 331.3 + 0.606·T', 'Speed-of-sound correction: 331.3 + 0.606·T'), d: T2('عند 45°م الخطأ دون تصحيح نحو 5.5% (حساب مشتق).', 'at 45 °C the uncorrected error is about 5.5 % (derived arithmetic).') },
    { id: 'e8', t: T2('منطق السقوط: اصطدام ثم سكون ثم سؤال ثم SOS', 'Fall logic: impact, stillness, check-in, SOS'), d: T2('ولماذا العتبة لك أنت (لا معيار منشور).', 'and why the threshold is yours (there is no published standard).') },
    { id: 'e9', t: T2('بروتوكول v1: سطر JSON واحد لكل رسالة', 'Protocol v1: one JSON line per message'), d: T2('وما الذي يتحقق منه المتصفح قبل أن يثق بسطر.', 'and what the browser checks before it trusts a line.') },
    { id: 'e10', t: T2('لماذا لا ينتظر الإنذار المحلي وماذا لا يستطيع المتصفح أن يفعل', 'Why the local alarm never waits and what the browser cannot do'), d: T2('تصعيد نعم، إسكات لا، و«اذهب» على باب مقفل لا.', 'escalate yes, silence no, “go” on a locked door no.') },
    { id: 'e11', t: T2('التوجيه: دايكسترا متعدد المصادر من أهداف الأمان', 'Routing: multi-source Dijkstra from the safe targets'), d: T2('في غرفة العمليات، مع تجنّب الخطر وحقيقة المخارج.', 'in Mission Control, avoiding danger and using exit truth.') },
    { id: 'e12', t: T2('الاستجابة: الوحدة الأسرع وصولًا حسب الزحام، لا الأقرب مسافةً', 'Dispatch: the unit that arrives fastest given traffic, not the nearest by distance'), d: T2('الزحام في المحاكاة SIM، والمرسِل الحقيقي (999) هو الذي يقرّر.', 'Traffic in the simulation is SIM, and the real dispatcher (999) decides.') }
  ];

  var KIT = [
    { f: 'kit/firmware/manara_sentinel/manara_sentinel.ino', n: 'manara_sentinel.ino', tg: 'ESP32 · Arduino', d: T2('لوحة الحارس: قراءة كل الحسّاسات، إنذار محلي بمفتاحين، بروتوكول v1 (إطار 4 هرتز + صورة حرارية 1 هرتز)، يقبل أمر signs، ورأس متحرك اختياري (HAS_HEAD).', 'The sentinel: reads every sensor, a two-key local alarm, protocol v1 (frame 4 Hz + thermal image 1 Hz), accepts the signs command, and an optional pan-tilt head (HAS_HEAD).') },
    { f: 'kit/firmware/manara_safepoint/manara_safepoint.ino', n: 'manara_safepoint.ino', tg: 'ESP32 · Arduino', d: T2('نقطة «آمن»: شبكة MANARA-SAFE دون إنترنت وصفحة تسجيل (غرفة ولغة وحالة بلا أسماء)، تُرسل أسطر checkin وتعرض عدّادًا.', 'MANARA-SAFE: an offline Wi-Fi with a check-in page (room, language, status, no names); sends checkin lines and shows a counter.') },
    { f: 'kit/python/manara_webcam.py', n: 'manara_webcam.py', tg: 'Python · numpy', d: T2('كاشف اللون والوميض على كاميرا الحاسوب أو ملف فيديو، يعمل بـ numpy وحدها (OpenCV اختياري). الدالة detect_frame(rgb).', 'Colour + flicker detector for a laptop camera or a video file, numpy only (OpenCV optional). The pure function detect_frame(rgb).') },
    { f: 'kit/README.md', n: 'README.md', tg: 'AR · EN', d: T2('المكتبات وإصداراتها، وخطوات الرفع، وبروتوكول v1 باختصار، وقائمة الفحص بعد الرفع.', 'Libraries and versions, flashing steps, protocol v1 in short, and the post-flash test checklist.') }
  ];

  /* =============================================================== labels for aria (re-applied on langchange) */
  var LABELS = [
    ['#subnav', 'aria-label', T2('التنقل داخل الصفحة', 'In-page navigation')],
    ['#scen', 'aria-label', T2('سيناريوهات المحاكاة', 'Simulation scenarios')],
    ['#locks', 'aria-label', T2('مفاتيح المخارج (محاكاة)', 'Exit switches (simulation)')],
    ['#cmds', 'aria-label', T2('أوامر اختبار اللافتات', 'Sign test commands')],
    ['#log', 'aria-label', T2('سجل بروتوكول v1 الخام', 'Raw protocol v1 log')],
    ['#ladder', 'aria-label', T2('مفتاحان وموافقة إنسان', 'Two keys and a human approval')],
    ['#tier-cards', 'aria-label', T2('اختر مستوى البناء', 'Choose a build tier')],
    ['#steps-bar', 'aria-label', T2('تقدّم خطوات التشغيل', 'Bring-up progress')],
    ['#pin-diagram', 'aria-label', T2('رسم لوحة ESP32 DevKit بالأطراف المستعملة', 'Drawing of the ESP32 DevKit with the pins in use')],
    ['#booth-svg', 'aria-label', T2('منظر علوي لطاولة العرض بستة مواضع مرقّمة', 'Top view of the booth table with six numbered stations')],
    ['#proto-sample', 'aria-label', T2('أمثلة من بروتوكول v1', 'Protocol v1 examples')]
  ];
  function applyLabels() { LABELS.forEach(function (a) { var n = $(a[0]); if (n) n.setAttribute(a[1], L(a[2])); }); }

  /* =============================================================== in-page nav */
  var SECS = [['overview', T2('نظرة عامة', 'Overview')], ['monitor', T2('المراقِب', 'Monitor')], ['tiers', T2('المستويات', 'Tiers')], ['parts', T2('القطع', 'Parts')], ['wiring', T2('التوصيل', 'Wiring')],
    ['bringup', T2('الخطوات', 'Steps')], ['calibrate', T2('المعايرة', 'Calibration')], ['safety', T2('السلامة', 'Safety')], ['legal', T2('القانون', 'Legal')], ['booth', T2('الكشك', 'Booth')], ['ownership', T2('الملكية', 'Ownership')], ['kit', T2('الحقيبة', 'Kit')]];
  function renderSubnav() {
    var row = clear($('#subnav-row'));
    SECS.forEach(function (s) { var a = el('a'); a.href = '#' + s[0]; a.appendChild(bi(s[1])); row.appendChild(a); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          $$('a', row).forEach(function (a) { a.removeAttribute('aria-current'); });
          var a = $('a[href="#' + e.target.id + '"]', row);
          if (a) { a.setAttribute('aria-current', 'true'); var r = row.getBoundingClientRect(), b = a.getBoundingClientRect(); if (b.left < r.left || b.right > r.right) row.scrollTo({ left: row.scrollLeft + (b.left - r.left) - 40, behavior: Manara.reduce ? 'auto' : 'smooth' }); }
        });
      }, { rootMargin: '-35% 0px -60% 0px' });
      SECS.forEach(function (s) { var n = document.getElementById(s[0]); if (n) io.observe(n); });
    }
  }

  /* =============================================================== overview diagram */
  var OV = [
    { n: 1, c: '--accent', t: T2('الحارس', 'Sentinel'), s: [T2('ESP32 وحسّاسات', 'ESP32 + sensors'), T2('يرى ويقرّر محليًّا', 'sees, decides locally'), T2('لا ينتظر أحدًا', 'never waits')], tier: 2, icon: 'chip' },
    { n: 2, c: '--info', t: T2('الدرون (مفهوم)', 'Drone (concept)'), s: [T2('نظرة ثانية من الخارج', 'a second view from outside'), T2('تشغّله جهة مرخّصة', 'flown by a licensed agency')], tier: 3, icon: 'drone' },
    { n: 3, c: '--brand', t: T2('هواتف السكان', 'Resident phones'), s: [T2('لغة كل شخص وصيغته', 'each person’s language + format'), T2('سلّم إيقاظ ليلي', 'night wake-up ladder')], tier: 1, icon: 'phone' },
    { n: 4, c: '--safe', t: T2('العدّ', 'Headcount'), s: [T2('«أنا بأمان» / «أحتاج مساعدة»', '“I’m safe” / “I need help”'), T2('نقطة «آمن» دون إنترنت', 'MANARA-SAFE, offline')], tier: 3, icon: 'users' },
    { n: 5, c: '--danger', t: T2('التسليم', 'Hand-off'), s: [T2('للدفاع المدني والإسعاف', 'to Civil Defence + ambulance'), T2('حزمة موثّقة + تصدير CAP', 'verified package + CAP export')], tier: 1, icon: 'card' }
  ];
  var TIER_C = { 1: '--brand', 2: '--accent', 3: '--info' };
  function ovIcon(kind, g, color) {
    var a = { 'class': 'ov-icon', style: '--sc:var(' + color + ')' };
    var ic = sv('g', a, g);
    if (kind === 'chip') {
      sv('rect', { x: 11, y: 11, width: 26, height: 26, rx: 4, 'class': 'fill' }, ic);
      [15, 22, 29].forEach(function (p) { sv('path', { d: 'M' + p + ' 11V6M' + p + ' 37v5M11 ' + p + 'H6M37 ' + p + 'h5' }, ic); });
      [0, 1, 2].forEach(function (r) { [0, 1, 2].forEach(function (c) { sv('rect', { x: 16 + c * 6, y: 16 + r * 6, width: 4, height: 4, rx: 1 }, ic); }); });
    } else if (kind === 'drone') {
      [[9, 9], [39, 9], [9, 39], [39, 39]].forEach(function (p) { sv('circle', { cx: p[0], cy: p[1], r: 6 }, ic); });
      sv('path', { d: 'M14 14l7 7M34 14l-7 7M14 34l7-7M34 34l-7-7' }, ic);
      sv('rect', { x: 19, y: 19, width: 10, height: 10, rx: 3, 'class': 'fill' }, ic);
      sv('circle', { cx: 24, cy: 24, r: 2 }, ic);
    } else if (kind === 'phone') {
      sv('rect', { x: 14, y: 5, width: 20, height: 38, rx: 5, 'class': 'fill' }, ic);
      sv('path', { d: 'M21 38h6M19 24l4 4 7-8' }, ic);
    } else if (kind === 'users') {
      sv('circle', { cx: 24, cy: 15, r: 6, 'class': 'fill' }, ic);
      sv('path', { d: 'M12 40v-4a8 8 0 0 1 8-8h8a8 8 0 0 1 8 8v4' }, ic);
      sv('circle', { cx: 9, cy: 20, r: 4 }, ic); sv('circle', { cx: 39, cy: 20, r: 4 }, ic);
    } else {
      sv('rect', { x: 8, y: 10, width: 28, height: 28, rx: 4, 'class': 'fill' }, ic);
      sv('path', { d: 'M14 18h16M14 24h16M14 30h9M32 38l10-10M42 34V28h-6' }, ic);
    }
  }
  function ovNode(svg, n, x, y, w, h) {
    var g = sv('g', { style: '--sc:var(' + n.c + ')' }, svg);
    sv('rect', { x: x, y: y, width: w, height: h, rx: 18, 'class': 'ov-node on' }, g);
    var cx = x + w / 2;
    sv('circle', { cx: x + 26, cy: y + 26, r: 15, 'class': 'ov-badge' }, g);
    sv('text', { x: x + 26, y: y + 31.5, 'class': 'ov-badge-t' }, g, String(n.n));
    var ig = sv('g', { transform: 'translate(' + (cx - 24) + ',' + (y + 22) + ')' }, g);
    ovIcon(n.icon, ig, n.c);
    var ty = y + 94;
    svBi('text', { x: cx, y: ty, 'class': 'ov-title', 'text-anchor': 'middle' }, g, n.t);
    n.s.forEach(function (s, i) { svBi('text', { x: cx, y: ty + 23 + i * 18, 'class': 'ov-sub', 'text-anchor': 'middle' }, g, s); });
    sv('circle', { cx: x + w - 20, cy: y + h - 18, r: 6, 'class': 'ov-tier', style: '--sc:var(' + TIER_C[n.tier] + ')' }, g);
    var tt = sv('text', { x: x + w - 32, y: y + h - 13.5, 'class': 'ov-tier-t', 'text-anchor': 'end' }, g, 'T' + n.tier);
    tt.setAttribute('direction', 'ltr');
  }
  function ovArrow(svg, x1, y1, x2, y2, gate) {
    sv('path', { d: 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2, 'class': 'ov-arrow' }, svg);
    var a = M.atan2(y2 - y1, x2 - x1), hx = 9, p1 = [x2 - hx * M.cos(a - 0.5), y2 - hx * M.sin(a - 0.5)], p2 = [x2 - hx * M.cos(a + 0.5), y2 - hx * M.sin(a + 0.5)];
    sv('path', { d: 'M' + x2 + ' ' + y2 + 'L' + p1[0] + ' ' + p1[1] + 'L' + p2[0] + ' ' + p2[1] + 'Z', 'class': 'ov-arrow-head' }, svg);
    if (gate) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      sv('rect', { x: mx - 17, y: my - 15, width: 34, height: 30, rx: 9, 'class': 'ov-gate' }, svg);
      sv('path', { d: 'M' + (mx - 7) + ' ' + (my - 1) + 'h14v9h-14zM' + (mx - 4) + ' ' + (my - 1) + 'v-4a4 4 0 0 1 8 0v4', 'class': 'ov-icon', style: '--sc:var(--warn)' }, svg);
    }
  }
  function renderOverview() {
    var host = clear($('#overview-host')), rtl = Manara.lang() === 'ar';
    var h = sv('svg', { 'class': 'ov-h', viewBox: '0 0 1180 240', role: 'img', 'aria-label': L(T2('مخطط أفقي: الحارس ثم الدرون ثم الهواتف ثم العدّ ثم التسليم', 'Horizontal diagram: sentinel, drone, phones, headcount, hand-off')) }, host);
    var W = 176, H = 196, G = 68;
    OV.forEach(function (n, i) {
      var pos = rtl ? 4 - i : i, x = 14 + pos * (W + G);
      ovNode(h, n, x, 22, W, H);
      if (i < 4) {
        var xa = rtl ? x - 6 : x + W + 6, xb = rtl ? x - G + 6 : x + W + G - 6;
        ovArrow(h, xa, 22 + H / 2, xb, 22 + H / 2, i === 1);
      }
    });
    var v = sv('svg', { 'class': 'ov-v', viewBox: '0 0 360 1100', role: 'img', 'aria-label': L(T2('مخطط رأسي: الحارس ثم الدرون ثم الهواتف ثم العدّ ثم التسليم', 'Vertical diagram: sentinel, drone, phones, headcount, hand-off')) }, host);
    OV.forEach(function (n, i) {
      var y = 8 + i * 226;
      ovNode(v, n, 20, y, 320, 176);
      if (i < 4) ovArrow(v, 180, y + 182, 180, y + 222, i === 1);
    });
    var rb = el('ol', 'ribbon');
    [T2('أرصد', 'Sense'), T2('أتحقق', 'Prove'), T2('أُبلغ', 'Reach'), T2('أُرشد', 'Guide'), T2('أعُدّ', 'Count'), T2('أُسلّم', 'Hand off')].forEach(function (s) { var li = el('li'); li.appendChild(bi(s)); rb.appendChild(li); });
    host.appendChild(rb);
    var lg = el('div', 'ov-legend');
    [1, 2, 3].forEach(function (t) { var s = el('span', 'ov-lg'); s.style.setProperty('--sc', 'var(' + TIER_C[t] + ')'); s.appendChild(el('i')); s.appendChild(bi(T2('T' + t + ' = ' + TIERS[t - 1].name.ar, 'T' + t + ' = ' + TIERS[t - 1].name.en))); lg.appendChild(s); });
    host.appendChild(lg);
  }

  /* =============================================================== tiers, parts, wiring, steps */
  function sumParts(upTo, onlyThis) {
    var core = { lo: 0, hi: 0 }, opt = { lo: 0, hi: 0 };
    PARTS.forEach(function (p) {
      if (p.t > upTo || (onlyThis && p.t !== upTo)) return;
      var b = p.k === 'opt' ? opt : core; b.lo += p.lo; b.hi += p.hi;
    });
    return { core: core, opt: opt };
  }
  function tierPick(id) {
    var host = clear($('#' + id));
    var lab = el('span', 'lbl'); lab.appendChild(bi(T2('المستوى:', 'Tier:'))); host.appendChild(lab);
    TIERS.forEach(function (t) {
      var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('aria-pressed', String(state.tier === t.n)); b.appendChild(bi(t.short));
      b.addEventListener('click', function () { setTier(t.n); });
      host.appendChild(b);
    });
  }
  function renderTierCards() {
    var host = clear($('#tier-cards'));
    TIERS.forEach(function (t) {
      var s = sumParts(t.n, true), c = el('article', 'card tier rv');
      c.setAttribute('aria-current', String(state.tier === t.n)); c.dataset.tier = t.n;
      var h = el('div', 'tier-h'); h.appendChild(el('span', 'tier-n', String(t.n)));
      var h3 = el('h3'); h3.appendChild(bi(t.name)); var sm = el('small'); sm.appendChild(bi(t.sub)); h3.appendChild(sm); h.appendChild(h3); c.appendChild(h);
      var cost = el('div', 'tier-cost');
      var k1 = el('div', 'kpi'), b1 = el('b', 'num', 'US$ ' + range(s.core.lo, s.core.hi)); k1.appendChild(b1); var l1 = el('span'); l1.appendChild(bi(T2('يضيف (تقدير)', 'adds (estimate)'))); k1.appendChild(l1); cost.appendChild(k1);
      var k2 = el('div', 'kpi'); var b2 = el('b'); b2.appendChild(bi(t.time)); b2.style.fontSize = '.9rem'; b2.style.fontFamily = 'var(--font-h)'; k2.appendChild(b2); var l2 = el('span'); l2.appendChild(bi(T2('وقت البناء', 'build time'))); k2.appendChild(l2); cost.appendChild(k2);
      c.appendChild(cost);
      var ul = el('ul', 'plain-list'); t.you.forEach(function (y) { var li = el('li'); li.appendChild(bi(y)); ul.appendChild(li); }); c.appendChild(ul);
      var p = el('p', 'small'); var bb = el('b'); bb.appendChild(bi(T2('ما تراه اللجنة: ', 'What judges see: '))); p.appendChild(bb); p.appendChild(bi(t.judge)); c.appendChild(p);
      var btn = el('button', 'btn btn-ghost btn-sm'); btn.type = 'button'; btn.appendChild(bi(state.tier === t.n ? T2('هذا مستواك الحالي', 'This is your tier') : T2('اختر هذا المستوى', 'Choose this tier')));
      btn.addEventListener('click', function () { setTier(t.n); });
      c.appendChild(btn);
      host.appendChild(c);
    });
    Manara.reveal(host);
  }
  function renderParts() {
    var tb = clear($('#parts-body')), tf = clear($('#parts-foot'));
    PARTS.forEach(function (p) {
      if (p.t > state.tier) return;
      var tr = el('tr', p.t === state.tier && state.tier > 1 ? 'add' : null);
      var c1 = cell(tr, T2('القطعة', 'Part'), null, 'pn');
      var bd = el('span', 'tier-badge t' + p.t, 'T' + p.t); c1.appendChild(bd); c1.appendChild(document.createTextNode(' ')); c1.appendChild(bi(p.n));
      cell(tr, T2('العدد', 'Qty'), p.q, 'num');
      var c3 = cell(tr, T2('السعر التقريبي (US$)', 'Estimated price (US$)'), p.hi === 0 ? '0' : 'US$ ' + range(p.lo, p.hi), 'price');
      var tg = p.k === 'seen' ? tag('cool', T2('رُصد', 'seen')) : p.k === 'own' ? tag('safe', T2('عندك غالبًا', 'you may own it')) : p.k === 'opt' ? tag('info', T2('اختياري', 'optional')) : tag('warn', T2('تقدير', 'estimate'));
      c3.appendChild(document.createTextNode(' ')); c3.appendChild(tg);
      cell(tr, T2('لماذا نحتاجها', 'What it is for'), bi(p.role));
      cell(tr, T2('ملاحظة', 'Note'), p.note.ar || p.note.en ? bi(p.note) : '–');
      tb.appendChild(tr);
    });
    var tot = sumParts(state.tier, false), mine = sumParts(state.tier, true), tr = el('tr');
    var a = cell(tr, T2('المجموع', 'Total'), null, 'pn'); a.appendChild(bi(T2('المجموع حتى هذا المستوى (بلا الاختياري)', 'Total up to this tier (without optional)')));
    cell(tr, T2('العدد', 'Qty'), '');
    cell(tr, T2('السعر التقريبي (US$)', 'Estimated price (US$)'), 'US$ ' + range(tot.core.lo, tot.core.hi), 'price');
    cell(tr, T2('لماذا نحتاجها', 'What it is for'), '');
    cell(tr, T2('ملاحظة', 'Note'), bi(T2('تقدير تخطيطي؛ الأسعار تتغيّر.', 'A planning estimate; prices move.')));
    tf.appendChild(tr);
    var k = clear($('#parts-totals'));
    [['', T2('هذا المستوى يضيف (بلا الاختياري)', 'This tier adds (without optional)'), 'US$ ' + range(mine.core.lo, mine.core.hi)],
     ['cool', T2('المجموع حتى هذا المستوى', 'Total up to this tier'), 'US$ ' + range(tot.core.lo, tot.core.hi)],
     ['warn', T2('اختياري حتى هذا المستوى', 'Optional up to this tier'), tot.opt.hi ? 'US$ ' + range(tot.opt.lo, tot.opt.hi) : '–']].forEach(function (r) {
      var d = el('div', 'kpi ' + r[0]); d.appendChild(el('b', 'num', r[2])); var s = el('span'); s.appendChild(bi(r[1])); d.appendChild(s); k.appendChild(d);
    });
  }
  function gpioLabel(p) { return p.pin || (p.gpio != null ? 'GPIO' + p.gpio : '–'); }
  function renderWiring() {
    var tb = clear($('#pin-body'));
    PINS.forEach(function (p) {
      if (p.t > state.tier) return;
      var tr = el('tr', p.t === state.tier && state.tier > 1 ? 'add' : null);
      var c1 = cell(tr, T2('القطعة', 'Part'), null, 'pn'); if (typeof p.part === 'string') c1.appendChild(document.createTextNode(p.part)); else c1.appendChild(bi(p.part));
      if (p.opt) { c1.appendChild(document.createTextNode(' ')); c1.appendChild(tag('info', T2('اختياري', 'optional'))); }
      if (p.second) { c1.appendChild(document.createTextNode(' ')); c1.appendChild(tag('cool', T2('لوحة ثانية', '2nd board'))); }
      cell(tr, T2('إشارة القطعة', 'Part signal'), typeof p.sig === 'string' ? p.sig : bi(p.sig), 'mono');
      var c3 = cell(tr, T2('طرف ESP32', 'ESP32 pin'), gpioLabel(p), 'num'); c3.style.fontWeight = '700';
      cell(tr, T2('ملاحظة التوصيل', 'Wiring note'), p.note.ar || p.note.en ? bi(p.note) : '–');
      cell(tr, T2('المستوى', 'Tier'), el('span', 'tier-badge t' + p.t, 'T' + p.t));
      tb.appendChild(tr);
    });
    renderPinDiagram();
  }
  // 30-pin DOIT-style DevKit, USB at the bottom: left header then right header, listed top to bottom.
  var HDR_L = [['EN', null], ['VP', 36], ['VN', 39], ['D34', 34], ['D35', 35], ['D32', 32], ['D33', 33], ['D25', 25], ['D26', 26], ['D27', 27], ['D14', 14], ['D12', 12], ['D13', 13], ['GND', null], ['VIN', null]];
  var HDR_R = [['D23', 23], ['D22', 22], ['TX0', 1], ['RX0', 3], ['D21', 21], ['D19', 19], ['D18', 18], ['D5', 5], ['TX2', 17], ['RX2', 16], ['D4', 4], ['D2', 2], ['D15', 15], ['GND', null], ['3V3', null]];
  var SHORT = { 21: 'I2C SDA', 22: 'I2C SCL', 34: 'MQ-2 AO', 35: 'MQ-7 AO', 23: 'HC-SR04 TRIG', 19: 'HC-SR04 ECHO', 33: 'Float switch', 4: 'SOS button', 13: 'Exit A', 14: 'Exit B', 27: 'Exit R', 18: 'WS2812 DIN', 32: 'Buzzer', 25: 'MPU6050 SDA', 26: 'MPU6050 SCL', 16: 'PMS5003 TX', 17: 'Servo pan', 5: 'Servo tilt' };
  function renderPinDiagram() {
    var host = clear($('#pin-diagram'));
    var s = sv('svg', { viewBox: '0 0 560 600', style: 'direction:ltr' }, host);
    sv('rect', { x: 150, y: 14, width: 260, height: 574, rx: 16, 'class': 'pd-body' }, s);
    sv('rect', { x: 190, y: 28, width: 180, height: 150, rx: 8, 'class': 'pd-chip' }, s);
    sv('text', { x: 280, y: 108, 'text-anchor': 'middle', 'class': 'pd-part' }, s, 'ESP32-WROOM-32');
    sv('text', { x: 280, y: 126, 'text-anchor': 'middle', 'class': 'pd-dim' }, s, '2.4 GHz');
    sv('rect', { x: 245, y: 566, width: 70, height: 28, rx: 5, 'class': 'pd-usb' }, s);
    sv('text', { x: 280, y: 556, 'text-anchor': 'middle', 'class': 'pd-dim' }, s, 'USB');
    var byGpio = {};
    PINS.forEach(function (p) { if (p.gpio != null && !p.second) { var key = p.gpio; (byGpio[key] = byGpio[key] || []).push(p); } });
    function col(list, side) {
      list.forEach(function (pp, i) {
        var y = 204 + i * 25, x = side === 'L' ? 150 : 410, used = pp[1] != null && byGpio[pp[1]];
        var users = used ? byGpio[pp[1]] : null, inTier = users ? users.filter(function (u) { return u.t <= state.tier; }) : [];
        var on = inTier.length > 0, tier = on ? inTier[0].t : 0;
        var g = sv('g', on ? { style: '--sc:var(' + (inTier[0].opt ? '--muted' : TIER_C[tier]) + ')' } : null, s);
        var pad = sv('circle', { cx: x, cy: y, r: 7, 'class': 'pd-pad' + (on ? ' used' : '') }, g);
        sv('text', { x: side === 'L' ? x + 14 : x - 14, y: y + 4, 'text-anchor': side === 'L' ? 'start' : 'end', 'class': 'pd-gpio' + (on ? ' used' : '') }, g, pp[0]);
        if (on) {
          var lbl = SHORT[pp[1]] || '?';
          sv('line', { x1: side === 'L' ? x - 7 : x + 7, y1: y, x2: side === 'L' ? x - 26 : x + 26, y2: y, 'class': 'pd-line' }, g);
          sv('text', { x: side === 'L' ? x - 32 : x + 32, y: y + 4, 'text-anchor': side === 'L' ? 'end' : 'start', 'class': 'pd-part' }, g, lbl);
        }
      });
    }
    col(HDR_L, 'L'); col(HDR_R, 'R');
    var lg = sv('g', { 'class': 'pd-legend' }, s);
    [[2, 'Tier 2'], [3, 'Tier 3 / optional']].forEach(function (a, i) {
      sv('circle', { cx: 178 + i * 74, cy: 186, r: 5, style: 'fill:var(' + TIER_C[a[0]] + ')' }, lg);
      sv('text', { x: 188 + i * 74, y: 190, 'text-anchor': 'start' }, lg, a[1]);
    });
  }
  function renderSteps() {
    var host = clear($('#steps-host')), done = jget('steps', {}), vis = STEPS.filter(function (s) { return s.t <= state.tier; });
    function progress() {
      var n = vis.filter(function (s) { return done[s.id]; }).length, pct = vis.length ? M.round(100 * n / vis.length) : 0;
      $('#steps-fill').style.width = pct + '%'; $('#steps-bar').setAttribute('aria-valuenow', String(pct)); $('#steps-count').textContent = num(n) + '/' + num(vis.length);
    }
    vis.forEach(function (s) {
      var li = el('li', 'step rv'); li.dataset.done = done[s.id] ? 'true' : 'false';
      var box = el('div', 'step-box'); box.appendChild(el('span', 'step-n'));
      var cb = el('input'); cb.type = 'checkbox'; cb.id = 'chk-' + s.id; cb.checked = !!done[s.id];
      cb.addEventListener('change', function () { done[s.id] = cb.checked; jset('steps', done); li.dataset.done = cb.checked ? 'true' : 'false'; progress(); });
      box.appendChild(cb); li.appendChild(box);
      var t = el('label', 'step-t'); t.setAttribute('for', cb.id); t.appendChild(el('span', 'tier-badge t' + s.t, 'T' + s.t)); t.appendChild(bi(s.ti)); li.appendChild(t);
      var d = el('p'); d.appendChild(bi(s.d)); li.appendChild(d);
      var p = el('div', 'pass'); var pb = el('b'); pb.appendChild(bi(T2('تنجح حين: ', 'Pass when: '))); p.appendChild(pb); p.appendChild(bi(s.p)); li.appendChild(p);
      var f = el('p', 'fail'); var fb = el('b'); fb.appendChild(bi(T2('إن لم ينجح: ', 'If it fails: '))); f.appendChild(fb); f.appendChild(bi(s.f)); li.appendChild(f);
      host.appendChild(li);
    });
    progress(); Manara.reveal(host);
  }
  function setTier(t) {
    state.tier = t; store('tier', String(t));
    ['tier-pick-parts', 'tier-pick-wiring', 'tier-pick-steps'].forEach(tierPick);
    renderTierCards(); renderParts(); renderWiring(); renderSteps();
  }

  /* =============================================================== warm-up timers */
  var TIMERS = [
    { id: 'mlx', secs: 240, c: '--brand', name: T2('إحماء الكاميرا الحرارية MLX90640 (≈ 4 دقائق)', 'MLX90640 thermal warm-up (≈ 4 min)'),
      ph: [{ upTo: 240, t: T2('اتركها تعمل في الغرفة نفسها دون لمس. الحلقة زرقاء.', 'Let it run in the room it will stay in. Do not touch it. The ring is blue.') }],
      done: T2('انتهى: تتحول الحلقة إلى الأخضر ويُعتمد مفتاح الحرارة.', 'Done: the ring turns green and the thermal key is trusted.') },
    { id: 'mq', secs: 300, c: '--warn', name: T2('إحماء حسّاسات الغاز + خط الأساس (3 + 2 دقيقة)', 'Gas sensors warm-up + baseline (3 + 2 min)'),
      ph: [{ upTo: 180, t: T2('التسخين: ابعد المعقّم والعطور عن الغرفة.', 'Heating: keep sanitiser and perfume out of the room.') }, { upTo: 300, t: T2('تسجيل الهواء النظيف (خط الأساس): لا تقرّب شيئًا.', 'Recording clean air (the baseline): bring nothing near.') }],
      done: T2('انتهى: مفاتيح الغاز والدخان مسلّحة (القراءات إرشادية).', 'Done: the gas and smoke keys are armed (readings are indicative).') }
  ];
  function renderTimers() {
    var host = clear($('#timers-host')), C = 2 * M.PI * 40;
    TIMERS.forEach(function (tm) {
      var card = el('div', 'card timer rv'); card.style.setProperty('--sc', 'var(' + tm.c + ')');
      var ring = el('div', 'timer-ring'), svg = sv('svg', { viewBox: '0 0 96 96', 'aria-hidden': 'true' }, ring);
      sv('circle', { cx: 48, cy: 48, r: 40, 'class': 'bg' }, svg);
      var fg = sv('circle', { cx: 48, cy: 48, r: 40, 'class': 'fg', 'stroke-dasharray': String(C), 'stroke-dashoffset': String(C) }, svg);
      var tx = el('b', 'num', Manara.clock(tm.secs)); ring.appendChild(tx); card.appendChild(ring);
      var right = el('div'); var h3 = el('h3'); h3.appendChild(bi(tm.name)); right.appendChild(h3);
      var phase = el('p', 'phase'); right.appendChild(phase);
      var btns = el('div', 'btns'), go = el('button', 'btn btn-cool btn-sm'), rs = el('button', 'btn btn-ghost btn-sm');
      go.type = rs.type = 'button'; btns.appendChild(go); btns.appendChild(rs); right.appendChild(btns); card.appendChild(right);
      var left = tm.secs, endAt = 0, run = null;
      function paint() {
        tx.textContent = Manara.clock(left); fg.setAttribute('stroke-dashoffset', String(C * (left / tm.secs)));
        var el0 = tm.secs - left, p = tm.ph.filter(function (q) { return el0 < q.upTo; })[0];
        phase.textContent = left <= 0 ? L(tm.done) : (run || left < tm.secs ? (p ? L(p.t) : '') : L(T2('اضغط «ابدأ» حين توصّل الطاقة.', 'Press “Start” when you power the board.')));
        go.textContent = run ? L(T2('إيقاف مؤقت', 'Pause')) : (left < tm.secs && left > 0 ? L(T2('تابع', 'Resume')) : L(T2('ابدأ', 'Start')));
        rs.textContent = L(T2('إعادة', 'Reset'));
        card.classList.toggle('done', left <= 0);
      }
      function tick() {
        left = M.max(0, M.round((endAt - nowMs()) / 1000));
        if (left <= 0) { clearInterval(run); run = null; Manara.toast(tm.done, 'safe', 6000); var s = $('#live-say'); if (s) s.textContent = L(tm.done); }
        paint();
      }
      go.addEventListener('click', function () {
        if (left <= 0) left = tm.secs;
        if (run) { clearInterval(run); run = null; paint(); return; }
        endAt = nowMs() + left * 1000; run = setInterval(tick, 250); tick();
      });
      rs.addEventListener('click', function () { if (run) clearInterval(run); run = null; left = tm.secs; paint(); });
      window.addEventListener('langchange', paint);
      paint(); host.appendChild(card);
    });
    Manara.reveal(host);
  }

  /* =============================================================== static tables: rules, stand-ins, booth, script, ownership, kit */
  function renderRules() {
    var tb = clear($('#rules-body'));
    RULES.forEach(function (r) {
      var tr = el('tr'); cell(tr, T2('الخطر', 'Hazard'), bi(r.hz), 'pn'); cell(tr, T2('المفتاح الأول', 'Key 1'), bi(r.k1)); cell(tr, T2('المفتاح الثاني', 'Key 2'), bi(r.k2)); cell(tr, T2('النتيجة', 'Result'), bi(r.res)); tb.appendChild(tr);
    });
  }
  function renderStandins() {
    var tb = clear($('#standins-body'));
    STANDINS.forEach(function (r) {
      var tr = el('tr'); cell(tr, T2('الخطر', 'Hazard'), bi(r.hz), 'pn'); cell(tr, T2('البديل على الطاولة', 'Stand-in on the table'), bi(r.si)); cell(tr, T2('كيف ترى اللوحة ذلك', 'How the board sees it'), bi(r.see)); cell(tr, T2('صدق العرض', 'Honest note'), bi(r.note)); tb.appendChild(tr);
    });
  }
  function renderScript() {
    var tb = clear($('#script-body'));
    SCRIPT.forEach(function (r) {
      var tr = el('tr'); cell(tr, T2('الوقت', 'Time'), r.tm, 'time-cell'); cell(tr, T2('يفعل الحكم', 'The judge does'), bi(r.judge)); cell(tr, T2('تقول (جملة واحدة)', 'You say (one line)'), bi(r.say)); cell(tr, T2('الدليل على الشاشة', 'Proof on screen'), bi(r.proof)); tb.appendChild(tr);
    });
  }
  function renderBooth() {
    var host = clear($('#booth-svg')), s = sv('svg', { viewBox: '0 0 560 390', style: 'direction:ltr' }, host);
    sv('rect', { x: 150, y: 6, width: 260, height: 20, rx: 6, 'class': 'bt-table' }, s);
    svBi('text', { x: 280, y: 20, 'class': 'bt-lbl' }, s, T2('اللوحة والملصق', 'Poster'));
    sv('rect', { x: 14, y: 36, width: 532, height: 230, rx: 16, 'class': 'bt-table' }, s);
    var items = [
      [1, '--accent', 200, 62, 160, 96, T2('اللوحة التوأم', 'Twin board'), T2('+ الحارس', '+ sentinel')],
      [2, '--brand', 32, 62, 140, 84, T2('الحاسوب', 'Laptop'), T2('غرفة العمليات', 'Mission Control')],
      [3, '--info', 388, 62, 140, 84, T2('جدار الهواتف', 'Phone wall'), T2('4 هواتف', '4 phones')],
      [4, '--safe', 388, 164, 140, 84, T2('اللوحي + «آمن»', 'Tablet + SAFE'), T2('عدّاد + QR', 'counter + QR')],
      [5, '--warn', 32, 164, 140, 84, T2('مختبر الأدلة', 'Evidence Lab'), T2('كاميرا + خدع', 'webcam + decoys')],
      [6, '--danger', 200, 178, 160, 70, T2('صينية البدائل', 'Stand-ins tray'), T2('كوب · مسحة · ماء', 'mug · swab · water')]
    ];
    items.forEach(function (it) {
      var g = sv('g', { style: '--sc:var(' + it[1] + ')' }, s);
      sv('rect', { x: it[2], y: it[3], width: it[4], height: it[5], rx: 12, 'class': 'bt-item' }, g);
      sv('text', { x: it[2] + 20, y: it[3] + 26, 'class': 'bt-num' }, g, String(it[0]));
      svBi('text', { x: it[2] + it[4] / 2, y: it[3] + it[5] / 2 + 4, 'class': 'bt-lbl' }, g, it[6]);
      svBi('text', { x: it[2] + it[4] / 2, y: it[3] + it[5] / 2 + 20, 'class': 'bt-lbl', style: 'font-weight:500;fill:var(--muted)' }, g, it[7]);
    });
    sv('path', { d: 'M70 300q210 60 420 0', 'class': 'bt-judge' }, s);
    [150, 280, 410].forEach(function (x) { sv('circle', { cx: x, cy: 322, r: 11, 'class': 'bt-judge' }, s); });
    svBi('text', { x: 280, y: 368, 'class': 'bt-judge-t' }, s, T2('مكان وقوف اللجنة: وجهًا لوجه مع الشاشة', 'Where the judges stand: facing the screen'));
    var ol = clear($('#touch-list'));
    TOUCH.forEach(function (t, i) {
      var li = el('li'); li.style.setProperty('--sc', 'var(' + t.c + ')'); li.appendChild(el('span', 'tn', String(i + 1)));
      var d = el('div'); var b = el('b'); b.appendChild(bi(t.t)); d.appendChild(b); var sp = el('span', 'd'); sp.appendChild(bi(t.d)); d.appendChild(sp); li.appendChild(d); ol.appendChild(li);
    });
  }
  var ownText = '';
  function ownState() { return jget('own', {}); }
  function renderOwnership() {
    var tb = clear($('#own-body')), st = ownState();
    OWN.forEach(function (r) {
      var cur = st[r.id] || { w: r.w, n: r.n }, tr = el('tr');
      cell(tr, T2('الجزء', 'Part of the work'), bi(r.p), 'pn');
      var sel = el('select'); sel.id = 'who-' + r.id; sel.setAttribute('aria-label', r.p.en + ' / ' + r.p.ar);
      WHO.forEach(function (o) { var op = el('option', null, L(o.l)); op.value = o.v; op.dataset.ar = o.l.ar; op.dataset.en = o.l.en; if (o.v === cur.w) op.selected = true; sel.appendChild(op); });
      var inp = el('input', 'input'); inp.type = 'text'; inp.value = cur.n || ''; inp.maxLength = 160; inp.setAttribute('aria-label', L(T2('دليل أو ملاحظة', 'Evidence or note'))); if (r.ph) { inp.dataset.ar = r.ph.ar; inp.dataset.en = r.ph.en; inp.placeholder = L(r.ph); }
      function save() { var s = ownState(); s[r.id] = { w: sel.value, n: inp.value }; jset('own', s); }
      sel.addEventListener('change', save); inp.addEventListener('input', save);
      cell(tr, T2('من فعله؟', 'Who did it?'), sel); cell(tr, T2('دليل أو ملاحظة', 'Evidence or note'), inp);
      tb.appendChild(tr);
    });
    var ex = clear($('#explain-host')), done = jget('explain', {});
    EXPLAIN.forEach(function (e) {
      var li = el('li'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'ex-' + e.id; cb.checked = !!done[e.id];
      cb.addEventListener('change', function () { var d = jget('explain', {}); d[e.id] = cb.checked; jset('explain', d); });
      var lb = el('label'); lb.setAttribute('for', cb.id); var b = el('b'); b.appendChild(bi(e.t)); lb.appendChild(b); var d = el('span', 'd'); d.appendChild(bi(e.d)); lb.appendChild(d);
      li.appendChild(cb); li.appendChild(lb); ex.appendChild(li);
    });
  }
  function ownRows() {
    var st = ownState();
    return OWN.map(function (r) {
      var c = st[r.id] || { w: r.w, n: r.n }, who = WHO.filter(function (o) { return o.v === c.w; })[0] || WHO[0];
      return [L(r.p), who.v ? L(who.l) : '', c.n || ''];
    });
  }
  function ownCsv() {
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    return '﻿' + [[L(T2('الجزء', 'Part of the work')), L(T2('من فعله', 'Who did it')), L(T2('دليل أو ملاحظة', 'Evidence or note'))]].concat(ownRows()).map(function (r) { return r.map(q).join(','); }).join('\r\n');
  }
  function bindOwnButtons() {
    var note = $('#own-note');
    $('#own-copy').addEventListener('click', function () {
      var txt = ownRows().map(function (r) { return r[0] + ' — ' + (r[1] || '?') + (r[2] ? ' — ' + r[2] : ''); }).join('\n');
      function ok() { note.textContent = L(T2('نُسخ الجدول.', 'Table copied.')); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { ownText = txt; note.textContent = L(T2('تعذّر النسخ: استعمل CSV.', 'Copy blocked: use the CSV.')); });
      else { ownText = txt; note.textContent = L(T2('تعذّر النسخ: استعمل CSV.', 'Copy blocked: use the CSV.')); }
    });
    $('#own-csv').addEventListener('click', function () { download('manara-ownership.csv', ownCsv(), 'text/csv;charset=utf-8'); });
    $('#own-reset').addEventListener('click', function () { jset('own', {}); jset('explain', {}); renderOwnership(); note.textContent = L(T2('أُعيد الجدول.', 'Table reset.')); });
  }
  function renderKit() {
    var host = clear($('#kit-host'));
    KIT.forEach(function (k) {
      var c = el('article', 'card kit-file rv'), h = el('h3'); h.appendChild(el('code', null, k.n)); h.appendChild(el('span', 'tag cool', k.tg)); c.appendChild(h);
      var p = el('p', 'small'); p.appendChild(bi(k.d)); c.appendChild(p);
      var code = el('p', 'small muted'); code.appendChild(el('code', null, k.f)); c.appendChild(code);
      var b = el('div', 'btns'), a = el('a', 'btn btn-primary btn-sm'); a.href = k.f; a.setAttribute('download', k.n);
      a.insertAdjacentHTML('afterbegin', Manara.icon('download')); a.appendChild(bi(T2('حمّل', 'Download'))); b.appendChild(a); c.appendChild(b);
      host.appendChild(c);
    });
    Manara.reveal(host);
    $('#proto-sample').textContent = [
      '// board → browser  (≈ 4 Hz, one JSON object per line)',
      '{"v":1,"type":"frame","ms":12345,"thermal":{"tmax":41.2,"tmean":29.8,"hot":{"x":0.62,"y":0.31,"t":41.2}},"gas":{"mq2":312,"mq7":40},',
      ' "air":{"t":33.5,"rh":61,"hi":41.0,"wbgt":31.2},"water":{"cm":1.2},"sos":false,"fall":false,"exits":{"A":"open","B":"locked","R":"open"},',
      ' "local":{"alarm":true,"hazard":"fire"}}',
      '// board → browser  (≈ 1 Hz) thermal image, 32×24 row-major, °C × 10 as integers',
      '{"v":1,"type":"grid","w":32,"h":24,"t10":[295,296,…]}',
      '// MANARA-SAFE → browser',
      '{"v":1,"type":"checkin","room":"203","status":"safe","lang":"ml"}',
      '// browser → board  (the board never lets this silence a local alarm)',
      '{"v":1,"type":"signs","A":"go","B":"stop","R":"go","siren":"on","ring":"red","hazard":"fire"}',
      '// lines that start with # are human notes: every parser ignores them',
      '# I2C bus 0 devices: 0x33 0x44 (expect 0x33 MLX90640, 0x44 SHT31)'
    ].join('\n');
  }

  /* =============================================================== protocol v1: validation */
  var HAZ = ['none', 'fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
  var KEYS = {
    frame: ['v', 'type', 'ms', 'thermal', 'gas', 'air', 'pm', 'water', 'sos', 'fall', 'exits', 'local'],
    grid: ['v', 'type', 'w', 'h', 't10'],
    checkin: ['v', 'type', 'room', 'status', 'lang'],
    signs: ['v', 'type', 'A', 'B', 'R', 'siren', 'ring', 'hazard']
  };
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  // Returns null when the message is valid protocol v1, else a short reason (shown in the log).
  function validate(m) {
    if (!isObj(m)) return 'not a JSON object';
    if (m.v !== 1) return 'v must be 1';
    if (typeof m.type !== 'string') return 'missing "type"';
    var k, o;
    if (m.type === 'frame') {
      if (!isNum(m.ms)) return '"ms" must be a number';
      if (m.thermal !== undefined) {
        o = m.thermal;
        if (!isObj(o) || !isNum(o.tmax) || !isNum(o.tmean)) return 'thermal needs numeric tmax and tmean';
        if (o.hot !== undefined && (!isObj(o.hot) || !isNum(o.hot.x) || !isNum(o.hot.y) || !isNum(o.hot.t) || o.hot.x < 0 || o.hot.x > 1 || o.hot.y < 0 || o.hot.y > 1)) return 'thermal.hot needs x, y in 0..1 and t';
      }
      if (m.gas !== undefined) {
        o = m.gas;
        if (!isObj(o) || (o.mq2 !== undefined && !isNum(o.mq2)) || (o.mq7 !== undefined && !isNum(o.mq7))) return 'gas.mq2 / gas.mq7 must be numbers';
      }
      if (m.air !== undefined) {
        o = m.air;
        if (!isObj(o) || !isNum(o.t) || !isNum(o.rh)) return 'air needs numeric t and rh';
        for (k = 0; k < 2; k++) if (o[['hi', 'wbgt'][k]] !== undefined && !isNum(o[['hi', 'wbgt'][k]])) return 'air.' + ['hi', 'wbgt'][k] + ' must be a number';
      }
      if (m.pm !== undefined && (!isObj(m.pm) || !isNum(m.pm.pm25) || !isNum(m.pm.pm10))) return 'pm needs numeric pm25 and pm10';
      if (m.water !== undefined && (!isObj(m.water) || !isNum(m.water.cm))) return 'water.cm must be a number';
      if (m.sos !== undefined && typeof m.sos !== 'boolean') return '"sos" must be true or false';
      if (m.fall !== undefined && typeof m.fall !== 'boolean') return '"fall" must be true or false';
      if (m.exits !== undefined) {
        if (!isObj(m.exits)) return 'exits must be an object';
        for (k in m.exits) if (Object.prototype.hasOwnProperty.call(m.exits, k) && ['A', 'B', 'R'].indexOf(k) < 0) return 'unknown exit "' + String(k).slice(0, 8) + '"';
        for (k = 0; k < 3; k++) { var e = m.exits[['A', 'B', 'R'][k]]; if (e !== undefined && e !== 'open' && e !== 'locked') return 'exit states are "open" or "locked"'; }
      }
      if (m.local !== undefined && (!isObj(m.local) || typeof m.local.alarm !== 'boolean' || HAZ.indexOf(m.local.hazard) < 0)) return 'local needs alarm (true/false) and a known hazard';
      return null;
    }
    if (m.type === 'grid') {
      if (m.w !== 32 || m.h !== 24) return 'grid must be 32 x 24';
      if (!Array.isArray(m.t10) || m.t10.length !== 768) return 't10 must hold 768 numbers';
      for (k = 0; k < 768; k++) if (!isNum(m.t10[k]) || M.floor(m.t10[k]) !== m.t10[k]) return 't10 must be integers (°C × 10)';
      return null;
    }
    if (m.type === 'checkin') {
      if (typeof m.room !== 'string' || !/^[0-9A-Za-z-]{1,6}$/.test(m.room)) return 'room must be 1–6 letters, digits or -';
      if (m.status !== 'safe' && m.status !== 'help') return 'status is "safe" or "help"';
      if (typeof m.lang !== 'string' || !/^[a-z]{2,3}$/.test(m.lang)) return 'lang must be a 2–3 letter code';
      return null;
    }
    if (m.type === 'signs') {
      for (k = 0; k < 3; k++) { var s = m[['A', 'B', 'R'][k]]; if (s !== undefined && ['go', 'stop', 'off'].indexOf(s) < 0) return 'A/B/R are go, stop or off'; }
      if (m.siren !== undefined && m.siren !== 'on' && m.siren !== 'off') return 'siren is on or off';
      if (m.ring !== undefined && ['green', 'amber', 'red', 'off'].indexOf(m.ring) < 0) return 'ring is green, amber, red or off';
      if (m.hazard !== undefined && HAZ.indexOf(m.hazard) < 0) return 'unknown hazard';
      return null;
    }
    return 'unknown type "' + String(m.type).slice(0, 16) + '"';
  }
  function extraKeys(m) { var ok = KEYS[m.type] || [], out = []; for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && ok.indexOf(k) < 0) out.push(k); return out; }

  /* =============================================================== the same formulas and hot-spot rule as the firmware and js/detect.js */
  function stullWetBulb(T, RH) {                      // Stull (2011), J. Appl. Meteor. Climatol. 50:2267-2269
    var rh = clamp(RH, 5, 99), at = M.atan;
    return T * at(0.151977 * M.sqrt(rh + 8.313659)) + at(T + rh) - at(rh - 1.676331) + 0.00391838 * M.pow(rh, 1.5) * at(0.023101 * rh) - 4.686035;
  }
  function wbgtEstimate(T, RH) { return 0.7 * stullWetBulb(T, RH) + 0.3 * T; }   // shade / indoors: an ESTIMATE
  function heatIndexC(Tc, RH) {                       // NWS Rothfusz regression with the published adjustments (computed in °F)
    var T = Tc * 9 / 5 + 32, hi = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094);
    if ((hi + T) / 2 >= 80) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH - 0.00683783 * T * T - 0.05481717 * RH * RH + 0.00122874 * T * T * RH + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH;
      if (RH < 13 && T >= 80 && T <= 112) hi -= ((13 - RH) / 4) * M.sqrt((17 - M.abs(T - 95)) / 17);
      else if (RH > 85 && T >= 80 && T <= 87) hi += ((RH - 85) / 10) * ((87 - T) / 5);
    }
    return (hi - 32) * 5 / 9;
  }
  // absolute: hottest pixel >= 57 °C; contextual: > background mean + max(3·max(MAD, 0.25), 6 °C), background = coolest 80 % of pixels
  function hotspotTest(g) {
    var n = g.length, i, s = Array.prototype.slice.call(g).sort(function (a, b) { return a - b; }), nb = M.max(4, M.floor(n * 0.8)), sum = 0, all = 0, tmax = -1e9, ix = 0;
    for (i = 0; i < nb; i++) sum += s[i];
    var mean = sum / nb, dev = 0;
    for (i = 0; i < nb; i++) dev += M.abs(s[i] - mean);
    var mad = dev / nb, ctxThr = mean + M.max(3 * M.max(mad, 0.25), 6);
    for (i = 0; i < n; i++) { all += g[i]; if (g[i] > tmax) { tmax = g[i]; ix = i; } }
    return { hot: tmax >= 57 && tmax > ctxThr, tmax: tmax, tmean: all / n, x: (ix % 32) / 31, y: M.floor(ix / 32) / 23, idx: ix, bgMean: mean, mad: mad, ctxThr: ctxThr };
  }

  /* =============================================================== virtual board: what the outputs show (same rules as the firmware) */
  var CMD_TTL = 10000;
  function boardOutputs(local, exits, cmd, fresh) {
    var haz = local && local.hazard ? local.hazard : 'none', level = local ? (local.alarm ? 2 : (haz !== 'none' ? 1 : 0)) : 0;
    var lock = { A: !!(exits && exits.A === 'locked'), B: !!(exits && exits.B === 'locked'), R: !!(exits && exits.R === 'locked') };
    var ord = { off: 0, green: 1, amber: 2, red: 3 };
    var ring = level === 2 ? 'red' : level === 1 ? 'amber' : 'green';
    if (fresh && cmd) {
      var cr = cmd.ring || 'off';
      if (cr === 'off') { if (level === 0) ring = 'off'; } else if (ord[cr] > ord[ring]) ring = cr;      // the browser can escalate, never silence
    }
    var signs = { A: 'off', B: 'off', R: 'off' };
    if (level === 2 && (haz === 'fire' || haz === 'gas')) ['A', 'B', 'R'].forEach(function (k) { signs[k] = lock[k] ? 'stop' : 'go'; });
    if (fresh && cmd) ['A', 'B', 'R'].forEach(function (k) { signs[k] = cmd[k] || 'off'; });
    ['A', 'B', 'R'].forEach(function (k) { if (lock[k] && signs[k] === 'go') signs[k] = 'stop'; });          // exit truth
    var siren = (level === 2 && haz !== 'heat' && haz !== 'dust') || !!(fresh && cmd && cmd.siren === 'on');
    return { ring: ring, signs: signs, siren: siren, level: level, haz: haz, lock: lock };
  }

  /* =============================================================== simulated board (SIM): writes the same lines a real board writes */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function gauss(r) { var u = 0; while (u === 0) u = r(); return M.sqrt(-2 * M.log(u)) * M.cos(2 * M.PI * r()); }
  function r1(x) { return M.round(x * 10) / 10; }
  function r2(x) { return M.round(x * 100) / 100; }
  var SIM = { mq2: 310, mq7: 40, s2: 4, s7: 2.2, amb: 26.5, rh: 48, holdMs: 8000 };
  function makeSim(seed) {
    var r = rng(seed || 11);
    var S = { n: 0, ms: 0, scen: 'idle', mug: 0, swab: 0, lastSwab: 0, water: 0, heat: 0, sos: false, locks: { A: false, B: false, R: false },
      k: { hot: 0, smoke: 0, gas: 0, heat: 0 }, hold: {}, trendUntil: 0, level: 0, haz: 'none', grid: new Float32Array(768), last: null, started: false };
    function sustain(name, cond, need) {
      if (!cond) { S.k[name] = 0; return false; }
      if (!S.k[name]) S.k[name] = S.ms || 1;
      return S.ms - S.k[name] >= need;
    }
    function holdLv(h, raw) {
      var o = S.hold[h] || (S.hold[h] = { lv: 0, until: 0 });
      if (raw >= o.lv) { o.lv = raw; o.until = S.ms + (raw ? SIM.holdMs : 0); } else if (S.ms > o.until) o.lv = raw;
      return o.lv;
    }
    function tick() {
      S.n++; S.ms += 250;
      var sc = S.scen;
      var tm = sc === 'mug' || sc === 'fire' ? 1 : 0, tw = sc === 'swab' || sc === 'fire' ? 1 : 0, tf = sc === 'flood' ? 7.2 : 0, th = sc === 'heat' ? 1 : 0;
      S.mug += (tm - S.mug) * (tm ? 0.12 : 0.06);
      S.swab += (tw - S.swab) * (tw ? 0.18 : 0.05);
      S.water += clamp(tf - S.water, -0.25, 0.15);
      S.heat += (th - S.heat) * (th ? 0.10 : 0.05);
      S.sos = sc === 'sos';
      var amb = SIM.amb + 0.2 * M.sin(S.ms / 6000), g = S.grid, x, y, mx = 0.62 * 31, my = 0.38 * 23, dm = (65 - amb) * S.mug;
      for (y = 0; y < 24; y++) for (x = 0; x < 32; x++) {
        g[y * 32 + x] = amb + 0.6 * (y / 23 - 0.5) + gauss(r) * 0.22 + 4 * M.exp(-((x - 4) * (x - 4) + (y - 19) * (y - 19)) / 12.5) + dm * M.exp(-((x - mx) * (x - mx) + (y - my) * (y - my)) / 4.5);
      }
      var hs = hotspotTest(g);
      var mq2 = M.round(SIM.mq2 + 150 * S.swab + gauss(r) * SIM.s2), mq7 = M.round(SIM.mq7 + 38 * S.swab + gauss(r) * SIM.s7);
      var air = { t: SIM.amb + 20.5 * S.heat + gauss(r) * 0.05, rh: SIM.rh - 26 * S.heat + gauss(r) * 0.3 };
      var wb = wbgtEstimate(air.t, air.rh), hi = heatIndexC(air.t, air.rh);
      var i2 = (mq2 - SIM.mq2) / SIM.s2, i7 = (mq7 - SIM.mq7) / SIM.s7, hot = sustain('hot', hs.hot, 5000), smoke = sustain('smoke', i2 >= 3, 2000);
      if (S.swab > S.lastSwab + 0.01) S.trendUntil = S.ms + 30000;
      S.lastSwab = S.swab;
      var top = M.max(i2, i7), low = M.min(i2, i7), gk1 = sustain('gas', top >= 3, 2000), gk2 = gk1 && low >= 3 && S.trendUntil > S.ms;
      var raw = { sos: S.sos ? 2 : 0, fire: (hot ? 1 : 0) + (smoke ? 1 : 0), gas: (gk1 ? 1 : 0) + (gk2 ? 1 : 0),
        flood: S.water >= 6 ? 2 : (S.water >= 3 ? 1 : 0), heat: sustain('heat', wb >= 32.1, 10000) ? 2 : (wb >= 28 ? 1 : 0) };
      var best = 0, bh = 'none';
      ['sos', 'fire', 'gas', 'flood', 'heat'].forEach(function (h) { var lv = holdLv(h, raw[h]); if (lv > best) { best = lv; bh = h; } });
      S.level = best; S.haz = best ? bh : 'none';
      S.last = { ms: S.ms, hs: hs, mq2: mq2, mq7: mq7, air: air, wb: wb, hi: hi };
    }
    function frameLine() {
      var L0 = S.last;
      var o = { v: 1, type: 'frame', ms: L0.ms,
        thermal: { tmax: r1(L0.hs.tmax), tmean: r1(L0.hs.tmean), hot: { x: r2(L0.hs.x), y: r2(L0.hs.y), t: r1(L0.hs.tmax) } },
        gas: { mq2: L0.mq2, mq7: L0.mq7 },
        air: { t: r1(L0.air.t), rh: M.round(L0.air.rh), hi: r1(L0.hi), wbgt: r1(L0.wb) },
        water: { cm: r1(S.water) }, sos: S.sos, fall: false,
        exits: { A: S.locks.A ? 'locked' : 'open', B: S.locks.B ? 'locked' : 'open', R: S.locks.R ? 'locked' : 'open' },
        local: { alarm: S.level === 2, hazard: S.haz } };
      return JSON.stringify(o);
    }
    function gridLine() {
      var t = new Array(768);
      for (var i = 0; i < 768; i++) t[i] = M.round(S.grid[i] * 10);
      return JSON.stringify({ v: 1, type: 'grid', w: 32, h: 24, t10: t });
    }
    return {
      S: S,
      setScenario: function (id) { S.scen = id; },
      setLock: function (k, v) { S.locks[k] = !!v; },
      reset: function () { S.scen = 'idle'; S.mug = S.swab = S.water = S.heat = 0; S.k = { hot: 0, smoke: 0, gas: 0, heat: 0 }; S.hold = {}; S.level = 0; S.haz = 'none'; S.locks = { A: false, B: false, R: false }; },
      step: function (n) {                             // n = number of 250 ms ticks; returns the lines the board would write
        var out = [];
        if (!S.started) { S.started = true; out.push('# MANARA sentinel (SIMULATED, SIM): lines shaped like the real board writes. Warm-up skipped.'); }
        for (var i = 0; i < (n || 1); i++) { tick(); out.push(frameLine()); if (S.n % 4 === 0) out.push(gridLine()); }
        return out;
      }
    };
  }

  /* =============================================================== board monitor (Web Serial + simulation) */
  var HZN = { none: T2('لا شيء', 'none'), fire: T2('حريق ودخان', 'Fire & smoke'), gas: T2('تسرّب غاز', 'Gas leak'), flood: T2('سيول', 'Flash flood'), dust: T2('غبار', 'Dust'), heat: T2('إجهاد حراري', 'Heat stress'), sos: T2('استغاثة', 'SOS') };
  var SCENS = [['idle', T2('هادئ', 'Quiet'), 'check'], ['mug', T2('كوب ساخن (اشتباه)', 'Hot mug (SUSPECT)'), 'thermo'], ['swab', T2('مسحة معقّم (غاز)', 'Sanitiser swab (gas)'), 'wind'],
    ['fire', T2('كوب + مسحة (إنذار حريق)', 'Mug + swab (fire ALARM)'), 'fire'], ['flood', T2('ماء في الكوب', 'Water in the cup'), 'box'], ['heat', T2('مجفّف شعر (حرارة)', 'Hair dryer (heat)'), 'sun'], ['sos', T2('ضغط SOS', 'SOS press'), 'alert']];
  var CMDS = [['go', T2('كل «اذهب»', 'All GO'), { A: 'go', B: 'go', R: 'go', siren: 'off', ring: 'amber', hazard: 'fire' }],
    ['stop', T2('كل «قف»', 'All STOP'), { A: 'stop', B: 'stop', R: 'stop', siren: 'off', ring: 'amber', hazard: 'fire' }],
    ['siren', T2('صفّارة', 'Siren on'), { A: 'off', B: 'off', R: 'off', siren: 'on', ring: 'red', hazard: 'none' }],
    ['calm', T2('هدوء (حلقة خضراء)', 'Calm (green ring)'), { A: 'off', B: 'off', R: 'off', siren: 'off', ring: 'green', hazard: 'none' }],
    ['off', T2('إطفاء', 'Off'), { A: 'off', B: 'off', R: 'off', siren: 'off', ring: 'off', hazard: 'none' }]];
  var ROOMS = ['101', '105', '203', '204', '302', '305', 'B12'], LANGS = ['ar', 'en', 'ml', 'ne', 'bn', 'ur', 'tl', 'hi'];
  var Mon = { source: 'sim', simOn: true, sim: null, simTimer: null, conns: [], connId: 0, c: { lines: 0, frames: 0, grids: 0, notes: 0, ci: 0, bad: 0 }, last: null, lastAt: 0, grid: null,
    hist: { tmax: [], mq2: [], wbgt: [], water: [] }, rooms: {}, paused: false, raw: [], cmd: null, cmdAt: 0, approved: false, key: '', win: [], scen: 'idle', rnd: rng(5) };
  var U = {};

  function resetData() {
    Mon.last = null; Mon.lastAt = 0; Mon.grid = null; Mon.hist = { tmax: [], mq2: [], wbgt: [], water: [] }; Mon.rooms = {}; Mon.approved = false; Mon.key = ''; Mon.win = [];
    Mon.c = { lines: 0, frames: 0, grids: 0, notes: 0, ci: 0, bad: 0 }; Mon.cmd = null;
  }
  function pushRaw(line) { Mon.raw.push(line); if (Mon.raw.length > 400) Mon.raw.shift(); }
  function logLine(text, cls) {
    if (Mon.paused || !U.log) return;
    var d = el('div', 'ln' + (cls ? ' ' + cls : ''), text), box = U.log, stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    box.appendChild(d);
    while (box.childNodes.length > 140) box.removeChild(box.firstChild);
    if (stick) box.scrollTop = box.scrollHeight;
  }
  function handleLine(line, conn) {
    line = String(line).replace(/\r$/, '');
    if (!line.trim()) return;
    Mon.c.lines++; pushRaw(line);
    if (line.charAt(0) === '#') { Mon.c.notes++; logLine(line, 'lg-note'); updateCounts(); return; }
    var m;
    try { m = JSON.parse(line); } catch (e) { Mon.c.bad++; logLine(line.slice(0, 200) + '   ← ' + L(T2('ليس JSON', 'not JSON')), 'lg-bad'); updateCounts(); return; }
    var err = validate(m);
    if (err) { Mon.c.bad++; logLine(line.slice(0, 160) + '   ← ' + err, 'lg-bad'); updateCounts(); return; }
    var extra = extraKeys(m);
    if (extra.length) logLine('# ' + L(T2('مفاتيح غير معروفة تُتجاهل: ', 'unknown keys ignored: ')) + extra.slice(0, 5).join(', '), 'lg-note');
    if (m.type === 'frame') onFrame(m, conn, line);
    else if (m.type === 'grid') onGrid(m, conn);
    else if (m.type === 'checkin') onCheckin(m, conn, line);
    else logLine('← ' + line.slice(0, 160), 'lg-tx');
    updateCounts();
  }
  function histPush(k, v) { if (!isNum(v)) return; var a = Mon.hist[k]; a.push(v); if (a.length > 120) a.shift(); }
  function onFrame(m, conn, line) {
    Mon.c.frames++; Mon.last = m; Mon.lastAt = nowMs();
    if (conn) { conn.frames++; touchConn(conn, 'sentinel'); }
    Mon.win.push(Mon.lastAt); while (Mon.win.length && Mon.lastAt - Mon.win[0] > 5000) Mon.win.shift();
    histPush('tmax', m.thermal && m.thermal.tmax); histPush('mq2', m.gas && m.gas.mq2); histPush('wbgt', m.air && m.air.wbgt); histPush('water', m.water && m.water.cm);
    logLine(line.length > 190 ? line.slice(0, 190) + '…' : line, 'lg-frame');
    renderLive();
  }
  function onGrid(m, conn) {
    Mon.c.grids++; if (conn) touchConn(conn, 'sentinel');
    var g = new Float32Array(768); for (var i = 0; i < 768; i++) g[i] = m.t10[i] / 10;
    Mon.grid = g;
    logLine('{"v":1,"type":"grid","w":32,"h":24,"t10":[' + m.t10.slice(0, 6).join(',') + ',…]}   (768 ' + L(T2('قيمة', 'values')) + ')', 'lg-grid');
    drawThermal();
  }
  function onCheckin(m, conn, line) {
    Mon.c.ci++; if (conn) touchConn(conn, 'safepoint');
    Mon.rooms[m.room] = m.status;
    logLine(line, 'lg-ci');
    renderCount();
  }

  /* ---------- drawing ---------- */
  var PAL = (function () {
    var stops = [[0, [0, 0, 4]], [0.2, [43, 10, 87]], [0.4, [138, 34, 106]], [0.6, [209, 71, 59]], [0.8, [249, 142, 9]], [1, [252, 255, 164]]], out = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var u = i / 255, k = 0; while (k < stops.length - 2 && u > stops[k + 1][0]) k++;
      var a = stops[k], b = stops[k + 1], f = (u - a[0]) / (b[0] - a[0]);
      for (var c = 0; c < 3; c++) out[i * 3 + c] = M.round(a[1][c] + (b[1][c] - a[1][c]) * f);
    }
    return out;
  })();
  var off = null;
  function drawThermal() {
    var cv = U.th; if (!cv) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!Mon.grid) {
      ctx.fillStyle = tok('--surface-3'); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = tok('--muted'); ctx.font = '600 15px ' + tok('--font-h'); ctx.textAlign = 'center'; ctx.fillText(L(T2('بانتظار الصورة الحرارية…', 'Waiting for the thermal image…')), W / 2, H / 2);
      return;
    }
    if (!off) { off = document.createElement('canvas'); off.width = 32; off.height = 24; }
    var oc = off.getContext('2d'), img = oc.createImageData(32, 24), g = Mon.grid;
    for (var i = 0; i < 768; i++) {
      var u = clamp((g[i] - 15) / 55, 0, 1), p = M.round(u * 255);
      img.data[i * 4] = PAL[p * 3]; img.data[i * 4 + 1] = PAL[p * 3 + 1]; img.data[i * 4 + 2] = PAL[p * 3 + 2]; img.data[i * 4 + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, H);
    var m = Mon.last, h = m && m.thermal && m.thermal.hot;
    if (h) {
      var cx = (h.x * 31 + 0.5) / 32 * W, cy = (h.y * 23 + 0.5) / 24 * H, col = tok('--accent');
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 2 * M.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 22, cy); ctx.lineTo(cx - 9, cy); ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 22, cy); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy - 9); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy + 22); ctx.stroke();
      ctx.direction = 'ltr'; ctx.font = '700 14px ' + tok('--font-m'); ctx.textAlign = cx > W * 0.7 ? 'right' : 'left'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      var tx = cx > W * 0.7 ? cx - 20 : cx + 20, ty = cy < 24 ? cy + 22 : cy - 12, lb = r1(h.t) + ' °C';
      ctx.strokeText(lb, tx, ty); ctx.fillText(lb, tx, ty); ctx.direction = 'inherit';
    }
  }
  function spark(cv, arr, lo, hi, color) {
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = tok('--line'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - 0.5); ctx.lineTo(W, H - 0.5); ctx.stroke();
    if (arr.length < 2) return;
    var mn = lo != null ? lo : M.min.apply(null, arr), mx = hi != null ? hi : M.max.apply(null, arr);
    if (mx - mn < 1) { mx += 0.5; mn -= 0.5; }
    ctx.strokeStyle = tok(color); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    arr.forEach(function (v, i) { var x = i / 119 * W, y = H - 4 - (clamp(v, mn, mx) - mn) / (mx - mn) * (H - 8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    var lx = (arr.length - 1) / 119 * W, ly = H - 4 - (clamp(arr[arr.length - 1], mn, mx) - mn) / (mx - mn) * (H - 8);
    ctx.fillStyle = tok(color); ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 2 * M.PI); ctx.fill();
  }
  function drawSparks() {
    if (!U.sparks) return;
    var defs = [['tmax', '--danger', 15, null], ['mq2', '--warn', null, null], ['wbgt', '--brand', null, null], ['water', '--info', 0, 10]];
    defs.forEach(function (d) {
      var s = U.sparks[d[0]], arr = Mon.hist[d[0]];
      spark(s.cv, arr, d[2], d[3], d[1]);
      s.val.textContent = arr.length ? num(arr[arr.length - 1], d[0] === 'mq2' ? 0 : 1) : '–';
    });
  }

  /* ---------- virtual board (SVG) ---------- */
  var VB = null;
  function buildVBoard() {
    var host = clear(U.vboard), s = sv('svg', { viewBox: '0 0 420 250', style: 'direction:ltr', 'aria-hidden': 'true' }, host);
    sv('rect', { x: 4, y: 4, width: 412, height: 242, rx: 18, 'class': 'vb-case' }, s);
    VB = { signs: {}, ring: [], siren: null };
    ['A', 'B', 'R'].forEach(function (k, i) {
      var x = 24 + i * 128, g = sv('g', null, s);
      sv('rect', { x: x, y: 22, width: 108, height: 56, rx: 10, 'class': 'vb-sign' }, g);
      var path = sv('path', { d: 'M' + (x + 24) + ' 50h60M' + (x + 68) + ' 36l16 14-16 14', fill: 'none', stroke: 'var(--line-2)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'class': 'vb-led' }, g);
      sv('text', { x: x + 54, y: 98, 'text-anchor': 'middle', 'class': 'vb-lbl' }, g, k === 'R' ? 'R · roof' : 'Stair ' + k);
      VB.signs[k] = path; VB.signs[k].x = x;
    });
    var cx = 120, cy = 176;
    for (var i = 0; i < 12; i++) { var a = i / 12 * 2 * M.PI - M.PI / 2; VB.ring.push(sv('circle', { cx: cx + 38 * M.cos(a), cy: cy + 38 * M.sin(a), r: 8, fill: 'var(--line-2)', 'class': 'vb-led' }, s)); }
    sv('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'class': 'vb-lbl' }, s, 'ring');
    var sg = sv('g', { transform: 'translate(262,140)' }, s);
    VB.siren = sv('path', { d: 'M8 24v24h18l26 20V4L26 24zM64 20a22 22 0 0 1 0 32M76 10a38 38 0 0 1 0 52', fill: 'none', stroke: 'var(--muted)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'class': 'vb-led' }, sg);
    sv('text', { x: 300, y: 224, 'text-anchor': 'middle', 'class': 'vb-lbl' }, s, 'buzzer');
  }
  var COL = { green: 'var(--safe)', amber: 'var(--warn)', red: 'var(--danger)', off: 'var(--line-2)', go: 'var(--safe)', stop: 'var(--danger)' };
  function renderVBoard() {
    if (!VB) return;
    var m = Mon.last, fresh = !!Mon.cmd && nowMs() - Mon.cmdAt < CMD_TTL, o = boardOutputs(m ? m.local : null, m ? m.exits : null, Mon.cmd, fresh);
    ['A', 'B', 'R'].forEach(function (k) {
      var p = VB.signs[k], st = o.signs[k], x = p.x;
      p.setAttribute('stroke', COL[st] || COL.off); p.style.opacity = st === 'off' ? '0.45' : '1';
      p.setAttribute('d', st === 'stop' ? 'M' + (x + 38) + ' 36l32 28M' + (x + 70) + ' 36l-32 28' : 'M' + (x + 24) + ' 50h60M' + (x + 68) + ' 36l16 14-16 14');
    });
    VB.ring.forEach(function (c) { c.setAttribute('fill', COL[o.ring]); c.setAttribute('class', 'vb-led' + (o.ring === 'red' ? ' blink' : '')); });
    VB.siren.setAttribute('stroke', o.siren ? 'var(--danger)' : 'var(--muted)');
    VB.siren.setAttribute('class', 'vb-led' + (o.siren ? ' blink' : ''));
    U.vboard.setAttribute('aria-label', L(T2('المخرجات المتوقعة من قواعد الشيفرة: الحلقة ' + o.ring + '، اللافتات A ' + o.signs.A + ' وB ' + o.signs.B + ' وR ' + o.signs.R + '، الصفّارة ' + (o.siren ? 'تعمل' : 'صامتة'),
      'Predicted outputs from the firmware rules: ring ' + o.ring + ', signs A ' + o.signs.A + ', B ' + o.signs.B + ', R ' + o.signs.R + ', siren ' + (o.siren ? 'on' : 'off'))));
  }

  /* ---------- live panels ---------- */
  function say(t) { if (U.say) U.say.textContent = t; }
  function renderLive() {
    var m = Mon.last, hz = m && m.local ? m.local.hazard : 'none', alarm = !!(m && m.local && m.local.alarm);
    var st = !m ? 'none' : alarm ? 'alarm' : hz !== 'none' ? 'suspect' : 'clear';
    if (st !== 'alarm') Mon.approved = false;
    var key = st + ':' + hz, hn = L(HZN[hz] || HZN.none), title, sub = '';
    if (st === 'none') title = L(T2('في انتظار البيانات…', 'Waiting for data…'));
    else if (st === 'clear') { title = L(T2('سليم', 'ALL CLEAR')); sub = L(T2('لا مفتاح مفعّل.', 'No key is active.')); }
    else if (st === 'suspect') { title = L(T2('اشتباه: ', 'SUSPECT: ')) + hn; sub = L(T2('مفتاح واحد لا يكفي: ننتظر مفتاحًا مستقلًّا ثانيًا.', 'One key is not enough: waiting for a second, independent key.')); }
    else { title = L(hz === 'sos' ? T2('إنذار: ', 'ALARM: ') : T2('إنذار محلي: ', 'LOCAL ALARM: ')) + hn; sub = hz === 'sos' ? L(T2('قرار إنسان (ضغطة زر أو سقوط بلا ردّ).', 'A human decision (a button press, or a fall with no answer).')) : L(T2('مفتاحان متفقان: الحلقة والصفّارة واللافتات تعمل الآن؛ الإنذار العام ينتظر الاعتماد.', 'Two keys agree: ring, siren and signs are on now; the public alert waits for approval.')); }
    U.verdict.dataset.state = st; U.verdictText.textContent = title; U.verdictSub.textContent = sub;
    $$('li', U.ladder).forEach(function (li) { var k = li.dataset.k; li.classList.toggle('on', (k === '1' && st !== 'none' && st !== 'clear') || (k === '2' && st === 'alarm') || (k === '3' && st === 'alarm' && Mon.approved)); });
    U.approve.disabled = !(st === 'alarm' && !Mon.approved);
    if (key !== Mon.key) { Mon.key = key; if (m) say(title + '. ' + sub); }
    // flags
    var f = clear(U.flags);
    function flag(cls, ic, text) { var d = el('span', 'flag ' + cls); d.insertAdjacentHTML('afterbegin', Manara.icon(ic)); d.appendChild(document.createTextNode(text)); f.appendChild(d); }
    if (m) {
      flag(m.sos ? 'bad' : '', 'alert', 'SOS: ' + (m.sos ? L(T2('مضغوط', 'pressed')) : L(T2('لا', 'no'))));
      flag(m.fall ? 'bad' : '', 'access', L(T2('سقوط: ', 'Fall: ')) + (m.fall ? L(T2('نعم', 'yes')) : L(T2('لا', 'no'))));
      if (m.exits) ['A', 'B', 'R'].forEach(function (k) { var lk = m.exits[k] === 'locked'; flag(lk ? 'bad' : 'ok', lk ? 'x' : 'check', (k === 'R' ? L(T2('السطح R: ', 'Roof R: ')) : L(T2('الدرج ', 'Stair ')) + k + ': ') + (lk ? L(T2('مقفل', 'locked')) : L(T2('مفتوح', 'open')))); });
    }
    renderKpis(); drawSparks(); drawThermal(); renderVBoard(); refreshAge();
    if (m && m.thermal) { U.thStats.textContent = 'tmax ' + num(m.thermal.tmax, 1) + ' · tmean ' + num(m.thermal.tmean, 1) + ' °C'; }
    if (m && m.thermal && m.thermal.hot) U.th.setAttribute('aria-label', L(T2('الصورة الحرارية: أسخن نقطة ' + num(m.thermal.hot.t, 1) + ' °م عند العمود ' + (M.round(m.thermal.hot.x * 31) + 1) + ' الصف ' + (M.round(m.thermal.hot.y * 23) + 1), 'Thermal image: hottest point ' + num(m.thermal.hot.t, 1) + ' °C at column ' + (M.round(m.thermal.hot.x * 31) + 1) + ' row ' + (M.round(m.thermal.hot.y * 23) + 1))));
    U.thNote.textContent = m && !m.thermal ? L(T2('هذه اللوحة لا ترسل بيانات حرارية (الحسّاس غير موجود).', 'This board sends no thermal data (the sensor is absent).')) : (Mon.source === 'sim' ? L(T2('محاكاة: بقعة الكوب عند (0.62، 0.38) على اللوحة التوأم.', 'Simulation: the mug’s spot is at (0.62, 0.38) on the twin board.')) : '');
  }
  function renderKpis() {
    var m = Mon.last, k = clear(U.kpis);
    function kp(cls, label, val, unit, small) {
      var d = el('div', 'kpi ' + cls), b = el('b', 'num', val == null ? '–' : val); if (unit && val != null) { var u = el('small', null, ' ' + unit); b.appendChild(u); }
      d.appendChild(b); var s = el('span'); s.textContent = label; d.appendChild(s);
      if (small) { var sm = el('small', null, small); d.appendChild(sm); }
      k.appendChild(d);
    }
    var a = m && m.air, g = m && m.gas;
    kp('', L(T2('حرارة الهواء', 'Air temperature')), a ? num(a.t, 1) : null, '°C');
    kp('', L(T2('الرطوبة', 'Humidity')), a ? num(a.rh) : null, '%');
    kp(a && a.wbgt >= 32.1 ? 'danger' : a && a.wbgt >= 28 ? 'warn' : '', 'WBGT ' + L(T2('(تقدير)', '(estimate)')), a && a.wbgt != null ? num(a.wbgt, 1) : null, '°C');
    kp('', L(T2('مؤشر الحرارة', 'Heat index')), a && a.hi != null ? num(a.hi, 1) : null, '°C');
    kp('', 'MQ-2', g && g.mq2 != null ? num(g.mq2) : null, 'mV', L(T2('ملّيفولت لا ppm', 'millivolts, not ppm')));
    kp('', 'MQ-7', g && g.mq7 != null ? num(g.mq7) : null, 'mV');
    var wc = m && m.water ? m.water.cm : null;
    kp(wc != null && wc >= 6 ? 'danger' : wc != null && wc >= 3 ? 'warn' : '', L(T2('عمق الماء', 'Water depth')), wc != null ? num(wc, 1) : null, 'cm', L(T2('مقياس الكوب', 'cup scale')));
    if (m && m.pm) kp('', 'PM10', num(m.pm.pm10), 'µg/m³');
  }
  function renderCount() {
    var s = 0, h = 0, hr = [];
    for (var r in Mon.rooms) if (Object.prototype.hasOwnProperty.call(Mon.rooms, r)) { if (Mon.rooms[r] === 'safe') s++; else { h++; hr.push(r); } }
    U.ciSafe.textContent = num(s); U.ciHelp.textContent = num(h);
    U.ciRooms.textContent = hr.length ? L(T2('غرف تحتاج مساعدة: ', 'Rooms needing help: ')) + hr.join(', ') : L(T2('لا غرف تحتاج مساعدة.', 'No room needs help.'));
  }
  function updateCounts() {
    var c = Mon.c, rate = Mon.win.length > 1 ? (Mon.win.length - 1) / M.max(0.25, (Mon.win[Mon.win.length - 1] - Mon.win[0]) / 1000) : 0;
    U.counts.textContent = num(c.lines) + ' ' + L(T2('سطر', 'lines')) + ' · ' + num(c.frames) + ' ' + L(T2('إطار', 'frames')) + ' · ' + num(c.grids) + ' ' + L(T2('صورة', 'grids')) + ' · ' + num(c.ci) + ' ' + L(T2('تسجيل', 'check-ins')) + ' · ' + num(c.bad) + ' ' + L(T2('خطأ', 'bad')) + (rate ? ' · ≈ ' + num(rate, 1) + '/s' : '');
  }
  function refreshAge() {
    if (!U.age) return;
    if (!Mon.lastAt) { U.age.textContent = '–'; return; }
    var age = (nowMs() - Mon.lastAt) / 1000, rate = Mon.win.length > 1 ? (Mon.win.length - 1) / M.max(0.25, (Mon.win[Mon.win.length - 1] - Mon.win[0]) / 1000) : 0;
    U.age.textContent = (Mon.source === 'live' && age > 3 ? L(T2('لا بيانات منذ ', 'no data for ')) + num(age) + ' s' : L(T2('آخر إطار قبل ', 'last frame ')) + num(age, 1) + ' s' + L(T2('', ' ago'))) + (rate ? ' · ' + num(rate, 1) + '/s' : '');
  }

  /* ---------- sources: simulation and Web Serial ---------- */
  function stopSim() { if (Mon.simTimer) { clearInterval(Mon.simTimer); Mon.simTimer = null; } }
  function startSim() {
    if (Mon.simTimer) return;
    if (!Mon.sim) { Mon.sim = makeSim(11); Mon.sim.setScenario(Mon.scen); }
    Mon.simTimer = setInterval(function () { if (document.hidden) return; Mon.sim.step(1).forEach(function (l) { handleLine(l, null); }); }, 250);
  }
  function updateSource(reset) {
    var live = Mon.conns.length > 0, src = live ? 'live' : (Mon.simOn ? 'sim' : 'none');
    if (reset || src !== Mon.source) { resetData(); clear(U.log); Mon.raw = []; if (src === 'sim') { Mon.sim = null; } }
    Mon.source = src;
    U.srcTag.textContent = live ? 'LIVE' : src === 'sim' ? 'SIM' : 'OFF';
    U.srcTag.className = 'tag ' + (live ? 'safe' : src === 'sim' ? 'warn' : '');
    U.srcText.textContent = live ? L(T2('متصل: ' + Mon.conns.length + ' جهاز. القراءات حقيقية وغير معايَرة (إرشادية).', 'Connected: ' + Mon.conns.length + ' device(s). Readings are real but uncalibrated (indicative).'))
      : src === 'sim' ? L(T2('محاكاة SIM: أسطر بشكل ما تكتبه اللوحة، وليست قياسًا.', 'Simulation (SIM): lines shaped like the real board’s, not a measurement.'))
      : L(T2('لا بيانات: شغّل المحاكاة أو وصّل لوحة.', 'No data: switch on the simulation or connect a board.'));
    $$('.sim-tag').forEach(function (t) { t.hidden = src !== 'sim'; });
    U.simSw.checked = !live && Mon.simOn; U.simSw.disabled = live;
    $$('button', U.scen).forEach(function (b) { b.disabled = src !== 'sim'; });
    $$('button', U.locks).forEach(function (b) { b.disabled = src !== 'sim'; });
    U.checkin.disabled = src !== 'sim';
    if (src === 'sim') startSim(); else stopSim();
    renderConns(); renderLive(); renderCount(); updateCounts();
  }
  function connLabel(c) { return 'USB #' + c.id + ' · ' + (c.kind === 'safepoint' ? 'MANARA-SAFE' : c.kind === 'sentinel' ? L(T2('الحارس', 'sentinel')) : L(T2('جهاز', 'device'))) + ' · ' + num(c.frames) + ' ' + L(T2('إطار', 'frames')); }
  function touchConn(c, kind) { c.kind = kind; if (c.txt) c.txt.nodeValue = connLabel(c); }   // update the chip text in place (never rebuild a button mid-click)
  function renderConns() {
    var host = clear(U.conns);
    Mon.conns.forEach(function (c) {
      var d = el('span', 'conn'); c.txt = document.createTextNode(connLabel(c)); d.appendChild(c.txt);
      var b = el('button', 'btn btn-ghost btn-sm', L(T2('افصل', 'Disconnect'))); b.type = 'button'; b.addEventListener('click', function () { disconnect(c); });
      d.appendChild(b); host.appendChild(d);
    });
  }
  function writeTo(c, line) {
    try {
      if (!c.writer) c.writer = c.port.writable.getWriter();
      c.writer.write(new TextEncoder().encode(line + '\n')).catch(function () { logLine('# ' + L(T2('فشلت الكتابة إلى المنفذ', 'write to the port failed')), 'lg-bad'); });
    } catch (e) { logLine('# ' + L(T2('فشلت الكتابة إلى المنفذ', 'write to the port failed')), 'lg-bad'); }
  }
  function attachPort(port) {
    var c = { id: ++Mon.connId, port: port, buf: '', dec: new TextDecoder(), reader: null, writer: null, frames: 0, kind: '', closed: false };
    Mon.conns.push(c); Mon.simOn = false; updateSource(true);
    var reader = port.readable.getReader(); c.reader = reader;
    (function pump() {
      reader.read().then(function (r) {
        if (r.done || c.closed) { finish(c); return; }
        c.buf += c.dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = c.buf.indexOf('\n')) >= 0) { var ln = c.buf.slice(0, idx); c.buf = c.buf.slice(idx + 1); handleLine(ln, c); }
        if (c.buf.length > 20000) c.buf = '';
        pump();
      }).catch(function () { finish(c); });
    })();
    return c;
  }
  function finish(c) {
    if (c.done) return; c.done = true; c.closed = true;
    Mon.conns = Mon.conns.filter(function (x) { return x !== c; });
    try { c.reader && c.reader.releaseLock(); } catch (e) { /* ignore */ }
    try { c.writer && c.writer.releaseLock(); } catch (e) { /* ignore */ }
    try { var p = c.port.close(); if (p && p.catch) p.catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    Manara.toast(T2('انقطع اتصال المنفذ USB #' + c.id, 'USB #' + c.id + ' disconnected'), 'warn');
    updateSource(false);
  }
  function disconnect(c) {
    c.closed = true;
    var p; try { p = c.reader ? c.reader.cancel() : null; } catch (e) { p = null; }
    if (p && p.then) p.then(function () { finish(c); }, function () { finish(c); }); else finish(c);
  }
  function connectSerial() {
    if (!(navigator.serial && navigator.serial.requestPort)) return;
    navigator.serial.requestPort().then(function (port) {
      return port.open({ baudRate: 115200 }).then(function () { attachPort(port); Manara.toast(T2('تم توصيل اللوحة (115200 باود).', 'Board connected (115200 baud).'), 'safe'); });
    }).catch(function (e) {
      if (e && e.name === 'NotFoundError') return;                  // the person closed the chooser
      Manara.toast(T2('تعذّر فتح المنفذ: أغلق Serial Monitor وأي برنامج آخر يستعمله.', 'Could not open the port: close the Serial Monitor and any other program using it.'), 'danger', 6000);
    });
  }

  /* ---------- commands to the board ---------- */
  function sendCommand(o) {
    var obj = { v: 1, type: 'signs', A: o.A, B: o.B, R: o.R, siren: o.siren, ring: o.ring, hazard: o.hazard }, line = JSON.stringify(obj);
    Mon.cmd = obj; Mon.cmdAt = nowMs();
    var targets = Mon.conns.filter(function (c) { return c.kind !== 'safepoint' && !c.closed; });
    targets.forEach(function (c) { writeTo(c, line); });
    U.cmdLine.textContent = line + '\n→ ' + (targets.length ? num(targets.length) + ' ' + L(T2('لوحة حقيقية', 'real board(s)')) : L(T2('اللوحة الافتراضية فقط', 'virtual board only')));
    pushRaw('→ ' + line); logLine('→ ' + line, 'lg-tx'); renderVBoard();
  }
  function approve() {
    var m = Mon.last; if (!m || !m.local || !m.local.alarm) return;
    var hz = m.local.hazard, ex = m.exits || {}, o = { A: 'off', B: 'off', R: 'off', siren: hz === 'heat' || hz === 'dust' ? 'off' : 'on', ring: 'red', hazard: hz };
    if (hz === 'fire' || hz === 'gas') ['A', 'B', 'R'].forEach(function (k) { o[k] = ex[k] === 'locked' ? 'stop' : 'go'; });
    Mon.approved = true; sendCommand(o); renderLive();
    Manara.toast(T2('اعتُمد الإنذار العام (SIM): في غرفة العمليات تبدأ الآن رسائل الهواتف.', 'Public alert approved (SIM): in Mission Control the phone messages start now.'), 'safe', 5200);
  }

  /* ---------- build the monitor UI ---------- */
  function chipBtn(host, labelObj, icon, pressed, fn) {
    var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('aria-pressed', String(!!pressed));
    if (icon) b.insertAdjacentHTML('afterbegin', Manara.icon(icon));
    b.appendChild(bi(labelObj)); b.addEventListener('click', fn); host.appendChild(b); return b;
  }
  function initMonitor() {
    ['th-canvas', 'verdict', 'verdict-text', 'ladder', 'btn-approve', 'flags', 'kpis', 'vboard', 'cmd-line', 'ci-safe', 'ci-help', 'ci-rooms', 'log', 'lg-counts', 'src-tag', 'src-text', 'sw-sim', 'btn-connect', 'conn-list', 'scen', 'locks', 'btn-checkin', 'th-stats', 'th-note', 'rd-age', 'live-say', 'cmds', 'sparks'].forEach(function (id) {
      U[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById(id);
    });
    U.th = U.thCanvas; U.say = U.liveSay; U.approve = U.btnApprove; U.counts = U.lgCounts; U.age = U.rdAge; U.ciSafe = U.ciSafe; U.checkin = U.btnCheckin; U.simSw = U.swSim; U.srcTag = U.srcTag; U.conns = U.connList;
    U.cmdLine = U.cmdLine; U.thNote = U.thNote; U.thStats = U.thStats; U.srcText = U.srcText; U.verdictText = U.verdictText;
    U.verdictSub = el('small'); U.verdict.querySelector('b').after(U.verdictSub);
    // scenario chips
    SCENS.forEach(function (s) {
      var b = chipBtn(U.scen, s[1], s[2], s[0] === Mon.scen, function () {
        Mon.scen = s[0]; if (Mon.sim) Mon.sim.setScenario(s[0]);
        $$('button', U.scen).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      b.dataset.id = s[0];
    });
    [['A', T2('الدرج A مقفل', 'Stair A locked')], ['B', T2('الدرج B مقفل', 'Stair B locked')], ['R', T2('السطح R مقفل', 'Roof R locked')]].forEach(function (l) {
      var b = chipBtn(U.locks, l[1], 'x', false, function () { var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); if (Mon.sim) Mon.sim.setLock(l[0], on); });
    });
    CMDS.forEach(function (c) { chipBtn(U.cmds, c[1], null, false, function () { sendCommand(c[2]); }); });
    // sparklines
    U.sparks = clear(U.sparks);
    var defs = [['tmax', T2('أعلى حرارة °م', 'Hottest °C')], ['mq2', T2('MQ-2 مللي فولت', 'MQ-2 mV')], ['wbgt', T2('WBGT تقدير °م', 'WBGT est. °C')], ['water', T2('ماء سم', 'Water cm')]], sp = {};
    defs.forEach(function (d) {
      var box = el('div', 'spark'), h = el('span'), t = el('span'); t.appendChild(bi(d[1])); var v = el('b', 'num', '–'); h.appendChild(t); h.appendChild(v); box.appendChild(h);
      var cv = el('canvas'); cv.width = 240; cv.height = 44; cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv); U.sparks.appendChild(box); sp[d[0]] = { cv: cv, val: v };
    });
    U.sparks = sp;
    buildVBoard();
    // buttons
    U.btnConnect.addEventListener('click', connectSerial);
    if (!(navigator.serial && navigator.serial.requestPort)) { document.getElementById('serial-warn').hidden = false; U.btnConnect.disabled = true; U.btnConnect.title = L(T2('المتصفح لا يدعم Web Serial', 'This browser does not support Web Serial')); }
    else navigator.serial.addEventListener('disconnect', function (e) { Mon.conns.filter(function (c) { return c.port === e.target; }).forEach(finish); });
    U.simSw.addEventListener('change', function () { Mon.simOn = U.simSw.checked; Mon.sim = null; updateSource(true); });
    U.approve.addEventListener('click', approve);
    U.checkin.addEventListener('click', function () {
      var room = ROOMS[M.floor(Mon.rnd() * ROOMS.length)], st = Mon.rnd() < 0.85 ? 'safe' : 'help', lg = LANGS[M.floor(Mon.rnd() * LANGS.length)];
      handleLine(JSON.stringify({ v: 1, type: 'checkin', room: room, status: st, lang: lg }), null);
    });
    document.getElementById('btn-pause').addEventListener('click', function (e) {
      Mon.paused = !Mon.paused; e.currentTarget.setAttribute('aria-pressed', String(Mon.paused));
      var sp2 = e.currentTarget.querySelectorAll('span'); void sp2;
      Manara.toast(Mon.paused ? T2('السجل متوقف مؤقتًا (المعالجة مستمرة).', 'Log paused (processing continues).') : T2('عاد السجل.', 'Log resumed.'), '', 2200);
    });
    document.getElementById('btn-clear').addEventListener('click', function () { clear(U.log); Mon.raw = []; });
    document.getElementById('btn-dl-log').addEventListener('click', function () { download('manara-board-log.ndjson', Mon.raw.join('\n') + '\n', 'application/x-ndjson'); });
    document.getElementById('btn-dl-sim').addEventListener('click', function () {
      var s = makeSim(11), out = ['# MANARA simulated session (SIM): 60 s, same NDJSON a real board writes'];
      for (var i = 0; i < 240; i++) { if (i === 32) s.setScenario('mug'); if (i === 80) s.setScenario('fire'); if (i === 160) s.setScenario('idle'); s.step(1).forEach(function (l) { if (l.charAt(0) !== '#' || !i) out.push(l); }); }
      download('manara-sim-session.ndjson', out.join('\n') + '\n', 'application/x-ndjson');
    });
    setInterval(function () { refreshAge(); renderVBoard(); }, 500);
    updateSource(true);
  }

  /* =============================================================== boot */
  function onLang() {
    applyLabels(); renderOverview(); renderLive(); renderCount(); updateCounts(); updateSource(false); renderConns();
    $$('#own-body option').forEach(function (op) { op.textContent = L({ ar: op.dataset.ar, en: op.dataset.en }); });
    $$('#own-body input.input').forEach(function (i) { i.setAttribute('aria-label', L(T2('دليل أو ملاحظة', 'Evidence or note'))); if (i.dataset.ar) i.placeholder = L({ ar: i.dataset.ar, en: i.dataset.en }); });
  }
  function boot() {
    renderSubnav(); renderOverview();
    ['tier-pick-parts', 'tier-pick-wiring', 'tier-pick-steps'].forEach(tierPick);
    renderTierCards(); renderParts(); renderWiring(); renderSteps(); renderTimers();
    renderRules(); renderStandins(); renderBooth(); renderScript(); renderOwnership(); bindOwnButtons(); renderKit();
    initMonitor(); applyLabels();
    window.addEventListener('langchange', onLang);
    window.addEventListener('themechange', function () { drawThermal(); drawSparks(); });
    Manara.reveal();
    window.__buildReady = true;
  }
  window.ManaraBuild = {
    validate: validate, extraKeys: extraKeys, handleLine: handleLine, makeSim: makeSim, boardOutputs: boardOutputs, hotspotTest: hotspotTest,
    stullWetBulb: stullWetBulb, wbgtEstimate: wbgtEstimate, heatIndexC: heatIndexC, attachPort: attachPort, sendCommand: sendCommand,
    PARTS: PARTS, PINS: PINS, STEPS: STEPS, TIERS: TIERS, sumParts: sumParts, state: state, mon: Mon, setTier: setTier, KIT: KIT
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
