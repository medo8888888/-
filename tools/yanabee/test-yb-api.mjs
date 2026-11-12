// Unit tests for site/yanabee/js/yb-api.js (window.YB) with a mocked fetch / localStorage / document /
// fake timers. The classic script is evaluated inside a vm sandbox, exactly as a browser would load it.
// Run: node tools/yanabee/test-yb-api.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const API_SRC = fs.readFileSync(path.join(root, 'site/yanabee/js/yb-api.js'), 'utf8');
const CFG_SRC = fs.readFileSync(path.join(root, 'site/yanabee/js/yb-config.js'), 'utf8');

let passed = 0;
const failed = [];
function ok(c, label) { if (c) passed++; else { failed.push(label); console.log('  FAIL  ' + label); } }
function eq(a, b, label) { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, `${label}  (got ${x}, expected ${y})`); }
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
const ARABIC = /[؀-ۿ]/;

const URL_BASE = 'https://proj.supabase.co';
const ANON = 'anon-key-for-tests';

function makeEnv({ config = { url: URL_BASE, anonKey: ANON }, stored, storageThrows = false, location, abort = false, pre } = {}) {
  const clock = { t: 1_800_000_000_000, id: 0, timers: new Map() };
  const setT = (fn, ms) => { const id = ++clock.id; clock.timers.set(id, { fn, at: clock.t + (ms || 0) }); return id; };
  const clearT = (id) => { clock.timers.delete(id); };
  const advance = async (ms) => {
    const end = clock.t + ms;
    for (;;) {
      await flush();
      let next = null;
      for (const [id, tm] of clock.timers) if (tm.at <= end && (!next || tm.at < next.tm.at)) next = { id, tm };
      if (!next) break;
      clock.t = Math.max(clock.t, next.tm.at);
      clock.timers.delete(next.id);
      next.tm.fn();
    }
    clock.t = end;
    await flush();
  };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.t); }
    static now() { return clock.t; }
  }

  const store = new Map();
  if (stored !== undefined) store.set('yanabee-session-v1', typeof stored === 'string' ? stored : JSON.stringify(stored));
  const storageOps = [];
  const localStorage = {
    getItem(k) { storageOps.push(['get', k]); if (storageThrows) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { storageOps.push(['set', k]); if (storageThrows) throw new Error('blocked'); store.set(k, String(v)); },
    removeItem(k) { storageOps.push(['remove', k]); if (storageThrows) throw new Error('blocked'); store.delete(k); }
  };

  const docListeners = [];
  const document = {
    hidden: false, visibilityState: 'visible',
    addEventListener(t, fn) { if (t === 'visibilitychange') docListeners.push(fn); },
    removeEventListener(t, fn) { const i = docListeners.indexOf(fn); if (i >= 0) docListeners.splice(i, 1); }
  };
  const setHidden = (h) => { document.hidden = h; document.visibilityState = h ? 'hidden' : 'visible'; docListeners.slice().forEach((f) => f()); };

  const calls = [];
  const handlers = [];
  const fetch = (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body === undefined ? undefined : JSON.parse(init.body), signal: init.signal };
    calls.push(call);
    for (let i = handlers.length - 1; i >= 0; i--) {
      const h = handlers[i];
      if (h.method && h.method !== call.method) continue;
      if (!(h.match instanceof RegExp ? h.match.test(call.url) : call.url.includes(h.match))) continue;
      if (h.times !== undefined && h.used >= h.times) continue;
      h.used++;
      const resp = typeof h.resp === 'function' ? h.resp(call) : h.resp;
      if (resp && resp.hang) return new Promise((_, rej) => { if (call.signal) call.signal.addEventListener?.('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
      if (resp && resp.throws) return Promise.reject(resp.throws);
      const status = resp.status ?? 200;
      const text = resp.body === undefined ? '' : (typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body));
      return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(text) });
    }
    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('{"message":"no mock"}') });
  };
  const on = (method, match, resp, times) => { handlers.push({ method, match, resp, times, used: 0 }); };

  const consoleCalls = [];
  const con = { log: (...a) => consoleCalls.push(a), warn: (...a) => consoleCalls.push(a), error: (...a) => consoleCalls.push(a), info: (...a) => consoleCalls.push(a), debug: (...a) => consoleCalls.push(a) };

  const winListeners = [];
  const replaced = [];
  const sandbox = {
    fetch, localStorage, document, console: con, Date: FakeDate, setTimeout: setT, clearTimeout: clearT,
    atob: globalThis.atob,
    addEventListener: (t, fn) => winListeners.push([t, fn]),
    history: { replaceState: (...a) => replaced.push(a) }
  };
  if (location) sandbox.location = location;
  if (abort) {
    sandbox.AbortController = class { constructor() { const ls = []; this.signal = { aborted: false, addEventListener: (t, f) => ls.push(f) }; this._ls = ls; } abort() { this.signal.aborted = true; this._ls.forEach((f) => f()); } };
  }
  sandbox.window = sandbox;
  if (pre) pre({ on, nowSec: () => Math.floor(clock.t / 1000), clock });   // register mocks BEFORE the script runs (start-up requests)
  vm.createContext(sandbox);
  vm.runInContext(CFG_SRC, sandbox, { filename: 'yb-config.js' });
  sandbox.YB_CONFIG = config;          // tests choose their own config
  vm.runInContext(API_SRC, sandbox, { filename: 'yb-api.js' });

  return {
    YB: sandbox.YB, calls, on, store, storageOps, clock, advance, setHidden, docListeners, consoleCalls, replaced,
    storage: () => { const v = store.get('yanabee-session-v1'); return v === undefined ? null : JSON.parse(v); },
    fire: (type, ev) => winListeners.filter((l) => l[0] === type).forEach((l) => l[1](ev)),
    nowSec: () => Math.floor(clock.t / 1000)
  };
}

const sessionBody = (env, access = 'acc1', refresh = 'ref1', expiresIn = 3600, id = 'user-1', email = 'a@b.test') =>
  ({ access_token: access, token_type: 'bearer', expires_in: expiresIn, expires_at: env.nowSec() + expiresIn, refresh_token: refresh, user: { id, email } });
const storedSession = (env, over = {}) => ({ access_token: 'acc0', refresh_token: 'ref0', expires_at: env.nowSec() + 3600, user: { id: 'user-1', email: 'a@b.test' }, ...over });
const PROFILE = { id: 'user-1', email: 'a@b.test', full_name: 'اسم', role: 'leader', phone: null };

const section = (t) => console.log('\n== ' + t);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const pathOf = (u) => u.replace(URL_BASE, '');

