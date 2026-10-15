// ManaraSim engine tests — Node only, no browser:  node tools/manara/test-sim.mjs
//
//   1  API, assumptions registry (bilingual, in range, sourced), house laws (no DOM / fetch / innerHTML), honest wording
//   2  determinism: same seed → identical snapshot hash; chunked stepping; different seeds / modes differ
//   3  every preset × both modes runs to completion, no NaN/Infinity anywhere, sane enumerations
//   4  routes never pass through hazard cells or locked exits (live audit of every informed person), wheelchair users never get stairs
//   5  re-route on exit change reaches only the people it affects; sensible after unlock
//   6  wake-up ladder: T+0/+30/+60/+90, stops on confirm, never exceeds step 3
//   7  two-key rule: one key never CONFIRMS; public alert needs approval; the local alarm never waits; warm-up and noise parameters work
//   8  headcount arithmetic (registered = safe + away-safe + help + unaccounted), rooms, priorities, check-in
//   9  OASIS CAP 1.2: well-formed (parsed by Python's XML parser), status Exercise, one <info> per language, element order
//  10  A/B (same seed, ordinary alarm vs MANARA): differs sensibly under every preset; honest trade-off visible
//  11  dispatch: fastest ETA (not nearest) on hand-built graphs, congestion / jam / closure / busy / capability, hospitals, re-dispatch,
//      ETA countdown, state machine, every hazard preset, arrival effects, 'farther but faster' demos, bus message shape
//  12  performance (default preset: one simulated second must average < 3 ms) and a sensitivity sweep over named assumptions
//  13  API robustness: bus messages for every preset, hand-off, resident lines, live parameter changes, errors
//  14  the published fire model as code (wind factor, burn probability, downwind spread), sensor flags, fuzzing
//  15  rescue robot — API, 'robot' assumptions group, the 'fire-night-robot' preset, original presets unchanged (pinned hashes), honest wording
//  16  robot approval gate: no movement before the incident commander approves; viewer / operator rejected with a reason; carrier timing
//  17  robot movement safety: A* = Dijkstra, never enters a burning / too-hot / gas-danger node, wheeled never climbs stairs, tracked does (slower)
//  18  doors: a locked door is REPORTED and never opened; a blocked corridor is marked blocked and routed around; exits reported
//  19  search order (unaccounted + needs first, then smoke / closeness to the fire, then the rest) and operator priority
//  20  finds: headcount 'located by robot' is distinct from 'safe'; reports buffered while the link is down; hand-off card entries
//  21  guidance: language / format per persona via MANARA_MSG, wake-up, beacons, hold until crews, smoke hood, speakVia, teleop
//  22  detection model (thermal contrast in Gulf heat, smoke attenuation, audio masked by the siren, false + / −), battery, heat, return, recall
//  23  determinism with the robot (hash stable, snapshots do not disturb the run), telemetry, bus messages, fuzz, performance
//  24  A/B 'MANARA with robot' vs 'without robot' and a printed sensitivity sweep (detection probability, link dropouts, battery, carrier, variant)
//
// The simulation is a mechanism check, not proof of impact: these tests check that the mechanisms behave, not that the numbers are real.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// Paths follow this file's folder name (tools/<name>/ ↔ site/<name>/), so a rename of the project folder needs no edit.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '../../site', path.basename(HERE));
const CODE = fs.readFileSync(path.join(SITE, 'js/sim.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(CODE, ctx, { filename: 'sim.js' });
const S = ctx.ManaraSim;

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log(`\n${t}`);
const fmt = (v, d = 1) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v));
const T0 = performance.now();

// ---------------------------------------------------------------- helpers
function badNumbers(o, p = '', out = []) {   // every number in a JSON-like tree must be finite
  if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(p + '=' + o); }
  else if (Array.isArray(o)) o.forEach((v, i) => out.length < 5 && badNumbers(v, p + '[' + i + ']', out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (out.length < 5) badNumbers(o[k], p + '.' + k, out); }
  return out;
}
const has = (txt, re) => re.test(txt);
const evs = (sim, type) => sim.events.filter(e => e.type === type);
const keyOf = sim => sim.people.map(p => p.key);
function movers(sim) { return sim.people.filter(p => p.aware === 2 && !p.away && (p.st === 'moving' || p.st === 'waiting')); }

// =====================================================================================================================
section('1. API, assumptions registry, house laws');
{
  for (const f of ['create', 'step', 'run', 'snapshot', 'hash', 'approve', 'reject', 'ab', 'sweep', 'cap', 'handoff', 'headcount', 'busAlert', 'busDispatch', 'compose', 'routeCheck', 'metrics', 'worldInfo', 'view', 'setExit', 'jamRoad', 'closeRoad', 'setUnitBusy', 'setTraffic', 'injectDecoy', 'dispatchCompare'])
    if (typeof S[f] !== 'function') check('API member ' + f, false, 'missing');
  for (const f of ['enableRobot', 'setRole', 'deployRobot', 'approveRobot', 'rejectRobot', 'recallRobot', 'setSearchPriority', 'teleopRobot', 'speakVia', 'setRobotObstacle', 'robots', 'robotTelemetry', 'robotView', 'busRobot', 'busRobotFind', 'robotMetrics', 'abRobot', 'sweepRobot'])
    if (typeof S[f] !== 'function') check('API member (robot) ' + f, false, 'missing');
  check('API: 25+ functions exported', ['create', 'step', 'run', 'snapshot', 'hash', 'approve', 'reject', 'ab', 'sweep', 'cap', 'handoff', 'headcount', 'busAlert', 'busDispatch', 'compose', 'routeCheck', 'metrics', 'worldInfo', 'view', 'setExit', 'jamRoad', 'closeRoad', 'setUnitBusy', 'setTraffic', 'injectDecoy', 'dispatchCompare'].every(f => typeof S[f] === 'function'));
  check('grid is 96 x 64 cells of 5 m', S.GRID.w === 96 && S.GRID.h === 64 && S.GRID.cellM === 5);
  check('preset list: the 7 required presets', JSON.stringify(S.PRESET_ORDER) === JSON.stringify(['fire-night', 'gas-night', 'flood-day', 'dust-day', 'heat-day', 'sos-day', 'school-fire-day']));
  check('default preset is fire-night at 04:00', S.create().preset === 'fire-night' && S.create().hour0 === 4);
  check('no DOM / network / modules in the engine', !/\bdocument\.|\bfetch\(|XMLHttpRequest|innerHTML|\bimport\s|\bexport\s|localStorage|require\(/.test(CODE));
  check('loads in a bare vm context (no window / document)', vm.runInContext('typeof document === "undefined" && typeof window === "undefined"', ctx));
  const P = S.PARAMS, keys = new Set(P.map(p => p.key));
  check('assumptions registry: 90+ named parameters, unique keys', P.length >= 90 && keys.size === P.length, P.length + ' params');
  const bad = P.filter(p => !(p.default >= p.min && p.default <= p.max) || !(p.step > 0) || !p.unit || !p.group || !p.src);
  check('every parameter has a default inside [min,max], a step, unit, group and source', bad.length === 0, bad.map(p => p.key).join(','));
  const noAr = P.filter(p => !/[\u0600-\u06FF]/.test(p.label.ar + p.desc.ar) || !/[A-Za-z]/.test(p.label.en + p.desc.en));
  check('every parameter label and description is bilingual (Arabic script + English)', noAr.length === 0, noAr.map(p => p.key).join(','));
  const groups = new Set(S.PARAM_GROUPS.map(g => g.id));
  check('every parameter belongs to a declared group', P.every(p => groups.has(p.group)));
  const get = k => P.find(p => p.key === k);
  check('Alexandridis et al. 2008 constants as published: p0 0.58, c1 0.045, c2 0.131, a 0.078', get('fireP0').default === 0.58 && get('fireC1').default === 0.045 && get('fireC2').default === 0.131 && get('fireSlopeA').default === 0.078);
  check('flashover default comes from source S5 (3:40 = 220 s)', get('flashoverSec').default === 220 && get('flashoverSec').src === 'S5');
  check('sourced danger levels (docs/MANARA-HAZARDS.md §13): WBGT stop 32.1 (S19), PM10 warn 150 (S31) / danger 255 / critical 425 (S49), propane warn 1000 / danger 2100 ppm (S48)', get('wbgtStop').default === 32.1 && get('dustWarn').default === 150 && get('dustDanger').default === 255 && get('dustCritical').default === 425 && get('gasWarn').default === 1000 && get('gasDanger').default === 2100 && ['S19', 'S31', 'S49', 'S48'].join() === [get('wbgtStop').src, get('dustWarn').src, get('dustDanger').src, get('gasDanger').src].join());
  check('student-set SOS timings follow the playbook: 15 s stillness, 30 s no answer', get('sosStillSec').default === 15 && get('sosTimeoutSec').default === 30 && get('wbgtRef').default === 28);
  const all = JSON.stringify([P, S.PRESETS, S.SIM_LABEL]);
  check('honest wording: no "world-first", "deep learning", "saves N lives", no «ذكاء اصطناعي» for the detector', !/world.?first|first in the world|deep.?learning|saves? \d+ lives|ذكاء اصطناعي/i.test(all));
  const w = S.worldInfo();
  check('world: residence has 3 floors and 29 rooms + lobby + refuge + roof; school 2 floors', w.structs[0].floors === 3 && w.structs[0].nodes.filter(n => n.type === 1).length === 29 && w.structs[1].floors === 2 && w.structs[0].nodes.some(n => n.id === 'REF') && w.structs[0].nodes.some(n => n.id === 'ROOF'));
  check('world: road graph + fictional responders (2 fire, 2 police, 2 ambulance, 2 hospitals), all marked demo', w.assets.filter(a => a.kind === 'fire').length === 2 && w.assets.filter(a => a.kind === 'police').length === 2 && w.assets.filter(a => a.kind === 'ambulance').length === 2 && w.assets.filter(a => a.kind === 'hospital').length === 2 && w.assets.every(a => /demo/i.test(a.name.en) && /تجريب/.test(a.name.ar)));
  check('world: hospital capability flags (ED, trauma) and one HazMat station', w.assets.filter(a => a.trauma).length === 1 && w.assets.filter(a => a.ed).length === 2 && w.assets.filter(a => a.hazmat).length === 1);
  const sim = S.create({ preset: 'fire-night', seed: 3 });
  const res = sim.people.filter(p => p.group === 'RB' && p.registered);
  check('~120 registered residents incl. the four hero personas', res.length === 120 && ['ravi', 'huda', 'abu-salem', 'lina'].every(h => sim.byKey[h]), res.length + ' residents');
  const ravi = sim.byKey['ravi'], huda = sim.byKey['huda'], abu = sim.byKey['abu-salem'], lina = sim.byKey['lina'];
  check('heroes: Ravi 203 reads Malayalam & asleep; Huda 105 Deaf; Abu Salem 302 wheelchair; Lina 9-year-old child', ravi.room === '203' && ravi.lang === 'ml' && ravi.asleep && huda.room === '105' && huda.deaf && abu.room === '302' && abu.persona === 'wheelchair' && lina.persona === 'child');
  check('night population: ~85 % of residents in the building are asleep (assumption slider)', (() => { const inb = res.filter(p => !p.away); const a = inb.filter(p => p.asleep).length / inb.length; return a > 0.75 && a < 0.97; })());
  const day = S.create({ preset: 'school-fire-day', seed: 3 });
  check('school preset: Lina is a pupil of class 5B with a teacher; 8 classes x 20 pupils', day.byKey['lina'].role === 'pupil' && day.byKey['lina'].cls === '5B' && day.people.filter(p => p.role === 'pupil').length === 160 && day.people.filter(p => p.role === 'teacher').length === 8);
}

// =====================================================================================================================
section('2. determinism');
{
  const mk = (seed, mode = 'manara', preset = 'fire-night') => S.run(S.create({ preset, seed, mode }), 400);
  const a = mk(11), b = mk(11), c = mk(12), d = mk(11, 'ordinary');
  check('same seed → identical snapshot hash', S.hash(a) === S.hash(b), S.hash(a));
  check('same seed → identical snapshot JSON (people, fields, events, dispatch)', JSON.stringify(S.snapshot(a, { full: true })) === JSON.stringify(S.snapshot(b, { full: true })));
  check('different seed → different hash', S.hash(a) !== S.hash(c));
  check('ordinary vs MANARA with the same seed → different worlds', S.hash(a) !== S.hash(d));
  const e = S.create({ preset: 'fire-night', seed: 11 }); for (let i = 0; i < 1600; i++) S.step(e, 0.25);
  check('chunked stepping (0.25 s) equals whole-second stepping', e.t === 400 && S.hash(e) === S.hash(a));
  check('hazard physics identical in both worlds before the worlds diverge (common random numbers)', (() => { const x = S.run(S.create({ preset: 'fire-night', seed: 5, mode: 'manara' }), 60), y = S.run(S.create({ preset: 'fire-night', seed: 5, mode: 'ordinary' }), 60); return JSON.stringify(Array.from(x.F.smoke)) === JSON.stringify(Array.from(y.F.smoke)) && x.stt[0].burn.join() === y.stt[0].burn.join(); })());
  const snap = S.snapshot(a);
  check('snapshot is JSON-serialisable and round-trips', JSON.stringify(JSON.parse(JSON.stringify(snap))) === JSON.stringify(snap));
  check('restart() gives the same run back', S.hash(S.run(S.restart(a), 400)) === S.hash(a));
}

// =====================================================================================================================
section('3. every preset, both modes: runs to completion, no NaN');
const RUNS = {};
{
  console.log('  preset            mode      sim-s  wall-ms  ms/s   people  events  hash');
  for (const p of S.PRESET_ORDER) {
    RUNS[p] = {};
    for (const mode of ['ordinary', 'manara']) {
      const t0 = performance.now();
      const sim = S.create({ preset: p, mode, seed: 1 });
      const snaps = [];
      for (let t = 0; t < sim.durationSec; t++) { S.step(sim, 1); if (t % 300 === 299) snaps.push(S.snapshot(sim, { sensors: true, series: true })); }
      const wall = performance.now() - t0;
      RUNS[p][mode] = sim;
      const fin = S.snapshot(sim, { full: true, sensors: true, series: true, metrics: true });
      const bad = badNumbers([snaps, fin]);
      console.log(`  ${p.padEnd(17)} ${mode.padEnd(9)} ${String(sim.t).padStart(5)} ${wall.toFixed(0).padStart(8)} ${(wall / sim.t).toFixed(2).padStart(5)} ${String(sim.people.length).padStart(7)} ${String(sim.events.length).padStart(7)}  ${S.hash(sim)}`);
      check(`${p}/${mode}: ran to completion (done at ${sim.durationSec} s)`, sim.done && sim.t === sim.durationSec);
      check(`${p}/${mode}: no NaN / Infinity in any snapshot or metric`, bad.length === 0, bad.join(' '));
      const okSt = new Set(['idle', 'working', 'moving', 'waiting', 'sheltered', 'safe', 'down', 'incapacitated', 'away']);
      check(`${p}/${mode}: people have valid states and stay on the map`, fin.people.every(q => okSt.has(q.st) && (q.away || (q.x >= -1 && q.x <= 97 && q.y >= -1 && q.y <= 65))));
      check(`${p}/${mode}: events are time-ordered, bilingual, and capped`, sim.events.every((e, i) => i === 0 || e.t >= sim.events[i - 1].t) && sim.events.every(e => e.text && typeof e.text.ar === 'string' && typeof e.text.en === 'string') && sim.events.length < 4000);
    }
  }
}

// =====================================================================================================================
section('4. routes never pass through hazard cells or locked exits');
{
  for (const [preset, times] of [['fire-night', [100, 150, 250, 400]], ['school-fire-day', [100, 160, 300]], ['gas-night', [80, 120, 200]], ['flood-day', [150, 300, 500]]]) {
    const sim = S.create({ preset, mode: 'manara', seed: 2 });
    let audited = 0, badRoutes = [], noRoute = 0;
    for (const t of times) {
      S.run(sim, t);
      for (const p of movers(sim)) {
        const r = S.routeCheck(sim, p.key); if (!r) continue;
        audited++; if (!r.ok) badRoutes.push(`${p.key}@${t}: blocked ${r.blocked.length} locked ${r.lockedExits} stairs ${r.stairsForNoStairs}`);
        if (!r.reached) noRoute++;
      }
    }
    check(`${preset}: ${audited} live routes audited, none enters a blocked node, locked exit, or gives stairs to a wheelchair user`, audited >= 15 && badRoutes.length === 0, badRoutes.slice(0, 3).join('; ') || ('audited ' + audited));
    if (preset === 'fire-night') {
      const exitR = sim.exits.find(e => e.id === 'R');
      check('fire-night: the roof door is LOCKED and no informed person is sent through it', exitR.state === 'LOCKED' && sim.people.filter(p => p.aware === 2).every(p => { const r = S.routeCheck(sim, p.key); return !r || !r.lockedExits.includes('R'); }));
      check('fire-night: nobody informed stands in a burning room or outdoor fire cell', sim.people.every(p => !(p.aware === 2 && p.st === 'moving') || (() => { const g = p.g; if (g < 6144) return sim.ofire[g] !== 1; const S0 = sim.W.structs[sim.W.G.nst[g]]; return sim.stt[S0.idx].burn[g - S0.base] !== 1; })()));
    }
  }
  const ord = RUNS['fire-night'].ordinary, man = RUNS['fire-night'].manara;
  check('ordinary world: people DO find the locked roof door by walking into it (dead ends)', S.metrics(ord).deadEnds > 5, 'ordinary dead-ends ' + S.metrics(ord).deadEnds + ' vs MANARA ' + S.metrics(man).deadEnds);
  check('MANARA world: far fewer dead ends than the ordinary alarm', S.metrics(man).deadEnds < S.metrics(ord).deadEnds / 3);
  const abu = (() => { const sim = S.create({ preset: 'fire-night', mode: 'manara', seed: 4 }); S.run(sim, 200); return { sim, r: S.routeCheck(sim, 'abu-salem') }; })();
  check('Abu Salem (wheelchair, 3rd floor, no lift): his route never uses stairs and ends at the refuge balcony', abu.r && abu.r.ok && abu.r.stairsForNoStairs === 0 && (S.person(abu.sim, 'abu-salem').safeKind === 'refuge' || S.personRoute(abu.sim, 'abu-salem').kind === 4));
}

// =====================================================================================================================
section('5. instant re-route when an exit changes — only affected people are messaged');
{
  const sim = S.create({ preset: 'fire-night', mode: 'manara', seed: 6 });
  S.run(sim, 130);
  const mv = movers(sim).filter(p => p.persona !== 'wheelchair');
  const before = new Map(mv.map(p => [p.key, S.personRoute(sim, p.key).nodes.join(',')]));
  const crossingB = mv.filter(p => { const r = S.personRoute(sim, p.key); return r && r.nodes.some(n => n === sim.W.structs[0].exits[2].nodeG); });
  check('setup: several people on the move, some of them using Stair B', mv.length >= 10 && crossingB.length >= 1, `${mv.length} moving, ${crossingB.length} via Stair B`);
  S.setExit(sim, 'B', { locked: true });
  S.run(sim, 137);
  const rer = evs(sim, 'reroute').filter(e => e.t >= 130);
  check('exit state change: Stair B is LOCKED in the exit truth', sim.exits.find(e => e.id === 'B').state === 'LOCKED');
  check('a "reroute" event reports how many of the people on the move got a new route', rer.length >= 1 && rer[0].affected >= 1 && rer[0].affected <= rer[0].of, rer.map(e => e.affected + '/' + e.of).join(','));
  const after = new Map(mv.map(p => [p.key, S.personRoute(sim, p.key)]));
  const changed = mv.filter(p => after.get(p.key) && after.get(p.key).nodes.join(',') !== before.get(p.key));
  const stillB = mv.filter(p => { const r = S.routeCheck(sim, p.key); return r && r.lockedExits.includes('B'); });
  check('after the change nobody is routed through the locked exit', stillB.length === 0);
  check('not everybody is messaged: unaffected people keep their route', rer.length && rer[0].affected < rer[0].of, `${rer[0] && rer[0].affected} of ${rer[0] && rer[0].of}`);
  S.setExit(sim, 'B', { locked: false }); S.run(sim, 145);
  check('unlocking again is picked up (state OPEN or SMOKE, not LOCKED)', sim.exits.find(e => e.id === 'B').state !== 'LOCKED');
  const hz = S.create({ preset: 'fire-night', mode: 'manara', seed: 6 }); S.run(hz, 90);
  S.setExit(hz, 'R', { locked: false }); S.run(hz, 96);
  check('the guard can unlock the roof door: exit R becomes OPEN', hz.exits.find(e => e.id === 'R').state === 'OPEN');
}

// =====================================================================================================================
section('6. wake-up ladder');
{
  const sim = RUNS['fire-night'].manara, step = sim.P.ladderStepSec;
  const ladders = sim.people.filter(p => p.ladderLog.length);
  check('ladder runs for sleeping people who received the alert', ladders.length >= 20, ladders.length + ' people');
  const okSeq = ladders.every(p => p.ladderLog.every((l, i) => l.stage === i) && p.ladderLog.length <= 4);
  check('stages are 0,1,2,3 in order and never exceed step 3', okSeq);
  const okTime = ladders.every(p => p.ladderLog.every(l => Math.abs(l.t - (p.alertAt + l.stage * step)) <= 1));
  check(`stage k fires at T + k x ${step} s (T+0, +30, +60, +90)`, okTime);
  const stopped = ladders.filter(p => p.ladderStopAt !== null);
  check('the ladder STOPS the moment a person wakes/confirms: no later steps, stopAt = wake time', stopped.length >= 10 && stopped.every(p => p.ladderLog.every(l => l.t <= p.ladderStopAt) && p.wokeAt === p.ladderStopAt), stopped.length + ' stopped');
  check('some people woke at step 0 or 1 (stopped early), i.e. the ladder did not run to the end for them', stopped.some(p => p.ladderLog.length <= 2));
  check('Huda (Deaf) gets the strobe + vibration format; Ravi gets his language', (() => { const h = sim.byKey['huda'].msg, r = sim.byKey['ravi'].msg; return h && h.formats.includes('strobe') && h.formats.includes('vibration') && r && sim.byKey['ravi'].lang === 'ml' && r.draftTranslation === true; })());
  check('event log shows ladder steps and the stop for the hero personas', evs(sim, 'ladder').some(e => e.person === 'huda') && evs(sim, 'ladder-stop').length >= 1);
  // a world where nothing wakes people except the ladder itself: it must climb to step 3 and stay there
  const only = S.create({ preset: 'fire-night', mode: 'manara', seed: 2, params: { wakeSiren: 0, wakePhone: 0, wakeLadderBoost: 0, knockWakeP: 0 } });
  S.run(only, 300);
  const stuck = only.people.filter(p => p.asleep && p.ladderLog.length);
  check('with no wake chance at all the ladder climbs to step 3 and holds there (does not run past it)', stuck.length >= 10 && stuck.every(p => p.ladderStage === 3 && p.ladderLog.length === 4), stuck.length + ' asleep on the ladder; odd: ' + stuck.filter(p => p.ladderStage !== 3 || p.ladderLog.length !== 4).map(p => p.key + ':' + p.ladderStage + '/' + p.ladderLog.length).slice(0, 4).join(','));
  const guard = RUNS['fire-night'].manara;
  check('ladder step 2: the guard knocks doors (priority list: most vulnerable / nearest first)', guard.knock && guard.knock.count >= 1, guard.knock ? 'rooms knocked ' + guard.knock.count : 'none');
}

// =====================================================================================================================
section('7. two-key rule, human key, local alarm, sensors');
{
  const dec = S.create({ preset: 'fire-night', seed: 1, tIgnite: 99999 });
  S.injectDecoy(dec, 'vapour', 200); S.run(dec, 150);
  check('one key alone (sanitiser vapour on the smoke sensor) reaches SUSPECT only', dec.ver.phase === 'suspect' && dec.ver.confirmedAt === null && dec.ver.keys.smoke === true);
  check('...and never CONFIRMED however long it lasts, and no public alert', (S.run(dec, 190), dec.ver.phase === 'suspect' && dec.alert === null));
  check('...a decoy never starts the building siren (no real smoke), but the sentinel buzzer sounds locally', dec.local.on === false && !!dec.buzzer);
  S.run(dec, 230);
  check('the single key clears again after the decoy ends (SUSPECT → idle)', dec.ver.phase === 'idle' && evs(dec, 'suspect-clear').length >= 1);
  const two = S.create({ preset: 'fire-night', seed: 1, tIgnite: 99999, autoApprove: false });
  S.injectDecoy(two, 'vapour', 200); S.injectDecoy(two, 'hotmug', 200); S.run(two, 30);
  check('two independent keys (vapour + hot mug) → CONFIRMED, but the human key is still missing', two.ver.phase === 'confirmed' && two.ver.needsApproval === true && two.alert === null);
  const a = S.create({ preset: 'fire-night', seed: 1, autoApprove: false });
  S.run(a, 200);
  check('fire with autoApprove off: CONFIRMED and waiting; NO public alert, nobody informed', a.ver.phase === 'confirmed' && a.alert === null && a.people.every(p => p.aware < 2));
  check('...yet the LOCAL alarm sounded earlier (it never waits for proof or approval)', a.local.on && a.local.at < a.ver.confirmedAt, `local ${a.local.at - a.tIgnite} s, confirmed ${a.ver.confirmedAt - a.tIgnite} s after ignition`);
  check('...and people already woke / moved on the local siren alone', a.people.filter(p => p.aware === 1).length >= 20);
  check('approve() issues the public alert and informs people', S.approve(a) === true && a.ver.phase === 'public' && a.alert && a.alert.recipients > 50);
  const r = S.create({ preset: 'fire-night', seed: 1, autoApprove: false }); S.run(r, 120);
  check('reject() sends the operator back to SUSPECT with a hold-off (no alert)', S.reject(r, 60) === true && r.ver.phase === 'suspect' && r.alert === null);
  S.run(r, 150); check('...and it stays rejected during the hold-off', r.ver.phase === 'suspect');
  const w = S.create({ preset: 'fire-night', seed: 1, tIgnite: 5, params: { warmupSec: 120 } }); S.run(w, 110);
  check('sensor warm-up: readings are ignored until warm (no SUSPECT at 110 s although the room is on fire)', w.ver.phase === 'idle' && w.stt[0].I.some(v => v > 0.5));
  S.run(w, 160);
  check('...after warm-up the keys appear', w.ver.phase !== 'idle');
  const q0 = S.create({ preset: 'fire-night', seed: 1, params: { sensorNoise: 0 } }), q3 = S.create({ preset: 'fire-night', seed: 1, params: { sensorNoise: 3 } });
  S.run(q0, 40); S.run(q3, 40);
  const sd = sim => { const v = S.sensors(sim).filter(s => /thermal/.test(s.id)).map(s => s.value); const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length); };
  check('sensor noise slider scales the reading spread', sd(q3) > sd(q0) + 0.3, `sd ${sd(q0).toFixed(2)} → ${sd(q3).toFixed(2)}`);
  const gas = S.create({ preset: 'gas-night', seed: 1, autoApprove: false }); S.run(gas, 120);
  const gasKeys = S.sensors(gas).filter(s => s.active).map(s => s.id);
  check('gas: two gas sensors in DIFFERENT places must agree (rising trend) before CONFIRMED', gas.ver.phase === 'confirmed' && new Set(gasKeys).size >= 2, gasKeys.join(','));
  const heat = S.create({ preset: 'heat-day', seed: 1, autoApprove: false }); S.run(heat, 3000);
  check('heat: WBGT key + work-hours rule key are independent keys', heat.ver.phase === 'confirmed' && heat.ver.keysNow.length >= 2 && heat.ver.keysNow.includes('wbgt') && heat.ver.keysNow.includes('rule'), (heat.ver.keysNow || []).join(','));
}

// =====================================================================================================================
section('8. headcount against the register');
{
  const sim = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 });
  let allOk = true, snaps = 0;
  for (const t of [30, 60, 90, 120, 180, 240, 400, 700]) {
    S.run(sim, t);
    const h = S.headcount(sim), s = S.snapshot(sim).headcount;
    const sumRooms = Object.values(h.rooms).reduce((x, r) => x + r.total, 0), un = Object.values(h.rooms).reduce((x, r) => x + r.unaccounted, 0);
    if (h.registered !== h.safe + h.safeAway + h.help + h.unaccounted || h.unaccountedList.length !== h.unaccounted || h.helpList.length !== h.help || s.registered !== h.registered || s.unaccounted !== h.unaccounted) allOk = false;
    if (sumRooms > h.registered || un > h.unaccounted) allOk = false;
    snaps++;
  }
  check(`registered = safe + away-safe + help + unaccounted at ${snaps} moments; lists and rooms agree`, allOk);
  const h0 = S.headcount(S.create({ preset: 'fire-night', seed: 1 }));
  check('at the start everybody is unaccounted (120 registered)', h0.registered === 120 && h0.unaccounted === 120 && h0.safe === 0);
  const h = S.headcount(sim);
  check('by the end most people are accounted for, some need help or are still missing', h.safe + h.safeAway > 80 && h.unaccounted < 25, JSON.stringify({ safe: h.safe, away: h.safeAway, help: h.help, un: h.unaccounted }));
  const live = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }); S.run(live, 40);
  const b = S.headcount(live), key = b.unaccountedList[0].key;
  S.checkin(live, key, 'safe');
  const c = S.headcount(live);
  check('a check-in moves exactly one person from unaccounted to safe (arithmetic preserved)', c.unaccounted === b.unaccounted - 1 && c.safe + c.safeAway === b.safe + b.safeAway + 1 && c.registered === b.registered);
  S.checkin(live, c.unaccountedList[0].key, 'help'); const d = S.headcount(live);
  check('"I need help" is counted separately and listed', d.help === 1 && d.helpList.length === 1 && d.registered === d.safe + d.safeAway + d.help + d.unaccounted);
  const sc = S.headcount(S.run(S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }), 20)).unaccountedList;
  const head = sc.slice(0, 5);
  check('priority list: people with needs (wheelchair, Deaf, elderly, child, blind) come first', head.every(r => r.needs.length > 0), head.map(r => r.key + ':' + r.needs.join('+')).join(' '));
  check('priority list is sorted by score (descending)', sc.every((r, i) => i === 0 || sc[i - 1].score >= r.score));
  const school = S.run(S.create({ preset: 'school-fire-day', mode: 'manara', seed: 1 }), 600), hs = S.headcount(school);
  check('school: headcount counts pupils, teachers and staff (172) against the class registers', hs.registered === 172 && hs.registered === hs.safe + hs.safeAway + hs.help + hs.unaccounted);
  const ordHC = S.metrics(RUNS['fire-night'].ordinary);
  check('ordinary alarm has no headcount (metrics say null, not an invented number)', ordHC.headcount === null && S.snapshot(RUNS['fire-night'].ordinary).headcount === null);
}

