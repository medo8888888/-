// Yanabee backend — security tests for supabase/migrations/0001_yanabee.sql
//
// Runs the real migration in PGlite (PostgreSQL compiled to WASM) behind a small
// emulation of Supabase: schema auth (users, uid(), role(), jwt()), roles
// anon / authenticated / service_role, and PostgREST's per-request
// `set local role` + `request.jwt.claims`. Supabase's DEFAULT PRIVILEGES (ALL on
// every new public object for anon/authenticated) are emulated on purpose, so the
// migration's revokes are really proven.
//
// Run:  node supabase/tests/rls.test.mjs
// Needs: npm install   (devDependency @electric-sql/pglite)
//        or PGLITE_DIR=/path/to/node_modules/@electric-sql/pglite
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

async function loadPGlite() {
  try { return (await import('@electric-sql/pglite')).PGlite; } catch (e) { /* fall through */ }
  const dir = process.env.PGLITE_DIR;
  if (dir) {
    for (const rel of ['dist/index.js', 'dist/index.cjs']) {
      try { return (await import(pathToFileURL(path.join(dir, rel)).href)).PGlite; } catch (e) { /* next */ }
    }
  }
  console.error('Cannot load @electric-sql/pglite. Run `npm install` (it is a devDependency) or set PGLITE_DIR.');
  process.exit(2);
}

process.on('uncaughtException', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('  CRASH ' + ((e && e.stack) || e)); process.exit(1); });

const PGlite = await loadPGlite();
const here = path.dirname(fileURLToPath(import.meta.url));
// YB_MIGRATION is for mutation testing of this suite only (point it at a sabotaged copy)
const MIGRATION = readFileSync(process.env.YB_MIGRATION || path.join(here, '..', 'migrations', '0001_yanabee.sql'), 'utf8');

// ---------------------------------------------------------------- assertions
let passed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) passed++; else { failures.push(label); console.log('  FAIL  ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, `${label}  (got ${a}, expected ${e})`);
}
const RLS_OR_PERM = /row-level security|permission denied/i;
function denied(res, label) {          // 42501: permission denied / RLS violation
  ok(!!res.error && (res.code === '42501' || RLS_OR_PERM.test(res.error)), `${label}  (got ${res.error || 'no error'})`);
}
function fails(res, key, label) {       // exception whose message is a stable key
  ok(!!res.error && res.error === key, `${label}  (got ${res.error || 'no error'}, expected ${key})`);
}
function noRecursion(res, label) {
  ok(!(res.error || '').includes('infinite recursion'), `${label} (recursion-free)  ${res.error || ''}`);
}
function section(t) { console.log('\n== ' + t); }

// ---------------------------------------------------------------- environment
const db = new PGlite();

async function emulateSupabase() {
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      raw_user_meta_data jsonb,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $f$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid $f$;
    create function auth.role() returns text language sql stable as $f$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      )::text $f$;
    create function auth.jwt() returns jsonb language sql stable as $f$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase's dangerous defaults: everything new in public is open to the API roles
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
}

const U = {};            // name -> {id, email}
async function owner(sql, params = []) { return db.query(sql, params); }

