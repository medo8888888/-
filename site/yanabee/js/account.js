// account.html — حسابي: sign-up, login, password reset and one screen per role (admin, team leader, member, parent).
// Data layer = window.YB (js/yb-api.js, Supabase). Classic script (IIFE, no libraries). Contract: docs/YANABEE_APP.md.
// Privacy: a child's name is drawn only on the leader's, the member's own team's, the linked parent's and the admin's screens.
// Nothing here logs, puts a name or a token in a URL, or stores a token/password (yb-api.js keeps the session). The only
// storage written is the registration draft 'yanabee-reg-draft' (this device only, the same one js/register.js reads).
// Every piece of user data is put in the page with textContent, never as HTML.
(() => {
  'use strict';
  const YB = window.YB;
  const root = document.querySelector('[data-account-root]');
  if (!root) return;
  const live = document.querySelector('[data-live]');

  let DATA = { icons: {}, words: {} };
  try { DATA = JSON.parse(document.getElementById('acct-data').textContent) || DATA; } catch (e) { /* the page still works without the icons */ }
  const W = DATA.words || {};

  /* ------------------------------------------------------------------ constants (chrome) */
  const MIN = 5, MAX = 7, EXPECTED = 12, DRAFT_KEY = 'yanabee-reg-draft', POLL_MS = 20000;
  const STATUS = { draft: 'مسودة', submitted: 'مُرسَل للاعتماد', approved: 'معتمد', rejected: 'مرفوض' };
  const ROLE = { admin: 'الإدارة', leader: 'قائد الفريق', member: 'عضو', parent: 'ولي أمر' };
  const SESSION_ERRS = { jwt_expired: 1, not_authenticated: 1, session_expired: 1, refresh_token_not_found: 1 };
  const FOOT = { not_drawn: 'لم تُجرَ القرعة بعد', group: 'في دور المجموعات', tie: 'تساوٍ على صدارة المجموعة، ينتظر قرار اللجنة',
    qualified: 'متأهل إلى الدور النهائي', final: 'في الدور النهائي', first: 'المركز الأول', second: 'المركز الثاني', third: 'المركز الثالث', out: 'خرج من المنافسة' };
  const CHESS = { none: 'لم يبدأ بعد', r1: 'في الدور الأول', r2: 'في الدور الثاني', rr: 'في الدور الثالث', final: 'في المباراة النهائية',
    first: 'المركز الأول', second: 'المركز الثاني', third: 'المركز الثالث', out: 'خرج من المنافسة' };
  const CHESS_ROUND = { r1: 'الدور الأول', r2: 'الدور الثاني', rr: 'الدور الثالث', final: 'المباراة النهائية' };
  const STAGE = { group: 'دور المجموعات', final: 'الدور النهائي' };

  /* ------------------------------------------------------------------ tiny DOM helpers */
  let uidN = 0;
  const uid = p => `${p}-${++uidN}`;
  const PROPS = { value: 1, checked: 1, disabled: 1, hidden: 1, required: 1, selected: 1, readOnly: 1, tabIndex: 1, open: 1 };
  function h(tag, a, ...kids) {
    const e = document.createElement(tag);
    if (a) {
      for (const k in a) {
        const v = a[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (PROPS[k]) e[k] = v;
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    kids.flat(Infinity).forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function icon(name) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'i');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    // the paths are produced by the page builder from core.ICONS (not user data); they are parsed as SVG, never as page HTML
    try {
      const doc = new DOMParser().parseFromString('<svg xmlns="' + SVGNS + '">' + (DATA.icons[name] || '') + '</svg>', 'image/svg+xml');
      Array.from(doc.documentElement.childNodes).forEach(n => s.append(document.importNode(n, true)));
    } catch (e) { /* no icon is not an error */ }
    return s;
  }
  const btn = (label, ic, cls, onclick, extra) => h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || 'btn-ghost') + ' btn-sm', onclick }, extra || {}),
    ic ? icon(ic) : null, h('span', { text: label }));
  const say = msg => { if (!live) return; live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
  const digits = s => String(s || '').replace(/[^\d٠-٩۰-۹]/g, '');
  const telHref = s => 'tel:' + String(s || '').replace(/[^+\d]/g, '');
  const num = s => { const n = parseInt(String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); return Number.isFinite(n) ? n : null; };
  const nameKey = s => String(s || '').trim().replace(/\s+/g, ' ');
  const lower = s => String(s || '').toLowerCase();
  const isMinor = age => age === null || age === undefined || age < 18;
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ''; } };
  const chip = (text, tone) => h('span', { class: 'a-chip ' + (tone || ''), text });
  const statusChip = s => chip(STATUS[s] || s, { draft: 'muted', submitted: 'sun', approved: 'ok', rejected: 'bad' }[s]);

  /* ------------------------------------------------------------------ data helpers */
  async function read(table, opts) {
    try { return { ok: true, data: await YB.q(table, opts) }; } catch (e) { return { ok: false, error: e }; }
  }
  const wrote = r => !!(r && r.ok && (!Array.isArray(r.data) || r.data.length > 0));
  function errMsg(r, over) {
    const k = r && r.error;
    if (over && k && over[k]) return over[k];
    if (r && r.ok === true) return 'لم يُنفَّذ الإجراء. حدّث الصفحة وتحقق من حالة الفريق.';
    return YB.errorText(r);
  }
  function sessionLost(r) {
    const k = r && r.error;
    if (k && SESSION_ERRS[k] && YB.session()) { S.expired = true; YB.signOut(); return true; }
    return false;
  }

  /* ------------------------------------------------------------------ app state */
  const S = { seq: 0, uid: null, role: null, expired: false, manualOut: false, recoveryDone: false, stopPoll: null, rendered: null, modeSet: null, confirmedShown: false };
  const clearData = () => { A.teams = []; A.members = []; A.profiles = []; A.state = undefined; L.team = null; L.members = []; };

  function mount(node, focus) {
    root.replaceChildren(node);
    root.setAttribute('aria-busy', 'false');
    if (focus) {
      const f = node.querySelector('[data-focus]');
      if (f) f.focus({ preventScroll: true });
    }
  }
  function skeleton() { return h('div', { class: 'a-skel', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')); }
  function errorBlock(msg, retry) {
    return h('div', { class: 'a-card a-error', role: 'alert' }, icon('alert'), h('p', { text: msg }),
      retry ? btn('أعد المحاولة', 'repeat', 'btn-primary', retry) : null);
  }
  function banner(text, tone) {
    return h('div', { class: 'a-banner ' + (tone || ''), role: tone === 'bad' ? 'alert' : 'status' }, icon(tone === 'bad' ? 'alert' : 'check'), h('span', { text }));
  }

  /* ------------------------------------------------------------------ form pieces */
  function showErr(form, msg, focusEl) {
    let box = form.querySelector('.a-err');
    if (!box) { box = h('div', { class: 'a-err', role: 'alert' }); form.insertBefore(box, form.querySelector('.a-actions') || null); }
    box.textContent = msg || '';
    box.hidden = !msg;
    form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    if (msg && focusEl) { focusEl.setAttribute('aria-invalid', 'true'); focusEl.focus(); }
    if (msg) say(msg);
  }
  function field(o) {
    const id = uid('f'), hid = o.hint ? uid('h') : '';
    const attrs = { id, name: o.name, type: o.type || 'text', autocomplete: o.auto || 'off', required: !!o.required, 'aria-describedby': hid || null,
      maxlength: o.max || null, minlength: o.min || null, inputmode: o.mode || null, placeholder: o.placeholder || null,
      dir: o.dir || null, autocapitalize: o.cap || null, spellcheck: o.spell === false ? 'false' : null, value: o.value === undefined ? '' : o.value };
    if (o.type === 'number') { attrs.min = o.nmin; attrs.max = o.nmax; }
    const input = h('input', attrs);
    let control = input;
    if (o.type === 'password') {
      const tog = h('button', { type: 'button', class: 'a-pw-toggle', 'aria-pressed': 'false', 'aria-controls': id, 'aria-label': 'إظهار كلمة المرور' }, icon('eye'));
      tog.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        tog.setAttribute('aria-pressed', String(show));
        tog.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
      });
      control = h('span', { class: 'a-pw' }, input, tog);
    }
    const wrap = h('div', { class: 'a-f' + (o.cls ? ' ' + o.cls : '') },
      h('label', { for: id, class: 'a-l' }, o.label, o.required ? h('i', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null),
      control, o.hint ? h('small', { id: hid, class: 'a-hint', text: o.hint }) : null);
    wrap.input = input;
    return wrap;
  }
  const submitBtn = (label, ic) => h('button', { type: 'submit', class: 'btn btn-primary' }, ic ? icon(ic) : null, h('span', { text: label }));
  function bind(form, handler) {
    let busy = false;
    form.noValidate = true;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('button[type=submit]').forEach(b => { b.disabled = true; });
      try { await handler(); } catch (err) { showErr(form, YB.errorText(err)); } finally {
        busy = false;
        form.removeAttribute('aria-busy');
        form.querySelectorAll('button[type=submit]').forEach(b => { b.disabled = false; });
      }
    });
  }
  // a destructive button needs a second press within 5 seconds
  function armed(button, armedLabel, run) {
    const span = button.querySelector('span');
    const label = span.textContent;
    let timer = 0;
    const reset = () => { clearTimeout(timer); delete button.dataset.armed; span.textContent = label; };
    button.addEventListener('click', () => {
      if (button.dataset.armed) { reset(); run(); return; }
      button.dataset.armed = '1';
      span.textContent = armedLabel;
      say(armedLabel);
      timer = setTimeout(reset, 5000);
    });
    return button;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ------------------------------------------------------------------ demo (وضع تجريبي) + why sign up */
  // window.YBDemo (js/yb-demo.js) starts a tab-only demo with fake data and four fake users; account.js only asks it to start, switch or exit.
  const DEMO = window.YBDemo || null;
  const WHY = [
    ['users', 'قائد فريق', 'سجّل فريقك وأعضاءه في مكان واحد، واحصل على رمز انضمام تعطيه لأعضائك وأولياء أمورهم، وتابع حالة الاعتماد ثم المباريات والنتائج.'],
    ['user', 'عضو في فريق', 'انضم بالرمز الذي يعطيه لك قائد فريقك، وشاهد فريقك ومبارياتك ونتائجك وحالة موافقة ولي أمرك.'],
    ['hand-heart', 'ولي أمر', 'تابع فريق ابنك أو ابنتك، واطّلع على حالة الموافقة وجدول المباريات والنتائج.']];
  function whyCard() {
    const id = uid('why');
    return h('section', { class: 'a-card a-why', 'aria-labelledby': id },
      h('h3', { id, text: 'ليش تنشئ حسابًا؟' }),
      h('p', { class: 'a-lead', text: 'لكل دور شاشته الخاصة، وتتغيّر بحسب من تكون:' }),
      h('ul', { class: 'a-why-list' }, WHY.map(w => h('li', {}, h('span', { class: 'a-ico-s' }, icon(w[0])), h('div', {}, h('b', { text: w[1] }), h('p', { text: w[2] }))))),
      h('p', { class: 'a-why-pub' }, icon('chart'), h('span', {}, 'لا تحتاج حسابًا لمتابعة الترتيب العام. ', h('a', { href: 'tournament.html', text: 'افتح لوحة البطولة' }), '.')));
  }
  function demoCard() {
    if (!DEMO || !DEMO.canEnter()) return null;
    const id = uid('demo');
    const msg = h('p', { class: 'a-err', hidden: true, 'data-demo-err': '' });
    const go = key => () => { if (!DEMO.enter(key)) { msg.textContent = 'تعذّر بدء التجربة: يمنع المتصفح حفظ البيانات المؤقتة في هذه الصفحة.'; msg.hidden = false; say(msg.textContent); } };
    return h('section', { class: 'a-card a-demo', 'aria-labelledby': id },
      h('h3', { id, text: 'جرّبها قبل أن تسجّل' }),
      h('p', { class: 'a-lead', text: 'ادخل تجربة بحسابات وهمية وتنقّل بين الشاشات كما تشاء. البيانات وهمية وتُحفظ في هذا المتصفح فقط.' }),
      h('div', { class: 'a-demo-btns' },
        h('button', { type: 'button', class: 'a-demo-btn is-main', 'data-demo': 'leader', onclick: go('leader') }, icon('users'), h('b', { text: 'جرّب كقائد فريق' }), h('small', { text: 'لديك فريق مسودة فيه 5 أعضاء وهميين' })),
        h('button', { type: 'button', class: 'a-demo-btn', 'data-demo': 'member', onclick: go('member') }, icon('user'), h('b', { text: 'جرّب كعضو' }), h('small', { text: 'عضو منضمّ إلى فريق وهمي' })),
        h('button', { type: 'button', class: 'a-demo-btn', 'data-demo': 'parent', onclick: go('parent') }, icon('hand-heart'), h('b', { text: 'جرّب كولي أمر' }), h('small', { text: 'ولي أمر مرتبط بعضو في الفريق' }))),
      msg);
  }

  /* ------------------------------------------------------------------ unconfigured / fatal */
  function viewUnconfigured() {
    const problem = YB && YB.configProblem === 'service_key';
    if (DEMO) {   // no dead end: the honest line, why sign up, and the demo
      mount(h('div', { class: 'a-hub' },
        problem ? h('div', { class: 'a-banner bad', role: 'alert' }, icon('alert'), h('span', { text: 'تحذير: وُضع في ملف إعداد الموقع مفتاح سرّي يمنح صلاحيات الإدارة الكاملة، فعُطّل الاتصال حمايةً للبيانات. على مالك الموقع استبداله بالمفتاح العلني وإعادة نشر الموقع، وتغيير المفتاح السري لأنه ظهر علنًا.' })) : null,
        h('div', { class: 'a-card a-notice' }, icon('lock'), h('div', {},
          h('h2', { text: 'الحسابات غير مفعّلة بعد على هذا الموقع', tabindex: '-1', 'data-focus': '' }),
          h('p', { text: 'لم يربط مالك الموقع قاعدة البيانات بعد، فيفتح التسجيل الحقيقي بعد ربطها. باقي صفحات الموقع تعمل كما هي.' }),
          h('p', { class: 'a-notice-l' }, h('a', { href: 'register.html', text: 'استمارة التسجيل' }), ' · ', h('a', { href: 'index.html', text: 'الرئيسية' })))),
        demoCard(), whyCard()));
      return;
    }
    mount(h('div', { class: 'a-card a-center' },
      h('span', { class: 'a-ico' }, icon('lock')),
      h('h2', { text: 'الحسابات غير مفعّلة بعد على هذا الموقع', tabindex: '-1', 'data-focus': '' }),
      h('p', { text: 'لم يربط مالك الموقع قاعدة البيانات بعد، لذلك لا يمكن إنشاء حساب أو تسجيل الدخول الآن. باقي صفحات الموقع تعمل كما هي.' }),
      problem ? h('div', { class: 'a-banner bad', role: 'alert' }, icon('alert'), h('span', { text: 'تحذير: وُضع في ملف إعداد الموقع مفتاح سرّي يمنح صلاحيات الإدارة الكاملة، فعُطّل الاتصال حمايةً للبيانات. على مالك الموقع استبداله بالمفتاح العلني وإعادة نشر الموقع، وتغيير المفتاح السري لأنه ظهر علنًا.' })) : null,
      h('div', { class: 'btns center' },
        h('a', { class: 'btn btn-primary', href: 'tournament.html' }, icon('chart'), h('span', { text: 'لوحة البطولة' })),
        h('a', { class: 'btn btn-ghost', href: 'register.html' }, icon('file-text'), h('span', { text: 'استمارة التسجيل' })),
        h('a', { class: 'btn btn-ghost', href: 'index.html' }, icon('arrow-left'), h('span', { text: 'الرئيسية' })))));
  }

  /* ------------------------------------------------------------------ signed out */
  const roleCards = [
    ['leader', 'قائد فريق', 'users', 'تسجّل فريقك وتضيف أعضاءه وتحصل على رمز الانضمام.'],
    ['member', 'عضو في فريق', 'user', 'تنضم إلى فريقك برمز يعطيه لك القائد.'],
    ['parent', 'ولي أمر', 'hand-heart', 'تتابع ابنك أو ابنتك المشارك برمز الفريق.']];

  function viewSignedOut(opts) {
    opts = opts || {};
    const hashMode = () => (location.hash === '#signup' ? 'signup' : location.hash === '#reset' ? 'reset' : 'login');
    let mode = opts.mode || hashMode();
    const tabs = [], panels = {};
    const tabLogin = h('button', { type: 'button', role: 'tab', id: 'tab-login', 'aria-controls': 'panel-login', class: 'a-tab' }, icon('lock'), h('span', { text: 'دخول' }));
    const tabSign = h('button', { type: 'button', role: 'tab', id: 'tab-signup', 'aria-controls': 'panel-signup', class: 'a-tab' }, icon('user-check'), h('span', { text: 'حساب جديد' }));
    tabs.push(tabLogin, tabSign);
    const tablist = h('div', { role: 'tablist', 'aria-label': 'الدخول أو حساب جديد', class: 'a-tabs' }, tabLogin, tabSign);

    /* ---- login */
    const lEmail = field({ label: 'البريد الإلكتروني', name: 'email', type: 'email', auto: 'username', required: true, dir: 'ltr', spell: false, cap: 'none', mode: 'email' });
    const lPass = field({ label: 'كلمة المرور', name: 'password', type: 'password', auto: 'current-password', required: true, dir: 'ltr' });
    const forgot = h('button', { type: 'button', class: 'a-link', text: 'نسيت كلمة المرور؟', onclick: () => go('reset', true) });
    const loginForm = h('form', { class: 'a-form', 'aria-label': 'تسجيل الدخول' }, lEmail, lPass,
      h('div', { class: 'a-actions' }, submitBtn('دخول', 'check'), forgot));
    bind(loginForm, async () => {
      const email = lEmail.input.value.trim(), pass = lPass.input.value;
      if (!email) return showErr(loginForm, 'اكتب بريدك الإلكتروني.', lEmail.input);
      if (!pass) return showErr(loginForm, 'اكتب كلمة المرور.', lPass.input);
      showErr(loginForm, '');
      const r = await YB.signIn(email, pass);
      if (!r.ok) return showErr(loginForm, errMsg(r), r.error === 'invalid_credentials' ? lPass.input : null);
      lPass.input.value = ''; // the auth event (YB.onAuth) draws the role screen
    });

    /* ---- reset */
    const rEmail = field({ label: 'البريد الإلكتروني المسجّل', name: 'email', type: 'email', auto: 'email', required: true, dir: 'ltr', spell: false, cap: 'none', mode: 'email' });
    const resetDone = h('div', { class: 'a-banner ok', role: 'status', hidden: true }, icon('check'),
      h('span', { text: 'إن كان هذا البريد مسجّلًا لدينا فسيصله رابط لإعادة تعيين كلمة المرور خلال دقائق. تحقق من البريد المزعج أيضًا.' }));
    const resetForm = h('form', { class: 'a-form', 'aria-label': 'إعادة تعيين كلمة المرور', hidden: true },
      h('p', { class: 'a-lead', text: 'اكتب بريدك وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.' }), rEmail,
      h('div', { class: 'a-actions' }, submitBtn('أرسل الرابط', 'send'), h('button', { type: 'button', class: 'a-link', text: 'العودة إلى الدخول', onclick: () => go('login', true) })));
    bind(resetForm, async () => {
      const email = rEmail.input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr(resetForm, YB.errorText('invalid_email'), rEmail.input);
      showErr(resetForm, '');
      const r = await YB.resetPassword(email);
      // the answer never says whether the e-mail exists: only transport/limit problems are reported
      if (!r.ok && ['network', 'timeout', 'over_request_rate_limit', 'over_email_send_rate_limit', 'server_error', 'not_configured'].includes(r.error)) return showErr(resetForm, errMsg(r));
      resetForm.hidden = true;
      resetDone.hidden = false;
      say(resetDone.textContent);
    });

    const loginPanel = h('div', { role: 'tabpanel', id: 'panel-login', 'aria-labelledby': 'tab-login', class: 'a-panel' },
      h('h2', { class: 'a-h', text: 'مرحبًا بعودتك', tabindex: '-1', 'data-focus': '' }), loginForm, resetForm, resetDone);

    /* ---- sign up */
    const sName = field({ label: 'الاسم الكامل', name: 'name', auto: 'name', required: true, max: 80, hint: 'اكتبه كما تريد أن يظهر لقائد فريقك.' });
    const sEmail = field({ label: 'البريد الإلكتروني', name: 'email', type: 'email', auto: 'email', required: true, dir: 'ltr', spell: false, cap: 'none', mode: 'email' });
    const sPass = field({ label: 'كلمة المرور', name: 'password', type: 'password', auto: 'new-password', required: true, min: 8, dir: 'ltr', hint: '8 أحرف على الأقل.' });
    const legend = uid('lg');
    const radios = roleCards.map(([val, title, ic, desc]) => {
      const input = h('input', { type: 'radio', name: 'role', value: val, required: true });
      return h('label', { class: 'a-role' }, input, h('span', { class: 'a-role-b' }, h('span', { class: 'a-role-i' }, icon(ic)), h('b', { text: title }), h('small', { text: desc })));
    });
    const roleSet = h('fieldset', { class: 'a-roles', 'aria-describedby': legend }, h('legend', { class: 'a-l', id: legend, text: 'نوع الحساب' }), h('div', { class: 'a-role-grid' }, radios));
    const notice = h('p', { class: 'a-privacy' }, icon('shield'), h('span', {},
      W.consentNote ? W.consentNote + ' ' : '', 'تبقى هذه الموافقة الورقية مطلوبة مع الحساب: ', h('a', { href: 'register.html#c-consent', text: W.consentTitle || 'موافقة ولي الأمر' }),
      '. وما يظهر للعموم هو أسماء الفرق المعتمدة فقط.'));
    const signForm = h('form', { class: 'a-form', 'aria-label': 'إنشاء حساب جديد' }, sName, sEmail, sPass, roleSet, notice,
      h('div', { class: 'a-actions' }, submitBtn('إنشاء الحساب', 'user-check')));
    const signDone = h('div', { class: 'a-done', role: 'status', hidden: true });
    bind(signForm, async () => {
      const name = nameKey(sName.input.value), email = sEmail.input.value.trim(), pass = sPass.input.value;
      const role = (signForm.querySelector('input[name=role]:checked') || {}).value;
      if (name.length < 2) return showErr(signForm, 'اكتب اسمك الكامل (حرفان على الأقل).', sName.input);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr(signForm, YB.errorText('invalid_email'), sEmail.input);
      if (pass.length < 8) return showErr(signForm, YB.errorText('weak_password'), sPass.input);
      if (!role) return showErr(signForm, 'اختر نوع الحساب: قائد فريق أو عضو أو ولي أمر.', radios[0].querySelector('input'));
      showErr(signForm, '');
      const r = await YB.signUp({ email, password: pass, fullName: name, role });
      if (!r.ok) return showErr(signForm, errMsg(r), r.error === 'user_already_exists' ? sEmail.input : null);
      sPass.input.value = '';
      if (r.needsConfirm) {
        signForm.hidden = true;
        signDone.replaceChildren(icon('check'), h('div', {}, h('b', { text: 'تم إنشاء حسابك' }),
          h('p', { text: 'أرسلنا رسالة تأكيد إلى بريدك. افتحها ثم عد إلى هنا وسجّل الدخول. تحقق من البريد المزعج إن لم تصل.' }),
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => go('login', true) }, icon('lock'), h('span', { text: 'الذهاب إلى الدخول' }))));
        signDone.hidden = false;
        say('تم إنشاء حسابك. افتح رسالة التأكيد في بريدك ثم سجّل الدخول.');
      }
    });
    const signPanel = h('div', { role: 'tabpanel', id: 'panel-signup', 'aria-labelledby': 'tab-signup', class: 'a-panel', hidden: true },
      h('h2', { class: 'a-h', text: 'حساب جديد', tabindex: '-1', 'data-focus': '' }), signForm, signDone);
    panels.login = loginPanel;
    panels.signup = signPanel;

    function show(m, focus) {
      mode = m;
      const signup = m === 'signup';
      tabLogin.setAttribute('aria-selected', String(!signup));
      tabSign.setAttribute('aria-selected', String(signup));
      tabLogin.tabIndex = signup ? -1 : 0;
      tabSign.tabIndex = signup ? 0 : -1;
      loginPanel.hidden = signup;
      signPanel.hidden = !signup;
      loginForm.hidden = m === 'reset';
      resetForm.hidden = m !== 'reset' || !resetDone.hidden;
      if (m !== 'reset') { resetDone.hidden = true; }
      if (focus) {
        const target = signup ? sName.input : m === 'reset' ? rEmail.input : lEmail.input;
        target.focus({ preventScroll: true });
      }
    }
    let wantFocus = false;
    function go(m, focus) {
      wantFocus = !!focus;
      const want = '#' + m;
      if (location.hash !== want) location.hash = m; // hashchange does the rest
      else { show(m, wantFocus); wantFocus = false; }
    }
    tabLogin.addEventListener('click', () => go('login', false));
    tabSign.addEventListener('click', () => go('signup', false));
    tabs.forEach((tab, i) => tab.addEventListener('keydown', e => {
      let j = null;
      if (e.key === 'ArrowLeft') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowRight') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); tabs[j].focus(); go(j === 0 ? 'login' : 'signup', false); }
    }));
    S.modeSet = m => { show(m, wantFocus); wantFocus = false; };

    const top = [];
    if (opts.notice) top.push(banner(opts.notice, opts.tone || 'ok'));
    if (YB.linkError) {
      top.push(banner(YB.linkError === 'otp_expired' ? YB.errorText('otp_expired') : 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من «نسيت كلمة المرور».', 'bad'));
      YB.linkError = null; // shown once
    }
    mount(h('div', { class: 'a-auth a-auth-2' }, top, h('div', { class: 'a-card a-forms' }, tablist, loginPanel, signPanel), demoCard(), whyCard()));
    show(mode, false);
    if (opts.focus) show(mode, true);
    say(opts.notice || '');
  }

  /* ------------------------------------------------------------------ recovery link: choose a new password */
  function viewRecovery() {
    const p1 = field({ label: 'كلمة المرور الجديدة', name: 'password', type: 'password', auto: 'new-password', required: true, min: 8, dir: 'ltr', hint: '8 أحرف على الأقل.' });
    const p2 = field({ label: 'أعد كتابة كلمة المرور', name: 'confirm', type: 'password', auto: 'new-password', required: true, dir: 'ltr' });
    const form = h('form', { class: 'a-form', 'aria-label': 'كلمة مرور جديدة' }, p1, p2, h('div', { class: 'a-actions' }, submitBtn('حفظ كلمة المرور', 'check')));
    bind(form, async () => {
      if (p1.input.value.length < 8) return showErr(form, YB.errorText('weak_password'), p1.input);
      if (p1.input.value !== p2.input.value) return showErr(form, 'كلمتا المرور غير متطابقتين.', p2.input);
      showErr(form, '');
      const r = await YB.updatePassword(p1.input.value);
      if (!r.ok) { if (sessionLost(r)) return; return showErr(form, errMsg(r), p1.input); }
      p1.input.value = ''; p2.input.value = '';
      S.recoveryDone = true;
      S.flash = 'تم تغيير كلمة المرور.';
      route({ focus: true });
    });
    mount(h('div', { class: 'a-auth' }, h('div', { class: 'a-card' }, h('h2', { class: 'a-h', text: 'اختر كلمة مرور جديدة', tabindex: '-1', 'data-focus': '' }),
      h('p', { class: 'a-lead', text: 'جاء بك رابط إعادة التعيين. اكتب كلمة المرور الجديدة لحسابك.' }), form)), true);
  }

  /* ------------------------------------------------------------------ signed-in frame */
  function shell(profile) {
    const initial = (profile.full_name || profile.email || '?').trim().charAt(0) || '?';
    const pwWrap = h('div', { class: 'a-card a-pwbox', hidden: true });
    const p1 = field({ label: 'كلمة المرور الجديدة', name: 'password', type: 'password', auto: 'new-password', required: true, min: 8, dir: 'ltr', hint: '8 أحرف على الأقل.' });
    const p2 = field({ label: 'أعد كتابتها', name: 'confirm', type: 'password', auto: 'new-password', required: true, dir: 'ltr' });
    const pwForm = h('form', { class: 'a-form', 'aria-label': 'تغيير كلمة المرور' }, p1, p2,
      h('div', { class: 'a-actions' }, submitBtn('حفظ', 'check'), h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => toggle(false) })));
    pwWrap.append(h('h3', { text: 'تغيير كلمة المرور' }), pwForm);
    bind(pwForm, async () => {
      if (p1.input.value.length < 8) return showErr(pwForm, YB.errorText('weak_password'), p1.input);
      if (p1.input.value !== p2.input.value) return showErr(pwForm, 'كلمتا المرور غير متطابقتين.', p2.input);
      showErr(pwForm, '');
      const r = await YB.updatePassword(p1.input.value);
      if (!r.ok) { if (sessionLost(r)) return; return showErr(pwForm, errMsg(r), p1.input); }
      p1.input.value = ''; p2.input.value = '';
      toggle(false);
      flash.replaceChildren(banner('تم تغيير كلمة المرور.', 'ok'));
      say('تم تغيير كلمة المرور.');
    });
    const flash = h('div', { class: 'a-flash' });
    const pwBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', onclick: () => toggle(pwWrap.hidden) }, icon('lock'), h('span', { text: 'تغيير كلمة المرور' }));
    function toggle(open) {
      pwWrap.hidden = !open;
      pwBtn.setAttribute('aria-expanded', String(open));
      if (open) p1.input.focus(); else pwBtn.focus();
    }
    const outBtn = btn(DEMO && DEMO.active ? 'خروج من التجربة' : 'خروج', 'x', 'btn-ghost', async () => {
      outBtn.disabled = true;
      if (DEMO && DEMO.active) { DEMO.exit(); return; }
      S.manualOut = true;
      await YB.signOut();
    });
    const body = h('div', { class: 'a-body' });
    const roleName = ROLE[profile.role] || 'عضو';
    const head = h('header', { class: 'a-head a-card' },
      h('span', { class: 'a-avatar', 'aria-hidden': 'true', text: initial }),
      h('div', { class: 'a-who' },
        h('h2', { text: profile.full_name || 'حسابي', tabindex: '-1', 'data-focus': '' }),
        h('div', { class: 'a-who-m' }, h('span', { class: 'a-badge r-' + profile.role, text: roleName }), h('small', { class: 'a-mail', dir: 'ltr', text: profile.email || '' }))),
      h('div', { class: 'a-head-b' }, pwBtn, outBtn));
    const el = h('div', { class: 'a-app a-role-' + profile.role }, head, pwWrap, flash, body);
    if (S.flash) { flash.append(banner(S.flash, 'ok')); say(S.flash); S.flash = ''; }
    return { el, body, flash };
  }

  /* ------------------------------------------------------------------ schedule / results (tournament state) */
  function nameOf(state, id) { const t = (state.teams || []).find(x => x.id === id); return t ? t.name : '—'; }
  function scheduleBox(team) {
    const body = h('div', { class: 'a-sched-b' }, skeleton());
    const box = h('section', { class: 'a-card a-sched', 'aria-label': 'الجدول والنتائج: ' + team.name }, h('h3', {}, icon('calendar'), h('span', { text: team.name ? 'الجدول والنتائج · ' + team.name : 'الجدول والنتائج' })), body);
    let last = '';
    return {
      node: box,
      update(row) {
        const old = body.querySelector('.a-sched-err');
        if (old) old.remove();
        const key = row === null ? 'none' : (row && row.updated_at) || 'x';
        if (key === last && last !== '') return;
        last = key;
        body.replaceChildren(drawSchedule(row, team));
      },
      fail() { if (!body.querySelector('.a-sched-err')) body.append(h('p', { class: 'a-sched-err a-hint', text: 'تعذّر تحديث الجدول الآن، وسنعيد المحاولة تلقائيًا.' })); }
    };
  }
  function drawSchedule(row, team) {
    const empty = msg => h('p', { class: 'a-empty', text: msg });
    if (!row || !row.state) return empty('لم تُنشر بيانات البطولة بعد. سيظهر هنا جدول فريقك ونتائجه عند نشرها.');
    if (!window.YTour) return empty('تعذّر عرض الجدول على هذه الصفحة. افتح لوحة البطولة لمتابعة النتائج.');
    const st = row.state;
    const t = (st.teams || []).find(x => x.id === team.id) || (st.teams || []).find(x => x.name === team.name);
    if (!t) return empty('فريقك غير مُدرج في لوحة البطولة بعد.');
    let v;
    try { v = window.YTour.teamView(st, t.id); } catch (e) { return empty('تعذّر قراءة بيانات البطولة الآن.'); }
    const out = h('div', { class: 'a-sched-in' });
    // football
    const fb = h('div', { class: 'a-sport' }, h('h4', { text: W.football || 'كرة القدم' }), h('p', { class: 'a-state', text: FOOT[v.status] || '' }));
    if (v.group !== null && v.row) {
      const r = v.row;
      fb.append(h('p', { class: 'a-sub', text: `المجموعة ${v.groupName} · المركز ${v.position}` }),
        h('ul', { class: 'a-stats', 'aria-label': 'ترتيب الفريق' }, [['النقاط', r.pts], ['لعب', r.p], ['فوز', r.w], ['تعادل', r.d], ['خسارة', r.l], ['له', r.gf], ['عليه', r.ga], ['الفارق', r.gd]]
          .map(([k, val]) => h('li', {}, h('b', { text: String(val) }), h('span', { text: k })))));
    }
    if (v.matches.length) {
      fb.append(h('ul', { class: 'a-matches' }, v.matches.map(m => {
        let res = 'لم تُلعب بعد';
        let tone = '';
        if (m.played && m.result) {
          res = `${m.result.gf} – ${m.result.ga} · ${{ W: 'فوز', L: 'خسارة', D: 'تعادل' }[m.result.outcome]}`;
          tone = { W: 'ok', L: 'bad', D: 'sun' }[m.result.outcome];
        }
        return h('li', { class: 'a-match' },
          h('span', { class: 'a-m-t', text: `${STAGE[m.stage] || ''} · الجولة ${m.round}` }),
          h('b', { class: 'a-m-o', text: 'ضد ' + nameOf(st, m.opponent) }),
          h('span', { class: 'a-m-r ' + tone, text: res }),
          m.date || m.time ? h('span', { class: 'a-m-d', text: [m.date, m.time].filter(Boolean).join(' · ') }) : null,
          m.result && m.result.adm ? chip('نتيجة إدارية', 'sun') : null);
      })));
    } else if (v.group === null) fb.append(h('p', { class: 'a-hint', text: 'تظهر المباريات بعد القرعة.' }));
    out.append(fb);
    // chess (no player names, ever)
    const cv = v.chess || { stage: 'none', matches: [] };
    const ch = h('div', { class: 'a-sport' }, h('h4', { text: W.chess || 'الشطرنج' }), h('p', { class: 'a-state', text: CHESS[cv.stage] || '' }));
    if (cv.matches.length) {
      ch.append(h('ul', { class: 'a-matches' }, cv.matches.map(m => h('li', { class: 'a-match' },
        h('span', { class: 'a-m-t', text: CHESS_ROUND[m.round] || '' }),
        h('b', { class: 'a-m-o', text: 'ضد ' + nameOf(st, m.opponent) }),
        h('span', { class: 'a-m-r ' + (m.won === true ? 'ok' : m.won === false ? 'bad' : ''), text: m.won === true ? 'فاز فريقك' : m.won === false ? 'فاز الخصم' : 'لم تُلعب بعد' })))));
    }
    out.append(ch);
    return out;
  }
  function startSchedule(boxes) {
    stopPoll();
    if (!boxes.length) return;
    S.stopPoll = YB.poll(async () => {
      let row;
      try { row = await YB.getState(); } catch (e) { boxes.forEach(b => b.fail()); return; }
      boxes.forEach(b => b.update(row || null));
    }, POLL_MS);
  }
  function stopPoll() { if (S.stopPoll) { S.stopPoll(); S.stopPoll = null; } }

  /* ------------------------------------------------------------------ ADMIN */
  const A = { teams: [], members: [], profiles: [], state: undefined, tab: 'teams', filter: 'all', q: '', open: {}, notes: {}, pq: '', roleDraft: {}, body: null, me: null };

  async function loadAdmin() {
    const [t, m, p] = await Promise.all([
      read('teams', { select: 'id,name,area,status,admin_note,leader_id,created_at,updated_at', order: 'created_at.desc' }),
      read('team_members', { select: 'id,team_id,full_name,age,guardian_name,guardian_phone,is_leader,user_id,consent_status,consent_at,created_at', order: 'created_at.asc' }),
      read('profiles', { select: 'id,email,full_name,role,phone,created_at', order: 'created_at.desc' })]);
    for (const r of [t, m, p]) if (!r.ok) return r;
    A.teams = t.data || []; A.members = m.data || []; A.profiles = p.data || [];
    return { ok: true };
  }
  const membersOf = id => A.members.filter(m => m.team_id === id).sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0));
  const leaderName = t => { const m = membersOf(t.id).find(x => x.is_leader); const p = A.profiles.find(x => x.id === t.leader_id); return (p && p.full_name) || (m && m.full_name) || '—'; };

  async function viewAdmin(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    A.me = profile.id;
    mount(sh.el, S.focusNext);
    const r = await loadAdmin();
    if (seq !== S.seq) return;
    if (!r.ok) {
      if (sessionLost(r.error)) return;
      sh.body.replaceChildren(errorBlock(YB.errorText(r.error), () => { sh.body.replaceChildren(skeleton()); route(); }));
      return;
    }
    A.body = sh.body;
    drawAdmin();
  }

  function counters() {
    const c = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    A.teams.forEach(t => { if (c[t.status] !== undefined) c[t.status]++; });
    const tiles = [['all', 'كل الفرق', A.teams.length]].concat(Object.keys(STATUS).map(k => [k, STATUS[k], c[k]]));
    return h('ul', { class: 'a-counters', 'aria-label': 'عدد الفرق حسب الحالة' }, tiles.map(([k, label, n]) => h('li', {},
      h('button', { type: 'button', class: 'a-count s-' + k, 'aria-pressed': String(A.filter === k), 'data-fk': 'count-' + k, onclick: () => { A.filter = k; A.tab = 'teams'; drawAdmin('count-' + k); } },
        h('b', { text: String(n) }), h('span', { text: label })))));
  }
  function adminTabs() {
    const defs = [['teams', 'الفرق', 'users'], ['people', 'الأشخاص', 'user'], ['tour', 'لوحة البطولة', 'trophy'], ['export', 'تصدير', 'file-text']];
    const list = h('div', { role: 'tablist', 'aria-label': 'أقسام الإدارة', class: 'a-tabs a-tabs-4' });
    const els = defs.map(([k, label, ic], i) => {
      const on = A.tab === k;
      const b = h('button', { type: 'button', role: 'tab', id: 'at-' + k, 'aria-controls': 'ap-' + k, 'aria-selected': String(on), tabIndex: on ? 0 : -1, class: 'a-tab', 'data-fk': 'tab-' + k,
        onclick: () => { A.tab = k; drawAdmin('tab-' + k); },
        onkeydown: e => {
          let j = null;
          if (e.key === 'ArrowLeft') j = (i + 1) % defs.length; else if (e.key === 'ArrowRight') j = (i - 1 + defs.length) % defs.length;
          else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = defs.length - 1;
          if (j !== null) { e.preventDefault(); A.tab = defs[j][0]; drawAdmin('tab-' + defs[j][0]); }
        } }, icon(ic), h('span', { text: label }));
      return b;
    });
    list.append(...els);
    return list;
  }
  function drawAdmin(focusKey) {
    const keep = focusKey || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : '');
    const panel = h('div', { role: 'tabpanel', id: 'ap-' + A.tab, 'aria-labelledby': 'at-' + A.tab, class: 'a-panel' });
    if (A.tab === 'teams') drawAdminTeams(panel);
    else if (A.tab === 'people') drawAdminPeople(panel);
    else if (A.tab === 'tour') drawAdminTour(panel);
    else drawAdminExport(panel);
    A.body.replaceChildren(counters(), adminTabs(), panel);
    if (keep) { const f = A.body.querySelector(`[data-fk="${CSS.escape(keep)}"]`); if (f) f.focus({ preventScroll: true }); }
  }

  /* --- teams */
  function drawAdminTeams(panel) {
    const list = h('div', { class: 'a-list', 'aria-live': 'polite' });
    const fill = () => {
      const q = lower(A.q.trim());
      const rows = A.teams.filter(t => (A.filter === 'all' || t.status === A.filter)
        && (!q || lower(t.name).includes(q) || lower(t.area).includes(q) || lower(leaderName(t)).includes(q)));
      list.replaceChildren(...(rows.length ? rows.map(adminTeamCard) : [h('p', { class: 'a-empty', text: A.teams.length ? 'لا توجد فرق تطابق البحث.' : 'لم يُسجَّل أي فريق بعد.' })]));
    };
    const search = h('input', { type: 'search', class: 'a-search', placeholder: 'ابحث باسم الفريق أو القائد أو الحي', 'aria-label': 'ابحث باسم الفريق أو القائد أو الحي', value: A.q, autocomplete: 'off', 'data-fk': 'search',
      oninput: e => { A.q = e.target.value; fill(); } });
    panel.append(h('div', { class: 'a-toolbar' }, h('span', { class: 'a-search-w' }, icon('search'), search),
      btn('تحديث', 'repeat', 'btn-ghost', () => refreshAdmin('تم تحديث القائمة.'), { 'data-fk': 'refresh' })), list);
    fill();
  }
  async function refreshAdmin(msg, fk) {
    const r = await loadAdmin();
    if (!r.ok) { if (!sessionLost(r.error)) say(YB.errorText(r.error)); return false; }
    drawAdmin(fk);
    if (msg) say(msg);
    return true;
  }
  function adminTeamCard(t) {
    const ms = membersOf(t.id);
    const minors = ms.filter(m => isMinor(m.age));
    const pending = minors.filter(m => m.consent_status !== 'received').length;
    const open = !!A.open[t.id];
    const bodyId = 'tb-' + t.id;
    const head = h('button', { type: 'button', class: 'a-team-h', 'aria-expanded': String(open), 'aria-controls': bodyId, 'data-fk': 'th-' + t.id,
      onclick: () => { A.open[t.id] = !A.open[t.id]; drawAdmin('th-' + t.id); } },
      h('span', { class: 'a-team-t' }, h('b', { text: t.name }), h('small', { text: [t.area, `القائد: ${leaderName(t)}`].filter(Boolean).join(' · ') })),
      h('span', { class: 'a-team-m' }, statusChip(t.status), h('small', { text: `${ms.length} من ${MAX} أعضاء · موافقات مستلمة ${minors.length - pending} من ${minors.length}` })),
      icon('chevron-down'));
    const card = h('article', { class: 'a-team' + (open ? ' open' : ''), 'data-team': t.id }, head);
    const body = h('div', { class: 'a-team-b', id: bodyId, hidden: !open });
    if (open) {
      if (t.admin_note) body.append(h('p', { class: 'a-note', 'aria-label': 'ملاحظة الإدارة' }, h('b', { text: 'ملاحظة الإدارة: ' }), t.admin_note));
      const warn = [];
      if (ms.length < MIN || ms.length > MAX) warn.push(`عدد الأعضاء ${ms.length}؛ المطلوب من ${MIN} إلى ${MAX} شاملًا القائد.`);
      if (pending) warn.push(`موافقات أولياء الأمور المستلمة ${minors.length - pending} من ${minors.length}.`);
      if (warn.length) body.append(h('ul', { class: 'a-warn' }, warn.map(w => h('li', {}, icon('alert'), h('span', { text: w })))));
      body.append(h('ul', { class: 'a-roster' }, ms.map(m => adminMember(m, t))));
      body.append(decisionBar(t));
    }
    card.append(body);
    return card;
  }
  function adminMember(m, t) {
    const sw = consentSwitch(m, async received => {
      const r = await YB.rpc('mark_consent', { member_id: m.id, received });
      if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return false; }
      await refreshAdmin(received ? 'سُجّلت موافقة ولي الأمر.' : 'أُلغي تسجيل الموافقة.');
      return true;
    }, 'sw-' + m.id);
    return h('li', { class: 'a-mem' },
      h('div', { class: 'a-mem-h' }, h('b', { text: m.full_name }), m.is_leader ? chip('قائد', 'brand') : null, isMinor(m.age) ? chip('قاصر', 'muted') : null, m.user_id ? chip('حساب مرتبط', 'ok') : null),
      h('dl', { class: 'a-dl' },
        h('div', {}, h('dt', { text: W.age || 'العمر' }), h('dd', { text: m.age === null || m.age === undefined ? '—' : String(m.age) })),
        h('div', {}, h('dt', { text: W.guardianName || 'اسم ولي الأمر' }), h('dd', { text: m.guardian_name || '—' })),
        h('div', {}, h('dt', { text: W.guardianPhone || 'رقم الهاتف' }), h('dd', {}, m.guardian_phone ? h('a', { href: telHref(m.guardian_phone), dir: 'ltr', text: m.guardian_phone }) : '—'))),
      sw);
  }
  function consentSwitch(m, onChange, fk) {
    const cb = h('input', { type: 'checkbox', role: 'switch', checked: m.consent_status === 'received', 'data-fk': fk });
    cb.addEventListener('change', async () => {
      const want = cb.checked;
      cb.disabled = true;
      const ok = await onChange(want);
      cb.disabled = false;
      if (ok === false) cb.checked = !want;
      const again = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (again) again.focus({ preventScroll: true });
    });
    return h('label', { class: 'a-sw' }, cb, h('span', { class: 'a-sw-t', text: 'استُلمت موافقة ولي الأمر' }));
  }
  function decisionBar(t) {
    const idn = uid('note');
    const note = h('textarea', { id: idn, class: 'a-note-in', rows: 2, maxlength: 500, placeholder: 'تظهر لقائد الفريق مع القرار', value: A.notes[t.id] || '', oninput: e => { A.notes[t.id] = e.target.value; } });
    const st = t.status;
    const act = async (fn, okMsg) => {
      if (bar.dataset.busy) return; // one decision at a time
      bar.dataset.busy = '1';
      const r = await fn();
      if (!(r.ok && (!Array.isArray(r.data) || r.data.length))) { delete bar.dataset.busy; if (!sessionLost(r)) say(errMsg(r)); return; }
      delete A.notes[t.id];
      await refreshAdmin(okMsg, 'th-' + t.id);
    };
    const noteVal = () => (note.value.trim() || null);
    const approve = btn('اعتماد', 'check', 'btn-primary', () => act(() => YB.rpc('approve_team', { team_id: t.id, ok: true, note: noteVal() }), `اعتُمد فريق ${t.name}.`), { 'data-fk': 'ap-' + t.id });
    const reject = armed(btn('رفض', 'x', 'btn-ghost btn-danger', () => {}, { 'data-fk': 'rj-' + t.id }), 'اضغط مرة أخرى لتأكيد الرفض', () => act(() => YB.rpc('approve_team', { team_id: t.id, ok: false, note: noteVal() }), `رُفض فريق ${t.name}.`));
    const reopen = btn('إعادة فتح', 'repeat', 'btn-ghost', () => act(() => YB.update('teams', { id: 'eq.' + t.id }, { status: 'draft' }, { returning: true }), `أُعيد فتح فريق ${t.name} للتعديل.`), { 'data-fk': 'ro-' + t.id });
    approve.disabled = !(st === 'submitted' || st === 'rejected');
    reject.disabled = !(st === 'submitted' || st === 'approved');
    reopen.disabled = st === 'draft';
    const bar = h('div', { class: 'a-decide' },
      h('label', { for: idn, class: 'a-l', text: 'ملاحظة للقائد (اختيارية)' }), note,
      h('div', { class: 'a-actions' }, approve, reject, reopen),
      st === 'draft' ? h('small', { class: 'a-hint', text: 'ما زال الفريق مسودة: لم يرسله قائده للاعتماد بعد.' }) : null);
    return bar;
  }

  /* --- people */
  function drawAdminPeople(panel) {
    const roles = { admin: 0, leader: 0, member: 0, parent: 0 };
    A.profiles.forEach(p => { if (roles[p.role] !== undefined) roles[p.role]++; });
    const list = h('div', { class: 'a-list', 'aria-live': 'polite' });
    const fill = () => {
      const q = lower(A.pq.trim());
      const rows = A.profiles.filter(p => !q || lower(p.full_name).includes(q) || lower(p.email).includes(q));
      list.replaceChildren(...(rows.length ? rows.map(personRow) : [h('p', { class: 'a-empty', text: 'لا توجد حسابات تطابق البحث.' })]));
    };
    const search = h('input', { type: 'search', class: 'a-search', placeholder: 'ابحث بالاسم أو البريد', 'aria-label': 'ابحث بالاسم أو البريد', value: A.pq, autocomplete: 'off', oninput: e => { A.pq = e.target.value; fill(); } });
    panel.append(
      h('ul', { class: 'a-rolecount', 'aria-label': 'عدد الحسابات حسب الدور' }, Object.keys(roles).map(k => h('li', {}, h('b', { text: String(roles[k]) }), h('span', { text: ROLE[k] })))),
      h('div', { class: 'a-toolbar' }, h('span', { class: 'a-search-w' }, icon('search'), search)), list);
    fill();
  }
  function personRow(p) {
    const row = h('article', { class: 'a-person' },
      h('div', { class: 'a-person-i' }, h('b', { text: p.full_name || '(بلا اسم)' }), h('small', { dir: 'ltr', text: p.email || '' })),
      h('span', { class: 'a-badge r-' + p.role, text: ROLE[p.role] || p.role }));
    if (p.id === A.me) row.append(chip('أنت', 'brand'));
    else if (p.role !== 'admin') {
      const sid = uid('role');
      const sel = h('select', { id: sid, class: 'a-select', 'aria-label': 'دور ' + (p.full_name || p.email) }, ['leader', 'member', 'parent'].map(k => h('option', { value: k, selected: p.role === k, text: ROLE[k] })));
      const save = btn('حفظ الدور', 'check', 'btn-ghost', async () => {
        if (save.dataset.busy) return;
        save.dataset.busy = '1';
        const r = await YB.rpc('set_user_role', { target: p.id, new_role: sel.value });
        if (!r.ok) { delete save.dataset.busy; if (!sessionLost(r)) say(errMsg(r)); return; }
        await refreshAdmin('تم تغيير الدور.', 'rs-' + p.id);
      }, { disabled: true, 'data-fk': 'rs-' + p.id });
      sel.addEventListener('change', () => { save.disabled = sel.value === p.role; });
      row.append(h('div', { class: 'a-person-a' }, sel, save));
    }
    return row;
  }

  /* --- tournament */
  function drawAdminTour(panel) {
    const approved = A.teams.filter(t => t.status === 'approved');
    const pct = Math.min(100, Math.round(approved.length / EXPECTED * 100));
    const stateLine = h('p', { class: 'a-hint', text: 'جارٍ قراءة حالة البطولة…' });
    panel.append(h('div', { class: 'a-card' },
      h('h3', {}, icon('trophy'), h('span', { text: 'لوحة البطولة' })),
      h('p', { class: 'a-big' }, h('b', { text: String(approved.length) }), ` من ${EXPECTED} فريقًا معتمدًا`),
      h('div', { class: 'a-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(EXPECTED), 'aria-valuenow': String(approved.length), 'aria-label': 'الفرق المعتمدة' }, h('i', { style: `width:${pct}%` })),
      approved.length ? h('ul', { class: 'a-names' }, approved.map(t => h('li', { text: t.name }))) : h('p', { class: 'a-empty', text: 'لا يوجد فريق معتمد بعد.' }),
      stateLine,
      h('div', { class: 'btns' }, h('a', { class: 'btn btn-primary', href: 'tournament.html' }, icon('chart'), h('span', { text: 'افتح لوحة البطولة' })))));
    const show = st => {
      if (!st || !st.state) { stateLine.textContent = 'لم تُنشر بيانات البطولة بعد.'; return; }
      const n = Array.isArray(st.state.teams) ? st.state.teams.length : 0;
      stateLine.textContent = `في لوحة البطولة ${n} فريقًا` + (st.updated_at ? ` · آخر نشر ${fmtDate(st.updated_at)}` : '') + '.';
    };
    if (A.state !== undefined) show(A.state); // the last answer first, then a fresh read every time the tab opens
    YB.getState().then(st => { A.state = st || null; show(A.state); }, () => { if (A.state === undefined) stateLine.textContent = 'تعذّرت قراءة حالة البطولة الآن.'; });
  }

  /* --- export */
  function exportRows() {
    const rows = [];
    A.teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).forEach(t => {
      membersOf(t.id).forEach((m, i) => rows.push([t.name, t.area || '', STATUS[t.status] || t.status, leaderName(t), i + 1, m.full_name, m.age === null || m.age === undefined ? '' : m.age,
        m.guardian_name || '', m.guardian_phone || '', m.is_leader ? 'نعم' : 'لا', m.consent_status === 'received' ? 'استُلمت' : 'لم تُستلم', m.user_id ? 'نعم' : 'لا']));
    });
    return rows;
  }
  const EXPORT_HEAD = () => [W.teamName || 'اسم الفريق', W.area || 'الحي / المنطقة', 'حالة الفريق', W.leaderName || 'اسم قائد الفريق', 'م', W.memberName || 'الاسم الثلاثي', W.age || 'العمر',
    W.guardianName || 'اسم ولي الأمر', W.guardianPhone || 'رقم الهاتف', 'قائد الفريق', 'موافقة ولي الأمر', 'حساب مرتبط'];
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s()-]+$/.test(s))) s = "'" + s; // no spreadsheet formulas from user text
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const toCsv = rows => '﻿' + [EXPORT_HEAD()].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function drawAdminExport(panel) {
    const rows = exportRows();
    const printArea = h('div', { class: 'a-print', 'aria-hidden': 'true' });
    const buildPrint = () => {
      printArea.replaceChildren(h('h2', { text: 'مشروع ينابيع · كشف الفرق والأعضاء' }), h('p', { text: stamp() }),
        h('table', { class: 'a-ptable' }, h('thead', {}, h('tr', {}, EXPORT_HEAD().map(x => h('th', { scope: 'col', text: x })))),
          h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', { text: String(c) })))))));
    };
    panel.append(h('div', { class: 'a-card' },
      h('h3', {}, icon('file-text'), h('span', { text: 'تصدير الفرق والأعضاء' })),
      h('p', { text: `${A.teams.length} فريقًا · ${rows.length} عضوًا. الملف مناسب لفتحه في Excel ولطباعة كشف الاستمارات.` }),
      h('p', { class: 'a-privacy' }, icon('lock'), h('span', { text: 'الملف يحتوي أسماء قاصرين وبيانات أولياء أمورهم؛ احفظه في مكان آمن ولا تشاركه علنًا.' })),
      h('div', { class: 'a-actions' },
        btn('نزّل ملف CSV', 'file-text', 'btn-primary', () => { download(`yanabee-teams-${stamp()}.csv`, toCsv(rows), 'text/csv;charset=utf-8'); say('بدأ تنزيل الملف.'); }, { 'data-fk': 'csv' }),
        btn('اطبع الكشف', 'printer', 'btn-ghost', () => {
          buildPrint();
          document.body.classList.add('acct-printing');
          const off = () => { document.body.classList.remove('acct-printing'); window.removeEventListener('afterprint', off); };
          window.addEventListener('afterprint', off);
          window.print();
        }, { 'data-fk': 'print' }))), printArea);
  }

  /* ------------------------------------------------------------------ LEADER */
  const L = { team: null, members: [], editing: null, boxes: {}, sched: null, profile: null, adding: false, addForm: null, editTeam: false };
  const editable = () => L.team && (L.team.status === 'draft' || L.team.status === 'submitted');

  async function loadLeader() {
    const r = await YB.rpc('my_team');
    if (!r.ok) return { ok: false, error: r };
    const row = (Array.isArray(r.data) ? r.data : []).find(x => x.my_role === 'leader');
    if (!row) { L.team = null; L.members = []; return { ok: true }; }
    const m = await read('team_members', { select: 'id,team_id,full_name,age,guardian_name,guardian_phone,is_leader,user_id,consent_status,consent_at', filter: { team_id: 'eq.' + row.team_id }, order: 'created_at.asc' });
    if (!m.ok) return { ok: false, error: m.error };
    L.team = row;
    L.members = (m.data || []).sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0));
    return { ok: true };
  }
  async function viewLeader(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    L.profile = profile; L.editing = null; L.addForm = null; L.sched = null; L.editTeam = false;
    mount(sh.el, S.focusNext);
    const r = await loadLeader();
    if (seq !== S.seq) return;
    if (!r.ok) {
      if (sessionLost(r.error)) return;
      sh.body.replaceChildren(errorBlock(YB.errorText(r.error), () => { sh.body.replaceChildren(skeleton()); route(); }));
      return;
    }
    L.boxes = { body: sh.body };
    if (!L.team) return drawNoTeam(sh.body);
    drawLeader();
  }
  function drawNoTeam(body) {
    const name = field({ label: W.teamName || 'اسم الفريق', name: 'team', required: true, max: 60, hint: 'يظهر اسم الفريق للعموم بعد اعتماده، فلا تكتب فيه اسم طفل.' });
    const area = field({ label: W.area || 'الحي / المنطقة', name: 'area', max: 60 });
    const form = h('form', { class: 'a-form', 'aria-label': 'إنشاء الفريق' }, name, area, h('div', { class: 'a-actions' }, submitBtn('أنشئ الفريق', 'users')));
    bind(form, async () => {
      const n = nameKey(name.input.value), a = nameKey(area.input.value);
      if (n.length < 2 || n.length > 60) return showErr(form, 'اسم الفريق من حرفين إلى 60 حرفًا.', name.input);
      showErr(form, '');
      const r = await YB.insert('teams', a ? { name: n, area: a } : { name: n }, { returning: true });
      if (!wrote(r)) { if (sessionLost(r)) return; return showErr(form, errMsg(r, { duplicate: 'اسم الفريق مستخدم من قبل، أو لديك فريق بالفعل. اختر اسمًا آخر أو حدّث الصفحة.', invalid_data: 'اسم الفريق من حرفين إلى 60 حرفًا.' }), name.input); }
      const l = await loadLeader();
      if (!l.ok) return showErr(form, YB.errorText(l.error));
      say('أُنشئ الفريق. أضف أعضاءه ثم أرسله للاعتماد.');
      drawLeader(true);
    });
    body.replaceChildren(h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'أنشئ فريقك' })),
      h('p', { class: 'a-lead', text: 'ليس لديك فريق بعد. اكتب اسم الفريق والحي، وبعدها تضيف الأعضاء وتحصل على رمز الانضمام.' }), form));
  }

  function drawLeader(focus) {
    const body = L.boxes.body;
    const t = L.team;
    L.boxes.top = h('section', { class: 'a-card a-teamcard' });
    L.boxes.roster = h('section', { class: 'a-card', 'aria-labelledby': 'l-roster-h' });
    L.boxes.code = h('section', { class: 'a-card a-codecard', 'aria-labelledby': 'l-code-h' });
    if (!L.sched) {
      L.sched = scheduleBox({ id: t.team_id, name: t.team_name });
    }
    L.printBox = h('section', { class: 'a-card' });
    body.replaceChildren(L.boxes.top, L.boxes.roster, L.boxes.code, L.sched.node, L.printBox);
    paintLeader();
    startSchedule([L.sched]);
    if (focus) { const f = L.boxes.top.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
  }
  function paintLeader() { paintTop(); paintRoster(); paintCode(); paintPrint(); }

  function statusText(t) {
    return ({
      draft: 'الفريق مسودة. أضف أعضاءه ثم أرسله للاعتماد.',
      submitted: 'أُرسل الفريق وينتظر اعتماد الإدارة. يمكنك سحب الإرسال لتعديل الفريق.',
      approved: 'اعتُمد فريقك. أصبح اسمه ظاهرًا للعموم، ولا يمكن تعديل القائمة الآن.',
      rejected: 'لم تعتمد الإدارة الفريق. راجع الملاحظة أدناه وتواصل مع الإدارة لإعادة فتحه.'
    })[t.status] || '';
  }
  function paintTop() {
    const t = L.team, n = L.members.length;
    const box = L.boxes.top;
    const nodes = [h('div', { class: 'a-team-top' },
      h('div', {}, h('h3', { id: 'l-team-h', tabindex: '-1', 'data-focus': '', text: t.team_name }), t.area ? h('small', { class: 'a-hint', text: t.area }) : null),
      statusChip(t.status)),
    h('p', { class: 'a-lead', text: statusText(t) })];
    if (t.admin_note) nodes.push(h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة الإدارة: ' }), t.admin_note));
    if (L.editTeam && editable()) {
      const nm = field({ label: W.teamName || 'اسم الفريق', name: 'team', required: true, max: 60, value: t.team_name });
      const ar = field({ label: W.area || 'الحي / المنطقة', name: 'area', max: 60, value: t.area || '' });
      const form = h('form', { class: 'a-form', 'aria-label': 'تعديل بيانات الفريق' }, nm, ar,
        h('div', { class: 'a-actions' }, submitBtn('حفظ', 'check'), h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => { L.editTeam = false; paintTop(); } })));
      bind(form, async () => {
        const a = nameKey(nm.input.value), b = nameKey(ar.input.value);
        if (a.length < 2 || a.length > 60) return showErr(form, 'اسم الفريق من حرفين إلى 60 حرفًا.', nm.input);
        const r = await YB.update('teams', { id: 'eq.' + t.team_id }, { name: a, area: b || null }, { returning: true });
        if (!wrote(r)) { if (sessionLost(r)) return; return showErr(form, errMsg(r, { duplicate: 'اسم الفريق مستخدم من قبل. اختر اسمًا آخر.' }), nm.input); }
        L.editTeam = false;
        await reloadLeader('حُفظت بيانات الفريق.');
      });
      nodes.push(form);
    } else {
      const acts = [];
      if (t.status === 'draft') {
        const ok = n >= MIN && n <= MAX;
        const submit = btn('أرسل الفريق للاعتماد', 'send', 'btn-primary', () => setStatus('submitted'), { 'data-fk': 'submit', disabled: !ok });
        acts.push(submit);
        if (!ok) acts.push(h('small', { class: 'a-hint', text: n < MIN ? `ينقصك ${MIN - n} للوصول إلى الحد الأدنى (${MIN}).` : `زاد العدد عن الحد الأقصى (${MAX}).` }));
      }
      if (t.status === 'submitted') acts.push(btn('اسحب الإرسال', 'repeat', 'btn-ghost', () => setStatus('draft'), { 'data-fk': 'withdraw' }));
      if (editable()) acts.push(btn('عدّل اسم الفريق والحي', 'user', 'btn-ghost', () => { L.editTeam = true; paintTop(); const f = L.boxes.top.querySelector('input'); if (f) f.focus(); }));
      if (acts.length) nodes.push(h('div', { class: 'a-actions' }, acts));
      nodes.push(h('div', { class: 'a-live-msg', role: 'alert', hidden: true, 'data-msg': 'top' }));
    }
    box.replaceChildren(...nodes);
  }
  const topMsg = msg => { const m = L.boxes.top && L.boxes.top.querySelector('[data-msg=top]'); if (m) { m.textContent = msg; m.hidden = !msg; } if (msg) say(msg); };
  async function setStatus(st) {
    const t = L.team;
    const r = await YB.update('teams', { id: 'eq.' + t.team_id }, { status: st }, { returning: true });
    if (!wrote(r)) {
      if (sessionLost(r)) return;
      if (r.error === 'members_count_invalid') { // the page was out of date: show the real roster, then the exact message
        const l = await loadLeader();
        if (l.ok && L.team) paintLeader();
        return topMsg(`عدد الأعضاء ${L.members.length}؛ المطلوب من ${MIN} إلى ${MAX} شاملًا القائد.`);
      }
      return topMsg(errMsg(r));
    }
    await reloadLeader(st === 'submitted' ? 'أُرسل الفريق للاعتماد.' : 'سُحب الإرسال، والفريق الآن مسودة.');
  }
  async function reloadLeader(msg) {
    const r = await loadLeader();
    if (!r.ok) { if (!sessionLost(r.error)) say(YB.errorText(r.error)); return false; }
    if (!L.team) { drawNoTeam(L.boxes.body); return false; }
    paintLeader();
    if (msg) say(msg);
    return true;
  }

  /* --- roster */
  function countLine() {
    const n = L.members.length;
    const bad = n < MIN || n > MAX;
    const msg = n < MIN ? `العدد الحالي ${n}؛ ينقصك ${MIN - n} للوصول إلى الحد الأدنى.` : n > MAX ? `العدد الحالي ${n}؛ زاد عن الحد الأقصى.` : `العدد الحالي ${n}؛ مناسب للإرسال.`;
    return h('div', { class: 'a-count-line' }, h('output', { class: 'a-counter' + (bad ? ' bad' : ' ok'), 'aria-live': 'polite', 'data-counter': '', text: `${n} / ${MAX}` }), h('span', { text: msg }));
  }
  function paintRoster() {
    const box = L.boxes.roster;
    const ed = editable();
    const list = h('ul', { class: 'a-roster' }, L.members.map(m => L.editing === m.id ? memberEdit(m) : memberCard(m, ed)));
    box.replaceChildren(
      h('h3', { id: 'l-roster-h' }, icon('users'), h('span', { text: W.membersTitle || 'أعضاء الفريق' })),
      countLine(), W.countRule ? h('p', { class: 'a-hint', text: W.countRule }) : null, list);
    if (ed) {
      if (L.members.length >= MAX) box.append(h('p', { class: 'a-hint', text: `اكتمل الحد الأقصى (${MAX} أعضاء شاملًا القائد).` }));
      else { if (!L.addForm) L.addForm = addForm(); box.append(L.addForm); }
    }
  }
  function memberCard(m, ed) {
    const sw = ed ? consentSwitch(m, async received => {
      const r = await YB.rpc('mark_consent', { member_id: m.id, received });
      if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return false; }
      await reloadLeader(received ? 'سُجّلت موافقة ولي الأمر.' : 'أُلغي تسجيل الموافقة.');
      return true;
    }, 'sw-' + m.id) : h('p', { class: 'a-consent-ro' }, chip(m.consent_status === 'received' ? 'استُلمت موافقة ولي الأمر' : 'لم تُستلم موافقة ولي الأمر', m.consent_status === 'received' ? 'ok' : 'muted'));
    const acts = [];
    if (ed) {
      acts.push(btn('تعديل', 'user', 'btn-ghost', () => { L.editing = m.id; paintRoster(); const f = L.boxes.roster.querySelector('.a-edit input'); if (f) f.focus(); }, { 'data-fk': 'ed-' + m.id, 'aria-label': 'تعديل ' + m.full_name }));
      if (!m.is_leader) acts.push(armed(btn('حذف', 'trash', 'btn-ghost btn-danger', () => {}, { 'data-fk': 'rm-' + m.id, 'aria-label': 'حذف ' + m.full_name }), 'اضغط مرة أخرى لتأكيد الحذف', async () => {
        const r = await YB.remove('team_members', { id: 'eq.' + m.id }, { returning: true });
        if (!wrote(r)) { if (!sessionLost(r)) say(errMsg(r)); return; }
        await reloadLeader('حُذف العضو من الفريق.');
      }));
      if (!m.is_leader && m.user_id) acts.push(armed(btn('فكّ ارتباط الحساب', 'x', 'btn-ghost', () => {}, { 'data-fk': 'ul-' + m.id, 'aria-label': 'فكّ ارتباط حساب ' + m.full_name }), 'اضغط مرة أخرى لفكّ الارتباط', async () => {
        const r = await YB.rpc('unlink_member', { member_id: m.id });
        if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
        await reloadLeader('فُكّ ارتباط الحساب بالعضو.');
      }));
    }
    return h('li', { class: 'a-mem', 'data-member': m.id },
      h('div', { class: 'a-mem-h' }, h('b', { text: m.full_name }), m.is_leader ? chip('قائد', 'brand') : (m.user_id ? chip('انضم بحسابه', 'ok') : chip('لم ينضم بعد', 'muted'))),
      h('dl', { class: 'a-dl' },
        h('div', {}, h('dt', { text: W.age || 'العمر' }), h('dd', { text: m.age === null || m.age === undefined ? '—' : String(m.age) })),
        h('div', {}, h('dt', { text: W.guardianName || 'اسم ولي الأمر' }), h('dd', { text: m.guardian_name || '—' })),
        h('div', {}, h('dt', { text: W.guardianPhone || 'رقم الهاتف' }), h('dd', {}, m.guardian_phone ? h('a', { href: telHref(m.guardian_phone), dir: 'ltr', text: m.guardian_phone }) : '—'))),
      sw, acts.length ? h('div', { class: 'a-actions' }, acts) : null);
  }
  function memberFields(m) {
    m = m || {};
    return {
      name: field({ label: W.memberName || 'الاسم الثلاثي', name: 'name', required: true, max: 80, value: m.full_name || '' }),
      age: field({ label: W.age || 'العمر', name: 'age', type: 'number', required: true, mode: 'numeric', nmin: 4, nmax: 100, value: m.age === null || m.age === undefined ? '' : String(m.age) }),
      gname: field({ label: W.guardianName || 'اسم ولي الأمر', name: 'gname', max: 80, value: m.guardian_name || '' }),
      gphone: field({ label: W.guardianPhone || 'رقم الهاتف', name: 'gphone', type: 'tel', auto: 'off', max: 30, mode: 'tel', dir: 'ltr', value: m.guardian_phone || '' })
    };
  }
  function readMember(f, form) {
    const name = nameKey(f.name.input.value), age = num(f.age.input.value), gname = nameKey(f.gname.input.value), gphone = f.gphone.input.value.trim();
    if (name.length < 2) return showErr(form, 'اكتب اسم العضو (حرفان على الأقل).', f.name.input), null;
    if (age === null || age < 4 || age > 100) return showErr(form, 'اكتب عمرًا صحيحًا بين 4 و100.', f.age.input), null;
    if (gphone && digits(gphone).length < 7) return showErr(form, 'رقم الهاتف قصير؛ اكتبه كاملًا أو اتركه فارغًا.', f.gphone.input), null;
    showErr(form, '');
    return { full_name: name, age, guardian_name: gname || null, guardian_phone: gphone || null };
  }
  function addForm() {
    const f = memberFields();
    const form = h('form', { class: 'a-form a-add', 'aria-label': 'إضافة عضو' }, h('h4', { text: 'أضف عضوًا' }),
      h('div', { class: 'a-grid2' }, f.name, f.age, f.gname, f.gphone),
      h('div', { class: 'a-actions' }, submitBtn('أضف العضو', 'user-check')));
    bind(form, async () => {
      const v = readMember(f, form);
      if (!v) return;
      if (L.members.some(m => lower(nameKey(m.full_name)) === lower(v.full_name))) return showErr(form, 'هذا الاسم مضاف مسبقًا في فريقك.', f.name.input);
      const r = await YB.insert('team_members', Object.assign({ team_id: L.team.team_id }, v), { returning: true });
      if (!wrote(r)) { if (sessionLost(r)) return; return showErr(form, errMsg(r, { duplicate: 'هذا الاسم مضاف مسبقًا في فريقك.', team_full: `اكتمل الحد الأقصى (${MAX} أعضاء شاملًا القائد).` }), f.name.input); }
      form.reset();
      await reloadLeader('أُضيف العضو.');
      const nf = L.boxes.roster.querySelector('.a-add input');
      if (nf) nf.focus({ preventScroll: true });
    });
    return form;
  }
  function memberEdit(m) {
    const f = memberFields(m);
    const form = h('form', { class: 'a-form a-edit', 'aria-label': 'تعديل بيانات ' + m.full_name }, h('div', { class: 'a-grid2' }, f.name, f.age, f.gname, f.gphone),
      h('div', { class: 'a-actions' }, submitBtn('حفظ', 'check'), h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => { L.editing = null; paintRoster(); } })));
    bind(form, async () => {
      const v = readMember(f, form);
      if (!v) return;
      if (L.members.some(x => x.id !== m.id && lower(nameKey(x.full_name)) === lower(v.full_name))) return showErr(form, 'هذا الاسم مضاف مسبقًا في فريقك.', f.name.input);
      const r = await YB.update('team_members', { id: 'eq.' + m.id }, v, { returning: true });
      if (!wrote(r)) { if (sessionLost(r)) return; return showErr(form, errMsg(r, { duplicate: 'هذا الاسم مضاف مسبقًا في فريقك.' }), f.name.input); }
      L.editing = null;
      await reloadLeader('حُفظت بيانات العضو.');
    });
    return h('li', { class: 'a-mem' }, form);
  }

  /* --- join code */
  function paintCode() {
    const t = L.team;
    const code = t.join_code || '';
    const copy = btn('انسخ الرمز', 'file-text', 'btn-primary', async () => {
      const ok = await copyText(code);
      copy.querySelector('span').textContent = ok ? 'نُسخ الرمز' : 'تعذّر النسخ';
      say(ok ? 'نُسخ رمز الفريق.' : 'تعذّر نسخ الرمز؛ انسخه يدويًا.');
      setTimeout(() => { copy.querySelector('span').textContent = 'انسخ الرمز'; }, 2200);
    }, { 'data-fk': 'copy-code' });
    const regen = armed(btn('رمز جديد', 'repeat', 'btn-ghost', () => {}, { 'data-fk': 'regen' }), 'اضغط مرة أخرى: سيتوقف الرمز القديم', async () => {
      const r = await YB.rpc('regenerate_join_code', { team_id: t.team_id });
      if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
      await reloadLeader('أُنشئ رمز جديد، وتوقف الرمز القديم.');
    });
    L.boxes.code.replaceChildren(
      h('h3', { id: 'l-code-h' }, icon('lock'), h('span', { text: 'رمز الانضمام' })),
      h('p', { class: 'a-code', dir: 'ltr', 'aria-label': 'رمز الفريق: ' + code.split('').join(' '), 'data-code': '', text: code }),
      h('p', { class: 'a-lead', text: 'أعطِ هذا الرمز لأعضاء فريقك ولأولياء أمورهم. يدخله العضو مع اسمه كما كتبته في القائمة ليربط حسابه بالفريق، ويدخله ولي الأمر مع اسم ابنه ليتابعه. لا تنشره علنًا.' }),
      h('div', { class: 'a-actions' }, copy, regen));
  }

  /* --- print the registration form pre-filled */
  function paintPrint() {
    const msg = h('p', { class: 'a-err', role: 'alert', hidden: true });
    L.printBox.replaceChildren(
      h('h3', {}, icon('printer'), h('span', { text: 'استمارة التسجيل جاهزة' })),
      h('p', { class: 'a-lead', text: 'نملأ لك استمارة التسجيل بما أدخلته هنا، فتراجعها وتطبعها مع موافقات أولياء الأمور. تُحفظ المسودة على هذا الجهاز فقط.' }),
      h('div', { class: 'a-actions' }, btn('اطبع الاستمارة جاهزة', 'printer', 'btn-primary', () => {
        if (!writeDraft()) { msg.textContent = 'تعذّر حفظ المسودة في هذا المتصفح، فلا يمكن تعبئة الاستمارة تلقائيًا.'; msg.hidden = false; say(msg.textContent); return; }
        location.href = 'register.html';
      }, { 'data-fk': 'print-form' })), msg);
  }
  function writeDraft() {
    const t = L.team, p = L.profile || {};
    const lead = L.members.find(m => m.is_leader) || L.members[0];
    if (!t || !lead) return false;
    let old = null;
    try { old = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { old = null; }
    const keep = old && old.f && old.f.team === t.team_name ? old.f : {};
    const phone = p.phone || lead.guardian_phone || '';
    const f = Object.assign({}, keep, { team: t.team_name, leader: lead.full_name, phone, email: p.email || '', area: t.area || '' });
    const m = [lead].concat(L.members.filter(x => x !== lead)).slice(0, MAX).map((x, i) => ({
      n: x.full_name, a: x.age === null || x.age === undefined ? '' : String(x.age), c: (i === 0 ? (x.guardian_phone || phone) : x.guardian_phone) || ''
    }));
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, m })); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ MEMBER */
  const M = { rows: [], roster: [] };
  function joinForm(kind) {
    const isMember = kind === 'member';
    const code = field({ label: 'رمز الفريق', name: 'code', required: true, max: 12, dir: 'ltr', spell: false, cap: 'characters', cls: 'a-codefield', placeholder: 'مثال: K7M2QX', hint: 'يعطيه لك قائد الفريق.' });
    const nm = field({ label: isMember ? 'اسمك كما كتبه القائد' : 'اسم ابنك أو ابنتك كما كتبه القائد', name: 'name', required: true, max: 80, hint: isMember ? 'اكتب اسمك الثلاثي تمامًا كما هو في قائمة الفريق.' : 'اكتب الاسم الثلاثي تمامًا كما هو في قائمة الفريق.' });
    code.input.addEventListener('input', () => { const p = code.input.selectionStart; code.input.value = code.input.value.toUpperCase(); try { code.input.setSelectionRange(p, p); } catch (e) { /* ignore */ } });
    const form = h('form', { class: 'a-form', 'aria-label': isMember ? 'الانضمام إلى فريق' : 'ربط ابن أو ابنة' }, code, nm,
      h('div', { class: 'a-actions' }, submitBtn(isMember ? 'انضم إلى الفريق' : 'اربط الحساب', 'user-check')));
    const over = isMember
      ? { team_not_found: 'رمز الفريق غير صحيح. تأكد منه مع قائد فريقك.', name_not_in_roster: 'لم نجد هذا الاسم في قائمة الفريق. اكتبه تمامًا كما كتبه قائد الفريق (الاسم الثلاثي).', already_linked: 'هذا الاسم مرتبط بحساب آخر، أو أن حسابك مرتبط بفريق بالفعل. إن كان ذلك خطأً فاطلب من قائد الفريق فكّ الارتباط.' }
      : { team_not_found: 'رمز الفريق غير صحيح. تأكد منه مع قائد الفريق.', name_not_in_roster: 'لم نجد هذا الاسم في قائمة الفريق. اكتب اسم ابنك أو ابنتك تمامًا كما كتبه القائد.', already_linked: 'هذا الابن أو الابنة مرتبط بحسابك بالفعل.' };
    bind(form, async () => {
      const c = code.input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), n = nameKey(nm.input.value);
      if (c.length < 4) return showErr(form, 'اكتب رمز الفريق كاملًا.', code.input);
      if (n.length < 2) return showErr(form, 'اكتب الاسم كما كتبه القائد.', nm.input);
      showErr(form, '');
      const r = await YB.rpc(isMember ? 'join_team' : 'link_child', isMember ? { code: c, member_name: n } : { code: c, child_name: n });
      if (!r.ok) { if (sessionLost(r)) return; return showErr(form, errMsg(r, over), ['name_not_in_roster', 'already_linked'].includes(r.error) ? nm.input : code.input); }
      code.input.value = ''; nm.input.value = '';
      S.flash = isMember ? 'تم ربط حسابك بالفريق.' : 'تم ربط حسابك بالطفل.';
      route({ focus: true });
    });
    return form;
  }
  const consentBlock = status => {
    const got = status === 'received';
    return h('div', { class: 'a-consent' }, chip(got ? 'استُلمت موافقة ولي الأمر' : 'لم تُستلم موافقة ولي الأمر بعد', got ? 'ok' : 'sun'),
      h('p', { class: 'a-hint' }, got ? 'سجّلت الإدارة أو قائد الفريق استلام الموافقة الورقية.' : (W.consentNote ? W.consentNote + ' ' : '') + 'تتغيّر الحالة هنا بعد أن يستلم القائد أو الإدارة النسخة الورقية.',
        ' ', h('a', { href: 'register.html#c-consent', text: W.consentTitle || 'موافقة ولي الأمر' })));
  };
  async function viewMember(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    mount(sh.el, S.focusNext);
    const r = await YB.rpc('my_team');
    if (seq !== S.seq) return;
    if (!r.ok) { if (sessionLost(r)) return; sh.body.replaceChildren(errorBlock(YB.errorText(r), () => { sh.body.replaceChildren(skeleton()); route(); })); return; }
    const row = (Array.isArray(r.data) ? r.data : []).find(x => x.my_role === 'member');
    if (!row) {
      sh.body.replaceChildren(h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'انضم إلى فريقك' })),
        h('p', { class: 'a-lead', text: 'اطلب من قائد فريقك رمز الفريق، ثم اكتبه هنا مع اسمك كما كتبه في قائمة الفريق.' }), joinForm('member')));
      return;
    }
    const ro = await read('my_roster', { select: 'member_id,team_id,full_name,is_leader,joined,is_me,consent_status', filter: { team_id: 'eq.' + row.team_id }, order: 'full_name.asc' });
    if (seq !== S.seq) return;
    const roster = ro.ok ? (ro.data || []) : [];
    const me = roster.find(x => x.is_me);
    const box = scheduleBox({ id: row.team_id, name: row.team_name });
    sh.body.replaceChildren(
      h('section', { class: 'a-card a-teamcard' }, h('div', { class: 'a-team-top' }, h('div', {}, h('h3', { text: row.team_name }), row.area ? h('small', { class: 'a-hint', text: row.area }) : null), statusChip(row.status)),
        h('p', { class: 'a-lead', text: 'أنت عضو في هذا الفريق.' })),
      h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'أعضاء الفريق' })),
        ro.ok ? h('ul', { class: 'a-names a-names-roster' }, roster.map(x => h('li', {}, h('span', { text: x.full_name }), x.is_leader ? chip('قائد', 'brand') : null, x.is_me ? chip('أنا', 'ok') : null)))
          : h('p', { class: 'a-empty', text: 'تعذّر تحميل أسماء الفريق الآن.' })),
      h('section', { class: 'a-card' }, h('h3', {}, icon('user-check'), h('span', { text: 'موافقة ولي الأمر' })),
        me ? consentBlock(me.consent_status) : h('p', { class: 'a-empty', text: 'لا تتوفر حالة الموافقة الآن.' })),
      box.node);
    startSchedule([box]);
  }

  /* ------------------------------------------------------------------ PARENT */
  async function viewParent(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    mount(sh.el, S.focusNext);
    const r = await read('my_children', { select: 'member_id,full_name,consent_status,team_id,team_name,team_area,team_status', order: 'full_name.asc' });
    if (seq !== S.seq) return;
    if (!r.ok) { if (sessionLost(r.error)) return; sh.body.replaceChildren(errorBlock(YB.errorText(r.error), () => { sh.body.replaceChildren(skeleton()); route(); })); return; }
    const kids = r.data || [];
    const nodes = [];
    const boxes = [];
    if (!kids.length) nodes.push(h('p', { class: 'a-empty a-card', text: 'لم تربط أي ابن أو ابنة بعد. اكتب رمز الفريق واسم الطفل أدناه.' }));
    kids.forEach(k => {
      nodes.push(h('section', { class: 'a-card a-child', 'data-child': k.member_id },
        h('div', { class: 'a-team-top' }, h('div', {}, h('h3', { text: k.full_name }), h('small', { class: 'a-hint', text: `فريق ${k.team_name}` + (k.team_area ? ` · ${k.team_area}` : '') })), statusChip(k.team_status)),
        consentBlock(k.consent_status)));
    });
    const seen = {};
    kids.forEach(k => {
      if (seen[k.team_id]) return;
      seen[k.team_id] = 1;
      const b = scheduleBox({ id: k.team_id, name: k.team_name });
      boxes.push(b);
      nodes.push(b.node);
    });
    nodes.push(h('section', { class: 'a-card' }, h('h3', {}, icon('user-check'), h('span', { text: kids.length ? 'اربط ابنًا أو ابنة آخر' : 'اربط ابنك أو ابنتك' })),
      h('p', { class: 'a-lead', text: 'اطلب من قائد الفريق رمز الفريق، واكتب اسم الطفل كما كتبه في القائمة.' }), joinForm('parent')));
    sh.body.replaceChildren(...nodes);
    startSchedule(boxes);
  }

  /* ------------------------------------------------------------------ router */
  async function route(opts) {
    opts = opts || {};
    const seq = ++S.seq;
    stopPoll();
    S.modeSet = null;
    S.focusNext = !!opts.focus;
    if (!YB || !YB.configured) { S.rendered = 'unconfigured'; viewUnconfigured(); return; }
    root.setAttribute('aria-busy', 'true');
    if (S.rendered !== 'signedout' || opts.focus) root.replaceChildren(skeleton());
    try { await YB.ready; } catch (e) { /* the link error is read below */ }
    if (seq !== S.seq) return;
    let sess = YB.session();
    if (!sess) {
      clearData();
      const had = S.uid !== null;
      S.uid = null; S.role = null; S.rendered = 'signedout';
      let notice = opts.notice, tone = opts.tone;
      if (!notice && had) { notice = S.manualOut ? 'تم تسجيل الخروج.' : 'انتهت جلستك. سجّل الدخول من جديد.'; tone = S.manualOut ? 'ok' : 'bad'; }
      S.manualOut = false; S.expired = false;
      viewSignedOut({ notice, tone, focus: opts.focus });
      return;
    }
    let profile = sess.profile;
    if (!profile) {
      root.replaceChildren(skeleton());
      profile = await YB.loadProfile();
      if (seq !== S.seq) return;
    }
    if (!profile) {
      if (!YB.session()) return; // the refresh failed and the auth event already redrew the page
      S.rendered = 'error';
      mount(h('div', { class: 'a-auth' }, errorBlock('تعذّر تحميل بيانات حسابك الآن. تحقق من الاتصال ثم أعد المحاولة.', () => route()),
        h('div', { class: 'btns center' }, btn('خروج', 'x', 'btn-ghost', async () => { S.manualOut = true; await YB.signOut(); }))));
      return;
    }
    if (YB.linkType === 'recovery' && !S.recoveryDone) { S.rendered = 'recovery'; S.uid = profile.id; viewRecovery(); return; }
    if (YB.linkType === 'signup' && !S.confirmedShown) { S.confirmedShown = true; if (!S.flash) S.flash = 'تم تأكيد بريدك الإلكتروني.'; }
    S.uid = profile.id; S.role = profile.role; S.rendered = 'role:' + profile.id + ':' + profile.role;
    clearData();
    const role = profile.role;
    if (role === 'admin') return viewAdmin(profile, seq);
    if (role === 'leader') return viewLeader(profile, seq);
    if (role === 'parent') return viewParent(profile, seq);
    return viewMember(profile, seq);
  }

  if (YB && YB.configured) {
    YB.onAuth((s, ev) => {
      if (ev === 'SIGNED_OUT') { if (S.rendered !== 'signedout') route({ focus: true }); return; }
      if (ev === 'PASSWORD_RECOVERY') { route({ focus: true }); return; }
      if (s && s.profile && S.rendered === 'role:' + s.user.id + ':' + s.profile.role) return; // same account, same screen
      route({ focus: true });
    });
    window.addEventListener('hashchange', () => { if (S.modeSet) S.modeSet(location.hash === '#signup' ? 'signup' : location.hash === '#reset' ? 'reset' : 'login'); });
  }
  route();
})();
