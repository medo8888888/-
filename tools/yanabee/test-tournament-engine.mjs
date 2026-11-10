// Node test of the pure tournament engine (site/yanabee/js/tournament-engine.js -> window.YTour), no browser needed.
//   node tools/yanabee/test-tournament-engine.mjs
// Covers: both load modes (CommonJS export and window.YTour), round robins, the lg6 table (points, every tie-break step alone and
// combined, head-to-head among three, cards, flagged draw/committee, stored decisions), forfeits (lg2/lg4), qualifier gating,
// the final round and podium, the chess flow 12 -> 6 -> 3 -> round robin -> final, invalidation of dependent results,
// encode/decode, normalize/validate, immutability, bad input, and a 5,000-iteration randomized self-consistency simulation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'site/yanabee/js/tournament-engine.js');
const SRC = fs.readFileSync(FILE, 'utf8');

let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const quietFails = new Set();
const q = (n, ok, d = '') => { // used inside the big loops: silent when fine, one line per distinct failure
  if (ok) { pass++; return; }
  const k = n + (d ? ' — ' + d : '');
  if (!quietFails.has(n)) { quietFails.add(n); fails.push(k); console.log('  FAIL ' + k); }
};
const section = t => console.log('\n' + t);

/* ---------------------------------------------------------------- load the file the way the page / node would
   (the repo is "type": "module", so the classic script is evaluated with a module object / a window object) */
function loadCommonJs() { const m = { exports: {} }; new Function('module', SRC)(m); return m.exports; }
function loadBrowser() { const w = {}; new Function('window', SRC)(w); return w; }
const Y = loadCommonJs();

/* ---------------------------------------------------------------- helpers */
const canon = x => { if (x === undefined) x = null; if (x === null || typeof x !== 'object') return JSON.stringify(x); if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']'; return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}'; };
const same = (a, b) => canon(a) === canon(b);
const code = fn => { try { fn(); return null; } catch (e) { return e instanceof Error ? e.message : 'NOT_AN_ERROR:' + String(e); } };
const throwsCode = (fn, c) => code(fn) === c;
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const clone = x => JSON.parse(JSON.stringify(x));
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NAMES = ['الأمل', 'النور', 'الفجر', 'الينابيع', 'البشائر', 'الرواد', 'السلام', 'الوفاء', 'الإبداع', 'العزيمة', 'الصدق', 'الأمانة'];
const TEAMS = NAMES.map((name, i) => ({ id: 't' + (i + 1), name, chess: 'لاعب ' + (i + 1) }));
const IDS = TEAMS.map(t => t.id);
const base = () => Y.setTeams(Y.emptyState(), TEAMS);
const fixed = () => Y.setGroups(base(), [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't10', 't11', 't12']]);
const sr = (s, a, b, sa, sb, x) => Y.setResult(s, Object.assign({ a, b, sa, sb }, x || {}));
const apply = (s, list) => list.reduce((acc, [a, b, sa, sb, x]) => sr(acc, a, b, sa, sb, x), s);
const strong = ids => [[ids[0], ids[1], 1, 0], [ids[0], ids[2], 1, 0], [ids[0], ids[3], 1, 0], [ids[1], ids[2], 1, 0], [ids[1], ids[3], 1, 0], [ids[2], ids[3], 1, 0]];
const groupsDone = s => apply(apply(apply(s, strong(['t1', 't2', 't3', 't4'])), strong(['t5', 't6', 't7', 't8'])), strong(['t9', 't10', 't11', 't12']));
const R = (...rows) => rows.map(([a, b, sa, sb, x]) => Object.assign({ a, b, sa, sb }, x || {}));
const ord = rows => rows.map(r => r.id).join('');
const row = (rows, id) => rows.find(r => r.id === id);
const stepsOf = (r, id) => r.notes.filter(n => n.step !== 'tie' && n.step !== 'decision' && n.vs && n.vs.includes(id)).map(n => n.step);
const rr1 = () => mulberry32(1);
// a full chess run with fixed winners: the first of every pair wins; round robin W0>W1>W2; W1 wins the final
function chessRun(s, rng = rr1()) {
  s = Y.setChessPairs(s, 'r1', Y.drawPairs(IDS, rng));
  Y.chess(s).r1.matches.forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, m.a); });
  s = Y.setChessPairs(s, 'r2', Y.drawPairs(Y.chess(s).r2.pool, rng));
  Y.chess(s).r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, m.a); });
  const W = Y.chess(s).r2.winners;
  s = Y.setChessRR(s, W[0], W[1], W[0]);
  s = Y.setChessRR(s, W[0], W[2], W[0]);
  s = Y.setChessRR(s, W[1], W[2], W[1]);
  s = Y.setChessFinal(s, W[1]);
  return s;
}

