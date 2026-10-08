/* MANARA («منارة») — NATIONAL engine: the whole of Qatar  →  window.ManaraNational
 * =====================================================================================================================
 * User requirement (verbatim): "I wnat it on the whole of Qatar".  This is the pure, seeded, deterministic engine behind Mission Control's national
 * view, the residents' "nearby facilities" card and the national KPIs.  No DOM, no network, no libraries; a classic script that attaches to
 * globalThis / self / window, so it loads from file:// and in Node (`vm`).  Load order in a page (the engine resolves the data when you call create()):
 *     <script src="data/qatar-geo.js" defer></script> <script src="data/qatar-facilities.js" defer></script> <script src="data/qatar-roads.js" defer></script>
 *     <script src="js/national.js" defer></script>
 *     Node:  const ctx = vm.createContext({});  for (const f of [geo, facilities, roads, 'national.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);  const N = ctx.ManaraNational;
 *
 * WHAT IS REAL AND WHAT IS SIMULATED (say it on screen)
 *   REAL (a SNAPSHOT of OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0; see data/CREDITS.txt, docs/MANARA-DATA.md): the outline, the 8 municipalities,
 *   135 places, 138 facilities (hospitals / EDs, police, Civil Defence fire stations, ambulance points) and the major road network (23,135 nodes, 6,116 km).
 *   SIMULATED (SIM): where any vehicle is, whether a unit is busy, traffic and congestion, closures from rain, the heat / dust / rain fields, ED capacity.
 *   999 stays the dispatcher; MANARA is not an official service; nothing here tracks a real vehicle or uses a real incident.  Every tunable number is a named
 *   assumption in ManaraNational.PARAMS (default, range, unit, bilingual description, source), exactly like ManaraSim.PARAMS, for Mission Control's sliders.
 *
 * QUICK START
 *   const nat = N.create({ seed: 7, date: '2026-07-12', hour: 7.5 });        // Sunday 07:30 (the week runs Sunday–Thursday; Friday + Saturday are the weekend)
 *   const inc = N.createIncident(nat, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 });   // plan = FASTEST units given traffic, reserved
 *   N.step(nat, 60);                         // advance 60 simulated seconds (fixed ticks of nat.tick = 5 s inside; call from rAF with dt * speed)
 *   const snap = N.snapshot(nat);            // plain JSON: draw units, incidents, routes, KPIs, events
 *   N.cap(nat, inc.id)                       // OASIS CAP 1.2 XML (status Exercise)
 *   N.ab({ seed: 7, n: 150 })                // same incidents, "nearest by distance" vs "fastest given traffic" (a SIMULATION, mechanism check)
 *   N.findFartherButFaster(7)                // a REAL example on the real map where the fastest unit is NOT the nearest in a straight line
 *   N.nearestFacilities({ lon, lat, kind: 'hospital', k: 3 })     // phones: straight-line km + estimated road time
 *
 * CONVENTIONS
 *   Coordinates are lon/lat in degrees (WGS84, east / north positive).  Text is always {ar, en}.  Time t is SECONDS since 00:00 local time (UTC+3) of the
 *   start date (create({ date })), so day 5 is the Friday after a Sunday start: N.time(nat, t) → { iso, dow (0 = Sunday), dowName, weekend, dayType 'work'|'thu'|'fri'|'sat', hour, clock };
 *   N.timeAt(nat, 'YYYY-MM-DD', hour) → t.  Edges are indices into the decoded road graph (MANARA_QATAR_ROADS.decode()).  Distances are metres, ETAs seconds unless a name says min.
 *
 * PUBLIC API  (nat = the object returned by create; all functions are pure functions of (nat, arguments) or act on nat; none touches the DOM)
 *  Life cycle
 *   create(opts) → nat      opts: seed (uint32, default 1) · date 'YYYY-MM-DD' (default 2026-07-12) · hour (start clock, default 8) · day (days after date) · t (explicit start second)
 *                           · params {key: value} (overrides of PARAMS) · tickSec (default 5) · autoApprove (default true: a simulated operator approves after approveSec; false → call approve()) · data {geo, facilities, roads}
 *   restart(nat, overrides?) → a fresh nat with the same options            step(nat, dt?) → nat (dt seconds, whole ticks)          run(nat, untilT) → nat
 *   snapshot(nat, {full?, lastEvents?, routes?, kpis?}) → JSON (see SNAPSHOT)   hash(nat) → 8-hex FNV of the full snapshot (determinism tests)
 *   defaults() → {key: default}     world(nat) → static facts about the data   units(nat, t?) → every simulated unit   time(nat, t?)   timeAt(nat, iso, hour)
 *  Operator / test actions (they log events and mark the plans for re-evaluation)
 *   setParam(nat, key, value)  (false for fleet-composition parameters: use create({params}) / restart)     jamRoad(nat, edge, factor 0.05..1)   unjamRoad(nat, edge)
 *   jamArea(nat, lon, lat, radiusM, factor) → edges jammed    clearJams(nat)    closeRoad(nat, edge)   openRoad(nat, edge)   closeArea(nat, lon, lat, radiusM) → edges closed
 *   setUnitBusy(nat, unitId, true|false|null)    cordon(nat, incidentId, radiusM?)   liftCordon(nat, incidentId)
 *   setRain(nat, mmHr)   addRainCell(nat, {lon, lat, radiusKm, mmHr, headingDeg?, speedKmh?, durationSec?})   clearRain(nat)   startDust(nat, {deg?, mps?, peak?, t0?})   stopDust(nat)
 *   addPonding(nat, {lon, lat, radiusM, name?}) → a user-placed low spot that fills like an underpass
 *   edgeAt(nat, lon, lat, maxM?) → {edge, frac, distM, lon, lat, info}  (click-to-jam: snap a map click to a road)   roadInfo(nat, edge, t?) → {name, cls, kph, cong, jam, closed, tunnel, corridor, …}
 *  Incidents and dispatch
 *   createIncident(nat, {hazard: 'fire'|'gas'|'flood'|'dust'|'heat'|'sos', lon, lat, severity 1..3 (default 2), patients?: {n, need: 'ed'|'trauma'|'paed'}, label?}) → incident (registered; plan reserved)
 *   incident(nat, id) → the live incident object         approve(nat, incidentId) → bool (the human key)       cancelIncident(nat, incidentId) → bool (reject / withdraw; releases the units)
 *   dispatchNational(nat, incidentLike, t?) → plan   PURE: the recommendation for { hazard, lon, lat, severity?, patients? } at clock t; reserves nothing, changes nothing
 *   busDispatch(nat, incidentId) → the bus message (see BUS)      busAdvisory(nat) → advisory bus message      residentLines(nat, incidentId) → calm lines for phones
 *   cap(nat, incident|id, {languages?, area: 'circle'|'polygon', radiusM?, tz?}) → OASIS CAP 1.2 XML string (status Exercise, one <info> per language)
 *   route(nat, {lon, lat}, {lon, lat}, t?, {em?}) → {sec, freeSec, km, congestedSegments, top, polyline}   civilian route (em omitted) or responder route (em = 1.3); cordons block civilians
 *  Map helpers (drawing)
 *   viewport({width, height, bbox?|center?, pxPerKm?, pad?}) → {toScreen(lon, lat) → [x, y], fromScreen(x, y) → [lon, lat], zoomAt(x, y, factor) → vp, pan(dx, dy) → vp, pxPerKm, metresPerPx}
 *   haversineM  bearingDeg  compass(deg) → {key:'NE', ar, en}  offsetLL  snap(nat, lon, lat)  polyline(nat, edge) → [[lon, lat], …]  nearestPlace(nat, lon, lat) → {id, name, kind, distM}
 *   congestionMap(nat, t?) → Float32Array(edges): 1 = free flow … 0.05 = crawling, 0 = closed (colour the roads)   profileAt(dayType, hour) → pressure 0..1   PROFILES
 *  Hazard layers and KPIs  (all SIMULATED fields on a coarse lon/lat grid; arrays are shared: do not modify)
 *   fields(nat, t?) → {grid: {lon0, lat0, d, nx, ny}, land: Uint8Array, municipality: Int8Array (index into world().municipalities), wbgt (°C ESTIMATE), pm10 (µg/m³), rain (mm/h)}  cell c = iy * nx + ix, centre (lon0 + (ix + .5) d, lat0 + (iy + .5) d)
 *   heatField  dustField  rainField (same arrays)   visibility(pm10) → RELATIVE visibility index 0..1 (no numeric visibility classes are claimed)   wbgtEstimate(T, RH, sunLoadC)
 *   floodState(nat, {all?}) → {tunnels:[{edge, name, lon, lat, depthCm, closed}], ponds, closed}  (the only places that can hold water; wet or closed ones by default)
 *   heatExposure(nat, t?) → [{placeId, name, wbgt, level 'ok'|'warn'|'stop', middayBan}]  ONLY the OSM-tagged industrial / port places (no worker counts)    middayBan(nat, t?) → bool
 *   kpis(nat, t?) → { incidents, units, meanFirstEtaSec, traffic, hazards, municipalities, advisories }  (see KPIS)       municipalities(nat, t?)    advisories(nat, t?) → [{key, params, level, hazard, muni, text}]
 *   renderMsg(key, params, lang?) → text from N.MSG
 *  Phones
 *   nearestFacilities({lon, lat, kind: 'hospital'|'ed'|'police'|'fire'|'ambulance'|'any', k = 3, t?, nat?, edOnly?, sort: 'road'|'straight'}) → [{id, kind, name {ar, en}, lon, lat, ed, edNote, straightKm,
 *     bearingDeg, bearing {key, ar, en}, roadMinFree, roadMinNow, delayPct, call {key: 'nat.call999', text}, credit, sim:true}]   (builds a default engine from the bundled data when nat is omitted; 'ed' = verified ED only)
 *  Comparison and demonstration
 *   ab({seed, n = 150, hazards?, hour?|t?, params?, roadBaseline = true}) → { label, firstResponderEtaSec {ordinary, manara, roadNearest} (each {n, mean, p10…p99, max}), savedSec {all, whereChoiceDiffers}, differs {incidentsPct,
 *     unitChoicesPct, farButFasterChoicesPct}, byKind, assumptions, notes, hash }     sensitivity({seed, n, loads, busy}) → rows over the traffic multiplier × units-busy %
 *   findFartherButFaster(seed, {times?, budget?, kinds?}) → { incident, kind, t, clock, dowName, fastest {unitId, name, etaSec, freeFlowEtaSec, roadKm, straightKm, congestedSegments, route}, nearest {…}, gainSec, extraStraightKm,
 *     reason 'traffic'|'network', trafficAloneFlipsOrder, why {ar, en} }     sampler(nat, seed) → i → {lon, lat, src}
 *  Constants: VERSION, SIM_LABEL, PARAMS, PARAM_GROUPS, MSG, HAZARDS, HAZARD_NAME, KIND_NAME, REQUIRED, DOW_NAMES.   N.testing = low-level helpers for tests (graph, cost, tree, pickFor, evalPolicies …).
 *
 * DISPATCH  (docs/MANARA-SPEC.md "Nearest-responder dispatch" — the unit that reaches the scene FASTEST given traffic, not the nearest by distance)
 *   Required types per hazard: fire → fire (+ a second at severity 3) + ambulance + police (+ rescue from severity 2) · gas → fire/HazMat (×2 at severity 3) + ambulance + police · flood → rescue + police + ambulance ·
 *   dust → police + ambulance (standby) · heat → ambulance (+ the destination hospital; cooling support is a note) · sos → ambulance + the destination hospital.  'rescue' = a Civil Defence / fire-station unit.
 *   ONE reverse Dijkstra from the incident over the congested graph gives the travel time from every node to the scene; it serves every unit type (same cost function), a FORWARD Dijkstra from the scene prices the hospitals.
 *   Segment cost = length / (free-flow speed × emergency bonus × congestion(segment, time)).  The best P.rankTopK candidates per type are re-timed exactly with the clock running along the route.
 *   ETA = turn-out (+ access leg from the station to its road) + drive + the leg from the road to the incident.  Chosen = the minimum ETA among AVAILABLE units (busy ones are skipped and the text says so); the runner-up, the nearest in a straight
 *   line and their numbers are returned for contrast.  Hospitals: the fastest-to-reach hospital with an emergency department by capability flag from the data (ed 'yes' only — 'unknown' is excluded unless P.edUnknownMode = 1, then flagged
 *   "assumed"; restricted, obstetric-only and paediatric-only entries never take general patients; trauma needs the Level I entry, paediatric needs a paediatric ED) with a labelled capacity assumption (edCapacity, edOccupancyPct).
 *   Plan (also in snapshot().incidents[].plan):
 *     { id:'D-N1', incident, state:'recommended'|'approved'|'dispatched'|'en-route'|'on-scene'|'cleared', origin:'manara', scope:'national', hazard, severity, sim:true,
 *       scene:{lon, lat, edge, frac, roadLon, roadLat, snapM}, t:{recommended, approved, dispatched, 'en-route', 'on-scene', cleared} (simulation seconds), patients:{n, need}, notes:[{ar,en}],
 *       units:[{ slot:'fire#1', kind:'fire'|'rescue'|'ambulance'|'police', unitId, name:{ar,en}, state, optional, standby, flags, etaSec, etaMin, distM (road metres), pos:{lon,lat}, route:[[lon,lat]…] (remaining path, ≤ 200 points),
 *               why:{ar,en}, whyData:{ chosen:{id, etaSec, roadM, straightM, congestedSegments, delaySec, top:[{edge, name, delaySec, cong}]}, runnerUp, nearestByStraight, farButFaster, gainSec, extraStraightM, extraRoadM,
 *               reason:'traffic'|'network'|null, trafficDeltaSec, networkDeltaSec, skippedBusy:[ids], cutOff:[ids], nearestBusy? }, runnerUp:{unitId, name, etaSec, distM}, nearestByStraight:{unitId, name, straightM, etaSec},
 *               reroutes, replaced:[{unitId, t, reason}], states:{recommended: t, …}, unreachable }],
 *       hospital:{ id, name, etaSec, etaMin, distM, lon, lat, fits, freeSlots, ed:'yes'|'unknown', edNote:{ar,en}, assumed, route, why:{ar,en}, options:[…] } | null }
 *   State machine: recommended → (operator approves, or after P.approveSec in autoApprove mode) approved → (P.acceptSec: the control room accepts; 999 stays the dispatcher) dispatched → (after the unit's turn-out) en-route →
 *   on-scene → (after P.onSceneSec) cleared; the vehicle then drives home and becomes available again.  ETA counts down every tick and is re-timed every P.recheckSec.
 *   Automatic RE-ROUTING: an en-route unit takes another route when it saves ≥ P.rerouteGainSec or when a road ahead closes (event 'reroute-unit').
 *   Automatic RE-DISPATCH: a unit that becomes busy / is diverted, whose road is cut, or whom another unit now beats by ≥ P.redispatchMarginSec is replaced (event 'redispatch' {kind, from, to, reason 'busy'|'blocked'|'faster', gainSec});
 *   before approval the whole recommendation is refreshed instead (event 'recommendation-change').  A cool-down (P.cooldownSec) prevents flapping.  Units assigned to one incident are busy for every other.
 *
 * BUS MESSAGES  (compatible with docs/MANARA.md; the Manara.link bus carries them)
 *   busDispatch(nat, id) → { type:'dispatch', scope:'national', id, state, origin:'manara', scene:{node:'NAT', lon, lat}, incident:{id, hazard, muni, place:{ar,en}|null},
 *       units:[{ kind, name:{ar,en}, etaMin, status, why:{ar,en} }], hospital:{ name, etaMin } | null, sim:true }       (the sim.js shape; scene.x/y are replaced by lon/lat and `scope:'national'` tells readers which)
 *   busAdvisory(nat) → { type:'advisory', scope:'national', id, clock, items:[{ key, params, level:'info'|'watch'|'warning'|'danger', hazard:'heat'|'dust'|'flood'|'traffic', muni: id|null, text:{ar,en} }], sim:true }
 *
 * MESSAGE KEYS  (MANARA_MSG-compatible; N.MSG holds the default {ar, en} text with {placeholders}; the integration agent may copy them into messages.js)
 *   nat.sim  nat.call999  nat.credit  nat.adv.heat.warn {muni, wbgt}  nat.adv.heat.stop {muni, wbgt, limit}  nat.adv.heat.ban {from, to}  nat.adv.dust.warn|danger|critical {muni, pm10}  nat.adv.flood.watch {muni, mm}
 *   nat.adv.flood.underpass {n}  nat.adv.traffic.heavy  nat.unit.state.<state>  nat.resident.eta {unit, min}  nat.resident.eta.ambulance  nat.resident.onscene {unit}.   params.muni is a municipality NAME object {ar, en}.
 *
 * EVENTS  (nat.events[i] = {t, clock, type, text:{ar,en}, …fields}; nat.evCount[type] counts every occurrence)
 *   incident · incident-unreachable · dispatch-recommended · far-but-faster {kind, unit, gainSec, extraStraightM} · recommendation-change · dispatch-approved · dispatched · unit-en-route · unit-on-scene · unit-cleared ·
 *   incident-cleared · incident-cancelled · reroute-unit {unit, gainSec, blocked} · redispatch {kind, from, to, reason, gainSec} · dispatch-degraded · unit-busy · unit-free · road-jam · area-jam · road-closed {edge, by} ·
 *   road-open · area-closed · underpasses-closed {n} · underpasses-reopened {n} · cordon · cordon-lifted · rain-cell · dust-front · ponding-point
 *
 * SNAPSHOT  { v, scope:'national', label (SIM), version, seed, t, clock, date, dow, dowName, weekend, dayType, hour, attribution, snapshotDate, build,
 *   traffic:{load, jams, closed, cordons, pressure}, units:[{id, kind, name, lon, lat, state:'idle'|'turnout'|'en-route'|'on-scene'|'returning', assigned, busy, base:{lon, lat}, role, flags}],
 *   incidents:[{id, hazard, lon, lat, severity, sev (0..1 growth), radiusM, status, muni, place:{id, name, distKm}, patients, tStart, tCleared, firstEtaSec, cordonM, plan}], closedEdges:[{edge, by}], dust:{on, t0, deg, mps, frontKm}, rain:{mmHr, cells:[{id, lon, lat, radiusKm, mmHr}]}, evCount, stats, kpis, events }
 *  KPIS  { t, clock, date, dowName, weekend, incidents:{total, active, byHazard, byStatus}, units:{total, available, busy, enRoute, onScene, returning, byKind}, meanFirstEtaSec, meanFirstEtaActiveSec,
 *   traffic:{load, meanSpeedRatio, pressure, jammedEdges, closedEdges, cordons, redispatches, reroutes}, hazards:{heat:{wbgtMax, level, middayBan}, dust:{on, pm10Max, frontKm}, flood:{rainMmHr, rainCells, rainMax, tunnelsClosed, maxDepthCm}},
 *   municipalities:[{id, name, wbgtMax, wbgtMean, pm10Max, rainMax, cells, incidents, unitsBased, unitsAvailable, unitsBusy, unitsEnRoute, heat, dust, level:'normal'|'watch'|'warning'|'danger'}], advisories }
 *
 * THE SIMULATED MODELS  (every number is a PARAMS entry unless it is a published value with a source id from docs/MANARA-SOURCES.md)
 *   TRAFFIC  congestion = (1 − loss) × noise × operator jam × incident slow-down × weather × cordon, clamped to [0.05, 1];  loss = pressure(day type, hour) × class sensitivity × (urban depth × u + rural depth × (1 − u)) [+ named-corridor term]
 *     [+ industrial term] [+ commuter tide], × the global multiplier.  u (0..1) comes from the data: the Greater-Doha / town places (by kind) and the density of major junctions.  Day types: Sunday–Wednesday ('work'), Thursday, Friday
 *     (quiet morning, a prayer lull about 11:15–13:15, a leisure evening) and Saturday.  The shapes are ASSUMPTIONS informed by a Qatar University 318-intersection study (peaks 06:30–08:30, 12:30–14:30, 17:15–19:15; Thursday–Saturday differ)
 *     — found by web search, abstract not opened: secondary, unverified.  Friday is the statutory weekly rest day (The Peninsula 27 Mar 2017 and Labour Law summaries: secondary); Friday + Saturday as the weekend of government, schools and many employers is widely reported (secondary web results, no primary page opened).
 *     Named corridors (Corniche, Salwa Road, ring roads, industrial-area roads) are matched on the OSM NAMES in the data, only where they exist; their congestion is simulated.  Free-flow speed: OSM maxspeed or a labelled class default.
 *   FLEET    one unit per station (P.unitsPerStation) generated from the real facilities: fire = Civil Defence / fire stations (the directorate office is excluded; an HQ complex with a station and industrial stations are switchable),
 *     police = stations / traffic / unknown (administrative and training sites switchable), ambulance = the OSM ambulance points + hospitals with a verified ED (P.ambulanceBasing).  Busy = a seeded draw per unit and period (P.unitBusyPct).
 *   HEAT     WBGT ESTIMATE per cell: seasonal cosine through two secondary monthly means (Doha, Climate-Zone 1991–2020) + diurnal curve + sea-breeze gradient + urban bump; humidity swings around P.heatRhPct (sources disagree 46–65 % in July);
 *     Stull (2011) wet bulb and 0.7 Tnwb + 0.2 Tg + 0.1 Tdb with a sun load (S70, S53).  Published thresholds: warn 28 °C (S52), stop-all-work 32.1 °C (S19), outdoor work banned 10:00–15:30 from 1 June to 15 September (S18).
 *   DUST     a shamal-style front: NW wind by default (shamal = north-westerly; a published "shamal day" is flow above 8.75 m/s for ≥ 3 h), advancing at P.dustFrontFactor × the wind speed; PM10 ramps up behind the front;
 *     thresholds 150 (Qatar standard, S31), 255 and 425 (EPA bands, S49); the 2015 storm exceeded 7,000 µg/m³ in Doha (S30).  Visibility is a RELATIVE index.
 *   FLOOD    rain (national rate + moving rain cells) fills the real tunnels / underpasses of the road data (flag 1) at P.underpassCatchment cm per mm, drained by pumps; a tunnel closes at P.roadCloseCm (30 cm, S55) and re-opens at
 *     P.roadOpenCm.  THERE IS NO ELEVATION MODEL: depth exists only at tunnels / underpasses and at user-placed ponding points — each tunnel gets a seeded sump factor so they do not all close together.
 *   INCIDENTS point incidents anywhere on land (snapped to the nearest road); severity grows toward its maximum (fire / gas time constants) and shrinks after the first engine sets up on scene; radiusM drives the traffic slow-down and the CAP circle.
 *
 * KNOWN LIMITATIONS THAT AFFECT THE ENGINE (see docs/MANARA-DATA.md §8)
 *   OSM has 20 usable fire stations (the official count is 23 centres), 26 usable police posts and only 3 ambulance points: coverage gaps (e.g. Lusail, the desert) are gaps of the DATA, not claims about the real service.
 *   `ed` is verified for 18 entries only; hospitals' capacity is an assumption; no turn restrictions, signals or live traffic; virtual connectors (flag 256) are flagged assumptions; positions are mapper positions.
 *   A route is a simulation input, never a navigation instruction.
 * ===================================================================================================================== */
