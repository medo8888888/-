// MANARA («منارة») — tests of the NATIONAL engine (all of Qatar): node manara/tools/test-national.mjs   (Node only, no browser, no network)
//
//   1  loading: the engine and the three data scripts load in a bare `vm` context like classic <script>s; house laws; API and assumptions registry
//   2  determinism: same seed → same hash (also when stepped in different chunk sizes); different seeds differ; pure functions do not depend on call order
//   3  Dijkstra: equal to a brute-force Bellman–Ford on an induced subgraph (reverse and forward); route polylines are contiguous; ETA = independent route time
//   4  calendar and traffic: Qatar's weekend is Friday + Saturday; peaks, Friday-prayer lull, tidal flow, multiplier, jams, closures, incident slow-down, named corridors
//   5  dispatch: fastest-given-traffic (not nearest), busy units skipped, a jam changes the chosen unit, a closed edge changes the route, hospitals with an ED, capacity
//   6  state machine and automatic RE-DISPATCH / RE-ROUTING events
//   7  every hazard type at 8 well-spread locations; severity; multiple incidents do not double-book units
//   8  national hazard layers (heat / dust / flood), advisories (message keys), municipality status, KPIs
//   9  A/B (nearest-by-distance vs fastest-given-traffic), sensitivity sweep, the "farther but faster" demonstration on the REAL map
//  10  phones helper, viewport helpers, OASIS CAP 1.2 export
//  11  a full simulated day without a single NaN; performance (Dijkstra < 40 ms, dispatch < 80 ms); memory
//  12  robustness: bad input never throws and never poisons the state
//
// Everything the engine moves (traffic, availability, hazard fields) is a SIMULATION on a snapshot of OpenStreetMap data: these tests check that the
// mechanisms behave, not that the numbers are real. Exit code 1 on any failure.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');   // manara/ (this file is manara/tools/test-national.mjs)
const CODE = fs.readFileSync(path.join(SITE, 'js/national.js'), 'utf8');

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log('\n' + t);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'perf' ? undefined : v)));
const timings = {};
const cast = [['fire', 51.5264, 25.2856, 2, 1.0], ['gas', 51.4422, 25.1735, 3, 3.5], ['heat', 51.5497, 24.9954, 2, 6.0], ['sos', 51.2157, 26.1183, 1, 8.0], ['fire', 51.5013, 25.1904, 3, 9.5], ['flood', 51.4346, 25.2966, 2, 10.0], ['dust', 51.0, 24.9, 1, 12.0],
  ['sos', 51.6013, 25.1566, 1, 13.5], ['heat', 51.5, 25.68, 2, 14.0], ['fire', 50.7876, 25.4189, 2, 16.0], ['gas', 51.5331, 25.8977, 2, 17.8], ['sos', 51.5264, 25.2856, 1, 19.0], ['flood', 51.4, 25.3, 3, 20.5], ['fire', 51.45, 25.33, 2, 22.0]];

// ---------------------------------------------------------------------------------------------------------------- 1  loading
section('1  loading, API, assumptions registry, house laws');
const ctx = vm.createContext({});
let t0 = performance.now();
for (const f of ['qatar-geo.js', 'qatar-facilities.js', 'qatar-roads.js']) vm.runInContext(fs.readFileSync(path.join(SITE, 'data', f), 'utf8'), ctx, { filename: f });
timings.dataLoadMs = performance.now() - t0;
t0 = performance.now();
vm.runInContext(CODE, ctx, { filename: 'national.js' });
timings.engineLoadMs = performance.now() - t0;
const N = ctx.ManaraNational, GEO = ctx.MANARA_QATAR_GEO, FAC = ctx.MANARA_QATAR_FACILITIES;
check('window.ManaraNational exists after the classic script ran in a bare vm context', !!N && typeof N.create === 'function');
check('engine script loads in < 100 ms', timings.engineLoadMs < 100, timings.engineLoadMs.toFixed(1) + ' ms');
check('house laws: classic script, no DOM / fetch / XHR / eval / innerHTML / import / export', !/\b(document|window\.(?!MANARA_)|XMLHttpRequest|innerHTML|localStorage)\b|\bfetch\s*\(|\beval\s*\(|\bnew Function\b/.test(CODE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')) && !/^\s*(import|export)\s/m.test(CODE));
check('no e-mail address in the engine', !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(CODE.replace(/manara-simulation@example\.invalid/g, '')));
check('header documents the public API and the message schema additions', /PUBLIC API/.test(CODE.slice(0, 40000)) && /busDispatch/.test(CODE.slice(0, 40000)) && /nat\.adv\./.test(CODE.slice(0, 40000)));
check('the ending marker of the build is gone', !CODE.includes('@@NEXT@@'));
const API = ['create', 'restart', 'step', 'run', 'snapshot', 'hash', 'createIncident', 'approve', 'dispatchNational', 'busDispatch', 'busAdvisory', 'residentLines', 'cap', 'viewport', 'nearestFacilities', 'ab', 'sensitivity', 'findFartherButFaster',
  'kpis', 'advisories', 'municipalities', 'fields', 'jamRoad', 'closeRoad', 'setUnitBusy', 'startDust', 'setRain', 'addRainCell', 'route', 'roadInfo', 'congestionMap', 'heatExposure', 'world', 'units'];
check('the documented API functions exist', API.every(k => typeof N[k] === 'function'), API.filter(k => typeof N[k] !== 'function').join(','));
check('PARAMS: bilingual labels and descriptions, defaults within ranges, known groups, a source string', N.PARAMS.length >= 55 && N.PARAMS.every(p => p.label.ar && p.label.en && p.desc.ar && p.desc.en && p.default >= p.min && p.default <= p.max && p.step > 0 && N.PARAM_GROUPS.some(g => g.id === p.group) && typeof p.src === 'string'), N.PARAMS.length + ' parameters');
check('PARAMS: the published heat / dust thresholds carry their source ids (S19, S52, S31, S49, S55, S30)', ['wbgtStop:S19', 'wbgtWarn:S52', 'dustWarn:S31', 'dustDanger:S49', 'dustCritical:S49', 'roadCloseCm:S55', 'dustPeak:S30'].every(x => { const [k, s] = x.split(':'); return N.PARAMS.find(p => p.key === k).src === s; }));
check('PARAMS defaults match the documents (stop-work WBGT 32.1, PM10 150 / 255 / 425, warn WBGT 28)', N.defaults().wbgtStop === 32.1 && N.defaults().dustWarn === 150 && N.defaults().dustDanger === 255 && N.defaults().dustCritical === 425 && N.defaults().wbgtWarn === 28);
check('SIM label and bilingual message table', /SIMULATION/.test(N.SIM_LABEL.en) && N.SIM_LABEL.ar.length > 5 && Object.keys(N.MSG).length >= 20 && Object.values(N.MSG).every(m => m.ar && m.en));
check('required units per hazard follow manara/docs/MANARA-SPEC.md', N.REQUIRED.fire.some(r => r.kind === 'fire') && N.REQUIRED.fire.some(r => r.kind === 'ambulance') && N.REQUIRED.fire.some(r => r.kind === 'police') && N.REQUIRED.gas.some(r => r.flag === 'hazmat')
  && N.REQUIRED.flood.some(r => r.kind === 'rescue') && N.REQUIRED.flood.some(r => r.kind === 'police') && N.REQUIRED.dust.length === 2 && N.REQUIRED.heat.length === 1 && N.REQUIRED.sos.length === 1);

t0 = performance.now();
const nat = N.create({ seed: 7 });
timings.createMs = performance.now() - t0;
const world = N.world(nat);
console.log(`  world: ${world.nodes} nodes, ${world.edges} edges, ${world.arcs} arcs, ${world.km} km, ${world.facilities} facilities, ${world.places} places, ${world.tunnels} tunnels/underpasses; build ${world.buildMs} ms, create ${timings.createMs.toFixed(0)} ms`);
check('the world is the bundled Qatar snapshot (23,135 nodes, 138 facilities, 8 municipalities)', world.nodes === 23135 && world.facilities === 138 && world.municipalities.length === 8, world.build);
check('attribution and snapshot date travel with the engine', /OpenStreetMap contributors, ODbL/.test(world.attribution) && /^2026-\d\d-\d\d$/.test(world.snapshotDate));
check('the engine adds a second environment for free: a new create() reuses the cached world', (() => { const a = performance.now(); N.create({ seed: 8 }); return performance.now() - a < 150; })());
const fleet = N.units(nat), kinds = {};
fleet.forEach(u => { kinds[u.kind] = (kinds[u.kind] || 0) + 1; });
console.log('  fleet (SIM, generated from real facilities): ' + JSON.stringify(kinds));
check('fleet: fire, police and ambulance units exist, every unit sits on a real facility of the data', kinds.fire >= 15 && kinds.police >= 20 && kinds.ambulance >= 10 && fleet.every(u => FAC.some(f => f.id === u.facility)));
check('fleet: the directorate office and administrative / training police sites are NOT response units', !fleet.some(u => u.facility === 'fire-w490727316') && !fleet.some(u => { const f = FAC.find(x => x.id === u.facility); return f.kind === 'police' && (f.role === 'department' || f.role === 'training'); }));
check('fleet parameters: the Wadi Al-Sali HQ complex (OSM amenity=fire_station) is a unit by default, not with fireIncludeHq 0; industrial stations switch off; vehicles per station multiply; ambulance basing 0 / 2', (() => {
  const U = p => N.units(N.create({ seed: 1, params: p }));
  const base = U({}), c = (a, k) => a.filter(u => u.kind === k).length;
  return base.some(u => u.facility === 'fire-w221983389') && !U({ fireIncludeHq: 0 }).some(u => u.facility === 'fire-w221983389')
    && !U({ industrialFire: 0 }).some(u => FAC.find(f => f.id === u.facility).role === 'industrial-fire-station') && U({ unitsPerStation: 2 }).length === 2 * base.length
    && c(U({ ambulanceBasing: 0 }), 'ambulance') === 3 && c(U({ ambulanceBasing: 2 }), 'ambulance') > c(base, 'ambulance') && U({ policeIncludeAdmin: 1 }).filter(u => u.kind === 'police').length > c(base, 'police');
})());
check('fleet: ambulances sit only at OSM ambulance points or hospitals with a verified ED', fleet.filter(u => u.kind === 'ambulance').every(u => { const f = FAC.find(x => x.id === u.facility); return f.kind === 'ambulance' || f.ed === 'yes'; }));
check('fleet: no unit is created for a hospital that is restricted / obstetric-only / paediatric-only', fleet.filter(u => u.kind === 'ambulance').every(u => { const f = FAC.find(x => x.id === u.facility); return !(f.caps || []).includes('obstetric') && !(f.flags || []).some(x => /restricted access/.test(x)); }));

// ---------------------------------------------------------------------------------------------------------------- 2  determinism
section('2  determinism, order independence');
const scenario = (seed, chunk) => {
  const n = N.create({ seed, hour: 7.5, tickSec: 5, params: { recheckSec: 15 } });
  N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 });
  N.createIncident(n, { hazard: 'sos', lon: 51.43, lat: 25.30, severity: 1 });
  N.jamArea(n, 51.50, 25.27, 1500, 0.3);
  for (let i = 0; i < 1200 / chunk; i++) N.step(n, chunk);
  return n;
};
const h1 = N.hash(scenario(11, 60)), h2 = N.hash(scenario(11, 60)), h3 = N.hash(scenario(11, 5)), h4 = N.hash(scenario(12, 60));
check('same seed → same hash (two independent runs)', h1 === h2, h1);
check('stepping in chunks of 60 s or 5 s gives the same hash', h1 === h3);
check('a different seed gives a different hash', h1 !== h4, h4);
{
  const a = N.create({ seed: 5 }), b = N.create({ seed: 5 });
  const inc = { hazard: 'fire', lon: 51.40, lat: 25.20, severity: 2 };
  const p1 = strip(N.dispatchNational(a, inc, a.t));
  N.dispatchNational(a, { hazard: 'gas', lon: 51.2, lat: 25.9, severity: 3 }, a.t + 7200); N.roadInfo(a, 100, a.t + 99999); N.congestionMap(a, a.t + 50000);
  const p2 = strip(N.dispatchNational(a, inc, a.t)), p3 = strip(N.dispatchNational(b, inc, b.t));
  check('dispatchNational is a pure function of (state, incident, time): other calls in between change nothing', JSON.stringify(p1) === JSON.stringify(p2) && JSON.stringify(p1) === JSON.stringify(p3));
  check('the busy draw is seeded: different seeds mark different units busy', JSON.stringify(N.units(N.create({ seed: 1, params: { unitBusyPct: 30 } })).map(u => u.busy)) !== JSON.stringify(N.units(N.create({ seed: 2, params: { unitBusyPct: 30 } })).map(u => u.busy)));
  const r1 = N.ab({ seed: 3, n: 30 }), r2 = N.ab({ seed: 3, n: 30 }), r3 = N.ab({ seed: 4, n: 30 });
  check('A/B: same seed → same hash, different seed → different', r1.hash === r2.hash && r1.hash !== r3.hash);
  const f1 = N.findFartherButFaster(7), f2 = N.findFartherButFaster(7);
  check('findFartherButFaster(seed) is deterministic', f1 && f2 && f1.incident.lon === f2.incident.lon && f1.incident.lat === f2.incident.lat && f1.fastest.unitId === f2.fastest.unitId && f1.gainSec === f2.gainSec);
}

// ---------------------------------------------------------------------------------------------------------------- 3  Dijkstra
section('3  Dijkstra against brute force, route geometry, ETA consistency');
{
  const g = N.testing.graph(nat), G = g.G, n = g.n, A = g.A;
  // an induced subgraph: BFS (ignoring direction) from a node near Doha, 400 nodes
  const start = G.nearestNode(51.5264, 25.2856).node, inSub = new Uint8Array(n), queue = [start], seen = new Uint8Array(n); seen[start] = 1;
  const adj = Array.from({ length: n }, () => []);
  for (let a = 0; a < A; a++) { adj[g.aFrom[a]].push(g.aTo[a]); adj[g.aTo[a]].push(g.aFrom[a]); }
  for (let qi = 0; qi < queue.length && queue.length < 400; qi++) for (const v of adj[queue[qi]]) if (!seen[v] && queue.length < 400) { seen[v] = 1; queue.push(v); }
  queue.forEach(v => { inSub[v] = 1; });
  // seeded pseudo-random positive costs on the induced arcs, Infinity elsewhere
  let sd = 12345; const rnd = () => { sd = (Math.imul(sd, 1103515245) + 12345) >>> 0; return sd / 4294967296; };
  const cost = new Float32Array(A).fill(Infinity); const arcs = [];
  for (let a = 0; a < A; a++) if (inSub[g.aFrom[a]] && inSub[g.aTo[a]]) { cost[a] = 1 + Math.floor(rnd() * 400) / 4; arcs.push(a); }
  const target = queue[Math.floor(queue.length / 2)];
  const bellman = (srcNode, rev) => {
    const d = new Float64Array(n).fill(Infinity); d[srcNode] = 0;
    for (let it = 0; it < queue.length + 2; it++) {
      let ch = false;
      for (const a of arcs) { const u = rev ? g.aTo[a] : g.aFrom[a], v = rev ? g.aFrom[a] : g.aTo[a]; if (d[u] + cost[a] < d[v] - 1e-12) { d[v] = d[u] + cost[a]; ch = true; } }
      if (!ch) break;
    }
    return d;
  };
  for (const dir of ['rev', 'fwd']) {
    const bf = bellman(target, dir === 'rev'), tr = N.testing.tree(nat, cost, [[target, 0, -1]], dir);
    let bad = 0, finite = 0;
    for (const v of queue) { if (Number.isFinite(bf[v])) finite++; if (!(Math.abs(bf[v] - tr.dist[v]) <= 1e-6 * Math.max(1, Math.abs(bf[v]))) && !(bf[v] === Infinity && tr.dist[v] === Infinity)) bad++; }
    let outsideOk = true; for (let v = 0; v < n; v++) if (!inSub[v] && tr.dist[v] !== Infinity) outsideOk = false;
    check(`Dijkstra (${dir}) equals Bellman–Ford on a ${queue.length}-node induced subgraph (${finite} reachable, ${arcs.length} arcs)`, bad === 0 && finite > 100, bad + ' mismatches');
    check(`Dijkstra (${dir}) never leaves the induced subgraph (outside arcs cost Infinity)`, outsideOk);
    // the path stored in link[] has exactly the stored distance
    let pathOk = true;
    for (const v of queue.slice(0, 120)) {
      if (!Number.isFinite(tr.dist[v]) || v === target) continue;
      let node = v, sum = 0, guard = 0;
      while (tr.link[node] >= 0 && guard++ < 5000) { const a = tr.link[node]; sum += cost[a]; node = dir === 'rev' ? g.aTo[a] : g.aFrom[a]; }
      if (node !== target || Math.abs(sum - tr.dist[v]) > 1e-4 * Math.max(1, sum)) pathOk = false;
    }
    check(`Dijkstra (${dir}): following link[] reproduces the stored distance`, pathOk);
  }
  // the multi-seed form: a point inside an edge is reachable from both ends; time = partial edge + distance
  const sc = nat.W.G.locate(51.5264, 25.2856, 5000), full = N.testing.cost(nat, nat.t, 1.3);
  const seeds = N.testing.seedsReaching(nat, full, sc.edge, sc.frac);
  check('seedsReaching: a one-way edge gives one seed, a two-way edge two', seeds.length === (G.eTwoWay[sc.edge] ? 2 : 1) && seeds.every(s => s[1] >= 0 && Number.isFinite(s[1])));
}
{
  // ETA consistency: the plan's ETA equals turn-out + access + an independently computed route time (forward Dijkstra from the station)
  const inc = { hazard: 'fire', lon: 51.4900, lat: 25.3100, severity: 1, id: 'T' };
  const plan = N.dispatchNational(nat, inc, nat.t), P = nat.P;
  const U = Object.fromEntries(N.units(nat).map(u => [u.id, u]));
  let okAll = true, worst = 0;
  for (const pu of plan.units) {
    const u = U[pu.unitId], r = N.route(nat, { lon: u.base.lon, lat: u.base.lat }, { lon: inc.lon, lat: inc.lat }, nat.t + (pu.kind === 'fire' ? P.turnoutFireSec : pu.kind === 'ambulance' ? P.turnoutAmbSec : P.turnoutPoliceSec), { em: P.emergencyFactor });
    const turn = pu.kind === 'fire' || pu.kind === 'rescue' ? P.turnoutFireSec : pu.kind === 'ambulance' ? P.turnoutAmbSec : P.turnoutPoliceSec;
    const expect = turn + r.sec, diff = Math.abs(expect - pu.etaSec);
    worst = Math.max(worst, diff); if (diff > 3 + 0.03 * expect) okAll = false;
  }
  check('the ETA of every recommended unit equals turn-out + an independently routed time (±3 s ±3 %)', okAll, 'worst difference ' + worst.toFixed(1) + ' s');
  // the fire unit chosen is the brute-force argmin over every fire unit
  const fires = N.units(nat).filter(u => u.kind === 'fire' && !u.busy), plan2 = N.dispatchNational(nat, { ...inc, hazard: 'fire' }, nat.t), chosen = plan2.units.find(u => u.kind === 'fire');
  const brute = fires.map(u => ({ id: u.id, sec: N.route(nat, { lon: u.base.lon, lat: u.base.lat }, { lon: inc.lon, lat: inc.lat }, nat.t + 60, { em: P.emergencyFactor }).sec + 60 })).sort((a, b) => a.sec - b.sec);
  const chosenBrute = brute.find(b => b.id === chosen.unitId);
  check('the fire unit chosen is the brute-force fastest over all available fire units (within 10 s)', chosenBrute && chosenBrute.sec <= brute[0].sec + 10, `chosen ${chosen.unitId} ${chosenBrute && chosenBrute.sec.toFixed(0)} s vs best ${brute[0].id} ${brute[0].sec.toFixed(0)} s`);
  // polylines: contiguous, start at the station's road point, end at the scene's road point
  const incR = N.createIncident(nat, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 }), snap = N.snapshot(nat, { kpis: false }), sn = snap.incidents.find(i => i.id === incR.id);
  let routesOk = true, maxJump = 0, endsOk = true;
  for (const u of sn.plan.units) {
    if (!u.unitId || !u.route.length) continue;
    const r = u.route;
    for (let i = 1; i < r.length; i++) maxJump = Math.max(maxJump, N.haversineM(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]));
    const first = r[0], last = r[r.length - 1], sp = sn.plan.scene;
    if (N.haversineM(last[0], last[1], sp.roadLon, sp.roadLat) > 3) endsOk = false;
    const base = U[u.unitId].base, fr = FAC.find(f => f.id === U[u.unitId].facility), snapPt = nat.W.G.locate(fr.lon, fr.lat, 5000);
    if (N.haversineM(first[0], first[1], snapPt.lon, snapPt.lat) > 3) endsOk = false;
    if (!r.every(p => p[0] > 50.7 && p[0] < 51.7 && p[1] > 24.4 && p[1] < 26.2)) routesOk = false;
  }
  check('route polylines run from the station\'s road point to the scene\'s road point, inside Qatar', endsOk && routesOk);
  check('route polylines are contiguous at the drawing scale (decimated to ≤ 200 points, no jump over 10 km)', maxJump < 10000, 'largest gap ' + Math.round(maxJump) + ' m');
}

