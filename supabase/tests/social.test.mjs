// Yanabee backend — tests for migration 0011 (the news feed, customization, the leader handover, the statistics).
// Applies 0001 -> 0011 in PGlite behind the Supabase emulation in harness.mjs, plus the small Storage emulation
// used by submissions.test.mjs (storage.objects with RLS and the trigger that refuses direct deletes).
// Run:  node supabase/tests/social.test.mjs
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

const M = readMigration('0011_yb_social.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
console.log(`migrations 0001-0011 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M), '0011 is ASCII only');
await E.db.exec(M);
ok(true, '0011 runs twice without error (idempotent)');

// the Storage API, as a signed-in user: upload = insert, read = select, remove = delete with the API's flag
async function storage(who, kind, bucket, name) {
  const claims = who === 'anon' ? { role: 'anon' } : { sub: U[who].id, role: 'authenticated' };
  try {
    const r = await E.db.transaction(async (tx) => {
      await tx.exec(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      if (kind === 'up') return tx.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, auth.uid()) returning name', [bucket, name]);
      if (kind === 'read') return tx.query('select name from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
      await tx.query("select set_config('storage.allow_delete_query', 'true', true)");
      return tx.query('delete from storage.objects where bucket_id = $1 and name = $2 returning name', [bucket, name]);
    });
    return { rows: r.rows, n: r.rows.length };
  } catch (e) { return { error: e.message, code: e.code }; }
}
const FB = 'yanabee-feed', AB = 'yanabee-avatars';
const up = (who, b, name) => storage(who, 'up', b, name);
const see = async (who, b, name) => (await storage(who, 'read', b, name)).n ?? -1;
const rm = (who, b, name) => storage(who, 'rm', b, name);

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول المشاريع'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['lx', 'leader', 'قائد بلا فريق'],
  ['ma', 'member', 'سالم أحمد العلي'], ['mb', 'member', 'زيد محمود'], ['pa', 'parent', 'ولي يوسف'], ['pb', 'parent', 'ولي جديد']]) await signUp(k, Y(r, n));

async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  await owner("update public.teams set status = 'approved' where id = $1", [t.id]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('mb', 'join_team', { code: TB.join_code, member_name: 'زيد محمود' }))?.ok, true, 'a member joins team B');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'يوسف علي' }))?.ok, true, 'a parent links a child of team A');
await owner('delete from public.yb_notifications');

const uuid = async () => (await owner('select gen_random_uuid() as u')).rows[0].u;
const save = (who, id, body, photos = []) => as(who, 'select public.yb_post_save(id => $1, body => $2, photos => $3::text[]) as r', [id, body, '{' + photos.map((p) => '"' + p + '"').join(',') + '}']);
const feed = async (who, before = null) => val(await as(who, 'select public.yb_feed(before => $1::timestamptz) as r', [before]));
const unthrottle = () => owner("update public.yb_posts set created_at = created_at - interval '1 minute'");
const notes = async (kind) => (await owner('select user_id from public.yb_notifications where kind = $1 order by user_id', [kind])).rows.map((r) => r.user_id);

// ================================================================ 1. settings
section('1. personal settings');
const p0 = val(await rpc('pa', 'yb_my_prefs'));
eq([p0.theme, p0.accent, p0.text_size, p0.can_avatar], ['auto', 'teal', 'm', true], 'defaults before anything is saved; a parent may show a picture');
eq(val(await rpc('ma', 'yb_my_prefs'))?.can_avatar, false, 'a member (child) may not');
const s1 = val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ theme: 'dark', accent: 'purple', text_size: 'l', hidden_sections: ['room'], notify_off: ['projects'] }) }));
eq([s1?.ok, s1?.prefs?.theme, s1?.prefs?.accent, s1?.prefs?.text_size, s1?.prefs?.hidden_sections, s1?.prefs?.notify_off], [true, 'dark', 'purple', 'l', ['room'], ['projects']], 'a parent saves theme, accent, size, hidden sections and notification choices');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ accent: 'gold' }) }))?.error, 'invalid_data', 'an unknown accent is refused');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ notify_off: ['team_status'] }) }))?.error, 'invalid_data', 'essential notes cannot be turned off');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ text_size: 'xl' }) }))?.prefs?.theme, 'dark', 'a partial save keeps the rest');
denied(await rpc('anon', 'yb_my_prefs'), 'a visitor has no settings');
denied(await as('ma', 'select * from public.yb_profile_prefs'), 'nobody reads the settings table directly');

section('2. profile pictures');
denied(await up('ma', AB, `${U.ma.id}/me.webp`), 'a member (child) cannot upload a picture');
denied(await up('pa', AB, `${U.pb.id}/me.webp`), 'nobody uploads into another person\'s folder');
denied(await up('pa', AB, `${U.pa.id}/x/me.webp`), 'a deeper path is refused');
eq((await up('pa', AB, `${U.pa.id}/me.webp`)).n, 1, 'a parent uploads a picture into their own folder');
eq(val(await rpc('ma', 'yb_save_prefs', { p: JSON.stringify({ avatar: `${U.ma.id}/me.webp` }) }))?.error, 'avatar_adults_only', 'a member cannot set a picture');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ avatar: `${U.pb.id}/me.webp` }) }))?.error, 'bad_photo', 'someone else\'s file is refused');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ avatar: `${U.pa.id}/nope.webp` }) }))?.error, 'bad_photo', 'a file that was never uploaded is refused');
eq(val(await rpc('pa', 'yb_save_prefs', { p: JSON.stringify({ avatar: `${U.pa.id}/me.webp` }) }))?.prefs?.avatar_path, `${U.pa.id}/me.webp`, 'the parent sets the picture');
eq(await see('mb', AB, `${U.pa.id}/me.webp`), 1, 'signed-in people see pictures');
ok((await see('anon', AB, `${U.pa.id}/me.webp`)) <= 0, 'a visitor does not');
for (const f of ['b', 'c']) await up('pa', AB, `${U.pa.id}/${f}.webp`);
denied(await up('pa', AB, `${U.pa.id}/d.webp`), 'at most three files per person');
eq((await rm('pa', AB, `${U.pa.id}/c.webp`)).n, 1, 'a person removes their own old file');
eq((await rm('pb', AB, `${U.pa.id}/b.webp`)).n ?? 0, 0, 'but not someone else\'s');

section('3. notification choices');
await owner("select public.yb_notify(array[$1, $2]::uuid[], 'submission_reviewed', '{}'::jsonb)", [U.pa.id, U.pb.id]);
eq(await notes('submission_reviewed'), [U.pb.id], 'a projects note skips the parent who turned projects off');
await owner("select public.yb_notify(array[$1, $2]::uuid[], 'team_status', '{}'::jsonb)", [U.pa.id, U.pb.id]);
eq((await notes('team_status')).length, 2, 'an essential note reaches everybody');
denied(await as('pa', "select public.yb_notify(array[$1]::uuid[], 'announcement', '{}'::jsonb)", [U.pb.id]), 'nobody calls yb_notify directly');
await owner('delete from public.yb_notifications');

section('4. team identity');
eq(val(await rpc('la', 'yb_set_team_style', { team_id: TA.id, color: 'purple', badge: 'moon' }))?.ok, true, 'the leader sets the team color and badge');
denied(await rpc('lb', 'yb_set_team_style', { team_id: TA.id, color: 'red', badge: 'bolt' }), 'another leader cannot');
denied(await rpc('ma', 'yb_set_team_style', { team_id: TA.id, color: 'red', badge: 'bolt' }), 'a member cannot');
eq(val(await rpc('la', 'yb_set_team_style', { team_id: TA.id, color: 'gold', badge: 'moon' }))?.error, 'invalid_data', 'an unknown color is refused');
eq(val(await rpc('admin', 'yb_set_team_style', { team_id: TB.id, color: 'green', badge: 'ball' }))?.ok, true, 'the admin sets any team');
eq((await as('anon', 'select color, badge from public.yb_team_style where team_id = $1', [TA.id])).rows?.[0], { color: 'purple', badge: 'moon' }, 'team colors are public (no personal data)');
denied(await as('anon', 'select updated_by from public.yb_team_style'), 'but not who changed them');

// ================================================================ 5. posts
section('5. posts');
const P1 = await uuid(), P2 = await uuid(), P3 = await uuid();
denied(await save('ma', P1, 'مرحبا'), 'a member cannot post');
denied(await save('pa', P1, 'مرحبا'), 'a parent cannot post');
denied(await save('off', P1, 'مرحبا'), 'an officer cannot post');
eq(val(await save('lx', P1, 'مرحبا'))?.error, 'no_team', 'a leader without a team cannot post');
denied(await up('ma', FB, `${U.ma.id}/${P1}/a.jpg`), 'a member cannot upload feed photos');
denied(await up('la', FB, `${U.lb.id}/${P1}/a.jpg`), 'a leader cannot upload into another folder');
eq((await up('la', FB, `${U.la.id}/${P1}/a.jpg`)).n, 1, 'the leader uploads a photo for the new post');
for (const f of ['b', 'c', 'd']) await up('la', FB, `${U.la.id}/${P1}/${f}.jpg`);
denied(await up('la', FB, `${U.la.id}/${P1}/e.jpg`), 'at most four photos per post');
eq(val(await save('la', P1, 'تدريبنا اليوم', [`${U.la.id}/${P1}/zz.jpg`]))?.error, 'bad_photo', 'a photo that was never uploaded is refused');
eq(val(await save('la', P1, 'تدريبنا اليوم', [`${U.lb.id}/${P1}/a.jpg`]))?.error, 'bad_photo', 'a photo outside the post folder is refused');
eq(val(await save('la', P1, '   '))?.error, 'invalid_data', 'an empty post is refused');
eq(val(await save('la', P1, 'تدريبنا اليوم بعد العصر', [`${U.la.id}/${P1}/a.jpg`, `${U.la.id}/${P1}/b.jpg`])), { id: P1, ok: true, status: 'pending' }, 'a leader\'s post waits for the admin');
eq(await notes('post_pending'), [U.admin.id], 'the admin is told');
eq(val(await save('la', P2, 'ثانية'))?.error, 'too_fast', 'a second post right away is refused');
eq((await feed('ma')).posts.length, 0, 'a waiting post is not in anyone else\'s feed');
const lf = await feed('la');
eq([lf.posts.length, lf.posts[0]?.status, lf.posts[0]?.mine, lf.can_post], [1, 'pending', true, true], 'the author sees it, marked waiting');
eq(lf.posts[0]?.team_color, 'purple', 'with the team color');
eq(await see('pa', FB, `${U.la.id}/${P1}/a.jpg`), 0, 'nobody else reads the photo of a waiting post');
eq(await see('la', FB, `${U.la.id}/${P1}/a.jpg`), 1, 'the author does');
eq(await see('admin', FB, `${U.la.id}/${P1}/a.jpg`), 1, 'the admin does');
const af = await feed('admin');
eq([af.queue?.length, af.admin, af.reports], [1, true, 0], 'the admin sees the waiting post in the queue');
eq(val(await save('admin', P3, 'أهلًا بكم في أخبار ينابيع'))?.status, 'published', 'the admin\'s post is published at once');

section('6. moderation');
const mod = (who, id, action, note) => rpc(who, 'yb_post_moderate', note === undefined ? { id, action } : { id, action, note });
denied(await mod('la', P1, 'publish'), 'a leader cannot publish');
denied(await mod('off', P1, 'publish'), 'an officer cannot publish');
eq(val(await mod('admin', P1, 'pin'))?.error, 'invalid_status', 'a waiting post cannot be pinned');
fails(await mod('admin', P1, 'boost'), 'invalid_argument', 'an unknown action is refused');
eq(val(await mod('admin', P1, 'reject', 'أضيفوا موافقة الأهل على الصورة الثانية'))?.ok, true, 'the admin returns it with a note');
const rj = (await feed('la')).posts.find((x) => x.id === P1);
eq([rj?.status, rj?.review_note], ['rejected', 'أضيفوا موافقة الأهل على الصورة الثانية'], 'the author sees why');
eq((await feed('ma')).posts.find((x) => x.id === P1)?.review_note, undefined, 'others never see the note');
eq(val(await save('la', P1, 'تدريبنا اليوم بعد العصر', [`${U.la.id}/${P1}/a.jpg`]))?.status, 'pending', 'fixed, it goes back to the admin');
eq((await rm('la', FB, `${U.la.id}/${P1}/b.jpg`)).n, 1, 'and the leader removes the dropped photo');
eq(val(await mod('admin', P1, 'publish'))?.ok, true, 'the admin publishes it');
eq(await notes('post_reviewed'), [U.la.id, U.la.id], 'the author is told each time (returned, published)');
eq(await see('pa', FB, `${U.la.id}/${P1}/a.jpg`), 1, 'now signed-in people read its photo');
ok((await see('anon', FB, `${U.la.id}/${P1}/a.jpg`)) <= 0, 'a visitor never does');
eq(await see('pa', FB, `${U.la.id}/${P1}/c.jpg`), 0, 'a file that is not in the post stays closed');
eq(val(await mod('admin', P3, 'pin'))?.ok, true, 'the admin pins a post');
const mf = await feed('mb');
eq(mf.posts.map((x) => x.id), [P3, P1], 'pinned first, then newest');
eq([mf.can_post, mf.can_comment, mf.admin, mf.queue], [false, false, false, null], 'a member reads only (comments are off for members)');
eq(mf.posts[1]?.author_name, 'قائد النور', 'a grown-up shows by full name');
await unthrottle();
const P4 = await uuid();
eq(val(await save('admin', P4, 'خبر أقدم'))?.ok, true, 'another admin post');
await owner("update public.yb_posts set published_at = now() - interval '2 days' where id = $1", [P4]);
const page1 = await feed('mb');
eq(page1.posts.map((x) => x.id), [P3, P1, P4], 'the older post comes last');
const before = page1.posts.find((x) => x.id === P1).at;
eq((await feed('mb', before)).posts.map((x) => x.id), [P4], 'a next page starts after a given post, without the pinned one');
eq(val(await mod('admin', P1, 'hide'))?.ok, true, 'the admin hides a post');
eq((await feed('ma')).posts.some((x) => x.id === P1), false, 'hidden: off the feed');
eq((await feed('admin')).posts.find((x) => x.id === P1)?.status, 'hidden', 'the admin still sees it, marked hidden');
eq(await see('pa', FB, `${U.la.id}/${P1}/a.jpg`), 0, 'its photo closes again');
eq(val(await mod('admin', P1, 'show'))?.ok, true, 'and shows it again');
eq(val(await save('la', P1, 'تدريبنا اليوم بعد العصر (معدّل)', [`${U.la.id}/${P1}/a.jpg`]))?.status, 'pending', 'a leader who edits a published post sends it back to the admin');
await mod('admin', P1, 'publish');
ok((await owner("select count(*)::int n from public.audit_log where action like 'post_%'")).rows[0].n >= 5, 'moderation is in the audit log');

// ================================================================ 7. reactions
section('7. reactions');
const react = (who, post_id, kind) => rpc(who, 'yb_react', { post_id, kind });
eq(val(await react('ma', P1, 'clap'))?.reactions, { clap: 1 }, 'a member reacts');
eq(val(await react('pa', P1, 'clap'))?.reactions, { clap: 2 }, 'a parent too');
const ch = val(await react('ma', P1, 'heart'));
eq([ch?.reactions, ch?.mine], [{ clap: 1, heart: 1 }, 'heart'], 'one reaction per person: changing it moves the count');
eq(val(await react('ma', P1, null))?.reactions, { clap: 1 }, 'and it can be taken back');
fails(await react('ma', P1, 'angry'), 'invalid_argument', 'only the four reactions');
denied(await react('anon', P1, 'clap'), 'a visitor cannot react');
const P5 = await uuid();
await unthrottle();
await save('la', P5, 'منشور ينتظر');
eq(val(await react('pa', P5, 'clap'))?.error, 'not_found', 'nobody reacts to a waiting post');
eq((await feed('pa')).posts.find((x) => x.id === P1)?.my_reaction, 'clap', 'the feed shows my reaction');

// ================================================================ 8. comments
section('8. comments');
const say = (who, post_id, body) => rpc(who, 'yb_comment_post', { post_id, body });
const list = async (who, post_id) => (await as(who, 'select * from public.yb_comments($1)', [post_id]));
eq(val(await say('pa', P1, 'ما شاء الله، بارك الله فيكم'))?.ok, true, 'a parent comments');
eq(await notes('comment_new'), [U.la.id], 'the author of the post is told');
denied(await say('ma', P1, 'رائع'), 'a member cannot comment while the admin keeps it off');
denied(await rpc('la', 'yb_set_members_comment', { allow: true }), 'only the admin decides that');
eq(val(await rpc('admin', 'yb_set_members_comment', { allow: true }))?.allow, true, 'the admin turns members\' comments on');
eq((await feed('ma')).can_comment, true, 'now the member may');
eq(val(await say('ma', P1, 'رائع يا فريق'))?.ok, true, 'the member comments');
eq((await list('lb', P1)).rows?.map((r) => r.author_name), ['ولي يوسف', 'سالم'], 'a member shows by first name only');
await owner("update public.yb_post_comments set created_at = created_at - interval '5 seconds'");
eq(val(await say('ma', P1, 'رقمي 0530 517 5431'))?.error, 'contact_not_allowed', 'a phone number is refused');
eq(val(await say('ma', P1, 'راسلني على a.b@mail.com'))?.error, 'contact_not_allowed', 'an e-mail address is refused');
eq(val(await say('pa', P1, 'تعليق ثان'))?.ok, true, 'a second comment a few seconds later is fine');
eq(val(await say('pa', P1, 'تعليق ثالث'))?.error, 'too_fast', 'but not within three seconds');
eq(val(await say('pa', P5, 'تعليق'))?.error, 'not_found', 'no comments on a waiting post');
denied(await list('pa', P5), 'nor reading them');
const cm = (await list('lb', P1)).rows.find((r) => r.author_name === 'سالم');
eq(val(await rpc('ma', 'yb_comment_report', { id: cm.id }))?.error, 'invalid_argument', 'nobody reports their own comment');
eq(val(await rpc('lb', 'yb_comment_report', { id: cm.id, reason: 'خارج الموضوع' }))?.ok, true, 'another leader reports it');
eq(await notes('comment_report'), [U.admin.id], 'the admin is told');
eq((await feed('admin')).reports, 1, 'the admin feed counts the open report');
const rep = (await as('admin', 'select * from public.yb_feed_reports()')).rows;
eq([rep?.length, rep?.[0]?.reports, rep?.[0]?.reasons], [1, 1, ['خارج الموضوع']], 'the reports list shows the reason');
denied(await as('la', 'select * from public.yb_feed_reports()'), 'a leader has no reports list');
eq(val(await rpc('admin', 'yb_comment_moderate', { id: cm.id, action: 'hide' }))?.ok, true, 'the admin hides the comment');
const hid = (await list('pb', P1)).rows.find((r) => r.id === cm.id);
eq([hid?.hidden, hid?.body], [true, null], 'others see that a comment was hidden, not its text');
eq((await list('admin', P1)).rows.find((r) => r.id === cm.id)?.body, 'رائع يا فريق', 'the admin still reads it');
eq((await feed('admin')).reports, 0, 'hiding closes the report');
eq(val(await rpc('admin', 'yb_comment_mute', { id: cm.id, hours: 24 }))?.ok, true, 'the admin mutes the author for a day');
await owner("update public.yb_post_comments set created_at = created_at - interval '5 seconds'");
eq(val(await say('ma', P1, 'مرة أخرى'))?.error, 'chat_muted', 'a muted person cannot comment');
const pcs = (await list('pa', P1)).rows.filter((r) => r.mine);
denied(await rpc('lb', 'yb_comment_delete', { id: pcs[0].id }), 'nobody deletes someone else\'s comment');
for (const c of pcs) eq(val(await rpc('pa', 'yb_comment_delete', { id: c.id }))?.ok, true, 'the author deletes their own comment');
eq((await feed('pa')).posts.find((x) => x.id === P1)?.comments, 0, 'the count follows (hidden ones are not counted for others)');
denied(await as('pa', 'select * from public.yb_post_comments'), 'nobody reads the comments table directly');

// ================================================================ 9. the handover
section('9. demoting a leader and handing the team over');
fails(await rpc('admin', 'set_user_role', { target: U.la.id, new_role: 'parent' }), 'leads_team', 'a leader who leads a team is not demoted directly');
eq(val(await rpc('admin', 'set_user_role', { target: U.lx.id, new_role: 'parent' }))?.ok, true, 'a leader without a team is');
const tr = (args) => rpc('admin', 'yb_transfer_team', args);
denied(await rpc('la', 'yb_transfer_team', { team_id: TA.id, new_leader: U.pb.id, old_stays: false, old_role: 'parent' }), 'only the admin hands a team over');
eq(val(await tr({ team_id: TA.id, new_leader: U.off.id, old_stays: false, old_role: 'parent' }))?.error, 'bad_new_leader', 'an officer cannot take a team');
eq(val(await tr({ team_id: TA.id, new_leader: U.lb.id, old_stays: false, old_role: 'parent' }))?.error, 'leads_other_team', 'nor the leader of another team');
eq(val(await tr({ team_id: TA.id, new_leader: U.mb.id, old_stays: false, old_role: 'parent' }))?.error, 'in_other_team', 'nor a member of another team');
fails(await tr({ team_id: TA.id, new_leader: U.pb.id, old_stays: false, old_role: 'officer' }), 'invalid_argument', 'the old leader becomes a parent or a member, nothing else');
await owner('delete from public.yb_notifications');
eq(val(await tr({ team_id: TA.id, new_leader: U.pb.id, old_stays: false, old_role: 'parent' }))?.ok, true, 'the admin hands team A to a parent');
const ta = (await owner('select leader_id from public.teams where id = $1', [TA.id])).rows[0];
const roles = (await owner('select id, role::text r from public.profiles where id = any($1::uuid[])', [[U.la.id, U.pb.id]])).rows;
eq([ta.leader_id === U.pb.id, roles.find((r) => r.id === U.pb.id).r, roles.find((r) => r.id === U.la.id).r], [true, 'leader', 'parent'], 'the new leader leads; the old one is a parent now');
const lead = (await owner('select user_id from public.team_members where team_id = $1 and is_leader', [TA.id])).rows;
eq([lead.length, lead[0]?.user_id === U.pb.id], [1, true], 'the team has exactly one leader row, the new leader');
eq((await owner('select count(*)::int n from public.team_members where team_id = $1 and user_id = $2', [TA.id, U.la.id])).rows[0].n, 0, 'the old leader left the team');
eq([(await notes('team_leader_new'))[0] === U.pb.id, (await notes('team_leader_left'))[0] === U.la.id], [true, true], 'both are told');
eq((await as('pb', 'select id from public.teams where id = $1', [TA.id])).rows?.length, 1, 'the new leader reads the team');
eq(val(await rpc('pb', 'yb_set_team_style', { team_id: TA.id, color: 'blue', badge: 'star' }))?.ok, true, 'and manages it');
denied(await rpc('la', 'yb_set_team_style', { team_id: TA.id, color: 'red', badge: 'star' }), 'the old leader no longer does');
eq(val(await tr({ team_id: TA.id, new_leader: U.ma.id, old_stays: true }))?.ok, true, 'handing over again, to a member of the team; the parent stays as a member');
const rows2 = (await owner('select user_id, is_leader from public.team_members where team_id = $1 and user_id = any($2::uuid[]) order by is_leader', [TA.id, [U.ma.id, U.pb.id]])).rows;
eq(rows2.map((r) => [r.user_id === U.pb.id, r.is_leader]), [[true, false], [false, true]], 'the member\'s own row becomes the leader row; the parent stays as a plain member');
eq((await owner('select role::text r from public.profiles where id = $1', [U.pb.id])).rows[0].r, 'member', 'the old leader who stays is a member now');
eq((await owner('select count(*)::int n from public.team_members where team_id = $1', [TA.id])).rows[0].n, 5, 'the team keeps its size');
for (const n of ['أ', 'ب']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [TA.id, 'عضو ' + n]);
eq(val(await tr({ team_id: TA.id, new_leader: U.pa.id, old_stays: true }))?.error, 'team_full', 'a full team (7) cannot take an outsider while the old leader stays');
ok((await owner("select count(*)::int n from public.audit_log where action in ('team_transfer', 'role_change')")).rows[0].n >= 3, 'role changes and handovers are in the audit log');

// ================================================================ 10. statistics
section('10. statistics');
const st = val(await rpc('admin', 'yb_analytics'));
eq(Object.keys(st || {}).sort(), ['accounts', 'feed', 'generated_at', 'goals', 'judging', 'matches', 'members', 'notes', 'projects', 'teams'], 'one call returns every group');
eq(st.teams.by_status.approved, 2, 'teams by status');
eq([st.members.total, st.members.minors], [12, 10], 'members, and how many are children');
eq(st.feed.by_status.published, 3, 'posts by status');
eq(st.feed.per_day.length, 30, 'thirty days of feed activity');
eq(st.teams.list.length, 2, 'a row per team in the competition');
ok(!JSON.stringify(st).includes('سالم') && !JSON.stringify(st).includes('@example'), 'no child names and no e-mail addresses in the numbers');
denied(await rpc('la', 'yb_analytics'), 'a leader has no statistics');
denied(await rpc('anon', 'yb_analytics'), 'nor a visitor');

// ================================================================ 11. privileges
section('11. what a visitor gets');
denied(await rpc('anon', 'yb_feed'), 'a visitor has no feed');
denied(await as('anon', 'select * from public.yb_posts'), 'nor the posts table');
denied(await as('lb', 'select * from public.yb_posts'), 'even signed in, posts come through the functions only');
denied(await as('anon', 'select * from public.yb_comments($1)', [P1]), 'a visitor reads no comments');
denied(await rpc('anon', 'yb_comment_post', { post_id: P1, body: 'x' }), 'nor writes any');
denied(await rpc('pa', 'yb_post_delete', { id: P1 }), 'nobody but the author or the admin deletes a post');
eq(val(await rpc('admin', 'yb_post_delete', { id: P4 }))?.ok, true, 'the admin deletes a post');

finish(t0, 120);