async function as(who, sql, params = []) {
  let claims = null, role = null;
  if (who === 'anon') { role = 'anon'; claims = { role: 'anon' }; }
  else if (who === 'service') { role = 'service_role'; claims = { role: 'service_role' }; }
  else if (who !== 'owner') {
    if (!U[who]) throw new Error('unknown user ' + who);
    role = 'authenticated';
    claims = { sub: U[who].id, role: 'authenticated', email: U[who].email };
  }
  try {
    const r = await db.transaction(async (tx) => {
      if (role) {
        await tx.exec(`set local role ${role}`);
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      }
      return tx.query(sql, params);
    });
    return { rows: r.rows, n: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { error: e.message, code: e.code };
  }
}
const rowsOf = (r) => { if (r.error) throw new Error(r.error + '  in tests'); return r.rows; };

async function signUp(key, { role, fullName, meta } = {}) {
  const email = `${key}@example.test`;
  const m = meta !== undefined ? meta : { full_name: fullName ?? key, ...(role !== undefined ? { role } : {}) };
  const r = await owner('insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id', [email, JSON.stringify(m)]);
  U[key] = { id: r.rows[0].id, email };
  return U[key];
}
async function profileOf(key) {
  return (await owner('select * from public.profiles where id = $1', [U[key].id])).rows[0];
}
const rpc = (who, fn, args) => {
  const names = Object.keys(args);
  const call = names.map((k, i) => `${k} => $${i + 1}`).join(', ');
  return as(who, `select public.${fn}(${call}) as r`, names.map((k) => args[k]));
};
const countOf = async (who, table, where = '') =>
  (await as(who, `select count(*)::int as n from public.${table} ${where}`));

// ---------------------------------------------------------------- run
const t0 = Date.now();
await emulateSupabase();
await db.exec(MIGRATION);
console.log(`migration applied in ${Date.now() - t0} ms`);

// ================================================================ users
await signUp('admin1', { role: 'admin', fullName: 'مدير النظام' });     // tries to self-assign admin
await signUp('evil', { role: 'admin', fullName: 'Evil' });
await signUp('lead1', { role: 'leader', fullName: 'قائد الفريق الأول' });
await signUp('lead2', { role: 'leader', fullName: 'قائد الفريق الثاني' });
await signUp('mem1', { role: 'member', fullName: 'عضو أول' });
await signUp('mem2', { role: 'member', fullName: 'عضو ثان' });
await signUp('mem3', { role: 'member', fullName: 'عضو ثالث' });
await signUp('par1', { role: 'parent', fullName: 'ولي أمر أول' });
await signUp('par2', { role: 'parent', fullName: 'ولي أمر ثان' });
await signUp('nobody', { role: undefined, fullName: 'بلا دور' });

// ================================================================ 1. sign-up trigger
section('sign-up trigger');
eq((await profileOf('admin1')).role, 'member', 'sign-up with role=admin metadata is ignored (member)');
eq((await profileOf('evil')).role, 'member', 'second admin escalation attempt ignored');
eq((await profileOf('lead1')).role, 'leader', 'leader role from metadata accepted');
eq((await profileOf('mem1')).role, 'member', 'member role accepted');
eq((await profileOf('par1')).role, 'parent', 'parent role accepted');
eq((await profileOf('nobody')).role, 'member', 'missing role -> member');
for (const [i, bad] of ['ADMIN', ' admin', 'superuser', '', null, ['admin'], { a: 1 }, 5].entries()) {
  const k = 'junk' + i;
  await signUp(k, { meta: { full_name: 'x', role: bad } });
  eq((await profileOf(k)).role, 'member', `junk role ${JSON.stringify(bad)} -> member`);
}
await signUp('nometa', { meta: null });
eq((await profileOf('nometa')).role, 'member', 'null raw_user_meta_data does not break sign-up');
await signUp('longname', { meta: { full_name: ' ' + 'ا'.repeat(200) + ' ', role: 'leader' } });
eq((await profileOf('longname')).full_name.length, 80, 'long full_name is truncated to 80');
eq((await profileOf('lead1')).email, 'lead1@example.test', 'profile email copied from auth.users');
await owner("update auth.users set email = 'lead1.new@example.test' where id = $1", [U.lead1.id]);
eq((await profileOf('lead1')).email, 'lead1.new@example.test', 'email change in auth.users is mirrored to profiles');
await owner("update auth.users set email = 'lead1@example.test' where id = $1", [U.lead1.id]);

// ================================================================ 2. anonymous access
section('anon (public) access');
eq((await as('anon', 'select * from public.public_teams')).rows, [], 'anon can read public_teams (empty so far)');
eq((await as('anon', 'select * from public.tournament_state')).rows, [], 'anon can read tournament_state');
for (const t of ['profiles', 'teams', 'team_members', 'parent_links', 'audit_log']) {
  denied(await as('anon', `select * from public.${t}`), `anon cannot select ${t}`);
}
denied(await as('anon', 'select * from public.my_roster'), 'anon cannot read my_roster');
denied(await as('anon', 'select * from public.my_children'), 'anon cannot read my_children');
denied(await as('anon', "insert into public.teams (name) values ('x1')"), 'anon cannot insert teams');
denied(await as('anon', "insert into public.tournament_state (id, state) values (1, '{}')"), 'anon cannot insert tournament_state');
denied(await as('anon', "update public.tournament_state set state = '{}'"), 'anon cannot update tournament_state');
denied(await as('anon', "insert into public.public_teams (id, name) values (gen_random_uuid(), 'x')"), 'anon cannot write through public_teams');
for (const f of ['select public.is_admin()', 'select * from public.my_team()',
  "select public.join_team('ABC234','x')", "select public.link_child('ABC234','x')",
  "select public.publish_state('{}'::jsonb, null)", "select public.approve_team(gen_random_uuid(), true, null)",
  "select public.mark_consent(gen_random_uuid(), true)", "select public.set_admin('admin1@example.test')",
  'select public.yb_new_join_code()', 'select public.yb_is_client()', "select public.regenerate_join_code(gen_random_uuid())"]) {
  denied(await as('anon', f), 'anon cannot execute: ' + f.slice(0, 48));
}
ok((await as('anon', "select public.yb_norm('x')")).rows?.length === 1, 'yb_norm is callable (needed by index expressions)');

// ================================================================ 3. profiles & escalation
section('profiles and role escalation');
eq((await countOf('mem1', 'profiles')).rows[0].n, 1, 'a user sees only their own profile');
eq((await as('mem1', 'select id from public.profiles where id = $1', [U.lead1.id])).rows, [], "a user cannot read another user's profile");
eq((await as('mem1', "update public.profiles set full_name = 'عضو أول معدّل', phone = '0911111111' where id = $1", [U.mem1.id])).n, 1, 'own full_name/phone can be updated');
denied(await as('mem1', "update public.profiles set role = 'admin' where id = $1", [U.mem1.id]), 'profile update cannot set role=admin');
denied(await as('mem1', "update public.profiles set role = 'leader' where id = $1", [U.mem1.id]), 'profile update cannot change role at all');
denied(await as('mem1', "update public.profiles set email = 'x@example.test' where id = $1", [U.mem1.id]), 'profile update cannot change email');
eq((await as('mem1', "update public.profiles set full_name = 'hack' where id = $1", [U.lead1.id])).n, 0, "cannot update someone else's profile (0 rows)");
denied(await as('mem1', "insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')"), 'cannot insert a profile');
eq((await as('mem1', 'delete from public.profiles where id = $1', [U.mem1.id])).error ? 'err' : 'ok', 'err', 'cannot delete profiles (no grant)');
eq((await profileOf('mem1')).role, 'member', 'role unchanged after all attempts');
// defence in depth: even if someone granted UPDATE(role) by mistake, the trigger blocks the client
await owner('grant update (role, email) on public.profiles to authenticated');
denied(await as('mem1', "update public.profiles set role = 'admin' where id = $1", [U.mem1.id]), 'guard trigger blocks role change even with a (mistaken) column grant');
denied(await as('mem1', "update public.profiles set email = 'q@example.test' where id = $1", [U.mem1.id]), 'guard trigger blocks email change even with a (mistaken) column grant');
await owner('revoke update (role, email) on public.profiles from authenticated');
denied(await as('mem1', "update public.profiles set role = 'admin' where id = $1", [U.mem1.id]), 'column grant revoked again');

denied(await as('mem1', "select public.set_admin('mem1@example.test')"), 'authenticated cannot call set_admin (self promotion)');
denied(await as('evil', "select public.set_admin('evil@example.test')"), 'authenticated attacker cannot call set_admin');
eq((await as('service', "select public.set_admin('nobody-here@example.test') as r")).error, 'user_not_found', 'set_admin on unknown email -> user_not_found (service_role may call it)');
eq((await as('owner', "select public.set_admin('  Admin1@Example.test ') as r")).rows[0].r, 'admin_set', 'owner promotes admin1 (case/space-insensitive email)');
eq((await profileOf('admin1')).role, 'admin', 'admin1 is now admin');
eq((await as('admin1', 'select public.is_admin() as r')).rows[0].r, true, 'is_admin() true for admin');
eq((await as('mem1', 'select public.is_admin() as r')).rows[0].r, false, 'is_admin() false for member');
ok((await countOf('admin1', 'profiles')).rows[0].n >= 10, 'admin sees all profiles');

// set_user_role (admin only, never to/from admin)
denied(await rpc('mem1', 'set_user_role', { target: U.mem2.id, new_role: 'leader' }), 'non-admin cannot set_user_role');
denied(await rpc('admin1', 'set_user_role', { target: U.mem2.id, new_role: 'admin' }), 'admin cannot create admins through set_user_role');
denied(await rpc('admin1', 'set_user_role', { target: U.admin1.id, new_role: 'member' }), 'admin role cannot be changed via set_user_role');
fails(await rpc('admin1', 'set_user_role', { target: '00000000-0000-0000-0000-000000000000', new_role: 'leader' }), 'user_not_found', 'set_user_role unknown target');
await signUp('wrongrole', { role: 'member', fullName: 'اختار دورا خاطئا' });
eq((await rpc('admin1', 'set_user_role', { target: U.wrongrole.id, new_role: 'parent' })).rows[0].r.ok, true, 'admin can fix a wrong role');
eq((await profileOf('wrongrole')).role, 'parent', 'role changed by admin');

// ================================================================ 4. name normalisation
section('name normalisation');
const norm = async (s) => (await as('owner', 'select public.yb_norm($1) as r', [s])).rows[0].r;
eq(await norm('  أَحْمَد   '), 'احمد', 'diacritics, edge spaces and alef-hamza folded');
eq(await norm('أحـــمد'), 'احمد', 'tatweel removed');
eq(await norm('Ali   BIN Omar'), 'ali bin omar', 'case + whitespace (incl. NBSP) collapsed');
eq(await norm('فاطمة'), await norm('فاطمه'), 'ta marbuta == ha');
eq(await norm('مصطفى'), await norm('مصطفي'), 'alef maqsura == ya');
ok((await norm('محمد')) !== (await norm('أحمد')), 'different names stay different');
eq(await norm(null), '', 'null -> empty string');

// ================================================================ 5. leaders and teams
section('leader: team creation');
const T = {};   // team ids
const mkTeam = async (who, name, area = 'حي تجريبي') => {
  const r = await as(who, 'insert into public.teams (name, area) values ($1, $2) returning *', [name, area]);
  return r;
};
let r = await mkTeam('lead1', '  فريق الينابيع  ');
ok(!r.error, 'leader can create a team: ' + (r.error || ''));
T.A = r.rows[0];
eq(T.A.leader_id, U.lead1.id, 'leader_id forced to the caller');
eq(T.A.status, 'draft', 'new team is draft');
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(T.A.join_code), 'join code is 6 chars without 0/O/1/I/L: ' + T.A.join_code);
eq(T.A.name, 'فريق الينابيع', 'team name trimmed');
eq((await countOf('lead1', 'team_members', `where team_id = '${T.A.id}'`)).rows[0].n, 1, 'leader roster row created automatically');
const lr = (await as('lead1', 'select * from public.team_members where is_leader')).rows[0];
eq([lr.full_name, lr.user_id, lr.is_leader], ['قائد الفريق الأول', U.lead1.id, true], 'leader row carries the leader name and user_id');
denied(await as('lead1', 'insert into public.teams (name, leader_id) values ($1, $2)', ['فريق مزور', U.lead2.id]), 'leader cannot choose leader_id (no column grant)');
denied(await as('lead1', "insert into public.teams (name, status) values ('فريق معتمد', 'approved')"), 'leader cannot insert an approved team');
denied(await as('lead1', "insert into public.teams (name, join_code) values ('فريق كود', 'AAAAAA')"), 'leader cannot choose join_code');
ok((await as('lead1', "insert into public.teams (name) values ('فريق ثان لنفس القائد')")).code === '23505', 'one team per leader (unique)');
denied(await mkTeam('mem1', 'فريق عضو'), 'a member cannot create a team');
denied(await mkTeam('par1', 'فريق ولي أمر'), 'a parent cannot create a team');
ok((await mkTeam('admin1', 'x')).code === '23514', 'even admin cannot create a 1-char team name (check constraint)');
r = await mkTeam('lead2', 'فَرِيقُ الـيَنَابِيعِ');                       // same name with diacritics + tatweel
ok(r.code === '23505', 'team name unique ignoring diacritics/tatweel/case: ' + (r.error || 'created!'));
r = await mkTeam('lead2', 'فريق   الينابيع');
ok(r.code === '23505', 'team name unique ignoring extra spaces');
ok((await mkTeam('lead2', 'ف')).code === '23514', 'team name must be at least 2 chars');
r = await mkTeam('lead2', 'فريق النور');
ok(!r.error, 'second leader creates team B: ' + (r.error || ''));
T.B = r.rows[0];
ok(T.A.join_code !== T.B.join_code, 'join codes differ');
eq((await countOf('lead1', 'teams')).rows[0].n, 1, 'leader A sees only team A');
eq((await countOf('lead2', 'teams')).rows[0].n, 1, 'leader B sees only team B');
eq((await as('lead1', 'select id from public.teams where id = $1', [T.B.id])).rows, [], 'leader A cannot read team B');