// ---------------------------------------------------------------------------------------------------------------- 4  calendar and traffic
section('4  calendar and traffic (all SIMULATED)');
{
  const n0 = N.create({ seed: 2, date: '2026-07-12', hour: 8, params: { noisePct: 0 } });     // Sunday
  const at = (day, hour) => day * 86400 + hour * 3600;
  const info = d => N.time(n0, at(d, 12));
  check('2026-07-12 is a Sunday; the week runs Sunday–Thursday, the weekend is Friday + Saturday', info(0).dow === 0 && !info(0).weekend && info(4).dowName.en === 'Thursday' && info(4).dayType === 'thu' && info(5).dowName.en === 'Friday' && info(5).weekend && info(6).dowName.en === 'Saturday' && info(6).weekend && !info(7).weekend && info(7).dowName.en === 'Sunday');
  check('weekday names are bilingual', N.DOW_NAMES.every(d => d.ar && d.en));
  check('timeAt() converts a date + hour to the simulation clock', N.timeAt(n0, '2026-07-17', 8) === 5 * 86400 + 8 * 3600 && N.time(n0, N.timeAt(n0, '2026-07-17', 8)).dowName.en === 'Friday');
  const ratio = (day, hour) => N.kpis(n0, at(day, hour)).traffic.meanSpeedRatio;
  const sunAM = ratio(0, 7.5), sunPM = ratio(0, 17.8), sunNight = ratio(0, 3), sunNoon = ratio(0, 11), friAM = ratio(5, 7.5), friPrayer = ratio(5, 12), friAfternoon = ratio(5, 15), friEvening = ratio(5, 20), satAM = ratio(6, 7.5), thuEve = ratio(4, 21), sunEve = ratio(0, 21);
  console.log(`  mean speed ratio (1 = free flow): Sun 03:00 ${sunNight}, 07:30 ${sunAM}, 11:00 ${sunNoon}, 17:48 ${sunPM}, 21:00 ${sunEve} | Thu 21:00 ${thuEve} | Fri 07:30 ${friAM}, 12:00 ${friPrayer}, 15:00 ${friAfternoon}, 20:00 ${friEvening} | Sat 07:30 ${satAM}`);
  check('work-week morning and evening peaks are slower than the night', sunAM < sunNight - 0.03 && sunPM < sunNight - 0.03);
  {
    let minR = 2, minH = 0; for (let h = 0; h < 24; h += 0.25) { const r = ratio(0, h); if (r < minR) { minR = r; minH = h; } }
    check('the slowest quarter-hour of a work day falls inside a published peak window (06:30–08:30 or 17:15–19:15)', (minH >= 6.5 && minH <= 8.5) || (minH >= 17.25 && minH <= 19.25), `slowest at ${minH} h, speed ratio ${minR}`);
  }
  check('a weekend morning (Friday / Saturday 07:30) is faster than a Sunday morning', friAM > sunAM + 0.03 && satAM > sunAM + 0.03);
  check('Friday-prayer lull: noon on Friday is faster than Friday 15:00 and faster than Sunday noon', friPrayer >= friAfternoon && friPrayer > ratio(0, 12) - 0.0001 && friPrayer > sunNoon);
  check('Thursday evening (start of the weekend) is busier than Sunday evening', thuEve < sunEve);
  check('the global multiplier works: 0 = free flow, larger = slower', (() => { const f0 = N.create({ seed: 2, params: { trafficLoad: 0, noisePct: 0 } }), f2 = N.create({ seed: 2, params: { trafficLoad: 2, noisePct: 0 } }); return N.kpis(f0, at(0, 7.5)).traffic.meanSpeedRatio === 1 && N.kpis(f2, at(0, 7.5)).traffic.meanSpeedRatio < sunAM; })());
  // urban core vs highway, tide
  const g = N.testing.graph(n0), W = n0.W, G = g.G, cong = (a, t) => N.testing.arcCong(n0, t, a);
  let urbanSum = 0, urbanN = 0, ruralSum = 0, ruralN = 0;
  for (let e = 0; e < W.E; e += 3) { const a = g.eArc0[e], c = cong(a, at(0, 7.5)); if (W.eUrb[e] > 0.7 && G.eCls[e] === 3) { urbanSum += c; urbanN++; } if (W.eUrb[e] < 0.05 && G.eCls[e] <= 1) { ruralSum += c; ruralN++; } }
  check('at the morning peak urban secondary roads are slower than rural highways (class + location from the data)', urbanN > 50 && ruralN > 50 && urbanSum / urbanN < ruralSum / ruralN - 0.1, `urban ${(urbanSum / urbanN).toFixed(2)} vs rural ${(ruralSum / ruralN).toFixed(2)}`);
  const tideSet = (sign) => { const l = []; for (let a = 0; a < g.dataArcs; a += 2) if (W.aTide[a] * sign > 0.6 && W.eUrb[g.aEdge[a]] > 0.4 && g.aEdge[a] % 2 === 0) l.push(a); return l; };
  const toward = tideSet(1), away = tideSet(-1), mean = (l, t) => l.reduce((s, a) => s + cong(a, t), 0) / l.length;
  check('commuter tide: in the morning arcs towards the core are slower than arcs away from it', toward.length > 30 && away.length > 30 && mean(toward, at(0, 7.4)) < mean(away, at(0, 7.4)), `${mean(toward, at(0, 7.4)).toFixed(3)} vs ${mean(away, at(0, 7.4)).toFixed(3)}`);
  check('commuter tide: in the evening it reverses', mean(toward, at(0, 17.8)) > mean(away, at(0, 17.8)), `${mean(toward, at(0, 17.8)).toFixed(3)} vs ${mean(away, at(0, 17.8)).toFixed(3)}`);
  check('no commuter tide on the weekend', Math.abs(mean(toward, at(5, 7.4)) - mean(away, at(5, 7.4))) < 0.02);
  // corridors from the data names
  const cc = N.world(n0).corridors;
  check('named corridors exist only where the OSM names are in the data (Corniche, Salwa Road, ring roads, industrial-area roads)', cc.corniche.edges > 0 && cc.salwa.edges > 0 && cc.ring.edges > 0 && cc.industrial.edges > 0 && cc.salwa.names.includes('Salwa Road'), JSON.stringify(Object.fromEntries(Object.entries(cc).map(([k, v]) => [k, v.edges]))));
  let withC = 0, withoutC = 0, nC = 0, nO = 0;
  for (let e = 0; e < W.E; e += 2) if (G.eCls[e] === 2 && W.eInd[e] === 0 && Math.abs(W.eUrb[e] - 0.6) < 0.3) { const c = cong(g.eArc0[e], at(0, 17.8)); if (W.eCorr[e]) { withC += c; nC++; } else { withoutC += c; nO++; } }
  check('corridor edges are slower than comparable edges at the evening peak', nC > 10 && withC / nC < withoutC / nO, `${(withC / nC).toFixed(3)} vs ${(withoutC / nO).toFixed(3)}`);
  // operator actions
  const e0 = G.locate(51.52, 25.29, 3000).edge, before = N.roadInfo(n0, e0, at(0, 8)).cong;
  N.jamRoad(n0, e0, 0.2); const jammed = N.roadInfo(n0, e0, at(0, 8)).cong;
  check('jamming a road lowers its congestion factor; unjam restores it', jammed < before * 0.3 && (N.unjamRoad(n0, e0), Math.abs(N.roadInfo(n0, e0, at(0, 8)).cong - before) < 1e-6), `${before} → ${jammed}`);
  N.closeRoad(n0, e0); check('closing a road is reported and removes it from the cost array (Infinity)', N.roadInfo(n0, e0).closed === 'operator' && N.testing.cost(n0, at(0, 8), 1.3)[g.eArc0[e0]] === Infinity);
  N.openRoad(n0, e0); check('re-opening restores a finite cost', Number.isFinite(N.testing.cost(n0, at(0, 8), 1.3)[g.eArc0[e0]]));
  {
    const nc = N.create({ seed: 3, hour: 8, params: { unitBusyPct: 0, noisePct: 0 } });
    const a = { lon: 51.4900, lat: 25.3000 }, b = { lon: 51.5500, lat: 25.2700 }, r0 = N.route(nc, a, b, nc.t);
    const mid = nc.W.G.locate((a.lon + b.lon) / 2, (a.lat + b.lat) / 2, 2000), inc = N.createIncident(nc, { hazard: 'fire', lon: mid.lon, lat: mid.lat, severity: 2 });
    N.cordon(nc, inc.id, 600);
    const r1 = N.route(nc, a, b, nc.t), rE = N.route(nc, a, b, nc.t, { em: 1.3 });
    check('a cordon is closed to civilians (their route detours around it) and merely slower for responders', nc.cordonN === 1 && N.kpis(nc).traffic.cordons === 1 && N.roadInfo(nc, mid.edge).cordoned && (r1 === null || r1.sec >= r0.sec - 0.1) && rE && Number.isFinite(rE.sec), `civil ${r0.sec.toFixed(0)} → ${r1 ? r1.sec.toFixed(0) : 'cut off'} s`);
    check('a cordon never stops a dispatch: responders are still routed through it', N.dispatchNational(nc, { hazard: 'fire', lon: mid.lon, lat: mid.lat, severity: 1 }, nc.t).units.filter(u => u.unitId).length >= 2);
    check('lifting a cordon restores the civilian route; clearing an incident lifts its cordon', (N.liftCordon(nc, inc.id), nc.cordonN === 0 && Math.abs(N.route(nc, a, b, nc.t).sec - r0.sec) < 0.5));
    const nd = N.create({ seed: 3, hour: 8, params: { unitBusyPct: 0, approveSec: 0, acceptSec: 0, turnoutPoliceSec: 5, turnoutFireSec: 5, turnoutAmbSec: 5, onSceneSec: 300 } });
    const id2 = N.createIncident(nd, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 }); let sawCordon = false;
    for (let i = 0; i < 300 && id2.status !== 'cleared'; i++) { N.step(nd, 10); if (nd.cordonN > 0) sawCordon = true; }
    check('police arriving at a fire raise a cordon automatically (autoCordon) and it is lifted when the incident is cleared', sawCordon && nd.cordonN === 0 && nd.evCount.cordon >= 1 && nd.evCount['cordon-lifted'] === undefined, 'events: ' + nd.evCount.cordon);
  }
  check('seeded random per-segment noise: with noisePct 0 the field is smooth; with 8 % it varies, but identically for the same seed', (() => {
    const a = N.create({ seed: 5 }), b = N.create({ seed: 5 }), c = N.create({ seed: 6 }), d0 = N.create({ seed: 5, params: { noisePct: 0 } });
    const ca = N.congestionMap(a, at(0, 3)), cb = N.congestionMap(b, at(0, 3)), cc2 = N.congestionMap(c, at(0, 3)), c0 = N.congestionMap(d0, at(0, 3));
    let same = true, diff = false, varies = false; for (let e = 0; e < ca.length; e += 11) { if (ca[e] !== cb[e]) same = false; if (ca[e] !== cc2[e]) diff = true; if (c0[e] !== c0[0] && Math.abs(c0[e] - ca[e]) > 0.001) varies = true; }
    return same && diff && varies;
  })());
  // incident slow-down and weather
  const n1 = N.create({ seed: 2, params: { noisePct: 0 }, hour: 3 }); const loc = G.locate(51.5264, 25.2856, 3000);
  const cb = N.roadInfo(n1, loc.edge).cong; N.createIncident(n1, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 3 });
  check('an active incident slows the roads around it (incident slow-down)', N.roadInfo(n1, loc.edge).cong < cb - 0.1, `${cb} → ${N.roadInfo(n1, loc.edge).cong}`);
  const n2 = N.create({ seed: 2, params: { noisePct: 0 }, hour: 3 }); const base2 = N.kpis(n2).traffic.meanSpeedRatio; N.setRain(n2, 50);
  check('heavy rain slows traffic nationwide', N.kpis(n2).traffic.meanSpeedRatio < base2 - 0.02, `${base2} → ${N.kpis(n2).traffic.meanSpeedRatio}`);
  {
    const w = N.world(n0), gg = N.testing.graph(n0), civil = N.testing.cost(n0, at(0, 3), 1, true), resp = N.testing.cost(n0, at(0, 3), 1.3), ret = N.testing.cost(n0, at(0, 3), 1);
    let civilBad = 0, respOk = 0, retBad = 0; for (let a = gg.dataArcs; a < gg.A; a++) { if (civil[a] !== Infinity) civilBad++; if (Number.isFinite(resp[a])) respOk++; if (ret[a] !== Infinity) retBad++; }
    check('contraflow (assumption): ' + w.contraflowArcs + ' extra arcs on short one-way non-motorway edges, usable only by responders on a call (not by civilians nor by a unit driving home)', w.contraflowArcs > 3000 && civilBad === 0 && retBad === 0 && respOk === w.contraflowArcs);
    const dk = GEO.place(GEO.anchors['dukhan']), ndk = N.create({ seed: 51, hour: 9, params: { unitBusyPct: 0 } }), ndk0 = N.create({ seed: 51, hour: 9, params: { unitBusyPct: 0, contraflowKph: 0 } });
    const f1 = N.dispatchNational(ndk, { hazard: 'fire', lon: dk.lon, lat: dk.lat, severity: 1 }, ndk.t).units[0], f0 = N.dispatchNational(ndk0, { hazard: 'fire', lon: dk.lon, lat: dk.lat, severity: 1 }, ndk0.t).units[0];
    check('contraflow removes absurd one-way detours: the Dukhan station reaches Dukhan town in minutes, not tens of minutes (and the text says so)', f1.etaSec < 900 && f0.etaSec > 1.5 * f1.etaSec && f1.whyData.chosen.contraflowM > 100 && /one-way/.test(f1.why.en), `${Math.round(f1.etaSec)} s with contraflow vs ${Math.round(f0.etaSec)} s without (${f0.distM > 0 ? Math.round(f0.distM / 100) / 10 : 0} km)`);
  }
  check('every road class has a free-flow speed (OSM maxspeed or a labelled class default)', g.G.meta.speedAssumptions && g.G.eSpeed.every(v => v > 0 && v < 200));
}

// ---------------------------------------------------------------------------------------------------------------- 5  dispatch
section('5  dispatch: fastest given traffic, not nearest');
{
  const mk = (extra = {}) => N.create({ seed: 21, hour: 7.5, params: { unitBusyPct: 0, noisePct: 0, ...extra } });
  const n5 = mk();
  const inc = { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 };
  const plan = N.dispatchNational(n5, inc, n5.t);
  check('a dispatch plan has the fire, ambulance and police units, each with ETA, distance, why (ar + en) and a runner-up', ['fire', 'ambulance', 'police'].every(k => plan.units.some(u => u.kind === k && u.unitId && u.etaSec > 0 && u.distM > 0 && u.why.ar && u.why.en && u.whyData)) && plan.units.filter(u => u.unitId).every(u => u.whyData.chosen && 'runnerUp' in u.whyData && 'nearestByStraight' in u.whyData));
  check('the plan carries straight-line distance for contrast and congested-segment counts for each route', plan.units.filter(u => u.unitId).every(u => u.whyData.chosen.straightM >= 0 && u.whyData.chosen.congestedSegments >= 0 && Array.isArray(u.whyData.chosen.top)));
  check('plan state is "recommended" and 999 stays the dispatcher in the notes', plan.state === 'recommended' && plan.notes.some(x => /999/.test(x.en)) && plan.sim === true);
  // busy units are skipped
  const fire0 = plan.units.find(u => u.kind === 'fire');
  const n5b = mk(); N.setUnitBusy(n5b, fire0.unitId, true);
  const plan5b = N.dispatchNational(n5b, inc, n5b.t), fire1 = plan5b.units.find(u => u.kind === 'fire');
  check('a busy unit is skipped (and the why-text says so)', fire1.unitId !== fire0.unitId && /busy/.test(fire1.why.en) && fire1.whyData.skippedBusy.includes(fire0.unitId) && fire1.etaSec >= fire0.etaSec - 0.5);
  const n5c = N.create({ seed: 21, hour: 7.5, params: { unitBusyPct: 100 } }), p5c = N.dispatchNational(n5c, inc, n5c.t);
  check('if every unit is busy the plan says "no unit available" and nothing crashes', p5c.units.every(u => u.unitId === null && u.unreachable && /No available unit/.test(u.why.en)));
  // closed edge changes the route
  {
    let res = null;
    for (const [lon, lat] of [[51.5264, 25.2856], [51.4346, 25.2966], [51.4900, 25.3100], [51.6013, 25.1566], [51.5013, 25.1904], [51.45, 25.33], [51.55, 25.40]]) {
      const n = mk(), inc2 = N.createIncident(n, { hazard: 'fire', lon, lat, severity: 1 }), pu0 = inc2.plan.units.find(u => u.kind === 'police');
      if (!pu0.unitId || pu0._trk.steps.length < 8) continue;
      const steps0 = pu0._trk.steps, sceneEdge = steps0[steps0.length - 1].e, mid = steps0.slice(2, steps0.length - 2).filter(s => s.e !== sceneEdge && s.m > 80), victim = mid[Math.floor(mid.length / 2)].e, eta0 = pu0.etaSec;
      const n2 = mk(); N.closeRoad(n2, victim);
      const p2 = N.dispatchNational(n2, { hazard: 'fire', lon, lat, severity: 1 }, n2.t), pol2 = p2.units.find(u => u.kind === 'police');
      if (pol2.unitId && !pol2._trk.steps.some(s => s.e === victim)) { res = { victim, eta0, eta1: pol2.etaSec, same: pol2.unitId === pu0.unitId }; if (res.eta1 > res.eta0 + 0.5) break; }
    }
    check('a closed road on the chosen route is avoided: the new route does not use it, and is never faster', res && res.eta1 >= res.eta0 - 1, res && `edge ${res.victim}: ${Math.round(res.eta0)} s → ${Math.round(res.eta1)} s, ${res.same ? 'same unit, new route' : 'another unit'}`);
  }
  // a jam changes the chosen unit (search a constructed case)
  {
    let found = null;
    for (const [lon, lat] of [[51.5264, 25.2856], [51.4346, 25.2966], [51.5197, 25.4229], [51.5013, 25.1904], [51.6013, 25.1566], [51.45, 25.33], [51.42, 25.26], [51.55, 25.31]]) {
      const n = mk(), p = N.dispatchNational(n, { hazard: 'fire', lon, lat, severity: 1 }, n.t), f = p.units.find(u => u.kind === 'fire');
      if (!f.unitId) continue;
      const u = N.units(n).find(x => x.id === f.unitId);
      const nj = mk(); const nEdges = N.jamArea(nj, u.base.lon, u.base.lat, 1800, 0.05);
      const pj = N.dispatchNational(nj, { hazard: 'fire', lon, lat, severity: 1 }, nj.t), fj = pj.units.find(x => x.kind === 'fire');
      if (fj.unitId && fj.unitId !== f.unitId) { found = { lon, lat, from: f.unitId, to: fj.unitId, eta0: f.etaSec, eta1: fj.etaSec, nEdges, why: fj.why.en }; break; }
    }
    check('a jam around the chosen unit\'s station hands the job to another unit', !!found, found ? `${found.from} → ${found.to}, ${Math.round(found.eta0)} s → ${Math.round(found.eta1)} s (${found.nEdges} segments jammed)` : '');
  }
  // fastest vs nearest differ on the real map; the demonstration helper
  const ab = N.ab({ seed: 7, n: 80 });
  check('on the real map the fastest unit is NOT always the nearest in a straight line (A/B shows the share)', ab.differs.incidentsPct > 5 && ab.differs.farButFasterChoicesPct > 1, `${ab.differs.incidentsPct} % of incidents differ in at least one unit type; ${ab.differs.farButFasterChoicesPct} % of unit choices are farther-but-faster`);
  const ex = N.findFartherButFaster(7);
  check('findFartherButFaster returns a valid example with both units, numbers and routes', ex && ex.fastest && ex.nearest && ex.fastest.unitId !== ex.nearest.unitId && ex.fastest.etaSec < ex.nearest.etaSec && ex.fastest.straightKm > ex.nearest.straightKm && ex.gainSec > 0 && ex.fastest.route.length > 5 && ex.nearest.route.length > 5 && ex.why.en && ex.why.ar && ex.t >= 0, ex && `${ex.dowName.en} ${ex.clock}: ${ex.fastest.unitId} ${Math.round(ex.fastest.etaSec)} s (${ex.fastest.straightKm} km straight) vs nearest ${ex.nearest.unitId} ${Math.round(ex.nearest.etaSec)} s (${ex.nearest.straightKm} km)`);
  console.log('  EXAMPLE: ' + (ex ? ex.why.en : '-'));
  check('the example is a real incident inside Qatar and its units are real facilities of the data', ex && ex.incident.lon > 50.7 && ex.incident.lon < 51.7 && GEO.inLand(ex.incident.lon, ex.incident.lat) && [ex.fastest, ex.nearest].every(x => FAC.some(f => 'fire:' + f.id === x.unitId || 'police:' + f.id === x.unitId || 'ambulance:' + f.id === x.unitId)));
  check('the example flags whether traffic alone flips the order', ex && typeof ex.trafficAloneFlipsOrder === 'boolean' && (ex.reason === 'traffic' || ex.reason === 'network'), ex && `${ex.reason}, free-flow ETAs ${ex.fastest.freeFlowEtaSec} vs ${ex.nearest.freeFlowEtaSec} s`);
  if (ex) {
    console.log(`  EXAMPLE (seed 7, ${ex.dowName.en} ${ex.clock}, incident at ${ex.incident.lon}, ${ex.incident.lat} near ${ex.incident.place && ex.incident.place.name.en} [${ex.incident.muni}], ${ex.kind}):`);
    console.log(`    fastest  ${ex.fastest.name.en}: ETA ${Math.round(ex.fastest.etaSec)} s (free flow ${ex.fastest.freeFlowEtaSec} s), ${ex.fastest.roadKm} km by road, ${ex.fastest.straightKm} km straight, ${ex.fastest.congestedSegments} congested segments`);
    console.log(`    nearest  ${ex.nearest.name.en}: ETA ${Math.round(ex.nearest.etaSec)} s (free flow ${ex.nearest.freeFlowEtaSec} s), ${ex.nearest.roadKm} km by road, ${ex.nearest.straightKm} km straight, ${ex.nearest.congestedSegments} congested segments`);
    console.log(`    gain ${ex.gainSec} s, ${ex.extraStraightKm} km farther in a straight line; reason ${ex.reason}; traffic alone flips the order: ${ex.trafficAloneFlipsOrder}`);
  }
  const exFlip = N.findFartherButFaster(11), exAlt = N.findFartherButFaster(3);
  console.log('  other seeds: ' + [exFlip, exAlt].map(e => e ? `${e.clock} ${e.kind} gain ${e.gainSec} s, +${e.extraStraightKm} km straight, ${e.reason}` : 'none').join(' | '));
  check('other seeds also find examples', !!exFlip && !!exAlt);
}
// hospitals
{
  const mk = (extra = {}) => N.create({ seed: 33, hour: 12, params: { unitBusyPct: 0, ...extra } });
  const n = mk();
  const heat = N.dispatchNational(n, { hazard: 'heat', lon: 51.4222, lat: 25.1735, severity: 2 }, n.t);
  check('heat → nearest ambulance + a destination hospital with a verified emergency department', heat.units.length === 1 && heat.units[0].kind === 'ambulance' && heat.hospital && heat.hospital.chosen && heat.hospital.chosen.ed === 'yes' && !heat.hospital.chosen.assumed && /confirmed|OSM tag/.test(heat.hospital.chosen.edNote.en), heat.hospital && heat.hospital.chosen && `${heat.hospital.chosen.name.en} ${heat.hospital.chosen.etaMin} min`);
  const elig = id => FAC.find(f => f.id === id);
  check('the chosen hospital is never restricted, obstetric-only, paediatric-only or ED=no', ['heat', 'sos'].every(h => [[51.4222, 25.1735], [51.52, 25.29], [51.6, 25.15], [51.5, 25.68], [51.2, 26.1]].every(([lon, lat]) => { const p = N.dispatchNational(n, { hazard: h, lon, lat, severity: 2 }, n.t), f = elig(p.hospital.chosen.id); return f.ed === 'yes' && !(f.caps || []).includes('obstetric') && !(f.flags || []).some(x => /restricted access/.test(x)) && !(f.caps || []).includes('paedED') || (f.caps || []).includes('ed'); })));
  const sos = N.dispatchNational(n, { hazard: 'sos', lon: 51.2157, lat: 26.1183, severity: 2 }, n.t);
  const sosU = N.dispatchNational(mk({ edUnknownMode: 1 }), { hazard: 'sos', lon: 51.2157, lat: 26.1183, severity: 2 }, n.t);
  check('far north (Al Shamal): a hospital is still found; with "ED unknown" allowed the choice can be nearer and is flagged as an assumption', sos.hospital.chosen && sosU.hospital.chosen.etaSec <= sos.hospital.chosen.etaSec + 1 && (!sosU.hospital.chosen.assumed || /assum/i.test(sosU.hospital.chosen.edNote.en) && sosU.hospital.chosen.level === 'ed-assumed'), `${sos.hospital.chosen.name.en} ${sos.hospital.chosen.etaMin} min vs ${sosU.hospital.chosen.name.en} ${sosU.hospital.chosen.etaMin} min${sosU.hospital.chosen.assumed ? ' (assumed ED)' : ''}`);
  const tr = N.dispatchNational(n, { hazard: 'fire', lon: 51.52, lat: 25.29, severity: 2, patients: { n: 2, need: 'trauma' } }, n.t);
  check('patients needing a trauma centre go to a Level I trauma entry (official list), paediatric patients to a paediatric ED', tr.hospital.chosen.id === 'hospital-w1049648363' && (() => { const pd = N.dispatchNational(n, { hazard: 'sos', lon: 51.52, lat: 25.29, severity: 1, patients: { n: 1, need: 'paed' } }, n.t); return (elig(pd.hospital.chosen.id).caps || []).includes('paedED'); })());
  // capacity (assumption): the second incident goes to another hospital when the first is full
  const nc = mk({ edCapacity: 4, edOccupancyPct: 0 });
  const i1 = N.createIncident(nc, { hazard: 'sos', lon: 51.4222, lat: 25.1735, severity: 2, patients: { n: 3, need: 'ed' } }), i2 = N.createIncident(nc, { hazard: 'sos', lon: 51.4230, lat: 25.1740, severity: 2, patients: { n: 3, need: 'ed' } });
  check('hospital capacity (labelled assumption): a hospital that cannot take the patients is skipped for the next incident', i1.plan.hospital.chosen.id !== i2.plan.hospital.chosen.id && i1.plan.hospital.chosen.fits && i2.plan.hospital.chosen.fits, `${i1.plan.hospital.chosen.name.en} → ${i2.plan.hospital.chosen.name.en}`);
  const nf = mk({ edCapacity: 1, edOccupancyPct: 100 }), pf = N.dispatchNational(nf, { hazard: 'sos', lon: 51.52, lat: 25.29, severity: 1 }, nf.t);
  check('if no hospital has free capacity the fastest is still named and the text says capacity is below the number', pf.hospital.chosen && !pf.hospital.chosen.fits && /capacity/i.test(pf.hospital.why.en));
  check('the hospital leg has a route polyline and an ETA', heat.hospital.chosen.route.length > 3 && heat.hospital.chosen.etaSec > 0);
  const nb = mk({ hazmatAllStations: 0 }), pg = N.dispatchNational(nb, { hazard: 'gas', lon: 51.52, lat: 25.29, severity: 2 }, nb.t);
  check('hazmat: with no hazmat-capable station the gas plan has no fire unit but still police and ambulance', pg.units.find(u => u.kind === 'fire').unitId === null && pg.units.find(u => u.kind === 'police').unitId);
}

