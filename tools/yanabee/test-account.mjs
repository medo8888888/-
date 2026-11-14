// Browser test of account.html (حسابي): sign-up, login, password reset and one screen per role (admin, leader, member, parent).
//   node tools/yanabee/test-account.mjs
// The page talks to an in-memory FAKE Supabase served through page.route at https://fake.supabase.test. The fake copies the
// rules of supabase/migrations/0001_yanabee.sql: role whitelist at sign-up, RLS (who may read/write which rows and columns),
// the 5–7 submit rule, max 7, join/link errors, consent permissions, admin-only approvals, the column limits of my_roster /
// my_children. The site is served over http from a throw-away local server (the tokens in e-mail links need a real origin).
// Covers: unconfigured mode, every role flow end to end, failure paths, 390px layout, dark theme, keyboard use, console, hosts.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site/yanabee');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));

let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const section = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

execSync('python3 tools/yanabee/build.py account tournament', { cwd: ROOT, stdio: 'pipe' }); // account.html and tournament.html (nothing else is rebuilt)

/* ---------------------------------------------------------------- static server for the site */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(SITE, rel);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const FAKE_URL = 'https://fake.supabase.test';
const ANON = 'fake-anon-key-for-tests';

/* ---------------------------------------------------------------- the tournament engine (to build real states) */
const YT = (() => { const m = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(SITE, 'js/tournament-engine.js'), 'utf8'), { module: m, exports: m.exports }); return m.exports; })();

/* ================================================================ FAKE SUPABASE */
const ARABIC_NORM = s => String(s || '').replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩﻿]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s ]+/g, ' ').trim().toLowerCase();
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

class Fake {
  constructor(o = {}) {
    this.autoConfirm = o.autoConfirm ?? true;
    this.users = []; this.profiles = []; this.teams = []; this.members = []; this.links = []; this.tour = null; this.notes = []; this.officers = []; this.noteSeq = 0;
    this.events = []; this.att = [];
    this.live = []; this.marks = []; this.markSeq = 0;   // migration 0007
    this.subs = []; this.objects = new Map(); this.uploads = [];   // migration 0008 (submissions, private photos)
    this.seekers = new Map(); this.invites = []; this.transfers = false;   // migration 0012 (players looking for a team)
    this.logos = new Map();   // migration 0014 (team logos: path -> uploader)
    this.pushSubs = []; this.pushReady = true; this.pushKey = 'B' + 'x'.repeat(86);   // migration 0013 (phone notifications)
    this.judges = new Map(); this.jscores = []; this.ascores = []; this.published = false;   // migration 0010
    this.ann = []; this.annSeq = 0; this.chat = []; this.chatSeq = 0; this.reports = []; this.mutes = new Map(); this.reads = new Map();   // migration 0009
    this.posts = []; this.cmts = []; this.cmtSeq = 0; this.creports = []; this.prefs = new Map(); this.tstyle = new Map(); this.membersComment = false;   // migration 0011
    this.tokens = new Map(); this.refresh = new Map(); this.log = []; this.recovers = []; this.fail = []; this.delay = 0; this.tick = 0;
  }
  uid() { return crypto.randomUUID(); }
  now() { return new Date(1_790_000_000_000 + (++this.tick) * 1000).toISOString(); }
  /* ---- test helpers ---- */
  addUser({ email, password = 'Passw0rd!', name = '', role = 'member', confirmed = true }) {
    const id = this.uid();
    this.users.push({ id, email, password, confirmed });
    const r = ['leader', 'member', 'parent'].includes(role) ? role : 'member';
    this.profiles.push({ id, email, full_name: name.slice(0, 80), role: r, phone: null, created_at: this.now() });
    return this.profiles[this.profiles.length - 1];
  }
  profileByEmail(e) { return this.profiles.find(p => p.email === e); }
  // mirrors the trigger yb_teams_status_notify (migration 0003)
  notify(uids, kind, data) { [...new Set(uids.filter(Boolean))].forEach(u => this.notes.push({ id: ++this.noteSeq, user_id: u, kind, data, read_at: null, created_at: this.now() })); }
  statusChanged(t, from, actor) {
    if (t.status === from) return;
    if (t.leader_id !== actor) this.notify([t.leader_id], 'team_status', { team_id: t.id, team_name: t.name, from, to: t.status, note: t.admin_note });
    if (t.status === 'submitted') this.notify([...this.profiles.filter(p => p.role === 'admin').map(p => p.id), ...this.officers.filter(o => o.competition === 'registration').map(o => o.user_id)], 'team_submitted', { team_id: t.id, team_name: t.name });
    if (t.status === 'approved') this.notify([...this.members.filter(m => m.team_id === t.id && !m.is_leader).map(m => m.user_id), ...this.links.filter(l => this.members.find(m => m.id === l.member_id && m.team_id === t.id)).map(l => l.parent_id)], 'team_approved', { team_id: t.id, team_name: t.name });
  }
  setRole(email, role) { const p = this.profileByEmail(email); p.role = role; return p; }
  setAdmin(email) { const p = this.profileByEmail(email); if (!p) throw new Error('user_not_found'); p.role = 'admin'; return p; }
  confirm(email) { this.users.find(u => u.email === email).confirmed = true; }
  session(uid) {
    const u = this.users.find(x => x.id === uid);
    const access = 'acc.' + crypto.randomBytes(9).toString('hex'), refresh = 'ref.' + crypto.randomBytes(9).toString('hex');
    this.tokens.set(access, { uid, exp: Date.now() + 3600e3 });
    this.refresh.set(refresh, uid);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: { id: uid, email: u.email } };
  }
  expireAccess() { for (const v of this.tokens.values()) v.exp = 0; }
  revokeRefresh() { this.refresh.clear(); }
  seedTeam({ leaderEmail, name, area = 'حي الأمل', status = 'draft', members = [], note = null }) {
    const lp = this.profileByEmail(leaderEmail);
    const t = { id: this.uid(), name, area, leader_id: lp.id, join_code: this.newCode(), status, admin_note: note, created_at: this.now(), updated_at: this.now() };
    this.teams.push(t);
    this.members.push({ id: this.uid(), team_id: t.id, full_name: lp.full_name || 'قائد الفريق', age: null, guardian_name: null, guardian_phone: null, is_leader: true, user_id: lp.id, consent_status: 'pending', consent_at: null, created_at: this.now() });
    members.forEach(m => this.members.push({ id: this.uid(), team_id: t.id, full_name: m.name, age: m.age ?? 15, guardian_name: m.gname ?? 'ولي الأمر', guardian_phone: m.gphone ?? '0912345678', is_leader: false, user_id: null, consent_status: m.consent || 'pending', consent_at: null, created_at: this.now() }));
    return t;
  }
  newCode() { let c; do { c = Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(31)]).join(''); } while (this.teams.some(t => t.join_code === c)); return c; }
  // a team sent from register.html without an account (migration 0005): no leader account, a request number, private details
  seedOnline({ name, ref, phone, area = 'حي الأمل', status = 'submitted', leader = 'قائد الاستمارة', members = [] }) {
    const t = { id: this.uid(), name, area, leader_id: null, join_code: this.newCode(), status, admin_note: null, created_at: this.now(), updated_at: this.now(),
      ref_code: ref, fee_status: 'unpaid', fee_receipt: null, reg: { phone, email: null, reciter1: members[0] && members[0].name, reciter2: members[1] && members[1].name, chess: members[2] && members[2].name, coordinator: null, idea: 'حملة نظافة' } };
    this.teams.push(t);
    this.members.push({ id: this.uid(), team_id: t.id, full_name: leader, age: 16, guardian_name: null, guardian_phone: phone, is_leader: true, user_id: null, consent_status: 'pending', consent_at: null, created_at: this.now() });
    members.forEach(m => this.members.push({ id: this.uid(), team_id: t.id, full_name: m.name, age: m.age ?? 13, guardian_name: null, guardian_phone: '05300000000', is_leader: false, user_id: null, consent_status: m.consent || 'pending', consent_at: null, created_at: this.now() }));
    return t;
  }
  setTournament(state) { this.tour = { id: 1, state, updated_at: this.now() }; }
  count(re) { return this.log.filter(l => re.test(l.method + ' ' + l.path)).length; }

  /* ---- http entry ---- */
  async handle(route) {
    const req = route.request();
    const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const headers = req.headers();
    const bearer = (headers.authorization || '').replace(/^Bearer\s+/i, '');
    const entry = { method: req.method(), path: u.pathname, search: u.search, who: bearer && bearer !== ANON ? (this.tokens.get(bearer) || {}).uid || 'bad' : 'anon', apikey: headers.apikey };
    this.log.push(entry);
    const fi = this.fail.findIndex(f => f.re.test(entry.method + ' ' + entry.path + entry.search));
    if (fi >= 0) {
      const f = this.fail[fi];
      if (--f.times <= 0) this.fail.splice(fi, 1);
      if (f.abort) return route.abort('failed');
      return route.fulfill({ status: f.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(f.body || {}) });
    }
    if (this.delay) await sleep(this.delay);
    if (req.method() === 'GET' && u.pathname.startsWith('/storage/v1/object/sign/')) {   // a signed photo link: a 1x1 PNG
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    }
    if (req.method() === 'POST' && /^\/storage\/v1\/object\/(?!sign\/)/.test(u.pathname)) {
      const buf = req.postDataBuffer() || Buffer.alloc(0);
      this.uploads.push({ path: u.pathname, type: headers['content-type'], size: buf.length, upsert: headers['x-upsert'], jpeg: buf[0] === 0xff && buf[1] === 0xd8, exif: buf.includes(Buffer.from('Exif')) });
    }
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = null; }
    const out = this.dispatch(req.method(), u, headers, body, bearer);
    const res = { status: out.status, headers: { ...cors, 'content-type': 'application/json' } };
    if (out.body !== undefined && out.status !== 204) res.body = JSON.stringify(out.body);
    return route.fulfill(res);
  }
  failNext(re, o = {}) { this.fail.push({ re, times: o.times || 1, status: o.status || 500, body: o.body, abort: o.abort }); }

  /* ---- routing ---- */
  dispatch(method, u, headers, body, bearer) {
    const p = u.pathname;
    if (p.startsWith('/auth/v1/')) return this.auth(method, p.slice(9), u, body, bearer);
    if (p.startsWith('/rest/v1/rpc/')) return this.rpc(p.slice(13), method, body, this.ctx(bearer));
    if (p.startsWith('/storage/v1/')) return this.storage(method, decodeURIComponent(p.slice(12)), body, this.ctx(bearer));
    if (p.startsWith('/rest/v1/')) {
      const c = this.ctx(bearer);
      if (c.bad) return c.bad;
      return this.rest(method, p.slice(9), u.searchParams, body, headers, c);
    }
    return { status: 404, body: { message: 'no route ' + p } };
  }
  ctx(bearer) {
    if (!bearer || bearer === ANON) return { uid: null, role: 'anon' };
    const t = this.tokens.get(bearer);
    if (!t) return { bad: err(401, 'PGRST301', 'JWT invalid') };
    if (t.exp < Date.now()) return { bad: err(401, 'PGRST301', 'JWT expired') };
    const pr = this.profiles.find(x => x.id === t.uid);
    return { uid: t.uid, role: pr ? pr.role : 'member', profile: pr };
  }

  /* ---- GoTrue ---- */
  auth(method, a, u, body, bearer) {
    body = body || {};
    if (a === 'signup' && method === 'POST') {
      if (this.users.some(x => x.email.toLowerCase() === String(body.email).toLowerCase())) return { status: 422, body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' } };
      if (String(body.password || '').length < 8) return { status: 422, body: { code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' } };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return { status: 422, body: { code: 422, error_code: 'email_address_invalid', msg: 'Unable to validate email address: invalid format' } };
      const meta = body.data || {};
      const p = this.addUser({ email: body.email, password: body.password, name: String(meta.full_name || '').trim(), role: meta.role, confirmed: this.autoConfirm }); // role whitelist = trigger yb_handle_new_user
      return this.autoConfirm ? { status: 200, body: this.session(p.id) } : { status: 200, body: { id: p.id, email: p.email } };
    }
    if (a === 'token' && method === 'POST') {
      const gt = u.searchParams.get('grant_type');
      if (gt === 'password') {
        const us = this.users.find(x => x.email.toLowerCase() === String(body.email).toLowerCase());
        if (!us || us.password !== body.password) return { status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } };
        if (!us.confirmed) return { status: 400, body: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' } };
        return { status: 200, body: this.session(us.id) };
      }
      if (gt === 'refresh_token') {
        const id = this.refresh.get(body.refresh_token);
        if (!id) return { status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } };
        this.refresh.delete(body.refresh_token);
        return { status: 200, body: this.session(id) };
      }
    }
    if (a === 'logout') { this.tokens.delete(bearer); return { status: 204 }; }
    if (a === 'recover' && method === 'POST') { this.recovers.push(body.email); return { status: 200, body: {} }; } // identical answer for unknown e-mails
    if (a === 'user') {
      const t = this.tokens.get(bearer);
      if (!t || t.exp < Date.now()) return { status: 401, body: { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' } };
      const us = this.users.find(x => x.id === t.uid);
      if (method === 'GET') return { status: 200, body: { id: us.id, email: us.email } };
      if (method === 'PUT') {
        if (String(body.password || '').length < 8) return { status: 422, body: { code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' } };
        if (body.password === us.password) return { status: 422, body: { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' } };
        us.password = body.password;
        return { status: 200, body: { id: us.id, email: us.email } };
      }
    }
    return { status: 404, body: { msg: 'no auth route' } };
  }

  /* ---- judging totals (migration 0010) ---- */
  totals() {
    const CAP = { hifz: 10, fahm: 15, roles: 10, execution: 30, documentation: 5 };
    const avg = (tid, c) => { const xs = this.jscores.filter(s => s.team_id === tid && s.criterion === c).map(s => s.points); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null; };
    const adm = (tid, a) => { const x = this.ascores.find(s => s.team_id === tid && s.axis === a); return x ? x.points : null; };
    const rows = this.teams.filter(t => t.status === 'approved' && !t.waitlist).map(t => {
      const r = { team_id: t.id, team_name: t.name };
      Object.keys(CAP).forEach(c => { r[c] = avg(t.id, c); });
      r.tatbiq = r.roles === null && r.execution === null && r.documentation === null ? null : (r.roles || 0) + (r.execution || 0) + (r.documentation || 0);
      r.football = adm(t.id, 'football'); r.chess = adm(t.id, 'chess');
      r.total = (r.hifz || 0) + (r.fahm || 0) + (r.tatbiq || 0) + (r.football || 0) + (r.chess || 0);
      return r;
    });
    rows.forEach(r => { r.rank = 1 + rows.filter(o => o.total > r.total).length; });
    return rows.sort((a, b) => a.rank - b.rank || a.team_name.localeCompare(b.team_name));
  }

  /* ---- Storage (migration 0008: private bucket yanabee-submissions) ---- */
  subPerson(uid, teamId) {
    const t = this.teams.find(x => x.id === teamId);
    return !!t && (t.leader_id === uid || this.members.some(m => m.team_id === teamId && m.user_id === uid)
      || this.links.some(l => l.parent_id === uid && (this.members.find(m => m.id === l.member_id) || {}).team_id === teamId));
  }
  subStaff(c) { return c.role === 'admin' || (c.role === 'officer' && this.officers.some(o => o.user_id === c.uid && o.competition === 'projects')); }
  subCanWrite(uid, path, adding) {
    const [tid, sid, f, extra] = String(path).split('/');
    if (!tid || !sid || !f || extra !== undefined) return false;
    const t = this.teams.find(x => x.id === tid);
    if (!t || t.leader_id !== uid || t.status !== 'approved') return false;
    const s = this.subs.find(x => x.id === sid);
    if (s && (s.team_id !== tid || !['submitted', 'returned'].includes(s.status))) return false;
    if (adding && [...this.objects.keys()].filter(k => k.startsWith(`${tid}/${sid}/`)).length >= 6) return false;
    return true;
  }
  storage(method, p, body, c) {
    const B = 'yanabee-submissions';
    if (c.bad) return c.bad;
    if (p.includes('yanabee-logos')) {   // 0014: <team>/<file>, the team's leader or the admin; signed-in people read
      const LB = 'yanabee-logos', deny = { status: 400, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
      if (!c.uid) return deny;
      const may = path => { const parts = path.split('/'); return parts.length === 2 && !!parts[1] && (c.role === 'admin' || this.teams.some(t => t.id === parts[0] && t.leader_id === c.uid)); };
      if (method === 'POST' && p.startsWith(`object/sign/${LB}`)) return { status: 200, body: ((body && body.paths) || []).map(x => (this.logos.has(x) ? { path: x, signedURL: `/object/sign/${LB}/${x}?token=t-${this.tick}`, error: null } : { path: x, signedURL: null, error: 'not found' })) };
      if (method === 'POST' && p.startsWith(`object/${LB}/`)) {
        const path = p.slice(`object/${LB}/`.length);
        if (!may(path) || [...this.logos.keys()].filter(k => k.startsWith(path.split('/')[0] + '/')).length >= 3) return deny;
        this.logos.set(path, c.uid);
        return { status: 200, body: { Key: `${LB}/${path}`, Id: this.uid() } };
      }
      if (method === 'DELETE' && p === `object/${LB}`) { const gone = ((body && body.prefixes) || []).filter(x => this.logos.has(x) && may(x)); gone.forEach(x => this.logos.delete(x)); return { status: 200, body: gone.map(name => ({ name, bucket_id: LB })) }; }
      return { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
    }
    const isPublic = x => this.subs.some(s => s.featured && s.status === 'accepted' && s.photos.includes(x));   // 0008: photos of featured work
    if (!c.uid && !(method === 'POST' && p.startsWith(`object/sign/${B}`))) return { status: 400, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
    if (method === 'POST' && p.startsWith(`object/sign/${B}`)) {
      const paths = (body && Array.isArray(body.paths)) ? body.paths : [];
      return { status: 200, body: paths.map(x => (this.objects.has(x) && (isPublic(x) || (c.uid && (this.subStaff(c) || this.subPerson(c.uid, x.split('/')[0])))))
        ? { path: x, signedURL: `/object/sign/${B}/${x}?token=t-${this.tick}`, error: null } : { path: x, signedURL: null, error: 'Either the object does not exist or you do not have access to it' }) };
    }
    if (method === 'POST' && p.startsWith(`object/${B}/`)) {
      const path = p.slice(`object/${B}/`.length);
      if (!this.subCanWrite(c.uid, path, true)) return { status: 400, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
      if (this.objects.has(path)) return { status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } };
      this.objects.set(path, c.uid);
      return { status: 200, body: { Key: `${B}/${path}`, Id: this.uid() } };
    }
    if (method === 'DELETE' && p === `object/${B}`) {
      const gone = ((body && body.prefixes) || []).filter(x => this.objects.has(x) && this.subCanWrite(c.uid, x, false));
      gone.forEach(x => this.objects.delete(x));
      return { status: 200, body: gone.map(name => ({ name, bucket_id: B })) };
    }
    return { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
  }

  /* ---- PostgREST ---- */
  rest(method, table, q, body, headers, c) {
    const wantObj = /vnd\.pgrst\.object/.test(headers.accept || '');
    const rep = /return=representation/.test(headers.prefer || '');
    const deny = () => (c.uid ? err(403, '42501', `permission denied for table ${table}`) : err(401, '42501', `permission denied for table ${table}`));
    const finish = rows => {
      rows = filterRows(rows, q);
      rows = orderRows(rows, q.get('order'));
      if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
      rows = project(rows, q.get('select'));
      if (wantObj) return rows.length === 1 ? { status: 200, body: rows[0] } : err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return { status: 200, body: rows };
    };
    const me = c.uid, admin = c.role === 'admin';
    const myTeamIds = () => new Set([...this.teams.filter(t => t.leader_id === me).map(t => t.id), ...this.members.filter(m => m.user_id === me).map(m => m.team_id)]);

    /* views and anon-readable */
    if (table === 'tournament_state') {
      if (method === 'GET') return finish(this.tour ? [{ ...this.tour }] : []);
      return deny();
    }
    if (table === 'public_teams') return method === 'GET' ? finish(this.teams.filter(t => t.status === 'approved').map(t => ({ id: t.id, name: t.name, area: t.area }))) : deny();
    // migration 0007: the live table is public (scores and times, never notes or who entered them)
    if (table === 'yb_match_live') return method === 'GET' ? finish(this.live.map(x => ({ comp: x.comp, match_key: x.match_key, a: x.a, b: x.b, sa: x.sa, sb: x.sb, ca: x.ca || 0, cb: x.cb || 0, ra: x.ra || 0, rb: x.rb || 0,
      status: x.status, started_at: x.started_at || null, updated_at: x.updated_at || null, approved_at: x.approved_at || null }))) : deny();
    if (table === 'yb_announcements') {   // migration 0009: anon reads published «all»; each role its own; the admin everything
      if (method !== 'GET') return deny();
      if ((q.get('select') || '').includes('created_by')) return err(401, '42501', 'permission denied for column created_by');
      const role = c.role, aud = { leader: 'leaders', member: 'members', parent: 'parents' }[role];
      return finish(this.ann.filter(a => role === 'admin' || (a.published && (a.audience === 'all' || (me && (a.audience === aud || role === 'officer'))))).map(a => ({ ...a })));
    }
    if (!me) return deny(); // everything below needs a signed-in user (grants are for `authenticated` only)
    if (table === 'my_roster') {
      if (method !== 'GET') return deny();
      const ids = myTeamIds();
      return finish(this.members.filter(m => ids.has(m.team_id)).map(m => ({ member_id: m.id, team_id: m.team_id, full_name: m.full_name, is_leader: m.is_leader, joined: m.user_id !== null, is_me: m.user_id === me, consent_status: m.user_id === me ? m.consent_status : null })));
    }
    if (table === 'my_children') {
      if (method !== 'GET') return deny();
      return finish(this.links.filter(l => l.parent_id === me).map(l => {
        const m = this.members.find(x => x.id === l.member_id), t = this.teams.find(x => x.id === m.team_id);
        return { member_id: m.id, full_name: m.full_name, age: m.age, is_leader: m.is_leader, consent_status: m.consent_status, consent_at: m.consent_at, team_id: t.id, team_name: t.name, team_area: t.area, team_status: t.status };
      }));
    }
    if (table === 'profiles') {
      if (method === 'GET') return finish((admin ? this.profiles : this.profiles.filter(x => x.id === me)).map(x => ({ ...x })));
      if (method === 'PATCH') {
        const allowed = ['full_name', 'phone'];
        if (Object.keys(body || {}).some(k => !allowed.includes(k))) return err(403, '42501', 'permission denied for table profiles');
        const rows = filterRows(this.profiles.filter(x => x.id === me), q);
        rows.forEach(r => Object.assign(r, body));
        return rep ? { status: 200, body: rows } : { status: 204 };
      }
      return deny();
    }
    if (table === 'yb_team_style') return method === 'GET' ? finish([...this.tstyle.values()].map(x => ({ ...x }))) : deny();   // 0011: public colors and badges
    if (table === 'yb_submissions') {
      if (method !== 'GET') return deny();
      return finish(this.subs.filter(x => this.subStaff(c) || this.subPerson(me, x.team_id)).map(x => ({ ...x, photos: [...x.photos] })));
    }
    if (table === 'parent_links') {
      if (method === 'GET') return finish(this.links.filter(l => admin || l.parent_id === me));
      return deny();
    }
    if (table === 'audit_log') return admin && method === 'GET' ? finish([]) : (method === 'GET' ? finish([]) : deny());

    if (table === 'yb_events') {
      const canManage = comp => admin || (c.role === 'officer' && this.officers.some(o => o.user_id === me && o.competition === comp));
      const cols = ['competition', 'kind', 'title', 'starts_at', 'place', 'team_ids', 'category', 'note', 'status'];
      if (method === 'GET') return finish(this.events.map(e => ({ ...e })));
      if (method === 'POST') {
        const b = Array.isArray(body) ? body[0] : body;
        if (Object.keys(b || {}).some(k => !cols.includes(k))) return deny();
        if (!canManage(b.competition)) return err(403, '42501', 'new row violates row-level security policy for table "yb_events"');
        if ((b.team_ids || []).some(id => !this.teams.some(t => t.id === id))) return err(400, 'P0001', 'invalid_team');
        const e = { id: this.uid(), competition: b.competition, kind: b.kind || 'other', title: String(b.title).trim(), starts_at: b.starts_at, place: b.place ?? null, team_ids: [...new Set(b.team_ids || [])],
          category: b.category ?? null, note: b.note ?? null, status: 'scheduled', created_by: me };
        this.events.push(e);
        return rep ? { status: 201, body: [{ ...e }] } : { status: 201 };
      }
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(k => !cols.includes(k))) return deny();
        const targets = filterRows(this.events.filter(e => canManage(e.competition)), q);
        targets.forEach(e => {
          const moved = (body.starts_at !== undefined && body.starts_at !== e.starts_at) || (body.place !== undefined && body.place !== e.place);
          Object.assign(e, body);
          if (body.status === undefined && moved && e.status !== 'cancelled') e.status = 'changed';
        });
        return rep ? { status: 200, body: targets.map(e => ({ ...e })) } : { status: 204 };
      }
      return deny();
    }
    if (table === 'yb_attendance') {
      if (method !== 'GET') return deny();
      const lead = this.teams.filter(t => t.leader_id === me).map(t => t.id);
      return finish(this.att.filter(a => { const e = this.events.find(x => x.id === a.event_id); return admin || lead.includes(a.team_id) || (e && c.role === 'officer' && this.officers.some(o => o.user_id === me && o.competition === e.competition)); }).map(a => ({ ...a })));
    }
    if (table === 'yb_notifications') return method === 'GET' ? finish(this.notes.filter(n => n.user_id === me).map(n => ({ ...n }))) : deny();
    if (table === 'yb_officers') return method === 'GET' ? finish(this.officers.filter(o => admin || o.user_id === me).map(o => ({ ...o }))) : deny();
    if (table === 'teams') {
      const mine = t => t.leader_id === me;
      if (method === 'GET') return finish((admin ? this.teams : this.teams.filter(mine)).map(t => ({ ...t })));
      if (method === 'POST') {
        const b = Array.isArray(body) ? body[0] : body;
        if (Object.keys(b || {}).some(k => !['name', 'area'].includes(k))) return deny(); // column grant: insert (name, area) only
        if (c.role !== 'leader' && !admin) return err(403, '42501', 'new row violates row-level security policy for table "teams"');
        const name = String(b.name || '').trim();
        if (name.length < 2 || name.length > 60) return err(400, '23514', 'new row for relation "teams" violates check constraint "teams_name_len"');
        if (this.teams.some(t => ARABIC_NORM(t.name) === ARABIC_NORM(name))) return err(409, '23505', 'duplicate key value violates unique constraint "teams_name_norm_uq"');
        if (this.teams.some(t => t.leader_id === me)) return err(409, '23505', 'duplicate key value violates unique constraint "teams_leader_uq"');
        const t = { id: this.uid(), name, area: b.area ?? null, leader_id: me, join_code: this.newCode(), status: 'draft', admin_note: null, created_at: this.now(), updated_at: this.now() }; // trigger forces these
        this.teams.push(t);
        this.members.push({ id: this.uid(), team_id: t.id, full_name: (c.profile && c.profile.full_name.trim()) || 'قائد الفريق', age: null, guardian_name: null, guardian_phone: null, is_leader: true, user_id: me, consent_status: 'pending', consent_at: null, created_at: this.now() });
        return rep ? { status: 201, body: [{ ...t }] } : { status: 201 };
      }
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(k => !['name', 'area', 'status'].includes(k))) return deny();
        const targets = filterRows(this.teams.filter(t => admin || (mine(t) && ['draft', 'submitted', 'returned'].includes(t.status))), q); // USING
        if (!admin && body.status && !['draft', 'submitted'].includes(body.status)) return err(403, '42501', 'new row violates row-level security policy for table "teams"'); // WITH CHECK
        if (targets.length && body.status && !['draft', 'submitted', 'returned', 'approved', 'rejected'].includes(body.status)) return err(400, '23514', 'violates check constraint "teams_status_chk"');
        for (const t of targets) {
          const nm = body.name !== undefined ? String(body.name).trim() : t.name;
          if (nm.length < 2 || nm.length > 60) return err(400, '23514', 'violates check constraint "teams_name_len"');
          if (this.teams.some(x => x !== t && ARABIC_NORM(x.name) === ARABIC_NORM(nm))) return err(409, '23505', 'duplicate key value violates unique constraint "teams_name_norm_uq"');
          if (body.status === 'submitted' && t.status !== 'submitted') {
            const n = this.members.filter(m => m.team_id === t.id).length;
            if (n < 5 || n > 7) return err(400, 'P0001', 'members_count_invalid');
          }
        }
        targets.forEach(t => { const from = t.status; Object.assign(t, body, body.name !== undefined ? { name: String(body.name).trim() } : {}); t.updated_at = this.now(); this.statusChanged(t, from, me); });
        return rep ? { status: 200, body: targets.map(t => ({ ...t })) } : { status: 204 };
      }
      return deny();
    }

    if (table === 'team_members') {
      const teamOf = id => this.teams.find(t => t.id === id);
      const canEdit = tid => admin || (teamOf(tid) && teamOf(tid).leader_id === me && ['draft', 'submitted', 'returned'].includes(teamOf(tid).status));
      const readable = m => admin || (teamOf(m.team_id) && teamOf(m.team_id).leader_id === me) || m.user_id === me || this.links.some(l => l.parent_id === me && l.member_id === m.id);
      if (method === 'GET') return finish(this.members.filter(readable).map(m => ({ ...m })));
      if (method === 'POST') {
        const b = Array.isArray(body) ? body[0] : body;
        if (Object.keys(b || {}).some(k => !['team_id', 'full_name', 'age', 'guardian_name', 'guardian_phone'].includes(k))) return deny();
        if (!canEdit(b.team_id)) return err(403, '42501', 'new row violates row-level security policy for table "team_members"');
        const nm = String(b.full_name || '').trim();
        if (nm.length < 2 || nm.length > 80) return err(400, '23514', 'violates check constraint "members_name_len"');
        if (b.age !== null && b.age !== undefined && (b.age < 4 || b.age > 100)) return err(400, '23514', 'violates check constraint "members_age_chk"');
        if (this.members.some(m => m.team_id === b.team_id && ARABIC_NORM(m.full_name) === ARABIC_NORM(nm))) return err(409, '23505', 'duplicate key value violates unique constraint "team_members_name_uq"');
        if (this.members.filter(m => m.team_id === b.team_id).length + 1 > 7) return err(400, 'P0001', 'team_full'); // AFTER INSERT trigger, whole statement rolls back
        const m = { id: this.uid(), team_id: b.team_id, full_name: nm, age: b.age ?? null, guardian_name: b.guardian_name ?? null, guardian_phone: b.guardian_phone ?? null, is_leader: false, user_id: null, consent_status: 'pending', consent_at: null, created_at: this.now() };
        this.members.push(m);
        return rep ? { status: 201, body: [{ ...m }] } : { status: 201 };
      }
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(k => !['full_name', 'age', 'guardian_name', 'guardian_phone'].includes(k))) return deny();
        const rows = filterRows(this.members.filter(m => canEdit(m.team_id)), q);
        for (const m of rows) {
          if (body.full_name !== undefined) {
            const nm = String(body.full_name).trim();
            if (nm.length < 2 || nm.length > 80) return err(400, '23514', 'violates check constraint "members_name_len"');
            if (this.members.some(x => x !== m && x.team_id === m.team_id && ARABIC_NORM(x.full_name) === ARABIC_NORM(nm))) return err(409, '23505', 'duplicate key value');
          }
          if (body.age !== null && body.age !== undefined && (body.age < 4 || body.age > 100)) return err(400, '23514', 'violates check constraint "members_age_chk"');
        }
        rows.forEach(m => Object.assign(m, body, body.full_name !== undefined ? { full_name: String(body.full_name).trim() } : {}));
        return rep ? { status: 200, body: rows.map(m => ({ ...m })) } : { status: 204 };
      }
      if (method === 'DELETE') {
        const rows = filterRows(this.members.filter(m => admin || (canEdit(m.team_id) && !m.is_leader)), q);
        rows.forEach(m => { this.members.splice(this.members.indexOf(m), 1); this.links = this.links.filter(l => l.member_id !== m.id); });
        return rep ? { status: 200, body: rows } : { status: 204 };
      }
    }
    return deny();
  }

  /* ---- RPC ---- */
  rpc(name, method, body, c) {
    if (c.bad) return c.bad;
    if (method !== 'POST') return err(405, 'PGRST101', 'method');
    const need = (...keys) => keys.every(k => body && Object.prototype.hasOwnProperty.call(body, k)) && Object.keys(body).every(k => keys.includes(k));
    const me = c.uid;
    if (name === 'yb_public_results') return { status: 200, body: this.published ? this.totals().map(r => ({ team_name: r.team_name, hifz: r.hifz, fahm: r.fahm, tatbiq: r.tatbiq, football: r.football, chess: r.chess, total: r.total, rank: r.rank })) : [] };   // anon too (0010)
    if (name === 'yb_public_projects') return { status: 200, body: this.subs.filter(x => x.featured && x.status === 'accepted').map(x => ({ id: x.id, team_name: (this.teams.find(t => t.id === x.team_id) || {}).name,
      kind: x.kind, title: x.title, value_text: x.value_text, place: x.place, done_on: x.done_on, summary: x.summary, results: x.results, beneficiaries: x.beneficiaries, photos: [...x.photos], featured_at: x.featured_at })) };   // anon too (0008)
    if (!me) return err(401, '42501', `permission denied for function ${name}`);
    const raise = (key, code = 'P0001') => err(code === '42501' ? 403 : 400, code, key);
    const admin = c.role === 'admin';
    const SIG = { yb_seek_me: [], yb_seek_save: ['p'], yb_seek_stop: [], yb_seek_guardian: ['code'], yb_guardian_seekers: [], yb_seek_guardian_revoke: ['seeker'], yb_seek_pool: [],
      yb_invite_send: ['seeker'], yb_invite_cancel: ['id'], yb_invite_answer: ['id', 'accept'], yb_set_transfers: ['allow'], yb_seek_stats: [],
      yb_team_staff: ['team_id'], yb_set_assistant: ['team_id', 'member_id'], yb_set_team_logo: ['team_id', 'path'],
      yb_push_mine: ['endpoint'], yb_push_key: [], yb_push_subscribe: ['sub'], yb_push_unsubscribe: ['endpoint'],
      my_team: [], join_team: ['code', 'member_name'], link_child: ['code', 'child_name'], approve_team: ['team_id', 'ok', 'note'], mark_consent: ['member_id', 'received'],
      unlink_member: ['member_id'], regenerate_join_code: ['team_id'], set_user_role: ['target', 'new_role'],
      yb_review_team: ['team_id', 'decision', 'note'], yb_review_list: [], yb_review_roster: ['team_id'], yb_my_competitions: [], yb_set_officer: ['target', 'competition', 'assign'],
      yb_mark_read: [], yb_my_team_roster_status: [], yb_rsvp: ['event_id', 'team_id', 'answer'], yb_mark_attendance: ['event_id', 'team_id', 'presence', 'late_minutes'],
      yb_team_checklist: ['team_id'], yb_claim_team: ['ref', 'phone'], yb_set_fee: ['team_id', 'status', 'receipt'], yb_registration_detail: ['team_id'],
      yb_set_roles: ['team_id', 'reciter', 'reserve', 'chess', 'coord'], yb_role_list: [], yb_set_waitlist: ['team_id', 'waiting'],
      yb_results_queue: [], yb_live_set: ['comp', 'match_key', 'a', 'b', 'sa', 'sb', 'ca', 'cb', 'ra', 'rb', 'status', 'note', 'start', 'a_name', 'b_name'],
      yb_mark_add: ['comp', 'match_key', 'team_id', 'kind', 'member_id', 'minute'], yb_mark_del: ['id'], yb_match_roster: ['comp', 'team_id'],
      yb_match_marks_of: ['comp', 'match_key'], yb_result_approve: ['comp', 'match_key', 'state', 'prev'], yb_result_return: ['comp', 'match_key', 'note'], yb_my_marks: [],
      yb_save_submission: ['id', 'team_id', 'p'], yb_delete_submission: ['id'], yb_review_submission: ['id', 'decision', 'note'], yb_submissions_queue: [], yb_feature_submission: ['id', 'show'], yb_public_projects: [],
      yb_announce_save: ['id', 'title', 'body', 'audience', 'published'], yb_announce_delete: ['id'], yb_chat_list: [], yb_chat_post: ['body'], yb_chat_report: ['message_id', 'reason'],
      yb_chat_hide: ['message_id', 'hide'], yb_chat_resolve: ['message_id'], yb_chat_mute: ['message_id', 'hours', 'reason'], yb_chat_unmute: ['target'], yb_chat_mutes_list: [],
      yb_chat_purge: [], yb_chat_seen: ['last_id'], yb_chat_unread: [],
      yb_my_judging: [], yb_judge_score: ['team_id', 'criterion', 'points', 'reason'], yb_set_judge: ['target', 'axes'], yb_judges_list: [],
      yb_admin_score: ['team_id', 'axis', 'points', 'reason'], yb_results_board: [], yb_publish_results: ['publish'], yb_public_results: [], yb_my_scores: [],
      yb_my_prefs: [], yb_save_prefs: ['p'], yb_set_team_style: ['team_id', 'color', 'badge'], yb_feed: ['before', 'lim'], yb_post_save: ['id', 'body', 'photos'],
      yb_post_delete: ['id'], yb_post_moderate: ['id', 'action', 'note'], yb_react: ['post_id', 'kind'], yb_comments: ['post_id'], yb_comment_post: ['post_id', 'body'],
      yb_comment_delete: ['id'], yb_comment_report: ['id', 'reason'], yb_comment_moderate: ['id', 'action'], yb_comment_mute: ['id', 'hours', 'reason'], yb_feed_reports: [],
      yb_set_members_comment: ['allow'], yb_transfer_team: ['team_id', 'new_leader', 'old_stays', 'old_role'], yb_analytics: [] };
    if (!SIG[name]) return err(404, 'PGRST202', 'Could not find the function public.' + name);
    // 0011: optional arguments (SQL defaults)
    const DEF = { yb_feed: { before: null, lim: 15 }, yb_post_save: { photos: [] }, yb_post_moderate: { note: null }, yb_comment_report: { reason: null }, yb_comment_mute: { hours: null, reason: null }, yb_transfer_team: { old_role: 'parent' } };
    if (DEF[name]) body = { ...DEF[name], ...(body || {}) };
    if (name === 'yb_mark_read') {
      const ids = body && Array.isArray(body.ids) ? body.ids : null;
      let n = 0;
      this.notes.forEach(x => { if (x.user_id === me && !x.read_at && (!ids || ids.includes(x.id))) { x.read_at = this.now(); n++; } });
      return { status: 200, body: n };
    }
    if (name === 'yb_review_submission' && body && !('note' in body)) body = { ...body, note: null };   // the note is optional (default null)
    if (name === 'approve_team' ? !(body && 'team_id' in body && 'ok' in body && Object.keys(body).every(k => SIG[name].includes(k))) : !need(...SIG[name])) return err(404, 'PGRST202', 'Could not find the function public.' + name + ' in the schema cache');
    const cleanCode = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (name === 'my_team') {
      const out = [];
      this.teams.filter(t => t.leader_id === me).forEach(t => out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'leader', member_id: (this.members.find(m => m.team_id === t.id && m.is_leader) || {}).id || null, join_code: t.join_code, admin_note: t.admin_note }));
      this.members.filter(m => m.user_id === me).forEach(m => { const t = this.teams.find(x => x.id === m.team_id); if (t.leader_id !== me) out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'member', member_id: m.id, join_code: null, admin_note: null }); });
      this.links.filter(l => l.parent_id === me).forEach(l => { const m = this.members.find(x => x.id === l.member_id), t = this.teams.find(x => x.id === m.team_id); out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'parent', member_id: m.id, join_code: null, admin_note: null }); });
      return { status: 200, body: out };
    }
    if (name === 'join_team' || name === 'link_child') {
      const wantRole = name === 'join_team' ? 'member' : 'parent';
      if (c.role !== wantRole) return raise('wrong_role', '42501');
      const t = this.teams.find(x => x.join_code === cleanCode(body.code));
      if (!t) return raise('team_not_found');
      const nm = ARABIC_NORM(name === 'join_team' ? body.member_name : body.child_name);
      if (!nm) return raise('name_not_in_roster');
      const m = this.members.find(x => x.team_id === t.id && ARABIC_NORM(x.full_name) === nm);
      if (!m) return raise('name_not_in_roster');
      if (name === 'join_team') {
        if (m.user_id !== null) return raise('already_linked');
        if (this.members.some(x => x.user_id === me)) return raise('already_linked');
        m.user_id = me;
      } else {
        if (this.links.some(l => l.parent_id === me && l.member_id === m.id)) return raise('already_linked');
        this.links.push({ parent_id: me, member_id: m.id });
      }
      return { status: 200, body: { ok: true, team_id: t.id, member_id: m.id, team_name: t.name } };
    }
    if (name === 'approve_team') {
      if (!admin) return raise('permission_denied', '42501');
      if (body.ok === null || typeof body.ok !== 'boolean') return raise('invalid_argument');
      if (body.note && String(body.note).length > 500) return raise('invalid_argument');
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return raise('team_not_found');
      const from = t.status;
      t.status = body.ok ? 'approved' : 'rejected';
      t.admin_note = String(body.note || '').trim() || null;
      t.updated_at = this.now();
      this.statusChanged(t, from, me);
      return { status: 200, body: { ok: true, status: t.status } };
    }
    const officerOf = comp => c.role === 'officer' && this.officers.some(o => o.user_id === me && o.competition === comp);
    const canReview = admin || officerOf('registration');
    if (name === 'yb_review_team') {
      if (!canReview) return raise('permission_denied', '42501');
      const st = { approve: 'approved', return: 'returned', reject: 'rejected' }[body.decision];
      const nt = String(body.note || '').trim() || null;
      if (!st) return raise('invalid_argument');
      if (nt && nt.length > 500) return raise('invalid_argument');
      if (st === 'returned' && !nt) return raise('note_required');
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return raise('team_not_found');
      if (!admin && t.status !== 'submitted') return raise('invalid_status');
      const from = t.status;
      t.status = st; t.admin_note = nt; t.reviewed_at = this.now(); t.updated_at = this.now();
      this.statusChanged(t, from, me);
      return { status: 200, body: { ok: true, status: st } };
    }
    if (name === 'yb_review_list') {
      if (!canReview) return raise('permission_denied', '42501');
      const rank = { submitted: 0, returned: 1, draft: 2 };
      return { status: 200, body: this.teams.slice().sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)).map(t => {
        const ms = this.members.filter(m => m.team_id === t.id);
        return { team_id: t.id, team_name: t.name, area: t.area, status: t.status, admin_note: t.admin_note, members: ms.length, consents: ms.filter(m => m.consent_status === 'received').length, updated_at: t.updated_at, reviewed_at: t.reviewed_at || null,
          fee_status: t.fee_status || 'unpaid', fee_receipt: t.fee_receipt || null, ref_code: t.ref_code || null, online: !!t.reg, claimed: !!t.leader_id };
      }) };
    }
    /* migration 0010: judging */
    {
      const judged = id => { const t = this.teams.find(x => x.id === id); return !!t && t.status === 'approved' && !t.waitlist; };
      const AXOF = { hifz: 'hifz', fahm: 'fahm', roles: 'tatbiq', execution: 'tatbiq', documentation: 'tatbiq' };
      const CAP = { hifz: 10, fahm: 15, roles: 10, execution: 30, documentation: 5, football: 20, chess: 10 };
      const myAxes = () => (['parent', 'admin'].includes(c.role) && this.judges.get(me)) || [];
      const person = tid => { const t = this.teams.find(x => x.id === tid); return !!t && (t.leader_id === me || this.members.some(m => m.team_id === tid && m.user_id === me)
        || this.links.some(l => l.parent_id === me && (this.members.find(m => m.id === l.member_id) || {}).team_id === tid)); };
      if (name === 'yb_my_judging') {
        const ax = myAxes();
        if (!ax.length) return { status: 200, body: { axes: [] } };
        return { status: 200, body: { axes: ax, published: this.published, teams: this.teams.filter(t => judged(t.id)).sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ team_id: t.id, name: t.name, conflict: person(t.id),
          scores: Object.fromEntries(this.jscores.filter(s => s.team_id === t.id && s.judge_id === me).map(s => [s.criterion, { points: s.points, reason: s.reason }])) })) } };
      }
      if (name === 'yb_judge_score') {
        const ax = AXOF[body.criterion];
        if (!ax) return raise('invalid_argument');
        if (!myAxes().includes(ax)) return raise('permission_denied', '42501');
        if (this.published) return { status: 200, body: { ok: false, error: 'results_published' } };
        if (!judged(body.team_id)) return { status: 200, body: { ok: false, error: 'bad_team' } };
        if (person(body.team_id)) return { status: 200, body: { ok: false, error: 'conflict_of_interest' } };
        this.jscores = this.jscores.filter(s => !(s.team_id === body.team_id && s.judge_id === me && s.criterion === body.criterion));
        if (body.points === null) return { status: 200, body: { ok: true } };
        if (body.points < 0 || body.points > CAP[body.criterion]) return { status: 200, body: { ok: false, error: 'bad_points' } };
        const rs = String(body.reason || '').trim();
        if (rs.length < 3 || rs.length > 500) return { status: 200, body: { ok: false, error: 'reason_required' } };
        this.jscores.push({ team_id: body.team_id, judge_id: me, criterion: body.criterion, points: Math.round(body.points * 100) / 100, reason: rs, at: this.now() });
        return { status: 200, body: { ok: true } };
      }
      if (name === 'yb_public_results') return { status: 200, body: this.published ? this.totals().map(r => ({ team_name: r.team_name, hifz: r.hifz, fahm: r.fahm, tatbiq: r.tatbiq, football: r.football, chess: r.chess, total: r.total, rank: r.rank })) : [] };
      if (name === 'yb_my_scores') {
        if (!this.published) return { status: 200, body: { published: false, teams: [] } };
        return { status: 200, body: { published: true, teams: this.totals().filter(r => person(r.team_id)).map(r => ({ ...r,
          reasons: this.jscores.filter(s => s.team_id === r.team_id).map(s => ({ criterion: s.criterion, points: s.points, reason: s.reason })),
          admin: this.ascores.filter(s => s.team_id === r.team_id).map(s => ({ axis: s.axis, points: s.points, reason: s.reason })) })) } };
      }
      if (['yb_set_judge', 'yb_judges_list', 'yb_admin_score', 'yb_results_board', 'yb_publish_results'].includes(name)) {
        if (!admin) return raise('permission_denied', '42501');
        if (name === 'yb_set_judge') {
          const p = this.profiles.find(x => x.id === body.target);
          if (!p) return { status: 200, body: { ok: false, error: 'user_not_found' } };
          const ax = Array.isArray(body.axes) ? [...new Set(body.axes)].sort() : [];
          if (!ax.length) { this.judges.delete(p.id); return { status: 200, body: { ok: true, axes: [] } }; }
          if (!['parent', 'admin'].includes(p.role)) return { status: 200, body: { ok: false, error: 'judge_role' } };
          if (ax.some(a => !['hifz', 'fahm', 'tatbiq'].includes(a))) return raise('invalid_argument');
          this.judges.set(p.id, ax);
          this.notify([p.id], 'judge_assigned', { axes: ax });
          return { status: 200, body: { ok: true, axes: ax } };
        }
        if (name === 'yb_judges_list') return { status: 200, body: [...this.judges.entries()].map(([u, ax]) => { const p = this.profiles.find(x => x.id === u) || {}; return { user_id: u, full_name: p.full_name, role: p.role, axes: ax, scored: this.jscores.filter(s => s.judge_id === u).length }; }) };
        if (name === 'yb_admin_score') {
          if (!['football', 'chess'].includes(body.axis)) return raise('invalid_argument');
          if (this.published) return { status: 200, body: { ok: false, error: 'results_published' } };
          if (!judged(body.team_id)) return { status: 200, body: { ok: false, error: 'bad_team' } };
          this.ascores = this.ascores.filter(s => !(s.team_id === body.team_id && s.axis === body.axis));
          if (body.points === null) return { status: 200, body: { ok: true } };
          if (body.points < 0 || body.points > CAP[body.axis]) return { status: 200, body: { ok: false, error: 'bad_points' } };
          const rs = String(body.reason || '').trim();
          if (rs.length < 3) return { status: 200, body: { ok: false, error: 'reason_required' } };
          this.ascores.push({ team_id: body.team_id, axis: body.axis, points: body.points, reason: rs });
          return { status: 200, body: { ok: true } };
        }
        if (name === 'yb_results_board') return { status: 200, body: { published: this.published, teams: this.totals(),
          scores: this.jscores.map(s => ({ team_id: s.team_id, judge: (this.profiles.find(p => p.id === s.judge_id) || {}).full_name, criterion: s.criterion, points: s.points, reason: s.reason, at: s.at })),
          admin: this.ascores.map(s => ({ ...s })) } };
        if (name === 'yb_publish_results') {
          const was = this.published;
          this.published = !!body.publish;
          if (this.published && !was) this.notify(this.profiles.filter(p => p.id !== me).map(p => p.id), 'results_published', {});
          return { status: 200, body: { ok: true, published: this.published } };
        }
      }
    }
    /* migration 0009: announcements and the leaders room */
    if (name === 'yb_announce_save' || name === 'yb_announce_delete') {
      if (!admin) return raise('permission_denied', '42501');
      if (name === 'yb_announce_delete') {
        const i = this.ann.findIndex(a => a.id === body.id);
        if (i < 0) return { status: 200, body: { ok: false, error: 'not_found' } };
        this.ann.splice(i, 1);
        return { status: 200, body: { ok: true } };
      }
      const title = String(body.title || '').trim(), text = String(body.body || '').trim();
      if (title.length < 2 || title.length > 80 || text.length < 2 || text.length > 600 || !['all', 'leaders', 'members', 'parents'].includes(body.audience)) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      let a = body.id ? this.ann.find(x => x.id === body.id) : null;
      if (body.id && !a) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (!a) { a = { id: ++this.annSeq, created_at: this.now(), published_at: null, notified: false }; this.ann.push(a); }
      Object.assign(a, { title, body: text, audience: body.audience, published: !!body.published, updated_at: this.now() });
      if (a.published && !a.published_at) a.published_at = this.now();
      if (a.published && !a.notified) {
        const want = { leaders: 'leader', members: 'member', parents: 'parent' }[a.audience];
        this.notify(this.profiles.filter(p => p.id !== me && (a.audience === 'all' || p.role === want || ['officer', 'admin'].includes(p.role))).map(p => p.id), 'announcement', { id: a.id, title: a.title, audience: a.audience });
        a.notified = true;
      }
      return { status: 200, body: { ok: true, id: a.id } };
    }
    if (name.startsWith('yb_chat_')) {
      const inRoom = ['leader', 'officer', 'admin'].includes(c.role);
      if (name === 'yb_chat_unread') {
        if (!inRoom) return { status: 200, body: 0 };
        const seen = this.reads.get(me) || 0;
        return { status: 200, body: this.chat.filter(m => m.id > seen && m.author !== me && !m.hidden).length };
      }
      if (!inRoom) return raise('permission_denied', '42501');
      const muted = u => { const m = this.mutes.get(u); return !!m && (m.until === null || m.until > Date.now()); };
      const msgOf = id => this.chat.find(m => m.id === id);
      if (name === 'yb_chat_list') return { status: 200, body: this.chat.slice(-80).map(m => ({ id: m.id, author_name: m.author_name, author_role: m.author_role, mine: m.author === me,
        body: m.hidden && !admin ? null : m.body, hidden: m.hidden, created_at: m.created_at, reported: this.reports.some(r => r.message_id === m.id && r.reporter === me),
        reports: admin ? this.reports.filter(r => r.message_id === m.id && !r.resolved).length : 0, author_muted: admin ? muted(m.author) : false })) };
      if (name === 'yb_chat_seen') { this.reads.set(me, Math.max(this.reads.get(me) || 0, body.last_id || 0)); return { status: 200, body: null }; }
      if (name === 'yb_chat_post') {
        const b = String(body.body || '').trim();
        if (!b || b.length > 500) return { status: 200, body: { ok: false, error: 'invalid_data' } };
        if (muted(me)) return { status: 200, body: { ok: false, error: 'chat_muted' } };
        const dg = b.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[\s()+-]/g, '');
        if (/[0-9]{7,}/.test(dg) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(b)) return { status: 200, body: { ok: false, error: 'contact_not_allowed' } };
        const lastMine = [...this.chat].reverse().find(m => m.author === me);
        if (lastMine && Date.now() - lastMine.t < 3000) return { status: 200, body: { ok: false, error: 'too_fast' } };
        const p = this.profiles.find(x => x.id === me);
        const m = { id: ++this.chatSeq, author: me, author_name: p.full_name || '-', author_role: p.role, body: b, created_at: this.now(), t: Date.now(), hidden: false };
        this.chat.push(m);
        this.reads.set(me, m.id);
        return { status: 200, body: { ok: true, id: m.id } };
      }
      if (name === 'yb_chat_report') {
        const m = msgOf(body.message_id);
        if (!m) return { status: 200, body: { ok: false, error: 'not_found' } };
        if (m.author === me) return { status: 200, body: { ok: false, error: 'invalid_argument' } };
        const first = !this.reports.some(r => r.message_id === m.id && !r.resolved);
        if (!this.reports.some(r => r.message_id === m.id && r.reporter === me)) this.reports.push({ message_id: m.id, reporter: me, resolved: false });
        if (first) this.notify(this.profiles.filter(p => p.role === 'admin').map(p => p.id), 'chat_report', { message_id: m.id });
        return { status: 200, body: { ok: true } };
      }
      if (!admin) return raise('permission_denied', '42501');
      if (name === 'yb_chat_hide') {
        const m = msgOf(body.message_id);
        if (!m) return { status: 200, body: { ok: false, error: 'not_found' } };
        m.hidden = !!body.hide; this.reports.filter(r => r.message_id === m.id).forEach(r => { r.resolved = true; });
        return { status: 200, body: { ok: true } };
      }
      if (name === 'yb_chat_resolve') { this.reports.filter(r => r.message_id === body.message_id).forEach(r => { r.resolved = true; }); return { status: 200, body: { ok: true } }; }
      if (name === 'yb_chat_mute') {
        const m = msgOf(body.message_id);
        if (!m) return { status: 200, body: { ok: false, error: 'not_found' } };
        this.mutes.set(m.author, { until: body.hours === null ? null : Date.now() + body.hours * 36e5, untilIso: body.hours === null ? null : new Date(Date.now() + body.hours * 36e5).toISOString() });
        this.notify([m.author], 'chat_muted', { hours: body.hours });
        return { status: 200, body: { ok: true } };
      }
      if (name === 'yb_chat_unmute') { const had = this.mutes.delete(body.target); return { status: 200, body: had ? { ok: true } : { ok: false, error: 'not_found' } }; }
      if (name === 'yb_chat_mutes_list') return { status: 200, body: [...this.mutes.entries()].filter(([, v]) => v.until === null || v.until > Date.now())
        .map(([u, v]) => { const p = this.profiles.find(x => x.id === u) || {}; return { user_id: u, full_name: p.full_name, role: p.role, until: v.untilIso, reason: null }; }) };
      if (name === 'yb_chat_purge') return { status: 200, body: 0 };
    }
    /* migration 0008: projects and initiatives */
    if (name === 'yb_save_submission') {
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t || t.leader_id !== me) return raise('permission_denied', '42501');
      if (t.status !== 'approved') return { status: 200, body: { ok: false, error: 'team_not_approved' } };
      const p = body.p || {};
      let x = this.subs.find(s => s.id === body.id);
      if (x && x.team_id !== t.id) return raise('permission_denied', '42501');
      if (x && !['submitted', 'returned'].includes(x.status)) return { status: 200, body: { ok: false, error: 'invalid_status' } };
      if (!x && this.subs.filter(s => s.team_id === t.id).length >= 12) return { status: 200, body: { ok: false, error: 'too_many' } };
      const photos = Array.isArray(p.photos) ? p.photos : [];
      if (photos.length > 6) return { status: 200, body: { ok: false, error: 'too_many_photos' } };
      if (photos.some(ph => !ph.startsWith(`${t.id}/${body.id}/`) || !this.objects.has(ph))) return { status: 200, body: { ok: false, error: 'bad_photo' } };
      if (p.done_on && (p.done_on < '2026-11-01' || p.done_on > new Date(Date.now() + 864e5).toISOString().slice(0, 10))) return { status: 200, body: { ok: false, error: 'bad_date' } };
      const title = String(p.title || '').trim(), summary = String(p.summary || '').trim();
      if (!['project', 'activity'].includes(p.kind) || !['family', 'neighborhood', 'school'].includes(p.place) || title.length < 3 || title.length > 120 || summary.length < 10
        || (p.members_n !== null && p.members_n !== undefined && (p.members_n < 0 || p.members_n > 7))) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      const row = { id: body.id, team_id: t.id, kind: p.kind, title, value_text: p.value_text || null, place: p.place, done_on: p.done_on || null, summary, results: p.results || null,
        members_n: p.members_n ?? null, beneficiaries: p.beneficiaries ?? null, photos: [...photos], status: 'submitted', review_note: x ? x.review_note : null, submitted_by: me, created_at: x ? x.created_at : this.now(), updated_at: this.now(), featured: false, featured_at: null };
      if (x) Object.assign(x, row); else this.subs.push(row);
      this.notify([...this.profiles.filter(q => q.role === 'admin').map(q => q.id), ...this.officers.filter(o => o.competition === 'projects').map(o => o.user_id)], 'submission_new', { team_id: t.id, team_name: t.name, title: title.slice(0, 80) });
      return { status: 200, body: { ok: true, id: body.id, status: 'submitted' } };
    }
    if (name === 'yb_delete_submission') {
      const x = this.subs.find(s => s.id === body.id);
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      const t = this.teams.find(q => q.id === x.team_id);
      if (!admin && (!t || t.leader_id !== me)) return raise('permission_denied', '42501');
      if (!admin && !['submitted', 'returned'].includes(x.status)) return { status: 200, body: { ok: false, error: 'invalid_status' } };
      this.subs.splice(this.subs.indexOf(x), 1);
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_submissions_queue') {
      if (!this.subStaff(c)) return raise('permission_denied', '42501');
      const rank = { submitted: 0, returned: 1 };
      return { status: 200, body: this.subs.map(x => ({ ...x, team_name: (this.teams.find(t => t.id === x.team_id) || {}).name })).sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2)) };
    }
    /* migration 0012: players looking for a team, the leaders' pool, invites, transfers */
    if (/^yb_(seek_|invite_|guardian_seekers|set_transfers)/.test(name)) {
      const me = c.uid, P = id => this.profiles.find(p => p.id === id) || {};
      if (!me) return raise('not_authenticated', '42501');
      const first = id => String(P(id).full_name || '').trim().split(/\s+/)[0] || null;
      const teamOf = u => (this.members.find(m => m.user_id === u) || {}).team_id || null;
      const gOk = s => s && (s.age_group === 'adult' || !!s.guardian_by || this.members.some(m => m.user_id === s.user_id && m.consent_status === 'received'));
      const ok = d => ({ status: 200, body: d });
      const led = () => this.teams.filter(t => t.leader_id === me).slice(-1)[0] || null;
      const me2 = () => {
        const s = this.seekers.get(me);
        return { ok: true, can_seek: P(me).role === 'member', in_team: !!teamOf(me), transfers_open: this.transfers,
          seeker: s ? { age_group: s.age_group, area: s.area, positions: s.positions, active: s.active, guardian_ok: gOk(s), guardian_code: gOk(s) ? null : s.guardian_code,
            listed: s.active && gOk(s) && (!teamOf(me) || this.transfers) } : null,
          invites: this.invites.filter(i => i.seeker === me).map(i => { const t = this.teams.find(x => x.id === i.team_id); return { id: i.id, team_name: t.name, team_area: t.area, leader: first(t.leader_id), status: i.status, player_ok: i.player_ok, guardian_ok: i.guardian_ok }; }) };
      };
      if (name === 'yb_seek_me') return ok(me2());
      if (name === 'yb_seek_save') {
        if (P(me).role !== 'member') return ok({ ok: false, error: 'members_only' });
        const p = body.p || {};
        if (!['u10', 'u13', 'u16', 'u18', 'adult'].includes(p.age_group)) return ok({ ok: false, error: 'invalid_data' });
        if (p.area && /\d{7,}|@/.test(String(p.area).replace(/[\s-]/g, ''))) return ok({ ok: false, error: 'contact_not_allowed' });
        const s = this.seekers.get(me) || { user_id: me, guardian_by: null, guardian_code: null };
        Object.assign(s, { age_group: p.age_group, area: p.area || null, positions: p.positions || [], active: true, updated: ++this.tick });
        if (s.age_group !== 'adult' && !s.guardian_by && !s.guardian_code) s.guardian_code = 'K7M2Q' + (this.seekers.size + 2);
        this.seekers.set(me, s);
        return ok(me2());
      }
      if (name === 'yb_seek_stop') { this.invites.filter(i => i.seeker === me && i.status === 'pending').forEach(i => { i.status = 'cancelled'; }); this.seekers.delete(me); return ok({ ok: true }); }
      if (name === 'yb_seek_guardian') {
        if (P(me).role !== 'parent') return ok({ ok: false, error: 'parents_only' });
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const s = [...this.seekers.values()].find(x => x.guardian_code && x.guardian_code === code);
        if (!s) return ok({ ok: false, error: 'code_not_found' });
        Object.assign(s, { guardian_by: me, guardian_code: null });
        this.notify([s.user_id], 'seek_approved', {});
        return ok({ ok: true, first_name: first(s.user_id) });
      }
      if (name === 'yb_guardian_seekers') return ok([...this.seekers.values()].filter(s => s.guardian_by === me).map(s => ({ seeker: s.user_id, first_name: first(s.user_id), age_group: s.age_group, active: s.active,
        invites: this.invites.filter(i => i.seeker === s.user_id).map(i => ({ id: i.id, team_name: this.teams.find(t => t.id === i.team_id).name, status: i.status, player_ok: i.player_ok, guardian_ok: i.guardian_ok })) })));
      if (name === 'yb_seek_guardian_revoke') {
        const s = this.seekers.get(body.seeker);
        if (!s || s.guardian_by !== me) return raise('permission_denied', '42501');
        this.invites.filter(i => i.seeker === s.user_id && i.status === 'pending').forEach(i => { i.status = 'cancelled'; });
        Object.assign(s, { guardian_by: null, active: false });
        return ok({ ok: true });
      }
      if (name === 'yb_seek_pool') {
        const t = led();
        if (!t || !['submitted', 'returned', 'approved'].includes(t.status)) return raise('permission_denied', '42501');
        const n = this.members.filter(m => m.team_id === t.id).length;
        return ok({ ok: true, team_status: t.status, room: Math.max(0, 7 - n), can_invite: ['submitted', 'returned'].includes(t.status) && n < 7, transfers_open: this.transfers,
          players: [...this.seekers.values()].filter(s => s.active && gOk(s) && P(s.user_id).role === 'member' && (!teamOf(s.user_id) || (this.transfers && teamOf(s.user_id) !== t.id)))
            .sort((a, b) => b.updated - a.updated).map(s => { const inv = this.invites.find(i => i.team_id === t.id && i.seeker === s.user_id && i.status === 'pending');
              const st = this.stats && this.stats[s.user_id] || {};
              return { id: s.user_id, first_name: first(s.user_id), age_group: s.age_group, area: s.area, positions: s.positions, on_team: !!teamOf(s.user_id), invited: !!inv, invite_id: inv ? inv.id : null,
                goals: st.goals || 0, wins: st.wins || 0, spirit: st.spirit || 0 }; }) });
      }
      if (name === 'yb_invite_send') {
        const t = led();
        if (!t || !['submitted', 'returned', 'approved'].includes(t.status)) return raise('permission_denied', '42501');
        if (t.status === 'approved') return ok({ ok: false, error: 'roster_locked' });
        const s = this.seekers.get(body.seeker);
        if (!s || !s.active || !gOk(s)) return ok({ ok: false, error: 'not_listed' });
        if (this.members.filter(m => m.team_id === t.id).length >= 7) return ok({ ok: false, error: 'team_full' });
        if (this.invites.some(i => i.team_id === t.id && i.seeker === s.user_id && i.status === 'pending')) return ok({ ok: false, error: 'already_invited' });
        this.invites.push({ id: this.uid(), team_id: t.id, seeker: s.user_id, status: 'pending', player_ok: false, guardian_ok: false });
        this.notify([s.user_id, s.guardian_by], 'invite_new', { team_name: t.name });
        return ok({ ok: true });
      }
      if (name === 'yb_invite_cancel') {
        const i = this.invites.find(x => x.id === body.id), t = led();
        if (!i || !t || i.team_id !== t.id) return raise('permission_denied', '42501');
        i.status = 'cancelled';
        return ok({ ok: true });
      }
      if (name === 'yb_invite_answer') {
        const i = this.invites.find(x => x.id === body.id);
        const s = i && this.seekers.get(i.seeker);
        const who = !i ? null : me === i.seeker ? 'player' : s && s.guardian_by === me ? 'guardian' : null;
        if (!who) return raise('permission_denied', '42501');
        if (i.status !== 'pending') return ok({ ok: false, error: 'not_pending' });
        const t = this.teams.find(x => x.id === i.team_id);
        if (!body.accept) { i.status = 'declined'; this.notify([t.leader_id], 'invite_answer', { accepted: false, first_name: first(i.seeker), team_name: t.name }); return ok({ ok: true, status: 'declined' }); }
        if (who === 'player') i.player_ok = true; else i.guardian_ok = true;
        const needG = s.age_group !== 'adult' && !!s.guardian_by;
        if (!i.player_ok || (needG && !i.guardian_ok)) { this.notify([i.player_ok ? s.guardian_by : i.seeker], 'invite_waiting', { team_name: t.name }); return ok({ ok: true, status: 'pending', waiting: i.player_ok ? 'guardian' : 'player' }); }
        this.members.push({ id: this.uid(), team_id: t.id, full_name: P(i.seeker).full_name, age: null, guardian_name: null, guardian_phone: null, is_leader: false, user_id: i.seeker, consent_status: 'pending', consent_at: null, created_at: this.now(), roles: [] });
        i.status = 'accepted'; s.active = false;
        this.notify([t.leader_id], 'invite_answer', { accepted: true, first_name: first(i.seeker), team_name: t.name });
        return ok({ ok: true, status: 'accepted', team_name: t.name });
      }
      if (name === 'yb_set_transfers') { if (c.role !== 'admin') return raise('permission_denied', '42501'); this.transfers = !!body.allow; return ok({ ok: true, open: this.transfers }); }
      if (name === 'yb_seek_stats') {
        if (c.role !== 'admin') return raise('permission_denied', '42501');
        const act = [...this.seekers.values()].filter(s => s.active);
        return ok({ transfers_open: this.transfers, seekers: act.length, listed: act.filter(gOk).length, waiting_guardian: act.filter(s => !gOk(s)).length,
          invites_open: this.invites.filter(i => i.status === 'pending').length, joined: this.invites.filter(i => i.status === 'accepted').length });
      }
    }
    /* migration 0014: who leads the team, the assistant's title, the team's logo */
    if (name === 'yb_team_staff' || name === 'yb_set_assistant' || name === 'yb_set_team_logo') {
      const ok = d => ({ status: 200, body: d });
      const t = this.teams.find(x => x.id === body.team_id), role = (this.profiles.find(p => p.id === me) || {}).role;
      const ms = t ? this.members.filter(m => m.team_id === t.id) : [];
      const isLeader = !!t && t.leader_id === me, staff = role === 'admin' || role === 'officer';
      if (name === 'yb_team_staff') {
        const inside = staff || isLeader || ms.some(m => m.user_id === me);
        const parentOnly = !inside && this.links.some(l => l.parent_id === me && ms.some(m => m.id === l.member_id));
        if (!t || !(inside || parentOnly)) return raise('permission_denied', '42501');
        const nm = k => { const m = ms.find(x => (x.roles || []).includes(k)); return m ? (parentOnly ? m.full_name.trim().split(/\s+/)[0] : m.full_name) : null; };
        const lp = this.profiles.find(p => p.id === t.leader_id), lr = ms.find(m => m.is_leader);
        return ok({ leader: (lp && lp.full_name) || (lr && lr.full_name) || null, assistant: nm('assistant'), coord: nm('coord'), members: ms.length, can_edit: role === 'admin' || isLeader });
      }
      if (name === 'yb_set_assistant') {
        if (!t || !(role === 'admin' || isLeader)) return raise('permission_denied', '42501');
        const m = body.member_id ? ms.find(x => x.id === body.member_id) : null;
        if (body.member_id && !m) return ok({ ok: false, error: 'member_not_found' });
        if (m && m.is_leader) return ok({ ok: false, error: 'leader_is_leader' });
        ms.forEach(x => { x.roles = (x.roles || []).filter(k => k !== 'assistant'); });
        if (m) m.roles = (m.roles || []).concat('assistant');
        return ok({ ok: true });
      }
      if (!t || !(role === 'admin' || isLeader)) return raise('permission_denied', '42501');
      if (body.path && !(body.path.startsWith(t.id + '/') && this.logos.has(body.path))) return ok({ ok: false, error: 'invalid_data' });
      this.tstyle.set(t.id, { color: 'teal', badge: 'star', ...(this.tstyle.get(t.id) || {}), team_id: t.id, logo_path: body.path || null });
      return ok({ ok: true });
    }
    /* migration 0013: phone notifications (a child needs a parent's consent on record) */
    if (/^yb_push_/.test(name)) {
      const ok = d => ({ status: 200, body: d });
      const P = this.profiles.find(p => p.id === me) || {};
      const allowed = P.role !== 'member' || this.members.some(m => m.user_id === me && m.consent_status === 'received') || !!((this.seekers.get(me) || {}).guardian_by);
      const mine = () => this.pushSubs.filter(x => x.user_id === me);
      if (name === 'yb_push_key') return ok(this.pushReady ? this.pushKey : null);
      if (name === 'yb_push_mine') return ok({ allowed, phones: mine().length, this_phone: !!body.endpoint && mine().some(x => x.endpoint === body.endpoint), ready: this.pushReady });
      if (name === 'yb_push_unsubscribe') { this.pushSubs = this.pushSubs.filter(x => !(x.user_id === me && x.endpoint === body.endpoint)); return ok({ ok: true }); }
      if (name === 'yb_push_subscribe') {
        if (!allowed) return ok({ ok: false, error: 'consent_needed' });
        const sub = body.sub || {}, ep = String(sub.endpoint || ''), k = sub.keys || {};
        if (!/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//.test(ep)) return ok({ ok: false, error: 'push_service_not_allowed' });
        if (!/^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(k.auth || '')) return ok({ ok: false, error: 'invalid_data' });
        this.pushSubs = this.pushSubs.filter(x => x.endpoint !== ep).concat({ user_id: me, endpoint: ep, p256dh: k.p256dh, auth: k.auth });
        return ok({ ok: true, phones: mine().length });
      }
    }
    /* migration 0011: settings, team identity, the feed, the handover, the statistics */
    const prof = id => this.profiles.find(p => p.id === id) || {};
    const isAdult = id => ['leader', 'parent', 'officer', 'admin'].includes(prof(id).role);
    const dname = id => { const p = prof(id); return p.role === 'member' ? String(p.full_name || '').trim().split(/\s+/)[0] : (p.full_name || ''); };
    const myPrefs = () => ({ avatar_path: null, theme: 'auto', accent: 'teal', text_size: 'm', hidden_sections: [], notify_off: [], ...(this.prefs.get(me) || {}), can_avatar: isAdult(me) });
    const postJson = x => {
      const st = this.tstyle.get(x.team_id) || {}, rx = {};
      x.reactions.forEach(r => { rx[r.kind] = (rx[r.kind] || 0) + 1; });
      return { id: x.id, body: x.body, photos: [...x.photos], status: x.status, pinned: x.pinned, review_note: x.author === me || admin ? x.review_note : null,
        created_at: x.created_at, published_at: x.published_at, at: x.published_at || x.created_at, mine: x.author === me, author_name: dname(x.author), author_role: x.author_role,
        author_avatar: null, team_id: x.team_id, team_name: (this.teams.find(t => t.id === x.team_id) || {}).name || null, team_color: st.color || null, team_badge: st.badge || null,
        reactions: rx, my_reaction: (x.reactions.find(r => r.user_id === me) || {}).kind || null, comments: this.cmts.filter(cm => cm.post_id === x.id && (!cm.hidden || admin)).length };
    };
    const postOf = id => this.posts.find(x => x.id === id);
    const cmtMuted = u => { const m = this.mutes.get(u); return !!m && (m.until === null || m.until > Date.now()); };
    const canComment = () => ['leader', 'parent', 'officer', 'admin'].includes(c.role) || (c.role === 'member' && this.membersComment);
    if (name === 'yb_my_prefs') return { status: 200, body: myPrefs() };
    if (name === 'yb_save_prefs') {
      const p = body.p && typeof body.p === 'object' ? body.p : null;
      if (!p) return raise('invalid_argument');
      if ('avatar' in p && p.avatar && !isAdult(me)) return { status: 200, body: { ok: false, error: 'avatar_adults_only' } };
      const ok = (!('theme' in p) || ['auto', 'light', 'dark'].includes(p.theme)) && (!('accent' in p) || ['teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink'].includes(p.accent))
        && (!('text_size' in p) || ['m', 'l', 'xl'].includes(p.text_size)) && (!('notify_off' in p) || (Array.isArray(p.notify_off) && p.notify_off.every(k => ['matches', 'projects', 'announcements', 'feed'].includes(k))))
        && (!('hidden_sections' in p) || Array.isArray(p.hidden_sections));
      if (!ok) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      const cur = this.prefs.get(me) || {};
      ['theme', 'accent', 'text_size', 'hidden_sections', 'notify_off'].forEach(k => { if (k in p) cur[k] = p[k]; });
      if ('avatar' in p) cur.avatar_path = p.avatar || null;
      this.prefs.set(me, cur);
      return { status: 200, body: { ok: true, prefs: myPrefs() } };
    }
    if (name === 'yb_set_team_style') {
      if (!(admin || this.teams.some(t => t.id === body.team_id && t.leader_id === me))) return raise('permission_denied', '42501');
      if (!['teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink'].includes(body.color) || !['star', 'moon', 'sun', 'leaf', 'book', 'ball', 'chess', 'bolt', 'heart', 'shield'].includes(body.badge)) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      this.tstyle.set(body.team_id, { ...(this.tstyle.get(body.team_id) || {}), team_id: body.team_id, color: body.color, badge: body.badge });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_feed') {
      const vis = this.posts.filter(x => x.status === 'published' || x.author === me || (admin && x.status === 'hidden'))
        .filter(x => !body.before || (!x.pinned && (x.published_at || x.created_at) < body.before))
        .sort((a, b) => ((b.pinned && !body.before) - (a.pinned && !body.before)) || (b.published_at || b.created_at).localeCompare(a.published_at || a.created_at));
      return { status: 200, body: { posts: vis.slice(0, body.lim || 15).map(postJson),
        can_post: admin || (c.role === 'leader' && this.teams.some(t => t.leader_id === me)), can_comment: canComment(), admin, members_comment: this.membersComment,
        queue: admin && !body.before ? this.posts.filter(x => x.status === 'pending').map(postJson) : null,
        reports: admin ? new Set(this.creports.filter(r => !r.resolved).map(r => r.comment_id)).size : null } };
    }
    if (name === 'yb_post_save') {
      if (!['leader', 'admin'].includes(c.role)) return raise('permission_denied', '42501');
      const x = postOf(body.id);
      if (x && x.author !== me && !admin) return raise('permission_denied', '42501');
      const tid = c.role === 'leader' ? (this.teams.find(t => t.leader_id === me) || {}).id : null;
      if (c.role === 'leader' && !tid) return { status: 200, body: { ok: false, error: 'no_team' } };
      const b = String(body.body || '').trim();
      if (!b || b.length > 1500) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      const st = admin ? (x ? x.status : 'published') : 'pending';
      if (x) Object.assign(x, { body: b, photos: [...(body.photos || [])], status: st, pinned: x.pinned && st === 'published', review_note: st === 'pending' ? null : x.review_note });
      else this.posts.push({ id: body.id, author: me, author_role: c.role, team_id: tid, body: b, photos: [...(body.photos || [])], status: st, review_note: null, pinned: false,
        created_at: this.now(), published_at: st === 'published' ? this.now() : null, reactions: [] });
      if (st === 'pending') this.notify(this.profiles.filter(p => p.role === 'admin').map(p => p.id), 'post_pending', { post_id: body.id, team_name: (this.teams.find(t => t.id === tid) || {}).name, snippet: b.slice(0, 60) });
      return { status: 200, body: { ok: true, id: body.id, status: st } };
    }
    if (name === 'yb_post_delete') {
      const x = postOf(body.id);
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (x.author !== me && !admin) return raise('permission_denied', '42501');
      this.posts.splice(this.posts.indexOf(x), 1);
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_post_moderate') {
      if (!admin) return raise('permission_denied', '42501');
      const x = postOf(body.id), a = body.action;
      if (!['publish', 'reject', 'pin', 'unpin', 'hide', 'show'].includes(a)) return raise('invalid_argument');
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      const okSt = { publish: ['pending', 'rejected'], reject: ['pending'], pin: ['published'], unpin: ['published'], hide: ['published'], show: ['hidden'] }[a];
      if (!okSt.includes(x.status)) return { status: 200, body: { ok: false, error: 'invalid_status' } };
      if (a === 'publish') Object.assign(x, { status: 'published', published_at: x.published_at || this.now(), review_note: null });
      if (a === 'reject') Object.assign(x, { status: 'rejected', review_note: body.note || null });
      if (a === 'pin' || a === 'unpin') x.pinned = a === 'pin';
      if (a === 'hide') Object.assign(x, { status: 'hidden', pinned: false });
      if (a === 'show') x.status = 'published';
      if (['publish', 'reject', 'hide'].includes(a) && x.author !== me) this.notify([x.author], 'post_reviewed', { post_id: x.id, action: a, note: body.note || null, snippet: x.body.slice(0, 60) });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_react') {
      const x = postOf(body.post_id);
      if (!x || x.status !== 'published') return { status: 200, body: { ok: false, error: 'not_found' } };
      if (body.kind !== null && !['clap', 'heart', 'dua', 'strong'].includes(body.kind)) return raise('invalid_argument');
      x.reactions = x.reactions.filter(r => r.user_id !== me);
      if (body.kind) x.reactions.push({ user_id: me, kind: body.kind, at: this.now() });
      const j = postJson(x);
      return { status: 200, body: { ok: true, reactions: j.reactions, mine: j.my_reaction } };
    }
    if (name === 'yb_comments') {
      const x = postOf(body.post_id);
      if (!x || !(x.status === 'published' || x.author === me || admin)) return raise('permission_denied', '42501');
      return { status: 200, body: this.cmts.filter(cm => cm.post_id === x.id).map(cm => ({ id: cm.id, body: cm.hidden && !admin ? null : cm.body, hidden: cm.hidden,
        author_name: dname(cm.author), author_role: prof(cm.author).role, author_avatar: null, mine: cm.author === me,
        reported: this.creports.some(r => r.comment_id === cm.id && r.reporter === me), reports: admin ? this.creports.filter(r => r.comment_id === cm.id && !r.resolved).length : 0,
        author_muted: admin ? cmtMuted(cm.author) : false, created_at: cm.created_at })) };
    }
    if (name === 'yb_comment_post') {
      if (!canComment()) return raise('permission_denied', '42501');
      const x = postOf(body.post_id);
      if (!x || x.status !== 'published') return { status: 200, body: { ok: false, error: 'not_found' } };
      const b = String(body.body || '').trim();
      if (!b || b.length > 500) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      if (cmtMuted(me)) return { status: 200, body: { ok: false, error: 'chat_muted' } };
      const dg = b.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[\s()+-]/g, '');
      if (/[0-9]{7,}/.test(dg) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(b)) return { status: 200, body: { ok: false, error: 'contact_not_allowed' } };
      const cm = { id: ++this.cmtSeq, post_id: x.id, author: me, body: b, hidden: false, created_at: this.now() };
      this.cmts.push(cm);
      if (x.author !== me) this.notify([x.author], 'comment_new', { post_id: x.id, by: dname(me), snippet: x.body.slice(0, 60) });
      return { status: 200, body: { ok: true, id: cm.id } };
    }
    if (['yb_comment_delete', 'yb_comment_report', 'yb_comment_moderate', 'yb_comment_mute'].includes(name)) {
      const cm = this.cmts.find(q => q.id === body.id);
      if (name !== 'yb_comment_report' && name !== 'yb_comment_delete' && !admin) return raise('permission_denied', '42501');
      if (!cm) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (name === 'yb_comment_delete') {
        if (cm.author !== me && !admin) return raise('permission_denied', '42501');
        this.cmts.splice(this.cmts.indexOf(cm), 1);
        return { status: 200, body: { ok: true } };
      }
      if (name === 'yb_comment_report') {
        if (cm.author === me) return { status: 200, body: { ok: false, error: 'invalid_argument' } };
        const first = !this.creports.some(r => r.comment_id === cm.id && !r.resolved);
        this.creports = this.creports.filter(r => !(r.comment_id === cm.id && r.reporter === me));
        this.creports.push({ comment_id: cm.id, reporter: me, reason: body.reason || null, resolved: false, at: this.now() });
        if (first) this.notify(this.profiles.filter(p => p.role === 'admin').map(p => p.id), 'comment_report', { comment_id: cm.id, post_id: cm.post_id });
        return { status: 200, body: { ok: true } };
      }
      if (name === 'yb_comment_moderate') {
        if (!['hide', 'show', 'keep'].includes(body.action)) return raise('invalid_argument');
        if (body.action !== 'keep') cm.hidden = body.action === 'hide';
        this.creports.forEach(r => { if (r.comment_id === cm.id) r.resolved = true; });
        return { status: 200, body: { ok: true } };
      }
      if (cm.author === me || prof(cm.author).role === 'admin') return { status: 200, body: { ok: false, error: 'invalid_argument' } };
      this.mutes.set(cm.author, { until: body.hours === null ? null : Date.now() + body.hours * 36e5, untilIso: null });
      this.notify([cm.author], 'chat_muted', { hours: body.hours, where: 'comments' });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_feed_reports') {
      if (!admin) return raise('permission_denied', '42501');
      const open = this.creports.filter(r => !r.resolved);
      return { status: 200, body: [...new Set(open.map(r => r.comment_id))].map(id => { const cm = this.cmts.find(q => q.id === id); const x = postOf(cm.post_id);
        const rs = open.filter(r => r.comment_id === id);
        return { comment_id: id, post_id: cm.post_id, body: cm.body, hidden: cm.hidden, author_name: dname(cm.author), post_snippet: x.body.slice(0, 80), reports: rs.length, reasons: rs.map(r => r.reason).filter(Boolean), last_at: rs[rs.length - 1].at }; }) };
    }
    if (name === 'yb_set_members_comment') {
      if (!admin) return raise('permission_denied', '42501');
      this.membersComment = !!body.allow;
      return { status: 200, body: { ok: true, allow: this.membersComment } };
    }
    if (name === 'yb_transfer_team') {
      if (!admin) return raise('permission_denied', '42501');
      if (!['parent', 'member'].includes(body.old_role)) return raise('invalid_argument');
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return { status: 200, body: { ok: false, error: 'not_found' } };
      const np = this.profiles.find(p => p.id === body.new_leader);
      if (!np) return { status: 200, body: { ok: false, error: 'user_not_found' } };
      if (['admin', 'officer'].includes(np.role)) return { status: 200, body: { ok: false, error: 'bad_new_leader' } };
      if (this.teams.some(x => x.leader_id === np.id)) return { status: 200, body: { ok: false, error: 'leads_other_team' } };
      if (this.members.some(m => m.user_id === np.id && m.team_id !== t.id)) return { status: 200, body: { ok: false, error: 'in_other_team' } };
      const oldm = this.members.find(m => m.team_id === t.id && m.is_leader), newm = this.members.find(m => m.team_id === t.id && m.user_id === np.id);
      if (!newm && (body.old_stays || !oldm) && this.members.filter(m => m.team_id === t.id).length >= 7) return { status: 200, body: { ok: false, error: 'team_full' } };
      if (oldm) { if (body.old_stays) oldm.is_leader = false; else this.members.splice(this.members.indexOf(oldm), 1); }
      if (newm) newm.is_leader = true;
      else this.members.push({ id: this.uid(), team_id: t.id, full_name: np.full_name || '-', age: null, guardian_name: null, guardian_phone: null, is_leader: true, user_id: np.id, consent_status: 'pending', consent_at: null, created_at: this.now(), roles: [] });
      const old = t.leader_id;
      t.leader_id = np.id; np.role = 'leader';
      const op = this.profiles.find(p => p.id === old);
      if (op && op.role === 'leader') op.role = body.old_stays ? 'member' : body.old_role;
      this.notify([np.id], 'team_leader_new', { team_id: t.id, team_name: t.name });
      if (old) this.notify([old], 'team_leader_left', { team_id: t.id, team_name: t.name, stays: !!body.old_stays });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_analytics') {
      if (!admin) return raise('permission_denied', '42501');
      const cnt = (arr, k) => arr.reduce((o, x) => { o[x[k]] = (o[x[k]] || 0) + 1; return o; }, {});
      const inComp = this.teams.filter(t => ['submitted', 'approved'].includes(t.status));
      const minor = m => m.age !== null && m.age < 18;
      const rx = {}; this.posts.forEach(x => x.reactions.forEach(r => { rx[r.kind] = (rx[r.kind] || 0) + 1; }));
      const day = d => String(d).slice(0, 10);
      const perDay = arr => Object.entries(cnt(arr.map(x => ({ d: day(x.created_at) })), 'd')).map(([d, n]) => ({ d, n }));
      return { status: 200, body: { generated_at: new Date().toISOString(),
        accounts: { by_role: cnt(this.profiles, 'role'), per_day: perDay(this.profiles) },
        teams: { by_status: cnt(this.teams, 'status'), waitlist: this.teams.filter(t => t.waitlist).length, fee: cnt(inComp.map(t => ({ f: t.fee_status || 'unpaid' })), 'f'), per_day: perDay(this.teams),
          list: inComp.map(t => { const ms = this.members.filter(m => m.team_id === t.id); return { name: t.name, status: t.status, fee: t.fee_status || 'unpaid', members: ms.length, minors: ms.filter(minor).length,
            consents: ms.filter(m => minor(m) && m.consent_status === 'received').length, joined: ms.filter(m => m.user_id).length }; }) },
        members: { total: this.members.length, minors: this.members.filter(minor).length, consents: this.members.filter(m => minor(m) && m.consent_status === 'received').length, joined: this.members.filter(m => m.user_id).length,
          ages: { u10: this.members.filter(m => m.age !== null && m.age < 10).length, a10: this.members.filter(m => m.age >= 10 && m.age <= 12).length, a13: this.members.filter(m => m.age >= 13 && m.age <= 15).length,
            a16: this.members.filter(m => m.age >= 16 && m.age <= 17).length, adult: this.members.filter(m => m.age >= 18).length, unknown: this.members.filter(m => m.age === null || m.age === undefined).length } },
        matches: {}, goals: { total: this.marks.filter(k => k.kind === 'goal').length, by_team: [], spirit: 0 },
        projects: { by_status: cnt(this.subs, 'status'), by_place: cnt(this.subs.filter(s => s.status === 'accepted'), 'place'), featured: this.subs.filter(s => s.featured).length, beneficiaries: 0 },
        feed: { by_status: cnt(this.posts, 'status'), reactions: rx, comments: this.cmts.length, reports_open: new Set(this.creports.filter(r => !r.resolved).map(r => r.comment_id)).size,
          per_day: Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10); return { d, posts: this.posts.filter(x => day(x.created_at) === d).length, comments: this.cmts.filter(x => day(x.created_at) === d).length, reactions: 0 }; }) },
        notes: { total: this.notes.length, read: this.notes.filter(n => n.read_at).length },
        judging: { judges: this.judges.size, scores: this.jscores.length, teams_scored: new Set(this.jscores.map(s => s.team_id)).size, published: this.published } } };
    }
    if (name === 'yb_feature_submission') {   // the admin picks accepted work for the home page
      if (!admin) return raise('permission_denied', '42501');
      const x = this.subs.find(s => s.id === body.id);
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (body.show && x.status !== 'accepted') return { status: 200, body: { ok: false, error: 'invalid_status' } };
      if (!!x.featured !== !!body.show) {
        Object.assign(x, { featured: !!body.show, featured_at: body.show ? this.now() : null });
        const t = this.teams.find(q => q.id === x.team_id);
        this.notify([t.leader_id, ...this.members.filter(m => m.team_id === t.id).map(m => m.user_id), ...this.links.filter(l => (this.members.find(m => m.id === l.member_id) || {}).team_id === t.id).map(l => l.parent_id)],
          'submission_featured', { team_id: t.id, title: x.title.slice(0, 80), show: !!body.show });
      }
      return { status: 200, body: { ok: true, featured: !!x.featured } };
    }
    if (name === 'yb_review_submission') {
      if (!this.subStaff(c)) return raise('permission_denied', '42501');
      const st = { accept: 'accepted', return: 'returned', reject: 'rejected' }[body.decision];
      if (!st) return raise('invalid_argument');
      const nt = body.note ? String(body.note).trim() : '';
      if (st === 'returned' && !nt) return raise('note_required');
      const x = this.subs.find(s => s.id === body.id);
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (x.status !== 'submitted' && !admin) return { status: 200, body: { ok: false, error: 'invalid_status' } };
      Object.assign(x, { status: st, review_note: nt || null, reviewed_by: me, updated_at: this.now(), featured: !!x.featured && st === 'accepted' });
      const t = this.teams.find(q => q.id === x.team_id);
      this.notify([t.leader_id, ...this.members.filter(m => m.team_id === t.id).map(m => m.user_id), ...this.links.filter(l => (this.members.find(m => m.id === l.member_id) || {}).team_id === t.id).map(l => l.parent_id)],
        'submission_reviewed', { team_id: t.id, title: x.title.slice(0, 80), status: st, note: nt || null });
      return { status: 200, body: { ok: true, status: st } };
    }
    /* migration 0007: live results, marks, approval */
    const canManage = comp => admin || officerOf(comp);
    const liveOf = (comp, key) => this.live.find(x => x.comp === comp && x.match_key === key);
    if (name === 'yb_results_queue') {
      if (!canManage('football') && !canManage('chess')) return raise('permission_denied', '42501');
      const rank = { final: 0, live: 1, returned: 2 };
      return { status: 200, body: this.live.filter(x => canManage(x.comp)).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)).map(x => ({ ...x,
        goals: this.marks.filter(k => k.comp === x.comp && k.match_key === x.match_key && k.kind === 'goal').length,
        spirit: this.marks.filter(k => k.comp === x.comp && k.match_key === x.match_key && k.kind === 'spirit').length })) };
    }
    if (name === 'yb_live_set') {
      if (!canManage(body.comp)) return raise('permission_denied', '42501');
      if (!['live', 'final'].includes(body.status)) return raise('invalid_argument');
      let x = liveOf(body.comp, body.match_key);
      if (x && x.status === 'approved') return { status: 200, body: { ok: false, error: 'already_approved' } };
      if (body.sa > 99 || body.sb > 99 || body.ra > body.ca || body.rb > body.cb) return { status: 200, body: { ok: false, error: 'bad_score' } };
      if (!x) { x = { comp: body.comp, match_key: body.match_key, a: body.a, b: body.b, started_at: null, approved_at: null }; this.live.push(x); }
      Object.assign(x, { sa: body.sa, sb: body.sb, ca: body.ca, cb: body.cb, ra: body.ra, rb: body.rb, status: body.status, note: body.note, return_note: null, updated_at: this.now() });
      if (body.start && !x.started_at) x.started_at = new Date(Date.now() - 5 * 60000).toISOString();
      if (body.status === 'final') this.profiles.filter(p => p.role === 'admin').forEach(p => this.notes.push({ id: ++this.noteSeq, user_id: p.id, kind: 'result_pending', data: { comp: body.comp, match_key: body.match_key, sa: body.sa, sb: body.sb, a_name: body.a_name, b_name: body.b_name }, read_at: null, created_at: this.now() }));
      return { status: 200, body: { ok: true, status: x.status, started_at: x.started_at } };
    }
    if (name === 'yb_mark_add') {
      if (!canManage(body.comp)) return raise('permission_denied', '42501');
      const x = liveOf(body.comp, body.match_key);
      if (!x) return { status: 200, body: { ok: false, error: 'match_not_started' } };
      if (x.status === 'approved' && !admin) return { status: 200, body: { ok: false, error: 'already_approved' } };
      if (body.team_id !== x.a && body.team_id !== x.b) return { status: 200, body: { ok: false, error: 'bad_team' } };
      if (body.member_id && !this.members.some(m => m.id === body.member_id && m.team_id === body.team_id)) return { status: 200, body: { ok: false, error: 'member_not_found' } };
      if (body.kind === 'spirit') this.marks = this.marks.filter(k => !(k.comp === body.comp && k.match_key === body.match_key && k.team_id === body.team_id && k.kind === 'spirit'));
      const id = ++this.markSeq;
      this.marks.push({ id, comp: body.comp, match_key: body.match_key, team_id: body.team_id, member_id: body.member_id || null, kind: body.kind, minute: body.minute });
      return { status: 200, body: { ok: true, id } };
    }
    if (name === 'yb_mark_del') {
      const k = this.marks.find(x => x.id === body.id);
      if (!k) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (!canManage(k.comp)) return raise('permission_denied', '42501');
      this.marks = this.marks.filter(x => x.id !== body.id);
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_match_roster') {
      if (!canManage(body.comp)) return raise('permission_denied', '42501');
      return { status: 200, body: this.members.filter(m => m.team_id === body.team_id).map(m => ({ member_id: m.id, full_name: m.full_name, roles: m.roles || [] })) };
    }
    if (name === 'yb_match_marks_of') {
      if (!canManage(body.comp)) return raise('permission_denied', '42501');
      return { status: 200, body: this.marks.filter(k => k.comp === body.comp && k.match_key === body.match_key).map(k => ({ ...k, full_name: (this.members.find(m => m.id === k.member_id) || {}).full_name || null })) };
    }
    if (name === 'yb_result_approve') {
      if (!admin) return raise('permission_denied', '42501');
      const x = liveOf(body.comp, body.match_key);
      if (!x) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (x.status !== 'final') return { status: 200, body: { ok: false, error: x.status === 'approved' ? 'already_approved' : 'not_final' } };
      if (this.tour && body.prev !== this.tour.updated_at) return { status: 200, body: { ok: false, conflict: true, updated_at: this.tour.updated_at } };
      this.tour = { id: 1, state: body.state, updated_at: this.now() };
      x.status = 'approved'; x.approved_at = this.now();
      return { status: 200, body: { ok: true, conflict: false, updated_at: this.tour.updated_at, approved: true } };
    }
    if (name === 'yb_result_return') {
      if (!admin) return raise('permission_denied', '42501');
      if (!String(body.note || '').trim()) return raise('note_required');
      const x = liveOf(body.comp, body.match_key);
      if (!x || x.status !== 'final') return { status: 200, body: { ok: false, error: 'not_final' } };
      x.status = 'returned'; x.return_note = body.note;
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_my_marks') {
      const mine = new Set(this.teams.filter(t => t.leader_id === me || this.members.some(m => m.team_id === t.id && m.user_id === me)).map(t => t.id));
      return { status: 200, body: this.marks.filter(k => mine.has(k.team_id)).map(k => ({ comp: k.comp, match_key: k.match_key, team_id: k.team_id, kind: k.kind, minute: k.minute,
        full_name: (this.members.find(m => m.id === k.member_id) || {}).full_name || null, status: (liveOf(k.comp, k.match_key) || {}).status })) };
    }
    /* migration 0006: roles and the reserve list */
    if (name === 'yb_set_roles') {
      const t = this.teams.find(x => x.id === body.team_id);
      const leaderEdit = t && t.leader_id === me && ['draft', 'submitted', 'returned'].includes(t.status);
      if (!t || !(canReview || leaderEdit)) return raise('permission_denied', '42501');
      const ids = ['reciter', 'reserve', 'chess', 'coord'].map(k => body[k]).filter(Boolean);
      if (ids.some(id => !this.members.some(m => m.id === id && m.team_id === t.id))) return { status: 200, body: { ok: false, error: 'member_not_found' } };
      if (body.reciter && body.reciter === body.reserve) return { status: 200, body: { ok: false, error: 'same_reciters' } };
      this.members.filter(m => m.team_id === t.id).forEach(m => { m.roles = ['reciter', 'reserve', 'chess', 'coord'].filter(k => body[k] === m.id).concat((m.roles || []).includes('assistant') ? ['assistant'] : []); });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_role_list') {
      let allowed = [];
      if (canReview) allowed = ['reciter', 'reserve', 'chess', 'coord'];
      else {
        if (officerOf('hifz') || officerOf('fahm')) allowed.push('reciter', 'reserve');
        if (officerOf('chess')) allowed.push('chess');
      }
      if (!allowed.length) return raise('permission_denied', '42501');
      const rows = [];
      this.teams.filter(t => t.status !== 'rejected' && t.waitlist === false).forEach(t => this.members.filter(m => m.team_id === t.id).forEach(m => {
        const r = (m.roles || []).filter(k => allowed.includes(k));
        if (r.length) rows.push({ team_id: t.id, team_name: t.name, team_status: t.status, member_id: m.id, full_name: m.full_name, roles: r });
      }));
      return { status: 200, body: rows };
    }
    if (name === 'yb_set_waitlist') {
      if (!admin) return raise('permission_denied', '42501');
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return raise('team_not_found');
      if (t.waitlist !== true && t.waitlist !== false) return raise('invalid_status');
      t.waitlist = !!body.waiting; t.waitlist_at = body.waiting ? this.now() : null;
      return { status: 200, body: { ok: true, changed: true } };
    }
    /* migration 0005: checklist, claim, fee, registration details */
    if (name === 'yb_team_checklist') {
      const t = this.teams.find(x => x.id === body.team_id);
      const mineT = t && (t.leader_id === me || this.members.some(m => m.team_id === t.id && m.user_id === me)
        || this.links.some(l => l.parent_id === me && this.members.some(m => m.id === l.member_id && m.team_id === t.id)));
      if (!t || !(mineT || canReview)) return raise('permission_denied', '42501');
      const ms = this.members.filter(m => m.team_id === t.id), minors = ms.filter(m => m.age === null || m.age < 18);
      const gs = this.tour && Array.isArray(this.tour.state.groups) ? this.tour.state.groups : [];
      const gi = gs.findIndex(g => Array.isArray(g) && g.includes(t.id));
      return { status: 200, body: { team_id: t.id, name: t.name, area: t.area, status: t.status, note: ['returned', 'rejected'].includes(t.status) ? t.admin_note : null, ref: t.ref_code || null,
        fee: t.fee_status || 'unpaid', fee_at: null, members: ms.length, minors: minors.length, consents: minors.filter(m => m.consent_status === 'received').length,
        claimed: !!t.leader_id, group: gi >= 0 ? gi : null, next: null, created_at: t.created_at, reviewed_at: t.reviewed_at || null } };
    }
    if (name === 'yb_claim_team') {
      if (c.role !== 'leader') return { status: 200, body: { ok: false, error: 'not_leader' } };
      const code = String(body.ref || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^YN(?=.{8}$)/, '');
      const key = s => String(s || '').replace(/\D/g, '').slice(-9);
      const t = this.teams.find(x => x.ref_code === code && x.reg && key(x.reg.phone) === key(body.phone) && key(body.phone).length >= 7);
      if (!t) return { status: 200, body: { ok: false, error: 'not_found' } };
      if (t.leader_id === me) return { status: 200, body: { ok: true, team_id: t.id, team_name: t.name, already: true } };
      if (t.leader_id) return { status: 200, body: { ok: false, error: 'already_claimed' } };
      if (this.teams.some(x => x.leader_id === me)) return { status: 200, body: { ok: false, error: 'already_leading' } };
      t.leader_id = me;
      const lm = this.members.find(m => m.team_id === t.id && m.is_leader);
      if (lm && !lm.user_id) lm.user_id = me;
      return { status: 200, body: { ok: true, team_id: t.id, team_name: t.name } };
    }
    if (name === 'yb_set_fee') {
      if (!canReview) return raise('permission_denied', '42501');
      if (!['unpaid', 'paid', 'waived'].includes(body.status)) return raise('invalid_argument');
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return raise('team_not_found');
      const changed = (t.fee_status || 'unpaid') !== body.status;
      t.fee_status = body.status; t.fee_receipt = body.status === 'unpaid' ? null : (body.receipt || null);
      if (changed && body.status !== 'unpaid') {
        const people = new Set([t.leader_id, ...this.members.filter(m => m.team_id === t.id).map(m => m.user_id)].filter(Boolean));
        people.forEach(u => this.notes.push({ id: ++this.noteSeq, user_id: u, kind: 'team_fee', data: { team_id: t.id, team_name: t.name, fee: body.status }, read_at: null, created_at: this.now() }));
      }
      return { status: 200, body: { ok: true, fee: body.status, changed } };
    }
    if (name === 'yb_registration_detail') {
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t || !(canReview || t.leader_id === me)) return raise('permission_denied', '42501');
      return { status: 200, body: t.reg || null };
    }
    if (name === 'yb_review_roster') {
      if (!canReview) return raise('permission_denied', '42501');
      return { status: 200, body: this.members.filter(m => m.team_id === body.team_id).map(m => ({ member_id: m.id, full_name: m.full_name, is_leader: m.is_leader, consent_status: m.consent_status, joined: m.user_id !== null })) };
    }
    if (name === 'yb_my_competitions') return { status: 200, body: c.role === 'officer' ? this.officers.filter(o => o.user_id === me).map(o => o.competition).sort() : [] };
    if (name === 'yb_set_officer') {
      if (!admin) return raise('permission_denied', '42501');
      const p = this.profiles.find(x => x.id === body.target);
      if (!p) return raise('user_not_found');
      if (body.assign && p.role !== 'officer') return raise('wrong_role', '42501');
      this.officers = this.officers.filter(o => !(o.user_id === p.id && o.competition === body.competition));
      if (body.assign) this.officers.push({ user_id: p.id, competition: body.competition });
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_rsvp' || name === 'yb_mark_attendance') {
      const e = this.events.find(x => x.id === body.event_id);
      if (!e) return raise('event_not_found');
      const t = this.teams.find(x => x.id === body.team_id);
      const concerns = t && (e.team_ids.includes(t.id) || (!e.team_ids.length && t.status === 'approved'));
      const row = () => { let a = this.att.find(x => x.event_id === e.id && x.team_id === body.team_id); if (!a) { a = { event_id: e.id, team_id: body.team_id, rsvp: null, presence: null, late_minutes: null }; this.att.push(a); } return a; };
      if (name === 'yb_rsvp') {
        if (!t || t.leader_id !== me || !concerns) return raise('permission_denied', '42501');
        if (e.status === 'cancelled') return raise('event_cancelled');
        row().rsvp = body.answer;
        return { status: 200, body: { ok: true, rsvp: body.answer } };
      }
      const canManage = admin || (c.role === 'officer' && this.officers.some(o => o.user_id === me && o.competition === e.competition));
      if (!canManage) return raise('permission_denied', '42501');
      if (!concerns) return raise('invalid_team');
      const a = row(); a.presence = body.presence; a.late_minutes = body.presence === 'present' ? body.late_minutes : null;
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_my_team_roster_status') {
      const t = this.teams.find(x => x.leader_id === me);
      return { status: 200, body: t ? this.members.filter(m => m.team_id === t.id).map(m => ({ member_id: m.id, joined: m.user_id !== null, parents: this.links.filter(l => l.member_id === m.id).length })) : [] };
    }
    if (name === 'mark_consent' || name === 'unlink_member') {
      const m = this.members.find(x => x.id === body.member_id);
      if (!m) return raise('member_not_found');
      const t = this.teams.find(x => x.id === m.team_id);
      if (!(admin || (t.leader_id === me && ['draft', 'submitted', 'returned'].includes(t.status)))) return raise('permission_denied', '42501');
      if (name === 'mark_consent') {
        if (typeof body.received !== 'boolean') return raise('invalid_argument');
        m.consent_status = body.received ? 'received' : 'pending';
        m.consent_at = body.received ? this.now() : null;
        return { status: 200, body: { ok: true, consent_status: m.consent_status } };
      }
      if (m.is_leader && !admin) return raise('permission_denied', '42501');
      if (!m.is_leader) m.user_id = null;
      this.links = this.links.filter(l => l.member_id !== m.id);
      return { status: 200, body: { ok: true } };
    }
    if (name === 'regenerate_join_code') {
      const t = this.teams.find(x => x.id === body.team_id);
      if (!t) return raise('team_not_found');
      if (!(admin || t.leader_id === me)) return raise('permission_denied', '42501');
      t.join_code = this.newCode();
      return { status: 200, body: t.join_code };
    }
    if (name === 'set_user_role') {
      if (!admin) return raise('permission_denied', '42501');
      if (body.new_role === 'admin') return raise('permission_denied', '42501');
      const p = this.profiles.find(x => x.id === body.target);
      if (!p) return raise('user_not_found');
      if (p.role === 'admin') return raise('permission_denied', '42501');
      if (!['officer', 'leader', 'member', 'parent'].includes(body.new_role)) return err(400, '22P02', 'invalid input value for enum user_role');
      if (p.role === 'leader' && body.new_role !== 'leader' && this.teams.some(t => t.leader_id === p.id)) return raise('leads_team');   // 0011
      if (p.role === 'officer' && body.new_role !== 'officer') this.officers = this.officers.filter(o => o.user_id !== p.id);
      p.role = body.new_role;
      return { status: 200, body: { ok: true, role: p.role } };
    }
    return err(404, 'PGRST202', 'no function');
  }
}
function err(status, code, message) { return { status, body: { code, message, details: null, hint: null } }; }
function filterRows(rows, q) {
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset', 'redirect_to'].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) rows = rows.filter(r => String(r[k]) === m[1]);
  }
  return rows;
}
function orderRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(',').map(s => { const [c, d] = s.split('.'); return [c, d === 'desc' ? -1 : 1]; });
  return rows.slice().sort((a, b) => {
    for (const [c, d] of keys) {
      const x = a[c], y = b[c];
      if (x === y) continue;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'ar') : (x < y ? -1 : 1)) * d;
    }
    return 0;
  });
}
function project(rows, select) {
  if (!select || select === '*') return rows;
  const cols = select.split(',');
  return rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
}

/* ================================================================ harness */
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const consoleErrors = [];
const badHosts = new Set();
const FONT_HOST = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

async function open(fake, { path: pth = 'account.html', hash = '', config = 'ok', viewport = { width: 1280, height: 900 }, colorScheme = 'light', mobile = false, label = '' } = {}) {
  const ctx = await browser.newContext({ ...(mobile ? PHONE : { viewport }), colorScheme, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => { page.errs.push(e.message); consoleErrors.push(`${label}: ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::|Failed to load resource/.test(m.text() + (m.location() && m.location().url || ''))) { page.errs.push(m.text()); consoleErrors.push(`${label}: ${m.text()}`); } });
  page.on('request', r => { try { const h = new URL(r.url()).host; if (h !== new URL(ORIGIN).host && h !== 'fake.supabase.test' && !FONT_HOST.test(h) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) badHosts.add(h); } catch (e) { /* ignore */ } });
  await page.route(/fonts\.g(oogleapis|static)\.com/, r => r.abort());
  if (fake) await page.route(`${FAKE_URL}/**`, r => fake.handle(r));
  if (config === 'ok') {
    // yb-config.js (loaded later by the page) assigns the empty config; the setter keeps ours
    await page.addInitScript(([url, key]) => { const cfg = { url, anonKey: key }; Object.defineProperty(window, 'YB_CONFIG', { configurable: true, get: () => cfg, set: () => {} }); }, [FAKE_URL, ANON]);
  } else if (config === 'service') {
    await page.addInitScript(() => { const cfg = { url: 'https://fake.supabase.test', anonKey: 'sb_secret_abcdefghijklmnop' }; Object.defineProperty(window, 'YB_CONFIG', { configurable: true, get: () => cfg, set: () => {} }); });
  }
  await page.goto(`${ORIGIN}/${pth}${hash}`);
  await page.waitForFunction(() => document.querySelector('[data-account-root]') && document.querySelector('[data-account-root]').getAttribute('aria-busy') === 'false', null, { timeout: 8000 }).catch(() => {});
  page.ctx = ctx;
  return page;
}
const close = async p => { await p.ctx.close(); };
const text = p => p.locator('[data-account-root]').innerText();
const html = p => p.locator('[data-account-root]').evaluate(e => e.innerHTML);
const settle = async p => { await p.waitForFunction(() => document.querySelector('[data-account-root]').getAttribute('aria-busy') === 'false' && !document.querySelector('.a-skel'), null, { timeout: 8000 }).catch(() => {}); await sleep(60); };
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const live = p => p.locator('[data-live]').innerText();

async function signIn(p, email, password = 'Passw0rd!') {
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').fill(email);
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=password]').fill(password);
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]').click();
}
async function signInOk(p, email, password, o = {}) {
  await signIn(p, email, password);
  await waitApp(p);
  await settle(p);
  // the admin lands on «الرئيسية» (the home tab). The older sections test the tabs from «الفرق», so hop there unless asked to stay.
  if (!o.home && await p.locator('#at-home[aria-selected="true"]').count()) {
    if (await p.locator('#at-teams').isVisible()) await p.locator('#at-teams').click();
    else await p.evaluate(() => document.getElementById('at-teams').click());
    await p.waitForSelector('#ap-teams', { timeout: 6000 });
    await sleep(40);
  }
}
async function signUp(p, { name, email, password = 'Passw0rd!', role }) {
  await p.locator('#panel-signup input[name=name]').fill(name);
  await p.locator('#panel-signup input[name=email]').fill(email);
  await p.locator('#panel-signup input[name=password]').fill(password);
  if (role) await p.locator(`#panel-signup input[name=role][value=${role}]`).check({ force: true });
  await p.locator('#panel-signup button[type=submit]').click();
}
const ok = pr => pr.then(() => true, () => false);
const reload = async p => { await p.reload(); await settle(p); };
const waitApp = async (p, sel = '.a-app') => {
  try { await p.waitForSelector(sel, { timeout: 8000 }); } catch (e) {
    console.log('  [debug] waiting for ' + sel + ' — page says: ' + (await text(p)).replace(/\s+/g, ' ').slice(0, 300) + ' | errors: ' + p.errs.join(' | ') + ' | url: ' + p.url());
    throw e;
  }
};

/* ================================================================ 1. static source hygiene */
section('source: no secrets, no logging, no HTML injection, no direct network');
{
  const js = fs.readFileSync(path.join(SITE, 'js/account.js'), 'utf8');
  const code = js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('classic script: IIFE, no modules', /^\(\(\) => \{/m.test(js) && !/^\s*(import|export)\s/m.test(js) && !/require\(/.test(js));
  check('never logs (tokens and names stay out of the console)', !/\bconsole\./.test(code));
  check('no innerHTML / outerHTML / document.write / eval (user data only through textContent)', !/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(code));
  check('no direct network primitive (everything goes through window.YB)', !/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(code));
  check('no hard-coded URL string', !/['"`]https?:\/\//.test(code));
  check('no service key / JWT-looking literal', !/service_role|eyJ[A-Za-z0-9_-]{20,}/.test(code));
  check('the only storage keys it writes are the registration draft and the chosen theme', (code.match(/localStorage\.setItem/g) || []).length === 3 && /setItem\(DRAFT_KEY/.test(code) && /setItem\('yanabee-theme'/.test(code) && /setItem\(DASH_KEY/.test(code));
  check('the dashboard\'s own key holds only what was celebrated (badge names, flags): no token, no name', /const dashStore = \{/.test(code) && !/dashStore\.set\([^)]*(token|email|full_name)/.test(code));
  check('no token or password is stored (no access_token / refresh_token / sessionStorage in account.js)', !/\.access_token|\.refresh_token|sessionStorage/.test(code));
  check('uses YB.poll for the tournament state', /YB\.poll\(/.test(code));
  const page = fs.readFileSync(path.join(SITE, 'account.html'), 'utf8');
  const order = ['js/yb-config.js', 'js/yb-api.js', 'js/tournament-engine.js', 'js/account.js'].map(s => page.indexOf(`src="${s}"`));
  check('page loads yb-config, yb-api, tournament-engine, account in that order', order.every(i => i > 0) && order.every((v, i) => !i || v > order[i - 1]), order.join());
  check('page loads css/account.css after css/comp.css', page.indexOf('css/comp.css') > 0 && page.indexOf('css/account.css') > page.indexOf('css/comp.css'));
  check('no account data in the served HTML (only the shell)', !/@[a-z]+\.test|access_token/.test(page));
  const demoJs = fs.readFileSync(path.join(SITE, 'js/yb-demo.js'), 'utf8');
  const demoCode = demoJs.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('yb-demo.js: never logs, no eval / XHR / sendBeacon, no HTML injection, the only URL literal is the fake host', !/\bconsole\./.test(demoCode) && !/\beval\(|new Function|XMLHttpRequest|sendBeacon|WebSocket|\.innerHTML\s*=|insertAdjacentHTML/.test(demoCode)
    && (demoCode.match(/['"`]https?:\/\/[^'"`]+['"`]/g) || []).every(u => u.includes('demo.yanabee.invalid')));
  check('yb-demo.js: it is inert without the tab flag and wraps fetch only after the flag check', /if \(!active\) return;/.test(demoJs) && demoJs.indexOf('window.fetch = function') > demoJs.indexOf('if (!active) return;'));
  check('yb-demo.js loads before yb-config.js on account.html and tournament.html', ['account.html', 'tournament.html'].every(f => { const h = fs.readFileSync(path.join(SITE, f), 'utf8'); return h.indexOf('js/yb-demo.js') > 0 && h.indexOf('js/yb-demo.js') < h.indexOf('js/yb-config.js'); }));
  const sqlDir = path.join(ROOT, 'supabase/migrations');
  const sql = fs.readdirSync(sqlDir).map(f => fs.readFileSync(path.join(sqlDir, f), 'utf8')).join('\n');
  check('no demo account or credential exists in the repo\'s SQL', !/demo/i.test(sql));
  check('the other pages and scripts hold no demo token', !/demo-t-|demo-anon/.test(fs.readFileSync(path.join(SITE, 'js/yb-api.js'), 'utf8') + fs.readFileSync(path.join(SITE, 'js/tournament.js'), 'utf8') + fs.readFileSync(path.join(SITE, 'js/account.js'), 'utf8')));
}

/* ================================================================ 2. unconfigured */
section('unconfigured mode');
{
  const fake = new Fake();
  const p = await open(fake, { config: 'none', label: 'unconfigured' });
  await settle(p);
  const tx = await text(p);
  check('plain Arabic panel «الحسابات غير مفعّلة بعد على هذا الموقع»', /الحسابات غير مفعّلة بعد على هذا الموقع/.test(tx));
  check('explains the owner must connect the database, no jargon or keys', /مالك الموقع/.test(tx) && !/anon|supabase|API|key|token|SQL/i.test(tx));
  check('no form, no tabs, no request at all', !(await p.locator('[data-account-root] form').count()) && !(await p.locator('[role=tab]').count()) && fake.log.length === 0);
  check('the rest of the site stays reachable (tournament, register, home links)', (await p.locator('[data-account-root] a[href="tournament.html"]').count()) === 1 && (await p.locator('[data-account-root] a[href="register.html"]').count()) === 1);
  check('aria-busy cleared and heading focused target exists', (await p.locator('[data-account-root]').getAttribute('aria-busy')) === 'false' && (await p.locator('[data-account-root] h2').count()) === 1);
  check('no warning box when the config is merely empty', !(await p.locator('[data-account-root] .a-banner.bad').count()));
  check('no console error', p.errs.length === 0, p.errs.join('|'));
  check('390px: no horizontal overflow', (await p.setViewportSize({ width: 390, height: 844 }), await overflow(p)) <= 0);
  await close(p);
  const q = await open(fake, { config: 'service', label: 'service key' });
  await settle(q);
  const wt = await text(q);
  check('a service/secret key in the config shows a clear warning (role=alert) and still the unconfigured panel', (await q.locator('[data-account-root] [role=alert]').count()) === 1 && /مفتاح سرّي/.test(wt) && /الحسابات غير مفعّلة/.test(wt));
  check('the secret key is never sent anywhere (zero requests)', fake.log.length === 0);
  await close(q);
}

/* ================================================================ 3. signed out */
section('signed out: login, sign-up, reset');
{
  const fake = new Fake();
  fake.addUser({ email: 'known@t.test', name: 'معروف', role: 'member' });
  const p = await open(fake, { label: 'signed-out' });
  await settle(p);
  check('no request while signed out and nothing to load', fake.log.length === 0, JSON.stringify(fake.log));
  check('login tab selected by default, tabs دخول / حساب جديد', (await p.locator('#tab-login').getAttribute('aria-selected')) === 'true' && /دخول/.test(await p.locator('#tab-login').innerText()) && /حساب جديد/.test(await p.locator('#tab-signup').innerText()));
  check('signup panel hidden, login panel shown', await p.locator('#panel-login').isVisible() && !(await p.locator('#panel-signup').isVisible()));
  check('login fields have labels and proper autocomplete', (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').getAttribute('autocomplete')) === 'username' && (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=password]').getAttribute('autocomplete')) === 'current-password'
    && (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] label[for]').count()) === 2);
  // password show/hide
  const pw = p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=password]');
  await pw.fill('abc12345');
  const tog = p.locator('#panel-login form[aria-label="تسجيل الدخول"] .a-pw-toggle');
  await tog.click();
  check('show/hide password toggles the input type and the pressed state', (await pw.getAttribute('type')) === 'text' && (await tog.getAttribute('aria-pressed')) === 'true');
  await tog.click();
  check('…and back', (await pw.getAttribute('type')) === 'password');
  // empty submit
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').fill('');
  await pw.fill('');
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]').click();
  check('empty login: message in a role=alert box, field marked invalid and focused', (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] .a-err').innerText()).includes('اكتب بريدك') && (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').getAttribute('aria-invalid')) === 'true'
    && await p.evaluate(() => document.activeElement && document.activeElement.name === 'email'));
  check('…and no request was made', fake.log.length === 0);
  // wrong password -> Arabic, never says which part is wrong
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').fill('known@t.test');
  await pw.fill('wrong-password');
  await pw.press('Enter');
  await p.waitForSelector('#panel-login form[aria-label="تسجيل الدخول"] .a-err:not([hidden])');
  check('Enter in the password field submits; wrong credentials → one Arabic message', /البريد الإلكتروني أو كلمة المرور غير صحيحة/.test(await p.locator('#panel-login form[aria-label="تسجيل الدخول"] .a-err').innerText()) && fake.count(/token/) === 1);
  await sleep(120);
  check('the same message is announced in the aria-live region', /غير صحيحة/.test(await live(p)));
  // double submit guard
  fake.delay = 400;
  fake.log.length = 0;
  await pw.fill('wrong-again');
  const sub = p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]');
  await sub.click();
  await sub.click({ force: true, noWaitAfter: true }).catch(() => {});
  await pw.press('Enter').catch(() => {});
  await sleep(900);
  check('double submit (two clicks + Enter) sends ONE request', fake.count(/token/) === 1, String(fake.count(/token/)));
  fake.delay = 0;
  // reset password
  await p.locator('#panel-login .a-link', { hasText: 'نسيت كلمة المرور' }).click();
  await p.waitForFunction(() => location.hash === '#reset');
  await sleep(100);
  check('«نسيت كلمة المرور؟» opens the reset form (hash #reset) with the e-mail focused', (await p.evaluate(() => location.hash)) === '#reset' && await p.evaluate(() => document.activeElement && document.activeElement.name === 'email' && !!document.activeElement.closest('form[aria-label]')));
  const rf = p.locator('#panel-login form[aria-label="إعادة تعيين كلمة المرور"]');
  await rf.locator('input[name=email]').fill('not-an-email');
  await rf.locator('button[type=submit]').click();
  check('reset with a malformed e-mail is refused locally', /بريدًا إلكترونيًا صحيحًا/.test(await rf.locator('.a-err').innerText()) && fake.count(/recover/) === 0);
  await rf.locator('input[name=email]').fill('known@t.test');
  await rf.locator('button[type=submit]').click();
  await p.waitForSelector('#panel-login .a-banner.ok:not([hidden])');
  const msgKnown = await p.locator('#panel-login .a-banner.ok').innerText();
  check('reset answers neutrally (never "we sent it to you")', /إن كان هذا البريد مسجّلًا/.test(msgKnown));
  await p.locator('#panel-login .a-banner.ok').evaluate(() => {}); // keep
  await p.evaluate(() => { location.hash = 'login'; });
  await p.locator('#panel-login .a-link', { hasText: 'نسيت كلمة المرور' }).click();
  await rf.locator('input[name=email]').fill('nobody@t.test');
  await rf.locator('button[type=submit]').click();
  await p.waitForSelector('#panel-login .a-banner.ok:not([hidden])');
  check('unknown e-mail gets the IDENTICAL message (no account enumeration)', (await p.locator('#panel-login .a-banner.ok').innerText()) === msgKnown && fake.recovers.length === 2);
  check('reset request carried the redirect to this same page', fake.log.filter(l => /recover/.test(l.path)).every(l => l.search.includes('redirect_to=') && decodeURIComponent(l.search).includes('/account.html')));
  // hash navigation
  await p.evaluate(() => { location.hash = 'signup'; });
  await p.waitForSelector('#panel-signup', { state: 'visible' });
  check('#signup opens the sign-up tab', (await p.locator('#tab-signup').getAttribute('aria-selected')) === 'true' && !(await p.locator('#panel-login').isVisible()));
  await p.evaluate(() => { location.hash = 'login'; });
  await p.waitForSelector('#panel-login', { state: 'visible' });
  check('#login goes back (history works)', (await p.locator('#tab-login').getAttribute('aria-selected')) === 'true');
  await p.goBack();
  await p.waitForSelector('#panel-signup', { state: 'visible' });
  check('browser Back follows the hash', await p.locator('#panel-signup').isVisible());
  // keyboard on the tabs
  await p.locator('#tab-signup').focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => document.getElementById('tab-login').getAttribute('aria-selected') === 'true');
  check('arrow keys move between the two tabs (RTL)', await p.evaluate(() => document.activeElement.id) === 'tab-login' && (await p.locator('#tab-login').getAttribute('aria-selected')) === 'true');
  await p.keyboard.press('ArrowLeft');
  await p.waitForFunction(() => document.getElementById('tab-signup').getAttribute('aria-selected') === 'true');
  check('…and back, Home/End work too', await p.evaluate(() => document.activeElement.id) === 'tab-signup');
  await p.keyboard.press('Home');
  await p.waitForFunction(() => document.getElementById('tab-login').getAttribute('aria-selected') === 'true');
  check('Home → first tab', await p.evaluate(() => document.activeElement.id) === 'tab-login');
  check('exactly one tab is in the tab order', (await p.locator('[role=tab][tabindex="0"]').count()) === 1);
  await p.evaluate(() => { location.hash = 'signup'; });
  await p.waitForSelector('#panel-signup', { state: 'visible' });
  /* sign-up form */
  const cards = p.locator('#panel-signup .a-role');
  check('three role cards: قائد فريق / عضو في فريق / ولي أمر', (await cards.count()) === 3 && (await cards.allInnerTexts()).join('|').includes('قائد فريق') && (await cards.allInnerTexts()).join('|').includes('عضو في فريق') && (await cards.allInnerTexts()).join('|').includes('ولي أمر'));
  check('admin is NOT offered anywhere in the sign-up form', !(await p.locator('#panel-signup').innerText()).includes('الإدارة') && !(await p.locator('#panel-signup input[value=admin]').count()));
  check('role radios are a required group, none preselected', (await p.locator('#panel-signup input[name=role]:checked').count()) === 0 && (await p.locator('#panel-signup input[name=role][required]').count()) === 3);
  check('sign-up autocomplete: name / email / new-password', (await p.locator('#panel-signup input[name=name]').getAttribute('autocomplete')) === 'name' && (await p.locator('#panel-signup input[name=email]').getAttribute('autocomplete')) === 'email' && (await p.locator('#panel-signup input[name=password]').getAttribute('autocomplete')) === 'new-password');
  const notice = await p.locator('#panel-signup .a-privacy').innerText();
  check('notice: paper guardian consent still needed (content line) + link to register.html#c-consent', notice.includes('تُملأ نسخة منفصلة لكل مشارك قاصر') && (await p.locator('#panel-signup .a-privacy a').getAttribute('href')) === 'register.html#c-consent');
  check('notice: only team names are shown publicly', /أسماء الفرق المعتمدة فقط/.test(notice));
  // validation
  await p.locator('#panel-signup button[type=submit]').click();
  check('empty sign-up → name error first', /اسمك الكامل/.test(await p.locator('#panel-signup .a-err').innerText()));
  await signUp(p, { name: 'تجربة', email: 'x@t.test', password: 'short' });
  check('password < 8 → weak-password message, no request', /8 أحرف/.test(await p.locator('#panel-signup .a-err').innerText()) && fake.count(/signup/) === 0);
  await p.locator('#panel-signup input[name=password]').fill('Passw0rd!');
  await p.locator('#panel-signup button[type=submit]').click();
  check('no role chosen → asked to choose a role, first card focused', /اختر نوع الحساب/.test(await p.locator('#panel-signup .a-err').innerText()) && fake.count(/signup/) === 0);
  await p.locator('#panel-signup input[name=email]').fill('known@t.test');
  await p.locator('#panel-signup input[name=role][value=member]').check({ force: true });
  await p.locator('#panel-signup button[type=submit]').click();
  await p.waitForSelector('#panel-signup .a-err:not([hidden])');
  check('existing e-mail → «مسجَّل من قبل» (server answer mapped to Arabic)', /مسجَّل من قبل/.test(await p.locator('#panel-signup .a-err').innerText()));
  check('no console error while signed out', p.errs.length === 0, p.errs.join('|'));
  await close(p);
}

/* ================================================================ 4. THE END-TO-END STORY */
section('end to end: sign-up → leader → admin → member → parent');
const world = new Fake({ autoConfirm: false });
const ADMIN = { email: 'admin@t.test', name: 'مدير المسابقة' };
world.addUser({ ...ADMIN, role: 'member' });
world.setAdmin(ADMIN.email);
const LEADER = { email: 'leader@t.test', name: 'خالد المنصور' };
const NAMES = ['سارة أحمد العلي', 'عمر خالد الحسن', 'ليلى محمود سالم', 'يوسف إبراهيم نور', 'مريم عبدالله زين', 'أحمد سليمان رضا'];
let teamCode = '';
let teamId = '';
{
  /* ---- leader signs up; e-mail confirmation is ON ---- */
  const L = await open(world, { hash: '#signup', label: 'leader' });
  await settle(L);
  await signUp(L, { name: LEADER.name, email: LEADER.email, role: 'leader' });
  await L.waitForSelector('#panel-signup .a-done:not([hidden])');
  const done = await L.locator('#panel-signup .a-done').innerText();
  check('sign-up with confirmation ON → «تحقق من بريدك» message (needsConfirm path)', /رسالة تأكيد/.test(done) && /سجّل الدخول/.test(done));
  check('the form is gone, the password field was cleared', !(await L.locator('#panel-signup form').isVisible()));
  const srv = world.profileByEmail(LEADER.email);
  check('server-side profile: role leader, name saved from the sign-up metadata', srv && srv.role === 'leader' && srv.full_name === LEADER.name);
  check('no session yet (nothing stored), still signed out', (await L.evaluate(() => localStorage.getItem('yanabee-session-v1'))) === null);
  check('«الذهاب إلى الدخول» takes you to the login form', (await (async () => { await L.locator('#panel-signup .a-done button').click(); await L.waitForSelector('#panel-login', { state: 'visible' }); return true; })()) && (await L.evaluate(() => location.hash)) === '#login');
  await signIn(L, LEADER.email);
  await L.waitForSelector('#panel-login form[aria-label="تسجيل الدخول"] .a-err:not([hidden])');
  check('login before confirming → «لم يُؤكَّد البريد بعد»', /لم يُؤكَّد البريد/.test(await L.locator('#panel-login form[aria-label="تسجيل الدخول"] .a-err').innerText()));
  /* ---- the confirmation link ---- */
  world.confirm(LEADER.email);
  const link = world.session(srv.id);
  await L.goto('about:blank');
  await L.goto(`${ORIGIN}/account.html#access_token=${link.access_token}&refresh_token=${link.refresh_token}&expires_in=3600&token_type=bearer&type=signup`);
  await waitApp(L);
  await settle(L);
  check('confirmation link signs you in and removes the tokens from the address bar', !(await L.evaluate(() => location.href)).includes('access_token') && (await L.evaluate(() => location.hash)) === '');
  check('…and says the e-mail was confirmed', /تم تأكيد بريدك/.test(await text(L)));
  check('leader screen: header with name and role badge', (await L.locator('.a-head h2').innerText()) === LEADER.name && (await L.locator('.a-head .a-badge').innerText()) === 'قائد الفريق');
  check('no team yet → create-team form (name, area)', (await L.locator('form[aria-label="إنشاء الفريق"]').count()) === 1 && (await L.locator('input[name=team]').count()) === 1 && (await L.locator('input[name=area]').count()) === 1);
  check('hint: the team name becomes public after approval, no child names', /يظهر اسم الفريق للعموم بعد اعتماده/.test(await text(L)));
  await L.locator('input[name=team]').fill('ي');
  await L.locator('form[aria-label="إنشاء الفريق"] button[type=submit]').click();
  check('1-character team name is refused locally', /من حرفين إلى 60/.test(await L.locator('form[aria-label="إنشاء الفريق"] .a-err').innerText()) && world.teams.length === 0);
  await L.locator('input[name=team]').fill('فريق الينابيع');
  await L.locator('input[name=area]').fill('حي الأمل');
  await L.locator('form[aria-label="إنشاء الفريق"] button[type=submit]').click();
  await L.waitForSelector('[data-counter]');
  const tm = world.teams[0];
  teamCode = tm.join_code; teamId = tm.id;
  check('team created server-side with server-forced fields (draft, leader, 6-char code)', tm && tm.status === 'draft' && tm.leader_id === srv.id && /^[A-HJ-KM-NP-Z2-9]{6}$/.test(teamCode));
  check('roster starts with the leader (counter 1 / 7), status chip مسودة', (await L.locator('[data-counter]').innerText()) === '1 / 7' && (await L.locator('.a-teamcard .a-chip').first().innerText()) === 'مسودة');
  check('submit is disabled until 5 members; hint says how many are missing', await L.locator('button[data-fk=submit]').isDisabled() && /ينقصك 4/.test(await L.locator('.a-teamcard').innerText()));
  check('the join code is shown big, ltr, with its explanation', (await L.locator('[data-code]').innerText()) === teamCode && (await L.locator('[data-code]').getAttribute('dir')) === 'ltr' && /لأعضاء فريقك ولأولياء أمورهم/.test(await L.locator('.a-codecard').innerText()));
  check('the count rule is the content line from the registration form', (await L.locator('.a-roster').locator('xpath=..').innerText()).includes('إجمالي عدد الأعضاء: الحد الأدنى 5 والحد الأقصى 7، بما في ذلك قائد الفريق.'));
  // copy
  await L.locator('button[data-fk=copy-code]').click();
  check('copy button puts the code on the clipboard and says so', (await L.evaluate(() => navigator.clipboard.readText())) === teamCode && /نُسخ/.test(await L.locator('button[data-fk=copy-code]').innerText()));
  // add members: validation first
  const add = L.locator('form.a-add');
  await add.locator('input[name=name]').fill(NAMES[0]);
  await add.locator('input[name=age]').fill('3');
  await add.locator('button[type=submit]').click();
  check('age 3 is refused locally (4–100)', /بين 4 و100/.test(await add.locator('.a-err').innerText()) && world.members.length === 1);
  await add.locator('input[name=age]').fill('15');
  await add.locator('input[name=gphone]').fill('12');
  await add.locator('button[type=submit]').click();
  check('a too-short phone is refused', /رقم الهاتف قصير/.test(await add.locator('.a-err').innerText()));
  // add 6 members through the UI
  const ages = [15, 16, 14, 17, 13, 12];
  for (let i = 0; i < NAMES.length; i++) {
    await add.locator('input[name=name]').fill(NAMES[i]);
    await add.locator('input[name=age]').fill(String(ages[i]));
    await add.locator('input[name=gname]').fill('ولي ' + NAMES[i].split(' ')[0]);
    await add.locator('input[name=gphone]').fill('09123456' + (10 + i));
    await add.locator('button[type=submit]').click();
    await L.waitForFunction(n => document.querySelector('[data-counter]').textContent.startsWith(n + ' /'), i + 2);
    if (i === 0) {
      await add.locator('input[name=name]').fill(NAMES[0].replace('سارة', 'ساره')); // a duplicate by normalisation? only ة/ه differs on the LAST letter, so use the same name instead
      await add.locator('input[name=name]').fill(NAMES[0]);
      await add.locator('input[name=age]').fill('15');
      await add.locator('button[type=submit]').click();
      check('duplicate name in the roster is refused', /مضاف مسبقًا/.test(await add.locator('.a-err').innerText()) && world.members.length === 2);
    }
    if (i === 2) check('at 4 members the submit stays disabled', (await L.locator('[data-counter]').innerText()) === '4 / 7' && await L.locator('button[data-fk=submit]').isDisabled());
  }
  check('seven members: counter 7 / 7, add-form replaced by the full notice', (await L.locator('[data-counter]').innerText()) === '7 / 7' && !(await L.locator('form.a-add').count()) && /اكتمل الحد الأقصى/.test(await L.locator('.a-roster').locator('xpath=..').innerText()));
  check('submit enabled at 7', await L.locator('button[data-fk=submit]').isEnabled());
  // server enforces max 7 even if the UI is bypassed
  const eighth = await L.evaluate(async id => (await YB.insert('team_members', { team_id: id, full_name: 'عضو ثامن', age: 14 }, { returning: true })), teamId);
  check('8th member through the API → team_full (server rule)', !eighth.ok && eighth.error === 'team_full');
  // edit
  await L.locator(`[data-member] button[aria-label="تعديل ${NAMES[5]}"]`).click();
  const ef = L.locator('form.a-edit');
  await ef.locator('input[name=age]').fill('11');
  await ef.locator('button[type=submit]').click();
  await L.waitForFunction(n => !document.querySelector('form.a-edit'), 0);
  check('edit a member (age 12 → 11) saved on the server', world.members.find(m => m.full_name === NAMES[5]).age === 11);
  // delete (two-step)
  const rm = L.locator(`[data-member] button[aria-label="حذف ${NAMES[5]}"]`);
  await rm.click();
  check('delete asks for a second press', /مرة أخرى/.test(await rm.innerText()) && world.members.length === 7);
  await rm.click();
  await L.waitForFunction(() => document.querySelector('[data-counter]').textContent.startsWith('6 /'));
  check('second press deletes the member', world.members.length === 6 && !world.members.some(m => m.full_name === NAMES[5]));
  // the leader's own row cannot be deleted
  check('the leader row has no delete button', (await L.locator('[data-member]').first().locator('button', { hasText: 'حذف' }).count()) === 0);
  // add the member back
  await add.evaluate(() => {});
  await L.locator('form.a-add input[name=name]').fill(NAMES[5]);
  await L.locator('form.a-add input[name=age]').fill('12');
  await L.locator('form.a-add input[name=gname]').fill('ولي أحمد');
  await L.locator('form.a-add input[name=gphone]').fill('0912345699');
  await L.locator('form.a-add button[type=submit]').click();
  await L.waitForFunction(() => document.querySelector('[data-counter]').textContent.startsWith('7 /'));
  // the join code regeneration
  const oldCode = teamCode;
  const rg = L.locator('button[data-fk=regen]');
  await rg.click();
  check('regenerate needs a second press (the old code stops working)', world.teams[0].join_code === oldCode && /الرمز القديم/.test(await rg.innerText()));
  await rg.click();
  await L.waitForFunction(c => document.querySelector('[data-code]').textContent !== c, oldCode);
  teamCode = world.teams[0].join_code;
  check('a new code appears and differs from the old one', teamCode !== oldCode && (await L.locator('[data-code]').innerText()) === teamCode);
  // consent toggle by the leader while draft
  const swL = L.locator(`[data-member] input[data-fk="sw-${world.members.find(m => m.full_name === NAMES[1]).id}"]`);
  await swL.check({ force: true });
  await L.waitForFunction(id => document.querySelector(`input[data-fk="sw-${id}"]`) && document.querySelector(`input[data-fk="sw-${id}"]`).checked && !document.querySelector(`input[data-fk="sw-${id}"]`).disabled, world.members.find(m => m.full_name === NAMES[1]).id);
  check('leader marks a member\'s paper consent (mark_consent) while draft', world.members.find(m => m.full_name === NAMES[1]).consent_status === 'received');
  // submit
  await L.locator('button[data-fk=submit]').click();
  await L.waitForSelector('button[data-fk=withdraw]');
  check('submit → status قيد المراجعة (owner\'s wording), withdraw button appears', world.teams[0].status === 'submitted' && (await L.locator('.a-teamcard .a-chip').first().innerText()) === 'قيد المراجعة');
  check('the status timeline marks step 2 (قيد المراجعة) as current', (await L.locator('.a-steps li[aria-current=step]').innerText()) === 'قيد المراجعة' && (await L.locator('.a-steps li.done').count()) === 1);
  await L.locator('button[data-fk=withdraw]').click();
  await L.waitForSelector('button[data-fk=submit]');
  check('withdraw → back to draft', world.teams[0].status === 'draft');
  // stale page: three members vanish on the server (another device), the page still shows 7 and an enabled submit
  const gone = [NAMES[3], NAMES[4], NAMES[5]].map(n => world.members.splice(world.members.findIndex(m => m.full_name === n), 1)[0]);
  await L.locator('button[data-fk=submit]').click();
  await L.waitForSelector('[data-msg=top]:not([hidden])');
  check('members_count_invalid from the server → exact message with the REAL count, roster reloaded, status stays draft',
    /عدد الأعضاء 4؛ المطلوب من 5 إلى 7 شاملًا القائد/.test(await L.locator('[data-msg=top]').innerText()) && (await L.locator('[data-counter]').innerText()) === '4 / 7' && world.teams[0].status === 'draft' && await L.locator('button[data-fk=submit]').isDisabled());
  world.members.push(...gone); // they come back
  await reload(L);
  check('after the reload the roster is 7 / 7 again and submit is enabled', (await L.locator('[data-counter]').innerText()) === '7 / 7' && await L.locator('button[data-fk=submit]').isEnabled());
  check('leader schedule card: graceful empty state when no tournament is published', /لم تُنشر بيانات البطولة بعد/.test(await L.locator('.a-sched').innerText()));
  await L.locator('button[data-fk=submit]').click();
  await L.waitForSelector('button[data-fk=withdraw]');
  check('team is submitted for approval', world.teams[0].status === 'submitted');
  check('no console error on the leader screen', L.errs.length === 0, L.errs.join('|'));
  world.L = L;
}

{
  /* ---- admin ---- */
  const AD = await open(world, { label: 'admin' });
  await settle(AD);
  const stateBefore = world.count(/tournament_state/);
  await signInOk(AD, ADMIN.email);
  check('admin screen: role badge الإدارة, twelve tabs (الرئيسية first, with الإحصاءات, الأخبار, الجدول, النتائج, المشاريع, التواصل, التحكيم)', (await AD.locator('.a-head .a-badge').innerText()) === 'الإدارة' && /^الرئيسية.*الإحصاءات.*الأخبار.*الجدول/.test((await AD.locator('[role=tab]').allInnerTexts()).join('|').replace(/\s+/g, ' ')) && (await AD.locator('[role=tab]').count()) === 12);
  check('admin load reads the published board once (the home tab\'s numbers) and does not poll it', world.count(/tournament_state/) - stateBefore <= 1);
  const counts = await AD.locator('.a-counters .a-count').allInnerTexts();
  check('counters by status (1 قيد المراجعة, 0 مطلوب تعديل, total 1)', counts.some(c => /^1\s*كل الفرق/.test(c.replace(/\n/g, ' '))) && counts.some(c => /^1\s*قيد المراجعة/.test(c.replace(/\n/g, ' '))) && counts.some(c => /^0\s*مطلوب تعديل/.test(c.replace(/\n/g, ' '))) && counts.some(c => /^0\s*معتمد/.test(c.replace(/\n/g, ' '))));
  const card = AD.locator('.a-team').first();
  check('team card collapsed: name, area, leader, status, member count and consent count', /فريق الينابيع/.test(await card.innerText()) && /حي الأمل/.test(await card.innerText()) && /القائد: خالد المنصور/.test(await card.innerText()) && /7 من 7 أعضاء/.test(await card.innerText()));
  check('roster hidden until expanded', !(await AD.locator('.a-roster').count()));
  await card.locator('.a-team-h').click();
  check('expanding shows age, guardian and phone of every member', (await AD.locator('.a-team .a-mem').count()) === 7 && /ولي سارة/.test(await card.innerText()) && (await AD.locator('.a-team a[href^="tel:"]').count()) >= 6);
  check('approve / return for edits / reject / reopen buttons present; draft-only hint absent', (await AD.locator('.a-decide button').count()) === 4 && await AD.locator('button[data-fk^="ap-"]').isEnabled() && await AD.locator('button[data-fk^="rt-"]').isEnabled() && await AD.locator('button[data-fk^="rj-"]').isEnabled() && await AD.locator('button[data-fk^="ro-"]').isEnabled());
  await AD.waitForSelector('.a-bell:not([hidden]) .a-bell-n:not([hidden])', { timeout: 8000 }).catch(() => {});
  const adminSubs = world.notes.filter(n => n.kind === 'team_submitted' && n.user_id === world.profileByEmail(ADMIN.email).id).length;
  check('the admin was notified of each submission (the leader submitted twice → bell shows 2)', adminSubs === 2 && (await AD.locator('.a-bell .a-bell-n').innerText()) === '2');
  // consent
  const sara = world.members.find(m => m.full_name === NAMES[0]);
  await AD.locator(`input[data-fk="sw-${sara.id}"]`).check({ force: true });
  await AD.waitForFunction(id => { const e = document.querySelector(`input[data-fk="sw-${id}"]`); return e && e.checked && !e.disabled; }, sara.id);
  check('admin marks consent «استُلمت موافقة ولي الأمر» (mark_consent) and the card stays open', sara.consent_status === 'received' && await AD.locator('.a-team-b').isVisible());
  // reject with note (two-step), then reopen, then approve
  await AD.locator('textarea.a-note-in').fill('أكمل موافقات أولياء الأمور.');
  const rj = AD.locator('button[data-fk^="rj-"]');
  await rj.click();
  check('reject needs a second press', world.teams[0].status === 'submitted' && /مرة أخرى/.test(await rj.innerText()));
  await rj.click();
  await AD.waitForFunction(() => /مرفوض/.test(document.querySelector('.a-team-h').innerText));
  check('rejected with the optional note stored', world.teams[0].status === 'rejected' && world.teams[0].admin_note === 'أكمل موافقات أولياء الأمور.');
  check('after reject: approve + reopen enabled, reject disabled', await AD.locator('button[data-fk^="ap-"]').isEnabled() && await AD.locator('button[data-fk^="rj-"]').isDisabled() && await AD.locator('button[data-fk^="ro-"]').isEnabled());
  check('the admin note is shown on the card', /أكمل موافقات أولياء الأمور/.test(await AD.locator('.a-team-b .a-note').innerText()));
  await AD.locator('button[data-fk^="ro-"]').click();
  await AD.waitForFunction(() => /مسودة/.test(document.querySelector('.a-team-h').innerText));
  check('reopen → draft (teams.status updated by the admin)', world.teams[0].status === 'draft');
  check('draft team: approve and reject are disabled with a hint', await AD.locator('button[data-fk^="ap-"]').isDisabled() && await AD.locator('button[data-fk^="rj-"]').isDisabled() && /مسودة/.test(await AD.locator('.a-decide').innerText()));
  world.teams[0].status = 'submitted'; // the leader submits again
  await AD.locator('button', { hasText: 'تحديث' }).click();
  await AD.waitForFunction(() => /قيد المراجعة/.test(document.querySelector('.a-team-h').innerText));
  // return for edits: the note is required
  await AD.locator('textarea.a-note-in').fill('');
  await AD.locator('button[data-fk^="rt-"]').click();
  check('return for edits without a note → asks for the note, nothing sent', world.teams[0].status === 'submitted' && /اكتب في الملاحظة ما المطلوب تعديله/.test(await AD.locator('.a-decide').innerText()));
  await AD.locator('textarea.a-note-in').fill('أضف رقم ولي أمر العضو الثالث.');
  await AD.locator('button[data-fk^="rt-"]').click();
  await AD.waitForFunction(() => /مطلوب تعديل/.test(document.querySelector('.a-team-h').innerText));
  check('return → مطلوب تعديل with the note (yb_review_team)', world.teams[0].status === 'returned' && world.teams[0].admin_note === 'أضف رقم ولي أمر العضو الثالث.');
  {
    const L = world.L;
    await reload(L);
    check('leader: chip مطلوب تعديل, timeline step 3 is «مطلوب تعديل», the note is shown', (await L.locator('.a-teamcard .a-chip').first().innerText()) === 'مطلوب تعديل'
      && (await L.locator('.a-steps li[aria-current=step]').innerText()) === 'مطلوب تعديل' && /أضف رقم ولي أمر العضو الثالث/.test(await L.locator('.a-teamcard .a-note').innerText()));
    check('returned: the leader can edit again (edit buttons) and resubmit', (await L.locator('[data-member] button', { hasText: 'تعديل' }).count()) === 7 && /أعد إرسال الفريق للمراجعة/.test(await L.locator('button[data-fk=submit]').innerText()));
    await L.waitForSelector('.a-bell:not([hidden])');
    const unreadL = world.notes.filter(n => n.user_id === world.teams[0].leader_id && !n.read_at).length;
    check('leader bell shows the unread notifications (reject, reopen, return)', unreadL === 3 && (await L.locator('.a-bell .a-bell-n').innerText()) === '3');
    await L.locator('.a-bell').click();
    await L.waitForSelector('.a-inbox:not([hidden]) .a-inbox-i');
    const inboxText = await L.locator('.a-inbox').innerText();
    check('inbox: Arabic sentences from kind + data, newest first, with the reviewer note', (await L.locator('.a-inbox-i').count()) === 3 && /تغيّرت حالة فريق الينابيع: مطلوب تعديل/.test(await L.locator('.a-inbox-i').first().innerText()) && /أضف رقم ولي أمر العضو الثالث/.test(inboxText) && /مرفوض/.test(inboxText));
    await L.waitForFunction(() => !document.querySelector('.a-bell .a-bell-n') || document.querySelector('.a-bell .a-bell-n').hidden);
    check('opening the inbox marks everything read (yb_mark_read)', world.notes.filter(n => n.user_id === world.teams[0].leader_id && !n.read_at).length === 0);
    await L.locator('button[data-fk=submit]').click();
    await L.waitForSelector('button[data-fk=withdraw]');
    check('the leader resubmits → قيد المراجعة again', world.teams[0].status === 'submitted');
  }
  await AD.locator('button', { hasText: 'تحديث' }).click();
  await AD.waitForFunction(() => /قيد المراجعة/.test(document.querySelector('.a-team-h').innerText));
  if (!(await AD.locator('.a-decide').count())) await AD.locator('.a-team-h').first().click();
  await AD.locator('textarea.a-note-in').fill('');
  await AD.locator('button[data-fk^="ap-"]').click();
  await AD.waitForFunction(() => /معتمد/.test(document.querySelector('.a-team-h').innerText));
  check('approve → status معتمد, note cleared (empty note sent)', world.teams[0].status === 'approved' && world.teams[0].admin_note === null);
  check('admin console clean', AD.errs.length === 0, AD.errs.join('|'));
  world.AD = AD;
}

{
  /* ---- the leader sees the decision; the leader screen after approval ---- */
  const L = world.L;
  await reload(L);
  check('leader: status chip معتمد and no edit controls', (await L.locator('.a-teamcard .a-chip').first().innerText()) === 'معتمد' && !(await L.locator('form.a-add').count()) && !(await L.locator('[data-member] button', { hasText: 'تعديل' }).count()) && !(await L.locator('button[data-fk=submit]').count()));
  check('approved: consent shown read-only (no switch)', !(await L.locator('[data-member] input[role=switch]').count()) && (await L.locator('.a-consent-ro').count()) === 7);
  world.teams[0].status = 'rejected'; world.teams[0].admin_note = 'أعد النظر في اسم الفريق.';
  await reload(L);
  check('rejected: the admin note is shown to the leader and editing is closed', /أعد النظر في اسم الفريق/.test(await L.locator('.a-teamcard').innerText()) && !(await L.locator('form.a-add').count()));
  const upd = await L.evaluate(async id => { const r = await YB.update('teams', { id: 'eq.' + id }, { status: 'approved' }, { returning: true }); return [r.ok, r.error]; }, teamId);
  check('API: a leader can never set status approved (RLS)', upd[0] === false && upd[1] === 'permission_denied');
  world.teams[0].status = 'approved'; world.teams[0].admin_note = null;
  await reload(L);
}

let memberEmail = 'sara@t.test', parentEmail = 'parent@t.test';
{
  /* ---- member: auto-confirm sign-up, then join ---- */
  world.autoConfirm = true;
  const M = await open(world, { hash: '#signup', label: 'member' });
  await settle(M);
  await signUp(M, { name: NAMES[0], email: memberEmail, role: 'member' });
  await M.waitForSelector('form[aria-label="الانضمام إلى فريق"]', { timeout: 8000 });
  check('sign-up with auto-confirm signs in directly (no needsConfirm) → member screen asks to join', (await M.locator('.a-head .a-badge').innerText()) === 'عضو' && /انضم إلى فريقك/.test(await text(M)));
  const jf = M.locator('form[aria-label="الانضمام إلى فريق"]');
  check('join form: code + name, ltr uppercase code field', (await jf.locator('input[name=code]').getAttribute('dir')) === 'ltr' && (await jf.locator('input[name=name]').count()) === 1);
  await jf.locator('input[name=code]').fill('ZZZZZZ');
  await jf.locator('input[name=name]').fill(NAMES[0]);
  await jf.locator('button[type=submit]').click();
  await M.waitForSelector('form[aria-label="الانضمام إلى فريق"] .a-err:not([hidden])');
  check('wrong code → «رمز الفريق غير صحيح»', /رمز الفريق غير صحيح/.test(await jf.locator('.a-err').innerText()));
  await jf.locator('input[name=code]').fill(teamCode.toLowerCase());
  check('the code field upper-cases what you type', (await jf.locator('input[name=code]').inputValue()) === teamCode);
  await jf.locator('input[name=name]').fill('اسم غير موجود');
  await jf.locator('button[type=submit]').click();
  await M.waitForFunction(() => /لم نجد هذا الاسم/.test(document.querySelector('form[aria-label="الانضمام إلى فريق"] .a-err').textContent));
  check('right code, name not on the roster → helpful message (write it exactly as the leader did)', /تمامًا كما كتبه قائد الفريق/.test(await jf.locator('.a-err').innerText()));
  await jf.locator('input[name=name]').fill('   ');
  await jf.locator('button[type=submit]').click();
  check('blank name refused locally', /اكتب الاسم/.test(await jf.locator('.a-err').innerText()));
  // the leader's roster says «سارة أحمد العلي»; typing the hamza/ta-marbuta variants must still match (server normalisation)
  await jf.locator('input[name=name]').fill('  ساره   احمد   العلي ');
  await jf.locator('button[type=submit]').click();
  await M.waitForSelector('.a-teamcard h3', { timeout: 8000 });
  await settle(M);
  const mt = await text(M);
  check('joined (name matched with spacing/ta-marbuta variants) → team screen', /فريق الينابيع/.test(mt) && /حي الأمل/.test(mt) && /تم ربط حسابك بالفريق/.test(mt));
  check('member sees team name, area and status chip', (await M.locator('.a-teamcard .a-chip').innerText()) === 'معتمد');
  const roster = await M.locator('.a-names-roster li').allInnerTexts();
  check('member sees the roster NAMES (7) with «قائد» and «أنا»', roster.length === 7 && roster.some(r => r.includes('قائد')) && roster.some(r => /أنا/.test(r) && r.includes(NAMES[0])));
  check('member never sees ages, guardian data, phones or the join code', !/ولي (سارة|عمر|ليلى|يوسف|مريم|أحمد)|09123456|العمر|رقم الهاتف|اسم ولي الأمر/.test(mt) && !mt.includes(teamCode) && !(await M.locator('[data-code]').count()));
  check('member sees own consent status (received: set by the admin)', /استُلمت موافقة ولي الأمر/.test(mt));
  check('no admin / leader controls on the member screen', !(await M.locator('input[role=switch], form.a-add, button[data-fk=submit], .a-tabs-4').count()));
  const reqs = world.log.filter(l => l.who === world.profileByEmail(memberEmail).id).map(l => l.path.replace('/rest/v1/', ''));
  check('member screen reads only my_team, my_roster, tournament_state and the own profile (never teams, team_members, profiles list)', reqs.every(r => /^(rpc\/(my_team|join_team|yb_mark_read|yb_my_scores|yb_my_prefs|yb_feed|yb_seek_me|yb_team_staff)|my_roster|tournament_state|profiles|yb_notifications|yb_events|yb_submissions|yb_announcements|yb_match_live|yb_team_style)$/.test(r)), [...new Set(reqs)].join());
  const tour = await M.locator('.a-sched').innerText();
  check('schedule card shows the empty state before the tournament is published', /لم تُنشر بيانات البطولة بعد/.test(tour));
  // second account tries the same name
  const M2 = await open(world, { hash: '#signup', label: 'member2' });
  await settle(M2);
  await signUp(M2, { name: 'منتحل', email: 'm2@t.test', role: 'member' });
  await M2.waitForSelector('form[aria-label="الانضمام إلى فريق"]');
  await M2.locator('input[name=code]').fill(teamCode);
  await M2.locator('input[name=name]').fill(NAMES[0]);
  await M2.locator('form[aria-label="الانضمام إلى فريق"] button[type=submit]').click();
  check('the same roster row cannot be claimed twice → already_linked message', await ok(M2.waitForFunction(() => /مرتبط بحساب آخر/.test(document.querySelector('form[aria-label="الانضمام إلى فريق"] .a-err').textContent))));
  await close(M2);
  world.M = M;
}

{
  /* ---- parent ---- */
  const P = await open(world, { hash: '#signup', label: 'parent' });
  await settle(P);
  await signUp(P, { name: 'ولي سارة', email: parentEmail, role: 'parent' });
  await P.waitForSelector('form[aria-label="ربط ابن أو ابنة"]', { timeout: 8000 });
  check('parent screen: badge ولي أمر, link-a-child form, no children yet', (await P.locator('.a-head .a-badge').innerText()) === 'ولي أمر' && /لم تربط أي ابن/.test(await text(P)));
  const lf = P.locator('form[aria-label="ربط ابن أو ابنة"]');
  await lf.locator('input[name=code]').fill(teamCode);
  await lf.locator('input[name=name]').fill('طفل ليس في القائمة');
  await lf.locator('button[type=submit]').click();
  await P.waitForFunction(() => /لم نجد هذا الاسم/.test(document.querySelector('form[aria-label="ربط ابن أو ابنة"] .a-err').textContent));
  check('unknown child name → helpful message', /تمامًا كما كتبه القائد/.test(await lf.locator('.a-err').innerText()));
  await lf.locator('input[name=code]').fill('QQQQQQ');
  await lf.locator('button[type=submit]').click();
  check('wrong code → team_not_found message', await ok(P.waitForFunction(() => /رمز الفريق غير صحيح/.test(document.querySelector('form[aria-label="ربط ابن أو ابنة"] .a-err').textContent))));
  await lf.locator('input[name=code]').fill(teamCode);
  await lf.locator('input[name=name]').fill(NAMES[0]);
  await lf.locator('button[type=submit]').click();
  await P.waitForSelector('.a-child', { timeout: 8000 });
  await settle(P);
  const pt = await text(P);
  check('linked: the child card shows the child name, team name and team status', (await P.locator('.a-child').count()) === 1 && pt.includes(NAMES[0]) && /فريق فريق الينابيع/.test(pt) && /معتمد/.test(pt));
  check('consent shown as «استُلمت» with a plain explanation and a link to the consent form', /استُلمت موافقة ولي الأمر/.test(pt) && (await P.locator('.a-child a[href="register.html#c-consent"]').count()) === 1);
  check('parent sees NO other child, no roster and no code', NAMES.slice(1).every(n => !pt.includes(n)) && !pt.includes(teamCode) && !(await P.locator('.a-names-roster').count()));
  // linking the same child again
  const lf2 = P.locator('form[aria-label="ربط ابن أو ابنة"]');
  await lf2.locator('input[name=code]').fill(teamCode);
  await lf2.locator('input[name=name]').fill(NAMES[0]);
  await lf2.locator('button[type=submit]').click();
  check('linking the same child twice → already linked message', await ok(P.waitForFunction(() => /مرتبط بحسابك بالفعل/.test(document.querySelector('form[aria-label="ربط ابن أو ابنة"] .a-err').textContent))));
  // a second child (still pending consent)
  await lf2.locator('input[name=name]').fill(NAMES[2]);
  await lf2.locator('button[type=submit]').click();
  await P.waitForFunction(() => document.querySelectorAll('.a-child').length === 2);
  await settle(P);
  const chips = await P.locator('.a-child .a-consent .a-chip').allInnerTexts();
  check('two children: one «استُلمت», one «لم تُستلم بعد»; ONE schedule card for the shared team', chips.some(c => /^استُلمت/.test(c)) && chips.some(c => /لم تُستلم/.test(c)) && (await P.locator('.a-sched').count()) === 1);
  const preqs = world.log.filter(l => l.who === world.profileByEmail(parentEmail).id).map(l => l.path.replace('/rest/v1/', ''));
  check('parent screen reads only my_children, tournament_state and the own profile', preqs.every(r => /^(rpc\/(link_child|yb_mark_read|yb_my_scores|yb_my_judging|yb_my_prefs|yb_feed|yb_guardian_seekers|yb_team_staff)|my_children|tournament_state|profiles|yb_notifications|yb_events|yb_submissions|yb_announcements|yb_match_live|yb_team_style)$/.test(r)), [...new Set(preqs)].join());
  check('parent console clean', P.errs.length === 0, P.errs.join('|'));
  world.P = P;
}

section('role isolation and live data');
{
  /* the leader marks consent: not possible after approval; the admin can */
  const L = world.L;
  // linked-account status on the leader screen
  await reload(L);
  check('leader roster shows who joined with an account', /انضم بحسابه/.test(await L.locator(`[data-member]`).filter({ hasText: NAMES[0] }).innerText()) && /لم ينضم بعد/.test(await L.locator(`[data-member]`).filter({ hasText: NAMES[1] }).innerText()));
  // an approved team: unlink is closed (server rule); reopen as admin to test unlink
  world.teams[0].status = 'draft';
  await reload(L);
  const ul = L.locator(`[data-member] button[aria-label="فكّ ارتباط حساب ${NAMES[0]}"]`);
  check('unlink button exists only for a joined member', (await ul.count()) === 1 && (await L.locator(`[data-member] button[aria-label="فكّ ارتباط حساب ${NAMES[1]}"]`).count()) === 0);
  // publish a tournament state with this team, then check the schedule on every role
  const others = Array.from({ length: 11 }, (_, i) => ({ id: 'fake-team-' + i, name: 'فريق ' + ['الصقور', 'النخيل', 'الأمل', 'الغيث', 'الندى', 'الفجر', 'السنابل', 'الرواد', 'الشروق', 'الواحة', 'المنارة'][i] }));
  let st = YT.setTeams(YT.emptyState(), [{ id: teamId, name: 'فريق الينابيع' }, ...others]);
  st = YT.drawGroups(st, () => 0.5);
  const g = st.groups.find(x => x.includes(teamId));
  const opp = g.find(x => x !== teamId);
  st = YT.setResult(st, { a: teamId, b: opp, sa: 2, sb: 1, date: '2026-11-20', time: '16:00' });
  world.setTournament(st);
  // the poll fires again when the tab becomes visible
  await L.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = world.count(/tournament_state/);
  await sleep(400);
  check('YB.poll pauses while the tab is hidden (no request)', world.count(/tournament_state/) === before);
  await L.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await L.waitForFunction(() => /2 – 1/.test(document.querySelector('.a-sched').innerText), null, { timeout: 8000 });
  const sched = await L.locator('.a-sched').innerText();
  check('leader schedule: group name, position, points and the played match with opponent name', /المجموعة [أبج]/.test(sched) && /النقاط/.test(sched) && /2 – 1 · فوز/.test(sched) && sched.includes(others.concat([{ id: teamId, name: '' }]).find(t => t.id === opp).name));
  check('the unplayed matches say «لم تُلعب بعد»; the match date and time appear', (sched.match(/لم تُلعب بعد/g) || []).length >= 2 && /2026-11-20 · 16:00/.test(sched));
  check('football status line and the chess block (no player names)', /في دور المجموعات/.test(sched) && /بطولة الشطرنج/.test(sched) && /لم يبدأ بعد/.test(sched));
  // member and parent screens show the same
  for (const [who, label] of [[world.M, 'member'], [world.P, 'parent']]) {
    await who.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await who.waitForFunction(() => /2 – 1/.test(document.querySelector('.a-sched').innerText), null, { timeout: 8000 });
    check(`${label} sees the team's group matches and result via YTour.teamView`, /2 – 1 · فوز/.test(await who.locator('.a-sched').innerText()));
  }
  // chess stage: put the team into round 1
  let st2 = YT.setChessPairs(st, 'r1', YT.drawPairs(st.teams.map(t => t.id), () => 0.3));
  world.setTournament(st2);
  await world.M.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await world.M.waitForFunction(() => /في الدور الأول/.test(document.querySelector('.a-sched').innerText), null, { timeout: 8000 });
  const chessTxt = await world.M.locator('.a-sched').innerText();
  check('chess stage appears (الدور الأول) with the opponent team name only', /في الدور الأول/.test(chessTxt) && /ضد /.test(chessTxt));
  // team missing from the published state
  world.setTournament(YT.setTeams(YT.emptyState(), others));
  await world.M.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  check('a team that is not in the published state → graceful message', await ok(world.M.waitForFunction(() => /غير مُدرج/.test(document.querySelector('.a-sched').innerText), null, { timeout: 8000 })));
  // unlink the member
  await ul.click();
  check('unlink needs a second press', world.members.find(m => m.full_name === NAMES[0]).user_id !== null);
  await ul.click();
  await L.waitForFunction(n => !document.querySelector(`[data-member] button[aria-label="فكّ ارتباط حساب ${n}"]`), NAMES[0]);
  check('unlink_member cuts the account (server)', world.members.find(m => m.full_name === NAMES[0]).user_id === null && !world.links.some(l => l.member_id === world.members.find(m => m.full_name === NAMES[0]).id));
  await reload(world.M);
  check('after the unlink the member is back at the join form', (await world.M.locator('form[aria-label="الانضمام إلى فريق"]').count()) === 1);
  await reload(world.P);
  const ptx = await text(world.P);
  check('…and the parent link of that child is gone too (the other child stays linked)', (await world.P.locator('.a-child').count()) === 1 && !ptx.includes(NAMES[0]) && ptx.includes(NAMES[2]));
}

section('print the registration form from the leader screen');
{
  const L = world.L;
  world.teams[0].status = 'draft';
  await reload(L);
  await L.evaluate(() => { try { localStorage.setItem('yanabee-reg-draft', JSON.stringify({ f: { team: 'فريق الينابيع', idea: 'فكرة قديمة', coord: '' }, m: [] })); } catch (e) { /* ignore */ } });
  await L.locator('button[data-fk=print-form]').click();
  await L.waitForURL(/register\.html/);
  const draft = await L.evaluate(() => JSON.parse(localStorage.getItem('yanabee-reg-draft')));
  check('draft: team, leader, area, e-mail and the old note of the SAME team kept', draft.f.team === 'فريق الينابيع' && draft.f.leader === LEADER.name && draft.f.area === 'حي الأمل' && draft.f.email === LEADER.email && draft.f.idea === 'فكرة قديمة');
  check('draft members: leader first, then the others, name/age/contact; at most 7', draft.m.length === 7 && draft.m[0].n === LEADER.name && draft.m.slice(1).every(x => x.n && x.a && x.c) && draft.m.length <= 7);
  await L.waitForFunction(() => document.querySelector('input[name=team]') && document.querySelector('input[name=team]').value);
  check('register.html opens with the form already filled from the draft', (await L.locator('input[name=team]').inputValue()) === 'فريق الينابيع' && (await L.locator('input[name=leader]').inputValue()) === LEADER.name && (await L.locator('[data-members] tr').count()) === 7);
  await L.goto(`${ORIGIN}/account.html`);
  await settle(L);
  await L.evaluate(() => localStorage.setItem('yanabee-reg-draft', JSON.stringify({ f: { team: 'فريق آخر', idea: 'لا تُنقل' }, m: [] })));
  await L.locator('button[data-fk=print-form]').click();
  await L.waitForURL(/register\.html/);
  const d2 = await L.evaluate(() => JSON.parse(localStorage.getItem('yanabee-reg-draft')));
  check('a draft of another team is replaced, not mixed in', d2.f.team === 'فريق الينابيع' && d2.f.idea === undefined);
  await L.goto(`${ORIGIN}/account.html`);
  await settle(L);
}

/* ================================================================ 5. admin details */
section('admin: tabs, people, tournament, export, print');
{
  const fake = new Fake();
  const adm = fake.addUser({ email: 'a@t.test', name: 'المدير', role: 'member' }); fake.setAdmin('a@t.test');
  const l1 = fake.addUser({ email: 'l1@t.test', name: 'قائد أول', role: 'leader' });
  const l2 = fake.addUser({ email: 'l2@t.test', name: 'قائد ثاني', role: 'leader' });
  const l3 = fake.addUser({ email: 'l3@t.test', name: 'قائد ثالث', role: 'leader' });
  fake.addUser({ email: 'm1@t.test', name: 'عضو تجريبي', role: 'member' });
  fake.addUser({ email: 'p1@t.test', name: 'ولي تجريبي', role: 'parent' });
  const mem = n => Array.from({ length: n }, (_, i) => ({ name: `عضو ${i + 1} من الفريق`, age: 14 }));
  const evil = { name: '=HYPERLINK("http://x")', age: 15, gname: '@cmd', gphone: '+218912345678' };
  fake.seedTeam({ leaderEmail: 'l1@t.test', name: 'الصقور', area: 'حي الزهور', status: 'approved', members: mem(5) });
  fake.seedTeam({ leaderEmail: 'l2@t.test', name: 'النخيل', area: 'حي النور', status: 'submitted', members: [...mem(2), evil] });
  fake.seedTeam({ leaderEmail: 'l3@t.test', name: 'الغيث', area: 'حي السلام', status: 'rejected', note: 'ينقص أعضاء', members: mem(2) });
  const A = await open(fake, { label: 'admin2' });
  await settle(A);
  await signInOk(A, 'a@t.test');
  const tile = async name => (await A.locator('.a-counters .a-count').filter({ hasText: name }).first().innerText()).split('\n')[0].trim();
  check('counters: all 3, draft 0, submitted 1, returned 0, approved 1, rejected 1', (await tile('كل الفرق')) === '3' && (await tile('مسودة')) === '0' && (await tile('قيد المراجعة')) === '1' && (await tile('مطلوب تعديل')) === '0' && (await tile('معتمد')) === '1' && (await tile('مرفوض')) === '1');
  await A.locator('.a-counters .a-count', { hasText: 'معتمد' }).click();
  check('clicking a counter filters the list by status (aria-pressed)', (await A.locator('.a-team').count()) === 1 && /الصقور/.test(await A.locator('.a-team').innerText()) && (await A.locator('.a-counters .a-count', { hasText: 'معتمد' }).getAttribute('aria-pressed')) === 'true');
  check('focus stays on the pressed counter after the redraw', await A.evaluate(() => document.activeElement && document.activeElement.dataset.fk === 'count-approved'));
  await A.locator('.a-counters .a-count', { hasText: 'كل الفرق' }).click();
  await A.locator('[data-account-root] input[type=search]').fill('زهور');
  check('search by area', (await A.locator('.a-team').count()) === 1 && /الصقور/.test(await A.locator('.a-team').innerText()));
  await A.locator('[data-account-root] input[type=search]').fill('قائد ثاني');
  check('search by leader name', (await A.locator('.a-team').count()) === 1 && /النخيل/.test(await A.locator('.a-team').innerText()));
  await A.locator('[data-account-root] input[type=search]').fill('لا يوجد');
  check('no match → empty message', /لا توجد فرق تطابق البحث/.test(await A.locator('.a-list').innerText()));
  await A.locator('[data-account-root] input[type=search]').fill('');
  await A.locator('.a-team', { hasText: 'النخيل' }).locator('.a-team-h').click();
  const warn = await A.locator('.a-warn').innerText();
  check('warnings: member count outside the range (4) and pending consents', /عدد الأعضاء 4/.test(warn) && /موافقات أولياء الأمور المستلمة 0 من 4/.test(warn));
  await A.locator('.a-team', { hasText: 'الغيث' }).locator('.a-team-h').click();
  check('two cards can be open at once; the rejected one shows the note', /ينقص أعضاء/.test(await A.locator('.a-team', { hasText: 'الغيث' }).innerText()));
  // keyboard: toggle with Enter on the focused header
  await A.locator('.a-team', { hasText: 'الغيث' }).locator('.a-team-h').focus();
  await A.keyboard.press('Enter');
  check('card header toggles with the keyboard and keeps focus', (await A.locator('.a-team', { hasText: 'الغيث' }).locator('.a-team-h').getAttribute('aria-expanded')) === 'false' && await A.evaluate(() => document.activeElement.classList.contains('a-team-h')));
  /* people */
  await A.locator('#at-people').click();
  const rc = await A.locator('.a-rolecount li').allInnerTexts();
  check('people tab: counts by role (1 admin, 0 officers, 3 leaders, 1 member, 1 parent)', rc.join('|').replace(/\n/g, ' ') === '1 الإدارة|0 مسؤول مسابقة|3 قائد الفريق|1 عضو|1 ولي أمر');
  check('profiles list is read-only data (6 accounts); the admin row says «أنت» and has no role select', (await A.locator('.a-person').count()) === 6 && /أنت/.test(await A.locator('.a-person', { hasText: 'المدير' }).innerText()) && !(await A.locator('.a-person', { hasText: 'المدير' }).locator('select').count()));
  check('role select offers officer / leader / member / parent (never admin)', (await A.locator('.a-person', { hasText: 'عضو تجريبي' }).locator('option').allInnerTexts()).join('|') === 'مسؤول مسابقة|قائد الفريق|عضو|ولي أمر');
  const row = A.locator('.a-person', { hasText: 'عضو تجريبي' });
  check('«حفظ الدور» is disabled until the role changes', await row.locator('button').isDisabled());
  await row.locator('select').selectOption('parent');
  await row.locator('button').click();
  await A.waitForFunction(() => /1 \n?ولي أمر|2/.test(document.querySelector('.a-rolecount').innerText));
  check('set_user_role: the member became a parent (server)', fake.profileByEmail('m1@t.test').role === 'parent');
  await A.locator('[data-account-root] input[type=search]').fill('l1@t');
  check('people search by e-mail', (await A.locator('.a-person').count()) === 1);
  const apiAdmin = await A.evaluate(async id => (await YB.rpc('set_user_role', { target: id, new_role: 'admin' })).error, fake.profileByEmail('l1@t.test').id);
  check('API: nobody can be promoted to admin', apiAdmin === 'permission_denied');
  /* tournament */
  const stateReqs = fake.count(/tournament_state/);
  await A.locator('#at-tour').click();
  await A.waitForFunction(() => /لم تُنشر بيانات البطولة بعد/.test(document.querySelector('.a-panel').innerText));
  check('tournament tab: approved teams vs the 12 expected, with a progress bar', /1\s*من 12 فريقًا معتمدًا/.test((await A.locator('.a-big').innerText()).replace(/\n/g, ' ')) && (await A.locator('[role=progressbar]').getAttribute('aria-valuenow')) === '1' && (await A.locator('[role=progressbar]').getAttribute('aria-valuemax')) === '12');
  check('…lists the approved names and links to tournament.html; the state was read once', (await A.locator('.a-names li').allInnerTexts()).join() === 'الصقور' && (await A.locator('.a-panel a[href="tournament.html"]').count()) === 1 && fake.count(/tournament_state/) === stateReqs + 1);
  fake.setTournament(YT.setTeams(YT.emptyState(), [{ id: 'a', name: 'الصقور' }, { id: 'b', name: 'ب' }]));
  await A.locator('#at-teams').click(); await A.locator('#at-tour').click();
  check('tournament tab shows how many teams the published board has', await ok(A.waitForFunction(() => /في لوحة البطولة 2 فريقًا/.test(document.querySelector('.a-panel').innerText))));
  /* export */
  await A.locator('#at-export').click();
  check('export tab: counts and a privacy warning', /3 فريقًا · 13 عضوًا/.test(await A.locator('.a-panel').innerText()) && /أسماء قاصرين/.test(await A.locator('.a-panel').innerText()));
  const [dl] = await Promise.all([A.waitForEvent('download'), A.locator('button[data-fk=csv]').click()]);
  const csvPath = await dl.path();
  const raw = fs.readFileSync(csvPath);
  const csv = raw.toString('utf8');
  check('CSV: UTF-8 BOM for Excel, file name yanabee-teams-DATE.csv', raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF && /^yanabee-teams-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()));
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  check('CSV: Arabic header (content labels) + one row per member (13)', lines.length === 14 && lines[0].includes('"اسم الفريق"') && lines[0].includes('"الحي / المنطقة"') && lines[0].includes('"الاسم الثلاثي"') && lines[0].includes('"موافقة ولي الأمر"'));
  check('CSV: team, area, status and consent state are in the rows', lines.some(l => l.includes('"الصقور"') && l.includes('"حي الزهور"') && l.includes('"معتمد"') && l.includes('"لم تُستلم"')));
  check('CSV: spreadsheet formulas from user text are neutralised, phone numbers are kept', csv.includes(`"'=HYPERLINK(""http://x"")"`) && csv.includes('"\'@cmd"') && csv.includes('"+218912345678"'));
  // print view
  await A.locator('button[data-fk=print]').evaluate(b => { window.print = () => { window.__printed = true; }; });
  await A.locator('button[data-fk=print]').click();
  check('print button builds the sheet and calls window.print', await A.evaluate(() => !!window.__printed) && (await A.locator('.a-print tbody tr').count()) === 13);
  await A.evaluate(() => document.body.classList.add('acct-printing'));
  await A.emulateMedia({ media: 'print' });
  const vis = await A.evaluate(() => ({ sheet: getComputedStyle(document.querySelector('.a-print')).display, head: getComputedStyle(document.querySelector('.a-head')).display, hero: getComputedStyle(document.querySelector('.acct-hero')).display, nav: getComputedStyle(document.querySelector('.nav')).display }));
  check('print media: only the sheet shows (header, hero and nav hidden)', vis.sheet === 'block' && vis.head === 'none' && vis.hero === 'none' && vis.nav === 'none', JSON.stringify(vis));
  await A.emulateMedia({ media: 'screen' });
  await A.evaluate(() => document.body.classList.remove('acct-printing'));
  check('screen media: the sheet is hidden again', (await A.evaluate(() => getComputedStyle(document.querySelector('.a-print')).display)) === 'none');
  /* tablist keyboard on the admin tabs */
  await A.locator('#at-teams').click();
  await A.locator('#at-teams').focus();
  await A.keyboard.press('ArrowLeft');
  check('admin tabs: arrow keys move to the next tab and keep focus on it', (await A.locator('#at-stats').getAttribute('aria-selected')) === 'true' && await A.evaluate(() => document.activeElement.id) === 'at-stats');
  check('exactly one admin tab is tabbable', (await A.locator('[role=tab][tabindex="0"]').count()) === 1);
  check('admin console clean', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  /* a leader / member / parent can never get the admin screen */
  const NA = [['l1@t.test', 'leader'], ['m1@t.test', 'parent'], ['p1@t.test', 'parent']];
  for (const [em] of NA) {
    const X = await open(fake, { label: 'nonadmin' });
    await settle(X);
    await signInOk(X, em);
    const tx = await text(X);
    check(`${em}: no admin screen (no counters, no people list, no export, no «الإدارة» badge)`, !(await X.locator('.a-counters, .a-rolecount, [role=tablist].a-tabs-4').count()) && !/الإدارة/.test(await X.locator('.a-head').innerText()) && !/تصدير/.test(tx));
    // direct API reads show what RLS gives them
    const seen = await X.evaluate(async () => ({ profiles: (await YB.q('profiles', { select: 'id' })).length, teams: (await YB.q('teams', { select: 'id' })).length, members: (await YB.q('team_members', { select: 'id' })).length }));
    check(`${em}: RLS in the fake — own profile only${em.startsWith('l1') ? ', own team only' : ', no teams'}`, seen.profiles === 1 && seen.teams === (em.startsWith('l1') ? 1 : 0));
    const apr = await X.evaluate(async () => (await YB.rpc('approve_team', { team_id: '00000000-0000-0000-0000-000000000000', ok: true, note: null })).error);
    check(`${em}: approve_team is admin-only (permission_denied)`, apr === 'permission_denied');
    await close(X);
  }
}

/* ================================================================ 6. failure paths */
section('failure paths: network, server errors, expiry, recovery link');
{
  const fake = new Fake();
  fake.addUser({ email: 'u@t.test', name: 'مستخدم', role: 'leader' });
  fake.addUser({ email: 'mm@t.test', name: 'عضو', role: 'member' });
  const p = await open(fake, { label: 'failures' });
  await settle(p);
  fake.failNext(/token/, { abort: true });
  await signIn(p, 'u@t.test');
  await p.waitForSelector('#panel-login form[aria-label="تسجيل الدخول"] .a-err:not([hidden])');
  check('network failure on login → plain Arabic message (no blank, no crash)', /تعذّر الاتصال بالخادم/.test(await p.locator('#panel-login form[aria-label="تسجيل الدخول"] .a-err').innerText()) && (await p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]').isEnabled()));
  fake.failNext(/token/, { status: 429, body: { code: 429, error_code: 'over_request_rate_limit', msg: 'For security purposes, you can only request this after 5 seconds.' } });
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]').click();
  check('rate limit (429) → «محاولات كثيرة»', await ok(p.waitForFunction(() => /محاولات كثيرة/.test(document.querySelector('#panel-login form[aria-label="تسجيل الدخول"] .a-err').textContent))));
  fake.failNext(/token/, { status: 500, body: { message: 'Internal Server Error' } });
  await p.locator('#panel-login form[aria-label="تسجيل الدخول"] button[type=submit]').click();
  check('server error (500) → «الخادم غير متاح مؤقتًا»', await ok(p.waitForFunction(() => /الخادم غير متاح مؤقتًا/.test(document.querySelector('#panel-login form[aria-label="تسجيل الدخول"] .a-err').textContent))));
  fake.failNext(/recover/, { abort: true });
  await p.locator('#panel-login .a-link', { hasText: 'نسيت كلمة المرور' }).click();
  await p.locator('#panel-login form[aria-label="إعادة تعيين كلمة المرور"] input[name=email]').fill('u@t.test');
  await p.locator('#panel-login form[aria-label="إعادة تعيين كلمة المرور"] button[type=submit]').click();
  check('reset: a network error is reported (it does not pretend to have sent)', await ok(p.waitForFunction(() => /تعذّر الاتصال/.test(document.querySelector('#panel-login form[aria-label="إعادة تعيين كلمة المرور"] .a-err').textContent))));
  await p.evaluate(() => { location.hash = 'login'; });
  /* profile load failure -> error block with retry, never blank */
  fake.failNext(/rest\/v1\/profiles/, { status: 500, body: { message: 'Internal Server Error' }, times: 2 });
  await signIn(p, 'u@t.test');
  await p.waitForSelector('[data-account-root] [role=alert]', { timeout: 8000 });
  await sleep(150);
  check('profile load failure → error panel with «أعد المحاولة» and «خروج» (not blank)', /تعذّر تحميل بيانات حسابك/.test(await text(p)) && (await p.locator('[data-account-root] button', { hasText: 'أعد المحاولة' }).count()) === 1);
  await p.locator('[data-account-root] button', { hasText: 'أعد المحاولة' }).click();
  await p.waitForSelector('.a-app', { timeout: 8000 });
  await settle(p);
  check('retry succeeds → leader screen', (await p.locator('.a-head .a-badge').innerText()) === 'قائد الفريق');
  /* data load failure on the leader screen */
  fake.failNext(/rpc\/my_team/, { status: 500, body: { message: 'Internal Server Error' } });
  await p.reload();
  await p.waitForSelector('[data-account-root] .a-error', { timeout: 8000 });
  check('leader data failure → error panel with retry', (await p.locator('[data-account-root] .a-error button').count()) === 1);
  await p.locator('[data-account-root] .a-error button').click();
  check('…and retry loads the create-team form', await ok(p.waitForSelector('form[aria-label="إنشاء الفريق"]', { timeout: 8000 })));
  /* a failed write keeps the form and says why */
  fake.failNext(/rest\/v1\/teams/, { status: 500, body: { message: 'Internal Server Error' } });
  await p.locator('input[name=team]').fill('فريق الاختبار');
  await p.locator('form[aria-label="إنشاء الفريق"] button[type=submit]').click();
  await p.waitForSelector('form[aria-label="إنشاء الفريق"] .a-err:not([hidden])');
  check('failed team creation → message in the form, the typed name is kept', /الخادم غير متاح/.test(await p.locator('form[aria-label="إنشاء الفريق"] .a-err').innerText()) && (await p.locator('input[name=team]').inputValue()) === 'فريق الاختبار');
  await p.locator('form[aria-label="إنشاء الفريق"] button[type=submit]').click();
  await p.waitForSelector('[data-counter]');
  check('second try creates the team (no duplicate from the failed try)', fake.teams.length === 1);
  /* silent token refresh */
  fake.expireAccess();
  fake.log.length = 0;
  await p.locator('button[data-fk=copy-code]').waitFor();
  await p.locator('form.a-add input[name=name]').fill('عضو بعد التجديد');
  await p.locator('form.a-add input[name=age]').fill('14');
  await p.locator('form.a-add button[type=submit]').click();
  await p.waitForFunction(() => document.querySelector('[data-counter]').textContent.startsWith('2 /'));
  check('expired access token is refreshed silently (refresh_token grant) and the action succeeds', fake.count(/token/) === 1 && fake.members.length === 2);
  /* session lost for good (after the leader screen's own background reads have finished) */
  await p.waitForLoadState('networkidle').catch(() => {}); await sleep(200);
  fake.expireAccess(); fake.revokeRefresh();
  await p.locator('form.a-add input[name=name]').fill('عضو بعد الانتهاء');
  await p.locator('form.a-add input[name=age]').fill('14');
  await p.locator('form.a-add button[type=submit]').click();
  await p.waitForSelector('#panel-login', { state: 'visible', timeout: 8000 });
  check('session gone → back to the login form with the «انتهت جلستك» notice (role="alert")', /انتهت جلستك/.test(await text(p)) && (await p.locator('.a-banner.bad[role=alert]').count()) === 1);
  check('…the previous user\'s data is gone from the page', !(await html(p)).includes('فريق الاختبار') && !(await html(p)).includes('عضو بعد'));
  check('…and the stored session was removed', (await p.evaluate(() => localStorage.getItem('yanabee-session-v1'))) === null);
  /* manual sign out */
  await signInOk(p, 'mm@t.test');
  check('member without a team sees the join form', (await p.locator('form[aria-label="الانضمام إلى فريق"]').count()) === 1);
  await p.locator('.a-head button', { hasText: 'خروج' }).click();
  await p.waitForSelector('#panel-login', { state: 'visible' });
  check('sign out → login form with «تم تسجيل الخروج»', /تم تسجيل الخروج/.test(await text(p)) && fake.count(/logout/) === 1);
  check('…focus goes to the e-mail field', await p.evaluate(() => document.activeElement && document.activeElement.name === 'email'));
  /* change password from the header */
  await signInOk(p, 'u@t.test');
  await p.locator('.a-head button', { hasText: 'تغيير كلمة المرور' }).click();
  const pf = p.locator('form[aria-label="تغيير كلمة المرور"]');
  check('change-password panel opens (aria-expanded) with the first field focused', (await p.locator('.a-head button[aria-expanded]', { hasText: 'تغيير كلمة المرور' }).getAttribute('aria-expanded')) === 'true' && await p.evaluate(() => document.activeElement.name === 'password'));
  await pf.locator('input[name=password]').fill('Newpass99');
  await pf.locator('input[name=confirm]').fill('Newpass00');
  await pf.locator('button[type=submit]').click();
  check('mismatch refused locally', /غير متطابقتين/.test(await pf.locator('.a-err').innerText()));
  await pf.locator('input[name=confirm]').fill('Newpass99');
  await pf.locator('button[type=submit]').click();
  await p.waitForSelector('.a-flash .a-banner');
  check('password changed (server) and confirmed on screen; panel closed', fake.users.find(u => u.email === 'u@t.test').password === 'Newpass99' && /تم تغيير كلمة المرور/.test(await p.locator('.a-flash').innerText()) && !(await p.locator('.a-pwbox').isVisible()));
  await p.locator('.a-head button', { hasText: 'تغيير كلمة المرور' }).click();
  await pf.locator('input[name=password]').fill('Newpass99');
  await pf.locator('input[name=confirm]').fill('Newpass99');
  await pf.locator('button[type=submit]').click();
  check('the same password again → «يجب أن تختلف كلمة المرور الجديدة»', await ok(p.waitForFunction(() => /تختلف|يجب أن تختلف/.test(document.querySelector('form[aria-label="تغيير كلمة المرور"] .a-err').textContent))));
  await close(p);

  /* recovery link */
  const r = fake.profileByEmail('u@t.test');
  const tok = fake.session(r.id);
  const R = await open(fake, { hash: `#access_token=${tok.access_token}&refresh_token=${tok.refresh_token}&expires_in=3600&type=recovery`, label: 'recovery' });
  await R.waitForSelector('form[aria-label="كلمة مرور جديدة"]', { timeout: 8000 });
  check('recovery link → new-password form (no tokens left in the address bar)', !(await R.evaluate(() => location.href)).includes('access_token') && /اختر كلمة مرور جديدة/.test(await text(R)));
  const nf = R.locator('form[aria-label="كلمة مرور جديدة"]');
  await nf.locator('input[name=password]').fill('short');
  await nf.locator('button[type=submit]').click();
  check('short new password refused', /8 أحرف/.test(await nf.locator('.a-err').innerText()));
  await nf.locator('input[name=password]').fill('Brandnew123');
  await nf.locator('input[name=confirm]').fill('Brandnew124');
  await nf.locator('button[type=submit]').click();
  check('mismatch refused', /غير متطابقتين/.test(await nf.locator('.a-err').innerText()));
  await nf.locator('input[name=confirm]').fill('Brandnew123');
  await nf.locator('button[type=submit]').click();
  await R.waitForSelector('.a-app', { timeout: 8000 });
  await settle(R);
  check('after saving: the role screen opens with a confirmation', fake.users.find(u => u.email === 'u@t.test').password === 'Brandnew123' && /تم تغيير كلمة المرور/.test(await text(R)) && (await R.locator('.a-head .a-badge').innerText()) === 'قائد الفريق');
  await close(R);
  const E = await open(fake, { hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', label: 'linkerr' });
  await settle(E);
  check('expired e-mail link → banner with the Arabic reason, login form shown', /انتهت صلاحية الرابط/.test(await text(E)) && await E.locator('#panel-login').isVisible());
  await close(E);
  const B = await open(fake, { hash: '#access_token=garbage&refresh_token=garbage&type=recovery', label: 'badlink' });
  await settle(B);
  check('a garbage recovery link → login form + «الرابط غير صالح» (never the password form)', /الرابط غير صالح/.test(await text(B)) && !(await B.locator('form[aria-label="كلمة مرور جديدة"]').count()));
  await close(B);
}

/* ================================================================ 7. layout, themes, accessibility, privacy of the DOM */
section('layout at 390px and 1280px, themes, targets, DOM privacy');
const SHOTS = path.join(process.env.ACCOUNT_SHOTS || '', '');
{
  const fake = new Fake();
  const adm = fake.addUser({ email: 'a@t.test', name: 'مديرة المسابقة', role: 'member' }); fake.setAdmin('a@t.test');
  fake.addUser({ email: 'l@t.test', name: 'خالد المنصور', role: 'leader' });
  const kids = ['سارة أحمد العلي', 'عمر خالد الحسن', 'ليلى محمود سالم', 'يوسف إبراهيم نور', 'مريم عبدالله زين', 'أحمد سليمان رضا'].map((n, i) => ({ name: n, age: 12 + i, gname: 'ولي ' + n.split(' ')[0], gphone: '091234560' + i, consent: i % 2 ? 'received' : 'pending' }));
  const t1 = fake.seedTeam({ leaderEmail: 'l@t.test', name: 'فريق الينابيع', area: 'حي الأمل', status: 'submitted', members: kids });
  fake.addUser({ email: 'l2@t.test', name: 'قائد آخر', role: 'leader' });
  fake.seedTeam({ leaderEmail: 'l2@t.test', name: 'فريق الصقور', status: 'approved', members: kids.slice(0, 4).map(k => ({ ...k, name: k.name + ' ب' })) });
  const mp = fake.addUser({ email: 'm@t.test', name: 'سارة أحمد العلي', role: 'member' });
  fake.members.find(m => m.full_name === kids[0].name).user_id = mp.id;
  const pp = fake.addUser({ email: 'p@t.test', name: 'ولي سارة', role: 'parent' });
  fake.links.push({ parent_id: pp.id, member_id: fake.members.find(m => m.full_name === kids[0].name).id });
  fake.links.push({ parent_id: pp.id, member_id: fake.members.find(m => m.full_name === kids[1].name).id });
  const others = Array.from({ length: 11 }, (_, i) => ({ id: 'ot-' + i, name: 'فريق ' + (i + 1) }));
  let st = YT.drawGroups(YT.setTeams(YT.emptyState(), [{ id: t1.id, name: t1.name }, ...others]), () => 0.4);
  const gg = st.groups.find(x => x.includes(t1.id));
  st = YT.setResult(st, { a: t1.id, b: gg.find(x => x !== t1.id), sa: 3, sb: 1, date: '2026-11-22', time: '17:30' });
  st = YT.setChessPairs(st, 'r1', YT.drawPairs(st.teams.map(t => t.id), () => 0.2));
  fake.setTournament(st);

  const SCREENS = [['signedout', null, ''], ['signup', null, '#signup'], ['admin', 'a@t.test', ''], ['leader', 'l@t.test', ''], ['member', 'm@t.test', ''], ['parent', 'p@t.test', '']];
  const TARGETS = 'button:not([tabindex="-1"]), [role=tab], a.btn, select, textarea, input:not([type=radio]):not([type=checkbox]):not([type=hidden])';
  for (const mobile of [true, false]) {
    for (const scheme of ['light', 'dark']) {
      for (const [name, email, hash] of SCREENS) {
        const label = `${name}-${mobile ? 390 : 1280}-${scheme}`;
        const P = await open(fake, { mobile, viewport: { width: 1280, height: 900 }, colorScheme: scheme, hash, label });
        await settle(P);
        if (email) { await signInOk(P, email); if (name === 'admin') { await P.locator('.a-team', { hasText: 'فريق الينابيع' }).locator('.a-team-h').click(); } }
        await P.waitForFunction(() => !document.querySelector('.a-sched .a-skel'), null, { timeout: 8000 }).catch(() => {});
        await sleep(150);
        const ov = await overflow(P);
        check(`${label}: no horizontal overflow`, ov <= 0, 'overflow ' + ov);
        if (scheme === 'light') {
          const small = await P.evaluate(sel => [...document.querySelectorAll('[data-account-root] ' + sel.split(',').join(', [data-account-root] '))].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !e.closest('[hidden]'); })
            .map(e => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`), TARGETS);
          check(`${label}: every button / tab / field is at least 44px`, small.length === 0, small.slice(0, 5).join(' '));
          const sw = await P.evaluate(() => [...document.querySelectorAll('[data-account-root] .a-sw')].filter(l => l.getBoundingClientRect().height < 43.5).length);
          check(`${label}: consent switches have a 44px target`, sw === 0);
        }
        const cs = await P.evaluate(() => ({ theme: document.documentElement.dataset.theme, body: getComputedStyle(document.body).backgroundColor, card: (document.querySelector('[data-account-root] .a-card') ? getComputedStyle(document.querySelector('[data-account-root] .a-card')).backgroundColor : '') }));
        check(`${label}: ${scheme} theme applied through tokens (body and card colours)`, cs.theme === scheme && (scheme === 'dark' ? /^rgb\((\d|[1-3]\d), /.test(cs.body) : /^rgb\((2[0-9]{2}), /.test(cs.body)) && (!cs.card || cs.card !== 'rgba(0, 0, 0, 0)'), JSON.stringify(cs));
        // contrast of the chips and hints against their own background
        const lowc = await P.evaluate(() => {
          const cvs = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
          const rgb = c => { cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = '#000'; cvs.fillStyle = c; cvs.fillRect(0, 0, 1, 1); const d = cvs.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
          const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const bgOf = el => { let e = el; while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] > 0.95) return c; e = e.parentElement; } return rgb('#fff'); };
          const bad = [];
          document.querySelectorAll('[data-account-root] .a-chip, [data-account-root] .a-hint, [data-account-root] .a-lead, [data-account-root] .a-state, [data-account-root] .a-counter, [data-account-root] .a-l, [data-account-root] .a-team-t b, [data-account-root] .a-m-r, [data-account-root] .a-link').forEach(el => {
            if (!el.textContent.trim() || el.closest('[hidden]')) return;
            const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
            const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            if (ratio < 4.5) bad.push(`${el.className}:${ratio.toFixed(2)}`);
          });
          return bad;
        });
        check(`${label}: text contrast ≥ 4.5:1`, lowc.length === 0, lowc.slice(0, 6).join(' '));
        if (process.env.ACCOUNT_SHOTS) {
          fs.mkdirSync(process.env.ACCOUNT_SHOTS, { recursive: true });
          const box = await P.locator('[data-account-root]').boundingBox();
          const w = mobile ? 390 : 1280;
          for (let k = 0; k < 3; k++) {
            if (box.height < k * 1300) break;
            await P.screenshot({ path: path.join(process.env.ACCOUNT_SHOTS, `acct-${label}-${k}.png`), fullPage: true, clip: { x: 0, y: box.y + k * 1300 + (k ? 0 : -20), width: w, height: Math.min(1300, box.height - k * 1300 + 20) } });
          }
        }
        if (scheme === 'light' && !mobile) {
          /* DOM privacy: names appear only where allowed */
          const dom = await P.evaluate(() => document.documentElement.outerHTML);
          const lsAll = await P.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
          if (email) {
            const sess = JSON.parse(await P.evaluate(() => localStorage.getItem('yanabee-session-v1')));
            check(`${label}: tokens and password never appear in the DOM or the address bar`, !dom.includes(sess.access_token) && !dom.includes(sess.refresh_token) && !dom.includes('Passw0rd!') && !(await P.evaluate(() => location.href)).includes(sess.access_token));
            check(`${label}: only the YB session (and theme, and the app's page count) is in storage; no password anywhere`, !lsAll.includes('Passw0rd!') && Object.keys(JSON.parse(lsAll).l).every(k => ['yanabee-session-v1', 'yanabee-theme', 'yanabee-pwa', 'yanabee-dash'].includes(k)) && !/token|@|pass/i.test((JSON.parse(lsAll).l['yanabee-pwa'] || '') + (JSON.parse(lsAll).l['yanabee-dash'] || '')) && !Object.keys(JSON.parse(lsAll).s).some(k => /token|pass/i.test(k)), lsAll.slice(0, 200));
          }
          const kidsIn = kids.filter(k => dom.includes(k.name)).length;
          const expected = { signedout: 0, signup: 0, admin: 6, leader: 6, member: 6, parent: 2 }[name];
          check(`${label}: children's names appear only where allowed (${expected})`, kidsIn === expected, `${kidsIn}`);
          if (['signedout', 'signup'].includes(name)) check(`${label}: nothing about any account in the signed-out page`, !/خالد المنصور|فريق الينابيع|@t\.test/.test(dom));
          if (name === 'parent') check(`${label}: parent sees only the two linked children`, kids.slice(2).every(k => !dom.includes(k.name)) && !dom.includes('فريق الصقور'));
          if (name === 'member') check(`${label}: member DOM has no guardian data or code`, !/ولي (سارة|عمر|ليلى|يوسف|مريم|أحمد)|09123456|data-code/.test(dom) && !dom.includes(t1.join_code));
          if (name === 'leader') check(`${label}: leader sees only their own team (not another team's name)`, !dom.includes('فريق الصقور'));
        }
        await close(P);
      }
    }
  }
}

/* ================================================================ 8. keyboard-only run of the login form, focus order */
section('keyboard');
{
  const fake = new Fake();
  fake.addUser({ email: 'k@t.test', name: 'لوحة المفاتيح', role: 'parent' });
  const P = await open(fake, { label: 'keyboard' });
  await settle(P);
  await P.locator('#tab-login').focus();
  const order = [];
  for (let i = 0; i < 6; i++) { await P.keyboard.press('Tab'); order.push(await P.evaluate(() => { const e = document.activeElement; return e.name || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 12); })); }
  check('Tab order in the login form: e-mail → password → show-password → دخول → نسيت كلمة المرور', order[0] === 'email' && order[1] === 'password' && /إظهار/.test(order[2]) && /دخول/.test(order[3]) && /نسيت/.test(order[4]), order.join(' | '));
  await P.locator('#panel-login form[aria-label="تسجيل الدخول"] input[name=email]').focus();
  await P.keyboard.type('k@t.test');
  await P.keyboard.press('Tab');
  await P.keyboard.type('Passw0rd!');
  await P.keyboard.press('Enter');
  await P.waitForSelector('.a-app', { timeout: 8000 });
  await settle(P);
  check('signed in by keyboard only; focus moves to the account heading', await P.evaluate(() => document.activeElement && document.activeElement.tagName === 'H2' && !!document.activeElement.closest('.a-head')));
  const visible = await P.evaluate(() => { const e = document.activeElement; return getComputedStyle(e).outlineStyle; });
  check('every control shows a focus outline (focus-visible)', visible !== undefined);
  check('aria-live region exists and is polite', (await P.locator('[data-live]').getAttribute('aria-live')) === 'polite' && (await P.locator('[data-live]').getAttribute('role')) === 'status');
  await close(P);
}

/* ================================================================ 8b. DEMO MODE (وضع تجريبي): fake data, tab only, no admin */
section('demo mode: why sign up + three demo users, no admin, no backend');
{
  const BANNER = 'وضع تجريبي: بيانات وهمية تُحفظ في هذا المتصفح فقط ولا تتصل بأي قاعدة بيانات';
  const foreign = [];
  const watch = p => p.on('request', r => { try { const u = new URL(r.url()); if (u.host !== new URL(ORIGIN).host && !FONT_HOST.test(u.host) && !/^(data|blob):/.test(r.url())) foreign.push(r.url()); } catch (e) { /* ignore */ } });
  const demoFlag = p => p.evaluate(() => sessionStorage.getItem('yanabee-demo'));
  const lsSession = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('yanabee-session-v1') || 'null'); } catch (e) { return null; } });
  const dbOf = p => p.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('yanabee-demo-db-v1') || 'null'); } catch (e) { return null; } });
  const wait = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });

  /* ---- the signed-out hub when the backend is not connected */
  const p = await open(null, { config: 'none', label: 'demo-hub' });
  watch(p);
  await settle(p);
  const tx = await text(p);
  check('unconfigured: the honest line stays (the owner must connect the database) and is the only h2', /الحسابات غير مفعّلة بعد على هذا الموقع/.test(tx) && /مالك الموقع/.test(tx) && (await p.locator('[data-account-root] h2').count()) === 1);
  check('unconfigured: «ليش تنشئ حسابًا؟» with a benefit per role and the public-board line + link', /ليش تنشئ حسابًا؟/.test(tx) && ['قائد فريق', 'عضو في فريق', 'ولي أمر'].every(x => tx.includes(x)) && /لا تحتاج حسابًا لمتابعة الترتيب العام/.test(tx) && (await p.locator('.a-why a[href="tournament.html"]').count()) === 1);
  check('unconfigured: three demo buttons (قائد فريق / عضو / ولي أمر), NO admin button and no admin wording', (await p.locator('[data-demo]').count()) === 3 && !/جرّب كإدارة|جرّب كمدير/.test(tx)
    && (await p.locator('[data-demo]').evaluateAll(b => b.map(x => x.dataset.demo))).join() === 'leader,member,parent' && /جرّب كقائد فريق/.test(tx) && /جرّب كعضو/.test(tx) && /جرّب كولي أمر/.test(tx));
  check('unconfigured: no sign-up / login form, no tabs', !(await p.locator('[data-account-root] form').count()) && !(await p.locator('[role=tab]').count()));
  check('no demo banner and no demo session before the demo is entered', !(await p.locator('.yd-bar').count()) && (await demoFlag(p)) === null && (await lsSession(p)) === null);
  check('without the flag the fetch wrapper is NOT installed (native fetch) and YBDemo is inactive', await p.evaluate(() => /native code/.test(Function.prototype.toString.call(window.fetch)) && window.YBDemo.active === false));
  check('no request left the page', foreign.length === 0, foreign.join());
  /* keyboard: focus a demo button and press Enter */
  await p.locator('[data-demo=leader]').focus();
  await p.keyboard.press('Enter');
  await p.waitForSelector('.yd-bar', { timeout: 8000 });
  await p.waitForSelector('.a-app', { timeout: 8000 });
  await settle(p);

  /* ---- inside the leader demo */
  check('banner text is exactly the owner\'s sentence; region with a label', (await p.locator('.yd-msg').innerText()) === BANNER && (await p.locator('.yd-bar').getAttribute('role')) === 'region');
  check('switcher offers ONLY leader / member / parent; leader pressed; exit button', (await p.locator('[data-yd-user]').evaluateAll(b => b.map(x => x.dataset.ydUser + ':' + x.getAttribute('aria-pressed')))).join() === 'leader:true,member:false,parent:false' && (await p.locator('[data-yd-exit]').count()) === 1);
  check('banner has no admin wording', !/الإدارة|مدير/.test(await p.locator('.yd-bar').innerText()));
  const sess = await lsSession(p);
  check('fake session: token starts with demo-, flag set in this tab only', sess && sess.access_token.startsWith('demo-') && (await demoFlag(p)) === '1' && (await p.evaluate(() => localStorage.getItem('yanabee-demo'))) === null);
  check('YB is configured by the demo (fake host, non-writable config) — the real config is never used', await p.evaluate(() => YB.configured === true && window.YB_CONFIG.url === 'https://demo.yanabee.invalid' && window.YB_CONFIG.anonKey === 'demo-anon' && (() => { window.YB_CONFIG = { url: 'https://evil.test', anonKey: 'x' }; return window.YB_CONFIG.url === 'https://demo.yanabee.invalid'; })()));
  check('leader screen: badge قائد الفريق, header shows «خروج من التجربة»', (await p.locator('.a-head .a-badge').innerText()) === 'قائد الفريق' && /خروج من التجربة/.test(await p.locator('.a-head').innerText()));
  check('leader team: فريق الينابيع الافتراضي, draft, 5 / 7, join code of 6 characters, submit enabled (5 demo members)', /فريق الينابيع الافتراضي/.test(await p.locator('.a-teamcard').innerText()) && (await p.locator('.a-teamcard .a-chip').first().innerText()) === 'مسودة'
    && (await p.locator('[data-counter]').innerText()) === '5 / 7' && /^[A-HJ-KM-NP-Z2-9]{6}$/.test(await p.locator('[data-code]').innerText()) && await p.locator('button[data-fk=submit]').isEnabled());
  const names = await p.locator('.a-mem-h b').allInnerTexts();
  check('every demo person is clearly fake (names end in «الافتراضي»)', names.length === 5 && names.every(n => n.endsWith('الافتراضي')), names.join('|'));
  check('the pre-published board shows fixtures and results on the leader screen (group, played and pending matches)', await ok(wait(p, () => /المجموعة [أبج]/.test(document.querySelector('.a-sched').innerText) && /\d – \d · (فوز|خسارة|تعادل)/.test(document.querySelector('.a-sched').innerText) && /لم تُلعب بعد/.test(document.querySelector('.a-sched').innerText))));
  // add / consent / delete / regenerate / submit, all against the in-page fake
  const add = p.locator('form.a-add');
  await add.locator('input[name=name]').fill('هدى رشيد الافتراضي');
  await add.locator('input[name=age]').fill('13');
  await add.locator('input[name=gname]').fill('ولي هدى الافتراضي');
  await add.locator('button[type=submit]').click();
  await p.waitForFunction(() => document.querySelector('[data-counter]').textContent.startsWith('6 /'));
  const rm = p.locator('[data-member] button[aria-label="حذف هدى رشيد الافتراضي"]');
  await rm.click(); await rm.click();
  await p.waitForFunction(() => document.querySelector('[data-counter]').textContent.startsWith('5 /'));
  check('demo: add a member (6/7) then delete it (5/7)', (await p.locator('[data-counter]').innerText()) === '5 / 7');
  const sw = p.locator('[data-member] input[role=switch]').nth(2);
  const was = await sw.isChecked();
  await sw.setChecked(!was, { force: true });
  await p.waitForFunction(w => { const e = document.querySelectorAll('[data-member] input[role=switch]')[2]; return e && e.checked !== w && !e.disabled; }, was);
  check('demo: the paper-consent switch works', (await p.locator('[data-member] input[role=switch]').nth(2).isChecked()) === !was);
  const code1 = await p.locator('[data-code]').innerText();
  const rg = p.locator('button[data-fk=regen]'); await rg.click(); await rg.click();
  await p.waitForFunction(c => document.querySelector('[data-code]').textContent !== c, code1);
  check('demo: regenerate the join code', (await p.locator('[data-code]').innerText()) !== code1);
  await p.locator('button[data-fk=submit]').click();
  await p.waitForSelector('.a-steps li.now.s-returned');
  check('demo: submit (5 members) → the demo plays the reviewer: مطلوب تعديل with an example note', (await p.locator('.a-teamcard .a-chip').first().innerText()) === 'مطلوب تعديل' && /مراجعة تجريبية/.test(await p.locator('.a-teamcard .a-note').innerText()));
  await p.waitForSelector('.a-bell:not([hidden])');
  await p.evaluate(() => YB.rpc('yb_my_team_roster_status', {}));
  check('demo: the leader bell shows 1 notification about the return', (await p.locator('.a-bell .a-bell-n').innerText()) === '1' || await p.evaluate(async () => (await YB.q('yb_notifications', { select: 'id' })).length === 1));
  check('demo: roster status ticks (the parent of عضو التجربة is linked)', /ولي الأمر مرتبط بحسابه/.test(await p.locator('.a-roster').innerText()));
  const leaderCode = await p.locator('[data-code]').innerText();

  /* ---- no admin anywhere in the demo (database, session, endpoints) */
  const adm = await p.evaluate(async () => {
    const out = {};
    out.users = YBDemo.users.map(u => u.key).join();
    out.role = YB.session().profile.role;
    const a = await YB.rpc('approve_team', { team_id: 'team-1', ok: true, note: null });
    const r = await YB.rpc('set_user_role', { target: 'u-member', new_role: 'leader' });
    const pub = await YB.publishState({ v: 1, teams: [] }, null);
    const ins = await YB.insert('tournament_state', { id: 1, state: {} });
    out.errs = [a.error, r.error, pub.error, ins.error].join();
    out.profiles = (await YB.q('profiles', { select: 'id,role' })).map(x => x.role).join();
    out.teams = (await YB.q('teams', { select: 'id' })).length;
    out.others = (await YB.q('team_members', { select: 'id', filter: { team_id: 'eq.team-2' } })).length;
    out.approveOwn = (await YB.update('teams', { id: 'eq.team-1' }, { status: 'approved' }, { returning: true })).error;
    return out;
  });
  check('the session role is leader and the only demo users are leader / member / parent', adm.role === 'leader' && adm.users === 'leader,member,parent');
  check('admin-only endpoints answer permission_denied: approve_team, set_user_role, publish_state, writing the tournament', adm.errs === 'permission_denied,permission_denied,permission_denied,permission_denied', adm.errs);
  check('RLS-like reads: own profile only (not admin), own team only, no other team\'s roster', adm.profiles === 'leader' && adm.teams === 1 && adm.others === 0, JSON.stringify(adm));
  check('a leader cannot approve their own team (status approved refused)', adm.approveOwn === 'permission_denied');
  const dbj = await dbOf(p);
  check('the fake DB holds NO admin profile: 12 demo teams (11 with fake leaders + the user team, a draft), all names fake', dbj && !dbj.profiles.some(x => x.role === 'admin') && dbj.teams.length === 12 && dbj.teams.filter(t => t.status === 'approved').length === 11 && dbj.teams.every(t => t.name.endsWith('الافتراضي')) && !JSON.stringify(dbj).includes('"admin"'));
  check('the pre-published board is deterministic: 12 teams, groups drawn, 9 group matches played, no final round', await p.evaluate(async () => { const r = await YB.getState(); const o = YTour.overview(r.state); const fb = YTour.football(r.state); return r.state.teams.length === 12 && o.drawn === true && fb.played === 9 && !fb.final; }));
  // tampering: a session claiming to be admin, or a user key 'admin', never yields an admin
  await p.evaluate(() => { sessionStorage.setItem('yanabee-demo-user', 'admin'); localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: 'demo-t-u-admin', refresh_token: 'demo-r-u-admin', expires_at: 4102444800, user: { id: 'u-admin', email: 'admin@demo.invalid' } })); });
  await p.reload(); await p.waitForSelector('.a-app', { timeout: 8000 }); await settle(p);
  check('tampering with the user key or the token still gives the leader (no admin exists to become)', (await p.locator('.a-head .a-badge').innerText()) === 'قائد الفريق' && (await lsSession(p)).user.id === 'u-leader');

  /* ---- the switcher: member and parent see the same shared data, and it persists across reloads */
  await p.locator('[data-yd-user=member]').click();
  await p.waitForSelector('.a-teamcard', { timeout: 8000 }); await settle(p);
  const mt = await text(p);
  check('switch to عضو: badge, team, roster names (all fake), consent received', (await p.locator('.a-head .a-badge').innerText()) === 'عضو' && /فريق الينابيع الافتراضي/.test(mt) && (await p.locator('.a-names-roster li').count()) === 5 && /استُلمت موافقة ولي الأمر/.test(mt) && !mt.includes(leaderCode));
  check('member screen: the leader\'s team status is visible (state shared in the fake DB)', (await p.locator('.a-teamcard .a-chip').first().innerText()) === 'مطلوب تعديل');
  check('member: fixtures and results from the pre-published board', await ok(wait(p, () => /\d – \d · (فوز|خسارة|تعادل)/.test(document.querySelector('.a-sched').innerText))));
  check('member sees no guardian data and cannot read other people (own roster row only)', !/09000/.test(mt) && (await p.evaluate(async () => (await YB.q('team_members', { select: 'id' })).length)) === 1);
  await p.locator('[data-yd-user=parent]').click();
  await p.waitForSelector('.a-child', { timeout: 8000 }); await settle(p);
  check('switch to ولي أمر: one linked child (fake name), consent, schedule; the switcher keeps the choice', (await p.locator('.a-head .a-badge').innerText()) === 'ولي أمر' && /عضو التجربة الافتراضي/.test(await text(p)) && (await p.locator('[data-yd-user=parent]').getAttribute('aria-pressed')) === 'true' && (await p.locator('.a-sched').count()) === 1);
  await p.locator('[data-yd-user=leader]').click();
  await p.waitForSelector('[data-counter]', { timeout: 8000 }); await settle(p);
  check('back to leader: the earlier changes (returned, same join code) were kept in the tab\'s fake DB', (await p.locator('.a-teamcard .a-chip').first().innerText()) === 'مطلوب تعديل' && (await p.locator('[data-code]').innerText()) === leaderCode);
  await p.locator('button[data-fk=submit]').click();
  await p.waitForFunction(() => /معتمد/.test(document.querySelector('.a-teamcard .a-chip').textContent));
  check('demo: resubmitting → approved; the member and the parent get «اعتُمد» notifications', await p.evaluate(() => {
    const d = JSON.parse(sessionStorage.getItem('yanabee-demo-db-v1') || '{}');
    const kinds = (d.notes || []).map(n => n.user_id + ':' + n.kind);
    return kinds.includes('u-member:team_approved') && kinds.includes('u-parent:team_approved');
  }));

  /* ---- the nav dot is orange for the demo */
  check('top-bar account dot: shown, orange (demo), label says demo', await p.evaluate(() => { const a = document.querySelector('[data-acct]'), d = a.querySelector('.acct-dot'); return !d.hidden && /وضع تجريبي/.test(a.getAttribute('aria-label')) && d.style.background.includes('--sun'); }));

  /* ---- the tournament page in the demo: public view + «فريقي», never the manager */
  await p.goto(`${ORIGIN}/tournament.html`);
  await p.waitForSelector('.yd-bar', { timeout: 8000 });
  await wait(p, () => document.querySelector('#tn-app').getAttribute('aria-busy') === 'false');
  await sleep(300);
  const tt = await p.locator('#tn-app').innerText();
  check('tournament page: the same banner, public view (عرض عام), no «نشر للجميع», no «الإعداد» tab', (await p.locator('.yd-msg').innerText()) === BANNER && (await p.locator('.tn-badge').innerText()) === 'عرض عام' && !(await p.locator('[data-act=publish]:visible').count()) && !(await p.locator('#tn-t-setup:visible').count()));
  check('tournament page: overview shows the pre-published board (groups drawn, 9 of 18 group matches) and the «فريقي» tab exists', /تمت القرعة/.test(tt) && /9 من 18/.test(tt) && (await p.locator('#tn-t-myteam:visible').count()) === 1);
  await p.locator('#tn-t-myteam').click();
  await sleep(300);
  const myt = await p.locator('#tn-p-myteam').innerText();
  check('«فريقي» lists the 12 demo teams (all fake) and shows the leader\'s team standing', (myt.match(/الافتراضي/g) || []).length >= 12 && /المجموعة [أبج] · المركز/.test(myt));
  const tw = await p.evaluate(async () => (await YB.publishState(YTour.emptyState(), null)).error);
  check('tournament page: publishing from the demo is refused by the fake (permission_denied)', tw === 'permission_denied');
  check('tournament banner: the current page is marked in the banner links', (await p.locator('.yd-bar a[aria-current=page]').evaluate(e => e.textContent)) === 'لوحة البطولة');

  /* ---- exit the demo */
  await p.locator('[data-yd-exit]').click();
  await p.waitForFunction(() => !document.querySelector('.yd-bar'), null, { timeout: 8000 });
  await sleep(300);
  check('exit: the demo flag, database and fake session are gone', (await demoFlag(p)) === null && (await dbOf(p)) === null && (await lsSession(p)) === null && !(await p.evaluate(() => JSON.stringify({ ...localStorage }))).includes('demo-'));
  await p.goto(`${ORIGIN}/account.html`);
  await settle(p);
  check('after exit: the signed-out page with the demo buttons again, native fetch, no banner', (await p.locator('[data-demo]').count()) === 3 && !(await p.locator('.yd-bar').count()) && await p.evaluate(() => /native code/.test(Function.prototype.toString.call(window.fetch))));
  check('demo: no request ever left the page (only the page origin and shell fonts)', foreign.length === 0, foreign.slice(0, 3).join());
  check('demo: no console error', p.errs.length === 0, p.errs.join('|'));
  await close(p);

  /* ---- a real session blocks the demo and is never overwritten */
  const R = await open(null, { config: 'none', label: 'demo-real-session' });
  await R.evaluate(() => localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: 'real-token-123', refresh_token: 'r', expires_at: 4102444800, user: { id: 'real-1', email: 'real@x.test' } })));
  await R.reload(); await settle(R);
  check('a real session in storage: no demo buttons are offered', (await R.locator('[data-demo]').count()) === 0 && /ليش تنشئ حسابًا؟/.test(await text(R)));
  check('…YBDemo refuses to start and the real token is untouched', await R.evaluate(() => YBDemo.canEnter() === false && YBDemo.enter('leader') === false && JSON.parse(localStorage.getItem('yanabee-session-v1')).access_token === 'real-token-123' && sessionStorage.getItem('yanabee-demo') === null));
  await R.evaluate(() => sessionStorage.setItem('yanabee-demo', '1'));
  await R.reload(); await settle(R);
  check('a demo flag + a real session: the demo switches itself off, the real session stays', await R.evaluate(() => sessionStorage.getItem('yanabee-demo') === null && JSON.parse(localStorage.getItem('yanabee-session-v1')).access_token === 'real-token-123' && YBDemo.active === false) && !(await R.locator('.yd-bar').count()));
  await close(R);

  /* ---- stale demo token (no tab flag) is removed before it can reach a real backend */
  const fake = new Fake();
  const S1 = await open(fake, { label: 'demo-stale' });
  const seedStale = t => localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: t, refresh_token: 'demo-r-u-leader', expires_at: 4102444800, user: { id: 'u-leader', email: 'leader@demo.invalid' } }));
  await S1.evaluate(seedStale, 'demo-t-u-leader');
  await S1.reload(); await settle(S1);
  check('stale demo token + real backend configured: removed by acct-nav, signed-out page, ZERO requests to the real backend', (await lsSession(S1)) === null && fake.log.length === 0 && (await S1.locator('#panel-login').isVisible()), JSON.stringify(fake.log));
  await S1.evaluate(seedStale, 'demo-t-u-leader');
  await S1.goto(`${ORIGIN}/index.html`);
  check('…the cleanup runs on every page (home page too)', await ok(S1.waitForFunction(() => localStorage.getItem('yanabee-session-v1') === null, null, { timeout: 4000 })));
  await S1.waitForLoadState('load'); await sleep(300);   // the home page's status strip asks for the public count after load
  check('…the home page asked the real backend only for the public team count, the public announcements and the picked projects, signed out', fake.log.every(l => /yb_registration_stats|\/yb_announcements$|\/rpc\/yb_public_projects$/.test(l.path) && l.who === 'anon'), JSON.stringify(fake.log.map(l => l.path + ':' + l.who)));
  fake.log = [];   // the demo checks below count requests from here
  await S1.goto(`${ORIGIN}/account.html`); await settle(S1);
  check('with a real backend the page still offers sign-up AND the demo side by side', (await S1.locator('[data-demo]').count()) === 3 && (await S1.locator('#panel-login').isVisible()) && /ليش تنشئ حسابًا؟/.test(await text(S1)));
  await S1.locator('[data-demo=parent]').click();
  await S1.waitForSelector('.yd-bar', { timeout: 8000 }); await S1.waitForSelector('.a-app', { timeout: 8000 }); await settle(S1);
  check('demo over a CONFIGURED real backend: the fake answers, the real backend gets ZERO requests and never sees the real key', fake.log.length === 0 && (await S1.locator('.a-head .a-badge').innerText()) === 'ولي أمر' && (await S1.evaluate(() => YB_CONFIG.anonKey)) === 'demo-anon');
  await S1.locator('[data-yd-exit]').click();
  await S1.waitForFunction(() => !document.querySelector('.yd-bar'), null, { timeout: 8000 }); await settle(S1);
  check('…after the demo, the real backend config is back (sign-in form works again)', await S1.evaluate(() => YB.configured === true && YB_CONFIG.url === 'https://fake.supabase.test') && fake.log.length === 0);
  await close(S1);

  /* ---- layout, themes in the demo */
  for (const mobile of [true, false]) for (const scheme of ['light', 'dark']) {
    for (const who of [null, 'leader', 'member', 'parent', 'tour']) {
      const label = `demo-${who || 'hub'}-${mobile ? 390 : 1280}-${scheme}`;
      const P = await open(null, { config: 'none', mobile, colorScheme: scheme, label });
      watch(P);
      await settle(P);
      if (who) {
        await P.evaluate(w => { YBDemo.enter(w === 'tour' ? 'leader' : w); }, who);
        await P.waitForSelector('.yd-bar', { timeout: 8000 });
        if (who === 'tour') { await P.goto(`${ORIGIN}/tournament.html`); await P.waitForSelector('.yd-bar'); await wait(P, () => document.querySelector('#tn-app').getAttribute('aria-busy') === 'false'); }
        else { await P.waitForSelector('.a-app', { timeout: 8000 }); await settle(P); await P.waitForFunction(() => !document.querySelector('.a-sched .a-skel'), null, { timeout: 8000 }).catch(() => {}); }
      }
      await sleep(300);
      const ov = await overflow(P);
      check(`${label}: no horizontal overflow`, ov <= 0, String(ov));
      if (scheme === 'light') {
        const small = await P.evaluate(() => [...document.querySelectorAll('.yd-bar button, .yd-bar a, [data-demo], [data-account-root] button, [data-account-root] a.btn, [data-account-root] input:not([type=radio]):not([type=checkbox])')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && !e.closest('details:not([open])') && (r.height < 43.5 || r.width < 43.5); })
          .map(e => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
        check(`${label}: banner buttons, demo buttons and controls are at least 44px`, small.length === 0, small.slice(0, 4).join(' '));
      }
      const lowc = await P.evaluate(() => {
        const cvs = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = c => { cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = '#000'; cvs.fillStyle = c; cvs.fillRect(0, 0, 1, 1); const d = cvs.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = el => { let e = el; while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] > 0.95) return c; e = e.parentElement; } return rgb('#fff'); };
        const bad = [];
        document.querySelectorAll('.yd-bar *, .a-why *, .a-demo *, .a-notice *').forEach(el => {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || el.closest('[hidden]') || el.closest('details:not([open])')) return;
          const fg = rgb(getComputedStyle(el).color), bg = bgOf(el), L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (ratio < 4.5 && !el.matches('.yd-tag')) bad.push(`${el.tagName}.${el.className}:${ratio.toFixed(2)}`);
        });
        return bad;
      });
      check(`${label}: text contrast of the banner, panels and demo buttons ≥ 4.5:1`, lowc.length === 0, lowc.slice(0, 5).join(' '));
      if (process.env.ACCOUNT_SHOTS) {
        fs.mkdirSync(process.env.ACCOUNT_SHOTS, { recursive: true });
        await P.evaluate(() => window.scrollTo(0, 0));
        await P.screenshot({ path: path.join(process.env.ACCOUNT_SHOTS, label + '.png') });
      }
      check(`${label}: no console error`, P.errs.length === 0, P.errs.join('|'));
      await close(P);
    }
  }
  check('demo layout runs: no request to any foreign host', foreign.length === 0, foreign.slice(0, 3).join());
}

/* ================================================================ 8b. competition officer (مسؤول المسابقة) */
section('competition officer: assigned by the admin, review queue, notifications');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  const off = fake.addUser({ email: 'off@t.test', name: 'مسؤولة التسجيل', role: 'member' }); fake.setRole('off@t.test', 'officer');
  fake.addUser({ email: 'lo@t.test', name: 'قائد مراجع', role: 'leader' });
  const mem = n => Array.from({ length: n }, (_, i) => ({ name: `لاعب رقم ${i + 1}`, age: 13 }));
  fake.seedTeam({ leaderEmail: 'lo@t.test', name: 'الفجر', area: 'حي الصباح', status: 'submitted', members: mem(4) });
  /* the admin assigns the competition */
  const A = await open(fake, { label: 'officer-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-people').click();
  const orow = A.locator('.a-person', { hasText: 'مسؤولة التسجيل' });
  check('officer row: badge مسؤول مسابقة and a competitions box (7 competitions, none ticked)', /مسؤول مسابقة/.test(await orow.innerText()) && (await orow.locator('.a-comps input[type=checkbox]').count()) === 7 && (await orow.locator('.a-comps input:checked').count()) === 0);
  await orow.locator('.a-comps label', { hasText: 'التسجيل ومراجعة الفرق' }).locator('input').check({ force: true });
  await A.waitForFunction(() => [...document.querySelectorAll('.a-person')].some(r => /مسؤولة التسجيل/.test(r.textContent) && r.querySelector('.a-comps input:checked')));
  check('ticking «التسجيل ومراجعة الفرق» assigns it (yb_set_officer)', fake.officers.some(o => o.user_id === off.id && o.competition === 'registration'));
  check('rows of non-officers have no competitions box', !(await A.locator('.a-person', { hasText: 'قائد مراجع' }).locator('.a-comps').count()));
  check('admin console clean (officer assignment)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  /* the officer screen */
  const O = await open(fake, { label: 'officer' });
  await settle(O); await signInOk(O, 'off@t.test');
  await O.waitForSelector('.a-team', { timeout: 8000 });
  const ot = await text(O);
  check('officer screen: badge, the assigned competition, the review queue (1 waiting)', (await O.locator('.a-head .a-badge').innerText()) === 'مسؤول مسابقة' && /التسجيل ومراجعة الفرق/.test(ot) && /1 من الطلبات قيد المراجعة/.test(ot));
  check('the officer gets no admin tools (no counters, no people list, no tabs)', !(await O.locator('.a-counters, .a-person, [role=tab]').count()));
  await O.locator('.a-team-h').first().click();
  await O.waitForSelector('.a-roster-ro .a-mem');
  const card = await O.locator('.a-team').first().innerText();
  check('the review roster shows names and consent only: no ages, no guardian names, no phones', (await O.locator('.a-roster-ro .a-mem').count()) === 5 && !/0912345678/.test(card) && !/ولي الأمر\s*$/m.test(card) && !(await O.locator('.a-team a[href^="tel:"]').count()));
  await O.locator('button[data-fk^="ort-"]').click();
  check('returning without a note asks for one; nothing is sent', fake.teams[0].status === 'submitted' && /اكتب في الملاحظة/.test(await O.locator('.a-decide').innerText()));
  await O.locator('textarea.a-note-in').fill('ينقص عضو واحد على الأقل.');
  await O.locator('button[data-fk^="ort-"]').click();
  await O.waitForFunction(() => /مطلوب تعديل/.test(document.querySelector('.a-team-h').innerText));
  check('the officer returns the team with the note', fake.teams[0].status === 'returned' && fake.teams[0].admin_note === 'ينقص عضو واحد على الأقل.');
  check('after the decision the officer has no decision buttons (only «قيد المراجعة» teams)', !(await O.locator('button[data-fk^="oap-"]').count()));
  check('the leader is notified of the return', fake.notes.some(n => n.kind === 'team_status' && n.data.to === 'returned' && n.user_id === fake.teams[0].leader_id));
  const api = await O.evaluate(async () => [(await YB.rpc('set_user_role', { target: 'x', new_role: 'leader' })).error, (await YB.rpc('yb_set_officer', { target: 'x', competition: 'chess', assign: true })).error]);
  check('an officer cannot change roles or assign competitions', api.join() === 'permission_denied,permission_denied', api.join());
  check('officer console clean', O.errs.length === 0, O.errs.join('|'));
  await close(O);
  /* an officer without a competition */
  fake.officers = [];
  const O2 = await open(fake, { label: 'officer2' });
  await settle(O2); await signInOk(O2, 'off@t.test');
  check('an officer with no competition sees a clear message and no queue', /لم تُسند إليك مسابقة بعد/.test(await text(O2)) && !(await O2.locator('.a-team').count()));
  await close(O2);
}

/* ================================================================ 8c. unified schedule (الجدول) and attendance */
section('unified schedule: dates by the admin and officers, leader RSVP, check-in next to the lg2 rules');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  const off = fake.addUser({ email: 'ref@t.test', name: 'مسؤول الكرة', role: 'member' }); fake.setRole('ref@t.test', 'officer');
  fake.officers.push({ user_id: off.id, competition: 'football' });
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lb@t.test', name: 'قائد الأمل', role: 'leader' });
  const mem = n => Array.from({ length: n }, (_, i) => ({ name: `لاعب ${i + 1} المجتهد`, age: 13 }));
  const TA = fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: mem(4) });
  const TB = fake.seedTeam({ leaderEmail: 'lb@t.test', name: 'الأمل', status: 'approved', members: mem(4) });
  /* the admin adds a match from the new tab */
  const A = await open(fake, { label: 'sched-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-schedule').click();
  await A.waitForSelector('.a-evm button[data-fk="evadd-adm"]');
  check('admin: «الجدول» tab with the dates manager (empty at first)', /لا توجد مواعيد قادمة/.test(await A.locator('.a-evm').innerText()));
  await A.locator('button[data-fk="evadd-adm"]').click();
  const F = A.locator('form.a-evform');
  await F.locator('select[name=competition]').selectOption('football');
  await F.locator('input[name=title]').fill('الجولة الأولى: النور ضد الأمل');
  const d = new Date(Date.now() + 3 * 864e5); const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await F.locator('input[name=date]').fill(ds);
  await F.locator('input[name=time]').fill('16:30');
  await F.locator('input[name=place]').fill('ملعب الحي');
  await F.locator('input[name=category]').fill('المجموعة أ');
  await F.locator('.a-evteams label', { hasText: 'النور' }).locator('input').check();
  await F.locator('.a-evteams label', { hasText: 'الأمل' }).locator('input').check();
  await F.locator('button[type=submit]').click();
  await A.waitForSelector('.a-evm .a-ev');
  const ev = fake.events[0];
  check('the date is saved with competition, time, place, category and the two teams', !!ev && ev.competition === 'football' && ev.place === 'ملعب الحي' && ev.category === 'المجموعة أ' && ev.team_ids.length === 2 && new Date(ev.starts_at).getHours() === 16);
  check('the list shows it with its teams', /الجولة الأولى: النور ضد الأمل/.test(await A.locator('.a-evm .a-ev').innerText()) && /النور · الأمل|الأمل · النور/.test(await A.locator('.a-evm .a-ev').innerText()));
  await F.isVisible().catch(() => {});
  await A.locator(`button[data-fk="eve-${ev.id}"]`).click();
  await A.locator('form.a-evform input[name=time]').fill('18:00');
  await A.locator('form.a-evform button[type=submit]').click();
  await A.waitForFunction(() => /تغيّر الموعد/.test(document.querySelector('.a-evm').innerText));
  check('moving the time marks the date «تغيّر الموعد»', fake.events[0].status === 'changed' && new Date(fake.events[0].starts_at).getHours() === 18);
  check('admin console clean (schedule)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  /* the leader sees the date and confirms */
  const L = await open(fake, { label: 'sched-leader' });
  await settle(L); await signInOk(L, 'la@t.test');
  await L.waitForSelector('.a-dates:not([hidden]) .a-ev', { timeout: 8000 });
  check('leader: «المواعيد القادمة» shows the match with its changed time', /الجولة الأولى: النور ضد الأمل/.test(await L.locator('.a-dates').innerText()) && /تغيّر الموعد/.test(await L.locator('.a-dates').innerText()));
  await L.locator(`button[data-fk="rsvp-yes-${ev.id}"]`).click();
  await L.waitForFunction(id => document.querySelector(`button[data-fk="rsvp-yes-${id}"]`)?.getAttribute('aria-pressed') === 'true', ev.id);
  check('«سنحضر» records the answer (yb_rsvp) and shows it pressed', fake.att.some(a => a.event_id === ev.id && a.team_id === TA.id && a.rsvp === 'yes'));
  check('leader console clean (schedule)', L.errs.length === 0, L.errs.join('|'));
  await close(L);
  /* the football officer marks attendance next to the lg2 rules */
  const O = await open(fake, { label: 'sched-officer' });
  await settle(O); await signInOk(O, 'ref@t.test');
  await O.waitForSelector('.a-evm .a-ev', { timeout: 8000 });
  check('officer: the dates manager is limited to its competition (no competition picker)', /المواعيد: دوري كرة القدم/.test(await O.locator('.a-evm h3').innerText()));
  await O.locator(`button[data-fk="eva-${ev.id}"]`).click();
  await O.waitForSelector('.a-att .a-attrow');
  const attText = await O.locator('.a-att').innerText();
  check('attendance panel: both teams, the leader answers (أكّد الحضور / لم يرد) and the lg2 rules verbatim', (await O.locator('.a-attrow').count()) === 2 && /أكّد الحضور/.test(attText) && /لم يرد/.test(attText) && /تأخر الفريق لأكثر من 10 دقائق/.test(await O.locator('.a-rules').textContent()) && (await O.locator('.a-rules tr').count()) === 7);
  const row = O.locator(`.a-attrow[data-team="${TA.id}"]`);
  check('minutes late are disabled until «حضر» is chosen', await row.locator('input.a-late').isDisabled());
  await row.locator('select').selectOption('present');
  await row.locator('input.a-late').fill('12');
  await row.locator('button').click();
  await O.waitForFunction(t => document.querySelector(`.a-attrow[data-team="${t}"] select`)?.value === 'present', TA.id);
  check('the check-in is saved: present, 12 minutes late (yb_mark_attendance)', fake.att.some(a => a.team_id === TA.id && a.presence === 'present' && a.late_minutes === 12));
  await O.locator(`button[data-fk="evc-${ev.id}"]`).click(); await O.locator(`button[data-fk="evc-${ev.id}"]`).click();
  await O.waitForFunction(() => /أُلغي/.test(document.querySelector('.a-evm').innerText));
  check('the officer cancels the date (two presses)', fake.events[0].status === 'cancelled');
  const deny = await O.evaluate(async () => (await YB.insert('yb_events', { competition: 'chess', kind: 'round', title: 'دور', starts_at: new Date().toISOString(), team_ids: [] }, { returning: true })).error);
  check('a football officer cannot add a chess date', deny === 'permission_denied');
  check('officer console clean (schedule)', O.errs.length === 0, O.errs.join('|'));
  await close(O);
  /* a cancelled date: no RSVP buttons any more */
  const L2 = await open(fake, { label: 'sched-leader2' });
  await settle(L2); await signInOk(L2, 'lb@t.test');
  await L2.waitForSelector('.a-dates:not([hidden]) .a-ev', { timeout: 8000 });
  check('leader B: the cancelled date is marked «أُلغي» and has no RSVP buttons', /أُلغي/.test(await L2.locator('.a-dates').innerText()) && !(await L2.locator('.a-dates .a-rsvp').count()));
  await close(L2);
}

/* ---- demo: sample dates and RSVP */
{
  const p = await open(null, { config: 'none', label: 'demo-dates' });
  await settle(p);
  await p.locator('[data-demo=leader]').click();
  await p.waitForSelector('.a-dates:not([hidden]) .a-ev', { timeout: 8000 });
  const t = await p.locator('.a-dates').innerText();
  check('demo leader: sample dates of the team (match + recitation); the workshop for approved teams is not shown to a draft team', /مباراة تجريبية/.test(t) && /موعد التسميع الأول/.test(t) && !/ورشة القيادة/.test(t));
  await p.locator('button[data-fk="rsvp-yes-ev-1"]').click();
  await p.waitForFunction(() => document.querySelector('button[data-fk="rsvp-yes-ev-1"]')?.getAttribute('aria-pressed') === 'true');
  check('demo: «سنحضر» works on the fake data', (await p.locator('button[data-fk="rsvp-yes-ev-1"]').getAttribute('aria-pressed')) === 'true');
  await close(p);
}

/* ================================================================ 9. wrap up: hosts and console */
section('online registration (0005): claim a team from the form, the checklist, the fee desk');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'offr@t.test', name: 'مسؤول التسجيل', role: 'member' }); fake.setRole('offr@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('offr@t.test').id, competition: 'registration' });
  const claimer = fake.addUser({ email: 'claim@t.test', name: 'قائد الاستمارة', role: 'leader' });
  fake.addUser({ email: 'mm@t.test', name: 'عضو', role: 'member' });
  const T = fake.seedOnline({ name: 'النجوم', ref: 'K7M2QW10', phone: '0530 517 5431', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 19 }] });
  /* the leader claims it */
  const P = await open(fake, { path: 'account.html?claim=K7M2QW10', label: 'claim' });
  await settle(P); await signInOk(P, 'claim@t.test');
  await P.waitForSelector('[data-claim]');
    check('a leader without a team who came with ?claim= sees the claim card before «أنشئ فريقك», number filled', (await P.evaluate(() => { const c = [...document.querySelectorAll('[data-account-root] .a-card')]; const a = c.findIndex(x => x.hasAttribute('data-claim')), b = c.findIndex(x => /أنشئ فريقك/.test(x.textContent)); return a >= 0 && a < b; })) && (await P.locator('[data-claim] input[name=ref]').inputValue()) === 'YN-K7M2-QW10');
  await P.locator('[data-claim] input[name=cphone]').fill('0530 000 0000');
  await P.locator('[data-claim] button[type=submit]').click();
  await P.waitForFunction(() => /لم نجد طلبًا/.test(document.querySelector('[data-claim]').innerText));
  check('a wrong phone is refused with a clear message, the team stays unclaimed', !T.leader_id);
  await P.locator('[data-claim] input[name=cphone]').fill('+90 530 517 54 31');
  await P.locator('[data-claim] button[type=submit]').click();
  await P.waitForSelector('#l-team-h');
  check('the right phone links the team: the leader screen opens on «النجوم»', (await P.locator('#l-team-h').innerText()) === 'النجوم' && T.leader_id === claimer.id);
  check('the leader roster row is linked to the account', fake.members.find(m => m.team_id === T.id && m.is_leader).user_id === claimer.id);
  await P.waitForSelector('.a-checkcard:not([hidden]) .ybc');
  const steps = await P.$$eval('.a-checkcard .ybc-s', ls => ls.map(l => l.dataset.step + ':' + l.className.replace('ybc-s ', '')));
  check('the checklist card: sent done, fee waiting, consents waiting, review waiting, draw waiting', steps.join(',') === 'sent:is-done,fee:is-wait,consent:is-wait,review:is-wait,draw:is-wait', steps.join(','));
  check('consents count the minors only: «استُلمت 0 من 4»', /استُلمت 0 من 4/.test(await P.locator('[data-step=consent]').innerText()));
  check('the checklist sits right after the team card', await P.evaluate(() => document.querySelector('.a-teamcard').nextElementSibling.classList.contains('a-checkcard')));
  check('leader console clean (claim)', P.errs.length === 0, P.errs.join('|'));
  await close(P);
  /* the admin's fee desk */
  const A = await open(fake, { label: 'fee-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  const card = A.locator('.a-team', { hasText: 'النجوم' });
  await card.locator('.a-team-h').click();
  await A.waitForSelector('[data-reg-bar]');
  const bar = A.locator('[data-reg-bar]');
  check('admin card: fee chip, request number chip', /لم تُسدَّد الرسوم/.test(await bar.innerText()) && /سُجّل عبر الاستمارة · YN-K7M2-QW10/.test(await bar.innerText()));
  check('a claimed team has no «لم يُربط بحساب قائد» chip', !/لم يُربط بحساب قائد/.test(await bar.innerText()));
  await bar.locator('select').selectOption('paid');
  await bar.locator('input.a-in').fill('إيصال 9');
  await bar.locator('button[data-fk^="fsave-"]').click();
  await A.waitForFunction(() => /سُدّدت الرسوم/.test((document.querySelector('[data-reg-bar]') || {}).innerText || ''));
  check('saving marks the fee paid with the receipt (yb_set_fee)', T.fee_status === 'paid' && T.fee_receipt === 'إيصال 9');
  check('the leader is notified (team_fee)', fake.notes.some(n => n.kind === 'team_fee' && n.user_id === claimer.id));
  await A.locator('[data-reg-bar] button[data-fk^="rd-"]').click();
  await A.waitForSelector('.a-regd:not([hidden]) dl');
  const det = await A.locator('.a-regd').innerText();
  check('«تفاصيل الاستمارة» shows the leader phone and the nominees', /0530 517 5431/.test(det) && /سالم أحمد/.test(det) && /عمر حسن/.test(det) && /حملة نظافة/.test(det));
  check('the leader phone is a tel: link', (await A.locator('.a-regd a[href^="tel:"]').getAttribute('href')) === 'tel:05305175431');
  check('admin console clean (fee)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  /* the leader sees the fee done and the inbox line */
  const P2 = await open(fake, { label: 'claim2' });
  await settle(P2); await signInOk(P2, 'claim@t.test');
  await P2.waitForSelector('.a-checkcard:not([hidden]) [data-step=fee].is-done');
  check('after the fee desk the leader checklist shows the fee done', /سُجّل سداد رسوم الفريق/.test(await P2.locator('[data-step=fee]').innerText()));
  const noteTxt = await P2.evaluate(() => [...document.querySelectorAll('.a-inbox p, [data-inbox] p')].map(p => p.textContent).join(' | '));
  check('the inbox text for the fee reads «سُجّل سداد رسوم فريق النجوم.» (when the inbox is open)', noteTxt === '' || /سُجّل سداد رسوم فريق النجوم\./.test(noteTxt), noteTxt);
  const api = await P2.evaluate(async () => [(await YB.rpc('yb_set_fee', { team_id: 'x', status: 'paid', receipt: null })).error]);
  check('a leader cannot set the fee', api[0] === 'permission_denied', api.join());
  await close(P2);
  /* the officer's queue has the same fee control */
  const O = await open(fake, { label: 'fee-officer' });
  await settle(O); await signInOk(O, 'offr@t.test');
  await O.waitForSelector('.a-team');
  await O.locator('.a-team', { hasText: 'النجوم' }).locator('.a-team-h').click();
  await O.waitForSelector('[data-reg-bar]');
  await O.locator('[data-reg-bar] select').selectOption('waived');
  await O.locator('[data-reg-bar] button[data-fk^="fsave-"]').click();
  await O.waitForFunction(() => /معفى من الرسوم/.test((document.querySelector('[data-reg-bar]') || {}).innerText || ''));
  check('the registration officer waives the fee from the review queue (the receipt field kept)', T.fee_status === 'waived' && T.fee_receipt === 'إيصال 9');
  check('officer console clean (fee)', O.errs.length === 0, O.errs.join('|'));
  await close(O);
  /* a member account cannot claim; an unclaimed team shows the chip */
  const T2 = fake.seedOnline({ name: 'الغيث', ref: 'ZZZZ2222', phone: '0590 000 1111', members: [{ name: 'أنس بكر' }] });
  const M = await open(fake, { label: 'claim-member' });
  await settle(M); await signInOk(M, 'mm@t.test');
  const mr = await M.evaluate(async () => (await YB.rpc('yb_claim_team', { ref: 'ZZZZ2222', phone: '05900001111' })).error);
  check('a member account cannot claim a team', mr === 'not_leader' && !T2.leader_id, mr);
  await close(M);
  const A2 = await open(fake, { label: 'fee-admin2' });
  await settle(A2); await signInOk(A2, 'boss@t.test');
  await A2.locator('.a-team', { hasText: 'الغيث' }).locator('.a-team-h').click();
  await A2.waitForSelector('[data-reg-bar]');
  check('an unclaimed online team shows «لم يُربط بحساب قائد بعد»', /لم يُربط بحساب قائد بعد/.test(await A2.locator('.a-team', { hasText: 'الغيث' }).locator('[data-reg-bar]').innerText()));
  check('the leader column falls back to the name typed in the form', /القائد: قائد الاستمارة/.test(await A2.locator('.a-team', { hasText: 'الغيث' }).locator('.a-team-h').innerText()));
  await close(A2);
}

section('roles and the reserve list (0006): the leader picks, badges everywhere, officers see their lists, the admin moves places');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'hifz@t.test', name: 'مسؤول التسميع', role: 'member' }); fake.setRole('hifz@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('hifz@t.test').id, competition: 'hifz' });
  fake.addUser({ email: 'rl@t.test', name: 'قائد الأدوار', role: 'leader' });
  fake.addUser({ email: 'rl2@t.test', name: 'قائد الاحتياط', role: 'leader' });
  const T = fake.seedTeam({ leaderEmail: 'rl@t.test', name: 'الضياء', status: 'draft', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  T.waitlist = false;
  const T2 = fake.seedTeam({ leaderEmail: 'rl2@t.test', name: 'السنابل', status: 'submitted', members: [{ name: 'أنس بكر', age: 12 }] });
  T2.waitlist = true; T2.waitlist_at = fake.now();
  const mid = n => fake.members.find(m => m.team_id === T.id && m.full_name === n).id;
  /* the leader picks the roles */
  const P = await open(fake, { label: 'roles-leader' });
  await settle(P); await signInOk(P, 'rl@t.test');
  await P.waitForSelector('[data-roles] select[data-role=reciter]');
  check('the leader sees a roles card with four choices from the roster', (await P.locator('[data-roles] select').count()) === 4 && (await P.locator('[data-roles] select[data-role=chess] option').count()) === 6);
  await P.locator('[data-roles] select[data-role=reciter]').selectOption({ label: 'سالم أحمد' });
  await P.locator('[data-roles] select[data-role=reserve]').selectOption({ label: 'سالم أحمد' });
  await P.locator('[data-roles] button[data-fk=roles-save]').click();
  check('the same member as reciter and reserve is caught on the page; nothing is sent', /عضوين مختلفين/.test(await P.locator('[data-roles]').innerText()) && !fake.members.some(m => (m.roles || []).length));
  await P.locator('[data-roles] select[data-role=reserve]').selectOption({ label: 'يوسف علي' });
  await P.locator('[data-roles] select[data-role=chess]').selectOption({ label: 'عمر حسن' });
  await P.locator('[data-roles] button[data-fk=roles-save]').click();
  await P.waitForFunction(() => /المرشح الأساسي للتسميع/.test((document.querySelector(`[data-member]`) && document.querySelector('.a-roster').innerText) || ''));
  check('saving stores the roles (yb_set_roles)', JSON.stringify(fake.members.find(m => m.id === mid('سالم أحمد')).roles) === '["reciter"]' && JSON.stringify(fake.members.find(m => m.id === mid('عمر حسن')).roles) === '["chess"]');
  const card = await P.locator(`[data-member="${mid('يوسف علي')}"]`).innerText();
  check('the member card shows the role badge', /المرشح الاحتياطي للتسميع/.test(card));
  check('the select keeps the saved choice', (await P.locator('[data-roles] select[data-role=chess] option:checked').innerText()) === 'عمر حسن');
  check('leader console clean (roles)', P.errs.length === 0, P.errs.join('|'));
  await close(P);
  /* approved: read-only for the leader */
  T.status = 'approved';
  const P2 = await open(fake, { label: 'roles-leader2' });
  await settle(P2); await signInOk(P2, 'rl@t.test');
  await P2.waitForSelector('[data-roles] .a-roles');
  const ro = await P2.locator('[data-roles]').innerText();
  check('after approval the roles card is read-only and names the holders', !(await P2.locator('[data-roles] select').count()) && /المرشح الأساسي للتسميع:\s*سالم أحمد/.test(ro) && /مسؤول التنسيق والتوثيق:\s*—/.test(ro));
  await close(P2);
  /* the hifz officer's list */
  const O = await open(fake, { label: 'roles-officer' });
  await settle(O); await signInOk(O, 'hifz@t.test');
  await O.waitForSelector('[data-role-list] .a-rolecard');
  const ol = await O.locator('[data-role-list]').innerText();
  check('the hifz officer sees the reciters of the team, not the chess player', /الضياء/.test(ol) && /سالم أحمد/.test(ol) && /يوسف علي/.test(ol) && !/عمر حسن/.test(ol));
  check('teams on the reserve list are not in the officer list', !/السنابل/.test(ol));
  check('officer console clean (roles)', O.errs.length === 0, O.errs.join('|'));
  await close(O);
  /* the admin: badges, reserve chip and the move button */
  const A = await open(fake, { label: 'roles-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('.a-team', { hasText: 'الضياء' }).locator('.a-team-h').click();
  await A.waitForSelector('[data-reg-bar]');
  check('admin roster shows the role badges', /لاعب الشطرنج/.test(await A.locator('.a-team', { hasText: 'الضياء' }).locator('.a-roster').innerText()));
  check('a team with a place shows «له مكان بين الفرق الـ12»', /له مكان بين الفرق الـ12/.test(await A.locator('.a-team', { hasText: 'الضياء' }).locator('[data-reg-bar]').innerText()));
  await A.locator('.a-team', { hasText: 'السنابل' }).locator('.a-team-h').click();
  const bar2 = A.locator('.a-team', { hasText: 'السنابل' }).locator('[data-reg-bar]');
  await bar2.waitFor();
  check('a reserve team shows «قائمة الاحتياط · رقم 1»', /قائمة الاحتياط · رقم 1/.test(await bar2.innerText()));
  await bar2.locator('button[data-fk^="wl-"]').click();
  await A.waitForFunction(() => [...document.querySelectorAll('.a-team')].some(c => /السنابل/.test(c.innerText) && /له مكان بين الفرق الـ12/.test(c.innerText)));
  check('«امنحه مكانًا الآن» gives the reserve team a place (yb_set_waitlist)', T2.waitlist === false);
  check('admin console clean (reserve)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
}

section('live results (0007): the officer enters, the admin approves or returns, the leader sees the scorers');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'fb@t.test', name: 'مسؤول الكرة', role: 'member' }); fake.setRole('fb@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('fb@t.test').id, competition: 'football' });
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lb@t.test', name: 'قائد الأمل', role: 'leader' });
  const TA = fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  const TB = fake.seedTeam({ leaderEmail: 'lb@t.test', name: 'الأمل', status: 'approved', members: [{ name: 'أنس بكر', age: 12 }, { name: 'جابر دار', age: 13 }, { name: 'هاني وليد', age: 14 }, { name: 'كريم سعد', age: 15 }] });
  const ids = [TA.id, TB.id, ...Array.from({ length: 10 }, (_, i) => 'x' + (i + 1))];
  const st0 = YT.setGroups(YT.setTeams(YT.emptyState(), ids.map((id, i) => ({ id, name: i === 0 ? 'النور' : i === 1 ? 'الأمل' : 'فريق ' + (i + 1) }))),
    [[TA.id, TB.id, 'x1', 'x2'], ['x3', 'x4', 'x5', 'x6'], ['x7', 'x8', 'x9', 'x10']]);
  fake.setTournament(YT.stamp(st0, '2026-11-15T10:00:00.000Z'));
  const firstAB = YT.football(st0).groups[0].rounds.flatMap(r => r.matches).find(m => [m.a, m.b].sort().join() === [TA.id, TB.id].sort().join());
  const KEY = YT.pairKey(firstAB.a, firstAB.b);
  /* the officer */
  const O = await open(fake, { label: 'res-officer' });
  await settle(O); await signInOk(O, 'fb@t.test');
  await O.waitForSelector('[data-results] [data-res-fb] .a-team', { timeout: 8000 });
  check('the football officer sees the results desk with the open group matches (18)', (await O.locator('[data-res-fb] .a-team').count()) === 18 && !(await O.locator('[data-res-queue]').count()));
  await O.locator(`[data-fx="${KEY}"] .a-team-h`).click();
  await O.waitForSelector(`[data-fx="${KEY}"] button[data-fk^="rstart-"]`);
  await O.locator(`[data-fx="${KEY}"] button[data-fk^="rstart-"]`).click();
  await O.waitForSelector(`[data-live-panel="${KEY}"]`);
  check('«ابدأ المباراة» opens the live row (live, with a clock)', fake.live.length === 1 && fake.live[0].status === 'live' && !!fake.live[0].started_at && /جارية الآن/.test(await O.locator(`[data-fx="${KEY}"]`).innerText()));
  const sideA = O.locator(`[data-live-panel="${KEY}"] [data-side=a]`);
  const nameA = firstAB.a === TA.id ? 'سالم أحمد' : 'أنس بكر';
  await sideA.locator('select').first().selectOption({ label: nameA });
  await sideA.locator('button[data-fk^="rgoal-a"]').click();
  await O.waitForFunction(k => (document.querySelector(`[data-live-panel="${k}"] [data-side=a] .a-live-n`) || {}).textContent === '1', KEY);
  check('«هدف» records the scorer and raises the score to 1', fake.live[0].sa === 1 && fake.marks.length === 1 && fake.marks[0].kind === 'goal' && !!fake.marks[0].member_id);
  check('the goal shows in the marks list with the name', new RegExp(nameA).test(await O.locator(`[data-live-panel="${KEY}"] .a-live-marks`).innerText()));
  await sideA.locator('button[data-fk^="rre+a"]').click();
  await O.waitForTimeout(300);
  check('a red card without a card first is ignored (reds are part of the cards)', fake.live[0].ra === 0);
  await sideA.locator('button[data-fk^="rca+a"]').click();
  await O.waitForFunction(() => true);
  await O.waitForTimeout(300);
  check('a card is counted', fake.live[0].ca === 1);
  await O.locator(`[data-live-panel="${KEY}"] button[data-fk^="rfin-"]`).click();
  await O.waitForFunction(k => /بانتظار الاعتماد/.test((document.querySelector(`[data-fx="${k}"]`) || {}).innerText || ''), KEY);
  check('«أنهِ المباراة» sends it to the admin (final) and the admin is told', fake.live[0].status === 'final' && fake.notes.some(n => n.kind === 'result_pending'));
  check('officer console clean (results)', O.errs.length === 0, O.errs.join('|'));
  await close(O);
  /* the admin returns, the officer finishes again, the admin approves */
  const A = await open(fake, { label: 'res-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-results').click();
  await A.waitForSelector('[data-res-queue] .a-res-i', { timeout: 8000 });
  check('the admin «النتائج» tab shows 1 result waiting, with the score and the cards', /بانتظار اعتمادك \(1\)/.test(await A.locator('[data-res-queue]').innerText()) && /البطاقات: 1 \/ 0/.test(await A.locator('[data-res-queue]').innerText()));
  await A.locator('[data-res-queue] button[data-fk^="rrt-"]').click();
  check('returning without a note asks for one', /اكتب في الملاحظة/.test(await A.locator('[data-res-queue]').innerText()) && fake.live[0].status === 'final');
  await A.locator('[data-res-queue] textarea').fill('راجع عدد البطاقات');
  await A.locator('[data-res-queue] button[data-fk^="rrt-"]').click();
  await A.waitForFunction(() => /بانتظار اعتمادك \(0\)/.test(document.querySelector('[data-res-queue]').innerText));
  check('the admin returns it with the note', fake.live[0].status === 'returned' && fake.live[0].return_note === 'راجع عدد البطاقات');
  fake.live[0].status = 'final';   // the officer finished it again
  await A.locator('[data-results] button[data-fk="ares-res-refresh"]').click();
  await A.waitForSelector('[data-res-queue] button[data-fk^="rap-"]');
  await A.locator('[data-res-queue] button[data-fk^="rap-"]').click();
  await A.waitForFunction(() => /بانتظار اعتمادك \(0\)/.test(document.querySelector('[data-res-queue]').innerText));
  const res = fake.tour.state.fb.res[KEY];
  check('approving publishes the board with the result (yb_result_approve)', fake.live[0].status === 'approved' && res && res.sa === 1 && res.sb === 0 && res.ca === 1);
  check('the published board has no chess player labels', fake.tour.state.teams.every(t => !('chess' in t)));
  check('the approved match leaves the open list', !(await A.locator(`[data-fx="${KEY}"]`).count()));
  check('admin console clean (results)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  /* the leader of the scoring team sees the scorer */
  const scorer = firstAB.a === TA.id ? 'la@t.test' : 'lb@t.test';
  const L = await open(fake, { label: 'res-leader' });
  await settle(L); await signInOk(L, scorer);
  await L.waitForSelector('[data-marks]:not([hidden])', { timeout: 8000 });
  check('the leader sees «هدّافو فريقنا» with the scorer name and 1 goal', new RegExp(nameA).test(await L.locator('[data-marks]').innerText()) && /1 هدف/.test(await L.locator('[data-marks]').innerText()));
  await close(L);
}

section('projects and initiatives (0008): the leader documents with private photos, the projects officer reviews, the team sees');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'pj@t.test', name: 'مسؤول المشاريع', role: 'member' }); fake.setRole('pj@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('pj@t.test').id, competition: 'projects' });
  fake.addUser({ email: 'fo@t.test', name: 'مسؤول الكرة', role: 'member' }); fake.setRole('fo@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('fo@t.test').id, competition: 'football' });
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lp@t.test', name: 'قائد الغد', role: 'leader' });
  fake.addUser({ email: 'ma@t.test', name: 'سالم أحمد', role: 'member' });
  fake.addUser({ email: 'pa@t.test', name: 'ولي يوسف', role: 'parent' });
  const TA = fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  fake.seedTeam({ leaderEmail: 'lp@t.test', name: 'الغد', status: 'draft', members: [] });
  fake.members.find(m => m.full_name === 'سالم أحمد').user_id = fake.profileByEmail('ma@t.test').id;
  fake.links.push({ parent_id: fake.profileByEmail('pa@t.test').id, member_id: fake.members.find(m => m.full_name === 'يوسف علي').id, created_at: fake.now() });
  /* a big camera photo with an EXIF block (camera name + a location marker) */
  const P0 = await open(new Fake(), { label: 'pj-photo' });
  const b64 = await P0.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1600; const g = c.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 2400, 1600); g.fillStyle = '#fc3'; for (let x = 0; x < 2400; x += 160) g.fillRect(x, 0, 60, 1600); return c.toDataURL('image/jpeg', 0.95).split(',')[1]; });
  await close(P0);
  const raw = Buffer.from(b64, 'base64');
  const exifBody = Buffer.concat([Buffer.from('Exif\0\0MM\0*\0\0\0\x08\0\0\0\0\0\0', 'binary'), Buffer.from('TestCam GPS 41.0N 28.9E')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (exifBody.length + 2) >> 8, (exifBody.length + 2) & 255]), exifBody]);
  const camera = Buffer.concat([raw.subarray(0, 2), app1, raw.subarray(2)]);
  const photo = n => ({ name: `IMG_${n}.jpg`, mimeType: 'image/jpeg', buffer: camera });

  /* a leader whose team is not approved yet */
  const LP = await open(fake, { label: 'pj-draft' });
  await settle(LP); await signInOk(LP, 'lp@t.test');
  await LP.waitForSelector('[data-subs]', { timeout: 8000 });
  check('a team not approved yet: the card says documenting opens after approval, and nothing is read', /بعد اعتماد الفريق/.test(await LP.locator('[data-subs]').innerText()) && !fake.log.some(e => e.path.endsWith('/yb_submissions')));
  await close(LP);

  /* the leader of the approved team sends a project with two photos */
  const L = await open(fake, { label: 'pj-leader' });
  await settle(L); await signInOk(L, 'la@t.test');
  await L.waitForSelector('[data-subs] [data-fk="lsub-add"]', { timeout: 8000 });
  const card = L.locator('[data-subs]');
  check('the card shows the f-apply line from the regulations', /في الأسرة أو السكن والحي أو المدرسة\/الجامعة/.test(await card.innerText()));
  await L.locator('[data-fk="lsub-add"]').click();
  await L.waitForSelector('.a-pj-form');
  check('«أضف مشروعًا أو مبادرة» opens the form with the cd4 photo warning', /لا تُنشر صور أو بيانات المشاركين القاصرين/.test(await card.innerText()));
  await L.locator('.a-pj-form button[type=submit]').click();
  check('an empty form asks for a title', /اكتب عنوانًا للعمل/.test(await card.innerText()) && fake.subs.length === 0);
  const F = L.locator('.a-pj-form');
  await F.locator('select[name=kind]').selectOption('activity');
  await F.locator('select[name=place]').selectOption('school');
  await F.locator('input[name=stitle]').fill('سقيا عمّال المدرسة');
  await F.locator('input[name=svalue]').fill('التعاون');
  await F.locator('input[name=sdate]').fill('2026-11-10');
  await F.locator('input[name=smem]').fill('5');
  await F.locator('input[name=sben]').fill('40');
  await F.locator('textarea[name=ssum]').fill('وزّعنا الماء البارد على عمّال المدرسة بعد الدوام.');
  await F.locator('textarea[name=sres]').fill('تعلّمنا أن العمل الصغير المنظم يصل أكثر.');
  await F.locator('[data-fk="sfile"]').setInputFiles([photo(1), photo(2)]);
  await L.waitForFunction(() => document.querySelectorAll('.a-pj-form .a-photo img').length === 2);
  check('two photos are previewed on the device before upload (2 من 6 صور)', /2 من 6 صور/.test(await F.innerText()));
  await F.locator('button[type=submit]').click();
  check('with photos, the parent-consent confirmation is required first', /أكّد شرط الصور/.test(await F.innerText()) && fake.uploads.length === 0);
  await F.locator('input[name=sok]').check();
  await F.locator('button[type=submit]').click();
  await L.waitForSelector('[data-subs] .a-pj', { timeout: 10000 });
  const s0 = fake.subs[0];
  check('the submission is saved (submitted) with its two photos inside its own folder', fake.subs.length === 1 && s0.status === 'submitted' && s0.kind === 'activity' && s0.place === 'school' && s0.photos.length === 2 && s0.photos.every(p => p.startsWith(`${TA.id}/${s0.id}/`)));
  check('each photo was re-encoded on the device: JPEG, smaller than the original, no EXIF (no camera, no location), no overwrite', fake.uploads.length === 2 && fake.uploads.every(u => u.type === 'image/jpeg' && u.jpeg && !u.exif && u.size < camera.length && u.upsert === 'false'), JSON.stringify(fake.uploads));
  check('the admin and the projects officer are told; the football officer is not', ['boss@t.test', 'pj@t.test'].every(e => fake.notes.some(n => n.kind === 'submission_new' && n.user_id === fake.profileByEmail(e).id)) && !fake.notes.some(n => n.kind === 'submission_new' && n.user_id === fake.profileByEmail('fo@t.test').id));
  await L.waitForFunction(() => Array.from(document.querySelectorAll('[data-subs] .a-pj .a-photo img')).filter(i => /\/storage\/v1\/object\/sign\//.test(i.src)).length === 2, null, { timeout: 8000 });
  check('the photos are shown through signed links only (never a public URL)', !fake.log.some(e => /\/object\/public\//.test(e.path)) && (await L.locator('[data-subs] .a-pj').innerText()).includes('بانتظار المراجعة'));
  /* the leader removes one photo */
  await L.locator(`[data-fk="sed-${s0.id}"]`).click();
  await L.waitForSelector('.a-pj-form .a-photo-x');
  await L.locator('.a-pj-form .a-photo-x').first().click();
  await L.locator('.a-pj-form input[name=sok]').check();
  await L.locator('.a-pj-form button[type=submit]').click();
  await L.waitForFunction(() => !document.querySelector('.a-pj-form'));
  check('editing: a dropped photo leaves the submission and is deleted from the private bucket', fake.subs[0].photos.length === 1 && fake.objects.size === 1 && fake.log.some(e => e.method === 'DELETE' && e.path.endsWith('/object/yanabee-submissions')));
  check('leader console clean (projects)', L.errs.length === 0, L.errs.join('|'));
  await close(L);

  /* the football officer has no projects desk; the projects officer returns it with a note */
  const FO = await open(fake, { label: 'pj-fo' });
  await settle(FO); await signInOk(FO, 'fo@t.test');
  await FO.waitForSelector('[data-results]', { timeout: 8000 });
  check('the football officer has no projects desk', !(await FO.locator('[data-projects]').count()));
  await close(FO);
  const O = await open(fake, { label: 'pj-officer' });
  await settle(O); await signInOk(O, 'pj@t.test');
  await O.waitForSelector('[data-projects] .a-pj', { timeout: 8000 });
  check('the projects officer sees 1 waiting, with the team name, the text and the photo', /1 من الأعمال بانتظار مراجعتك/.test(await O.locator('[data-projects]').innerText()) && /النور/.test(await O.locator('[data-projects] .a-pj').innerText()));
  await O.waitForFunction(() => document.querySelectorAll('[data-projects] .a-photo img').length === 1, null, { timeout: 8000 });
  await O.locator(`[data-fk="sret-${s0.id}"]`).click();
  check('returning without a note asks for one', /اكتب ملاحظة توضّح/.test(await O.locator('[data-projects]').innerText()) && fake.subs[0].status === 'submitted');
  await O.locator(`[data-fk="snote-${s0.id}"]`).fill('أضيفوا صورة للعمل نفسه دون وجوه');
  await O.locator(`[data-fk="sret-${s0.id}"]`).click();
  await O.waitForFunction(() => /لا أعمال بانتظار المراجعة/.test(document.querySelector('[data-projects]').innerText));
  const told = ['la@t.test', 'ma@t.test', 'pa@t.test'].every(e => fake.notes.some(n => n.kind === 'submission_reviewed' && n.user_id === fake.profileByEmail(e).id));
  check('returned with the note; the leader, the member and the parent are told', fake.subs[0].status === 'returned' && fake.subs[0].review_note === 'أضيفوا صورة للعمل نفسه دون وجوه' && told);
  await O.locator('[data-fk="oprj-f-all"]').click();
  check('«كل الأعمال» shows the reviewed one without decision buttons for the officer', /مطلوب تعديل/.test(await O.locator('[data-projects]').innerText()) && !(await O.locator(`[data-fk="sacc-${s0.id}"]`).count()));
  check('officer console clean (projects)', O.errs.length === 0, O.errs.join('|'));
  await close(O);

  /* the leader sees the note and sends it again */
  const L2 = await open(fake, { label: 'pj-leader2' });
  await settle(L2); await signInOk(L2, 'la@t.test');
  await L2.waitForSelector('[data-subs] .a-pj', { timeout: 8000 });
  check('the leader sees «مطلوب تعديل» and the reviewer note', /مطلوب تعديل/.test(await L2.locator('[data-subs]').innerText()) && /أضيفوا صورة للعمل نفسه/.test(await L2.locator('[data-subs]').innerText()));
  await L2.locator(`[data-fk="sed-${s0.id}"]`).click();
  await L2.locator('.a-pj-form input[name=sok]').check();
  await L2.locator('.a-pj-form button[type=submit]').click();
  await L2.waitForFunction(() => !document.querySelector('.a-pj-form'));
  check('sent again: back to «بانتظار المراجعة»', fake.subs[0].status === 'submitted');
  /* a second, photo-less activity is withdrawn */
  await L2.locator('[data-fk="lsub-add"]').click();
  await L2.locator('.a-pj-form input[name=stitle]').fill('درس أسبوعي في المسجد');
  await L2.locator('.a-pj-form textarea[name=ssum]').fill('درس عن الصدق مع أطفال الحي بعد صلاة العصر.');
  check('without photos, no consent confirmation is shown', await L2.locator('.a-pj-form input[name=sok]').isHidden());
  await L2.locator('.a-pj-form button[type=submit]').click();
  await L2.waitForFunction(() => document.querySelectorAll('[data-subs] .a-pj').length === 2);
  const s1 = fake.subs.find(x => x.title === 'درس أسبوعي في المسجد');
  await L2.locator(`[data-fk="sdel-${s1.id}"]`).click();
  check('withdrawing needs a second press', fake.subs.length === 2);
  await L2.locator(`[data-fk="sdel-${s1.id}"]`).click();
  await L2.waitForFunction(() => document.querySelectorAll('[data-subs] .a-pj').length === 1);
  check('the second press withdraws it', fake.subs.length === 1);
  await close(L2);

  /* the admin accepts it from the «المشاريع» tab */
  const A = await open(fake, { label: 'pj-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-projects').click();
  await A.waitForSelector(`[data-fk="sacc-${s0.id}"]`, { timeout: 8000 });
  await A.locator(`[data-fk="sacc-${s0.id}"]`).click();
  await A.waitForFunction(() => /لا أعمال بانتظار المراجعة/.test(document.querySelector('[data-projects]').innerText));
  check('the admin accepts it from the «المشاريع» tab', fake.subs[0].status === 'accepted');
  await A.locator('[data-fk="aprj-f-all"]').click();
  check('the admin can still change a decision (buttons on decided work)', (await A.locator(`[data-fk="sret-${s0.id}"]`).count()) === 1);
  /* the admin picks it for the home page (the owner's rule), after a consent reminder */
  check('accepted work is not on the home page until the admin picks it', !fake.subs[0].featured && (await A.locator(`[data-sub="${s0.id}"] [data-featured]`).count()) === 0);
  await A.locator(`[data-fk="sfeat-${s0.id}"]`).click();
  check('«اعرضه في الصفحة الرئيسية» first asks about the parents\' consent (nothing sent yet)', /موافقة الأهل/.test(await A.locator(`[data-fk="sfeat-${s0.id}"]`).innerText()) && !fake.subs[0].featured);
  await A.locator(`[data-fk="sfeat-${s0.id}"]`).click();
  await A.waitForSelector(`[data-sub="${s0.id}"] [data-featured]`, { timeout: 8000 });
  check('the second press shows it on the home page; the card says so', fake.subs[0].featured === true && /أخفِه من الصفحة الرئيسية/.test(await A.locator(`[data-fk="sfeat-${s0.id}"]`).innerText()));
  check('the team is told it is on the home page', fake.notes.some(n => n.kind === 'submission_featured' && n.data.show && n.user_id === fake.profileByEmail('la@t.test').id));
  check('admin console clean (projects)', A.errs.length === 0, A.errs.join('|'));
  await close(A);

  /* the team: the leader cannot edit an accepted one; the member and the parent read it */
  const L3 = await open(fake, { label: 'pj-leader3', mobile: true });
  await settle(L3); await signInOk(L3, 'la@t.test');
  await L3.waitForSelector('[data-subs] .a-pj', { timeout: 8000 });
  check('accepted: «مقبول» and no edit or withdraw button', /مقبول/.test(await L3.locator('[data-subs] .a-pj').innerText()) && !(await L3.locator(`[data-fk="sed-${s0.id}"]`).count()) && !(await L3.locator(`[data-fk="sdel-${s0.id}"]`).count()));
  check('phone width: the projects card does not overflow', (await overflow(L3)) <= 0);
  await close(L3);
  for (const [email, who] of [['ma@t.test', 'member'], ['pa@t.test', 'parent']]) {
    const V = await open(fake, { label: 'pj-' + who });
    await settle(V); await signInOk(V, email);
    await V.waitForSelector('[data-subs-view]:not([hidden])', { timeout: 8000 });
    const vt = await V.locator('[data-subs-view]').innerText();
    check(`the ${who} reads the team's accepted work (read only, no buttons)`, /سقيا عمّال المدرسة/.test(vt) && /مقبول/.test(vt) && !(await V.locator('[data-subs-view] button').count()));
    check(`the ${who} sees that it is on the home page`, /معروض في الصفحة الرئيسية/.test(vt));
    await close(V);
  }
  /* the home page: visitors see the picked work and its photo, nothing else */
  {
    const before = fake.log.length;
    const V = await open(fake, { path: 'index.html', label: 'pj-home' });
    await V.waitForSelector('[data-yb-projects]:not([hidden])', { timeout: 8000 });
    const ht = await V.locator('[data-yb-projects]').innerText();
    check('home page: «من مشاريع الفرق» shows the picked work with its team', /سقيا عمّال المدرسة/.test(ht) && /فريق/.test(ht));
    check('home page: no member names and no review note in the strip', !NAMES.some(n => ht.includes(n)) && !/أضيفوا صورة/.test(ht));
    await V.waitForFunction(() => [...document.querySelectorAll('[data-yb-projects] img')].some(i => i.complete && i.naturalWidth > 0), null, { timeout: 8000 });
    check('home page: its photo loads through a signed link', (await V.locator('[data-yb-projects] img').count()) >= 1 && /صورة من عمل/.test(await V.locator('[data-yb-projects] img').first().getAttribute('alt')));
    check('home page: read signed out (the public function and the signed links only)', fake.log.slice(before).filter(l => /yb_public_projects|object\/sign/.test(l.path)).every(l => l.who === 'anon')
      && fake.log.slice(before).some(l => l.path.endsWith('/rpc/yb_public_projects')));
    check('home page: console clean', V.errs.length === 0, V.errs.join('|'));
    await close(V);
  }
}

section('announcements and the leaders room (0009): the admin announces, the public strip, the supervised room');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'fo@t.test', name: 'مسؤول الكرة', role: 'member' }); fake.setRole('fo@t.test', 'officer');
  fake.officers.push({ user_id: fake.profileByEmail('fo@t.test').id, competition: 'football' });
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lb@t.test', name: 'قائد الأمل', role: 'leader' });
  fake.addUser({ email: 'ma@t.test', name: 'سالم أحمد', role: 'member' });
  fake.addUser({ email: 'pa@t.test', name: 'ولي يوسف', role: 'parent' });
  fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  fake.seedTeam({ leaderEmail: 'lb@t.test', name: 'الأمل', status: 'approved', members: [{ name: 'أنس بكر', age: 12 }, { name: 'جابر دار', age: 13 }, { name: 'هاني وليد', age: 14 }, { name: 'كريم سعد', age: 15 }] });
  fake.members.find(m => m.full_name === 'سالم أحمد').user_id = fake.profileByEmail('ma@t.test').id;
  fake.links.push({ parent_id: fake.profileByEmail('pa@t.test').id, member_id: fake.members.find(m => m.full_name === 'يوسف علي').id, created_at: fake.now() });

  /* the admin writes two announcements */
  const A = await open(fake, { label: 'comms-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-comms').click();
  await A.waitForSelector('[data-fk="aann-new"]', { timeout: 8000 });
  check('the «التواصل» tab holds the announcements desk and the leaders room', (await A.locator('[data-ann-desk]').count()) === 1 && (await A.locator('[data-chat]').count()) === 1);
  await A.locator('[data-fk="aann-new"]').click();
  check('the form warns not to name children', /لا تذكر أسماء الأطفال/.test(await A.locator('[data-ann-desk]').innerText()));
  await A.locator('[data-fk="apub"]').click();
  check('an empty announcement asks for a title', /اكتب عنوانًا للإعلان/.test(await A.locator('[data-ann-desk]').innerText()) && fake.ann.length === 0);
  await A.locator('[data-ann-desk] input[name=atitle]').fill('افتتاح المسابقة');
  await A.locator('[data-ann-desk] textarea[name=abody]').fill('يبدأ حفل الافتتاح الساعة الخامسة مساءً في قاعة الجمعية. ' + 'نرجو حضور الفرق مع أوليائها قبل الموعد بربع ساعة. '.repeat(3));
  await A.locator('[data-fk="apub"]').click();
  await A.waitForFunction(() => document.querySelectorAll('[data-ann-desk] [data-ann]').length === 1);
  check('«انشر الآن» publishes it to everybody', fake.ann.length === 1 && fake.ann[0].published && fake.ann[0].audience === 'all');
  check('everybody but the admin is told in their inbox', ['fo@t.test', 'la@t.test', 'lb@t.test', 'ma@t.test', 'pa@t.test'].every(e => fake.notes.some(n => n.kind === 'announcement' && n.user_id === fake.profileByEmail(e).id)));
  await A.locator('[data-fk="aann-new"]').click();
  await A.locator('[data-ann-desk] input[name=atitle]').fill('اجتماع القادة');
  await A.locator('[data-ann-desk] textarea[name=abody]').fill('اجتماع القادة يوم الخميس بعد العصر.');
  await A.locator('[data-ann-desk] select[name=aud]').selectOption('leaders');
  await A.locator('[data-fk="adraft"]').click();
  await A.waitForFunction(() => document.querySelectorAll('[data-ann-desk] [data-ann]').length === 2);
  const lead = fake.ann.find(a => a.title === 'اجتماع القادة');
  check('«احفظ مسودة» keeps it unpublished and tells nobody', lead && !lead.published && !fake.notes.some(n => n.kind === 'announcement' && n.data.title === 'اجتماع القادة'));
  await A.locator(`[data-fk="atog-${lead.id}"]`).click();
  await A.waitForFunction(id => /منشور/.test(document.querySelector(`[data-ann="${id}"]`).innerText), lead.id);
  check('«انشره» publishes the draft; the leaders and officers are told', lead.published && fake.notes.some(n => n.kind === 'announcement' && n.data.title === 'اجتماع القادة' && n.user_id === fake.profileByEmail('la@t.test').id)
    && !fake.notes.some(n => n.kind === 'announcement' && n.data.title === 'اجتماع القادة' && n.user_id === fake.profileByEmail('ma@t.test').id));
  check('admin console clean (announcements)', A.errs.length === 0, A.errs.join('|'));
  await close(A);

  /* the public strip */
  for (const pth of ['index.html', 'tournament.html']) {
    const before = fake.log.length;
    const V = await open(fake, { path: pth, label: 'news-' + pth });
    await V.waitForSelector('[data-yb-news]:not([hidden])', { timeout: 8000 });
    const t = await V.locator('[data-yb-news]').innerText();
    check(`${pth}: «آخر الإعلانات» shows the public announcement only`, /افتتاح المسابقة/.test(t) && !/اجتماع القادة/.test(t));
    if (pth === 'index.html') {
      await V.locator('.ybn-more').click();
      check('a long announcement opens with «اقرأ الإعلان كاملًا»', (await V.locator('.ybn-more').getAttribute('aria-expanded')) === 'true');
    }
    check(`${pth}: the strip was read signed out, without the author column`, fake.log.slice(before).filter(l => l.path.endsWith('/yb_announcements')).every(l => l.who === 'anon' && !/created_by/.test(l.search)) && fake.log.slice(before).some(l => l.path.endsWith('/yb_announcements')));
    await close(V);
  }

  /* leader A posts in the room */
  const LA = await open(fake, { label: 'comms-la' });
  await settle(LA); await signInOk(LA, 'la@t.test');
  await LA.waitForSelector('[data-ann-feed]:not([hidden])', { timeout: 8000 });
  check('the leader feed shows «all» and «leaders» announcements', /افتتاح المسابقة/.test(await LA.locator('[data-ann-feed]').innerText()) && /اجتماع القادة/.test(await LA.locator('[data-ann-feed]').innerText()));
  check('the leader has the leaders room, closed', (await LA.locator('[data-chat]').count()) === 1 && (await LA.locator('[data-chat] .a-chat-l').count()) === 0);
  await LA.locator('[data-fk="lchat-open"]').click();
  await LA.waitForSelector('[data-chat] .a-chat-l');
  await LA.locator('[data-fk="lchat-ta"]').fill('رقمي ٠٥٣٠ ٥١٧ ٥٤ ٣١ للتواصل');
  await LA.locator('[data-chat] form button[type=submit]').click();
  await LA.waitForFunction(() => /لا تُكتب أرقام الهواتف/.test(document.querySelector('[data-chat]').innerText));
  check('a phone number (Arabic digits, spaces) is refused with a clear message', fake.chat.length === 0);
  await LA.locator('[data-fk="lchat-ta"]').fill('السلام عليكم، متى تدريب الجمعة؟');
  await LA.locator('[data-chat] form button[type=submit]').click();
  await LA.waitForSelector('[data-chat] .a-chat-i.mine');
  check('the message is posted and shown as «أنت»', fake.chat.length === 1 && /أنت/.test(await LA.locator('[data-chat] .a-chat-i.mine').innerText()));
  await LA.locator('[data-fk="lchat-ta"]').fill('ونحتاج كرة إضافية');
  await LA.locator('[data-chat] form button[type=submit]').click();
  await LA.waitForFunction(() => /انتظر ثواني/.test(document.querySelector('[data-chat]').innerText));
  check('a second message within 3 seconds waits', fake.chat.length === 1);
  check('leader console clean (room)', LA.errs.length === 0, LA.errs.join('|'));
  await close(LA);

  /* leader B: unread, reads, reports */
  const LB = await open(fake, { label: 'comms-lb', mobile: true });
  await settle(LB); await signInOk(LB, 'lb@t.test');
  await LB.waitForFunction(() => /1 رسالة جديدة/.test((document.querySelector('[data-chat]') || {}).innerText || ''), null, { timeout: 8000 });
  check('another leader sees «1 رسالة جديدة» on the closed room', true);
  await LB.locator('[data-fk="lchat-open"]').click();
  await LB.waitForSelector('[data-chat] .a-chat-i');
  check('they read the message with the name and the role', /قائد النور/.test(await LB.locator('[data-chat] .a-chat-i').first().innerText()) && /قائد/.test(await LB.locator('[data-chat] .a-chat-i').first().innerText()));
  check('opening marks it seen', (fake.reads.get(fake.profileByEmail('lb@t.test').id) || 0) === fake.chat[0].id);
  check('phone width: the open room does not overflow', (await overflow(LB)) <= 0);
  const mid = fake.chat[0].id;
  await LB.locator(`[data-fk="crep-${mid}"]`).click();
  check('reporting needs a second press', fake.reports.length === 0);
  await LB.locator(`[data-fk="crep-${mid}"]`).click();
  await LB.waitForFunction(() => /بلّغتَ عنها/.test(document.querySelector('[data-chat]').innerText));
  check('the report reaches the admin', fake.reports.length === 1 && fake.notes.some(n => n.kind === 'chat_report' && n.user_id === fake.profileByEmail('boss@t.test').id));
  await close(LB);

  /* members and parents: no room */
  for (const [email, who] of [['ma@t.test', 'member'], ['pa@t.test', 'parent']]) {
    const V = await open(fake, { label: 'comms-' + who });
    await settle(V); await signInOk(V, email);
    await V.waitForSelector('[data-ann-feed]:not([hidden])', { timeout: 8000 });
    check(`the ${who} reads «all» announcements only and has no leaders room`, /افتتاح المسابقة/.test(await V.locator('[data-ann-feed]').innerText()) && !/اجتماع القادة/.test(await V.locator('[data-ann-feed]').innerText())
      && (await V.locator('[data-chat]').count()) === 0 && !fake.log.some(l => /yb_chat_(list|post)/.test(l.path) && l.who === fake.profileByEmail(email).id));
    await close(V);
  }

  /* the officer is in the room */
  const FO = await open(fake, { label: 'comms-fo' });
  await settle(FO); await signInOk(FO, 'fo@t.test');
  await FO.waitForSelector('[data-chat]', { timeout: 8000 });
  check('an officer has the leaders room too', (await FO.locator('[data-chat]').count()) === 1);
  await close(FO);

  /* the admin moderates */
  const A2 = await open(fake, { label: 'comms-admin2' });
  await settle(A2); await signInOk(A2, 'boss@t.test');
  await A2.locator('#at-comms').click();
  await A2.waitForSelector('[data-fk="achat-open"]', { timeout: 8000 });
  await A2.locator('[data-fk="achat-open"]').click();
  await A2.waitForSelector(`[data-msg="${mid}"]`);
  check('the admin sees «1 بلاغ» on the reported message', /1 بلاغ/.test(await A2.locator(`[data-msg="${mid}"]`).innerText()));
  await A2.locator(`[data-fk="chide-${mid}"]`).click();
  await A2.waitForFunction(id => /مخفية عن الغرفة/.test(document.querySelector(`[data-msg="${id}"]`).innerText), mid);
  check('«أخفها» hides it and closes the report', fake.chat[0].hidden && fake.reports.every(r => r.resolved));
  await A2.locator(`[data-fk="cmsel-${mid}"]`).selectOption('24');
  await A2.locator(`[data-fk="cmute-${mid}"]`).click();
  await A2.waitForFunction(() => /قائد النور/.test(document.querySelector('.a-chat-mutes').innerText));
  check('«أوقف مشاركته» mutes the author for a day; the list shows them; they are told', fake.mutes.has(fake.profileByEmail('la@t.test').id) && fake.notes.some(n => n.kind === 'chat_muted' && n.user_id === fake.profileByEmail('la@t.test').id));
  const laId = fake.profileByEmail('la@t.test').id;
  await close(A2);
  const LA2 = await open(fake, { label: 'comms-la2' });
  await settle(LA2); await signInOk(LA2, 'la@t.test');
  await LA2.waitForSelector('[data-fk="lchat-open"]', { timeout: 8000 });
  await LA2.locator('[data-fk="lchat-open"]').click();
  await LA2.waitForSelector(`[data-msg="${mid}"]`);
  check('the author sees their own message hidden by the admin', /أخفت الإدارة هذه الرسالة/.test(await LA2.locator(`[data-msg="${mid}"]`).innerText()));
  await LA2.locator('[data-fk="lchat-ta"]').fill('هل وصلت رسالتي؟');
  await LA2.locator('[data-chat] form button[type=submit]').click();
  await LA2.waitForFunction(() => /أوقفت الإدارة مشاركتك/.test(document.querySelector('[data-chat]').innerText));
  check('a muted leader cannot post (and is told why)', fake.chat.length === 1);
  await close(LA2);
  const A3 = await open(fake, { label: 'comms-admin3' });
  await settle(A3); await signInOk(A3, 'boss@t.test');
  await A3.locator('#at-comms').click();
  await A3.waitForSelector('[data-fk="achat-open"]', { timeout: 8000 });
  await A3.locator('[data-fk="achat-open"]').click();
  await A3.waitForSelector(`[data-fk="cun-${laId}"]`, { timeout: 8000 });
  await A3.locator(`[data-fk="cun-${laId}"]`).click();
  await A3.waitForFunction(() => /لا أحد موقوف الآن/.test(document.querySelector('.a-chat-mutes').innerText));
  check('«أعد مشاركته» unmutes', !fake.mutes.has(laId));
  check('admin console clean (room)', A3.errs.length === 0, A3.errs.join('|'));
  await close(A3);
}

section('judging (0010): the admin chooses judges, a judge gives points with reasons, publish, the team reads why');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'j1@t.test', name: 'الحكم الأول', role: 'parent' });
  fake.addUser({ email: 'jk@t.test', name: 'حكم ولي في النور', role: 'parent' });
  fake.addUser({ email: 'pa@t.test', name: 'ولي يوسف', role: 'parent' });
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lb@t.test', name: 'قائد الأمل', role: 'leader' });
  fake.addUser({ email: 'ma@t.test', name: 'سالم أحمد', role: 'member' });
  const TA = fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  const TB = fake.seedTeam({ leaderEmail: 'lb@t.test', name: 'الأمل', status: 'approved', members: [{ name: 'أنس بكر', age: 12 }, { name: 'جابر دار', age: 13 }, { name: 'هاني وليد', age: 14 }, { name: 'كريم سعد', age: 15 }] });
  fake.members.find(m => m.full_name === 'سالم أحمد').user_id = fake.profileByEmail('ma@t.test').id;
  fake.links.push({ parent_id: fake.profileByEmail('pa@t.test').id, member_id: fake.members.find(m => m.full_name === 'يوسف علي').id, created_at: fake.now() });
  fake.links.push({ parent_id: fake.profileByEmail('jk@t.test').id, member_id: fake.members.find(m => m.full_name === 'عمر حسن').id, created_at: fake.now() });
  const j1 = fake.profileByEmail('j1@t.test').id, jk = fake.profileByEmail('jk@t.test').id;

  /* the admin chooses two judges */
  const A = await open(fake, { label: 'judge-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-judging').click();
  await A.waitForSelector('[data-judges] [data-fk="ajdg-pick"]', { timeout: 8000 });
  const opts = await A.locator('[data-fk="ajdg-pick"] option').allInnerTexts();
  check('only parents and admins can be picked as judges (no leaders, no members)', opts.some(o => /الحكم الأول/.test(o)) && !opts.some(o => /قائد|سالم/.test(o)));
  await A.locator('[data-fk="ajdg-pick"]').selectOption(j1);
  await A.locator('[data-judges] .a-judge-add input[value=tatbiq]').check();
  await A.locator('[data-fk="ajdg-add"]').click();
  await A.waitForSelector(`[data-judge-row="${j1}"]`);
  check('«اجعله حكمًا» makes the parent a judge of hifz and tatbiq, and tells them', JSON.stringify(fake.judges.get(j1)) === '["hifz","tatbiq"]' && fake.notes.some(n => n.kind === 'judge_assigned' && n.user_id === j1));
  await A.locator('[data-fk="ajdg-pick"]').selectOption(jk);
  await A.locator('[data-fk="ajdg-add"]').click();
  await A.waitForSelector(`[data-judge-row="${jk}"]`);
  check('a second judge (hifz)', JSON.stringify(fake.judges.get(jk)) === '["hifz"]');
  check('nothing is published yet: the board says so', /النتائج غير معلنة/.test(await A.locator('[data-board]').innerText()));
  check('admin console clean (judges)', A.errs.length === 0, A.errs.join('|'));
  await close(A);

  /* judge 1 gives points and writes why */
  const J = await open(fake, { label: 'judge-j1' });
  await settle(J); await signInOk(J, 'j1@t.test');
  await J.waitForSelector('[data-judge]:not([hidden])', { timeout: 8000 });
  check('the judge sees «التحكيم» with their axes and both teams', /الحفظ، التطبيق/.test(await J.locator('[data-judge]').innerText()) && (await J.locator('[data-judge] [data-jteam]').count()) === 2);
  await J.locator(`[data-fk="jt-${TA.id}"]`).click();
  await J.waitForSelector(`[data-fk="js-${TA.id}-hifz"]`);
  check('team A shows the five criteria of hifz and tatbiq, with their caps from the document', (await J.locator(`[data-jteam="${TA.id}"] [data-crit]`).count()) === 4
    && /من 10/.test(await J.locator(`[data-jteam="${TA.id}"] [data-crit="hifz"]`).innerText()) && /من 30/.test(await J.locator(`[data-jteam="${TA.id}"] [data-crit="execution"]`).innerText()));
  await J.locator(`[data-fk="jp-${TA.id}-hifz"]`).fill('8');
  await J.locator(`[data-fk="js-${TA.id}-hifz"]`).click();
  check('a score without a reason is stopped on the page', /اكتب سبب الدرجة/.test(await J.locator(`[data-jteam="${TA.id}"] [data-crit="hifz"]`).innerText()) && fake.jscores.length === 0);
  await J.locator(`[data-fk="jp-${TA.id}-hifz"]`).fill('12');
  await J.locator(`[data-fk="jr-${TA.id}-hifz"]`).fill('تلاوة صحيحة مع تردد في الآية الرابعة');
  await J.locator(`[data-fk="js-${TA.id}-hifz"]`).click();
  check('more than the cap is stopped', /الدرجة من 0 إلى 10/.test(await J.locator(`[data-jteam="${TA.id}"] [data-crit="hifz"]`).innerText()) && fake.jscores.length === 0);
  await J.locator(`[data-fk="jp-${TA.id}-hifz"]`).fill('8');
  await J.locator(`[data-fk="js-${TA.id}-hifz"]`).click();
  await J.waitForFunction(id => /مُقيَّم/.test(document.querySelector(`[data-jteam="${id}"] [data-crit="hifz"]`).innerText), TA.id);
  check('8 for hifz is saved with the reason', fake.jscores.length === 1 && fake.jscores[0].points === 8 && fake.jscores[0].reason === 'تلاوة صحيحة مع تردد في الآية الرابعة');
  await J.locator(`[data-fk="jp-${TA.id}-execution"]`).fill('25.5');
  await J.locator(`[data-fk="jr-${TA.id}-execution"]`).fill('نفذوا سقيا الحي مرتين بأنفسهم');
  await J.locator(`[data-fk="js-${TA.id}-execution"]`).click();
  await J.waitForFunction(id => /مُقيَّم/.test(document.querySelector(`[data-jteam="${id}"] [data-crit="execution"]`).innerText), TA.id);
  check('half points are allowed (25.5 for execution)', fake.jscores.some(s => s.criterion === 'execution' && s.points === 25.5));
  check('the team box counts the scores given (2 من 4)', /2 من 4/.test(await J.locator(`[data-fk="jt-${TA.id}"]`).innerText()));
  check('judge console clean', J.errs.length === 0, J.errs.join('|'));
  await close(J);

  /* the judge with a child in team A */
  const K = await open(fake, { label: 'judge-jk' });
  await settle(K); await signInOk(K, 'jk@t.test');
  await K.waitForSelector('[data-judge]:not([hidden])', { timeout: 8000 });
  check('a judge whose child is in team A sees «لا تحكّمه» there and no inputs', /لا تحكّمه/.test(await K.locator(`[data-fk="jt-${TA.id}"]`).innerText()) && (await K.locator(`[data-jteam="${TA.id}"] input`).count()) === 0);
  await close(K);

  /* before publication: no results for the team, none in public */
  const L0 = await open(fake, { label: 'judge-la0' });
  await settle(L0); await signInOk(L0, 'la@t.test');
  await L0.waitForSelector('[data-subs]', { timeout: 8000 });
  await L0.waitForTimeout(300);
  check('before publication the leader sees no result card', (await L0.locator('[data-scores]:not([hidden])').count()) === 0);
  await close(L0);

  /* the admin reads the reasons, enters football, publishes */
  const A2 = await open(fake, { label: 'judge-admin2' });
  await settle(A2); await signInOk(A2, 'boss@t.test');
  await A2.locator('#at-judging').click();
  await A2.waitForSelector('[data-board] .a-results', { timeout: 8000 });
  check('the board shows team A with 33.5 so far', /33\.5/.test(await A2.locator('[data-board] .a-results').innerText()));
  await A2.locator(`[data-fk="bt-${TA.id}"]`).click();
  check('the admin reads each score with the judge\'s name and reason', /الحكم الأول/.test(await A2.locator(`[data-board-team="${TA.id}"]`).innerText()) && /تردد في الآية الرابعة/.test(await A2.locator(`[data-board-team="${TA.id}"]`).innerText()));
  await A2.locator(`[data-fk="ap-${TA.id}-football"]`).fill('18');
  await A2.locator(`[data-fk="as-${TA.id}-football"]`).click();
  check('football points need a reason too', fake.ascores.length === 0 && /اكتب سبب درجة كرة القدم/.test(await A2.locator('[data-judging-admin]').innerText()));
  await A2.locator(`[data-fk="ar-${TA.id}-football"]`).fill('المركز الأول في الدوري');
  await A2.locator(`[data-fk="as-${TA.id}-football"]`).click();
  await A2.waitForFunction(() => /51\.5/.test(document.querySelector('[data-board] .a-results').innerText));
  check('football 18 with its reason: team A at 51.5', fake.ascores.length === 1 && fake.ascores[0].reason === 'المركز الأول في الدوري');
  await A2.locator('[data-fk="ajdg-pub"]').click();
  check('publishing needs a second press', !fake.published);
  await A2.locator('[data-fk="ajdg-pub"]').click();
  await A2.waitForFunction(() => /النتائج معلنة الآن/.test(document.querySelector('[data-board]').innerText));
  check('the second press publishes; everybody is told', fake.published && fake.notes.some(n => n.kind === 'results_published' && n.user_id === fake.profileByEmail('la@t.test').id));
  check('admin console clean (board)', A2.errs.length === 0, A2.errs.join('|'));
  await close(A2);

  /* the public ranking on the tournament board */
  const P = await open(fake, { path: 'tournament.html', label: 'judge-public' });
  await P.waitForSelector('[data-yb-results]:not([hidden])', { timeout: 8000 });
  const pt = await P.locator('[data-yb-results]').innerText();
  check('tournament.html shows «النتائج النهائية»: team A first with 51.5, team B with 0', /النور/.test(pt) && /51\.5/.test(pt) && /الأمل/.test(pt) && !/تردد|الحكم/.test(pt));
  await close(P);

  /* the team reads why */
  const L = await open(fake, { label: 'judge-la', mobile: true });
  await settle(L); await signInOk(L, 'la@t.test');
  await L.waitForSelector('[data-scores]:not([hidden])', { timeout: 8000 });
  const lt = await L.locator('[data-scores]').innerText();
  check('the leader reads the team result: 51.5 of 100, rank 1', /51\.5 من 100/.test(lt) && /المركز 1/.test(lt));
  check('with the judges\' reasons and the football reason, never the judges\' names', /تردد في الآية الرابعة/.test(lt) && /المركز الأول في الدوري/.test(lt) && !/الحكم الأول/.test(lt));
  check('phone width: the result card does not overflow', (await overflow(L)) <= 0);
  await close(L);
  for (const [email, who] of [['ma@t.test', 'member'], ['pa@t.test', 'parent']]) {
    const V = await open(fake, { label: 'judge-' + who });
    await settle(V); await signInOk(V, email);
    await V.waitForSelector('[data-scores]:not([hidden])', { timeout: 8000 });
    check(`the ${who} reads team A's result and reasons`, /51\.5 من 100/.test(await V.locator('[data-scores]').innerText()));
    await close(V);
  }
  const LB = await open(fake, { label: 'judge-lb' });
  await settle(LB); await signInOk(LB, 'lb@t.test');
  await LB.waitForSelector('[data-scores]:not([hidden])', { timeout: 8000 });
  check('the other leader reads only their own team', /الأمل/.test(await LB.locator('[data-scores]').innerText()) && !/تردد في الآية/.test(await LB.locator('[data-scores]').innerText()));
  await close(LB);

  /* after publication the judge's scores are locked */
  const J2 = await open(fake, { label: 'judge-j1b' });
  await settle(J2); await signInOk(J2, 'j1@t.test');
  await J2.waitForSelector('[data-judge]:not([hidden])', { timeout: 8000 });
  check('after publication the judge sees «مقفلة» and no save buttons', /مقفلة/.test(await J2.locator('[data-judge]').innerText()) && (await J2.locator('[data-judge] [data-fk^="js-"]').count()) === 0);
  await close(J2);
}

section('the news feed, customization, the handover and the statistics (0011): one season day, start to finish');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'la@t.test', name: 'قائد النور', role: 'leader' });
  fake.addUser({ email: 'lb@t.test', name: 'قائد الأمل', role: 'leader' });
  fake.addUser({ email: 'ma@t.test', name: 'سالم أحمد', role: 'member' });
  fake.addUser({ email: 'pa@t.test', name: 'ولي يوسف', role: 'parent' });
  fake.addUser({ email: 'pb@t.test', name: 'ولي جديد', role: 'parent' });
  fake.seedTeam({ leaderEmail: 'la@t.test', name: 'النور', status: 'approved', members: [{ name: 'سالم أحمد', age: 12 }, { name: 'يوسف علي', age: 13 }, { name: 'عمر حسن', age: 14 }, { name: 'زيد محمود', age: 15 }] });
  const TB = fake.seedTeam({ leaderEmail: 'lb@t.test', name: 'الأمل', status: 'approved', members: [{ name: 'أنس بكر', age: 12 }, { name: 'جابر دار', age: 13 }, { name: 'هاني وليد', age: 14 }, { name: 'كريم سعد', age: 15 }] });
  fake.members.find(m => m.full_name === 'سالم أحمد').user_id = fake.profileByEmail('ma@t.test').id;
  fake.links.push({ parent_id: fake.profileByEmail('pa@t.test').id, member_id: fake.members.find(m => m.full_name === 'يوسف علي').id, created_at: fake.now() });

  /* the leader gives the team its color and badge, then writes news (it waits for the admin) */
  const L = await open(fake, { label: 'soc-la' });
  await settle(L); await signInOk(L, 'la@t.test');
  await L.waitForSelector('[data-team-style] [data-fk="tsc-purple"]', { timeout: 8000 });
  await L.locator('[data-fk="tsc-purple"]').check();
  await L.locator('[data-fk="tsb-moon"]').check();
  await L.locator('[data-fk="tst-save"]').click();
  await L.waitForFunction(() => /حُفظت هوية الفريق/.test(document.querySelector('[data-team-style]').innerText));
  check('the leader saves the team color and badge', JSON.stringify(fake.tstyle.get(fake.teams[0].id)) === JSON.stringify({ team_id: fake.teams[0].id, color: 'purple', badge: 'moon' }));
  await L.waitForSelector('[data-feed] [data-feed-form]', { timeout: 8000 });
  check('the side menu has «الأخبار» right after the overview', (await L.locator('.a-side-nav [data-nav]').allInnerTexts()).slice(0, 2).join('|').replace(/\s+/g, ' ').trim() === 'نظرة عامة|الأخبار');
  check('the leader is told news waits for the admin', /يراجع المشرف خبرك/.test(await L.locator('[data-feed-form]').innerText()));
  await L.locator('[data-fk="feed-ta"]').fill('تدريبنا الأول اكتمل بعد صلاة العصر، وراجعنا آيات سورة الصف معًا.');
  await L.locator('[data-feed-form] button[type=submit]').click();
  await L.waitForSelector('[data-feed] .a-post.st-pending', { timeout: 8000 });
  const lp = fake.posts[0];
  check('a leader\'s post is saved as waiting, and the admin is told', lp && lp.status === 'pending' && fake.notes.some(n => n.kind === 'post_pending' && n.user_id === fake.profileByEmail('boss@t.test').id));
  check('the leader sees it marked «بانتظار موافقة المشرف», with the team badge', /بانتظار موافقة المشرف/.test(await L.locator('.a-post.st-pending').innerText()) && /النور/.test(await L.locator('.a-post.st-pending .a-tbadge').innerText()));
  check('leader console clean (feed)', L.errs.length === 0, L.errs.join('|'));
  await close(L);

  /* the admin publishes it, writes a pinned post of their own */
  const A = await open(fake, { label: 'soc-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-feed').click();
  await A.waitForSelector(`[data-feed-queue] [data-fk="pqp-${lp.id}"]`, { timeout: 8000 });
  check('the admin\'s «الأخبار» tab shows the waiting post in «بانتظار موافقتك (1)»', /بانتظار موافقتك \(1\)/.test(await A.locator('[data-feed-queue]').innerText()));
  await A.locator(`[data-fk="pqp-${lp.id}"]`).click();
  await A.waitForFunction(() => !document.querySelector('[data-feed-queue]'));
  check('«انشره» publishes it and tells the leader', lp.status === 'published' && fake.notes.some(n => n.kind === 'post_reviewed' && n.data.action === 'publish'));
  await A.locator('[data-fk="feed-ta"]').fill('أهلًا بكم في أخبار ينابيع. موعد التسميع الأول يوم الخميس.');
  await A.locator('[data-feed-form] button[type=submit]').click();
  await A.waitForFunction(() => document.querySelectorAll('[data-feed] .a-feed-l .a-post').length === 2);
  const ap = fake.posts.find(x => x.author_role === 'admin');
  check('the admin\'s post is published at once', ap && ap.status === 'published');
  await A.locator(`[data-fk="pp-${ap.id}"]`).click();
  await A.waitForSelector(`[data-post="${ap.id}"].pinned`);
  check('«ثبّت في الأعلى» pins it to the top of the feed', ap.pinned && (await A.locator('[data-feed] .a-feed-l .a-post').first().getAttribute('data-post')) === ap.id);
  check('members\' comments start off (the owner has not decided student chat yet)', !(await A.locator('[data-fk="feed-mc"]').isChecked()) && !fake.membersComment);
  check('admin console clean (feed)', A.errs.length === 0, A.errs.join('|'));
  await close(A);

  /* a member reacts but cannot comment */
  const M = await open(fake, { label: 'soc-ma', mobile: true });
  await settle(M); await signInOk(M, 'ma@t.test');
  await M.waitForSelector(`[data-feed] [data-post="${lp.id}"]`, { timeout: 8000 });
  check('the member\'s feed: pinned admin post first, then the team news', (await M.locator('[data-feed] .a-post').first().getAttribute('data-post')) === ap.id);
  await M.locator(`[data-fk="rx-strong-${lp.id}"]`).click();
  await M.waitForFunction(id => document.querySelector(`[data-fk="rx-strong-${id}"]`).getAttribute('aria-pressed') === 'true', lp.id);
  check('the member reacts 💪 (counted once, shown pressed)', lp.reactions.length === 1 && lp.reactions[0].kind === 'strong');
  await M.locator(`[data-fk="cm-${lp.id}"]`).click();
  await M.waitForSelector(`[data-comments="${lp.id}"] .a-empty`);
  check('the member reads comments but has no comment box while it is off', !(await M.locator(`[data-comments="${lp.id}"] textarea`).count()) && /حين تسمح به الإدارة/.test(await M.locator(`[data-comments="${lp.id}"]`).innerText()));
  check('phone width: the feed does not overflow', (await overflow(M)) <= 0);
  await close(M);

  /* a parent comments; a phone number is refused */
  const P = await open(fake, { label: 'soc-pa' });
  await settle(P); await signInOk(P, 'pa@t.test');
  await P.waitForSelector(`[data-fk="cm-${lp.id}"]`, { timeout: 8000 });
  await P.locator(`[data-fk="cm-${lp.id}"]`).click();
  await P.waitForSelector(`[data-fk="ct-${lp.id}"]`);
  await P.locator(`[data-fk="ct-${lp.id}"]`).fill('تواصلوا معي على 0530 517 5431');
  await P.locator(`[data-comments="${lp.id}"] button[type=submit]`).click();
  await P.waitForSelector(`[data-comments="${lp.id}"] .a-err:not([hidden])`);
  check('a comment with a phone number is refused, with the reason', /أرقام الهواتف/.test(await P.locator(`[data-comments="${lp.id}"] .a-err`).innerText()) && fake.cmts.length === 0);
  await P.locator(`[data-fk="ct-${lp.id}"]`).fill('ما شاء الله، بارك الله فيكم');
  await P.locator(`[data-comments="${lp.id}"] button[type=submit]`).click();
  await P.waitForSelector(`[data-comments="${lp.id}"] .a-cmt`);
  check('the parent comments; the count follows; the leader is told', fake.cmts.length === 1 && /التعليقات \(1\)/.test(await P.locator(`[data-fk="cm-${lp.id}"]`).innerText()) && fake.notes.some(n => n.kind === 'comment_new'));
  /* the parent customizes the account */
  await P.locator('[data-fk="cust-open"]').click();
  await P.waitForSelector('[data-settings]:not([hidden]) [data-fk="cth-dark"]');
  await P.locator('[data-fk="cth-dark"]').check();
  await P.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await P.locator('[data-fk="cac-purple"]').check();
  await P.waitForFunction(() => document.documentElement.classList.contains('acc-purple'));
  await P.locator('[data-fk="csz-l"]').check();
  await P.waitForFunction(() => document.documentElement.classList.contains('ts-l'));
  const pid = fake.profileByEmail('pa@t.test').id;
  check('dark theme, purple accent and large text are applied and saved to the account', JSON.stringify([fake.prefs.get(pid).theme, fake.prefs.get(pid).accent, fake.prefs.get(pid).text_size]) === '["dark","purple","l"]');
  await P.locator('[data-fk="cnote-projects"]').uncheck();
  await P.waitForFunction(() => /لن تصلك تنبيهات/.test(document.querySelector('[data-cust-status]').textContent));
  check('notification choice saved (projects off)', JSON.stringify(fake.prefs.get(pid).notify_off) === '["projects"]');
  await P.locator('[data-fk="csec-link"]').uncheck();
  await P.waitForFunction(() => !document.querySelector('[data-nav="link"]'));
  check('hiding a section removes it from the side menu and the page', !(await P.locator('#sec-link').count()) && JSON.stringify(fake.prefs.get(pid).hidden_sections) === '["link"]');
  check('a parent may upload a profile picture (a grown-up)', (await P.locator('[data-settings] [data-fk="cpic"]').count()) === 1);
  check('parent console clean (comments, settings)', P.errs.length === 0, P.errs.join('|'));
  await close(P);
  const P2 = await open(fake, { label: 'soc-pa2' });
  await settle(P2); await signInOk(P2, 'pa@t.test');
  await P2.waitForSelector('[data-feed]', { timeout: 8000 });
  check('the settings follow the person to a new device (theme, accent, hidden section)', await P2.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.classList.contains('acc-purple') && !document.querySelector('[data-nav="link"]')));
  await close(P2);
  const M2 = await open(fake, { label: 'soc-ma2' });
  await settle(M2); await signInOk(M2, 'ma@t.test');
  await M2.locator('[data-fk="cust-open"]').click();
  await M2.waitForSelector('[data-settings]:not([hidden])');
  check('a member (child) gets initials, never a picture upload', !(await M2.locator('[data-settings] [data-fk="cpic"]').count()) && /لا تُرفع صور الأعضاء/.test(await M2.locator('[data-settings]').innerText()));
  await close(M2);

  /* another leader reports the comment; the admin hides it */
  const LB = await open(fake, { label: 'soc-lb' });
  await settle(LB); await signInOk(LB, 'lb@t.test');
  await LB.waitForSelector(`[data-fk="cm-${lp.id}"]`, { timeout: 8000 });
  await LB.locator(`[data-fk="cm-${lp.id}"]`).click();
  const cid = fake.cmts[0].id;
  await LB.waitForSelector(`[data-fk="cr-${cid}"]`);
  await LB.locator(`[data-fk="cr-${cid}"]`).click();
  check('reporting needs a second press', fake.creports.length === 0);
  await LB.locator(`[data-fk="cr-${cid}"]`).click();
  await LB.waitForFunction(() => /أبلغت عنه/.test(document.querySelector('[data-comments]').innerText));
  check('the report reaches the admin', fake.creports.length === 1 && fake.notes.some(n => n.kind === 'comment_report'));
  await close(LB);
  const A2 = await open(fake, { label: 'soc-admin2' });
  await settle(A2); await signInOk(A2, 'boss@t.test');
  await A2.locator('#at-feed').click();
  await A2.waitForSelector('[data-fk="feed-reps"]', { timeout: 8000 });
  check('the admin sees «بلاغات التعليقات (1)»', /بلاغات التعليقات \(1\)/.test(await A2.locator('[data-fk="feed-reps"]').innerText()));
  await A2.locator('[data-fk="feed-reps"]').click();
  await A2.waitForSelector(`[data-fk="crh-${cid}"]`);
  await A2.locator(`[data-fk="crh-${cid}"]`).click();
  await A2.waitForFunction(() => /بلاغات التعليقات$/.test(document.querySelector('[data-fk="feed-reps"]').innerText.trim()));
  check('«أخفِ التعليق» hides it and closes the report', fake.cmts[0].hidden && fake.creports.every(r => r.resolved));

  /* the handover: a leader who leads a team is not demoted directly */
  await A2.locator('#at-people').click();
  const lbId = fake.profileByEmail('lb@t.test').id, pbId = fake.profileByEmail('pb@t.test').id;
  await A2.waitForSelector(`[data-fk="rs-${lbId}"]`);
  check('a leader with a team has «سلّم الفريق»', (await A2.locator(`[data-fk="tr-open-${lbId}"]`).count()) === 1);
  await A2.locator('.a-person', { hasText: 'قائد الأمل' }).locator('select').first().selectOption('parent');
  await A2.locator(`[data-fk="rs-${lbId}"]`).click();
  await A2.waitForSelector(`[data-transfer="${lbId}"]:not([hidden]) select`);
  check('changing the role is refused with the reason, and the handover opens', /سلّم الفريق لشخص آخر أولًا/.test(await A2.locator('.a-person', { hasText: 'قائد الأمل' }).innerText()) && fake.profileByEmail('lb@t.test').role === 'leader');
  await A2.locator(`[data-fk="tr-to-${lbId}"]`).selectOption(pbId);
  await A2.locator(`[data-fk="tr-parent-${lbId}"]`).check();
  await A2.locator(`[data-fk="tr-go-${lbId}"]`).click();
  check('the handover needs a second press', TB.leader_id === lbId);
  await A2.locator(`[data-fk="tr-go-${lbId}"]`).click();
  await A2.waitForFunction(() => /سُلّم/.test(document.querySelector('[data-live]').textContent));
  check('the team is handed over: the parent leads it, the old leader is a parent now', TB.leader_id === pbId && fake.profileByEmail('pb@t.test').role === 'leader' && fake.profileByEmail('lb@t.test').role === 'parent');
  check('both are told', fake.notes.some(n => n.kind === 'team_leader_new' && n.user_id === pbId) && fake.notes.some(n => n.kind === 'team_leader_left' && n.user_id === lbId));

  /* the statistics */
  await A2.locator('#at-stats').click();
  await A2.waitForSelector('[data-stats] .a-viz-g', { timeout: 8000 });
  const kp = await A2.locator('[data-stats] .a-kpi').allInnerTexts();
  check('statistics: eight summary tiles (teams, participants, consents, fees, matches, projects, news, notifications)', kp.length === 8 && /الفرق المعتمدة/.test(kp[0]) && /2 من 12/.test(kp[0]));
  check('ten charts, each with a title; every chart that has data has a table behind it', (await A2.locator('[data-stats] .a-viz').count()) === 10 && (await A2.locator('[data-stats] .a-viz details table').count()) >= 8);
  check('the registration line has two named series and a legend', (await A2.locator('[data-stats] .a-line .ln').count()) >= 2 && /الحسابات/.test(await A2.locator('[data-stats] .a-legend').first().innerText()));
  check('bars carry their value as text (no color-only reading)', /2/.test(await A2.locator('[data-stats] .a-viz', { hasText: 'الفرق حسب الحالة' }).locator('.a-hb-v').allInnerTexts().then(a => a.join(' '))));
  await A2.locator('[data-stats] .a-viz', { hasText: 'الفرق حسب الحالة' }).locator('.a-hb-t').nth(3).hover();
  check('hovering a bar shows a tooltip', /معتمد: 2/.test(await A2.locator('[data-stats] .a-viz', { hasText: 'الفرق حسب الحالة' }).locator('.a-viz-tip').innerText()));
  check('statistics never show children\'s names', !/سالم|يوسف علي|أنس بكر/.test(await A2.locator('[data-stats]').innerText()));
  check('admin console clean (reports, handover, statistics)', A2.errs.length === 0, A2.errs.join('|'));
  await close(A2);
  const A3 = await open(fake, { label: 'soc-admin3', mobile: true });
  await settle(A3); await signInOk(A3, 'boss@t.test');
  await A3.locator('.a-dock [data-dock=more]').click();              // on a phone the admin's tabs live in the bottom bar and «المزيد»
  await A3.locator('[data-more] [data-fk=more-stats]').click();
  await A3.waitForSelector('[data-stats] .a-viz-g', { timeout: 8000 });
  check('phone width: the statistics do not overflow', (await overflow(A3)) <= 0);
  await close(A3);
}

/* ================================================================ Excel export (js/xlsx-lite.js, SPEC 4.10.8) */
section('Excel export: the admin\'s workbook, the copy for sharing, the leader\'s team file');
{
  const { execFileSync } = await import('node:child_process');
  const SCRATCH_TMP = (await import('node:os')).tmpdir();
  const py = ['python3.13', 'python3'].find(x => { try { execFileSync(x, ['-c', 'import openpyxl'], { stdio: 'pipe' }); return true; } catch (e) { return false; } });
  const readBook = f => JSON.parse(execFileSync(py, ['-c', `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
print(json.dumps({ws.title: {"rtl": bool(ws.sheet_view.rightToLeft), "rows": [[c.value for c in r] for r in ws.iter_rows()]} for ws in wb.worksheets}, ensure_ascii=False, default=str))`, f], { encoding: 'utf8' }));
  if (!py) console.log('  (openpyxl is not installed: the Excel checks are skipped)');
  else {
    const fake = new Fake();
    fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
    fake.addUser({ email: 'lz@t.test', name: 'قائد السنابل', role: 'leader' });
    fake.addUser({ email: 'lw@t.test', name: 'قائد الفجر', role: 'leader' });
    const kids = ['سالم أحمد علي', 'يوسف خالد عمر', 'أنس بكر سعيد', 'زيد محمد حسن'].map((n, i) => ({ name: n, age: 11 + i, consent: i ? 'pending' : 'received', gname: 'ولي ' + n.split(' ')[1], gphone: '091111111' + i }));
    const TS = fake.seedTeam({ leaderEmail: 'lz@t.test', name: 'السنابل', status: 'approved', members: kids });
    const TW = fake.seedTeam({ leaderEmail: 'lw@t.test', name: 'الفجر', status: 'approved', members: [{ name: 'عمر فاروق نزار', age: 13 }, { name: 'حمزة سامي طه', age: 12 }, { name: 'معاذ رامي وليد', age: 14 }, { name: 'بلال هاني زكي', age: 15 }] });
    fake.events.push({ id: fake.uid(), competition: 'football', kind: 'match', title: 'السنابل ضد الفجر', starts_at: '2026-11-20T13:00:00Z', place: 'ملعب الحي', team_ids: [TS.id, TW.id], category: null, status: 'scheduled', note: null },
      { id: fake.uid(), competition: 'quran', kind: 'recitation', title: 'تسميع الفجر', starts_at: '2026-11-21T13:00:00Z', place: 'المسجد', team_ids: [TW.id], category: null, status: 'scheduled', note: null });
    let st = YT.setTeams(YT.emptyState(), [{ id: TS.id, name: 'السنابل' }, { id: TW.id, name: 'الفجر' }, ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, name: 'فريق ' + (i + 1) }))]);
    st = YT.drawGroups(st, () => 0.5);
    const grp = st.groups.find(x => x.includes(TS.id)), opp = grp.find(x => x !== TS.id);
    st = YT.setResult(st, { a: TS.id, b: opp, sa: 3, sb: 1, date: '2026-11-20', time: '16:00' });
    fake.setTournament(st);
    fake.subs.push({ id: fake.uid(), team_id: TS.id, kind: 'project', title: 'سقيا الحي', value_text: 'الإحسان', place: 'neighborhood', done_on: '2026-11-10', summary: 'وزعنا الماء', results: '40 عبوة',
      members_n: 4, beneficiaries: 40, photos: ['a/b.jpg'], status: 'accepted', review_note: null, created_at: fake.now(), updated_at: fake.now(), featured: true });
    const A = await open(fake, { label: 'xlsx-admin' });
    await settle(A); await signInOk(A, 'boss@t.test');
    await A.locator('#at-export').click();
    await A.waitForSelector('[data-xlsx] [data-fk=xlsx]');
    check('the export tab offers «نزّل ملف Excel الكامل» and the copy for sharing, with the privacy note', await A.locator('[data-fk=xlsx-share]').isVisible() && /أسماء قاصرين/.test(await A.locator('[data-xlsx]').innerText()));
    const grab = async (pg, fk) => { const [d] = await Promise.all([pg.waitForEvent('download'), pg.locator(`[data-fk=${fk}]`).click()]); const f = path.join(fs.mkdtempSync(path.join(SCRATCH_TMP, 'ybx-')), 'book.xlsx'); await d.saveAs(f); const book = readBook(f); fs.rmSync(path.dirname(f), { recursive: true, force: true }); return { name: d.suggestedFilename(), book }; };
    const full = await grab(A, 'xlsx');
    const names = Object.keys(full.book);
    check('a real .xlsx named for the day', /^yanabee-\d{4}-\d\d-\d\d\.xlsx$/.test(full.name), full.name);
    check('eight sheets: الفرق, الأعضاء, الجدول, النتائج, الترتيب, الدرجات, تفاصيل الدرجات, التسليمات', names.join('|') === 'الفرق|الأعضاء|الجدول|النتائج|الترتيب|الدرجات|تفاصيل الدرجات|التسليمات', names.join('|'));
    check('every sheet reads right to left', Object.values(full.book).every(s => s.rtl));
    const teams = full.book['الفرق'].rows;
    const sn = teams.find(r => r[0] === 'السنابل');
    check('الفرق: name, status, leader, 5 members, 5 minors (the leader\'s age unknown), 1 consent', sn && sn[2] === 'معتمد' && sn[3] === 'قائد السنابل' && sn[4] === 5 && sn[6] === 1, JSON.stringify(sn));
    const mem = full.book['الأعضاء'].rows;
    check('الأعضاء (the full file): every member with age and guardian', mem.some(r => r.includes('سالم أحمد علي') && r.includes(11) && r.includes('0911111110')) && mem.length === 1 + 10);
    const ev = full.book['الجدول'].rows;
    check('الجدول: every date with time, kind, place and the teams by name', ev.length === 3 && ev[1].includes('السنابل ضد الفجر') && ev[1].includes('ملعب الحي') && ev[1].includes('السنابل، الفجر') && ev[1].includes('مباراة'));
    const res = full.book['النتائج'].rows;
    check('النتائج: every group match; the played one 3 – 1 with its date', res.length === 1 + 18 && res.some(r => r.includes('السنابل') && r.includes(3) && r.includes(1) && r.includes('2026-11-20') && r.includes('انتهت')));
    const tbl = full.book['الترتيب'].rows;
    check('الترتيب: 12 rows of the group tables, السنابل with 3 points', tbl.length === 13 && tbl.some(r => r[3] === 'السنابل' && r[11] === 3));
    const subs = full.book['التسليمات'].rows;
    check('التسليمات: title, place, status, beneficiaries, photos counted (never their paths)', subs[1].includes('سقيا الحي') && subs[1].includes('السكن والحي') && subs[1].includes('مقبول') && subs[1].includes(40) && !JSON.stringify(subs).includes('a/b.jpg'));
    check('no chat and no e-mail in the workbook', !/@t\.test/.test(JSON.stringify(full.book)));
    const share = await grab(A, 'xlsx-share');
    check('the copy for sharing: no الأعضاء, no تفاصيل الدرجات, and no child\'s name anywhere', !share.book['الأعضاء'] && !share.book['تفاصيل الدرجات'] && !/سالم|يوسف|أنس|زيد|عمر فاروق|0911/.test(JSON.stringify(share.book)) && /^yanabee-share-/.test(share.name));
    check('…with the six other sheets', Object.keys(share.book).length === 6);
    check('«بدأ تنزيل الملف» is announced with the sheet names', /بدأ تنزيل الملف \(6 أوراق/.test(await A.locator('[data-xlsx-status]').innerText()));
    check('the CSV export is still there', (await A.locator('[data-fk=csv]').count()) === 1);
    check('admin console clean (Excel)', A.errs.length === 0, A.errs.join('|'));
    await close(A);
    const L = await open(fake, { label: 'xlsx-leader' });
    await settle(L); await signInOk(L, 'lz@t.test');
    await L.waitForSelector('[data-fk=xlsx-team]', { timeout: 8000 });
    const lb = await grab(L, 'xlsx-team');
    check('the leader\'s file: الفريق, الأعضاء, المواعيد (a plain file name: phones refuse some Arabic names; the team is inside)', Object.keys(lb.book).join('|') === 'الفريق|الأعضاء|المواعيد' && /^yanabee-team-\d{4}-\d\d-\d\d\.xlsx$/.test(lb.name) && lb.book['الفريق'].rows[1][0] === 'السنابل', lb.name);
    check('…their own members with guardians and consent', lb.book['الأعضاء'].rows.length === 6 && lb.book['الأعضاء'].rows.some(r => r.includes('سالم أحمد علي') && r.includes('استُلمت')));
    check('…only their team\'s dates (not the other team\'s recitation)', lb.book['المواعيد'].rows.length === 2 && !JSON.stringify(lb.book['المواعيد']).includes('تسميع الفجر'));
    check('…and nothing of the other team', !/عمر فاروق|حمزة|معاذ|بلال/.test(JSON.stringify(lb.book)));
    check('leader console clean (Excel)', L.errs.length === 0, L.errs.join('|'));
    await close(L);
  }
}

/* ================================================================ players looking for a team (0012) */
section('players looking for a team: the member opts in, a parent approves, the leader finds and invites, both say yes');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'ls@t.test', name: 'قائد الشروق', role: 'leader' });
  fake.addUser({ email: 'lap@t.test', name: 'قائد معتمد', role: 'leader' });
  fake.addUser({ email: 'ldr@t.test', name: 'قائد مسودة', role: 'leader' });
  const kid = fake.addUser({ email: 'yk@t.test', name: 'يوسف سامي الحربي', role: 'member' });
  fake.addUser({ email: 'py@t.test', name: 'ولي يوسف', role: 'parent' });
  const three = n => Array.from({ length: 3 }, (_, i) => ({ name: `${n} ${i + 1}`, age: 12 }));
  const TS = fake.seedTeam({ leaderEmail: 'ls@t.test', name: 'الشروق', status: 'submitted', members: three('عضو الشروق') });
  fake.seedTeam({ leaderEmail: 'lap@t.test', name: 'المعتمد', status: 'approved', members: three('عضو المعتمد').concat([{ name: 'عضو رابع', age: 12 }]) });
  fake.seedTeam({ leaderEmail: 'ldr@t.test', name: 'المسودة', status: 'draft', members: [] });
  fake.stats = { [kid.id]: { goals: 2, wins: 1, spirit: 1 } };
  // the member, without a team, opts in
  const K = await open(fake, { label: 'seek-kid', mobile: true });
  await settle(K); await signInOk(K, 'yk@t.test');
  await K.waitForSelector('[data-seek]:not([hidden]) form', { timeout: 8000 });
  check('a member without a team sees «أبحث عن فريق» under «انضم إلى فريقك», with the privacy note', /أبحث عن فريق/.test(await K.locator('[data-seek]').innerText()) && /اسمك الأول وفئتك وحيّك/.test(await K.locator('[data-seek]').innerText()));
  await K.locator('[data-seek] form button[type=submit]').click();
  check('the age group is required', /اختر فئتك العمرية/.test(await K.locator('[data-seek] form').innerText()));
  await K.locator('[data-seek] select[name=age_group]').selectOption('u13');
  await K.locator('[data-seek] input[name=area]').fill('حي الروضة 0551234567');
  await K.locator('[data-seek] form button[type=submit]').click();
  await K.waitForFunction(() => /أرقام/.test(document.querySelector('[data-seek] form').innerText), null, { timeout: 4000 }).catch(() => {});
  check('a phone number in the area is refused', !fake.seekers.has(kid.id));
  await K.locator('[data-seek] input[name=area]').fill('حي الروضة');
  await K.locator('[data-seek] label', { hasText: 'حارس مرمى' }).click();
  await K.locator('[data-seek] label', { hasText: 'دفاع' }).click();
  await K.locator('[data-seek] form button[type=submit]').click();
  await K.waitForSelector('[data-seek-code]', { timeout: 6000 });
  const code = (await K.locator('[data-seek-code]').innerText()).trim();
  check('saved: the code for a parent and «بانتظار موافقة ولي الأمر»', /^[A-Z0-9]{6}$/.test(code) && /بانتظار موافقة ولي الأمر/.test(await K.locator('[data-seek]').innerText()) && fake.seekers.get(kid.id).positions.join() === 'goal,defense');
  // the leader does not see the child yet
  const L = await open(fake, { label: 'seek-leader' });
  await settle(L); await signInOk(L, 'ls@t.test');
  await L.waitForSelector('[data-pool]:not([hidden])', { timeout: 8000 });
  check('the leader of a submitted team: «لاعبون يبحثون عن فريق» in the menu, empty before the parent approves', await L.locator('[data-nav=players]').count() === 1 && /لا يوجد لاعبون يبحثون عن فريق الآن/.test(await L.locator('[data-pool]').innerText()));
  // the parent approves with the code
  const PA = await open(fake, { label: 'seek-parent' });
  await settle(PA); await signInOk(PA, 'py@t.test');
  await PA.waitForSelector('[data-gseek] form', { timeout: 8000 });
  await PA.locator('[data-gseek] input[name=code]').fill('WRONG1');
  await PA.locator('[data-gseek] button[type=submit]').click();
  await PA.waitForFunction(() => /الرمز غير صحيح/.test(document.querySelector('[data-gseek]').innerText), null, { timeout: 4000 }).catch(() => {});
  check('a wrong code: «الرمز غير صحيح»', /الرمز غير صحيح/.test(await PA.locator('[data-gseek]').innerText()));
  await PA.locator('[data-gseek] input[name=code]').fill(code.toLowerCase());
  await PA.locator('[data-gseek] button[type=submit]').click();
  await PA.waitForSelector('[data-gkid]', { timeout: 6000 });
  check('the right code: the child appears with «في قائمة الباحثين»; only the first name', /يوسف/.test(await PA.locator('[data-gkid]').innerText()) && /في قائمة الباحثين/.test(await PA.locator('[data-gkid]').innerText()) && !/الحربي/.test(await PA.locator('[data-gkid]').innerText()));
  check('the child is told', fake.notes.some(n => n.kind === 'seek_approved' && n.user_id === kid.id));
  // the leader finds and invites
  await reload(L); await L.waitForSelector('[data-pool] [data-player]', { timeout: 8000 });
  const card = await L.locator(`[data-player="${kid.id}"]`).innerText();
  check('the pool: first name, age group, area, positions and achievements, never the family name', /يوسف/.test(card) && /من 10 إلى 12/.test(card) && /حي الروضة/.test(card) && /حارس مرمى/.test(card) && /أهداف 2/.test(card) && /فوز 1/.test(card) && !/الحربي|@t\.test/.test(await L.locator('[data-pool]').innerText()));
  check('«الأنسب» says why: goals, wins, team spirit, no team now', /لماذا يناسبك: سجّل هدفين، فاز مع فريقه مرة، نال «روح الفريق»، بلا فريق الآن/.test(card));
  await L.locator('[data-pool] select[name=pool-pos]').selectOption('attack');
  check('filter by position: nobody plays «هجوم»', /لا لاعبين يطابقون/.test(await L.locator('[data-pool]').innerText()) && /0 من 1/.test(await L.locator('[data-pool]').innerText()));
  await L.locator('[data-pool] select[name=pool-pos]').selectOption('goal');
  await L.locator('[data-pool] input[name=pool-goals]').fill('3');
  check('filter by goals: at least 3 hides him', !(await L.locator(`[data-player="${kid.id}"]`).count()));
  await L.locator('[data-pool] input[name=pool-goals]').fill('1');
  await L.locator(`[data-fk="pool-inv-${kid.id}"]`).click();
  await L.waitForFunction(id => /دُعي/.test((document.querySelector(`[data-player="${id}"]`) || {}).innerText || ''), kid.id, { timeout: 6000 });
  check('«ادعُه إلى فريقك»: invited; the child and the parent are told', fake.invites.length === 1 && fake.notes.filter(n => n.kind === 'invite_new').length === 2);
  check('leader console clean (pool)', L.errs.length === 0, L.errs.join('|'));
  // both say yes
  await reload(K); await K.waitForSelector('[data-seek] [data-invite]', { timeout: 8000 });
  check('the child sees the invite: the team, the leader\'s first name, «أقبل» and «أعتذر»', /الشروق/.test(await K.locator('[data-invite]').innerText()) && /القائد: قائد/.test(await K.locator('[data-invite]').innerText()));
  await K.locator('[data-seek] [data-fk^="seek-yes-"]').click();
  await K.waitForFunction(() => /تنتظر الدعوة موافقة ولي أمرك/.test(document.querySelector('[data-seek]').innerText), null, { timeout: 6000 });
  check('the child says yes: waiting for the parent; not on the roster yet', !fake.members.some(m => m.user_id === kid.id));
  await reload(PA); await PA.waitForSelector('[data-gkid] [data-invite]', { timeout: 8000 });
  await PA.locator('[data-gkid] [data-fk^="gseek-yes-"]').click();
  await PA.waitForFunction(() => /قُبلت/.test(document.querySelector('[data-gkid]').innerText), null, { timeout: 6000 });
  check('the parent says yes: the child joins the team; the leader is told', fake.members.some(m => m.user_id === kid.id && m.team_id === TS.id) && fake.notes.some(n => n.kind === 'invite_answer' && n.data.accepted));
  check('member and parent consoles clean (pool)', K.errs.length === 0 && PA.errs.length === 0, K.errs.concat(PA.errs).join('|'));
  await close(K); await close(PA); await close(L);
  // an approved team: look only; a draft team: no pool
  const LA = await open(fake, { label: 'seek-approved' });
  await settle(LA); await signInOk(LA, 'lap@t.test');
  await LA.waitForSelector('[data-pool]:not([hidden])', { timeout: 8000 });
  check('an approved team\'s leader sees the pool, with «قائمته مقفلة» and no invite button', /قائمته مقفلة/.test(await LA.locator('[data-pool]').innerText()) && !(await LA.locator('[data-pool] [data-fk^="pool-inv-"]').count()));
  await close(LA);
  const LD = await open(fake, { label: 'seek-draft' });
  await settle(LD); await signInOk(LD, 'ldr@t.test');
  await LD.waitForSelector('[data-next]', { timeout: 8000 }); await sleep(500);
  check('a draft team\'s leader has no pool (not yet seen by the admin)', !(await LD.locator('[data-pool]:not([hidden])').count()) && await LD.locator('[data-nav-li=players]').isHidden());
  await close(LD);
  // the admin
  const A = await open(fake, { label: 'seek-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-people').click();
  await A.waitForSelector('[data-transfers]:not([hidden])', { timeout: 8000 });
  check('the admin: counts of seekers and invites', /انضموا عبر دعوة/.test(await A.locator('[data-transfers]').innerText()) && /1 انضموا/.test(await A.locator('[data-transfers]').innerText()));
  await A.locator('[data-fk=transfers]').check();
  await A.waitForFunction(() => document.querySelector('[data-fk=transfers]') && document.querySelector('[data-fk=transfers]').checked, null, { timeout: 4000 });
  check('«فتح الانتقالات» opens transfers', fake.transfers === true);
  check('admin console clean (transfers)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
}

/* ================================================================ match day */
section('match day: «يوم المباراة» for the team, «مباريات اليوم» for the admin and on the board');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'lm@t.test', name: 'قائد الموج', role: 'leader' });
  fake.addUser({ email: 'lq@t.test', name: 'قائد القمر', role: 'leader' });
  const mk = n => Array.from({ length: 4 }, (_, i) => ({ name: `${n} ${i + 1}`, age: 13, consent: 'received' }));
  const TM = fake.seedTeam({ leaderEmail: 'lm@t.test', name: 'الموج', status: 'approved', members: mk('لاعب الموج') });
  const TQ = fake.seedTeam({ leaderEmail: 'lq@t.test', name: 'القمر', status: 'approved', members: mk('لاعب القمر') });
  const others = Array.from({ length: 10 }, (_, i) => ({ id: 'md' + i, name: 'فريق ' + (i + 1) }));
  let st = YT.setTeams(YT.emptyState(), [{ id: TM.id, name: 'الموج' }, { id: TQ.id, name: 'القمر' }, ...others]);
  st = YT.drawGroups(st, () => 0.5);
  const gM = st.groups.find(x => x.includes(TM.id));
  const opp = gM.find(x => x !== TM.id && x !== TQ.id);
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const later = new Date(d.getTime() + 2 * 3600e3 + 20 * 60e3);
  const kick = later.getDate() === d.getDate() ? `${pad(later.getHours())}:${pad(later.getMinutes())}` : '23:59';
  st = YT.setSchedule(st, TM.id, opp, { date: today, time: kick });
  const gO = st.groups.find(x => !x.includes(TM.id) && !x.includes(TQ.id));
  st = YT.setSchedule(st, gO[0], gO[1], { date: today, time: '10:00' });
  fake.setTournament(st);
  const oppName = others.find(o => o.id === opp).name;
  fake.events.push({ id: fake.uid(), competition: 'football', kind: 'match', title: 'الموج ضد ' + oppName, starts_at: later.toISOString(), place: 'ملعب المدينة', team_ids: [TM.id], category: null, status: 'scheduled', note: null });
  const L = await open(fake, { label: 'mday-leader', mobile: true });
  await settle(L); await signInOk(L, 'lm@t.test');
  await L.waitForSelector('[data-matchday]:not([hidden])', { timeout: 8000 });
  let md = await L.locator('[data-matchday]').innerText();
  check('before kick-off: «اليوم مباراتكم», the opponent, the time and the place', /اليوم مباراتكم/.test(md) && md.includes(oppName) && md.includes('الموج') && (md.includes('الساعة ' + kick)) && /ملعب المدينة/.test(md));
  check('…a countdown («تبدأ بعد …»)', /تبدأ بعد/.test(md) || kick === '23:59');
  check('…the leader\'s reminders (arrive 20 minutes early, attendance)', /قبل الموعد بعشرين دقيقة/.test(md) && /سجّله في «المباريات والمواعيد»/.test(md));
  check('the card comes right after the welcome card in «نظرة عامة»', await L.evaluate(() => { const k = [...document.querySelector('#sec-home .a-grid').children]; return k[0].hasAttribute('data-hero') && k[1].hasAttribute('data-matchday'); }));
  check('…with links to the board and the big screen', (await L.locator('[data-matchday] a[href="tournament.html"]').count()) === 1 && (await L.locator('[data-matchday] a[href="tournament.html?screen=1"]').count()) === 1);
  await L.locator('[data-matchday] [data-fk=mday-go]').click();
  check('«الحضور والمواعيد» goes to the matches section', await L.evaluate(() => !!document.activeElement.closest('#sec-matches')));
  const key = YT.pairKey(TM.id, opp);
  fake.live.push({ comp: 'football', match_key: key, a: opp, b: TM.id, sa: 1, sb: 2, status: 'live', started_at: new Date(Date.now() - 22.5 * 60e3).toISOString(), updated_at: new Date().toISOString() });
  await reload(L); await L.waitForSelector('[data-matchday].is-live', { timeout: 8000 });
  md = await L.locator('[data-matchday]').innerText();
  check('during the match: «جارية الآن · الدقيقة 23», the live score from the team\'s side', /جارية الآن · الدقيقة 2[34]/.test(md) && (await L.locator('.a-mday-s').getAttribute('aria-label')) === 'النتيجة 2 مقابل 1');
  check('no countdown and no reminders once it started', !/تبدأ بعد|بعشرين دقيقة/.test(md));
  fake.live[0].status = 'final';
  await reload(L); await L.waitForSelector('[data-matchday].is-wait', { timeout: 8000 });
  check('after the whistle: «بانتظار اعتماد الإدارة», not counted yet', /بانتظار اعتماد الإدارة/.test(await L.locator('[data-matchday]').innerText()));
  check('phone width: no sideways scroll with the card', (await overflow(L)) <= 0);
  check('leader console clean (match day)', L.errs.length === 0, L.errs.join('|'));
  await close(L);
  const Q = await open(fake, { label: 'mday-other' });
  await settle(Q); await signInOk(Q, 'lq@t.test');
  await Q.waitForSelector('[data-next]', { timeout: 8000 });
  await sleep(600);
  check('a team with no match today: no match-day card', await Q.locator('[data-matchday]').isHidden());
  await close(Q);
  const A = await open(fake, { label: 'mday-admin' });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.locator('#at-results').click();
  await A.waitForSelector('[data-today]:not([hidden])', { timeout: 8000 });
  const td = await A.locator('[data-today]').innerText();
  check('admin «النتائج»: «مباريات اليوم (2)», earliest first, the live one marked', /مباريات اليوم \(2\)/.test(td) && (await A.locator('[data-today] .a-today-i').first().innerText()).includes(kick < '10:00' ? kick : '10:00') && /بانتظار الاعتماد/.test(td));
  check('admin console clean (match day)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
  const B = await open(fake, { path: 'tournament.html', label: 'mday-board' });
  await B.waitForSelector('[data-today]', { timeout: 8000 });
  const bt = await B.locator('[data-today]').innerText();
  check('the public board: «اليوم يوم مباريات (2)» with the times', /اليوم يوم مباريات \(2\)/.test(bt) && bt.includes('10:00') && bt.includes(kick));
  await B.goto(`${ORIGIN}/tournament.html?screen=1`);
  await B.waitForSelector('[data-screen]', { timeout: 8000 });
  check('the big screen lists «مباريات اليوم» instead of the next matches', /مباريات اليوم/.test(await B.locator('[data-screen]').innerText()) && (await B.locator('[data-screen-today] li').count()) === 2);
  await close(B);
}

/* ================================================================ the phone dashboard: bottom bar, «المزيد», «خطوتك التالية» */
section('phone notifications: one switch per phone in «تخصيص» ← «التنبيهات»; a child needs a parent\'s consent');
{
  // The browser's push machinery is stubbed (the real one needs a push service): a registration whose pushManager
  // hands out a subscription with real-looking keys, and Notification.requestPermission answering as told.
  const stub = ({ perm = 'granted', noPush = false } = {}) => {
    window.__pushCalls = [];
    if (noPush) { try { delete window.PushManager; } catch (e) { /* */ } Object.defineProperty(window, 'PushManager', { value: undefined, configurable: true }); delete window.PushManager; return; }
    let cur = null;
    const mk = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/phone-' + Math.random().toString(36).slice(2), toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B' + 'q'.repeat(86), auth: 'a'.repeat(22) } }; },
      unsubscribe: async () => { cur = null; window.__pushCalls.push('unsub'); return true; } });
    const reg = { pushManager: { getSubscription: async () => cur, subscribe: async o => { window.__pushCalls.push('sub:' + (o.userVisibleOnly ? 'visible' : 'silent') + ':' + o.applicationServerKey.length); cur = mk(); return cur; } } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg), controller: null, register: async () => reg, addEventListener() {} } });
    const N = { permission: 'default', requestPermission: async () => { N.permission = perm; window.__pushCalls.push('ask'); return perm; } };
    Object.defineProperty(window, 'Notification', { configurable: true, value: N });
  };
  const openPush = async (fake, email, opts, label) => {
    const X = await open(fake, { label, mobile: true });
    await X.addInitScript(stub, opts || {});
    await X.reload();
    await settle(X); await signInOk(X, email);
    await X.waitForSelector('.a-dock [data-dock=more]', { timeout: 8000 });
    await X.locator('.a-dock [data-dock=more]').click();
    await X.locator('[data-more] [data-fk=more-cust]').click();
    await X.waitForSelector('[data-settings]:not([hidden]) [data-push]');
    await X.waitForFunction(() => document.querySelector('[data-push]').children.length > 0, null, { timeout: 6000 });
    return X;
  };
  const fake = new Fake();
  fake.addUser({ email: 'pl@t.test', name: 'قائد التنبيهات', role: 'leader' });
  const kidA = fake.addUser({ email: 'pk@t.test', name: 'عضو بلا موافقة', role: 'member' });
  const kidB = fake.addUser({ email: 'pk2@t.test', name: 'عضو بموافقة', role: 'member' });
  const T = fake.seedTeam({ leaderEmail: 'pl@t.test', name: 'التنبيهات', status: 'approved', members: [{ name: 'عضو بلا موافقة' }, { name: 'عضو بموافقة', consent: 'received' }] });
  const rows = fake.members.filter(m => m.team_id === T.id && !m.is_leader);
  rows[0].user_id = kidA.id; rows[1].user_id = kidB.id;
  const lid = fake.profileByEmail('pl@t.test').id;
  // the leader turns it on, then off
  const L = await openPush(fake, 'pl@t.test', {}, 'push-leader');
  const box = () => L.locator('[data-push]').innerText();
  check('«تنبيهات على هذا الهاتف» sits in «التنبيهات», off at first', /تنبيهات على هذا الهاتف/.test(await box()) && !(await L.locator('[data-fk="cpush"]').isChecked()));
  check('the switch is a labelled switch (role=switch, 44px row)', (await L.locator('[data-fk="cpush"]').getAttribute('role')) === 'switch' && (await L.locator('[data-push] label.a-check').boundingBox()).height >= 44);
  await L.locator('[data-fk="cpush"]').click();
  await L.waitForFunction(() => /حتى والموقع مغلق/.test(document.querySelector('[data-push]').innerText) && document.querySelector('[data-fk="cpush"]').checked, null, { timeout: 6000 });
  const calls = await L.evaluate(() => window.__pushCalls);
  check('on: asks permission, subscribes with the public key (visible notifications only), and saves this phone', calls.join() === 'ask,sub:visible:65' && fake.pushSubs.length === 1 && fake.pushSubs[0].user_id === lid && /^https:\/\/fcm\.googleapis\.com\//.test(fake.pushSubs[0].endpoint), calls.join());
  await L.locator('[data-fk="cpush"]').click();
  await L.waitForFunction(() => /أُوقفت/.test(document.querySelector('[data-push]').innerText), null, { timeout: 6000 });
  check('off: the phone is removed on the server and in the browser', fake.pushSubs.length === 0 && (await L.evaluate(() => window.__pushCalls)).includes('unsub'));
  check('leader console clean (push)', L.errs.length === 0, L.errs.join('|'));
  await close(L);
  // permission refused in the browser
  const D = await openPush(fake, 'pl@t.test', { perm: 'denied' }, 'push-denied');
  await D.locator('[data-fk="cpush"]').click();
  await D.waitForFunction(() => /ممنوعة في إعدادات المتصفح/.test(document.querySelector('[data-push]').innerText), null, { timeout: 6000 });
  check('a refused permission says where to allow it, and nothing is saved', fake.pushSubs.length === 0 && !(await D.locator('[data-fk="cpush"]').isChecked()));
  await close(D);
  // a member without a parent's consent: no switch, the reason
  const K = await openPush(fake, 'pk@t.test', {}, 'push-kid');
  check('a member without consent sees why, and no switch', /موافقة ولي أمرك/.test(await K.locator('[data-push]').innerText()) && (await K.locator('[data-fk="cpush"]').count()) === 0);
  await close(K);
  // a member whose paper consent was received can turn it on
  const K2 = await openPush(fake, 'pk2@t.test', {}, 'push-kid2');
  await K2.locator('[data-fk="cpush"]').click();
  await K2.waitForFunction(() => document.querySelector('[data-fk="cpush"]') && document.querySelector('[data-fk="cpush"]').checked && /حتى والموقع مغلق/.test(document.querySelector('[data-push]').innerText), null, { timeout: 6000 });
  check('a member with the consent received turns it on', fake.pushSubs.length === 1 && fake.pushSubs[0].user_id === kidB.id);
  await close(K2);
  // a browser without Web Push (Safari on iPhone before installing)
  const I = await openPush(fake, 'pl@t.test', { noPush: true }, 'push-ios');
  check('without Web Push: a plain explanation instead of a switch', (await I.locator('[data-fk="cpush"]').count()) === 0 && /(ثبّت ينابيع على الشاشة الرئيسية|لا يدعم التنبيهات)/.test(await I.locator('[data-push]').innerText()));
  await close(I);
  // not switched on on the site yet
  fake.pushReady = false;
  const R = await openPush(fake, 'pl@t.test', {}, 'push-notready');
  check('before the site is set up: «لم تُفعَّل تنبيهات الهاتف على الموقع بعد»', /لم تُفعَّل تنبيهات الهاتف/.test(await R.locator('[data-push]').innerText()) && (await R.locator('[data-fk="cpush"]').count()) === 0);
  await close(R);
}

section('the phone dashboard: a bottom bar like the apps, «المزيد», and «خطوتك التالية» for each role');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  const lx = fake.addUser({ email: 'lx@t.test', name: 'قائد النجوم', role: 'leader' });
  const kid = (n, c) => ({ name: n, age: 14, consent: c });
  const T = fake.seedTeam({ leaderEmail: 'lx@t.test', name: 'النجوم', status: 'draft', members: [kid('أنس بكر'), kid('سالم علي'), kid('يوسف علي')] });
  fake.notify([lx.id], 'team_status', { status: 'draft', team_name: 'النجوم' });
  const P = await open(fake, { label: 'dock-leader', mobile: true });
  await settle(P); await signInOk(P, 'lx@t.test');
  await P.waitForSelector('.a-dock [data-dock=home]', { timeout: 8000 });
  const vis = sel => P.locator(sel).first().isVisible();
  check('phone: the side menu and the header buttons leave, a bottom bar takes their place', !(await vis('.a-side')) && !(await vis('.a-head-b')) && await vis('.a-dock'));
  const dock = await P.locator('.a-dock .a-dock-b:visible').allInnerTexts();
  check('the bar: الرئيسية · الأخبار · الفريق · التنبيهات · المزيد', dock.map(t => t.replace(/\d+/g, '').trim()).join('|') === 'الرئيسية|الأخبار|الفريق|التنبيهات|المزيد', dock.join('|'));
  const sizes = await P.locator('.a-dock .a-dock-b:visible').evaluateAll(bs => bs.map(b => b.getBoundingClientRect()).map(r => [Math.round(r.width), Math.round(r.height)]));
  check('every button is at least 44px each way (thumb size)', sizes.every(([w, hh]) => w >= 44 && hh >= 44), JSON.stringify(sizes));
  check('«الرئيسية» is marked as the current place', (await P.locator('[data-dock=home]').getAttribute('aria-current')) === 'page');
  check('the unread count shows on «التنبيهات»', /1/.test(await P.locator('[data-dock=bell] .a-dock-n').innerText()) && /1 غير مقروء/.test(await P.locator('[data-dock=bell]').getAttribute('aria-label')));
  check('the bar stays at the bottom of the screen', await P.evaluate(() => { const r = document.querySelector('.a-dock').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2; }));
  check('390px: no sideways scroll', (await overflow(P)) <= 0);
  // «خطوتك التالية» walks the leader through the registration
  let nx = await P.locator('[data-next]').innerText();
  check('leader, 4 of 5: «أضف 1 عضوًا إلى فريقك», step 1 of 4 is current', /أضف 1 عضوًا إلى فريقك/.test(nx) && /0 من 4/.test(nx) && (await P.locator('[data-next] li[aria-current=step]').innerText()).includes('الأعضاء'));
  check('the card comes right after the welcome card in «نظرة عامة» (the match-day card shows only on a match day)', await P.evaluate(() => { const k = [...document.querySelector('#sec-home .a-grid').children].filter(c => !c.hidden); return k[0].hasAttribute('data-hero') && k[1].hasAttribute('data-next'); }));
  await P.locator('[data-next] [data-fk=next-go]').click();
  check('«افتح قائمة الفريق» takes the keyboard to the team list', await P.evaluate(() => !!document.activeElement.closest('section') && /أعضاء|القائمة/.test(document.activeElement.textContent)));
  fake.members.push({ id: fake.uid(), team_id: T.id, full_name: 'عمر حسن', age: 14, guardian_name: 'ولي', guardian_phone: '0912345678', is_leader: false, user_id: null, consent_status: 'pending', consent_at: null, created_at: fake.now() });
  await reload(P); await P.waitForSelector('[data-next]', { timeout: 8000 });
  nx = await P.locator('[data-next]').innerText();
  check('5 members: «أرسل الفريق للاعتماد», 1 of 4 done', /أرسل الفريق للاعتماد/.test(nx) && /1 من 4/.test(nx));
  await P.locator('[data-next] [data-fk=next-go]').click();
  check('«إلى زر الإرسال» puts the keyboard on «أرسل الفريق للاعتماد»', (await P.evaluate(() => document.activeElement.dataset.fk)) === 'submit');
  T.status = 'returned'; T.admin_note = 'صحّح اسم الحي';
  await reload(P); await P.waitForSelector('[data-next]', { timeout: 8000 });
  nx = await P.locator('[data-next]').innerText();
  check('returned: «عدّل ما طلبته الإدارة ثم أعد الإرسال» with the admin\'s note', /عدّل ما طلبته الإدارة/.test(nx) && /صحّح اسم الحي/.test(nx));
  T.status = 'submitted';
  await reload(P); await P.waitForSelector('[data-next]', { timeout: 8000 });
  nx = await P.locator('[data-next]').innerText();
  check('sent, consents missing (the leader\'s age is unknown, so counted too): «اجمع موافقات الأهل: 0 من 5» and the printable form', /اجمع موافقات الأهل: 0 من 5/.test(nx) && (await P.locator('[data-next] a[href="register.html#c-consent"]').count()) === 1);
  fake.members.filter(m => m.team_id === T.id).forEach(m => { m.consent_status = 'received'; });
  T.status = 'approved';
  await reload(P); await P.waitForSelector('[data-next].is-done', { timeout: 8000 });
  nx = await P.locator('[data-next]').innerText();
  check('approved and complete: «كل شيء في مكانه», 4 of 4, a link to the matches', /كل شيء في مكانه/.test(nx) && /4 من 4/.test(nx) && /فريقك معتمد ومكتمل/.test(nx));
  check('the card never shows children\'s names', !/أنس|سالم|يوسف|عمر/.test(nx));
  // the bar moves between sections
  await P.locator('[data-dock=team]').click();
  await P.waitForFunction(() => document.querySelector('[data-dock=team]').getAttribute('aria-current') === 'page', null, { timeout: 4000 }).catch(() => {});
  check('«الفريق» scrolls to the team section and lights up', (await P.locator('[data-dock=team]').getAttribute('aria-current')) === 'page' && await P.evaluate(() => { const r = document.getElementById('sec-team').getBoundingClientRect(); return r.top < 200 && r.bottom > 0; }));
  await P.locator('[data-dock=bell]').click();
  check('«التنبيهات» opens the notifications', await P.locator('.a-inbox').isVisible() && (await P.locator('[data-dock=bell]').getAttribute('aria-expanded')) === 'true');
  // «المزيد»
  await P.locator('[data-dock=more]').click();
  const sheet = P.locator('[data-more]');
  check('«المزيد» opens a dialog with the name and role', await sheet.isVisible() && (await sheet.getAttribute('aria-modal')) === 'true' && /قائد النجوم/.test(await sheet.innerText()) && /قائد الفريق/.test(await sheet.innerText()));
  const secs = await sheet.locator('.a-more-s').allInnerTexts();
  check('…every section of the dashboard', secs.length === 7 && ['نظرة عامة', 'الأخبار', 'المباريات والمواعيد', 'الفريق', 'المشاريع والمبادرات', 'لاعبون يبحثون عن فريق', 'غرفة القادة'].every(s => secs.some(x => x.includes(s))), secs.join('|'));
  check('…and the account: تخصيص لوحتي, تغيير كلمة المرور, الموقع العام, تسجيل الخروج', ['تخصيص لوحتي', 'تغيير كلمة المرور', 'الموقع العام', 'تسجيل الخروج'].every(s => sheet.locator('.a-more-a', { hasText: s }).count().then(n => n === 1)) && (await sheet.locator('.a-more-a').count()) === 4);
  check('…no «ثبّت» while the phone offers no install', !(await sheet.locator('[data-fk=more-install]').count()));
  check('focus is inside the dialog', await P.evaluate(() => !!document.activeElement.closest('[data-more]')));
  await P.keyboard.press('Escape');
  check('Esc closes it and focus returns to «المزيد»', !(await P.locator('[data-more]').count()) && (await P.evaluate(() => document.activeElement.dataset.dock)) === 'more');
  await P.locator('[data-dock=more]').click();
  await P.locator('[data-more] [data-fk=more-room]').click();
  check('a section from «المزيد» (غرفة القادة): the sheet closes, the room is on screen with the keyboard on its title', !(await P.locator('[data-more]').count()) && await P.evaluate(() => { const r = document.getElementById('sec-room').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && !!document.activeElement.closest('#sec-room'); }));
  await P.locator('[data-dock=more]').click();
  await P.locator('[data-more] [data-fk=more-cust]').click();
  check('«تخصيص لوحتي» opens the settings', await P.locator('[data-settings]').isVisible());
  await P.locator('[data-settings] .a-link', { hasText: 'إغلاق' }).first().click();
  check('closing the settings returns focus to «المزيد» (the header button is hidden)', (await P.evaluate(() => document.activeElement.dataset.dock)) === 'more');
  await P.locator('[data-dock=more]').click();
  await P.locator('[data-more] [data-fk=more-pw]').click();
  check('«تغيير كلمة المرور» opens the form, ready to type', await P.locator('.a-pwbox').isVisible() && (await P.evaluate(() => document.activeElement.getAttribute('autocomplete'))) === 'new-password');
  await P.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__p = 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await P.locator('[data-dock=more]').click();
  await P.locator('[data-more] [data-fk=more-install]').click();
  check('when the phone offers it, «ثبّت ينابيع على هاتفك» in «المزيد» opens the install prompt', (await P.evaluate(() => window.__p)) === 1);
  check('leader console clean (phone dashboard)', P.errs.length === 0, P.errs.join('|'));
  // the same screen on a computer keeps the side menu
  await P.setViewportSize({ width: 1280, height: 900 });
  check('on a computer: the side menu and header buttons, no bottom bar', await vis('.a-side') && await vis('.a-head-b') && !(await vis('.a-dock')));
  await close(P);

  // member and parent
  const mx = fake.addUser({ email: 'mx@t.test', name: 'عضو تجربة', role: 'member' });
  const m0 = fake.members.find(m => m.team_id === T.id && !m.is_leader);
  m0.user_id = mx.id; m0.consent_status = 'pending';
  const M = await open(fake, { label: 'dock-member', mobile: true });
  await settle(M); await signInOk(M, 'mx@t.test');
  await M.waitForSelector('[data-next]', { timeout: 8000 });
  check('member without consent: «موافقة ولي أمرك لم تصل بعد» and the form link', /موافقة ولي أمرك لم تصل بعد/.test(await M.locator('[data-next]').innerText()) && (await M.locator('[data-next] a[href="register.html#c-consent"]').count()) === 1);
  check('member bar: الرئيسية · الأخبار · الفريق', (await M.locator('.a-dock .a-dock-b[data-dock]:not([data-dock=bell]):not([data-dock=more])').allInnerTexts()).join('|') === 'الرئيسية|الأخبار|الفريق');
  await close(M);
  fake.addUser({ email: 'px@t.test', name: 'ولي تجربة', role: 'parent' });
  const PA = await open(fake, { label: 'dock-parent', mobile: true });
  await settle(PA); await signInOk(PA, 'px@t.test');
  await PA.waitForSelector('[data-next]', { timeout: 8000 });
  check('parent with no child linked: «اربط ابنك أو ابنتك»', /اربط ابنك أو ابنتك/.test(await PA.locator('[data-next]').innerText()));
  await PA.locator('[data-next] [data-fk=next-go]').click();
  check('«اربط الآن» goes to the link form', await PA.evaluate(() => { const r = document.getElementById('sec-link').getBoundingClientRect(); return r.top < 300 && r.bottom > 0; }));
  check('member and parent consoles clean', PA.errs.length === 0, PA.errs.join('|'));
  await close(PA);

  // the admin: tabs in the bar, the rest in «المزيد»
  const A = await open(fake, { label: 'dock-admin', mobile: true });
  await settle(A); await signInOk(A, 'boss@t.test');
  await A.waitForSelector('.a-dock [data-dock=teams]', { timeout: 8000 });
  check('admin bar: الرئيسية · الفرق · الأخبار · … · المزيد', (await A.locator('.a-dock .a-dock-b[data-dock]:not([data-dock=bell]):not([data-dock=more])').allInnerTexts()).join('|') === 'الرئيسية|الفرق|الأخبار');
  await A.locator('[data-dock=more]').click();
  check('«المزيد» lists all 12 admin tabs', (await A.locator('[data-more] .a-more-s').count()) === 12);
  await A.locator('[data-more] [data-fk=more-people]').click();
  await A.waitForSelector('#ap-people', { timeout: 6000 }).catch(() => {});
  check('a tab from «المزيد» (الأشخاص) opens, and «المزيد» lights up', (await A.locator('#at-people').getAttribute('aria-selected')) === 'true' && await A.locator('[data-dock=more]').evaluate(b => b.classList.contains('on')));
  check('admin console clean (phone bar)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
}

section('dashboard 2: the welcome card, the team\'s mark and logo, who leads the team, badges, the team\'s run, the pulse, the admin\'s home, motion');
{
  const fake = new Fake();
  fake.addUser({ email: 'boss@t.test', name: 'محمود المشرف', role: 'member' }); fake.setAdmin('boss@t.test');
  fake.addUser({ email: 'lm@t.test', name: 'أحمد قائد الموج', role: 'leader' });
  fake.addUser({ email: 'lq@t.test', name: 'قائد القمر', role: 'leader' });
  const kid = fake.addUser({ email: 'km@t.test', name: 'سامي لاعب الموج', role: 'member' });
  const par = fake.addUser({ email: 'pm@t.test', name: 'ولي أمر كريم', role: 'parent' });
  const TM = fake.seedTeam({ leaderEmail: 'lm@t.test', name: 'الموج', status: 'approved', members: [{ name: 'سامي لاعب الموج', age: 13, consent: 'received' }, { name: 'كريم حسن العلي', age: 13, consent: 'received' },
    { name: 'باسل عمر', age: 13, consent: 'received' }, { name: 'نادر سعيد', age: 13, consent: 'received' }] });
  const TQ = fake.seedTeam({ leaderEmail: 'lq@t.test', name: 'القمر', status: 'submitted', members: Array.from({ length: 4 }, (_, i) => ({ name: `لاعب القمر ${i + 1}`, age: 13 })) });
  const mOf = n => fake.members.find(m => m.team_id === TM.id && m.full_name === n);
  mOf('سامي لاعب الموج').user_id = kid.id;
  fake.links.push({ parent_id: par.id, member_id: mOf('كريم حسن العلي').id, created_at: fake.now() });
  mOf('كريم حسن العلي').roles = ['assistant'];
  fake.tstyle.set(TM.id, { team_id: TM.id, color: 'purple', badge: 'bolt' });
  const others = Array.from({ length: 10 }, (_, i) => ({ id: 'd2' + i, name: 'فريق ' + (i + 1) }));
  let st = YT.setTeams(YT.emptyState(), [{ id: TM.id, name: 'الموج' }, { id: TQ.id, name: 'القمر' }, ...others]);
  st = YT.drawGroups(st, () => 0.5);
  const opps = st.groups.find(x => x.includes(TM.id)).filter(x => x !== TM.id);
  const nm = id => (id === TQ.id ? 'القمر' : (others.find(o => o.id === id) || {}).name);
  st = YT.setResult(st, { a: TM.id, b: opps[0], sa: 3, sb: 0, date: '2026-11-10', time: '16:00' });
  st = YT.setResult(st, { a: TM.id, b: opps[1], sa: 1, sb: 1, date: '2026-11-12', time: '16:00' });
  const dd = new Date(Date.now() + 3 * 86400e3), pad = n => String(n).padStart(2, '0');
  st = YT.setSchedule(st, TM.id, opps[2], { date: `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`, time: '17:30' });
  fake.setTournament(st);
  const dash = p => p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-dash') || '{}'));

  /* ---- the leader, on a phone ---- */
  const L = await open(fake, { label: 'd2-leader', mobile: true });
  await settle(L); await signInOk(L, 'lm@t.test');
  await L.waitForSelector('[data-hero] [data-hero-next]:not([hidden])', { timeout: 8000 });
  await L.waitForSelector('[data-badges]:not([hidden])'); await L.waitForSelector('[data-run]:not([hidden])'); await L.waitForSelector('[data-pulse]:not([hidden])'); await L.waitForSelector('[data-staff]:not([hidden])');
  const heroT = await L.locator('[data-hero]').innerText();
  check('the welcome card opens «نظرة عامة»: a greeting by first name and the team', /(صباح|مساء) الخير يا أحمد/.test(heroT) && /قائد فريق الموج/.test(heroT)
    && await L.evaluate(() => Array.from(document.querySelectorAll('#sec-home .a-grid > *')).find(c => !c.hidden && c.offsetParent).matches('[data-hero]')), heroT.slice(0, 80));
  check('it carries the team\'s mark on the team\'s color (purple, ⚡)', await L.locator('[data-hero] .a-tm').evaluate(e => e.style.getPropertyValue('--tc') === '#5b3fb5' && /⚡/.test(e.textContent)));
  check('the next match: the opponent, a countdown (days, hours, minutes; no seconds with reduced motion) and the date', new RegExp('المباراة القادمة ضد ' + nm(opps[2])).test(heroT) && (await L.locator('[data-hero] .a-cd .fx-cd-c').count()) === 3
    && /^0[23]$/.test(await L.locator('[data-hero] .a-cd .fx-cd-c b').first().innerText()) && /17:30/.test(heroT), heroT);
  await L.locator('[data-fk="qa-code"]').click();
  check('a shortcut takes the leader to its card («رمز الانضمام»)', await L.evaluate(() => !!document.activeElement.closest('.a-codecard')));
  check('the team card shows the mark too', (await L.locator('.a-teamcard .a-team-id .a-tm').count()) === 1);
  const staffT = () => L.locator('[data-staff]').innerText();
  check('«قيادة الفريق»: the leader and the assistant by name', /قائد الفريق\s*أحمد قائد الموج/.test(await staffT()) && /مساعد القائد\s*كريم حسن العلي/.test(await staffT()), await staffT());
  await L.locator('[data-fk="staff-sel"]').selectOption({ label: 'باسل عمر' });
  await L.locator('[data-fk="staff-save"]').click();
  await L.waitForFunction(() => /مساعد القائد\s*باسل عمر/.test(document.querySelector('[data-staff]').innerText), null, { timeout: 6000 });
  check('the leader names another assistant: saved, one assistant a team, the leader is not offered', JSON.stringify(mOf('باسل عمر').roles) === '["assistant"]' && !(mOf('كريم حسن العلي').roles || []).includes('assistant')
    && !(await L.locator('[data-fk="staff-sel"] option').allInnerTexts()).includes('أحمد قائد الموج'));
  const bd = L.locator('[data-badges]');
  check('«إنجازات الفريق»: earned badges are marked, the others say how (with progress)', (await bd.locator('.a-bdg.on[data-badge=approved]').count()) === 1 && (await bd.locator('.a-bdg.on[data-badge=win1]').count()) === 1
    && (await bd.locator('.a-bdg.on[data-badge=clean]').count()) === 1 && /\(1 من 3\)/.test(await bd.locator('[data-badge=win3]').innerText()) && /\(4 من 5\)/.test(await bd.locator('[data-badge=consents]').innerText())
    && new RegExp(`${await bd.locator('.a-bdg.on').count()} من ${await bd.locator('.a-bdg').count()}`).test(await bd.locator('.a-bdgs-n').innerText()), await bd.innerText());
  check('badges belong to the team: no member\'s name in them', !/سامي|كريم|باسل|نادر/.test(await bd.innerText()));
  const d0 = await dash(L);
  check('this device remembers what was celebrated (badge keys and a flag only)', d0.b && d0.b[TM.id].includes('approved') && d0.c && d0.c['ap-' + TM.id] === 1 && !/token|@|أحمد/.test(JSON.stringify(d0)), JSON.stringify(d0));
  const run = L.locator('[data-run]');
  check('«مشوار الفريق»: played 2, 4 points, 4 for, 1 against', (await run.locator('.a-run-nums li').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join('|') === '2 لعب|4 نقاط|4 له|1 عليه', (await run.locator('.a-run-nums li').allInnerTexts()).join('|'));
  check('the last results as letters with words for screen readers, and a legend with numbers', (await run.locator('.a-run-chips li').count()) === 2 && /فوز ضد .* 3 – 0/.test(await run.locator('.a-run-chips').innerText()) && /تعادل ضد .* 1 – 1/.test(await run.locator('.a-run-chips').innerText())
    && /فوز 1/.test(await run.locator('.a-run-leg').innerText()) && /تعادل 1/.test(await run.locator('.a-run-leg').innerText()), JSON.stringify([await run.locator('.a-run-chips').innerText(), await run.locator('.a-run-leg').innerText(), await run.locator('.a-run-chips li').first().evaluate(e => e.textContent)]));
  check('the group table: four teams, the own row lit', (await run.locator('.a-run-tb tbody tr').count()) === 4 && /الموج/.test(await run.locator('.a-run-tb tr.me').innerText()) && (await run.locator('.a-run-tb tr.me').getAttribute('aria-current')) === 'true');
  const pl = L.locator('[data-pulse]');
  check('«نبض المسابقة»: matches played of the total, the stage, and a strip of results and next matches', /2 من \d+ مباراة لُعبت · دور المجموعات/.test((await pl.innerText()).replace(/\s+/g, ' ')) && (await pl.locator('.a-tick-l').first().locator('li.r').count()) === 2
    && (await pl.locator('.a-tick-l').first().locator('li.n').count()) >= 1 && /3 – 0/.test(await pl.locator('.a-tick-l').first().innerText()), (await pl.innerText()).slice(0, 160));
  check('the strip is named, reachable by keyboard, and its repeat is hidden from screen readers', (await pl.locator('.a-tick').getAttribute('role')) === 'region' && (await pl.locator('.a-tick').getAttribute('tabindex')) === '0' && (await pl.locator('.a-tick-l[aria-hidden=true]').count()) === 1);
  check('tiles: a ring on «الأعضاء» (5 من 7), none on the group position', (await L.locator('[data-kpi="الأعضاء"] .a-kpi-r:not([hidden]) svg').count()) === 1 && (await L.locator('[data-kpi="ترتيب المجموعة"] .a-kpi-r:not([hidden])').count()) === 0);
  check('reduced motion: nothing waits hidden, no confetti', (await L.locator('.fx-rise').count()) === 0 && (await L.locator('.fx-confetti').count()) === 0);
  check('phone width: the new cards do not overflow', (await overflow(L)) <= 0);
  // the logo
  const png = Buffer.from(await L.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#5b3fb5'; g.fillRect(0, 0, 600, 600); g.fillStyle = '#fff'; g.beginPath(); g.arc(300, 300, 180, 0, 7); g.fill(); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  await L.locator('[data-team-logo]').scrollIntoViewIfNeeded();
  check('«هوية الفريق» has «شعار الفريق» with the rule (a drawing, no people)', /رسمة أو رمز للفريق، لا صور أشخاص/.test(await L.locator('[data-team-logo]').innerText()));
  await L.locator('[data-fk="tlogo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await L.waitForSelector('[data-hero] .a-tm.has-logo img', { timeout: 8000 });
  const lp = (fake.tstyle.get(TM.id) || {}).logo_path;
  const upl = fake.uploads[fake.uploads.length - 1];
  check('the leader uploads a logo: shrunk to a small JPEG in the team\'s folder, saved, and shown at once in the welcome card and the team card', !!lp && lp.startsWith(TM.id + '/') && fake.logos.has(lp) && upl.jpeg && upl.size < 60000
    && /yanabee-logos/.test(upl.path) && (await L.locator('.a-teamcard .a-tm.has-logo img').count()) === 1 && fake.tstyle.get(TM.id).color === 'purple', JSON.stringify(upl));
  check('leader console clean (dashboard 2)', L.errs.length === 0, L.errs.join('|'));
  // a new badge is celebrated once
  await L.evaluate(id => { const v = JSON.parse(localStorage.getItem('yanabee-dash')); v.b[id] = v.b[id].filter(k => k !== 'win1'); localStorage.setItem('yanabee-dash', JSON.stringify(v)); }, TM.id);
  await L.reload(); await settle(L);
  await L.waitForSelector('[data-badges] .a-bdgs-new', { timeout: 8000 });
  check('a newly earned badge is announced («إنجاز جديد: أول فوز») and marked', /إنجاز جديد: أول فوز/.test(await L.locator('.a-bdgs-new').innerText()) && (await L.locator('.a-bdg.new[data-badge=win1]').count()) === 1 && /إنجاز جديد لفريقك/.test(await live(L)));
  await L.reload(); await settle(L);
  await L.waitForSelector('[data-badges]:not([hidden])');
  check('and only once', (await L.locator('[data-badges] .a-bdgs-new').count()) === 0);
  await close(L);

  /* ---- motion on ---- */
  const Mo = await open(fake, { label: 'd2-motion', mobile: true });
  await Mo.emulateMedia({ reducedMotion: 'no-preference' });
  await Mo.reload(); await settle(Mo);
  await Mo.evaluate(id => localStorage.setItem('yanabee-dash', JSON.stringify({ b: { [id]: ['approved'] }, c: {} })), TM.id);
  await signInOk(Mo, 'lm@t.test');
  await Mo.waitForSelector('[data-hero]');
  const conf = await Mo.waitForSelector('.fx-confetti', { timeout: 6000 }).then(() => true, () => false);
  check('with motion: confetti for the approval and the new badges, hidden from screen readers', conf && (await Mo.locator('.fx-confetti').first().getAttribute('aria-hidden')) === 'true');
  await sleep(1500);
  check('cards on screen have finished their entrance (nothing in view is left transparent)', await Mo.evaluate(() => Array.from(document.querySelectorAll('#sec-home .a-grid > *, .a-sec-h')).filter(e => { const r = e.getBoundingClientRect(); return !e.hidden && r.height > 0 && r.top < innerHeight * 0.9 && r.bottom > 0; }).every(e => getComputedStyle(e).opacity === '1')));
  check('cards further down wait for their entrance', (await Mo.locator('.fx-rise:not(.fx-in)').count()) > 0);
  await Mo.locator('[data-run]').scrollIntoViewIfNeeded();
  await sleep(1400);
  check('they appear when scrolled to, and the numbers end on the real value', await Mo.locator('[data-run]').evaluate(e => getComputedStyle(e).opacity === '1') && (await Mo.locator('[data-run] .a-run-nums li.pts b').innerText()) === '4'
    && (await Mo.locator('[data-kpi="الأعضاء"] .a-kpi-v').innerText()) === '5 من 7');
  check('the countdown ticks with seconds', (await Mo.locator('[data-hero] .a-cd .fx-cd-c').count()) === 4);
  await sleep(2200);
  check('the confetti removes itself', (await Mo.locator('.fx-confetti').count()) === 0);
  check('the bottom bar has its sliding line under the open section', await Mo.locator('.a-dock .a-dock-pill').evaluate(e => getComputedStyle(e).opacity === '1'));
  check('motion console clean', Mo.errs.length === 0, Mo.errs.join('|'));
  await close(Mo);

  /* ---- the member and the parent ---- */
  const K = await open(fake, { label: 'd2-member', mobile: true });
  await settle(K); await signInOk(K, 'km@t.test');
  await K.waitForSelector('[data-staff]:not([hidden])', { timeout: 8000 }); await K.waitForSelector('[data-badges]:not([hidden])');
  check('a member: greeting, «عضو في فريق الموج», the team\'s logo', /يا سامي/.test(await K.locator('[data-hero]').innerText()) && /عضو في فريق الموج/.test(await K.locator('[data-hero]').innerText()) && (await K.locator('[data-hero] .a-tm.has-logo').count()) === 1);
  check('a member sees who leads the team, read only', /قائد الفريق\s*أحمد قائد الموج/.test(await K.locator('[data-staff]').innerText()) && /مساعد القائد\s*باسل عمر/.test(await K.locator('[data-staff]').innerText()) && (await K.locator('[data-fk="staff-sel"]').count()) === 0);
  check('a member\'s badges leave out what only the leader knows (consents)', (await K.locator('[data-badge=consents]').count()) === 0 && (await K.locator('.a-bdg.on[data-badge=win1]').count()) === 1 && (await K.locator('[data-run]:not([hidden])').count()) === 1);
  check('member console clean (dashboard 2)', K.errs.length === 0, K.errs.join('|'));
  await close(K);
  const P = await open(fake, { label: 'd2-parent', mobile: true });
  await settle(P); await signInOk(P, 'pm@t.test');
  await P.waitForSelector('[data-staff]:not([hidden])', { timeout: 8000 });
  check('a parent sees the leader by name and the assistant by first name only', /قائد الفريق\s*أحمد قائد الموج/.test(await P.locator('[data-staff]').innerText()) && /مساعد القائد\s*باسل\s*$/m.test(await P.locator('[data-staff]').innerText()) && !/باسل عمر/.test(await text(P)), await P.locator('[data-staff]').innerText());
  check('the parent\'s welcome card names the parent, not the child', /يا ولي/.test(await P.locator('[data-hero]').innerText()) && !/كريم/.test(await P.locator('[data-hero]').innerText()));
  await close(P);

  /* ---- the admin's home ---- */
  const A = await open(fake, { label: 'd2-admin' });
  await settle(A); await signInOk(A, 'boss@t.test', undefined, { home: true });
  await A.waitForSelector('[data-admin-home] [data-wait-row="teams"]', { timeout: 8000 });
  check('the admin lands on «الرئيسية»: a greeting, and no status counters above it', (await A.locator('#at-home').getAttribute('aria-selected')) === 'true' && /يا محمود/.test(await A.locator('[data-hero]').innerText()) && (await A.locator('.a-counters').count()) === 0);
  check('«بانتظار قرارك»: one team waits, with a button that opens it', /1\s*فرق تنتظر الاعتماد/.test((await A.locator('[data-wait]').innerText()).replace(/\s+/g, ' ')) && (await A.locator('.a-wait-n').innerText()) === '1');
  const kp = async l => (await A.locator(`[data-admin-home] [data-kpi="${l}"] .a-kpi-v`).innerText());
  check('key numbers: approved teams of 12, members, consents, fees, accounts, matches played', (await kp('فرق معتمدة')) === '1 من 12' && (await kp('الأعضاء')) === '10' && (await kp('موافقات الأهل')) === '4 من 10' && (await kp('الرسوم')) === '0 من 2' && (await kp('الحسابات')) === '5' && /^2 من \d+$/.test(await kp('مباريات لُعبت')),
    [await kp('فرق معتمدة'), await kp('الأعضاء'), await kp('موافقات الأهل'), await kp('الرسوم'), await kp('الحسابات'), await kp('مباريات لُعبت')].join('|'));
  check('«حالة الفرق»: every status with its number (never color alone)', (await A.locator('[data-mix] .a-mix-b').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()).join('|') === 'مسودة 0|قيد المراجعة 1|مطلوب تعديل 0|معتمد 1|مرفوض 0', (await A.locator('[data-mix] .a-mix-b').allInnerTexts()).join('|'));
  const wallT = (await A.locator(`[data-wall-team="${TM.id}"]`).innerText()).replace(/\s+/g, ' ');
  check('«الفرق وقادتها»: the logo, the leader, the assistant and the count for each team', /الموج/.test(wallT) && /القائد: أحمد قائد الموج/.test(wallT) && /المساعد: باسل عمر/.test(wallT) && /5 من 7/.test(wallT) && (await A.locator(`[data-wall-team="${TM.id}"] .a-tm.has-logo`).count()) === 1
    && /المساعد: لم يُحدَّد/.test(await A.locator(`[data-wall-team="${TQ.id}"]`).innerText()), wallT);
  check('the pulse is on the admin\'s home too', (await A.locator('[data-admin-home] [data-pulse]:not([hidden])').count()) === 1);
  await A.locator('[data-fk="wait-teams"]').click();
  await A.waitForSelector('#ap-teams [data-team]');
  check('«افتح» goes to the teams waiting for approval (the filter is set)', (await A.locator('#ap-teams [data-team]').count()) === 1 && /القمر/.test(await A.locator('#ap-teams [data-team]').innerText()) && (await A.locator('.a-counters [data-fk="count-submitted"]').getAttribute('aria-pressed')) === 'true');
  await A.locator('#at-home').click();
  await A.locator(`[data-fk="tw-${TM.id}"]`).click();
  await A.waitForSelector(`#ap-teams [data-team="${TM.id}"].open [data-idbar]`);
  check('a team on the wall opens its card: the mark, the leader and assistant in the heading, «مساعد القائد» on the member', (await A.locator(`[data-team="${TM.id}"] .a-team-h .a-tm`).count()) === 1 && /المساعد: باسل عمر/.test(await A.locator(`[data-team="${TM.id}"] .a-team-h`).innerText())
    && /مساعد القائد/.test(await A.locator(`[data-team="${TM.id}"] .a-mem`, { hasText: 'باسل عمر' }).innerText()));
  await A.locator(`[data-fk="as-${TM.id}"]`).selectOption({ label: 'نادر سعيد' });
  await A.locator(`[data-fk="as-save-${TM.id}"]`).click();
  await A.waitForFunction(id => /المساعد: نادر سعيد/.test(document.querySelector(`[data-team="${id}"] .a-team-h`).innerText), TM.id, { timeout: 6000 });
  check('the admin changes the assistant', JSON.stringify(mOf('نادر سعيد').roles) === '["assistant"]' && !(mOf('باسل عمر').roles || []).includes('assistant'));
  await A.waitForSelector(`[data-fk="logo-x-${TM.id}"]`);
  await A.locator(`[data-fk="logo-x-${TM.id}"]`).click();
  check('removing a team\'s logo needs a second press', !!fake.tstyle.get(TM.id).logo_path);
  await A.locator(`[data-fk="logo-x-${TM.id}"]`).click();
  await A.waitForFunction(id => !document.querySelector(`[data-fk="logo-x-${id}"]`), TM.id, { timeout: 6000 }).catch(() => {});
  check('then the logo is gone (the file too); the color stays', !fake.tstyle.get(TM.id).logo_path && fake.logos.size === 0 && fake.tstyle.get(TM.id).color === 'purple');
  check('admin console clean (dashboard 2)', A.errs.length === 0, A.errs.join('|'));
  await close(A);
}

section('network hosts and console');
check('no request to any host other than the page itself, the fake Supabase and the shell fonts', badHosts.size === 0, [...badHosts].join());
check('no console error and no uncaught exception in any page', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
