# MANARA kit · حقيبة منارة البرمجية

**العربية أولًا، ثم English.** Arabic first, then English.

```
kit/
  README.md                                   this file · هذا الملف
  firmware/manara_sentinel/manara_sentinel.ino   the sentinel / twin board (+ optional pan-tilt head) · لوحة الحارس
  firmware/manara_safepoint/manara_safepoint.ino the offline check-in point «MANARA-SAFE» · نقطة تسجيل «آمن»
  python/manara_webcam.py                        colour + flicker detector for a laptop webcam / video · كاشف الكاميرا
../../tools/manara/test_kit.py                 tests (run on a PC, no hardware) · اختبارات تعمل على الحاسوب
```

---

## العربية

### حالة الشيفرة بصراحة

- كُتبت البرمجيات الثابتة (firmware) وفق **واجهات المكتبات الموثّقة** (راجعنا الأمثلة الرسمية لكل مكتبة)، **لكن لم تُجرَّب على لوحة حقيقية**. اعتبرها غير مختبرة إلى أن تنفّذ **قائمة الفحص** أدناه وتُحمِّلها بنفسك.
- الذي **اختُبر فعلًا** على الحاسوب: المعادلات (الرطوبة والحرارة وWBGT وفهرس الحرارة)، واختبار البقعة الساخنة، ومنطق السقوط، وكاتب JSON، ومحلّل أمر `signs`، ومنطق نقطة التسجيل، وكاشف بايثون. الأمر: `python3 tools/manara/test_kit.py`.
- الحسّاسات رخيصة وغير معايَرة: قراءات الغاز هنا **ملّيفولت وليست ppm**. المشروع نموذج طلابي ولا يُغني أبدًا عن إنذار حريق أو كاشف غاز معتمد.

### الأدوات المطلوبة

| العنصر | ما تحتاجه | ملاحظة |
|---|---|---|
| Arduino IDE | الإصدار 2.3.x (آخر إصدار مستقر رأيناه 2.3.9) | حمّله من arduino.cc |
| حزمة اللوحة | **esp32 by Espressif Systems**، الإصدار 3.3.x | من «مدير اللوحات». اللوحة: **ESP32 Dev Module** |
| Adafruit MLX90640 | 1.1.2 | تطلب الحزمة تبعيات (BusIO وArcada). اختر «Install all» |
| Adafruit SHT31 Library | 2.2.2 | تحتاج Adafruit BusIO |
| Adafruit NeoPixel | 1.15.5 | شاشة الخروج والحلقة (WS2812) |
| ESP32Servo | 3.2.1 | الرأس المتحرك فقط (`HAS_HEAD 1`) |
| Adafruit MPU6050 | 2.2.9 | حسّاس السقوط فقط (`HAS_MPU6050 1`)، ويحتاج Adafruit Unified Sensor |
| نقطة التسجيل | لا شيء | WiFi وDNSServer وWebServer ضمن حزمة اللوحة |
| بايثون | Python 3.8+ وnumpy | OpenCV اختياري (للكاميرا وملفات الفيديو) |

أرقام الإصدارات قُرئت من ملفات `library.properties` الرسمية على GitHub عند كتابة هذا الملف. ثبّت الأحدث المتاح، وإن تغيّرت واجهة مكتبة فاقرأ مثالها الرسمي.

### الخطوات

1. **لوحة الحارس:** افتح `manara_sentinel.ino`. في أعلى الملف كتلة `CONFIG`: غيّر `HAS_…` إلى 1 للقطع التي ركّبتها وإلى 0 لما لم تركّبه، وراجع خريطة الأطراف `PIN_…` مع جدول التوصيل في صفحة «بناء النموذج». اختر اللوحة، ثم المنفذ، ثم **Upload**، وافتح الشاشة التسلسلية على **115200**.
2. **نقطة التسجيل:** افتح `manara_safepoint.ino` وارفعه إلى لوحة ESP32 ثانية. ستظهر شبكة `MANARA-SAFE`؛ انضم إليها من هاتفك.
3. **كاشف الكاميرا:** `pip install numpy` ثم `python3 manara_webcam.py --selftest`. للكاميرا: `pip install opencv-python` ثم `--camera 0`.
4. افتح صفحة «بناء النموذج» في المتصفح (Chrome أو Edge) واضغط «وصل اللوحة»، أو شغّل «محاكاة اللوحة» بلا عتاد.

### بروتوكول التسلسلي v1 (باختصار)

سطر JSON واحد لكل رسالة، 115200 باود. التفاصيل في `docs/MANARA-SPEC.md`.