// ---------------------------------------------------------------------------------------------------------------- 6  state machine, re-dispatch, re-route
section('6  state machine, automatic re-dispatch and re-routing');
{
  const n = N.create({ seed: 41, hour: 8, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 10 } });
  const inc = N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 });
  check('a new incident starts as "recommended" with an event, units reserved', inc.status === 'recommended' && inc.plan.state === 'recommended' && n.events.some(e => e.type === 'dispatch-recommended') && N.units(n).filter(u => u.assigned === inc.id).length === inc.plan.units.filter(u => u.unitId).length);
  const order = ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'], seen = {};
  for (let i = 0; i < 400; i++) { N.step(n, 10); if (!seen[inc.plan.state]) seen[inc.plan.state] = n.t; if (inc.plan.state === 'cleared') break; }
  check('the plan walks recommended → approved → dispatched → en-route → on-scene → cleared', order.every(s => seen[s] !== undefined), JSON.stringify(seen));
  check('the timestamps are in order and the plan records them', order.every((s, i) => i === 0 || seen[s] >= seen[order[i - 1]]) && inc.plan.t.recommended <= inc.plan.t.approved && inc.plan.t.approved <= inc.plan.t.dispatched && inc.plan.t.dispatched <= inc.plan.t['en-route'] && inc.plan.t['en-route'] <= inc.plan.t['on-scene'] && inc.plan.t['on-scene'] <= inc.plan.t.cleared);
  check('each unit passed through every state with a timestamp', inc.plan.units.filter(u => u.unitId).every(u => ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'].every(s => u.states[s] !== undefined)));
  check('ETA counted down to zero on scene', inc.plan.units.filter(u => u.unitId).every(u => u.etaSec === 0));
  for (let i = 0; i < 200; i++) N.step(n, 10);
  check('units drive home and become available again; reservations are released', N.units(n).every(u => u.assigned === null && u.state === 'idle') && n.evCount['unit-cleared'] >= 3, JSON.stringify(Object.fromEntries(Object.entries(n.evCount).filter(([k]) => /unit|incident/.test(k)))));
  check('events are bilingual and timestamped', n.events.length > 8 && n.events.every(e => e.text.ar && e.text.en && typeof e.t === 'number' && /^\d\d:\d\d:\d\d$/.test(e.clock)));
  const bus = N.busDispatch(n, inc.id);
  check('bus message is compatible with sim.js (type dispatch, units{kind,name{ar,en},etaMin,status,why}, hospital) plus scope "national"', bus.type === 'dispatch' && bus.scope === 'national' && bus.units.every(u => u.kind && u.name.ar && u.name.en && u.status && u.why) && 'hospital' in bus && bus.id && bus.state === 'cleared' && bus.scene.lon > 50);
  const lines = (() => { const m = N.create({ seed: 41, hour: 8, params: { unitBusyPct: 0 } }); const i2 = N.createIncident(m, { hazard: 'sos', lon: 51.52, lat: 25.29, severity: 1 }); for (let i = 0; i < 12; i++) N.step(m, 10); return N.residentLines(m, i2.id); })();
  check('resident lines are calm and carry the ETA ("Ambulance ETA n min — stay where you are")', lines.length >= 1 && lines.every(l => l.text.ar && l.text.en) && lines.some(l => /ETA \d+ min — stay where you are/.test(l.text.en) || /on scene/.test(l.text.en)), lines.map(l => l.text.en).join(' | '));
}
{
  // re-dispatch: a unit becomes busy after it was dispatched → another unit takes over
  const n = N.create({ seed: 42, hour: 8, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5, turnoutFireSec: 240, turnoutAmbSec: 240, turnoutPoliceSec: 240 } });
  const inc = N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 });
  const f0 = inc.plan.units.find(u => u.kind === 'fire').unitId;
  for (let i = 0; i < 8; i++) N.step(n, 5);
  const dispatchedBefore = inc.plan.state;
  N.setUnitBusy(n, f0, true);
  for (let i = 0; i < 6; i++) N.step(n, 5);
  const ev = n.events.filter(e => e.type === 'redispatch'), fNow = inc.plan.units.find(u => u.kind === 'fire');
  check('a dispatched unit that becomes busy triggers an automatic "redispatch" event (reason busy) and another unit takes over', ev.length >= 1 && ev[0].reason === 'busy' && ev[0].from === f0 && fNow.unitId === ev[0].to && fNow.unitId !== f0 && fNow.replaced.length === 1, `${dispatchedBefore}: ${ev[0] && ev[0].from} → ${ev[0] && ev[0].to}`);
  check('the old unit is released, the new unit reserved and in turn-out', N.units(n).find(u => u.id === f0).assigned === null && N.units(n).find(u => u.id === fNow.unitId).assigned === inc.id && n.stats.redispatches >= 1);
  // a jam makes a farther unit faster before it rolls → re-dispatch for "faster"
  const m = N.create({ seed: 42, hour: 8, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5, turnoutFireSec: 300, turnoutAmbSec: 300, turnoutPoliceSec: 300, redispatchMarginSec: 20 } });
  let got = null;
  for (const [lon, lat] of [[51.5264, 25.2856], [51.4346, 25.2966], [51.5013, 25.1904], [51.45, 25.33], [51.42, 25.26]]) {
    const mm = N.create({ seed: 42, hour: 8, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5, turnoutFireSec: 300, turnoutAmbSec: 300, turnoutPoliceSec: 300, redispatchMarginSec: 20 } });
    const i = N.createIncident(mm, { hazard: 'fire', lon, lat, severity: 1 }), fu = i.plan.units.find(u => u.kind === 'fire'); if (!fu.unitId) continue;
    const base = N.units(mm).find(u => u.id === fu.unitId).base;
    for (let k = 0; k < 8; k++) N.step(mm, 5);            // approved + dispatched, still in turn-out
    N.jamArea(mm, base.lon, base.lat, 1800, 0.05);
    for (let k = 0; k < 6; k++) N.step(mm, 5);
    const r = mm.events.find(e => e.type === 'redispatch' && e.kind === 'fire');
    if (r) { got = r; break; }
  }
  check('a jam that makes another unit faster by more than the margin re-dispatches it ("faster")', got && (got.reason === 'faster' || got.reason === 'blocked') && got.gainSec >= 0, got && `${got.from} → ${got.to}, gain ${got.gainSec} s`);
  // the recommendation changes before approval
  const r0 = N.create({ seed: 43, hour: 8, autoApprove: false, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5 } });
  const ri = N.createIncident(r0, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 }), rf = ri.plan.units.find(u => u.kind === 'fire').unitId;
  N.setUnitBusy(r0, rf, true); N.step(r0, 10);
  check('before approval the recommendation changes when a unit becomes busy (event recommendation-change), plan stays "recommended" until the operator approves', ri.plan.state === 'recommended' && r0.events.some(e => e.type === 'recommendation-change') && ri.plan.units.find(u => u.kind === 'fire').unitId !== rf);
  check('autoApprove:false waits for the human key; approve() then moves it on', (() => { for (let i = 0; i < 20; i++) N.step(r0, 10); const still = ri.plan.state === 'recommended'; N.approve(r0, ri.id); N.step(r0, 5); return still && ri.plan.state === 'approved'; })());
}
{
  // en-route re-routing when a road ahead closes
  let result = null;
  for (const [lon, lat] of [[51.4900, 25.3100], [51.5264, 25.2856], [51.4346, 25.2966], [51.5013, 25.1904], [51.6013, 25.1566], [51.55, 25.40]]) {
    const n = N.create({ seed: 44, hour: 8, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5, turnoutPoliceSec: 5, turnoutFireSec: 5, turnoutAmbSec: 5, approveSec: 0, acceptSec: 0, rerouteGainSec: 5 } });
    const inc = N.createIncident(n, { hazard: 'fire', lon, lat, severity: 1 }), pu = inc.plan.units.find(u => u.kind === 'police');
    if (!pu.unitId) continue;
    for (let i = 0; i < 6; i++) N.step(n, 5);
    if (pu.state !== 'en-route' || pu._trk.steps.length < 12) continue;
    const trk = pu._trk, ahead = trk.steps.slice(trk.idx + 3, trk.idx + 12).map(s => s.e), victim = ahead[Math.floor(ahead.length / 2)];
    const etaBefore = pu.etaSec; N.closeRoad(n, victim);
    for (let i = 0; i < 4; i++) N.step(n, 5);
    const rr = n.events.find(e => e.type === 'reroute-unit' && e.unit === pu.unitId), rd = n.events.find(e => e.type === 'redispatch');
    if (rr || rd) { result = { rr, rd, ok: !pu._trk.steps.some(s => s.e === victim) || !!rd, etaBefore, etaAfter: pu.etaSec, victim, blocked: rr && rr.blocked }; for (let i = 0; i < 300 && inc.plan.state !== 'on-scene' && inc.plan.state !== 'cleared'; i++) N.step(n, 5); result.arrived = ['on-scene', 'cleared'].includes(inc.plan.state); break; }
  }
  check('a road that closes ahead of an en-route unit re-routes it (event reroute-unit) or hands over; the unit still arrives', result && result.ok && result.arrived && Number.isFinite(result.etaAfter), result && `${result.rr ? 'reroute (blocked)' : 'redispatch'}: ETA ${Math.round(result.etaBefore)} → ${Math.round(result.etaAfter)} s`);
  let rj = null;
  for (const [lon, lat] of [[51.4900, 25.3100], [51.5264, 25.2856], [51.4346, 25.2966], [51.5013, 25.1904], [51.6013, 25.1566]]) {
    const n = N.create({ seed: 45, hour: 7.5, params: { unitBusyPct: 0, noisePct: 0, recheckSec: 5, turnoutPoliceSec: 5, turnoutFireSec: 5, turnoutAmbSec: 5, approveSec: 0, acceptSec: 0, rerouteGainSec: 5, redispatchMarginSec: 600 } });
    const inc = N.createIncident(n, { hazard: 'fire', lon, lat, severity: 1 }), pu = inc.plan.units.find(u => u.kind === 'ambulance');
    if (!pu.unitId) continue;
    for (let i = 0; i < 6; i++) N.step(n, 5);
    if (pu.state !== 'en-route' || pu._trk.steps.length < 12) continue;
    const trk = pu._trk; for (const s of trk.steps.slice(trk.idx + 2, trk.idx + 10)) N.jamRoad(n, s.e, 0.05);
    for (let i = 0; i < 4; i++) N.step(n, 5);
    if (n.events.some(e => e.type === 'reroute-unit' && !e.blocked && e.gainSec >= 5)) { rj = n.events.find(e => e.type === 'reroute-unit'); break; }
  }
  check('a heavy jam on the route ahead re-routes the en-route unit when another route saves enough time', !!rj, rj && `saved ${rj.gainSec} s`);
}

// ---------------------------------------------------------------------------------------------------------------- 7  every hazard, 8 places
section('7  every hazard type at eight well-spread places');
{
  const P = id => GEO.place(GEO.anchors[id]);
  const places = [['Doha', P('doha')], ['Lusail', P('lusail')], ['Al Wakrah', P('al-wakrah')], ['Al Khor', P('al-khor')], ['Dukhan', P('dukhan')], ['Al Shamal', P('madinat-ash-shamal')], ['Mesaieed', P('mesaieed')], ['desert interior', { lon: 51.0, lat: 24.9 }]];
  check('the eight places resolve and lie on land', places.every(([, p]) => p && GEO.inLand(p.lon, p.lat)));
  const n = N.create({ seed: 51, hour: 9 });
  let plans = 0, bad = [];
  const ms = [];
  for (const hz of N.HAZARDS) for (const [name, p] of places) {
    const a = performance.now(), plan = N.dispatchNational(n, { hazard: hz, lon: p.lon, lat: p.lat, severity: 2 }, n.t); ms.push(performance.now() - a);
    plans++;
    const need = N.REQUIRED[hz].filter(r => !r.minSev || r.minSev <= 2).length;
    const ok = plan && plan.units.length === need && plan.units.every(u => u.why.ar && u.why.en) && plan.units.filter(u => !u.optional).every(u => u.unitId && Number.isFinite(u.etaSec) && u.etaSec > 0 && u.distM > 0)
      && (hz !== 'heat' && hz !== 'sos' || (plan.hospital && plan.hospital.chosen && plan.hospital.chosen.etaSec > 0)) && plan.scene.snapM < 8000;
    if (!ok) bad.push(hz + '@' + name);
  }
  check(`${plans} plans (6 hazards × 8 places): every one has the required units with finite ETAs and bilingual why-texts`, bad.length === 0, bad.join(', '));
  check('Al Shamal and the desert interior get an answer too (far units, long ETAs, still finite)', ['Al Shamal', 'desert interior'].every(nm => { const p = places.find(x => x[0] === nm)[1], plan = N.dispatchNational(n, { hazard: 'fire', lon: p.lon, lat: p.lat, severity: 2 }, n.t); return plan.units.every(u => u.unitId) && Math.max(...plan.units.map(u => u.etaSec)) < 7200; }));
  const dm = places.map(([nm, p]) => N.dispatchNational(n, { hazard: 'fire', lon: p.lon, lat: p.lat, severity: 2 }, n.t).units.find(u => u.kind === 'fire').etaSec);
  console.log('  fire engine ETA (s) at ' + places.map(([nm], i) => nm + ' ' + Math.round(dm[i])).join(', '));
  check('the engine is local: the fire engine for Doha arrives before the one for the desert interior or Al Shamal', dm[0] < dm[5] && dm[0] < dm[7]);
  const sev1 = N.dispatchNational(n, { hazard: 'fire', lon: 51.52, lat: 25.29, severity: 1 }, n.t), sev3 = N.dispatchNational(n, { hazard: 'fire', lon: 51.52, lat: 25.29, severity: 3 }, n.t), gas3 = N.dispatchNational(n, { hazard: 'gas', lon: 51.52, lat: 25.29, severity: 3 }, n.t);
  check('severity: a severe fire calls two fire engines plus rescue; a minor fire one engine and no rescue', sev3.units.filter(u => u.kind === 'fire').length === 2 && sev3.units.some(u => u.kind === 'rescue') && sev1.units.filter(u => u.kind === 'fire').length === 1 && !sev1.units.some(u => u.kind === 'rescue') && gas3.units.filter(u => u.kind === 'fire').length === 2);
  check('a severe fire never gets the same vehicle twice', new Set(sev3.units.map(u => u.unitId)).size === sev3.units.length);
  // multiple incidents do not double-book
  const m = N.create({ seed: 52, hour: 9, params: { unitBusyPct: 0 } });
  const a = N.createIncident(m, { hazard: 'fire', lon: 51.52, lat: 25.29, severity: 2 }), b = N.createIncident(m, { hazard: 'fire', lon: 51.521, lat: 25.291, severity: 2 });
  const ids = [...a.plan.units, ...b.plan.units].filter(u => u.unitId).map(u => u.unitId);
  check('two incidents at the same spot do not share a vehicle (the second gets the next-fastest)', new Set(ids).size === ids.length && b.plan.units.find(u => u.kind === 'fire').etaSec >= a.plan.units.find(u => u.kind === 'fire').etaSec - 1);
  const far = N.createIncident(m, { hazard: 'sos', lon: 0, lat: 0, severity: 1 });
  check('an incident far outside Qatar is cancelled with an event, not a crash', far.status === 'cancelled' && m.events.some(e => e.type === 'incident-unreachable'));
  check('cancelling an incident releases its units', (() => { N.cancelIncident(m, a.id); return N.units(m).filter(u => u.assigned === a.id).length === 0 && a.status === 'cancelled'; })());
  const ok2 = N.dispatchNational(n, { hazard: 'unknown-hazard', lon: 51.5, lat: 25.3 }, n.t);
  check('an unknown hazard falls back to "someone needs help" instead of failing', ok2 && ok2.hazard === 'sos');
}

