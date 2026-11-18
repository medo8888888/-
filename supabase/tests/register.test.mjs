// Yanabee backend — security tests for migration 0005 (online registration without an account, fee checklist).
// Applies 0001 -> 0005 in PGlite behind the Supabase emulation in harness.mjs.
// Run:  node supabase/tests/register.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
const M5 = readMigration('0005_yb_register_fee.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M5);
console.log(`migrations 0001-0005 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M5), '0005 is ASCII only');
await E.db.exec(M5);
ok(true, '0005 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
for (const [k, r, n] of [['admin', 'member', 'المشرف'], ['offR', 'member', 'مسؤول التسجيل'], ['offF', 'member', 'مسؤول الكرة'],
  ['la', 'leader', 'قائد أ'], ['lb', 'leader', 'قائد ب'], ['lc', 'leader', 'قائد ج'], ['mx', 'member', 'عضو'], ['px', 'parent', 'ولي']]) {
  await signUp(k, Y(r, n));
}
await owner("select public.set_admin('admin@example.test')");
for (const [k, c] of [['offR', 'registration'], ['offF', 'football']]) {
  await rpc('admin', 'set_user_role', { target: U[k].id, new_role: 'officer' });
  await rpc('admin', 'yb_set_officer', { target: U[k].id, competition: c, assign: true });
}

// register as `who` from a client address (the gateway's cf-connecting-ip header)
const reg = (who, p, addr = '10.0.0.1') => as(who,
  "select public.yb_register_team(p => $1::jsonb) as r from (select set_config('request.headers', $2, true)) h",
  [JSON.stringify(p), JSON.stringify({ 'cf-connecting-ip': addr })]);
const track = (ref, phone, addr = '10.0.1.1', who = 'anon') => as(who,
  "select public.yb_track_request(ref => $1, phone => $2) as r from (select set_config('request.headers', $3, true)) h",
  [ref, phone, JSON.stringify({ 'cf-connecting-ip': addr })]);
const MEMBERS = [
  { name: 'خالد سعيد', age: 16, contact: '05301110000' },
  { name: 'سالم أحمد', age: 12, contact: '05302220000' },
  { name: 'يوسف علي', age: 13, contact: '05303330000' },
  { name: 'عمر حسن', age: 14, contact: '05304440000' },
  { name: 'زيد محمود', age: 19, contact: '05305550000' },
];
const form = (o = {}) => ({
  team: 'فريق الفجر', leader: 'خالد سعيد', phone: '0530 517 5431', email: 'lead@example.test', area: 'حي السلام',
  members: MEMBERS, reciter1: 'سالم أحمد', reciter2: 'يوسف علي', chess: 'عمر حسن', coordinator: 'زيد محمود',
  idea: 'حملة نظافة', pledges: true, ...o,
});
const err = (res) => val(res)?.error;
const count = async (sql, p = []) => (await owner(sql, p)).rows[0].n;
const CHILD_NAMES = ['سالم أحمد', 'يوسف علي', 'عمر حسن', 'زيد محمود'];

// ================================================================ 1. anon registers
section('anon sends the form and gets a request number');
let r = await reg('anon', form());
const R1 = val(r);
eq([R1?.ok, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(R1?.ref || '')], [true, true], 'anon registration answers ok with an 8-symbol request number');
let T1 = (await owner('select * from public.teams where id = $1', [R1?.team_id])).rows[0];
eq([T1?.status, T1?.leader_id, T1?.ref_code === R1?.ref, T1?.fee_status], ['submitted', null, true, 'unpaid'], 'the team waits as submitted, with no leader account and the fee unpaid');
let M = (await owner('select full_name, age, guardian_phone, is_leader, user_id from public.team_members where team_id = $1 order by is_leader desc, created_at', [R1?.team_id])).rows;
eq([M.length, M[0]?.full_name, M[0]?.is_leader, M[0]?.age, M.filter((x) => x.user_id).length], [5, 'خالد سعيد', true, 16, 0], 'five roster rows, the leader first, nobody linked');
eq((await owner('select phone, phone_key, reciter1, chess from public.yb_registrations where team_id = $1', [R1?.team_id])).rows[0],
  { phone: '0530 517 5431', phone_key: '305175431', reciter1: 'سالم أحمد', chess: 'عمر حسن' }, 'the private details are stored with the phone key');
eq((await owner('select kind from public.yb_notifications where user_id = $1', [U.admin.id])).rows.map((x) => x.kind), ['team_submitted'], 'the admin hears about the new team');
eq((await owner('select kind from public.yb_notifications where user_id = $1', [U.offR.id])).rows.map((x) => x.kind), ['team_submitted'], 'the registration officer too');
eq(await count('select count(*)::int as n from public.yb_notifications where user_id = $1', [U.offF.id]), 0, 'not the football officer');
denied(await as('anon', 'select * from public.teams'), 'anon still cannot read teams');
denied(await as('anon', 'select * from public.yb_registrations'), 'anon cannot read the registration details');
denied(await as('la', 'select * from public.yb_registrations'), 'a signed-in user cannot read the registration details table');
denied(await as('anon', 'select * from public.yb_rate'), 'anon cannot read the rate-limit table');
denied(await as('admin', 'select * from public.yb_rate'), 'nobody reads the rate-limit table through the API');
denied(await as('anon', "select public.yb_checklist_of('00000000-0000-0000-0000-000000000000')"), 'the internal checklist helper is closed');
denied(await as('anon', 'select public.yb_new_ref_code()'), 'the code generator is closed');
denied(await as('la', "select public.yb_ref_team('X', 'Y', 'Z')"), 'the lookup helper is closed');

section('the same form twice, and names already taken');
r = await reg('anon', form({ phone: '+90 530 517 54 31' }));
eq([val(r)?.ok, val(r)?.duplicate, val(r)?.ref === R1?.ref], [true, true, true], 'sending again (another phone format) returns the same request number');
eq(await count('select count(*)::int as n from public.teams'), 1, 'no second team was created');
eq(err(await reg('anon', form({ phone: '0599 000 1122' }))), 'team_name_taken', 'the same team name from another phone is refused');
eq(err(await reg('anon', form({ team: '  فريق   الفجر ', phone: '0599 000 1122' }))), 'team_name_taken', 'spacing does not get around it');

section('the form is checked on the server');
const other = (o) => form({ team: 'فريق التجربة', phone: '0591 234 5678', ...o });
const bad = [
  [other({ team: 'ف' }), 'bad_team_name', 'one-letter team name'],
  [other({ leader: '' }), 'bad_leader', 'no leader name'],
  [other({ phone: '123' }), 'bad_phone', 'short phone'],
  [other({ email: 'not-an-email' }), 'bad_email', 'bad email'],
  [other({ pledges: false }), 'pledges_required', 'pledges not accepted'],
  [other({ members: MEMBERS.slice(0, 4) }), 'members_count_invalid', '4 members'],
  [other({ members: [...MEMBERS, { name: 'أنس بكر', age: 12, contact: '05300000001' }, { name: 'جابر دار', age: 12, contact: '05300000002' }, { name: 'هاني وليد', age: 12, contact: '05300000003' }] }), 'members_count_invalid', '8 members'],
  [other({ members: MEMBERS.map((m, i) => (i === 2 ? { ...m, age: 'x' } : m)) }), 'bad_age', 'an age that is not a number'],
  [other({ members: MEMBERS.map((m, i) => (i === 2 ? { ...m, age: 2 } : m)) }), 'bad_age', 'an age of 2'],
  [other({ members: MEMBERS.map((m, i) => (i === 3 ? { ...m, contact: '12' } : m)) }), 'bad_contact', 'a short contact number'],
  [other({ members: MEMBERS.map((m, i) => (i === 4 ? { ...m, name: 'سالم  أحمد' } : m)) }), 'duplicate_member', 'a name written twice'],
  [other({ chess: 'شخص آخر' }), 'bad_nominee', 'a chess player who is not in the team'],
  [other({ coordinator: 'شخص آخر' }), 'bad_nominee', 'a coordinator who is not in the team'],
  [other({ reciter2: 'سالم أحمد' }), 'same_reciters', 'the same reciter twice'],
  [{ members: 'x' }, 'bad_team_name', 'junk input'],
];
let addrN = 20;
for (const [p, key, label] of bad) eq(err(await reg('anon', p, `10.0.2.${addrN++}`)), key, `refused: ${label}`);
eq(await count('select count(*)::int as n from public.teams'), 1, 'none of the refused forms created a team');
eq(err(await as('anon', 'select public.yb_register_team(p => null) as r')), 'invalid_argument', 'a null form is refused');

section('rate limits');
for (let i = 0; i < 5; i++) await reg('anon', other({ team: 'ف' }), '10.9.9.9');
eq(err(await reg('anon', form({ team: 'فريق جديد', phone: '0598 111 2233' }), '10.9.9.9')), 'rate_limited', 'a sixth try from one address within the hour is refused');
eq(val(await reg('anon', form({ team: 'فريق الأمل', phone: '0598 111 2233' }), '10.9.9.10'))?.ok, true, 'another address still registers');
const R2 = (await owner("select id, ref_code from public.teams where name = 'فريق الأمل'")).rows[0];
await owner("insert into public.yb_rate (key, at) select 'reg:*', now() from generate_series(1, 60)");
eq(err(await reg('anon', form({ team: 'فريق ثالث', phone: '0597 000 0000' }), '10.9.9.11')), 'rate_limited', 'a global cap of 60 registrations an hour holds against address hopping');
await owner("delete from public.yb_rate where key = 'reg:*'");

// ================================================================ 2. tracking
section('request number + phone show the checklist');
r = await track(R1.ref, '05305175431');
let C = val(r)?.team;
eq([val(r)?.ok, C?.status, C?.fee, C?.members, C?.minors, C?.consents, C?.claimed, C?.group, C?.next], [true, 'submitted', 'unpaid', 5, 4, 0, false, null, null], 'the checklist: submitted, fee unpaid, 4 minors, no consents yet, not claimed');
ok(!CHILD_NAMES.some((n) => JSON.stringify(val(r)).includes(n)), 'the checklist has no child name');
ok(!JSON.stringify(val(r)).includes('0530'), 'the checklist has no phone number');
eq(val(await track(`yn-${R1.ref.slice(0, 4)}-${R1.ref.slice(4).toLowerCase()}`, '+90 (530) 517-54-31'))?.ok, true, 'the request number in any case and with dashes, the phone in another format');
eq(val(await track(R1.ref, '٠٥٣٠٥١٧٥٤٣١'))?.ok, true, 'Arabic-Indic digits work too');
eq(err(await track(R1.ref, '0530 000 0000', '10.0.1.2')), 'not_found', 'a wrong phone finds nothing');
eq(err(await track('ZZZZZZZZ', '05305175431', '10.0.1.2')), 'not_found', 'a wrong request number finds nothing');
eq(err(await track(R1.ref, '', '10.0.1.2')), 'not_found', 'an empty phone finds nothing');
for (let i = 0; i < 5; i++) await track(R2.ref_code, '0500 000 00' + (10 + i), `10.0.3.${i}`);
eq(err(await track(R2.ref_code, '0598 111 2233', '10.0.3.30')), 'rate_limited', 'five wrong phones for one request number lock it for 15 minutes, from any address');
for (let i = 0; i < 10; i++) await track('AAAAAAA' + 'BCDEFGHJKM'[i], '0500', '10.7.7.7');
eq(err(await track(R1.ref, '05305175431', '10.7.7.7')), 'rate_limited', 'ten misses from one address lock that address');
eq(val(await track(R1.ref, '05305175431', '10.7.7.8'))?.ok, true, 'other addresses are not affected');
eq(val(await track(R1.ref, '05305175431', '10.0.1.9', 'la'))?.ok, true, 'a signed-in user may track too');

section('the draw group and the next date show up');
await owner('insert into public.tournament_state (id, state) values (1, $1::jsonb)', [JSON.stringify({ teams: [{ id: R1.team_id, name: 'فريق الفجر' }], groups: [['x1', 'x2', 'x3', 'x4'], ['y1', R1.team_id, 'y3', 'y4'], ['z1', 'z2', 'z3', 'z4']] })]);
await owner(`insert into public.yb_events (competition, kind, title, starts_at, team_ids) values
  ('football', 'match', 'مباراة الجولة الأولى', now() + interval '3 days', $1::uuid[]),
  ('football', 'match', 'مباراة ملغاة', now() + interval '1 day', $1::uuid[]),
  ('workshops', 'workshop', 'ورشة لكل الفرق المعتمدة', now() + interval '2 days', '{}')`, [`{${R1.team_id}}`]);
await owner("update public.yb_events set status = 'cancelled' where title = 'مباراة ملغاة'");
C = val(await track(R1.ref, '05305175431', '10.0.1.40'))?.team;
eq([C?.group, C?.next?.title], [1, 'مباراة الجولة الأولى'], 'group ب (index 1) from the published draw; the next date skips the cancelled one and the approved-only workshop');

// ================================================================ 3. a signed-in leader registers
section('a signed-in leader registering online becomes the leader at once');
r = await reg('lb', form({ team: 'فريق البناء', leader: 'باسل قائد', phone: '0533 333 4444', members: MEMBERS.map((m, i) => (i === 0 ? { ...m, name: 'باسل قائد' } : m)) }), '10.0.4.1');
const R3 = val(r);
eq(R3?.ok, true, 'leader B registers online');
const T3 = (await owner('select leader_id, status from public.teams where id = $1', [R3?.team_id])).rows[0];
eq([T3?.leader_id === U.lb.id, T3?.status], [true, 'submitted'], 'the team belongs to leader B and is submitted');
M = (await owner('select full_name, is_leader, user_id from public.team_members where team_id = $1 order by is_leader desc', [R3?.team_id])).rows;
eq([M.length, M[0]?.full_name, M[0]?.user_id === U.lb.id, M.filter((x) => x.is_leader).length], [5, 'باسل قائد', true, 1], 'one leader row (the account, with the name typed in the form) and five members in all');
eq(err(await reg('lb', form({ team: 'فريق آخر', phone: '0533 333 4444' }), '10.0.4.2')), 'already_leading', 'the same leader cannot register a second team');
eq((await as('lb', 'select name from public.teams')).rows?.map((x) => x.name), ['فريق البناء'], 'leader B reads the team through the normal policies');

// ================================================================ 4. claiming a team registered online
section('a leader account claims a team registered online');
eq(err(await rpc('mx', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' })), 'not_leader', 'a member account cannot claim');
denied(await rpc('anon', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' }), 'anon cannot claim');
eq(err(await rpc('la', 'yb_claim_team', { ref: R1.ref, phone: '0599 999 9999' })), 'not_found', 'a wrong phone cannot claim');
eq(err(await rpc('lb', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' })), 'already_leading', 'a leader who already leads a team cannot claim another');
r = await rpc('la', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' });
eq([val(r)?.ok, val(r)?.team_name], [true, 'فريق الفجر'], 'leader A claims «فريق الفجر»');
T1 = (await owner('select leader_id from public.teams where id = $1', [R1.team_id])).rows[0];
eq(T1?.leader_id === U.la.id, true, 'the team now belongs to leader A');
eq((await owner('select user_id from public.team_members where team_id = $1 and is_leader', [R1.team_id])).rows[0]?.user_id === U.la.id, true, 'the leader row is linked to the account');
eq(val(await rpc('la', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' }))?.already, true, 'claiming again is harmless');
eq(err(await rpc('lc', 'yb_claim_team', { ref: R1.ref, phone: '05305175431' })), 'already_claimed', 'another leader cannot take it over');
eq(await count("select count(*)::int as n from public.audit_log where action = 'team_claim'"), 1, 'the claim is in the audit log');
eq((await as('la', 'select full_name from public.my_roster')).rows?.length, 5, 'leader A sees the roster');
eq(val(await track(R1.ref, '05305175431', '10.0.1.41'))?.team?.claimed, true, 'the tracker shows the team was claimed');

section('who reads the registration details and the checklist');
eq(val(await rpc('la', 'yb_registration_detail', { team_id: R1.team_id }))?.reciter2, 'يوسف علي', 'the leader reads the own registration details');
eq(val(await rpc('offR', 'yb_registration_detail', { team_id: R1.team_id }))?.phone, '0530 517 5431', 'the registration officer reads them');
denied(await rpc('lb', 'yb_registration_detail', { team_id: R1.team_id }), 'another leader cannot');
denied(await rpc('offF', 'yb_registration_detail', { team_id: R1.team_id }), 'the football officer cannot');
denied(await rpc('anon', 'yb_registration_detail', { team_id: R1.team_id }), 'anon cannot');
eq(val(await rpc('lb', 'yb_registration_detail', { team_id: R3.team_id }))?.chess, 'عمر حسن', 'leader B reads B');
eq(val(await rpc('la', 'yb_team_checklist', { team_id: R1.team_id }))?.status, 'submitted', 'the leader reads the checklist');
eq(val(await rpc('admin', 'yb_team_checklist', { team_id: R1.team_id }))?.members, 5, 'the admin reads it');
denied(await rpc('lb', 'yb_team_checklist', { team_id: R1.team_id }), 'another leader cannot read it');
denied(await rpc('anon', 'yb_team_checklist', { team_id: R1.team_id }), 'anon cannot read it');
const jc = (await owner('select join_code from public.teams where id = $1', [R1.team_id])).rows[0].join_code;
eq(val(await rpc('px', 'link_child', { code: jc, child_name: 'سالم أحمد' }))?.ok, true, 'a parent links a child of the claimed team');
eq(val(await rpc('px', 'yb_team_checklist', { team_id: R1.team_id }))?.minors, 4, 'the linked parent reads the checklist');

// ================================================================ 5. fee
section('the fee is set by the reviewers only');
denied(await rpc('la', 'yb_set_fee', { team_id: R1.team_id, status: 'paid', receipt: 'R-1' }), 'the leader cannot mark the fee paid');
denied(await rpc('offF', 'yb_set_fee', { team_id: R1.team_id, status: 'paid' }), 'the football officer cannot');
denied(await rpc('anon', 'yb_set_fee', { team_id: R1.team_id, status: 'paid' }), 'anon cannot');
ok(!!(await as('la', "update public.teams set fee_status = 'paid' where id = $1", [R1.team_id])).error, 'the leader cannot write the fee column directly');
fails(await rpc('admin', 'yb_set_fee', { team_id: R1.team_id, status: 'free' }), 'invalid_argument', 'an unknown fee status is refused');
fails(await rpc('admin', 'yb_set_fee', { team_id: R1.team_id, status: 'paid', receipt: 'x'.repeat(41) }), 'invalid_argument', 'a receipt over 40 characters is refused');
fails(await rpc('admin', 'yb_set_fee', { team_id: '00000000-0000-0000-0000-000000000000', status: 'paid' }), 'team_not_found', 'an unknown team is refused');
await owner('delete from public.yb_notifications');
r = await rpc('offR', 'yb_set_fee', { team_id: R1.team_id, status: 'paid', receipt: 'إيصال 17' });
eq([val(r)?.ok, val(r)?.changed], [true, true], 'the registration officer marks the fee paid with a receipt number');
let F = (await owner('select fee_status, fee_receipt, fee_at is not null as at from public.teams where id = $1', [R1.team_id])).rows[0];
eq(F, { fee_status: 'paid', fee_receipt: 'إيصال 17', at: true }, 'status, receipt and time are stored');
eq((await owner("select kind, data->>'fee' as fee from public.yb_notifications where user_id = $1", [U.la.id])).rows, [{ kind: 'team_fee', fee: 'paid' }], 'the leader hears about it');
eq(await count("select count(*)::int as n from public.yb_notifications where user_id = $1 and kind = 'team_fee'", [U.px.id]), 1, 'the linked parent too');
eq(val(await rpc('offR', 'yb_set_fee', { team_id: R1.team_id, status: 'paid', receipt: 'إيصال 17' }))?.changed, false, 'the same answer again changes nothing');
eq(await count("select count(*)::int as n from public.yb_notifications where kind = 'team_fee'"), 2, 'and sends nothing new');
eq(val(await track(R1.ref, '05305175431', '10.0.1.42'))?.team?.fee, 'paid', 'the tracker shows the fee as paid');
await rpc('admin', 'yb_set_fee', { team_id: R1.team_id, status: 'unpaid', receipt: 'ignored' });
F = (await owner('select fee_status, fee_receipt, fee_at from public.teams where id = $1', [R1.team_id])).rows[0];
eq(F, { fee_status: 'unpaid', fee_receipt: null, fee_at: null }, 'back to unpaid clears the receipt and the time');
eq(await count("select count(*)::int as n from public.audit_log where action = 'team_fee'"), 2, 'both changes are in the audit log');
ok(!JSON.stringify((await owner("select detail from public.audit_log where action in ('team_fee', 'team_claim')")).rows).includes('إيصال'), 'the audit log keeps ids and statuses only');
eq(val(await rpc('admin', 'yb_set_fee', { team_id: R3.team_id, status: 'waived' }))?.fee, 'waived', 'the admin may waive the fee');

section('the review queue shows the fee and the online flag');
r = await as('offR', 'select team_name, fee_status, ref_code, online, claimed from public.yb_review_list() order by team_name');
eq(r.rows?.map((x) => [x.team_name, x.fee_status, !!x.ref_code, x.online, x.claimed]),
  [['فريق الأمل', 'unpaid', true, true, false], ['فريق البناء', 'waived', true, true, true], ['فريق الفجر', 'unpaid', true, true, true]], 'fee, request number, online and claimed flags per team');
denied(await as('offF', 'select * from public.yb_review_list()'), 'the football officer has no review queue');
denied(await as('la', 'select * from public.yb_review_list()'), 'a leader has no review queue');

section('public counts for the home page');
await rpc('admin', 'yb_review_team', { team_id: R3.team_id, decision: 'approve' });
eq(val(await rpc('anon', 'yb_registration_stats')), { target: 12, approved: 1, registered: 3 }, 'anon reads the counts: 3 registered, 1 approved, target 12');
await rpc('admin', 'yb_review_team', { team_id: R2.id, decision: 'reject' });
eq(val(await rpc('anon', 'yb_registration_stats'))?.registered, 2, 'a rejected team is not counted');
r = val(await reg('anon', form({ team: 'فريق الأمل', phone: '0598 111 2233' }), '10.0.5.1'));
eq([r?.ok, r?.duplicate, r?.ref === R2.ref_code], [true, true, true], 'the rejected team sending the form again gets its request number back (the tracker shows the decision)');
eq(err(await reg('anon', form({ team: 'فريق الأمل', phone: '0590 000 1111' }), '10.0.5.2')), 'team_name_taken', 'a rejected team name stays taken for others (names are unique for good)');

section('the account flow is unchanged');
const own = (await as('lc', 'insert into public.teams (name, area) values ($1, $2) returning *', ['فريق الغد', 'حي'])).rows?.[0];
eq([own?.status, own?.ref_code, own?.fee_status], ['draft', null, 'unpaid'], 'a team created from the account page has no request number and an unpaid fee');
ok(!!(await as('lc', 'update public.teams set ref_code = $2 where id = $1', [own?.id, 'ABCDEFGH'])).error, 'a leader cannot write a request number');

finish(t0, 100);
