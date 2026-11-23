// Yanabee backend — tests for migration 0023 (honours, certificates, the ceremony, the parent's week, the partner's
// report). Applies 0001 -> 0023 in PGlite.
// Run:  node supabase/tests/closing.test.mjs
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
const M = readMigration('0023_yb_closing.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql', '0021_yb_privacy.sql', '0022_yb_notice_ack.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0023 is ASCII only');
await E.db.exec(M);
ok(true, '0023 runs twice without error (idempotent)');

const day = async (expr) => (await owner(`select to_char(${expr}, 'YYYY-MM-DD') d`)).rows[0].d;
const W = await day("current_date - ((extract(dow from current_date)::int + 1) % 7)");      // this week's Saturday
const WPREV = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 7");
const WOLD = await day("current_date - ((extract(dow from current_date)::int + 1) % 7) - 70");
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
const aSalem = await mem(TA, 'سالم أحمد العلي'), aOmar = await mem(TA, 'عمر حسن'), bZaid = await mem(TB, 'زيد محمود'), cOmar = await mem(TC, 'عمر حسن');
const notes = async (who, kind) => (await owner('select kind, data from public.yb_notifications where user_id = $1 and kind = $2 order by id', [U[who].id, kind])).rows;

// what the season recorded for Salem (team A): two meetings (came to both), two promises (one kept), 3 ayahs, 3 days
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: WPREV, present_ids: [aSalem, aOmar] }))?.ok, true, 'the leader records last week\'s meeting');
eq(val(await rpc('la', 'yb_attend_save', { team_id: TA.id, week: W, present_ids: [aSalem] }))?.ok, true, 'and this week\'s');
await owner(`insert into public.yb_pledges (user_id, team_id, week, field, body, done, done_at, parent_note) values
  ($1, $2, $3, 'home', 'أساعد أمي في البيت', true, now(), 'أحسنت يا بني'), ($1, $2, $4, 'hood', 'أسلّم على الجيران', false, null, null)`, [U.ma.id, TA.id, W, WPREV]);
await owner('insert into public.yb_hifz_marks (user_id, ayahs) values ($1, $2)', [U.ma.id, [1, 2, 3]]);
await owner('insert into public.yb_deed_days (user_id, day) values ($1, $2::date), ($1, $2::date + 1), ($1, $3::date)', [U.ma.id, W, WPREV]);
await owner('insert into public.yb_week_themes (week, title, body) values ($1, $2, $3)', [W, 'الصدق', 'نصدق في القول والعمل']);
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'hifz', member_id: aSalem }))?.ok, true, 'an encouragement award this week (0017)');

const FNS = [['yb_honour_give', { kind: 'trip', team_id: TA.id, member_id: aSalem, reason: 'حضر كل اللقاءات' }], ['yb_honour_remove', { id: 1 }], ['yb_honours_board', {}],
  ['yb_honours_announce', { announce: true }], ['yb_honours_suggest', {}], ['yb_my_honours', {}], ['yb_cert_list', {}], ['yb_ceremony', {}],
  ['yb_parent_week', { week: W }], ['yb_team_report', { team_id: TA.id }]];

section('closed to visitors; the table is closed');
for (const [fn, a] of FNS) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
denied(await as('admin', 'select * from public.yb_honours'), 'nobody reads yb_honours directly, the admin included');
for (const fn of ['yb_in_play', 'yb_honours_announced']) denied(await as('la', `select public.${fn}(${fn === 'yb_in_play' ? `'${TA.id}'` : ''})`), `${fn} is internal`);