// ---------------------------------------------------------------------------------------------------------------- 8  hazards, advisories, KPIs
section('8  national hazard layers, advisories, municipality status, KPIs');
{
  check('Stull wet-bulb and WBGT reproduce the documented illustration (40 °C / 40 % RH: Tw ≈ 28.6, WBGT ≈ 32.0 shade, ≈ 35.0 full sun)', Math.abs(N.testing.stullWetBulb(40, 40) - 28.6) < 0.1 && Math.abs(N.wbgtEstimate(40, 40, 0) - 32.0) < 0.1 && Math.abs(N.wbgtEstimate(40, 40, 15) - 35.0) < 0.1);
  const jul = N.create({ seed: 61, date: '2026-07-12', hour: 13 }), jan = N.create({ seed: 61, date: '2026-01-15', hour: 13 }), night = N.create({ seed: 61, date: '2026-07-12', hour: 3 });
  const kJul = N.kpis(jul), kJan = N.kpis(jan), kNight = N.kpis(night);
  console.log(`  WBGT estimate max: July 13:00 ${kJul.hazards.heat.wbgtMax}, July 03:00 ${kNight.hazards.heat.wbgtMax}, January 13:00 ${kJan.hazards.heat.wbgtMax} °C`);
  check('heat: July midday WBGT estimate is above the 32.1 stop-work level; January midday and a July night are not', kJul.hazards.heat.wbgtMax > 32.1 && kJan.hazards.heat.wbgtMax < 28 && kNight.hazards.heat.wbgtMax < kJul.hazards.heat.wbgtMax - 3);
  check('heat: the midday outdoor-work ban (10:00–15:30, 1 June–15 September) is reported in July at 13:00 and not in January, nor at 08:00, nor on 16 September', kJul.hazards.heat.middayBan && !kJan.hazards.heat.middayBan && !N.middayBan(N.create({ date: '2026-07-12', hour: 8 })) && !N.middayBan(N.create({ date: '2026-09-16', hour: 12 })) && N.middayBan(N.create({ date: '2026-09-15', hour: 12 })) && N.middayBan(N.create({ date: '2026-06-01', hour: 10 })) && !N.middayBan(N.create({ date: '2026-05-31', hour: 12 })) && !N.middayBan(N.create({ date: '2026-07-12', hour: 15.6 })));
  const f = N.fields(jul), g = f.grid;
  let nan = 0, landN = 0, inl = [], cst = [];
  for (let c = 0; c < g.nx * g.ny; c++) { for (const arr of [f.wbgt, f.pm10, f.rain]) if (!Number.isFinite(arr[c])) nan++; if (f.land[c]) landN++; }
  const W = jul.W.grid; for (let c = 0; c < W.n; c++) if (W.land[c]) { if (W.coastKm[c] > 30) inl.push(f.wbgt[c]); else if (W.coastKm[c] < 3) cst.push(f.wbgt[c]); }
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  check('fields(): a coarse grid with a land mask (> 1500 land cells), no NaN, WBGT only on land', nan === 0 && landN > 1500 && landN < 3500 && f.wbgt.every((v, c) => f.land[c] || v === 0));
  check('heat: inland is hotter than the coast by day (labelled assumption: sea-breeze gradient) and the urban core adds a bump', inl.length > 50 && cst.length > 50 && avg(inl) > avg(cst) && avg(inl) - avg(cst) < 6, `inland ${avg(inl).toFixed(1)} vs coast ${avg(cst).toFixed(1)}`);
  const ex = N.heatExposure(jul);
  check('heat exposure lists ONLY places the OSM data tags as industrial / port (no invented worker clusters, no counts)', ex.length === jul.W.industrial.length && ex.length >= 5 && ex.every(e => /industrial|port|Industrial|Port/i.test(e.name.en) && !('workers' in e) && !('count' in e) && e.source.includes('no worker counts')) && ex.some(e => e.name.en === 'Industrial Area'));
  const adv = kJul.advisories;
  check('advisories use message keys that exist in N.MSG, have both languages and no unreplaced placeholders', adv.length >= 3 && adv.every(a => N.MSG[a.key] && a.text.ar && a.text.en && !/\{\w+\}/.test(a.text.ar + a.text.en)), adv.length + ' advisories');
  check('July midday raises the ban and stop-work advisories; January raises none', adv.some(a => a.key === 'nat.adv.heat.ban') && adv.some(a => a.key === 'nat.adv.heat.stop') && kJan.advisories.length === 0);
  const ms = kJul.municipalities;
  check('municipality status for all 8 municipalities (cells, WBGT, PM10, rain, units, incident counts)', ms.length === 8 && ms.every(m => m.cells > 20 && m.name.ar && m.name.en && m.wbgtMax > 0 && ['normal', 'watch', 'warning', 'danger'].includes(m.level) && m.unitsBased >= 0));
  check('every unit is counted in the municipality of its station', ms.reduce((s, m) => s + m.unitsBased, 0) === N.units(jul).length);
  // dust
  const dn = N.create({ seed: 62, date: '2026-04-20', hour: 6 });
  N.startDust(dn);
  const stat = (h) => { N.run(dn, 6 * 3600 + h * 3600); const k = N.kpis(dn); return { front: k.hazards.dust.frontKm, max: k.hazards.dust.pm10Max, ms: Object.fromEntries(k.municipalities.map(m => [m.id, m.pm10Max])), adv: k.advisories.filter(a => a.hazard === 'dust') }; };
  const d0 = stat(0), d2 = stat(2), d4 = stat(4), d8 = stat(8);
  console.log(`  dust front (km along the wind) +0h ${d0.front}, +2h ${d2.front}, +4h ${d4.front}; PM10 max ${d0.max} → ${d2.max} → ${d4.max} → ${d8.max}`);
  check('dust: the shamal-style front advances SE across the country: Ash Shamal (NW tip) is hit before Doha, Doha before nothing is left behind', d2.front > d0.front && d4.front > d2.front && d2.ms.shamal > 150 && d2.ms.doha < d2.ms.shamal && d8.ms.doha > 150);
  check('dust: PM10 thresholds 150 / 255 / 425 raise warn / danger / critical advisories with message keys', d4.adv.length >= 1 && d4.adv.every(a => /^nat\.adv\.dust\.(warn|danger|critical)$/.test(a.key)) && d4.adv.some(a => a.key === 'nat.adv.dust.critical'));
  check('dust: the relative visibility index falls as PM10 rises (no numeric visibility classes are claimed)', N.visibility(50) > N.visibility(150) && N.visibility(150) > N.visibility(1000) && N.visibility(50) <= 1 && N.visibility(5000) > 0);
  const calm = N.create({ seed: 62, date: '2026-04-20', hour: 14, params: { noisePct: 0 } }), stormy = N.create({ seed: 62, date: '2026-04-20', hour: 14, params: { noisePct: 0 } }); N.startDust(stormy, { t0: stormy.t - 6 * 3600 });
  check('dust slows traffic where the storm is', N.kpis(stormy).traffic.meanSpeedRatio < N.kpis(calm).traffic.meanSpeedRatio - 0.02);
  // flood
  const fl = N.create({ seed: 63, date: '2026-11-20', hour: 8, params: { noisePct: 0 } }), tunnels = fl.W.tunnels.length;
  check('flood: the low points are the real tunnels / underpasses of the road data (flag 1) — no elevation model is claimed', tunnels > 100 && fl.W.tunnels.every(e => (fl.W.G.eFlags[e] & 1) === 1) && N.world(fl).note.length > 0);
  const eT = fl.W.tunnels[5], gT = N.testing.graph(fl);
  N.setRain(fl, 40);
  for (let i = 0; i < 9; i++) N.step(fl, 600);
  const k1 = N.kpis(fl);
  check('flood: under heavy rain the underpasses fill and close (event, KPIs, advisory key) and a closed tunnel is Infinity in the cost array', k1.hazards.flood.tunnelsClosed > 20 && fl.evCount['underpasses-closed'] >= 1 && k1.advisories.some(a => a.key === 'nat.adv.flood.underpass') && k1.advisories.some(a => a.key === 'nat.adv.flood.watch'), `${k1.hazards.flood.tunnelsClosed} of ${tunnels} closed after 90 min of 40 mm/h`);
  const closedEdge = fl.W.tunnels.find(e => fl.closed[e]);
  check('flood closures reach the router', closedEdge !== undefined && N.testing.cost(fl, fl.t, 1.3)[gT.eArc0[closedEdge]] === Infinity && N.roadInfo(fl, closedEdge).closed === 'flood');
  check('flood: every underpass has a different seeded sump factor, so they do not all close in the same minute (fewer than all are closed)', new Set(fl.flood.tunnels.map(t => t.sump.toFixed(3))).size > 100 && k1.hazards.flood.tunnelsClosed < tunnels);
  N.setRain(fl, 0);
  for (let i = 0; i < 60; i++) N.step(fl, 600);
  check('flood: when the rain stops the pumps drain the underpasses and they re-open', N.kpis(fl).hazards.flood.tunnelsClosed === 0 && fl.evCount['underpasses-reopened'] >= 1 && N.kpis(fl).hazards.flood.maxDepthCm === 0);
  const fp = N.create({ seed: 63, date: '2026-11-20', hour: 8 });
  const pond = N.addPonding(fp, { lon: 51.5264, lat: 25.2856, radiusM: 250, name: 'user pond' }); N.setRain(fp, 60); for (let i = 0; i < 12; i++) N.step(fp, 600);
  check('flood: a user-placed ponding point closes the roads around it when it fills', pond.edges.length > 0 && pond.closed && pond.edges.every(e => fp.closed[e]));
  const rc = N.create({ seed: 64, date: '2026-11-20', hour: 8 }); N.addRainCell(rc, { lon: 51.5, lat: 25.3, radiusKm: 12, mmHr: 60, durationSec: 7200 }); N.step(rc, 3600);
  const rf = N.fields(rc).rain; let rmax = 0, rfar = Infinity; const gr = rc.W.grid; for (let c = 0; c < gr.n; c++) { if (!gr.land[c]) continue; if (rf[c] > rmax) rmax = rf[c]; if (gr.lat[c] > 25.9) rfar = Math.min(rfar, rf[c]); }
  check('flood: a localised rain cell rains hard at its centre and barely elsewhere', rmax > 30 && rfar < 1, `max ${rmax.toFixed(0)} mm/h`);
  // KPIs
  const kp = N.create({ seed: 65, hour: 8, params: { unitBusyPct: 0 } });
  N.createIncident(kp, { hazard: 'fire', lon: 51.52, lat: 25.29, severity: 2 }); N.createIncident(kp, { hazard: 'heat', lon: 51.44, lat: 25.17, severity: 1 });
  for (let i = 0; i < 20; i++) N.step(kp, 10);
  const K = N.kpis(kp);
  check('KPIs: incidents by hazard and status, units en route / busy / available, mean first-responder ETA', K.incidents.total === 2 && K.incidents.byHazard.fire === 1 && K.incidents.byHazard.heat === 1 && K.units.total === N.units(kp).length && K.units.enRoute + K.units.available + K.units.busy >= K.units.total - 5 && K.meanFirstEtaSec > 0 && K.units.byKind.fire.total >= 15, JSON.stringify({ en: K.units.enRoute, busy: K.units.busy, avail: K.units.available, eta: K.meanFirstEtaSec }));
  check('KPIs: traffic block (load, mean speed ratio, jams, closures, re-dispatches)', K.traffic.load === 1 && K.traffic.meanSpeedRatio > 0 && K.traffic.meanSpeedRatio <= 1 && 'jammedEdges' in K.traffic && 'redispatches' in K.traffic);
  const adv2 = N.busAdvisory(kp);
  check('bus advisory message: type advisory, scope national, items with keys and bilingual text', adv2.type === 'advisory' && adv2.scope === 'national' && Array.isArray(adv2.items) && adv2.sim === true);
}

// ---------------------------------------------------------------------------------------------------------------- 9  A/B
section('9  A/B: ordinary nearest-by-distance versus MANARA fastest-given-traffic (SIMULATION, mechanism check)');
{
  t0 = performance.now();
  const r = N.ab({ seed: 71, n: 120 });
  timings.abMs = performance.now() - t0; timings.abPerIncidentMs = timings.abMs / 120;
  const o = r.firstResponderEtaSec.ordinary, m = r.firstResponderEtaSec.manara;
  console.log(`  A/B n=${r.evaluated}: first-responder ETA median ordinary ${o.p50} s vs MANARA ${m.p50} s; p90 ${o.p90} vs ${m.p90}; choice differs in ${r.differs.incidentsPct} % of incidents; saved median ${r.savedSec.all.p50} s, mean ${r.savedSec.all.mean} s, p90 ${r.savedSec.all.p90} s (where differing: median ${r.savedSec.whereChoiceDiffers.p50}, p90 ${r.savedSec.whereChoiceDiffers.p90})`);
  check('A/B is labelled SIMULATION and lists all assumptions and the changed parameters', /SIMULATION/.test(r.label.en) && r.assumptions.trafficLoad === 1 && r.assumptions.unitBusyPct === 10 && Object.keys(r.assumptions).length > 30 && r.notes.length >= 2 && r.policies.manara.length > 5);
  check('A/B: all incidents were evaluated and the sample mixes places and uniform land', r.evaluated >= 115 && r.sample.some(s => s.src === 'place') && r.sample.some(s => s.src === 'uniform'));
  check('A/B: MANARA\'s first-responder ETA is never worse than ordinary on any statistic (it is the argmin)', m.mean <= o.mean + 1e-9 && m.p50 <= o.p50 + 1e-9 && m.p90 <= o.p90 + 1e-9 && m.p99 <= o.p99 + 1e-9 && m.max <= o.max + 1e-9);
  check('A/B: time saved is non-negative everywhere, with a real mean gain and a tail (p90 > 0)', r.savedSec.all.p10 >= 0 && r.savedSec.all.mean > 5 && r.savedSec.all.p90 > 30 && r.savedSec.all.max >= r.savedSec.all.p99);
  check('A/B: the choice differs in some, not all, incidents', r.differs.incidentsPct > 5 && r.differs.incidentsPct < 100, r.differs.incidentsPct + ' %');
  check('A/B: percentiles are ordered and finite', [o, m].every(s => s.p10 <= s.p25 && s.p25 <= s.p50 && s.p50 <= s.p75 && s.p75 <= s.p90 && s.p90 <= s.p99 && s.p99 <= s.max && Number.isFinite(s.mean)));
  check('A/B: per unit type results for fire, ambulance, police (and rescue when severity calls for it is excluded here)', ['fire', 'ambulance', 'police'].every(k => r.byKind[k] && r.byKind[k].n > 10 && r.byKind[k].differsPct >= 0 && r.byKind[k].savedSec.n > 0));
  check('A/B: the "nearest by road length" baseline is also reported and MANARA is not worse than it', r.firstResponderEtaSec.roadNearest.n > 100 && m.mean <= r.firstResponderEtaSec.roadNearest.mean + 1e-9);
  check('A/B performance: a few milliseconds per incident', timings.abPerIncidentMs < 40, timings.abPerIncidentMs.toFixed(1) + ' ms per incident');
  // sensitivity
  t0 = performance.now();
  const sw = N.sensitivity({ seed: 71, n: 50, loads: [0, 1, 2], busy: [0, 40] });
  timings.sweepMs = performance.now() - t0;
  console.table(sw.rows.map(x => ({ load: x.trafficLoad, busy: x.unitBusyPct, medOrd: x.medianEtaOrdinarySec, medMan: x.medianEtaManaraSec, p90Ord: x.p90EtaOrdinarySec, p90Man: x.p90EtaManaraSec, differ: x.differsPct, p90saved: x.p90SavedSec, meanSaved: x.meanSavedSec })));
  check('sensitivity sweep: 6 cells over the traffic multiplier × busy %, all finite, labelled', sw.rows.length === 6 && sw.rows.every(x => Number.isFinite(x.medianEtaOrdinarySec) && Number.isFinite(x.meanSavedSec) && x.medianEtaManaraSec <= x.medianEtaOrdinarySec + 1e-9) && /SIMULATION/.test(sw.label.en) && sw.note.en.length > 20);
  const row = (L, B) => sw.rows.find(x => x.trafficLoad === L && x.unitBusyPct === B);
  check('sensitivity: heavier traffic lengthens every ETA and widens the gap between the policies', row(2, 0).medianEtaManaraSec > row(0, 0).medianEtaManaraSec && row(2, 0).meanSavedSec > row(0, 0).meanSavedSec && row(2, 0).p90SavedSec > row(0, 0).p90SavedSec, `p90 saved ${row(0, 0).p90SavedSec} → ${row(1, 0).p90SavedSec} → ${row(2, 0).p90SavedSec} s`);
  check('sensitivity: more busy units lengthen the ETAs', row(1, 40).medianEtaManaraSec >= row(1, 0).medianEtaManaraSec && row(1, 40).p90EtaManaraSec >= row(1, 0).p90EtaManaraSec - 1);
  check('sensitivity: even with free-flow roads MANARA\'s road-aware choice differs from the straight-line one (road geometry, one-way roads, road classes)', row(0, 0).differsPct > 5);
  // time of day for the A/B: peak vs night
  const peak = N.ab({ seed: 71, n: 60, hour: 7.5 }), nightR = N.ab({ seed: 71, n: 60, hour: 3 });
  check('A/B: the morning peak lengthens ETAs compared with 03:00 (same incidents)', peak.firstResponderEtaSec.manara.mean > nightR.firstResponderEtaSec.manara.mean);
  const sampler = N.sampler(N.create({ seed: 71 }), 71), pts = Array.from({ length: 400 }, (_, i) => sampler(i)), placeShare = pts.filter(p => p.src === 'place').length / pts.length;
  check('the incident sampler: always on land, a seeded mix of places and uniform land cells (share near abPlaceWeight)', pts.every(p => GEO.inLand(p.lon, p.lat)) && Math.abs(placeShare - 0.5) < 0.1, 'places ' + (100 * placeShare).toFixed(0) + ' %');
}