/* ================================================================ 0. the file itself */
section('the file: load modes, surface, syntax level');
{
  const FUNCS = ['emptyState', 'normalize', 'pairKey', 'setTeams', 'drawGroups', 'moveTeam', 'groupsValid', 'roundRobin', 'table', 'football',
    'setResult', 'clearResult', 'adminResult', 'setOrder', 'draw', 'chess', 'drawPairs', 'setChessPairs', 'setChessWinner', 'setChessRR',
    'setChessFinal', 'setChessOrder', 'teamView', 'overview', 'encode', 'decode', 'validate'];
  check('every function of the contract is exported', FUNCS.every(f => typeof Y[f] === 'function'), FUNCS.filter(f => typeof Y[f] !== 'function').join(','));
  const B = loadBrowser();
  check('classic script: window.YTour has the same API without any module object', !!B.YTour && Object.keys(B.YTour).sort().join() === Object.keys(Y).sort().join());
  check('no ES module syntax, no optional chaining / nullish / object spread / async', !/^\s*(import|export)\s/m.test(SRC) && !/\?\?|\?\.[A-Za-z_$]|\basync\b|\.\.\.[A-Za-z_$({\[]\s*[,}]/.test(SRC.replace(/\/\/.*$/gm, '')) && !/\{\s*\.\.\./.test(SRC));
  check('no DOM, storage, network or clock use', !/\b(document|localStorage|sessionStorage|fetch|XMLHttpRequest|Date\.now|new Date)\b/.test(SRC.replace(/\/\/.*$/gm, '')));
  check('the page script is a plain IIFE (strict mode)', /^\(function \(\) \{\s*'use strict';/m.test(SRC));
  check('emptyState is a valid v1 state', same(Object.keys(Y.emptyState()).sort(), ['chess', 'fb', 'groups', 'teams', 'updated', 'v']) && Y.emptyState().v === 1 && same(Y.validate(Y.emptyState()), []));
  check('pairKey sorts and joins', Y.pairKey('b', 'a') === 'a|b' && Y.pairKey('a', 'b') === 'a|b' && Y.pairKey('t10', 't2') === 't10|t2');
}

/* ================================================================ 1. round robin */
section('round robin');
{
  const four = Y.roundRobin(['a', 'b', 'c', 'd']);
  const flat4 = four.flat();
  check('4 teams: 3 rounds x 2 matches', four.length === 3 && four.every(r => r.length === 2));
  check('4 teams: 6 different matches, every team plays 3', new Set(flat4.map(m => Y.pairKey(m[0], m[1]))).size === 6 && ['a', 'b', 'c', 'd'].every(id => flat4.filter(m => m.includes(id)).length === 3));
  check('4 teams: nobody plays twice in a round', four.every(r => new Set(r.flat()).size === 4));
  const three = Y.roundRobin(['x', 'y', 'z']);
  const flat3 = three.flat();
  check('3 teams: 3 rounds x 1 match', three.length === 3 && three.every(r => r.length === 1));
  check('3 teams: 3 different matches, every team plays 2', new Set(flat3.map(m => Y.pairKey(m[0], m[1]))).size === 3 && ['x', 'y', 'z'].every(id => flat3.filter(m => m.includes(id)).length === 2));
  check('2 teams: one match', Y.roundRobin(['p', 'q']).flat().length === 1);
  check('6 teams: 5 rounds x 3 matches', Y.roundRobin(['a', 'b', 'c', 'd', 'e', 'f']).length === 5);
  check('bad ids rejected', throwsCode(() => Y.roundRobin(['a']), 'bad_ids') && throwsCode(() => Y.roundRobin(['a', 'a']), 'bad_ids') && throwsCode(() => Y.roundRobin('ab'), 'bad_ids') && throwsCode(() => Y.roundRobin([1, 2]), 'bad_ids'));
  const s = fixed(), fb = Y.football(s);
  check('football groups: 3 groups of 4, each with 3 rounds x 2 matches', fb.groups.length === 3 && fb.groups.every(g => g.teams.length === 4 && g.rounds.length === 3 && g.rounds.every(r => r.matches.length === 2)));
  check('football groups: 6 matches each, 18 + 3 = 21 in all', fb.groups.every(g => g.total === 6) && fb.total === 21 && fb.played === 0);
  check('every team plays exactly 3 group matches', IDS.every(id => fb.groups.reduce((n, g) => n + g.rounds.reduce((m, r) => m + r.matches.filter(x => x.a === id || x.b === id).length, 0), 0) === 3));
}

/* ================================================================ 2. the table: points and every tie-break step */
section('table: points 3/1/0');
{
  const rows = Y.table(['A', 'B', 'C', 'D'], R(['A', 'B', 2, 1], ['C', 'D', 0, 0], ['A', 'C', 1, 1], ['B', 'D', 0, 3]));
  const A = row(rows, 'A'), B = row(rows, 'B'), C = row(rows, 'C'), D = row(rows, 'D');
  check('win 3, draw 1, loss 0', A.pts === 4 && B.pts === 0 && C.pts === 2 && D.pts === 4);
  check('played / won / drawn / lost', A.p === 2 && A.w === 1 && A.d === 1 && A.l === 0 && B.l === 2 && C.d === 2);
  check('goals for / against / difference', A.gf === 3 && A.ga === 2 && A.gd === 1 && B.gf === 1 && B.ga === 5 && B.gd === -4 && D.gf === 3 && D.gd === 3);
  check('sorted by points then goal difference (D before A)', ord(rows) === 'DACB' && rows.map(r => r.rank).join() === '1,2,3,4');
  check('an incomplete table raises no flag', rows.every(r => r.flag === null));
  check('a table also takes the results as an object (the fb.res shape) and ignores foreign / duplicate / bad results',
    ord(Y.table(['A', 'B'], { 'A|B': { a: 'A', b: 'B', sa: 1, sb: 0 }, 'A|Z': { a: 'A', b: 'Z', sa: 9, sb: 0 } })) === 'AB' &&
    Y.table(['A', 'B'], R(['A', 'B', 1, 0], ['B', 'A', 5, 0], ['A', 'B', -1, 0], ['A', 'B', 1.5, 0])).find(r => r.id === 'A').pts === 3);
  check('table needs unique string ids', throwsCode(() => Y.table(['A', 'A'], []), 'bad_ids') && throwsCode(() => Y.table('AB', []), 'bad_ids'));
}

section('table: tie-break step 1 alone — goal difference (lg6)');
{
  const rows = Y.table(['A', 'B', 'C', 'D'], R(['A', 'B', 1, 1], ['A', 'C', 2, 0], ['A', 'D', 0, 1], ['B', 'C', 3, 0], ['B', 'D', 0, 1], ['C', 'D', 0, 0]));
  check('B and A have 4 points each: B (+2) ahead of A (+1)', ord(rows) === 'DBAC' && row(rows, 'A').pts === 4 && row(rows, 'B').pts === 4);
  check('no flag, and the table says why', rows.every(r => r.flag === null) && same(stepsOf(row(rows, 'B'), 'A'), ['gd']) && same(stepsOf(row(rows, 'A'), 'B'), ['gd']));
}

section('table: tie-break step 2 alone — goals scored');
{
  const rows = Y.table(['A', 'B', 'C', 'D'], R(['A', 'B', 1, 1], ['A', 'C', 4, 0], ['A', 'D', 0, 2], ['B', 'C', 3, 0], ['B', 'D', 0, 1], ['C', 'D', 0, 0]));
  check('same points and goal difference (+2), A scored 5 against B 4', row(rows, 'A').gd === 2 && row(rows, 'B').gd === 2 && row(rows, 'A').gf === 5 && row(rows, 'B').gf === 4);
  check('A ahead of B by goals scored, no flag', ord(rows) === 'DABC' && rows.every(r => r.flag === null) && same(stepsOf(row(rows, 'A'), 'B'), ['gf']));
}

section('table: tie-break step 3 alone — head-to-head (two teams)');
{
  const h2h = (X, Y2) => R([X, Y2, 1, 0], [X, 'C', 0, 1], [X, 'D', 0, 1], [Y2, 'C', 1, 0], [Y2, 'D', 0, 1], ['C', 'D', 0, 0]);
  const r1 = Y.table(['A', 'B', 'C', 'D'], h2h('A', 'B'));
  check('A and B equal on points, difference and goals; A beat B -> A first', row(r1, 'A').pts === 3 && row(r1, 'B').pts === 3 && row(r1, 'A').gd === -1 && row(r1, 'B').gd === -1 && row(r1, 'A').gf === row(r1, 'B').gf && ord(r1) === 'DCAB');
  check('decided by the head-to-head, no flag', r1.every(r => r.flag === null) && same(stepsOf(row(r1, 'A'), 'B'), ['h2h']));
  const r2 = Y.table(['A', 'B', 'C', 'D'], h2h('B', 'A'));
  check('when B beat A the order flips (not an index accident)', ord(r2) === 'DCBA');
  const r3 = Y.table(['D', 'C', 'B', 'A'], h2h('A', 'B'));
  check('same with the ids listed in another order', ord(r3) === 'DCAB');
}

section('table: tie-break step 4 alone — cards (fewer reds, then fewer yellows)');
{
  const cards = (a, b) => R(['A', 'B', 1, 1], ['A', 'C', 1, 0, a], ['A', 'D', 0, 1], ['B', 'C', 1, 0, b], ['B', 'D', 0, 1], ['C', 'D', 0, 0]);
  const t0 = Y.table(['A', 'B', 'C', 'D'], cards({}, {}));
  check('A and B drew each other and are level on everything else', row(t0, 'A').pts === 4 && row(t0, 'B').pts === 4 && row(t0, 'A').gd === 0 && row(t0, 'B').gd === 0 && row(t0, 'A').gf === 2 && row(t0, 'B').gf === 2);
  const t1 = Y.table(['A', 'B', 'C', 'D'], cards({ ca: 1, ra: 1 }, { ca: 0 }));
  check('a red card for A puts B first', ord(t1) === 'DBAC' && t1.every(r => r.flag === null) && same(stepsOf(row(t1, 'B'), 'A'), ['cards']) && row(t1, 'A').reds === 1 && row(t1, 'A').cards === 1);
  const t2 = Y.table(['A', 'B', 'C', 'D'], cards({ ca: 2 }, { ca: 1 }));
  check('no reds on either side: fewer cards (yellows) first -> B', ord(t2) === 'DBAC');
  const t3 = Y.table(['A', 'B', 'C', 'D'], cards({ ca: 3 }, { ca: 1, ra: 1 }));
  check('reds count before yellows: A (3 yellows, no red) beats B (1 red)', ord(t3) === 'DABC' && row(t3, 'B').reds === 1 && row(t3, 'A').cards === 3);
  const t4 = Y.table(['A', 'B', 'C', 'D'], cards({ ca: 2, ra: 1 }, { ca: 3, ra: 1 }));
  check('same reds: fewer yellows (1 vs 2) -> A', ord(t4) === 'DABC' && t4.every(r => r.flag === null));
  const t5 = Y.table(['A', 'B', 'C', 'D'], cards({ ca: 2, ra: 1 }, { ca: 2, ra: 1 }));
  check('equal cards -> only the draw is left: both rows flagged "draw", sharing rank 2', row(t5, 'A').flag === 'draw' && row(t5, 'B').flag === 'draw' && row(t5, 'A').rank === 2 && row(t5, 'B').rank === 2 && row(t5, 'C').rank === 4 && same(row(t5, 'A').tieWith, ['A', 'B']));
  check('no card data at all is also equal -> draw', row(t0, 'A').flag === 'draw' && row(t0, 'B').flag === 'draw');
  check('a head-to-head win beats the cards (cards are only the 4th step)', ord(Y.table(['A', 'B', 'C', 'D'], R(['A', 'B', 1, 0, { ca: 5, ra: 2 }], ['A', 'C', 0, 1], ['A', 'D', 0, 1], ['B', 'C', 1, 0], ['B', 'D', 0, 1], ['C', 'D', 0, 0]))) === 'DCAB');
  check('red cards are capped by the cards of the match', row(Y.table(['A', 'B'], R(['A', 'B', 0, 0, { ca: 1, ra: 7 }])), 'A').reds === 1);
}

section('table: three teams tied — head-to-head, committee, draw');
{
  // A, B, C level on 6 points, difference 0 and 2 goals; among themselves A beat B and C, B beat C
  const five = R(['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0], ['A', 'D', 0, 1], ['A', 'E', 0, 1], ['B', 'D', 1, 0], ['B', 'E', 0, 1], ['C', 'D', 1, 0], ['C', 'E', 1, 0], ['D', 'E', 0, 0]);
  const t = Y.table(['A', 'B', 'C', 'D', 'E'], five);
  check('A, B, C really are level on points, difference and goals', ['A', 'B', 'C'].every(id => row(t, id).pts === 6 && row(t, id).gd === 0 && row(t, id).gf === 2) && row(t, 'E').pts === 7 && row(t, 'D').pts === 4);
  check('three tied teams are split by the head-to-head table among them: A, B, C', ord(t) === 'EABCD' && t.every(r => r.flag === null) && t.map(r => r.rank).join() === '1,2,3,4,5');
  const shuffled = Y.table(['C', 'B', 'A', 'E', 'D'], five);
  check('independent of the order the ids are listed in', ord(shuffled) === 'EABCD');
  check('the notes name the head-to-head', same(stepsOf(row(t, 'A'), 'B'), ['h2h']) && same(stepsOf(row(t, 'B'), 'C'), ['h2h']));

  // A beats B and C, B-C drew; all three level on 7 points / +1 / 2 goals -> A first, then B and C by the cards
  const part = c => R(['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 0, 0], ['A', 'D', 0, 0], ['A', 'E', 0, 1], ['B', 'D', 1, 0, c.b], ['B', 'E', 1, 0], ['C', 'D', 1, 0, c.c], ['C', 'E', 1, 0], ['D', 'E', 0, 0]);
  const p0 = Y.table(['A', 'B', 'C', 'D', 'E'], part({ b: {}, c: {} }));
  check('A, B, C level on 7 points, +1, 2 goals', ['A', 'B', 'C'].every(id => row(p0, id).pts === 7 && row(p0, id).gd === 1 && row(p0, id).gf === 2));
  check('A first by the head-to-head; B and C (drew) are left for the cards -> only the draw: flagged "draw", rank 2 each', row(p0, 'A').rank === 1 && row(p0, 'A').flag === null && row(p0, 'B').flag === 'draw' && row(p0, 'C').flag === 'draw' && row(p0, 'B').rank === 2 && row(p0, 'C').rank === 2 && ord(p0).startsWith('A') && same(row(p0, 'B').tieWith, ['B', 'C']));
  const p1 = Y.table(['A', 'B', 'C', 'D', 'E'], part({ b: { ca: 1 }, c: {} }));
  check('the head-to-head is re-applied to the smaller tie, then the cards decide: C before B', ord(p1) === 'ACBED' && p1.every(r => r.flag === null));

  // cycle A > B > C > A: each 3 points, +0, 1 goal -> the head-to-head cannot separate them -> committee
  const cyc = Y.table(['A', 'B', 'C'], R(['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0]));
  check('a cycle: all three flagged "committee", sharing rank 1', cyc.every(r => r.flag === 'committee' && r.rank === 1 && same(r.tieWith, ['A', 'B', 'C'])));
  const alld = Y.table(['A', 'B', 'C'], R(['A', 'B', 0, 0], ['B', 'C', 0, 0], ['C', 'A', 0, 0]));
  check('all draws among three: the head-to-head says nothing, the cards say nothing -> "draw", not committee', alld.every(r => r.flag === 'draw' && r.rank === 1));
  const alld2 = Y.table(['A', 'B', 'C'], R(['A', 'B', 0, 0, { ca: 2 }], ['B', 'C', 0, 0, { ca: 1 }], ['C', 'A', 0, 0]));
  check('all draws among three: the cards (A 2, B 1 + 0, C 0) give one clear order C, B, A without a flag', ord(alld2) === 'CBA' && alld2.every(r => r.flag === null));
  check('incomplete: nothing is flagged yet (the table is only provisional)', Y.table(['A', 'B', 'C'], R(['A', 'B', 1, 0], ['B', 'C', 1, 0])).every(r => r.flag === null));
  const prov = Y.table(['A', 'B', 'C', 'D'], []);
  check('nothing played: everybody shares rank 1, no flag', prov.every(r => r.rank === 1 && r.flag === null && r.tied === true));
}

section('table: stored decisions (committee / draw)');
{
  const cyc = R(['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0]);
  const t = Y.table(['A', 'B', 'C'], cyc, { order: ['C', 'A', 'B'] });
  check('a decision for exactly the tied set is honoured: C, A, B with ranks 1..3 and no flag', ord(t) === 'CAB' && t.every(r => r.flag === null && r.decided === true) && t.map(r => r.rank).join() === '1,2,3');
  check('a decision for another set is ignored', Y.table(['A', 'B', 'C'], cyc, { order: ['A', 'B'] }).every(r => r.flag === 'committee'));
  check('a partial overlap does not count either', Y.table(['A', 'B', 'C'], cyc, { order: ['A', 'B', 'X'] }).every(r => r.flag === 'committee'));
  const cards = (a, b) => R(['A', 'B', 1, 1], ['A', 'C', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 1, 0], ['B', 'D', 1, 0], ['C', 'D', 0, 0]);
  const two = Y.table(['A', 'B', 'C', 'D'], cards(), { order: ['B', 'A'] });
  check('a decided two-team draw tie puts B before A and leaves the others alone', ord(two) === 'BACD' && row(two, 'B').decided && row(two, 'B').flag === null && row(two, 'C').decided === false);
  const two2 = Y.table(['A', 'B', 'C', 'D'], cards(), { order: [null, 'B', 'A', null] });
  check('null separators between decisions are accepted', ord(two2) === 'BACD');
}

section('table: differential check against an independent reference (random complete tables, many ties)');
{
  // The reference is written differently on purpose (plain recursion over id lists, no shared helpers with the engine).
  const refTiers = (ids, ms) => {
    const S = Object.fromEntries(ids.map(id => [id, { pts: 0, gf: 0, ga: 0, red: 0, yel: 0 }]));
    for (const m of ms) {
      S[m.a].gf += m.sa; S[m.a].ga += m.sb; S[m.b].gf += m.sb; S[m.b].ga += m.sa;
      const ca = m.ca || 0, cb = m.cb || 0;
      S[m.a].red += Math.min(m.ra || 0, ca); S[m.a].yel += ca - Math.min(m.ra || 0, ca);
      S[m.b].red += Math.min(m.rb || 0, cb); S[m.b].yel += cb - Math.min(m.rb || 0, cb);
      S[m.a].pts += m.sa > m.sb ? 3 : m.sa === m.sb ? 1 : 0; S[m.b].pts += m.sb > m.sa ? 3 : m.sa === m.sb ? 1 : 0;
    }
    const split = group => {
      if (group.length === 1) return [{ ids: group, flag: null }];
      const inner = ms.filter(m => group.includes(m.a) && group.includes(m.b));
      const mini = Object.fromEntries(group.map(id => [id, 0]));
      for (const m of inner) { if (m.sa > m.sb) mini[m.a] += 3; else if (m.sa < m.sb) mini[m.b] += 3; else { mini[m.a]++; mini[m.b]++; } }
      const vals = [...new Set(group.map(id => mini[id]))].sort((x, y) => y - x);
      if (vals.length > 1) return vals.flatMap(v => split(group.filter(id => mini[id] === v)));
      if (inner.some(m => m.sa !== m.sb)) return [{ ids: group, flag: 'committee' }];
      const keys = [...new Set(group.map(id => S[id].red * 100000 + S[id].yel))].sort((x, y) => x - y);
      return keys.map(k => { const g = group.filter(id => S[id].red * 100000 + S[id].yel === k); return { ids: g, flag: g.length > 1 ? 'draw' : null }; });
    };
    const key = id => [S[id].pts, S[id].gf - S[id].ga, S[id].gf];
    const levels = [...new Set(ids.map(id => key(id).join()))].sort((x, y) => { const a = x.split(',').map(Number), b = y.split(',').map(Number); return b[0] - a[0] || b[1] - a[1] || b[2] - a[2]; });
    return levels.flatMap(l => split(ids.filter(id => key(id).join() === l)));
  };
  const engineTiers = rows => {
    const out = [];
    rows.forEach(r => { const last = out[out.length - 1]; if (r.flag && last && last.flag === r.flag && last.ids.includes(r.id) === false && same(r.tieWith, last.key)) last.ids.push(r.id); else out.push({ ids: [r.id], flag: r.flag, key: r.tieWith }); });
    return out;
  };
  const rnd = mulberry32(2026);
  const ri = n => Math.floor(rnd() * n);
  let bad = 0, flagged = 0, tot = 0;
  for (let it = 0; it < 6000; it++) {
    const n = 3 + ri(4), ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const ms = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const m = { a: ids[i], b: ids[j], sa: ri(it % 2 ? 2 : 3), sb: ri(it % 2 ? 2 : 3) };
      if (ri(3) === 0) { m.ca = ri(3); m.cb = ri(3); m.ra = ri(m.ca + 1); m.rb = ri(m.cb + 1); }
      ms.push(ri(2) ? m : Object.assign({}, m, { a: m.b, b: m.a, sa: m.sb, sb: m.sa, ca: m.cb, cb: m.ca, ra: m.rb, rb: m.ra }));
    }
    const shuffled = ids.slice().sort(() => rnd() - 0.5);
    const want = refTiers(ids, ms).map(t => ({ ids: t.ids.slice().sort().join(''), flag: t.flag }));
    const got = engineTiers(Y.table(shuffled, ms)).map(t => ({ ids: t.ids.slice().sort().join(''), flag: t.flag }));
    tot++;
    if (want.some(t => t.flag)) flagged++;
    if (!same(want, got)) { bad++; if (bad < 3) console.log('   differs', JSON.stringify(ms), JSON.stringify(want), JSON.stringify(got)); }
  }
  check(`${tot} random complete tables (3-6 teams, low scores, cards): the engine and the reference agree on every tier and flag (${flagged} had unresolved ties)`, bad === 0 && flagged > 200, `${bad} differ, ${flagged} with ties`);
}

/* ================================================================ 3. football flows */
section('football: setResult, clear, validation');
{
  const s0 = fixed();
  const s1 = sr(s0, 't1', 't2', 2, 1, { ca: 2, ra: 1, date: '2026-12-05', time: '16:30', note: 'ملاحظة' });
  const g = Y.football(s1).groups[0];
  check('a result is stored under the pair key and shows in the fixtures and the table', s1.fb.res['t1|t2'].sa === 2 && g.played === 1 && g.table[0].id === 't1' && g.table[0].pts === 3);
  const m = g.rounds.flatMap(r => r.matches).find(x => x.key === 't1|t2');
  check('fixtures carry the stored result and the scores in the match orientation', m.res.date === '2026-12-05' && m.res.time === '16:30' && m.res.note === 'ملاحظة' && ((m.a === 't1' && m.sa === 2 && m.sb === 1) || (m.a === 't2' && m.sa === 1 && m.sb === 2)));
  const s2 = sr(s1, 't2', 't1', 0, 3);
  check('entering the pair the other way round replaces it', Object.keys(s2.fb.res).length === 1 && Y.football(s2).groups[0].table[0].gf === 3);
  check('clearResult removes it (and is harmless when there is none)', Object.keys(Y.clearResult(s2, 't1', 't2').fb.res).length === 0 && Object.keys(Y.clearResult(s0, 't1', 't2').fb.res).length === 0);
  check('the other way round too', Object.keys(Y.clearResult(s2, 't2', 't1').fb.res).length === 0);
  check('before the draw there is nothing to enter', throwsCode(() => sr(base(), 't1', 't2', 1, 0), 'no_groups'));
  check('bad scores', ['bad_score'].every(c => throwsCode(() => sr(s0, 't1', 't2', -1, 0), c) && throwsCode(() => sr(s0, 't1', 't2', 1.5, 0), c) && throwsCode(() => sr(s0, 't1', 't2', '1', 0), c) && throwsCode(() => sr(s0, 't1', 't2', NaN, 0), c) && throwsCode(() => sr(s0, 't1', 't2', 1, Infinity), c) && throwsCode(() => sr(s0, 't1', 't2', 1, undefined), c) && throwsCode(() => sr(s0, 't1', 't2', 1000, 0), c)));
  check('bad cards', throwsCode(() => sr(s0, 't1', 't2', 1, 0, { ca: -1 }), 'bad_cards') && throwsCode(() => sr(s0, 't1', 't2', 1, 0, { cb: 0.5 }), 'bad_cards') && throwsCode(() => sr(s0, 't1', 't2', 1, 0, { ca: 1, ra: 2 }), 'bad_cards'));
  check('unknown / same team', throwsCode(() => sr(s0, 't1', 'zz', 1, 0), 'unknown_team') && throwsCode(() => sr(s0, 'zz', 't1', 1, 0), 'unknown_team') && throwsCode(() => sr(s0, 't1', 't1', 1, 0), 'same_team') && throwsCode(() => Y.setResult(s0, { a: 5, b: 't1', sa: 1, sb: 0 }), 'unknown_team'));
  check('bad text fields and a bad input object', throwsCode(() => sr(s0, 't1', 't2', 1, 0, { date: 5 }), 'bad_text') && throwsCode(() => sr(s0, 't1', 't2', 1, 0, { note: 'x'.repeat(201) }), 'bad_text') && throwsCode(() => Y.setResult(s0, null), 'bad_result') && throwsCode(() => Y.setResult(s0, 'x'), 'bad_result'));
  check('teams of different groups cannot meet before the final round', throwsCode(() => sr(s0, 't1', 't5', 1, 0), 'final_not_ready'));
  check('...and a failed call changes nothing', same(s0, fixed()));
}

section('football: forfeits (lg2 / lg4)');
{
  const s0 = fixed();
  const absent = Y.adminResult(s0, 't1', 't2', 'absent', 't1');
  const r = absent.fb.res['t1|t2'];
  check('absence of t1: 0-3 against t1 (the side at fault scores 0)', r.sa === 0 && r.sb === 3 && r.adm === 'absent' && r.fault === 't1');
  const late = Y.adminResult(s0, 't1', 't2', 'late', 't2');
  check('late arrival of t2: 0-3 against t2', late.fb.res['t1|t2'].sa === 3 && late.fb.res['t1|t2'].sb === 0 && late.fb.res['t1|t2'].adm === 'late');
  const wd = Y.adminResult(s0, 't2', 't1', 'withdraw', 't2');
  check('withdrawal of t2 (pair given the other way round)', wd.fb.res['t1|t2'].sa === 0 && wd.fb.res['t1|t2'].sb === 3 && wd.fb.res['t1|t2'].a === 't2');
  const unreg = Y.adminResult(s0, 't1', 't2', 'unregistered', 't1');
  check('unregistered player of t1: a 3-0 loss for t1, three points to the other side', unreg.fb.res['t1|t2'].sa === 0 && unreg.fb.res['t1|t2'].sb === 3 && unreg.fb.res['t1|t2'].adm === 'unregistered');
  const t = Y.football(absent).groups[0].table;
  check('in the table: the offender has 0 points and -3, the other 3 points and +3', row(t, 't1').pts === 0 && row(t, 't1').gd === -3 && row(t, 't2').pts === 3 && row(t, 't2').gd === 3);
  const mv = Y.football(absent).groups[0].rounds.flatMap(x => x.matches).find(x => x.key === 't1|t2');
  check('the fixture knows it was administrative', mv.res.adm === 'absent');
  check('optional date / time / note', Y.adminResult(s0, 't1', 't2', 'absent', 't1', { date: '2026-12-06', time: '10:00', note: 'غاب' }).fb.res['t1|t2'].note === 'غاب');
  check('bad kind / side / teams', throwsCode(() => Y.adminResult(s0, 't1', 't2', 'cheating', 't1'), 'bad_kind') && throwsCode(() => Y.adminResult(s0, 't1', 't2', 'absent', 't3'), 'bad_side') && throwsCode(() => Y.adminResult(s0, 't1', 't2', 'absent'), 'bad_side') && throwsCode(() => Y.adminResult(s0, 't1', 'zz', 'absent', 't1'), 'unknown_team') && throwsCode(() => Y.adminResult(s0, 't1', 't1', 'absent', 't1'), 'same_team'));
  check('a later normal result replaces the administrative one cleanly', !('adm' in sr(absent, 't1', 't2', 1, 1).fb.res['t1|t2']));
  check('a forfeit survives encode/decode', Y.decode(Y.encode(absent)).fb.res['t1|t2'].adm === 'absent');
}

section('football: qualifiers only when a group is complete and its first place is not an unresolved tie');
{
  const s0 = fixed();
  let fb = Y.football(s0);
  check('nothing played: no qualifiers, three pending "incomplete"', fb.qualifiers === null && fb.pending.length === 3 && fb.pending.every(p => p.reason === 'incomplete') && same(fb.pending.map(p => p.scope), ['g0', 'g1', 'g2']));
  const g0 = apply(s0, strong(['t1', 't2', 't3', 't4']));
  fb = Y.football(g0);
  check('one group complete: its first is qualified but the final round needs all three', fb.qualified[0] === 't1' && fb.qualifiers === null && fb.final === null && same(fb.pending.map(p => p.scope), ['g1', 'g2']));
  const almost = apply(s0, strong(['t1', 't2', 't3', 't4']).slice(0, 5));
  fb = Y.football(almost);
  check('five of six played: still pending "incomplete" even though t1 leads', fb.qualified[0] === null && fb.pending[0].scope === 'g0' && fb.pending[0].reason === 'incomplete');
  const done = groupsDone(s0);
  fb = Y.football(done);
  check('all groups complete: three qualifiers, one per group, in group order', same(fb.qualifiers, ['t1', 't5', 't9']) && fb.pending.length === 1 && fb.pending[0].scope === 'final' && fb.pending[0].reason === 'incomplete');
  check('the final round exists with 3 matches in 3 rounds, nothing played', fb.final.teams.length === 3 && fb.final.rounds.length === 3 && fb.final.rounds.every(r => r.matches.length === 1) && fb.final.total === 3 && fb.final.played === 0 && fb.podium === null);

  // a tie at the top of group 0: t1 and t2 draw each other, beat everybody else 1-0; t3-t4 0-0
  const topTie = [['t1', 't2', 1, 1], ['t1', 't3', 1, 0], ['t1', 't4', 1, 0], ['t2', 't3', 1, 0], ['t2', 't4', 1, 0], ['t3', 't4', 1, 0]];
  const tied = apply(s0, topTie);
  fb = Y.football(tied);
  check('first place tied (head-to-head draw, equal cards): flagged "draw", not qualified, pending reason "tie"', fb.groups[0].table[0].flag === 'draw' && fb.groups[0].table[1].flag === 'draw' && fb.qualified[0] === null && fb.pending.find(p => p.scope === 'g0').reason === 'tie');
  check('the tie is listed with its teams', same(fb.groups[0].ties, [{ ids: fb.groups[0].ties[0].ids, flag: 'draw', decided: false }]) && same(fb.groups[0].ties[0].ids.slice().sort(), ['t1', 't2']));
  check('the rest of the group is ranked normally (t3 third, t4 last)', fb.groups[0].table[2].id === 't3' && fb.groups[0].table[2].rank === 3 && fb.groups[0].table[3].rank === 4 && fb.groups[0].table[2].flag === null);
  const drawn = Y.draw(tied, 'g0', mulberry32(7));
  fb = Y.football(drawn);
  check('draw() stores a random order for the flagged tie; the first of it qualifies', fb.groups[0].table[0].flag === null && fb.groups[0].table[0].decided === true && fb.qualified[0] === fb.groups[0].table[0].id && ['t1', 't2'].includes(fb.qualified[0]));
  check('...it is in the state under fb.order.g0', Array.isArray(drawn.fb.order.g0) && same(drawn.fb.order.g0.slice().sort(), ['t1', 't2']));
  const again = Y.football(Y.decode(Y.encode(drawn)));
  check('...stable: the same after encode/decode and any number of reads', again.groups[0].table[0].id === fb.groups[0].table[0].id && Y.football(drawn).groups[0].table[0].id === fb.groups[0].table[0].id);
  check('a second draw has nothing to draw', throwsCode(() => Y.draw(drawn, 'g0', mulberry32(8)), 'no_draw_needed') && throwsCode(() => Y.draw(tied, 'g1', mulberry32(8)), 'no_draw_needed'));
  const seeds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => Y.draw(tied, 'g0', mulberry32(k)).fb.order.g0[0]));
  check('different random numbers can give either order', seeds.size === 2);
  check('draw is driven by the injected rng: constant 0 vs 0.99 give opposite orders', Y.draw(tied, 'g0', () => 0).fb.order.g0.join() !== Y.draw(tied, 'g0', () => 0.99).fb.order.g0.join());
  check('draw rejects an rng that is not a function or returns junk', throwsCode(() => Y.draw(tied, 'g0', 5), 'bad_rng') && throwsCode(() => Y.draw(tied, 'g0', () => 1), 'bad_rng') && throwsCode(() => Y.draw(tied, 'g0', () => NaN), 'bad_rng'));

  // the decision is dropped when the tie set changes
  const tiedLow = Y.football(apply(tied, [['t3', 't4', 2, 0]]));
  check('an edit that leaves the tied set alone (t3-t4) keeps the decision', apply(drawn, [['t3', 't4', 2, 0]]).fb.order.g0 !== undefined && Y.football(apply(drawn, [['t3', 't4', 2, 0]])).groups[0].table[0].decided === true && tiedLow.groups[0].table[0].flag === 'draw');
  const broken = apply(drawn, [['t1', 't3', 2, 0]]);
  check('an edit that breaks the tie (t1 now has a better goal difference) drops the decision automatically', broken.fb.order.g0 === undefined && Y.football(broken).groups[0].table[0].id === 't1' && Y.football(broken).qualified[0] === 't1' && same(Y.validate(broken), []));
  const restored = apply(broken, [['t1', 't3', 1, 0]]);
  check('...and when the tie comes back it is open again (a new decision is needed)', Y.football(restored).groups[0].table[0].flag === 'draw' && restored.fb.order.g0 === undefined);
  check('clearing a result of the group drops the decision too (the table is incomplete)', Y.clearResult(drawn, 't3', 't4').fb.order.g0 === undefined);

  // committee: three in a cycle at the top
  const cyc = apply(s0, [['t1', 't2', 1, 0], ['t2', 't3', 1, 0], ['t3', 't1', 1, 0], ['t1', 't4', 1, 0], ['t2', 't4', 1, 0], ['t3', 't4', 1, 0]]);
  fb = Y.football(cyc);
  check('three teams in a cycle at the top: flagged "committee", pending "tie", no qualifier', fb.groups[0].table.slice(0, 3).every(r => r.flag === 'committee' && r.rank === 1) && fb.groups[0].table[3].id === 't4' && fb.groups[0].table[3].rank === 4 && fb.qualified[0] === null && fb.pending[0].reason === 'tie');
  check('draw() does not settle a committee tie', throwsCode(() => Y.draw(cyc, 'g0', mulberry32(3)), 'no_draw_needed'));
  const dec = Y.setOrder(cyc, 'g0', ['t3', 't1', 't2']);
  fb = Y.football(dec);
  check('setOrder stores the committee decision: t3, t1, t2; t3 qualifies', ord(fb.groups[0].table) === 't3t1t2t4' && fb.qualified[0] === 't3' && fb.groups[0].table.slice(0, 3).every(r => r.decided && r.flag === null));
  check('setOrder can be changed again for the same tie', Y.football(Y.setOrder(dec, 'g0', ['t2', 't3', 't1'])).qualified[0] === 't2');
  check('setOrder needs exactly the tied set', throwsCode(() => Y.setOrder(cyc, 'g0', ['t1', 't2']), 'not_tied') && throwsCode(() => Y.setOrder(cyc, 'g0', ['t1', 't2', 't3', 't4']), 'not_tied') && throwsCode(() => Y.setOrder(cyc, 'g0', ['t1', 't2', 't4']), 'not_tied') && throwsCode(() => Y.setOrder(s0, 'g0', ['t1', 't2']), 'not_tied'));
  check('setOrder rejects malformed input', throwsCode(() => Y.setOrder(cyc, 'g0', 'abc'), 'bad_order') && throwsCode(() => Y.setOrder(cyc, 'g0', ['t1', 't1', 't2']), 'bad_order') && throwsCode(() => Y.setOrder(cyc, 'g0', ['t1']), 'bad_order') && throwsCode(() => Y.setOrder(cyc, 'g0', ['t1', 't2', 'zz']), 'unknown_team') && throwsCode(() => Y.setOrder(cyc, 'g9', ['t1', 't2']), 'bad_scope') && throwsCode(() => Y.setOrder(cyc, 'final', ['t1', 't2']), 'final_not_ready') && throwsCode(() => Y.setOrder(base(), 'g0', ['t1', 't2']), 'no_groups'));
  check('after the committee decision a change to the cycle drops it', Y.setResult(dec, { a: 't1', b: 't4', sa: 0, sb: 0 }).fb.order.g0 === undefined);

  // two separate tied sets in one group: both can be decided
  const two = apply(s0, [['t1', 't2', 1, 1], ['t1', 't3', 1, 0], ['t1', 't4', 1, 0], ['t2', 't3', 1, 0], ['t2', 't4', 1, 0], ['t3', 't4', 1, 1]]);
  fb = Y.football(two);
  check('two separate ties in one group are both flagged', fb.groups[0].ties.length === 2 && fb.groups[0].table.every(r => r.flag === 'draw'));
  const oneDrawn = Y.setOrder(two, 'g0', ['t2', 't1']);
  check('deciding one keeps the other open', Y.football(oneDrawn).groups[0].table[0].id === 't2' && Y.football(oneDrawn).groups[0].table[2].flag === 'draw');
  const bothDrawn = Y.draw(oneDrawn, 'g0', mulberry32(5));
  check('draw() then settles the remaining one without touching the first', Y.football(bothDrawn).groups[0].table.every(r => r.flag === null) && Y.football(bothDrawn).groups[0].table[0].id === 't2' && bothDrawn.fb.order.g0.includes(null));
  check('a state with two decisions in one scope validates and survives encode/decode', same(Y.validate(bothDrawn), []) && same(Y.decode(Y.encode(bothDrawn)), bothDrawn));
  check('changing the first tie only (t1-t2) drops its decision and keeps the other', (() => { const x = apply(bothDrawn, [['t1', 't2', 2, 1]]); return Y.football(x).groups[0].table[0].id === 't1' && Y.football(x).groups[0].table[2].decided === true && same(Y.validate(x), []); })());
}

section('football: final round and podium');
{
  const done = groupsDone(fixed());
  const ok = apply(done, [['t1', 't5', 2, 0], ['t1', 't9', 1, 0], ['t5', 't9', 3, 1]]);
  let fb = Y.football(ok);
  check('final round complete: table of the 3, podium = 1st, 2nd, 3rd', same(fb.podium, ['t1', 't5', 't9']) && fb.final.complete && fb.final.played === 3 && fb.pending.length === 0);
  check('each qualifier played 2 matches', fb.final.table.every(r => r.p === 2) && fb.played === 21 && fb.total === 21);
  const part = apply(done, [['t1', 't5', 2, 0], ['t1', 't9', 1, 0]]);
  check('final round incomplete: no podium, pending "incomplete"', Y.football(part).podium === null && Y.football(part).pending[0].scope === 'final' && Y.football(part).pending[0].reason === 'incomplete');
  const cyc = apply(done, [['t1', 't5', 1, 0], ['t5', 't9', 1, 0], ['t9', 't1', 1, 0]]);
  fb = Y.football(cyc);
  check('a cycle in the final round: all three flagged "committee", no podium, pending "tie"', fb.podium === null && fb.final.table.every(r => r.flag === 'committee') && fb.pending[0].reason === 'tie');
  const dec = Y.setOrder(cyc, 'final', ['t9', 't1', 't5']);
  check('the committee order gives the podium', same(Y.football(dec).podium, ['t9', 't1', 't5']) && dec.fb.order.final.length === 3);
  const dr = apply(done, [['t1', 't5', 0, 0], ['t5', 't9', 0, 0], ['t9', 't1', 0, 0]]);
  check('three draws: the final round ends in a "draw" tie', Y.football(dr).final.table.every(r => r.flag === 'draw') && Y.football(dr).podium === null);
  const dd = Y.draw(dr, 'final', mulberry32(11));
  check('draw() on the final round gives and stores a podium', Y.football(dd).podium !== null && new Set(Y.football(dd).podium).size === 3 && dd.fb.order.final.length === 3);
  check('two tied for 2nd/3rd also blocks the podium', (() => { const s = apply(done, [['t1', 't5', 1, 0], ['t1', 't9', 1, 0], ['t5', 't9', 0, 0]]); const f = Y.football(s); return f.final.table[0].id === 't1' && f.final.table[1].flag === 'draw' && f.podium === null; })());
  check('a final-round result can be entered with the teams either way round', Y.football(apply(done, [['t5', 't1', 0, 2]])).final.table[0].id === 't1');
  check('only the qualifiers can meet in the final round', throwsCode(() => sr(done, 't1', 't6', 1, 0), 'not_in_final') && throwsCode(() => sr(done, 't2', 't5', 1, 0), 'not_in_final'));
  check('group mates of a qualifier still play within their group only (a group result is fine)', Y.football(sr(done, 't2', 't3', 1, 0)).groups[0].played === 6);

  // changing group results that alter the qualifiers drops the final-round results of teams that are no longer qualifiers
}
{
  const done = groupsDone(fixed());
  const withFinal = apply(done, [['t1', 't5', 1, 0], ['t1', 't9', 2, 0], ['t5', 't9', 3, 0]]);
  check('before the change the final round is complete with t1, t5, t9', same(Y.football(withFinal).podium, ['t1', 't5', 't9']) && Object.keys(withFinal.fb.res).length === 18 + 3);
  const s2 = apply(withFinal, [['t2', 't1', 2, 0], ['t2', 't3', 1, 0], ['t2', 't4', 1, 0], ['t1', 't3', 0, 0], ['t1', 't4', 0, 0]]);
  const fb = Y.football(s2);
  check('with t2 first in group 0, the qualifiers are t2, t5, t9', same(fb.qualifiers, ['t2', 't5', 't9']));
  check('final-round results of t1 are gone, the one between t5 and t9 stays', s2.fb.res['t1|t5'] === undefined && s2.fb.res['t1|t9'] === undefined && s2.fb.res['t5|t9'] !== undefined);
  check('the final table is rebuilt from what is left (1 of 3 played), no podium', fb.final.played === 1 && fb.podium === null);
  check('and the state is consistent', same(Y.validate(s2), []));
  // group no longer complete: the final results of the (now unknown) qualifier stay hidden but are not wrongly deleted
  const half = Y.clearResult(withFinal, 't3', 't4');
  check('clearing a group result hides the final round (qualifier unknown) without deleting its results', Y.football(half).final === null && Y.football(half).podium === null && half.fb.res['t1|t5'] !== undefined && same(Y.validate(half), []));
  check('putting the same result back restores the final round', same(Y.football(sr(half, 't3', 't4', 1, 0)).podium, ['t1', 't5', 't9']));
  check('...but putting back a different one that changes the first place removes the final results of the old winner', (() => { const y = sr(Y.clearResult(withFinal, 't1', 't2'), 't1', 't2', 0, 1); return Y.football(y).qualifiers[0] === 't2' && y.fb.res['t1|t5'] === undefined && y.fb.res['t5|t9'] !== undefined && same(Y.validate(y), []); })());
  // order for the final dropped when the qualifiers change
  const cyc = apply(done, [['t1', 't5', 1, 0], ['t5', 't9', 1, 0], ['t9', 't1', 1, 0]]);
  const dec = Y.setOrder(cyc, 'final', ['t5', 't9', 't1']);
  const chg = apply(dec, [['t2', 't1', 3, 0], ['t2', 't3', 3, 0], ['t2', 't4', 3, 0], ['t1', 't3', 0, 0], ['t1', 't4', 0, 0]]);
  check('a final-round decision does not outlive a qualifier change', chg.fb.order.final === undefined && same(Y.football(chg).qualifiers, ['t2', 't5', 't9']) && same(Y.validate(chg), []));
}

section('football: groups — drawGroups, moveTeam, setGroups, setTeams');
{
  const s = base();
  check('groupsValid is false before the draw', Y.groupsValid(s) === false);
  const d = Y.drawGroups(s, mulberry32(42));
  check('drawGroups: 3 groups of 4 holding all 12 teams once', d.groups.length === 3 && d.groups.every(g => g.length === 4) && new Set(d.groups.flat()).size === 12 && d.groups.flat().every(id => IDS.includes(id)) && Y.groupsValid(d));
  check('the draw depends only on the rng', same(Y.drawGroups(s, mulberry32(42)).groups, d.groups) && !same(Y.drawGroups(s, mulberry32(43)).groups, d.groups));
  check('the default rng works (Math.random)', Y.groupsValid(Y.drawGroups(s)));
  check('the draw needs exactly 12 teams', throwsCode(() => Y.drawGroups(Y.emptyState()), 'need_12_teams') && throwsCode(() => Y.drawGroups(Y.setTeams(Y.emptyState(), TEAMS.slice(0, 11))), 'need_12_teams'));
  check('a new draw wipes the football results (and keeps the chess bracket)', (() => { const a = Y.setChessPairs(apply(fixed(), [['t1', 't2', 1, 0]]), 'r1', Y.drawPairs(IDS, mulberry32(1))); const b = Y.drawGroups(a, mulberry32(2)); return Object.keys(b.fb.res).length === 0 && b.chess.r1.length === 6; })());
  const f = fixed();
  const mv = Y.moveTeam(f, 't1', 1);
  check('moveTeam swaps with the last team of the target group to keep 4/4/4', same(mv.groups, [['t8', 't2', 't3', 't4'], ['t5', 't6', 't7', 't1'], ['t9', 't10', 't11', 't12']]) && Y.groupsValid(mv));
  const mv2 = Y.moveTeam(f, 't1', 2, 't10');
  check('...or with a chosen team', same(mv2.groups, [['t10', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't1', 't11', 't12']]));
  check('moving into the own group changes nothing', same(Y.moveTeam(f, 't1', 0).groups, f.groups));
  const withRes = apply(f, [['t1', 't2', 1, 0], ['t2', 't3', 1, 0], ['t5', 't6', 1, 0]]);
  const mv3 = Y.moveTeam(withRes, 't1', 1);
  check('results that are no longer between group mates disappear', mv3.fb.res['t1|t2'] === undefined && mv3.fb.res['t2|t3'] !== undefined && mv3.fb.res['t5|t6'] !== undefined && same(Y.validate(mv3), []));
  check('moveTeam errors', throwsCode(() => Y.moveTeam(f, 'zz', 1), 'unknown_team') && throwsCode(() => Y.moveTeam(f, 't1', 3), 'bad_group') && throwsCode(() => Y.moveTeam(f, 't1', -1), 'bad_group') && throwsCode(() => Y.moveTeam(f, 't1', 1.5), 'bad_group') && throwsCode(() => Y.moveTeam(f, 't1', 1, 't9'), 'unknown_team') && throwsCode(() => Y.moveTeam(base(), 't1', 1), 'no_groups'));
  check('setGroups validates', throwsCode(() => Y.setGroups(base(), [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8']]), 'bad_groups') && throwsCode(() => Y.setGroups(base(), [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't10', 't11', 't1']]), 'bad_groups') && throwsCode(() => Y.setGroups(base(), [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't10', 't11', 'zz']]), 'bad_groups'));
  // teams
  const renamed = Y.setTeams(withRes, TEAMS.map((t, i) => i === 0 ? { id: t.id, name: 'اسم جديد' } : t));
  check('renaming a team keeps the groups and results; the chess label may be dropped', renamed.teams[0].name === 'اسم جديد' && renamed.teams[0].chess === undefined && renamed.groups !== null && Object.keys(renamed.fb.res).length === 3);
  const fewer = Y.setTeams(withRes, TEAMS.slice(0, 11));
  check('removing a team un-draws the groups and drops the football results', fewer.groups === null && Object.keys(fewer.fb.res).length === 0 && fewer.teams.length === 11);
  const chessed = Y.setTeams(chessRun(fixed()), TEAMS.slice(0, 11));
  check('removing a team also empties the chess bracket', chessed.chess.r1.length === 0 && chessed.chess.r2.length === 0 && Y.chess(chessed).podium === null && same(Y.validate(chessed), []));
  check('setTeams errors', throwsCode(() => Y.setTeams(base(), 'x'), 'bad_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a' }]), 'bad_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a', name: '  ' }]), 'bad_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a|b', name: 'x' }]), 'bad_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }]), 'duplicate_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a', name: 'س' }, { id: 'b', name: ' س ' }]), 'duplicate_name') && throwsCode(() => Y.setTeams(base(), TEAMS.concat([{ id: 'x', name: 'زائد' }])), 'too_many_teams') && throwsCode(() => Y.setTeams(base(), [null]), 'bad_team') && throwsCode(() => Y.setTeams(base(), [{ id: 'a', name: 'x', chess: 5 }]), 'bad_team'));
  check('names are trimmed and the chess label is kept only on manager data', Y.setTeams(Y.emptyState(), [{ id: 'a', name: '  فريق  ', chess: ' لاعب ' }]).teams[0].name === 'فريق' && Y.setTeams(Y.emptyState(), [{ id: 'a', name: 'x', chess: ' لاعب ' }]).teams[0].chess === 'لاعب');
}

/* ================================================================ 4. chess */
section('chess: the cup, 12 -> 6 -> 3 -> round robin -> final');
{
  const s0 = base();
  let c = Y.chess(s0);
  check('nothing yet: no matches, total 13, no podium', c.r1.matches.length === 0 && c.total === 13 && c.played === 0 && c.podium === null && c.final === null && c.r2.pool.length === 0);
  const pairs = Y.drawPairs(IDS, mulberry32(3));
  check('drawPairs: 6 pairs, each team exactly once, seeded', pairs.length === 6 && new Set(pairs.flatMap(p => [p.a, p.b])).size === 12 && same(Y.drawPairs(IDS, mulberry32(3)), pairs) && !same(Y.drawPairs(IDS, mulberry32(4)), pairs));
  check('drawPairs input checks', throwsCode(() => Y.drawPairs(['a', 'b', 'c']), 'bad_ids') && throwsCode(() => Y.drawPairs(['a', 'a']), 'bad_ids') && throwsCode(() => Y.drawPairs([]), 'bad_ids') && throwsCode(() => Y.drawPairs('ab'), 'bad_ids'));
  let s = Y.setChessPairs(s0, 'r1', pairs);
  c = Y.chess(s);
  check('round 1: 6 matches, none played, round 2 not yet possible', c.r1.matches.length === 6 && c.r1.total === 6 && !c.r1.complete && c.r2.matches.length === 0 && throwsCode(() => Y.setChessPairs(s, 'r2', Y.drawPairs(IDS.slice(0, 6), mulberry32(1))), 'r1_incomplete'));
  check('pairs may be given as [a,b] arrays', Y.chess(Y.setChessPairs(s0, 'r1', pairs.map(p => [p.a, p.b]))).r1.matches.length === 6);
  c.r1.matches.slice(0, 5).forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, m.b); });
  check('five winners entered: still not complete, no pool', !Y.chess(s).r1.complete && Y.chess(s).r1.winners.length === 5 && Y.chess(s).r2.pool.length === 0);
  s = Y.setChessWinner(s, 'r1', 5, pairs[5].a);
  c = Y.chess(s);
  check('all six: the pool is the 6 winners', c.r1.complete && c.r2.pool.length === 6 && same(c.r2.pool.slice().sort(), c.r1.winners.slice().sort()) && c.r2.free.length === 6);
  const pool = c.r2.pool;
  check('round 2 pairs must be exactly the winners', throwsCode(() => Y.setChessPairs(s, 'r2', Y.drawPairs(IDS.filter(i => !pool.includes(i)).slice(0, 6), mulberry32(1))), 'bad_pairs') && throwsCode(() => Y.setChessPairs(s, 'r2', Y.drawPairs(pool, mulberry32(1)).slice(0, 2)), 'bad_pairs') && throwsCode(() => Y.setChessPairs(s, 'r2', [[pool[0], pool[1]], [pool[0], pool[2]], [pool[3], pool[4]]]), 'bad_pairs'));
  s = Y.setChessPairs(s, 'r2', Y.drawPairs(pool, mulberry32(9)));
  c = Y.chess(s);
  check('round 2: 3 matches over the 6 winners', c.r2.matches.length === 3 && c.r2.total === 3 && c.r2.free.length === 0 && c.r2.matches.every(m => pool.includes(m.a) && pool.includes(m.b)));
  check('no round robin before the 3 winners are known', c.rr.teams.length === 0 && throwsCode(() => Y.setChessRR(s, pool[0], pool[1], pool[0]), 'rr_unavailable') && throwsCode(() => Y.setChessFinal(s, pool[0]), 'rr_unavailable'));
  c.r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, m.b); });
  c = Y.chess(s);
  const W = c.r2.winners;
  check('3 winners -> the round robin of 3: 3 matches in 3 rounds, each team plays 2', c.r2.complete && c.rr.teams.length === 3 && c.rr.matches.length === 3 && c.rr.matches.map(m => m.round).join() === '1,2,3' && W.every(id => c.rr.matches.filter(m => m.a === id || m.b === id).length === 2));
  check('the standings are empty, not tied, the final unknown', c.rr.table.length === 3 && !c.rr.complete && !c.rr.tied && c.rr.top2 === null && c.final === null && c.podium === null);
  s = Y.setChessRR(s, W[0], W[1], W[1]);
  s = Y.setChessRR(s, W[2], W[0], W[0]);
  check('two matches in: the standings count wins, nothing decided yet', Y.chess(s).rr.played === 2 && Y.chess(s).rr.table[0].w === 1 && Y.chess(s).rr.top2 === null);
  s = Y.setChessRR(s, W[1], W[2], W[1]);
  c = Y.chess(s);
  // W1 beat W0, W0 beat W2, W1 beat W2 -> W1 2 wins, W0 1, W2 0
  check('complete 2-1-0: top two decided, third known', c.rr.complete && !c.rr.tied && same(c.rr.top2, [W[1], W[0]]) && c.rr.third === W[2] && same(c.rr.table.map(r => r.rank), [1, 2, 3]));
  check('the final is between the top two, not played yet', same([c.final.a, c.final.b], [W[1], W[0]]) && c.final.w === null && c.podium === null && c.played === 6 + 3 + 3);
  check('the final winner must be one of the two', throwsCode(() => Y.setChessFinal(s, W[2]), 'bad_winner') && throwsCode(() => Y.setChessFinal(s, 'zz'), 'bad_winner') && throwsCode(() => Y.setChessFinal(s, undefined), 'bad_winner'));
  s = Y.setChessFinal(s, W[0]);
  c = Y.chess(s);
  check('podium = [final winner, final loser, third of the round robin]', same(c.podium, [W[0], W[1], W[2]]) && c.played === 13 && c.total === 13 && new Set(c.podium).size === 3);
  const o = Y.overview(s);
  check('overview: chess done', o.chess.phase === 'done' && o.chess.played === 13 && same(o.chess.podium, c.podium) && o.chess.final.done);
  check('the final can be re-decided', same(Y.chess(Y.setChessFinal(s, W[1])).podium, [W[1], W[0], W[2]]) && Y.chess(Y.setChessFinal(s, null)).podium === null);
  check('a round robin result must belong to the three and name one of them', throwsCode(() => Y.setChessRR(s, W[0], 't99', W[0]), 'unknown_team') && throwsCode(() => Y.setChessRR(s, W[0], W[0], W[0]), 'same_team') && throwsCode(() => Y.setChessRR(s, W[0], W[1], W[2]), 'bad_winner') && throwsCode(() => Y.setChessRR(s, W[0], pairs.flatMap(p => [p.a, p.b]).find(i => !W.includes(i)), W[0]), 'rr_unavailable'));
  check('a round robin result can be cleared with null', Y.chess(Y.setChessRR(s, W[0], W[1], null)).rr.played === 2);
}

section('chess: a 1-1-1 round robin (and the committee order)');
{
  let s = chessRun(base());
  let W = Y.chess(s).r2.winners;
  s = Y.setChessRR(s, W[1], W[2], W[2]); // W2 beats W1: now W0>W1, W0>W2... change to a cycle: W0 beats W1, W1 beats W2, W2 beats W0
  s = Y.setChessRR(s, W[0], W[1], W[0]); s = Y.setChessRR(s, W[1], W[2], W[1]); s = Y.setChessRR(s, W[0], W[2], W[2]);
  const c = Y.chess(s);
  check('cycle: each has one win -> tied, flagged "committee", no top two, no final, no podium', c.rr.complete && c.rr.tied && c.rr.table.every(r => r.w === 1 && r.flag === 'committee' && r.rank === 1) && c.rr.top2 === null && c.final === null && c.podium === null);
  check('the final is blocked until the order is decided', throwsCode(() => Y.setChessFinal(s, W[0]), 'rr_unresolved') && Y.overview(s).chess.phase === 'rr' && Y.overview(s).chess.rr.tied === true);
  const o = Y.setChessOrder(s, [W[2], W[0], W[1]]);
  const co = Y.chess(o);
  check('setChessOrder decides: top two = first two of it, third = last', !co.rr.tied && same(co.rr.top2, [W[2], W[0]]) && co.rr.third === W[1] && co.rr.table.every(r => r.decided && r.flag === null) && same(o.chess.rr.order, [W[2], W[0], W[1]]));
  const f = Y.setChessFinal(o, W[2]);
  check('then the final and the podium work', same(Y.chess(f).podium, [W[2], W[0], W[1]]));
  check('re-ordering after the final removes a final winner who is no longer in the top two', (() => { const x = Y.setChessOrder(f, [W[1], W[0], W[2]]); return x.chess.final.w === null && Y.chess(x).podium === null && same(Y.chess(x).rr.top2, [W[1], W[0]]); })());
  check('setChessOrder needs the three teams of the tie', throwsCode(() => Y.setChessOrder(s, [W[0], W[1]]), 'not_tied') && throwsCode(() => Y.setChessOrder(s, [W[0], W[1], 't99']), 'unknown_team') && throwsCode(() => Y.setChessOrder(s, 'abc'), 'bad_order') && throwsCode(() => Y.setChessOrder(s, [W[0], W[0], W[1]]), 'bad_order'));
  const clean = chessRun(base());
  check('setChessOrder with no tie is refused, and so is an unfinished round robin', throwsCode(() => Y.setChessOrder(clean, Y.chess(clean).rr.teams), 'not_tied') && throwsCode(() => Y.setChessOrder(Y.setChessRR(s, W[0], W[2], null), W), 'rr_incomplete') && throwsCode(() => Y.setChessOrder(base(), IDS.slice(0, 3)), 'rr_unavailable'));
  check('the decision is dropped when a result changes the tie (1-1-1 -> 2-1-0)', (() => { const x = Y.setChessRR(o, W[0], W[2], W[0]); return x.chess.rr.order === null && !Y.chess(x).rr.tied && same(Y.validate(x), []); })());
  check('an incomplete round robin is never "tied"', (() => { const x = Y.setChessRR(Y.setChessRR(s, W[0], W[2], null), W[1], W[2], null); return !Y.chess(x).rr.tied && Y.chess(x).rr.top2 === null; })());
}

section('chess: invalidation of dependent results');
{
  const full = chessRun(base());
  const c0 = Y.chess(full);
  check('a complete run to start from', c0.played === 13 && c0.podium !== null && same(Y.validate(full), []));
  // r1 winner changes
  const m0 = c0.r1.matches[0], oldW = m0.w, other = oldW === m0.a ? m0.b : m0.a;
  const r2PairWithOld = c0.r2.matches.find(m => m.a === oldW || m.b === oldW);
  const x1 = Y.setChessWinner(full, 'r1', 0, other);
  const cx = Y.chess(x1);
  check('changing an r1 winner removes the r2 pair that held the old winner', cx.r2.matches.length === 2 && !cx.r2.matches.some(m => m.a === oldW || m.b === oldW) && !cx.r2.matches.some(m => m.a === r2PairWithOld.a && m.b === r2PairWithOld.b));
  check('...and everything after it: round robin, final, podium', cx.r2.winners.length === 2 && cx.rr.teams.length === 0 && cx.rr.played === 0 && x1.chess.rr.order === null && x1.chess.final.w === null && cx.podium === null && cx.final === null && Object.keys(x1.chess.rr.res).length === 0);
  check('...but the other r1 results and the other r2 pairs stay', cx.r1.winners.length === 6 && cx.r2.matches.every(m => c0.r2.matches.some(o => o.a === m.a && o.b === m.b && o.w === m.w)));
  check('...and the free winners can be paired again (the new winner and the orphan)', cx.r2.free.length === 2 && cx.r2.free.includes(other) && same(Y.validate(x1), []));
  const re = Y.setChessPairs(x1, 'r2', cx.r2.matches.map(m => ({ a: m.a, b: m.b })).concat([{ a: cx.r2.free[0], b: cx.r2.free[1] }]));
  check('re-pairing keeps the winners of the pairs that already existed', Y.chess(re).r2.matches.length === 3 && Y.chess(re).r2.winners.length === 2 && Y.chess(re).r2.played === 2);
  // r1 winner entered for the first time does not touch anything
  const sameW = Y.setChessWinner(full, 'r1', 0, oldW);
  check('setting the same winner changes nothing', same(sameW, full));
  // clearing a winner
  const cl = Y.setChessWinner(full, 'r1', 2, null);
  check('clearing an r1 winner removes what depended on it', Y.chess(cl).r1.winners.length === 5 && Y.chess(cl).r2.matches.length === 2 && Y.chess(cl).podium === null && same(Y.validate(cl), []));
  // r2 winner changes
  const p0 = c0.r2.matches[0], oldW2 = p0.w, new2 = oldW2 === p0.a ? p0.b : p0.a;
  const x2 = Y.setChessWinner(full, 'r2', 0, new2);
  const cy = Y.chess(x2);
  const Wn = cy.r2.winners;
  check('changing an r2 winner keeps r1 and r2 pairs, and rebuilds the round robin for the new three', cy.r1.complete && cy.r2.matches.length === 3 && cy.r2.complete && cy.rr.teams.includes(new2) && !cy.rr.teams.includes(oldW2));
  check('round robin results that involved the old winner are gone; the match between the two unchanged winners stays', Object.keys(x2.chess.rr.res).every(k => !k.split('|').includes(oldW2)) && Object.keys(x2.chess.rr.res).length === 1);
  check('the final and podium are cleared', x2.chess.final.w === null && cy.podium === null && cy.played === 6 + 3 + 1 && same(Y.validate(x2), []));
  // the rr result that changes the top two
  const Wf = c0.r2.winners; // W0>W1, W0>W2, W1>W2 ; final winner W1
  const flip = Y.setChessRR(full, Wf[0], Wf[2], Wf[2]); // W2 beats W0: W0 1 win, W1 2 wins? (W0>W1, W1>W2, W2>W0) -> cycle
  check('a flip that makes a 1-1-1 clears the final winner and the order', Y.chess(flip).rr.tied && flip.chess.final.w === null && Y.chess(flip).podium === null);
  const flip2 = Y.setChessRR(full, Wf[1], Wf[2], Wf[2]); // W0>W1, W0>W2, W2>W1: W0 2, W2 1, W1 0 -> top2 [W0, W2], old final winner W1 not in it
  check('a flip that moves the old final winner out of the top two clears the final', same(Y.chess(flip2).rr.top2, [Wf[0], Wf[2]]) && flip2.chess.final.w === null);
  const keep = Y.setChessRR(full, Wf[1], Wf[2], Wf[1]);
  check('rewriting a result with the same winner keeps the final', keep.chess.final.w === full.chess.final.w);
  // a tie-free change that keeps the final winner in the top two keeps the final
  const finalWinnerStays = (() => { const base2 = Y.setChessRR(full, Wf[0], Wf[1], Wf[1]); /* W1 beats W0: W1 2 wins (W0,W2), W0: beat W2 -> 1, W2 0 -> top2 [W1,W0] */ return base2.chess.final.w === Wf[1] && same(Y.chess(base2).rr.top2, [Wf[1], Wf[0]]); })();
  check('a change after which the final winner is still in the top two keeps the final', finalWinnerStays);
  // r1 re-pair
  const oldKeys = new Set(c0.r1.matches.map(m => Y.pairKey(m.a, m.b)));
  let seed = 77, fresh;
  do { fresh = Y.drawPairs(IDS, mulberry32(seed++)); } while (fresh.some(p => oldKeys.has(Y.pairKey(p.a, p.b))));
  const repair = Y.setChessPairs(full, 'r1', fresh);
  check('new round-1 pairs wipe the whole bracket (nothing can stay valid)', Y.chess(repair).r1.winners.length === 0 && Y.chess(repair).r2.matches.length === 0 && Y.chess(repair).played === 0 && Y.chess(repair).podium === null);
  const resave = Y.setChessPairs(full, 'r1', c0.r1.matches.map(m => ({ b: m.a, a: m.b })));
  check('re-saving the same pairs (even with the sides swapped) keeps every result', same(Y.chess(resave).podium, c0.podium) && Y.chess(resave).played === 13);
  check('re-saving the same round-2 pairs keeps the round robin and the final', same(Y.chess(Y.setChessPairs(full, 'r2', c0.r2.matches.map(m => [m.a, m.b]))).podium, c0.podium));
  const rePair2 = Y.setChessPairs(full, 'r2', Y.drawPairs(c0.r2.pool, mulberry32(123)));
  const sameSets = Y.chess(rePair2).r2.matches.every(m => c0.r2.matches.some(o => (o.a === m.a && o.b === m.b) || (o.a === m.b && o.b === m.a)));
  check('different round-2 pairs reset round 2 and everything after it (unless the draw happened to repeat)', sameSets ? true : (Y.chess(rePair2).r2.winners.length === 0 && Y.chess(rePair2).rr.teams.length === 0 && Y.chess(rePair2).podium === null));
  check('winner / index / stage errors', throwsCode(() => Y.setChessWinner(full, 'r1', 6, c0.r1.matches[0].a), 'bad_index') && throwsCode(() => Y.setChessWinner(full, 'r1', -1, 'x'), 'bad_index') && throwsCode(() => Y.setChessWinner(full, 'r1', 0.5, 'x'), 'bad_index') && throwsCode(() => Y.setChessWinner(full, 'r1', 0, 't99'), 'bad_winner') && throwsCode(() => Y.setChessWinner(full, 'r1', 0, undefined), 'bad_winner') && throwsCode(() => Y.setChessWinner(full, 'r3', 0, 'x'), 'bad_stage') && throwsCode(() => Y.setChessWinner(base(), 'r1', 0, 't1'), 'bad_index') && throwsCode(() => Y.setChessPairs(full, 'rr', []), 'bad_stage'));
  check('round-1 pair errors', throwsCode(() => Y.setChessPairs(base(), 'r1', Y.drawPairs(IDS, mulberry32(1)).slice(0, 5)), 'bad_pairs') && throwsCode(() => Y.setChessPairs(base(), 'r1', 'x'), 'bad_pairs') && throwsCode(() => Y.setChessPairs(base(), 'r1', Y.drawPairs(IDS, mulberry32(1)).map((p, i) => i === 0 ? { a: p.a, b: p.a } : p)), 'bad_pairs') && throwsCode(() => Y.setChessPairs(base(), 'r1', Y.drawPairs(IDS, mulberry32(1)).map((p, i) => i === 0 ? { a: p.a, b: 'zz' } : p)), 'unknown_team') && throwsCode(() => Y.setChessPairs(Y.setTeams(Y.emptyState(), TEAMS.slice(0, 10)), 'r1', Y.drawPairs(IDS.slice(0, 10), mulberry32(1))), 'need_12_teams') && throwsCode(() => Y.setChessPairs(base(), 'r1', [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]), 'bad_pairs'));
}

/* ================================================================ 5. team view and overview */
section('teamView and overview');
{
  const s0 = fixed();
  let v = Y.teamView(s0, 't2');
  check('before anything: group, 3 matches, the next one, status "group"', v.group === 0 && v.groupName === 'أ' && v.matches.length === 3 && v.matches.every(m => m.stage === 'group' && !m.played) && v.next !== null && v.status === 'group' && v.row.id === 't2' && v.position === 1);
  check('each opponent is a different group mate', same(v.matches.map(m => m.opponent).sort(), ['t1', 't3', 't4']) && same(v.matches.map(m => m.round).sort(), [1, 2, 3]));
  check('chess: not in a bracket yet', v.chess.stage === 'none' && v.chess.matches.length === 0);
  const undrawn = Y.teamView(base(), 't1');
  check('before the draw: status "not_drawn", no group', undrawn.status === 'not_drawn' && undrawn.group === null && undrawn.matches.length === 0 && undrawn.next === null);
  const s1 = apply(s0, [['t2', 't1', 3, 1, { date: '2026-12-05', time: '17:00' }]]);
  v = Y.teamView(s1, 't2');
  const pm = v.matches.find(m => m.played);
  check('a played match from the team\'s point of view, with date and time', pm.opponent === 't1' && pm.result.gf === 3 && pm.result.ga === 1 && pm.result.outcome === 'W' && pm.date === '2026-12-05' && pm.time === '17:00' && v.row.pts === 3);
  check('the same match for the loser', Y.teamView(s1, 't1').matches.find(m => m.played).result.outcome === 'L' && Y.teamView(s1, 't1').matches.find(m => m.played).result.gf === 1);
  const done = groupsDone(s0);
  check('statuses after the groups: the three qualifiers are in the final round, the others are out', ['t1', 't5', 't9'].every(id => Y.teamView(done, id).status === 'final') && Y.teamView(done, 't2').status === 'out' && Y.teamView(done, 't4').status === 'out');
  check('a half-finished group says "group"', Y.teamView(apply(s0, strong(['t5', 't6', 't7', 't8'])), 't1').status === 'group');
  v = Y.teamView(done, 't1');
  check('a qualifier sees 3 group matches + 2 final matches; status "final"', v.matches.length === 5 && v.matches.filter(m => m.stage === 'final').length === 2 && v.status === 'final');
  const fin = apply(done, [['t1', 't5', 2, 0], ['t1', 't9', 1, 0], ['t5', 't9', 3, 1]]);
  check('podium statuses first / second / third, others out', Y.teamView(fin, 't1').status === 'first' && Y.teamView(fin, 't5').status === 'second' && Y.teamView(fin, 't9').status === 'third' && Y.teamView(fin, 't9').podium === 3 && Y.teamView(fin, 't3').status === 'out' && Y.teamView(fin, 't1').next === null);
  const tie = apply(s0, [['t1', 't2', 1, 1], ['t1', 't3', 1, 0], ['t1', 't4', 1, 0], ['t2', 't3', 1, 0], ['t2', 't4', 1, 0], ['t3', 't4', 0, 0]]);
  check('a team in an unresolved first-place tie has status "tie"; the others are out', Y.teamView(tie, 't1').status === 'tie' && Y.teamView(tie, 't2').status === 'tie' && Y.teamView(tie, 't3').status === 'out');
  check('a group winner waiting for the other groups is "qualified"', Y.teamView(apply(s0, strong(['t1', 't2', 't3', 't4'])), 't1').status === 'qualified');
  const forf = Y.adminResult(s0, 't1', 't2', 'absent', 't1');
  check('forfeits show in the team view', Y.teamView(forf, 't1').matches.find(m => m.played).result.adm === 'absent');
  check('teamView of an unknown team', throwsCode(() => Y.teamView(s0, 'zz'), 'unknown_team') && throwsCode(() => Y.teamView(s0), 'unknown_team'));
  // chess stages
  const full = chessRun(s0);
  const c = Y.chess(full), W = c.r2.winners;
  check('chess stages: champion / second / third', Y.teamView(full, c.podium[0]).chess.stage === 'first' && Y.teamView(full, c.podium[1]).chess.stage === 'second' && Y.teamView(full, c.podium[2]).chess.stage === 'third' && Y.teamView(full, c.podium[2]).chess.podium === 3);
  const lostR1 = IDS.find(id => !c.r1.winners.includes(id)), lostR2 = c.r1.winners.find(id => !W.includes(id));
  check('eliminated in round 1 / round 2', Y.teamView(full, lostR1).chess.stage === 'out' && Y.teamView(full, lostR1).chess.outAt === 'r1' && Y.teamView(full, lostR2).chess.outAt === 'r2');
  check('the champion\'s chess history: r1, r2, two round robin matches and the final (won r1, r2 and the final)', (() => { const m = Y.teamView(full, c.podium[0]).chess.matches; return m.map(x => x.round).join() === 'r1,r2,rr,rr,final' && m[0].won && m[1].won && m[4].won && m.filter(x => x.round === 'rr').length === 2; })());
  check('a team waiting between rounds', (() => { let s = Y.setChessPairs(s0, 'r1', Y.drawPairs(IDS, mulberry32(2))); const m = Y.chess(s).r1.matches; s = Y.setChessWinner(s, 'r1', 0, m[0].a); return Y.teamView(s, m[0].a).chess.stage === 'r2' && Y.teamView(s, m[1].a).chess.stage === 'r1' && Y.teamView(s, m[1].a).chess.next.round === 'r1' && Y.teamView(s, m[0].b).chess.stage === 'out'; })());
  // overview
  let o = Y.overview(Y.emptyState());
  check('overview of an empty state', o.teams === 0 && o.drawn === false && o.football.phase === 'draw' && o.chess.phase === 'setup' && o.football.total === 21 && o.chess.total === 13 && o.done === false);
  o = Y.overview(base());
  check('12 teams, not drawn', o.teams === 12 && o.football.phase === 'draw' && o.chess.phase === 'setup');
  o = Y.overview(s1);
  check('groups phase: 1 of 18 played', o.football.phase === 'groups' && o.football.groups.played === 1 && o.football.groups.total === 18 && !o.football.groups.done && o.football.played === 1);
  o = Y.overview(done);
  check('final phase after the groups', o.football.phase === 'final' && o.football.groups.done && o.football.groups.played === 18 && o.football.final.played === 0 && o.football.podium === null);
  o = Y.overview(fin);
  check('football done with its podium', o.football.phase === 'done' && o.football.final.done && same(o.football.podium, ['t1', 't5', 't9']) && o.football.played === 21 && o.chess.phase === 'setup' && o.done === false);
  o = Y.overview(chessRun(fin));
  check('both done', o.done === true && o.podiums.football.length === 3 && o.podiums.chess.length === 3);
  o = Y.overview(tie);
  check('overview reports the pending ties', o.football.pending.some(p => p.scope === 'g0' && p.reason === 'tie') && o.football.phase === 'groups');
  const stages = (() => { let s = Y.setChessPairs(base(), 'r1', Y.drawPairs(IDS, mulberry32(4))); const out = [Y.overview(s).chess.phase]; Y.chess(s).r1.matches.forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, m.a); }); out.push(Y.overview(s).chess.phase); s = Y.setChessPairs(s, 'r2', Y.drawPairs(Y.chess(s).r2.pool, mulberry32(4))); Y.chess(s).r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, m.a); }); out.push(Y.overview(s).chess.phase); const W2 = Y.chess(s).r2.winners; s = Y.setChessRR(s, W2[0], W2[1], W2[0]); s = Y.setChessRR(s, W2[0], W2[2], W2[0]); s = Y.setChessRR(s, W2[1], W2[2], W2[1]); out.push(Y.overview(s).chess.phase); s = Y.setChessFinal(s, W2[0]); out.push(Y.overview(s).chess.phase); return out; })();
  check('chess phases walk r1 -> r2 (pairing) -> rr -> final -> done', same(stages, ['r1', 'r2', 'rr', 'final', 'done']));
}