section('1. honours: the admin gives them, with a reason');
for (const who of ['la', 'ma', 'pa', 'off']) {
  denied(await rpc(who, 'yb_honour_give', FNS[0][1]), `${who} cannot give an honour`);
  denied(await rpc(who, 'yb_honours_board', {}), `${who} cannot read the honours board`);
  denied(await rpc(who, 'yb_honours_suggest', {}), `${who} cannot read the suggestions`);
  denied(await rpc(who, 'yb_honours_announce', { announce: true }), `${who} cannot announce`);
  denied(await rpc(who, 'yb_ceremony', {}), `${who} cannot open the ceremony`);
}
eq(val(await rpc('admin', 'yb_honours_announce', { announce: true }))?.error, 'nothing_to_announce', 'nothing to announce before the first honour');
const g1 = val(await rpc('admin', 'yb_honour_give', { kind: 'medal', axis: 'hifz', team_id: TA.id, member_id: aSalem, reason: '  حفظ   الآيات  كاملة ' }));
eq(g1?.ok, true, 'a medal of memorisation for Salem');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TA.id, member_id: aSalem, reason: 'حضر كل اللقاءات ووفّى بوعده' }))?.ok, true, 'and the trip of the outstanding');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'leader', team_id: TA.id, member_id: aOmar, reason: 'قاد فريقه بانضباط وتعاون' }))?.ok, true, 'the outstanding leader of team A (a member id given is ignored)');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'medal', axis: 'taawun', team_id: TB.id, member_id: bZaid, reason: 'تعاون مع زملائه' }))?.ok, true, 'a medal of cooperation in team B');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'medal', axis: 'hifz', team_id: TA.id, member_id: aSalem, reason: 'مرة ثانية' }))?.error, 'already_given', 'the same honour twice is refused');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'leader', team_id: TA.id, reason: 'مرة ثانية' }))?.error, 'already_given', 'one leader honour per team');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'medal', team_id: TA.id, member_id: aOmar, reason: 'بلا محور' }))?.error, 'invalid_data', 'a medal needs its axis');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'medal', axis: 'football', team_id: TA.id, member_id: aOmar, reason: 'محور غير موجود' }))?.error, 'invalid_data', 'the axis is one of the five in the document');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'cup', team_id: TA.id, member_id: aOmar, reason: 'نوع غير موجود' }))?.error, 'invalid_data', 'the kind is trip, medal or leader');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TA.id, member_id: aOmar, reason: 'لا' }))?.error, 'invalid_data', 'a reason of a few words is required');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TA.id, reason: 'بلا عضو' }))?.error, 'member_not_found', 'a trip names a member');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TA.id, member_id: bZaid, reason: 'من فريق آخر' }))?.error, 'member_not_found', 'a member of another team is refused');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TC.id, member_id: cOmar, reason: 'فريق مسودة' }))?.error, 'team_not_found', 'a team not in play gets none');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'trip', team_id: TA.id, member_id: aOmar, reason: 'اتصلوا على 0530123456' }))?.error, 'contact_not_allowed', 'no phone number in a reason');
const b1 = val(await rpc('admin', 'yb_honours_board', {}));
eq([b1.announced, b1.honours.length], [false, 4], 'the board: four honours, not announced');
const lead = b1.honours.find((h) => h.kind === 'leader');
eq([lead.name, lead.member_id, lead.team_name], ['قائد النور', null, 'فريق النور'], 'the leader honour names the team\'s leader');
eq(b1.honours.find((h) => h.axis === 'hifz').reason, 'حفظ الآيات كاملة', 'the reason is tidied');
eq((await owner("select count(*)::int n from public.audit_log where action = 'honour_give'")).rows[0].n, 4, 'each one is in the audit log');
eq((await notes('ma', 'honour')).length, 0, 'nobody is told before the announcement');

section('the numbers behind a choice');
const s1 = val(await rpc('admin', 'yb_honours_suggest', {}));
const sS = s1.members.find((m) => m.member_id === aSalem);
eq([sS.name, sS.team_name, sS.joined, sS.held, sS.came, sS.pledges, sS.kept, sS.hifz, sS.deed_days, sS.awards], ['سالم أحمد العلي', 'فريق النور', true, 2, 2, 2, 1, 3, 3, { hifz: 1 }], 'Salem: 2 of 2 meetings, 1 of 2 promises kept, 3 ayahs, 3 days, 1 award');
const sO = s1.members.find((m) => m.member_id === aOmar);
eq([sO.joined, sO.came, sO.pledges, sO.hifz], [false, 1, 0, 0], 'Omar has no account: attendance only');
ok(!s1.members.some((m) => m.team_id === TC.id), 'a draft team\'s members are not suggested');
eq(s1.leaders.map((l) => l.team_name).sort(), ['فريق الأمل', 'فريق النور'].sort(), 'one row per leader of a team in play');
const lA = s1.leaders.find((l) => l.team_id === TA.id);
eq([lA.name, lA.meetings, lA.present, lA.expected, lA.notes, lA.projects], ['قائد النور', 2, 3, 10, 0, 0], 'team A\'s leader: 2 meetings, 3 of 10 present (the leader is on the roster too)');

