// Yanabee backend — tests for migration 0024 (the fixes from the security review): permanent judge conflicts,
// the oath on the server, registration limits, who reads a team's week and roster, photos only with everyone's yes,
// no repeated notifications, quiet audit for phone alerts, the rate-limit address, the public schedule and teams.
// Applies 0001 -> 0024 in PGlite.
// Run:  node supabase/tests/hardening.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();

await E.db.exec(`
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid,
    created_at timestamptz default now(), metadata jsonb, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;
  create schema if not exists net;
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $f$ select 1::bigint $f$;
`);
const M = readMigration('0024_yb_hardening.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql', '0021_yb_privacy.sql', '0022_yb_notice_ack.sql',
  '0023_yb_closing.sql']) await E.db.exec(readMigration(f));

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول الكرة'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
await rpc('admin', 'yb_set_officer', { target: U.off.id, competition: 'football', assign: true });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['lc', 'leader', 'قائد الفجر'], ['ln', 'leader', 'قائد جديد'],
  ['ma', 'member', 'سالم أحمد العلي'], ['mx', 'member', 'لاعب من القائمة'], ['pa', 'parent', 'ولي سالم'], ['pq', 'parent', 'ولي قديم'],
  ['px', 'parent', 'ولي بلا ابن'], ['pg', 'parent', 'ولي لاعب']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
const TC = await team('lc', 'فريق الفجر');      // stays a draft
await owner("update public.teams set status = 'approved' where id = any($1)", [[TA.id, TB.id]]);
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
// a parent linked to team B before 0024, who then deletes the link: the backfill must still remember it
eq(val(await rpc('pq', 'link_child', { code: TB.join_code, child_name: 'زيد محمود' }))?.ok, true, 'before 0024: a parent links a child in team B');

await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0024 is ASCII only');
await E.db.exec(M);
ok(true, '0024 runs twice without error (idempotent)');

// ---------------------------------------------------------------------------
section('judge conflicts are kept for good');
const conflicts = async (who) => (await owner('select team_id from public.yb_judge_conflicts where judge_id = $1 order by team_id', [U[who].id])).rows.map((r) => r.team_id);
eq(await conflicts('pq'), [TB.id], 'the backfill recorded the link made before 0024');
denied(await as('pq', 'select * from public.yb_judge_conflicts'), 'nobody reads the conflicts table directly');
denied(await as('admin', 'insert into public.yb_judge_conflicts (judge_id, team_id) values ($1, $2)', [U.pq.id, TA.id]), 'nobody writes it directly, not even the admin');
eq((await as('pq', 'delete from public.parent_links where parent_id = $1', [U.pq.id])).error, undefined, 'the parent deletes their link (allowed)');
for (const k of ['pa', 'pq', 'px', 'pg']) await rpc('admin', 'yb_set_judge', { target: U[k].id, axes: ['hifz', 'fahm'] });
const js = (who, team_id, points = 5) => rpc(who, 'yb_judge_score', { team_id, criterion: 'hifz', points, reason: 'تلاوة حسنة' });
eq(val(await js('pq', TB.id))?.error, 'oath_required', 'a judge without the oath cannot score (the server checks, not only the page)');
for (const k of ['pa', 'pq', 'px', 'pg']) await rpc(k, 'yb_judge_oath_take', {});
eq(val(await js('pq', TB.id))?.error, 'conflict_of_interest', 'after deleting the link the parent still cannot judge team B');
eq(val(await js('pq', TA.id))?.ok, true, 'but judges team A');
eq(val(await rpc('pq', 'yb_my_judging', {}))?.teams?.map((t) => [t.name, t.conflict]), [['فريق الأمل', true], ['فريق النور', false]], 'the judge\'s page marks team B as conflicted');

