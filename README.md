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