/* ================================================================ 6. normalize, validate, share link */
section('normalize / validate (legacy, partial, hostile input)');
{
  check('normalize of nothing / junk gives the empty state', same(Y.normalize(null), Y.emptyState()) && same(Y.normalize(undefined), Y.emptyState()) && same(Y.normalize('x'), Y.emptyState()) && same(Y.normalize([]), Y.emptyState()) && same(Y.normalize(42), Y.emptyState()));
  const legacy = Y.normalize({ teams: ['الأمل', 'النور', '', 5, null] });
  check('legacy: teams given as plain names get ids t1, t2 (empty / junk entries dropped)', same(legacy.teams, [{ id: 't1', name: 'الأمل' }, { id: 't2', name: 'النور' }]));
  const messy = Y.normalize({
    v: 99, updated: 5, teams: TEAMS.concat([{ id: 'extra', name: 'ثالث عشر' }, { id: 't1', name: 'مكرر' }]),
    groups: [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't10', 't11', 'ghost']],
    fb: { res: { 'x': { a: 't1', b: 't2', sa: 1, sb: 0 } }, order: { g0: ['t1', 't2'], nope: ['t1', 't2'] } },
    chess: { r1: [{ a: 't1', b: 't2', w: 'ghost' }], final: { w: 'ghost' } }
  });
  check('hostile: version forced to 1, updated emptied, 13th and duplicate teams dropped', messy.v === 1 && messy.updated === '' && messy.teams.length === 12 && messy.teams[0].name === NAMES[0]);
  check('hostile: a group with an unknown team un-draws, results / orders / bad chess are dropped', messy.groups === null && Object.keys(messy.fb.res).length === 0 && Object.keys(messy.fb.order).length === 0 && messy.chess.r1.length === 0 && messy.chess.final.w === null);
  const ok = fixed();
  const dirty = clone(ok);
  dirty.fb.res['t1|t2'] = { a: 't1', b: 't2', sa: 2, sb: 1 };
  dirty.fb.res['bad key'] = { a: 't1', b: 't3', sa: 1, sb: 1 };
  dirty.fb.res['t1|t5'] = { a: 't1', b: 't5', sa: 1, sb: 0 };
  dirty.fb.res['t3|t4'] = { a: 't3', b: 't4', sa: -1, sb: 0 };
  const n = Y.normalize(dirty);
  check('normalize re-keys results by their teams, drops the invalid and the impossible (a cross-group result with no known qualifiers is kept only when it can still happen)', n.fb.res['t1|t2'].sa === 2 && n.fb.res['t1|t3'] !== undefined && n.fb.res['bad key'] === undefined && n.fb.res['t3|t4'] === undefined);
  check('missing result fields are filled in', n.fb.res['t1|t2'].ca === 0 && n.fb.res['t1|t2'].date === '' && n.fb.res['t1|t2'].note === '');
  check('normalize is idempotent', same(Y.normalize(n), n) && same(Y.normalize(Y.normalize(messy)), Y.normalize(messy)));
  check('a partial state with only teams works with every reader', (() => { const p = { teams: TEAMS }; return Y.football(p).groups.length === 0 && Y.chess(p).total === 13 && Y.overview(p).teams === 12 && Y.teamView(p, 't1').status === 'not_drawn'; })());
  check('mutators accept a partial / legacy state too', Y.drawGroups({ teams: TEAMS }, mulberry32(1)).groups.length === 3);
  check('validate: a good state is clean at every stage', same(Y.validate(ok), []) && same(Y.validate(groupsDone(ok)), []) && same(Y.validate(chessRun(groupsDone(ok))), []));
  check('validate: junk', same(Y.validate(null), ['bad_state']) && same(Y.validate('x'), ['bad_state']) && Y.validate({}).includes('bad_version') && Y.validate({ v: 1, teams: 'x' }).includes('bad_teams'));
  const probs = Y.validate(dirty);
  check('validate names what normalize would repair', probs.includes('stale_result:bad key') && probs.includes('stale_result:t3|t4') && probs.every(p => typeof p === 'string'));
  const bad = clone(groupsDone(ok)); bad.fb.order = { g0: ['t1', 't2'] };
  check('validate: a decision for a tie that does not exist', Y.validate(bad).includes('stale_order:g0'));
  const badG = clone(ok); badG.groups[0][0] = 't5';
  check('validate: groups that repeat a team', Y.validate(badG).includes('bad_groups'));
  const badC = clone(chessRun(ok)); badC.chess.final.w = 't99';
  check('validate: chess nonsense', Y.validate(badC).includes('chess_final'));
  const badC2 = clone(chessRun(ok)); badC2.chess.r1.pop();
  check('validate: an r1 with five pairs (and what hangs on it)', Y.validate(badC2).includes('chess_r1') && Y.validate(badC2).includes('chess_r2'));
  const dupName = Y.validate({ v: 1, teams: [{ id: 'a', name: 'س' }, { id: 'b', name: 'س' }] });
  check('validate: duplicate team names are reported', dupName.includes('duplicate_name'));
  check('validate: more than 12 teams', Y.validate({ v: 1, teams: TEAMS.concat([{ id: 'z', name: 'زائد' }]) }).includes('too_many_teams'));
  check('stamp sets the timestamp and nothing else', (() => { const x = Y.stamp(ok, '2026-11-09T10:00:00.000Z'); return x.updated === '2026-11-09T10:00:00.000Z' && same(Object.assign({}, x, { updated: '' }), ok) && Y.stamp(ok).updated === ''; })());
}