eq(val(await js('pa', TA.id))?.ok, true, 'a parent judges team A before linking a child there');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.ok, true, 'then links their child in team A');
eq((await owner('select count(*)::int n from public.yb_judge_scores where judge_id = $1 and team_id = $2', [U.pa.id, TA.id])).rows[0].n, 0, 'the score they gave team A is removed');
eq(val(await js('pa', TA.id))?.error, 'conflict_of_interest', 'and they cannot score team A any more');
await as('pa', 'delete from public.parent_links where parent_id = $1', [U.pa.id]);
eq(val(await js('pa', TA.id))?.error, 'conflict_of_interest', 'not even after deleting the link');

// the player pool: a parent approves a player (no parent link); the player then joins team B
eq(val(await js('pg', TB.id))?.ok, true, 'a parent judges team B');
await owner("insert into public.yb_seekers (user_id, age_group, guardian_by) values ($1, 'u13', $2)", [U.mx.id, U.pg.id]);
await owner("insert into public.team_members (team_id, full_name, user_id, consent_status) values ($1, 'لاعب من القائمة', $2, 'pending')", [TB.id, U.mx.id]);
eq(await conflicts('pg'), [TB.id], 'the parent who approved the player now has a conflict with the player\'s team');
eq(val(await js('pg', TB.id))?.error, 'conflict_of_interest', 'and cannot judge it; their earlier score is gone');
eq((await owner('select count(*)::int n from public.yb_judge_scores where judge_id = $1', [U.pg.id])).rows[0].n, 0, 'no score of theirs is left');
eq(val(await js('px', TB.id))?.ok, true, 'a judge with no tie still judges team B');

// ---------------------------------------------------------------------------
section('online registration');
const MEMBERS = [
  { name: 'خالد سعيد', age: 16, contact: '05301110000' }, { name: 'سالم أحمد', age: 12, contact: '05302220000' },
  { name: 'يوسف علي', age: 13, contact: '05303330000' }, { name: 'عمر حسن', age: 14, contact: '05304440000' },
  { name: 'زيد محمود', age: 19, contact: '05305550000' }];
const form = (o = {}) => ({ team: 'فريق', leader: 'خالد سعيد', phone: '0551234567', area: 'حي', reciter1: 'سالم أحمد', reciter2: 'يوسف علي', chess: 'عمر حسن', pledges: true, members: MEMBERS, ...o });
const reg = (who, p, addr, extra = {}) => as(who,
  "select public.yb_register_team(p => $1::jsonb) as r from (select set_config('request.headers', $2, true)) h",
  [JSON.stringify(p), JSON.stringify({ 'cf-connecting-ip': addr, ...extra })]);
