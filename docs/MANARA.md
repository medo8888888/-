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


## National engine (the whole of Qatar) — `js/national.js` → `window.ManaraNational`

User requirement (verbatim): "I wnat it on the whole of Qatar". `docs/MANARA-SPEC.md` ("Scope: the whole of Qatar") describes the two zoom levels; this is
the engine of the **national view**: a pure, seeded, deterministic, DOM-free, network-free classic script (works from `file://` and in Node via `vm`). The exact API
is the header comment of `site/manara/js/national.js` (kept in sync with the code and checked by `tools/manara/test-national.mjs`, ~180 checks, ~40 s, exit code 1 on failure).

```
site/manara/data/qatar-geo.js         window.MANARA_QATAR_GEO         outline, 8 municipalities, 135 places, projection helper   (OpenStreetMap snapshot, ODbL)
site/manara/data/qatar-facilities.js  window.MANARA_QATAR_FACILITIES  138 hospitals / EDs, police, Civil Defence fire stations, ambulance points
site/manara/data/qatar-roads.js       window.MANARA_QATAR_ROADS       23,135 nodes, 32,136 edges, 6,116 km of major roads + decode()
site/manara/js/national.js            window.ManaraNational           this engine
tools/manara/test-national.mjs                                         tests
```
Load order in a page: the three data scripts, then `js/national.js` (the engine resolves the data when you call `create()`, so the order only matters at that moment).

**Real vs simulated (say it on screen).** REAL: a snapshot of OpenStreetMap — outline, municipalities, places, positions of facilities as mapped, the road graph and its tags, the
OSM names of roads. SIMULATED (SIM): where any vehicle is, whether a unit is busy, traffic and congestion, rain-water closures, the heat / dust / rain fields, ED capacity.
999 stays the dispatcher; MANARA is not an official service; no real vehicle is tracked and no real incident is used. Attribution: *Contains data © OpenStreetMap contributors, ODbL 1.0* (`nat.W.attribution`, `N.world(nat).attribution`, in every snapshot and every phone result as `credit`).

```js
const N = ManaraNational;
const nat = N.create({ seed: 7, date: '2026-07-12', hour: 7.5 });                       // Sunday 07:30; weekend = Friday + Saturday
const inc = N.createIncident(nat, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 });   // fastest units given traffic, reserved
N.step(nat, 60);  const snap = N.snapshot(nat);                                          // draw snap.units / snap.incidents[].plan.units[].route / snap.kpis
Manara.link.send(N.busDispatch(nat, inc.id));                                            // → mission → phone bus (type 'dispatch', scope 'national')
N.nearestFacilities({ lon, lat, kind: 'hospital', k: 3 });                               // phones: straight-line km + estimated road time + bearing + "call 999"
N.findFartherButFaster(7);                                                               // a real example for the pitch (numbers below)
```

### API at a glance