section('encode / decode (share link)');
{
  const s = Y.stamp(chessRun(groupsDone(fixed())), '2026-11-09T10:00:00.000Z');
  const str = Y.encode(s);
  check('base64url: no +, /, = or whitespace; text only', /^[A-Za-z0-9_-]+$/.test(str) && str.length > 100);
  check('round trip gives the same state (Arabic names, labels, results, bracket)', same(Y.decode(str), s) && Y.decode(str).teams[0].name === NAMES[0] && Y.decode(str).teams[0].chess === 'لاعب 1');
  const wild = Y.setTeams(Y.emptyState(), [{ id: 'a', name: 'فريق "النور" \\ ✓ 🙂 ‏RTL' }, { id: 'b', name: 'ينابيع ٢٠٢٦ <b>x</b> & é ñ 日本' }]);
  check('UTF-8 safe: quotes, backslashes, emoji, mixed scripts', same(Y.decode(Y.encode(wild)).teams, wild.teams));
  check('the JSON inside is versioned', JSON.parse(Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).v === 1);
  check('decode tolerates a leading "#v=" / "#" and padding', same(Y.decode('#v=' + str), s) && same(Y.decode('#' + str), s) && same(Y.decode(str + '=='), s) && same(Y.decode('  ' + str + '\n'), s));
  check('standard base64 is accepted as well', same(Y.decode(str.replace(/-/g, '+').replace(/_/g, '/')), s));
  const pub = Y.decode(Y.encode(s, { public: true }));
  check('encode({public:true}) drops the chess player labels, keeps team names and the rest', pub.teams.every(t => t.chess === undefined) && pub.teams[0].name === NAMES[0] && same(pub.chess, s.chess) && same(pub.fb, s.fb));
  check('...and the default keeps them', Y.decode(str).teams.every(t => t.chess !== undefined));
  const toB64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  check('decode errors are "bad_share"', ['', '   ', '!!!', 'abc', 'a', 'AAAA', str.slice(0, -7), str + '*', toB64([]), toB64({ v: 2 }), toB64({}), toB64(null), toB64('x'), toB64(5), Buffer.from('not json at all').toString('base64url'), Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString('base64url')].every(x => throwsCode(() => Y.decode(x), 'bad_share')));
  check('...for non-strings and absurd sizes too', throwsCode(() => Y.decode(null), 'bad_share') && throwsCode(() => Y.decode(undefined), 'bad_share') && throwsCode(() => Y.decode({}), 'bad_share') && throwsCode(() => Y.decode('A'.repeat(500000)), 'bad_share'));
  check('a decoded state is normalized: hostile content is cleaned', (() => { const d = Y.decode(toB64({ v: 1, teams: [{ id: 'a', name: 'س' }], fb: { res: { 'a|b': { a: 'a', b: 'b', sa: 1, sb: 0 } } }, chess: { final: { w: 'zz' } } })); return d.teams.length === 1 && Object.keys(d.fb.res).length === 0 && d.chess.final.w === null && same(Y.validate(d), []); })());
  // no TextEncoder / btoa: the Buffer path must give the identical string
  const hold = {};
  ['TextEncoder', 'TextDecoder', 'btoa', 'atob'].forEach(k => { hold[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: undefined, configurable: true, writable: true }); });
  let viaBuffer, backBuffer, errBuffer;
  try { viaBuffer = Y.encode(s); backBuffer = Y.decode(str); errBuffer = code(() => Y.decode('!!!')); } finally { ['TextEncoder', 'TextDecoder', 'btoa', 'atob'].forEach(k => { if (hold[k]) Object.defineProperty(globalThis, k, hold[k]); else delete globalThis[k]; }); }
  check('without TextEncoder/btoa (Buffer fallback) the output is identical and decoding works', viaBuffer === str && same(backBuffer, s) && errBuffer === 'bad_share' && typeof btoa === 'function');
  const big = Y.encode(chessRun(groupsDone(fixed())));
  check('a full tournament link stays small enough to share (< 8 KB)', big.length < 8192, String(big.length));
}

