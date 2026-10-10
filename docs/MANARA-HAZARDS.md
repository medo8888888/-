# MANARA — hazard playbooks (verified October 2026)

One playbook per hazard for the code builders (`sim.js`, `mission.js`, `detect.js` Sensor Lab,
`alert.js`, `messages.js`), the report and the booth: cheap student sensors with their real limits,
thresholds taken from cited standards, the **second independent key** ("proof before panic"),
the protective action and routing rule, the message for each persona, what the drone uniquely
adds, and the honest limitations. The last section is a machine-friendly table to copy.

## 0. Rules and legend

- `S18…S74` and the older `S1…S17` are rows in `docs/MANARA-SOURCES.md`, the only place a
  real-world number may come from. Qatar context and judge answers: `docs/MANARA-QATAR.md`.
- **basis** column of the final table: `cited` = taken from a standard, exposure limit or product
  rating; `derived` = our arithmetic on cited numbers (unit conversion, % of LEL); `student-set` =
  a demo default the student must calibrate locally, **not** a standard; `N/A` = no honest number
  exists for this stimulus, so the page shows "N/A for this stimulus".
- A **cited** limit is a health or detector rating from an international body (US OSHA/NIOSH/NWS/EPA,
  WHO) or Qatar law. It is **not** a certification of our sensor. International and US figures
  are always labelled as such; Qatar figures come first.
- Every hazard uses the same chain: **Sense → Prove → Reach → Guide → Count → Hand off**.
  *Prove* = two independent keys plus the human key. One sensor can never go beyond **SUSPECT**.
  The sentinel's **local alarm never waits** for a network, a drone or a person.
- Every simulated number says **SIM**; the A/B simulation is "a mechanism check, not proof of
  impact". Never "first", never "saves lives", never "AI" for rule-based code.
- Medical and first-aid wording on screen must be checked against HMC / Civil Defence wording
  before printing; this file gives the structure and the cited facts.

## 1. One pipeline, six hazards — the two keys

| Hazard | Key 1 (sensor) | Key 2 (independent of key 1) | Human key | Protective action → route target |
|---|---|---|---|---|
| Fire and smoke | MLX90640 hotspot ≥ 57 °C, or rising ≥ 8.3 °C/min | MQ-2 smoke index rises above its baseline, **or** camera vision (ManaraFire C1–C5, with the C6 thermal veto) | operator taps Approve | evacuate by an exit that is really OPEN, away from fire and smoke; downwind neighbours shelter |
| Gas leak | gas sensor A: MQ-2 (LPG), MQ-7 (CO) or MQ-136 (H2S) above warn | a **second reading** (second sensor, or the same gas at a second place) **and** a rising trend (three consecutive rising samples) | operator taps Approve | leave crosswind or upwind; avoid low ground for LPG and H2S; CO → fresh air |
| Flash flood | water depth ≥ 15 cm (ultrasonic or float) | a second sensor at a second spot, **or** a QMD rain/thunder warning | operator taps Approve | higher ground and upper floors; the underpass leaves the route graph |
| Dust storm | PMS5003 PM10 (10-minute mean) ≥ 150 µg/m³ | camera visibility drop, **or** QMD dust/wind warning | operator taps Approve | shelter indoors, windows closed; stop outdoor work and driving |
| Extreme heat | WBGT estimate ≥ workload limit (28 °C light work), measured WBGT > 32.1 °C is the legal stop line | the **calendar key**: inside 10:00–15:30 and 1 June–15 September (S18), **or** a second sensor/globe at the worksite | site supervisor/operator | stop work, go to the cool shelter, drink water; a worker who stops moving after a heat flag → automatic SOS |
| Someone needs help | SOS button, or MPU6050 impact followed by stillness | **no answer** to the check-in call within 30 s (second press also counts) | the dispatcher (999) decides; MANARA only sends a package | bring help to the person: nearest trained volunteer and ambulance by fastest ETA; drone AED is concept-only |

"Independent" means a different physical principle or a different place or an official source:
two MQ sensors that share one heater supply are **not** independent for the demo's purposes if the
supply is the failure; say which pair you used.

## 2. Sensor sheet — exact modules, real limits, and the warm-up truth

| Module | Measures | Datasheet limits we rely on | Qatar-relevant caution | Src |
|---|---|---|---|---|
| **MQ-2** (Hanwei) | combustible gas and smoke: LPG, propane, hydrogen (also alcohol vapour) | detection 300–10,000 ppm combustible gas; heater 5.0 V ± 0.2 V, ≤ 900 mW; preheat "over 48 hours" | not specific: sanitiser vapour (ethanol) triggers it, so a booth demo is a stand-in, not an LPG test | S60 |
| **MQ-7** (Hanwei) | carbon monoxide | 20–2,000 ppm CO; heater cycles 5 V for 60 s then 1.4 V for 90 s; use −20 to 50 °C, < 95 %RH; preheat ≥ 48 h | 50 °C upper limit is reached inside a closed box in a Gulf summer; a breakout board that holds the heater at 5 V gives unreliable CO readings | S61 |
| **MQ-136** (Winsen) | hydrogen sulfide | 1–200 ppm H2S; heater 5.0 V ± 0.1 V, ≤ 900 mW; preheat over 48 h | the 10 ppm NIOSH ceiling sits near the low end of its range: treat ppm as indicative | S63 |
| **MQ-135** (Winsen) | general air quality: ammonia, sulfide, benzene series, smoke | 10–1,000 ppm (ammonia, toluene, hydrogen, smoke); heater ≤ 950 mW; preheat over 48 h | no health threshold applies to its output: trend and second-key use only | S62 |
| **SGP30** (Sensirion) | TVOC (0–60,000 ppb) and CO2eq (400–60,000 ppm) | CO2eq is **calculated** from ethanol and H2 signals, not a CO2 measurement; recommended 5–55 °C | label it "estimated CO2", never "CO2" | S64 |
| **PMS5003** (Plantower) | particles 0.3–10 µm; PM1.0, PM2.5, PM10 | effective range **PM2.5** 0–500 µg/m³; ±10 µg/m³ at 0–100, ±10 % at 100–500; −10 to +60 °C; response ≤ 10 s | accuracy is specified for PM2.5 only; a real dust storm can exceed 7,000 µg/m³ PM10 (S30), so the sensor saturates: a saturated reading means "at least danger" | S65 |
| **SHT31** (Sensirion) | temperature, humidity | ±1.5 %RH and ±0.2 °C typical (0–90 °C); −40 to 125 °C | in direct sun it reads the sun-heated housing: fit a radiation shield and say "air temperature in shade" | S66 |
| **DHT22** | temperature, humidity | ±0.5 °C, ±2 %RH (max ±5); −40 to 80 °C | coarser than SHT31; fine for a demo | S66 |
| **HC-SR04** | distance by ultrasound | 2–400 cm, 15° cone, 5 V; **not waterproof** | for a cup of water on the booth only | S67 |
| **JSN-SR04T** | distance by ultrasound, waterproof probe | about 25–450 cm, blind zone about 23 cm (vendor pages) | mount at least 25 cm above the highest water you need to see | S67 |
| **Float switch** | binary level | contact closes at a fixed height | most robust key for a real underpass; place it at 15 cm or 30 cm | — |
| **MLX90640** (Melexis) | 32 × 24 thermal image | field of view 55° × 35° or 110° × 75°; NETD 0.1 K RMS at 1 Hz; target −40 to 300 °C; operating −40 to 85 °C | long-wave infrared does not pass window glass; sun-heated surfaces can cross the 57 °C line | S68 |
| **MPU6050** | 3-axis acceleration and gyro | accelerometer full scale ±2/±4/±8/±16 g; VDD 2.375–3.46 V | no standard fall threshold exists: calibrate (§9) | S69 |
| **SOS button** | a human press | — | the most reliable "sensor" in the kit | — |