| Area | Functions |
|---|---|
| Life cycle | `create({seed, date, hour, day, t, params, tickSec, autoApprove, data})` · `restart` · `step(nat, dt)` · `run(nat, untilT)` · `snapshot(nat, {full, lastEvents, routes, kpis})` · `hash(nat)` · `world(nat)` · `units(nat)` · `time(nat, t)` · `timeAt(nat, iso, hour)` · `defaults()` |
| Operator / test actions | `setParam` · `jamRoad(edge, factor)` · `jamArea(lon, lat, radiusM, factor)` · `unjamRoad` · `clearJams` · `closeRoad` · `openRoad` · `closeArea` · `setUnitBusy(id, bool)` · `cordon(incId, radiusM)` · `liftCordon` · `setRain(mmHr)` · `addRainCell` · `clearRain` · `startDust` · `stopDust` · `addPonding` · `edgeAt(lon, lat)` (snap a map click to a road) · `roadInfo(edge)` |
| Incidents and dispatch | `createIncident({hazard, lon, lat, severity, patients})` · `incident(id)` · `approve(id)` (the human key) · `cancelIncident(id)` · `dispatchNational(nat, incident, t)` (pure) · `busDispatch(id)` · `busAdvisory()` · `residentLines(id)` · `cap(id, {area: 'circle'\|'polygon'})` · `route(from, to, t, {em})` |
| Map helpers | `viewport({width, height, bbox\|center, pxPerKm})` → `toScreen` / `fromScreen` / `zoomAt` / `pan` · `haversineM` · `bearingDeg` · `compass` · `snap` · `polyline(edge)` · `congestionMap(nat, t)` (per edge, 1 = free … 0 = closed) · `PROFILES` |
| Hazards and KPIs | `fields(nat, t)` (land mask + municipality + WBGT estimate + PM10 + rain on a 0.02° grid) · `floodState` · `heatExposure` · `middayBan` · `visibility(pm10)` · `kpis(nat)` · `municipalities` · `advisories` · `renderMsg` |
| Phones | `nearestFacilities({lon, lat, kind: 'hospital'\|'ed'\|'police'\|'fire'\|'ambulance'\|'any', k, t, nat, edOnly, sort})` |
| A/B and demo | `ab({seed, n, hazards, hour\|t, params})` · `sensitivity({loads, busy, n})` · `findFartherButFaster(seed)` · `sampler` |

### Dispatch plan (`incident.plan`, `snapshot().incidents[].plan`)

```js
{ id:'D-N1', incident:'N1', state:'recommended'|'approved'|'dispatched'|'en-route'|'on-scene'|'cleared', origin:'manara', scope:'national', hazard, severity, sim:true,
  scene:{ lon, lat, edge, frac, roadLon, roadLat, snapM },  t:{ recommended, approved, dispatched, 'en-route', 'on-scene', cleared },   // simulation seconds
  patients:{ n, need:'ed'|'trauma'|'paed' },  notes:[{ar,en}],
  units:[{ slot:'fire#1', kind:'fire'|'rescue'|'ambulance'|'police', unitId, name:{ar,en}, state, optional, standby, flags:[…],
           etaSec, etaMin, distM, pos:{lon,lat}, route:[[lon,lat],…],                          // remaining path (≤ 200 points), drawn on the map
           why:{ar,en},                                                                       // "Station B is 4.4 km farther (straight line) but 86 s faster because congestion on "X" along the route of the nearer unit …"
           whyData:{ chosen:{id, etaSec, roadM, straightM, congestedSegments, delaySec, contraflowM, top:[{edge, name, delaySec, cong}]}, runnerUp, nearestByStraight,
                     farButFaster, gainSec, extraStraightM, extraRoadM, reason:'traffic'|'network'|null, trafficDeltaSec, networkDeltaSec, skippedBusy:[ids], cutOff:[ids], nearestBusy? },
           runnerUp:{unitId, name, etaSec, distM}, nearestByStraight:{unitId, name, straightM, etaSec}, reroutes, replaced:[{unitId, t, reason}], states:{…}, unreachable }],
  hospital:{ id, name, etaSec, etaMin, distM, lon, lat, fits, freeSlots, ed:'yes'|'unknown', edNote:{ar,en}, assumed, route, why, options } | null }
```

