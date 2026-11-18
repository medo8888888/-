// Yanabee backend — tests for migration 0019 (the match's people, the record of injuries, the leader's notebook and
// the weekly leadership review). Applies 0001 -> 0014 and 0019 in PGlite.
// Run:  node supabase/tests/match-care.test.mjs
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
const M = readMigration('0019_yb_match_care.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0019 is ASCII only');
await E.db.exec(M);
ok(true, '0019 runs twice without error (idempotent)');

const day = async (expr) => (await owner(`select to_char(${expr}, 'YYYY-MM-DD') d`)).rows[0].d;
const today = await day('current_date');
const W = await day("current_date - ((extract(dow from current_date)::int + 1) % 7)");      // this week's Saturday
const WPREV = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 7");
const WOLD = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 21");
const WNEXT = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) + 7");
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
await signUp('oh', Y('member', 'مسؤول الحفظ'));
await rpc('admin', 'set_user_role', { target: U.oh.id, new_role: 'officer' });
eq(val(await rpc('admin', 'yb_set_officer', { target: U.off.id, competition: 'football', assign: true }))?.ok, true, 'a football officer is named');
eq(val(await rpc('admin', 'yb_set_officer', { target: U.oh.id, competition: 'hifz', assign: true }))?.ok, true, 'and a memorisation officer');
const EV = (await owner("insert into public.yb_events (competition, kind, title, starts_at, team_ids) values ('football', 'match', 'النور ضد الأمل', now() + interval '1 day', $1) returning id", [[TA.id]])).rows[0].id;

