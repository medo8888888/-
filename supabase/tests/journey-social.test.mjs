// Yanabee backend — tests for migration 0016 (the journey between people: the leader's encouragement and reminder,
// notifications, the member's past promises, the week across teams). Applies 0001 -> 0016 in PGlite.
// Run:  node supabase/tests/journey-social.test.mjs
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
const M = readMigration('0016_yb_journey_social.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0016 is ASCII only');
await E.db.exec(M);
ok(true, '0016 runs twice without error (idempotent)');

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
const P = { week: W, field: 'home', body: 'أساعد أمي في ترتيب البيت' };

// ================================================================ 1. the leader's encouragement
section('1. the leader encourages a promise');
for (const [fn, a] of [['yb_my_pledges', {}], ['yb_pledge_cheer', { member_id: aSalem, week: W }], ['yb_pledge_nudge', { team_id: TA.id, week: W }], ['yb_week_race', { week: W }]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
eq(val(await rpc('la', 'yb_pledge_cheer', { member_id: aSalem, week: W }))?.error, 'not_found', 'nothing to cheer before a promise is written');
await rpc('ma', 'yb_pledge_save', P);
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.cheered, false, 'a fresh promise is not cheered');
eq(val(await rpc('la', 'yb_pledge_cheer', { member_id: aSalem, week: W }))?.ok, true, 'the leader cheers it');
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.cheered, true, 'the member sees it');
eq(val(await rpc('pa', 'yb_child_journey', { week: W }))[0].pledge.cheered, true, 'and the parent');
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).members.find((m) => m.member_id === aSalem).pledge.cheered, true, 'and the leader\'s list');
eq((await notes('ma', 'pledge_cheer')).length, 1, 'the member is told once');
await rpc('la', 'yb_pledge_cheer', { member_id: aSalem, week: W });
eq((await notes('ma', 'pledge_cheer')).length, 1, 'cheering twice tells nobody again');
eq((await notes('ma', 'pledge_cheer'))[0].data, {}, 'the notification carries no text and no name');
denied(await rpc('lb', 'yb_pledge_cheer', { member_id: aSalem, week: W }), 'another team\'s leader cannot cheer');
denied(await rpc('m2', 'yb_pledge_cheer', { member_id: aSalem, week: W }), 'a teammate cannot');
denied(await rpc('pa', 'yb_pledge_cheer', { member_id: aSalem, week: W }), 'a parent cannot (their word is the note)');
denied(await rpc('admin', 'yb_pledge_cheer', { member_id: aSalem, week: W }), 'nor the admin: it is the leader\'s');
eq(val(await rpc('la', 'yb_pledge_cheer', { member_id: aYusuf, week: W }))?.error, 'not_found', 'a member without an account has nothing to cheer');
await rpc('ma', 'yb_pledge_save', P);
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.cheered, true, 'saving the same text keeps the cheer');
await rpc('ma', 'yb_pledge_save', { ...P, body: 'أرتب غرفتي كل يوم قبل النوم' });
eq(val(await rpc('ma', 'yb_journey_me', { week: W })).pledge.cheered, false, 'a new text is not cheered yet');
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).can_lead, true, 'the leader\'s list says they lead');
eq(val(await rpc('admin', 'yb_team_journey', { team_id: TA.id, week: W })).can_lead, false, 'the admin reads it without leading');

// ================================================================ 2. the reminder
section('2. the leader reminds those who wrote no promise');
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).nudged_today, false, 'no reminder sent yet today');
eq(val(await rpc('la', 'yb_pledge_nudge', { team_id: TA.id, week: W })), { ok: true, sent: 1 }, 'the reminder goes to the one joined member without a promise');
eq([(await notes('m2', 'pledge_nudge')).length, (await notes('ma', 'pledge_nudge')).length, (await notes('la', 'pledge_nudge')).length], [1, 0, 0], 'not to the one who wrote, and not to the leader');
eq((await notes('m2', 'pledge_nudge'))[0].data, { team_name: 'فريق النور' }, 'it names the team only');
eq(val(await rpc('la', 'yb_pledge_nudge', { team_id: TA.id, week: W }))?.error, 'too_soon', 'a second reminder the same day is refused');
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).nudged_today, true, 'the list knows a reminder went today');
eq(val(await rpc('la', 'yb_lead_week_set', { team_id: TA.id, week: W, tasks: ['meet'] }))?.ok, true, 'ticking duties afterwards');
eq(val(await rpc('la', 'yb_pledge_nudge', { team_id: TA.id, week: W }))?.error, 'too_soon', 'does not reopen the reminder');
eq(val(await rpc('la', 'yb_team_board', { team_id: TA.id, week: W })).lead_tasks, ['meet'], 'and the reminder did not disturb the duties');
await owner('update public.yb_lead_weeks set nudged_on = current_date - 1 where team_id = $1', [TA.id]);
await rpc('m2', 'yb_pledge_save', { ...P, body: 'أساعد أخي الصغير في واجبه' });
eq(val(await rpc('la', 'yb_pledge_nudge', { team_id: TA.id, week: W })), { ok: true, sent: 0 }, 'the next day, with everyone written, nothing is sent');
eq(val(await rpc('la', 'yb_team_journey', { team_id: TA.id, week: W })).nudged_today, false, 'and sending nothing does not use up the day');
eq(val(await rpc('la', 'yb_pledge_nudge', { team_id: TA.id, week: WOLD }))?.error, 'invalid_data', 'an old week is refused');
denied(await rpc('lb', 'yb_pledge_nudge', { team_id: TA.id, week: W }), 'another team\'s leader cannot remind');
denied(await rpc('ma', 'yb_pledge_nudge', { team_id: TA.id, week: W }), 'a member cannot');
denied(await rpc('admin', 'yb_pledge_nudge', { team_id: TA.id, week: W }), 'nor the admin');