section('leader: members');
const addMember = (who, team, name, age = 12, g = 'ولي أمر ' + name, ph = '0912345678') =>
  as(who, 'insert into public.team_members (team_id, full_name, age, guardian_name, guardian_phone) values ($1,$2,$3,$4,$5) returning *', [team.id, name, age, g, ph]);
const namesA = ['محمد أحمد علي', 'عبد الله سالم', 'يوسف خالد', 'إبراهيم نور', 'سلمان عمر', 'حمزة ياسر'];
const MA = {};
for (const n of namesA.slice(0, 2)) { r = await addMember('lead1', T.A, n); ok(!r.error, 'leader adds member ' + n + ' ' + (r.error || '')); MA[n] = r.rows[0]; }
r = await addMember('lead1', T.A, 'محمد  أحمد   علي');
ok(r.code === '23505', 'duplicate member name (extra spaces) rejected within the team');
r = await addMember('lead1', T.A, 'مُحَمَّد أحمد علي');
ok(r.code === '23505', 'duplicate member name (diacritics) rejected within the team');
r = await addMember('lead1', T.A, 'عَبْدُ اللّٰه سالم');
ok(r.code === '23505', 'duplicate normalised name rejected (different diacritics, same person)');
ok((await addMember('lead1', T.A, 'ك')).code === '23514', 'member name needs 2+ chars');
ok((await addMember('lead1', T.A, 'طفل صغير', 2)).code === '23514', 'age below 4 rejected');
ok((await addMember('lead1', T.A, 'طفل كبير', 200)).code === '23514', 'age above 100 rejected');
r = await as('lead1', "update public.teams set status = 'submitted' where id = $1", [T.A.id]);
fails(r, 'members_count_invalid', 'cannot submit with only 3 members (5-7 incl. leader required)');
for (const n of namesA.slice(2, 4)) { r = await addMember('lead1', T.A, n); ok(!r.error, 'leader adds member ' + n + ' ' + (r.error || '')); MA[n] = r.rows[0]; }
r = await as('lead1', "update public.teams set status = 'submitted' where id = $1 returning status", [T.A.id]);
eq(r.rows?.[0]?.status, 'submitted', 'leader can submit with 5 members (draft -> submitted)');
for (const n of namesA.slice(4)) { r = await addMember('lead1', T.A, n); ok(!r.error, 'leader can still add members while submitted: ' + n + ' ' + (r.error || '')); MA[n] = r.rows[0]; }
r = await addMember('lead1', T.A, 'عضو ثامن');
fails(r, 'team_full', 'an 8th member is rejected (max 7 incl. leader)');
eq((await as('lead1', "update public.teams set status = 'draft' where id = $1 returning status", [T.A.id])).rows?.[0]?.status, 'draft', 'leader can move submitted -> draft');
eq((await as('lead1', "update public.teams set status = 'submitted' where id = $1 returning status", [T.A.id])).rows?.[0]?.status, 'submitted', 'and draft -> submitted again (7 members)');

// leader B team members (names may repeat across teams)
const namesB = ['محمد أحمد علي', 'سارة منير', 'ليلى حسن', 'نور الدين', 'هدى فؤاد'];
const MB = {};
for (const n of namesB) { r = await addMember('lead2', T.B, n, 11); ok(!r.error, 'leader B adds ' + n + ' (same name as in team A is fine) ' + (r.error || '')); MB[n] = r.rows[0]; }

section('leader: privilege boundaries');
for (const st of ['approved', 'rejected', 'bogus']) {
  denied(await as('lead1', "update public.teams set status = $2 where id = $1", [T.A.id, st]), `leader cannot set status=${st}`);
}
denied(await as('lead1', "update public.teams set join_code = 'AAAAAA' where id = $1", [T.A.id]), 'leader cannot overwrite join_code');
denied(await as('lead1', "update public.teams set leader_id = $2 where id = $1", [T.A.id, U.lead2.id]), 'leader cannot hand the team to someone else');
denied(await as('lead1', "update public.teams set admin_note = 'ok' where id = $1", [T.A.id]), 'leader cannot write admin_note');
eq((await as('lead1', "update public.teams set area = 'حي جديد' where id = $1", [T.A.id])).n, 1, 'leader can edit area');
ok((await as('lead1', "update public.teams set name = 'فريق النور' where id = $1", [T.A.id])).code === '23505', 'renaming to another team name is rejected');
eq((await as('lead2', "update public.teams set name = 'اختطاف' where id = $1", [T.A.id])).n, 0, 'leader B cannot modify team A (0 rows)');
eq((await as('lead2', 'delete from public.teams where id = $1', [T.A.id])).n, 0, 'leader B cannot delete team A');
eq((await as('lead1', 'delete from public.teams where id = $1', [T.A.id])).n, 0, 'leader cannot delete even their own team (admin only)');
eq((await as('lead2', 'select id from public.team_members where team_id = $1', [T.A.id])).rows, [], 'leader B cannot read members of team A');
denied(await addMember('lead2', T.A, 'متسلل'), 'leader B cannot insert a member into team A');
eq((await as('lead2', "update public.team_members set age = 5 where team_id = $1", [T.A.id])).n, 0, "leader B cannot update team A's members");
eq((await as('lead2', 'delete from public.team_members where team_id = $1', [T.A.id])).n, 0, "leader B cannot delete team A's members");
fails(await rpc('lead2', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: true }), 'permission_denied', 'leader B cannot mark consent in team A');
fails(await rpc('lead2', 'regenerate_join_code', { team_id: T.A.id }), 'permission_denied', 'leader B cannot regenerate the code of team A');
fails(await rpc('lead2', 'unlink_member', { member_id: MA['يوسف خالد'].id }), 'permission_denied', 'leader B cannot unlink members of team A');
const own = (await as('lead1', 'select guardian_name, guardian_phone, age from public.team_members where id = $1', [MA['يوسف خالد'].id])).rows[0];
eq(own, { guardian_name: 'ولي أمر يوسف خالد', guardian_phone: '0912345678', age: 12 }, 'leader reads guardian columns of own members');
eq((await as('lead1', "update public.team_members set age = 13, guardian_phone = '0900000001' where id = $1", [MA['يوسف خالد'].id])).n, 1, 'leader edits own member while submitted');
for (const col of ["consent_status = 'received'", 'consent_at = now()', `user_id = '${U.mem3.id}'`, 'is_leader = true', `team_id = '${T.B.id}'`]) {
  denied(await as('lead1', `update public.team_members set ${col} where id = $1`, [MA['يوسف خالد'].id]), 'leader cannot update directly: ' + col.split(' ')[0]);
}
denied(await as('lead1', 'insert into public.team_members (team_id, full_name, is_leader) values ($1, $2, true)', [T.A.id, 'قائد مزيف']), 'leader cannot insert a second leader row (column grant)');
denied(await as('lead1', 'insert into public.team_members (team_id, full_name, consent_status) values ($1, $2, $3)', [T.A.id, 'موافقة مزورة', 'received']), 'leader cannot insert a row with consent already received');
eq((await as('lead1', 'delete from public.team_members where is_leader and team_id = $1', [T.A.id])).n, 0, 'leader cannot delete the leader row');
{
  const tmp = await as('lead1', "delete from public.team_members where id = $1", [MA['حمزة ياسر'].id]);
  eq(tmp.n, 1, 'leader deletes a member while submitted');
  r = await addMember('lead1', T.A, 'حمزة ياسر');
  ok(!r.error, 're-adds the member'); MA['حمزة ياسر'] = r.rows[0];
}

