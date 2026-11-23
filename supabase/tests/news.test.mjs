// Yanabee backend — tests for migration 0025 (big changes reach people at once): disqualification, postponed
// dates, the qualified teams, and the judge's list of teams that left. Applies 0001 -> 0025 in PGlite.
// Run:  node supabase/tests/news.test.mjs
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
const M = readMigration('0025_yb_news.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql', '0021_yb_privacy.sql', '0022_yb_notice_ack.sql',
  '0023_yb_closing.sql', '0024_yb_hardening.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0025 is ASCII only');
await E.db.exec(M);
ok(true, '0025 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['lc', 'leader', 'قائد الفجر'], ['lw', 'leader', 'قائد الاحتياط'],
  ['ma', 'member', 'سالم أحمد العلي'], ['mb', 'member', 'زيد محمود'], ['pa', 'parent', 'ولي سالم'], ['j1', 'parent', 'حكم أول'], ['j2', 'parent', 'حكم ثان']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
const TC = await team('lc', 'فريق الفجر');
const TW = await team('lw', 'فريق الاحتياط');
await owner("update public.teams set status = 'approved', waitlist = false where id = any($1)", [[TA.id, TB.id, TC.id]]);
await owner("update public.teams set status = 'approved', waitlist = true, waitlist_at = now() where id = $1", [TW.id]);
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('mb', 'join_team', { code: TB.join_code, member_name: 'زيد محمود' }))?.ok, true, 'a member joins team B');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.ok, true, 'a parent links their child in team A');
for (const k of ['j1', 'j2']) { await rpc('admin', 'yb_set_judge', { target: U[k].id, axes: ['hifz'] }); await rpc(k, 'yb_judge_oath_take', {}); }
eq(val(await rpc('j1', 'yb_judge_score', { team_id: TA.id, criterion: 'hifz', points: 7, reason: 'تلاوة حسنة' }))?.ok, true, 'a judge scores team A');
const notes = async (who, kind) => (await owner('select data from public.yb_notifications where user_id = $1 and kind = $2 order by id', [U[who].id, kind])).rows.map((r) => r.data);
const ev = (await owner(`insert into public.yb_events (competition, kind, title, starts_at, team_ids) values
  ('football', 'match', 'النور والأمل', now() + interval '3 days', $1) returning id`, [[TA.id, TB.id]])).rows[0].id;
const evPast = (await owner(`insert into public.yb_events (competition, kind, title, starts_at, team_ids) values
  ('football', 'match', 'مباراة مضت', now() - interval '3 days', $1) returning id`, [[TA.id, TC.id]])).rows[0].id;

// ---------------------------------------------------------------------------
section('disqualification');
denied(await rpc('la', 'yb_team_disqualify', { team_id: TB.id, reason: 'سبب كاف للاستبعاد' }), 'a leader cannot disqualify a team');
eq(val(await rpc('admin', 'yb_team_disqualify', { team_id: TA.id, reason: 'قصير' }))?.error, 'reason_required', 'a reason of a few letters is refused');
eq(val(await rpc('admin', 'yb_team_disqualify', { team_id: TA.id, reason: 'اتصلوا على 0551234567' }))?.error, 'contact_not_allowed', 'a phone number in the reason is refused');
eq(val(await rpc('admin', 'yb_team_disqualify', { team_id: TW.id, reason: 'فريق في الاحتياط' }))?.error, 'not_in_play', 'a reserve team cannot be disqualified (it is not playing)');
const dq = val(await rpc('admin', 'yb_team_disqualify', { team_id: TA.id, reason: 'تكرار مخالفة الروح الرياضية' }));
eq([dq?.ok, dq?.events_cancelled], [true, 1], 'the admin disqualifies team A; its one coming match is called off');
const ta = (await owner('select status, disqualify_reason, disqualified_at is not null as dq from public.teams where id = $1', [TA.id])).rows[0];
eq([ta.status, ta.disqualify_reason, ta.dq], ['rejected', 'تكرار مخالفة الروح الرياضية', true], 'the team is out at once, with the reason kept');
eq((await owner('select status from public.yb_events where id = $1', [ev])).rows[0].status, 'cancelled', 'the coming match is cancelled');
eq((await owner('select status from public.yb_events where id = $1', [evPast])).rows[0].status, 'scheduled', 'a past match stays as it was');
eq((await as('anon', 'select name from public.public_teams order by name')).rows.map((r) => r.name), ['فريق الأمل', 'فريق الاحتياط', 'فريق الفجر'], 'it leaves the public list');
eq((await owner('select waitlist from public.teams where id = $1', [TW.id])).rows[0].waitlist, false, 'the reserve team takes its place');
eq((await notes('lw', 'team_seated')).length, 1, 'and its leader is told');
for (const k of ['la', 'ma', 'pa']) eq((await notes(k, 'team_disqualified')).map((d) => [d.team_name, d.note]), [['فريق النور', 'تكرار مخالفة الروح الرياضية']], `${k}: the team's people are told, with the reason`);
eq((await notes('la', 'team_status')).filter((d) => d.to === 'rejected').length, 0, 'the leader gets no second, plain "status changed: rejected" alert');
for (const k of ['j1', 'j2']) eq((await notes(k, 'judge_team_out')).map((d) => d.team_name), ['فريق النور'], `${k}: every judge is told the team is out`);
for (const k of ['lb', 'lc']) eq((await notes(k, 'team_out')).map((d) => d.team_name), ['فريق النور'], `${k}: the other teams' leaders are told`);
eq((await notes('lb', 'event_cancelled')).length, 1, 'the opponent hears its match was called off');
const jp = val(await rpc('j1', 'yb_my_judging', {}));
eq(jp.teams.map((t) => t.name).includes('فريق النور'), false, 'the judge no longer sees team A to judge');
eq(jp.removed.map((t) => [t.name, t.my_scores]), [['فريق النور', 1]], 'the judge sees it among the teams that left, with the scores they had given');
eq((await owner('select count(*)::int n from public.yb_team_totals() where team_id = $1', [TA.id])).rows[0].n, 0, 'its scores no longer count in the totals');
eq(val(await rpc('admin', 'yb_team_disqualify', { team_id: TA.id, reason: 'مرة ثانية للتأكد' }))?.error, 'not_in_play', 'a team already out cannot be disqualified twice');
eq((await owner("select count(*)::int n from public.audit_log where action = 'team_disqualified'")).rows[0].n, 1, 'the audit log keeps who did it');

