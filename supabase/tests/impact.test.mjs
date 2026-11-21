// Yanabee backend — tests for migration 0020 (attendance at the team's weekly meeting and at the leaders' meeting,
// the parents' survey, and the numbers of the impact report). Applies 0001 -> 0020 in PGlite.
// Run:  node supabase/tests/impact.test.mjs
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
const M = readMigration('0020_yb_impact.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0020 is ASCII only');
await E.db.exec(M);
ok(true, '0020 runs twice without error (idempotent)');

const day = async (expr) => (await owner(`select to_char(${expr}, 'YYYY-MM-DD') d`)).rows[0].d;
const W = await day("current_date - ((extract(dow from current_date)::int + 1) % 7)");      // this week's Saturday
const WPREV = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 7");
const WOLD = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 28");
const WNEXT = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) + 14");   // past tomorrow on any day (on a Friday, +7 is tomorrow, which is allowed)
const SUNDAY = await day("current_date - extract(dow from current_date)::int");

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول الكرة'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['lc', 'leader', 'قائد الفجر'], ['ma', 'member', 'سالم أحمد العلي'], ['mb', 'member', 'زيد محمود'],
  ['mx', 'member', 'عضو بلا فريق'], ['pa', 'parent', 'ولي سالم'], ['pb', 'parent', 'ولي زيد'], ['px', 'parent', 'ولي بلا ابن']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
const TC = await team('lc', 'فريق الفجر');      // stays a draft
await owner("update public.teams set status = 'approved' where id = any($1)", [[TA.id, TB.id]]);
const mem = async (t, name) => (await owner('select id from public.team_members where team_id = $1 and full_name = $2', [t.id, name])).rows[0].id;
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('mb', 'join_team', { code: TB.join_code, member_name: 'زيد محمود' }))?.ok, true, 'a member joins team B');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.ok, true, 'a parent links their child in team A');
eq(val(await rpc('pb', 'link_child', { code: TB.join_code, child_name: 'زيد محمود' }))?.ok, true, 'another parent links their child in team B');
const aSalem = await mem(TA, 'سالم أحمد العلي'), aOmar = await mem(TA, 'عمر حسن'), aYusuf = await mem(TA, 'يوسف علي حسن'), bZaid = await mem(TB, 'زيد محمود');
const nA = (await owner('select count(*)::int n from public.team_members where team_id = $1', [TA.id])).rows[0].n;
const notes = async (who, kind) => (await owner('select kind, data from public.yb_notifications where user_id = $1 and kind = $2 order by id', [U[who].id, kind])).rows;

section('1. the team\'s weekly meeting');
for (const t of ['yb_meetings', 'yb_meet_present', 'yb_lead_meets', 'yb_parent_survey']) denied(await as('la', `select * from public.${t}`), `nobody reads ${t} directly`);
for (const [fn, a] of [['yb_attend_get', { team_id: TA.id, week: W }], ['yb_attend_mine', {}], ['yb_attend_board', {}], ['yb_lead_meet_get', { week: W }], ['yb_survey_mine', {}], ['yb_survey_board', {}]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
const g0 = val(await rpc('la', 'yb_attend_get', { team_id: TA.id, week: W }));
eq([g0.week, g0.saved, g0.members.length, g0.members.every((m) => m.present === false && m.came === 0), g0.history, g0.meetings, g0.lead], [W, false, nA, true, [], 0, { came: 0, held: 0 }], 'the leader opens an empty sheet with the roster');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem, aOmar, aOmar] })), { ok: true, present: 2, expected: nA }, 'the leader ticks who came; a repeated name counts once');
const g1 = val(await rpc('la', 'yb_attend_get', { team_id: TA.id, week: W }));
eq([g1.saved, g1.members.filter((m) => m.present).map((m) => m.name).sort(), g1.history, g1.present, g1.expected], [true, ['سالم أحمد العلي', 'عمر حسن'].sort(), [{ week: W, present: 2, expected: nA }], 2, nA], 'it reads back: who came, and the week in the history');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem, aOmar, aYusuf] }))?.present, 3, 'saving again replaces the week');
eq((await owner('select count(*)::int n from public.yb_meet_present where team_id = $1 and week = $2', [TA.id, W])).rows[0].n, 3, 'three rows, not five');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: WPREV, present_ids: [aSalem] }))?.ok, true, 'last week can still be written');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: WOLD, present_ids: [aSalem] }))?.error, 'invalid_data', 'a month ago cannot');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: WNEXT, present_ids: [aSalem] }))?.error, 'invalid_data', 'nor next week');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: SUNDAY, present_ids: [aSalem] }))?.error, 'invalid_data', 'a week starts on a Saturday');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem, bZaid] }))?.error, 'invalid_data', 'a member of another team cannot be ticked');
eq(val(await rpc('lc', 'yb_attend_save', { team_id: TC.id, week: W, present_ids: [await mem(TC, 'عمر حسن')] }))?.error, 'team_not_approved', 'a team that is not approved yet records nothing');
denied(await rpc('lb', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem] }), 'another team\'s leader cannot write here');
denied(await rpc('ma', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem] }), 'a member cannot tick themselves');
denied(await rpc('admin', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem] }), 'the admin does not write a team\'s sheet');
denied(await rpc('ma', 'yb_attend_get', { team_id: TA.id, week: W }), 'a member does not read the sheet');
denied(await rpc('pa', 'yb_attend_get', { team_id: TA.id, week: W }), 'nor a parent');
denied(await rpc('off', 'yb_attend_get', { team_id: TA.id, week: W }), 'nor an officer');
eq(val(await rpc('admin', 'yb_attend_get', { team_id: TA.id, week: W })).members.length, nA, 'the admin reads it');
const g2 = val(await rpc('la', 'yb_attend_get', { team_id: TA.id, week: W }));
eq([g2.meetings, g2.present, g2.expected, g2.history.map((x) => x.week), g2.members.find((m) => m.member_id === aSalem).came, g2.members.find((m) => m.member_id === aYusuf).came], [2, 4, 2 * nA, [W, WPREV], 2, 1], 'two meetings: totals, newest first, and each member\'s count');

