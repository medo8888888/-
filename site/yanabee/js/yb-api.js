/* Yanabee — browser API client for Supabase (GoTrue + PostgREST), no library, no build step.
   Contract: docs/YANABEE_APP.md "Client API".  Exposes window.YB.
   - Talks ONLY to YB_CONFIG.url. Empty config = not connected: every network method resolves
     {ok:false,error:'not_configured'} (or null) and fetch is never called.
   - Never logs anything (tokens stay out of the console).
   - Session lives in localStorage 'yanabee-session-v1' (access_token, refresh_token, expires_at, user).
   Data methods:  q() RESOLVES rows/row and THROWS an Error {error,message,code,hint,status} on failure;
                  insert/update/remove/rpc RESOLVE {ok:true,data,status} | {ok:false,error,message,code,hint,status}.
   Use YB.errorText(errOrResult) to get a short Arabic sentence. */
(function () {
  'use strict';

  var STORE_KEY = 'yanabee-session-v1';
  var REFRESH_MARGIN = 60;          // seconds before expiry when the token is refreshed
  var TIMEOUT_MS = 20000;
  var MIN_PASSWORD = 8;
  var ROLES = { leader: 1, member: 1, parent: 1 };   // client-side convenience only; the database enforces it

  var cfg = (typeof window !== 'undefined' && window.YB_CONFIG) || {};
  var BASE = String(cfg.url || '').trim().replace(/\/+$/, '');
  var ANON = String(cfg.anonKey || '').trim();
  // A secret/service key pasted here by mistake must never be used by a public page.
  function b64json(seg) {
    try {
      var s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      return JSON.parse(atob(s));
    } catch (e) { return null; }
  }
  function isServiceKey(k) {
    if (/^sb_secret_/i.test(k)) return true;
    var p = k.split('.');
    if (p.length === 3) { var o = b64json(p[1]); return !!(o && o.role === 'service_role'); }
    return false;
  }
  var configProblem = ANON && isServiceKey(ANON) ? 'service_key' : null;
  var configured = /^https?:\/\/[^\s/]+/i.test(BASE) && ANON.length > 0 && !configProblem;

  var state = { session: null, profile: null };
  var listeners = [];
  var refreshing = null;

  /* ------------------------------------------------------------------ utils */
  function now() { return Math.floor(Date.now() / 1000); }
  function isObj(x) { return x !== null && typeof x === 'object'; }
  function assign(a, b) { for (var k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; } return a; }
  function enc(v) { return encodeURIComponent(String(v)); }
  function notConfigured() { return Promise.resolve({ ok: false, error: 'not_configured' }); }

  /* --------------------------------------------------------------- storage */
  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (isObj(o) && typeof o.access_token === 'string' && o.access_token &&
          typeof o.refresh_token === 'string' && o.refresh_token &&
          typeof o.expires_at === 'number' && isFinite(o.expires_at) &&
          isObj(o.user) && typeof o.user.id === 'string' && o.user.id) {
        return {
          access_token: o.access_token, refresh_token: o.refresh_token, expires_at: o.expires_at,
          user: { id: o.user.id, email: typeof o.user.email === 'string' ? o.user.email : '' }
        };
      }
    } catch (e) { /* malformed or blocked storage: behave as signed out */ }
    return null;
  }
  function writeStore(s) {
    try {
      if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* private mode / blocked: keep the session in memory only */ }
  }

  function buildSession(body, prev) {
    var u = isObj(body.user) ? body.user : (prev && prev.user) || {};
    var exp = Number(body.expires_at);
    if (!isFinite(exp) || exp <= 0) exp = now() + (Number(body.expires_in) || 3600);
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token || (prev && prev.refresh_token) || '',
      expires_at: exp,
      user: { id: u.id || '', email: u.email || '' }
    };
  }
  function setSession(s) {
    var changedUser = !state.session || !s || state.session.user.id !== s.user.id;
    state.session = s;
    if (changedUser) state.profile = null;
    writeStore(s);
  }
  function publicSession() {
    if (!state.session) return null;
    return { user: { id: state.session.user.id, email: state.session.user.email }, profile: state.profile };
  }
  function emit(event) {
    var snap = publicSession();
    listeners.slice().forEach(function (cb) { try { cb(snap, event); } catch (e) { /* a listener must not break us */ } });
  }
  function dropSession(event) {
    state.session = null;
    state.profile = null;
    writeStore(null);
    emit(event || 'SIGNED_OUT');
  }

  /* ----------------------------------------------------------------- errors */
  var KEY_RE = /^[a-z][a-z0-9_]*$/;
  var PG_CODES = {
    PGRST301: 'jwt_expired', PGRST303: 'jwt_expired', PGRST116: 'not_found', PGRST202: 'not_found',
    '42501': 'permission_denied', '23505': 'duplicate', '23514': 'invalid_data', '23503': 'invalid_reference',
    '23502': 'invalid_data', '22P02': 'invalid_data', '22007': 'invalid_data', '22003': 'invalid_data',
    '22001': 'invalid_data', '42P01': 'not_found', '42883': 'not_found'
  };
  var LEGACY = [   // older GoTrue builds answer with free text only
    [/invalid login credentials/i, 'invalid_credentials'],
    [/email not confirmed/i, 'email_not_confirmed'],
    [/user already registered|already been registered/i, 'user_already_exists'],
    [/email rate limit|rate limit exceeded/i, 'over_email_send_rate_limit'],
    [/for security purposes.*seconds/i, 'over_request_rate_limit'],
    [/password should be at least|password is too short|weak password/i, 'weak_password'],
    [/different from the old password/i, 'same_password'],
    [/signups? not allowed|signup is disabled/i, 'signup_disabled'],
    [/unable to validate email|invalid email|email address.*invalid/i, 'email_address_invalid'],
    [/token has expired or is invalid|otp.*expired/i, 'otp_expired'],
    [/jwt expired|invalid jwt/i, 'jwt_expired'],
    [/refresh token/i, 'refresh_token_not_found']
  ];
  function keyFromBody(status, b) {
    b = isObj(b) ? b : {};
    var msg = String(b.msg || b.message || b.error_description || (typeof b.error === 'string' ? b.error : '') || '');
    var code = typeof b.code === 'string' ? b.code : '';
    if (msg === 'invalid_grant') return 'invalid_credentials';
    if (KEY_RE.test(msg)) return msg;                                            // our own function errors: the message IS the key
    if (typeof b.error_code === 'string' && KEY_RE.test(b.error_code)) return b.error_code;   // GoTrue
    if (code && PG_CODES[code]) return PG_CODES[code];
    for (var i = 0; i < LEGACY.length; i++) { if (LEGACY[i][0].test(msg)) return LEGACY[i][1]; }
    if (status === 0) return 'network';
    if (status === 401) return 'not_authenticated';
    if (status === 403) return 'permission_denied';
    if (status === 404 || status === 406) return 'not_found';
    if (status === 409) return 'duplicate';
    if (status === 422) return 'invalid_data';
    if (status === 429) return 'over_request_rate_limit';
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'bad_request';
    return 'unknown';
  }
  function failure(r) {      // r = raw http result
    var b = isObj(r.data) ? r.data : {};
    var out = {
      ok: false,
      error: r.networkError ? r.networkError : keyFromBody(r.status, b),
      message: String(b.message || b.msg || b.error_description || (typeof b.error === 'string' ? b.error : '') || ''),
      code: typeof b.code === 'string' || typeof b.code === 'number' ? String(b.code) : (typeof b.error_code === 'string' ? b.error_code : ''),
      hint: typeof b.hint === 'string' ? b.hint : '',
      details: typeof b.details === 'string' ? b.details : '',
      status: r.status || 0
    };
    return out;
  }
  function toError(f) {
    var e = new Error(f.message || f.error);
    e.name = 'YBError';
    e.ok = false; e.error = f.error; e.code = f.code; e.hint = f.hint; e.details = f.details; e.status = f.status;
    return e;
  }

  var TEXT = {
    network: 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت ثم أعد المحاولة.',
    timeout: 'استغرق الاتصال وقتًا طويلًا. أعد المحاولة.',
    not_configured: 'الخدمة غير موصولة بعد، فلا تتوفر الحسابات الآن.',
    invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    email_not_confirmed: 'لم يُؤكَّد البريد بعد. افتح رسالة التأكيد في بريدك.',
    user_already_exists: 'هذا البريد مسجَّل من قبل. جرّب تسجيل الدخول.',
    over_request_rate_limit: 'محاولات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
    over_email_send_rate_limit: 'أُرسلت رسائل كثيرة إلى هذا البريد. انتظر قليلًا ثم أعد المحاولة.',
    weak_password: 'كلمة المرور قصيرة أو ضعيفة. استخدم 8 أحرف على الأقل.',
    same_password: 'يجب أن تختلف كلمة المرور الجديدة عن القديمة.',
    invalid_email: 'اكتب بريدًا إلكترونيًا صحيحًا.',
    email_address_invalid: 'اكتب بريدًا إلكترونيًا صحيحًا.',
    validation_failed: 'بعض البيانات غير صالحة. راجعها وأعد المحاولة.',
    signup_disabled: 'إنشاء الحسابات متوقف حاليًا.',
    otp_expired: 'انتهت صلاحية الرابط. اطلب رابطًا جديدًا.',
    jwt_expired: 'انتهت جلستك. سجّل الدخول من جديد.',
    session_expired: 'انتهت جلستك. سجّل الدخول من جديد.',
    not_authenticated: 'سجّل الدخول أولًا.',
    refresh_token_not_found: 'انتهت جلستك. سجّل الدخول من جديد.',
    permission_denied: 'ليس لديك صلاحية لهذا الإجراء.',
    wrong_role: 'هذا الإجراء غير متاح لنوع حسابك.',
    team_not_found: 'رمز الفريق غير صحيح.',
    name_not_in_roster: 'هذا الاسم غير موجود في قائمة الفريق. اكتبه كما كتبه قائد الفريق.',
    already_linked: 'هذا الاسم أو هذا الحساب مرتبط بالفعل.',
    team_full: 'اكتمل الحد الأقصى لأعضاء الفريق.',
    members_count_invalid: 'عدد الأعضاء الحالي لا يسمح بإرسال الفريق للاعتماد. راجع شروط التسجيل.',
    member_not_found: 'العضو غير موجود.',
    user_not_found: 'المستخدم غير موجود.',
    invalid_argument: 'البيانات المدخلة غير صالحة.',
    invalid_data: 'البيانات المدخلة غير صالحة.',
    invalid_state: 'بيانات البطولة غير صالحة.',
    state_too_large: 'بيانات البطولة كبيرة أكثر من اللازم.',
    invalid_reference: 'تعذّر الربط بسجل غير موجود.',
    duplicate: 'هذه القيمة مستخدمة من قبل. اختر قيمة أخرى.',
    conflict: 'تغيّرت البيانات من جهة أخرى. حدّث الصفحة ثم أعد المحاولة.',
    not_found: 'لم يُعثر على المطلوب.',
    filter_required: 'طلب غير آمن: يجب تحديد السجل المقصود.',
    server_error: 'الخادم غير متاح مؤقتًا. أعد المحاولة بعد قليل.',
    bad_request: 'تعذّر تنفيذ الطلب.',
    unknown: 'حدث خطأ غير متوقع. أعد المحاولة.'
  };
  function errorText(err) {
    var key = 'unknown';
    if (typeof err === 'string') {
      key = err;
    } else if (isObj(err)) {
      if (err.name === 'AbortError') key = 'timeout';
      else if (err.name === 'TypeError' && !err.error) key = 'network';
      else if (typeof err.error === 'string' && err.error) key = err.error;
      else if (err.conflict === true) key = 'conflict';
      else key = keyFromBody(Number(err.status) || 200, { message: err.message, code: typeof err.code === 'string' ? err.code : '', msg: err.msg, error_code: err.error_code });
    }
    return TEXT[key] || TEXT.unknown;
  }

  /* ------------------------------------------------------------------- http */
  // Resolves {ok,status,data} or {ok:false,status,data,networkError}. Never rejects.
  function http(method, path, o) {
    o = o || {};
    var headers = { apikey: ANON, Accept: o.accept || 'application/json' };
    // anonymous: Bearer <anon key>. New-style publishable keys (sb_...) are not JWTs, so they travel in apikey only.
    var bearer = o.token || (/^sb_/i.test(ANON) ? '' : ANON);
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    var init = { method: method, headers: headers };
    if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    if (o.prefer) headers.Prefer = o.prefer;
    var ctl = null, timer = null;
    try { if (typeof AbortController === 'function') { ctl = new AbortController(); init.signal = ctl.signal; } } catch (e) { ctl = null; }
    if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) { /* ignore */ } }, TIMEOUT_MS);
    function done(x) { if (timer !== null) clearTimeout(timer); return x; }
    return Promise.resolve().then(function () { return fetch(BASE + path, init); }).then(function (res) {
      return Promise.resolve(res.text ? res.text() : '').then(function (txt) {
        var data = null;
        if (txt) { try { data = JSON.parse(txt); } catch (e) { data = { message: String(txt).slice(0, 200) }; } }
        return done({ ok: !!res.ok, status: res.status, data: data });
      });
    }).catch(function (e) {
      var aborted = e && e.name === 'AbortError';
      return done({ ok: false, status: 0, data: null, networkError: aborted ? 'timeout' : 'network' });
    });
  }

  function refresh(staleToken) {
    if (!state.session) return Promise.resolve(false);
    if (staleToken && state.session.access_token !== staleToken) return Promise.resolve(true);   // somebody already refreshed
    if (refreshing) return refreshing;
    var prev = state.session;
    refreshing = http('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: prev.refresh_token } })
      .then(function (r) {
        if (r.ok && isObj(r.data) && r.data.access_token) { setSession(buildSession(r.data, prev)); return true; }
        if (r.networkError || r.status >= 500 || r.status === 429) return false;   // temporary: keep the session
        dropSession('SIGNED_OUT');                                                // the refresh token was refused
        return false;
      })
      .then(function (v) { refreshing = null; return v; }, function () { refreshing = null; return false; });
    return refreshing;
  }
  function ensureFresh() {
    if (state.session && state.session.expires_at - now() < REFRESH_MARGIN) return refresh();
    return Promise.resolve(true);
  }
  // authenticated (or anon) request with one refresh-and-retry on 401
  function api(method, path, o) {
    o = o || {};
    return ensureFresh().then(function () {
      var tok = state.session ? state.session.access_token : null;
      return http(method, path, assign({ token: tok }, o)).then(function (r) {
        if (r.status === 401 && tok && state.session) {
          return refresh(tok).then(function (okr) {
            if (!okr || !state.session) return r;
            return http(method, path, assign({ token: state.session.access_token }, o));
          });
        }
        return r;
      });
    });
  }

  /* ----------------------------------------------------------- query helpers */
  var IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var COLKEY = /^[A-Za-z_][A-Za-z0-9_.>\-]*$/;
  function filterParts(filter) {
    var out = [];
    if (!isObj(filter)) return out;
    Object.keys(filter).forEach(function (k) {
      if (!COLKEY.test(k)) throw new Error('bad_filter_key');
      var v = filter[k];
      if (typeof v === 'number' || typeof v === 'boolean') v = 'eq.' + v;
      out.push(enc(k) + '=' + enc(v));
    });
    return out;
  }
  function badRequest(msg) { return { ok: false, error: 'bad_request', message: msg, code: '', hint: '', details: '', status: 0 }; }

  /* ------------------------------------------------------------------- auth */
  function redirectTarget() {
    if (typeof cfg.redirectTo === 'string' && cfg.redirectTo) return cfg.redirectTo;
    try {
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.origin + location.pathname;
    } catch (e) { /* ignore */ }
    return '';
  }
  function withRedirect(path) {
    var t = redirectTarget();
    return t ? path + (path.indexOf('?') < 0 ? '?' : '&') + 'redirect_to=' + enc(t) : path;
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function afterSignIn(event) {
    return loadProfile().then(function () { emit(event); });
  }

  function signUp(o) {
    if (!configured) return notConfigured();
    o = o || {};
    var email = String(o.email || '').trim();
    var password = String(o.password || '');
    if (!validEmail(email)) return Promise.resolve({ ok: false, error: 'invalid_email' });
    if (password.length < MIN_PASSWORD) return Promise.resolve({ ok: false, error: 'weak_password' });
    var role = ROLES[o.role] ? o.role : 'member';
    var body = { email: email, password: password, data: { full_name: String(o.fullName || '').trim().slice(0, 80), role: role } };
    return http('POST', withRedirect('/auth/v1/signup'), { body: body }).then(function (r) {
      if (!r.ok) { var f = failure(r); return { ok: false, error: f.error, message: f.message, status: f.status }; }
      if (isObj(r.data) && r.data.access_token) {
        setSession(buildSession(r.data, null));
        return afterSignIn('SIGNED_IN').then(function () { return { ok: true, needsConfirm: false }; });
      }
      return { ok: true, needsConfirm: true };
    });
  }

  function signIn(email, password) {
    if (!configured) return notConfigured();
    return http('POST', '/auth/v1/token?grant_type=password', { body: { email: String(email || '').trim(), password: String(password || '') } })
      .then(function (r) {
        if (!r.ok || !isObj(r.data) || !r.data.access_token) {
          var f = failure(r); return { ok: false, error: f.error, message: f.message, status: f.status };
        }
        setSession(buildSession(r.data, null));
        return afterSignIn('SIGNED_IN').then(function () { return { ok: true }; });
      });
  }

  function signOut() {
    var s = state.session;
    var p = Promise.resolve();
    if (configured && s) p = http('POST', '/auth/v1/logout?scope=local', { token: s.access_token });   // best effort
    return p.then(function () {
      var had = !!state.session;
      state.session = null; state.profile = null; writeStore(null);
      if (had) emit('SIGNED_OUT');
      return { ok: true };
    });
  }

  function resetPassword(email) {
    if (!configured) return notConfigured();
    email = String(email || '').trim();
    if (!validEmail(email)) return Promise.resolve({ ok: false, error: 'invalid_email' });
    return http('POST', withRedirect('/auth/v1/recover'), { body: { email: email } }).then(function (r) {
      if (!r.ok) { var f = failure(r); return { ok: false, error: f.error, message: f.message, status: f.status }; }
      return { ok: true };
    });
  }

  function updatePassword(newPassword) {
    if (!configured) return notConfigured();
    if (!state.session) return Promise.resolve({ ok: false, error: 'not_authenticated' });
    if (String(newPassword || '').length < MIN_PASSWORD) return Promise.resolve({ ok: false, error: 'weak_password' });
    return api('PUT', '/auth/v1/user', { body: { password: String(newPassword) } }).then(function (r) {
      if (!r.ok) { var f = failure(r); return { ok: false, error: f.error, message: f.message, status: f.status }; }
      return { ok: true };
    });
  }

  function loadProfile() {
    if (!configured || !state.session) return Promise.resolve(null);
    var id = state.session.user.id;
    return api('GET', '/rest/v1/profiles?select=id,email,full_name,role,phone&id=' + enc('eq.' + id),
      { accept: 'application/vnd.pgrst.object+json' }).then(function (r) {
      if (r.ok && isObj(r.data) && state.session && state.session.user.id === id) { state.profile = r.data; return r.data; }
      return null;
    });
  }

  /* ------------------------------------------------------------------- data */
  function q(table, opts) {
    if (!configured) return Promise.resolve(null);
    opts = opts || {};
    if (!IDENT.test(String(table))) return Promise.reject(toError(badRequest('bad_table')));
    var parts;
    try {
      parts = [];
      parts.push('select=' + enc(opts.select || '*'));
      parts = parts.concat(filterParts(opts.filter));
      if (opts.order) parts.push('order=' + enc(Array.isArray(opts.order) ? opts.order.join(',') : opts.order));
      if (opts.limit !== undefined && opts.limit !== null) parts.push('limit=' + Math.max(0, Math.floor(Number(opts.limit)) || 0));
      if (opts.offset) parts.push('offset=' + Math.max(0, Math.floor(Number(opts.offset)) || 0));
    } catch (e) { return Promise.reject(toError(badRequest('bad_filter'))); }
    return api('GET', '/rest/v1/' + table + '?' + parts.join('&'),
      { accept: opts.single ? 'application/vnd.pgrst.object+json' : 'application/json' }).then(function (r) {
      if (r.ok) return r.data === undefined ? null : r.data;
      var f = failure(r);
      if (opts.single && f.code === 'PGRST116') return null;       // exactly one row requested, none found
      throw toError(f);
    });
  }

  function writeResult(r) {
    if (r.ok) return { ok: true, data: r.data === undefined ? null : r.data, status: r.status };
    return failure(r);
  }

  function insert(table, rows, opts) {
    if (!configured) return notConfigured();
    opts = opts || {};
    if (!IDENT.test(String(table))) return Promise.resolve(badRequest('bad_table'));
    return api('POST', '/rest/v1/' + table, {
      body: rows, prefer: 'return=' + (opts.returning ? 'representation' : 'minimal'),
      accept: opts.returning && opts.single ? 'application/vnd.pgrst.object+json' : 'application/json'
    }).then(writeResult);
  }

  function update(table, filter, patch, opts) {
    if (!configured) return notConfigured();
    opts = opts || {};
    if (!IDENT.test(String(table))) return Promise.resolve(badRequest('bad_table'));
    var fp;
    try { fp = filterParts(filter); } catch (e) { return Promise.resolve(badRequest('bad_filter')); }
    if (!fp.length) return Promise.resolve({ ok: false, error: 'filter_required', message: '', code: '', hint: '', details: '', status: 0 });
    return api('PATCH', '/rest/v1/' + table + '?' + fp.join('&'), {
      body: patch, prefer: 'return=' + (opts.returning ? 'representation' : 'minimal')
    }).then(writeResult);
  }

  function remove(table, filter, opts) {
    if (!configured) return notConfigured();
    opts = opts || {};
    if (!IDENT.test(String(table))) return Promise.resolve(badRequest('bad_table'));
    var fp;
    try { fp = filterParts(filter); } catch (e) { return Promise.resolve(badRequest('bad_filter')); }
    if (!fp.length) return Promise.resolve({ ok: false, error: 'filter_required', message: '', code: '', hint: '', details: '', status: 0 });
    return api('DELETE', '/rest/v1/' + table + '?' + fp.join('&'), {
      prefer: 'return=' + (opts.returning ? 'representation' : 'minimal')
    }).then(writeResult);
  }

  function rpc(name, args) {
    if (!configured) return notConfigured();
    if (!IDENT.test(String(name))) return Promise.resolve(badRequest('bad_function'));
    return api('POST', '/rest/v1/rpc/' + name, { body: isObj(args) ? args : {} }).then(writeResult);
  }

  function getState() {
    return q('tournament_state', { select: 'state,updated_at', filter: { id: 'eq.1' }, single: true });
  }

  function publishState(st, prev) {
    if (!configured) return Promise.resolve({ ok: false, conflict: false, error: 'not_configured' });
    var p = prev === undefined || prev === null || prev === '' ? null : (Object.prototype.toString.call(prev) === '[object Date]' ? prev.toISOString() : String(prev));
    return rpc('publish_state', { state: st, prev: p }).then(function (r) {
      if (!r.ok) return { ok: false, conflict: false, error: r.error, message: r.message, status: r.status };
      var d = isObj(r.data) ? r.data : {};
      var out = { ok: d.ok === true, conflict: d.conflict === true, updated_at: d.updated_at || null };
      if (d.stripped) out.stripped = true;
      if (!out.ok && out.conflict) out.error = 'conflict';
      return out;
    });
  }

  /* ------------------------------------------------------------------- poll */
  function poll(fn, ms, opts) {
    var every = Number(ms) >= 1000 ? Number(ms) : 15000;
    var immediate = !(opts && opts.immediate === false);
    var stopped = false, timer = null, running = false;
    function visible() {
      try { return !(typeof document !== 'undefined' && (document.hidden === true || document.visibilityState === 'hidden')); } catch (e) { return true; }
    }
    function clear() { if (timer !== null) { clearTimeout(timer); timer = null; } }
    function schedule() {
      clear();
      if (stopped || !visible()) return;
      timer = setTimeout(tick, every);
    }
    function tick() {
      timer = null;
      if (stopped || !visible() || running) return;
      running = true;
      Promise.resolve().then(fn).catch(function () { /* the caller shows its own error */ }).then(function () {
        running = false;
        schedule();
      });
    }
    function onVisibility() {
      if (stopped) return;
      if (visible()) { clear(); tick(); } else clear();
    }
    try { if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVisibility); } catch (e) { /* ignore */ }
    if (immediate && visible()) tick(); else schedule();
    return function stop() {
      stopped = true;
      clear();
      try { if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', onVisibility); } catch (e) { /* ignore */ }
    };
  }

  function onAuth(cb) {
    if (typeof cb !== 'function') return function () {};
    listeners.push(cb);
    return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }

  /* ------------------------------------------------------------ public object */
  var YB = {
    version: 1,
    configured: configured,
    configProblem: configProblem,   // 'service_key' when a secret key was put in YB_CONFIG (refused)
    ready: Promise.resolve(),     // resolves after a sign-in / password-reset link in the URL was processed
    linkType: null,               // 'recovery' | 'signup' | ... when the page was opened from an e-mail link
    linkError: null,              // e.g. 'otp_expired' when the e-mail link was refused
    session: publicSession,
    onAuth: onAuth,
    signUp: signUp, signIn: signIn, signOut: signOut,
    resetPassword: resetPassword, updatePassword: updatePassword, loadProfile: loadProfile,
    q: q, insert: insert, update: update, remove: remove, rpc: rpc,
    getState: getState, publishState: publishState,
    poll: poll, errorText: errorText
  };

  /* ---------------------------------------------------------------- start up */
  if (configured) {
    state.session = readStore();

    try {   // keep several tabs in step
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('storage', function (e) {
          if (e && e.key !== null && e.key !== undefined && e.key !== STORE_KEY) return;
          var s = readStore();
          var same = (s && state.session && s.user.id === state.session.user.id);
          state.session = s;
          if (!same) state.profile = null;
          emit(s ? 'SIGNED_IN' : 'SIGNED_OUT');
        });
      }
    } catch (e) { /* ignore */ }

    // e-mail links (confirm sign-up / reset password) land here with tokens in the URL hash
    try {
      if (typeof location !== 'undefined' && location.hash && location.hash.length > 1) {
        var h = {};
        location.hash.slice(1).split('&').forEach(function (kv) {
          var i = kv.indexOf('=');
          if (i > 0) { try { h[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* skip */ } }
        });
        var clean = false;
        if (h.access_token && h.refresh_token) {
          clean = true;
          var tmp = { access_token: h.access_token, refresh_token: h.refresh_token,
            expires_at: Number(h.expires_at) || (now() + (Number(h.expires_in) || 3600)), user: { id: '', email: '' } };
          var type = h.type || 'signup';
          YB.linkType = type;
          YB.ready = http('GET', '/auth/v1/user', { token: tmp.access_token }).then(function (r) {
            if (r.ok && isObj(r.data) && r.data.id) {
              tmp.user = { id: r.data.id, email: r.data.email || '' };
              setSession(tmp);
              return afterSignIn(type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN');
            }
            YB.linkError = 'invalid_link';
            return null;
          }).catch(function () { YB.linkError = 'invalid_link'; });
        } else if (h.error || h.error_code) {
          clean = true;
          YB.linkError = h.error_code || h.error;
        }
        if (clean && typeof history !== 'undefined' && history.replaceState) {
          history.replaceState(null, '', location.pathname + location.search);   // tokens must not stay in the address bar
        }
      }
    } catch (e) { /* ignore */ }
  }

  window.YB = YB;
})();
