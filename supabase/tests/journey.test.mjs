// Yanabee backend — tests for migration 0015 (the journey on the account: promises, memorisation, deeds, the team
// pact, the leader's week; and who sees what). Applies 0001 -> 0015 in PGlite behind the emulation in harness.mjs.
// Run:  node supabase/tests/journey.test.mjs
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
const M = readMigration('0015_yb_journey.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0015 is ASCII only');
await E.db.exec(M);
ok(true, '0015 runs twice without error (idempotent)');

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

// ================================================================ 1. the tables are closed
section('1. the tables are closed; everything goes through functions');
for (const t of ['yb_pledges', 'yb_hifz_marks', 'yb_deed_days', 'yb_team_pact', 'yb_lead_weeks']) {
  denied(await as('ma', `select * from public.${t}`), `a member cannot read ${t} directly`);
  denied(await as('anon', `select * from public.${t}`), `a visitor cannot read ${t}`);
}
denied(await as('ma', "insert into public.yb_deed_days (user_id, day) values ($1, current_date)", [U.ma.id]), 'nor write directly');
for (const [fn, a] of [['yb_journey_me', { week: W }], ['yb_pledge_save', { week: W, field: 'home', body: 'أساعد أمي في البيت' }], ['yb_hifz_set', { ayahs: [1] }],
  ['yb_deed_mark', { day: today, done: true }], ['yb_team_journey', { team_id: TA.id, week: W }], ['yb_team_board', { team_id: TA.id, week: W }],
  ['yb_child_journey', { week: W }], ['yb_activity_board', { week: W }], ['yb_activity_log', {}]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);

// ================================================================ 2. the weekly promise
section('2. the weekly promise');
const me0 = val(await rpc('ma', 'yb_journey_me', { week: W }));
eq([me0.team_id, me0.pledge, me0.kept, me0.hifz, me0.deed_days], [TA.id, null, 0, [], []], 'a fresh journey is empty and names the team');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'home', body: '  أساعد   أمي في ترتيب البيت ' }))?.ok, true, 'a member saves this week\'s promise');
const pl = (x) => x && [x.field, x.body, x.done, x.parent_note];
eq(pl(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge), ['home', 'أساعد أمي في ترتيب البيت', false, null], 'it reads back trimmed, not kept yet');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'hood', body: 'أنظف مدخل البناية مع جاري' }))?.ok, true, 'saving again replaces it');
eq((await owner('select count(*)::int n from public.yb_pledges where user_id = $1', [U.ma.id])).rows[0].n, 1, 'one promise a week');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'home', body: 'اتصل بي على 0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'home', body: 'راسلني a@b.com الآن' }))?.error, 'contact_not_allowed', 'an e-mail is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'moon', body: 'أساعد أمي في البيت' }))?.error, 'invalid_data', 'an unknown field is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'home', body: 'قصير' }))?.error, 'invalid_data', 'a text that is too short is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'home', body: 'ن'.repeat(141) }))?.error, 'invalid_data', 'and one that is too long');
eq(val(await rpc('ma', 'yb_pledge_save', { week: SUNDAY === W ? WOLD : SUNDAY, field: 'home', body: 'أساعد أمي في البيت' }))?.error, 'invalid_data', 'a week that does not start on Saturday is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: WOLD, field: 'home', body: 'أساعد أمي في البيت' }))?.error, 'invalid_data', 'an old week is refused');
eq(val(await rpc('ma', 'yb_pledge_save', { week: WNEXT, field: 'home', body: 'أساعد أمي في البيت' }))?.error, 'invalid_data', 'a future week is refused');
eq(val(await rpc('mx', 'yb_pledge_save', { week: W, field: 'home', body: 'أساعد أمي في البيت' }))?.error, 'no_team', 'someone without a team cannot promise');
eq(val(await rpc('ma', 'yb_pledge_done', { week: W, done: true }))?.ok, true, 'the member marks it kept');
const me1 = val(await rpc('ma', 'yb_journey_me', { week: W }));
eq([me1.pledge.done, me1.kept], [true, 1], 'it counts as kept');
eq(val(await rpc('m2', 'yb_pledge_done', { week: W, done: true }))?.error, 'not_found', 'nothing to mark without a promise');
eq(val(await rpc('ma', 'yb_pledge_save', { week: W, field: 'kin', body: 'أزور جدتي وأساعدها' }))?.ok, true, 'changing the promise');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.done, false, 'resets "kept"');
await rpc('ma', 'yb_pledge_done', { week: W, done: true });
eq(val(await rpc('la', 'yb_pledge_save', { week: W, field: 'friends', body: 'أشجع صديقي على الحفظ' }))?.ok, true, 'a leader has a promise too (on the team they lead)');
eq((await owner('select team_id from public.yb_pledges where user_id = $1', [U.la.id])).rows[0].team_id, TA.id, 'filed under their team');