eq(val(await reg('pa', form({ team: 'فريق الأب' }), '10.1.0.1'))?.error, 'wrong_role', 'a signed-in parent cannot register a team (they would become its leader)');
eq(val(await reg('ma', form({ team: 'فريق العضو' }), '10.1.0.2'))?.error, 'wrong_role', 'nor a signed-in member');
eq(val(await reg('off', form({ team: 'فريق المسؤول' }), '10.1.0.3'))?.error, 'wrong_role', 'nor an officer');
eq((await owner("select count(*)::int n from public.teams where name in ('فريق الأب', 'فريق العضو', 'فريق المسؤول')")).rows[0].n, 0, 'no team was made');
const r1 = val(await reg('ln', form({ team: 'فريق القائد الجديد', phone: '0560000001' }), '10.1.0.4'));
eq([r1?.ok, (await owner('select leader_id from public.teams where id = $1', [r1?.team_id])).rows[0]?.leader_id], [true, U.ln.id], 'a signed-in leader registers and leads the team');
for (const [i, addr] of [[1, '10.2.0.1'], [2, '10.2.0.2'], [3, '10.2.0.3']]) {
  eq(val(await reg('anon', form({ team: `فريق الهاتف ${i}`, phone: '0570 000 000' }), addr))?.ok, true, `phone limit: team ${i} of 3 from one phone`);
}
eq(val(await reg('anon', form({ team: 'فريق الهاتف 4', phone: '0570000000' }), '10.2.0.4'))?.error, 'rate_limited', 'a fourth team from the same phone the same day is refused, from any address');
eq(val(await reg('anon', form({ team: 'فريق الهاتف 1', phone: '0570000000' }), '10.2.0.5'))?.duplicate, true, 'the same form sent again still gets its request number');
// x-forwarded-for is typed by the caller: it no longer splits one address into many
const addrOf = (h) => owner("select public.yb_client_addr() a from (select set_config('request.headers', $1, true)) x", [JSON.stringify(h)]).then((r) => r.rows[0].a);
eq(await addrOf({ 'x-forwarded-for': '1.1.1.1' }) === await addrOf({ 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' }), true, 'x-forwarded-for and x-real-ip are ignored');
eq(await addrOf({ 'cf-connecting-ip': '1.1.1.1' }) === await addrOf({ 'cf-connecting-ip': '2.2.2.2' }), false, 'the Cloudflare address still tells callers apart');
for (let i = 0; i < 5; i++) await reg('anon', form({ team: `فريق مزوّر ${i}`, phone: `058000000${i}` }), '10.3.0.1', { 'x-forwarded-for': `9.9.9.${i}` });
eq(val(await reg('anon', form({ team: 'فريق مزوّر 5', phone: '0580000009' }), '10.3.0.1', { 'x-forwarded-for': '9.9.9.99' }))?.error, 'rate_limited', 'changing x-forwarded-for does not get around the address limit');

// ---------------------------------------------------------------------------
section('who reads a team\'s week and roster');
const W = (await owner("select to_char(current_date - ((extract(dow from current_date)::int + 1) % 7), 'YYYY-MM-DD') d")).rows[0].d;
denied(await rpc('off', 'yb_team_journey', { team_id: TA.id, week: W }), 'an officer cannot read a team\'s promises and memorisation');
eq(Array.isArray(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W }))?.members), true, 'the team\'s leader can');
eq(Array.isArray(val(await rpc('admin', 'yb_team_journey', { team_id: TA.id, week: W }))?.members), true, 'and the admin');
denied(await rpc('lb', 'yb_team_journey', { team_id: TA.id, week: W }), 'another team\'s leader cannot');
const roster = async (t) => (await as('off', 'select * from public.yb_match_roster($1, $2)', ['football', t])).rows.length;
eq(await roster(TA.id), 5, 'the football officer reads the roster of a team in the competition');
eq(await roster(TC.id), 0, 'but not of a draft team');

// ---------------------------------------------------------------------------
section('photos only with everyone\'s yes');
const photoOk = async (t) => (await owner('select public.yb_team_photo_ok($1) v', [t])).rows[0].v;
await owner("update public.team_members set photo_consent = 'yes' where team_id = $1", [TA.id]);
eq(await photoOk(TA.id), true, 'every member said yes: photos may go out');
await owner("update public.team_members set age = 30, photo_consent = 'pending' where team_id = $1 and full_name = 'عمر حسن'", [TA.id]);
eq(await photoOk(TA.id), false, 'a member typed as 30 years old who has not answered still blocks (the leader types ages)');
eq(await photoOk(TC.id), false, 'a team where nobody answered is not public');
const post = async (team, photos) => (await owner(`insert into public.yb_posts (id, author, author_role, team_id, body, photos, status)
  values (gen_random_uuid(), $1, 'leader', $2, 'خبر من الفريق', $3, 'pending') returning id`, [U.la.id, team, photos])).rows[0].id;