- من اللوحة: `frame` (حوالي 4 مرات في الثانية)، و`grid` (صورة حرارية 32×24 مرة في الثانية، بالدرجات ×10)، و`checkin` (من نقطة التسجيل).
- إلى اللوحة: `signs` (لافتات الخروج A وB وR، والصفّارة، وحلقة الضوء). اللوحة **لا تسمح للمتصفح بإسكات إنذارها المحلي**، ولا تُظهر «اذهب» على مخرج مفتاحه «مقفل».
- الأسطر التي تبدأ بـ `#` ملاحظات للبشر يتجاهلها أي محلِّل.
- `gas.mq2` و`gas.mq7` ملّيفولت عند مخرج الوحدة (قبل مقسّم الجهد). لا نكتب ppm دون معايرة بغاز مرجعي.
- `local.hazard` يُسمّي الخطر حتى عندما تكون `alarm` تساوي false: هذا يعني **اشتباهًا** (مفتاح واحد). `alarm:true` يعني مفتاحين أو ضغطة بشرية.

### قائمة الفحص بعد الرفع (اشطب بنفسك)

1. الشاشة التسلسلية تُظهر `# MANARA sentinel…` وقائمة عناوين I2C تتضمن `0x33` و`0x44`.
2. تصل الإطارات بمعدل قريب من 4 في الثانية، ويقرؤها المتصفح كلها كـ JSON سليم.
3. الكاميرا الحرارية: ضع يدك أمامها فترتفع `tmax`؛ وفي غرفة هادئة تقترب `tmean` من حرارة الغرفة.
4. SHT31: قارنه بمحرار آخر، ثم جرّب مجفّف الشعر على بُعد آمن وراقب `wbgt` (تقدير وليس قياسًا).
5. بعد الإحماء (حوالي 4 دقائق للحرارية و3 + دقيقتين للغاز) وكوب ساخن: `local.hazard` يصبح `fire` و`alarm` تبقى false.
6. أضف مسحة معقّم أيدٍ قرب MQ-2 (دون لهب ودون بخّ): ينشط المفتاح الثاني، فتصبح `alarm` true وتعمل الصفّارة والحلقة الحمراء.
7. بدّل مفتاح الخروج B: تتحوّل لافتته إلى الأحمر حتى لو أرسل المتصفح «go».
8. كوب الماء: فارغ ≈ 0 سم؛ 3 سم اشتباه؛ 6 سم إنذار (مقياس المعرض، وليس مرجع 15/30 سم).
9. زر SOS: ضغطة واحدة تُشعل الإنذار؛ والضغط 3 ثوانٍ يمسحه.
10. افصل كابل البيانات واترك الطاقة فقط: يبقى الإنذار المحلي يعمل (لا ينتظر المتصفح).
11. الرأس المتحرك: يمسح (PATROL)، ثم يلاحق الكوب (TRACK)، ثم يثبت (HOLD)، ثم يعود للمسح بعد إبعاد الكوب.
12. نقطة التسجيل: هاتف ينضم إلى `MANARA-SAFE`، يضغط «أنا بأمان»، فيظهر سطر `checkin` وينمو العدّاد.

### حدود معروفة

حسّاسات MQ تحتاج حرقًا أوليًّا مدته 48 ساعة (كما تقول أوراق بياناتها)، وتتأثر بالرطوبة والحرارة، وتستجيب لأكثر من غاز. والصفّارة النشطة الرخيصة لا تُصدر نغمة 520 هرتز التي وجدت إحدى الدراسات أنها الأنسب لإيقاظ النائمين. الكاميرا الحرارية لا ترى عبر الزجاج. وقيمة WBGT هنا تقدير وليست قياسًا. شبكة MANARA-SAFE مفتوحة عمدًا، فاستعمل عدّادها مؤشرًا للمشرفين لا دليلًا. ولا نقلّد النغمة الوطنية للإنذار ولا نشغّلها أبدًا.

---

## English

### Honest status