// ================================================================ 6. members join
section('member: join_team');
const code = T.A.join_code;
fails(await rpc('mem1', 'join_team', { code: 'ZZZZZZ', member_name: 'محمد أحمد علي' }), 'team_not_found', 'wrong code');
fails(await rpc('mem1', 'join_team', { code: 'abc', member_name: 'محمد أحمد علي' }), 'team_not_found', 'malformed code');
fails(await rpc('mem1', 'join_team', { code: null, member_name: 'محمد أحمد علي' }), 'team_not_found', 'null code');
fails(await rpc('mem1', 'join_team', { code, member_name: 'اسم غير موجود' }), 'name_not_in_roster', 'name not in roster');
fails(await rpc('mem1', 'join_team', { code, member_name: '   ' }), 'name_not_in_roster', 'blank name');
fails(await rpc('mem1', 'join_team', { code, member_name: null }), 'name_not_in_roster', 'null name');
fails(await rpc('mem1', 'join_team', { code: T.B.join_code, member_name: 'عبد الله سالم' }), 'name_not_in_roster', "a name of team A does not work with team B's code");
fails(await rpc('lead2', 'join_team', { code, member_name: 'محمد أحمد علي' }), 'wrong_role', 'a leader cannot use join_team');
fails(await rpc('par1', 'join_team', { code, member_name: 'محمد أحمد علي' }), 'wrong_role', 'a parent cannot use join_team');
const spaced = code.toLowerCase().slice(0, 3) + ' - ' + code.toLowerCase().slice(3);
r = await rpc('mem1', 'join_team', { code: spaced, member_name: 'محمد  احمد علي' });
ok(!r.error && r.rows[0].r.team_id === T.A.id, 'join works with lower-case code with spaces/dash and a spelling variant of the name: ' + (r.error || ''));
eq((await owner('select user_id from public.team_members where id = $1', [MA['محمد أحمد علي'].id])).rows[0].user_id, U.mem1.id, 'roster row is linked to the member');
fails(await rpc('mem1', 'join_team', { code, member_name: 'محمد أحمد علي' }), 'already_linked', 'joining twice -> already_linked');
fails(await rpc('mem2', 'join_team', { code, member_name: 'محمد أحمد علي' }), 'already_linked', 'a roster row already taken by someone else -> already_linked');
fails(await rpc('mem1', 'join_team', { code, member_name: 'عبد الله سالم' }), 'already_linked', 'one account cannot take two roster rows');
fails(await rpc('mem1', 'join_team', { code: T.B.join_code, member_name: 'سارة منير' }), 'already_linked', 'one account cannot join two teams');
r = await rpc('mem2', 'join_team', { code, member_name: 'عبد الله سالم' });
ok(!r.error, 'second member joins: ' + (r.error || ''));

section('member: what a member can and cannot see');
let rows = (await as('mem1', 'select * from public.team_members')).rows;
eq(rows.map((x) => x.id), [MA['محمد أحمد علي'].id], 'member sees exactly one team_members row (own)');
eq((await as('mem1', 'select guardian_name, guardian_phone, age from public.team_members where id <> $1', [MA['محمد أحمد علي'].id])).rows, [], "member cannot select teammates' guardian_*/age from the table");
eq((await as('mem1', 'select guardian_name from public.team_members where id = $1', [MA['يوسف خالد'].id])).rows, [], "member cannot read a teammate's guardian_name by id");
rows = (await as('mem1', 'select * from public.my_roster order by full_name')).rows;
eq(rows.length, 7, 'member sees the full roster (7 names) through my_roster');
ok(rows.some((x) => x.full_name === 'عبد الله سالم') && rows.some((x) => x.full_name === 'قائد الفريق الأول'), 'roster contains teammate and leader names');
eq(Object.keys(rows[0]).sort(), ['consent_status', 'full_name', 'is_leader', 'is_me', 'joined', 'member_id', 'team_id'], 'my_roster exposes exactly these columns (no age/guardian/user_id)');
eq(rows.filter((x) => x.is_me).length, 1, 'exactly one row is_me');
eq(rows.filter((x) => !x.is_me && x.consent_status !== null).length, 0, "consent status of teammates is not exposed");
eq(rows.find((x) => x.is_me).consent_status, 'pending', 'own consent status is exposed');
for (const col of ['guardian_name', 'guardian_phone', 'age', 'user_id']) {
  ok((await as('mem1', `select ${col} from public.my_roster`)).code === '42703', `my_roster has no column ${col}`);
}
eq((await as('mem1', 'select * from public.teams')).rows, [], 'member cannot read the teams table (join_code stays hidden)');
eq((await as('mem1', 'select * from public.parent_links')).rows, [], 'member sees no parent_links');
eq((await as('mem1', 'select * from public.my_children')).rows, [], 'member has no children');
eq((await as('mem1', 'select * from public.audit_log')).rows, [], 'member sees no audit_log rows');
eq((await as('mem1', "update public.team_members set age = 99 where id = $1", [MA['محمد أحمد علي'].id])).n, 0, 'member cannot edit even their own row');
denied(await as('mem1', 'insert into public.team_members (team_id, full_name) values ($1, $2)', [T.A.id, 'دخيل']), 'member cannot add roster rows');
eq((await as('mem1', 'delete from public.team_members where id = $1', [MA['محمد أحمد علي'].id])).n, 0, 'member cannot delete roster rows');
r = (await as('mem1', 'select * from public.my_team()')).rows;
eq([r.length, r[0]?.my_role, r[0]?.join_code, r[0]?.admin_note, r[0]?.team_name, r[0]?.status], [1, 'member', null, null, 'فريق الينابيع', 'submitted'], 'my_team() for a member: team + status, no join_code / admin_note');
fails(await rpc('mem1', 'link_child', { code, child_name: 'يوسف خالد' }), 'wrong_role', 'a member cannot use link_child');
fails(await rpc('mem1', 'approve_team', { team_id: T.A.id, ok: true, note: null }), 'permission_denied', 'member cannot approve a team');
eq((await as('lead2', 'select team_id from public.my_roster')).rows.every((x) => x.team_id === T.B.id), true, "leader B's roster view only shows team B");
eq((await as('lead2', 'select count(*)::int as n from public.my_roster')).rows[0].n, 6, 'leader B sees 6 roster names (leader + 5)');

