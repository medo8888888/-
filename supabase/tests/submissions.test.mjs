// Yanabee backend — tests for migration 0008 (project / activity submissions, private photos).
// Applies 0001 -> 0008 in PGlite behind the Supabase emulation in harness.mjs, plus a small
// emulation of Supabase Storage (storage.buckets / storage.objects with RLS, and the trigger that
// refuses direct deletes unless the Storage API sets storage.allow_delete_query).
// Run:  node supabase/tests/submissions.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
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
  create function storage.protect_delete() returns trigger language plpgsql as $f$
  begin
    if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
      raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.' using errcode = '42501';
    end if;
    return null;
  end $f$;
  create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;
`);

const M8 = readMigration('0008_yb_submissions.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql',
  '0005_yb_register_fee.sql', '0006_yb_waitlist_roles.sql', '0007_yb_results.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M8);
console.log(`migrations 0001-0008 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M8), '0008 is ASCII only');
await E.db.exec(M8);
ok(true, '0008 runs twice without error (idempotent)');

// the Storage API, as a signed-in user: upload = insert, remove = delete with the API's flag
const BK = 'yanabee-submissions';
async function storage(who, kind, name) {
  const claims = who === 'anon' ? { role: 'anon' } : { sub: U[who].id, role: 'authenticated' };
  try {
    const r = await E.db.transaction(async (tx) => {
      await tx.exec(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      if (kind === 'up') return tx.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, auth.uid()) returning name', [BK, name]);
      if (kind === 'read') return tx.query('select name from storage.objects where bucket_id = $1 and name = $2', [BK, name]);
      await tx.query("select set_config('storage.allow_delete_query', 'true', true)");
      return tx.query('delete from storage.objects where bucket_id = $1 and name = $2 returning name', [BK, name]);
    });
    return { rows: r.rows, n: r.rows.length };
  } catch (e) { return { error: e.message, code: e.code }; }
}
const up = (who, name) => storage(who, 'up', name);
const see = async (who, name) => (await storage(who, 'read', name)).n ?? -1;
const rm = (who, name) => storage(who, 'rm', name);

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, c] of [['offP', 'projects'], ['offF', 'football']]) {
  await signUp(k, Y('member', 'مسؤول ' + c));
  await rpc('admin', 'set_user_role', { target: U[k].id, new_role: 'officer' });
  await rpc('admin', 'yb_set_officer', { target: U[k].id, competition: c, assign: true });
}
for (const [k, r, n] of [['la', 'leader', 'قائد أ'], ['lb', 'leader', 'قائد ب'], ['lp', 'leader', 'قائد ج'],
  ['ma', 'member', 'سالم أحمد'], ['pa', 'parent', 'ولي يوسف'], ['out', 'member', 'غريب']]) await signUp(k, Y(r, n));

async function team(who, name, approve) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد', 'يوسف علي', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  if (approve) await owner("update public.teams set status = 'approved' where id = $1", [t.id]);
  return t;
}
const TA = await team('la', 'فريق النور', true);
const TB = await team('lb', 'فريق الأمل', true);
const TP = await team('lp', 'فريق الغد', false);
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' }))?.ok, true, 'a parent links a child of team A');
await owner('delete from public.yb_notifications');

const uuid = async () => (await owner('select gen_random_uuid() as u')).rows[0].u;
const S1 = await uuid();
const P = (sid, t = TA, f = 'a.jpg') => `${t.id}/${sid}/${f}`;
const base = (photos = []) => ({ kind: 'project', title: 'سقيا الحي', value_text: 'التعاون', place: 'neighborhood',
  done_on: '2026-11-10', summary: 'وزّعنا الماء على عمّال الحي بعد صلاة العصر.', results: 'استفاد ٤٠ عاملًا', members_n: 5, beneficiaries: 40, photos });
const save = (who, id, team_id, p) => rpc(who, 'yb_save_submission', { id, team_id, p: JSON.stringify(p) });

