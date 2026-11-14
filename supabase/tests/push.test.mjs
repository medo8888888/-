// Yanabee backend — tests for migration 0013 (phone notifications: subscriptions, consent, the trigger to the edge function).
// Applies 0001 -> 0013 in PGlite. pg_net is replaced by a stub (net.http_post records each call).
// Run:  node supabase/tests/push.test.mjs
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
  create schema net;
  create table net.calls (id bigint generated always as identity, url text, body jsonb, headers jsonb, timeout int);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
    returns bigint language plpgsql as $f$
    declare n bigint;
    begin
      if url like '%/broken/%' then raise exception 'network down'; end if;
      insert into net.calls (url, body, headers, timeout) values (url, body, headers, timeout_milliseconds) returning id into n;
      return n;
    end $f$;
`);
const M = readMigration('0013_yb_push.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
console.log(`migrations 0001-0013 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M), '0013 is ASCII only');
await E.db.exec(M);
ok(true, '0013 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['pa', 'parent', 'ولي'], ['kid', 'member', 'سالم أحمد'], ['kid2', 'member', 'زيد بلا موافقة']]) await signUp(k, Y(r, n));
const t = (await as('la', 'insert into public.teams (name, area) values ($1, $2) returning *', ['فريق النور', 'حي'])).rows[0];
for (const k of ['سالم أحمد', 'عمر', 'أنس', 'بلال']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
eq(val(await rpc('kid', 'join_team', { code: t.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'a child joins the team');
const calls = async () => (await owner('select url, body, headers from net.calls order by id')).rows;
const clear = () => owner('delete from net.calls');
// a valid-looking subscription
const key = (n) => 'B' + 'A'.repeat(85) + String(n).padStart(1, '0');   // 87 base64url characters (65 bytes)
const sub = (host, n = 1) => JSON.stringify({ endpoint: `https://${host}/push/abc-${n}-${'x'.repeat(30)}`, keys: { p256dh: key(n), auth: 'abcdefghijklmnopqrstuv' } });
async function service(sql, params = []) {
  try {
    return await E.db.transaction(async (tx) => { await tx.exec('set local role service_role'); return tx.query(sql, params); });
  } catch (e) { return { error: e.message, code: e.code }; }
}

section('1. closed tables and functions');
denied(await as('anon', 'select * from public.yb_push_subs'), 'a visitor cannot read the subscriptions');
denied(await as('la', 'select * from public.yb_push_subs'), 'a user cannot read the subscriptions directly');
denied(await as('admin', 'select * from public.yb_push_config'), 'not even the admin reads the push config');
denied(await rpc('la', 'yb_push_cfg'), 'a user cannot read the secret or the private key');
denied(await rpc('anon', 'yb_push_cfg'), 'a visitor cannot either');
denied(await rpc('la', 'yb_push_set_vapid', { pub: key(1), priv: '{"d":"x"}' }), 'a user cannot set the keys');
denied(await rpc('la', 'yb_push_prune', { endpoints: [] }), 'a user cannot prune');
denied(await rpc('anon', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com') }), 'a visitor cannot subscribe');
eq(val(await rpc('anon', 'yb_push_key')), null, 'no public key before the function is set up');
const sec = (await owner('select secret from public.yb_push_config where id = 1')).rows[0].secret;
ok(/^[0-9a-f]{64}$/.test(sec), 'a random 64-character secret was made');

section('2. subscribing');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: sub('evil.example') }))?.error, 'push_service_not_allowed', 'only the browsers\' push services');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com.evil.example') }))?.error, 'push_service_not_allowed', 'no look-alike host');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: JSON.stringify({ endpoint: 'http://fcm.googleapis.com/push/' + 'x'.repeat(30), keys: { p256dh: key(1), auth: 'abcdefghijklmnopqrstuv' } }) }))?.error, 'push_service_not_allowed', 'no plain http');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/push/' + 'x'.repeat(30), keys: { p256dh: 'short', auth: 'x' } }) }))?.error, 'invalid_data', 'malformed keys are refused');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', 1) }))?.phones, 1, 'a leader turns it on (Android)');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: sub('web.push.apple.com', 2) }))?.phones, 2, '…and on an iPhone');
eq(val(await rpc('la', 'yb_push_subscribe', { sub: sub('web.push.apple.com', 2) }))?.phones, 2, 'the same phone twice counts once');
eq(val(await rpc('kid2', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', 3) }))?.error, 'consent_needed', 'a child without a parent\'s consent cannot turn it on');
eq(val(await rpc('kid', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', 4) }))?.error, 'consent_needed', 'a child on a team before the paper consent is recorded cannot either');
await owner("update public.team_members set consent_status = 'received' where user_id = $1", [U.kid.id]);
eq(val(await rpc('kid', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', 4) }))?.ok, true, 'with the consent recorded, the child can');
eq(val(await rpc('pa', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', 1) }))?.phones, 1, 'a phone given to someone else follows its new owner');
eq(val(await rpc('la', 'yb_push_mine', { endpoint: `https://fcm.googleapis.com/push/abc-1-${'x'.repeat(30)}` }))?.this_phone, false, '…and leaves the old owner');
for (let i = 10; i < 17; i++) await rpc('pa', 'yb_push_subscribe', { sub: sub('fcm.googleapis.com', i) });
eq(val(await rpc('pa', 'yb_push_mine'))?.phones, 5, 'five phones at most a person');
const m = val(await rpc('la', 'yb_push_mine', { endpoint: `https://web.push.apple.com/push/abc-2-${'x'.repeat(30)}` }));
eq([m.allowed, m.this_phone, m.ready], [true, true, false], 'the leader: allowed, this phone on, not ready until the function is set up');
eq(val(await rpc('kid2', 'yb_push_mine'))?.allowed, false, 'the child without consent sees «not allowed»');

section('3. the edge function\'s side (service role)');
eq((await service('select public.yb_push_cfg() as c')).rows?.[0]?.c?.secret, sec, 'the service role reads the secret');
eq((await service('select public.yb_push_set_vapid($1, $2::jsonb) as r', [key(7), '{"kty":"EC","d":"secret-part"}'])).rows?.[0]?.r, true, 'the function stores its key pair once');
eq((await service('select public.yb_push_set_vapid($1, $2::jsonb) as r', [key(8), '{"kty":"EC","d":"other"}'])).rows?.[0]?.r, false, 'and it is never replaced');
eq(val(await rpc('anon', 'yb_push_key')), null, 'still no public key until the function address is set');
await owner("update public.yb_push_config set fn_url = 'https://abc.supabase.co/functions/v1/yb-push' where id = 1");
eq(val(await rpc('anon', 'yb_push_key')), key(7), 'then anyone gets the public key (and only that)');
let bad = ''; try { await owner("update public.yb_push_config set fn_url = 'https://evil.example/steal' where id = 1"); } catch (e) { bad = e.message; }
ok(/yb_push_cfg_url/.test(bad), 'the function address can only be a Supabase edge function named yb-push');

section('4. the trigger');
await clear();
await owner("select public.yb_notify(array[$1::uuid, $2::uuid, $3::uuid], 'announcement', '{\"title\":\"موعد\",\"note\":\"سري\"}'::jsonb)", [U.la.id, U.kid.id, U.kid2.id]);
let c = await calls();
eq(c.length, 1, 'one notification to three people = one call to the function');
eq(c[0].url, 'https://abc.supabase.co/functions/v1/yb-push', 'to the configured address');
eq(c[0].headers['x-yb-push'], sec, 'with the secret');
const its = c[0].body.items;
eq(its.length, 2, 'the leader\'s iPhone and the child\'s phone (the child without consent has none)');
ok(its.every((x) => x.kind === 'announcement' && x.data.title === 'موعد' && !('note' in x.data) && x.p256dh && x.auth), 'each item: the kind and the data, never a note');
await clear();
await owner("select public.yb_notify(array[$1::uuid], 'team_status', '{}'::jsonb)", [U.kid2.id]);
eq((await calls()).length, 0, 'nobody with a phone on: no call');
await rpc('la', 'yb_save_prefs', { p: JSON.stringify({ notify_off: ['announcements'] }) });
await clear();
await owner("select public.yb_notify(array[$1::uuid], 'announcement', '{}'::jsonb)", [U.la.id]);
eq((await calls()).length, 0, 'a group turned off in «التنبيهات» is not pushed either');
await owner("update public.yb_push_config set fn_url = 'https://abc.supabase.co/functions/v1/broken/yb-push' where id = 1").catch(() => {});
await owner("update public.yb_push_config set fn_url = null where id = 1");
await clear();
await owner("select public.yb_notify(array[$1::uuid], 'team_status', '{}'::jsonb)", [U.kid.id]);
eq((await calls()).length, 0, 'not set up: no call, and the notification is still made');
eq(+(await owner("select count(*) as n from public.yb_notifications where user_id = $1 and kind = 'team_status'", [U.kid.id])).rows[0].n, 1, '…the notification exists');
await owner("update public.yb_push_config set fn_url = 'https://abc.supabase.co/functions/v1/yb-push' where id = 1");
await owner(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $f$ begin raise exception 'network down'; end $f$`);
await owner("select public.yb_notify(array[$1::uuid], 'team_status', '{}'::jsonb)", [U.kid.id]);
eq(+(await owner("select count(*) as n from public.yb_notifications where user_id = $1 and kind = 'team_status'", [U.kid.id])).rows[0].n, 2, 'pg_net failing never stops the notification');

section('5. turning it off, pruning');
eq(val(await rpc('la', 'yb_push_unsubscribe', { endpoint: `https://web.push.apple.com/push/abc-2-${'x'.repeat(30)}` }))?.ok, true, 'the leader turns this phone off');
eq(val(await rpc('la', 'yb_push_mine'))?.phones, 0, 'no phone left');
const before = +(await owner('select count(*) as n from public.yb_push_subs')).rows[0].n;
eq((await service('select public.yb_push_prune($1::text[]) as n', [[`https://fcm.googleapis.com/push/abc-4-${'x'.repeat(30)}`]])).rows?.[0]?.n, 1, 'the function prunes a gone phone');
eq(+(await owner('select count(*) as n from public.yb_push_subs')).rows[0].n, before - 1, '…it is gone');
ok(+(await owner("select count(*) as n from public.audit_log where action in ('push_on', 'push_off')")).rows[0].n >= 3, 'on and off are in the audit log');

finish(t0);