section('a member\'s own count, and a parent\'s child');
eq(val(await rpc('ma', 'yb_attend_mine', {})), { me: { came: 2, held: 2 }, children: [] }, 'the member reads: came to 2 of 2');
const pm = val(await rpc('pa', 'yb_attend_mine', {}));
eq([pm.me, pm.children.length, pm.children[0].name, pm.children[0].held, pm.children[0].came], [null, 1, 'سالم أحمد العلي', 2, 2], 'the parent reads their child\'s count');
eq(val(await rpc('mb', 'yb_attend_mine', {})), { me: { came: 0, held: 0 }, children: [] }, 'a member of a team that recorded nothing reads zeros');
eq(val(await rpc('mx', 'yb_attend_mine', {})), { me: null, children: [] }, 'someone without a team reads nothing');
ok(!/عمر|يوسف/.test(JSON.stringify(pm)), 'the parent sees no other child');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: WPREV, present_ids: [] })), { ok: true, cleared: true }, 'saving with nobody ticked removes the week (no meeting was held)');
eq([val(await rpc('la', 'yb_attend_get', { team_id: TA.id, week: WPREV })).saved, val(await rpc('ma', 'yb_attend_mine', {})).me], [false, { came: 1, held: 1 }], 'and the counts follow');

section('the leaders\' weekly meeting (the admin)');
const l0 = val(await rpc('admin', 'yb_lead_meet_get', { week: W }));
eq([l0.saved, l0.teams.map((t) => t.team_name), l0.teams[0].leader, l0.teams.every((t) => !t.present && t.held === 0)], [false, ['فريق الأمل', 'فريق النور'], 'قائد الأمل', true], 'the admin opens the sheet: the approved teams and their leaders');
eq(val(await rpc('admin', 'yb_lead_meet_save', { week: W, team_ids: [TA.id] })), { ok: true, present: 1, expected: 2 }, 'the admin ticks the leaders who came');
eq(val(await rpc('admin', 'yb_lead_meet_save', { week: WPREV, team_ids: [TA.id, TB.id] }))?.ok, true, 'and last week\'s meeting');
eq(val(await rpc('admin', 'yb_lead_meet_save', { week: W, team_ids: [TC.id] }))?.error, 'invalid_data', 'a team that is not approved cannot be ticked');
eq(val(await rpc('admin', 'yb_lead_meet_save', { week: WOLD, team_ids: [TA.id] }))?.error, 'invalid_data', 'an old week is refused');
denied(await rpc('la', 'yb_lead_meet_save', { week: W, team_ids: [TA.id] }), 'a leader cannot tick themselves');
denied(await rpc('off', 'yb_lead_meet_save', { week: W, team_ids: [TA.id] }), 'nor an officer');
denied(await rpc('la', 'yb_lead_meet_get', { week: W }), 'a leader does not read the sheet');
const l1 = val(await rpc('admin', 'yb_lead_meet_get', { week: W }));
eq([l1.saved, l1.teams.map((t) => [t.present, t.held, t.came])], [true, [[false, 2, 1], [true, 2, 2]]], 'it reads back with each leader\'s count');
eq([val(await rpc('la', 'yb_attend_get', { team_id: TA.id, week: W })).lead, val(await rpc('lb', 'yb_attend_get', { team_id: TB.id, week: W })).lead], [{ came: 2, held: 2 }, { came: 1, held: 2 }], 'each leader reads their own count in their sheet');

