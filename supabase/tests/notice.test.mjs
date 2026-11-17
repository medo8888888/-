// Yanabee backend — tests for migration 0022 (reading the privacy notice). Applies 0001 -> 0022 in PGlite.
// Run:  node supabase/tests/notice.test.mjs
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
const M = readMigration('0022_yb_notice_ack.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql', '0021_yb_privacy.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0022 is ASCII only');
await E.db.exec(M);
ok(true, '0022 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['pa', 'parent', 'ولي سالم'], ['ma', 'member', 'سالم']]) await signUp(k, Y(r, n));
const V = '2026-11-17';

section('reading the privacy notice');
for (const fn of ['yb_notice_state', 'yb_notice_ack', 'yb_notice_board']) denied(await rpc('anon', fn, { version: V }), `a visitor cannot call ${fn}`);
denied(await as('pa', 'select * from public.yb_notice_acks'), 'nobody reads the table directly');
eq(val(await rpc('pa', 'yb_notice_state', { version: V })), { at: null, version: V }, 'a parent has not confirmed yet');
const a1 = val(await rpc('pa', 'yb_notice_ack', { version: V }));
eq([a1?.ok, typeof a1?.at], [true, 'string'], 'the parent confirms');
eq(val(await rpc('pa', 'yb_notice_ack', { version: V })).at, a1.at, 'confirming again keeps the first time');
eq(val(await rpc('pa', 'yb_notice_state', { version: V })).at, a1.at, 'and reads it back');
eq(val(await rpc('pa', 'yb_notice_state', { version: '2027-01-10' })).at, null, 'a new version asks again');
eq(val(await rpc('pa', 'yb_notice_ack', { version: 'latest' }))?.error, 'invalid_data', 'the version is a date');
eq(val(await rpc('pa', 'yb_notice_ack', { version: '2099-01-01' }))?.error, 'invalid_data', 'a future version is refused');
eq(val(await rpc('ma', 'yb_notice_ack', { version: V }))?.ok, true, 'a member confirms');
denied(await rpc('la', 'yb_notice_board', { version: V }), 'a leader does not read the count');
eq(val(await rpc('admin', 'yb_notice_board', { version: V })), { acked: 2, version: V, accounts: 4 }, 'the admin reads how many of the accounts confirmed');
ok(!/ولي|سالم|pa@|ma@/.test(JSON.stringify(val(await rpc('admin', 'yb_notice_board', { version: V })))), 'and not who');
await owner("delete from auth.users where email = 'ma@example.test'");
eq(val(await rpc('admin', 'yb_notice_board', { version: V })).acked, 1, 'a deleted account takes its confirmation with it');

finish(t0, 15);