// ================================================================ 7. parents
section('parent: link_child');
fails(await rpc('par1', 'link_child', { code: 'ZZZZZZ', child_name: 'يوسف خالد' }), 'team_not_found', 'parent: wrong code');
fails(await rpc('par1', 'link_child', { code, child_name: 'غير موجود' }), 'name_not_in_roster', 'parent: name not in roster');
fails(await rpc('par1', 'link_child', { code: T.B.join_code, child_name: 'يوسف خالد' }), 'name_not_in_roster', "parent: child of team A with the code of team B");
fails(await rpc('lead1', 'link_child', { code, child_name: 'يوسف خالد' }), 'wrong_role', 'a leader cannot use link_child');
r = await rpc('par1', 'link_child', { code: code.toLowerCase(), child_name: 'يوسف  خالد' });
ok(!r.error && r.rows[0].r.member_id === MA['يوسف خالد'].id, 'parent links a child: ' + (r.error || ''));
fails(await rpc('par1', 'link_child', { code, child_name: 'يوسف خالد' }), 'already_linked', 'linking the same child twice -> already_linked');
r = await rpc('par2', 'link_child', { code, child_name: 'يوسف خالد' });
ok(!r.error, 'a second parent may link the same child: ' + (r.error || ''));
r = await rpc('par2', 'link_child', { code, child_name: 'حمزة ياسر' });
ok(!r.error, 'second parent links another child');
rows = (await as('par1', 'select * from public.my_children')).rows;
eq(rows.map((x) => [x.full_name, x.consent_status, x.team_name, x.team_status]), [['يوسف خالد', 'pending', 'فريق الينابيع', 'submitted']], 'parent sees only their child + consent + team');
eq((await as('par1', 'select id from public.team_members')).rows.map((x) => x.id), [MA['يوسف خالد'].id], 'parent can select only the linked child from team_members');
eq((await as('par1', 'select * from public.team_members where id = $1', [MA['حمزة ياسر'].id])).rows, [], "parent cannot read another child's row");
eq((await as('par1', 'select * from public.team_members where id = $1', [MA['محمد أحمد علي'].id])).rows, [], 'parent cannot read other children by id');
eq((await as('par1', 'select * from public.my_roster')).rows, [], 'parents get no roster view');
eq((await as('par1', 'select * from public.teams')).rows, [], 'parent cannot read teams table');
eq((await as('par1', 'select member_id from public.parent_links')).rows.length, 1, 'parent sees only their own link');
eq((await as('par2', 'select member_id from public.parent_links')).rows.length, 2, 'the other parent sees their own two links');
r = (await as('par1', 'select * from public.my_team()')).rows;
eq([r.length, r[0]?.my_role, r[0]?.join_code], [1, 'parent', null], 'my_team() for a parent: role parent, no join_code');
eq((await as('par1', "update public.team_members set guardian_phone = '1' where id = $1", [MA['يوسف خالد'].id])).n, 0, 'parent cannot edit the child row');
denied(await as('par1', 'insert into public.parent_links (parent_id, member_id) values ($1, $2)', [U.par1.id, MA['حمزة ياسر'].id]), 'parent cannot insert parent_links directly (must use link_child)');
eq((await as('par1', 'delete from public.parent_links where parent_id = $1', [U.par2.id])).n, 0, "parent cannot delete another parent's links");
fails(await rpc('par1', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: true }), 'permission_denied', 'parent cannot mark consent');
{
  await rpc('par1', 'link_child', { code, child_name: 'حمزة ياسر' });
  eq((await as('par1', 'delete from public.parent_links where member_id = $1', [MA['حمزة ياسر'].id])).n, 1, 'parent can remove their own link');
}

// ================================================================ 8. consent
section('consent marking');
fails(await rpc('mem2', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: true }), 'permission_denied', 'member cannot mark consent');
fails(await rpc('par1', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: true }), 'permission_denied', 'parent cannot mark consent (again, after linking)');
fails(await rpc('lead1', 'mark_consent', { member_id: '00000000-0000-0000-0000-000000000000', received: true }), 'member_not_found', 'unknown member');
fails(await rpc('lead1', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: null }), 'invalid_argument', 'received must be true/false');
r = await rpc('lead1', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: true });
eq(r.rows?.[0]?.r?.consent_status, 'received', 'leader marks consent of own member');
const cm = (await owner('select consent_status, consent_at from public.team_members where id = $1', [MA['يوسف خالد'].id])).rows[0];
ok(cm.consent_status === 'received' && cm.consent_at instanceof Date, 'consent_at is set');
eq((await as('par1', 'select consent_status from public.my_children')).rows[0].consent_status, 'received', 'the parent sees the consent status change');
r = await rpc('lead1', 'mark_consent', { member_id: MA['يوسف خالد'].id, received: false });
eq((await owner('select consent_status, consent_at from public.team_members where id = $1', [MA['يوسف خالد'].id])).rows[0], { consent_status: 'pending', consent_at: null }, 'unmarking resets consent_at');
r = await rpc('admin1', 'mark_consent', { member_id: MA['عبد الله سالم'].id, received: true });
eq(r.rows?.[0]?.r?.ok, true, 'admin marks consent');
eq((await as('mem2', 'select consent_status from public.my_roster where is_me')).rows[0].consent_status, 'received', 'the member sees their own consent status');

// ================================================================ 9. unlink / regenerate
section('unlink_member and regenerate_join_code');
fails(await rpc('mem1', 'unlink_member', { member_id: MA['محمد أحمد علي'].id }), 'permission_denied', 'a member cannot unlink');
fails(await rpc('lead1', 'unlink_member', { member_id: lr.id }), 'permission_denied', 'the leader row cannot be unlinked by the leader');
r = await rpc('lead1', 'unlink_member', { member_id: MA['يوسف خالد'].id });
eq(r.rows?.[0]?.r?.ok, true, 'leader unlinks a roster row (parent links removed)');
eq((await as('par1', 'select * from public.my_children')).rows, [], 'parent links of that row are gone');
r = await rpc('par1', 'link_child', { code, child_name: 'يوسف خالد' });
ok(!r.error, 'parent can link again with the code: ' + (r.error || ''));
r = await rpc('lead1', 'unlink_member', { member_id: MA['محمد أحمد علي'].id });
eq((await as('mem1', 'select * from public.my_roster')).rows, [], 'unlinked member lost roster access');
r = await rpc('mem1', 'join_team', { code, member_name: 'محمد أحمد علي' });
ok(!r.error, 'unlinked member can join again: ' + (r.error || ''));
fails(await rpc('lead2', 'regenerate_join_code', { team_id: T.A.id }), 'permission_denied', 'other leader cannot regenerate');
fails(await rpc('mem1', 'regenerate_join_code', { team_id: T.A.id }), 'permission_denied', 'member cannot regenerate');
r = await rpc('lead1', 'regenerate_join_code', { team_id: T.A.id });
const newCode = r.rows?.[0]?.r;
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(newCode) && newCode !== code, 'leader regenerates the join code: ' + newCode);
fails(await rpc('mem3', 'join_team', { code, member_name: 'سلمان عمر' }), 'team_not_found', 'old code stops working');
r = await rpc('mem3', 'join_team', { code: newCode, member_name: 'سلمان عمر' });
ok(!r.error, 'new code works: ' + (r.error || ''));
eq((await as('mem1', 'select count(*)::int as n from public.my_roster')).rows[0].n, 7, 'existing members keep access after regeneration');
r = await rpc('admin1', 'regenerate_join_code', { team_id: T.B.id });
ok(/^[A-Z2-9]{6}$/.test(r.rows?.[0]?.r || ''), 'admin can regenerate any code');
T.A.join_code = newCode;
T.B.join_code = r.rows[0].r;

