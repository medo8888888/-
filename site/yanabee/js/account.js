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
  // the owner's words for the registration states (requirements table: متابعة التسجيل)
  const STATUS = { draft: 'مسودة', submitted: 'قيد المراجعة', returned: 'مطلوب تعديل', approved: 'معتمد', rejected: 'مرفوض' };
  const ROLE = { admin: 'الإدارة', officer: 'مسؤول مسابقة', leader: 'قائد الفريق', member: 'عضو', parent: 'ولي أمر' };
  const COMPS = { registration: 'التسجيل ومراجعة الفرق', football: 'دوري كرة القدم', chess: 'بطولة الشطرنج', projects: 'المشاريع والمبادرات',
    hifz: 'الحفظ', fahm: 'الفهم', workshops: 'الورش' };
  const INBOX_MS = 60000;
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
  const statusChip = s => chip(STATUS[s] || s, { draft: 'muted', submitted: 'brand', returned: 'sun', approved: 'ok', rejected: 'bad' }[s]);
  // مسودة ← قيد المراجعة ← مطلوب تعديل / معتمد / مرفوض
  function timeline(st) {
    const last = st === 'returned' || st === 'rejected' ? st : 'approved';
    const steps = [['draft', STATUS.draft], ['submitted', STATUS.submitted], [last, STATUS[last]]];
    const at = { draft: 0, submitted: 1, returned: 2, approved: 2, rejected: 2 }[st];
    return h('ol', { class: 'a-steps', 'aria-label': 'مراحل التسجيل' }, steps.map(([k, label], i) => h('li', {
      class: (i < at ? 'done' : i === at ? 'now s-' + k : ''), 'aria-current': i === at ? 'step' : null, text: label })));
  }

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
  const S = { seq: 0, uid: null, role: null, expired: false, manualOut: false, recoveryDone: false, stopPoll: null, stopInbox: null, rendered: null, modeSet: null, confirmedShown: false };
  const clearData = () => { A.teams = []; A.members = []; A.profiles = []; A.state = undefined; A.evm = null; L.team = null; L.members = []; };

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
    const inbox = inboxBox();
    const roleName = ROLE[profile.role] || 'عضو';
    const head = h('header', { class: 'a-head a-card' },
      h('span', { class: 'a-avatar', 'aria-hidden': 'true', text: initial }),
      h('div', { class: 'a-who' },
        h('h2', { text: profile.full_name || 'حسابي', tabindex: '-1', 'data-focus': '' }),
        h('div', { class: 'a-who-m' }, h('span', { class: 'a-badge r-' + profile.role, text: roleName }), h('small', { class: 'a-mail', dir: 'ltr', text: profile.email || '' }))),
      h('div', { class: 'a-head-b' }, inbox.bell, pwBtn, outBtn));
    const el = h('div', { class: 'a-app a-role-' + profile.role }, head, inbox.panel, pwWrap, flash, body);
    inbox.start();
    if (S.flash) { flash.append(banner(S.flash, 'ok')); say(S.flash); S.flash = ''; }
    return { el, body, flash };
  }


  /* ------------------------------------------------------------------ notifications (in-app inbox) */
  // rows carry a kind + data (ids, the team name, status words); the Arabic sentence is made here
  function noteText(n) {
    const d = (n && n.data) || {};
    const team = !d.team_name ? 'الفريق' : /^فريق\s/.test(String(d.team_name)) ? String(d.team_name) : `فريق ${d.team_name}`;
    if (n.kind === 'team_status') return `تغيّرت حالة ${team}: ${STATUS[d.to] || d.to || ''}.`;
    if (n.kind === 'team_submitted') return `أرسل ${team} طلب التسجيل، وهو بانتظار المراجعة.`;
    if (n.kind === 'team_approved') return `اعتُمد ${team} في المسابقة.`;
    if (n.kind === 'team_fee') return d.fee === 'waived' ? `أعفت الإدارة ${team} من رسوم الاشتراك.` : `سُجّل سداد رسوم ${team}.`;
    if (n.kind === 'team_seated') return `خلا مكان في المسابقة، فانتقل ${team} من قائمة الاحتياط إلى الفرق المشاركة.`;
    if (n.kind === 'result_pending') return `نتيجة بانتظار اعتمادك: ${d.a_name || ''} ${d.sa ?? ''} – ${d.sb ?? ''} ${d.b_name || ''}`.replace(/\s+/g, ' ').trim();
    if (n.kind === 'result_approved') return `اعتُمدت نتيجة مباراة لفريقك (${d.comp === 'chess' ? 'الشطرنج' : `${d.sa} – ${d.sb}`}) وظهرت في لوحة البطولة.`;
    if (n.kind === 'result_returned') return `أعادت الإدارة نتيجة مباراة للمراجعة: ${d.note || ''}`;
    if (n.kind === 'event_new') return `موعد جديد: ${d.title || ''} — ${fmtWhen(d.starts_at)}${d.place ? ' · ' + d.place : ''}`;
    if (n.kind === 'event_changed') return `تغيّر موعد: ${d.title || ''} — ${fmtWhen(d.starts_at)}${d.place ? ' · ' + d.place : ''}`;
    if (n.kind === 'event_cancelled') return `أُلغي موعد: ${d.title || ''}`;
    return 'إشعار جديد.';
  }
  function inboxBox() {
    const count = h('b', { class: 'a-bell-n', hidden: true });
    const bell = h('button', { type: 'button', class: 'btn btn-ghost btn-sm a-bell', hidden: true, 'aria-expanded': 'false', 'data-fk': 'bell',
      onclick: () => open(panel.hidden) }, icon('bell'), h('span', { text: 'الإشعارات' }), count);
    const list = h('ul', { class: 'a-inbox-l' });
    const panel = h('section', { class: 'a-card a-inbox', hidden: true, 'aria-label': 'الإشعارات' },
      h('div', { class: 'a-inbox-h' }, h('h3', {}, icon('bell'), h('span', { text: 'الإشعارات' })),
        h('button', { type: 'button', class: 'a-link', text: 'إغلاق', onclick: () => open(false) })), list);
    let rows = [];
    function paint() {
      const unread = rows.filter(n => !n.read_at).length;
      count.textContent = String(unread);
      count.hidden = !unread;
      bell.setAttribute('aria-label', unread ? `الإشعارات: ${unread} غير مقروء` : 'الإشعارات');
      list.replaceChildren(...(rows.length ? rows.map(n => h('li', { class: 'a-inbox-i' + (n.read_at ? '' : ' new') },
        h('p', { text: noteText(n) }),
        n.data && n.data.note ? h('p', { class: 'a-note' }, h('b', { text: 'الملاحظة: ' }), String(n.data.note)) : null,
        h('small', { class: 'a-hint', text: fmtDate(n.created_at) }))) : [h('li', { class: 'a-empty', text: 'لا توجد إشعارات بعد.' })]));
    }
    async function load() {
      const r = await read('yb_notifications', { select: 'id,kind,data,read_at,created_at', order: 'created_at.desc', limit: 30 });
      if (!r.ok) return; // no inbox on this backend yet: the bell stays hidden
      rows = Array.isArray(r.data) ? r.data : [];
      bell.hidden = false;
      paint();
    }
    async function open(on) {
      panel.hidden = !on;
      bell.setAttribute('aria-expanded', String(on));
      if (!on) { bell.focus({ preventScroll: true }); return; }
      const h3 = panel.querySelector('h3');
      if (h3) { h3.tabIndex = -1; h3.focus({ preventScroll: true }); }
      if (rows.some(n => !n.read_at)) {
        const r = await YB.rpc('yb_mark_read', {});
        if (r.ok) { const now = new Date().toISOString(); rows.forEach(n => { if (!n.read_at) n.read_at = now; }); setTimeout(paint, 1500); }
      }
    }
    function start() {
      if (S.stopInbox) { S.stopInbox(); S.stopInbox = null; }
      S.stopInbox = YB.poll ? YB.poll(load, INBOX_MS) : null;
      if (!S.stopInbox) load();
    }
    return { bell, panel, start };
  }


  /* ------------------------------------------------------------------ unified schedule: dates + attendance (SPEC 4.10.3, 4.11) */
  const KINDS = { match: 'مباراة', round: 'جولة', workshop: 'ورشة', recitation: 'موعد تسميع', other: 'موعد' };
  const EV_SELECT = 'id,competition,kind,title,starts_at,place,team_ids,category,status,note';
  const pad2 = n => String(n).padStart(2, '0');
  const localParts = iso => { const d = new Date(iso); return isNaN(d) ? { date: '', time: '' } : { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }; };
  function fmtWhen(iso) { try { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  const evChip = st => st === 'cancelled' ? chip('أُلغي', 'bad') : st === 'changed' ? chip('تغيّر الموعد', 'sun') : null;
  const isPast = e => new Date(e.starts_at).getTime() < Date.now() - 3 * 36e5;
  function lg2Box() {
    if (!Array.isArray(W.lg2Rows) || !W.lg2Rows.length) return null;
    return h('details', { class: 'a-rules' }, h('summary', { text: W.lg2Title || 'التأخر والغياب والانسحاب' }),
      h('table', { class: 'a-ptable' }, h('tbody', {}, W.lg2Rows.map(r => h('tr', {}, h('th', { scope: 'row', text: r[0] }), h('td', { text: r[1] }))))),
      h('p', { class: 'a-hint', text: 'تسجيل الحضور هنا لا يطبّق أي عقوبة تلقائيًا: القرار للجنة المسابقة وفق اللائحة.' }));
  }

  // admin / officer: create, edit and cancel the dates of the given competitions, and mark who came
  function eventManager(comps, teamsFn, fk) {
    const M = { events: [], att: [], editing: null, open: null, loaded: false, err: '' };
    const el = h('section', { class: 'a-card a-evm', 'aria-labelledby': 'evm-h-' + fk });
    const teams = () => (teamsFn() || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
    const tname = id => { const t = (teamsFn() || []).find(x => x.id === id); return t ? t.name : 'فريق'; };
    async function load() {
      const filter = comps.length === 1 ? { competition: 'eq.' + comps[0] } : { competition: 'in.(' + comps.join(',') + ')' };
      const [e, a] = await Promise.all([read('yb_events', { select: EV_SELECT, filter, order: 'starts_at.asc' }),
        read('yb_attendance', { select: 'event_id,team_id,rsvp,presence,late_minutes' })]);
      if (!e.ok) { M.err = YB.errorText(e.error); M.loaded = true; return; }
      M.err = ''; M.events = e.data || []; M.att = a.ok ? (a.data || []) : []; M.loaded = true;
    }
    async function refresh(msg, focusKey) { await load(); paint(focusKey); if (msg) say(msg); }
    function form(ev) {
      const p = ev ? localParts(ev.starts_at) : { date: '', time: '16:00' };
      const id = uid('evf');
      const comp = h('select', { id: id + 'c', class: 'a-select', name: 'competition' }, comps.map(c => h('option', { value: c, selected: ev ? ev.competition === c : false, text: COMPS[c] || c })));
      const kind = h('select', { id: id + 'k', class: 'a-select', name: 'kind' }, Object.keys(KINDS).map(k => h('option', { value: k, selected: ev ? ev.kind === k : k === 'match', text: KINDS[k] })));
      const title = field({ label: 'العنوان', name: 'title', required: true, max: 80, value: ev ? ev.title : '', hint: 'مثل: الجولة الأولى، ورشة القيادة، تسميع الآيات 1–9. لا تكتب اسم طفل.' });
      const date = field({ label: 'التاريخ', name: 'date', type: 'date', required: true, value: p.date, dir: 'ltr' });
      const time = field({ label: 'الساعة', name: 'time', type: 'time', required: true, value: p.time, dir: 'ltr' });
      const place = field({ label: 'المكان', name: 'place', max: 80, value: ev && ev.place ? ev.place : '' });
      const cat = field({ label: 'الفئة (اختيارية)', name: 'category', max: 40, value: ev && ev.category ? ev.category : '', hint: 'مثل: المجموعة أ، الفئة العمرية، الدور الأول.' });
      const note = field({ label: 'ملاحظة (اختيارية)', name: 'note', max: 300, value: ev && ev.note ? ev.note : '' });
      const chosen = new Set(ev ? ev.team_ids || [] : []);
      const tlist = teams();
      const tbox = h('fieldset', { class: 'a-comps a-evteams' }, h('legend', { text: 'الفرق المعنية' }),
        tlist.length ? tlist.map(t => h('label', { class: 'a-check' }, h('input', { type: 'checkbox', value: t.id, checked: chosen.has(t.id) }), h('span', { text: t.name })))
          : h('small', { class: 'a-hint', text: 'لا توجد فرق معتمدة بعد.' }),
        h('small', { class: 'a-hint', text: 'إن لم تختر فريقًا يشمل الموعد كل الفرق المعتمدة.' }));
      const f = h('form', { class: 'a-form a-evform', 'aria-label': ev ? 'تعديل الموعد' : 'إضافة موعد' },
        h('div', { class: 'a-grid2' },
          comps.length > 1 ? h('label', { class: 'a-f', for: id + 'c' }, h('span', { class: 'a-l', text: 'المسابقة' }), comp) : null,
          h('label', { class: 'a-f', for: id + 'k' }, h('span', { class: 'a-l', text: 'النوع' }), kind)),
        title, h('div', { class: 'a-grid2' }, date, time), place, cat, tbox, note,
        h('div', { class: 'a-actions' }, submitBtn(ev ? 'حفظ التعديل' : 'أضف الموعد', 'check'),
          h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => { M.editing = null; paint(); } })));
      bind(f, async () => {
        const t = title.input.value.trim();
        if (t.length < 2 || t.length > 80) return showErr(f, 'العنوان من حرفين إلى 80 حرفًا.', title.input);
        if (!date.input.value || !time.input.value) return showErr(f, 'اختر التاريخ والساعة.', date.input);
        const at = new Date(date.input.value + 'T' + time.input.value);
        if (isNaN(at)) return showErr(f, 'التاريخ أو الساعة غير صحيحين.', date.input);
        const row = { competition: comps.length > 1 ? comp.value : comps[0], kind: kind.value, title: t, starts_at: at.toISOString(),
          place: place.input.value.trim() || null, category: cat.input.value.trim() || null, note: note.input.value.trim() || null,
          team_ids: [...tbox.querySelectorAll('input:checked')].map(x => x.value) };
        showErr(f, '');
        const r = ev ? await YB.update('yb_events', { id: 'eq.' + ev.id }, row, { returning: true }) : await YB.insert('yb_events', row, { returning: true });
        if (!wrote(r)) { if (sessionLost(r)) return; return showErr(f, errMsg(r), title.input); }
        M.editing = null;
        await refresh(ev ? 'حُفظ الموعد، ووصل تنبيه للفرق المعنية إن تغيّر الوقت أو المكان.' : 'أُضيف الموعد، ووصل تنبيه للفرق المعنية.', 'evadd-' + fk);
      });
      return f;
    }
    function attendance(ev) {
      const ids = (ev.team_ids || []).length ? ev.team_ids : teams().map(t => t.id);
      const rows = ids.map(tid => {
        const a = M.att.find(x => x.event_id === ev.id && x.team_id === tid) || {};
        const sel = h('select', { class: 'a-select', 'aria-label': 'حضور ' + tname(tid), 'data-fk': `pr-${ev.id}-${tid}` },
          [['', '—'], ['present', 'حضر'], ['absent', 'غاب']].map(o => h('option', { value: o[0], selected: (a.presence || '') === o[0], text: o[1] })));
        const late = h('input', { type: 'number', min: 0, max: 600, class: 'a-late', inputmode: 'numeric', 'aria-label': 'دقائق التأخر لـ ' + tname(tid), value: a.late_minutes === null || a.late_minutes === undefined ? '' : String(a.late_minutes), disabled: a.presence !== 'present' });
        sel.addEventListener('change', () => { late.disabled = sel.value !== 'present'; if (late.disabled) late.value = ''; });
        const save = btn('حفظ', 'check', 'btn-ghost', async () => {
          if (save.dataset.busy) return;
          save.dataset.busy = '1';
          const lm = late.value === '' ? null : num(late.value);
          const r = await YB.rpc('yb_mark_attendance', { event_id: ev.id, team_id: tid, presence: sel.value || null, late_minutes: sel.value === 'present' ? lm : null });
          delete save.dataset.busy;
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await refresh(`سُجّل حضور ${tname(tid)}.`, `pr-${ev.id}-${tid}`);
        }, { 'data-fk': `prs-${ev.id}-${tid}` });
        const rsvp = a.rsvp === 'yes' ? chip('أكّد الحضور', 'ok') : a.rsvp === 'no' ? chip('اعتذر', 'bad') : chip('لم يرد', 'muted');
        return h('li', { class: 'a-attrow', 'data-team': tid }, h('b', { text: tname(tid) }), rsvp, sel, h('label', { class: 'a-latew' }, h('span', { text: 'دقائق التأخر' }), late), save);
      });
      return h('div', { class: 'a-att' }, h('h4', { text: 'حضور الفرق' }), h('ul', { class: 'a-attlist' }, rows), lg2Box());
    }
    function evItem(ev) {
      const open = M.open === ev.id;
      const acts = [btn('تعديل', 'user', 'btn-ghost', () => { M.editing = ev.id; paint(); const f = el.querySelector('.a-evform input'); if (f) f.focus(); }, { 'data-fk': 'eve-' + ev.id }),
        btn(open ? 'إخفاء الحضور' : 'حضور الفرق', 'user-check', 'btn-ghost', () => { M.open = open ? null : ev.id; paint('eva-' + ev.id); }, { 'data-fk': 'eva-' + ev.id, 'aria-expanded': String(open) })];
      if (ev.status !== 'cancelled') acts.push(armed(btn('ألغِ الموعد', 'x', 'btn-ghost btn-danger', () => {}, { 'data-fk': 'evc-' + ev.id }), 'اضغط مرة أخرى لتأكيد الإلغاء', async () => {
        const r = await YB.update('yb_events', { id: 'eq.' + ev.id }, { status: 'cancelled' }, { returning: true });
        if (!wrote(r)) { if (!sessionLost(r)) say(errMsg(r)); return; }
        await refresh('أُلغي الموعد، ووصل تنبيه للفرق المعنية.', 'eva-' + ev.id);
      }));
      const teamsTxt = (ev.team_ids || []).length ? ev.team_ids.map(tname).join(' · ') : 'كل الفرق المعتمدة';
      return h('li', { class: 'a-ev' + (ev.status === 'cancelled' ? ' is-cancelled' : ''), 'data-event': ev.id },
        h('div', { class: 'a-ev-h' }, h('b', { text: ev.title }), evChip(ev.status)),
        h('p', { class: 'a-ev-m', text: [fmtWhen(ev.starts_at), ev.place].filter(Boolean).join(' · ') }),
        h('p', { class: 'a-ev-m', text: [KINDS[ev.kind], COMPS[ev.competition], ev.category, teamsTxt].filter(Boolean).join(' · ') }),
        ev.note ? h('p', { class: 'a-hint', text: ev.note }) : null,
        M.editing === ev.id ? form(ev) : h('div', { class: 'a-actions' }, acts),
        open ? attendance(ev) : null);
    }
    function paint(focusKey) {
      const head = h('h3', { id: 'evm-h-' + fk }, icon('calendar'), h('span', { text: 'المواعيد: ' + comps.map(c => COMPS[c] || c).join('، ') }));
      if (!M.loaded) { el.replaceChildren(head, skeleton()); return; }
      if (M.err) { el.replaceChildren(head, errorBlock(M.err, () => refresh())); return; }
      const up = M.events.filter(e => !isPast(e)), past = M.events.filter(isPast);
      el.replaceChildren(head,
        h('p', { class: 'a-lead', text: 'يصل تنبيه للفرق المعنية عند إضافة موعد أو تغيير وقته أو مكانه أو إلغائه. يظهر الموعد للجميع في «الجدول» بلوحة البطولة.' }),
        M.editing === 'new' ? form(null) : h('div', { class: 'a-actions' }, btn('أضف موعدًا', 'calendar', 'btn-primary', () => { M.editing = 'new'; paint(); const f = el.querySelector('.a-evform input'); if (f) f.focus(); }, { 'data-fk': 'evadd-' + fk })),
        up.length ? h('ul', { class: 'a-evlist' }, up.map(evItem)) : h('p', { class: 'a-empty', text: 'لا توجد مواعيد قادمة.' }),
        past.length ? h('details', { class: 'a-past' }, h('summary', { text: `مواعيد مضت (${past.length})` }), h('ul', { class: 'a-evlist' }, past.slice().reverse().map(evItem))) : null);
      if (focusKey) { const f2 = el.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`); if (f2) f2.focus({ preventScroll: true }); }
    }
    paint();
    load().then(() => paint());
    return { el, refresh };
  }

  // leader / member / parent: the team's coming dates; the leader confirms or declines attendance
  function teamDates(teamId, teamStatus, canRsvp) {
    const el = h('section', { class: 'a-card a-dates', 'aria-label': 'المواعيد القادمة' });
    async function paint(msg, focusKey) {
      const [e, a] = await Promise.all([read('yb_events', { select: EV_SELECT, order: 'starts_at.asc' }),
        canRsvp ? read('yb_attendance', { select: 'event_id,team_id,rsvp', filter: { team_id: 'eq.' + teamId } }) : Promise.resolve({ ok: true, data: [] })]);
      if (!e.ok) { el.hidden = true; return; } // no schedule on this backend yet
      el.hidden = false;
      const mine = (e.data || []).filter(ev => !isPast(ev) && ((ev.team_ids || []).indexOf(teamId) >= 0 || ((ev.team_ids || []).length === 0 && teamStatus === 'approved')));
      const att = a.ok ? (a.data || []) : [];
      const rows = mine.map(ev => {
        const my = att.find(x => x.event_id === ev.id) || {};
        const acts = [];
        if (canRsvp && ev.status !== 'cancelled') {
          const answer = async v => {
            const r = await YB.rpc('yb_rsvp', { event_id: ev.id, team_id: teamId, answer: v });
            if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
            paint(v === 'yes' ? 'سُجّل أن الفريق سيحضر.' : 'سُجّل اعتذار الفريق.', `rsvp-${v}-${ev.id}`);
          };
          acts.push(h('div', { class: 'a-rsvp', role: 'group', 'aria-label': 'هل سيحضر الفريق؟' },
            btn('سنحضر', 'check', my.rsvp === 'yes' ? 'btn-primary' : 'btn-ghost', () => answer('yes'), { 'aria-pressed': String(my.rsvp === 'yes'), 'data-fk': 'rsvp-yes-' + ev.id }),
            btn('نعتذر', 'x', my.rsvp === 'no' ? 'btn-primary' : 'btn-ghost', () => answer('no'), { 'aria-pressed': String(my.rsvp === 'no'), 'data-fk': 'rsvp-no-' + ev.id })));
        }
        return h('li', { class: 'a-ev' + (ev.status === 'cancelled' ? ' is-cancelled' : ''), 'data-event': ev.id },
          h('div', { class: 'a-ev-h' }, h('b', { text: ev.title }), evChip(ev.status)),
          h('p', { class: 'a-ev-m', text: [fmtWhen(ev.starts_at), ev.place].filter(Boolean).join(' · ') }),
          h('p', { class: 'a-ev-m', text: [KINDS[ev.kind], COMPS[ev.competition], ev.category].filter(Boolean).join(' · ') }),
          ev.note ? h('p', { class: 'a-hint', text: ev.note }) : null, acts);
      });
      el.replaceChildren(h('h3', {}, icon('calendar'), h('span', { text: 'المواعيد القادمة' })),
        canRsvp && rows.length ? h('p', { class: 'a-lead', text: 'أكّد حضور فريقك قبل كل موعد. يصلك تنبيه هنا عند أي تغيير.' }) : null,
        rows.length ? h('ul', { class: 'a-evlist' }, rows) : h('p', { class: 'a-empty', text: 'لا توجد مواعيد قادمة لفريقك الآن.' }),
        h('p', { class: 'a-hint' }, h('a', { href: 'tournament.html#schedule', text: 'الجدول الكامل في لوحة البطولة' })));
      if (focusKey) { const f = el.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`); if (f) f.focus({ preventScroll: true }); }
      if (msg) say(msg);
    }
    el.hidden = true;
    paint();
    return el;
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
  const A = { teams: [], members: [], profiles: [], officers: [], state: undefined, tab: 'teams', filter: 'all', q: '', open: {}, notes: {}, pq: '', roleDraft: {}, body: null, me: null };

  async function loadAdmin() {
    const [t, m, p] = await Promise.all([
      read('teams', { select: 'id,name,area,status,admin_note,leader_id,created_at,updated_at,fee_status,fee_receipt,ref_code,waitlist,waitlist_at', order: 'created_at.desc' }),
      read('team_members', { select: 'id,team_id,full_name,age,guardian_name,guardian_phone,is_leader,user_id,consent_status,consent_at,created_at,roles', order: 'created_at.asc' }),
      read('profiles', { select: 'id,email,full_name,role,phone,created_at', order: 'created_at.desc' })]);
    for (const r of [t, m, p]) if (!r.ok) return r;
    A.teams = t.data || []; A.members = m.data || []; A.profiles = p.data || [];
    const o = await read('yb_officers', { select: 'user_id,competition' });
    A.officers = o.ok && Array.isArray(o.data) ? o.data : [];
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
    const c = { draft: 0, submitted: 0, returned: 0, approved: 0, rejected: 0 };
    A.teams.forEach(t => { if (c[t.status] !== undefined) c[t.status]++; });
    const tiles = [['all', 'كل الفرق', A.teams.length]].concat(Object.keys(STATUS).map(k => [k, STATUS[k], c[k]]));
    return h('ul', { class: 'a-counters', 'aria-label': 'عدد الفرق حسب الحالة' }, tiles.map(([k, label, n]) => h('li', {},
      h('button', { type: 'button', class: 'a-count s-' + k, 'aria-pressed': String(A.filter === k), 'data-fk': 'count-' + k, onclick: () => { A.filter = k; A.tab = 'teams'; drawAdmin('count-' + k); } },
        h('b', { text: String(n) }), h('span', { text: label })))));
  }
  function adminTabs() {
    const defs = [['teams', 'الفرق', 'users'], ['people', 'الأشخاص', 'user'], ['schedule', 'الجدول', 'calendar'], ['results', 'النتائج', 'flag'], ['tour', 'لوحة البطولة', 'trophy'], ['export', 'تصدير', 'file-text']];
    const list = h('div', { role: 'tablist', 'aria-label': 'أقسام الإدارة', class: 'a-tabs a-tabs-4 a-tabs-5 a-tabs-6' });
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
    else if (A.tab === 'results') {
      if (!A.res) { A.res = resultsDesk(['football', 'chess'], true, 'ares'); A.res.start(); }
      panel.append(A.res.el);
    }
    else if (A.tab === 'schedule') {
      if (!A.evm) A.evm = eventManager(Object.keys(COMPS), () => A.teams.map(t => ({ id: t.id, name: t.name })), 'adm');
      panel.append(A.evm.el);
    }
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
      body.append(regBar({ id: t.id, name: t.name, fee_status: t.fee_status, fee_receipt: t.fee_receipt, ref_code: t.ref_code, claimed: !!t.leader_id,
        waitlist: t.waitlist, wait_pos: waitPos(t), canMove: true },
        (msg, fk) => refreshAdmin(msg, fk)));
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
      h('div', { class: 'a-mem-h' }, h('b', { text: m.full_name }), m.is_leader ? chip('قائد', 'brand') : null, roleChips(m), isMinor(m.age) ? chip('قاصر', 'muted') : null, m.user_id ? chip('حساب مرتبط', 'ok') : null),
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
  /* fee + online registration (migration 0005): t = {id, name, fee_status, fee_receipt, ref_code, claimed};
     after(message, focusKey) reloads the list it sits in */
  const FEE = { unpaid: 'لم تُسدَّد الرسوم', paid: 'سُدّدت الرسوم', waived: 'معفى من الرسوم' };
  const feeChip = f => chip(FEE[f || 'unpaid'], (f || 'unpaid') === 'unpaid' ? 'sun' : 'ok');
  // member roles (c-form f-nom, migration 0006)
  const ROLE_W = { reciter: 'المرشح الأساسي للتسميع', reserve: 'المرشح الاحتياطي للتسميع', chess: 'لاعب الشطرنج', coord: 'مسؤول التنسيق والتوثيق' };
  const ROLE_ORDER = ['reciter', 'reserve', 'chess', 'coord'];
  const roleChips = m => (Array.isArray(m.roles) ? ROLE_ORDER.filter(k => m.roles.includes(k)).map(k => chip(ROLE_W[k], 'role')) : []);
  // place on the reserve list, in the order the teams joined it (as yb_wait_pos)
  const waitPos = t => {
    if (t.waitlist !== true) return null;
    const line = A.teams.filter(x => x.waitlist === true && x.status !== 'rejected')
      .sort((a, b) => String(a.waitlist_at || '').localeCompare(String(b.waitlist_at || '')) || String(a.created_at).localeCompare(String(b.created_at)));
    return line.findIndex(x => x.id === t.id) + 1 || null;
  };
  const fmtRef = r => (window.YBChecklist ? YBChecklist.fmtRef(r) : String(r || ''));
  function regBar(t, after) {
    const idS = uid('fee'), idR = uid('rc');
    const sel = h('select', { id: idS, 'data-fk': 'fee-' + t.id }, ['unpaid', 'paid', 'waived'].map(k => h('option', { value: k, selected: (t.fee_status || 'unpaid') === k, text: FEE[k] })));
    const rc = h('input', { id: idR, class: 'a-in', maxlength: 40, value: t.fee_receipt || '', placeholder: 'رقم الإيصال (اختياري)', autocomplete: 'off', 'data-fk': 'frc-' + t.id });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const save = btn('احفظ حالة الرسوم', 'check', 'btn-ghost', async () => {
      if (save.disabled) return;
      save.disabled = true;
      const r = await YB.rpc('yb_set_fee', { team_id: t.id, status: sel.value, receipt: rc.value.trim() || null });
      save.disabled = false;
      if (!r.ok) { if (sessionLost(r)) return; msg.textContent = errMsg(r); msg.hidden = false; say(msg.textContent); return; }
      await after(sel.value === 'unpaid' ? `سُجّل أن رسوم ${t.name} لم تُسدَّد.` : `${FEE[sel.value]}: ${t.name}.`, 'fee-' + t.id);
    }, { 'data-fk': 'fsave-' + t.id });
    const out = h('div', { class: 'a-regd', hidden: true });
    const more = btn('تفاصيل الاستمارة', 'file-text', 'btn-ghost', async () => {
      if (!out.hidden) { out.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      const r = await YB.rpc('yb_registration_detail', { team_id: t.id });
      if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
      const d = r.data || {};
      const row = (k, v) => h('div', {}, h('dt', { text: k }), h('dd', {}, v || '—'));
      out.replaceChildren(h('dl', { class: 'a-dl' },
        row('هاتف القائد', d.phone ? h('a', { href: telHref(d.phone), dir: 'ltr', text: d.phone }) : null),
        row('البريد الإلكتروني', d.email ? h('span', { dir: 'ltr', text: d.email }) : null),
        row('المرشح الأساسي للتسميع', d.reciter1), row('المرشح الاحتياطي للتسميع', d.reciter2),
        row('المرشح لبطولة الشطرنج', d.chess), row('مسؤول التنسيق والتوثيق', d.coordinator), row('فكرة النشاط المجتمعي', d.idea)));
      out.hidden = false; more.setAttribute('aria-expanded', 'true');
    }, { 'aria-expanded': 'false', 'data-fk': 'rd-' + t.id });
    return h('div', { class: 'a-reg', 'data-reg-bar': t.id },
      h('div', { class: 'a-chips-row' }, feeChip(t.fee_status),
        t.ref_code ? chip('سُجّل عبر الاستمارة · ' + fmtRef(t.ref_code), 'brand') : null,
        t.ref_code && !t.claimed ? chip('لم يُربط بحساب قائد بعد', 'muted') : null,
        t.waitlist === true ? chip(`قائمة الاحتياط${t.wait_pos ? ' · رقم ' + t.wait_pos : ''}`, 'sun') : null,
        t.waitlist === false ? chip('له مكان بين الفرق الـ12', 'ok') : null),
      t.canMove && (t.waitlist === true || t.waitlist === false) ? h('div', { class: 'a-actions' },
        btn(t.waitlist ? 'امنحه مكانًا الآن' : 'انقله إلى قائمة الاحتياط', 'repeat', 'btn-ghost', async () => {
          const r = await YB.rpc('yb_set_waitlist', { team_id: t.id, waiting: !t.waitlist });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await after(t.waitlist ? `حصل ${t.name} على مكان.` : `نُقل ${t.name} إلى قائمة الاحتياط، وانتقل أول فريق في القائمة إلى مكانه.`, 'wl-' + t.id);
        }, { 'data-fk': 'wl-' + t.id })) : null,
      h('label', { for: idS, class: 'a-l', text: 'رسوم الاشتراك' }),
      h('div', { class: 'a-fee-row' }, sel, h('label', { for: idR, class: 'sr-only', text: 'رقم الإيصال' }), rc, save), msg,
      t.ref_code ? h('div', { class: 'a-regw' }, more, out) : null);
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
    const review = (decision, okMsg) => act(() => YB.rpc('yb_review_team', { team_id: t.id, decision, note: noteVal() }), okMsg);
    const needNote = h('p', { class: 'a-live-msg', role: 'alert', hidden: true, text: 'اكتب في الملاحظة ما المطلوب تعديله، ثم اضغط «إرجاع للتعديل».' });
    const approve = btn('اعتماد', 'check', 'btn-primary', () => review('approve', `اعتُمد فريق ${t.name}.`), { 'data-fk': 'ap-' + t.id });
    const giveBack = btn('إرجاع للتعديل', 'repeat', 'btn-ghost', () => {
      if (!noteVal()) { needNote.hidden = false; say(needNote.textContent); note.focus(); return; }
      needNote.hidden = true;
      review('return', `أُرجع فريق ${t.name} لقائده للتعديل.`);
    }, { 'data-fk': 'rt-' + t.id });
    const reject = armed(btn('رفض', 'x', 'btn-ghost btn-danger', () => {}, { 'data-fk': 'rj-' + t.id }), 'اضغط مرة أخرى لتأكيد الرفض', () => review('reject', `رُفض فريق ${t.name}.`));
    const reopen = btn('إعادة فتح', 'repeat', 'btn-ghost', () => act(() => YB.update('teams', { id: 'eq.' + t.id }, { status: 'draft' }, { returning: true }), `أُعيد فتح فريق ${t.name} للتعديل.`), { 'data-fk': 'ro-' + t.id });
    approve.disabled = !(st === 'submitted' || st === 'returned' || st === 'rejected');
    giveBack.disabled = !(st === 'submitted' || st === 'approved');
    reject.disabled = !(st === 'submitted' || st === 'returned' || st === 'approved');
    reopen.disabled = st === 'draft';
    const bar = h('div', { class: 'a-decide' },
      h('label', { for: idn, class: 'a-l', text: 'ملاحظة للقائد (مطلوبة عند الإرجاع للتعديل)' }), note, needNote,
      h('div', { class: 'a-actions' }, approve, giveBack, reject, reopen),
      st === 'draft' ? h('small', { class: 'a-hint', text: 'ما زال الفريق مسودة: لم يرسله قائده للاعتماد بعد.' }) : null);
    return bar;
  }

  /* --- people */
  function drawAdminPeople(panel) {
    const roles = { admin: 0, officer: 0, leader: 0, member: 0, parent: 0 };
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
      const sel = h('select', { id: sid, class: 'a-select', 'aria-label': 'دور ' + (p.full_name || p.email) }, ['officer', 'leader', 'member', 'parent'].map(k => h('option', { value: k, selected: p.role === k, text: ROLE[k] })));
      const save = btn('حفظ الدور', 'check', 'btn-ghost', async () => {
        if (save.dataset.busy) return;
        save.dataset.busy = '1';
        const r = await YB.rpc('set_user_role', { target: p.id, new_role: sel.value });
        if (!r.ok) { delete save.dataset.busy; if (!sessionLost(r)) say(errMsg(r)); return; }
        await refreshAdmin('تم تغيير الدور.', 'rs-' + p.id);
      }, { disabled: true, 'data-fk': 'rs-' + p.id });
      sel.addEventListener('change', () => { save.disabled = sel.value === p.role; });
      row.append(h('div', { class: 'a-person-a' }, sel, save));
      if (p.role === 'officer') row.append(officerComps(p));
    }
    return row;
  }
  // which competitions an officer runs (admin only; yb_set_officer)
  function officerComps(p) {
    const mine = A.officers.filter(o => o.user_id === p.id).map(o => o.competition);
    const boxes = Object.keys(COMPS).map(k => {
      const cb = h('input', { type: 'checkbox', checked: mine.includes(k), 'data-fk': 'oc-' + p.id + '-' + k });
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        const r = await YB.rpc('yb_set_officer', { target: p.id, competition: k, assign: cb.checked });
        if (!r.ok) { cb.checked = !cb.checked; cb.disabled = false; if (!sessionLost(r)) say(errMsg(r)); return; }
        await refreshAdmin(cb.checked ? `أُسندت «${COMPS[k]}» إلى ${p.full_name || p.email}.` : `أُلغي إسناد «${COMPS[k]}».`, 'oc-' + p.id + '-' + k);
      });
      return h('label', { class: 'a-check' }, cb, h('span', { text: COMPS[k] }));
    });
    return h('fieldset', { class: 'a-comps' }, h('legend', { text: 'المسابقات التي يديرها' }), ...boxes,
      mine.length ? null : h('small', { class: 'a-hint', text: 'لم تُسند إليه مسابقة بعد.' }));
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


  /* ------------------------------------------------------------------ OFFICER (مسؤول المسابقة) */
  // Sees only what the server gives an officer: the competitions assigned to them and, for 'registration', the review
  // queue (team names, counts, roster names and consent ticks: no ages, no guardian data).
  const O = { comps: [], teams: [], pub: [], evm: null, open: {}, roster: {}, notes: {}, body: null };
  async function loadOfficer() {
    const c = await YB.rpc('yb_my_competitions', {});
    if (!c.ok) return c;
    O.comps = (Array.isArray(c.data) ? c.data : []).map(x => (typeof x === 'string' ? x : x && (x.yb_my_competitions || x.competition))).filter(Boolean);
    O.teams = [];
    const pt = await read('public_teams', { select: 'id,name' });
    O.pub = pt.ok ? (pt.data || []) : [];
    if (O.comps.includes('registration')) {
      const q = await YB.rpc('yb_review_list', {});
      if (!q.ok) return q;
      O.teams = Array.isArray(q.data) ? q.data : [];
    }
    O.roles = null;
    if (O.comps.some(k => ['registration', 'hifz', 'fahm', 'chess'].includes(k))) {   // the nominees this officer may see (migration 0006)
      const rl = await YB.rpc('yb_role_list', {});
      O.roles = rl.ok && Array.isArray(rl.data) ? rl.data : null;
    }
    return { ok: true };
  }
  async function viewOfficer(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    mount(sh.el, S.focusNext);
    const r = await loadOfficer();
    if (seq !== S.seq) return;
    if (!r.ok) {
      if (sessionLost(r)) return;
      sh.body.replaceChildren(errorBlock(errMsg(r), () => { sh.body.replaceChildren(skeleton()); route(); }));
      return;
    }
    O.body = sh.body;
    drawOfficer();
  }
  function drawOfficer(focusKey) {
    const nodes = [h('section', { class: 'a-card' }, h('h3', {}, icon('flag'), h('span', { text: 'مسابقاتك' })),
      O.comps.length ? h('ul', { class: 'a-chips' }, O.comps.map(k => h('li', {}, chip(COMPS[k] || k, 'brand'))))
        : h('p', { class: 'a-lead', text: 'لم تُسند إليك مسابقة بعد. يسندها المشرف العام من قسم «الأشخاص».' }))];
    if (O.comps.includes('registration')) nodes.push(reviewQueue());
    if (O.roles) nodes.push(roleListCard());
    const games = O.comps.filter(k => k === 'football' || k === 'chess');
    if (games.length) {
      if (!O.res) { O.res = resultsDesk(games, false, 'ores'); O.res.start(); }
      nodes.push(O.res.el);
    }
    const others = O.comps.filter(k => k !== 'registration');
    if (others.length) {
      if (!O.evm) O.evm = eventManager(others, () => O.pub, 'off');
      nodes.push(O.evm.el);
    }
    O.body.replaceChildren(...nodes);
    if (focusKey) { const f = O.body.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`); if (f) f.focus({ preventScroll: true }); }
  }
  function reviewQueue() {
    const waiting = O.teams.filter(t => t.status === 'submitted').length;
    return h('section', { class: 'a-card', 'aria-labelledby': 'o-q-h' },
      h('h3', { id: 'o-q-h' }, icon('users'), h('span', { text: 'مراجعة طلبات التسجيل' })),
      h('p', { class: 'a-lead', text: waiting ? `${waiting} من الطلبات قيد المراجعة.` : 'لا توجد طلبات قيد المراجعة الآن.' }),
      O.teams.length ? h('div', { class: 'a-list' }, O.teams.map(officerTeam)) : h('p', { class: 'a-empty', text: 'لا توجد فرق بعد.' }));
  }
  function officerTeam(t) {
    const open = !!O.open[t.team_id];
    const toggle = h('button', { type: 'button', class: 'a-team-h', 'aria-expanded': String(open), 'data-fk': 'ot-' + t.team_id,
      onclick: async () => {
        O.open[t.team_id] = !open;
        if (!open && !O.roster[t.team_id]) {
          const r = await YB.rpc('yb_review_roster', { team_id: t.team_id });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); O.open[t.team_id] = false; return; }
          O.roster[t.team_id] = Array.isArray(r.data) ? r.data : [];
        }
        drawOfficer('ot-' + t.team_id);
      } },
      h('span', { class: 'a-team-n' }, h('b', { text: t.team_name }), t.area ? h('small', { text: t.area }) : null),
      h('span', { class: 'a-team-m' }, statusChip(t.status), h('small', { text: `${t.members} من ${MAX} أعضاء · موافقات مستلمة ${t.consents} من ${t.members}` })));
    const card = h('article', { class: 'a-team' + (open ? ' open' : '') }, toggle);
    if (open) {
      const ro = O.roster[t.team_id] || [];
      card.append(h('ul', { class: 'a-roster a-roster-ro' }, ro.map(m => h('li', { class: 'a-mem' },
        h('div', { class: 'a-mem-h' }, h('b', { text: m.full_name }), m.is_leader ? chip('قائد', 'brand') : null,
          chip(m.consent_status === 'received' ? 'استُلمت الموافقة' : 'لم تُستلم الموافقة', m.consent_status === 'received' ? 'ok' : 'muted'))))));
      if (t.admin_note) card.append(h('p', { class: 'a-note' }, h('b', { text: 'آخر ملاحظة: ' }), t.admin_note));
      card.append(regBar({ id: t.team_id, name: t.team_name, fee_status: t.fee_status, fee_receipt: t.fee_receipt, ref_code: t.ref_code, claimed: t.claimed,
        waitlist: t.waitlist, wait_pos: t.wait_pos, canMove: false },
        async (msg, fk) => { const l = await loadOfficer(); if (!l.ok) { if (!sessionLost(l)) say(errMsg(l)); return; } drawOfficer(fk); say(msg); }));
      card.append(officerDecision(t));
    }
    return card;
  }
  function officerDecision(t) {
    if (t.status !== 'submitted') return h('p', { class: 'a-hint', text: 'يراجع مسؤول التسجيل الطلبات التي حالتها «قيد المراجعة» فقط.' });
    const idn = uid('onote');
    const note = h('textarea', { id: idn, class: 'a-note-in', rows: 2, maxlength: 500, placeholder: 'تظهر لقائد الفريق مع القرار', value: O.notes[t.team_id] || '', oninput: e => { O.notes[t.team_id] = e.target.value; } });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const bar = h('div', { class: 'a-decide' });
    const go = async (decision, okMsg) => {
      const nv = note.value.trim() || null;
      if (decision === 'return' && !nv) { msg.textContent = 'اكتب في الملاحظة ما المطلوب تعديله.'; msg.hidden = false; say(msg.textContent); note.focus(); return; }
      if (bar.dataset.busy) return;
      bar.dataset.busy = '1';
      const r = await YB.rpc('yb_review_team', { team_id: t.team_id, decision, note: nv });
      if (!r.ok) { delete bar.dataset.busy; if (sessionLost(r)) return; msg.textContent = errMsg(r); msg.hidden = false; say(msg.textContent); return; }
      delete O.notes[t.team_id]; delete O.roster[t.team_id];
      const l = await loadOfficer();
      if (!l.ok) { if (!sessionLost(l)) say(errMsg(l)); return; }
      drawOfficer('ot-' + t.team_id);
      say(okMsg);
    };
    bar.append(h('label', { for: idn, class: 'a-l', text: 'ملاحظة للقائد (مطلوبة عند الإرجاع للتعديل)' }), note, msg,
      h('div', { class: 'a-actions' },
        btn('اعتماد', 'check', 'btn-primary', () => go('approve', `اعتُمد فريق ${t.team_name}.`), { 'data-fk': 'oap-' + t.team_id }),
        btn('إرجاع للتعديل', 'repeat', 'btn-ghost', () => go('return', `أُرجع فريق ${t.team_name} لقائده للتعديل.`), { 'data-fk': 'ort-' + t.team_id }),
        armed(btn('رفض', 'x', 'btn-ghost btn-danger', () => {}, { 'data-fk': 'orj-' + t.team_id }), 'اضغط مرة أخرى لتأكيد الرفض', () => go('reject', `رُفض فريق ${t.team_name}.`))));
    return bar;
  }

  /* ------------------------------------------------------------------ RESULTS (migration 0007)
     The officer enters the live score, cards, scorers and «روح الفريق», then finishes the match; the admin approves it
     (the board is published with the result in the same step) or sends it back with a note. Only approved results
     reach the board and its standings. comps: the games this desk handles; admin: shows the approval queue. */
  const RES_W = { live: 'جارية الآن', final: 'بانتظار الاعتماد', returned: 'أعادتها الإدارة', approved: 'معتمدة' };
  const resChip = s => chip(RES_W[s] || 'لم تبدأ', { live: 'bad', final: 'sun', returned: 'sun', approved: 'ok' }[s] || 'muted');
  function resultsDesk(comps, admin, fk) {
    const YT = window.YTour;   // the tournament engine (js/tournament-engine.js)
    const R = { st: null, at: null, rows: [], open: null, roster: {}, marks: [], busy: false, err: '' };
    const el = h('section', { class: 'a-card a-res', 'data-results': '', 'aria-labelledby': fk + '-res-h' });
    const nmOf = id => { const t = R.st && (R.st.teams || []).find(x => x.id === id); return t ? t.name : '—'; };
    const rowOf = (comp, key) => R.rows.find(x => x.comp === comp && x.match_key === key);
    const minOf = x => { const t = Date.parse((x && x.started_at) || ''); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60000)); };
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    async function load() {
      let g = null;
      try { g = await YB.getState(); } catch (e) { g = null; }
      R.st = g && g.state ? YT.normalize(g.state) : null;
      R.at = g ? g.updated_at : null;
      const q = await YB.rpc('yb_results_queue', {});
      R.rows = q.ok && Array.isArray(q.data) ? q.data : [];
      R.err = q.ok ? '' : errMsg(q);
    }
    async function loadMarks() {
      R.marks = [];
      if (!R.open) return;
      const [comp, key] = [R.open.slice(0, R.open.indexOf('/')), R.open.slice(R.open.indexOf('/') + 1)];
      if (!rowOf(comp, key)) return;
      const r = await YB.rpc('yb_match_marks_of', { comp, match_key: key });
      R.marks = r.ok && Array.isArray(r.data) ? r.data : [];
    }
    async function loadRoster(team) {
      if (R.roster[team]) return;
      const r = await YB.rpc('yb_match_roster', { comp: 'football', team_id: team });
      R.roster[team] = r.ok && Array.isArray(r.data) ? r.data : [];
    }
    async function refresh(msg, focus) {
      await load();
      await loadMarks();
      paint();
      if (msg) say(msg);
      if (focus) focusFk(focus);
    }
    function fbMatches() {
      if (!R.st) return [];
      let fb;
      try { fb = YT.football(R.st); } catch (e) { return []; }
      const out = [];
      (fb.groups || []).forEach(g => g.rounds.forEach(rd => rd.matches.forEach(m => { if (m.a && m.b) out.push({ m, label: `المجموعة ${g.name} · الجولة ${rd.round}` }); })));
      if (fb.final) fb.final.rounds.forEach(rd => rd.matches.forEach(m => { if (m.a && m.b) out.push({ m, label: `التصفيات · الجولة ${rd.round}` }); }));
      return out;
    }
    function chMatches() {
      if (!R.st) return [];
      let ch;
      try { ch = YT.chess(R.st); } catch (e) { return []; }
      const out = [];
      ['r1', 'r2'].forEach((st, si) => ((ch[st] && ch[st].matches) || []).forEach((m, i) => { if (m.a && m.b) out.push({ key: `w:${st}:${i}`, a: m.a, b: m.b, w: m.w, label: `الجولة ${si + 1}` }); }));
      ((ch.rr && ch.rr.matches) || []).forEach(m => { if (m.a && m.b) out.push({ key: 'rr:' + YT.pairKey(m.a, m.b), a: m.a, b: m.b, w: m.w, label: 'دوري الثلاثة' }); });
      if (ch.final && ch.final.a && ch.final.b) out.push({ key: 'final', a: ch.final.a, b: ch.final.b, w: ch.final.w, label: 'النهائي' });
      return out;
    }
    const scoreOf = (x, a) => (x.a === a ? [x.sa, x.sb] : [x.sb, x.sa]);
    function scoreText(x) {
      return x.comp === 'chess' ? `${nmOf(x.a)} ضد ${nmOf(x.b)} · الفائز: ${nmOf(x.sa > x.sb ? x.a : x.b)}` : `${nmOf(x.a)} ${x.sa} – ${x.sb} ${nmOf(x.b)}`;
    }

    /* the admin's queue */
    function queueBox() {
      const wait = R.rows.filter(x => x.status === 'final');
      return h('div', { class: 'a-res-q', 'data-res-queue': '' }, h('h4', { text: `بانتظار اعتمادك (${wait.length})` }),
        wait.length ? h('ul', { class: 'a-res-l' }, wait.map(qItem)) : h('p', { class: 'a-hint', text: 'لا نتائج تنتظر الاعتماد.' }));
    }
    function qItem(x) {
      const id = x.comp + '-' + x.match_key;
      const note = h('textarea', { class: 'a-note-in', rows: 2, maxlength: 300, placeholder: 'ملاحظة عند الإعادة للمسؤول', 'aria-label': 'ملاحظة الإعادة' });
      const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      return h('li', { class: 'a-res-i', 'data-res': x.match_key },
        h('div', { class: 'a-res-h' }, chip(x.comp === 'chess' ? 'الشطرنج' : 'كرة القدم', 'brand'), h('b', { text: scoreText(x) })),
        x.comp === 'football' ? h('small', { class: 'a-hint', text: `البطاقات: ${x.ca} / ${x.cb} (الحمراء ${x.ra} / ${x.rb}) · أهداف بأسماء أصحابها: ${x.goals} · «روح الفريق»: ${x.spirit}` }) : null,
        x.note ? h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة المسؤول: ' }), x.note) : null,
        note, msg,
        h('div', { class: 'a-actions' },
          btn('اعتمد وانشر في اللوحة', 'check', 'btn-primary', () => approve(x, msg), { 'data-fk': 'rap-' + id }),
          btn('أعدها للمسؤول', 'repeat', 'btn-ghost', async () => {
            const nv = note.value.trim();
            if (!nv) { msg.textContent = 'اكتب في الملاحظة ما المطلوب مراجعته.'; msg.hidden = false; say(msg.textContent); note.focus(); return; }
            const r = await YB.rpc('yb_result_return', { comp: x.comp, match_key: x.match_key, note: nv });
            if (!r.ok) { if (!sessionLost(r)) { msg.textContent = errMsg(r); msg.hidden = false; } return; }
            await refresh('أُعيدت النتيجة إلى المسؤول.');
          }, { 'data-fk': 'rrt-' + id })));
    }
    async function approve(x, msg) {
      if (R.busy) return;
      R.busy = true;
      const fail = t => { R.busy = false; msg.textContent = t; msg.hidden = false; say(t); };
      let g;
      try { g = await YB.getState(); } catch (e) { return fail(YB.errorText(e)); }
      if (!g || !g.state) return fail('لم تُنشر لوحة البطولة بعد.');
      let S;
      try {
        S = YT.normalize(g.state);
        if (x.comp === 'football') S = YT.setResult(S, { a: x.a, b: x.b, sa: x.sa, sb: x.sb, ca: x.ca, cb: x.cb, ra: x.ra, rb: x.rb });
        else {
          const w = x.sa > x.sb ? x.a : x.b;
          if (x.match_key === 'final') S = YT.setChessFinal(S, w);
          else if (x.match_key.indexOf('rr:') === 0) S = YT.setChessRR(S, x.a, x.b, w);
          else { const p = x.match_key.split(':'); S = YT.setChessWinner(S, p[1], +p[2], w); }
        }
      } catch (e) { return fail('تعذّر تطبيق النتيجة على لوحة البطولة (تغيّرت المباراة أو ترتيبها). راجع اللوحة ثم أعد المحاولة.'); }
      const st = YT.stamp(S, new Date().toISOString());
      (st.teams || []).forEach(t => { delete t.chess; });   // player labels are never published
      const r = await YB.rpc('yb_result_approve', { comp: x.comp, match_key: x.match_key, state: st, prev: g.updated_at });
      R.busy = false;
      if (!r.ok) { if (!sessionLost(r)) fail(errMsg(r)); return; }
      if (r.data && r.data.conflict) return fail('تغيّرت لوحة البطولة للتو. اضغط «اعتمد» مرة أخرى.');
      await refresh('اعتُمدت النتيجة ونُشرت في لوحة البطولة.');
    }

    /* football: live entry */
    function fbBox() {
      const open = fbMatches().filter(o => !o.m.res);
      return h('div', { class: 'a-res-fb', 'data-res-fb': '' }, h('h4', { text: 'مباريات كرة القدم' }),
        open.length ? h('ul', { class: 'a-list a-res-l' }, open.map(fbItem))
          : h('p', { class: 'a-hint', text: 'لا مباريات مفتوحة: تظهر هنا المباريات التي تحدد طرفاها ولم تُعتمد نتيجتها.' }));
    }
    function fbItem(o) {
      const m = o.m, key = YT.pairKey(m.a, m.b), x = rowOf('football', key);
      const isOpen = R.open === 'football/' + key;
      const s = x ? scoreOf(x, m.a) : null;
      const head = h('button', { type: 'button', class: 'a-team-h', 'aria-expanded': String(isOpen), 'data-fk': 'rfx-' + key,
        onclick: async () => {
          R.open = isOpen ? null : 'football/' + key;
          if (!isOpen) { await Promise.all([loadRoster(m.a), loadRoster(m.b)]); await loadMarks(); }
          paint(); focusFk('rfx-' + key);
        } },
        h('span', { class: 'a-team-t' }, h('b', { text: `${nmOf(m.a)} ضد ${nmOf(m.b)}` }), h('small', { text: o.label })),
        h('span', { class: 'a-team-m' }, resChip(x && x.status), s ? h('small', { dir: 'rtl', text: `${s[0]} – ${s[1]}` }) : null), icon('chevron-down'));
      return h('article', { class: 'a-team' + (isOpen ? ' open' : ''), 'data-fx': key }, head, isOpen ? livePanel(m, key, x) : null);
    }
    function livePanel(m, key, x) {
      const v = x ? { sa: x.sa, sb: x.sb, ca: x.ca, cb: x.cb, ra: x.ra, rb: x.rb } : { sa: 0, sb: 0, ca: 0, cb: 0, ra: 0, rb: 0 };
      if (x && x.a !== m.a) { [v.sa, v.sb, v.ca, v.cb, v.ra, v.rb] = [v.sb, v.sa, v.cb, v.ca, v.rb, v.ra]; }
      const noteIn = h('textarea', { class: 'a-note-in', rows: 2, maxlength: 200, placeholder: 'ملاحظة للإدارة (اختيارية)', 'aria-label': 'ملاحظة للإدارة', value: (x && x.note) || '' });
      const save = async (patch, status, extra, focus) => {
        if (R.busy) return false;
        R.busy = true;
        const n = Object.assign({}, v, patch);
        const r = await YB.rpc('yb_live_set', Object.assign({ comp: 'football', match_key: key, a: m.a, b: m.b, sa: n.sa, sb: n.sb, ca: n.ca, cb: n.cb, ra: n.ra, rb: n.rb,
          status: status || 'live', note: noteIn.value.trim() || null, start: false, a_name: nmOf(m.a), b_name: nmOf(m.b) }, extra || {}));
        R.busy = false;
        if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return false; }
        await refresh(null, focus);
        return true;
      };
      if (!x) {
        return h('div', { class: 'a-lv' }, h('p', { class: 'a-lead', text: 'عند صافرة البداية اضغط «ابدأ المباراة»: يظهر للجميع أنها جارية مع عدّاد الدقائق.' }),
          h('div', { class: 'a-actions' }, btn('ابدأ المباراة', 'flag', 'btn-primary', () => save({}, 'live', { start: true }, 'rsc-a-' + key), { 'data-fk': 'rstart-' + key })));
      }
      if (x.status === 'approved') return h('div', { class: 'a-lv' }, h('p', { class: 'a-hint', text: 'اعتمدت الإدارة هذه النتيجة. يعدّلها المشرف العام من لوحة البطولة، ويُسجَّل كل تعديل.' }));
      const waiting = x.status === 'final';
      const min = minOf(x);
      const side = (t, sk, ck, rk, tag) => {
        const sel = h('select', { 'aria-label': 'صاحب الهدف من ' + nmOf(t), 'data-fk': 'rsel-' + tag + '-' + key },
          h('option', { value: '', text: 'هدف بلا اسم' }), (R.roster[t] || []).map(p => h('option', { value: p.member_id, text: p.full_name })));
        const spSel = h('select', { 'aria-label': '«روح الفريق» من ' + nmOf(t), 'data-fk': 'rsp-' + tag + '-' + key },
          h('option', { value: '', text: 'اختر لاعبًا' }), (R.roster[t] || []).map(p => h('option', { value: p.member_id, text: p.full_name })));
        const step = (k, d, max, label, fkk) => btn(label, null, 'btn-ghost a-step', () => {
          const nv = Math.max(0, Math.min(max, v[k] + d));
          if (k === ck && nv < v[rk]) return;   // cards include the reds
          if (k === rk && nv > v[ck]) return;
          if (nv !== v[k]) save({ [k]: nv }, 'live', null, fkk);
        }, { 'data-fk': fkk, disabled: waiting });
        const goal = btn('هدف', 'check', 'btn-primary', async () => {
          if (R.busy) return;
          // the goal is recorded first (with its scorer when one is picked), then the score goes up by one
          const r = await YB.rpc('yb_mark_add', { comp: 'football', match_key: key, team_id: t, kind: 'goal', member_id: sel.value || null, minute: minOf(x) });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await save({ [sk]: Math.min(99, v[sk] + 1) }, 'live', null, 'rgoal-' + tag + '-' + key);
          say(`هدف لـ ${nmOf(t)}.`);
        }, { 'data-fk': 'rgoal-' + tag + '-' + key, disabled: waiting });
        const spirit = btn('امنح «روح الفريق»', 'hand-heart', 'btn-ghost', async () => {
          if (!spSel.value) { say('اختر لاعبًا أولًا.'); spSel.focus(); return; }
          const r = await YB.rpc('yb_mark_add', { comp: 'football', match_key: key, team_id: t, kind: 'spirit', member_id: spSel.value, minute: null });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await refresh(`مُنحت «روح الفريق» في ${nmOf(t)}.`, 'rspb-' + tag + '-' + key);
        }, { 'data-fk': 'rspb-' + tag + '-' + key });
        return h('div', { class: 'a-live-side', 'data-side': tag },
          h('b', { class: 'a-live-t', text: nmOf(t) }),
          h('div', { class: 'a-live-score' }, step(sk, -1, 99, '−', 'rsc-' + tag + '-' + key), h('output', { class: 'a-live-n', text: String(v[sk]), 'aria-label': 'أهداف ' + nmOf(t) }), step(sk, 1, 99, '+', 'rsc+' + tag + '-' + key)),
          h('div', { class: 'a-live-goal' }, sel, goal),
          h('div', { class: 'a-live-cards' }, h('span', { text: `البطاقات ${v[ck]}` }), step(ck, -1, 30, '−', 'rca-' + tag + '-' + key), step(ck, 1, 30, '+', 'rca+' + tag + '-' + key),
            h('span', { text: `منها حمراء ${v[rk]}` }), step(rk, -1, 30, '−', 'rre-' + tag + '-' + key), step(rk, 1, 30, '+', 'rre+' + tag + '-' + key)),
          h('div', { class: 'a-live-goal' }, spSel, spirit));
      };
      const marks = R.marks.filter(k => k.kind === 'goal' || k.kind === 'spirit');
      const mList = marks.length ? h('ul', { class: 'a-roles a-live-marks' }, marks.map(k => h('li', {},
        chip(k.kind === 'goal' ? 'هدف' : '«روح الفريق»', k.kind === 'goal' ? 'ok' : 'role'),
        h('b', { text: (k.full_name || 'بلا اسم') }), h('small', { text: `${nmOf(k.team_id)}${k.minute !== null && k.minute !== undefined ? ' · الدقيقة ' + k.minute : ''}` }),
        btn('حذف', 'x', 'btn-ghost btn-danger', async () => {
          const r = await YB.rpc('yb_mark_del', { id: k.id });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await refresh('حُذف.');
        }, { 'aria-label': 'حذف ' + (k.kind === 'goal' ? 'الهدف' : '«روح الفريق»') })))) : null;
      return h('div', { class: 'a-lv', 'data-live-panel': key },
        h('div', { class: 'a-chips-row' }, resChip(x.status), min !== null && x.status === 'live' ? chip(`الدقيقة ${min}`, 'muted') : null),
        x.return_note ? h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة الإدارة: ' }), x.return_note) : null,
        waiting ? h('p', { class: 'a-hint', text: 'أُرسلت النتيجة للاعتماد. تظهر للجميع «بانتظار الاعتماد» ولا تدخل الترتيب حتى تُعتمد.' }) : null,
        h('div', { class: 'a-live-grid' }, side(m.a, 'sa', 'ca', 'ra', 'a'), side(m.b, 'sb', 'cb', 'rb', 'b')),
        mList, noteIn,
        h('div', { class: 'a-actions' },
          waiting ? btn('عدّل النتيجة', 'repeat', 'btn-ghost', () => save({}, 'live', null, 'rfin-' + key), { 'data-fk': 'rfin-' + key })
            : btn('أنهِ المباراة وأرسلها للاعتماد', 'send', 'btn-primary', async () => { if (await save({}, 'final', null, 'rfx-' + key)) say('أُرسلت النتيجة للاعتماد.'); }, { 'data-fk': 'rfin-' + key })));
    }

    /* chess: report the winner */
    function chBox() {
      const ms = chMatches().filter(c => !c.w);
      return h('div', { class: 'a-res-ch', 'data-res-ch': '' }, h('h4', { text: 'مباريات الشطرنج' }),
        ms.length ? h('ul', { class: 'a-res-l' }, ms.map(c => {
          const x = rowOf('chess', c.key);
          const can = !x || x.status === 'returned' || x.status === 'live';
          return h('li', { class: 'a-res-i', 'data-ch': c.key },
            h('div', { class: 'a-res-h' }, h('b', { text: `${nmOf(c.a)} ضد ${nmOf(c.b)}` }), h('small', { class: 'a-hint', text: c.label }), resChip(x && x.status)),
            x && x.return_note ? h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة الإدارة: ' }), x.return_note) : null,
            can ? h('div', { class: 'a-actions' }, [c.a, c.b].map((t, i) => btn('فاز ' + nmOf(t), 'trophy', 'btn-ghost', async () => {
              const r = await YB.rpc('yb_live_set', { comp: 'chess', match_key: c.key, a: c.a, b: c.b, sa: i === 0 ? 1 : 0, sb: i === 0 ? 0 : 1, status: 'final', a_name: nmOf(c.a), b_name: nmOf(c.b) });
              if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
              await refresh(`سُجّل فوز ${nmOf(t)} وأُرسل للاعتماد.`);
            }, { 'data-fk': 'rch-' + c.key + '-' + i })))
              : h('p', { class: 'a-hint', text: 'أُرسلت للاعتماد.' }));
        })) : h('p', { class: 'a-hint', text: 'لا مباريات شطرنج مفتوحة.' }));
    }

    function paint() {
      const kids = [h('h3', { id: fk + '-res-h' }, icon('flag'), h('span', { text: admin ? 'النتائج: الإدخال المباشر والاعتماد' : 'إدخال النتائج المباشرة' })),
        h('p', { class: 'a-lead', text: 'النتيجة الجارية تظهر للجميع فورًا بعلامة «جارية الآن»، ولا تدخل الترتيب إلا بعد اعتماد الإدارة.' })];
      if (R.err) kids.push(h('p', { class: 'a-live-msg', role: 'alert', text: R.err }));
      if (!R.st) {
        kids.push(h('p', { class: 'a-empty', text: 'لم تُنشر لوحة البطولة بعد. تظهر المباريات هنا بعد القرعة والنشر.' }));
        if (admin && R.rows.some(x => x.status === 'final')) kids.push(queueBox());
      } else {
        if (admin) kids.push(queueBox());
        if (comps.includes('football')) kids.push(fbBox());
        if (comps.includes('chess')) kids.push(chBox());
      }
      kids.push(h('div', { class: 'a-actions' }, btn('تحديث', 'repeat', 'btn-ghost', () => refresh('تم التحديث.', fk + '-res-refresh'), { 'data-fk': fk + '-res-refresh' }),
        h('a', { class: 'btn btn-ghost btn-sm', href: 'tournament.html?screen=1', target: '_blank', rel: 'noopener' }, h('span', { text: 'شاشة العرض' }))));
      el.replaceChildren(...kids);
    }
    return { el, start: async () => { el.replaceChildren(skeleton()); await load(); paint(); } };
  }

  /* ------------------------------------------------------------------ LEADER */
  const L = { team: null, members: [], rs: {}, editing: null, boxes: {}, sched: null, profile: null, adding: false, addForm: null, editTeam: false };
  const editable = () => L.team && (L.team.status === 'draft' || L.team.status === 'submitted' || L.team.status === 'returned');

  async function loadLeader() {
    const r = await YB.rpc('my_team');
    if (!r.ok) return { ok: false, error: r };
    const row = (Array.isArray(r.data) ? r.data : []).find(x => x.my_role === 'leader');
    if (!row) { L.team = null; L.members = []; return { ok: true }; }
    const m = await read('team_members', { select: 'id,team_id,full_name,age,guardian_name,guardian_phone,is_leader,user_id,consent_status,consent_at,roles', filter: { team_id: 'eq.' + row.team_id }, order: 'created_at.asc' });
    if (!m.ok) return { ok: false, error: m.error };
    L.team = row;
    L.members = (m.data || []).sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0));
    L.rs = {};
    const rs = await YB.rpc('yb_my_team_roster_status', {}); // optional: who joined, linked guardians
    if (rs.ok && Array.isArray(rs.data)) rs.data.forEach(x => { L.rs[x.member_id] = x; });
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
    // a team sent from the register page's form (migration 0005): request number + the leader's phone link it here
    const qref = (new URLSearchParams(location.search).get('claim') || '').slice(0, 16);
    const ref = field({ label: 'رقم الطلب', name: 'ref', required: true, max: 16, dir: 'ltr', placeholder: 'YN-XXXX-XXXX', value: qref ? fmtRef(qref.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^YN(?=.{8}$)/, '')) : '' });
    const ph = field({ label: 'هاتف قائد الفريق كما كُتب في الاستمارة', name: 'cphone', type: 'tel', required: true, max: 30, dir: 'ltr', auto: 'tel' });
    const cform = h('form', { class: 'a-form', 'aria-label': 'ربط فريق سُجّل من الاستمارة' }, ref, ph, h('div', { class: 'a-actions' }, submitBtn('اربط الفريق بحسابي', 'link')));
    bind(cform, async () => {
      const rv = ref.input.value.trim(), pv = ph.input.value.trim();
      if (!rv) return showErr(cform, 'اكتب رقم الطلب كما ظهر بعد الإرسال.', ref.input);
      if (pv.replace(/\D/g, '').length < 7) return showErr(cform, 'اكتب رقم هاتف القائد كما كتبته في الاستمارة.', ph.input);
      showErr(cform, '');
      const r = await YB.rpc('yb_claim_team', { ref: rv, phone: pv });
      if (!r.ok) { if (sessionLost(r)) return; return showErr(cform, errMsg(r, { not_found: 'لم نجد طلبًا بهذا الرقم وهذا الهاتف. اكتبهما كما ظهرا عند الإرسال.' }), ref.input); }
      const l = await loadLeader();
      if (!l.ok) return showErr(cform, YB.errorText(l.error));
      say(`رُبط ${(r.data && r.data.team_name) || 'الفريق'} بحسابك.`);
      if (L.team) drawLeader(true);
    });
    const claimCard = h('section', { class: 'a-card', 'data-claim': '' }, h('h3', {}, icon('link'), h('span', { text: 'سجّلت فريقك من استمارة الموقع؟' })),
      h('p', { class: 'a-lead', text: 'اكتب رقم الطلب ورقم هاتف القائد، فيصبح الفريق تحت حسابك: تدير الأعضاء وتصلك التنبيهات.' }), cform);
    const createCard = h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'أنشئ فريقك' })),
      h('p', { class: 'a-lead', text: 'ليس لديك فريق بعد. اكتب اسم الفريق والحي، وبعدها تضيف الأعضاء وتحصل على رمز الانضمام.' }), form);
    body.replaceChildren(...(qref ? [claimCard, createCard] : [createCard, claimCard]));
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
    L.dates = teamDates(t.team_id, t.status, true);
    L.boxes.check = h('section', { class: 'a-card a-checkcard', 'aria-labelledby': 'l-check-h', hidden: true });
    L.boxes.roles = h('section', { class: 'a-card', 'aria-labelledby': 'l-roles-h', 'data-roles': '' });
    L.boxes.marks = h('section', { class: 'a-card', 'aria-labelledby': 'l-marks-h', 'data-marks': '', hidden: true });
    body.replaceChildren(L.boxes.top, L.boxes.check, L.dates, L.boxes.marks, L.boxes.roster, L.boxes.roles, L.boxes.code, L.sched.node, L.printBox);
    paintLeader();
    startSchedule([L.sched]);
    if (focus) { const f = L.boxes.top.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
  }
  function paintLeader() { paintTop(); paintCheck(); paintMarks(); paintRoster(); paintRoles(); paintCode(); paintPrint(); }
  // «هدّافو فريقنا» and «روح الفريق» (yb_my_marks, migration 0007): names only for the team's own people; approved
  // matches count, waiting ones are shown apart
  async function paintMarks() {
    const box = L.boxes.marks, team = L.team;
    if (!box || !team) return;
    const r = await YB.rpc('yb_my_marks', {});
    if (L.team !== team || L.boxes.marks !== box) return;
    const rows = r.ok && Array.isArray(r.data) ? r.data.filter(x => x.team_id === team.team_id) : [];
    if (!rows.length) { box.hidden = true; return; }
    const tally = (kind, approved) => {
      const m = new Map();
      rows.filter(x => x.kind === kind && (x.status === 'approved') === approved).forEach(x => { const n = x.full_name || 'بلا اسم'; m.set(n, (m.get(n) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
    };
    const goals = tally('goal', true), spirit = tally('spirit', true), waiting = rows.filter(x => x.status !== 'approved').length;
    const list = (pairs, unit) => h('ul', { class: 'a-roles' }, pairs.map(([n, c]) => h('li', {}, h('b', { text: n }), chip(`${c} ${unit}`, unit === 'هدف' ? 'ok' : 'role'))));
    box.replaceChildren(h('h3', { id: 'l-marks-h' }, icon('trophy'), h('span', { text: 'هدّافو فريقنا و«روح الفريق»' })),
      goals.length ? list(goals, 'هدف') : h('p', { class: 'a-hint', text: 'لا أهداف معتمدة بأسماء أصحابها بعد.' }),
      spirit.length ? [h('h4', { class: 'a-sub', text: '«روح الفريق»' }), list(spirit, 'مرة')] : null,
      waiting ? h('p', { class: 'a-hint', text: `${waiting} من التسجيلات في مباريات لم تُعتمد نتيجتها بعد، وتُحتسب بعد الاعتماد.` }) : null,
      h('p', { class: 'a-hint', text: 'تظهر الأسماء لفريقكم فقط؛ يرى العموم عدد الأهداف دون أسماء.' }));
    box.hidden = false;
  }
  // who represents the team (c-form f-nom): the two reciters, the chess player, the coordinator (migration 0006)
  function paintRoles() {
    const box = L.boxes.roles;
    if (!box) return;
    const ms = L.members;
    const holder = k => ms.find(m => Array.isArray(m.roles) && m.roles.includes(k));
    const head = h('h3', { id: 'l-roles-h' }, icon('flag'), h('span', { text: 'المرشحون والأدوار' }));
    if (!editable()) {
      box.replaceChildren(head, h('ul', { class: 'a-roles' }, ROLE_ORDER.map(k => { const m = holder(k); return h('li', {}, h('b', { text: ROLE_W[k] + ': ' }), m ? m.full_name : '—'); })),
        h('p', { class: 'a-hint', text: 'تُعدَّل الأدوار بعد الاعتماد عن طريق مسؤول التسجيل.' }));
      return;
    }
    const sels = {};
    const rows = ROLE_ORDER.map(k => {
      const id = uid('role'), cur = holder(k);
      sels[k] = h('select', { id, 'data-role': k }, h('option', { value: '', text: '— لم يُحدَّد —' }),
        ms.map(m => h('option', { value: m.id, selected: !!cur && cur.id === m.id, text: m.full_name })));
      return h('div', { class: 'a-f' }, h('label', { for: id, class: 'a-l', text: ROLE_W[k] }), sels[k]);
    });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const save = btn('احفظ الأدوار', 'check', 'btn-primary', async () => {
      const v = k => sels[k].value || null;
      if (v('reciter') && v('reciter') === v('reserve')) { msg.textContent = 'المرشح الأساسي والاحتياطي للتسميع يجب أن يكونا عضوين مختلفين.'; msg.hidden = false; say(msg.textContent); return; }
      if (save.disabled) return;
      save.disabled = true;
      const r = await YB.rpc('yb_set_roles', { team_id: L.team.team_id, reciter: v('reciter'), reserve: v('reserve'), chess: v('chess'), coord: v('coord') });
      save.disabled = false;
      if (!r.ok) { if (sessionLost(r)) return; msg.textContent = errMsg(r); msg.hidden = false; say(msg.textContent); return; }
      await reloadLeader('حُفظت الأدوار.');
    }, { 'data-fk': 'roles-save' });
    box.replaceChildren(head,
      h('p', { class: 'a-lead', text: 'اختر من أعضاء الفريق من يمثّله في تسميع سورة الصف وفي بطولة الشطرنج، ومن ينسّق ويوثّق. تراها إدارة المسابقة ومسؤولو المسابقات فقط.' }),
      h('div', { class: 'a-grid2' }, rows), msg, h('div', { class: 'a-actions' }, save));
  }
  // the officers' nominee lists (yb_role_list): grouped by team, approved teams first
  function roleListCard() {
    const by = new Map();
    O.roles.forEach(r => {
      if (!by.has(r.team_id)) by.set(r.team_id, { name: r.team_name, status: r.team_status, rows: [] });
      by.get(r.team_id).rows.push(r);
    });
    const line = r => h('li', {}, h('b', { text: r.full_name }), ' ', (r.roles || []).map(k => chip(ROLE_W[k] || k, 'role')));
    const card = g => h('article', { class: 'a-rolecard' },
      h('div', { class: 'a-team-top' }, h('b', { text: g.name }), statusChip(g.status)),
      h('ul', { class: 'a-roles' }, g.rows.map(line)));
    const body = by.size ? h('div', { class: 'a-list' }, [...by.values()].map(card))
      : h('p', { class: 'a-empty', text: 'لم يُحدَّد المرشحون في الفرق المشاركة بعد.' });
    return h('section', { class: 'a-card', 'data-role-list': '' }, h('h3', {}, icon('users'), h('span', { text: 'المرشحون من الفرق' })), body);
  }
  // the team checklist (fee, consents, approval, draw, next date) from yb_team_checklist (migration 0005)
  async function paintCheck() {
    const box = L.boxes.check, team = L.team;
    if (!box || !team || !window.YBChecklist) return;
    const r = await YB.rpc('yb_team_checklist', { team_id: team.team_id });
    if (L.team !== team || L.boxes.check !== box) return;
    if (!r.ok || !r.data || typeof r.data !== 'object') { box.hidden = true; return; }
    box.replaceChildren(h('h3', { id: 'l-check-h' }, icon('check'), h('span', { text: 'خطوات اعتماد فريقك' })), YBChecklist.render(r.data));
    box.hidden = false;
  }

  function statusText(t) {
    return ({
      draft: 'الفريق مسودة. أضف أعضاءه ثم أرسله للاعتماد.',
      submitted: 'طلب الفريق قيد المراجعة. ستصلك رسالة هنا عند تغيّر الحالة، ويمكنك سحب الإرسال لتعديل الفريق.',
      returned: 'طلبت الإدارة تعديلات على الفريق. راجع الملاحظة أدناه، عدّل البيانات ثم أعد الإرسال.',
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
    timeline(t.status),
    h('p', { class: 'a-lead', text: statusText(t) })];
    if (t.admin_note) nodes.push(h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة المراجعة: ' }), t.admin_note));
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
      if (t.status === 'draft' || t.status === 'returned') {
        const ok = n >= MIN && n <= MAX;
        const submit = btn(t.status === 'returned' ? 'أعد إرسال الفريق للمراجعة' : 'أرسل الفريق للاعتماد', 'send', 'btn-primary', () => setStatus('submitted'), { 'data-fk': 'submit', disabled: !ok });
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
    await reloadLeader(st === 'submitted' ? 'أُرسل الفريق، وطلبه الآن قيد المراجعة.' : 'سُحب الإرسال، والفريق الآن مسودة.');
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
      h('div', { class: 'a-mem-h' }, h('b', { text: m.full_name }), m.is_leader ? chip('قائد', 'brand') : (m.user_id ? chip('انضم بحسابه', 'ok') : chip('لم ينضم بعد', 'muted')), roleChips(m),
        !m.is_leader && L.rs[m.id] ? (L.rs[m.id].parents > 0 ? chip('ولي الأمر مرتبط بحسابه', 'ok') : chip('لم يرتبط ولي الأمر بعد', 'muted')) : null),
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
      teamDates(row.team_id, row.status, false),
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
      nodes.push(teamDates(k.team_id, k.team_status, false), b.node);
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
    if (S.stopInbox) { S.stopInbox(); S.stopInbox = null; }
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
    if (role === 'officer') return viewOfficer(profile, seq);
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
