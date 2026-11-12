// Yanabee backend — security tests for migration 0004 (unified schedule, alerts, attendance).
// Applies 0001 -> 0004 in PGlite behind the Supabase emulation in harness.mjs.
// Run:  node supabase/tests/schedule.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
const M4 = readMigration('0004_yb_schedule.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M4);
console.log(`migrations 0001-0004 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M4), '0004 is ASCII only');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
for (const [k, r, n] of [['admin', 'member', 'المشرف'], ['offF', 'member', 'مسؤول الكرة'], ['offC', 'member', 'مسؤول الشطرنج'],
  ['la', 'leader', 'قائد أ'], ['lb', 'leader', 'قائد ب'], ['lc', 'leader', 'قائد ج'], ['ma', 'member', 'سالم أحمد'], ['pa', 'parent', 'ولي سالم'], ['mx', 'member', 'عضو آخر']]) {
  await signUp(k, Y(r, n));
}
await owner("select public.set_admin('admin@example.test')");
for (const [k, c] of [['offF', 'football'], ['offC', 'chess']]) {
  await rpc('admin', 'set_user_role', { target: U[k].id, new_role: 'officer' });
  await rpc('admin', 'yb_set_officer', { target: U[k].id, competition: c, assign: true });
}
const team = async (who, name, status) => {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  if (status !== 'draft') await owner('update public.teams set status = $1 where id = $2', [status, t.id]);
  return t;
};
const TA = await team('la', 'فريق النور', 'draft');
await as('la', 'insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [TA.id, 'سالم أحمد']);
await owner("update public.teams set status = 'approved' where id = $1", [TA.id]);
const TB = await team('lb', 'فريق الأمل', 'approved');
const TC = await team('lc', 'فريق الغد', 'draft');
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد' }))?.ok, true, 'parent links the child in team A');
await owner('delete from public.yb_notifications');

const future = (days, h = 16) => new Date(Date.now() + days * 864e5 + h * 36e5).toISOString();
const ins = (who, o) => as(who, `insert into public.yb_events (competition, kind, title, starts_at, place, team_ids, category, note)
  values ($1, $2, $3, $4, $5, $6::uuid[], $7, $8) returning *`, [o.competition, o.kind || 'match', o.title, o.starts_at, o.place ?? null, `{${(o.team_ids || []).join(',')}}`, o.category ?? null, o.note ?? null]);
const kinds = async (who) => (await as(who, 'select kind from public.yb_notifications order by id')).rows.map((x) => x.kind);

// ================================================================ 1. who may write
section('who may create and edit dates');
let r = await ins('offF', { competition: 'football', title: 'الجولة الأولى: النور ضد الأمل', starts_at: future(3), place: 'الملعب', team_ids: [TA.id, TB.id], category: 'المجموعة أ' });
const E1 = r.rows?.[0];
eq([E1?.status, E1?.team_ids?.length, E1?.created_by === U.offF.id], ['scheduled', 2, true], 'the football officer creates a football match');
denied(await ins('offF', { competition: 'chess', title: 'دور الشطرنج', starts_at: future(4), team_ids: [] }), 'a football officer cannot create a chess date');
denied(await ins('la', { competition: 'football', title: 'مباراة ودية', starts_at: future(4), team_ids: [TA.id] }), 'a leader cannot create dates');
denied(await ins('ma', { competition: 'football', title: 'مباراة', starts_at: future(4) }), 'a member cannot create dates');
denied(await ins('anon', { competition: 'football', title: 'مباراة', starts_at: future(4) }), 'anon cannot create dates');
fails(await ins('offF', { competition: 'football', title: 'مباراة', starts_at: future(4), team_ids: ['00000000-0000-0000-0000-000000000000'] }), 'invalid_team', 'an unknown team id is refused');
ok(!!(await ins('offF', { competition: 'football', title: 'x', starts_at: future(4) })).error, 'a one-letter title is refused');
r = await ins('admin', { competition: 'workshops', kind: 'workshop', title: 'ورشة مهارات القيادة', starts_at: future(5, 10), place: 'القاعة', team_ids: [] });
const E2 = r.rows?.[0];
eq(E2?.competition, 'workshops', 'the admin creates a workshop for every team (empty team list)');
r = await ins('offF', { competition: 'football', title: 'مباراة مع فريق غير معتمد', starts_at: future(6), team_ids: [TA.id, TC.id] });
const E3 = r.rows?.[0];
ok(!!E3, 'an officer may plan a date with a team that is not approved yet');
eq((await ins('offF', { competition: 'football', title: 'مكرر', starts_at: future(7), team_ids: [TA.id, TA.id] })).rows?.[0]?.team_ids?.length, 1, 'duplicate team ids are removed');

// ================================================================ 2. alerts
section('alerts reach the teams concerned');
eq(await kinds('la'), ['event_new', 'event_new', 'event_new', 'event_new'], 'leader A: the match, the workshop, the match with C, the duplicate test');
eq((await kinds('ma')).length, 4, 'the joined member of A gets the same alerts');
eq((await kinds('pa')).length, 4, 'the linked parent of A gets them too');
eq(await kinds('lb'), ['event_new', 'event_new'], 'leader B: the match and the workshop for every team');
eq(await kinds('lc'), ['event_new'], 'leader C (draft): only the date that names team C, not the workshop for approved teams');
eq((await kinds('mx')).length, 0, 'a member of no team hears nothing');
const n1 = (await as('la', "select data from public.yb_notifications where kind = 'event_new' order by id limit 1")).rows[0].data;
eq([n1.title, n1.place, n1.competition, n1.kind, !!n1.starts_at], ['الجولة الأولى: النور ضد الأمل', 'الملعب', 'football', 'match', true], 'the alert carries title, time, place, competition and kind');
await owner('delete from public.yb_notifications');
eq((await as('offF', 'update public.yb_events set starts_at = $1 where id = $2 returning status', [future(3, 18), E1.id])).rows?.[0]?.status, 'changed', 'moving the time marks the date «changed»');
eq(await kinds('la'), ['event_changed'], 'leader A is told about the new time');
eq(await kinds('lb'), ['event_changed'], 'leader B too');
eq((await as('offF', "update public.yb_events set note = 'أحضروا الزي' where id = $1 returning status", [E1.id])).rows?.[0]?.status, 'changed', 'a note change keeps the status');
eq((await kinds('la')).length, 1, 'a note-only change sends no new alert');
eq((await as('offF', "update public.yb_events set status = 'cancelled' where id = $1 returning status", [E1.id])).rows?.[0]?.status, 'cancelled', 'the officer cancels the date');
eq((await kinds('la')).slice(-1), ['event_cancelled'], 'the cancellation is announced');
eq((await as('offC', "update public.yb_events set title = 'تغيير' where id = $1", [E2.id])).n, 0, 'a chess officer cannot edit a workshop date');
eq((await as('offF', 'delete from public.yb_events where id = $1', [E3.id])).n, 0, 'an officer cannot delete (cancel instead)');
const past = await ins('admin', { competition: 'football', title: 'مباراة قديمة', starts_at: new Date(Date.now() - 3 * 864e5).toISOString(), team_ids: [TA.id] });
eq((await as('la', "select count(*)::int as n from public.yb_notifications where data->>'title' = 'مباراة قديمة'")).rows[0].n, 0, 'no alert for a date already past');

// ================================================================ 3. who may read
section('who may read the schedule');
const pub = (await as('anon', 'select title from public.yb_events order by starts_at')).rows.map((x) => x.title);
ok(pub.includes('الجولة الأولى: النور ضد الأمل') && pub.includes('ورشة مهارات القيادة'), 'anon sees dates between approved teams and dates for everyone');
ok(!pub.includes('مباراة مع فريق غير معتمد'), 'anon does not see a date that names a team not approved yet');
eq((await as('mx', 'select count(*)::int as n from public.yb_events')).rows[0].n, 5, 'a signed-in user sees every date');
denied(await as('anon', 'select * from public.yb_attendance'), 'anon cannot read attendance');

// ================================================================ 4. RSVP
section('leader RSVP');
const E4 = (await ins('offF', { competition: 'football', title: 'الجولة الثانية', starts_at: future(8), team_ids: [TA.id, TB.id] })).rows[0];
eq(val(await rpc('la', 'yb_rsvp', { event_id: E4.id, team_id: TA.id, answer: 'yes' })), { ok: true, rsvp: 'yes' }, 'leader A confirms attendance');
eq(val(await rpc('la', 'yb_rsvp', { event_id: E4.id, team_id: TA.id, answer: 'no' }))?.rsvp, 'no', 'and can change the answer');
fails(await rpc('lb', 'yb_rsvp', { event_id: E4.id, team_id: TA.id, answer: 'yes' }), 'permission_denied', 'leader B cannot answer for team A');
fails(await rpc('ma', 'yb_rsvp', { event_id: E4.id, team_id: TA.id, answer: 'yes' }), 'permission_denied', 'a member cannot answer for the team');
fails(await rpc('lc', 'yb_rsvp', { event_id: E2.id, team_id: TC.id, answer: 'yes' }), 'permission_denied', 'a draft team is not part of a date for every team');
eq(val(await rpc('lb', 'yb_rsvp', { event_id: E2.id, team_id: TB.id, answer: 'yes' }))?.ok, true, 'an approved team answers a date for every team');
fails(await rpc('la', 'yb_rsvp', { event_id: E1.id, team_id: TA.id, answer: 'yes' }), 'event_cancelled', 'no answer to a cancelled date');
fails(await rpc('la', 'yb_rsvp', { event_id: past.rows[0].id, team_id: TA.id, answer: 'yes' }), 'event_started', 'no answer after the start');
fails(await rpc('la', 'yb_rsvp', { event_id: E4.id, team_id: TA.id, answer: 'maybe' }), 'invalid_argument', 'only yes / no / null');
fails(await rpc('la', 'yb_rsvp', { event_id: '00000000-0000-0000-0000-000000000000', team_id: TA.id, answer: 'yes' }), 'event_not_found', 'unknown date');
denied(await as('la', "insert into public.yb_attendance (event_id, team_id, rsvp) values ($1, $2, 'yes')", [E4.id, TB.id]), 'no direct writes to attendance');

// ================================================================ 5. check-in by the officer
section('attendance marked by the officer');
eq(val(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id, presence: 'present', late_minutes: 12 }))?.ok, true, 'the officer marks team A present, 12 minutes late');
eq(val(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TB.id, presence: 'absent', late_minutes: 30 }))?.ok, true, 'and team B absent');
const att = (await owner('select team_id, rsvp, presence, late_minutes from public.yb_attendance where event_id = $1 order by presence', [E4.id])).rows;
eq(att.map((x) => [x.presence, x.late_minutes]), [['absent', null], ['present', 12]], 'minutes late are kept only for present teams');
eq(att.find((x) => x.team_id === TA.id).rsvp, 'no', 'the leader answer stays next to the check-in');
fails(await rpc('offC', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id, presence: 'present', late_minutes: 0 }), 'permission_denied', 'a chess officer cannot mark football attendance');
fails(await rpc('la', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id, presence: 'present', late_minutes: 0 }), 'permission_denied', 'a leader cannot mark attendance');
fails(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TC.id, presence: 'present', late_minutes: 0 }), 'invalid_team', 'a team not in the date is refused');
fails(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id, presence: 'late', late_minutes: 0 }), 'invalid_argument', 'only present / absent / null');
fails(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id, presence: 'present', late_minutes: 900 }), 'invalid_argument', 'minutes late are bounded');
eq(val(await rpc('admin', 'yb_mark_attendance', { event_id: E2.id, team_id: TA.id, presence: 'present', late_minutes: 0 }))?.ok, true, 'the admin marks any date');
eq((await owner("select count(*)::int as n from public.audit_log where action = 'attendance'")).rows[0].n, 3, 'every check-in is in the audit log');
eq((await as('la', 'select team_id from public.yb_attendance')).rows.every((x) => x.team_id === TA.id), true, 'leader A reads only team A rows');
eq((await as('lb', 'select count(*)::int as n from public.yb_attendance')).rows[0].n, 2, 'leader B reads only team B rows (2)');
eq((await as('offF', 'select count(*)::int as n from public.yb_attendance')).rows[0].n, 2, 'the football officer reads the football rows only');
eq((await as('offC', 'select count(*)::int as n from public.yb_attendance')).rows[0].n, 0, 'the chess officer reads none');
eq((await as('admin', 'select count(*)::int as n from public.yb_attendance')).rows[0].n, 4, 'the admin reads all');
eq((await as('ma', 'select count(*)::int as n from public.yb_attendance')).rows[0].n, 0, 'a member reads none');
eq(val(await rpc('offF', 'yb_mark_attendance', { event_id: E4.id, team_id: TA.id }))?.ok, true, 'a mark can be cleared');
eq((await owner('select presence, late_minutes from public.yb_attendance where event_id = $1 and team_id = $2', [E4.id, TA.id])).rows[0], { presence: null, late_minutes: null }, 'cleared');
eq((await as('admin', 'delete from public.yb_events where id = $1', [E4.id])).n, 1, 'the admin may delete a date');
eq((await owner('select count(*)::int as n from public.yb_attendance where event_id = $1', [E4.id])).rows[0].n, 0, 'its attendance goes with it');

// ================================================================ 6. catalog
section('catalog audit for 0004');
{
  const cat = (await owner(`select c.relname, c.relrowsecurity r, c.relforcerowsecurity f from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('yb_events', 'yb_attendance') order by 1`)).rows;
  eq(cat.map((x) => [x.relname, x.r, x.f]), [['yb_attendance', true, true], ['yb_events', true, true]], 'RLS enabled and forced on both tables');
  eq((await owner(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text, '') like '%search_path=public%'`)).rows, [], 'every SECURITY DEFINER function pins search_path');
  const tp = async (role, rel, priv) => (await owner(`select has_table_privilege('${role}', 'public.${rel}', '${priv}') as r`)).rows[0].r;
  eq([await tp('anon', 'yb_events', 'select'), await tp('anon', 'yb_events', 'insert'), await tp('anon', 'yb_events', 'update'), await tp('anon', 'yb_events', 'delete')], [true, false, false, false], 'anon may only read yb_events');
  eq([await tp('anon', 'yb_attendance', 'select'), await tp('authenticated', 'yb_attendance', 'insert'), await tp('authenticated', 'yb_attendance', 'update'), await tp('authenticated', 'yb_attendance', 'delete')], [false, false, false, false], 'attendance: no anon read, no direct writes');
  const cp = async (col) => (await owner(`select has_column_privilege('authenticated', 'public.yb_events', '${col}', 'update') as r`)).rows[0].r;
  eq([await cp('created_by'), await cp('updated_by'), await cp('id'), await cp('title')], [false, false, false, true], 'authors and ids cannot be forged');
  const fp = async (role, sig) => (await owner(`select has_function_privilege('${role}', '${sig}', 'execute') as r`)).rows[0].r;
  for (const sig of ['public.yb_team_people(uuid[])', 'public.yb_events_notify()', 'public.yb_events_biu()', 'public.yb_event_has_team(uuid,uuid)']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, false], `${sig}: internal`);
  }
  for (const sig of ['public.yb_rsvp(uuid,uuid,text)', 'public.yb_mark_attendance(uuid,uuid,text,integer)']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, true], `${sig}: authenticated only`);
  }
}

// ================================================================ 7. idempotency
section('idempotent re-run of 0004');
{
  const snap = async () => (await owner(`select (select count(*) from pg_policy)::int pol, (select count(*) from public.yb_events)::int ev,
    (select count(*) from public.yb_attendance)::int att`)).rows[0];
  const b = await snap();
  let err = null; try { await E.db.exec(M4); } catch (e) { err = e.message; }
  eq(err, null, '0004 runs a second time without errors');
  eq(await snap(), b, 'and changes nothing');
}

finish(t0, 70);