section('1. the match\'s people (lg3, lg5, lg8)');
for (const t of ['yb_event_staff', 'yb_incidents', 'yb_lead_notes']) denied(await as('la', `select * from public.${t}`), `nobody reads ${t} directly`);
for (const [fn, a] of [['yb_event_staff_list', {}], ['yb_incidents_list', {}], ['yb_notebook_mine', { team_id: TA.id }], ['yb_notebook_admin', { week: W }]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
eq(val(await rpc('la', 'yb_event_staff_list', {})), [], 'no referee named yet');
eq(val(await rpc('admin', 'yb_event_staff_set', { event_id: EV, referee: '  الأستاذ   خالد ', safety: 'الأستاذ سامر', first_aid: true }))?.ok, true, 'the admin names the referee and the adult in charge of safety');
const st = val(await rpc('la', 'yb_event_staff_list', {}));
eq([st.length, st[0].event_id, st[0].referee, st[0].safety, st[0].first_aid], [1, EV, 'الأستاذ خالد', 'الأستاذ سامر', true], 'the team\'s leader reads them, trimmed');
eq(val(await rpc('ma', 'yb_event_staff_list', {})).length, 1, 'a joined member reads them');
eq(val(await rpc('pa', 'yb_event_staff_list', {})).length, 1, 'a linked parent reads them');
eq(val(await rpc('lb', 'yb_event_staff_list', {})).length, 0, 'a team that does not play in it does not');
eq(val(await rpc('oh', 'yb_event_staff_list', {})).length, 1, 'staff read all');
eq(val(await rpc('off', 'yb_event_staff_set', { event_id: EV, referee: 'الأستاذ ماهر' }))?.ok, true, 'the football officer can change the referee');
eq(val(await rpc('la', 'yb_event_staff_list', {}))[0].safety, null, 'what is left empty is cleared');
denied(await rpc('oh', 'yb_event_staff_set', { event_id: EV, referee: 'غيره' }), 'an officer of another competition cannot');
denied(await rpc('la', 'yb_event_staff_set', { event_id: EV, referee: 'أنا' }), 'a leader cannot');
eq(val(await rpc('admin', 'yb_event_staff_set', { event_id: EV, referee: '0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await rpc('admin', 'yb_event_staff_set', { event_id: TA.id, referee: 'حكم' }))?.error, 'not_found', 'an unknown event is not found');

section('2. injuries and emergencies (lg5)');
const I = async (o = {}) => ({ match_label: 'النور ضد الأمل', kind: 'injury', happened_at: await ago(1), summary: 'التواء في الكاحل بعد التحام على الكرة.', team_id: TA.id, action: 'كمادة ثلج وراحة', returned: true, ...o });
const i1 = val(await rpc('off', 'yb_incident_add', await I()));
eq(i1?.ok, true, 'the football officer records an injury');
eq((await notes('admin', 'incident_new')).map((n) => n.data), [{ kind: 'injury' }], 'the admin is told, with the kind only');
eq(val(await rpc('off', 'yb_incident_add', await I({ kind: 'head', returned: true })))?.error, 'head_no_return', 'a suspected head injury cannot be recorded as "returned to play"');
eq(val(await rpc('admin', 'yb_incident_add', await I({ kind: 'head', returned: false, summary: 'اصطدام بالرأس واشتباه ارتجاج.' })))?.ok, true, 'recorded as not returning, it is saved');
eq((await notes('admin', 'incident_new')).length, 1, 'the admin is not notified of their own record');
eq(val(await rpc('admin', 'yb_incident_add', await I({ summary: 'قصير' })))?.error, 'invalid_data', 'the incident must be described');
eq(val(await rpc('admin', 'yb_incident_add', await I({ happened_at: await ago(-5) })))?.error, 'invalid_data', 'a future time is refused');
eq(val(await rpc('admin', 'yb_incident_add', await I({ summary: 'اتصلوا بولي الأمر 0791234567' })))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await rpc('admin', 'yb_incident_add', await I({ team_id: null, kind: 'emergency', summary: 'انقطاع الإضاءة في الملعب.' })))?.ok, true, 'an emergency without a team is fine');
denied(await rpc('la', 'yb_incident_add', await I()), 'a leader cannot record');
denied(await rpc('oh', 'yb_incident_add', await I()), 'an officer of another competition cannot');
const lo = val(await rpc('off', 'yb_incidents_list', {}));
eq([lo.can_decide, lo.rows.length, lo.rows.find((x) => x.id === i1.id).team_name, lo.rows.every((x) => x.decision === 'pending')], [false, 3, 'فريق النور', true], 'the officer reads the record; deciding is not theirs');
eq(val(await rpc('admin', 'yb_incidents_list', {})).can_decide, true, 'the admin may decide');
denied(await rpc('la', 'yb_incidents_list', {}), 'a leader does not read the record');
denied(await rpc('ma', 'yb_incidents_list', {}), 'nor a member');
denied(await rpc('off', 'yb_incident_decide', { id: i1.id, decision: 'replay' }), 'an officer cannot decide');
eq(val(await rpc('admin', 'yb_incident_decide', { id: i1.id, decision: 'cancel' }))?.error, 'invalid_data', 'an unknown decision is refused');
eq(val(await rpc('admin', 'yb_incident_decide', { id: i1.id, decision: 'replay', note: 'تُعاد المباراة يوم الجمعة.' }))?.ok, true, 'the committee decides a replay');
const d1 = val(await rpc('off', 'yb_incidents_list', {})).rows.find((x) => x.id === i1.id);
eq([d1.decision, d1.decision_note], ['replay', 'تُعاد المباراة يوم الجمعة.'], 'the officer reads the decision');
eq(val(await rpc('admin', 'yb_incident_decide', { id: 999999, decision: 'none' }))?.error, 'not_found', 'an unknown record is not found');
ok(!/سالم|عمر|يوسف/.test(JSON.stringify(lo)), 'no child is named in the record');

section('3. the leader\'s notebook and the weekly review (l-notebook, l-review)');
const N = { team_id: TA.id, week: W, task: ' إدارة   فقرة النشاط العملي ', role_done: 'شرحت اللعبة ووزعت الأدوار', skill: 'ضبط الوقت', challenge: 'تأخر عضوين', next_step: 'أبدأ بالتذكير قبل اللقاء بيوم' };
eq(val(await rpc('la', 'yb_notebook_mine', { team_id: TA.id })), [], 'an empty notebook');
eq(val(await rpc('la', 'yb_notebook_save', N))?.ok, true, 'the leader writes this week\'s page');
const p1 = val(await rpc('la', 'yb_notebook_mine', { team_id: TA.id }))[0];
eq([p1.week, p1.task, p1.skill, p1.sup_note, p1.scores, p1.total, p1.written], [W, 'إدارة فقرة النشاط العملي', 'ضبط الوقت', null, null, null, true], 'it reads back trimmed, not reviewed yet');
eq(val(await rpc('la', 'yb_notebook_save', { ...N, skill: 'ضبط الوقت والهدوء' }))?.ok, true, 'saving again replaces the page');
eq((await owner('select count(*)::int n from public.yb_lead_notes where team_id = $1', [TA.id])).rows[0].n, 1, 'one page a week');
eq(val(await rpc('la', 'yb_notebook_save', { ...N, task: 'ق' }))?.error, 'invalid_data', 'the task must be written');
eq(val(await rpc('la', 'yb_notebook_save', { ...N, week: WOLD }))?.error, 'invalid_data', 'an old week is refused');
eq(val(await rpc('la', 'yb_notebook_save', { ...N, challenge: 'هاتفه 0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
denied(await rpc('lb', 'yb_notebook_save', N), 'another team\'s leader cannot write here');
denied(await rpc('ma', 'yb_notebook_save', N), 'a member cannot');
denied(await rpc('ma', 'yb_notebook_mine', { team_id: TA.id }), 'nor read the leader\'s notebook');
denied(await rpc('pa', 'yb_notebook_mine', { team_id: TA.id }), 'nor a parent');
denied(await rpc('off', 'yb_notebook_admin', { week: W }), 'an officer does not read the notebooks');
const ad = val(await rpc('admin', 'yb_notebook_admin', { week: W }));
eq([ad.length, ad.find((x) => x.team_id === TA.id).leader, ad.find((x) => x.team_id === TA.id).page.skill, ad.find((x) => x.team_id === TB.id).page], [2, 'قائد النور', 'ضبط الوقت والهدوء', null], 'the supervisor reads every approved team\'s page; a team that wrote nothing shows none');
denied(await rpc('la', 'yb_notebook_review', { team_id: TA.id, week: W, note: 'ممتاز', c1: 25, c2: 25, c3: 25, c4: 25 }), 'a leader cannot rate themselves');
eq(val(await rpc('admin', 'yb_notebook_review', { team_id: TA.id, week: W, note: 'تقدّم واضح', c1: 26, c2: 20, c3: 20, c4: 20 }))?.error, 'invalid_data', 'a criterion is out of 25');
eq(val(await rpc('admin', 'yb_notebook_review', { team_id: TA.id, week: W, note: 'تقدّم واضح', c1: 20, c2: null, c3: 20, c4: 20 }))?.error, 'invalid_data', 'all four criteria are needed');
eq(val(await rpc('admin', 'yb_notebook_review', { team_id: TA.id, week: W, note: ' تقدّم واضح في   إدارة الوقت. ', c1: 22, c2: 20, c3: 18, c4: 25 }))?.ok, true, 'the supervisor rates the four criteria and adds a note');
const p2 = val(await rpc('la', 'yb_notebook_mine', { team_id: TA.id }))[0];
eq([p2.sup_note, p2.scores, p2.total, p2.task], ['تقدّم واضح في إدارة الوقت.', [22, 20, 18, 25], 85, 'إدارة فقرة النشاط العملي'], 'the leader reads the note, the four scores and the total out of 100; the page is untouched');
eq((await notes('la', 'lead_review')).map((n) => n.data), [{ total: 85 }], 'and is told once');
await rpc('admin', 'yb_notebook_review', { team_id: TA.id, week: W, note: 'تعديل', c1: 25, c2: 20, c3: 18, c4: 25 });
eq((await notes('la', 'lead_review')).length, 1, 'correcting the review tells nobody again');
await rpc('la', 'yb_notebook_save', N);
eq(val(await rpc('la', 'yb_notebook_mine', { team_id: TA.id }))[0].total, 88, 'rewriting the page keeps the review');
eq(val(await rpc('admin', 'yb_notebook_review', { team_id: TB.id, week: W, note: null, c1: 10, c2: 10, c3: 10, c4: 10 }))?.ok, true, 'a team that wrote nothing can still be reviewed (the meeting happened)');
eq([val(await rpc('lb', 'yb_notebook_mine', { team_id: TB.id }))[0].written, val(await rpc('lb', 'yb_notebook_mine', { team_id: TB.id }))[0].total], [false, 40], 'its page reads as not written, with the review');

finish(t0, 60);