/* ===================================================================== */
test('static: config file and source hygiene', async () => {
  ok(CFG_SRC.includes("window.YB_CONFIG = { url: '', anonKey: '' };"), 'yb-config.js ships the empty config exactly');
  ok((CFG_SRC.match(/service_role/g) || []).length === 1 && /NEVER put the service_role key/.test(CFG_SRC), 'yb-config.js mentions service_role only in the warning');
  ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(CFG_SRC + API_SRC), 'no JWT-looking secret in the shipped files');
  ok(!/\bconsole\./.test(API_SRC), 'yb-api.js never uses console (tokens cannot be logged)');
  ok((API_SRC.match(/service_role/g) || []).length === 1 && /o\.role === 'service_role'/.test(API_SRC), 'yb-api.js mentions service_role only in the guard that refuses such a key');
  ok(!/^\s*(import|export)\s|require\(/m.test(API_SRC), 'classic script: no modules');
  ok(/^\(function \(\) \{/m.test(API_SRC) && /window\.YB = YB;/.test(API_SRC), 'IIFE exposing window.YB');
  ok(!/['"`]https?:\/\//.test(API_SRC), 'no hard-coded URL string literal (only YB_CONFIG.url is contacted)');
  ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/.test(API_SRC), 'fetch is the only network primitive');
});

test('unconfigured mode: no fetch, safe answers', async () => {
  for (const [label, config] of [['empty', { url: '', anonKey: '' }], ['missing', null], ['url only', { url: URL_BASE, anonKey: '' }], ['key only', { url: '', anonKey: ANON }], ['no protocol', { url: 'proj.supabase.co', anonKey: ANON }]]) {
    const env = makeEnv({ config });
    const { YB } = env;
    eq(YB.configured, false, `${label}: configured is false`);
    eq(YB.session(), null, `${label}: session() is null`);
    const nc = { ok: false, error: 'not_configured' };
    eq(await YB.signUp({ email: 'a@b.co', password: '12345678', fullName: 'x', role: 'leader' }), nc, `${label}: signUp`);
    eq(await YB.signIn('a@b.co', '12345678'), nc, `${label}: signIn`);
    eq(await YB.resetPassword('a@b.co'), nc, `${label}: resetPassword`);
    eq(await YB.updatePassword('12345678'), nc, `${label}: updatePassword`);
    eq(await YB.loadProfile(), null, `${label}: loadProfile`);
    eq(await YB.q('teams', {}), null, `${label}: q`);
    eq(await YB.insert('teams', { name: 'x' }), nc, `${label}: insert`);
    eq(await YB.update('teams', { id: 'eq.1' }, { name: 'x' }), nc, `${label}: update`);
    eq(await YB.remove('teams', { id: 'eq.1' }), nc, `${label}: remove`);
    eq(await YB.rpc('my_team', {}), nc, `${label}: rpc`);
    eq(await YB.getState(), null, `${label}: getState`);
    eq(await YB.publishState({ v: 1 }, null), { ok: false, conflict: false, error: 'not_configured' }, `${label}: publishState`);
    eq((await YB.signOut()).ok, true, `${label}: signOut is a harmless local no-op`);
    eq(env.calls.length, 0, `${label}: zero fetch calls`);
    ok(ARABIC.test(YB.errorText('not_configured')), `${label}: not_configured has an Arabic text`);
  }
  // a stored session is ignored when not configured
  const env = makeEnv({ config: { url: '', anonKey: '' }, stored: { access_token: 'a', refresh_token: 'r', expires_at: 9999999999, user: { id: 'u' } } });
  eq(env.YB.session(), null, 'stored session ignored when unconfigured');
  // poll still works locally
  let n = 0;
  const stop = env.YB.poll(() => { n++; }, 15000);
  await env.advance(1);
  ok(n === 1, 'poll runs the local function in unconfigured mode');
  stop();
});

test('configuration: url normalisation and headers', async () => {
  const env = makeEnv({ config: { url: URL_BASE + '///', anonKey: ANON } });
  eq(env.YB.configured, true, 'configured with url + key');
  env.on('GET', '/rest/v1/public_teams', { body: [] });
  await env.YB.q('public_teams', {});
  const c = env.calls[0];
  ok(c.url.startsWith(URL_BASE + '/rest/v1/public_teams?'), 'trailing slashes of the url are stripped: ' + c.url);
  eq(c.headers.apikey, ANON, 'apikey header is the anon key');
  eq(c.headers.Authorization, 'Bearer ' + ANON, 'anonymous requests use Bearer anonKey');
  eq(c.headers.Accept, 'application/json', 'Accept json by default');
  ok(!('Content-Type' in c.headers), 'no Content-Type on GET');
  ok(env.calls.every((x) => x.url.startsWith(URL_BASE + '/')), 'only the configured host is contacted');
});

test('keys: a secret key is refused, publishable keys work', async () => {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const serviceJwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ role: 'service_role', iss: 'supabase' })}.sig`;
  const anonJwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ role: 'anon', iss: 'supabase' })}.sig`;
  for (const [label, key] of [['service_role JWT', serviceJwt], ['sb_secret key', 'sb_secret_abc123']]) {
    const e = makeEnv({ config: { url: URL_BASE, anonKey: key } });
    eq([e.YB.configured, e.YB.configProblem], [false, 'service_key'], `${label} in YB_CONFIG is refused (configured false)`);
    await e.YB.q('teams', {}); await e.YB.rpc('my_team', {}); await e.YB.signIn('a@b.co', 'x');
    eq(e.calls.length, 0, `${label}: nothing is ever sent with it`);
  }
  const good = makeEnv({ config: { url: URL_BASE, anonKey: anonJwt } });
  eq([good.YB.configured, good.YB.configProblem], [true, null], 'a real anon JWT is accepted');
  good.on('GET', '/rest/v1/public_teams', { body: [] });
  await good.YB.q('public_teams', {});
  eq([good.calls[0].headers.apikey, good.calls[0].headers.Authorization], [anonJwt, 'Bearer ' + anonJwt], 'anon JWT: apikey + Bearer');
  const pub = makeEnv({ config: { url: URL_BASE, anonKey: 'sb_publishable_xyz' } });
  pub.on('GET', '/rest/v1/public_teams', { body: [] });
  await pub.YB.q('public_teams', {});
  eq([pub.YB.configured, pub.calls[0].headers.apikey, 'Authorization' in pub.calls[0].headers], [true, 'sb_publishable_xyz', false], 'publishable key: sent as apikey only (it is not a JWT)');
  const probe = makeEnv();
  const withSession = makeEnv({ config: { url: URL_BASE, anonKey: 'sb_publishable_xyz' }, stored: storedSession(probe) });
  withSession.on('GET', '/rest/v1/teams', { body: [] });
  await withSession.YB.q('teams', {});
  eq(withSession.calls[0].headers.Authorization, 'Bearer acc0', 'publishable key + signed-in user: Bearer is the user token');
});