section('2. certificates: whom each may print for (before results and honours are out)');
const cAd = val(await rpc('admin', 'yb_cert_list', {}));
eq([cAd.people.length, cAd.teams.length, cAd.honours.length, cAd.published, cAd.announced], [10, 2, 4, false, false], 'the admin: the 10 people (5 a team, leader included) of the 2 teams in play, places and honours always');
ok(!cAd.people.some((p) => p.team_id === TC.id), 'the draft team is not there');
const cLa = val(await rpc('la', 'yb_cert_list', {}));
eq([cLa.people.length, cLa.people.every((p) => p.team_id === TA.id), cLa.teams, cLa.honours], [5, true, [], []], 'a leader: their team\'s 5; no place before publication; no honour before the announcement');
const cPa = val(await rpc('pa', 'yb_cert_list', {}));
eq(cPa.people.map((p) => p.name), ['سالم أحمد العلي'], 'a parent: their own child only');
eq(val(await rpc('ma', 'yb_cert_list', {})).people.map((p) => p.member_id), [aSalem], 'a member: themselves');
eq(val(await rpc('mx', 'yb_cert_list', {})).people, [], 'someone without a team: nobody');
eq(val(await rpc('lc', 'yb_cert_list', {})).people, [], 'the leader of a draft team: nobody yet');

section('the announcement');
eq(val(await rpc('ma', 'yb_my_honours', {})), { honours: [], announced: false }, 'before it, a member reads nothing');
eq(val(await rpc('admin', 'yb_honours_announce', { announce: true })), { ok: true, announced: true }, 'the admin announces');
eq((await notes('ma', 'honours_announced')).length, 1, 'everyone is told once');
eq((await notes('admin', 'honours_announced')).length, 0, 'but the admin');
await rpc('admin', 'yb_honours_announce', { announce: true });
eq((await notes('ma', 'honours_announced')).length, 1, 'announcing again does not tell again');
const hMa = val(await rpc('ma', 'yb_my_honours', {}));
eq([hMa.announced, hMa.honours.length, hMa.honours.every((h) => h.team_name === 'فريق النور')], [true, 3, true], 'Salem reads his team\'s three honours');
eq(hMa.honours.filter((h) => h.mine).map((h) => h.kind).sort(), ['medal', 'trip'], 'his own two are marked his');
eq(hMa.honours.find((h) => h.kind === 'leader').name, 'قائد', 'a name is the first name only');
ok(!JSON.stringify(hMa).includes('سالم أحمد العلي') && !JSON.stringify(hMa).includes('reason'), 'no full name and no reason');
eq(val(await rpc('pa', 'yb_my_honours', {})).honours.filter((h) => h.mine).length, 2, 'his parent sees them as their child\'s');
eq(val(await rpc('la', 'yb_my_honours', {})).honours.filter((h) => h.mine).map((h) => h.kind), ['leader'], 'the leader sees his own');
const hMb = val(await rpc('mb', 'yb_my_honours', {}));
eq(hMb.honours.map((h) => [h.team_name, h.axis]), [['فريق الأمل', 'taawun']], 'team B reads only team B');
eq(val(await rpc('mx', 'yb_my_honours', {})).honours, [], 'someone without a team reads nothing');
eq(val(await rpc('admin', 'yb_honour_give', { kind: 'medal', axis: 'mubadara', team_id: TA.id, member_id: aOmar, reason: 'بادر بفكرة المشروع' }))?.ok, true, 'an honour given after the announcement');
eq((await notes('la', 'honour')).map((x) => x.data.axis), ['mubadara'], 'tells the team\'s people at once');
eq((await notes('mb', 'honour')).length, 0, 'and not another team');
eq(val(await rpc('la', 'yb_cert_list', {})).honours.length, 4, 'now the leader may print his team\'s honours');
eq(val(await rpc('pa', 'yb_cert_list', {})).honours.map((h) => h.kind).sort(), ['medal', 'trip'], 'the parent their child\'s two');
eq(val(await rpc('lb', 'yb_cert_list', {})).honours.map((h) => h.axis), ['taawun'], 'team B\'s leader only team B\'s');
const omarH = val(await rpc('admin', 'yb_honours_board', {})).honours.find((h) => h.axis === 'mubadara');
eq(val(await rpc('admin', 'yb_honour_remove', { id: omarH.id })), { ok: true }, 'the admin takes one back');
eq(val(await rpc('admin', 'yb_honour_remove', { id: omarH.id }))?.error, 'not_found', 'once');
eq(val(await rpc('admin', 'yb_honours_announce', { announce: false })), { ok: true, announced: false }, 'the admin can hide them again');
eq(val(await rpc('ma', 'yb_my_honours', {})).honours, [], 'and they are hidden');
await rpc('admin', 'yb_honours_announce', { announce: true });

section('places after publication');
await rpc('admin', 'yb_publish_results', { publish: true });
const cLa2 = val(await rpc('la', 'yb_cert_list', {}));
eq([cLa2.published, cLa2.teams.length, cLa2.teams[0].team_name, cLa2.teams[0].mine, typeof cLa2.teams[0].rank], [true, 1, 'فريق النور', true, 'number'], 'the leader: his team\'s place');
eq(val(await rpc('pa', 'yb_cert_list', {})).teams.map((t) => t.team_name), ['فريق النور'], 'the parent: the child\'s team');
await rpc('admin', 'yb_publish_results', { publish: false });

