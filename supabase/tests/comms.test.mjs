// Yanabee backend — tests for migration 0009 (announcements, the supervised leaders room).
// Applies 0001 -> 0009 in PGlite behind the Supabase emulation in harness.mjs (0008 needs a storage schema: a minimal one is made).
// Run:  node supabase/tests/comms.test.mjs
import { makeEnv, makeAsserts, readMigration } from './harness.mjs';

process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const { ok, eq, denied, fails, section, finish } = makeAsserts();
const E = await makeEnv();
const { U, owner, as, signUp, rpc, val } = E;
const t0 = Date.now();
await E.db.exec(`
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
`);
const M9 = readMigration('0009_yb_announcements_chat.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M9);
console.log(`migrations 0001-0009 applied in ${Date.now() - t0} ms`);
ok(/^[\x00-\x7F]*$/.test(M9), '0009 is ASCII only');
await E.db.exec(M9);
ok(true, '0009 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول الكرة'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ma', 'member', 'سالم'], ['pa', 'parent', 'ولي يوسف']]) await signUp(k, Y(r, n));
await owner('delete from public.yb_notifications');

// ================================================================ 1. announcements
section('1. announcements');
const save = (who, a) => rpc(who, 'yb_announce_save', { id: a.id ?? null, title: a.title, body: a.body, audience: a.audience, published: a.published });
denied(await save('la', { title: 'تجربة', body: 'نص', audience: 'all', published: true }), 'a leader cannot write an announcement');
denied(await save('off', { title: 'تجربة', body: 'نص', audience: 'all', published: true }), 'an officer cannot write an announcement');
denied(await as('admin', "insert into public.yb_announcements (title, body) values ('xx', 'yy')"), 'nobody writes the table directly, not even the admin');
eq(val(await save('admin', { title: 'x', body: 'نص الإعلان', audience: 'all', published: false }))?.error, 'invalid_data', 'a one-letter title is refused');
eq(val(await save('admin', { title: 'موعد', body: 'نص', audience: 'teachers', published: false }))?.error, 'invalid_data', 'an unknown audience is refused');
const d1 = val(await save('admin', { title: 'افتتاح المسابقة', body: 'يبدأ الحفل الساعة الخامسة في قاعة الجمعية.', audience: 'all', published: false }));
eq(d1?.ok, true, 'the admin saves a draft');
eq((await as('anon', 'select id from public.yb_announcements')).rows?.length, 0, 'a draft is not public');
eq((await as('la', 'select id from public.yb_announcements')).rows?.length, 0, 'a draft is not shown to a leader');
eq((await as('admin', 'select id from public.yb_announcements')).rows?.length, 1, 'the admin sees the draft');
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'announcement'")).rows[0].n, 0, 'a draft notifies nobody');
eq(val(await save('admin', { id: d1.id, title: 'افتتاح المسابقة', body: 'يبدأ الحفل الساعة الخامسة في قاعة الجمعية.', audience: 'all', published: true }))?.ok, true, 'the admin publishes it');
eq((await as('anon', 'select title from public.yb_announcements')).rows?.map((r) => r.title), ['افتتاح المسابقة'], 'a published «all» announcement is public');
denied(await as('anon', 'select created_by from public.yb_announcements'), 'the author is never readable');
const n1 = (await owner("select user_id from public.yb_notifications where kind = 'announcement'")).rows.map((r) => r.user_id).sort();
eq(n1, [U.off.id, U.la.id, U.lb.id, U.ma.id, U.pa.id].sort(), 'publishing tells everybody once (not the admin who wrote it)');
await save('admin', { id: d1.id, title: 'افتتاح المسابقة', body: 'يبدأ الحفل الساعة السادسة في قاعة الجمعية.', audience: 'all', published: true });
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'announcement'")).rows[0].n, 5, 'an edit after publication does not notify again');
await owner('delete from public.yb_notifications');
const d2 = val(await save('admin', { title: 'اجتماع القادة', body: 'اجتماع القادة يوم الخميس بعد العصر.', audience: 'leaders', published: true }));
const n2 = (await owner("select user_id from public.yb_notifications where kind = 'announcement'")).rows.map((r) => r.user_id).sort();
eq(n2, [U.off.id, U.la.id, U.lb.id].sort(), 'a leaders announcement goes to the leaders (and the officers)');
const d3 = val(await save('admin', { title: 'موافقة الأهل', body: 'نرجو إعادة ورقة الموافقة إلى قائد الفريق.', audience: 'parents', published: true }));
const titles = async (who) => (await as(who, 'select title from public.yb_announcements order by id')).rows?.map((r) => r.title);
eq(await titles('anon'), ['افتتاح المسابقة'], 'visitors see only «all»');
eq(await titles('la'), ['افتتاح المسابقة', 'اجتماع القادة'], 'a leader sees «all» and «leaders»');
eq(await titles('ma'), ['افتتاح المسابقة'], 'a member sees «all» only here');
eq(await titles('pa'), ['افتتاح المسابقة', 'موافقة الأهل'], 'a parent sees «all» and «parents»');
eq(await titles('off'), ['افتتاح المسابقة', 'اجتماع القادة', 'موافقة الأهل'], 'an officer sees every published one');
denied(await rpc('la', 'yb_announce_delete', { id: d2.id }), 'a leader cannot delete');
eq(val(await rpc('admin', 'yb_announce_delete', { id: d3.id }))?.ok, true, 'the admin deletes one');
eq(await titles('pa'), ['افتتاح المسابقة'], 'it is gone for the parent');
eq(val(await rpc('admin', 'yb_announce_delete', { id: d3.id }))?.error, 'not_found', 'deleting twice says not found');

// ================================================================ 2. who is in the room
section('2. the leaders room: who is in');
const post = (who, body) => rpc(who, 'yb_chat_post', { body });
const list = async (who) => { const r = await as(who, 'select * from public.yb_chat_list()'); return r.error ? r : r.rows; };
denied(await post('ma', 'السلام عليكم'), 'a member cannot post');
denied(await post('pa', 'السلام عليكم'), 'a parent cannot post');
denied(await as('ma', 'select * from public.yb_chat_list()'), 'a member cannot read the room');
denied(await as('pa', 'select * from public.yb_chat_list()'), 'a parent cannot read the room');
denied(await as('anon', 'select * from public.yb_chat_list()'), 'a visitor cannot read the room');
denied(await as('la', 'select * from public.yb_chat_messages'), 'nobody reads the messages table directly');
denied(await as('la', "insert into public.yb_chat_messages (author, body) values (auth.uid(), 'x')"), 'nobody writes the messages table directly');
eq(val(await as('ma', 'select public.yb_chat_unread() as r')), 0, 'unread is 0 for those outside the room');
const m1 = val(await post('la', 'السلام عليكم، متى تدريب الجمعة؟'));
eq(m1?.ok, true, 'a leader posts');
eq(val(await post('off', 'التدريب الساعة الرابعة')).ok, true, 'an officer posts');
eq(val(await post('admin', 'تذكير: لا ننشر أرقامًا هنا')).ok, true, 'the admin posts');
const L1 = await list('lb');
eq(L1.map((x) => [x.author_name, x.author_role, x.mine]), [['قائد النور', 'leader', false], ['مسؤول الكرة', 'officer', false], ['المشرف', 'admin', false]], 'another leader reads the room in order, with names and roles');
eq((await list('la'))[0].mine, true, 'the author sees «mine»');
eq(val(await as('lb', 'select public.yb_chat_unread() as r')), 3, 'three unread for the other leader');
eq(val(await as('la', 'select public.yb_chat_unread() as r')), 2, 'the author does not count their own message');
await rpc('lb', 'yb_chat_seen', { last_id: L1[2].id });
eq(val(await as('lb', 'select public.yb_chat_unread() as r')), 0, 'seen: unread back to 0');
await rpc('lb', 'yb_chat_seen', { last_id: 1 });
eq(val(await as('lb', 'select public.yb_chat_unread() as r')), 0, 'seen never goes backwards');

// ================================================================ 3. the filters
section('3. contact data and the rate limit');
for (const [txt, label] of [['اتصل بي 05305175431', 'a phone number'], ['رقمي 0530 517 54 31', 'a phone with spaces'], ['واتساب +90-530-517-5431', 'a phone with dashes and plus'],
  ['رقمي ٠٥٣٠٥١٧٥٤٣١', 'a phone in Arabic-Indic digits'], ['۰۵۳۰۵۱۷۵۴۳۱', 'a phone in Persian digits'], ['راسلني ali.k@mail.com', 'an e-mail address'], ['(0530) 517-5431', 'a phone with brackets']]) {
  await owner('delete from public.yb_chat_messages where author = $1', [U.lb.id]);
  eq(val(await post('lb', txt))?.error, 'contact_not_allowed', `${label} is refused`);
}
await owner('delete from public.yb_chat_messages where author = $1', [U.lb.id]);
eq(val(await post('lb', 'المباراة يوم 15/11/2026 الساعة 16:30 في الملعب 3'))?.ok, true, 'a date with slashes and a time are allowed');
eq(val(await post('lb', 'وماذا عن الشطرنج؟'))?.error, 'too_fast', 'a second message within 3 seconds is refused');
await owner("update public.yb_chat_messages set created_at = now() - interval '5 seconds' where author = $1", [U.lb.id]);
eq(val(await post('lb', 'وماذا عن الشطرنج؟'))?.ok, true, 'after 3 seconds it goes');
await owner("update public.yb_chat_messages set created_at = now() - interval '5 seconds'");
eq(val(await post('lb', '   '))?.error, 'invalid_data', 'an empty message is refused');
eq(val(await post('lb', 'ا'.repeat(501)))?.error, 'invalid_data', 'more than 500 letters is refused');

// ================================================================ 4. reports and moderation
section('4. reports, hiding, muting');
const msgs = await list('admin');
const bad = msgs.find((x) => x.author_name === 'قائد الأمل' && /الشطرنج/.test(x.body));
eq(val(await rpc('lb', 'yb_chat_report', { message_id: bad.id, reason: 'تجربة' }))?.error, 'invalid_argument', 'nobody reports their own message');
denied(await rpc('ma', 'yb_chat_report', { message_id: bad.id }), 'a member cannot report');
await owner('delete from public.yb_notifications');
eq(val(await rpc('la', 'yb_chat_report', { message_id: bad.id, reason: 'خارج الموضوع' }))?.ok, true, 'a leader reports a message');
eq(val(await rpc('off', 'yb_chat_report', { message_id: bad.id }))?.ok, true, 'an officer reports the same message');
eq((await owner("select user_id from public.yb_notifications where kind = 'chat_report'")).rows.map((r) => r.user_id), [U.admin.id], 'the admin is told once for the open report');
eq((await list('la')).find((x) => x.id === bad.id).reported, true, 'the reporter sees «reported»');
eq((await list('la')).find((x) => x.id === bad.id).reports, 0, 'a leader never sees the report count');
eq((await list('admin')).find((x) => x.id === bad.id).reports, 2, 'the admin sees 2 open reports');
denied(await rpc('la', 'yb_chat_hide', { message_id: bad.id, hide: true }), 'a leader cannot hide');
denied(await rpc('off', 'yb_chat_hide', { message_id: bad.id, hide: true }), 'an officer cannot hide');
eq(val(await rpc('admin', 'yb_chat_hide', { message_id: bad.id, hide: true }))?.ok, true, 'the admin hides it');
const hid = (await list('la')).find((x) => x.id === bad.id);
eq([hid.hidden, hid.body], [true, null], 'a hidden message keeps its place without its text');
eq((await list('admin')).find((x) => x.id === bad.id).body, 'وماذا عن الشطرنج؟', 'the admin still reads it');
eq((await list('admin')).find((x) => x.id === bad.id).reports, 0, 'hiding closes its reports');
eq((await owner("select count(*)::int n from public.audit_log where action = 'chat_hide'")).rows[0].n, 1, 'hiding is in the audit log');
eq(val(await rpc('admin', 'yb_chat_hide', { message_id: bad.id, hide: false }))?.ok, true, 'the admin shows it again');
eq((await list('la')).find((x) => x.id === bad.id).body, 'وماذا عن الشطرنج؟', 'shown again');
denied(await rpc('la', 'yb_chat_mute', { message_id: bad.id, hours: 24 }), 'a leader cannot mute');
eq(val(await rpc('admin', 'yb_chat_mute', { message_id: msgs.find((x) => x.author_role === 'admin').id, hours: 1 }))?.error, 'invalid_argument', 'the admin cannot mute themselves');
fails(await rpc('admin', 'yb_chat_mute', { message_id: bad.id, hours: 0 }), 'invalid_argument', 'zero hours is refused');
eq(val(await rpc('admin', 'yb_chat_mute', { message_id: bad.id, hours: 24, reason: 'تكرار' }))?.ok, true, 'the admin mutes the author for a day');
eq((await owner("select count(*)::int n from public.yb_notifications where kind = 'chat_muted' and user_id = $1", [U.lb.id])).rows[0].n, 1, 'the muted leader is told');
eq(val(await post('lb', 'هل تسمعونني؟'))?.error, 'chat_muted', 'a muted leader cannot post');
eq((await list('lb')).length > 0, true, 'a muted leader still reads');
eq((await list('admin')).find((x) => x.id === bad.id).author_muted, true, 'the admin sees «muted» on the author');
eq((await list('la')).find((x) => x.id === bad.id).author_muted, false, 'others never see who is muted');
const ml = await as('admin', 'select full_name, role from public.yb_chat_mutes_list()');
eq(ml.rows, [{ full_name: 'قائد الأمل', role: 'leader' }], 'the admin lists the muted people');
denied(await as('la', 'select * from public.yb_chat_mutes_list()'), 'a leader cannot list mutes');
await owner("update public.yb_chat_mutes set until = now() - interval '1 minute'");
eq(val(await post('lb', 'عدت إليكم'))?.ok, true, 'a mute that ended lets them post again');
eq((await as('admin', 'select * from public.yb_chat_mutes_list()')).rows?.length, 0, 'an ended mute leaves the list');
await owner("update public.yb_chat_messages set created_at = now() - interval '5 seconds'");
await rpc('admin', 'yb_chat_mute', { message_id: bad.id, hours: null });
eq(val(await post('lb', 'مرحبًا'))?.error, 'chat_muted', 'a mute without an end holds');
eq(val(await rpc('admin', 'yb_chat_unmute', { target: U.lb.id }))?.ok, true, 'the admin unmutes');
eq(val(await post('lb', 'شكرًا'))?.ok, true, 'unmuted: they post again');
eq(val(await rpc('admin', 'yb_chat_unmute', { target: U.lb.id }))?.error, 'not_found', 'unmuting twice says not found');
await rpc('la', 'yb_chat_report', { message_id: bad.id });
eq(val(await rpc('admin', 'yb_chat_resolve', { message_id: bad.id }))?.ok, true, 'the admin closes a report without hiding');
eq((await list('admin')).find((x) => x.id === bad.id).reports, 0, 'no open report left');

// ================================================================ 5. purge
section('5. purge after 180 days');
await owner("update public.yb_chat_messages set created_at = now() - interval '200 days' where id = $1", [bad.id]);
denied(await as('la', 'select public.yb_chat_purge()'), 'a leader cannot purge');
eq(val(await as('admin', 'select public.yb_chat_purge() as r')), 1, 'the admin purges the one old message');
eq((await list('admin')).some((x) => x.id === bad.id), false, 'it is gone');
eq((await owner('select count(*)::int n from public.yb_chat_reports where message_id = $1', [bad.id])).rows[0].n, 0, 'its reports went with it');
eq((await list('admin')).length <= 80, true, 'the list holds at most the latest messages');

finish(t0, 80);
