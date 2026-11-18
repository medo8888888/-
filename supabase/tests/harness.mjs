// Shared test harness for Yanabee migrations after 0001: PGlite + a small Supabase
// emulation (auth schema, anon/authenticated/service_role, PostgREST-style
// `set local role` + request.jwt.claims, and Supabase's open DEFAULT PRIVILEGES so
// that every revoke in a migration is really proven).
// rls.test.mjs keeps its own copy of this setup on purpose (it tests 0001 alone).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
export const readMigration = (name) => readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');

export async function loadPGlite() {
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

// ---------------------------------------------------------------- assertions
export function makeAsserts() {
  const st = { passed: 0, failures: [] };
  const ok = (cond, label) => { if (cond) st.passed++; else { st.failures.push(label); console.log('  FAIL  ' + label); } };
  const eq = (actual, expected, label) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    ok(a === e, `${label}  (got ${a}, expected ${e})`);
  };
  const RLS_OR_PERM = /row-level security|permission denied/i;
  const denied = (res, label) =>
    ok(!!res.error && (res.code === '42501' || RLS_OR_PERM.test(res.error)), `${label}  (got ${res.error || 'no error'})`);
  const fails = (res, key, label) =>
    ok(!!res.error && res.error === key, `${label}  (got ${res.error || 'no error'}, expected ${key})`);
  const section = (t) => console.log('\n== ' + t);
  const finish = (t0, min) => {
    const total = st.passed + st.failures.length;
    console.log(`\n${st.passed}/${total} assertions passed in ${Date.now() - t0} ms`);
    if (total < min) { console.log(`FAIL: fewer than ${min} assertions`); process.exit(1); }
    if (st.failures.length) { console.log(`\n${st.failures.length} FAILED:`); st.failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
    console.log('ALL GREEN');
    process.exit(0);
  };
  return { ok, eq, denied, fails, section, finish, st };
}

// ---------------------------------------------------------------- environment
export async function makeEnv() {
  const PGlite = await loadPGlite();
  const db = new PGlite();
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
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);

  const U = {};
  const owner = (sql, params = []) => db.query(sql, params);
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
  async function signUp(key, meta) {
    const email = `${key}@example.test`;
    const r = await owner('insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id', [email, JSON.stringify(meta ?? {})]);
    U[key] = { id: r.rows[0].id, email };
    return U[key];
  }
  const rpc = (who, fn, args = {}) => {
    const names = Object.keys(args);
    const call = names.map((k, i) => `${k} => $${i + 1}`).join(', ');
    return as(who, `select public.${fn}(${call}) as r`, names.map((k) => args[k]));
  };
  const val = (res) => res.rows?.[0]?.r;
  return { db, U, owner, as, signUp, rpc, val };
}