**The warm-up truth.** The MQ-2, MQ-7, MQ-135 and MQ-136 datasheets all give a preheat of **48 hours
or more** before readings are stable (S60–S63). The spec's booth routine (about 3 minutes) gives
*indicative* readings only. Do a 48-hour burn-in the first time, warm for about 3 minutes before
each demo, and put a line on the booth: "Readings indicative — cheap sensors, not calibrated with
reference gas". The MQ readings also move with humidity (the datasheet plots Rs/R0 at 30 %, 60 %
and 85 %RH): log temperature and humidity next to every gas reading.

**Engineering notes (derived, not from a source).** Calibrate every ADC channel against a known
reference; keep sensors in shade with airflow; never let a closed enclosure sit in the sun; power
the heaters from a supply that does not sag when the Wi-Fi radio transmits.

## 3. Alert formats common to every hazard

- **Wake-up sound.** The Fire Protection Research Foundation (NFPA, March 2020) reports that a
  **520 Hz low-frequency harmonic tone with a three-pulse pattern** was the most effective signal
  to wake hard-of-hearing participants, with the same result in other studies for children and
  other at-risk groups (S56). Use it for the night ladder. Honest limit: small phone speakers
  reproduce 520 Hz poorly, so pair the tone with strong vibration and, for the Deaf persona, the
  strobe. Never imitate the national alert tone (S36 — the MoI warned of legal consequences).
- **Strobe for Deaf residents is opt-in** with a photosensitivity warning. Hard limit from WCAG 2.3.1:
  nothing flashes more than **three times in any one second** (S57). No strobe at all for users
  with `prefers-reduced-motion`; they get steady light, vibration and text.
- **Language.** Arabic and English are complete; the six community languages are drafts marked
  «مسودة — تحتاج مراجعة متحدث أصلي» / "Draft — needs native-speaker review". Ministry guidance on
  heat is published in several languages (ILO), a useful precedent. Picture cards carry the core
  message for everyone.
- **Personas.** Huda (Deaf): strobe if opted in, strong vibration, large text, pictogram.
  Blind resident: voice and haptics, spoken turn-by-turn ("{n} steps"). Abu Salem (wheelchair):
  never "use the stairs"; refuge or stay-put instructions. Lina, 9 (child): cartoon picture card
  and "follow your teacher". Ravi (low-literacy migrant worker): picture first, one verb, voice in
  his language (draft), and Arabic/English text below.
- Messages below use `{n}`, `{room}`, `{shelter}`, `{place}` placeholders. Gulf-friendly MSA,
  masculine generic imperative. Short on purpose.

---

## 4. Fire and smoke «حريق ودخان»

**Why it matters in Qatar.** Civil Defence reached incidents in 7–10 minutes in 2017 (S26) — but
a home may leave "as little as one or two minutes to escape" once the alarm sounds (S3); modern
living-room fires reach flashover in under five minutes (S5); 49 % of US residential fire deaths
happened 11 p.m.–7 a.m. (S7, international research). Workers' accommodation must have
extinguishers, smoke detectors, an alarm and an evacuation plan (S33), and a June 2016 accommodation
fire near Doha killed 11 (context list). The gap is the person who sleeps through an alarm they
cannot read.

**Sensors.** MLX90640 looking down on the twin board from about 1 m; MQ-2 as a smoke index; camera
with `ManaraFire` (rule-based computer vision, *«رؤية حاسوبية بقواعد»*, 66.7 % on held-out still
images, video rejects static red objects); the board's local buzzer.

**Thresholds.**

- Thermal: warn **57 °C** (135 °F, the fixed-temperature rating of a typical listed heat detector,
  S58); rate-of-rise **8.3 °C/min** (15 °F/min, same class of detector, S58).
- Smoke by MQ-2: **N/A for a standard** — no standard maps an MQ-2 reading to smoke obscuration
  (UL smoke-alarm tests are for certified alarms). Use a **baseline-relative** rule: record clean air
  for 5 minutes, warn at baseline + 3σ, danger at baseline + 10σ (`student-set`, calibrate).
- A hot mug (about 60–70 °C) crosses 57 °C by design: it gives **SUSPECT** only, and the vision
  layers plus the C6 thermal veto decide. That is the point of the Decoy Lab.

**Second key.** Thermal hotspot **and** (MQ-2 smoke index **or** camera vision). Then the human key.

**Protective action and routing.** Evacuate by an exit that is really OPEN (exit truth), away from
fire and smoke; Civil Defence's own advice is to "evacuate the place immediately and call the
emergency number '999'" (S40); closing doors behind you slows the fire (UL FSRI "Close Before You
Doze", S4). Multi-source Dijkstra from the assembly points, with the fire cells, forecast fire and
smoke as blocked or costly; re-route when an exit changes; only affected people get a new message.
Downwind neighbours **shelter** (close windows, switch off fresh-air AC) because wildfire-type smoke
reaches far beyond the fire (S17, international). No lifts in a fire: standard practice, add a
Civil Defence source before printing.

| Persona | Message core (EN) | الرسالة (AR) |
|---|---|---|
| Deaf (strobe opt-in, vibration, text) | FIRE. Leave now by Stair B. Do not use the lift. | حريق. غادر الآن عبر الدرج (ب). لا تستخدم المصعد. |
| Blind (voice, haptic) | Fire. Leave now. Turn left, {n} steps to Stair B, then go down. Keep a hand on the rail. | حريق. غادر الآن. انعطف يسارًا {n} خطوات إلى الدرج (ب) ثم انزل. أبقِ يدك على الدرابزين. |
| Wheelchair | Fire. Do not use the stairs. Go to the refuge balcony. Your location was sent to Civil Defence. | حريق. لا تستخدم الدرج. توجّه إلى الشرفة الآمنة. أُرسل موقعك إلى الدفاع المدني. |
| Child (picture card) | Follow your teacher. Walk, do not run. Go to the school yard. | اتبع معلّمك. امشِ ولا تركض. توجّه إلى ساحة المدرسة. |
| Low-literacy worker (picture + voice) | FIRE — OUT — Stair B | حريق — اخرج — الدرج (ب) |