test('sign-up', async () => {
  const env = makeEnv({ location: { protocol: 'https:', origin: 'https://site.test', pathname: '/yanabee/account.html', search: '', hash: '' } });
  env.on('POST', '/auth/v1/signup', (c) => ({ status: 200, body: { id: 'user-9', email: c.body.email, identities: [] } }));
  const r = await env.YB.signUp({ email: ' New@Example.com ', password: 'abcdefgh', fullName: '  قائد  ', role: 'leader' });
  eq(r, { ok: true, needsConfirm: true }, 'sign-up with e-mail confirmation: ok + needsConfirm');
  const c = env.calls[0];
  eq(c.body, { email: 'New@Example.com', password: 'abcdefgh', data: { full_name: 'قائد', role: 'leader', app: 'yanabee' } }, 'sends data:{full_name, role, app} metadata (app tag: the auth project is shared)');
  ok(c.url.includes('/auth/v1/signup?redirect_to=' + encodeURIComponent('https://site.test/yanabee/account.html')), 'redirect_to = current page');
  eq(env.storage(), null, 'no session stored when confirmation is pending');
  await env.YB.signUp({ email: 'a@b.co', password: 'abcdefgh', fullName: 'x', role: 'admin' });
  eq(env.calls[1].body.data.role, 'member', 'client never sends role=admin (whitelist, convenience only)');
  await env.YB.signUp({ email: 'a@b.co', password: 'abcdefgh', fullName: 'x' });
  eq(env.calls[2].body.data.role, 'member', 'missing role -> member');
  await env.YB.signUp({ email: 'a@b.co', password: 'abcdefgh', fullName: 'x', role: 'parent' });
  eq(env.calls[3].body.data.role, 'parent', 'parent accepted');
  const before = env.calls.length;
  eq((await env.YB.signUp({ email: 'not-an-email', password: 'abcdefgh' })).error, 'invalid_email', 'bad e-mail rejected locally');
  eq((await env.YB.signUp({ email: 'a@b.co', password: '1234567' })).error, 'weak_password', 'short password rejected locally');
  eq(env.calls.length, before, 'local validation makes no request');
  // errors
  const e2 = makeEnv();
  e2.on('POST', '/auth/v1/signup', { status: 422, body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' } });
  const r2 = await e2.YB.signUp({ email: 'a@b.co', password: 'abcdefgh', role: 'member' });
  eq([r2.ok, r2.error], [false, 'user_already_exists'], 'duplicate e-mail -> user_already_exists');
  ok(ARABIC.test(e2.YB.errorText(r2)), 'and has an Arabic message');
  // auto-confirm projects return a session
  const e3 = makeEnv();
  e3.on('POST', '/auth/v1/signup', () => ({ body: sessionBody(e3) }));
  e3.on('GET', '/rest/v1/profiles', { body: PROFILE });
  const r3 = await e3.YB.signUp({ email: 'a@b.co', password: 'abcdefgh', role: 'leader' });
  eq(r3, { ok: true, needsConfirm: false }, 'auto-confirm: session returned, needsConfirm false');
  eq(e3.YB.session().profile.role, 'leader', 'profile loaded after auto-confirm sign-up');
  ok(!!e3.storage(), 'session persisted');
});

test('sign-in, session persistence, onAuth', async () => {
  const env = makeEnv();
  const events = [];
  const off = env.YB.onAuth((s, ev) => events.push([s && s.user.id, ev]));
  env.on('POST', 'grant_type=password', (c) => c.body.password === 'goodpass1' ? { body: sessionBody(env) } : { status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
  env.on('GET', '/rest/v1/profiles', { body: PROFILE });
  const bad = await env.YB.signIn('a@b.test', 'nope');
  eq([bad.ok, bad.error], [false, 'invalid_credentials'], 'wrong password -> invalid_credentials');
  eq(env.YB.session(), null, 'no session after a failed sign-in');
  const good = await env.YB.signIn(' a@b.test ', 'goodpass1');
  eq(good, { ok: true }, 'sign-in ok');
  eq(env.calls[1].body, { email: 'a@b.test', password: 'goodpass1' }, 'password grant body (e-mail trimmed)');
  const st = env.storage();
  eq(Object.keys(st).sort(), ['access_token', 'expires_at', 'refresh_token', 'user'], 'stored object has exactly the 4 contract fields');
  eq([st.access_token, st.refresh_token, st.user], ['acc1', 'ref1', { id: 'user-1', email: 'a@b.test', meta: { full_name: '', role: 'member' } }], 'stored values (meta = name + role only)');
  eq(typeof st.expires_at, 'number', 'expires_at is a number (seconds)');
  const s = env.YB.session();
  eq([s.user.id, s.user.email, s.profile.role, s.profile.full_name], ['user-1', 'a@b.test', 'leader', 'اسم'], 'session() returns user + cached profile');
  eq(events, [['user-1', 'SIGNED_IN']], 'onAuth called once with the session after the profile loaded');
  const prof = env.calls.find((c) => c.url.includes('/rest/v1/profiles'));
  eq(prof.headers.Authorization, 'Bearer acc1', 'profile request uses the user token');
  eq(prof.headers.Accept, 'application/vnd.pgrst.object+json', 'profile requested as a single object');
  ok(prof.url.includes('id=eq.user-1'), 'profile filtered by own id');
  off();
  await env.YB.signOut();
  eq(events.length, 1, 'unsubscribed listener is not called again');
  // legacy and other GoTrue error shapes
  const e2 = makeEnv();
  e2.on('POST', 'grant_type=password', { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
  eq((await e2.YB.signIn('a@b.co', 'x')).error, 'invalid_credentials', 'legacy invalid_grant shape');
  const e3 = makeEnv();
  e3.on('POST', 'grant_type=password', { status: 400, body: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' } });
  eq((await e3.YB.signIn('a@b.co', 'x')).error, 'email_not_confirmed', 'email_not_confirmed');
  const e4 = makeEnv();
  e4.on('POST', 'grant_type=password', { status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' } });
  eq((await e4.YB.signIn('a@b.co', 'x')).error, 'over_request_rate_limit', 'rate limit');
  const e5 = makeEnv();
  e5.on('POST', 'grant_type=password', { throws: new TypeError('Failed to fetch') });
  eq((await e5.YB.signIn('a@b.co', 'x')).error, 'network', 'offline -> network');
  const e6 = makeEnv();
  e6.on('POST', 'grant_type=password', { status: 502, body: '<html>Bad gateway</html>' });
  eq((await e6.YB.signIn('a@b.co', 'x')).error, 'server_error', 'non-JSON 5xx body -> server_error');
  // profile load failure does not fail the sign-in
  const e7 = makeEnv();
  e7.on('POST', 'grant_type=password', () => ({ body: sessionBody(e7) }));
  e7.on('GET', '/rest/v1/profiles', { status: 500, body: {} });
  const r7 = await e7.YB.signIn('a@b.co', 'goodpass1');
  eq([r7.ok, e7.YB.session().profile], [true, null], 'sign-in survives a failing profile request');
});

test('restoring and distrusting stored sessions', async () => {
  const probe = makeEnv();
  const good = storedSession(probe);
  const env = makeEnv({ stored: good });
  eq(env.YB.session().user, { id: 'user-1', email: 'a@b.test' }, 'valid stored session is restored');
  eq(env.YB.session().profile, null, 'profile is not cached across page loads');
  for (const [label, bad] of [
    ['not json', 'not json {'], ['empty object', '{}'], ['array', '[]'], ['number', '42'], ['null', 'null'], ['string', '"abc"'],
    ['no refresh_token', { access_token: 'a', expires_at: 99999999999, user: { id: 'u' } }],
    ['expires_at as string', { access_token: 'a', refresh_token: 'r', expires_at: 'soon', user: { id: 'u' } }],
    ['no user id', { access_token: 'a', refresh_token: 'r', expires_at: 99999999999, user: {} }],
    ['empty tokens', { access_token: '', refresh_token: '', expires_at: 99999999999, user: { id: 'u' } }],
    ['user is a string', { access_token: 'a', refresh_token: 'r', expires_at: 99999999999, user: 'u' }]
  ]) {
    const e = makeEnv({ stored: bad });
    eq(e.YB.session(), null, `malformed storage ignored: ${label}`);
    eq(e.calls.length, 0, `malformed storage causes no request: ${label}`);
  }
  const blocked = makeEnv({ storageThrows: true });
  eq(blocked.YB.session(), null, 'blocked localStorage does not throw at load');
  blocked.on('POST', 'grant_type=password', () => ({ body: sessionBody(blocked) }));
  blocked.on('GET', '/rest/v1/profiles', { body: PROFILE });
  eq((await blocked.YB.signIn('a@b.co', 'goodpass1')).ok, true, 'sign-in works with blocked storage (memory only)');
  ok(!!blocked.YB.session(), 'session kept in memory when storage is blocked');
  eq((await blocked.YB.signOut()).ok, true, 'sign-out works with blocked storage');
});

test('token refresh: before expiry, race, 401 retry, failures', async () => {
  // 1. refresh before expiry
  const probe = makeEnv();
  const nearExpiry = storedSession(probe, { expires_at: probe.nowSec() + 20 });
  let env = makeEnv({ stored: nearExpiry });
  env.on('POST', 'grant_type=refresh_token', () => ({ body: sessionBody(env, 'acc-new', 'ref-new') }));
  env.on('GET', '/rest/v1/teams', { body: [{ id: 't1' }] });
  const rows = await env.YB.q('teams', {});
  eq(rows, [{ id: 't1' }], 'q works');
  eq(env.calls.map((c) => pathOf(c.url).split('?')[0] + '?' + (c.url.match(/grant_type=\w+/) || [''])[0]).slice(0, 2), ['/auth/v1/token?grant_type=refresh_token', '/rest/v1/teams?'], 'a token that expires within 60 s is refreshed BEFORE the request');
  eq(env.calls[0].body, { refresh_token: 'ref0' }, 'refresh sends the refresh_token');
  eq(env.calls[1].headers.Authorization, 'Bearer acc-new', 'the request uses the new access token');
  eq([env.storage().access_token, env.storage().refresh_token], ['acc-new', 'ref-new'], 'new tokens persisted');
  eq(env.YB.session().user.id, 'user-1', 'user kept across refresh');
  const far = makeEnv({ stored: storedSession(probe, { expires_at: probe.nowSec() + 600 }) });
  far.on('GET', '/rest/v1/teams', { body: [] });
  await far.YB.q('teams', {});
  eq(far.calls.length, 1, 'a token with plenty of life is not refreshed');

  // 2. race: two parallel calls, one refresh
  const p2 = makeEnv();
  const env2 = makeEnv({ stored: storedSession(p2, { expires_at: p2.nowSec() - 5 }) });
  let refreshCount = 0;
  env2.on('POST', 'grant_type=refresh_token', () => { refreshCount++; return { body: sessionBody(env2, 'acc-race', 'ref-race') }; });
  env2.on('GET', '/rest/v1/', { body: [] });
  env2.on('POST', '/rest/v1/rpc/', { body: {} });
  const [a, b, c3] = await Promise.all([env2.YB.q('teams', {}), env2.YB.q('team_members', {}), env2.YB.rpc('my_team', {})]);
  eq(refreshCount, 1, 'three parallel calls with an expired token refresh exactly once');
  eq(env2.calls.filter((c) => !c.url.includes('/auth/')).every((c) => c.headers.Authorization === 'Bearer acc-race'), true, 'all three requests used the refreshed token');
  eq([a, b, c3.ok], [[], [], true], 'all three succeeded');

  // 3. 401 -> refresh once -> retry once
  const p3 = makeEnv();
  const env3 = makeEnv({ stored: storedSession(p3) });
  env3.on('POST', 'grant_type=refresh_token', () => ({ body: sessionBody(env3, 'acc-401', 'ref-401') }));
  env3.on('GET', '/rest/v1/teams', (c) => c.headers.Authorization === 'Bearer acc-401' ? { body: [{ id: 'x' }] } : { status: 401, body: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null } });
  eq(await env3.YB.q('teams', {}), [{ id: 'x' }], '401 triggers one refresh and a successful retry');
  eq(env3.calls.length, 3, 'exactly GET, refresh, GET');
  // 3b. 401 persists after refresh -> no loop
  const env3b = makeEnv({ stored: storedSession(p3) });
  env3b.on('POST', 'grant_type=refresh_token', () => ({ body: sessionBody(env3b, 'acc-b', 'ref-b') }));
  env3b.on('GET', '/rest/v1/teams', { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } });
  let err = null;
  try { await env3b.YB.q('teams', {}); } catch (e) { err = e; }
  eq([err && err.error, env3b.calls.length], ['jwt_expired', 3], 'a second 401 is returned as an error (no refresh loop)');
  // 3c. two parallel 401s share one refresh
  const env3c = makeEnv({ stored: storedSession(p3) });
  let rc = 0;
  env3c.on('POST', 'grant_type=refresh_token', () => { rc++; return { body: sessionBody(env3c, 'acc-c', 'ref-c') }; });
  env3c.on('GET', '/rest/v1/', (c) => c.headers.Authorization === 'Bearer acc-c' ? { body: [] } : { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } });
  await Promise.all([env3c.YB.q('teams', {}), env3c.YB.q('profiles', {})]);
  eq(rc, 1, 'two parallel 401s refresh once');
  // 3d. anonymous 401/403 never tries to refresh
  const anon = makeEnv();
  anon.on('GET', '/rest/v1/teams', { status: 401, body: { code: '42501', message: 'permission denied for table teams' } });
  err = null; try { await anon.YB.q('teams', {}); } catch (e) { err = e; }
  eq([err.error, anon.calls.length], ['permission_denied', 1], 'anonymous 401 is an error, no refresh attempted');

  // 4. refresh refused -> signed out
  const env4 = makeEnv({ stored: storedSession(p3, { expires_at: p3.nowSec() - 10 }) });
  const ev = [];
  env4.YB.onAuth((s, e) => ev.push([s, e]));
  env4.on('POST', 'grant_type=refresh_token', { status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } });
  env4.on('GET', '/rest/v1/teams', { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } });
  err = null; try { await env4.YB.q('teams', {}); } catch (e) { err = e; }
  eq(env4.YB.session(), null, 'a refused refresh token signs the user out');
  eq(env4.storage(), null, 'and clears storage');
  eq(ev, [[null, 'SIGNED_OUT']], 'onAuth(null) fired');
  // 5. refresh network failure keeps the session
  const env5 = makeEnv({ stored: storedSession(p3, { expires_at: p3.nowSec() - 10 }) });
  env5.on('POST', 'grant_type=refresh_token', { throws: new TypeError('Failed to fetch') });
  env5.on('GET', '/rest/v1/teams', { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } });
  err = null; try { await env5.YB.q('teams', {}); } catch (e) { err = e; }
  ok(!!env5.YB.session() && !!env5.storage(), 'a network failure during refresh keeps the session');
  // 6. 5xx during refresh keeps the session too
  const env6 = makeEnv({ stored: storedSession(p3, { expires_at: p3.nowSec() - 10 }) });
  env6.on('POST', 'grant_type=refresh_token', { status: 503, body: {} });
  env6.on('GET', '/rest/v1/teams', { body: [] });
  await env6.YB.q('teams', {});
  ok(!!env6.YB.session(), 'a 503 during refresh keeps the session');
});

test('sign-out', async () => {
  const p = makeEnv();
  const env = makeEnv({ stored: storedSession(p) });
  const ev = [];
  env.YB.onAuth((s, e) => ev.push([s, e]));
  env.on('POST', '/auth/v1/logout', { status: 204 });
  const r = await env.YB.signOut();
  eq(r, { ok: true }, 'signOut ok');
  eq(env.calls.length, 1, 'one logout request');
  eq([env.calls[0].method, env.calls[0].headers.Authorization, env.calls[0].url.includes('/auth/v1/logout?scope=local')], ['POST', 'Bearer acc0', true], 'logout is local-scope with the user token');
  eq([env.storage(), env.YB.session()], [null, null], 'storage and memory cleared');
  eq(ev, [[null, 'SIGNED_OUT']], 'onAuth(null)');
  // logout request fails: still signed out locally
  const env2 = makeEnv({ stored: storedSession(p) });
  env2.on('POST', '/auth/v1/logout', { throws: new TypeError('Failed to fetch') });
  await env2.YB.signOut();
  eq([env2.storage(), env2.YB.session()], [null, null], 'signed out locally even if the server call fails');
  // not signed in: no request
  const env3 = makeEnv();
  await env3.YB.signOut();
  eq(env3.calls.length, 0, 'signOut without a session makes no request');
  // a later request is anonymous again
  env.on('GET', '/rest/v1/public_teams', { body: [] });
  await env.YB.q('public_teams', {});
  eq(env.calls[1].headers.Authorization, 'Bearer ' + ANON, 'after sign-out requests use the anon key again');
});

test('password reset and update', async () => {
  const env = makeEnv({ location: { protocol: 'https:', origin: 'https://site.test', pathname: '/yanabee/account.html', search: '', hash: '' } });
  env.on('POST', '/auth/v1/recover', { body: {} });
  eq(await env.YB.resetPassword(' a@b.co '), { ok: true }, 'resetPassword ok');
  eq(env.calls[0].body, { email: 'a@b.co' }, 'recover body');
  ok(env.calls[0].url.includes('redirect_to=' + encodeURIComponent('https://site.test/yanabee/account.html')), 'recover redirects back to the account page');
  eq((await env.YB.resetPassword('nope')).error, 'invalid_email', 'bad e-mail rejected locally');
  eq((await env.YB.updatePassword('12345678')).error, 'not_authenticated', 'updatePassword needs a session');
  eq(env.calls.length, 1, 'no extra requests');
  const p = makeEnv();
  const e2 = makeEnv({ stored: storedSession(p) });
  e2.on('PUT', '/auth/v1/user', { body: { id: 'user-1' } });
  eq((await e2.YB.updatePassword('short')).error, 'weak_password', 'short new password rejected locally');
  eq(await e2.YB.updatePassword('longenough1'), { ok: true }, 'updatePassword ok');
  eq([e2.calls[0].method, e2.calls[0].url, e2.calls[0].body, e2.calls[0].headers.Authorization], ['PUT', URL_BASE + '/auth/v1/user', { password: 'longenough1' }, 'Bearer acc0'], 'PUT /auth/v1/user with the user token');
  const e3 = makeEnv({ stored: storedSession(p) });
  e3.on('PUT', '/auth/v1/user', { status: 422, body: { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' } });
  eq((await e3.YB.updatePassword('longenough1')).error, 'same_password', 'same_password error key');
});

test('e-mail link in the URL hash', async () => {
  const hashLoc = (hash) => ({ protocol: 'https:', origin: 'https://site.test', pathname: '/yanabee/account.html', search: '?x=1', hash });
  const env = makeEnv({
    location: hashLoc('#access_token=AT1&refresh_token=RT1&expires_in=3600&token_type=bearer&type=recovery'),
    pre: ({ on }) => {
      on('GET', '/auth/v1/user', { body: { id: 'user-7', email: 'r@e.co' } });
      on('GET', '/rest/v1/profiles', { body: PROFILE });
    }
  });
  eq(env.YB.linkType, 'recovery', 'recovery link detected (linkType)');
  eq(env.replaced.length, 1, 'tokens are removed from the address bar immediately');
  eq(env.replaced[0][2], '/yanabee/account.html?x=1', 'replaceState keeps path and query, drops the hash');
  await env.YB.ready;
  eq([env.calls[0].method, pathOf(env.calls[0].url), env.calls[0].headers.Authorization], ['GET', '/auth/v1/user', 'Bearer AT1'], 'the link token is verified against /auth/v1/user');
  eq(env.YB.session().user, { id: 'user-7', email: 'r@e.co' }, 'session created from the verified link');
  eq([env.storage().access_token, env.storage().refresh_token], ['AT1', 'RT1'], 'tokens from the link persisted');
  eq(env.YB.session().profile.role, 'leader', 'profile loaded');
  eq(env.YB.linkError, null, 'no link error');
  // an unverifiable token creates no session
  const bad1 = makeEnv({ location: hashLoc('#access_token=AT1&refresh_token=RT1&expires_in=3600&type=signup'), pre: ({ on }) => on('GET', '/auth/v1/user', { status: 401, body: { msg: 'invalid JWT' } }) });
  await bad1.YB.ready;
  eq([bad1.YB.session(), bad1.YB.linkError, bad1.storage()], [null, 'invalid_link', null], 'a refused link token creates no session');
  const bad = makeEnv({ location: hashLoc('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired') });
  eq(bad.YB.linkError, 'otp_expired', 'expired link -> linkError otp_expired');
  ok(ARABIC.test(bad.YB.errorText(bad.YB.linkError)), 'and has an Arabic message');
  eq(bad.replaced.length, 1, 'error hash is cleaned too');
  eq(bad.calls.length, 0, 'an error link makes no request');
  const plain = makeEnv({ location: hashLoc('#section-2') });
  eq([plain.YB.linkType, plain.YB.linkError, plain.replaced.length, plain.calls.length], [null, null, 0, 0], 'an ordinary #anchor is left alone');
  const unc = makeEnv({ config: { url: '', anonKey: '' }, location: hashLoc('#access_token=AT1&refresh_token=RT1&type=recovery') });
  eq([unc.YB.linkType, unc.calls.length], [null, 0], 'unconfigured mode ignores link tokens');
});

test('storage events keep tabs in sync', async () => {
  const p = makeEnv();
  const env = makeEnv({ stored: storedSession(p) });
  const ev = [];
  env.YB.onAuth((s, e) => ev.push([s && s.user.id, e]));
  env.store.delete('yanabee-session-v1');
  env.fire('storage', { key: 'yanabee-session-v1' });
  eq([env.YB.session(), ev], [null, [[null, 'SIGNED_OUT']]], 'signing out in another tab signs out here');
  env.store.set('yanabee-session-v1', JSON.stringify(storedSession(p, { user: { id: 'user-2', email: 'x@y.z' } })));
  env.fire('storage', { key: 'yanabee-session-v1' });
  eq(env.YB.session().user.id, 'user-2', 'signing in in another tab signs in here');
  env.fire('storage', { key: 'something-else' });
  eq(ev.length, 2, 'unrelated storage keys are ignored');
});

test('data helpers: URL building, headers, bodies', async () => {
  const p = makeEnv();
  const env = makeEnv({ stored: storedSession(p) });
  env.on('GET', '/rest/v1/', { body: [] });
  await env.YB.q('team_members', { select: 'id,full_name,teams(name)', filter: { team_id: 'eq.abc-1', consent_status: 'eq.pending' }, order: 'full_name.asc', limit: 10 });
  const u1 = env.calls[0].url;
  ok(u1.startsWith(URL_BASE + '/rest/v1/team_members?'), 'path is /rest/v1/<table>');
  ok(u1.includes('select=id%2Cfull_name%2Cteams(name)'), 'select encoded: ' + u1);
  ok(u1.includes('team_id=eq.abc-1') && u1.includes('consent_status=eq.pending'), 'filters appended');
  ok(u1.includes('order=full_name.asc') && u1.endsWith('limit=10'), 'order and limit');
  eq(env.calls[0].headers.Authorization, 'Bearer acc0', 'user token on data requests');
  await env.YB.q('teams', { select: '*', order: ['status.asc', 'created_at.desc'], limit: 5, offset: 10 });
  const u2 = env.calls[1].url;
  ok(u2.includes('order=status.asc%2Ccreated_at.desc') && u2.includes('limit=5') && u2.includes('offset=10'), 'order array + offset: ' + u2);
  await env.YB.q('teams', { filter: { name: 'eq.فريق & more=1#x', id: 'in.(a,b)', n: 5, ok: true } });
  const u3 = env.calls[2].url;
  ok(u3.includes('name=eq.' + encodeURIComponent('فريق & more=1#x')), 'values are percent-encoded (no parameter injection): ' + u3);
  ok(!u3.includes('&more=1') && !u3.includes('#'), 'a value cannot add a parameter or a fragment');
  ok(u3.includes('id=in.(a%2Cb)'), 'in.(a,b) encoded');
  ok(u3.includes('n=eq.5') && u3.includes('ok=eq.true'), 'numbers/booleans become eq.');
  await env.YB.q('teams', { filter: { 'or': '(a.eq.1,b.eq.2)', 'data->>k': 'eq.v' } });
  ok(env.calls[3].url.includes('or=(a.eq.1%2Cb.eq.2)') && env.calls[3].url.includes(encodeURIComponent('data->>k') + '=eq.v'), 'or= and json-path keys allowed');
  let err = null;
  try { await env.YB.q('teams;drop', {}); } catch (e) { err = e; }
  eq([err && err.error, env.calls.length], ['bad_request', 4], 'invalid table name rejected without a request');
  err = null; try { await env.YB.q('teams', { filter: { 'a=b&c': 'eq.1' } }); } catch (e) { err = e; }
  eq([err && err.error, env.calls.length], ['bad_request', 4], 'invalid filter key rejected without a request');
  err = null; try { await env.YB.q('../auth/users', {}); } catch (e) { err = e; }
  eq(err && err.error, 'bad_request', 'path traversal in table name rejected');

  // single
  env.on('GET', '/rest/v1/profiles', { body: PROFILE });
  const one = await env.YB.q('profiles', { filter: { id: 'eq.user-1' }, single: true });
  eq(one.role, 'leader', 'single returns the row');
  eq(env.calls[env.calls.length - 1].headers.Accept, 'application/vnd.pgrst.object+json', 'single sets the PostgREST object Accept header');
  env.on('GET', '/rest/v1/teams', { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' } });
  eq(await env.YB.q('teams', { filter: { id: 'eq.zzz' }, single: true }), null, 'single with no row -> null');

  // insert
  env.on('POST', '/rest/v1/teams', { status: 201, body: '' });
  const ins = await env.YB.insert('teams', { name: 'فريق', area: 'حي' });
  eq(ins.ok, true, 'insert ok');
  const ic = env.calls[env.calls.length - 1];
  eq([ic.method, ic.headers.Prefer, ic.headers['Content-Type'], ic.body], ['POST', 'return=minimal', 'application/json', { name: 'فريق', area: 'حي' }], 'insert: minimal by default, JSON body');
  env.on('POST', '/rest/v1/team_members', { status: 201, body: [{ id: 'm1' }, { id: 'm2' }] });
  const ins2 = await env.YB.insert('team_members', [{ team_id: 't', full_name: 'a' }, { team_id: 't', full_name: 'b' }], { returning: true });
  eq([ins2.ok, ins2.data.length], [true, 2], 'insert many with returning');
  eq(env.calls[env.calls.length - 1].headers.Prefer, 'return=representation', 'returning:true -> return=representation');
  eq(env.calls[env.calls.length - 1].body.length, 2, 'array body');
  // update / remove
  env.on('PATCH', '/rest/v1/teams', { status: 204 });
  eq((await env.YB.update('teams', { id: 'eq.t1' }, { name: 'جديد' })).ok, true, 'update ok');
  const uc = env.calls[env.calls.length - 1];
  eq([uc.method, uc.url.endsWith('/rest/v1/teams?id=eq.t1'), uc.body, uc.headers.Prefer], ['PATCH', true, { name: 'جديد' }, 'return=minimal'], 'update: PATCH with filter in the query');
  const n0 = env.calls.length;
  eq((await env.YB.update('teams', {}, { name: 'x' })).error, 'filter_required', 'update without a filter refused');
  eq((await env.YB.update('teams', null, { name: 'x' })).error, 'filter_required', 'update with null filter refused');
  eq((await env.YB.remove('team_members', {})).error, 'filter_required', 'remove without a filter refused');
  eq((await env.YB.remove('team_members', undefined)).error, 'filter_required', 'remove with undefined filter refused');
  eq(env.calls.length, n0, 'refused calls make no request (no mass update / delete)');
  env.on('DELETE', '/rest/v1/team_members', { status: 204 });
  eq((await env.YB.remove('team_members', { id: 'eq.m1' })).ok, true, 'remove ok');
  eq([env.calls[env.calls.length - 1].method, env.calls[env.calls.length - 1].url.endsWith('/rest/v1/team_members?id=eq.m1')], ['DELETE', true], 'DELETE with filter');
  // PostgREST error from q is thrown
  env.on('GET', '/rest/v1/audit_log', { status: 403, body: { code: '42501', message: 'permission denied for table audit_log', details: null, hint: null } });
  err = null; try { await env.YB.q('audit_log', {}); } catch (e) { err = e; }
  eq([err.name, err.error, err.code, err.status, err.ok], ['YBError', 'permission_denied', '42501', 403, false], 'q throws a structured error');
  ok(ARABIC.test(env.YB.errorText(err)), 'errorText works on the thrown error');
  ok(env.calls.every((c) => c.url.startsWith(URL_BASE + '/')), 'every request went to the configured host');
});

test('rpc: arguments, results and error bodies', async () => {
  const p = makeEnv();
  const env = makeEnv({ stored: storedSession(p) });
  env.on('POST', '/rest/v1/rpc/join_team', (c) => c.body.code === 'GOOD22' ? { body: { ok: true, team_id: 't1' } } : { status: 400, body: { code: 'P0001', message: 'team_not_found', hint: null, details: null } });
  const ok1 = await env.YB.rpc('join_team', { code: 'GOOD22', member_name: 'اسم' });
  eq(ok1, { ok: true, data: { ok: true, team_id: 't1' }, status: 200 }, 'rpc success envelope');
  eq([env.calls[0].method, pathOf(env.calls[0].url), env.calls[0].body], ['POST', '/rest/v1/rpc/join_team', { code: 'GOOD22', member_name: 'اسم' }], 'rpc POSTs the named arguments');
  const bad = await env.YB.rpc('join_team', { code: 'BAD', member_name: 'x' });
  eq([bad.ok, bad.error, bad.code, bad.status], [false, 'team_not_found', 'P0001', 400], 'function exception message becomes the error key');
  eq(env.YB.errorText(bad), env.YB.errorText('team_not_found'), 'errorText(result) == errorText(key)');
  env.on('POST', '/rest/v1/rpc/link_child', { status: 400, body: { code: 'P0001', message: 'already_linked', hint: 'x', details: 'y' } });
  const al = await env.YB.rpc('link_child', { code: 'A', child_name: 'b' });
  eq([al.error, al.hint, al.details], ['already_linked', 'x', 'y'], 'hint and details are kept');
  env.on('POST', '/rest/v1/rpc/approve_team', { status: 403, body: { code: '42501', message: 'permission_denied', hint: null, details: null } });
  eq((await env.YB.rpc('approve_team', { team_id: 'x', ok: true })).error, 'permission_denied', 'permission_denied key');
  env.on('POST', '/rest/v1/rpc/set_admin', { status: 403, body: { code: '42501', message: 'permission denied for function set_admin', details: null, hint: null } });
  eq((await env.YB.rpc('set_admin', { email: 'x' })).error, 'permission_denied', 'Postgres 42501 text -> permission_denied');
  env.on('POST', '/rest/v1/rpc/missing_fn', { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.missing_fn', hint: null, details: null } });
  eq((await env.YB.rpc('missing_fn', {})).error, 'not_found', 'unknown function -> not_found');
  env.on('POST', '/rest/v1/rpc/void_fn', { status: 204 });
  eq(await env.YB.rpc('void_fn'), { ok: true, data: null, status: 204 }, 'void function: ok with data null; args default to {}');
  eq(env.calls[env.calls.length - 1].body, {}, 'missing args become {}');
  const n = env.calls.length;
  eq((await env.YB.rpc('bad name;', {})).error, 'bad_request', 'invalid function name refused');
  eq(env.calls.length, n, 'no request for an invalid function name');
  env.on('POST', '/rest/v1/rpc/my_team', { body: [{ team_id: 't', my_role: 'leader' }] });
  eq((await env.YB.rpc('my_team')).data[0].my_role, 'leader', 'table-returning function gives an array');
});

test('shared auth project: app tag, missing profile, {ok:false} answers', async () => {
  const env = makeEnv();
  const body = sessionBody(env);
  body.user = Object.assign({}, body.user, { user_metadata: { full_name: 'قائد جديد', role: 'leader', other: 'x' } });
  env.on('POST', 'grant_type=password', { body });
  let made = false;
  env.on('GET', '/rest/v1/profiles', () => made ? { body: PROFILE } : { status: 406, body: { code: 'PGRST116', message: 'no rows' } });
  env.on('POST', '/rest/v1/rpc/yb_ensure_profile', (c) => { made = true; return { body: { ok: true, created: true, role: c.body.role } }; });
  eq(await env.YB.signIn('a@b.test', 'goodpass1'), { ok: true }, 'sign-in ok for an account without a Yanabee profile');
  const ens = env.calls.find((c) => c.url.includes('/rpc/yb_ensure_profile'));
  ok(!!ens, 'a missing profile is created with yb_ensure_profile');
  eq(ens && ens.body, { full_name: 'قائد جديد', role: 'leader' }, 'it sends only the name and role from the sign-up metadata');
  eq(env.YB.session().profile.role, 'leader', 'the profile is loaded after it was created');
  eq(env.storage().user.meta, { full_name: 'قائد جديد', role: 'leader' }, 'the stored session keeps only name + role of the metadata');
  const e2 = makeEnv();
  const b2 = sessionBody(e2);
  b2.user = Object.assign({}, b2.user, { user_metadata: { role: 'admin' } });
  e2.on('POST', 'grant_type=password', { body: b2 });
  e2.on('GET', '/rest/v1/profiles', { status: 406, body: { code: 'PGRST116', message: 'no rows' } });
  e2.on('POST', '/rest/v1/rpc/yb_ensure_profile', { body: { ok: true } });
  await e2.YB.signIn('a@b.test', 'goodpass1');
  eq(e2.calls.find((c) => c.url.includes('/rpc/yb_ensure_profile')).body.role, 'member', 'a role outside leader/member/parent becomes member');
  const e3 = makeEnv();
  e3.on('POST', 'grant_type=password', { body: sessionBody(e3) });
  e3.on('GET', '/rest/v1/profiles', { body: PROFILE });
  await e3.YB.signIn('a@b.test', 'goodpass1');
  ok(!e3.calls.some((c) => c.url.includes('yb_ensure_profile')), 'an existing profile is never re-created');
  const p = makeEnv();
  const e4 = makeEnv({ stored: storedSession(p) });
  e4.on('POST', '/rest/v1/rpc/join_team', { body: { ok: false, error: 'too_many_attempts' } });
  const r = await e4.YB.rpc('join_team', { code: 'X', member_name: 'y' });
  eq([r.ok, r.error, r.status], [false, 'too_many_attempts', 200], 'a {ok:false, error} answer becomes a failure with that key');
  eq(e4.YB.errorText(r), e4.YB.errorText('too_many_attempts'), 'and has its Arabic text');
  ok(e4.YB.errorText('too_many_attempts') !== e4.YB.errorText('unknown'), 'too_many_attempts has its own text');
  e4.on('POST', '/rest/v1/rpc/odd', { body: { ok: false, error: 'Not A Key!' } });
  eq((await e4.YB.rpc('odd', {})).ok, true, 'a non-key error string is left as data');
  for (const k of ['note_required', 'invalid_status']) ok(e4.YB.errorText(k) !== e4.YB.errorText('unknown'), k + ' has its own text');
});

test('getState / publishState', async () => {
  const p = makeEnv();
  const env = makeEnv({ stored: storedSession(p) });
  env.on('GET', '/rest/v1/tournament_state', { body: [{ state: { v: 1 }, updated_at: '2026-11-09T10:00:00.123456+00:00' }] });
  eq(await env.YB.getState(), { state: { v: 1 }, updated_at: '2026-11-09T10:00:00.123456+00:00' }, 'getState returns {state, updated_at}');
  eq(pathOf(env.calls[0].url), '/rest/v1/tournament_state?select=state%2Cupdated_at&id=eq.1&limit=1', 'getState query (limit=1)');
  ok(env.calls[0].headers.Accept !== 'application/vnd.pgrst.object+json', 'getState asks for an array, so an empty table is a 200, not a 406');
  const anon = makeEnv();
  anon.on('GET', '/rest/v1/tournament_state', { body: [{ state: {}, updated_at: 'x' }] });
  await anon.YB.getState();
  eq(anon.calls[0].headers.Authorization, 'Bearer ' + ANON, 'getState works anonymously (anon key)');
  const none = makeEnv();
  none.on('GET', '/rest/v1/tournament_state', { body: [] });
  eq(await none.YB.getState(), null, 'getState with no row -> null (empty array, no error)');

  env.on('POST', '/rest/v1/rpc/publish_state', { body: { ok: true, conflict: false, updated_at: '2026-11-09T10:01:00.654321+00:00' } });
  const r = await env.YB.publishState({ v: 1, teams: [] }, '2026-11-09T10:00:00.123456+00:00');
  eq(r, { ok: true, conflict: false, updated_at: '2026-11-09T10:01:00.654321+00:00' }, 'publishState success');
  eq(env.calls[1].body, { state: { v: 1, teams: [] }, prev: '2026-11-09T10:00:00.123456+00:00' }, 'sends state and prev; the microsecond string is passed through untouched');
  await env.YB.publishState({ v: 1 });
  eq(env.calls[2].body.prev, null, 'missing prev -> null');
  await env.YB.publishState({ v: 1 }, new Date('2026-01-01T00:00:00.000Z'));
  eq(env.calls[3].body.prev, '2026-01-01T00:00:00.000Z', 'Date prev -> ISO string');
  env.on('POST', '/rest/v1/rpc/publish_state', { body: { ok: false, conflict: true, updated_at: '2026-11-09T10:02:00+00:00' } });
  const c = await env.YB.publishState({ v: 1 }, 'old');
  eq([c.ok, c.conflict, c.updated_at, c.error], [false, true, '2026-11-09T10:02:00+00:00', 'conflict'], 'conflict result');
  ok(ARABIC.test(env.YB.errorText(c)), 'a conflict result has an Arabic message');
  env.on('POST', '/rest/v1/rpc/publish_state', { body: { ok: true, conflict: false, updated_at: 'z', stripped: true } });
  eq((await env.YB.publishState({ v: 1 }, 'z')).stripped, true, 'stripped flag passed through');
  env.on('POST', '/rest/v1/rpc/publish_state', { status: 403, body: { code: '42501', message: 'permission_denied', hint: null, details: null } });
  const d = await env.YB.publishState({ v: 1 }, 'z');
  eq([d.ok, d.conflict, d.error], [false, false, 'permission_denied'], 'non-admin: ok false, conflict false, permission_denied');
  env.on('POST', '/rest/v1/rpc/publish_state', { throws: new TypeError('Failed to fetch') });
  eq((await env.YB.publishState({ v: 1 }, 'z')).error, 'network', 'network failure');
});

test('timeout via AbortController', async () => {
  const env = makeEnv({ abort: true });
  env.on('GET', '/rest/v1/public_teams', { hang: true });
  let err = null;
  const pr = env.YB.q('public_teams', {}).catch((e) => { err = e; });
  await env.advance(19000);
  eq(err, null, 'no error before the timeout');
  await env.advance(2000);
  await pr;
  eq(err && err.error, 'timeout', 'a hanging request fails with timeout after 20 s');
  eq(env.clock.timers.size, 0, 'no timers leak');
  const ok1 = makeEnv({ abort: true });
  ok1.on('GET', '/rest/v1/public_teams', { body: [] });
  await ok1.YB.q('public_teams', {});
  eq(ok1.clock.timers.size, 0, 'the timeout timer is cleared after a normal response');
});

test('errorText', async () => {
  const { YB } = makeEnv();
  const keys = ['network', 'timeout', 'not_configured', 'invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'over_request_rate_limit', 'over_email_send_rate_limit',
    'weak_password', 'same_password', 'invalid_email', 'jwt_expired', 'not_authenticated', 'permission_denied', 'wrong_role', 'team_not_found', 'name_not_in_roster', 'already_linked',
    'team_full', 'members_count_invalid', 'member_not_found', 'user_not_found', 'invalid_argument', 'invalid_state', 'state_too_large', 'duplicate', 'conflict', 'not_found', 'server_error', 'unknown'];
  const unknown = YB.errorText('definitely_not_a_key');
  ok(ARABIC.test(unknown), 'unknown keys get a generic Arabic sentence');
  const seen = new Set();
  for (const k of keys) {
    const t = YB.errorText(k);
    ok(ARABIC.test(t) && t.length > 8 && t.length < 140, `key ${k} -> short Arabic sentence`);
    if (k !== 'unknown' && !['jwt_expired'].includes(k)) ok(t !== unknown, `key ${k} has its own text`);
    seen.add(t);
  }
  ok(seen.size >= keys.length - 6, 'texts are mostly distinct');
  const cases = [
    [{ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400, 'invalid_credentials'],
    [{ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400, 'invalid_credentials'],
    [{ error_code: 'email_not_confirmed' }, 400, 'email_not_confirmed'],
    [{ msg: 'Email not confirmed' }, 400, 'email_not_confirmed'],
    [{ error_code: 'user_already_exists' }, 422, 'user_already_exists'],
    [{ msg: 'User already registered' }, 400, 'user_already_exists'],
    [{ error_code: 'over_request_rate_limit' }, 429, 'over_request_rate_limit'],
    [{ error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }, 429, 'over_email_send_rate_limit'],
    [{ msg: 'Email rate limit exceeded' }, 429, 'over_email_send_rate_limit'],
    [{ msg: 'Password should be at least 8 characters' }, 422, 'weak_password'],
    [{ error_code: 'weak_password' }, 422, 'weak_password'],
    [{ error_code: 'same_password' }, 422, 'same_password'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 401, 'jwt_expired'],
    [{ code: '42501', message: 'new row violates row-level security policy for table "teams"' }, 403, 'permission_denied'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "teams_name_norm_uq"' }, 409, 'duplicate'],
    [{ code: '23514', message: 'new row violates check constraint' }, 400, 'invalid_data'],
    [{ code: '23503', message: 'violates foreign key constraint' }, 409, 'invalid_reference'],
    [{ code: '22P02', message: 'invalid input syntax for type uuid' }, 400, 'invalid_data'],
    [{ code: 'P0001', message: 'team_not_found' }, 400, 'team_not_found'],
    [{ code: 'P0001', message: 'name_not_in_roster' }, 400, 'name_not_in_roster'],
    [{ code: 'P0001', message: 'already_linked' }, 400, 'already_linked'],
    [{ code: 'P0001', message: 'team_full' }, 400, 'team_full'],
    [{ code: 'P0001', message: 'members_count_invalid' }, 400, 'members_count_invalid'],
    [{ code: '42501', message: 'permission_denied' }, 403, 'permission_denied'],
    [{ code: '42501', message: 'wrong_role' }, 403, 'wrong_role'],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406, 'not_found'],
    [{}, 500, 'server_error'], [{}, 502, 'server_error'], [{}, 401, 'not_authenticated'], [{}, 403, 'permission_denied'], [{}, 404, 'not_found'], [{}, 409, 'duplicate'], [{}, 429, 'over_request_rate_limit']
  ];
  for (const [body, status, key] of cases) {
    const fake = { ok: false, status, data: body };
    // exercise the same path the client uses: through a real failing call
    const env = makeEnv();
    env.on('POST', '/rest/v1/rpc/f', { status, body });
    const res = await env.YB.rpc('f', {});
    eq(res.error, key, `mapping ${JSON.stringify(body)} / ${status}`);
    void fake;
  }
  eq(YB.errorText(new TypeError('Failed to fetch')), YB.errorText('network'), 'TypeError -> network text');
  eq(YB.errorText(Object.assign(new Error('x'), { name: 'AbortError' })), YB.errorText('timeout'), 'AbortError -> timeout text');
  eq(YB.errorText(null), YB.errorText('unknown'), 'null -> generic');
  eq(YB.errorText(undefined), YB.errorText('unknown'), 'undefined -> generic');
  eq(YB.errorText({}), YB.errorText('unknown'), 'empty object -> generic');
  eq(YB.errorText({ status: 429 }), YB.errorText('over_request_rate_limit'), 'bare status 429');
  eq(YB.errorText(new Error('team_not_found')), YB.errorText('team_not_found'), 'Error whose message is a key');
  eq(YB.errorText({ error: 'conflict' }), YB.errorText('conflict'), 'result object with error key');
  eq(YB.errorText({ conflict: true }), YB.errorText('conflict'), 'bare conflict flag');
  ok(!/[A-Za-z]{4,}/.test(YB.errorText('team_not_found')), 'texts contain no raw English words');
});

test('poll: visibility-aware polling with fake timers', async () => {
  const env = makeEnv();
  const { YB } = env;
  let n = 0;
  const stop = YB.poll(() => { n++; }, 15000);
  await env.advance(1);
  eq(n, 1, 'runs immediately when started (visible)');
  await env.advance(14000);
  eq(n, 1, 'not before the interval');
  await env.advance(1500);
  eq(n, 2, 'runs after the 15 s default interval');
  await env.advance(15000);
  eq(n, 3, 'keeps running');
  env.setHidden(true);
  await env.advance(60000);
  eq(n, 3, 'paused while the tab is hidden');
  eq(env.clock.timers.size, 0, 'no timer pending while hidden');
  env.setHidden(false);
  await env.advance(1);
  eq(n, 4, 'runs immediately when the tab becomes visible');
  await env.advance(15000);
  eq(n, 5, 'and resumes the interval');
  stop();
  await env.advance(60000);
  eq(n, 5, 'stop() ends polling');
  eq(env.docListeners.length, 0, 'stop() removes the visibilitychange listener');
  stop();
  eq(n, 5, 'stop() twice is harmless');

  // default interval
  const e2 = makeEnv();
  let m = 0;
  const s2 = e2.YB.poll(() => { m++; });
  await e2.advance(1);
  await e2.advance(14998);
  eq(m, 1, 'default interval is 15000 ms (not earlier)');
  await e2.advance(2);
  eq(m, 2, 'default interval is 15000 ms');
  s2();

  // custom interval + clamp
  const e3 = makeEnv();
  let k = 0;
  const s3 = e3.YB.poll(() => { k++; }, 5000);
  await e3.advance(1);
  await e3.advance(5000);
  eq(k, 2, 'custom interval honoured');
  s3();
  const e3b = makeEnv();
  let kb = 0;
  const s3b = e3b.YB.poll(() => { kb++; }, 10);
  await e3b.advance(1);
  await e3b.advance(500);
  eq(kb, 1, 'absurdly small intervals fall back to the default (no hammering)');
  s3b();

  // starts hidden: no run until visible
  const e4 = makeEnv();
  e4.setHidden(true);
  let h = 0;
  const s4 = e4.YB.poll(() => { h++; }, 15000);
  await e4.advance(60000);
  eq(h, 0, 'starting while hidden does not run');
  e4.setHidden(false);
  await e4.advance(1);
  eq(h, 1, 'first run when it becomes visible');
  s4();

  // immediate:false
  const e5 = makeEnv();
  let q5 = 0;
  const s5 = e5.YB.poll(() => { q5++; }, 15000, { immediate: false });
  await e5.advance(1);
  eq(q5, 0, '{immediate:false} waits for the first interval');
  await e5.advance(15000);
  eq(q5, 1, '...then runs');
  s5();

  // no overlap, errors survive
  const e6 = makeEnv();
  let started = 0, finished = 0, release;
  const s6 = e6.YB.poll(() => { started++; return new Promise((r) => { release = () => { finished++; r(); }; }); }, 15000);
  await e6.advance(1);
  e6.setHidden(true); e6.setHidden(false);
  await e6.advance(1);
  eq(started, 1, 'no overlapping runs while the previous one is still pending');
  release();
  await e6.advance(1);
  await e6.advance(15000);
  eq(started, 2, 'next run after the slow one finished');
  release();
  s6();
  const e7 = makeEnv();
  let boom = 0;
  const s7 = e7.YB.poll(() => { boom++; throw new Error('x'); }, 15000);
  await e7.advance(1);
  await e7.advance(15000);
  await e7.advance(15000);
  eq(boom, 3, 'a throwing function does not stop the polling');
  const e8 = makeEnv();
  let rej = 0;
  const s8 = e8.YB.poll(() => { rej++; return Promise.reject(new Error('x')); }, 15000);
  await e8.advance(1);
  await e8.advance(15000);
  eq(rej, 2, 'a rejecting function does not stop the polling');
  s7(); s8();
  eq(env.consoleCalls.length + e7.consoleCalls.length, 0, 'poll never logs');
});

test('never logs, never leaks tokens', async () => {
  const p = makeEnv();
  const env = makeEnv();
  env.on('POST', 'grant_type=password', () => ({ body: sessionBody(env, 'SECRET-ACCESS', 'SECRET-REFRESH') }));
  env.on('GET', '/rest/v1/', { status: 500, body: { message: 'boom' } });
  await env.YB.signIn('a@b.co', 'goodpass1');
  try { await env.YB.q('teams', {}); } catch (e) { /* expected */ }
  await env.YB.rpc('x', {});
  await env.YB.signOut();
  eq(env.consoleCalls.length, 0, 'console was never called during the whole flow');
  const pub = JSON.stringify(env.YB.session());
  ok(!pub.includes('SECRET'), 'session() never exposes tokens');
  const e2 = makeEnv({ stored: storedSession(p) });
  ok(!JSON.stringify(e2.YB.session()).includes('acc0') && !JSON.stringify(e2.YB.session()).includes('ref0'), 'restored session() has no tokens either');
  ok(!Object.keys(e2.YB).some((k) => /token|secret|key/i.test(k)), 'the YB object has no token/key properties');
});

/* ===================================================================== */
for (const [name, fn] of tests) {
  section(name);
  try { await fn(); } catch (e) { failed.push(`${name}: CRASH ${e && e.stack || e}`); console.log('  CRASH ' + (e && e.stack || e)); }
}
const total = passed + failed.length;
console.log(`\n${passed}/${total} checks passed`);
if (failed.length) { console.log(`${failed.length} FAILED`); failed.forEach((f) => console.log(' - ' + f)); process.exit(1); }
console.log('YB api tests: ALL GREEN');
