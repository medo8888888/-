// Yanabee backend — tests for migration 0021 (photo consent, the person's own data and requests, the three views
// with the caller's rights, the rate limiter's fingerprint). Applies 0001 -> 0021 in PGlite.
// Run:  node supabase/tests/privacy.test.mjs
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
const M = readMigration('0021_yb_privacy.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql', '0014_yb_team_identity.sql', '0015_yb_journey.sql', '0016_yb_journey_social.sql',
  '0017_yb_admin_tools.sql', '0018_yb_appeals.sql', '0019_yb_match_care.sql', '0020_yb_impact.sql']) await E.db.exec(readMigration(f));
// a rate-limit row kept in clear before 0021
await owner("insert into public.yb_rate (key) values ('reg:198.51.100.7'), ('reg:*')");
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0021 is ASCII only');
await E.db.exec(M);
ok(true, '0021 runs twice without error (idempotent)');

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ma', 'member', 'سالم أحمد العلي'], ['ad', 'member', 'معاذ الكبير'],
  ['pa', 'parent', 'ولي سالم'], ['pb', 'parent', 'ولي يوسف'], ['out', 'member', 'غريب']]) await signUp(k, Y(r, n));
async function team(who, name, kids) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const [k, age] of kids) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, $3)', [t.id, k, age]);
  return t;
}
const TA = await team('la', 'فريق النور', [['سالم أحمد العلي', 12], ['يوسف علي حسن', 13], ['معاذ الكبير', 19]]);
const TB = await team('lb', 'فريق الأمل', [['زيد محمود', 12]]);
await owner("update public.teams set status = 'approved' where id = any($1)", [[TA.id, TB.id]]);
const mem = async (t, name) => (await owner('select id from public.team_members where team_id = $1 and full_name = $2', [t.id, name])).rows[0].id;
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a child joins team A');
eq(val(await rpc('ad', 'join_team', { code: TA.join_code, member_name: 'معاذ الكبير' }))?.ok, true, 'an adult member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'سالم أحمد العلي' }))?.ok, true, 'a parent links Salem');
eq(val(await rpc('pb', 'link_child', { code: TA.join_code, child_name: 'يوسف علي حسن' }))?.ok, true, 'another parent links Yusuf');
const aSalem = await mem(TA, 'سالم أحمد العلي'), aYusuf = await mem(TA, 'يوسف علي حسن'), aMuadh = await mem(TA, 'معاذ الكبير'), bZaid = await mem(TB, 'زيد محمود');
const aLead = (await owner('select id, age from public.team_members where team_id = $1 and is_leader', [TA.id])).rows[0];
const pc = async (id) => (await owner('select photo_consent from public.team_members where id = $1', [id])).rows[0].photo_consent;

section('1. photo consent');
eq([await pc(aSalem), await pc(aMuadh)], ['pending', 'pending'], 'everyone starts as pending');
eq(val(await rpc('pa', 'yb_photo_consent_set', { member_id: aSalem, value: 'yes' })), { ok: true, photo_consent: 'yes', team_photos_public: false }, 'the parent agrees for their child; the team is not public yet (Yusuf is pending)');
eq(val(await rpc('pa', 'yb_photo_consent_set', { member_id: aSalem, value: 'pending' }))?.error, 'invalid_data', 'a parent says yes or no, not pending');
denied(await rpc('pa', 'yb_photo_consent_set', { member_id: aYusuf, value: 'yes' }), 'a parent cannot answer for another child');
denied(await rpc('la', 'yb_photo_consent_set', { member_id: aYusuf, value: 'yes' }), 'the team\'s leader cannot answer for a member');
denied(await rpc('ma', 'yb_photo_consent_set', { member_id: aSalem, value: 'yes' }), 'a child cannot answer for themselves');
eq(val(await rpc('ad', 'yb_photo_consent_set', { member_id: aMuadh, value: 'yes' }))?.ok, true, 'an adult member answers for themselves');
denied(await rpc('out', 'yb_photo_consent_set', { member_id: aSalem, value: 'no' }), 'a stranger cannot');
denied(await rpc('anon', 'yb_photo_consent_set', { member_id: aSalem, value: 'no' }), 'nor a visitor');
eq(val(await rpc('admin', 'yb_photo_consent_set', { member_id: aYusuf, value: 'maybe' }))?.error, 'invalid_data', 'an unknown answer is refused');
eq(val(await rpc('admin', 'yb_photo_consent_set', { member_id: TA.id, value: 'yes' }))?.error, 'not_found', 'an unknown member is not found');
const audit = async () => (await owner("select detail from public.audit_log where action = 'photo_consent' order by id")).rows.map((r) => r.detail);
eq((await audit()).map((d) => d.by), ['parent', 'self'], 'each answer is in the audit log, with who gave it');

section('the public page shows photos only with consent');
const S1 = (await owner("insert into public.yb_submissions (id, team_id, kind, title, place, summary, status, featured, featured_at, photos) values (gen_random_uuid(), $1, 'project', 'تنظيف الحديقة', 'neighborhood', 'نظف الفريق حديقة الحي مع الجيران.', 'accepted', true, now(), $2) returning id", [TA.id, [`${TA.id}/x/a.jpg`]])).rows[0].id;
const pub = async () => (await as('anon', 'select title, photos from public.yb_public_projects()')).rows;
const isPub = async (p) => (await as('anon', 'select public.yb_sub_is_public($1) r', [p])).rows[0].r;
eq(await pub(), [{ title: 'تنظيف الحديقة', photos: [] }], 'while a child lacks a photo consent, the featured project shows without photos');
eq(await isPub(`${TA.id}/x/a.jpg`), false, 'and the photo file stays closed to visitors');
eq([aLead.age, val(await rpc('admin', 'yb_photo_consent_set', { member_id: aLead.id, value: 'yes' }))?.team_photos_public], [null, false], 'a member whose age is unknown counts as a minor: the admin records the leader\'s form');
eq(val(await rpc('admin', 'yb_photo_consent_set', { member_id: aYusuf, value: 'yes' }))?.team_photos_public, true, 'the admin records Yusuf\'s paper form: the team is complete');
eq(await pub(), [{ title: 'تنظيف الحديقة', photos: [`${TA.id}/x/a.jpg`] }], 'then the photos show');
eq(await isPub(`${TA.id}/x/a.jpg`), true, 'and the file opens');
eq(val(await rpc('ad', 'yb_photo_consent_set', { member_id: aMuadh, value: 'no' }))?.team_photos_public, false, 'an adult member withdraws');
eq([(await pub())[0].photos, await isPub(`${TA.id}/x/a.jpg`)], [[], false], 'the photos leave the public page at once');
await rpc('ad', 'yb_photo_consent_set', { member_id: aMuadh, value: 'yes' });
eq(val(await rpc('pa', 'yb_photo_consent_set', { member_id: aSalem, value: 'no' }))?.team_photos_public, false, 'a parent withdraws');
eq((await pub())[0].photos, [], 'the photos leave again');
await owner("insert into public.team_members (team_id, full_name, age) values ($1, 'عضو جديد', 14)", [TA.id]);
await rpc('pa', 'yb_photo_consent_set', { member_id: aSalem, value: 'yes' });
eq((await pub())[0].photos, [], 'a new minor without a photo consent keeps the photos off');
const brd = val(await rpc('admin', 'yb_photo_consent_board', {}));
const bA = brd.find((x) => x.team_id === TA.id);
eq([bA.members, bA.yes, bA.no, bA.missing, bA.public_ok], [5, 4, 0, 1, false], 'the admin\'s board counts members, answers and what is missing');
eq(bA.rows.map((r) => r.name).sort(), ['سالم أحمد العلي', 'عضو جديد', 'قائد النور', 'معاذ الكبير', 'يوسف علي حسن'].sort(), 'and lists the members, for recording paper forms');
const mineP = val(await rpc('pa', 'yb_photo_consent_mine', {}));
eq(mineP.map((r) => [r.name, r.who, r.can_set, r.photo_consent]), [['سالم أحمد العلي', 'child', true, 'yes']], 'a parent sees the child they may answer for');
eq(val(await rpc('ad', 'yb_photo_consent_mine', {})).map((r) => [r.who, r.can_set]), [['self', true]], 'an adult member answers for themselves');
eq(val(await rpc('ma', 'yb_photo_consent_mine', {})).map((r) => [r.who, r.can_set, r.photo_consent]), [['self', false, 'yes']], 'a child reads their own answer but may not change it');
eq(val(await rpc('out', 'yb_photo_consent_mine', {})), [], 'someone with no team and no child has nothing to answer');
denied(await rpc('anon', 'yb_photo_consent_mine', {}), 'a visitor cannot ask');
denied(await rpc('la', 'yb_photo_consent_board', {}), 'a leader does not read the board');
const lead = (await as('la', 'select full_name, photo_consent from public.team_members where team_id = $1 order by full_name', [TA.id])).rows;
eq(lead.find((x) => x.full_name === 'سالم أحمد العلي').photo_consent, 'yes', 'the team\'s leader reads the answers of their members');
denied(await as('la', "update public.team_members set photo_consent = 'yes' where team_id = $1", [TA.id]), 'but cannot change them directly');

section('2. the person\'s own data');
denied(await rpc('anon', 'yb_my_data', {}), 'a visitor has no data to read');
await owner("insert into public.yb_pledges (user_id, team_id, week, field, body) values ($1, $2, current_date - ((extract(dow from current_date)::int + 1) % 7), 'home', 'أساعد أمي في البيت')", [U.ma.id, TA.id]);
const dm = val(await rpc('ma', 'yb_my_data', {}));
eq([dm.profile.full_name, dm.profile.email, dm.membership.length, dm.membership[0].team, dm.membership[0].photo_consent, dm.promises.length, dm.promises[0].text, dm.children],
  ['سالم أحمد العلي', 'ma@example.test', 1, 'فريق النور', 'yes', 1, 'أساعد أمي في البيت', []], 'a member downloads their profile, team row and promises');
ok(!/يوسف|معاذ|عضو جديد/.test(JSON.stringify(dm)), 'and nothing about other members');
const dp = val(await rpc('pa', 'yb_my_data', {}));
eq([dp.children.length, dp.children[0].full_name, dp.children[0].photo_consent, dp.membership], [1, 'سالم أحمد العلي', 'yes', []], 'a parent downloads their linked child\'s record');
eq(val(await rpc('la', 'yb_my_data', {})).teams_led.map((t) => t.team), ['فريق النور'], 'a leader downloads the team they lead');

section('requests to delete or correct data');
eq(val(await rpc('ma', 'yb_privacy_request', { kind: 'correct', note: 'قصير' }))?.error, 'invalid_data', 'a correction must say what to correct');
eq(val(await rpc('ma', 'yb_privacy_request', { kind: 'erase' }))?.error, 'invalid_data', 'an unknown kind is refused');
const r1 = val(await rpc('ma', 'yb_privacy_request', { kind: 'delete' }));
eq(r1?.ok, true, 'a member asks for their data to be deleted (no reason needed)');
eq((await owner("select user_id, data from public.yb_notifications where kind = 'privacy_request'")).rows, [{ user_id: U.admin.id, data: { kind: 'delete' } }], 'the admin is told, with the kind only');
eq(val(await rpc('ma', 'yb_privacy_request', { kind: 'correct', note: 'اسمي يكتب سالم أحمد العلي' }))?.ok, true, 'and a correction');
eq(val(await rpc('ma', 'yb_privacy_request', { kind: 'other', note: 'سؤال عن الصور' }))?.error, 'too_many_open', 'no more than two open at a time');
eq(val(await rpc('ma', 'yb_privacy_mine', {})).map((x) => [x.kind, x.status]), [['correct', 'open'], ['delete', 'open']], 'the member reads their requests');
eq(val(await rpc('pa', 'yb_privacy_mine', {})), [], 'others see none of them');
denied(await rpc('ma', 'yb_privacy_admin', {}), 'a member cannot read the admin\'s list');
denied(await rpc('la', 'yb_privacy_close', { id: r1.id, done: true, reply: 'تم الحذف' }), 'nor close a request');
const ad = val(await rpc('admin', 'yb_privacy_admin', {}));
eq([ad.length, ad[0].email, ad[0].status], [2, 'ma@example.test', 'open'], 'the admin reads who asked, with the email');
eq(val(await rpc('admin', 'yb_privacy_close', { id: r1.id, done: true, reply: 'تم' }))?.error, 'invalid_data', 'the answer must be written');
eq(val(await rpc('admin', 'yb_privacy_close', { id: r1.id, done: true, reply: 'حُذفت بياناتك من المسابقة في 17 نوفمبر.' }))?.ok, true, 'the admin answers in writing');
eq(val(await rpc('admin', 'yb_privacy_close', { id: r1.id, done: false, reply: 'تراجع عن القرار' }))?.error, 'already_decided', 'a closed request stays closed');
eq((await owner("select data from public.yb_notifications where kind = 'privacy_done' and user_id = $1", [U.ma.id])).rows.map((r) => r.data), [{ done: true, kind: 'delete' }], 'the member is told');
eq(val(await rpc('ma', 'yb_privacy_mine', {})).find((x) => x.id === r1.id).reply, 'حُذفت بياناتك من المسابقة في 17 نوفمبر.', 'and reads the answer');
denied(await as('ma', 'select * from public.yb_privacy_requests'), 'nobody reads the requests table directly');
eq(val(await rpc('ma', 'yb_my_data', {})).requests.length, 2, 'the requests are part of the copy');

section('3. the three views run with the caller\'s rights');
const opts = (await owner("select c.relname, c.reloptions from pg_class c where c.relname in ('my_roster', 'my_children', 'yb_match_counts') order by 1")).rows;
ok(opts.length === 3 && opts.every((o) => (o.reloptions || []).includes('security_invoker=true')), 'my_children, my_roster and yb_match_counts are security_invoker', JSON.stringify(opts));
const ro = (await as('ma', 'select full_name, is_me, consent_status, photo_consent from public.my_roster order by full_name')).rows;
eq([ro.length, ro.filter((x) => x.is_me).map((x) => x.photo_consent), ro.filter((x) => !x.is_me).every((x) => x.consent_status === null && x.photo_consent === null)],
  [5, ['yes'], true], 'my_roster: the member\'s own team, their own consents only');
eq((await as('mb' in U ? 'mb' : 'out', 'select * from public.my_roster')).rows.length, 0, 'someone without a team reads nothing');
denied(await as('anon', 'select * from public.my_roster'), 'a visitor cannot read my_roster');
const ch = (await as('pa', 'select full_name, team_name, photo_consent from public.my_children')).rows;
eq(ch, [{ full_name: 'سالم أحمد العلي', team_name: 'فريق النور', photo_consent: 'yes' }], 'my_children: the parent\'s own child, with the photo consent');
eq((await as('la', 'select * from public.my_children')).rows.length, 0, 'a leader with no linked child reads nothing');
await owner("insert into public.yb_match_live (comp, match_key, a, b) values ('football', 'G1-1', $1, $2)", [TA.id, TB.id]);
await owner("insert into public.yb_match_marks (comp, match_key, team_id, kind) values ('football', 'G1-1', $1, 'goal'), ('football', 'G1-1', $1, 'goal')", [TA.id]);
eq((await as('anon', 'select team_id, goals, spirit from public.yb_match_counts')).rows, [{ team_id: TA.id, goals: 2, spirit: 0 }], 'yb_match_counts still reads for visitors');
denied(await as('anon', 'select * from public.yb_my_roster_rows()'), 'a visitor cannot call the roster function');

section('4. the rate limiter keeps a fingerprint');
await owner(`select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9"}', false)`);
const fp = (await owner('select public.yb_client_addr() a')).rows[0].a;
ok(/^h[0-9a-f]{32}$/.test(fp) && !fp.includes('203'), 'the address becomes a fingerprint', fp);
eq((await owner('select public.yb_client_addr() a')).rows[0].a, fp, 'the same address gives the same fingerprint');
await owner(`select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.10"}', false)`);
ok((await owner('select public.yb_client_addr() a')).rows[0].a !== fp, 'another address gives another one');
eq((await owner("select key from public.yb_rate order by key")).rows.map((r) => r.key), ['reg:*'], 'the address kept in clear before 0021 is removed; the shared counter stays');
const reg = { team_name: 'فريق الفجر', leader_name: 'قائد الفجر', phone: '0530 111 22 33', area: 'حي', members: [{ name: 'قائد الفجر', age: 15, contact: '05301112233' }, { name: 'ب ب', age: 13 }, { name: 'ج ج', age: 13 }, { name: 'د د', age: 13 }, { name: 'هـ هـ', age: 13 }], pledge: true };
const rg = await as('anon', 'select public.yb_register_team($1::jsonb) r', [JSON.stringify(reg)]);
ok(!rg.error, 'registration still works', rg.error);
ok((await owner("select key from public.yb_rate where key like 'reg:h%'")).rows.length === 1 && (await owner("select count(*)::int n from public.yb_rate where key like '%203.0.113%'")).rows[0].n === 0, 'and the limiter stores no address');

finish(t0, 70);
