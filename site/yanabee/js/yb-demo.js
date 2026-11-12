/* Yanabee — DEMO MODE (وضع تجريبي). Classic script, no libraries. Loaded BEFORE js/yb-config.js on account.html and tournament.html.
   It does NOTHING unless sessionStorage 'yanabee-demo' is set (this tab only). When set:
     - window.YB_CONFIG becomes a non-writable getter { url: <fake host>, anonKey: 'demo-anon' }, so js/yb-config.js cannot replace it and
       the real url / key are never used;
     - window.fetch is wrapped: requests to the fake host are answered IN THIS PAGE by a small in-memory port of the Supabase rules of
       supabase/migrations/0001_yanabee.sql (role whitelist, RLS-like filtering, views my_roster / my_children, the RPCs, publish_state with its
       optimistic-conflict check, GoTrue answers); EVERY OTHER request goes to the real fetch untouched;
     - the fake database lives in sessionStorage 'yanabee-demo-db-v1' (tab-scoped, gone when the tab closes);
     - one of three fake users (leader, member, parent) is "signed in" through the normal session key; its tokens start with 'demo-'. There is NO admin in
       the demo: no admin profile exists, no session can have that role, and the admin-only paths (approve_team, set_user_role, publish_state, other
       teams' rosters, the people list, writing the tournament) answer permission_denied exactly like the real RLS does for a non-admin;
     - a tournament state is pre-published (12 demo teams, groups drawn, about half of the group matches played) so the screens have something to show;
     - a slim banner with a user switcher and an exit button is shown.
   The demo accounts are fake and client-side only: nothing here is ever sent to a server, and no demo credential exists in any database.
   Never logs anything. Every storage access is guarded. */