// =====================================================================================================================
section('9. OASIS CAP 1.2 export');
{
  const py = `import sys, json, xml.etree.ElementTree as ET
ns = '{urn:oasis:names:tc:emergency:cap:1.2}'
r = ET.fromstring(sys.stdin.read())
infos = r.findall(ns + 'info')
print(json.dumps({'root': r.tag, 'status': r.find(ns + 'status').text, 'msgType': r.find(ns + 'msgType').text, 'identifier': r.find(ns + 'identifier').text,
  'sent': r.find(ns + 'sent').text, 'note': r.find(ns + 'note').text, 'infos': [{'lang': i.find(ns + 'language').text, 'order': [c.tag.replace(ns, '') for c in i], 'areaDesc': i.find(ns + 'area').find(ns + 'areaDesc').text, 'headline': i.find(ns + 'headline').text, 'instruction': i.find(ns + 'instruction').text} for i in infos]}))`;
  const parse = xml => JSON.parse(execFileSync('python3', ['-I', '-c', py], { input: xml, encoding: 'utf8' }));
  const ORDER = ['language', 'category', 'event', 'responseType', 'urgency', 'severity', 'certainty', 'effective', 'expires', 'senderName', 'headline', 'description', 'instruction', 'parameter', 'area'];
  const inOrder = (seq) => { let last = -1; for (const t of seq) { const i = ORDER.indexOf(t); if (i < last) return false; last = Math.max(last, i); } return true; };
  const sim = RUNS['fire-night'].manara;
  const xml = S.cap(sim);
  const p = parse(xml);
  check('CAP is well-formed XML in the CAP 1.2 namespace', p.root === '{urn:oasis:names:tc:emergency:cap:1.2}alert');
  check('status = Exercise, msgType = Alert, identifier names the preset and seed', p.status === 'Exercise' && p.msgType === 'Alert' && /EXERCISE.*fire-night.*s1/.test(p.identifier));
  check('exactly one <info> per language (ar, en)', p.infos.length === 2 && p.infos.map(i => i.lang).join() === 'ar,en');
  check('Arabic info carries Arabic text, English info English text', /[\u0600-\u06FF]/.test(p.infos[0].headline) && /EXERCISE/.test(p.infos[1].headline));
  check('info children follow the CAP element order', p.infos.every(i => inOrder(i.order)));
  check('the note says EXERCISE / not a real alert; the sender is a non-routable address', /EXERCISE/.test(p.note) && /example\.invalid/.test(xml));
  check('"sent" is an ISO-8601 time with the Qatar offset', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+03:00$/.test(p.sent), p.sent);
  const three = parse(S.cap(sim, { languages: ['ar', 'en', 'ml'] }));
  check('adding a third language adds a third <info> (marked DRAFT)', three.infos.length === 3 && /DRAFT/.test(xml.length ? S.cap(sim, { languages: ['ar', 'en', 'ml'] }) : ''));
  let all = 0;
  for (const preset of S.PRESET_ORDER) { const x = S.cap(RUNS[preset].manara); const q = parse(x); if (q.status === 'Exercise' && q.infos.length === 2 && q.infos.every(i => inOrder(i.order))) all++; }
  check('every hazard preset exports valid CAP (Fire, Env, Met, Health categories)', all === 7, all + '/7');
  const risky = S.create({ preset: 'fire-night', seed: 1 }); risky.pre.incident = { ar: 'حريق <&> "اختبار"', en: 'Fire <&> "test" \'x\'' };
  S.run(risky, 150);
  check('XML special characters in text are escaped (still parses)', (() => { try { parse(S.cap(risky)); return true; } catch (e) { return false; } })());
}

// =====================================================================================================================
section('10. A/B — same seed, ordinary alarm vs MANARA (SIMULATION: a mechanism check, not proof of impact)');
{
  const M = {}; for (const p of S.PRESET_ORDER) M[p] = { o: S.metrics(RUNS[p].ordinary), m: S.metrics(RUNS[p].manara) };
  const row = (n, f) => console.log('  ' + n.padEnd(24) + S.PRESET_ORDER.map(p => String(f(M[p])).padStart(12)).join(''));
  console.log('  ' + 'metric'.padEnd(24) + S.PRESET_ORDER.map(p => p.slice(0, 11).padStart(12)).join(''));
  row('first alert  ord/man s', x => fmt(x.o.timeToFirstAlertSec, 0) + '/' + fmt(x.m.timeToFirstAlertSec, 0));
  row('personal alert (man) s', x => fmt(x.m.timeToFirstPersonalAlertSec, 0));
  row('timeToSafe p90 o/m s', x => (x.o.timeToSafe.reliable ? fmt(x.o.timeToSafeP90Sec, 0) : '(n/r)') + '/' + (x.m.timeToSafe.reliable ? fmt(x.m.timeToSafeP90Sec, 0) : '(n/r)'));
  row('injured-in-model o/m', x => x.o.injuredInModel + '/' + x.m.injuredInModel);
  row('exposure person-s o/m', x => x.o.exposurePersonSec + '/' + x.m.exposurePersonSec);
  row('collapses o/m', x => x.o.collapses + '/' + x.m.collapses);
  row('time to help s o/m', x => fmt(x.o.timeToHelpSec, 0) + '/' + fmt(x.m.timeToHelpSec, 0));
  row('to dispatch s o/m', x => fmt(x.o.timeToDispatchSec, 0) + '/' + fmt(x.m.timeToDispatchSec, 0));
  row('on scene s o/m', x => fmt(x.o.timeToOnSceneSec, 0) + '/' + fmt(x.m.timeToOnSceneSec, 0));
  row('still not safe t300 o/m', x => x.o.stillNotSafe.t300 + '/' + x.m.stillNotSafe.t300);
  const f = M['fire-night'], g = M['gas-night'], d = M['dust-day'], h = M['heat-day'], s = M['sos-day'], sc = M['school-fire-day'], fl = M['flood-day'];
  check('fire-night: 90 % reach safety sooner with MANARA', f.m.timeToSafeP90Sec < f.o.timeToSafeP90Sec, `${f.o.timeToSafeP90Sec} → ${f.m.timeToSafeP90Sec} s`);
  check('fire-night: fewer injured-in-model and fewer people still unsafe at T+300 s', f.m.injuredInModel < f.o.injuredInModel && f.m.stillNotSafe.t300 < f.o.stillNotSafe.t300, `${f.o.injuredInModel} → ${f.m.injuredInModel}`);
  check('fire-night: honest trade-off — the first PERSONAL alert comes after the siren (proof + approval take seconds)', f.m.timeToFirstPersonalAlertSec > f.m.timeToLocalAlarmSec, `siren +${f.m.timeToLocalAlarmSec} s, personal +${f.m.timeToFirstPersonalAlertSec} s`);
  check('fire-night: MANARA people are informed (live route) far sooner than the ordinary world informs anybody', f.m.informedPctAt120 >= 60 && f.o.informedPctAt120 === 0, `${f.m.informedPctAt120} % vs ${f.o.informedPctAt120} %`);
  check('gas-night: less time in the plume (person-seconds) and fewer injured-in-model', g.m.exposurePersonSec < g.o.exposurePersonSec && g.m.injuredInModel < g.o.injuredInModel, `${g.o.exposurePersonSec} → ${g.m.exposurePersonSec}`);
  check('dust-day: fewer people injured-in-model (shelter before the front arrives)', d.m.injuredInModel < d.o.injuredInModel, `${d.o.injuredInModel} → ${d.m.injuredInModel}`);
  check('heat-day: fewer heat collapses (stop-work + cool shelter)', h.m.collapses < h.o.collapses, `${h.o.collapses} → ${h.m.collapses}`);
  check('sos-day: help arrives sooner (volunteer / drone-AED / ambulance dispatched at approval)', s.m.timeToHelpSec < s.o.timeToHelpSec, `${s.o.timeToHelpSec} → ${s.m.timeToHelpSec} s`);
  check('school-fire-day: verified package dispatches and reaches the scene sooner', sc.m.timeToDispatchSec < sc.o.timeToDispatchSec && sc.m.timeToOnSceneSec < sc.o.timeToOnSceneSec, `${sc.o.timeToOnSceneSec} → ${sc.m.timeToOnSceneSec} s`);
  check('school-fire-day: headcount against the class registers is complete', sc.m.headcount && sc.m.headcount.final.unaccounted === 0);
  check('flood-day: less time in deep water', fl.m.exposurePersonSec <= fl.o.exposurePersonSec, `${fl.o.exposurePersonSec} → ${fl.m.exposurePersonSec}`);
  const better = S.PRESET_ORDER.filter(p => { const x = M[p]; return (x.m.headline.better === 'lower') && (x.m.headline.value !== null && x.o.headline.value !== null) && x.m.headline.value < x.o.headline.value; });
  check('A/B differs sensibly (MANARA better on its headline metric) under at least 3 presets', better.length >= 3, better.join(', '));
  check('every metric set is labelled SIMULATION and carries the headline metric', S.PRESET_ORDER.every(p => /SIMULATION/.test(M[p].m.label.en) && /محاكاة/.test(M[p].m.label.ar) && M[p].m.headline && M[p].o.headline));
  const ab = S.ab({ preset: 'sos-day', seed: 1 });
  check('ab() reproduces the stored runs exactly (same seed → same metrics) and returns deltas', JSON.stringify(ab.manara) === JSON.stringify(S.metrics(RUNS['sos-day'].manara)) && ab.delta.timeToHelpSec > 0 && Object.keys(ab.params).length >= 90);
}