- The firmware was written to the **documented library APIs** (checked against each library's official examples) but has **not been run on real hardware**. Treat it as untested until you have flashed it and ticked the checklist below.
- What **is** tested, on a PC: the maths (wet bulb, WBGT, heat index), the hot-spot test, the fall logic, the JSON writer, the `signs` command parser, the check-in logic, and the Python detector. Run `python3 tools/manara/test_kit.py`.
- The sensors are cheap and uncalibrated: gas values here are **millivolts, not ppm**. This is a student prototype and never replaces a certified fire alarm or gas detector.

### Tools and versions

| Item | What you need | Note |
|---|---|---|
| Arduino IDE | 2.3.x (latest stable we saw: 2.3.9) | from arduino.cc |
| Board package | **esp32 by Espressif Systems**, 3.3.x | Boards Manager. Board: **ESP32 Dev Module** |
| Adafruit MLX90640 | 1.1.2 | depends on BusIO and Arcada: choose "Install all" |
| Adafruit SHT31 Library | 2.2.2 | needs Adafruit BusIO |
| Adafruit NeoPixel | 1.15.5 | exit signs and the ring (WS2812) |
| ESP32Servo | 3.2.1 | pan-tilt head only (`HAS_HEAD 1`) |
| Adafruit MPU6050 | 2.2.9 | fall sensor only (`HAS_MPU6050 1`); needs Adafruit Unified Sensor |
| Check-in point | nothing | WiFi, DNSServer and WebServer ship with the board package |
| Python | 3.8+ and numpy | OpenCV optional (webcam and video files) |

Version numbers were read from each library's official `library.properties` on GitHub when this file was written. Install the newest available; if a library's API changed, read its official example.

### Steps

1. **Sentinel board:** open `manara_sentinel.ino`. At the top is a `CONFIG` block: set each `HAS_…` to 1 for parts you fitted and 0 for parts you did not, and check the `PIN_…` map against the wiring table on the Build page. Pick the board, the port, press **Upload**, open the Serial Monitor at **115200**.
2. **Check-in point:** open `manara_safepoint.ino` and upload it to a second ESP32. A Wi-Fi network called `MANARA-SAFE` appears; join it with your phone.
3. **Camera detector:** `pip install numpy`, then `python3 manara_webcam.py --selftest`. For a webcam: `pip install opencv-python`, then `--camera 0`. Without OpenCV, pipe frames from ffmpeg with `--raw 320x240`.
4. Open the Build page in Chrome or Edge and press "Connect board", or switch on "Simulate board" to try the page with no hardware.

### Serial protocol v1 (short)

One JSON object per line, 115200 baud. Full text in `docs/MANARA-SPEC.md`.

- Board to browser: `frame` (about 4 per second), `grid` (32x24 thermal image once a second, degrees C x 10), `checkin` (from the check-in point).
- Browser to board: `signs` (exit signs A, B, R, the siren, the ring light). The board **never lets the browser silence its own local alarm** and never shows "go" on an exit whose switch says locked.
- Lines starting with `#` are notes for humans; every parser ignores them.
- `gas.mq2` and `gas.mq7` are millivolts at the module output (before the voltage divider). We never print ppm without calibration against a reference gas.
- `local.hazard` names the hazard even when `alarm` is false: that means **SUSPECT** (one key). `alarm:true` means two keys or a human press.

### Test checklist after flashing (tick it yourself)

1. The Serial Monitor shows `# MANARA sentinel…` and an I2C list that includes `0x33` and `0x44`.
2. Frames arrive at about 4 per second and the browser parses every one as valid JSON.
3. Thermal camera: put your hand in front and `tmax` rises; in a quiet room `tmean` is close to room temperature.
4. SHT31: compare with another thermometer, then try the hair dryer from a safe distance and watch `wbgt` (an estimate, not a measurement).
5. After warm-up (about 4 minutes for thermal, 3 + 2 minutes for gas) and a hot mug: `local.hazard` becomes `fire` while `alarm` stays false.
6. Add a hand-sanitiser swab near the MQ-2 (no flame, no spray): the second key arms, `alarm` becomes true, the siren and the red ring start.
7. Flip exit switch B: its sign turns red even if the browser sent "go".
8. Cup of water: empty is about 0 cm; 3 cm is SUSPECT; 6 cm is ALARM (booth scale, not the 15/30 cm guidance).
9. SOS button: one press raises the alarm; holding it 3 seconds clears it.
10. Unplug the data cable and keep only power: the local alarm still works (it never waits for the browser).
11. Pan-tilt head: it patrols (PATROL), follows the mug (TRACK), settles (HOLD), and goes back to patrol when the mug is removed.
12. Check-in point: a phone joins `MANARA-SAFE`, taps "I'm safe", a `checkin` line appears and the counter grows.

### Known limits

MQ sensors need a 48-hour burn-in (their datasheets say so), move with humidity and temperature, and respond to several gases. A cheap active buzzer cannot make the 520 Hz tone that research found best for waking people. The thermal camera cannot see through glass. WBGT here is an estimate. MANARA-SAFE is an open network on purpose, so treat its counter as a hint for staff, not proof. We never copy or play the national alert tone.

### Ownership and AI disclosure

This kit was written with AI assistance. The student must be able to explain every formula and every line before presenting it: use the ownership table on the Build page and the explain-it checklist in the report.