/* ================================================================ 7. immutability and bad input */
section('immutability');
{
  const frozen = deepFreeze(groupsDone(fixed()));
  const snap = canon(frozen);
  const calls = [
    s => Y.setTeams(s, TEAMS), s => Y.drawGroups(s, mulberry32(1)), s => Y.moveTeam(s, 't1', 1), s => Y.setGroups(s, s.groups),
    s => sr(s, 't1', 't2', 3, 3), s => Y.clearResult(s, 't1', 't2'), s => Y.adminResult(s, 't1', 't2', 'absent', 't1'),
    s => Y.setChessPairs(s, 'r1', Y.drawPairs(IDS, mulberry32(1))), s => Y.stamp(s, 'x'), s => Y.normalize(s),
    s => Y.football(s), s => Y.chess(s), s => Y.teamView(s, 't1'), s => Y.overview(s), s => Y.encode(s), s => Y.validate(s), s => Y.groupsValid(s)
  ];
  const outs = calls.map(f => { try { return f(frozen); } catch (e) { return 'ERR ' + e.message; } });
  check('no function throws on a deep-frozen state (strict mode would on any write)', outs.every(o => !(typeof o === 'string' && o.startsWith('ERR'))), outs.filter(o => typeof o === 'string' && o.startsWith('ERR')).join('; '));
  check('the input is unchanged after all of them', canon(frozen) === snap);
  check('mutators return new objects, never the input or a part of it', outs.slice(0, 10).every(o => o !== frozen && o.teams !== frozen.teams && o.fb !== frozen.fb && o.chess !== frozen.chess && o.fb.res !== frozen.fb.res));
  const f2 = deepFreeze(chessRun(groupsDone(fixed())));
  const snap2 = canon(f2);
  const more = [s => Y.setChessWinner(s, 'r1', 0, s.chess.r1[0].a), s => Y.setChessRR(s, Y.chess(s).rr.teams[0], Y.chess(s).rr.teams[1], null), s => Y.setChessFinal(s, null), s => Y.setChessPairs(s, 'r2', s.chess.r2), s => Y.decode(Y.encode(s)), s => Y.setOrder(apply(fixed(), [['t1', 't2', 1, 0]]), 'g0', ['t1', 't2'])];
  const outs2 = more.map(f => code(() => f(f2)));
  check('chess mutators on a frozen state: no write attempts (only expected domain errors)', outs2.slice(0, 5).every(c => c === null) && outs2[5] === 'not_tied', outs2.join(','));
  check('chess state unchanged', canon(f2) === snap2);
  const s = groupsDone(fixed());
  const view = Y.football(s);
  view.groups[0].table[0].pts = 999; view.groups[0].teams.push('x'); view.qualifiers.push('y'); view.groups[0].rounds[0].matches.length = 0;
  check('what the readers return is a copy: editing it does not touch the state or the next read', Y.football(s).groups[0].table[0].pts === 9 && Y.football(s).groups[0].teams.length === 4 && Y.football(s).qualifiers.length === 3 && Y.football(s).groups[0].rounds[0].matches.length === 2);
  const t = Y.table(['A', 'B'], [{ a: 'A', b: 'B', sa: 1, sb: 0 }]);
  t[0].pts = 77;
  check('...same for table rows', Y.table(['A', 'B'], [{ a: 'A', b: 'B', sa: 1, sb: 0 }])[0].pts === 3);
  const x = fixed(); const y = sr(x, 't1', 't2', 1, 0); y.fb.res['t1|t2'].sa = 50;
  check('mutating a returned state does not leak back into the previous one', x.fb.res['t1|t2'] === undefined);
}