section('the admin\'s board');
await owner("insert into public.yb_events (id, competition, kind, title, starts_at, team_ids) values ('00000000-0000-4000-8000-0000000000e1', 'football', 'match', 'النور ضد الأمل', now() - interval '1 day', $1)", [[TA.id, TB.id]]);
await owner("insert into public.yb_attendance (event_id, team_id, presence) values ('00000000-0000-4000-8000-0000000000e1', $1, 'present'), ('00000000-0000-4000-8000-0000000000e1', $2, 'absent')", [TA.id, TB.id]);
denied(await rpc('la', 'yb_attend_board', {}), 'a leader does not read the board');
denied(await rpc('off', 'yb_attend_board', {}), 'nor an officer');
const bd = val(await rpc('admin', 'yb_attend_board', {}));
const bA = bd.teams.find((t) => t.team_id === TA.id), bB = bd.teams.find((t) => t.team_id === TB.id);
eq([bd.lead_meets, bd.teams.length, bA.members, bA.meetings, bA.present, bA.expected, bA.last_week, bA.recent, bA.lead_held, bA.lead_came, bA.match_marked, bA.match_present],
  [2, 2, nA, 1, 3, nA, W, 3, 2, 2, 1, 1], 'team A: one meeting, 3 of the roster, the leader at both meetings, present at its match');
eq([bB.meetings, bB.present, bB.expected, bB.last_week, bB.recent, bB.lead_came, bB.match_marked, bB.match_present], [0, 0, 0, null, 0, 1, 1, 0], 'team B recorded nothing; its leader came once; it missed its match');
ok(!/سالم|عمر|يوسف|زيد/.test(JSON.stringify(bd)), 'no child is named on the board');
eq(val(await rpc('admin', 'yb_lead_meet_save', { week: WPREV, team_ids: [] })), { ok: true, cleared: true }, 'the admin removes a meeting that was not held');
eq(val(await rpc('admin', 'yb_attend_board', {})).lead_meets, 1, 'and the board follows');