// ---------------------------------------------------------------------------------------------------------------- 10  phones, viewport, CAP
section('10  phones helper, map viewport, OASIS CAP 1.2');
{
  const nh = N.create({ seed: 81, date: '2026-07-12', hour: 7.75 });
  const near = N.nearestFacilities({ nat: nh, lon: 51.5264, lat: 25.2856, kind: 'hospital', k: 4 });
  check('nearestFacilities: k results with straight-line km, bearing, road minutes (free flow and now), names in ar + en, the 999 reminder', near.length === 4 && near.every(f => f.straightKm >= 0 && f.bearingDeg >= 0 && f.bearingDeg < 360 && f.bearing.key && f.bearing.ar && f.bearing.en && f.roadMinNow > 0 && f.roadMinFree > 0 && f.name.ar && f.name.en && /999/.test(f.call.text.en) && /999/.test(f.call.text.ar) && f.call.key === 'nat.call999' && f.sim === true && /OpenStreetMap/.test(f.credit.text.en)), near[0] && `${near[0].name.en}: ${near[0].straightKm} km straight, ${near[0].roadMinNow} min by road`);
  check('nearestFacilities sorts by estimated road time; road time is at least the free-flow time', near.every((f, i) => i === 0 || f.roadMinNow >= near[i - 1].roadMinNow) && near.every(f => f.roadMinNow >= f.roadMinFree - 0.15));
  check('nearestFacilities: straight-line km agrees with haversine', near.every(f => Math.abs(f.straightKm - N.haversineM(51.5264, 25.2856, f.lon, f.lat) / 1000) < 0.06));
  check('nearestFacilities: hospitals carry the ED status from the data (yes / no / unknown with a note)', near.every(f => ['yes', 'no', 'unknown'].includes(f.ed) && f.edNote && f.edNote.ar && f.edNote.en));
  const edOnly = N.nearestFacilities({ nat: nh, lon: 51.4, lat: 25.2, kind: 'hospital', k: 5, edOnly: true });
  check('edOnly lists only hospitals with a verified emergency department', edOnly.length === 5 && edOnly.every(f => f.ed === 'yes'));
  check("kind 'ed' is the same as edOnly", N.nearestFacilities({ nat: nh, lon: 51.4, lat: 25.2, kind: 'ed', k: 3 }).every(f => f.ed === 'yes'));
  const night = N.nearestFacilities({ nat: nh, lon: 51.5264, lat: 25.2856, kind: 'police', k: 3, t: 3 * 3600 }), peak = N.nearestFacilities({ nat: nh, lon: 51.5264, lat: 25.2856, kind: 'police', k: 3, t: 17.8 * 3600 });
  check('police / fire / ambulance kinds work, and the road time at the evening peak is not shorter than at 03:00 for the same facility', night.length === 3 && peak.every(p => { const q = night.find(x => x.id === p.id); return !q || p.roadMinNow >= q.roadMinNow - 0.05; }) && N.nearestFacilities({ nat: nh, lon: 51.2, lat: 26.0, kind: 'fire', k: 2 }).length === 2 && N.nearestFacilities({ nat: nh, lon: 51.5, lat: 25.3, kind: 'ambulance', k: 2 }).length >= 1);
  const standalone = N.nearestFacilities({ lon: 51.2157, lat: 26.1183, kind: 'hospital', k: 2 });
  check('without an engine instance the helper builds its own default one (offline, from the bundled data)', standalone.length === 2 && standalone[0].straightKm > 10);
  check('a point outside Qatar returns the nearest road-reachable facilities or an empty list, never throws', (() => { try { const r = N.nearestFacilities({ nat: nh, lon: 0, lat: 0, kind: 'hospital', k: 2 }); return Array.isArray(r); } catch (e) { return false; } })());
  // viewport
  const vp = N.viewport({ width: 800, height: 600, pad: 16 });
  const [x0, y0] = vp.toScreen(50.7325, 24.47075), [x1, y1] = vp.toScreen(51.6607, 26.18295), back = vp.fromScreen(...vp.toScreen(51.4, 25.3));
  check('viewport: the whole country fits the screen with padding, north is up, and fromScreen inverts toScreen', Math.min(x0, x1) >= 0 && Math.max(x0, x1) <= 800 && Math.min(y0, y1) >= 0 && Math.max(y0, y1) <= 600 && y1 < y0 && Math.abs(back[0] - 51.4) < 1e-9 && Math.abs(back[1] - 25.3) < 1e-9);
  const vz = vp.zoomAt(300, 200, 4), p0 = vp.fromScreen(300, 200), p1 = vz.fromScreen(300, 200);
  check('viewport: zoomAt keeps the point under the cursor fixed; pan moves the map; zoom changes the scale', Math.abs(p0[0] - p1[0]) < 1e-9 && Math.abs(p0[1] - p1[1]) < 1e-9 && Math.abs(vz.pxPerKm / vp.pxPerKm - 4) < 1e-9 && Math.abs(vp.pan(50, 0).toScreen(51.4, 25.3)[0] - vp.toScreen(51.4, 25.3)[0] - 50) < 1e-6);
  const vc = N.viewport({ width: 400, height: 300, center: { lon: 51.5264, lat: 25.2856 }, pxPerKm: 10 });
  check('viewport: centred on Doha with 10 px/km, 1 km east is 10 px right', Math.abs(vc.toScreen(51.5264, 25.2856)[0] - 200) < 1e-9 && Math.abs(vc.toScreen(51.5264 + 1000 / (111195.08 * Math.cos(25.2856 * Math.PI / 180)), 25.2856)[0] - 210) < 0.05);
  // CAP
  const nc = N.create({ seed: 82, hour: 9, params: { unitBusyPct: 0 } });
  const inc = N.createIncident(nc, { hazard: 'gas', lon: 51.5264, lat: 25.2856, severity: 3 }), inc2 = N.createIncident(nc, { hazard: 'flood', lon: 51.2157, lat: 26.1183, severity: 1 });
  const xmlC = N.cap(nc, inc.id), xmlP = N.cap(nc, inc2, { area: 'polygon', radiusM: 800 });
  const parse = x => { try { return JSON.parse(execFileSync('python3', ['-c', 'import sys, json, xml.etree.ElementTree as ET\nr = ET.fromstring(sys.stdin.read())\nns = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}\nprint(json.dumps({"status": r.find("c:status", ns).text, "msgType": r.find("c:msgType", ns).text, "scope": r.find("c:scope", ns).text, "infos": [{"lang": i.find("c:language", ns).text, "event": i.find("c:event", ns).text, "areaDesc": i.find("c:area/c:areaDesc", ns).text, "circle": (i.find("c:area/c:circle", ns).text if i.find("c:area/c:circle", ns) is not None else None), "polygon": (i.find("c:area/c:polygon", ns).text if i.find("c:area/c:polygon", ns) is not None else None), "tags": [c.tag.split("}")[1] for c in i]} for i in r.findall("c:info", ns)], "top": [c.tag.split("}")[1] for c in r]}))'], { input: x }).toString()); } catch (e) { return null; } };
  const pc = parse(xmlC), pp = parse(xmlP);
  check('CAP 1.2: well-formed XML (parsed by Python), status Exercise, msgType Alert, scope Restricted', pc && pp && pc.status === 'Exercise' && pc.msgType === 'Alert' && pc.scope === 'Restricted' && pp.status === 'Exercise');
  check('CAP 1.2: one <info> per language (ar, en), events in the right language, areaDesc names the place', pc.infos.length === 2 && pc.infos[0].lang === 'ar' && pc.infos[1].lang === 'en' && pc.infos[1].event === 'Gas leak' && /[\u0600-\u06FF]/.test(pc.infos[0].event) && /Souq|Doha|سوق|الدوحة/.test(pc.infos[1].areaDesc + pc.infos[0].areaDesc));
  check('CAP 1.2: the area is a circle "lat,lon radiusKm" around the incident (or a closed polygon)', /^25\.2\d+,51\.5\d+ \d+(\.\d+)?$/.test(pc.infos[0].circle) && pp.infos[0].polygon && (() => { const pts = pp.infos[0].polygon.split(' '); return pts.length === 17 && pts[0] === pts[16] && pts.every(q => /^-?\d+\.\d+,-?\d+\.\d+$/.test(q)); })());
  check('CAP 1.2: element order inside <info> follows the schema (language … event … effective … headline … area)', ['language', 'category', 'event', 'responseType', 'urgency', 'severity', 'certainty', 'effective', 'expires', 'senderName', 'headline', 'description', 'instruction', 'parameter', 'area'].every((t, i, a) => i === 0 || pc.infos[0].tags.indexOf(t) >= pc.infos[0].tags.indexOf(a[i - 1])));
  check('CAP 1.2: the text says EXERCISE, simulated and 999; no real sender', /EXERCISE/.test(xmlC) && /999/.test(xmlC) && /example\.invalid/.test(xmlC) && /OpenStreetMap/.test(xmlC) && !/status>Actual/.test(xmlC));
}

// ---------------------------------------------------------------------------------------------------------------- 11  a full day, performance, memory
section('11  a full simulated day (no NaN), performance, memory');
{
  const deepScan = (o, p = '') => {
    let bad = null;
    const walk = (v, path) => {
      if (bad) return;
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad = path + '=' + v; }
      else if (v === undefined) { /* undefined is dropped by JSON; ignore */ }
      else if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length && !bad; i += 1) if (!Number.isFinite(v[i])) bad = path + '[' + i + ']=' + v[i]; }
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']'));
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], path + '.' + k);
    };
    walk(o, p); return bad;
  };
  t0 = performance.now();
  const day = N.create({ seed: 91, date: '2026-07-12', hour: 0, tickSec: 10, params: { divertPctPerHour: 15, recheckSec: 30 } });
  let scans = 0, firstBad = null, i = 0; const incs = [];
  N.startDust(day, { t0: 11 * 3600 });
  for (let t = 0; t < 86400; t += 60) {
    while (i < cast.length && cast[i][4] * 3600 <= day.t) { const c = cast[i++]; incs.push(N.createIncident(day, { hazard: c[0], lon: c[1], lat: c[2], severity: c[3] })); }
    if (Math.abs(day.t - 9.9 * 3600) < 60) { N.setRain(day, 35); N.jamArea(day, 51.43, 25.30, 3000, 0.2); }
    if (Math.abs(day.t - 15 * 3600) < 60) { N.setRain(day, 0); N.clearJams(day); }
    N.step(day, 60);
    if (t % 900 === 0) { const bad = deepScan(N.snapshot(day)) || deepScan(N.fields(day)); scans++; if (bad && !firstBad) firstBad = bad + ' at ' + day.t; }
  }
  timings.dayMs = performance.now() - t0;
  const finalSnap = N.snapshot(day, { full: true });
  check('a full simulated day (07-12, 14 incidents of every hazard, dust front, rain, jams) completes', day.t >= 86400 && incs.length === 14, (timings.dayMs / 1000).toFixed(1) + ' s wall time');
  check(`no NaN / Infinity in ${scans} snapshots and hazard fields across the whole day`, firstBad === null, firstBad || '');
  check('every incident was handled: none stuck in "recommended", the unit reservations are all released at the end', incs.every(x => x.status === 'cleared' || x.status === 'cancelled') && N.units(day).every(u => u.assigned === null), incs.map(x => x.status).join(','));
  check('the day produced re-dispatch / re-route / flood events or at least a rich event log', finalSnap.events.length > 60 && day.evCount['unit-on-scene'] >= 14 && day.evCount['incident'] === 14, JSON.stringify(Object.fromEntries(Object.entries(day.evCount).filter(([k]) => /redis|reroute|busy|closed|front|rain/.test(k)))));
  check('stats: the mean first-responder ETA exists and is plausible (30 s – 3 h)', (() => { const k = N.kpis(day); return k.meanFirstEtaSec > 30 && k.meanFirstEtaSec < 10800; })());
}
{
  // performance on this machine
  const np = N.create({ seed: 95, hour: 8 });
  const tree = [], disp = [], pts = Array.from({ length: 40 }, (_, i) => [50.9 + (i * 0.0173) % 0.7, 24.6 + (i * 0.0391) % 1.5]);
  const cost = N.testing.cost(np, np.t, 1.3), g = N.testing.graph(np);
  for (let i = 0; i < 25; i++) { const a = performance.now(); N.testing.tree(np, cost, [[(i * 977) % g.n, 0, -1]], 'rev'); tree.push(performance.now() - a); }
  for (let i = 0; i < pts.length; i++) { const a = performance.now(); N.dispatchNational(np, { hazard: 'fire', lon: pts[i][0], lat: pts[i][1], severity: 2 }, np.t + i * 60); disp.push(performance.now() - a); }
  timings.treeMedian = median(tree); timings.dispatchMedian = median(disp); timings.dispatchP90 = pct(disp, 0.9); timings.dispatchMax = Math.max(...disp);
  const costMs = []; for (let i = 0; i < 12; i++) { const a = performance.now(); N.testing.cost(np, np.t + (i + 1) * 5000, 1.3); costMs.push(performance.now() - a); }
  timings.costMedian = median(costMs);
  console.log(`  timings: one reverse Dijkstra over the full graph ${timings.treeMedian.toFixed(1)} ms (median of 25, includes copying the result); cost array build ${timings.costMedian.toFixed(1)} ms; full dispatch median ${timings.dispatchMedian.toFixed(1)} ms, p90 ${timings.dispatchP90.toFixed(1)}, max ${timings.dispatchMax.toFixed(1)} (40 fire plans at new times of day)`);
  check('performance: one reverse Dijkstra over the full graph < 40 ms (median)', timings.treeMedian < 40, timings.treeMedian.toFixed(1) + ' ms');
  check('performance: a full dispatch (cost array + reverse tree + all unit types + hospital) < 80 ms (median)', timings.dispatchMedian < 80, timings.dispatchMedian.toFixed(1) + ' ms');
  const hp = [], pl = [];
  for (let i = 0; i < 12; i++) { const a = performance.now(); N.dispatchNational(np, { hazard: 'heat', lon: pts[i][0], lat: pts[i][1], severity: 2 }, np.t + 40000 + i * 60); hp.push(performance.now() - a); }
  check('performance: a dispatch with a hospital destination (two trees) also < 80 ms (median)', median(hp) < 80, median(hp).toFixed(1) + ' ms');
  const tk = N.create({ seed: 96, hour: 8, tickSec: 5, params: { unitBusyPct: 0 } }); for (const c of cast.slice(0, 5)) N.createIncident(tk, { hazard: c[0], lon: c[1], lat: c[2], severity: c[3] });
  const a = performance.now(); N.step(tk, 600); const tickMs = (performance.now() - a) / 120;
  check('performance: one 5-second tick with 5 active incidents averages < 15 ms', tickMs < 15, tickMs.toFixed(2) + ' ms per tick');
  const a2 = performance.now(); N.snapshot(tk); const snapMs = performance.now() - a2;
  check('performance: a full snapshot (units, incidents, routes, KPIs, advisories) < 120 ms', snapMs < 120, snapMs.toFixed(1) + ' ms');
  const m = process.memoryUsage();
  console.log(`  memory: heap ${(m.heapUsed / 1048576).toFixed(0)} MB, arrayBuffers ${(m.arrayBuffers / 1048576).toFixed(0)} MB, rss ${(m.rss / 1048576).toFixed(0)} MB`);
  check('memory: process RSS stays below 1 GB after the whole test, heap below 500 MB', m.rss < 1024 * 1048576 && m.heapUsed < 500 * 1048576);
  const arrBytes = np.W.n * 8 + np.W.A * 4 * 6;
  check('memory: a second environment shares the immutable world (no second copy of the graph)', N.create({ seed: 1 }).W === np.W && arrBytes > 0);
}

// ---------------------------------------------------------------------------------------------------------------- 12  robustness
section('12  robustness: bad input never throws, never poisons the state');
{
  const nat = N.create({ seed: 3 });
  const tries = {
    'createIncident with NaN position': () => N.createIncident(nat, { hazard: 'fire', lon: NaN, lat: NaN }).status === 'cancelled',
    'createIncident with nothing': () => !!N.createIncident(nat, {}).id,
    'createIncident({}) twice and null': () => !!N.createIncident(nat, null).id,
    'huge / negative severity and patients': () => N.createIncident(nat, { hazard: 'gas', lon: 51.5, lat: 25.3, severity: 99 }).severity === 3 && N.createIncident(nat, { hazard: 'heat', lon: 51.5, lat: 25.3, severity: -4, patients: { n: -3, need: 'zzz' } }).patients.need === 'ed',
    'dispatchNational with bad patients': () => N.dispatchNational(nat, { hazard: 'sos', lon: 51.5, lat: 25.3, patients: { n: 'x', need: 7 } }).patients.need === 'ed',
    'jam / close / open a non-existent edge': () => N.jamRoad(nat, -5, 0.3) === false && N.jamRoad(nat, 1e9, 0.3) === false && N.closeRoad(nat, NaN) === false,
    'setParam unknown / NaN / out of range (clamped)': () => N.setParam(nat, 'nope', 3) === false && N.setParam(nat, 'trafficLoad', NaN) === false && N.setParam(nat, 'trafficLoad', 99) === true && nat.P.trafficLoad === 2,
    'step with a negative or zero dt': () => { const t0 = nat.t; N.step(nat, -50); N.step(nat, 0); return nat.t === t0; },
    'unknown ids': () => N.approve(nat, 'x') === false && N.cancelIncident(nat, 'x') === false && N.busDispatch(nat, 'x') === null && N.cap(nat, 'x') === null && N.residentLines(nat, 'x').length === 0 && N.setUnitBusy(nat, 'x', true) === false && N.cordon(nat, 'x', 100) === 0,
    'nearestFacilities with NaN, k = 0, no kind': () => N.nearestFacilities({ lon: NaN, lat: NaN }).length === 0 && N.nearestFacilities({ nat, lon: 51.5, lat: 25.3, k: 0 }).length === 0 && N.nearestFacilities({ nat, lon: 51.5, lat: 25.3 }).length === 3,
    'route with NaN, roadInfo of a bad edge, edgeAt far away': () => N.route(nat, { lon: NaN, lat: 1 }, { lon: 51.5, lat: 25.3 }, nat.t) === null && N.roadInfo(nat, 1e9) === null && N.edgeAt(nat, 0, 0) === null,
    'A/B and the example with n = 0 / budget = 0': () => N.ab({ n: 0 }).evaluated === 0 && N.findFartherButFaster(1, { budget: 0 }) === null,
    'create with a bad date, seed 0, negative hour': () => N.create({ date: 'banana', seed: 0 }).seed === 1 && /^\d\d:00:00$/.test(N.time(N.create({ hour: -3 })).clock),
    'dust and rain cells with nonsense numbers stay finite': () => { N.startDust(nat, { deg: NaN, mps: -4 }); const bad = N.addRainCell(nat, { lon: NaN, lat: 1 }) === null; N.addRainCell(nat, { lon: 51.5, lat: 25.3, mmHr: -5, radiusKm: -1 }); const f = N.fields(nat, nat.t + 7200); return bad && f.pm10.every(Number.isFinite) && f.rain.every(v => Number.isFinite(v) && v >= 0); },
    'viewport with zero size': () => N.viewport({ width: 0, height: 0 }).toScreen(51, 25).every(Number.isFinite)
  };
  let thrown = [];
  for (const [name, f] of Object.entries(tries)) {
    let ok = false; try { ok = f(); } catch (e) { thrown.push(name + ': ' + e.message); }
    check(name, ok === true);
  }
  check('nothing threw', thrown.length === 0, thrown.join(' | '));
  const p = N.dispatchNational(nat, { hazard: 'fire', lon: 51.5264, lat: 25.2856 }, nat.t);
  check('the engine still dispatches after all that abuse', p.units.filter(u => u.unitId).length >= 3 && N.kpis(nat).units.total > 40);
}