// ================================================================ 3. parents and children hear each other
section('3. the parent\'s word and the kept promise travel as notifications');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'بارك الله فيك' }))?.ok, true, 'the parent writes a word');
eq((await notes('ma', 'pledge_note')).length, 1, 'the child is told');
eq((await notes('ma', 'pledge_note'))[0].data, {}, 'without the text in the notification');
await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'بارك الله فيك' });
eq((await notes('ma', 'pledge_note')).length, 1, 'saving the same word again tells nobody');
await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'أحسنت يا بني' });
eq((await notes('ma', 'pledge_note')).length, 2, 'a changed word is told');
await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: '' });
eq((await notes('ma', 'pledge_note')).length, 2, 'removing the word tells nobody');
eq(val(await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: WPREV, note: 'ملاحظة' }))?.error, 'not_found', 'no promise that week: nothing to note (as before)');
denied(await rpc('px', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'ملاحظة' }), 'an unlinked parent still cannot');
eq(val(await rpc('ma', 'yb_pledge_done', { week: W, done: true }))?.ok, true, 'the child keeps the promise');
eq((await notes('pa', 'pledge_kept')).map((n) => n.data), [{ first_name: 'سالم' }], 'the linked parent is told, with the first name only');
eq((await notes('px', 'pledge_kept')).length, 0, 'no other parent is');
await rpc('ma', 'yb_pledge_done', { week: W, done: true });
eq((await notes('pa', 'pledge_kept')).length, 1, 'marking it again tells nobody');
await rpc('ma', 'yb_pledge_done', { week: W, done: false });
await rpc('ma', 'yb_pledge_done', { week: W, done: true });
eq((await notes('pa', 'pledge_kept')).length, 2, 'unmarking and keeping again is told again');
eq(val(await rpc('m2', 'yb_pledge_done', { week: WPREV, done: true }))?.error, 'not_found', 'nothing to mark without a promise (as before)');
await owner("insert into public.yb_profile_prefs (user_id, notify_off) values ($1, array['matches','projects','announcements','feed']) on conflict (user_id) do update set notify_off = excluded.notify_off", [U.ma.id]);
await rpc('pa', 'yb_pledge_note', { member_id: aSalem, week: W, note: 'كلمة جديدة' });
eq((await notes('ma', 'pledge_note')).length, 3, 'journey notes are essential: muting the other groups does not hide them');

// ================================================================ 4. past promises
section('4. the member\'s past promises');
await owner("insert into public.yb_pledges (user_id, team_id, week, field, body, done) values ($1, $2, $3, 'kin', 'أزور جدتي', true), ($1, $2, $4, 'school', 'أحافظ على نظافة صفي', false)", [U.ma.id, TA.id, WPREV, WOLD]);
const hist = val(await rpc('ma', 'yb_my_pledges', {}));
eq(hist.map((x) => x.week), [W, WPREV, WOLD], 'newest week first');
eq([hist[1].body, hist[1].done, hist[2].done, hist[0].cheered], ['أزور جدتي', true, false, false], 'each with its text and whether it was kept');
eq(val(await rpc('ma', 'yb_my_pledges', { lim: 2 })).length, 2, 'the limit is respected');
eq(val(await rpc('mx', 'yb_my_pledges', {})), [], 'someone with none gets an empty list');
ok(!JSON.stringify(val(await rpc('m2', 'yb_my_pledges', {}))).includes('جدتي'), 'nobody reads another person\'s history');

// ================================================================ 5. the week across teams
section('5. the week across teams (names of teams and counts only)');
const race = val(await rpc('ma', 'yb_week_race', { week: W }));
const RA = race.find((x) => x.team_id === TA.id), RB = race.find((x) => x.team_id === TB.id);
eq(race.length, 2, 'approved teams are listed');
eq([RA.team_name, RA.joined, RA.pledged, RA.kept], ['فريق النور', 2, 2, 1], 'joined members (the leader aside), promises and kept ones');
eq([RB.joined, RB.pledged, RB.kept, RB.hifz_sum], [1, 0, 0, 0], 'a quiet team reads as zeros');
await rpc('la', 'yb_pledge_save', { week: W, field: 'friends', body: 'أشجع صديقي على الحفظ' });
eq(val(await rpc('ma', 'yb_week_race', { week: W })).find((x) => x.team_id === TA.id).pledged, 2, 'the leader\'s own promise does not count for the team');
await rpc('ma', 'yb_hifz_set', { ayahs: [1, 2, 3] });
eq(val(await rpc('mb', 'yb_week_race', { week: W })).find((x) => x.team_id === TA.id).hifz_sum, 3, 'a member of another team reads the same board');
ok(!/سالم|عمر|غرفتي|أخي/.test(JSON.stringify(race)), 'no member name and no promise text');
for (const who of ['la', 'pa', 'off', 'admin']) eq(val(await rpc(who, 'yb_week_race', { week: W })).length, 2, `${who} reads it`);
denied(await rpc('mx', 'yb_week_race', { week: W }), 'someone outside every team does not');
denied(await rpc('px', 'yb_week_race', { week: W }), 'nor a parent without a child');
await owner("update public.teams set status = 'submitted' where id = $1", [TB.id]);
eq(val(await rpc('ma', 'yb_week_race', { week: W })).length, 1, 'a team that is not approved is not listed');

finish(t0, 70);