// ================================================================ 1. the bucket
section('1. the private bucket');
const b = (await owner('select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', [BK])).rows[0];
eq(b?.public, false, 'the bucket is private');
eq(Number(b?.file_size_limit), 5242880, 'files up to 5 MB');
eq(b?.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp'], 'images only');
const pols = (await owner("select policyname from pg_policies where schemaname = 'storage' order by 1")).rows.map((r) => r.policyname);
eq(pols, ['yb_sub_obj_delete', 'yb_sub_obj_insert', 'yb_sub_obj_select', 'yb_sub_obj_select_public'], 'four storage policies (one for the home page), no update policy');

// ================================================================ 2. uploading
section('2. uploading photos');
denied(await up('anon', P(S1)), 'a visitor cannot upload');
denied(await up('ma', P(S1)), 'a member (not the leader) cannot upload');
denied(await up('lb', P(S1)), 'another leader cannot upload into team A');
denied(await up('lp', P(S1, TP)), 'the leader of a team not approved yet cannot upload');
denied(await up('la', `${TA.id}/a.jpg`), 'a path without the submission folder is refused');
denied(await up('la', `${TA.id}/${S1}/x/a.jpg`), 'a deeper path is refused');
denied(await up('la', `${TA.id}/not-a-uuid/a.jpg`), 'a folder that is not an id is refused');
denied(await up('la', `${TB.id}/${S1}/a.jpg`), 'team A leader cannot upload into team B folder');
eq((await up('la', P(S1, TA, 'a.jpg'))).n, 1, 'the leader uploads a photo');
eq((await up('la', P(S1, TA, 'b.jpg'))).n, 1, 'and a second one');
for (const f of ['c', 'd', 'e', 'f']) await up('la', P(S1, TA, f + '.jpg'));
eq((await owner('select count(*)::int n from storage.objects where name like $1', [`${TA.id}/${S1}/%`])).rows[0].n, 6, 'six photos in the folder');
denied(await up('la', P(S1, TA, 'g.jpg')), 'a seventh photo is refused');
for (const f of ['c', 'd', 'e', 'f']) await rm('la', P(S1, TA, f + '.jpg'));
eq((await owner('select count(*)::int n from storage.objects where name like $1', [`${TA.id}/${S1}/%`])).rows[0].n, 2, 'the leader removes four (through the Storage API)');
const direct = await as('la', 'delete from storage.objects where name = $1', [P(S1, TA, 'a.jpg')]);
ok(!!direct.error, 'a direct SQL delete is refused (only the Storage API removes files)');

// ================================================================ 3. saving
section('3. saving a submission');
denied(await save('anon', S1, TA.id, base()), 'a visitor cannot save');
denied(await save('ma', S1, TA.id, base()), 'a member cannot save');
denied(await save('lb', S1, TA.id, base()), 'another leader cannot save for team A');
eq(val(await save('lp', S1, TP.id, base()))?.error, 'team_not_approved', 'a team not approved yet cannot submit');
eq(val(await save('la', S1, TA.id, base([P(S1, TA, 'zzz.jpg')])))?.error, 'bad_photo', 'a photo that was never uploaded is refused');
eq(val(await save('la', S1, TA.id, base([`${TB.id}/${S1}/a.jpg`])))?.error, 'bad_photo', 'a photo outside the own folder is refused');
eq(val(await save('la', S1, TA.id, base(Array.from({ length: 7 }, (_, i) => P(S1, TA, i + '.jpg')))))?.error, 'too_many_photos', 'more than six photos are refused');
eq(val(await save('la', S1, TA.id, { ...base(), done_on: '2026-10-01' }))?.error, 'bad_date', 'a date before the competition is refused');
eq(val(await save('la', S1, TA.id, { ...base(), done_on: '2099-01-01' }))?.error, 'bad_date', 'a date in the future is refused');
eq(val(await save('la', S1, TA.id, { ...base(), done_on: 'أمس' }))?.error, 'bad_date', 'a date that is not a date is refused');
eq(val(await save('la', S1, TA.id, { ...base(), title: 'أ' }))?.error, 'invalid_data', 'a title that is too short is refused');
eq(val(await save('la', S1, TA.id, { ...base(), kind: 'party' }))?.error, 'invalid_data', 'an unknown kind is refused');
eq(val(await save('la', S1, TA.id, { ...base(), place: 'mall' }))?.error, 'invalid_data', 'an unknown place is refused');
eq(val(await save('la', S1, TA.id, { ...base(), members_n: 9 }))?.error, 'invalid_data', 'more than seven members is refused');
eq(val(await save('la', S1, TA.id, { ...base(), summary: 'قصير' }))?.error, 'invalid_data', 'a summary that is too short is refused');
eq((await owner('select count(*)::int n from public.yb_submissions')).rows[0].n, 0, 'nothing was saved by the refused calls');
const r1 = val(await save('la', S1, TA.id, base([P(S1, TA, 'a.jpg'), P(S1, TA, 'b.jpg')])));
eq(r1, { id: S1, ok: true, status: 'submitted' }, 'the leader saves the submission');
const row = (await owner('select * from public.yb_submissions where id = $1', [S1])).rows[0];
eq([row.kind, row.place, row.members_n, row.beneficiaries, row.photos.length, row.submitted_by === U.la.id], ['project', 'neighborhood', 5, 40, 2, true], 'the row holds what was sent');
const notes = (await owner("select user_id from public.yb_notifications where kind = 'submission_new'")).rows.map((r) => r.user_id).sort();
eq(notes, [U.admin.id, U.offP.id].sort(), 'the admin and the projects officer are told (not the football officer)');
eq((await owner("select data->>'team_name' n from public.yb_notifications where kind = 'submission_new' limit 1")).rows[0].n, 'فريق النور', 'the note names the team');
denied(await save('la', S1, TB.id, base()), 'saving the same id under another team is refused');
const S2 = await uuid();
eq(val(await save('la', S2, TA.id, { ...base(), kind: 'activity', title: 'درس في المسجد', done_on: null, photos: [] }))?.ok, true, 'an activity without a date or photos is fine');

// ================================================================ 4. who reads
section('4. who may read');
denied(await as('anon', 'select id from public.yb_submissions'), 'a visitor cannot read submissions');
eq((await as('la', 'select id from public.yb_submissions where id = $1', [S1])).rows?.length, 1, 'the leader reads it');
eq((await as('ma', 'select id from public.yb_submissions where id = $1', [S1])).rows?.length, 1, 'a joined member reads it');
eq((await as('pa', 'select id from public.yb_submissions where id = $1', [S1])).rows?.length, 1, 'a linked parent reads it');
eq((await as('lb', 'select id from public.yb_submissions where id = $1', [S1])).rows?.length, 0, 'another team does not see it');
eq((await as('out', 'select id from public.yb_submissions')).rows?.length, 0, 'a stranger sees nothing');
eq((await as('offF', 'select id from public.yb_submissions')).rows?.length, 0, 'the football officer sees nothing');
eq((await as('offP', 'select id from public.yb_submissions')).rows?.length, 2, 'the projects officer sees both');
eq((await as('admin', 'select id from public.yb_submissions')).rows?.length, 2, 'the admin sees both');
eq(await see('la', P(S1, TA, 'a.jpg')), 1, 'the leader reads the photo');
eq(await see('pa', P(S1, TA, 'a.jpg')), 1, 'a linked parent reads the photo');
eq(await see('offP', P(S1, TA, 'a.jpg')), 1, 'the projects officer reads the photo');
eq(await see('lb', P(S1, TA, 'a.jpg')), 0, 'another leader cannot read the photo');
eq(await see('out', P(S1, TA, 'a.jpg')), 0, 'a stranger cannot read the photo');
eq(await see('offF', P(S1, TA, 'a.jpg')), 0, 'the football officer cannot read the photo');
ok((await see('anon', P(S1, TA, 'a.jpg'))) <= 0, 'a visitor cannot read the photo');
denied(await as('la', "insert into public.yb_submissions (id, team_id, kind, title, place, summary) values (gen_random_uuid(), $1, 'project', 'xxxx', 'family', 'xxxxxxxxxxxx')", [TA.id]), 'the leader cannot insert directly');
denied(await as('la', "update public.yb_submissions set status = 'accepted' where id = $1", [S1]), 'the leader cannot accept their own work');
denied(await as('anon', 'select public.yb_sub_can_read($1)', [P(S1)]), 'a visitor cannot call the storage helpers');

// ================================================================ 5. the queue and the review
section('5. reviewing');
const q = val(await as('offP', 'select jsonb_agg(to_jsonb(q)) as r from public.yb_submissions_queue() q'));
eq(q?.length, 2, 'the projects queue lists both');
eq(q?.[0]?.team_name, 'فريق النور', 'with the team name');
denied(await as('offF', 'select * from public.yb_submissions_queue()'), 'the football officer has no queue');
denied(await as('la', 'select * from public.yb_submissions_queue()'), 'a leader has no queue');
const rev = (who, id, decision, note) => rpc(who, 'yb_review_submission', note === undefined ? { id, decision } : { id, decision, note });
denied(await rev('la', S1, 'accept'), 'the leader cannot review');
denied(await rev('offF', S1, 'accept'), 'the football officer cannot review');
fails(await rev('offP', S1, 'return'), 'note_required', 'returning needs a note');
fails(await rev('offP', S1, 'maybe'), 'invalid_argument', 'an unknown decision is refused');
await owner('delete from public.yb_notifications');
eq(val(await rev('offP', S1, 'return', 'أضيفوا صورة للعمل نفسه'))?.status, 'returned', 'the officer returns it with a note');
const back = (await owner("select user_id from public.yb_notifications where kind = 'submission_reviewed'")).rows.map((r) => r.user_id).sort();
eq(back, [U.la.id, U.ma.id, U.pa.id].sort(), 'the leader, the member and the parent are told');
eq((await owner("select data->>'note' n from public.yb_notifications where kind = 'submission_reviewed' limit 1")).rows[0].n, 'أضيفوا صورة للعمل نفسه', 'with the note');
eq((await owner("select count(*)::int n from public.audit_log where action = 'submission_review'")).rows[0].n, 1, 'the review is in the audit log');
eq((await up('la', P(S1, TA, 'c.jpg'))).n, 1, 'a returned submission takes new photos');
eq(val(await save('la', S1, TA.id, base([P(S1, TA, 'a.jpg'), P(S1, TA, 'c.jpg')])))?.status, 'submitted', 'the leader fixes it and sends it again');
eq((await rm('la', P(S1, TA, 'b.jpg'))).n, 1, 'and removes the dropped photo');
eq(val(await rev('offP', S1, 'accept'))?.status, 'accepted', 'the officer accepts it');
eq(val(await save('la', S1, TA.id, base()))?.error, 'invalid_status', 'an accepted submission is locked for the leader');
denied(await up('la', P(S1, TA, 'd.jpg')), 'no new photos once accepted');
eq((await rm('la', P(S1, TA, 'a.jpg'))).n ?? 0, 0, 'and no photo can be removed once accepted');
eq(val(await rev('offP', S1, 'reject'))?.error, 'invalid_status', 'the officer cannot change a decision');
eq(val(await rev('admin', S1, 'return', 'راجعوا النتائج'))?.status, 'returned', 'the admin can reopen it');

// ================================================================ 6. withdrawing and limits
section('6. withdrawing and limits');
denied(await rpc('lb', 'yb_delete_submission', { id: S2 }), 'another leader cannot withdraw it');
eq(val(await rpc('la', 'yb_delete_submission', { id: S2 }))?.ok, true, 'the leader withdraws the activity');
eq(val(await rpc('la', 'yb_delete_submission', { id: S2 }))?.error, 'not_found', 'it is gone');
eq(val(await rev('offP', S1, 'accept'))?.error, 'invalid_status', 'a returned one waits for the team');
await owner("update public.yb_submissions set status = 'accepted' where id = $1", [S1]);
eq(val(await rpc('la', 'yb_delete_submission', { id: S1 }))?.error, 'invalid_status', 'an accepted one cannot be withdrawn');
for (let i = 0; i < 11; i++) await save('la', await uuid(), TA.id, { ...base(), title: 'نشاط ' + (i + 1) });
eq((await owner('select count(*)::int n from public.yb_submissions where team_id = $1', [TA.id])).rows[0].n, 12, 'twelve submissions for the team');
eq(val(await save('la', await uuid(), TA.id, base()))?.error, 'too_many', 'a thirteenth is refused');
await owner('insert into storage.objects (bucket_id, name) select $1, $2 || gen_random_uuid() || $3 from generate_series(1, 71)', [BK, `${TA.id}/`, '/x.jpg']);
const S3 = await uuid();
denied(await up('la', P(S3, TA, 'a.jpg')), 'a team with 72 files cannot upload more');

// ================================================================ 7. the home page (the admin picks)
section('7. the public showcase');
const pub = async (who) => (await as(who, 'select * from public.yb_public_projects()')).rows;
const photos1 = (await owner('select photos from public.yb_submissions where id = $1', [S1])).rows[0].photos;
eq(photos1, [P(S1, TA, 'a.jpg'), P(S1, TA, 'c.jpg')], 'the accepted work has two photos');
eq((await pub('anon')).length, 0, 'nothing is public before the admin picks');
ok((await see('anon', photos1[0])) <= 0, 'a visitor cannot read the photo yet');
const feat = (who, id, show) => rpc(who, 'yb_feature_submission', { id, show });
denied(await feat('anon', S1, true), 'a visitor cannot feature');
denied(await feat('la', S1, true), 'the leader cannot feature their own work');
denied(await feat('offP', S1, true), 'the projects officer cannot feature (the admin picks)');
const open1 = (await owner("select id from public.yb_submissions where team_id = $1 and status = 'submitted' limit 1", [TA.id])).rows[0].id;
eq(val(await feat('admin', open1, true))?.error, 'invalid_status', 'work that is not accepted cannot go public');
denied(await as('la', 'update public.yb_submissions set featured = true where id = $1', [S1]), 'the leader cannot set it directly');
ok(await owner('update public.yb_submissions set featured = true where id = $1', [open1]).then(() => false, (e) => /yb_sub_featured_chk/.test(e.message)), 'the table refuses featured work that is not accepted');
await owner('delete from public.yb_notifications');
eq(val(await feat('admin', S1, true)), { ok: true, featured: true }, 'the admin puts the accepted work on the home page');
const fn = (await owner("select user_id from public.yb_notifications where kind = 'submission_featured'")).rows.map((r) => r.user_id).sort();
eq(fn, [U.la.id, U.ma.id, U.pa.id].sort(), 'the team (leader, member, parent) is told');
eq((await owner("select count(*)::int n from public.audit_log where action = 'submission_feature'")).rows[0].n, 1, 'it is in the audit log');
const p1 = await pub('anon');
eq(p1.length, 1, 'a visitor now sees one project');
eq([p1[0].team_name, p1[0].title, p1[0].place, p1[0].photos.length], ['فريق النور', 'سقيا الحي', 'neighborhood', 2], 'with the team name, title, place and photos');
eq(Object.keys(p1[0]).sort(), ['beneficiaries', 'done_on', 'featured_at', 'id', 'kind', 'photos', 'place', 'results', 'summary', 'team_name', 'title', 'value_text'], 'and nothing else (no review note, no people, no team id)');
eq(await see('anon', photos1[0]), 1, 'a visitor reads its photo');
eq(await see('out', photos1[1]), 1, 'so does a stranger who is signed in');
await up('la', P(S3, TA, 'z.jpg'));
eq(await see('anon', `${TB.id}/${S1}/zz.jpg`), 0, 'a visitor still cannot read other files');
denied(await as('anon', 'select * from public.yb_submissions'), 'and still cannot read the table itself');
denied(await up('la', P(S1, TA, 'n.jpg')), 'featured work takes no new photos');
eq((await rm('la', photos1[0])).n ?? 0, 0, 'and its photos cannot be removed by the leader');
eq(val(await feat('admin', S1, true))?.featured, true, 'featuring twice is harmless');
eq(val(await rev('admin', S1, 'return', 'صحّحوا التاريخ'))?.status, 'returned', 'the admin returns it later');
eq((await owner('select featured from public.yb_submissions where id = $1', [S1])).rows[0].featured, false, 'returning takes it off the home page');
eq((await pub('anon')).length, 0, 'the visitor no longer sees it');
ok((await see('anon', photos1[0])) <= 0, 'nor its photo');
await owner("update public.yb_submissions set status = 'accepted' where id = $1", [S1]);
eq(val(await feat('admin', S1, true))?.featured, true, 'accepted again, the admin can show it again');
eq(val(await feat('admin', S1, false)), { ok: true, featured: false }, 'and hide it');
eq((await pub('anon')).length, 0, 'hidden: off the home page');

finish(t0, 120);
