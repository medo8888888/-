// Yanabee backend — tests for migration 0010 (judges, scores with reasons, totals, publication).
// Applies 0001 -> 0010 in PGlite behind the Supabase emulation in harness.mjs, with a small Storage emulation
// (0008 and 0010 put policies on storage.objects).
// Run:  node supabase/tests/judging.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
await E.db.exec(`
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, delete on storage.objects to anon, authenticated;
`);
const M10 = readMigration('0010_yb_judging.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M10);
console.log(`migrations 0001-0010 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M10), '0010 is ASCII only');
await E.db.exec(M10);
ok(true, '0010 runs twice without error (idempotent)');

// ================================================================ 0. the caps are the document's
section('0. the caps match competition.txt (c-score, c-rubric)');
const doc = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8');
const score = doc.split('\n').find((l) => l.startsWith('اعتماد معايير تقييم المسابقة'));
const num = (re) => Number((score.match(re) || [])[1]);
const want = { hifz: num(/الحفظ (\d+)/), fahm: num(/الفهم (\d+)/), tatbiq: num(/التطبيق (\d+)/), football: num(/كرة القدم (\d+)/), chess: num(/الشطرنج (\d+)/) };
const rub = doc.split('\n## c-rubric')[1].split('\n#')[0];
const row = (label) => Number((rub.match(new RegExp('\\| ' + label + '[^|]*\\| (\\d+) \\|')) || [])[1]);
Object.assign(want, { roles: row('مشاركة أعضاء الفريق'), execution: row('التنفيذ الفعلي'), documentation: row('توثيق النتائج') });
const caps = (await owner("select c, public.yb_crit_cap(c)::int as v from unnest(array['hifz','fahm','tatbiq','football','chess','roles','execution','documentation']) c")).rows;
eq(Object.fromEntries(caps.map((r) => [r.c, r.v])), want, 'every cap in the database equals the document');
eq(want.hifz + want.fahm + want.tatbiq + want.football + want.chess, 100, 'the five axes add up to 100');
eq(want.roles + want.execution + want.documentation, want.tatbiq, 'the three tatbiq criteria add up to its 45');

// ================================================================ people and teams
const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول الكرة'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['j1', 'parent', 'الحكم الأول'], ['j2', 'parent', 'الحكم الثاني'], ['jk', 'parent', 'ولي في فريق النور'], ['pa', 'parent', 'ولي يوسف'],
  ['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ld', 'leader', 'قائد المسودة'], ['ma', 'member', 'سالم أحمد']]) await signUp(k, Y(r, n));
async function team(who, name, status) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد', 'يوسف علي', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  if (status !== 'draft') await owner('update public.teams set status = $2 where id = $1', [t.id, status]);
  return t;
}
const TA = await team('la', 'فريق النور', 'approved');
const TB = await team('lb', 'فريق الأمل', 'approved');
const TD = await team('ld', 'فريق المسودة', 'draft');
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' }))?.ok, true, 'a parent links a child of team A');
eq(val(await rpc('jk', 'link_child', { code: TA.join_code, child_name: 'عمر حسن' }))?.ok, true, 'a future judge links their own child in team A');
await owner('delete from public.yb_notifications');

// ================================================================ 1. choosing judges
section('1. the admin chooses the judges (a parent or an admin)');
const setJ = (who, target, axes) => rpc(who, 'yb_set_judge', { target, axes: `{${axes.join(',')}}` });
denied(await setJ('la', U.j1.id, ['hifz']), 'a leader cannot choose judges');
denied(await setJ('off', U.j1.id, ['hifz']), 'an officer cannot choose judges');
eq(val(await setJ('admin', U.la.id, ['hifz']))?.error, 'judge_role', 'a team leader cannot be a judge');
eq(val(await setJ('admin', U.ma.id, ['hifz']))?.error, 'judge_role', 'a member (a student) cannot be a judge');
eq(val(await setJ('admin', U.off.id, ['hifz']))?.error, 'judge_role', 'an officer cannot be a judge');
fails(await setJ('admin', U.j1.id, ['football']), 'invalid_argument', 'football is not a judged axis (the admin enters it)');
eq(val(await setJ('admin', U.j1.id, ['tatbiq', 'hifz', 'hifz']))?.axes, ['hifz', 'tatbiq'], 'a parent becomes a judge of hifz and tatbiq');
eq(val(await setJ('admin', U.j2.id, ['hifz']))?.ok, true, 'a second parent judges hifz');
eq(val(await setJ('admin', U.jk.id, ['hifz', 'fahm']))?.ok, true, 'a parent with a child in team A judges hifz and fahm');
eq(val(await setJ('admin', U.admin.id, ['fahm']))?.ok, true, 'the admin can judge too');
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'judge_assigned'")).rows[0].n, 4, 'each new judge is told');
eq((await as('admin', 'select full_name from public.yb_judges_list()')).rows?.length, 4, 'the admin lists the four judges');
denied(await as('j1', 'select * from public.yb_judges_list()'), 'a judge cannot list the judges');
for (const tb of ['yb_judges', 'yb_judge_scores', 'yb_admin_scores', 'yb_settings']) denied(await as('j1', `select * from public.${tb}`), `nobody reads ${tb} directly`);

// ================================================================ 2. scoring with reasons
section('2. a judge gives points and writes why');
const js = (who, team_id, criterion, points, reason) => rpc(who, 'yb_judge_score', { team_id, criterion, points, reason });
const mj = async (who) => val(await as(who, 'select public.yb_my_judging() as r'));
const m1 = await mj('j1');
eq([m1.axes, m1.teams.map((t) => t.name)], [['hifz', 'tatbiq'], ['فريق الأمل', 'فريق النور']], 'the judge sees their axes and the approved teams only (no draft)');
eq(m1.teams.every((t) => t.conflict === false), true, 'no conflict for a parent without a child in the teams');
eq((await mj('jk')).teams.find((t) => t.name === 'فريق النور').conflict, true, 'a parent judge sees their child\'s team marked as a conflict');
eq((await mj('pa')).axes, [], 'a parent who is not a judge sees nothing to judge');
denied(await js('pa', TA.id, 'hifz', 8, 'تلاوة جيدة'), 'a parent who is not a judge cannot score');
denied(await js('j2', TA.id, 'execution', 20, 'نفذوا المشروع'), 'a hifz judge cannot score tatbiq');
denied(await js('la', TA.id, 'hifz', 10, 'نحن الأفضل'), 'a leader cannot score');
eq(val(await js('j1', TA.id, 'hifz', 8, ''))?.error, 'reason_required', 'a score without a reason is refused');
eq(val(await js('j1', TA.id, 'hifz', 8, '  ج  '))?.error, 'reason_required', 'a one-letter reason is refused');
eq(val(await js('j1', TA.id, 'hifz', 11, 'ممتاز جدا'))?.error, 'bad_points', 'more than the cap (10) is refused');
eq(val(await js('j1', TA.id, 'hifz', -1, 'خطأ كبير'))?.error, 'bad_points', 'negative points are refused');
eq(val(await js('jk', TA.id, 'hifz', 10, 'تلاوة متقنة'))?.error, 'conflict_of_interest', 'a judge cannot score their own child\'s team');
eq(val(await js('jk', TB.id, 'hifz', 7, 'أخطاء في التجويد في آيتين'))?.ok, true, 'the same judge scores another team');
eq(val(await js('j1', TD.id, 'hifz', 5, 'تجربة'))?.error, 'bad_team', 'a team outside the competition cannot be scored');
fails(await js('j1', TA.id, 'leadership', 5, 'تجربة'), 'invalid_argument', 'an unknown criterion is refused');
eq(val(await js('j1', TA.id, 'hifz', 8, 'تلاوة صحيحة مع تردد في الآية 4'))?.ok, true, 'judge 1: 8 for hifz, with the reason');
eq(val(await js('j2', TA.id, 'hifz', 9, 'حفظ متقن وأداء هادئ'))?.ok, true, 'judge 2: 9 for hifz, with the reason');
eq(val(await js('j1', TA.id, 'roles', 9, 'وزعوا الأدوار على الجميع'))?.ok, true, 'tatbiq: roles');
eq(val(await js('j1', TA.id, 'execution', 25.5, 'نفذوا سقيا الحي مرتين بأنفسهم'))?.ok, true, 'tatbiq: execution, half points allowed');
eq(val(await js('j1', TA.id, 'documentation', 4, 'صور ونتائج واضحة'))?.ok, true, 'tatbiq: documentation');
eq(val(await js('j1', TB.id, 'execution', 20, 'نفذوا نصف الخطة'))?.ok, true, 'judge 1 scores team B too');
eq(val(await js('admin', TB.id, 'fahm', 12, 'أجابوا عن معظم الأسئلة'))?.ok, true, 'the admin judges fahm for team B');
eq((await mj('j1')).teams.find((t) => t.name === 'فريق النور').scores.hifz, { points: 8, reason: 'تلاوة صحيحة مع تردد في الآية 4' }, 'the judge reads back their own score and reason');
eq(val(await js('j1', TB.id, 'execution', null, null))?.ok, true, 'a judge can clear their own score');
eq(val(await js('j1', TB.id, 'execution', 21, 'نفذوا أكثر من نصف الخطة'))?.ok, true, 'and give it again');

// ================================================================ 3. football and chess
section('3. football and chess points: the admin, with a reason');
const as1 = (who, team_id, axis, points, reason) => rpc(who, 'yb_admin_score', { team_id, axis, points, reason });
denied(await as1('off', TA.id, 'football', 18, 'الأول في المجموعة'), 'an officer cannot enter axis points');
denied(await as1('j1', TA.id, 'football', 18, 'الأول في المجموعة'), 'a judge cannot enter football points');
eq(val(await as1('admin', TA.id, 'football', 18, ''))?.error, 'reason_required', 'football points need a reason');
eq(val(await as1('admin', TA.id, 'football', 21, 'بطل الدوري'))?.error, 'bad_points', 'more than 20 is refused');
eq(val(await as1('admin', TA.id, 'football', 18, 'المركز الأول في الدوري'))?.ok, true, 'football 18 for team A');
eq(val(await as1('admin', TA.id, 'chess', 6, 'خرج من الدور الثاني'))?.ok, true, 'chess 6 for team A');
eq(val(await as1('admin', TB.id, 'football', 14, 'المركز الثاني'))?.ok, true, 'football 14 for team B');

// ================================================================ 4. totals before publication
section('4. totals: averages, sums, ranks (admin only before publication)');
const N = (v) => (v === null || v === undefined ? null : Number(v));
const board = val(await as('admin', 'select public.yb_results_board() as r'));
const ta = board.teams.find((t) => t.team_name === 'فريق النور'), tb = board.teams.find((t) => t.team_name === 'فريق الأمل');
eq([ta.hifz, ta.roles, ta.execution, ta.documentation, ta.tatbiq, ta.football, ta.chess, ta.total, ta.rank].map(N), [8.5, 9, 25.5, 4, 38.5, 18, 6, 71, 1], 'team A: hifz is the average of two judges (8.5), tatbiq the sum of its three criteria, total 71, rank 1');
eq([tb.hifz, tb.fahm, tb.tatbiq, tb.football, tb.total, tb.rank].map(N), [7, 12, 21, 14, 54, 2], 'team B: 54, rank 2');
eq(board.published, false, 'not published yet');
ok(board.scores.some((s) => s.judge === 'الحكم الأول' && s.reason === 'تلاوة صحيحة مع تردد في الآية 4'), 'the admin sees every score with the judge\'s name and reason');
denied(await as('la', 'select public.yb_results_board()'), 'a leader cannot read the board');
denied(await as('j1', 'select public.yb_results_board()'), 'a judge cannot read the board');
eq((await as('anon', 'select * from public.yb_public_results()')).rows?.length, 0, 'before publication the public ranking is empty');
eq(val(await as('la', 'select public.yb_my_scores() as r')), { teams: [], published: false }, 'before publication a team sees nothing');
denied(await as('anon', 'select public.yb_my_judging()'), 'a visitor has no judging');
denied(await as('anon', 'select * from public.yb_team_totals()'), 'a visitor cannot call the totals directly');

// ================================================================ 5. publication
section('5. the admin publishes');
denied(await rpc('la', 'yb_publish_results', { publish: true }), 'a leader cannot publish');
denied(await rpc('j1', 'yb_publish_results', { publish: true }), 'a judge cannot publish');
await owner('delete from public.yb_notifications');
eq(val(await rpc('admin', 'yb_publish_results', { publish: true }))?.published, true, 'the admin publishes the results');
const people = (await owner('select count(*)::int n from public.profiles')).rows[0].n;
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'results_published'")).rows[0].n, people - 1, 'everybody else is told (once)');
await rpc('admin', 'yb_publish_results', { publish: true });
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'results_published'")).rows[0].n, people - 1, 'publishing again does not tell them twice');
const pub = (await as('anon', 'select * from public.yb_public_results()')).rows;
eq(pub.map((r) => [r.team_name, Number(r.total), r.rank]), [['فريق النور', 71, 1], ['فريق الأمل', 54, 2]], 'the public ranking: names, totals, ranks');
eq(Object.keys(pub[0]).sort(), ['chess', 'fahm', 'football', 'hifz', 'rank', 'tatbiq', 'team_name', 'total'], 'public rows carry points only (no reasons, no judges, no ids)');
const mine = val(await as('la', 'select public.yb_my_scores() as r'));
eq(mine.teams.map((t) => t.team_name), ['فريق النور'], 'the leader reads their own team only');
eq(mine.teams[0].reasons.length, 5, 'with every judge\'s reason');
ok(!JSON.stringify(mine).includes('الحكم'), 'without the judges\' names');
eq(mine.teams[0].admin.map((a) => a.reason).sort(), ['المركز الأول في الدوري', 'خرج من الدور الثاني'].sort(), 'and the reasons for football and chess');
eq(val(await as('ma', 'select public.yb_my_scores() as r')).teams.map((t) => t.team_name), ['فريق النور'], 'a joined member reads their team');
eq(val(await as('pa', 'select public.yb_my_scores() as r')).teams.map((t) => t.team_name), ['فريق النور'], 'a linked parent reads their child\'s team');
eq(val(await as('lb', 'select public.yb_my_scores() as r')).teams.map((t) => t.team_name), ['فريق الأمل'], 'the other leader reads only theirs');
eq(val(await as('off', 'select public.yb_my_scores() as r')).teams, [], 'an officer has no team to read');
eq(val(await js('j1', TA.id, 'hifz', 10, 'تغيير بعد النشر'))?.error, 'results_published', 'scores are locked once published');
eq(val(await as1('admin', TA.id, 'chess', 8, 'تعديل بعد النشر'))?.error, 'results_published', 'football and chess are locked too');
eq(val(await rpc('admin', 'yb_publish_results', { publish: false }))?.published, false, 'the admin can take the results back down');
eq((await as('anon', 'select * from public.yb_public_results()')).rows?.length, 0, 'taken down: the public ranking is empty again');

// ================================================================ 6. ties
section('6. ties share a rank');
await js('j1', TB.id, 'roles', 10, 'كل عضو له دور واضح');
await js('j1', TB.id, 'documentation', 5, 'توثيق كامل');
await as1('admin', TB.id, 'chess', 2, 'خرج من الدور الأول');
const b2 = val(await as('admin', 'select public.yb_results_board() as r')).teams;
eq(b2.map((t) => [t.team_name, Number(t.total), t.rank]).sort(), [['فريق الأمل', 71, 1], ['فريق النور', 71, 1]], 'two teams on 71 both rank 1');

// ================================================================ 7. tatbiq judges read the accepted projects
section('7. tatbiq judges read the accepted projects and their photos');
await owner("insert into storage.buckets (id, name) values ('yanabee-submissions', 'yanabee-submissions') on conflict do nothing");
const S1 = (await owner('select gen_random_uuid() as u')).rows[0].u, S2 = (await owner('select gen_random_uuid() as u')).rows[0].u;
await owner("insert into public.yb_submissions (id, team_id, kind, title, place, summary, status, photos) values ($1, $2, 'project', 'سقيا الحي', 'neighborhood', 'وزعنا الماء على العمال', 'accepted', $3), ($4, $2, 'activity', 'درس المسجد', 'family', 'درس عن الصدق للأطفال', 'submitted', '{}')",
  [S1, TA.id, `{${TA.id}/${S1}/a.jpg}`, S2]);
await owner("insert into storage.objects (bucket_id, name) values ('yanabee-submissions', $1)", [`${TA.id}/${S1}/a.jpg`]);
eq((await as('j1', 'select title from public.yb_submissions')).rows?.map((r) => r.title), ['سقيا الحي'], 'a tatbiq judge reads the accepted project only (not one waiting)');
eq((await as('j2', 'select title from public.yb_submissions')).rows?.length, 0, 'a hifz judge reads no projects');
eq((await as('j1', 'select name from storage.objects')).rows?.length, 1, 'a tatbiq judge reads its photo');
eq((await as('j2', 'select name from storage.objects')).rows?.length, 0, 'a hifz judge reads no photo');

// ================================================================ 8. removing a judge
section('8. removing a judge');
eq(val(await setJ('admin', U.j2.id, []))?.ok, true, 'the admin removes judge 2');
denied(await js('j2', TA.id, 'hifz', 9, 'محاولة بعد الإزالة'), 'a removed judge cannot score');
eq((await mj('j2')).axes, [], 'a removed judge sees nothing to judge');
eq(Number(val(await as('admin', 'select public.yb_results_board() as r')).teams.find((t) => t.team_name === 'فريق النور').hifz), 8.5, 'their past scores stay in the record');
await owner("update public.profiles set role = 'leader' where id = $1", [U.j1.id]);
denied(await js('j1', TA.id, 'hifz', 9, 'بعد تغيير الدور'), 'a judge whose account stops being a parent cannot score');
ok((await owner("select count(*)::int n from public.audit_log where action in ('judge_set', 'judge_removed', 'results_publish')")).rows[0].n >= 7, 'choices of judges and publications are in the audit log');

finish(t0, 85);
