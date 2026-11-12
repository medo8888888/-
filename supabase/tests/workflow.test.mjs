// Yanabee backend — security tests for migrations 0002 (officer role) and 0003
// (registration workflow, officers, notifications, app tag, join-attempt limit).
// Applies 0001 -> 0002 -> 0003 in PGlite behind the Supabase emulation in harness.mjs.
// Run:  node supabase/tests/workflow.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();

const M1 = readMigration('0001_yanabee.sql');
const M2 = readMigration('0002_yb_officer_role.sql');
const M3 = readMigration('0003_yb_workflow.sql');
await E.db.exec(M1);
await E.db.exec(M2);
await E.db.exec(M3);
console.log(`migrations 0001-0003 applied in ${Date.now() - t0} ms`);

ok(/^[\x00-\x7F]*$/.test(M2) && /^[\x00-\x7F]*$/.test(M3), '0002 and 0003 are ASCII only');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
const mkTeam = (who, name, area = 'حي') => as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, area]);
const addMember = (who, team, name, extra = {}) => as(who,
  'insert into public.team_members (team_id, full_name, age, guardian_name, guardian_phone) values ($1, $2, $3, $4, $5) returning *',
  [team.id, name, extra.age ?? 11, extra.gname ?? 'ولي', extra.gphone ?? '0500000000']);
const notes = async (who) => (await as(who, 'select kind, data, read_at from public.yb_notifications order by id')).rows || [];

// ================================================================ 1. app tag and ensure_profile
section('sign-up app tag (shared auth project)');
await signUp('hourbank', { full_name: 'مستخدم بنك الساعة' });
eq((await owner('select count(*)::int as n from public.profiles where id = $1', [U.hourbank.id])).rows[0].n, 0, 'an untagged sign-up (other app) gets no Yanabee profile');
await signUp('admin1', Y('admin', 'المشرف العام'));
await signUp('lead1', Y('leader', 'قائد أول'));
await signUp('lead2', Y('leader', 'قائد ثان'));
await signUp('mem1', Y('member', 'سالم أحمد'));
await signUp('mem2', Y('member', 'عضو ثان'));
await signUp('par1', Y('parent', 'ولي أمر'));
await signUp('off1', Y('member', 'مسؤول التسجيل'));
await signUp('off2', Y('member', 'مسؤول الكرة'));
eq((await owner('select role::text as r from public.profiles where id = $1', [U.admin1.id])).rows[0].r, 'member', 'a tagged sign-up asking for admin still becomes member');
eq((await owner('select role::text as r from public.profiles where id = $1', [U.lead1.id])).rows[0].r, 'leader', 'a tagged leader sign-up becomes leader');
let r = await rpc('hourbank', 'yb_ensure_profile', { full_name: 'زائر', role: 'admin' });
eq([val(r)?.created, val(r)?.role], [true, 'member'], 'yb_ensure_profile creates a member profile and never admin');
r = await rpc('hourbank', 'yb_ensure_profile', { full_name: 'x', role: 'leader' });
eq([val(r)?.created, val(r)?.role], [false, 'member'], 'a second call changes nothing');
r = await rpc('hourbank', 'yb_ensure_profile', {});
eq(val(r)?.created, false, 'ensure_profile works without arguments');
await signUp('officerwannabe', {});
eq(val(await rpc('officerwannabe', 'yb_ensure_profile', { role: 'officer' }))?.role, 'member', 'ensure_profile cannot pick officer either');
fails(await rpc('anon', 'yb_ensure_profile', {}), 'permission denied for function yb_ensure_profile', 'anon cannot call ensure_profile');
await owner("select public.set_admin('admin1@example.test')");