(function (root) {
  'use strict';
  /* ====================================================================================
   * 1. SMALL HELPERS, DETERMINISTIC RANDOMNESS, HEAP, GEOGRAPHY
   * ==================================================================================== */
  var VERSION = '1.0.0';
  // Local aliases: inside a vm context (Node tests) a global lookup like `Math` or `INF` is slow, and these sit in the hot loops.
  var Mth = Math, INF = Infinity, isFin = isFinite;
  var DEG = Mth.PI / 180, EARTH_R = 6371008.8, M_LAT = Mth.PI * EARTH_R / 180;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var T = function (ar, en) { return { ar: ar, en: en }; };
  var isNum = function (v) { return typeof v === 'number' && isFin(v); };
  var r1 = function (v) { return Mth.round(v * 10) / 10; };
  var r2 = function (v) { return Mth.round(v * 100) / 100; };
  var r5 = function (v) { return Mth.round(v * 1e5) / 1e5; };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function hash32(x) {
    x ^= x >>> 16; x = Mth.imul(x, 0x7feb352d); x ^= x >>> 15; x = Mth.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0;
  }
  // stateless hashed uniform random in [0,1): the SAME seed gives the SAME draw whatever else happens (common random numbers)
  function hr(seed, a, b, c) {
    var h = hash32((seed ^ 0x9e3779b9) | 0);
    h = hash32(h ^ Mth.imul(a | 0, 0x85ebca6b));
    h = hash32(h ^ Mth.imul(b | 0, 0xc2b2ae35));
    h = hash32(h ^ Mth.imul(c | 0, 0x27d4eb2f));
    return h / 4294967296;
  }
  var D = { NOISE: 31, BUSY: 32, DIVERT: 33, SAMPLE: 34, SUMP: 35, DUST: 36, RAIN: 37, MISC: 38 };
  function fnv(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Mth.imul(h, 0x01000193); } return ('00000000' + (h >>> 0).toString(16)).slice(-8); }
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Mth.floor(i), hi = Mth.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  function stats(arr) {          // {n, mean, p10, p25, p50, p75, p90, p99, max}
    var a = arr.filter(isNum).sort(function (x, y) { return x - y; }), s = 0, i;
    if (!a.length) return { n: 0, mean: null, p10: null, p25: null, p50: null, p75: null, p90: null, p99: null, max: null };
    for (i = 0; i < a.length; i++) s += a[i];
    return { n: a.length, mean: r1(s / a.length), p10: r1(percentile(a, 0.1)), p25: r1(percentile(a, 0.25)), p50: r1(percentile(a, 0.5)), p75: r1(percentile(a, 0.75)),
      p90: r1(percentile(a, 0.9)), p99: r1(percentile(a, 0.99)), max: r1(a[a.length - 1]) };
  }
  function mmss(sec) { sec = Mth.max(0, Mth.round(sec)); return Mth.floor(sec / 60) + ':' + pad2(sec % 60); }
  function hms(sec) { sec = Mth.max(0, Mth.floor(sec)); return pad2(Mth.floor(sec / 3600) % 24) + ':' + pad2(Mth.floor(sec / 60) % 60) + ':' + pad2(sec % 60); }
  function km1(m) { return (Mth.round(m / 100) / 10); }

  // Binary min-heap on (key, id), lazy deletion, typed arrays, reused between searches (no allocation in the hot loop).
  function makeHeap(cap) {
    var keys = new Float64Array(cap), ids = new Int32Array(cap), n = 0;
    return {
      clear: function () { n = 0; },
      size: function () { return n; },
      push: function (k, id) {
        if (n >= cap) return;
        var i = n++, p;
        while (i > 0) { p = (i - 1) >> 1; if (keys[p] <= k) break; keys[i] = keys[p]; ids[i] = ids[p]; i = p; }
        keys[i] = k; ids[i] = id;
      },
      popKey: 0,
      pop: function () {
        var rid = ids[0], k, id, i, l, r, m; this.popKey = keys[0];
        n--;
        if (n > 0) {
          k = keys[n]; id = ids[n]; i = 0;
          for (;;) {
            l = 2 * i + 1; if (l >= n) break;
            r = l + 1; m = (r < n && keys[r] < keys[l]) ? r : l;
            if (keys[m] >= k) break;
            keys[i] = keys[m]; ids[i] = ids[m]; i = m;
          }
          keys[i] = k; ids[i] = id;
        }
        return rid;
      }
    };
  }

  // ---- geography
  function haversineM(lon1, lat1, lon2, lat2) {
    var p1 = lat1 * DEG, p2 = lat2 * DEG, dp = p2 - p1, dl = (lon2 - lon1) * DEG;
    var a = Mth.sin(dp / 2) * Mth.sin(dp / 2) + Mth.cos(p1) * Mth.cos(p2) * Mth.sin(dl / 2) * Mth.sin(dl / 2);
    return 2 * EARTH_R * Mth.asin(Mth.min(1, Mth.sqrt(a)));
  }
  function bearingDeg(lon1, lat1, lon2, lat2) {     // initial great-circle bearing 0..360, 0 = north, 90 = east
    var p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
    var y = Mth.sin(dl) * Mth.cos(p2), x = Mth.cos(p1) * Mth.sin(p2) - Mth.sin(p1) * Mth.cos(p2) * Mth.cos(dl);
    return (Mth.atan2(y, x) / DEG + 360) % 360;
  }
  var COMPASS = [
    ['N', 'شمال', 'north'], ['NNE', 'شمال شمال شرق', 'north-north-east'], ['NE', 'شمال شرق', 'north-east'], ['ENE', 'شرق شمال شرق', 'east-north-east'],
    ['E', 'شرق', 'east'], ['ESE', 'شرق جنوب شرق', 'east-south-east'], ['SE', 'جنوب شرق', 'south-east'], ['SSE', 'جنوب جنوب شرق', 'south-south-east'],
    ['S', 'جنوب', 'south'], ['SSW', 'جنوب جنوب غرب', 'south-south-west'], ['SW', 'جنوب غرب', 'south-west'], ['WSW', 'غرب جنوب غرب', 'west-south-west'],
    ['W', 'غرب', 'west'], ['WNW', 'غرب شمال غرب', 'west-north-west'], ['NW', 'شمال غرب', 'north-west'], ['NNW', 'شمال شمال غرب', 'north-north-west']];
  function compass(deg) { var c = COMPASS[Mth.round((((deg % 360) + 360) % 360) / 22.5) % 16]; return { key: c[0], ar: c[1], en: c[2] }; }
  function offsetLL(lon, lat, dxM, dyM) { return [lon + dxM / (M_LAT * Mth.cos(lat * DEG)), lat + dyM / M_LAT]; }
  function pointInRing(x, y, ring) {                // ring: [[lon,lat],...]
    var inside = false, i, j = ring.length - 1, xi, yi, xj, yj;
    for (i = 0; i < ring.length; i++) {
      xi = ring[i][0]; yi = ring[i][1]; xj = ring[j][0]; yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      j = i;
    }
    return inside;
  }
  // a uniform bucket grid over points: nearest(lon, lat, maxM) → { i, d } or null
  function makePointGrid(xs, ys, cell) {
    var n = xs.length, minX = INF, minY = INF, maxX = -INF, maxY = -INF, i;
    for (i = 0; i < n; i++) { if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i]; if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i]; }
    var nx = Mth.max(1, Mth.ceil((maxX - minX) / cell) + 1), ny = Mth.max(1, Mth.ceil((maxY - minY) / cell) + 1);
    var start = new Int32Array(nx * ny + 1), item = new Int32Array(n), cellOf = new Int32Array(n), c;
    for (i = 0; i < n; i++) { c = Mth.floor((ys[i] - minY) / cell) * nx + Mth.floor((xs[i] - minX) / cell); cellOf[i] = c; start[c + 1]++; }
    for (c = 0; c < nx * ny; c++) start[c + 1] += start[c];
    var fill = start.slice(0, nx * ny);
    for (i = 0; i < n; i++) item[fill[cellOf[i]]++] = i;
    return {
      n: n,
      // within(lon, lat, maxM, fn): fn(i, distM) for every point closer than maxM
      within: function (lon, lat, maxM, fn) {
        var ck = Mth.cos(lat * DEG), rx = Mth.ceil(maxM / (cell * M_LAT * Mth.max(ck, 0.2))), ry = Mth.ceil(maxM / (cell * M_LAT)), cx = Mth.floor((lon - minX) / cell), cy = Mth.floor((lat - minY) / cell), x, y, k, it, d, cc;
        for (y = Mth.max(0, cy - ry); y <= Mth.min(ny - 1, cy + ry); y++) for (x = Mth.max(0, cx - rx); x <= Mth.min(nx - 1, cx + rx); x++) {
          cc = y * nx + x;
          for (k = start[cc]; k < start[cc + 1]; k++) { it = item[k]; d = Mth.sqrt(Mth.pow((xs[it] - lon) * M_LAT * ck, 2) + Mth.pow((ys[it] - lat) * M_LAT, 2)); if (d <= maxM) fn(it, d); }
        }
      },
      nearest: function (lon, lat, maxM) {
        var cx = Mth.floor((lon - minX) / cell), cy = Mth.floor((lat - minY) / cell), best = -1, bestD = INF, ring, x, y, k, it, d, ck = Mth.cos(lat * DEG);
        var maxRing = Mth.min(Mth.max(nx, ny), Mth.ceil((maxM || 1e9) / (cell * M_LAT * Mth.min(ck, 1))) + 1);
        for (ring = 0; ring <= maxRing; ring++) {
          for (y = cy - ring; y <= cy + ring; y++) {
            if (y < 0 || y >= ny) continue;
            for (x = cx - ring; x <= cx + ring; x++) {
              if (x < 0 || x >= nx) continue;
              if (ring > 0 && y !== cy - ring && y !== cy + ring && x !== cx - ring && x !== cx + ring) continue;
              c = y * nx + x;
              for (k = start[c]; k < start[c + 1]; k++) {
                it = item[k]; d = Mth.sqrt(Mth.pow((xs[it] - lon) * M_LAT * ck, 2) + Mth.pow((ys[it] - lat) * M_LAT, 2));
                if (d < bestD) { bestD = d; best = it; }
              }
            }
          }
          if (best >= 0 && bestD <= ring * cell * M_LAT * Mth.min(ck, 1)) break;
        }
        return best >= 0 && bestD <= (maxM || 1e18) ? { i: best, d: bestD } : null;
      }
    };
  }

  // ---- map viewport for drawing: equirectangular around the viewport centre. Pure functions, no DOM.
  //   var vp = N.viewport({ width, height, bbox:{lonMin,latMin,lonMax,latMax} | center:{lon,lat}, pxPerKm, pad });
  //   vp.toScreen(lon, lat) → [x, y]     vp.fromScreen(x, y) → [lon, lat]     vp.zoomAt(x, y, factor) → new vp     vp.pan(dx, dy) → new vp
  function viewport(o) {
    o = o || {};
    var w = o.width || 800, h = o.height || 600, pad = o.pad === undefined ? 16 : o.pad, c, ppk;
    if (o.center) { c = { lon: o.center.lon, lat: o.center.lat }; ppk = o.pxPerKm || 4; }
    else {
      var b = o.bbox || { lonMin: 50.7325, latMin: 24.47075, lonMax: 51.6607, latMax: 26.18295 };
      c = { lon: (b.lonMin + b.lonMax) / 2, lat: (b.latMin + b.latMax) / 2 };
      var wk = (b.lonMax - b.lonMin) * M_LAT * Mth.cos(c.lat * DEG) / 1000, hk = (b.latMax - b.latMin) * M_LAT / 1000;
      ppk = o.pxPerKm || Mth.min((w - 2 * pad) / wk, (h - 2 * pad) / hk);
    }
    var kLat = ppk * M_LAT / 1000, kLon = kLat * Mth.cos(c.lat * DEG), vp = { width: w, height: h, center: c, pxPerKm: ppk, pad: pad };
    vp.toScreen = function (lon, lat) { return [w / 2 + (lon - c.lon) * kLon, h / 2 - (lat - c.lat) * kLat]; };
    vp.fromScreen = function (x, y) { return [c.lon + (x - w / 2) / kLon, c.lat - (y - h / 2) / kLat]; };
    vp.zoomAt = function (x, y, f) {   // keep the geographic point under (x, y) fixed
      var p = vp.fromScreen(x, y), nppk = clamp(ppk * f, 0.05, 400), nk = nppk * M_LAT / 1000, nlat = p[1] + (y - h / 2) / nk, nkLon = nk * Mth.cos(nlat * DEG);
      return viewport({ width: w, height: h, pad: pad, pxPerKm: nppk, center: { lon: p[0] - (x - w / 2) / nkLon, lat: nlat } });
    };
    vp.pan = function (dx, dy) { return viewport({ width: w, height: h, pad: pad, pxPerKm: ppk, center: { lon: c.lon - dx / kLon, lat: c.lat + dy / kLat } }); };
    vp.metresPerPx = 1000 / ppk;
    return vp;
  }

  /* ====================================================================================
   * 2. CALENDAR  (Qatar: weekend = Friday + Saturday; work week Sunday–Thursday)
   *    t = seconds since 00:00 local time (UTC+3, no daylight saving) of the simulation's start date.
   * ==================================================================================== */
  var DOW_NAMES = [T('الأحد', 'Sunday'), T('الاثنين', 'Monday'), T('الثلاثاء', 'Tuesday'), T('الأربعاء', 'Wednesday'), T('الخميس', 'Thursday'), T('الجمعة', 'Friday'), T('السبت', 'Saturday')];
  var DEFAULT_DATE = '2026-07-12';      // a Sunday in the summer midday-ban season (docs/MANARA-QATAR.md, S18)
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(DEFAULT_DATE); return { y: +m[1], m: +m[2], d: +m[3] }; }
  var dateCache = {};
  function dateOfDay(start, dayIdx) {     // → { iso, y, m, d, dow (0 = Sunday), doy }
    var key = start.y + '-' + start.m + '-' + start.d + '+' + dayIdx;
    if (dateCache[key]) return dateCache[key];
    var ms = Date.UTC(start.y, start.m - 1, start.d + dayIdx), dt = new Date(ms), y = dt.getUTCFullYear();
    var doy = Mth.round((ms - Date.UTC(y, 0, 1)) / 86400000) + 1;
    var o = { iso: y + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate()), y: y, m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), dow: dt.getUTCDay(), doy: doy };
    if (Object.keys(dateCache).length > 400) dateCache = {};
    return (dateCache[key] = o);
  }
  // 'work' = Sunday–Wednesday, 'thu' = Thursday (the evening before the weekend), 'fri', 'sat'
  function dayTypeOf(dow) { return dow === 5 ? 'fri' : dow === 6 ? 'sat' : dow === 4 ? 'thu' : 'work'; }
  function clockInfo(start, t) {
    var dayIdx = Mth.floor(t / 86400), sec = t - dayIdx * 86400, dd = dateOfDay(start, dayIdx), hour = sec / 3600;
    return { dayIdx: dayIdx, sec: sec, hour: hour, hh: Mth.floor(hour), mm: Mth.floor(sec / 60) % 60, ss: Mth.floor(sec) % 60, iso: dd.iso, y: dd.y, m: dd.m, d: dd.d, dow: dd.dow, doy: dd.doy,
      dowName: DOW_NAMES[dd.dow], weekend: dd.dow === 5 || dd.dow === 6, dayType: dayTypeOf(dd.dow), clock: hms(sec) };
  }
  // The official outdoor-work ban: 10:00–15:30, 1 June to 15 September (Ministerial Decision 17 of 2021; docs/MANARA-SOURCES.md S18)
  function inMiddayBan(ci) {
    var inSeason = (ci.m > 6 && ci.m < 9) || (ci.m === 6) || (ci.m === 9 && ci.d <= 15);
    return inSeason && ci.hour >= 10 && ci.hour < 15.5;
  }

  /* ====================================================================================
   * 3. ASSUMPTIONS REGISTRY  (every tunable number is a named parameter with a bilingual description)
   *    Everything here is a SIMULATION assumption unless `src` names a source id of docs/MANARA-SOURCES.md or a URL.
   * ==================================================================================== */
  var PARAM_GROUPS = [
    { id: 'traffic',  label: T('حركة المرور (محاكاة)', 'Traffic (simulated)') },
    { id: 'fleet',    label: T('الوحدات (محاكاة)', 'Fleet (simulated)') },
    { id: 'dispatch', label: T('الاستجابة والإرسال', 'Dispatch & responders') },
    { id: 'incident', label: T('الحوادث', 'Incidents') },
    { id: 'heat',     label: T('الحرارة (محاكاة)', 'Heat (simulated)') },
    { id: 'dust',     label: T('الغبار (محاكاة)', 'Dust (simulated)') },
    { id: 'flood',    label: T('السيول (محاكاة)', 'Flood (simulated)') },
    { id: 'ab',       label: T('المقارنة', 'A/B comparison') }
  ];
  var PARAM_DEFS = [];
  var AT_START = { unitsPerStation: 1, ambulanceBasing: 1, fireIncludeHq: 1, industrialFire: 1, policeIncludeAdmin: 1, hazmatAllStations: 1 };   // fleet composition: change with create({params}) / restart
  function def(key, group, v, min, max, step, unit, lab, desc, src) {
    PARAM_DEFS.push({ key: key, group: group, default: v, min: min, max: max, step: step, unit: unit, label: T(lab[0], lab[1]), desc: T(desc[0], desc[1]), src: src || 'assumption', live: !AT_START[key] });
  }
  // ---- traffic
  def('trafficLoad', 'traffic', 1.0, 0, 2, 0.1, '×', ['مضاعِف حركة المرور (وطني)', 'Global traffic multiplier'],
    ['0 = طرق حرّة، 1 = المنحنى اليومي المفترض، 2 = ازدحام مضاعف (محاكاة).', '0 = free-flowing roads, 1 = the assumed daily profile, 2 = doubled congestion (simulated).']);
  def('peakDepthUrban', 'traffic', 0.55, 0.1, 0.9, 0.05, 'fraction', ['خسارة السرعة في قلب المدينة', 'Peak speed loss in the urban core'],
    ['أكبر نسبة تباطؤ في ذروة اليوم داخل المناطق العمرانية للطرق الأكثر حساسية (افتراض؛ العمران يُستنتج من كثافة الطرق ومواقع المدن في البيانات).', 'Largest speed loss at the daily peak inside built-up areas, for the most sensitive road classes (assumption; "built-up" is inferred from road density and the places in the data).']);
  def('peakDepthRural', 'traffic', 0.12, 0, 0.6, 0.02, 'fraction', ['خسارة السرعة على الطرق السريعة', 'Peak speed loss on rural highways'],
    ['أكبر نسبة تباطؤ في الذروة خارج العمران (افتراض).', 'Largest speed loss at the peak outside built-up areas (assumption).']);
  def('tidalDepth', 'traffic', 0.15, 0, 0.5, 0.05, 'fraction', ['تدفق التنقل الصباحي/المسائي', 'Commuter tidal flow'],
    ['تباطؤ إضافي في اتجاه المركز العمراني صباحاً وفي اتجاه الخروج مساءً في أيام العمل (افتراض).', 'Extra slow-down towards the built-up core in the morning and away from it in the evening on work days (assumption).']);
  def('corridorDepth', 'traffic', 0.15, 0, 0.5, 0.05, 'fraction', ['تباطؤ المحاور المسمّاة', 'Named arterial corridors'],
    ['تباطؤ إضافي على الطرق التي تحمل في بيانات OSM أسماء الكورنيش والدوائر والمنطقة الصناعية وسلوى — فقط حيث تُوجد هذه الأسماء في البيانات (مستوى الازدحام محاكى وليس مقيساً).', 'Extra slow-down on roads that carry the names Corniche / Ring / Industrial / Salwa in the OSM data — only where those names exist in the data (the congestion level is simulated, not measured).']);
  def('industrialDepth', 'traffic', 0.2, 0, 0.6, 0.05, 'fraction', ['حركة الشاحنات قرب المناطق الصناعية', 'Heavy traffic near industrial areas'],
    ['تباطؤ نهاري قرب المناطق الصناعية (أماكنها من بيانات OSM) في ساعات العمل (افتراض).', 'Daytime slow-down near industrial areas (their places come from the OSM data) during working hours (assumption).']);
  def('noisePct', 'traffic', 8, 0, 30, 1, '%', ['عشوائية الطرق', 'Per-segment random variation'],
    ['تباين عشوائي ثابت لكل قطعة طريق (ببذرة)، يتبدّل كل ربع ساعة (افتراض).', 'A seeded random speed loss per road segment that changes every 15 minutes (assumption).']);
  def('emergencyFactor', 'traffic', 1.3, 1, 1.8, 0.05, '×', ['أفضلية مركبات الطوارئ', 'Emergency-vehicle speed bonus'],
    ['كم مرة تسير مركبات الاستجابة أسرع من حركة المرور العادية (بحدّ أقصى 130 كم/س) (افتراض).', 'How much faster responders drive than ordinary traffic (capped at 130 km/h) (assumption).']);
  def('incidentSlowPct', 'traffic', 30, 0, 80, 5, '%', ['تباطؤ الطرق قرب الحادث', 'Slow-down near an incident'],
    ['نسبة تباطؤ الطرق المحيطة بحادث نشط (فضوليون، تحويلات) (افتراض).', 'Speed loss on the roads around an active incident (onlookers, diversions) (assumption).']);
  def('cordonSlowPct', 'traffic', 40, 0, 90, 5, '%', ['تباطؤ الطرق داخل الطوق', 'Slow-down inside a cordon'],
    ['الطوق الأمني حول الحادث يُغلق الطرق أمام المدنيين (هواتف السكان) ويُبطئ مركبات الطوارئ بهذه النسبة (افتراض).', 'A police cordon around an incident closes the roads to civilians (residents\' phones) and slows emergency vehicles by this much (assumption).']);
  def('rainSlowPer10mm', 'traffic', 3, 0, 10, 0.5, '%/(10 mm/h)', ['أثر المطر على السرعة', 'Rain slow-down'],
    ['تباطؤ لكل 10 مم/س من المطر، بسقف 35% (افتراض).', 'Speed loss per 10 mm/h of rain, capped at 35 % (assumption).']);
  def('dustSlowMax', 'traffic', 45, 0, 80, 5, '%', ['أثر الغبار على السرعة', 'Dust slow-down at full storm'],
    ['أقصى تباطؤ للمركبات في قلب العاصفة الغبارية (افتراض).', 'Largest speed loss inside the core of a dust storm (assumption).']);
  def('costBucketSec', 'traffic', 30, 5, 300, 5, 's', ['دقة زمن الازدحام', 'Congestion time bucket'],
    ['تُعاد حسابات كلفة الطرق كل هذه الثواني (دقة مقابل سرعة).', 'The road costs are recomputed every this many seconds (accuracy versus speed).']);
  // ---- fleet
  def('unitBusyPct', 'fleet', 10, 0, 100, 5, '%', ['وحدات مشغولة عشوائياً', 'Units randomly busy'],
    ['نسبة الوحدات المشغولة بمهام أخرى في أي وقت؛ تُعاد الدورة كل فترة (افتراض — لا توجد بيانات عن توفّر الوحدات الحقيقية).', 'Share of units tied up with other calls at any time; re-drawn every period (assumption — there are no data on real unit availability).']);
  def('busyBlockMin', 'fleet', 20, 5, 120, 5, 'min', ['مدة دورة الانشغال', 'Busy-status period'],
    ['كل هذه الدقائق يُعاد سحب حالة الانشغال لكل وحدة (افتراض).', 'Every this many minutes each unit\'s busy status is re-drawn (assumption).']);
  def('divertPctPerHour', 'fleet', 0, 0, 50, 1, '%/h', ['تحويل وحدة في الطريق', 'Diverted en-route units'],
    ['احتمال في الساعة أن تُحوَّل وحدة في الطريق إلى نداء أعلى أولوية، فيُعاد إرسال غيرها (افتراض؛ 0 = لا يحدث).', 'Chance per hour that an en-route unit is diverted to a higher-priority call, which triggers a re-dispatch (assumption; 0 = never).']);
  def('unitsPerStation', 'fleet', 1, 1, 4, 1, 'units', ['مركبات في كل مركز', 'Vehicles per station'],
    ['عدد وحدات الاستجابة المحاكاة في كل مركز/مستشفى (عدد المركبات الحقيقي غير معروف) (افتراض).', 'Simulated response units per station / hospital (the real number of vehicles is unknown) (assumption).']);
  def('ambulanceBasing', 'fleet', 1, 0, 2, 1, '0/1/2', ['أين تتمركز سيارات الإسعاف', 'Where ambulances are based'],
    ['0 = نقاط الإسعاف في OSM فقط (3)، 1 = ومعها المستشفيات التي فيها طوارئ مؤكدة (افتراضي)، 2 = ومعها مستشفيات «طوارئ غير معروفة» من نوع مستشفى. شبكة الإسعاف الحقيقية غير مرسومة في OSM (افتراض).', '0 = only the OSM ambulance points (3), 1 = plus hospitals with a verified ED (default), 2 = plus "ED unknown" hospitals of type hospital. The real ambulance network is not mapped in OSM (assumption).']);
  def('fireIncludeHq', 'fleet', 1, 0, 1, 1, '0/1', ['مجمّعات الدفاع المدني', 'Civil Defence headquarters complexes'],
    ['1 = يُعدّ مجمّع قيادة الدفاع المدني الذي يضم مركز إطفاء مركزاً عاملاً (المكتب الإداري يُستبعد دائماً) (افتراض).', '1 = a Civil Defence HQ complex that hosts a fire station counts as an operating station (the administrative directorate office is always excluded) (assumption).']);
  def('industrialFire', 'fleet', 1, 0, 1, 1, '0/1', ['مراكز الإطفاء الصناعية', 'Industrial fire stations'],
    ['1 = تُحتسب مراكز الإطفاء التابعة للمشغّل الصناعي (رأس لفان) كوحدات مساندة (افتراض).', '1 = fire stations of an industrial operator (Ras Laffan) count as mutual-aid units (assumption).']);
  def('policeIncludeAdmin', 'fleet', 0, 0, 1, 1, '0/1', ['إدارات وتدريب الشرطة', 'Police departments / training sites'],
    ['1 = تُحتسب مواقع الشرطة الإدارية والتدريبية كوحدات استجابة (افتراضياً لا).', '1 = administrative and training police sites count as response units (default: no).']);
  def('hazmatAllStations', 'fleet', 1, 0, 1, 1, '0/1', ['قدرة المواد الخطرة', 'HazMat capability'],
    ['1 = كل مراكز الإطفاء قادرة على الغاز/المواد الخطرة. قدرات المراكز الحقيقية غير موجودة في البيانات (افتراض).', '1 = every fire station can handle gas / hazmat. Real station capabilities are not in the data (assumption).']);
  // ---- dispatch
  def('turnoutFireSec', 'dispatch', 60, 0, 300, 10, 's', ['جاهزية الإطفاء', 'Fire crew turn-out'], ['الثواني بين الإرسال وانطلاق مركبة الإطفاء (افتراض).', 'Seconds between dispatch and the fire engine rolling (assumption).']);
  def('turnoutAmbSec', 'dispatch', 45, 0, 300, 5, 's', ['جاهزية الإسعاف', 'Ambulance turn-out'], ['الثواني بين الإرسال وانطلاق سيارة الإسعاف (افتراض).', 'Seconds between dispatch and the ambulance rolling (assumption).']);
  def('turnoutPoliceSec', 'dispatch', 90, 0, 300, 10, 's', ['جاهزية الشرطة', 'Police turn-out'], ['الثواني بين الإرسال وانطلاق دورية الشرطة (افتراض).', 'Seconds between dispatch and the police patrol rolling (assumption).']);
  def('approveSec', 'dispatch', 20, 0, 300, 5, 's', ['زمن موافقة المشغّل', 'Operator approval time'], ['في الوضع الآلي: ثوانٍ حتى «يوافق» المشغّل المحاكى على التوصية (افتراض).', 'In automatic mode: seconds until the simulated operator approves the recommendation (assumption).']);
  def('acceptSec', 'dispatch', 10, 0, 120, 5, 's', ['قبول غرفة التحكم', 'Control-room acceptance'], ['الثواني التي تحتاجها غرفة التحكم (999 تبقى المُرسِل) لقبول الحزمة المتحقَّق منها (افتراض).', 'Seconds the control room (999 stays the dispatcher) takes to accept the verified package (assumption).']);
  def('onSceneSec', 'dispatch', 900, 120, 7200, 60, 's', ['مدة بقاء الوحدة', 'Time a unit stays on scene'], ['الثواني التي تبقى فيها الوحدة قبل أن تُعلَن «أُغلقت المهمة» (افتراض).', 'Seconds a unit stays before it is marked "cleared" (assumption).']);
  def('redispatchMarginSec', 'dispatch', 30, 5, 300, 5, 's', ['هامش إعادة الإرسال', 'Re-dispatch margin'], ['تُبدَّل الوحدة إذا كانت أخرى أسرع منها بهذا القدر على الأقل.', 'A unit is swapped when another is faster by at least this much.']);
  def('rerouteGainSec', 'dispatch', 10, 2, 300, 2, 's', ['مكسب تغيير المسار', 'Re-route gain'], ['يتغيّر مسار المركبة في الطريق إذا وفّر مسار آخر هذا القدر على الأقل.', 'A vehicle changes route when another route saves at least this much.']);
  def('cooldownSec', 'dispatch', 120, 0, 900, 10, 's', ['فترة تهدئة بعد التبديل', 'Cool-down after a swap'], ['بعد تبديل وحدة لا يُعاد التبديل لهذا النوع قبل مرور هذه الثواني (يمنع التذبذب).', 'After a swap no further swap for that unit type happens for this many seconds (prevents flapping).']);
  def('recheckSec', 'dispatch', 30, 5, 300, 5, 's', ['دورة إعادة التقييم', 'Re-evaluation period'], ['كل هذه الثواني تُعاد دراسة الخطط النشطة: مسار الوحدات، وهل تغيّر الأسرع (افتراض هندسي).', 'Every this many seconds each active plan is re-examined: unit routes, and whether the fastest unit has changed (engineering choice).']);
  def('contraflowKph', 'dispatch', 20, 0, 40, 5, 'km/h', ['القيادة عكس اتجاه الطريق (طوارئ)', 'Contraflow speed for responders'],
    ['سرعة مركبات الطوارئ عند عبور طريق ذي اتجاه واحد عكس اتجاهه (قطع قصيرة، ولا على الطرق السريعة أو المنحدرات أو الأنفاق)؛ لأن الاتجاه المقابل من الطريق غالباً خارج بيانات الطرق الرئيسية المضمّنة؛ 0 = ممنوع (افتراض).', 'Speed of responders on a call when they drive a short stretch of a one-way road against its direction (never on motorways, ramps or tunnels; a roundabout may be driven the short way round), because the opposite carriageway is often outside the bundled major-road extract; 0 = forbidden (assumption).']);
  def('accessKph', 'dispatch', 25, 5, 60, 5, 'km/h', ['سرعة الوصلة خارج الشبكة', 'Off-network leg speed'], ['سرعة قطع المسافة المستقيمة بين المبنى/الحادث وأقرب طريق في البيانات (افتراض).', 'Speed on the straight-line leg between a building / the incident and the nearest road in the data (assumption).']);
  def('autoCordon', 'dispatch', 1, 0, 1, 1, '0/1', ['طوق تلقائي عند وصول الشرطة', 'Automatic cordon when police arrive'],
    ['1 = عند وصول أول دورية شرطة إلى حادث حريق أو غاز أو سيول يُقام طوق حوله ويُرفع عند إغلاق الحادث (افتراض).', '1 = when the first police unit reaches a fire, gas or flood incident a cordon is set around it and lifted when the incident is cleared (assumption).']);
  def('multiUnitSeverity', 'dispatch', 3, 1, 4, 1, 'level', ['شدّة تستدعي وحدتين', 'Severity that calls two units'], ['إذا بلغت شدة الحادث هذا المستوى يُطلب مركبتان من نوعَي الإطفاء والإنقاذ (4 = أبداً) (افتراض).', 'At this incident severity two units are asked for the fire / gas types (4 = never) (assumption).']);
  def('edUnknownMode', 'dispatch', 0, 0, 1, 1, '0/1', ['مستشفيات «طوارئ غير معروفة»', 'Hospitals with "ED unknown"'], ['0 = لا تُعتبر وجهة (الافتراضي)، 1 = تُعتبر قادرة على الطوارئ مع وسم «افتراض» (حالة الطوارئ غير مؤكدة في البيانات).', '0 = not a destination (default), 1 = treated as ED-capable and flagged "assumed" (the data do not confirm an ED).']);
  def('edCapacity', 'dispatch', 8, 1, 40, 1, 'patients', ['سعة الطوارئ (افتراض)', 'ED simultaneous capacity (assumption)'], ['عدد المرضى الذين يستطيع قسم طوارئ استقبالهم معاً؛ لا توجد أرقام حقيقية للأسرّة في البيانات (افتراض).', 'How many patients one emergency department can take at once; there are no real bed numbers in the data (assumption).']);
  def('edOccupancyPct', 'dispatch', 60, 0, 100, 5, '%', ['إشغال الطوارئ (افتراض)', 'ED occupancy (assumption)'], ['نسبة السعة المشغولة قبل الحادث (افتراض).', 'Share of that capacity already taken before the incident (assumption).']);
  def('loadSec', 'dispatch', 240, 0, 900, 30, 's', ['تحميل المريض', 'Patient loading'], ['الثواني على مكان الحادث قبل أن تغادر الإسعاف إلى المستشفى (افتراض).', 'Seconds on scene before the ambulance leaves for the hospital (assumption).']);
  def('rankTopK', 'dispatch', 5, 2, 12, 1, 'units', ['المرشحون للحساب الدقيق', 'Candidates re-timed exactly'], ['عدد أفضل المرشحين لكل نوع الذين يُعاد حساب زمنهم بدقة مع تغيّر الازدحام على طول المسار (هندسي).', 'How many top candidates per type are re-timed exactly with congestion changing along the route (engineering).']);
  // ---- incidents
  def('fireGrowthMin', 'incident', 20, 2, 120, 2, 'min', ['زمن نمو الحريق', 'Fire growth time constant'], ['ثابت الزمن لنمو شدّة الحريق نحو الحدّ الأقصى (افتراض مبسّط).', 'Time constant for the fire severity growing to its maximum (simplified assumption).']);
  def('gasGrowthMin', 'incident', 10, 2, 120, 2, 'min', ['زمن نمو التسرّب', 'Gas-leak growth time constant'], ['ثابت الزمن لتوسّع تسرّب الغاز (افتراض مبسّط).', 'Time constant for the gas leak spreading (simplified assumption).']);
  def('engineSetupSec', 'incident', 120, 0, 600, 10, 's', ['تجهيز الإطفاء في الموقع', 'Fire set-up on scene'], ['الثواني بعد وصول أول مركبة إطفاء قبل أن يبدأ الحريق/التسرّب بالتراجع (افتراض).', 'Seconds after the first engine arrives before the fire / leak starts to shrink (assumption).']);
  def('engineEffectPct', 'incident', 60, 0, 100, 5, '%/10 min', ['فعالية الإطفاء', 'Suppression effect'], ['نسبة تراجع الشدّة كل 10 دقائق بعد التجهيز (افتراض).', 'Share of the severity removed per 10 minutes after set-up (assumption).']);
  // ---- heat
  def('heatRhPct', 'heat', 60, 20, 90, 5, '%', ['الرطوبة النسبية المتوسطة (مُدخل)', 'Mean relative humidity (scenario input)'],
    ['مُدخل سيناريو لا قياس: المصادر الثانوية تتباين (46–65% في يوليو). تدور القيمة حول هذا المتوسط خلال اليوم (افتراض).', 'A scenario input, not a measurement: secondary sources disagree (46–65 % in July). It swings around this mean through the day (assumption).']);
  def('heatSunLoadC', 'heat', 12, 0, 20, 1, '°C', ['حمل الشمس على الكرة السوداء', 'Sun load on the globe'],
    ['ΔTg عند الظهيرة في سماء صافية؛ 0 في الظل (MANARA-HAZARDS §8، مُدخل محاكاة).', 'ΔTg at noon under a clear sky; 0 in shade (docs/MANARA-HAZARDS.md §8, a SIM input).'], 'HAZARDS §8');
  def('heatOffsetC', 'heat', 0, -10, 8, 0.5, '°C', ['إزاحة الحرارة (سيناريو)', 'Temperature offset (scenario)'], ['تُضاف إلى منحنى الحرارة الموسمي لمحاكاة موجة حر أو برد (مُدخل).', 'Added to the seasonal temperature curve to simulate a heat wave or a cool spell (input).']);
  def('heatCoastCoolC', 'heat', 2.5, 0, 6, 0.5, '°C', ['تبريد نسيم البحر نهاراً', 'Sea-breeze daytime cooling'], ['الفرق نهاراً بين الساحل والداخل (افتراض مصنَّف؛ لا يوجد حقل حرارة حقيقي هنا).', 'Daytime coast-versus-inland difference (a labelled assumption; there is no real temperature field here).']);
  def('heatInlandKm', 'heat', 40, 10, 80, 5, 'km', ['مسافة اختفاء أثر البحر', 'Distance where the sea effect vanishes'], ['المسافة من الساحل التي ينتهي عندها تأثير النسيم (افتراض).', 'Distance from the coast at which the sea-breeze effect ends (assumption).']);
  def('heatUrbanBumpC', 'heat', 1.5, 0, 4, 0.5, '°C', ['جزيرة الحرارة العمرانية', 'Urban heat bump'], ['زيادة الحرارة في قلب المدن (افتراض).', 'Extra temperature in the built-up core (assumption).']);
  def('wbgtWarn', 'heat', 28, 20, 34, 0.5, '°C', ['عتبة التنبيه WBGT', 'WBGT warn level'], ['حد الإجراء للعمل الخفيف لمن لم يتأقلم 28 °م (OSHA، المصدر S52).', 'Action limit for light work, unacclimatised, 28 °C (OSHA, source S52).'], 'S52');
  def('wbgtStop', 'heat', 32.1, 25, 38, 0.1, '°C', ['عتبة إيقاف كل الأعمال', 'Stop-all-work level'], ['«يجب إيقاف كل الأعمال إذا ارتفع WBGT فوق 32.1» — قرار وزارة العمل في قطر (S19). هذا مؤشر مقيس؛ تقديرنا غير ذلك.', '"All work must stop if WBGT rises beyond 32.1" — Qatar\'s labour rule (S19). It is a measured index; our estimate is not the same thing.'], 'S19');
  // ---- dust
  def('dustWindDeg', 'dust', 315, 0, 359, 5, '°', ['اتجاه الرياح (من)', 'Wind direction (from)'], ['الاتجاه الذي تهبّ منه الرياح؛ 315 = شمالية غربية، وهي اتجاه الشمال (مُدخل سيناريو).', 'Direction the wind blows FROM; 315 = north-westerly, the shamal direction (scenario input).'], 'Wikipedia: Shamal');
  def('dustWindMps', 'dust', 12, 3, 25, 1, 'm/s', ['سرعة الرياح', 'Wind speed'], ['مُدخل سيناريو. يُعرَّف «يوم الشمال» في دراسة منشورة بتيار شمالي/شمالي غربي فوق 8.75 م/ث ثلاث ساعات فأكثر.', 'Scenario input. A published study defines a "shamal day" as north-to-north-westerly flow above 8.75 m/s for at least 3 hours.'], 'APS DFD 2020 abstract');
  def('dustFrontFactor', 'dust', 0.8, 0.3, 1.2, 0.05, '×', ['سرعة الجبهة نسبةً للرياح', 'Front speed / wind speed'], ['تتقدّم جبهة الغبار بهذه النسبة من سرعة الرياح (افتراض).', 'The dust front advances at this fraction of the wind speed (assumption).']);
  def('dustPeak', 'dust', 1200, 200, 7000, 100, 'µg/m³', ['ذروة PM10 (مُدخل)', 'PM10 peak (scenario input)'], ['قيمة الذروة خلف الجبهة. عاصفة أبريل 2015 تجاوزت 7000 µg/m³ في الدوحة (S30).', 'Peak behind the front. The April 2015 storm exceeded 7,000 µg/m³ in Doha (S30).'], 'S30');
  def('dustBackground', 'dust', 50, 10, 150, 10, 'µg/m³', ['PM10 قبل العاصفة (مُدخل)', 'PM10 before the storm (input)'], ['مستوى الخلفية المفترض قبل وصول الجبهة (مُدخل، وليس قياساً).', 'Assumed background level before the front arrives (an input, not a measurement).']);
  def('dustRampKm', 'dust', 12, 2, 60, 2, 'km', ['عرض الجبهة', 'Front ramp width'], ['المسافة خلف الجبهة التي يبلغ عندها الغبار ذروته (افتراض).', 'Distance behind the front over which dust rises to its peak (assumption).']);
  def('dustBodyKm', 'dust', 220, 40, 600, 10, 'km', ['سُمك جسم العاصفة', 'Storm thickness'], ['المسافة خلف الجبهة قبل أن يتلاشى الغبار (افتراض).', 'Distance behind the front before the dust fades (assumption).']);
  def('dustWarn', 'dust', 150, 50, 400, 5, 'µg/m³', ['تنبيه PM10', 'PM10 warn'], ['المعيار الوطني القطري لـ PM10 على 24 ساعة 150 µg/m³ (S31).', 'Qatar\'s national PM10 standard over 24 hours is 150 µg/m³ (S31).'], 'S31');
  def('dustDanger', 'dust', 255, 100, 600, 5, 'µg/m³', ['خطر PM10', 'PM10 danger'], ['بداية فئة «غير صحي» لدى EPA (255) (S49، بحث دولي).', 'Start of the EPA "Unhealthy" band (255) (S49, international research).'], 'S49');
  def('dustCritical', 'dust', 425, 200, 1000, 5, 'µg/m³', ['حرج PM10', 'PM10 critical'], ['بداية فئة «خطر» لدى EPA (425) (S49).', 'Start of the EPA "Hazardous" band (425) (S49).'], 'S49');
  // ---- flood
  def('rainMmHr', 'flood', 0, 0, 120, 1, 'mm/h', ['شدّة المطر الوطنية (مُدخل)', 'Nationwide rain rate (scenario input)'], ['معدل المطر المفروض على كل البلاد؛ يمكن إضافة خلايا مطر موضعية (مُدخل سيناريو، لا توقّع).', 'Rain rate applied everywhere; local rain cells can be added (scenario input, not a forecast).']);
  def('underpassCatchment', 'flood', 0.6, 0.05, 2, 0.05, 'cm per mm', ['تجميع المياه في النفق', 'Underpass catchment gain'], ['كم سنتيمتراً تتجمع في نفق الطريق لكل مليمتر مطر (افتراض؛ لا يوجد نموذج ارتفاعات رقمي، فنقاط التجمّع هي أنفاق/معابر الطرق فقط).', 'Centimetres of water gathering in a road underpass per millimetre of rain (assumption; there is no elevation model, so the only low points are the road tunnels / underpasses).']);
  def('underpassPumpCmH', 'flood', 8, 0, 30, 0.5, 'cm/h', ['ضخّ النفق', 'Underpass pumping'], ['سرعة نزح المياه من النفق (افتراض).', 'How fast the underpass is pumped dry (assumption).']);
  def('roadCloseCm', 'flood', 30, 10, 60, 1, 'cm', ['عمق إغلاق الطريق', 'Road-closing depth'], ['عمق الماء الذي يُغلق عنده النفق (30 سم يمكن أن يطفئ سيارة؛ NWS، المصدر S55، إرشاد أمريكي).', 'Water depth at which the underpass is closed (30 cm can float a car; US NWS, source S55, US guidance).'], 'S55');
  def('roadOpenCm', 'flood', 15, 0, 40, 1, 'cm', ['عمق إعادة الفتح', 'Re-opening depth'], ['يُعاد فتح النفق عندما ينزل العمق دون هذا الحد (افتراض).', 'The underpass re-opens when the depth falls below this (assumption).']);
  // ---- A/B
  def('abPlaceWeight', 'ab', 0.5, 0, 1, 0.1, 'share', ['نسبة الحوادث قرب الأماكن', 'Share of incidents near places'], ['في المقارنة: هذه النسبة من الحوادث تُسحب قرب أماكن من البيانات (مدن أكبر أثقل)، والباقي موزّع بانتظام على اليابسة التي تبعد عن الطرق مسافة قريبة (افتراض).', 'In the A/B: this share of incidents is drawn near places from the data (bigger towns weigh more); the rest is uniform over land cells close to a road (assumption).']);
  def('abMaxOffroadKm', 'ab', 3, 0.5, 15, 0.5, 'km', ['أبعد مسافة عن الطريق', 'Farthest from a road'], ['في المقارنة: لا يُسحب حادث أبعد من هذه المسافة عن أقرب طريق في البيانات (افتراض).', 'In the A/B: no incident is drawn farther than this from the nearest road in the data (assumption).']);

  function defaultParams() { var P = {}; for (var i = 0; i < PARAM_DEFS.length; i++) P[PARAM_DEFS[i].key] = PARAM_DEFS[i].default; return P; }
  function resolveParams(over) {
    var P = defaultParams();
    if (over) for (var k in over) if (Object.prototype.hasOwnProperty.call(P, k) && isNum(over[k])) P[k] = over[k];
    return P;
  }
  var PARAM_BY_KEY = {}; PARAM_DEFS.forEach(function (d) { PARAM_BY_KEY[d.key] = d; });

  /* ====================================================================================
   * 4. THE WORLD  (static, immutable, built once per data set): road graph extras, spatial indexes, urban weights, hazard grid, facilities
   *    Everything here is derived from the bundled OpenStreetMap snapshot (data/qatar-*.js). Nothing is invented.
   * ==================================================================================== */
  var WORLDS = [];
  function getData(opts) {
    var d = (opts && opts.data) || {};
    var geo = d.geo || root.MANARA_QATAR_GEO, fac = d.facilities || root.MANARA_QATAR_FACILITIES, roads = d.roads || root.MANARA_QATAR_ROADS;
    if (!geo || !fac || !roads) throw new Error('ManaraNational: load data/qatar-geo.js, data/qatar-facilities.js and data/qatar-roads.js first (window.MANARA_QATAR_*)');
    return { geo: geo, fac: fac, roads: roads };
  }
  // roads whose OSM names (or refs) match are "corridors": the extra slow-down applies ONLY to edges that really carry such a name in the data
  var CORRIDORS = [
    { code: 1, id: 'corniche', re: /corniche/i, label: T('الكورنيش', 'Corniche') },
    { code: 2, id: 'salwa', re: /salwa/i, label: T('طريق سلوى', 'Salwa Road') },
    { code: 3, id: 'industrial', re: /industr/i, label: T('طرق المنطقة الصناعية', 'Industrial-area roads') },
    { code: 4, id: 'ring', re: /(^|\s)[A-G] Ring|ring road/i, label: T('الطرق الدائرية', 'Ring roads') }
  ];
  var SENS = [0.75, 0.9, 1.0, 1.0, 0.9, 0.6];     // how strongly the daily pressure bites each road class (motorway, trunk, primary, secondary, tertiary, local): assumption
  var CENTRE_KIND = { city: [0.85, 7000], town: [0.55, 4500], 'municipality-centre': [0.4, 3000], airport: [0.35, 3500] };   // [weight, radius m]: assumption (places come from the data)
  var GRID_DEG = 0.02;
  var CONTRA_MAX_EDGE_M = 1500;      // contraflow only on edges up to this length

  function segDistM(px, py, ax, ay, bx, by) {       // all in metres
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Mth.sqrt(qx * qx + qy * qy);
  }

  function buildWorld(data) {
    var t0 = Date.now(), G = data.roads.decode(), geo = data.geo, FAC = data.fac, n = G.n, E = G.e, A = G.a, i, e, a, k;
    var W = { data: data, G: G, geo: geo, fac: FAC, n: n, E: E, A: A, A2: A, build: G.meta.build, attribution: G.meta.attribution, snapshot: G.meta.snapshotDate };
    // arc ids of an edge: the forward arc is eArc0[e], the reverse arc (two-way edges only) is eArc0[e] + 1
    W.eArc0 = new Int32Array(E);
    for (e = 0, a = 0; e < E; e++) { W.eArc0[e] = a; a += 1 + G.eTwoWay[e]; }
    // Extended arc set: ids 0..A-1 are the data's own arcs; ids A..A2-1 are CONTRAFLOW arcs, one per eligible one-way edge, usable only by responders on a call
    // (an ASSUMPTION, P.contraflowKph = 20 km/h by default): the extract holds only the major roads, so a one-way road often has its opposite carriageway outside it and a
    // dead end would otherwise cost a detour of tens of kilometres.  Motorways, ramps, tunnels and virtual connectors never get one (a roundabout may be driven the short way round).
    var contra = [];
    for (e = 0; e < E; e++) if (!G.eTwoWay[e] && G.eCls[e] >= 2 && !(G.eFlags[e] & (32 | 1 | 256)) && G.eLen[e] <= CONTRA_MAX_EDGE_M) contra.push(e);
    var A2 = A + contra.length;
    W.A2 = A2; W.contraEdges = contra;
    W.aFrom = new Int32Array(A2); W.aTo = new Int32Array(A2); W.aEdge = new Int32Array(A2); W.aLen = new Float32Array(A2); W.aRev = new Uint8Array(A2); W.aMps = new Float32Array(A2);
    W.aFrom.set(G.aFrom, 0); W.aTo.set(G.aTo, 0); W.aEdge.set(G.aEdge, 0); W.aLen.set(G.aLen, 0); W.aRev.set(G.aRev, 0);
    for (a = 0; a < A; a++) W.aMps[a] = G.aSpeed[a] / 3.6;
    W.eRev = new Int32Array(E).fill(-1);                  // the arc that runs against the stored direction (two-way edges: eArc0 + 1; contraflow edges: an extra arc)
    for (e = 0; e < E; e++) if (G.eTwoWay[e]) W.eRev[e] = W.eArc0[e] + 1;
    for (k = 0; k < contra.length; k++) {
      e = contra[k]; a = A + k;
      W.aFrom[a] = G.eTo[e]; W.aTo[a] = G.eFrom[e]; W.aEdge[a] = e; W.aLen[a] = G.eLen[e]; W.aRev[a] = 1; W.aMps[a] = 20 / 3.6; W.eRev[e] = a;
    }
    // adjacency in both directions (CSR)
    W.inStart = new Int32Array(n + 1); W.inArc = new Int32Array(A2); W.outStart = new Int32Array(n + 1); W.outArc = new Int32Array(A2);
    for (a = 0; a < A2; a++) { W.inStart[W.aTo[a] + 1]++; W.outStart[W.aFrom[a] + 1]++; }
    for (i = 0; i < n; i++) { W.inStart[i + 1] += W.inStart[i]; W.outStart[i + 1] += W.outStart[i]; }
    var fill = W.inStart.slice(0, n), fillO = W.outStart.slice(0, n);
    for (a = 0; a < A2; a++) { W.inArc[fill[W.aTo[a]]++] = a; W.outArc[fillO[W.aFrom[a]]++] = a; }
    // edge midpoints, geometry cache
    W.eMidLon = new Float64Array(E); W.eMidLat = new Float64Array(E);
    for (e = 0; e < E; e++) {
      var s0 = G.shapeStart[e], s1 = G.shapeStart[e + 1];
      if (s1 > s0) { var mi = s0 + ((s1 - s0) >> 1); W.eMidLon[e] = G.shapeLon[mi]; W.eMidLat[e] = G.shapeLat[mi]; }
      else { W.eMidLon[e] = (G.lon[G.eFrom[e]] + G.lon[G.eTo[e]]) / 2; W.eMidLat[e] = (G.lat[G.eFrom[e]] + G.lat[G.eTo[e]]) / 2; }
    }
    W.geom = {};
    W.nodeGrid = makePointGrid(G.lon, G.lat, 0.02);
    W.edgeGrid = makePointGrid(W.eMidLon, W.eMidLat, 0.02);
    // all vertices (nodes + interior shape points): the cheap "how far is the nearest road" test
    var nsh = Mth.ceil(G.shapeLon.length / 3), vx = new Float64Array(n + nsh), vy = new Float64Array(n + nsh), q3;
    vx.set(G.lon, 0); vy.set(G.lat, 0);
    for (q3 = 0; q3 < nsh; q3++) { vx[n + q3] = G.shapeLon[q3 * 3]; vy[n + q3] = G.shapeLat[q3 * 3]; }      // every third shape point is plenty for a "distance to a road" test
    W.vertGrid = makePointGrid(vx, vy, 0.02);

    // ---- places and the urban-influence field (from the data: place kinds + density of major junctions)
    var places = geo.places, centres = [], dohaId = geo.anchors && geo.anchors.doha;
    places.forEach(function (p) {
      var ck = CENTRE_KIND[p.kind]; if (!ck) return;
      centres.push({ lon: p.lon, lat: p.lat, w: p.id === dohaId ? 1.0 : ck[0], r: p.id === dohaId ? 11000 : ck[1] });
    });
    W.centres = centres;
    var centreTerm = function (lon, lat) {
      var best = 0, j, c, dx, dy, d2, v, ck = Mth.cos(lat * DEG);
      for (j = 0; j < centres.length; j++) {
        c = centres[j]; dx = (lon - c.lon) * M_LAT * ck; dy = (lat - c.lat) * M_LAT; d2 = (dx * dx + dy * dy) / (c.r * c.r);
        if (d2 > 9) continue;
        v = c.w * Mth.exp(-d2); if (v > best) best = v;
      }
      return best;
    };
    // density of junctions on motorway..secondary roads (0.01 degree cells, 5 x 5 box)
    var DC = 0.01, dlon0 = G.meta.bbox.lonMin - 0.05, dlat0 = G.meta.bbox.latMin - 0.05;
    var dnx = Mth.ceil((G.meta.bbox.lonMax - dlon0) / DC) + 6, dny = Mth.ceil((G.meta.bbox.latMax - dlat0) / DC) + 6;
    var major = new Uint8Array(n), cnt = new Float32Array(dnx * dny), cx, cy;
    for (e = 0; e < E; e++) if (G.eCls[e] <= 3 && !(G.eFlags[e] & 256)) { major[G.eFrom[e]] = 1; major[G.eTo[e]] = 1; }
    for (i = 0; i < n; i++) if (major[i]) { cx = Mth.floor((G.lon[i] - dlon0) / DC); cy = Mth.floor((G.lat[i] - dlat0) / DC); cnt[cy * dnx + cx]++; }
    var tmp = new Float32Array(dnx * dny), dens = new Float32Array(dnx * dny), sx, sy, acc;
    for (cy = 0; cy < dny; cy++) for (cx = 0; cx < dnx; cx++) { acc = 0; for (sx = -2; sx <= 2; sx++) if (cx + sx >= 0 && cx + sx < dnx) acc += cnt[cy * dnx + cx + sx]; tmp[cy * dnx + cx] = acc; }
    for (cy = 0; cy < dny; cy++) for (cx = 0; cx < dnx; cx++) { acc = 0; for (sy = -2; sy <= 2; sy++) if (cy + sy >= 0 && cy + sy < dny) acc += tmp[(cy + sy) * dnx + cx]; dens[cy * dnx + cx] = acc; }
    var nz = []; for (i = 0; i < dens.length; i++) if (dens[i] > 0) nz.push(dens[i]);
    nz.sort(function (p, q) { return p - q; });
    var dLo = nz.length ? percentile(nz, 0.5) : 1, dHi = nz.length ? percentile(nz, 0.97) : 2;
    var densTerm = function (lon, lat) {
      var qx = Mth.floor((lon - dlon0) / DC), qy = Mth.floor((lat - dlat0) / DC);
      if (qx < 0 || qy < 0 || qx >= dnx || qy >= dny) return 0;
      return smooth(dLo, dHi, dens[qy * dnx + qx]);
    };
    W.urbanAt = function (lon, lat) { return clamp(Mth.max(centreTerm(lon, lat), 0.8 * densTerm(lon, lat)), 0, 1); };
    W.uNode = new Float32Array(n);
    for (i = 0; i < n; i++) W.uNode[i] = W.urbanAt(G.lon[i], G.lat[i]);
    W.eUrb = new Float32Array(E);
    for (e = 0; e < E; e++) W.eUrb[e] = (W.uNode[G.eFrom[e]] + W.uNode[G.eTo[e]]) / 2;
    // commuter tide: +1 = the arc heads towards the built-up core, -1 = away from it
    W.aTide = new Float32Array(A2);
    for (a = 0; a < A2; a++) W.aTide[a] = clamp((W.uNode[W.aTo[a]] - W.uNode[W.aFrom[a]]) / 0.08, -1, 1);
    // named corridors that really exist in the data
    W.eCorr = new Uint8Array(E); W.corridorCounts = {};
    CORRIDORS.forEach(function (c) { W.corridorCounts[c.id] = { edges: 0, km: 0, names: {} }; });
    for (e = 0; e < E; e++) {
      var nm = G.names[G.eName[e]] || ['', '', ''], txt = (nm[1] || '') + ' ' + (nm[2] || '');
      if (!txt.trim()) continue;
      for (k = 0; k < CORRIDORS.length; k++) if (CORRIDORS[k].re.test(txt)) {
        W.eCorr[e] = CORRIDORS[k].code; var cc = W.corridorCounts[CORRIDORS[k].id]; cc.edges++; cc.km += G.eLen[e] / 1000; cc.names[nm[1] || nm[2]] = 1; break;
      }
    }
    CORRIDORS.forEach(function (c) { var cc = W.corridorCounts[c.id]; cc.km = r1(cc.km); cc.names = Object.keys(cc.names).sort().slice(0, 12); });
    // industrial influence (places of kind 'industrial' in the data: Industrial Area, Ras Laffan, Mesaieed, ports ...)
    W.industrial = places.filter(function (p) { return p.kind === 'industrial'; });
    W.eInd = new Float32Array(E);
    for (e = 0; e < E; e++) {
      var best = 0, dd, ck2 = Mth.cos(W.eMidLat[e] * DEG);
      for (k = 0; k < W.industrial.length; k++) {
        var ip = W.industrial[k], dx2 = (W.eMidLon[e] - ip.lon) * M_LAT * ck2, dy2 = (W.eMidLat[e] - ip.lat) * M_LAT;
        dd = Mth.exp(-(dx2 * dx2 + dy2 * dy2) / (4000 * 4000)); if (dd > best) best = dd;
      }
      W.eInd[e] = best < 0.05 ? 0 : best;
    }
    // tunnels / underpasses (flag 1): the only low points the data can honestly name
    W.tunnels = [];
    for (e = 0; e < E; e++) if (G.eFlags[e] & 1) W.tunnels.push(e);

    // ---- hazard grid: land mask, municipality, distance to the coast, urban weight
    var bb = geo.bbox, gx0 = Mth.floor(bb.lonMin / GRID_DEG) * GRID_DEG, gy0 = Mth.floor(bb.latMin / GRID_DEG) * GRID_DEG;
    var gnx = Mth.ceil((bb.lonMax - gx0) / GRID_DEG), gny = Mth.ceil((bb.latMax - gy0) / GRID_DEG), NC = gnx * gny;
    var grid = { lon0: gx0, lat0: gy0, d: GRID_DEG, nx: gnx, ny: gny, n: NC, land: new Uint8Array(NC), muni: new Int8Array(NC), coastKm: new Float32Array(NC), urban: new Float32Array(NC),
      lon: new Float64Array(NC), lat: new Float64Array(NC), roadKm: new Float32Array(NC) };
    var muniIdx = {}; geo.municipalities.forEach(function (m, q) { muniIdx[m.id] = q; });
    var segs = [], ringX = [], ringY = [];
    var addRing = function (ring) { for (var q = 0; q < ring.length; q++) { var p0 = ring[q], p1 = ring[(q + 1) % ring.length]; segs.push([p0[0], p0[1], p1[0], p1[1], Mth.min(p0[0], p1[0]), Mth.max(p0[0], p1[0]), Mth.min(p0[1], p1[1]), Mth.max(p0[1], p1[1])]); ringX.push(p0[0]); ringY.push(p0[1]); } };
    (geo.outline.rings || []).forEach(addRing); (geo.outline.holes || []).forEach(addRing);
    var ringGrid = makePointGrid(ringX, ringY, 0.05), ix, iy, c0, lo, la, sg, dm, ck3, ax, ay, bx, by, rv, dxd, dyd;
    for (iy = 0; iy < gny; iy++) for (ix = 0; ix < gnx; ix++) {
      c0 = iy * gnx + ix; lo = gx0 + (ix + 0.5) * GRID_DEG; la = gy0 + (iy + 0.5) * GRID_DEG;
      grid.lon[c0] = lo; grid.lat[c0] = la; grid.muni[c0] = -1;
      if (!geo.inLand(lo, la)) continue;
      grid.land[c0] = 1; var mid = geo.municipalityAt(lo, la); grid.muni[c0] = mid && muniIdx[mid] !== undefined ? muniIdx[mid] : -1;
      ck3 = Mth.cos(la * DEG); rv = ringGrid.nearest(lo, la, 1e7); dm = rv ? rv.d : INF;     // the nearest ring vertex bounds the distance; only segments near the cell can beat it
      dxd = dm / (M_LAT * ck3); dyd = dm / M_LAT;
      for (k = 0; k < segs.length; k++) {
        sg = segs[k];
        if (sg[4] > lo + dxd || sg[5] < lo - dxd || sg[6] > la + dyd || sg[7] < la - dyd) continue;
        ax = (sg[0] - lo) * M_LAT * ck3; ay = (sg[1] - la) * M_LAT; bx = (sg[2] - lo) * M_LAT * ck3; by = (sg[3] - la) * M_LAT;
        var dsg = segDistM(0, 0, ax, ay, bx, by); if (dsg < dm) { dm = dsg; dxd = dm / (M_LAT * ck3); dyd = dm / M_LAT; }
      }
      grid.coastKm[c0] = dm / 1000; grid.urban[c0] = W.urbanAt(lo, la);
      var vn = W.vertGrid.nearest(lo, la, 30000); grid.roadKm[c0] = vn ? vn.d / 1000 : 999;
    }
    W.grid = grid;
    W.eCell = new Int32Array(E);
    for (e = 0; e < E; e++) {
      ix = Mth.floor((W.eMidLon[e] - gx0) / GRID_DEG); iy = Mth.floor((W.eMidLat[e] - gy0) / GRID_DEG);
      W.eCell[e] = ix >= 0 && iy >= 0 && ix < gnx && iy < gny ? iy * gnx + ix : -1;
    }
    // ---- facilities: positions on the road graph (the stored snap is valid only for the same build)
    var sameBuild = FAC.meta && FAC.meta.roadsBuild === G.meta.build;
    W.facs = []; W.facById = {};
    for (i = 0; i < FAC.length; i++) {
      var f = FAC[i], sn = sameBuild && f.snap ? { edge: f.snap.edge, frac: f.snap.frac, d: f.snap.d } : null;
      if (!sn) { var loc = G.locate(f.lon, f.lat, 20000); sn = loc ? { edge: loc.edge, frac: loc.frac, d: loc.dist } : null; }
      if (!sn) continue;
      var rec = { f: f, id: f.id, kind: f.kind, lon: f.lon, lat: f.lat, edge: sn.edge, frac: sn.frac, accessM: sn.d, idx: W.facs.length };
      W.facs.push(rec); W.facById[f.id] = rec;
    }
    W.snapshotInfo = { build: W.build, nodes: n, edges: E, arcs: A, facilities: W.facs.length, places: places.length, tunnels: W.tunnels.length, municipalities: geo.municipalities.length };
    W.buildMs = Date.now() - t0;
    G.locate(51.5, 25.3, 1000);          // warm the snap index once so later timings are stable
    return W;
  }
  function worldFor(data) {
    for (var i = 0; i < WORLDS.length; i++) if (WORLDS[i].roads === data.roads && WORLDS[i].fac === data.fac && WORLDS[i].geo === data.geo) return WORLDS[i].w;
    var w = buildWorld(data); WORLDS.push({ roads: data.roads, fac: data.fac, geo: data.geo, w: w });
    return w;
  }

  // ---- edge geometry
  function edgeGeom(W, e) {
    var g = W.geom[e];
    if (g) return g;
    var pl = W.G.polyline(e), m = pl.length >> 1, cum = new Float64Array(m), q;
    for (q = 1; q < m; q++) cum[q] = cum[q - 1] + haversineM(pl[2 * q - 2], pl[2 * q - 1], pl[2 * q], pl[2 * q + 1]);
    g = W.geom[e] = { pl: pl, cum: cum, total: cum[m - 1] || 1e-9 };
    return g;
  }
  function pointAtEdge(W, e, frac) {
    var g = edgeGeom(W, e), d = clamp(frac, 0, 1) * g.total, m = g.cum.length, lo = 0, hi = m - 1, mid;
    while (hi - lo > 1) { mid = (lo + hi) >> 1; if (g.cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = g.cum[hi] - g.cum[lo], t = seg > 0 ? (d - g.cum[lo]) / seg : 0;
    return [g.pl[2 * lo] + (g.pl[2 * hi] - g.pl[2 * lo]) * t, g.pl[2 * lo + 1] + (g.pl[2 * hi + 1] - g.pl[2 * lo + 1]) * t];
  }
  // points along an edge from fraction f0 to f1 (either direction), including both ends
  function edgePts(W, e, f0, f1) {
    var g = edgeGeom(W, e), d0 = clamp(f0, 0, 1) * g.total, d1 = clamp(f1, 0, 1) * g.total, m = g.cum.length, out = [], q;
    out.push(pointAtEdge(W, e, f0));
    if (d1 >= d0) { for (q = 0; q < m; q++) if (g.cum[q] > d0 + 1e-6 && g.cum[q] < d1 - 1e-6) out.push([g.pl[2 * q], g.pl[2 * q + 1]]); }
    else { for (q = m - 1; q >= 0; q--) if (g.cum[q] < d0 - 1e-6 && g.cum[q] > d1 + 1e-6) out.push([g.pl[2 * q], g.pl[2 * q + 1]]); }
    out.push(pointAtEdge(W, e, f1));
    return out;
  }
  function edgeName(W, e) {
    var nm = W.G.names[W.G.eName[e]];
    if (nm && (nm[0] || nm[1])) return T(nm[0] || nm[1], nm[1] || nm[0]);
    var cls = W.G.classNames[W.G.eCls[e]], lbl = { motorway: ['طريق سريع', 'Motorway'], trunk: ['طريق رئيسي', 'Trunk road'], primary: ['طريق رئيسي', 'Primary road'], secondary: ['طريق ثانوي', 'Secondary road'], tertiary: ['طريق فرعي', 'Tertiary road'], local: ['طريق محلي', 'Local road'] }[cls] || ['طريق', 'Road'];
    return T(lbl[0] + ' (بلا اسم)', lbl[1] + ' (unnamed)');
  }
  function snapTo(W, lon, lat, maxM) {
    var loc = W.G.locate(lon, lat, maxM || 80000);
    if (!loc) return null;
    return { edge: loc.edge, frac: loc.frac, distM: loc.dist, lon: loc.lon, lat: loc.lat };
  }
  function nearestPlace(W, lon, lat) {
    var best = null, bd = INF, i, p, d;
    for (i = 0; i < W.geo.places.length; i++) {
      p = W.geo.places[i]; if (p.kind === 'island' || p.kind === 'locality') continue;
      d = haversineM(lon, lat, p.lon, p.lat); if (d < bd) { bd = d; best = p; }
    }
    return best ? { id: best.id, name: best.name, kind: best.kind, distM: bd, bearingDeg: bearingDeg(best.lon, best.lat, lon, lat) } : null;
  }

  /* ====================================================================================
   * 5. HAZARD FIELDS (SIMULATED, on a coarse lon/lat grid over the country): heat (WBGT estimate), dust (PM10 + relative visibility), rain
   *    Every field is an analytic function of (time, state): nothing is stored per tick, so it is cheap and fully deterministic.
   * ==================================================================================== */
  // Seasonal temperature curve: a cosine through two third-party monthly means for Doha airport (Climate-Zone 1991-2020, SECONDARY:
  //   July high 42 / low 32 °C, January high 23 / low 15 °C; other sites differ, e.g. July humidity 46-65 %). A scenario input, NOT official climate data.
  function climateOf(ci, P) {
    var ph = Mth.cos(2 * Mth.PI * (ci.doy - 200) / 365);
    return { tmax: 32.5 + 9.5 * ph + P.heatOffsetC, tmin: 23.5 + 8.5 * ph + P.heatOffsetC };
  }
  function airTempAt(cl, hour) { return cl.tmin + (cl.tmax - cl.tmin) * (0.5 + 0.5 * Mth.cos(2 * Mth.PI * (hour - 15) / 24)); }
  function solarFactor(doy, hour, lon, lat) {
    var decl = 23.44 * DEG * Mth.sin(2 * Mth.PI * (284 + doy) / 365), H = 15 * (hour - 12 + (45 - lon) / 15) * DEG, phi = lat * DEG;
    return Mth.max(0, Mth.sin(phi) * Mth.sin(decl) + Mth.cos(phi) * Mth.cos(decl) * Mth.cos(H));
  }
  // Stull (2011), J. Appl. Meteor. Climatol. 50:2267 (docs/MANARA-SOURCES.md S70). Tw in °C from T (°C) and RH (%)
  function stullWetBulb(T, RH) {
    return T * Mth.atan(0.151977 * Mth.sqrt(RH + 8.313659)) + Mth.atan(T + RH) - Mth.atan(RH - 1.676331) + 0.00391838 * Mth.pow(RH, 1.5) * Mth.atan(0.023101 * RH) - 4.686035;
  }
  // WBGT outdoors (OSHA, S53): 0.7 Tnwb + 0.2 Tg + 0.1 Tdb, Tg = Tdb + sun load. It is an ESTIMATE (a measured WBGT needs a black globe).
  function wbgtEstimate(T, RH, dTg) { var tw = stullWetBulb(T, RH); return 0.7 * tw + 0.2 * (T + dTg) + 0.1 * T; }
  function wbgtLevel(P, w) { return w >= P.wbgtStop ? 'stop' : w >= P.wbgtWarn ? 'warn' : 'ok'; }
  function heatCell(nat, ci, cl, c) {
    var g = nat.W.grid, P = nat.P, h = ci.hour, coast = g.coastKm[c], inl = smooth(0, P.heatInlandKm, coast);
    var day = h > 7 && h < 19 ? Mth.sin(Mth.PI * (h - 7) / 12) : 0;
    var T = airTempAt(cl, h) - P.heatCoastCoolC * (1 - inl) * day + P.heatUrbanBumpC * g.urban[c];
    var RH = clamp(P.heatRhPct + 18 * Mth.cos(2 * Mth.PI * (h - 4) / 24) + 5 * (1 - inl), 15, 95);
    var dTg = P.heatSunLoadC * solarFactor(ci.doy, h, g.lon[c], g.lat[c]);
    return { T: T, RH: RH, dTg: dTg, wbgt: wbgtEstimate(T, RH, dTg) };
  }
  function heatField(nat, t) {      // Float32Array(NC) of WBGT estimates (0 outside land); a pure function of the simulated minute
    t = Mth.floor(t / 60) * 60;
    var key = Mth.floor(t / 60) + '|' + nat.pver;
    if (nat._heat && nat._heat.key === key) return nat._heat.f;
    var g = nat.W.grid, ci = clockInfo(nat.start, t), cl = climateOf(ci, nat.P), f = nat._heat ? nat._heat.f : new Float32Array(g.n), c;
    for (c = 0; c < g.n; c++) f[c] = g.land[c] ? heatCell(nat, ci, cl, c).wbgt : 0;
    nat._heat = { key: key, f: f };
    return f;
  }
  function dustGeom(nat) {          // unit vector the dust travels TOWARDS (east, north) and the start position of the front (km along it)
    var ds = nat.dust, to = (ds.deg + 180) * DEG, ex = Mth.sin(to), ey = Mth.cos(to), g = nat.W.grid, k, s, s0 = INF, cx = g.lon0 + g.nx * g.d / 2, cy = g.lat0 + g.ny * g.d / 2;
    var corners = [[g.lon0, g.lat0], [g.lon0 + g.nx * g.d, g.lat0], [g.lon0, g.lat0 + g.ny * g.d], [g.lon0 + g.nx * g.d, g.lat0 + g.ny * g.d]];
    for (k = 0; k < 4; k++) { s = ((corners[k][0] - cx) * M_LAT * Mth.cos(cy * DEG) * ex + (corners[k][1] - cy) * M_LAT * ey) / 1000; if (s < s0) s0 = s; }
    return { ex: ex, ey: ey, cx: cx, cy: cy, s0: s0 - 15 };
  }
  function dustFrontKm(nat, t) { var ds = nat.dust; return dustGeom(nat).s0 + ds.mps * ds.frontFactor * Mth.max(0, t - ds.t0) / 1000; }
  function dustAt(nat, t, lon, lat, cellHash) {      // PM10 µg/m³ at a point
    var ds = nat.dust; if (!ds.on || t < ds.t0) return nat.P.dustBackground;
    var gm = dustGeom(nat), s = ((lon - gm.cx) * M_LAT * Mth.cos(gm.cy * DEG) * gm.ex + (lat - gm.cy) * M_LAT * gm.ey) / 1000, d = dustFrontKm(nat, t) - s;
    if (d < 0) return ds.background;
    var ramp = smooth(0, ds.rampKm, d), fade = 1 - smooth(0.55 * ds.bodyKm, ds.bodyKm, d), tex = 0.75 + 0.5 * cellHash;
    return ds.background + (ds.peak * tex - ds.background) * ramp * fade;
  }
  function dustField(nat, t) {
    t = Mth.floor(t / 60) * 60;
    var key = Mth.floor(t / 60) + '|' + nat.pver + '|' + nat.dust.on + '|' + nat.dust.t0;
    if (nat._dust && nat._dust.key === key) return nat._dust.f;
    var g = nat.W.grid, f = nat._dust ? nat._dust.f : new Float32Array(g.n), c, ix, iy;
    for (c = 0; c < g.n; c++) {
      if (!g.land[c]) { f[c] = 0; continue; }
      ix = c % g.nx; iy = (c - ix) / g.nx;
      f[c] = dustAt(nat, t, g.lon[c], g.lat[c], hr(nat.seed, D.DUST, ix >> 1, iy >> 1));
    }
    nat._dust = { key: key, f: f };
    return f;
  }
  function visIndex(pm10) { return 1 / (1 + pm10 / 400); }        // RELATIVE visibility index 0..1 (1 = clear) — no numeric visibility classes are verified (MANARA-HAZARDS §7)
  function rainCellPos(rc, t) { var d = Mth.max(0, t - rc.t0) * rc.speedKmh / 3.6, dxy = offsetLL(rc.lon, rc.lat, d * Mth.sin(rc.headingDeg * DEG), d * Mth.cos(rc.headingDeg * DEG)); return dxy; }
  function rainAtLL(nat, t, lon, lat) {
    var r = nat.P.rainMmHr, i, rc, p, dx, dy, ck = Mth.cos(lat * DEG);
    for (i = 0; i < nat.rainCells.length; i++) {
      rc = nat.rainCells[i]; if (t < rc.t0 || t > rc.t1) continue;
      p = rainCellPos(rc, t); dx = (lon - p[0]) * M_LAT * ck / 1000; dy = (lat - p[1]) * M_LAT / 1000;
      r += rc.mmHr * Mth.exp(-(dx * dx + dy * dy) / (rc.radiusKm * rc.radiusKm));
    }
    return r;
  }
  function rainField(nat, t) {
    t = Mth.floor(t / 60) * 60;
    var key = Mth.floor(t / 60) + '|' + nat.pver + '|' + nat.rainCells.length;
    if (nat._rain && nat._rain.key === key) return nat._rain.f;
    var g = nat.W.grid, f = nat._rain ? nat._rain.f : new Float32Array(g.n), c;
    for (c = 0; c < g.n; c++) f[c] = g.land[c] ? rainAtLL(nat, t, g.lon[c], g.lat[c]) : 0;
    nat._rain = { key: key, f: f };
    return f;
  }

  /* ====================================================================================
   * 6. TIME-VARYING TRAFFIC (SIMULATED) and the cost of every road arc
   *    arc time = length / (free-flow speed x emergency bonus x congestion(arc, time))
   *    congestion = (1 - loss) x noise x operator jam x incident slow-down x weather, clamped to [0.05, 1]
   *    loss = pressure(day type, hour) x class sensitivity x (urban/rural depth)  [+ named corridor] [+ industrial] [+ commuter tide], x global multiplier
   *    ALL OF THIS IS AN ASSUMPTION. Shapes follow a Qatar University intersection study (peaks 06:30-08:30, 12:30-14:30, 17:15-19:15; Thursday,
   *    Friday and Saturday differ from the rest of the week; found through a web search, abstract not opened: SECONDARY, unverified). There is no live traffic.
   * ==================================================================================== */
  var PROFILES = {
    work: [[0, 0.04], [4.5, 0.04], [5.5, 0.18], [6.5, 0.75], [7.5, 0.95], [8.5, 0.70], [9.5, 0.40], [11, 0.35], [12.5, 0.55], [13.5, 0.70], [14.5, 0.55], [15.5, 0.40], [16.5, 0.65], [17.5, 0.95], [18.5, 0.90], [19.5, 0.60], [21, 0.35], [22.5, 0.20], [24, 0.06]],
    thu:  [[0, 0.04], [4.5, 0.04], [5.5, 0.18], [6.5, 0.75], [7.5, 0.95], [8.5, 0.70], [9.5, 0.40], [11, 0.35], [12.5, 0.55], [13.5, 0.70], [14.5, 0.55], [15.5, 0.40], [16.5, 0.65], [17.5, 0.90], [18.5, 0.90], [19.5, 0.70], [21, 0.62], [22.5, 0.45], [24, 0.30]],
    fri:  [[0, 0.20], [2, 0.08], [5, 0.04], [8, 0.06], [10, 0.10], [11, 0.10], [11.25, 0.04], [12.5, 0.04], [13.25, 0.12], [15, 0.22], [17, 0.40], [19, 0.60], [21, 0.62], [23, 0.42], [24, 0.25]],
    sat:  [[0, 0.25], [2, 0.10], [5, 0.05], [8, 0.08], [10, 0.14], [12, 0.26], [14, 0.30], [16, 0.38], [19, 0.56], [21, 0.56], [23, 0.34], [24, 0.12]]
  };
  function profileAt(type, hour) {
    var pr = PROFILES[type], i, a, b;
    hour = ((hour % 24) + 24) % 24;
    for (i = 1; i < pr.length; i++) if (hour <= pr[i][0]) { a = pr[i - 1]; b = pr[i]; return lerp(a[1], b[1], (hour - a[0]) / (b[0] - a[0] || 1)); }
    return pr[pr.length - 1][1];
  }
  var bump = function (h, c, w) { var x = (h - c) / w; return Mth.exp(-x * x); };
  function timeCtx(nat, t) {
    var key = Mth.floor(t / 15), c = nat._ctx[key];
    if (c) return c;
    t = key * 15;                       // a pure function of the 15 s bucket, whatever order the calls come in
    var ci = clockInfo(nat.start, t), dt = ci.dayType, h = ci.hour, workish = dt === 'work' || dt === 'thu';
    c = { t: t, ci: ci, p: profileAt(dt, h), am: workish ? bump(h, 7.4, 1.1) : 0, pm: workish ? bump(h, 17.8, 1.4) : 0,
      j: (workish ? 1 : 0.25) * smooth(5.5, 7, h) * (1 - smooth(16, 18, h)), noiseKey: Mth.floor(t / 900) };
    if (nat._ctxN > 400) { nat._ctx = {}; nat._ctxN = 0; }
    nat._ctx[key] = c; nat._ctxN++;
    return c;
  }
  function arcCong(nat, ctx, a) {
    var W = nat.W, G = W.G, P = nat.P, e = W.aEdge[a], u = W.eUrb[e], loss, cr, ind, td, c;
    loss = ctx.p * SENS[G.eCls[e]] * (P.peakDepthRural * (1 - u) + P.peakDepthUrban * u);
    cr = W.eCorr[e]; if (cr) loss += P.corridorDepth * ctx.p;
    ind = W.eInd[e]; if (ind > 0) loss += P.industrialDepth * ctx.j * ind;
    td = W.aTide[a]; if (td !== 0 && (ctx.am > 0.001 || ctx.pm > 0.001)) loss += P.tidalDepth * u * (td > 0 ? ctx.am * td : -ctx.pm * td);
    loss *= P.trafficLoad; if (loss > 0.9) loss = 0.9;
    c = (1 - loss) * nat.noise[e] * nat.jam[e] * nat.inc[e] * nat.wx[e];
    if (nat.cordonN && nat.cordon[e]) c *= 1 - P.cordonSlowPct / 100;
    return c < 0.05 ? 0.05 : c > 1 ? 1 : c;
  }
  var EMERG_CAP_MPS = 130 / 3.6;
  function arcSpeedMps(nat, a, cong, em) {
    if (a >= nat.W.A) return nat.P.contraflowKph / 3.6 * cong;           // against the one-way direction: slow, responders only
    var v = nat.W.aMps[a];
    if (em > 1) v = Mth.max(v, Mth.min(v * em, EMERG_CAP_MPS));
    return v * cong;
  }
  // weather / incident / noise overlays are arrays per edge, refreshed lazily when their key changes
  function ensureOverlays(nat, ctx) {
    var W = nat.W, E = W.E, P = nat.P, e, k = ctx.noiseKey + '|' + P.noisePct;
    if (nat.noiseKey !== k) {
      var amp = P.noisePct / 100;
      for (e = 0; e < E; e++) nat.noise[e] = 1 - amp * hr(nat.seed, D.NOISE, e, ctx.noiseKey);
      nat.noiseKey = k;
    }
    var wk = Mth.floor(ctx.t / 60) + '|' + nat.pver + '|' + (nat.dust.on ? nat.dust.t0 : -1) + '|' + nat.rainCells.length + '|' + P.rainMmHr + '|' + P.rainSlowPer10mm + '|' + P.dustSlowMax;
    var wet = nat.dust.on || P.rainMmHr > 0 || nat.rainCells.length > 0;
    if (wet) {
      if (nat.wxKey !== wk) {
        var pm = nat.dust.on ? dustField(nat, ctx.t) : null, rn = (P.rainMmHr > 0 || nat.rainCells.length) ? rainField(nat, ctx.t) : null, cell, f, rl, dl;
        for (e = 0; e < E; e++) {
          cell = W.eCell[e]; f = 1;
          if (cell >= 0) {
            if (rn) { rl = Mth.min(0.35, rn[cell] * P.rainSlowPer10mm / 1000); f *= 1 - rl; }
            if (pm) { dl = P.dustSlowMax / 100 * clamp((pm[cell] - P.dustWarn) / (1500 - P.dustWarn), 0, 1); f *= 1 - dl; }
          }
          nat.wx[e] = f;
        }
        nat.wxKey = wk; nat.wxClear = false;
      }
    } else if (!nat.wxClear) { nat.wx.fill(1); nat.wxClear = true; nat.wxKey = ''; }
    if (nat.incKey !== nat.incVer + '|' + P.incidentSlowPct) rebuildIncidentSlow(nat);
  }
  function incidentSlowRadiusM(inc) { return 300 + 250 * inc.sev; }
  function rebuildIncidentSlow(nat) {
    var W = nat.W, P = nat.P, i, inc, R, f0 = 1 - P.incidentSlowPct / 100;
    nat.inc.fill(1);
    for (i = 0; i < nat.incidents.length; i++) {
      inc = nat.incidents[i]; if (inc.status === 'cleared' || inc.status === 'cancelled') continue;
      R = incidentSlowRadiusM(inc);
      W.edgeGrid.within(inc.lon, inc.lat, R, function (e, d) { var f = 1 - (1 - f0) * (1 - 0.5 * d / R); if (f < nat.inc[e]) nat.inc[e] = f; });
    }
    nat.incKey = nat.incVer + '|' + P.incidentSlowPct;
  }
  function bumpVer(nat) { nat.ver++; nat.cost = {}; nat.costKeys = []; }
  // cost arrays (seconds per arc) for a given emergency bonus; cached per time bucket and state version
  function getCost(nat, t, em, civil) {
    var P = nat.P, W = nat.W, A = W.A, A2 = W.A2, bucket = Mth.floor(t / P.costBucketSec), key = bucket + '|' + nat.ver + '|' + nat.pver + '|' + nat.incVer + '|' + em + (civil ? 'c' : '');
    var c = nat.cost[key];
    if (c) return c;
    var tEval = (bucket + 0.5) * P.costBucketSec, ctx = timeCtx(nat, tEval), a, v, e, arr;
    ensureOverlays(nat, ctx);
    if (nat.costKeys.length >= 6) { var old = nat.costKeys.shift(); delete nat.cost[old]; }
    arr = new Float32Array(A2);
    var contraOk = em > 1 && P.contraflowKph > 0;
    for (a = 0; a < A2; a++) {
      e = W.aEdge[a];
      if (nat.closed[e] || (civil && nat.cordonN && nat.cordon[e]) || (a >= A && !contraOk)) { arr[a] = INF; continue; }      // a cordon is closed to civilians, only slow for responders
      v = arcSpeedMps(nat, a, arcCong(nat, ctx, a), em);
      arr[a] = W.aLen[a] / v;
    }
    c = { key: key, arr: arr, t: tEval, em: em };
    nat.cost[key] = c; nat.costKeys.push(key);
    return c;
  }
  function getLenCost(nat) {           // road length in metres per arc (closed roads removed): for the "nearest by road distance" comparison
    var key = nat.ver + '|c';
    if (nat._len && nat._len.key === key) return nat._len.arr;
    var W = nat.W, A = W.A, A2 = W.A2, arr = nat._len ? nat._len.arr : new Float32Array(A2), a;
    for (a = 0; a < A2; a++) arr[a] = (a >= A || nat.closed[W.aEdge[a]]) ? INF : W.aLen[a];
    nat._len = { key: key, arr: arr };
    return arr;
  }

  /* ====================================================================================
   * 7. SHORTEST PATHS: Dijkstra with a typed binary heap on the CSR graph (reverse from an incident, or forward from a point)
   * ==================================================================================== */
  function scratchOf(W, slot) {
    if (!W.scr) W.scr = [];
    var s = W.scr[slot];
    if (!s) s = W.scr[slot] = { dist: new Float64Array(W.n), link: new Int32Array(W.n), seed: new Int32Array(W.n), heap: makeHeap(W.A2 + W.n + 16) };
    return s;
  }
  // seeds: [[node, seconds, arcOrMinus1], ...]; dir 'rev' = travel TIME FROM every node TO the seeds (follow link[] to go there),
  // 'fwd' = travel time FROM the seeds TO every node (link[v] = the arc that reaches v). The result lives in a reused scratch: copy before the next call on the same slot.
  function runTree(W, cost, seeds, dir, slot, limit) {
    var S = scratchOf(W, slot || 0), G = W.G, dist = S.dist, link = S.link, heap = S.heap, k, a, v, u, d, nd, c, i;
    dist.fill(INF); link.fill(-1); S.seed.fill(-1); heap.clear();
    for (i = 0; i < seeds.length; i++) {
      v = seeds[i][0];
      if (seeds[i][1] < dist[v]) { dist[v] = seeds[i][1]; S.seed[v] = seeds[i][2]; heap.push(seeds[i][1], v); }
    }
    limit = limit || INF;
    if (dir === 'rev') {
      while (heap.size()) {
        v = heap.pop(); d = heap.popKey; if (d > dist[v]) continue; if (d > limit) break;
        for (k = W.inStart[v]; k < W.inStart[v + 1]; k++) {
          a = W.inArc[k]; c = cost[a]; if (c === INF) continue;
          u = W.aFrom[a]; nd = d + c;
          if (nd < dist[u]) { dist[u] = nd; link[u] = a; heap.push(nd, u); }
        }
      }
    } else {
      while (heap.size()) {
        v = heap.pop(); d = heap.popKey; if (d > dist[v]) continue; if (d > limit) break;
        for (k = W.outStart[v]; k < W.outStart[v + 1]; k++) {
          a = W.outArc[k]; c = cost[a]; if (c === INF) continue;
          u = W.aTo[a]; nd = d + c;
          if (nd < dist[u]) { dist[u] = nd; link[u] = a; heap.push(nd, u); }
        }
      }
    }
    S.dir = dir;
    return S;
  }
  // seeds that REACH a point on edge e at fraction f (reverse search): the forward arc from eFrom, and the reverse arc from eTo on two-way edges
  function seedsReaching(W, cost, e, f) {
    var G = W.G, aF = W.eArc0[e], rv = W.eRev[e], out = [];
    if (cost[aF] !== INF) out.push([G.eFrom[e], f * cost[aF], aF]);
    if (rv >= 0 && cost[rv] !== INF) out.push([G.eTo[e], (1 - f) * cost[rv], rv]);
    return out;
  }
  // seeds LEAVING a point on edge e at fraction f (forward search)
  function seedsLeaving(W, cost, e, f) {
    var G = W.G, aF = W.eArc0[e], rv = W.eRev[e], out = [];
    if (cost[aF] !== INF) out.push([G.eTo[e], (1 - f) * cost[aF], aF]);
    if (rv >= 0 && cost[rv] !== INF) out.push([G.eFrom[e], f * cost[rv], rv]);
    return out;
  }
  // a route step: one arc (possibly only a part of it) travelled from fraction f0 to f1 of the stored edge direction
  function mkStep(W, a, f0, f1) {
    var e = W.aEdge[a];
    return { a: a, e: e, f0: f0, f1: f1, m: W.G.eLen[e] * Mth.abs(f1 - f0) };
  }
  function fullStep(W, a) { var r = W.aRev[a]; return mkStep(W, a, r ? 1 : 0, r ? 0 : 1); }
  // best way from a point (edge e, fraction f) to a point (edge ie, fraction if) in a REVERSE tree S built from seedsReaching(ie, if):
  //   → { sec, steps } or null.  Handles "same edge" directly.
  function pathViaRev(W, S, cost, pos, sc, noSteps, only) {
    var G = W.G, e = pos.edge, f = pos.frac, aF = W.eArc0[e], rv = W.eRev[e], best = INF, mode = null, c, node, okF = only === undefined || only === aF, okR = only === undefined || only === rv;
    if (e === sc.edge) {
      if (okF && f <= sc.frac && cost[aF] !== INF) { c = (sc.frac - f) * cost[aF]; if (c < best) { best = c; mode = 'dF'; } }
      if (okR && rv >= 0 && f >= sc.frac && cost[rv] !== INF) { c = (f - sc.frac) * cost[rv]; if (c < best) { best = c; mode = 'dR'; } }
    }
    if (okF && cost[aF] !== INF && isFin(S.dist[G.eTo[e]])) { c = (1 - f) * cost[aF] + S.dist[G.eTo[e]]; if (c < best) { best = c; mode = 'F'; } }
    if (okR && rv >= 0 && cost[rv] !== INF && isFin(S.dist[G.eFrom[e]])) { c = f * cost[rv] + S.dist[G.eFrom[e]]; if (c < best) { best = c; mode = 'R'; } }
    if (mode === null) return null;
    if (noSteps) return { sec: best, mode: mode };
    var steps = [];
    if (mode === 'dF') steps.push(mkStep(W, aF, f, sc.frac));
    else if (mode === 'dR') steps.push(mkStep(W, rv, f, sc.frac));
    else {
      if (mode === 'F') { steps.push(mkStep(W, aF, f, 1)); node = G.eTo[e]; } else { steps.push(mkStep(W, rv, f, 0)); node = G.eFrom[e]; }
      var guard = 0, a;
      while (S.link[node] >= 0 && guard++ < 200000) { a = S.link[node]; steps.push(fullStep(W, a)); node = W.aTo[a]; }
      a = S.seed[node];
      if (a >= 0) steps.push(mkStep(W, a, W.aRev[a] ? 1 : 0, sc.frac));
    }
    return { sec: best, steps: steps };
  }
  // best way from a point (edge e, fraction f) to a target point in a FORWARD tree S built from seedsLeaving(e, f)
  function pathViaFwd(W, S, cost, from, tg, noSteps) {
    var G = W.G, e = tg.edge, f = tg.frac, aF = W.eArc0[e], rv = W.eRev[e], best = INF, mode = null, c;
    if (e === from.edge) {
      if (f >= from.frac && cost[aF] !== INF) { c = (f - from.frac) * cost[aF]; if (c < best) { best = c; mode = 'dF'; } }
      if (rv >= 0 && f <= from.frac && cost[rv] !== INF) { c = (from.frac - f) * cost[rv]; if (c < best) { best = c; mode = 'dR'; } }
    }
    if (cost[aF] !== INF && isFin(S.dist[G.eFrom[e]])) { c = S.dist[G.eFrom[e]] + f * cost[aF]; if (c < best) { best = c; mode = 'F'; } }
    if (rv >= 0 && cost[rv] !== INF && isFin(S.dist[G.eTo[e]])) { c = S.dist[G.eTo[e]] + (1 - f) * cost[rv]; if (c < best) { best = c; mode = 'R'; } }
    if (mode === null) return null;
    if (noSteps) return { sec: best, mode: mode };
    var steps = [];
    if (mode === 'dF') steps.push(mkStep(W, aF, from.frac, f));
    else if (mode === 'dR') steps.push(mkStep(W, rv, from.frac, f));
    else {
      var node = mode === 'F' ? G.eFrom[e] : G.eTo[e], tail = mode === 'F' ? mkStep(W, aF, 0, f) : mkStep(W, rv, 1, f), a, guard = 0, rev = [];
      while (S.link[node] >= 0 && guard++ < 200000) { a = S.link[node]; rev.push(fullStep(W, a)); node = W.aFrom[a]; }
      a = S.seed[node];
      if (a >= 0) steps.push(mkStep(W, a, from.frac, W.aRev[a] ? 0 : 1));
      for (guard = rev.length - 1; guard >= 0; guard--) steps.push(rev[guard]);
      steps.push(tail);
    }
    return { sec: best, steps: steps };
  }
  // time-dependent evaluation of a step list that starts at clock t0 (congestion changes along the way)
  function evalSteps(nat, steps, t0, em, civil) {
    var W = nat.W, clock = t0, sec = 0, freeSec = 0, lenM = 0, i, st, ctx, cong, v, s, fs, list = [], congN = 0;
    ensureOverlays(nat, timeCtx(nat, t0));
    for (i = 0; i < steps.length; i++) {
      st = steps[i];
      if (nat.closed[st.e] || (civil && nat.cordonN && nat.cordon[st.e])) return { sec: INF, freeSec: freeSec, lenM: lenM, blocked: st.e, congested: [], congestedN: 0 };
      ctx = timeCtx(nat, clock); cong = arcCong(nat, ctx, st.a); v = arcSpeedMps(nat, st.a, cong, em);
      s = st.m / v; fs = st.m / arcSpeedMps(nat, st.a, 1, em);
      sec += s; freeSec += fs; lenM += st.m; clock += s;
      if (cong < 0.8 && st.m > 30) { congN++; list.push({ edge: st.e, delaySec: s - fs, cong: cong, name: edgeName(W, st.e), m: st.m }); }
    }
    list.sort(function (p, q) { return q.delaySec - p.delaySec; });
    return { sec: sec, freeSec: freeSec, lenM: lenM, congestedN: congN, congested: list.slice(0, 3).map(function (x) { return { edge: x.edge, name: x.name, delaySec: Mth.round(x.delaySec), cong: r2(x.cong) }; }), delaySec: sec - freeSec };
  }
  function stepsPolyline(W, steps) {
    var out = [], i, pts, j;
    for (i = 0; i < steps.length; i++) {
      pts = edgePts(W, steps[i].e, steps[i].f0, steps[i].f1);
      for (j = (out.length ? 1 : 0); j < pts.length; j++) out.push([r5(pts[j][0]), r5(pts[j][1])]);
    }
    return out;
  }
  function decimate(pts, maxN) {
    if (pts.length <= maxN) return pts;
    var out = [], stride = (pts.length - 1) / (maxN - 1), i;
    for (i = 0; i < maxN; i++) out.push(pts[Mth.round(i * stride)]);
    return out;
  }

  /* ====================================================================================
   * 8. THE FLEET (SIMULATED responders generated from the real facilities) and the national state
   *    A unit is a response vehicle based at a real OSM facility (Civil Defence / fire station, police station, ambulance point, hospital with an ED).
   *    Where a vehicle really is, and whether it is free, is SIMULATED: units wait at their base and are "busy" with a seeded probability.
   * ==================================================================================== */
  var KIND_NAME = { fire: T('إطفاء', 'Fire engine'), rescue: T('إنقاذ', 'Rescue team'), ambulance: T('إسعاف', 'Ambulance'), police: T('شرطة', 'Police') };
  var MUNI_FALLBACK = T('', '');
  function muniName(W, id) { var ms = W.geo.municipalities, i; for (i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i].name; return MUNI_FALLBACK; }
  function facLabel(W, fr) {
    var f = fr.f, ar = f.name && f.name.ar, en = f.name && f.name.en;
    if (ar || en) return T(ar || en, en || ar);
    var m = muniName(W, f.muni);
    return T('(بلا اسم في OSM) — ' + m.ar, '(unnamed in OSM) — ' + m.en);
  }
  function unitNameOf(W, kind, fr) {
    var role = fr.f.role, lab = facLabel(W, fr), pre;
    if (kind === 'fire') pre = role === 'civil-defence-station' ? T('الدفاع المدني', 'Civil Defence') : role === 'civil-defence-hq' ? T('مجمّع الدفاع المدني', 'Civil Defence complex') : role === 'industrial-fire-station' ? T('إطفاء صناعي', 'Industrial fire station') : T('مركز إطفاء', 'Fire station');
    else if (kind === 'police') pre = role === 'traffic' ? T('المرور', 'Traffic police') : T('الشرطة', 'Police');
    else pre = T('إسعاف', 'Ambulance');
    return T(pre.ar + ' — ' + lab.ar, pre.en + ' — ' + lab.en);
  }
  var isRestricted = function (f) { return (f.flags || []).some(function (x) { return /^name suggests restricted access/.test(x); }); };
  var isHospitalLike = function (f) { return f.kind === 'hospital' || f.kind === 'clinic-ed'; };
  function turnoutOf(P, kind) { return kind === 'fire' || kind === 'rescue' ? P.turnoutFireSec : kind === 'ambulance' ? P.turnoutAmbSec : P.turnoutPoliceSec; }
  function buildFleet(W, P) {
    var units = [], byId = {}, per = Mth.max(1, P.unitsPerStation | 0), counts = { fire: 0, police: 0, ambulance: 0 };
    function add(fr, kind, basing) {
      var k, id, u;
      for (k = 0; k < per; k++) {
        id = kind + ':' + fr.id + (per > 1 ? '#' + (k + 1) : '');
        u = { id: id, idx: units.length, kind: kind, fac: fr.id, role: fr.f.role || (isHospitalLike(fr.f) ? 'hospital-based' : 'ambulance-point'), basing: basing || null, name: unitNameOf(W, kind, fr),
          base: { edge: fr.edge, frac: fr.frac, lon: fr.lon, lat: fr.lat, accessM: fr.accessM },
          pos: { edge: fr.edge, frac: fr.frac, lon: fr.lon, lat: fr.lat }, state: 'idle', assigned: null, slot: null, busyOverride: null, busyUntil: 0, ret: null, missions: 0, flags: [] };
        if (fr.f.role === 'industrial-fire-station') u.flags.push('industrial-operator');
        if (fr.f.role === 'civil-defence-hq') u.flags.push('hq-complex-assumed-operational');
        if (fr.f.role === 'unknown' && kind === 'police') u.flags.push('police-role-unknown');
        if (!(fr.f.name && (fr.f.name.ar || fr.f.name.en))) u.flags.push('unnamed-in-osm');
        units.push(u); byId[id] = u; counts[kind]++;
      }
    }
    W.facs.forEach(function (fr) {
      var f = fr.f, fl = f.flags || [];
      if (f.kind === 'fire') {
        var office = fl.some(function (x) { return /not an operational station/.test(x); }), tagged = !!(f.tags && f.tags.amenity === 'fire_station');
        if (office && !(tagged && P.fireIncludeHq)) return;      // a pure office is never a unit; an HQ complex that OSM also tags amenity=fire_station is one when P.fireIncludeHq = 1
        if (f.role === 'civil-defence-hq' && !P.fireIncludeHq) return;
        if (f.role === 'industrial-fire-station' && !P.industrialFire) return;
        add(fr, 'fire');
      } else if (f.kind === 'police') {
        if ((f.role === 'department' || f.role === 'training' || fl.some(function (x) { return /administrative or training site/.test(x); })) && !P.policeIncludeAdmin) return;
        add(fr, 'police');
      } else if (f.kind === 'ambulance') add(fr, 'ambulance', 'ambulance-point');
      else if (isHospitalLike(f)) {
        if (P.ambulanceBasing < 1 || isRestricted(f) || f.ed === 'no') return;
        var caps = f.caps || [];
        if (caps.indexOf('obstetric') >= 0 || (caps.indexOf('paedED') >= 0 && caps.indexOf('ed') < 0)) return;
        if (f.ed === 'yes') add(fr, 'ambulance', 'hospital-ed-yes');
        else if (P.ambulanceBasing >= 2 && f.ed === 'unknown' && f.facilityType === 'hospital') add(fr, 'ambulance', 'hospital-ed-unknown-assumed');
      }
    });
    return { units: units, byId: byId, counts: counts };
  }
  function unitsOfKind(nat, kind, flag) {
    var out = [], i, u, list = nat.fleet.units;
    for (i = 0; i < list.length; i++) {
      u = list[i];
      if (kind === 'rescue') { if (u.kind === 'fire' && u.role !== 'industrial-fire-station') out.push(u); }
      else if (u.kind === kind) { if (flag === 'hazmat' && !nat.P.hazmatAllStations) continue; out.push(u); }
    }
    return out;
  }
  // busy = tied up with another call (SIMULATED): assigned to an incident, forced by the operator, or drawn from a seeded probability per period
  function isBusy(nat, u, t, ownIncident) {
    if (u.assigned && u.assigned !== ownIncident) return true;
    if (u.busyUntil > t) return true;
    if (u.busyOverride !== null) return u.busyOverride;
    var pct = nat.P.unitBusyPct;
    if (pct <= 0) return false;
    return hr(nat.seed, D.BUSY, u.idx, Mth.floor(t / (nat.P.busyBlockMin * 60))) < pct / 100;
  }

  function create(opts) {
    opts = opts || {};
    var data = getData(opts), W = worldFor(data), P = resolveParams(opts.params), E = W.E, i, tun;
    var hour0 = opts.hour !== undefined ? opts.hour : 8, t0 = opts.t !== undefined ? opts.t : hour0 * 3600 + (opts.day || 0) * 86400;
    var nat = {
      v: 1, scope: 'national', W: W, P: P, seed: (opts.seed >>> 0) || 1, start: parseDate(opts.date), t: t0, t0: t0, tick: Mth.max(1, opts.tickSec || 5), acc: 0,
      autoApprove: opts.autoApprove !== false, opts: { seed: (opts.seed >>> 0) || 1, date: opts.date, hour: opts.hour, t: opts.t, day: opts.day, params: opts.params, tickSec: opts.tickSec, autoApprove: opts.autoApprove, data: opts.data },
      jam: new Float32Array(E).fill(1), closed: new Uint8Array(E), noise: new Float32Array(E).fill(1), inc: new Float32Array(E).fill(1), wx: new Float32Array(E).fill(1),
      noiseKey: '', wxKey: '', wxClear: true, incKey: '', incVer: 0, ver: 0, pver: 0, cost: {}, costKeys: [], _ctx: {}, _ctxN: 0,
      cordon: new Uint8Array(E), cordons: {}, cordonN: 0, jamN: 0, closedN: 0, events: [], evCount: {}, incidents: [], incSeq: 0, dirty: false, nextRecheck: t0,
      dust: { on: false, t0: 0, deg: P.dustWindDeg, mps: P.dustWindMps, frontFactor: P.dustFrontFactor, peak: P.dustPeak, background: P.dustBackground, rampKm: P.dustRampKm, bodyKm: P.dustBodyKm },
      rainCells: [], ponds: [], flood: { tunnels: [], byEdge: {} }, hosp: {}, stats: { dispatches: 0, redispatches: 0, reroutes: 0, firstEta: [] }
    };
    nat.fleet = buildFleet(W, P);
    for (i = 0; i < W.tunnels.length; i++) {
      tun = { e: W.tunnels[i], sump: 0.6 + 0.9 * hr(nat.seed, D.SUMP, W.tunnels[i], 0), depthCm: 0, closed: false };
      nat.flood.tunnels.push(tun); nat.flood.byEdge[tun.e] = tun;
    }
    return nat;
  }
  function evt(nat, type, data, ar, en) {
    var ev = { t: nat.t, clock: clockInfo(nat.start, nat.t).clock, type: type, text: T(ar, en) }, k;
    if (data) for (k in data) ev[k] = data[k];
    nat.events.push(ev);
    if (nat.events.length > 600) nat.events.splice(0, 150);
    nat.evCount[type] = (nat.evCount[type] || 0) + 1;
    return ev;
  }
  function markDirty(nat) { nat.dirty = true; nat.nextRecheck = Mth.min(nat.nextRecheck, nat.t); }

  // ---- operator / test actions
  function setParam(nat, key, value) {
    var d = PARAM_BY_KEY[key];
    if (!d || !isNum(value) || !d.live) return false;
    nat.P[key] = clamp(value, d.min, d.max); nat.pver++; bumpVer(nat); nat.incKey = ''; markDirty(nat);
    return true;
  }
  function jamRoad(nat, edge, factor) {
    if (!(edge >= 0 && edge < nat.W.E)) return false;
    var f = clamp(factor === undefined ? 0.2 : factor, 0.05, 1);
    if (nat.jam[edge] === 1 && f < 1) nat.jamN++;
    nat.jam[edge] = f; bumpVer(nat); markDirty(nat);
    var nm = edgeName(nat.W, edge); evt(nat, 'road-jam', { edge: edge, factor: f }, 'ازدحام يدوي على «' + nm.ar + '»', 'Manual jam on "' + nm.en + '"');
    return true;
  }
  function unjamRoad(nat, edge) { if (nat.jam[edge] !== 1) { nat.jam[edge] = 1; nat.jamN = Mth.max(0, nat.jamN - 1); bumpVer(nat); markDirty(nat); } return true; }
  function jamArea(nat, lon, lat, radiusM, factor) {
    var n = 0, f = clamp(factor === undefined ? 0.2 : factor, 0.05, 1);
    nat.W.edgeGrid.within(lon, lat, radiusM, function (e) { if (nat.jam[e] === 1 && f < 1) nat.jamN++; nat.jam[e] = Mth.min(nat.jam[e], f); n++; });
    bumpVer(nat); markDirty(nat);
    if (n) evt(nat, 'area-jam', { lon: lon, lat: lat, radiusM: radiusM, factor: f, edges: n }, 'ازدحام شديد في منطقة (' + n + ' قطعة طريق)', 'Heavy jam over an area (' + n + ' road segments)');
    return n;
  }
  function clearJams(nat) { nat.jam.fill(1); nat.jamN = 0; bumpVer(nat); markDirty(nat); }
  var CLOSE_CAUSE = { 1: 'operator', 2: 'flood', 3: 'ponding' };
  function closeRoad(nat, edge, cause) {
    if (!(edge >= 0 && edge < nat.W.E)) return false;
    if (!nat.closed[edge]) nat.closedN++;
    nat.closed[edge] = cause || 1; bumpVer(nat); markDirty(nat);
    var nm = edgeName(nat.W, edge);
    evt(nat, 'road-closed', { edge: edge, by: CLOSE_CAUSE[cause || 1] }, 'أُغلق الطريق «' + nm.ar + '» (' + ({ operator: 'المشغّل', flood: 'سيول', ponding: 'تجمّع مياه' }[CLOSE_CAUSE[cause || 1]]) + ')', 'Road "' + nm.en + '" closed (' + CLOSE_CAUSE[cause || 1] + ')');
    return true;
  }
  function openRoad(nat, edge) {
    if (!nat.closed[edge]) return true;
    nat.closed[edge] = 0; nat.closedN = Mth.max(0, nat.closedN - 1); bumpVer(nat); markDirty(nat);
    var nm = edgeName(nat.W, edge); evt(nat, 'road-open', { edge: edge }, 'أُعيد فتح الطريق «' + nm.ar + '»', 'Road "' + nm.en + '" re-opened');
    return true;
  }
  function closeArea(nat, lon, lat, radiusM) {
    var n = 0, es = [];
    nat.W.edgeGrid.within(lon, lat, radiusM, function (e) { es.push(e); });
    es.forEach(function (e) { if (!nat.closed[e]) { nat.closed[e] = 1; nat.closedN++; n++; } });
    bumpVer(nat); markDirty(nat);
    if (n) evt(nat, 'area-closed', { lon: lon, lat: lat, radiusM: radiusM, edges: n }, 'أُغلقت منطقة (' + n + ' قطعة طريق)', 'Area closed (' + n + ' road segments)');
    return n;
  }
  // a police cordon around an incident: closed to civilians (phones), slower for responders
  function liftCordon(nat, incId, silent) {
    var c = nat.cordons[incId]; if (!c) return false;
    c.edges.forEach(function (e) { if (nat.cordon[e] > 0) nat.cordon[e]--; });
    delete nat.cordons[incId]; nat.cordonN = Object.keys(nat.cordons).length; bumpVer(nat); markDirty(nat);
    if (!silent) evt(nat, 'cordon-lifted', { incident: incId }, 'رُفع الطوق حول الحادث ' + incId, 'Cordon around incident ' + incId + ' lifted');
    return true;
  }
  function setCordon(nat, incId, radiusM) {
    var inc = getIncident(nat, incId); if (!inc) return 0;
    liftCordon(nat, incId, true);
    var edges = [], r = radiusM || Mth.max(150, (inc.radiusM || 100) * 1.5);
    nat.W.edgeGrid.within(inc.lon, inc.lat, r, function (e) { edges.push(e); });
    edges.forEach(function (e) { if (nat.cordon[e] < 255) nat.cordon[e]++; });
    nat.cordons[incId] = { radiusM: r, edges: edges }; nat.cordonN = Object.keys(nat.cordons).length; bumpVer(nat); markDirty(nat);
    evt(nat, 'cordon', { incident: incId, radiusM: Mth.round(r), edges: edges.length }, 'أُقيم طوق أمني حول الحادث ' + incId + ' (' + Mth.round(r) + ' م)', 'Police cordon set around incident ' + incId + ' (' + Mth.round(r) + ' m)');
    return edges.length;
  }
  function setUnitBusy(nat, id, busy) {
    var u = nat.fleet.byId[id]; if (!u) return false;
    u.busyOverride = busy === null || busy === undefined ? null : !!busy;
    evt(nat, u.busyOverride ? 'unit-busy' : 'unit-free', { unit: id }, (u.busyOverride ? 'صارت الوحدة مشغولة: ' : 'صارت الوحدة متاحة: ') + u.name.ar, (u.busyOverride ? 'Unit became busy: ' : 'Unit is free: ') + u.name.en);
    markDirty(nat);
    return true;
  }
  function setRain(nat, mmHr) { return setParam(nat, 'rainMmHr', mmHr); }
  function addRainCell(nat, o) {
    if (!o || !isNum(o.lon) || !isNum(o.lat)) return null;
    var rc = { id: 'R' + (nat.rainCells.length + 1), lon: o.lon, lat: o.lat, radiusKm: isNum(o.radiusKm) ? clamp(o.radiusKm, 1, 200) : 15, mmHr: isNum(o.mmHr) ? clamp(o.mmHr, 0, 200) : 40, headingDeg: isNum(o.headingDeg) ? o.headingDeg : 135, speedKmh: isNum(o.speedKmh) ? clamp(o.speedKmh, 0, 120) : 0,
      t0: isNum(o.t0) ? o.t0 : nat.t, t1: isNum(o.t1) ? o.t1 : nat.t + (isNum(o.durationSec) ? clamp(o.durationSec, 60, 86400 * 3) : 7200) };
    nat.rainCells.push(rc); nat.pver++; bumpVer(nat); markDirty(nat);
    evt(nat, 'rain-cell', { id: rc.id, mmHr: rc.mmHr }, 'خلية مطر (محاكاة) ' + rc.mmHr + ' مم/س', 'Simulated rain cell ' + rc.mmHr + ' mm/h');
    return rc;
  }
  function clearRain(nat) { nat.rainCells = []; nat.P.rainMmHr = 0; nat.pver++; bumpVer(nat); markDirty(nat); }
  function startDust(nat, o) {
    o = o || {}; var P = nat.P;
    var pick = function (v, d, lo, hi) { return isNum(v) ? clamp(v, lo, hi) : d; };
    nat.dust = { on: true, t0: pick(o.t0, nat.t, -1e9, 1e12), deg: pick(o.deg, P.dustWindDeg, 0, 360), mps: pick(o.mps, P.dustWindMps, 1, 40), frontFactor: pick(o.frontFactor, P.dustFrontFactor, 0.1, 2),
      peak: pick(o.peak, P.dustPeak, 50, 10000), background: pick(o.background, P.dustBackground, 0, 500), rampKm: P.dustRampKm, bodyKm: P.dustBodyKm };
    nat.pver++; bumpVer(nat); markDirty(nat);
    evt(nat, 'dust-front', { deg: nat.dust.deg, mps: nat.dust.mps }, 'جبهة غبار (محاكاة) تتقدّم بريح من ' + nat.dust.deg + '°', 'Simulated dust front advancing, wind from ' + nat.dust.deg + '°');
    return nat.dust;
  }
  function stopDust(nat) { nat.dust.on = false; nat.pver++; bumpVer(nat); markDirty(nat); return true; }
  function addPonding(nat, o) {       // a user-placed low spot: the road segments within radiusM behave like an underpass that collects water
    var es = [], pond = { id: 'P' + (nat.ponds.length + 1), lon: o.lon, lat: o.lat, radiusM: o.radiusM || 150, name: o.name || null, sump: o.sump || 1, depthCm: 0, closed: false, edges: es };
    nat.W.edgeGrid.within(o.lon, o.lat, pond.radiusM, function (e) { es.push(e); });
    nat.ponds.push(pond);
    evt(nat, 'ponding-point', { id: pond.id, edges: es.length }, 'نقطة تجمّع مياه (محاكاة) أُضيفت', 'Simulated ponding point added');
    return pond;
  }
  function roadInfo(nat, edge, t) {
    var W = nat.W, G = W.G, tt = t === undefined ? nat.t : t, ctx, a;
    if (!(edge >= 0 && edge < W.E)) return null;
    ctx = timeCtx(nat, tt); a = W.eArc0[edge];
    ensureOverlays(nat, ctx);
    return { edge: edge, name: edgeName(W, edge), cls: G.classNames[G.eCls[edge]], kph: G.eSpeed[edge], speedFromOsm: !!(G.eFlags[edge] & 64), lenM: Mth.round(G.eLen[edge]), twoWay: !!G.eTwoWay[edge],
      tunnel: !!(G.eFlags[edge] & 1), bridge: !!(G.eFlags[edge] & 2), virtual: !!(G.eFlags[edge] & 256), cong: r2(arcCong(nat, ctx, a)), congRev: G.eTwoWay[edge] ? r2(arcCong(nat, ctx, a + 1)) : null,
      jam: nat.jam[edge], closed: nat.closed[edge] ? CLOSE_CAUSE[nat.closed[edge]] : null, cordoned: !!nat.cordon[edge], urban: r2(W.eUrb[edge]), corridor: W.eCorr[edge] ? CORRIDORS[W.eCorr[edge] - 1].id : null };
  }
  // congestion of every edge at time t as a Float32Array(E): 1 = free flow, 0.05 = crawling (for drawing the traffic layer)
  function congestionMap(nat, t) {
    var W = nat.W, tt = t === undefined ? nat.t : t, ctx = timeCtx(nat, tt), e, out = new Float32Array(W.E);
    ensureOverlays(nat, ctx);
    for (e = 0; e < W.E; e++) out[e] = nat.closed[e] ? 0 : arcCong(nat, ctx, W.eArc0[e]);
    return out;
  }

  /* ====================================================================================
   * 9. DISPATCH — the unit that reaches the scene FASTEST given (simulated) traffic, not the nearest by distance
   *    ONE reverse Dijkstra from the incident over the congested graph gives the travel time from every node to the scene, which serves every unit type
   *    (the cost function is the same); a second FORWARD Dijkstra from the scene prices the hospitals. The best few candidates per type are then re-timed
   *    exactly, with congestion changing along the route as the clock advances.
   * ==================================================================================== */
  var REQUIRED = {   // docs/MANARA-SPEC.md "Nearest-responder dispatch"
    fire:  [{ kind: 'fire' }, { kind: 'ambulance' }, { kind: 'police' }, { kind: 'rescue', minSev: 2, optional: true }],
    gas:   [{ kind: 'fire', flag: 'hazmat' }, { kind: 'ambulance' }, { kind: 'police' }],
    flood: [{ kind: 'rescue' }, { kind: 'police' }, { kind: 'ambulance' }],
    dust:  [{ kind: 'police' }, { kind: 'ambulance', standby: true }],
    heat:  [{ kind: 'ambulance' }],
    sos:   [{ kind: 'ambulance' }]
  };
  var HAZARDS = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'];
  var HAZARD_NAME = { fire: T('حريق ودخان', 'Fire and smoke'), gas: T('تسرّب غاز', 'Gas leak'), flood: T('سيول وأمطار', 'Flash flood'), dust: T('عاصفة غبارية', 'Dust storm'), heat: T('إجهاد حراري', 'Extreme heat stress'), sos: T('شخص يحتاج مساعدة', 'Someone needs help') };
  function requiredUnits(hazard, severity, P) {
    var list = REQUIRED[hazard] || REQUIRED.sos, out = [];
    list.forEach(function (rq) {
      if (rq.minSev && severity < rq.minSev) return;
      var count = (rq.kind === 'fire' && (hazard === 'fire' || hazard === 'gas') && severity >= P.multiUnitSeverity) ? 2 : 1, k;
      for (k = 0; k < count; k++) out.push({ kind: rq.kind, flag: rq.flag || null, optional: !!rq.optional, standby: !!rq.standby, n: k, slot: rq.kind + (count > 1 ? '#' + (k + 1) : '') });
    });
    return out;
  }
  function patientsOf(hazard, p) {
    var n = p && isNum(p.n) ? Mth.max(0, p.n | 0) : (hazard === 'heat' || hazard === 'sos' ? 1 : 0);
    return { n: n, need: p && (p.need === 'trauma' || p.need === 'paed') ? p.need : 'ed' };
  }
  function sceneOf(nat, lon, lat) {
    var sn = snapTo(nat.W, lon, lat, 90000);
    if (!sn) return null;
    sn.accessSec = sn.distM / (nat.P.accessKph / 3.6);
    return sn;
  }
  var durT = function (s) { s = Mth.round(s); return s < 90 ? T(s + ' ث', s + ' s') : T(mmss(s) + ' دقيقة', mmss(s) + ' min'); };

  // Rank the units of one type for the incident described by ctx { S, cost, sc, t, em, inc, lon, lat }.
  function pickFor(nat, ctx, need, exclude) {
    var W = nat.W, P = nat.P, cands = unitsOfKind(nat, need.kind, need.flag), t = ctx.t, accMps = P.accessKph / 3.6, i, u, pv;
    var entries = [], skippedBusy = [], cut = [], turnout = turnoutOf(P, need.kind), nearestBusy = null, own = ctx.inc ? ctx.inc.id : null;
    for (i = 0; i < cands.length; i++) {
      u = cands[i];
      if (exclude && exclude[u.id]) continue;
      var straightM = haversineM(u.pos.lon, u.pos.lat, ctx.lon, ctx.lat);
      if (isBusy(nat, u, t, own)) { skippedBusy.push(u.id); if (!nearestBusy || straightM < nearestBusy.straightM) nearestBusy = { u: u, straightM: straightM }; continue; }
      pv = pathViaRev(W, ctx.S, ctx.cost.arr, u.pos, ctx.sc, true);
      if (!pv) { cut.push(u.id); continue; }
      var atBase = u.pos.edge === u.base.edge && u.pos.frac === u.base.frac && u.state === 'idle', accessStart = atBase ? u.base.accessM / accMps : 0;
      entries.push({ u: u, straightM: straightM, etaSnap: turnout + accessStart + pv.sec + ctx.sc.accessSec, accessStart: accessStart, turnout: turnout, accessM: atBase ? u.base.accessM : 0 });
    }
    entries.sort(function (a, b) { return a.etaSnap - b.etaSnap || a.straightM - b.straightM || a.u.idx - b.u.idx; });
    var evalSet = entries.slice(0, P.rankTopK), nearest = null;
    for (i = 0; i < entries.length; i++) if (!nearest || entries[i].straightM < nearest.straightM) nearest = entries[i];
    if (nearest && evalSet.indexOf(nearest) < 0) evalSet.push(nearest);
    evalSet.forEach(function (en) {
      var full = pathViaRev(W, ctx.S, ctx.cost.arr, en.u.pos, ctx.sc), ex;
      en.steps = full.steps;
      ex = evalSteps(nat, full.steps, t + en.turnout + en.accessStart, ctx.em);
      en.ex = ex; en.eta = en.turnout + en.accessStart + ex.sec + ctx.sc.accessSec;
      en.freeEta = en.turnout + en.accessStart + ex.freeSec + ctx.sc.accessSec;
      en.distM = ex.lenM + en.accessM + ctx.sc.distM;
      en.contraM = 0; full.steps.forEach(function (st) { if (st.a >= W.A) en.contraM += st.m; });
    });
    var ranked = evalSet.filter(function (en) { return isFin(en.eta); }).sort(function (a, b) { return a.eta - b.eta || a.straightM - b.straightM || a.u.idx - b.u.idx; });
    return { chosen: ranked[0] || null, runnerUp: ranked[1] || null, third: ranked[2] || null, nearest: nearest && isFin(nearest.eta) ? nearest : null, ranked: ranked, skippedBusy: skippedBusy, cut: cut, nearestBusy: nearestBusy, candidates: cands.length, considered: entries.length };
  }
  function whyFor(nat, pk, need, ctx) {
    var ch = pk.chosen, data, why;
    if (!ch) {
      why = T('لا توجد وحدة متاحة يمكنها الوصول', 'No available unit can reach the scene');
      return { why: why, data: { chosen: null, skippedBusy: pk.skippedBusy, cutOff: pk.cut } };
    }
    var nm = ch.u.name, near = pk.nearest, run = pk.runnerUp;
    data = { chosen: { id: ch.u.id, etaSec: Mth.round(ch.eta), roadM: Mth.round(ch.distM), straightM: Mth.round(ch.straightM), congestedSegments: ch.ex.congestedN, delaySec: Mth.round(ch.ex.delaySec || 0), contraflowM: Mth.round(ch.contraM || 0), top: ch.ex.congested },
      runnerUp: run ? { id: run.u.id, etaSec: Mth.round(run.eta), roadM: Mth.round(run.distM), straightM: Mth.round(run.straightM), congestedSegments: run.ex.congestedN, top: run.ex.congested } : null,
      nearestByStraight: near ? { id: near.u.id, etaSec: Mth.round(near.eta), roadM: Mth.round(near.distM), straightM: Mth.round(near.straightM), congestedSegments: near.ex.congestedN, top: near.ex.congested } : null,
      farButFaster: false, gainSec: 0, extraStraightM: 0, extraRoadM: 0, reason: null, skippedBusy: pk.skippedBusy, cutOff: pk.cut };
    if (near && near.u.id !== ch.u.id && near.eta - ch.eta > 5) {
      var gain = near.eta - ch.eta, extra = ch.straightM - near.straightM, extraRoad = ch.distM - near.distM;
      var nearTraffic = near.eta - near.freeEta, chTraffic = ch.eta - ch.freeEta, trafficDelta = nearTraffic - chTraffic, networkDelta = near.freeEta - ch.freeEta;
      var why1;
      if (trafficDelta >= networkDelta && near.ex.congested.length) {
        var sg = near.ex.congested[0];
        data.reason = 'traffic';
        why1 = T('ازدحام على «' + sg.name.ar + '» في طريق الوحدة الأقرب «' + near.u.name.ar + '» (' + near.ex.congestedN + ' قطع مزدحمة، +' + Mth.round(nearTraffic) + ' ث)', 'congestion on "' + sg.name.en + '" along the route of the nearer unit, ' + near.u.name.en + ' (' + near.ex.congestedN + ' slow segments, +' + Mth.round(nearTraffic) + ' s)');
      } else {
        data.reason = 'network';
        why1 = T('طريق الوحدة الأقرب «' + near.u.name.ar + '» الفعلي ' + km1(near.distM) + ' كم مقابل ' + km1(near.straightM) + ' كم بخط مستقيم، وعلى طرق أبطأ', 'the nearer unit, ' + near.u.name.en + ', has a road route of ' + km1(near.distM) + ' km against ' + km1(near.straightM) + ' km in a straight line, over slower roads');
      }
      data.farButFaster = extra > 50; data.gainSec = Mth.round(gain); data.extraStraightM = Mth.round(extra); data.extraRoadM = Mth.round(extraRoad); data.trafficDeltaSec = Mth.round(trafficDelta); data.networkDeltaSec = Mth.round(networkDelta);
      why = extra > 50
        ? T(nm.ar + ' أبعد بـ ' + km1(extra) + ' كم (بخط مستقيم) لكنها أسرع بـ ' + durT(gain).ar + ' لأن ' + why1.ar, nm.en + ' is ' + km1(extra) + ' km farther (straight line) but ' + durT(gain).en + ' faster because ' + why1.en)
        : T(nm.ar + ' أسرع بـ ' + durT(gain).ar + ' لأن ' + why1.ar, nm.en + ' is ' + durT(gain).en + ' faster because ' + why1.en);
    } else {
      why = run ? T('الأقرب والأسرع: وصول بعد ' + mmss(ch.eta) + ' (التالية: ' + run.u.name.ar + ' بعد ' + mmss(run.eta) + ')', 'Nearest and fastest: ETA ' + mmss(ch.eta) + ' (next: ' + run.u.name.en + ' at ' + mmss(run.eta) + ')')
        : T('الوحدة الوحيدة المتاحة: وصول بعد ' + mmss(ch.eta), 'The only available unit: ETA ' + mmss(ch.eta));
    }
    if (pk.nearestBusy && (!near || pk.nearestBusy.straightM < near.straightM)) {
      var bn = pk.nearestBusy.u.name;
      why = T(why.ar + ' — الأقرب ' + bn.ar + ' مشغولة فتُتجاوز', why.en + ' — the nearest, ' + bn.en + ', is busy and skipped');
      data.nearestBusy = pk.nearestBusy.u.id;
    }
    if (ch.contraM > 100) why = T(why.ar + ' — يشمل ' + Mth.round(ch.contraM) + ' م عكس اتجاه طريق أحادي (افتراض للطوارئ)', why.en + ' — includes ' + Mth.round(ch.contraM) + ' m against the one-way direction (emergency assumption)');
    if (pk.cut.length) { why = T(why.ar + ' — ' + pk.cut.length + ' وحدة معزولة بإغلاق الطرق', why.en + ' — ' + pk.cut.length + ' unit(s) cut off by road closures'); }
    return { why: why, data: data };
  }
  function planUnitFrom(nat, need, entry, pk, wy, ctx) {
    var t = ctx.t, u = entry ? entry.u : null, pu;
    if (!entry) return { slot: need.slot, kind: need.kind, optional: need.optional, standby: need.standby, unitId: null, name: KIND_NAME[need.kind], state: 'recommended', states: { recommended: t }, unreachable: true, etaSec: null, etaMin: null, distM: null, why: wy.why, whyData: wy.data, _trk: { steps: [], idx: 0, prog: 0 }, reroutes: 0, replaced: [] };
    pu = { slot: need.slot, kind: need.kind, flag: need.flag, optional: need.optional, standby: need.standby, unitId: u.id, name: u.name, flags: u.flags.slice(), state: 'recommended', states: { recommended: t },
      turnoutLeft: entry.turnout + entry.accessStart, endAccessLeft: ctx.sc.accessSec, etaSec: entry.eta, etaAtRec: entry.eta, freeEtaSec: entry.freeEta, distM: entry.distM, straightM: entry.straightM,
      why: wy.why, whyData: wy.data,
      runnerUp: pk.runnerUp ? { unitId: pk.runnerUp.u.id, name: pk.runnerUp.u.name, etaSec: Mth.round(pk.runnerUp.eta), distM: Mth.round(pk.runnerUp.distM) } : null,
      nearestByStraight: pk.nearest ? { unitId: pk.nearest.u.id, name: pk.nearest.u.name, straightM: Mth.round(pk.nearest.straightM), etaSec: Mth.round(pk.nearest.eta) } : null,
      reroutes: 0, replaced: [], coolUntil: 0, _trk: { steps: entry.steps, idx: 0, prog: 0 } };
    pu.etaMin = r1(pu.etaSec / 60);
    return pu;
  }

  function hospitalEligibility(nat, f, need) {
    var caps = f.caps || [];
    if (isRestricted(f)) return { ok: false, reason: 'restricted-access' };
    if (f.ed === 'no') return { ok: false, reason: 'no-ed' };
    if (need === 'trauma') return caps.indexOf('trauma1') >= 0 ? { ok: true, level: 'trauma1' } : { ok: false, reason: 'no-trauma-level-1' };
    if (need === 'paed') return caps.indexOf('paedED') >= 0 ? { ok: true, level: 'paedED' } : { ok: false, reason: 'no-paediatric-ed' };
    if (caps.indexOf('obstetric') >= 0) return { ok: false, reason: 'obstetric-only' };
    if (caps.indexOf('paedED') >= 0 && caps.indexOf('ed') < 0) return { ok: false, reason: 'paediatric-only' };
    if (f.ed === 'yes') return { ok: true, level: 'ed' };
    if (f.ed === 'unknown' && nat.P.edUnknownMode === 1 && f.facilityType === 'hospital') return { ok: true, level: 'ed-assumed', assumed: true };
    return { ok: false, reason: 'ed-unknown' };
  }
  function edFree(nat, hid) { return Mth.max(0, Mth.round(nat.P.edCapacity * (1 - nat.P.edOccupancyPct / 100)) - (nat.hosp[hid] || 0)); }
  // Fastest-to-reach hospital that can take the patients (forward Dijkstra from the scene at the time the ambulance will leave it)
  function pickHospital(nat, sc, patients, tDepart, ctxLL) {
    var W = nat.W, P = nat.P, cost = getCost(nat, tDepart, P.emergencyFactor), seeds = seedsLeaving(W, cost.arr, sc.edge, sc.frac), S = runTree(W, cost.arr, seeds, 'fwd', 1), accMps = P.accessKph / 3.6;
    var opts = [], skipped = [], i, fr, el, pv;
    for (i = 0; i < W.facs.length; i++) {
      fr = W.facs[i]; if (!isHospitalLike(fr.f)) continue;
      el = hospitalEligibility(nat, fr.f, patients.need);
      if (!el.ok) { skipped.push({ id: fr.id, reason: el.reason }); continue; }
      pv = pathViaFwd(W, S, cost.arr, sc, { edge: fr.edge, frac: fr.frac }, true);
      if (!pv) { skipped.push({ id: fr.id, reason: 'unreachable' }); continue; }
      var free = edFree(nat, fr.id);
      opts.push({ fr: fr, etaSec: pv.sec + fr.accessM / accMps, free: free, fits: free >= Mth.max(1, patients.n), level: el.level, assumed: !!el.assumed, straightM: haversineM(ctxLL.lon, ctxLL.lat, fr.lon, fr.lat) });
    }
    opts.sort(function (a, b) { return a.etaSec - b.etaSec; });
    var fits = opts.filter(function (o) { return o.fits; }), chosen = fits[0] || opts.slice().sort(function (a, b) { return b.free - a.free || a.etaSec - b.etaSec; })[0] || null;
    var nearest = opts.slice().sort(function (a, b) { return a.straightM - b.straightM; })[0] || null;
    if (!chosen) return { chosen: null, options: [], skipped: skipped, patients: patients, why: T('لا يوجد مستشفى طوارئ مؤكد يمكن الوصول إليه', 'No reachable hospital with a verified emergency department'), nearest: null };
    var full = pathViaFwd(W, S, cost.arr, sc, { edge: chosen.fr.edge, frac: chosen.fr.frac }), ex = evalSteps(nat, full.steps, tDepart, P.emergencyFactor);
    var f = chosen.fr.f, label = facLabel(W, chosen.fr);
    var edNote = chosen.assumed ? T('الطوارئ غير مؤكدة في البيانات (افتراض)', 'ED not confirmed in the data (assumption)') : f.edSrc === 'official' || f.edSrc === 'osm-tag+official' ? T('الطوارئ مؤكدة (قائمة رسمية)', 'ED confirmed (official list)') : T('الطوارئ من وسم OSM', 'ED from an OSM tag');
    var needAr = patients.need === 'trauma' ? 'مركز إصابات' : patients.need === 'paed' ? 'طوارئ أطفال' : 'قسم طوارئ', needEn = patients.need === 'trauma' ? 'a trauma centre' : patients.need === 'paed' ? 'a paediatric emergency department' : 'an emergency department';
    var why = T('أسرع مستشفى يصل إليه المصابون ويملك ' + needAr + (nearest && nearest.fr.id !== chosen.fr.id ? ' (الأقرب بخط مستقيم لا يستوفي الشرط أو أبطأ)' : '') + (chosen.fits ? '' : ' — السعة أقل من العدد (افتراض)') + (chosen.assumed ? ' — الطوارئ مفترضة' : ''),
      'Fastest hospital to reach that has ' + needEn + (nearest && nearest.fr.id !== chosen.fr.id ? ' (the nearest in a straight line does not qualify or is slower)' : '') + (chosen.fits ? '' : ' — capacity is below the number (assumption)') + (chosen.assumed ? ' — ED assumed' : ''));
    return { chosen: { id: chosen.fr.id, name: label, etaSec: Mth.round(ex.sec + chosen.fr.accessM / accMps), etaMin: r1((ex.sec + chosen.fr.accessM / accMps) / 60), distM: Mth.round(ex.lenM), straightM: Mth.round(chosen.straightM),
      lon: chosen.fr.lon, lat: chosen.fr.lat, freeSlots: chosen.free, fits: chosen.fits, level: chosen.level, assumed: chosen.assumed, ed: f.ed, edSrc: f.edSrc || null, edNote: edNote, route: decimate(stepsPolyline(W, full.steps), 300) },
      options: opts.slice(0, 5).map(function (o) { return { id: o.fr.id, name: facLabel(W, o.fr), etaSec: Mth.round(o.etaSec), free: o.free, fits: o.fits, assumed: o.assumed }; }),
      nearestByStraight: nearest ? { id: nearest.fr.id, name: facLabel(W, nearest.fr), etaSec: Mth.round(nearest.etaSec) } : null, skipped: skipped.length, patients: patients, why: why };
  }

  // The dispatch plan for an incident-like object at clock t. PURE: it reserves nothing and changes no state.
  //   inc = { hazard, lon, lat, severity?, patients?:{n, need}, id? }   → plan (see the API header)
  function buildPlan(nat, inc, t, opts) {
    opts = opts || {};
    var W = nat.W, P = nat.P, t0 = Date.now(), em = P.emergencyFactor, hazard = HAZARDS.indexOf(inc.hazard) >= 0 ? inc.hazard : 'sos', severity = clamp(Mth.round(inc.severity || 2), 1, 3);
    var sc = sceneOf(nat, inc.lon, inc.lat);
    if (!sc) return null;
    var cost = getCost(nat, t, em), seeds = seedsReaching(W, cost.arr, sc.edge, sc.frac), S = runTree(W, cost.arr, seeds, 'rev', 0);
    var ctx = { S: S, cost: cost, sc: sc, t: t, em: em, inc: opts.incident || null, lon: inc.lon, lat: inc.lat };
    var needs = requiredUnits(hazard, severity, P), exclude = opts.exclude ? Object.assign({}, opts.exclude) : {}, units = [], picks = [];
    needs.forEach(function (need) {
      var pk = pickFor(nat, ctx, need, exclude), wy = whyFor(nat, pk, need, ctx), pu = planUnitFrom(nat, need, pk.chosen, pk, wy, ctx);
      if (pk.chosen) exclude[pk.chosen.u.id] = true;
      units.push(pu); picks.push(pk);
    });
    var patients = patientsOf(hazard, inc.patients), hospital = null;
    if (patients.n > 0) {
      var amb = units.filter(function (u) { return u.kind === 'ambulance' && u.unitId; })[0];
      hospital = pickHospital(nat, sc, patients, t + (amb ? amb.etaSec : 0) + P.loadSec, inc);
    }
    var plan = { id: 'D-' + (inc.id || 'X'), incident: inc.id || null, state: 'recommended', origin: 'manara', scope: 'national', hazard: hazard, severity: severity,
      scene: { lon: inc.lon, lat: inc.lat, edge: sc.edge, frac: r5(sc.frac), roadLon: r5(sc.lon), roadLat: r5(sc.lat), snapM: Mth.round(sc.distM) },
      t: { recommended: t }, patients: patients, units: units, hospital: hospital, sim: true,
      notes: [T('المحاكاة وهمية: مواقع الوحدات وتوفّرها والازدحام محاكاة، و999 تبقى المُرسِل', 'Simulation: unit positions, availability and traffic are simulated; 999 stays the dispatcher')],
      perf: { ms: Date.now() - t0 } };
    if (hazard === 'heat') plan.notes.push(T('تُوصى أيضاً بدعم تبريد في الموقع (ظل، ماء) — لا وحدة له في البيانات', 'Cooling support on site (shade, water) is also recommended — there is no unit type for it in the data'));
    if (hazard === 'dust') plan.notes.push(T('الإسعاف في وضع الاستعداد للحالات التنفسية', 'Ambulance on standby for respiratory cases'));
    return plan;
  }
  // the public pure function (also used by tests and the A/B)
  function dispatchNational(nat, incident, t) { return buildPlan(nat, incident, t === undefined ? nat.t : t); }

  /* ====================================================================================
   * 10. INCIDENT LIFECYCLE: recommended → approved → dispatched → en-route → on-scene → cleared,
   *     with ETA countdown, automatic RE-ROUTING of en-route units and automatic RE-DISPATCH when traffic / closures / busy units change the ranking
   * ==================================================================================== */
  var BASE_RADIUS = { fire: 150, gas: 300, flood: 400, dust: 5000, heat: 1000, sos: 50 };
  function updateSeverity(nat, inc) {
    var P = nat.P, t = nat.t, base = 0.25 + 0.15 * inc.severity, smax = clamp(0.5 + 0.2 * inc.severity, 0, 1), dtm = Mth.max(0, t - inc.tStart), g, sev = base;
    if (inc.hazard === 'fire') { g = 1 - Mth.exp(-dtm / (60 * P.fireGrowthMin)); sev = base + (smax - base) * g; }
    else if (inc.hazard === 'gas') { g = 1 - Mth.exp(-dtm / (60 * P.gasGrowthMin)); sev = base + (smax - base) * g; }
    else sev = base;
    if (inc.supAt !== null && inc.supAt !== undefined && t > inc.supAt) sev *= Mth.exp(-(P.engineEffectPct / 100) * (t - inc.supAt) / 600);
    inc.sev = sev; inc.radiusM = Mth.round(BASE_RADIUS[inc.hazard] * (0.4 + 0.9 * sev));
  }
  function reservePlan(nat, inc) {
    var plan = inc.plan;
    plan.units.forEach(function (pu) {
      if (!pu.unitId) return;
      var u = nat.fleet.byId[pu.unitId];
      u.assigned = inc.id; u.slot = pu.slot;
      if (u.state === 'returning') { u.ret = null; u.state = 'idle'; }
    });
    plan._hosp = null;
    if (plan.hospital && plan.hospital.chosen) { plan._hosp = { id: plan.hospital.chosen.id, n: Mth.max(1, plan.patients.n) }; nat.hosp[plan._hosp.id] = (nat.hosp[plan._hosp.id] || 0) + plan._hosp.n; }
  }
  function releaseHospital(nat, plan) { if (plan._hosp) { nat.hosp[plan._hosp.id] = Mth.max(0, (nat.hosp[plan._hosp.id] || 0) - plan._hosp.n); plan._hosp = null; } }
  function releaseUnitFromPlan(nat, pu, startReturnTrip) {
    if (!pu.unitId) return;
    var u = nat.fleet.byId[pu.unitId];
    u.assigned = null; u.slot = null;
    if (u.state === 'turnout') u.state = 'idle';
    else if (u.state === 'en-route' || u.state === 'on-scene') { if (startReturnTrip) startReturn(nat, u); else u.state = 'idle'; }
  }
  function startReturn(nat, u) {
    var W = nat.W, cost = getCost(nat, nat.t, 1), seeds = seedsLeaving(W, cost.arr, u.pos.edge, u.pos.frac), S = runTree(W, cost.arr, seeds, 'fwd', 1), pv = pathViaFwd(W, S, cost.arr, u.pos, { edge: u.base.edge, frac: u.base.frac });
    if (pv && pv.steps.length) { u.ret = { steps: pv.steps, idx: 0, prog: 0 }; u.state = 'returning'; }
    else { u.pos = { edge: u.base.edge, frac: u.base.frac, lon: u.base.lon, lat: u.base.lat }; u.state = 'idle'; u.ret = null; }
  }
  // move along a track for dt seconds; returns the seconds left over when the track is finished, or -1 while still driving
  function advance(nat, trk, u, dt, em, ctxNow) {
    var W = nat.W, rem = dt, st, v, left, need, frac;
    while (rem > 1e-9 && trk.idx < trk.steps.length) {
      st = trk.steps[trk.idx];
      if (nat.closed[st.e]) { trk.blocked = true; rem = 0; break; }
      trk.blocked = false;
      v = arcSpeedMps(nat, st.a, arcCong(nat, ctxNow, st.a), em);
      left = Mth.max(0, st.m - trk.prog); need = left / v;
      if (need <= rem) { rem -= need; trk.idx++; trk.prog = 0; } else { trk.prog += v * rem; rem = 0; }
    }
    if (trk.idx < trk.steps.length) {
      st = trk.steps[trk.idx]; frac = st.m > 0 ? st.f0 + (st.f1 - st.f0) * clamp(trk.prog / st.m, 0, 1) : st.f1;
      var ll = pointAtEdge(W, st.e, frac); u.pos = { edge: st.e, frac: frac, lon: ll[0], lat: ll[1] };
      return -1;
    }
    if (trk.steps.length) { st = trk.steps[trk.steps.length - 1]; var l2 = pointAtEdge(W, st.e, st.f1); u.pos = { edge: st.e, frac: st.f1, lon: l2[0], lat: l2[1] }; }
    return rem;
  }
  function remainingSteps(trk) {
    var out = [], i, st, k;
    for (i = trk.idx; i < trk.steps.length; i++) {
      st = trk.steps[i];
      if (i === trk.idx && trk.prog > 0 && st.m > 0) { k = clamp(trk.prog / st.m, 0, 1); out.push({ a: st.a, e: st.e, f0: st.f0 + (st.f1 - st.f0) * k, f1: st.f1, m: Mth.max(0, st.m - trk.prog) }); }
      else out.push(st);
    }
    return out;
  }
  function remainingSnap(nat, cost, trk) {
    var G = nat.W.G, sum = 0, i, st, c, len, m;
    for (i = trk.idx; i < trk.steps.length; i++) {
      st = trk.steps[i]; c = cost[st.a]; if (c === INF) return INF;
      len = nat.W.aLen[st.a]; m = i === trk.idx ? Mth.max(0, st.m - trk.prog) : st.m; sum += c * (len > 0 ? m / len : 0);
    }
    return sum;
  }
  function approvePlan(nat, inc) {
    var plan = inc.plan;
    if (!plan || plan.state !== 'recommended') return false;
    plan.state = 'approved'; plan.t.approved = nat.t; plan.acceptAt = nat.t + nat.P.acceptSec; inc.status = 'approved';
    plan.units.forEach(function (pu) { if (pu.unitId) { pu.state = 'approved'; pu.states.approved = nat.t; } });
    evt(nat, 'dispatch-approved', { incident: inc.id }, 'اعتُمدت حزمة الحادث المتحقَّق منها وأُرسلت إلى غرفة التحكم (999 تبقى المُرسِل)', 'The verified incident package was approved and sent to the control room (999 stays the dispatcher)');
    return true;
  }
  function acceptPlan(nat, inc) {
    var plan = inc.plan; plan.state = 'dispatched'; plan.t.dispatched = nat.t; inc.status = 'dispatched';
    plan.units.forEach(function (pu) {
      if (!pu.unitId) return;
      pu.state = 'dispatched'; pu.states.dispatched = nat.t; nat.fleet.byId[pu.unitId].state = 'turnout';
    });
    evt(nat, 'dispatched', { incident: inc.id }, 'قبلت غرفة التحكم الحزمة وأرسلت الوحدات', 'The control room accepted the package and dispatched the units');
  }
  function stepIncident(nat, inc, dt, ctxNow) {
    var plan = inc.plan, P = nat.P, t = nat.t;
    updateSeverity(nat, inc);
    if (!plan || plan.state === 'cleared') return;
    if (plan.state === 'recommended') { if (nat.autoApprove && t - plan.t.recommended >= P.approveSec) approvePlan(nat, inc); }
    else if (plan.state === 'approved') { if (t >= plan.acceptAt) acceptPlan(nat, inc); }
    var anyLive = false, anyOn = false, anyEn = false, anyUnit = false, allCleared = true;
    plan.units.forEach(function (pu) {
      if (!pu.unitId) return;
      anyUnit = true;
      var u = nat.fleet.byId[pu.unitId], moveDt = 0;
      if (pu.state === 'dispatched') {
        pu.turnoutLeft -= dt; pu.etaSec = Mth.max(0, pu.etaSec - dt);
        if (pu.turnoutLeft <= 0) { moveDt = Mth.min(dt, -pu.turnoutLeft); pu.turnoutLeft = 0; pu.state = 'en-route'; pu.states['en-route'] = t; u.state = 'en-route';
          evt(nat, 'unit-en-route', { incident: inc.id, unit: u.id, kind: pu.kind }, 'انطلقت ' + u.name.ar + ' إلى الموقع', u.name.en + ' is on its way'); }
      } else if (pu.state === 'en-route') { moveDt = dt; pu.etaSec = Mth.max(0, pu.etaSec - dt); }
      if (pu.state === 'en-route' && moveDt > 0) {
        var left = advance(nat, pu._trk, u, moveDt, P.emergencyFactor, ctxNow);
        if (left >= 0) {
          pu.endAccessLeft -= left;
          if (pu.endAccessLeft <= 0) {
            pu.state = 'on-scene'; pu.states['on-scene'] = t; pu.onSceneAt = t; pu.etaSec = 0; u.state = 'on-scene'; u.pos = { edge: u.pos.edge, frac: u.pos.frac, lon: inc.lon, lat: inc.lat };
            if ((pu.kind === 'fire' || pu.kind === 'rescue') && (inc.hazard === 'fire' || inc.hazard === 'gas') && (inc.supAt === null || inc.supAt === undefined)) inc.supAt = t + P.engineSetupSec;
            if (pu.kind === 'police' && P.autoCordon && (inc.hazard === 'fire' || inc.hazard === 'gas' || inc.hazard === 'flood') && !nat.cordons[inc.id]) setCordon(nat, inc.id);
            evt(nat, 'unit-on-scene', { incident: inc.id, unit: u.id, kind: pu.kind }, 'وصلت ' + u.name.ar + ' إلى الموقع', u.name.en + ' is on scene');
          }
        }
      }
      if (pu.state === 'on-scene' && t - pu.onSceneAt >= P.onSceneSec) {
        pu.state = 'cleared'; pu.states.cleared = t; u.assigned = null; u.slot = null; u.missions++; startReturn(nat, u);
        evt(nat, 'unit-cleared', { incident: inc.id, unit: u.id, kind: pu.kind }, 'أُغلقت مهمة ' + u.name.ar, u.name.en + ' cleared');
      }
      if (pu.state !== 'cleared') allCleared = false;
      if (pu.state === 'on-scene') anyOn = true; else if (pu.state === 'en-route') anyEn = true;
      if (pu.state !== 'cleared') anyLive = true;
    });
    if (plan.state === 'dispatched' && anyEn) { plan.state = 'en-route'; plan.t['en-route'] = t; inc.status = 'en-route'; }
    if ((plan.state === 'dispatched' || plan.state === 'en-route') && anyOn) { plan.state = 'on-scene'; plan.t['on-scene'] = t; inc.status = 'on-scene'; }
    if (!anyUnit && plan.state !== 'recommended' && t - inc.tStart >= P.onSceneSec) { allCleared = true; anyUnit = true; }
    if (anyUnit && allCleared && plan.state !== 'recommended' && plan.state !== 'approved') {
      plan.state = 'cleared'; plan.t.cleared = t; inc.status = 'cleared'; inc.tCleared = t; releaseHospital(nat, plan); nat.incVer++; liftCordon(nat, inc.id, true);
      evt(nat, 'incident-cleared', { incident: inc.id }, 'أُغلق الحادث ' + inc.id, 'Incident ' + inc.id + ' cleared');
    }
  }
  function stepReturning(nat, u, dt, ctxNow) {
    var left = advance(nat, u.ret, u, dt, 1, ctxNow);
    if (left >= 0 || u.ret.steps.length === 0) { u.state = 'idle'; u.ret = null; u.pos = { edge: u.base.edge, frac: u.base.frac, lon: u.base.lon, lat: u.base.lat }; }
  }
  var FLOOD_DEPTH_CAP_CM = 150;      // beyond this the water spreads out of the underpass (a modelling cap, not a measurement)
  function updateFlood(nat, dt) {
    var P = nat.P, W = nat.W, t = nat.t, wet = P.rainMmHr > 0 || nat.floodWet, i, tun, r, d, closedNow = [], openedNow = [], any = false;
    if (!wet) { for (i = 0; i < nat.rainCells.length; i++) if (t >= nat.rainCells[i].t0 && t <= nat.rainCells[i].t1) { wet = true; break; } }
    if (!wet) return;
    var step = function (rec, lon, lat, edges, sump) {
      r = rainAtLL(nat, t, lon, lat);
      d = rec.depthCm + (r * P.underpassCatchment * sump - P.underpassPumpCmH) * dt / 3600;
      if (d < 0) d = 0; else if (d > FLOOD_DEPTH_CAP_CM) d = FLOOD_DEPTH_CAP_CM;
      rec.depthCm = d; if (d > 0) any = true;
      if (!rec.closed && d >= P.roadCloseCm) { rec.closed = true; edges.forEach(function (e) { if (!nat.closed[e]) { nat.closed[e] = rec.pond ? 3 : 2; nat.closedN++; closedNow.push(e); } }); }
      else if (rec.closed && d <= P.roadOpenCm) { rec.closed = false; edges.forEach(function (e) { if (nat.closed[e] === 2 || nat.closed[e] === 3) { nat.closed[e] = 0; nat.closedN = Mth.max(0, nat.closedN - 1); openedNow.push(e); } }); }
    };
    for (i = 0; i < nat.flood.tunnels.length; i++) { tun = nat.flood.tunnels[i]; step(tun, W.eMidLon[tun.e], W.eMidLat[tun.e], [tun.e], tun.sump); }
    for (i = 0; i < nat.ponds.length; i++) { nat.ponds[i].pond = true; step(nat.ponds[i], nat.ponds[i].lon, nat.ponds[i].lat, nat.ponds[i].edges, nat.ponds[i].sump); }
    nat.floodWet = any;
    if (closedNow.length || openedNow.length) { bumpVer(nat); markDirty(nat); }
    // one event per five minutes, not one per tunnel
    var ag = nat.floodAgg || (nat.floodAgg = { closed: [], opened: [], since: t });
    ag.closed = ag.closed.concat(closedNow); ag.opened = ag.opened.concat(openedNow);
    if ((ag.closed.length || ag.opened.length) && t - ag.since >= 300) {
      var nm;
      if (ag.closed.length) { nm = edgeName(W, ag.closed[0]); evt(nat, 'underpasses-closed', { n: ag.closed.length, edges: ag.closed.slice(0, 20) }, 'أُغلق ' + ag.closed.length + ' نفق/معبر بسبب مياه الأمطار (محاكاة)، منها «' + nm.ar + '»', ag.closed.length + ' underpass(es) closed by rain water (simulated), e.g. "' + nm.en + '"'); }
      if (ag.opened.length) evt(nat, 'underpasses-reopened', { n: ag.opened.length, edges: ag.opened.slice(0, 20) }, 'أُعيد فتح ' + ag.opened.length + ' نفق/معبر', ag.opened.length + ' underpass(es) re-opened');
      ag.closed = []; ag.opened = []; ag.since = t;
    } else if (!ag.closed.length && !ag.opened.length) ag.since = t;
  }

  // ---- creating and operating incidents
  function createIncident(nat, o) {
    o = o || {};
    var hazard = HAZARDS.indexOf(o.hazard) >= 0 ? o.hazard : 'sos', id = 'N' + (++nat.incSeq), t = nat.t;
    if (!isNum(o.lon) || !isNum(o.lat)) { o = { hazard: o.hazard, lon: 0, lat: 0, severity: o.severity, patients: o.patients, label: o.label }; }     // no usable position: the incident is cancelled below (no road within reach)
    var inc = { id: id, seq: nat.incSeq, hazard: hazard, lon: o.lon, lat: o.lat, severity: clamp(Mth.round(o.severity || 2), 1, 3), sev: 0.3, radiusM: 100, patients: patientsOf(hazard, o.patients), tStart: t, status: 'recommended',
      label: o.label || null, supAt: null, plan: null, tCleared: null };
    inc.muni = nat.W.geo.municipalityAt(o.lon, o.lat); inc.place = nearestPlace(nat.W, o.lon, o.lat);
    inc.snap = sceneOf(nat, o.lon, o.lat);
    updateSeverity(nat, inc);
    var hn = HAZARD_NAME[hazard], pl = inc.place;
    evt(nat, 'incident', { incident: id, hazard: hazard, lon: o.lon, lat: o.lat }, 'حادث جديد (محاكاة): ' + hn.ar + (pl ? ' قرب ' + pl.name.ar : ''), 'New incident (simulation): ' + hn.en + (pl ? ' near ' + pl.name.en : ''));
    if (!inc.snap) { inc.status = 'cancelled'; nat.incidents.push(inc); evt(nat, 'incident-unreachable', { incident: id }, 'الموقع بعيد عن أي طريق في البيانات', 'The location is too far from any road in the data'); return inc; }
    var plan = buildPlan(nat, inc, t, { incident: inc });
    inc.plan = plan; reservePlan(nat, inc);
    nat.incidents.push(inc); nat.incVer++; nat.stats.dispatches++;
    var first = INF; plan.units.forEach(function (pu) { if (pu.unitId && !pu.optional && pu.etaAtRec < first) first = pu.etaAtRec; });
    inc.firstEtaSec = isFin(first) ? Mth.round(first) : null; if (inc.firstEtaSec !== null) nat.stats.firstEta.push(inc.firstEtaSec);
    evt(nat, 'dispatch-recommended', { incident: id, units: plan.units.map(function (u) { return u.kind + ':' + u.unitId; }) },
      'توصية الإرسال: ' + plan.units.map(function (u) { return KIND_NAME[u.kind].ar + ' ← ' + (u.unitId ? u.name.ar + ' (' + mmss(u.etaSec) + ')' : '—'); }).join('، '),
      'Dispatch recommended: ' + plan.units.map(function (u) { return KIND_NAME[u.kind].en + ' ← ' + (u.unitId ? u.name.en + ' (' + mmss(u.etaSec) + ')' : '—'); }).join(', '));
    plan.units.forEach(function (u) { if (u.whyData && u.whyData.farButFaster) evt(nat, 'far-but-faster', { incident: id, kind: u.kind, unit: u.unitId, gainSec: u.whyData.gainSec, extraStraightM: u.whyData.extraStraightM }, u.why.ar, u.why.en); });
    return inc;
  }
  function getIncident(nat, id) { for (var i = 0; i < nat.incidents.length; i++) if (nat.incidents[i].id === id) return nat.incidents[i]; return null; }
  function approve(nat, id) { var inc = getIncident(nat, id); return inc ? approvePlan(nat, inc) : false; }
  function cancelIncident(nat, id) {
    var inc = getIncident(nat, id); if (!inc || inc.status === 'cleared' || inc.status === 'cancelled') return false;
    if (inc.plan) { inc.plan.units.forEach(function (pu) { releaseUnitFromPlan(nat, pu, true); pu.state = 'cleared'; }); releaseHospital(nat, inc.plan); inc.plan.state = 'cleared'; }
    inc.status = 'cancelled'; nat.incVer++; liftCordon(nat, id, true);
    evt(nat, 'incident-cancelled', { incident: id }, 'أُلغي الحادث ' + id, 'Incident ' + id + ' cancelled');
    return true;
  }
  function refreshRecommendation(nat, inc) {
    var plan = inc.plan, oldIds = plan.units.map(function (u) { return u.unitId; }).join(','), np, newIds;
    plan.units.forEach(function (pu) { if (pu.unitId) { var u = nat.fleet.byId[pu.unitId]; u.assigned = null; u.slot = null; } });
    releaseHospital(nat, plan);
    np = buildPlan(nat, inc, nat.t, { incident: inc });
    if (!np) { reservePlan(nat, inc); return; }
    newIds = np.units.map(function (u) { return u.unitId; }).join(',');
    np.t = plan.t; np.id = plan.id;
    inc.plan = np; reservePlan(nat, inc);
    if (oldIds !== newIds) {
      var gain = 0; np.units.forEach(function (u) { if (u.whyData && u.whyData.gainSec) gain = Mth.max(gain, u.whyData.gainSec); });
      evt(nat, 'recommendation-change', { incident: inc.id, gainSec: gain }, 'تغيّرت التوصية بسبب حالة الطرق أو توفّر الوحدات', 'The recommendation changed (road conditions or unit availability)');
    }
  }
  function recheckPlan(nat, inc) {
    var W = nat.W, P = nat.P, plan = inc.plan, t = nat.t, em = P.emergencyFactor, sc = inc.snap, cost = getCost(nat, t, em), S, ctx, exclude = {};
    S = runTree(W, cost.arr, seedsReaching(W, cost.arr, sc.edge, sc.frac), 'rev', 0);
    ctx = { S: S, cost: cost, sc: sc, t: t, em: em, inc: inc, lon: inc.lon, lat: inc.lat };
    plan.units.forEach(function (pu) { if (pu.unitId) exclude[pu.unitId] = true; });
    plan.units.forEach(function (pu) {
      if (!pu.unitId || pu.state === 'on-scene' || pu.state === 'cleared') return;
      var u = nat.fleet.byId[pu.unitId], trk = pu._trk, reason = null, alt, cur, curArc, ex, other, gain;
      if (P.divertPctPerHour > 0 && (pu.state === 'en-route' || pu.state === 'dispatched') && hr(nat.seed, D.DIVERT, u.idx, Mth.floor(t / P.recheckSec)) < P.divertPctPerHour / 100 * P.recheckSec / 3600) { u.busyUntil = t + 1200; evt(nat, 'unit-busy', { unit: u.id, incident: inc.id }, 'حُوِّلت ' + u.name.ar + ' إلى نداء آخر', u.name.en + ' was diverted to another call'); }
      if (u.busyOverride === true || u.busyUntil > t) reason = 'busy';
      // re-route (the unit keeps its direction of travel)
      if (!reason && (pu.state === 'en-route' || pu.state === 'dispatched' || pu.state === 'approved') && trk.idx < trk.steps.length) {
        curArc = pu.state === 'en-route' ? trk.steps[trk.idx].a : undefined;
        cur = remainingSnap(nat, cost.arr, trk);
        alt = pathViaRev(W, S, cost.arr, u.pos, sc, false, curArc);
        if (alt && (cur === INF || cur - alt.sec >= P.rerouteGainSec)) {
          var gainR = cur === INF ? 0 : cur - alt.sec;
          pu._trk = trk = { steps: alt.steps, idx: 0, prog: 0 }; pu.reroutes++; nat.stats.reroutes++;
          evt(nat, 'reroute-unit', { incident: inc.id, unit: u.id, gainSec: Mth.round(gainR), blocked: cur === INF }, 'غيّرت ' + u.name.ar + ' مسارها' + (cur === INF ? ' (طريق مغلق)' : ' ووفّرت ' + durT(gainR).ar), u.name.en + ' re-routed' + (cur === INF ? ' (road closed)' : ', saving ' + durT(gainR).en));
        } else if (!alt && cur === INF) reason = 'blocked';
      }
      if (!reason && trk.blocked && pu.state === 'en-route') reason = 'blocked';
      // refresh the ETA with the exact, time-dependent evaluation
      if (trk.steps.length || pu.state !== 'en-route') {
        ex = evalSteps(nat, remainingSteps(trk), t + Mth.max(0, pu.turnoutLeft), em);
        if (isFin(ex.sec)) pu.etaSec = Mth.max(0, pu.turnoutLeft) + ex.sec + pu.endAccessLeft;
      }
      pu.etaMin = r1(pu.etaSec / 60);
      // re-dispatch: a farther unit that is now faster, or a unit that is busy / cut off
      if (t >= pu.coolUntil) {
        var ex2 = {}; Object.keys(exclude).forEach(function (k) { ex2[k] = true; });
        other = pickFor(nat, ctx, { kind: pu.kind, flag: pu.flag }, ex2);
        if (other.chosen) {
          gain = pu.etaSec - other.chosen.eta;
          if (reason || gain >= P.redispatchMarginSec) { swapUnit(nat, inc, pu, other, reason || 'faster', Mth.max(0, gain), ctx); exclude[other.chosen.u.id] = true; }
        } else if (reason === 'busy' && !pu.degraded) { pu.degraded = true; evt(nat, 'dispatch-degraded', { incident: inc.id, unit: u.id }, 'الوحدة مشغولة ولا بديل متاح', 'The unit is busy and no replacement is available'); }
      }
    });
  }
  function swapUnit(nat, inc, pu, pk, reason, gain, ctx) {
    var oldU = nat.fleet.byId[pu.unitId], en = pk.chosen, nu = en.u, wy = whyFor(nat, pk, { kind: pu.kind }, ctx), t = nat.t, plan = inc.plan;
    releaseUnitFromPlan(nat, pu, true);
    nu.assigned = inc.id; nu.slot = pu.slot; if (nu.state === 'returning') { nu.ret = null; nu.state = 'idle'; }
    pu.replaced.push({ unitId: oldU.id, t: t, reason: reason });
    var rsAr = { busy: 'صارت مشغولة', blocked: 'الطريق مغلق', faster: 'وحدة أخرى أسرع الآن' }[reason], rsEn = { busy: 'became busy', blocked: 'road closed', faster: 'another unit is faster now' }[reason];
    pu.unitId = nu.id; pu.name = nu.name; pu.flags = nu.flags.slice(); pu.turnoutLeft = en.turnout + en.accessStart; pu.endAccessLeft = ctx.sc.accessSec; pu.etaSec = en.eta; pu.etaAtRec = pu.etaAtRec; pu.freeEtaSec = en.freeEta; pu.distM = en.distM; pu.straightM = en.straightM;
    pu._trk = { steps: en.steps, idx: 0, prog: 0 }; pu.degraded = false; pu.blocked = false; pu.coolUntil = t + nat.P.cooldownSec; pu.etaMin = r1(pu.etaSec / 60);
    pu.why = T(wy.why.ar + ' — إعادة إرسال: ' + rsAr, wy.why.en + ' — re-dispatch: ' + rsEn); pu.whyData = wy.data;
    pu.runnerUp = pk.runnerUp ? { unitId: pk.runnerUp.u.id, name: pk.runnerUp.u.name, etaSec: Mth.round(pk.runnerUp.eta), distM: Mth.round(pk.runnerUp.distM) } : null;
    pu.nearestByStraight = pk.nearest ? { unitId: pk.nearest.u.id, name: pk.nearest.u.name, straightM: Mth.round(pk.nearest.straightM), etaSec: Mth.round(pk.nearest.eta) } : null;
    if (plan.state === 'dispatched' || plan.state === 'en-route' || plan.state === 'on-scene') { pu.state = 'dispatched'; pu.states.dispatched = t; nu.state = 'turnout'; }
    nat.stats.redispatches++;
    evt(nat, 'redispatch', { incident: inc.id, kind: pu.kind, from: oldU.id, to: nu.id, reason: reason, gainSec: Mth.round(gain) },
      'إعادة إرسال: ' + KIND_NAME[pu.kind].ar + ' من «' + oldU.name.ar + '» إلى «' + nu.name.ar + '» (' + rsAr + ')', 'Re-dispatch: ' + KIND_NAME[pu.kind].en + ' from "' + oldU.name.en + '" to "' + nu.name.en + '" (' + rsEn + ')');
  }
  function recheckAll(nat) {
    var i, inc;
    nat.nextRecheck = nat.t + nat.P.recheckSec; nat.dirty = false;
    for (i = 0; i < nat.incidents.length; i++) {
      inc = nat.incidents[i];
      if (!inc.plan || inc.status === 'cleared' || inc.status === 'cancelled' || !inc.snap) continue;
      if (inc.plan.state === 'recommended') refreshRecommendation(nat, inc); else recheckPlan(nat, inc);
    }
    if (nat.incKey !== nat.incVer + '|' + nat.P.incidentSlowPct) rebuildIncidentSlow(nat);
  }
  function tick(nat) {
    var dt = nat.tick, i, u, moving = false, ctxNow;
    nat.t += dt;
    updateFlood(nat, dt);
    for (i = 0; i < nat.fleet.units.length; i++) if (nat.fleet.units[i].state === 'en-route' || nat.fleet.units[i].state === 'returning') { moving = true; break; }
    if (moving) { ctxNow = timeCtx(nat, nat.t); ensureOverlays(nat, ctxNow); }
    for (i = 0; i < nat.incidents.length; i++) if (nat.incidents[i].status !== 'cleared' && nat.incidents[i].status !== 'cancelled') stepIncident(nat, nat.incidents[i], dt, ctxNow || timeCtx(nat, nat.t));
    for (i = 0; i < nat.fleet.units.length; i++) { u = nat.fleet.units[i]; if (u.state === 'returning') stepReturning(nat, u, dt, ctxNow || timeCtx(nat, nat.t)); }
    if (nat.t >= nat.nextRecheck) recheckAll(nat);
  }
  function step(nat, dt) {
    nat.acc += dt === undefined ? nat.tick : Mth.max(0, +dt || 0);
    while (nat.acc >= nat.tick - 1e-9) { nat.acc -= nat.tick; tick(nat); }
    return nat;
  }
  function run(nat, untilT) { while (nat.t + 1e-9 < untilT) tick(nat); return nat; }

  /* ====================================================================================
   * 11. MESSAGE KEYS (MANARA_MSG-compatible: the integration agent may copy them into messages.js), KPIs, advisories, municipality status
   * ==================================================================================== */
  var SIM_LABEL = T('محاكاة — فحص لآلية العمل وليس دليلاً على الأثر', 'SIMULATION — a mechanism check, not proof of impact');
  var MSG = {
    'nat.sim':               T('محاكاة (SIM): مواقع الوحدات وتوفّرها والازدحام وحقول الحرارة والغبار والمطر كلها محاكاة؛ الخريطة لقطة من OpenStreetMap', 'SIM: unit positions, availability, traffic and the heat / dust / rain fields are all simulated; the map is a snapshot of OpenStreetMap'),
    'nat.call999':           T('في الطوارئ اتصل بـ 999 — منارة ليست خدمة رسمية وهذه المعلومات للاسترشاد فقط', 'In an emergency call 999 — MANARA is not an official service and this is informational only'),
    'nat.credit':            T('© مساهمو OpenStreetMap — رخصة ODbL', 'Contains data © OpenStreetMap contributors, ODbL 1.0'),
    'nat.adv.heat.warn':     T('{muni}: إجهاد حراري محتمل (WBGT تقديري {wbgt} °م). خذ فترات راحة واشرب الماء واستظل.', '{muni}: heat stress possible (WBGT estimate {wbgt} °C). Take breaks, drink water, use shade.'),
    'nat.adv.heat.stop':     T('{muni}: أوقفوا العمل — WBGT التقديري {wbgt} °م فوق حدّ الإيقاف {limit} °م. الرقم القانوني يُقاس بمقياس WBGT.', '{muni}: stop work — WBGT estimate {wbgt} °C is above the {limit} °C stop-work limit. The legal figure is a measured WBGT.'),
    'nat.adv.heat.ban':      T('حظر العمل في الهواء الطلق من {from} إلى {to} (من 1 يونيو إلى 15 سبتمبر — قرار وزاري رقم 17 لسنة 2021).', 'Outdoor work is banned {from}–{to} (1 June to 15 September — Ministerial Decision 17 of 2021).'),
    'nat.adv.dust.warn':     T('{muni}: غبار مرتفع (PM10 تقديري {pm10} µg/m³) — ابقَ في الداخل وأغلق النوافذ.', '{muni}: high dust (PM10 estimate {pm10} µg/m³) — stay indoors and close windows.'),
    'nat.adv.dust.danger':   T('{muni}: غبار خطر (PM10 تقديري {pm10} µg/m³) — أوقف القيادة والعمل في الخارج.', '{muni}: dangerous dust (PM10 estimate {pm10} µg/m³) — stop driving and outdoor work.'),
    'nat.adv.dust.critical': T('{muni}: غبار حرج (PM10 تقديري {pm10} µg/m³) — الجأ إلى مبنى مغلق فوراً.', '{muni}: critical dust (PM10 estimate {pm10} µg/m³) — get into a closed building now.'),
    'nat.adv.flood.watch':   T('{muni}: أمطار {mm} مم/س (محاكاة) — ابتعد عن الأنفاق والمعابر المنخفضة.', '{muni}: rain {mm} mm/h (simulated) — keep away from tunnels and low underpasses.'),
    'nat.adv.flood.underpass': T('أُغلق {n} نفق/معبر بسبب مياه الأمطار (محاكاة) — لا تعبر الماء.', '{n} underpass(es) closed by rain water (simulated) — never drive through water.'),
    'nat.adv.traffic.heavy': T('ازدحام شديد في أنحاء البلاد (محاكاة): أزمنة الوصول أطول من المعتاد.', 'Heavy traffic across the country (simulated): arrival times are longer than usual.'),
    'nat.unit.state.recommended': T('مُوصى بها', 'Recommended'), 'nat.unit.state.approved': T('معتمدة', 'Approved'), 'nat.unit.state.dispatched': T('أُرسلت', 'Dispatched'),
    'nat.unit.state.en-route': T('في الطريق', 'En route'), 'nat.unit.state.on-scene': T('في الموقع', 'On scene'), 'nat.unit.state.cleared': T('أُغلقت المهمة', 'Cleared'),
    'nat.resident.eta': T('{unit}: الوصول خلال {min} د', '{unit} ETA {min} min'), 'nat.resident.eta.ambulance': T('{unit}: الوصول خلال {min} د — ابقَ مكانك', '{unit} ETA {min} min — stay where you are'),
    'nat.resident.onscene': T('{unit} وصلت إلى الموقع', '{unit} is on scene')
  };
  function renderMsg(key, params, lang) {
    var m = MSG[key]; if (!m) return key;
    var out = {};
    ['ar', 'en'].forEach(function (lg) {
      out[lg] = m[lg].replace(/\{(\w+)\}/g, function (all, k) {
        var v = params ? params[k] : undefined;
        if (v && typeof v === 'object') return v[lg] !== undefined ? v[lg] : (v.en || '');
        return v === undefined ? all : String(v);
      });
    });
    return lang ? out[lang] : out;
  }
  function adv(key, params, level, hazard, muni) { return { key: key, params: params, level: level, hazard: hazard, muni: muni || null, text: renderMsg(key, params) }; }

  function municipalityStatus(nat, t) {
    var W = nat.W, g = W.grid, P = nat.P, ms = W.geo.municipalities, heat = heatField(nat, t), dust = nat.dust.on ? dustField(nat, t) : null, rain = (P.rainMmHr > 0 || nat.rainCells.length) ? rainField(nat, t) : null;
    var out = ms.map(function (m) { return { id: m.id, name: m.name, wbgtMax: 0, wbgtMean: 0, pm10Max: P.dustBackground, rainMax: 0, cells: 0, incidents: 0, unitsBased: 0, unitsAvailable: 0, unitsBusy: 0, unitsEnRoute: 0, heat: 'ok', dust: 'ok', level: 'normal' }; }), c, k, o, i;
    for (c = 0; c < g.n; c++) {
      k = g.muni[c]; if (k < 0 || !g.land[c]) continue;
      o = out[k]; o.cells++; o.wbgtMean += heat[c]; if (heat[c] > o.wbgtMax) o.wbgtMax = heat[c];
      if (dust && dust[c] > o.pm10Max) o.pm10Max = dust[c];
      if (rain && rain[c] > o.rainMax) o.rainMax = rain[c];
    }
    var idx = {}; ms.forEach(function (m, q) { idx[m.id] = q; });
    for (i = 0; i < nat.incidents.length; i++) { var inc = nat.incidents[i]; if (inc.status !== 'cleared' && inc.status !== 'cancelled' && inc.muni && idx[inc.muni] !== undefined) out[idx[inc.muni]].incidents++; }
    nat.fleet.units.forEach(function (u) {
      var fm = W.facById[u.fac] && W.facById[u.fac].f.muni, q = idx[fm]; if (q === undefined) return;
      out[q].unitsBased++;
      if (u.state === 'en-route' || u.state === 'turnout') out[q].unitsEnRoute++;
      if (isBusy(nat, u, t, null)) out[q].unitsBusy++; else out[q].unitsAvailable++;
    });
    var order = { normal: 0, watch: 1, warning: 2, danger: 3 };
    out.forEach(function (o2) {
      o2.wbgtMean = o2.cells ? r1(o2.wbgtMean / o2.cells) : 0; o2.wbgtMax = r1(o2.wbgtMax); o2.pm10Max = Mth.round(o2.pm10Max); o2.rainMax = r1(o2.rainMax);
      o2.heat = wbgtLevel(P, o2.wbgtMax);
      o2.dust = o2.pm10Max >= P.dustCritical ? 'critical' : o2.pm10Max >= P.dustDanger ? 'danger' : o2.pm10Max >= P.dustWarn ? 'warn' : 'ok';
      var lv = 0;
      if (o2.heat === 'warn') lv = Mth.max(lv, 1); if (o2.heat === 'stop') lv = Mth.max(lv, 2);
      if (o2.dust === 'warn') lv = Mth.max(lv, 1); if (o2.dust === 'danger') lv = Mth.max(lv, 2); if (o2.dust === 'critical') lv = Mth.max(lv, 3);
      if (o2.rainMax >= 10) lv = Mth.max(lv, 1); if (o2.rainMax >= 30) lv = Mth.max(lv, 2);
      if (o2.incidents > 0) lv = Mth.max(lv, 1);
      o2.level = ['normal', 'watch', 'warning', 'danger'][lv];
    });
    return out;
  }
  function advisories(nat, t, mst) {
    t = t === undefined ? nat.t : t;
    var P = nat.P, ci = clockInfo(nat.start, t), out = [], ms = mst || municipalityStatus(nat, t);
    if (inMiddayBan(ci)) out.push(adv('nat.adv.heat.ban', { from: '10:00', to: '15:30' }, 'info', 'heat', null));
    else if (ci.hour >= 9 && ci.hour < 10 && ((ci.m > 6 && ci.m < 9) || ci.m === 6 || (ci.m === 9 && ci.d <= 15))) out.push(adv('nat.adv.heat.ban', { from: '10:00', to: '15:30' }, 'info', 'heat', null));
    ms.forEach(function (m) {
      var pr = { muni: m.id, muniName: m.name };
      if (m.heat === 'stop') out.push(adv('nat.adv.heat.stop', { muni: m.name, wbgt: m.wbgtMax, limit: P.wbgtStop }, 'danger', 'heat', m.id));
      else if (m.heat === 'warn') out.push(adv('nat.adv.heat.warn', { muni: m.name, wbgt: m.wbgtMax }, 'warning', 'heat', m.id));
      if (m.dust === 'critical') out.push(adv('nat.adv.dust.critical', { muni: m.name, pm10: m.pm10Max }, 'danger', 'dust', m.id));
      else if (m.dust === 'danger') out.push(adv('nat.adv.dust.danger', { muni: m.name, pm10: m.pm10Max }, 'danger', 'dust', m.id));
      else if (m.dust === 'warn') out.push(adv('nat.adv.dust.warn', { muni: m.name, pm10: m.pm10Max }, 'warning', 'dust', m.id));
      if (m.rainMax >= 10) out.push(adv('nat.adv.flood.watch', { muni: m.name, mm: m.rainMax }, m.rainMax >= 30 ? 'warning' : 'watch', 'flood', m.id));
    });
    var closedT = 0; nat.flood.tunnels.forEach(function (x) { if (x.closed) closedT++; });
    if (closedT) out.push(adv('nat.adv.flood.underpass', { n: closedT }, 'warning', 'flood', null));
    if (P.trafficLoad >= 1.5) out.push(adv('nat.adv.traffic.heavy', {}, 'watch', 'traffic', null));
    return out;
  }
  function kpis(nat, t) {
    t = t === undefined ? nat.t : t;
    var W = nat.W, P = nat.P, ci = clockInfo(nat.start, t), I = { total: nat.incidents.length, active: 0, byHazard: {}, byStatus: {} }, U = { total: nat.fleet.units.length, available: 0, busy: 0, enRoute: 0, onScene: 0, returning: 0, byKind: {} }, i, inc, u;
    for (i = 0; i < nat.incidents.length; i++) {
      inc = nat.incidents[i];
      I.byHazard[inc.hazard] = (I.byHazard[inc.hazard] || 0) + 1; I.byStatus[inc.status] = (I.byStatus[inc.status] || 0) + 1;
      if (inc.status !== 'cleared' && inc.status !== 'cancelled') I.active++;
    }
    for (i = 0; i < nat.fleet.units.length; i++) {
      u = nat.fleet.units[i];
      var bk = U.byKind[u.kind] || (U.byKind[u.kind] = { total: 0, available: 0, busy: 0, enRoute: 0, onScene: 0 });
      bk.total++;
      if (u.state === 'en-route' || u.state === 'turnout') { U.enRoute++; bk.enRoute++; }
      else if (u.state === 'on-scene') { U.onScene++; bk.onScene++; }
      else if (u.state === 'returning') U.returning++;
      if (isBusy(nat, u, t, null)) { U.busy++; bk.busy++; } else { U.available++; bk.available++; }
    }
    var eta = nat.stats.firstEta, mean = eta.length ? Mth.round(eta.reduce(function (a, b) { return a + b; }, 0) / eta.length) : null, active = [];
    nat.incidents.forEach(function (x) { if (x.status !== 'cleared' && x.status !== 'cancelled' && x.firstEtaSec !== null && x.firstEtaSec !== undefined) active.push(x.firstEtaSec); });
    var ctx = timeCtx(nat, t); ensureOverlays(nat, ctx);
    var num = 0, den = 0, e, G = W.G;
    for (e = 0; e < W.E; e += 7) { den += G.eLen[e]; num += G.eLen[e] * (nat.closed[e] ? 0 : arcCong(nat, ctx, W.eArc0[e])); }
    var ms = municipalityStatus(nat, t), heatMax = 0, pmMax = P.dustBackground, rainMax = 0;
    ms.forEach(function (m) { if (m.wbgtMax > heatMax) heatMax = m.wbgtMax; if (m.pm10Max > pmMax) pmMax = m.pm10Max; if (m.rainMax > rainMax) rainMax = m.rainMax; });
    var closedT = 0, maxDepth = 0; nat.flood.tunnels.forEach(function (x) { if (x.closed) closedT++; if (x.depthCm > maxDepth) maxDepth = x.depthCm; });
    return {
      t: t, clock: ci.clock, date: ci.iso, dow: ci.dow, dowName: ci.dowName, weekend: ci.weekend, dayType: ci.dayType,
      incidents: I, units: U, meanFirstEtaSec: mean, meanFirstEtaActiveSec: active.length ? Mth.round(active.reduce(function (a, b) { return a + b; }, 0) / active.length) : null,
      traffic: { load: P.trafficLoad, meanSpeedRatio: den ? r2(num / den) : 1, pressure: r2(ctx.p), jammedEdges: nat.jamN, closedEdges: nat.closedN, cordons: nat.cordonN, redispatches: nat.stats.redispatches, reroutes: nat.stats.reroutes },
      hazards: { heat: { wbgtMax: heatMax, level: wbgtLevel(P, heatMax), middayBan: inMiddayBan(ci) }, dust: { on: nat.dust.on, pm10Max: Mth.round(pmMax), frontKm: nat.dust.on ? r1(dustFrontKm(nat, t)) : null },
        flood: { rainMmHr: P.rainMmHr, rainCells: nat.rainCells.length, rainMax: rainMax, tunnelsClosed: closedT, maxDepthCm: r1(maxDepth) } },
      municipalities: ms, advisories: advisories(nat, t, ms)
    };
  }
  // exposure of outdoor work areas: ONLY places the OSM data tags as industrial / port (no worker counts are claimed)
  function heatExposure(nat, t) {
    t = t === undefined ? nat.t : t;
    var W = nat.W, P = nat.P, ci = clockInfo(nat.start, t), cl = climateOf(ci, P), g = W.grid, ban = inMiddayBan(ci);
    return W.industrial.map(function (p) {
      var ix = Mth.floor((p.lon - g.lon0) / g.d), iy = Mth.floor((p.lat - g.lat0) / g.d), c = iy * g.nx + ix, w;
      if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny || !g.land[c]) { w = wbgtEstimate(airTempAt(cl, ci.hour), P.heatRhPct, P.heatSunLoadC * solarFactor(ci.doy, ci.hour, p.lon, p.lat)); }
      else w = heatCell(nat, ci, cl, c).wbgt;
      return { placeId: p.id, name: p.name, kind: p.kind, lon: p.lon, lat: p.lat, wbgt: r1(w), level: wbgtLevel(P, w), middayBan: ban, source: 'OSM place tag (industrial / port): outdoor work may happen here; no worker counts are claimed' };
    });
  }
  function hazardFields(nat, t) {
    t = t === undefined ? nat.t : t;
    var g = nat.W.grid;
    return { grid: { lon0: g.lon0, lat0: g.lat0, d: g.d, nx: g.nx, ny: g.ny }, land: g.land, municipality: g.muni, wbgt: heatField(nat, t), pm10: dustField(nat, t), rain: rainField(nat, t),
      note: 'SIMULATED fields on a coarse grid (do not modify the arrays); wbgt in °C is an ESTIMATE, pm10 in µg/m³, rain in mm/h; visibility is the relative index N.visibility(pm10)' };
  }

  /* ====================================================================================
   * 12. SNAPSHOT, BUS MESSAGES, HASH
   * ==================================================================================== */
  function planSnap(nat, inc, o) {
    var plan = inc.plan; if (!plan) return null;
    var W = nat.W;
    return { id: plan.id, state: plan.state, origin: plan.origin, scope: 'national', hazard: plan.hazard, scene: plan.scene, t: JSON.parse(JSON.stringify(plan.t)), patients: plan.patients, notes: plan.notes,
      units: plan.units.map(function (pu) {
        var u = pu.unitId ? nat.fleet.byId[pu.unitId] : null, route = [];
        if (u && o.routes !== false && pu.state !== 'cleared' && pu.state !== 'on-scene') route = decimate(stepsPolyline(W, remainingSteps(pu._trk)), 200);
        return { slot: pu.slot, kind: pu.kind, unitId: pu.unitId, name: pu.name, state: pu.state, optional: !!pu.optional, standby: !!pu.standby, flags: pu.flags || [],
          etaSec: pu.etaSec === null || pu.etaSec === undefined ? null : Mth.round(pu.etaSec), etaMin: pu.etaSec === null || pu.etaSec === undefined ? null : r1(pu.etaSec / 60), distM: pu.distM ? Mth.round(pu.distM) : null,
          pos: u ? { lon: r5(u.pos.lon), lat: r5(u.pos.lat) } : null, route: route, why: pu.why, whyData: pu.whyData, runnerUp: pu.runnerUp || null, nearestByStraight: pu.nearestByStraight || null,
          reroutes: pu.reroutes || 0, replaced: pu.replaced || [], states: pu.states, unreachable: !!pu.unreachable };
      }),
      hospital: plan.hospital && plan.hospital.chosen ? { id: plan.hospital.chosen.id, name: plan.hospital.chosen.name, etaSec: plan.hospital.chosen.etaSec, etaMin: plan.hospital.chosen.etaMin, distM: plan.hospital.chosen.distM, lon: plan.hospital.chosen.lon, lat: plan.hospital.chosen.lat,
        fits: plan.hospital.chosen.fits, freeSlots: plan.hospital.chosen.freeSlots, ed: plan.hospital.chosen.ed, edNote: plan.hospital.chosen.edNote, assumed: plan.hospital.chosen.assumed, route: o.routes === false ? [] : plan.hospital.chosen.route, why: plan.hospital.why, options: plan.hospital.options } : null };
  }
  function snapshot(nat, o) {
    o = o || {};
    var t = nat.t, ci = clockInfo(nat.start, t), S;
    S = { v: 1, scope: 'national', label: SIM_LABEL, version: VERSION, seed: nat.seed, t: t, clock: ci.clock, date: ci.iso, dow: ci.dow, dowName: ci.dowName, weekend: ci.weekend, dayType: ci.dayType, hour: r2(ci.hour),
      attribution: nat.W.attribution, snapshotDate: nat.W.snapshot, build: nat.W.build,
      traffic: { load: nat.P.trafficLoad, jams: nat.jamN, closed: nat.closedN, cordons: nat.cordonN, pressure: r2(timeCtx(nat, t).p) },
      units: nat.fleet.units.map(function (u) { return { id: u.id, kind: u.kind, name: u.name, lon: r5(u.pos.lon), lat: r5(u.pos.lat), state: u.state, assigned: u.assigned, busy: isBusy(nat, u, t, null), base: { lon: u.base.lon, lat: u.base.lat }, role: u.role, flags: u.flags }; }),
      incidents: nat.incidents.map(function (inc) {
        return { id: inc.id, hazard: inc.hazard, lon: inc.lon, lat: inc.lat, severity: inc.severity, sev: r2(inc.sev), radiusM: inc.radiusM, status: inc.status, muni: inc.muni, place: inc.place ? { id: inc.place.id, name: inc.place.name, distKm: r1(inc.place.distM / 1000) } : null,
          patients: inc.patients, tStart: inc.tStart, tCleared: inc.tCleared, firstEtaSec: inc.firstEtaSec === undefined ? null : inc.firstEtaSec, cordonM: nat.cordons[inc.id] ? Mth.round(nat.cordons[inc.id].radiusM) : null, plan: planSnap(nat, inc, o) };
      }),
      closedEdges: (function () { var l = [], e; for (e = 0; e < nat.W.E && l.length < 80; e++) if (nat.closed[e]) l.push({ edge: e, by: CLOSE_CAUSE[nat.closed[e]] }); return l; })(),
      dust: nat.dust.on ? { on: true, t0: nat.dust.t0, deg: nat.dust.deg, mps: nat.dust.mps, frontKm: r1(dustFrontKm(nat, t)) } : { on: false },
      rain: { mmHr: nat.P.rainMmHr, cells: nat.rainCells.filter(function (rc) { return t >= rc.t0 && t <= rc.t1; }).map(function (rc) { var q = rainCellPos(rc, t); return { id: rc.id, lon: r5(q[0]), lat: r5(q[1]), radiusKm: rc.radiusKm, mmHr: rc.mmHr }; }) },
      evCount: nat.evCount, stats: { dispatches: nat.stats.dispatches, redispatches: nat.stats.redispatches, reroutes: nat.stats.reroutes } };
    if (o.kpis !== false) S.kpis = kpis(nat, t);
    S.events = o.full ? nat.events.slice() : nat.events.slice(-(o.lastEvents || 60));
    return S;
  }
  function hashNat(nat) { return fnv(JSON.stringify(snapshot(nat, { full: true }))); }
  function busDispatch(nat, incId) {
    var inc = getIncident(nat, incId); if (!inc || !inc.plan) return null;
    var plan = inc.plan;
    return { type: 'dispatch', scope: 'national', id: plan.id, state: plan.state, origin: plan.origin, scene: { node: 'NAT', lon: inc.lon, lat: inc.lat }, incident: { id: inc.id, hazard: inc.hazard, muni: inc.muni, place: inc.place ? inc.place.name : null },
      units: plan.units.filter(function (u) { return u.unitId; }).map(function (u) { return { kind: u.kind, name: u.name, etaMin: u.etaSec === null ? null : r1(u.etaSec / 60), status: u.state, why: u.why }; }),
      hospital: plan.hospital && plan.hospital.chosen ? { name: plan.hospital.chosen.name, etaMin: plan.hospital.chosen.etaMin } : null, sim: true };
  }
  function busAdvisory(nat) {
    var k = kpis(nat); return { type: 'advisory', scope: 'national', id: 'ADV-' + Mth.floor(nat.t), clock: k.clock, items: k.advisories.map(function (a) { return { key: a.key, params: a.params, level: a.level, hazard: a.hazard, muni: a.muni, text: a.text }; }), sim: true };
  }
  function residentLines(nat, incId) {
    var inc = getIncident(nat, incId); if (!inc || !inc.plan) return [];
    var out = [];
    inc.plan.units.forEach(function (u) {
      if (!u.unitId || u.optional || u.state === 'recommended') return;
      var nm = KIND_NAME[u.kind], min = u.etaSec === null || u.etaSec === undefined ? null : Mth.max(1, Mth.round(u.etaSec / 60));
      if (u.state === 'on-scene' || u.state === 'cleared') out.push({ kind: u.kind, state: u.state, key: 'nat.resident.onscene', text: renderMsg('nat.resident.onscene', { unit: nm }) });
      else if (min !== null) { var key = u.kind === 'ambulance' ? 'nat.resident.eta.ambulance' : 'nat.resident.eta'; out.push({ kind: u.kind, state: u.state, etaMin: min, key: key, text: renderMsg(key, { unit: nm, min: min }) }); }
    });
    return out;
  }

  /* ====================================================================================
   * 13. OASIS CAP 1.2 for a national incident (status Exercise; one <info> per language; area = circle or polygon)
   *     Duplicated small helpers on purpose: no coupling to sim.js.
   * ==================================================================================== */
  var CAP_CAT = { fire: ['Fire'], gas: ['Env', 'Safety'], flood: ['Met', 'Rescue'], dust: ['Met', 'Health'], heat: ['Health', 'Met'], sos: ['Health', 'Rescue'] };
  var CAP_RESP = { fire: 'Evacuate', gas: 'Evacuate', flood: 'Avoid', dust: 'Shelter', heat: 'Prepare', sos: 'Execute' };
  function isoAt(iso, sec, tz) { sec = ((Mth.floor(sec) % 86400) + 86400) % 86400; return iso + 'T' + hms(sec) + (tz || '+03:00'); }
  function capXml(nat, incOrId, o) {
    o = o || {};
    var inc = typeof incOrId === 'string' ? getIncident(nat, incOrId) : incOrId;
    if (!inc) return null;
    var ci = clockInfo(nat.start, inc.tStart), tz = o.tz || '+03:00', langs = o.languages || ['ar', 'en'], hz = inc.hazard, hn = HAZARD_NAME[hz], pl = inc.place, plan = inc.plan;
    var sevName = ['Minor', 'Moderate', 'Severe'][clamp(inc.severity, 1, 3) - 1], urg = inc.severity >= 2 ? 'Immediate' : 'Expected', exp = ci.sec + 7200, radiusKm = Mth.max(0.05, (o.radiusM || inc.radiusM || 100) / 1000);
    var place = pl ? pl.name : T('قطر', 'Qatar'), mu = inc.muni ? muniName(nat.W, inc.muni) : T('', ''), ident = 'MANARA-EXERCISE-NAT-s' + nat.seed + '-' + inc.id;
    var areaTag;
    if (o.area === 'polygon') {
      var pts = [], q, ang, p;
      for (q = 0; q < 16; q++) { ang = q / 16 * 2 * Mth.PI; p = offsetLL(inc.lon, inc.lat, radiusKm * 1000 * Mth.sin(ang), radiusKm * 1000 * Mth.cos(ang)); pts.push(r5(p[1]) + ',' + r5(p[0])); }
      pts.push(pts[0]); areaTag = '<polygon>' + pts.join(' ') + '</polygon>';
    } else areaTag = '<circle>' + r5(inc.lat) + ',' + r5(inc.lon) + ' ' + r2(radiusKm) + '</circle>';
    var x = [];
    x.push('<?xml version="1.0" encoding="UTF-8"?>');
    x.push('<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">');
    x.push('  <identifier>' + xmlEsc(ident) + '</identifier>');
    x.push('  <sender>manara-simulation@example.invalid</sender>');
    x.push('  <sent>' + isoAt(ci.iso, ci.sec, tz) + '</sent>');
    x.push('  <status>Exercise</status>');
    x.push('  <msgType>Alert</msgType>');
    x.push('  <source>MANARA national simulation</source>');
    x.push('  <scope>Restricted</scope>');
    x.push('  <restriction>EXERCISE ONLY — MANARA simulation. Not a real alert and not for broadcast.</restriction>');
    x.push('  <note>EXERCISE — simulated incident on a snapshot of OpenStreetMap data. Unit positions, availability and traffic are simulated; no authority issued or approved it. 999 stays the dispatcher.</note>');
    langs.forEach(function (lg) {
      var ar = lg === 'ar', pick = function (tt) { return ar ? tt.ar : tt.en; }, draft = lg !== 'ar' && lg !== 'en';
      var units = plan ? plan.units.filter(function (u) { return u.unitId; }).map(function (u) { return pick(u.name) + ' (' + mmss(u.etaAtRec) + ')'; }).join(ar ? '؛ ' : '; ') : '';
      var head = ar ? 'تمرين: ' + hn.ar + ' — ' + pl_name(pl, 'ar') : 'EXERCISE: ' + hn.en + ' — ' + pl_name(pl, 'en');
      var desc = ar ? 'حادث محاكى (تمرين) قرب ' + pl_name(pl, 'ar') + (mu.ar ? ' — ' + mu.ar : '') + '. الوحدات الموصى بها (محاكاة): ' + units + '. هذا ليس إنذاراً حقيقياً.'
        : 'Simulated incident (exercise) near ' + pl_name(pl, 'en') + (mu.en ? ' — ' + mu.en : '') + '. Recommended units (simulated): ' + units + '. This is not a real alert.';
      if (draft) desc += ' [DRAFT — needs native-speaker review]';
      x.push('  <info>');
      x.push('    <language>' + xmlEsc(lg) + '</language>');
      CAP_CAT[hz].forEach(function (c) { x.push('    <category>' + c + '</category>'); });
      x.push('    <event>' + xmlEsc(pick(hn)) + '</event>');
      x.push('    <responseType>' + CAP_RESP[hz] + '</responseType>');
      x.push('    <urgency>' + urg + '</urgency>');
      x.push('    <severity>' + sevName + '</severity>');
      x.push('    <certainty>Observed</certainty>');
      x.push('    <effective>' + isoAt(ci.iso, ci.sec, tz) + '</effective>');
      x.push('    <expires>' + isoAt(ci.iso, exp, tz) + '</expires>');
      x.push('    <senderName>' + xmlEsc(ar ? 'محاكاة المنارة الوطنية (تمرين)' : 'MANARA national simulation (exercise)') + '</senderName>');
      x.push('    <headline>' + xmlEsc(head) + '</headline>');
      x.push('    <description>' + xmlEsc(desc) + '</description>');
      x.push('    <instruction>' + xmlEsc(ar ? 'للطوارئ اتصل بـ 999. هذا تمرين محاكاة.' : 'In an emergency call 999. This is a simulation exercise.') + '</instruction>');
      x.push('    <parameter><valueName>MANARA-simulation</valueName><value>true</value></parameter>');
      x.push('    <parameter><valueName>MANARA-incident</valueName><value>' + xmlEsc(inc.id) + '</value></parameter>');
      x.push('    <parameter><valueName>MANARA-data</valueName><value>OpenStreetMap contributors, ODbL 1.0; snapshot ' + xmlEsc(nat.W.snapshot) + '</value></parameter>');
      x.push('    <area>');
      x.push('      <areaDesc>' + xmlEsc(pl_name(pl, lg === 'ar' ? 'ar' : 'en') + (mu[ar ? 'ar' : 'en'] ? ' — ' + mu[ar ? 'ar' : 'en'] : '')) + '</areaDesc>');
      x.push('      ' + areaTag);
      x.push('    </area>');
      x.push('  </info>');
    });
    x.push('</alert>');
    return x.join('\n');
  }
  function pl_name(pl, lg) { return pl ? pl.name[lg] || pl.name.en || pl.name.ar || '' : (lg === 'ar' ? 'قطر' : 'Qatar'); }

  /* ====================================================================================
   * 14. PHONES: nearest real facilities with straight-line km, bearing and an estimated ROAD time (free flow and now). Informational only.
   * ==================================================================================== */
  var DEFAULT_NAT = null;
  function defaultNat(opts) {
    var data = getData(opts || {});
    if (!DEFAULT_NAT || DEFAULT_NAT.W.data.roads !== data.roads) DEFAULT_NAT = create({ seed: 1, data: opts && opts.data, hour: 8 });
    return DEFAULT_NAT;
  }
  function nearestFacilities(o) {
    o = o || {};
    var nat = o.nat || defaultNat(o), W = nat.W, P = nat.P, kind = o.kind || 'hospital', k = o.k === undefined ? 3 : Mth.max(0, o.k | 0), t = o.t !== undefined ? o.t : nat.t, G = W.G, accMps = P.accessKph / 3.6;
    var sn = snapTo(W, o.lon, o.lat, 90000);
    if (!sn) return [];
    var costNow = getCost(nat, t, 1, true), freeKey = W.freeCost || (W.freeCost = (function () { var a = new Float32Array(W.A2), i; for (i = 0; i < W.A2; i++) a[i] = i < W.A ? W.aLen[i] / W.aMps[i] : INF; return a; })());
    var S1 = runTree(W, costNow.arr, seedsLeaving(W, costNow.arr, sn.edge, sn.frac), 'fwd', 0), res = [], i, fr, f, pv, items = [];
    var dNow = {}, S2 = null;
    // gather candidates
    for (i = 0; i < W.facs.length; i++) {
      fr = W.facs[i]; f = fr.f;
      if ((kind === 'hospital' || kind === 'ed') && !isHospitalLike(f)) continue;
      if (kind === 'ed' && f.ed !== 'yes') continue;
      if (kind === 'police' && f.kind !== 'police') continue;
      if (kind === 'fire' && f.kind !== 'fire') continue;
      if (kind === 'ambulance' && f.kind !== 'ambulance') continue;
      if (o.edOnly && !(isHospitalLike(f) && f.ed === 'yes')) continue;
      pv = pathViaFwd(W, S1, costNow.arr, sn, { edge: fr.edge, frac: fr.frac }, true);
      if (!pv) continue;
      items.push({ fr: fr, now: pv.sec + (sn.distM + fr.accessM) / accMps });
    }
    items.sort(function (a, b) { return o.sort === 'straight' ? haversineM(o.lon, o.lat, a.fr.lon, a.fr.lat) - haversineM(o.lon, o.lat, b.fr.lon, b.fr.lat) : a.now - b.now; });
    items = items.slice(0, k);
    var from = { edge: sn.edge, frac: sn.frac };
    S2 = runTree(W, freeKey, seedsLeaving(W, freeKey, sn.edge, sn.frac), 'fwd', 1);
    items.forEach(function (it) {
      fr = it.fr; f = fr.f;
      var pf = pathViaFwd(W, S2, freeKey, from, { edge: fr.edge, frac: fr.frac }, true), free = pf ? pf.sec + (sn.distM + fr.accessM) / accMps : null, straight = haversineM(o.lon, o.lat, fr.lon, fr.lat), brg = bearingDeg(o.lon, o.lat, fr.lon, fr.lat);
      var edNote = !isHospitalLike(f) ? null : f.ed === 'yes' ? T('فيه قسم طوارئ (' + (f.edSrc === 'osm-tag' ? 'وسم OSM' : 'قائمة رسمية') + ')', 'Has an emergency department (' + (f.edSrc === 'osm-tag' ? 'OSM tag' : 'official list') + ')') : f.ed === 'no' ? T('لا قسم طوارئ', 'No emergency department') : T('الطوارئ غير مؤكدة في البيانات', 'Emergency department not confirmed in the data');
      res.push({ id: fr.id, kind: f.kind, role: f.role || null, facilityType: f.facilityType || null, name: facLabel(W, fr), lon: fr.lon, lat: fr.lat, muni: f.muni, ed: isHospitalLike(f) ? f.ed : null, edNote: edNote,
        straightKm: r1(straight / 1000), bearingDeg: Mth.round(brg), bearing: compass(brg), roadMinFree: free === null ? null : r1(free / 60), roadMinNow: r1(it.now / 60), delayPct: free ? Mth.round((it.now / free - 1) * 100) : null,
        call: { key: 'nat.call999', text: MSG['nat.call999'] }, credit: { key: 'nat.credit', text: MSG['nat.credit'] }, sim: true,
        note: T('الزمن تقدير على شبكة الطرق (محاكاة للازدحام) وليس تعليمات ملاحة', 'The time is an estimate on the road network (simulated congestion), not a navigation instruction') });
    });
    return res;
  }
  // a general-purpose router for phones and tests: fastest road route between two lon/lat points at time t (civilian speed unless em > 1)
  function route(nat, from, to, t, o) {
    o = o || {}; var W = nat.W, em = o.em || 1, civil = !(o.em > 1), tt = t === undefined ? nat.t : t, a = snapTo(W, from.lon, from.lat, 90000), b = snapTo(W, to.lon, to.lat, 90000);
    if (!a || !b) return null;
    var cost = getCost(nat, tt, em, civil), S = runTree(W, cost.arr, seedsLeaving(W, cost.arr, a.edge, a.frac), 'fwd', 1), pv = pathViaFwd(W, S, cost.arr, a, b);
    if (!pv) return null;
    var ex = evalSteps(nat, pv.steps, tt, em, civil), acc = (a.distM + b.distM) / (nat.P.accessKph / 3.6);
    return { sec: ex.sec + acc, freeSec: ex.freeSec + acc, km: r1(ex.lenM / 1000), congestedSegments: ex.congestedN, top: ex.congested, polyline: stepsPolyline(W, pv.steps), steps: pv.steps.length };
  }

  /* ====================================================================================
   * 15. A/B FOR NATIONAL DISPATCH: ordinary "nearest by distance" versus MANARA "fastest given traffic" on the SAME seeded incidents
   *     (a SIMULATION — a mechanism check, never evidence of real-world impact)
   * ==================================================================================== */
  var PLACE_W = { city: 5, town: 3, 'municipality-centre': 2, industrial: 1.5, airport: 1, village: 1, suburb: 1.5, neighbourhood: 1, quarter: 1, hamlet: 0.5 };
  function makeSampler(nat, seed) {
    var W = nat.W, g = W.grid, P = nat.P, cells = [], places = [], wsum = 0, c;
    for (c = 0; c < g.n; c++) if (g.land[c] && g.roadKm[c] <= P.abMaxOffroadKm) cells.push(c);
    W.geo.places.forEach(function (p) { var w = PLACE_W[p.kind] || 0; if (w > 0 && W.geo.inLand(p.lon, p.lat)) { places.push({ p: p, w: w }); wsum += w; } });
    return function sample(i) {
      var tries = 0, lon, lat, src, pid = null, j, k, u, acc, pp, ang, d, ll;
      for (;;) {
        j = i * 16 + tries * 8;
        if (hr(seed, D.SAMPLE, j, 1) < P.abPlaceWeight && places.length) {
          u = hr(seed, D.SAMPLE, j, 2) * wsum; acc = 0;
          for (k = 0; k < places.length; k++) { acc += places[k].w; if (u <= acc) break; }
          pp = places[Mth.min(k, places.length - 1)].p; ang = hr(seed, D.SAMPLE, j, 3) * 2 * Mth.PI; d = 1500 * Mth.sqrt(hr(seed, D.SAMPLE, j, 4));
          ll = offsetLL(pp.lon, pp.lat, d * Mth.sin(ang), d * Mth.cos(ang)); src = 'place'; pid = pp.id;
        } else {
          c = cells[Mth.floor(hr(seed, D.SAMPLE, j, 5) * cells.length)];
          ll = [g.lon[c] + (hr(seed, D.SAMPLE, j, 6) - 0.5) * g.d, g.lat[c] + (hr(seed, D.SAMPLE, j, 7) - 0.5) * g.d]; src = 'uniform'; pid = null;
        }
        lon = ll[0]; lat = ll[1];
        if (W.geo.inLand(lon, lat) || ++tries > 6) break;
      }
      return { i: i, lon: r5(lon), lat: r5(lat), src: src, place: pid };
    };
  }
  // the three policies for one incident at clock t: MANARA = fastest ETA, ordinary = nearest in a straight line, roadNearest = nearest by road length (no traffic)
  function evalPolicies(nat, lon, lat, hazard, t, wantRoad) {
    var W = nat.W, P = nat.P, em = P.emergencyFactor, sc = sceneOf(nat, lon, lat);
    if (!sc) return null;
    var cost = getCost(nat, t, em), S = runTree(W, cost.arr, seedsReaching(W, cost.arr, sc.edge, sc.frac), 'rev', 0), S2 = null, lenArr = null, accMps = P.accessKph / 3.6;
    if (wantRoad) { lenArr = getLenCost(nat); S2 = runTree(W, lenArr, seedsReaching(W, lenArr, sc.edge, sc.frac), 'rev', 1); }
    var needs = requiredUnits(hazard, 1, P), kinds = {}, firstM = INF, firstO = INF, firstR = INF, lastM = 0, lastO = 0, any = false;
    // the 'rev' tree in slot 0 is read for every unit, the road-length tree in slot 1: both stay valid in this loop
    needs.forEach(function (need) {
      var cands = unitsOfKind(nat, need.kind, need.flag), turnout = turnoutOf(P, need.kind), i, u, pv, atBase, accS, eta, straight, best = null, ord = null, rd = null, nAvail = 0, rv;
      for (i = 0; i < cands.length; i++) {
        u = cands[i]; if (isBusy(nat, u, t, null)) continue;
        pv = pathViaRev(W, S, cost.arr, u.pos, sc, true); if (!pv) continue;
        atBase = u.pos.edge === u.base.edge && u.pos.frac === u.base.frac && u.state === 'idle'; accS = atBase ? u.base.accessM / accMps : 0;
        eta = turnout + accS + pv.sec + sc.accessSec; straight = haversineM(u.pos.lon, u.pos.lat, lon, lat); nAvail++;
        var rec = { id: u.id, eta: eta, straightM: straight, idx: u.idx, roadM: null };
        if (S2) { rv = pathViaRev(W, S2, lenArr, u.pos, sc, true); rec.roadM = rv ? rv.sec + (atBase ? u.base.accessM : 0) : null; }
        if (!best || eta < best.eta - 1e-9 || (Mth.abs(eta - best.eta) < 1e-9 && straight < best.straightM)) best = rec;
        if (!ord || straight < ord.straightM - 1e-9 || (Mth.abs(straight - ord.straightM) < 1e-9 && rec.idx < ord.idx)) ord = rec;
        if (rec.roadM !== null && (!rd || rec.roadM < rd.roadM)) rd = rec;
      }
      if (!best) return;
      any = true;
      kinds[need.kind] = { manara: { id: best.id, eta: Mth.round(best.eta), straightKm: r1(best.straightM / 1000) }, ordinary: { id: ord.id, eta: Mth.round(ord.eta), straightKm: r1(ord.straightM / 1000) },
        road: rd ? { id: rd.id, eta: Mth.round(rd.eta), roadKm: r1(rd.roadM / 1000) } : null, available: nAvail, differs: best.id !== ord.id, savedSec: Mth.round(ord.eta - best.eta), savedVsRoadSec: rd ? Mth.round(rd.eta - best.eta) : null,
        extraStraightKm: r1((best.straightM - ord.straightM) / 1000) };
      firstM = Mth.min(firstM, best.eta); firstO = Mth.min(firstO, ord.eta); lastM = Mth.max(lastM, best.eta); lastO = Mth.max(lastO, ord.eta); if (rd) firstR = Mth.min(firstR, rd.eta);
    });
    return any ? { kinds: kinds, firstManara: Mth.round(firstM), firstOrdinary: Mth.round(firstO), firstRoad: isFin(firstR) ? Mth.round(firstR) : null, lastManara: Mth.round(lastM), lastOrdinary: Mth.round(lastO) } : null;
  }
  function changedParams(nat) { var o = {}; PARAM_DEFS.forEach(function (d) { if (nat.P[d.key] !== d.default) o[d.key] = nat.P[d.key]; }); return o; }
  function ab(o) {
    o = o || {};
    var seed = (o.seed >>> 0) || 1, n = o.n === undefined ? 150 : Mth.max(0, o.n | 0), hazards = o.hazards && o.hazards.length ? o.hazards : ['fire', 'gas', 'flood', 'sos'], nat = o.nat || create({ seed: seed, hour: o.hour !== undefined ? o.hour : 7.5, day: o.day || 0, date: o.date, params: o.params, data: o.data });
    var t = o.t !== undefined ? o.t : nat.t, sample = makeSampler(nat, seed), wantRoad = o.roadBaseline !== false, i, r, inc, hz, rows = [];
    var fO = [], fM = [], fR = [], saved = [], savedDiff = [], lastO = [], lastM = [], perKind = {}, differs = 0, farFaster = 0, skipped = 0, kindN = 0, kindDiff = 0;
    for (i = 0; i < n; i++) {
      inc = sample(i); hz = hazards[i % hazards.length];
      r = evalPolicies(nat, inc.lon, inc.lat, hz, t, wantRoad);
      if (!r) { skipped++; continue; }
      fO.push(r.firstOrdinary); fM.push(r.firstManara); if (r.firstRoad !== null) fR.push(r.firstRoad); lastO.push(r.lastOrdinary); lastM.push(r.lastManara);
      saved.push(r.firstOrdinary - r.firstManara);
      var anyDiff = false;
      Object.keys(r.kinds).forEach(function (k) {
        var kk = r.kinds[k], pk = perKind[k] || (perKind[k] = { n: 0, differs: 0, saved: [], farFaster: 0 });
        pk.n++; kindN++; pk.saved.push(kk.savedSec);
        if (kk.differs) { pk.differs++; kindDiff++; anyDiff = true; if (kk.extraStraightKm > 0.05 && kk.savedSec > 0) { pk.farFaster++; farFaster++; } }
      });
      if (anyDiff) { differs++; savedDiff.push(r.firstOrdinary - r.firstManara); }
      if (rows.length < 8) rows.push({ i: i, hazard: hz, lon: inc.lon, lat: inc.lat, src: inc.src, firstManaraSec: r.firstManara, firstOrdinarySec: r.firstOrdinary, kinds: r.kinds });
    }
    var done = fO.length, byKind = {};
    Object.keys(perKind).forEach(function (k) { var pk = perKind[k]; byKind[k] = { n: pk.n, differsPct: r1(100 * pk.differs / pk.n), farButFasterPct: r1(100 * pk.farFaster / pk.n), savedSec: stats(pk.saved) }; });
    var assume = {}; PARAM_DEFS.forEach(function (d) { if (d.group === 'traffic' || d.group === 'fleet' || d.group === 'dispatch' || d.group === 'ab') assume[d.key] = nat.P[d.key]; });
    var res = { label: SIM_LABEL, kind: 'national-ab', seed: seed, n: n, evaluated: done, skipped: skipped, hazards: hazards, t: t, clock: clockInfo(nat.start, t).clock, date: clockInfo(nat.start, t).iso, dowName: clockInfo(nat.start, t).dowName,
      units: nat.fleet.units.length, policies: { ordinary: 'nearest unit in a straight line (what a dispatcher sees on a map)', manara: 'fastest unit given simulated traffic', roadNearest: 'nearest unit by road length, ignoring traffic' },
      firstResponderEtaSec: { ordinary: stats(fO), manara: stats(fM), roadNearest: stats(fR) }, fullResponseEtaSec: { ordinary: stats(lastO), manara: stats(lastM) },
      differs: { incidentsPct: done ? r1(100 * differs / done) : 0, unitChoicesPct: kindN ? r1(100 * kindDiff / kindN) : 0, farButFasterChoicesPct: kindN ? r1(100 * farFaster / kindN) : 0 },
      savedSec: { all: stats(saved), whereChoiceDiffers: stats(savedDiff) }, byKind: byKind, sample: rows, changedParams: changedParams(nat), assumptions: assume,
      notes: [T('محاكاة: المواقع والتوفّر والازدحام مُحاكاة، والخريطة لقطة من OpenStreetMap؛ فحص لآلية العمل وليس دليلاً على الأثر.', 'Simulation: positions, availability and traffic are simulated and the map is an OpenStreetMap snapshot; a mechanism check, not proof of impact.'),
        T('الأزمنة لحظية (لقطة الازدحام عند وقت الحادث) وللمقارنة المزدوجة على الحوادث نفسها وبالوحدات المتاحة نفسها.', 'Times are snapshot ETAs at the incident time, paired on the same incidents and the same available units.')] };
    res.hash = fnv(JSON.stringify({ a: res.firstResponderEtaSec, b: res.savedSec, c: res.differs, d: res.byKind }));
    return res;
  }
  // how the gap depends on the assumptions: a grid over the traffic multiplier and the share of busy units (always show it: the result depends on assumptions)
  function sensitivity(o) {
    o = o || {};
    var loads = o.loads || [0, 0.5, 1, 1.5, 2], busy = o.busy || [0, 20, 40], rows = [];
    loads.forEach(function (L) {
      busy.forEach(function (B) {
        var r = ab({ seed: o.seed, n: o.n || 80, hazards: o.hazards, hour: o.hour, day: o.day, date: o.date, data: o.data, params: Object.assign({}, o.params, { trafficLoad: L, unitBusyPct: B }), roadBaseline: false });
        rows.push({ trafficLoad: L, unitBusyPct: B, evaluated: r.evaluated, medianEtaOrdinarySec: r.firstResponderEtaSec.ordinary.p50, medianEtaManaraSec: r.firstResponderEtaSec.manara.p50, p90EtaOrdinarySec: r.firstResponderEtaSec.ordinary.p90, p90EtaManaraSec: r.firstResponderEtaSec.manara.p90,
          differsPct: r.differs.incidentsPct, medianSavedSec: r.savedSec.all.p50, meanSavedSec: r.savedSec.all.mean, p90SavedSec: r.savedSec.all.p90 });
      });
    });
    return { label: SIM_LABEL, kind: 'national-sensitivity', seed: (o.seed >>> 0) || 1, n: o.n || 80, loads: loads, busy: busy, rows: rows,
      note: T('كيف تتغير فجوة الزمن مع افتراضين: شدّة الازدحام ونسبة الوحدات المشغولة. النتيجة تتوقف على الافتراضات.', 'How the time gap changes with two assumptions: the traffic level and the share of busy units. The result depends on the assumptions.') };
  }
  // A REAL example from the real map: an incident where the fastest unit is NOT the nearest in a straight line. Deterministic for a seed.
  function findFartherButFaster(seed, o) {
    o = o || {};
    seed = (seed >>> 0) || 1;
    var nat = o.nat || create({ seed: seed, hour: 7.5, day: 0, date: o.date, data: o.data, params: Object.assign({ unitBusyPct: 0 }, o.params) }), W = nat.W, sample = makeSampler(nat, seed);
    var peaks = o.times || [7.5, 17.75, 13.5], base = Mth.floor(nat.t / 86400) * 86400, night = base + 3 * 3600, kindsWanted = o.kinds || ['fire', 'ambulance', 'police'], budget = o.budget === undefined ? 120 : Mth.max(0, o.budget | 0), best = null, tried = 0, i, pi, r, rn;
    for (pi = 0; pi < peaks.length; pi++) {
      var tp = base + peaks[pi] * 3600;
      for (i = 0; i < budget; i++) {
        var inc = sample(i + pi * 1000); tried++;
        r = evalPolicies(nat, inc.lon, inc.lat, 'fire', tp, false);
        if (!r) continue;
        rn = null;
        kindsWanted.forEach(function (k) {
          var kk = r.kinds[k];
          if (!kk || !kk.differs || kk.savedSec < (o.minGainSec || 45) || kk.savedSec > (o.maxGainSec || 900) || kk.extraStraightKm < (o.minExtraKm || 0.4) || kk.extraStraightKm > 15 || kk.ordinary.eta > (o.maxEtaSec || 1500)) return;
          if (rn === null) rn = evalPolicies(nat, inc.lon, inc.lat, 'fire', night, false);
          var kn = rn && rn.kinds[k], flip = !!(kn && kn.manara.id === kn.ordinary.id);       // at night the nearest unit is also the fastest: traffic alone flipped the order
          var score = (flip ? 1e6 : 0) + (inc.src === 'place' ? 5e3 : 0) + Mth.min(kk.savedSec, 400) * 10 + kk.extraStraightKm;
          if (!best || score > best.score) best = { score: score, flip: flip, inc: inc, t: tp, kind: k, kk: kk };
        });
      }
    }
    if (!best) return null;
    // explain the winner exactly (re-timed with the clock running, routes drawn)
    var hz = 'fire', sc = sceneOf(nat, best.inc.lon, best.inc.lat), em = nat.P.emergencyFactor, cost = getCost(nat, best.t, em), S = runTree(W, cost.arr, seedsReaching(W, cost.arr, sc.edge, sc.frac), 'rev', 0);
    var ctx = { S: S, cost: cost, sc: sc, t: best.t, em: em, inc: null, lon: best.inc.lon, lat: best.inc.lat }, need = { kind: best.kind, flag: null }, pk = pickFor(nat, ctx, need, null), wy = whyFor(nat, pk, need, ctx);
    var ch = pk.chosen, nr = pk.nearest, ci = clockInfo(nat.start, best.t), place = nearestPlace(W, best.inc.lon, best.inc.lat), mu = W.geo.municipalityAt(best.inc.lon, best.inc.lat);
    var describe = function (en) { return { unitId: en.u.id, name: en.u.name, etaSec: Mth.round(en.eta), freeFlowEtaSec: Mth.round(en.freeEta), roadKm: km1(en.distM), straightKm: km1(en.straightM), congestedSegments: en.ex.congestedN, slowest: en.ex.congested, route: decimate(stepsPolyline(W, en.steps), 300), base: { lon: en.u.base.lon, lat: en.u.base.lat } }; };
    return { label: SIM_LABEL, seed: seed, searched: tried, t: best.t, clock: ci.clock, date: ci.iso, dowName: ci.dowName, kind: best.kind, trafficAloneFlipsOrder: best.flip,
      incident: { hazard: hz, lon: best.inc.lon, lat: best.inc.lat, place: place ? { id: place.id, name: place.name, distKm: r1(place.distM / 1000) } : null, muni: mu, source: best.inc.src },
      fastest: describe(ch), nearest: describe(nr), gainSec: Mth.round(nr.eta - ch.eta), extraStraightKm: r1((ch.straightM - nr.straightM) / 1000), extraRoadKm: r1((ch.distM - nr.distM) / 1000), reason: wy.data.reason, why: wy.why, whyData: wy.data,
      note: T('مثال محاكى على شبكة طرق حقيقية (OpenStreetMap)؛ الازدحام ومواقع الوحدات وتوفّرها محاكاة.', 'A simulated example on the real road network (OpenStreetMap); the congestion and the unit positions / availability are simulated.') };
  }

  /* ====================================================================================
   * 16. PUBLIC API
   * ==================================================================================== */
  function worldInfo(nat) {
    var W = nat.W, G = W.G, g = W.grid;
    return { attribution: W.attribution, snapshotDate: W.snapshot, build: W.build, nodes: W.n, edges: W.E, arcs: W.A, contraflowArcs: W.A2 - W.A, km: Mth.round(G.eLen.reduce(function (a, b) { return a + b; }, 0) / 1000), facilities: W.facs.length, places: W.geo.places.length, municipalities: W.geo.municipalities.map(function (m) { return { id: m.id, name: m.name, centre: m.centre }; }),
      tunnels: W.tunnels.length, corridors: W.corridorCounts, industrialPlaces: W.industrial.map(function (p) { return { id: p.id, name: p.name }; }), grid: { lon0: g.lon0, lat0: g.lat0, d: g.d, nx: g.nx, ny: g.ny, landCells: g.land.reduce(function (a, b) { return a + b; }, 0) },
      bbox: W.geo.bbox, bboxAll: W.geo.bboxAll, buildMs: W.buildMs, note: 'Static map: a snapshot of OpenStreetMap (ODbL). Everything that moves is simulated.' };
  }
  function unitList(nat, t) {
    t = t === undefined ? nat.t : t;
    return nat.fleet.units.map(function (u) { return { id: u.id, kind: u.kind, name: u.name, role: u.role, basing: u.basing, facility: u.fac, base: u.base, pos: { lon: r5(u.pos.lon), lat: r5(u.pos.lat) }, state: u.state, assigned: u.assigned, busy: isBusy(nat, u, t, null), flags: u.flags }; });
  }
  function timeAt(nat, iso, hour) {
    var s = nat.start, p = parseDate(iso), days = Mth.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(s.y, s.m - 1, s.d)) / 86400000);
    return days * 86400 + (hour || 0) * 3600;
  }
  function edgeAt(nat, lon, lat, maxM) {
    var sn = snapTo(nat.W, lon, lat, maxM || 5000);
    return sn ? { edge: sn.edge, frac: sn.frac, distM: Mth.round(sn.distM), lon: sn.lon, lat: sn.lat, info: roadInfo(nat, sn.edge) } : null;
  }
  // the flood layer: only the tunnels / underpasses (and user-placed ponding points) can hold water; by default only the wet or closed ones are listed
  function floodState(nat, o) {
    var W = nat.W, all = !!(o && o.all), out = { tunnels: [], ponds: [], closed: 0, note: 'No elevation model: depth exists only at the road tunnels / underpasses of the data and at user-placed ponding points (SIMULATED).' };
    nat.flood.tunnels.forEach(function (tn) {
      if (tn.closed) out.closed++;
      if (all || tn.depthCm > 0.5 || tn.closed) out.tunnels.push({ edge: tn.e, name: edgeName(W, tn.e), lon: r5(W.eMidLon[tn.e]), lat: r5(W.eMidLat[tn.e]), depthCm: r1(tn.depthCm), closed: tn.closed });
    });
    nat.ponds.forEach(function (pd) { out.ponds.push({ id: pd.id, name: pd.name, lon: pd.lon, lat: pd.lat, radiusM: pd.radiusM, depthCm: r1(pd.depthCm), closed: pd.closed, edges: pd.edges.length }); });
    return out;
  }
  function polyline(nat, edge) { var pl = nat.W.G.polyline(edge), out = [], i; for (i = 0; i < pl.length; i += 2) out.push([pl[i], pl[i + 1]]); return out; }
  var API = {
    VERSION: VERSION, SIM_LABEL: SIM_LABEL, PARAMS: PARAM_DEFS, PARAM_GROUPS: PARAM_GROUPS, MSG: MSG, HAZARDS: HAZARDS, HAZARD_NAME: HAZARD_NAME, KIND_NAME: KIND_NAME, REQUIRED: REQUIRED, PROFILES: PROFILES, DOW_NAMES: DOW_NAMES,
    defaults: defaultParams, create: create, restart: function (nat, over) { return create(Object.assign({}, nat.opts, over || {})); },
    step: step, run: run, snapshot: snapshot, hash: hashNat, world: worldInfo, units: unitList, time: function (nat, t) { return clockInfo(nat.start, t === undefined ? nat.t : t); }, timeAt: timeAt,
    // operator / test actions
    setParam: setParam, jamRoad: jamRoad, unjamRoad: unjamRoad, jamArea: jamArea, clearJams: clearJams, closeRoad: closeRoad, openRoad: openRoad, closeArea: closeArea, setUnitBusy: setUnitBusy, cordon: setCordon, liftCordon: liftCordon,
    setRain: setRain, addRainCell: addRainCell, clearRain: clearRain, startDust: startDust, stopDust: stopDust, addPonding: addPonding,
    // incidents and dispatch
    createIncident: createIncident, incident: getIncident, approve: approve, cancelIncident: cancelIncident, dispatchNational: dispatchNational, busDispatch: busDispatch, busAdvisory: busAdvisory, residentLines: residentLines, cap: capXml,
    // map / geography helpers
    viewport: viewport, haversineM: haversineM, bearingDeg: bearingDeg, compass: compass, offsetLL: offsetLL, snap: function (nat, lon, lat, maxM) { return snapTo(nat.W, lon, lat, maxM); }, edgeAt: edgeAt, polyline: polyline, nearestPlace: function (nat, lon, lat) { return nearestPlace(nat.W, lon, lat); },
    // traffic
    roadInfo: roadInfo, congestionMap: congestionMap, floodState: floodState, profileAt: profileAt, route: route,
    // hazards, KPIs
    fields: hazardFields, heatField: heatField, dustField: dustField, rainField: rainField, visibility: visIndex, wbgtEstimate: wbgtEstimate, heatExposure: heatExposure, kpis: kpis, municipalities: municipalityStatus, advisories: advisories, renderMsg: renderMsg, middayBan: function (nat, t) { return inMiddayBan(clockInfo(nat.start, t === undefined ? nat.t : t)); },
    // phones
    nearestFacilities: nearestFacilities,
    // A/B, demonstration
    ab: ab, sensitivity: sensitivity, findFartherButFaster: findFartherButFaster, sampler: makeSampler,
    // low-level (tests): the graph, a cost array, a Dijkstra on any cost array
    testing: {
      graph: function (nat) { var W = nat.W; return { G: W.G, n: W.n, A: W.A2, dataArcs: W.A, E: W.E, aFrom: W.aFrom, aTo: W.aTo, aEdge: W.aEdge, inStart: W.inStart, inArc: W.inArc, outStart: W.outStart, outArc: W.outArc, eArc0: W.eArc0, eRev: W.eRev }; },
      cost: function (nat, t, em, civil) { return getCost(nat, t === undefined ? nat.t : t, em || 1, !!civil).arr; },
      tree: function (nat, cost, seeds, dir) { var S = runTree(nat.W, cost, seeds, dir, 1); return { dist: S.dist.slice(), link: S.link.slice(), seed: S.seed.slice() }; },
      seedsReaching: function (nat, cost, e, f) { return seedsReaching(nat.W, cost, e, f); }, seedsLeaving: function (nat, cost, e, f) { return seedsLeaving(nat.W, cost, e, f); },
      pickFor: pickFor, evalPolicies: evalPolicies, arcCong: function (nat, t, a) { var c = timeCtx(nat, t); ensureOverlays(nat, c); return arcCong(nat, c, a); }, clockInfo: clockInfo, stullWetBulb: stullWetBulb, wbgt: wbgtEstimate, plan: function (nat, inc, t) { return buildPlan(nat, inc, t); }
    }
  };
  root.ManaraNational = API;

})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
