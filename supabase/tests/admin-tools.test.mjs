// Yanabee backend — tests for migration 0017 (tools for the admin: the value of the week, encouragement awards,
// tasks for the team leaders). Applies 0001 -> 0014 and 0017 in PGlite (0017 does not need 0015).
// Run:  node supabase/tests/admin-tools.test.mjs
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
const M = readMigration('0017_yb_admin_tools.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0017 is ASCII only');
await E.db.exec(M);
ok(true, '0017 runs twice without error (idempotent; it stands without 0015)');

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
await owner("update public.teams set status = 'submitted' where id = $1", [TB.id]);

// ================================================================ 1. the value of the week
section('1. the value of the week');
for (const t of ['yb_week_themes', 'yb_awards', 'yb_admin_tasks', 'yb_admin_task_done']) denied(await as('la', `select * from public.${t}`), `nobody reads ${t} directly`);
for (const [fn, a] of [['yb_theme_get', { week: W }], ['yb_theme_set', { week: W, title: 'الصدق' }], ['yb_team_awards', { team_id: TA.id }], ['yb_tasks_mine', { team_id: TA.id }], ['yb_tasks_admin', {}]]) denied(await rpc('anon', fn, a), `a visitor cannot call ${fn}`);
eq(val(await rpc('ma', 'yb_theme_get', { week: W })), null, 'no value yet reads as null');
eq(val(await rpc('admin', 'yb_theme_set', { week: W, title: '  قيمة   الصدق ', body: 'نقول الحق ولو على أنفسنا، ونفي بما نعد.' }))?.ok, true, 'the admin writes the value of the week');
const th = val(await rpc('ma', 'yb_theme_get', { week: W }));
eq([th.week, th.title, th.body], [W, 'قيمة الصدق', 'نقول الحق ولو على أنفسنا، ونفي بما نعد.'], 'a member reads it, trimmed');
eq(val(await rpc('pa', 'yb_theme_get', { week: W }))?.title, 'قيمة الصدق', 'a parent reads it');
eq([(await notes('ma', 'week_theme')).length, (await notes('la', 'week_theme')).length, (await notes('pa', 'week_theme')).length, (await notes('mb', 'week_theme')).length], [1, 1, 1, 0], 'the people of approved teams are told once; a team not approved is not');
eq((await notes('ma', 'week_theme'))[0].data, { title: 'قيمة الصدق' }, 'the notification carries the title');
await rpc('admin', 'yb_theme_set', { week: W, title: 'قيمة الصدق والأمانة' });
eq((await notes('ma', 'week_theme')).length, 1, 'editing it tells nobody again');
eq(val(await rpc('ma', 'yb_theme_get', { week: W }))?.body, null, 'an empty body reads as null');
eq(val(await rpc('admin', 'yb_theme_set', { week: WNEXT, title: 'التعاون' }))?.ok, true, 'next week can be prepared ahead');
eq((await notes('ma', 'week_theme')).length, 1, 'preparing ahead tells nobody yet');
eq(val(await rpc('admin', 'yb_theme_list', {})).map((x) => x.week), [WNEXT, W], 'the admin lists them, newest first');
eq(val(await rpc('admin', 'yb_theme_set', { week: WOLD, title: 'التعاون' }))?.error, 'invalid_data', 'an old week is refused');
eq(val(await rpc('admin', 'yb_theme_set', { week: SUNDAY === W ? WOLD : SUNDAY, title: 'التعاون' }))?.error, 'invalid_data', 'a week not starting on Saturday is refused');
eq(val(await rpc('admin', 'yb_theme_set', { week: W, title: 'ال' }))?.error, 'invalid_data', 'a title too short is refused');
eq(val(await rpc('admin', 'yb_theme_set', { week: W, title: 'اتصلوا 0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
denied(await rpc('la', 'yb_theme_set', { week: W, title: 'التعاون' }), 'a leader cannot write it');
denied(await rpc('off', 'yb_theme_set', { week: W, title: 'التعاون' }), 'nor an officer');
denied(await rpc('la', 'yb_theme_list', {}), 'the list is the admin\'s');
eq(val(await rpc('admin', 'yb_theme_set', { week: WNEXT, title: '' })), { ok: true, removed: true }, 'an empty title removes that week\'s value');
await owner("insert into public.yb_profile_prefs (user_id, notify_off) values ($1, array['announcements']) on conflict (user_id) do update set notify_off = excluded.notify_off", [U.m2.id]);

// ================================================================ 2. awards
section('2. encouragement awards');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'taawun', note: 'ساعدوا فريقا آخر في التحضير' }))?.ok, true, 'the admin gives the team an award');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'hifz', member_id: aSalem }))?.ok, true, 'and one to a member of it');
const aw = val(await rpc('ma', 'yb_team_awards', { team_id: TA.id }));
eq(aw.map((x) => [x.kind, x.member, x.mine, x.note]), [['hifz', 'سالم', true, null], ['taawun', null, false, 'ساعدوا فريقا آخر في التحضير']], 'the member reads them: own award marked, a member by first name');
eq(val(await rpc('m2', 'yb_team_awards', { team_id: TA.id })).find((x) => x.kind === 'hifz').mine, false, 'a teammate sees it is another member\'s');
eq(val(await rpc('pa', 'yb_team_awards', { team_id: TA.id })).length, 2, 'a linked parent reads them');
eq(val(await rpc('la', 'yb_team_awards', { team_id: TA.id })).length, 2, 'the leader reads them');
eq(val(await rpc('off', 'yb_team_awards', { team_id: TA.id })).length, 2, 'an officer reads them');
denied(await rpc('mb', 'yb_team_awards', { team_id: TA.id }), 'a member of another team does not');
denied(await rpc('px', 'yb_team_awards', { team_id: TA.id }), 'nor an unlinked parent');
eq([(await notes('ma', 'award')).length, (await notes('la', 'award')).length, (await notes('pa', 'award')).length], [2, 2, 2], 'the team\'s people are told each time');
eq((await notes('m2', 'award')).length, 2, 'an award arrives even when announcements are muted');
eq(((d) => [d.team_name, d.kind, Object.keys(d).length])((await notes('ma', 'award'))[0].data), ['فريق النور', 'taawun', 2], 'with the team and the kind, no member name');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'taawun' }))?.error, 'already_given', 'the same award again within the week is refused');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'hifz', member_id: aOmar }))?.ok, true, 'the same kind to another member is fine');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'gold' }))?.error, 'invalid_data', 'an unknown kind is refused');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TB.id, kind: 'taawun' }))?.error, 'team_not_found', 'a team that is not approved cannot be awarded');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'fahm', member_id: (await mem(TB, 'زيد محمود')) }))?.error, 'member_not_found', 'a member of another team is refused');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'fahm', note: 'هاتف 0791234567' }))?.error, 'contact_not_allowed', 'a phone number in the note is refused');
eq(val(await rpc('admin', 'yb_award_give', { team_id: TA.id, kind: 'leader', member_id: aSalem }))?.ok, true, 'the leader\'s award');
eq(val(await rpc('la', 'yb_team_awards', { team_id: TA.id })).find((x) => x.kind === 'leader').member, null, 'never names a member');
denied(await rpc('la', 'yb_award_give', { team_id: TA.id, kind: 'fahm' }), 'a leader cannot give awards');
denied(await rpc('off', 'yb_award_give', { team_id: TA.id, kind: 'fahm' }), 'nor an officer');
const all = val(await rpc('admin', 'yb_awards_all', {}));
eq([all.length, all[0].team_name, all.find((x) => x.kind === 'hifz' && x.member === 'سالم أحمد العلي') != null], [4, 'فريق النور', true], 'the admin lists every award with full names');
denied(await rpc('la', 'yb_awards_all', {}), 'that list is the admin\'s');
const hid = all.find((x) => x.kind === 'taawun').id;
denied(await rpc('la', 'yb_award_remove', { id: hid }), 'a leader cannot take an award back');
eq(val(await rpc('admin', 'yb_award_remove', { id: hid }))?.ok, true, 'the admin takes one back');
eq(val(await rpc('admin', 'yb_award_remove', { id: hid }))?.error, 'not_found', 'twice is not found');
eq(val(await rpc('ma', 'yb_team_awards', { team_id: TA.id })).length, 3, 'it is gone for the team');
eq((await owner("select count(*)::int n from public.audit_log where action in ('award_give', 'award_remove')")).rows[0].n, 5, 'giving and removing are in the audit log');
await owner('delete from public.team_members where id = $1', [aOmar]);
eq(val(await rpc('la', 'yb_team_awards', { team_id: TA.id })).length, 2, 'a removed member\'s award goes with them');

