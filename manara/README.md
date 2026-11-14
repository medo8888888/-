# MANARA · منارة

**EN** — *No one left asleep. No one left behind.* A bilingual (Arabic first, English second) competition project: the last 100 metres of a fire, and of every emergency in Qatar — verify before alerting, wake each person in their own language and format, guide them to an exit that is really open, count everyone out.
**AR** — *لا نائمَ يُنسى، ولا أحدَ يُترك خلفنا.* مشروع ثنائي اللغة (العربية أولًا) لمسابقة الابتكار: «آخر مئة متر» في الحريق وفي كل طارئ بقطر — أتحقق قبل أن أُنبّه، وأوقظ كل شخص بلغته وصيغته، وأرشده إلى مخرج مفتوح فعلًا، وأعدّ الجميع خارجًا.

> **One folder.** Everything MANARA is in this folder: pages, code, data, docs, tests and tools. **مجلد واحد.** كل ما يخص منارة هنا: الصفحات والشيفرة والبيانات والوثائق والاختبارات والأدوات.

---

## 1. Open it · الفتح

- **EN** — Double-click **`index.html`** (Chrome or Edge). It works **offline** from `file://`: classic scripts, no libraries, no build step, no network needed (Google Fonts are optional and the pages work without them).
- **AR** — انقر مرتين على **`index.html`**. يعمل **دون إنترنت** من `file://`: سكربتات كلاسيكية بلا مكتبات ولا خطوة بناء؛ خطوط Google اختيارية.
- Optional local server · خادم محلي اختياري: `python3 -m http.server 8765 --directory manara` (from the repo root · من جذر المستودع), then · ثم `http://localhost:8765/`.

| Page · الصفحة | What · ما هي |
|---|---|
| `index.html` | landing page: the story, drone → control room → fastest unit → robot → everyone counted · الصفحة الرئيسية: القصة كاملة |
| `control.html` | **Control Room**: alert queue, feed wall (camera + thermal), fleet, dispatch, robot, comms log, shift handover; two keys + a human Approve · غرفة التحكم |
| `mission.html` | Mission Control: map of Qatar, zoom to the last 100 m · غرفة العمليات: خريطة قطر والتكبير إلى «آخر مئة متر» |
| `detect.html` · `alert.html` | Evidence Lab · resident phones · مختبر الأدلة · هواتف السكان |
| `robot.html` | Robot Rescue Lab (simulated) · مختبر الروبوت (محاكى) |
| `build.html` | build guide, **four tiers**: laptop only, sentinel board, full booth, and Tier 4 (drone payload + ESP32 bench rover) · دليل البناء بأربعة مستويات |
| `pitch.html` | pitch deck (15 slides, strict 3:00 path with one live moment, animated), spoken script, judge Q&A (67 questions), booth sheet · العرض |
| `report.html` | scientific report + engineering logbook (printable A4) · التقرير العلمي |
| `poster.html` | display board: tri-fold 90 × 60 cm or A0, screen motion, print-safe · لوحة العرض |
| `guide.html` · `plan.html` | safety guide · rollout plan · دليل الأمان · خطة التطبيق |
| `preview/` | generated single-file copies of landing / mission / robot · نسخ مفردة الملف مولَّدة |

The top bar keeps six working pages; **More** holds `build`, `pitch`, `report`, `guide` and `plan`, so ten pages never clip. · شريط التنقل يُبقي ست صفحات عاملة، والباقي تحت «المزيد».

## 2. The one-folder layout · بنية المجلد

```
manara/
  index.html control.html mission.html detect.html alert.html robot.html
  build.html pitch.html report.html poster.html guide.html plan.html 404.html   the pages · الصفحات
  css/  js/  data/  assets/  kit/  preview/                    styles, code, Qatar data + generated test counts, images, hardware kit (firmware: sentinel, safepoint, rover), bundles
  docs/     MANARA.md  MANARA-SPEC.md  MANARA-SOURCES.md  MANARA-QATAR.md  MANARA-HAZARDS.md  MANARA-DATA.md
  tools/    run-all.sh  test-*.mjs  test_kit.py  lib.mjs  shot.mjs  bundle-*.mjs  build-qatar-data.py  samples.py  sync-site.mjs  photos/
  README.md this file · هذا الملف
```

## 3. Tests · الاختبارات

