# MANARA («منارة») — product specification (multi-hazard)

The single source of truth for *what* the project is. `docs/MANARA.md` says *how* the code
is organised; `docs/MANARA-SOURCES.md` lists the only real-world numbers we may show.
Competition: a Ministry of Education innovation competition in **Qatar** (Arabic first).

## Identity

| | Arabic | English |
|---|---|---|
| Name | **منارة** | **MANARA** (lighthouse) |
| Tagline | ترى الخطر… توقظ الجميع… وتُضيء طريق النجاة | Sees the danger. Wakes everyone. Lights the safe way out. |
| Slogan | لا نائمَ يُنسى، ولا أحدَ يُترك خلفنا | No one left asleep. No one left behind. |
| Positioning | فرق الطوارئ تواجه الخطر… والمنارة تُوصل كل إنسان إلى الأمان | Responders fight the hazard. The lighthouse gets every person to safety. |
| Fire line | الصقور تكافح النار… والمنارة تُخرج الجميع بأمان | The falcons fight the fire. The lighthouse gets everyone out. |
| Design rule | الدليل قبل الذعر | Proof before panic. |

A lighthouse guides people in *any* storm. MANARA does **not** fight fires, pump floods or
treat patients, and does **not** compete with Civil Defence, the ambulance service or national
alert systems. It fills the gap they leave in every kind of emergency: **the last 100 metres**
— making sure every person near the danger is **woken**, **understands** what to do *for
this hazard* in their own language and format, takes a route that is **really safe now**, and
is **counted**; and that anyone who **needs help** is reached fast.

## The problem (story — sourced numbers only)

- Emergencies hurt people where they live and work, often at night or when they cannot call:
  smoke while asleep (USFA), a gas leak nobody smells, water rising in an underpass, a dust
  storm, a worker collapsing from heat, an elderly person who falls alone.
- Gulf data first (from `docs/MANARA-SOURCES.md`, prefer Qatar figures), then international
  research labelled as such (e.g. "as little as 1–2 minutes to escape" — NFPA).
- Today's systems are strong at *detecting* and *responding* (Civil Defence drones, connected
  building alarms, national phone alerts, 999). What still fails is the last 100 metres: a
  generic siren or a two-language text does not wake a sleeping worker who reads Malayalam or
  Nepali, tell a Deaf resident which exit is safe, tell people to move *crosswind* from a gas
  leak but *upstairs* in a flood, know that the roof door is locked, or know who is still inside.

## One pipeline, six hazard playbooks

**أرصد ← أتحقق ← أُبلغ ← أُرشد ← أعُدّ ← أُسلّم**
**Sense → Prove → Reach → Guide → Count → Hand off**

1. **Sense** — fixed cheap *sentinels* (ESP32 + a few sensors) watch 24/7; residents can also
   raise an SOS. The sentinel's **local alarm never waits** for a network, a drone or a person.
2. **Prove (Proof before panic)** — two independent sensor keys must agree, then the **human
   key** (an operator taps *Approve*) for any public alert. One sensor alone can never go
   beyond **SUSPECT**. The civil-defence-operated docked **drone** adds an outside view when
   needed.
3. **Reach** — targeted zones (building/block, not a whole city) and a personal message for
   each person: language (Arabic, English + residents' languages), format (sound, vibration,
   strobe for Deaf people, voice for blind people, picture card for children and low-literacy
   readers), and a **night wake-up ladder** that climbs until the person confirms.
4. **Guide** — a hazard-aware route computed on the map (multi-source Dijkstra from the safe
   targets of *this* hazard, avoiding danger), re-routed instantly when an exit or a road
   changes (exit truth). Only people affected by a change get a new message.