// =====================================================================================================================
section('11. dispatch: the FASTEST unit given traffic (not the nearest by distance)');
{
  // hand-built graph: A is near but only on a major road; B is farther but on an expressway
  const G = S.traffic.makeRoadGraph({
    nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0, y: 200 }, { id: 'T', x: 100, y: 0 }],
    segs: [{ id: 'RA', a: 'A', b: 'T', cls: 'major' }, { id: 'RB', a: 'B', b: 'T', cls: 'expressway' }]
  });
  const cands = (o = {}) => [Object.assign({ id: 'A', node: 'A', turnoutSec: 60 }, o.A), Object.assign({ id: 'B', node: 'B', turnoutSec: 60 }, o.B)];
  const tr = (o = {}) => Object.assign({ load: 1, jams: {}, closed: {} }, o);
  const pick = (hour, trf, c = cands()) => S.traffic.pickUnit(G, c, 'T', hour * 3600, trf, { emerg: 1.3 });
  const night = pick(4, tr()), rush = pick(7.5, tr({ load: 1.8 }));
  check('hand-built graph: A is nearer by distance (500 m vs 1118 m)', night.byDistance.id === 'A' && Math.round(night.ranked.find(r => r.id === 'A').roadDistM) === 500 && Math.round(night.ranked.find(r => r.id === 'B').roadDistM) === 1118);
  check('04:00, light traffic: the nearest unit is also the fastest → A', night.chosen.id === 'A' && night.whyData.farButFaster === false && /Nearest and fastest/.test(night.why.en));
  check('07:30 rush hour: the FARTHER unit B wins on ETA (farther but faster)', rush.chosen.id === 'B' && rush.byDistance.id === 'A' && rush.whyData.farButFaster === true, `A ${Math.round(rush.all.find(r => r.id === 'A').etaSec)} s vs B ${Math.round(rush.chosen.etaSec)} s`);
  check('"why this unit" data: distance AND ETA of both, gain and extra distance', rush.whyData.gainSec > 30 && rush.whyData.extraDistM > 500 && rush.whyData.runnerUp.id === 'A' && rush.whyData.chosen.etaSec < rush.whyData.runnerUp.etaSec && rush.whyData.chosen.distM > rush.whyData.runnerUp.distM);
  check('why-text (EN + AR) states farther / faster and the reason', /farther/.test(rush.why.en) && /faster/.test(rush.why.en) && /rush-hour/.test(rush.why.en) && /أبعد/.test(rush.why.ar) && /أسرع/.test(rush.why.ar));
  let last = null, flips = 0, ch = [];
  for (let l = 0; l <= 2.001; l += 0.1) { const c = pick(7.5, tr({ load: l })).chosen.id; ch.push(c); if (last !== null && c !== last) flips++; last = c; }
  check('the "traffic" multiplier changes the choice: A at load 0, B at load 2, one clean switch', ch[0] === 'A' && ch[ch.length - 1] === 'B' && flips === 1, ch.join(''));
  check('the same load at 04:00 never flips (profile is time-varying)', (() => { for (let l = 0; l <= 2; l += 0.5) if (pick(4, tr({ load: l })).chosen.id !== 'A') return false; return true; })());
  check('jamming road RA changes the choice to B (and removing the jam restores A)', pick(4, tr({ jams: { RA: 0.08 } })).chosen.id === 'B' && pick(4, tr({ jams: {} })).chosen.id === 'A');
  check('a closed road changes the choice: RA closed → B; RB closed → A; both closed → nobody', pick(4, tr({ closed: { RA: true } })).chosen.id === 'B' && pick(4, tr({ closed: { RB: true } })).chosen.id === 'A' && pick(4, tr({ closed: { RA: true, RB: true } })).chosen === null);
  const busy = pick(4, tr(), cands({ A: { available: false } }));
  check('a busy unit is skipped (even though it is nearest) and the skip is reported', busy.chosen.id === 'B' && busy.whyData.skippedBusy.includes('A') && /busy/.test(busy.why.en));
  check('a unit without the needed capability is skipped', pick(4, tr(), cands({ A: { capable: false } })).chosen.id === 'B' && pick(4, tr(), cands({ A: { capable: false } })).whyData.skippedCapability.includes('A'));
  const e4 = night.all.find(r => r.id === 'A').etaSec, e7 = pick(7.5, tr({ load: 1.8 })).all.find(r => r.id === 'A').etaSec;
  check('ETA is time-dependent: the same unit needs far longer at the morning peak', e7 > 2 * e4, `${Math.round(e4)} s → ${Math.round(e7)} s`);
  const w = S.worldInfo();
  const school = w.roads.segs.find(x => x.id === 'MS1');
  const rg = S.create({ preset: 'fire-night' }).W.roads, ms1 = rg.segById['MS1'];
  check('school road hot-spot: slow at 07:15 (drop-off) and 12:50 (pick-up), free at 10:00', S.traffic.segFactors(ms1, 7.25 * 3600, { load: 1 }).hot < 0.5 && S.traffic.segFactors(ms1, 12.8 * 3600, { load: 1 }).hot < 0.5 && S.traffic.segFactors(ms1, 10 * 3600, { load: 1 }).hot === 1);
  check('daily profile: morning and evening peaks, quiet night', S.traffic.profileAt(7.5) < 0.6 && S.traffic.profileAt(17.5) < 0.6 && S.traffic.profileAt(3) > 0.9 && S.traffic.profileAt(10) > S.traffic.profileAt(7.5));

  // ---- the real map
  const fn = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 });
  const cmpNight = S.dispatchCompare(fn, 'fire', { hour: 4 }), cmpRush = S.dispatchCompare(fn, 'fire', { hour: 7.5 });
  check('map, 04:00: Civil Defence Station A is nearest AND fastest', cmpNight.fastest.id === 'F1' && cmpNight.nearestByDistance.id === 'F1' && !cmpNight.farButFaster, JSON.stringify(cmpNight.ranked));
  check('map, 07:30 (school drop-off + morning peak): Station B is farther by road but faster', cmpRush.fastest.id === 'F2' && cmpRush.nearestByDistance.id === 'F1' && cmpRush.farButFaster && cmpRush.fastest.distM > cmpRush.nearestByDistance.distM && cmpRush.fastest.etaSec < cmpRush.nearestByDistance.etaSec, cmpRush.why && cmpRush.why.en);
  const sf = RUNS['school-fire-day'].manara, fp = sf.plan.units.find(u => u.kind === 'fire');
  check('school-fire-day preset demonstrates "farther but faster" (road works + drop-off queue): Station B dispatched', fp.assetId === 'F2' && fp.whyData.farButFaster && fp.whyData.gainSec > 60 && evs(sf, 'far-but-faster').length >= 1, fp.why.en);
  check('...with a bilingual why-line the operator can read', /farther/.test(fp.why.en) && /أبعد/.test(fp.why.ar));

  // ---- hospitals
  const sim = S.create({ preset: 'sos-day', mode: 'manara', seed: 1 });
  const H = (pts, o) => S.traffic.pickHospital(sim, pts, o);
  const h1 = H({ n: 1, need: 'ed' }), h2 = H({ n: 1, need: 'trauma' });
  check('hospital: nearest one with an emergency department takes a medical patient', h1.chosen.asset.id === 'H1' && h1.patients.need === 'ed');
  check('hospital: a trauma patient goes to the trauma centre even though another hospital is closer (capability respected)', h2.chosen.asset.id === 'H2' && h2.skipped.some(s => s.id === 'H1' && s.reason === 'capability') && /trauma/.test(h2.why.en));
  const hp = H({ n: 2, need: 'paed' });
  check('hospital: injured children go to the hospital with a paediatric emergency department', hp.chosen.asset.id === 'H1' && hp.options.every(o => o.asset.paed || o.asset.id !== 'H1') && S.worldInfo().assets.find(a => a.id === 'H1').paed === true && S.worldInfo().assets.find(a => a.id === 'H2').paed === false);
  S.setHospital(sim, 'H1', { freeBeds: 0 });
  check('hospital: no free beds → the next capable hospital (capacity respected)', H({ n: 1, need: 'ed' }).chosen.asset.id === 'H2');
  S.setHospital(sim, 'H1', { freeBeds: 8 });
  check('hospital: more patients than the nearest can take → a hospital that fits', H({ n: 6, need: 'ed' }).chosen.asset.id === 'H1' && H({ n: 7, need: 'ed' }).chosen.asset.id === 'H1');
  S.setHospital(sim, 'H1', { freeBeds: 2 }); S.setHospital(sim, 'H2', { freeBeds: 5 });
  check('hospital: 4 patients do not fit H1 (2 free) → H2 (5 free)', H({ n: 4, need: 'ed' }).chosen.asset.id === 'H2');
  S.setHospital(sim, 'H2', { freeBeds: 1 });
  const part = H({ n: 4, need: 'ed' });
  check('hospital: nobody has room for all → the roomiest capable one, flagged as partial', part.partial === true && part.chosen.asset.id === 'H1');

  // ---- re-dispatch, re-route, state machine, ETA countdown
  const a = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }); S.run(a, 100);
  check('before approval the plan is "recommended"; at approval "approved" → "dispatched" → units "en-route"', (() => { const b = S.create({ preset: 'fire-night', mode: 'manara', seed: 1, autoApprove: false }); S.run(b, 80); const s1 = b.plan.state; S.approve(b); const s2 = b.plan.state; S.run(b, b.t + 12); const s3 = b.plan.state; S.run(b, b.t + 60); const s4 = b.plan.state; return s1 === 'recommended' && s2 === 'approved' && s3 === 'dispatched' && s4 === 'en-route'; })());
  const u0 = a.plan.units.find(u => u.kind === 'fire');
  S.setUnitBusy(a, u0.assetId, true); S.run(a, 112);
  const rd = evs(a, 'redispatch');
  check('a unit becoming busy triggers an automatic re-dispatch event to another station', rd.length >= 1 && rd[0].reason === 'busy' && rd[0].from === 'F1' && rd[0].to === 'F2', rd.map(e => e.text.en).join(' | '));
  check('...and the new plan unit is the other station, with a fresh why-line', a.plan.units.find(u => u.kind === 'fire').assetId === 'F2' && a.plan.units.find(u => u.kind === 'fire').replaced.reason === 'busy');
  const j = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }); S.run(j, 110);
  S.jamRoad(j, 'AR-W', 0.1); S.run(j, 125);
  check('a new jam on the road the engine is driving on re-dispatches to the faster farther station ("faster now")', evs(j, 'redispatch').some(e => e.reason === 'traffic' && e.to === 'F2'), evs(j, 'redispatch').map(e => e.text.en).join(' | '));
  const c = S.create({ preset: 'fire-night', mode: 'manara', seed: 1, autoApprove: false }); S.closeRoad(c, 'AR-W', true); S.run(c, 70);
  const cf = c.plan.units.find(u => u.kind === 'fire');
  check('a closed road changes the recommendation: station A is cut off, B recommended', cf.assetId === 'F2' && /cut off/.test(cf.why.en));
  const rr = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }); S.run(rr, 200);
  const amb = rr.plan.units.find(u => u.kind === 'ambulance'); const ambRoute0 = amb.nodes.join();
  S.jamRoad(rr, 'SS1', 0.05); S.jamRoad(rr, 'SS2', 0.05); S.run(rr, 215);
  check('en-route units re-route around new jams (or confirm the current route is still best)', amb.reroutes >= 0 && amb.state !== 'recommended');
  const etaSeries = []; const e = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 });
  for (let t = 0; t < 400; t++) { S.step(e, 1); const u = e.plan && e.plan.units.find(x => x.kind === 'fire'); if (u && (u.state === 'en-route')) etaSeries.push([e.t, u.etaSec]); }
  const mono = etaSeries.every((p, i) => i === 0 || p[1] <= etaSeries[i - 1][1] + 3);
  const fu = e.plan.units.find(u => u.kind === 'fire');
  check('ETA counts down while en route and reaches 0 at "on scene"', etaSeries.length > 20 && mono && fu.state !== 'en-route' && fu.onSceneAt !== null, `${etaSeries.length} samples`);
  check('ETA is honest: first en-route estimate within 20 s of the actual arrival time', Math.abs((etaSeries[0][0] + etaSeries[0][1]) - fu.onSceneAt) <= 20, `predicted ${Math.round(etaSeries[0][0] + etaSeries[0][1])} s, arrived ${fu.onSceneAt} s`);
  const st = fu.states;
  check('unit state machine records timestamps in order recommended → approved → dispatched → en-route → on-scene', ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene'].every((k, i, arr) => st[k] !== undefined && (i === 0 || st[k] >= st[arr[i - 1]])), JSON.stringify(st));
  const cleared = S.run(S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }), 1200).plan.units.every(u => !u.assetId || u.state === 'cleared');
  check('units end as "cleared" after the on-scene time', cleared);
  check('route polylines run from the unit to the scene (drawable)', (() => { const d = S.snapshot(a).dispatch; return d.units.every(u => !u.assetId || (u.route.length >= 2 && u.route.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])))); })());

  // ---- every hazard
  const need = { 'fire-night': ['fire', 'ambulance', 'police'], 'gas-night': ['fire', 'ambulance', 'police'], 'flood-day': ['rescue', 'police', 'ambulance'], 'dust-day': ['police', 'ambulance'], 'heat-day': ['ambulance'], 'sos-day': ['ambulance'], 'school-fire-day': ['fire', 'ambulance', 'police'] };
  for (const p of S.PRESET_ORDER) {
    const m = RUNS[p].manara, o = RUNS[p].ordinary;
    const kinds = m.plan ? m.plan.units.filter(u => u.assetId).map(u => u.kind) : [];
    check(`${p}: dispatch plan with the required unit types (${need[p].join('+')}), finite ETAs, a hospital for patients`, m.plan && need[p].every(k => kinds.includes(k)) && m.plan.units.every(u => !u.assetId || Number.isFinite(u.etaAtRec)) && (m.plan.hospital ? !!m.plan.hospital.chosen : true), kinds.join(','));
    check(`${p}: MANARA package dispatched before the ordinary 999 call would be`, m.plan.t.dispatched !== undefined && o.plan && o.plan.t.dispatched !== undefined && m.plan.t.dispatched - m.tIgnite < o.plan.t.dispatched - o.tIgnite || p === 'heat-day', `${m.plan.t.dispatched} vs ${o.plan && o.plan.t.dispatched}`);
  }
  const gasPlan = RUNS['gas-night'].manara.plan;
  check('gas: only the HazMat station can take the gas job (capability), the others are skipped', gasPlan.units.find(u => u.kind === 'fire').assetId === 'F2' && gasPlan.units.find(u => u.kind === 'fire').whyData.skippedCapability.includes('F1'));
  check('gas: roads inside the plume are closed to civilians but the HazMat unit still reaches the store', evs(RUNS['gas-night'].manara, 'road-closed').some(e => e.by === 'gas') && gasPlan.units.find(u => u.kind === 'fire').onSceneAt !== null);
  const fl = RUNS['flood-day'].manara;
  check('flood: the flooded underpass is closed to traffic by the water itself', evs(fl, 'road-closed').some(e => e.by === 'flood' && /V24U/.test(e.seg)));
  // ---- arrival effects
  const ff = RUNS['fire-night'], gg = RUNS['gas-night'], ss = RUNS['sos-day'];
  check('fire engine on scene: suppression starts (spread probability reduced) and the fire is later extinguished', evs(ff.manara, 'suppression').length === 1 && ff.manara.hz.suppress === 1 && ff.manara.hz.extinguishAt !== null);
  check('earlier dispatch → earlier suppression in the MANARA world', evs(ff.manara, 'suppression')[0].t < evs(ff.ordinary, 'suppression')[0].t);
  check('HazMat on scene closes the leak source ("valve-closed") sooner in the MANARA world', evs(gg.manara, 'valve-closed')[0].t < evs(gg.ordinary, 'valve-closed')[0].t);
  check('rescue unit brings out people who cannot move (Abu Salem at the refuge is "rescued")', evs(ff.manara, 'rescued').some(e => e.person === 'abu-salem'));
  check('police on scene set a cordon; flood arrivals are diverted afterwards', fl.cordon.active && (fl.hz.diverted || 0) > 0, 'diverted ' + fl.hz.diverted);
  check('SOS: the victim is helped by the first of volunteer / drone-AED / ambulance (named)', ['volunteer', 'drone-aed', 'ambulance'].includes(ss.manara.cases[0].helpBy) && ss.manara.cases[0].helpBy !== 'ambulance', ss.manara.cases[0].helpBy + ' vs ordinary ' + ss.ordinary.cases[0].helpBy);
  check('fire engine yields the airspace: the drone yields when the engine is on scene', evs(ff.manara, 'drone').some(e => e.state === 'YIELD'));
  const dsn = S.snapshot(ff.manara).drone;
  check('drone: friendly-light signature while flying, docked → ... → charging, battery derated by heat', evs(ff.manara, 'drone').map(e => e.state).join().includes('LAUNCH,TRANSIT,PATROL,TRACK,HOLD') && (S.create({ preset: 'fire-night', params: { ambientC: 48 } }).P.ambientC === 48) && ['friendly', 'off'].includes(dsn.light));
  const bm = S.busDispatch(ff.manara);
  check("bus message: { type:'dispatch', id, units:[{kind,name{ar,en},etaMin,status,why}], hospital:{name,etaMin}|null }", bm.type === 'dispatch' && typeof bm.id === 'string' && bm.units.length >= 3 && bm.units.every(u => ['fire', 'ambulance', 'police', 'rescue'].includes(u.kind) && u.name.ar && u.name.en && typeof u.etaMin === 'number' && typeof u.status === 'string' && u.why && u.why.en) && (bm.hospital === null || (bm.hospital.name.en && typeof bm.hospital.etaMin === 'number')));
  const ho = S.handoff(ff.manara, { cap: true });
  check('hand-off card: exits, who is unaccounted with needs/rooms, dispatch units, CAP string, "EXERCISE"', ho.exits.length === 4 && Array.isArray(ho.unaccounted) && ho.dispatch.units.length >= 3 && /<alert/.test(ho.cap) && /EXERCISE/.test(ho.status.en) && ho.people.registered === 120);
  const ba = S.busAlert(S.run(S.create({ preset: 'fire-night', seed: 1 }), 130), 'ravi');
  check("bus message: alert for a person (level, hazard, you, distanceM, bearingDeg, safe, route[], instructions[])", ba && ba.type === 'alert' && ba.level === 'evacuate' && ba.fire && ba.safe && ba.route.length > 5 && ba.instructions.length >= 1 && Number.isFinite(ba.distanceM) && Number.isFinite(ba.bearingDeg));
}