// ================================================================ 2. officers
section('competition officers');
fails(await rpc('lead1', 'yb_set_officer', { target: U.off1.id, competition: 'registration', assign: true }), 'permission_denied', 'a leader cannot assign officers');
fails(await rpc('admin1', 'yb_set_officer', { target: U.off1.id, competition: 'registration', assign: true }), 'wrong_role', 'only an officer account can be assigned');
eq(val(await rpc('admin1', 'set_user_role', { target: U.off1.id, new_role: 'officer' }))?.ok, true, 'admin makes off1 an officer');
eq(val(await rpc('admin1', 'set_user_role', { target: U.off2.id, new_role: 'officer' }))?.ok, true, 'admin makes off2 an officer');
fails(await rpc('admin1', 'yb_set_officer', { target: U.off1.id, competition: 'cooking', assign: true }), 'invalid_argument', 'unknown competition refused');
eq(val(await rpc('admin1', 'yb_set_officer', { target: U.off1.id, competition: 'registration', assign: true }))?.ok, true, 'off1 assigned to registration');
eq(val(await rpc('admin1', 'yb_set_officer', { target: U.off1.id, competition: 'registration', assign: true }))?.ok, true, 'assigning twice is harmless');
eq(val(await rpc('admin1', 'yb_set_officer', { target: U.off2.id, competition: 'football', assign: true }))?.ok, true, 'off2 assigned to football');
eq((await as('off1', 'select * from public.yb_my_competitions() c')).rows.map((x) => x.c), ['registration'], 'off1 sees its own competition');
eq((await as('off1', 'select competition from public.yb_officers')).rows.map((x) => x.competition), ['registration'], 'an officer reads only its own assignments');
eq((await as('admin1', 'select count(*)::int as n from public.yb_officers')).rows[0].n, 2, 'admin reads all assignments');
eq((await as('lead1', 'select count(*)::int as n from public.yb_officers')).rows[0].n, 0, 'a leader reads no assignments');
denied(await as('off1', "insert into public.yb_officers (user_id, competition) values ($1, 'chess')", [U.off1.id]), 'an officer cannot self-assign by insert');
denied(await as('anon', 'select * from public.yb_officers'), 'anon cannot read officers');
eq((await owner("select count(*)::int as n from public.audit_log where action = 'officer_assign'")).rows[0].n, 3, 'assignments are written to the audit log');
fails(await rpc('off2', 'yb_review_list', {}), 'permission_denied', 'a football officer cannot open the registration queue');
fails(await rpc('lead1', 'yb_review_list', {}), 'permission_denied', 'a leader cannot open the review queue');