section('bad input is rejected with an English code');
{
  const e1 = (() => { try { sr(fixed(), 't1', 't2', -1, 0); } catch (e) { return e; } return null; })();
  check('errors are Error objects with the code as message and .code', e1 instanceof Error && e1.message === 'bad_score' && e1.code === 'bad_score');
  const s = fixed();
  const attempts = [
    [() => Y.setResult(s, {}), 'unknown_team'], [() => Y.setResult(s, { a: 't1', b: 't2' }), 'bad_score'], [() => Y.setResult(s, { a: 't1', b: 't2', sa: 1 }), 'bad_score'],
    [() => Y.clearResult(s, 'zz', 't1'), 'unknown_team'], [() => Y.clearResult(s, 't1', 't1'), 'same_team'],
    [() => Y.setOrder(s, 'g0', null), 'bad_order'], [() => Y.draw(s, 'zz', mulberry32(1)), 'bad_scope'], [() => Y.draw(base(), 'g0', mulberry32(1)), 'no_groups'], [() => Y.draw(s, 'final', mulberry32(1)), 'final_not_ready'],
    [() => Y.setChessFinal(null, 't1'), 'rr_unavailable'], [() => Y.setChessRR(s, 't1', 't2', 't1'), 'rr_unavailable'], [() => Y.setChessOrder(s, ['t1', 't2', 't3']), 'rr_unavailable'],
    [() => Y.drawGroups(s, 'rng'), 'bad_rng'], [() => Y.moveTeam(s, 't1', 'x'), 'bad_group'], [() => Y.roundRobin(null), 'bad_ids'], [() => Y.table(null, []), 'bad_ids'], [() => Y.decode(12), 'bad_share']
  ];
  attempts.forEach(([f, c], i) => check('bad input #' + (i + 1) + ' -> ' + c, code(f) === c, 'got ' + code(f)));
  check('a state-less call is treated as an empty state, never a crash (readers)', Y.football(undefined).total === 21 && Y.chess(null).total === 13 && Y.overview({}).teams === 0);
  check('number-like ids are handled as strings (legacy)', Y.normalize({ teams: [{ id: 7, name: 'س' }] }).teams[0].id === '7');
}