Needs Node 22, Python 3, and Playwright with Chromium (`tools/lib.mjs` expects Playwright installed globally and Chromium at `/opt/pw-browsers/chromium`; the photo test also needs Pillow). Commands are written **for the repo root**, and every script finds its own files, so they also work from any other directory.
يتطلب Node 22 وPython 3 وPlaywright مع Chromium. الأوامر مكتوبة **لتُشغَّل من جذر المستودع** وكل سكربت يجد ملفاته بنفسه فيعمل من أي مجلد.

```bash
npm run test:manara                          # = bash manara/tools/run-all.sh : every suite, one verdict line each (about 20 minutes)
bash manara/tools/run-all.sh --fast          # skip the slowest browser suites
bash manara/tools/run-all.sh --only fire,sim # just these  (-j 3 runs three at once, -v prints failing lines)
node manara/tools/test-fire.mjs              # one suite: also test-sim, test-msg, test-national, test-qatar-data, test-drone-scene,
                                             #   test-detect, test-mission, test-control-room (+ -feeds, -panels, -ai), test-alert, test-robot-page, test-home,
                                             #   test-pitch, test-poster, test-report (report.html + build.html), test-guide, test-plan, test-ui
python3 manara/tools/test_kit.py             # the hardware kit's logic, on a PC: Python detector, three sketches (sentinel, safepoint, rover), the Build page
node manara/tools/update-counts.mjs --only kit   # refresh data/test-counts.js (the pitch, report and poster READ their "N checks" from it; run-all.sh does it at the end)
node manara/tools/shot.mjs mission.html --w 390,1440 --theme dark,light --lang ar,en   # screenshots + console/overflow check
```

## 4. Rebuild · إعادة البناء

```bash
# Qatar data from OpenStreetMap (network only to fetch; Python standard library only) · بيانات قطر من OpenStreetMap
python3 manara/tools/build-qatar-data.py --cache /tmp/manara-osm-cache --write-doc    # writes manara/data/qatar-*.js and the tables in docs/MANARA-DATA.md
python3 manara/tools/build-qatar-data.py --cache /tmp/manara-osm-cache --no-fetch     # offline, from the cache
node manara/tools/test-qatar-data.mjs                                                 # check the result
# single-file previews · النسخ المفردة (after editing a page or its scripts)
node manara/tools/bundle-preview.mjs                                                  # preview/landing.html
node manara/tools/bundle-page.mjs mission.html                                        # preview/mission.html  (same for robot.html)
```

## 5. Deploy · النشر

- **Any static host · أي استضافة ثابتة:** upload this single `manara/` folder (the public parts are enough: the pages and `css js data assets kit preview`; `tools/`, `docs/` and this file are not needed). · ارفع المجلد `manara/` وحده.
- **The Takamul Cloudflare Worker (`/manara/`):** the Worker serves `./site` (`wrangler.jsonc`), so MANARA is published through a **generated copy**, `site/manara/` (git-ignored, never edit it). Cloudflare **must run `npm run build`** (or just `npm run sync:manara`) **before `wrangler deploy`**: `npm run sync:manara` = `node manara/tools/sync-site.mjs` clears `site/manara/` and copies the pages and `css js data assets kit preview` into it (not `tools`, `docs`, `README.md`). `node manara/tools/sync-site.mjs --check` tells you whether the copy is stale. For a git-connected Worker set the build command to `npm run build` and keep the deploy command `npx wrangler deploy`; for local `npx wrangler dev`, run `npm run sync:manara` first.
- **AR:** يخدم الـ Worker المجلد `site/` فقط، لذا تُنشر منارة عبر **نسخة مولَّدة** في `site/manara/` (خارج git ولا تُعدَّل يدويًا). يجب أن يشغّل Cloudflare الأمر **`npm run build`** (أو `npm run sync:manara`) **قبل `wrangler deploy`**.

## 6. Credits and licences · الرخص والنسب