Required unit types follow `docs/MANARA-SPEC.md`: fire → fire (+ a second engine at severity 3) + ambulance + police (+ rescue from severity 2) · gas → fire/HazMat + ambulance + police · flood → rescue + police + ambulance ·
dust → police + ambulance (standby) · heat → ambulance + destination hospital (+ a note for cooling support) · SOS → ambulance + destination hospital. "Rescue" is a Civil Defence / fire-station unit.
The chosen unit is the **minimum ETA among available units** (ETA = turn-out + drive + legs between a building and its road; busy units are skipped and the text says so), shown with the runner-up, the
straight-line contrast and the congested segments of each route. Hospitals: the fastest to reach among those with a verified ED (`ed = 'yes'`); *unknown* is excluded unless `edUnknownMode = 1` (then flagged "assumed");
restricted, obstetric-only and paediatric-only entries never take general patients; trauma needs the Level I entry on the HMC list, paediatric patients a paediatric ED; capacity is a labelled assumption.
**State machine:** recommended → approved (operator, or `approveSec` in auto mode) → dispatched (`acceptSec`; 999 stays the dispatcher) → en-route (after turn-out) → on-scene → cleared (`onSceneSec`); the vehicle drives home and is available again.
**Automatic re-routing** (event `reroute-unit`) when another route saves ≥ `rerouteGainSec` or a road ahead closes; **automatic re-dispatch** (event `redispatch {kind, from, to, reason: 'busy'|'blocked'|'faster', gainSec}`) when a unit becomes busy / is diverted, is cut off, or another unit now beats it by ≥ `redispatchMarginSec`;
before approval the recommendation is refreshed (event `recommendation-change`).

### Bus message additions (Manara.link, compatible with the `dispatch` message above)

```js
// mission → phone: national dispatch (same shape as sim.js's busDispatch; scene.x/y (grid cells) are replaced by lon/lat, and scope says which one it is)
{ type:'dispatch', scope:'national', id:'D-N1', state, origin:'manara', scene:{ node:'NAT', lon, lat }, incident:{ id:'N1', hazard, muni:'doha', place:{ar,en} | null },
  units:[{ kind:'fire'|'ambulance'|'police'|'rescue', name:{ar,en}, etaMin, status:'recommended'|…|'cleared', why:{ar,en} }], hospital:{ name:{ar,en}, etaMin } | null, sim:true }
// mission → phone: national advisories (heat / dust / flood / traffic), message keys + params + a ready bilingual text
{ type:'advisory', scope:'national', id:'ADV-<t>', clock:'HH:MM:SS', items:[{ key:'nat.adv.heat.stop', params:{ muni:{ar,en}, wbgt:37.1, limit:32.1 }, level:'info'|'watch'|'warning'|'danger',
  hazard:'heat'|'dust'|'flood'|'traffic', muni:'doha'|null, text:{ar,en} }], sim:true }
```
`ManaraNational.residentLines(nat, incidentId)` returns calm lines for the phones (`[{kind, state, etaMin, key, text}]`, keys `nat.resident.*`).

### Assumptions registry (`ManaraNational.PARAMS`, every number is a named, labelled assumption unless it has a source id)