// ================================================================ 3. tasks for the leaders
section('3. tasks from the admin to the leaders');
await owner("update public.teams set status = 'approved' where id = $1", [TB.id]);
eq(val(await rpc('la', 'yb_tasks_mine', { team_id: TA.id })), [], 'no tasks yet');
const t1 = val(await rpc('admin', 'yb_task_add', { title: ' سلّموا   موافقات أولياء الأمور ', due: today }));
const t2 = val(await rpc('admin', 'yb_task_add', { title: 'صوّروا لقاء الفريق الأسبوعي' }));
eq([t1.ok, t2.ok], [true, true], 'the admin adds two tasks, one with a due date');
eq([(await notes('la', 'admin_task')).length, (await notes('lb', 'admin_task')).length, (await notes('ma', 'admin_task')).length], [2, 2, 0], 'the leaders of approved teams are told; members are not');
eq((await notes('la', 'admin_task'))[0].data, { title: 'سلّموا موافقات أولياء الأمور' }, 'with the trimmed title');
const mineT = val(await rpc('la', 'yb_tasks_mine', { team_id: TA.id }));
eq(mineT.map((x) => [x.title, x.due, x.done]), [['سلّموا موافقات أولياء الأمور', today, false], ['صوّروا لقاء الفريق الأسبوعي', null, false]], 'the leader reads them, the dated one first');
eq(val(await rpc('la', 'yb_task_tick', { task_id: t1.id, team_id: TA.id, done: true }))?.ok, true, 'the leader ticks one');
await rpc('la', 'yb_task_tick', { task_id: t1.id, team_id: TA.id, done: true });
eq(val(await rpc('la', 'yb_tasks_mine', { team_id: TA.id })).map((x) => x.done), [true, false], 'it reads back done (twice is harmless)');
eq(val(await rpc('lb', 'yb_tasks_mine', { team_id: TB.id })).map((x) => x.done), [false, false], 'another team\'s list is its own');
const adm = val(await rpc('admin', 'yb_tasks_admin', {}));
const A1 = adm.find((x) => x.id === t1.id);
eq([adm.length, A1.teams, A1.done, A1.waiting], [2, 2, ['فريق النور'], ['فريق الأمل']], 'the admin sees which teams finished and which did not');
eq(val(await rpc('la', 'yb_task_tick', { task_id: t1.id, team_id: TA.id, done: false }))?.ok, true, 'a tick can be undone');
eq(val(await rpc('admin', 'yb_tasks_admin', {})).find((x) => x.id === t1.id).done, [], 'and the admin sees that');
eq(val(await rpc('la', 'yb_task_tick', { task_id: 999999, team_id: TA.id, done: true }))?.error, 'not_found', 'a task that does not exist is not found');
denied(await rpc('lb', 'yb_task_tick', { task_id: t1.id, team_id: TA.id, done: true }), 'a leader cannot tick for another team');
denied(await rpc('ma', 'yb_task_tick', { task_id: t1.id, team_id: TA.id, done: true }), 'a member cannot tick');
denied(await rpc('ma', 'yb_tasks_mine', { team_id: TA.id }), 'nor read the leader\'s tasks');
denied(await rpc('admin', 'yb_tasks_mine', { team_id: TA.id }), 'the admin uses the admin list');
denied(await rpc('la', 'yb_task_add', { title: 'مهمة من قائد' }), 'a leader cannot add a task');
denied(await rpc('off', 'yb_tasks_admin', {}), 'an officer does not read the admin list');
eq(val(await rpc('admin', 'yb_task_add', { title: 'قصير' }))?.error === undefined ? 'ok' : val(await rpc('admin', 'yb_task_add', { title: 'قصر' }))?.error, 'invalid_data', 'a title too short is refused');
eq(val(await rpc('admin', 'yb_task_add', { title: 'راسلوني على 0791234567' }))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await rpc('admin', 'yb_task_add', { title: 'مهمة بموعد قديم جدا', due: WOLD }))?.error, 'invalid_data', 'a due date long past is refused');
await rpc('la', 'yb_task_tick', { task_id: t2.id, team_id: TA.id, done: true });
denied(await rpc('la', 'yb_task_remove', { id: t2.id }), 'a leader cannot remove a task');
eq(val(await rpc('admin', 'yb_task_remove', { id: t2.id }))?.ok, true, 'the admin removes a task');
eq((await owner('select count(*)::int n from public.yb_admin_task_done where task_id = $1', [t2.id])).rows[0].n, 0, 'its ticks go with it');
eq(val(await rpc('la', 'yb_tasks_mine', { team_id: TA.id })).length, 1, 'and it leaves the leader\'s list');

finish(t0, 80);