// ================================================================ 10. admin & approval
section('admin: approval and lock after approval');
fails(await rpc('lead1', 'approve_team', { team_id: T.A.id, ok: true, note: null }), 'permission_denied', 'leader cannot approve own team');
fails(await rpc('par1', 'approve_team', { team_id: T.A.id, ok: true, note: null }), 'permission_denied', 'parent cannot approve');
fails(await rpc('evil', 'approve_team', { team_id: T.A.id, ok: true, note: null }), 'permission_denied', 'user who tried to self-assign admin cannot approve');
fails(await rpc('admin1', 'approve_team', { team_id: '00000000-0000-0000-0000-000000000000', ok: true, note: null }), 'team_not_found', 'approve unknown team');
fails(await rpc('admin1', 'approve_team', { team_id: T.A.id, ok: null, note: null }), 'invalid_argument', 'ok must be boolean');
fails(await rpc('admin1', 'approve_team', { team_id: T.A.id, ok: true, note: 'x'.repeat(501) }), 'invalid_argument', 'note longer than 500 rejected');
eq((await as('admin1', 'select count(*)::int as n from public.teams')).rows[0].n, 2, 'admin sees all teams');
ok((await as('admin1', 'select count(*)::int as n from public.team_members')).rows[0].n >= 13, 'admin sees all team members');
eq((await as('admin1', 'select count(*)::int as n from public.parent_links')).rows[0].n >= 2, true, 'admin sees parent_links');
rows = (await as('admin1', 'select guardian_name from public.team_members where guardian_name is not null limit 1')).rows;
eq(rows.length, 1, 'admin reads guardian columns');
r = await rpc('admin1', 'approve_team', { team_id: T.A.id, ok: false, note: 'استكمال البيانات' });
eq(r.rows?.[0]?.r?.status, 'rejected', 'admin rejects with a note');
r = (await as('lead1', 'select * from public.my_team()')).rows[0];
eq([r.status, r.admin_note, r.my_role, r.join_code], ['rejected', 'استكمال البيانات', 'leader', T.A.join_code], 'leader reads status, admin_note and join_code through my_team()');
eq((await as('lead1', "update public.teams set name = 'محاولة' where id = $1", [T.A.id])).n, 0, 'leader cannot edit a rejected team');
eq((await as('anon', 'select * from public.public_teams')).rows, [], 'rejected teams are not public');
eq((await as('admin1', "update public.teams set status = 'draft' where id = $1", [T.A.id])).n, 1, 'admin reopens (reject -> draft) with a direct update');
eq((await as('lead1', "update public.teams set area = 'حي ثالث' where id = $1", [T.A.id])).n, 1, 'leader can edit again after reopen');
eq((await as('lead1', "update public.teams set status = 'submitted' where id = $1", [T.A.id])).n, 1, 'and submit again');
r = await rpc('admin1', 'approve_team', { team_id: T.A.id, ok: true, note: null });
eq(r.rows?.[0]?.r?.status, 'approved', 'admin approves');
eq((await owner('select admin_note from public.teams where id = $1', [T.A.id])).rows[0].admin_note, null, 'empty note clears admin_note');
rows = (await as('anon', 'select * from public.public_teams')).rows;
eq(rows.map((x) => Object.keys(x).sort()), [['area', 'id', 'name']], 'anon sees approved teams with id/name/area only');
eq(rows[0].name, 'فريق الينابيع', 'public_teams lists team A');
eq((await as('anon', 'select * from public.public_teams where id = $1', [T.B.id])).rows, [], 'draft team B is not public');
// everything locked for the leader now
eq((await as('lead1', "update public.teams set name = 'اسم جديد' where id = $1", [T.A.id])).n, 0, 'approved: leader cannot rename');
eq((await as('lead1', "update public.teams set status = 'draft' where id = $1", [T.A.id])).n, 0, 'approved: leader cannot move it back to draft');
denied(await addMember('lead1', T.A, 'عضو بعد الاعتماد'), 'approved: leader cannot add members');
eq((await as('lead1', "update public.team_members set age = 9 where id = $1", [MA['حمزة ياسر'].id])).n, 0, 'approved: leader cannot edit members');
eq((await as('lead1', 'delete from public.team_members where id = $1', [MA['حمزة ياسر'].id])).n, 0, 'approved: leader cannot delete members');
fails(await rpc('lead1', 'mark_consent', { member_id: MA['حمزة ياسر'].id, received: true }), 'permission_denied', 'approved: leader cannot mark consent');
fails(await rpc('lead1', 'unlink_member', { member_id: MA['سلمان عمر'].id }), 'permission_denied', 'approved: leader cannot unlink');
eq((await rpc('admin1', 'mark_consent', { member_id: MA['حمزة ياسر'].id, received: true })).rows?.[0]?.r?.ok, true, 'approved: admin can still mark consent');
eq((await as('admin1', "update public.team_members set age = 10 where id = $1", [MA['حمزة ياسر'].id])).n, 1, 'approved: admin can still edit members');
eq((await as('mem1', 'select status from public.my_team()')).rows[0].status, 'approved', 'member sees the approved status');
eq((await as('par1', 'select team_status from public.my_children')).rows[0].team_status, 'approved', 'parent sees the approved status');
// admin deletes a team (cascade)
await signUp('tmpl', { role: 'leader', fullName: 'قائد مؤقت' });
r = await mkTeam('tmpl', 'فريق مؤقت');
const tmpTeam = r.rows[0];
eq((await as('tmpl', 'delete from public.teams where id = $1', [tmpTeam.id])).n, 0, 'leader cannot delete the team');
eq((await as('admin1', 'delete from public.teams where id = $1', [tmpTeam.id])).n, 1, 'admin can delete a team');
eq((await owner('select count(*)::int as n from public.team_members where team_id = $1', [tmpTeam.id])).rows[0].n, 0, 'its roster is deleted with it (cascade)');

// ================================================================ 11. tournament_state
section('tournament_state and publish_state');
const stateObj = (marker, withChess = true) => JSON.stringify({
  v: 1, marker,
  teams: [{ id: T.A.id, name: 'فريق الينابيع' }, { id: T.B.id, name: 'فريق النور', ...(withChess ? { chess: 'طفل لاعب شطرنج' } : {}) }],
});
const pub = (who, state, prev) => rpc(who, 'publish_state', { state, prev });
fails(await pub('lead1', stateObj('x'), null), 'permission_denied', 'leader cannot publish');
fails(await pub('mem1', stateObj('x'), null), 'permission_denied', 'member cannot publish');
fails(await pub('evil', stateObj('x'), null), 'permission_denied', 'self-promotion attempt cannot publish');
denied(await pub('anon', stateObj('x'), null), 'anon cannot publish');
eq((await as('anon', 'select * from public.tournament_state')).rows, [], 'nothing published yet');
r = await pub('admin1', stateObj('one'), null);
const p1 = r.rows?.[0]?.r;
ok(p1?.ok === true && p1.conflict === false && typeof p1.updated_at === 'string', 'admin publishes the first state: ' + (r.error || JSON.stringify(p1)));
eq(p1?.stripped, true, 'chess player labels are stripped and the client is told');
r = (await as('anon', 'select state, updated_at from public.tournament_state')).rows;
eq(r.length, 1, 'anon reads the published state');
ok(!JSON.stringify(r[0].state).includes('طفل لاعب شطرنج') && !('chess' in r[0].state.teams[1]), 'no chess label (child name) in the public state');
eq(r[0].state.teams.map((t) => t.name), ['فريق الينابيع', 'فريق النور'], 'team order and names preserved');
r = await pub('admin1', stateObj('two', false), p1.updated_at);
const p2 = r.rows?.[0]?.r;
ok(p2?.ok === true && p2.updated_at !== p1.updated_at && !('stripped' in p2), 'publish with the right prev succeeds: ' + (r.error || ''));
ok(new Date(p2.updated_at) > new Date(p1.updated_at), 'updated_at moves forward');
const auditBefore = (await owner("select count(*)::int as n from public.audit_log where action = 'state_publish'")).rows[0].n;
r = await pub('admin1', stateObj('stale'), p1.updated_at);
eq([r.rows?.[0]?.r?.ok, r.rows?.[0]?.r?.conflict, r.rows?.[0]?.r?.updated_at], [false, true, p2.updated_at], 'stale prev -> conflict true, nothing written, current updated_at returned');
eq((await owner("select state ->> 'marker' as m from public.tournament_state where id = 1")).rows[0].m, 'two', 'the stale publish did not write');
r = await pub('admin1', stateObj('nullprev'), null);
eq(r.rows?.[0]?.r?.conflict, true, 'prev=null while a row exists -> conflict');
eq((await owner("select count(*)::int as n from public.audit_log where action = 'state_publish'")).rows[0].n, auditBefore, 'conflicts leave no audit trail entries');
fails(await pub('admin1', '[1,2]', p2.updated_at), 'invalid_state', 'state must be a JSON object (array rejected)');
fails(await pub('admin1', '"text"', p2.updated_at), 'invalid_state', 'state must be a JSON object (scalar rejected)');
fails(await pub('admin1', JSON.stringify({ blob: 'x'.repeat(270000) }), p2.updated_at), 'state_too_large', 'state larger than 256 KB rejected');
denied(await as('lead1', "insert into public.tournament_state (id, state) values (1, '{}') on conflict (id) do update set state = excluded.state"), 'leader cannot write tournament_state directly');
eq((await as('lead1', "update public.tournament_state set state = '{\"hack\":1}'")).n, 0, 'leader update of tournament_state affects 0 rows');
denied(await as('anon', "update public.tournament_state set state = '{}'"), 'anon cannot update tournament_state');
eq((await owner("select state ->> 'marker' as m from public.tournament_state")).rows[0].m, 'two', 'state untouched by the attacks');
eq((await as('lead1', 'select count(*)::int as n from public.tournament_state')).rows[0].n, 1, 'authenticated users read the state too');
ok((await as('admin1', "insert into public.tournament_state (id, state) values (2, '{}')")).code === '23514', 'only the single row id=1 can exist');
eq((await as('admin1', "update public.tournament_state set state = state || '{\"direct\":true}'::jsonb")).n, 1, 'admin direct update works (emergency path)');
r = await pub('admin1', stateObj('after-direct'), p2.updated_at);
eq(r.rows?.[0]?.r?.conflict, true, 'a direct admin write bumps updated_at, so older clients get a conflict');