**What the drone adds.** An outside view of roof, balconies and external stairs, and a thermal
search for unaccounted people. Qatar's Civil Defence already shows its own firefighting drones (S39):
ours is a concept for an authorised agency that gets people out (§11).

**Honest limitations.** Long-wave infrared does not pass glass; sun-heated surfaces and heaters
cross the warn line (so warn is only SUSPECT); the MQ-2 also responds to alcohol and LPG (S60);
glare, dust and webcam flicker cause false alarms in vision; the camera layers are rules, not
learning. **Booth-safe demo:** a hot mug on the twin board and the Evidence Lab. No flame, no smoke.

---

## 5. Gas leak «تسرّب غاز» — LPG, methane, H2S, CO

**Why it matters in Qatar.** In February 2014 LPG leaking from an oven left on overnight ignited in a
Doha restaurant; officials reported 11 dead and 35 injured (S32; respectful, no names, no images).
Civil Defence's rule: open all doors and windows, do not switch on the exhaust fan or lights (S40).
Hydrogen sulfide is an industrial hazard in Qatar's energy sector; the ISEF 2025 project on H2S
detection (S43) shows local interest — MANARA builds on that, it does not compete with it.

**Four gases, four behaviours.**

| Gas | Relative density (air = 1) | Where it goes | Explosive limits | Exposure limits (US, international) | Smell |
|---|---|---|---|---|---|
| **LPG** (propane + butane) | propane 1.55; n-butane 2.11 | **sinks**, pools in cellars, drains, low ground | propane LEL 2.1 %, UEL 9.5 %; butane LEL 1.6 %, UEL 8.4 % | propane TWA 1,000 ppm; IDLH 2,100 ppm = 10 % LEL (S48) | odorised with ethyl mercaptan; odour can fade and some people cannot smell it (S48, supplier note) |
| **Methane** (natural gas) | lighter than air | **rises**, collects at ceilings | LEL 5.3 %, UEL 14 % (CAMEO) | simple asphyxiant | colourless, odourless unless odorised |
| **H2S** | 1.19 | **heavier than air, "may travel along the ground"**, builds up in low and confined spaces (S47) | LEL 4.0 % | NIOSH ceiling 10 ppm (10 min); OSHA ceiling 20 ppm; IDLH 100 ppm (S47) | rotten egg at 0.01–1.5 ppm, but at 100 ppm smell is lost in 2–15 minutes: **smell cannot be relied on** |
| **CO** | 0.97 (mixes) | spreads evenly with the air | LEL 12.5 % | NIOSH TWA 35 ppm, ceiling 200 ppm; OSHA TWA 50 ppm; IDLH 1,200 ppm (S46) | none: "kills without warning" (CDC) |

**Sensors.** MQ-2 for combustible gas (LPG/propane), MQ-7 for CO, MQ-136 for H2S, MQ-135 and SGP30
for a general trend only (S60–S64). For methane we have no suitable sensor in the kit: show
"N/A for this stimulus".

**Thresholds** (the table in §13 repeats them with units):

- LPG as propane-equivalent: warn **1,000 ppm** (OSHA PEL / NIOSH REL), danger **2,100 ppm** (NIOSH
  IDLH = 10 % of the LEL). The MQ-2 range is 300–10,000 ppm, so both lie inside it.
- CO: warn **35 ppm**, danger **200 ppm** (NIOSH REL and ceiling); critical 1,200 ppm (IDLH).
  MQ-7 range 20–2,000 ppm.
- H2S: warn **10 ppm**, danger **20 ppm** (NIOSH ceiling REL, OSHA ceiling); critical **100 ppm**
  (IDLH). MQ-136 range 1–200 ppm.
- Methane: warn 5 % LEL = 2,650 ppm and danger 10 % LEL = 5,300 ppm (`derived` from LEL 5.3 %) —
  only for a methane-specific sensor, not for the MQ-2 in our kit.
- SGP30 and MQ-135: **N/A** — no cited health threshold applies to their outputs.

**Second key.** Two readings that agree (a second sensor, or the same gas at a second place) **and**
three consecutive rising samples above the 5-minute baseline. Then the human key. **Demo
honesty:** hand-sanitiser vapour triggers the MQ-2, but it is **not** LPG. The ppm shown in the booth
is a SIM stand-in and the screen says "simulated LPG — not a real concentration".

**Protective action and routing.** Qatar Civil Defence: ventilate (open doors and windows), no
switches, no exhaust fan, no flame (S40). On top: leave the room and call 999 from outside —
standard LPG-supplier practice; the source was not retrievable this session, confirm with Civil
Defence before printing. Route: leave **crosswind or upwind** of the plume (wind direction is a
SIM slider at the booth). LPG and H2S: **avoid low spots** (cellars, drains, underpass) and go up
and outdoors; methane: avoid ceilings and go outdoors upwind; CO: fresh air at once, check others
for headache and dizziness, call 999, do not go back in. Do **not** tell anyone that "no smell" means
safe (S47).

| Persona | Message core (EN) | الرسالة (AR) |
|---|---|---|
| Deaf | GAS LEAK. No switches, no flames. Leave now and move across the wind (see arrow). | تسرّب غاز. لا مفاتيح ولا لهب. غادر الآن وتحرّك بعرض اتجاه الريح (انظر السهم). |
| Blind | Gas leak. Do not use switches. Walk out now. I will say left or right. Keep away from low ground. | تسرّب غاز. لا تستخدم المفاتيح. اخرج الآن وسأرشدك يمينًا أو يسارًا. ابتعد عن الأماكن المنخفضة. |
| Wheelchair | Gas leak. Open a window if you can reach it. Do not use switches. Help has your room. | تسرّب غاز. افتح نافذة إن استطعت. لا تستخدم المفاتيح. المساعدة تعرف غرفتك. |
| Child | Do not touch switches. Walk outside with your teacher. | لا تلمس المفاتيح. اخرج مع معلّمك. |
| Low-literacy worker | GAS — NO SWITCH — OUT | غاز — لا مفاتيح — اخرج |
| CO variant (all) | Carbon monoxide. Get fresh air now. | أول أكسيد الكربون. اخرج إلى الهواء النقي الآن. |

**What the drone adds.** Sniffing and mapping the plume from outside. Whether a drone may fly in a
possible explosive atmosphere is a decision for the authority, not for us (engineering judgement).