- **Map data · بيانات الخرائط:** `Contains data © OpenStreetMap contributors, ODbL 1.0` — <https://www.openstreetmap.org/copyright>. `data/qatar-*.js` are a produced work from an OpenStreetMap snapshot (2026-10-08): keep the attribution (`data/CREDITS.txt`, also shown on the pages) and share any derived database under the same licence (ODbL). · يجب إبقاء نص النسب ومشاركة أي قاعدة بيانات مشتقة بالرخصة نفسها.
- **Natural Earth** (public domain): used only to cross-check the outline. Official lists (Hamad Medical Corporation and others): used for names only, to check that facilities are complete. · للتحقق فقط.
- **Photos · الصور:** Wikimedia Commons, each with its own licence and author: `assets/samples/CREDITS.txt` and `tools/photos/CREDITS.txt`.
- **Fonts · الخطوط:** Google Fonts, optional and online only; the pages fall back to system fonts.
- **Code and texts · الشيفرة والنصوص:** the team's work; AI tools used for drafting are disclosed in the ownership table of `report.html`. The Qatari ISEF 2025 drone project is named respectfully as prior art. · أدوات الذكاء الاصطناعي مُفصَح عنها في جدول الملكية بالتقرير.

## 7. Honest limitations · حدود صريحة

1. **Not AI.** The detector is rule-based computer vision (colour models + flicker/motion analysis). On photos never used for tuning it scores **66.7 %** (`node manara/tools/test-fire.mjs`); it never decides alone: two independent keys, then a human approves. · الكاشف رؤية حاسوبية بقواعد وليس ذكاءً اصطناعيًا، ولا يقرّر وحده.
2. **Simulation.** Unit positions and availability, traffic, hazards, the drones and the rescue robot are simulated (labelled **SIM**); the drones and the robot are a **concept with a simulated prototype**, never flown or used in a real fire. The A/B numbers check a mechanism; they do not prove real-world impact. · كل رقم تشغيلي محاكى وموسوم SIM.
3. **Not an official service.** 999 stays the dispatcher; MANARA does not call or replace it. A route here is a simulation input, not a navigation instruction. · 999 يبقى هو المرسِل.
4. **Map data is a snapshot, and incomplete.** OpenStreetMap coverage of Qatar has gaps (for example only 3 ambulance points, some facilities without names, major roads only, no elevation model, no turn restrictions or live traffic). Details: `docs/MANARA-DATA.md`. · لقطة لا بثّ مباشر، وفيها فجوات.
5. **Hardware is untested.** The ESP32 firmware (sentinel, safepoint and the Tier 4 bench rover) follows the documented library APIs and its logic is tested on a PC (`test_kit.py`), but it has **not been run on real hardware**; the rover models only the robot's logic, never drives at the booth and is not a rescue robot; the gas sensors are cheap, uncalibrated and cross-sensitive (values are millivolts, not ppm). It never replaces a certified fire alarm or gas detector. · العتاد لم يُجرَّب على أجهزة حقيقية.
6. **Mostly offline.** Everything runs from `file://`; only the optional Google Fonts and the opt-in "nearby facilities" lookup on the phone page (`alert.html`) use the network.
7. **Tests check our own code** under our own assumptions, in Chromium with a fake camera: no real footage, no human-subject tests, no field trial. · الاختبارات تفحص شيفرتنا وفق افتراضاتنا.

## 8. Docs · الوثائق

[`docs/MANARA-SPEC.md`](docs/MANARA-SPEC.md) what the project is (read first) · [`docs/MANARA.md`](docs/MANARA.md) architecture, laws, engine contracts · [`docs/MANARA-SOURCES.md`](docs/MANARA-SOURCES.md) the only real-world numbers we may show, with sources · [`docs/MANARA-HAZARDS.md`](docs/MANARA-HAZARDS.md) hazard playbooks and thresholds · [`docs/MANARA-QATAR.md`](docs/MANARA-QATAR.md) Qatar context and judge answers · [`docs/MANARA-DATA.md`](docs/MANARA-DATA.md) the bundled Qatar dataset, its quality and gaps.

## 9. Motion, print and the numbers on the documentation pages · الحركة والطباعة والأرقام

- **EN** — `pitch.html` and `poster.html` animate on screen only: the control-room numbers count up, the robot walks its route, markers pulse (transform / opacity / stroke only, every loop slower than 1 Hz). With *reduced motion* every page shows its **final frame** (numbers already at their values, the robot beside the person); a hidden tab pauses; printing settles everything and the print CSS never animates. · الحركة على الشاشة فقط؛ مع «تقليل الحركة» تظهر اللقطة النهائية.
- **EN** — Test counts are **never typed** on these pages: `tools/update-counts.mjs` writes `data/test-counts.js`; `pitch.html`, `report.html` and `poster.html` read it (a static fallback equal to the last generated value is kept for pages opened without it). The `ui-lint` suite fails if a typed count disagrees. · أعداد الفحوص لا تُكتب باليد بل تُقرأ من ملف مولَّد.