// ================================================================ 3. registration workflow
section('registration workflow: draft -> submitted -> returned -> submitted -> approved');
r = await mkTeam('lead1', 'فريق النور');
const TA = r.rows[0];
eq(TA.status, 'draft', 'a new team starts as draft');
for (const n of ['سالم أحمد', 'يوسف علي', 'عمر خالد', 'زيد سعيد']) await addMember('lead1', TA, n);
eq((await owner('select count(*)::int as n from public.team_members where team_id = $1', [TA.id])).rows[0].n, 5, 'team has 5 members with the leader');
eq(val(await rpc('mem1', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'a member joins while draft');
eq(val(await rpc('par1', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' }))?.ok, true, 'a parent links a child while draft');
eq((await notes('lead1')).length, 0, 'no notification yet');
denied(await as('lead1', "update public.teams set status = 'approved' where id = $1", [TA.id]), 'a leader cannot approve by update');
denied(await as('lead1', "update public.teams set status = 'returned' where id = $1", [TA.id]), 'a leader cannot set returned by update');
eq((await as('lead1', "update public.teams set status = 'submitted' where id = $1", [TA.id])).n, 1, 'leader submits');
eq((await notes('lead1')).length, 0, 'the leader is not notified of their own change');
let n1 = await notes('admin1'), n2 = await notes('off1');
eq([n1.map((x) => x.kind), n2.map((x) => x.kind)], [['team_submitted'], ['team_submitted']], 'admin and the registration officer are notified of the submission');
eq(n2[0].data.team_name, 'فريق النور', 'the notification carries the team name');
eq((await notes('off2')).length, 0, 'a football officer is not notified');
eq((await as('off1', 'select count(*)::int as n from public.teams')).rows[0].n, 0, 'an officer cannot read the teams table');
eq((await as('off1', 'select count(*)::int as n from public.team_members')).rows[0].n, 0, 'an officer cannot read team_members');
let q = (await as('off1', 'select * from public.yb_review_list()')).rows;
eq([q.length, q[0]?.status, q[0]?.members, q[0]?.consents], [1, 'submitted', 5, 0], 'the officer sees the queue with counts');
q = (await as('off1', 'select * from public.yb_review_roster($1)', [TA.id])).rows;
eq(Object.keys(q[0] || {}).sort(), ['consent_status', 'full_name', 'is_leader', 'joined', 'member_id'], 'the review roster has no age and no guardian data');
eq(q.filter((x) => x.joined).length, 2, 'the review roster shows who has joined (leader + member)');
fails(await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'return', note: '  ' }), 'note_required', 'returning needs a note');
fails(await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'maybe', note: null }), 'invalid_argument', 'unknown decision refused');
fails(await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: 'x'.repeat(501) }), 'invalid_argument', 'note longer than 500 refused');
fails(await rpc('off2', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: null }), 'permission_denied', 'a football officer cannot review teams');
fails(await rpc('lead1', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: null }), 'permission_denied', 'a leader cannot review');
fails(await rpc('off1', 'yb_review_team', { team_id: '00000000-0000-0000-0000-000000000000', decision: 'approve', note: null }), 'team_not_found', 'unknown team');
r = await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'return', note: 'أكملوا الموافقات' });
eq(val(r)?.status, 'returned', 'the officer returns the team with a note');
let ln = await notes('lead1');
eq([ln.length, ln[0]?.kind, ln[0]?.data?.to, ln[0]?.data?.note], [1, 'team_status', 'returned', 'أكملوا الموافقات'], 'the leader is notified: returned, with the note');
eq((await as('lead1', 'select status, admin_note from public.my_team()')).rows[0], { status: 'returned', admin_note: 'أكملوا الموافقات' }, 'leader reads the status and note');
fails(await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: null }), 'invalid_status', 'an officer can only act on submitted teams');
eq((await as('lead1', "update public.teams set area = 'حي النور' where id = $1", [TA.id])).n, 1, 'returned: the leader can edit the team');
eq((await addMember('lead1', TA, 'ماجد حسن')).rows?.length, 1, 'returned: the leader can add a member');
eq(val(await rpc('lead1', 'mark_consent', { member_id: (await owner("select id from public.team_members where full_name = 'يوسف علي'")).rows[0].id, received: true }))?.ok, true, 'returned: the leader can mark consent');
eq((await as('lead1', "update public.teams set status = 'submitted' where id = $1", [TA.id])).n, 1, 'the leader resubmits');
eq((await notes('off1')).length, 2, 'the officer is notified again');
r = await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: null });
eq(val(r)?.status, 'approved', 'the officer approves');
eq((await owner('select reviewed_at is not null as r from public.teams where id = $1', [TA.id])).rows[0].r, true, 'reviewed_at is set');
eq((await notes('lead1')).map((x) => x.data.to), ['returned', 'approved'], 'the leader got both decisions');
eq((await notes('mem1')).map((x) => x.kind), ['team_approved'], 'the joined member is told the team was approved');
eq((await notes('par1')).map((x) => x.kind), ['team_approved'], 'the linked parent is told too');
eq((await notes('mem2')).length, 0, 'an unrelated member hears nothing');
eq((await as('lead1', "update public.teams set name = 'تغيير' where id = $1", [TA.id])).n, 0, 'approved: the leader is locked');
eq((await as('lead1', "update public.teams set status = 'draft' where id = $1", [TA.id])).n, 0, 'approved: the leader cannot reopen');
fails(await rpc('off1', 'yb_review_team', { team_id: TA.id, decision: 'reject', note: null }), 'invalid_status', 'an officer cannot undo an approval');
eq(val(await rpc('admin1', 'yb_review_team', { team_id: TA.id, decision: 'return', note: 'تصحيح' }))?.status, 'returned', 'the admin can return even an approved team');
eq(val(await rpc('admin1', 'yb_review_team', { team_id: TA.id, decision: 'approve', note: null }))?.status, 'approved', 'and approve it again');
eq(val(await rpc('admin1', 'approve_team', { team_id: TA.id, ok: true, note: null }))?.status, 'approved', 'the old approve_team still works for the admin');
eq((await owner("select count(*)::int as n from public.audit_log where action = 'team_status'")).rows[0].n >= 6, true, 'every status change is in the audit log');

// rejected stays locked for the leader
r = await mkTeam('lead2', 'فريق الأمل');
const TB = r.rows[0];
for (const n of ['أ ب', 'ت ث', 'ج ح', 'خ د']) await addMember('lead2', TB, n);
await as('lead2', "update public.teams set status = 'submitted' where id = $1", [TB.id]);
eq(val(await rpc('off1', 'yb_review_team', { team_id: TB.id, decision: 'reject', note: 'خارج النطاق' }))?.status, 'rejected', 'the officer rejects');
eq((await as('lead2', "update public.teams set area = 'x' where id = $1", [TB.id])).n, 0, 'rejected: the leader cannot edit');
denied(await addMember('lead2', TB, 'جديد'), 'rejected: the leader cannot add members');

