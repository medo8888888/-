# موقع جمعية تكامل لبناء القيم والتنمية

موقع عربي (RTL) مبني من «الكتيب التعريفي الشامل للأعضاء الجدد» حرفياً: تصميم داكن فاخر (مع وضع نهاري)، كرة أرضية ثلاثية الأبعاد بدول الكتيب الخمس، لوحة قيادة تفاعلية، بحث فوري (⌘K)، واجهة جوال (شريط سفلي)، و«مساعد تكامل الذكي» الذي يجيب من الكتيب دائماً، وبـ Gemini عند تفعيل المفتاح.

## البنية

| المسار | الوصف |
|---|---|
| `content/brochure.txt` | نص الكتيب (مصدر كل النصوص؛ سطر لكل فقرة) |
| `tools/build.py` | يولّد صفحات `site/*.html` و `worker/knowledge.js` من الكتيب |
| `site/` | الموقع الثابت (HTML + `css/style.css` + `js/main.js`, `js/chat.js`, `js/globe.js`) |
| `worker/index.js` | Cloudflare Worker: يخدم الموقع + `/api/chat` (Gemini) + `/api/health` |
| `tools/test-worker.mjs` | اختبارات الـ Worker (`npm test`) |

بعد تعديل `content/brochure.txt` أو `tools/build.py`:

```bash
python3 tools/build.py
```

## النشر على Cloudflare (مع المساعد الذكي)

1. Cloudflare ← **Workers & Pages** ← الـ Worker الحالي `noisy-water-017a` ← **Settings** ← **Build** ← **Connect** ← اختر هذا المستودع والفرع (اسم الـ Worker في `wrangler.jsonc` مطابق له).
2. اترك أمر البناء فارغاً، وأمر النشر: `npx wrangler deploy` (يقرأ `wrangler.jsonc` تلقائياً).
3. بعد النشر: إعدادات الـ Worker ← **Variables and Secrets** ← أضف **Secret** باسم `GEMINI_API_KEY` وقيمته مفتاحك من Google AI Studio.
   (أو من جهازك: `npx wrangler secret put GEMINI_API_KEY`)
4. يُنصح بإضافة قاعدة **Rate limiting** في Cloudflare على المسار `/api/chat`.

> المفتاح لا يوضع أبداً في ملفات الموقع؛ يبقى سرّاً على الخادم فقط.

النموذج الافتراضي في `wrangler.jsonc` ← `vars.GEMINI_MODEL`، ويمكن تغييره دون تعديل الكود.

**رفع مباشر (بدون GitHub):** ارفع محتوى مجلد `site/` (أو الملف المضغوط) إلى الـ Worker عبر Upload assets؛ يعمل كل شيء، والمساعد يجيب من نص الكتيب («وضع الكتيب»). إجابات Gemini تحتاج طريقة GitHub أعلاه مع المفتاح السري.

## التشغيل محلياً

```bash
cp .dev.vars.example .dev.vars   # ضع مفتاحك هنا (الملف مُستثنى من git)
npx wrangler dev
npm test                         # اختبارات الـ Worker
```

## موقع مشروع «ينابيع» (`/yanabee/`)

موقع عربي مصغّر ثانٍ داخل المستودع نفسه، مبني حرفياً من وثيقتي «مشروع ينابيع» و«مبادرة حفظ، فهم، تطبيق»، ويُخدَم من الـ Worker نفسه على المسار **`/yanabee/`** (المجلد `site/yanabee/` جزء من أصول الموقع). يعمل أيضاً مستقلاً: يمكن فتحه من الجهاز مباشرة (`file://`) أو رفع مجلد `site/yanabee/` وحده إلى أي استضافة ثابتة.

| المسار | الوصف |
|---|---|
| `content/yanabee/*.txt` | نص الوثيقتين (مصدر كل النصوص) |
| `tools/yanabee/` | المولّد: صفحة لكل وحدة `page_*.py`، و`build_kb.py` لقاعدة المعرفة |
| `site/yanabee/data/kb.js` | قاعدة المعرفة (مولّدة) للبحث وللمساعد في وضع البحث في الوثائق |
| `worker/knowledge-yanabee.js` | نص الوثيقتين (مولّد) يُرسل مع تعليمات «مساعد ينابيع» |

```bash
python3 tools/yanabee/build.py                 # كل الصفحات + kb.js + knowledge-yanabee.js
python3 tools/yanabee/build.py build_kb        # قاعدة المعرفة فقط
python3 tools/yanabee/check_content.py         # كل سطر من الوثيقتين ظاهر في الموقع
node tools/test-worker.mjs                     # اختبارات الـ Worker (تكامل + ينابيع)
node tools/yanabee/test-ui.mjs                 # اختبارات البحث والمساعد في المتصفح (Playwright)
```

**البحث:** زر البحث أو <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> أو <kbd>/</kbd> — بحث عربي يتجاهل التشكيل والهمزات ويعمل دون اتصال.

**«مساعد ينابيع»:** يستخدم مفتاح `GEMINI_API_KEY` نفسه (لا إعداد إضافي)؛ ترسل الصفحات `site: "yanabee"` إلى `/api/chat` فيجيب الـ Worker بتعليمات ومعرفة ينابيع. إذا لم يتوفر المفتاح أو فُتح الموقع دون الـ Worker، ينتقل المساعد تلقائياً إلى **وضع البحث في الوثائق**: يعرض الفقرات الأقرب إلى السؤال كما وردت حرفياً مع رابط إلى موضعها في الموقع، دون أي نص مولَّد.

## مشروع «منارة» (`/manara/`) — منصة «آخر مئة متر» لكل قطر