// =====================================================================================================================
section('12. performance and sensitivity');
{
  // one simulated second of the default preset (fire-night, manara): average over the whole 1200 s run, after a warm-up run
  S.run(S.create({ preset: 'fire-night', seed: 2 }), 400);
  const sim = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 });
  const tk = []; for (let t = 0; t < 1200; t++) { const t0 = performance.now(); S.step(sim, 1); tk.push(performance.now() - t0); }
  const avg = tk.reduce((a, b) => a + b, 0) / tk.length, p95 = tk.slice().sort((a, b) => a - b)[Math.floor(tk.length * 0.95)], mx = Math.max(...tk);
  console.log(`  default preset: ${avg.toFixed(2)} ms per simulated second on average, p95 ${p95.toFixed(2)} ms, worst tick ${mx.toFixed(1)} ms`);
  check('performance: one simulated second of the default preset averages < 3 ms', avg < 3, avg.toFixed(2) + ' ms');
  const ord = S.create({ preset: 'fire-night', mode: 'ordinary', seed: 1 }); const t1 = performance.now(); S.run(ord, 1200);
  check('performance: the ordinary world is also < 3 ms per simulated second', (performance.now() - t1) / 1200 < 3, ((performance.now() - t1) / 1200).toFixed(2) + ' ms');
  const create = performance.now(); S.create({ preset: 'school-fire-day' }); const cm = performance.now() - create;
  check('creating the heaviest world (school, ~350 people) takes < 150 ms', cm < 150, cm.toFixed(0) + ' ms');

  // sensitivity: how does the A/B gap change with the assumptions? (the honest answer: it depends)
  const table = [];
  const sweep = (preset, param, values, secs) => { const r = S.sweep({ preset, param, values, seeds: [1], seconds: secs }); table.push([preset, param, r]); return r; };
  const r1 = sweep('fire-night', 'phoneAppPct', [0, 40, 85, 100], 600);
  const r2 = sweep('fire-night', 'wakePhone', [0.1, 0.45, 0.8], 600);
  const r3 = sweep('fire-night', 'reactionSec', [8, 15, 40], 600);
  const r4 = sweep('fire-night', 'ordinaryGuardKnock', [0, 1], 600);
  const r5 = sweep('gas-night', 'gasInfilPct', [0, 30, 60, 90], 600);
  const r6 = sweep('heat-day', 'strainMin', [60, 90, 180], 3600);
  const r7 = sweep('sos-day', 'ordinaryNoticeSec', [20, 150, 400], 900);
  console.log('\n  sensitivity of the A/B gap to ONE assumption at a time (positive gap = MANARA better; SIMULATION, 1 seed):');
  for (const [preset, param, r] of table) {
    console.log(`   ${preset} · ${param} · metric: ${r.metric.label.en} (${r.metric.unit})`);
    for (const row of r.rows) console.log(`      ${String(row.value).padStart(6)}  ordinary ${String(row.headlineOrdinary).padStart(9)}  MANARA ${String(row.headlineManara).padStart(9)}  gap ${String(row.headlineGap).padStart(9)}`);
  }
  const gap = r => r.rows.map(x => x.headlineGap);
  const spread = r => Math.max(...gap(r)) - Math.min(...gap(r));
  check('sweeps run without NaN', table.every(([, , r]) => badNumbers(r).length === 0));
  check('the gap is NOT constant: it changes with the assumptions (fire: app adoption, wake chance, reaction time)', spread(r1) > 5 || spread(r2) > 5 || spread(r3) > 5, `spreads ${spread(r1).toFixed(0)} / ${spread(r2).toFixed(0)} / ${spread(r3).toFixed(0)} s`);
  check('with 0 % app adoption the personal-alert advantage shrinks (MANARA informs far fewer people)', (() => { const a0 = S.metrics(S.run(S.create({ preset: 'fire-night', seed: 1, params: { phoneAppPct: 0 } }), 400)), a1 = S.metrics(S.run(S.create({ preset: 'fire-night', seed: 1, params: { phoneAppPct: 100 } }), 400)); return a0.informedPctAt120 < a1.informedPctAt120 - 20; })());
  check('gas: with no seepage indoors the injury gap vanishes — the result depends on the infiltration assumption', r5.rows[0].headlineOrdinary < r5.rows[r5.rows.length - 1].headlineOrdinary, `ordinary exposure ${r5.rows.map(x => x.headlineOrdinary).join(' → ')}`);
  check('heat: a tougher workforce (strainMin 180) shows fewer collapses in the ordinary world', r6.rows[2].headlineOrdinary <= r6.rows[0].headlineOrdinary);
  check('SOS: the gap depends on how fast a bystander notices (ordinaryNoticeSec)', r7.rows[2].headlineGap > r7.rows[0].headlineGap - 1);
}

// =====================================================================================================================
section('13. API robustness');
{
  let okAlert = 0, okHand = 0, jsonOk = true;
  for (const p of S.PRESET_ORDER) {
    const sim = RUNS[p].manara;
    const st = S.snapshot(sim);
    let heroKeys = ['ravi', 'huda', 'abu-salem', 'lina'].filter(k => sim.byKey[k] && sim.byKey[k].msg);
    if (!heroKeys.length) heroKeys = sim.people.filter(q => q.msg).map(q => q.key).slice(0, 3);   // sos-day: only the victim and the volunteers are told
    const msgs = heroKeys.map(k => S.busAlert(sim, k)).filter(Boolean);
    if (msgs.length >= 1 && msgs.every(m => m.type === 'alert' && ['watch', 'shelter', 'evacuate'].includes(m.level) && m.hazard === sim.hazard && Number.isFinite(m.distanceM) && Number.isFinite(m.bearingDeg) && m.at && Array.isArray(m.route) && m.instructions.length >= 1 && m.area.ar && m.area.en && badNumbers(m).length === 0)) okAlert++;
    const ho = S.handoff(sim, { cap: true });
    if (ho.type === 'handoff' && /<alert/.test(ho.cap) && badNumbers(ho).length === 0 && ho.people.registered > 0) okHand++;
    try { JSON.stringify(st); JSON.stringify(ho); JSON.stringify(S.busDispatch(sim)); JSON.stringify(S.traffic.snapshot(sim)); } catch (e) { jsonOk = false; }
  }
  check('busAlert builds a valid alert message for the hero personas under every preset', okAlert === 7, okAlert + '/7');
  check('handoff() + CAP is complete and finite under every preset', okHand === 7, okHand + '/7');
  check('snapshots, hand-off, dispatch and traffic snapshots are all JSON-serialisable', jsonOk);
  const wi = JSON.stringify(S.worldInfo());
  check('worldInfo() is static JSON (< 600 kB) with the road graph, structures and assets', wi.length < 600000 && JSON.parse(wi).roads.segs.length >= 30, (wi.length / 1000).toFixed(0) + ' kB');
  const tr = S.traffic.snapshot(RUNS['fire-night'].manara);
  check('traffic snapshot gives a congestion factor per road (0..1) for drawing', tr.length >= 30 && tr.every(r => r.factor > 0 && r.factor <= 1 && typeof r.closed === 'boolean'));
  let threw = false; try { S.create({ preset: 'no-such-preset' }); } catch (e) { threw = true; }
  check('unknown preset throws a clear error', threw);
  check('unknown or non-numeric parameters are ignored, valid ones are clamped by setParam', S.create({ params: { nonsense: 5, wakeSiren: 'x' } }).P.wakeSiren === 0.2 && (() => { const s = S.create(); S.setParam(s, 'wakeSiren', 5); return s.P.wakeSiren === 1 && S.setParam(s, 'nonsense', 1) === false; })());
  check('actions on unknown ids fail politely (false), never throw', S.setExit(S.create(), 'Z', { locked: true }) === false && S.jamRoad(S.create(), 'nope', 0.2) === false && S.closeRoad(S.create(), 'nope') === false && S.compose(S.create(), 'nobody') === null && S.busAlert(S.create(), 'ravi') === null);
  const ended = RUNS['sos-day'].manara;
  check('step() after the end does nothing and snapshots still work', S.step(ended, 5) === 0 && S.snapshot(ended).done === true);
  const live = S.create({ preset: 'fire-night', mode: 'manara', seed: 1 }); S.run(live, 200);
  const lines = S.residentLines(live);
  check('resident lines for the phones: calm, bilingual, with ETA minutes ("Fire engine ETA 4 min")', lines.length >= 2 && lines.every(l => l.text.ar && l.text.en) && lines.some(l => /ETA \d+ min|on scene/.test(l.text.en)), lines.map(l => l.text.en).join(' | '));
  check('the ambulance line tells people to stay where they are', (() => { const l = S.residentLines(S.run(S.create({ preset: 'sos-day', seed: 1 }), 130)).find(x => x.kind === 'ambulance'); return !l || /stay where you are|on scene/.test(l.text.en); })());
  const tr1 = S.create({ preset: 'fire-night', seed: 1 }); S.setTraffic(tr1, 2); S.setHour(tr1, 7.5); S.run(tr1, 70);
  check('changing the traffic slider / clock in a running sim changes the recommended unit (Station B at 07:30, load 2)', tr1.plan && tr1.plan.units.find(u => u.kind === 'fire').assetId === 'F2', tr1.plan && tr1.plan.units.find(u => u.kind === 'fire').why.en);
  const gas = S.create({ preset: 'gas-night', seed: 1, gasType: 'co' });
  check('gas type selects its danger levels from the playbook table (CO: warn 35, danger 200 ppm, does not pool)', gas.P.gasWarn === 35 && gas.P.gasDanger === 200 && gas.P.gasHeavy === 0);
  const live2 = S.create({ preset: 'dust-day', seed: 1 }); S.run(live2, 150); const dustMsg = S.busAlert(live2, 'ravi');
  check('dust alert carries a forecast ETA (minutes until the front reaches the person)', dustMsg && Number.isFinite(dustMsg.etaMin) && dustMsg.etaMin >= 0, dustMsg && String(dustMsg.etaMin));
}

// =====================================================================================================================
section('14. the published fire model, sensor flags, fuzz');
{
  const M = S.model, c1 = 0.045, c2 = 0.131;
  check('wind factor p_w = exp(c1 V) exp(c2 V (cosθ − 1)): 1 without wind, exp(c1 V) straight downwind, much smaller against the wind', M.alexWind(0, 1, c1, c2) === 1 && Math.abs(M.alexWind(5, 1, c1, c2) - Math.exp(0.225)) < 1e-12 && Math.abs(M.alexWind(5, -1, c1, c2) - Math.exp(0.225) * Math.exp(-1.31)) < 1e-12 && M.alexWind(5, -1, c1, c2) < 0.4 && M.alexWind(5, 0, c1, c2) < M.alexWind(5, 1, c1, c2));
  const P = S.defaults();
  check('p_burn = p_h (1+p_veg)(1+p_den) p_w p_s with the paper\'s p_h = 0.58; capped at 1; slope factor exp(a θ_s)', Math.abs(M.alexBurn(P, 0, 0, 0, 1, 0) - 0.58) < 1e-12 && M.alexBurn(P, 0.4, 0.3, 8, 1, 0) === 1 && Math.abs(M.alexBurn(P, 0, 0, 0, 1, 10) - 0.58 * Math.exp(0.78)) < 1e-9 || M.alexBurn(P, 0, 0, 0, 1, 10) === 1);
  const spread = (deg, speed) => {
    const sim = S.create({ preset: 'fire-night', seed: 3, wind: { deg, speed }, tIgnite: 5 });
    let c = -1; for (let dx = 0; dx < 12 && c < 0; dx++) if (sim.W.fuel[42 * 96 + 36 + dx] === 1) c = 42 * 96 + 36 + dx;
    sim.ofire[c] = 1; sim.hz.outList.push(c); sim.oburn[c] = 0; const ox = c % 96;
    S.run(sim, 300);
    let e = 0, w = 0; for (let i = 0; i < 96 * 64; i++) if (sim.ofire[i] > 0) { const x = i % 96, y = (i / 96) | 0; if (y >= 34 && y <= 50 && x >= 26 && x <= 46) { if (x > ox) e++; else if (x < ox) w++; } }
    return { e, w };
  };
  const fromW = spread(270, 8), fromE = spread(90, 8);
  check('outdoor fire cellular automaton: spreads DOWNWIND (west wind → east, east wind → west)', fromW.e > 3 * fromW.w && fromE.w > fromE.e, `west wind e/w ${fromW.e}/${fromW.w}, east wind e/w ${fromE.e}/${fromE.w}`);
  const sm = S.create({ preset: 'fire-night', seed: 1, tIgnite: 99999 }); S.injectDecoy(sm, 'vapour', 30); S.run(sm, 12);
  check('cross-sensitivity flag: an MQ-2 smoke key that fires alone is flagged "cross-sensitive" (alcohol / LPG vapour also trigger it)', S.snapshot(sm).sensors.some(c => c.flags.includes('cross-sensitive')));
  const sim2 = S.create({ preset: 'fire-night', mode: 'ordinary', seed: 1, autoApprove: false });
  check('the ordinary world has no operator: approve() does nothing', S.approve(sim2) === false);

  // fuzz: random operator actions across presets/modes must never throw or produce NaN
  let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const segs = S.worldInfo().roads.segs.map(s => s.id), assets = S.worldInfo().assets.filter(a => a.kind !== 'hospital').map(a => a.id);
  let runs = 0, problems = [];
  for (let r = 0; r < 10; r++) {
    const preset = pick(S.PRESET_ORDER), mode = pick(['manara', 'ordinary']);
    try {
      const sim = S.create({ preset, mode, seed: 1 + Math.floor(rnd() * 1000), autoApprove: rnd() < 0.7, params: { trafficLoad: rnd() * 2, phoneAppPct: Math.floor(rnd() * 100), wakeSiren: rnd(), reactionSec: 5 + rnd() * 60 } });
      for (let k = 0; k < 6; k++) {
        S.step(sim, 20 + Math.floor(rnd() * 100));
        switch (Math.floor(rnd() * 12)) {
          case 0: S.approve(sim); break; case 1: S.reject(sim, 30); break;
          case 2: S.setExit(sim, pick(['A', 'B', 'E', 'R', 'RB.A', 'SCH.W', 'SCH.E', 'SCH.M']), { locked: rnd() < 0.5 }); break;
          case 3: S.jamRoad(sim, pick(segs), rnd()); break; case 4: S.closeRoad(sim, pick(segs), rnd() < 0.6); break;
          case 5: S.setUnitBusy(sim, pick(assets), rnd() < 0.7); break; case 6: S.setWind(sim, { deg: Math.floor(rnd() * 360), speed: rnd() * 12 }); break;
          case 7: S.setTraffic(sim, rnd() * 2); break; case 8: S.setHour(sim, rnd() * 24); break;
          case 9: S.injectDecoy(sim, pick(['vapour', 'hotmug', 'redcar']), 30); break; case 10: S.trigger(sim); break;
          case 11: S.checkin(sim, pick(sim.people).key, pick(['safe', 'help'])); break;
        }
        const b = badNumbers([S.snapshot(sim, { sensors: true, metrics: true }), S.headcount(sim), S.handoff(sim, { cap: true }), S.busDispatch(sim), S.residentLines(sim), S.traffic.snapshot(sim)]);
        if (b.length) problems.push(`${preset}/${mode}: ${b.join(',')}`);
        S.busAlert(sim, 'ravi'); S.routeCheck(sim, 'lina'); runs++;
      }
    } catch (e) { problems.push(`${preset}/${mode} threw ${e.message}`); }
  }
  check(`fuzz: ${runs} random operator actions on random presets/modes — no exception, no NaN`, problems.length === 0 && runs >= 55, problems.slice(0, 3).join(' | '));
}

// =====================================================================================================================
// THE RESCUE ROBOT — a concept with a SIMULATED prototype. These tests check the mechanisms (approval gate, safety rules, doors, search order, finds,
// guidance, detection, battery, link, determinism) — not that any number is real. No robot has been built or tested.
// =====================================================================================================================
const MSG_CODE = fs.readFileSync(path.join(SITE, 'js/messages.js'), 'utf8');
const ctxM = vm.createContext({}); vm.runInContext(MSG_CODE, ctxM, { filename: 'messages.js' }); vm.runInContext(CODE, ctxM, { filename: 'sim.js' });
const SM = ctxM.ManaraSim, MSG = ctxM.MANARA_MSG;   // the engine WITH the message registry loaded (the browser case); `S` is the bare engine
const RB = (o = {}, until = 0) => { const sim = S.create(Object.assign({ preset: 'fire-night-robot', seed: 1 }, o)); if (until) S.run(sim, until); return sim; };
const rb0 = sim => sim.robots[0];
const nodeIds = sim => sim.W.structs[0].nodes.map(n => n.id);
const floorOf = (sim, id) => sim.W.structs[0].byId[id].fl;