// demotion removes the power
eq(val(await rpc('admin1', 'set_user_role', { target: U.off1.id, new_role: 'member' }))?.ok, true, 'admin demotes off1');
eq((await owner('select count(*)::int as n from public.yb_officers where user_id = $1', [U.off1.id])).rows[0].n, 0, 'demotion removes the assignments');
fails(await rpc('off1', 'yb_review_list', {}), 'permission_denied', 'a demoted officer loses the queue');

// ================================================================ 4. notifications privacy
section('notifications: own rows only, written by the server only');
eq((await as('lead2', 'select count(*)::int as n from public.yb_notifications')).rows[0].n, 1, 'lead2 sees only its own notification');
denied(await as('lead1', "insert into public.yb_notifications (user_id, kind) values ($1, 'x')", [U.lead1.id]), 'a client cannot insert notifications');
denied(await as('lead1', 'update public.yb_notifications set read_at = now()'), 'a client cannot update notifications directly');
denied(await as('lead1', 'delete from public.yb_notifications'), 'a client cannot delete notifications');
denied(await as('anon', 'select * from public.yb_notifications'), 'anon cannot read notifications');
fails(await rpc('lead1', 'yb_notify', { uids: `{${U.mem2.id}}`, kind: 'spam', data: '{}' }), 'permission denied for function yb_notify', 'a client cannot call yb_notify');
const before = (await owner('select count(*)::int as n from public.yb_notifications where read_at is null and user_id <> $1', [U.lead1.id])).rows[0].n;
const firstId = (await as('lead1', 'select id from public.yb_notifications order by id limit 1')).rows[0].id;
eq(val(await rpc('lead1', 'yb_mark_read', { ids: `{${firstId}}` })), 1, 'mark one read');
const unread = (await notes('lead1')).filter((x) => !x.read_at).length;
ok(unread > 0, 'lead1 still has unread notifications');
eq(val(await rpc('lead1', 'yb_mark_read', {})), unread, 'mark all read returns how many were marked');
eq((await notes('lead1')).every((x) => x.read_at), true, 'all of lead1 notifications are read');
eq((await owner('select count(*)::int as n from public.yb_notifications where read_at is null and user_id <> $1', [U.lead1.id])).rows[0].n, before, 'nobody else was touched');
eq(val(await rpc('mem2', 'yb_mark_read', { ids: `{${firstId}}` })), 0, 'cannot mark someone else\'s notification');

