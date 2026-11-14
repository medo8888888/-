// Yanabee backend — tests for migration 0014 (the team's logo, the assistant leader, who leads the team).
// Applies 0001 -> 0014 in PGlite behind the Supabase emulation in harness.mjs, with the small Storage emulation
// used by social.test.mjs. pg_net (0013) is stubbed.
// Run:  node supabase/tests/identity.test.mjs
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
const M = readMigration('0014_yb_team_identity.sql');
for (const f of ['0001_yanabee.sql', '0002_yb_officer_role.sql', '0003_yb_workflow.sql', '0004_yb_schedule.sql', '0005_yb_register_fee.sql',
  '0006_yb_waitlist_roles.sql', '0007_yb_results.sql', '0008_yb_submissions.sql', '0009_yb_announcements_chat.sql', '0010_yb_judging.sql',
  '0011_yb_social.sql', '0012_yb_players.sql', '0013_yb_push.sql']) await E.db.exec(readMigration(f));
await E.db.exec(M);
ok(/^[\x00-\x7F]*$/.test(M), '0014 is ASCII only');
await E.db.exec(M);
ok(true, '0014 runs twice without error (idempotent)');

async function storage(who, kind, name) {
  const claims = who === 'anon' ? { role: 'anon' } : { sub: U[who].id, role: 'authenticated' };
  try {
    const r = await E.db.transaction(async (tx) => {
      await tx.exec(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      if (kind === 'up') return tx.query("insert into storage.objects (bucket_id, name, owner) values ('yanabee-logos', $1, auth.uid()) returning name", [name]);
      if (kind === 'read') return tx.query("select name from storage.objects where bucket_id = 'yanabee-logos' and name = $1", [name]);
      return tx.query("delete from storage.objects where bucket_id = 'yanabee-logos' and name = $1 returning name", [name]);
    });
    return { rows: r.rows, n: r.rows.length };
  } catch (e) { return { error: e.message, code: e.code }; }
}
const up = (who, name) => storage(who, 'up', name);
const see = async (who, name) => (await storage(who, 'read', name)).n ?? -1;
const rm = (who, name) => storage(who, 'rm', name);

const Y = (role, full_name) => ({ app: 'yanabee', role, full_name });
await signUp('admin', Y('member', 'المشرف العام'));
await owner("select public.set_admin('admin@example.test')");
await signUp('off', Y('member', 'مسؤول المباريات'));
await rpc('admin', 'set_user_role', { target: U.off.id, new_role: 'officer' });
for (const [k, r, n] of [['la', 'leader', 'قائد النور'], ['lb', 'leader', 'قائد الأمل'], ['ma', 'member', 'سالم أحمد العلي'], ['mb', 'member', 'زيد محمود'],
  ['pa', 'parent', 'ولي يوسف'], ['px', 'parent', 'ولي بلا ابن']]) await signUp(k, Y(r, n));
async function team(who, name) {
  const t = (await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, 'حي'])).rows[0];
  for (const k of ['سالم أحمد العلي', 'يوسف علي حسن', 'عمر حسن', 'زيد محمود']) await owner('insert into public.team_members (team_id, full_name, age) values ($1, $2, 12)', [t.id, k]);
  return t;
}
const TA = await team('la', 'فريق النور');
const TB = await team('lb', 'فريق الأمل');
const mem = async (t, name) => (await owner('select id from public.team_members where team_id = $1 and full_name = $2', [t.id, name])).rows[0].id;
const roles = async (id) => (await owner('select roles from public.team_members where id = $1', [id])).rows[0].roles;
eq(val(await rpc('ma', 'join_team', { code: TA.join_code, member_name: 'سالم أحمد العلي' }))?.ok, true, 'a member joins team A');
eq(val(await rpc('pa', 'link_child', { code: TA.join_code, child_name: 'يوسف علي حسن' }))?.ok, true, 'a parent links a child of team A');
const aSalem = await mem(TA, 'سالم أحمد العلي'), aYusuf = await mem(TA, 'يوسف علي حسن'), aOmar = await mem(TA, 'عمر حسن'), bZaid = await mem(TB, 'زيد محمود');
const aLeaderRow = (await owner('select id from public.team_members where team_id = $1 and is_leader', [TA.id])).rows[0]?.id;

