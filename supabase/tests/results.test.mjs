// Yanabee backend — tests for migration 0007 (live results, approval, scorers, team spirit, history).
// Applies 0001 -> 0007 in PGlite behind the Supabase emulation in harness.mjs. Board states come from the real engine.
// Run:  node supabase/tests/results.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const YT = (() => { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'site/yanabee/js/tournament-engine.js'), 'utf8'), { module: m, exports: m.exports }); return m.exports; })();

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
const M7 = readMigration('0007_yb_results.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql', '0006_yb_waitlist_roles.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M7);
console.log(`migrations 0001-0007 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M7), '0007 is ASCII only');
await E.db.exec(M7);
ok(true, '0007 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, c] of [['offF', 'football'], ['offC', 'chess'], ['offH', 'hifz']]) {
  await signUp(k, Y('member', 'مسؤول ' + c));
  await rpc('admin', 'set_user_role', { target: U[k].id, new_role: 'officer' });
  await rpc('admin', 'yb_set_officer', { target: U[k].id, competition: c, assign: true });
}
for (const [k, r, n] of [['la', 'leader', 'قائد أ'], ['lb', 'leader', 'قائد ب'], ['lc', 'leader', 'قائد ج'], ['ma', 'member', 'سالم أحمد'], ['pa', 'parent', 'ولي سالم']]) await signUp(k, Y(r, n));

async function approvedTeam(who, name, kids) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of kids) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  await owner("update public.teams set status = 'approved' where id = $1", [t.id]);
  return t;
}
const TA = await approvedTeam('la', 'فريق النور', ['سالم أحمد', 'يوسف علي', 'عمر حسن', 'زيد محمود']);
const TB = await approvedTeam('lb', 'فريق الأمل', ['أنس بكر', 'جابر دار', 'هاني وليد', 'كريم سعد']);
const TC = await approvedTeam('lc', 'فريق الغد', ['ماجد علي', 'رامي حسن', 'طارق زيد', 'نادر عمر']);
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' }))?.ok, true, 'a parent links a child of team A');
const memberOf = async (t, n) => (await owner('select id from public.team_members where team_id = $1 and full_name = $2', [t.id, n])).rows[0].id;

// a real board: the three database teams + 9 more, drawn into groups (A and B in the same group)
const others = Array.from({ length: 9 }, (_, i) => ({ id: 'x' + (i + 1), name: 'فريق ' + (i + 4) }));
const teams = [{ id: TA.id, name: TA.name }, { id: TB.id, name: TB.name }, { id: TC.id, name: TC.name }, ...others];
const S = YT.setGroups(YT.setTeams(YT.emptyState(), teams), [[TA.id, TB.id, TC.id, 'x1'], ['x2', 'x3', 'x4', 'x5'], ['x6', 'x7', 'x8', 'x9']]);
eq(val(await rpc('admin', 'publish_state', { state: JSON.stringify(YT.stamp(S, new Date().toISOString())), prev: null }))?.ok, true, 'the admin publishes the drawn board');
const KEY = YT.pairKey(TA.id, TB.id);
const [ka, kb] = KEY.split('|');
const boardNow = async () => (await owner('select state, updated_at from public.tournament_state where id = 1')).rows[0];
await owner('delete from public.yb_notifications');

// ================================================================ 1. live entry
section('the football officer enters a live result');
const live = (who, o) => rpc(who, 'yb_live_set', { comp: 'football', match_key: KEY, a: ka, b: kb, sa: 0, sb: 0, status: 'live', ...o });
let r = await live('offF', { start: true, note: 'بدأت المباراة في الملعب الغربي' });
eq([val(r)?.ok, val(r)?.status, !!val(r)?.started_at], [true, 'live', true], 'kick-off: live, with a clock');
const kick = (await owner('select started_at from public.yb_match_live')).rows[0].started_at.toISOString();
await live('offF', { sa: 1, sb: 0, start: true });
eq((await owner('select started_at from public.yb_match_live')).rows[0].started_at.toISOString(), kick, 'a second start keeps the first kick-off time');
denied(await live('offC', { sa: 2 }), 'the chess officer cannot enter football');
denied(await live('la', { sa: 5 }), 'a leader cannot enter results');
denied(await live('anon', { sa: 5 }), 'anon cannot');
eq(val(await rpc('offF', 'yb_live_set', { comp: 'football', match_key: 'zz|yy', a: ka, b: kb, sa: 0, sb: 0 }))?.error, 'bad_match', 'a key that does not match the teams is refused');
eq(val(await live('offF', { sa: 100 }))?.error, 'bad_score', 'a score over 99 is refused');
eq(val(await live('offF', { sa: 1, ca: 1, ra: 2 }))?.error, 'bad_score', 'more reds than cards is refused');
fails(await live('offF', { status: 'approved' }), 'invalid_argument', 'an officer cannot write «approved»');
eq(val(await rpc('offF', 'yb_live_set', { comp: 'football', match_key: KEY, a: kb, b: ka, sa: 0, sb: 0 }))?.error, 'bad_match', 'the same match cannot be re-entered with the sides swapped');

section('everyone sees the live board, without notes or user ids');
r = await as('anon', 'select comp, match_key, a, b, sa, sb, status, started_at from public.yb_match_live');
eq([r.rows?.length, r.rows?.[0]?.sa, r.rows?.[0]?.status], [1, 1, 'live'], 'anon reads the live score');
denied(await as('anon', 'select note from public.yb_match_live'), 'anon cannot read the officer note');
denied(await as('la', 'select entered_by from public.yb_match_live'), 'nobody reads who typed it');
denied(await as('anon', 'insert into public.yb_match_live (comp, match_key, a, b) values ($1, $2, $3, $4)', ['football', 'a|b', 'a', 'b']), 'anon cannot write rows');
denied(await as('offF', 'update public.yb_match_live set sa = 9'), 'even the officer writes only through the functions');

// ================================================================ 2. scorers and team spirit
section('goals and the team-spirit badge');
const SA = await memberOf(TA, 'سالم أحمد'), YA = await memberOf(TA, 'يوسف علي'), AB = await memberOf(TB, 'أنس بكر');
const mark = (who, o) => rpc(who, 'yb_mark_add', { comp: 'football', match_key: KEY, ...o });
eq(val(await mark('offF', { team_id: TA.id, kind: 'goal', member_id: SA, minute: 12 }))?.ok, true, 'a goal for team A by its member, minute 12');
eq(val(await mark('offF', { team_id: TA.id, kind: 'goal' }))?.ok, true, 'a goal with an unknown scorer still counts');
eq(val(await mark('offF', { team_id: TA.id, kind: 'goal', member_id: AB }))?.error, 'member_not_found', 'a member of team B cannot score for team A');
eq(val(await mark('offF', { team_id: TC.id, kind: 'goal' }))?.error, 'bad_team', 'a team that is not in the match is refused');
eq(val(await mark('offF', { team_id: TA.id, kind: 'spirit' }))?.error, 'member_not_found', 'the team-spirit badge needs a player');
eq(val(await mark('offF', { team_id: TA.id, kind: 'spirit', member_id: SA }))?.ok, true, 'team spirit for team A');
eq(val(await mark('offF', { team_id: TA.id, kind: 'spirit', member_id: YA }))?.ok, true, 'a second pick replaces the first');
eq(val(await mark('offF', { team_id: TB.id, kind: 'spirit', member_id: AB }))?.ok, true, 'team spirit for team B');
eq((await owner("select count(*)::int as n from public.yb_match_marks where kind = 'spirit'")).rows[0].n, 2, 'one team-spirit badge per team and match');
eq(val(await rpc('offF', 'yb_mark_add', { comp: 'football', match_key: 'nope|nope2', team_id: TA.id, kind: 'goal' }))?.error, 'match_not_started', 'no marks before the match row exists');
denied(await mark('offC', { team_id: TA.id, kind: 'goal' }), 'the chess officer cannot add football marks');
denied(await mark('la', { team_id: TA.id, kind: 'goal' }), 'a leader cannot add marks');
fails(await mark('offF', { team_id: TA.id, kind: 'own_goal' }), 'invalid_argument', 'an unknown kind is refused');
const oneGoal = (await owner("select id from public.yb_match_marks where kind = 'goal' and member_id is null")).rows[0].id;
denied(await rpc('la', 'yb_mark_del', { id: oneGoal }), 'a leader cannot remove marks');
eq(val(await rpc('offF', 'yb_mark_del', { id: oneGoal }))?.ok, true, 'the officer removes a goal entered by mistake');

section('who sees which names');
r = await as('anon', 'select team_id, goals, spirit from public.yb_match_counts');
eq(r.rows?.find((x) => x.team_id === TA.id), { team_id: TA.id, goals: 1, spirit: 1 }, 'anon sees counts per team: A 1 goal, 1 team-spirit badge');
denied(await as('anon', 'select * from public.yb_match_marks'), 'anon cannot read the marks');
r = await as('la', 'select team_id from public.yb_match_marks');
ok(r.rows?.length === 2 && r.rows.every((x) => x.team_id === TA.id), 'leader A reads only team A marks');
eq((await as('lc', 'select team_id, kind from public.yb_match_marks')).rows?.length, 0, 'leader C (not in the match) reads none');
denied(await as('la', 'select created_by from public.yb_match_marks'), 'nobody reads who entered a mark');
r = await as('la', 'select full_name, kind from public.yb_my_marks() order by kind');
eq(r.rows?.map((x) => [x.full_name, x.kind]), [['سالم أحمد', 'goal'], ['يوسف علي', 'spirit']], 'leader A: the scorers and the team-spirit player, with names');
eq((await as('ma', 'select kind from public.yb_my_marks()')).rows?.length, 2, 'the joined member of A sees them');
eq((await as('pa', 'select kind from public.yb_my_marks()')).rows?.length, 2, 'the linked parent sees them');
ok(!(await as('lb', 'select full_name from public.yb_my_marks()')).rows?.some((x) => /سالم|يوسف/.test(x.full_name || '')), 'leader B never sees the names of team A');
eq((await as('offF', 'select full_name from public.yb_match_marks_of($1, $2)', ['football', KEY])).rows?.length, 3, 'the football officer reads every mark of the match with names');
denied(await as('la', 'select * from public.yb_match_marks_of($1, $2)', ['football', KEY]), 'a leader cannot use the staff list');
eq((await as('offF', 'select full_name from public.yb_match_roster($1, $2)', ['football', TA.id])).rows?.length, 5, 'the officer reads team A players for the scorer list');
denied(await as('la', 'select * from public.yb_match_roster($1, $2)', ['football', TB.id]), 'a leader cannot read a roster this way');
denied(await as('offH', 'select * from public.yb_match_roster($1, $2)', ['football', TA.id]), 'the hifz officer cannot read football rosters');

// ================================================================ 3. finish, return, approve
section('finishing sends the result to the admin');
r = await live('offF', { sa: 2, sb: 1, ca: 1, ra: 0, status: 'final', a_name: 'فريق النور', b_name: 'فريق الأمل', note: 'مباراة نظيفة' });
eq(val(r)?.status, 'final', 'the officer finishes the match: final');
r = (await owner("select data from public.yb_notifications where user_id = $1 and kind = 'result_pending'", [U.admin.id])).rows;
eq([r.length, r[0]?.data?.a_name, r[0]?.data?.sa], [1, 'فريق النور', 2], 'the admin gets «result waiting» with the teams and the score');
r = await as('offF', 'select status, note, goals, spirit from public.yb_results_queue()');
eq(r.rows?.[0], { status: 'final', note: 'مباراة نظيفة', goals: 1, spirit: 2 }, 'the queue shows the note and the marks counts');
denied(await as('la', 'select * from public.yb_results_queue()'), 'a leader has no queue');
ok(!(await boardNow()).state.fb.res[KEY], 'the published board (the standings) does not have the result while it waits');

section('the admin sends it back with a note');
denied(await rpc('offF', 'yb_result_return', { comp: 'football', match_key: KEY, note: 'x' }), 'an officer cannot return');
fails(await rpc('admin', 'yb_result_return', { comp: 'football', match_key: KEY, note: ' ' }), 'note_required', 'returning needs a note');
await owner('delete from public.yb_notifications');
eq(val(await rpc('admin', 'yb_result_return', { comp: 'football', match_key: KEY, note: 'راجع عدد البطاقات' }))?.ok, true, 'the admin returns it');
eq((await owner('select status, return_note from public.yb_match_live')).rows[0], { status: 'returned', return_note: 'راجع عدد البطاقات' }, 'status returned with the note');
eq((await owner("select count(*)::int as n from public.yb_notifications where user_id = $1 and kind = 'result_returned'", [U.offF.id])).rows[0].n, 1, 'the football officer is told once');
eq(val(await rpc('admin', 'yb_result_return', { comp: 'football', match_key: KEY, note: 'مرة أخرى' }))?.error, 'not_final', 'only a finished result can be returned');
eq(val(await rpc('admin', 'yb_result_approve', { comp: 'football', match_key: KEY, state: '{}', prev: null }))?.error, 'not_final', 'a returned result cannot be approved before it is finished again');
await live('offF', { sa: 2, sb: 1, ca: 1, ra: 1, status: 'final' });
eq((await owner('select status, return_note from public.yb_match_live')).rows[0], { status: 'final', return_note: null }, 'finished again: the note is cleared');

section('approval publishes the board and the result in one step');
const b0 = await boardNow();
const S2 = YT.setResult(b0.state, { a: ka, b: kb, sa: 2, sb: 1, ca: 1, cb: 0, ra: 1, rb: 0 });
const state2 = JSON.stringify(YT.stamp(S2, new Date().toISOString()));
denied(await rpc('offF', 'yb_result_approve', { comp: 'football', match_key: KEY, state: state2, prev: b0.updated_at.toISOString() }), 'an officer cannot approve');
r = val(await rpc('admin', 'yb_result_approve', { comp: 'football', match_key: KEY, state: state2, prev: '2000-01-01T00:00:00Z' }));
eq([r?.ok, r?.conflict], [false, true], 'a stale board: conflict, nothing approved');
eq((await owner('select status from public.yb_match_live')).rows[0].status, 'final', 'the row still waits');
await owner('delete from public.yb_notifications');
r = val(await rpc('admin', 'yb_result_approve', { comp: 'football', match_key: KEY, state: state2, prev: b0.updated_at.toISOString() }));
eq([r?.ok, r?.approved], [true, true], 'the admin approves: board published, row approved');
eq((await owner('select status from public.yb_match_live')).rows[0].status, 'approved', 'status approved');
const b1 = await boardNow();
eq([b1.state.fb.res[KEY]?.sa, b1.state.fb.res[KEY]?.sb], [2, 1], 'the published board now holds the result (it feeds the standings)');
const g = YT.football(b1.state).groups[0];
ok(JSON.stringify(g).includes('"pts":3'), 'the standings give 3 points to the winner');
r = (await owner("select user_id from public.yb_notifications where kind = 'result_approved'")).rows.map((x) => x.user_id);
ok([U.la.id, U.lb.id, U.ma.id, U.pa.id].every((u) => r.includes(u)) && !r.includes(U.lc.id), 'leaders, the joined member and the parent of A and B are told; team C is not');
eq((await owner('select action from public.yb_result_history order by id')).rows.map((x) => x.action).filter((a) => a !== 'live'), ['final', 'returned', 'final', 'approved'], 'history: final, returned, final, approved (the approval itself is not logged twice as a board edit)');
eq(val(await rpc('admin', 'yb_result_approve', { comp: 'football', match_key: KEY, state: state2, prev: null }))?.error, 'already_approved', 'approving twice is refused');

section('after approval only the admin changes it, and every change is logged');
eq(val(await live('offF', { sa: 5, sb: 1, status: 'final' }))?.error, 'already_approved', 'the officer can no longer change the score');
eq(val(await mark('offF', { team_id: TA.id, kind: 'goal' }))?.error, 'already_approved', 'nor add goals');
eq(val(await mark('admin', { team_id: TA.id, kind: 'goal', member_id: SA, minute: 40 }))?.ok, true, 'the admin can still add a missed goal');
const S3 = YT.setResult(b1.state, { a: ka, b: kb, sa: 3, sb: 1, ca: 1, cb: 0, ra: 1, rb: 0 });
eq(val(await rpc('admin', 'publish_state', { state: JSON.stringify(YT.stamp(S3, new Date().toISOString())), prev: b1.updated_at.toISOString() }))?.ok, true, 'the admin corrects the score on the board');
r = (await owner("select before, after, by from public.yb_result_history where action = 'board' and match_key = $1", [KEY])).rows;
eq([r.length, r[0]?.before?.sa, r[0]?.after?.sa, r[0]?.by === U.admin.id], [1, 2, 3, true], 'the correction is in the history with before, after and who');
eq((await owner('select sa, sb, status from public.yb_match_live')).rows[0], { sa: 3, sb: 1, status: 'approved' }, 'the live row follows the board');
const b2 = await boardNow();
const S4 = YT.clearResult(b2.state, ka, kb);
await rpc('admin', 'publish_state', { state: JSON.stringify(YT.stamp(S4, new Date().toISOString())), prev: b2.updated_at.toISOString() });
eq((await owner("select count(*)::int as n from public.yb_result_history where action = 'cleared'")).rows[0].n, 1, 'clearing it on the board is logged');
eq((await owner('select status from public.yb_match_live')).rows[0].status, 'final', 'and the result goes back to the approval queue');

section('history is for staff');
ok((await as('offF', 'select * from public.yb_result_history')).rows?.length >= 6, 'the football officer reads the football history');
eq((await as('offC', 'select * from public.yb_result_history')).rows?.length, 0, 'the chess officer sees no football history');
eq((await as('la', 'select * from public.yb_result_history')).rows?.length, 0, 'a leader sees none');
denied(await as('anon', 'select * from public.yb_result_history'), 'anon cannot read it');

// ================================================================ 4. chess
section('chess results go through the same queue');
r = await rpc('offC', 'yb_live_set', { comp: 'chess', match_key: 'final', a: TA.id, b: TB.id, sa: 1, sb: 0, status: 'final' });
eq(val(r)?.status, 'final', 'the chess officer reports the final: team A wins');
denied(await rpc('offF', 'yb_live_set', { comp: 'chess', match_key: 'final', a: TA.id, b: TB.id, sa: 0, sb: 1, status: 'final' }), 'the football officer cannot report chess');
eq((await as('offC', 'select comp from public.yb_results_queue()')).rows?.map((x) => x.comp), ['chess'], 'the chess officer queue holds chess only');
eq((await as('admin', 'select comp from public.yb_results_queue() order by comp')).rows?.map((x) => x.comp), ['chess', 'football'], 'the admin queue holds both');
denied(await as('offH', 'select * from public.yb_results_queue()'), 'the hifz officer has no results queue');

finish(t0, 70);