مشروع ثنائي اللغة (العربية أولًا ثم الإنجليزية) لمسابقة وزارة التعليم للابتكار في قطر. **منارة** منصة لكل أنواع الطوارئ (حريق ودخان، تسرّب غاز، سيول، غبار، إجهاد حراري، شخص يحتاج مساعدة) على مسار واحد: **أرصد ← أتحقق ← أُبلغ ← أُرشد ← أعُدّ ← أُسلّم**. القاعدة «الدليل قبل الذعر»: لا تنبيه عامًّا بمستشعر واحد؛ مفتاحان مستقلان ثم موافقة إنسان. وبعد اعتماد الحادثة توصي المنصة بالوحدة **الأسرع وصولًا بحسب الازدحام** (لا الأقرب مسافة) من كل نوع: إطفاء وإسعاف وشرطة ومستشفى، على **خريطة قطر الحقيقية** (لقطة OpenStreetMap). **999 يبقى هو المرسِل**؛ منارة ليست خدمة رسمية، وكل رقم محاكى موسوم **SIM** (فحص آلية لا برهان أثر). الكاشف رؤية حاسوبية بقواعد وليس ذكاءً اصطناعيًا (دقته على صور محجوزة 66.7% وهو لا يقرّر وحده).

| الصفحة | ما هي |
|---|---|
| `site/manara/index.html` | الصفحة الرئيسية |
| `mission.html` | غرفة العمليات: خريطة قطر الوطنية + التكبير إلى «آخر مئة متر» |
| `detect.html` · `alert.html` · `build.html` | مختبر الأدلة · هواتف السكان (أقرب المنشآت دون إنترنت) · دليل البناء |
| `pitch.html` · `report.html` · `poster.html` | العرض التقديمي (3 و7 دقائق وأسئلة الحَكَم) · التقرير العلمي · لوحة العرض (ثلاثية الطي وA0) |
| `data/qatar-*.js` | بيانات قطر المضمَّنة (حدود، 138 منشأة، 6,116 كم طرق) من OpenStreetMap |

**الفتح دون إنترنت:** افتح `site/manara/index.html` مباشرة من المجلد (`file://`) في Chrome أو Edge. كل الصفحات سكربتات كلاسيكية بلا مكتبات ولا طلبات شبكة؛ خطوط Google اختيارية. أو من خادم محلي: `cd site && python3 -m http.server 8765` ثم `http://localhost:8765/manara/`.

**النشر:** المجلد `site/manara/` جزء من أصول الـ Worker نفسه (`wrangler.jsonc` ← `assets.directory = ./site`)، فيُخدَم تلقائيًا على **`/manara/`** عند `npx wrangler deploy` أو عند رفع محتوى `site/`؛ ولا إعداد إضافي ولا أسرار. ويعمل المجلد وحده على أي استضافة ثابتة (انسخ المجلد كاملًا بما فيه `data/`).

**إعادة بناء البيانات** (الشبكة مطلوبة للجلب فقط؛ مكتبة بايثون القياسية وحدها):

```bash
python3 tools/manara/build-qatar-data.py --cache /tmp/manara-osm-cache --write-doc   # يجلب ما ينقص ويبني data/qatar-*.js ويحدّث جداول docs/MANARA-DATA.md
python3 tools/manara/build-qatar-data.py --cache /tmp/manara-osm-cache --no-fetch    # إعادة بناء دون اتصال من الذاكرة المؤقتة
```

**الاختبارات** (Node 22 وPython 3 وPlaywright/Chromium):

```bash
bash tools/manara/run-all.sh --fast      # كل الحزم غير البطيئة، سطر نتيجة لكل حزمة (دون خيار --fast: كل شيء، نحو 20 دقيقة)
node tools/manara/test-qatar-data.mjs    # البيانات المضمَّنة (91 فحصًا)
node tools/manara/test-national.mjs      # المحرك الوطني (197 فحصًا، نحو 40 ث)
node tools/manara/test-sim.mjs           # محاكاة الكتلة المحلية · test-fire.mjs الكاشف · test-msg.mjs الرسائل
node tools/manara/test-pitch.mjs         # العرض · test-poster.mjs اللوحة · test-mission.mjs · test-alert.mjs · test-home.mjs
python3 tools/manara/test_kit.py         # شيفرة العتاد
node tools/manara/shot.mjs pitch.html --w 390,1440 --theme dark,light --lang ar,en   # لقطات شاشة
```

التفاصيل: `docs/MANARA-SPEC.md` (ما هو المشروع) · `docs/MANARA.md` (العقود والقوانين وواجهة المحرك) · `docs/MANARA-DATA.md` (البيانات وجودتها وفجواتها) · `docs/MANARA-SOURCES.md` (الأرقام الحقيقية الوحيدة المسموح بها مع مصادرها).

**الرخص والنسب:** بيانات الخرائط © مساهمو OpenStreetMap برخصة **ODbL 1.0** — `Contains data © OpenStreetMap contributors, ODbL 1.0` (<https://www.openstreetmap.org/copyright>)؛ ملفات `site/manara/data/qatar-*.js` عمل منتَج من قاعدة OSM (لقطة 2026-10-08)، فيجب إبقاء نص النسب (`data/CREDITS.txt`) ومشاركة أي قاعدة بيانات مشتقة بالرخصة نفسها. Natural Earth (ملكية عامة) للتحقق من الحدود فقط. القوائم الرسمية (مؤسسة حمد وغيرها) استُعملت أسماءً فقط للتحقق من اكتمال المنشآت. شيفرة المشروع ونصوصه عمل الفريق، وأدوات الذكاء الاصطناعي المستعملة في الصياغة مُفصَح عنها في جدول الملكية بالتقرير.
