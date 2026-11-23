// Yanabee backend — tests for migration 0026: a parent link waits for the team leader's confirmation, and an adult
// player waits for the admin's. Applies 0001 -> 0026 in PGlite.
// Run:  node supabase/tests/links.test.mjs
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
const M = readMigration('0026_yb_confirm.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql', '0021_yb_privacy.sql', '0022_yb_notice_ack.sql',
  '0023_yb_closing.sql', '0024_yb_hardening.sql', '0025_yb_news.sql']) await E.db.exec(readMigration(f));

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ma', 'member', 'سالم أحمد العلي'], ['mx', 'member', 'لاعب كبير'],
  ['pa', 'parent', 'ولي سالم'], ['pz', 'parent', 'غريب يدعي'], ['pq', 'parent', 'ولي قديم'], ['pn', 'parent', 'ولي فريق بلا قائد']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود', 'بلال سعيد', 'أنس عمر']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
const TN = (await owner("insert into public.teams (name, area, join_code, status) values ('فريق الورق', 'حي', 'PAPER2', 'submitted') returning *")).rows[0];
await owner("insert into public.team_members (team_id, full_name, age) values ($1, 'حمزة خالد', 11)", [TN.id]);
await owner("update public.teams set status = 'approved' where id = any($1)", [[TA.id, TB.id]]);
// a link made before 0026 stays
eq(val(await rpc('pq', 'link_child', { code: TB.join_code, child_name: 'زيد محمود' }))?.ok, true, 'before 0026 a parent links at once');
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0026 is ASCII only');
await E.db.exec(M);
ok(true, '0026 runs twice without error (idempotent)');
const notes = async (who, kind) => (await owner('select data from public.yb_notifications where user_id = $1 and kind = $2 order by id', [U[who].id, kind])).rows.map((r) => r.data);
const links = async (who) => (await owner('select count(*)::int n from public.parent_links where parent_id = $1', [U[who].id])).rows[0].n;
eq(await links('pq'), 1, 'the link made before 0026 is kept');

// ---------------------------------------------------------------------------
section('a parent link waits for the leader');
const r1 = val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }));
eq([r1?.ok, r1?.pending, r1?.team_name], [true, true, 'فريق النور'], 'the code and the child\'s name only send a request');
eq(await links('pa'), 0, 'no link yet');
eq((await as('pa', 'select * from public.my_children')).rows.length, 0, 'the parent sees no child data yet');
eq(val(await rpc('pa', 'yb_link_requests_mine', {})).map((x) => [x.team_name, x.child_name]), [['فريق النور', 'سالم أحمد العلي']], 'the parent sees the request waiting');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.again, true, 'asking again keeps one request');
eq((await notes('la', 'link_request')).map((d) => [d.parent_name, d.child_name]), [['ولي سالم', 'سالم أحمد العلي']], 'the leader is told who asks for which child (once)');
const reqA = val(await rpc('la', 'yb_link_requests_team', {}));
eq(reqA.map((x) => [x.child_name, x.parent_name]), [['سالم أحمد العلي', 'ولي سالم']], 'the leader lists the request');
eq(val(await rpc('lb', 'yb_link_requests_team', {})).length, 0, 'another team\'s leader does not see it');
denied(await rpc('lb', 'yb_link_answer', { id: reqA[0].id, accept: true }), 'and cannot answer it');
denied(await rpc('pa', 'yb_link_answer', { id: reqA[0].id, accept: true }), 'the parent cannot confirm their own request');
denied(await as('pa', 'select * from public.yb_link_requests'), 'nobody reads the requests table directly');
eq(val(await rpc('la', 'yb_link_answer', { id: reqA[0].id, accept: true })), { ok: true, linked: true }, 'the leader confirms');
eq([await links('pa'), (await as('pa', 'select full_name from public.my_children')).rows.map((r) => r.full_name)], [1, ['سالم أحمد العلي']], 'now the parent is linked and sees their child');
eq((await notes('pa', 'link_confirmed')).map((d) => d.team_name), ['فريق النور'], 'the parent is told');
eq((await owner('select count(*)::int n from public.yb_judge_conflicts where judge_id = $1 and team_id = $2', [U.pa.id, TA.id])).rows[0].n, 1, 'the judge conflict is recorded as before');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.error, 'already_linked', 'asking once linked: already linked');
eq(val(await rpc('la', 'yb_link_answer', { id: reqA[0].id, accept: true }))?.error, 'not_found', 'a request is answered once');