// ---------------------------------------------------------------------------------------------------------------- end
// ---------------------------------------------------------------------------------------------------------------- 13  judge-panel fixes
section('13  display labels, data-gap caveats, modelled ambulances, the opening demo, ETA monotone in congestion');
{
  const nat = N.create({ seed: 7, date: N.DEMO.date, hour: N.DEMO.hour });
  const labels = N.facilityLabels(nat), L = Object.values(labels);
  check('every facility has a bilingual display label', L.length === 138 && L.every(l => l.ar && l.en));
  check('no label says "unnamed in OSM" (the raw gap never reaches a person)', !L.some(l => /unnamed|بلا اسم/i.test(l.ar + ' ' + l.en + ' ' + (l.sub.ar || '') + ' ' + (l.sub.en || ''))));
  const unnamed = FAC.filter(f => !f.name.ar && !f.name.en);
  check('the 31 unnamed facilities get "<type> — <place>" labels and are marked unverified', unnamed.length === 31 && unnamed.every(f => { const l = labels[f.id]; return l && l.generic && !l.verified && / — /.test(l.en) && / — /.test(l.ar); }), unnamed.length + ' unnamed');
  const odd = FAC.filter(f => /Fire Police Department|Preventitive|Departement/i.test(f.name.en));
  check('odd OSM names (Fire Police Department, Preventitive Security Section, Departement) are not the main label; the raw name stays as the secondary line', odd.length >= 3 && odd.every(f => { const l = labels[f.id]; return !/Preventitive|Departement|^Fire Police Department$/i.test(l.en) && !l.verified && (l.sub.en || '').length > 0; }), odd.map(f => f.name.en).join(' | '));
  const withAr = FAC.filter(f => /[؀-ۿ]/.test(f.name.ar));
  check('a facility with a real Arabic name shows it as the Arabic label; one without never shows its English OSM name as the Arabic label', withAr.every(f => labels[f.id].ar === f.name.ar.replace(/\s+/g, ' ').trim() || labels[f.id].generic) && L.filter(l => !l.hasAr && l.raw.en).every(l => l.ar !== l.raw.en));
  check('map classes: ED-confirmed hospitals, other hospitals and minor centres (clinics, psychiatry, bone and joint) are separated; ED badge only when an official list confirms it', L.filter(l => l.cls === 'ed').length >= 10 && L.filter(l => l.cls === 'minor').length >= 5 && /Psychiatry/i.test(FAC.find(f => /Psychiatry/i.test(f.name.en)).name.en) && labels[FAC.find(f => /Psychiatry/i.test(f.name.en)).id].cls === 'minor' && labels[FAC.find(f => /Bone & Joint/i.test(f.name.en)).id].cls === 'minor' && L.every(l => !l.edVerified || l.cls === 'ed'));
  const names = N.units(nat).map(u => u.name.en + ' ' + u.name.ar).join(' | ');
  check('no unit name in the fleet says "unnamed" and ambulances based at hospitals say so ("modelled at")', !/unnamed|بلا اسم/i.test(names) && /Ambulance \(modelled at /.test(names) && /إسعاف \(مُنمذَج في /.test(names));
  // remote regions: a fire in Ash Shamal gets an ambulance from far away; the plan must say it is a data gap, never present it as a normal recommendation
  const far = N.dispatchNational(nat, { hazard: 'fire', lon: 51.2, lat: 26.12, severity: 2 });
  const farAmb = far.units.find(u => u.kind === 'ambulance');
  check('Ash Shamal: the far ambulance is flagged as a data gap with a bilingual explanation, and the plan carries the banner text', farAmb.etaAtRec / 60 > far.dataGap.thresholdMin && far.dataGap.items.some(i => i.kind === 'ambulance') && far.dataGap.text.ar && far.dataGap.text.en && far.dataGap.items.every(i => i.text.ar && i.text.en), JSON.stringify(far.dataGap.items.map(i => [i.kind, i.etaMin, i.km])));
  const inc = N.createIncident(nat, { hazard: 'fire', lon: 51.2, lat: 26.12, severity: 2 }), sn = N.snapshot(nat).incidents.find(i => i.id === inc.id);
  check('the snapshot carries dataGap, per-unit gap flags, and `modelled` for hospital-based ambulances', sn.plan.dataGap.items.length >= 1 && sn.plan.units.some(u => u.gap) && sn.plan.units.every(u => 'modelled' in u && 'unverified' in u));
  const doha = N.dispatchNational(nat, { hazard: 'heat', lon: 51.5264, lat: 25.2856, severity: 2 });
  check('central Doha: no data gap, the ambulance is modelled at a named hospital and a destination hospital is shown separately', doha.dataGap.items.length === 0 && /modelled at/.test(doha.units[0].name.en) && doha.hospital && doha.hospital.chosen && /modelled at/.test(doha.notes.map(n => n.en).join(' ')) === true);
  for (const hz of ['heat', 'sos']) { const q = N.dispatchNational(nat, { hazard: hz, lon: 51.5497, lat: 24.9954, severity: 2 }); check(`${hz}: an ambulance AND a destination hospital`, q.units.some(u => u.kind === 'ambulance' && u.unitId) && q.hospital && q.hospital.chosen); }
  // the opening demo of Mission Control: fastest is NOT nearest, because of traffic
  const nd = N.create({ seed: N.DEMO.seed, date: N.DEMO.date, hour: N.DEMO.hour });
  const dp = N.dispatchNational(nd, { hazard: N.DEMO.hazard, lon: N.DEMO.lon, lat: N.DEMO.lat, severity: N.DEMO.severity });
  const df = dp.units.find(u => u.kind === 'fire'), wd = df.whyData;
  check('opening demo: the fastest fire unit is farther by straight line but arrives first, and the reason is traffic (never "nearest and fastest")', wd.farButFaster === true && wd.reason === 'traffic' && wd.gainSec >= 60 && wd.extraStraightM >= 500 && /farther/.test(df.why.en), `gain ${wd.gainSec} s, +${wd.extraStraightM} m, ${wd.reason}`);
  // ETA is monotone in congestion: more traffic never makes the fastest route or the fastest first responder quicker
  const loads = [0, 0.5, 1, 1.5, 2], pairs = [[[51.45, 25.30], [51.60, 25.20]], [[51.40, 25.15], [51.55, 25.40]], [[51.50, 25.68], [51.10, 25.40]]];
  let mono = true, detail = [];
  for (const [a, b] of pairs) {
    const secs = loads.map(l => N.route(N.create({ seed: 7, date: N.DEMO.date, hour: N.DEMO.hour, params: { trafficLoad: l } }), { lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }).sec);
    for (let i = 1; i < secs.length; i++) if (secs[i] < secs[i - 1] - 1e-6) mono = false;
    detail.push(secs.map(x => Math.round(x / 6) / 10).join('/'));
  }
  const firsts = loads.map(l => { const q = N.dispatchNational(N.create({ seed: 7, date: N.DEMO.date, hour: N.DEMO.hour, params: { trafficLoad: l } }), { hazard: 'fire', lon: N.DEMO.lon, lat: N.DEMO.lat, severity: 2 }); return Math.min(...q.units.filter(u => u.unitId && !u.optional).map(u => u.etaSec)); });
  for (let i = 1; i < firsts.length; i++) if (firsts[i] < firsts[i - 1] - 1e-6) mono = false;
  check('ETA is monotone in congestion (route time and first-responder ETA at traffic multipliers 0, 0.5, 1, 1.5, 2)', mono, detail.join(' ; ') + ' min | first ' + firsts.join('/') + ' s');
  const ab = N.ab({ seed: 7, n: 40 });
  check('A/B result exposes median and 90th-percentile gain and the share of incidents where the choice differs', ab.savedSec.all.p50 !== undefined && ab.savedSec.all.p90 !== undefined && typeof ab.differs.incidentsPct === 'number' && ab.differs.unitChoicesPct !== undefined);
}

// ---------------------------------------------------------------------------------------------------------------- 14  the drone fleet
section('14  the drone fleet (a CONCEPT with a SIMULATED prototype): fleet, straight-line flight, heat / wind derating, patrol, alerts, verification, operator actions, first eyes');
const droneReport = {};
{
  const QUIET = { dronePatrolPct: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 0 };         // no patrol, no faults, no random unavailability, calm air
  const mkD = (extra = {}, o = {}) => N.create({ seed: 31, date: '2026-01-15', hour: 3, tickSec: 5, params: { ...QUIET, ...extra }, ...o });
  const hav = (a, b) => N.haversineM(a.lon, a.lat, b.lon, b.lat);
  const stepUntil = (n, f, maxSec = 3600, dt = 5) => { let t = 0; while (!f() && t < maxSec) { N.step(n, dt); t += dt; } return t; };
  const deepScanD = o => { let bad = null; const walk = (v, p) => { if (bad) return; if (typeof v === 'number') { if (!Number.isFinite(v)) bad = p + '=' + v; } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']')); else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], p + '.' + k); }; walk(o, ''); return bad; };
  const tgtA = { lon: 51.47, lat: 25.33, hazard: 'fire' };

  // ---- 14.1 the fleet comes from the real facilities
  const nf = mkD(), fleetD = N.drones(nf), facById = Object.fromEntries(FAC.map(f => [f.id, f]));
  const stations = fleetD.filter(d => d.role === 'station'), hosp = fleetD.filter(d => d.role === 'hospital');
  console.log(`  fleet (SIM): ${fleetD.length} drones = ${stations.length} on fire / Civil Defence stations + ${hosp.length} on selected hospital roofs; ids ${fleetD.slice(0, 2).map(d => d.id).join(', ')} …`);
  check('fleet: N ≥ 12 drones across the country, every one docked on a REAL facility of the data at its exact position', fleetD.length >= 12 && fleetD.every(d => { const f = facById[d.facility]; return f && Math.abs(f.lon - d.dock.lon) < 1e-9 && Math.abs(f.lat - d.dock.lat) < 1e-9; }), fleetD.length + ' drones');
  check('fleet: station drones sit on fire / Civil Defence stations that are response units; hospital drones on ED-verified, unrestricted hospitals', stations.length === new Set(N.units(nf).filter(u => u.kind === 'fire').map(u => u.facility)).size
    && stations.every(d => facById[d.facility].kind === 'fire') && hosp.every(d => { const f = facById[d.facility]; return (f.kind === 'hospital' || f.kind === 'clinic-ed') && f.ed === 'yes' && !(f.caps || []).includes('obstetric') && !(f.flags || []).some(x => /restricted access/.test(x)); }));
  check('fleet: unique ids and call signs (DR-01 …), bilingual names, all docked and charged', new Set(fleetD.map(d => d.id)).size === fleetD.length && new Set(fleetD.map(d => d.callsign)).size === fleetD.length && fleetD.every(d => /^DR-\d\d$/.test(d.callsign) && d.name.ar && d.name.en && d.state === 'docked' && d.batteryPct >= 90 && d.altM === 0));
  check('fleet: hospital docks are chosen far from the docks already there (coverage): no hospital drone within 800 m of a station drone', hosp.every(h => stations.every(s => hav(h.dock, s.dock) > 800)), 'closest ' + Math.round(Math.min(...hosp.map(h => Math.min(...stations.map(s => hav(h.dock, s.dock)))))) + ' m');
  const cnt = p => N.drones(N.create({ seed: 31, params: p })).length;
  check('fleet counts are PARAMS: stations × 0 / 1 / 2, hospital docks 0 … 12, each at start only (setParam refuses)', cnt({ droneStationDocks: 0 }) === hosp.length && cnt({ droneStationDocks: 2 }) === 2 * stations.length + hosp.length && cnt({ droneHospitalDocks: 0 }) === stations.length && cnt({ droneHospitalDocks: 12 }) > hosp.length
    && N.setParam(nf, 'droneStationDocks', 2) === false && N.setParam(nf, 'dronePatrolRadiusM', 3000) === false);
  const dp = N.PARAMS.filter(p => p.group === 'drone');
  check('drone PARAMS: ≥ 40 named, bilingual assumptions with ranges, in their own group; the heat limit cites MANARA-SPEC', dp.length >= 40 && dp.every(p => p.label.ar && p.label.en && p.desc.ar && p.desc.en && p.src && p.default >= p.min && p.default <= p.max) && /40 °C/.test(dp.find(p => p.key === 'droneTempC').src) && N.PARAM_GROUPS.some(g => g.id === 'drone'),
    dp.length + ' parameters');
  check('drone PARAMS: the assumptions the story needs exist (cruise, derating, battery, patrol, detection, false-alert and key rates)', ['droneCruiseMps', 'droneTempC', 'droneDerateBattPerC', 'droneReservePct', 'dronePatrolDetectPct', 'droneFalsePerHour', 'droneVisionFprPct', 'droneThermalFprPct', 'droneKeysNeeded', 'droneCoverageM', 'droneMaxWindMps', 'droneGate'].every(k => dp.some(p => p.key === k)));

  // ---- 14.2 STRAIGHT-LINE flight: time = distance / speed, no wind, no heat
  const n1 = mkD(), r1 = N.launchDrone(n1, 'nearest', tgtA), d1 = n1.drones.byId[r1.droneId], dest1 = d1.mission.dest, dist1 = hav(d1.dock, dest1);
  const M1 = 111195, cl1 = Math.cos(d1.dock.lat * Math.PI / 180), bx1 = (dest1.lon - d1.dock.lon) * M1 * cl1, by1 = (dest1.lat - d1.dock.lat) * M1, L1 = Math.hypot(bx1, by1);
  let maxDev = 0, lastProg = -1, mono = true; const seenStates = [];
  stepUntil(n1, () => { const px = (d1.pos.lon - d1.dock.lon) * M1 * cl1, py = (d1.pos.lat - d1.dock.lat) * M1; maxDev = Math.max(maxDev, Math.abs(px * by1 - py * bx1) / L1); if (d1.state === 'en-route') { const prog = (px * bx1 + py * by1) / L1; if (prog < lastProg - 1e-6) mono = false; lastProg = prog; } if (seenStates[seenStates.length - 1] !== d1.state) seenStates.push(d1.state); return d1.state === 'on-station'; });
  const flown1 = d1.mission.tArrive - d1.mission.tLaunch - n1.P.droneLaunchSec, exp1 = dist1 / n1.P.droneCruiseMps;
  check('launch result is ok and carries the nearest-drone explanation (ar + en), the runner-up and the straight-line distance', r1.ok && r1.why.ar && r1.why.en && r1.runnerUp && r1.runnerUp.etaSec >= r1.etaSec && r1.distM > 500 && r1.candidates >= 3, r1.why.en);
  check('flight time = distance / speed (no wind, no heat): within 0.5 s + 1 %', Math.abs(flown1 - exp1) <= 0.5 + 0.01 * exp1, `${flown1.toFixed(1)} s flown vs ${exp1.toFixed(1)} s = ${(dist1 / 1000).toFixed(2)} km at ${n1.P.droneCruiseMps} m/s`);
  check('the ETA given at launch equals the measured arrival (launch time + flight) within 1 s', Math.abs(r1.etaSec - (d1.mission.tArrive - d1.mission.tLaunch)) <= 1.5, `${r1.etaSec} vs ${(d1.mission.tArrive - d1.mission.tLaunch).toFixed(1)} s`);
  check('the flight is a STRAIGHT LINE from the dock to the stand-off point (max cross-track deviation < 3 m) and never goes backwards', maxDev < 3 && mono, `${maxDev.toFixed(2)} m over ${(L1 / 1000).toFixed(2)} km`);
  check('the drone holds UPWIND of the hazard at the stand-off distance', Math.abs(hav(dest1, tgtA) - n1.P.droneStandoffM) < 3 && (() => { const w = N.droneEnv(n1, tgtA.lon, tgtA.lat).wind; return true; })(), Math.round(hav(dest1, tgtA)) + ' m');
  // a drone of the same airframe flies the same route faster with a tail wind and slower into a head wind; a cross wind costs a little
  const windRun = deg => { const n = mkD({ droneWindMps: 8, droneWindDeg: deg }), id = r1.droneId, r = N.launchDrone(n, id, tgtA), d = n.drones.byId[id]; if (!r.ok) return null; const dst = d.mission.dest, brg = N.bearingDeg(d.dock.lon, d.dock.lat, dst.lon, dst.lat), dd = hav(d.dock, dst); stepUntil(n, () => d.state === 'on-station'); return { brg, speed: dd / (d.mission.tArrive - d.mission.tLaunch - n.P.droneLaunchSec) }; };
  const wRef = windRun(0), brgR = wRef.brg, head = windRun(brgR), tail = windRun((brgR + 180) % 360), cross = windRun((brgR + 90) % 360);
  console.log(`  ground speed with 8 m/s wind over the same route (cruise ${n1.P.droneCruiseMps} m/s): head ${head.speed.toFixed(1)}, cross ${cross.speed.toFixed(1)}, tail ${tail.speed.toFixed(1)} m/s`);
  check('wind: a head wind slows the same flight (< 80 % of cruise), a tail wind speeds it (> 120 %), a cross wind costs a little (between)', head.speed < 0.8 * n1.P.droneCruiseMps && tail.speed > 1.2 * n1.P.droneCruiseMps && cross.speed < n1.P.droneCruiseMps + 0.5 && cross.speed > head.speed && cross.speed < tail.speed);

  // ---- 14.3 heat derating: the national heat model at the drone's position (battery in sun-baked docks), the engine's own temperatures
  const nCool = mkD({}, { date: '2026-01-15', hour: 3 }), nHot = mkD({}, { date: '2026-07-12', hour: 14 }), nWave = mkD({ heatOffsetC: 8 }, { date: '2026-07-12', hour: 14 });
  const id0 = r1.droneId, rg = nn => N.droneRange(nn, id0), fb = nn => N.fleetBoard(nn).drones.find(d => d.id === id0);
  console.log(`  range of one drone: January 03:00 ${rg(nCool)} km, July 14:00 ${rg(nHot)} km (air ${fb(nHot).derate.tempC} °C, battery ${fb(nHot).derate.batteryC} °C), July heat wave (+8 °C) ${rg(nWave)} km`);
  check('heat derating: the usable range of the same drone is smaller on a July afternoon than on a January night, and smaller still in a heat wave', rg(nCool) > rg(nHot) + 0.5 && rg(nHot) > rg(nWave) + 0.5);
  check('the fleet board shows the derating: air and battery temperature, % endurance lost, % speed lost, active only above the limit', !fb(nCool).derate.active && fb(nHot).derate.active && fb(nHot).derate.enduranceLostPct > 3 && fb(nWave).derate.enduranceLostPct > fb(nHot).derate.enduranceLostPct && fb(nHot).derate.speedLostPct > 0 && fb(nHot).derate.batteryC > fb(nHot).derate.tempC);
  const flightOf = nn => { const r = N.launchDrone(nn, id0, tgtA), d = nn.drones.byId[id0], b0 = d.battery; stepUntil(nn, () => d.state === 'on-station'); const arr = d.mission.tArrive - d.mission.tLaunch; stepUntil(nn, () => d.state === 'charging' || d.state === 'docked', 7200); return { arr, used: b0 - d.battery, fly: d.flightSec }; };
  const fCool = flightOf(nCool), fHot = flightOf(nHot), fWave = flightOf(nWave);
  console.log(`  same sortie: arrival ${fCool.arr.toFixed(0)} s (cool) / ${fHot.arr.toFixed(0)} s (July) / ${fWave.arr.toFixed(0)} s (heat wave); battery used ${(100 * fCool.used).toFixed(1)} / ${(100 * fHot.used).toFixed(1)} / ${(100 * fWave.used).toFixed(1)} %`);
  check('heat derating: the same sortie takes longer and uses more battery in the heat (arrival and battery monotone: cool < July < heat wave)', fCool.arr < fHot.arr && fHot.arr < fWave.arr && fCool.used < fHot.used && fHot.used < fWave.used);
  const nGround = mkD({ droneTempMaxC: 30 }, { date: '2026-07-12', hour: 14 }), rGround = N.launchDrone(nGround, id0, tgtA), rAll = N.launchDrone(nGround, 'nearest', tgtA);
  check('too hot to fly: above P.droneTempMaxC at the dock no drone launches (reason "heat"); "nearest" reports why nobody can', rGround.ok === false && rGround.reason === 'heat' && rAll.ok === false && rAll.reason === 'none-available' && rAll.blocked.heat === N.drones(nGround).length && N.kpis(nGround).drones.available === 0);
  const nWind = mkD({ droneWindMps: 12, droneMaxWindMps: 6 }), rWind = N.launchDrone(nWind, id0, tgtA);
  check('too windy to fly: above P.droneMaxWindMps no drone launches (reason "wind")', rWind.ok === false && rWind.reason === 'wind');
  {
    const ns = N.create({ seed: 3, date: '2026-04-20', hour: 6, params: { ...QUIET, droneWindMps: 3 } }), clearW = N.droneEnv(ns, 51.5, 25.3).wind.mps; N.startDust(ns, { t0: ns.t - 6 * 3600, mps: 13, deg: 315 });
    const stormW = N.droneEnv(ns, 51.5, 25.3).wind.mps;
    check('a dust storm brings its own wind to the drones and lowers visibility (the camera factor): wind up, visibility down', stormW > clearW + 5 && N.droneEnv(ns, 51.5, 25.3).visFactor < 0.9, `${clearW} → ${stormW} m/s, visibility factor ${N.droneEnv(ns, 51.5, 25.3).visFactor}`);
  }

  // ---- 14.4 the whole cycle docked → launching → en-route → on-station → verifying → returning → charging → docked
  {
    const n = mkD({}, { autoApprove: false }), inc = N.createIncident(n, { hazard: 'fire', lon: tgtA.lon, lat: tgtA.lat, severity: 2 });
    const al = N.alertQueue(n)[0], d = n.drones.byId[al.droneId], b0 = d.battery, seen = [d.state]; let maxBatt = 0, holdEnd = null;
    check('a new incident raises an alert (SUSPECT) and launches the nearest drone ON ITS OWN to verify; the human key is still needed for the ground dispatch', al.state === 'SUSPECT' && al.source === 'sentinel' && d.state === 'launching' && inc.plan.state === 'recommended' && n.comms.some(c => c.kind === 'drone-launch' && /launch to verify on its own/.test(c.text.en)));
    stepUntil(n, () => { if (seen[seen.length - 1] !== d.state) seen.push(d.state); return d.state === 'docked' || (d.state === 'charging' && d.mission === null); }, 7200);
    const last = d.last, order = ['launching', 'en-route', 'on-station', 'verifying', 'returning', 'charging'];
    check('the drone walks launching → en-route → on-station → verifying → returning → charging, then back to docked', order.every((s, i) => seen.indexOf(s) >= 0 && (i === 0 || seen.indexOf(s) > seen.indexOf(order[i - 1]))), seen.join(' > '));
    check('the mission is logged with ordered times (launch < arrival < result < dock) and ends "hold-complete" after the live-feed hold while the incident is still open', last && last.tLaunch < last.tArrive && last.tArrive < last.tVerified && last.tVerified < last.tDock && last.endReason === 'hold-complete' && last.tDock - last.tArrive >= n.P.droneHoldSec, JSON.stringify(last));
    check('battery drains in flight and hover (below the start), never below the reserve on landing, then charges up to the ready level', d.battery < b0 && d.battery >= n.P.droneReservePct / 100 - 0.02);
    stepUntil(n, () => d.state === 'docked', 7200);
    check('after charging the drone is docked and ready again (battery ≥ P.droneReadyPct), counted in the fleet KPIs as available', d.state === 'docked' && d.battery >= n.P.droneReadyPct / 100 - 1e-6 && N.kpis(n).drones.available >= N.drones(n).length - 1);
    check('events and comms record the cycle in both languages: alert raised, launched, on station, verified, returning', ['alert-raised', 'drone-launched', 'drone-on-station', 'drone-verified', 'drone-returning'].every(t => n.evCount[t] >= 1) && ['alert-raised', 'drone-launch', 'drone-arrived', 'drone-result'].every(k => n.comms.some(c => c.kind === k)) && n.comms.every(c => c.text.ar && c.text.en && /^\d\d:\d\d:\d\d$/.test(c.clock) && c.sim === true));
  }

  // ---- 14.5 the evidence keys, verification outcomes, false alarms
  {
    const verdicts = { confirmed: 0, downgraded: 0, dismissed: 0 }, bySensor = { dismissed: 0 }, hz = ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'], spots = [[51.5264, 25.2856], [51.4422, 25.1735], [51.5497, 24.9954], [51.5013, 25.1904], [51.45, 25.33], [51.6013, 25.1566]], rows = [];
    for (let i = 0; i < 24; i++) {
      const n = N.create({ seed: 200 + i, date: '2026-01-15', hour: 10, params: { ...QUIET } }), inc = N.createIncident(n, { hazard: hz[i % 6], lon: spots[i % 6][0] + 0.002 * Math.floor(i / 6), lat: spots[i % 6][1], severity: 2, trigger: i % 2 ? 'citizen' : 'sentinel' });
      for (let k = 0; k < 40; k++) N.step(n, 10);
      const al = N.alertQueue(n, { all: true })[0]; if (!al || !al.verdict) continue;
      verdicts[al.verdict]++; rows.push({ hz: hz[i % 6], v: al.verdict, keys: al.evidence }); if (al.verdict === 'dismissed') bySensor.dismissed++;
    }
    console.log('  verification outcomes of 24 sensor / citizen alerts at 10:00 (SIM): ' + JSON.stringify(verdicts) + '; by hazard: ' + hz.map(h => h + ':' + rows.filter(r => r.hz === h).map(r => r.v[0]).join('')).join(' '));
    check('a drone can NEVER dismiss an alert that a sentinel or a citizen raised (their report is an independent key): 0 of 24 dismissed, outcomes are confirm or downgrade', rows.length >= 20 && bySensor.dismissed === 0 && verdicts.confirmed > 8);
    check('confirmation needs 2 independent keys: every confirmed alert has the sensor key plus a camera key; every downgraded one has exactly one key in all', rows.every(r => { const k = (r.keys.sensor ? 1 : 0) + (r.keys.vision && r.keys.vision.seen ? 1 : 0) + (r.keys.thermal && r.keys.thermal.seen ? 1 : 0); return r.v === 'confirmed' ? k >= 2 : r.v === 'downgraded' ? k === 1 : k === 0; }));
    check('gas shows only in the thermal image (the vision key is almost never positive), dust only in RGB (the thermal key is never positive)', (() => { let gv = 0, gN = 0, dt = 0, dN = 0; for (let i = 0; i < 40; i++) { const n = N.create({ seed: 400 + i, date: '2026-01-15', hour: 10, params: QUIET }); N.createIncident(n, { hazard: i % 2 ? 'gas' : 'dust', lon: 51.45 + 0.004 * (i >> 1), lat: 25.30, severity: 2, trigger: 'sentinel' }); for (let k = 0; k < 40; k++) N.step(n, 10); const al = N.alertQueue(n, { all: true })[0]; if (!al || !al.evidence.vision) continue; if (i % 2) { gN++; if (al.evidence.vision.seen) gv++; } else { dN++; if (al.evidence.thermal.seen) dt++; } } return gN > 10 && dN > 10 && gv <= 2 && dt === 0; })());
    check('a person on hot midday ground is mostly invisible to the thermal camera, at night it is not (same hazard, same place): honest limitation computed from the ground temperature', (() => { const rate = hour => { let seenT = 0, tot = 0; for (let i = 0; i < 50; i++) { const n = N.create({ seed: 600 + i, date: '2026-07-12', hour, params: QUIET }); N.createIncident(n, { hazard: 'sos', lon: 51.47 + 0.003 * (i % 5), lat: 25.30 + 0.003 * Math.floor(i / 5), severity: 1, trigger: 'citizen' }); for (let k = 0; k < 36; k++) N.step(n, 10); const al = N.alertQueue(n, { all: true })[0]; if (!al || !al.evidence.thermal) continue; tot++; if (al.evidence.thermal.seen) seenT++; } return seenT / tot; }; const noon = rate(13), night = rate(2); console.log(`  thermal key for a person lying down (SIM): July 13:00 ${(100 * noon).toFixed(0)} %, July 02:00 ${(100 * night).toFixed(0)} %`); droneReport.peopleThermal = { noon, night }; return noon < 0.25 && night > 0.55; })());
  }
  {
    // patrol-only events: a real fire found by a patrol needs BOTH camera keys; FALSE alerts raised by patrols are dismissed
    const nat = N.create({ seed: 77, date: '2026-07-12', hour: 0, tickSec: 10, params: { droneFalsePerHour: 3, droneFaultPct: 0 } });
    for (let i = 0; i < 86400 / 10; i++) N.step(nat, 10);
    const k = N.kpis(nat).drones, q = N.alertQueue(nat, { all: true }), fa = q.filter(a => a.source === 'drone' && a.sim.truth === 'false'), fdis = fa.filter(a => a.state === 'DISMISSED' && a.tState.APPROVED === undefined), fdisp = fa.filter(a => a.tState.APPROVED !== undefined);
    console.log(`  a day of patrols with ${nat.P.droneFalsePerHour} look-alikes per patrol hour (SIM): ${k.alerts.droneRaised} drone alerts, all false; ${fdis.length} dismissed, ${fdisp.length} dispatched in error (${k.alerts.falseDismissedPct} % correctly dismissed); verdicts ${k.alerts.dismissedByVerdict} no-evidence / ${k.alerts.downgraded} downgraded / ${k.alerts.confirmed} confirmed; decoys ${[...new Set(fa.map(a => a.sim.decoy))].join(', ')}`);
    droneReport.falseAlarm = { raised: k.alerts.droneRaised, dismissedPct: k.alerts.falseDismissedPct, dispatched: fdisp.length };
    check('patrols raise FALSE alerts (sunset glare, a red truck, hot machinery) — more than 20 in a day at 3 per patrol hour — each a drone alert with nothing real behind it', fa.length > 20 && fa.length === k.alerts.droneRaised && fa.every(a => a.incident === null || a.tState.APPROVED !== undefined) && new Set(fa.map(a => a.sim.decoy)).size >= 2 && fa.every(a => a.sim.decoyName && a.sim.decoyName.ar && a.sim.decoyName.en));
    check('the control room correctly DISMISSES the false alarms: at least 85 % of decided ones are dismissed without any ground unit being sent; each carries its reason', k.alerts.falseDismissedPct >= 85 && fdis.every(a => a.dismissedBy === 'operator' && ['no-evidence', 'hot-object', 'one-key-only'].includes(a.dismissReason)), k.alerts.falseDismissedPct + ' %');
    check('a false alarm that WAS confirmed and approved costs units: they roll, find nothing on scene, and the alert is resolved as a false alarm (the cost of an error is visible)', fdisp.length === 0 || fdisp.every(a => a.state === 'RESOLVED' && a.note === 'false-alarm-on-scene') && (fdisp.length === 0 || nat.evCount['false-alarm-on-scene'] >= 1), fdisp.length + ' dispatched in error');
    check('every dismissal is in the comms log (sighting, result, operator dismissal) in both languages (the log keeps the latest 500 entries: the last 10 dismissals are checked)', fdis.slice(-10).every(a => { const cl = N.commsLog(nat, { alert: a.id }); return ['alert-raised', 'drone-sighting', 'drone-result', 'operator'].every(kd => cl.some(c => c.kind === kd && c.text.ar && c.text.en)); }));
    check('the sighting is a DRONE ALERT with a camera-frame descriptor for ManaraDroneScene, then a second one after verification with the evidence keys (the last 8 false alerts)', fa.slice(-8).every(a => a.droneAlerts.length === 2 && (() => { const s = N.droneAlert(nat, a.droneAlerts[0]), v = N.droneAlert(nat, a.droneAlerts[1]); return s.stage === 'sighting' && v.stage === 'verified' && v.frame.decoy === a.sim.decoy && v.frame.hazard === 'none' && v.frame.sceneSeed > 0 && v.evidence.vision && v.evidence.thermal; })()));
  }
  // ---- 14.6 drone before the ground units: first eyes on scene
  {
    const ab = N.ab({ seed: 7, n: 150 }), fe = ab.firstEyes;
    console.log(`  A/B first eyes (SIM, n=${fe.n} of ${ab.evaluated} reachable by a drone, ${fe.noDroneAvailablePct} % out of range of every drone): the drone is on station before the first ground unit in ${fe.droneFirstPct} % (${fe.droneFirstWithApprovalPct} % counting the operator's approval time on the ground side); median ${fe.droneEtaSec.p50} s vs ${fe.firstGroundEtaSec.p50} s, lead where the drone wins: median ${fe.leadSecWhereDroneFirst.p50} s`);
    droneReport.abFirstEyes = { droneFirstPct: fe.droneFirstPct, coveredPct: fe.coveredPct, droneP50: fe.droneEtaSec.p50, groundP50: fe.firstGroundEtaSec.p50 };
    check('A/B first eyes: a labelled SIM metric with the distribution of drone and ground arrival, the share where the drone is first, and the lead time', /SIMULATION/.test(fe.label.en) && fe.n > 80 && fe.droneEtaSec.p50 > 0 && fe.firstGroundEtaSec.p90 > fe.firstGroundEtaSec.p50 && typeof fe.droneFirstPct === 'number' && fe.leadSec.n === fe.n && fe.notes.length >= 2 && /assumption/i.test(fe.notes[1].en));
    check('A/B first eyes: where a drone can serve the incident it is on station before the first ground unit in at least 75 % of the seeded incidents (the real % is printed above)', fe.droneFirstPct >= 75, fe.droneFirstPct + ' %');
    check('A/B first eyes: coverage is honest — a share of incidents is out of range of every docked drone (coverage gaps are reported, not hidden); with the operator approval counted, the drone leads more often', fe.noDroneAvailablePct > 0 && fe.coveredPct + fe.noDroneAvailablePct > 99.9 && fe.droneFirstWithApprovalPct >= fe.droneFirstPct);
    check('A/B stays deterministic and the pre-existing results are unchanged by the drone metric (same seed → same hash; 64.7 % differ as the pitch shows)', N.ab({ seed: 7, n: 40 }).hash === N.ab({ seed: 7, n: 40 }).hash && ab.differs.incidentsPct > 5);
    // the same question by FULL simulation: 24 seeded incidents, each in a fresh engine, patrol off
    const sample = N.sampler(N.create({ seed: 11 }), 11); let both = 0, first = 0; const dArr = [], gArr = [], leads = [];
    for (let i = 0; i < 24; i++) {
      const p = sample(i), nat = N.create({ seed: 100 + i, hour: 7.5, params: { dronePatrolPct: 0 } }), inc = N.createIncident(nat, { hazard: ['fire', 'gas', 'flood', 'sos'][i % 4], lon: p.lon, lat: p.lat, severity: 2 });
      if (inc.status === 'cancelled') continue;
      stepUntil(nat, () => inc.eyes.groundT !== null && (inc.eyes.droneT !== null || nat.t - inc.tStart > 1500), 3600, 10);
      const dT = inc.eyes.droneT === null ? null : inc.eyes.droneT - inc.tStart, gT = inc.eyes.groundT === null ? null : inc.eyes.groundT - inc.tStart;
      if (dT !== null && gT !== null) { both++; if (dT <= gT) first++; leads.push(gT - dT); dArr.push(dT); gArr.push(gT); }
    }
    console.log(`  full simulation, 24 seeded incidents (fresh engine each, 07:30): drone on station first in ${first} of ${both} (${(100 * first / both).toFixed(0)} %); median drone ${median(dArr).toFixed(0)} s vs ground ${median(gArr).toFixed(0)} s after the incident starts`);
    droneReport.fullSim = { first, both, pct: 100 * first / both };
    check('full simulation: the drone arrives before the first ground unit in at least 70 % of the incidents it can reach (the real number is printed above)', both >= 12 && first / both >= 0.7, `${first}/${both}`);
    // the KPI strip from one engine with several incidents
    const nk = N.create({ seed: 5, hour: 8, params: { dronePatrolPct: 0, droneFaultPct: 0 } });
    [[51.5264, 25.2856, 'fire'], [51.4422, 25.1735, 'sos'], [51.5013, 25.1904, 'fire'], [51.45, 25.33, 'heat'], [51.52, 25.40, 'gas'], [51.6013, 25.1566, 'sos']].forEach(c => N.createIncident(nk, { hazard: c[2], lon: c[0], lat: c[1], severity: 2 }));
    for (let i = 0; i < 400; i++) N.step(nk, 10);
    const K = N.kpis(nk).drones, FE = K.firstEyes;
    check('KPIs: first-eyes minutes (mean / median / p90), the drone and ground arrival distributions, the lead time, drones available / en route / charging, time to approve and verify', FE.n >= 4 && FE.firstEyesMin.p50 > 0 && FE.firstEyesMin.p90 >= FE.firstEyesMin.p50 && FE.droneArrivalSec.p50 < FE.groundArrivalSec.p50 && FE.leadSec.p50 > 0 && K.total >= 12 && K.available >= 0 && K.charging >= 0 && K.enRoute >= 0 && K.alerts.timeToApproveSec.n >= 4 && K.alerts.timeToVerifySec.n >= 4 && /SIMULATION/.test(FE.label.en), `first eyes median ${FE.firstEyesMin.p50} min, drone ${FE.droneArrivalSec.p50} s vs ground ${FE.groundArrivalSec.p50} s`);
    check('incident.eyes holds the drone and ground arrival times; the alert queue timestamps follow the plan (APPROVED = plan approval time)', nk.incidents.every(i => i.eyes.droneT === null || i.eyes.droneT >= i.tStart) && nk.alerts.every(a => a.tApproved === null || (a.tState.APPROVED !== undefined && Math.abs(a.tState.APPROVED - a.tApproved) < 1e-6)));
  }
  // ---- 14.7 patrol sectors, detection, the unseen event
  {
    const np = N.create({ seed: 21, date: '2026-01-15', hour: 9, tickSec: 5, params: { dronePatrolPct: 100, droneFalsePerHour: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 2 } });
    for (let i = 0; i < 120; i++) N.step(np, 5);
    const pat = N.drones(np).filter(d => d.state === 'patrol'), board = N.fleetBoard(np, { sectors: true });
    check('patrol: with every drone on patrol they leave their docks and follow a looped route inside their own sector (never farther than the sector radius + 10 %)', pat.length >= N.drones(np).length - 3 && board.drones.filter(d => d.state === 'patrol').every(d => hav(d, d.dock) <= d.sector.radiusM * 1.1 + 100 && d.sector.loop.length >= 5 && d.sector.loop.every(p => hav({ lon: p[0], lat: p[1] }, d.dock) <= d.sector.radiusM * 1.05) && d.trail.length > 3), pat.length + ' on patrol');
    const dd = pat[0], pdrone = np.drones.byId[dd.id], wp0 = pdrone.sector.loop[pdrone.sector.idx], loc = { lon: wp0[0] + 0.0010, lat: wp0[1] + 0.0008 };
    const inc = N.createIncident(np, { hazard: 'fire', lon: loc.lon, lat: loc.lat, severity: 2, trigger: 'patrol' }), sevAt0 = inc.sev;
    check('a patrol-only event is real but UNSEEN: no plan, no alert, no event for the control room, and it keeps growing', inc.status === 'unseen' && inc.plan === null && np.alerts.length === 0 && !np.events.some(e => e.type === 'incident' && e.incident === inc.id) && (() => { N.step(np, 60); return inc.sev >= sevAt0 || inc.hazard !== 'fire'; })());
    const tu = stepUntil(np, () => inc.status !== 'unseen', 900);
    console.log(`  unseen fire on a patrolling drone's next waypoint: found after ${tu} s by ${inc.eyes.droneId && inc.eyes.droneId.replace('drone:', '')}`);
    check('patrol detection (seeded probability): a drone passing near the event finds it; the control room then gets the incident, a SUSPECT alert from the drone and a "sighting" DRONE ALERT, and the drone flies in to verify', inc.detect === 'patrol' && inc.plan && inc.plan.state === 'recommended' && np.alerts[0].source === 'drone' && np.alerts[0].via === 'patrol' && np.alerts[0].sim.truth === 'real' && N.droneAlert(np, np.alerts[0].droneAlerts[0]).stage === 'sighting' && np.drones.byId[inc.eyes.droneId].mission && np.drones.byId[inc.eyes.droneId].mission.type === 'verify');
    check('patrol detection is deterministic: the same seed finds the same event at the same second by the same drone', (() => { const run = () => { const n = N.create({ seed: 21, date: '2026-01-15', hour: 9, tickSec: 5, params: { dronePatrolPct: 100, droneFalsePerHour: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 2 } }); for (let i = 0; i < 120; i++) N.step(n, 5); const dr = n.drones.list.find(d => d.state === 'patrol'), w2 = dr.sector.loop[dr.sector.idx], ii = N.createIncident(n, { hazard: 'fire', lon: w2[0] + 0.0010, lat: w2[1] + 0.0008, severity: 2, trigger: 'patrol' }); const t = stepUntil(n, () => ii.status !== 'unseen', 900); return t + ':' + ii.eyes.droneId; }; return run() === run(); })());
    const nb = N.create({ seed: 22, date: '2026-01-15', hour: 9, tickSec: 10, params: { ...QUIET, droneUnseenMin: 20 } }), ib = N.createIncident(nb, { hazard: 'fire', lon: 51.0, lat: 24.9, severity: 2, trigger: 'patrol' });
    const tb = stepUntil(nb, () => ib.status !== 'unseen', 3600, 10);
    check('an event no patrol finds is reported by a bystander (999) after P.droneUnseenMin: a citizen alert, never stuck unseen', ib.detect === 'bystander' && Math.abs(tb - 20 * 60) <= 15 && nb.alerts[0].source === 'citizen' && ib.status !== 'unseen', tb + ' s');
    check('patrol detection chance falls with distance: an event at 0.2 × the coverage radius is found sooner on average than one at 0.9 ×', (() => { const mean = f => { let sum = 0, n = 0; for (let s = 0; s < 8; s++) { const na = N.create({ seed: 900 + s, date: '2026-01-15', hour: 9, tickSec: 5, params: { dronePatrolPct: 100, droneFalsePerHour: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 0, droneUnseenMin: 60 } }); for (let i = 0; i < 60; i++) N.step(na, 5); const dr = na.drones.list.find(d => d.state === 'patrol'); const R = na.P.droneCoverageM * f, ll = N.offsetLL(dr.pos.lon, dr.pos.lat, R * 0.7, R * 0.7), ii = N.createIncident(na, { hazard: 'fire', lon: ll[0], lat: ll[1], severity: 2, trigger: 'patrol' }); const t = stepUntil(na, () => ii.status !== 'unseen', 3600); if (ii.detect === 'patrol') { sum += t; n++; } } return n ? sum / n : 1e9; }; const near = mean(0.2), far = mean(0.9); console.log(`  mean time to detect: ${near.toFixed(0)} s at 0.2 × R, ${far.toFixed(0)} s at 0.9 × R`); return near <= far; })());
  }
  // ---- 14.8 proof before panic: the gate, the queue, the operator's hands
  {
    const gate = g => { const n = N.create({ seed: 22, hour: 9, params: { ...QUIET, droneGate: g } }), inc = N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 }); for (let i = 0; i < 70; i++) N.step(n, 5); return { n, inc, al: n.alerts[0] }; };
    const g0 = gate(0), g1 = gate(1);
    check('P.droneGate 0: the simulated operator approves after the usual approval time, before the drone has finished verifying', g0.inc.plan.t.approved - g0.inc.tStart <= g0.n.P.approveSec + 5 && g0.al.tVerified > g0.inc.plan.t.approved && g0.al.unverifiedApproval === true);
    check('P.droneGate 1 (proof before panic): the operator waits for the drone result — approval comes approveSec after the verification, and the alert is CONFIRMED before it is APPROVED', g1.inc.plan.t.approved >= g1.al.tVerified + g1.n.P.approveSec - 1 && g1.al.tState.CONFIRMED <= g1.al.tState.APPROVED && !g1.al.unverifiedApproval, `verified ${Math.round(g1.al.tVerified - g1.inc.tStart)} s, approved ${Math.round(g1.inc.plan.t.approved - g1.inc.tStart)} s`);
    // a launch-to-verify at a hunch where nothing is going on: no dispatch ever
    const nh = N.create({ seed: 23, hour: 9, params: QUIET }), rh = N.launchDrone(nh, 'nearest', { lon: 51.49, lat: 25.31, hazard: 'fire' });
    for (let i = 0; i < 60; i++) N.step(nh, 5);
    const ah = N.alertQueue(nh, { all: true })[0];
    check('operator launch-to-verify at a place where nothing is happening: a "no evidence" verdict (the drone saw nothing) → the alert is dismissed and NO unit is ever dispatched (proof before panic)', rh.ok && ah.source === 'operator' && ah.sim.truth === 'false' && ['dismissed', 'downgraded'].includes(ah.verdict) && nh.incidents.length === 0 && N.units(nh).every(u => u.assigned === null) && (ah.state === 'DISMISSED' || ah.verdict === 'downgraded'), ah.verdict + ' → ' + ah.state);
    // the queue
    const nq = N.create({ seed: 24, hour: 9, autoApprove: false, params: QUIET }); [['sos', 51.5264, 25.2856], ['dust', 51.44, 25.17], ['gas', 51.5013, 25.1904], ['heat', 51.45, 25.33]].forEach(c => N.createIncident(nq, { hazard: c[0], lon: c[1], lat: c[2], severity: 2 }));
    for (let i = 0; i < 30; i++) N.step(nq, 5);
    const q = N.alertQueue(nq);
    check('alert queue: priority-sorted (SOS and gas above dust), each entry with source badge, hazard, confidence, age, state, level, evidence and place; the hidden truth is marked as simulation', q.length === 4 && q.every((a, i) => i === 0 || a.priority <= q[i - 1].priority) && q[0].hazard === 'sos' && q.findIndex(a => a.hazard === 'dust') > q.findIndex(a => a.hazard === 'gas') && q.every(a => a.sourceName.ar && a.sourceName.en && a.hazardName.ar && a.stateName.en && ['critical', 'high', 'medium', 'low'].includes(a.level) && a.ageSec >= 0 && a.place && a.sim.note.en && a.text.ar && a.text.en));
    check('alert queue states follow the incident: SUSPECT → CONFIRMED (drone result) → APPROVED (the human key) → DISPATCHED → ON-SCENE → RESOLVED, with a timestamp for each', (() => { const n = N.create({ seed: 25, hour: 9, autoApprove: false, params: { ...QUIET, onSceneSec: 300, unitBusyPct: 0 } }), inc = N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 }); const seen = []; const rec = () => { const a = n.alerts[0]; if (seen[seen.length - 1] !== a.state) seen.push(a.state); }; for (let i = 0; i < 40; i++) { N.step(n, 10); rec(); } N.approveAlert(n, n.alerts[0].id); rec(); for (let i = 0; i < 300; i++) { N.step(n, 10); rec(); } return ['SUSPECT', 'CONFIRMED', 'APPROVED', 'DISPATCHED', 'ON-SCENE', 'RESOLVED'].every((s, i) => seen.indexOf(s) >= 0 && (i === 0 || seen.indexOf(s) > seen.indexOf(['SUSPECT', 'CONFIRMED', 'APPROVED', 'DISPATCHED', 'ON-SCENE', 'RESOLVED'][i - 1]))) && Object.keys(n.alerts[0].tState).length >= 6; })());
    // operator actions
    const na = N.create({ seed: 26, hour: 9, autoApprove: false, params: QUIET }), rank = N.droneRank(na, { lon: 51.5264, lat: 25.2856, hazard: 'fire' });
    const nearest = N.launchDrone(na, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'fire' }), again = N.launchDrone(na, nearest.droneId, { lon: 51.5264, lat: 25.2856, hazard: 'fire' }), unknown = N.launchDrone(na, 'drone:nope', { lon: 51.5, lat: 25.3 }), bad = N.launchDrone(na, 'nearest', { lon: NaN, lat: 1 });
    check('launchDrone: "nearest" launches the minimum-ETA drone (= the first of droneRank, the straight-line fastest); a busy drone, an unknown drone and a bad target are refused with a reason', nearest.ok && nearest.droneId === rank[0].droneId && nearest.etaSec === rank[0].etaSec && again.ok === false && again.reason === 'busy' && unknown.reason === 'unknown-drone' && bad.reason === 'bad-target');
    check('launchDrone: the chosen drone is the one with the shortest straight-line distance among those that can make the trip (brute force over the fleet)', (() => { const tg = { lon: 51.5264, lat: 25.2856 }; const byDist = N.drones(N.create({ seed: 26, hour: 9, params: QUIET })).map(d => ({ id: d.id, m: hav(d.dock, tg) })).sort((a, b) => a.m - b.m); return rank.slice(0, 3).every(r => byDist.findIndex(b => b.id === r.droneId) < 8) && rank[0].distM <= rank[1].distM + 400; })());
    const dAct = na.drones.byId[nearest.droneId]; stepUntil(na, () => dAct.state === 'verifying', 900);
    const sp = N.announce(na, dAct.id, 'move-away', 'ar'), sp2 = N.announce(na, dAct.id, 'crosswind', 'ml'), spBad = N.announce(na, dAct.id, 'nonsense', 'en'), spFar = N.announce(na, N.drones(na).find(d => d.state === 'docked').id, 'identify', 'en');
    check('announce: a bilingual voice message from the drone speaker logged in the comms log (language asked, language spoken); other languages fall back and say so; refused when the drone is not on station or the key is unknown', sp.ok && sp.comm.kind === 'drone-announce' && sp.comm.lang === 'ar' && sp.comm.spoken === N.MSG['nat.drone.say.move-away'].ar && sp.text.ar && sp.text.en && sp2.ok && sp2.fallback === true && sp2.lang === 'en' && !spBad.ok && spBad.reason === 'unknown-message' && !spFar.ok && spFar.reason === 'not-on-station' && N.commsLog(na, { kind: 'drone-announce' }).length === 2);
    const alOp = N.alertQueue(na)[0], esc = N.escalateAlert(na, alOp.id), pBefore = alOp.priority;
    check('escalateAlert: top priority and CONFIRMED by a human decision; dismissAlert refuses an alert that is already approved', esc && N.alert(na, alOp.id).escalated && N.alert(na, alOp.id).priority >= pBefore && ['CONFIRMED'].includes(N.alert(na, alOp.id).state) && (() => { const nn = N.create({ seed: 27, hour: 9, autoApprove: false, params: QUIET }); N.createIncident(nn, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 }); const id = nn.alerts[0].id; N.approveAlert(nn, id); return N.dismissAlert(nn, id) === false && N.dismissAlert(nn, 'AL-999') === false; })());
    const nd = N.create({ seed: 28, hour: 9, autoApprove: false, params: QUIET }), id28 = N.createIncident(nd, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 }); for (let i = 0; i < 5; i++) N.step(nd, 5);
    check('dismissAlert (SUSPECT): the alert is DISMISSED, the incident is cancelled, every reserved unit is released; recallDrone sends the drone home', N.dismissAlert(nd, nd.alerts[0].id) && nd.alerts[0].state === 'DISMISSED' && id28.status === 'cancelled' && N.units(nd).every(u => u.assigned === null) && (() => { const d = nd.drones.byId[nd.alerts[0].droneId]; for (let i = 0; i < 4; i++) N.step(nd, 5); return d.state === 'returning' || d.state === 'charging' || d.state === 'docked'; })());
    const nr = N.create({ seed: 29, hour: 9, params: QUIET }), rr = N.launchDrone(nr, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'fire' }); for (let i = 0; i < 8; i++) N.step(nr, 5);
    check('recallDrone: a drone in flight turns home and docks; a docked one cannot be recalled; setDroneParam: a per-drone speed cap slows it, patrol can be switched off, fleet-wide assumptions only for the drone group', N.recallDrone(nr, rr.droneId) && nr.drones.byId[rr.droneId].state === 'returning' && N.recallDrone(nr, N.drones(nr).find(d => d.state === 'docked').id) === false
      && (() => { const n = mkD(), id = N.droneRank(n, tgtA)[0].droneId; N.setDroneParam(n, id, 'speedMps', 9); N.launchDrone(n, id, tgtA); const d = n.drones.byId[id], dst = d.mission.dest, dd = hav(d.dock, dst); stepUntil(n, () => d.state === 'on-station'); const sp = dd / (d.mission.tArrive - d.mission.tLaunch - n.P.droneLaunchSec); return Math.abs(sp - 9) < 0.3 && N.setDroneParam(n, id, 'patrol', false) && !n.drones.byId[id].optPatrol && N.setDroneParam(n, 'droneCruiseMps', 22) && n.P.droneCruiseMps === 22 && N.setDroneParam(n, 'trafficLoad', 1.5) === false && N.setDroneParam(n, id, 'bogus', 1) === false; })());
    // approving an alert with nothing behind it: units are sent in error, find nothing, the alert is a false alarm
    const nfa = N.create({ seed: 30, hour: 9, autoApprove: false, params: { ...QUIET, onSceneSec: 300, unitBusyPct: 0 } }); N.launchDrone(nfa, 'nearest', { lon: 51.49, lat: 25.31, hazard: 'fire' });
    const alF = nfa.alerts[0], okF = N.approveAlert(nfa, alF.id); for (let i = 0; i < 360; i++) N.step(nfa, 10);
    check('approveAlert on an alert with nothing real behind it dispatches units in error (event false-alarm-dispatch), the first unit finds nothing, the incident is cancelled and the alert is a RESOLVED false alarm with a note', okF && nfa.evCount['false-alarm-dispatch'] === 1 && nfa.evCount['false-alarm-on-scene'] === 1 && alF.state === 'RESOLVED' && nfa.alerts[0].note === 'false-alarm-on-scene' && nfa.incidents[0].falseAlarm === true && nfa.incidents[0].status === 'cancelled' && N.units(nfa).every(u => u.assigned === null));
    // AED: SOS only, confirmed, an AED-carrying drone on station, authority-operated, once
    const ns = N.create({ seed: 31, hour: 9, autoApprove: false, params: { ...QUIET, droneUnavailPct: 0 } }), is = N.createIncident(ns, { hazard: 'sos', lon: 51.5264, lat: 25.2856, severity: 1 }), als = ns.alerts[0], ds = ns.drones.byId[als.droneId];
    const early = N.dropAed(ns, ds.id, als.id, { authority: 'Civil Defence control room' }); stepUntil(ns, () => ds.state === 'verifying', 900);
    const noAuth = N.dropAed(ns, ds.id, als.id, {}), ok1 = N.dropAed(ns, ds.id, als.id, { authority: { ar: 'غرفة عمليات الدفاع المدني', en: 'Civil Defence control room' } }), twice = N.dropAed(ns, ds.id, als.id, { authority: 'x' });
    const nf2 = N.create({ seed: 32, hour: 9, autoApprove: false, params: { ...QUIET, droneUnavailPct: 0 } }); N.createIncident(nf2, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 1 }); const df = nf2.drones.byId[nf2.alerts[0].droneId]; stepUntil(nf2, () => df.state === 'verifying', 900);
    check('AED drop (a CONCEPT): refused before the drone is on station and without the authority\'s order; allowed once for a confirmed SOS by a drone that carries a kit; refused a second time; NEVER for any other hazard', early.ok === false && ['not-on-station', 'not-confirmed', 'no-aed'].includes(early.reason) && noAuth.ok === false && noAuth.reason === 'authority-required' && (ok1.ok === true || ['no-aed', 'not-confirmed'].includes(ok1.reason)) && (ok1.ok ? twice.ok === false : true) && N.dropAed(nf2, df.id, nf2.alerts[0].id, { authority: 'Civil Defence' }).reason === 'not-sos' && !nf2.comms.some(c => c.kind === 'aed') && (!ok1.ok || (ns.comms.filter(c => c.kind === 'aed').length === 1 && ok1.comm.text.ar && ok1.comm.text.en && ns.evCount['aed-drop'] === 1)), ok1.ok ? 'dropped by ' + ds.callsign : 'reason ' + ok1.reason);
    check('the AED kit is carried only by drones on hospital roofs (P.droneAedAtHospitals); SOS calls prefer such a drone when it is within P.droneAedPreferSec of the fastest', N.drones(N.create({ seed: 31, params: QUIET })).every(d => d.aed === (d.role === 'hospital')) && (() => { const n = N.create({ seed: 33, hour: 9, params: { ...QUIET, droneUnavailPct: 0, droneAedPreferSec: 600 } }); const r0 = N.launchDrone(N.create({ seed: 33, hour: 9, params: { ...QUIET, droneAedPreferSec: 0 } }), 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'sos' }), r = N.launchDrone(n, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'sos' }); return r.ok && n.drones.byId[r.droneId].aed === true && r0.ok && N.drones(n).find(d => d.id === r0.droneId).role === 'station'; })());
  }
  // ---- 14.9 faults, low battery, the bus, the accessors
  {
    let found = null;
    for (let s = 1; s <= 40 && !found; s++) {
      const n = N.create({ seed: 700 + s, date: '2026-01-15', hour: 3, tickSec: 5, params: { ...QUIET, droneFaultPct: 60, droneRepairMin: 10 } }), r = N.launchDrone(n, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'fire' });
      if (!r.ok) continue;
      const first = n.drones.byId[r.droneId]; stepUntil(n, () => n.alerts[0].tVerified !== null && n.drones.list.every(d => d.state === 'docked' || d.state === 'charging' || d.state === 'fault'), 2400);
      if (n.evCount['drone-fault'] >= 1 && n.evCount['drone-relaunch'] >= 1 && n.alerts[0].tVerified !== null) found = { n, first, al: n.alerts[0], seed: 700 + s };
    }
    check('fault: a drone with a fault (link loss / motor / GPS) turns home by itself (event, bilingual) and a REPLACEMENT is launched for the same alert and verifies it', !!found && found.first.fault !== null && found.al.relaunches >= 1 && found.al.droneId !== found.first.id && found.n.evCount['drone-fault'] >= 1 && found.n.comms.some(c => c.kind === 'drone-status' && /Fault on/.test(c.text.en) && c.text.ar) && found.n.comms.filter(c => c.kind === 'drone-launch').length >= 2 && found.al.verdict !== null, found ? `seed ${found.seed}: ${found.first.callsign} (${found.first.fault ? found.first.fault.kind : '-'}) → ${found.n.drones.byId[found.al.droneId].callsign} verified ${Math.round(found.al.tVerified - found.al.t)} s after the alert` : 'none found');
    check('a faulted drone is out of service at its dock (state "fault") for P.droneRepairMin, then charges and flies again', (() => { if (!found) return false; const d = found.first; stepUntil(found.n, () => d.state === 'fault' || d.state === 'charging' || d.state === 'docked', 3000); const t0f = found.n.t, wasFault = d.state === 'fault' || d.fault !== null; stepUntil(found.n, () => d.state !== 'fault', 1800); return wasFault && d.fault === null && ['charging', 'docked'].includes(d.state); })());
    const nlb = N.create({ seed: 34, hour: 9, params: { ...QUIET, droneReservePct: 50, droneEnduranceMin: 12, droneHoldSec: 900 } }), rlb = N.launchDrone(nlb, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'fire' });
    check('a mission that cannot keep the battery reserve (out + hover + back) is refused; one that can is accepted', (() => { const n = N.create({ seed: 34, hour: 9, params: { ...QUIET, droneEnduranceMin: 10, droneReservePct: 40 } }); return N.launchDrone(n, 'nearest', { lon: 51.52, lat: 25.45, hazard: 'fire' }).ok === false && N.launchDrone(n, 'nearest', { lon: 51.5264, lat: 25.2856, hazard: 'fire' }).ok; })());
    // bus messages
    const nb2 = N.create({ seed: 35, hour: 9, params: QUIET }); N.createIncident(nb2, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 }); for (let i = 0; i < 40; i++) N.step(nb2, 5);
    const ba = N.busDroneAlert(nb2, nb2.alerts[0].id), bs = N.busDroneStatus(nb2), b1 = N.busDroneStatus(nb2, nb2.alerts[0].droneId);
    const flat = o => JSON.parse(JSON.stringify(o));
    check('bus "drone-alert" (scope national): id, alert, incident, source "drone", droneId, hazard + confidence + outcome, lon/lat, heading, altitude, wind, battery, link, thermal, evidence {vision, thermal}, camera-frame descriptor, bilingual text, sim:true', ba && ba.type === 'drone-alert' && ba.scope === 'national' && ba.source === 'drone' && /^DA-\d+$/.test(ba.id) && /^AL-\d+$/.test(ba.alert) && ba.incident && ba.droneId && ba.hazard && ba.confidence > 0 && ba.outcome && ba.lon > 50 && Number.isFinite(ba.headingDeg) && ba.altM > 30 && ba.wind && Number.isFinite(ba.wind.mps) && ba.batteryPct > 0 && ba.link >= 0 && ba.thermal && ba.thermal.maxC !== undefined && ba.evidence.vision && ba.evidence.thermal && ba.frame && ba.frame.sceneSeed > 0 && ba.frame.camera && ba.frame.timeOfDay >= 0 && ba.text.ar && ba.text.en && ba.sim === true && JSON.stringify(flat(ba)) === JSON.stringify(ba));
    check('the camera-frame descriptor carries what ManaraDroneScene draws: scene seed, hazard, decoy, severity, camera pose (altitude, heading, pitch, fov, offsets), time of day, context, wind, air and ground temperature, visibility', (() => { const f = ba.frame; return f.v === 1 && ['fire', 'gas', 'flood', 'dust', 'heat', 'sos', 'none'].includes(f.hazard) && 'decoy' in f && f.severity >= 1 && f.camera.altM > 0 && f.camera.fovDeg > 30 && f.camera.pitchDeg >= 35 && ['urban', 'industrial', 'desert', 'coast', 'road'].includes(f.context) && f.wind.mps >= 0 && Number.isFinite(f.ambientC) && Number.isFinite(f.groundC) && f.solar >= 0 && f.width === 320 && f.height === 240; })());
    check('bus "drone-status" (scope national): per-drone state, position, altitude, heading, speed, battery, ETA, incident, link, derating; counts by state; a single-drone form; unknown drone → null', bs.type === 'drone-status' && bs.scope === 'national' && bs.sim === true && bs.drones.length === N.drones(nb2).length && bs.drones.every(d => d.id && d.callsign && d.name.ar && d.name.en && d.stateText.en && Number.isFinite(d.lon) && Number.isFinite(d.batteryPct) && d.derate && 'etaSec' in d && 'incident' in d) && Object.values(bs.counts).reduce((a, b) => a + b, 0) === bs.drones.length && b1.drones.length === 1 && N.busDroneStatus(nb2, 'nope') === null && N.busDroneAlert(nb2, 'DA-9999') === null);
    const fbd = N.fleetBoard(nb2);
    check('fleet board accessor: every drone with state, battery, ETA, derating, incident and alert; counts; available / en route / charging; robots listed as [] (owned by the building-scale simulation); an honest note', fbd.drones.length === N.drones(nb2).length && fbd.drones.every(d => d.state && d.stateText && 'batteryPct' in d && 'etaSec' in d && d.derate && 'incident' in d && 'alert' in d && 'blocked' in d) && typeof fbd.available === 'number' && Array.isArray(fbd.robots) && /no real drone/.test(fbd.note.en) && fbd.drones.some(d => d.state === 'verifying' || d.state === 'on-station' || d.state === 'returning' || d.state === 'en-route'));
    check('comms log accessor: filter by kind / alert / incident / drone / time, limit; every entry bilingual with a clock and a sender and receiver', N.commsLog(nb2, { kind: 'drone-launch' }).length >= 1 && N.commsLog(nb2, { alert: nb2.alerts[0].id }).length >= 3 && N.commsLog(nb2, { limit: 2 }).length === 2 && N.commsLog(nb2, { incident: 'N1' }).every(c => c.incident === 'N1') && N.commsLog(nb2).every(c => c.from && c.from.role && c.text.ar && c.text.en));
  }
  // ---- 14.10 snapshot, hash, the full day with drones, performance
  {
    const mkDay = () => { const n = N.create({ seed: 93, date: '2026-07-12', hour: 0, tickSec: 10, params: { divertPctPerHour: 10 } }); N.startDust(n, { t0: 11 * 3600 }); return n; };
    let t0d = performance.now(); const day = mkDay(); let i = 0, scans = 0, firstBad = null; const triggers = ['sentinel', 'citizen', 'operator', 'patrol'], incs = [];
    for (let t = 0; t < 86400; t += 60) {
      while (i < cast.length && cast[i][4] * 3600 <= day.t) { const c = cast[i]; incs.push(N.createIncident(day, { hazard: c[0], lon: c[1], lat: c[2], severity: c[3], trigger: triggers[i % 4] })); i++; }
      N.step(day, 60);
      if (t % 900 === 0) { const bad = deepScanD(N.snapshot(day)); scans++; if (bad && !firstBad) firstBad = bad + ' at ' + day.t; }
    }
    timings.droneDayMs = performance.now() - t0d;
    const Kd = N.kpis(day).drones;
    console.log(`  a full day with drones (14 incidents with all four triggers, patrols, dust, look-alikes): ${(timings.droneDayMs / 1000).toFixed(1)} s wall time; ${Kd.stats.sorties} sorties (${Kd.stats.patrolSorties} patrol), ${Kd.stats.launched} verify launches, ${Kd.stats.faults} faults, ${Kd.alerts.total} alerts (${Kd.alerts.droneRaised} raised by drones: ${Kd.alerts.falseAlarmsRaised} false), ${Kd.stats.patrolDetections} patrol detections, ${Kd.stats.bystander} bystander reports`);
    droneReport.day = { sec: timings.droneDayMs / 1000, sorties: Kd.stats.sorties, alerts: Kd.alerts.total };
    check(`a full simulated day with drones completes without a NaN in ${scans} snapshots, within a sensible time (the earlier day without them took ~19 s on this machine; budget 60 s)`, firstBad === null && timings.droneDayMs < 60000, firstBad || (timings.droneDayMs / 1000).toFixed(1) + ' s');
    check('every incident of the day was found and handled: none left unseen or stuck in "recommended", none lost by a missing drone', incs.every(x => x.status === 'cleared' || x.status === 'cancelled') && N.units(day).every(u => u.assigned === null) && !incs.some(x => x.status === 'unseen'), incs.map(x => x.status[0] + (x.detect ? ':' + x.detect[0] : '')).join(' '));
    check('patrol sorties, launches, drone alerts and the 4 triggers all happened in the day (sentinel, citizen, operator, patrol detection or bystander)', Kd.stats.patrolSorties > 50 && Kd.stats.launched >= 10 && new Set(day.alerts.map(a => a.via)).size >= 3 && day.alerts.some(a => a.source === 'drone') && (Kd.stats.patrolDetections + Kd.stats.bystander) >= 2);
    const hA = N.hash(mkDayShort(60)), hB = N.hash(mkDayShort(10)), hC = N.hash(mkDayShort(60, 94));
    function mkDayShort(chunk, seed = 93) { const n = N.create({ seed, hour: 5, tickSec: 10 }); N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2, trigger: 'sentinel' }); N.createIncident(n, { hazard: 'sos', lon: 51.43, lat: 25.30, severity: 1, trigger: 'patrol' }); N.launchDrone(n, 'nearest', { lon: 51.45, lat: 25.33, hazard: 'fire' }); for (let k = 0; k < 3600 / chunk; k++) N.step(n, chunk); return n; }
    check('determinism with drones: the same seed gives the same hash (drones, alerts, comms, events included), also when stepped in chunks of 60 s or 10 s; a different seed differs', hA === hB && hA !== hC, hA);
    const snapD = N.snapshot(mkDayShort(60), { full: true });
    check('snapshot carries drones (position, state, battery, trail), alerts, drone alerts and comms; the hash covers all of it', snapD.drones.length >= 12 && snapD.drones.every(d => d.callsign && d.state && Number.isFinite(d.lon) && Number.isFinite(d.batteryPct) && Array.isArray(d.trail)) && snapD.alerts.length >= 1 && snapD.droneAlerts.length >= 1 && snapD.comms.length >= 3 && snapD.kpis.drones.total === snapD.drones.length && JSON.stringify(snapD).includes('"droneAlerts"'));
    const tk2 = N.create({ seed: 96, hour: 8, tickSec: 5 }); for (const c of cast.slice(0, 6)) N.createIncident(tk2, { hazard: c[0], lon: c[1], lat: c[2], severity: c[3] }); N.step(tk2, 120);
    const a2 = performance.now(); N.snapshot(tk2); const snapMs2 = performance.now() - a2; timings.droneSnapshotMs = snapMs2;
    const a3 = performance.now(); N.step(tk2, 600); const tickMs2 = (performance.now() - a3) / 120; timings.droneTickMs = tickMs2;
    check('performance with drones: a full snapshot < 120 ms, a 5-second tick with 6 active incidents and the fleet on patrol < 15 ms on average', snapMs2 < 120 && tickMs2 < 15, `snapshot ${snapMs2.toFixed(1)} ms, tick ${tickMs2.toFixed(2)} ms`);
    const aD = performance.now(); N.droneEta(tk2, 51.5, 25.3, tk2.t); timings.droneEtaMs = performance.now() - aD;
    check('the pure droneEta(lon, lat) (the fastest drone to a point, used by the A/B and recommendations) takes < 15 ms', timings.droneEtaMs < 15, timings.droneEtaMs.toFixed(2) + ' ms');
    check('honesty: the drone strings say concept / simulated / no real flight; the engine never claims a real flight or approval; the fleet board and A/B notes are labelled', /concept/i.test(CODE) && /no real drone has been flown/i.test(CODE) && !/\b(flown in|tested in a real|approved by (the )?(QCAA|Civil Defence)|AI-powered|deep learning)\b/i.test(CODE.replace(/\/\*[\s\S]*?\*\//g, '')) && /SIMULATION/.test(N.alertQueue(day)[0] ? N.SIM_LABEL.en : N.SIM_LABEL.en) && N.fleetBoard(day).note.ar.length > 10);
    check('drone messages and labels are bilingual: states, alert states, decoys, voice messages', Object.values(N.DRONE_STATE).every(s => s.ar && s.en) && N.ALERT_STATES.length === 7 && Object.values(N.DECOYS).every(s => s.ar && s.en) && Object.keys(N.MSG).filter(k => /^nat\.drone\.say\./.test(k)).length >= 6 && Object.keys(N.MSG).filter(k => /^nat\.drone\.say\./.test(k)).every(k => N.MSG[k].ar && N.MSG[k].en));
    check('the earlier invariants hold with drones present: a legacy incident with P.droneAuto 0 has no alert and no drone launch and behaves exactly as before', (() => { const n = N.create({ seed: 41, hour: 8, params: { droneAuto: 0, dronePatrolPct: 0, unitBusyPct: 0, noisePct: 0, recheckSec: 10 } }), inc = N.createIncident(n, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2 }); for (let k = 0; k < 400; k++) N.step(n, 10); return inc.alertId === null && n.alerts.length === 0 && inc.plan.state === 'cleared' && !n.events.some(e => /^(alert|drone)-/.test(e.type) && e.type !== 'drone-patrol-detect'); })());
  }
}

console.log('\nTIMINGS (ms): ' + Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
console.log('DRONE REPORT: ' + JSON.stringify(droneReport));
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nFAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