/* ================================================================ 8. randomized simulation */
const N = 5000;
section(`randomized simulation: ${N} complete tournaments (seeded)`);
{
  const t0 = Date.now();
  let draws = 0, committees = 0, ties = 0, chessTies = 0, forfeits = 0, edits = 0;
  for (let it = 0; it < N; it++) {
    const rnd = mulberry32((it + 1) * 2654435761);
    const ri = n => Math.floor(rnd() * n);
    const pick = a => a[ri(a.length)];
    const deep = it % 250 === 0; // validate the state after every single step in some iterations
    const step = (s, label) => { if (deep) q('validate clean after ' + label, same(Y.validate(s), []), Y.validate(s).join(';')); return s; };
    let s = Y.setTeams(Y.emptyState(), TEAMS);
    s = Y.drawGroups(s, rnd);
    q('groups valid', Y.groupsValid(s) && s.groups.flat().length === 12);

    // ---- football group stage: all 18 matches in a random order, random orientation, some forfeits, some edits
    const matches = [];
    s.groups.forEach(g => Y.roundRobin(g).flat().forEach(m => matches.push(m)));
    q('18 group matches', matches.length === 18);
    for (let i = matches.length - 1; i > 0; i--) { const j = ri(i + 1); [matches[i], matches[j]] = [matches[j], matches[i]]; }
    const played = {}; // pairKey -> {a,b,sa,sb}
    const enter = (a, b) => {
      if (ri(2)) [a, b] = [b, a];
      if (ri(100) < 6) {
        const fault = ri(2) ? a : b;
        s = Y.adminResult(s, a, b, pick(['absent', 'late', 'withdraw', 'unregistered']), fault);
        played[Y.pairKey(a, b)] = { a, b, sa: fault === a ? 0 : 3, sb: fault === b ? 0 : 3 };
        forfeits++;
      } else {
        let sa = ri(5), sb = ri(5);
        if (ri(4) === 0) sb = sa;
        const ca = ri(4), cb = ri(4), x = { ca, cb };
        if (ri(2)) { x.ra = ri(ca + 1); x.rb = ri(cb + 1); }
        s = sr(s, a, b, sa, sb, x);
        played[Y.pairKey(a, b)] = { a, b, sa, sb };
      }
      step(s, 'result');
    };
    matches.forEach(([a, b], i) => {
      enter(a, b);
      if (ri(100) < 4) { edits++; enter(a, b); } // correct a result
    });
    q('18 results stored', Object.keys(s.fb.res).length === 18);

    // ---- resolve every flagged tie (groups): draw or committee order
    const resolve = scopes => {
      for (let guard = 0; guard < 12; guard++) {
        const fb = Y.football(s);
        const tables = scopes === 'groups' ? fb.groups.map((g, i) => ['g' + i, g.table]) : [['final', fb.final.table]];
        const open = tables.find(([, t]) => t.some(r => r.flag));
        if (!open) return;
        const [scope, t] = open;
        ties++;
        const flagged = t.filter(r => r.flag);
        // the flagged rows of one scope form clusters; settle the first flagged one
        const first = flagged[0];
        if (first.flag === 'draw') { s = Y.draw(s, scope, rnd); draws++; } else {
          const ids = first.tieWith.slice();
          for (let i = ids.length - 1; i > 0; i--) { const j = ri(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
          s = Y.setOrder(s, scope, ids); committees++;
        }
        step(s, 'tie decision');
      }
      q('ties always resolve', false, 'guard');
    };
    resolve('groups');

    let fb = Y.football(s);
    // points conservation and rank permutation, per group
    fb.groups.forEach((g, gi) => {
      const keys = Y.roundRobin(g.teams).flat().map(m => Y.pairKey(m[0], m[1]));
      let decisive = 0, drw = 0, gf = 0, ga = 0;
      keys.forEach(k => { const r = played[k]; if (r.sa === r.sb) drw++; else decisive++; });
      const pts = g.table.reduce((n, r) => n + r.pts, 0);
      q('group points = 3 x decisive + 2 x draws', pts === 3 * decisive + 2 * drw, `${pts} vs ${3 * decisive + 2 * drw}`);
      q('group goals for = goals against', g.table.reduce((n, r) => n + r.gf, 0) === g.table.reduce((n, r) => n + r.ga, 0));
      q('group goal difference sums to 0', g.table.reduce((n, r) => n + r.gd, 0) === 0);
      q('group ranks are a permutation of 1..4', g.table.map(r => r.rank).sort().join() === '1,2,3,4');
      q('group table lists each team once', new Set(g.table.map(r => r.id)).size === 4 && g.table.every(r => g.teams.includes(r.id)));
      q('every team played 3, w+d+l = p', g.table.every(r => r.p === 3 && r.w + r.d + r.l === 3 && r.pts === 3 * r.w + r.d && r.gd === r.gf - r.ga));
      q('table sorted: points, then goal difference, then goals scored never increase', g.table.every((r, i) => i === 0 || r.pts < g.table[i - 1].pts || (r.pts === g.table[i - 1].pts && (r.gd < g.table[i - 1].gd || (r.gd === g.table[i - 1].gd && r.gf <= g.table[i - 1].gf)))));
      q('group complete, 6 played', g.complete && g.played === 6 && g.total === 6);
      q('the group winner is the qualifier', fb.qualifiers && fb.qualifiers[gi] === g.table[0].id && g.first === g.table[0].id);
      // pairs of neighbours level on everything and resolved by head-to-head / cards agree with a reference check
      g.table.forEach((r, i) => {
        const nx = g.table[i + 1];
        if (!nx || r.pts !== nx.pts || r.gd !== nx.gd || r.gf !== nx.gf || r.decided || nx.decided) return;
        const res = played[Y.pairKey(r.id, nx.id)];
        const threeWay = g.table.filter(z => z.pts === r.pts && z.gd === r.gd && z.gf === r.gf).length > 2;
        if (!threeWay && res.sa !== res.sb) q('two teams level: the head-to-head winner is first', (res.sa > res.sb ? res.a : res.b) === r.id, `${r.id} vs ${nx.id}`);
      });
    });
    q('exactly 3 distinct qualifiers, one per group', fb.qualifiers && fb.qualifiers.length === 3 && new Set(fb.qualifiers).size === 3 && fb.qualifiers.every((id, gi) => s.groups[gi].includes(id)));
    q('no pending group', fb.pending.length === 1 && fb.pending[0].scope === 'final' && fb.pending[0].reason === 'incomplete');

    // ---- final round
    const fm = Y.roundRobin(fb.qualifiers).flat();
    q('final round: 3 matches, each team plays 2', fm.length === 3 && fb.qualifiers.every(id => fm.filter(m => m.includes(id)).length === 2));
    fm.forEach(([a, b]) => {
      if (ri(2)) [a, b] = [b, a];
      let sa = ri(4), sb = ri(4);
      if (ri(3) === 0) sb = sa;
      const ca = ri(3), cb = ri(3);
      s = sr(s, a, b, sa, sb, { ca, cb });
      played[Y.pairKey(a, b)] = { a, b, sa, sb };
      step(s, 'final result');
    });
    resolve('final');
    fb = Y.football(s);
    const f = fb.final;
    q('final round complete, 3 played', f.complete && f.played === 3 && f.table.every(r => r.p === 2));
    const fpts = f.table.reduce((n, r) => n + r.pts, 0);
    const fdraw = fm.filter(([a, b]) => played[Y.pairKey(a, b)].sa === played[Y.pairKey(a, b)].sb).length;
    q('final round points = 3 x decisive + 2 x draws', fpts === 3 * (3 - fdraw) + 2 * fdraw);
    q('final ranks are a permutation of 1..3', f.table.map(r => r.rank).sort().join() === '1,2,3');
    q('exactly one podium of 3 distinct teams, in table order', fb.podium && fb.podium.length === 3 && new Set(fb.podium).size === 3 && fb.podium.every((id, i) => id === f.table[i].id && fb.qualifiers.includes(id)));
    q('football played = total = 21 (18 + 3)', fb.played === 21 && fb.total === 21);
    q('nothing pending', fb.pending.length === 0);

    // ---- chess
    let c = Y.chess(s);
    q('chess starts empty', c.played === 0 && c.total === 13);
    s = Y.setChessPairs(s, 'r1', Y.drawPairs(IDS, rnd)); step(s, 'r1 pairs');
    c = Y.chess(s);
    q('r1: 6 pairs over the 12 teams', c.r1.matches.length === 6 && new Set(c.r1.matches.flatMap(m => [m.a, m.b])).size === 12);
    c.r1.matches.forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, ri(2) ? m.a : m.b); step(s, 'r1 winner'); });
    c = Y.chess(s);
    q('r1: 6 winners, one per pair', c.r1.complete && c.r1.winners.length === 6 && c.r1.matches.every(m => m.w === m.a || m.w === m.b) && new Set(c.r1.winners).size === 6);
    s = Y.setChessPairs(s, 'r2', Y.drawPairs(c.r2.pool, rnd)); step(s, 'r2 pairs');
    c = Y.chess(s);
    q('r2: 3 pairs over the 6 winners', c.r2.matches.length === 3 && c.r2.matches.every(m => c.r1.winners.includes(m.a) && c.r1.winners.includes(m.b)) && new Set(c.r2.matches.flatMap(m => [m.a, m.b])).size === 6);
    c.r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, ri(2) ? m.a : m.b); step(s, 'r2 winner'); });
    c = Y.chess(s);
    q('r2: 3 winners', c.r2.complete && c.r2.winners.length === 3 && new Set(c.r2.winners).size === 3);
    const W = c.r2.winners;
    q('round robin: 3 matches, each plays 2', c.rr.matches.length === 3 && W.every(id => c.rr.matches.filter(m => m.a === id || m.b === id).length === 2));
    c.rr.matches.forEach(m => { s = Y.setChessRR(s, m.a, m.b, ri(2) ? m.a : m.b); step(s, 'rr result'); });
    c = Y.chess(s);
    q('round robin complete: 3 results, wins sum to 3', c.rr.complete && c.rr.table.reduce((n, r) => n + r.w, 0) === 3 && c.rr.table.every(r => r.p === 2));
    if (c.rr.tied) {
      chessTies++;
      q('only 1-1-1 can tie', c.rr.table.every(r => r.w === 1 && r.flag === 'committee'));
      const ids = W.slice();
      for (let i = ids.length - 1; i > 0; i--) { const j = ri(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      s = Y.setChessOrder(s, ids); step(s, 'rr order');
      c = Y.chess(s);
    }
    q('top two decided, the third known', c.rr.top2 && c.rr.top2.length === 2 && c.rr.third && new Set(c.rr.top2.concat([c.rr.third])).size === 3 && c.rr.top2.concat([c.rr.third]).every(id => W.includes(id)));
    q('rank order matches the table', c.rr.table.map(r => r.id).join() === c.rr.top2.concat([c.rr.third]).join() && c.rr.table.map(r => r.rank).join() === '1,2,3');
    s = Y.setChessFinal(s, pick(c.rr.top2)); step(s, 'final');
    c = Y.chess(s);
    q('chess final: winner is one of the two', c.final && c.rr.top2.includes(c.final.w) && c.final.a === c.rr.top2[0] && c.final.b === c.rr.top2[1]);
    q('chess podium: [final winner, final loser, third], 3 distinct teams', c.podium && c.podium.length === 3 && new Set(c.podium).size === 3 && c.podium[0] === c.final.w && c.podium[1] === c.rr.top2.find(id => id !== c.final.w) && c.podium[2] === c.rr.third);
    q('chess played = total = 13 (6 + 3 + 3 + 1)', c.played === 13 && c.total === 13 && c.r1.played === 6 && c.r2.played === 3 && c.rr.played === 3);

    // ---- the whole state
    const o = Y.overview(s);
    q('overview: both done, 21 + 13', o.done && o.football.phase === 'done' && o.chess.phase === 'done' && o.football.played === 21 && o.chess.played === 13);
    q('no problems in the final state', same(Y.validate(s), []), Y.validate(s).join(';'));
    q('teamView podium statuses', fb.podium.every((id, i) => Y.teamView(s, id).podium === i + 1) && c.podium.every((id, i) => Y.teamView(s, id).chess.podium === i + 1));
    if (it % 20 === 0) {
      q('encode/decode round trip', same(Y.decode(Y.encode(s)), Y.normalize(s)));
      q('normalize is a no-op on a mutator result', same(Y.normalize(s), s));
      q('a draw seed gives the same state twice', same(Y.drawGroups(Y.setTeams(Y.emptyState(), TEAMS), mulberry32(it)), Y.drawGroups(Y.setTeams(Y.emptyState(), TEAMS), mulberry32(it))));
    }
    // a deliberate edit of an early result invalidates the later ones consistently
    if (it % 10 === 0) {
      const mm = Y.chess(s).r1.matches[ri(6)];
      const flip = Y.setChessWinner(s, 'r1', mm.index, mm.w === mm.a ? mm.b : mm.a);
      q('flipping an r1 winner leaves a consistent state with no podium', same(Y.validate(flip), []) && Y.chess(flip).podium === null && Y.chess(flip).r2.matches.length === 2);
      const g = ri(3), gm = Y.roundRobin(s.groups[g]).flat()[ri(6)];
      const alt = Y.setResult(s, { a: gm[0], b: gm[1], sa: ri(5), sb: ri(5) });
      q('re-entering a group result leaves a consistent state', same(Y.validate(alt), []));
    }
  }
  console.log(`  (${N} tournaments in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ties} ties settled — ${draws} by draw, ${committees} by committee order; ${chessTies} chess 1-1-1 ties; ${forfeits} forfeits; ${edits} corrected results)`);
  check(`simulation: ${N} tournaments, every invariant held`, quietFails.size === 0, [...quietFails].join('; '));
  check('simulation exercised both kinds of tie, forfeits and chess ties', draws > 0 && committees > 0 && chessTies > 0 && forfeits > 0 && edits > 0, `${draws}/${committees}/${chessTies}/${forfeits}/${edits}`);
}