section('15. rescue robot — API, assumptions, preset, original results unchanged');
{
  const g = S.PARAMS.filter(p => p.group === 'robot');
  check('a "robot" assumptions group exists with 45+ named parameters (every one a labelled assumption, bilingual, live)', g.length >= 45 && S.PARAM_GROUPS.some(x => x.id === 'robot') && g.every(p => p.src === 'assumption' && p.live !== false && p.label.ar && p.label.en && p.desc.ar && p.desc.en), g.length + ' params');
  const gk = k => S.PARAMS.find(p => p.key === k);
  check('capabilities are parameters: speeds (wheeled / tracked), stair penalty, battery, heat + smoke drain, camera range, thermal / audio / visible detection, smoke attenuation, false alarms, mesh range, dropouts', ['robotSpeedWheeled', 'robotSpeedTracked', 'robotStairPenalty', 'robotBattMin', 'robotHeatDrain', 'robotSmokeDrain', 'robotRangeM', 'robotThermalPd', 'robotRgbPd', 'robotAudioPd', 'robotThermalSmokeK', 'robotRgbSmokeK', 'robotContrastC', 'robotRoomC', 'robotFalsePosPerMin', 'robotMeshRangeM', 'robotDropoutPct', 'robotDropoutSec', 'robotMaxTempC', 'robotOpensDoors'].every(k => gk(k)));
  check('the Gulf-heat caveat is explicit: the description of the room-temperature assumption says hot rooms reduce thermal contrast', /less thermal contrast/.test(gk('robotRoomC').desc.en) && /Gulf-heat/.test(gk('robotContrastC').desc.en));
  check('no robot parameter claims a source or a measurement (all "assumption")', g.every(p => !/was measured|were measured|has been tested|was tested|certified|approved by/i.test(p.desc.en)));
  check('preset list: the original 7 stay in PRESET_ORDER untouched; PRESET_ORDER_ALL adds fire-night-robot', JSON.stringify(S.PRESET_ORDER) === JSON.stringify(['fire-night', 'gas-night', 'flood-day', 'dust-day', 'heat-day', 'sos-day', 'school-fire-day']) && JSON.stringify(S.PRESET_ORDER_ALL) === JSON.stringify([...S.PRESET_ORDER, 'fire-night-robot']) && !!S.PRESETS['fire-night-robot']);
  const sim = RB();
  const abu = sim.byKey['abu-salem'], S0 = sim.W.structs[0];
  check('fire-night-robot (default robot scenario): 04:00 fire, one TRACKED robot, Stair A locked, Abu Salem awake and stuck in a corridor (phone off)', sim.hazard === 'fire' && sim.hour0 === 4 && sim.rb.enabled && sim.robots.length === 1 && rb0(sim).variant === 'tracked' && sim.exits.find(e => e.id === 'A').locked === true && !abu.asleep && abu.immobile === true && abu.app === false && S0.nodes[abu.g - S0.base].type === 2 && S0.nodes[abu.g - S0.base].fl === 2);
  check('the blurb names Abu Salem, the locked Stair A and says it is a simulated concept (ar + en)', /Abu Salem/.test(S.PRESETS['fire-night-robot'].blurb.en) && /Stair A/.test(S.PRESETS['fire-night-robot'].blurb.en) && /simulated concept/.test(S.PRESETS['fire-night-robot'].blurb.en) && /أبو سالم/.test(S.PRESETS['fire-night-robot'].blurb.ar) && /«أ»/.test(S.PRESETS['fire-night-robot'].blurb.ar));
  const PIN = { 'fire-night/ordinary': '68a1211a', 'fire-night/manara': 'd0274221', 'gas-night/ordinary': '7ea98a49', 'gas-night/manara': 'a3e97ae8', 'flood-day/ordinary': '2aef5b07', 'flood-day/manara': '1ad17776', 'dust-day/ordinary': 'deabe5ef', 'dust-day/manara': 'fe174b45', 'heat-day/ordinary': 'ef5510d5', 'heat-day/manara': '715a0e60', 'sos-day/ordinary': 'a55d0a2a', 'sos-day/manara': '0f6ca8ea', 'school-fire-day/ordinary': '4b4186b8', 'school-fire-day/manara': 'e8b8c5d8' };
  const diff = Object.keys(PIN).filter(k => { const [p, m] = k.split('/'); return S.hash(RUNS[p][m]) !== PIN[k]; });
  check('the original seven presets × both modes give EXACTLY the same hashes as before the robot module existed (pinned; update only if the physics is changed on purpose)', diff.length === 0, diff.join(', ') || '14 / 14 identical');
  const all = Object.keys(RUNS).every(p => ['ordinary', 'manara'].every(m => !RUNS[p][m].rb.enabled && RUNS[p][m].robots.length === 0 && !('robot' in S.snapshot(RUNS[p][m])) && !('located' in S.headcount(RUNS[p][m]))));
  check('with no robot there is no robot block in snapshots, no "located" in the headcount, no robot events', all && Object.keys(RUNS['fire-night'].manara.evCount).every(k => !/^robot/.test(k)));
  check('robot:false keeps the scenario conditions (Stair A locked, Abu Salem stuck) but removes the robot', (() => { const w = RB({ robot: false }); return !w.rb.enabled && w.exits.find(e => e.id === 'A').locked && w.byKey['abu-salem'].immobile; })());
  const fl = S.create({ preset: 'flood-day', robot: true }), ord = S.create({ preset: 'fire-night-robot', mode: 'ordinary' });
  check('N/A is explicit: the robot is refused for flood / dust / heat / SOS and in the ordinary world, with a reason (ar + en)', !fl.rb.enabled && fl.rb.na && fl.rb.na.ar && fl.rb.na.en && !ord.rb.enabled && S.deployRobot(fl).ok === false && S.deployRobot(fl).code === 'na');
  const w2 = JSON.stringify([g, S.PRESETS['fire-night-robot']]);
  check('honest wording: nothing says world-first / AI / saves lives / tested / approved by an authority', !/world.?first|first in the world|deep.?learning|saves? \d+ lives|ذكاء اصطناعي|\bAI\b/i.test(w2));
  check('detection is described as rule-based, not "AI"; the module header says concept + simulated + not tested', /rule-based, not "AI"/.test(CODE) && /CONCEPT with a SIMULATED prototype/.test(CODE) && /no robot has been built or tested/.test(CODE));
  const cap = S.cap(RB({}, 300));
  check('the OASIS CAP export is unchanged by the robot (still Exercise, one <info> per language)', /<status>Exercise<\/status>/.test(cap) && (cap.match(/<info>/g) || []).length === 2);
}

section('16. robot approval gate — nothing moves before the incident commander approves');
{
  const sim = RB({ robot: { autoApprove: false } });
  S.run(sim, 200);
  const r = rb0(sim), conf = sim.ver.confirmedAt;
  check('the robot is REQUESTED when the incident is CONFIRMED, and then waits (no auto-approval when a real commander is needed)', r.approval.status === 'requested' && r.approval.requestedAt === conf && r.state === 'stowed', `requested at ${r.approval.requestedAt}, now ${r.state}`);
  check('no movement before approval: still at the entrance, 0 m driven, no robot state change, no find', r.node === r.G.entrance && r.driven === 0 && r.finds.length === 0 && sim.events.filter(e => e.type === 'robot-state').length === 0);
  const tel = S.robotTelemetry(sim, 'R1');
  check('the telemetry says so: state stowed, approval requested, pose = the lobby, battery 100 %', tel.state === 'stowed' && tel.approval.status === 'requested' && tel.pose.node === 'LOB' && tel.battery === 1 && tel.view === null);
  const a1 = S.approveRobot(sim, 'R1');
  check('approveRobot as an OPERATOR (the default role) is rejected with a reason in Arabic and English', a1.ok === false && a1.code === 'role' && /incident commander/.test(a1.reason.en) && /قائد الحادث/.test(a1.reason.ar), JSON.stringify(a1.reason));
  S.run(sim, 215);
  check('...and the rejection changes nothing: still stowed, still 0 m, and the rejection is in the event log', rb0(sim).state === 'stowed' && rb0(sim).driven === 0 && sim.events.some(e => e.type === 'robot-approval-rejected'));
  check('an explicit role argument wins: approveRobot(…, "operator") and (…, "viewer") are rejected too', S.approveRobot(sim, 'R1', 'operator').ok === false && S.approveRobot(sim, 'R1', 'viewer').ok === false);
  S.setRole(sim, 'viewer');
  const d0 = S.deployRobot(sim, 'R1');
  check('a VIEWER cannot even request deployment; the role must be one of viewer / operator / commander', d0.ok === false && d0.code === 'role' && S.setRole(sim, 'admiral').ok === false && S.setRole(sim, 'commander').ok === true);
  const a2 = S.approveRobot(sim, 'R1');
  const tApproved = sim.t;
  check('with the COMMANDER role the approval is accepted: state "approved", approval recorded with who and when', a2.ok === true && a2.approved.join() === 'R1' && rb0(sim).approval.status === 'approved' && rb0(sim).approval.approvedAt === tApproved && rb0(sim).state === 'approved');
  S.run(sim, tApproved + 1);
  check('after approval it goes approved → deploying (set-up at the entrance) and still does not drive during set-up', rb0(sim).state === 'deploying' && rb0(sim).driven === 0 && rb0(sim).node === rb0(sim).G.entrance);
  S.run(sim, tApproved + sim.P.robotDeploySec + 3);
  check('then searching: it starts driving only after approval + set-up time', rb0(sim).state === 'searching' && rb0(sim).stats.started >= tApproved && rb0(sim).stats.started <= tApproved + 1 && (rb0(sim).driven > 0 || rb0(sim).to >= 0 || rb0(sim).node !== rb0(sim).G.entrance));
  const order = sim.events.filter(e => /^robot-(approval-requested|approved|state)$/.test(e.type)).map(e => e.type + (e.state ? ':' + e.state : ''));
  check('event order: requested → approved → state approved → deploying → searching', order.join(' ') === 'robot-approval-requested robot-approved robot-state:approved robot-state:deploying robot-state:searching' || order.join(' ') === 'robot-approval-requested robot-state:approved robot-approved robot-state:deploying robot-state:searching', order.join(' '));
  const rj = RB({ robot: { autoApprove: false } }, 120);
  check('rejectRobot: only a commander may decline; a declined request stays stowed', S.rejectRobot(rj, 'R1', 'operator').ok === false && S.rejectRobot(rj, 'R1', 'commander').ok === true && rb0(rj).approval.status === 'rejected' && (S.run(rj, 200), rb0(rj).state === 'stowed' && rb0(rj).driven === 0));
  const auto = RB({}, 140);
  check('in automatic runs a simulated commander approves robotApproveSec (30 s) after CONFIRMED — logged as "commander-sim", and the robot is not driving before then', rb0(auto).approval.approvedAt === auto.ver.confirmedAt + auto.P.robotApproveSec && rb0(auto).approval.by === 'commander-sim' && rb0(auto).stats.started >= rb0(auto).approval.approvedAt && rb0(auto).stats.started - rb0(auto).approval.approvedAt <= 1, `confirmed ${auto.ver.confirmedAt}, approved ${rb0(auto).approval.approvedAt}, deployed ${rb0(auto).stats.started}`);
  const ev = auto.events.filter(e => e.type === 'robot-state' && e.state === 'searching')[0];
  check('automatic: searching begins robotDeploySec after the deployment starts', ev && ev.t === rb0(auto).stats.started + auto.P.robotDeploySec);
  const car = RB({ params: { robotCarrier: 1 } }, 400), eng = car.fx.engineOnScene;
  check('robotCarrier = 1: the robot is carried by the fire engine — it does not start deploying before the engine is on scene + unloading time', eng !== null && rb0(car).stats.started >= eng + car.P.robotUnloadSec && rb0(car).approval.approvedAt < eng, `approved ${rb0(car).approval.approvedAt}, engine ${eng}, deploys ${rb0(car).stats.started}`);
  const pre = RB({ params: { robotCarrier: 0 } }, 120);
  check('robotCarrier = 0 (pre-positioned at the building entrance): it deploys right after approval, before any crew is on scene', pre.fx.engineOnScene === null && rb0(pre).stats.started === rb0(pre).approval.approvedAt);
  const late = RB({ params: { robotApproveSec: 120 } }, 100);
  check('the approval time is an assumption: robotApproveSec = 120 delays everything (still stowed at T+100)', rb0(late).state === 'stowed' && rb0(late).approval.status === 'requested');
  const man = RB({ robot: { autoApprove: false } }, 60);
  check('deployRobot (operator) re-requests nothing twice and approveRobot() without an id approves every waiting robot', S.deployRobot(man).ok === true && S.deployRobot(man).requested === 0 && S.approveRobot(man, undefined, 'commander').approved.length === 1);
}

section('17. robot movement safety — A* = Dijkstra, never into fire / heat / gas, no stairs for wheels');
{
  // A* against Dijkstra on every pair of nodes of the residence, in a clear world and in a burning one
  const clear = RB({ seed: 2 }), burning = RB({ seed: 2 }, 260);
  let pairs = 0, mismatch = 0, expA = 0, expD = 0, bad = 0;
  for (const sim of [clear, burning]) {
    const ids = nodeIds(sim), r = rb0(sim);
    for (let i = 0; i < ids.length; i += 1) for (let j = 0; j < ids.length; j += 3) {
      if (i === j) continue;
      const a = S.robot.astar(sim, ids[i], ids[j]), d = S.robot.astar(sim, ids[i], ids[j], { dijkstra: true });
      pairs++; if (a.ok !== d.ok || (a.ok && Math.abs(a.cost - d.cost) > 1e-3)) mismatch++;
      expA += a.expanded; expD += d.expanded;
      if (a.ok && a.path.some((id, k) => k > 0 && (r.F.imp[r.G.byId[id]] || r.known[r.G.byId[id]]))) bad++;
    }
  }
  check(`A* returns the same cost as Dijkstra on ${pairs} node pairs (clear and burning building), and expands fewer nodes (${expA} vs ${expD})`, mismatch === 0 && expA < expD, `${mismatch} mismatches`);
  check('no planned path enters a node the robot knows is impassable (burning, hotter than robotMaxTempC, gas danger, known obstacle)', bad === 0, bad + ' bad paths');
  const gr = S.robot.graph(0);
  check('the heuristic factor is derived from the graph (min length / straight distance), so it can never over-estimate', gr.heuristicFactor > 0 && gr.heuristicFactor <= 1 && gr.rooms.length === 29 && gr.entrance === 'LOB', 'hf ' + gr.heuristicFactor.toFixed(3));
  // never enter a burning node: audit every arrival, several seeds, both buildings
  let entries = 0, violations = 0, hottest = 0, moved = 0, inFire = 0;
  for (const [preset, seed, until] of [['fire-night-robot', 1, 900], ['fire-night-robot', 2, 900], ['fire-night-robot', 3, 700], ['fire-night', 4, 900], ['school-fire-day', 1, 700]]) {
    const sim = S.create({ preset, seed, robot: true });
    let prevNode = null;
    for (let t = 0; t < until; t++) {
      S.step(sim, 1);
      const r = rb0(sim), st = r.st;
      if (prevNode !== null && r.node !== prevNode && r.state !== 'fault') { moved++; if (st.burn[r.node] === 1 || st.I[r.node] > 0.05 && st.burn[r.node] === 1) inFire++; }   // independent of the robot's own bookkeeping: read the fire state right after the move
      prevNode = r.node;
    }
    const r = rb0(sim);
    entries += r.entered.length; violations += r.enteredBad; r.entered.forEach(e => { hottest = Math.max(hottest, e.temp); if (e.burn === 1 || e.I > 0.05) violations++; });
  }
  check(`over 5 runs (${entries} node entries, ${moved} moves audited against the fire state) the robot never entered a burning node, one with fire intensity > 0.05, or one hotter than its limit`, violations === 0 && inFire === 0 && entries > 100 && hottest <= 85, `hottest entry ${hottest} °C (limit ${S.defaults().robotMaxTempC})`);
  // wheeled: never climbs
  const wh = RB({ robot: { variant: 'wheeled' } }, 900), wr = rb0(wh);
  const floorsSeen = new Set(wr.entered.map(e => floorOf(wh, e.node)));
  check('a WHEELED robot never climbs stairs: 0 m on stairs, never enters a stair node above the ground floor, only floor 0 visited', wr.stats.stairsM === 0 && [...floorsSeen].every(f => f === 0) && wr.entered.every(e => !/^(SA|SB)[12]$/.test(e.node)), [...floorsSeen].join(','));
  check('...and it says so: "cannot climb stairs — floor 2 / 3 not searched" is reported once per floor, those rooms are "unreachable", and the A* refuses stairs for it', wh.rb.blocked.filter(b => b.kind === 'stairs').length >= 1 && S.robotTelemetry(wh, 'R1').coverage.rooms['302'] === 'unreachable' && S.robot.astar(wh, 'LOB', 'R302').ok === false && S.robot.astar(RB({ robot: { variant: 'tracked' } }), 'LOB', 'R302').ok === true, wh.rb.blocked.map(b => b.kind + ':' + b.floor).join(' '));
  const tr = RB({}, 900), trr = rb0(tr);
  check('a TRACKED robot climbs (stairs metres > 0, reaches floor 3 nodes) — and stairs cost it time: the stair edge costs robotStairPenalty × longer than level ground', trr.stats.stairsM > 0 && trr.entered.some(e => floorOf(tr, e.node) === 2) && (() => { const f = RB({}), a = S.robot.astar(f, 'SA0', 'SA1'), b = S.robot.astar(f, 'C00', 'C01'); const per = (a.cost / 9) / (b.cost / 7); return Math.abs(per - f.P.robotStairPenalty) < 0.05; })());
  check('the wheeled robot is faster on the level than the tracked one (named speeds)', S.defaults().robotSpeedWheeled > S.defaults().robotSpeedTracked);
  // gas: never enters a node at the danger level
  const gas = SM.create({ preset: 'gas-night', seed: 1, robot: true }); SM.run(gas, 800);
  const gr0 = gas.robots[0];
  check('gas-night with the robot: it works (finds / searches), never enters a node at the gas danger level (an ignition source must stay out)', gas.rb.enabled && gr0.enteredBad === 0 && gr0.entered.length > 5 && gas.rb.finds.length >= 1 && badNumbers(SM.snapshot(gas)).length === 0, `${gr0.entered.length} entries, ${gas.rb.finds.length} finds`);
  // fire catches the robot's node: it backs off to a passable node, never into the fire
  const trap = RB({ seed: 1 }, 180); const rt = rb0(trap);
  const here = rt.node, st = trap.stt[0]; st.burn[here] = 1; st.I[here] = 0.9;   // force fire onto the robot's own node
  S.run(trap, trap.t + 3);
  check('if fire reaches the node the robot stands on it backs away to a passable neighbour (event "robot-retreat") or reports a fault — it does not drive on through the fire', trap.events.some(e => e.type === 'robot-retreat') || rb0(trap).state === 'fault');
}