section('3. the ceremony (the admin)');
const cer = val(await rpc('admin', 'yb_ceremony', {}));
eq([cer.teams.length, cer.honours.length, cer.announced], [2, 4, true], 'every team in play and every honour');
ok(cer.teams.every((t) => typeof t.rank === 'number' && 'total' in t), 'each team with its rank and total');
ok(cer.teams[0].rank >= cer.teams[cer.teams.length - 1].rank, 'ordered from the last place to the first, for the reveal');
eq(cer.honours.find((h) => h.kind === 'trip').name, 'سالم أحمد العلي', 'full names for the admin\'s screen');
const n = cer.numbers;
eq([n.teams, n.members, n.meetings, n.present, n.expected, n.pledges, n.kept, n.ayahs, n.deed_days, n.projects, n.beneficiaries], [2, 10, 2, 3, 10, 2, 1, 3, 3, 0, 0], 'the season in numbers');

section('4. the parent\'s week');
const pw = val(await rpc('pa', 'yb_parent_week', { week: W }));
eq([pw.ok, pw.week, pw.theme, pw.children.length], [true, W, { body: 'نصدق في القول والعمل', title: 'الصدق' }, 1], 'one card for the linked child, with the week\'s value');
const c = pw.children[0];
eq([c.name, c.team_name, c.joined, c.pledge.body, c.pledge.done, c.pledge.parent_note, c.kept, c.hifz, c.deed_days, c.meeting, c.held, c.came, c.awards],
  ['سالم أحمد العلي', 'فريق النور', true, 'أساعد أمي في البيت', true, 'أحسنت يا بني', 1, 3, 2, true, 2, 2, ['hifz']], 'the promise, the ayahs, 2 days this week, the meeting, the award');
const pwPrev = val(await rpc('pa', 'yb_parent_week', { week: WPREV })).children[0];
eq([pwPrev.pledge.done, pwPrev.deed_days, pwPrev.meeting, pwPrev.awards], [false, 1, true, []], 'last week reads its own week');
eq(val(await rpc('pb', 'yb_parent_week', { week: W })).children.map((x) => [x.name, x.meeting]), [['زيد محمود', null]], 'another parent: their child; no meeting recorded this week');
eq(val(await rpc('px', 'yb_parent_week', { week: W })).children, [], 'a parent without a linked child: none');
eq(val(await rpc('ma', 'yb_parent_week', { week: W })).children, [], 'a member: none');
eq(val(await rpc('pa', 'yb_parent_week', { week: SUNDAY }))?.error, 'invalid_data', 'a week starts on a Saturday');
eq(val(await rpc('pa', 'yb_parent_week', { week: WOLD }))?.error, 'invalid_data', 'at most nine weeks back');
ok(!/يوسف|عمر|زيد/.test(JSON.stringify(pw)), 'the parent sees no other child');

section('the team\'s report for the partner');
const rp = val(await rpc('la', 'yb_team_report', { team_id: TA.id }));
eq([rp.ok, rp.team_name, rp.members, rp.joined, rp.meetings, rp.present, rp.expected, rp.pledges, rp.kept, rp.ayahs, rp.deed_days, rp.awards, rp.honours, rp.projects, rp.teams],
  [true, 'فريق النور', 5, 2, 2, 3, 10, 2, 1, 3, 3, 1, 3, [], 2], 'the leader prints his team\'s numbers');
eq([rp.rank, rp.total], [null, null], 'no place before publication');
ok(!/سالم|يوسف|عمر|زيد|قائد النور/.test(JSON.stringify(rp)), 'no person\'s name in it');
denied(await rpc('lb', 'yb_team_report', { team_id: TA.id }), 'another leader cannot');
denied(await rpc('ma', 'yb_team_report', { team_id: TA.id }), 'a member cannot');
denied(await rpc('pa', 'yb_team_report', { team_id: TA.id }), 'a parent cannot');
const rpA = val(await rpc('admin', 'yb_team_report', { team_id: TA.id }));
eq([rpA.ok, typeof rpA.rank], [true, 'number'], 'the admin can, with the place');
eq(val(await rpc('admin', 'yb_team_report', { team_id: TC.id }))?.error, 'team_not_found', 'a draft team has no report');

section('a deleted member takes their honours with them');
await owner('delete from public.team_members where id = $1', [aSalem]);
eq(val(await rpc('admin', 'yb_honours_board', {})).honours.length, 2, 'Salem\'s two honours are gone; the leader\'s and team B\'s stay');

finish(t0, 100);
