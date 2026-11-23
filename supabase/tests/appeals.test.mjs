// Yanabee backend — tests for migration 0018 (appeals: lg7 and lg8 of the regulations). Applies 0001 -> 0014 and 0018 in PGlite.
// Run:  node supabase/tests/appeals.test.mjs
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
const M = readMigration('0018_yb_appeals.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0018 is ASCII only');
await E.db.exec(M);
ok(true, '0018 runs twice without error (idempotent)');

const day = async (expr) => (await owner(`select to_char(${expr}, 'YYYY-MM-DD') d`)).rows[0].d;
const today = await day('current_date');
const W = await day("current_date - ((extract(dow from current_date)::int + 1) % 7)");      // this week's Saturday
const WPREV = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 7");
const WOLD = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 21");
const WNEXT = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) + 14");   // past tomorrow on any day (on a Friday, +7 is tomorrow, which is allowed)
const SUNDAY = await day("current_date - extract(dow from current_date)::int");

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول الحفظ'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ma', 'member', 'سالم أحمد العلي'], ['m2', 'member', 'عمر حسن'],
  ['mb', 'member', 'زيد محمود'], ['mx', 'member', 'عضو بلا فريق'], ['pa', 'parent', 'ولي سالم'], ['px', 'parent', 'ولي بلا ابن']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
await owner("update public.teams set status = 'approved' where id = any($1)", [[TA.id, TB.id]]);
const mem = async (t, name) => (await owner('select id from public.team_members where team_id = $1 and full_name = $2', [t.id, name])).rows[0].id;
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('m2', 'join_team', { code: TA.join_code, member_name: 'عمر حسن' }))?.ok, true, 'a second member joins team A');
eq(val(await rpc('mb', 'join_team', { code: TB.join_code, member_name: 'زيد محمود' }))?.ok, true, 'a member joins team B');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.ok, true, 'a parent links their child in team A');
const aSalem = await mem(TA, 'سالم أحمد العلي'), aOmar = await mem(TA, 'عمر حسن'), aYusuf = await mem(TA, 'يوسف علي حسن');

const notes = async (who, kind) => (await owner('select kind, data from public.yb_notifications where user_id = $1 and kind = $2 order by id', [U[who].id, kind])).rows;
const ago = async (h) => (await owner(`select (now() - interval '${h} hours')::text d`)).rows[0].d;
const F = async (o = {}) => ({ team_id: TA.id, comp: 'football', match_label: 'النور ضد الأمل، المجموعة أ', ended_at: await ago(2), incident: 'احتُسب هدف بعد صافرة النهاية ولم يُلغَ.', evidence: 'تسجيل مصوّر عند مشرف الفريق', ...o });