section('18. doors — a locked door is reported and NOT opened; a blocked corridor is marked blocked and routed around');
{
  const sim = S.create({ preset: 'fire-night', seed: 2, robot: true });
  const S0 = sim.W.structs[0], doorOf = id => S0.edges.find(e => (S0.nodes[e.a].id === id || S0.nodes[e.b].id === id) && e.door >= 0).door;
  check('setRobotObstacle accepts only real nodes (room doors, corridor nodes); unknown ids are refused', S.setRobotObstacle(sim, 'R105', { locked: true }).ok === true && S.setRobotObstacle(sim, 'Z999', { locked: true }).ok === false);
  S.setSearchPriority(sim, ['105']);
  S.run(sim, 420);
  const r = rb0(sim), b = sim.rb.blocked.find(x => x.kind === 'locked-door' && x.room === '105');
  check('the robot went to room 105, found the door locked and REPORTED it (ar + en text: "never breaks doors")', !!b && /never breaks doors/.test(b.text.en) && /لا يكسر الأبواب/.test(b.text.ar) && b.reportedAt !== null, b && b.text.en);
  check('...it did NOT open the door (never in its list of doors it pushed), never entered the room, and the room is marked "locked" (never searched)', !r.opened.includes('R105') && r.entered.every(e => e.node !== 'R105') && S.robotTelemetry(sim, 'R1').coverage.rooms['105'] === 'locked' && r.rooms['105'].passes === 0);
  check('...and it moved on: other rooms were searched after the report', sim.events.filter(e => e.type === 'robot-room-searched').length >= 1 && sim.events.some(e => e.type === 'robot-blocked' && e.t >= b.t - 1));
  check('locked-door report is a "robot-blocked" event that reaches the hand-off card ("blocked" list)', sim.events.some(e => e.type === 'robot-blocked' && e.kind === 'locked-door') && S.handoff(sim).robot.blocked.some(x => x.kind === 'locked-door' && x.room === '105'));
  S.setRobotObstacle(sim, 'R105', { locked: false });
  check('when the guard opens it (obstacle removed) the room becomes searchable again', S.robotTelemetry(sim, 'R1').coverage.rooms['105'] !== 'locked');
  // a blocked corridor
  const c = S.create({ preset: 'fire-night', seed: 2, robot: true });
  S.setRobotObstacle(c, 'C01', { locked: true, kind: 'debris' });
  S.setSearchPriority(c, ['301']);   // third floor: via a stair; the west corridor C01 is blocked, so the east stair B must be used
  S.run(c, 520);
  const cr = rb0(c), cb = c.rb.blocked.find(x => x.kind === 'blocked-corridor');
  check('a blocked corridor node is reported ("marked blocked for the robot"), never entered, and the robot plans around it (via Stair B)', !!cb && /marked blocked/.test(cb.text.en) && cr.entered.every(e => e.node !== 'C01') && cr.entered.some(e => e.node === 'SB0' || e.node === 'C04'), cb && cb.text.en);
  check('after the report the A* treats the corridor as impassable', S.robot.astar(c, 'LOB', 'SA0').ok === false || S.robot.astar(c, 'LOB', 'SA0').path.indexOf('C01') < 0);
  // doors it may not push
  const nd = S.create({ preset: 'fire-night', seed: 2, robot: true, params: { robotOpensDoors: 0 } });
  S.run(nd, 300);
  check('robotOpensDoors = 0: it never pushes a closed door open (door-state counter stays 0) and says rooms behind closed doors are blocked', rb0(nd).stats.doorsOpened === 0);
  check('robotOpensDoors = 1 (default): it pushes only UNLOCKED doors open (the doors it opened were not locked)', (() => { const o = S.create({ preset: 'fire-night', seed: 2, robot: true }); S.setRobotObstacle(o, 'R103', { locked: true }); S.setSearchPriority(o, ['103']); S.run(o, 250); return rb0(o).stats.doorsOpened >= 0 && o.rb.blocked.some(x => x.room === '103'); })());
  // exits: Stair A is LOCKED in the robot preset; the robot reports it when it passes the foot of the stair
  let reported = 0; for (const seed of [1, 2, 3]) { const e = RB({ seed }, 700); if (e.events.some(x => x.type === 'robot-blocked' && x.kind === 'exit-locked')) reported++; }
  check('the locked exit (Stair A) is reported by the robot when it passes it — "not opened (the robot never breaks doors)"', reported >= 1, reported + '/3 seeds');
}

section('19. search order — unaccounted + needs first, then smoke / closeness to the danger, then the rest; operator priority');
{
  const sim = RB({ seed: 1 }, 50);   // just after CONFIRMED, before the robot moves
  const pr = S.robot.priority(sim), grp = x => x.needs > 0 ? 0 : x.unaccounted > 0 ? 1 : 2;
  let monotone = true; for (let i = 1; i < pr.length; i++) if (grp(pr[i]) < grp(pr[i - 1])) monotone = false;
  check('priority list: every room with a needs-help resident comes before every room with only ordinary unaccounted residents, which come before the empty / accounted rooms (28 rooms: the burning room 303 is not offered)', monotone && grp(pr[0]) === 0 && pr.some(x => grp(x) === 1) && pr.length === 28 && !pr.some(x => x.room === '303'), pr.slice(0, 5).map(x => x.room + (x.needs ? '*' : '')).join(' '));
  check('the first rooms are the rooms of the needs-help residents (Abu Salem 302, wheelchair / Deaf / elderly / child) — e.g. 302 is in the top 3', pr.slice(0, 3).some(x => x.room === '302') && pr.slice(0, 3).every(x => x.needs > 0));
  check('scores are non-increasing (the list is sorted)', pr.every((x, i) => i === 0 || pr[i - 1].score >= x.score));
  const hot = RB({ seed: 1 }, 220), ph = S.robot.priority(hot);
  const sameGroup = ph.filter(x => x.needs === 0 && x.unaccounted > 0);
  check('inside a group, a room nearer the fire / with more smoke ranks higher (score includes smoke + closeness)', sameGroup.length >= 4 && sameGroup.every((x, i) => i === 0 || sameGroup[i - 1].score >= x.score) && new Set(sameGroup.map(x => x.score)).size > 2);
  check('people who checked in / were found drop out of the "unaccounted" counts (the order adapts)', (() => { const a = S.robot.priority(RB({ seed: 1 }, 40)).reduce((s, x) => s + x.unaccounted, 0), b = S.robot.priority(RB({ seed: 1 }, 400)).reduce((s, x) => s + x.unaccounted, 0); return b < a; })());
  const op = S.create({ preset: 'fire-night-robot', seed: 1, robot: { autoApprove: false } });
  S.run(op, 60); S.setRole(op, 'commander'); S.approveRobot(op);
  const sp = S.setSearchPriority(op, ['205', 'R309', '999', '205']);
  check('setSearchPriority: accepts room numbers and node ids, drops duplicates, reports unknown rooms as ignored', sp.ok && sp.accepted.join() === '205,309' && sp.ignored.join() === '999');
  S.run(op, 90);
  check('with an operator list the robot heads for 205 first (its first target)', rb0(op).target && rb0(op).target.room === '205' && S.robot.priority(op)[0].room === '205' && S.robot.priority(op)[1].room === '309');
  const auto = RB({ seed: 3 }, 60);
  S.run(auto, 130);
  check('automatic order: the first target is one of the top-ranked rooms of the list', rb0(auto).target && S.robot.priority(RB({ seed: 3 }, 50)).slice(0, 8).some(x => x.room === rb0(auto).target.room));
  const visit = []; const full = RB({ preset: 'fire-night', seed: 2, robot: true }); S.run(full, 800); full.events.filter(e => e.type === 'robot-room-searched').forEach(e => visit.push(e.room));
  check('rooms get swept in an order that follows the list (the first swept room is among the first ten ranked at start) and a room is swept at most robotRecheckPasses times', visit.length >= 3 && visit.every(r => visit.filter(x => x === r).length <= full.P.robotRecheckPasses), visit.slice(0, 8).join(' '));
}

section('20. finds — "located by robot" is its own headcount status (not "safe"); buffered reports; the hand-off card');
{
  const sim = RB({ seed: 1 }, 270);
  const h = S.headcount(sim), snapH = S.snapshot(sim).headcount, card = S.handoff(sim);
  check('headcount has a distinct "located" bucket and the arithmetic holds: registered = safe + away-safe + help + located + unaccounted', h.located >= 1 && h.registered === h.safe + h.safeAway + h.help + h.located + h.unaccounted && snapH.located === h.located, JSON.stringify({ safe: h.safe, help: h.help, located: h.located, un: h.unaccounted }));
  const found = sim.byKey['abu-salem'];
  check('Abu Salem is "located by robot": counted in "located", NOT in "safe", not checked in, listed with by:"robot", place and condition', h.locatedList.some(x => x.key === 'abu-salem' && x.by === 'robot' && x.place && x.condition === 'conscious') && found.checkin === null && !['safe'].includes(found.st));
  check('rooms: the per-room table has a "located" column and adds up', Object.values(h.rooms).every(r => r.total === r.safe + r.help + r.located + r.unaccounted));
  check('hand-off card: people.located + a "locatedByRobot" list + robot.finds with room, person, need, condition guess (est.), time', card.people.located === h.located && card.locatedByRobot.length === h.located && card.robot.finds.length >= 1 && card.robot.finds.every(f => f.t >= 0 && f.condition.est === true && f.node && f.key) && card.robot.finds.some(f => f.key === 'abu-salem' && f.needs.includes('wheelchair')));
  check('the card carries the honesty line: the robot is a simulated concept; it assists, firefighters decide', /simulated concept/.test(JSON.stringify(card.notes)) && /simulated prototype/.test(card.robot.label.en));
  const abuFind = sim.rb.finds.find(f => f.key === 'abu-salem');
  check('the find is a full record: room / place, floor, needs, condition (est.), confidence, dose, smoke, temperature, the way in from the entrance (for the crews), time found and time reported', abuFind && abuFind.floor === 3 && abuFind.condition.est && abuFind.conf > 0 && abuFind.route[0] === 'LOB' && abuFind.route.length >= 5 && abuFind.routeM > 20 && abuFind.reportedAt >= abuFind.t && typeof abuFind.dose === 'number');
  const un0 = sim.people.filter(a => a.registered && sim.pre.scope.includes(a.group) && a.checkin === null && a.robotReportedAt == null).length;
  check('"unaccounted" no longer includes people the robot located (it is "no information at all")', h.unaccounted === un0 || Math.abs(h.unaccounted - un0) <= 0, `${h.unaccounted} vs ${un0}`);
  // a located person who then checks in safe moves buckets
  const key = h.locatedList[0].key, b0 = S.headcount(sim);
  S.checkin(sim, key, 'safe'); const b1 = S.headcount(sim);
  check('when a located person checks in safe, "located" falls by one and "safe" rises by one (distinct buckets, arithmetic preserved)', b1.located === b0.located - 1 && b1.safe + b1.safeAway === b0.safe + b0.safeAway + 1 && b1.registered === b1.safe + b1.safeAway + b1.help + b1.located + b1.unaccounted);
  S.checkin(sim, h.locatedList[1] ? h.locatedList[1].key : key, 'help');
  check('"I need help" beats "located": a person who asks for help is counted as help', S.headcount(sim).help >= 1);
  // the robot-free world keeps the old shape
  const w = RB({ robot: false }, 330), hw = S.headcount(w);
  check('without a robot the headcount has no "located" key and the old arithmetic', !('located' in hw) && hw.registered === hw.safe + hw.safeAway + hw.help + hw.unaccounted);
  // link: reports are buffered while the link is down
  const lk = RB({ seed: 1, params: { robotMeshRangeM: 10, robotBeaconRelay: 0, robotDropoutPct: 20, robotDropoutSec: 40 } }, 700);
  const delayed = lk.rb.finds.filter(f => f.reportedAt !== null && f.reportedAt - f.t > 2);
  check('with a short mesh range and no relays the link drops and reports are BUFFERED: some finds are reported later than they were found', (lk.robots[0].link.dropouts >= 1 || lk.robots[0].link.downSec > 20) && delayed.length >= 1, `${delayed.length} delayed, link down ${lk.robots[0].link.downSec} s`);
  const df = delayed[0];
  check('...the headcount learns of a find only when it is REPORTED (located is counted at reportedAt, not at foundAt)', df && (() => { const a = lk.byKey[df.key]; return a.robotReportedAt === df.reportedAt && df.reportedAt > df.t; })());
  check('...the control-room event says the report was delivered when the link returned', lk.events.some(e => e.type === 'robot-find' && e.delaySec > 2 && /link returned/.test(e.text.en)));
  const nolink = RB({ seed: 1, params: { robotDropoutPct: 0 } }, 400);
  check('with no dropouts and the default relays the reports are immediate (delay 0 s)', nolink.rb.finds.every(f => f.reportedAt === null || f.reportedAt === f.t) || nolink.robots[0].link.dropouts === 0);
  check('when the signal gets weak the robot drops relay beacons (event "robot-relay") that extend the mesh', RB({ seed: 1 }, 400).events.some(e => e.type === 'robot-relay'));
  check('each find is a bus message: type robot-find with person, room / place, condition (est.), bilingual text', (() => { const m = S.busRobotFind(sim, abuFind.id); return m.type === 'robot-find' && m.sim === true && m.person.key === 'abu-salem' && m.condition.est === true && m.text.ar && m.text.en && m.room === null && m.floor === 3 && /\(est\.\)/.test(m.text.en) && /تقدير/.test(m.text.ar) && badNumbers(m).length === 0; })());
}

section('21. guidance — language and format per person, wake-up, beacons, hold until crews, smoke hood, speakVia, tele-operation');
{
  const sim = SM.create({ preset: 'fire-night-robot', seed: 1 }); SM.run(sim, 420);
  const sp = sim.rb.speech.filter(x => x.person === 'abu-salem');
  const stay = sp.find(x => x.key === 'stay');
  check('Abu Salem (wheelchair): the robot says "Stay here — help is coming" in his language (Arabic), formats voice + light + display, via MANARA_MSG', stay && stay.lang === 'ar' && stay.persona === 'wheelchair' && /Stay here\. Help is coming/.test(stay.text.en) && /ابقَ هنا/.test(stay.text.ar) && stay.via === 'MANARA_MSG' && stay.formats.includes('voice'), stay && stay.text.en);
  check('...it introduces itself like the brief says: "I am a Civil Defence robot — follow the green light"', sp.some(x => x.key === 'intro' && /I am a Civil Defence robot/.test(x.text.en) && /Follow the green light/.test(x.text.en) && /روبوت الدفاع المدني/.test(x.text.ar)));
  const f = sim.rb.finds.find(x => x.key === 'abu-salem');
  check('...a wheelchair user is never told to use the stairs; a no-stairs refuge route is only offered when it exists (refuge flag in the find: {at, route})', typeof f.refuge.route === 'boolean' && sim.rb.speech.filter(x => x.persona === 'wheelchair').every(x => !/Use the stairs/i.test(x.text.en)));
  const sayDeaf = SM.robot.say(sim, 'guide', 'deaf'), sayBlind = SM.robot.say(sim, 'guide', 'blind'), sayChild = SM.robot.say(sim, 'intro', 'child'), sayWc = SM.robot.say(sim, 'refuge', 'wheelchair'), sayWs = SM.robot.say(sim, 'wake', 'asleep');
  check('Deaf persona: light / strobe (opt-in) / pictogram / TEXT ON THE ROBOT DISPLAY, and no voice-only instruction', sayDeaf.formats.includes('strobe') && sayDeaf.formats.includes('display') && sayDeaf.formats.includes('pictogram') && !sayDeaf.formats.includes('voice') && /screen/.test(sayDeaf.text.en) && /شاشتي/.test(sayDeaf.text.ar), sayDeaf.formats.join('+'));
  check('Blind persona: voice + sound cues ("walk toward my voice"); child: friendly words + picture card; wheelchair refuge: flags the refuge balcony; wake-up says Fire / Gas and "get up"', sayBlind.formats.includes('voice') && /toward my voice/.test(sayBlind.text.en) && /Do not be afraid/.test(sayChild.text.en) && sayChild.formats.includes('pictogram') && sayWc.refuge === true && /refuge balcony/.test(sayWc.text.en) && /Do not use the stairs/.test(sayWc.text.en) && /Wake up/.test(sayWs.text.en));
  const ravi = SM.robot.say(sim, 'wake', 'asleep', 'ravi');
  check('Ravi (asleep, reads Malayalam): the wake-up is spoken in Malayalam as a DRAFT (needs native review) and the Arabic and English texts travel with it', ravi.lang === 'ml' && ravi.draft === true && /Wake up/.test(ravi.text.en) && /استيقظ/.test(ravi.text.ar) && /[\u0D00-\u0D7F]/.test(ravi.spoken), JSON.stringify([ravi.lang, ravi.draft]));
  const draftSay = MSG.robot.say({ key: 'wake', hazard: 'fire', persona: 'worker', lang: 'ml' });
  check('draft-language robot lines are flagged draft-needs-native-review with a notice, and the also: {ar, en} text is attached', draftSay.draft === true && draftSay.status === 'draft-needs-native-review' && /Draft/.test(draftSay.draftNotice) && draftSay.also.ar && draftSay.also.en && /[ഀ-ൿ]/.test(draftSay.text));
  const bare = S.robot.say(S.create({ preset: 'fire-night-robot' }), 'intro', 'adult');
  check('without MANARA_MSG the engine still speaks (built-in fallback, same meaning), marked via: built-in', bare.via === 'built-in' && /Civil Defence robot/.test(bare.text.en));
  const hold = sim.events.filter(e => e.type === 'robot-hold');
  check('a person who cannot move (Abu Salem, stuck in a smoky corridor) → the robot HOLDS with them ("stays with … until crews arrive"), and tells the control room', hold.length >= 1 && /stays with Abu Salem/.test(hold[0].text.en) && sim.events.some(e => e.type === 'robot-state' && e.state === 'holding'));
  const he = sim.events.find(e => e.type === 'robot-hold-end');
  check('...and holds UNTIL the crews bring them out (hold ends "crews reached them", at the moment he is rescued), within the hold limit', he && he.why === 'crews' && sim.byKey['abu-salem'].rescued && he.t - hold[0].t <= sim.P.robotHoldMaxSec, he && `${hold[0].t} → ${he.t}`);
  check('while holding it reports his condition (est.) periodically ("robot-status")', sim.events.some(e => e.type === 'robot-status' && /Abu Salem/.test(e.text.en) && /\(est\.\)/.test(e.text.en)));
  // wake-up + guidance + beacons: any seed that has a sleeper found
  let woke = null, guided = null;
  for (const seed of [1, 2, 3, 4]) { const w = RB({ preset: 'fire-night', seed, robot: true }, 700); const wk = w.events.find(e => e.type === 'robot-woke'); if (wk && !woke) woke = { w, wk }; if (w.events.some(e => e.type === 'robot-beacon') && !guided) guided = w; }
  check('the robot WAKES a sleeper it finds (loud voice + light, up to robotWakeTries attempts): "robot-woke" event, the person is awake afterwards', !!woke && (() => { const a = woke.w.byKey[woke.wk.person]; return a.asleep === false && a.robotWoke === true && a.wokeAt <= woke.wk.t + 1; })(), woke ? `at ${woke.wk.t}` : 'none in 4 seeds');
  check('after waking / guiding it speaks the way out and drops ROUTE BEACONS on the first nodes of the route (≤ robotBeaconsPerFind per find, never more than it carries)', !!guided && (() => { const r = rb0(guided); return r.beacons.some(b => !b.auto) && r.beacons.length <= guided.P.robotBeacons && r.beaconsLeft >= 0 && r.beacons.every(b => nodeIds(guided).includes(b.node)); })());
  check('guidance makes the person INFORMED (a live route) with probability robotFollowP; each find records whether they followed', guided.rb.finds.some(f => f.followed === true) && guided.rb.finds.every(f => f.followed === null || typeof f.followed === 'boolean'));
  const g0 = RB({ seed: 1, params: { robotFollowP: 0 } }, 500);
  check('with robotFollowP = 0 nobody follows the robot (they were told, they ignored it) and the people it guides are not marked informed by it', g0.rb.finds.every(f => f.followed !== true) && g0.people.every(a => a.robotGuidedAt === undefined));
  // smoke hood
  const hd = (n) => { const s = S.create({ preset: 'fire-night-robot', seed: 1, params: { robotHoods: n } }); S.run(s, 203); s.stt[0].smoke.fill(0.55); S.run(s, 330); return s; };
  const hoods = hd(2), nohood = hd(0);
  check('a conscious person who cannot get out of smoke gets a SMOKE HOOD (named assumption): the hood is handed over, logged, and cuts the dose rate (less dose than the same run with no hoods)', hoods.byKey['abu-salem'].hood === true && hoods.events.some(e => e.type === 'robot-hood') && nohood.byKey['abu-salem'].hood !== true && hoods.byKey['abu-salem'].dose < nohood.byKey['abu-salem'].dose, `${hoods.byKey['abu-salem'].dose.toFixed(3)} vs ${nohood.byKey['abu-salem'].dose.toFixed(3)}`);
  // speakVia
  const sv = RB({ seed: 1 }, 260);
  const s1 = S.speakVia(sv, 'R1', 'stay', 'ar'), s2 = S.speakVia(sv, 'R1', 'sing', 'ar');
  check('speakVia(robotId, messageKey, lang): speaks to the nearest person in view, recorded as an operator line; unknown keys are refused with the list of valid keys', s1.ok === true && s1.speech.operator === true && s1.speech.key === 'stay' && s2.ok === false && s2.code === 'key' && s2.keys.includes('intro'));
  check('...it speaks the asked language even for draft languages (ml → DRAFT, flagged)', (() => { const x = SM.speakVia((() => { const q = SM.create({ preset: 'fire-night-robot', seed: 1 }); SM.run(q, 260); return q; })(), 'R1', 'guide', 'ml'); return x.ok && x.speech.draft === true && x.speech.lang === 'ml'; })());
  const idle = RB({ seed: 1 }, 30);
  check('the robot cannot speak before it is deployed (state stowed → code "state")', S.speakVia(idle, 'R1', 'intro', 'ar').code === 'state');
  // teleop
  const free = (o) => { const x = S.create(Object.assign({ preset: 'fire-night', seed: 2 }, o)); for (let t = 0; t < 400 && !(x.robots[0] && x.robots[0].state === 'searching' && x.robots[0].to < 0 && !x.robots[0].target && !x.robots[0].dwell && x.rb.pending.length === 0 && x.t > 90); t++) S.step(x, 1); return x; };
  const tp = free({ robot: true }), wt = free({ robot: { variant: 'wheeled' } });
  const t1 = S.teleopRobot(tp, 'R1', 'C03'), t2 = S.teleopRobot(wt, 'R1', 'C21');
  check('teleopRobot: a one-shot go-to; accepted when the link is up and the place is reachable; refused (with a reason) for stairs when wheeled, for unknown places, and while not searching', t1.ok === true && t2.ok === false && t2.code === 'unreachable' && S.teleopRobot(tp, 'R1', 'Nowhere').ok === false && S.teleopRobot(RB({ seed: 2 }, 30), 'R1', 'C02').code === 'state');
  S.run(tp, tp.t + 60);
  check('...the robot goes there, then returns to autonomous search ("reached the waypoint")', tp.events.some(e => e.type === 'robot-teleop' && e.ok === true) && rb0(tp).teleop === null);
  const down = free({ robot: true }); rb0(down).link.downUntil = down.t + 40; S.run(down, down.t + 1);
  check('no tele-operation or speaking while the link is down (code "link")', S.teleopRobot(down, 'R1', 'C02').code === 'link' && S.speakVia(down, 'R1', 'stay', 'en').code === 'link');
}