/* ================================================================ fixtures planned in advance + taking back a tie decision */
section('schedule (fb.sched) and clearOrder');
{
  const s0 = fixed();
  const s1 = Y.setSchedule(s0, 't1', 't2', { date: '2026-11-20', time: '16:00' });
  check('setSchedule stores date and time under the pair key', same(s1.fb.sched['t1|t2'], { date: '2026-11-20', time: '16:00' }));
  check('input state is untouched (immutable)', !s0.fb.sched['t1|t2'] && same(s0.fb.sched, {}));
  const g0 = Y.football(s1).groups[0].rounds.flatMap(r => r.matches).find(m => m.key === 't1|t2');
  check('football() exposes the plan on the match, orientation-free', same(g0.sched, { date: '2026-11-20', time: '16:00' }) && g0.res === null);
  check('the order of the two teams does not matter', same(Y.setSchedule(s0, 't2', 't1', { date: '2026-11-20', time: '16:00' }).fb.sched, s1.fb.sched));
  const v = Y.teamView(s1, 't2');
  const m12 = v.matches.find(m => m.opponent === 't1');
  check('teamView shows the planned date/time while unplayed', m12 && m12.date === '2026-11-20' && m12.time === '16:00' && !m12.played);
  check('the next match of t1 is its earliest unplayed fixture with the plan attached', Y.teamView(s1, 't1').next && Y.teamView(s1, 't1').next.opponent !== undefined);
  const s2 = sr(s1, 't1', 't2', 2, 1);
  check('a result without its own date keeps showing the plan', Y.teamView(s2, 't1').matches.find(m => m.opponent === 't2').date === '2026-11-20');
  const s3 = sr(s1, 't1', 't2', 2, 1, { date: '2026-11-22', time: '10:30' });
  check('a result date wins over the plan', Y.teamView(s3, 't1').matches.find(m => m.opponent === 't2').date === '2026-11-22');
  check('empty date and time remove the plan', same(Y.setSchedule(s1, 't1', 't2', { date: '', time: '' }).fb.sched, {}));
  check('a time alone is allowed', same(Y.setSchedule(s0, 't3', 't4', { time: '15:00' }).fb.sched['t3|t4'], { date: '', time: '15:00' }));
  check('unknown team / same team / no groups / long text are rejected', throwsCode(() => Y.setSchedule(s0, 't1', 'zz', { date: 'x' }), 'unknown_team')
    && throwsCode(() => Y.setSchedule(s0, 't1', 't1', { date: 'x' }), 'same_team')
    && throwsCode(() => Y.setSchedule(base(), 't1', 't2', { date: 'x' }), 'no_groups')
    && throwsCode(() => Y.setSchedule(s0, 't1', 't2', { date: 'x'.repeat(201) }), 'bad_text'));
  check('a cross-group fixture is refused until both are known qualifiers', throwsCode(() => Y.setSchedule(s0, 't1', 't5', { date: 'x' }), 'final_not_ready'));
  const done = groupsDone(s0);
  check('final-round fixtures can be planned between the three qualifiers', same(Y.setSchedule(done, 't1', 't5', { date: '2026-12-01' }).fb.sched['t1|t5'], { date: '2026-12-01', time: '' }));
  check('...but not with a team that did not qualify', throwsCode(() => Y.setSchedule(done, 't1', 't6', { date: 'x' }), 'not_in_final'));
  const fin = Y.setSchedule(done, 't1', 't5', { date: '2026-12-01' });
  const refin = Y.football(fin).final.rounds.flatMap(r => r.matches).find(m => m.key === 't1|t5');
  check('football().final carries the plan', refin && refin.sched && refin.sched.date === '2026-12-01');
  const changed = sr(fin, 't5', 't6', 0, 5);   // t6 now first of its group: t5 is no longer a qualifier
  check('a plan for a pair that stopped being a fixture is dropped automatically', !('t1|t5' in changed.fb.sched) && same(Y.validate(changed), []));
  const moved = Y.moveTeam(s1, 't2', 1);
  check('moving a team away drops the plans of fixtures that no longer exist', !('t1|t2' in moved.fb.sched) && same(Y.validate(moved), []));
  check('a new group draw clears the plans', same(Y.drawGroups(s1, rr1()).fb.sched, {}));
  check('removing a team clears plans that name it', same(Y.setTeams(s1, TEAMS.slice(0, 11)).fb.sched, {}));
  const dec = Y.decode(Y.encode(s1));
  check('encode/decode keeps the plan', same(dec.fb.sched, s1.fb.sched));
  check('normalize drops garbage plans', same(Y.normalize({ ...s1, fb: { ...s1.fb, sched: { 'x|y': { date: 'a' }, 't2|t1': { date: 'a' }, 't1|t2': 5, 't1|t3': { date: 'ok', time: '' } } } }).fb.sched, { 't1|t3': { date: 'ok', time: '' } }));
  check('validate flags a stale plan', Y.validate({ ...s1, fb: { ...s1.fb, sched: { 't1|t5': { date: 'a', time: '' } } } }).some(c => c.startsWith('stale_sched')));
  check('validate is clean after setSchedule', same(Y.validate(s1), []));
  check('old states without sched load fine', same(Y.normalize({ v: 1, teams: TEAMS, groups: s0.groups, fb: { res: {}, order: {} } }).fb.sched, {}));

  // clearOrder
  const tie = apply(fixed(), [['t1', 't2', 0, 0], ['t1', 't3', 0, 0], ['t1', 't4', 0, 0], ['t2', 't3', 0, 0], ['t2', 't4', 0, 0], ['t3', 't4', 0, 0]]);
  check('an all-draw group is a flagged draw tie', Y.football(tie).groups[0].ties.length === 1 && Y.football(tie).groups[0].ties[0].flag === 'draw');
  const drawn = Y.draw(tie, 'g0', mulberry32(5));
  check('after draw() the tie is decided and the group has a first', Y.football(drawn).groups[0].first !== null && !!drawn.fb.order.g0);
  const cleared = Y.clearOrder(drawn, 'g0');
  check('clearOrder(scope) takes the decision back: tie flagged again', !cleared.fb.order.g0 && Y.football(cleared).groups[0].first === null && Y.football(cleared).groups[0].ties[0].flag === 'draw');
  check('the decision can be drawn again afterwards', Y.football(Y.draw(cleared, 'g0', mulberry32(6))).groups[0].first !== null);
  const ids4 = Y.football(drawn).groups[0].ties[0].ids;
  check('clearOrder(scope, ids) removes only that tied set', !Y.clearOrder(drawn, 'g0', ids4).fb.order.g0);
  check('clearOrder with another set changes nothing', same(Y.clearOrder(drawn, 'g0', ['t1', 't2']).fb.order, drawn.fb.order));
  check('clearOrder is idempotent', same(Y.clearOrder(cleared, 'g0'), cleared));
  check('clearOrder errors: bad scope, no groups, final not ready, bad ids', throwsCode(() => Y.clearOrder(tie, 'zz'), 'bad_scope')
    && throwsCode(() => Y.clearOrder(base(), 'g0'), 'no_groups') && throwsCode(() => Y.clearOrder(tie, 'final'), 'final_not_ready')
    && throwsCode(() => Y.clearOrder(tie, 'g0', 'nope'), 'bad_order'));
  check('clearOrder keeps the state valid', same(Y.validate(cleared), []));
  const frozen = deepFreeze(clone(drawn));
  check('clearOrder and setSchedule never touch a frozen input', code(() => Y.clearOrder(frozen, 'g0')) === null && code(() => Y.setSchedule(deepFreeze(clone(s0)), 't1', 't2', { date: 'd' })) === null);
}

console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} tournament-engine tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