| Group | Key | Default | Range | Unit | English label | Source |
|---|---|---|---|---|---|---|
| Traffic (simulated) | `trafficLoad` | 1 | 0–2 | × | Global traffic multiplier | assumption |
| Traffic (simulated) | `peakDepthUrban` | 0.55 | 0.1–0.9 | fraction | Peak speed loss in the urban core | assumption |
| Traffic (simulated) | `peakDepthRural` | 0.12 | 0–0.6 | fraction | Peak speed loss on rural highways | assumption |
| Traffic (simulated) | `tidalDepth` | 0.15 | 0–0.5 | fraction | Commuter tidal flow | assumption |
| Traffic (simulated) | `corridorDepth` | 0.15 | 0–0.5 | fraction | Named arterial corridors | assumption |
| Traffic (simulated) | `industrialDepth` | 0.2 | 0–0.6 | fraction | Heavy traffic near industrial areas | assumption |
| Traffic (simulated) | `noisePct` | 8 | 0–30 | % | Per-segment random variation | assumption |
| Traffic (simulated) | `emergencyFactor` | 1.3 | 1–1.8 | × | Emergency-vehicle speed bonus | assumption |
| Traffic (simulated) | `incidentSlowPct` | 30 | 0–80 | % | Slow-down near an incident | assumption |
| Traffic (simulated) | `cordonSlowPct` | 40 | 0–90 | % | Slow-down inside a cordon | assumption |
| Traffic (simulated) | `rainSlowPer10mm` | 3 | 0–10 | %/(10 mm/h) | Rain slow-down | assumption |
| Traffic (simulated) | `dustSlowMax` | 45 | 0–80 | % | Dust slow-down at full storm | assumption |
| Traffic (simulated) | `costBucketSec` | 30 | 5–300 | s | Congestion time bucket | assumption |
| Fleet (simulated) | `unitBusyPct` | 10 | 0–100 | % | Units randomly busy | assumption |
| Fleet (simulated) | `busyBlockMin` | 20 | 5–120 | min | Busy-status period | assumption |
| Fleet (simulated) | `divertPctPerHour` | 0 | 0–50 | %/h | Diverted en-route units | assumption |
| Fleet (simulated) | `unitsPerStation` | 1 | 1–4 | units | Vehicles per station | assumption (at start) |
| Fleet (simulated) | `ambulanceBasing` | 1 | 0–2 | 0/1/2 | Where ambulances are based | assumption (at start) |
| Fleet (simulated) | `fireIncludeHq` | 1 | 0–1 | 0/1 | Civil Defence headquarters complexes | assumption (at start) |
| Fleet (simulated) | `industrialFire` | 1 | 0–1 | 0/1 | Industrial fire stations | assumption (at start) |
| Fleet (simulated) | `policeIncludeAdmin` | 0 | 0–1 | 0/1 | Police departments / training sites | assumption (at start) |
| Fleet (simulated) | `hazmatAllStations` | 1 | 0–1 | 0/1 | HazMat capability | assumption (at start) |
| Dispatch & responders | `turnoutFireSec` | 60 | 0–300 | s | Fire crew turn-out | assumption |
| Dispatch & responders | `turnoutAmbSec` | 45 | 0–300 | s | Ambulance turn-out | assumption |
| Dispatch & responders | `turnoutPoliceSec` | 90 | 0–300 | s | Police turn-out | assumption |
| Dispatch & responders | `approveSec` | 20 | 0–300 | s | Operator approval time | assumption |
| Dispatch & responders | `acceptSec` | 10 | 0–120 | s | Control-room acceptance | assumption |
| Dispatch & responders | `onSceneSec` | 900 | 120–7200 | s | Time a unit stays on scene | assumption |
| Dispatch & responders | `redispatchMarginSec` | 30 | 5–300 | s | Re-dispatch margin | assumption |
| Dispatch & responders | `rerouteGainSec` | 10 | 2–300 | s | Re-route gain | assumption |
| Dispatch & responders | `cooldownSec` | 120 | 0–900 | s | Cool-down after a swap | assumption |
| Dispatch & responders | `recheckSec` | 30 | 5–300 | s | Re-evaluation period | assumption |
| Dispatch & responders | `contraflowKph` | 20 | 0–40 | km/h | Contraflow speed for responders | assumption |
| Dispatch & responders | `accessKph` | 25 | 5–60 | km/h | Off-network leg speed | assumption |
| Dispatch & responders | `autoCordon` | 1 | 0–1 | 0/1 | Automatic cordon when police arrive | assumption |
| Dispatch & responders | `multiUnitSeverity` | 3 | 1–4 | level | Severity that calls two units | assumption |
| Dispatch & responders | `edUnknownMode` | 0 | 0–1 | 0/1 | Hospitals with "ED unknown" | assumption |
| Dispatch & responders | `edCapacity` | 8 | 1–40 | patients | ED simultaneous capacity (assumption) | assumption |
| Dispatch & responders | `edOccupancyPct` | 60 | 0–100 | % | ED occupancy (assumption) | assumption |
| Dispatch & responders | `loadSec` | 240 | 0–900 | s | Patient loading | assumption |
| Dispatch & responders | `rankTopK` | 5 | 2–12 | units | Candidates re-timed exactly | assumption |
| Incidents | `fireGrowthMin` | 20 | 2–120 | min | Fire growth time constant | assumption |
| Incidents | `gasGrowthMin` | 10 | 2–120 | min | Gas-leak growth time constant | assumption |
| Incidents | `engineSetupSec` | 120 | 0–600 | s | Fire set-up on scene | assumption |
| Incidents | `engineEffectPct` | 60 | 0–100 | %/10 min | Suppression effect | assumption |
| Heat (simulated) | `heatRhPct` | 60 | 20–90 | % | Mean relative humidity (scenario input) | assumption |
| Heat (simulated) | `heatSunLoadC` | 12 | 0–20 | °C | Sun load on the globe | HAZARDS §8 |
| Heat (simulated) | `heatOffsetC` | 0 | -10–8 | °C | Temperature offset (scenario) | assumption |
| Heat (simulated) | `heatCoastCoolC` | 2.5 | 0–6 | °C | Sea-breeze daytime cooling | assumption |
| Heat (simulated) | `heatInlandKm` | 40 | 10–80 | km | Distance where the sea effect vanishes | assumption |
| Heat (simulated) | `heatUrbanBumpC` | 1.5 | 0–4 | °C | Urban heat bump | assumption |
| Heat (simulated) | `wbgtWarn` | 28 | 20–34 | °C | WBGT warn level | S52 |
| Heat (simulated) | `wbgtStop` | 32.1 | 25–38 | °C | Stop-all-work level | S19 |
| Dust (simulated) | `dustWindDeg` | 315 | 0–359 | ° | Wind direction (from) | Wikipedia: Shamal |
| Dust (simulated) | `dustWindMps` | 12 | 3–25 | m/s | Wind speed | APS DFD 2020 abstract |
| Dust (simulated) | `dustFrontFactor` | 0.8 | 0.3–1.2 | × | Front speed / wind speed | assumption |
| Dust (simulated) | `dustPeak` | 1200 | 200–7000 | µg/m³ | PM10 peak (scenario input) | S30 |
| Dust (simulated) | `dustBackground` | 50 | 10–150 | µg/m³ | PM10 before the storm (input) | assumption |
| Dust (simulated) | `dustRampKm` | 12 | 2–60 | km | Front ramp width | assumption |
| Dust (simulated) | `dustBodyKm` | 220 | 40–600 | km | Storm thickness | assumption |
| Dust (simulated) | `dustWarn` | 150 | 50–400 | µg/m³ | PM10 warn | S31 |
| Dust (simulated) | `dustDanger` | 255 | 100–600 | µg/m³ | PM10 danger | S49 |
| Dust (simulated) | `dustCritical` | 425 | 200–1000 | µg/m³ | PM10 critical | S49 |
| Flood (simulated) | `rainMmHr` | 0 | 0–120 | mm/h | Nationwide rain rate (scenario input) | assumption |
| Flood (simulated) | `underpassCatchment` | 0.6 | 0.05–2 | cm per mm | Underpass catchment gain | assumption |
| Flood (simulated) | `underpassPumpCmH` | 8 | 0–30 | cm/h | Underpass pumping | assumption |
| Flood (simulated) | `roadCloseCm` | 30 | 10–60 | cm | Road-closing depth | S55 |
| Flood (simulated) | `roadOpenCm` | 15 | 0–40 | cm | Re-opening depth | assumption |
| A/B comparison | `abPlaceWeight` | 0.5 | 0–1 | share | Share of incidents near places | assumption |
| A/B comparison | `abMaxOffroadKm` | 3 | 0.5–15 | km | Farthest from a road | assumption |