// ================================================================ 3. memorisation and deeds
section('3. the memorisation tracker and the deed days');
eq(val(await rpc('ma', 'yb_hifz_set', { ayahs: [3, 1, 2, 2] })), { ok: true, count: 3 }, 'ayahs are saved once each');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).hifz, [1, 2, 3], 'and read back in order');
eq(val(await rpc('ma', 'yb_hifz_set', { ayahs: [1, 15] }))?.error, 'invalid_data', 'an ayah outside 1..14 is refused');
eq(val(await rpc('ma', 'yb_hifz_set', { ayahs: [0] }))?.error, 'invalid_data', 'and zero');
eq(val(await rpc('ma', 'yb_hifz_set', { ayahs: [1, 2, 3, 4] }))?.count, 4, 'the set is replaced as a whole');
eq(val(await rpc('m2', 'yb_hifz_set', { ayahs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }))?.count, 14, 'a full surah');
eq(val(await rpc('ma', 'yb_deed_mark', { day: today, done: true }))?.ok, true, 'today\'s deed is ticked');
eq(val(await rpc('ma', 'yb_deed_mark', { day: today, done: true }))?.ok, true, 'twice is harmless');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).deed_days, [today], 'one day is recorded');
eq(val(await rpc('ma', 'yb_deed_mark', { day: await day('current_date - 5'), done: true }))?.error, 'invalid_data', 'a day long past is refused');
eq(val(await rpc('ma', 'yb_deed_mark', { day: await day('current_date + 3'), done: true }))?.error, 'invalid_data', 'a future day is refused');
eq(val(await rpc('ma', 'yb_deed_mark', { day: today, done: false }))?.ok, true, 'it can be unticked');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).deed_days, [], 'and is gone');
await rpc('ma', 'yb_deed_mark', { day: today, done: true });

// ================================================================ 4. the leader follows the team
section('4. the leader follows the team');
const tj = val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W }));
const row = (n) => tj.members.find((m) => m.name === n);
eq(tj.members.length, (await owner('select count(*)::int n from public.team_members where team_id = $1', [TA.id])).rows[0].n, 'every member is listed');
eq([row('سالم أحمد العلي').pledge.body, row('سالم أحمد العلي').pledge.done, row('سالم أحمد العلي').kept, row('سالم أحمد العلي').hifz, row('سالم أحمد العلي').joined],
  ['أزور جدتي وأساعدها', true, 1, 4, true], 'with this week\'s promise, kept count and ayahs');
eq([row('عمر حسن').pledge, row('عمر حسن').hifz], [null, 14], 'a member without a promise shows none');
eq([row('يوسف علي حسن').joined, row('يوسف علي حسن').pledge, row('يوسف علي حسن').hifz], [false, null, 0], 'a member who has not joined shows as not joined');
eq(row('سالم أحمد العلي').deed_days >= (today >= W ? 1 : 0), true, 'deed days this week are counted');
denied(await rpc('lb', 'yb_team_journey', { team_id: TA.id, week: W }), 'another team\'s leader cannot');
denied(await rpc('ma', 'yb_team_journey', { team_id: TA.id, week: W }), 'a member cannot read the others\' promises');
denied(await rpc('pa', 'yb_team_journey', { team_id: TA.id, week: W }), 'nor a parent');
eq(val(await rpc('admin', 'yb_team_journey', { team_id: TA.id, week: W })).members.length, tj.members.length, 'the admin can');
eq(val(await rpc('off', 'yb_team_journey', { team_id: TA.id, week: W })).members.length, tj.members.length, 'an officer can');