// ---------------------------------------------------------------------------
section('postponed dates');
const ev2 = (await owner(`insert into public.yb_events (competition, kind, title, starts_at, team_ids) values
  ('football', 'match', 'الأمل والفجر', now() + interval '5 days', $1) returning id`, [[TB.id, TC.id]])).rows[0].id;
eq((await as('admin', "update public.yb_events set status = 'postponed' where id = $1", [ev2])).error, undefined, 'the admin postpones a match');
for (const k of ['lb', 'mb', 'lc']) eq((await notes(k, 'event_postponed')).map((d) => d.title), ['الأمل والفجر'], `${k}: the teams are told it is postponed`);
eq((await notes('lc', 'event_changed')).length, 0, 'a postponement is not a plain "changed" alert');
await as('admin', "update public.yb_events set starts_at = now() + interval '9 days' where id = $1", [ev2]);
eq([(await owner('select status from public.yb_events where id = $1', [ev2])).rows[0].status, (await notes('lc', 'event_changed')).length], ['changed', 1], 'a new time after the postponement: changed, and the teams are told');
ok(/yb_events_status_chk|check constraint/.test((await as('admin', "update public.yb_events set status = 'delayed' where id = $1", [ev2])).error || ''), 'an unknown status is still refused');

// ---------------------------------------------------------------------------
section('the qualified teams');
denied(await rpc('lb', 'yb_announce_qualified', { team_ids: [TB.id] }), 'a leader cannot announce');
eq(val(await rpc('admin', 'yb_announce_qualified', { team_ids: [TA.id] }))?.error, 'not_in_play', 'a team that left cannot qualify');
eq(val(await rpc('admin', 'yb_announce_qualified', { team_ids: [] }))?.error, 'invalid_data', 'an empty list is refused');
eq(val(await rpc('admin', 'yb_announce_qualified', { team_ids: [TB.id] })), { ok: true, announced: 1 }, 'the admin confirms team B as qualified');
eq((await notes('lb', 'team_qualified')).map((d) => d.team_name), ['فريق الأمل'], 'its leader is told');
eq((await notes('mb', 'team_qualified')).length, 1, 'and its members');
eq((await notes('lc', 'qualified_announced')).map((d) => d.names), [['فريق الأمل']], 'the other teams hear who qualified');
eq((await notes('lb', 'qualified_announced')).length, 0, 'the qualified team gets its own message, not both');
eq(val(await rpc('admin', 'yb_announce_qualified', { team_ids: [TB.id, TC.id] })), { ok: true, announced: 1 }, 'confirming again announces only the new one');
eq((await notes('lb', 'team_qualified')).length, 1, 'team B is not told twice');
eq(val(await rpc('ma', 'yb_qualified_list', {})).map((x) => x.name), ['فريق الأمل', 'فريق الفجر'], 'anyone signed in reads the list');
denied(await as('anon', 'select public.yb_qualified_list() r'), 'a visitor cannot call it');
denied(await as('lb', 'select * from public.yb_qualified'), 'nobody reads the table directly');

finish(t0, 45);