5. **Count** — "I'm safe" / "I need help" check-in (phone, booth tablet, the offline ESP32
   check-in point «MANARA-SAFE», a teacher's class tablet). Live headcount against the register.
6. **Hand off** — a card for Civil Defence / ambulance: where the danger is, exit/road states,
   who is unaccounted and where, who needs help and what help — plus an **OASIS CAP 1.2**
   export (status = Exercise) so national alert systems could carry it.

| Hazard | Sentinel keys (two independent) | Protective action (the route's target) | What the drone adds |
|---|---|---|---|
| 🔥 **Fire & smoke** «حريق ودخان» | thermal hotspot (MLX90640) + camera vision / MQ-2 smoke | **Evacuate** by an exit that is really OPEN, away from fire and smoke; downwind neighbours **shelter** (close windows, switch off fresh-air AC) | outside view (roof, balconies, external stairs), thermal search for unaccounted people |
| 🧪 **Gas leak** «تسرّب غاز» (LPG, H₂S, CO) | two gas readings (two sensors or two places) + rising trend | **Leave crosswind/upwind** of the plume; no switches, no flames; CO → fresh air; LPG is heavier than air (avoid low spots) | sniff and map the plume from outside |
| 🌊 **Flash flood** «سيول وأمطار» | water-level sensor + rain/QMD warning | **Move to higher ground / upper floors**, avoid underpasses, never walk or drive through moving water | camera on flooded roads and underpasses |
| 🌪️ **Dust storm** «عاصفة غبارية» | PM10 sensor + visibility (camera) / QMD warning | **Shelter indoors**, close windows, mask; people with asthma first; stop outdoor work and driving | visibility check |
| 🌡️ **Extreme heat** «إجهاد حراري» | WBGT estimate from temperature + humidity (+ globe) + work-hour rules | **Stop work & go to a cool shelter**, water; a worker whose body heat rises and stops moving → automatic SOS | thermal check on outdoor workers |
| 🆘 **Someone needs help** «شخص يحتاج مساعدة» | SOS button / fall sensor + no answer to the check-in call | **Bring help to the person**: nearest trained volunteer + ambulance (999); the docked drone flies an AED / first-aid kit with a live view (authority-operated only) | arrives first (drone-AED studies), live view for the dispatcher |

The **same code** handles all six: each hazard module provides a danger field, its safe
targets, its sensor keys and its message playbook; the pipeline, routing, alerts, wake-up
ladder, headcount and hand-off are shared. That is the core engineering idea to explain:
**one platform, not six gadgets**.

## Depth vs breadth (what to build for real)

- **Deep (real sensors + live booth demo):** fire & smoke (hot mug on the twin board +
  camera Evidence Lab), gas (MQ-2 with **hand-sanitiser vapour** — no flames, no lighter gas),
  someone-needs-help (SOS button + fall/“no answer” ladder), heat (SHT31 + a hair dryer).
- **Simulated + low-cost sensor demo:** flood (float/water-level sensor in a cup of water),
  dust (PMS5003 optional; otherwise simulated).
- Every simulated item is labelled **SIM**.

## Demo pillars (what judges must see in 3 minutes)

1. **Pick a disaster — MANARA responds correctly.** On the tabletop twin (or in Mission
   Control) the judge triggers a hazard: hot mug (fire), sanitiser swab (gas), water in the cup
   (flood), SOS button (help), hair dryer (heat). The *same* system gives a *different*,
   correct instruction each time: exit vs crosswind vs upstairs vs bring-help.
2. **Proof before panic** (`detect.html`, *Evidence Lab*): layered fire vision C1 colour → C2
   motion → C3 flicker → C4 shape/texture → C5 persistence → C6 thermal veto; *Fool me if you
   can* decoy scoreboard; *Decoy Lab* held-out results; a *Sensor Lab* tab shows the two-key
   logic for gas / flood / heat / dust streams (simulated or live over Web Serial).
3. **Every person reached and counted** (`alert.html` phone wall + Mission Control): four
   personas, each hazard gives each persona the right message, format and route; wake-up
   ladder; "I'm safe" turns rooms green; "I need help" brings help.

Plus a **simulation A/B** (same seed: *ordinary alarm* vs *MANARA*) labelled **SIMULATION —
a mechanism check, not proof of impact**, with every assumption shown as a labelled slider.
Impact evidence = the student's measured sensor latency / false-alarm tables, the detector's
held-out results, and the planned comprehension test (with ethics approval).

## Map and scenarios (Mission Control)

One Doha-style neighbourhood block (north-up, ~5 m cells) containing: a 3-floor **residential
building** (workers' accommodation, 120 registered residents, Stair A / Stair B / roof door,
refuge balcony, guard desk), a **school** (classes on 2 floors, school yard assembly point), a
**construction site** (outdoor workers, cooling shelter), shops and a mosque, a **road
underpass** (low ground), a park, a gas line / LPG store, assembly points, a drone dock, a
Civil Defence station and an ambulance point at the map edges.

Scenarios = hazard × time: **night 04:00** (most residents asleep) or **day 10:30** (school in
session, workers outside). Presets: Fire at night (default), Gas leak, Flash flood, Dust storm,
Heat at the worksite (day), Someone needs help.

## The four live personas (phone wall)

| Persona | Needs | Example behaviour |
|---|---|---|
| **Ravi**, worker, room 203, reads Malayalam | asleep at night / works outside by day | wake-up ladder in Malayalam + picture card; in heat: stop-work + cool shelter; in gas: crosswind route |
| **Huda**, Deaf resident, room 105 | no sound | strobe + strong vibration + text + pictograms |
| **Abu Salem**, elderly wheelchair user, room 302 | no stairs | fire: refuge balcony + "Civil Defence has your location"; flood: stay upstairs; flagged on the hand-off card |
| **Lina**, 9, pupil in class 5B | child | cartoon picture card, "follow your teacher", counted on the teacher's tablet |

**Languages:** Arabic + English complete. Templates in **Malayalam, Nepali, Bengali, Urdu,
Tagalog, Hindi** (Qatar's large resident communities) are shipped marked
«مسودة — تحتاج مراجعة متحدث أصلي» / "Draft — needs native-speaker review" until signed off
(logged in the report). Never live machine translation in the product; picture cards carry
the core message for everyone.

## Honesty rules (judges reward this; banned phrases)

- Never "first", "world-first", "saves X lives", "AI" for rule-based code (Arabic: «رؤية حاسوبية
  بقواعد», not «ذكاء اصطناعي» for the detector). The *system* may be called smart.
- **N/A for this stimulus** instead of invented physical numbers.
- Simulation numbers are labelled SIM; the A/B is a mechanism check.
- US/international research is labelled as such; Qatar/Gulf figures are preferred.
- Limitations stated openly: MQ sensors are cross-sensitive and need calibration/warm-up;
  Gulf heat (batteries rated to ~40 °C); dust/glare false alarms; glass blocks long-wave IR;
  webcam flicker limits; the drone is a concept operated by Civil Defence under national drone
  rules (QCAA in Qatar; no drop devices on recreational drones in the UAE); MANARA plugs into
  national systems, it does not replace them.
- Respect prior art: e.g. the Qatari ISEF 2025 drone project for H₂S leak detection with
  geofencing — MANARA is different (multi-hazard, person-centred: verified, inclusive,
  routed, counted) and says so politely.
- **Student ownership:** the report includes a *built / bought / helped-by (mentor, AI tools)*
  table and an *explain-it checklist* for every formula; AI assistance is disclosed.
- Human-subject tests only with school ethics approval and consent.
- Sensitive events (e.g. the 2024 Mangaf fire, regional conflicts) only with official facts,
  respectfully, no imagery; never use attack/war framing.

## Hardware (student-buildable, booth-safe: no flames, no flammable gas)

- **Multi-sensor sentinel / twin board:** ESP32 + MLX90640 (fire + body heat, looking down at
  the tabletop twin from ~1 m) + MQ-2 (smoke/LPG/alcohol vapour) + MQ-7 (CO, optional) + SHT31
  (temperature/humidity → heat index/WBGT estimate) + water-level sensor (float switch or
  HC-SR04 over a cup) + PMS5003 (PM2.5/PM10, optional) + SOS push button + MPU6050 (fall,
  optional) + 3 exit toggle switches (Stair A, Stair B, roof door) + WS2812 exit arrows +
  buzzer + LED ring (friendly light: steady green + white double flash every 2 s).
- **Pan-tilt sensor head** (2 × SG90): autonomous PATROL → TRACK → HOLD on the hotspot.
- **Safe-point check-in:** ESP32 soft-AP «MANARA-SAFE» captive page (room + language +
  Safe/Help, no names). Booth tablet main, QR fallback.
- **Drone:** concept + optional supervised clip; any educational drone on sale (Tello is
  discontinued). A Python script runs the vision detector on a laptop webcam.
- Booth prep: MLX90640 warm-up ~4 min, MQ sensors ~3 min (longer burn-in first time).

## Interfaces

JS namespace `window.Manara`; engines `ManaraSim` (js/sim.js), `ManaraFire` (js/fire.js);
playbook text `window.MANARA_MSG` (js/messages.js); storage prefix `manara-`;
BroadcastChannel `manara`. Details and message schemas: `docs/MANARA.md`.

**Serial protocol v1** (twin board ⇄ browser via Web Serial, 115200 baud, newline-delimited JSON):

```json
board → browser (≈4 Hz):
{"v":1,"type":"frame","ms":12345,
 "thermal":{"tmax":41.2,"tmean":29.8,"hot":{"x":0.62,"y":0.31,"t":41.2}},
 "gas":{"mq2":312,"mq7":40}, "air":{"t":33.5,"rh":61,"hi":41.0,"wbgt":31.2}, "pm":{"pm25":18,"pm10":44},
 "water":{"cm":1.2}, "sos":false, "fall":false,
 "exits":{"A":"open","B":"locked","R":"open"},
 "local":{"alarm":true,"hazard":"fire"}}
board → browser (≈1 Hz, optional thermal image, 32×24 row-major, °C ×10 as integers):
{"v":1,"type":"grid","w":32,"h":24,"t10":[295,296,…]}
board → browser (check-in forwarded from MANARA-SAFE):
{"v":1,"type":"checkin","room":"203","status":"safe","lang":"ml"}
browser → board:
{"v":1,"type":"signs","A":"go|stop|off","B":"go|stop|off","R":"go|stop|off","siren":"off|on","ring":"green|amber|red|off","hazard":"fire|gas|flood|dust|heat|sos|none"}
```
`hot.x/y` are 0..1 across the twin board (x → east, y → south). Absent sensors are omitted.