// ================================================================ 5. the team board (counts only)
section('5. the team board: counts, never a name or a text');
const b = val(await rpc('ma', 'yb_team_board', { team_id: TA.id, week: W }));
eq([b.joined, b.pledged, b.kept, b.hifz_sum, b.pact, b.lead_tasks], [3, 2, 1, 18, null, []], 'a member reads the team\'s counts (the leader counts as joined)');
ok(!/جدتي|سالم|عمر/.test(JSON.stringify(b)), 'no name and no promise text in it');
eq(val(await rpc('pa', 'yb_team_board', { team_id: TA.id, week: W }))?.pledged, 2, 'a linked parent reads it');
eq(val(await rpc('la', 'yb_team_board', { team_id: TA.id, week: W }))?.pledged, 2, 'the leader reads it');
eq(val(await rpc('off', 'yb_team_board', { team_id: TA.id, week: W }))?.pledged, 2, 'an officer reads it');
denied(await rpc('mb', 'yb_team_board', { team_id: TA.id, week: W }), 'a member of another team cannot');
denied(await rpc('px', 'yb_team_board', { team_id: TA.id, week: W }), 'a parent without a child here cannot');
denied(await rpc('mx', 'yb_team_board', { team_id: TA.id, week: W }), 'someone without a team cannot');

// ================================================================ 6. the pact and the leader's week
section('6. the team pact and the leader\'s week');
eq(val(await rpc('la', 'yb_pact_save', { team_id: TA.id, value: 'taawun', how: 'نساعد من يتأخر في الحفظ', who: 'all', when_text: 'كل لقاء' }))?.ok, true, 'the leader saves the pact');
const pc = (x) => x && [x.value, x.how, x.who, x.when];
eq(pc(val(await rpc('ma', 'yb_team_board', { team_id: TA.id, week: W })).pact), ['taawun', 'نساعد من يتأخر في الحفظ', 'all', 'كل لقاء'], 'the members read it');
eq(val(await rpc('la', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'نقول الحقيقة في النتائج', who: 'leader' }))?.ok, true, 'saving again replaces it; "when" is optional');
eq(val(await rpc('ma', 'yb_team_board', { team_id: TA.id, week: W })).pact.when, null, 'an empty "when" reads as null');
eq(val(await rpc('la', 'yb_pact_save', { team_id: TA.id, value: 'fun', how: 'نساعد من يتأخر', who: 'all' }))?.error, 'invalid_data', 'an unknown value is refused');
eq(val(await rpc('la', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'نساعد من يتأخر', who: 'salem' }))?.error, 'invalid_data', '"who" is a role, never a name');
eq(val(await rpc('la', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'اتصلوا 0791234567', who: 'all' }))?.error, 'contact_not_allowed', 'a phone number is refused');
denied(await rpc('ma', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'نقول الحقيقة دائما', who: 'all' }), 'a member cannot write the pact');
denied(await rpc('lb', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'نقول الحقيقة دائما', who: 'all' }), 'nor another team\'s leader');
denied(await rpc('admin', 'yb_pact_save', { team_id: TA.id, value: 'sidq', how: 'نقول الحقيقة دائما', who: 'all' }), 'nor the admin: the pact is the team\'s own');
eq(val(await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['meet', 'cards', 'meet'] }))?.ok, true, 'the leader ticks the week\'s duties');
eq(val(await rpc('la', 'yb_team_board', { team_id: TA.id, week: W })).lead_tasks, ['cards', 'meet'], 'they read back, once each');
eq(val(await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['dance'] }))?.error, 'invalid_data', 'an unknown duty is refused');
eq(val(await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: WOLD, tasks: ['meet'] }))?.error, 'invalid_data', 'an old week is refused');
eq(val(await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: [] }))?.ok, true, 'unticking everything is fine');
denied(await rpc('ma', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['meet'] }), 'a member cannot');
denied(await rpc('lb', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['meet'] }), 'nor another team\'s leader');
await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['meet', 'cards', 'follow'] });