(function () {
  'use strict';

  var FLAG = 'yanabee-demo', DB_KEY = 'yanabee-demo-db-v1', USER_KEY = 'yanabee-demo-user', SESS_KEY = 'yanabee-session-v1';
  var DRAFT_KEY = 'yanabee-tournament-draft-v1';
  var FAKE_URL = 'https://demo.yanabee.invalid', FAKE_ANON = 'demo-anon', TOK = 'demo-t-', REF = 'demo-r-';
  var USERS = [
    { key: 'leader', id: 'u-leader', role: 'leader', label: 'قائد فريق', email: 'leader@demo.invalid', name: 'قائد التجربة الافتراضي' },
    { key: 'member', id: 'u-member', role: 'member', label: 'عضو', email: 'member@demo.invalid', name: 'عضو التجربة الافتراضي' },
    { key: 'parent', id: 'u-parent', role: 'parent', label: 'ولي أمر', email: 'parent@demo.invalid', name: 'ولي التجربة الافتراضي' }
  ];

  /* ---------------------------------------------------------------- storage (every access guarded) */
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function storedSession() { try { var o = JSON.parse(lsGet(SESS_KEY) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  function isDemoToken(s) { return !!(s && typeof s.access_token === 'string' && s.access_token.indexOf('demo-') === 0); }
  function realSession() { var s = storedSession(); return !!(s && s.access_token && !isDemoToken(s)); }
  function userByKey(k) { for (var i = 0; i < USERS.length; i++) if (USERS[i].key === k) return USERS[i]; return null; }
  function writeSession(u) {
    lsSet(SESS_KEY, JSON.stringify({ access_token: TOK + u.id, refresh_token: REF + u.id, expires_at: 4102444800, user: { id: u.id, email: u.email } }));
  }

  var active = ssGet(FLAG) === '1';
  if (active && realSession()) { ssDel(FLAG); ssDel(DB_KEY); ssDel(USER_KEY); active = false; }   // a real session is never overwritten or mixed with the demo

  /* ---------------------------------------------------------------- the fake database */
  var db = null;
  var FIRST = ['سارة', 'عمر', 'ليلى', 'يوسف', 'مريم', 'أحمد', 'هدى', 'زياد', 'نور', 'خالد', 'رنا', 'ياسر', 'دانة', 'فارس', 'لمى', 'طارق', 'جود', 'بلال', 'ريم', 'حمزة', 'تالا', 'كريم', 'سلمى', 'مالك'];
  var SECOND = ['محمود', 'إبراهيم', 'سليمان', 'عبدالله', 'حسن', 'سالم', 'ناصر', 'فاضل', 'رشيد', 'جابر', 'منصور', 'صالح'];
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var APPROVED = ['الصقور', 'النخيل', 'الأمل', 'الغيث', 'الندى', 'الفجر', 'السنابل', 'الرواد', 'الشروق', 'الواحة', 'المنارة'];

  function norm(s) {
    return String(s || '').replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647').replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
  }
  function rnd(n) { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } }
  function uuid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function now() { db.tick += 1; return new Date(Date.UTC(2026, 10, 1) + db.tick * 1000).toISOString(); }
  function code() { var c; do { c = ''; for (var i = 0; i < 6; i++) c += ALPHABET.charAt(rnd(31)); } while (db.teams.some(function (t) { return t.join_code === c; })); return c; }

  function seed() {
    db = { v: 1, users: [], profiles: [], teams: [], members: [], links: [], tour: null, tick: 0, stamp: 0 };
    var n = 0;
    function addUser(id, email, name, role) {
      db.users.push({ id: id, email: email, password: 'demo', confirmed: true });
      db.profiles.push({ id: id, email: email, full_name: name, role: role, phone: null, created_at: now() });
    }
    function person(i) { return FIRST[i % FIRST.length] + ' ' + SECOND[(i * 7 + 3) % SECOND.length] + ' الافتراضي'; }
    function guardian(name) { return 'ولي ' + name.split(' ')[0] + ' الافتراضي'; }
    function addTeam(leaderId, leaderName, name, area, status, note, others, linkLeader) {
      var t = { id: 'team-' + (++n), name: name, area: area, leader_id: leaderId, join_code: code(), status: status, admin_note: note || null, created_at: now(), updated_at: now() };
      db.teams.push(t);
      db.members.push({ id: 'm-' + t.id + '-0', team_id: t.id, full_name: leaderName, age: 17, guardian_name: guardian(leaderName), guardian_phone: '0900000' + (100 + n),
        is_leader: true, user_id: leaderId, consent_status: 'received', consent_at: now(), created_at: now() });
      others.forEach(function (nm, i) {
        db.members.push({ id: 'm-' + t.id + '-' + (i + 1), team_id: t.id, full_name: nm, age: 12 + ((i + n) % 6), guardian_name: guardian(nm), guardian_phone: '0900000' + (200 + n * 10 + i),
          is_leader: false, user_id: null, consent_status: (i + n) % 2 ? 'received' : 'pending', consent_at: null, created_at: now() });
      });
      return t;
    }
    USERS.forEach(function (u) { addUser(u.id, u.email, u.name, u.role); });
    var LEADER = userByKey('leader'), MEMBER = userByKey('member');
    // the user-demo team: a draft with 5 members (the leader included); the member and the parent are linked to it
    var mine = addTeam(LEADER.id, LEADER.name, 'فريق الينابيع الافتراضي', 'حي الأمل', 'draft', null,
      [MEMBER.name, 'ليلى سالم الافتراضي', 'يوسف ناصر الافتراضي', 'مريم حسن الافتراضي']);
    var mrow = db.members.filter(function (m) { return m.team_id === mine.id && m.full_name === MEMBER.name; })[0];
    mrow.user_id = MEMBER.id; mrow.age = 14; mrow.consent_status = 'received'; mrow.consent_at = now();
    db.links.push({ parent_id: userByKey('parent').id, member_id: mrow.id });
    // the other 11 demo teams (each with its own fake leader; nobody in the demo can read them: only the public list and the board show them)
    var areas = ['حي الزهور', 'حي النور', 'حي السلام', 'حي الرياض', 'حي الربيع', 'حي الفرات', 'حي المنار'];
    APPROVED.forEach(function (nm, i) {
      var lid = 'u-l' + (i + 1), ln = person(i + 41);
      addUser(lid, 'l' + (i + 1) + '@demo.invalid', ln, 'leader');
      addTeam(lid, ln, 'فريق ' + nm + ' الافتراضي', areas[i % areas.length], 'approved', null, []);
    });
    persist();
    return db;
  }
  // The published board of the demo: the 12 demo teams, groups drawn, 9 of the 18 group matches played (fixed seed: always the same).
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function seedTour() {
    var YT = window.YTour;
    if (!YT || db.tour || db.tourSeeded) return;
    db.tourSeeded = true;
    try {
      var teams = db.teams.slice(0, 12).map(function (t) { return { id: t.id, name: t.name }; });
      var ids = teams.map(function (t) { return t.id; });
      var st = YT.setGroups(YT.setTeams(YT.emptyState(), teams), [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12)]);
      var rng = mulberry(20261101), ri = function (n) { return Math.floor(rng() * n); };
      for (var g = 0; g < 3; g++) {
        var rounds = YT.football(st).groups[g].rounds;
        var pick = rounds[0].matches.map(function (m) { return [m, '2026-11-15', '16:00']; }).concat([[rounds[1].matches[0], '2026-11-22', '16:00']]);
        for (var i = 0; i < pick.length; i++) st = YT.setResult(st, { a: pick[i][0].a, b: pick[i][0].b, sa: ri(5), sb: ri(5), date: pick[i][1], time: pick[i][2] });
      }
      var at = '2026-11-23T10:00:00.000Z';
      db.tour = { id: 1, state: YT.stamp(st, at), updated_at: at };
      db.stamp = Date.parse(at);
      persist();
    } catch (e) { db.tour = null; }
  }
  var EDITABLE = ['draft', 'submitted', 'returned'];
  // sample dates of the unified schedule (relative to today, so they always lie ahead); added lazily for old demo tabs
  function seedEvents() {
    if (db.events) return;
    var day = function (n, h) { var d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    var mine = db.teams[0], other = db.teams[1];
    db.events = [
      { id: 'ev-1', competition: 'football', kind: 'match', title: 'الجولة الأولى: مباراة تجريبية', starts_at: day(2, 16), place: 'ملعب الحي الافتراضي', team_ids: [mine.id, other.id], category: 'المجموعة أ', status: 'scheduled', note: null },
      { id: 'ev-2', competition: 'workshops', kind: 'workshop', title: 'ورشة القيادة للقادة', starts_at: day(4, 10), place: 'القاعة الافتراضية', team_ids: [], category: null, status: 'scheduled', note: 'للفرق المعتمدة' },
      { id: 'ev-3', competition: 'hifz', kind: 'recitation', title: 'موعد التسميع الأول', starts_at: day(6, 17), place: 'المسجد الافتراضي', team_ids: [mine.id], category: null, status: 'changed', note: 'تغيّر الموعد ساعة واحدة' }
    ];
    db.att = [];
    persist();
  }
  function notify(uids, kind, data) {
    db.notes = db.notes || [];
    uids.forEach(function (u) { if (u) db.notes.push({ id: ++db.noteSeq || (db.noteSeq = 1), user_id: u, kind: kind, data: data, read_at: null, created_at: now() }); });
  }
  // Nobody reviews in the demo, so the demo plays the reviewer: the first submission comes back as "needs edits"
  // with an example note, the next one is approved. Every step sends the notifications the real server sends.
  function demoReview(t) {
    t.demoReviews = (t.demoReviews || 0) + 1;
    var from = 'submitted';
    if (t.demoReviews === 1) {
      t.status = 'returned';
      t.admin_note = 'مراجعة تجريبية: تأكّد من تسجيل موافقة ولي أمر كل عضو، ثم أعد الإرسال.';
    } else {
      t.status = 'approved';
      t.admin_note = null;
      var people = db.members.filter(function (m) { return m.team_id === t.id && !m.is_leader && m.user_id; }).map(function (m) { return m.user_id; });
      db.links.forEach(function (l) { var m = db.members.filter(function (x) { return x.id === l.member_id; })[0]; if (m && m.team_id === t.id) people.push(l.parent_id); });
      notify(people.filter(function (u, i, a) { return a.indexOf(u) === i; }), 'team_approved', { team_id: t.id, team_name: t.name });
    }
    t.reviewed_at = now();
    notify([t.leader_id], 'team_status', { team_id: t.id, team_name: t.name, from: from, to: t.status, note: t.admin_note });
  }
  function persist() { if (!ssSet(DB_KEY, JSON.stringify(db))) { /* kept in memory only */ } }
  function loadDb() {
    var raw = ssGet(DB_KEY);
    if (raw) { try { var o = JSON.parse(raw); if (o && o.v === 1 && o.teams) { db = o; return db; } } catch (e) { /* reseed */ } }
    return seed();
  }

  /* ---------------------------------------------------------------- HTTP-shaped answers */
  function err(status, code, message) { return { status: status, body: { code: code, message: message, details: null, hint: null } }; }
  function session(uid) {
    var u = db.users.filter(function (x) { return x.id === uid; })[0];
    return { access_token: TOK + uid, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: REF + uid, user: { id: uid, email: u.email } };
  }
  function profileOf(id) { return db.profiles.filter(function (p) { return p.id === id; })[0]; }
  function ctxOf(bearer) {
    if (!bearer || bearer === FAKE_ANON) return { uid: null, role: 'anon' };
    var uid = bearer.indexOf(TOK) === 0 ? bearer.slice(TOK.length) : '';
    var p = uid ? profileOf(uid) : null;
    if (!p) return { bad: err(401, 'PGRST301', 'JWT invalid') };
    return { uid: uid, role: p.role, profile: p };
  }
  function filterRows(rows, params) {
    params.forEach(function (v, k) {
      if (['select', 'order', 'limit', 'offset', 'redirect_to'].indexOf(k) >= 0) return;
      var m = /^eq\.(.*)$/.exec(v);
      if (m) rows = rows.filter(function (r) { return String(r[k]) === m[1]; });
    });
    return rows;
  }
  function orderRows(rows, order) {
    if (!order) return rows;
    var keys = order.split(',').map(function (s) { var p = s.split('.'); return [p[0], p[1] === 'desc' ? -1 : 1]; });
    return rows.slice().sort(function (a, b) {
      for (var i = 0; i < keys.length; i++) {
        var c = keys[i][0], d = keys[i][1], x = a[c], y = b[c];
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        if (typeof x === 'string') return x.localeCompare(y, 'ar') * d;
        return (x < y ? -1 : 1) * d;
      }
      return 0;
    });
  }
  function project(rows, select) {
    if (!select || select === '*') return rows;
    var cols = select.split(',');
    return rows.map(function (r) { var o = {}; cols.forEach(function (c) { o[c] = r[c]; }); return o; });
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  function auth(method, a, u, body, bearer) {
    body = body || {};
    var users = db.users;
    function byEmail(e) { var l = String(e || '').toLowerCase(); return users.filter(function (x) { return x.email.toLowerCase() === l; })[0]; }
    if (a === 'signup' && method === 'POST') {
      if (byEmail(body.email)) return { status: 422, body: { code: 422, error_code: 'user_already_exists', msg: 'User already registered' } };
      if (String(body.password || '').length < 8) return { status: 422, body: { code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' } };
      var meta = body.data || {}, role = ['leader', 'member', 'parent'].indexOf(meta.role) >= 0 ? meta.role : 'member';   // role whitelist
      var id = 'u-' + uuid();
      users.push({ id: id, email: body.email, password: body.password, confirmed: true });
      db.profiles.push({ id: id, email: body.email, full_name: String(meta.full_name || '').trim().slice(0, 80), role: role, phone: null, created_at: now() });
      persist();
      return { status: 200, body: session(id) };
    }
    if (a === 'token' && method === 'POST') {
      var gt = u.searchParams.get('grant_type');
      if (gt === 'password') {
        var us = byEmail(body.email);
        if (!us || us.password !== body.password) return { status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } };
        return { status: 200, body: session(us.id) };
      }
      if (gt === 'refresh_token') {
        var rt = String(body.refresh_token || ''), uid = rt.indexOf(REF) === 0 ? rt.slice(REF.length) : '';
        if (!uid || !profileOf(uid)) return { status: 400, body: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } };
        return { status: 200, body: session(uid) };
      }
    }
    if (a === 'logout') return { status: 204 };
    if (a === 'recover' && method === 'POST') return { status: 200, body: {} };
    if (a === 'user') {
      var c = ctxOf(bearer);
      if (c.bad || !c.uid) return { status: 401, body: { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' } };
      var me = users.filter(function (x) { return x.id === c.uid; })[0];
      if (method === 'GET') return { status: 200, body: { id: me.id, email: me.email } };
      if (method === 'PUT') {
        if (String(body.password || '').length < 8) return { status: 422, body: { code: 422, error_code: 'weak_password', msg: 'Password should be at least 8 characters.' } };
        if (body.password === me.password) return { status: 422, body: { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' } };
        me.password = body.password; persist();
        return { status: 200, body: { id: me.id, email: me.email } };
      }
    }
    return { status: 404, body: { msg: 'no auth route' } };
  }

  function rest(method, table, q, body, headers, c) {
    var wantObj = /vnd\.pgrst\.object/.test(headers.accept || '');
    var rep = /return=representation/.test(headers.prefer || '');
    var me = c.uid;
    function deny() { return c.uid ? err(403, '42501', 'permission denied for table ' + table) : err(401, '42501', 'permission denied for table ' + table); }
    function finish(rows) {
      rows = filterRows(rows, q);
      rows = orderRows(rows, q.get('order'));
      if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
      rows = project(rows, q.get('select'));
      if (wantObj) return rows.length === 1 ? { status: 200, body: rows[0] } : err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return { status: 200, body: rows };
    }
    function myTeamIds() {
      var s = {};
      db.teams.forEach(function (t) { if (t.leader_id === me) s[t.id] = 1; });
      db.members.forEach(function (m) { if (m.user_id === me) s[m.team_id] = 1; });
      return s;
    }
    function teamOf(id) { return db.teams.filter(function (t) { return t.id === id; })[0]; }
    function isLinked(mid) { return db.links.some(function (l) { return l.parent_id === me && l.member_id === mid; }); }
    var out;

    if (table === 'tournament_state') return method === 'GET' ? finish(db.tour ? [copy(db.tour)] : []) : deny();
    if (table === 'public_teams') {
      return method === 'GET' ? finish(db.teams.filter(function (t) { return t.status === 'approved'; }).map(function (t) { return { id: t.id, name: t.name, area: t.area }; })) : deny();
    }
    if (table === 'yb_announcements') return method === 'GET' ? finish([]) : deny();   // no announcements in the demo
    if (!me) return deny();
    if (table === 'my_roster') {
      if (method !== 'GET') return deny();
      var ids = myTeamIds();
      return finish(db.members.filter(function (m) { return ids[m.team_id]; }).map(function (m) {
        return { member_id: m.id, team_id: m.team_id, full_name: m.full_name, is_leader: m.is_leader, joined: m.user_id !== null, is_me: m.user_id === me, consent_status: m.user_id === me ? m.consent_status : null };
      }));
    }
    if (table === 'yb_events') { seedEvents(); return method === 'GET' ? finish(db.events.map(copy)) : deny(); }
    if (table === 'yb_attendance') {
      seedEvents();
      if (method !== 'GET') return deny();
      var lead = db.teams.filter(function (t) { return t.leader_id === me; }).map(function (t) { return t.id; });
      return finish(db.att.filter(function (a) { return lead.indexOf(a.team_id) >= 0; }).map(copy));
    }
    if (table === 'yb_notifications') {
      if (method !== 'GET') return deny();
      return finish((db.notes || []).filter(function (x) { return x.user_id === me; }).map(copy));
    }
    if (table === 'my_children') {
      if (method !== 'GET') return deny();
      return finish(db.links.filter(function (l) { return l.parent_id === me; }).map(function (l) {
        var m = db.members.filter(function (x) { return x.id === l.member_id; })[0], t = teamOf(m.team_id);
        return { member_id: m.id, full_name: m.full_name, age: m.age, is_leader: m.is_leader, consent_status: m.consent_status, consent_at: m.consent_at, team_id: t.id, team_name: t.name, team_area: t.area, team_status: t.status };
      }));
    }
    if (table === 'profiles') {
      if (method === 'GET') return finish(db.profiles.filter(function (x) { return x.id === me; }).map(copy));
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(function (k) { return ['full_name', 'phone'].indexOf(k) < 0; })) return err(403, '42501', 'permission denied for table profiles');
        var rowsP = filterRows(db.profiles.filter(function (x) { return x.id === me; }), q);
        rowsP.forEach(function (r) { Object.assign(r, body); });
        persist();
        return rep ? { status: 200, body: rowsP.map(copy) } : { status: 204 };
      }
      return deny();
    }
    if (table === 'parent_links') return method === 'GET' ? finish(db.links.filter(function (l) { return l.parent_id === me; })) : deny();
    if (table === 'audit_log') return method === 'GET' ? finish([]) : deny();
    if (table === 'yb_submissions') return method === 'GET' ? finish([]) : deny();   // the demo team is never approved, so it has no projects yet

    if (table === 'teams') {
      function mine(t) { return t.leader_id === me; }
      if (method === 'GET') return finish(db.teams.filter(mine).map(copy));
      if (method === 'POST') {
        var b = Array.isArray(body) ? body[0] : body;
        if (Object.keys(b || {}).some(function (k) { return ['name', 'area'].indexOf(k) < 0; })) return deny();
        if (c.role !== 'leader') return err(403, '42501', 'new row violates row-level security policy for table "teams"');
        var name = String(b.name || '').trim();
        if (name.length < 2 || name.length > 60) return err(400, '23514', 'new row for relation "teams" violates check constraint "teams_name_len"');
        if (db.teams.some(function (t) { return norm(t.name) === norm(name); })) return err(409, '23505', 'duplicate key value violates unique constraint "teams_name_norm_uq"');
        if (db.teams.some(function (t) { return t.leader_id === me; })) return err(409, '23505', 'duplicate key value violates unique constraint "teams_leader_uq"');
        var t = { id: 'team-' + uuid(), name: name, area: b.area === undefined ? null : b.area, leader_id: me, join_code: code(), status: 'draft', admin_note: null, created_at: now(), updated_at: now() };
        db.teams.push(t);
        db.members.push({ id: 'm-' + uuid(), team_id: t.id, full_name: (c.profile && c.profile.full_name.trim()) || 'قائد الفريق', age: null, guardian_name: null, guardian_phone: null,
          is_leader: true, user_id: me, consent_status: 'pending', consent_at: null, created_at: now() });
        persist();
        return rep ? { status: 201, body: [copy(t)] } : { status: 201 };
      }
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(function (k) { return ['name', 'area', 'status'].indexOf(k) < 0; })) return deny();
        var targets = filterRows(db.teams.filter(function (t) { return mine(t) && EDITABLE.indexOf(t.status) >= 0; }), q);
        if (body.status && ['draft', 'submitted'].indexOf(body.status) < 0) return err(403, '42501', 'new row violates row-level security policy for table "teams"');
        if (targets.length && body.status && ['draft', 'submitted', 'returned', 'approved', 'rejected'].indexOf(body.status) < 0) return err(400, '23514', 'violates check constraint "teams_status_chk"');
        for (var i = 0; i < targets.length; i++) {
          var tt = targets[i], nm = body.name !== undefined ? String(body.name).trim() : tt.name;
          if (nm.length < 2 || nm.length > 60) return err(400, '23514', 'violates check constraint "teams_name_len"');
          if (db.teams.some(function (x) { return x !== tt && norm(x.name) === norm(nm); })) return err(409, '23505', 'duplicate key value violates unique constraint "teams_name_norm_uq"');
          if (body.status === 'submitted' && tt.status !== 'submitted') {
            var cnt = db.members.filter(function (m) { return m.team_id === tt.id; }).length;
            if (cnt < 5 || cnt > 7) return err(400, 'P0001', 'members_count_invalid');
          }
        }
        targets.forEach(function (tt) {
          var was = tt.status;
          Object.assign(tt, body); if (body.name !== undefined) tt.name = String(body.name).trim(); tt.updated_at = now();
          if (body.status === 'submitted' && was !== 'submitted') demoReview(tt);
        });
        persist();
        return rep ? { status: 200, body: targets.map(copy) } : { status: 204 };
      }
      return deny();
    }

    if (table === 'team_members') {
      var canEdit = function (tid) { var t = teamOf(tid); return !!(t && t.leader_id === me && EDITABLE.indexOf(t.status) >= 0); };
      var readable = function (m) { var t = teamOf(m.team_id); return !!(t && t.leader_id === me) || m.user_id === me || isLinked(m.id); };
      if (method === 'GET') return finish(db.members.filter(readable).map(copy));
      if (method === 'POST') {
        var bm = Array.isArray(body) ? body[0] : body;
        if (Object.keys(bm || {}).some(function (k) { return ['team_id', 'full_name', 'age', 'guardian_name', 'guardian_phone'].indexOf(k) < 0; })) return deny();
        if (!canEdit(bm.team_id)) return err(403, '42501', 'new row violates row-level security policy for table "team_members"');
        var nmm = String(bm.full_name || '').trim();
        if (nmm.length < 2 || nmm.length > 80) return err(400, '23514', 'violates check constraint "members_name_len"');
        if (bm.age !== null && bm.age !== undefined && (bm.age < 4 || bm.age > 100)) return err(400, '23514', 'violates check constraint "members_age_chk"');
        if (db.members.some(function (m) { return m.team_id === bm.team_id && norm(m.full_name) === norm(nmm); })) return err(409, '23505', 'duplicate key value violates unique constraint "team_members_name_uq"');
        if (db.members.filter(function (m) { return m.team_id === bm.team_id; }).length + 1 > 7) return err(400, 'P0001', 'team_full');
        var m2 = { id: 'm-' + uuid(), team_id: bm.team_id, full_name: nmm, age: bm.age === undefined ? null : bm.age, guardian_name: bm.guardian_name === undefined ? null : bm.guardian_name,
          guardian_phone: bm.guardian_phone === undefined ? null : bm.guardian_phone, is_leader: false, user_id: null, consent_status: 'pending', consent_at: null, created_at: now() };
        db.members.push(m2); persist();
        return rep ? { status: 201, body: [copy(m2)] } : { status: 201 };
      }
      if (method === 'PATCH') {
        if (Object.keys(body || {}).some(function (k) { return ['full_name', 'age', 'guardian_name', 'guardian_phone'].indexOf(k) < 0; })) return deny();
        var rows = filterRows(db.members.filter(function (m) { return canEdit(m.team_id); }), q);
        for (var j = 0; j < rows.length; j++) {
          var mm = rows[j];
          if (body.full_name !== undefined) {
            var n2 = String(body.full_name).trim();
            if (n2.length < 2 || n2.length > 80) return err(400, '23514', 'violates check constraint "members_name_len"');
            if (db.members.some(function (x) { return x !== mm && x.team_id === mm.team_id && norm(x.full_name) === norm(n2); })) return err(409, '23505', 'duplicate key value');
          }
          if (body.age !== null && body.age !== undefined && (body.age < 4 || body.age > 100)) return err(400, '23514', 'violates check constraint "members_age_chk"');
        }
        rows.forEach(function (mm2) { Object.assign(mm2, body); if (body.full_name !== undefined) mm2.full_name = String(body.full_name).trim(); });
        persist();
        return rep ? { status: 200, body: rows.map(copy) } : { status: 204 };
      }
      if (method === 'DELETE') {
        var del = filterRows(db.members.filter(function (m) { return canEdit(m.team_id) && !m.is_leader; }), q);
        del.forEach(function (m) { db.members.splice(db.members.indexOf(m), 1); db.links = db.links.filter(function (l) { return l.member_id !== m.id; }); });
        persist();
        return rep ? { status: 200, body: del.map(copy) } : { status: 204 };
      }
    }
    return deny();
  }

  function rpc(name, method, body, c) {
    if (c.bad) return c.bad;
    if (method !== 'POST') return err(405, 'PGRST101', 'method');
    var me = c.uid;
    if (!me) return err(401, '42501', 'permission denied for function ' + name);
    if (name === 'approve_team' || name === 'set_user_role' || name === 'publish_state') return err(403, '42501', 'permission_denied');   // admin only: nobody in the demo is an admin
    if (/^yb_(review_|set_officer)/.test(name)) return err(403, '42501', 'permission_denied');   // reviewers and officers are not part of the demo
    var SIG = { my_team: [], join_team: ['code', 'member_name'], link_child: ['code', 'child_name'], mark_consent: ['member_id', 'received'], unlink_member: ['member_id'], regenerate_join_code: ['team_id'],
      yb_mark_read: [], yb_my_team_roster_status: [], yb_my_competitions: [], yb_rsvp: ['event_id', 'team_id', 'answer'],
      yb_team_checklist: ['team_id'], yb_claim_team: ['ref', 'phone'], yb_set_roles: ['team_id', 'reciter', 'reserve', 'chess', 'coord'],
      yb_chat_unread: [], yb_chat_list: [], yb_chat_seen: ['last_id'], yb_chat_post: ['body'], yb_chat_report: ['message_id', 'reason'] };
    if (!SIG[name]) return err(404, 'PGRST202', 'Could not find the function public.' + name);
    var keys = Object.keys(body || {});
    var optional = name === 'yb_mark_read' ? ['ids'] : [];
    if (keys.some(function (k) { return SIG[name].indexOf(k) < 0; }) || SIG[name].some(function (k) { return keys.indexOf(k) < 0 && optional.indexOf(k) < 0; })) return err(404, 'PGRST202', 'Could not find the function public.' + name + ' in the schema cache');
    function raise(key, code) { return err(code === '42501' ? 403 : 400, code || 'P0001', key); }
    function clean(s) { return String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
    function memberById(id) { return db.members.filter(function (x) { return x.id === id; })[0]; }
    function teamById(id) { return db.teams.filter(function (x) { return x.id === id; })[0]; }

    if (name === 'my_team') {
      var out = [];
      db.teams.filter(function (t) { return t.leader_id === me; }).forEach(function (t) {
        var lm = db.members.filter(function (m) { return m.team_id === t.id && m.is_leader; })[0];
        out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'leader', member_id: lm ? lm.id : null, join_code: t.join_code, admin_note: t.admin_note });
      });
      db.members.filter(function (m) { return m.user_id === me; }).forEach(function (m) {
        var t = teamById(m.team_id);
        if (t.leader_id !== me) out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'member', member_id: m.id, join_code: null, admin_note: null });
      });
      db.links.filter(function (l) { return l.parent_id === me; }).forEach(function (l) {
        var m = memberById(l.member_id), t = teamById(m.team_id);
        out.push({ team_id: t.id, team_name: t.name, area: t.area, status: t.status, my_role: 'parent', member_id: m.id, join_code: null, admin_note: null });
      });
      return { status: 200, body: out };
    }
    if (name === 'join_team' || name === 'link_child') {
      var isJoin = name === 'join_team';
      if (c.role !== (isJoin ? 'member' : 'parent')) return raise('wrong_role', '42501');
      var tm = db.teams.filter(function (x) { return x.join_code === clean(body.code); })[0];
      if (!tm) return raise('team_not_found');
      var nm = norm(isJoin ? body.member_name : body.child_name);
      if (!nm) return raise('name_not_in_roster');
      var row = db.members.filter(function (x) { return x.team_id === tm.id && norm(x.full_name) === nm; })[0];
      if (!row) return raise('name_not_in_roster');
      if (isJoin) {
        if (row.user_id !== null) return raise('already_linked');
        if (db.members.some(function (x) { return x.user_id === me; })) return raise('already_linked');
        row.user_id = me;
      } else {
        if (db.links.some(function (l) { return l.parent_id === me && l.member_id === row.id; })) return raise('already_linked');
        db.links.push({ parent_id: me, member_id: row.id });
      }
      persist();
      return { status: 200, body: { ok: true, team_id: tm.id, member_id: row.id, team_name: tm.name } };
    }
    if (name === 'mark_consent' || name === 'unlink_member') {
      var m = memberById(body.member_id);
      if (!m) return raise('member_not_found');
      var t2 = teamById(m.team_id);
      if (!(t2.leader_id === me && EDITABLE.indexOf(t2.status) >= 0)) return raise('permission_denied', '42501');
      if (name === 'mark_consent') {
        if (typeof body.received !== 'boolean') return raise('invalid_argument');
        m.consent_status = body.received ? 'received' : 'pending';
        m.consent_at = body.received ? now() : null;
        persist();
        return { status: 200, body: { ok: true, consent_status: m.consent_status } };
      }
      if (m.is_leader) return raise('permission_denied', '42501');
      if (!m.is_leader) m.user_id = null;
      db.links = db.links.filter(function (l) { return l.member_id !== m.id; });
      persist();
      return { status: 200, body: { ok: true } };
    }
    if (name === 'yb_mark_read') {
      var nmk = 0, want = Array.isArray(body.ids) ? body.ids : null;
      (db.notes || []).forEach(function (x) { if (x.user_id === me && !x.read_at && (!want || want.indexOf(x.id) >= 0)) { x.read_at = now(); nmk++; } });
      persist();
      return { status: 200, body: nmk };
    }
    if (name === 'yb_my_team_roster_status') {
      var lt = db.teams.filter(function (t) { return t.leader_id === me; })[0];
      if (!lt) return { status: 200, body: [] };
      return { status: 200, body: db.members.filter(function (m) { return m.team_id === lt.id; }).map(function (m) {
        return { member_id: m.id, joined: m.user_id !== null, parents: db.links.filter(function (l) { return l.member_id === m.id; }).length };
      }) };
    }
    if (name === 'yb_my_competitions') return { status: 200, body: [] };
    if (name === 'yb_rsvp') {
      seedEvents();
      var tt = teamById(body.team_id);
      if (!tt || tt.leader_id !== me) return raise('permission_denied', '42501');
      if (body.answer !== null && body.answer !== 'yes' && body.answer !== 'no') return raise('invalid_argument');
      var ev = db.events.filter(function (x) { return x.id === body.event_id; })[0];
      if (!ev) return raise('event_not_found');
      if (!(ev.team_ids.indexOf(tt.id) >= 0 || (!ev.team_ids.length && tt.status === 'approved'))) return raise('permission_denied', '42501');
      if (ev.status === 'cancelled') return raise('event_cancelled');
      db.att = db.att.filter(function (a) { return !(a.event_id === ev.id && a.team_id === tt.id); });
      db.att.push({ event_id: ev.id, team_id: tt.id, rsvp: body.answer, presence: null, late_minutes: null });
      persist();
      return { status: 200, body: { ok: true, rsvp: body.answer } };
    }
    // the team checklist (migration 0005): the demo has no fee desk, so the fee stays unpaid
    if (name === 'yb_team_checklist') {
      var tc = teamById(body.team_id);
      if (!tc) return raise('team_not_found');
      var mine = tc.leader_id === me || db.members.some(function (m) { return m.team_id === tc.id && m.user_id === me; })
        || db.links.some(function (l) { var m = memberById(l.member_id); return l.parent_id === me && m && m.team_id === tc.id; });
      if (!mine) return raise('permission_denied', '42501');
      var ms = db.members.filter(function (m) { return m.team_id === tc.id; });
      var minors = ms.filter(function (m) { return m.age === null || m.age === undefined || m.age < 18; });
      var grp = null;
      var gs = db.tour && db.tour.state && Array.isArray(db.tour.state.groups) ? db.tour.state.groups : [];
      gs.forEach(function (g, i) { if (Array.isArray(g) && g.indexOf(tc.id) >= 0) grp = i; });
      seedEvents();
      var nowMs = Date.now();
      var nx = db.events.filter(function (e) { return e.status !== 'cancelled' && Date.parse(e.starts_at) > nowMs && (e.team_ids.indexOf(tc.id) >= 0 || (!e.team_ids.length && tc.status === 'approved')); })
        .sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); })[0];
      return { status: 200, body: { team_id: tc.id, name: tc.name, area: tc.area, status: tc.status, note: tc.status === 'returned' || tc.status === 'rejected' ? tc.admin_note : null,
        ref: null, fee: 'unpaid', fee_at: null, members: ms.length, minors: minors.length,
        consents: minors.filter(function (m) { return m.consent_status === 'received'; }).length,
        claimed: true, group: grp, next: nx ? { title: nx.title, starts_at: nx.starts_at, place: nx.place, competition: nx.competition } : null,
        created_at: tc.created_at, reviewed_at: null } };
    }
    // the leaders room (migration 0009): only the demo leader is in it; messages stay in this tab
    if (/^yb_chat_/.test(name)) {
      var cme = db.profiles.filter(function (x) { return x.id === me; })[0];
      if (!cme || cme.role !== 'leader') return raise('permission_denied', '42501');
      db.chat = db.chat || [];
      if (name === 'yb_chat_unread' ) return { status: 200, body: 0 };
      if (name === 'yb_chat_seen') return { status: 200, body: null };
      if (name === 'yb_chat_report') return { status: 200, body: { ok: false, error: 'invalid_argument' } };
      if (name === 'yb_chat_list') return { status: 200, body: db.chat.map(function (m) { return { id: m.id, author_name: cme.full_name, author_role: 'leader', mine: true, body: m.body, hidden: false, created_at: m.created_at, reported: false, reports: 0, author_muted: false }; }) };
      var cb = String(body.body || '').trim();
      if (!cb || cb.length > 500) return { status: 200, body: { ok: false, error: 'invalid_data' } };
      var digits = cb.replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }).replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); }).replace(/[\s()+-]/g, '');
      if (/[0-9]{7,}/.test(digits) || /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(cb)) return { status: 200, body: { ok: false, error: 'contact_not_allowed' } };
      var last = db.chat[db.chat.length - 1];
      if (last && Date.now() - Date.parse(last.created_at) < 3000) return { status: 200, body: { ok: false, error: 'too_fast' } };
      db.chat.push({ id: db.chat.length + 1, body: cb, created_at: new Date().toISOString() });
      persist();
      return { status: 200, body: { ok: true, id: db.chat.length } };
    }
    if (name === 'yb_claim_team') return { status: 200, body: { ok: false, error: 'not_found' } };   // nothing is sent from the form in the demo
    // roles (migration 0006): the demo leader picks the reciters, the chess player and the coordinator
    if (name === 'yb_set_roles') {
      var tr = teamById(body.team_id);
      if (!tr) return raise('team_not_found');
      if (tr.leader_id !== me || EDITABLE.indexOf(tr.status) < 0) return raise('permission_denied', '42501');
      var keys2 = ['reciter', 'reserve', 'chess', 'coord'];
      var bad = keys2.some(function (k) { return body[k] && !db.members.some(function (m) { return m.id === body[k] && m.team_id === tr.id; }); });
      if (bad) return { status: 200, body: { ok: false, error: 'member_not_found' } };
      if (body.reciter && body.reciter === body.reserve) return { status: 200, body: { ok: false, error: 'same_reciters' } };
      db.members.filter(function (m) { return m.team_id === tr.id; }).forEach(function (m) {
        m.roles = keys2.filter(function (k) { return body[k] === m.id; });
      });
      persist();
      return { status: 200, body: { ok: true } };
    }
    if (name === 'regenerate_join_code') {
      var t3 = teamById(body.team_id);
      if (!t3) return raise('team_not_found');
      if (t3.leader_id !== me) return raise('permission_denied', '42501');
      t3.join_code = code(); persist();
      return { status: 200, body: t3.join_code };
    }
    return err(404, 'PGRST202', 'no function');
  }

  function handle(method, urlStr, headers, bodyText) {
    var u = new URL(urlStr);
    var h = {};
    Object.keys(headers || {}).forEach(function (k) { h[k.toLowerCase()] = headers[k]; });
    var bearer = (h.authorization || '').replace(/^Bearer\s+/i, '');
    var body = null;
    if (bodyText) { try { body = JSON.parse(bodyText); } catch (e) { body = null; } }
    var p = u.pathname;
    if (p.indexOf('/rest/v1/tournament_state') === 0) seedTour();   // lazily: the engine is loaded by now
    if (p.indexOf('/auth/v1/') === 0) return auth(method, p.slice(9), u, body, bearer);
    var c = ctxOf(bearer);
    if (p.indexOf('/rest/v1/rpc/') === 0) return rpc(p.slice(13), method, body, c);
    if (p.indexOf('/rest/v1/') === 0) { if (c.bad) return c.bad; return rest(method, p.slice(9), u.searchParams, body, h, c); }
    return { status: 404, body: { message: 'no route' } };
  }

  /* ---------------------------------------------------------------- public API (also when the demo is off: it only starts it) */
  function reload() { try { location.reload(); } catch (e) { /* ignore */ } }
  function clearDraftFromDemo() {   // a tournament draft made in the demo (its base stamp ends with Z, a real one ends with +00:00)
    try { var d = JSON.parse(lsGet(DRAFT_KEY) || 'null'); if (d && typeof d.base === 'string' && /Z$/.test(d.base)) lsDel(DRAFT_KEY); } catch (e) { /* ignore */ }
  }
  var API = {
    active: active,
    users: USERS.map(function (u) { return { key: u.key, label: u.label, role: u.role, name: u.name }; }),
    canEnter: function () { return !active && !realSession(); },
    current: function () { return active ? ssGet(USER_KEY) || 'leader' : null; },
    enter: function (key) {
      var u = userByKey(key);
      if (!u || active || realSession()) return false;
      if (!ssSet(FLAG, '1')) return false;       // blocked storage: the demo cannot run
      ssDel(DB_KEY); seed();
      ssSet(USER_KEY, u.key); writeSession(u);
      reload();
      return true;
    },
    switchTo: function (key) {
      var u = userByKey(key);
      if (!u || !active) return false;
      ssSet(USER_KEY, u.key); writeSession(u);
      reload();
      return true;
    },
    exit: function () {
      var s = storedSession();
      if (isDemoToken(s)) lsDel(SESS_KEY);
      clearDraftFromDemo();
      ssDel(FLAG); ssDel(DB_KEY); ssDel(USER_KEY);
      reload();
      return true;
    }
  };
  window.YBDemo = API;
  if (!active) return;

  /* ---------------------------------------------------------------- the demo is ON: from here on only this tab */
  loadDb();
  var cur = userByKey(ssGet(USER_KEY)) || USERS[0];   // USERS has leader first
  ssSet(USER_KEY, cur.key);
  writeSession(cur);

  var cfg = { url: FAKE_URL, anonKey: FAKE_ANON };
  try { Object.defineProperty(window, 'YB_CONFIG', { configurable: true, get: function () { return cfg; }, set: function () { /* yb-config.js must not replace it */ } }); } catch (e) { /* ignore */ }

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(FAKE_URL + '/') !== 0) return realFetch.apply(this, arguments);   // anything else is untouched
    init = init || {};
    var out;
    try { out = handle((init.method || 'GET').toUpperCase(), url, init.headers || {}, typeof init.body === 'string' ? init.body : '') || { status: 500, body: {} }; } catch (e) { out = { status: 500, body: { message: 'Internal Server Error' } }; }
    var text = out.status === 204 || out.body === undefined ? null : JSON.stringify(out.body);
    return Promise.resolve(new Response(text, { status: out.status, headers: { 'content-type': 'application/json' } }));
  };

  // the demo session lives in this tab: other tabs signing in or out must not move it
  window.addEventListener('storage', function (e) { if (e.key === null || e.key === SESS_KEY) e.stopImmediatePropagation(); }, true);

  /* ---------------------------------------------------------------- banner */
  var CSS = '.yd-bar{position:fixed;z-index:95;top:calc(var(--nav-h,66px) + 20px);inset-inline:12px;max-width:1100px;margin-inline:auto;padding:8px 14px;border-radius:14px;'
    + 'background:color-mix(in oklab,var(--sun,#d9762a) 14%,var(--surface,#fff));border:1.5px solid color-mix(in oklab,var(--sun,#d9762a) 55%,var(--line,#ccc));color:var(--ink,#111);'
    + 'box-shadow:var(--shadow,0 6px 20px rgba(0,0,0,.15));font:500 .86rem/1.6 var(--font,system-ui)}'
    + '.yd-bar *{box-sizing:border-box}'
    + '.yd-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}'
    + '.yd-tag{flex:none;padding:0 10px;border-radius:999px;background:var(--sun,#d9762a);color:#fff;font:700 .78rem/1.8 var(--font-h,inherit)}'
    + '[data-theme=dark] .yd-tag{color:#1a1206}'
    + '.yd-msg{flex:1 1 260px;min-width:0;margin:0;color:var(--ink,#111)}'
    + '.yd-sw{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'
    + '.yd-sw>span{font-size:.8rem;color:var(--ink-2,#333)}'
    + '.yd-bar button,.yd-bar a{min-height:44px;padding:4px 12px;border-radius:999px;border:1px solid var(--line-2,#aaa);background:var(--surface,#fff);color:var(--head,#111);font:600 .84rem/1.4 var(--font-h,inherit);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}'
    + '.yd-bar button[aria-pressed=true]{background:var(--brand,#0a7680);border-color:var(--brand,#0a7680);color:var(--on-brand,#fff)}'
    + '.yd-bar a[aria-current=page]{border-color:var(--brand,#0a7680);color:var(--brand,#0a7680)}'
    + '.yd-bar .yd-exit{border-color:color-mix(in oklab,var(--t3,#cf4330) 60%,var(--line,#ccc));color:var(--t3,#cf4330)}'
    + '.yd-bar details{margin-top:2px}.yd-bar summary{cursor:pointer;min-height:32px;display:flex;align-items:center;font-weight:600;color:var(--brand,#0a7680)}'
    + '.yd-bar ol{margin:4px 0 6px;padding-inline-start:1.4em;list-style:decimal;font-weight:400;color:var(--ink-2,#333)}'
    + 'body.yd-on main{padding-top:var(--yd-h,0px)}'
    + '.yd-links{margin:4px 0}'
    + '@media (max-width:720px){.yd-bar{inset-inline:8px;top:calc(58px + 16px);padding:6px 10px;font-size:.78rem;line-height:1.5}.yd-bar button,.yd-bar a{padding:2px 10px}.yd-sw>span{display:none}.yd-row{gap:4px 8px}.yd-msg{flex-basis:200px}}'
    + '@media print{.yd-bar{display:none!important}body.yd-on main{padding-top:0}}';

  function mk(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.append(c); });
    return e;
  }
  function banner() {
    if (!document.body || document.querySelector('.yd-bar')) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    var onTour = /tournament\.html$/.test(location.pathname);
    var sw = mk('div', { class: 'yd-sw', role: 'group', 'aria-label': 'التبديل بين المستخدمين الوهميين' }, [mk('span', { text: 'جرّب شاشة:' })]);
    USERS.forEach(function (u) {
      var b = mk('button', { type: 'button', 'aria-pressed': String(u.key === cur.key), 'data-yd-user': u.key, text: u.label });
      b.addEventListener('click', function () { if (u.key !== cur.key) API.switchTo(u.key); });
      sw.append(b);
    });
    var exit = mk('button', { type: 'button', class: 'yd-exit', 'data-yd-exit': '', text: 'خروج من التجربة' });
    exit.addEventListener('click', function () { API.exit(); });
    var nav = mk('p', { class: 'yd-sw yd-links' }, [
      mk('a', { href: 'account.html', text: 'حسابي', 'aria-current': onTour ? 'false' : 'page' }),
      mk('a', { href: 'tournament.html', text: 'لوحة البطولة', 'aria-current': onTour ? 'page' : 'false' })]);
    var guide = mk('details', {}, [mk('summary', { text: 'ماذا أجرّب؟ وروابط' }), nav, mk('ol', {}, [
      mk('li', { text: 'كقائد فريق: أضف عضوًا أو احذفه، سجّل موافقة ولي الأمر، انسخ رمز الانضمام، ثم أرسل الفريق للاعتماد.' }),
      mk('li', { text: 'كعضو: شاهد فريقك وزملاءك وجدول مبارياتك ونتائجها.' }),
      mk('li', { text: 'كولي أمر: تابع حالة الموافقة وفريق ابنك أو ابنتك ونتائجه.' }),
      mk('li', { text: 'افتح لوحة البطولة لترى الترتيب العام، وتبويب «فريقي» لمبارياتك.' })])]);
    var bar = mk('aside', { class: 'yd-bar', role: 'region', 'aria-label': 'وضع تجريبي' }, [
      mk('div', { class: 'yd-row' }, [mk('span', { class: 'yd-tag', text: 'وضع تجريبي' }),
        mk('p', { class: 'yd-msg', text: 'وضع تجريبي: بيانات وهمية تُحفظ في هذا المتصفح فقط ولا تتصل بأي قاعدة بيانات' })]),
      mk('div', { class: 'yd-row' }, [sw, exit]), guide]);
    document.body.insertBefore(bar, document.getElementById('main') || document.body.firstChild);
    document.body.classList.add('yd-on');
    var fit = function () { document.documentElement.style.setProperty('--yd-h', Math.ceil(bar.getBoundingClientRect().height + 24) + 'px'); };
    fit();
    try { new ResizeObserver(fit).observe(bar); } catch (e) { window.addEventListener('resize', fit); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner); else banner();
})();