// a stranger who knows the code and a name
eq(val(await rpc('pz', 'link_child', { code: TA.join_code, child_name: 'يوسف علي حسن' }))?.pending, true, 'a stranger with the code and a name only sends a request');
const reqZ = val(await rpc('la', 'yb_link_requests_team', {}))[0];
eq([reqZ.parent_name, reqZ.other_children], ['غريب يدعي', 0], 'the leader sees who asks (and that they have no other child here)');
eq(val(await rpc('la', 'yb_link_answer', { id: reqZ.id, accept: false })), { ok: true, linked: false }, 'the leader declines');
eq([await links('pz'), (await notes('pz', 'link_declined')).length], [0, 1], 'no link; the stranger is told it was declined');
for (const n of ['عمر حسن', 'زيد محمود', 'بلال سعيد', 'أنس عمر', 'سالم أحمد العلي']) await rpc('pz', 'link_child', { code: TA.join_code, child_name: n });
eq(val(await rpc('pz', 'link_child', { code: TB.join_code, child_name: 'يوسف علي حسن' }))?.error, 'too_many_requests', 'at most 5 requests waiting at once');

// a team with no leader account yet (registered on paper): the admin answers
eq(val(await rpc('pn', 'link_child', { code: 'PAPER2', child_name: 'حمزة خالد' }))?.pending, true, 'a request to a team without a leader account');
eq((await notes('admin', 'link_request')).map((d) => d.team_name), ['فريق الورق'], 'the admin is told instead');
const reqN = val(await rpc('admin', 'yb_link_requests_team', {})).find((x) => x.team_name === 'فريق الورق');
eq(val(await rpc('admin', 'yb_link_answer', { id: reqN.id, accept: true }))?.linked, true, 'the admin confirms');
eq(await links('pn'), 1, 'and the parent is linked');

// ---------------------------------------------------------------------------
section('an adult player waits for the admin');
const save = (who, p) => rpc(who, 'yb_seek_save', { p: JSON.stringify(p) });
const s1 = val(await save('mx', { age_group: 'adult', area: 'حي الصفا', positions: ['attack'] }));
eq([s1?.ok, s1?.seeker?.listed, s1?.seeker?.adult_waiting, s1?.seeker?.guardian_code], [true, false, true, null], 'saying "18 or older" no longer lists at once: it waits for the admin');
eq((await notes('admin', 'seek_adult')).map((d) => d.first_name), ['لاعب'], 'the admin is told (first name only)');
const pool = async () => (val(await rpc('la', 'yb_seek_pool', {}))?.players || []).map((p) => p.first_name);
await owner("update public.teams set status = 'submitted' where id = $1", [TA.id]);
eq((await pool()).includes('لاعب'), false, 'leaders do not see them in the pool yet');
denied(await rpc('la', 'yb_seek_adults', {}), 'a leader cannot see the adults list');
eq(val(await rpc('admin', 'yb_seek_adults', {})).map((x) => x.full_name), ['لاعب كبير'], 'the admin lists who waits');
denied(await rpc('la', 'yb_seek_adult_confirm', { target: U.mx.id, ok: true }), 'a leader cannot confirm');
eq(val(await rpc('admin', 'yb_seek_adult_confirm', { target: U.mx.id, ok: true }))?.ok, true, 'the admin confirms');
eq([val(await rpc('mx', 'yb_seek_me', {}))?.seeker?.listed, (await notes('mx', 'seek_adult_ok')).length], [true, 1], 'now listed, and told');
eq((await pool()).includes('لاعب'), true, 'leaders see them in the pool');
eq(val(await save('mx', { age_group: 'adult', area: 'حي الصفا', positions: ['attack', 'chess'] }))?.seeker?.listed, true, 'saving again as an adult keeps the confirmation');
const s2 = val(await save('mx', { age_group: 'u16', area: 'حي الصفا' }));
eq([s2?.seeker?.listed, !!s2?.seeker?.guardian_code], [false, true], 'switching to under 16: needs a parent again, with a code');
const s3 = val(await save('mx', { age_group: 'adult', area: 'حي الصفا' }));
eq(s3?.seeker?.adult_waiting, true, 'and back to adult: the admin must confirm again');
eq(val(await rpc('admin', 'yb_seek_adult_confirm', { target: U.mx.id, ok: false }))?.ok, true, 'the admin declines');
eq([val(await rpc('mx', 'yb_seek_me', {}))?.seeker?.active, (await notes('mx', 'seek_adult_no')).length], [false, 1], 'the listing stops, and they are told');
eq(val(await rpc('admin', 'yb_seek_adults', {})).length, 0, 'nobody waits any more');

finish(t0, 40);