### Message keys (`ManaraNational.MSG`, default texts; placeholders in braces)

| Key | English | العربية |
|---|---|---|
| `nat.sim` | SIM: unit positions, availability, traffic and the heat / dust / rain fields are all simulated; the map is a snapshot of OpenStreetMap | محاكاة (SIM): مواقع الوحدات وتوفّرها والازدحام وحقول الحرارة والغبار والمطر كلها محاكاة؛ الخريطة لقطة من OpenStreetMap |
| `nat.call999` | In an emergency call 999 — MANARA is not an official service and this is informational only | في الطوارئ اتصل بـ 999 — منارة ليست خدمة رسمية وهذه المعلومات للاسترشاد فقط |
| `nat.credit` | Contains data © OpenStreetMap contributors, ODbL 1.0 | © مساهمو OpenStreetMap — رخصة ODbL |
| `nat.adv.heat.warn` | {muni}: heat stress possible (WBGT estimate {wbgt} °C). Take breaks, drink water, use shade. | {muni}: إجهاد حراري محتمل (WBGT تقديري {wbgt} °م). خذ فترات راحة واشرب الماء واستظل. |
| `nat.adv.heat.stop` | {muni}: stop work — WBGT estimate {wbgt} °C is above the {limit} °C stop-work limit. The legal figure is a measured WBGT. | {muni}: أوقفوا العمل — WBGT التقديري {wbgt} °م فوق حدّ الإيقاف {limit} °م. الرقم القانوني يُقاس بمقياس WBGT. |
| `nat.adv.heat.ban` | Outdoor work is banned {from}–{to} (1 June to 15 September — Ministerial Decision 17 of 2021). | حظر العمل في الهواء الطلق من {from} إلى {to} (من 1 يونيو إلى 15 سبتمبر — قرار وزاري رقم 17 لسنة 2021). |
| `nat.adv.dust.warn` | {muni}: high dust (PM10 estimate {pm10} µg/m³) — stay indoors and close windows. | {muni}: غبار مرتفع (PM10 تقديري {pm10} µg/m³) — ابقَ في الداخل وأغلق النوافذ. |
| `nat.adv.dust.danger` | {muni}: dangerous dust (PM10 estimate {pm10} µg/m³) — stop driving and outdoor work. | {muni}: غبار خطر (PM10 تقديري {pm10} µg/m³) — أوقف القيادة والعمل في الخارج. |
| `nat.adv.dust.critical` | {muni}: critical dust (PM10 estimate {pm10} µg/m³) — get into a closed building now. | {muni}: غبار حرج (PM10 تقديري {pm10} µg/m³) — الجأ إلى مبنى مغلق فوراً. |
| `nat.adv.flood.watch` | {muni}: rain {mm} mm/h (simulated) — keep away from tunnels and low underpasses. | {muni}: أمطار {mm} مم/س (محاكاة) — ابتعد عن الأنفاق والمعابر المنخفضة. |
| `nat.adv.flood.underpass` | {n} underpass(es) closed by rain water (simulated) — never drive through water. | أُغلق {n} نفق/معبر بسبب مياه الأمطار (محاكاة) — لا تعبر الماء. |
| `nat.adv.traffic.heavy` | Heavy traffic across the country (simulated): arrival times are longer than usual. | ازدحام شديد في أنحاء البلاد (محاكاة): أزمنة الوصول أطول من المعتاد. |
| `nat.unit.state.recommended` | Recommended | مُوصى بها |
| `nat.unit.state.approved` | Approved | معتمدة |
| `nat.unit.state.dispatched` | Dispatched | أُرسلت |
| `nat.unit.state.en-route` | En route | في الطريق |
| `nat.unit.state.on-scene` | On scene | في الموقع |
| `nat.unit.state.cleared` | Cleared | أُغلقت المهمة |
| `nat.resident.eta` | {unit} ETA {min} min | {unit}: الوصول خلال {min} د |
| `nat.resident.eta.ambulance` | {unit} ETA {min} min — stay where you are | {unit}: الوصول خلال {min} د — ابقَ مكانك |
| `nat.resident.onscene` | {unit} is on scene | {unit} وصلت إلى الموقع |