// ================================================================ 1. the assistant
section('1. the assistant leader');
eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf }))?.ok, true, 'the leader names an assistant');
eq(await roles(aYusuf), ['assistant'], 'the member carries the title');
eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: aOmar }))?.ok, true, 'naming another one');
eq([await roles(aYusuf), await roles(aOmar)], [[], ['assistant']], 'moves the title: one assistant a team');
eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: bZaid }))?.error, 'member_not_found', 'a member of another team is refused');
if (aLeaderRow) eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: aLeaderRow }))?.error, 'leader_is_leader', 'the leader cannot be their own assistant');
denied(await rpc('lb', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf }), 'another team\'s leader cannot');
denied(await rpc('ma', 'yb_set_assistant', { team_id: TA.id, member_id: aSalem }), 'a member cannot');
denied(await rpc('pa', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf }), 'a parent cannot');
denied(await rpc('anon', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf }), 'a visitor cannot');
eq(val(await rpc('la', 'yb_set_roles', { team_id: TA.id, reciter: aSalem, reserve: aYusuf, chess: aOmar, coord: aSalem }))?.ok, true, 'the nominees are saved');
eq((await roles(aOmar)).sort(), ['assistant', 'chess'], 'saving the nominees keeps the assistant');
eq((await roles(aSalem)).sort(), ['coord', 'reciter'], 'and sets the others as before');
await owner("update public.teams set status = 'approved' where id = $1", [TA.id]);
eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf }))?.ok, true, 'the leader changes the assistant after approval too (a title, not part of the review)');
eq(val(await rpc('admin', 'yb_set_assistant', { team_id: TA.id, member_id: aOmar }))?.ok, true, 'the admin can name one');
eq(val(await rpc('la', 'yb_set_assistant', { team_id: TA.id }))?.ok, true, 'null removes the title');
eq((await roles(aOmar)).sort(), ['chess'], 'nobody is assistant then; other roles stay');
await rpc('la', 'yb_set_assistant', { team_id: TA.id, member_id: aYusuf });
eq((await owner("select count(*)::int n from public.audit_log where action = 'team_assistant'")).rows[0].n > 0, true, 'changes are in the audit log');

// ================================================================ 2. who leads the team
section('2. who leads the team');
const sL = val(await rpc('la', 'yb_team_staff', { team_id: TA.id }));
eq([sL.leader, sL.assistant, sL.coord, sL.members, sL.can_edit], ['قائد النور', 'يوسف علي حسن', 'سالم أحمد العلي', await (async () => (await owner('select count(*)::int n from public.team_members where team_id = $1', [TA.id])).rows[0].n)(), true], 'the leader sees the leader, the assistant and the coordinator, and may edit');
const sM = val(await rpc('ma', 'yb_team_staff', { team_id: TA.id }));
eq([sM.leader, sM.assistant, sM.can_edit], ['قائد النور', 'يوسف علي حسن', false], 'a joined member sees them, read only');
const sP = val(await rpc('pa', 'yb_team_staff', { team_id: TA.id }));
eq([sP.leader, sP.assistant, sP.coord, sP.can_edit], ['قائد النور', 'يوسف', 'سالم', false], 'a linked parent sees the leader, and children by first name only');
eq(val(await rpc('off', 'yb_team_staff', { team_id: TA.id }))?.assistant, 'يوسف علي حسن', 'an officer sees them');
eq(val(await rpc('admin', 'yb_team_staff', { team_id: TB.id }))?.assistant, null, 'no assistant yet reads as null');
denied(await rpc('lb', 'yb_team_staff', { team_id: TA.id }), 'another team\'s leader does not');
denied(await rpc('mb', 'yb_team_staff', { team_id: TA.id }), 'a member without this team does not');
denied(await rpc('px', 'yb_team_staff', { team_id: TA.id }), 'a parent without a child here does not');
denied(await rpc('anon', 'yb_team_staff', { team_id: TA.id }), 'a visitor does not');