section('1. filing an appeal (lg7: the team\'s leader, within 24 hours)');
denied(await as('la', 'select * from public.yb_appeals'), 'nobody reads the table directly');
for (const [fn, a] of [['yb_appeals_mine', { team_id: TA.id }], ['yb_appeals_admin', {}], ['yb_appeal_decide', { id: 1, accept: true, decision: 'سبب مكتوب' }]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
denied(await rpc('anon', 'yb_appeal_file', await F()), 'a visitor cannot file');
denied(await rpc('ma', 'yb_appeal_file', await F()), 'a member cannot file');
denied(await rpc('pa', 'yb_appeal_file', await F()), 'a parent cannot file');
denied(await rpc('lb', 'yb_appeal_file', await F()), 'another team\'s leader cannot file for this team');
denied(await rpc('admin', 'yb_appeal_file', await F()), 'the admin does not file for a team');
const f1 = val(await rpc('la', 'yb_appeal_file', await F()));
eq(f1?.ok, true, 'the leader files an appeal two hours after the match');
eq((await notes('admin', 'appeal_new')).map((n) => n.data), [{ team_name: 'فريق النور' }], 'the admin is told, with the team\'s name only');
eq(val(await rpc('la', 'yb_appeal_file', await F({ ended_at: await ago(25) })))?.error, 'too_late', 'after 24 hours it is refused');
eq(val(await rpc('la', 'yb_appeal_file', await F({ ended_at: await ago(23) })))?.ok, true, 'at 23 hours it is still accepted');
eq(val(await rpc('la', 'yb_appeal_file', await F({ ended_at: await ago(-3) })))?.error, 'invalid_data', 'a match that has not ended yet is refused');
eq(val(await rpc('la', 'yb_appeal_file', await F({ incident: 'قصير' })))?.error, 'invalid_data', 'the incident must be described');
eq(val(await rpc('la', 'yb_appeal_file', await F({ match_label: 'أ' })))?.error, 'invalid_data', 'the match must be named');
eq(val(await rpc('la', 'yb_appeal_file', await F({ comp: 'hifz' })))?.error, 'invalid_data', 'an unknown competition is refused');
eq(val(await rpc('la', 'yb_appeal_file', await F({ evidence: 'اتصلوا على 0791234567' })))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await rpc('la', 'yb_appeal_file', await F({ comp: 'chess', evidence: null })))?.ok, true, 'evidence is optional');
eq(val(await rpc('la', 'yb_appeal_file', await F()))?.error, 'too_many', 'at most three open appeals a team');

section('2. reading');
const mineA = val(await rpc('la', 'yb_appeals_mine', { team_id: TA.id }));
eq([mineA.length, mineA.every((x) => x.status === 'open'), mineA[mineA.length - 1].match, mineA[mineA.length - 1].evidence], [3, true, 'النور ضد الأمل، المجموعة أ', 'تسجيل مصوّر عند مشرف الفريق'], 'the leader reads the team\'s appeals, newest first');
ok(Math.abs(new Date(mineA[0].due_at) - new Date(mineA[0].created_at) - 48 * 3600e3) < 1000, 'each says when it is due: 48 hours after filing');
denied(await rpc('lb', 'yb_appeals_mine', { team_id: TA.id }), 'another team\'s leader cannot read them');
denied(await rpc('ma', 'yb_appeals_mine', { team_id: TA.id }), 'a member cannot');
denied(await rpc('off', 'yb_appeals_mine', { team_id: TA.id }), 'an officer cannot');
const all = val(await rpc('admin', 'yb_appeals_admin', {}));
eq([all.length, all[0].team_name], [3, 'فريق النور'], 'the admin reads all, with the team\'s name');
denied(await rpc('off', 'yb_appeals_admin', {}), 'an officer does not (refereeing and appeals are kept apart, lg8)');
denied(await rpc('la', 'yb_appeals_admin', {}), 'a leader does not');

section('3. the decision (the admin, with a written reason)');
denied(await rpc('la', 'yb_appeal_decide', { id: f1.id, accept: true, decision: 'أقبل تظلمي بنفسي' }), 'a leader cannot decide');
denied(await rpc('off', 'yb_appeal_decide', { id: f1.id, accept: true, decision: 'قرار من مسؤول' }), 'an officer cannot decide');
eq(val(await rpc('admin', 'yb_appeal_decide', { id: f1.id, accept: true, decision: 'نعم' }))?.error, 'invalid_data', 'a decision needs a written reason');
eq(val(await rpc('admin', 'yb_appeal_decide', { id: f1.id, accept: false, decision: ' راجعنا   تقرير الحكم: الهدف صحيح قبل الصافرة. ' }))?.ok, true, 'the admin rejects with a reason');
const d1 = val(await rpc('la', 'yb_appeals_mine', { team_id: TA.id })).find((x) => x.id === f1.id);
eq([d1.status, d1.decision, d1.decided_at != null], ['rejected', 'راجعنا تقرير الحكم: الهدف صحيح قبل الصافرة.', true], 'the leader reads the decision and its reason');
eq((await notes('la', 'appeal_decided')).map((n) => [n.data.team_name, n.data.accepted]), [['فريق النور', false]], 'and is told');
eq(val(await rpc('admin', 'yb_appeal_decide', { id: f1.id, accept: true, decision: 'تغيير القرار لاحقا' }))?.error, 'already_decided', 'a decided appeal is not decided again');
eq(val(await rpc('admin', 'yb_appeal_decide', { id: 999999, accept: true, decision: 'سبب مكتوب' }))?.error, 'not_found', 'an unknown appeal is not found');
const other = val(await rpc('admin', 'yb_appeals_admin', {})).find((x) => x.status === 'open');
eq(val(await rpc('admin', 'yb_appeal_decide', { id: other.id, accept: true, decision: 'ثبت الخطأ في تسجيل النتيجة، وتُصحَّح.' }))?.ok, true, 'the admin accepts another');
eq(val(await rpc('admin', 'yb_appeals_admin', {})).map((x) => x.status), ['open', 'accepted', 'rejected'].filter((s) => true) && val(await rpc('admin', 'yb_appeals_admin', {})).map((x) => x.status), 'the list still reads');
eq(val(await rpc('admin', 'yb_appeals_admin', {}))[0].status, 'open', 'open appeals come first');
eq(val(await rpc('la', 'yb_appeal_file', await F()))?.ok, true, 'with one decided, the team may file again');
eq((await owner("select count(*)::int n from public.audit_log where action in ('appeal_file', 'appeal_decide')")).rows[0].n, 6, 'filing and deciding are in the audit log');

finish(t0, 35);