// ================================================================ 12. audit log
section('audit_log');
ok((await as('admin1', 'select count(*)::int as n from public.audit_log')).rows[0].n > 20, 'admin reads the audit log');
eq((await as('lead1', 'select * from public.audit_log')).rows, [], 'leader sees no audit rows');
eq((await as('par1', 'select * from public.audit_log')).rows, [], 'parent sees no audit rows');
denied(await as('anon', 'select * from public.audit_log'), 'anon cannot read audit_log');
denied(await as('admin1', "insert into public.audit_log (action) values ('forged')"), 'even admin cannot write the audit log through the API');
denied(await as('admin1', "update public.audit_log set action = 'x'"), 'even admin cannot rewrite the audit log');
denied(await as('admin1', 'delete from public.audit_log'), 'even admin cannot delete audit rows');
const acts = new Set((await as('admin1', 'select distinct action from public.audit_log')).rows.map((x) => x.action));
for (const a of ['team_create', 'team_status', 'member_add', 'member_link', 'member_unlink', 'consent', 'child_link', 'child_unlink', 'role_change', 'state_publish', 'team_delete']) {
  ok(acts.has(a), 'audit has action ' + a);
}
const auditText = JSON.stringify((await owner('select * from public.audit_log')).rows);
const allNames = [...namesA, ...namesB, 'قائد الفريق الأول', 'ولي أمر يوسف خالد', '0912345678', 'طفل لاعب شطرنج'];
eq(allNames.filter((n) => auditText.includes(n)), [], 'audit log contains no names, guardian data or phones');

// ================================================================ 13. privacy sweep
section('privacy sweep: what the public can ever see');
{
  const pubText = JSON.stringify([
    (await as('anon', 'select * from public.public_teams')).rows,
    (await as('anon', 'select * from public.tournament_state')).rows,
  ]);
  const sensitive = [...namesA, ...namesB, 'قائد الفريق الأول', 'قائد الفريق الثاني', 'ولي أمر', '0912345678', 'طفل لاعب شطرنج', '@example.test'];
  eq(sensitive.filter((n) => pubText.includes(n)), [], 'public data (anon) contains no child, guardian, leader, phone or e-mail data');
  const unrelated = JSON.stringify([
    (await as('mem3', 'select * from public.profiles')).rows,
    (await as('mem3', 'select * from public.team_members')).rows.map((x) => x.full_name),
  ]);
  ok(!namesB.some((n) => unrelated.includes(n)), "an unrelated member sees none of team B's children");
  const leadSeesB = JSON.stringify((await as('lead1', 'select * from public.team_members')).rows) + JSON.stringify((await as('lead1', 'select * from public.my_roster')).rows);
  ok(!namesB.filter((n) => n !== 'محمد أحمد علي').some((n) => leadSeesB.includes(n)), "leader A sees none of team B's children");
}

// ================================================================ 14. injection
section('SQL injection attempts are harmless');
{
  const evil = ["' OR '1'='1", "'; drop table public.teams; --", '"; select pg_sleep(5); --', '%', '_', '\\', "x' union select join_code from teams --", 'محمد%', 'a\tb', 'ا'.repeat(100000)];
  for (const [i, e] of evil.entries()) {
    const a = await rpc('mem3', 'join_team', { code: e, member_name: 'سلمان عمر' });
    ok(a.error === 'team_not_found' || a.error === 'already_linked', `injection ${i} in join_team.code is just "not found" (${a.error})`);
    const b = await rpc('mem3', 'join_team', { code: T.A.join_code, member_name: e });
    ok(b.error === 'name_not_in_roster' || b.error === 'already_linked', `injection ${i} in join_team.member_name is just "not in roster" (${b.error})`);
    const c = await rpc('par2', 'link_child', { code: e, child_name: 'يوسف خالد' });
    ok(c.error === 'team_not_found', `injection ${i} in link_child.code (${c.error})`);
    const d = await rpc('par2', 'link_child', { code: T.A.join_code, child_name: e });
    ok(d.error === 'name_not_in_roster', `injection ${i} in link_child.child_name (${d.error})`);
  }
  eq((await owner('select count(*)::int as n from public.teams')).rows[0].n, 2, 'tables are intact after every attempt');
  await signUp('inj', { role: 'leader', fullName: "Robert'); drop table teams;--" });
  r = await mkTeam('inj', "Bobby'); drop table teams;-- x");
  ok(!r.error && r.rows[0].name === "Bobby'); drop table teams;-- x", 'quotes in a team name are stored verbatim, nothing executes');
  eq((await owner('select count(*)::int as n from public.teams')).rows[0].n, 3, 'teams table still exists');
  eq((await owner('select full_name from public.team_members where user_id = $1', [U.inj.id])).rows[0].full_name, "Robert'); drop table teams;--", 'hostile profile name stored as data');
}

// ================================================================ 15. recursion / error sweep
section('policies are recursion-free');
for (const who of ['anon', 'mem1', 'par1', 'lead1', 'lead2', 'admin1', 'evil']) {
  for (const rel of ['profiles', 'teams', 'team_members', 'parent_links', 'tournament_state', 'audit_log', 'public_teams', 'my_roster', 'my_children']) {
    noRecursion(await as(who, `select count(*) from public.${rel}`), `${who} select ${rel}`);
  }
  noRecursion(await as(who, 'select * from public.my_team()'), `${who} my_team()`);
}
for (const who of ['mem1', 'par1', 'lead1', 'admin1']) {
  noRecursion(await as(who, "update public.team_members set age = age where false"), `${who} update team_members`);
  noRecursion(await as(who, "update public.teams set name = name where false"), `${who} update teams`);
  noRecursion(await as(who, "delete from public.parent_links where false"), `${who} delete parent_links`);
  noRecursion(await as(who, "select count(*) from public.team_members m join public.teams t on t.id = m.team_id"), `${who} join members/teams`);
}