// ================================================================ 3. the logo
section('3. the team logo');
const f1 = `${TA.id}/logo1.webp`;
denied(await up('lb', f1), 'another team\'s leader cannot upload into this team\'s folder');
denied(await up('ma', f1), 'a member cannot upload a logo');
denied(await up('pa', f1), 'a parent cannot');
denied(await up('la', `${TA.id}/x/logo.webp`), 'a deeper path is refused');
denied(await up('la', 'not-a-team/logo.webp'), 'a folder that is not a team is refused');
eq((await up('la', f1)).n, 1, 'the leader uploads into the team\'s folder');
eq(await see('mb', f1), 1, 'signed-in people see logos');
ok((await see('anon', f1)) <= 0, 'a visitor does not');
eq(val(await rpc('la', 'yb_set_team_logo', { team_id: TA.id, path: `${TA.id}/missing.webp` }))?.error, 'invalid_data', 'a file that was not uploaded is refused');
eq(val(await rpc('la', 'yb_set_team_logo', { team_id: TA.id, path: `${TB.id}/logo1.webp` }))?.error, 'invalid_data', 'a path in another team\'s folder is refused');
eq(val(await rpc('la', 'yb_set_team_logo', { team_id: TA.id, path: f1 }))?.ok, true, 'the leader sets the logo');
eq((await as('mb', 'select logo_path, color, badge from public.yb_team_style where team_id = $1', [TA.id])).rows[0], { logo_path: f1, color: 'teal', badge: 'star' }, 'signed-in people read it, with the default color and badge');
denied(await as('anon', 'select logo_path from public.yb_team_style where team_id = $1', [TA.id]), 'a visitor cannot read the logo path');
eq((await as('anon', 'select color, badge from public.yb_team_style where team_id = $1', [TA.id])).rows.length, 1, 'the color and the badge stay public');
eq(val(await rpc('la', 'yb_set_team_style', { team_id: TA.id, color: 'purple', badge: 'bolt' }))?.ok, true, 'changing the color');
eq((await owner('select logo_path, color from public.yb_team_style where team_id = $1', [TA.id])).rows[0], { logo_path: f1, color: 'purple' }, 'keeps the logo');
denied(await rpc('lb', 'yb_set_team_logo', { team_id: TA.id, path: null }), 'another leader cannot remove it');
denied(await rpc('ma', 'yb_set_team_logo', { team_id: TA.id, path: null }), 'a member cannot');
for (const f of ['b', 'c']) await up('la', `${TA.id}/${f}.webp`);
denied(await up('la', `${TA.id}/d.webp`), 'at most three files a team');
eq((await rm('lb', `${TA.id}/b.webp`)).n ?? 0, 0, 'another leader cannot delete the files');
eq((await rm('la', `${TA.id}/b.webp`)).n, 1, 'the leader removes an old file');
eq(val(await rpc('admin', 'yb_set_team_logo', { team_id: TA.id }))?.ok, true, 'the admin removes any logo');
eq((await owner('select logo_path, color from public.yb_team_style where team_id = $1', [TA.id])).rows[0], { logo_path: null, color: 'purple' }, 'the color stays');
eq((await up('admin', `${TB.id}/logo.webp`)).n, 1, 'the admin can upload for a team');
eq(val(await rpc('admin', 'yb_set_team_logo', { team_id: TB.id, path: `${TB.id}/logo.webp` }))?.ok, true, 'and set it (a row is made with the defaults)');

// ================================================================ 4. privileges
section('4. privileges');
const priv = (await owner(`select
  has_function_privilege('anon', 'public.yb_set_assistant(uuid,uuid)', 'execute') a1, has_function_privilege('anon', 'public.yb_team_staff(uuid)', 'execute') a2,
  has_function_privilege('anon', 'public.yb_set_team_logo(uuid,text)', 'execute') a3, has_function_privilege('authenticated', 'public.yb_team_staff(uuid)', 'execute') b1,
  has_column_privilege('anon', 'public.yb_team_style', 'logo_path', 'select') c1, has_column_privilege('authenticated', 'public.yb_team_style', 'logo_path', 'select') c2,
  has_table_privilege('authenticated', 'public.yb_team_style', 'update') c3`)).rows[0];
eq(priv, { a1: false, a2: false, a3: false, b1: true, c1: false, c2: true, c3: false }, 'visitors reach none of it; nobody writes the style table directly');

finish(t0, 55);
