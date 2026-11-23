// Yanabee backend — tests for migration 0006 (the waiting list after 12 teams, member roles).
// Applies 0001 -> 0006 in PGlite behind the Supabase emulation in harness.mjs.
// Run:  node supabase/tests/waitlist.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
const M6 = readMigration('0006_yb_waitlist_roles.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M6);
console.log(`migrations 0001-0006 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M6), '0006 is ASCII only');
await E.db.exec(M6);
ok(true, '0006 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, c] of [['offR', 'registration'], ['offH', 'hifz'], ['offC', 'chess'], ['offF', 'football']]) {
  await signUp(k, Y('member', 'مسؤول ' + c));
  await rpc('admin', 'set_user_role', { target: U[k].id, new_role: 'officer' });
  await rpc('admin', 'yb_set_officer', { target: U[k].id, competition: c, assign: true });
}
for (let i = 1; i <= 16; i++) await signUp('l' + i, Y('leader', 'قائد ' + i));

const T = {};
// a leader's team with 5 members (leader row + 4), sent for review
async function team(i, send = true) {
  const t = (await as('l' + i, 'insert into public.teams (name, area) values ($1, $2) returning *', ['فريق رقم ' + i, 'حي'])).rows[0];
  for (let k = 1; k <= 4; k++) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, `عضو ${k} من فريق ${i}`]);
  T[i] = t.id;
  if (send) eq((await as('l' + i, "update public.teams set status = 'submitted' where id = $1", [t.id])).error, undefined, `leader ${i} sends the team`);
  return t.id;
}
const W = async (i) => (await owner('select waitlist from public.teams where id = $1', [T[i]])).rows[0]?.waitlist;
const pos = async (i) => (await owner('select public.yb_wait_pos($1) as p', [T[i]])).rows[0]?.p;
const kinds = async (who) => (await owner('select kind from public.yb_notifications where user_id = $1 order by id', [U[who].id])).rows.map((x) => x.kind);

// ================================================================ 1. places
section('the first 12 teams sent take places, the rest wait');
await team(1, false);
eq(await W(1), null, 'a draft team has no place yet (waitlist null)');
await as('l1', "update public.teams set status = 'submitted' where id = $1", [T[1]]);
eq(await W(1), false, 'sending it takes a place');
for (let i = 2; i <= 12; i++) await team(i);
eq((await owner('select count(*)::int as n from public.teams where waitlist is false')).rows[0].n, 12, '12 teams hold places');
await team(13);
await team(14);
eq([await W(13), await pos(13), await W(14), await pos(14)], [true, 1, true, 2], 'teams 13 and 14 go to the reserve list, in order');
eq(val(await rpc('anon', 'yb_registration_stats')), { target: 12, waiting: 2, approved: 0, registered: 12 }, 'public counts: 12 with places, 2 waiting');

section('editing keeps the place');
await as('l3', "update public.teams set status = 'draft' where id = $1", [T[3]]);
eq(await W(3), false, 'a team taken back to draft keeps its place');
await as('l3', "update public.teams set status = 'submitted' where id = $1", [T[3]]);
eq([await W(3), await W(13)], [false, true], 'sent again: still in its place, the reserve team still waits');

section('a rejected or deleted team frees its place');
await owner('delete from public.yb_notifications');
eq(val(await rpc('admin', 'yb_review_team', { team_id: T[5], decision: 'reject', note: 'لم تكتمل الشروط' }))?.ok, true, 'the admin rejects team 5');
eq([await W(13), await pos(13), await pos(14)], [false, null, 1], 'team 13 moves up; team 14 is now first in line');
ok((await kinds('l13')).includes('team_seated'), 'leader 13 is told the team has a place now');
eq((await owner("select count(*)::int as n from public.audit_log where action = 'team_seated'")).rows[0].n, 1, 'the move is in the audit log');
await owner('delete from public.teams where id = $1', [T[6]]);
eq([await W(14), await pos(14)], [false, null], 'deleting team 6 lets team 14 move up');
eq(val(await rpc('anon', 'yb_registration_stats')), { target: 12, waiting: 0, approved: 0, registered: 12 }, 'counts: 12 places, nobody waiting');

section('a reopened rejected team must take a place again');
await team(15);
eq(await W(15), true, 'team 15 waits (places full)');
await owner("update public.teams set status = 'draft' where id = $1", [T[5]]);
eq(await W(5), null, 'reopening rejected team 5 clears its place');
await as('l5', "update public.teams set status = 'submitted' where id = $1", [T[5]]);
eq([await W(5), await pos(5), await pos(15)], [true, 2, 1], 'sent again it waits behind team 15');

section('the admin moves teams by hand');
denied(await rpc('offR', 'yb_set_waitlist', { team_id: T[2], waiting: true }), 'the registration officer cannot move places');
denied(await rpc('l2', 'yb_set_waitlist', { team_id: T[2], waiting: true }), 'a leader cannot');
denied(await rpc('anon', 'yb_set_waitlist', { team_id: T[2], waiting: true }), 'anon cannot');
await owner('delete from public.yb_notifications');
eq(val(await rpc('admin', 'yb_set_waitlist', { team_id: T[2], waiting: true }))?.changed, true, 'the admin sends team 2 to the reserve list');
eq([await W(2), await W(15)], [true, false], 'the place goes to team 15, the first in line');
ok((await kinds('l15')).includes('team_seated'), 'leader 15 is told');
eq(val(await rpc('admin', 'yb_set_waitlist', { team_id: T[5], waiting: false }))?.changed, true, 'the admin gives team 5 a place by hand (13 places now)');
ok((await kinds('l5')).includes('team_seated'), 'leader 5 is told');
eq(val(await rpc('admin', 'yb_set_waitlist', { team_id: T[5], waiting: false }))?.changed, false, 'the same move again changes nothing');
const draftT = await team(16, false);
fails(await rpc('admin', 'yb_set_waitlist', { team_id: draftT, waiting: false }), 'invalid_status', 'a team never sent cannot be moved');
fails(await rpc('admin', 'yb_set_waitlist', { team_id: '00000000-0000-0000-0000-000000000000', waiting: false }), 'team_not_found', 'an unknown team is refused');
ok(!!(await as('l1', 'update public.teams set waitlist = true where id = $1', [T[1]])).error, 'a leader cannot write the place column');

section('the online form also waits when places are full');
const reg = (p, addr) => as('anon', "select public.yb_register_team(p => $1::jsonb) as r from (select set_config('request.headers', $2, true)) h", [JSON.stringify(p), JSON.stringify({ 'cf-connecting-ip': addr })]);
const MEMBERS = [{ name: 'خالد سعيد', age: 16, contact: '05301110000' }, { name: 'سالم أحمد', age: 12, contact: '05302220000' }, { name: 'يوسف علي', age: 13, contact: '05303330000' }, { name: 'عمر حسن', age: 14, contact: '05304440000' }, { name: 'زيد محمود', age: 19, contact: '05305550000' }];
let r = val(await reg({ team: 'فريق الفجر', leader: 'خالد سعيد', phone: '0530 517 5431', area: 'حي', members: MEMBERS, reciter1: 'سالم أحمد', reciter2: 'يوسف علي', chess: 'عمر حسن', coordinator: 'سالم أحمد', pledges: true }, '10.1.1.1'));
eq(r?.ok, true, 'the online form is accepted');
const C = val(await as('anon', "select public.yb_track_request(ref => $1, phone => $2) as r from (select set_config('request.headers', '{\"cf-connecting-ip\":\"10.1.1.2\"}', true)) h", [r?.ref, '05305175431']))?.team;
eq([C?.waitlist, C?.wait_pos], [true, 2], 'the tracker shows it on the reserve list, second in line');
eq(C?.roles, { chess: true, coord: true, reciter: true, reserve: true }, 'the checklist says every role is filled (no names)');
ok(!/سالم|يوسف|عمر/.test(JSON.stringify(C)), 'the checklist has no child name');

// ================================================================ 2. roles
section('the form fills the roles from the nominee names');
const FT = r.team_id;
const roles = async (t) => Object.fromEntries((await owner('select full_name, roles from public.team_members where team_id = $1', [t])).rows.map((x) => [x.full_name, x.roles]));
eq(await roles(FT), { 'خالد سعيد': [], 'سالم أحمد': ['reciter', 'coord'], 'يوسف علي': ['reserve'], 'عمر حسن': ['chess'], 'زيد محمود': [] }, 'reciter + coordinator, reserve, chess on the right members');

section('leaders set their roles while the team is editable');
const mem = async (t) => (await owner('select id, full_name from public.team_members where team_id = $1 order by is_leader desc, created_at', [t])).rows;
const M1 = await mem(T[1]);
await as('l1', "update public.teams set status = 'draft' where id = $1", [T[1]]);
r = await rpc('l1', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id, reserve: M1[2].id, chess: M1[3].id, coord: M1[0].id });
eq(val(r)?.ok, true, 'leader 1 sets the four roles');
eq(Object.values(await roles(T[1])).filter((x) => x.length).length, 4, 'four members carry one role each');
r = await rpc('l1', 'yb_set_roles', { team_id: T[1], reciter: M1[2].id, reserve: M1[1].id, chess: M1[3].id });
eq((await roles(T[1]))[M1[0].full_name], [], 'saving again replaces every role (the coordinator was cleared)');
eq((await roles(T[1]))[M1[2].full_name], ['reciter'], 'and moves the reciter');
eq(val(await rpc('l1', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id, reserve: M1[1].id }))?.error, 'same_reciters', 'the same member cannot be reciter and reserve');
eq(val(await rpc('l1', 'yb_set_roles', { team_id: T[1], chess: (await mem(T[2]))[1].id }))?.error, 'member_not_found', 'a member of another team is refused');
denied(await rpc('l2', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id }), 'another leader cannot set them');
denied(await rpc('offH', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id }), 'the hifz officer cannot set them');
denied(await rpc('anon', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id }), 'anon cannot');
ok(!!(await as('l1', "update public.team_members set roles = '{chess}' where id = $1", [M1[4].id])).error, 'roles cannot be written directly');
await as('l1', "update public.teams set status = 'submitted' where id = $1", [T[1]]);
eq(val(await rpc('l1', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id, reserve: M1[2].id, chess: M1[3].id }))?.ok, true, 'still editable while submitted');
await rpc('admin', 'yb_review_team', { team_id: T[1], decision: 'approve' });
denied(await rpc('l1', 'yb_set_roles', { team_id: T[1], reciter: M1[2].id }), 'after approval the leader can no longer change them');
eq(val(await rpc('offR', 'yb_set_roles', { team_id: T[1], reciter: M1[1].id, reserve: M1[2].id, chess: M1[4].id }))?.ok, true, 'the registration officer still can');
eq(val(await rpc('l1', 'yb_team_checklist', { team_id: T[1] }))?.roles, { chess: true, coord: false, reciter: true, reserve: true }, 'the leader checklist shows which roles are filled');

section('the officers read their lists');
r = await as('offH', 'select team_name, full_name, roles from public.yb_role_list()');
ok(r.rows?.length > 0 && r.rows.every((x) => x.roles.every((k) => ['reciter', 'reserve'].includes(k))), 'the hifz officer sees reciters and reserves only');
eq(r.rows?.[0]?.team_name, 'فريق رقم 1', 'approved teams come first');
ok(!r.rows.some((x) => x.team_name === 'فريق الفجر'), 'teams on the reserve list are not on it');
r = await as('offC', 'select full_name, roles from public.yb_role_list()');
ok(r.rows?.length === 1 && r.rows[0].roles.join() === 'chess', 'the chess officer sees chess players only');
r = await as('offR', 'select roles from public.yb_role_list()');
ok(r.rows?.some((x) => x.roles.includes('chess')) && r.rows.some((x) => x.roles.includes('reciter')), 'the registration officer sees every role');
denied(await as('offF', 'select * from public.yb_role_list()'), 'the football officer has no list');
denied(await as('l1', 'select * from public.yb_role_list()'), 'a leader has no list');
denied(await as('anon', 'select * from public.yb_role_list()'), 'anon has no list');

section('the review queue shows places');
r = await as('offR', 'select team_name, waitlist, wait_pos from public.yb_review_list()');
const fajr = r.rows?.find((x) => x.team_name === 'فريق الفجر');
eq([fajr?.waitlist, fajr?.wait_pos], [true, 2], 'the queue shows the reserve place');
eq(r.rows?.find((x) => x.team_name === 'فريق رقم 4')?.wait_pos, null, 'a team with a place has no reserve number');
denied(await as('l1', 'select * from public.yb_review_list()'), 'a leader has no queue');

finish(t0, 60);