const P1 = await post(TA.id, [`${U.la.id}/a.webp`]);
eq(val(await rpc('admin', 'yb_post_moderate', { id: P1, action: 'publish' }))?.error, 'photo_consent', 'a team post with photos is not published while a member has not said yes');
const P2 = await post(TA.id, []);
eq(val(await rpc('admin', 'yb_post_moderate', { id: P2, action: 'publish' }))?.ok, true, 'the same post without photos is published');
await owner("update public.team_members set photo_consent = 'yes' where team_id = $1", [TA.id]);
eq(val(await rpc('admin', 'yb_post_moderate', { id: P1, action: 'publish' }))?.ok, true, 'once everyone said yes it is published');
const photosSeen = async (who) => (val(await rpc(who, 'yb_feed', {}))?.posts || []).find((p) => p.id === P1)?.photos;
eq(await photosSeen('mx'), [`${U.la.id}/a.webp`], 'members see the photo in the feed');
await owner("update public.team_members set photo_consent = 'no' where team_id = $1 and full_name = 'زيد محمود'", [TA.id]);
eq(await photosSeen('admin'), [`${U.la.id}/a.webp`], 'after a member withdraws the admin still sees the photo');
eq(await photosSeen('mx'), [], 'the other members no longer do');
eq((await as('mx', 'select public.yb_feed_can_read($1) v', [`${U.la.id}/a.webp`])).rows[0]?.v, false, 'but another member can no longer open the file');

// ---------------------------------------------------------------------------
section('no repeated notifications');
const notify = (u, kind, data) => owner('select public.yb_notify($1, $2, $3::jsonb)', [[U[u].id], kind, JSON.stringify(data)]);
const count = async (u, kind) => (await owner('select count(*)::int n from public.yb_notifications where user_id = $1 and kind = $2', [U[u].id, kind])).rows[0].n;
await notify('admin', 'post_pending', { post_id: P2 });
await notify('admin', 'post_pending', { post_id: P2 });
eq(await count('admin', 'post_pending'), 1, 'a post saved again does not notify the admin again while the first note is unread');
await notify('admin', 'post_pending', { post_id: P1 });
eq(await count('admin', 'post_pending'), 2, 'another post does');
await owner("update public.yb_notifications set read_at = now() where user_id = $1 and kind = 'post_pending'", [U.admin.id]);
await notify('admin', 'post_pending', { post_id: P2 });
eq(await count('admin', 'post_pending'), 3, 'once read, a new save notifies again');
await notify('la', 'announcement', { title: 'إعلان' });
await notify('la', 'announcement', { title: 'إعلان' });
eq(await count('la', 'announcement'), 2, 'kinds a person cannot repeat (announcements) are never held back');

// ---------------------------------------------------------------------------
section('phone alerts and the audit log');
const audits = async (u, a) => (await owner('select count(*)::int n from public.audit_log where user_id = $1 and action = $2', [U[u].id, a])).rows[0].n;
for (let i = 0; i < 3; i++) await rpc('mx', 'yb_push_unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/none' + i });
eq(await audits('mx', 'push_off'), 0, 'turning off alerts that were never on writes nothing to the audit log');

// ---------------------------------------------------------------------------
section('what visitors read');
denied(await as('anon', 'select created_by from public.yb_events'), 'a visitor cannot read who typed a schedule entry');
eq((await as('anon', 'select id, competition, kind, title, starts_at, place, team_ids, category, status, note from public.yb_events')).error, undefined, 'but reads the columns the public schedule uses');
eq((await as('la', 'select count(*) from public.yb_events')).error, undefined, 'signed-in people keep their access');
eq((await as('anon', 'select name from public.public_teams order by name')).rows.map((r) => r.name), ['فريق الأمل', 'فريق النور'], 'public_teams still lists the approved teams only');
eq(Object.keys((await as('anon', 'select * from public.public_teams limit 1')).rows[0] || {}), ['id', 'name', 'area'], 'with the same three columns');
eq((await owner("select coalesce(array_to_string(reloptions, ','), '') o from pg_class where relname = 'public_teams'")).rows[0].o.includes('security_invoker=true'), true, 'and is an invoker view now');
denied(await as('anon', "select public.yb_norm('x') v"), 'a visitor cannot call yb_norm');

finish(t0, 50);