### The simulated models in one table

| Layer | What is simulated | Real inputs from the data | Published values used (source id in `docs/MANARA-SOURCES.md`) |
|---|---|---|---|
| Traffic | congestion = (1 − loss) × noise × jam × incident × weather × cordon; loss = daily pressure(day type, hour) × class sensitivity × urban/rural depth (+ corridor, industrial, commuter tide) × multiplier | road classes, OSM `maxspeed` where tagged, one-way rules, OSM road names (Corniche, Salwa Road, ring roads, industrial-area roads), place kinds and junction density (urban weight) | none: shapes follow a Qatar University 318-intersection study found by web search (peaks 06:30–08:30, 12:30–14:30, 17:15–19:15; Thursday–Saturday differ) — **secondary, abstract not opened**. Friday is the statutory weekly rest day (The Peninsula 27 Mar 2017; Labour Law via summaries — secondary); Friday + Saturday as the weekend of government, schools and many employers is widely reported (secondary web results, no primary page opened). Friday-prayer lull is an assumption (Jumu'ah is around 11:30–12:15 in Doha) |
| Fleet | one unit per station (`unitsPerStation`), busy by a seeded draw per period (`unitBusyPct`), units wait at their base and move along routes | Civil Defence / fire stations (directorate office excluded), police stations / traffic / unknown (departments and training excluded), the 3 OSM ambulance points, hospitals with a verified ED | — |
| Heat | WBGT *estimate* per cell by hour, month and place (coast gradient, urban bump); outdoor-work areas = OSM industrial / port places only | municipality polygons, coast distance, place tags | stop-all-work 32.1 °C (S19); outdoor work banned 10:00–15:30 from 1 June to 15 September (S18); warn 28 °C (S52); Stull (2011) wet bulb (S70) and 0.7 Tnwb + 0.2 Tg + 0.1 Tdb (S53); the seasonal temperature curve is a cosine through two third-party monthly means (Climate-Zone, Doha airport, **secondary**) |
| Dust | a shamal-style front from the north-west advancing at `dustFrontFactor` × wind speed, PM10 ramp behind it, relative visibility index | municipality polygons | PM10 150 µg/m³ (S31), 255 / 425 (S49), April-2015 peak above 7,000 (S30); shamal = north-westerly wind, a "shamal day" = flow above 8.75 m/s for ≥ 3 h (Wikipedia, APS DFD 2020 abstract: secondary) |
| Flood | rain (national rate + moving cells) fills tunnels / underpasses at `underpassCatchment` cm per mm minus pumping; closure at 30 cm (S55), re-opening at 15 cm; seeded sump factor per tunnel; user-placed ponding points | the **250 tunnel / underpass edges** of the road data (flag 1) — **no elevation model exists**, so depth exists only there | S55 (US guidance), S28 (Oct-2018 Doha rain, underpasses flooded) |

### Data limitations that shape the engine (details: `docs/MANARA-DATA.md` §8)

* OSM has 20 usable fire stations (the official count of centres is 23; the directorate office is not a unit), 26 usable police posts and **only 3 ambulance points** — so ambulances are also based at the 12 hospitals with a verified ED that can take general patients (6 of the 18 ED entries are restricted, obstetric-only or paediatric-only). Coverage gaps (e.g. Lusail, the desert) are gaps of the **data**, not claims about the real service.
* The extract holds only major roads: one-way roads often have their opposite carriageway outside it. The engine therefore lets responders on a call drive short stretches against a one-way direction at `contraflowKph` = 20 km/h (never on motorways, ramps or tunnels); the *why* text says when a route does (e.g. Dukhan station → Dukhan town: 29 min without, 9 min with).
* `ed` is verified for 18 hospital entries only; hospital capacity, unit availability, positions and traffic are labelled assumptions; no turn restrictions, signals or live traffic; virtual connectors (flag 256) are flagged assumptions. A route is a simulation input, never a navigation instruction.
* Tertiary roads exist in the extract only inside the Greater Doha / Al Rayyan box.

### Commands

```bash
node tools/manara/test-national.mjs     # the national engine (determinism, Dijkstra vs brute force, dispatch, re-dispatch, hazards, A/B, CAP, a simulated day, performance)
node tools/manara/test-qatar-data.mjs   # the bundled data
```
