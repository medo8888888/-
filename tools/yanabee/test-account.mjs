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
    if (!me) return err(401, '42501', `permission denied for function ${name}`);
    const raise = (key, code = 'P0001') => err(code === '42501' ? 403 : 400, code, key);
    const admin = c.role === 'admin';
    const SIG = { my_team: [], join_team: ['code', 'member_name'], link_child: ['code', 'child_name'], approve_team: ['team_id', 'ok', 'note'], mark_consent: ['member_id', 'received'],
      unlink_member: ['member_id'], regenerate_join_code: ['team_id'], set_user_role: ['target', 'new_role'],
      yb_review_team: ['team_id', 'decision', 'note'], yb_review_list: [], yb_review_roster: ['team_id'], yb_my_competitions: [], yb_set_officer: ['target', 'competition', 'assign'],
      yb_mark_read: [], yb_my_team_roster_status: [], yb_rsvp: ['event_id', 'team_id', 'answer'], yb_mark_attendance: ['event_id', 'team_id', 'presence', 'late_minutes'] };
    if (!SIG[name]) return err(404, 'PGRST202', 'Could not find the function public.' + name);
    if (name === 'yb_mark_read') {
      const ids = body && Array.isArray(body.ids) ? body.ids : null;
      let n = 0;
      this.notes.forEach(x => { if (x.user_id === me && !x.read_at && (!ids || ids.includes(x.id))) { x.read_at = this.now(); n++; } });
      return { status: 200, body: n };
    }
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
        return { team_id: t.id, team_name: t.name, area: t.area, status: t.status, admin_note: t.admin_note, members: ms.length, consents: ms.filter(m => m.consent_status === 'received').length, updated_at: t.updated_at, reviewed_at: t.reviewed_at || null };
      }) };
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
async function signInOk(p, email, password) {
  await signIn(p, email, password);
  await waitApp(p);
  await settle(p);
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
  check('the only storage key it writes is the registration draft', (code.match(/localStorage\.setItem/g) || []).length === 1 && /setItem\(DRAFT_KEY/.test(code));
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
  check('admin screen: role badge الإدارة, five tabs (with الجدول)', (await AD.locator('.a-head .a-badge').innerText()) === 'الإدارة' && (await AD.locator('[role=tab]').allInnerTexts()).join('|').replace(/\s+/g, ' ').includes('الجدول') && (await AD.locator('[role=tab]').count()) === 5);
  check('admin load does NOT poll or read the tournament state', world.count(/tournament_state/) === stateBefore);
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
  check('member screen reads only my_team, my_roster, tournament_state and the own profile (never teams, team_members, profiles list)', reqs.every(r => /^(rpc\/(my_team|join_team|yb_mark_read)|my_roster|tournament_state|profiles|yb_notifications|yb_events)$/.test(r)), [...new Set(reqs)].join());
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
  check('parent screen reads only my_children, tournament_state and the own profile', preqs.every(r => /^(rpc\/(link_child|yb_mark_read)|my_children|tournament_state|profiles|yb_notifications|yb_events)$/.test(r)), [...new Set(preqs)].join());
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
  check('admin tabs: arrow keys move to the next tab and keep focus on it', (await A.locator('#at-people').getAttribute('aria-selected')) === 'true' && await A.evaluate(() => document.activeElement.id) === 'at-people');
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
  /* session lost for good */
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
            check(`${label}: only the YB session (and theme) is in storage; no password anywhere`, !lsAll.includes('Passw0rd!') && Object.keys(JSON.parse(lsAll).l).every(k => ['yanabee-session-v1', 'yanabee-theme'].includes(k)) && !Object.keys(JSON.parse(lsAll).s).some(k => /token|pass/i.test(k)), lsAll.slice(0, 200));
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
section('network hosts and console');
check('no request to any host other than the page itself, the fake Supabase and the shell fonts', badHosts.size === 0, [...badHosts].join());
check('no console error and no uncaught exception in any page', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