**Honest limitations.** MQ sensors are cross-sensitive (the MQ-2 sheet says "combustible gas **and
smoke**"), drift, move with humidity, and need 48 hours of burn-in; no reference gas at school, so
ppm are indicative; MQ-136's 1 ppm floor is close to the 10 ppm ceiling; MANARA is **never** a
substitute for a certified gas detector in a real building.

---

## 6. Flash flood «سيول وأمطار»

**Why it matters in Qatar and the Gulf.** On 20–21 October 2018, 84 mm fell in Abu Hamour, "the
highest amount ever recorded in Doha areas during the month of October", and several tunnels
and underpasses flooded (S28). In April 2024 the UAE recorded about 254 mm in under 24 hours (S29).
Qatari advice: stay away from open drains and electrical sources, avoid waterlogged areas, "do not
be tricked by water puddles" (S71). The underpass is where water collects and people still drive in.

**Sensors.** HC-SR04 over a cup (booth) or JSN-SR04T over an underpass (waterproof probe, mount ≥ 25
cm above the highest water); a float switch placed at 15 cm or 30 cm is the most robust. Depth =
mount height − measured distance.

**Thresholds.** Warn **15 cm** (6 in: "It only takes 6 inches of moving water to knock you off your
feet"), danger **30 cm** (12 in: "can float a car or small SUV"); 18 in (46 cm) "can carry away large
vehicles" (S55, US National Weather Service, international research; inches converted). These
statements are about *moving* water; the sensor measures static depth and **cannot measure flow**:
"N/A for this stimulus". A rising trend of three consecutive readings strengthens a warning.

**Second key.** A second sensor at a second location **or** a QMD rain/thunderstorm warning (an
official source, entered by the operator in the demo). Then the human key.

**Protective action and routing.** Move to higher ground and upper floors; never walk or drive
through moving water — "Turn Around, Don't Drown" (S55). Remove the flooded underpass and low roads
from the route graph; targets are high ground, upper floors and refuge points; vehicles are told
to stop, not to "find another way through". Numbers on the phone card: Municipality 184, Ashghal
188, Kahramaa 991 for a power cut, 999 for a life threat (S71).

| Persona | Message core (EN) | الرسالة (AR) |
|---|---|---|
| Deaf | WATER RISING. Do not enter the underpass. Go to an upper floor or higher ground. | ارتفاع منسوب المياه. لا تدخل النفق. اصعد إلى طابق أعلى أو مكان مرتفع. |
| Blind | Water is rising outside. Stay inside or go up. Do not walk toward the underpass. I will guide you. | المياه ترتفع في الخارج. ابقَ في الداخل أو اصعد. لا تتجه إلى النفق. سأرشدك. |
| Wheelchair | Water is rising. Stay upstairs. Do not go down. Help knows your room. | المياه ترتفع. ابقَ في الطابق العلوي ولا تنزل. المساعدة تعرف غرفتك. |
| Child | Stay inside with your teacher. Do not touch the water. | ابقَ في الداخل مع معلّمك. لا تلمس الماء. |
| Low-literacy worker | WATER — UP — STAY | ماء — اصعد — ابقَ |
| Driver (any) | Do not drive through water. Turn around. | لا تعبر المياه بسيارتك. ارجع. |

**What the drone adds.** A camera on flooded roads and underpasses. Rain and wind limit small drones
(engineering judgement); the legal frame is §11.

**Honest limitations.** Ultrasonic distance moves with air temperature: the speed of sound is
about 331.3 + 0.606·T m/s, so in 45 °C air it is about 358.6 m/s while the HC-SR04 sheet assumes
340 m/s — **a 5.5 % error** (`derived`, physics), which at 100 cm is 5.5 cm against a 15 cm warn
line: compensate with the SHT31 temperature. Foam, rain drops and turbulence disturb readings; the
HC-SR04 is not waterproof; a real flash flood can outrun a human approval, so the local alarm and
the float switch must not wait. The NWS depths are US guidance. **Booth-safe demo:** a cup of
water under an HC-SR04, plus a floating switch.

---

## 7. Dust storm «عاصفة غبارية»

**Why it matters in Qatar.** In the 1–3 April 2015 storm PM10 in Doha exceeded **7,000 µg/m³**
(S30). Qatar's PM10 standard is 150 µg/m³ over 24 hours and 50 µg/m³ for the year, and standards were
exceeded on 159 days in 2012 (S31, reported from an official report); the WHO 2021 guideline is
45 µg/m³ (24 h) and 15 µg/m³ (annual) (S50). The EPA lists "outdoor workers" among groups that may
have higher exposure (S49).

**Sensors.** PMS5003 (laser scattering; PM10 is derived, accuracy specified for PM2.5 only, S65);
a camera for visibility; optional wind; QMD warnings. The WMO defines blowing dust as dust "raised
by the wind to moderate heights above the ground" with horizontal visibility "sensibly reduced" at
eye level, 1.80 m (International Cloud Atlas). We do **not** use numeric visibility classes (not
verified on a primary page): the camera gives a relative visibility index.

**Thresholds** (PM10, 10-minute mean; standards are 24-hour averages and the sensor reacts in
seconds, so the 10-minute rule is a **design choice**, `student-set`): warn **150 µg/m³** (Qatar's
24-hour standard; the EPA's "Moderate" band ends at 154); danger **255 µg/m³** (EPA "Unhealthy"
starts at 255); critical **425 µg/m³** (EPA "Hazardous", S49). Show 45 µg/m³ (WHO) as the healthy
reference. A **saturated** PMS5003 reading (≥ 500) counts as "at least danger".

**Second key.** Camera visibility drop **or** a QMD dust/wind warning. Then the human key.

**Protective action and routing.** Shelter indoors with windows and doors closed; people with
asthma or lung and heart disease, older adults and children first; stop outdoor work and driving;
if you must go out, wear a dust mask (wording to be checked with the Ministry of Public Health).
Route target: the nearest enclosed building, shortest outdoor exposure; no long outdoor walks.

| Persona | Message core (EN) | الرسالة (AR) |
|---|---|---|
| Deaf | DUST STORM. Stay inside. Close windows and doors. | عاصفة غبارية. ابقَ في الداخل وأغلق النوافذ والأبواب. |
| Blind | Dust storm. Stay inside with windows closed. If you are outside I will guide you to the nearest door. | عاصفة غبارية. ابقَ في الداخل ونوافذك مغلقة. إن كنت في الخارج سأرشدك إلى أقرب باب. |
| Wheelchair / elderly | Stay inside. Close windows. Keep your medicines near you. | ابقَ في الداخل وأغلق النوافذ. أبقِ أدويتك قريبة منك. |
| Child | Go inside with your teacher. Close the windows. | ادخل مع معلّمك. أغلقوا النوافذ. |
| Low-literacy worker | STOP WORK — GO INSIDE — MASK | أوقف العمل — ادخل — ضع الكمامة |

**What the drone adds.** A visibility check; dust and wind limit small drones (engineering judgement).

**Honest limitations.** The PMS5003's effective range is 0–500 µg/m³ for PM2.5 against a real storm of
thousands (S65, S30); dust can clog the inlet (engineering judgement); no standard exists for a
camera visibility number; at the booth dust is **simulated** (SIM), the PMS5003 is optional.

---

## 8. Extreme heat «إجهاد حراري»

**Why it matters in Qatar.** Outdoor work is banned 10:00–15:30 from 1 June to 15 September, and
**all work must stop if WBGT exceeds 32.1 °C** (S18, S19). An ILO study (summer 2019, over 5,500 work
hours) found core temperature above 38 °C for 0–3 % of the shift at a stadium site where workers could
self-pace and rest, against 8 % at a farm (S20); in summer 2013 HMC reported about 30 people a day at
the Hamad Hospital emergency room with heat complaints (S74). Rules are a schedule or a measurement;
the worker still needs a personal message in a language they read.

**Sensors.** SHT31 for air temperature and humidity (shielded, in shade); optionally a black-globe
thermometer — a black globe with a thermometer inserted in its centre (NWS paper) — which is what a
true WBGT needs; MLX90640 for a quick thermal look at outdoor workers (surface, not core).

**How MANARA estimates WBGT (and why it says "estimate").** OSHA gives outdoor WBGT as
**0.7·Tnwb + 0.2·Tg + 0.1·Tdb** and indoor/no-sun WBGT as **0.7·Tnwb + 0.3·Tg** (S53). With a T/RH
sensor only:

1. Natural wet bulb Tnwb ≈ the **Stull (2011)** wet-bulb function of T and RH: Tw = T·atan[0.151977·(RH
   + 8.313659)^½] + atan(T + RH) − atan(RH − 1.676331) + 0.00391838·RH^1.5·atan(0.023101·RH) −
   4.686035 (RH in %, T in °C). We checked it against a psychrometric solve (Bolton saturation
   vapour pressure 6.112·exp(17.67·T/(T+243.5)) hPa): worst difference **0.86 °C** over 20–50 °C and
   10–90 % RH (S70). A natural wet bulb in still air is a little higher than this, so the estimate
   leans low.
2. Globe temperature Tg = Tdb + ΔTg, where ΔTg is a **sun-load input** (0 in shade or indoors, then use
   the indoor formula; a SIM slider up to about 15 °C outdoors). It is an assumption, labelled SIM.
3. **SIM illustration, not a measurement:** at 40 °C and 40 % RH, Tw ≈ 28.6 °C; WBGT ≈ 32.0 °C in shade and
   ≈ 35.0 °C in full sun (ΔTg = 15). At 35 °C and 70 % RH: ≈ 31.7 °C in shade. Qatar's 32.1 °C line is a
   **measured** value; a screen that shows an estimate must say "estimate".
4. **Do not** use the simplified `0.567·Ta + 0.393·e + 3.94` formula for alarms: it is published
   (ACSM 1987) but known to be biased; at 40 °C / 40 % RH it gives 38 °C, far above a plausible WBGT.

**Heat index (NWS, international research).** Implemented from the published Rothfusz regression
with its low- and high-humidity adjustments (S51); our implementation reproduces the NWS chart
(90 °F/70 % → 106; 96 °F/65 % → 121). Classes: Caution 80–90 °F; **Extreme Caution 90–103 °F** (heat
stroke, cramps or exhaustion possible); **Danger 103–124 °F**; Extreme Danger 125 °F and above;
sunshine can add up to 15 °F. OSHA adds: "Outdoor workers have died of heat stroke when the day's
maximum Heat Index was only 86°F" — so the heat index alone under-warns.

**Thresholds.** WBGT estimate by workload (OSHA, adapted from NIOSH 2016, S52; unacclimatized action
limit / acclimatized limit, °C): light 28/30, moderate 25/28, heavy 23/26, very heavy 21/25. MANARA
default: warn at the workload's **unacclimatized** limit (28 °C for light work), danger at **32.1 °C**
(Qatar law, S19). Heat index: warn 32.2 °C (90 °F), danger 39.4 °C (103 °F) (`derived` from S51).
Core temperature for heat stroke (CDC: 103 °F = 39.4 °C or higher, S54): a camera cannot measure it:
**N/A for this stimulus**.

**Second key.** The **calendar key**: inside 10:00–15:30 and 1 June–15 September while outdoor work is
flagged (S18) — it is independent of every sensor; **or** a second sensor or globe at the worksite.
Then the human key (site supervisor).

**Protective action and routing.** Stop work, go to the cool shelter (shade, a cooled room), drink
water, rest — the ILO study ties low heat strain to self-pacing, breaks, drinking water and shade
(S20). Heat stroke (hot skin, confusion, passing out) → **call 999**, cool the person, give nothing to
drink (CDC, S54). Route to the nearest cooling shelter, weighting sunlit edges as costlier than
shaded ones. A worker who stops moving after a heat flag triggers an automatic SOS (§9).
MANARA nudges and counts; it does **not** enforce the law or certify an employer.

| Persona | Message core (EN) | الرسالة (AR) |
|---|---|---|
| Low-literacy worker (Ravi; picture sun + stop + shade + water) | STOP WORK. Go to the shade. Drink water. | أوقف العمل. اذهب إلى الظل. اشرب ماءً. |
| Deaf (wristband vibration + text) | HEAT DANGER. Stop work. Cool shelter at {shelter}. | خطر حرارة. أوقف العمل. مكان التبريد عند {shelter}. |
| Blind | Heat danger. Stop work. I will guide you to the cool shelter. Drink water. | خطر حرارة. أوقف العمل. سأرشدك إلى مكان التبريد. اشرب ماءً. |
| Wheelchair / elderly | Stay in a cool room. Drink water. Tell someone if you feel dizzy or confused. | ابقَ في غرفة باردة واشرب ماءً. أخبر أحدًا إن شعرت بدوار أو ارتباك. |
| Child | Go inside to the cool classroom. Drink water. | ادخل إلى الصف المكيّف واشرب ماءً. |

**What the drone adds.** A thermal look at outdoor workers: surface temperature only, **not** a
diagnosis. Legal frame §11.

**Honest limitations.** An estimate is not a measurement; SHT31 in sun reads high without a shield;
NIOSH itself says its limits "may not be protective of everyone"; the DHT22 is coarser than the SHT31;
MQ-7 and SGP30 temperature limits (50 and 55 °C) matter inside enclosures. **Booth-safe demo:** SHT31
and a hair dryer, with the WBGT labelled "estimate".

---

## 9. Someone needs help «شخص يحتاج مساعدة» — medical SOS, fall, heat stroke, cardiac arrest, drowning

**Why it matters in Qatar.** In Qatar's national cardiac-arrest registry (1,238 cases) **64.0 % happened
at home**, 61.8 % were witnessed, 42.4 % received bystander CPR, and 17.8 % survived to discharge (S25).
HMC's target is to reach 75 % of 999 calls within 10 minutes in urban areas (S24). Globally, an
estimated 684,000 people die from falls each year and adults over 60 suffer the most (WHO, S59).
International drone-AED studies: the drone arrived before the ambulance in 67 % of real emergencies,
median 3 min 14 s earlier (S15); in simulated flights 5:21 versus 22:00 (S16) — evidence that drones
can arrive first, never fire statistics.

**Sensors.** SOS push button (a human decision); MPU6050 worn at the waist or trunk for fall
detection (impact followed by stillness); the check-in call ("no answer" ladder); MLX90640 presence
check (optional). Published work on trunk-worn tri-axial accelerometers supports a **single threshold
on the resultant acceleration** (Bourke et al., Gait & Posture 2007, 480 movements, PMID 17101272)
but the abstract gives no g value, so **no fall threshold is quoted**: calibrate it yourself with
mattress drop tests and ordinary daily movements.

**Thresholds.** Button: pressed. Fall: impact above your calibrated peak, then stillness of about
**15 s** (`student-set`); then the check-in call; **30 s** without an answer = danger (`student-set`).
Heat stroke by camera and **cardiac arrest by sensor: N/A** — MANARA does not diagnose.

**Second key.** No answer to the check-in call, or a second press. The **dispatcher** decides: in real
life 999 stays the dispatcher and MANARA only sends a verified package.

**Protective action and routing.** Bring help **to** the person. Rank units by fastest ETA, not
distance (QATAR §2b): nearest ambulance, nearest trained volunteer, drone AED only if an authority
operates it. Inside the building route the volunteer and the AED to the room; AED locations are
fictional in the demo (Qatar's AED programme is **N/A**, not verified). Choose the destination
hospital by capability (trauma Level I at Hamad General; paediatric centres; S72, S73). First-aid
words come from HMC and CDC: heat stroke → call 999, move to a cooler place, cool cloths or a cool
bath, give nothing to drink (S54). Package fields: where (room or map point), what, conscious or not,
language, needs (wheelchair, Deaf, blind, child, elderly).

| Who | Message core (EN) | الرسالة (AR) |
|---|---|---|
| The person (Deaf) | Help is coming. About {n} min. Stay where you are. | المساعدة في الطريق. نحو {n} دقائق. ابقَ مكانك. |
| The person (Blind) | Help is coming in about {n} minutes. Stay where you are. I will tell you when they are at the door. | المساعدة قادمة خلال نحو {n} دقائق. ابقَ مكانك. سأخبرك عند وصولهم إلى الباب. |
| The person (Wheelchair) | Help is coming to your room. Stay where you are. | المساعدة قادمة إلى غرفتك. ابقَ مكانك. |
| The person (Child) | A teacher is coming. Stay where you are. | معلّمك قادم. ابقَ مكانك. |
| The person (Low-literacy worker) | HELP COMING (picture: person + phone + arrow) | المساعدة قادمة |
| Trained volunteer | Someone needs help in {room}. Take the AED from {place}. Go now. | شخص يحتاج مساعدة في {room}. خذ جهاز الصدمات (AED) من {place} وتوجّه الآن. |

**What the drone adds.** It can arrive first with an AED and a live view for the dispatcher, **operated
by an authority only** (S15, S16). Qatar's rules on carrying or dropping payloads are **not** in the
sources we read: ask the Civil Aviation Authority before saying anything about payloads. In the UAE,
recreational drones may carry no drop or release devices (older sources list).

**Honest limitations.** Fall detectors miss falls and misfire (sitting down hard, dropping the sensor);
the SOS button can be misused; the volunteer network in the demo is fictional; MANARA is not a medical
device and does not give treatment; privacy: no names, only room and status.

---

## 10. Earthquake tremor — low relevance in Qatar

The Qatar Meteorology Department called Qatar "a low-risk country according to international
seismological classification" after the April 2013 Iranian earthquake was felt in north-eastern Qatar
(S41). An MPU6050 can sense shaking, but MANARA builds **no** earthquake playbook, no thresholds and no
persona messages. Mention it once to show the platform generalises; do not present it as a use case.

## 11. The drone — what it uniquely adds, and the legal frame

| Hazard | What a drone adds that a fixed sentinel cannot |
|---|---|
| Fire and smoke | outside view of roof, balconies, external stairs; thermal search for unaccounted people |
| Gas | sniff and map the plume from outside (ignition-risk decision belongs to the authority) |
| Flood | camera on flooded roads and underpasses |
| Dust | visibility check (limited by dust and wind) |
| Heat | thermal look at outdoor workers (surface only) |
| SOS | arrives first with an AED and a live view (authority-operated; S15, S16) |

**Legal frame.** Law No. 10 of 2026 on Unmanned Aircraft (Drones): the Qatar Civil Aviation Authority
regulates; all drones are registered; individuals, companies and government entities need licences
or approvals; some offences carry up to seven years' imprisonment and a fine of up to QAR 300,000
(S34). Executive regulations were still to be announced. Qatar Civil Defence already operates
firefighting drones (S39); Saudi Civil Defense (Saqr/Falcon), Dubai (Shaheen) and Abu Dhabi (Suhail)
have their own: MANARA is the last-100-metres platform around them, not a competitor.
**MANARA's rule:** the drone is a **concept** for an authorised agency such as Civil Defence; the
fixed sentinel works without it; no student flight over people or buildings; any video clip uses
a licensed operator and a permit checked in advance; no payload; no code in this repository
controls a flying drone (the Python script runs the detector on a laptop webcam).

## 12. Honest limitations — one list, for the report

- Cheap sensors are cross-sensitive, drift, move with humidity and temperature, and need 48 h burn-in;
  a 3-minute warm-up is **indicative**; ppm values are indicative without reference gas.
- Thresholds are international guidance for adults (and Qatar law for heat): children, older people
  and sick people may be harmed below them. MANARA is **not certified** and never replaces a certified
  fire alarm, gas detector or Civil Defence requirement.
- Gulf heat: MQ-7 is rated to 50 °C, SGP30 55 °C, PMS5003 60 °C, MLX90640 85 °C; a closed box in the
  sun exceeds that. Batteries are rated to about 40 °C.
- The detector is **rule-based computer vision**, 66.7 % on held-out still images; dust, glare and webcam
  flicker cause false alarms; glass blocks long-wave infrared.
- WBGT from a temperature/humidity sensor is an **estimate**; Qatar's 32.1 °C is a measured value.
- Every simulation number is SIM. The A/B is "a mechanism check, not proof of impact". The planned
  comprehension test needs school ethics approval and consent; it has **not** been run.
- Dispatch uses simulated traffic and fictional stations; 999 stays the dispatcher; real integration
  needs agreements with the authorities.
- Not verified, so not used: the Qatar fire totals, CO-poisoning counts, disability prevalence, AED
  programme, the 7–10 %-per-minute survival claim, and any ISEF 2025 design detail (see the "Do NOT
  use" lists in `MANARA-SOURCES.md` and §6 of `MANARA-QATAR.md`).

## 13. Machine-friendly table — copy this

Columns: `hazard | sensor | metric | warn | danger | critical | unit | source | basis`. A dash means "no
value"; `N/A` means "show N/A for this stimulus". `warn` → SUSPECT-level reading, `danger` → danger-level
reading of that sensor (still needs the second key and the human key before any public alert),
`critical` → call 999 now. Short notes are in the JSON. The same data follows as JSON for `messages.js`/`sim.js`.

| hazard | sensor | metric | warn | danger | critical | unit | source | basis |
|---|---|---|---|---|---|---|---|---|
| fire | MLX90640 | tmax_sustained_5s | 57 | — | — | °C | S58 | cited |
| fire | MLX90640 | tmax_rise_per_min | — | 8.3 | — | °C/min | S58 | cited |
| fire | MQ-2 | smoke_index_vs_baseline | baseline+3σ | baseline+10σ | — | σ of 5-min clean-air baseline | S60 | student-set |
| fire | camera (ManaraFire) | see js/fire.js | — | — | — | - | - | N/A |
| gas | MQ-7 | co_ppm | 35 | 200 | 1200 | ppm | S46 | cited |
| gas | MQ-136 | h2s_ppm | 10 | 20 | 100 | ppm | S47 | cited |
| gas | MQ-2 | lpg_ppm_propane_equivalent | 1000 | 2100 | — | ppm | S48 | cited |
| gas | methane-specific sensor (not in kit) | methane_ppm | 2650 | 5300 | — | ppm | S48 | derived |
| gas | SGP30 | tvoc_ppb | N/A | N/A | — | ppb | S64 | N/A |
| gas | MQ-135 | air_quality_index | N/A | N/A | — | - | S62 | N/A |
| flood | JSN-SR04T or HC-SR04 | water_depth_cm | 15 | 30 | 46 | cm | S55 | derived |
| flood | float switch | level_contact_at_cm | 15 | 30 | — | cm | S55 | derived |
| flood | QMD warning (official) | rain_thunder_warning_issued | issued | — | — | flag | QMD (context list) | cited |
| dust | PMS5003 | pm10_10min_mean | 150 | 255 | 425 | µg/m³ | S31;S49 | cited |
| dust | PMS5003 | pm10_who_24h_reference | 45 | — | — | µg/m³ | S50 | cited |
| dust | PMS5003 | saturated_reading | — | 500 | — | µg/m³ | S65 | derived |
| heat | SHT31 (+globe) | wbgt_estimate_light_work | 28 | 32.1 | — | °C | S52;S19 | cited |
| heat | SHT31 (+globe) | wbgt_estimate_moderate_work | 25 | 32.1 | — | °C | S52;S19 | cited |
| heat | SHT31 (+globe) | wbgt_estimate_heavy_work | 23 | 32.1 | — | °C | S52;S19 | cited |
| heat | SHT31 (+globe) | wbgt_estimate_very_heavy_work | 21 | 32.1 | — | °C | S52;S19 | cited |
| heat | SHT31 | heat_index_c | 32.2 | 39.4 | 51.7 | °C | S51 | derived |
| heat | calendar | in_midday_ban_window | true | — | — | bool | S18 | cited |
| heat | MLX90640 | core_body_temperature | N/A | N/A | — | °C | S54 | N/A |
| sos | SOS button | pressed | — | true | — | bool | - | cited |
| sos | MPU6050 | impact_resultant_g | calibrated peak | calibrated peak + stillness | — | g | S69 | student-set |
| sos | MPU6050 | stillness_after_impact_s | 15 | — | — | s | S69 | student-set |
| sos | check-in call | no_answer_s | — | 30 | — | s | - | student-set |
| earthquake | MPU6050 | tremor | N/A | N/A | — | - | S41 | N/A |

```json
[
 {
  "hazard": "fire",
  "sensor": "MLX90640",
  "metric": "tmax_sustained_5s",
  "warn": 57,
  "danger": null,
  "critical": null,
  "unit": "°C",
  "source": "S58",
  "basis": "cited",
  "note": "typical listed heat detector fixed rating (135 °F); hot mug crosses it by design -> SUSPECT only"
 },
 {
  "hazard": "fire",
  "sensor": "MLX90640",
  "metric": "tmax_rise_per_min",
  "warn": null,
  "danger": 8.3,
  "critical": null,
  "unit": "°C/min",
  "source": "S58",
  "basis": "cited",
  "note": "15 °F/min rate-of-rise rating"
 },
 {
  "hazard": "fire",
  "sensor": "MQ-2",
  "metric": "smoke_index_vs_baseline",
  "warn": "baseline+3σ",
  "danger": "baseline+10σ",
  "critical": null,
  "unit": "σ of 5-min clean-air baseline",
  "source": "S60",
  "basis": "student-set",
  "note": "no standard maps MQ-2 to smoke obscuration; calibrate locally"
 },
 {
  "hazard": "fire",
  "sensor": "camera (ManaraFire)",
  "metric": "see js/fire.js",
  "warn": null,
  "danger": null,
  "critical": null,
  "unit": "-",
  "source": "-",
  "basis": "N/A",
  "note": "vision thresholds live in fire.js; thermal veto C6"
 },
 {
  "hazard": "gas",
  "sensor": "MQ-7",
  "metric": "co_ppm",
  "warn": 35,
  "danger": 200,
  "critical": 1200,
  "unit": "ppm",
  "source": "S46",
  "basis": "cited",
  "note": "NIOSH REL TWA / ceiling / IDLH; MQ-7 range 20-2000 ppm"
 },
 {
  "hazard": "gas",
  "sensor": "MQ-136",
  "metric": "h2s_ppm",
  "warn": 10,
  "danger": 20,
  "critical": 100,
  "unit": "ppm",
  "source": "S47",
  "basis": "cited",
  "note": "NIOSH ceiling / OSHA ceiling / IDLH; MQ-136 range 1-200 ppm; smell is not a warning"
 },
 {
  "hazard": "gas",
  "sensor": "MQ-2",
  "metric": "lpg_ppm_propane_equivalent",
  "warn": 1000,
  "danger": 2100,
  "critical": null,
  "unit": "ppm",
  "source": "S48",
  "basis": "cited",
  "note": "OSHA PEL-NIOSH REL / NIOSH IDLH (10% LEL); MQ-2 range 300-10000 ppm; sanitiser vapour is a stand-in (SIM)"
 },
 {
  "hazard": "gas",
  "sensor": "methane-specific sensor (not in kit)",
  "metric": "methane_ppm",
  "warn": 2650,
  "danger": 5300,
  "critical": null,
  "unit": "ppm",
  "source": "S48",
  "basis": "derived",
  "note": "5% and 10% of LEL 5.3%; lighter than air; N/A for the MQ-2 kit"
 },
 {
  "hazard": "gas",
  "sensor": "SGP30",
  "metric": "tvoc_ppb",
  "warn": "N/A",
  "danger": "N/A",
  "critical": null,
  "unit": "ppb",
  "source": "S64",
  "basis": "N/A",
  "note": "no cited health threshold; CO2eq is calculated, not measured CO2"
 },
 {
  "hazard": "gas",
  "sensor": "MQ-135",
  "metric": "air_quality_index",
  "warn": "N/A",
  "danger": "N/A",
  "critical": null,
  "unit": "-",
  "source": "S62",
  "basis": "N/A",
  "note": "trend / second-key use only"
 },
 {
  "hazard": "flood",
  "sensor": "JSN-SR04T or HC-SR04",
  "metric": "water_depth_cm",
  "warn": 15,
  "danger": 30,
  "critical": 46,
  "unit": "cm",
  "source": "S55",
  "basis": "derived",
  "note": "6 in / 12 in / 18 in converted; NWS figures are for moving water; flow speed N/A"
 },
 {
  "hazard": "flood",
  "sensor": "float switch",
  "metric": "level_contact_at_cm",
  "warn": 15,
  "danger": 30,
  "critical": null,
  "unit": "cm",
  "source": "S55",
  "basis": "derived",
  "note": "place switch at the warn or danger height"
 },
 {
  "hazard": "flood",
  "sensor": "QMD warning (official)",
  "metric": "rain_thunder_warning_issued",
  "warn": "issued",
  "danger": null,
  "critical": null,
  "unit": "flag",
  "source": "QMD (context list)",
  "basis": "cited",
  "note": "second key, entered by operator in the demo"
 },
 {
  "hazard": "dust",
  "sensor": "PMS5003",
  "metric": "pm10_10min_mean",
  "warn": 150,
  "danger": 255,
  "critical": 425,
  "unit": "µg/m³",
  "source": "S31;S49",
  "basis": "cited",
  "note": "Qatar 24-h standard / EPA Unhealthy / EPA Hazardous; 10-min mean is a design choice"
 },
 {
  "hazard": "dust",
  "sensor": "PMS5003",
  "metric": "pm10_who_24h_reference",
  "warn": 45,
  "danger": null,
  "critical": null,
  "unit": "µg/m³",
  "source": "S50",
  "basis": "cited",
  "note": "display reference only"
 },
 {
  "hazard": "dust",
  "sensor": "PMS5003",
  "metric": "saturated_reading",
  "warn": null,
  "danger": 500,
  "critical": null,
  "unit": "µg/m³",
  "source": "S65",
  "basis": "derived",
  "note": "effective range is 0-500 (PM2.5); saturated = at least danger"
 },
 {
  "hazard": "heat",
  "sensor": "SHT31 (+globe)",
  "metric": "wbgt_estimate_light_work",
  "warn": 28,
  "danger": 32.1,
  "critical": null,
  "unit": "°C",
  "source": "S52;S19",
  "basis": "cited",
  "note": "OSHA/NIOSH unacclimatized action limit; Qatar stop-work line is a MEASURED value"
 },
 {
  "hazard": "heat",
  "sensor": "SHT31 (+globe)",
  "metric": "wbgt_estimate_moderate_work",
  "warn": 25,
  "danger": 32.1,
  "critical": null,
  "unit": "°C",
  "source": "S52;S19",
  "basis": "cited",
  "note": "as above"
 },
 {
  "hazard": "heat",
  "sensor": "SHT31 (+globe)",
  "metric": "wbgt_estimate_heavy_work",
  "warn": 23,
  "danger": 32.1,
  "critical": null,
  "unit": "°C",
  "source": "S52;S19",
  "basis": "cited",
  "note": "as above"
 },
 {
  "hazard": "heat",
  "sensor": "SHT31 (+globe)",
  "metric": "wbgt_estimate_very_heavy_work",
  "warn": 21,
  "danger": 32.1,
  "critical": null,
  "unit": "°C",
  "source": "S52;S19",
  "basis": "cited",
  "note": "as above"
 },
 {
  "hazard": "heat",
  "sensor": "SHT31",
  "metric": "heat_index_c",
  "warn": 32.2,
  "danger": 39.4,
  "critical": 51.7,
  "unit": "°C",
  "source": "S51",
  "basis": "derived",
  "note": "NWS Extreme Caution 90 F / Danger 103 F / Extreme Danger 125 F"
 },
 {
  "hazard": "heat",
  "sensor": "calendar",
  "metric": "in_midday_ban_window",
  "warn": true,
  "danger": null,
  "critical": null,
  "unit": "bool",
  "source": "S18",
  "basis": "cited",
  "note": "10:00-15:30, 1 June-15 September; second key"
 },
 {
  "hazard": "heat",
  "sensor": "MLX90640",
  "metric": "core_body_temperature",
  "warn": "N/A",
  "danger": "N/A",
  "critical": null,
  "unit": "°C",
  "source": "S54",
  "basis": "N/A",
  "note": "camera sees skin, not core; heat stroke reference 39.4 C cannot be measured"
 },
 {
  "hazard": "sos",
  "sensor": "SOS button",
  "metric": "pressed",
  "warn": null,
  "danger": true,
  "critical": null,
  "unit": "bool",
  "source": "-",
  "basis": "cited",
  "note": "human key"
 },
 {
  "hazard": "sos",
  "sensor": "MPU6050",
  "metric": "impact_resultant_g",
  "warn": "calibrated peak",
  "danger": "calibrated peak + stillness",
  "critical": null,
  "unit": "g",
  "source": "S69",
  "basis": "student-set",
  "note": "no standard threshold; calibrate with mattress drop tests"
 },
 {
  "hazard": "sos",
  "sensor": "MPU6050",
  "metric": "stillness_after_impact_s",
  "warn": 15,
  "danger": null,
  "critical": null,
  "unit": "s",
  "source": "S69",
  "basis": "student-set",
  "note": "demo default"
 },
 {
  "hazard": "sos",
  "sensor": "check-in call",
  "metric": "no_answer_s",
  "warn": null,
  "danger": 30,
  "critical": null,
  "unit": "s",
  "source": "-",
  "basis": "student-set",
  "note": "demo default"
 },
 {
  "hazard": "earthquake",
  "sensor": "MPU6050",
  "metric": "tremor",
  "warn": "N/A",
  "danger": "N/A",
  "critical": null,
  "unit": "-",
  "source": "S41",
  "basis": "N/A",
  "note": "low relevance in Qatar; no playbook"
 }
]
```