// ================================================================ 5. join attempt limit
section('join / link attempt limit');
const C1 = await signUp('guesser', Y('member', 'محاول'));
let last = null;
for (let i = 0; i < 10; i++) last = val(await rpc('guesser', 'join_team', { code: 'ZZZZZ' + (i % 9 + 1), member_name: 'أي اسم' }));
eq(last, { ok: false, error: 'team_not_found' }, 'a wrong code returns {ok:false, error} (no exception)');
eq(val(await rpc('guesser', 'join_team', { code: TB.join_code, member_name: 'أ ب' })), { ok: false, error: 'too_many_attempts' }, 'after 10 failures even a right code is blocked');
eq((await owner('select count(*)::int as n from public.yb_join_attempts where user_id = $1', [C1.id])).rows[0].n, 10, 'failed attempts were recorded');
denied(await as('guesser', 'select * from public.yb_join_attempts'), 'clients cannot read the attempts table');
await owner("update public.yb_join_attempts set at = now() - interval '16 minutes' where user_id = $1", [C1.id]);
eq(val(await rpc('guesser', 'join_team', { code: TB.join_code, member_name: 'أ ب' }))?.ok, true, 'after 15 minutes the member can join');
eq(val(await rpc('mem2', 'join_team', { code: TA.join_code, member_name: 'غير موجود' })), { ok: false, error: 'name_not_in_roster' }, 'wrong name returns name_not_in_roster');
eq(val(await rpc('mem2', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' })), { ok: false, error: 'already_linked' }, 'a claimed name returns already_linked');
fails(await rpc('lead1', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }), 'wrong_role', 'wrong role still raises');
await signUp('par2', Y('parent', 'ولي آخر'));
for (let i = 0; i < 10; i++) await rpc('par2', 'link_child', { code: 'QQQQQ' + (i % 9 + 1), child_name: 'x' });
eq(val(await rpc('par2', 'link_child', { code: TA.join_code, child_name: 'عمر خالد' })), { ok: false, error: 'too_many_attempts' }, 'link_child is limited the same way');
eq(val(await rpc('par1', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' })), { ok: false, error: 'already_linked' }, 'linking the same child twice returns already_linked');

// ================================================================ 6. roster status
section('leader roster status');
q = (await as('lead1', 'select * from public.yb_my_team_roster_status()')).rows;
eq(q.length, 6, 'the leader gets one row per member');
eq([q.filter((x) => x.joined).length, q.reduce((s, x) => s + x.parents, 0)], [2, 1], 'joined count and linked guardians are right');
eq((await as('mem1', 'select count(*)::int as n from public.yb_my_team_roster_status()')).rows[0].n, 0, 'a member gets nothing');
eq((await as('off2', 'select count(*)::int as n from public.yb_my_team_roster_status()')).rows[0].n, 0, 'an officer gets nothing');

// ================================================================ 7. catalog
section('catalog audit for 0003');
{
  const cat = (await owner(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'yb_%' order by 1`)).rows;
  eq(cat.map((x) => x.relname), ['yb_join_attempts', 'yb_notifications', 'yb_officers'], 'the three new tables exist');
  ok(cat.every((x) => x.relrowsecurity && x.relforcerowsecurity), 'RLS enabled and forced on the new tables');
  eq((await owner(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text, '') like '%search_path=public%'`)).rows, [], 'every SECURITY DEFINER function pins search_path');
  const tp = async (role, rel, priv) => (await owner(`select has_table_privilege('${role}', 'public.${rel}', '${priv}') as r`)).rows[0].r;
  for (const rel of ['yb_officers', 'yb_notifications', 'yb_join_attempts']) {
    const any = [];
    for (const priv of ['select', 'insert', 'update', 'delete', 'truncate']) if (await tp('anon', rel, priv)) any.push(priv);
    eq(any, [], `anon has no privilege on ${rel}`);
    const w = [];
    for (const priv of ['insert', 'update', 'delete', 'truncate']) if (await tp('authenticated', rel, priv)) w.push(priv);
    eq(w, [], `authenticated cannot write ${rel}`);
  }
  eq(await tp('authenticated', 'yb_join_attempts', 'select'), false, 'authenticated cannot select yb_join_attempts');
  const fp = async (role, sig) => (await owner(`select has_function_privilege('${role}', '${sig}', 'execute') as r`)).rows[0].r;
  for (const sig of ['public.yb_notify(uuid[],text,jsonb)', 'public.yb_join_fail(uuid,text)', 'public.yb_join_blocked(uuid)', 'public.yb_teams_status_notify()', 'public.yb_teams_status_guard()', 'public.yb_profiles_role_cleanup()', 'public.yb_handle_new_user()']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, false], `${sig}: internal, not exposed`);
  }
  for (const sig of ['public.yb_review_team(uuid,text,text)', 'public.yb_set_officer(uuid,text,boolean)', 'public.yb_mark_read(bigint[])', 'public.yb_ensure_profile(text,text)', 'public.join_team(text,text)']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, true], `${sig}: authenticated only`);
  }
  eq([await fp('authenticated', 'public.set_admin(text)'), await fp('anon', 'public.set_admin(text)')], [false, false], 'set_admin is still closed');
}

// ================================================================ 8. idempotency
section('idempotent re-run of 0002 and 0003');
{
  const snap = async () => (await owner(`select (select count(*) from pg_policy)::int as pol,
    (select count(*) from public.yb_notifications)::int as notif, (select count(*) from public.yb_officers)::int as off,
    (select count(*) from public.teams)::int as teams`)).rows[0];
  const b = await snap();
  let err = null;
  try { await E.db.exec(M2); await E.db.exec(M3); } catch (e) { err = e.message; }
  eq(err, null, '0002 and 0003 run a second time without errors');
  eq(await snap(), b, 'the second run changes no policies and loses no data');
  denied(await as('anon', 'select * from public.yb_notifications'), 'privileges still closed after the re-run');
}

finish(t0, 100);
