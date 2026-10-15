/* MANARA («منارة») — multi-hazard simulation engine  →  window.ManaraSim
 * ==========================================================================================
 * Pure, seeded, deterministic. No DOM, no network, no libraries, no hidden global state (the only module-level cache is the
 * immutable world, built once). A classic script: it works from file:// and in Node (load it with `vm`):
 *     const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync('site/manara/js/sim.js','utf8'), ctx); const S = ctx.ManaraSim;
 * It attaches to globalThis / self / window. Everything the pages show from it is a SIMULATION ("SIM"): a mechanism check of the
 * pipeline Sense → Prove → Reach → Guide → Count → Hand off, NOT proof of real-world impact. Every tunable number is a named
 * assumption (ManaraSim.PARAMS, 100+ of them, each with a default, range, unit, plain bilingual description and source).
 *
 * QUICK START
 *   const sim = S.create({ preset: 'fire-night', mode: 'manara', seed: 7 });   // mode: 'manara' | 'ordinary'
 *   S.step(sim, dt);                 // advance dt real seconds (fixed 1 s ticks inside; a remainder is kept) — call from rAF with dt*speed
 *   const snap = S.snapshot(sim);    // plain JSON: draw the map, the people, the log, the dispatch card ...
 *   S.approve(sim);                  // the human key (only needed when create({autoApprove:false}))
 *   const r = S.ab({ preset: 'fire-night', seed: 7 });   // same seed, ordinary alarm vs MANARA → comparable metrics (+ deltas)
 *
 * UNITS & CONVENTIONS
 *   Grid 96 × 64 cells, 1 cell = 5 m, north-up, x east, y south. Positions are in cell units (floats; cell centres at +0.5).
 *   Time: sim.t = seconds since the run began (integer ticks); sim.hour0 = clock hour at t = 0 (e.g. 4 = 04:00); snapshot.clock = 'HH:MM:SS'.
 *   Text is always {ar, en}. Wind: deg = the direction the wind blows FROM (315 = north-westerly), speed in m/s.
 *   Indoor positions use floor-plan coordinates inside the building footprint; person.fl = floor index (0 ground, 3 = roof).
 *   Rooms are numbered by floor: 1xx ground, 2xx first, 3xx second (Ravi 203, Huda 105, Abu Salem 302, Lina 106 / class 5B).
 *
 * WORLD  (ManaraSim.worldInfo() → static JSON; the same world every run)
 *   A Doha-style block: workers' residence 'RB' (3 floors: rooms 101–110 / 201–210 / 301–310 along a corridor, Stair A (west), Stair B
 *   (east), roof door (on Stair B), refuge balcony, lobby + guard desk, entrance; no lift — an assumption), school 'SCH' (2 floors,
 *   8 classes, yard assembly), construction site with cooling container, mosque, shops (drone dock on the roof), souq, LPG store and
 *   gas line, a park, a road underpass (lowest ground: floods first), six assembly points, a road graph (major/minor/expressway/access
 *   roads, 39 segments) and FICTIONAL responders at the map edge or beyond it: Civil Defence Station A (fire + rescue), Rescue & HazMat
 *   Station B (fire + rescue + hazmat), Police posts 1–2, Ambulance point + Nakheel Hospital ambulance, Nakheel Hospital (ED), Emergency
 *   Trauma Centre (ED + trauma). All demo names say "(demo)". ~120 registered residents (incl. Ravi, Huda, Abu Salem, Lina), 160 pupils,
 *   teachers, staff, a guard, shop workers, passers-by, trained volunteers. The language mix is an illustrative demo mix, not demography.
 *
 * ManaraSim.create(opts) → sim          (opts all optional)
 *   preset      'fire-night' (default, 04:00) | 'gas-night' | 'flood-day' | 'dust-day' | 'heat-day' | 'sos-day' | 'school-fire-day'
 *               ManaraSim.PRESETS[id] = { hazard, hour, tIgnite, durationSec, wind, name:{ar,en}, blurb:{ar,en}, incident:{ar,en}, scope }
 *               ManaraSim.PRESET_ORDER lists them in menu order.
 *   mode        'manara' (default) | 'ordinary' — the "ordinary alarm": one siren where such a detector exists (fire, gas), Arabic+English
 *               announcements only, everybody heads for the nearest exit/shelter on a STATIC map (nobody knows the roof door is locked or the
 *               road is flooded; people only see flames / deep water locally and find a locked exit by walking into it), no personal alert, no
 *               routing, no headcount (unless the assumption `rollCall` = 1), 999 is called when a person notices (assumption).
 *   seed        uint32 (default 1). Hashed randoms are stateless, so the SAME seed gives the SAME physics and the SAME personal draws in both
 *               modes (common random numbers → a fair A/B).
 *   params      { key: value } overrides of ManaraSim.PARAMS (see below).     hour: start clock hour.    wind: {deg, speed}.
 *   autoApprove false → a real operator must call approve(); default true (a simulated operator approves `approveSec` after CONFIRMED).
 *   tIgnite     seconds until the hazard starts (default per preset; use a huge value to wait for ManaraSim.trigger()).   durationSec: run length.
 *   gasType     'lpg' (default) | 'h2s' | 'co' — sets danger levels (S46–S48) and heavier-than-air pooling for the gas hazard.
 *
 * STEPPING
 *   ManaraSim.step(sim, dt=1) → ticks run     ManaraSim.run(sim, untilSec?) → sim (default: to durationSec)    sim.done is true at the end.
 *   ManaraSim.restart(sim, overrides?) → a fresh sim with the same options.   ManaraSim.hash(sim) → 8-hex FNV hash of the full snapshot.
 *
 * SIM FIELDS (read-only; documented because the tests and Mission Control read them)
 *   sim.t, sim.hour0, sim.mode, sim.preset, sim.hazard, sim.seed, sim.P (resolved assumptions), sim.wind, sim.done,
 *   sim.ver   { phase:'idle'|'suspect'|'confirmed'|'public', suspectAt, confirmedAt, approvedAt, publicAt, zone, needsApproval, keys:{key:true} }
 *   sim.local { on, at, kind:'siren', struct, pos, radiusM }   the building / store alarm (fire & gas); it never waits for any key
 *   sim.alert null | { id, level:'evacuate'|'shelter'|'watch', issuedAt, counts, recipients, instructions:[{ar,en}], byLang, byFormat }
 *   sim.exits [{ id:'E'|'A'|'B'|'R'|'M'|'W', name, state:'OPEN'|'SMOKE'|'FIRE'|'LOCKED', locked }]  (RB then SCH)
 *   sim.people [ person ]   sim.byKey[key]   sim.heroes {ravi, huda, 'abu-salem', lina → index}   sim.events [ {t,type,text:{ar,en},...} ]
 *   sim.plan   null | dispatch plan (see DISPATCH)     sim.drone   sim.traffic   sim.series (5 s samples)   sim.sensors
 *   sim.F { smoke, gas, water, dust } Float32Array(96*64)   sim.ofire Uint8Array (outdoor fire: 1 burning, 2 burnt)   — or use ManaraSim.view(sim).
 *
 * SNAPSHOT  ManaraSim.snapshot(sim, { full?, events?, lastEvents?, sensors?, series?, metrics? }) → JSON-serialisable
 *   { v, preset, hazard, mode, seed, t, clock, hour, done, label:{ar,en}, wind:{deg,speed},
 *     verification:{ phase, zone, keys[], suspectAt, confirmedAt, approvedAt, publicAt, needsApproval },
 *     localAlarm:{ on, at }, exits:[{id, struct, name, state, locked}], alert, counts:{ people, away, asleep, aware, informed, moving, safe, sheltered, down, waiting, injured },
 *     headcount:{ registered, safe, safeAway, help, unaccounted } | null,   (registered = safe + safeAway + help + unaccounted)
 *     drone:{ state:'DOCKED|LAUNCH|TRANSIT|PATROL|TRACK|HOLD|YIELD|RETURN|CHARGING', x, y, battery, light:'friendly'|'off', mission, located },
 *     traffic:{ load, hour, jams, closed[], closedBy }, dispatch (see DISPATCH) | null, sensors:[…active…], hazardState:{ per hazard: burningRooms, smokeMax, peak, underpassCm, wbgt … },
 *     people:[{ id, key, role, persona, st, aware, asleep, away, x, y, fl, lang, name?, hero?, room?, cls?, deaf?, blind?, dose?, injured?, checkin?, safeKind?, ladder?, msg?, plan?, strain? }],
 *     events:[…last 60…] }
 *   person.st: idle | working | moving | waiting | sheltered | safe | down (collapsed, needs help) | incapacitated (model dose ≥ 1) | away.
 *   person.aware: 0 unaware, 1 aware (siren / own eyes / teacher — ordinary behaviour), 2 informed (personal alert: live route).
 *   ManaraSim.view(sim) → { w,h,cellM, smoke, gas, water, dust, outdoorFire, elev, kind, walk, fuel } typed arrays for canvases (do not modify).
 *   ManaraSim.person(sim, key) → one person with timings.   ManaraSim.sensors(sim) → every channel with value/active/alarm.
 *
 * EVENTS  sim.events[i] = { t, type, text:{ar,en}, ...fields } — type is one of: start, ignition, fire-spread, flashover, fire-outdoor, valve-closed, local-alarm,
 *   sentinel-buzzer, suspect, suspect-clear, confirmed, approved, rejected, public-alert, person-alert (heroes), ladder, ladder-stop, woke, knock (heroes),
 *   exit-state {exit,from,to}, exit-set, reroute {affected,of}, dead-end, trapped, safe (heroes), checkin ("help" only), injured / incapacitated, collapse, case-confirmed,
 *   drone {state}, drone-ordered, drone-located, dispatch-recommended, recommendation-change, far-but-faster, dispatch-approved, dispatched, unit-en-route,
 *   unit-on-scene, unit-cleared, reroute-unit, redispatch {kind,from,to,reason,gainSec}, road-closed {seg,by}, road-open, road-jam, unit-busy, scenario-jam,
 *   cordon, suppression, rescued, help-arrived {by}, transport, hospital-arrival, call-999 (ordinary world), threshold (WBGT), end.
 *   sim.evCount[type] counts every occurrence, including the ones too frequent to log one by one.
 *
 * OPERATOR / TEST ACTIONS (all return truthy on success; they log events)
 *   setParam(sim, key, value)  change one assumption of a running sim (clamped); returns false for parameters with PARAMS[i].live === false
 *   (population, thresholds fixed at start): those apply on restart(sim, {params:{…}}).
 *   approve(sim) | reject(sim, holdSec=120) | trigger(sim) (start the hazard now) | setExit(sim,'A'|'RB.R'|'SCH.W', {locked}) (unlock / lock)
 *   setWind(sim,{deg,speed}) | setTraffic(sim, load 0..2) | jamRoad(sim, segId, factor 0.05..1) | unjamRoad | closeRoad(sim, segId, closed=true)
 *   setUnitBusy(sim, assetId, busy=true, kind?) | setHospital(sim, id, {freeBeds}) | setHour(sim, hour)
 *   injectKey(sim, channelId, add, seconds) | injectDecoy(sim, 'vapour'|'hotmug'|'redcar', seconds)  — single-key false triggers ("Fool me if you can")
 *   checkin(sim, personKey, 'safe'|'help')   — a phone / kiosk check-in.
 *
 * PIPELINE (per hazard; the same code for all six)
 *   Sense   sensor channels with noise (sensorNoise), drift and warm-up (warmupSec), cross-sensitivity flags; a reading above its threshold
 *           for keyHoldSec = an active KEY. Fire: thermal (57 °C or 8.3 °C/min, S58) / smoke (MQ-2, baseline + 3σ) / vision (a sentinel in every room and corridor node of the building);
 *           gas: two or three gas sensors in different places + rising trend; flood: water level (15 cm) at two spots + rain gauge + weather-office feed;
 *           dust: PM10 + visibility camera + weather feed; heat: WBGT + work-hours rule (+ a collapse = a "someone needs help" case);
 *           SOS: fall detector (impact + 15 s stillness) + 30 s "no answer" to the check-in call.
 *   Prove   SUSPECT = one key. CONFIRMED = two keys of DIFFERENT independence groups in the same zone held confirmHoldSec. One key alone can
 *           never reach CONFIRMED. PUBLIC needs the human key (approve). The local alarm (building siren, store alarm, a sentinel's buzzer)
 *           never waits.
 *   Reach   issueAlert(): zones evacuate / shelter / watch / none from the hazard FORECAST; per-person language, format (sound, vibration,
 *           strobe, voice, picture card, text, pictogram), delivery via the app, the teacher's tablet (pupils), the mother's phone (Lina),
 *           the zone broadcast (passers-by, assumption), smart exit signs (people without the app). Night wake-up ladder: T+0 sound+vibration
 *           (+strobe), +30 s louder + light, +60 s the guard is sent a priority list and knocks doors, +90 s Civil Defence gets the list;
 *           it stops per person when they wake/confirm (person.ladderLog, ladderStopAt).
 *   Guide   multi-source Dijkstra from the safe targets of THIS hazard over indoor graphs + the grid, avoiding danger (smoke / plume / water,
 *           with a look-ahead forecast), respecting exit states (a LOCKED / FIRE exit is removed, a SMOKE exit costs more), persona
 *           constraints (no stairs for wheelchair users → refuge balcony), recomputed every 4 s and at once when an exit changes. Only the people
 *           whose route changed get a new message (event 'reroute' {affected, of}). People at an assembly point that becomes unsafe are re-sent.
 *   Count   "I'm safe" / "I need help" / unaccounted against the register; rooms prioritised (needs, then closeness to the danger).
 *           ManaraSim.headcount(sim) → { registered, safe, safeAway, help, unaccounted, rooms:{room:{total,safe,help,unaccounted}},
 *           unaccountedList:[{key,name,room,lang,needs[],score,asleep,last}], helpList }.
 *   Hand off  ManaraSim.handoff(sim, {top?, cap?}) → the Civil Defence / ambulance card data; ManaraSim.cap(sim, {languages:['ar','en'], date, tz})
 *           → an OASIS CAP 1.2 XML string, status "Exercise", one <info> per language (non-ar/en languages are marked DRAFT).
 *
 * HAZARD MODELS (all parameters are labelled assumptions unless a source is named)
 *   FIRE   Cellular automaton in the published Alexandridis et al. (2008) form: p_burn = p_h (1 + p_veg)(1 + p_den) p_w p_s with wind factor
 *          p_w = exp(c1 V) exp(c2 V (cos θ − 1)), c1 = 0.045, c2 = 0.131, p_h = 0.58, slope factor exp(a θ_s), a = 0.078. Source: Alexandridis A.,
 *          Vakalis D., Siettos C.I., Bafas G.V., Appl. Math. Comput. 204 (2008) 191–201; parameter values as tabulated in Russo L., Russo P.,
 *          Vakalis D., Siettos C., Chem. Eng. Trans. 36 (2014) 253–258, DOI 10.3303/CET1436043 (checked on that paper). Indoors the same rule runs
 *          on the room graph (V = indoor draught, θ = angle to it; door factors, flashover time (S5) and smoke exchange are named assumptions).
 *          Outdoors: 5 m cells, real wind, fuel types (shrubs, parked cars, building materials); smoke = a field advected downwind.
 *   GAS    Concentration field from a leak point: advection by the wind + diffusion; heavier-than-air gases creep downhill and pool (the
 *          underpass, the park basin); seeps indoors with a lag. Levels (ppm, docs/MANARA-HAZARDS.md §13): propane warn 1000 / danger 2100 = 10 %LEL (S48), CO 35 / 200 (S46), H2S 10 / 20 (S47).
 *   FLOOD  Rising water depth over a height map (the underpass fills first); thresholds for walking and for closing roads; storm compressed in time (SIM).
 *   DUST   PM10 front advancing with the wind (lead time before arrival); outdoors people exposed, indoors reduced; warn 150 µg/m³ (S31), danger 255, critical 425 (S49).
 *   HEAT   WBGT ramp (SIM) vs. stop-all-work 32.1 °C (S19); per-worker strain accumulates with exposure, recovers in cooled shelters; collapse → SOS case.
 *   SOS    A person collapses; time-to-help = the first of: trained volunteer on foot, drone with an AED (authority-operated), ambulance.
 *   Exposure "dose" thresholds, wake-up probabilities, reaction times and speeds are assumptions, not medical or measured values; the engine never
 *   reports deaths — only "injured / unable to move in the model".
 *
 * DRONE  docked → launches on CONFIRMED (+droneLaunchSec; for SOS after approval) → stand-off point → PATROL → TRACK → HOLD (outside view,
 *   thermal search finds people on balconies / roof / outdoors) → YIELD when a fire engine is on scene → RETURN → CHARGING. Friendly light
 *   (steady green + two white flashes). Battery endurance is derated above 40 °C (assumption). A concept operated by the authority.
 *
 * RESCUE ROBOT (a CONCEPT with a SIMULATED prototype; fire + gas in a building; everything below is SIM and every number a named assumption, group 'robot')
 *   ManaraSim.create({ preset:'fire-night-robot' })  — or  create({ preset, robot:true | { units:1..3, variant:'tracked'|'wheeled', autoApprove, carrier:0|1 } }); robot:false switches
 *   it off (the scenario conditions stay, so 'with robot' vs 'without robot' compares the same world). With the robot off NOTHING changes: same events, same hash.
 *   STATES  stowed → approved → deploying → searching → guiding → holding → returning → (stowed again) | fault.   Nothing moves before an INCIDENT COMMANDER approves.
 *   OPERATOR ROLES (simulated, no real authentication)  setRole(sim,'viewer'|'operator'|'commander');  deployRobot(sim,id?) requests deployment (operator or commander);
 *     approveRobot(sim,id?,role?) is valid ONLY for a commander — otherwise { ok:false, code:'role', reason:{ar,en} } and an event;  recallRobot(sim,id?);  setSearchPriority(sim,['302','R205',…]);
 *     teleopRobot(sim,id,'C22'|'305'|{x,y,fl}) one-shot go-to (needs the link);  speakVia(sim,id,messageKey,lang) the operator speaks through the robot;  setRobotObstacle(sim,'R204',{locked:true}).
 *     Robot actions return { ok, code?, reason?:{ar,en} } objects (check .ok).
 *   MOVEMENT  on the building's indoor graph; A* (ManaraSim.robot.astar) avoids burning / too-hot / gas-danger nodes, costs smoke; a WHEELED robot cannot climb stairs (floors above are reported 'unreachable'), a TRACKED
 *     one climbs at a speed penalty; it never enters a node that is burning, hotter than robotMaxTempC, or (gas) at the danger level; it does NOT break doors: a locked door / blocked corridor is REPORTED and marked blocked.
 *   SEARCH  order = rooms of unaccounted residents with needs first, then other unaccounted, then by smoke / closeness to the danger, then the remaining rooms; operator priority overrides.  Corridors are covered on the way.
 *   DETECTION (rule-based, not "AI")  per second in view: thermal  p = robotThermalPd × contrast × smoke-visibility (contrast falls in hot rooms: the Gulf-heat caveat) and audio (a conscious person calling out, masked by the siren);
 *     seeded, so false negatives happen (a person in view stays unseen) and false positives happen (a hot object: 'possible person' → investigated → dismissed).
 *   ON A FIND  record { room, person, needs, condition guess (est.), time } → the control room (event 'robot-find', hand-off card entry, headcount.located = 'located by robot', DISTINCT from 'safe'); speaks in the person's language and
 *     format (MANARA_MSG.robot.say when loaded, built-in fallback otherwise): sleeper → wake attempts; able person → guidance + route beacons; wheelchair → 'stay here, help is coming' + refuge flag; cannot move in smoke → HOLDS with them
 *     until crews arrive. Reports are buffered while the mesh link is down. It RETURNS when battery < threshold (or less than the estimated return cost) or when recalled.
 *   TELEMETRY  ManaraSim.robots(sim) → [{ id, state, variant, pose:{x,y,fl}, heading, battery, link:{q,up}, target, coverage:{pct, nodes:[{id,cov}], rooms:{id:status}}, finds, blocked, beacons, view:{ room, visibility, people[] } … }]; robotView(sim,id) alone.
 *   METRICS (SIM, mechanism check)  ManaraSim.robotMetrics(sim) → time to locate each unaccounted resident, % of needs-help residents located before crews arrive, people reached before the exposure threshold, false +/−, battery, link;
 *     ManaraSim.abRobot({preset,seed}) → 'MANARA with robot' vs 'without robot' (same seed);  ManaraSim.sweepRobot({param,values,seeds}) → sensitivity to ONE assumption (detection probability, link dropouts, battery, …).
 *   API NAMESPACE  ManaraSim.robot = { STATES, ROLES, SAY_KEYS, astar(sim, fromId, toId, {dijkstra?}), graph(structIdx), priority(sim) → the current search order, say(sim, key, persona, personKey?) }; ManaraSim.PRESET_ORDER_ALL = PRESET_ORDER + 'fire-night-robot'.
 *   BUS  ManaraSim.busRobot(sim) → { type:'robot', … };  ManaraSim.busRobotFind(sim, findId) → { type:'robot-find', … }  (docs/MANARA.md).
 *   LIMITS (say them)  no robot has been built or tested; a real one needs approval from the authority; thermal contrast, battery, smoke, heat, doors, stairs, Wi-Fi/mesh range, noise are all assumptions; it assists, firefighters decide.
 *
 * DISPATCH — the fastest unit given traffic, not the nearest by distance   (see docs/MANARA-SPEC.md "Nearest-responder dispatch")
 *   Road graph with time-varying simulated traffic: segment time = length / (free-flow speed × emergencyFactor × congestion);
 *   congestion = 1 − (1 − dailyProfile(hour)) × classSensitivity × load, × hot-spot dips (the school road at drop-off 06:45–07:45 and pick-up
 *   12:30–13:30, junction queues, road works), × operator jams, × incident slow-down; closed roads (flood, fire/smoke, gas plume, operator) are removed.
 *   Required units per hazard: fire → fire + ambulance + police (+ rescue for the residence); gas → hazmat fire + ambulance + police;
 *   flood → rescue + police + ambulance; dust → police + ambulance; heat / SOS → ambulance (+ the destination hospital).
 *   For each kind: time-dependent Dijkstra from every candidate unit, skip busy / incapable / cut-off units, take the minimum ETA (turn-out +
 *   drive), keep the runner-up and the distance for the "why this unit" line. Hospital: nearest that has the needed capability (flags ed = 24 h emergency, trauma = Level I, paed = paediatric; patients need 'ed' | 'trauma' | 'paed')
 *   and free capacity (beds × (1 − occupancy), an assumption). States: recommended → approved → dispatched → en-route → on-scene → cleared.
 *   ETA is recomputed every second; en-route units re-route around new jams / closures; a busy unit, a closed road or a faster alternative
 *   (≥ redispatchMarginSec) triggers an automatic 'redispatch' event. Arrival effects (named assumptions): fire engine on scene (+engineSetupSec)
 *   cuts fire spread by engineEffectPct and extinguishes later; hazmat on scene closes the gas valve 90 s later; rescue brings out people who
 *   cannot move after rescueAssistSec; ambulance ends the SOS wait; police set up a cordon (no more arrivals at the flooded underpass).
 *   In the ordinary world 999 is called after ordinaryCallSec (or a person collapses + ordinaryNoticeSec) and the SAME selection rule runs;
 *   only the timing differs. Scenes: residence 'BLD', school 'SCH', gas store 'LPGN', underpass 'M1', district 'M2', worksite 'SITE', park 'PARK'.
 *   sim.plan / snapshot.dispatch = { id, state, origin:'manara'|'ordinary', hazard, scene:{node,x,y}, t:{recommended,approved,dispatched,en-route,on-scene,cleared},
 *     patients:{n,need}, units:[{ kind:'fire'|'rescue'|'ambulance'|'police', assetId, name:{ar,en}, state, etaSec, etaMin, distM, pos:{x,y}, route:[[x,y]…],
 *       why:{ar,en}, whyData:{ chosen, runnerUp, nearestByDistance, farButFaster, gainSec, extraDistM, slow, skippedBusy, cutOff }, runnerUp, reroutes, replaced }],
 *     hospital:{ id, name, etaSec, etaMin, distM, freeBeds, fits, why, options } | null }
 *   ManaraSim.busDispatch(sim) → the bus message { type:'dispatch', id, units:[{kind, name, etaMin, status, why}], hospital:{name, etaMin}|null }.
 *   ManaraSim.traffic = { makeRoadGraph, roadTravel, roadDistance, pickUnit, congestion, segFactors, profileAt, ROAD_CLASS, PROFILE, snapshot(sim), pickHospital(sim, {n,need}) }
 *     — pure helpers for hand-built graphs (the tests use them) and for drawing the congestion of every road.
 *   ManaraSim.residentLines(sim) → calm lines for the phones [{kind, state, etaMin?, text:{ar,en}}] e.g. "Fire engine ETA 4 min", "Ambulance ETA 6 min — stay where you are".
 *   ManaraSim.dispatchCompare(sim, kind, {hour, load}) → fastest vs nearest-by-distance (and whether it is "farther but faster").
 *
 * MODEL  ManaraSim.model = { alexWind(V, cosθ, c1, c2), alexBurn(P, p_veg, p_den, V, cosθ, slopeDeg) } — the published formula as code (explain-it box, tests).
 *
 * BUS HELPERS (docs/MANARA.md)  busAlert(sim, personKey) → { type:'alert', id, level, hazard, area, at:{x,y}, fire?:{x,y}, radiusM, wind, you, distanceM,
 *   bearingDeg, safe:{x,y,name}, route:[[x,y]…], etaMin, instructions[], lang, formats[], action, persona };  compose(sim, personKey) → the
 *   per-person message { level, action, lang, draftTranslation, formats, text };  routeCheck(sim, personKey) → safety audit of a live route.
 *
 * METRICS & A/B (always labelled SIM)  ManaraSim.metrics(sim) → { timeToLocalAlarmSec, timeToFirstAlertSec, timeToFirstPersonalAlertSec,
 *   timeToConfirmedSec, timeToApprovalSec, alertedPctAt60/120/300, informedPctAt60/120/300, timeToSafe:{n,p50,p90,max,censored,reliable},
 *   stillNotSafe:{t60,t120,t300,t600}, exposed, injuredInModel, incapacitatedInModel, exposurePersonSec, enteredDanger, deadEnds, collapses,
 *   timeToHelp:{n,of,p50,max,by[]}, headcount:{registered, atT:{t60..}, final}|null, timeTo90pctAccountedSec, dispatch:{timeToDispatchSec,
 *   timeToOnSceneSec, units[]}, reroutesNotified, droneLocated, headline:{key,value,unit,label} }.
 *   People who never reach safety are counted at the end of the run (censored, never ignored); timeToSafe.reliable is false when most
 *   people never needed to move, and the deltas then omit it.
 *   ManaraSim.ab({preset, seed, params, seconds, hour, wind}) → { label, preset, seed, params, ordinary:metrics, manara:metrics, delta, hash }
 *   (delta: positive = MANARA better, except firstAlertSec where positive = the ordinary alarm came earlier — an honest trade-off).
 *   ManaraSim.sweep({preset, param, values, seeds:[1,2], seconds}) → rows { value, headlineOrdinary, headlineManara, headlineGap, ... } — how the gap
 *   depends on ONE assumption. Always show it: the result depends on assumptions.
 *
 * LIMITATIONS (say them out loud)  Simple physics, not CFD; people are point agents without pushing/queuing beyond a crowding slow-down; no lift;
 *   no explosion model; the demo population, traffic profile and responder stations are fictional; hospital capacity and unit availability are
 *   assumptions; the flood/dust/heat/gas inputs are scenario inputs (SIM); the A/B depends on the named assumptions and is not an
 *   effectiveness claim. In real life 999 stays the dispatcher; MANARA sends a verified package and never replaces national systems.
 * ========================================================================================== */
(function (root) {
  'use strict';
  /* ====================================================================================
   * 1. CONSTANTS, DETERMINISTIC RANDOMNESS, SMALL HELPERS
   * ==================================================================================== */
  var VERSION = '1.0.0';
  var W = 96, H = 64, NC = W * H, CELL = 5;            // grid: 96 x 64 cells, 5 m per cell, north-up (x east, y south)
  var DEG = Math.PI / 180;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var round1 = function (v) { return Math.round(v * 10) / 10; };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };

  // Stateless hashed uniform randoms: hr(seed, a, b, c) -> [0,1). Because they do not consume a shared stream, the
  // SAME seed gives the SAME physics (fire spread, sensor noise) and the SAME personal draws (reaction times, wake-up
  // rolls) in both A/B worlds, whatever else differs ("common random numbers" -> a fair comparison, less noise).
  function hash32(x) {
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0;
  }
  function hr(seed, a, b, c) {
    var h = hash32((seed ^ 0x9e3779b9) | 0);
    h = hash32(h ^ Math.imul(a | 0, 0x85ebca6b));
    h = hash32(h ^ Math.imul(b | 0, 0xc2b2ae35));
    h = hash32(h ^ Math.imul(c | 0, 0x27d4eb2f));
    return h / 4294967296;
  }
  // domain tags for hr() so that different subsystems never share a draw
  var D = { FIRE: 11, FIREOUT: 12, SENSOR: 13, PERSON: 14, WAKE: 15, MISC: 16, DUST: 17, HEAT: 18, UNIT: 19, GAS: 20, ROBOT: 21 };
  // cheap approximately-Gaussian noise (sum of four hashed bytes, normalised): one hash per call
  function fastNoise(seed, a, b) {
    var h = hash32((seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) | 0);
    return (((h & 255) + ((h >>> 8) & 255) + ((h >>> 16) & 255) + (h >>> 24)) - 510) / 147.4;
  }
  function fnv(str) { // FNV-1a 32-bit, hex
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hms(sec) { sec = Math.max(0, Math.floor(sec)); return pad2(Math.floor(sec / 3600) % 24) + ':' + pad2(Math.floor(sec / 60) % 60) + ':' + pad2(sec % 60); }
  function cloneJSON(o) { return JSON.parse(JSON.stringify(o)); }
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  var dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  var cellIdx = function (x, y) { return y * W + x; };
  function percentile(sorted, p) { // sorted ascending numeric array
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  // Binary min-heap on (key, id) pairs with lazy deletion; typed arrays, reused between searches.
  function makeHeap(cap) {
    var keys = new Float32Array(cap), ids = new Int32Array(cap), n = 0;
    return {
      clear: function () { n = 0; },
      size: function () { return n; },
      push: function (k, id) {
        if (n >= cap) return;
        var i = n++;
        while (i > 0) { var p = (i - 1) >> 1; if (keys[p] <= k) break; keys[i] = keys[p]; ids[i] = ids[p]; i = p; }
        keys[i] = k; ids[i] = id;
      },
      popKey: 0,
      pop: function () {
        var rid = ids[0]; this.popKey = keys[0];
        n--;
        if (n > 0) {
          var k = keys[n], id = ids[n], i = 0;
          for (;;) {
            var l = 2 * i + 1; if (l >= n) break;
            var r = l + 1, m = (r < n && keys[r] < keys[l]) ? r : l;
            if (keys[m] >= k) break;
            keys[i] = keys[m]; ids[i] = ids[m]; i = m;
          }
          keys[i] = k; ids[i] = id;
        }
        return rid;
      }
    };
  }

  /* ====================================================================================
   * 2. ASSUMPTIONS REGISTRY  (every tunable number is a named parameter with a plain description)
   *    Mission Control renders these as sliders. Everything here is a SIMULATION assumption unless
   *    `src` names a paper or a docs/MANARA-SOURCES.md entry. None of it is measured data.
   * ==================================================================================== */
  var PARAM_GROUPS = [
    { id: 'people',   label: T('الناس والسلوك', 'People & behaviour') },
    { id: 'alert',    label: T('الإنذار والتحقق', 'Alerts & verification') },
    { id: 'fire',     label: T('الحريق والدخان', 'Fire & smoke') },
    { id: 'gas',      label: T('تسرّب الغاز', 'Gas leak') },
    { id: 'flood',    label: T('السيول', 'Flash flood') },
    { id: 'dust',     label: T('العاصفة الغبارية', 'Dust storm') },
    { id: 'heat',     label: T('الإجهاد الحراري', 'Extreme heat') },
    { id: 'sos',      label: T('شخص يحتاج مساعدة', 'Someone needs help') },
    { id: 'traffic',  label: T('حركة المرور (محاكاة)', 'Traffic (simulated)') },
    { id: 'dispatch', label: T('الاستجابة والإرسال', 'Dispatch & responders') },
    { id: 'drone',    label: T('الطائرة المسيّرة', 'Drone') },
    { id: 'robot',    label: T('روبوت الإنقاذ (يُستعمل عند تفعيله فقط)', 'Rescue robot (used only when it is enabled)') }
  ];
  var PARAM_DEFS = [];
  var AT_START = { nightAsleepPct: 1, phoneAppPct: 1, volunteers: 1, unitBusyPct: 1, roofLocked: 1, walkScale: 1, gasWarn: 1, gasDanger: 1, gasHeavy: 1 };   // applied when the world is created (change with restart())
  function def(key, group, v, min, max, step, unit, lab, desc, src) {
    PARAM_DEFS.push({ key: key, group: group, default: v, min: min, max: max, step: step, unit: unit,
      label: T(lab[0], lab[1]), desc: T(desc[0], desc[1]), src: src || 'assumption', live: !AT_START[key] });
  }
  // ---- people & behaviour
  def('nightAsleepPct', 'people', 85, 0, 100, 5, '%', ['نسبة النائمين عند 04:00', 'Share asleep at 04:00'],
    ['نسبة السكان النائمين فعلاً في الرابعة فجراً (افتراض).', 'Share of residents actually asleep at 04:00 (assumption).']);
  def('wakeSiren', 'people', 0.20, 0, 1, 0.05, 'prob/30 s', ['إيقاظ الصافرة وحدها', 'Wake chance: siren only'],
    ['احتمال أن يستيقظ النائم على صافرة المبنى خلال 30 ثانية (افتراض، ليس قياساً).', 'Chance that a sleeper wakes to the building siren within 30 s (assumption, not a measurement).']);
  def('wakePhone', 'people', 0.45, 0, 1, 0.05, 'prob/30 s', ['إيقاظ هاتف المقيم (الدرجة 1)', 'Wake chance: own phone, ladder step 1'],
    ['احتمال الاستيقاظ خلال 30 ثانية من صوت + اهتزاز + ضوء على هاتفه الشخصي (افتراض).', 'Chance of waking within 30 s to sound + vibration + light on the person\'s own phone (assumption).']);
  def('wakeLadderBoost', 'people', 0.15, 0, 0.4, 0.05, 'prob/step', ['زيادة الاحتمال في كل درجة', 'Extra wake chance per ladder step'],
    ['كل درجة من سلّم الإيقاظ (+30 ث، +60 ث، +90 ث) تزيد الاحتمال بهذا المقدار (افتراض).', 'Each step of the wake-up ladder (+30 s, +60 s, +90 s) adds this much chance (assumption).']);
  def('wakeDeafSiren', 'people', 0.03, 0, 1, 0.01, 'prob/30 s', ['إيقاظ الصافرة للأصمّ', 'Siren wake chance for a Deaf sleeper'],
    ['الصافرة وحدها بالكاد توقظ شخصاً أصمّ (افتراض).', 'A siren alone hardly wakes a Deaf sleeper (assumption).']);
  def('reactionSec', 'people', 15, 2, 90, 1, 's', ['متوسط زمن الاستجابة', 'Mean reaction time'],
    ['الثواني من إدراك الخطر حتى بدء التحرك لشخص بالغ مستيقظ (افتراض).', 'Seconds from noticing the danger to starting to move, for an awake adult (assumption).']);
  def('wakeUpSec', 'people', 20, 0, 90, 1, 's', ['زمن ما بعد الاستيقاظ', 'Time after waking'],
    ['ثوانٍ إضافية بعد الاستيقاظ (استيعاب، حذاء، باب) قبل التحرك (افتراض).', 'Extra seconds after waking (orienting, shoes, door) before moving (assumption).']);
  def('millingOrdinarySec', 'people', 30, 0, 120, 5, 's', ['تردّد عند صافرة بلا تفسير', 'Hesitation: unexplained siren'],
    ['ثوانٍ يقضيها الناس يتساءلون «هل هذا حقيقي؟» عند صافرة عادية (افتراض).', 'Seconds people spend asking "is this real?" after an ordinary siren (assumption).']);
  def('millingManaraSec', 'people', 5, 0, 60, 1, 's', ['تردّد مع رسالة واضحة', 'Hesitation: clear message'],
    ['ثوانٍ يقضيها الناس مع رسالة تقول ماذا حدث وأين تذهب (افتراض).', 'Seconds spent when the message says what happened and where to go (assumption).']);
  def('langDelayOrdinarySec', 'people', 30, 0, 120, 5, 's', ['تأخّر بسبب اللغة (إنذار عادي)', 'Language delay (ordinary alarm)'],
    ['تأخّر من لا يفهم العربية ولا الإنجليزية عند إعلان صوتي بلغتين فقط (افتراض).', 'Delay for people who read neither Arabic nor English when the announcement is in two languages only (assumption).']);
  def('phoneAppPct', 'people', 85, 0, 100, 5, '%', ['من لديهم التطبيق', 'Residents with the app'],
    ['نسبة المقيمين المسجّلين الذين يصلهم تنبيه المنارة على هواتفهم (افتراض).', 'Share of registered residents who receive MANARA alerts on their phone (assumption).']);
  def('signsPct', 'people', 60, 0, 100, 5, '%', ['اتّباع علامات الخروج الذكية', 'Follow smart exit signs'],
    ['نسبة من لا يملك التطبيق ويتبع أسهم الخروج الذكية الصحيحة (افتراض).', 'Share of people without the app who follow the correct smart exit arrows (assumption).']);
  def('broadcastPct', 'people', 50, 0, 100, 5, '%', ['وصول البثّ للمارّة', 'Zone broadcast reach (passers-by)'],
    ['نسبة غير المسجّلين داخل المنطقة الذين يصلهم تنبيه المنطقة (يتطلب اتفاقاً مع الجهات الوطنية) (افتراض).', 'Share of unregistered people in the zone who receive the zone alert (needs agreements with national systems) (assumption).']);
  def('walkScale', 'people', 1.0, 0.5, 1.5, 0.05, '×', ['مقياس سرعة المشي', 'Walking-speed scale'],
    ['تُضرب به سرعات المشي (بالغ 1.4، مسنّ 0.9، طفل 1.0، كرسي متحرك 0.8 م/ث؛ افتراضات).', 'Multiplies walking speeds (adult 1.4, elderly 0.9, child 1.0, wheelchair 0.8 m/s; assumptions).']);
  def('stairFactor', 'people', 1.5, 1, 3, 0.1, '×', ['بطء الدرج', 'Stair slow-down'],
    ['كم مرة أبطأ النزول على الدرج من المشي المستوي (افتراض).', 'How much slower stairs are than level walking (assumption).']);
  def('smokeIncapSec', 'people', 240, 30, 1800, 10, 's', ['زمن العجز في دخان كثيف', 'Time to incapacitation in dense smoke'],
    ['الثواني في دخان كثيف (كثافة 1) حتى تصل «جرعة» النموذج إلى العجز؛ ليست مقياساً طبياً.', 'Seconds in dense smoke (density 1) until the model "dose" reaches incapacitation; not a medical measure.']);
  def('smokeSlowPct', 'people', 50, 0, 90, 5, '%', ['بطء المشي في الدخان', 'Slow-down in thick smoke'],
    ['نسبة تباطؤ السرعة في دخان كثيف (افتراض).', 'Speed reduction in thick smoke (assumption).']);
  def('crowdCap', 'people', 14, 4, 40, 1, 'persons', ['سعة العقدة قبل الازدحام', 'Crowding capacity per node'],
    ['عدد الأشخاص في ممر أو درج قبل أن يبطئ التزاحم الحركة (افتراض).', 'People in a corridor or stair node before crowding slows movement (assumption).']);
  def('guardKnockSec', 'people', 12, 4, 60, 2, 's', ['زمن طرق الحارس لكل غرفة', 'Guard time per door knocked'],
    ['الثواني التي يحتاجها الحارس ليطرق غرفة ويوقظ من فيها بعد وصول قائمة الغرف من المنارة (الدرجة 2 من السلّم) (افتراض).', 'Seconds the guard needs per room to knock and wake the people inside after MANARA sends the room list (ladder step 2) (assumption).']);
  def('knockWakeP', 'people', 0.85, 0, 1, 0.05, 'prob', ['نجاح الطرق في الإيقاظ', 'Chance a knock wakes a sleeper'],
    ['احتمال أن يوقظ طرق الحارس ونداؤه النائم داخل الغرفة (افتراض).', 'Chance that the guard knocking and calling wakes a sleeper inside the room (assumption).']);
  def('ordinaryGuardKnock', 'people', 0, 0, 1, 1, '0/1', ['حارس يطرق الأبواب في الإنذار العادي', 'Guard knocks doors in the ordinary alarm'],
    ['1 = الحارس في الإنذار العادي يطرق الغرف بترتيب الأرقام بعد دقيقة ونصف من الصافرة، بلا قائمة ولا أولويات (الافتراضي 0).', '1 = the ordinary building\'s guard knocks rooms in numerical order 90 s after the siren, with no list and no priorities (default 0).']);
  def('checkinSec', 'people', 8, 1, 60, 1, 's', ['زمن الضغط «أنا بأمان»', 'Time to tap "I\'m safe"'],
    ['ثوانٍ بعد الوصول لمكان آمن حتى يضغط الشخص «أنا بأمان» (افتراض).', 'Seconds after reaching safety until the person taps "I\'m safe" (assumption).']);
  def('kioskPct', 'people', 70, 0, 100, 5, '%', ['تسجيل الحضور عند نقطة التجمع', 'Check-in at the assembly kiosk'],
    ['نسبة من بلا تطبيق يسجّل حضوره عند لوحة نقطة التجمع (افتراض).', 'Share of people without the app who check in at the assembly-point tablet (assumption).']);
  def('awayReplyPct', 'people', 85, 0, 100, 5, '%', ['ردّ الغائبين', 'Reply rate of residents who are away'],
    ['نسبة الغائبين عن الموقع الذين يردّون على رسالة «هل أنت بأمان؟» (افتراض).', 'Share of residents who are away that answer the "are you safe?" prompt (assumption).']);
  def('rollCall', 'people', 0, 0, 1, 1, '0/1', ['نداء أسماء يدوي في الإنذار العادي', 'Manual roll call in the ordinary alarm'],
    ['1 = المبنى العادي يجري نداء أسماء ورقياً عند التجمع (الافتراضي 0: لا توجد عدّ).', '1 = the ordinary building does a paper roll call at the assembly point (default 0: no headcount).']);
  // ---- alerts & verification
  def('confirmHoldSec', 'alert', 3, 0, 30, 1, 's', ['ثبات المفتاحين', 'Two-key hold time'],
    ['يجب أن يبقى مفتاحان مستقلان فعّالين هذه المدة قبل «مؤكَّد».', 'Two independent keys must stay active this long before CONFIRMED.']);
  def('keyHoldSec', 'alert', 2, 0, 20, 1, 's', ['ثبات القراءة', 'Reading debounce'],
    ['يجب أن تبقى قراءة المستشعر فوق العتبة هذه المدة لتُحسب مفتاحاً فعّالاً.', 'A sensor reading must stay above its threshold this long to count as an active key.']);
  def('approveSec', 'alert', 20, 0, 180, 5, 's', ['زمن اعتماد المشغّل', 'Operator approval time'],
    ['كم ثانية يستغرق المشغّل لاعتماد التنبيه العام بعد «مؤكَّد» في التشغيل الآلي (افتراض بشري).', 'Seconds the operator takes to approve the public alert after CONFIRMED in automatic runs (human assumption).']);
  def('autoApprove', 'alert', 1, 0, 1, 1, '0/1', ['اعتماد آلي للمحاكاة', 'Auto-approve (simulated operator)'],
    ['1 = مشغّل افتراضي يعتمد بعد الزمن المحدد؛ 0 = ينتظر ضغطة حقيقية.', '1 = a simulated operator approves after the set time; 0 = waits for a real tap.']);
  def('ladderStepSec', 'alert', 30, 10, 120, 5, 's', ['فاصل سلّم الإيقاظ', 'Wake-up ladder step'],
    ['الزمن بين درجات السلّم (0، +30، +60، +90 ث).', 'Time between ladder steps (T+0, +30, +60, +90 s).']);
  def('deliverySec', 'alert', 2, 0, 30, 1, 's', ['زمن وصول الرسالة', 'Message delivery time'],
    ['ثوانٍ بين قرار الإرسال ووصول الرسالة للهاتف (افتراض).', 'Seconds between sending and the message arriving on the phone (assumption).']);
  def('sensorNoise', 'alert', 1.0, 0, 3, 0.1, '×', ['ضجيج المستشعرات', 'Sensor noise'],
    ['مقياس لضجيج قراءات المستشعرات (1 = القيمة المعيارية في النموذج).', 'Scale of sensor reading noise (1 = the model\'s standard level).']);
  def('warmupSec', 'alert', 0, 0, 600, 30, 's', ['تسخين المستشعرات المتبقي', 'Sensor warm-up still pending'],
    ['ثوانٍ تُتجاهل فيها قراءات المستشعرات من بداية المحاكاة (حساسات MQ تحتاج تسخيناً).', 'Seconds at the start in which sensor readings are ignored (MQ sensors need warm-up).']);
  // ---- fire
  def('fireP0', 'fire', 0.58, 0.05, 1, 0.01, 'prob', ['p₀ احتمال الانتشار الأساسي', 'p₀ base spread probability'],
    ['قيمة الورقة المنشورة (Alexandridis وآخرون 2008).', 'Value reported for Alexandridis et al. (2008).'], 'Alexandridis et al. 2008');
  def('fireC1', 'fire', 0.045, 0, 0.2, 0.005, '1/(m/s)', ['c₁ معامل الرياح', 'c₁ wind coefficient'],
    ['p_w = exp(c₁V)·exp(c₂V(cosθ−1)) — قيمة الورقة المنشورة.', 'p_w = exp(c₁V)·exp(c₂V(cosθ−1)) — value from the published paper.'], 'Alexandridis et al. 2008');
  def('fireC2', 'fire', 0.131, 0, 0.5, 0.005, '1/(m/s)', ['c₂ معامل اتجاه الرياح', 'c₂ wind-direction coefficient'],
    ['p_w = exp(c₁V)·exp(c₂V(cosθ−1)) — قيمة الورقة المنشورة.', 'p_w = exp(c₁V)·exp(c₂V(cosθ−1)) — value from the published paper.'], 'Alexandridis et al. 2008');
  def('fireSlopeA', 'fire', 0.078, 0, 0.3, 0.002, '1/deg', ['a معامل الميل', 'a slope coefficient'],
    ['p_slope = exp(a·θ_s) — قيمة الورقة؛ التضاريس هنا شبه مسطّحة.', 'p_slope = exp(a·θ_s) — value from the paper; the terrain here is nearly flat.'], 'Alexandridis et al. 2008');
  def('flashoverSec', 'fire', 220, 60, 1800, 10, 's', ['زمن الاشتعال الشامل', 'Time to flashover'],
    ['زمن بلوغ الغرفة الاشتعال الشامل (3:40 دقيقة في أثاث حديث، Kerber 2012، المصدر S5) — قيمة توضيحية.', 'Time for a room to reach flashover (3:40 for modern furnishings, Kerber 2012, source S5) — an illustrative value.'], 'S5');
  def('fireGrowSec', 'fire', 150, 30, 900, 10, 's', ['زمن نمو الحريق', 'Fire growth time'],
    ['الزمن اللازم لتصل شدة الحريق في غرفة من 0 إلى الحد الأقصى (افتراض).', 'Time for fire intensity in a room to grow from 0 to its maximum (assumption).']);
  def('fireStepSec', 'fire', 10, 2, 60, 1, 's', ['خطوة انتشار الحريق داخل المبنى', 'Indoor spread time-step'],
    ['كل كم ثانية تُحاول النار الانتقال إلى الغرف المجاورة (افتراض).', 'How often fire tries to move to neighbouring rooms (assumption).']);
  def('doorClosedF', 'fire', 0.08, 0, 1, 0.01, '×', ['عامل الباب المغلق', 'Closed-door factor'],
    ['مضاعِف احتمال انتقال النار عبر باب مغلق (افتراض).', 'Multiplier on fire spread probability through a closed door (assumption).']);
  def('doorOpenF', 'fire', 0.5, 0, 1, 0.01, '×', ['عامل الباب المفتوح', 'Open-door factor'],
    ['مضاعِف احتمال انتقال النار عبر باب مفتوح أو ممر (افتراض).', 'Multiplier on fire spread probability through an open door or corridor link (assumption).']);
  def('stairSpreadF', 'fire', 0.35, 0, 1, 0.01, '×', ['عامل الدرج', 'Stairwell factor'],
    ['مضاعِف احتمال انتقال النار عبر الدرج بين الطوابق (افتراض).', 'Multiplier on fire spread through a stairwell between floors (assumption).']);
  def('smokeLeakClosed', 'fire', 0.012, 0, 0.2, 0.002, '1/s', ['تسرّب الدخان عبر باب مغلق', 'Smoke leak: closed door'],
    ['معدل تبادل الدخان عبر باب مغلق (افتراض).', 'Smoke exchange rate through a closed door (assumption).']);
  def('smokeLeakOpen', 'fire', 0.05, 0, 0.3, 0.005, '1/s', ['تسرّب الدخان عبر باب مفتوح', 'Smoke leak: open door/corridor'],
    ['معدل تبادل الدخان عبر باب مفتوح أو ممر (افتراض).', 'Smoke exchange rate through an open door or corridor (assumption).']);
  def('draughtPct', 'fire', 15, 0, 60, 5, '%', ['تيار الهواء داخل المبنى', 'Indoor draught'],
    ['سرعة التيار داخل المبنى كنسبة من سرعة الرياح الخارجية (افتراض).', 'Indoor draught speed as a share of the outdoor wind speed (assumption).']);
  def('stackMps', 'fire', 0.5, 0, 3, 0.1, 'm/s', ['تيار الأدراج الصاعد', 'Stairwell updraft'],
    ['تيار هواء صاعد في بيت الدرج يسرّع انتشار النار والدخان إلى الأعلى (افتراض).', 'Upward draught in the stairwell that pushes fire and smoke upwards (assumption).']);
  def('outFireStepSec', 'fire', 15, 5, 60, 1, 's', ['خطوة الحريق الخارجي', 'Outdoor fire time-step'],
    ['الزمن الواقعي لكل خطوة في خلية الحريق الخارجي (خلية = 5 م) (افتراض).', 'Real time of one outdoor cellular-automaton step (cell = 5 m) (assumption).']);
  def('engineEffectPct', 'fire', 65, 0, 100, 5, '%', ['أثر سيارة الإطفاء', 'Fire-engine effect'],
    ['نسبة ما تُزيله سيارة الإطفاء الواصلة من احتمال انتشار النار (افتراض).', 'Share of fire-spread probability removed once a fire engine is on scene (assumption).']);
  def('engineSetupSec', 'fire', 60, 0, 300, 10, 's', ['تجهيز فريق الإطفاء', 'Crew set-up time'],
    ['ثوانٍ بين وصول سيارة الإطفاء وبدء أثرها (افتراض).', 'Seconds between the engine arriving and its effect starting (assumption).']);
  def('safeDistM', 'fire', 35, 10, 150, 5, 'm', ['أقل مسافة لنقطة التجمع', 'Minimum assembly-point distance'],
    ['لا تُوجَّه المنارة الناس إلى نقطة تجمع أقرب من هذه المسافة إلى النار أو داخل مسار الدخان (افتراض).', 'MANARA never sends people to an assembly point closer than this to the fire or inside the smoke path (assumption).']);
  def('roofLocked', 'fire', 1, 0, 1, 1, '0/1', ['باب السطح مقفل', 'Roof door locked'],
    ['1 = باب السطح مقفل في بداية المحاكاة (لا يعرف الإنذار العادي ذلك).', '1 = the roof door starts locked (the ordinary alarm does not know).']);
  // ---- gas
  def('gasRate', 'gas', 5, 1, 20, 0.5, 'units/s', ['معدل التسرّب', 'Leak rate'],
    ['قوة مصدر التسرّب بوحدات المحاكاة (تحدّد مدى وسرعة وصول الغاز).', 'Strength of the leak source in simulation units (sets how far and how fast gas travels).']);
  def('gasK', 'gas', 12, 1, 60, 1, 'm²/s', ['انتشار الغاز', 'Gas diffusion'],
    ['معامل الانتشار المضطرب للغاز في الهواء (افتراض بسيط).', 'Turbulent diffusion coefficient of the gas in air (simple assumption).']);
  def('gasHeavy', 'gas', 1, 0, 1, 1, '0/1', ['الغاز أثقل من الهواء', 'Heavier than air'],
    ['1 = غاز مثل البروبان/البوتان يتجمّع في المنخفضات.', '1 = a gas like LPG that pools in low ground.']);
  def('gasInfilPct', 'gas', 60, 0, 100, 5, '%', ['دخول الغاز للمبنى', 'Gas entering buildings'],
    ['نسبة تركيز الغاز الخارجي التي تصل إلى داخل المبنى (افتراض).', 'Share of the outdoor gas concentration that reaches indoors (assumption).']);
  def('gasWarn', 'gas', 1000, 1, 5000, 1, 'ppm', ['مستوى التحذير (بروبان مكافئ)', 'Warning level (propane-equivalent)'],
    ['LPG بوحدة ppm مكافئ للبروبان: تحذير 1000 (OSHA/NIOSH، المصدر S48). يتغير مع نوع الغاز: CO 35 (S46)، H₂S 10 (S47). المرجع: docs/MANARA-HAZARDS.md §13.', 'LPG in propane-equivalent ppm: warn 1000 (OSHA/NIOSH, source S48). Changes with the gas type: CO 35 (S46), H2S 10 (S47). See docs/MANARA-HAZARDS.md §13.'], 'S48');
  def('gasDanger', 'gas', 2100, 2, 10000, 1, 'ppm', ['مستوى الخطر', 'Danger level'],
    ['للبروبان 2100 ppm = 10% من حدّ الاشتعال الأدنى (IDLH، NIOSH، المصدر S48). للغازات الأخرى: CO 200 (S46)، H₂S 20 سقفاً (S47).', 'For propane 2,100 ppm = 10 % of the lower explosive limit (IDLH, NIOSH, source S48). Other gases: CO 200 (S46), H2S ceiling 20 (S47).'], 'S48');
  def('gasIncapSec', 'gas', 400, 60, 3600, 30, 's', ['زمن العجز عند الخطر', 'Time to incapacitation at danger level'],
    ['الثواني عند مستوى الخطر لتصل «الجرعة» في النموذج إلى العجز (ليست طبية).', 'Seconds at danger level for the model "dose" to reach incapacitation (not medical).']);
  // ---- flood
  def('rainMmHr', 'flood', 60, 5, 150, 5, 'mm/h', ['شدة المطر (محاكاة)', 'Rain intensity (SIM)'],
    ['مدخل للمحاكاة، ليس توقعاً حقيقياً.', 'A simulation input, not a real forecast.']);
  def('floodScale', 'flood', 6, 1, 20, 1, '×', ['ضغط الزمن', 'Time compression'],
    ['عامل لضغط عاصفة طويلة في دقائق عرض قليلة.', 'Factor that squeezes a long storm into a few minutes of demo time.']);
  def('floodBlockCm', 'flood', 30, 10, 80, 5, 'cm', ['عمق منع العبور', 'No-passage depth'],
    ['30 سم: عمق «الخطر» — يمكن أن يطفّي سيارة صغيرة (إرشاد هيئة الأرصاد الأمريكية، المصدر S55، بحث دولي عن مياه جارية)؛ لا يجتازه المشاة في النموذج.', '30 cm: the "danger" depth — can float a small car (US National Weather Service guidance, source S55, international, about moving water); pedestrians do not cross it in the model.'], 'S55');
  def('roadCloseCm', 'flood', 15, 5, 60, 5, 'cm', ['عمق إغلاق الطريق', 'Road-closure depth'],
    ['15 سم: عمق «التحذير» (إرشاد هيئة الأرصاد الأمريكية، المصدر S55) — يُعتمد مفتاحاً أول للفيضان وتُغلق عنده الطريق أمام مركبات الاستجابة في النموذج.', '15 cm: the "warn" depth (US National Weather Service guidance, source S55) — the first flood key, and the depth at which a road is closed to responder vehicles in the model.'], 'S55');
  def('floodIncapSec', 'flood', 120, 30, 1800, 10, 's', ['زمن العجز في الماء العميق', 'Time to incapacitation in deep water'],
    ['الثواني في ماء بعمق يفوق عتبة المنع لتصل الجرعة النموذجية إلى العجز (ليست طبية).', 'Seconds in water deeper than the no-passage depth for the model dose to reach incapacitation (not medical).']);
  // ---- dust
  def('dustPeak', 'dust', 1200, 200, 4000, 100, 'µg/m³', ['ذروة PM10 (محاكاة)', 'Peak PM10 (SIM)'],
    ['مدخل للمحاكاة، ليس قياساً حقيقياً.', 'A simulation input, not a real measurement.']);
  def('dustFrontMps', 'dust', 8, 2, 25, 1, 'm/s', ['سرعة جبهة الغبار', 'Dust-front speed'],
    ['سرعة تقدّم جبهة العاصفة في المحاكاة.', 'Speed at which the storm front advances in the simulation.']);
  def('dustLeadSec', 'dust', 240, 30, 900, 30, 's', ['الإنذار المبكر قبل الوصول', 'Lead time before the front arrives'],
    ['الزمن بين رصد الجبهة عند أطراف الحيّ ووصولها إلى وسطه.', 'Time between the front reaching the district edge and its centre.']);
  def('dustWarn', 'dust', 150, 20, 1000, 10, 'µg/m³', ['مستوى التحذير PM10', 'PM10 warning level'],
    ['150 µg/m³ هو معيار قطر الوطني لمتوسط 24 ساعة (المصدر S31).', '150 µg/m³ is Qatar\'s national 24-hour PM10 standard (source S31).'], 'S31');
  def('dustDanger', 'dust', 255, 100, 3000, 5, 'µg/m³', ['مستوى الخطر PM10', 'PM10 danger level'],
    ['255 µg/m³ بداية فئة «غير صحي» في مؤشر الهواء الأمريكي (EPA، المصدر S49 — بحث دولي).', '255 µg/m³ is where the US EPA index "Unhealthy" band starts (source S49 — international research).'], 'S49');
  def('dustCritical', 'dust', 425, 150, 5000, 5, 'µg/m³', ['مستوى الحرِج PM10', 'PM10 critical level'],
    ['425 µg/m³ بداية فئة «خطِر» في مؤشر الهواء الأمريكي (EPA، المصدر S49). يُستخدم في النموذج مقياساً لجرعة الغبار.', '425 µg/m³ is where the US EPA index "Hazardous" band starts (source S49). The model uses it as the scale of the dust dose.'], 'S49');
  def('indoorDustPct', 'dust', 15, 0, 100, 5, '%', ['الغبار داخل المباني', 'Dust indoors'],
    ['نسبة تركيز الغبار الخارجي داخل المباني المغلقة (افتراض).', 'Share of the outdoor dust level inside closed buildings (assumption).']);
  def('dustIncapSec', 'dust', 900, 120, 7200, 60, 's', ['زمن العجز في الغبار الكثيف', 'Time to incapacitation in dense dust'],
    ['الثواني في الغبار فوق عتبة الخطر حتى تصل الجرعة النموذجية للعجز؛ مرضى الربو أسرع ثلاث مرات (ليست طبية).', 'Seconds above danger level until the model dose reaches incapacitation; asthmatics are three times faster (not medical).']);
  // ---- heat
  def('wbgtStart', 'heat', 30, 20, 38, 0.5, '°C', ['WBGT عند البداية (محاكاة)', 'WBGT at start (SIM)'],
    ['مؤشر الإجهاد الحراري في الشمس عند بداية المحاكاة (مدخل، ليس قياساً).', 'Heat-stress index in the sun at the start of the run (an input, not a measurement).']);
  def('wbgtRise', 'heat', 4, 0, 15, 0.5, '°C/h', ['ارتفاع WBGT في الساعة', 'WBGT rise per hour'],
    ['سرعة ارتفاع المؤشر في سيناريو اليوم الحار (مدخل).', 'How fast the index rises in the hot-day scenario (an input).']);
  def('wbgtStop', 'heat', 32.1, 25, 38, 0.1, '°C', ['عتبة إيقاف كل الأعمال', 'Stop-all-work level'],
    ['«يجب إيقاف كل الأعمال إذا ارتفع WBGT فوق 32.1» — قرار وزارة العمل في قطر كما نقلته منظمة العمل الدولية (المصدر S19). هذا مؤشر مقيس، وتقديرنا من الحرارة والرطوبة ليس مثله.', '"All work must stop if WBGT rises beyond 32.1" — Qatar\'s labour rule as reported by the ILO (source S19). It is a measured index; our estimate from temperature and humidity is not the same.'], 'S19');
  def('heatRuleHour', 'heat', 10, 8, 16, 0.25, 'h', ['ساعة قاعدة التقويم/العمل في الحر', 'Calendar / work-rule hour'],
    ['من هذه الساعة تُعتبر قاعدة جدول العمل في الحر فعّالة (المفتاح الثاني). الحظر الرسمي للعمل الخارجي بين 10:00 و15:30 من 1 يونيو إلى 15 سبتمبر (S18) يسري صيفاً؛ يوم العرض مفترض خارج تلك الفترة.', 'From this hour the work-hours rule counts as active (the second key). The official outdoor-work ban 10:00–15:30 from 1 June to 15 September (S18) applies in summer; the demo day is assumed to fall outside that window.']);
  def('wbgtRef', 'heat', 28, 20, 34, 0.5, '°C', ['WBGT الذي يبدأ عنده الإجهاد', 'WBGT where strain starts'],
    ['حد الإجراء لعمل خفيف لمن لم يتأقلم 28 °م (OSHA، المصدر S52) — يُستخدم كبداية لتراكم الإجهاد في النموذج.', 'The action limit for light work, unacclimatised, is 28 °C (OSHA, source S52) — used as the start of strain accumulation in the model.'], 'S52');
  def('strainMin', 'heat', 90, 20, 480, 10, 'min', ['زمن الانهيار عند عتبة الإيقاف', 'Minutes to collapse at the stop level'],
    ['الدقائق التي يعملها عامل متوسط عند عتبة الإيقاف حتى ينهار في النموذج (افتراض).', 'Minutes an average worker works at the stop level before collapsing in the model (assumption).']);
  def('coolRecoverMin', 'heat', 30, 5, 120, 5, 'min', ['زمن التعافي في الظل', 'Recovery time in the cool shelter'],
    ['الدقائق اللازمة لتعافي الإجهاد بالكامل داخل مأوى مبرّد (افتراض).', 'Minutes needed to recover fully inside a cooled shelter (assumption).']);
  def('ordinaryBreakMin', 'heat', 60, 10, 240, 5, 'min', ['الاستراحة المجدولة (عادي)', 'Scheduled break (ordinary)'],
    ['متى يوقف المشرف العمل في الوضع العادي دون أي مؤشر (افتراض).', 'When the supervisor stops work in the ordinary case, with no index to go on (assumption).']);
  // ---- someone needs help
  def('sosStillSec', 'sos', 15, 3, 60, 1, 's', ['سكون ما بعد السقوط', 'Stillness after the fall'],
    ['الثواني من السكون بعد الاصطدام قبل اعتبار كاشف السقوط مفتاحاً فعّالاً (قيمة يحدّدها الطالب، تُعايَر).', 'Seconds of stillness after an impact before the fall detector counts as an active key (student-set, to be calibrated).'], 'student-set');
  def('sosTimeoutSec', 'sos', 30, 5, 120, 5, 's', ['مهلة «لا إجابة»', '"No answer" timeout'],
    ['الثواني التي ننتظر فيها ردّ الشخص على نداء التحقق قبل اعتبار المفتاح الثاني فعّالاً (30 ثانية، قيمة يحدّدها الطالب).', 'Seconds we wait for the person to answer the check-in call before the second key counts (30 s, student-set).']);
  def('ordinaryNoticeSec', 'sos', 150, 10, 900, 10, 's', ['زمن ملاحظة المارّة', 'Time until a bystander notices'],
    ['الثواني حتى يلاحظ شخص ما أن آخر سقط ويتصل بالإسعاف (افتراض).', 'Seconds until someone notices another person has collapsed and calls for help (assumption).']);
  def('volunteers', 'sos', 6, 0, 20, 1, 'persons', ['عدد المتطوعين المدرّبين', 'Trained volunteers nearby'],
    ['عدد من تلقّوا تدريب إسعافات أولية ويصلهم النداء في الحيّ (افتراض).', 'People with first-aid training who receive the call in the district (assumption).']);
  def('volunteerAlertSec', 'sos', 5, 0, 60, 1, 's', ['زمن استجابة المتطوع', 'Volunteer reaction time'],
    ['ثوانٍ بين وصول النداء للمتطوع وبدء الجري (افتراض).', 'Seconds between the call reaching a volunteer and starting to run (assumption).']);
  // ---- traffic (simulated)
  def('trafficLoad', 'traffic', 1.0, 0, 2, 0.1, '×', ['شدّة الازدحام', 'Traffic level'],
    ['0 = طرق خالية، 1 = المنحنى اليومي، 2 = ازدحام مضاعف (محاكاة).', '0 = empty roads, 1 = the daily profile, 2 = doubled congestion (simulated).']);
  def('emergencyFactor', 'traffic', 1.3, 1, 1.8, 0.05, '×', ['أفضلية مركبات الطوارئ', 'Emergency-vehicle speed bonus'],
    ['كم مرة تسير مركبات الاستجابة أسرع من حركة المرور العادية على الطريق الخالي (افتراض).', 'How much faster responders drive than normal traffic on an empty road (assumption).']);
  def('incidentSlowPct', 'traffic', 30, 0, 80, 5, '%', ['تباطؤ الطرق قرب الحادث', 'Slow-down near the incident'],
    ['نسبة تباطؤ الطرق القريبة من الحادث (فضوليون، خراطيم، تحويلات) (افتراض).', 'Speed loss on roads near the incident (onlookers, hoses, diversions) (assumption).']);
  // ---- dispatch
  def('turnoutFireSec', 'dispatch', 60, 0, 300, 10, 's', ['جاهزية الإطفاء', 'Fire crew turn-out'],
    ['الثواني بين الإرسال وانطلاق مركبة الإطفاء (افتراض).', 'Seconds between dispatch and the fire engine rolling (assumption).']);
  def('turnoutAmbSec', 'dispatch', 45, 0, 300, 5, 's', ['جاهزية الإسعاف', 'Ambulance turn-out'],
    ['الثواني بين الإرسال وانطلاق سيارة الإسعاف (افتراض).', 'Seconds between dispatch and the ambulance rolling (assumption).']);
  def('turnoutPoliceSec', 'dispatch', 90, 0, 300, 10, 's', ['جاهزية الشرطة', 'Police turn-out'],
    ['الثواني بين الإرسال وانطلاق دورية الشرطة (افتراض).', 'Seconds between dispatch and the police patrol rolling (assumption).']);
  def('acceptSec', 'dispatch', 10, 0, 120, 5, 's', ['قبول غرفة التحكم', 'Control-room acceptance'],
    ['الثواني التي تحتاجها غرفة التحكم (999 تبقى هي المُرسِل) لقبول الحزمة المتحقَّق منها (افتراض).', 'Seconds the control room (999 stays the dispatcher) takes to accept the verified package (assumption).']);
  def('ordinaryCallSec', 'dispatch', 180, 30, 900, 10, 's', ['اتصال 999 في الإنذار العادي', 'Ordinary 999 call delay'],
    ['الثواني بين بدء الحادث واتصال شخص ما بـ 999 (افتراض).', 'Seconds between the incident starting and a person calling 999 (assumption).']);
  def('ordinaryAutoNotify', 'dispatch', 0, 0, 1, 1, '0/1', ['إشعار آلي في الإنذار العادي', 'Ordinary system auto-notifies'],
    ['1 = لوحة الإنذار العادية ترسل إشارة آلية للدفاع المدني (مثل أنظمة ربط المباني)؛ الافتراضي 0.', '1 = the ordinary alarm panel auto-notifies Civil Defence (like building-connection systems); default 0.']);
  def('callHandlingSec', 'dispatch', 45, 0, 300, 5, 's', ['معالجة المكالمة', 'Call handling'],
    ['الثواني بين المكالمة وقرار الإرسال في الوضع العادي (افتراض).', 'Seconds between the call and the dispatch decision in the ordinary case (assumption).']);
  def('unitBusyPct', 'dispatch', 0, 0, 100, 5, '%', ['وحدات مشغولة عشوائياً', 'Units randomly busy'],
    ['نسبة الوحدات التي تكون مشغولة في بداية المحاكاة (افتراض؛ يمكن أيضاً تعيين وحدة بعينها).', 'Share of units that are busy at the start (assumption; a specific unit can also be set busy).']);
  def('hospitalOccPct', 'dispatch', 60, 0, 100, 5, '%', ['إشغال المستشفيات (افتراض)', 'Hospital occupancy (assumption)'],
    ['نسبة الأسرّة المشغولة لتحديد السعة المتاحة لاستقبال المرضى (افتراض).', 'Share of beds occupied, which sets the free capacity for new patients (assumption).']);
  def('redispatchMarginSec', 'dispatch', 30, 5, 180, 5, 's', ['هامش إعادة الإرسال', 'Re-dispatch margin'],
    ['تُبدَّل الوحدة إذا كانت أخرى أسرع منها بهذا القدر على الأقل.', 'A unit is swapped when another is faster by at least this much.']);
  def('rerouteGainSec', 'dispatch', 10, 2, 120, 2, 's', ['مكسب تغيير المسار', 'Re-route gain'],
    ['يتغيّر مسار المركبة في الطريق إذا وفّر مساراً آخر هذا القدر على الأقل.', 'A vehicle changes route when another route saves at least this much.']);
  def('rescueAssistSec', 'dispatch', 150, 30, 900, 10, 's', ['زمن الإنقاذ المساعَد', 'Assisted-rescue time'],
    ['الثواني بين وصول فريق الإنقاذ وإخراج شخص عالق (افتراض).', 'Seconds between the rescue team arriving and a trapped person being brought out (assumption).']);
  def('loadSec', 'dispatch', 240, 0, 900, 30, 's', ['تحميل المريض', 'Patient loading'],
    ['الثواني على مكان الحادث قبل أن تغادر الإسعاف إلى المستشفى (افتراض).', 'Seconds on scene before the ambulance leaves for the hospital (assumption).']);
  def('onSceneSec', 'dispatch', 900, 120, 7200, 60, 's', ['مدة بقاء الوحدة', 'Time a unit stays on scene'],
    ['الثواني التي تبقى فيها الوحدة قبل أن تُعلَن «أُغلقت المهمة» (افتراض).', 'Seconds a unit stays before being marked "cleared" (assumption).']);
  // ---- drone
  def('droneLaunchSec', 'drone', 15, 0, 120, 5, 's', ['إقلاع الطائرة بعد التأكيد', 'Launch delay after CONFIRMED'],
    ['الثواني بين التأكيد (وموافقة الجهة المشغّلة) وإقلاع الطائرة (افتراض).', 'Seconds between CONFIRMED (and the authority\'s go-ahead) and take-off (assumption).']);
  def('droneSpeedMps', 'drone', 12, 3, 25, 1, 'm/s', ['سرعة الطائرة', 'Drone speed'],
    ['سرعة الطيران إلى نقطة التوقف (افتراض).', 'Cruise speed to the stand-off point (assumption).']);
  def('droneBattMin', 'drone', 25, 8, 45, 1, 'min', ['زمن الطيران عند 25°م', 'Flight time at 25 °C'],
    ['سعة البطارية بالدقائق عند حرارة معتدلة (افتراض).', 'Battery endurance in minutes at a moderate temperature (assumption).']);
  def('ambientC', 'drone', 38, 15, 50, 1, '°C', ['حرارة الجو (محاكاة)', 'Ambient temperature (SIM)'],
    ['تُنقص زمن طيران البطارية فوق 40°م (افتراض).', 'Cuts battery endurance above 40 °C (assumption).']);
  // ---- rescue robot (a concept with a simulated prototype: none of these numbers is measured; real hardware must be tested and approved)
  def('robotApproveSec', 'robot', 30, 0, 300, 5, 's', ['زمن اعتماد قائد الحادث', 'Incident-commander approval time'],
    ['ثوانٍ يحتاجها قائد الحادث (افتراضياً في التشغيل الآلي) ليعتمد نشر الروبوت بعد «مؤكَّد» (افتراض بشري).', 'Seconds the simulated incident commander takes to approve deploying the robot after CONFIRMED in automatic runs (human assumption).']);
  def('robotCarrier', 'robot', 0, 0, 1, 1, '0/1', ['من يحمل الروبوت', 'Who brings the robot'],
    ['0 = الروبوت موضوع مسبقاً عند مدخل المبنى؛ 1 = تحمله سيارة الإطفاء ولا يتحرك قبل وصولها (افتراض).', '0 = pre-positioned at the building entrance; 1 = carried by the fire engine and it cannot start before that engine arrives (assumption).']);
  def('robotDeploySec', 'robot', 20, 0, 120, 5, 's', ['تجهيز الروبوت عند المدخل', 'Set-up time at the entrance'],
    ['ثوانٍ لفتح الروبوت وفحصه الذاتي قبل أن يبدأ الحركة (افتراض).', 'Seconds to unpack and self-test before it starts moving (assumption).']);
  def('robotUnloadSec', 'robot', 40, 0, 300, 5, 's', ['إنزال الروبوت من المركبة', 'Unloading from the vehicle'],
    ['ثوانٍ إضافية لإنزاله عندما تحمله سيارة الإطفاء (افتراض).', 'Extra seconds to unload it when the fire engine carries it (assumption).']);
  def('robotSpeedWheeled', 'robot', 1.0, 0.3, 2.0, 0.1, 'm/s', ['سرعة الروبوت ذي العجلات', 'Wheeled robot speed'],
    ['السرعة على أرض مستوية؛ لا يستطيع صعود الدرج (افتراض).', 'Speed on level floor; it cannot climb stairs (assumption).']);
  def('robotSpeedTracked', 'robot', 0.6, 0.2, 1.5, 0.1, 'm/s', ['سرعة الروبوت ذي الجنزير', 'Tracked robot speed'],
    ['السرعة على أرض مستوية؛ يصعد الدرج بسرعة أقل (افتراض).', 'Speed on level floor; it climbs stairs more slowly (assumption).']);
  def('robotStairPenalty', 'robot', 2.5, 1, 6, 0.5, '×', ['بطء الجنزير على الدرج', 'Tracked robot stair slow-down'],
    ['كم مرة أبطأ يصعد الروبوت ذو الجنزير الدرج من سيره على أرض مستوية (افتراض).', 'How many times slower the tracked robot climbs stairs than it drives on level floor (assumption).']);
  def('robotStairDrain', 'robot', 1.5, 1, 4, 0.5, '×', ['استهلاك البطارية على الدرج', 'Battery use on stairs'],
    ['مضاعف استهلاك البطارية أثناء الصعود (افتراض).', 'Multiplier on battery drain while climbing (assumption).']);
  def('robotSmokeSlowPct', 'robot', 30, 0, 80, 5, '%', ['بطء الروبوت في الدخان', 'Slow-down in thick smoke'],
    ['نسبة تباطؤ الروبوت في دخان كثيف لأنه يتحرك بحذر (افتراض).', 'Speed reduction in thick smoke because the robot moves carefully (assumption).']);
  def('robotOpensDoors', 'robot', 1, 0, 1, 1, '0/1', ['يدفع الأبواب غير المقفلة', 'Pushes unlocked doors open'],
    ['1 = يستطيع دفع باب مغلق غير مقفل؛ 0 = لا يدخل غرفة بابها مغلق. لا يكسر الأبواب أبداً (افتراض).', '1 = it can push open a closed but unlocked door; 0 = it cannot enter a room whose door is closed. It never breaks doors (assumption).']);
  def('robotDoorSec', 'robot', 4, 1, 30, 1, 's', ['زمن دفع الباب', 'Time to push a door open'],
    ['ثوانٍ يحتاجها لفتح باب غير مقفل (افتراض).', 'Seconds to open an unlocked door (assumption).']);
  def('robotMaxTempC', 'robot', 85, 50, 200, 5, '°C', ['أعلى حرارة يدخلها الروبوت', 'Highest air temperature it will enter'],
    ['لا يدخل الروبوت مكاناً حرارته أعلى من هذا (افتراض؛ يجب اختبار أي عتاد حقيقي).', 'The robot will not enter a place hotter than this (assumption; any real hardware must be tested).']);
  def('robotHeatWarnC', 'robot', 60, 40, 120, 5, '°C', ['حرارة تراكم التسخين', 'Heat-soak warning temperature'],
    ['فوق هذه الحرارة يتباطأ الروبوت ويتراكم عليه التسخين (افتراض).', 'Above this temperature the robot slows down and heat builds up in it (assumption).']);
  def('robotHeatSoakSec', 'robot', 120, 20, 600, 10, 's', ['زمن الإيقاف الحراري', 'Time to thermal shutdown'],
    ['ثوانٍ في الحرارة المرتفعة حتى يتوقف الروبوت للحماية (افتراض).', 'Seconds in high heat until the robot shuts down to protect itself (assumption).']);
  def('robotRoomC', 'robot', 30, 20, 40, 1, '°C', ['حرارة هواء الغرف', 'Room air temperature'],
    ['حرارة الهواء داخل الغرف البعيدة عن الحريق (افتراض). كلما ارتفعت قلّ التباين الحراري بين الجسم والغرفة.', 'Indoor air temperature in rooms away from the fire (assumption). The hotter it is, the less thermal contrast a body has against the room.']);
  def('robotBattMin', 'robot', 45, 10, 120, 5, 'min', ['عمر بطارية الروبوت', 'Robot battery endurance'],
    ['دقائق التشغيل في ظروف عادية (افتراض).', 'Minutes of driving under ordinary conditions (assumption).']);
  def('robotTrackedDrain', 'robot', 1.4, 1, 3, 0.1, '×', ['استهلاك الجنزير', 'Tracked robot battery use'],
    ['كم مرة يستهلك الروبوت ذو الجنزير من البطارية أكثر من ذي العجلات (افتراض).', 'How many times more battery the tracked robot uses than the wheeled one (assumption).']);
  def('robotHeatDrain', 'robot', 0.25, 0, 1, 0.05, '×/10 °C', ['أثر الحرارة على البطارية', 'Heat effect on the battery'],
    ['زيادة الاستهلاك لكل 10 °م فوق 40 °م (افتراض).', 'Extra drain for every 10 °C above 40 °C (assumption).']);
  def('robotSmokeDrain', 'robot', 0.5, 0, 2, 0.1, '×', ['أثر الدخان على البطارية', 'Smoke effect on the battery'],
    ['زيادة الاستهلاك في دخان كثيف (مراوح التبريد والمرشّحات) (افتراض).', 'Extra drain in dense smoke (cooling fans and filters) (assumption).']);
  def('robotIdleDrain', 'robot', 0.3, 0.05, 1, 0.05, '×', ['استهلاك الوقوف', 'Standing (idle) battery use'],
    ['نسبة استهلاك البطارية أثناء البقاء مع شخص أو الوقوف مقارنة بالسير (افتراض).', 'Share of the driving battery use while holding with a person or standing still (assumption).']);
  def('robotReturnPct', 'robot', 25, 5, 60, 5, '%', ['مستوى البطارية للعودة', 'Battery level that triggers return'],
    ['يعود الروبوت إذا نزلت بطاريته عن هذه النسبة أو عن تكلفة العودة المقدَّرة، أيهما أكبر (افتراض).', 'The robot returns when its battery falls below this share or below the estimated cost of the way back, whichever is higher (assumption).']);
  def('robotRangeM', 'robot', 8, 3, 20, 1, 'm', ['مدى الكاميرا الحرارية', 'Thermal-camera range'],
    ['أقصى مسافة يرى بها الروبوت شخصاً في خط النظر داخل الغرفة أو الممر (افتراض).', 'The farthest distance at which the robot can see a person in line of sight inside a room or corridor (assumption).']);
  def('robotThermalPd', 'robot', 0.35, 0.05, 1, 0.05, 'prob/s', ['احتمال الكشف الحراري في الثانية', 'Thermal detection chance per second'],
    ['احتمال أن يكشف الروبوت شخصاً أمامه في كل ثانية عند أقصى تباين حراري وهواء صافٍ (قاعدة بسيطة، افتراض).', 'Chance per second of spotting a person in view at full thermal contrast and clear air (a simple rule, assumption).']);
  def('robotContrastC', 'robot', 8, 2, 15, 1, 'K', ['فرق الحرارة للتباين الكامل', 'Temperature gap for full contrast'],
    ['الفرق بين حرارة الجسم وحرارة الغرفة الذي يعطي تبايناً كاملاً؛ في الغرف الحارة يقلّ التباين (حرارة الخليج) (افتراض).', 'The gap between body and room temperature that gives full contrast; in hot rooms contrast falls (the Gulf-heat caveat) (assumption).']);
  def('robotThermalSmokeK', 'robot', 1.2, 0, 6, 0.2, '×', ['توهين الدخان للحرارية', 'Smoke attenuation, thermal camera'],
    ['معامل توهين الرؤية الحرارية بالدخان لكل 5 م (الحرارية ترى عبر الدخان أفضل من الضوء المرئي) (افتراض).', 'Attenuation of thermal vision by smoke per 5 m (thermal sees through smoke better than visible light) (assumption).']);
  def('robotRgbSmokeK', 'robot', 5, 0, 15, 0.5, '×', ['توهين الدخان للكاميرا المرئية', 'Smoke attenuation, visible camera'],
    ['معامل توهين الكاميرا العادية بالدخان لكل 5 م (افتراض).', 'Attenuation of the ordinary camera by smoke per 5 m (assumption).']);
  def('robotRgbPd', 'robot', 0.15, 0, 1, 0.05, 'prob/s', ['احتمال الكشف بالكاميرا المرئية في الثانية', 'Visible-camera detection chance per second'],
    ['احتمال أن تلتقط كاميرا الضوء المرئي (مع مصباح الروبوت) شخصاً في الهواء الصافي؛ يضعف بسرعة مع الدخان (افتراض).', 'Chance per second that the visible camera (with the robot\'s own lamp) picks out a person in clear air; it falls quickly with smoke (assumption).']);
  def('robotAudioPd', 'robot', 0.25, 0, 1, 0.05, 'prob/s', ['احتمال الكشف الصوتي في الثانية', 'Audio detection chance per second'],
    ['احتمال أن يسمع الروبوت شخصاً واعياً ينادي طلباً للمساعدة عن قرب في الهدوء (افتراض).', 'Chance per second that the robot hears a conscious person calling for help at close range in quiet (assumption).']);
  def('robotAudioRangeM', 'robot', 6, 2, 15, 1, 'm', ['مدى الميكروفون', 'Microphone range'],
    ['أقصى مسافة يسمع منها الروبوت نداءً (افتراض).', 'The farthest distance at which the robot can hear a call (assumption).']);
  def('robotNoiseMask', 'robot', 0.6, 0, 1, 0.1, '×', ['حجب الضجيج للصوت', 'Noise masking of audio'],
    ['نسبة ما ينقصه صوت الصافرة والحريق من قدرة الميكروفون (افتراض).', 'Share of the microphone\'s ability removed by the siren and fire noise (assumption).']);
  def('robotFalsePosPerMin', 'robot', 0.6, 0, 10, 0.1, '/min', ['إنذارات حرارية كاذبة في الدقيقة', 'False thermal alarms per minute'],
    ['معدل «شخص محتمل» كاذب (جسم ساخن مثل شاحن أو أثاث دافئ) لكل دقيقة داخل الغرف (افتراض).', 'Rate of false "possible person" alarms (a hot object such as a charger or warm furniture) per minute inside rooms (assumption).']);
  def('robotInvestigateSec', 'robot', 12, 3, 60, 1, 's', ['زمن التحقق من الإنذار', 'Time to check an alarm'],
    ['ثوانٍ يقضيها الروبوت في التحقق من إنذار كاذب قبل أن يسقطه (افتراض).', 'Seconds the robot spends checking a false alarm before dismissing it (assumption).']);
  def('robotRoomSweepSec', 'robot', 10, 3, 60, 1, 's', ['زمن مسح الغرفة', 'Room sweep time'],
    ['ثوانٍ يقضيها داخل الغرفة قبل أن يعدّها ممسوحة (افتراض).', 'Seconds it spends inside a room before counting it as swept (assumption).']);
  def('robotRecheckPasses', 'robot', 2, 1, 3, 1, 'passes', ['عدد مرات مسح الغرفة', 'Sweeps per room'],
    ['كم مرة يجوز للروبوت مسح غرفة ما زال فيها مقيمون غير محصيّين (افتراض).', 'How many times the robot may sweep a room that still has unaccounted residents (assumption).']);
  def('robotMeshRangeM', 'robot', 30, 10, 80, 5, 'm', ['مدى شبكة الاتصال', 'Mesh link range'],
    ['المسافة التي يعمل فيها الاتصال من بوابة المدخل أو أقرب مرحّل على طول الممر (الجدران والطوابق تقلّلها) (افتراض).', 'Distance over which the link works from the entrance gateway or the nearest relay along the path (walls and floors reduce it) (assumption).']);
  def('robotFloorLossM', 'robot', 15, 0, 40, 5, 'm', ['خسارة المدى لكل طابق', 'Range lost per floor'],
    ['أمتار من المدى يخسرها الاتصال عند كل طابق فاصل (افتراض).', 'Metres of range the link loses for every floor in between (assumption).']);
  def('robotBeaconRelay', 'robot', 1, 0, 1, 1, '0/1', ['المنارات تعمل مرحّلات', 'Beacons also relay the link'],
    ['1 = كل منارة طريق يضعها الروبوت تمدّ الشبكة أيضاً (افتراض).', '1 = every route beacon the robot drops also extends the mesh (assumption).']);
  def('robotDropoutPct', 'robot', 2, 0, 20, 0.5, '%/s', ['انقطاع الاتصال (٪ في الثانية)', 'Link dropouts (% per second)'],
    ['احتمال بدء انقطاع في كل ثانية عندما تكون الإشارة ضعيفة (أقل من 50٪) (افتراض).', 'Chance per second that a dropout starts while the signal is weak (below 50 %) (assumption).']);
  def('robotDropoutSec', 'robot', 10, 2, 120, 2, 's', ['مدة الانقطاع', 'Dropout length'],
    ['ثوانٍ يستمرّ فيها الانقطاع؛ يواصل الروبوت عمله بنفسه وتُخزَّن تقاريره (افتراض).', 'Seconds a dropout lasts; the robot keeps working on its own and its reports are buffered (assumption).']);
  def('robotLinkLostSec', 'robot', 45, 10, 300, 5, 's', ['مهلة فقد الاتصال', 'Lost-link patience'],
    ['بعد هذه المدة بلا اتصال يتراجع الروبوت نحو أقرب مرحّل (افتراض).', 'After this long without a link the robot backs toward the nearest relay (assumption).']);
  def('robotFollowP', 'robot', 0.85, 0, 1, 0.05, 'prob', ['احتمال اتباع الإرشاد', 'Chance of following guidance'],
    ['احتمال أن يتبع شخص واعٍ قادر على الحركة إرشاد الروبوت (افتراض، ليس قياساً).', 'Chance that an awake person who can move follows the robot\'s guidance (assumption, not a measurement).']);
  def('robotWakeP', 'robot', 0.6, 0, 1, 0.05, 'prob', ['احتمال الإيقاظ بمحاولة', 'Wake chance per attempt'],
    ['احتمال أن توقظ محاولة واحدة (صوت عالٍ + ضوء) شخصاً نائماً (افتراض).', 'Chance that one attempt (loud voice + light) wakes a sleeper (assumption).']);
  def('robotWakeTries', 'robot', 3, 1, 6, 1, 'tries', ['محاولات الإيقاظ', 'Wake-up attempts'],
    ['عدد المحاولات (كل 5 ثوانٍ) قبل أن يعدّه الروبوت غير مستجيب (افتراض).', 'Number of attempts (5 s apart) before the robot treats the person as not responding (assumption).']);
  def('robotHoldMaxSec', 'robot', 300, 30, 1800, 30, 's', ['أقصى بقاء مع شخص', 'Longest hold with one person'],
    ['أقصى مدة يبقى فيها الروبوت مع من لا يستطيع الحركة قبل أن يعود للبحث إن لم يصل الإنقاذ (افتراض).', 'The longest the robot stays with someone who cannot move before it goes back to searching if crews have not arrived (assumption).']);
  def('robotGuideSec', 'robot', 25, 5, 90, 5, 's', ['أقصى زمن للإرشاد', 'Longest guidance stop'],
    ['أقصى ثوانٍ يقضيها الروبوت في إرشاد شخص ووضع المنارات (افتراض).', 'The most seconds the robot spends guiding one person and dropping beacons (assumption).']);
  def('robotBeacons', 'robot', 8, 0, 20, 1, 'units', ['منارات الطريق المحمولة', 'Route beacons carried'],
    ['عدد المنارات (علامات ضوئية صغيرة) التي يحملها (افتراض).', 'Number of beacons (small light markers) it carries (assumption).']);
  def('robotBeaconsPerFind', 'robot', 3, 0, 6, 1, 'units', ['منارات لكل عثور', 'Beacons per find'],
    ['أقصى عدد منارات يضعها الروبوت على طريق شخص واحد (افتراض).', 'The most beacons the robot drops on one person\'s route (assumption).']);
  def('robotHoods', 'robot', 2, 0, 6, 1, 'units', ['أغطية الدخان في الحقيبة', 'Smoke hoods in the pouch'],
    ['عدد أغطية الدخان التي يستطيع الروبوت تسليمها لشخص واعٍ لا يستطيع التحرك في دخان (افتراض).', 'How many smoke hoods the robot can hand to a conscious person who cannot move in smoke (assumption).']);
  def('robotHoodFactor', 'robot', 0.4, 0.1, 1, 0.05, 'share', ['نسبة الجرعة مع غطاء الدخان', 'Dose rate left with a smoke hood on'],
    ['نسبة معدّل جرعة الدخان المتبقية لمن يلبس الغطاء في النموذج (افتراض، ليست قياساً).', 'Share of the smoke dose rate that is left for a person wearing the hood, in the model (assumption, not a measurement).']);
  def('robotCrewSpeedup', 'robot', 0.3, 0, 0.8, 0.05, 'share', ['توفير وقت الفرق عند معرفة المكان', 'Crew time saved when the place is known'],
    ['نسبة الوقت التي توفّرها فرق الإنقاذ حين يكون الروبوت قد حدّد الغرفة والشخص (افتراض).', 'Share of rescue time saved when the robot has already pinned down the room and the person (assumption).']);
  def('robotStatusSec', 'robot', 30, 10, 120, 5, 's', ['فاصل تقارير الحالة', 'Status-report interval'],
    ['ثوانٍ بين تقارير الروبوت عن حال من يبقى معه (افتراض).', 'Seconds between robot status reports about the person it stays with (assumption).']);

  function defaultParams() { var P = {}; for (var i = 0; i < PARAM_DEFS.length; i++) P[PARAM_DEFS[i].key] = PARAM_DEFS[i].default; return P; }
  function resolveParams(over) {
    var P = defaultParams();
    if (over) for (var k in over) if (Object.prototype.hasOwnProperty.call(P, k) && isNum(over[k])) P[k] = over[k];
    return P;
  }

  /* ====================================================================================
   * 3. THE WORLD (static, immutable, built once): terrain, buildings, indoor graphs, road graph, assets
   * ==================================================================================== */
  var K = { GROUND: 0, ROAD: 1, BUILDING: 2, PARK: 3, YARD: 4, SITE: 5 };
  var F_STAIRS = 1, F_DOOR = 2, F_EXIT = 4;
  var NT = { GRID: 0, ROOM: 1, CORR: 2, STAIR: 3, LOBBY: 4, REFUGE: 5, ROOF: 6, SUPPORT: 7 };
  var FUEL = { NONE: 0, SHRUB: 1, VEHICLE: 2, MATERIAL: 3 };
  // Alexandridis-form factors per outdoor fuel type: p_veg (vegetation type), p_den (density); burn duration (s)
  var FUEL_TABLE = [null,
    { pveg: 0.0, pden: -0.4, burnSec: 90, smoke: 0.6, name: T('شجيرات ونخيل', 'Shrubs & palms') },
    { pveg: 0.0, pden: 0.0, burnSec: 420, smoke: 1.0, name: T('مركبات متوقفة', 'Parked vehicles') },
    { pveg: 0.4, pden: 0.3, burnSec: 600, smoke: 1.3, name: T('مواد بناء (خشب/بلاستيك)', 'Building materials (timber/plastic)') }];

  function elevAt(x, y) {
    var e = 3.2 - 0.025 * y;
    var g1 = Math.exp(-((x - 24) * (x - 24)) / (2 * 4.5 * 4.5) - ((y - 41) * (y - 41)) / (2 * 6.5 * 6.5));   // the road underpass
    e -= 2.8 * g1;
    var g2 = Math.exp(-((x - 36) * (x - 36) + (y - 43) * (y - 43)) / (2 * 8 * 8));                                // park basin
    e -= 0.35 * g2;
    var g3 = Math.exp(-((x - 10) * (x - 10) + (y - 52) * (y - 52)) / (2 * 5 * 5));                                // south-west sump
    e -= 0.7 * g3;
    if (y < 8) e += 1.0;                                                                                          // higher ground at the north edge
    return e;
  }

  function makeStructure(idx, cfg) {
    var S = { idx: idx, id: cfg.id, name: cfg.name, floors: cfg.floors, x0: cfg.x0, y0: cfg.y0, w: cfg.w, h: cfg.h,
      nodes: [], byId: {}, edges: [], doors: 0, exits: [], cx: cfg.x0 + cfg.w / 2, cy: cfg.y0 + cfg.h / 2, kind: cfg.kind };
    S.add = function (n) { n.local = S.nodes.length; n.struct = idx; S.nodes.push(n); S.byId[n.id] = n; return n; };
    S.link = function (a, b, len, flag, extra) {
      var e = { a: S.byId[a].local, b: S.byId[b].local, len: len, flag: flag || 0, door: -1, exit: -1, out: null };
      if (flag & F_DOOR) e.door = S.doors++;
      if (extra) for (var k in extra) e[k] = extra[k];
      S.edges.push(e); return e;
    };
    return S;
  }

  function buildResidence(idx, exitBase) {   // 3-floor workers' accommodation (no lift: an assumption that makes the refuge balcony necessary)
    var S = makeStructure(idx, { id: 'RB', kind: 'residence', floors: 3, x0: 55, y0: 17, w: 9, h: 5,
      name: T('سكن العمال (تجريبي)', 'Workers\' residence (demo)') });
    var colX = function (c) { return 56 + 1.4 * (c + 0.5); };
    var f, c, n;
    for (f = 0; f < 3; f++) {
      for (c = 0; c < 5; c++) {
        S.add({ id: 'C' + f + c, type: NT.CORR, fl: f, x: colX(c), y: 19.5, col: c, label: T('الممر', 'Corridor') });
      }
      S.add({ id: 'SA' + f, type: NT.STAIR, fl: f, x: 55.5, y: 19.5, label: T('الدرج أ', 'Stair A') });
      S.add({ id: 'SB' + f, type: NT.STAIR, fl: f, x: 63.5, y: 19.5, label: T('الدرج ب', 'Stair B') });
      for (n = 1; n <= 10; n++) {
        var col = (n - 1) % 5, north = n <= 5, num = (f + 1) * 100 + n;
        if (f === 0 && n === 8) continue;                              // ground floor south-middle = lobby / guard desk
        S.add({ id: 'R' + num, type: NT.ROOM, fl: f, x: colX(col), y: north ? 18.0 : 21.0, col: col, side: north ? 'N' : 'S', room: String(num),
          label: T('غرفة ' + num, 'Room ' + num) });
      }
    }
    S.add({ id: 'LOB', type: NT.LOBBY, fl: 0, x: colX(2), y: 21.0, col: 2, side: 'S', label: T('البهو ومكتب الحارس', 'Lobby & guard desk') });
    S.add({ id: 'REF', type: NT.REFUGE, fl: 2, x: 64.3, y: 18.0, label: T('شرفة اللجوء', 'Refuge balcony') });
    S.add({ id: 'ROOF', type: NT.ROOF, fl: 3, x: 59.5, y: 19.5, label: T('السطح', 'Roof') });
    for (f = 0; f < 3; f++) {
      for (c = 0; c < 4; c++) S.link('C' + f + c, 'C' + f + (c + 1), 7, 0);
      S.link('C' + f + '0', 'SA' + f, 3, 0);
      S.link('C' + f + '4', 'SB' + f, 3, 0);
      if (f < 2) { S.link('SA' + f, 'SA' + (f + 1), 9, F_STAIRS); S.link('SB' + f, 'SB' + (f + 1), 9, F_STAIRS); }
      for (n = 1; n <= 10; n++) {
        if (f === 0 && n === 8) continue;
        S.link('R' + ((f + 1) * 100 + n), 'C' + f + ((n - 1) % 5), 4, F_DOOR);
      }
    }
    S.link('LOB', 'C02', 4, F_DOOR);
    S.link('REF', 'C24', 3, F_DOOR);
    S.exits = [
      { gi: exitBase + 0, id: 'E', kind: 'entrance', node: 'LOB', out: { x: 59, y: 22 }, shaft: ['LOB'], name: T('المدخل الرئيسي', 'Main entrance'), lock0: false },
      { gi: exitBase + 1, id: 'A', kind: 'stair', node: 'SA0', out: { x: 54, y: 19 }, shaft: ['SA0', 'SA1', 'SA2'], name: T('الدرج أ (غرباً)', 'Stair A (west)'), lock0: false },
      { gi: exitBase + 2, id: 'B', kind: 'stair', node: 'SB0', out: { x: 64, y: 19 }, shaft: ['SB0', 'SB1', 'SB2'], name: T('الدرج ب (شرقاً)', 'Stair B (east)'), lock0: false },
      { gi: exitBase + 3, id: 'R', kind: 'roof', node: 'SB2', to: 'ROOF', shaft: ['SB2'], name: T('باب السطح', 'Roof door'), lock0: true }
    ];
    S.exitEdges = [['LOB', 0], ['SA0', 1], ['SB0', 2]];
    S.roofEdge = ['SB2', 'ROOF'];
    return S;
  }

  function buildSchool(idx, exitBase) {      // 2-floor school, 8 classes, assembly in the yard
    var S = makeStructure(idx, { id: 'SCH', kind: 'school', floors: 2, x0: 4, y0: 13, w: 10, h: 5,
      name: T('المدرسة (تجريبية)', 'School (demo)') });
    var colX = function (c) { return 5 + 2 * (c + 0.5); };
    var classes = [['3A', '3B', '4A', '4B'], ['5A', '5B', '6A', '6B']];
    var f, c;
    for (f = 0; f < 2; f++) {
      for (c = 0; c < 4; c++) S.add({ id: 'D' + f + c, type: NT.CORR, fl: f, x: colX(c), y: 15.5, col: c, label: T('الممر', 'Corridor') });
      S.add({ id: 'SW' + f, type: NT.STAIR, fl: f, x: 4.5, y: 15.5, label: T('الدرج الغربي', 'West stair') });
      S.add({ id: 'SE' + f, type: NT.STAIR, fl: f, x: 13.5, y: 15.5, label: T('الدرج الشرقي', 'East stair') });
      for (c = 0; c < 4; c++) S.add({ id: 'K' + f + c, type: NT.ROOM, fl: f, x: colX(c), y: 14.0, col: c, side: 'N', room: classes[f][c], cls: classes[f][c],
        label: T('الصف ' + classes[f][c], 'Class ' + classes[f][c]) });
    }
    S.add({ id: 'SLOB', type: NT.LOBBY, fl: 0, x: colX(1), y: 17.0, col: 1, side: 'S', label: T('الاستقبال', 'Reception') });
    S.add({ id: 'Q03', type: NT.SUPPORT, fl: 0, x: colX(3), y: 17.0, col: 3, side: 'S', label: T('المقصف والمختبر', 'Canteen & lab'), fuel: 0.3 });
    S.add({ id: 'Q11', type: NT.SUPPORT, fl: 1, x: colX(1), y: 17.0, col: 1, side: 'S', label: T('المكتبة', 'Library'), fuel: 0.2 });
    S.add({ id: 'Q13', type: NT.SUPPORT, fl: 1, x: colX(3), y: 17.0, col: 3, side: 'S', label: T('غرفة الحاسوب', 'IT room'), fuel: 0.0 });
    for (f = 0; f < 2; f++) {
      for (c = 0; c < 3; c++) S.link('D' + f + c, 'D' + f + (c + 1), 6, 0);
      S.link('D' + f + '0', 'SW' + f, 3, 0);
      S.link('D' + f + '3', 'SE' + f, 3, 0);
      if (f < 1) { S.link('SW0', 'SW1', 9, F_STAIRS); S.link('SE0', 'SE1', 9, F_STAIRS); }
      for (c = 0; c < 4; c++) S.link('K' + f + c, 'D' + f + c, 3, F_DOOR);
    }
    S.link('SLOB', 'D01', 3, F_DOOR); S.link('Q03', 'D03', 3, F_DOOR); S.link('Q11', 'D11', 3, F_DOOR); S.link('Q13', 'D13', 3, F_DOOR);
    S.exits = [
      { gi: exitBase + 0, id: 'M', kind: 'entrance', node: 'SLOB', out: { x: 8, y: 18 }, shaft: ['SLOB'], name: T('المدخل الرئيسي', 'Main entrance'), lock0: false },
      { gi: exitBase + 1, id: 'W', kind: 'stair', node: 'SW0', out: { x: 3, y: 15 }, shaft: ['SW0', 'SW1'], name: T('الدرج الغربي', 'West stair'), lock0: false },
      { gi: exitBase + 2, id: 'E', kind: 'stair', node: 'SE0', out: { x: 14, y: 15 }, shaft: ['SE0', 'SE1'], name: T('الدرج الشرقي', 'East stair'), lock0: false }
    ];
    S.exitEdges = [['SLOB', 0], ['SW0', 1], ['SE0', 2]];
    return S;
  }

  // ---------------------------------------------------------------- road graph (time-varying traffic is applied in section 11)
  var ROAD_CLASS = {   // free-flow speed (m/s, ordinary traffic) and how strongly the daily congestion profile bites
    expressway: { v: 25.0, sens: 0.5 }, major: { v: 16.7, sens: 1.0 }, minor: { v: 11.1, sens: 0.6 }, access: { v: 5.5, sens: 0.2 }
  };
  // Daily congestion profile = ASSUMPTION (shape of a typical commuter day, NOT measured data): hour -> speed factor (1 = free flow)
  var TRAFFIC_PROFILE = [[0, 0.95], [5, 0.95], [6, 0.80], [7, 0.55], [8.5, 0.55], [10, 0.80], [12, 0.72], [13.5, 0.62], [15, 0.75], [17, 0.50], [19, 0.50], [20.5, 0.75], [22, 0.90], [24, 0.95]];
  function profileAt(hour) {
    hour = ((hour % 24) + 24) % 24;
    for (var i = 1; i < TRAFFIC_PROFILE.length; i++) {
      if (hour <= TRAFFIC_PROFILE[i][0]) {
        var a = TRAFFIC_PROFILE[i - 1], b = TRAFFIC_PROFILE[i];
        return lerp(a[1], b[1], (hour - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return TRAFFIC_PROFILE[TRAFFIC_PROFILE.length - 1][1];
  }
  var HOT_SCHOOL = [
    { id: 'school-am', from: 6.75, to: 7.75, depth: 0.75, label: T('طابور توصيل طلاب المدرسة', 'School drop-off queue') },
    { id: 'school-pm', from: 12.5, to: 13.5, depth: 0.75, label: T('طابور انصراف طلاب المدرسة', 'School pick-up queue') }
  ];
  var HOT_JUNC = [
    { id: 'junc-am', from: 7.0, to: 8.5, depth: 0.30, label: T('طابور التقاطع', 'Junction queue') },
    { id: 'junc-pm', from: 16.5, to: 19.0, depth: 0.30, label: T('طابور التقاطع', 'Junction queue') }
  ];

  function buildRoadSpec() {
    var nodes = [], segs = [];
    var N = function (id, x, y, extra) { var n = { id: id, x: x, y: y }; if (extra) for (var k in extra) n[k] = extra[k]; nodes.push(n); };
    var S = function (id, a, b, cls, extra) { var s = { id: id, a: a, b: b, cls: cls }; if (extra) for (var k in extra) s[k] = extra[k]; segs.push(s); };
    // main street y=31
    N('M0', 1, 31); N('X12', 12, 31); N('M1', 24, 31); N('X36', 36, 31); N('M2', 48, 31); N('X59', 59, 31); N('M3', 72, 31); N('X84', 84, 31); N('M4', 94, 31);
    // north street y=10, south street y=54
    N('N0', 1, 10); N('N1', 24, 10); N('N2', 48, 10); N('N3', 72, 10); N('N4', 94, 10);
    N('S0', 1, 54); N('S1', 24, 54); N('S2', 48, 54); N('S3', 72, 54); N('S4', 94, 54);
    N('UP', 24, 42);
    // points of interest
    N('BLD', 59, 27); N('SCH', 12, 27); N('SITE', 84, 28); N('PARK', 36, 36); N('LPGN', 59, 35);
    // off-map responder bases (positions are real distances: 1 cell = 5 m)
    N('F1', -139, 31, { off: true }); N('F2', 454, 31, { off: true }); N('P1', 48, -70, { off: true }); N('P2', 72, 234, { off: true });
    N('A1', 24, 124, { off: true }); N('H1', 394, 10, { off: true }); N('H2', 614, 54, { off: true });
    var nm = { MS: T('الشارع الرئيسي', 'Main Street'), NS: T('الشارع الشمالي', 'North Street'), SS: T('الشارع الجنوبي', 'South Street') };
    var ms = ['M0', 'X12', 'M1', 'X36', 'M2', 'X59', 'M3', 'X84', 'M4'];
    for (var i = 0; i < ms.length - 1; i++) {
      var ex = { name: nm.MS };
      if (i < 2) ex.hot = HOT_SCHOOL.concat(HOT_JUNC.slice(0, 0));
      if (i === 3 || i === 4) ex.hot = HOT_JUNC;
      S('MS' + (i + 1), ms[i], ms[i + 1], 'major', ex);
    }
    var nn = ['N0', 'N1', 'N2', 'N3', 'N4'], ss = ['S0', 'S1', 'S2', 'S3', 'S4'];
    for (i = 0; i < 4; i++) { S('NS' + (i + 1), nn[i], nn[i + 1], 'minor', { name: nm.NS }); S('SS' + (i + 1), ss[i], ss[i + 1], 'minor', { name: nm.SS }); }
    S('W1N', 'N0', 'M0', 'minor', { name: T('الطريق الغربي', 'West Road') }); S('W1S', 'M0', 'S0', 'minor', { name: T('الطريق الغربي', 'West Road') });
    S('V24N', 'N1', 'M1', 'minor', { name: T('طريق النفق', 'Underpass Road') });
    S('V24U1', 'M1', 'UP', 'minor', { name: T('نفق الطريق', 'Road underpass'), low: true });
    S('V24U2', 'UP', 'S1', 'minor', { name: T('نفق الطريق', 'Road underpass'), low: true });
    S('V48N', 'N2', 'M2', 'major', { name: T('طريق الوسط', 'Central Avenue'), hot: HOT_JUNC });
    S('V48S', 'M2', 'S2', 'major', { name: T('طريق الوسط', 'Central Avenue'), hot: HOT_JUNC });
    S('V72N', 'N3', 'M3', 'minor', { name: T('الطريق الشرقي', 'East Link') }); S('V72S', 'M3', 'S3', 'minor', { name: T('الطريق الشرقي', 'East Link') });
    S('V94N', 'N4', 'M4', 'minor', { name: T('الطريق الشرقي الخارجي', 'Outer East Road') }); S('V94S', 'M4', 'S4', 'minor', { name: T('الطريق الشرقي الخارجي', 'Outer East Road') });
    S('A-BLD', 'X59', 'BLD', 'access', { name: T('مدخل السكن', 'Residence forecourt'), poi: true });
    S('A-SCH', 'X12', 'SCH', 'access', { name: T('مدخل المدرسة', 'School gate'), poi: true });
    S('A-SITE', 'X84', 'SITE', 'access', { name: T('بوابة موقع البناء', 'Worksite gate'), poi: true });
    S('A-PARK', 'X36', 'PARK', 'access', { name: T('مدخل الحديقة', 'Park entrance'), poi: true });
    S('A-LPG', 'X59', 'LPGN', 'access', { name: T('مدخل مخزن الغاز', 'Gas store access'), poi: true });
    S('AR-W', 'F1', 'M0', 'major', { name: T('الشريان الغربي', 'West Arterial'), arterial: true, hot: [{ id: 'roadworks', from: 6.5, to: 9.0, depth: 0.30, label: T('أعمال طريق وازدحام الذروة', 'Road works + peak queue') }] });
    S('AR-E', 'F2', 'M4', 'expressway', { name: T('الطريق السريع الشرقي', 'East Expressway'), arterial: true });
    S('AR-N', 'P1', 'N2', 'minor', { name: T('الطريق الشمالي', 'North Access'), arterial: true });
    S('AR-SE', 'P2', 'S3', 'major', { name: T('الطريق الجنوبي الشرقي', 'South-East Road'), arterial: true });
    S('AR-S', 'A1', 'S1', 'minor', { name: T('الطريق الجنوبي', 'South Access'), arterial: true });
    S('AR-H1', 'H1', 'N4', 'major', { name: T('طريق مستشفى النخيل', 'Nakheel Hospital Road'), arterial: true });
    S('AR-H2', 'H2', 'S4', 'expressway', { name: T('طريق المركز الجراحي', 'Trauma Centre Highway'), arterial: true });
    return { nodes: nodes, segs: segs };
  }

  // Responder assets: all FICTIONAL ("demo"), placed at the map edge or beyond it. Capability flags are explicit.
  var ASSETS = [
    { id: 'F1', kind: 'fire', node: 'F1', rescue: true, hazmat: false, name: T('محطة الدفاع المدني (أ) — تجريبية', 'Civil Defence Station A (demo)') },
    { id: 'F2', kind: 'fire', node: 'F2', rescue: true, hazmat: true, name: T('محطة الإنقاذ والمواد الخطرة (ب) — تجريبية', 'Rescue & HazMat Station B (demo)') },
    { id: 'P1', kind: 'police', node: 'P1', name: T('مركز الشرطة (1) — تجريبي', 'Police post 1 (demo)') },
    { id: 'P2', kind: 'police', node: 'P2', name: T('مركز الشرطة (2) — تجريبي', 'Police post 2 (demo)') },
    { id: 'A1', kind: 'ambulance', node: 'A1', name: T('نقطة الإسعاف — تجريبية', 'Ambulance point (demo)') },
    { id: 'A2', kind: 'ambulance', node: 'H1', name: T('إسعاف مستشفى النخيل — تجريبي', 'Nakheel Hospital ambulance (demo)') },
    { id: 'H1', kind: 'hospital', node: 'H1', ed: true, trauma: false, paed: true, beds: 14, name: T('مستشفى النخيل — تجريبي', 'Nakheel Hospital (demo)') },
    { id: 'H2', kind: 'hospital', node: 'H2', ed: true, trauma: true, paed: false, beds: 10, name: T('المركز الجراحي للطوارئ — تجريبي', 'Emergency Trauma Centre (demo)') }
  ];
  var WORLD = null;
  function buildWorld() {
    var kind = new Uint8Array(NC), walk = new Uint8Array(NC).fill(1), fuel = new Uint8Array(NC), bld = new Uint8Array(NC);
    var shl = new Int16Array(NC).fill(-1), elev = new Float32Array(NC);
    var x, y, i;
    var rect = function (x0, y0, x1, y1, fn) { for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) fn(xx, yy, yy * W + xx); };
    rect(26, 34, 46, 50, function (xx, yy, c) { kind[c] = K.PARK; });
    rect(4, 18, 21, 29, function (xx, yy, c) { kind[c] = K.YARD; });
    rect(75, 12, 92, 29, function (xx, yy, c) { kind[c] = K.SITE; });
    [10, 31, 54].forEach(function (ry) { rect(0, ry - 1, W - 1, ry + 1, function (xx, yy, c) { kind[c] = K.ROAD; }); });
    [[1, 0, 63], [24, 10, 54], [48, 10, 54], [72, 10, 54], [94, 0, 63]].forEach(function (v) {
      rect(v[0] - 1, v[1], v[0] + 1, v[2], function (xx, yy, c) { kind[c] = K.ROAD; });
    });
    var building = function (id, x0, y0, x1, y1) { rect(x0, y0, x1, y1, function (xx, yy, c) { kind[c] = K.BUILDING; walk[c] = 0; bld[c] = id; fuel[c] = 0; }); };
    building(1, 55, 17, 63, 21);      // residence
    building(2, 4, 13, 13, 17);       // school
    building(3, 28, 14, 35, 21);      // mosque
    building(4, 37, 14, 45, 21);      // shops (drone dock on the roof)
    building(5, 57, 36, 62, 40);      // LPG store
    building(6, 76, 36, 90, 44);      // souq (shops)
    building(7, 86, 13, 90, 16);      // site office
    building(8, 87, 25, 88, 26);      // cooling container
    // fuel
    rect(26, 34, 46, 50, function (xx, yy, c) { if (walk[c] && hr(7, xx, yy, 1) < 0.45) fuel[c] = FUEL.SHRUB; });
    rect(51, 24, 57, 27, function (xx, yy, c) { if (hr(8, xx, yy, 2) < 0.5) fuel[c] = FUEL.VEHICLE; });
    rect(61, 24, 65, 27, function (xx, yy, c) { if (hr(8, xx, yy, 3) < 0.5) fuel[c] = FUEL.VEHICLE; });
    rect(77, 14, 84, 22, function (xx, yy, c) { if (hr(9, xx, yy, 4) < 0.8) fuel[c] = FUEL.MATERIAL; });
    // terrain (+ a low plinth under the residence)
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) elev[y * W + x] = elevAt(x, y) + (bld[y * W + x] === 1 ? 0.35 : 0);

    var assembly = [
      { id: 'APA', x: 67, y: 28, name: T('نقطة التجمع أ — ساحة السكن الشرقية', 'Assembly A — residence forecourt east') },
      { id: 'APB', x: 36, y: 25, name: T('نقطة التجمع ب — ساحة المسجد', 'Assembly B — mosque plaza') },
      { id: 'APC', x: 14, y: 25, name: T('نقطة التجمع ج — ساحة المدرسة', 'Assembly C — school yard') },
      { id: 'APD', x: 82, y: 48, name: T('نقطة التجمع د — ساحة السوق الجنوبية', 'Assembly D — souq south square') },
      { id: 'APE', x: 84, y: 28, name: T('نقطة تجمع موقع البناء', 'Worksite muster point') },
      { id: 'APF', x: 48, y: 5, name: T('نقطة التجمع هـ — الأرض المرتفعة شمالاً', 'Assembly E — high ground north') }
    ];
    assembly.forEach(function (a, k) { a.idx = k; var c = a.y * W + a.x; fuel[c] = 0; });
    var shelters = [
      { id: 'mosque', x: 31, y: 22, cool: true, name: T('المسجد (مكيّف)', 'Mosque (air-conditioned)') },
      { id: 'shops', x: 41, y: 22, cool: true, name: T('المحال التجارية (مكيّفة)', 'Shops (air-conditioned)') },
      { id: 'souq', x: 83, y: 35, cool: true, name: T('السوق (مكيّف)', 'Souq (air-conditioned)') },
      { id: 'cool', x: 87, y: 27, cool: true, name: T('حاوية التبريد في موقع البناء', 'Worksite cooling container') }
    ];
    shelters.forEach(function (s, k) { s.idx = k; shl[s.y * W + s.x] = k; });

    var structs = [buildResidence(0, 0), buildSchool(1, 4)];
    var exits = []; structs.forEach(function (S) { S.exits.forEach(function (e) { e.struct = S.idx; exits[e.gi] = e; }); });

    // ---- unified routing graph: grid cells + indoor nodes
    var base = NC, total = NC;
    structs.forEach(function (S) { S.base = total; total += S.nodes.length; });
    var nx = new Float32Array(total), ny = new Float32Array(total), nfl = new Int8Array(total), nst = new Int8Array(total).fill(-1), ntype = new Uint8Array(total);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { i = y * W + x; nx[i] = x + 0.5; ny[i] = y + 0.5; }
    structs.forEach(function (S) { S.nodes.forEach(function (n) { var g = S.base + n.local; n.g = g; nx[g] = n.x; ny[g] = n.y; nfl[g] = n.fl; nst[g] = S.idx; ntype[g] = n.type; }); });
    var from = [], to = [], len = [], flag = [], exi = [], doo = [];
    var addE = function (a, b, l, f, ex, dr) { from.push(a); to.push(b); len.push(l); flag.push(f); exi.push(ex); doo.push(dr); };
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!walk[i]) continue;
      for (var d = 0; d < 8; d++) {
        var xx = x + DIRS[d][0], yy = y + DIRS[d][1];
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !walk[yy * W + xx]) continue;
        if (d >= 4 && (!walk[y * W + xx] || !walk[yy * W + x])) continue;
        addE(i, yy * W + xx, d < 4 ? CELL : CELL * 1.41421356, 0, -1, -1);
      }
    }
    structs.forEach(function (S) {
      S.edges.forEach(function (e) {
        var ga = S.base + e.a, gb = S.base + e.b;
        addE(ga, gb, e.len, e.flag, -1, e.door >= 0 ? S.idx * 1000 + e.door : -1);
        addE(gb, ga, e.len, e.flag, -1, e.door >= 0 ? S.idx * 1000 + e.door : -1);
      });
      S.exitEdges.forEach(function (pair) {
        var ex = S.exits[pair[1]], ga = S.base + S.byId[pair[0]].local, go = ex.out.y * W + ex.out.x;
        addE(ga, go, 3, F_EXIT, ex.gi, -1); addE(go, ga, 3, F_EXIT, ex.gi, -1);
        ex.nodeG = ga; ex.outG = go;
      });
      if (S.roofEdge) {
        var ge = S.exits[3], ga2 = S.base + S.byId[S.roofEdge[0]].local, gr = S.base + S.byId[S.roofEdge[1]].local;
        addE(ga2, gr, 3, F_EXIT, ge.gi, -1); addE(gr, ga2, 3, F_EXIT, ge.gi, -1);
        ge.nodeG = ga2; ge.outG = gr;
      }
      S.exits.forEach(function (ex) { ex.shaftG = ex.shaft.map(function (id) { return S.base + S.byId[id].local; }); });
    });
    var E = from.length, eStart = new Int32Array(total + 1), order = new Int32Array(E);
    for (i = 0; i < E; i++) eStart[from[i] + 1]++;
    for (i = 0; i < total; i++) eStart[i + 1] += eStart[i];
    var fill = eStart.slice(0, total);
    for (i = 0; i < E; i++) order[fill[from[i]]++] = i;
    var eTo = new Int32Array(E), eLen = new Float32Array(E), eFlag = new Uint8Array(E), eExit = new Int16Array(E), eDoor = new Int32Array(E), eFrom = new Int32Array(E);
    for (i = 0; i < E; i++) { var o = order[i]; eTo[i] = to[o]; eLen[i] = len[o]; eFlag[i] = flag[o]; eExit[i] = exi[o]; eDoor[i] = doo[o]; eFrom[i] = from[o]; }
    var G = { N: total, E: E, eStart: eStart, eTo: eTo, eLen: eLen, eFlag: eFlag, eExit: eExit, eDoor: eDoor, eFrom: eFrom, nx: nx, ny: ny, nfl: nfl, nst: nst, ntype: ntype };

    // assembly / shelter graph nodes
    assembly.forEach(function (a) { a.g = a.y * W + a.x; });
    shelters.forEach(function (s) { s.g = s.y * W + s.x; });

    var roads = makeRoadGraph(buildRoadSpec());

    var assets = ASSETS.map(function (a) { var n = roads.byId[a.node], c = {}; for (var k in a) c[k] = a[k]; c.pos = { x: n.x, y: n.y }; c.edgePos = { x: clamp(n.x, 0, W - 1), y: clamp(n.y, 0, H - 1) }; return c; });

    return { W: W, H: H, cellM: CELL, kind: kind, walk: walk, fuel: fuel, bld: bld, shl: shl, elev: elev, assembly: assembly, shelters: shelters,
      structs: structs, exits: exits, G: G, roads: roads, assets: assets,
      dock: { x: 41, y: 17 }, lpg: { x: 59.5, y: 38 }, underpass: { x: 24, y: 42 }, parkAt: { x: 36, y: 40 }, site: { x: 82, y: 22 },
      outerBox: { x0: 0, y0: 0, x1: W - 1, y1: H - 1 } };
  }
  function world() { return WORLD || (WORLD = buildWorld()); }

  /* ====================================================================================
   * 4. ROUTING: multi-source Dijkstra over the unified graph (grid cells + indoor nodes)
   *    cost(v -> u) = length * (stairs? stairFactor) * (1 + pen[u]) ; nodes with blk[u] cannot be entered; exits can be blocked.
   *    The search runs BACKWARDS from the safe targets, so one run gives the cost-to-safety of every node.
   * ==================================================================================== */
  var ROUTER = null;
  function router() {
    if (ROUTER) return ROUTER;
    var G = world().G, heap = makeHeap(G.E + G.N + 64), isT = new Uint8Array(G.N);
    ROUTER = {
      run: function (dist, targets, pen, blk, opt) {
        opt = opt || {};
        var eStart = G.eStart, eTo = G.eTo, eLen = G.eLen, eFlag = G.eFlag, eExit = G.eExit, i;
        var noStairs = !!opt.noStairs, stairF = opt.stairFactor || 1.5, exB = opt.exitBlock || null, exP = opt.exitPen || null;
        dist.fill(Infinity); isT.fill(0); heap.clear();
        for (i = 0; i < targets.length; i++) { var t = targets[i]; if (t.off < dist[t.g]) { dist[t.g] = t.off; heap.push(t.off, t.g); } isT[t.g] = 1; }
        var need = opt.need || null, left = opt.needCount || 0;   // optional early stop: once every node in `need` is settled the rest of the map is not needed
        while (heap.size() > 0) {
          var u = heap.pop(), d = heap.popKey;
          if (d > dist[u]) continue;
          if (need && need[u]) { need[u] = 2; if (--left <= 0) break; }
          if (blk && blk[u] && !isT[u]) continue;
          var pu = pen ? 1 + pen[u] : 1;
          for (var e = eStart[u], eEnd = eStart[u + 1]; e < eEnd; e++) {
            var fl = eFlag[e], c = eLen[e] * pu;
            if (fl) {
              if (fl & F_STAIRS) { if (noStairs) continue; c *= stairF; }
              if (fl & F_EXIT) { var ex = eExit[e]; if (exB && exB[ex]) continue; if (exP) c *= 1 + exP[ex]; }
            }
            var v = eTo[e], nd = d + c;
            if (nd < dist[v]) { dist[v] = nd; heap.push(nd, v); }
          }
        }
        return dist;
      },
      // best neighbour of node u under the field `dist` (same cost rules as run()). Returns -1 when none improves.
      next: function (u, dist, pen, blk, opt) {
        opt = opt || {};
        var eStart = G.eStart, eTo = G.eTo, eLen = G.eLen, eFlag = G.eFlag, eExit = G.eExit;
        var noStairs = !!opt.noStairs, stairF = opt.stairFactor || 1.5, exB = opt.exitBlock || null, avoid = opt.avoid || null, prev = opt.prev === undefined ? -1 : opt.prev;
        var best = -1, bestV = Infinity, bestImp = -1, bestImpV = Infinity, du = dist[u] - 1e-4;
        for (var e = eStart[u], eEnd = eStart[u + 1]; e < eEnd; e++) {
          var v = eTo[e], fl = eFlag[e], c = eLen[e];
          if (fl) {
            if (fl & F_STAIRS) { if (noStairs) continue; c *= stairF; }
            if (fl & F_EXIT) { if (exB && exB[eExit[e]]) continue; }
          }
          if (blk && blk[v]) continue;
          if (avoid && avoid[v]) continue;
          if (pen) c *= 1 + pen[v];
          var val = c + dist[v];
          if (dist[v] < du && val < bestImpV) { bestImpV = val; bestImp = v; }
          if (v !== prev && val < bestV) { bestV = val; best = v; }
        }
        return bestImp >= 0 ? bestImp : (opt.detour ? best : -1);
      },
      edge: function (u, v) { for (var e = G.eStart[u], eEnd = G.eStart[u + 1]; e < eEnd; e++) if (G.eTo[e] === v) return e; return -1; },
      G: G
    };
    return ROUTER;
  }

  /* ====================================================================================
   * 5. SCENARIO PRESETS, EVENT LOG, SIM CREATION, POPULATION
   * ==================================================================================== */
  var DEMO_AREA = T('الحيّ التجريبي (محاكاة)', 'Demo district (simulation)');
  var PRESETS = {
    'fire-night': { id: 'fire-night', hazard: 'fire', hour: 4.0, tIgnite: 30, durationSec: 1200, wind: { deg: 315, speed: 4 }, struct: 0, room: 'R202', scene: 'BLD', scope: ['RB'],
      name: T('حريق ليلاً (04:00)', 'Fire at night (04:00)'),
      blurb: T('حريق في غرفة بالطابق الثاني من سكن العمال والجميع نيام وباب السطح مقفل.', 'A room fire on the second floor of the workers\' residence; everyone asleep and the roof door locked.'),
      incident: T('حريق في سكن العمال', 'Fire in the workers\' residence') },
    'gas-night': { id: 'gas-night', hazard: 'gas', hour: 4.0, tIgnite: 30, durationSec: 1200, wind: { deg: 185, speed: 3 }, scene: 'LPGN', scope: ['RB'], gasType: 'lpg',
      name: T('تسرّب غاز ليلاً (04:00)', 'Gas leak at night (04:00)'),
      blurb: T('تسرّب غاز البترول المسال من مخزن الغاز والرياح تحمله نحو السكن.', 'An LPG leak at the gas store with the wind carrying it toward the residence.'),
      incident: T('تسرّب غاز', 'Gas leak') },
    'flood-day': { id: 'flood-day', hazard: 'flood', hour: 10.5, tIgnite: 0, durationSec: 1800, wind: { deg: 250, speed: 6 }, scene: 'M1', scope: ['RB', 'SCH'],
      name: T('سيول نهاراً (10:30)', 'Flash flood by day (10:30)'),
      blurb: T('أمطار غزيرة والنفق المنخفض يمتلئ أولاً بينما يصل المارّة إليه.', 'Heavy rain; the low underpass fills first while people keep arriving at it.'),
      incident: T('سيول وغمر النفق', 'Flash flood at the underpass') },
    'dust-day': { id: 'dust-day', hazard: 'dust', hour: 12.0, tIgnite: 0, durationSec: 1500, wind: { deg: 315, speed: 8 }, scene: 'M2', scope: ['RB', 'SCH'],
      name: T('عاصفة غبارية نهاراً (12:00)', 'Dust storm by day (12:00)'),
      blurb: T('جبهة غبار تتقدّم من الشمال الغربي ومن في الخارج يحتاجون مأوى.', 'A dust front advancing from the north-west; people outdoors need shelter.'),
      incident: T('عاصفة غبارية', 'Dust storm') },
    'heat-day': { id: 'heat-day', hazard: 'heat', hour: 10.5, tIgnite: 0, durationSec: 4200, wind: { deg: 315, speed: 2 }, scene: 'SITE', scope: ['RB', 'SCH'],
      name: T('إجهاد حراري في موقع العمل (10:30)', 'Heat at the worksite (10:30)'),
      blurb: T('الحرارة ترتفع والعمال في الشمس بلا إنذار حتى ينهار أحدهم.', 'The heat rises and workers stay in the sun with no warning until one collapses.'),
      incident: T('إجهاد حراري في موقع البناء', 'Heat stress at the construction site') },
    'sos-day': { id: 'sos-day', hazard: 'sos', hour: 10.67, tIgnite: 20, durationSec: 1500, wind: { deg: 315, speed: 3 }, scene: 'PARK', scope: ['RB'],
      name: T('شخص يحتاج مساعدة (10:40)', 'Someone needs help (10:40)'),
      blurb: T('مسنّ ينهار في الحديقة ولا يستطيع الاتصال؛ الدقائق الأولى تحسم كل شيء.', 'An older man collapses in the park and cannot call; the first minutes decide everything.'),
      incident: T('شخص يحتاج مساعدة طبية', 'Person needs medical help') },
    'school-fire-day': { id: 'school-fire-day', hazard: 'fire', hour: 7.5, tIgnite: 30, durationSec: 1200, wind: { deg: 315, speed: 4 }, struct: 1, room: 'Q03', scene: 'SCH', scope: ['SCH'],
      jams: { 'AR-W': { f: 0.25, label: T('أعمال طريق على الشريان الغربي (محاكاة)', 'Road works on the West Arterial (SIM)') } },
      name: T('حريق في المدرسة (07:30)', 'School fire (07:30)'),
      blurb: T('حريق في المقصف عند بداية اليوم الدراسي: طابور التوصيل وأعمال طريق على الشريان الغربي، فتصل محطة الإطفاء الأبعد أولاً.', 'A canteen fire as the school day starts: drop-off queue plus road works on the West Arterial, so the farther fire station arrives first.'),
      incident: T('حريق في المدرسة', 'School fire') },
    // the robot scenario (NOT part of PRESET_ORDER: the seven original presets and their results stay exactly as they were; see PRESET_ORDER_ALL)
    'fire-night-robot': { id: 'fire-night-robot', hazard: 'fire', hour: 4.0, tIgnite: 30, durationSec: 1500, wind: { deg: 315, speed: 4 }, struct: 0, room: 'R303', scene: 'BLD', scope: ['RB'],
      robot: { enabled: true, variant: 'tracked', units: 1 },
      locks: ['A'], lockedDoors: ['R308'], heroStart: { 'abu-salem': { node: 'C20', app: false, awake: true, immobile: true } },
      name: T('حريق ليلاً مع روبوت الإنقاذ (04:00)', 'Fire at night with the rescue robot (04:00)'),
      blurb: T('حريق في غرفة بالطابق الثالث من سكن العمال ليلاً والمخرج السفلي للدرج «أ» مقفل. أبو سالم (كرسي متحرك) مستيقظ لكنه عالق في ممر الطابق نفسه الذي يمتلئ بالدخان وهاتفه في غرفته. بعد اعتماد قائد الحادث يدخل الروبوت ويبحث ويُبلغ عمّن يجده (محاكاة لمفهوم).',
        'A third-floor room fire in the workers\' residence at night with the foot of Stair A locked. Abu Salem (wheelchair) is awake but stuck in the same floor\'s corridor, which fills with smoke, and his phone is in his room. After the incident commander approves, the robot goes in, searches and reports who it finds (a simulated concept).'),
      incident: T('حريق في سكن العمال — بحث بالروبوت', 'Fire in the workers\' residence — robot search') }
  };
  var PRESET_ORDER = ['fire-night', 'gas-night', 'flood-day', 'dust-day', 'heat-day', 'sos-day', 'school-fire-day'];
  var PRESET_ORDER_ROBOT = ['fire-night-robot'];
  var PRESET_ORDER_ALL = PRESET_ORDER.concat(PRESET_ORDER_ROBOT);

  function evt(sim, type, data, ar, en) {
    var e = { t: sim.t, type: type };
    if (data) for (var k in data) e[k] = data[k];
    e.text = T(ar || type, en || type);
    if (sim.events.length < 4000) sim.events.push(e);
    sim.evCount[type] = (sim.evCount[type] || 0) + 1;
    return e;
  }

  function newExits(w) {
    return w.exits.map(function (e) {
      return { gi: e.gi, id: e.id, struct: e.struct, name: e.name, kind: e.kind, locked: false, state: 'OPEN', since: 0 };
    });
  }

  function create(opts) {
    opts = opts || {};
    var presetId = opts.preset || 'fire-night';
    var pre = PRESETS[presetId];
    if (!pre) throw new Error('ManaraSim: unknown preset ' + presetId);
    var w = world();
    var P = resolveParams(opts.params);
    var sim = {
      opts: cloneJSON({ preset: presetId, mode: opts.mode, seed: opts.seed, params: opts.params || {}, hour: opts.hour, wind: opts.wind, gasType: opts.gasType, autoApprove: opts.autoApprove, tIgnite: opts.tIgnite, durationSec: opts.durationSec, robot: opts.robot, role: opts.role }),
      v: 1, preset: presetId, pre: pre, hazard: pre.hazard, mode: opts.mode === 'ordinary' ? 'ordinary' : 'manara',
      seed: ((opts.seed === undefined ? 1 : opts.seed) >>> 0) || 1, P: P, W: w, t: 0, acc: 0,
      hour0: isNum(opts.hour) ? opts.hour : pre.hour, wind: null, events: [], evCount: {}, done: false, doneAt: null,
      tIgnite: isNum(opts.tIgnite) ? opts.tIgnite : pre.tIgnite, durationSec: isNum(opts.durationSec) ? opts.durationSec : pre.durationSec
    };
    if (opts.autoApprove !== undefined) P.autoApprove = opts.autoApprove ? 1 : 0;
    if (pre.hazard === 'gas') {   // gas type sets the danger levels / heaviness unless the caller passed them explicitly
      var gt = GAS_TYPES[opts.gasType || pre.gasType || 'lpg'], ov = opts.params || {};
      pre = sim.pre = cloneJSON(pre); pre.gasType = opts.gasType || pre.gasType || 'lpg';
      if (ov.gasWarn === undefined) P.gasWarn = gt.warn;
      if (ov.gasDanger === undefined) P.gasDanger = gt.danger;
      if (ov.gasHeavy === undefined) P.gasHeavy = gt.heavy;
    }
    setWindInternal(sim, opts.wind || pre.wind);
    // physical state
    sim.F = { smoke: new Float32Array(NC), gas: new Float32Array(NC), water: new Float32Array(NC), dust: new Float32Array(NC) };
    sim.ofire = new Uint8Array(NC); sim.oburn = new Uint16Array(NC);
    sim.stt = w.structs.map(function (S) {
      var n = S.nodes.length;
      return { burn: new Uint8Array(n), burnT: new Float32Array(n), I: new Float32Array(n), smoke: new Float32Array(n), gas: new Float32Array(n),
        vegF: new Float32Array(n), denF: new Float32Array(n), flash: new Uint8Array(n), doorOpen: new Uint8Array(S.doors) };
    });
    sim.exits = newExits(w);
    w.exits.forEach(function (e, i) { if (e.lock0 && P.roofLocked) sim.exits[i].locked = true; });
    applyPresetScenario(sim);
    sim.hz = { type: pre.hazard, started: false, ended: false, tStart: null };
    sim.local = { on: false, at: null, zone: null, until: null, ack: false };
    sim.ver = { phase: 'idle', suspectAt: null, confirmedAt: null, approvedAt: null, publicAt: null, clearedAt: null, zone: null, keysNow: [], needsApproval: false, history: [] };
    sim.alert = null;
    sim.cordon = { active: false, at: null };
    sim.people = []; sim.byKey = {}; sim.heroes = {};
    populate(sim);
    applyHeroStart(sim);
    initHazard(sim);
    initSensors(sim);
    initRouting(sim);
    initDrone(sim);
    initTraffic(sim);
    initRobot(sim, opts);
    initMetrics(sim);
    if (pre.jams) for (var jk in pre.jams) { sim.traffic.jams[jk] = pre.jams[jk].f; evt(sim, 'scenario-jam', { seg: jk }, 'ظرف السيناريو: ' + pre.jams[jk].label.ar, 'Scenario condition: ' + pre.jams[jk].label.en); }
    evt(sim, 'start', { preset: presetId, mode: sim.mode, seed: sim.seed }, 'بدأت المحاكاة: ' + pre.name.ar, 'Simulation started: ' + pre.name.en);
    return sim;
  }

  function setWindInternal(sim, wind) {
    var deg = isNum(wind.deg) ? wind.deg : 315, speed = isNum(wind.speed) ? wind.speed : 3;
    // wind blows FROM deg; it moves air toward deg+180. x east, y south (north-up map).
    var to = (deg + 180) * DEG;
    sim.wind = { deg: deg, speed: speed, ux: Math.sin(to), uy: -Math.cos(to) };
  }

  // ---------------------------------------------------------------- people
  var LANG_W = [['hi', 0.18], ['ml', 0.15], ['ne', 0.17], ['bn', 0.14], ['ur', 0.10], ['tl', 0.10], ['en', 0.08], ['ar', 0.08]];   // illustrative demo mix, NOT demographic data
  function pickLang(u) { var c = 0; for (var i = 0; i < LANG_W.length; i++) { c += LANG_W[i][1]; if (u < c) return LANG_W[i][0]; } return 'ar'; }
  var SPEED = { adult: 1.4, elderly: 0.9, child: 1.0, wheelchair: 0.8 };   // m/s, assumptions (scaled by param walkScale)

  function addPerson(sim, proto) {
    var id = sim.people.length;
    var a = {
      id: id, key: proto.key || ('p' + id), name: null, role: 'resident', group: null, persona: 'adult', deaf: false, blind: false, asthma: false,
      lang: 'ar', room: null, cls: null, hero: null, registered: false, app: false, volunteer: false, follow: -1, escort: -1,
      loc: 'room', home: -1, g: -1, ox: 0, oy: 0, asleep: false, away: false, speedBase: 1.4,
      st: 'idle', aware: 0, awareAt: -1, awareSrc: '', moveAt: -1, plan: 'none', prev: -1, to: -1, prog: 0, edgeLen: 0, wokeAt: null,
      dose: 0, exposedSec: 0, enteredDangerAt: null, safeAt: null, firstSafeAt: null, safeKind: null, injured: false, downAt: null,
      alertAt: null, alertSrc: '', ladderStage: -1, ladderLog: [], ladderStopAt: null, checkin: null, checkinAt: null, checkinPlanned: null,
      badExits: 0, strain: 0, tol: 1, trip: -1, cordonSeen: false, helpAt: null, pre: false, msg: null
    };
    for (var k in proto) a[k] = proto[k];
    a.speedBase = SPEED[a.persona] * (a.blind ? 0.85 : 1);
    sim.people.push(a); sim.byKey[a.key] = a;
    return a;
  }

  function siteCells(w) {
    var list = [];
    for (var y = 17; y <= 29; y++) for (var x = 76; x <= 91; x++) { var c = y * W + x; if (w.walk[c] && w.kind[c] === K.SITE && !w.fuel[c]) list.push(c); }
    return list;
  }
  function openCells(w, x0, y0, x1, y1, kindOnly) {
    var list = [];
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { var c = y * W + x; if (w.walk[c] && !w.fuel[c] && (kindOnly === undefined || w.kind[c] === kindOnly)) list.push(c); }
    return list;
  }

  function populate(sim) {
    var w = sim.W, P = sim.P, seed = sim.seed, hour = sim.hour0;
    var night = hour < 5.5 || hour >= 21;
    var RB = w.structs[0], SCH = w.structs[1];
    var u = function (id, k) { return hr(seed, D.PERSON, id, k); };
    // ---- the 120 registered residents of the residence, room by room
    var rooms = RB.nodes.filter(function (n) { return n.type === NT.ROOM; });
    var capByRoom = {}, five = rooms.filter(function (n) { return n.id !== 'R106'; }).map(function (n) { return { n: n, r: hr(seed, D.PERSON, n.local, 77) }; });
    five.sort(function (a, b) { return a.r - b.r; });
    rooms.forEach(function (n) { capByRoom[n.id] = n.id === 'R106' ? 3 : 4; });
    for (var i = 0; i < 5; i++) capByRoom[five[i].n.id] = 5;
    var cats = {};   // deterministic category assignment among non-hero residents
    var resList = [];
    rooms.forEach(function (n) { for (var k = 0; k < capByRoom[n.id]; k++) resList.push({ room: n, slot: k }); });
    var heroSlots = { 'R203': 'ravi', 'R105': 'huda', 'R302': 'abu-salem' };
    var order = resList.map(function (r, idx) { return { idx: idx, r: hr(seed, D.PERSON, idx, 88) }; }).sort(function (a, b) { return a.r - b.r; });
    var take = function (cat, n, filt) {
      var c = 0;
      for (var q = 0; q < order.length && c < n; q++) {
        var rr = resList[order[q].idx];
        if (rr.hero || cats[order[q].idx] || (filt && !filt(rr))) continue;
        cats[order[q].idx] = cat; c++;
      }
    };
    var seenHero = {};
    resList.forEach(function (r) { if (heroSlots[r.room.id] && !seenHero[r.room.id]) { seenHero[r.room.id] = 1; r.hero = heroSlots[r.room.id]; } if (r.room.id === 'R106' && r.slot === 2) r.hero = 'lina'; });
    take('wheelchair', 1, function (r) { return r.room.fl === 0 && r.room.id !== 'R106'; });
    take('elderly', 5); take('deaf', 2); take('blind', 1);
    var nRes = resList.length;
    // schedule
    var site = siteCells(w), idxSite = 0;
    resList.forEach(function (r, idx) {
      var n = r.room, cat = cats[idx] || null, hero = r.hero || null;
      var key = hero ? hero : ('res-' + (idx + 1 < 10 ? '00' : idx + 1 < 100 ? '0' : '') + (idx + 1));
      var proto = { key: key, role: 'resident', group: 'RB', registered: true, room: n.room, home: n.g, hero: hero };
      var lang = pickLang(u(idx, 1));
      proto.lang = lang;
      if (cat === 'wheelchair') proto.persona = 'wheelchair';
      if (cat === 'elderly') proto.persona = 'elderly';
      if (cat === 'deaf') proto.deaf = true;
      if (cat === 'blind') proto.blind = true;
      if (hero === 'ravi') { proto.name = T('رافي', 'Ravi'); proto.lang = 'ml'; }
      if (hero === 'huda') { proto.name = T('هدى', 'Huda'); proto.lang = 'ar'; proto.deaf = true; }
      if (hero === 'abu-salem') { proto.name = T('أبو سالم', 'Abu Salem'); proto.lang = 'ar'; proto.persona = 'wheelchair'; }
      if (hero === 'lina') { proto.name = T('لينا', 'Lina'); proto.lang = 'ar'; proto.persona = 'child'; }
      if (hero && hero !== 'lina') proto.registered = true;
      if (u(idx, 2) < 0.06 && !hero) proto.asthma = true;
      proto.tol = 0.75 + 0.5 * u(idx, 3);
      proto.app = hero ? hero !== 'lina' : (u(idx, 4) < P.phoneAppPct / 100);
      var sched;                                   // 'room' | 'site' | 'away'
      if (night) sched = hero || u(idx, 5) >= 0.10 ? 'room' : 'away';
      else {
        var s = u(idx, 5);
        sched = s < 0.35 ? 'site' : s < 0.65 ? 'away' : 'room';
        if (hero === 'ravi') sched = 'site';
        if (hero === 'huda' || hero === 'abu-salem') sched = 'room';
        if (hero === 'lina') sched = 'school';
        if (proto.persona === 'wheelchair' || proto.persona === 'elderly' || proto.deaf || proto.blind) sched = sched === 'site' ? 'room' : sched;
      }
      var a;
      if (sched === 'school') { a = null; r.agentProto = proto; return; }
      a = addPerson(sim, proto);
      if (hero) sim.heroes[hero] = a.id;
      if (sched === 'away') { a.away = true; a.loc = 'away'; a.st = 'away'; a.g = -1; }
      else if (sched === 'site') {
        a.loc = 'site'; a.g = site[Math.floor(u(idx, 6) * site.length) % site.length]; a.st = 'working'; a.asleep = false; idxSite++;
        a.ox = (u(idx, 7) - 0.5) * 0.6; a.oy = (u(idx, 8) - 0.5) * 0.6;
      } else {
        a.loc = 'room'; a.g = n.g;
        a.asleep = night ? (hero ? true : u(idx, 9) < P.nightAsleepPct / 100) : (u(idx, 9) < 0.25 && !hero && proto.persona === 'adult');
        a.ox = (u(idx, 7) - 0.5) * 0.8; a.oy = (u(idx, 8) - 0.5) * 0.5;
        if (!night && (hero === 'huda' || hero === 'abu-salem')) a.asleep = false;
      }
    });
    // Lina's family: the child follows her mother (the second adult in room 106)
    var r106 = sim.people.filter(function (p) { return p.room === '106'; });
    // the guard
    var guard = addPerson(sim, { key: 'guard', role: 'guard', persona: 'adult', lang: 'ar', loc: 'room', g: RB.byId['LOB'].g, app: true, registered: false, name: T('الحارس', 'Guard') });
    guard.group = null;
    // ---- the school (day only): 8 classes x 20 pupils, 8 teachers, 4 staff
    if (!night) {
      var classes = SCH.nodes.filter(function (n) { return n.type === NT.ROOM; });
      var peClass = (hour >= 9 && hour < 12.5) ? '3B' : null;
      var peCells = openCells(w, 8, 20, 18, 26, K.YARD);
      classes.forEach(function (cn, ci) {
        var teacher = addPerson(sim, { key: 'teacher-' + cn.cls, role: 'teacher', group: 'SCH', registered: true, persona: 'adult', lang: 'ar', app: true, cls: cn.cls,
          loc: cn.cls === peClass ? 'yard' : 'class', g: cn.g, name: T('معلّم/ة ' + cn.cls, 'Teacher ' + cn.cls) });
        if (cn.cls === peClass) { teacher.g = peCells[Math.floor(hr(seed, D.PERSON, 5000 + ci, 1) * peCells.length)]; }
        for (var k = 0; k < 20; k++) {
          var isLina = cn.cls === '5B' && k === 0;
          var pup;
          if (isLina) {
            pup = addPerson(sim, { key: 'lina', hero: 'lina', name: T('لينا', 'Lina'), role: 'pupil', group: 'SCH', registered: true, persona: 'child', lang: 'ar', app: false, cls: cn.cls, loc: 'class', g: cn.g, follow: teacher.id });
            sim.heroes['lina'] = pup.id;
          } else {
            pup = addPerson(sim, { key: 'pupil-' + cn.cls + '-' + (k + 1), role: 'pupil', group: 'SCH', registered: true, persona: 'child',
              lang: hr(seed, D.PERSON, 6000 + ci * 20 + k, 1) < 0.85 ? 'ar' : 'en', app: false, cls: cn.cls, loc: cn.cls === peClass ? 'yard' : 'class', g: cn.g, follow: teacher.id });
          }
          pup.tol = 0.8 + 0.4 * hr(seed, D.PERSON, 6000 + ci * 20 + k, 2);
          if (hr(seed, D.PERSON, 6000 + ci * 20 + k, 3) < 0.07) pup.asthma = true;
          if (cn.cls === peClass) pup.g = peCells[Math.floor(hr(seed, D.PERSON, 6000 + ci * 20 + k, 4) * peCells.length)];
          pup.ox = (hr(seed, D.PERSON, 6000 + ci * 20 + k, 5) - 0.5) * 1.2; pup.oy = (hr(seed, D.PERSON, 6000 + ci * 20 + k, 6) - 0.5) * 0.8;
        }
      });
      [['office', 'SLOB'], ['canteen', 'Q03'], ['library', 'Q11'], ['security', 'SLOB']].forEach(function (s, k) {
        addPerson(sim, { key: 'staff-' + s[0], role: 'staff', group: 'SCH', registered: true, persona: 'adult', lang: 'ar', app: true, loc: 'class', g: SCH.byId[s[1]].g,
          name: T('موظف/ة المدرسة', 'School staff') });
      });
      // Lina's family flat is empty in the day (her mother is away)
    }
    // ---- shop staff, passers-by (unregistered), trained volunteers
    var shopCells = openCells(w, 36, 22, 46, 26).concat(openCells(w, 76, 45, 90, 48));
    var parkCells = openCells(w, 27, 35, 45, 49, K.PARK);
    var roadCells = openCells(w, 5, 30, 90, 32, K.ROAD);
    var outsiders = [];
    for (var s = 0; s < 8; s++) outsiders.push(addPerson(sim, { key: 'staff-shop-' + (s + 1), role: 'staff', persona: 'adult', lang: hr(seed, D.PERSON, 7000 + s, 1) < 0.5 ? 'ar' : 'ur', app: hr(seed, D.PERSON, 7000 + s, 2) < 0.6,
      loc: 'outdoor', g: shopCells[Math.floor(hr(seed, D.PERSON, 7000 + s, 3) * shopCells.length)], name: T('عامل محل', 'Shop worker') }));
    if (!night) {
      for (s = 0; s < 12; s++) {
        var pool = s < 6 ? parkCells : roadCells;
        outsiders.push(addPerson(sim, { key: 'passerby-' + (s + 1), role: 'passerby', persona: s % 5 === 4 ? 'elderly' : 'adult', lang: pickLang(hr(seed, D.PERSON, 7100 + s, 1)),
          app: false, loc: 'outdoor', g: pool[Math.floor(hr(seed, D.PERSON, 7100 + s, 3) * pool.length)], asthma: hr(seed, D.PERSON, 7100 + s, 4) < 0.1, name: T('مارّ', 'Passer-by') }));
      }
    }
    var victimP = null;
    if (sim.hazard === 'sos') { victimP = outsiders.filter(function (p) { return p.role === 'passerby'; })[0] || null; outsiders = outsiders.filter(function (p) { return p !== victimP; }); }
    // volunteers: trained first-aiders = the first `volunteers` awake outsiders (shop workers, passers-by) plus awake residents
    var nv = Math.round(P.volunteers), pickV = outsiders.slice();
    var awakeRes = sim.people.filter(function (p) { return p.role === 'resident' && !p.asleep && !p.away && p.persona === 'adult'; });
    pickV = pickV.concat(awakeRes.slice(0, 4));
    for (i = 0; i < pickV.length && nv > 0; i++) { pickV[i].volunteer = true; pickV[i].app = true; nv--; }
    // at night Lina sleeps in room 106 with her parents: she follows her mother (the first other adult in that room)
    var lina = sim.people[sim.heroes['lina']];
    if (lina && lina.role === 'resident') {
      var mother = sim.people.filter(function (p) { return p.room === '106' && p.hero !== 'lina' && p.role === 'resident'; })[0];
      lina.escort = mother ? mother.id : -1; lina.asleep = true; lina.ox = 0.2; lina.oy = 0.2;
    }
    // preset specifics
    if (sim.hazard === 'sos') {
      var el = victimP || addPerson(sim, { key: 'victim', role: 'passerby', persona: 'elderly', loc: 'outdoor', g: cellIdx(36, 40), lang: 'ar' });
      el.persona = 'elderly'; el.g = cellIdx(36, 40); el.app = true; el.key = 'victim'; el.name = T('مسنّ في الحديقة', 'Older man in the park'); el.volunteer = false; el.registered = false; el.speedBase = SPEED.elderly;
      sim.byKey['victim'] = el; sim.victim = el.id;
    }
    sim.people.forEach(function (p) {
      p.speed = p.speedBase * P.walkScale * (0.92 + 0.16 * hr(seed, D.PERSON, p.id, 40));
      p.rf = 0.5 + hr(seed, D.PERSON, p.id, 5);                   // personal reaction factor
      p.heatTol = 0.8 + 0.4 * hr(seed, D.HEAT, p.id, 1);
    });
    sim.nRegistered = sim.people.filter(function (p) { return p.registered && sim.pre.scope.indexOf(p.group) >= 0; }).length;
  }

  /* ====================================================================================
   * 6. HAZARD PHYSICS (shared field helpers) + FIRE & SMOKE
   *    Fire = cellular automaton in the published Alexandridis et al. (2008) form
   *      p_burn = p_h (1 + p_veg)(1 + p_den) p_w p_s ,   p_w = exp(c1 V) exp(c2 V (cos(theta) - 1)) ,   p_s = exp(a theta_s)
   *    (paper's p_0 = 0.58, c1 = 0.045, c2 = 0.131, a = 0.078; p_veg: agricultural -0.3 / shrubs 0 / pines +0.4; p_den: sparse -0.4 /
   *    normal 0 / dense +0.3; values as tabulated in Russo et al., Chem. Eng. Trans. 36 (2014) 253-258, DOI 10.3303/CET1436043).
   *    Outdoors the cells are 5 m grid cells with the real wind. INDOORS the same rule runs on the room graph (rooms/corridors/stairs
   *    are the "cells"); V is then the indoor draught and theta the angle between the spread direction and that draught.
   *    Not in the paper (named assumptions): door factors, flashover timing, smoke transport, suppression by a fire engine.
   * ==================================================================================== */
  function structAdj(S) {
    if (S.adj) return S.adj;
    S.adj = S.nodes.map(function () { return []; });
    S.edges.forEach(function (e) {
      S.adj[e.a].push({ to: e.b, flag: e.flag, door: e.door, len: e.len });
      S.adj[e.b].push({ to: e.a, flag: e.flag, door: e.door, len: e.len });
    });
    return S.adj;
  }

  // bounding box of the cells above `thr` (null when the field is empty): lets the field solvers skip empty space
  function fieldBox(f, thr) {
    var x0 = W, y0 = H, x1 = -1, y1 = -1, i = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++, i++) if (f[i] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  // semi-Lagrangian advection of a scalar field by a constant displacement (dx, dy cells per step), zero inflow at the borders
  function advectConst(src, dst, dx, dy) {
    dst.fill(0);
    var box = fieldBox(src, 1e-5); if (!box) return;
    var xa = Math.max(0, box.x0 + Math.floor(dx) - 2), xb = Math.min(W - 1, box.x1 + Math.ceil(dx) + 2), ya = Math.max(0, box.y0 + Math.floor(dy) - 2), yb = Math.min(H - 1, box.y1 + Math.ceil(dy) + 2);
    var x, y, sx, sy, ix, iy, fx, fy, a, b, c, d;
    for (y = ya; y <= yb; y++) {
      sy = y - dy; iy = Math.floor(sy); fy = sy - iy;
      var ry0 = iy >= 0 && iy < H, ry1 = iy + 1 >= 0 && iy + 1 < H;
      for (x = xa; x <= xb; x++) {
        sx = x - dx; ix = Math.floor(sx); fx = sx - ix;
        var rx0 = ix >= 0 && ix < W, rx1 = ix + 1 >= 0 && ix + 1 < W;
        a = (rx0 && ry0) ? src[iy * W + ix] : 0; b = (rx1 && ry0) ? src[iy * W + ix + 1] : 0;
        c = (rx0 && ry1) ? src[(iy + 1) * W + ix] : 0; d = (rx1 && ry1) ? src[(iy + 1) * W + ix + 1] : 0;
        dst[y * W + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      }
    }
  }
  function diffuse(f, tmp, kd, passes) {   // explicit 5-point diffusion, kd <= 0.2 per pass; only where the field lives
    var box = fieldBox(f, 1e-6); if (!box) return;
    var xa = Math.max(0, box.x0 - passes - 1), xb = Math.min(W - 1, box.x1 + passes + 1), ya = Math.max(0, box.y0 - passes - 1), yb = Math.min(H - 1, box.y1 + passes + 1);
    for (var p = 0; p < passes; p++) {
      var x, y, i;
      for (y = ya; y <= yb; y++) for (x = xa; x <= xb; x++) {
        i = y * W + x;
        var c = f[i], l = x > 0 ? f[i - 1] : c, r = x < W - 1 ? f[i + 1] : c, u = y > 0 ? f[i - W] : c, d = y < H - 1 ? f[i + W] : c;
        tmp[i] = c + kd * (l + r + u + d - 4 * c);
      }
      for (y = ya; y <= yb; y++) for (x = xa; x <= xb; x++) { i = y * W + x; f[i] = tmp[i]; }
    }
  }
  function fieldMax(f) { var m = 0; for (var i = 0; i < NC; i++) if (f[i] > m) m = f[i]; return m; }
  function sampleBilinear(f, x, y) {   // x, y in cell units (cell centres at +0.5)
    var sx = x - 0.5, sy = y - 0.5, ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    var g = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < W && yy < H ? f[yy * W + xx] : 0; };
    return (g(ix, iy) * (1 - fx) + g(ix + 1, iy) * fx) * (1 - fy) + (g(ix, iy + 1) * (1 - fx) + g(ix + 1, iy + 1) * fx) * fy;
  }
  // value of a field at a graph node (outdoor cell, or the footprint centre under an indoor node)
  function nodeCell(sim, g) {
    var G = sim.W.G;
    if (g < NC) return g;
    return clamp(Math.floor(G.ny[g]), 0, H - 1) * W + clamp(Math.floor(G.nx[g]), 0, W - 1);
  }

  // The published wind factor and burn probability (exported as ManaraSim.model so the report can show them and the tests can check them):
  //   p_w = exp(c1 V) exp(c2 V (cos(theta) - 1)) ;  p_burn = p_h (1 + p_veg)(1 + p_den) p_w p_s , p_s = exp(a theta_s[deg])
  function alexWind(V, cosT, c1, c2) { return Math.exp(c1 * V) * Math.exp(c2 * V * (cosT - 1)); }
  function alexBurn(P, pveg, pden, V, cosT, slopeDeg) { return Math.min(1, P.fireP0 * (1 + pveg) * (1 + pden) * alexWind(V, cosT, P.fireC1, P.fireC2) * Math.exp(P.fireSlopeA * (slopeDeg || 0))); }
  var FIRE_SMOKE_STEP = 3;   // seconds between smoke-field updates

  function initFire(sim) {
    var w = sim.W, hz = sim.hz, pre = sim.pre;
    hz.struct = pre.struct;
    var S = w.structs[hz.struct], st = sim.stt[hz.struct], adj = structAdj(S);
    hz.originLocal = S.byId[pre.room].local;
    hz.ignited = false; hz.steps = 0; hz.suppress = 0; hz.outList = []; hz.extinguishAt = null; hz.vented = 0; hz.burning = 0; hz.tOut = null;
    hz.place = pre.incident;
    // p_veg / p_den per node from the use of the room and how many people sleep there
    var occ = {};
    sim.people.forEach(function (p) { if (p.room && p.loc === 'room') occ[p.room] = (occ[p.room] || 0) + 1; });
    S.nodes.forEach(function (n, i) {
      var veg = -0.3, den = -0.4;
      if (n.type === NT.ROOM) {
        if (S.id === 'RB') { var k = occ[n.room] || 4; veg = 0.2; den = k >= 5 ? 0.3 : k >= 4 ? 0.0 : -0.4; }
        else { veg = 0.1; den = 0.3; }
      } else if (n.type === NT.SUPPORT) { veg = n.fuel > 0.25 ? 0.4 : 0.1; den = n.fuel > 0.25 ? 0.3 : 0.0; }
      else if (n.type === NT.LOBBY) { veg = 0.1; den = 0.0; }
      st.vegF[i] = veg; st.denF[i] = den;
    });
    sim.tmpA = new Float32Array(NC); sim.tmpB = new Float32Array(NC);
  }

  function windVec3(sim, S) {   // indoor draught vector (m/s): horizontal part from the outdoor wind, vertical part from the stairwell updraft
    var P = sim.P, v = sim.wind.speed * P.draughtPct / 100;
    return { x: sim.wind.ux * v, y: sim.wind.uy * v, z: P.stackMps };
  }

  function fireSpreadStructure(sim) {
    var P = sim.P, hz = sim.hz, w = sim.W, S = w.structs[hz.struct], st = sim.stt[hz.struct], adj = structAdj(S), n = S.nodes.length;
    var wv = windVec3(sim, S), V = Math.sqrt(wv.x * wv.x + wv.y * wv.y + wv.z * wv.z), supF = 1 - (P.engineEffectPct / 100) * (hz.suppress > 0 ? 1 : 0);
    var ign = [];
    hz.steps++;
    for (var i = 0; i < n; i++) {
      if (st.burn[i] !== 1 || st.I[i] < 0.6) continue;
      var u = S.nodes[i], list = adj[i];
      for (var k = 0; k < list.length; k++) {
        var a = list[k], j = a.to;
        if (st.burn[j] !== 0) continue;
        var v = S.nodes[j];
        var dx = (v.x - u.x) * CELL, dy = (v.y - u.y) * CELL, dz = (v.fl - u.fl) * 3.0;
        var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        var cosT = V > 0 ? (dx * wv.x + dy * wv.y + dz * wv.z) / (dl * V) : 1;
        var pw = alexWind(V, cosT, P.fireC1, P.fireC2);
        var edgeF;
        if (a.flag & F_STAIRS) edgeF = P.stairSpreadF;
        else if (a.door >= 0) edgeF = (st.doorOpen[a.door] || st.burnT[i] >= P.flashoverSec) ? P.doorOpenF : P.doorClosedF;
        else edgeF = P.doorOpenF;
        var p = P.fireP0 * (1 + st.vegF[j]) * (1 + st.denF[j]) * pw * edgeF * supF;
        if (p > 1) p = 1;
        if (hr(sim.seed, D.FIRE, hz.steps * 4096 + i, j) < p) ign.push(j);
      }
    }
    for (var q = 0; q < ign.length; q++) {
      var jj = ign[q];
      if (st.burn[jj] === 0) {
        st.burn[jj] = 1; st.burnT[jj] = 0; st.I[jj] = 0.05;
        var nd = S.nodes[jj];
        evt(sim, 'fire-spread', { struct: S.id, node: nd.id, fl: nd.fl }, 'امتدّ الحريق إلى: ' + nd.label.ar, 'Fire spread to: ' + nd.label.en);
      }
    }
  }

  function outdoorFireStep(sim) {
    var P = sim.P, hz = sim.hz, w = sim.W, V = sim.wind.speed, supF = 1 - (P.engineEffectPct / 100) * (hz.suppress > 0 ? 1 : 0);
    var list = hz.outList, ign = [], i, k, c;
    hz.outSteps = (hz.outSteps || 0) + 1;
    // fire is carried out of a vented building to nearby fuel (window venting / embers): an ASSUMPTION, not part of the paper
    if (hz.vented >= 3 && hz.struct === 0) {
      var S = w.structs[0];
      for (var y = S.y0 - 5; y < S.y0 + S.h + 5; y++) for (var x = S.x0 - 5; x < S.x0 + S.w + 5; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        c = y * W + x;
        if (!w.fuel[c] || sim.ofire[c]) continue;
        var dxx = x + 0.5 - S.cx, dyy = y + 0.5 - S.cy, dl = Math.sqrt(dxx * dxx + dyy * dyy) || 1;
        var cos = (dxx * sim.wind.ux + dyy * sim.wind.uy) / dl;
        var p = 0.05 * (1 + 0.8 * cos) * supF;
        if (hr(sim.seed, D.FIREOUT, hz.outSteps * 8192 + c, 1) < p) ign.push(c);
      }
    }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      var cx = c % W, cy = (c / W) | 0;
      for (k = 0; k < 8; k++) {
        var nx = cx + NB8[k][0], ny = cy + NB8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx;
        if (sim.ofire[n] || !w.fuel[n]) continue;
        var ft = FUEL_TABLE[w.fuel[n]], dl2 = k < 4 ? CELL : CELL * 1.41421356;
        var dx = NB8[k][0], dy = NB8[k][1], d = Math.sqrt(dx * dx + dy * dy);
        var cosT = (dx * sim.wind.ux + dy * sim.wind.uy) / d;
        var pw = alexWind(V, cosT, P.fireC1, P.fireC2);
        var thS = Math.atan((w.elev[n] - w.elev[c]) / dl2) / DEG, ps = Math.exp(P.fireSlopeA * thS);
        var pb = P.fireP0 * (1 + ft.pveg) * (1 + ft.pden) * pw * ps * supF;
        if (pb > 1) pb = 1;
        if (hr(sim.seed, D.FIREOUT, hz.outSteps * 8192 + n, c + 7) < pb) ign.push(n);
      }
    }
    for (i = 0; i < ign.length; i++) {
      c = ign[i];
      if (!sim.ofire[c]) {
        sim.ofire[c] = 1; sim.oburn[c] = 0; list.push(c);
        if (hz.tOut === null) { hz.tOut = sim.t; evt(sim, 'fire-outdoor', { x: c % W, y: (c / W) | 0 }, 'اشتعلت مواد قرب المبنى في الخارج', 'Fire has caught outdoors near the building'); }
      }
    }
    // burn-down
    for (i = list.length - 1; i >= 0; i--) {
      c = list[i]; sim.oburn[c] += P.outFireStepSec;
      if (sim.oburn[c] >= (FUEL_TABLE[w.fuel[c]] ? FUEL_TABLE[w.fuel[c]].burnSec : 90) || (hz.extinguishAt !== null && sim.t >= hz.extinguishAt)) { sim.ofire[c] = 2; list[i] = list[list.length - 1]; list.pop(); }
    }
  }
  var NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function physFire(sim) {
    var P = sim.P, hz = sim.hz, w = sim.W, t = sim.t;
    if (t < sim.tIgnite) return;
    var S = w.structs[hz.struct], st = sim.stt[hz.struct], n = S.nodes.length, i;
    if (!hz.ignited) {
      hz.ignited = true; hz.started = true; hz.tStart = t;
      st.burn[hz.originLocal] = 1; st.I[hz.originLocal] = 0.05; st.burnT[hz.originLocal] = 0;
      var o = S.nodes[hz.originLocal];
      evt(sim, 'ignition', { hazard: 'fire', struct: S.id, node: o.id, fl: o.fl }, 'اندلع حريق في: ' + o.label.ar, 'Fire started in: ' + o.label.en);
    }
    var sup = hz.suppress || 0, burning = 0, vented = 0;
    for (i = 0; i < n; i++) {
      if (st.burn[i] === 1) {
        st.burnT[i] += 1;
        st.I[i] = Math.min(1, st.I[i] + 1 / P.fireGrowSec);
        if (sup > 0) st.I[i] = Math.max(0.02, st.I[i] - sup * 0.004);
        burning++;
        if (st.burnT[i] >= P.flashoverSec) {
          vented++;
          if (!st.flash[i]) { st.flash[i] = 1; var nd = S.nodes[i]; if (nd.type === NT.ROOM || nd.type === NT.SUPPORT) evt(sim, 'flashover', { node: nd.id }, 'اشتعال شامل في: ' + nd.label.ar, 'Flashover in: ' + nd.label.en); }
          S.edges.forEach(function (e) { if ((e.a === i || e.b === i) && e.door >= 0) st.doorOpen[e.door] = 1; });
        }
        if (hz.extinguishAt !== null && t >= hz.extinguishAt) { st.burn[i] = 2; }
      } else if (st.burn[i] === 2) st.I[i] = Math.max(0, st.I[i] - 1 / 240);
    }
    hz.burning = burning; hz.vented = vented;
    // indoor smoke: generation, exchange along links (rises faster up stairs), venting
    var ds = sim.stDelta || (sim.stDelta = {}), arr = ds[hz.struct] || (ds[hz.struct] = new Float32Array(n));
    arr.fill(0);
    var kUpMul = 1.4, kDown = 0.02;
    for (i = 0; i < S.edges.length; i++) {
      var e = S.edges[i], u = e.a, v = e.b, su = st.smoke[u], sv = st.smoke[v], k;
      if (su === sv) continue;
      var fu = S.nodes[u].fl, fv = S.nodes[v].fl;
      var base = (e.flag & F_STAIRS) ? 0 : (e.door >= 0 ? (st.doorOpen[e.door] ? P.smokeLeakOpen : P.smokeLeakClosed) : P.smokeLeakOpen);
      var from = su > sv ? u : v, to = su > sv ? v : u;
      if (e.flag & F_STAIRS) k = (S.nodes[to].fl > S.nodes[from].fl) ? Math.max(0.07, P.smokeLeakOpen * kUpMul) : kDown;
      else k = base;
      var flux = k * Math.abs(su - sv);
      arr[from] -= flux; arr[to] += flux;
    }
    for (i = 0; i < n; i++) {
      var s = st.smoke[i] + arr[i];
      if (st.burn[i] === 1) s += 0.06 * st.I[i];
      var vent = 0.003 + (st.burnT[i] >= P.flashoverSec && st.burn[i] === 1 ? 0.02 : 0);
      s -= s * vent;
      st.smoke[i] = clamp(s, 0, 1);
    }
    for (i = 0; i < S.exits.length; i++) {   // open exits leak a little smoke to the outside
      var ex = S.exits[i], ge = ex.shaft[0] ? S.byId[ex.shaft[0]].local : -1;
      if (ge >= 0 && !sim.exits[ex.gi].locked) st.smoke[ge] *= 0.99;
    }
    if (t % P.fireStepSec === 0) fireSpreadStructure(sim);
    // outdoors
    if (hz.outList.length || hz.vented >= 3) { if (t % P.outFireStepSec === 0) outdoorFireStep(sim); }
    // smoke emission into the outdoor field
    var emit = 0, k2;
    for (i = 0; i < n; i++) if (st.burn[i] === 1) emit += 0.12 * st.I[i] + (st.burnT[i] >= P.flashoverSec ? 0.5 : 0);
    if (emit > 0) {
      var per = emit / (S.w * S.h);
      for (var yy = S.y0; yy < S.y0 + S.h; yy++) for (var xx = S.x0; xx < S.x0 + S.w; xx++) sim.F.smoke[yy * W + xx] += per;
    }
    for (i = 0; i < hz.outList.length; i++) { var cc = hz.outList[i], ft0 = FUEL_TABLE[w.fuel[cc]]; sim.F.smoke[cc] += 0.05 * (ft0 ? ft0.smoke : 0.6); }
    if (t % FIRE_SMOKE_STEP === 0) stepSmokeField(sim);
  }

  function stepSmokeField(sim) {
    var F = sim.F.smoke, tmp = sim.tmpA, dt = FIRE_SMOKE_STEP;
    var vx = sim.wind.ux * sim.wind.speed / CELL * dt, vy = sim.wind.uy * sim.wind.speed / CELL * dt;
    advectConst(F, tmp, vx, vy);
    diffuse(tmp, sim.tmpB, 0.12, 2);
    var decay = Math.pow(0.99, dt);   // deposition/dilution (assumption)
    for (var i = 0; i < NC; i++) F[i] = tmp[i] * decay;
  }

  // exit state truth: OPEN / SMOKE / FIRE / LOCKED, from the shaft nodes of each exit
  function updateExitStates(sim) {
    var w = sim.W, P = sim.P;
    for (var gi = 0; gi < w.exits.length; gi++) {
      var ex = w.exits[gi], rt = sim.exits[gi], S = w.structs[ex.struct], st = sim.stt[ex.struct], state;
      var fire = false, smoke = 0;
      for (var q = 0; q < ex.shaft.length; q++) {
        var l = S.byId[ex.shaft[q]].local;
        if (st.burn[l] === 1 || st.I[l] > 0.05) fire = true;
        if (st.smoke[l] > smoke) smoke = st.smoke[l];
      }
      if (rt.locked) state = 'LOCKED'; else if (fire) state = 'FIRE'; else if (smoke >= 0.35) state = 'SMOKE'; else state = 'OPEN';
      if (state !== rt.state) {
        var old = rt.state; rt.state = state; rt.since = sim.t;
        if (sim.t > 0 || old !== 'OPEN') evt(sim, 'exit-state', { exit: ex.id, struct: S.id, from: old, to: state }, 'حالة المخرج «' + ex.name.ar + '»: ' + EXIT_AR[state], 'Exit "' + ex.name.en + '": ' + state);
        sim.rt.dirty = true;
      }
    }
  }
  var EXIT_AR = { OPEN: 'مفتوح', SMOKE: 'دخان', FIRE: 'نار', LOCKED: 'مقفل' };

  /* ====================================================================================
   * 7. OTHER HAZARD FIELDS: GAS, FLOOD, DUST, HEAT, SOS   (each: init + physics per second)
   *    Danger levels come from docs/MANARA-SOURCES.md (S19 WBGT 32.1, S31 PM10 150, S46-S48 gases, S49 PM10 bands, S52 WBGT 28);
   *    docs/MANARA-HAZARDS.md did not exist when this was written, so warn levels and all "dose" constants stay labelled assumptions.
   * ==================================================================================== */
  var GAS_UNIT = 24;           // converts "leak rate" slider units into field units (calibration constant)
  var GAS_STEP = 2, WATER_STEP = 5, DUST_STEP = 5;
  var GAS_TYPES = {            // heavier-than-air flag, display name, warn/danger levels (ppm). Sources: S46 (CO), S47 (H2S), S48 (LPG as propane); docs/MANARA-HAZARDS.md §13
    lpg: { heavy: 1, unit: 'ppm', warn: 1000, danger: 2100, name: T('غاز البترول المسال', 'LPG') },
    h2s: { heavy: 1, unit: 'ppm', warn: 10, danger: 20, name: T('كبريتيد الهيدروجين', 'Hydrogen sulphide') },
    co: { heavy: 0, unit: 'ppm', warn: 35, danger: 200, name: T('أول أكسيد الكربون', 'Carbon monoxide') }
  };

  function initGas(sim) {
    var hz = sim.hz, w = sim.W;
    hz.gasType = sim.pre.gasType || 'lpg';
    hz.src = { x: 59, y: 38 }; hz.srcCell = 38 * W + 59;
    hz.leakOn = false; hz.valveAt = null; hz.place = sim.pre.incident;
    hz.heavy = sim.P.gasHeavy;
    sim.tmpA = new Float32Array(NC); sim.tmpB = new Float32Array(NC);
  }
  function physGas(sim) {
    var P = sim.P, hz = sim.hz, F = sim.F.gas, t = sim.t, w = sim.W;
    if (t < sim.tIgnite) return;
    if (!hz.started) { hz.started = true; hz.tStart = t; hz.leakOn = true; evt(sim, 'ignition', { hazard: 'gas' }, 'بدأ تسرّب الغاز عند المخزن', 'A gas leak started at the store'); }
    if (hz.leakOn) {
      F[hz.srcCell] += P.gasRate * GAS_UNIT * (P.gasDanger / 10);
      if (hz.valveAt !== null && t >= hz.valveAt) { hz.leakOn = false; evt(sim, 'valve-closed', null, 'أُغلق مصدر التسرّب', 'The leak source was shut off'); }
    }
    if (t % GAS_STEP === 0) {
      var dt = GAS_STEP, tmp = sim.tmpA;
      advectConst(F, tmp, sim.wind.ux * sim.wind.speed / CELL * dt, sim.wind.uy * sim.wind.speed / CELL * dt);
      var passes = Math.max(1, Math.ceil(P.gasK * dt / (CELL * CELL) / 0.2));
      diffuse(tmp, sim.tmpB, P.gasK * dt / (CELL * CELL) / passes, passes);
      var decay = Math.pow(0.997, dt), i;
      if (hz.heavy) {   // heavier-than-air: creeps downhill and pools in low ground
        var el = w.elev, x, y, out = sim.tmpB; out.fill(0);
        for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
          i = y * W + x; var c = tmp[i]; if (c < 0.02) continue;
          var e0 = el[i], w0 = x > 0 ? Math.max(0, e0 - el[i - 1]) : 0, w1 = x < W - 1 ? Math.max(0, e0 - el[i + 1]) : 0, w2 = y > 0 ? Math.max(0, e0 - el[i - W]) : 0, w3 = y < H - 1 ? Math.max(0, e0 - el[i + W]) : 0;
          var sum = w0 + w1 + w2 + w3; if (sum <= 0) continue;
          var frac = Math.min(0.2, sum / CELL * 8), amt = c * frac;
          if (w0) out[i - 1] += amt * w0 / sum; if (w1) out[i + 1] += amt * w1 / sum; if (w2) out[i - W] += amt * w2 / sum; if (w3) out[i + W] += amt * w3 / sum;
          tmp[i] -= amt;
        }
        for (i = 0; i < NC; i++) tmp[i] += out[i];
      }
      for (i = 0; i < NC; i++) F[i] = tmp[i] * decay;
    }
    // gas seeps indoors (lagging the outdoor concentration)
    var S = w.structs[0], st = sim.stt[0], target = sampleBilinear(F, S.cx, S.cy) * P.gasInfilPct / 100;
    for (var q = 0; q < st.gas.length; q++) st.gas[q] += (target - st.gas[q]) / 120;
  }

  function initFlood(sim) {
    var hz = sim.hz; hz.place = sim.pre.incident; hz.qmdAt = 60; hz.rain = 0; hz.maxDepth = 0; hz.spawnNext = 40; hz.arrivals = 0;
    sim.tmpA = new Float32Array(NC);
  }
  function physFlood(sim) {
    var P = sim.P, hz = sim.hz, Fw = sim.F.water, w = sim.W, t = sim.t;
    if (!hz.started) { hz.started = true; hz.tStart = t; evt(sim, 'ignition', { hazard: 'flood' }, 'بدأ هطول المطر الغزير', 'Heavy rain began'); }
    hz.rain = P.rainMmHr * smooth(0, 120, t) * (1 - smooth(900, 1200, t));   // the storm ramps up, peaks, and eases after 15 simulated minutes
    if (t % WATER_STEP === 0) {
      var rate = hz.rain * P.floodScale / 3.6e6 * 0.7 * WATER_STEP, el = w.elev, tmp = sim.tmpA, x, y, i, j;
      tmp.fill(0);
      for (i = 0; i < NC; i++) Fw[i] += rate;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x; var d = Fw[i]; if (d <= 1e-5) continue;
        var h = el[i] + d, q;
        if (x > 0) { j = i - 1; q = h - (el[j] + Fw[j]); if (q > 0) { q = Math.min(d * 0.25, q * 0.2); tmp[i] -= q; tmp[j] += q; } }
        if (x < W - 1) { j = i + 1; q = h - (el[j] + Fw[j]); if (q > 0) { q = Math.min(d * 0.25, q * 0.2); tmp[i] -= q; tmp[j] += q; } }
        if (y > 0) { j = i - W; q = h - (el[j] + Fw[j]); if (q > 0) { q = Math.min(d * 0.25, q * 0.2); tmp[i] -= q; tmp[j] += q; } }
        if (y < H - 1) { j = i + W; q = h - (el[j] + Fw[j]); if (q > 0) { q = Math.min(d * 0.25, q * 0.2); tmp[i] -= q; tmp[j] += q; } }
      }
      var drain = 0.00003 * WATER_STEP, mx = 0;
      for (i = 0; i < NC; i++) {
        var v = Fw[i] + tmp[i]; if (el[i] > -0.2) v -= drain;   // gutters drain a little everywhere except the underpass sump
        if (v < 0) v = 0; Fw[i] = v; if (v > mx) mx = v;
      }
      hz.maxDepth = mx;
    }
  }
  function depthAtSeg(sim, seg) {   // deepest water along a road segment's centre line
    var m = 0; for (var i = 0; i < seg.cells.length; i++) { var d = sim.F.water[seg.cells[i]]; if (d > m) m = d; } return m;
  }

  function dustAxis(sim) {
    var hz = sim.hz, ux = sim.wind.ux, uy = sim.wind.uy, s = hz.s || (hz.s = new Float32Array(NC)), mn = Infinity, x, y;
    var corners = [[0, 0], [W * CELL, 0], [0, H * CELL], [W * CELL, H * CELL]];
    corners.forEach(function (c) { mn = Math.min(mn, c[0] * ux + c[1] * uy); });
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) s[y * W + x] = (x + 0.5) * CELL * ux + (y + 0.5) * CELL * uy - mn;
    hz.sStation = -sim.P.dustFrontMps * 150;       // virtual upwind station (regional PM10 monitor), 150 s upstream of the district
    hz.sKey = ux.toFixed(3) + ',' + uy.toFixed(3);
  }
  function initDust(sim) { var hz = sim.hz; hz.place = sim.pre.incident; hz.front = -1e9; dustAxis(sim); hz.qmdAt = 20; hz.peakSeen = 0; }
  function dustFrontAt(sim, t) { return sim.P.dustFrontMps * (t - sim.P.dustLeadSec); }
  function physDust(sim) {
    var P = sim.P, hz = sim.hz, t = sim.t;
    if (!hz.started) { hz.started = true; hz.tStart = t; evt(sim, 'ignition', { hazard: 'dust' }, 'جبهة غبار تقترب من الحيّ', 'A dust front is approaching the district'); }
    if (hz.sKey !== sim.wind.ux.toFixed(3) + ',' + sim.wind.uy.toFixed(3)) dustAxis(sim);
    hz.front = dustFrontAt(sim, t);
    if (t % DUST_STEP === 0) {
      var F = sim.F.dust, s = hz.s, thick = 400, i, mx = 0, slot = Math.floor(t / 20);
      if (hz.modSlot !== slot) {   // gusty patchiness: +/-12 %, refreshed every 20 s (one hashed value per cell)
        if (!hz.mod) hz.mod = new Float32Array(NC);
        for (i = 0; i < NC; i++) hz.mod[i] = 1 + 0.12 * fastNoise(sim.seed + D.DUST, i, slot) / 2;
        hz.modSlot = slot;
      }
      for (i = 0; i < NC; i++) {
        var f = smooth(0, thick, hz.front - s[i]);
        var v = f > 0 ? P.dustPeak * f * hz.mod[i] : 0;
        F[i] = v; if (v > mx) mx = v;
      }
      hz.peakSeen = mx;
    }
  }

  // ---- heat
  function wbgtNow(sim) { return sim.P.wbgtStart + sim.P.wbgtRise * sim.t / 3600; }
  function initHeat(sim) {
    var hz = sim.hz; hz.place = sim.pre.incident; hz.collapses = 0; hz.stopAt = null;
    sim.people.forEach(function (p) { if (p.loc === 'site' || p.loc === 'yard') p.strain = 0.05 + 0.25 * hr(sim.seed, D.HEAT, p.id, 2); });
    hz.ruleOn = false;
  }
  function physHeat(sim) {
    var P = sim.P, hz = sim.hz, t = sim.t, w = sim.W, i;
    if (!hz.started) { hz.started = true; hz.tStart = t; evt(sim, 'ignition', { hazard: 'heat' }, 'الحرارة ترتفع في موقع العمل', 'The heat is rising at the worksite'); }
    hz.wbgt = wbgtNow(sim);
    var hh = sim.hour0 + t / 3600; hz.ruleOn = hh >= P.heatRuleHour && hh <= 15.5;   // 10:00-15:30 (S18)
    var over = Math.max(0, (hz.wbgt - P.wbgtRef) / Math.max(0.5, P.wbgtStop - P.wbgtRef));
    var ratePerMin = over * over / P.strainMin;
    for (i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (a.away || a.st === 'down') continue;
      var outdoors = a.st !== 'sheltered' && a.st !== 'safe' && (a.loc === 'site' || a.loc === 'yard' || a.loc === 'outdoor' || a.g < NC);
      var cool = a.safeKind === 'cool' || (a.g >= NC && a.st !== 'moving');   // indoors (or in a cooled shelter)
      if (cool) a.strain = Math.max(0, a.strain - 1 / (P.coolRecoverMin * 60));
      else if (outdoors && a.st !== 'incapacitated') {
        var load = a.role === 'pupil' ? 0.5 : (a.role === 'resident' || a.role === 'teacher' ? 1.0 : 0.6);
        a.strain += ratePerMin / 60 * load / a.heatTol;
        if (a.strain >= 1) { a.strain = 1; collapse(sim, a, 'heat'); }
      }
    }
  }

  // ---- someone needs help: a person collapses (heat stroke, cardiac event, fall...). One "case" per collapse.
  function collapse(sim, a, why) {
    if (a.st === 'down') return;
    a.st = 'down'; a.downAt = sim.t; a.moveAt = -1; a.plan = 'none';
    var c = { id: sim.cases.length + 1, victim: a.id, t0: sim.t, why: why, keyA: null, keyB: null, confirmAt: null, approveAt: null, helpAt: null, helpBy: null, call999At: null };
    sim.cases.push(c);
    evt(sim, 'collapse', { person: a.key, why: why, x: round1(sim.W.G.nx[a.g]), y: round1(sim.W.G.ny[a.g]) },
      'انهار شخص ويحتاج مساعدة (' + (why === 'heat' ? 'إجهاد حراري' : 'حالة طبية') + ')', 'A person collapsed and needs help (' + (why === 'heat' ? 'heat stress' : 'medical') + ')');
    if (why === 'heat') sim.hz.collapses++;
    // someone collapsing while a unit is already on scene is attended almost at once (hand-over time: an assumption)
    if (sim.fx && sim.fx.ambulanceOnScene !== null) { a.helpAt = sim.t + 30; a.helpBy = 'ambulance'; c.helpAt = sim.t + 30; c.helpBy = 'ambulance'; }
  }
  function initSos(sim) { var hz = sim.hz; hz.place = sim.pre.incident; hz.victimDown = false; }
  function physSos(sim) {
    var hz = sim.hz, t = sim.t;
    if (t >= sim.tIgnite && !hz.started) {
      hz.started = true; hz.tStart = t;
      var v = sim.people[sim.victim];
      collapse(sim, v, 'medical');
      evt(sim, 'ignition', { hazard: 'sos' }, 'سقط شخص في الحديقة', 'A person fell in the park');
    }
  }

  var HZ = {
    fire: { init: initFire, phys: physFire }, gas: { init: initGas, phys: physGas }, flood: { init: initFlood, phys: physFlood },
    dust: { init: initDust, phys: physDust }, heat: { init: initHeat, phys: physHeat }, sos: { init: initSos, phys: physSos }
  };
  function initHazard(sim) { sim.cases = []; HZ[sim.hazard].init(sim); }

  /* ====================================================================================
   * 8. SENSORS -> TWO-KEY VERIFICATION -> LOCAL ALARM -> PUBLIC ALERT (approval) -> ALERT COMPOSER + WAKE-UP LADDER
   *    keys: a reading above its threshold for keyHoldSec = an active key. Two keys of DIFFERENT independence groups in the
   *    same zone, held confirmHoldSec = CONFIRMED. One key alone never goes past SUSPECT. A public alert needs the human key
   *    (operator approval). The local alarm never waits for anything.
   * ==================================================================================== */
  function addCh(sim, ch) {
    ch.idx = sim.sensors.length; ch.value = null; ch.raw = 0; ch.active = false; ch.since = null; ch.hold = 0; ch.forced = null; ch.hist = [];
    ch.alarm = false; sim.sensors.push(ch);
  }
  function initSensors(sim) {
    var w = sim.W, P = sim.P, S0 = w.structs[0], S1 = w.structs[1];
    sim.sensors = [];
    var hz = sim.hazard;
    if (hz === 'fire') {
      var S = w.structs[sim.hz.struct], sid = S.id;
      S.nodes.forEach(function (n) {     // one sentinel per room and per corridor node (cheap ESP32 boards: an assumption about the install)
        if (n.type !== NT.CORR && n.type !== NT.ROOM && n.type !== NT.SUPPORT && n.type !== NT.LOBBY) return;
        ['thermal', 'smoke', 'vision'].forEach(function (k) {
          addCh(sim, { id: 'S-' + n.id + '-' + k, key: k, group: k, zone: sid, kind: k, struct: S.idx, node: n.local, label: T('مستشعر ' + n.label.ar + ' (' + k + ')', k + ' sensor: ' + n.label.en),
            thrActive: k === 'thermal' ? 57 : k === 'smoke' ? 60 + 3 * 18 : 0.6, thrAlarm: k === 'thermal' ? 90 : k === 'smoke' ? 60 + 10 * 18 : 9, riseKey: k === 'thermal', noise: k === 'thermal' ? 1.2 : k === 'smoke' ? 18 : 0.04, driftHr: k === 'smoke' ? 6 : 0.2, cross: k === 'smoke',
            unit: k === 'thermal' ? '°C' : k === 'smoke' ? 'adc' : '0-1' });
        });
      });
      ['thermal', 'vision'].forEach(function (k) {
        addCh(sim, { id: 'S-YARD-' + k, key: k, group: k, zone: 'YARD', kind: 'y' + k, x: 60, y: 26, label: T('مستشعر الساحة (' + k + ')', 'Forecourt sensor (' + k + ')'),
          thrActive: k === 'thermal' ? 57 : 0.6, thrAlarm: 99, riseKey: k === 'thermal', noise: k === 'thermal' ? 1.2 : 0.04, driftHr: 0.2, unit: k === 'thermal' ? '°C' : '0-1' });
      });
    } else if (hz === 'gas') {
      var gu = P.gasDanger / 10;     // sensor noise and trend scale with the gas's own units
      [['g-store', 59, 38, 'مخزن الغاز', 'Gas store'], ['g-forecourt', 59, 25, 'ساحة السكن', 'Residence forecourt']].forEach(function (g) {
        addCh(sim, { id: g[0], key: g[0], group: g[0], zone: 'GAS', kind: 'gas', x: g[1], y: g[2], label: T('مستشعر غاز: ' + g[3], 'Gas sensor: ' + g[4]),
          thrActive: P.gasWarn * 0.5, thrAlarm: P.gasWarn, noise: 0.6 * gu, trend: 0.3 * gu, driftHr: 0.4 * gu, unit: 'ppm', cross: true });
      });
      addCh(sim, { id: 'g-lobby', key: 'g-lobby', group: 'g-lobby', zone: 'GAS', kind: 'gasin', struct: 0, node: S0.byId['LOB'].local, label: T('مستشعر غاز: بهو السكن', 'Gas sensor: residence lobby'),
        thrActive: P.gasWarn * 0.5, thrAlarm: 1e9, noise: 0.5 * gu, trend: 0.3 * gu, driftHr: 0.4 * gu, unit: 'ppm', cross: true });
    } else if (hz === 'flood') {
      addCh(sim, { id: 'water-underpass', key: 'water', group: 'water-1', zone: 'FLOOD', kind: 'water', x: 24, y: 42, label: T('مستشعر منسوب الماء في النفق (وسط)', 'Underpass water-level sensor (middle)'), thrActive: P.roadCloseCm, thrAlarm: P.floodBlockCm, noise: 0.4, driftHr: 0.1, unit: 'cm' });
      addCh(sim, { id: 'water-underpass-2', key: 'water', group: 'water-2', zone: 'FLOOD', kind: 'water', x: 24, y: 37, label: T('مستشعر منسوب الماء في النفق (المدخل الشمالي)', 'Underpass water-level sensor (north ramp)'), thrActive: P.roadCloseCm, thrAlarm: P.floodBlockCm, noise: 0.4, driftHr: 0.1, unit: 'cm' });
      addCh(sim, { id: 'rain-gauge', key: 'rain', group: 'rain', zone: 'FLOOD', kind: 'rain', label: T('مقياس المطر على السطح', 'Rain gauge (roof)'), thrActive: 20, thrAlarm: 999, noise: 1.5, driftHr: 0, unit: 'mm/h' });
      addCh(sim, { id: 'qmd-feed', key: 'qmd', group: 'qmd', zone: 'FLOOD', kind: 'feed', label: T('إنذار الأرصاد (محاكى)', 'Met-office warning feed (SIM)'), thrActive: 0.5, thrAlarm: 999, noise: 0, driftHr: 0, unit: '0/1' });
    } else if (hz === 'dust') {
      addCh(sim, { id: 'pm10-upwind', key: 'pm10', group: 'pm', zone: 'DUST', kind: 'pm-up', label: T('مستشعر PM10 عند الأطراف الشمالية الغربية (محاكى)', 'PM10 monitor upwind (SIM)'), thrActive: P.dustWarn, thrAlarm: 99999, noise: 8, driftHr: 2, unit: 'µg/m³' });
      addCh(sim, { id: 'pm10-district', key: 'pm10', group: 'pm', zone: 'DUST', kind: 'pm', x: 6, y: 6, label: T('مستشعر PM10 في الحي', 'PM10 sensor in the district'), thrActive: P.dustWarn, thrAlarm: 99999, noise: 8, driftHr: 2, unit: 'µg/m³' });
      addCh(sim, { id: 'visibility-cam', key: 'visibility', group: 'vis', zone: 'DUST', kind: 'vis', x: 6, y: 6, label: T('كاميرا قياس الرؤية', 'Visibility camera'), thrActive: 800, thrAlarm: 0, invert: true, noise: 30, driftHr: 0, unit: 'm' });
      addCh(sim, { id: 'qmd-feed', key: 'qmd', group: 'qmd', zone: 'DUST', kind: 'feed', label: T('إنذار الأرصاد (محاكى)', 'Met-office warning feed (SIM)'), thrActive: 0.5, thrAlarm: 999, noise: 0, driftHr: 0, unit: '0/1' });
    } else if (hz === 'heat') {
      addCh(sim, { id: 'wbgt-site', key: 'wbgt', group: 'wbgt', zone: 'SITE', kind: 'wbgt', label: T('مستشعر WBGT في الموقع', 'WBGT sensor at the worksite'), thrActive: P.wbgtStop, thrAlarm: 999, noise: 0.25, driftHr: 0.05, unit: '°C' });
      addCh(sim, { id: 'work-rule', key: 'workrule', group: 'rule', zone: 'SITE', kind: 'rule', label: T('قاعدة ساعات العمل', 'Work-hours rule'), thrActive: 0.5, thrAlarm: 999, noise: 0, driftHr: 0, unit: '0/1' });
    } else if (hz === 'sos') {
      addCh(sim, { id: 'sos-button', key: 'sos', group: 'button', zone: 'CASE', kind: 'sos', label: T('زر الاستغاثة / مستشعر السقوط (اصطدام + سكون)', 'SOS button / fall sensor (impact + stillness)'), thrActive: 0.5, thrAlarm: 999, noise: 0, driftHr: 0, unit: '0/1' });
      addCh(sim, { id: 'no-answer', key: 'noanswer', group: 'ack', zone: 'CASE', kind: 'noanswer', label: T('لا إجابة على نداء التحقق', 'No answer to the check-in call'), thrActive: 0.5, thrAlarm: 999, noise: 0, driftHr: 0, unit: '0/1' });
    }
  }

  function truthOf(sim, ch) {   // the physical quantity a channel measures (before noise, drift, forcing)
    var w = sim.W, hz = sim.hz, st, S, c;
    switch (ch.kind) {
      case 'thermal': {
        st = sim.stt[ch.struct]; S = w.structs[ch.struct];
        if (S.nodes[ch.node].type === NT.ROOM || S.nodes[ch.node].type === NT.SUPPORT) return 25 + 90 * st.I[ch.node] + 10 * st.smoke[ch.node];   // room thermal view: the room itself
        var nb = structAdj(S)[ch.node], mx = 0;
        for (var q = 0; q < nb.length; q++) { var j = nb[q].to; if (S.nodes[j].type === NT.ROOM || S.nodes[j].type === NT.SUPPORT) mx = Math.max(mx, st.I[j]); }
        return 25 + 30 * mx + 60 * st.I[ch.node] + 10 * st.smoke[ch.node];
      }
      case 'smoke': st = sim.stt[ch.struct]; return 60 + 900 * st.smoke[ch.node];
      case 'vision': st = sim.stt[ch.struct]; return clamp(2.5 * st.smoke[ch.node] - 0.1, 0, 1);
      case 'ythermal': {
        var cx = Math.floor(ch.x), cy = Math.floor(ch.y), m = 25;
        for (var yy = cy - 4; yy <= cy + 4; yy++) for (var xx = cx - 4; xx <= cx + 4; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && sim.ofire[yy * W + xx] === 1) m = 105;
        return m;
      }
      case 'yvision': {
        var cx2 = Math.floor(ch.x), cy2 = Math.floor(ch.y), v = 0;
        for (var y3 = cy2 - 5; y3 <= cy2 + 5; y3++) for (var x3 = cx2 - 5; x3 <= cx2 + 5; x3++) if (x3 >= 0 && y3 >= 0 && x3 < W && y3 < H && sim.ofire[y3 * W + x3] === 1) v = 0.9;
        return Math.max(v, clamp(1.5 * sim.F.smoke[cy2 * W + cx2] - 0.1, 0, 1));
      }
      case 'gas': return sampleBilinear(sim.F.gas, ch.x, ch.y);
      case 'gasin': return sim.stt[ch.struct].gas[ch.node];
      case 'water': return sim.F.water[Math.floor(ch.y) * W + Math.floor(ch.x)] * 100;
      case 'rain': return hz.rain;
      case 'feed': return sim.t >= hz.qmdAt ? 1 : 0;
      case 'pm-up': return sim.P.dustPeak * smooth(0, 400, hz.front - hz.sStation);
      case 'pm': return sim.F.dust[Math.floor(ch.y) * W + Math.floor(ch.x)];
      case 'vis': return 4000 / (1 + sim.F.dust[Math.floor(ch.y) * W + Math.floor(ch.x)] / 50);
      case 'wbgt': return hz.wbgt || wbgtNow(sim);
      case 'rule': return hz.ruleOn ? 1 : 0;
      case 'sos': { var cs = sim.cases[0]; return cs && sim.t >= cs.t0 + sim.P.sosStillSec ? 1 : 0; }
      case 'noanswer': { var cs2 = sim.cases[0]; return cs2 && sim.t >= cs2.t0 + sim.P.sosStillSec + sim.P.sosTimeoutSec ? 1 : 0; }
    }
    return 0;
  }

  function stepSensors(sim) {
    var P = sim.P, t = sim.t, hzOn = sim.hz.started;
    for (var i = 0; i < sim.sensors.length; i++) {
      var ch = sim.sensors[i], truth = hzOn ? truthOf(sim, ch) : (ch.kind === 'thermal' || ch.kind === 'ythermal' ? 25 : ch.kind === 'smoke' ? 60 : ch.kind === 'vis' ? 4000 : ch.kind === 'wbgt' ? wbgtNow(sim) : 0);
      var noise = ch.noise ? fastNoise(sim.seed + D.SENSOR, ch.idx, t) * ch.noise * P.sensorNoise : 0;
      var drift = ch.driftHr * t / 3600 * (ch.invert ? -1 : 1);
      var v = truth + noise + drift;
      if (ch.forced && t <= ch.forced.until) v += ch.forced.add; else if (ch.forced && t > ch.forced.until) ch.forced = null;
      if (ch.kind === 'rain' || ch.kind === 'pm' || ch.kind === 'pm-up' || ch.kind === 'water' || ch.kind === 'gas' || ch.kind === 'gasin') v = Math.max(0, v);
      ch.value = v;
      ch.ready = t >= P.warmupSec;
      var over = ch.invert ? v <= ch.thrActive : v >= ch.thrActive;
      // gas: also needs a rising trend, or a clearly high level
      if (over && (ch.kind === 'gas' || ch.kind === 'gasin')) {
        ch.hist.push(v); if (ch.hist.length > 31) ch.hist.shift();
        var rising = ch.hist.length < 2 || v - ch.hist[0] > (ch.trend || 0.3);
        over = rising || v >= 3 * ch.thrActive;
      } else if (ch.kind === 'gas' || ch.kind === 'gasin') { ch.hist.push(v); if (ch.hist.length > 31) ch.hist.shift(); }
      // thermal: the fixed 57 degC rating OR the rate-of-rise rating (8.3 degC per minute, docs/MANARA-HAZARDS.md §4, S58)
      if (ch.riseKey) {
        ch.hist.push(v); if (ch.hist.length > 31) ch.hist.shift();
        if (!over && ch.hist.length >= 31) {
          var m0 = (ch.hist[0] + ch.hist[1] + ch.hist[2] + ch.hist[3] + ch.hist[4]) / 5, m1 = (ch.hist[26] + ch.hist[27] + ch.hist[28] + ch.hist[29] + ch.hist[30]) / 5;
          if ((m1 - m0) / (26 / 60) >= 8.3 && v >= 35) over = true;
        }
      }
      if (!ch.ready) over = false;
      if (over) { ch.hold++; } else ch.hold = 0;
      var was = ch.active;
      ch.active = ch.hold >= Math.max(1, P.keyHoldSec);
      if (ch.active && !was) { ch.since = t; }
      if (!ch.active && was) ch.since = null;
      var alarmNow = ch.ready && (ch.invert ? v <= ch.thrAlarm && ch.thrAlarm > 0 : v >= ch.thrAlarm);
      ch.alarm = alarmNow;
    }
  }

  function keysByZone(sim) {
    var zones = {};
    for (var i = 0; i < sim.sensors.length; i++) {
      var ch = sim.sensors[i];
      if (!ch.active) continue;
      var z = zones[ch.zone] || (zones[ch.zone] = { groups: {}, keys: {}, since: 1e9 });
      if (!z.groups[ch.group]) z.groups[ch.group] = ch.since;
      z.keys[ch.key] = true; z.since = Math.min(z.since, ch.since);
    }
    return zones;
  }

  var KEYN = { thermal: T('حرارية', 'thermal'), smoke: T('دخان (MQ-2)', 'smoke (MQ-2)'), vision: T('رؤية حاسوبية', 'vision'), 'g-store': T('غاز المخزن', 'gas at the store'), 'g-forecourt': T('غاز الساحة', 'gas at the forecourt'), 'g-lobby': T('غاز البهو', 'gas in the lobby'),
    water: T('منسوب الماء', 'water level'), 'water-1': T('منسوب الماء (وسط النفق)', 'water level (middle)'), 'water-2': T('منسوب الماء (المدخل)', 'water level (ramp)'), rain: T('مقياس المطر', 'rain gauge'), qmd: T('إنذار الأرصاد', 'weather warning'),
    pm10: T('غبار PM10', 'PM10 dust'), pm: T('غبار PM10', 'PM10 dust'), visibility: T('الرؤية', 'visibility'), vis: T('الرؤية', 'visibility'), wbgt: T('مؤشر WBGT', 'WBGT'), workrule: T('قاعدة العمل', 'work-hours rule'), rule: T('قاعدة العمل', 'work-hours rule'),
    sos: T('زر/كاشف السقوط', 'SOS / fall detector'), button: T('زر/كاشف السقوط', 'SOS / fall detector'), noanswer: T('لا إجابة', 'no answer'), ack: T('لا إجابة', 'no answer') };
  function keyList(keys, lang) { return keys.map(function (k) { return KEYN[k] ? KEYN[k][lang] : k; }).join(lang === 'ar' ? '، ' : ', '); }
  function stepVerification(sim) {
    var P = sim.P, t = sim.t, ver = sim.ver;
    stepSensors(sim);
    if (sim.hazard === 'heat' && sim.hz.tCross === undefined) { for (var hq = 0; hq < sim.sensors.length; hq++) if (sim.sensors[hq].kind === 'wbgt' && sim.sensors[hq].active) { sim.hz.tCross = t; evt(sim, 'threshold', null, 'تجاوز WBGT حدّ إيقاف الأعمال (' + P.wbgtStop + ')', 'WBGT passed the stop-all-work level (' + P.wbgtStop + ')'); } }
    var zones = keysByZone(sim), best = null, bestN = 0;
    for (var z in zones) { var n = Object.keys(zones[z].groups).length; if (n > bestN) { bestN = n; best = z; } }
    // local alarm (fire / gas only): the building's own detector, never waits for anything
    if (!sim.local.on && (sim.hazard === 'fire' || sim.hazard === 'gas')) {
      var trip = false, src = null;
      if (sim.hazard === 'fire') {
        var S = sim.W.structs[sim.hz.struct], st = sim.stt[sim.hz.struct];
        for (var i = 0; i < S.nodes.length; i++) if ((S.nodes[i].type === NT.ROOM || S.nodes[i].type === NT.CORR || S.nodes[i].type === NT.SUPPORT || S.nodes[i].type === NT.LOBBY) && st.smoke[i] >= 0.08) { trip = true; break; }
        if (trip) sim.local = { on: true, at: t, kind: 'siren', struct: sim.hz.struct, pos: { x: S.cx, y: S.cy }, radiusM: 40 };
      } else {
        for (var j = 0; j < sim.sensors.length; j++) { var ch = sim.sensors[j]; if (ch.kind === 'gas' && ch.alarm && ch.group === 'g-store') { trip = true; break; } }
        if (trip) sim.local = { on: true, at: t, kind: 'siren', struct: -1, pos: { x: 59.5, y: 38 }, radiusM: 70 };
      }
      if (trip) {
        evt(sim, 'local-alarm', { hazard: sim.hazard }, 'انطلق الإنذار المحلي (الصافرة) — لا ينتظر أحداً', 'Local alarm sounded (siren) — it never waits');
        if (sim.mode === 'manara') { /* the local alarm is identical in both worlds */ }
      }
    }
    if (ver.phase === 'idle') {
      if (best) {
        ver.phase = 'suspect'; ver.suspectAt = t; ver.zone = best;
        evt(sim, 'suspect', { zone: best, keys: Object.keys(zones[best].keys) }, 'اشتباه: مفتاح واحد فعّال (' + keyList(Object.keys(zones[best].keys), 'ar') + ') — لا يكفي', 'SUSPECT: one key active (' + keyList(Object.keys(zones[best].keys), 'en') + ') — not enough alone');
      }
    }
    var buzz = false;
    for (var bq = 0; bq < sim.sensors.length; bq++) if (sim.sensors[bq].alarm) { buzz = true; break; }
    if (buzz && !sim.buzzer) { sim.buzzer = { at: t }; evt(sim, 'sentinel-buzzer', null, 'رنّ جرس المستشعر المحلي (لا ينتظر شبكة ولا إنساناً)', 'A sentinel\'s own buzzer sounded (it waits for no network and no person)'); }
    if (ver.phase === 'suspect' || ver.phase === 'idle') {
      if (bestN >= 2 && !(ver.holdOffUntil && t < ver.holdOffUntil)) {
        ver.hold = (ver.hold || 0) + 1;
        if (ver.hold >= Math.max(1, P.confirmHoldSec)) {
          ver.phase = 'confirmed'; ver.confirmedAt = t; ver.zone = best; ver.needsApproval = true; ver.keysNow = Object.keys(zones[best].groups);
          evt(sim, 'confirmed', { zone: best, keys: ver.keysNow }, 'مؤكَّد: مفتاحان مستقلان (' + keyList(ver.keysNow, 'ar') + ') — بانتظار اعتماد المشغّل', 'CONFIRMED: two independent keys (' + keyList(ver.keysNow, 'en') + ') — waiting for the operator');
          onConfirmed(sim);
        }
      } else ver.hold = 0;
      if (ver.phase === 'suspect' && !best) {
        ver.quiet = (ver.quiet || 0) + 1;
        if (ver.quiet >= 20) { ver.phase = 'idle'; ver.quiet = 0; ver.suspectAt = null; evt(sim, 'suspect-clear', null, 'انتهى الاشتباه (القراءات عادت طبيعية)', 'Suspicion cleared (readings back to normal)'); }
      } else ver.quiet = 0;
    }
    if (ver.confirmedAt !== null && t === ver.confirmedAt + P.approveSec) markAffectedAtZoneTime(sim);
    if (ver.phase === 'confirmed') {
      ver.keysNow = zones[ver.zone] ? Object.keys(zones[ver.zone].groups) : ver.keysNow;
      if (P.autoApprove && sim.mode === 'manara' && t >= ver.confirmedAt + P.approveSec) approveInternal(sim, 'operator-sim');
    }
    var cur = zones[ver.zone];
    ver.keys = {};
    for (var q = 0; q < sim.sensors.length; q++) { var c2 = sim.sensors[q]; if (c2.active) ver.keys[c2.key] = true; }
  }

  function onConfirmed(sim) {
    if (sim.mode === 'manara') { launchDroneIfNeeded(sim); createDispatchPlan(sim, 'manara'); }
  }
  function approveInternal(sim, who) {
    var ver = sim.ver;
    if (sim.mode !== 'manara') return false;   // the ordinary world has no operator and no verified package
    if (ver.phase !== 'confirmed') return false;
    ver.phase = 'public'; ver.approvedAt = sim.t; ver.publicAt = sim.t; ver.needsApproval = false;
    evt(sim, 'approved', { by: who }, 'اعتمد المشغّل التنبيه العام', 'The operator approved the public alert');
    if (sim.mode === 'manara') { issueAlert(sim); approveDispatchPlan(sim); if (sim.hazard === 'sos') launchDroneAed(sim); }
    return true;
  }

  // ---------------------------------------------------------------- zones & alert composer
  function zoneLevelFor(sim, a) {
    var w = sim.W, G = w.G, hz = sim.hazard, g = a.g, c = nodeCell(sim, g), st, S;
    if (a.away) return 'none';
    var x = G.nx[g], y = G.ny[g], sidx = G.nst[g];
    switch (hz) {
      case 'fire': {
        var hs = sim.hz.struct;
        if (sidx === hs) return 'evacuate';
        if (sidx >= 0) { var Sx = w.structs[sidx]; return smokeFcst(sim, Sx.cx, Sx.cy) > 0.02 ? 'shelter' : 'watch'; }
        var Sh = w.structs[hs], d = dist2(x, y, Sh.cx, Sh.cy);
        if (d * CELL < 60 || smokeFcstCell(sim, c) > 0.12) return 'evacuate';
        if (smokeFcstCell(sim, c) > 0.02 || d * CELL < 150) return 'shelter';
        return d * CELL < 400 ? 'watch' : 'none';
      }
      case 'gas': {
        var gc = gasFcstCell(sim, c) / sim.P.gasDanger;
        if (sidx >= 0) { var Sg = w.structs[sidx]; gc = gasFcstAt(sim, Sg.cx, Sg.cy) / sim.P.gasDanger; if (sidx === 0) gc = Math.max(gc, 0); }
        if (gc >= sim.P.gasWarn / sim.P.gasDanger * 0.5) return 'evacuate';
        var ds = dist2(x, y, sim.hz.src.x, sim.hz.src.y) * CELL;
        return ds < 300 ? 'shelter' : 'watch';
      }
      case 'flood': {
        if (sidx >= 0) return w.G.nfl[g] >= 1 ? 'shelter' : 'evacuate';
        var d2 = sim.F.water[c], low = w.elev[c] < 2.3;
        if (d2 >= 0.03 || low) return 'evacuate';
        return 'watch';
      }
      case 'dust': return 'shelter';
      case 'heat': return (a.loc === 'site' || a.loc === 'yard' || (a.loc === 'outdoor' && a.role !== 'staff')) ? 'evacuate' : 'watch';
      case 'sos': return (a.volunteer || a.id === sim.victim) ? 'evacuate' : 'none';
    }
    return 'none';
  }
  // "will it reach here soon?": the largest value anywhere on the upwind line within `seconds` of travel (a plume that is upwind WILL arrive).
  // Computed once per tick for the whole map (only where the field lives) and cached.
  function forecastField(sim, kind) {
    var rt = sim.rt, key = kind === 'gas' ? 'fcGas' : 'fcSmoke', stamp = key + 'T';
    if (rt[stamp] === sim.t && rt[key]) return rt[key];
    var F = kind === 'gas' ? sim.F.gas : sim.F.smoke, dst = rt[key] || (rt[key] = new Float32Array(NC)), seconds = kind === 'gas' ? 90 : 60, wind = sim.wind;
    dst.fill(0);
    var box = fieldBox(F, kind === 'gas' ? 0.02 : 0.003);
    rt[stamp] = sim.t;
    if (!box) return dst;
    var d = wind.speed * seconds / CELL * 0.6, ox = [], oy = [], k, x, y;
    for (k = 1; k <= 5; k++) { ox.push(Math.round(wind.ux * d * k / 5)); oy.push(Math.round(wind.uy * d * k / 5)); }
    var pad = Math.ceil(d) + 2, xa = Math.max(0, box.x0 - 1), xb = Math.min(W - 1, box.x1 + pad), ya = Math.max(0, box.y0 - pad), yb = Math.min(H - 1, box.y1 + pad);
    xa = Math.max(0, box.x0 - pad); ya = Math.max(0, box.y0 - pad); xb = Math.min(W - 1, box.x1 + pad); yb = Math.min(H - 1, box.y1 + pad);
    for (y = ya; y <= yb; y++) for (x = xa; x <= xb; x++) {
      var v = F[y * W + x];
      for (k = 0; k < 5; k++) {
        var sx = x - ox[k], sy = y - oy[k];
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) { var f = F[sy * W + sx]; if (f > v) v = f; }
      }
      dst[y * W + x] = v;
    }
    return dst;
  }
  function smokeFcstCell(sim, c) { return forecastField(sim, 'smoke')[c]; }
  function smokeFcst(sim, x, y) { return smokeFcstCell(sim, clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1)); }
  function gasFcstCell(sim, c) { return forecastField(sim, 'gas')[c]; }
  function gasFcstAt(sim, x, y) { return gasFcstCell(sim, clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1)); }

  var FORMATS = {   // delivery formats per person need (spec: sound, vibration, strobe, voice, picture card)
    deaf: ['strobe', 'vibration', 'text', 'pictogram'], blind: ['voice', 'vibration', 'sound'], child: ['card', 'voice', 'sound'],
    low: ['sound', 'vibration', 'text', 'pictogram'], std: ['sound', 'vibration', 'text']
  };
  function formatsFor(a) { return a.deaf ? FORMATS.deaf : a.blind ? FORMATS.blind : a.persona === 'child' ? FORMATS.child : (a.lang !== 'ar' && a.lang !== 'en') ? FORMATS.low : FORMATS.std; }

  var ACTIONS = {
    'fire.exit': T('اخرج الآن من المخرج الآمن واتبع الأسهم الخضراء', 'Leave now by the safe exit and follow the green arrows'),
    'fire.refuge': T('اذهب إلى شرفة اللجوء وابقَ هناك — الدفاع المدني يعرف مكانك', 'Go to the refuge balcony and stay there — Civil Defence knows where you are'),
    'fire.shelter': T('أغلق النوافذ وأوقف التكييف الذي يسحب هواءً من الخارج وابقَ في الداخل', 'Close windows, switch off fresh-air AC and stay indoors'),
    'fire.watch': T('تابع التنبيهات — لا خطر عليك الآن', 'Stay informed — no danger to you right now'),
    'gas.crosswind': T('ابتعد عن مصدر الغاز، عمودياً على اتجاه الرياح أو عكسها — لا تُشعل ولا تُشغّل أي مفتاح كهربائي', 'Leave the area away from the gas, crosswind or upwind — no flames, no electrical switches'),
    'gas.shelter': T('ابقَ في الداخل وأغلق النوافذ، ولا تُشعل ولا تُشغّل أي مفتاح كهربائي', 'Stay indoors, close windows, no flames and no electrical switches'),
    'gas.watch': T('تابع التنبيهات — لا خطر عليك الآن', 'Stay informed — no danger to you right now'),
    'flood.upstairs': T('اصعد إلى طابق أعلى أو أرض مرتفعة وابتعد عن النفق ولا تعبر مياهاً جارية', 'Move to an upper floor or higher ground; avoid the underpass and never cross moving water'),
    'flood.stay': T('ابقَ في الطابق العلوي ولا تنزل إلى الشارع', 'Stay on the upper floor and do not go down to the street'),
    'flood.watch': T('تابع التنبيهات — ابتعد عن المناطق المنخفضة', 'Stay informed — keep away from low areas'),
    'dust.shelter': T('ادخل إلى مبنى مغلق وأغلق النوافذ وضع كمامة؛ مرضى الربو أولاً', 'Go into a closed building, shut the windows, wear a mask; people with asthma first'),
    'heat.stopwork': T('أوقف العمل واذهب إلى مأوى التبريد واشرب ماءً', 'Stop work, go to the cooling shelter and drink water'),
    'heat.watch': T('اشرب ماءً وتابع التنبيهات', 'Drink water and stay informed'),
    'sos.victim': T('المساعدة في الطريق — ابقَ هادئاً ولا تتحرك إن استطعت', 'Help is on the way — stay calm and do not move if you can'),
    'sos.volunteer': T('شخص ينهار قربك — اذهب إليه الآن إن كنت مدرَّباً (الإسعاف في الطريق)', 'A person has collapsed near you — go now if you are trained (ambulance is on its way)')
  };
  function actionKey(sim, a, level) {
    var hz = sim.hazard;
    if (hz === 'fire') return level === 'evacuate' ? (a.persona === 'wheelchair' && a.g >= NC && sim.W.G.nfl[a.g] >= 1 ? 'fire.refuge' : 'fire.exit') : level === 'shelter' ? 'fire.shelter' : 'fire.watch';
    if (hz === 'gas') return level === 'evacuate' ? 'gas.crosswind' : level === 'shelter' ? 'gas.shelter' : 'gas.watch';
    if (hz === 'flood') return level === 'evacuate' ? 'flood.upstairs' : level === 'shelter' ? 'flood.stay' : 'flood.watch';
    if (hz === 'dust') return 'dust.shelter';
    if (hz === 'heat') return level === 'evacuate' ? 'heat.stopwork' : 'heat.watch';
    if (hz === 'sos') return a.id === sim.victim ? 'sos.victim' : 'sos.volunteer';
    return 'fire.watch';
  }

  function composeFor(sim, a) {
    var level = a.zoneLevel || zoneLevelFor(sim, a), key = actionKey(sim, a, level);
    return { level: level, action: key, lang: a.lang, draftTranslation: a.lang !== 'ar' && a.lang !== 'en', formats: formatsFor(a), text: ACTIONS[key] };
  }

  function issueAlert(sim) {
    var P = sim.P, t = sim.t, counts = { evacuate: 0, shelter: 0, watch: 0, none: 0 }, delivered = 0, overall = 'watch', scopeSet = {};
    sim.pre.scope.forEach(function (g) { scopeSet[g] = true; });
    var langs = {}, formatsN = {};
    sim.people.forEach(function (a) {
      if (a.away) return;
      a.zoneLevel = zoneLevelFor(sim, a);
      counts[a.zoneLevel]++;
    });
    var order = { none: 0, watch: 1, shelter: 2, evacuate: 3 };
    sim.people.forEach(function (a) { if (!a.away && order[a.zoneLevel] > order[overall === 'none' ? 'none' : overall] && a.zoneLevel !== 'none') overall = a.zoneLevel; });
    if (counts.evacuate > 0) overall = 'evacuate'; else if (counts.shelter > 0) overall = 'shelter'; else overall = 'watch';
    var A = sim.alert = { id: 'A1', hazard: sim.hazard, level: overall, issuedAt: t, area: DEMO_AREA, counts: counts, recipients: 0, byLang: langs, byFormat: formatsN,
      ladderStepSec: P.ladderStepSec, instructions: [] };
    // recipients: registered residents with the app, teachers (their classes follow), the guard, unregistered people by zone broadcast
    sim.people.forEach(function (a) {
      if (a.away) { a.checkinPlanned = hr(sim.seed, D.MISC, a.id, 11) < P.awayReplyPct / 100 ? t + P.deliverySec + 10 + 40 * hr(sim.seed, D.MISC, a.id, 12) : null; if (a.registered) { a.alertAt = t + P.deliverySec; a.alertSrc = 'app'; } return; }
      var zl = a.zoneLevel, src = null;
      if (zl === 'none' && !(a.follow >= 0 || a.escort >= 0)) return;
      if (a.follow >= 0 || a.escort >= 0) src = 'family';
      else if (a.app && (a.registered || a.volunteer || a.role === 'guard')) src = 'app';
      else if (!a.registered && a.role !== 'guard' && zl !== 'none' && hr(sim.seed, D.MISC, a.id, 13) < P.broadcastPct / 100) src = 'broadcast';
      else if (hr(sim.seed, D.MISC, a.id, 14) < P.signsPct / 100) { a.signs = true; }
      if (src && src !== 'family') {
        a.alertAt = t + P.deliverySec; a.alertSrc = src; delivered++;
        a.msg = composeFor(sim, a);
        langs[a.lang] = (langs[a.lang] || 0) + 1;
        a.msg.formats.forEach(function (f) { formatsN[f] = (formatsN[f] || 0) + 1; });
      } else if (src === 'family') { a.alertSrc = 'family'; }
    });
    // children follow their teacher or mother: they are informed when that person is
    sim.people.forEach(function (a) {
      if (a.away) return;
      var lead = a.follow >= 0 ? sim.people[a.follow] : a.escort >= 0 ? sim.people[a.escort] : null;
      if (lead && lead.alertAt !== null) { a.alertAt = lead.alertAt; a.alertSrc = a.follow >= 0 ? 'teacher' : 'family'; a.msg = composeFor(sim, a); delivered++; langs[a.lang] = (langs[a.lang] || 0) + 1; }
    });
    A.recipients = delivered;
    // short bilingual instruction lines for the phones
    var seen = {};
    ['evacuate', 'shelter', 'watch'].forEach(function (lv) {
      var k = actionKey(sim, { persona: 'adult', g: 0, id: -1 }, lv);
      if (counts[lv] > 0 && !seen[k]) { seen[k] = 1; A.instructions.push(ACTIONS[k]); }
    });
    evt(sim, 'public-alert', { level: overall, recipients: delivered, counts: counts }, 'أُرسل التنبيه العام إلى ' + delivered + ' شخصاً (إخلاء ' + counts.evacuate + '، إيواء ' + counts.shelter + ')', 'Public alert sent to ' + delivered + ' people (evacuate ' + counts.evacuate + ', shelter ' + counts.shelter + ')');
    sim.rt.dirty = true;
    if (sim.hazard === 'sos') { /* volunteers handled by the people step */ }
  }

  /* ====================================================================================
   * 9. ROUTING RUNTIME (danger -> costs -> fields) AND THE PEOPLE STEP
   *    MANARA world: informed people follow the live multi-source Dijkstra field of THIS hazard (exit states, smoke, plume,
   *    water depth, persona constraints). Ordinary world: a siren only; people follow a STATIC "nearest exit" field, see
   *    flames / deep water only locally, and discover a locked/burning exit by walking into it.
   * ==================================================================================== */
  var ROUTE_PERIOD = 4;   // seconds between live re-computations (also immediately when an exit state changes)
  var TK = { NONE: 0, ASSEMBLY: 1, SHELTER: 2, ROOF: 3, REFUGE: 4, UPSTAIRS: 5, INDOORS: 6, VICTIM: 7 };

  function initRouting(sim) {
    var G = sim.W.G, nEx = sim.W.exits.length;
    sim.rt = { pen: new Float32Array(G.N), blk: new Uint8Array(G.N), vis: new Uint8Array(G.N), tKind: new Int8Array(G.N),
      dyn: { std: { dist: new Float32Array(G.N), tOff: new Float32Array(G.N).fill(-1) }, ns: { dist: new Float32Array(G.N), tOff: new Float32Array(G.N).fill(-1) } },
      help: { dist: new Float32Array(G.N), tOff: new Float32Array(G.N).fill(-1) },
      exitBlock: new Uint8Array(nEx), exitPen: new Float32Array(nEx), dirty: false, tLast: -1e9, count: new Int16Array(G.N), cache: {}, ready: false, builds: 0,
      sig: '', noRoute: 0 };
  }

  function buildDanger(sim) {
    var rt = sim.rt, w = sim.W, G = w.G, F = sim.F, P = sim.P, hz = sim.hazard, c, i;
    rt.pen.fill(0); rt.blk.fill(0); rt.vis.fill(0);
    for (i = 0; i < sim.exits.length; i++) { var s = sim.exits[i].state; rt.exitBlock[i] = (s === 'LOCKED' || s === 'FIRE') ? 1 : 0; rt.exitPen[i] = s === 'SMOKE' ? 1.5 : 0; }
    if (hz === 'fire') {
      var list = sim.hz.outList, fcs = forecastField(sim, 'smoke');
      for (c = 0; c < NC; c++) { var sm = fcs[c]; if (sm > 0.003) { rt.pen[c] = 6 * Math.min(sm, 1.5) * Math.min(sm, 1.5); if (sm >= 0.9) rt.blk[c] = 1; } }
      for (i = 0; i < list.length; i++) {
        var fc = list[i], fx = fc % W, fy = (fc / W) | 0;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var nx = fx + dx, ny = fy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var nc = ny * W + nx, near = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
          rt.pen[nc] += near ? 6 : 2; if (near) { rt.blk[nc] = 1; if (dx === 0 && dy === 0) rt.vis[nc] = 1; }
        }
      }
      var S = w.structs[sim.hz.struct], st = sim.stt[sim.hz.struct];
      for (i = 0; i < S.nodes.length; i++) {
        var g = S.base + i, sm2 = st.smoke[i];
        rt.pen[g] = 8 * sm2 * sm2; if (st.burn[i] === 1 || sm2 >= 0.9) rt.blk[g] = 1; if (st.burn[i] === 1) rt.vis[g] = 1;
      }
    } else if (hz === 'gas') {
      var dgr = P.gasDanger, fcg = forecastField(sim, 'gas');
      for (c = 0; c < NC; c++) { var gv = fcg[c]; if (gv > 0.02 * dgr) { var r = gv / dgr; rt.pen[c] = 60 * Math.min(r, 3) * Math.min(r, 3); if (r >= 1) rt.blk[c] = 1; } }
      var S0 = w.structs[0], st0 = sim.stt[0];
      for (i = 0; i < S0.nodes.length; i++) { var r2 = st0.gas[i] / dgr; rt.pen[S0.base + i] = 60 * Math.min(r2, 3) * Math.min(r2, 3); if (r2 >= 1) rt.blk[S0.base + i] = 1; }
    } else if (hz === 'flood') {
      var bm = P.floodBlockCm / 100;
      for (c = 0; c < NC; c++) { var d = F.water[c]; if (d > 0.02) { rt.pen[c] = 4 * d / bm; if (d >= bm) { rt.blk[c] = 1; rt.vis[c] = 1; } } }
    }
  }

  function tgt(list, rt, g, off, kind) { list.push({ g: g, off: off }); rt.tKind[g] = kind; }
  function dynTargets(sim, cls) {
    var rt = sim.rt, w = sim.W, F = sim.F, P = sim.P, hz = sim.hazard, list = [], G = w.G;
    rt.tKind.fill(0);
    var ns = cls === 'ns';
    if (hz === 'fire') {
      var S = w.structs[sim.hz.struct], st = sim.stt[sim.hz.struct], fireCells = [], i;
      for (i = 0; i < S.nodes.length; i++) if (st.burn[i] === 1) fireCells.push([S.nodes[i].x, S.nodes[i].y]);
      for (i = 0; i < sim.hz.outList.length; i++) fireCells.push([sim.hz.outList[i] % W + 0.5, ((sim.hz.outList[i] / W) | 0) + 0.5]);
      w.assembly.forEach(function (a) {
        if (smokeFcstCell(sim, a.g) > 0.04 || rt.blk[a.g]) return;
        var near = false; for (var k = 0; k < fireCells.length; k++) if (dist2(a.x + 0.5, a.y + 0.5, fireCells[k][0], fireCells[k][1]) * CELL < P.safeDistM) { near = true; break; }
        if (!near) tgt(list, rt, a.g, 0, TK.ASSEMBLY);
      });
      if (sim.hz.struct === 0) {   // the residence: roof (only when the door can open) and the refuge balcony
        var roof = w.structs[0].byId['ROOF'].g, ref = w.structs[0].byId['REF'].g;
        if (!rt.exitBlock[3] && st.smoke[w.structs[0].byId['SB2'].local] < 0.6) tgt(list, rt, roof, 40, TK.ROOF);
        if (!rt.blk[ref]) tgt(list, rt, ref, ns ? 40 : 150, TK.REFUGE);
      }
    } else if (hz === 'gas') {
      var src = sim.hz.src;
      w.assembly.forEach(function (a) {
        var r = gasFcstCell(sim, a.g) / P.gasDanger;
        if (r >= P.gasWarn / P.gasDanger * 0.4 || dist2(a.x, a.y, src.x, src.y) * CELL < 150) return;
        if (sim.hz.heavy && lowSpot(w, a.x, a.y)) return;
        tgt(list, rt, a.g, 0, TK.ASSEMBLY);
      });
    } else if (hz === 'flood') {
      w.assembly.forEach(function (a) { if (w.elev[a.g] >= 2.3 && F.water[a.g] < 0.02) tgt(list, rt, a.g, 0, TK.ASSEMBLY); });
      w.structs.forEach(function (S) { S.nodes.forEach(function (n) { if (n.fl >= 1 && n.type !== NT.ROOF && n.type !== NT.REFUGE) { tgt(list, rt, S.base + n.local, 0, TK.UPSTAIRS); } }); });
    } else if (hz === 'dust' || hz === 'heat') {
      var cool = hz === 'heat';
      w.shelters.forEach(function (s) { if (!cool || s.cool) tgt(list, rt, s.g, 0, TK.SHELTER); });
      w.structs.forEach(function (S) { S.nodes.forEach(function (n) { if (n.type !== NT.ROOF && n.type !== NT.REFUGE) tgt(list, rt, S.base + n.local, 15, TK.INDOORS); }); });
    }
    return list;
  }
  function lowSpot(w, x, y) {   // heavier-than-air gas pools where the ground is lower than its surroundings
    var sum = 0, n = 0;
    for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) { var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { sum += w.elev[yy * W + xx]; n++; } }
    return w.elev[y * W + x] < sum / n - 0.12;
  }

  function recomputeFields(sim) {
    var rt = sim.rt, R = router(), t0 = Date.now(), P = sim.P;
    buildDanger(sim);
    // only the people who can use a route need the field: everyone alerted or on the move (the search stops once they are all settled)
    var need = rt.need || (rt.need = new Uint8Array(sim.W.G.N)), needCount = 0;
    need.fill(0);
    sim.people.forEach(function (a) {
      if (a.away || a.g < 0) return;
      var wants = (a.msg && a.alertAt !== null && planFromMsg(sim, a) !== 'stay') || a.st === 'moving' || a.st === 'waiting' || (a.st === 'safe' && a.safeKind === 'assembly') || (a.follow >= 0 || a.escort >= 0) && a.alertAt !== null;
      if (wants && !need[a.g]) { need[a.g] = 1; needCount++; }
    });
    if (sim.hazard === 'sos') {
      var vg = sim.people[sim.victim].g, list = [{ g: vg, off: 0 }];
      need.fill(0); needCount = 0;
      sim.people.forEach(function (a) { if (a.volunteer && !a.away && !need[a.g]) { need[a.g] = 1; needCount++; } });
      R.run(rt.help.dist, list, null, null, { stairFactor: P.stairFactor, need: need, needCount: needCount });
      rt.help.tOff.fill(-1); rt.help.tOff[vg] = 0; rt.tKind[vg] = TK.VICTIM;
    } else {
      var needNs = sim.people.some(function (a) { return a.persona === 'wheelchair' && !a.away && a.st !== 'safe' && a.st !== 'incapacitated'; });
      ['std', 'ns'].forEach(function (cls) {
        if (cls === 'ns' && !needNs) return;
        var targets = dynTargets(sim, cls), f = rt.dyn[cls];
        var nd2 = need.slice(); R.run(f.dist, targets, rt.pen, rt.blk, { noStairs: cls === 'ns', stairFactor: P.stairFactor, exitBlock: rt.exitBlock, exitPen: rt.exitPen, need: nd2, needCount: needCount });
        f.tOff.fill(-1); for (var i = 0; i < targets.length; i++) f.tOff[targets[i].g] = targets[i].off;
        if (cls === 'std') f.tKindSnap = null;
      });
    }
    rt.ready = true; rt.dirty = false; rt.tLast = sim.t; rt.builds++;
  }

  function routeKey(sim, a, field) {   // where this person's live route ends and which exit it crosses first
    var rt = sim.rt, G = sim.W.G, R = router(), u = a.g, guard = 0, ex = -1, opt = { noStairs: a.persona === 'wheelchair', stairFactor: sim.P.stairFactor, exitBlock: rt.exitBlock, detour: false };
    while (field.tOff[u] < 0 && guard++ < 300) {
      var n = R.next(u, field.dist, rt.pen, rt.blk, opt); if (n < 0) return -2;
      var e = R.edge(u, n); if (ex < 0 && (G.eFlag[e] & F_EXIT)) ex = G.eExit[e];
      u = n;
    }
    return u * 16 + (ex + 1);
  }
  function stepRouting(sim) {
    var rt = sim.rt;
    if (sim.mode !== 'manara' || !sim.alert) return;
    if (rt.dirty || sim.t - rt.tLast >= ROUTE_PERIOD) {
      var exitChange = rt.dirty && rt.ready, before = null, movers = null;
      if (exitChange) {
        movers = sim.people.filter(function (a) { return a.st === 'moving' && a.aware === 2 && !a.away && a.plan === 'evac'; });
        before = movers.map(function (a) { return routeKey(sim, a, fieldFor(sim, a)); });
      }
      recomputeFields(sim);
      if (before) {
        var changed = [];
        movers.forEach(function (a, i) { if (routeKey(sim, a, fieldFor(sim, a)) !== before[i]) { a.rerouted = (a.rerouted || 0) + 1; changed.push(a); } });
        rt.notified = (rt.notified || 0) + changed.length;
        if (changed.length) {
          var heroes = changed.filter(function (a) { return a.hero; }).map(function (a) { return a.name; });
          evt(sim, 'reroute', { affected: changed.length, of: movers.length }, 'تغيّر مسار الخروج — وصل مسار جديد إلى ' + changed.length + ' من ' + movers.length + ' يتحركون فقط' + (heroes.length ? ' (منهم ' + heroes.map(function (n) { return n.ar; }).join('، ') + ')' : ''),
            'Exit truth changed — a new route went to only ' + changed.length + ' of the ' + movers.length + ' people on the move' + (heroes.length ? ' (including ' + heroes.map(function (n) { return n.en; }).join(', ') + ')' : ''));
        }
      }
    }
  }

  // static ("nearest exit, nobody knows anything") fields for the ordinary world, cached by hazard class and discovered-bad-exit mask
  function staticTargets(sim, rt) {
    var w = sim.W, hz = sim.hazard, list = [];
    rt.tKind.fill(0);
    if (hz === 'fire' || hz === 'gas' || hz === 'flood') {
      w.assembly.forEach(function (a) { tgt(list, rt, a.g, 0, TK.ASSEMBLY); });
      if (hz === 'fire' && sim.hz.struct === 0) tgt(list, rt, w.structs[0].byId['ROOF'].g, 40, TK.ROOF);   // "the roof is an exit" — nobody knows it is locked
      if (hz === 'flood') w.structs.forEach(function (S) { S.nodes.forEach(function (n) { if (n.fl >= 1 && n.type !== NT.ROOF && n.type !== NT.REFUGE) tgt(list, rt, S.base + n.local, 60, TK.UPSTAIRS); }); });
    } else {
      w.shelters.forEach(function (s) { if (hz !== 'heat' || s.cool) tgt(list, rt, s.g, 0, TK.SHELTER); });
      w.structs.forEach(function (S) { S.nodes.forEach(function (n) { if (n.type !== NT.ROOF && n.type !== NT.REFUGE) tgt(list, rt, S.base + n.local, 15, TK.INDOORS); }); });
    }
    return list;
  }
  function staticField(sim, cls, mask, key) {
    var rt = sim.rt, ck = (key || sim.hazard) + '|' + cls + '|' + mask;
    var f = rt.cache[ck];
    if (f) return f;
    var G = sim.W.G, R = router(), exB = new Uint8Array(sim.W.exits.length), i;
    for (i = 0; i < exB.length; i++) if (mask & (1 << i)) exB[i] = 1;
    var targets, kinds = new Int8Array(G.N);
    if (key && key.indexOf('trip:') === 0) { var dest = +key.slice(5); targets = [{ g: dest, off: 0 }]; kinds[dest] = TK.ASSEMBLY; }
    else { var save = rt.tKind.slice(); targets = staticTargets(sim, rt); kinds = rt.tKind.slice(); rt.tKind.set(save); }
    f = { dist: new Float32Array(G.N), tOff: new Float32Array(G.N).fill(-1), kind: kinds };
    R.run(f.dist, targets, null, null, { noStairs: cls === 'ns', stairFactor: sim.P.stairFactor, exitBlock: exB });
    for (i = 0; i < targets.length; i++) f.tOff[targets[i].g] = targets[i].off;
    rt.cache[ck] = f;
    return f;
  }

  // ---------------------------------------------------------------- per-person hazard level (smoke density / ratio) and dose rate
  var LV = { s: 0, r: 0, d: false };
  function levelAt(sim, a) {
    var w = sim.W, G = w.G, g = a.g, P = sim.P, hz = sim.hazard, s = 0, r = 0, si = G.nst[g], c = g < NC ? g : -1, local;
    switch (hz) {
      case 'fire': {
        if (g >= NC) {
          if (si === sim.hz.struct) { local = g - w.structs[si].base; var st = sim.stt[si]; s = st.smoke[local]; if (st.burn[local] === 1) r += Math.max(0.05, st.I[local]) / 90; }   // flames: ~90 s at full intensity
        } else { s = sim.F.smoke[c]; if (sim.ofire[c] === 1) r += 1 / 20; }
        r += s * s / P.smokeIncapSec;
        break;
      }
      case 'gas': {
        var conc = g >= NC ? (si === 0 ? sim.stt[0].gas[g - w.structs[0].base] : 0) : sim.F.gas[c];
        s = conc / P.gasDanger; if (conc >= P.gasWarn) r = s * s / P.gasIncapSec;
        break;
      }
      case 'flood': {
        var d = g >= NC ? 0 : sim.F.water[c], bm = P.floodBlockCm / 100;
        s = d / bm; if (d >= bm) r = (d / bm) / P.floodIncapSec;
        break;
      }
      case 'dust': {
        var pm = g >= NC ? sim.F.dust[nodeCell(sim, g)] * P.indoorDustPct / 100 : sim.F.dust[c];
        if (a.st === 'sheltered' || a.safeKind === 'shelter') pm *= P.indoorDustPct / 100;
        s = pm / P.dustCritical; if (pm >= P.dustWarn) r = Math.min(s, 1.5) * Math.min(s, 1.5) / P.dustIncapSec * (a.asthma ? 3 : 1);
        break;
      }
    }
    if (a.hood) r *= sim.P.robotHoodFactor;   // a smoke hood handed over by the robot (named assumption)
    LV.s = s; LV.r = r;
    // "danger present here" for exposure statistics: visible smoke, gas above the warning level, water you would notice, dust above the warning level
    LV.d = hz === 'fire' ? (s >= 0.15 || r >= 0.05) : hz === 'gas' ? (r > 0) : hz === 'flood' ? (s * (P.floodBlockCm / 100) >= 0.05) : hz === 'dust' ? (r > 0) : false;
    return LV;
  }

  function hearsSiren(sim, a) {
    var L = sim.local; if (!L.on || a.deaf) return false;
    var G = sim.W.G, g = a.g;
    if (g >= NC) return L.struct >= 0 && G.nst[g] === L.struct;
    return dist2(G.nx[g], G.ny[g], L.pos.x, L.pos.y) * CELL <= L.radiusM;
  }

  function personaMult(a) { return a.persona === 'elderly' ? 1.5 : a.persona === 'wheelchair' ? 1.3 : a.blind ? 1.3 : 1; }

  function planFromMsg(sim, a) {
    var k = a.msg ? a.msg.action : null;
    if (!k) return 'none';
    if (k === 'fire.exit' || k === 'fire.refuge' || k === 'gas.crosswind' || k === 'flood.upstairs') return 'evac';
    if (k === 'dust.shelter' || k === 'heat.stopwork') return 'shelter';
    if (k === 'sos.volunteer') return 'help';
    return 'stay';
  }
  function planOrdinary(sim, a) {
    var hz = sim.hazard;
    if (hz === 'fire' || hz === 'gas' || hz === 'flood') return 'evac';
    if (hz === 'dust' || hz === 'heat') return 'shelter';
    return 'none';
  }

  function setAware(sim, a, level, src) {
    var P = sim.P, t = sim.t;
    if (level <= a.aware) return;
    var first = a.aware === 0;
    a.aware = level; if (first) { a.awareAt = t; a.awareSrc = src; } if (level === 2) a.aware2At = t;
    var wasMoving = a.st === 'moving';
    a.plan = level === 2 ? planFromMsg(sim, a) : planOrdinary(sim, a);
    if (level === 2 && a.plan === 'none') a.plan = 'stay';
    var rx = P.reactionSec * a.rf * personaMult(a);
    var mill = level === 2 ? P.millingManaraSec : (src === 'self' ? 10 : P.millingOrdinarySec);
    var lang = (level === 1 && src === 'siren' && a.lang !== 'ar' && a.lang !== 'en') ? P.langDelayOrdinarySec : 0;
    var wake = a.wokeAt !== null ? P.wakeUpSec : 0;
    var mv = t + rx + mill + lang + wake;
    if (a.follow >= 0) { var lead = sim.people[a.follow]; if (lead.moveAt >= 0) mv = Math.max(mv, lead.moveAt + 8); else mv = Math.max(mv, t + 30); }
    if (a.escort >= 0) { var lead2 = sim.people[a.escort]; if (lead2.moveAt >= 0) mv = Math.max(mv, lead2.moveAt + 8); }
    if (a.moveAt < 0 || mv < a.moveAt) a.moveAt = mv;
    a.msg = a.msg || null;
    if (wasMoving) { /* already on the way: only the field changes (live route from now on) */ }
  }

  function personPos(sim, a) {
    var G = sim.W.G;
    if (a.g < 0) return { x: 0, y: 0, fl: 0 };
    if (a.to >= 0 && a.edgeLen > 0) { var f = clamp(a.prog / a.edgeLen, 0, 1); return { x: lerp(G.nx[a.g], G.nx[a.to], f), y: lerp(G.ny[a.g], G.ny[a.to], f), fl: f < 0.5 ? G.nfl[a.g] : G.nfl[a.to] }; }
    return { x: G.nx[a.g] + a.ox, y: G.ny[a.g] + a.oy, fl: G.nfl[a.g] };
  }

  function fieldFor(sim, a) {
    var rt = sim.rt, cls = a.persona === 'wheelchair' ? 'ns' : 'std';
    if (a.plan === 'help') return rt.help;
    var live = sim.mode === 'manara' && rt.ready && (a.aware === 2 || (a.signs && sim.ver.phase === 'public'));
    if (a.trip >= 0 && a.plan === 'trip') return staticField(sim, cls, a.badExits, 'trip:' + a.trip);
    if (live) return rt.dyn[cls];
    return staticField(sim, cls, a.badExits);
  }

  function exitPassable(sim, gi) { var s = sim.exits[gi].state; return !(s === 'LOCKED' || s === 'FIRE'); }

  function moveAgent(sim, a, rt) {
    var G = sim.W.G, R = router(), P = sim.P, budgetT = 1, guard = 0;
    var field = fieldFor(sim, a), live = (field === rt.dyn.std || field === rt.dyn.ns || field === rt.help);
    var opt = { noStairs: a.persona === 'wheelchair', stairFactor: P.stairFactor, exitBlock: live ? rt.exitBlock : null, prev: a.prev, detour: !live, avoid: live ? null : (sim.alert || sim.hazard === 'flood' || sim.hazard === 'fire' ? rt.vis : null) };
    if (!live && a.badExits) { opt.exitBlock = new Uint8Array(sim.W.exits.length); for (var q = 0; q < opt.exitBlock.length; q++) if (a.badExits & (1 << q)) opt.exitBlock[q] = 1; }
    while (budgetT > 0.0001 && guard++ < 8) {
      if (field.tOff[a.g] >= 0 && a.to < 0) { arrive(sim, a, field); return; }
      if (a.to < 0) {
        var nx = R.next(a.g, field.dist, live ? rt.pen : null, live ? rt.blk : null, opt);
        if (nx < 0) {   // nothing improves: wait (MANARA: the route may be cut) 
          a.stuck = (a.stuck || 0) + 1;
          if (a.trip >= 0 && a.plan === 'trip') { a.plan = 'evac'; a.trip = -1; a.aware = Math.max(a.aware, 1); a.stuck = 0; }
          else if (a.stuck > 12 && a.st !== 'waiting') {
            a.st = 'waiting'; a.waitSince = sim.t;
            if (!a.trappedLogged) { a.trappedLogged = true; if (live || a.hero || a.persona === 'wheelchair') evt(sim, 'trapped', { person: a.key, live: live }, 'شخص بلا مسار آمن: ' + (a.name ? a.name.ar : a.key), 'Person with no safe route: ' + (a.name ? a.name.en : a.key)); }
          }
          return;
        }
        var e = R.edge(a.g, nx), fl = G.eFlag[e];
        if (fl & F_EXIT) {   // exits: locked / burning exits stop people (the ordinary world only finds out here)
          var gi = G.eExit[e];
          if (!exitPassable(sim, gi)) {
            if (!live) {
              a.badExits |= (1 << gi); a.discoveries = (a.discoveries || 0) + 1; a.stuck = 0;
              sim.evCount['dead-end'] = (sim.evCount['dead-end'] || 0) + 1;
              if (a.hero) evt(sim, 'dead-end', { person: a.key, exit: sim.exits[gi].id }, 'وجد ' + a.name.ar + ' المخرج «' + sim.exits[gi].name.ar + '» مغلقاً أو مشتعلاً وعاد', a.name.en + ' found the exit "' + sim.exits[gi].name.en + '" locked or burning and turned back');
              else if (!sim.deadEndLog || sim.t - sim.deadEndLog >= 20) { sim.deadEndLog = sim.t; evt(sim, 'dead-end', { exit: sim.exits[gi].id, total: sim.evCount['dead-end'] }, 'أشخاص يجدون المخرج «' + sim.exits[gi].name.ar + '» مقفلاً أو مشتعلاً ويعودون (المجموع ' + sim.evCount['dead-end'] + ')', 'People keep finding the exit "' + sim.exits[gi].name.en + '" locked or burning and turning back (total ' + sim.evCount['dead-end'] + ')'); }
              return;
            }
            return;
          }
        }
        if (G.eDoor[e] >= 0) { var dd = G.eDoor[e], si = (dd / 1000) | 0; sim.stt[si].doorOpen[dd % 1000] = 1; }
        a.to = nx; a.prog = 0; a.edgeLen = G.eLen[e]; a.edgeFlag = fl;
      }
      var vfac = 1, g0 = a.g;
      var cnt = rt.count[a.g], cap = P.crowdCap;
      if (cnt > cap) vfac *= cap / cnt;
      if (a.edgeFlag & F_STAIRS) vfac /= P.stairFactor;
      levelAt(sim, a);
      if (sim.hazard === 'fire') vfac *= 1 - P.smokeSlowPct / 100 * Math.min(1, LV.s * 1.5);
      else if (sim.hazard === 'flood') vfac *= Math.max(0.25, 1 - LV.s * 0.5);
      else if (sim.hazard === 'dust') vfac *= 1 - 0.3 * Math.min(1, LV.s);
      var step = a.speed * vfac * budgetT, rem = a.edgeLen - a.prog;
      if (step >= rem) { budgetT -= rem / (a.speed * vfac); a.prev = a.g; a.g = a.to; a.to = -1; a.prog = 0; a.stuck = 0; }
      else { a.prog += step; budgetT = 0; }
    }
  }

  // "walk away from what you can see": people standing at an assembly point that the smoke / gas / water then reaches drift to cleaner ground
  function fleeStep(sim, a) {
    var w = sim.W, F = sim.hazard === 'gas' ? sim.F.gas : sim.hazard === 'flood' ? sim.F.water : sim.F.smoke, c = a.g, cx = c % W, cy = (c / W) | 0, best = c, bv = F[c];
    for (var k = 0; k < 8; k++) {
      var nx = cx + NB8[k][0], ny = cy + NB8[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var n = ny * W + nx; if (!w.walk[n] || sim.ofire[n] === 1) continue;
      if (F[n] < bv - 1e-6) { bv = F[n]; best = n; }
    }
    if (best === c) { a.fleeStuck = (a.fleeStuck || 0) + 1; return false; }
    a.prev = a.g; a.g = best; a.fleeStuck = 0; return true;
  }
  function arrive(sim, a, field) {
    var t = sim.t, w = sim.W, kind = (field.kind ? field.kind[a.g] : sim.rt.tKind[a.g]);
    if (a.plan === 'help') { a.st = 'safe'; a.safeKind = 'victim'; a.safeAt = t; if (a.firstSafeAt === null) a.firstSafeAt = t; a.helpArrivedAt = t; volunteerArrived(sim, a); return; }
    a.safeAt = t; if (a.firstSafeAt === null) a.firstSafeAt = t;
    var K2 = { 1: 'assembly', 2: 'shelter', 3: 'roof', 4: 'refuge', 5: 'upstairs', 6: 'indoors', 7: 'victim' };
    a.safeKind = K2[kind] || 'safe';
    if (sim.hazard === 'heat' && (kind === 2 || kind === 6)) a.safeKind = 'cool';
    if (kind === 4) { a.st = 'sheltered'; a.needsHelp = true; }
    else if (kind === 3) { a.st = 'safe'; a.roof = true; }
    else a.st = (kind === 2 || kind === 6 || kind === 5) ? 'sheltered' : 'safe';
    if (a.st === 'sheltered' && kind !== 4) a.st = 'safe';
    if (a.hero) evt(sim, 'safe', { person: a.key, kind: a.safeKind, hero: a.hero }, a.name.ar + ' وصل/ت إلى مكان آمن', a.name.en + ' reached safety');
    else sim.evCount['safe'] = (sim.evCount['safe'] || 0) + 1;
  }

  // ---------------------------------------------------------------- the step for every person
  function stepPeople(sim) {
    var t = sim.t, P = sim.P, rt = sim.rt, G = sim.W.G, people = sim.people, n = people.length, i, a;
    rt.count.fill(0);
    for (i = 0; i < n; i++) { a = people[i]; if (!a.away && a.g >= 0) rt.count[a.g]++; }
    var hzOn = sim.hz.started;
    for (i = 0; i < n; i++) {
      a = people[i];
      if (a.away) { stepCheckin(sim, a); continue; }
      if (a.st === 'incapacitated' || a.st === 'down') { stepDown(sim, a); stepCheckin(sim, a); continue; }
      // 1. dose
      if (hzOn && sim.hazard !== 'heat' && sim.hazard !== 'sos' && !a.rescued) {
        levelAt(sim, a);
        if (LV.d && a.enteredDangerAt === null) a.enteredDangerAt = t;
        if (LV.d) a.exposedSec++;
        if (LV.r > 0) {
          a.dose += LV.r;
          if (!a.injured && a.dose >= 0.3) { a.injured = true; a.injuredAt = t; if (a.hero) evt(sim, 'injured', { person: a.key }, a.name.ar + ' تعرّض/ت لإصابة في النموذج', a.name.en + ' was injured in the model'); }
          if (a.dose >= 1) { a.st = 'incapacitated'; a.downAt = t; a.moveAt = -1; evt(sim, 'incapacitated', { person: a.key, hero: a.hero }, 'عجز شخص عن الحركة (نموذج): ' + (a.name ? a.name.ar : a.key), 'A person became unable to move (model): ' + (a.name ? a.name.en : a.key)); continue; }
        }
      }
      // 2. awareness
      if (a.alertAt !== null && t >= a.alertAt && !a.alertDelivered && sim.mode === 'manara') {
        a.alertDelivered = true;
        if (!a.asleep) { setAware(sim, a, 2, a.alertSrc); if (a.msg && a.hero) evt(sim, 'person-alert', { person: a.key, action: a.msg.action, lang: a.lang, formats: a.msg.formats }, 'وصلت رسالة إلى ' + a.name.ar + ' بلغته/ها (' + a.lang + ')', 'A message reached ' + a.name.en + ' in their language (' + a.lang + ')'); }
        else if (a.alertSrc !== 'family' && a.alertSrc !== 'teacher') { a.ladderStage = 0; a.ladderLog.push({ t: t, stage: 0 }); if (a.hero) evt(sim, 'ladder', { person: a.key, stage: 0 }, 'سلّم الإيقاظ: الدرجة 0 لـ ' + a.name.ar + ' (صوت + اهتزاز' + (a.deaf ? ' + وميض' : '') + ')', 'Wake-up ladder step 0 for ' + a.name.en + ' (sound + vibration' + (a.deaf ? ' + strobe' : '') + ')'); }
      }
      if (a.asleep) wakeRoll(sim, a);
      if (!a.asleep && a.aware < 2 && a.alertDelivered && a.alertSrc) setAware(sim, a, 2, a.alertSrc);
      if (!a.asleep && a.aware === 0 && hzOn) {
        if (hearsSiren(sim, a)) setAware(sim, a, 1, 'siren');
        else if (perceives(sim, a)) setAware(sim, a, 1, 'self');
        else if (a.follow >= 0) { var ld = people[a.follow]; if (ld.aware >= 1 && ld.moveAt >= 0) setAware(sim, a, 1, 'follow'); }
        if (a.aware === 0 && sim.hazard === 'heat' && sim.mode === 'ordinary' && a.loc !== 'room' && t >= P.ordinaryBreakMin * 60 && a.st === 'working') setAware(sim, a, 1, 'break');
      }
      if (!a.asleep && a.aware === 1 && sim.mode === 'manara' && a.signs && sim.ver.phase === 'public') { /* sign-following: uses the live field (see fieldFor) */ }
      // 3. start moving / staying
      if (a.immobile && a.moveAt >= 0 && t >= a.moveAt && a.st !== 'waiting') {   // a scenario condition (never set in the original presets): the person cannot leave without help
        a.st = 'waiting'; a.waitSince = t; a.moveAt = -1;
        if (!a.trappedLogged) { a.trappedLogged = true; evt(sim, 'trapped', { person: a.key, live: true }, 'شخص بلا مسار آمن: ' + (a.name ? a.name.ar : a.key), 'Person with no safe route: ' + (a.name ? a.name.en : a.key)); }
      }
      if (a.moveAt >= 0 && t >= a.moveAt && a.st !== 'moving' && a.st !== 'safe' && a.st !== 'sheltered' && a.st !== 'waiting') {
        if (a.plan === 'stay') { a.st = 'sheltered'; a.safeKind = 'stay'; a.safeAt = t; if (a.firstSafeAt === null) a.firstSafeAt = t; }
        else if (a.plan === 'evac' || a.plan === 'shelter' || a.plan === 'help' || a.plan === 'trip') a.st = 'moving';
        else { a.moveAt = -1; }
      }
      // 4. move
      if (a.st === 'safe' && a.g < NC && a.safeKind === 'assembly' && (sim.mode === 'ordinary' || a.aware < 2) && hzOn && (sim.hazard === 'fire' || sim.hazard === 'gas' || sim.hazard === 'flood')) {
        levelAt(sim, a);
        if (LV.d) { a.smokyFor = (a.smokyFor || 0) + 1; if (a.smokyFor >= 10 && t % 3 === 0) { a.fled = true; fleeStep(sim, a); } } else a.smokyFor = 0;
      }
      if (a.st === 'safe' && a.aware === 2 && a.g < NC && a.safeKind === 'assembly' && sim.mode === 'manara' && rt.ready && t % 2 === 0) {   // the assembly point itself became unsafe: a new route goes to these people
        var fld = a.persona === 'wheelchair' ? rt.dyn.ns : rt.dyn.std;
        if (fld.tOff[a.g] < 0 && fld.dist[a.g] < Infinity) {
          a.st = 'moving'; a.safeAt = null; a.safeKind = null; a.rerouted = (a.rerouted || 0) + 1; rt.notified = (rt.notified || 0) + 1; a.checkin = null; a.checkinPlanned = null;
          if (!sim.movedAssembly || t - sim.movedAssembly > 20) { sim.movedAssembly = t; evt(sim, 'reroute', { cause: 'assembly-unsafe' }, 'صار موضع التجمع غير آمن (دخان/غاز) — مسار جديد لمن فيه فقط', 'The assembly point became unsafe (smoke/gas) — a new route goes only to the people there'); }
        }
      }
      if (a.st === 'waiting' && !a.immobile && (t - a.waitSince) % 6 === 5) { a.stuck = 0; a.st = 'moving'; }   // look for a route again every few seconds
      if (a.st === 'moving') moveAgent(sim, a, rt);
      stepCheckin(sim, a);
    }
  }

  function perceives(sim, a) {
    var P = sim.P;
    levelAt(sim, a);
    switch (sim.hazard) {
      case 'fire': return LV.s > 0.12 || (a.g < NC && sim.ofire[a.g] === 1);
      case 'gas': return LV.s >= P.gasWarn / P.gasDanger * 0.4;
      case 'flood': return LV.s * (P.floodBlockCm / 100) >= 0.05;
      case 'dust': return LV.s * P.dustCritical >= P.dustWarn && a.g < NC;
    }
    return false;
  }

  function wakeRoll(sim, a) {
    var P = sim.P, t = sim.t, ps = 0, pl = 0;
    var lead = a.escort >= 0 ? sim.people[a.escort] : (a.follow >= 0 ? sim.people[a.follow] : null);
    if (lead && !lead.asleep && lead.wokeAt !== null && t >= lead.wokeAt + 10) { wake(sim, a); return; }
    if (hearsSiren(sim, a)) ps = a.deaf ? P.wakeDeafSiren : P.wakeSiren;
    if (sim.hazard === 'fire' && a.g >= NC && sim.hz.started) { levelAt(sim, a); if (LV.s >= 0.3) ps = 1 - (1 - ps) * (1 - 0.10); }
    if (a.alertDelivered && sim.mode === 'manara' && a.alertSrc !== 'family' && a.alertSrc !== 'teacher') {
      var stage = Math.min(3, Math.floor((t - a.alertAt) / P.ladderStepSec));
      if (stage !== a.ladderStage && stage > a.ladderStage) {
        a.ladderStage = stage; a.ladderLog.push({ t: t, stage: stage });
        if (a.hero) evt(sim, 'ladder', { person: a.key, stage: stage }, 'سلّم الإيقاظ: الدرجة ' + stage + ' لـ ' + a.name.ar, 'Wake-up ladder step ' + stage + ' for ' + a.name.en);
      }
      pl = Math.min(0.95, P.wakePhone + P.wakeLadderBoost * Math.max(0, a.ladderStage));
    }
    if (ps <= 0 && pl <= 0) return;
    var p30 = 1 - (1 - ps) * (1 - pl), p1 = 1 - Math.pow(1 - p30, 1 / 30);
    if (hr(sim.seed, D.WAKE, a.id, t) < p1) wake(sim, a);
  }
  function wake(sim, a) {
    a.asleep = false; a.wokeAt = sim.t;
    if (a.ladderStage >= 0 && a.ladderStopAt === null) { a.ladderStopAt = sim.t; if (a.hero) evt(sim, 'ladder-stop', { person: a.key, stage: a.ladderStage }, 'استيقظ/ت ' + a.name.ar + ' وأكّد/ت — توقّف السلّم', a.name.en + ' woke and confirmed — the ladder stopped'); }
    else if (a.hero) evt(sim, 'woke', { person: a.key }, 'استيقظ/ت ' + a.name.ar, a.name.en + ' woke up');
  }

  // the guard desk: knocks doors. MANARA hands him the list of rooms with people still asleep, most vulnerable / closest to the danger first (ladder step 2).
  function stepGuard(sim) {
    if (!(sim.hazard === 'fire' || sim.hazard === 'gas')) return;
    var P = sim.P, t = sim.t, K = sim.knock, ordinary = sim.mode === 'ordinary';
    if (!K) {
      if (ordinary) { if (!P.ordinaryGuardKnock || !sim.local.on) return; sim.knock = K = { startAt: sim.local.at + 90, nextAt: null, visited: {}, count: 0, woke: 0 }; }
      else { if (!sim.alert) return; sim.knock = K = { startAt: sim.alert.issuedAt + 2 * P.ladderStepSec, nextAt: null, visited: {}, count: 0, woke: 0 }; }
    }
    if (t < K.startAt) return;
    if (K.nextAt === null) K.nextAt = t;
    if (t < K.nextAt) return;
    var w = sim.W, RB = w.structs[0], fireNode = sim.hazard === 'fire' ? w.structs[sim.hz.struct].nodes[sim.hz.originLocal] : null, best = null, bestScore = -1e9;
    var rooms = {};
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (!a.asleep || a.away || a.role !== 'resident' || !a.room || K.visited[a.room]) continue;
      if (!ordinary && (a.zoneLevel !== 'evacuate' && a.zoneLevel !== 'shelter')) continue;
      var r = rooms[a.room] || (rooms[a.room] = { room: a.room, n: 0, needs: 0, who: [] });
      r.n++; r.who.push(a); if (a.persona !== 'adult' || a.deaf || a.blind) r.needs++;
    }
    for (var key in rooms) {
      var r2 = rooms[key], node = RB.byId['R' + key], sc;
      if (ordinary) sc = -(+key);                                    // no information: door order
      else sc = r2.needs * 10 + (fireNode && node ? Math.max(0, 8 - dist2(node.x, node.y, fireNode.x, fireNode.y)) : 0) - (node ? node.fl * 0.01 : 0);
      if (sc > bestScore) { bestScore = sc; best = r2; }
    }
    if (!best) { K.nextAt = t + 5; return; }
    K.visited[best.room] = 1; K.count++; K.nextAt = t + P.guardKnockSec;
    best.who.forEach(function (a) { if (hr(sim.seed, D.WAKE, a.id, 100000 + t) < P.knockWakeP) { wake(sim, a); K.woke++; if (a.hero) evt(sim, 'knock', { person: a.key }, 'طرق الحارس باب ' + a.name.ar + ' فاستيقظ/ت', 'The guard knocked on ' + a.name.en + '\'s door and they woke'); } });
  }

  // collapsed / incapacitated people: wait for help or rescue
  function stepDown(sim, a) {
    // handled by dispatch effects (ambulance / rescue / volunteer / drone) in section 11
  }

  // ---------------------------------------------------------------- check-in & headcount
  function stepCheckin(sim, a) {
    var t = sim.t, P = sim.P;
    if (a.checkin !== null) return;
    if (sim.mode !== 'manara' && !(P.rollCall && a.safeKind === 'assembly')) return;
    if (a.away) {
      if (a.checkinPlanned !== null && a.checkinPlanned !== undefined && t >= a.checkinPlanned) { a.checkin = 'safe'; a.checkinAt = t; a.checkinAway = true; }
      return;
    }
    if (sim.mode !== 'manara') {   // ordinary world with a paper roll call at the assembly point
      if (a.st === 'safe' && a.safeKind === 'assembly' && t >= a.safeAt + 120) { a.checkin = 'safe'; a.checkinAt = t; }
      return;
    }
    if (!sim.alert) return;
    if (a.st === 'safe' || (a.st === 'sheltered' && a.safeKind !== 'refuge')) {
      var lead = a.follow >= 0 ? sim.people[a.follow] : (a.escort >= 0 ? sim.people[a.escort] : null);
      if (a.checkinPlanned === null || a.checkinPlanned === undefined) {
        var tp = null;
        if (lead) { if (lead.safeAt !== null) tp = Math.max(a.safeAt, lead.safeAt) + 20; }
        else if (a.app) tp = a.safeAt + P.checkinSec;
        else if (a.safeKind === 'assembly' && hr(sim.seed, D.MISC, a.id, 21) < P.kioskPct / 100) tp = a.safeAt + 40;
        a.checkinPlanned = tp === null ? undefined : tp;
      }
      if (a.checkinPlanned !== undefined && a.checkinPlanned !== null && t >= a.checkinPlanned) { a.checkin = 'safe'; a.checkinAt = t; sim.evCount['checkin'] = (sim.evCount['checkin'] || 0) + 1; }
    } else if ((a.st === 'sheltered' && a.safeKind === 'refuge') || a.st === 'waiting') {
      if (a.app && t >= (a.safeAt !== null ? a.safeAt : a.awareAt) + 15) { a.checkin = 'help'; a.checkinAt = t; evt(sim, 'checkin', { person: a.key, status: 'help', hero: a.hero }, 'طلب ' + (a.name ? a.name.ar : 'شخص') + ' المساعدة', (a.name ? a.name.en : 'A person') + ' asked for help'); }
    }
  }

  function headcount(sim) {
    var scope = {}, reg = 0, safe = 0, safeAway = 0, help = 0, un = 0, rooms = {}, unaccounted = [], helpList = [], rbOn = !!(sim.rb && sim.rb.enabled), located = [];
    sim.pre.scope.forEach(function (g) { scope[g] = true; });
    sim.people.forEach(function (a) {
      if (!a.registered || !scope[a.group]) return;
      reg++;
      if (a.checkin === 'safe') { if (a.away || a.checkinAway) safeAway++; else safe++; }
      else if (a.checkin === 'help') { help++; helpList.push(a); }
      else if (rbOn && a.robotReportedAt !== undefined && a.robotReportedAt !== null) { located.push(a); }   // 'located by robot': found and reported, but NOT safe and not checked in
      else { un++; unaccounted.push(a); }
    });
    var fireNode = sim.hazard === 'fire' ? sim.W.structs[sim.hz.struct].nodes[sim.hz.originLocal] : null;
    var list = unaccounted.map(function (a) {
      var needs = [];
      if (a.persona === 'wheelchair') needs.push('wheelchair'); if (a.persona === 'elderly') needs.push('elderly'); if (a.persona === 'child') needs.push('child'); if (a.deaf) needs.push('deaf'); if (a.blind) needs.push('blind'); if (a.asthma) needs.push('asthma');
      var score = needs.length * 10;
      var room = a.room || a.cls || null;
      if (fireNode && a.room) { var nn = sim.W.structs[sim.hz.struct].byId['R' + a.room]; if (nn) score += Math.max(0, 8 - dist2(nn.x, nn.y, fireNode.x, fireNode.y)) + (nn.fl === fireNode.fl ? 4 : 0); }
      return { key: a.key, name: a.name, room: room, lang: a.lang, needs: needs, score: round1(score), asleep: a.asleep, last: a.st };
    }).sort(function (x, y) { return y.score - x.score; });
    sim.people.forEach(function (a) { if (a.registered && scope[a.group] && a.room) { var r = rooms[a.room] || (rooms[a.room] = rbOn ? { room: a.room, total: 0, safe: 0, help: 0, located: 0, unaccounted: 0 } : { room: a.room, total: 0, safe: 0, help: 0, unaccounted: 0 }); r.total++; if (a.checkin === 'safe') r.safe++; else if (a.checkin === 'help') r.help++; else if (rbOn && a.robotReportedAt !== undefined && a.robotReportedAt !== null) r.located++; else r.unaccounted++; } });
    var hcOut = { registered: reg, safe: safe, safeAway: safeAway, help: help, unaccounted: un, rooms: rooms, unaccountedList: list, helpList: helpList.map(function (a) { return { key: a.key, name: a.name, room: a.room, lang: a.lang }; }) };
    if (rbOn) {   // registered = safe + safeAway + help + located + unaccounted (located = found and reported by a robot, not yet safe)
      hcOut.located = located.length;
      hcOut.locatedList = located.map(function (a) {
        var f = sim.rb.finds.filter(function (x) { return x.id === a.robotFindId; })[0] || null;
        return { key: a.key, name: a.name, room: a.room || a.cls || null, lang: a.lang, needs: needsOf(a), by: 'robot', foundAt: f ? f.t : null, reportedAt: a.robotReportedAt, place: f ? f.place : null, condition: f ? f.condition.key : null, find: a.robotFindId || null };
      });
    }
    return hcOut;
  }

  /* ====================================================================================
   * 10. THE DOCKED DRONE (a concept: operated by Civil Defence under national drone rules, never "autonomous")
   *     DOCKED -> LAUNCH -> TRANSIT -> PATROL -> TRACK -> HOLD (-> YIELD to firefighting assets) -> RETURN -> CHARGING
   *     Signature: friendly light (steady green + white double flash every 2 s). Battery drains faster in the heat (assumption).
   * ==================================================================================== */
  function initDrone(sim) {
    var d = sim.W.dock;
    sim.drone = { state: 'DOCKED', since: 0, x: d.x, y: d.y, alt: 0, battery: 1, light: 'off', mission: null, standoff: null, target: null, launchAt: null, yields: false,
      located: 0, arrivedAt: null, aedAt: null, flownM: 0, ordered: false };
  }
  function droneEndurance(sim) {   // flight minutes, derated above 40 C (assumed -1.5 % of capacity per degree) — a labelled assumption
    var P = sim.P; return P.droneBattMin * (1 - 0.015 * Math.max(0, P.ambientC - 40));
  }
  function setDrone(sim, state, ar, en) {
    var d = sim.drone; d.state = state; d.since = sim.t;
    evt(sim, 'drone', { state: state }, ar, en);
  }
  function incidentCentre(sim) {
    var w = sim.W;
    switch (sim.hazard) {
      case 'fire': { var S = w.structs[sim.hz.struct]; return { x: S.cx, y: S.cy }; }
      case 'gas': return { x: sim.hz.src.x, y: sim.hz.src.y };
      case 'flood': return { x: w.underpass.x, y: w.underpass.y };
      case 'dust': return { x: W / 2, y: H / 2 };
      case 'heat': return { x: w.site.x, y: w.site.y };
      case 'sos': { var v = sim.people[sim.victim]; return { x: w.G.nx[v.g], y: w.G.ny[v.g] }; }
    }
    return { x: W / 2, y: H / 2 };
  }
  function launchDroneIfNeeded(sim) {
    var d = sim.drone;
    if (sim.mode !== 'manara' || d.ordered) return;
    if (sim.hazard === 'sos') return;   // the AED flight waits for the human key (see approveInternal)
    d.ordered = true; d.launchAt = sim.t + sim.P.droneLaunchSec; d.mission = 'survey';
    evt(sim, 'drone-ordered', null, 'طُلب إقلاع الطائرة (تشغّلها جهة مختصة)', 'Drone launch ordered (operated by the authority)');
  }
  function launchDroneAed(sim) {
    var d = sim.drone;
    if (sim.mode !== 'manara' || d.ordered) return;
    d.ordered = true; d.launchAt = sim.t + sim.P.droneLaunchSec; d.mission = 'aed';
    evt(sim, 'drone-ordered', null, 'طُلب إقلاع الطائرة بجهاز إنعاش (بموافقة الجهة المشغّلة)', 'Drone with an AED ordered (with the operating authority\'s go-ahead)');
  }
  function standoffPoint(sim) {
    var c = incidentCentre(sim), ux = -sim.wind.ux, uy = -sim.wind.uy;   // upwind side
    var off = sim.hazard === 'sos' ? 0 : sim.hazard === 'gas' ? 14 : sim.hazard === 'dust' ? 0 : 8;
    return { x: clamp(c.x + ux * off, 1, W - 2), y: clamp(c.y + uy * off, 1, H - 2) };
  }
  function stepDrone(sim) {
    var d = sim.drone, t = sim.t, P = sim.P, cps = P.droneSpeedMps / CELL, dock = sim.W.dock;
    if (d.state === 'DOCKED') {
      d.light = 'off';
      if (d.launchAt !== null && t >= d.launchAt) { d.standoff = standoffPoint(sim); d.light = 'friendly'; d.alt = 40; setDrone(sim, 'LAUNCH', 'أقلعت الطائرة (إضاءة ودّية: أخضر ثابت + وميضان أبيضان)', 'Drone took off (friendly light: steady green + two white flashes)'); }
      return;
    }
    if (d.state !== 'CHARGING') d.battery = Math.max(0, d.battery - 1 / (droneEndurance(sim) * 60));
    var tx = d.target ? d.target.x : d.standoff ? d.standoff.x : dock.x, ty = d.target ? d.target.y : d.standoff ? d.standoff.y : dock.y;
    var mv = function (x, y) { var dx = x - d.x, dy = y - d.y, dl = Math.sqrt(dx * dx + dy * dy); if (dl <= cps) { d.x = x; d.y = y; d.flownM += dl * CELL; return true; } d.x += dx / dl * cps; d.y += dy / dl * cps; d.flownM += cps * CELL; return false; };
    switch (d.state) {
      case 'LAUNCH': if (t - d.since >= 5) { setDrone(sim, 'TRANSIT', 'الطائرة في الطريق إلى نقطة التوقف', 'Drone flying to its stand-off point'); } break;
      case 'TRANSIT':
        if (mv(d.standoff.x, d.standoff.y)) {
          d.arrivedAt = t;
          if (d.mission === 'aed') { d.aedAt = t; setDrone(sim, 'HOLD', 'وصلت الطائرة بجهاز الإنعاش — بث مباشر لغرفة التحكم', 'Drone arrived with the AED — live view to the control room'); aedArrived(sim); }
          else setDrone(sim, 'PATROL', 'الطائرة تفحص المنطقة (دورية)', 'Drone patrolling the area');
        }
        break;
      case 'PATROL': if (t - d.since >= 8) setDrone(sim, 'TRACK', 'الطائرة تتتبّع نقطة الخطر', 'Drone tracking the hotspot'); break;
      case 'TRACK': if (t - d.since >= 5) setDrone(sim, 'HOLD', 'الطائرة تحوم وتبثّ منظراً خارجياً', 'Drone holding, giving an outside view'); break;
      case 'HOLD':
        if (d.mission !== 'aed') {
          d.located += droneSearch(sim);
          var engine = sim.fx && sim.fx.engineOnScene;
          if (engine && sim.hazard === 'fire') { d.yields = true; setDrone(sim, 'YIELD', 'تنحّت الطائرة لتفسح المجال لأصول الإطفاء', 'Drone yielded to the firefighting assets'); d.alt = 90; d.target = { x: clamp(d.x - sim.wind.ux * 8, 1, W - 2), y: clamp(d.y - sim.wind.uy * 8, 1, H - 2) }; }
        }
        if (d.battery <= 0.2 && d.state === 'HOLD') { d.target = null; setDrone(sim, 'RETURN', 'البطارية منخفضة — عودة إلى القاعدة', 'Battery low — returning to dock'); }
        break;
      case 'YIELD': mv(d.target.x, d.target.y); if (t - d.since >= 60) { d.target = null; setDrone(sim, 'RETURN', 'عودة الطائرة إلى القاعدة', 'Drone returning to dock'); } break;
      case 'RETURN': if (mv(dock.x, dock.y)) { d.alt = 0; d.light = 'off'; setDrone(sim, 'CHARGING', 'هبطت الطائرة وتُشحن', 'Drone landed and charging'); } break;
      case 'CHARGING': d.battery = Math.min(1, d.battery + 1 / 1800); break;
    }
  }
  // thermal search from above: finds people who stand on balconies, the roof or outdoors (not inside rooms)
  function droneSearch(sim) {
    var found = 0;
    if (sim.t % 5 !== 0) return 0;
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (a.away || a.droneLocatedAt || a.checkin) continue;
      if (a.st === 'incapacitated' || a.st === 'sheltered' || a.st === 'waiting' || a.st === 'down') {
        var outdoor = a.g < NC || sim.W.G.ntype[a.g] === NT.REFUGE || sim.W.G.ntype[a.g] === NT.ROOF;
        if (outdoor) { a.droneLocatedAt = sim.t; found++; if (a.hero) evt(sim, 'drone-located', { person: a.key }, 'رصدت الطائرة حرارياً ' + a.name.ar, 'The drone located ' + a.name.en + ' by thermal view'); }
      }
    }
    return found;
  }

  /* ====================================================================================
   * 10b. THE RESCUE ROBOT — a CONCEPT with a SIMULATED prototype (assists; firefighters decide)
   *      stowed -> approved -> deploying -> searching -> guiding -> holding -> returning -> (stowed) | fault
   *      It lives on the building's indoor graph (rooms, corridors, stairs, lobby), plans with A*, never enters a burning / too-hot /
   *      gas-danger node, never breaks a door, cannot climb stairs when wheeled, detects people with a seeded rule-based model (thermal contrast,
   *      smoke attenuation, audio) that has false negatives and false positives, reports every find to the control room over a mesh link that
   *      can drop (reports are buffered), speaks in the person's language and format, drops route beacons, holds with people who cannot move,
   *      and returns when its battery says so. Every number is a named assumption (PARAMS group 'robot'); nothing here is measured.
   * ==================================================================================== */
  var ROBOT_STATES = ['stowed', 'approved', 'deploying', 'searching', 'guiding', 'holding', 'returning', 'fault'];
  var ROBOT_ROLES = ['viewer', 'operator', 'commander'];
  var ROBOT_STATE_TXT = {
    stowed: T('في مكانه (جاهز)', 'Stowed (ready)'), approved: T('معتمد — ينتظر النشر', 'Approved — waiting to deploy'), deploying: T('يُجهَّز عند المدخل', 'Deploying at the entrance'),
    searching: T('يبحث', 'Searching'), guiding: T('يرشد', 'Guiding'), holding: T('يبقى مع شخص', 'Holding with a person'), returning: T('يعود', 'Returning'), fault: T('عطل', 'Fault')
  };
  var BODY_C = 34;                 // skin temperature used for thermal contrast (°C; a constant of the model)
  var DOSE_INJURY = 0.3;           // the model's injury threshold (the same constant stepPeople uses)
  var ROBOT_SAY_KEYS = ['intro', 'guide', 'wake', 'stay', 'refuge', 'hold', 'check', 'blocked', 'hood'];
  var COND = {
    conscious: T('واعٍ', 'conscious'), asleep: T('نائم (أو فاقد الوعي)', 'asleep (or unconscious)'), unresponsive: T('لا يستجيب', 'not responding'),
    injured: T('مصاب', 'injured'), moving: T('يتحرك', 'moving')
  };
  var RB_FALLBACK = {   // built-in texts (used only when MANARA_MSG is not loaded; messages.js holds the full multi-language set)
    intro: T('أنا روبوت الدفاع المدني — اتبع الضوء الأخضر', 'I am a Civil Defence robot — follow the green light'),
    guide: T('اتبع الضوء الأخضر إلى {exit}. امشِ ولا تركض.', 'Follow the green light to {exit}. Walk, do not run.'),
    wake: T('استيقظ! خطر! انهض الآن واتبع الضوء الأخضر.', 'Wake up! Danger! Get up now and follow the green light.'),
    stay: T('ابقَ هنا — المساعدة في الطريق.', 'Stay here — help is coming.'),
    refuge: T('اذهب إلى شرفة اللجوء وابقَ هناك — المساعدة في الطريق.', 'Go to the refuge balcony and stay there — help is coming.'),
    hold: T('أنا معك ولن أتركك. المساعدة في الطريق.', 'I am staying with you. Help is coming.'),
    check: T('هل تسمعني؟ ارفع يدك أو المس شاشتي.', 'Can you hear me? Raise your hand or touch my screen.'),
    blocked: T('هذا الطريق مغلق — ابقَ هنا وسأبحث عن طريق آخر.', 'This way is blocked — stay here and I will look for another way.'),
    hood: T('ضع غطاء الدخان الذي سلّمتك إياه على وجهك.', 'Put the smoke hood I gave you over your face.')
  };

  // ---------------------------------------------------------------- the robot's own indoor graph (static per structure)
  var RGRAPH = {};
  function robotGraph(sidx) {
    if (RGRAPH[sidx]) return RGRAPH[sidx];
    var w = world(), S = w.structs[sidx], n = S.nodes.length, adj = [], i, hf = Infinity;
    for (i = 0; i < n; i++) adj.push([]);
    S.edges.forEach(function (e) {
      var a = S.nodes[e.a], b = S.nodes[e.b], eu = Math.sqrt(Math.pow((a.x - b.x) * CELL, 2) + Math.pow((a.y - b.y) * CELL, 2));
      if (eu > 1e-6) hf = Math.min(hf, e.len / eu);
      adj[e.a].push({ to: e.b, len: e.len, flag: e.flag, door: e.door });
      adj[e.b].push({ to: e.a, len: e.len, flag: e.flag, door: e.door });
    });
    var rooms = [], byRoom = {}, byId = {};
    S.nodes.forEach(function (nd, l) {
      byId[nd.id] = l;
      if (nd.type === NT.ROOM || nd.type === NT.SUPPORT) { var r = { l: l, id: nd.id, room: nd.room || nd.id, label: nd.label, fl: nd.fl, type: nd.type }; rooms.push(r); byRoom[r.room] = r; byRoom[nd.id] = r; }
    });
    var exits = S.exits.filter(function (ex) { return ex.kind !== 'roof'; }).map(function (ex) { return { id: ex.id, gi: ex.gi, l: S.byId[ex.node].local, name: ex.name, kind: ex.kind }; });
    return (RGRAPH[sidx] = { sidx: sidx, S: S, n: n, adj: adj, hf: isFinite(hf) ? hf : 0.2, entrance: S.byId[S.exits[0].node].local, rooms: rooms, byRoom: byRoom, byId: byId, exits: exits });
  }
  function rbNodeText(g, l) {   // a place as {ar,en}: "room 302" / "Corridor, floor 2"
    var nd = g.S.nodes[l], fl = nd.fl + 1;
    if (nd.type === NT.ROOM && nd.room) return T('غرفة ' + nd.room, 'room ' + nd.room);
    if (nd.type === NT.SUPPORT) return nd.label;
    return T(nd.label.ar + ' — الطابق ' + fl, nd.label.en + ', floor ' + fl);
  }
  var RB_HEAP = null;

  // ---------------------------------------------------------------- per-tick danger / temperature field of every node (what the twin's sensors and the robot's own camera know)
  function rbFieldFill(sim, g, F) {
    var st = sim.stt[g.sidx], P = sim.P, n = g.n, i, k, base = P.robotRoomC, gasOn = sim.hazard === 'gas';
    for (i = 0; i < n; i++) {
      var I = st.I[i], hot = st.burn[i] === 1 || I > 0.05;
      F.smoke[i] = st.smoke[i];
      F.temp[i] = base + (hot ? 380 * I : 0) + 12 * st.smoke[i] * st.smoke[i];
      F.gas[i] = gasOn ? st.gas[i] : 0;
      F.hot[i] = hot ? 1 : 0;
    }
    for (i = 0; i < n; i++) {   // radiant heat from burning neighbours (a closed door shields most of it)
      if (!F.hot[i]) continue;
      var list = g.adj[i];
      for (k = 0; k < list.length; k++) {
        var e = list[k], f = (e.door >= 0 && !st.doorOpen[e.door]) ? 0.2 : 1;
        F.temp[e.to] += 70 * Math.max(0, st.I[i]) * f;
      }
    }
    for (i = 0; i < n; i++) F.imp[i] = (F.hot[i] || F.temp[i] > P.robotMaxTempC || (gasOn && F.gas[i] >= P.gasDanger)) ? 1 : 0;
    return F;
  }
  function newField(n) { return { smoke: new Float32Array(n), temp: new Float32Array(n), gas: new Float32Array(n), hot: new Uint8Array(n), imp: new Uint8Array(n) }; }

  // ---------------------------------------------------------------- A* (and, with opt.dijkstra, plain Dijkstra for the cross-check test)
  //   cost (seconds) = len / speed x (stairs: penalty) x (1 + 3 smoke^2) (+ door push time); blocked: impassable, known obstacles, stairs for a wheeled robot.
  //   opt.person: plan for a PERSON (stairs allowed unless opt.noStairs, no door delay). Heuristic = hf x straight distance / speed with hf = min(len / straight distance) over all edges,
  //   so it never over-estimates (admissible and consistent): A* returns the same cost as Dijkstra.
  function rbAStar(sim, rb, from, to, opt) {
    opt = opt || {};
    var g = rb.G, n = g.n, adj = g.adj, F = opt.F || rb.F, P = sim.P, st = sim.stt[g.sidx], known = rb.known;
    var person = !!opt.person, tracked = rb.variant === 'tracked' || !!opt.stairsOk;
    var v = person ? 1.2 : (tracked ? P.robotSpeedTracked : P.robotSpeedWheeled);
    var dist = new Float32Array(n).fill(Infinity), prev = new Int16Array(n).fill(-1), done = new Uint8Array(n), expanded = 0;
    var heap = RB_HEAP || (RB_HEAP = makeHeap(2048)), nodes = g.S.nodes, tn = nodes[to], hfv = opt.dijkstra ? 0 : g.hf / v;
    var hOf = function (u) { if (!hfv) return 0; var a = nodes[u], dx = (a.x - tn.x) * CELL, dy = (a.y - tn.y) * CELL; return hfv * Math.sqrt(dx * dx + dy * dy); };
    heap.clear(); dist[from] = 0; heap.push(hOf(from), from);
    while (heap.size() > 0) {
      var u = heap.pop();
      if (done[u]) continue;
      done[u] = 1; expanded++;
      if (u === to) break;
      var list = adj[u];
      for (var k = 0; k < list.length; k++) {
        var e = list[k], w = e.to;
        if (done[w]) continue;
        var stairs = (e.flag & F_STAIRS) !== 0;
        if (stairs && !person && !tracked) continue;
        if (stairs && opt.noStairs) continue;
        if (!person) { if (F.imp[w] || known[w]) continue; }
        else if (F.hot[w] || F.temp[w] > P.robotMaxTempC + 80) continue;
        if (opt.avoid && opt.avoid[w]) continue;
        var c = e.len / v * (stairs ? (person ? P.stairFactor : P.robotStairPenalty) : 1) * (1 + 3 * F.smoke[w] * F.smoke[w]);
        if (!person && e.door >= 0 && !st.doorOpen[e.door]) { if (!P.robotOpensDoors) continue; c += P.robotDoorSec; }
        var nd = dist[u] + c;
        if (nd < dist[w]) { dist[w] = nd; prev[w] = u; heap.push(nd + hOf(w), w); }
      }
    }
    if (!done[to] && from !== to) return { ok: false, path: [], cost: Infinity, expanded: expanded };
    var path = [to], q = to;
    while (q !== from) { q = prev[q]; if (q < 0) return { ok: false, path: [], cost: Infinity, expanded: expanded }; path.push(q); }
    path.reverse();
    return { ok: true, path: path, cost: dist[to], expanded: expanded };
  }
  function rbEdge(g, a, b) { var list = g.adj[a]; for (var k = 0; k < list.length; k++) if (list[k].to === b) return list[k]; return null; }

  // ---------------------------------------------------------------- creation, roles, approval
  function newRobot(sim, g, k, variant) {
    var n = g.n, e = g.entrance;
    return { id: 'R' + (k + 1), n: k, variant: variant, G: g, S: g.S, st: sim.stt[g.sidx], state: 'stowed', since: 0,
      approval: { status: 'none', requestedAt: null, approvedAt: null, by: null }, node: e, to: -1, prog: 0, edgeLen: 0, edgeFlag: 0, heading: 0, path: [], target: null,
      battery: 1, heat: 0, driven: 0, F: newField(n), known: new Uint8Array(n), cov: new Float32Array(n), rooms: {}, doorWait: 0, dwell: null, investigate: null, teleop: null,
      link: { q: 1, up: true, downUntil: -1, downFor: 0, downSec: 0, dropouts: 0, wasUp: true }, relay: new Float32Array(n), relayDirty: true, linkRecovery: false,
      outbox: [], finds: [], blocked: [], beacons: [], beaconsLeft: Math.round(sim.P.robotBeacons), hoodsLeft: Math.round(sim.P.robotHoods), hold: null, engage: null, recall: false, deployUntil: null, readyAt: null,
      entered: [], enteredBad: 0, seenFloors: {}, exitsSeen: {}, flee: 0, opened: [], stats: { falsePositives: 0, stairsM: 0, spoke: 0, returnedAt: null, faultAt: null, faultWhy: null, started: null, doorsOpened: 0 }, planCheckAt: 0, returnReason: null };
  }
  function robotSupports(sim) { return sim.mode === 'manara' && (sim.hazard === 'fire' || sim.hazard === 'gas'); }
  function robotStruct(sim) { return sim.hazard === 'fire' ? sim.hz.struct : 0; }
  function enableRobot(sim, cfg) {
    var rb = sim.rb;
    if (rb.enabled) return { ok: true, already: true };
    if (!robotSupports(sim)) return { ok: false, code: 'na', reason: T('الروبوت يعمل في الحريق والغاز داخل المبنى وفي وضع المنارة فقط', 'The robot works for fire and gas inside a building, in the MANARA world only') };
    cfg = (cfg && typeof cfg === 'object') ? cfg : {};
    var g = robotGraph(robotStruct(sim)), units = clamp(Math.round(cfg.units || 1), 1, 3), variant = cfg.variant === 'wheeled' ? 'wheeled' : 'tracked';
    if (cfg.carrier !== undefined) sim.P.robotCarrier = cfg.carrier ? 1 : 0;
    rb.enabled = true; rb.variant = variant; rb.g = g; rb.autoApprove = cfg.autoApprove !== undefined ? !!cfg.autoApprove : !!sim.P.autoApprove;
    sim.robots = []; for (var k = 0; k < units; k++) sim.robots.push(newRobot(sim, g, k, variant));
    rb.Fv = newField(g.n);
    g.rooms.forEach(function (r) { sim.robots.forEach(function (rr) { rr.rooms[r.room] = { l: r.l, id: r.room, passes: 0, status: 'open', lastAt: null, retryAt: 0, found: 0, un: 0 }; }); });
    sim.robots.forEach(function (rr) { rbFieldFill(sim, g, rr.F); });
    return { ok: true, units: units, variant: variant };
  }
  function initRobot(sim, opts) {
    var pre = sim.pre;
    sim.robots = [];
    sim.rb = { enabled: false, role: ROBOT_ROLES.indexOf(opts.role) >= 0 ? opts.role : 'operator', obst: {}, priority: [], finds: [], blocked: [], speech: [], findSeq: 0, blockSeq: 0, speechSeq: 0, claims: {}, pending: [], na: null };
    (pre.lockedDoors || []).forEach(function (id) { sim.rb.obst[id] = { locked: true, kind: 'door', since: 0, scenario: true }; });
    var cfg = opts.robot !== undefined ? opts.robot : (pre.robot && pre.robot.enabled ? pre.robot : null);
    if (cfg === false || cfg === null || cfg === undefined) return;
    if (cfg === true) cfg = {};
    var base = pre.robot || {}, merged = {}, k;
    for (k in base) merged[k] = base[k];
    for (k in cfg) merged[k] = cfg[k];
    var r = enableRobot(sim, merged);
    if (!r.ok) sim.rb.na = r.reason;
  }
  function applyPresetScenario(sim) {   // scenario conditions of a preset (also applied when the robot is off, so 'with' and 'without' compare the same world)
    var pre = sim.pre, w = sim.W;
    if (pre.locks) pre.locks.forEach(function (id) { for (var q = 0; q < w.exits.length; q++) if (w.exits[q].id === id && w.exits[q].struct === (pre.struct || 0)) sim.exits[q].locked = true; });
  }
  function applyHeroStart(sim) {
    var pre = sim.pre; if (!pre.heroStart) return;
    var S = sim.W.structs[pre.struct || 0];
    Object.keys(pre.heroStart).forEach(function (key) {
      var a = sim.byKey[key], c = pre.heroStart[key], nd = S.byId[c.node];
      if (!a || !nd) return;
      a.g = nd.g; a.ox = 0.2; a.oy = 0;
      if (c.awake) a.asleep = false;
      if (c.app === false) a.app = false;
      if (c.immobile) a.immobile = true;
    });
  }
  function rbRobot(sim, id) {
    if (!sim.robots.length) return null;
    if (id === undefined || id === null) return sim.robots[0];
    for (var i = 0; i < sim.robots.length; i++) if (sim.robots[i].id === id) return sim.robots[i];
    return null;
  }
  var NO_ROBOT = { ok: false, code: 'none', reason: T('لا يوجد روبوت في هذه المحاكاة', 'There is no robot in this simulation') };
  function setRobotState(sim, r, state, ar, en) {
    r.state = state; r.since = sim.t;
    evt(sim, 'robot-state', { robot: r.id, state: state }, 'الروبوت ' + r.id + ': ' + (ar || ROBOT_STATE_TXT[state].ar), 'Robot ' + r.id + ': ' + (en || ROBOT_STATE_TXT[state].en));
  }
  function robotRequest(sim, r, who) {
    if (r.approval.status !== 'none') return false;
    r.approval.status = 'requested'; r.approval.requestedAt = sim.t; r.approval.by = who;
    evt(sim, 'robot-approval-requested', { robot: r.id, by: who }, 'الروبوت ' + r.id + ' جاهز — نشره داخل المبنى يحتاج اعتماد قائد الحادث', 'Robot ' + r.id + ' is ready — sending it into the building needs the incident commander\'s approval');
    return true;
  }
  function robotApproveNow(sim, r, who) {
    r.approval.status = 'approved'; r.approval.approvedAt = sim.t; r.approval.by = who; r.recall = false;
    var carrier = sim.P.robotCarrier ? 1 : 0;
    r.readyAt = carrier ? null : sim.t;
    setRobotState(sim, r, 'approved', 'اعتمد قائد الحادث الروبوت ' + r.id + (carrier ? ' — ينتظر وصول سيارة الإطفاء' : ' — يبدأ النشر'), 'The incident commander approved robot ' + r.id + (carrier ? ' — waiting for the fire engine' : ' — deploying'));
    evt(sim, 'robot-approved', { robot: r.id, by: who }, 'اعتماد قائد الحادث للروبوت ' + r.id, 'Incident commander approved robot ' + r.id);
  }
  function stepRobotApproval(sim) {
    var rb = sim.rb, t = sim.t, P = sim.P;
    if (sim.mode !== 'manara') return;
    for (var i = 0; i < sim.robots.length; i++) {
      var r = sim.robots[i];
      if (r.approval.status === 'none' && !r.stats.returnedAt && sim.ver.confirmedAt !== null) robotRequest(sim, r, 'system');
      if (r.approval.status === 'requested' && rb.autoApprove && t >= r.approval.requestedAt + P.robotApproveSec && r.state === 'stowed') robotApproveNow(sim, r, 'commander-sim');
    }
  }

  // ---------------------------------------------------------------- people the robot can see and what it concludes about them
  function inStruct(sim, r, a) { return a.g >= r.S.base && a.g < r.S.base + r.G.n; }
  function needsOf(a) {
    var needs = [];
    if (a.persona === 'wheelchair') needs.push('wheelchair'); if (a.persona === 'elderly') needs.push('elderly'); if (a.persona === 'child') needs.push('child'); if (a.deaf) needs.push('deaf'); if (a.blind) needs.push('blind');
    return needs;
  }
  function conditionOf(sim, a) {
    if (a.st === 'incapacitated' || a.st === 'down') return 'unresponsive';
    if (a.asleep) return 'asleep';
    if (a.injured) return 'injured';
    if (a.st === 'moving') return 'moving';
    return 'conscious';
  }
  function isCalling(a) { return !a.asleep && (a.st === 'waiting' || (a.st === 'sheltered' && a.safeKind === 'refuge') || a.injured); }
  function visibleNodes(sim, r, F, out) {   // distances (m) to every node the robot can see: same room / corridor stretch within range, through open doors only, never across floors
    var g = r.G, P = sim.P, st = r.st, n = g.n, d = out || new Float32Array(n), i, queue = [r.node];
    d.fill(Infinity); d[r.node] = 0;
    for (var qi = 0; qi < queue.length; qi++) {
      var u = queue[qi], list = g.adj[u];
      for (var k = 0; k < list.length; k++) {
        var e = list[k], w = e.to;
        if (e.flag & F_STAIRS) continue;
        if (e.door >= 0 && !st.doorOpen[e.door]) continue;
        var nd = d[u] + e.len;
        if (nd <= P.robotRangeM && nd < d[w]) { d[w] = nd; queue.push(w); }
      }
    }
    return d;
  }
  function rgbVisibility(sim, smoke, distM) { return Math.exp(-sim.P.robotRgbSmokeK * smoke * distM / 5); }
  function thermalVisibility(sim, smoke, distM) { return Math.exp(-sim.P.robotThermalSmokeK * smoke * distM / 5); }
  function detectP(sim, r, a, dM, F, l) {   // chance per second that the robot detects person a at distance dM (node l); returns {p, th, rgb, au, contrast}
    var P = sim.P, smoke = Math.max(F.smoke[r.node], F.smoke[l]), fall = 1 - 0.5 * dM / Math.max(1, P.robotRangeM);
    var contrast = clamp((BODY_C - F.temp[l]) / P.robotContrastC, 0, 1);
    var th = P.robotThermalPd * contrast * thermalVisibility(sim, smoke, dM) * fall;
    var rgb = P.robotRgbPd * rgbVisibility(sim, smoke, dM) * fall;   // the visible camera with the robot's own lamp: works in clear air whatever the room temperature
    var au = 0;
    if (!a.asleep && a.st !== 'incapacitated' && a.st !== 'down' && dM <= P.robotAudioRangeM) {
      au = P.robotAudioPd * Math.exp(-dM / (P.robotAudioRangeM / 2)) * (isCalling(a) ? 1 : 0.3) * (1 - (sim.local.on ? P.robotNoiseMask : 0));
    }
    return { p: 1 - (1 - th) * (1 - rgb) * (1 - au), th: th, rgb: rgb, au: au, contrast: contrast };
  }

  // ---------------------------------------------------------------- speaking (MANARA_MSG.robot.say when loaded; built-in fallback otherwise)
  function personaOf(a) { return a.deaf ? 'deaf' : a.blind ? 'blind' : a.persona === 'wheelchair' ? 'wheelchair' : a.persona === 'child' ? 'child' : a.persona === 'elderly' ? 'elderly' : a.asleep ? 'asleep' : (a.lang !== 'ar' && a.lang !== 'en') ? 'worker' : 'adult'; }
  function exitNameFor(g, route) {
    if (!route || !route.length) return null;
    var last = route[route.length - 1];
    for (var i = 0; i < g.exits.length; i++) if (g.exits[i].l === last) return g.exits[i].name;
    return null;
  }
  function rbSay(sim, key, persona, a, extra) {
    var M = root.MANARA_MSG, lang = (extra && extra.lang) || (a ? a.lang : 'ar'), vars = { exit: extra && extra.exit ? extra.exit : undefined, room: a && a.room ? a.room : undefined, name: a && a.name ? a.name : undefined };
    var res = null;
    if (M && M.robot && typeof M.robot.say === 'function') {
      try { res = M.robot.say({ key: key, hazard: sim.hazard, persona: persona, lang: lang, needs: a ? needsOf(a) : [], vars: vars }); } catch (e) { res = null; }
    }
    if (res && res.also && res.also.ar && res.also.en) return { key: key, persona: persona, lang: res.lang, draft: !!res.draft, formats: (res.formats || []).slice(), light: res.light || null, text: { ar: res.also.ar, en: res.also.en }, spoken: res.text, display: res.display || null, via: 'MANARA_MSG', refuge: !!(res.flags && res.flags.refuge) };
    var fb = RB_FALLBACK[key] || RB_FALLBACK.intro, ex = vars.exit ? vars.exit : T('أقرب مخرج مفتوح', 'the nearest open exit');
    var txt = T(fb.ar.replace('{exit}', ex.ar), fb.en.replace('{exit}', ex.en));
    var fm = persona === 'deaf' ? ['light', 'strobe', 'display', 'pictogram'] : persona === 'blind' ? ['voice', 'sound'] : persona === 'child' ? ['voice', 'light', 'display', 'pictogram'] : ['voice', 'light', 'display'];
    var lg = (lang === 'ar' || lang === 'en') ? lang : 'en';
    return { key: key, persona: persona, lang: lg, draft: lang !== 'ar' && lang !== 'en', formats: fm, light: { id: persona === 'deaf' ? 'friendly-robot+strobe-optin' : 'friendly-robot' }, text: txt, spoken: txt[lg], display: txt, via: 'built-in', refuge: key === 'refuge' };
  }
  function rbSpeak(sim, r, a, key, extra) {
    var rb = sim.rb, persona = a ? personaOf(a) : ((extra && extra.persona) || 'adult'), s = rbSay(sim, key, persona, a, extra);
    var line = { id: 'S' + (++rb.speechSeq), t: sim.t, robot: r.id, person: a ? a.key : null, find: a && a.robotFindId ? a.robotFindId : null, key: key, persona: persona, lang: s.lang, requestedLang: a ? a.lang : (extra && extra.lang) || null,
      draft: s.draft, formats: s.formats, light: s.light, text: s.text, display: s.display, via: s.via, refuge: s.refuge, operator: !!(extra && extra.operator) };
    rb.speech.push(line); if (rb.speech.length > 300) rb.speech.shift();
    line.spoken = s.spoken;
    r.stats.spoke++;
    if (!a || a.hero || (extra && extra.log)) {
      var tx = s.text;
      evt(sim, 'robot-speak', { robot: r.id, person: a ? a.key : null, key: key, lang: s.lang, persona: persona }, 'الروبوت ' + r.id + ' يتكلم' + (a && a.name ? ' مع ' + a.name.ar : '') + ' (' + s.lang + '): «' + tx.ar + '»', 'Robot ' + r.id + ' speaks' + (a && a.name ? ' to ' + a.name.en : '') + ' (' + s.lang + '): "' + tx.en + '"');
    }
    return line;
  }
  function informPerson(sim, a) {   // the robot's guidance makes the person INFORMED (a live route), exactly like a personal alert would
    if (a.aware >= 2 || sim.mode !== 'manara') return;
    a.zoneLevel = a.zoneLevel || zoneLevelFor(sim, a);
    a.msg = a.msg || composeFor(sim, a);
    if (!a.asleep) setAware(sim, a, 2, 'robot');
    a.robotGuidedAt = sim.t;
  }

  // ---------------------------------------------------------------- reports to the control room (buffered while the link is down)
  function robotReport(sim, r, kind, id) { r.outbox.push({ kind: kind, id: id, t: sim.t }); if (r.link.up) robotFlush(sim, r); }
  function findText(sim, r, f) {
    var nameAr = f.name ? f.name.ar : (f.registered ? 'أحد المقيمين' : 'شخص'), nameEn = f.name ? f.name.en : 'a person';
    var c = COND[f.condition.key] || COND.conscious;
    return { ar: 'الروبوت ' + r.id + ' عثر على ' + nameAr + ' — ' + f.place.ar + ' — الحالة: ' + c.ar + ' (تقدير)' + (f.refuge && f.refuge.at ? ' — عند شرفة اللجوء' : ''),
      en: 'Robot ' + r.id + ' located ' + nameEn + ' — ' + f.place.en + ' — condition: ' + c.en + ' (est.)' + (f.refuge && f.refuge.at ? ' — at the refuge balcony' : '') };
  }
  function robotFlush(sim, r) {
    while (r.outbox.length && r.link.up) {
      var o = r.outbox.shift(), t = sim.t;
      if (o.kind === 'find') {
        var f = sim.rb.finds[+o.id.slice(1) - 1]; if (!f) continue;
        f.reportedAt = t;
        var a = sim.byKey[f.key]; if (a) {
          a.robotReportedAt = t;
          if (!a.rescued && a.rescueAt) { var nt = t + Math.max(10, (a.rescueAt - t) * (1 - sim.P.robotCrewSpeedup)); if (nt < a.rescueAt) a.rescueAt = nt; }   // crews are told exactly where: the rest of their search shortens
          else if (sim.fx.rescueOnScene !== null && !a.rescued && !a.rescueAt && (a.st === 'incapacitated' || a.st === 'down' || (a.st === 'sheltered' && a.needsHelp) || a.st === 'waiting')) a.rescueAt = t + sim.P.rescueAssistSec * (1 - sim.P.robotCrewSpeedup);
        }
        var tx = findText(sim, r, f);
        evt(sim, 'robot-find', { robot: r.id, find: f.id, person: f.key, room: f.room, node: f.node, condition: f.condition.key, delaySec: t - f.t, by: f.by }, tx.ar + (t - f.t > 2 ? ' (وصل التقرير بعد عودة الاتصال)' : ''), tx.en + (t - f.t > 2 ? ' (report delivered when the link returned)' : ''));
      } else if (o.kind === 'blocked') {
        var b = sim.rb.blocked[+o.id.slice(1) - 1]; if (!b) continue;
        b.reportedAt = t;
        evt(sim, 'robot-blocked', { robot: r.id, block: b.id, kind: b.kind, node: b.node, room: b.room }, b.text.ar, b.text.en);
      }
    }
  }
  function robotBlockedReport(sim, r, kind, nodeId, text, room, floor) {
    var rb = sim.rb, key = kind + '|' + nodeId;
    for (var i = 0; i < rb.blocked.length; i++) if (rb.blocked[i].key === key) return rb.blocked[i];
    var b = { id: 'B' + (++rb.blockSeq), key: key, robot: r.id, t: sim.t, reportedAt: null, kind: kind, node: nodeId, room: room || null, floor: floor === undefined ? null : floor, text: text };
    rb.blocked.push(b); r.blocked.push(b.id);
    robotReport(sim, r, 'blocked', b.id);
    return b;
  }

  // ---------------------------------------------------------------- what a find does
  function onFind(sim, r, a, how, pd) {
    var rb = sim.rb, g = r.G, S = r.S, F = r.F, l = a.g - S.base, nd = S.nodes[l], t = sim.t, P = sim.P;
    var f = { id: 'F' + (++rb.findSeq), robot: r.id, t: t, reportedAt: null, node: nd.id, place: rbNodeText(g, l), room: nd.room || null, registeredRoom: a.room || a.cls || null, floor: nd.fl + 1, key: a.key, name: a.name || null, role: a.role, registered: !!a.registered,
      persona: a.persona, needs: needsOf(a), lang: a.lang, by: how, conf: Math.round(pd.p * 100) / 100, condition: { key: conditionOf(sim, a), est: true }, dose: Math.round(a.dose * 1000) / 1000, smoke: Math.round(F.smoke[l] * 100) / 100, tempC: Math.round(F.temp[l]),
      refuge: { at: S.nodes[l].type === NT.REFUGE, route: false }, action: null, route: [], routeM: null, spoke: [], followed: null, beacons: 0 };
    a.robotFoundAt = t; a.robotFindId = f.id; a.robotFoundBy = r.id;
    rb.finds.push(f); r.finds.push(f.id);
    if (a.room && (r.rooms[a.room])) r.rooms[a.room].found++;
    var rp = rbAStar(sim, r, g.entrance, l, { dijkstra: false });   // the way in, as the robot knows it now: for the crews' card
    if (rp.ok) { f.route = rp.path.map(function (x) { return S.nodes[x].id; }); f.routeM = Math.round(rp.path.reduce(function (s, x, i) { if (!i) return 0; var e = rbEdge(g, rp.path[i - 1], x); return s + (e ? e.len : 0); }, 0)); }
    robotReport(sim, r, 'find', f.id);
    // a person who cannot get out alone interrupts a routine guide / wake-up (the interrupted person goes back in the queue); while holding or returning, the robot records, reports and queues
    var critical = f.condition.key === 'unresponsive' || a.persona === 'wheelchair' || a.st === 'waiting';
    if (r.state === 'guiding' && critical && r.engage && r.engage.find !== f.id) { rb.pending.push(r.engage.find); r.engage = null; r.path = []; setRobotState(sim, r, 'searching', 'يقاطع الإرشاد لشخص لا يستطيع الخروج وحده', 'Interrupts its routine guidance for a person who cannot get out alone'); }
    var lowDanger = F.smoke[l] < 0.08 && F.temp[l] < 40, top = r.state === 'searching' && !critical && lowDanger ? roomPriority(sim, r)[0] : null;
    if (r.state === 'searching' && !(top && ((top.needs > 0 && top.score >= 1000) || top.score >= 10000) && top.rm.l !== l)) engageFind(sim, r, a, f);   // triage: someone in no danger waits while a person with needs is still unreached
    else {
      f.action = 'queued'; rb.pending.push(f.id);
      if (!critical && !a.asleep && a.aware < 2) { f.followed = hr(sim.seed, D.ROBOT, a.id, 7000 + rb.findSeq) < P.robotFollowP; if (f.followed) informPerson(sim, a); rbSpeak(sim, r, a, 'guide', { exit: null }); f.spoke.push('guide'); }   // it speaks to a person who can move, even while busy
    }
    return f;
  }
  function engageFind(sim, r, a, f) {   // decide what to do with a person the robot has found (now, or later from the queue)
    var rb = sim.rb, g = r.G, S = r.S, F = r.F, P = sim.P, t = sim.t, l = a.g - S.base, cond = conditionOf(sim, a), danger = F.smoke[l] >= 0.15 || F.temp[l] > 45, cannotMove = cond === 'unresponsive';
    f.condition = { key: cond, est: true };
    if (r.target && r.target.room && rb.claims[r.target.room] === r.id) delete rb.claims[r.target.room];   // it drops what it was doing: the person comes first
    r.target = null; r.path = []; r.dwell = null; r.investigate = null;
    if (danger && F.smoke[l] >= 0.2 && (cond === 'conscious' || cond === 'injured') && !a.asleep && (a.persona === 'wheelchair' || a.st === 'waiting') && r.hoodsLeft > 0 && !a.hood) {   // a conscious person who cannot get out of the smoke gets a hood
      a.hood = true; r.hoodsLeft--; f.hood = true;
      evt(sim, 'robot-hood', { robot: r.id, person: a.key }, 'الروبوت ' + r.id + ' سلّم غطاء دخان إلى ' + (a.name ? a.name.ar : 'شخص واعٍ') + ' (يتبقى ' + r.hoodsLeft + ')', 'Robot ' + r.id + ' handed a smoke hood to ' + (a.name ? a.name.en : 'a conscious person') + ' (' + r.hoodsLeft + ' left)');
    }
    if (cannotMove) { f.action = 'hold'; rbSpeak(sim, r, a, 'check'); f.spoke.push('check'); startHold(sim, r, a, f); }
    else if (a.asleep) { f.action = 'wake'; r.engage = { kind: 'wake', key: a.key, find: f.id, tries: 0, nextAt: t, until: t + P.robotGuideSec + 5 * P.robotWakeTries + 30 }; setRobotState(sim, r, 'guiding', 'يوقظ ' + (a.name ? a.name.ar : 'شخصاً نائماً'), 'Waking ' + (a.name ? a.name.en : 'a sleeping person')); }
    else if (a.persona === 'wheelchair' || a.immobile) {
      f.action = 'stay'; rbSpeak(sim, r, a, 'intro'); f.spoke.push('intro');
      var atRef = S.nodes[l].type === NT.REFUGE;
      var rr = a.immobile ? null : refugeRouteFor(sim, r, a, l);
      f.refuge.route = !!rr; f.refuge.at = atRef;
      if (!atRef && rr) { f.action = 'refuge'; rbSpeak(sim, r, a, 'refuge'); f.spoke.push('refuge'); if (hr(sim.seed, D.ROBOT, a.id, 7000 + rb.findSeq) < P.robotFollowP) { informPerson(sim, a); f.followed = true; } else f.followed = false; }
      else { rbSpeak(sim, r, a, 'stay'); f.spoke.push('stay'); }
      if (danger || cond === 'injured' || a.st === 'waiting') startHold(sim, r, a, f);
    } else if (a.aware === 2 && a.st === 'moving') { f.action = 'none'; f.followed = true; }
    else { f.action = 'guide'; rbSpeak(sim, r, a, 'intro'); f.spoke.push('intro'); beginGuide(sim, r, a, f); }
    if (f.hood) { rbSpeak(sim, r, a, 'hood'); f.spoke.push('hood'); }
  }
  function stepPending(sim, r) {   // back to searching: look after people the robot found while it was busy
    var rb = sim.rb;
    while (rb.pending.length) {
      var f = rb.finds[+rb.pending.shift().slice(1) - 1], a = f ? sim.byKey[f.key] : null;
      if (!a || a.rescued || a.st === 'safe' || a.checkin || !inStruct(sim, r, a)) continue;
      if (a.aware === 2 && a.st === 'moving') continue;
      engageFind(sim, r, a, f); return true;
    }
    return false;
  }
  function refugeRouteFor(sim, r, a, l) {   // a no-stairs route to the refuge balcony that is not blocked right now (residence only)
    var g = r.G, ref = g.byId['REF']; if (ref === undefined) return null;
    var p = rbAStar(sim, r, l, ref, { person: true, noStairs: true });
    if (!p.ok) return null;
    for (var i = 0; i < p.path.length; i++) if (r.F.smoke[p.path[i]] >= 0.7) return null;
    return p.path;
  }
  function startHold(sim, r, a, f) {
    r.hold = { key: a.key, find: f.id, since: sim.t, lastStatus: sim.t };
    rbSpeak(sim, r, a, 'hold'); f.spoke.push('hold');
    setRobotState(sim, r, 'holding', 'يبقى مع ' + (a.name ? a.name.ar : 'الشخص') + ' حتى تصل الفرق', 'Holding with ' + (a.name ? a.name.en : 'the person') + ' until crews arrive');
    evt(sim, 'robot-hold', { robot: r.id, person: a.key, find: f.id }, 'الروبوت ' + r.id + ' يبقى مع ' + (a.name ? a.name.ar : 'شخص لا يستطيع الحركة') + ' — ' + f.place.ar + ' — ويبلّغ غرفة التحكم', 'Robot ' + r.id + ' stays with ' + (a.name ? a.name.en : 'a person who cannot move') + ' — ' + f.place.en + ' — and reports to the control room');
  }
  function guideRoute(sim, r, a, f) {   // the route the person will take (the live MANARA route when it exists), as local node indices inside the building
    var g = r.G, S = r.S, route = [], l = a.g - S.base, i;
    if (sim.rt.ready && a.aware === 2) {
      var pr = personRoute(sim, a);
      if (pr && pr.nodes) for (i = 0; i < pr.nodes.length; i++) { var gi = pr.nodes[i]; if (gi >= S.base && gi < S.base + g.n) route.push(gi - S.base); else break; }
    }
    if (route.length < 2) {   // no live field yet: the robot plans it itself to the nearest exit that is really open
      var best = null;
      for (i = 0; i < g.exits.length; i++) {
        var ex = g.exits[i], st = sim.exits[ex.gi].state; if (st === 'LOCKED' || st === 'FIRE') continue;
        var p = rbAStar(sim, r, l, ex.l, { person: true, noStairs: a.persona === 'wheelchair' });
        if (p.ok && (!best || p.cost < best.cost)) best = p;
      }
      route = best ? best.path : [];
    }
    return route;
  }
  function beginGuide(sim, r, a, f) {
    var P = sim.P, t = sim.t;
    var follows = hr(sim.seed, D.ROBOT, a.id, 7000 + sim.rb.findSeq) < P.robotFollowP;
    f.followed = follows;
    if (follows) informPerson(sim, a);
    var route = guideRoute(sim, r, a, f), ex = exitNameFor(r.G, route);
    var persona = personaOf(a);
    rbSpeak(sim, r, a, 'guide', { exit: ex });
    f.spoke.push('guide');
    f.guideExit = ex;
    var way = route.slice(1), tr = r.variant === 'tracked', wp = [], i;
    for (i = 0; i < way.length && wp.length < P.robotBeaconsPerFind; i++) {   // beacons on the first nodes of the way out, as far as THIS robot can drive there
      var e = rbEdge(r.G, i ? way[i - 1] : route[0], way[i]);
      if (e && (e.flag & F_STAIRS) && !tr) break;
      wp.push(way[i]);
    }
    wp = wp.slice(0, Math.max(0, r.beaconsLeft));
    r.engage = { kind: 'guide', key: a.key, find: f.id, wp: wp, placed: 0, until: t + P.robotGuideSec, exit: ex };
    setRobotState(sim, r, 'guiding', 'يرشد ' + (a.name ? a.name.ar : 'شخصاً') + ' ويضع منارات الطريق', 'Guiding ' + (a.name ? a.name.en : 'a person') + ' and dropping route beacons');
  }

  // ---------------------------------------------------------------- search order
  function roomCounts(sim, r) {   // per room: unaccounted residents (no check-in, not yet found by a robot) and how many of them have needs
    var counts = {}, scope = {}; sim.pre.scope.forEach(function (gg) { scope[gg] = true; });
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (!a.registered || !scope[a.group] || a.away || a.checkin !== null || (a.robotFoundAt !== undefined && a.robotFoundAt !== null)) continue;
      var room = a.room || a.cls; if (!room || !r.G.byRoom[room]) continue;
      var c = counts[room] || (counts[room] = { un: 0, needs: 0 });
      c.un++; if (needsOf(a).length) c.needs++;
    }
    return counts;
  }
  function roomPriority(sim, r, quiet) {
    var g = r.G, rb = sim.rb, S = r.S, F = r.F, counts = roomCounts(sim, r), list = [], origin = sim.hazard === 'fire' ? S.nodes[sim.hz.originLocal] : null;
    g.rooms.forEach(function (rm) {
      var rec = r.rooms[rm.room], c = counts[rm.room] || { un: 0, needs: 0 };
      rec.un = c.un;
      if (rec.status === 'locked' || rec.status === 'unreachable') return;
      if (rec.status === 'hot' && sim.t < rec.retryAt) return;
      var hotNb = false;   // a leaf room next to a corridor that is already hot is a trap: the robot waits
      if (rm.type === NT.ROOM) for (var kk = 0; kk < g.adj[rm.l].length; kk++) if (F.temp[g.adj[rm.l][kk].to] > sim.P.robotHeatWarnC) hotNb = true;
      if (hotNb || F.imp[rm.l]) {
        if (quiet) return;
        if (rec.hotSince === undefined) rec.hotSince = sim.t;
        rec.status = sim.t - rec.hotSince > 300 ? 'unreachable' : 'hot'; rec.retryAt = sim.t + 20;
        robotBlockedReport(sim, r, 'hot', rm.id, T('الروبوت ' + r.id + ': ' + rbNodeText(g, rm.l).ar + ' شديدة الحرارة أو الدخان أو لا طريق إليها — لم تُفتَّش', 'Robot ' + r.id + ': ' + rbNodeText(g, rm.l).en + ' is too hot, too smoky or cut off — not searched'), rm.room, S.nodes[rm.l].fl + 1);
        return;
      }
      if (rec.status === 'hot' && !quiet) { rec.status = 'open'; rec.hotSince = undefined; }
      if (rec.passes >= sim.P.robotRecheckPasses) return;
      if (rec.passes >= 1 && c.un === 0) return;
      var claim = rb.claims[rm.room]; if (claim && claim !== r.id && sim.robots.some(function (o) { return o.id === claim && o.state !== 'stowed' && o.state !== 'fault' && o.state !== 'returning'; })) return;
      var nd = S.nodes[rm.l], sm = F.smoke[rm.l];
      for (var k = 0; k < g.adj[rm.l].length; k++) sm = Math.max(sm, F.smoke[g.adj[rm.l][k].to]);
      var prox = origin ? clamp(1 - dist2(nd.x, nd.y, origin.x, origin.y) * CELL / 40, 0, 1) + (nd.fl === origin.fl ? 0.2 : 0) : 0;
      var score = (c.needs > 0 ? 1000 : 0) + (c.un > 0 ? 300 : 0) + 25 * Math.min(c.un, 6) + 30 * c.needs + 60 * sm + 30 * prox - 60 * rec.passes;
      var pi = rb.priority.indexOf(rm.room); if (pi >= 0) score += 100000 - 1000 * pi;   // the operator's list always wins over the automatic order
      list.push({ rm: rm, rec: rec, score: score, un: c.un, needs: c.needs });
    });
    list.sort(function (x, y) { return y.score - x.score || x.rm.l - y.rm.l; });
    return list;
  }
  function pickTarget(sim, r) {
    var cands = roomPriority(sim, r), best = null, tried = 0;
    for (var i = 0; i < cands.length && tried < 8; i++) {
      var cd = cands[i], rm = cd.rm, plan = rbAStar(sim, r, r.node, rm.l);
      if (!plan.ok) {   // why not? only the stairs (a wheeled robot), or a hazard / blocked corridor on the way
        var nd = r.S.nodes[rm.l], alt = r.variant === 'wheeled' ? rbAStar(sim, r, r.node, rm.l, { stairsOk: true }) : null;
        if (alt && alt.ok) {
          cd.rec.status = 'unreachable';
          robotBlockedReport(sim, r, 'stairs', 'floor' + nd.fl, T('الروبوت ' + r.id + ' (عجلات) لا يصعد الدرج — الطابق ' + (nd.fl + 1) + ' لم يُفتَّش: يلزم روبوت بجنزير أو فرق الإنقاذ', 'Robot ' + r.id + ' (wheeled) cannot climb stairs — floor ' + (nd.fl + 1) + ' not searched: a tracked unit or crews are needed'), null, nd.fl + 1);
        } else {
          cd.rec.status = 'hot'; cd.rec.retryAt = sim.t + 30;
          robotBlockedReport(sim, r, 'hot', rm.id, T('الروبوت ' + r.id + ': ' + rbNodeText(r.G, rm.l).ar + ' شديدة الحرارة أو الدخان أو لا طريق إليها — لم تُفتَّش', 'Robot ' + r.id + ': ' + rbNodeText(r.G, rm.l).en + ' is too hot, too smoky or cut off — not searched'), rm.room, nd.fl + 1);
        }
        continue;
      }
      tried++;
      var eff = cd.score - 0.15 * plan.cost;
      if (!best || eff > best.eff) best = { eff: eff, cd: cd, plan: plan };
    }
    if (!best) return false;
    r.target = { kind: 'room', node: best.cd.rm.l, room: best.cd.rm.room, id: best.cd.rm.id };
    r.path = best.plan.path.slice(1); sim.rb.claims[best.cd.rm.room] = r.id;
    return true;
  }
  function searchComplete(sim, r) {
    if (roomPriority(sim, r).length) return false;
    for (var id in r.rooms) if (r.rooms[id].status === 'hot') return false;   // a room that is only too hot for now is not finished
    return true;
  }

  // ---------------------------------------------------------------- movement (one second)
  function rbSpeedFactor(sim, r, stairs) {
    var P = sim.P, F = r.F, sm = F.smoke[r.node], v = r.variant === 'tracked' ? P.robotSpeedTracked : P.robotSpeedWheeled;
    if (stairs) v /= P.robotStairPenalty;
    v *= 1 - P.robotSmokeSlowPct / 100 * Math.min(1, sm * 1.5);
    if (F.temp[r.node] > P.robotHeatWarnC) v *= 0.7;
    return v;
  }
  function rbEnter(sim, r, l) {
    var g = r.G, F = r.F, st = r.st, nd = g.S.nodes[l];
    var rec = { t: sim.t, node: nd.id, burn: st.burn[l], I: Math.round(st.I[l] * 100) / 100, temp: Math.round(F.temp[l]), smoke: Math.round(F.smoke[l] * 100) / 100 };
    if (r.entered.length < 600) r.entered.push(rec);
    if (st.burn[l] === 1 || st.I[l] > 0.05 || F.temp[l] > sim.P.robotMaxTempC + 0.5) { r.enteredBad++; rec.bad = true; }
    // exits it passes: report one that is locked / burning (it never forces anything)
    for (var i = 0; i < g.exits.length; i++) {
      var ex = g.exits[i];
      if (ex.l !== l || ex.kind === 'entrance') continue;
      var state = sim.exits[ex.gi].state;
      if (state === 'LOCKED' || state === 'FIRE') robotBlockedReport(sim, r, 'exit-' + state.toLowerCase(), ex.id + '@' + state, T('الروبوت ' + r.id + ': ' + ex.name.ar + ' — ' + (state === 'LOCKED' ? 'مقفل' : 'نار') + ' — لم يُفتح (الروبوت لا يكسر الأبواب). يلزم الحارس أو فرق الإنقاذ', 'Robot ' + r.id + ': ' + ex.name.en + ' — ' + (state === 'LOCKED' ? 'LOCKED' : 'on FIRE') + ' — not opened (the robot never breaks doors). The guard or crews must deal with it'), null, nd.fl + 1);
    }
  }
  function rbMove(sim, r) {   // returns 'idle' | 'moving' | 'arrived' | 'blocked' | 'door'
    var g = r.G, P = sim.P, F = r.F, st = r.st, rb = sim.rb;
    if (r.doorWait > 0) { r.doorWait--; return 'door'; }
    if (r.to < 0) {
      if (!r.path.length) return 'idle';
      var nx = r.path[0], e = rbEdge(g, r.node, nx);
      if (!e) { r.path = []; return 'blocked'; }
      if ((e.flag & F_STAIRS) && r.variant !== 'tracked') { r.path = []; return 'blocked'; }
      if (F.imp[nx] || r.known[nx]) { r.path = []; return 'blocked'; }
      var ob = rb.obst[g.S.nodes[nx].id];
      if (ob && ob.locked) {   // discovered at the door: reported, never forced
        r.known[nx] = 1;
        var nd = g.S.nodes[nx], isRoom = nd.type === NT.ROOM;
        robotBlockedReport(sim, r, isRoom ? 'locked-door' : 'blocked-corridor', nd.id, isRoom ? T('الروبوت ' + r.id + ': باب غرفة ' + nd.room + ' مقفل — لم يُفتح (الروبوت لا يكسر الأبواب). يلزم الحارس أو فرق الإنقاذ', 'Robot ' + r.id + ': the door of room ' + nd.room + ' is locked — not opened (the robot never breaks doors). The guard or crews must open it')
          : T('الروبوت ' + r.id + ': الممر مسدود عند «' + nd.label.ar + '» — الطابق ' + (nd.fl + 1) + ' — عُلِّم مسدوداً للروبوت', 'Robot ' + r.id + ': the corridor is blocked at "' + nd.label.en + '", floor ' + (nd.fl + 1) + ' — marked blocked for the robot'), isRoom ? nd.room : null, nd.fl + 1);
        if (isRoom && r.rooms[nd.room]) r.rooms[nd.room].status = 'locked';
        r.path = []; r.target = null; r.dwell = null;
        return 'blocked';
      }
      if (e.door >= 0 && !st.doorOpen[e.door]) {
        if (!P.robotOpensDoors) { r.known[nx] = 1; if (g.S.nodes[nx].room && r.rooms[g.S.nodes[nx].room]) r.rooms[g.S.nodes[nx].room].status = 'locked'; r.path = []; r.target = null; return 'blocked'; }
        st.doorOpen[e.door] = 1; r.doorWait = Math.max(0, Math.round(P.robotDoorSec) - 1); r.stats.doorsOpened++; if (r.opened.length < 200) r.opened.push(g.S.nodes[nx].id);
        return 'door';
      }
      r.to = nx; r.prog = 0; r.edgeLen = e.len; r.edgeFlag = e.flag; r.path.shift();
      var A = g.S.nodes[r.node], B = g.S.nodes[nx];
      if (Math.abs(B.x - A.x) + Math.abs(B.y - A.y) > 1e-6) r.heading = (Math.atan2(B.x - A.x, -(B.y - A.y)) / DEG + 360) % 360;
    }
    if (F.imp[r.to] || r.known[r.to]) { r.to = -1; r.prog = 0; r.path = []; return 'blocked'; }   // the node ahead became impassable while it drove: it backs off to where it came from
    var stairs = (r.edgeFlag & F_STAIRS) !== 0, v = rbSpeedFactor(sim, r, stairs);
    r.prog += v; r.driven += v; if (stairs) r.stats.stairsM += v;
    if (r.prog >= r.edgeLen) { r.node = r.to; r.to = -1; r.prog = 0; rbEnter(sim, r, r.node); return 'arrived'; }
    return 'moving';
  }
  function rbPose(sim, r) {
    var S = r.S, A = S.nodes[r.node];
    if (r.to >= 0 && r.edgeLen > 0) { var B = S.nodes[r.to], f = clamp(r.prog / r.edgeLen, 0, 1); return { x: lerp(A.x, B.x, f), y: lerp(A.y, B.y, f), fl: f < 0.5 ? A.fl : B.fl }; }
    return { x: A.x, y: A.y, fl: A.fl };
  }

  // ---------------------------------------------------------------- link (mesh through the entrance gateway and the beacons), battery, heat
  function relayField(sim, r) {   // metres from the nearest relay to every node (the entrance gateway, plus every beacon when beacons relay); a floor costs robotFloorLossM extra
    var g = r.G, P = sim.P, d = r.relay, n = g.n, i, queue = [], inq = new Uint8Array(n);
    d.fill(Infinity);
    var relays = [g.entrance]; if (P.robotBeaconRelay) r.beacons.forEach(function (b) { relays.push(b.l); });
    relays.forEach(function (l) { d[l] = 0; queue.push(l); inq[l] = 1; });
    for (var qi = 0; qi < queue.length; qi++) {   // label-correcting (the graph is tiny)
      var u = queue[qi]; inq[u] = 0;
      var list = g.adj[u];
      for (var k = 0; k < list.length; k++) {
        var e = list[k], nd = d[u] + e.len + ((e.flag & F_STAIRS) ? P.robotFloorLossM : 0);
        if (nd < d[e.to]) { d[e.to] = nd; if (!inq[e.to]) { inq[e.to] = 1; queue.push(e.to); } }
      }
    }
    r.relayDirty = false;
  }
  function stepLink(sim, r) {
    var P = sim.P, L = r.link, t = sim.t;
    if (r.relayDirty) relayField(sim, r);
    var d = r.relay[r.node], q = clamp(1 - d / P.robotMeshRangeM, 0, 1);
    if (P.robotBeaconRelay && q < 0.25 && r.beaconsLeft > 0 && r.to < 0 && d > 0) {   // the signal is getting weak: it drops a relay beacon here to extend the mesh
      var nd0 = r.S.nodes[r.node];
      r.beacons.push({ node: nd0.id, l: r.node, x: nd0.x, y: nd0.y, fl: nd0.fl, t: t, auto: true }); r.beaconsLeft--;
      evt(sim, 'robot-relay', { robot: r.id, node: nd0.id }, 'الروبوت ' + r.id + ' وضع مرحّل اتصال عند ' + rbNodeText(r.G, r.node).ar + ' (يتبقى ' + r.beaconsLeft + ')', 'Robot ' + r.id + ' dropped a link relay at ' + rbNodeText(r.G, r.node).en + ' (' + r.beaconsLeft + ' left)');
      relayField(sim, r); d = r.relay[r.node]; q = clamp(1 - d / P.robotMeshRangeM, 0, 1);
    }
    L.q = q;
    var up = true;
    if (t < L.downUntil) up = false;
    else if (q < 0.12) up = false;
    else if (q < 0.5 && P.robotDropoutPct > 0 && hr(sim.seed, D.ROBOT, 900 + r.n, t) < P.robotDropoutPct / 100 * (1 - q)) { L.downUntil = t + Math.max(2, Math.round(P.robotDropoutSec * (0.7 + 0.6 * hr(sim.seed, D.ROBOT, 950 + r.n, t)))); L.dropouts++; up = false; }
    if (up !== L.up) {
      L.up = up;
      if (up) evt(sim, 'robot-link', { robot: r.id, up: true }, 'عاد اتصال الروبوت ' + r.id + ' — تُرسَل التقارير المخزَّنة', 'Robot ' + r.id + ' link is back — buffered reports are sent');
      else evt(sim, 'robot-link', { robot: r.id, up: false, q: Math.round(q * 100) / 100 }, 'انقطع اتصال الروبوت ' + r.id + ' — يعمل بنفسه وتُخزَّن تقاريره', 'Robot ' + r.id + ' lost its link — it keeps working on its own and its reports are buffered');
    }
    if (!up) { L.downSec++; L.downFor++; } else L.downFor = 0;
    if (up) robotFlush(sim, r);
    r.linkRecovery = !up && L.downFor >= P.robotLinkLostSec;
  }
  function drainPerSec(sim, r, moving, stairs) {
    var P = sim.P, F = r.F, l = r.node;
    var hm = P.robotHeatDrain * Math.max(0, (F.temp[l] - 40) / 10), sm = P.robotSmokeDrain * F.smoke[l];
    return 1 / (P.robotBattMin * 60) * (r.variant === 'tracked' ? P.robotTrackedDrain : 1) * (1 + hm + sm) * (moving ? (stairs ? P.robotStairDrain : 1) : P.robotIdleDrain);
  }
  function returnCost(sim, r) {   // battery needed to drive back to the entrance now: summed edge by edge (stairs cost more time AND more power, heat and smoke raise the drain), with a margin
    var p = rbAStar(sim, r, r.node, r.G.entrance);
    if (!p.ok) return null;
    var P = sim.P, F = r.F, v = r.variant === 'tracked' ? P.robotSpeedTracked : P.robotSpeedWheeled, base = 1 / (P.robotBattMin * 60) * (r.variant === 'tracked' ? P.robotTrackedDrain : 1), e = 0;
    for (var i = 1; i < p.path.length; i++) {
      var ed = rbEdge(r.G, p.path[i - 1], p.path[i]), w = p.path[i], stairs = (ed.flag & F_STAIRS) !== 0;
      var sec = ed.len / v * (stairs ? P.robotStairPenalty : 1) / Math.max(0.3, 1 - P.robotSmokeSlowPct / 100 * Math.min(1, F.smoke[w] * 1.5));
      e += sec * base * (stairs ? P.robotStairDrain : 1) * (1 + P.robotHeatDrain * Math.max(0, (F.temp[w] - 40) / 10) + P.robotSmokeDrain * F.smoke[w]);
    }
    return e * 1.25 + 0.02;
  }
  function robotFault(sim, r, why) {
    if (r.state === 'fault') return;
    r.stats.faultAt = sim.t; r.stats.faultWhy = why.key;
    r.path = []; r.target = null; r.hold = null; r.engage = null; r.to = -1; r.prog = 0;
    var where = rbNodeText(r.G, r.node);
    setRobotState(sim, r, 'fault', 'عطل: ' + why.text.ar, 'Fault: ' + why.text.en);
    evt(sim, 'robot-fault', { robot: r.id, why: why.key, node: r.S.nodes[r.node].id }, 'الروبوت ' + r.id + ' تعطّل (' + why.text.ar + ') في ' + where.ar + ' — يلزم الاسترداد', 'Robot ' + r.id + ' has a fault (' + why.text.en + ') at ' + where.en + ' — it needs recovering');
    robotBlockedReport(sim, r, 'fault', r.id + '@' + why.key, T('الروبوت ' + r.id + ' متوقف في ' + where.ar + ': ' + why.text.ar, 'Robot ' + r.id + ' is stopped at ' + where.en + ': ' + why.text.en), r.S.nodes[r.node].room || null, r.S.nodes[r.node].fl + 1);
  }
  function startReturn(sim, r, reason, ar, en) {
    if (r.state === 'returning' || r.state === 'fault') return;
    r.hold = null; r.engage = null; r.dwell = null; r.investigate = null; r.teleop = null; r.recall = false;
    if (r.target && r.target.room && sim.rb.claims[r.target.room] === r.id) delete sim.rb.claims[r.target.room];
    r.target = { kind: 'entrance', node: r.G.entrance }; r.path = []; r.returnReason = reason;
    setRobotState(sim, r, 'returning', ar, en);
  }
  function rbFlee(sim, r) {   // the fire reached the node it stands on: step to the coolest passable neighbour (never into an impassable one)
    var g = r.G, F = r.F, list = g.adj[r.node], best = -1, bt = Infinity, i;
    for (i = 0; i < list.length; i++) { var w = list[i].to; if (F.imp[w] || r.known[w]) continue; if ((list[i].flag & F_STAIRS) && r.variant !== 'tracked') continue; if (F.temp[w] < bt) { bt = F.temp[w]; best = w; } }
    if (best < 0) { robotFault(sim, r, { key: 'trapped', text: T('حاصرته النار', 'trapped by fire') }); return; }
    r.node = best; r.to = -1; r.prog = 0; r.path = []; r.flee++;
    evt(sim, 'robot-retreat', { robot: r.id, node: g.S.nodes[best].id }, 'الروبوت ' + r.id + ' تراجع بعيداً عن النار إلى ' + rbNodeText(g, best).ar, 'Robot ' + r.id + ' backed away from the fire to ' + rbNodeText(g, best).en);
  }

  // ---------------------------------------------------------------- detection (every second while the robot is active)
  function stepDetect(sim, r) {
    var P = sim.P, g = r.G, S = r.S, F = r.F, t = sim.t, vis = r.vis || (r.vis = new Float32Array(g.n)), i, a;
    visibleNodes(sim, r, F, vis);
    for (i = 0; i < g.n; i++) if (vis[i] < Infinity) r.cov[i] = Math.min(1, r.cov[i] + 0.25 * thermalVisibility(sim, Math.max(F.smoke[r.node], F.smoke[i]), vis[i]));
    var hereRoom = S.nodes[r.node].type === NT.ROOM || S.nodes[r.node].type === NT.SUPPORT, someoneHere = false;
    for (i = 0; i < sim.people.length; i++) {
      a = sim.people[i];
      if (a.away || a.g < 0 || a.rescued || !inStruct(sim, r, a)) continue;
      var l = a.g - S.base, d = vis[l];
      if (!(d < Infinity)) continue;
      if (l === r.node) someoneHere = true;
      if (a.aware === 2 && a.st !== 'waiting' && a.st !== 'incapacitated' && a.st !== 'down' && !(a.st === 'sheltered' && a.safeKind === 'refuge')) continue;   // informed and not stuck: nothing to find or report
      a.robotViewSec = (a.robotViewSec || 0) + 1;
      if (a.robotFoundAt !== undefined && a.robotFoundAt !== null) continue;
      var pd = detectP(sim, r, a, d + 0.4, F, l);
      if (hr(sim.seed, D.ROBOT, 3000 + a.id, t) < pd.p) onFind(sim, r, a, pd.au > Math.max(pd.th, pd.rgb) ? 'audio' : (pd.au > 0 && pd.au > 0.5 * Math.max(pd.th, pd.rgb)) ? 'camera+audio' : pd.th >= pd.rgb ? 'thermal' : 'camera', pd);
      if (r.state === 'fault') break;
    }
    // false positive: a hot object in a room looks like a person (more often in hot rooms); it is checked, then dismissed
    if (hereRoom && !someoneHere && !r.investigate && P.robotFalsePosPerMin > 0 && (r.state === 'searching')) {
      var pfp = P.robotFalsePosPerMin / 60 * (1 + Math.max(0, F.temp[r.node] - P.robotRoomC) / 20);
      if (hr(sim.seed, D.ROBOT, 5000 + r.n * 100 + r.node, t) < pfp) { r.investigate = { until: t + Math.round(P.robotInvestigateSec), node: r.node }; r.stats.falsePositives++; }
    }
  }

  // ---------------------------------------------------------------- the state machine
  function stepRobot(sim, r) {
    var P = sim.P, t = sim.t, rb = sim.rb;
    rbFieldFill(sim, r.G, r.F);
    if (r.state === 'stowed' || r.state === 'fault') { if (r.state === 'fault') { /* a stopped robot still holds its beacons as relays */ } return; }
    if (r.state === 'approved') {
      var ready = r.readyAt;
      if (ready === null && P.robotCarrier) { var onSc = sim.hazard === 'fire' ? sim.fx.engineOnScene : sim.fx.hazmatOnScene; if (onSc !== null) { r.readyAt = onSc + P.robotUnloadSec; ready = r.readyAt; } }
      if (ready !== null && t >= ready) { r.deployUntil = t + Math.round(P.robotDeploySec); r.stats.started = t; setRobotState(sim, r, 'deploying', 'يُجهَّز عند مدخل المبنى (بعد اعتماد قائد الحادث)', 'Deploying at the building entrance (after the incident commander\'s approval)'); }
      return;
    }
    if (r.state === 'deploying') {
      if (t >= r.deployUntil) {
        setRobotState(sim, r, 'searching', 'يدخل المبنى ويبدأ البحث — الأولوية لغير المحصيّين ومن لديهم احتياجات', 'Entering the building — search order: unaccounted people and people with needs first');
        var order = roomPriority(sim, r).slice(0, 5).map(function (x) { return x.rm.room; });
        evt(sim, 'robot-search-order', { robot: r.id, order: order }, 'ترتيب بحث الروبوت ' + r.id + ' (أول الغرف): ' + order.join('، '), 'Robot ' + r.id + ' search order (first rooms): ' + order.join(', '));
      }
      return;
    }
    // active: searching | guiding | holding | returning
    stepLink(sim, r);
    if (r.state === 'fault') return;
    var moving = r.to >= 0, stairsNow = moving && (r.edgeFlag & F_STAIRS) !== 0;
    r.battery = Math.max(0, r.battery - drainPerSec(sim, r, moving, stairsNow));
    var T0 = r.F.temp[r.node];
    if (T0 > P.robotHeatWarnC) r.heat++; else r.heat = Math.max(0, r.heat - 0.5);
    if (r.F.imp[r.node] && r.to < 0) { rbFlee(sim, r); if (r.state === 'fault') return; }
    if (r.battery <= 0) { robotFault(sim, r, { key: 'battery', text: T('نفدت البطارية', 'battery exhausted') }); return; }
    if (r.heat >= P.robotHeatSoakSec) { robotFault(sim, r, { key: 'overheated', text: T('توقف حراري للحماية', 'thermal shutdown') }); return; }
    stepDetect(sim, r);
    if (r.state === 'fault') return;
    // recall and battery (checked in every active state except when already returning)
    if (r.state !== 'returning') {
      var why = null;
      if (r.recall) why = 'recall';
      else if (r.battery <= P.robotReturnPct / 100) why = 'battery';
      else if (t >= r.planCheckAt) { r.planCheckAt = t + 3; var c = returnCost(sim, r); if (c !== null && r.battery <= c) why = 'battery'; }
      if (why === 'recall') startReturn(sim, r, 'recall', 'استُدعي — يعود إلى المدخل', 'Recalled — returning to the entrance');
      else if (why === 'battery') {
        evt(sim, 'robot-battery-low', { robot: r.id, pct: Math.round(r.battery * 100) }, 'بطارية الروبوت ' + r.id + ' ' + Math.round(r.battery * 100) + '٪ — يعود إلى المدخل', 'Robot ' + r.id + ' battery ' + Math.round(r.battery * 100) + ' % — returning to the entrance');
        startReturn(sim, r, 'battery', 'البطارية منخفضة — يعود', 'Battery low — returning');
      }
    }
    switch (r.state) {
      case 'searching': stepSearching(sim, r); break;
      case 'guiding': stepGuiding(sim, r); break;
      case 'holding': stepHolding(sim, r); break;
      case 'returning': stepReturning(sim, r); break;
    }
  }
  function replan(sim, r, goal) {
    var p = rbAStar(sim, r, r.node, goal);
    if (!p.ok) { r.path = []; return false; }
    r.path = p.path.slice(1); return true;
  }
  function stepSearching(sim, r) {
    var P = sim.P, t = sim.t, rb = sim.rb, g = r.G;
    if (r.investigate) {
      if (t < r.investigate.until) return;
      var nd0 = r.S.nodes[r.node];
      evt(sim, 'robot-false-positive', { robot: r.id, node: nd0.id }, 'الروبوت ' + r.id + ': «شخص محتمل» في ' + rbNodeText(g, r.node).ar + ' لم يتأكد — أُسقط كإنذار كاذب (جسم ساخن)', 'Robot ' + r.id + ': a possible person in ' + rbNodeText(g, r.node).en + ' was not confirmed — dismissed as a false alarm (a hot object)');
      r.investigate = null; return;
    }
    if (rb.pending.length && !r.dwell && !r.target && r.to < 0 && stepPending(sim, r)) return;
    if (r.linkRecovery && r.to < 0 && !r.teleop) {   // lost the link for too long: back toward the nearest relay
      var cur = r.relay[r.node];
      if (cur > 0) { var bestN = -1, bc = Infinity; for (var q = 0; q < g.n; q++) if (r.relay[q] === 0) { var pp = rbAStar(sim, r, r.node, q); if (pp.ok && pp.cost < bc) { bc = pp.cost; bestN = q; } } if (bestN >= 0 && (!r.target || r.target.kind !== 'relay')) { r.target = { kind: 'relay', node: bestN }; replan(sim, r, bestN); } }
    }
    if (r.teleop && !(r.target && r.target.kind === 'wp')) {
      r.target = { kind: 'wp', node: r.teleop.l }; r.dwell = null;
      if (!replan(sim, r, r.teleop.l) && r.node !== r.teleop.l) { evt(sim, 'robot-teleop', { robot: r.id, ok: false }, 'تعذّر الوصول إلى نقطة التحكم عن بُعد', 'The tele-operation waypoint cannot be reached'); r.teleop = null; r.target = null; }
    }
    if (r.dwell) {
      r.dwell.left--;
      if (r.dwell.left <= 0) {
        var rec = r.rooms[r.dwell.room]; rec.passes++; rec.status = 'searched'; rec.lastAt = t; r.cov[rec.l] = 1;
        var found = rec.found;
        evt(sim, 'robot-room-searched', { robot: r.id, room: r.dwell.room, found: found, pass: rec.passes }, 'الروبوت ' + r.id + ' أنهى مسح غرفة ' + r.dwell.room + (found ? ' — عُثر على ' + found : ' — لا أحد ظاهر'), 'Robot ' + r.id + ' finished sweeping room ' + r.dwell.room + (found ? ' — ' + found + ' found' : ' — no one seen'));
        delete rb.claims[r.dwell.room]; r.dwell = null; r.target = null;
      }
      return;
    }
    if (!r.target && r.to < 0) {
      if (!pickTarget(sim, r)) {
        if (searchComplete(sim, r)) { evt(sim, 'robot-search-complete', { robot: r.id }, 'الروبوت ' + r.id + ' أنهى البحث في كل الغرف الممكنة — يعود', 'Robot ' + r.id + ' has searched every room it can — returning'); startReturn(sim, r, 'complete', 'أنهى البحث — يعود', 'Search complete — returning'); }
        return;
      }
    }
    if (r.target && !r.path.length && r.to < 0 && r.node !== r.target.node) { if (!replan(sim, r, r.target.node)) { if (r.target.kind === 'room') delete rb.claims[r.target.room]; r.target = null; return; } }
    if (r.path.length) {   // the way may have become impassable since it was planned
      for (var i = 0; i < r.path.length; i++) if (r.F.imp[r.path[i]]) { if (!replan(sim, r, r.target.node)) { if (r.target.kind === 'room') delete rb.claims[r.target.room]; r.target = null; } break; }
    }
    var res = rbMove(sim, r);
    if (res === 'blocked') { if (r.target && r.target.kind === 'room') { delete rb.claims[r.target.room]; } if (r.target && r.target.kind !== 'wp') r.target = null; else if (r.target) { r.target = null; r.teleop = null; } return; }
    if ((res === 'arrived' || res === 'idle') && r.target && r.node === r.target.node && r.to < 0) {
      if (r.target.kind === 'room') { r.dwell = { room: r.target.room, left: Math.round(P.robotRoomSweepSec) }; r.cov[r.target.node] = Math.max(r.cov[r.target.node], 0.5); }
      else if (r.target.kind === 'wp') { evt(sim, 'robot-teleop', { robot: r.id, ok: true }, 'وصل الروبوت ' + r.id + ' إلى نقطة التحكم عن بُعد — يعود للبحث الذاتي', 'Robot ' + r.id + ' reached the tele-operation waypoint — back to autonomous search'); r.teleop = null; r.target = null; }
      else { r.target = null; }
    }
  }
  function approach(sim, r, a) {   // true while the robot is still driving to the person's node
    var pl = inStruct(sim, r, a) ? a.g - r.S.base : -1;
    if (pl < 0 || (r.node === pl && r.to < 0)) return false;
    if (!r.path.length && r.to < 0) { if (!replan(sim, r, pl)) return false; }
    var res = rbMove(sim, r);
    if (res === 'blocked') { r.path = []; return false; }
    return true;
  }
  function stepGuiding(sim, r) {
    var P = sim.P, t = sim.t, E = r.engage, a = E ? sim.byKey[E.key] : null;
    if (!E || !a) { r.engage = null; setRobotState(sim, r, 'searching'); return; }
    var f = sim.rb.finds[+E.find.slice(1) - 1];
    if (E.kind === 'wake') {
      if (!a.asleep) { E.kind = 'guide'; f.woke = true; beginGuide(sim, r, a, f); return; }
      if (t < E.until && approach(sim, r, a)) return;   // it drives to the sleeper's door first
      if (t >= E.nextAt) {
        E.tries++; E.nextAt = t + 5;
        rbSpeak(sim, r, a, 'wake');
        if (hr(sim.seed, D.ROBOT, 4000 + a.id, E.tries * 997 + t) < P.robotWakeP) {
          wake(sim, a); a.robotWoke = true; f.woke = true; f.wokeAt = t;
          evt(sim, 'robot-woke', { robot: r.id, person: a.key, tries: E.tries }, 'أيقظ الروبوت ' + r.id + ' ' + (a.name ? a.name.ar : 'شخصاً') + ' (المحاولة ' + E.tries + ')', 'Robot ' + r.id + ' woke ' + (a.name ? a.name.en : 'a person') + ' (attempt ' + E.tries + ')');
          E.kind = 'guide'; beginGuide(sim, r, a, f); return;
        }
        if (E.tries >= P.robotWakeTries) {
          f.action = 'hold'; f.woke = false;
          evt(sim, 'robot-no-response', { robot: r.id, person: a.key }, 'لم يستجب ' + (a.name ? a.name.ar : 'الشخص') + ' بعد ' + E.tries + ' محاولات — يُعامَل كمن لا يستجيب وتُبلَّغ الفرق', (a.name ? a.name.en : 'The person') + ' did not respond after ' + E.tries + ' attempts — treated as not responding and crews are told');
          f.condition.key = 'unresponsive'; r.engage = null; startHold(sim, r, a, f); return;
        }
      }
      return;
    }
    // guide: walk the first nodes of the way out dropping a beacon on each (as far as this robot can drive), then back to the search
    if (t >= E.until || (E.placed >= E.wp.length && r.to < 0 && !r.path.length)) { endGuide(sim, r, a, f, E); return; }
    if (!r.path.length && r.to < 0 && E.placed < E.wp.length) {
      var nxt = E.wp[E.placed];
      if (r.node === nxt) { dropBeacon(sim, r, f, E); return; }
      if (!replan(sim, r, nxt)) { E.placed = E.wp.length; return; }
    }
    var res = rbMove(sim, r);
    if (res === 'arrived' && E.wp[E.placed] === r.node) dropBeacon(sim, r, f, E);
    else if (res === 'blocked') E.placed = E.wp.length;
  }
  function dropBeacon(sim, r, f, E) {
    if (r.beaconsLeft <= 0) { E.placed = E.wp.length; return; }
    var nd = r.S.nodes[r.node];
    r.beacons.push({ node: nd.id, l: r.node, x: nd.x, y: nd.y, fl: nd.fl, t: sim.t, find: f.id }); r.beaconsLeft--; E.placed++; f.beacons++; r.relayDirty = true;
  }
  function endGuide(sim, r, a, f, E) {
    r.engage = null; r.path = []; r.target = null;
    if (f.beacons > 0) evt(sim, 'robot-beacon', { robot: r.id, find: f.id, n: f.beacons, exit: E.exit ? E.exit.en : null }, 'الروبوت ' + r.id + ' وضع ' + f.beacons + ' منارة على طريق ' + (a.name ? a.name.ar : 'الشخص') + (E.exit ? ' نحو «' + E.exit.ar + '»' : ''), 'Robot ' + r.id + ' placed ' + f.beacons + ' route beacon(s) for ' + (a.name ? a.name.en : 'the person') + (E.exit ? ' toward "' + E.exit.en + '"' : ''));
    setRobotState(sim, r, 'searching', 'يعود إلى البحث', 'Back to searching');
  }
  function stepHolding(sim, r) {
    var P = sim.P, t = sim.t, H = r.hold, a = H ? sim.byKey[H.key] : null;
    if (!H || !a) { r.hold = null; setRobotState(sim, r, 'searching'); return; }
    var f = sim.rb.finds[+H.find.slice(1) - 1], why = null;
    if (a.rescued || a.st === 'safe' || a.checkin === 'safe') why = 'crews';
    else if (t - H.since >= P.robotHoldMaxSec) why = 'timeout';
    if (!why && approach(sim, r, a)) return;   // first it drives to the person, then it stays
    if (!why && t - H.lastStatus >= P.robotStatusSec) {
      H.lastStatus = t; var cnd = conditionOf(sim, a); if (f) f.condition = { key: cnd, est: true };
      evt(sim, 'robot-status', { robot: r.id, person: a.key, condition: cnd }, 'الروبوت ' + r.id + ' (مع ' + (a.name ? a.name.ar : 'الشخص') + '): الحالة ' + COND[cnd].ar + ' (تقدير) — دخان ' + Math.round(r.F.smoke[r.node] * 100) + '٪', 'Robot ' + r.id + ' (with ' + (a.name ? a.name.en : 'the person') + '): condition ' + COND[cnd].en + ' (est.) — smoke ' + Math.round(r.F.smoke[r.node] * 100) + ' %');
    }
    if (why) {
      evt(sim, 'robot-hold-end', { robot: r.id, person: a.key, why: why }, 'انتهى بقاء الروبوت ' + r.id + ' مع ' + (a.name ? a.name.ar : 'الشخص') + (why === 'crews' ? ' — وصلت الفرق' : ' — انتهت المهلة'), 'Robot ' + r.id + ' stops holding with ' + (a.name ? a.name.en : 'the person') + (why === 'crews' ? ' — crews reached them' : ' — hold time limit'));
      r.hold = null; setRobotState(sim, r, 'searching', 'يعود إلى البحث', 'Back to searching');
    }
  }
  function stepReturning(sim, r) {
    var g = r.G;
    if (r.node === g.entrance && r.to < 0) {
      r.stats.returnedAt = sim.t; r.target = null; r.path = []; r.approval = { status: 'none', requestedAt: null, approvedAt: null, by: null };
      evt(sim, 'robot-returned', { robot: r.id, battery: Math.round(r.battery * 100), reason: r.returnReason }, 'عاد الروبوت ' + r.id + ' إلى المدخل (البطارية ' + Math.round(r.battery * 100) + '٪)', 'Robot ' + r.id + ' is back at the entrance (battery ' + Math.round(r.battery * 100) + ' %)');
      setRobotState(sim, r, 'stowed', 'عاد إلى مكانه', 'Back at its place'); return;
    }
    if (!r.path.length && r.to < 0 && !replan(sim, r, g.entrance)) {
      if (!r.cutOff) { r.cutOff = true; robotBlockedReport(sim, r, 'cut-off', r.id + '@' + sim.t, T('الروبوت ' + r.id + ' لا يجد طريق عودة — يبقى في ' + rbNodeText(g, r.node).ar, 'Robot ' + r.id + ' has no way back — it stays at ' + rbNodeText(g, r.node).en), null, r.S.nodes[r.node].fl + 1); }
      return;
    }
    var res = rbMove(sim, r);
    if (res === 'blocked') r.path = [];
  }
  function stepRobots(sim) {
    var rb = sim.rb; if (!rb.enabled) return;
    stepRobotApproval(sim);
    for (var i = 0; i < sim.robots.length; i++) stepRobot(sim, sim.robots[i]);
  }

  // ---------------------------------------------------------------- operator actions
  function roleOf(sim, role) { return ROBOT_ROLES.indexOf(role) >= 0 ? role : sim.rb.role; }
  var ROLE_REJECT = T('اعتماد نشر الروبوت من صلاحية قائد الحادث فقط', 'Only the incident commander can approve sending the robot in');
  function noRole(sim, code, ar, en) { evt(sim, 'robot-approval-rejected', { code: code }, ar, en); return { ok: false, code: code, reason: T(ar, en) }; }
  function apiSetRole(sim, role) {
    if (ROBOT_ROLES.indexOf(role) < 0) return { ok: false, code: 'role', reason: T('دور غير معروف', 'Unknown role'), roles: ROBOT_ROLES.slice() };
    sim.rb.role = role;
    evt(sim, 'operator-role', { role: role }, 'دور المشغّل (محاكاة): ' + ({ viewer: 'مشاهد', operator: 'مشغّل', commander: 'قائد الحادث' })[role], 'Operator role (simulated): ' + role);
    return { ok: true, role: role };
  }
  function apiDeployRobot(sim, id, role) {
    var rb = sim.rb;
    if (!rb.enabled) { var en = enableRobot(sim, {}); if (!en.ok) return en; }
    role = roleOf(sim, role);
    if (role === 'viewer') return noRole(sim, 'role', 'المشاهد لا يستطيع طلب نشر الروبوت', 'A viewer cannot request deploying the robot');
    var list = id === undefined || id === null ? sim.robots : [rbRobot(sim, id)].filter(Boolean);
    if (!list.length) return NO_ROBOT;
    var n = 0; list.forEach(function (r) { if (robotRequest(sim, r, role)) n++; });
    return { ok: true, requested: n, needsApproval: true, note: T('بانتظار اعتماد قائد الحادث', 'Waiting for the incident commander\'s approval') };
  }
  function apiApproveRobot(sim, id, role) {
    if (!sim.rb.enabled) return NO_ROBOT;
    role = roleOf(sim, role);
    if (role !== 'commander') return noRole(sim, 'role', ROLE_REJECT.ar, ROLE_REJECT.en);
    var list = id === undefined || id === null ? sim.robots : [rbRobot(sim, id)].filter(Boolean);
    if (!list.length) return NO_ROBOT;
    var done = [];
    list.forEach(function (r) { if ((r.approval.status === 'requested' || r.approval.status === 'none') && r.state === 'stowed') { if (r.approval.status === 'none') robotRequest(sim, r, role); robotApproveNow(sim, r, 'commander'); done.push(r.id); } });
    return done.length ? { ok: true, approved: done } : { ok: false, code: 'state', reason: T('لا يوجد روبوت ينتظر الاعتماد', 'No robot is waiting for approval') };
  }
  function apiRejectRobot(sim, id, role) {
    if (!sim.rb.enabled) return NO_ROBOT;
    role = roleOf(sim, role);
    if (role !== 'commander') return noRole(sim, 'role', ROLE_REJECT.ar, ROLE_REJECT.en);
    var r = rbRobot(sim, id); if (!r) return NO_ROBOT;
    if (r.approval.status !== 'requested') return { ok: false, code: 'state', reason: T('لا يوجد طلب معلّق', 'There is no pending request') };
    r.approval.status = 'rejected'; evt(sim, 'robot-approval-rejected', { robot: r.id, code: 'declined' }, 'رفض قائد الحادث نشر الروبوت ' + r.id, 'The incident commander declined deploying robot ' + r.id);
    return { ok: true };
  }
  function apiRecallRobot(sim, id) {
    if (!sim.rb.enabled) return NO_ROBOT;
    var list = id === undefined || id === null ? sim.robots : [rbRobot(sim, id)].filter(Boolean);
    if (!list.length) return NO_ROBOT;
    var n = 0;
    list.forEach(function (r) {
      if (r.state === 'stowed' || r.state === 'fault' || r.state === 'returning') return;
      evt(sim, 'robot-recall', { robot: r.id }, 'استدعى المشغّل الروبوت ' + r.id + ' إلى المدخل', 'The operator recalled robot ' + r.id + ' to the entrance');
      if (r.state === 'approved' || r.state === 'deploying') { r.approval = { status: 'none', requestedAt: null, approvedAt: null, by: null }; r.stats.returnedAt = sim.t; setRobotState(sim, r, 'stowed', 'أُلغي النشر', 'Deployment cancelled'); }
      else { r.recall = true; }
      n++;
    });
    return n ? { ok: true, recalled: n } : { ok: false, code: 'state', reason: T('لا شيء لاستدعائه', 'Nothing to recall') };
  }
  function normRoom(g, id) { var s = String(id); if (g.byRoom[s]) return g.byRoom[s].room; if (/^R\d+$/.test(s) && g.byRoom[s.slice(1)]) return g.byRoom[s.slice(1)].room; return null; }
  function apiSetSearchPriority(sim, roomIds) {
    var g = sim.rb.enabled ? sim.rb.g : robotGraph(robotStruct(sim)), acc = [], bad = [];
    (roomIds || []).forEach(function (x) { var r = normRoom(g, x); if (r) { if (acc.indexOf(r) < 0) acc.push(r); } else bad.push(String(x)); });
    sim.rb.priority = acc;
    sim.robots.forEach(function (r) { if (r.state === 'searching' && r.to < 0 && !r.dwell) { if (r.target && r.target.room) delete sim.rb.claims[r.target.room]; r.target = null; r.path = []; } });
    evt(sim, 'robot-priority', { rooms: acc }, 'غيّر المشغّل أولوية البحث: ' + (acc.length ? acc.join('، ') : 'الترتيب التلقائي'), 'The operator changed the search priority: ' + (acc.length ? acc.join(', ') : 'automatic order'));
    return { ok: true, accepted: acc, ignored: bad };
  }
  function apiTeleop(sim, id, target) {
    if (!sim.rb.enabled) return NO_ROBOT;
    var r = rbRobot(sim, id); if (!r) return NO_ROBOT;
    if (r.state !== 'searching') return { ok: false, code: 'state', reason: T('التحكم عن بُعد متاح أثناء البحث فقط', 'Tele-operation is available while the robot is searching') };
    if (!r.link.up) return { ok: false, code: 'link', reason: T('الاتصال مقطوع — لا يمكن إرسال أمر', 'The link is down — a command cannot be sent') };
    var g = r.G, l = -1;
    if (typeof target === 'string') { l = g.byId[target] !== undefined ? g.byId[target] : (g.byRoom[normRoom(g, target)] ? g.byRoom[normRoom(g, target)].l : -1); }
    else if (target && isNum(target.x) && isNum(target.y)) { var best = Infinity, fl = isNum(target.fl) ? target.fl : r.S.nodes[r.node].fl; for (var i = 0; i < g.n; i++) { var nd = r.S.nodes[i]; if (nd.fl !== fl) continue; var dd = dist2(nd.x, nd.y, target.x, target.y); if (dd < best) { best = dd; l = i; } } }
    if (l < 0) return { ok: false, code: 'target', reason: T('وجهة غير معروفة', 'Unknown waypoint') };
    var p = rbAStar(sim, r, r.node, l);
    if (!p.ok && r.node !== l) return { ok: false, code: 'unreachable', reason: T('الوجهة غير قابلة للوصول (درج للروبوت ذي العجلات، أو حرارة/نار، أو عائق)', 'The waypoint cannot be reached (stairs for a wheeled robot, heat or fire, or an obstacle)') };
    if (r.target && r.target.room) delete sim.rb.claims[r.target.room];
    r.teleop = { l: l, id: g.S.nodes[l].id }; r.target = null; r.path = []; r.dwell = null;
    evt(sim, 'robot-teleop', { robot: r.id, node: g.S.nodes[l].id }, 'أمر المشغّل الروبوت ' + r.id + ' بالذهاب إلى «' + rbNodeText(g, l).ar + '»', 'The operator sent robot ' + r.id + ' to "' + rbNodeText(g, l).en + '"');
    return { ok: true, node: g.S.nodes[l].id, etaSec: Math.round(p.cost) };
  }
  function apiSpeakVia(sim, id, key, lang) {
    if (!sim.rb.enabled) return NO_ROBOT;
    var r = rbRobot(sim, id); if (!r) return NO_ROBOT;
    if (ROBOT_SAY_KEYS.indexOf(key) < 0) return { ok: false, code: 'key', reason: T('عبارة غير معروفة', 'Unknown message key'), keys: ROBOT_SAY_KEYS.slice() };
    if (r.state === 'stowed' || r.state === 'approved' || r.state === 'deploying' || r.state === 'fault') return { ok: false, code: 'state', reason: T('الروبوت ليس في الميدان', 'The robot is not in the field') };
    if (!r.link.up) return { ok: false, code: 'link', reason: T('الاتصال مقطوع', 'The link is down') };
    var near = null, bd = Infinity;
    for (var i = 0; i < sim.people.length; i++) { var a = sim.people[i]; if (a.away || a.g < 0 || !inStruct(sim, r, a)) continue; var l = a.g - r.S.base, d = dist2(r.S.nodes[l].x, r.S.nodes[l].y, r.S.nodes[r.node].x, r.S.nodes[r.node].y) * CELL; if (d < bd && d <= sim.P.robotRangeM) { bd = d; near = a; } }
    var persona = near ? personaOf(near) : 'adult';
    var line = rbSpeak(sim, r, near, key, { lang: lang || (near ? near.lang : 'ar'), persona: persona, operator: true, log: true });
    return { ok: true, speech: line, to: near ? near.key : null };
  }
  function apiSetObstacle(sim, id, o) {
    var g = sim.rb.enabled ? sim.rb.g : robotGraph(robotStruct(sim)), key = String(id);
    if (g.byId[key] === undefined && /^R\d+$/.test(key) === false) return { ok: false, code: 'target', reason: T('عقدة غير معروفة', 'Unknown node') };
    if (g.byId[key] === undefined) return { ok: false, code: 'target', reason: T('عقدة غير معروفة', 'Unknown node') };
    var locked = !o || o.locked === undefined ? true : !!o.locked;
    if (locked) sim.rb.obst[key] = { locked: true, kind: (o && o.kind) || 'door', since: sim.t };
    else { delete sim.rb.obst[key]; sim.robots.forEach(function (r) { var l = r.G.byId[key]; if (l !== undefined) { r.known[l] = 0; var nd = r.S.nodes[l]; if (nd.room && r.rooms[nd.room] && r.rooms[nd.room].status === 'locked') r.rooms[nd.room].status = 'open'; } }); }
    evt(sim, 'robot-obstacle', { node: key, locked: locked }, (locked ? 'أُقفل/سُدّ «' : 'فُتح «') + key + (locked ? '» أمام الروبوت' : '» أمام الروبوت'), (locked ? 'Locked / blocked "' : 'Opened "') + key + '" for the robot');
    return { ok: true, node: key, locked: locked };
  }

  // ---------------------------------------------------------------- telemetry for UIs
  function coverageOf(sim, r) {
    var g = r.G, rooms = {}, nodes = [], searched = 0, i;
    g.rooms.forEach(function (rm) { var rec = r.rooms[rm.room]; rooms[rm.room] = rec.status === 'open' && rec.passes > 0 ? 'searched' : rec.status; if (rec.passes > 0) searched++; });
    for (i = 0; i < g.n; i++) nodes.push({ id: g.S.nodes[i].id, cov: Math.round(r.cov[i] * 100) / 100 });
    return { pct: g.rooms.length ? Math.round(100 * searched / g.rooms.length) : 0, roomsSearched: searched, roomsTotal: g.rooms.length, nodes: nodes, rooms: rooms };
  }
  function viewOf(sim, r) {   // the robot-eye view: what the cameras can see right now (smoke attenuation, people in view)
    var g = r.G, S = r.S, F = rbFieldFill(sim, g, sim.rb.Fv), l = r.node, nd = S.nodes[l], P = sim.P, vis = visibleNodes(sim, r, F, new Float32Array(g.n)), people = [];
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (a.away || a.g < 0 || !inStruct(sim, r, a)) continue;
      var pl = a.g - S.base, d = vis[pl]; if (!(d < Infinity)) continue;
      var found = a.robotFoundAt !== undefined && a.robotFoundAt !== null, pn = S.nodes[pl];
      var pd = detectP(sim, r, a, d + 0.4, F, pl);
      people.push({ ref: found ? a.key : 'blob-' + a.id, key: found ? a.key : null, name: found && a.name ? a.name : null, x: Math.round((pn.x + a.ox) * 100) / 100, y: Math.round((pn.y + a.oy) * 100) / 100, distM: Math.round(d * 10) / 10, strength: Math.round(thermalVisibility(sim, Math.max(F.smoke[l], F.smoke[pl]), d) * pd.contrast * 100) / 100, detected: found, condition: found ? conditionOf(sim, a) : null });
    }
    var sm = F.smoke[l];
    return { node: nd.id, label: rbNodeText(g, l), room: nd.room || null, fl: nd.fl, visibility: Math.round(rgbVisibility(sim, sm, 6) * 100) / 100, thermalVisibility: Math.round(thermalVisibility(sim, sm, 6) * 100) / 100, rangeM: P.robotRangeM, smoke: Math.round(sm * 100) / 100,
      tempC: Math.round(F.temp[l]), gasPpm: sim.hazard === 'gas' ? Math.round(F.gas[l]) : null, lighting: sm > 0.5 ? 'dark' : 'lit', heading: Math.round(r.heading), people: people };
  }
  function robotTelemetry(sim, r, full) {
    var pose = rbPose(sim, r), tg = r.target ? { kind: r.target.kind, node: r.S.nodes[r.target.node].id, room: r.target.room || null, label: rbNodeText(r.G, r.target.node) } : null;
    var o = { id: r.id, name: T('روبوت الإنقاذ ' + r.id, 'Rescue robot ' + r.id), variant: r.variant, state: r.state, stateLabel: ROBOT_STATE_TXT[r.state], since: r.since,
      approval: { status: r.approval.status, requestedAt: r.approval.requestedAt, approvedAt: r.approval.approvedAt, by: r.approval.by },
      pose: { x: Math.round(pose.x * 100) / 100, y: Math.round(pose.y * 100) / 100, fl: pose.fl, node: r.S.nodes[r.node].id, label: rbNodeText(r.G, r.node) }, heading: Math.round(r.heading),
      battery: Math.round(r.battery * 1000) / 1000, link: { q: Math.round(r.link.q * 100) / 100, up: r.link.up, dropouts: r.link.dropouts, downSec: r.link.downSec, buffered: r.outbox.length },
      target: tg, finds: r.finds.slice(), blocked: r.blocked.slice(), beacons: r.beacons.map(function (b) { return { node: b.node, x: b.x, y: b.y, fl: b.fl, t: b.t }; }), beaconsLeft: r.beaconsLeft, hoodsLeft: r.hoodsLeft,
      hold: r.hold ? { person: r.hold.key, since: r.hold.since } : null, tempC: Math.round(r.F.temp[r.node]), heat: Math.round(r.heat),
      stats: { falsePositives: r.stats.falsePositives, enteredBlocked: r.enteredBad, retreats: r.flee, distanceM: Math.round(r.driven), stairsM: Math.round(r.stats.stairsM), spoke: r.stats.spoke, returnedAt: r.stats.returnedAt, faultAt: r.stats.faultAt, faultWhy: r.stats.faultWhy, doorsOpened: r.stats.doorsOpened } };
    if (full !== false) { o.coverage = coverageOf(sim, r); o.view = r.state === 'stowed' || r.state === 'approved' || r.state === 'deploying' ? null : viewOf(sim, r); }
    return o;
  }
  function robotSnapshot(sim) {
    var rb = sim.rb; if (!rb.enabled) return null;
    return { enabled: true, label: T('الروبوت مفهوم بنموذج أولي محاكى — لم يُبنَ ولم يُجرَّب (SIM)', 'The robot is a concept with a simulated prototype — not built, not tested (SIM)'), role: rb.role, variant: rb.variant, units: sim.robots.length, autoApprove: rb.autoApprove,
      robots: sim.robots.map(function (r) { return robotTelemetry(sim, r, true); }), finds: rb.finds.map(findOut), blocked: rb.blocked.map(blockOut), speech: rb.speech.slice(-20).map(speechOut), priority: rb.priority.slice() };
  }
  function findOut(f) { return { id: f.id, robot: f.robot, t: f.t, reportedAt: f.reportedAt, node: f.node, place: f.place, room: f.room, registeredRoom: f.registeredRoom, floor: f.floor, key: f.key, name: f.name, registered: f.registered, persona: f.persona, needs: f.needs, lang: f.lang, by: f.by, conf: f.conf, condition: f.condition, dose: f.dose, smoke: f.smoke, tempC: f.tempC, refuge: f.refuge, action: f.action, route: f.route, routeM: f.routeM, followed: f.followed, beacons: f.beacons, woke: f.woke === undefined ? null : f.woke }; }
  function blockOut(b) { return { id: b.id, robot: b.robot, t: b.t, reportedAt: b.reportedAt, kind: b.kind, node: b.node, room: b.room, floor: b.floor, text: b.text }; }
  function speechOut(s) { return { id: s.id, t: s.t, robot: s.robot, person: s.person, find: s.find, key: s.key, persona: s.persona, lang: s.lang, requestedLang: s.requestedLang, draft: s.draft, formats: s.formats, light: s.light, text: s.text, display: s.display, via: s.via, refuge: s.refuge, operator: s.operator }; }

  // ---------------------------------------------------------------- bus messages
  function busRobot(sim) {
    var snap = robotSnapshot(sim); if (!snap) return null;
    return { type: 'robot', scope: 'building', sim: true, label: snap.label, role: snap.role, t: sim.t,
      robots: snap.robots.map(function (r) { return { id: r.id, name: r.name, variant: r.variant, state: r.state, stateLabel: r.stateLabel, approval: r.approval.status, pose: r.pose, heading: r.heading, battery: r.battery, link: r.link, target: r.target, coveragePct: r.coverage.pct, finds: r.finds.length, blocked: r.blocked.length, holding: r.hold ? r.hold.person : null }; }) };
  }
  function busRobotFind(sim, findId) {
    var f = sim.rb.finds.filter(function (x) { return x.id === findId; })[0]; if (!f) return null;
    var c = COND[f.condition.key];
    return { type: 'robot-find', sim: true, id: f.id, robot: f.robot, foundAt: f.t, reportedAt: f.reportedAt, room: f.room, place: f.place, floor: f.floor,
      person: { key: f.key, name: f.name, persona: f.persona, needs: f.needs, lang: f.lang, registered: f.registered }, condition: { key: f.condition.key, est: true, text: c }, confidence: f.conf, by: f.by, refuge: f.refuge, action: f.action, route: f.route, routeM: f.routeM,
      text: findText(sim, { id: f.robot }, f), note: T('تقدير بقواعد بسيطة، وليس تشخيصاً', 'A rule-based estimate, not a diagnosis') };
  }

  // ---------------------------------------------------------------- metrics (labelled SIM; the same definitions for the world with and without the robot)
  var ROBOT_LABEL = T('الروبوت مفهوم بنموذج أولي محاكى — لم يُبنَ ولم يُجرَّب', 'The robot is a concept with a simulated prototype — not built, not tested');
  function knownAtOf(a) {
    var best = null, c = [a.checkinAt, a.droneLocatedAt, a.robotReportedAt, a.safeKind === 'rescued' ? a.safeAt : null];
    for (var i = 0; i < c.length; i++) if (c[i] !== null && c[i] !== undefined && (best === null || c[i] < best)) best = c[i];
    return best;
  }
  function robotMetrics(sim) {
    var P = sim.P, tI = sim.tIgnite, rb = sim.rb, scope = {}; sim.pre.scope.forEach(function (gg) { scope[gg] = true; });
    var M = { label: SIM_LABEL, robotLabel: ROBOT_LABEL, robot: !!rb.enabled, preset: sim.preset, seed: sim.seed, tEnd: sim.t, variant: rb.enabled ? rb.variant : null, units: sim.robots.length };
    var tRef = sim.ver.confirmedAt !== null ? sim.ver.confirmedAt + P.robotApproveSec : null;
    var U = sim.people.filter(function (a) { return a.registered && scope[a.group] && !a.away && tRef !== null && (a.checkinAt === null || a.checkinAt > tRef); });
    var tCrew = null;
    [sim.fx.engineOnScene, sim.fx.rescueOnScene].forEach(function (x) { if (x !== null && (tCrew === null || x < tCrew)) tCrew = x; });
    M.referenceT = tRef === null ? null : round1(tRef - tI); M.crewsOnSceneSec = tCrew === null ? null : round1(tCrew - tI);
    var times = U.map(function (a) { var k = knownAtOf(a); return k !== null ? k - tI : sim.t - tI; });
    var st = stats(times), located = U.filter(function (a) { return knownAtOf(a) !== null; });
    M.unaccounted = { n: U.length, located: located.length, locatedPct: U.length ? Math.round(100 * located.length / U.length) : null, firstByRobot: U.filter(function (a) { return a.robotReportedAt !== undefined && a.robotReportedAt !== null && a.robotReportedAt === knownAtOf(a); }).length,
      timeToLocate: { n: st.n, p50: st.p50, p90: st.p90, max: st.max, mean: st.mean, censored: U.length - located.length },
      perPerson: U.map(function (a) { var k = knownAtOf(a); return { key: a.key, room: a.room || a.cls || null, sec: k !== null ? round1(k - tI) : null, secOrEnd: k !== null ? round1(k - tI) : round1(sim.t - tI), byRobot: a.robotReportedAt !== undefined && a.robotReportedAt !== null && a.robotReportedAt === k }; }) };
    var N = U.filter(function (a) { return needsOf(a).length > 0; }), nb = N.filter(function (a) { var k = knownAtOf(a); return k !== null && tCrew !== null && k <= tCrew; });
    M.needsHelp = { n: N.length, locatedBeforeCrews: nb.length, pctBeforeCrews: N.length && tCrew !== null ? Math.round(100 * nb.length / N.length) : null, locatedByEnd: N.filter(function (a) { return knownAtOf(a) !== null; }).length,
      list: N.map(function (a) { var k = knownAtOf(a); return { key: a.key, sec: k !== null ? round1(k - tI) : null }; }) };
    var resc = N.filter(function (a) { return a.safeKind === 'rescued'; }), early = resc.filter(function (a) { var s0 = a.safeAt; return (a.robotReportedAt !== undefined && a.robotReportedAt !== null && a.robotReportedAt < s0) || (a.droneLocatedAt && a.droneLocatedAt < s0) || (a.checkin === 'help' && a.checkinAt !== null && a.checkinAt < s0); });
    M.needsHelp.rescued = resc.length; M.needsHelp.locatedBeforeRescue = early.length; M.needsHelp.pctBeforeRescue = resc.length ? Math.round(100 * early.length / resc.length) : null;
    M.stillUnaccounted = {}; [120, 300, 450, 600].forEach(function (T0) { M.stillUnaccounted['t' + T0] = U.filter(function (a) { var k = knownAtOf(a); return k === null || k - tI > T0; }).length; });
    var expo = U.filter(function (a) { return a.exposedSec > 0; }), ok = expo.filter(function (a) { var k = knownAtOf(a); return k !== null && (a.injuredAt === undefined || a.injuredAt === null || k < a.injuredAt); });
    M.reachedBeforeThreshold = { exposed: expo.length, reachedFirst: ok.length, pct: expo.length ? Math.round(100 * ok.length / expo.length) : null, injuryDose: DOSE_INJURY,
      note: T('«العتبة» = جرعة الإصابة في النموذج (0.3)؛ ليست قياساً طبياً', '"Threshold" = the model\'s injury dose (0.3); not a medical measure') };
    var finds = rb.finds || [], fdose = finds.map(function (f) { return f.dose; });
    M.finds = { n: finds.length, reported: finds.filter(function (f) { return f.reportedAt !== null; }).length, meanReportDelaySec: finds.filter(function (f) { return f.reportedAt !== null; }).length ? round1(finds.filter(function (f) { return f.reportedAt !== null; }).reduce(function (s, f) { return s + (f.reportedAt - f.t); }, 0) / finds.filter(function (f) { return f.reportedAt !== null; }).length) : null,
      belowInjuryDose: fdose.filter(function (d) { return d < DOSE_INJURY; }).length, meanDoseAtFind: fdose.length ? Math.round(1000 * fdose.reduce(function (s, d) { return s + d; }, 0) / fdose.length) / 1000 : null, woke: finds.filter(function (f) { return f.woke === true; }).length, held: finds.filter(function (f) { return f.action === 'hold'; }).length, unregistered: finds.filter(function (f) { return !f.registered; }).length };
    M.exposure = { exposedPeople: expo.length, injured: U.filter(function (a) { return a.injured; }).length, incapacitated: U.filter(function (a) { return a.st === 'incapacitated' || (a.downAt !== null && a.dose >= 1); }).length, personSec: U.reduce(function (s, a) { return s + a.exposedSec; }, 0) };
    var inView = sim.people.filter(function (a) { return a.registered && scope[a.group] && !a.away && (a.robotViewSec || 0) >= P.robotRoomSweepSec * 0.5 && (a.robotFoundAt === undefined || a.robotFoundAt === null); });
    M.detection = { falsePositives: sim.robots.reduce(function (s, r) { return s + r.stats.falsePositives; }, 0), missedInView: inView.length, note: T('«فاتته»: كان الشخص في مجال الرؤية ولم يُكشف (سالب كاذب)', '"Missed" = the person was in view for a while and never detected (a false negative)') };
    M.robots = sim.robots.map(function (r) { var cv = coverageOf(sim, r); return { id: r.id, variant: r.variant, state: r.state, battery: Math.round(r.battery * 100), coveragePct: cv.pct, roomsSearched: cv.roomsSearched, roomsTotal: cv.roomsTotal, distanceM: Math.round(r.driven), stairsM: Math.round(r.stats.stairsM), finds: r.finds.length, blocked: r.blocked.length, dropouts: r.link.dropouts, linkDownSec: r.link.downSec, returnedAt: r.stats.returnedAt, fault: r.stats.faultWhy, enteredBlocked: r.enteredBad, deployedAt: r.stats.started === null ? null : round1(r.stats.started - tI), approvedAt: r.approval.approvedAt === null ? null : round1(r.approval.approvedAt - tI) }; });
    M.coveragePct = M.robots.length ? Math.round(M.robots.reduce(function (s, r) { return s + r.coveragePct; }, 0) / M.robots.length) : 0;
    M.assumptions = { thermalPd: P.robotThermalPd, contrastC: P.robotContrastC, roomC: P.robotRoomC, rangeM: P.robotRangeM, dropoutPct: P.robotDropoutPct, battMin: P.robotBattMin, carrier: P.robotCarrier, approveSec: P.robotApproveSec, crewSpeedup: P.robotCrewSpeedup, followP: P.robotFollowP, wakeP: P.robotWakeP };
    return M;
  }
  function robotDelta(w, r) {   // positive = the robot world is better (lower times / counts, higher percentages)
    var d = function (a, b) { return a === null || a === undefined || b === null || b === undefined ? null : round1(a - b); };
    return { note: T('القيم الموجبة = الروبوت أفضل', 'Positive = better with the robot'),
      locatedPct: d(r.unaccounted.locatedPct, w.unaccounted.locatedPct), timeToLocateP50Sec: d(w.unaccounted.timeToLocate.p50, r.unaccounted.timeToLocate.p50), timeToLocateP90Sec: d(w.unaccounted.timeToLocate.p90, r.unaccounted.timeToLocate.p90),
      needsPctBeforeCrews: d(r.needsHelp.pctBeforeCrews, w.needsHelp.pctBeforeCrews), needsPctBeforeRescue: d(r.needsHelp.pctBeforeRescue, w.needsHelp.pctBeforeRescue), stillUnaccountedAt300: d(w.stillUnaccounted.t300, r.stillUnaccounted.t300), reachedBeforeThresholdPct: d(r.reachedBeforeThreshold.pct, w.reachedBeforeThreshold.pct),
      injured: d(w.exposure.injured, r.exposure.injured), incapacitated: d(w.exposure.incapacitated, r.exposure.incapacitated), exposurePersonSec: d(w.exposure.personSec, r.exposure.personSec) };
  }
  function timeSaved(mw, mr) {   // for the residents the robot located FIRST: how much earlier than in the world without the robot (the same person, the same seed)
    var base = {}, rows = [];
    mw.unaccounted.perPerson.forEach(function (p) { base[p.key] = p.secOrEnd; });
    mr.unaccounted.perPerson.forEach(function (p) { if (p.byRobot && base[p.key] !== undefined) rows.push({ key: p.key, room: p.room, without: base[p.key], withRobot: p.sec, savedSec: round1(base[p.key] - p.sec) }); });
    var sv = rows.map(function (x) { return x.savedSec; }), cens = {};
    mw.unaccounted.perPerson.forEach(function (p) { if (p.sec === null) cens[p.key] = true; });
    var nc = rows.filter(function (x) { return cens[x.key]; }).length;
    return { n: rows.length, censoredWithout: nc, meanSec: sv.length ? round1(sv.reduce(function (s, x) { return s + x; }, 0) / sv.length) : null, maxSec: sv.length ? Math.max.apply(null, sv) : null, people: rows,
      note: T('الزمن الذي وُفِّر لمن عثر عليه الروبوت أولاً مقارنةً بالعالم بلا روبوت (الشخص نفسه والبذرة نفسها). من لم يُعثر عليه أبداً بلا روبوت يُحسب زمنه حتى نهاية التشغيل، فالرقم حدّ أدنى له', 'Time saved for the people the robot located first, compared with the world without it (the same person, the same seed). Someone never located without the robot is counted to the end of the run, so the figure is a lower bound for them') };
  }
  function abRobot(opts) {
    opts = opts || {};
    var base = { preset: opts.preset || 'fire-night-robot', seed: opts.seed === undefined ? 1 : opts.seed, params: opts.params, hour: opts.hour, wind: opts.wind, autoApprove: true, mode: 'manara' };
    var w = create(Object.assign({}, base, { robot: false })), r = create(Object.assign({}, base, { robot: opts.robot === undefined ? true : opts.robot }));
    run(w, opts.seconds); run(r, opts.seconds);
    var mw = robotMetrics(w), mr = robotMetrics(r);
    var dl = robotDelta(mw, mr); dl.timeSaved = timeSaved(mw, mr);
    return { v: 1, label: SIM_LABEL, robotLabel: ROBOT_LABEL, preset: base.preset, seed: base.seed, params: cloneJSON(r.P), without: mw, withRobot: mr, delta: dl, hash: { without: hashSim(w), withRobot: hashSim(r) } };
  }
  function sweepRobot(opts) {   // sensitivity of the robot result to ONE assumption (param) or the variant / unit count, averaged over seeds; opts.baselineRuns lets a caller reuse the "without robot" runs
    opts = opts || {};
    var seeds = opts.seeds || [1, 2], preset = opts.preset || 'fire-night-robot', rows = [], mean = function (arr) { var v = arr.filter(function (x) { return x !== null && x !== undefined; }); return v.length ? round1(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : null; };
    var pick = function (m, saved) { var r0 = m.robots[0] || null; return { locatedPct: m.unaccounted.locatedPct, p50: m.unaccounted.timeToLocate.p50, needsPct: m.needsHelp.pctBeforeCrews, needsRescPct: m.needsHelp.pctBeforeRescue, still300: m.stillUnaccounted.t300, still450: m.stillUnaccounted.t450, reachedPct: m.reachedBeforeThreshold.pct, injured: m.exposure.injured, incapacitated: m.exposure.incapacitated, personSec: m.exposure.personSec,
      falsePos: m.detection.falsePositives, missed: m.detection.missedInView, battEnd: r0 ? r0.battery : null, coverage: m.coveragePct, finds: m.finds.n, dropouts: r0 ? r0.dropouts : null, linkDown: r0 ? r0.linkDownSec : null, byRobot: m.unaccounted.firstByRobot,
      delay: m.finds.meanReportDelaySec === null ? 0 : m.finds.meanReportDelaySec, saved: saved === undefined ? null : saved }; };
    var avg = function (list) { var o = {}; Object.keys(list[0]).forEach(function (k) { o[k] = mean(list.map(function (x) { return x[k]; })); }); return o; };
    var baseRuns = opts.baselineRuns || {};
    seeds.forEach(function (sd) { if (!baseRuns[sd]) { var s0 = create({ preset: preset, seed: sd, params: opts.params, robot: false, autoApprove: true }); run(s0, opts.seconds); baseRuns[sd] = robotMetrics(s0); } });
    var baseline = avg(seeds.map(function (sd) { return pick(baseRuns[sd]); }));
    (opts.values || []).forEach(function (val) {
      var list = [];
      seeds.forEach(function (sd) {
        var params = Object.assign({}, opts.params || {}), cfg = Object.assign({}, opts.robot || {});
        if (opts.param === 'variant' || opts.param === 'units') cfg[opts.param] = val; else params[opts.param] = val;
        var s1 = create({ preset: preset, seed: sd, params: params, robot: Object.assign({ enabled: true }, cfg), autoApprove: true }); run(s1, opts.seconds);
        var m1 = robotMetrics(s1); list.push(pick(m1, timeSaved(baseRuns[sd], m1).meanSec));
      });
      var row = avg(list); row.value = val; rows.push(row);
    });
    return { v: 1, label: SIM_LABEL, robotLabel: ROBOT_LABEL, preset: preset, param: opts.param, seeds: seeds, baseline: baseline, baselineRuns: baseRuns, rows: rows };
  }
  function robotsList(sim) { return sim.robots.map(function (r) { return robotTelemetry(sim, r, true); }); }
  var ROBOT_API = {
    STATES: ROBOT_STATES, ROLES: ROBOT_ROLES, SAY_KEYS: ROBOT_SAY_KEYS, STATE_LABELS: ROBOT_STATE_TXT, CONDITIONS: COND,
    astar: function (sim, from, to, opt) { var r = rbRobot(sim); if (!r) return null; var f = r.G.byId[from], t = r.G.byId[to]; if (f === undefined || t === undefined) return null; rbFieldFill(sim, r.G, sim.rb.Fv); var p = rbAStar(sim, r, f, t, Object.assign({ F: sim.rb.Fv }, opt || {})); return { ok: p.ok, cost: p.cost, expanded: p.expanded, path: p.path.map(function (x) { return r.S.nodes[x].id; }) }; },
    graph: function (sidx) { var g = robotGraph(sidx || 0); return { nodes: g.S.nodes.map(function (n) { return { id: n.id, fl: n.fl, x: n.x, y: n.y, type: n.type }; }), edges: g.S.edges.map(function (e) { return { a: g.S.nodes[e.a].id, b: g.S.nodes[e.b].id, len: e.len, stairs: (e.flag & F_STAIRS) !== 0, door: e.door >= 0 }; }), rooms: g.rooms.map(function (r) { return r.room; }), entrance: g.S.nodes[g.entrance].id, heuristicFactor: g.hf }; },
    priority: function (sim, id) { var r = rbRobot(sim, id); if (!r) return null; var save = r.F; r.F = sim.rb.Fv; rbFieldFill(sim, r.G, r.F); var out = roomPriority(sim, r, true).map(function (x) { return { room: x.rm.room, score: Math.round(x.score * 10) / 10, unaccounted: x.un, needs: x.needs, floor: x.rm.fl + 1 }; }); r.F = save; return out; },
    say: function (sim, key, persona, personKey, extra) { return rbSay(sim, key, persona, personKey ? sim.byKey[personKey] : null, extra || {}); }
  };

  /* ====================================================================================
   * 11. ROADS, TIME-VARYING TRAFFIC, "FASTEST, NOT NEAREST" DISPATCH
   *     segment time = length / (free-flow speed x emergency factor x congestion(segment, clock))
   *     congestion = 1 - (1 - daily_profile(hour)) * class_sensitivity * load    (load = the "traffic" slider; 1 = the profile)
   *                  x hot-spot dips (e.g. the road past the school at drop-off / pick-up)  x operator jam  x incident slow-down
   *     Closed roads are removed. Everything here is SIMULATED (SIM); a real deployment would ask a live traffic/routing provider
   *     and the authority's CAD vehicle locations, and 999 would remain the dispatcher.
   * ==================================================================================== */
  function makeRoadGraph(spec) {
    var G = { nodes: [], segs: [], byId: {}, segById: {} };
    spec.nodes.forEach(function (n, k) { var c = { id: n.id, x: n.x, y: n.y, idx: k, edges: [], off: !!n.off }; G.nodes.push(c); G.byId[n.id] = c; });
    spec.segs.forEach(function (s, k) {
      var a = G.byId[s.a], b = G.byId[s.b];
      if (!a || !b) throw new Error('road graph: unknown node in segment ' + s.id);
      var c = { id: s.id, idx: k, a: s.a, b: s.b, ai: a.idx, bi: b.idx, cls: s.cls || 'minor', name: s.name || null, hot: s.hot || [], low: !!s.low, poi: !!s.poi, arterial: !!s.arterial };
      c.lenM = s.lenM || Math.max(10, Math.round(dist2(a.x, a.y, b.x, b.y) * CELL));
      if (s.v) c.v = s.v;
      c.mx = (a.x + b.x) / 2; c.my = (a.y + b.y) / 2;
      c.cells = [];
      var steps = Math.max(1, Math.round(dist2(a.x, a.y, b.x, b.y)));
      for (var q = 0; q <= steps; q++) {
        var px = Math.round(lerp(a.x, b.x, q / steps)), py = Math.round(lerp(a.y, b.y, q / steps));
        if (px >= 0 && py >= 0 && px < W && py < H) { var ci = py * W + px; if (c.cells[c.cells.length - 1] !== ci) c.cells.push(ci); }
      }
      a.edges.push(k); b.edges.push(k);
      G.segs.push(c); G.segById[c.id] = c;
    });
    return G;
  }
  function segSpeed(seg) { return seg.v || ROAD_CLASS[seg.cls].v; }
  function hotRamp(hour, h) {   // 0..1: ramps up 10 min before the window, fully on inside, ramps down 10 min after
    var r = 1 / 6;
    if (hour < h.from - r || hour > h.to + r) return 0;
    if (hour < h.from) return (hour - (h.from - r)) / r;
    if (hour > h.to) return 1 - (hour - h.to) / r;
    return 1;
  }
  // factors that slow a segment, all in (0,1]; `total` is their product (clamped). tSec = clock in seconds since midnight.
  function segFactors(seg, tSec, tr) {
    var hour = tSec / 3600, cls = ROAD_CLASS[seg.cls], load = tr && isNum(tr.load) ? tr.load : 1;
    var base = 1 - (1 - profileAt(hour)) * cls.sens * load;
    var hot = 1, hotLabel = null, i;
    for (i = 0; i < seg.hot.length; i++) {
      var r = hotRamp(hour, seg.hot[i]), f = 1 - seg.hot[i].depth * r * Math.min(1, load);
      if (f < hot) { hot = f; hotLabel = seg.hot[i].label; }
    }
    var jam = tr && tr.jams && tr.jams[seg.id] ? tr.jams[seg.id] : 1;
    var inc = 1;
    if (tr && tr.incident && tSec >= tr.incident.since && dist2(seg.mx, seg.my, tr.incident.x, tr.incident.y) * CELL <= tr.incident.radiusM) inc = tr.incident.factor;
    return { base: base, hot: hot, hotLabel: hotLabel, jam: jam, inc: inc, total: clamp(base * hot * jam * inc, 0.05, 1) };
  }
  function congestion(seg, tSec, tr) { return segFactors(seg, tSec, tr).total; }
  function segTime(seg, tSec, tr, emerg) { return seg.lenM / (segSpeed(seg) * emerg * congestion(seg, tSec, tr)); }
  function segFreeTime(seg, emerg) { return seg.lenM / (segSpeed(seg) * emerg); }

  // time-dependent Dijkstra (arrival time at a node decides the congestion of the next segment). tr.closed removes roads.
  function roadTravel(G, fromId, toId, tSec, tr, opt) {
    opt = opt || {};
    var emerg = opt.emerg || 1, n = G.nodes.length, t = new Array(n), prev = new Array(n), prevSeg = new Array(n), done = new Array(n), i;
    for (i = 0; i < n; i++) { t[i] = Infinity; prev[i] = -1; prevSeg[i] = -1; done[i] = false; }
    var s = G.byId[fromId], g = G.byId[toId];
    if (!s || !g) return null;
    t[s.idx] = 0;
    var closedHere = function (seg) {
      if (!tr || !tr.closed || !tr.closed[seg.id]) return false;
      if (opt.ignoreBy && tr.closedBy && opt.ignoreBy[tr.closedBy[seg.id]]) return false;
      return !(opt.allowClosedAtGoal && (seg.ai === g.idx || seg.bi === g.idx));
    };
    for (var it = 0; it < n; it++) {
      var u = -1, best = Infinity;
      for (i = 0; i < n; i++) if (!done[i] && t[i] < best) { best = t[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      if (u === g.idx && !opt.nearest) break;
      var nd = G.nodes[u];
      for (var q = 0; q < nd.edges.length; q++) {
        var seg = G.segs[nd.edges[q]];
        if (closedHere(seg)) continue;
        var v = seg.ai === u ? seg.bi : seg.ai, dt = segTime(seg, tSec + t[u], tr, emerg);
        if (t[u] + dt < t[v]) { t[v] = t[u] + dt; prev[v] = u; prevSeg[v] = seg.idx; }
      }
    }
    var goal = g.idx, staged = null;
    if (!isFinite(t[goal])) {
      if (!opt.nearest) return null;
      // the scene is cut off (cordon, flood, plume): drive to the reachable point nearest to it and stage there
      var bestD = Infinity;
      for (i = 0; i < n; i++) if (isFinite(t[i])) { var dd = dist2(G.nodes[i].x, G.nodes[i].y, g.x, g.y); if (dd < bestD - 1e-9 || (Math.abs(dd - bestD) < 1e-9 && t[i] < t[goal])) { bestD = dd; goal = i; } }
      if (!isFinite(t[goal])) return null;
      staged = G.nodes[goal].id;
    }
    var nodes = [], segs = [], c = goal;
    while (c !== -1) { nodes.push(c); if (prevSeg[c] >= 0) segs.push(prevSeg[c]); c = prev[c]; }
    nodes.reverse(); segs.reverse();
    var lenM = 0, free = 0, worst = null, clock = tSec;
    for (i = 0; i < segs.length; i++) {
      var sg = G.segs[segs[i]], tt = segTime(sg, clock, tr, emerg), ff = segFreeTime(sg, emerg);
      lenM += sg.lenM; free += ff;
      if (!worst || tt - ff > worst.delay) worst = { seg: sg, delay: tt - ff, at: clock };
      clock += tt;
    }
    return { timeSec: t[goal], lenM: lenM, freeSec: free, nodes: nodes, segs: segs, worst: worst, staged: staged };
  }
  // shortest road distance (ignores traffic), for the "nearest by distance" comparison
  function roadDistance(G, fromId, toId, tr) {
    var n = G.nodes.length, d = new Array(n), done = new Array(n), i;
    for (i = 0; i < n; i++) { d[i] = Infinity; done[i] = false; }
    var s = G.byId[fromId], g = G.byId[toId]; if (!s || !g) return null;
    d[s.idx] = 0;
    for (var it = 0; it < n; it++) {
      var u = -1, best = Infinity;
      for (i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
      if (u < 0 || u === g.idx) break;
      done[u] = true;
      var nd = G.nodes[u];
      for (var q = 0; q < nd.edges.length; q++) {
        var seg = G.segs[nd.edges[q]];
        if (tr && tr.closed && tr.closed[seg.id]) continue;
        var v = seg.ai === u ? seg.bi : seg.ai;
        if (d[u] + seg.lenM < d[v]) d[v] = d[u] + seg.lenM;
      }
    }
    return isFinite(d[g.idx]) ? d[g.idx] : null;
  }

  function slowReason(sim_or_null, worst, tSec, tr) {   // bilingual "why is this road slow" for the segment that costs most time
    if (!worst || worst.delay < 5) return null;
    var f = segFactors(worst.seg, worst.at, tr), nm = worst.seg.name || T(worst.seg.id, worst.seg.id);
    var min = Math.min(f.base, f.hot, f.jam, f.inc);
    if (min === f.jam && f.jam < 0.999) return T('الطريق «' + nm.ar + '» مزدحم (أعمال طريق أو حدّده المشغّل)', 'the road "' + nm.en + '" is jammed (road works / operator-set)');
    if (min === f.hot && f.hot < 0.999 && f.hotLabel) return T(f.hotLabel.ar + ' على «' + nm.ar + '»', f.hotLabel.en + ' on "' + nm.en + '"');
    if (min === f.inc && f.inc < 0.999) return T('تباطؤ قرب مكان الحادث على «' + nm.ar + '»', 'slow-down near the incident on "' + nm.en + '"');
    return T('ازدحام وقت الذروة على «' + nm.ar + '»', 'rush-hour traffic on "' + nm.en + '"');
  }
  var mmss1 = function (s) { var m = Math.floor(s / 60), r = Math.round(s - m * 60); if (r === 60) { m++; r = 0; } return m + ':' + (r < 10 ? '0' : '') + r; };
  function durT(s) { s = Math.round(s); return s < 90 ? T(s + ' ث', s + ' s') : T(mmss1(s) + ' دقيقة', mmss1(s) + ' min'); }

  // Pick the unit that reaches the scene FASTEST (ETA = turn-out + drive time), skipping busy / incapable / unreachable ones.
  // candidates: [{id, node, name?, available?, capable?, turnoutSec?}]  ->  { chosen, runnerUp, ranked, byDistance, skipped, why, whyData }
  function pickUnit(G, candidates, sceneId, tSec, tr, opt) {
    opt = opt || {};
    var ranked = [], skipped = [], emerg = opt.emerg || 1;
    candidates.forEach(function (c) {
      if (c.capable === false) { skipped.push({ id: c.id, reason: 'capability' }); return; }
      if (c.available === false) { skipped.push({ id: c.id, reason: 'busy' }); }
      var route = roadTravel(G, c.node, sceneId, tSec + (c.turnoutSec || 0), tr, { emerg: emerg, allowClosedAtGoal: opt.allowClosedAtGoal, nearest: opt.stage, ignoreBy: c.ignoreBy || opt.ignoreBy });
      if (!route || (route.staged && route.segs.length === 0)) { if (c.available !== false) skipped.push({ id: c.id, reason: 'unreachable' }); return; }
      var ent = { id: c.id, unit: c, etaSec: (c.turnoutSec || 0) + route.timeSec, driveSec: route.timeSec, distM: route.lenM, route: route, freeEtaSec: (c.turnoutSec || 0) + route.freeSec,
        roadDistM: roadDistance(G, c.node, sceneId, tr), available: c.available !== false };
      ranked.push(ent);
    });
    var avail = ranked.filter(function (r) { return r.available; });
    // units that can reach the scene itself always come before units that could only stage outside a closed area
    avail.sort(function (a, b) { return (a.route.staged ? 1 : 0) - (b.route.staged ? 1 : 0) || a.etaSec - b.etaSec || a.distM - b.distM; });
    var nearest = avail.slice().sort(function (a, b) { return (a.roadDistM === null ? 1e9 : a.roadDistM) - (b.roadDistM === null ? 1e9 : b.roadDistM); })[0] || null;
    var chosen = avail[0] || null, runner = avail[1] || null, why = null, whyData = null;
    var nameOf = function (e) { return e.unit.name || T(e.id, e.id); };
    if (chosen) {
      whyData = { chosen: { id: chosen.id, etaSec: Math.round(chosen.etaSec), distM: Math.round(chosen.distM) }, runnerUp: runner ? { id: runner.id, etaSec: Math.round(runner.etaSec), distM: Math.round(runner.distM) } : null,
        nearestByDistance: nearest ? { id: nearest.id, distM: Math.round(nearest.roadDistM), etaSec: Math.round(nearest.etaSec) } : null, farButFaster: false, gainSec: 0, extraDistM: 0, slow: null,
        skippedBusy: skipped.filter(function (s) { return s.reason === 'busy'; }).map(function (s) { return s.id; }), skippedCapability: skipped.filter(function (s) { return s.reason === 'capability'; }).map(function (s) { return s.id; }) };
      var busyNear = ranked.filter(function (r) { return !r.available; });
      if (nearest && nearest.id !== chosen.id) {
        var gain = nearest.etaSec - chosen.etaSec, extra = (chosen.roadDistM === null ? chosen.distM : chosen.roadDistM) - (nearest.roadDistM === null ? nearest.distM : nearest.roadDistM);
        whyData.farButFaster = extra > 20 && gain > 1; whyData.gainSec = Math.round(gain); whyData.extraDistM = Math.round(extra);
        var rs = slowReason(null, nearest.route.worst, tSec, tr); whyData.slow = rs;
        var xk = (Math.round(Math.abs(extra) / 100) / 10);
        why = T(nameOf(chosen).ar + (extra > 0 ? ' أبعد بمقدار ' + xk + ' كم لكنها أسرع بـ ' + durT(gain).ar : ' أسرع بـ ' + durT(gain).ar) + (rs ? ' لأن ' + rs.ar : ''),
          nameOf(chosen).en + (extra > 0 ? ' is ' + xk + ' km farther but ' + durT(gain).en + ' faster' : ' is ' + durT(gain).en + ' faster') + (rs ? ' because ' + rs.en : ''));
      } else {
        why = runner ? T('الأقرب والأسرع: وصول بعد ' + mmss1(chosen.etaSec) + ' (التالية: ' + nameOf(runner).ar + ' بعد ' + mmss1(runner.etaSec) + ')', 'Nearest and fastest: ETA ' + mmss1(chosen.etaSec) + ' (next: ' + nameOf(runner).en + ' ' + mmss1(runner.etaSec) + ')')
          : T('الوحدة الوحيدة المتاحة: وصول بعد ' + mmss1(chosen.etaSec), 'The only available unit: ETA ' + mmss1(chosen.etaSec));
      }
      var cut = skipped.filter(function (x) { return x.reason === 'unreachable'; }).map(function (x) { var cc = candidates.filter(function (q) { return q.id === x.id; })[0]; return cc && cc.name ? cc.name : T(x.id, x.id); });
      if (cut.length) { why = T(why.ar + ' — ' + cut.map(function (n) { return n.ar; }).join('، ') + ' معزولة بطريق مغلق', why.en + ' — ' + cut.map(function (n) { return n.en; }).join(', ') + ' cut off by a closed road'); whyData.cutOff = skipped.filter(function (x) { return x.reason === 'unreachable'; }).map(function (x) { return x.id; }); }
      if (chosen.route.staged) { why = T(why.ar + ' — تتمركز عند «' + chosen.route.staged + '» خارج المنطقة المغلقة', why.en + ' — stages at "' + chosen.route.staged + '" outside the closed area'); whyData.staged = chosen.route.staged; }
      if (busyNear.length) {
        var bn = busyNear[0];
        why = T(why.ar + ' — الوحدة ' + nameOf(bn).ar + ' مشغولة فتُتجاوز', why.en + ' — ' + nameOf(bn).en + ' is busy and skipped');
      }
    }
    return { chosen: chosen, runnerUp: runner, ranked: avail, all: ranked, byDistance: nearest, skipped: skipped, why: why, whyData: whyData };
  }

  // ---------------------------------------------------------------- the sim's traffic state
  function initTraffic(sim) {
    sim.traffic = { load: sim.P.trafficLoad, jams: {}, closed: {}, closedBy: {}, incident: null, emergencyFactor: sim.P.emergencyFactor };
    sim.fx = { engineOnScene: null, rescueOnScene: null, ambulanceOnScene: null, policeOnScene: null, hazmatOnScene: null };
    sim.busy = {};
    var w = sim.W;
    w.assets.forEach(function (a) {
      if (a.kind === 'hospital') return;
      if (sim.P.unitBusyPct > 0 && hr(sim.seed, D.UNIT, a.id.charCodeAt(0) * 31 + a.id.charCodeAt(1), 5) < sim.P.unitBusyPct / 100) sim.busy[a.id] = { all: true, why: 'random' };
    });
    sim.hosp = {};
    w.assets.forEach(function (a) { if (a.kind === 'hospital') sim.hosp[a.id] = { beds: a.beds, taken: 0, override: null }; });
    sim.plan = null; sim.lastClosureCheck = -99; sim.closureSig = ''; sim.callAt = null;
  }
  function clockSec(sim) { return sim.hour0 * 3600 + sim.t; }
  function trafficState(sim) { sim.traffic.load = sim.P.trafficLoad; sim.traffic.emergencyFactor = sim.P.emergencyFactor; return sim.traffic; }
  function hospFree(sim, id) {
    var h = sim.hosp[id]; if (!h) return 0;
    var free = h.override !== null ? h.override : Math.round(h.beds * (1 - sim.P.hospitalOccPct / 100));
    return Math.max(0, free - h.taken);
  }

  // roads closed by the hazard itself (flood depth, smoke/fire, gas plume), plus operator closures; the cordon only stops civilians
  function updateClosures(sim) {
    var tr = sim.traffic, w = sim.W, P = sim.P, roads = w.roads, changed = false, scene = sceneNodeId(sim);
    var want = {};
    for (var key in tr.closedBy) if (tr.closedBy[key] === 'operator') want[key] = 'operator';
    roads.segs.forEach(function (seg) {
      if (want[seg.id]) return;
      var incident = seg.a === scene || seg.b === scene;
      if (sim.hazard === 'flood' && seg.low) { if (depthAtSeg(sim, seg) >= P.roadCloseCm / 100) want[seg.id] = 'flood'; }
      else if (sim.hazard === 'flood' && !seg.poi) { if (depthAtSeg(sim, seg) >= P.roadCloseCm / 100) want[seg.id] = 'flood'; }
      else if (sim.hazard === 'fire' && !incident && sim.hz.started) {
        var burn = false;
        for (var i = 0; i < seg.cells.length; i++) { var c = seg.cells[i]; if (sim.ofire[c] === 1 || sim.F.smoke[c] >= 0.6) { burn = true; break; } }
        if (burn) want[seg.id] = 'fire';
      } else if (sim.hazard === 'gas' && !incident && sim.hz.started) {
        for (var j = 0; j < seg.cells.length; j++) if (sim.F.gas[seg.cells[j]] >= P.gasDanger) { want[seg.id] = 'gas'; break; }
      }
    });
    roads.segs.forEach(function (seg) {
      var was = tr.closedBy[seg.id], now = want[seg.id];
      if (was !== now) {
        changed = true;
        if (now) { tr.closed[seg.id] = true; tr.closedBy[seg.id] = now; evt(sim, 'road-closed', { seg: seg.id, by: now }, 'أُغلق الطريق «' + (seg.name ? seg.name.ar : seg.id) + '» (' + CLOSE_AR[now] + ')', 'Road "' + (seg.name ? seg.name.en : seg.id) + '" closed (' + now + ')'); }
        else { delete tr.closed[seg.id]; delete tr.closedBy[seg.id]; evt(sim, 'road-open', { seg: seg.id }, 'أُعيد فتح الطريق «' + (seg.name ? seg.name.ar : seg.id) + '»', 'Road "' + (seg.name ? seg.name.en : seg.id) + '" reopened'); }
      }
    });
    if (changed) sim.dispatchDirty = true;
  }
  var CLOSE_AR = { flood: 'سيول', fire: 'حريق', gas: 'غاز', operator: 'المشغّل' };
  function sceneNodeId(sim) { return sim.pre.scene; }

  // ---------------------------------------------------------------- dispatch
  var REQUIRED = {
    fire: [['fire'], ['ambulance'], ['police'], ['rescue', 'optional']],
    gas: [['fire', 'hazmat'], ['ambulance'], ['police']],
    flood: [['rescue'], ['police'], ['ambulance']],
    dust: [['police'], ['ambulance']],
    heat: [['ambulance']],
    sos: [['ambulance']]
  };
  var KIND_NAME = { fire: T('إطفاء', 'Fire engine'), rescue: T('إنقاذ', 'Rescue'), ambulance: T('إسعاف', 'Ambulance'), police: T('شرطة', 'Police') };
  var UNIT_STATES = ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'];

  function turnoutOf(sim, kind) { var P = sim.P; return kind === 'fire' || kind === 'rescue' ? P.turnoutFireSec : kind === 'ambulance' ? P.turnoutAmbSec : P.turnoutPoliceSec; }
  function unitCandidates(sim, kind, flag, excludeIds) {
    var w = sim.W, list = [];
    w.assets.forEach(function (a) {
      var ok = kind === 'fire' ? a.kind === 'fire' : kind === 'rescue' ? (a.kind === 'fire' && a.rescue) : a.kind === kind;
      if (!ok) return;
      var b = sim.busy[a.id];
      var cap = !(flag === 'hazmat' && !a.hazmat);
      var avail = !(b && (b.all || b[kind])) && !(excludeIds && excludeIds.indexOf(a.id + ':' + kind) >= 0);
      list.push({ id: a.id, node: a.node, name: a.name, kind: kind, available: avail, capable: cap, turnoutSec: turnoutOf(sim, kind), asset: a, ignoreBy: flag === 'hazmat' ? { gas: true } : null });
    });
    return list;
  }
  function patientsEstimate(sim) {
    var n = 0, trauma = false, kids = 0;
    sim.people.forEach(function (a) { if (a.st === 'incapacitated' || a.st === 'down' || a.injured) { n++; if (a.st === 'incapacitated') trauma = true; if (a.persona === 'child') kids++; } });
    if (sim.hazard === 'sos') return { n: 1, need: 'ed' };
    if (sim.hazard === 'heat') return { n: Math.max(1, n), need: kids > 0 && kids === n ? 'paed' : 'ed' };
    var need = (sim.hazard === 'fire' || sim.hazard === 'gas') && trauma ? 'trauma' : kids > 0 && kids === n ? 'paed' : 'ed';   // capability flags: ed (24 h emergency), trauma (Level I), paed (paediatric emergency)
    return { n: Math.max(1, n), need: need };
  }
  function pickHospital(sim, patients, departSec) {
    var w = sim.W, G = w.roads, tr = trafficState(sim), scene = sceneNodeId(sim), out = [], skipped = [];
    w.assets.forEach(function (a) {
      if (a.kind !== 'hospital') return;
      var capable = patients.need === 'trauma' ? a.trauma : patients.need === 'paed' ? a.paed : a.ed, free = hospFree(sim, a.id);
      var route = roadTravel(G, scene, a.node, departSec, tr, { emerg: tr.emergencyFactor });
      if (!route) { skipped.push({ id: a.id, reason: 'unreachable' }); return; }
      if (!capable) { skipped.push({ id: a.id, reason: 'capability' }); return; }
      out.push({ asset: a, freeBeds: free, etaSec: route.timeSec, distM: route.lenM, fits: free >= patients.n });
    });
    var fits = out.filter(function (o) { return o.fits; }).sort(function (a, b) { return a.etaSec - b.etaSec; });
    var chosen = fits[0] || out.slice().sort(function (a, b) { return b.freeBeds - a.freeBeds || a.etaSec - b.etaSec; })[0] || null;
    var nearest = out.slice().sort(function (a, b) { return a.distM - b.distM; })[0] || null;
    var why = null;
    if (chosen) {
      var needAr = patients.need === 'trauma' ? 'مركز إصابات' : patients.need === 'paed' ? 'طوارئ أطفال' : 'قسم طوارئ', needEn = patients.need === 'trauma' ? 'a trauma centre' : patients.need === 'paed' ? 'a paediatric emergency department' : 'an emergency department';
      var partial = !chosen.fits;
      why = T('أقرب مستشفى يستقبل ' + patients.n + ' مصاباً ويملك ' + needAr + (nearest && nearest.asset.id !== chosen.asset.id ? ' (الأقرب مسافةً لا يستوفي الشرط)' : '') + (partial ? ' — السعة أقل من العدد (افتراض)' : ''),
        'Nearest hospital that can take ' + patients.n + ' patient(s) and has ' + needEn + (nearest && nearest.asset.id !== chosen.asset.id ? ' (the closest by distance cannot)' : '') + (partial ? ' — capacity is below the number (assumption)' : ''));
    }
    return { chosen: chosen, options: out, skipped: skipped, why: why, partial: chosen ? !chosen.fits : false, patients: patients };
  }

  function buildUnitRecord(sim, kind, pick, flag, optional) {
    var ch = pick.chosen, roads = sim.W.roads;
    if (!ch) return { kind: kind, assetId: null, name: KIND_NAME[kind], state: 'recommended', unreachable: true, etaSec: null, etaMin: null, why: T('لا توجد وحدة متاحة', 'No unit available'), whyData: pick.whyData, optional: !!optional,
      route: [], nodes: [], segs: [], prog: 0, states: { recommended: sim.t } };
    var u = { kind: kind, flag: flag || null, optional: !!optional, assetId: ch.id, name: ch.unit.name, state: 'recommended', states: { recommended: sim.t }, turnoutLeft: ch.unit.turnoutSec,
      etaSec: ch.etaSec, etaAtRec: ch.etaSec, distM: ch.distM, nodes: ch.route.nodes.slice(), segs: ch.route.segs.slice(), prog: 0, why: pick.why, whyData: pick.whyData,
      runnerUp: pick.runnerUp ? { assetId: pick.runnerUp.id, name: pick.runnerUp.unit.name, etaSec: Math.round(pick.runnerUp.etaSec), distM: Math.round(pick.runnerUp.distM) } : null,
      nearestByDistance: pick.byDistance ? { assetId: pick.byDistance.id, name: pick.byDistance.unit.name, distM: Math.round(pick.byDistance.roadDistM), etaSec: Math.round(pick.byDistance.etaSec) } : null,
      reroutes: 0, onSceneAt: null, enRouteAt: null, dispatchedAt: null, staged: ch.route.staged || null, ignoreBy: ch.unit.ignoreBy || null };
    return u;
  }

  function createDispatchPlan(sim, origin) {
    if (sim.plan) return sim.plan;
    var P = sim.P, tr = trafficState(sim), roads = sim.W.roads, scene = sceneNodeId(sim), t = clockSec(sim);
    var sceneNode = roads.byId[scene];
    var plan = { id: 'D1', hazard: sim.hazard, origin: origin, node: scene, at: { x: sceneNode.x, y: sceneNode.y }, createdAt: sim.t, state: 'recommended', t: { recommended: sim.t }, units: [], hospital: null,
      patients: patientsEstimate(sim), log: [], lastRecheck: sim.t, cooldown: {} };
    // the incident slows the roads around it from now on (crowds, hoses, diversions)
    tr.incident = { x: sceneNode.x, y: sceneNode.y, radiusM: 120, factor: 1 - P.incidentSlowPct / 100, since: t };
    (REQUIRED[sim.hazard] || []).forEach(function (rq) {
      var kind = rq[0], flag = rq[1] === 'hazmat' ? 'hazmat' : null, optional = rq[1] === 'optional';
      if (optional && !(sim.hazard === 'fire' && sim.W.structs[sim.hz.struct].id === 'RB')) return;   // rescue unit for a residential fire (people who cannot use stairs)
      var pick = pickUnit(roads, unitCandidates(sim, kind, flag), scene, t, tr, { emerg: tr.emergencyFactor, allowClosedAtGoal: true, stage: true });
      plan.units.push(buildUnitRecord(sim, kind, pick, flag, optional));
    });
    var amb = plan.units.filter(function (u) { return u.kind === 'ambulance' && u.assetId; })[0];
    plan.hospital = pickHospital(sim, plan.patients, t + (amb ? amb.etaSec : 0) + P.loadSec);
    sim.plan = plan;
    evt(sim, 'dispatch-recommended', { units: plan.units.map(function (u) { return u.kind + ':' + u.assetId; }), origin: origin },
      'توصية الإرسال: ' + plan.units.map(function (u) { return KIND_NAME[u.kind].ar + ' ← ' + (u.name ? u.name.ar : '—') + ' (' + (u.etaSec ? mmss1(u.etaSec) : '—') + ')'; }).join('، '),
      'Dispatch recommended: ' + plan.units.map(function (u) { return KIND_NAME[u.kind].en + ' ← ' + (u.name ? u.name.en : '—') + ' (' + (u.etaSec ? mmss1(u.etaSec) : '—') + ')'; }).join(', '));
    plan.units.forEach(function (u) { if (u.whyData && u.whyData.farButFaster) evt(sim, 'far-but-faster', { kind: u.kind, chosen: u.assetId, gainSec: u.whyData.gainSec, extraDistM: u.whyData.extraDistM }, u.why.ar, u.why.en); });
    return plan;
  }

  function approveDispatchPlan(sim) {
    var plan = sim.plan; if (!plan || plan.state !== 'recommended') return;
    plan.state = 'approved'; plan.t.approved = sim.t;
    plan.units.forEach(function (u) { if (u.assetId) { u.state = 'approved'; u.states.approved = sim.t; } });
    evt(sim, 'dispatch-approved', null, 'اعتُمدت حزمة الحادث المتحقَّق منها وأُرسلت إلى غرفة التحكم (999 تبقى المُرسِل)', 'The verified incident package was approved and sent to the control room (999 stays the dispatcher)');
    plan.acceptAt = sim.t + sim.P.acceptSec;
  }

  // The ordinary world: someone notices, calls 999; the control room decides (same fastest-unit rule, only the TIMING differs).
  function ordinaryCall(sim) {
    if (sim.plan || sim.mode !== 'ordinary') return;
    var P = sim.P, t0 = null;
    if (sim.hazard === 'sos' || sim.hazard === 'heat') {
      var c = sim.cases[0]; if (c) t0 = c.t0 + P.ordinaryNoticeSec;
    } else if (sim.hz.started) {
      t0 = sim.tIgnite + P.ordinaryCallSec;
      if (P.ordinaryAutoNotify && sim.local.on) t0 = Math.min(t0, sim.local.at + 30);
    }
    if (t0 === null || sim.t < t0) return;
    sim.callAt = sim.t;
    evt(sim, 'call-999', null, 'اتصل شخص بـ 999 (الإنذار العادي)', 'A person called 999 (ordinary alarm)');
    var plan = createDispatchPlan(sim, 'ordinary');
    plan.state = 'approved'; plan.t.approved = sim.t; plan.acceptAt = sim.t + P.callHandlingSec;
    plan.units.forEach(function (u) { if (u.assetId) { u.state = 'approved'; u.states.approved = sim.t; } });
  }

  function unitPos(sim, u) {
    var roads = sim.W.roads;
    if (!u.nodes || !u.nodes.length) return null;
    var n0 = roads.nodes[u.nodes[0]];
    if (u.segs.length && u.prog > 0) {
      var seg = roads.segs[u.segs[0]], n1 = roads.nodes[u.nodes[1]], f = clamp(u.prog / seg.lenM, 0, 1);
      return { x: lerp(n0.x, n1.x, f), y: lerp(n0.y, n1.y, f) };
    }
    return { x: n0.x, y: n0.y };
  }
  function remainingTime(sim, u) {
    var roads = sim.W.roads, tr = trafficState(sim), clock = clockSec(sim), tot = 0, em = tr.emergencyFactor;
    for (var i = 0; i < u.segs.length; i++) {
      var seg = roads.segs[u.segs[i]], tt = segTime(seg, clock + tot, tr, em);
      tot += i === 0 ? tt * (1 - clamp(u.prog / seg.lenM, 0, 1)) : tt;
    }
    return tot;
  }
  function polyline(sim, u) {
    var roads = sim.W.roads, pts = [], p = unitPos(sim, u);
    if (!p) return pts;
    pts.push([round1(p.x), round1(p.y)]);
    for (var i = (u.prog > 0 ? 1 : 1); i < u.nodes.length; i++) { var n = roads.nodes[u.nodes[i]]; pts.push([round1(n.x), round1(n.y)]); }
    return pts;
  }

  function driveUnit(sim, u) {
    var roads = sim.W.roads, tr = trafficState(sim), clock = clockSec(sim), em = tr.emergencyFactor, dt = 1;
    while (dt > 1e-6 && u.segs.length) {
      var seg = roads.segs[u.segs[0]], v = segSpeed(seg) * em * congestion(seg, clock, tr), rem = seg.lenM - u.prog, step = v * dt;
      if (step >= rem) { dt -= rem / v; u.nodes.shift(); u.segs.shift(); u.prog = 0; }
      else { u.prog += step; dt = 0; }
    }
    return u.segs.length === 0;
  }

  function rerouteUnit(sim, u, reason) {
    var roads = sim.W.roads, tr = trafficState(sim), clock = clockSec(sim), scene = sceneNodeId(sim), em = tr.emergencyFactor;
    var headNode, forced = null, base = 0;
    if (u.segs.length && u.prog > 0) {      // mid-segment: must finish this segment first
      var seg = roads.segs[u.segs[0]];
      headNode = roads.nodes[u.nodes[1]].id; forced = { seg: u.segs[0], n0: u.nodes[0], n1: u.nodes[1] };
      base = segTime(seg, clock, tr, em) * (1 - u.prog / seg.lenM);
    } else headNode = roads.nodes[u.nodes[0]].id;
    var cur = remainingTime(sim, u);
    var route = roadTravel(roads, headNode, scene, clock + base, tr, { emerg: em, allowClosedAtGoal: true, nearest: true, ignoreBy: u.ignoreBy });
    if (!route) return { ok: false };
    var total = base + route.timeSec, gain = cur - total;
    var blockedAhead = u.segs.some(function (si) { var sid = roads.segs[si].id; return tr.closed[sid] && !(u.ignoreBy && u.ignoreBy[tr.closedBy[sid]]); });
    if (!blockedAhead && gain < sim.P.rerouteGainSec) return { ok: true, changed: false, gain: gain };
    if (forced) { u.nodes = [forced.n0, forced.n1].concat(route.nodes.slice(1)); u.segs = [forced.seg].concat(route.segs); }
    else { u.nodes = route.nodes.slice(); u.segs = route.segs.slice(); }
    u.reroutes++;
    evt(sim, 'reroute-unit', { kind: u.kind, asset: u.assetId, gainSec: Math.round(gain), reason: reason }, 'تغيّر مسار ' + u.name.ar + ' (' + (reason === 'closure' ? 'طريق مغلق' : 'ازدحام') + ') ويوفّر ' + Math.max(0, Math.round(gain)) + ' ث', u.name.en + ' re-routed (' + (reason === 'closure' ? 'road closed' : 'congestion') + ')' + ', saving ' + Math.max(0, Math.round(gain)) + ' s');
    return { ok: true, changed: true, gain: gain };
  }

  function replaceUnit(sim, plan, idx, newPick, why) {
    var old = plan.units[idx], flag = old.flag, nu = buildUnitRecord(sim, old.kind, newPick, flag, old.optional);
    nu.state = old.state === 'en-route' ? 'dispatched' : old.state;   // a swapped-in unit starts from its own station
    nu.states = { recommended: old.states.recommended }; if (plan.t.approved) nu.states.approved = sim.t;
    nu.dispatchedAt = sim.t;
    nu.turnoutLeft = newPick.chosen.unit.turnoutSec;
    nu.replaced = { assetId: old.assetId, name: old.name, reason: why, at: sim.t };
    plan.units[idx] = nu;
    return nu;
  }

  function stepDispatch(sim) {
    var plan = sim.plan, P = sim.P, t = sim.t, roads = sim.W.roads, tr = trafficState(sim);
    if (sim.mode === 'ordinary') ordinaryCall(sim);
    plan = sim.plan;
    if (sim.t % 2 === 0) updateClosures(sim);
    if (!plan) return;
    var clock = clockSec(sim), scene = plan.node;
    // (a) while only recommended: keep the recommendation live
    if (plan.state === 'recommended' && (t - plan.lastRecheck >= 5 || sim.dispatchDirty)) {
      plan.lastRecheck = t;
      var changedAny = false;
      plan.units.forEach(function (u, i) {
        var rq = REQUIRED[sim.hazard][i] || [], flag = u.flag;
        var pick = pickUnit(roads, unitCandidates(sim, u.kind, flag), scene, clock, tr, { emerg: tr.emergencyFactor, allowClosedAtGoal: true, stage: true });
        var nu = buildUnitRecord(sim, u.kind, pick, flag, u.optional);
        if (nu.assetId !== u.assetId) {
          evt(sim, 'recommendation-change', { kind: u.kind, from: u.assetId, to: nu.assetId }, 'تغيّرت التوصية: ' + KIND_NAME[u.kind].ar + ' ← ' + (nu.name ? nu.name.ar : '—') + ' (كانت ' + (u.name ? u.name.ar : '—') + ')', 'Recommendation changed: ' + KIND_NAME[u.kind].en + ' ← ' + (nu.name ? nu.name.en : '—') + ' (was ' + (u.name ? u.name.en : '—') + ')');
          if (nu.whyData && nu.whyData.farButFaster) evt(sim, 'far-but-faster', { kind: u.kind, chosen: nu.assetId, gainSec: nu.whyData.gainSec, extraDistM: nu.whyData.extraDistM }, nu.why.ar, nu.why.en);
        }
        nu.states = u.states; plan.units[i] = nu; changedAny = true;
      });
      var amb = plan.units.filter(function (u) { return u.kind === 'ambulance' && u.assetId; })[0];
      plan.patients = patientsEstimate(sim);
      plan.hospital = pickHospital(sim, plan.patients, clock + (amb ? amb.etaSec : 0) + P.loadSec);
      sim.dispatchDirty = false;
    }
    // (b) approved -> dispatched after the control room accepts
    if (plan.state === 'approved' && t >= plan.acceptAt) {
      plan.state = 'dispatched'; plan.t.dispatched = t;
      plan.units.forEach(function (u) { if (u.assetId) { u.state = 'dispatched'; u.states.dispatched = t; u.dispatchedAt = t; } });
      evt(sim, 'dispatched', null, 'قبلت غرفة التحكم الحزمة وأرسلت الوحدات', 'The control room accepted the package and dispatched the units');
    }
    // (c) units: turn-out, driving, arrival, effects
    var anyEn = false, allOn = true, active = false;
    plan.units.forEach(function (u, idx) {
      if (!u.assetId) return;
      if (u.state === 'dispatched') {
        u.turnoutLeft -= 1; u.etaSec = Math.max(0, u.turnoutLeft) + remainingTime(sim, u);
        if (u.turnoutLeft <= 0) { u.state = 'en-route'; u.states['en-route'] = t; u.enRouteAt = t; evt(sim, 'unit-en-route', { kind: u.kind, asset: u.assetId }, u.name.ar + ' انطلقت', u.name.en + ' is rolling'); }
      } else if (u.state === 'en-route') {
        var arrived = driveUnit(sim, u);
        u.etaSec = arrived ? 0 : remainingTime(sim, u);
        if (arrived) { u.state = 'on-scene'; u.states['on-scene'] = t; u.onSceneAt = t; u.etaSec = 0; evt(sim, 'unit-on-scene', { kind: u.kind, asset: u.assetId }, u.name.ar + ' وصلت إلى الموقع', u.name.en + ' arrived on scene'); onUnitArrived(sim, u); }
        else {
          var nextClosed = u.segs.some(function (si) { var sid = roads.segs[si].id; return tr.closed[sid] && !(u.ignoreBy && u.ignoreBy[tr.closedBy[sid]]); });
          if (nextClosed) rerouteUnit(sim, u, 'closure');
          else if (t % 5 === 0) rerouteUnit(sim, u, 'traffic');
        }
      } else if (u.state === 'on-scene') {
        if (t >= u.onSceneAt + P.onSceneSec && !plan.keepOn) { u.state = 'cleared'; u.states.cleared = t; evt(sim, 'unit-cleared', { kind: u.kind, asset: u.assetId }, u.name.ar + ' أنهت المهمة', u.name.en + ' cleared the scene'); }
      }
      if (u.state === 'dispatched' || u.state === 'en-route') { active = true; }
    });
    // (d) re-dispatch: a closed road, jam or busy unit can hand the job to a farther unit that is now faster
    if (plan.state !== 'recommended' && (t % 10 === 0 || sim.dispatchDirty)) {
      plan.units.forEach(function (u, idx) {
        if (!u.assetId || (u.state !== 'approved' && u.state !== 'dispatched' && u.state !== 'en-route')) return;
        if (plan.cooldown[u.kind] && t < plan.cooldown[u.kind]) return;
        var b = sim.busy[u.assetId], isBusy = !!(b && (b.all || b[u.kind]));
        var taken = plan.units.filter(function (x, j) { return j !== idx && x.assetId; }).map(function (x) { return x.assetId + ':' + x.kind; });
        var cand = unitCandidates(sim, u.kind, u.flag, taken);
        var pick = pickUnit(roads, cand, plan.node, clock, tr, { emerg: tr.emergencyFactor, allowClosedAtGoal: true, stage: true });
        var cur = u.state === 'en-route' ? remainingTime(sim, u) : Math.max(0, u.turnoutLeft) + remainingTime(sim, u);
        var blocked = u.segs.some(function (si) { var sid = roads.segs[si].id; return tr.closed[sid] && !(u.ignoreBy && u.ignoreBy[tr.closedBy[sid]]); }) && !(u.state === 'en-route' && rerouteUnitCheck(sim, u));
        if (!pick.chosen || pick.chosen.id === u.assetId) { if (isBusy && !pick.chosen) { /* nobody else */ } return; }
        var gain = cur - pick.chosen.etaSec, reason = isBusy ? 'busy' : blocked ? 'blocked' : 'traffic';
        if (isBusy || blocked || gain >= P.redispatchMarginSec) {
          var from = u.assetId, fromName = u.name, nu = replaceUnit(sim, plan, idx, pick, reason);
          plan.cooldown[u.kind] = t + 60;
          evt(sim, 'redispatch', { kind: u.kind, from: from, to: nu.assetId, reason: reason, gainSec: Math.round(isBusy || blocked ? 0 : gain) },
            'إعادة إرسال: ' + KIND_NAME[u.kind].ar + ' من «' + fromName.ar + '» إلى «' + nu.name.ar + '» (' + (reason === 'busy' ? 'الوحدة مشغولة' : reason === 'blocked' ? 'الطريق مغلق' : 'الأسرع الآن') + ')',
            'Re-dispatch: ' + KIND_NAME[u.kind].en + ' from "' + fromName.en + '" to "' + nu.name.en + '" (' + (reason === 'busy' ? 'unit became busy' : reason === 'blocked' ? 'road closed' : 'faster now') + ')');
          if (nu.whyData && nu.whyData.farButFaster) evt(sim, 'far-but-faster', { kind: u.kind, chosen: nu.assetId, gainSec: nu.whyData.gainSec, extraDistM: nu.whyData.extraDistM }, nu.why.ar, nu.why.en);
        }
      });
      sim.dispatchDirty = false;
    }
    // (e) plan summary state = the furthest-along unit; hospital leg
    var order = UNIT_STATES, best = plan.state === 'recommended' ? 0 : 1;
    plan.units.forEach(function (u) { if (u.assetId) best = Math.max(best, order.indexOf(u.state)); });
    var nowState = order[best];
    if (nowState !== plan.state && order.indexOf(nowState) > order.indexOf(plan.state)) { plan.state = nowState; plan.t[nowState] = plan.t[nowState] === undefined ? t : plan.t[nowState]; }
    var ambU = plan.units.filter(function (u) { return u.kind === 'ambulance' && u.assetId && u.onSceneAt !== null; })[0];
    if (ambU && plan.hospitalLeg === undefined && t >= ambU.onSceneAt + P.loadSec) {
      var pts = patientsEstimate(sim); plan.patients = pts;
      var hp = pickHospital(sim, pts, clock);
      plan.hospital = hp; plan.hospitalLeg = { startAt: t, etaSec: hp.chosen ? hp.chosen.etaSec : null, hospital: hp.chosen ? hp.chosen.asset.id : null };
      if (hp.chosen) { sim.hosp[hp.chosen.asset.id].taken += Math.min(pts.n, hospFree(sim, hp.chosen.asset.id)); evt(sim, 'transport', { hospital: hp.chosen.asset.id, etaSec: Math.round(hp.chosen.etaSec) }, 'الإسعاف تنقل المصابين إلى «' + hp.chosen.asset.name.ar + '» (' + mmss1(hp.chosen.etaSec) + ')', 'The ambulance takes the patients to "' + hp.chosen.asset.name.en + '" (' + mmss1(hp.chosen.etaSec) + ')'); }
    }
    if (plan.hospitalLeg && plan.hospitalLeg.etaSec !== null && !plan.hospitalLeg.arrivedAt && t >= plan.hospitalLeg.startAt + plan.hospitalLeg.etaSec) { plan.hospitalLeg.arrivedAt = t; evt(sim, 'hospital-arrival', { hospital: plan.hospitalLeg.hospital }, 'وصل المرضى إلى المستشفى', 'The patients arrived at the hospital'); }
  }
  function rerouteUnitCheck(sim, u) { var r = rerouteUnit(sim, u, 'closure'); return r && r.ok && r.changed; }

  // what an arriving unit does in the simulated world (every effect is a named assumption)
  function onUnitArrived(sim, u) {
    var t = sim.t, fx = sim.fx, P = sim.P;
    if (u.kind === 'fire') {
      if (sim.hazard === 'fire') { fx.engineOnScene = fx.engineOnScene === null ? t : fx.engineOnScene; sim.hz.suppress = 0; sim.fxPendingSuppress = t + P.engineSetupSec; }
      else if (sim.hazard === 'gas') { fx.hazmatOnScene = fx.hazmatOnScene === null ? t : fx.hazmatOnScene; sim.hz.valveAt = t + 90; }
    } else if (u.kind === 'rescue') { fx.rescueOnScene = fx.rescueOnScene === null ? t : fx.rescueOnScene; startRescue(sim, t); }
    else if (u.kind === 'ambulance') { fx.ambulanceOnScene = fx.ambulanceOnScene === null ? t : fx.ambulanceOnScene; ambulanceArrived(sim); }
    else if (u.kind === 'police') { fx.policeOnScene = fx.policeOnScene === null ? t : fx.policeOnScene; sim.cordon = { active: true, at: t }; evt(sim, 'cordon', null, 'أقامت الشرطة طوقاً أمنياً وأوقفت تدفّق الفضوليين والمركبات', 'Police set up a cordon and stopped onlookers and traffic flowing in'); }
  }
  function startRescue(sim, t) {
    var k = 0;
    sim.people.forEach(function (a) {
      if (a.away) return;
      if (a.st === 'incapacitated' || (a.st === 'sheltered' && a.needsHelp) || a.st === 'waiting') { var known = sim.rb && sim.rb.enabled && a.robotReportedAt !== undefined && a.robotReportedAt !== null; a.rescueAt = t + sim.P.rescueAssistSec * (known ? 1 - sim.P.robotCrewSpeedup : 1) + 15 * k++; }
    });
  }
  function ambulanceArrived(sim) {
    var t = sim.t;
    sim.people.forEach(function (a) { if ((a.st === 'down') && a.helpAt === null) { a.helpAt = t; a.helpBy = 'ambulance'; } });
    sim.cases.forEach(function (c) { if (c.helpAt === null) { c.helpAt = t; c.helpBy = 'ambulance'; } });
  }
  function aedArrived(sim) {
    var t = sim.t;
    sim.people.forEach(function (a) { if (a.st === 'down' && a.helpAt === null) { a.helpAt = t; a.helpBy = 'drone-aed'; } });
    sim.cases.forEach(function (c) { if (c.helpAt === null) { c.helpAt = t; c.helpBy = 'drone-aed'; } });
    evt(sim, 'help-arrived', { by: 'drone-aed' }, 'وصل جهاز الإنعاش بالطائرة إلى المصاب', 'The AED reached the patient by drone');
  }
  function volunteerArrived(sim, a) {
    var t = sim.t;
    sim.people.forEach(function (v) { if (v.st === 'down' && v.helpAt === null) { v.helpAt = t; v.helpBy = 'volunteer'; } });
    sim.cases.forEach(function (c) { if (c.helpAt === null) { c.helpAt = t; c.helpBy = 'volunteer'; } });
    if (!sim.volEvt) { sim.volEvt = 1; evt(sim, 'help-arrived', { by: 'volunteer', person: a.key }, 'وصل أول متطوع مدرَّب إلى المصاب', 'The first trained volunteer reached the patient'); }
  }

  // delayed effects (engine set-up, rescue completion) run every tick
  function stepEffects(sim) {
    var t = sim.t, P = sim.P;
    if (sim.fxPendingSuppress && t >= sim.fxPendingSuppress) {
      sim.hz.suppress = 1; sim.fxPendingSuppress = 0; sim.hz.extinguishAt = t + 600;
      evt(sim, 'suppression', null, 'بدأ رجال الإطفاء إخماد الحريق (ينقص الانتشار)', 'Firefighters started suppressing the fire (spread is reduced)');
    }
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i];
      if (a.rescueAt && t >= a.rescueAt && a.st !== 'safe') { a.st = 'safe'; a.safeKind = 'rescued'; a.safeAt = t; if (a.firstSafeAt === null) a.firstSafeAt = t; a.rescueAt = 0; a.rescued = true; if (a.hero) evt(sim, 'rescued', { person: a.key }, 'أخرج فريق الإنقاذ ' + a.name.ar, 'The rescue team brought out ' + a.name.en); if (!a.checkin && sim.mode === 'manara') { a.checkin = 'safe'; a.checkinAt = t; } }
    }
    if (sim.victim !== undefined) { /* volunteer / drone help handled via arrive() and aedArrived() */ }
  }

  function traffic_snapshot(sim) {
    var tr = trafficState(sim), clock = clockSec(sim);
    return sim.W.roads.segs.map(function (s) {
      var f = segFactors(s, clock, tr);
      return { id: s.id, a: s.a, b: s.b, cls: s.cls, factor: round1(f.total * 100) / 100, closed: !!tr.closed[s.id], closedBy: tr.closedBy[s.id] || null, jam: tr.jams[s.id] || null, hot: f.hot < 0.95 };
    });
  }

  /* ====================================================================================
   * 12. THE TICK, OPERATOR ACTIONS, CASES, ARRIVALS, METRICS, SNAPSHOT, HAND-OFF, CAP, A/B
   * ==================================================================================== */
  var SIM_LABEL = T('محاكاة — فحص لآلية العمل وليس دليلاً على الأثر', 'SIMULATION — a mechanism check, not proof of impact');

  function markAffected(sim) {
    var w = sim.W, G = w.G;
    sim.people.forEach(function (a) {
      if (a.away || a.g < 0) { a.affected = false; return; }
      var x = G.nx[a.g], y = G.ny[a.g], aff = false;
      switch (sim.hazard) {
        case 'fire': aff = a.g >= NC && G.nst[a.g] === sim.hz.struct; break;
        case 'gas': aff = dist2(x, y, sim.hz.src.x, sim.hz.src.y) * CELL <= 200; break;
        case 'flood': aff = a.g < NC && w.elev[a.g] < 2.3; break;
        case 'dust': aff = a.g < NC; break;
        case 'heat': aff = a.g < NC && (a.loc === 'site' || a.loc === 'yard' || a.loc === 'outdoor'); break;
        case 'sos': aff = a.id === sim.victim || a.volunteer; break;
      }
      a.affected = aff;
    });
  }

  // for hazards whose danger zone is only known once the hazard is verified, "affected" = who stood in the evacuation zone at that moment
  // at the moment the MANARA alert would go out (confirmed + operator time). The same physics in both worlds, so the A/B compares the same people.
  function markAffectedAtZoneTime(sim) {
    if (sim.hazard === 'fire' || sim.hazard === 'sos' || sim.affectedFixed) return;
    sim.people.forEach(function (a) {
      if (a.away || a.g < 0 || a.trip >= 0) return;
      var lv = zoneLevelFor(sim, a);
      if (sim.hazard === 'dust') a.affected = a.g < NC;
      else a.affected = lv === 'evacuate';
    });
    sim.affectedFixed = true;
  }

  function stepCases(sim) {
    var P = sim.P, t = sim.t;
    for (var i = 0; i < sim.cases.length; i++) {
      var c = sim.cases[i];
      if (sim.hazard === 'sos') {
        if (c.keyA === null && t >= c.t0 + P.sosStillSec) c.keyA = t;
        if (c.keyB === null && t >= c.t0 + P.sosStillSec + P.sosTimeoutSec) c.keyB = t;
        c.confirmAt = sim.ver.confirmedAt; c.approveAt = sim.ver.approvedAt;
        continue;
      }
      if (sim.mode !== 'manara') continue;
      if (c.keyA === null && t >= c.t0 + P.sosStillSec) c.keyA = t;
      if (c.keyB === null && t >= c.t0 + P.sosStillSec + P.sosTimeoutSec) c.keyB = t;
      if (c.confirmAt === null && c.keyB !== null) {
        c.confirmAt = t; evt(sim, 'case-confirmed', { case: c.id }, 'مؤكَّد: انهيار شخص (زر/كاشف + لا إجابة)', 'CONFIRMED: a person has collapsed (detector + no answer)');
        if (!sim.plan) { createDispatchPlan(sim, 'manara'); }
      }
      if (c.approveAt === null && c.confirmAt !== null && P.autoApprove && t >= c.confirmAt + P.approveSec) {
        c.approveAt = t;
        if (sim.plan && sim.plan.state === 'recommended') approveDispatchPlan(sim);
        else if (sim.plan) { var pts = patientsEstimate(sim); sim.plan.patients = pts; }
      }
    }
  }

  function stepArrivals(sim) {
    if (sim.hazard !== 'flood') return;
    var hz = sim.hz, t = sim.t;
    if (t >= hz.spawnNext && t < sim.durationSec - 120) {
      hz.spawnNext += 25;
      if (sim.cordon.active) { hz.diverted = (hz.diverted || 0) + 1; return; }
      var id = ++hz.arrivals;
      var a = addPerson(sim, { key: 'arrival-' + id, role: 'passerby', persona: 'adult', lang: pickLang(hr(sim.seed, D.PERSON, 9000 + id, 1)), loc: 'outdoor', g: cellIdx(24, 33), registered: false, name: T('مستخدم للنفق', 'Underpass user'), trip: cellIdx(24, 52), group: null });
      a.speed = a.speedBase * sim.P.walkScale; a.rf = 1; a.heatTol = 1; a.affected = true; a.plan = 'trip'; a.st = 'moving'; a.moveAt = t;
      if (sim.mode === 'manara' && sim.alert && hr(sim.seed, D.MISC, 9000 + id, 2) < sim.P.broadcastPct / 100) {
        a.zoneLevel = 'evacuate'; a.alertAt = t + sim.P.deliverySec; a.alertSrc = 'broadcast'; a.msg = composeFor(sim, a);
      }
    }
  }

  function stepSeries(sim) {
    if (sim.t % 5 !== 0) return;
    var s = { t: sim.t, aware: 0, informed: 0, moving: 0, safe: 0, sheltered: 0, down: 0, checkedIn: 0, asleep: 0 };
    for (var i = 0; i < sim.people.length; i++) {
      var a = sim.people[i]; if (a.away || !a.affected) continue;
      if (a.aware >= 1) s.aware++; if (a.aware >= 2) s.informed++;
      if (a.st === 'moving') s.moving++; else if (a.st === 'safe') s.safe++; else if (a.st === 'sheltered') s.sheltered++; else if (a.st === 'incapacitated' || a.st === 'down') s.down++;
      if (a.checkin) s.checkedIn++; if (a.asleep) s.asleep++;
    }
    sim.series.push(s);
  }
  function initMetrics(sim) { sim.series = []; markAffected(sim); }

  function tick(sim) {
    HZ[sim.hazard].phys(sim);
    updateExitStates(sim);
    stepVerification(sim);
    stepCases(sim);
    if (sim.hz.started && (sim.mode === 'ordinary' || !sim.alert) && sim.t % 3 === 0) buildDanger(sim);   // people who only see / hear (no live route) still see flames and deep water
    stepRouting(sim);
    stepArrivals(sim);
    stepGuard(sim);
    stepPeople(sim);
    stepDrone(sim);
    stepRobots(sim);
    stepDispatch(sim);
    stepEffects(sim);
    stepSeries(sim);
    sim.t += 1;
    if (!sim.done && sim.t >= sim.durationSec) { sim.done = true; sim.doneAt = sim.t; evt(sim, 'end', null, 'انتهت المحاكاة', 'Simulation ended'); }
  }
  function step(sim, dt) {
    sim.acc += (dt === undefined ? 1 : dt);
    var n = 0;
    while (sim.acc >= 1 && !sim.done) { tick(sim); sim.acc -= 1; n++; }
    return n;
  }
  function run(sim, seconds) {
    var until = seconds === undefined ? sim.durationSec : seconds;
    while (sim.t < until && !sim.done) tick(sim);
    return sim;
  }

  // ---------------------------------------------------------------- operator / test actions
  function findExit(sim, id) {
    var parts = String(id).split('.'), sid = parts.length > 1 ? parts[0] : sim.hazard === 'fire' && sim.hz.struct === 1 ? 'SCH' : 'RB', eid = parts[parts.length - 1];
    for (var i = 0; i < sim.W.exits.length; i++) { var e = sim.W.exits[i]; if (e.id === eid && sim.W.structs[e.struct].id === sid) return i; }
    return -1;
  }
  var api = {};
  api.approve = function (sim) { return approveInternal(sim, 'operator'); };
  api.reject = function (sim, holdSec) {
    if (sim.ver.phase !== 'confirmed') return false;
    sim.ver.phase = 'suspect'; sim.ver.hold = 0; sim.ver.needsApproval = false; sim.ver.holdOffUntil = sim.t + (holdSec || 120);
    evt(sim, 'rejected', null, 'رفض المشغّل التنبيه (إنذار كاذب) — العودة إلى «اشتباه»', 'The operator rejected the alert (false alarm) — back to SUSPECT');
    return true;
  };
  api.trigger = function (sim) { if (!sim.hz.started && sim.t < sim.tIgnite) sim.tIgnite = sim.t; return sim.tIgnite; };
  api.setExit = function (sim, id, opts) {
    var gi = findExit(sim, id); if (gi < 0) return false;
    var ex = sim.exits[gi];
    if (opts && opts.locked !== undefined) {
      ex.locked = !!opts.locked;
      evt(sim, 'exit-set', { exit: ex.id, locked: ex.locked }, (ex.locked ? 'أُقفل المخرج «' : 'فُتح المخرج «') + ex.name.ar + '» يدوياً', (ex.locked ? 'Locked ' : 'Unlocked ') + 'exit "' + ex.name.en + '" manually');
    }
    updateExitStates(sim); sim.rt.dirty = true; return true;
  };
  api.setWind = function (sim, wind) { setWindInternal(sim, wind); if (sim.rt) sim.rt.dirty = true; sim.dispatchDirty = true; return sim.wind; };
  api.setTraffic = function (sim, load) { sim.P.trafficLoad = clamp(load, 0, 2); sim.dispatchDirty = true; return sim.P.trafficLoad; };
  api.jamRoad = function (sim, segId, factor) {
    var seg = sim.W.roads.segById[segId]; if (!seg) return false;
    sim.traffic.jams[segId] = clamp(factor === undefined ? 0.15 : factor, 0.05, 1);
    evt(sim, 'road-jam', { seg: segId, factor: sim.traffic.jams[segId] }, 'ازدحام يدوي على «' + (seg.name ? seg.name.ar : segId) + '»', 'Manual jam on "' + (seg.name ? seg.name.en : segId) + '"'); sim.dispatchDirty = true; return true;
  };
  api.unjamRoad = function (sim, segId) { delete sim.traffic.jams[segId]; sim.dispatchDirty = true; return true; };
  api.closeRoad = function (sim, segId, closed) {
    var seg = sim.W.roads.segById[segId]; if (!seg) return false;
    if (closed === false) { if (sim.traffic.closedBy[segId] === 'operator') { delete sim.traffic.closedBy[segId]; delete sim.traffic.closed[segId]; evt(sim, 'road-open', { seg: segId }, 'أُعيد فتح الطريق «' + (seg.name ? seg.name.ar : segId) + '»', 'Road "' + (seg.name ? seg.name.en : segId) + '" reopened'); } }
    else { sim.traffic.closedBy[segId] = 'operator'; sim.traffic.closed[segId] = true; evt(sim, 'road-closed', { seg: segId, by: 'operator' }, 'أُغلق الطريق «' + (seg.name ? seg.name.ar : segId) + '» (المشغّل)', 'Road "' + (seg.name ? seg.name.en : segId) + '" closed (operator)'); }
    sim.dispatchDirty = true; return true;
  };
  api.setUnitBusy = function (sim, assetId, busy, kind) {
    if (busy === false) { delete sim.busy[assetId]; }
    else { var b = sim.busy[assetId] || (sim.busy[assetId] = {}); if (kind) b[kind] = true; else b.all = true; b.why = 'operator'; }
    evt(sim, 'unit-busy', { asset: assetId, busy: busy !== false }, 'الوحدة ' + assetId + (busy === false ? ' متاحة الآن' : ' أصبحت مشغولة'), 'Unit ' + assetId + (busy === false ? ' is available again' : ' became busy'));
    sim.dispatchDirty = true; return true;
  };
  api.setHospital = function (sim, id, o) { var h = sim.hosp[id]; if (!h) return false; if (o && o.freeBeds !== undefined) h.override = Math.max(0, o.freeBeds | 0); sim.dispatchDirty = true; return true; };
  api.setHour = function (sim, hour) { sim.hour0 = hour - sim.t / 3600; sim.dispatchDirty = true; return sim.hour0; };
  api.injectKey = function (sim, channelId, add, seconds) {
    for (var i = 0; i < sim.sensors.length; i++) if (sim.sensors[i].id === channelId) { sim.sensors[i].forced = { add: add, until: sim.t + (seconds || 30) }; return true; }
    return false;
  };
  api.injectDecoy = function (sim, kind, seconds) {   // single-key false triggers for the "proof before panic" demo
    var n = 0;
    sim.sensors.forEach(function (ch) {
      if ((kind === 'vapour' && ch.kind === 'smoke') || (kind === 'hotmug' && (ch.kind === 'thermal' || ch.kind === 'ythermal')) || (kind === 'redcar' && (ch.kind === 'vision' || ch.kind === 'yvision'))) {
        ch.forced = { add: ch.kind === 'smoke' ? 400 : ch.kind === 'thermal' || ch.kind === 'ythermal' ? 40 : 0.8, until: sim.t + (seconds || 40) }; n++;   // hot mug 60-70 degC, sanitiser vapour on the MQ-2, a red car for the camera
      }
    });
    return n;
  };
  api.checkin = function (sim, key, status) {
    var a = sim.byKey[key]; if (!a) return false;
    a.checkin = status === 'help' ? 'help' : 'safe'; a.checkinAt = sim.t;
    sim.evCount['checkin'] = (sim.evCount['checkin'] || 0) + 1; return true;
  };
  api.startHazard = api.trigger;
  // change one assumption of a running sim (clamped to its range). Parameters with live:false (population, thresholds fixed at start) apply on restart().
  api.setParam = function (sim, key, value) {
    var d = PARAM_DEFS.filter(function (x) { return x.key === key; })[0];
    if (!d || !isNum(value)) return false;
    sim.P[key] = clamp(value, d.min, d.max); sim.dispatchDirty = true; if (sim.rt) sim.rt.dirty = true; return d.live !== false;
  };

  // ---------------------------------------------------------------- metrics (labelled SIM)
  function hazardT0(sim) { return sim.hazard === 'heat' ? (sim.hz.tCross !== undefined ? sim.hz.tCross : null) : sim.tIgnite; }
  function stats(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return { n: s.length, p50: s.length ? round1(percentile(s, 0.5)) : null, p90: s.length ? round1(percentile(s, 0.9)) : null, max: s.length ? round1(s[s.length - 1]) : null, mean: s.length ? round1(s.reduce(function (x, y) { return x + y; }, 0) / s.length) : null };
  }
  function metrics(sim) {
    var P = sim.P, tI = sim.tIgnite, t0 = hazardT0(sim), tEnd = sim.t, people = sim.people;
    var aff = people.filter(function (a) { return a.affected && !a.away; });
    var M = { label: SIM_LABEL, preset: sim.preset, hazard: sim.hazard, mode: sim.mode, seed: sim.seed, tEnd: tEnd, nAffected: aff.length, nPeople: people.length, nRegistered: sim.nRegistered };
    var rel = function (x) { return x === null || x === undefined ? null : round1(x - tI); };
    // alerts
    var firstAware = null, firstPersonal = null;
    people.forEach(function (a) { if (a.aware > 0 && a.awareAt >= 0 && (firstAware === null || a.awareAt < firstAware)) firstAware = a.awareAt; if (a.alertDelivered && a.alertAt !== null && (firstPersonal === null || a.alertAt < firstPersonal)) firstPersonal = a.alertAt; });
    M.timeToLocalAlarmSec = sim.local.on ? rel(sim.local.at) : null;
    M.timeToFirstAlertSec = rel(firstAware);
    M.timeToFirstPersonalAlertSec = rel(firstPersonal);
    var isM = sim.mode === 'manara';
    M.timeToSuspectSec = isM ? rel(sim.ver.suspectAt) : null; M.timeToConfirmedSec = isM ? rel(sim.ver.confirmedAt) : null; M.timeToApprovalSec = isM ? rel(sim.ver.approvedAt) : null;
    [60, 120, 300].forEach(function (T0) {
      var n1 = aff.filter(function (a) { return a.aware >= 1 && a.awareAt <= tI + T0; }).length, n2 = aff.filter(function (a) { return a.aware >= 2 && a.aware2At <= tI + T0; }).length;
      M['alertedPctAt' + T0] = aff.length ? Math.round(100 * n1 / aff.length) : null; M['informedPctAt' + T0] = aff.length ? Math.round(100 * n2 / aff.length) : null;
    });
    // time to safe (people who never get safe are counted at the end of the run: a censored value, never ignored)
    var cens = 0, tsafe = aff.map(function (a) { if (a.firstSafeAt !== null && !(a.st === 'incapacitated' && !a.rescued)) return a.firstSafeAt - tI; cens++; return tEnd - tI; });
    var st = stats(tsafe); M.timeToSafe = { n: st.n, p50: st.p50, p90: st.p90, max: st.max, mean: st.mean, censored: cens, reliable: st.n > 0 && cens / st.n < 0.25,
      note: T('من لم يصل إلى مكان آمن يُحسب زمنه حتى نهاية التشغيل (قيمة مقيَّدة)؛ ولا يُعوَّل على المقياس إذا كان معظم الناس لا يحتاجون التحرك أصلاً', 'People who never reached safety are counted at the end of the run (censored); do not rely on this metric when most people never needed to move') };
    M.timeToSafeP50Sec = st.p50; M.timeToSafeP90Sec = st.p90;
    M.stillNotSafe = {};
    [60, 120, 300, 600].forEach(function (T0) { M.stillNotSafe['t' + T0] = aff.filter(function (a) { return !(a.firstSafeAt !== null && a.firstSafeAt <= tI + T0 && !(a.st === 'incapacitated' && !a.rescued)); }).length; });
    // exposure (model dose; never "deaths")
    M.exposed = aff.filter(function (a) { return a.exposedSec > 0; }).length;
    M.injuredInModel = aff.filter(function (a) { return a.injured; }).length;
    M.incapacitatedInModel = aff.filter(function (a) { return a.st === 'incapacitated' || (a.downAt !== null && a.dose >= 1); }).length;
    M.exposurePersonSec = aff.reduce(function (s, a) { return s + a.exposedSec; }, 0);
    M.enteredDanger = aff.filter(function (a) { return a.enteredDangerAt !== null; }).length;
    M.deadEnds = people.reduce(function (s, a) { return s + (a.discoveries || 0); }, 0);
    // heat / SOS: time to help
    var cases = sim.cases.map(function (c) { return { t0: c.t0, helpAt: c.helpAt, by: c.helpBy }; });
    var th = cases.filter(function (c) { return c.helpAt !== null; }).map(function (c) { return c.helpAt - c.t0; });
    M.collapses = cases.length;
    M.timeToHelp = { n: th.length, of: cases.length, p50: th.length ? round1(percentile(th.slice().sort(function (a, b) { return a - b; }), 0.5)) : null, max: th.length ? round1(Math.max.apply(null, th)) : null, by: cases.map(function (c) { return c.by; }) };
    M.timeToHelpSec = M.timeToHelp.p50;
    // headcount (only MANARA, or an ordinary building that does a paper roll call)
    var hasHC = sim.mode === 'manara' || !!P.rollCall;
    var scope = {}; sim.pre.scope.forEach(function (g) { scope[g] = true; });
    var reg = people.filter(function (a) { return a.registered && scope[a.group]; });
    if (hasHC) {
      M.headcount = { registered: reg.length, atT: {} };
      [60, 120, 300, 600].forEach(function (T0) { M.headcount.atT['t' + T0] = reg.filter(function (a) { return !(a.checkinAt !== null && a.checkinAt <= tI + T0); }).length; });
      var hc = headcount(sim); M.headcount.final = { safe: hc.safe, safeAway: hc.safeAway, help: hc.help, unaccounted: hc.unaccounted }; if (hc.located !== undefined) M.headcount.final.located = hc.located;
      var ci = reg.filter(function (a) { return a.checkinAt !== null; }).map(function (a) { return a.checkinAt - tI; }).sort(function (a, b) { return a - b; });
      M.timeTo90pctAccountedSec = ci.length >= Math.ceil(0.9 * reg.length) ? round1(ci[Math.ceil(0.9 * reg.length) - 1]) : null;
    } else { M.headcount = null; M.timeTo90pctAccountedSec = null; }
    // dispatch
    var plan = sim.plan, D2 = { planned: !!plan };
    if (plan && t0 !== null) {
      var primary = { fire: 'fire', gas: 'fire', flood: 'rescue', dust: 'police', heat: 'ambulance', sos: 'ambulance' }[sim.hazard];
      var pu = plan.units.filter(function (u) { return u.kind === primary && u.assetId; })[0];
      D2.origin = plan.origin; D2.timeToRecommendedSec = round1(plan.createdAt - t0);
      D2.timeToDispatchSec = plan.t.dispatched !== undefined ? round1(plan.t.dispatched - t0) : null;
      D2.timeToOnSceneSec = pu && pu.onSceneAt !== null ? round1(pu.onSceneAt - t0) : null;
      D2.primaryUnit = pu ? pu.assetId : null;
      D2.units = plan.units.filter(function (u) { return u.assetId; }).map(function (u) { return { kind: u.kind, asset: u.assetId, onSceneSec: u.onSceneAt !== null ? round1(u.onSceneAt - t0) : null, farButFaster: !!(u.whyData && u.whyData.farButFaster) }; });
    } else { D2.timeToDispatchSec = null; D2.timeToOnSceneSec = null; }
    M.dispatch = D2; M.timeToDispatchSec = D2.timeToDispatchSec; M.timeToOnSceneSec = D2.timeToOnSceneSec;
    M.reroutesNotified = (sim.rt && sim.rt.notified) || 0;
    M.droneLocated = sim.drone.located;
    M.headline = headline(M);
    return M;
  }
  function headline(M) {
    switch (M.hazard) {
      case 'fire': return { key: 'timeToSafeP90Sec', value: M.timeToSafeP90Sec, unit: 's', better: 'lower', label: T('زمن وصول 90٪ إلى الأمان', 'Time for 90 % to reach safety') };
      case 'gas': case 'flood': case 'dust': return { key: 'exposurePersonSec', value: M.exposurePersonSec, unit: 'person-s', better: 'lower', label: T('ثوانٍ-شخص في الخطر', 'Person-seconds in danger') };
      case 'heat': return { key: 'collapses', value: M.collapses, unit: 'persons', better: 'lower', label: T('حالات انهيار حراري', 'Heat collapses') };
      case 'sos': return { key: 'timeToHelpSec', value: M.timeToHelpSec, unit: 's', better: 'lower', label: T('الزمن حتى وصول المساعدة', 'Time until help arrives') };
    }
    return null;
  }
  function diff(o, m) {
    var d = function (a, b) { return a === null || a === undefined || b === null || b === undefined ? null : round1(a - b); };
    return {
      note: T('القيم الموجبة = المنارة أفضل (أقل)، باستثناء «أول إنذار» حيث الموجب يعني أن الإنذار العادي أبكر', 'Positive = MANARA better (lower), except "first alert" where positive means the ordinary alarm came earlier'),
      timeToSafeP50Sec: o.timeToSafe.reliable && m.timeToSafe.reliable ? d(o.timeToSafeP50Sec, m.timeToSafeP50Sec) : null, timeToSafeP90Sec: o.timeToSafe.reliable && m.timeToSafe.reliable ? d(o.timeToSafeP90Sec, m.timeToSafeP90Sec) : null,
      injuredInModel: d(o.injuredInModel, m.injuredInModel), incapacitatedInModel: d(o.incapacitatedInModel, m.incapacitatedInModel), exposurePersonSec: d(o.exposurePersonSec, m.exposurePersonSec),
      collapses: d(o.collapses, m.collapses), timeToHelpSec: d(o.timeToHelpSec, m.timeToHelpSec), timeToDispatchSec: d(o.timeToDispatchSec, m.timeToDispatchSec), timeToOnSceneSec: d(o.timeToOnSceneSec, m.timeToOnSceneSec),
      firstAlertSec: d(m.timeToFirstAlertSec, o.timeToFirstAlertSec), stillNotSafeAt120: d(o.stillNotSafe.t120, m.stillNotSafe.t120), stillNotSafeAt300: d(o.stillNotSafe.t300, m.stillNotSafe.t300),
      headline: o.headline && m.headline ? d(o.headline.value, m.headline.value) : null
    };
  }

  function ab(opts) {
    opts = opts || {};
    var base = { preset: opts.preset || 'fire-night', seed: opts.seed === undefined ? 1 : opts.seed, params: opts.params, hour: opts.hour, wind: opts.wind, gasType: opts.gasType, autoApprove: true };
    var o = create(Object.assign({}, base, { mode: 'ordinary' })), m = create(Object.assign({}, base, { mode: 'manara' }));
    run(o, opts.seconds); run(m, opts.seconds);
    var mo = metrics(o), mm = metrics(m);
    return { v: 1, label: SIM_LABEL, preset: base.preset, seed: base.seed, params: cloneJSON(m.P), ordinary: mo, manara: mm, delta: diff(mo, mm), hash: { ordinary: hashSim(o), manara: hashSim(m) } };
  }
  // run the A/B over a list of values of one assumption (and a few seeds) and report how the gap changes
  function sweep(opts) {
    var seeds = opts.seeds || [1, 2], rows = [];
    (opts.values || []).forEach(function (val) {
      var acc = { headline: 0, p50: 0, p90: 0, injured: 0, expOrd: 0, expMan: 0, n: 0, hOrd: 0, hMan: 0 }, params = Object.assign({}, opts.params || {});
      params[opts.param] = val;
      seeds.forEach(function (sd) {
        var r = ab({ preset: opts.preset, seed: sd, params: params, seconds: opts.seconds, hour: opts.hour });
        acc.n++; acc.hOrd += r.ordinary.headline ? (r.ordinary.headline.value || 0) : 0; acc.hMan += r.manara.headline ? (r.manara.headline.value || 0) : 0;
        acc.p50 += r.delta.timeToSafeP50Sec || 0; acc.p90 += r.delta.timeToSafeP90Sec || 0; acc.injured += r.delta.injuredInModel || 0;
      });
      rows.push({ value: val, headlineOrdinary: round1(acc.hOrd / acc.n), headlineManara: round1(acc.hMan / acc.n), headlineGap: round1((acc.hOrd - acc.hMan) / acc.n), timeToSafeP50Gap: round1(acc.p50 / acc.n), timeToSafeP90Gap: round1(acc.p90 / acc.n), injuredGap: round1(acc.injured / acc.n) });
    });
    var h0 = PRESETS[opts.preset] ? headline({ hazard: PRESETS[opts.preset].hazard, timeToSafeP90Sec: 0, exposurePersonSec: 0, collapses: 0, timeToHelpSec: 0 }) : null;
    return { v: 1, label: SIM_LABEL, preset: opts.preset, param: opts.param, seeds: seeds, metric: h0 ? { key: h0.key, label: h0.label, unit: h0.unit } : null, rows: rows };
  }

  // ---------------------------------------------------------------- snapshot (JSON-serialisable), hash, views
  function snapPerson(sim, a, full) {
    var p = personPos(sim, a), o = { id: a.id, key: a.key, role: a.role, persona: a.persona, st: a.st, aware: a.aware, asleep: a.asleep, away: a.away, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, fl: p.fl, lang: a.lang };
    if (a.name) o.name = a.name; if (a.hero) o.hero = a.hero; if (a.room) o.room = a.room; if (a.cls) o.cls = a.cls;
    if (a.deaf) o.deaf = true; if (a.blind) o.blind = true; if (a.asthma) o.asthma = true; if (a.volunteer) o.volunteer = true; if (a.registered) o.registered = true; if (a.app) o.app = true;
    if (a.dose > 0) o.dose = Math.round(a.dose * 1000) / 1000; if (a.injured) o.injured = true; if (a.checkin) o.checkin = a.checkin; if (a.safeKind) o.safeKind = a.safeKind;
    if (a.ladderStage >= 0) { o.ladder = a.ladderStage; if (a.ladderStopAt !== null) o.ladderStop = a.ladderStopAt; }
    if (a.msg) o.msg = { action: a.msg.action, level: a.msg.level, formats: a.msg.formats };
    if (a.plan !== 'none') o.plan = a.plan;
    if (a.strain > 0) o.strain = Math.round(a.strain * 100) / 100;
    if (full) { o.safeAt = a.safeAt; o.awareAt = a.awareAt; o.moveAt = a.moveAt; o.wokeAt = a.wokeAt; o.helpAt = a.helpAt; }
    return o;
  }
  function dispatchSnapshot(sim) {
    var plan = sim.plan; if (!plan) return null;
    return {
      id: plan.id, state: plan.state, origin: plan.origin, hazard: plan.hazard, scene: { node: plan.node, x: plan.at.x, y: plan.at.y }, t: cloneJSON(plan.t), patients: plan.patients,
      units: plan.units.map(function (u) {
        return { kind: u.kind, assetId: u.assetId, name: u.name, state: u.state, etaSec: u.etaSec === null ? null : Math.round(u.etaSec), etaMin: u.etaSec === null || u.etaSec === undefined ? null : round1(u.etaSec / 60), distM: u.distM ? Math.round(u.distM) : null,
          pos: u.assetId ? unitPos(sim, u) : null, route: u.assetId ? polyline(sim, u) : [], why: u.why, whyData: u.whyData, runnerUp: u.runnerUp || null, nearestByDistance: u.nearestByDistance || null, reroutes: u.reroutes || 0,
          optional: !!u.optional, replaced: u.replaced || null, states: u.states };
      }),
      hospital: plan.hospital && plan.hospital.chosen ? { id: plan.hospital.chosen.asset.id, name: plan.hospital.chosen.asset.name, etaSec: Math.round(plan.hospital.chosen.etaSec), etaMin: round1(plan.hospital.chosen.etaSec / 60), distM: Math.round(plan.hospital.chosen.distM), freeBeds: plan.hospital.chosen.freeBeds,
        fits: plan.hospital.chosen.fits, why: plan.hospital.why, options: plan.hospital.options.map(function (o) { return { id: o.asset.id, etaSec: Math.round(o.etaSec), freeBeds: o.freeBeds, fits: o.fits }; }), skipped: plan.hospital.skipped } : null
    };
  }
  function snapshot(sim, o) {
    o = o || {};
    var ver = sim.ver, G = sim.W.G;
    var S = {
      v: 1, preset: sim.preset, hazard: sim.hazard, mode: sim.mode, seed: sim.seed, t: sim.t, clock: hms(clockSec(sim)), hour: round1(clockSec(sim) / 3600), done: sim.done, label: SIM_LABEL,
      wind: { deg: sim.wind.deg, speed: sim.wind.speed },
      verification: { phase: ver.phase, zone: ver.zone, keys: Object.keys(ver.keys || {}), suspectAt: ver.suspectAt, confirmedAt: ver.confirmedAt, approvedAt: ver.approvedAt, publicAt: ver.publicAt, needsApproval: ver.needsApproval },
      localAlarm: { on: sim.local.on, at: sim.local.at || null },
      exits: sim.exits.map(function (e) { return { id: e.id, struct: sim.W.structs[e.struct].id, name: e.name, state: e.state, locked: e.locked }; }),
      alert: sim.alert ? { id: sim.alert.id, level: sim.alert.level, issuedAt: sim.alert.issuedAt, recipients: sim.alert.recipients, counts: sim.alert.counts, instructions: sim.alert.instructions } : null,
      counts: countsOf(sim), headcount: sim.mode === 'manara' || sim.P.rollCall ? (function () { var h = headcount(sim), o = { registered: h.registered, safe: h.safe, safeAway: h.safeAway, help: h.help, unaccounted: h.unaccounted }; if (h.located !== undefined) o.located = h.located; return o; })() : null,
      drone: { state: sim.drone.state, x: round1(sim.drone.x), y: round1(sim.drone.y), battery: Math.round(sim.drone.battery * 100) / 100, light: sim.drone.light, mission: sim.drone.mission, located: sim.drone.located },
      traffic: { load: sim.P.trafficLoad, hour: round1(clockSec(sim) / 3600), jams: cloneJSON(sim.traffic.jams), closed: Object.keys(sim.traffic.closed), closedBy: cloneJSON(sim.traffic.closedBy) },
      dispatch: dispatchSnapshot(sim),
      sensors: sim.sensors.filter(function (c) { return o.sensors || c.active || c.alarm; }).map(function (c) { return { id: c.id, key: c.key, group: c.group, zone: c.zone, value: c.value === null ? null : Math.round(c.value * 100) / 100, unit: c.unit, active: c.active, alarm: c.alarm, flags: c.cross && c.active ? ['cross-sensitive'] : [] }; }),
      hazardState: hazardSummary(sim),
      people: sim.people.map(function (a) { return snapPerson(sim, a, o.full); })
    };
    if (sim.rb && sim.rb.enabled) S.robot = robotSnapshot(sim);
    if (o.events !== false) S.events = (o.full ? sim.events : sim.events.slice(-(o.lastEvents || 60)));
    if (o.series) S.series = sim.series;
    if (o.metrics) S.metrics = metrics(sim);
    return S;
  }
  function countsOf(sim) {
    var c = { people: sim.people.length, away: 0, asleep: 0, aware: 0, informed: 0, moving: 0, safe: 0, sheltered: 0, down: 0, waiting: 0, injured: 0 };
    sim.people.forEach(function (a) {
      if (a.away) { c.away++; return; }
      if (a.asleep) c.asleep++; if (a.aware >= 1) c.aware++; if (a.aware >= 2) c.informed++;
      if (a.st === 'moving') c.moving++; else if (a.st === 'safe') c.safe++; else if (a.st === 'sheltered') c.sheltered++; else if (a.st === 'incapacitated' || a.st === 'down') c.down++; else if (a.st === 'waiting') c.waiting++;
      if (a.injured) c.injured++;
    });
    return c;
  }
  function hazardSummary(sim) {
    var h = sim.hz, o = { started: h.started, tStart: h.tStart };
    switch (sim.hazard) {
      case 'fire': o.burningRooms = h.burning; o.ventedRooms = h.vented; o.outdoorBurning = h.outList.length; o.suppressing = !!h.suppress; o.smokeMax = round1(fieldMax(sim.F.smoke) * 100) / 100; o.struct = sim.W.structs[h.struct].id; break;
      case 'gas': o.peak = round1(fieldMax(sim.F.gas)); o.leakOn = h.leakOn; o.type = h.gasType; o.warn = sim.P.gasWarn; o.danger = sim.P.gasDanger; break;
      case 'flood': o.maxDepthCm = Math.round(h.maxDepth * 100); o.rainMmHr = Math.round(h.rain); o.underpassCm = Math.round(sim.F.water[42 * W + 24] * 100); break;
      case 'dust': o.peakPM10 = Math.round(h.peakSeen || 0); o.frontM = Math.round(h.front); break;
      case 'heat': o.wbgt = round1(h.wbgt || wbgtNow(sim)); o.collapses = h.collapses; o.stopLevel = sim.P.wbgtStop; break;
      case 'sos': o.cases = sim.cases.length; break;
    }
    return o;
  }
  function hashSim(sim) { return fnv(JSON.stringify(snapshot(sim, { full: true, sensors: true }))); }

  function view(sim) {   // zero-copy typed arrays for canvas drawing (do not modify)
    return { w: W, h: H, cellM: CELL, smoke: sim.F.smoke, gas: sim.F.gas, water: sim.F.water, dust: sim.F.dust, outdoorFire: sim.ofire, elev: sim.W.elev, kind: sim.W.kind, walk: sim.W.walk, fuel: sim.W.fuel };
  }

  var WORLD_INFO = null;
  function worldInfo() {
    if (WORLD_INFO) return WORLD_INFO;
    var w = world(), G = w.G;
    WORLD_INFO = {
      v: 1, w: W, h: H, cellM: CELL, north: 'up', kind: Array.from(w.kind), walk: Array.from(w.walk), fuel: Array.from(w.fuel), building: Array.from(w.bld),
      elev: Array.from(w.elev, function (v) { return Math.round(v * 100) / 100; }), kindNames: { 0: T('أرض', 'Ground'), 1: T('طريق', 'Road'), 2: T('مبنى', 'Building'), 3: T('حديقة', 'Park'), 4: T('ساحة المدرسة', 'School yard'), 5: T('موقع بناء', 'Worksite') },
      buildings: [null, { id: 'RB', name: T('سكن العمال', 'Workers\' residence') }, { id: 'SCH', name: T('المدرسة', 'School') }, { id: 'MOSQUE', name: T('المسجد', 'Mosque') }, { id: 'SHOPS', name: T('المحال', 'Shops (drone dock on the roof)') },
        { id: 'LPG', name: T('مخزن الغاز', 'LPG store') }, { id: 'SOUQ', name: T('السوق', 'Souq') }, { id: 'OFFICE', name: T('مكتب الموقع', 'Site office') }, { id: 'COOL', name: T('حاوية التبريد', 'Cooling container') }],
      assembly: w.assembly.map(function (a) { return { id: a.id, x: a.x, y: a.y, name: a.name }; }), shelters: w.shelters.map(function (s) { return { id: s.id, x: s.x, y: s.y, name: s.name, cool: s.cool }; }),
      structs: w.structs.map(function (S) { return { id: S.id, name: S.name, floors: S.floors, x0: S.x0, y0: S.y0, w: S.w, h: S.h, nodes: S.nodes.map(function (n) { return { id: n.id, type: n.type, fl: n.fl, x: n.x, y: n.y, room: n.room || null, cls: n.cls || null, label: n.label }; }),
        edges: S.edges.map(function (e) { return [S.nodes[e.a].id, S.nodes[e.b].id, e.flag]; }), exits: S.exits.map(function (e) { return { id: e.id, name: e.name, kind: e.kind, node: e.node, out: e.out }; }) }; }),
      roads: { nodes: w.roads.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, off: n.off }; }), segs: w.roads.segs.map(function (s) { return { id: s.id, a: s.a, b: s.b, cls: s.cls, lenM: s.lenM, name: s.name, low: s.low, poi: s.poi, hot: s.hot.map(function (h) { return { id: h.id, from: h.from, to: h.to, depth: h.depth, label: h.label }; }) }; }) },
      assets: w.assets.map(function (a) { return { id: a.id, kind: a.kind, node: a.node, name: a.name, pos: a.pos, edgePos: a.edgePos, rescue: !!a.rescue, hazmat: !!a.hazmat, ed: !!a.ed, trauma: !!a.trauma, paed: !!a.paed, beds: a.beds || null }; }),
      dock: w.dock, lpg: w.lpg, underpass: w.underpass, site: w.site, profile: TRAFFIC_PROFILE, roadClasses: ROAD_CLASS, demo: T('كل الوحدات والمستشفيات في هذه الخريطة وهمية (تجريبية) والأزمنة محاكاة', 'All units and hospitals on this map are fictional (demo) and the times are simulated')
    };
    return WORLD_INFO;
  }

  // ---------------------------------------------------------------- hand-off card, bus helpers
  function busDispatch(sim) {
    var d = dispatchSnapshot(sim); if (!d) return null;
    return { type: 'dispatch', id: d.id, state: d.state, origin: d.origin, scene: d.scene,
      units: d.units.filter(function (u) { return u.assetId; }).map(function (u) { return { kind: u.kind, name: u.name, etaMin: u.etaMin, status: u.state, why: u.why }; }),
      hospital: d.hospital ? { name: d.hospital.name, etaMin: d.hospital.etaMin } : null };
  }
  function handoff(sim, o) {
    o = o || {};
    var hc = headcount(sim), G = sim.W.G, h = sim.hz;
    var card = {
      type: 'handoff', status: T('تمرين — محاكاة', 'EXERCISE — simulation'), t: sim.t, clock: hms(clockSec(sim)), hazard: sim.hazard, incident: sim.pre.incident, area: DEMO_AREA,
      phase: sim.ver.phase, confirmedAt: sim.ver.confirmedAt, approvedAt: sim.ver.approvedAt, wind: { deg: sim.wind.deg, speed: sim.wind.speed },
      exits: sim.exits.filter(function (e) { return sim.hazard !== 'fire' || sim.W.exits[e.gi].struct === sim.hz.struct; }).map(function (e) { return { id: e.id, name: e.name, state: e.state }; }),
      hazardState: hazardSummary(sim),
      roads: Object.keys(sim.traffic.closed).map(function (id) { return { id: id, by: sim.traffic.closedBy[id], name: sim.W.roads.segById[id].name }; }),
      people: (function () { var o2 = { registered: hc.registered, safe: hc.safe, safeAway: hc.safeAway, help: hc.help, unaccounted: hc.unaccounted }; if (hc.located !== undefined) o2.located = hc.located; return o2; })(),
      unaccounted: hc.unaccountedList.slice(0, o.top || 12), needHelp: hc.helpList,
      needsFlags: sim.people.filter(function (a) { return a.registered && !a.away && (a.persona === 'wheelchair' || a.deaf || a.blind) && (sim.pre.scope.indexOf(a.group) >= 0); }).map(function (a) { return { key: a.key, name: a.name || null, room: a.room, flag: a.persona === 'wheelchair' ? 'wheelchair' : a.deaf ? 'deaf' : 'blind', where: a.st === 'sheltered' && a.safeKind === 'refuge' ? 'refuge' : a.st }; }),
      droneLocated: sim.drone.located, drone: sim.drone.state,
      dispatch: busDispatch(sim), notes: [T('المحاكاة وهمية: 999 تبقى المُرسِل، والمنارة ترسل حزمة متحقَّقاً منها فقط', 'Simulation: 999 stays the dispatcher; MANARA only sends a verified package'), SIM_LABEL]
    };
    if (sim.rb && sim.rb.enabled) {   // the robot's part of the card: who it located (a distinct status from 'safe'), what it could not open or reach, where it is
      card.locatedByRobot = hc.locatedList;
      card.robot = { label: ROBOT_LABEL, role: sim.rb.role, units: sim.robots.map(function (r) { return { id: r.id, variant: r.variant, state: r.state, battery: Math.round(r.battery * 100), pose: { node: r.S.nodes[r.node].id, label: rbNodeText(r.G, r.node) }, coveragePct: coverageOf(sim, r).pct, beacons: r.beacons.length }; }),
        finds: sim.rb.finds.map(findOut), blocked: sim.rb.blocked.map(blockOut) };
      card.notes.push(T('الروبوت مفهوم بنموذج أولي محاكى؛ يساعد ورجال الإطفاء يقرّرون', 'The robot is a simulated concept; it assists, firefighters decide'));
    }
    if (o.cap) card.cap = capXml(sim, o.cap === true ? {} : o.cap);
    return card;
  }
  function personRoute(sim, a) {
    var rt = sim.rt, G = sim.W.G, R = router();
    var field = fieldFor(sim, a), live = field === rt.dyn.std || field === rt.dyn.ns || field === rt.help;
    var u = a.g, pts = [[round1(G.nx[u]), round1(G.ny[u])]], nodes = [u], guard = 0, last = u;
    var opt = { noStairs: a.persona === 'wheelchair', stairFactor: sim.P.stairFactor, exitBlock: live ? rt.exitBlock : null, detour: false };
    while (field.tOff[u] < 0 && guard++ < 260) {
      var n = R.next(u, field.dist, live ? rt.pen : null, live ? rt.blk : null, opt);
      if (n < 0) break; u = n; pts.push([round1(G.nx[u]), round1(G.ny[u])]); nodes.push(u); last = u;
    }
    return { pts: pts, nodes: nodes, end: last, reached: field.tOff[u] >= 0, kind: field.kind ? field.kind[u] : rt.tKind[u], live: live };
  }
  // Safety audit of one person's live route: does it enter a node the router had marked blocked (flames, dense smoke, plume at the danger level,
  // deep water) or cross an exit that is LOCKED / on FIRE / the stairs for a wheelchair user?  Used by the tests and by Mission Control's "why this route".
  function routeCheck(sim, key) {
    var a = sim.byKey[key]; if (!a || !sim.rt.ready) return null;
    var r = personRoute(sim, a), G = sim.W.G, R = router(), rt = sim.rt, blocked = [], lockedExits = [], stairsForNoStairs = 0;
    for (var i = 1; i < r.nodes.length; i++) {
      var node = r.nodes[i], e = R.edge(r.nodes[i - 1], node);
      if (rt.blk[node] && !(i === r.nodes.length - 1 && r.reached)) blocked.push(node);
      if (e >= 0 && (G.eFlag[e] & F_EXIT) && !exitPassable(sim, G.eExit[e])) lockedExits.push(sim.exits[G.eExit[e]].id);
      if (e >= 0 && (G.eFlag[e] & F_STAIRS) && a.persona === 'wheelchair') stairsForNoStairs++;
    }
    return { ok: blocked.length === 0 && lockedExits.length === 0 && stairsForNoStairs === 0, reached: r.reached, steps: r.nodes.length - 1, blocked: blocked, lockedExits: lockedExits, stairsForNoStairs: stairsForNoStairs, live: r.live };
  }
  function busAlert(sim, key) {
    var a = sim.byKey[key]; if (!a || !sim.alert) return null;
    var G = sim.W.G, p = personPos(sim, a), A = sim.alert, hzAt = incidentCentre(sim), msg = a.msg || composeFor(sim, a);
    var r = (sim.rt.ready ? personRoute(sim, a) : null), kindName = null;
    var safe = null;
    if (r && r.reached) {
      var tg = r.pts[r.pts.length - 1], K2 = TK;
      var asm = sim.W.assembly.filter(function (s) { return s.g === r.end; })[0], sh = sim.W.shelters.filter(function (s) { return s.g === r.end; })[0];
      var nm = asm ? asm.name : sh ? sh.name : r.end >= NC ? (G.ntype[r.end] === NT.REFUGE ? T('شرفة اللجوء', 'Refuge balcony') : G.ntype[r.end] === NT.ROOF ? T('السطح', 'Roof') : T('الطابق العلوي', 'Upper floor')) : T('مكان آمن', 'Safe place');
      safe = { x: tg[0], y: tg[1], name: nm };
    }
    var dist = dist2(p.x, p.y, hzAt.x, hzAt.y) * CELL, brg = (Math.atan2(hzAt.x - p.x, -(hzAt.y - p.y)) / DEG + 360) % 360;
    var out = { type: 'alert', id: A.id, level: msg.level, hazard: sim.hazard, area: A.area, at: { x: round1(hzAt.x), y: round1(hzAt.y) }, radiusM: 400, wind: { deg: sim.wind.deg, speed: sim.wind.speed },
      you: { x: round1(p.x), y: round1(p.y) }, distanceM: Math.round(dist), bearingDeg: Math.round(brg), safe: safe, route: r ? r.pts : [], etaMin: null, instructions: [msg.text], lang: a.lang, formats: msg.formats, action: msg.action, persona: a.persona };
    if (sim.hazard === 'fire') out.fire = { x: out.at.x, y: out.at.y };
    if (sim.hazard === 'dust') { var sp = sim.hz.s[nodeCell(sim, a.g)], eta = (sp - sim.hz.front) / sim.P.dustFrontMps / 60; out.etaMin = eta > 0 ? round1(eta) : 0; }
    return out;
  }

  // ---------------------------------------------------------------- OASIS CAP 1.2 (status Exercise; one <info> per language)
  var CAP_CAT = { fire: ['Fire'], gas: ['Env', 'Safety'], flood: ['Met', 'Rescue'], dust: ['Met', 'Health'], heat: ['Health', 'Met'], sos: ['Health', 'Rescue'] };
  var CAP_EVENT = { fire: T('حريق ودخان', 'Fire and smoke'), gas: T('تسرّب غاز', 'Gas leak'), flood: T('سيول وأمطار غزيرة', 'Flash flood'), dust: T('عاصفة غبارية', 'Dust storm'), heat: T('إجهاد حراري', 'Extreme heat stress'), sos: T('شخص يحتاج مساعدة', 'Person needs help') };
  function isoAt(dateStr, secOfDay, tz) {
    secOfDay = ((Math.floor(secOfDay) % 86400) + 86400) % 86400;
    return dateStr + 'T' + hms(secOfDay) + (tz || '+03:00');
  }
  function capXml(sim, o) {
    o = o || {};
    var A = sim.alert || { id: 'A1', level: 'watch', issuedAt: sim.t, instructions: [], counts: {} };
    var date = o.date || '2026-01-01', tz = o.tz || '+03:00', langs = o.languages || ['ar', 'en'];
    var sentSec = clockSec(sim) - sim.t + A.issuedAt, exp = sentSec + 7200;
    var resp = A.level === 'evacuate' ? 'Evacuate' : A.level === 'shelter' ? 'Shelter' : 'Monitor';
    var urg = A.level === 'watch' ? 'Expected' : 'Immediate', sev = A.level === 'evacuate' ? 'Severe' : A.level === 'shelter' ? 'Moderate' : 'Minor';
    var at = incidentCentre(sim), ev = CAP_EVENT[sim.hazard], place = sim.pre.incident;
    var ident = 'MANARA-EXERCISE-' + sim.preset + '-s' + sim.seed + '-' + A.id;
    var x = [];
    x.push('<?xml version="1.0" encoding="UTF-8"?>');
    x.push('<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">');
    x.push('  <identifier>' + xmlEsc(ident) + '</identifier>');
    x.push('  <sender>manara-simulation@example.invalid</sender>');
    x.push('  <sent>' + isoAt(date, sentSec, tz) + '</sent>');
    x.push('  <status>Exercise</status>');
    x.push('  <msgType>Alert</msgType>');
    x.push('  <source>MANARA simulation</source>');
    x.push('  <scope>Restricted</scope>');
    x.push('  <restriction>EXERCISE ONLY — MANARA simulation. Not a real alert and not for broadcast.</restriction>');
    x.push('  <note>EXERCISE — simulated incident in a fictional demo district. Created by MANARA\'s simulation engine; no real authority issued or approved it.</note>');
    langs.forEach(function (lg) {
      var ar = lg === 'ar', draft = lg !== 'ar' && lg !== 'en';
      var pick = function (tt) { return ar ? tt.ar : tt.en; };
      var instr = (A.instructions && A.instructions.length ? A.instructions.map(pick) : [pick(ACTIONS[actionKey(sim, { persona: 'adult', g: 0, id: -1 }, A.level)])]).join(ar ? ' ' : ' ');
      var head = ar ? 'تمرين: ' + ev.ar + ' — ' + place.ar : 'EXERCISE: ' + ev.en + ' — ' + place.en;
      var desc = ar ? 'حادث محاكى (تمرين) في ' + DEMO_AREA.ar + ': ' + place.ar + '. المستوى: ' + ({ evacuate: 'إخلاء', shelter: 'إيواء', watch: 'متابعة' })[A.level] + '. هذا ليس إنذاراً حقيقياً.'
        : 'Simulated incident (exercise) in the ' + DEMO_AREA.en + ': ' + place.en + '. Level: ' + A.level + '. This is not a real alert.';
      if (draft) desc += ' [DRAFT — needs native-speaker review]';
      x.push('  <info>');
      x.push('    <language>' + xmlEsc(lg) + '</language>');
      CAP_CAT[sim.hazard].forEach(function (c) { x.push('    <category>' + c + '</category>'); });
      x.push('    <event>' + xmlEsc(pick(ev)) + '</event>');
      x.push('    <responseType>' + resp + '</responseType>');
      x.push('    <urgency>' + urg + '</urgency>');
      x.push('    <severity>' + sev + '</severity>');
      x.push('    <certainty>Observed</certainty>');
      x.push('    <effective>' + isoAt(date, sentSec, tz) + '</effective>');
      x.push('    <expires>' + isoAt(date, exp, tz) + '</expires>');
      x.push('    <senderName>' + xmlEsc(ar ? 'محاكاة المنارة (تمرين)' : 'MANARA simulation (exercise)') + '</senderName>');
      x.push('    <headline>' + xmlEsc(head) + '</headline>');
      x.push('    <description>' + xmlEsc(desc) + '</description>');
      x.push('    <instruction>' + xmlEsc(instr) + '</instruction>');
      x.push('    <parameter><valueName>MANARA-simulation</valueName><value>true</value></parameter>');
      x.push('    <parameter><valueName>MANARA-grid</valueName><value>' + Math.round(at.x) + ',' + Math.round(at.y) + ',400m (cell=5m, north-up)</value></parameter>');
      x.push('    <area>');
      x.push('      <areaDesc>' + xmlEsc(pick(DEMO_AREA)) + '</areaDesc>');
      x.push('    </area>');
      x.push('  </info>');
    });
    x.push('</alert>');
    return x.join('\n');
  }

  // calm, useful lines for the residents' phones: "Fire engine ETA 4 min", "Ambulance ETA 6 min — stay where you are"
  function residentLines(sim) {
    var plan = sim.plan; if (!plan) return [];
    var out = [];
    plan.units.forEach(function (u) {
      if (!u.assetId || u.optional && u.kind === 'rescue') return;
      var nm = { fire: T('سيارة الإطفاء', 'Fire engine'), rescue: T('فريق الإنقاذ', 'Rescue team'), ambulance: T('الإسعاف', 'Ambulance'), police: T('الشرطة', 'Police') }[u.kind];
      var min = u.etaSec === null || u.etaSec === undefined ? null : Math.max(1, Math.round(u.etaSec / 60));
      var stay = u.kind === 'ambulance' ? T(' — ابقَ مكانك', ' — stay where you are') : T('', '');
      if (u.state === 'on-scene' || u.state === 'cleared') out.push({ kind: u.kind, state: u.state, text: T(nm.ar + ' وصلت إلى الموقع', nm.en + (u.kind === 'police' ? ' are on scene' : ' is on scene')) });
      else if (u.state === 'recommended') return;
      else if (min !== null) out.push({ kind: u.kind, state: u.state, etaMin: min, text: T(nm.ar + ': الوصول خلال ' + min + ' د' + stay.ar, nm.en + ' ETA ' + min + ' min' + stay.en) });
    });
    return out;
  }

  // "farther but faster" helper for demos and tests: compare the unit nearest by road distance with the one fastest now
  function dispatchCompare(sim, kind, o) {
    o = o || {};
    var tr = trafficState(sim), clock = o.hour !== undefined ? o.hour * 3600 : clockSec(sim);
    if (o.load !== undefined) tr = Object.assign({}, tr, { load: o.load });
    var pick = pickUnit(sim.W.roads, unitCandidates(sim, kind, o.flag || null), sceneNodeId(sim), clock, tr, { emerg: tr.emergencyFactor, allowClosedAtGoal: true });
    return { kind: kind, fastest: pick.chosen ? { id: pick.chosen.id, etaSec: Math.round(pick.chosen.etaSec), distM: Math.round(pick.chosen.distM) } : null, nearestByDistance: pick.byDistance ? { id: pick.byDistance.id, distM: Math.round(pick.byDistance.roadDistM), etaSec: Math.round(pick.byDistance.etaSec) } : null,
      farButFaster: !!(pick.whyData && pick.whyData.farButFaster), why: pick.why, ranked: pick.ranked.map(function (r) { return { id: r.id, etaSec: Math.round(r.etaSec), distM: Math.round(r.distM), roadDistM: Math.round(r.roadDistM) }; }) };
  }

  /* ====================================================================================
   * 13. PUBLIC API
   * ==================================================================================== */
  var out = {
    VERSION: VERSION, GRID: { w: W, h: H, cellM: CELL }, PARAMS: PARAM_DEFS, PARAM_GROUPS: PARAM_GROUPS, PRESETS: PRESETS, PRESET_ORDER: PRESET_ORDER, PRESET_ORDER_ROBOT: PRESET_ORDER_ROBOT, PRESET_ORDER_ALL: PRESET_ORDER_ALL, SIM_LABEL: SIM_LABEL,
    defaults: defaultParams, restart: function (sim, over) { return create(Object.assign({}, sim.opts, over || {})); },
    create: create, step: step, run: run, snapshot: snapshot, hash: hashSim, view: view, worldInfo: worldInfo, metrics: metrics, headcount: headcount,
    handoff: handoff, residentLines: residentLines, busAlert: busAlert, busDispatch: busDispatch, compose: function (sim, key) { var a = sim.byKey[key]; if (!a) return null; if (!a.zoneLevel) a.zoneLevel = zoneLevelFor(sim, a); return composeFor(sim, a); },
    routeCheck: routeCheck, cap: capXml, ab: ab, sweep: sweep, dispatchCompare: dispatchCompare, personRoute: function (sim, key) { var a = sim.byKey[key]; return a && sim.rt.ready ? personRoute(sim, a) : null; },
    person: function (sim, key) { var a = sim.byKey[key]; return a ? snapPerson(sim, a, true) : null; },
    sensors: function (sim) { return sim.sensors.map(function (c) { return { id: c.id, key: c.key, group: c.group, zone: c.zone, value: c.value, unit: c.unit, active: c.active, alarm: c.alarm, label: c.label, thrActive: c.thrActive }; }); },
    model: { alexWind: alexWind, alexBurn: alexBurn },
    traffic: { makeRoadGraph: makeRoadGraph, roadTravel: roadTravel, roadDistance: roadDistance, pickUnit: pickUnit, congestion: congestion, segFactors: segFactors, profileAt: profileAt, ROAD_CLASS: ROAD_CLASS, PROFILE: TRAFFIC_PROFILE,
      snapshot: traffic_snapshot, pickHospital: function (sim, patients, departSec) { return pickHospital(sim, patients, departSec === undefined ? clockSec(sim) : departSec); } }
  };
  // ---- the rescue robot (section 10b)
  api.enableRobot = enableRobot; api.setRole = apiSetRole; api.deployRobot = apiDeployRobot; api.approveRobot = apiApproveRobot; api.rejectRobot = apiRejectRobot; api.recallRobot = apiRecallRobot;
  api.setSearchPriority = apiSetSearchPriority; api.teleopRobot = apiTeleop; api.speakVia = apiSpeakVia; api.setRobotObstacle = apiSetObstacle;
  api.robots = robotsList; api.robotTelemetry = function (sim, id) { var r = rbRobot(sim, id); return r ? robotTelemetry(sim, r, true) : null; };
  api.robotView = function (sim, id) { var r = rbRobot(sim, id); return r && r.state !== 'stowed' && r.state !== 'approved' && r.state !== 'deploying' ? viewOf(sim, r) : null; };
  api.busRobot = busRobot; api.busRobotFind = busRobotFind; api.robotMetrics = robotMetrics; api.abRobot = abRobot; api.sweepRobot = sweepRobot; api.robot = ROBOT_API;
  for (var k in api) out[k] = api[k];
  root.ManaraSim = out;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