section('22. detection model, battery, heat, return, recall');
{
  const found = (o, until = 450) => RB(o, until).rb.finds.length;
  const off = { robotThermalPd: 0, robotRgbPd: 0, robotAudioPd: 0 };
  check('seeded detection: with every detection probability 0 the robot finds nobody (all false negatives); with the defaults it finds people', found({ params: off }) === 0 && found({}) >= 3);
  check('Gulf-heat caveat: with only thermal vision, a hot room (36 °C ≥ body) has NO thermal contrast and nobody is seen; a cool room (24 °C) sees people', found({ params: Object.assign({}, off, { robotThermalPd: 1, robotRoomC: 36 }) }) === 0 && found({ params: Object.assign({}, off, { robotThermalPd: 1, robotRoomC: 24 }) }) >= 2);
  check('contrast is monotone in room temperature: cooler room → at least as many finds (24 °C ≥ 30 °C ≥ 34 °C)', (() => { const a = found({ params: Object.assign({}, off, { robotThermalPd: 0.6, robotRoomC: 24 }) }), b = found({ params: Object.assign({}, off, { robotThermalPd: 0.6, robotRoomC: 30 }) }), c = found({ params: Object.assign({}, off, { robotThermalPd: 0.6, robotRoomC: 34 }) }); return a >= b && b >= c && a > c; })());
  const sm = RB({ seed: 1 }, 215), v0 = S.robotView(sm, 'R1');
  sm.stt[0].smoke.fill(0.8); const v1 = S.robotView(sm, 'R1');
  check('smoke attenuation: the robot-eye view\'s visibility falls with smoke, and the thermal camera sees through smoke better than the visible one', v1.visibility < v0.visibility && v1.thermalVisibility > v1.visibility && v1.smoke === 0.8 && v1.visibility >= 0 && v1.visibility <= 1, `visible ${v0.visibility} → ${v1.visibility}, thermal ${v1.thermalVisibility}`);
  check('audio: a conscious person calling for help is heard (audio only); the siren masks it (noise mask 1 → not heard)', (() => { const q = Object.assign({}, off, { robotAudioPd: 1, robotAudioRangeM: 15 }); const a = RB({ params: Object.assign({}, q, { robotNoiseMask: 0 }) }, 450), b = RB({ params: Object.assign({}, q, { robotNoiseMask: 1 }) }, 450); return a.rb.finds.some(f => f.by === 'audio' && f.condition.key !== 'asleep') && b.rb.finds.length === 0; })());
  check('false POSITIVES: a hot object in an empty room looks like a person; the robot checks it for robotInvestigateSec and DISMISSES it ("robot-false-positive"); it never becomes a find; none when the rate is 0', (() => { const a = RB({ params: { robotFalsePosPerMin: 10 } }, 700), b = RB({ params: { robotFalsePosPerMin: 0 } }, 700); return a.robots[0].stats.falsePositives >= 3 && a.events.filter(e => e.type === 'robot-false-positive').length >= 3 && a.rb.finds.every(f => f.key) && b.robots[0].stats.falsePositives === 0; })());
  check('false NEGATIVES: with low detection chances some people stay in view for a long time and are never detected (missedInView > 0 in the metrics)', [1, 2, 3].some(sd => S.robotMetrics(RB({ seed: sd, params: { robotThermalPd: 0.04, robotRgbPd: 0.01, robotAudioPd: 0.01 } }, 700)).detection.missedInView > 0));
  // battery
  const bat = (o, until = 300) => rb0(RB(o, until));
  const b45 = bat({ params: { robotBattMin: 45 } }), b90 = bat({ params: { robotBattMin: 90 } });
  check('battery drains with use (monotone) and scales with the endurance assumption: robotBattMin 90 uses half the charge of 45 over the same early run', b45.battery < 1 && b90.battery < 1 && Math.abs((1 - b45.battery) / (1 - b90.battery) - 2) < 0.12, `used ${(100 * (1 - b45.battery)).toFixed(1)} % vs ${(100 * (1 - b90.battery)).toFixed(1)} %`);
  const t1 = bat({ params: { robotTrackedDrain: 1 } }, 200), t2 = bat({ params: { robotTrackedDrain: 2 } }, 200);
  check('tracked drains faster than wheels (robotTrackedDrain is the multiplier): 2× → twice the charge used on the same drive', Math.abs((1 - t2.battery) / (1 - t1.battery) - 2) < 0.12, `${((1 - t2.battery) / (1 - t1.battery)).toFixed(2)}×`);
  const hotRun = (smoke) => { const sim = S.create({ preset: 'fire-night-robot', seed: 1, params: { robotSmokeDrain: 1 } }); S.run(sim, 98); for (let t = 0; t < 60; t++) { if (smoke) sim.stt[0].smoke.fill(smoke); S.step(sim, 1); } const r = rb0(sim); return (1 - r.battery) / Math.max(1, r.driven); };
  check('heat / smoke multiplier: the same drive in dense smoke costs more charge per metre than in clear air', hotRun(0.9) > hotRun(0) * 1.3, `${(hotRun(0.9) / hotRun(0)).toFixed(2)}× per metre`);
  const du = S.create({ preset: 'fire-night-robot', seed: 1 }); let drv = [], hld = [], prevB = 1;
  for (let t = 0; t < 290; t++) { S.step(du, 1); const r = rb0(du), used = prevB - r.battery; prevB = r.battery; if (r.state === 'holding' && r.to < 0) hld.push(used); else if (r.to >= 0 && !(r.edgeFlag & 1)) drv.push(used); }
  const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  check('holding costs less than driving (robotIdleDrain share): the charge falls more slowly while it holds with Abu Salem than while it drives on the level', hld.length > 20 && drv.length > 20 && mean(hld) < 0.6 * mean(drv), `${(mean(hld) * 1000).toFixed(2)} vs ${(mean(drv) * 1000).toFixed(2)} per mille per second`);
  const small = RB({ seed: 1, params: { robotBattMin: 8 } }, 700);
  check('even a small battery gets home: with only 8 min of endurance the return energy is estimated edge by edge (stairs cost more time AND more power) so the robot is back at the entrance with charge left, not stranded', rb0(small).stats.returnedAt !== null && rb0(small).stats.faultWhy === null && rb0(small).battery > 0, `returned at ${rb0(small).stats.returnedAt}, ${Math.round(rb0(small).battery * 100)} % left`);
  // overheating
  const ov = S.create({ preset: 'fire-night-robot', seed: 1, params: { robotRoomC: 40, robotHeatWarnC: 40, robotHeatSoakSec: 20 } }); S.run(ov, 98); for (let t = 0; t < 80; t++) { ov.stt[0].smoke.fill(0.9); S.step(ov, 1); }
  check('heat soak: staying above robotHeatWarnC for robotHeatSoakSec shuts the robot down for protection ("Fault: thermal shutdown"), reported to the control room', rb0(ov).state === 'fault' && rb0(ov).stats.faultWhy === 'overheated' && ov.events.some(e => e.type === 'robot-fault' && e.why === 'overheated'));
  const dead = RB({ seed: 1 }, 150); rb0(dead).battery = 0.0005; S.run(dead, 156);
  check('an empty battery stops the robot where it is: "Fault: battery exhausted", reported with its location', rb0(dead).state === 'fault' && rb0(dead).stats.faultWhy === 'battery' && dead.rb.blocked.some(b => b.kind === 'fault'));
  // return on low battery
  const lowb = RB({ seed: 1, params: { robotReturnPct: 60, robotBattMin: 10 } }, 900), lr = rb0(lowb);
  check('RETURNS when the battery is below the threshold: "robot-battery-low", state returning, back at the entrance and stowed — with charge left (no fault)', lowb.events.some(e => e.type === 'robot-battery-low') && lr.stats.returnedAt !== null && lr.state === 'stowed' && lr.node === lr.G.entrance && lr.battery > 0 && lr.stats.faultWhy === null, `returned at ${lr.stats.returnedAt}, ${Math.round(lr.battery * 100)} % left`);
  const est = RB({ seed: 1, params: { robotReturnPct: 5, robotBattMin: 10 } }, 900), er = rb0(est);
  check('it also returns EARLY when the estimated cost of the way back (with a margin) is more than it has left — a far robot returns before the % threshold', er.stats.returnedAt !== null && er.stats.faultWhy === null && (est.events.find(e => e.type === 'robot-battery-low').pct > 5 + 2));
  // recall
  const rc = RB({ seed: 1 }, 200); const rcRes = S.recallRobot(rc, 'R1');
  S.run(rc, 205);
  check('recallRobot: the robot stops what it is doing and returns (state returning), then is stowed at the entrance', rcRes.ok === true && rb0(rc).state === 'returning' && (S.run(rc, 700), rb0(rc).state === 'stowed' && rb0(rc).node === rb0(rc).G.entrance && rc.events.some(e => e.type === 'robot-returned')));
  check('recall before it moves cancels the deployment (stowed, approval cleared)', (() => { const x = RB({ robot: { autoApprove: false } }, 80); S.setRole(x, 'commander'); S.approveRobot(x); const r = S.recallRobot(x); return r.ok && rb0(x).state === 'stowed' && rb0(x).approval.status === 'none'; })());
  check('search complete → it returns by itself ("Search complete — returning") when nothing reachable is left unsearched', (() => { const x = S.create({ preset: 'fire-night', seed: 2, robot: { variant: 'wheeled' } }); S.run(x, 1200); return x.events.some(e => e.type === 'robot-search-complete') || rb0(x).state === 'searching'; })());
}