// ================================================================ 16. catalog audit
section('catalog audit (RLS, grants, definer functions)');
{
  const tables = ['profiles', 'teams', 'team_members', 'parent_links', 'tournament_state', 'audit_log'];
  const cat = (await owner(`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
      (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
  eq(cat.map((x) => x.relname).sort(), [...tables].sort(), 'exactly the six expected tables exist in public');
  ok(cat.every((x) => x.relrowsecurity), 'RLS enabled on every table');
  ok(cat.every((x) => x.relforcerowsecurity), 'RLS forced on every table');
  ok(cat.every((x) => x.policies > 0), 'every table has explicit policies');
  eq((await owner(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text, '') like '%search_path=%'`)).rows, [], 'every SECURITY DEFINER function pins search_path');
  eq((await owner(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text, '') like '%search_path=public%'`)).rows, [], 'search_path always starts with public');
  eq((await owner(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and not coalesce(c.reloptions::text, '') like '%security_barrier=true%' order by 1`)).rows, [], 'every public view is a security barrier (user filters cannot see rows before the view filter)');
  const fp = async (role, sig) => (await owner(`select has_function_privilege('${role}', '${sig}', 'execute') as r`)).rows[0].r;
  eq([await fp('anon', 'public.set_admin(text)'), await fp('authenticated', 'public.set_admin(text)'), await fp('public', 'public.set_admin(text)')], [false, false, false], 'set_admin: no execute for anon/authenticated/public');
  eq(await fp('service_role', 'public.set_admin(text)'), true, 'set_admin: service_role may execute');
  for (const sig of ['public.join_team(text,text)', 'public.publish_state(jsonb,timestamptz)', 'public.approve_team(uuid,boolean,text)', 'public.mark_consent(uuid,boolean)', 'public.link_child(text,text)', 'public.my_team()']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, true], `${sig}: authenticated only`);
  }
  for (const sig of ['public.yb_new_join_code()', 'public.yb_is_client()', 'public.yb_audit_tg()', 'public.yb_handle_new_user()']) {
    eq([await fp('anon', sig), await fp('authenticated', sig)], [false, false], `${sig}: internal, not exposed`);
  }
  const tp = async (role, rel, priv) => (await owner(`select has_table_privilege('${role}', 'public.${rel}', '${priv}') as r`)).rows[0].r;
  for (const rel of ['profiles', 'teams', 'team_members', 'parent_links', 'audit_log', 'my_roster', 'my_children']) {
    const any = [];
    for (const priv of ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) if (await tp('anon', rel, priv)) any.push(priv);
    eq(any, [], `anon has no privilege on ${rel}`);
  }
  eq([await tp('anon', 'public_teams', 'select'), await tp('anon', 'tournament_state', 'select')], [true, true], 'anon may select public_teams and tournament_state');
  eq([await tp('anon', 'tournament_state', 'insert'), await tp('anon', 'tournament_state', 'update'), await tp('anon', 'public_teams', 'insert')], [false, false, false], 'anon cannot write them');
  for (const rel of ['profiles', 'teams', 'team_members', 'parent_links', 'tournament_state', 'audit_log']) {
    const bad = [];
    for (const priv of ['truncate', 'references', 'trigger']) if (await tp('authenticated', rel, priv)) bad.push(priv);
    eq(bad, [], `authenticated has no truncate/references/trigger on ${rel}`);
  }
  eq([await tp('authenticated', 'audit_log', 'insert'), await tp('authenticated', 'audit_log', 'update'), await tp('authenticated', 'audit_log', 'delete')], [false, false, false], 'authenticated cannot write audit_log');
  eq([await tp('authenticated', 'parent_links', 'insert'), await tp('authenticated', 'profiles', 'insert'), await tp('authenticated', 'profiles', 'delete')], [false, false, false], 'no direct insert on parent_links/profiles, no delete on profiles');
  const cp = async (role, rel, col, priv) => (await owner(`select has_column_privilege('${role}', 'public.${rel}', '${col}', '${priv}') as r`)).rows[0].r;
  for (const [rel, col] of [['profiles', 'role'], ['profiles', 'email'], ['profiles', 'id'], ['teams', 'join_code'], ['teams', 'leader_id'], ['teams', 'admin_note'], ['team_members', 'consent_status'], ['team_members', 'user_id'], ['team_members', 'is_leader'], ['team_members', 'team_id']]) {
    eq(await cp('authenticated', rel, col, 'update'), false, `authenticated cannot update ${rel}.${col}`);
  }
  for (const [rel, col] of [['teams', 'status'], ['teams', 'join_code'], ['team_members', 'consent_status'], ['team_members', 'user_id'], ['team_members', 'is_leader']]) {
    eq(await cp('authenticated', rel, col, 'insert'), false, `authenticated cannot insert ${rel}.${col}`);
  }
  eq([await cp('authenticated', 'teams', 'name', 'update'), await cp('authenticated', 'team_members', 'guardian_phone', 'update'), await cp('authenticated', 'profiles', 'full_name', 'update')], [true, true, true], 'the intended editable columns are editable');
  eq((await owner("select has_sequence_privilege('authenticated', 'public.audit_log_id_seq', 'usage') as r")).rows[0].r, false, 'authenticated has no usage on the audit sequence');
  eq((await owner("select polname from pg_policy where polroles @> array['anon'::regrole::oid]::oid[] or polroles = '{0}' order by 1")).rows.map((x) => x.polname), ['state_select_all'], 'the only policy that applies to anon is the tournament_state read policy');
}

// ================================================================ 17. idempotency
section('idempotent migration');
{
  const before = (await owner('select (select count(*) from pg_policy)::int as pol, (select count(*) from public.teams)::int as teams, (select count(*) from public.profiles)::int as profiles')).rows[0];
  let res = null; try { await db.exec(MIGRATION); } catch (e) { res = e.message; }
  eq(res, null, 'the migration can be applied a second time without errors');
  const after = (await owner('select (select count(*) from pg_policy)::int as pol, (select count(*) from public.teams)::int as teams, (select count(*) from public.profiles)::int as profiles')).rows[0];
  eq(after, before, 'second run changes no policies and loses no data');
  denied(await as('anon', 'select * from public.teams'), 'privileges are still closed after the second run');
  denied(await as('mem1', "select public.set_admin('mem1@example.test')"), 'set_admin still closed after the second run');
  eq((await as('anon', 'select * from public.public_teams')).rows.length, 1, 'views were recreated and still work');
  eq((await as('mem1', 'select count(*)::int as n from public.my_roster')).rows[0].n, 7, 'my_roster still works after the second run');
}

// ================================================================ 18. scale
section('scale: 12 teams x 7 members');
{
  const t1 = Date.now();
  const st = [];
  for (let i = 1; i <= 12; i++) {
    await signUp('sl' + i, { role: 'leader', fullName: `قائد المجموعة ${i}` });
    const res = await mkTeam('sl' + i, `فريق التحدي ${i}`, `حي ${i}`);
    if (res.error) { ok(false, 'scale team create: ' + res.error); continue; }
    st.push(res.rows[0]);
    for (let m = 1; m <= 6; m++) {
      const a = await addMember('sl' + i, res.rows[0], `لاعب ${i}-${m}`, 10 + (m % 5));
      if (a.error) ok(false, 'scale add member: ' + a.error);
    }
    const sub = await as('sl' + i, "update public.teams set status = 'submitted' where id = $1", [res.rows[0].id]);
    if (sub.error) ok(false, 'scale submit: ' + sub.error);
  }
  eq(st.length, 12, '12 teams created by 12 leaders');
  eq((await as('admin1', "select count(*)::int as n from public.teams where status = 'submitted'")).rows[0].n, 12, 'all 12 are submitted');
  for (const t of st) await rpc('admin1', 'approve_team', { team_id: t.id, ok: true, note: null });
  const pubRows = (await as('anon', 'select name from public.public_teams')).rows;
  eq(pubRows.length, 13, 'public_teams lists the 12 approved scale teams plus team A');
  ok(pubRows.every((x) => !/لاعب|قائد/.test(x.name)), 'public names contain no child/leader names');
  let allOk = true;
  for (let i = 1; i <= 12; i++) {
    const seen = (await as('sl' + i, 'select count(*)::int as n from public.team_members')).rows[0].n;
    const teams = (await as('sl' + i, 'select id from public.teams')).rows;
    if (seen !== 7 || teams.length !== 1 || teams[0].id !== st[i - 1].id) allOk = false;
  }
  ok(allOk, 'each of the 12 leaders sees exactly their own team and its 7 members');
  for (let i = 1; i <= 12; i++) {
    await signUp('sm' + i, { role: 'member', fullName: `لاعب ${i}-3` });
    const j = await rpc('sm' + i, 'join_team', { code: st[i - 1].join_code, member_name: `لاعب ${i}-3` });
    if (j.error) ok(false, 'scale join: ' + j.error);
  }
  let rosterOk = true;
  for (let i = 1; i <= 12; i++) {
    const rr = (await as('sm' + i, 'select team_id from public.my_roster')).rows;
    if (rr.length !== 7 || !rr.every((x) => x.team_id === st[i - 1].id)) rosterOk = false;
    const own2 = (await as('sm' + i, 'select id from public.team_members')).rows;
    if (own2.length !== 1) rosterOk = false;
  }
  ok(rosterOk, 'each of 12 joined members sees a 7-name roster of their own team and a single table row');
  const memberTotal = (await owner('select count(*)::int as n from public.team_members')).rows[0].n;
  eq((await as('admin1', 'select count(*)::int as n from public.team_members')).rows[0].n, memberTotal, 'admin sees every member row (' + memberTotal + ')');
  ok(memberTotal >= 84 + 7, 'at least 12x7 scale rows plus the earlier teams exist');
  const pubState = await pub('admin1', JSON.stringify({ v: 1, teams: st.map((t) => ({ id: t.id, name: t.name })) }), null);
  ok(pubState.error === undefined || pubState.rows?.[0]?.r?.conflict === true, 'publishing 12 teams works or conflicts cleanly');
  const ms = Date.now() - t1;
  ok(ms < 60000, `scale scenario finished in ${ms} ms (< 60 s)`);
  console.log(`  (scale scenario took ${ms} ms)`);
}

// ================================================================ summary
const total = passed + failures.length;
console.log(`\n${passed}/${total} assertions passed in ${Date.now() - t0} ms`);
if (total < 80) { console.log('FAIL: fewer than 80 assertions'); process.exit(1); }
if (failures.length) { console.log(`\n${failures.length} FAILED:`); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('RLS test suite: ALL GREEN');
process.exit(0);
