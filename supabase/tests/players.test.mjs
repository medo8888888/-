// Yanabee backend — tests for migration 0012 (players looking for a team, the leaders' pool, invites, transfers).
// Applies 0001 -> 0012 in PGlite behind the Supabase emulation in harness.mjs.
// Run:  node supabase/tests/players.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();

await E.db.exec(`
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid,
    created_at timestamptz default now(), metadata jsonb, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;
`);
const M = readMigration('0012_yb_players.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
console.log(`migrations 0001-0012 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M), '0012 is ASCII only');
await E.db.exec(M);
ok(true, '0012 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['lc', 'leader', 'قائد المسودة'],
  ['ad', 'member', 'خالد عمر الراشد'], ['k1', 'member', 'يوسف سامي الحربي'], ['k2', 'member', 'سالم أحمد العلي'], ['k3', 'member', 'زيد ماجد'],
  ['k4', 'member', 'عمار نبيل'], ['p1', 'parent', 'ولي يوسف'], ['p2', 'parent', 'ولي زيد']]) await signUp(k, Y(r, n));

async function team(who, name, status, kids) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of kids) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  if (status !== 'draft') await owner('update public.teams set status = $2 where id = $1', [t.id, status]);
  return t;
}
const TA = await team('la', 'فريق النور', 'approved', ['سالم أحمد العلي', 'عمر حسن', 'أنس بكر', 'بلال هاني']);
const TB = await team('lb', 'فريق الأمل', 'submitted', ['معاذ رامي', 'حمزة طه', 'هاني زكي', 'طارق نزار']);
await owner("delete from public.team_members where team_id = $1 and full_name = 'طارق نزار'", [TB.id]);   // 4 left: room for 3
await team('lc', 'فريق المسودة', 'draft', []);
eq(val(await rpc('k2', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'k2 joins team A (on a team)');
await owner("update public.team_members set consent_status = 'received' where team_id = $1 and full_name = 'سالم أحمد العلي'", [TA.id]);
await owner('delete from public.yb_notifications');
const notes = async (kind) => (await owner('select user_id from public.yb_notifications where kind = $1 order by user_id', [kind])).rows.map((r) => r.user_id);
const count = async (sql, p = []) => +(await owner(sql, p)).rows[0].n;
const save = (who, p) => rpc(who, 'yb_seek_save', { p: JSON.stringify(p) });

section('1. the tables are closed');
denied(await as('anon', 'select * from public.yb_seekers'), 'a visitor cannot read the seekers');
denied(await as('lb', 'select * from public.yb_seekers'), 'a leader cannot read the seekers directly');
denied(await as('anon', 'select * from public.yb_invites'), 'a visitor cannot read the invites');
denied(await as('lb', 'select * from public.yb_invites'), 'a leader cannot read the invites directly');
denied(await as('ad', 'insert into public.yb_seekers (user_id, age_group) values ($1, $2)', [U.ad.id, 'adult']), 'nobody writes the seekers directly');
denied(await as('lb', 'insert into public.yb_invites (team_id, seeker) values ($1, $2)', [TB.id, U.ad.id]), 'nobody writes the invites directly');
denied(await rpc('anon', 'yb_seek_pool'), 'a visitor has no pool');
denied(await rpc('anon', 'yb_seek_save', { p: '{}' }), 'a visitor cannot opt in');

section('2. opting in');
eq(val(await save('p1', { age_group: 'adult' }))?.error, 'members_only', 'a parent account cannot opt in');
eq(val(await save('la', { age_group: 'adult' }))?.error, 'members_only', 'a leader account cannot opt in');
eq(val(await save('ad', { age_group: '12' }))?.error, 'invalid_data', 'an exact age is refused (age groups only)');
eq(val(await save('ad', { age_group: 'adult', area: 'اتصل 0551234567' }))?.error, 'contact_not_allowed', 'a phone number in the area is refused');
eq(val(await save('ad', { age_group: 'adult', positions: ['striker'] }))?.error, 'invalid_data', 'an unknown position is refused');
const s1 = val(await save('ad', { age_group: 'adult', area: 'حي الصفا', positions: ['attack', 'chess'] }));
eq([s1?.ok, s1?.seeker?.listed, s1?.seeker?.guardian_code], [true, true, null], 'an adult is listed at once, no code');
const s2 = val(await save('k1', { age_group: 'u13', area: 'حي الروضة', positions: ['goal'] }));
ok(/^[A-Z2-9]{6}$/.test(s2?.seeker?.guardian_code || '') && s2?.seeker?.listed === false, 'a minor gets a 6-character code and waits for a parent');
const code1 = s2.seeker.guardian_code;
eq(val(await save('k1', { age_group: 'u13', area: 'حي الروضة', positions: ['goal', 'defense'] }))?.seeker?.guardian_code, code1, 'saving again keeps the same code');

section('3. the pool: who sees it, what they see');
denied(await rpc('lc', 'yb_seek_pool'), 'a leader whose team is still a draft (not seen by the admin) does not see the pool');
denied(await rpc('ad', 'yb_seek_pool'), 'a member does not see the pool');
denied(await rpc('p1', 'yb_seek_pool'), 'a parent does not see the pool');
let pool = val(await rpc('lb', 'yb_seek_pool'));
eq([pool?.ok, pool?.team_status, pool?.can_invite, pool?.room], [true, 'submitted', true, 3], 'a submitted team\'s leader sees the pool, can invite, 3 places left');
eq(pool.players.map((p) => p.first_name), ['خالد'], 'only the adult is listed; the minor waits for a parent');
const pAd = pool.players[0];
eq([pAd.age_group, pAd.area, pAd.positions, pAd.goals, pAd.wins, pAd.spirit], ['adult', 'حي الصفا', ['attack', 'chess'], 0, 0, 0], 'first name, age group, area, positions and counts');
ok(!JSON.stringify(pool).includes('الراشد') && !JSON.stringify(pool).includes('@example') && !('age' in pAd), 'never the full name, the e-mail or an exact age');
eq(val(await rpc('la', 'yb_seek_pool'))?.can_invite, false, 'an approved team sees the pool but cannot invite (its roster is locked)');

section('4. a parent approves with the code');
eq(val(await rpc('p1', 'yb_seek_guardian', { code: 'ZZZZZZ' }))?.error, 'code_not_found', 'a wrong code is refused (and counted)');
eq(val(await rpc('ad', 'yb_seek_guardian', { code: code1 }))?.error, 'parents_only', 'only a parent account approves');
const g1 = val(await rpc('p1', 'yb_seek_guardian', { code: code1.toLowerCase().split('').join('-') }));
eq([g1?.ok, g1?.first_name], [true, 'يوسف'], 'the right code (any case, with dashes) approves; the parent sees the first name');
eq(await notes('seek_approved'), [U.k1.id], 'the child is told');
eq(val(await rpc('p1', 'yb_seek_guardian', { code: code1 }))?.error, 'code_not_found', 'a used code is gone');
pool = val(await rpc('lb', 'yb_seek_pool'));
eq(pool.players.map((p) => p.first_name).sort(), ['خالد', 'يوسف'].sort(), 'the approved minor is listed now');
eq(val(await rpc('k1', 'yb_seek_me'))?.seeker?.listed, true, 'the child sees «listed»');
eq(val(await rpc('p1', 'yb_guardian_seekers'))?.map((x) => x.first_name), ['يوسف'], 'the parent sees the child they approved');

section('5. a player on a team: only during transfers, with achievements');
eq(val(await save('k2', { age_group: 'u13', positions: ['attack'] }))?.seeker?.guardian_ok, true, 'a child with paper consent on a team needs no code');
await owner(`insert into public.yb_match_live (comp, match_key, a, b, sa, sb, status) values ('football', 'm1', $1, 'other-team', 3, 1, 'approved'),
  ('football', 'm2', $1, 'other-team2', 0, 2, 'approved'), ('football', 'm3', 'x3', $1, 0, 1, 'live')`, [TA.id]);
const k2m = (await owner("select id from public.team_members where team_id = $1 and full_name = 'سالم أحمد العلي'", [TA.id])).rows[0].id;
await owner(`insert into public.yb_match_marks (comp, match_key, team_id, member_id, kind) values ('football', 'm1', $1, $2, 'goal'), ('football', 'm1', $1, $2, 'goal'),
  ('football', 'm1', $1, $2, 'spirit'), ('football', 'm3', $1, $2, 'goal')`, [TA.id, k2m]);
ok(!val(await rpc('lb', 'yb_seek_pool')).players.some((p) => p.first_name === 'سالم'), 'transfers closed: a player on a team is not listed');
denied(await rpc('lb', 'yb_set_transfers', { allow: true }), 'only the admin opens transfers');
eq(val(await rpc('admin', 'yb_set_transfers', { allow: true }))?.open, true, 'the admin opens transfers');
pool = val(await rpc('lb', 'yb_seek_pool'));
const pK2 = pool.players.find((p) => p.first_name === 'سالم');
eq([pK2?.on_team, pK2?.goals, pK2?.spirit, pK2?.wins], [true, 2, 1, 1], 'listed with 2 goals and 1 team-spirit badge (approved matches only) and 1 win');
ok(!val(await rpc('la', 'yb_seek_pool')).players.some((p) => p.first_name === 'سالم'), 'never in their own team\'s pool');
await rpc('admin', 'yb_set_transfers', { allow: false });

section('6. invites');
eq(val(await rpc('la', 'yb_invite_send', { seeker: U.ad.id }))?.error, 'roster_locked', 'an approved team cannot invite');
denied(await rpc('lc', 'yb_invite_send', { seeker: U.ad.id }), 'a draft team cannot invite');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.k2.id }))?.error, 'not_listed', 'transfers closed: a player on a team cannot be invited');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.ad.id }))?.ok, true, 'the leader invites the adult');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.ad.id }))?.error, 'already_invited', 'not twice');
eq(await notes('invite_new'), [U.ad.id], 'the player is told');
await owner('delete from public.yb_notifications');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.k1.id }))?.ok, true, 'the leader invites the approved minor');
eq(await notes('invite_new'), [U.k1.id, U.p1.id].sort(), 'the minor and the approving parent are both told');
ok(val(await rpc('lb', 'yb_seek_pool')).players.find((p) => p.first_name === 'يوسف')?.invited === true, 'the pool marks who is invited');
const invAd = val(await rpc('ad', 'yb_seek_me')).invites[0];
eq([invAd.team_name, invAd.leader, invAd.status], ['فريق الأمل', 'قائد', 'pending'], 'the player sees the team, the leader\'s first name and «pending»');
const invK1 = val(await rpc('k1', 'yb_seek_me')).invites[0];

section('7. answers');
denied(await rpc('k2', 'yb_invite_answer', { id: invAd.id, accept: true }), 'someone else cannot answer');
denied(await rpc('p2', 'yb_invite_answer', { id: invK1.id, accept: true }), 'another parent cannot answer');
const before = await count('select count(*) as n from public.team_members where team_id = $1', [TB.id]);
const a1 = val(await rpc('ad', 'yb_invite_answer', { id: invAd.id, accept: true }));
eq([a1?.ok, a1?.status, a1?.team_name], [true, 'accepted', 'فريق الأمل'], 'the adult accepts and joins');
eq(await count('select count(*) as n from public.team_members where team_id = $1 and user_id = $2', [TB.id, U.ad.id]), 1, 'the player is on the roster, linked to the account');
eq(await count("select count(*) as n from public.team_members where user_id = $1 and full_name = 'خالد عمر الراشد' and consent_status = 'pending'", [U.ad.id]), 1, '…with the full name (seen by the leader only, as any member) and consent pending');
ok((await notes('invite_answer')).includes(U.lb.id), 'the leader is told');
eq(val(await rpc('ad', 'yb_seek_me'))?.seeker?.active, false, 'the player leaves the pool');
eq(val(await rpc('ad', 'yb_invite_answer', { id: invAd.id, accept: true }))?.error, 'not_pending', 'an answered invite is closed');
await owner('delete from public.yb_notifications');
const a2 = val(await rpc('k1', 'yb_invite_answer', { id: invK1.id, accept: true }));
eq([a2?.status, a2?.waiting], ['pending', 'guardian'], 'the minor says yes: waiting for the parent');
eq(await notes('invite_waiting'), [U.p1.id], 'the parent is told');
eq(await count('select count(*) as n from public.team_members where user_id = $1', [U.k1.id]), 0, 'not on the roster yet');
const a3 = val(await rpc('p1', 'yb_invite_answer', { id: invK1.id, accept: true }));
eq(a3?.status, 'accepted', 'the parent says yes: the child joins');
eq(await count('select count(*) as n from public.team_members where team_id = $1', [TB.id]), before + 2, 'two players joined the team');

section('8. decline, withdraw, full team, revoke, stop');
const s3 = val(await save('k3', { age_group: 'u16' }));
eq(val(await rpc('p2', 'yb_seek_guardian', { code: s3.seeker.guardian_code }))?.ok, true, 'a second parent approves another child');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.k3.id }))?.ok, true, 'invited');
const inv3 = val(await rpc('k3', 'yb_seek_me')).invites[0];
await owner('delete from public.yb_notifications');
eq(val(await rpc('p2', 'yb_invite_answer', { id: inv3.id, accept: false }))?.status, 'declined', 'the parent declines');
ok((await notes('invite_answer')).includes(U.lb.id), 'the leader is told about the refusal too');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.k3.id }))?.ok, true, 'a new invite after a refusal is allowed');
const inv3b = val(await rpc('k3', 'yb_seek_me')).invites.find((i) => i.status === 'pending');
denied(await rpc('la', 'yb_invite_cancel', { id: inv3b.id }), 'another leader cannot withdraw it');
eq(val(await rpc('lb', 'yb_invite_cancel', { id: inv3b.id }))?.ok, true, 'the leader withdraws it');
eq(val(await save('k4', { age_group: 'adult' }))?.seeker?.listed, true, 'another adult opts in');
await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [TB.id, 'لاعب سابع']);
eq(val(await rpc('lb', 'yb_seek_pool'))?.can_invite, false, 'a team of 7 cannot invite any more');
eq(val(await rpc('lb', 'yb_invite_send', { seeker: U.k4.id }))?.error, 'team_full', 'and the server refuses');
denied(await rpc('p1', 'yb_seek_guardian_revoke', { seeker: U.k3.id }), 'a parent cannot withdraw another parent\'s approval');
eq(val(await rpc('p2', 'yb_seek_guardian_revoke', { seeker: U.k3.id }))?.ok, true, 'the parent withdraws the approval');
eq(val(await rpc('k3', 'yb_seek_me'))?.seeker?.listed, false, 'the child leaves the pool');
eq(val(await rpc('k4', 'yb_seek_stop'))?.ok, true, 'a player stops looking');
eq(val(await rpc('k4', 'yb_seek_me'))?.seeker, null, 'the listing is gone');

section('9. the admin\'s counts');
denied(await rpc('lb', 'yb_seek_stats'), 'only the admin reads the counts');
const st = val(await rpc('admin', 'yb_seek_stats'));
eq([st?.transfers_open, st?.joined], [false, 2], 'counts: transfers closed, 2 joined through invites');
ok((await owner("select count(*) as n from public.audit_log where action in ('seek_save', 'seek_guardian', 'invite_send', 'invite_accept', 'invite_decline', 'transfers')")).rows[0].n > 5, 'every step is in the audit log');

finish(t0);