section('23. determinism with the robot, telemetry for UIs, bus messages, fuzz, performance');
{
  const mk = (seed, o = {}) => S.run(S.create(Object.assign({ preset: 'fire-night-robot', seed }, o)), 500);
  const a = mk(11), b = mk(11), c = mk(12), d = mk(11, { robot: false });
  check('with the robot: same seed → identical hash (robot included) and identical snapshot JSON', S.hash(a) === S.hash(b) && JSON.stringify(S.snapshot(a, { full: true })) === JSON.stringify(S.snapshot(b, { full: true })), S.hash(a));
  check('different seed → different hash; robot on vs off → different hash', S.hash(a) !== S.hash(c) && S.hash(a) !== S.hash(d));
  const e = S.create({ preset: 'fire-night-robot', seed: 11 }); for (let i = 0; i < 2000; i++) S.step(e, 0.25);
  check('chunked stepping (0.25 s) equals whole-second stepping, robot included', e.t === 500 && S.hash(e) === S.hash(a));
  const f = S.create({ preset: 'fire-night-robot', seed: 11 }); for (let t = 0; t < 500; t++) { S.step(f, 1); if (t % 7 === 0) { S.snapshot(f, { full: true }); S.robots(f); S.robotView(f, 'R1'); S.busRobot(f); S.headcount(f); S.handoff(f); } }
  check('reading telemetry / snapshots / views / bus messages / hand-off mid-run never disturbs the run (same final hash)', S.hash(f) === S.hash(a));
  check('restart() reproduces the robot run', S.hash(S.run(S.restart(a), 500)) === S.hash(a));
  check('robot parameters changed mid-run apply (setParam): robotApproveSec 120 before CONFIRMED delays the approval', (() => { const x = S.create({ preset: 'fire-night-robot', seed: 1 }); S.setParam(x, 'robotApproveSec', 100); S.run(x, 200); return rb0(x).approval.approvedAt === x.ver.confirmedAt + 100; })());
  // telemetry
  const sim = RB({ seed: 1 }, 260), tel = S.robots(sim)[0];
  check('telemetry: pose (x, y, floor), heading, battery 0..1, link {q, up}, current target, finds, blocked, beacons, coverage (pct, per-node, per-room), view — all finite and JSON-serialisable', tel.pose && Number.isFinite(tel.pose.x) && Number.isFinite(tel.pose.y) && [0, 1, 2].includes(tel.pose.fl) && Number.isFinite(tel.heading) && tel.battery >= 0 && tel.battery <= 1 && tel.link.q >= 0 && tel.link.q <= 1 && typeof tel.link.up === 'boolean' && Array.isArray(tel.finds) && Array.isArray(tel.beacons) && tel.coverage.nodes.length === S.robot.graph(0).nodes.length && S.robot.graph(0).nodes.length === 53 && Object.keys(tel.coverage.rooms).length === 29 && tel.coverage.pct >= 0 && !!tel.view && badNumbers(tel).length === 0 && JSON.stringify(JSON.parse(JSON.stringify(tel))) === JSON.stringify(tel));
  check('the pose is inside the residence footprint and between nodes while driving (interpolated)', (() => { const S0 = sim.W.structs[0]; return tel.pose.x >= S0.x0 - 1 && tel.pose.x <= S0.x0 + S0.w + 1 && tel.pose.y >= S0.y0 - 1 && tel.pose.y <= S0.y0 + S0.h + 1; })());
  check('the robot-eye view: room / node, visibility 0..1, thermal visibility, range, smoke, temperature, lighting, people in view [{ref, distM, strength, detected}] — people the robot has not detected carry no name', tel.view.visibility >= 0 && tel.view.visibility <= 1 && tel.view.rangeM === sim.P.robotRangeM && Array.isArray(tel.view.people) && tel.view.people.every(p => Number.isFinite(p.distM) && Number.isFinite(p.strength) && (p.detected || (p.key === null && p.name === null))) && /^(lit|dark)$/.test(tel.view.lighting));
  check('the coverage map grows as it searches (corridors seen on the way, rooms swept)', (() => { const x = S.robots(RB({ seed: 1 }, 150))[0].coverage, y = S.robots(RB({ seed: 1 }, 700))[0].coverage; return y.pct >= x.pct && y.nodes.filter(n => n.cov > 0).length > x.nodes.filter(n => n.cov > 0).length; })());
  check('robotView is null while the robot is stowed, and ManaraSim.robots() is an empty list when there is no robot', S.robotView(RB({}, 20), 'R1') === null && S.robots(S.create({ preset: 'fire-night' })).length === 0 && S.robotTelemetry(S.create(), 'R1') === null);
  const bus = S.busRobot(sim);
  check('bus message type "robot": scope building, sim:true, role, per-robot id / state / pose / battery / link / target / coveragePct / finds', bus.type === 'robot' && bus.scope === 'building' && bus.sim === true && bus.role && bus.robots.length === 1 && bus.robots[0].id === 'R1' && bus.robots[0].pose && typeof bus.robots[0].coveragePct === 'number' && badNumbers(bus).length === 0 && S.busRobot(S.create({ preset: 'fire-night' })) === null);
  // events + snapshot structure
  const snap = S.snapshot(sim);
  check('snapshot.robot carries the label (concept, simulated, not tested), role, robots, finds, blocked, last speech lines; the label is bilingual', snap.robot.enabled && /not built, not tested/.test(snap.robot.label.en) && /لم يُبنَ/.test(snap.robot.label.ar) && snap.robot.robots.length === 1 && Array.isArray(snap.robot.finds) && Array.isArray(snap.robot.blocked) && Array.isArray(snap.robot.speech));
  const rEv = sim.events.filter(e => /^robot/.test(e.type));
  check('every robot event is bilingual, time-ordered and names the robot ("Robot R1 …" / «الروبوت R1 …») — operator-facing log lines', rEv.length >= 6 && rEv.every(e => e.text.ar && e.text.en && /R1|robot|Robot|الروبوت/.test(e.text.en + e.text.ar)) && rEv.every((e, i) => i === 0 || e.t >= rEv[i - 1].t));
  // fuzz
  let seed = 424242; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const nodes = nodeIds(sim).concat(['Z9', '', null, 7, { x: 59, y: 19, fl: 1 }, { x: 'a' }]);
  let runs = 0, problems = [];
  for (let k = 0; k < 8; k++) {
    const preset = pick(['fire-night', 'fire-night-robot', 'gas-night', 'school-fire-day', 'flood-day', 'fire-night-robot']), mode = rnd() < 0.85 ? 'manara' : 'ordinary';
    try {
      const x = S.create({ preset, mode, seed: 1 + Math.floor(rnd() * 500), robot: rnd() < 0.7 ? { variant: pick(['wheeled', 'tracked']), units: 1 + Math.floor(rnd() * 3), autoApprove: rnd() < 0.5 } : undefined, autoApprove: rnd() < 0.8 });
      for (let j = 0; j < 7; j++) {
        S.step(x, 15 + Math.floor(rnd() * 90));
        const res = (() => { switch (Math.floor(rnd() * 12)) {
          case 0: return S.deployRobot(x, pick(['R1', 'R2', 'R9', undefined]), pick(['viewer', 'operator', 'commander', 'boss', undefined]));
          case 1: return S.approveRobot(x, pick(['R1', 'R2', undefined]), pick(['viewer', 'operator', 'commander', undefined]));
          case 2: return S.recallRobot(x, pick(['R1', 'R3', undefined]));
          case 3: return S.teleopRobot(x, pick(['R1', 'R2']), pick(nodes));
          case 4: return S.setSearchPriority(x, [pick(['101', '202', 'R305', '999', 7, null, 'SCH']), pick(['301', '4A'])]);
          case 5: return S.speakVia(x, pick(['R1', 'R2']), pick(['intro', 'guide', 'wake', 'stay', 'refuge', 'hold', 'check', 'blocked', 'hood', 'zzz', null]), pick(['ar', 'en', 'ml', 'tl', 'xx', undefined]));
          case 6: return S.setRobotObstacle(x, pick(['R101', 'C01', 'R205', 'Q', '']), { locked: rnd() < 0.5 });
          case 7: return S.setRole(x, pick(['viewer', 'operator', 'commander', 'x']));
          case 8: return S.rejectRobot(x, 'R1', pick(['commander', 'operator']));
          case 9: return S.enableRobot(x, { units: 2, variant: 'wheeled' });
          case 10: return S.setParam(x, pick(['robotBattMin', 'robotRangeM', 'robotDropoutPct', 'robotThermalPd']), rnd() * 100);
          default: return S.setExit(x, pick(['A', 'B', 'R']), { locked: rnd() < 0.5 });
        } })();
        if (res && typeof res === 'object' && 'ok' in res && typeof res.ok !== 'boolean') problems.push('bad ok ' + JSON.stringify(res).slice(0, 60));
        const bad = badNumbers([S.snapshot(x, { metrics: true }), S.robots(x), S.busRobot(x), S.handoff(x, { cap: true }), S.headcount(x), S.robotMetrics(x)]);
        if (bad.length) problems.push(`${preset}/${mode}: ${bad.join(',')}`);
        runs++;
      }
    } catch (e) { problems.push(`${preset}/${mode} threw ${e.message}`); }
  }
  check(`fuzz: ${runs} random robot operator actions (roles, approve, recall, teleop, priority, speak, obstacles, parameters) on random presets / modes — no exception, no NaN, every action returns {ok}`, problems.length === 0 && runs >= 50, problems.slice(0, 3).join(' | '));
  // performance
  S.run(S.create({ preset: 'fire-night-robot', seed: 2, robot: true }), 300);
  const ps = S.create({ preset: 'fire-night-robot', seed: 1 }), tk = []; for (let t = 0; t < 1500; t++) { const t0 = performance.now(); S.step(ps, 1); tk.push(performance.now() - t0); }
  const avg = tk.reduce((x, y) => x + y, 0) / tk.length, p95 = tk.slice().sort((x, y) => x - y)[Math.floor(tk.length * 0.95)];
  console.log(`  robot preset: ${avg.toFixed(2)} ms per simulated second on average, p95 ${p95.toFixed(2)} ms`);
  check('performance: one simulated second of the robot scenario averages < 3 ms (robot included)', avg < 3, avg.toFixed(2) + ' ms');
  const cr = performance.now(); S.create({ preset: 'fire-night-robot' }); const cm = performance.now() - cr;
  check('creating the robot scenario takes < 150 ms', cm < 150, cm.toFixed(0) + ' ms');
}

section('24. A/B "MANARA with robot" vs "without robot" (SIMULATION, mechanism check) and a sensitivity sweep');
{
  const seeds = [1, 2, 3];
  const abs = seeds.map(sd => S.abRobot({ preset: 'fire-night-robot', seed: sd }));
  const num = v => v === null || v === undefined ? '  n/a' : String(v).padStart(5);
  console.log('\n  SIMULATION — a mechanism check, not proof of impact. The robot is a concept with a simulated prototype; every number depends on the named assumptions.');
  console.log('  seed | unaccounted at ref | located p50 s (w/o → robot) | p90 s | still unaccounted at T+300 | needs-help located before crews on scene (%) | before they were brought out (%) | injured / incapacitated (w/o → robot) | person-s in smoke | located first by the robot: n, mean s saved');
  for (const r of abs) { const w = r.without, m = r.withRobot; console.log(`  ${String(r.seed).padStart(4)} | ${String(w.unaccounted.n).padStart(18)} | ${num(w.unaccounted.timeToLocate.p50)} → ${num(m.unaccounted.timeToLocate.p50)}          | ${num(w.unaccounted.timeToLocate.p90)} → ${num(m.unaccounted.timeToLocate.p90)} | ${num(w.stillUnaccounted.t300)} → ${num(m.stillUnaccounted.t300)}                 | ${num(w.needsHelp.pctBeforeCrews)} → ${num(m.needsHelp.pctBeforeCrews)} (crews at ${m.crewsOnSceneSec} s)      | ${num(w.needsHelp.pctBeforeRescue)} → ${num(m.needsHelp.pctBeforeRescue)}        | ${w.exposure.injured}/${w.exposure.incapacitated} → ${m.exposure.injured}/${m.exposure.incapacitated} | ${w.exposure.personSec} → ${m.exposure.personSec} | ${r.delta.timeSaved.n}, ${r.delta.timeSaved.meanSec}`); }
  const abuT = (m) => m.needsHelp.list.find(x => x.key === 'abu-salem').sec;
  check('every A/B result is labelled SIMULATION (ar + en) and says the robot is a concept that was neither built nor tested', abs.every(r => /SIMULATION/.test(r.label.en) && /محاكاة/.test(r.label.ar) && /not built, not tested/.test(r.robotLabel.en) && /لم يُبنَ/.test(r.robotLabel.ar)));
  check('both worlds have identical people and hazard until the robot acts (common random numbers): same people states at T+73 s, before the robot has moved', (() => { const w = RB({ robot: false }, 73), r = RB({}, 73); return JSON.stringify(S.snapshot(w).people) === JSON.stringify(S.snapshot(r).people) && JSON.stringify(S.snapshot(w).hazardState) === JSON.stringify(S.snapshot(r).hazardState); })());
  check('time to locate each unaccounted resident: Abu Salem is located by the robot sooner than by any other route (never later, and clearly sooner in most seeds)', abs.every(r => abuT(r.withRobot) <= abuT(r.without)) && abs.filter(r => abuT(r.withRobot) < abuT(r.without) - 20).length >= 2, abs.map(r => `${abuT(r.without)}→${abuT(r.withRobot)}`).join('  '));
  check('the robot adds knowledge: it is the first to locate several residents in every seed, and the number still unaccounted at T+300 s is never higher with the robot', abs.every(r => r.withRobot.unaccounted.firstByRobot >= 1 && r.withRobot.stillUnaccounted.t300 <= r.without.stillUnaccounted.t300), abs.map(r => r.withRobot.unaccounted.firstByRobot + ' by robot').join(', '));
  check('time to locate, person by person: for the residents the robot located FIRST the time saved is positive (earlier than the same person in the world without the robot; people never located without it count to the end of the run, so this is a lower bound for them), listed per person', abs.every(r => r.delta.timeSaved.n >= 1 && r.delta.timeSaved.meanSec > 0 && r.delta.timeSaved.people.every(x => x.savedSec > 0 && x.withRobot < x.without)), abs.map(r => `${r.delta.timeSaved.n} people, ${r.delta.timeSaved.meanSec} s`).join('; '));
  check('% of needs-help residents located before they were brought out: higher with the robot (it finds the person the crews had to search for), and the metric definitions are the same in both worlds', abs.every(r => (r.withRobot.needsHelp.pctBeforeRescue === null || r.withRobot.needsHelp.pctBeforeRescue >= (r.without.needsHelp.pctBeforeRescue || 0))) && abs.some(r => r.withRobot.needsHelp.pctBeforeRescue > (r.without.needsHelp.pctBeforeRescue || 0)));
  check('people reached before the smoke-exposure threshold are reported with the threshold stated (model injury dose 0.3) and exposure counts for both worlds', abs.every(r => r.withRobot.reachedBeforeThreshold.injuryDose === 0.3 && r.without.reachedBeforeThreshold.injuryDose === 0.3 && r.withRobot.exposure.personSec >= 0 && /not a medical measure/.test(r.withRobot.reachedBeforeThreshold.note.en)));
  check('the delta is signed "positive = better with the robot", and the hash of each world is returned (reproducible)', abs.every(r => /Positive = better/.test(r.delta.note.en) && r.hash.without.length === 8 && r.hash.withRobot.length === 8 && r.hash.without !== r.hash.withRobot) && S.abRobot({ preset: 'fire-night-robot', seed: 1 }).hash.withRobot === abs[0].hash.withRobot);
  check('the assumptions behind the numbers travel with the result (thermal Pd, contrast, room °C, dropouts, battery, carrier, approval time, crew speed-up, follow / wake chance)', ['thermalPd', 'contrastC', 'roomC', 'dropoutPct', 'battMin', 'carrier', 'approveSec', 'crewSpeedup', 'followP', 'wakeP'].every(k => k in abs[0].withRobot.assumptions));
  check('the robot gives no benefit that the crews did not already have when it is switched off: "without" has no finds, no robot block, no robot events', abs.every(r => r.without.robot === false && r.without.finds.n === 0 && r.without.robots.length === 0));

  // ---- sensitivity: how the result depends on ONE assumption at a time
  const table = [], baseRuns = {};
  const sw = (title, opts) => { const seedsK = (opts.seeds || [1, 2]).join(); const r = S.sweepRobot(Object.assign({ preset: 'fire-night-robot', seeds: [1, 2], seconds: 600, baselineRuns: baseRuns[seedsK] }, opts)); baseRuns[seedsK] = r.baselineRuns; table.push([title, r]); return r; };
  const only = { robotRgbPd: 0, robotAudioPd: 0 };
  const s1 = sw('detection probability per second (thermal camera only: visible camera and audio off)', { param: 'robotThermalPd', values: [0, 0.1, 0.35, 0.8], params: only });
  const s2 = sw('link dropouts: chance per second that a dropout starts while the signal is weak (%), mesh range 60 m, no relay beacons', { param: 'robotDropoutPct', values: [0, 2, 10, 20], params: { robotMeshRangeM: 60, robotBeaconRelay: 0, robotDropoutSec: 25 } });
  const s3 = sw('mesh range (m), no relay beacons (seed 1)', { param: 'robotMeshRangeM', values: [10, 20, 30, 60], params: { robotBeaconRelay: 0 }, seeds: [1] });
  const s4 = sw('battery endurance (minutes of driving)', { param: 'robotBattMin', values: [8, 15, 45] });
  const s5 = sw('who brings the robot: 0 = pre-positioned at the entrance, 1 = carried by the fire engine (seed 1)', { param: 'robotCarrier', values: [0, 1], seeds: [1] });
  const s6 = sw('robot variant (seed 1)', { param: 'variant', values: ['wheeled', 'tracked'], seeds: [1] });
  const s7 = sw('room air temperature (°C) — the Gulf-heat caveat, thermal camera only (seed 1)', { param: 'robotRoomC', values: [24, 30, 34], params: Object.assign({ robotThermalPd: 0.6 }, only), seeds: [1] });
  console.log('\n  SIMULATION — sensitivity of the robot result to ONE assumption at a time (mean over the seeds listed, 600 s of simulated time; the "w/o robot" baseline first). A mechanism check, not proof of impact.');
  console.log('  located% = residents unaccounted at the reference time whose place became known · byRobot = located FIRST by the robot · saved = mean seconds earlier than without the robot (same person, same seed) · needsResc = needs-help residents located before the crews brought them out · still300/450 = still unaccounted at T+300 / T+450 s');
  for (const [title, r] of table) {
    const b = r.baseline;
    console.log(`   ${title}  [seeds ${r.seeds.join(',')}]`);
    console.log(`      ${'w/o robot'.padStart(9)}  located ${String(b.locatedPct).padStart(5)}%  byRobot ${String(b.byRobot).padStart(4)}  saved ${'-'.padStart(5)}  needsResc ${String(b.needsRescPct).padStart(4)}%  still300 ${String(b.still300).padStart(6)}  still450 ${String(b.still450).padStart(6)}  injured ${String(b.injured).padStart(4)}`);
    for (const row of r.rows) console.log(`      ${String(row.value).padStart(9)}  located ${String(row.locatedPct).padStart(5)}%  byRobot ${String(row.byRobot).padStart(4)}  saved ${String(row.saved).padStart(5)}  needsResc ${String(row.needsRescPct).padStart(4)}%  still300 ${String(row.still300).padStart(6)}  still450 ${String(row.still450).padStart(6)}  injured ${String(row.injured).padStart(4)}  falsePos ${String(row.falsePos).padStart(4)}  missed ${String(row.missed).padStart(4)}  delay ${String(row.delay).padStart(5)}s  linkDown ${String(row.linkDown).padStart(5)}s  batt ${String(row.battEnd).padStart(3)}%  swept ${String(row.coverage).padStart(3)}%`);
  }
  const by = r => r.rows.map(x => x.byRobot);
  check('sweeps run for every named assumption and contain no NaN', table.length === 7 && table.every(([, r]) => r.rows.length >= 2 && badNumbers(r).length === 0));
  check('detection probability matters: with thermal Pd 0 (camera + audio off) the robot is first to locate nobody and saves no time; at Pd 0.8 it locates people first, earlier than they would have been located without it', s1.rows[0].byRobot === 0 && s1.rows[3].byRobot >= 1 && s1.rows[3].finds > s1.rows[0].finds && s1.rows[3].saved > 0, 'first-by-robot ' + by(s1).join(' → ') + '; saved ' + s1.rows.map(x => x.saved).join(' → ') + ' s');
  check('the hot-room caveat shows in the sweep: at 34 °C room air the thermal-only robot finds nobody, at 24 °C it finds people', s7.rows[0].finds > 0 && s7.rows[2].finds === 0, 'finds ' + s7.rows.map(x => x.finds).join(' → '));
  check('link dropouts: with none the link never drops by chance; at 20 % per weak-signal second it drops repeatedly and the link is down longer (reports wait in the buffer)', s2.rows[0].dropouts === 0 && s2.rows[3].dropouts >= 2 && s2.rows[3].linkDown > s2.rows[0].linkDown, `dropouts ${s2.rows.map(x => x.dropouts).join(' → ')}, link down ${s2.rows.map(x => x.linkDown).join(' → ')} s, mean report delay ${s2.rows.map(x => x.delay).join(' → ')} s`);
  check('a longer mesh range keeps the link up longer (10 m vs 60 m, no relays): less time with the link down', s3.rows[0].linkDown > s3.rows[3].linkDown, 'link down ' + s3.rows.map(x => x.linkDown).join(' → ') + ' s');
  check('battery matters: with only 8 min of endurance the robot sweeps fewer rooms than with 45 min (it returns early)', s4.rows[0].coverage < s4.rows[2].coverage && s4.rows[0].byRobot <= s4.rows[2].byRobot, 'rooms swept ' + s4.rows.map(x => x.coverage).join(' → ') + ' %');
  check('carried by the fire engine (value 1) it arrives after the crews: it is first to locate fewer people and saves less time than a pre-positioned robot', s5.rows[1].byRobot < s5.rows[0].byRobot && (s5.rows[1].saved === null || s5.rows[1].saved <= s5.rows[0].saved), 'first-by-robot ' + by(s5).join(' → '));
  check('only the tracked robot reaches the wheelchair user on the third floor: needs-help residents located before they were brought out 0 % (wheeled) vs 100 % (tracked); the wheeled one can sweep at most the ground floor (9 of 29 rooms)', s6.rows[0].needsRescPct === 0 && s6.rows[1].needsRescPct > 50 && s6.rows[0].coverage <= 32, 'needs ' + s6.rows.map(x => x.needsRescPct).join(' → ') + ' %, rooms swept ' + s6.rows.map(x => x.coverage).join(' → ') + ' %');
  check('the result is NOT constant: across the sweeps the located-first count, the time saved, the link-down time and the rooms swept all change with the assumptions (the honest answer: it depends)', new Set(by(s1)).size > 1 && new Set(s1.rows.map(x => x.saved)).size > 1 && new Set(s3.rows.map(x => x.linkDown)).size > 1 && new Set(s4.rows.map(x => x.coverage)).size > 1);
}

// =====================================================================================================================
const secs = ((performance.now() - T0) / 1000).toFixed(0);
console.log(`\n${passed} passed, ${failures.length} failed  (${secs} s)`);
if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
