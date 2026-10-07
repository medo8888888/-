# MANARA («منارة») — architecture & contracts

Bilingual (Arabic-first RTL + English LTR) competition project: **the last 100 metres of a
fire — verify before alerting, wake every nearby person in their language and format, guide
them to an exit that is really open, and count everyone out**. *What* the product is:
`docs/MANARA-SPEC.md` (read it first). Real-world numbers: `docs/MANARA-SOURCES.md` only. It lives at **`/manara/`**
(`site/manara/` is inside the Worker's assets directory) and is fully self-contained: the
folder can be opened from `file://` or uploaded alone to any static host, and it works
**offline** (a competition booth often has no internet).

```
site/manara/index.html      landing: problem → gap (last 100 m) → how it works → 3 pillars → demo → evidence → hardware → roadmap
site/manara/mission.html    Mission Control: building twin at 04:00 / school — verify, approve, alert, exit truth, wake-up ladder, headcount, hand-off
site/manara/detect.html     Evidence Lab: layered fire/smoke detection (C1…C6 + thermal veto), "Fool me if you can", Decoy Lab benchmark
site/manara/alert.html      Resident Phones: phone wall of 4 personas (or one phone), inclusive alert, wake-up ladder, I'm safe / I need help
site/manara/build.html      Build guide: sentinel + twin board + pan-tilt head + check-in point, parts, wiring, firmware, tests, safety
site/manara/pitch.html      Pitch deck (presentation mode) + 3-minute script + judge Q&A + booth checklist
site/manara/report.html     Scientific report + engineering logbook + ownership/AI-disclosure table (printable)
site/manara/poster.html     Display board: print-ready tri-fold + A0 poster
site/manara/css/base.css    design system: tokens (both themes), base, components, nav, footer, toasts  (shared — do not fork)
site/manara/css/<page>.css  page styles (owned by the page)
site/manara/js/core.js      shell: icons, theme, language, i18n, nav/footer, reveal, toasts, Manara.link bus  (shared)
site/manara/js/sim.js       simulation engine (pure, no DOM, deterministic, Node-testable)      → window.ManaraSim
site/manara/js/fire.js      fire/smoke detection engine (pure, no DOM, Node-testable)            → window.ManaraFire
site/manara/js/<page>.js    page behaviour (mission.js, detect.js, alert.js, home.js, pitch.js, build.js, report.js, poster.js)
site/manara/kit/            downloadable hardware code (ESP32 sentinel/twin-board firmware, MANARA-SAFE check-in AP, pan-tilt head, Python webcam/drone script)
site/manara/assets/         logo.svg, sample images (with CREDITS.txt), other static assets
tools/manara/lib.mjs        shared Playwright helpers (launch, openPage, overflow, check, done)
tools/manara/shot.mjs       screenshots + console/overflow check: node tools/manara/shot.mjs mission.html --w 390,1440 --lang ar,en
tools/manara/test-*.mjs     browser + engine tests (one per module); test_kit.py for the Python kit
```

## Laws

1. **Classic scripts only** (`<script defer>`, IIFE, no ES modules, no `fetch()`/XHR of local
   files): everything must work from `file://`. Data ships as scripts that set globals.
2. **No frameworks, libraries or CDNs** (Google Fonts only, and the page must still work
   when they fail to load). Hand-written CSS on the tokens in `base.css`.
3. **RTL first, LTR ready.** Arabic is the default (`dir=rtl`); English flips the page to
   `dir=ltr`. Use logical properties only (`inset-inline-*`, `margin-inline-*`,
   `padding-inline-*`, `text-align:start`, `border-inline-*`). Never `letter-spacing` on
   Arabic. Canvas drawings and code blocks are direction-neutral (floor plans are north-up).
4. **Bilingual, every string.** Arabic must be natural Modern Standard Arabic written for a
   Gulf audience (not a literal translation); English must be clear and simple.
   - Long text in HTML: author both, `<span data-l="ar">…</span><span data-l="en">…</span>`
     (or on blocks: `<p data-l="ar">`, `<p data-l="en">`). CSS shows only the active one.
   - Short UI strings: `Manara.strings({'mission.start': {ar:'ابدأ', en:'Start'}})` then
     `<button data-i18n="mission.start">`; attributes via
     `data-i18n-attr="aria-label:mission.start;title:mission.start"`.
   - Strings built in JS: `Manara.L({ar:'…', en:'…'})`. Re-render on `window` `langchange`.
   - `<title data-en="English title">العنوان العربي</title>`.
5. **Both themes** (`html[data-theme=dark|light]`, colours from tokens only — canvases read
   tokens with `getComputedStyle` and re-draw on `themechange`), **phones first** (360–390px)
   up to 1440px+, **no horizontal page scroll**, `prefers-reduced-motion` respected (no
   flashing for reduced-motion users), keyboard + screen-reader accessible (real
   buttons/links, labels, focus states, `aria-live` for alerts/logs).
6. **Honesty is a feature.** No invented real-world facts or statistics: every real-world
   number shown on the site comes from the sourced list in `docs/MANARA-SOURCES.md` and shows
   its source. Simulation outputs are always labelled as simulation results. The detector is
   described accurately: *rule-based computer vision (colour models + flicker/motion analysis)*,
   not "deep learning". Limitations are stated openly (judges reward this).
7. **Safety of content.** Never assign bus-delivered, uploaded or user-typed text to
   `innerHTML` — use `textContent`/DOM nodes. Static strings authored in the code are fine.
8. **Ownership.** Each page owns its `<page>.html`, `css/<page>.css`, `js/<page>.js` and its
   test file. `base.css` and `core.js` are shared: do not edit them from a page; put
   page-specific overrides in the page CSS and report any needed shared change.

## Page skeleton

```html
<!doctype html>
<html lang="ar" dir="rtl" data-lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title data-en="MANARA — Mission Control">منارة — غرفة العمليات</title>
<meta name="description" content="…">
<meta name="theme-color" content="#0a0e15">
<meta name="color-scheme" content="light dark">
<script>/* copy verbatim from site/manara/index.html: applies theme + language before paint */</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="icon" href="assets/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/mission.css">
<script src="js/core.js" defer></script>
<script src="js/sim.js" defer></script>
<script src="js/mission.js" defer></script>
</head>
<body data-page="mission.html">
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>
<header class="nav" data-nav></header>      <!-- core.js renders nav, language + theme buttons, mobile menu -->
<main id="main">…</main>
<footer class="foot" data-footer></footer>  <!-- core.js renders the footer (a full-screen app page may omit it) -->
</body>
</html>
```

`?lang=en` in the URL forces English (handy for links from the English pitch).
`[data-icon="fire"]` on any element prepends that icon (names: see `ICONS` in core.js).

## Design tokens (base.css, both themes)

`--bg --bg-2 --surface --surface-2 --surface-3 --ink --ink-2 --muted --line --line-2 --head
--brand --brand-2 --on-brand --accent --accent-2 --safe --warn --danger --info --fire-1 --fire-2
--fire-3 --grad --grad-cool --grad-soft --glass --glass-line --shadow-sm --shadow --shadow-lg
--r --r-sm --r-lg --font --font-h --font-m --ease --nav-h`

Meaning is fixed across pages: **brand/fire = ember orange**, **accent = drone/tech cyan**,
**safe = green** (safe zone, "I'm safe"), **warn = amber** (forecast, smoke), **danger = red**
(fire, evacuate, "need help"), **info = blue** (civil defence).

Components: `.wrap(.wide) .sec(.alt) .sec-head .eyebrow .sec-title .sec-lead .grid .g2 .g3 .g4
.card(.ico) .panel(.panel-h) .kpi(.safe|.warn|.danger|.cool) .note(.warn|.danger|.safe)
.btn(.btn-primary|.btn-cool|.btn-ghost|.btn-danger|.btn-safe|.btn-sm) .icon-btn .chip .tag
(.safe|.warn|.danger|.info|.cool) .dot(.live) .table-wrap .table pre.code .field .switch .page-hero
.rv (reveal) .num/.mono (tabular figures) .sr-only`.

## core.js API — `window.Manara`

| Member | |
|---|---|
| `NAME`, `TAGLINE` | `{ar, en}` product name and tagline (rename in one place) |
| `lang()`, `setLang('ar'\|'en')`, `toggleLang()` | fires `langchange` on `window` (detail = lang) |
| `L({ar,en})`, `s(key)`, `strings(dict)`, `applyI18n(root?)` | i18n helpers |
| `num(n, digits?)`, `clock(seconds)` | number formatting (Western digits in both languages), `mm:ss` |
| `theme.get()`, `theme.set(t)`, `theme.toggle()` | fires `themechange` on `window` |
| `icon(name, cls?)`, `logo(size?)` | inline SVG strings (static, safe for innerHTML) |
| `toast(text\|{ar,en}, kind?, ms?)` | kind: `danger`/`safe`/`warn` |
| `reveal(root?)` | re-run scroll reveal for dynamically added `.rv` |
| `link.send(msg)`, `link.on(fn) → unsubscribe`, `link.last(type)`, `link.clear(type)` | cross-tab bus |
| `$`, `$$`, `store(k, v?)`, `reduce`, `page()` | small helpers |

`window.__manaraReady === true` once the shell has rendered (tests wait for it).

## Cross-tab bus — `Manara.link` messages

Delivered to every other open MANARA tab (BroadcastChannel `manara`, with a localStorage
fallback). `send()` adds `ts` (epoch ms), `from` (page file) and a unique `_k`. The last message of
each `type` is kept, so a page opened later can read it with `Manara.link.last(type)`.
Coordinates are simulation grid cells (`x` east, `y` south, the map is north-up, **1 cell = 5 m**,
grid 96 × 64). Text is always `{ar, en}`. One alert schema serves all six hazards.
`ManaraSim.busAlert(sim, personKey)` and `ManaraSim.busDispatch(sim)` build exactly these messages.

```js
// mission → phone: a new public alert (and every ~2 s an 'alert-update' with the same shape)
{ type:'alert', id:'A1', hazard:'fire'|'gas'|'flood'|'dust'|'heat'|'sos',
  level:'watch'|'shelter'|'evacuate',                            // 'shelter' = stay in, close windows ('warning' is accepted as an alias)
  area:{ar:'الحيّ التجريبي (محاكاة)', en:'Demo district (simulation)'},
  at:{x:59.5, y:19.5}, fire:{x:59.5, y:19.5}, radiusM:400,       // where the hazard is; `fire` is an alias present only when hazard = 'fire'
  wind:{deg:315, speed:4},                                       // wind blowing FROM deg, m/s
  you:{x:52, y:40}, distanceM:108, bearingDeg:56,                // the demo citizen → the hazard
  safe:{x:30, y:52, name:{ar:'نقطة التجمع — ساحة المدرسة', en:'Assembly point — school yard'}} | null,   // where the live route ends
  route:[[52,40],[50,41],…,[30,52]],                             // live hazard-aware route for this person ([] when told to stay)
  etaMin:7,                                                      // forecast minutes until the hazard reaches "you" (the dust front today; null if not forecast)
  action:'fire.exit'|'fire.refuge'|'fire.shelter'|'fire.watch'|'gas.crosswind'|'gas.shelter'|'flood.upstairs'|'flood.stay'|'dust.shelter'|'heat.stopwork'|'sos.victim'|'sos.volunteer'|…,   // message key for messages.js
  lang:'ml', formats:['sound','vibration','text','pictogram'],   // this person's language and delivery formats (strobe for Deaf, voice for blind, card for children)
  persona:'adult'|'elderly'|'child'|'wheelchair',
  instructions:[{ar:'…', en:'…'}, …],
  map:'data:image/png;base64,…' }                                // optional small north-up thumbnail (≤ 60 kB)
{ type:'alert-clear', id:'A1' }
// mission → phone: nearest-responder dispatch = the unit that reaches the scene FASTEST given SIMULATED traffic (fictional units)
{ type:'dispatch', id:'D1',
  units:[{ kind:'fire'|'ambulance'|'police'|'rescue', name:{ar:'…', en:'Civil Defence Station A (demo)'}, etaMin:4.2,
           status:'recommended'|'approved'|'dispatched'|'en-route'|'on-scene'|'cleared',
           why:{ar:'…', en:'Station B is 1 km farther but 47 s faster because rush-hour traffic on "West Arterial"'} }],
  hospital:{ name:{ar:'…', en:'Emergency Trauma Centre (demo)'}, etaMin:2.1 } | null,
  state:'recommended'|…, origin:'manara'|'ordinary', scene:{node:'BLD', x:59, y:27} }     // state/origin/scene are optional extras for readers
// phone → mission
{ type:'citizen', id:'A1', status:'ack'|'safe'|'help', needs:['wheelchair'|'deaf'|'blind'|'elderly'|'child'], lang:'ar', room:'203' }
// detector → mission / phone
{ type:'detection', source:'camera'|'image'|'video', state:'suspect'|'fire'|'smoke'|'clear',
  confidence:0.86, fireRatio:0.031, smokeRatio:0.004, snapshot:'data:image/jpeg;base64,…' }  // snapshot ≤ 40 kB
```

## Engines

**`window.ManaraSim`** (`js/sim.js`) — a pure, seeded, deterministic multi-hazard simulation (no DOM, no
network; attaches to `globalThis`, so Node tests load it with `vm`). The exact API is the header
comment of `sim.js`; the tests are `tools/manara/test-sim.mjs` (about 250 checks, ~75 s). In one paragraph:
a Doha-style block (96 × 64 cells of 5 m) with a 3-floor workers' residence and a 2-floor school (each
with its own indoor graph: rooms, corridor, Stair A/B, roof door, refuge balcony, guard desk), an LPG
store, a road underpass, a park, a road graph with **time-varying simulated traffic** and fictional
responders (2 fire stations, 2 police posts, an ambulance point, 2 hospitals with capability flags).
Seven presets (`fire-night` default, `gas-night`, `flood-day`, `dust-day`, `heat-day`, `sos-day`,
`school-fire-day`). One pipeline for every hazard — sensors with noise/drift/warm-up → a **two-key**
verification state machine (SUSPECT → CONFIRMED needs two independent keys; the public alert needs the
operator's approval; the local alarm never waits) → alert composer (zones, per-person language/format,
night wake-up ladder T+0/+30/+60/+90 s that stops on confirmation) → hazard-aware routing (multi-source
Dijkstra from the hazard's safe targets, exit states OPEN/SMOKE/FIRE/LOCKED, instant re-route, only
affected people messaged) → headcount against the register → hand-off card data and an OASIS CAP 1.2
string (status Exercise, one `<info>` per language). Fire spread is a published cellular automaton
(Alexandridis et al., 2008: `p_burn = p_h (1+p_veg)(1+p_den) p_w p_s`, `p_w = exp(c1·V)·exp(c2·V·(cos θ − 1))`,
`c1 = 0.045`, `c2 = 0.131`, `p_h = 0.58`; values checked in Russo et al., Chem. Eng. Trans. 36, 2014), run outdoors on
the grid and indoors on the room graph; gas is a wind-advected, diffusing, heavier-than-air plume; flood is
a rising depth field over a height map; dust is an advancing PM10 front; heat is WBGT-driven strain. A docked
**drone** follows PATROL → TRACK → HOLD and yields to firefighting assets.
**Dispatch** picks, per required unit type, the unit with the **fastest ETA given traffic** (not the nearest by distance),
shows it with the runner-up and the "why", recomputes ETA every second, re-routes en-route units, and re-dispatches
automatically when a road closes, traffic worsens or a unit becomes busy; hospitals are chosen by capability and capacity.
`ManaraSim.ab()` runs the SAME seed as an *ordinary alarm* world and a *MANARA* world and returns comparable metrics;
every assumption is a named parameter in `ManaraSim.PARAMS` (default, range, unit, bilingual description, source) for
Mission Control's sliders, and `ManaraSim.sweep()` shows how the A/B gap changes with one assumption. All results are
labelled **SIMULATION — a mechanism check, not proof of impact**.

**`window.ManaraFire`** (`js/fire.js`, owned by the detector builder) — pure functions on
`{data, width, height}` RGBA frames: per-pixel fire rules (YCbCr, Çelik & Demirel 2009;
RGB/HSI, Chen et al. 2004), smoke cues, connected regions, and a temporal detector
(flicker + growth + hysteresis) that outputs `clear | suspect | fire | smoke` with a
confidence. Its exact API is documented at the top of `fire.js`.

## Commands

```bash
node tools/manara/shot.mjs mission.html --w 390,1440 --theme dark,light --lang ar,en   # look at it
node tools/manara/test-engine.mjs        # ManaraSim + ManaraFire unit tests (Node, no browser)
node tools/manara/test-ui.mjs            # every page: loads clean, both languages/themes, no overflow
python3 tools/manara/test_kit.py         # the Python kit's detection function
cd site && python3 -m http.server 8765 # then open http://localhost:8765/manara/
```