section('2. the parents\' survey');
eq(val(await rpc('pa', 'yb_survey_mine', {})), { open: false, answer: null, eligible: true }, 'a linked parent: the survey is closed');
eq(val(await rpc('px', 'yb_survey_mine', {})).eligible, false, 'a parent without a linked child is not asked');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 5, q2: 4, q3: 5 }))?.error, 'survey_closed', 'nothing is saved while it is closed');
denied(await rpc('la', 'yb_survey_open', { open: true }), 'a leader cannot open it');
denied(await rpc('off', 'yb_survey_open', { open: true }), 'nor an officer');
eq(val(await rpc('admin', 'yb_survey_open', { open: true })), { ok: true, open: true }, 'the admin opens it');
eq([(await notes('pa', 'survey_open')).length, (await notes('pb', 'survey_open')).length, (await notes('px', 'survey_open')).length, (await notes('la', 'survey_open')).length], [1, 1, 0, 0], 'every parent with a linked child is told, nobody else');
await rpc('admin', 'yb_survey_open', { open: true });
eq((await notes('pa', 'survey_open')).length, 1, 'opening what is open tells nobody again');
eq(val(await rpc('pa', 'yb_survey_mine', {})).open, true, 'the parent sees it open');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 5, q2: 4, q3: 5, note: '  ابني صار   يحافظ على وعده. ' }))?.ok, true, 'the parent answers');
eq(val(await rpc('pa', 'yb_survey_mine', {})).answer, { q1: 5, q2: 4, q3: 5, note: 'ابني صار يحافظ على وعده.' }, 'and reads the answer back, trimmed');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 4, q2: 4, q3: 4, note: null }))?.ok, true, 'answering again replaces it');
eq((await owner('select count(*)::int n from public.yb_parent_survey')).rows[0].n, 1, 'one answer per parent');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 0, q2: 4, q3: 4 }))?.error, 'invalid_data', 'below 1 is refused');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 6, q2: 4, q3: 4 }))?.error, 'invalid_data', 'above 5 is refused');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 4, q2: null, q3: 4 }))?.error, 'invalid_data', 'all three questions are needed');
eq(val(await rpc('pa', 'yb_survey_save', { q1: 4, q2: 4, q3: 4, note: 'اتصلوا بي 0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
denied(await rpc('px', 'yb_survey_save', { q1: 5, q2: 5, q3: 5 }), 'a parent without a linked child cannot answer');
denied(await rpc('la', 'yb_survey_save', { q1: 5, q2: 5, q3: 5 }), 'nor a leader');
eq(val(await rpc('pb', 'yb_survey_save', { q1: 3, q2: 2, q3: 3, note: 'نتمنى مواعيد أنسب للقاءات.' }))?.ok, true, 'a second parent answers');
denied(await rpc('pa', 'yb_survey_board', {}), 'a parent does not read the results');
denied(await rpc('la', 'yb_survey_board', {}), 'nor a leader');
denied(await rpc('off', 'yb_survey_board', {}), 'nor an officer');
const sb = val(await rpc('admin', 'yb_survey_board', {}));
eq([sb.open, sb.parents, sb.answers, sb.satisfied, sb.avg, sb.notes], [true, 2, 2, 1, [3.5, 3, 3.5], ['نتمنى مواعيد أنسب للقاءات.']], 'the admin reads: how many answered, how many are satisfied, the averages, the lines');
ok(!/ولي|سالم|زيد/.test(JSON.stringify(sb)), 'and never who wrote them');
eq(val(await rpc('admin', 'yb_survey_open', { open: false })), { ok: true, open: false }, 'the admin closes it');
eq([val(await rpc('pb', 'yb_survey_save', { q1: 5, q2: 5, q3: 5 }))?.error, val(await rpc('pb', 'yb_survey_mine', {})).answer.q3], ['survey_closed', 3], 'a closed survey keeps the answers and takes no more');
await rpc('admin', 'yb_survey_open', { open: true });
eq((await notes('pa', 'survey_open')).length, 2, 'opening it again tells the parents again');
eq((await owner("select count(*)::int n from public.audit_log where action = 'survey_open'")).rows[0].n, 4, 'each opening and closing is in the audit log');
eq((await owner("select public.yb_note_group('survey_open') g")).rows[0].g, 'announcements', 'the notice goes with the announcements');

section('4. the judge\'s oath');
eq(val(await rpc('pa', 'yb_judge_oath_mine', {})), { judge: false, sworn_at: null }, 'someone who is not a judge has no oath to give');
denied(await rpc('pa', 'yb_judge_oath_take', {}), 'and cannot give it');
denied(await rpc('anon', 'yb_judge_oath_mine', {}), 'a visitor cannot ask');
eq(val(await rpc('admin', 'yb_set_judge', { target: U.pa.id, axes: ['hifz', 'fahm'] }))?.ok, true, 'the admin names a parent as a judge');
eq(val(await rpc('pa', 'yb_judge_oath_mine', {})), { judge: true, sworn_at: null }, 'the judge has not given their word yet');
const o1 = val(await rpc('pa', 'yb_judge_oath_take', {}));
eq([o1?.ok, typeof o1?.sworn_at], [true, 'string'], 'the judge gives their word');
eq(val(await rpc('pa', 'yb_judge_oath_take', {})).sworn_at, o1.sworn_at, 'giving it again changes nothing');
eq(val(await rpc('pa', 'yb_judge_oath_mine', {})).sworn_at, o1.sworn_at, 'and reads it back');
eq((await owner("select count(*)::int n from public.audit_log where action = 'judge_oath'")).rows[0].n, 1, 'it is in the audit log once');
denied(await rpc('pa', 'yb_judge_oaths', {}), 'a judge does not read who else gave it');
denied(await rpc('la', 'yb_judge_oaths', {}), 'nor a leader');
eq(val(await rpc('admin', 'yb_judge_oaths', {})).map((x) => x.user_id), [U.pa.id], 'the admin reads who gave their word');
denied(await as('pa', 'select * from public.yb_judge_oaths'), 'nobody reads the table directly');

finish(t0, 90);
