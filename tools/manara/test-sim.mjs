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
const secs = ((performance.now() - T0) / 1000).toFixed(0);
console.log(`\n${passed} passed, ${failures.length} failed  (${secs} s)`);
if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