// ================================================================ 7. the parent
section('7. the parent follows their own child');
const cj = val(await rpc('pa', 'yb_child_journey', { week: W }));
eq(cj.length, 1, 'only their own child');
eq([cj[0].member_id, cj[0].pledge.body, cj[0].pledge.done, cj[0].kept, cj[0].hifz], [aSalem, 'أزور جدتي وأساعدها', true, 1, 4], 'with the promise and the counts');
eq(val(await rpc('px', 'yb_child_journey', { week: W })), [], 'a parent without a child gets an empty list');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: ' رأيته يزور جدته، بارك الله فيه ' }))?.ok, true, 'the parent adds a note');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.parent_note, 'رأيته يزور جدته، بارك الله فيه', 'the child reads it');
eq(row('سالم أحمد العلي') && val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).members.find((m) => m.member_id === aSalem).pledge.parent_note, 'رأيته يزور جدته، بارك الله فيه', 'and the leader');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'هاتفي 0791234567' }))?.error, 'contact_not_allowed', 'a phone number in the note is refused');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'ن'.repeat(201) }))?.error, 'invalid_data', 'a note that is too long is refused');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: WPREV, note: 'ملاحظة' }))?.error, 'not_found', 'no promise that week: nothing to note');
denied(await rpc('pa', 'yb_pledge_note', { member_id: aOmar, week: W, note: 'ملاحظة' }), 'a parent cannot note another child');
denied(await rpc('px', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'ملاحظة' }), 'nor an unlinked parent');
denied(await rpc('la', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'ملاحظة' }), 'nor the leader: the note is the parent\'s');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: '' }))?.ok, true, 'an empty note removes it');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.parent_note, null, 'and it is gone');
await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'أحسنت' });
await rpc('ma', 'yb_pledge_save', { week: W, field: 'kin', body: 'أزور جدتي وأساعدها' });
eq(pl(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge), ['kin', 'أزور جدتي وأساعدها', true, 'أحسنت'], 'saving the same text again keeps "kept" and the parent\'s note');

// ================================================================ 8. officers and the admin
section('8. the activity board and the log');
const ab = val(await rpc('admin', 'yb_activity_board', { week: W }));
const A = ab.find((x) => x.team_id === TA.id), B = ab.find((x) => x.team_id === TB.id);
eq(ab.length, 2, 'approved teams are listed');
eq([A.team_name, A.joined, A.pledged, A.kept, A.hifz_sum, A.lead_tasks, A.pact], ['فريق النور', 3, 2, 1, 18, 3, true], 'with this week\'s counts');
eq([B.pledged, B.kept, B.hifz_sum, B.lead_tasks, B.pact], [0, 0, 0, 0, false], 'a quiet team reads as zeros');
ok(!/جدتي|سالم/.test(JSON.stringify(ab)), 'no member name and no promise text');
eq(val(await rpc('off', 'yb_activity_board', { week: W })).length, 2, 'an officer reads it');
denied(await rpc('la', 'yb_activity_board', { week: W }), 'a leader cannot');
denied(await rpc('ma', 'yb_activity_board', { week: W }), 'a member cannot');
denied(await rpc('pa', 'yb_activity_board', { week: W }), 'a parent cannot');
const lg = val(await rpc('admin', 'yb_activity_log', { lim: 5 }));
ok(Array.isArray(lg) && lg.length > 0 && lg.length <= 5, 'the admin reads the log, limited');
ok(lg.every((x) => x.at && x.action && !('detail' in x) && !('user_id' in x)), 'each row has a time, an action and a name; no ids and no detail');
ok(lg.every((x, i) => i === 0 || x.at <= lg[i - 1].at), 'newest first');
eq(val(await rpc('admin', 'yb_activity_log', { lim: 100000 })).length <= 100, true, 'never more than 100 rows');
denied(await rpc('off', 'yb_activity_log', {}), 'an officer cannot read the log');
denied(await rpc('la', 'yb_activity_log', {}), 'a leader cannot');
denied(await rpc('ma', 'yb_activity_log', {}), 'a member cannot');

// ================================================================ 9. leaving
section('9. rows follow the account');
await owner('delete from public.team_members where id = $1', [aOmar]);
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).members.some((m) => m.member_id === aOmar), false, 'a removed member leaves the leader\'s list');
eq(val(await rpc('m2', 'yb_journey_me', { week: W })).hifz.length, 14, 'their own tracker stays theirs');
eq(val(await rpc('ma', 'yb_team_board', { team_id: TA.id, week: W })).hifz_sum, 4, 'but no longer counts for the team');

finish(t0, 100);
